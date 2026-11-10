// Controlador del módulo: une simulación, escena, tiempo real y la interfaz.
// El tiempo de simulación avanza separado del dibujo: la pausa detiene el cálculo y el dibujo solo
// muestra el estado calculado. Reiniciar reconstruye el estado inicial exacto desde el escenario.

import { compile, creekPoint } from './sim/compile';
import { ComparePair, indicators, type Indicators } from './sim/compare';
import { CitySim } from './sim/engine';
import { baseInterventions, cloneInterventions, type CityConfig, type Interventions, type Pt, type Scenario, type Shared } from './sim/scenario';
import { TracerSet } from './sim/tracers';
import { allScenarios, builtinScenarios } from './scenarios/index';
import type { Pick, SectorScene, ViewMode } from './render/sectorScene';
import type { NetFilter } from './render/sewerColors';
import type { SectorMap2D } from './render/map2d';
import type { SectorPin, ValleyScene } from './render/valleyScene';
import { SECTOR_SPOTS, toKm } from './render/aburra';
import { setAmbient, startAmbient, stopAmbient } from '../lib/audio';

export type RendererKind = 'webgl' | '2d';
export type RunStatus = 'listo' | 'corriendo' | 'terminado';

export interface Capabilities {
  webgl2: boolean;
  webgpu: boolean;
  cores: number;
  /** Costo medido del cálculo [ms por segundo simulado] en la ladera a 1 m. */
  msPerSimSecond: number;
  recommendedDx: number;
  measuredAt: string;
  /** Nombre del procesador gráfico que informa el navegador (si lo informa). */
  glRenderer: string;
  /** El navegador dibuja por software (sin GPU): se elige la calidad ligera en modo automático. */
  softwareGL: boolean;
}

/** Detección honesta de capacidades: se mide, no se supone. */
export function detectCapabilities(): Capabilities {
  let webgl2 = false;
  let glRenderer = '';
  try {
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2');
    webgl2 = !!gl;
    if (gl) {
      glRenderer = String(gl.getParameter(gl.RENDERER) ?? '');
      if (/^webkit webgl$/i.test(glRenderer)) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
        if (dbg) glRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? glRenderer);
      }
    }
    (gl?.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
  } catch {
    webgl2 = false;
  }
  const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const sc = builtinScenarios()['ladera-quebrada'];
  const sh: Shared = { ...sc.defaults, rain: { ...sc.defaults.rain, intensityMmH: 80 }, simMinutes: 10 };
  const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
  sim.advanceTo(90); // calentamiento: se moja la ladera
  const t0 = performance.now();
  const s0 = sim.t;
  sim.advanceTo(150);
  const ms = (performance.now() - t0) / Math.max(1e-6, sim.t - s0);
  // Objetivo: 30 s simulados por segundo real usando ≤ 35 % del tiempo de cada segundo
  const recommendedDx = ms * 30 > 350 ? 2 : 1;
  const softwareGL = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(glRenderer);
  return { webgl2, webgpu, cores: navigator.hardwareConcurrency || 0, msPerSimSecond: ms, recommendedDx, measuredAt: new Date().toISOString(), glRenderer, softwareGL };
}

export interface ControllerOptions {
  container: HTMLElement;
  reducedMotion: boolean;
  quality: 'alta' | 'ligera';
  renderer: RendererKind;
  sound: boolean;
  onChange: () => void;
  onFinished: () => void;
  reserved: () => DOMRect[];
}

export const PINS: SectorPin[] = [
  { id: 'calle-de-prueba', label: 'Calle de prueba', sub: 'escenario didáctico · ubicación ilustrativa', km: SECTOR_SPOTS['calle-de-prueba'] },
  { id: 'ladera-quebrada', label: 'Ladera con quebrada', sub: 'sector demostrativo · ubicación ilustrativa', km: SECTOR_SPOTS['ladera-quebrada'] },
];

let live = 0;
let created = 0;
declare global {
  interface Window {
    __cityDebug?: { live: number; created?: number; lastDisposed?: { geometries: number; textures: number }; controller?: CityController | null };
  }
}

export class CityController {
  readonly opts: ControllerOptions;
  scale: 'ciudad' | 'sector' = 'ciudad';
  sc: Scenario | null = null;
  shared!: Shared;
  ivA!: Interventions;
  ivB!: Interventions;
  pair: ComparePair | null = null;
  single: CitySim | null = null;
  compare = false;
  show: 'A' | 'B' = 'B';
  status: RunStatus = 'listo';
  paused = false;
  speed = 30;
  pending = false;
  tracers: TracerSet | null = null;
  selection: Pick | null = null;
  probe: Pt | null = null;
  achievedSpeed = 0;
  fps = 0;
  simMsPerFrame = 0;
  overflowT: number | null = null;
  private view: SectorScene | SectorMap2D | null = null;
  private labelsPref = true;
  private orthoPref = true;
  private valley: ValleyScene | null = null;
  private raf = 0;
  private last = 0;
  private target = 0;
  private lastNotify = 0;
  private frames = 0;
  private fpsT = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private sound = false;
  private flying = false;
  private speedSamples: { real: number; sim: number }[] = [];
  /** Cada cambio de escala incrementa la época; las cargas asíncronas viejas se descartan. */
  private epoch = 0;

  constructor(opts: ControllerOptions) {
    this.opts = opts;
    this.ro = new ResizeObserver(() => {
      this.view?.resize();
      this.valley?.resize();
    });
    this.ro.observe(opts.container);
    live++;
    created++;
    window.__cityDebug = { ...(window.__cityDebug ?? { live: 0 }), live, created, controller: this };
    this.setSound(opts.sound);
    this.raf = requestAnimationFrame(this.tick);
  }

  // ------------------------------------------------------------ escalas
  async showValley(): Promise<void> {
    const epoch = ++this.epoch;
    this.disposeView();
    this.scale = 'ciudad';
    this.sc = null;
    this.single = null;
    this.pair = null;
    this.tracers = null;
    this.status = 'listo';
    if (this.opts.renderer === 'webgl') {
      const { ValleyScene } = await import('./render/valleyScene');
      // si mientras se cargaba se eligió otro destino, no se crea esta escena
      if (this.disposed || epoch !== this.epoch) return;
      // Escenarios importados con coordenadas: posición aproximada en el esquema del valle
      const extra: SectorPin[] = Object.values(allScenarios())
        .filter((s) => !PINS.some((p) => p.id === s.id) && s.extent.lonLat)
        .map((s) => {
          const [lon, lat] = s.extent.lonLat!;
          return { id: s.id, label: s.shortTitle, sub: 'datos reales · posición aproximada en el esquema', km: toKm(lon, lat) };
        });
      this.valley = new ValleyScene(this.opts.container, [...PINS.filter((p) => allScenarios()[p.id]), ...extra], { reducedMotion: this.opts.reducedMotion, quality: this.opts.quality });
    }
    this.notify(true);
  }

  /** Entra a un sector (con vuelo de cámara desde el valle si está disponible). */
  enterSector(id: string, cfg: CityConfig | null, done?: () => void, preferDx?: number): void {
    const startEpoch = this.epoch;
    const go = () => {
      this.flying = false;
      if (this.disposed || this.epoch !== startEpoch) return;
      void this.loadSector(id, cfg, preferDx).then(() => {
        if (this.sc?.id === id) done?.();
      });
    };
    if (this.valley && !this.opts.reducedMotion) {
      this.flying = true;
      this.valley.flyTo(id, go);
    } else go();
  }

  private async loadSector(id: string, cfg: CityConfig | null, preferDx?: number): Promise<void> {
    const sc = allScenarios()[id];
    if (!sc) return;
    const epoch = ++this.epoch;
    this.disposeView();
    this.sc = sc;
    this.scale = 'sector';
    if (cfg && cfg.shared.scenarioId === id) {
      this.shared = { ...cfg.shared, rain: { ...cfg.shared.rain } };
      this.ivA = cloneInterventions(cfg.A);
      this.ivB = cloneInterventions(cfg.B);
    } else {
      this.shared = { ...sc.defaults, rain: { ...sc.defaults.rain } };
      // resolución recomendada por la medición del equipo (solo para un sector sin configuración guardada)
      if (preferDx && sc.resolutions.includes(preferDx)) this.shared.dx = preferDx;
      this.ivA = baseInterventions(sc);
      this.ivB = baseInterventions(sc);
    }
    this.compare = false;
    this.show = 'B';
    this.build();
    const c = this.displayed()!.c;
    if (this.opts.renderer === 'webgl') {
      const { SectorScene } = await import('./render/sectorScene');
      if (this.disposed || epoch !== this.epoch) return;
      this.view = new SectorScene(this.opts.container, sc, c, { reducedMotion: this.opts.reducedMotion, quality: this.opts.quality });
      this.view.labels.setEnabled(this.labelsPref);
      this.view.setOrtho(this.orthoPref);
    } else {
      const { SectorMap2D } = await import('./render/map2d');
      if (this.disposed || epoch !== this.epoch) return;
      this.view = new SectorMap2D(this.opts.container, sc, c);
    }
    this.notify(true);
  }

  // ------------------------------------------------------------ configuración y corridas
  config(): CityConfig | null {
    if (!this.sc) return null;
    return { format: 'medellin-lluvia/config', version: 1, shared: { ...this.shared, rain: { ...this.shared.rain } }, A: cloneInterventions(this.ivA), B: cloneInterventions(this.ivB) };
  }

  /** Construye las corridas desde el escenario (estado inicial exacto). */
  private build(): void {
    const sc = this.sc!;
    const opts = {};
    this.overflowT = null;
    if (this.compare) {
      this.pair = new ComparePair(sc, this.shared, this.ivA, this.ivB, opts);
      this.single = null;
    } else {
      this.single = new CitySim(compile(sc, this.shared, this.ivB), this.shared, opts);
      this.pair = null;
    }
    this.target = 0;
    this.status = 'listo';
    this.pending = false;
    this.attachTracers();
    this.applyProbe();
    this.view?.setCompiled(this.displayed()!.c);
  }

  displayed(): CitySim | null {
    if (this.pair) return this.show === 'A' ? this.pair.a : this.pair.b;
    return this.single;
  }

  private sims(): CitySim[] {
    return this.pair ? [this.pair.a, this.pair.b] : this.single ? [this.single] : [];
  }

  /** Cambia la configuración. Si ya hay cálculo en curso, queda pendiente hasta reiniciar. */
  update(patch: { shared?: Partial<Shared>; A?: Interventions; B?: Interventions }): void {
    if (patch.shared) this.shared = { ...this.shared, ...patch.shared, rain: { ...this.shared.rain, ...(patch.shared.rain ?? {}) } };
    if (patch.A) this.ivA = cloneInterventions(patch.A);
    if (patch.B) this.ivB = cloneInterventions(patch.B);
    const sim = this.displayed();
    if (sim && sim.t === 0 && this.status === 'listo') this.build();
    else this.pending = true;
    this.notify(true);
  }

  setCompare(on: boolean): void {
    this.compare = on;
    this.show = 'B';
    this.build();
    this.notify(true);
  }

  setShow(k: 'A' | 'B'): void {
    if (!this.pair) return;
    this.show = k;
    this.attachTracers();
    this.view?.setCompiled(this.displayed()!.c);
    this.notify(true);
  }

  start(): void {
    if (!this.displayed()) return;
    if (this.pending) this.build();
    if (this.status === 'terminado') this.build();
    this.status = 'corriendo';
    this.paused = false;
    this.last = performance.now();
    this.notify(true);
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.last = performance.now();
    this.notify(true);
  }

  reset(): void {
    if (!this.sc) return;
    this.build();
    this.notify(true);
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.notify(true);
  }

  /** Corre todo de inmediato (para resultados de misiones sin esperar). */
  runToEnd(budgetMs = 40): boolean {
    for (const s of this.sims()) s.advanceTo(s.endT, budgetMs / 2);
    const done = this.sims().every((s) => s.finished);
    if (done) this.finish();
    return done;
  }

  private finish(): void {
    if (this.status === 'terminado') return;
    this.status = 'terminado';
    this.notify(true);
    this.opts.onFinished();
  }

  indicators(): { A: Indicators | null; B: Indicators | null } {
    if (this.pair) return { A: indicators(this.pair.a), B: indicators(this.pair.b) };
    return { A: null, B: this.single ? indicators(this.single) : null };
  }

  // ------------------------------------------------------------ herramientas
  private attachTracers(): void {
    for (const s of this.sims()) s.onStep = null;
    const sim = this.displayed();
    if (!sim) {
      this.tracers = null;
      return;
    }
    this.tracers = new TracerSet(sim, this.shared.seed);
    const tr = this.tracers;
    sim.onStep = (dt) => {
      tr.step(dt);
      if (this.overflowT === null) {
        let out = 0;
        for (let q = 0; q < sim.gardenOut.length; q++) out += sim.gardenOut[q];
        if (out > 0.01) this.overflowT = sim.t;
      }
    };
  }

  releaseTracers(x: number, y: number): void {
    this.tracers?.release(x, y, 24, 1.2);
    this.notify(true);
  }

  clearTracers(): void {
    this.tracers?.clear();
    this.notify(true);
  }

  setProbe(p: Pt | null): void {
    this.probe = p;
    this.applyProbe();
    this.view?.setPinned(p ? { id: 'medidor', at: p, text: 'Tu medidor' } : null);
    this.notify(true);
  }

  private applyProbe(): void {
    for (const s of this.sims()) {
      if (!this.probe) s.extraProbe = -1;
      else {
        const { nx, ny, dx } = s.c;
        const i = Math.min(nx - 1, Math.max(0, Math.floor(this.probe[0] / dx)));
        const j = Math.min(ny - 1, Math.max(0, Math.floor(this.probe[1] / dx)));
        const k = j * nx + i;
        s.extraProbe = s.c.solid[k] ? -1 : k;
      }
    }
  }

  pickPin(clientX: number, clientY: number): string | null {
    return this.valley ? this.valley.pick(clientX, clientY) : null;
  }

  pickAt(clientX: number, clientY: number): Pick | null {
    const p = this.view?.pick(clientX, clientY) ?? null;
    this.select(p);
    return p;
  }

  select(p: Pick | null): void {
    this.selection = p;
    this.view?.showHighlight(p && p.kind !== 'building' ? p.x : null, p ? p.y : 0);
    this.notify(true);
  }

  // ------------------------------------------------------------ vista
  setView(v: ViewMode): void {
    this.view?.setView(v);
    this.notify(true);
  }
  viewMode(): ViewMode {
    return this.view?.view ?? 'realista';
  }
  setCut(on: boolean): void {
    this.view?.setCut(on);
    this.notify(true);
  }
  cutOn(): boolean {
    return this.view?.cut ?? false;
  }
  /** Red que se ve bajo la calle y en el esquema: las dos, solo aguas lluvias o solo aguas residuales. */
  setNetFilter(f: NetFilter): void {
    this.view?.setNetFilter(f);
    this.notify(true);
  }
  netFilter(): NetFilter {
    return this.view?.netFilter ?? 'ambas';
  }
  /** Etiquetas de la maqueta del sector (lugares, medidores, daños, redes, gotas). El valle conserva las suyas. */
  setLabels(on: boolean): void {
    this.labelsPref = on;
    if (this.view && 'labels' in this.view) this.view.labels.setEnabled(on);
    this.notify(true);
  }
  labelsOn(): boolean {
    return this.labelsPref;
  }
  /** Foto aérea (ortofoto) sobre el terreno y los techos de un sector real, en la vista realista. */
  setOrtho(on: boolean): void {
    this.orthoPref = on;
    if (this.view && 'setOrtho' in this.view) this.view.setOrtho(on);
    this.notify(true);
  }
  orthoOn(): boolean {
    return this.orthoPref;
  }
  /** El sector mostrado tiene ortofoto. */
  hasOrtho(): boolean {
    return !!this.sc?.imagery;
  }
  setArrows(on: boolean): void {
    if (this.view) this.view.showArrows = on;
    this.notify(true);
  }
  arrowsOn(): boolean {
    return this.view?.showArrows ?? true;
  }
  setAmplify(f: number): void {
    if (this.view) this.view.amplify = f;
    this.notify(true);
  }
  amplify(): number {
    return this.view?.amplify ?? 1;
  }
  /** Agua en la escala azul (analítica) en vez de la natural (agua turbia). Solo en la escena 3D. */
  setWaterBlue(on: boolean): void {
    if (this.view && 'waterBlue' in this.view) this.view.waterBlue = on;
    this.notify(true);
  }
  waterBlue(): boolean {
    return this.view && 'waterBlue' in this.view ? this.view.waterBlue : true;
  }
  camera(cmd: 'general' | 'calle' | 'arriba' | 'valle' | 'izq' | 'der' | 'acercar' | 'alejar'): void {
    if (this.valley) {
      if (cmd === 'general') this.valley.home(true);
      return;
    }
    const v = this.view;
    if (!v) return;
    // las vistas generales vuelven a mostrar los árboles ocultos para mirar la sección
    if (cmd !== 'izq' && cmd !== 'der' && cmd !== 'acercar' && cmd !== 'alejar' && 'setTreeCutaway' in v) v.setTreeCutaway(null);
    if (cmd === 'izq') v.orbit(-20);
    else if (cmd === 'der') v.orbit(20);
    else if (cmd === 'acercar') v.zoom(0.8);
    else if (cmd === 'alejar') v.zoom(1.25);
    else v.goto(cmd, true);
  }
  focus(x: number, y: number): void {
    if (this.view && 'setTreeCutaway' in this.view) this.view.setTreeCutaway(null);
    this.view?.focusOn(x, y);
  }
  /** Mira la boca de entrada de una cobertura desde aguas arriba, en diagonal y algo más alto que la vía. */
  focusCulvert(ci = 0): void {
    const sim = this.displayed();
    const cu = sim?.c.culverts[ci];
    const cs = this.sc?.culverts?.[ci];
    const v = this.view;
    if (!sim || !cu || !cs || !v) return;
    if (!('lookFrom' in v)) {
      this.focus(cs.inlet[0], cs.inlet[1]);
      return;
    }
    const s = cs.inlet[0] < cs.road.x0 ? -1 : 1;
    (v as SectorScene).lookFrom([cs.inlet[0] + s * 7, cs.inlet[1] + 8, cu.crestZ + 5], [cs.inlet[0] - s * 1, cs.inlet[1], cu.zIn + 1.4]);
    this.notify(true);
  }
  /** Mira la sección de control de la quebrada desde aguas abajo, a la altura de la orilla. */
  focusCreekSection(): void {
    const sim = this.displayed();
    const cr = sim?.c.creek;
    const v = this.view;
    if (!cr || !v || !('lookFrom' in v)) {
      if (cr && sim) this.focus(...creekPoint(cr, sim.c.dx, cr.jt));
      return;
    }
    // desde aguas abajo, sobre la quebrada y en diagonal: se ven el cauce, la mira y los frentes de las casas
    // de la orilla
    const [x, y] = creekPoint(cr, sim!.c.dx, cr.jt);
    // sentido del flujo en la sección (del eje de la quebrada): la cámara se pone aguas abajo
    let ux = 1, uy = 0;
    const ax = this.sc?.creek?.axis ?? [];
    let best = Infinity;
    for (let q = 1; q < ax.length; q++) {
      const [x0, y0] = ax[q - 1], [x1, y1] = ax[q];
      const d = Math.hypot((x0 + x1) / 2 - x, (y0 + y1) / 2 - y);
      const L = Math.hypot(x1 - x0, y1 - y0);
      if (d < best && L > 1e-6) {
        best = d;
        ux = (x1 - x0) / L;
        uy = (y1 - y0) / L;
      }
    }
    const nx = -uy, ny = ux;
    const sv = v as SectorScene;
    const W = sim!.c.nx * sim!.c.dx, H = sim!.c.ny * sim!.c.dx;
    const clampIn = (px: number, py: number): [number, number] => [Math.min(W - 1, Math.max(1, px)), Math.max(1, Math.min(H - 1, py))];
    const eye = clampIn(x + 33 * ux + 3 * nx, y + 33 * uy + 3 * ny);
    const tgt: [number, number, number] = [x + 2 * ux + 6.5 * nx, y + 2 * uy + 6.5 * ny, cr.bankLevel + 0.6];
    // altura de la cámara: la que deja ver la sección por encima del terreno y de los techos que hay en medio (en
    // las quebradas encañonadas, a 12 m sobre la orilla la ladera de aguas abajo tapaba el cauce)
    let ez = cr.bankLevel + 12;
    const blocks = (z0: number) => {
      for (let t = 0.08; t < 0.92; t += 0.04) {
        const px = eye[0] + (tgt[0] - eye[0]) * t, py = eye[1] + (tgt[1] - eye[1]) * t;
        const lz = z0 + (tgt[2] - z0) * t;
        if (Math.max(sv.groundAt(px, py), sv.roofAt(px, py)) + 1.2 > lz) return true;
      }
      return false;
    };
    for (let k = 0; k < 20 && blocks(ez); k++) ez += 2;
    // los árboles entre la cámara y la sección se ocultan mientras dura esta vista
    sv.setTreeCutaway([eye, [x - 4 * ux, y - 4 * uy]], 6);
    sv.lookFrom([eye[0], eye[1], ez], tgt);
    this.notify(true);
  }
  isFlying(): boolean {
    return this.flying;
  }
  /** Estado de los efectos de lluvia y agua (para el panel docente); null en el mapa 2D. */
  fxLevels(): { spouts: number; drains: number; outlets: number; tanks: number; rainDrops: number; splashes: number; density: number } | null {
    const v = this.view;
    return v && 'fx' in v ? { ...(v as SectorScene).fx.levels } : null;
  }

  renderInfo(): { geometries: number; textures: number; calls: number; triangles: number } | null {
    return this.view?.info() ?? null;
  }

  setSound(on: boolean): void {
    this.sound = on;
    if (on) startAmbient();
    else stopAmbient();
  }

  // ------------------------------------------------------------ ciclo
  private tick = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const realDt = Math.max(0, (now - (this.last || now)) / 1000);
    // el avance pedido por cuadro se acota (0,25 s real) para no dar saltos tras una pausa del navegador
    const dt = Math.min(0.25, realDt);
    this.last = now;
    this.frames++;
    if (now - this.fpsT > 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsT || 1000);
      this.frames = 0;
      this.fpsT = now;
    }
    if (this.valley) {
      this.valley.render(dt, this.opts.reserved());
      return;
    }
    const sim = this.displayed();
    if (!sim || !this.view) return;
    if (this.status === 'corriendo' && !this.paused) {
      const t0 = performance.now();
      const before = sim.t;
      this.target = Math.min(sim.endT, Math.max(this.target, sim.t) + dt * this.speed);
      // presupuesto de cálculo: ≈35 % del tiempo del cuadro (mínimo 7–10 ms, máximo 40 ms)
      const budget = Math.min(40, Math.max(this.opts.quality === 'alta' ? 10 : 7, realDt * 350));
      if (this.pair) this.pair.advanceTo(this.target, budget);
      else sim.advanceTo(this.target, budget);
      // si el equipo no alcanza, no se acumula atraso: la simulación va más lenta y se informa
      if (this.target - sim.t > 2) this.target = sim.t;
      this.simMsPerFrame = this.simMsPerFrame * 0.9 + (performance.now() - t0) * 0.1;
      // velocidad lograda medida con el reloj real (sin acotar): informa honestamente si el equipo no alcanza
      this.speedSamples.push({ real: realDt, sim: sim.t - before });
      if (this.speedSamples.length > 60) this.speedSamples.shift();
      const r = this.speedSamples.reduce((s, q) => s + q.real, 0);
      this.achievedSpeed = r > 0 ? this.speedSamples.reduce((s, q) => s + q.sim, 0) / r : 0;
      if (this.sims().every((s) => s.finished)) this.finish();
    }
    const raining = this.status === 'corriendo' ? sim.rainAt(sim.t) : 0;
    this.view.setRain(raining);
    this.view.update(sim, this.tracers, this.paused ? 0 : dt);
    this.view.render(this.opts.reserved());
    if (this.sound) {
      const q = sim.samples.length ? sim.samples[sim.samples.length - 1].outletQ : 0;
      setAmbient({ wind: 0.15, rain: Math.min(1, raining / 100), river: Math.min(1, q / 0.2) });
    }
    if (now - this.lastNotify > 250) this.notify();
  };

  private notify(force = false): void {
    this.lastNotify = performance.now();
    if (force || !this.disposed) this.opts.onChange();
  }

  private disposeView(): void {
    if (this.view) {
      this.view.dispose();
      this.view = null;
    }
    if (this.valley) {
      this.valley.dispose();
      this.valley = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    const info = this.view?.info() ?? { geometries: 0, textures: 0 };
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.disposeView();
    for (const s of this.sims()) s.onStep = null;
    this.pair = null;
    this.single = null;
    this.tracers = null;
    if (this.sound) stopAmbient();
    live--;
    window.__cityDebug = { live, created, lastDisposed: { geometries: info.geometries, textures: info.textures }, controller: null };
  }
}

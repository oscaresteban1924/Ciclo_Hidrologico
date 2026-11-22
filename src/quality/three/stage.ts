// Escenario 3D común de las tres partes del módulo de calidad: renderizador, cámara con órbita, luces, cielo,
// selección con clic (sin confundirla con arrastrar), cursor sobre lo que se puede tocar y rótulos HTML que
// siguen a los objetos. Cada parte arma su mundo encima (creekWorld, plantWorld, streetWorld).

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Finisher, LOOK_TIME, SkyDome, lookScene } from '../../three/look';

export interface StageLabel {
  id: string;
  text: string;
  sub?: string;
  at: THREE.Vector3;
  kind?: 'lugar' | 'dato' | 'alerta' | 'ok' | 'sonda';
  /** Mayor = se dibuja primero y gana si dos rótulos se tapan. */
  prio?: number;
  onClick?: () => void;
}

export interface StageView {
  eye: [number, number, number];
  target: [number, number, number];
  /** Ancho del mundo que debe caber de lado a lado [unidades]: en pantallas angostas la cámara se aleja. */
  fit?: number;
  /** Encuadre para pantallas verticales (celular): por ejemplo, la planta en diagonal en vez de a lo ancho. */
  portrait?: Omit<StageView, 'portrait'>;
}

interface Pickable {
  obj: THREE.Object3D;
  onPick: (pt: THREE.Vector3, hit: THREE.Intersection) => void;
  hint?: string;
}

/** Lo que se lee en un punto de la escena: un título y filas (dato, valor); `strong` resalta la fila. */
export interface ProbeInfo {
  title: string;
  rows: [string, string][];
  strong?: number;
}

let kbSeq = 0;

interface Probe {
  obj: THREE.Object3D;
  read: (pt: THREE.Vector3, hit: THREE.Intersection) => ProbeInfo | null;
}

export function hasWebGL(): boolean {
  try {
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    (gl?.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    return !!gl;
  } catch {
    return false;
  }
}

/** Controles que flotan sobre la escena: los rótulos 3D los evitan. */
const OVERLAY_SEL = '.q3-question, .q3-views, .q3-cam, .q3-card, .q3-toast, .q3-tourbar, .q3-hover';

export class QStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly reducedMotion: boolean;
  private container: HTMLElement;
  private labelLayer: HTMLDivElement;
  private labelEls = new Map<string, HTMLElement>();
  private labels: StageLabel[] = [];
  private picks: Pickable[] = [];
  private ray = new THREE.Raycaster();
  private raf = 0;
  private last = 0;
  private time = 0;
  private update: ((dt: number, t: number) => void) | null = null;
  private tween: { from: StageView; to: StageView; t0: number; dur: number; ease?: 'out' } | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private ro: ResizeObserver;
  private disposed = false;
  private hoverAt = 0;
  private probes: Probe[] = [];
  /** Región que anuncia la lectura al lector de pantalla (con el teclado y al tocar). */
  private live: HTMLParagraphElement;
  private liveTimer = 0;
  /** Punto de lectura del teclado (en píxeles del lienzo) y su marca. */
  private kb: { x: number; y: number } | null = null;
  private kbEl: HTMLDivElement | null = null;
  /** Objeto que ya mostró su lectura con un primer toque: el segundo toque actúa. */
  private armed: { obj: THREE.Object3D; at: number } | null = null;
  private probeEl: HTMLDivElement | null = null;
  private probeDot: THREE.Mesh | null = null;
  private probeTimer = 0;
  /** El último punto leído y cómo releerlo (la lectura se refresca mientras la escena cambia). */
  private probeLast: { p: Probe; pt: THREE.Vector3; h: THREE.Intersection; x: number; y: number; at: number } | null = null;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private envRT: THREE.WebGLRenderTarget | null = null;
  readonly sky: SkyDome;
  private finisher: Finisher;
  private looked = new WeakSet<THREE.Material>();
  private frames = 0;
  private introDone = false;
  /** Posición del sol respecto al punto de mira. */
  private sunOffset = new THREE.Vector3(-95, 82, 62);
  private animators: ((t: number, dt: number) => void)[] = [];
  /** Animaciones de ambiente (aves, nubes) que no dependen del estado del mundo. */
  animate(fn: (t: number, dt: number) => void): void {
    this.animators.push(fn);
  }
  /** Se llama con el texto de ayuda del objeto bajo el puntero (o null). */
  onHover: ((hint: string | null) => void) | null = null;

  constructor(container: HTMLElement, opts: { reducedMotion: boolean; sky?: string; fog?: [number, number]; label: string }) {
    this.container = container;
    this.reducedMotion = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // tono neutro (Khronos PBR Neutral): conserva los colores de base sin lavarlos, con altas luces suaves
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    const cv = this.renderer.domElement;
    cv.className = 'q3-canvas';
    cv.tabIndex = 0;
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', opts.label);
    container.appendChild(cv);
    // con el teclado: un punto de lectura que se mueve con las flechas; lo que se lee se anuncia al lector de pantalla
    const help = document.createElement('p');
    help.className = 'sr-only';
    help.id = `q3-kb-${++kbSeq}`;
    help.textContent = 'Con las flechas se mueve un punto de lectura sobre la escena y se leen los datos de ese punto. Enter actúa como un toque. Escape oculta la lectura. Mayúsculas con las flechas gira la vista.';
    container.appendChild(help);
    cv.setAttribute('aria-describedby', help.id);
    this.live = document.createElement('p');
    this.live.className = 'sr-only';
    this.live.setAttribute('aria-live', 'polite');
    container.appendChild(this.live);
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'q3-labels';
    container.appendChild(this.labelLayer);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
    this.controls = new OrbitControls(this.camera, cv);
    this.controls.enableDamping = !opts.reducedMotion;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 420;
    this.controls.screenSpacePanning = false;
    this.controls.listenToKeyEvents(cv);
    this.controls.keyPanSpeed = 18;

    const sky = new THREE.Color(opts.sky ?? '#cfe3ee');
    this.scene.background = sky;
    // cielo con sol y nubes; la niebla toma el color del horizonte para que el fondo y la escena se fundan
    this.sky = new SkyDome({ horizon: '#' + sky.clone().lerp(new THREE.Color('#ffffff'), 0.25).getHexString() });
    this.sky.setSun(this.sunOffset);
    this.scene.add(this.sky.mesh);
    const [fn, ff] = opts.fog ?? [260, 900];
    this.scene.fog = new THREE.Fog(this.sky.horizon.clone(), fn, ff);
    this.hemi = new THREE.HemisphereLight('#dfeeff', '#5f5646', 0.62);
    this.scene.add(this.hemi);
    // reflejos suaves del cielo (agua, metal, vidrio): un cielo de degradé prefiltrado, sin texturas descargadas
    this.envRT = skyEnvironment(this.renderer, sky);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.38;
    this.sun = new THREE.DirectionalLight('#fff0d8', 2.25);
    this.sun.position.set(-60, 120, 80);
    this.scene.add(this.sun, this.sun.target);
    // sombras del sol cerca de lo que se mira (el sol sigue al punto de mira para no perder resolución)
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.4;
    this.sun.shadow.radius = 3;
    this.setShadowSpan(90);
    this.finisher = new Finisher(this.renderer, this.scene, this.camera);

    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerleave', () => {
      cv.style.cursor = '';
      this.onHover?.(null);
      if (!this.kb) this.hideProbe();
    });
    // antes que los controles de la cámara (que usan las flechas para desplazar la vista)
    cv.addEventListener('keydown', this.onKey, { capture: true });
    cv.addEventListener('blur', () => this.hideKb());
    // en desarrollo, la escena queda a mano para las pruebas automáticas (recorrer todas las fichas)
    if (import.meta.env.DEV) (window as unknown as { __q3: QStage }).__q3 = this;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  private skyClear: THREE.Color | null = null;
  /** Tiempo de aguacero (0 despejado, 1 lluvia): cielo y niebla más grises y menos sol. */
  weather(k: number): void {
    const bg = this.scene.background as THREE.Color;
    if (!this.skyClear) this.skyClear = bg.clone();
    bg.copy(this.skyClear).lerp(new THREE.Color('#8f9aa3'), 0.75 * k);
    (this.scene.fog as THREE.Fog).color.copy(this.sky.storm(k));
    this.sun.intensity = 2.25 * (1 - 0.6 * k);
    this.hemi.intensity = 0.62 * (1 + 0.3 * k);
  }

  /** Medio lado del área con sombras alrededor del punto de mira [unidades del mundo]. */
  setShadowSpan(half: number): void {
    const c = this.sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -half;
    c.right = half;
    c.top = half;
    c.bottom = -half;
    c.near = 1;
    c.far = 600;
    c.updateProjectionMatrix();
  }

  /** Tiempo acumulado [s] (se detiene con «movimiento reducido»). */
  get t(): number {
    return this.time;
  }

  start(update: (dt: number, t: number) => void): void {
    this.update = update;
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      if (document.hidden) {
        this.last = now;
        return;
      }
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
      this.last = now;
      this.time += this.reducedMotion ? 0 : dt;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame(dt: number): void {
    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.t0) / this.tween.dur);
      const e = this.tween.ease === 'out' ? 1 - Math.pow(1 - k, 3) : k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const { from, to } = this.tween;
      this.camera.position.set(...(from.eye.map((v, i) => v + (to.eye[i] - v) * e) as [number, number, number]));
      this.controls.target.set(...(from.target.map((v, i) => v + (to.target[i] - v) * e) as [number, number, number]));
      if (k >= 1) this.tween = null;
    }
    this.controls.update();
    const tg = this.controls.target;
    this.sun.target.position.copy(tg);
    // luz principal desde atrás y a un lado de la cámara (como en una foto de estudio): las caras que se miran
    // quedan iluminadas y las sombras caen hacia un lado, marcando el relieve
    const az = Math.atan2(this.camera.position.x - tg.x, this.camera.position.z - tg.z) + 0.95;
    const el = 0.72;
    this.sunOffset.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(150);
    this.sun.position.copy(tg).add(this.sunOffset);
    this.sky.setSun(this.sunOffset);
    LOOK_TIME.value = this.time;
    this.update?.(this.reducedMotion ? 0 : dt, this.time);
    for (const fn of this.animators) fn(this.time, this.reducedMotion ? 0 : dt);
    this.refreshProbe();
    if (this.probeDot?.visible) {
      this.probeDot.quaternion.copy(this.camera.quaternion);
      this.probeDot.scale.setScalar(this.camera.position.distanceTo(this.probeDot.position) * 0.009);
    }
    // el acabado llega a lo que el mundo agregó (se revisa cada medio segundo, más seguido al empezar)
    if (this.frames++ % (this.frames < 120 ? 5 : 30) === 0) lookScene(this.scene, this.looked);
    this.sky.follow(this.camera);
    this.finisher.render();
    this.layoutLabels();
  }

  /** Dibuja un cuadro ya (para las capturas y cuando el mundo cambia con la animación detenida). */
  renderNow(): void {
    this.frame(0);
  }

  /** La vista ajustada a la proporción de la pantalla: si `fit` no cabe de lado a lado, la cámara se aleja. */
  private fitted(input: StageView): StageView {
    const v = input.portrait && this.camera.aspect < 0.8 ? input.portrait : input;
    if (!v.fit) return v;
    const e = new THREE.Vector3(...v.eye), t = new THREE.Vector3(...v.target);
    const dir = e.clone().sub(t);
    const d0 = dir.length();
    const vf = (this.camera.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * Math.max(0.2, this.camera.aspect));
    const need = v.fit / 2 / Math.tan(hf / 2);
    if (need <= d0) return v;
    const e2 = t.clone().add(dir.multiplyScalar(Math.min(need, d0 * 2.6) / d0));
    return { eye: [e2.x, e2.y, e2.z], target: v.target };
  }

  view(input: StageView, animate = true): void {
    const v = this.fitted(input);
    // plano cercano según la vista: los primeros planos (un medidor, un pluviómetro) no se recortan
    const dist = new THREE.Vector3(...v.eye).distanceTo(new THREE.Vector3(...v.target));
    const near = Math.min(0.5, Math.max(0.02, dist * 0.04));
    if (Math.abs(this.camera.near - near) > 1e-6) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    this.finisher.setScale(input.fit ?? new THREE.Vector3(...v.eye).distanceTo(new THREE.Vector3(...v.target)) * 0.9);
    // la primera vista entra con un acercamiento suave desde más lejos y más alto
    if (!this.introDone && !animate && !this.reducedMotion) {
      this.introDone = true;
      const e = new THREE.Vector3(...v.eye), t = new THREE.Vector3(...v.target);
      const off = e.clone().sub(t);
      const from = t.clone().add(off.multiplyScalar(1.45)).add(new THREE.Vector3(0, off.length() * 0.12, 0)).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0);
      this.camera.position.copy(from.clone().sub(t).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.32).add(t));
      this.controls.target.copy(t);
      this.controls.update();
      const p = this.camera.position;
      this.tween = { from: { eye: [p.x, p.y, p.z], target: [t.x, t.y, t.z] }, to: v, t0: performance.now(), dur: 2200, ease: 'out' };
      return;
    }
    this.introDone = true;
    if (!animate || this.reducedMotion) {
      this.camera.position.set(...v.eye);
      this.controls.target.set(...v.target);
      this.controls.update();
      this.tween = null;
      return;
    }
    const p = this.camera.position, t = this.controls.target;
    this.tween = { from: { eye: [p.x, p.y, p.z], target: [t.x, t.y, t.z] }, to: v, t0: performance.now(), dur: 1200 };
  }

  orbit(deg: number): void {
    const off = this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);
    this.camera.position.copy(this.controls.target).add(off);
    this.controls.update();
  }

  zoom(f: number): void {
    const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f);
    const d = off.length();
    if (d < this.controls.minDistance || d > this.controls.maxDistance) return;
    this.camera.position.copy(this.controls.target).add(off);
    this.controls.update();
  }

  // ------------------------------------------------------------ selección
  addPick(obj: THREE.Object3D, onPick: Pickable['onPick'], hint?: string): void {
    this.picks.push({ obj, onPick, hint });
  }

  private hit(clientX: number, clientY: number): { p: Pickable; h: THREE.Intersection } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const objs = this.picks.filter((p) => p.obj.visible).map((p) => p.obj);
    const hits = this.ray.intersectObjects(objs, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const p = this.picks.find((q) => q.obj === o);
        if (p) return { p, h };
        o = o.parent;
      }
    }
    return null;
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 7 || performance.now() - d.t > 700) return;
    const r = this.hit(e.clientX, e.clientY);
    if (e.pointerType !== 'touch') {
      if (r) r.p.onPick(r.h.point.clone(), r.h);
      return;
    }
    // con el dedo no hay puntero que pase: el primer toque muestra la lectura; si el objeto además hace algo (cerrar
    // una válvula, mover la sonda), lo hace el segundo toque
    const now = performance.now();
    if (r && this.armed && this.armed.obj === r.p.obj && now - this.armed.at < 5000) {
      this.armed = null;
      r.p.onPick(r.h.point.clone(), r.h);
      this.probeAt(e.clientX, e.clientY, true);
      this.holdProbe();
      return;
    }
    if (this.probeAt(e.clientX, e.clientY, true, r?.p)) {
      this.armed = r ? { obj: r.p.obj, at: now } : null;
      this.holdProbe();
    } else if (r) r.p.onPick(r.h.point.clone(), r.h);
  };

  /** La lectura de un toque queda unos segundos. */
  private holdProbe(): void {
    window.clearTimeout(this.probeTimer);
    this.probeTimer = window.setTimeout(() => {
      this.hideProbe();
      this.armed = null;
    }, 5000);
  }

  // ------------------------------------------------------------ teclado
  private onKey = (e: KeyboardEvent) => {
    if (!this.probes.length && !this.picks.length) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const cv = this.renderer.domElement;
    const W = cv.clientWidth, H = cv.clientHeight;
    const step = Math.max(8, Math.round(Math.min(W, H) * 0.035));
    let dx = 0, dy = 0, act = false;
    switch (e.key) {
      case 'ArrowLeft':
        dx = -step;
        break;
      case 'ArrowRight':
        dx = step;
        break;
      case 'ArrowUp':
        dy = -step;
        break;
      case 'ArrowDown':
        dy = step;
        break;
      case 'Enter':
      case ' ':
        act = true;
        break;
      case 'Escape':
        if (!this.kb) return;
        this.hideKb();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!this.kb) this.kb = { x: W / 2, y: H / 2 };
    else {
      this.kb.x = Math.max(4, Math.min(W - 4, this.kb.x + dx));
      this.kb.y = Math.max(4, Math.min(H - 4, this.kb.y + dy));
    }
    this.drawKb();
    const r = cv.getBoundingClientRect();
    const cx = r.left + this.kb.x, cy = r.top + this.kb.y;
    const pk = this.hit(cx, cy);
    this.onHover?.(pk?.p.hint ?? null);
    if (act) {
      if (pk) pk.p.onPick(pk.h.point.clone(), pk.h);
      else this.announce('Aquí no hay nada que tocar.');
    }
    if (!this.probeAt(cx, cy, true, act ? undefined : pk?.p)) {
      this.hideProbe();
      if (!act) this.announce(pk?.p.hint ? `${pk.p.hint}.` : 'Sin datos en este punto.');
    }
  };

  private drawKb(): void {
    if (!this.kb) return;
    if (!this.kbEl) {
      const el = document.createElement('div');
      el.className = 'q3-kbcursor';
      el.setAttribute('aria-hidden', 'true');
      this.container.appendChild(el);
      this.kbEl = el;
    }
    this.kbEl.style.display = 'block';
    this.kbEl.style.transform = `translate(${Math.round(this.kb.x)}px, ${Math.round(this.kb.y)}px)`;
  }

  private hideKb(): void {
    if (!this.kb) return;
    this.kb = null;
    if (this.kbEl) this.kbEl.style.display = 'none';
    this.hideProbe();
  }

  /** Anuncia un texto al lector de pantalla (se espera un momento para no leer cada paso de las flechas). */
  private announce(t: string): void {
    window.clearTimeout(this.liveTimer);
    this.liveTimer = window.setTimeout(() => {
      this.live.textContent = t;
    }, 350);
  }

  private onMove = (e: PointerEvent) => {
    if (e.buttons || e.pointerType === 'touch') return;
    if (this.kb) this.hideKb();
    const now = performance.now();
    if (now - this.hoverAt < 60) return;
    this.hoverAt = now;
    const r = this.hit(e.clientX, e.clientY);
    this.renderer.domElement.style.cursor = r ? 'pointer' : '';
    this.onHover?.(r?.p.hint ?? null);
    if (!this.probeAt(e.clientX, e.clientY)) this.hideProbe();
  };

  // ------------------------------------------------------------ lecturas al pasar el puntero
  /**
   * Registra un objeto que se puede leer: al pasar el puntero (o al tocarlo en una pantalla táctil) aparece junto al
   * puntero una ficha con los datos de ese punto, que se actualiza mientras la escena cambia.
   */
  addProbe(obj: THREE.Object3D, read: Probe['read']): void {
    this.probes.push({ obj, read });
  }

  /**
   * Zona de lectura invisible (una esfera o una caja) para objetos pequeños o delgados que serían difíciles de
   * señalar con el puntero: no se dibuja, pero se puede leer.
   */
  addProbeZone(at: THREE.Vector3, size: number | THREE.Vector3, read: Probe['read']): THREE.Mesh {
    const g = typeof size === 'number' ? new THREE.SphereGeometry(size, 10, 8) : new THREE.BoxGeometry(size.x, size.y, size.z);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ visible: false }));
    m.position.copy(at);
    m.userData.noLook = true;
    this.scene.add(m);
    this.probes.push({ obj: m, read });
    return m;
  }

  /**
   * Lee el punto de la pantalla: el primer objeto con ficha que dé una lectura (si uno no tiene datos ahí, se sigue
   * con lo que está detrás). `say` la anuncia al lector de pantalla; `pick`, si el objeto además hace algo al
   * tocarlo, lo agrega a la ficha.
   */
  private probeAt(clientX: number, clientY: number, say = false, pick?: Pickable): boolean {
    if (!this.probes.length) return false;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const objs = this.probes.filter((p) => p.obj.visible).map((p) => p.obj);
    hits: for (const h of this.ray.intersectObjects(objs, true)) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const p = this.probes.find((q) => q.obj === o);
        if (p) {
          const info = p.read(h.point.clone(), h);
          if (!info) continue hits;
          if (pick) info.rows = [...info.rows, ['Para actuar', `${pick.hint ?? 'toca otra vez'}${pick.hint ? ' (toca otra vez o Enter)' : ''}`]];
          this.probeLast = { p, pt: h.point.clone(), h, x: clientX - r.left, y: clientY - r.top, at: performance.now() };
          this.showProbe(info, clientX - r.left, clientY - r.top, h.point);
          if (say) this.announce(`${info.title}. ${info.rows.map(([k, v]) => `${k}: ${v}`).join('. ')}.`);
          return true;
        }
        o = o.parent;
      }
    }
    return false;
  }

  private showProbe(info: ProbeInfo, x: number, y: number, pt: THREE.Vector3): void {
    if (!this.probeEl) {
      const el = document.createElement('div');
      el.className = 'q3-hover q3-reading';
      el.setAttribute('aria-hidden', 'true');
      this.container.appendChild(el);
      this.probeEl = el;
    }
    const el = this.probeEl;
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
    el.innerHTML =
      `<b>${esc(info.title)}</b>` +
      info.rows.map(([k, v], i) => `<span${i === info.strong ? ' class="is-key"' : ''}><i>${esc(k)}</i> ${esc(v)}</span>`).join('');
    el.style.display = 'grid';
    const W = this.container.clientWidth, H = this.container.clientHeight;
    const w = el.offsetWidth, h = el.offsetHeight;
    const left = x + 16 + w > W - 6 ? Math.max(6, x - 16 - w) : x + 16;
    const top = Math.min(Math.max(6, y - h - 12), H - h - 6);
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    if (!this.probeDot) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.62, 1, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: 0.95 }));
      m.renderOrder = 20;
      m.userData.noLook = true;
      this.scene.add(m);
      this.probeDot = m;
    }
    this.probeDot.visible = true;
    this.probeDot.position.copy(pt);
    this.probeDot.quaternion.copy(this.camera.quaternion);
    this.probeDot.scale.setScalar(this.camera.position.distanceTo(pt) * 0.009);
  }

  private hideProbe(): void {
    if (this.probeEl) this.probeEl.style.display = 'none';
    if (this.probeDot) this.probeDot.visible = false;
    this.probeLast = null;
  }

  /** Imagen de la escena tal como se ve (para los reportes): se dibuja un cuadro y se copia en JPEG. */
  snapshot(quality = 0.86): string {
    this.finisher.render();
    try {
      return this.renderer.domElement.toDataURL('image/jpeg', quality);
    } catch {
      return '';
    }
  }

  /** Vuelve a leer el último punto (la escena cambió: otro instante, otro caudal). */
  private refreshProbe(): void {
    const l = this.probeLast;
    if (!l || !this.probeEl || this.probeEl.style.display === 'none') return;
    const now = performance.now();
    if (now - l.at < 250) return;
    l.at = now;
    const info = l.p.read(l.pt.clone(), l.h);
    if (info) this.showProbe(info, l.x, l.y, l.pt);
    else this.hideProbe();
  }

  // ------------------------------------------------------------ rótulos
  setLabels(labels: StageLabel[]): void {
    this.labels = labels;
    const keep = new Set(labels.map((l) => l.id));
    for (const [id, el] of this.labelEls) {
      if (!keep.has(id)) {
        el.remove();
        this.labelEls.delete(id);
      }
    }
    for (const l of labels) {
      let el = this.labelEls.get(l.id);
      if (!el) {
        el = document.createElement(l.onClick ? 'button' : 'div');
        if (l.onClick) (el as HTMLButtonElement).type = 'button';
        // nace oculto: se muestra cuando se le encuentra lugar
        el.style.visibility = 'hidden';
        this.labelLayer.appendChild(el);
        this.labelEls.set(l.id, el);
      }
      el.className = `q3-label is-${l.kind ?? 'lugar'}${l.onClick ? ' is-btn' : ''}`;
      const html = `<span>${esc(l.text)}</span>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}`;
      if (el.dataset.html !== html) {
        el.innerHTML = html;
        el.dataset.html = html;
        el.dataset.w = '';
      }
      el.onclick = l.onClick ? () => l.onClick?.() : null;
    }
    // los rótulos se acomodan ya (no solo en el próximo cuadro): si cambian desde la interfaz durante una
    // reproducción, nunca se pintan un instante fuera de su lugar
    this.layoutLabels();
  }

  private layoutLabels(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    // los rótulos no se ponen bajo los controles que flotan sobre la escena (pregunta, vistas, cámara, tarjetas)
    const placed: [number, number, number, number][] = [];
    const host = this.container.parentElement;
    if (host) {
      const cr = this.container.getBoundingClientRect();
      for (const o of host.querySelectorAll<HTMLElement>(OVERLAY_SEL)) {
        if (o.offsetParent === null) continue;
        const r = o.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) placed.push([r.left - cr.left - 4, r.top - cr.top - 4, r.right - cr.left + 4, r.bottom - cr.top + 4]);
      }
    }
    const sorted = [...this.labels].sort((a, b) => (b.prio ?? 0) - (a.prio ?? 0));
    for (const l of sorted) {
      const el = this.labelEls.get(l.id);
      if (!el) continue;
      v.copy(l.at).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      if (!el.dataset.w) {
        el.dataset.w = String(el.offsetWidth || 80);
        el.dataset.h = String(el.offsetHeight || 22);
      }
      const ew = Number(el.dataset.w), eh = Number(el.dataset.h);
      // el rótulo se corre de lado para no salirse de la escena (su punto sigue dentro de la vista)
      const bx = Math.min(Math.max(x - ew / 2, 4), Math.max(4, w - ew - 4));
      const box: [number, number, number, number] = [bx, y - eh - 6, bx + ew, y - 6];
      const inView = v.z < 1 && v.z > -1 && x > 0 && x < w && box[1] >= 0 && y < h;
      const clash = placed.some((p) => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]));
      const show = inView && !clash;
      el.style.visibility = show ? 'visible' : 'hidden';
      if (show) {
        placed.push(box);
        el.style.transform = `translate(${Math.round(box[0])}px, ${Math.round(box[1])}px)`;
      }
    }
  }

  resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.finisher?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const el of this.labelEls.values()) el.dataset.w = '';
  }

  dispose(): void {
    this.disposed = true;
    window.clearTimeout(this.probeTimer);
    window.clearTimeout(this.liveTimer);
    this.probeEl?.remove();
    this.kbEl?.remove();
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((q) => q.dispose());
      else mat?.dispose();
    });
    this.envRT?.dispose();
    this.finisher.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labelLayer.remove();
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Mapa de entorno con un cielo de degradé (azul arriba, claro en el horizonte, tierra abajo), prefiltrado con PMREM. */
function skyEnvironment(renderer: THREE.WebGLRenderer, sky: THREE.Color): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const col = new Float32Array(geo.attributes.position.count * 3);
  const top = new THREE.Color('#7fb2df'), hor = sky.clone().lerp(new THREE.Color('#ffffff'), 0.35), ground = new THREE.Color('#6d7458'), c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const y = geo.attributes.position.getY(i) / 10;
    if (y >= 0) c.copy(hor).lerp(top, Math.pow(y, 0.6));
    else c.copy(hor).lerp(ground, Math.min(1, -y * 3));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  geo.dispose();
  return rt;
}

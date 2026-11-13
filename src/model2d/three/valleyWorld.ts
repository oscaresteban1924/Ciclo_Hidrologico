// El valle en 3D para la sala «Modelación hidráulica 2D»: el terreno como lo ve el modelo (liso o en píxeles cuando
// son gruesos), coloreado por altura, por cobertura o por n; las casas y los árboles; el corte del terreno; la malla
// de cálculo (también la refinada) con las líneas de quiebre y las condiciones de borde; la celda que se inspecciona
// con su agua por dentro (subgrid); el puente con su luz; y el agua de los resultados por profundidad, velocidad,
// cota, amenaza, llegada, Courant, error de iteración, probabilidad de inundación o zonas, con partículas que siguen
// la velocidad y sondas con un clic. Sirve también para un terreno propio cargado por el usuario. El relieve se puede
// exagerar y la escena lo dice: el agua y el terreno se estiran lo mismo.

import * as THREE from 'three';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { trees, type TreeSpot } from '../../three/scenery';
import { paint } from '../../three/machines';
import { COVER_KEYS, COVERS, LEVEE, NX as VNX, NY as VNY, ROAD, ROAD_Z, S0, Z0, truth, yc, type Raster } from '../terrain';
import { LOW_CHORD, type BcLine, type Geometry, type RunResult } from '../solver';
import { hazardClass } from '../scene';

export type ColorBy = 'altura' | 'natural' | 'cobertura' | 'n';
export type Layer = 'profundidad' | 'velocidad' | 'cota' | 'amenaza' | 'llegada' | 'courant' | 'iteraciones' | 'probabilidad' | 'zonas';

export interface PlanLabel {
  id: string;
  text: string;
  sub?: string;
  x: number;
  y: number;
  /** Altura sobre el terreno [m]. */
  up?: number;
  kind?: StageLabel['kind'];
  prio?: number;
}

/** Un terreno propio: cotas por píxel (NaN sin dato) y tamaño del píxel. */
export interface SiteView {
  id: string;
  NX: number;
  NY: number;
  px: number;
  z: Float32Array;
}

export interface WaterState {
  res: RunResult | null;
  frame: number | null;
  layer: Layer;
  /** Mientras calcula: el último mapa de niveles y su geometría. */
  live?: { frame: Float32Array; geom: Geometry } | null;
  /** Valores por celda (probabilidad de inundación entre 0 y 1). */
  values?: Float32Array | null;
  /** Clase de zona por celda (0 sin, 1 baja, 2 media, 3 alta). */
  zones?: Uint8Array | null;
  particles?: boolean;
}

export interface ValleyState {
  /** Exageración vertical del relieve. */
  vex: number;
  /** Terreno que se dibuja (por píxel) y, si es grueso, su ráster para dibujarlo en píxeles. */
  fine: Float32Array;
  raster: Raster | null;
  colorBy: ColorBy;
  /** n por píxel (para colorear por n). */
  n?: Float32Array | null;
  /** Casas y árboles como objetos (sobre el MDT); 'fantasma' = solo su contorno. */
  objects: 'si' | 'no' | 'fantasma';
  section: number | null;
  /** Malla: lado de base o la geometría (también refinada). */
  mesh: { c: number; geom?: Geometry | null } | null;
  breaklines: boolean;
  bc: boolean;
  bcLines?: BcLine[] | null;
  cell: { c: number; ci: number; geom: Geometry; eta: number } | null;
  water: WaterState | null;
  labels: PlanLabel[];
  /** Terreno propio (si no, el valle). */
  site?: SiteView | null;
  /** El puente como estructura: cara inferior del tablero y fracción de la luz tapada. */
  bridge?: { low: number; block: number } | null;
  /** Daño de cada casa (0 a 1) para colorearlas. */
  damage?: Float32Array | null;
  /** Sonda: un punto marcado en el plano. */
  probe?: { x: number; y: number } | null;
  /** Líneas para medir caudal (en metros). */
  lines?: { x0: number; y0: number; x1: number; y1: number; color: string }[] | null;
  rain?: boolean;
}

const COLORS = {
  depth: ['#d6ecf8', '#7fbbe2', '#2f7fb8', '#0f4c86', '#062a52'],
  vel: ['#efe6f7', '#c5a6e3', '#9168c8', '#5f3a9e', '#331e5e'],
  wse: ['#cfe7f2', '#6fb0d4', '#2a78b0', '#174d80'],
  arrival: ['#0f4c5c', '#2a8090', '#6fb6bf', '#c9e7ea'],
  hazard: ['#d6ecf8', '#fff1b8', '#fdd27a', '#f6a54b', '#e3702f', '#c0412b', '#7d1f24'],
  courant: ['#e6f2e8', '#a9d3a0', '#f2d36b', '#e88b3a', '#b8322a'],
  error: ['#eef1f5', '#c3cfdc', '#f0c36a', '#d9682e', '#8f2420'],
  prob: ['#e9f1f8', '#a8cbe6', '#5a9bd0', '#2a63a8', '#1a3570'],
  zones: ['#d6ecf8', '#f3e19a', '#eea055', '#c0412b'],
  damage: ['#efe7da', '#f3d38a', '#e98b4a', '#b8322a'],
};
function ramp(stops: string[], t: number, out: THREE.Color): THREE.Color {
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(u));
  return out.set(stops[k]).lerp(new THREE.Color(stops[k + 1]), u - k);
}
export const LAYER_RAMPS = COLORS;

const own = <M extends THREE.Material>(m: M): M => {
  m.userData.own = true;
  return m;
};
function clear(g: THREE.Object3D): void {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mt of mats) if (mt.userData.own) mt.dispose();
    });
  }
}

/** Color del relieve del valle: la cota sobre el plano del fondo del valle (el cauce oscuro, la llanura verde, las
 * obras y las laderas claras), así se lee el relieve aunque el valle baje 3 m de punta a punta. */
function heightColor(z: number, x: number, out: THREE.Color): THREE.Color {
  const r = z - (Z0 - S0 * x);
  const t = (r + 2.6) / 18;
  return ramp(['#4f6e74', '#6f8f6a', '#86a65b', '#9db760', '#c9be84', '#d2b98a', '#b79f78', '#a08e74'], Math.pow(Math.max(0, t), 0.6), out);
}
const HYPSO = ['#4f6e74', '#6f8f6a', '#9db760', '#c9be84', '#b79f78', '#a08e74', '#d8d2c6'];
const COVER_COLORS = COVER_KEYS.map((c) => new THREE.Color(COVERS[c].color));
/** Colores naturales (para las partes que no colorean datos). */
const NATURAL = COVER_KEYS.map((c) => new THREE.Color(({ cauce: '#7d7461', pasto: '#8db35e', cultivo: '#b9b56a', rastrojo: '#7f9c56', bosque: '#5f8a4a', via: '#9a9894', edificio: '#b8a99a' } as Record<string, string>)[c]));
function nColor(n: number, out: THREE.Color): THREE.Color {
  const t = (Math.log(n) - Math.log(0.013)) / (Math.log(0.25) - Math.log(0.013));
  return ramp(['#f3f1e6', '#d9e2b6', '#9fbf7a', '#5f8f4c', '#2f5a2c'], t, out);
}

/** Factor de las partículas: van este número de veces más rápido que el agua. */
export const PARTICLE_SPEED = 6;
const NP = 900;

export class ValleyWorld {
  private stage: QStage;
  private st: ValleyState | null = null;
  private terrainG = new THREE.Group();
  private objectsG = new THREE.Group();
  private ghostG = new THREE.Group();
  private sectionG = new THREE.Group();
  private meshG = new THREE.Group();
  private bcG = new THREE.Group();
  private cellG = new THREE.Group();
  private bridgeG = new THREE.Group();
  private markG = new THREE.Group();
  private water!: THREE.Mesh;
  private waterPos!: Float32Array;
  private waterCol!: Float32Array;
  private terrainMat: THREE.MeshStandardMaterial;
  // el dominio: píxeles, tamaño del píxel, paso de la grilla de dibujo y escala
  private NX = VNX;
  private NY = VNY;
  private px = 1;
  private step = 2;
  private GX = VNX / 2 + 1;
  private GY = VNY / 2 + 1;
  private sc = 0.5;
  private zref = 1472;
  private zlo = 0;
  private zhi = 1;
  private siteId = 'valle';
  /** Alturas del terreno dibujado en la grilla (sin exagerar). */
  private gz = new Float32Array(this.GX * this.GY);
  private keys: Record<string, string> = {};
  private arrival: { key: string; t: Float32Array } | null = null;
  readonly views: Record<string, StageView> = {};
  private framed = false;
  private sectionX = 250;
  // partículas y lluvia
  private parts: THREE.LineSegments;
  private pp = new Float32Array(NP * 2);
  private age = new Float32Array(NP);
  private rainL: THREE.LineSegments;
  private rainP = new Float32Array(500 * 3);
  /** Último estado del agua dibujado (para las partículas). */
  private flow: { geom: Geometry; eta: ArrayLike<number>; u: ArrayLike<number>; v: ArrayLike<number> } | null = null;
  /** Clic en el terreno o el agua: punto del plano [m]. */
  onProbe: ((x: number, y: number) => void) | null = null;
  /** Encuadres en el plano: punto mirado (x, y en m) y desplazamiento del ojo en unidades del mundo. */
  private static FRAMES: Record<string, { at: [number, number]; eye: [number, number, number]; fit: number; portrait?: [number, number, number] }> = {
    valle: { at: [320, 205], eye: [70, 150, 215], fit: 330, portrait: [40, 260, 300] },
    barrio: { at: [300, 262], eye: [30, 62, 80], fit: 150 },
    puente: { at: [ROAD.x - 10, 0], eye: [58, 34, 72], fit: 95 },
    malla: { at: [250, 222], eye: [10, 78, 62], fit: 110 },
    entrada: { at: [8, 205], eye: [-48, 42, 62], fit: 110 },
    rotura: { at: [300, 0], eye: [-20, 46, 70], fit: 100 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(190);
    stage.controls.minDistance = 4;
    stage.controls.maxDistance = 520;
    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.makeWater();
    // partículas que siguen la velocidad (trazos cortos) y gotas de lluvia
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * 6), 3));
    const pm = own(new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
    pm.userData.noLook = true;
    this.parts = new THREE.LineSegments(pg, pm);
    this.parts.renderOrder = 6;
    this.parts.visible = false;
    this.parts.frustumCulled = false;
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(500 * 6), 3));
    const rm = own(new THREE.LineBasicMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.55, depthWrite: false }));
    rm.userData.noLook = true;
    this.rainL = new THREE.LineSegments(rg, rm);
    this.rainL.visible = false;
    this.rainL.frustumCulled = false;
    for (let k = 0; k < 500; k++) this.rainP.set([Math.random(), Math.random(), Math.random()], k * 3);
    sc.add(this.terrainG, this.objectsG, this.ghostG, this.sectionG, this.meshG, this.bcG, this.cellG, this.bridgeG, this.markG, this.water, this.parts, this.rainL);
    const pick = (pt: THREE.Vector3) => this.onProbe?.(this.px0(pt.x), this.py0(pt.z));
    stage.addPick(this.terrainG, pick, 'Toca para poner una sonda');
    stage.addPick(this.water, pick, 'Toca para poner una sonda');
    this.updateViews();
    stage.view(this.views.valle, false);
  }

  private get W() {
    return this.NX * this.px;
  }
  private get H() {
    return this.NY * this.px;
  }
  /** Del plano [m] al mundo y de vuelta. */
  wx(x: number) {
    return (x - this.W / 2) * this.sc;
  }
  wz(y: number) {
    return -(y - this.H / 2) * this.sc;
  }
  private px0(X: number) {
    return X / this.sc + this.W / 2;
  }
  private py0(Z: number) {
    return -Z / this.sc + this.H / 2;
  }

  private makeWater(): void {
    if (this.water) {
      this.stage.scene.remove(this.water);
      this.water.geometry.dispose();
    }
    const { GX, GY } = this;
    const wg = new THREE.PlaneGeometry(1, 1, GX - 1, GY - 1);
    this.waterPos = new Float32Array(GX * GY * 3);
    this.waterCol = new Float32Array(GX * GY * 4);
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        const v = j * GX + i;
        this.waterPos[v * 3] = this.wx(Math.min(this.W, i * this.step));
        this.waterPos[v * 3 + 2] = this.wz(Math.min(this.H, j * this.step));
      }
    wg.setAttribute('position', new THREE.BufferAttribute(this.waterPos, 3));
    wg.setAttribute('color', new THREE.BufferAttribute(this.waterCol, 4));
    wg.index = gridIndex(GX, GY);
    const wm = this.water ? (this.water.material as THREE.MeshStandardMaterial) : new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.18, metalness: 0.05, depthWrite: false, side: THREE.DoubleSide });
    wm.userData.noLook = true;
    if (this.water) {
      this.water.geometry = wg;
      this.stage.scene.add(this.water);
    } else {
      this.water = new THREE.Mesh(wg, wm);
      this.water.renderOrder = 3;
      this.water.visible = false;
    }
  }

  /** Cambia de dominio (el valle o un terreno propio): escala, grilla y encuadres. */
  private setDomain(site: SiteView | null | undefined): boolean {
    const id = site ? `${site.id}|${site.NX}|${site.NY}|${site.px}` : 'valle';
    if (id === this.siteId) return false;
    this.siteId = id;
    if (site) {
      this.NX = site.NX;
      this.NY = site.NY;
      this.px = site.px;
      const L = Math.max(this.W, this.H);
      this.step = site.px * Math.max(1, Math.ceil(L / (320 * site.px)));
      this.sc = 320 / L;
      let lo = Infinity, hi = -Infinity;
      for (const v of site.z) if (!Number.isNaN(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      this.zlo = lo;
      this.zhi = Math.max(lo + 1, hi);
      this.zref = lo - 2;
    } else {
      this.NX = VNX;
      this.NY = VNY;
      this.px = 1;
      this.step = 2;
      this.sc = 0.5;
      this.zref = 1472;
    }
    this.GX = Math.floor(this.W / this.step) + 1 + (this.W % this.step ? 1 : 0);
    this.GY = Math.floor(this.H / this.step) + 1 + (this.H % this.step ? 1 : 0);
    this.gz = new Float32Array(this.GX * this.GY);
    this.makeWater();
    this.framed = false;
    this.arrival = null;
    return true;
  }

  /** Recalcula los encuadres con el relieve dibujado (cambian con la exageración vertical). */
  private updateViews(): void {
    const look = (x: number, y: number, eye: [number, number, number], fit: number, portrait?: [number, number, number]): StageView => {
      const ty = this.Y(this.zAt(x, y)) + 1;
      const t: [number, number, number] = [this.wx(x), ty, this.wz(y)];
      const v: StageView = { eye: [t[0] + eye[0], ty + eye[1], t[2] + eye[2]], target: t, fit };
      if (portrait) v.portrait = { eye: [t[0] + portrait[0], ty + portrait[1], t[2] + portrait[2]], target: t };
      return v;
    };
    if (this.siteId !== 'valle') {
      const W = this.W, H = this.H;
      const ar = (this.H * this.sc) / 200;
      this.views.valle = look(W / 2, H / 2, [70, 150 * Math.max(0.8, ar), 215 * Math.max(0.8, ar)], 330, [40, 260, 300]);
      this.views.cerca = look(W / 2, H / 2, [30, 70, 95], 160);
      return;
    }
    for (const [id, f] of Object.entries(ValleyWorld.FRAMES)) this.views[id] = look(f.at[0], id === 'puente' ? yc(ROAD.x) : id === 'rotura' ? yc(300) + LEVEE.dn : f.at[1], f.eye, f.fit, f.portrait);
    this.views.corte = look(this.sectionX, yc(this.sectionX), [78, 20, 10], 85);
    if (!this.views.celda) this.views.celda = look(250, 220, [12, 26, 30], 40);
  }

  private Y(z: number): number {
    return (z - this.zref) * this.sc * (this.st?.vex ?? 1);
  }

  /** Altura del terreno dibujado en un punto del plano [m s. n. m.]. */
  private zAt(x: number, y: number): number {
    const i = Math.max(0, Math.min(this.GX - 1, Math.round(x / this.step))), j = Math.max(0, Math.min(this.GY - 1, Math.round(y / this.step)));
    return this.gz[j * this.GX + i];
  }

  set(s: ValleyState): void {
    const prev = this.st;
    this.st = s;
    const domCh = this.setDomain(s.site);
    const k = (name: string, v: string) => {
      const ch = this.keys[name] !== v;
      this.keys[name] = v;
      return ch;
    };
    const vexCh = !prev || prev.vex !== s.vex || domCh;
    const terrainKey = `${s.raster ? s.raster.p : 0}|${s.colorBy}|${s.vex}|${this.siteId}`;
    const fineCh = !prev || prev.fine !== s.fine || prev.n !== s.n || domCh;
    if (s.section !== null) this.sectionX = s.section;
    if (k('terrain', terrainKey) || fineCh) {
      this.buildTerrain(s);
      this.updateViews();
      if (!this.framed) {
        this.framed = true;
        this.stage.view(this.views.valle, false);
      }
    } else if (prev && prev.section !== s.section) this.updateViews();
    const dmg = s.damage ? Array.from(s.damage, (v) => v.toFixed(2)).join(',') : '';
    if (k('objects', `${s.objects}|${s.vex}|${this.siteId}|${dmg}`) || vexCh) this.buildObjects(s);
    if (k('bridge', `${s.bridge?.low}|${s.bridge?.block}|${s.objects}|${s.vex}|${this.siteId}`) || vexCh) this.buildBridge(s);
    if (k('section', `${s.section}|${s.vex}`) || fineCh) this.buildSection(s);
    if (k('mesh', `${s.mesh?.c}|${s.mesh?.geom?.key ?? ''}|${s.breaklines}|${s.bc}|${JSON.stringify(s.bcLines ?? null)}|${s.vex}`) || fineCh) this.buildMesh(s);
    if (k('marks', `${JSON.stringify(s.probe ?? null)}|${JSON.stringify(s.lines ?? null)}|${s.vex}`) || fineCh) this.buildMarks(s);
    this.buildCell(s);
    this.updateWater(s);
    this.labels(s);
  }

  // ---------------------------------------------------------------- terreno


  private buildTerrain(s: ValleyState): void {
    clear(this.terrainG);
    const valley = this.siteId === 'valle';
    const T = valley ? truth() : null;
    const { GX, GY, NX, NY, step, px } = this;
    const f = s.fine;
    // alturas en la grilla (promedio de los píxeles que tocan el vértice; sin dato, la cota más baja)
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        let a = 0, n = 0;
        const x = Math.min(this.W, i * step), y = Math.min(this.H, j * step);
        for (const dj of [-1, 0])
          for (const di of [-1, 0]) {
            const pi = Math.round(x / px) + di, pj = Math.round(y / px) + dj;
            if (pi < 0 || pj < 0 || pi >= NX || pj >= NY) continue;
            const v = f[pj * NX + pi];
            if (Number.isNaN(v)) continue;
            a += v;
            n++;
          }
        this.gz[j * GX + i] = n ? a / n : valley ? Z0 : this.zlo;
      }
    const col = new THREE.Color();
    const tmp = new THREE.Color();
    const colorAt = (k: number, z: number) => {
      if (!T) return Number.isNaN(f[k]) ? col.set('#b9b4aa') : ramp(HYPSO, Math.pow((z - this.zlo) / (this.zhi - this.zlo), 0.8), col);
      const x = (k % NX) + 0.5;
      if (s.colorBy === 'cobertura') return col.copy(COVER_COLORS[T.cover[k]]);
      if (s.colorBy === 'n' && s.n) return nColor(s.n[k], col);
      if (s.colorBy === 'natural') return heightColor(z, x, tmp) && col.copy(NATURAL[T.cover[k]]).lerp(tmp, 0.35);
      return heightColor(z, x, col);
    };
    const mat = this.terrainMat;
    mat.userData.noLook = s.colorBy === 'cobertura' || s.colorBy === 'n';
    if (valley && s.raster && s.raster.p >= 5) this.terrainG.add(this.blocky(s.raster, colorAt));
    else {
      const g = new THREE.PlaneGeometry(1, 1, GX - 1, GY - 1);
      const pos = new Float32Array(GX * GY * 3), cl = new Float32Array(GX * GY * 3);
      for (let j = 0; j < GY; j++)
        for (let i = 0; i < GX; i++) {
          const v = j * GX + i, z = this.gz[v];
          const x = Math.min(this.W, i * step), y = Math.min(this.H, j * step);
          pos[v * 3] = this.wx(x);
          pos[v * 3 + 1] = this.Y(z);
          pos[v * 3 + 2] = this.wz(y);
          const kk = Math.min(NY - 1, Math.floor(y / px)) * NX + Math.min(NX - 1, Math.floor(x / px));
          colorAt(kk, z);
          if (s.colorBy !== 'cobertura' && s.colorBy !== 'n') {
            // sombreado del relieve (luz del noroeste), como un mapa de sombras de un SIG
            const zx = (this.gz[j * GX + Math.min(GX - 1, i + 1)] - this.gz[j * GX + Math.max(0, i - 1)]) / (2 * step);
            const zy = (this.gz[Math.min(GY - 1, j + 1) * GX + i] - this.gz[Math.max(0, j - 1) * GX + i]) / (2 * step);
            const sh = Math.max(0.62, Math.min(1.25, 1 + 2.2 * (-zx * 0.6 + zy * 0.8) * (valley ? 1 : 3)));
            col.multiplyScalar(sh);
          }
          cl[v * 3] = col.r;
          cl[v * 3 + 1] = col.g;
          cl[v * 3 + 2] = col.b;
        }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
      g.index = gridIndex(GX, GY);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.terrainG.add(m);
    }
    // costados del bloque de terreno (suelo)
    this.terrainG.add(this.skirt());
  }

  /** El ráster grueso como bloques: cada píxel una losa a su cota, con paredes entre vecinos. */
  private blocky(r: Raster, colorAt: (k: number, z: number) => THREE.Color): THREE.Mesh {
    const pos: number[] = [], cl: number[] = [], nor: number[] = [];
    const { NX, NY } = this;
    const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], color: THREE.Color) => {
      for (const p of [a, b, c, a, c, d]) {
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
        cl.push(color.r, color.g, color.b);
      }
    };
    const side = new THREE.Color();
    const X = (x: number) => this.wx(x), Z = (y: number) => this.wz(y);
    for (let cj = 0; cj < r.CY; cj++)
      for (let ci = 0; ci < r.CX; ci++) {
        const z = r.z[cj * r.CX + ci];
        const x0 = ci * r.p, x1 = Math.min(NX, (ci + 1) * r.p), y0 = cj * r.p, y1 = Math.min(NY, (cj + 1) * r.p);
        const kk = Math.min(NY - 1, Math.floor((y0 + y1) / 2)) * NX + Math.min(NX - 1, Math.floor((x0 + x1) / 2));
        const c = colorAt(kk, z).clone();
        const Yz = this.Y(z);
        quad([X(x0), Yz, Z(y0)], [X(x1), Yz, Z(y0)], [X(x1), Yz, Z(y1)], [X(x0), Yz, Z(y1)], [0, 1, 0], c);
        side.copy(c).multiplyScalar(0.72);
        if (ci + 1 < r.CX) {
          const z2 = r.z[cj * r.CX + ci + 1];
          if (Math.abs(z2 - z) > 1e-3) {
            const Y2 = this.Y(z2);
            quad([X(x1), Math.min(Yz, Y2), Z(y0)], [X(x1), Math.min(Yz, Y2), Z(y1)], [X(x1), Math.max(Yz, Y2), Z(y1)], [X(x1), Math.max(Yz, Y2), Z(y0)], [z > z2 ? 1 : -1, 0, 0], side);
          }
        }
        if (cj + 1 < r.CY) {
          const z2 = r.z[(cj + 1) * r.CX + ci];
          if (Math.abs(z2 - z) > 1e-3) {
            const Y2 = this.Y(z2);
            quad([X(x0), Math.min(Yz, Y2), Z(y1)], [X(x1), Math.min(Yz, Y2), Z(y1)], [X(x1), Math.max(Yz, Y2), Z(y1)], [X(x0), Math.max(Yz, Y2), Z(y1)], [0, 0, z > z2 ? -1 : 1], side);
          }
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    const m = new THREE.Mesh(g, this.terrainMat);
    (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    m.receiveShadow = true;
    m.castShadow = true;
    return m;
  }

  private skirt(): THREE.Mesh {
    const base = this.Y(this.zref - 3);
    const pos: number[] = [];
    const edge = (pts: [number, number][]) => {
      for (let k = 0; k + 1 < pts.length; k++) {
        const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
        const a = [this.wx(x1), this.Y(this.zAt(x1, y1)), this.wz(y1)], b = [this.wx(x2), this.Y(this.zAt(x2, y2)), this.wz(y2)];
        pos.push(...a, a[0], base, a[2], ...b, ...b, a[0], base, a[2], b[0], base, b[2]);
      }
    };
    const xs = Array.from({ length: this.GX }, (_, i) => Math.min(this.W, i * this.step)), ys = Array.from({ length: this.GY }, (_, j) => Math.min(this.H, j * this.step));
    edge(xs.map((x) => [x, 0] as [number, number]));
    edge(xs.map((x) => [x, this.H] as [number, number]).reverse());
    edge(ys.map((y) => [0, y] as [number, number]).reverse());
    edge(ys.map((y) => [this.W, y] as [number, number]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, own(new THREE.MeshStandardMaterial({ color: '#8a7358', roughness: 1, side: THREE.DoubleSide })));
  }

  // ---------------------------------------------------------------- casas, árboles y el puente

  private buildObjects(s: ValleyState): void {
    clear(this.objectsG);
    clear(this.ghostG);
    if (s.objects === 'no' || this.siteId !== 'valle') return;
    const T = truth();
    const NX = VNX, NY = VNY;
    const wx = (x: number) => this.wx(x), wz = (y: number) => this.wz(y), SC = this.sc;
    const zg = (x: number, y: number) => T.mdt[Math.max(0, Math.min(NY - 1, Math.floor(y))) * NX + Math.max(0, Math.min(NX - 1, Math.floor(x)))];
    if (s.objects === 'fantasma') {
      // contornos de las casas: lo que el MDT no tiene
      const pts: number[] = [];
      for (const b of T.buildings) {
        const z0 = this.Y(zg((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)), z1 = this.Y(zg((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) + b.h);
        const c = [
          [b.x0, b.y0],
          [b.x1, b.y0],
          [b.x1, b.y1],
          [b.x0, b.y1],
        ];
        for (let k = 0; k < 4; k++) {
          const [xa, ya] = c[k], [xb, yb] = c[(k + 1) % 4];
          pts.push(wx(xa), z1, wz(ya), wx(xb), z1, wz(yb), wx(xa), z0, wz(ya), wx(xa), z1, wz(ya));
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.ghostG.add(new THREE.LineSegments(g, own(new THREE.LineBasicMaterial({ color: '#7a4a3a', transparent: true, opacity: 0.45 }))));
      return;
    }
    // casas: muros claros y techo de teja; la escuela con techo gris; con daño, el muro toma el color del daño
    const wall = paint('#efe7da', 0.85, 0), roof = paint('#b4583c', 0.7, 0.05), roof2 = paint('#7f8a92', 0.6, 0.2);
    const tint = new THREE.Color();
    T.buildings.forEach((b, bi) => {
      const w = (b.x1 - b.x0) * SC, d = (b.y1 - b.y0) * SC;
      const zb = zg((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      const h = this.Y(zb + b.h) - this.Y(zb);
      const dm = s.damage ? s.damage[bi] : -1;
      const wm = dm >= 0 ? own(new THREE.MeshStandardMaterial({ color: ramp(COLORS.damage, dm, tint).clone(), roughness: 0.85 })) : wall;
      if (dm >= 0) wm.userData.noLook = true;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wm);
      body.position.set(wx((b.x0 + b.x1) / 2), this.Y(zb) + h / 2, wz((b.y0 + b.y1) / 2));
      body.castShadow = body.receiveShadow = true;
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.0001, Math.hypot(w, d) * 0.5, Math.min(w, d) * 0.45, 4, 1), b.name === 'escuela' ? roof2 : roof);
      r.rotation.y = Math.PI / 4;
      r.scale.set((w / Math.hypot(w, d)) * 1.41, 1, (d / Math.hypot(w, d)) * 1.41);
      r.position.set(body.position.x, this.Y(zb) + h + Math.min(w, d) * 0.22, body.position.z);
      r.castShadow = true;
      this.objectsG.add(body, r);
    });
    // el asfalto: la corona de la vía y las calles del barrio
    const asph = paint('#6f7378', 0.9, 0);
    const ribbon = (x0: number, x1: number, y0: number, y1: number) => {
      const nx = Math.max(1, Math.round((x1 - x0) / 2)), ny = Math.max(1, Math.round((y1 - y0) / 2));
      const g = new THREE.PlaneGeometry(1, 1, nx, ny);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const u = pos.getX(v) + 0.5, w = pos.getY(v) + 0.5;
        const x = x0 + u * (x1 - x0), y = y0 + w * (y1 - y0);
        pos.setXYZ(v, wx(x), this.Y(zg(x, y)) + 0.06, wz(y));
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, asph);
      m.receiveShadow = true;
      return m;
    };
    for (const [a, b, c, d] of T.streets) this.objectsG.add(ribbon(a, b, c, d));
    const yb = yc(ROAD.x);
    this.objectsG.add(ribbon(ROAD.x - ROAD.half, ROAD.x + ROAD.half, 0, yb - ROAD.open - 2), ribbon(ROAD.x - ROAD.half, ROAD.x + ROAD.half, yb + ROAD.open + 2, NY));
    // árboles (las copas del MDS)
    const spots: TreeSpot[] = T.crowns.map((c) => ({ x: wx(c.x), y: this.Y(zg(c.x, c.y)), z: wz(c.y), r: c.r * SC * 0.9 }));
    this.objectsG.add(trees(spots, 5));
  }

  /** El tablero del puente (de su cara inferior a la rasante) y, si la luz está tapada, troncos y basura. */
  private buildBridge(s: ValleyState): void {
    clear(this.bridgeG);
    if (this.siteId !== 'valle' || s.objects === 'no') return;
    const low = s.bridge?.low ?? LOW_CHORD;
    const SC = this.sc;
    const th = Math.max(0.3, ROAD_Z - low);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8 * SC, (this.Y(ROAD_Z) - this.Y(ROAD_Z - th)), 26 * SC), paint('#b9b4aa', 0.8, 0));
    deck.position.set(this.wx(ROAD.x), (this.Y(ROAD_Z) + this.Y(ROAD_Z - th)) / 2, this.wz(yc(ROAD.x)));
    deck.castShadow = deck.receiveShadow = true;
    this.bridgeG.add(deck);
    const block = s.bridge?.block ?? 0;
    if (block > 0.01) {
      // troncos atravesados aguas arriba del puente, en proporción a la luz tapada
      const wood = paint('#6b4a2f', 0.9, 0);
      const n = Math.round(4 + block * 14);
      const T = truth();
      for (let k = 0; k < n; k++) {
        const y = yc(ROAD.x) - 9 + ((k * 7.3) % 18);
        const x = ROAD.x - 4.5 - (k % 3) * 0.8;
        const zb = T.mdt[Math.floor(y) * VNX + Math.floor(x)];
        const top = Math.min(low, zb + 0.3 + block * (low - zb) * ((k % 4) / 4 + 0.25));
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * SC * 2, 0.22 * SC * 2, (3 + (k % 3)) * SC, 6), wood);
        log.rotation.set(Math.PI / 2, (k * 0.9) % Math.PI, (k * 0.37) % 0.6);
        log.position.set(this.wx(x), this.Y(top), this.wz(y));
        log.castShadow = true;
        this.bridgeG.add(log);
      }
    }
  }

  // ---------------------------------------------------------------- corte

  private buildSection(s: ValleyState): void {
    clear(this.sectionG);
    if (s.section === null || this.siteId !== 'valle') return;
    const T = truth();
    const NX = VNX, NY = VNY;
    const x = s.section;
    const i = Math.max(0, Math.min(NX - 1, Math.floor(x)));
    const c = yc(x);
    const y0 = Math.max(0, Math.floor(c - 75)), y1 = Math.min(NY - 1, Math.ceil(c + 75));
    let lo = Infinity, hi = -Infinity;
    for (let j = y0; j <= y1; j++) {
      lo = Math.min(lo, T.mdt[j * NX + i], s.fine[j * NX + i]);
      hi = Math.max(hi, T.mdt[j * NX + i], s.fine[j * NX + i]);
    }
    hi = Math.min(hi, lo + 14);
    // un plano translúcido y las dos líneas: el terreno verdadero (oscuro) y el del modelo (azul, escalonado)
    const plane = new THREE.Mesh(new THREE.PlaneGeometry((y1 - y0) * this.sc, this.Y(hi + 2) - this.Y(lo - 1)), own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })));
    plane.rotation.y = Math.PI / 2;
    plane.position.set(this.wx(x) + 0.05, (this.Y(hi + 2) + this.Y(lo - 1)) / 2, this.wz((y0 + y1) / 2));
    plane.renderOrder = 4;
    const line = (zf: (j: number) => number, color: string, lift: number) => {
      const pts: THREE.Vector3[] = [];
      for (let j = y0; j <= y1; j++) {
        const z = zf(j);
        pts.push(new THREE.Vector3(this.wx(x) + lift, this.Y(z), this.wz(j)), new THREE.Vector3(this.wx(x) + lift, this.Y(z), this.wz(j + 1)));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const l = new THREE.Line(g, own(new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true })));
      l.renderOrder = 6;
      return l;
    };
    this.sectionG.add(plane, line((j) => T.mdt[j * NX + i], '#17324d', 0.12), line((j) => s.fine[j * NX + i], '#2a78d6', 0.18));
  }

  // ---------------------------------------------------------------- malla, líneas de quiebre y bordes

  private tube(pts: [number, number][], color: string, r: number, up = 0.4): THREE.Mesh {
    const v = pts.map(([x, y]) => new THREE.Vector3(this.wx(x), this.Y(this.zAt(x, y)) + up, this.wz(y)));
    const curve = new THREE.CatmullRomCurve3(v);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), r, 6, false), own(new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 })));
    m.userData.noLook = true;
    return m;
  }

  private buildMesh(s: ValleyState): void {
    clear(this.meshG);
    clear(this.bcG);
    const lift = 0.25;
    const st = this.step;
    const seg = (pts: number[], xa: number, ya: number, xb: number, yb: number) => {
      const L = Math.hypot(xb - xa, yb - ya), n = Math.max(1, Math.round(L / st));
      for (let q = 0; q < n; q++) {
        const x0 = xa + ((xb - xa) * q) / n, y0 = ya + ((yb - ya) * q) / n, x1 = xa + ((xb - xa) * (q + 1)) / n, y1 = ya + ((yb - ya) * (q + 1)) / n;
        const Y = this.Y(Math.max(this.zAt(x0, y0), this.zAt(x1, y1))) + lift;
        pts.push(this.wx(x0), Y, this.wz(y0), this.wx(x1), Y, this.wz(y1));
      }
    };
    if (s.mesh) {
      const pts: number[] = [];
      const g = s.mesh.geom;
      if (g) {
        // cada celda: su borde norte y este (y los de los bordes del dominio)
        for (let ci = 0; ci < g.NC; ci++) {
          const x0 = g.cx0[ci] * g.px, y0 = g.cy0[ci] * g.px, w = g.cs[ci] * g.px;
          const x1 = Math.min(this.W, x0 + w), y1 = Math.min(this.H, y0 + w);
          seg(pts, x0, y1, x1, y1);
          seg(pts, x1, y0, x1, y1);
          if (y0 === 0) seg(pts, x0, 0, x1, 0);
          if (x0 === 0) seg(pts, 0, y0, 0, y1);
        }
      } else {
        const c = s.mesh.c;
        for (let x = 0; x <= this.W; x += c) seg(pts, x, 0, x, this.H);
        for (let y = 0; y <= this.H; y += c) seg(pts, 0, y, this.W, y);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const cmin = g ? g.cmin : s.mesh.c;
      this.meshG.add(new THREE.LineSegments(geo, own(new THREE.LineBasicMaterial({ color: '#1d2b36', transparent: true, opacity: cmin <= 5 ? 0.22 : 0.4 }))));
    }
    if (s.breaklines && this.siteId === 'valle') {
      const lev: [number, number][] = [];
      for (let x = LEVEE.x0 + 8; x <= LEVEE.x1 - 4; x += 4) {
        const sl = ((30 * 2 * Math.PI) / 320) * Math.cos((2 * Math.PI * x) / 320);
        lev.push([x, yc(x) + LEVEE.dn * Math.sqrt(1 + sl * sl)]);
      }
      this.bcG.add(this.tube(lev, '#e0a526', 0.55));
      if (!s.bridge) {
        const road1: [number, number][] = [], road2: [number, number][] = [];
        for (let y = 2; y < VNY - 2; y += 6) {
          if (Math.abs(y - yc(ROAD.x)) < ROAD.open + 4) continue;
          (y < yc(ROAD.x) ? road1 : road2).push([ROAD.x, y]);
        }
        if (road1.length > 1) this.bcG.add(this.tube(road1, '#e0a526', 0.55));
        if (road2.length > 1) this.bcG.add(this.tube(road2, '#e0a526', 0.55));
      }
    }
    if (s.bc) {
      const lines = s.bcLines ?? (this.siteId === 'valle' ? [{ side: 'O', from: 0, to: VNY, kind: 'caudal', slope: 0 } as BcLine, { side: 'E', from: 0, to: VNY, kind: 'normal', slope: 0 } as BcLine] : []);
      for (const l of lines) {
        const pts: [number, number][] = [];
        const n = Math.max(2, Math.round((l.to - l.from) / 6));
        for (let k = 0; k <= n; k++) {
          const u = l.from + ((l.to - l.from) * k) / n;
          const e = Math.max(1, this.step / 2);
          pts.push(l.side === 'O' ? [e, u] : l.side === 'E' ? [this.W - e, u] : l.side === 'S' ? [u, e] : [u, this.H - e]);
        }
        this.bcG.add(this.tube(pts, l.kind === 'caudal' ? '#1f6fa5' : '#c0632b', 0.9 * Math.max(1, this.step / 2), 0.9));
      }
    }
  }

  /** La sonda y las líneas para medir caudal. */
  private buildMarks(s: ValleyState): void {
    clear(this.markG);
    if (s.probe) {
      const { x, y } = s.probe;
      const z = this.zAt(x, y);
      const h = 14 * this.sc * 2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, h, 8), own(new THREE.MeshStandardMaterial({ color: '#c0632b', emissive: '#c0632b', emissiveIntensity: 0.3 })));
      pole.position.set(this.wx(x), this.Y(z) + h / 2, this.wz(y));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), own(new THREE.MeshStandardMaterial({ color: '#c0632b', emissive: '#c0632b', emissiveIntensity: 0.4 })));
      ball.position.set(this.wx(x), this.Y(z) + h, this.wz(y));
      (pole.material as THREE.Material).userData.noLook = (ball.material as THREE.Material).userData.noLook = true;
      this.markG.add(pole, ball);
    }
    for (const l of s.lines ?? []) {
      const n = Math.max(2, Math.round(Math.hypot(l.x1 - l.x0, l.y1 - l.y0) / 6));
      const pts: [number, number][] = [];
      for (let k = 0; k <= n; k++) pts.push([l.x0 + ((l.x1 - l.x0) * k) / n, l.y0 + ((l.y1 - l.y0) * k) / n]);
      this.markG.add(this.tube(pts, l.color, 0.5, 0.8));
    }
  }

  // ---------------------------------------------------------------- la celda que se inspecciona

  private buildCell(s: ValleyState): void {
    const key = s.cell ? `${s.cell.c}|${s.cell.ci}|${s.cell.eta.toFixed(3)}|${s.cell.geom.key}|${s.vex}` : '';
    if (this.keys.cell === key) return;
    this.keys.cell = key;
    clear(this.cellG);
    if (!s.cell) return;
    const { ci, geom, eta } = s.cell;
    const c = geom.cs[ci] * geom.px;
    const x0 = geom.cx0[ci] * geom.px, y0 = geom.cy0[ci] * geom.px;
    // el marco de la celda
    const zTop = Math.max(...Array.from({ length: c + 1 }, (_, k) => Math.max(this.zAt(x0 + k, y0), this.zAt(x0 + k, y0 + c), this.zAt(x0, y0 + k), this.zAt(x0 + c, y0 + k))));
    const top = this.Y(Math.max(zTop, eta) + 0.5);
    const frame: number[] = [];
    const corners = [
      [x0, y0],
      [x0 + c, y0],
      [x0 + c, y0 + c],
      [x0, y0 + c],
    ];
    for (let k = 0; k < 4; k++) {
      const [xa, ya] = corners[k], [xb, yb] = corners[(k + 1) % 4];
      frame.push(this.wx(xa), top, this.wz(ya), this.wx(xb), top, this.wz(yb), this.wx(xa), top, this.wz(ya), this.wx(xa), this.Y(this.zAt(xa, ya)), this.wz(ya));
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(frame, 3));
    const fl = new THREE.LineSegments(fg, own(new THREE.LineBasicMaterial({ color: '#c0632b', depthTest: false, transparent: true })));
    fl.renderOrder = 7;
    this.cellG.add(fl);
    // el agua dentro de la celda, píxel por píxel: solo cubre los que están por debajo del nivel
    const pos: number[] = [];
    const p = geom.px;
    for (let j = geom.cy0[ci]; j < geom.cy0[ci] + geom.cs[ci]; j++)
      for (let i = geom.cx0[ci]; i < geom.cx0[ci] + geom.cs[ci]; i++) {
        const z = geom.z[j * geom.NX + i];
        if (!(z < eta)) continue;
        const Ye = this.Y(eta);
        const xa = this.wx(i * p), xb = this.wx((i + 1) * p), za = this.wz(j * p), zb = this.wz((j + 1) * p);
        pos.push(xa, Ye, za, xb, Ye, za, xb, Ye, zb, xa, Ye, za, xb, Ye, zb, xa, Ye, zb);
      }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, own(new THREE.MeshStandardMaterial({ color: '#2f7fb8', transparent: true, opacity: 0.82, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false })));
      (m.material as THREE.Material).userData.noLook = true;
      m.renderOrder = 5;
      this.cellG.add(m);
    }
    const cx = this.wx(x0 + c / 2), cz = this.wz(y0 + c / 2), d = Math.max(14, c * this.sc * 1.6);
    this.views.celda = { eye: [cx + d * 0.55, this.Y(eta) + d * 0.75, cz + d * 1.05], target: [cx, this.Y(eta) - 0.5, cz], fit: Math.max(16, c * this.sc * 2.2) };
  }

  // ---------------------------------------------------------------- el agua

  /** Nivel en el punto (x, y): interpolación bilineal entre los centros de las celdas mojadas (con el lado de la
   * celda que contiene el punto, que en la malla refinada está alineada con su retícula). */
  private levelAt(g: Geometry, eta: ArrayLike<number>, x: number, y: number): { level: number; own: number } {
    const ownC = g.pmap[Math.min(g.NY - 1, Math.max(0, Math.floor(y / g.px))) * g.NX + Math.min(g.NX - 1, Math.max(0, Math.floor(x / g.px)))];
    if (ownC < 0) return { level: NaN, own: -1 };
    const s = g.cs[ownC] * g.px;
    const fx = x / s - 0.5, fy = y / s - 0.5;
    const I0 = Math.floor(fx), J0 = Math.floor(fy);
    let sw = 0, se = 0;
    for (let dj = 0; dj <= 1; dj++)
      for (let di = 0; di <= 1; di++) {
        const cxm = Math.min(g.NX * g.px - 0.1, Math.max(0.1, (I0 + di + 0.5) * s)), cym = Math.min(g.NY * g.px - 0.1, Math.max(0.1, (J0 + dj + 0.5) * s));
        const ci = g.pmap[Math.floor(cym / g.px) * g.NX + Math.floor(cxm / g.px)];
        if (ci < 0) continue;
        const wt = (di ? fx - I0 : 1 - (fx - I0)) * (dj ? fy - J0 : 1 - (fy - J0));
        if (eta[ci] - g.zmin[ci] > 0.005 && wt > 0) {
          sw += wt;
          se += wt * eta[ci];
        }
      }
    return { level: sw > 0 ? se / sw : eta[ownC], own: ownC };
  }

  private updateWater(s: ValleyState): void {
    const w = s.water;
    const r = w?.res ?? null;
    const live = !r && w?.live ? w.live : null;
    if (!w || (!r && !live)) {
      this.water.visible = false;
      this.flow = null;
      this.parts.visible = false;
      this.rainL.visible = !!s.rain;
      return;
    }
    const g = r ? r.geom : live!.geom;
    if (g.NX !== this.NX || g.NY !== this.NY) {
      this.water.visible = false;
      return;
    }
    const eta: ArrayLike<number> = live ? live.frame : w.frame === null ? r!.etaMax : r!.frames[Math.max(0, Math.min(r!.frames.length - 1, w.frame))];
    const pos = this.waterPos, col = this.waterCol, c = new THREE.Color();
    const layer: Layer = live ? 'profundidad' : w.layer;
    if (layer === 'llegada') this.ensureArrival(r!);
    let maxEta = -Infinity, minEta = Infinity;
    if (layer === 'cota')
      for (let i = 0; i < g.NC; i++)
        if (eta[i] - g.zmin[i] > 0.02) {
          maxEta = Math.max(maxEta, eta[i]);
          minEta = Math.min(minEta, eta[i]);
        }
    const { GX, GY, step } = this;
    const tolW = r ? r.opts.tolWS : 0.003;
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        const v = j * GX + i;
        const x = Math.min(this.W - 0.5 * this.px, Math.max(0.5 * this.px, i * step)), y = Math.min(this.H - 0.5 * this.px, Math.max(0.5 * this.px, j * step));
        const { level, own: ci0 } = this.levelAt(g, eta, x, y);
        const zm = g.z[Math.floor(y / g.px) * g.NX + Math.floor(x / g.px)];
        const depth = level - zm;
        const wet = ci0 >= 0 && depth > 0.02 && eta[ci0] - g.zmin[ci0] > 0.005;
        const showProb = layer === 'probabilidad' && w.values && ci0 >= 0 && w.values[ci0] > 0.02;
        const showZone = layer === 'zonas' && w.zones && ci0 >= 0 && w.zones[ci0] > 0;
        const drawn = wet || showProb || showZone;
        pos[v * 3 + 1] = drawn ? (wet ? this.Y(level) + 0.04 : this.Y(this.gz[v]) + 0.12) : this.Y(this.gz[v]) - 0.3;
        if (!drawn) {
          col[v * 4 + 3] = 0;
          continue;
        }
        let alpha = Math.min(0.9, 0.45 + depth * 1.2);
        switch (layer) {
          case 'velocidad':
            ramp(COLORS.vel, r!.vMax[ci0] / 3, c);
            break;
          case 'cota':
            ramp(COLORS.wse, (level - minEta) / Math.max(0.5, maxEta - minEta), c);
            break;
          case 'amenaza': {
            const DV = Math.max(0, r!.etaDV[ci0] - zm) * r!.vDV[ci0];
            c.set(COLORS.hazard[hazardClass(depth, r!.vMax[ci0], DV)]);
            break;
          }
          case 'llegada': {
            const ta = this.arrival!.t[v];
            if (!Number.isFinite(ta)) c.set('#9fb6c4');
            else ramp(COLORS.arrival, ta / Math.max(1, r!.opts.duration * 60), c);
            break;
          }
          case 'courant':
            ramp(COLORS.courant, r!.courantCell[ci0] / (r!.opts.eq === 'difusiva' ? 5 : 1.25), c);
            alpha = 0.85;
            break;
          case 'iteraciones':
            ramp(COLORS.error, r!.iterErr[ci0] / Math.max(1e-4, 4 * tolW), c);
            alpha = 0.85;
            break;
          case 'probabilidad':
            ramp(COLORS.prob, w.values ? w.values[ci0] : 0, c);
            alpha = 0.88;
            break;
          case 'zonas':
            c.set(COLORS.zones[w.zones ? w.zones[ci0] : 0]);
            alpha = 0.9;
            break;
          default:
            ramp(COLORS.depth, depth / 2.5, c);
        }
        col[v * 4] = c.r;
        col[v * 4 + 1] = c.g;
        col[v * 4 + 2] = c.b;
        col[v * 4 + 3] = alpha;
      }
    const geo = this.water.geometry;
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.water.visible = true;
    // velocidades del mapa que se ve (para las partículas)
    let fu: ArrayLike<number> | null = null, fv: ArrayLike<number> | null = null;
    if (r && r.uFrames.length) {
      let fi = w.frame;
      if (fi === null) {
        // con el mapa de máximos, el instante del pico bajo el puente (o el último)
        const s2 = r.series.qBridge.length && r.series.qBridge.some((q) => q !== 0) ? r.series.qBridge : r.series.qout;
        fi = s2.reduce((b, q, k) => (q > s2[b] ? k : b), 0);
      }
      fi = Math.max(0, Math.min(r.uFrames.length - 1, fi));
      fu = r.uFrames[fi];
      fv = r.vFrames[fi];
    }
    this.flow = fu && fv && w.particles ? { geom: g, eta, u: fu, v: fv } : null;
    this.parts.visible = !!this.flow;
    this.rainL.visible = !!s.rain;
  }

  /** Tiempo de llegada (10 cm) en cada vértice, desde los mapas guardados. */
  private ensureArrival(r: RunResult): void {
    const key = `${r.geom.key}|${r.frames.length}|${r.opts.hydro.Qp}|${r.opts.eq}|${this.GX}`;
    if (this.arrival?.key === key) return;
    const g = r.geom, t = new Float32Array(this.GX * this.GY).fill(NaN);
    for (let j = 0; j < this.GY; j++)
      for (let i = 0; i < this.GX; i++) {
        const x = Math.min(this.W - 1, i * this.step), y = Math.min(this.H - 1, j * this.step);
        const k = Math.floor(y / g.px) * g.NX + Math.floor(x / g.px);
        const ci = g.pmap[k];
        if (ci < 0) continue;
        const zm = g.z[k];
        for (let f = 0; f < r.frames.length; f++)
          if (r.frames[f][ci] - zm >= 0.1) {
            t[j * this.GX + i] = r.frameT[f];
            break;
          }
      }
    this.arrival = { key, t };
  }

  // ---------------------------------------------------------------- rótulos

  private labels(s: ValleyState): void {
    const L: StageLabel[] = s.labels.map((l) => ({
      id: l.id,
      text: l.text,
      sub: l.sub,
      at: new THREE.Vector3(this.wx(l.x), this.Y(this.zAt(l.x, l.y) + (l.up ?? 4)), this.wz(l.y)),
      kind: l.kind ?? 'lugar',
      prio: l.prio ?? 5,
    }));
    this.stage.setLabels(L);
  }

  // ---------------------------------------------------------------- partículas y lluvia

  update(dt: number, _t: number): void {
    const d = Math.min(0.05, dt);
    if (this.flow && this.parts.visible) {
      const { geom: g, eta, u, v } = this.flow;
      const pos = (this.parts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const W = this.W, H = this.H;
      const spawn = (k: number) => {
        // en una celda mojada al azar (con más probabilidad donde el agua corre)
        for (let tries = 0; tries < 12; tries++) {
          const x = Math.random() * W, y = Math.random() * H;
          const ci = g.pmap[Math.floor(y / g.px) * g.NX + Math.floor(x / g.px)];
          if (ci < 0 || eta[ci] - g.zmin[ci] < 0.05) continue;
          if (Math.hypot(u[ci], v[ci]) < 0.05 && tries < 10) continue;
          this.pp[k * 2] = x;
          this.pp[k * 2 + 1] = y;
          this.age[k] = Math.random() * 3;
          return true;
        }
        this.age[k] = 99;
        return false;
      };
      for (let k = 0; k < NP; k++) {
        if (this.age[k] <= 0 || this.age[k] > 4) spawn(k);
        const x = this.pp[k * 2], y = this.pp[k * 2 + 1];
        const ci = x >= 0 && y >= 0 && x < W && y < H ? g.pmap[Math.floor(y / g.px) * g.NX + Math.floor(x / g.px)] : -1;
        if (ci < 0 || eta[ci] - g.zmin[ci] < 0.03) {
          this.age[k] = 0;
          pos.fill(0, k * 6, k * 6 + 6);
          continue;
        }
        const ux = u[ci], uy = v[ci];
        const nx = x + ux * PARTICLE_SPEED * d, ny = y + uy * PARTICLE_SPEED * d;
        this.pp[k * 2] = nx;
        this.pp[k * 2 + 1] = ny;
        this.age[k] += d;
        const Yl = this.Y(eta[ci]) + 0.15;
        const tl = 0.5;
        pos[k * 6] = this.wx(nx - ux * PARTICLE_SPEED * tl);
        pos[k * 6 + 1] = Yl;
        pos[k * 6 + 2] = this.wz(ny - uy * PARTICLE_SPEED * tl);
        pos[k * 6 + 3] = this.wx(nx);
        pos[k * 6 + 4] = Yl;
        pos[k * 6 + 5] = this.wz(ny);
      }
      (this.parts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.rainL.visible) {
      const pos = (this.rainL.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const top = this.Y(this.zref) + 70 * this.sc;
      for (let k = 0; k < 500; k++) {
        let h = this.rainP[k * 3 + 2] - d * 0.9;
        if (h < 0) {
          h = 1;
          this.rainP[k * 3] = Math.random();
          this.rainP[k * 3 + 1] = Math.random();
        }
        this.rainP[k * 3 + 2] = h;
        const x = this.rainP[k * 3] * this.W, y = this.rainP[k * 3 + 1] * this.H;
        const Y = this.Y(this.zAt(x, y)) + h * (top - this.Y(this.zAt(x, y)));
        pos[k * 6] = this.wx(x);
        pos[k * 6 + 1] = Y;
        pos[k * 6 + 2] = this.wz(y);
        pos[k * 6 + 3] = this.wx(x) - 0.2;
        pos[k * 6 + 4] = Y + 2.2;
        pos[k * 6 + 5] = this.wz(y);
      }
      (this.rainL.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

function gridIndex(nx: number, ny: number): THREE.BufferAttribute {
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let q = 0;
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[q++] = a;
      idx[q++] = b;
      idx[q++] = c;
      idx[q++] = b;
      idx[q++] = d;
      idx[q++] = c;
    }
  return new THREE.BufferAttribute(idx, 1);
}

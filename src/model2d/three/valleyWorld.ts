// El valle en 3D para la sala «Modelación hidráulica 2D»: el terreno como lo ve el modelo (liso a 2 m o en píxeles
// cuando son gruesos), coloreado por altura, por cobertura o por n; las casas y los árboles; el corte del terreno;
// la malla de cálculo con las líneas de quiebre y las condiciones de borde; la celda que se inspecciona con su agua
// por dentro (subgrid); y el agua de los resultados por profundidad, velocidad, cota, amenaza o llegada. El relieve
// se puede exagerar y la escena lo dice: el agua y el terreno se estiran lo mismo.

import * as THREE from 'three';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { trees, type TreeSpot } from '../../three/scenery';
import { paint } from '../../three/machines';
import { COVER_KEYS, COVERS, LEVEE, NX, NY, ROAD, ROAD_Z, S0, Z0, truth, yc, type Raster } from '../terrain';
import type { Geometry, RunResult } from '../solver';
import { hazardClass } from '../scene';

/** Unidades del mundo por metro (el valle de 640 × 400 m queda de 320 × 200). */
export const SC = 0.5;
const ZREF = 1472;
const GX = NX / 2 + 1, GY = NY / 2 + 1;
export const wx = (x: number) => (x - NX / 2) * SC;
export const wz = (y: number) => -(y - NY / 2) * SC;

export type ColorBy = 'altura' | 'natural' | 'cobertura' | 'n';
export type Layer = 'profundidad' | 'velocidad' | 'cota' | 'amenaza' | 'llegada';

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

export interface ValleyState {
  /** Exageración vertical del relieve. */
  vex: number;
  /** Terreno que se dibuja (1 m) y, si es grueso, su ráster para dibujarlo en píxeles. */
  fine: Float32Array;
  raster: Raster | null;
  colorBy: ColorBy;
  /** n por píxel (para colorear por n). */
  n?: Float32Array | null;
  /** Casas y árboles como objetos (sobre el MDT); 'fantasma' = solo su contorno. */
  objects: 'si' | 'no' | 'fantasma';
  section: number | null;
  mesh: { c: number } | null;
  breaklines: boolean;
  bc: boolean;
  cell: { c: number; ci: number; geom: Geometry; eta: number } | null;
  water: { res: RunResult; frame: number | null; layer: Layer } | null;
  labels: PlanLabel[];
}

const COLORS = {
  depth: ['#d6ecf8', '#7fbbe2', '#2f7fb8', '#0f4c86', '#062a52'],
  vel: ['#efe6f7', '#c5a6e3', '#9168c8', '#5f3a9e', '#331e5e'],
  wse: ['#cfe7f2', '#6fb0d4', '#2a78b0', '#174d80'],
  arrival: ['#0f4c5c', '#2a8090', '#6fb6bf', '#c9e7ea'],
  hazard: ['#d6ecf8', '#fff1b8', '#fdd27a', '#f6a54b', '#e3702f', '#c0412b', '#7d1f24'],
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

/** Color del relieve: la cota sobre el plano del fondo del valle (el cauce oscuro, la llanura verde, las obras
 * y las laderas claras), así se lee el relieve aunque el valle baje 3 m de punta a punta. */
function heightColor(z: number, x: number, out: THREE.Color): THREE.Color {
  const r = z - (Z0 - S0 * x);
  const t = (r + 2.6) / 18;
  return ramp(['#4f6e74', '#6f8f6a', '#86a65b', '#9db760', '#c9be84', '#d2b98a', '#b79f78', '#a08e74'], Math.pow(Math.max(0, t), 0.6), out);
}
const COVER_COLORS = COVER_KEYS.map((c) => new THREE.Color(COVERS[c].color));
/** Colores naturales (para las partes que no colorean datos). */
const NATURAL = COVER_KEYS.map((c) => new THREE.Color(({ cauce: '#7d7461', pasto: '#8db35e', cultivo: '#b9b56a', rastrojo: '#7f9c56', bosque: '#5f8a4a', via: '#9a9894', edificio: '#b8a99a' } as Record<string, string>)[c]));
function nColor(n: number, out: THREE.Color): THREE.Color {
  const t = (Math.log(n) - Math.log(0.013)) / (Math.log(0.25) - Math.log(0.013));
  return ramp(['#f3f1e6', '#d9e2b6', '#9fbf7a', '#5f8f4c', '#2f5a2c'], t, out);
}

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
  private water: THREE.Mesh;
  private waterPos: Float32Array;
  private waterCol: Float32Array;
  private terrainMat: THREE.MeshStandardMaterial;
  /** Alturas del terreno dibujado en la grilla de 2 m (sin exagerar) y del modelo en la misma grilla. */
  private gz = new Float32Array(GX * GY);
  private keys: Record<string, string> = {};
  private arrival: { key: string; t: Float32Array } | null = null;
  readonly views: Record<string, StageView> = {};
  private framed = false;
  private sectionX = 250;
  /** Encuadres en el plano: punto mirado (x, y en m) y desplazamiento del ojo en unidades del mundo. */
  private static FRAMES: Record<string, { at: [number, number]; eye: [number, number, number]; fit: number; portrait?: [number, number, number] }> = {
    valle: { at: [320, 205], eye: [70, 150, 215], fit: 330, portrait: [40, 260, 300] },
    barrio: { at: [300, 262], eye: [30, 62, 80], fit: 150 },
    puente: { at: [ROAD.x - 10, 0], eye: [58, 34, 72], fit: 95 },
    malla: { at: [250, 222], eye: [10, 78, 62], fit: 110 },
    entrada: { at: [8, 205], eye: [-48, 42, 62], fit: 110 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(190);
    stage.controls.minDistance = 4;
    stage.controls.maxDistance = 520;
    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    // agua: la misma grilla de 2 m, con color y transparencia por vértice
    const wg = new THREE.PlaneGeometry(1, 1, GX - 1, GY - 1);
    this.waterPos = new Float32Array(GX * GY * 3);
    this.waterCol = new Float32Array(GX * GY * 4);
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        const v = j * GX + i;
        this.waterPos[v * 3] = wx(i * 2);
        this.waterPos[v * 3 + 2] = wz(j * 2);
      }
    wg.setAttribute('position', new THREE.BufferAttribute(this.waterPos, 3));
    wg.setAttribute('color', new THREE.BufferAttribute(this.waterCol, 4));
    wg.index = gridIndex(GX, GY);
    const wm = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.18, metalness: 0.05, depthWrite: false, side: THREE.DoubleSide });
    wm.userData.noLook = true;
    this.water = new THREE.Mesh(wg, wm);
    this.water.renderOrder = 3;
    this.water.visible = false;
    sc.add(this.terrainG, this.objectsG, this.ghostG, this.sectionG, this.meshG, this.bcG, this.cellG, this.water);
    this.updateViews();
    stage.view(this.views.valle, false);
  }

  /** Recalcula los encuadres con el relieve dibujado (cambian con la exageración vertical). */
  private updateViews(): void {
    const look = (x: number, y: number, eye: [number, number, number], fit: number, portrait?: [number, number, number]): StageView => {
      const ty = this.Y(this.zAt(x, y)) + 1;
      const t: [number, number, number] = [wx(x), ty, wz(y)];
      const v: StageView = { eye: [t[0] + eye[0], ty + eye[1], t[2] + eye[2]], target: t, fit };
      if (portrait) v.portrait = { eye: [t[0] + portrait[0], ty + portrait[1], t[2] + portrait[2]], target: t };
      return v;
    };
    for (const [id, f] of Object.entries(ValleyWorld.FRAMES)) this.views[id] = look(f.at[0], id === 'puente' ? yc(ROAD.x) : f.at[1], f.eye, f.fit, f.portrait);
    this.views.corte = look(this.sectionX, yc(this.sectionX), [78, 20, 10], 85);
    if (!this.views.celda) this.views.celda = look(250, 220, [12, 26, 30], 40);
  }

  private Y(z: number): number {
    return (z - ZREF) * SC * (this.st?.vex ?? 1);
  }

  /** Altura del terreno dibujado en un punto del plano [m s. n. m.]. */
  private zAt(x: number, y: number): number {
    const i = Math.max(0, Math.min(GX - 1, Math.round(x / 2))), j = Math.max(0, Math.min(GY - 1, Math.round(y / 2)));
    return this.gz[j * GX + i];
  }

  set(s: ValleyState): void {
    const prev = this.st;
    this.st = s;
    const k = (name: string, v: string) => {
      const ch = this.keys[name] !== v;
      this.keys[name] = v;
      return ch;
    };
    const vexCh = !prev || prev.vex !== s.vex;
    const terrainKey = `${s.raster ? s.raster.p : 0}|${s.colorBy}|${s.vex}`;
    const fineCh = !prev || prev.fine !== s.fine || prev.n !== s.n;
    if (s.section !== null) this.sectionX = s.section;
    if (k('terrain', terrainKey) || fineCh) {
      this.buildTerrain(s);
      this.updateViews();
      if (!this.framed) {
        this.framed = true;
        this.stage.view(this.views.valle, false);
      }
    } else if (prev && prev.section !== s.section) this.updateViews();
    if (k('objects', `${s.objects}|${s.vex}`) || vexCh) this.buildObjects(s);
    if (k('section', `${s.section}|${s.vex}`) || fineCh) this.buildSection(s);
    if (k('mesh', `${s.mesh?.c}|${s.breaklines}|${s.bc}|${s.vex}`) || fineCh) this.buildMesh(s);
    this.buildCell(s);
    this.updateWater(s);
    this.labels(s);
  }

  // ---------------------------------------------------------------- terreno

  private buildTerrain(s: ValleyState): void {
    clear(this.terrainG);
    const T = truth();
    // alturas en la grilla de 2 m (promedio de los píxeles que tocan el vértice)
    const f = s.fine;
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        let a = 0, n = 0;
        for (const dj of [-1, 0])
          for (const di of [-1, 0]) {
            const pi = i * 2 + di, pj = j * 2 + dj;
            if (pi < 0 || pj < 0 || pi >= NX || pj >= NY) continue;
            a += f[pj * NX + pi];
            n++;
          }
        this.gz[j * GX + i] = a / n;
      }
    const col = new THREE.Color();
    const tmp = new THREE.Color();
    const colorAt = (k: number, z: number) => {
      const x = (k % NX) + 0.5;
      if (s.colorBy === 'cobertura') return col.copy(COVER_COLORS[T.cover[k]]);
      if (s.colorBy === 'n' && s.n) return nColor(s.n[k], col);
      if (s.colorBy === 'natural') return heightColor(z, x, tmp) && col.copy(NATURAL[T.cover[k]]).lerp(tmp, 0.35);
      return heightColor(z, x, col);
    };
    const mat = this.terrainMat;
    mat.userData.noLook = s.colorBy === 'cobertura' || s.colorBy === 'n';
    if (s.raster && s.raster.p >= 5) this.terrainG.add(this.blocky(s.raster, colorAt));
    else {
      const g = new THREE.PlaneGeometry(1, 1, GX - 1, GY - 1);
      const pos = new Float32Array(GX * GY * 3), cl = new Float32Array(GX * GY * 3);
      for (let j = 0; j < GY; j++)
        for (let i = 0; i < GX; i++) {
          const v = j * GX + i, z = this.gz[v];
          pos[v * 3] = wx(i * 2);
          pos[v * 3 + 1] = this.Y(z);
          pos[v * 3 + 2] = wz(j * 2);
          const kk = Math.min(NY - 1, j * 2) * NX + Math.min(NX - 1, i * 2);
          colorAt(kk, z);
          if (s.colorBy !== 'cobertura' && s.colorBy !== 'n') {
            // sombreado del relieve (luz del noroeste), como un mapa de sombras de un SIG
            const zx = (this.gz[j * GX + Math.min(GX - 1, i + 1)] - this.gz[j * GX + Math.max(0, i - 1)]) / 4;
            const zy = (this.gz[Math.min(GY - 1, j + 1) * GX + i] - this.gz[Math.max(0, j - 1) * GX + i]) / 4;
            const sh = Math.max(0.62, Math.min(1.25, 1 + 2.2 * (-zx * 0.6 + zy * 0.8)));
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
    const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], color: THREE.Color) => {
      for (const p of [a, b, c, a, c, d]) {
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
        cl.push(color.r, color.g, color.b);
      }
    };
    const side = new THREE.Color();
    for (let cj = 0; cj < r.CY; cj++)
      for (let ci = 0; ci < r.CX; ci++) {
        const z = r.z[cj * r.CX + ci];
        const x0 = ci * r.p, x1 = Math.min(NX, (ci + 1) * r.p), y0 = cj * r.p, y1 = Math.min(NY, (cj + 1) * r.p);
        const kk = Math.min(NY - 1, Math.floor((y0 + y1) / 2)) * NX + Math.min(NX - 1, Math.floor((x0 + x1) / 2));
        const c = colorAt(kk, z).clone();
        const Yz = this.Y(z);
        quad([wx(x0), Yz, wz(y0)], [wx(x1), Yz, wz(y0)], [wx(x1), Yz, wz(y1)], [wx(x0), Yz, wz(y1)], [0, 1, 0], c);
        side.copy(c).multiplyScalar(0.72);
        // pared hacia el vecino del este y del norte si es más bajo (o más alto: se dibuja una sola vez)
        if (ci + 1 < r.CX) {
          const z2 = r.z[cj * r.CX + ci + 1];
          if (Math.abs(z2 - z) > 1e-3) {
            const Y2 = this.Y(z2);
            quad([wx(x1), Math.min(Yz, Y2), wz(y0)], [wx(x1), Math.min(Yz, Y2), wz(y1)], [wx(x1), Math.max(Yz, Y2), wz(y1)], [wx(x1), Math.max(Yz, Y2), wz(y0)], [z > z2 ? 1 : -1, 0, 0], side);
          }
        }
        if (cj + 1 < r.CY) {
          const z2 = r.z[(cj + 1) * r.CX + ci];
          if (Math.abs(z2 - z) > 1e-3) {
            const Y2 = this.Y(z2);
            quad([wx(x0), Math.min(Yz, Y2), wz(y1)], [wx(x1), Math.min(Yz, Y2), wz(y1)], [wx(x1), Math.max(Yz, Y2), wz(y1)], [wx(x0), Math.max(Yz, Y2), wz(y1)], [0, 0, z > z2 ? -1 : 1], side);
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
    const base = this.Y(ZREF - 3);
    const pos: number[] = [];
    const edge = (pts: [number, number][]) => {
      for (let k = 0; k + 1 < pts.length; k++) {
        const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
        const a = [wx(x1), this.Y(this.zAt(x1, y1)), wz(y1)], b = [wx(x2), this.Y(this.zAt(x2, y2)), wz(y2)];
        pos.push(...a, a[0], base, a[2], ...b, ...b, a[0], base, a[2], b[0], base, b[2]);
      }
    };
    const xs = Array.from({ length: GX }, (_, i) => i * 2), ys = Array.from({ length: GY }, (_, j) => j * 2);
    edge(xs.map((x) => [x, 0] as [number, number]));
    edge(xs.map((x) => [x, NY] as [number, number]).reverse());
    edge(ys.map((y) => [0, y] as [number, number]).reverse());
    edge(ys.map((y) => [NX, y] as [number, number]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, own(new THREE.MeshStandardMaterial({ color: '#8a7358', roughness: 1, side: THREE.DoubleSide })));
  }

  // ---------------------------------------------------------------- casas y árboles

  private buildObjects(s: ValleyState): void {
    clear(this.objectsG);
    clear(this.ghostG);
    if (s.objects === 'no') return;
    const T = truth();
    const zg = (x: number, y: number) => T.mdt[Math.max(0, Math.min(NY - 1, Math.floor(y))) * NX + Math.max(0, Math.min(NX - 1, Math.floor(x)))];
    if (s.objects === 'fantasma') {
      // contornos de las casas y del puente: lo que el MDT no tiene
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
    // casas: muros claros y techo de teja; la escuela con techo gris
    const wall = paint('#efe7da', 0.85, 0), roof = paint('#b4583c', 0.7, 0.05), roof2 = paint('#7f8a92', 0.6, 0.2);
    for (const b of T.buildings) {
      const w = (b.x1 - b.x0) * SC, d = (b.y1 - b.y0) * SC;
      const zb = zg((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      const h = this.Y(zb + b.h) - this.Y(zb);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
      body.position.set(wx((b.x0 + b.x1) / 2), this.Y(zb) + h / 2, wz((b.y0 + b.y1) / 2));
      body.castShadow = body.receiveShadow = true;
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.0001, Math.hypot(w, d) * 0.5, Math.min(w, d) * 0.45, 4, 1), b.name === 'escuela' ? roof2 : roof);
      r.rotation.y = Math.PI / 4;
      r.scale.set(w / Math.hypot(w, d) * 1.41, 1, d / Math.hypot(w, d) * 1.41);
      r.position.set(body.position.x, this.Y(zb) + h + Math.min(w, d) * 0.22, body.position.z);
      r.castShadow = true;
      this.objectsG.add(body, r);
    }
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
    // el tablero del puente con sus barandas
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8 * SC, 0.5 * SC * (this.st?.vex ?? 1), 26 * SC), paint('#b9b4aa', 0.8, 0));
    deck.position.set(wx(ROAD.x), this.Y(ROAD_Z) - 0.1, wz(yc(ROAD.x)));
    deck.castShadow = deck.receiveShadow = true;
    this.objectsG.add(deck);
    // árboles (las copas del MDS)
    const spots: TreeSpot[] = T.crowns.map((c) => ({ x: wx(c.x), y: this.Y(zg(c.x, c.y)), z: wz(c.y), r: c.r * SC * 0.9 }));
    this.objectsG.add(trees(spots, 5));
  }

  // ---------------------------------------------------------------- corte

  private buildSection(s: ValleyState): void {
    clear(this.sectionG);
    if (s.section === null) return;
    const T = truth();
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
    const plane = new THREE.Mesh(new THREE.PlaneGeometry((y1 - y0) * SC, this.Y(hi + 2) - this.Y(lo - 1)), own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })));
    plane.rotation.y = Math.PI / 2;
    plane.position.set(wx(x) + 0.05, (this.Y(hi + 2) + this.Y(lo - 1)) / 2, wz((y0 + y1) / 2));
    plane.renderOrder = 4;
    const line = (zf: (j: number) => number, color: string, lift: number) => {
      const pts: THREE.Vector3[] = [];
      for (let j = y0; j <= y1; j++) {
        const z = zf(j);
        pts.push(new THREE.Vector3(wx(x) + lift, this.Y(z), wz(j)), new THREE.Vector3(wx(x) + lift, this.Y(z), wz(j + 1)));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const l = new THREE.Line(g, own(new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true })));
      l.renderOrder = 6;
      return l;
    };
    this.sectionG.add(plane, line((j) => T.mdt[j * NX + i], '#17324d', 0.12), line((j) => s.fine[j * NX + i], '#2a78d6', 0.18));
  }

  // ---------------------------------------------------------------- malla, líneas de quiebre y bordes

  private buildMesh(s: ValleyState): void {
    clear(this.meshG);
    clear(this.bcG);
    const lift = 0.25;
    if (s.mesh) {
      const c = s.mesh.c;
      const pts: number[] = [];
      for (let x = 0; x <= NX; x += c)
        for (let y = 0; y < NY; y += 2) pts.push(wx(x), this.Y(Math.max(this.zAt(x, y), this.zAt(x, y + 2))) + lift, wz(y), wx(x), this.Y(Math.max(this.zAt(x, y), this.zAt(x, y + 2))) + lift, wz(y + 2));
      for (let y = 0; y <= NY; y += c)
        for (let x = 0; x < NX; x += 2) pts.push(wx(x), this.Y(Math.max(this.zAt(x, y), this.zAt(x + 2, y))) + lift, wz(y), wx(x + 2), this.Y(Math.max(this.zAt(x, y), this.zAt(x + 2, y))) + lift, wz(y));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.meshG.add(new THREE.LineSegments(g, own(new THREE.LineBasicMaterial({ color: '#1d2b36', transparent: true, opacity: c <= 5 ? 0.22 : 0.4 }))));
    }
    const tube = (pts: [number, number][], color: string, r: number, up = 0.4) => {
      const v = pts.map(([x, y]) => new THREE.Vector3(wx(x), this.Y(this.zAt(x, y)) + up, wz(y)));
      const curve = new THREE.CatmullRomCurve3(v);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), r, 6, false), own(new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 })));
      m.userData.noLook = true;
      return m;
    };
    if (s.breaklines) {
      const lev: [number, number][] = [];
      for (let x = LEVEE.x0 + 8; x <= LEVEE.x1 - 4; x += 4) {
        const sl = (30 * 2 * Math.PI) / 320 * Math.cos((2 * Math.PI * x) / 320);
        lev.push([x, yc(x) + LEVEE.dn * Math.sqrt(1 + sl * sl)]);
      }
      this.bcG.add(tube(lev, '#e0a526', 0.55));
      const road1: [number, number][] = [], road2: [number, number][] = [];
      for (let y = 2; y < NY - 2; y += 6) {
        if (Math.abs(y - yc(ROAD.x)) < ROAD.open + 4) continue;
        (y < yc(ROAD.x) ? road1 : road2).push([ROAD.x, y]);
      }
      if (road1.length > 1) this.bcG.add(tube(road1, '#e0a526', 0.55));
      if (road2.length > 1) this.bcG.add(tube(road2, '#e0a526', 0.55));
    }
    if (s.bc) {
      const left: [number, number][] = [], right: [number, number][] = [];
      for (let y = 1; y < NY; y += 6) {
        left.push([1, y]);
        right.push([NX - 1, y]);
      }
      this.bcG.add(tube(left, '#1f6fa5', 0.9, 0.9), tube(right, '#c0632b', 0.9, 0.9));
    }
  }

  // ---------------------------------------------------------------- la celda que se inspecciona

  private buildCell(s: ValleyState): void {
    const key = s.cell ? `${s.cell.c}|${s.cell.ci}|${s.cell.eta.toFixed(3)}|${s.cell.geom.key}|${s.vex}` : '';
    if (this.keys.cell === key) return;
    this.keys.cell = key;
    clear(this.cellG);
    if (!s.cell) return;
    const { c, ci, geom, eta } = s.cell;
    const I = ci % geom.MX, J = Math.floor(ci / geom.MX);
    const x0 = I * c, y0 = J * c;
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
      frame.push(wx(xa), top, wz(ya), wx(xb), top, wz(yb), wx(xa), top, wz(ya), wx(xa), this.Y(this.zAt(xa, ya)), wz(ya));
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(frame, 3));
    const fl = new THREE.LineSegments(fg, own(new THREE.LineBasicMaterial({ color: '#c0632b', depthTest: false, transparent: true })));
    fl.renderOrder = 7;
    this.cellG.add(fl);
    // el agua dentro de la celda, píxel por píxel: solo cubre los que están por debajo del nivel
    const pos: number[] = [];
    for (let j = y0; j < y0 + c; j++)
      for (let i = x0; i < x0 + c; i++) {
        const z = geom.z[j * NX + i];
        if (z >= eta) continue;
        const Ye = this.Y(eta);
        pos.push(wx(i), Ye, wz(j), wx(i + 1), Ye, wz(j), wx(i + 1), Ye, wz(j + 1), wx(i), Ye, wz(j), wx(i + 1), Ye, wz(j + 1), wx(i), Ye, wz(j + 1));
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
    const cx = wx(x0 + c / 2), cz = wz(y0 + c / 2), d = Math.max(14, c * SC * 1.6);
    this.views.celda = { eye: [cx + d * 0.55, this.Y(eta) + d * 0.75, cz + d * 1.05], target: [cx, this.Y(eta) - 0.5, cz], fit: Math.max(16, c * SC * 2.2) };
  }

  // ---------------------------------------------------------------- el agua

  private updateWater(s: ValleyState): void {
    const w = s.water;
    if (!w) {
      this.water.visible = false;
      return;
    }
    const r = w.res, g = r.geom;
    const eta: ArrayLike<number> = w.frame === null ? r.etaMax : r.frames[Math.max(0, Math.min(r.frames.length - 1, w.frame))];
    const pos = this.waterPos, col = this.waterCol, c = new THREE.Color();
    const C = g.c;
    if (w.layer === 'llegada') this.ensureArrival(r);
    let maxEta = -Infinity, minEta = Infinity;
    if (w.layer === 'cota')
      for (let i = 0; i < g.NC; i++)
        if (eta[i] - g.zmin[i] > 0.02) {
          maxEta = Math.max(maxEta, eta[i]);
          minEta = Math.min(minEta, eta[i]);
        }
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        const v = j * GX + i;
        const x = Math.min(NX - 0.5, Math.max(0.5, i * 2)), y = Math.min(NY - 0.5, Math.max(0.5, j * 2));
        // nivel: interpolación bilineal entre los centros de las celdas mojadas vecinas
        const fx = x / C - 0.5, fy = y / C - 0.5;
        const I0 = Math.floor(fx), J0 = Math.floor(fy);
        let sw = 0, se = 0, ci0 = -1;
        for (let dj = 0; dj <= 1; dj++)
          for (let di = 0; di <= 1; di++) {
            const I = Math.max(0, Math.min(g.MX - 1, I0 + di)), J = Math.max(0, Math.min(g.MY - 1, J0 + dj));
            const ci = J * g.MX + I;
            const wt = (di ? fx - I0 : 1 - (fx - I0)) * (dj ? fy - J0 : 1 - (fy - J0));
            if (eta[ci] - g.zmin[ci] > 0.005 && wt > 0) {
              sw += wt;
              se += wt * eta[ci];
            }
          }
        const own = Math.min(g.MY - 1, Math.floor(y / C)) * g.MX + Math.min(g.MX - 1, Math.floor(x / C));
        ci0 = own;
        const level = sw > 0 ? se / sw : eta[own];
        const zk = Math.floor(y) * NX + Math.floor(x);
        const zm = g.z[zk];
        const depth = level - zm;
        const wet = depth > 0.02 && eta[own] - g.zmin[own] > 0.005;
        pos[v * 3 + 1] = wet ? this.Y(level) + 0.04 : this.Y(this.gz[v]) - 0.3;
        if (!wet) {
          col[v * 4 + 3] = 0;
          continue;
        }
        switch (w.layer) {
          case 'velocidad':
            ramp(COLORS.vel, r.vMax[ci0] / 3, c);
            break;
          case 'cota':
            ramp(COLORS.wse, (level - minEta) / Math.max(0.5, maxEta - minEta), c);
            break;
          case 'amenaza': {
            const DV = Math.max(0, r.etaDV[ci0] - zm) * r.vDV[ci0];
            c.set(COLORS.hazard[hazardClass(depth, r.vMax[ci0], DV)]);
            break;
          }
          case 'llegada': {
            const ta = this.arrival!.t[v];
            if (!Number.isFinite(ta)) c.set('#9fb6c4');
            else ramp(COLORS.arrival, ta / Math.max(1, r.opts.duration * 60), c);
            break;
          }
          default:
            ramp(COLORS.depth, depth / 2.5, c);
        }
        col[v * 4] = c.r;
        col[v * 4 + 1] = c.g;
        col[v * 4 + 2] = c.b;
        col[v * 4 + 3] = Math.min(0.9, 0.45 + depth * 1.2);
      }
    const geo = this.water.geometry;
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.water.visible = true;
  }

  /** Tiempo de llegada (10 cm) en cada vértice, desde los mapas guardados. */
  private ensureArrival(r: RunResult): void {
    const key = `${r.geom.key}|${r.frames.length}|${r.opts.hydro.Qp}|${r.opts.eq}`;
    if (this.arrival?.key === key) return;
    const g = r.geom, t = new Float32Array(GX * GY).fill(NaN);
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        const x = Math.min(NX - 1, i * 2), y = Math.min(NY - 1, j * 2);
        const ci = Math.min(g.MY - 1, Math.floor(y / g.c)) * g.MX + Math.min(g.MX - 1, Math.floor(x / g.c));
        const zm = g.z[y * NX + x];
        for (let f = 0; f < r.frames.length; f++)
          if (r.frames[f][ci] - zm >= 0.1) {
            t[j * GX + i] = r.frameT[f];
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
      at: new THREE.Vector3(wx(l.x), this.Y(this.zAt(l.x, l.y) + (l.up ?? 4)), wz(l.y)),
      kind: l.kind ?? 'lugar',
      prio: l.prio ?? 5,
    }));
    this.stage.setLabels(L);
  }

  update(_dt: number, _t: number): void {
    /* la escena cambia con el estado; el agua se mueve con los mapas de la reproducción */
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

// Dibujo de la creciente y de sus daños. Cada efecto lee el estado calculado:
//  · Puente peatonal: el nivel del agua bajo el tablero sale del cálculo; su rótulo dice si el agua pasa
//    libre, golpea la viga o pasa por encima (en el cálculo el puente no obstruye el flujo: se rotula).
//  · Vehículos: posición, rumbo y estado vienen del motor (CitySim.drift); aquí solo se les da forma y
//    flotación visual.
//  · Marcas en las fachadas: cada cara de muro se mancha desde el suelo hasta la profundidad máxima
//    calculada en la celda vecina (no se amplifica).
//  · Salpicadura contra los muros: sube hasta la carga de velocidad v²/2g del agua que golpea el muro.
//  · Material flotante (troncos, ramas y basura): ilustrativo; entra con la creciente y se mueve con la
//    velocidad calculada; queda depositado donde el agua se vuelve muy somera.
//  · Coberturas: muros de cabecera con las bocas de los cajones, aletas, baranda y troncos atascados en la
//    entrada. La cantidad de troncos sigue la obstrucción del cálculo (fija o creciendo con la creciente); el
//    rótulo muestra el caudal calculado por el cajón y por encima de la vía. La baranda es abierta: en el
//    cálculo no detiene el agua que pasa sobre la vía.

import * as THREE from 'three';
import type { Compiled } from '../sim/compile';
import type { CitySim, DriftState } from '../sim/engine';
import { HAZARD, exposureOf } from '../sim/hazard';
import type { Scenario } from '../sim/scenario';
import { buildingName } from './floodNames';
import { fmtNum } from './palette';

type W = (x: number, y: number, z: number, out?: THREE.Vector3) => THREE.Vector3;

export interface FloodLabel {
  id: string;
  text: string;
  sub?: string;
  priority: number;
  kind: 'aviso' | 'dano';
  color?: string;
  at: THREE.Vector3;
}

interface Face {
  /** Celda libre junto al muro y punto del muro (modelo) con su normal hacia afuera. */
  k: number;
  b: number;
  px: number;
  py: number;
  nx: number;
  ny: number;
}

const MAX_FLOAT = 200;
const UP = new THREE.Vector3(0, 1, 0);
const MAX_SPRAY = 260;
const G = 9.81;

/** Generador pseudoaleatorio con semilla (para que el material flotante sea reproducible). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class FloodView {
  readonly group = new THREE.Group();
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private faces: Face[] = [];
  private stain: THREE.InstancedMesh | null = null;
  private stainLine: THREE.InstancedMesh | null = null;
  private lastStainT = -1;
  private vehicles: { g: THREE.Group; o: DriftState; bodyH: number }[] = [];
  private bridge: { x: number; y0: number; y1: number; deck: number; soffit: number; i: number; j0: number; j1: number } | null = null;
  /** Coberturas: troncos atascados (ordenados de abajo hacia arriba) y punto del rótulo. */
  private culverts: { logs: THREE.InstancedMesh; items: { x: number; y: number; z: number; dz: number; len: number; rad: number; a: number; tilt: number }[]; at: THREE.Vector3; key: string }[] = [];
  // material flotante
  private fl = {
    x: new Float32Array(MAX_FLOAT),
    y: new Float32Array(MAX_FLOAT),
    a: new Float32Array(MAX_FLOAT),
    len: new Float32Array(MAX_FLOAT),
    type: new Uint8Array(MAX_FLOAT),
    state: new Uint8Array(MAX_FLOAT), // 0 libre (sin usar), 1 flota, 2 depositado
    born: new Float32Array(MAX_FLOAT),
  };
  private logs: THREE.InstancedMesh;
  private trash: THREE.InstancedMesh;
  private lastSimT = -1;
  private spawnAcc = 0;
  private rnd = rng(20261109);
  // salpicadura
  private sp = {
    x: new Float32Array(MAX_SPRAY),
    y: new Float32Array(MAX_SPRAY),
    z: new Float32Array(MAX_SPRAY),
    vx: new Float32Array(MAX_SPRAY),
    vz: new Float32Array(MAX_SPRAY),
    vy: new Float32Array(MAX_SPRAY),
    life: new Float32Array(MAX_SPRAY),
    n: 0,
  };
  private spray: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private e = new THREE.Euler();
  /** Rótulos de esta capa (puente, vehículos movidos, edificaciones dañadas). */
  labels: FloodLabel[] = [];
  labelsKey = '';

  constructor(
    private readonly sc: Scenario,
    private readonly c: Compiled,
    private readonly w: W,
  ) {
    this.buildFaces();
    this.buildBridge();
    this.buildCulverts();
    this.buildVehicles();
    // troncos y ramas (un cilindro escalado) y basura (cajas de colores)
    const logG = this.geo(new THREE.CylinderGeometry(1, 1, 1, 7).rotateZ(Math.PI / 2));
    this.logs = new THREE.InstancedMesh(logG, this.mat(new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.95 })), MAX_FLOAT);
    this.logs.count = 0;
    this.logs.frustumCulled = false;
    const boxG = this.geo(new THREE.BoxGeometry(1, 1, 1));
    this.trash = new THREE.InstancedMesh(boxG, this.mat(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 })), MAX_FLOAT);
    // colores por instancia creados desde el inicio (el sombreador se compila con ellos)
    const white = new THREE.Color('#ffffff');
    for (let q = 0; q < MAX_FLOAT; q++) this.trash.setColorAt(q, white);
    this.trash.count = 0;
    this.trash.frustumCulled = false;
    const dropG = this.geo(new THREE.IcosahedronGeometry(1, 0));
    this.spray = new THREE.InstancedMesh(dropG, this.mat(new THREE.MeshBasicMaterial({ color: '#efe9dc', transparent: true, opacity: 0.75, depthWrite: false })), MAX_SPRAY);
    this.spray.count = 0;
    this.spray.frustumCulled = false;
    this.group.add(this.logs, this.trash, this.spray);
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }
  private mat<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  // ------------------------------------------------------------ marcas en las fachadas
  /** Caras de muro: para cada celda libre vecina de un edificio, el punto del muro del polígono más cercano. */
  private buildFaces(): void {
    const { nx, ny, dx, building, solid } = this.c;
    const polys = this.sc.buildings.map((b) => b.polygon);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const kb = j * nx + i;
        const b = building[kb];
        if (b < 0) continue;
        const nbs: [number, number, number][] = [[1, 0, i < nx - 1 ? kb + 1 : -1], [-1, 0, i > 0 ? kb - 1 : -1], [0, 1, j < ny - 1 ? kb + nx : -1], [0, -1, j > 0 ? kb - nx : -1]];
        for (const [ox, oy, k] of nbs) {
          if (k < 0 || solid[k] || building[k] >= 0) continue;
          // centro de la cara entre la celda del edificio y la celda libre
          const cx = (i + 0.5 + ox * 0.5) * dx, cy = (j + 0.5 + oy * 0.5) * dx;
          // arista del polígono más cercana con normal parecida
          const poly = polys[b];
          let best = Infinity, px = cx, py = cy;
          for (let a = 0, z = poly.length - 1; a < poly.length; z = a++) {
            const [x0, y0] = poly[z], [x1, y1] = poly[a];
            const ex = x1 - x0, ey = y1 - y0, L = Math.hypot(ex, ey);
            if (L < 1e-6) continue;
            // normal de la arista (cualquiera de los dos sentidos): se pide que sea paralela a la de la cara
            const nxE = ey / L, nyE = -ex / L;
            if (Math.abs(nxE * ox + nyE * oy) < 0.7) continue;
            const t = Math.max(0, Math.min(1, ((cx - x0) * ex + (cy - y0) * ey) / (L * L)));
            const qx = x0 + t * ex, qy = y0 + t * ey;
            const d = Math.hypot(cx - qx, cy - qy);
            if (d < best) {
              best = d;
              px = qx;
              py = qy;
            }
          }
          if (best > 1.5 * dx) continue;
          this.faces.push({ k, b, px: px + ox * 0.035, py: py + oy * 0.035, nx: ox, ny: oy });
        }
      }
    }
    if (!this.faces.length) return;
    const plane = this.geo(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0));
    this.stain = new THREE.InstancedMesh(plane, this.mat(new THREE.MeshStandardMaterial({ color: '#6a5136', roughness: 1, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide })), this.faces.length);
    this.stainLine = new THREE.InstancedMesh(plane, this.mat(new THREE.MeshStandardMaterial({ color: '#3b2a1b', roughness: 1, side: THREE.DoubleSide })), this.faces.length);
    for (const m of [this.stain, this.stainLine]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 3;
      this.group.add(m);
    }
  }

  private updateStains(sim: CitySim): void {
    if (!this.stain || !this.stainLine) return;
    const { z, dx } = this.c;
    const hm = sim.hmaxField;
    let n = 0;
    for (const f of this.faces) {
      const d = hm[f.k];
      if (d < 0.1) continue;
      const base = z[f.k];
      this.w(f.px, f.py, base, this.v);
      // el plano mira a +z; girado φ = atan2(nx, −ny) en torno a la vertical mira a (nx, 0, −ny) en el
      // mundo, que es la normal (nx, ny) del muro en el modelo
      this.q.setFromAxisAngle(UP, Math.atan2(f.nx, -f.ny));
      this.s.set(dx * 1.02, d, 1);
      this.stain.setMatrixAt(n, this.m4.compose(this.v, this.q, this.s));
      this.w(f.px, f.py, base + d - 0.035, this.v);
      this.s.set(dx * 1.02, 0.06, 1);
      this.stainLine.setMatrixAt(n, this.m4.compose(this.v, this.q, this.s));
      n++;
    }
    this.stain.count = n;
    this.stainLine.count = n;
    this.stain.instanceMatrix.needsUpdate = true;
    this.stainLine.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ puente peatonal
  private buildBridge(): void {
    const ck = this.sc.creek, cr = this.c.creek;
    const fb = ck?.footbridge;
    if (!ck || !cr || !fb) return;
    const { nx, ny, dx, z } = this.c;
    // eje de la quebrada en x (interpolado) y cota de la orilla en esa columna
    const ax = ck.axis;
    let yc = ax[0][1];
    for (let q = 1; q < ax.length; q++) if (fb.x <= ax[q][0]) {
      const f = (fb.x - ax[q - 1][0]) / Math.max(1e-9, ax[q][0] - ax[q - 1][0]);
      yc = ax[q - 1][1] + f * (ax[q][1] - ax[q - 1][1]);
      break;
    }
    const i = Math.min(nx - 1, Math.max(0, Math.floor(fb.x / dx)));
    const zAt = (y: number) => z[Math.min(ny - 1, Math.max(0, Math.floor(y / dx))) * nx + i];
    const bank = Math.min(zAt(yc - ck.section.bankHalfWidthM), zAt(yc + ck.section.bankHalfWidthM));
    const deck = bank + fb.deckAboveBankM;
    const soffit = deck - fb.beamM;
    const y0 = yc - fb.halfLengthM, y1 = yc + fb.halfLengthM;
    const j0 = Math.max(0, Math.floor(y0 / dx)), j1 = Math.min(ny - 1, Math.floor(y1 / dx));
    this.bridge = { x: fb.x, y0, y1, deck, soffit, i, j0, j1 };
    const concrete = this.mat(new THREE.MeshStandardMaterial({ color: '#a7a9a6', roughness: 0.85 }));
    const steel = this.mat(new THREE.MeshStandardMaterial({ color: '#2f6b4f', roughness: 0.5, metalness: 0.4 }));
    const box = this.geo(new THREE.BoxGeometry(1, 1, 1));
    const L = y1 - y0;
    const add = (m: THREE.Material, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) => {
      const o = new THREE.Mesh(box, m);
      this.w(cx, cy, cz, o.position);
      // escala en el mundo: x (este), y (arriba), z (sur)
      o.scale.set(sx, sz, sy);
      o.castShadow = true;
      this.group.add(o);
    };
    // tablero y vigas
    add(concrete, fb.x, yc, deck - 0.08, fb.widthM, L, 0.16);
    add(concrete, fb.x - fb.widthM / 2 + 0.15, yc, soffit + (fb.beamM - 0.16) / 2, 0.22, L, fb.beamM - 0.16);
    add(concrete, fb.x + fb.widthM / 2 - 0.15, yc, soffit + (fb.beamM - 0.16) / 2, 0.22, L, fb.beamM - 0.16);
    // estribos hasta el terreno
    for (const ye of [y0 + 0.4, y1 - 0.4]) {
      const g = zAt(ye);
      const hgt = Math.max(0.3, deck - g);
      add(concrete, fb.x, ye, g + hgt / 2 - 0.1, fb.widthM + 0.3, 0.8, hgt);
    }
    // barandas: postes y pasamanos
    for (const side of [-1, 1]) {
      const xr = fb.x + side * (fb.widthM / 2 - 0.05);
      for (let y = y0 + 0.3; y <= y1 - 0.3 + 1e-6; y += 1.25) add(steel, xr, y, deck + 0.5, 0.05, 0.05, 1);
      add(steel, xr, yc, deck + 1.0, 0.06, L - 0.4, 0.06);
      add(steel, xr, yc, deck + 0.55, 0.04, L - 0.4, 0.04);
    }
  }

  // ------------------------------------------------------------ coberturas
  /**
   * Prisma recto de muro entre los puntos A y B del modelo, con espesor t, base zb y corona que va de ztA
   * (en A) a ztB (en B). Sirve para cabezales, tabiques y aletas con la corona inclinada.
   */
  private wall(m: THREE.Material, ax: number, ay: number, bx: number, by: number, t: number, zb: number, ztA: number, ztB: number): void {
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-6) return;
    const nx = (-(by - ay) / L) * (t / 2), ny = ((bx - ax) / L) * (t / 2);
    const P = (x: number, y: number, z: number) => this.w(x, y, z, new THREE.Vector3());
    // 0-3 base, 4-7 corona; orden A−n, B−n, B+n, A+n
    const v = [
      P(ax - nx, ay - ny, zb), P(bx - nx, by - ny, zb), P(bx + nx, by + ny, zb), P(ax + nx, ay + ny, zb),
      P(ax - nx, ay - ny, ztA), P(bx - nx, by - ny, ztB), P(bx + nx, by + ny, ztB), P(ax + nx, ay + ny, ztA),
    ];
    const quads = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7], [3, 2, 1, 0]];
    const pos: number[] = [];
    for (const [a, b, c2, d] of quads) for (const q of [a, b, c2, a, c2, d]) pos.push(v[q].x, v[q].y, v[q].z);
    const g = this.geo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // el sentido de las caras depende de la orientación del muro: se dibujan por ambos lados
    const o = new THREE.Mesh(g, m);
    o.castShadow = true;
    o.receiveShadow = true;
    this.group.add(o);
  }

  private buildCulverts(): void {
    const specs = this.sc.culverts ?? [];
    if (!specs.length) return;
    const { nx, ny, dx, z } = this.c;
    const concrete = this.mat(new THREE.MeshStandardMaterial({ color: '#b3b1aa', roughness: 0.9, side: THREE.DoubleSide }));
    const dark = this.mat(new THREE.MeshBasicMaterial({ color: '#16191c' }));
    const steel = this.mat(new THREE.MeshStandardMaterial({ color: '#9aa4aa', roughness: 0.45, metalness: 0.6 }));
    const box = this.geo(new THREE.BoxGeometry(1, 1, 1));
    const zAt = (x: number, y: number) => z[Math.min(ny - 1, Math.max(0, Math.floor(y / dx))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(x / dx)))];
    const cyl = this.geo(new THREE.CylinderGeometry(1, 1, 1, 7).rotateZ(Math.PI / 2));
    const bark = this.mat(new THREE.MeshStandardMaterial({ color: '#5e4229', roughness: 0.95 }));
    specs.forEach((cs, ci) => {
      const cu = this.c.culverts[ci];
      if (!cu) return;
      const pier = 0.3;
      const B = cs.spanM / cs.barrels;
      const half = cs.spanM / 2 + ((cs.barrels - 1) * pier) / 2;
      // caras: la del lado de la entrada mira hacia la entrada (s = −1 si la entrada está al oeste)
      const i0 = Math.ceil(cs.road.x0 / dx - 1e-9), i1 = Math.floor(cs.road.x1 / dx + 1e-9) - 1;
      const inWest = cs.inlet[0] < cs.road.x0;
      const faces = [
        { yc: cs.inlet[1], bed: cu.zIn, s: inWest ? -1 : 1, xr: inWest ? (i0 + 0.5) * dx : (i1 + 0.5) * dx, xc: inWest ? (i0 - 0.5) * dx + 0.05 : (i1 + 1.5) * dx - 0.05, inlet: true },
        { yc: cs.outlet[1], bed: cu.zOut, s: inWest ? 1 : -1, xr: inWest ? (i1 + 0.5) * dx : (i0 + 0.5) * dx, xc: inWest ? (i1 + 1.5) * dx - 0.05 : (i0 - 0.5) * dx + 0.05, inlet: false },
      ];
      let logs: THREE.InstancedMesh | null = null;
      const items: { x: number; y: number; z: number; dz: number; len: number; rad: number; a: number; tilt: number }[] = [];
      let at = new THREE.Vector3();
      for (const f of faces) {
        const deck = zAt(f.xr, f.yc);
        const top = deck + 0.12;
        const xm = (f.xr + f.xc) / 2, t = Math.abs(f.xr - f.xc);
        const yA = f.yc - half - 0.35, yB = f.yc + half + 0.35;
        const soffit = f.bed + cs.riseM;
        // dintel sobre las bocas y tabiques entre ellas
        this.wall(concrete, xm, yA, xm, yB, t, soffit, top, top);
        let y = yA;
        for (let q = 0; q <= cs.barrels; q++) {
          const yEnd = q === 0 ? f.yc - half : q === cs.barrels ? yB : y + pier;
          this.wall(concrete, xm, y, xm, yEnd, t, f.bed - 0.25, soffit, soffit);
          if (q < cs.barrels) {
            // boca del cajón: oscura, un poco hacia adentro
            const o = new THREE.Mesh(box, dark);
            this.w(f.xc + f.s * -0.45, yEnd + B / 2, f.bed + cs.riseM / 2, o.position);
            o.scale.set(0.9, cs.riseM - 0.02, B - 0.02);
            this.group.add(o);
            y = yEnd + B;
          }
        }
        // aletas a 45° hacia afuera, con la corona bajando hasta la orilla
        for (const side of [-1, 1]) {
          const ax = f.xc, ay = side < 0 ? yA : yB;
          const L = 3.4;
          const bx = ax + f.s * L * Math.SQRT1_2, by = ay + side * L * Math.SQRT1_2;
          const ground = zAt(bx, by);
          this.wall(concrete, ax, ay, bx, by, 0.3, f.bed - 0.25, top, Math.max(ground + 0.25, f.bed + 0.6));
        }
        // baranda abierta sobre el cabezal (postes y dos pasamanos)
        const xg = f.xr + f.s * 0.2;
        const add = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) => {
          const o = new THREE.Mesh(box, steel);
          this.w(cx, cy, cz, o.position);
          o.scale.set(sx, sz, sy);
          o.castShadow = true;
          this.group.add(o);
        };
        for (let yy = yA + 0.2; yy <= yB - 0.2 + 1e-6; yy += (yB - yA - 0.4) / Math.round((yB - yA - 0.4) / 1.6)) add(xg, yy, top + 0.45, 0.08, 0.08, 0.9);
        add(xg, f.yc, top + 0.85, 0.07, yB - yA - 0.3, 0.07);
        add(xg, f.yc, top + 0.48, 0.05, yB - yA - 0.3, 0.05);
        if (f.inlet) {
          // troncos y ramas que la creciente atasca contra la boca de entrada: posiciones fijas (semilla) de
          // abajo hacia arriba; se muestran tantos como pide la obstrucción calculada
          // Con agua, el atasco flota contra la boca (o contra la baranda si el agua pasa sobre la vía): cada
          // pieza queda a una profundidad fija bajo el nivel calculado en la entrada; en seco reposa apilada.
          const r = rng(7771 + ci);
          const layers = Math.ceil(cs.riseM / 0.3);
          for (let L2 = 0; L2 < layers; L2++) {
            const perLayer = 7 + Math.floor(r() * 3);
            for (let q = 0; q < perLayer; q++) {
              const log = r() < 0.55;
              items.push({
                x: f.xc + f.s * (0.35 + 0.3 * r() + 0.1 * L2),
                y: f.yc + (r() - 0.5) * 2 * (half - 0.5),
                z: f.bed + 0.18 + L2 * 0.3 + 0.08 * r(),
                dz: 0.04 + 0.1 * L2 + 0.05 * r(),
                len: log ? 2.4 + 2.6 * r() : 1.0 + 1.4 * r(),
                rad: log ? 0.14 + 0.1 * r() : 0.05 + 0.03 * r(),
                a: Math.PI / 2 + (r() - 0.5) * 0.9,
                tilt: (r() - 0.5) * 0.35,
              });
            }
          }
          items.sort((p2, q2) => p2.z - q2.z);
          logs = new THREE.InstancedMesh(cyl, bark, items.length);
          logs.count = 0;
          logs.castShadow = true;
          logs.frustumCulled = false;
          this.group.add(logs);
        }
        if (!f.inlet) at = this.w((cs.road.x0 + cs.road.x1) / 2, (cs.inlet[1] + cs.outlet[1]) / 2, top + 2.2);
      }
      if (logs) this.culverts.push({ logs, items, at, key: '' });
    });
  }

  private updateCulverts(sim: CitySim): void {
    this.culverts.forEach((cv, ci) => {
      const st = sim.culv[ci];
      if (!st) return;
      const show = Math.round(st.obs * cv.items.length);
      const up = st.up;
      const key = `${show}|${up.toFixed(2)}`;
      if (key === cv.key) return;
      cv.key = key;
      for (let q = 0; q < show; q++) {
        const it = cv.items[q];
        this.w(it.x, it.y, Math.max(it.z, up - it.dz), this.v);
        this.q.setFromEuler(this.e.set(0, it.a, it.tilt));
        this.s.set(it.len, it.rad, it.rad);
        cv.logs.setMatrixAt(q, this.m4.compose(this.v, this.q, this.s));
      }
      cv.logs.count = show;
      cv.logs.instanceMatrix.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------ vehículos
  private buildVehicles(): void {
    const box = this.geo(new THREE.BoxGeometry(1, 1, 1));
    const wheel = this.geo(new THREE.CylinderGeometry(1, 1, 1, 12).rotateX(Math.PI / 2));
    const tire = this.mat(new THREE.MeshStandardMaterial({ color: '#1d1f22', roughness: 0.9 }));
    const glass = this.mat(new THREE.MeshStandardMaterial({ color: '#27323d', roughness: 0.2, metalness: 0.3 }));
    for (const o of this.c.exposed) {
      const g = new THREE.Group();
      const paint = this.mat(new THREE.MeshStandardMaterial({ color: o.color ?? '#8a8f96', roughness: 0.35, metalness: 0.35 }));
      const part = (m: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
        const p = new THREE.Mesh(geo, m);
        p.position.set(x, y, z);
        p.scale.set(sx, sy, sz);
        p.castShadow = true;
        g.add(p);
      };
      let bodyH = 0.6;
      if (o.kind === 'carro') {
        part(paint, box, 0, 0.62, 0, 4.1, 0.62, 1.72);
        part(paint, box, -0.25, 1.15, 0, 2.1, 0.5, 1.55);
        part(glass, box, -0.25, 1.16, 0, 2.14, 0.4, 1.58);
        for (const [x, z] of [[1.3, 0.78], [1.3, -0.78], [-1.35, 0.78], [-1.35, -0.78]]) part(tire, wheel, x, 0.32, z, 0.32, 0.32, 0.24);
        bodyH = 1.4;
      } else {
        part(paint, box, 0, 0.62, 0, 1.5, 0.32, 0.26);
        part(tire, box, -0.25, 0.86, 0, 0.6, 0.12, 0.3);
        for (const x of [0.68, -0.7]) part(tire, wheel, x, 0.3, 0, 0.3, 0.3, 0.1);
        part(paint, box, 0.62, 1.0, 0, 0.08, 0.5, 0.6);
        bodyH = 1.1;
      }
      this.group.add(g);
      this.vehicles.push({ g, o: null as unknown as DriftState, bodyH });
    }
  }

  private updateVehicles(sim: CitySim, time: number, reduced: boolean): void {
    const { nx, ny, dx, z } = this.c;
    sim.drift.forEach((o, q) => {
      const vh = this.vehicles[q];
      if (!vh) return;
      vh.o = o;
      if (o.state === 'fuera') {
        vh.g.visible = false;
        return;
      }
      vh.g.visible = true;
      const i = Math.min(nx - 1, Math.max(0, Math.floor(o.x / dx))), j = Math.min(ny - 1, Math.max(0, Math.floor(o.y / dx)));
      const k = j * nx + i;
      const ground = z[k];
      const h = sim.h[k];
      let zz = ground;
      let roll = 0, pitch = 0;
      if (o.state === 'arrastrado') {
        // flota a medias: el agua lo levanta hasta casi cubrirlo (dibujo); se balancea con la corriente
        zz = ground + Math.max(0, Math.min(h - vh.bodyH * 0.55, h));
        if (!reduced) {
          roll = 0.12 * Math.sin(time * 2.3 + q);
          pitch = 0.08 * Math.sin(time * 1.7 + 2 * q);
        }
      } else if (o.state === 'varado') {
        roll = 0.18;
        pitch = -0.06;
      }
      this.w(o.x, o.y, zz, vh.g.position);
      vh.g.rotation.set(roll, o.heading, pitch, 'YXZ');
    });
  }

  // ------------------------------------------------------------ material flotante
  private updateDebris(sim: CitySim): void {
    const cr = this.c.creek;
    const F = this.fl;
    const { nx, ny, dx, solid, z } = this.c;
    if (sim.t < this.lastSimT || this.lastSimT < 0) {
      F.state.fill(0);
      this.spawnAcc = 0;
      this.rnd = rng(20261109);
      this.lastSimT = sim.t;
    }
    // tramo de tiempo simulado desde el último cuadro (los saltos largos se recorren solo en su último minuto)
    let t = Math.max(this.lastSimT, sim.t - 60);
    this.lastSimT = sim.t;
    const cv = sim.shared.creek?.sedimentCv ?? 0;
    while (t < sim.t - 1e-6) {
      const h = Math.min(0.5, sim.t - t);
      t += h;
      // entra material flotante con la creciente, más cuanto mayor el caudal y el lodo
      if (cr && sim.creekHydro && cr.cells.length) {
        const rel = sim.creekInflowAt(t) / Math.max(1, cr.capacity);
        if (rel > 0.3) this.spawnAcc += h * 0.3 * rel * (1 + 4 * cv);
        while (this.spawnAcc >= 1) {
          this.spawnAcc -= 1;
          let slot = -1;
          for (let q = 0; q < MAX_FLOAT; q++) if (F.state[q] === 0) {
            slot = q;
            break;
          }
          if (slot < 0) {
            // recicla el depósito más antiguo
            let old = Infinity;
            for (let q = 0; q < MAX_FLOAT; q++) if (F.state[q] === 2 && F.born[q] < old) {
              old = F.born[q];
              slot = q;
            }
          }
          if (slot < 0) break;
          const kc = cr.cells[Math.floor(this.rnd() * cr.cells.length)];
          F.x[slot] = ((kc % nx) + 0.2 + 0.6 * this.rnd()) * dx;
          F.y[slot] = (Math.floor(kc / nx) + 0.2 + 0.6 * this.rnd()) * dx;
          const r = this.rnd();
          F.type[slot] = r < 0.4 ? 0 : r < 0.65 ? 1 : 2;
          F.len[slot] = F.type[slot] === 0 ? 2.2 + 2.4 * this.rnd() : F.type[slot] === 1 ? 1 + 1.4 * this.rnd() : 0.35 + 0.4 * this.rnd();
          F.a[slot] = this.rnd() * Math.PI * 2;
          F.state[slot] = 1;
          F.born[slot] = t;
        }
      }
      // avance con la velocidad calculada
      for (let q = 0; q < MAX_FLOAT; q++) {
        if (F.state[q] !== 1) continue;
        const i = Math.floor(F.x[q] / dx), j = Math.floor(F.y[q] / dx);
        if (i < 0 || j < 0 || i >= nx || j >= ny) {
          F.state[q] = 0;
          continue;
        }
        const k = j * nx + i;
        const [u, v] = sim.velocityCapped(k);
        // queda depositado donde el agua se vuelve muy somera o lenta para arrastrarlo
        if (sim.h[k] < 0.06 || (sim.h[k] < 0.15 && Math.hypot(u, v) < 0.3)) {
          F.state[q] = 2;
          continue;
        }
        const xn = F.x[q] + 0.9 * u * h, yn = F.y[q] + 0.9 * v * h;
        const ii = Math.floor(xn / dx), jj = Math.floor(yn / dx);
        if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && solid[jj * nx + ii]) {
          F.state[q] = 2; // atrapado contra un muro
          continue;
        }
        F.x[q] = xn;
        F.y[q] = yn;
        const sp = Math.hypot(u, v);
        if (sp > 0.05) {
          let da = Math.atan2(v, u) - F.a[q];
          da = Math.atan2(Math.sin(da), Math.cos(da));
          F.a[q] += da * Math.min(1, 0.5 * h);
        }
      }
    }
    // instancias
    let nl = 0, nt = 0;
    const col = new THREE.Color();
    for (let q = 0; q < MAX_FLOAT; q++) {
      if (F.state[q] === 0) continue;
      const i = Math.min(nx - 1, Math.max(0, Math.floor(F.x[q] / dx))), j = Math.min(ny - 1, Math.max(0, Math.floor(F.y[q] / dx)));
      const k = j * nx + i;
      const surf = z[k] + (F.state[q] === 1 ? sim.h[k] : 0);
      this.w(F.x[q], F.y[q], surf + (F.type[q] === 2 ? 0.02 : 0.0), this.v);
      this.q.setFromEuler(this.e.set(0, F.a[q], F.state[q] === 1 ? 0.1 * Math.sin(F.born[q] * 3) : 0));
      if (F.type[q] === 2) {
        const sz = F.len[q];
        this.s.set(sz, sz * 0.45, sz * 0.7);
        this.trash.setMatrixAt(nt, this.m4.compose(this.v, this.q, this.s));
        const c3 = (F.born[q] * 7.31) % 1;
        col.set(c3 < 0.3 ? '#e8e6df' : c3 < 0.5 ? '#3f7fc4' : c3 < 0.7 ? '#c94b3a' : c3 < 0.85 ? '#2f2f33' : '#e2b93b');
        this.trash.setColorAt(nt, col);
        nt++;
      } else {
        const r = F.type[q] === 0 ? 0.17 + 0.03 * F.len[q] : 0.07;
        this.s.set(F.len[q], r, r);
        this.logs.setMatrixAt(nl, this.m4.compose(this.v, this.q, this.s));
        nl++;
      }
    }
    this.logs.count = nl;
    this.trash.count = nt;
    this.logs.instanceMatrix.needsUpdate = true;
    this.trash.instanceMatrix.needsUpdate = true;
    if (this.trash.instanceColor) this.trash.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ salpicadura contra los muros
  private updateSpray(sim: CitySim, dtReal: number, reduced: boolean): void {
    const S = this.sp;
    const { dx, z } = this.c;
    // nuevas gotas donde el agua corre contra un muro (velocidad normal al muro y profundidad suficientes)
    if (!reduced && dtReal > 0 && sim.t < sim.endT) {
      for (const f of this.faces) {
        const h = sim.h[f.k];
        if (h < 0.15) continue;
        const [u, v] = sim.velocityCapped(f.k);
        const vn = -(u * f.nx + v * f.ny); // hacia el muro
        if (vn < 1.2) continue;
        const rate = (vn - 1.1) * 6 * dtReal;
        let n = Math.floor(rate) + (this.rnd() < rate % 1 ? 1 : 0);
        while (n-- > 0 && S.n < MAX_SPRAY) {
          const q = S.n++;
          const run = (vn * vn) / (2 * G); // carga de velocidad: altura que alcanza el agua al chocar
          S.x[q] = f.px + f.nx * 0.05 + (this.rnd() - 0.5) * dx * 0.8 * Math.abs(f.ny);
          S.y[q] = f.py + f.ny * 0.05 + (this.rnd() - 0.5) * dx * 0.8 * Math.abs(f.nx);
          S.z[q] = z[f.k] + h;
          const up = Math.sqrt(2 * G * run) * (0.6 + 0.5 * this.rnd());
          S.vz[q] = up;
          S.vx[q] = f.nx * 0.6 * this.rnd() + (this.rnd() - 0.5) * 0.4;
          S.vy[q] = f.ny * 0.6 * this.rnd() + (this.rnd() - 0.5) * 0.4;
          S.life[q] = (2 * up) / G + 0.05;
        }
      }
    }
    let n = 0;
    for (let q = 0; q < S.n; q++) {
      S.life[q] -= dtReal;
      if (S.life[q] <= 0) continue;
      S.vz[q] -= G * dtReal;
      S.x[q] += S.vx[q] * dtReal;
      S.y[q] += S.vy[q] * dtReal;
      S.z[q] += S.vz[q] * dtReal;
      if (n !== q) {
        S.x[n] = S.x[q];
        S.y[n] = S.y[q];
        S.z[n] = S.z[q];
        S.vx[n] = S.vx[q];
        S.vy[n] = S.vy[q];
        S.vz[n] = S.vz[q];
        S.life[n] = S.life[q];
      }
      n++;
    }
    S.n = n;
    for (let q = 0; q < n; q++) {
      this.w(S.x[q], S.y[q], S.z[q], this.v);
      const r = 0.06 + 0.04 * ((q * 0.37) % 1);
      this.s.set(r, r, r);
      this.spray.setMatrixAt(q, this.m4.compose(this.v, this.q.identity(), this.s));
    }
    this.spray.count = n;
    this.spray.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ rótulos
  private updateLabels(sim: CitySim): void {
    const out: FloodLabel[] = [];
    const { nx, dx, z } = this.c;
    const b = this.bridge;
    if (b) {
      let level = -Infinity, lmax = -Infinity;
      for (let j = b.j0; j <= b.j1; j++) {
        const k = j * nx + b.i;
        if (sim.h[k] > 0.01) level = Math.max(level, z[k] + sim.h[k]);
        if (sim.hmaxField[k] > 0.01) lmax = Math.max(lmax, z[k] + sim.hmaxField[k]);
      }
      let sub: string;
      if (level >= b.deck + 0.02) sub = `el agua pasa ${fmtNum(level - b.deck, 1)} m sobre el tablero`;
      else if (level >= b.soffit) sub = 'el agua golpea la viga';
      else if (Number.isFinite(level)) sub = `libre: ${fmtNum(b.soffit - level, 1)} m bajo la viga`;
      else sub = 'libre';
      if (!(level >= b.soffit) && lmax >= b.soffit) sub += lmax >= b.deck ? ' · ya pasó sobre el tablero' : ' · ya golpeó la viga';
      out.push({ id: 'fb', text: 'Puente peatonal', sub, priority: 5, kind: level >= b.soffit ? 'dano' : 'aviso', color: level >= b.deck ? HAZARD[5].color : level >= b.soffit ? HAZARD[3].color : undefined, at: this.w(b.x, (b.y0 + b.y1) / 2, b.deck + 1.6) });
    }
    this.c.culverts.forEach((cu, ci) => {
      const st = sim.culv[ci], cv = this.culverts[ci];
      if (!st || !cv) return;
      const parts = [st.q >= 0.05 ? `${fmtNum(st.q, 1)} m³/s por los cajones` : 'sin caudal'];
      if (st.over > 0.05) parts.push(`${fmtNum(st.over, 1)} m³/s sobre la vía`);
      if (st.obs >= 0.01) parts.push(`tapada ${fmtNum(st.obs * 100, 0)} %`);
      const over = st.over > 0.05;
      out.push({ id: `cob-${cu.id}`, text: cu.name, sub: parts.join(' · '), priority: 6, kind: over ? 'dano' : 'aviso', color: over ? HAZARD[4].color : st.obs >= 0.01 ? HAZARD[2].color : undefined, at: cv.at });
    });
    for (const vh of this.vehicles) {
      const o = vh.o;
      if (!o || o.state === 'quieto' || o.state === 'fuera') continue;
      const k = Math.floor(o.y / dx) * nx + Math.floor(o.x / dx);
      const what = o.kind === 'moto' ? 'Moto' : o.id.startsWith('taxi') ? 'Taxi' : 'Carro';
      out.push({ id: `veh-${o.id}`, text: o.state === 'arrastrado' ? `${what} arrastrado por el agua` : `${what} varado`, sub: `${fmtNum(o.dist, 0)} m · ${HAZARD[o.hazard].code}`, priority: 7, kind: 'dano', color: HAZARD[Math.max(2, o.hazard)].color, at: this.w(o.x, o.y, (z[k] ?? 0) + 2.6) });
    }
    // edificaciones con más daño (máximo 5 rótulos: las de mayor peligro y profundidad)
    const ex = exposureOf(sim).filter((e) => e.depth >= 0.3 || e.hazard >= 3);
    ex.sort((a, b2) => b2.hazard - a.hazard || b2.depth - a.depth);
    for (const e of ex.slice(0, 5)) {
      const bs = this.sc.buildings[e.index];
      const cb = this.c.buildings[e.index];
      const cx = bs.polygon.reduce((s, p) => s + p[0], 0) / bs.polygon.length;
      const cy = bs.polygon.reduce((s, p) => s + p[1], 0) / bs.polygon.length;
      out.push({ id: `dmg-${e.id}`, text: buildingName(e.id), sub: `${fmtNum(e.depth, 1)} m de agua · ${HAZARD[e.hazard].code}`, priority: 6, kind: 'dano', color: HAZARD[e.hazard].color, at: this.w(cx, cy, cb.baseZ + bs.heightM + 1.2) });
    }
    const key = out.map((l) => l.id).join('|');
    this.labels = out;
    this.labelsKey = key;
  }

  /** Actualiza la capa a partir del estado calculado. Devuelve true si cambió el conjunto de rótulos. */
  update(sim: CitySim, time: number, dtReal: number, reduced: boolean): boolean {
    const prev = this.labelsKey;
    this.updateVehicles(sim, time, reduced);
    this.updateCulverts(sim);
    this.updateDebris(sim);
    this.updateSpray(sim, Math.min(0.05, dtReal), reduced);
    if (this.lastStainT < 0 || Math.abs(sim.t - this.lastStainT) >= 2 || sim.t < this.lastStainT) {
      this.updateStains(sim);
      this.updateLabels(sim);
      this.lastStainT = sim.t;
    }
    return this.labelsKey !== prev;
  }

  dispose(): void {
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    this.group.clear();
  }
}

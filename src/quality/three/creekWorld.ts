// La quebrada en 3D: nace en la montaña, pasa junto a un barrio que vierte su agua usada por un tubo y sigue
// 2,5 km hasta un tramo de potreros. El color del agua, la espuma, los peces y las lecturas salen del modelo
// calculado (model.ts) en cada punto. Dibujo esquemático: la distancia se comprime (más espacio cerca del tubo).

import * as THREE from 'three';
import type { CreekInput, CreekModel } from '../model';
import { naturalWater, doColor, fishGeometry, houses, rng, trees, waterMaterial, noise2, WALLS, type HouseSpot, type TreeSpot } from './kit';
import type { QStage, StageLabel, StageView } from './stage';

export type StationId = 'A' | 'B' | 'C' | 'D';
export const STATIONS: { id: StationId; x: number; name: string }[] = [
  { id: 'A', x: -150, name: 'arriba del tubo' },
  { id: 'B', x: 30, name: 'junto al tubo' },
  { id: 'C', x: 600, name: '600 m abajo' },
  { id: 'D', x: 2500, name: '2,5 km abajo' },
];

/**
 * Regla didáctica para los peces, con dos criterios publicados: oxígeno disuelto de al menos 5 mg/L (preservación de
 * flora y fauna en aguas dulces frías, Decreto 1594 de 1984, compilado en el Decreto 1076 de 2015) y materia
 * orgánica (DBO5) de 6 mg/L o menos (valor guía para aguas ciprinícolas de la Directiva 78/659/CEE).
 */
import { FISH, fishOk } from '../model';
export { FISH, fishOk };

/** Distancia real [m] (negativa aguas arriba del tubo) → posición a lo largo del dibujo. */
export const uOf = (x: number) => (x < 0 ? x * 0.18 : 200 * Math.sqrt(x / 3000));
export const xOf = (u: number) => (u < 0 ? u / 0.18 : 3000 * (u / 200) ** 2);
const U0 = -95, U1 = 215;
const zc = (u: number) => 14 * Math.sin(u * 0.035 + 0.6) + 5 * Math.sin(u * 0.09);
const bedY = (u: number) => 0.05 * (200 - u) + (u < -20 ? 0.14 * (-20 - u) : 0);
const HALF = 4.3;

function groundY(u: number, z: number): number {
  const a = Math.abs(z - zc(u));
  let y = bedY(u);
  if (a < 5.2) y += -1.5 * (1 - (a / 5.2) ** 2);
  else y += 0.7 * smooth(5.2, 9.5, a) + 0.0018 * (a - 5.2) ** 2 * (1 + 0.8 * noise2(u * 0.05, z * 0.05));
  y += (u < -20 ? 16 + 0.25 * (-20 - u) : 7) * smooth(16, 70, a) * (0.7 + 0.6 * noise2(u * 0.03 + 5, z * 0.03));
  y += 0.5 * noise2(u * 0.13, z * 0.13) * smooth(3, 8, a);
  return y;
}
function smooth(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface CreekView {
  inp: CreekInput;
  m: CreekModel;
  probe: number;
  mode: 'natural' | 'oxigeno';
  station: StationId | null;
}

export class CreekWorld {
  private stage: QStage;
  private time = { value: 0 };
  private water: THREE.Mesh;
  private wPos: Float32Array;
  private wCol: Float32Array;
  private wFoam: Float32Array;
  private wU: number[] = [];
  private houseMesh: THREE.InstancedMesh;
  private septic: THREE.InstancedMesh;
  private houseSpots: HouseSpot[] = [];
  private bankTrees: THREE.Group;
  private terrain: THREE.Mesh;
  private ptar = new THREE.Group();
  private collector = new THREE.Group();
  private outPipe = new THREE.Group();
  private drops: THREE.InstancedMesh;
  private fish: THREE.InstancedMesh;
  private fishData: { u0: number; off: number; s: number; ph: number }[] = [];
  private fishOn: boolean[] = [];
  private probeMark = new THREE.Group();
  private ring: THREE.Mesh;
  private stones: Record<StationId, THREE.Group> = {} as Record<StationId, THREE.Group>;
  private v: CreekView | null = null;
  /** Al tocar el rótulo de una estación. */
  onStation: ((id: StationId) => void) | null = null;
  private yShift = 0;
  readonly views: Record<'todo' | 'tubo' | 'abajo' | 'montana', StageView> = {
    todo: { eye: [-34, 96, -104], target: [64, 0, 12] },
    tubo: { eye: [-26, 30, -40], target: [10, 7, 4] },
    abajo: { eye: [58, 46, -78], target: [118, 0, 4] },
    montana: { eye: [-96, 44, -40], target: [-30, 12, 10] },
  };

  constructor(stage: QStage, cb: { onProbe: (x: number) => void; onStone: (id: StationId) => void }) {
    this.stage = stage;
    const sc = stage.scene;
    // ---- terreno
    // el terreno sigue más allá del agua en todas direcciones: la niebla esconde el borde del dibujo
    const T0 = U0 - 55, T1 = U1 + 55, ZW = 110;
    const nu = Math.round((T1 - T0) / 1.2) + 1, nz = 2 * ZW + 1;
    const pos = new Float32Array(nu * nz * 3), col = new Float32Array(nu * nz * 3);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nu; i++) {
      const u = T0 + i * 1.2, z = -ZW + j;
      const o = (j * nu + i) * 3;
      pos[o] = u;
      pos[o + 1] = groundY(u, z);
      pos[o + 2] = z;
    }
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    this.terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, flatShading: false }));
    this.terrain.receiveShadow = true;
    sc.add(this.terrain);
    this.paintTerrain(true);

    // ---- agua: cinta a lo largo del cauce (tres vértices por corte: orilla, centro, orilla)
    const us: number[] = [];
    for (let u = U0; u <= U1 + 1e-6; u += 0.7) us.push(u);
    this.wU = us;
    const n = us.length;
    this.wPos = new Float32Array(n * 3 * 3);
    this.wCol = new Float32Array(n * 3 * 3);
    this.wFoam = new Float32Array(n * 3);
    const flow = new Float32Array(n * 3 * 2);
    const wi: number[] = [];
    us.forEach((u, k) => {
      for (let s = 0; s < 3; s++) {
        flow[(k * 3 + s) * 2] = u;
        flow[(k * 3 + s) * 2 + 1] = s - 1;
      }
      if (k > 0) for (let s = 0; s < 2; s++) {
        const a = (k - 1) * 3 + s, b = a + 1, c = k * 3 + s, d = c + 1;
        wi.push(a, b, c, b, d, c);
      }
    });
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(this.wPos, 3));
    wg.setAttribute('color', new THREE.BufferAttribute(this.wCol, 3));
    wg.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
    wg.setAttribute('aFoam', new THREE.BufferAttribute(this.wFoam, 1));
    wg.setIndex(wi);
    this.water = new THREE.Mesh(wg, waterMaterial(this.time, { opacity: 0.86, speed: 0.9 }));
    this.water.renderOrder = 3;
    sc.add(this.water);
    this.placeWater(0);
    stage.addPick(this.water, (p) => {
      let best = 0, bd = Infinity;
      for (let k = 0; k < n; k++) {
        const d = Math.hypot(this.wPos[(k * 3 + 1) * 3] - p.x, this.wPos[(k * 3 + 1) * 3 + 2] - p.z);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      const x = xOf(us[best]);
      cb.onProbe(Math.max(-400, Math.min(3000, Math.round(x / 10) * 10)));
    }, 'Toca el agua para medir con la sonda');

    // ---- barrio: casas (cada una representa 10) ordenadas desde el tubo hacia afuera
    const R = rng(11);
    const slots: HouseSpot[] = [];
    for (let du = -28; du <= 26; du += 6.2) for (let dz = 13; dz <= 47; dz += 6.6) {
      const u = du + (R() - 0.5) * 1.6;
      const z = zc(u) + dz + (R() - 0.5) * 1.4;
      const y = Math.max(groundY(u - 2, z - 2), groundY(u + 2, z - 2), groundY(u - 2, z + 2), groundY(u + 2, z + 2));
      slots.push({ x: u, y, z, w: 4.4 + R() * 1.8, d: 4.6 + R() * 1.2, h: 2.8 * (1 + Math.floor(R() * 3)), rot: (R() - 0.5) * 0.3, wall: WALLS[Math.floor(R() * WALLS.length)] });
    }
    slots.sort((a, b) => Math.hypot(a.x, a.z - zc(0) - 10) - Math.hypot(b.x, b.z - zc(0) - 10));
    this.houseSpots = slots.slice(0, 60);
    this.houseMesh = houses(this.houseSpots);
    sc.add(this.houseMesh);
    const sg = new THREE.CylinderGeometry(0.8, 0.8, 0.9, 10);
    this.septic = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: '#8f9aa0', roughness: 0.7 }), this.houseSpots.length);
    const mm = new THREE.Matrix4();
    this.houseSpots.forEach((h, i) => this.septic.setMatrixAt(i, mm.makeTranslation(h.x + h.w * 0.5 + 0.9, h.y - 0.1, h.z - 1.4)));
    sc.add(this.septic);

    // ---- tubo del barrio y chorro
    const pipeM = new THREE.MeshStandardMaterial({ color: '#9b9a95', roughness: 0.7 });
    const zb = zc(0);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 9, 14), pipeM);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(0, bedY(0) + 0.45, zb + 9.4);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 8, 16), new THREE.MeshStandardMaterial({ color: '#4a4b48' }));
    mouth.position.set(0, bedY(0) + 0.45, zb + 4.9);
    this.outPipe.add(pipe, mouth);
    sc.add(this.outPipe);
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), 90);
    this.drops.frustumCulled = false;
    sc.add(this.drops);

    // ---- planta pequeña junto al tubo
    {
      const conc = new THREE.MeshStandardMaterial({ color: '#cdd2cf', roughness: 0.8 });
      const wtr = new THREE.MeshStandardMaterial({ color: '#7b8f6e', roughness: 0.3 });
      const by = groundY(-9, zb + 13);
      [[-12, zb + 12], [-7, zb + 13.5]].forEach(([u, z]) => {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 1.8, 20), conc);
        t.position.set(u, by + 0.6, z);
        const w = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.1, 20), wtr);
        w.position.set(u, by + 1.45, z);
        this.ptar.add(t, w);
      });
      const hut = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 2.6), new THREE.MeshStandardMaterial({ color: '#e7e3d8' }));
      hut.position.set(-9.5, by + 1, zb + 17.5);
      this.ptar.add(hut);
      sc.add(this.ptar);
    }
    // ---- colector (alcantarillado): cámaras de inspección por la orilla, aguas abajo
    {
      const lid = new THREE.CylinderGeometry(0.75, 0.75, 0.25, 14);
      const lm = new THREE.MeshStandardMaterial({ color: '#5b5f63', roughness: 0.6 });
      for (let u = 2; u < 205; u += 11) {
        const z = zc(u) + 11;
        const c = new THREE.Mesh(lid, lm);
        c.position.set(u, groundY(u, z) + 0.1, z);
        this.collector.add(c);
      }
      sc.add(this.collector);
    }

    // ---- árboles: bosque de la montaña, árboles sueltos en los potreros y los de la orilla (se pueden quitar)
    const forest: TreeSpot[] = [];
    const R2 = rng(5);
    for (let k = 0; k < 900 && forest.length < 320; k++) {
      const u = U0 + R2() * 85, z = -72 + R2() * 144;
      const a = Math.abs(z - zc(u));
      if (a < 10) continue;
      forest.push({ x: u, y: groundY(u, z), z, r: 1.6 + R2() * 1.8 });
    }
    for (let k = 0; k < 600 && forest.length < 420; k++) {
      const u = 30 + R2() * 185, z = -72 + R2() * 144;
      const a = Math.abs(z - zc(u));
      if (a < 11 || (u < 40 && z > zc(u) + 8)) continue;
      if (R2() < 0.7) continue;
      forest.push({ x: u, y: groundY(u, z), z, r: 1.4 + R2() * 1.5 });
    }
    sc.add(trees(forest, 9));
    const bank: TreeSpot[] = [];
    for (let u = U0 + 2; u < U1; u += 3.1) for (const side of [-1, 1]) {
      if (side > 0 && u > -30 && u < 8) continue; // el barrio llega hasta la orilla
      if (R2() < 0.18) continue;
      const z = zc(u) + side * (7.2 + R2() * 2.8);
      bank.push({ x: u + (R2() - 0.5) * 1.2, y: groundY(u, z), z, r: 1.3 + R2() * 1.1 });
    }
    this.bankTrees = trees(bank, 4);
    sc.add(this.bankTrees);

    // ---- peces (aparecen donde hay oxígeno suficiente)
    const R3 = rng(21);
    for (let k = 0; k < 64; k++) {
      const up = k < 22;
      this.fishData.push({ u0: up ? -90 + R3() * 84 : 6 + R3() * 204, off: (R3() - 0.5) * 2.4, s: 0.6 + R3() * 0.8, ph: R3() * 6.28 });
      this.fishOn.push(false);
    }
    // los peces se dibujan después del agua (que no escribe profundidad): se ven a través de la lámina
    this.fish = new THREE.InstancedMesh(fishGeometry(), new THREE.MeshStandardMaterial({ color: '#7f8c78', roughness: 0.45, metalness: 0.25, transparent: true, opacity: 0.88 }), this.fishData.length);
    this.fish.frustumCulled = false;
    this.fish.renderOrder = 4;
    sc.add(this.fish);

    // ---- estaciones: banderita y piedras que se pueden levantar
    const flagM = new THREE.MeshStandardMaterial({ color: '#f2f2ee', side: THREE.DoubleSide });
    const poleM = new THREE.MeshStandardMaterial({ color: '#5c4a3a' });
    const rockM = new THREE.MeshStandardMaterial({ color: '#8b8579', roughness: 0.9, flatShading: true });
    for (const st of STATIONS) {
      const u = uOf(st.x), z = zc(u);
      const g = new THREE.Group();
      const pz = z - 8.6;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4), poleM);
      pole.position.set(u, groundY(u, pz) + 1.7, pz);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), flagM);
      flag.position.set(u + 0.72, groundY(u, pz) + 3, pz);
      g.add(pole, flag);
      const rocks = new THREE.Group();
      const R4 = rng(st.x + 900);
      for (let k = 0; k < 4; k++) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + R4() * 0.35, 0), rockM);
        const rz = z - 3.5 + (R4() - 0.5) * 1.1;
        r.position.set(u + (k - 1.5) * 1.05, groundY(u, rz) + 0.15, rz);
        r.scale.y = 0.6;
        r.rotation.set(R4(), R4() * 3, R4());
        rocks.add(r);
      }
      g.add(rocks);
      this.stones[st.id] = rocks;
      stage.addPick(rocks, () => cb.onStone(st.id), `Levanta una piedra en la estación ${st.id}`);
      sc.add(g);
    }
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 40), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthTest: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 9;
    this.ring.visible = false;
    sc.add(this.ring);

    // ---- sonda
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2), new THREE.MeshStandardMaterial({ color: '#c8246f' }));
    sp.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: new THREE.Color('#5a4400') }));
    head.position.y = -0.35;
    this.probeMark.add(sp, head);
    sc.add(this.probeMark);
    stage.view(this.views.todo, false);
  }

  /** Colores del terreno: con o sin árboles en la orilla (sin ellos, la orilla queda en tierra suelta). */
  private paintTerrain(bankTrees: boolean): void {
    const g = this.terrain.geometry;
    const P = g.getAttribute('position') as THREE.BufferAttribute, C = g.getAttribute('color') as THREE.BufferAttribute;
    const c = new THREE.Color();
    const gravel = new THREE.Color(0.42, 0.39, 0.33), grass = new THREE.Color(0.3, 0.5, 0.18), forest = new THREE.Color(0.17, 0.34, 0.13), soil = new THREE.Color(0.52, 0.37, 0.24);
    const urban = new THREE.Color(0.58, 0.54, 0.47), pasture = new THREE.Color(0.42, 0.58, 0.22);
    for (let k = 0; k < P.count; k++) {
      const u = P.getX(k), z = P.getZ(k);
      const dz = z - zc(u), a = Math.abs(dz);
      const nn = noise2(u * 0.09, z * 0.09);
      if (a < 4.6) c.copy(gravel);
      else if (a < 10) c.copy(bankTrees ? grass : soil).multiplyScalar(0.92 + 0.12 * nn);
      else if (u < -22) c.copy(forest).lerp(grass, smooth(0.55, 0.8, nn) * 0.6);
      else if (u > -32 && u < 30 && dz > 7 && dz < 48) c.copy(urban).lerp(grass, smooth(0.62, 0.85, nn) * 0.5);
      else c.copy(pasture).lerp(grass, nn * 0.6);
      c.multiplyScalar(0.94 + 0.1 * noise2(u * 0.4, z * 0.4));
      C.setXYZ(k, c.r, c.g, c.b);
    }
    C.needsUpdate = true;
  }

  /** Alto de la lámina (temporada): con más caudal el agua sube; en verano baja. */
  private placeWater(shift: number): void {
    this.yShift = shift;
    this.wU.forEach((u, k) => {
      const z = zc(u);
      // corte perpendicular al cauce: normal (−z', 1) normalizada
      const dz = (zc(u + 0.5) - zc(u - 0.5)) / 1;
      const L = Math.hypot(1, dz);
      const y = bedY(u) - 0.62 + shift;
      const half = HALF + shift * 0.8;
      for (let s = 0; s < 3; s++) {
        const o = (k * 3 + s) * 3;
        this.wPos[o] = u - ((s - 1) * half * dz) / L;
        this.wPos[o + 1] = y;
        this.wPos[o + 2] = z + ((s - 1) * half) / L;
      }
    });
    (this.water.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.water.geometry.computeVertexNormals();
    this.water.geometry.computeBoundingSphere();
  }

  surfaceAt(u: number): number {
    return bedY(u) - 0.62 + this.yShift;
  }

  set(v: CreekView): void {
    const prev = this.v;
    this.v = v;
    const { m, inp } = v;
    if (!prev || prev.inp.trees !== inp.trees) {
      this.bankTrees.visible = inp.trees;
      this.paintTerrain(inp.trees);
    }
    if (!prev || prev.m !== m) {
      const shift = Math.max(-0.3, Math.min(0.45, (m.H - 0.13) * 2.2));
      if (Math.abs(shift - this.yShift) > 1e-3) this.placeWater(shift);
    }
    // agua: color de cada corte con la lectura del modelo
    const c = new THREE.Color();
    const n = this.wU.length;
    let maxTurb = 0;
    for (let k = 0; k < n; k++) {
      const x = xOf(this.wU[k]);
      const r = m.at(x);
      maxTurb = Math.max(maxTurb, r.turbidity);
      if (v.mode === 'oxigeno') doColor(r.dissolvedO2, c);
      else naturalWater(r.turbidity, r.dbo, c);
      const foam = x >= 0 && inp.treatment !== 'alcantarillado' ? Math.min(0.85, (r.dbo / 45) * Math.exp(-x / 220)) : 0;
      const rapids = this.wU[k] < -25 ? 0.25 * noise2(this.wU[k] * 0.2, 1) : 0;
      for (let s = 0; s < 3; s++) {
        this.wCol.set([c.r, c.g, c.b], (k * 3 + s) * 3);
        this.wFoam[k * 3 + s] = Math.max(foam * (s === 1 ? 1 : 0.6), rapids);
      }
    }
    const g = this.water.geometry;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aFoam') as THREE.BufferAttribute).needsUpdate = true;
    // agua clara: se ven los peces y el fondo; agua turbia: casi no
    (this.water.material as THREE.MeshStandardMaterial).opacity = v.mode === 'oxigeno' ? 0.94 : 0.72 + 0.22 * Math.min(1, maxTurb / 80);
    // barrio, tratamiento y tubo
    const nH = Math.min(this.houseSpots.length, Math.ceil(inp.houses / 10));
    this.houseMesh.count = nH;
    this.septic.count = inp.treatment === 'septico' ? nH : 0;
    this.ptar.visible = inp.treatment === 'ptar';
    this.collector.visible = inp.treatment === 'alcantarillado';
    this.outPipe.visible = inp.treatment !== 'alcantarillado';
    // peces: donde el oxígeno alcanza el criterio
    this.fishData.forEach((f, i) => (this.fishOn[i] = fishOk(m.at(xOf(f.u0)))));
    // sonda y estación elegida
    const pu = uOf(v.probe);
    this.probeMark.position.set(pu, this.surfaceAt(pu), zc(pu) + 2.4);
    if (v.station) {
      const u = uOf(STATIONS.find((s) => s.id === v.station)!.x);
      this.ring.position.set(u, groundY(u, zc(u) - 3.5) + 0.4, zc(u) - 3.5);
      this.ring.visible = true;
    } else this.ring.visible = false;
    this.stage.setLabels(this.labels());
  }

  private labels(): StageLabel[] {
    const v = this.v!;
    const out: StageLabel[] = [];
    const L = (id: string, text: string, u: number, dz: number, lift: number, extra: Partial<StageLabel> = {}) => {
      const z = zc(u) + dz;
      out.push({ id, text, at: new THREE.Vector3(u, groundY(u, z) + lift, z), ...extra });
    };
    for (const st of STATIONS) {
      const r = v.m.at(st.x);
      const fish = fishOk(r);
      L(`st-${st.id}`, `${st.id} · ${st.name}`, uOf(st.x), -8.6, 4.4, { sub: fish ? 'hay peces' : 'sin peces', kind: fish ? 'ok' : 'alerta', prio: 5, onClick: () => this.onStation?.(st.id) });
    }
    if (v.inp.treatment !== 'alcantarillado') L('tubo', 'Tubo de las casas', 0, 9.4, 3.2, { sub: v.inp.houses ? `${v.inp.houses} casas` : 'sin casas', prio: 7, kind: 'dato' });
    else L('colector', 'Colector', 60, 11, 1.8, { sub: 'el agua usada va a la planta del valle', prio: 4 });
    if (v.inp.treatment === 'ptar') L('ptar', 'Planta pequeña', -9.5, 15, 4.5, { prio: 3 });
    L('nacimiento', 'Nacimiento: agua de montaña', -82, 0, 3, { prio: 1 });
    const pu = uOf(v.probe);
    const r = v.m.at(v.probe);
    out.push({ id: 'sonda', text: 'Sonda', sub: `${fishOk(r) ? 'hay peces' : 'sin peces'} · O₂ ${fmt1(r.dissolvedO2)} mg/L`, at: new THREE.Vector3(pu, this.surfaceAt(pu) + 3.4, zc(pu) + 2.4), kind: 'sonda', prio: 9 });
    return out;
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    const v = this.v;
    if (!v) return;
    // peces nadando de un lado a otro de su tramo
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.fishData.forEach((f, i) => {
      if (!this.fishOn[i]) {
        this.fish.setMatrixAt(i, m4.makeScale(0, 0, 0));
        return;
      }
      const w = t * 0.32 * f.s + f.ph;
      const u = f.u0 + 2.4 * Math.sin(w);
      const du = Math.cos(w);
      const z = zc(u) + f.off * 1.5 + 0.3 * Math.sin(w * 2.3);
      p.set(u, this.surfaceAt(u) - 0.08, z);
      // el eje +x del pez apunta hacia donde nada: guiñada = atan2(−dz, dx)
      const dx = du >= 0 ? 0.4 : -0.4;
      const yaw = Math.atan2(-(zc(u + dx) - zc(u)), dx);
      q.setFromAxisAngle(up, yaw + 0.12 * Math.sin(w * 6));
      this.fish.setMatrixAt(i, m4.compose(p, q, s.setScalar(0.75)));
    });
    this.fish.instanceMatrix.needsUpdate = true;
    // chorro del tubo
    const tr = v.inp.treatment;
    const on = tr !== 'alcantarillado' && v.inp.houses > 0;
    const rate = on ? Math.min(1, 0.25 + v.m.Qw * 400) : 0;
    const col = tr === 'ptar' ? '#9db3ad' : tr === 'septico' ? '#8a826c' : '#6b5a40';
    (this.drops.material as THREE.MeshStandardMaterial).color.set(col);
    const zb = zc(0);
    const n = this.drops.count;
    for (let k = 0; k < n; k++) {
      const ph = (t * 0.9 + k / n) % 1;
      if (!on || k / n > rate) {
        this.drops.setMatrixAt(k, m4.makeScale(0, 0, 0));
        continue;
      }
      const fall = Math.min(1, ph / 0.35);
      const drift = Math.max(0, ph - 0.35) / 0.65;
      const u = drift * 7 + ((k * 37) % 10) * 0.05;
      const y = bedY(0) + 0.45 - fall * fall * (1 - this.yShift);
      const z = zb + 4.8 - fall * 0.9 - drift * 2.2 + (((k * 13) % 7) - 3) * 0.08;
      const sc = (1 - drift) * (0.8 + ((k * 7) % 5) * 0.08);
      this.drops.setMatrixAt(k, m4.compose(p.set(u, drift > 0 ? this.surfaceAt(u) + 0.02 : y, z), q.identity(), s.setScalar(sc)));
    }
    this.drops.instanceMatrix.needsUpdate = true;
    // banderitas que ondean
    if (dt > 0) this.ring.rotation.z += dt * 0.6;
  }
}

function fmt1(v: number): string {
  return v.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Planta de potabilización convencional en 3D, con sus once procesos: captación y rejilla, desarenador, mezcla
// rápida, floculación en tres zonas, sedimentación de alta tasa, filtración rápida (con retrolavado), tanque de
// contacto de cloro, estabilización del pH, almacenamiento, red con la llave de una casa y tratamiento de lodos.
// Los tanques tienen frente de vidrio: se ve el color del agua (turbiedad calculada en cada etapa), las
// partículas y las bacterias, cuyo número sigue el cálculo en escala logarítmica.

import * as THREE from 'three';
import type { PlantInput, PlantResult } from '../model';
import { PROCESSES, type ProcessId } from '../processes';
import { concreteMaterial, houses, noise2, rng, tank, trees, waterMaterial, type TreeSpot } from './kit';
import type { QStage, StageLabel, StageView } from './stage';

export type UnitId = ProcessId;

/** Centro de cada proceso en el dibujo (x a lo largo de la planta; los lodos van detrás, en z negativo). */
export const UNIT_X: Record<ProcessId, number> = { rio: -84, desarenador: -68, mezcla: -52, floc: -36, sedim: -14, filtro: 8, cloro: 26, ph: 37, tanque: 49, llave: 67, lodos: -6 };
const X = UNIT_X;
const Z: Partial<Record<ProcessId, number>> = { lodos: -19 };
/** Nombre corto de cada proceso para las etiquetas de la escena (el nombre completo está en el panel). */
const TAG: Record<ProcessId, string> = { rio: 'Rejilla', desarenador: 'Desarenador', mezcla: 'Mezcla rápida', floc: 'Floculación', sedim: 'Sedimentación', filtro: 'Filtros', cloro: 'Cloro', ph: 'pH', tanque: 'Tanque', llave: 'La llave', lodos: 'Lodos' };

function turbColor(t: number, out = new THREE.Color()): THREE.Color {
  const clear = new THREE.Color(0.55, 0.78, 0.86), brown = new THREE.Color(0.56, 0.42, 0.25);
  return out.copy(clear).lerp(brown, Math.min(1, Math.sqrt(t / 160)));
}

/** Partículas y bacterias dibujadas para una turbiedad [UNT] o un conteo [por 100 mL] (escala logarítmica). */
export const partsFor = (t: number) => Math.round(Math.min(46, Math.max(0, 13 * Math.log10(t + 1))));
export const bugsFor = (c: number) => (c < 0.5 ? 0 : Math.round(Math.min(26, 4 * Math.log10(c + 1))));

/** Duración del retrolavado en la animación [s]. */
export const WASH_S = 7;

/** Cómo se mueve el agua en la superficie de cada tanque: velocidad de las vetas y espuma (ilustrativo). */
const SURF: Partial<Record<ProcessId, { speed: number; foam: number }>> = {
  desarenador: { speed: 0.7, foam: 0.15 },
  mezcla: { speed: 2.2, foam: 0.9 },
  floc: { speed: 0.32, foam: 0.08 },
  sedim: { speed: 0.06, foam: 0 },
  filtro: { speed: 0.2, foam: 0 },
  cloro: { speed: 0.45, foam: 0.05 },
};
/** Recorrido del agua por las tuberías: tramo, altura, etapa de la que sale (para su color). */
const FLOW_SEGS: { x0: number; x1: number; y: number; z: number; from: ProcessId }[] = [
  { x0: UNIT_X.rio + 2.5, x1: UNIT_X.desarenador - 6, y: 1.4, z: 0, from: 'rio' },
  { x0: UNIT_X.desarenador + 6, x1: UNIT_X.mezcla - 3, y: 1.8, z: 0, from: 'desarenador' },
  { x0: UNIT_X.mezcla + 3, x1: UNIT_X.floc - 7, y: 2.8, z: 0, from: 'mezcla' },
  { x0: UNIT_X.floc + 7, x1: UNIT_X.sedim - 10, y: 2.8, z: 0, from: 'floc' },
  { x0: UNIT_X.sedim + 10, x1: UNIT_X.filtro - 7.5, y: 3.4, z: 0, from: 'sedim' },
  { x0: UNIT_X.filtro + 7.5, x1: UNIT_X.cloro - 5, y: 1.2, z: 0, from: 'filtro' },
  { x0: UNIT_X.cloro + 5, x1: UNIT_X.ph - 1.3, y: 1.2, z: 0, from: 'cloro' },
  { x0: UNIT_X.ph + 1.3, x1: UNIT_X.tanque - 5, y: 1.2, z: 0, from: 'ph' },
  { x0: UNIT_X.tanque + 5, x1: UNIT_X.llave - 2.6, y: 0.6, z: 0, from: 'tanque' },
];
const WHITE = new THREE.Color(1, 1, 1);
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** Relieve ilustrativo alrededor del predio: montañas detrás y a los lados, valle del río, prado plano adelante. */
function hillH(x: number, z: number, riverX: number): { h: number; n: number; d: number } {
  const dx = Math.max(0, Math.abs(x + 8) - 104), dz = z < -6 ? Math.max(0, -6 - z - 52) : Math.max(0, z - 190);
  const d = Math.hypot(dx, dz);
  const n = noise2(x / 70, z / 70) * 0.65 + noise2(x / 23 + 9, z / 23) * 0.35;
  const h = smooth(0, 110, d) * (26 + 70 * n) * smooth(9, 46, Math.abs(x - riverX));
  return { h, n, d };
}
/** Velocidad de las flechas del agua en las tuberías [unidades/s]. */
const FLOW_SPEED = 2.4;

interface Box {
  id: ProcessId;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  water: THREE.Mesh;
}

export interface PlantView {
  inp: PlantInput;
  r: PlantResult;
  unit: ProcessId | null;
}

export class PlantWorld {
  private stage: QStage;
  private boxes: Box[] = [];
  private river: THREE.Mesh;
  private glass: THREE.Mesh;
  private parts: THREE.InstancedMesh;
  private bugs: THREE.InstancedMesh;
  private flocWheels: THREE.Group[] = [];
  private mixer = new THREE.Group();
  private sludge: THREE.Mesh;
  private sand: THREE.Mesh;
  private cake: THREE.Mesh;
  private drip: THREE.InstancedMesh;
  private bubbles: THREE.InstancedMesh;
  private litter: THREE.InstancedMesh;
  private thick: THREE.Mesh;
  private ring: THREE.Mesh;
  private v: PlantView | null = null;
  private wash: { t0: number } | null = null;
  /** Fracción de la costra de los filtros (1 = la que corresponde al cálculo; baja con el retrolavado y vuelve a crecer). */
  private cakeK = 1;
  private slots: { unit: ProcessId; kind: 'p' | 'b'; a: number; b: number; c: number; ph: number }[] = [];
  private waterTime = { value: 0 };
  private surfaces: { id: ProcessId; mesh: THREE.Mesh }[] = [];
  private chevrons!: THREE.InstancedMesh;
  private chevSlots: { seg: number; k: number; n: number; sludge: boolean }[] = [];
  readonly views: Record<string, StageView>;

  constructor(stage: QStage, cb: { onUnit: (id: ProcessId) => void }) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(84);
    // vistas: la planta completa, tres tramos y una por proceso (para el recorrido guiado)
    this.views = {
      general: { eye: [-8, 40, 116], target: [-8, 4, -8], fit: 176, portrait: { eye: [-170, 120, 80], target: [-14, 2, -8] } },
      entrada: { eye: [-66, 17, 30], target: [-58, 1.5, 0] },
      tanques: { eye: [-4, 15, 30], target: [-4, 2, -2] },
      salida: { eye: [40, 14, 30], target: [38, 2, -2] },
      lodos: { eye: [2, 22, 8], target: [-4, 0.5, -19] },
      llave: { eye: [58, 7, 16], target: [66, 2.6, 0] },
    };
    for (const p of PROCESSES) {
      const x = X[p.id], z = Z[p.id] ?? 0;
      this.views[`p-${p.id}`] =
        p.id === 'llave'
          ? this.views.llave
          : p.id === 'lodos'
            ? { eye: [x + 6, 16, z + 24], target: [x - 1, 1, z] }
            : p.id === 'sedim' || p.id === 'filtro'
              ? { eye: [x + 6, 12, z + 25], target: [x, 1.8, z] }
              : { eye: [x + 5, 9, z + 18], target: [x, 1.6, z] };
    }

    // ---- suelo: patio plano de la planta y montañas alrededor; el río baja por su valle
    const riverX = X.rio - 12;
    sc.add(this.terrain(riverX));
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(166, 44), concreteMaterial('#c9c5bb'));
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(-8, 0.02, -6);
    yard.receiveShadow = true;
    sc.add(yard);
    // ---- río (agua que corre, con el color de la turbiedad del agua cruda), bocatoma y rejilla
    const rg = new THREE.PlaneGeometry(16, 300, 6, 80);
    rg.rotateX(-Math.PI / 2);
    {
      const pos = rg.attributes.position as THREE.BufferAttribute;
      const n = pos.count;
      const flow = new Float32Array(n * 2), foam = new Float32Array(n), col = new Float32Array(n * 3).fill(1);
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        flow[i * 2] = z;
        flow[i * 2 + 1] = x;
        // espuma en las orillas y frente a la bocatoma
        foam[i] = Math.max(0, (Math.abs(x) - 5.5) / 2.5) * 0.6 + (Math.abs(z) < 6 && x > 4 ? 0.5 : 0);
      }
      rg.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
      rg.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
      rg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    this.river = new THREE.Mesh(rg, waterMaterial(this.waterTime, { opacity: 0.94, speed: 1.6 }));
    this.river.position.set(riverX, 0.05, 0);
    this.river.receiveShadow = true;
    sc.add(this.river);
    // piedras en las orillas
    {
      const Rr = rng(12);
      const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 1, flatShading: true }), 140);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
      for (let k = 0; k < 140; k++) {
        const side = k % 2 ? 1 : -1;
        const z = -148 + Rr() * 296, sz = 0.35 + Rr() * 0.9;
        q.setFromEuler(new THREE.Euler(Rr() * 3, Rr() * 3, Rr() * 3));
        rocks.setMatrixAt(k, m4.compose(pv.set(riverX + side * (7.6 + Rr() * 2.2), 0.1, z), q, sv.set(sz * (1 + Rr()), sz * 0.6, sz)));
        rocks.setColorAt(k, new THREE.Color().setHSL(0.09, 0.08, 0.42 + Rr() * 0.18));
      }
      rocks.castShadow = true;
      rocks.receiveShadow = true;
      sc.add(rocks);
    }
    const bankM = new THREE.MeshStandardMaterial({ color: '#7d6a52', roughness: 1 });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 300), bankM);
      b.position.set(riverX + s * 8.4, 0.2, 0);
      sc.add(b);
    }
    const intake = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 6), concreteMaterial('#b8b4ab'));
    intake.position.set(X.rio, 1.2, 0);
    intake.castShadow = true;
    sc.add(intake);
    const barM = new THREE.MeshStandardMaterial({ color: '#4d565e', metalness: 0.4, roughness: 0.5 });
    for (let k = 0; k < 11; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), barM);
      bar.position.set(X.rio - 2.6, 1.2, -2.5 + k * 0.5);
      bar.rotation.z = 0.25;
      sc.add(bar);
    }
    // hojas y palos detenidos en la rejilla (más con la creciente)
    this.litter = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.06, 0.18), new THREE.MeshStandardMaterial({ color: '#4f6b2c', roughness: 0.9 }), 30);
    this.litter.frustumCulled = false;
    sc.add(this.litter);
    stage.addPick(intake, () => cb.onUnit('rio'), 'Captación y rejilla: toca para ver qué pasa aquí');
    stage.addPick(this.river, () => cb.onUnit('rio'), 'El río: toca para ver qué pasa aquí');

    // ---- tanques con frente de vidrio
    const wm = (op: number) => new THREE.MeshStandardMaterial({ color: '#88b9c9', transparent: true, opacity: op, roughness: 0.2, depthWrite: false });
    const mk = (id: ProcessId, w: number, d: number, h: number) => {
      const z = Z[id] ?? 0;
      const g = tank(w, h, d, { glassFront: true });
      g.position.set(X[id], 0, z);
      g.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      sc.add(g);
      // en el filtro el agua visible es la que está sobre el lecho, para que se vean sus capas
      const y0 = id === 'filtro' ? 2.12 : 0.36, wh = h - 0.39 - y0;
      const water = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, wh, d - 0.8), wm(0.62));
      water.position.set(X[id], y0 + wh / 2, z);
      water.renderOrder = 5;
      sc.add(water);
      this.boxes.push({ id, x: X[id], z, w, d, h, water });
      // superficie del agua: vetas que avanzan hacia la salida y espuma donde el agua se agita
      const sf = SURF[id];
      if (sf) {
        const sg = new THREE.PlaneGeometry(w - 0.8, d - 0.8, Math.max(4, Math.round(w * 1.5)), Math.max(2, Math.round(d)));
        sg.rotateX(-Math.PI / 2);
        const pos = sg.attributes.position as THREE.BufferAttribute;
        const n = pos.count;
        const flow = new Float32Array(n * 2), foam = new Float32Array(n), col = new Float32Array(n * 3).fill(1);
        for (let i = 0; i < n; i++) {
          const lx = pos.getX(i), lz = pos.getZ(i);
          flow[i * 2] = lx + X[id];
          flow[i * 2 + 1] = lz;
          // en la mezcla rápida, espuma alrededor de la paleta; en el desarenador, a la entrada
          foam[i] = id === 'mezcla' ? sf.foam * Math.exp(-(lx * lx + lz * lz) / 6) : id === 'desarenador' ? sf.foam * Math.max(0, 1 - (lx + w / 2) / 3) : sf.foam;
        }
        sg.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
        sg.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
        sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const surf = new THREE.Mesh(sg, waterMaterial(this.waterTime, { opacity: 0.85, speed: sf.speed }));
        surf.position.set(X[id], y0 + wh + 0.02, z);
        surf.renderOrder = 6;
        sc.add(surf);
        this.surfaces.push({ id, mesh: surf });
      }
      this.railings(X[id], z, w, d, h);
      const name = PROCESSES.find((p) => p.id === id)!.name;
      stage.addPick(g, () => cb.onUnit(id), `${name}: toca para ver qué pasa aquí`);
      return g;
    };
    mk('desarenador', 12, 5, 2.6);
    mk('mezcla', 6, 7, 3.6);
    mk('floc', 14, 9, 3.6);
    mk('sedim', 20, 10, 4.4);
    mk('filtro', 15, 9, 4.4);
    mk('cloro', 10, 8, 3.2);
    // arena en el fondo del desarenador
    this.sand = new THREE.Mesh(new THREE.BoxGeometry(11.2, 1, 4.2), new THREE.MeshStandardMaterial({ color: '#d2b47c', roughness: 1 }));
    this.sand.position.set(X.desarenador, 0.4, 0);
    sc.add(this.sand);
    // mezclador vertical
    const steel = new THREE.MeshStandardMaterial({ color: '#7e8a92', metalness: 0.5, roughness: 0.4 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), steel);
    shaft.position.y = 2.4;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.5), steel);
    blade.position.y = 1.1;
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 12), new THREE.MeshStandardMaterial({ color: '#2f6fa8' }));
    motor.position.y = 4.6;
    this.mixer.add(shaft, blade, motor);
    this.mixer.position.set(X.mezcla, 0, 0);
    sc.add(this.mixer);
    // tanque del coagulante y goteo
    const coag = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 16), new THREE.MeshStandardMaterial({ color: '#3a78b8', roughness: 0.5 }));
    coag.position.set(X.mezcla - 1.5, 5.6, -5.6);
    coag.castShadow = true;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(2.8, 4.4, 2.8), new THREE.MeshStandardMaterial({ color: '#9aa0a3' }));
    stand.position.set(X.mezcla - 1.5, 2.2, -5.6);
    sc.add(coag, stand);
    // paletas de los floculadores: tres zonas separadas por muros, cada una más lenta (G de 70 a 10 s⁻¹)
    for (const dx of [-4.5, 0, 4.5]) {
      const g = new THREE.Group();
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 8.4), steel);
      axle.rotation.x = Math.PI / 2;
      g.add(axle);
      for (let k = 0; k < 4; k++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 7), new THREE.MeshStandardMaterial({ color: '#c7b27a' }));
        p.rotation.z = (k * Math.PI) / 4;
        g.add(p);
      }
      g.position.set(X.floc + dx, 1.9, 0);
      this.flocWheels.push(g);
      sc.add(g);
    }
    const divM = new THREE.MeshStandardMaterial({ color: '#c9c6bf', transparent: true, opacity: 0.6, depthWrite: false });
    for (const dx of [-2.25, 2.25]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 8.2), divM);
      wall.position.set(X.floc + dx, 1.8, 0);
      sc.add(wall);
    }
    // placas inclinadas del sedimentador y lodo en el fondo
    const plateM = new THREE.MeshStandardMaterial({ color: '#e8e6df', transparent: true, opacity: 0.55, depthWrite: false });
    for (let k = 0; k < 9; k++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 8.8), plateM);
      p.rotation.z = 0.5;
      p.position.set(X.sedim - 2 + k * 1.3, 2.6, 0);
      sc.add(p);
    }
    this.sludge = new THREE.Mesh(new THREE.BoxGeometry(19.2, 1, 9.2), new THREE.MeshStandardMaterial({ color: '#6b5134', roughness: 1 }));
    this.sludge.position.set(X.sedim, 0.4, 0);
    sc.add(this.sludge);
    // capas del filtro: grava, arena, antracita y la costra de mugre que se acumula arriba; tres filtros
    const layer = (y: number, h: number, col: string) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(14.2, h, 8.2), new THREE.MeshStandardMaterial({ color: col, roughness: 1 }));
      m.position.set(X.filtro, y + h / 2, 0);
      sc.add(m);
      return m;
    };
    layer(0.35, 0.5, '#8e8a83');
    layer(0.85, 0.5, '#d8c79b');
    layer(1.35, 0.7, '#3b3b3b');
    this.cake = layer(2.05, 0.1, '#7a5a35');
    for (const dx of [-2.5, 2.5]) {
      const div = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 8.2), concreteMaterial());
      div.position.set(X.filtro + dx, 2.1, 0);
      sc.add(div);
    }
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshStandardMaterial({ color: '#f2f7fa', transparent: true, opacity: 0.8 }), 60);
    this.bubbles.frustumCulled = false;
    this.bubbles.renderOrder = 7;
    sc.add(this.bubbles);
    // tanque de contacto: pantallas en zigzag y cilindros de cloro
    const baffleM = new THREE.MeshStandardMaterial({ color: '#d9d6cf' });
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 5.6), baffleM);
      b.position.set(X.cloro - 3.2 + k * 2.1, 1.6, k % 2 ? 1.0 : -1.0);
      sc.add(b);
    }
    for (const dz of [-0.9, 0.9]) {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 14), new THREE.MeshStandardMaterial({ color: '#b9c63a', roughness: 0.5 }));
      cyl.position.set(X.cloro + dz * 1.5, 1.3, -6.6);
      cyl.castShadow = true;
      sc.add(cyl);
    }
    // silo de cal (estabilización del pH)
    const siloM = new THREE.MeshStandardMaterial({ color: '#efece4', roughness: 0.8 });
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 5, 18), siloM);
    silo.position.set(X.ph, 4.6, -4.8);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.6, 18), siloM);
    cone.rotation.x = Math.PI;
    cone.position.set(X.ph, 1.3, -4.8);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 2.4), new THREE.MeshStandardMaterial({ color: '#8f969b' }));
    base.position.set(X.ph, 0.3, -4.8);
    for (const o of [silo, cone]) o.castShadow = true;
    sc.add(silo, cone, base);
    // cámara de mezcla de la cal sobre la tubería
    const phBox = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 2.6), new THREE.MeshStandardMaterial({ color: '#cfccc4' }));
    phBox.position.set(X.ph, 1, 0);
    phBox.castShadow = true;
    sc.add(phBox);
    const limeLine = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4), steel);
    limeLine.rotation.x = Math.PI / 2;
    limeLine.position.set(X.ph, 1.9, -2.6);
    sc.add(limeLine);
    for (const o of [silo, phBox]) stage.addPick(o, () => cb.onUnit('ph'), 'Estabilización del pH: toca para ver qué pasa aquí');
    // tanque de almacenamiento
    const st = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 5.4, 28), concreteMaterial('#d7d3c9'));
    st.position.set(X.tanque, 2.7, 0);
    st.castShadow = true;
    st.receiveShadow = true;
    sc.add(st);
    stage.addPick(st, () => cb.onUnit('tanque'), 'Almacenamiento: toca para ver qué pasa aquí');
    // lodos: espesador y cuatro lechos de secado, detrás del sedimentador
    const zl = Z.lodos!;
    const thickT = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 3, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#c9c6bf', side: THREE.DoubleSide }));
    thickT.position.set(X.lodos - 8, 1.5, zl);
    thickT.castShadow = true;
    this.thick = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1, 28), new THREE.MeshStandardMaterial({ color: '#6b5134', roughness: 1 }));
    this.thick.position.set(X.lodos - 8, 0.5, zl);
    const thickW = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.1, 28), new THREE.MeshStandardMaterial({ color: '#9db3ad', roughness: 0.3 }));
    thickW.position.set(X.lodos - 8, 2.6, zl);
    sc.add(thickT, this.thick, thickW);
    for (let k = 0; k < 4; k++) {
      const frame = tank(4.6, 0.8, 5, { wall: 0.25 });
      frame.position.set(X.lodos + k * 5, 0, zl);
      sc.add(frame);
      // celdas en distinto momento del ciclo: lodo húmedo (oscuro) a seco y agrietado (claro)
      const bed = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.3, 4.5), new THREE.MeshStandardMaterial({ color: ['#5a4129', '#6f5436', '#8f7553', '#b39c7b'][k], roughness: 1 }));
      bed.position.set(X.lodos + k * 5, 0.4, zl);
      sc.add(bed);
      stage.addPick(frame, () => cb.onUnit('lodos'), 'Tratamiento de lodos: toca para ver qué pasa aquí');
    }
    stage.addPick(thickT, () => cb.onUnit('lodos'), 'Tratamiento de lodos: toca para ver qué pasa aquí');
    // tuberías entre las etapas, la red hasta la casa y la línea de lodos (café)
    const pipeM = new THREE.MeshStandardMaterial({ color: '#4f6d86', roughness: 0.5 });
    const sludgeM = new THREE.MeshStandardMaterial({ color: '#6b5134', roughness: 0.6 });
    const pipe = (x0: number, x1: number, y: number, z = 0, m = pipeM) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, Math.abs(x1 - x0), 10), m);
      p.rotation.z = Math.PI / 2;
      p.position.set((x0 + x1) / 2, y, z);
      p.castShadow = true;
      sc.add(p);
    };
    const pipeZ = (x: number, z0: number, z1: number, y: number, m = sludgeM) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, Math.abs(z1 - z0), 10), m);
      p.rotation.x = Math.PI / 2;
      p.position.set(x, y, (z0 + z1) / 2);
      sc.add(p);
    };
    pipe(X.rio + 2.5, X.desarenador - 6, 1.4);
    pipe(X.desarenador + 6, X.mezcla - 3, 1.8);
    pipe(X.mezcla + 3, X.floc - 7, 2.8);
    pipe(X.floc + 7, X.sedim - 10, 2.8);
    pipe(X.sedim + 10, X.filtro - 7.5, 3.4);
    pipe(X.filtro + 7.5, X.cloro - 5, 1.2);
    pipe(X.cloro + 5, X.ph - 1.3, 1.2);
    pipe(X.ph + 1.3, X.tanque - 5, 1.2);
    pipe(X.tanque + 5, X.llave - 2.6, 0.6);
    pipeZ(X.sedim - 6, -5, zl, 0.4);
    pipe(X.sedim - 6, X.lodos - 8 + 3.4, 0.4, zl, sludgeM);
    pipeZ(X.filtro, -4.5, zl + 2.6, 0.5);
    // flechas del agua en las tuberías (con el color de la etapa de la que sale) y en la línea de lodos
    this.buildChevrons(zl);
    // edificio de laboratorio y control, letrero y cerca del predio
    this.buildSite();
    // la casa con la llave (frente abierto) y el vaso
    const hs = houses([{ x: X.llave + 1.5, y: 0.6, z: -1.8, w: 6, d: 3, h: 4.2, rot: 0, wall: '#efe0c0' }]);
    sc.add(hs);
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.4), new THREE.MeshStandardMaterial({ color: '#8a5a3a' }));
    table.position.set(X.llave, 1.05, 0.6);
    const tlegs = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 1.2), new THREE.MeshStandardMaterial({ color: '#6d462d' }));
    tlegs.position.set(X.llave, 0.5, 0.6);
    const tap = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 12, Math.PI), steel);
    tap.position.set(X.llave - 0.4, 2.3, -0.2);
    this.glass = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.8, 18), new THREE.MeshStandardMaterial({ color: '#a8d8e8', transparent: true, opacity: 0.85, roughness: 0.1 }));
    this.glass.position.set(X.llave + 0.4, 1.53, 0.6);
    sc.add(table, tlegs, tap, this.glass);
    stage.addPick(this.glass, () => cb.onUnit('llave'), 'La llave: toca para ver si el agua es segura');
    stage.addPick(hs, () => cb.onUnit('llave'), 'La llave: toca para ver si el agua es segura');
    // árboles alrededor
    const R = rng(4);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 190; k++) {
      const x = -170 + R() * 340, z = -140 + R() * 280;
      if (z > -32 && z < 22 && x > -94 && x < 80) continue;
      if (Math.abs(x - (X.rio - 12)) < 11) continue;
      if (Math.abs(x - 20) < 6 && z > 14) continue; // vía de acceso
      ts.push({ x, y: hillH(x, z, X.rio - 12).h, z, r: 1.6 + R() * 1.8 });
    }
    sc.add(trees(ts, 6));

    // ---- partículas, bacterias y goteo de coagulante
    const pUnits: ProcessId[] = ['desarenador', 'mezcla', 'floc', 'sedim', 'filtro', 'cloro'];
    const bUnits: ProcessId[] = ['desarenador', 'mezcla', 'floc', 'sedim', 'filtro', 'cloro', 'llave'];
    this.parts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ color: '#6d5236', roughness: 0.8 }), pUnits.length * 46);
    this.bugs = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.06, 0.22, 2, 6), new THREE.MeshStandardMaterial({ color: '#8c3fb3', emissive: new THREE.Color('#3a0f55'), roughness: 0.6 }), bUnits.length * 26);
    for (const m of [this.parts, this.bugs]) {
      m.frustumCulled = false;
      m.renderOrder = 6;
      sc.add(m);
    }
    const Rp = rng(77);
    for (const u of pUnits) for (let k = 0; k < 46; k++) this.slots.push({ unit: u, kind: 'p', a: Rp(), b: Rp(), c: Rp(), ph: Rp() * 6.28 });
    for (const u of bUnits) for (let k = 0; k < 26; k++) this.slots.push({ unit: u, kind: 'b', a: Rp(), b: Rp(), c: Rp(), ph: Rp() * 6.28 });
    this.drip = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshStandardMaterial({ color: '#d9e6f2' }), 12);
    this.drip.frustumCulled = false;
    sc.add(this.drip);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(7, 7.6, 48), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthTest: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.1;
    this.ring.renderOrder = 9;
    this.ring.visible = false;
    sc.add(this.ring);
    stage.view(this.views.general, false);
  }

  /** Colorea todos los vértices de una malla de agua (su material multiplica por el color del vértice). */
  private paint(mesh: THREE.Mesh, color: THREE.Color): void {
    const a = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) a.setXYZ(i, color.r, color.g, color.b);
    a.needsUpdate = true;
  }

  /** Montañas alrededor del predio (relieve ilustrativo), con un valle por donde baja el río. */
  private terrain(riverX: number): THREE.Mesh {
    const g = new THREE.PlaneGeometry(760, 600, 152, 120);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const grass = new THREE.Color('#5e8f3c'), forest = new THREE.Color('#3b6a30'), high = new THREE.Color('#6f8a4c'), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const { h, n, d } = hillH(x, z, riverX);
      pos.setY(i, h > 0.01 ? h : -0.05);
      const f = smooth(0.45, 0.7, n + 0.2 * smooth(0, 60, d));
      c.copy(grass).lerp(forest, f * smooth(2, 14, h)).lerp(high, smooth(55, 95, h) * 0.5);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    m.receiveShadow = true;
    return m;
  }

  /** Barandas amarillas de seguridad en los bordes de atrás y de los lados de un tanque (el frente es de vidrio). */
  private railings(cx: number, cz: number, w: number, d: number, h: number): void {
    const posts: THREE.Matrix4[] = [], rails: THREE.Matrix4[] = [];
    const m4 = () => new THREE.Matrix4();
    const H = 1.05;
    const edge = (x0: number, z0: number, x1: number, z1: number) => {
      const L = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(L / 1.8));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        posts.push(m4().compose(new THREE.Vector3(x0 + (x1 - x0) * t, h + H / 2, z0 + (z1 - z0) * t), new THREE.Quaternion(), new THREE.Vector3(0.09, H, 0.09)));
      }
      const ang = Math.atan2(x1 - x0, z1 - z0);
      for (const y of [H, H * 0.5]) rails.push(m4().compose(new THREE.Vector3((x0 + x1) / 2, h + y, (z0 + z1) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(0.07, 0.07, L)));
    };
    const x0 = cx - w / 2 + 0.15, x1 = cx + w / 2 - 0.15, z0 = cz - d / 2 + 0.15, z1 = cz + d / 2 - 0.4;
    edge(x0, z0, x1, z0);
    edge(x0, z0, x0, z1);
    edge(x1, z0, x1, z1);
    const mat = new THREE.MeshStandardMaterial({ color: '#e2b13c', roughness: 0.55, metalness: 0.2 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    for (const list of [posts, rails]) {
      const im = new THREE.InstancedMesh(unit, mat, list.length);
      list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.castShadow = true;
      this.stage.scene.add(im);
    }
  }

  /** Flechas planas sobre las tuberías: muestran hacia dónde va el agua; avanzan con la animación. */
  private buildChevrons(zl: number): void {
    const shape = new THREE.Shape();
    shape.moveTo(0.55, 0);
    shape.lineTo(-0.36, 0.4);
    shape.lineTo(-0.14, 0);
    shape.lineTo(-0.36, -0.4);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    for (let s = 0; s < FLOW_SEGS.length; s++) {
      const sg = FLOW_SEGS[s];
      const n = Math.max(1, Math.floor(Math.abs(sg.x1 - sg.x0) / 2.6));
      for (let k = 0; k < n; k++) this.chevSlots.push({ seg: s, k, n, sludge: false });
    }
    // línea de lodos: del sedimentador y de los filtros hacia el espesador (detrás)
    this.sludgeSegs = [
      { a: new THREE.Vector3(X.sedim - 6, 0.75, -5), b: new THREE.Vector3(X.sedim - 6, 0.75, zl) },
      { a: new THREE.Vector3(X.sedim - 6, 0.75, zl), b: new THREE.Vector3(X.lodos - 8 + 3.4, 0.75, zl) },
      { a: new THREE.Vector3(X.filtro, 0.82, -4.5), b: new THREE.Vector3(X.filtro, 0.82, zl + 2.6) },
    ];
    for (let s = 0; s < this.sludgeSegs.length; s++) {
      const L = this.sludgeSegs[s].a.distanceTo(this.sludgeSegs[s].b);
      const n = Math.max(1, Math.floor(L / 2.6));
      for (let k = 0; k < n; k++) this.chevSlots.push({ seg: s, k, n, sludge: true });
    }
    this.chevrons = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.18 }), this.chevSlots.length);
    this.chevrons.frustumCulled = false;
    this.chevrons.renderOrder = 4;
    this.stage.scene.add(this.chevrons);
    this.moveChevrons(0);
  }
  private sludgeSegs: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];

  private moveChevrons(t: number): void {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    this.chevSlots.forEach((sl, i) => {
      if (!sl.sludge) {
        const sg = FLOW_SEGS[sl.seg];
        const L = Math.abs(sg.x1 - sg.x0);
        const u = (sl.k / sl.n + (t * FLOW_SPEED) / L) % 1;
        p.set(sg.x0 + (sg.x1 - sg.x0) * u, sg.y + 0.4, sg.z);
        q.identity();
      } else {
        const sg = this.sludgeSegs[sl.seg];
        const L = sg.a.distanceTo(sg.b);
        const u = (sl.k / sl.n + (t * FLOW_SPEED * 0.4) / L) % 1;
        p.copy(sg.a).lerp(sg.b, u);
        q.setFromAxisAngle(up, Math.atan2(-(sg.b.z - sg.a.z), sg.b.x - sg.a.x));
      }
      this.chevrons.setMatrixAt(i, m4.compose(p, q, sc));
    });
    this.chevrons.instanceMatrix.needsUpdate = true;
  }

  /** Edificio de laboratorio y control, letrero de la escena y cerca del predio. */
  private buildSite(): void {
    const sc = this.stage.scene;
    const lab = houses([{ x: 38, y: 0.6, z: -17, w: 13, d: 7, h: 5.4, rot: 0, wall: '#ebe5d6' }]);
    sc.add(lab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.35, 7.8), concreteMaterial('#a8aaa6'));
    roof.position.set(38, 6.2, -17);
    roof.castShadow = true;
    sc.add(roof);
    // letrero junto a la entrada: dice que la planta es una escena ilustrativa
    if (typeof document !== 'undefined') {
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 160;
      const g = cv.getContext('2d');
      if (g) {
        g.fillStyle = '#1f5f8b';
        g.fillRect(0, 0, 512, 160);
        g.fillStyle = '#ffffff';
        g.font = '700 46px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('Planta de potabilización', 256, 70);
        g.font = '400 28px system-ui, sans-serif';
        g.fillText('escena ilustrativa · no es una planta real', 256, 118);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
        board.position.set(-74, 3.6, 17.4);
        sc.add(board);
        const postM = new THREE.MeshStandardMaterial({ color: '#5a6168' });
        for (const dx of [-3.8, 3.8]) {
          const pst = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6), postM);
          pst.position.set(-74 + dx, 2.3, 17.3);
          pst.castShadow = true;
          sc.add(pst);
        }
      }
    }
    // vía de acceso desde adelante, con línea central discontinua
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 190), new THREE.MeshStandardMaterial({ color: '#5d5f63', roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(20, 0.03, 16 + 95);
    road.receiveShadow = true;
    sc.add(road);
    const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 2.4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f1e6b8', roughness: 0.8 }), 38);
    for (let k = 0; k < 38; k++) dashes.setMatrixAt(k, new THREE.Matrix4().makeTranslation(20, 0.05, 19 + k * 5));
    sc.add(dashes);
    // cerca de malla: atrás y a los lados del predio (adelante queda abierta para ver los tanques)
    const posts: THREE.Vector3[] = [];
    const wires: THREE.Matrix4[] = [];
    const xa = -91, xb = 75, za = -28.5, zb = 16;
    const run = (x0: number, z0: number, x1: number, z1: number) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 3));
      for (let k = 0; k <= n; k++) posts.push(new THREE.Vector3(x0 + ((x1 - x0) * k) / n, 0.9, z0 + ((z1 - z0) * k) / n));
      const ang = Math.atan2(x1 - x0, z1 - z0);
      for (const y of [0.55, 1.15, 1.7]) wires.push(new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, y, (z0 + z1) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(0.03, 0.03, L)));
    };
    run(xa, za, xb, za);
    run(xa, za, xa, zb);
    run(xb, za, xb, zb);
    const fm = new THREE.MeshStandardMaterial({ color: '#7d858c', metalness: 0.4, roughness: 0.5 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const pim = new THREE.InstancedMesh(unit, fm, posts.length);
    posts.forEach((pp, i) => pim.setMatrixAt(i, new THREE.Matrix4().compose(pp, new THREE.Quaternion(), new THREE.Vector3(0.1, 1.8, 0.1))));
    const wim = new THREE.InstancedMesh(unit, fm, wires.length);
    wires.forEach((mm, i) => wim.setMatrixAt(i, mm));
    sc.add(pim, wim);
  }

  /** Turbiedad del agua en cada etapa [UNT] y bacterias [coliformes totales por 100 mL]. */
  private stageValues(r: PlantResult): Record<ProcessId, { t: number; c: number }> {
    const raw = r.raw.turbidity, c0 = r.raw.coliTotal;
    const removal = r.coliTotalTap / Math.max(1e-12, Math.pow(10, -r.logKill) * c0);
    const out = { t: r.filtered, c: r.coliTotalTap };
    return {
      rio: { t: raw, c: c0 },
      desarenador: { t: raw, c: c0 },
      mezcla: { t: raw, c: c0 },
      floc: { t: raw, c: c0 },
      sedim: { t: r.settled, c: c0 * Math.max(0.1, r.settled / raw) },
      filtro: { t: r.filtered, c: c0 * removal },
      cloro: out,
      ph: out,
      tanque: out,
      llave: out,
      lodos: { t: Math.max(0, raw - r.filtered), c: 0 },
    };
  }

  /** ¿Se están lavando los filtros en este momento? */
  get washing(): boolean {
    return this.wash !== null;
  }

  /** Lava los filtros al revés: el agua sube, el lecho se expande y la costra sale hacia los lodos. */
  backwash(): void {
    if (this.stage.reducedMotion) {
      this.cakeK = 0;
      this.setCake();
      this.stage.renderNow();
      return;
    }
    this.wash = { t0: this.stage.t };
  }

  set(v: PlantView): void {
    this.v = v;
    const vals = this.stageValues(v.r);
    const c = new THREE.Color();
    // las superficies horizontales reciben sol y cielo de lleno: su color base va más oscuro que el del agua
    // vista de lado, para que no se vean blancas y para que resalten la espuma y las vetas
    this.paint(this.river, turbColor(v.r.raw.turbidity, c).multiplyScalar(0.5));
    for (const sfc of this.surfaces) this.paint(sfc.mesh, turbColor(sfc.id === 'filtro' ? v.r.settled : vals[sfc.id].t, c).multiplyScalar(0.42));
    for (let i = 0; i < this.chevSlots.length; i++) {
      const sl = this.chevSlots[i];
      this.chevrons.setColorAt(i, sl.sludge ? c.set('#a07a4c') : turbColor(vals[FLOW_SEGS[sl.seg].from].t, c).lerp(WHITE, 0.35));
    }
    if (this.chevrons.instanceColor) this.chevrons.instanceColor.needsUpdate = true;
    for (const b of this.boxes) {
      const val = b.id === 'filtro' ? v.r.settled : vals[b.id].t;
      const m = b.water.material as THREE.MeshStandardMaterial;
      m.color.copy(turbColor(val, c));
      m.opacity = 0.45 + 0.4 * Math.min(1, Math.sqrt(val / 160));
    }
    (this.glass.material as THREE.MeshStandardMaterial).color.copy(turbColor(v.r.filtered, c));
    // arena del desarenador, lodo del sedimentador, costra de los filtros y lodo del espesador
    const sandH = { verano: 0.2, lluvia: 0.5, creciente: 0.9 }[v.inp.raw];
    this.sand.scale.y = sandH;
    this.sand.position.y = 0.35 + sandH / 2;
    const removed = Math.max(0, v.r.raw.turbidity - v.r.settled);
    const sh = 0.15 + Math.min(1.4, 0.35 * Math.log10(removed + 1));
    this.sludge.scale.y = sh;
    this.sludge.position.y = 0.35 + sh / 2;
    const th = 0.3 + Math.min(1.6, 0.4 * Math.log10(Math.max(0, v.r.raw.turbidity - v.r.filtered) + 1));
    this.thick.scale.y = th;
    this.thick.position.y = 0.2 + th / 2;
    this.setCake();
    (this.cake.material as THREE.MeshStandardMaterial).color.set(v.r.clogged ? '#5a3a1f' : '#7a5a35');
    // basura atajada por la rejilla
    const nL = { verano: 6, lluvia: 14, creciente: 30 }[v.inp.raw];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const Rl = rng(31);
    for (let k = 0; k < this.litter.count; k++) {
      const yy = 0.3 + Rl() * 1.6, zz = -2.5 + Rl() * 5, rot = Rl() * 3;
      if (k >= nL) this.litter.setMatrixAt(k, m4.makeScale(0, 0, 0));
      else {
        q.setFromEuler(new THREE.Euler(rot, 0.3, rot * 0.5));
        this.litter.setMatrixAt(k, m4.compose(p.set(X.rio - 2.9, yy, zz), q, s));
      }
    }
    this.litter.instanceMatrix.needsUpdate = true;
    if (v.unit) {
      this.ring.position.set(X[v.unit], 0.1, Z[v.unit] ?? 0);
      this.ring.visible = true;
    } else this.ring.visible = false;
    this.stage.setLabels(this.labels(vals));
  }

  private setCake(): void {
    const v = this.v;
    if (!v) return;
    const full = 0.05 + Math.min(0.9, 0.3 * Math.log10(Math.max(0, v.r.settled - v.r.filtered) + 1));
    const ck = 0.02 + full * this.cakeK;
    this.cake.scale.y = ck / 0.1;
    this.cake.position.y = 2.05 + ck / 2;
  }

  private labels(vals: Record<ProcessId, { t: number; c: number }>): StageLabel[] {
    const v = this.v!;
    const f = (t: number) => `${t.toLocaleString('es-CO', { maximumFractionDigits: t < 10 ? 1 : 0 })} UNT`;
    const H: Partial<Record<ProcessId, number>> = { rio: 4, desarenador: 4.2, tanque: 6.8, llave: 5.6, ph: 8.2, lodos: v.unit === 'lodos' ? 4.5 : 24 };
    return PROCESSES.map((u, i) => {
      const box = this.boxes.find((b) => b.id === u.id);
      // las etiquetas se alternan en dos alturas para que las once quepan en la vista general (la del proceso
      // elegido se queda abajo, para que se vea en su vista de cerca)
      const y = (H[u.id] ?? (box?.h ?? 4) + 1.9) + (i % 2 && u.id !== 'lodos' && v.unit !== u.id ? 11 : 0);
      let sub = f(vals[u.id].t);
      let kind: StageLabel['kind'] = 'dato';
      if (u.id === 'filtro' && v.r.clogged) {
        sub = `${f(vals.filtro.t)} · ¡se tapan!`;
        kind = 'alerta';
      }
      if (u.id === 'desarenador') sub = `arena: ${{ verano: 'poca', lluvia: 'bastante', creciente: 'mucha' }[v.inp.raw]}`;
      if (u.id === 'cloro') sub = `${v.inp.chlorine.toLocaleString('es-CO', { maximumFractionDigits: 1 })} mg/L`;
      if (u.id === 'mezcla') sub = `${v.inp.dose} mg/L`;
      if (u.id === 'ph') sub = `pH ${v.r.pH.toLocaleString('es-CO', { maximumFractionDigits: 1 })}`;
      if (u.id === 'lodos') sub = 'espesador y lechos';
      if (u.id === 'tanque') sub = `cloro ${v.r.clExit.toLocaleString('es-CO', { maximumFractionDigits: 2 })} mg/L`;
      if (u.id === 'llave') {
        sub = `IRCA ${Math.round(v.r.irca)} %`;
        kind = v.r.irca <= 5 ? 'ok' : 'alerta';
      }
      const x = u.id === 'ph' ? X.ph : X[u.id];
      const z = u.id === 'llave' ? 0.6 : u.id === 'ph' ? -4.8 : Z[u.id] ?? 0;
      return { id: u.id, text: `${u.n}. ${TAG[u.id]}`, sub, at: new THREE.Vector3(x, y, z), kind, prio: v.unit === u.id ? 9 : u.id === 'llave' ? 8 : 4 };
    });
  }

  update(dt: number, t: number): void {
    const v = this.v;
    if (!v) return;
    this.waterTime.value = t;
    this.moveChevrons(t);
    // máquinas: las paletas de cada zona del floculador giran más despacio (G de 70 a 10 s⁻¹)
    this.mixer.rotation.y = t * 5;
    const sp = [0.9, 0.55, 0.22];
    this.flocWheels.forEach((w, i) => (w.rotation.z = t * sp[i]));
    const vals = this.stageValues(v.r);
    const eff = 1 - v.r.settled / v.r.raw.turbidity;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    // retrolavado: la costra sale en la primera mitad y suben burbujas; después el filtro se vuelve a ensuciar
    let washK = 0;
    if (this.wash) {
      const el = t - this.wash.t0;
      washK = el < WASH_S ? Math.sin((el / WASH_S) * Math.PI) : 0;
      this.cakeK = Math.max(0, 1 - el / (WASH_S / 2));
      if (el >= WASH_S) this.wash = null;
    } else if (this.cakeK < 1 && dt > 0) {
      this.cakeK = Math.min(1, this.cakeK + dt / 45);
    }
    this.setCake();
    for (let k = 0; k < this.bubbles.count; k++) {
      if (washK <= 0.02) {
        this.bubbles.setMatrixAt(k, zero);
        continue;
      }
      const ph = (t * 0.6 + k / this.bubbles.count) % 1;
      const x = X.filtro + (((k * 37) % 100) / 100 - 0.5) * 13;
      const z = (((k * 53) % 100) / 100 - 0.5) * 7.5;
      this.bubbles.setMatrixAt(k, m4.compose(p.set(x, 2.1 + ph * 2 * washK, z), q.identity(), s.setScalar(washK)));
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
    let ip = 0, ib = 0;
    const counts: Record<string, number> = {};
    for (const sl of this.slots) {
      const key = `${sl.kind}${sl.unit}`;
      const k = (counts[key] = (counts[key] ?? -1) + 1);
      const b = this.boxes.find((x) => x.id === sl.unit);
      const n = sl.kind === 'p' ? partsFor(sl.unit === 'filtro' ? v.r.settled : vals[sl.unit].t) : bugsFor(vals[sl.unit].c);
      const mesh = sl.kind === 'p' ? this.parts : this.bugs;
      const idx = sl.kind === 'p' ? ip++ : ib++;
      if (k >= n) {
        mesh.setMatrixAt(idx, zero);
        continue;
      }
      let x = 0, y = 0, z = 0, sc = 1;
      if (sl.unit === 'llave') {
        // bacterias dentro del vaso
        x = X.llave + 0.4 + (sl.a - 0.5) * 0.4;
        y = 1.25 + sl.b * 0.5 + 0.03 * Math.sin(t * 2 + sl.ph);
        z = 0.6 + (sl.c - 0.5) * 0.4;
        sc = 0.8;
      } else if (b) {
        const hw = b.w / 2 - 0.7, hd = b.d / 2 - 0.7, top = b.h - 0.5;
        x = b.x + (sl.a - 0.5) * 2 * hw;
        z = b.z + (sl.c - 0.5) * 2 * hd;
        y = 0.6 + sl.b * (top - 0.8);
        if (sl.unit === 'mezcla') {
          const ang = t * 3 + sl.ph, rr = 0.6 + sl.a * 2.2;
          x = b.x + Math.cos(ang) * rr;
          z = Math.sin(ang) * rr;
        } else if (sl.unit === 'desarenador' && sl.kind === 'p') {
          // la arcilla, finísima, viaja con el agua de un extremo al otro sin caer
          x = b.x - hw + ((t * 0.25 + sl.a) % 1) * 2 * hw;
          y = 1.2 + sl.b * 1.0;
        } else if (sl.unit === 'floc' && sl.kind === 'p') {
          // grumos: se agrupan según la eficiencia de la dosis y crecen de una zona a la siguiente
          const g = Math.floor(sl.a * 6);
          const cx = b.x - 5 + g * 2, cz = g % 2 ? 1.6 : -1.6;
          x += (cx - x) * eff * 0.85 + 0.25 * Math.sin(t + sl.ph);
          z += (cz - z) * eff * 0.85;
          sc = 1 + eff * 1.6 * (0.4 + Math.max(0, Math.min(1, (x - b.x + 7) / 14)));
        } else if (sl.unit === 'sedim' && sl.kind === 'p') {
          // lo que queda (turbiedad del agua decantada) flota cerca de la salida
          x = b.x + 4 + sl.a * 5;
          y = top - 0.6 - sl.b * 1.2 + 0.1 * Math.sin(t * 0.8 + sl.ph);
        } else if (sl.unit === 'filtro' && sl.kind === 'p') {
          if (washK > 0.02) y = 2.2 + sl.b * 2 * washK;
          else {
            // las partículas que llegan bajan y se quedan sobre el lecho
            const fall = (t * 0.25 + sl.b) % 1;
            y = Math.max(2.15, top - 0.3 - fall * (top - 2.4));
          }
        } else {
          x += 0.25 * Math.sin(t * 0.7 + sl.ph);
          y += 0.15 * Math.sin(t * 0.9 + sl.ph * 2);
        }
      }
      q.setFromEuler(new THREE.Euler(sl.ph + t * 0.6, sl.a * 3, sl.b * 3 + t * 0.3));
      mesh.setMatrixAt(idx, m4.compose(p.set(x, y, z), q, s.setScalar(sc)));
    }
    this.parts.instanceMatrix.needsUpdate = true;
    this.bugs.instanceMatrix.needsUpdate = true;
    // goteo del coagulante (más gotas con más dosis)
    const nd = Math.min(12, Math.round(v.inp.dose / 6));
    for (let k = 0; k < 12; k++) {
      if (k >= nd) {
        this.drip.setMatrixAt(k, zero);
        continue;
      }
      const ph = (t * 1.4 + k / 12) % 1;
      this.drip.setMatrixAt(k, m4.makeTranslation(X.mezcla - 1.5, 4.4 - ph * 1.6, -3.6 + ph * 0.8));
    }
    this.drip.instanceMatrix.needsUpdate = true;
    if (dt > 0) this.ring.rotation.z += dt * 0.5;
  }
}

// Planta de potabilización en 3D: el agua del río entra, recibe coagulante, forma grumos (flocs) que se asientan,
// pasa por filtros de arena, recibe cloro, se guarda en un tanque y llega por la red a la llave de una casa.
// Los tanques tienen el frente de vidrio: se ve el color del agua (turbiedad calculada en cada etapa), las
// partículas y las bacterias, cuyo número sigue el cálculo en escala logarítmica.

import * as THREE from 'three';
import type { PlantInput, PlantResult } from '../model';
import { houses, rng, tank, trees, type TreeSpot } from './kit';
import type { QStage, StageLabel, StageView } from './stage';

export type UnitId = 'rio' | 'mezcla' | 'floc' | 'sedim' | 'filtro' | 'cloro' | 'tanque' | 'llave';

export const UNITS: { id: UnitId; name: string; what: string }[] = [
  { id: 'rio', name: 'Río y bocatoma', what: 'El agua entra a la planta por una rejilla que deja afuera ramas y basura grande.' },
  { id: 'mezcla', name: 'Mezcla rápida', what: 'Se agrega el coagulante (sulfato de aluminio) y se revuelve muy rápido para que llegue a todas las partículas.' },
  { id: 'floc', name: 'Floculadores', what: 'Paletas que giran despacio: las partículas se pegan y forman grumos (flocs) cada vez más grandes.' },
  { id: 'sedim', name: 'Sedimentador', what: 'El agua casi quieta deja caer los flocs al fondo (lodo). Arriba sale el agua clara.' },
  { id: 'filtro', name: 'Filtros de arena', what: 'Capas de arena y grava atrapan las partículas que quedaban. Si llega mucha turbiedad, se tapan.' },
  { id: 'cloro', name: 'Desinfección con cloro', what: 'El cloro mata los microbios que pasaron los filtros. Necesita tiempo y agua clara: las partículas los esconden.' },
  { id: 'tanque', name: 'Tanque de almacenamiento', what: 'Guarda el agua tratada. Debe quedar algo de cloro (cloro residual) para cuidar el agua en la red.' },
  { id: 'llave', name: 'La llave de la casa', what: 'El agua llega por la red de tuberías. Aquí se mide si cumple la norma colombiana (Resolución 2115 de 2007).' },
];

const X: Record<UnitId, number> = { rio: -66, mezcla: -42, floc: -26, sedim: -4, filtro: 18, cloro: 34, tanque: 47, llave: 64 };

function turbColor(t: number, out = new THREE.Color()): THREE.Color {
  const clear = new THREE.Color(0.55, 0.78, 0.86), brown = new THREE.Color(0.56, 0.42, 0.25);
  return out.copy(clear).lerp(brown, Math.min(1, Math.sqrt(t / 160)));
}

/** Partículas y bacterias dibujadas para una turbiedad [UNT] o un conteo [por 100 mL] (escala logarítmica). */
export const partsFor = (t: number) => Math.round(Math.min(46, Math.max(0, 13 * Math.log10(t + 1))));
export const bugsFor = (c: number) => (c < 0.5 ? 0 : Math.round(Math.min(26, 4 * Math.log10(c + 1))));

interface Box {
  id: UnitId;
  x: number;
  w: number;
  d: number;
  h: number;
  water: THREE.Mesh;
}

export interface PlantView {
  inp: PlantInput;
  r: PlantResult;
  unit: UnitId | null;
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
  private cake: THREE.Mesh;
  private drip: THREE.InstancedMesh;
  private ring: THREE.Mesh;
  private v: PlantView | null = null;
  private slots: { unit: UnitId; kind: 'p' | 'b'; a: number; b: number; c: number; ph: number }[] = [];
  readonly views: Record<'general' | 'entrada' | 'tanques' | 'llave', StageView> = {
    general: { eye: [-4, 78, 138], target: [-4, 0, -4] },
    entrada: { eye: [-50, 15, 24], target: [-32, 2, 0] },
    tanques: { eye: [8, 14, 25], target: [8, 2, 0] },
    llave: { eye: [56, 7, 15], target: [64, 2.6, 0] },
  };

  constructor(stage: QStage, cb: { onUnit: (id: UnitId) => void }) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(70);
    // ---- suelo: prado alrededor y patio de concreto de la planta
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 260), new THREE.MeshStandardMaterial({ color: '#5e8f3c', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    sc.add(ground);
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(122, 34), new THREE.MeshStandardMaterial({ color: '#c9c5bb', roughness: 0.95 }));
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(10, 0.02, 0);
    yard.receiveShadow = true;
    sc.add(yard);
    // ---- río
    const rg = new THREE.PlaneGeometry(16, 260, 1, 40);
    this.river = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 0.25, transparent: true, opacity: 0.92 }));
    this.river.rotation.x = -Math.PI / 2;
    this.river.position.set(X.rio - 8, 0.05, 0);
    sc.add(this.river);
    const bankM = new THREE.MeshStandardMaterial({ color: '#7d6a52', roughness: 1 });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 260), bankM);
      b.position.set(X.rio - 8 + s * 8.4, 0.2, 0);
      sc.add(b);
    }
    const intake = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 5), new THREE.MeshStandardMaterial({ color: '#b8b4ab' }));
    intake.position.set(X.rio, 1.2, 0);
    intake.castShadow = true;
    sc.add(intake);
    stage.addPick(intake, () => cb.onUnit('rio'), 'Bocatoma: toca para ver qué pasa aquí');
    stage.addPick(this.river, () => cb.onUnit('rio'), 'El río: toca para ver qué pasa aquí');

    // ---- tanques con frente de vidrio
    const wm = (op: number) => new THREE.MeshStandardMaterial({ color: '#88b9c9', transparent: true, opacity: op, roughness: 0.2, depthWrite: false });
    const mk = (id: UnitId, w: number, d: number, h: number) => {
      const g = tank(w, h, d, { glassFront: true });
      g.position.set(X[id], 0, 0);
      g.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      sc.add(g);
      const water = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, h - 0.75, d - 0.8), wm(0.62));
      water.position.set(X[id], (h - 0.75) / 2 + 0.36, 0);
      water.renderOrder = 5;
      sc.add(water);
      this.boxes.push({ id, x: X[id], w, d, h, water });
      stage.addPick(g, () => cb.onUnit(id), `${UNITS.find((u) => u.id === id)!.name}: toca para ver qué pasa aquí`);
      return g;
    };
    mk('mezcla', 6, 7, 3.6);
    mk('floc', 14, 9, 3.6);
    mk('sedim', 20, 10, 4.4);
    mk('filtro', 15, 9, 4.4);
    mk('cloro', 8, 8, 3.6);
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
    // paletas de los floculadores
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
    // placas inclinadas del sedimentador
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
    // capas del filtro: grava, arena y la costra de mugre que se acumula arriba
    const layer = (y: number, h: number, col: string) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(14.2, h, 8.2), new THREE.MeshStandardMaterial({ color: col, roughness: 1 }));
      m.position.set(X.filtro, y + h / 2, 0);
      sc.add(m);
      return m;
    };
    layer(0.35, 0.6, '#8e8a83');
    layer(0.95, 1.1, '#d8c79b');
    this.cake = layer(2.05, 0.1, '#7a5a35');
    // cloro: cilindros de gas y tubo de dosificación
    for (const dz of [-0.9, 0.9]) {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 14), new THREE.MeshStandardMaterial({ color: '#b9c63a', roughness: 0.5 }));
      cyl.position.set(X.cloro + dz * 1.5, 1.3, -6.4);
      cyl.castShadow = true;
      sc.add(cyl);
    }
    // tanque de almacenamiento
    const st = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 5.4, 28), new THREE.MeshStandardMaterial({ color: '#d7d3c9', roughness: 0.85 }));
    st.position.set(X.tanque, 2.7, 0);
    st.castShadow = true;
    st.receiveShadow = true;
    sc.add(st);
    stage.addPick(st, () => cb.onUnit('tanque'), 'Tanque de almacenamiento: toca para ver qué pasa aquí');
    // tuberías entre las etapas y la red hasta la casa
    const pipeM = new THREE.MeshStandardMaterial({ color: '#4f6d86', roughness: 0.5 });
    const pipe = (x0: number, x1: number, y: number) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, x1 - x0, 10), pipeM);
      p.rotation.z = Math.PI / 2;
      p.position.set((x0 + x1) / 2, y, 0);
      p.castShadow = true;
      sc.add(p);
    };
    pipe(X.rio + 2, X.mezcla - 3, 1.6);
    pipe(X.mezcla + 3, X.floc - 7, 2.8);
    pipe(X.floc + 7, X.sedim - 10, 2.8);
    pipe(X.sedim + 10, X.filtro - 7.5, 3.4);
    pipe(X.filtro + 7.5, X.cloro - 4, 1.2);
    pipe(X.cloro + 4, X.tanque - 5, 1.2);
    pipe(X.tanque + 5, X.llave - 2.6, 0.6);
    // la casa con la llave (frente abierto) y el vaso
    const hs = houses([{ x: X.llave + 1.5, y: 0.6, z: -1.8, w: 6, d: 3, h: 4.2, rot: 0, wall: '#efe0c0' }]);
    sc.add(hs);
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.4), new THREE.MeshStandardMaterial({ color: '#8a5a3a' }));
    table.position.set(X.llave, 1.05, 0.6);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 1.2), new THREE.MeshStandardMaterial({ color: '#6d462d' }));
    legs.position.set(X.llave, 0.5, 0.6);
    const tap = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 12, Math.PI), steel);
    tap.position.set(X.llave - 0.4, 2.3, -0.2);
    this.glass = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.8, 18), new THREE.MeshStandardMaterial({ color: '#a8d8e8', transparent: true, opacity: 0.85, roughness: 0.1 }));
    this.glass.position.set(X.llave + 0.4, 1.53, 0.6);
    sc.add(table, legs, tap, this.glass);
    stage.addPick(this.glass, () => cb.onUnit('llave'), 'La llave: toca para ver si el agua es segura');
    stage.addPick(hs, () => cb.onUnit('llave'), 'La llave: toca para ver si el agua es segura');
    // árboles alrededor
    const R = rng(4);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 160; k++) {
      const x = -150 + R() * 300, z = -120 + R() * 240;
      if (Math.abs(z) < 22 && x > -60 && x < 76) continue;
      if (Math.abs(x - (X.rio - 8)) < 11) continue;
      ts.push({ x, y: 0, z, r: 1.6 + R() * 1.8 });
    }
    sc.add(trees(ts, 6));

    // ---- partículas, bacterias y goteo de coagulante
    this.parts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ color: '#6d5236', roughness: 0.8 }), 6 * 46);
    this.bugs = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.06, 0.22, 2, 6), new THREE.MeshStandardMaterial({ color: '#8c3fb3', emissive: new THREE.Color('#3a0f55'), roughness: 0.6 }), 7 * 26);
    for (const m of [this.parts, this.bugs]) {
      m.frustumCulled = false;
      m.renderOrder = 6;
      sc.add(m);
    }
    const Rp = rng(77);
    const pUnits: UnitId[] = ['mezcla', 'floc', 'sedim', 'filtro', 'cloro', 'tanque'];
    for (const u of pUnits) for (let k = 0; k < 46; k++) this.slots.push({ unit: u, kind: 'p', a: Rp(), b: Rp(), c: Rp(), ph: Rp() * 6.28 });
    const bUnits: UnitId[] = ['mezcla', 'floc', 'sedim', 'filtro', 'cloro', 'tanque', 'llave'];
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

  /** Turbiedad del agua en cada etapa [UNT] y bacterias [coliformes totales por 100 mL]. */
  private stageValues(r: PlantResult): Record<UnitId, { t: number; c: number }> {
    const raw = r.raw.turbidity, c0 = r.raw.coliTotal;
    const removal = r.coliTotalTap / Math.max(1e-9, Math.pow(10, -r.logKill) * c0);
    return {
      rio: { t: raw, c: c0 },
      mezcla: { t: raw, c: c0 },
      floc: { t: raw, c: c0 },
      sedim: { t: r.settled, c: c0 * Math.max(0.1, r.settled / raw) },
      filtro: { t: r.filtered, c: c0 * removal },
      cloro: { t: r.filtered, c: r.coliTotalTap },
      tanque: { t: r.filtered, c: r.coliTotalTap },
      llave: { t: r.filtered, c: r.coliTotalTap },
    };
  }

  set(v: PlantView): void {
    this.v = v;
    const vals = this.stageValues(v.r);
    const c = new THREE.Color();
    (this.river.material as THREE.MeshStandardMaterial).color.copy(turbColor(v.r.raw.turbidity, c));
    for (const b of this.boxes) {
      const val = b.id === 'filtro' ? v.r.settled : vals[b.id].t;
      const m = b.water.material as THREE.MeshStandardMaterial;
      m.color.copy(turbColor(val, c));
      m.opacity = 0.45 + 0.4 * Math.min(1, Math.sqrt(val / 160));
    }
    const gm = this.glass.material as THREE.MeshStandardMaterial;
    gm.color.copy(turbColor(v.r.filtered, c));
    // lodo del sedimentador y costra de los filtros: crecen con lo que retienen
    const removed = Math.max(0, v.r.raw.turbidity - v.r.settled);
    const sh = 0.15 + Math.min(1.4, 0.35 * Math.log10(removed + 1));
    this.sludge.scale.y = sh;
    this.sludge.position.y = 0.35 + sh / 2;
    const ck = 0.05 + Math.min(0.9, 0.3 * Math.log10(Math.max(0, v.r.settled - v.r.filtered) + 1));
    this.cake.scale.y = ck / 0.1;
    this.cake.position.y = 2.05 + ck / 2;
    (this.cake.material as THREE.MeshStandardMaterial).color.set(v.r.clogged ? '#5a3a1f' : '#7a5a35');
    if (v.unit) {
      this.ring.position.x = X[v.unit];
      this.ring.visible = true;
    } else this.ring.visible = false;
    this.stage.setLabels(this.labels(vals));
  }

  private labels(vals: Record<UnitId, { t: number; c: number }>): StageLabel[] {
    const v = this.v!;
    const f = (t: number) => `${t.toLocaleString('es-CO', { maximumFractionDigits: t < 10 ? 1 : 0 })} UNT`;
    const out: StageLabel[] = UNITS.map((u) => {
      const box = this.boxes.find((b) => b.id === u.id);
      const y = u.id === 'tanque' ? 6.8 : u.id === 'llave' ? 5.6 : u.id === 'rio' ? 4 : (box?.h ?? 4) + 1.9;
      let sub = f(vals[u.id].t);
      let kind: StageLabel['kind'] = 'dato';
      if (u.id === 'filtro' && v.r.clogged) {
        sub = `${f(vals.filtro.t)} · ¡se tapan!`;
        kind = 'alerta';
      }
      if (u.id === 'cloro') sub = `${v.inp.chlorine.toLocaleString('es-CO', { maximumFractionDigits: 1 })} mg/L de cloro`;
      if (u.id === 'mezcla') sub = `${v.inp.dose} mg/L de coagulante`;
      if (u.id === 'llave') {
        sub = `IRCA ${Math.round(v.r.irca)} %: ${v.r.risk.toLowerCase()}`;
        kind = v.r.irca <= 5 ? 'ok' : 'alerta';
      }
      return { id: u.id, text: u.name, sub, at: new THREE.Vector3(X[u.id], y, u.id === 'llave' ? 0.6 : 0), kind, prio: u.id === 'llave' ? 8 : 4 };
    });
    return out;
  }

  update(dt: number, t: number): void {
    const v = this.v;
    if (!v) return;
    // movimiento de las máquinas
    this.mixer.rotation.y = t * 5;
    this.flocWheels.forEach((w, i) => (w.rotation.z = t * 0.5 * (i % 2 ? -1 : 1)));
    const vals = this.stageValues(v.r);
    const eff = 1 - v.r.settled / v.r.raw.turbidity;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
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
        z = (sl.c - 0.5) * 2 * hd;
        y = 0.6 + sl.b * (top - 0.8);
        if (sl.unit === 'mezcla') {
          const ang = t * 3 + sl.ph, rr = 0.6 + sl.a * 2.2;
          x = b.x + Math.cos(ang) * rr;
          z = Math.sin(ang) * rr;
        } else if (sl.unit === 'floc' && sl.kind === 'p') {
          // grumos: se agrupan y crecen según la eficiencia de la dosis
          const g = Math.floor(sl.a * 6);
          const cx = b.x - 5 + g * 2, cz = (g % 2 ? 1.6 : -1.6);
          x += (cx - x) * eff * 0.85 + 0.25 * Math.sin(t + sl.ph);
          z += (cz - z) * eff * 0.85;
          sc = 1 + eff * 1.6;
        } else if (sl.unit === 'sedim' && sl.kind === 'p') {
          // lo que queda (turbiedad del agua decantada) flota cerca de la salida
          x = b.x + 4 + sl.a * 5;
          y = top - 0.6 - sl.b * 1.2 + 0.1 * Math.sin(t * 0.8 + sl.ph);
        } else if (sl.unit === 'filtro' && sl.kind === 'p') {
          // las partículas que llegan bajan y se quedan sobre la arena
          const fall = (t * 0.25 + sl.b) % 1;
          y = Math.max(2.15, top - 0.3 - fall * (top - 2.4));
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

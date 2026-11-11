// «El canal y su caudal» en 3D: un tramo recto de 60 m de canal (rectangular, trapecial o tubo), metido en el
// terreno y cortado al frente para ver su sección y el agua a la profundidad normal calculada. Un flotador corre
// a la velocidad de la superficie (la media / 0,85), la regla del frente marca la profundidad, y el agua se
// enturbia si el fondo se erosiona, deja bancos de arena si va muy lenta y hace olas si va cerca de la crítica.
// El agua que sale del canal se dibuja solo para mostrar que se desborda (el cálculo no la sigue afuera).

import * as THREE from 'three';
import { MATERIALS, SHAPES, geom, type Material, type Section, type UniformInput, type UniformResult } from '../hydraulics';
import { concreteMaterial, rng, trees, type TreeSpot } from '../../quality/three/kit';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { WATER, WaterBody, glassMaterial, slab, staffGauge } from './canalKit';

const L = 60;
const W = 26;
const T_LINE = 0.2;

const LINING: Record<Material, string> = { concreto: '#bdb8ae', piedra: '#8d8376', tierra: '#8a6747', pasto: '#5d8c3b', cantos: '#8a7d68' };

/** Perfiles de la sección en (z, y): el borde interior y el exterior del revestimiento. */
function profiles(s: Section): { inner: [number, number][]; outer: [number, number][] } {
  const z = s.shape === 'trap' ? s.z : 0;
  const k = Math.sqrt(1 + z * z), b = s.b / 2, H = s.H, t = T_LINE;
  return {
    inner: [
      [-b - z * H, H],
      [-b, 0],
      [b, 0],
      [b + z * H, H],
    ],
    outer: [
      [b + H * z + t * k, H],
      [b + t * (k - z), -t],
      [-b - t * (k - z), -t],
      [-b - H * z - t * k, H],
    ],
  };
}

function extrude(pts: [number, number][], mats: THREE.Material | THREE.Material[]): THREE.Mesh {
  const sh = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-L / 2, 0, 0);
  const m = new THREE.Mesh(g, mats);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Polígono del agua en la sección, en (z, y). */
function waterPoly(s: Section, y: number): [number, number][] {
  if (s.shape === 'circ') {
    const r = s.D / 2, h = Math.min(y, s.D);
    const a = Math.acos(Math.max(-1, Math.min(1, (r - h) / r)));
    const pts: [number, number][] = [];
    for (let k = 0; k <= 40; k++) {
      const ang = -Math.PI / 2 - a + (2 * a * k) / 40;
      pts.push([r * Math.cos(ang), r + r * Math.sin(ang)]);
    }
    return pts;
  }
  const z = s.shape === 'trap' ? s.z : 0;
  return [
    [-s.b / 2, 0],
    [s.b / 2, 0],
    [s.b / 2 + z * y, y],
    [-s.b / 2 - z * y, y],
  ];
}

export interface UniformView {
  inp: UniformInput;
  r: UniformResult;
}

export class UniformWorld {
  private stage: QStage;
  private time = { value: 0 };
  private built = '';
  private dyn = new THREE.Group();
  private water: WaterBody;
  private flood: WaterBody;
  private cut: THREE.Mesh;
  private cutMat = new THREE.MeshStandardMaterial({ color: '#3a8fc2', transparent: true, opacity: 0.78, roughness: 0.2, side: THREE.DoubleSide });
  private float: THREE.Mesh;
  private grains: THREE.InstancedMesh;
  private bars: THREE.InstancedMesh;
  private v: UniformView | null = null;
  readonly views: Record<'general' | 'corte' | 'arriba', StageView> = {
    general: { eye: [44, 10, 20], target: [8, 0.4, 0], fit: 40 },
    corte: { eye: [37, 1.6, 4.2], target: [30, 0.7, 0], fit: 9 },
    arriba: { eye: [6, 26, 14], target: [0, 0, 0], fit: 46 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(40);
    stage.controls.minDistance = 2;
    const R = rng(21);
    // terreno lejano y árboles
    const far = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), new THREE.MeshStandardMaterial({ color: '#6c9a4a', roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    far.position.y = -2.6;
    far.receiveShadow = true;
    sc.add(far);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 60; k++) {
      const x = -90 + R() * 150, z = (R() < 0.5 ? -1 : 1) * (14 + R() * 50);
      ts.push({ x, y: 1.5, z, r: 1.4 + R() * 1.6 });
    }
    sc.add(trees(ts, 5));
    sc.add(this.dyn);
    this.water = new WaterBody(this.time, { side: false });
    this.flood = new WaterBody(this.time, { side: false, opacity: 0.7 });
    sc.add(this.water.group, this.flood.group);
    this.cut = new THREE.Mesh(new THREE.BufferGeometry(), this.cutMat);
    this.cut.renderOrder = 4;
    sc.add(this.cut);
    // flotador: un disco naranja que corre con la superficie
    this.float = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 18), new THREE.MeshStandardMaterial({ color: '#f07a1a', roughness: 0.5 }));
    this.float.castShadow = true;
    sc.add(this.float);
    // granos que arrastra el agua (erosión) y bancos de arena (sedimentación)
    this.grains = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ color: '#6e5536', roughness: 1 }), 160);
    this.bars = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 8), new THREE.MeshStandardMaterial({ color: '#d8c38f', roughness: 1 }), 8);
    this.grains.frustumCulled = this.bars.frustumCulled = false;
    sc.add(this.grains, this.bars);
    stage.view(this.views.general, false);
  }

  private build(s: Section, mat: Material): void {
    for (const c of [...this.dyn.children]) {
      this.dyn.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const R = rng(4);
    const linMat = mat === 'concreto' ? concreteMaterial(LINING.concreto) : mat === 'piedra' ? concreteMaterial(LINING.piedra) : new THREE.MeshStandardMaterial({ color: LINING[mat], roughness: 1 });
    const soil = new THREE.MeshStandardMaterial({ color: '#7a5a3c', roughness: 1 });
    const grass = new THREE.MeshStandardMaterial({ color: '#6a9a48', roughness: 1 });
    if (s.shape === 'circ') {
      // tubo: mitad de abajo de concreto, mitad de arriba de vidrio para ver el agua
      const r = s.D / 2;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(r + T_LINE, r + T_LINE, L, 40, 1, true, Math.PI / 2, Math.PI), concreteMaterial('#b9b4aa'));
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 40, 1, true, Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: '#a9a49a', roughness: 0.9, side: THREE.BackSide }));
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(r + T_LINE * 0.5, r + T_LINE * 0.5, L, 40, 1, true, -Math.PI / 2, Math.PI), glassMaterial(0.18));
      for (const m of [lower, inner, upper]) {
        m.rotation.z = Math.PI / 2;
        m.position.y = r;
        this.dyn.add(m);
      }
      lower.castShadow = true;
      // anillo del corte al frente
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + T_LINE, 48), concreteMaterial('#a8a398'));
      ring.rotation.y = Math.PI / 2;
      ring.position.set(L / 2 + 0.01, r, 0);
      this.dyn.add(ring);
      // cama de concreto y terreno
      this.dyn.add(slab(concreteMaterial('#a9a398'), -L / 2, L / 2, -T_LINE - 0.5, r * 0.6, -r - 0.3, r + 0.3));
      this.dyn.add(slab(grass, -L / 2 - 20, L / 2, -2.5, -T_LINE - 0.5, -W, W, false));
    } else {
      const { inner, outer } = profiles(s);
      this.dyn.add(extrude([...inner, ...outer], [linMat, linMat]));
      const H = s.H;
      const gL: [number, number][] = [[-W, -2.5], [W, -2.5], [W, H], outer[0], outer[1], outer[2], outer[3], [-W, H]];
      this.dyn.add(extrude(gL, [soil, grass]));
      // corona de concreto en los bordes del canal revestido
      if (mat === 'concreto' || mat === 'piedra') {
        for (const sg of [-1, 1]) this.dyn.add(slab(linMat, -L / 2, L / 2, H, H + 0.08, sg > 0 ? outer[0][0] - 0.05 : outer[3][0] - 0.25, sg > 0 ? outer[0][0] + 0.25 : outer[3][0] + 0.05));
      }
      if (mat === 'cantos') {
        const geo = new THREE.IcosahedronGeometry(1, 0);
        const n = 420;
        const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#9b9286', roughness: 0.9, flatShading: true }), n);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3();
        for (let k = 0; k < n; k++) {
          const rr = 0.06 + R() * 0.1;
          q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3));
          im.setMatrixAt(k, m4.compose(p.set(-L / 2 + R() * L, rr * 0.4, (R() - 0.5) * s.b * 0.95), q, sv.set(rr, rr * 0.7, rr)));
        }
        im.receiveShadow = true;
        this.dyn.add(im);
      }
    }
    // regla de aforo en el eje, cerca del corte
    const gauge = staffGauge(s.H, 0.05, 0.5, 0.1);
    gauge.position.set(L / 2 - 1.2, 0, s.shape === 'circ' ? -s.D * 0.3 : 0);
    gauge.rotation.y = Math.PI / 2;
    this.dyn.add(gauge);
    const post = slab(new THREE.MeshStandardMaterial({ color: '#33414d' }), L / 2 - 1.24, L / 2 - 1.2, 0, s.H + 0.1, gauge.position.z - 0.07, gauge.position.z + 0.07);
    this.dyn.add(post);
  }

  set(v: UniformView): void {
    this.v = v;
    const s = SHAPES[v.inp.shape];
    const key = `${v.inp.shape}-${v.inp.material}`;
    if (key !== this.built) {
      this.build(s, v.inp.material);
      this.built = key;
    }
    const r = v.r;
    const pressure = Number.isNaN(r.yn);
    const y = pressure ? s.D : Math.min(r.yn, s.shape === 'circ' ? s.D : s.H + 0.02);
    const T = s.shape === 'circ' ? (pressure ? 0 : geom(s, y).T) : geom(s, Math.min(y, s.H)).T;
    const color = r.erosion ? WATER.turbid : r.sediment ? WATER.silty : WATER.clear;
    this.water.setColor(color);
    this.water.setSpeed(r.V);
    // superficie: olas si el flujo está cerca del crítico; espuma si es rápido
    const st = [];
    const foam = r.unstable ? 0.55 : r.F > 1 ? 0.35 : 0.05;
    for (let k = 0; k <= 120; k++) {
      const x = -L / 2 + (L * k) / 120;
      const wave = r.unstable ? 0.06 * Math.sin(x * 1.3) : 0;
      st.push({ x, bed: 0, depth: Math.max(0.01, y + wave), halfW: Math.max(0.02, T / 2 - 0.01), foam });
    }
    this.water.group.visible = !pressure;
    this.water.update(st);
    // desborde: lámina sobre el terreno a lado y lado (solo indica que sale del canal)
    this.flood.group.visible = r.overflow && s.shape !== 'circ';
    if (this.flood.group.visible) {
      this.flood.setColor('#4b8fb8');
      this.flood.setSpeed(0.3);
      const half = geom(s, s.H).T / 2 + 3 + Math.min(10, 12 * (r.yn - s.H));
      this.flood.update([
        { x: -L / 2, bed: s.H, depth: 0.04, halfW: half },
        { x: L / 2, bed: s.H, depth: 0.04, halfW: half },
      ]);
    }
    // cara del agua en el corte
    const sh = new THREE.Shape(waterPoly(s, y).map(([u, w]) => new THREE.Vector2(u, w)));
    const g = new THREE.ShapeGeometry(sh, 24);
    g.rotateY(Math.PI / 2);
    this.cut.geometry.dispose();
    this.cut.geometry = g;
    this.cut.position.set(L / 2 + 0.015, 0, 0);
    this.cutMat.color.set(color);
    // bancos de arena cuando va lento
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3();
    const R = rng(8);
    for (let k = 0; k < this.bars.count; k++) {
      const on = r.sediment && !pressure;
      const bw = s.shape === 'circ' ? s.D * 0.25 : s.b * 0.3;
      this.bars.setMatrixAt(k, on ? m4.compose(p.set(-25 + k * 7 + R() * 3, 0.0, (R() - 0.5) * bw), q.identity(), sv.set(1.6 + R() * 1.2, Math.min(0.12, y * 0.4), bw * 0.6)) : m4.makeScale(0, 0, 0));
    }
    this.bars.instanceMatrix.needsUpdate = true;
    this.stage.setLabels(this.labels());
  }

  private labels(): StageLabel[] {
    const v = this.v!;
    const s = SHAPES[v.inp.shape];
    const r = v.r;
    const es = (x: number, d = 2) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const out: StageLabel[] = [];
    if (Number.isNaN(r.yn)) out.push({ id: 'y', text: 'Tubo lleno: no cabe con superficie libre', at: new THREE.Vector3(L / 2, s.D + 0.6, 0), kind: 'alerta', prio: 6 });
    else out.push({ id: 'y', text: `Profundidad ${es(r.yn)} m`, sub: `velocidad ${es(r.V, 1)} m/s · Froude ${es(r.F)}`, at: new THREE.Vector3(L / 2 - 1.2, Math.min(r.yn, s.H) + 0.5, 0), kind: r.ok ? 'ok' : 'dato', prio: 6 });
    if (r.overflow && s.shape !== 'circ') out.push({ id: 'over', text: 'Se desborda', at: new THREE.Vector3(0, s.H + 0.8, geom(s, s.H).T / 2 + 3), kind: 'alerta', prio: 5 });
    if (r.erosion) out.push({ id: 'ero', text: 'El agua arranca el fondo', sub: `más de ${es(MATERIALS[v.inp.material].vmax ?? 0, 2)} m/s en ${MATERIALS[v.inp.material].name.toLowerCase()}`, at: new THREE.Vector3(-8, 0.3, 0), kind: 'alerta', prio: 4 });
    if (r.sediment) out.push({ id: 'sed', text: 'Se deposita arena', sub: 'el agua va a menos de 0,6 m/s', at: new THREE.Vector3(-12, 0.3, 0), kind: 'alerta', prio: 4 });
    if (r.unstable) out.push({ id: 'uns', text: 'Olas: flujo cerca del crítico', at: new THREE.Vector3(6, Math.min(r.yn, s.H) + 0.6, 0), kind: 'alerta', prio: 3 });
    return out;
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    const v = this.v;
    if (!v) return;
    const s = SHAPES[v.inp.shape];
    const r = v.r;
    const pressure = Number.isNaN(r.yn);
    // flotador: velocidad de la superficie = media / 0,85
    const Vs = r.V / 0.85;
    const x = this.stage.reducedMotion ? -10 : ((((t * Vs) % L) + L) % L) - L / 2;
    const y = pressure ? s.D : Math.min(r.yn, s.shape === 'circ' ? s.D : s.H);
    this.float.visible = !pressure;
    this.float.position.set(x, y + 0.03, s.shape === 'circ' ? 0 : -0.4);
    // granos arrastrados
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sv = new THREE.Vector3(1, 1, 1);
    const R = rng(12);
    const bw = s.shape === 'circ' ? s.D * 0.4 : s.b * 0.9;
    for (let k = 0; k < this.grains.count; k++) {
      const a = R(), b = R(), c = R();
      if (!r.erosion || pressure) {
        this.grains.setMatrixAt(k, m4.makeScale(0, 0, 0));
        continue;
      }
      const gx = ((((a * L + t * r.V * (0.4 + 0.5 * c)) % L) + L) % L) - L / 2;
      const gy = Math.abs(Math.sin(t * 3 + k)) * y * 0.5 * c + 0.03;
      p.set(gx, gy, (b - 0.5) * bw);
      this.grains.setMatrixAt(k, m4.compose(p, q, sv));
    }
    this.grains.instanceMatrix.needsUpdate = true;
    void dt;
  }
}

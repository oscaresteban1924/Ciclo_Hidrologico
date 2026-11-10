// La cuadra en 3D: veinte casas, la calle con su cuneta y su sumidero, y debajo dos tubos: el de aguas lluvias
// (va a la quebrada sin tratar) y el de aguas residuales (va a la planta de tratamiento). La tierra se ve como en
// un corte de vidrio para que se lean los tubos. Cuando llueve, el agua lava la calle (Sartor y Boyd) y lleva
// la mugre y la basura al sumidero y a la quebrada. Con la prueba del colorante se descubren las casas que
// tienen el desagüe conectado por error al tubo de aguas lluvias.

import * as THREE from 'three';
import type { StreetInput } from '../model';
import { STREET, buildup, washoff } from '../model';
import { houses, rng, trees, waterMaterial, WALLS, type HouseSpot } from './kit';
import type { QStage, StageLabel, StageView } from './stage';

const N = STREET.houses;
const HX = (i: number) => -42 + i * 4.42;
const DRAIN_X = 40;
const STORM = { z: 5.7, y: -1.9, r: 0.45 };
const SEWER = { z: 3.6, y: -3.7, r: 0.42 };
const CREEK_X = 60;
const CREEK_Y = -5.9;
const LOW = -6.6;

/**
 * Suelo dibujado: la cuadra es un bloque (como una maqueta) con la tierra en corte transparente al frente; delante
 * y a la derecha el terreno está más bajo, y la quebrada corre al pie de la ladera.
 */
function groundAt(x: number, z: number): number {
  let y: number;
  if (x < 47) y = z < -15 ? 0 : LOW;
  else y = Math.max(LOW, z < 7.6 ? -(x - 47) * 0.75 : LOW);
  if (x > CREEK_X + 4) y = Math.min(0, LOW + (x - CREEK_X - 4) * 0.45);
  const dc = Math.abs(x - CREEK_X);
  if (dc < 4.2) y = Math.min(y, CREEK_Y - 0.9 + 0.75 * (dc / 4.2) ** 2);
  return y;
}

/** Casas con conexión errada: las primeras k de un orden fijo (el mismo en cada visita). */
export function wrongSet(k: number): Set<number> {
  const R = rng(2024);
  const order = [...Array(N).keys()];
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return new Set(order.slice(0, Math.max(0, Math.min(N, k))));
}

export interface StreetView {
  inp: StreetInput;
  wash: ReturnType<typeof washoff>;
  wrong: Set<number>;
  tested: Map<number, boolean>;
  picked: number | null;
}

interface Flow {
  path: THREE.Vector3[];
  len: number[];
  total: number;
  t0: number;
  dur: number;
  wrong: boolean;
  house: number;
}

export class StreetWorld {
  private stage: QStage;
  private time = { value: 0 };
  private v: StreetView | null = null;
  private laterals: THREE.Mesh[] = [];
  private latMat = new THREE.MeshStandardMaterial({ color: '#9aa1a6', roughness: 0.6 });
  private rainPts: THREE.LineSegments;
  private gutter: THREE.Mesh;
  private gutterCol: Float32Array;
  private road: THREE.Mesh;
  private litter: THREE.InstancedMesh;
  private dirt: THREE.InstancedMesh;
  private items: { x: number; z: number; kind: 'l' | 'd'; leave: number; rot: number }[] = [];
  private plume: THREE.InstancedMesh;
  private dyeDots: THREE.InstancedMesh;
  private flow: Flow | null = null;
  private dyePlume = 0;
  private rain: { t0: number; min: number } | null = null;
  private lastMin = -1;
  private sky = 0;
  private marks: THREE.Group = new THREE.Group();
  private cb: { onHouse: (i: number) => void; onRainMinute: (m: number) => void; onRainEnd: () => void; onDyeEnd: (i: number, wrong: boolean) => void };
  /** Segundos de animación por minuto de lluvia. */
  static readonly SEC_PER_MIN = 0.4;
  readonly views: Record<'general' | 'calle' | 'tubos' | 'quebrada', StageView> = {
    general: { eye: [0, 15, 52], target: [6, -3, -1] },
    calle: { eye: [-22, 5, 13], target: [12, 0, -2] },
    tubos: { eye: [12, -2.2, 27], target: [18, -2.8, 2] },
    quebrada: { eye: [40, 6, 32], target: [60, -5, 4] },
  };

  constructor(stage: QStage, cb: StreetWorld['cb']) {
    this.stage = stage;
    this.cb = cb;
    const sc = stage.scene;
    stage.setShadowSpan(70);
    stage.controls.minDistance = 4;
    // ---- terreno: prado alrededor, bajando hacia la quebrada
    const gg = new THREE.PlaneGeometry(260, 200, 130, 100);
    gg.rotateX(-Math.PI / 2);
    const gp = gg.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < gp.count; k++) gp.setY(k, groundAt(gp.getX(k), gp.getZ(k)) - 0.05);
    gg.computeVertexNormals();
    const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: '#5f8f3e', roughness: 1 }));
    ground.receiveShadow = true;
    sc.add(ground);
    // ---- losa de la calle: andén norte, vía, andén sur
    const slab = (z0: number, z1: number, col: string, y = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(94, 0.4, z1 - z0), new THREE.MeshStandardMaterial({ color: col, roughness: 0.92 }));
      m.position.set(0, y - 0.2, (z0 + z1) / 2);
      m.receiveShadow = true;
      sc.add(m);
      return m;
    };
    slab(-15, -6, '#b9b3a6');
    slab(-6, -4, '#c9c5bb', 0.15);
    this.road = slab(-4, 4, '#55585c');
    slab(4, 7.5, '#c9c5bb', 0.15);
    // líneas de la vía
    const lineM = new THREE.MeshBasicMaterial({ color: '#e9d36a' });
    for (let x = -44; x < 44; x += 6) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.18), lineM);
      l.rotation.x = -Math.PI / 2;
      l.position.set(x, 0.01, 0);
      sc.add(l);
    }
    // ---- tierra en corte de vidrio (para ver los tubos)
    const soil = new THREE.Mesh(new THREE.BoxGeometry(94, -LOW - 0.4, 22.5), new THREE.MeshStandardMaterial({ color: '#9a7652', transparent: true, opacity: 0.24, roughness: 1, depthWrite: false }));
    soil.position.set(0, (LOW - 0.4) / 2, -3.75);
    soil.renderOrder = 7;
    sc.add(soil);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(soil.geometry), new THREE.LineBasicMaterial({ color: '#6b5236' }));
    edges.position.copy(soil.position);
    sc.add(edges);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(94, 0.3, 22.5), new THREE.MeshStandardMaterial({ color: '#6b5236' }));
    bottom.position.set(0, LOW + 0.1, -3.75);
    sc.add(bottom);
    // ---- tubos principales
    const tube = (pts: THREE.Vector3[], r: number, col: string) => {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 12), r, 12, false), new THREE.MeshStandardMaterial({ color: col, roughness: 0.45 }));
      m.castShadow = true;
      sc.add(m);
      return m;
    };
    tube([new THREE.Vector3(-47, STORM.y, STORM.z), new THREE.Vector3(46, STORM.y, STORM.z), new THREE.Vector3(53, STORM.y - 0.1, STORM.z), new THREE.Vector3(CREEK_X - 3.6, CREEK_Y + 0.6, STORM.z)], STORM.r, '#2f78c4');
    tube([new THREE.Vector3(-47, SEWER.y, SEWER.z), new THREE.Vector3(46.5, SEWER.y, SEWER.z), new THREE.Vector3(48, SEWER.y, SEWER.z - 6), new THREE.Vector3(49, SEWER.y, -40)], SEWER.r, '#8a5a2b');
    // sumidero: rejilla en la cuneta y bajante al tubo de aguas lluvias
    const grate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.8), new THREE.MeshStandardMaterial({ color: '#2a2d30', metalness: 0.5 }));
    grate.position.set(DRAIN_X, 0.02, 3.55);
    const shaftM = new THREE.MeshStandardMaterial({ color: '#2f78c4' });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, -STORM.y, 10), shaftM);
    shaft.position.set(DRAIN_X, STORM.y / 2, 3.55);
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, STORM.z - 3.55, 10), shaftM);
    link.rotation.x = Math.PI / 2;
    link.position.set(DRAIN_X, STORM.y, (STORM.z + 3.55) / 2);
    sc.add(grate, shaft, link);
    // ---- casas y sus desagües (laterales)
    const R = rng(9);
    const spots: HouseSpot[] = [...Array(N)].map((_, i) => ({ x: HX(i), y: 0, z: -10.5, w: 4.3, d: 8.5, h: 3 * (1 + Math.floor(R() * 3)), rot: 0, wall: WALLS[Math.floor(R() * WALLS.length)] }));
    const hm = houses(spots);
    sc.add(hm);
    stage.addPick(
      hm,
      (_p, hit) => {
        if (hit.instanceId !== undefined) cb.onHouse(hit.instanceId);
      },
      'Toca una casa para echar colorante en su desagüe',
    );
    for (let i = 0; i < N; i++) {
      const lat = new THREE.Mesh(new THREE.BufferGeometry(), this.latMat);
      this.laterals.push(lat);
      sc.add(lat);
      // bajante del techo a la calle
      const dp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, spots[i].h), new THREE.MeshStandardMaterial({ color: '#8d969c' }));
      dp.position.set(HX(i) + 1.9, spots[i].h / 2, -6.1);
      sc.add(dp);
    }
    sc.add(this.marks);
    // árboles del parque de la quebrada
    const ts = [];
    for (let k = 0; k < 70; k++) {
      const x = CREEK_X - 10 + R() * 26, z = -90 + R() * 180;
      if (Math.abs(x - CREEK_X) < 5.5 || (x < 50 && z > -16 && z < 9)) continue;
      ts.push({ x, y: groundAt(x, z), z, r: 1.6 + R() * 1.4 });
    }
    for (let k = 0; k < 60; k++) ts.push({ x: -120 + R() * 160, y: 0, z: -40 - R() * 50, r: 1.8 + R() * 1.6 });
    for (let k = 0; k < 40; k++) {
      const x = -110 + R() * 150, z = 30 + R() * 60;
      ts.push({ x, y: groundAt(x, z), z, r: 1.8 + R() * 1.6 });
    }
    sc.add(trees(ts, 12));
    // ---- quebrada
    const cg = new THREE.PlaneGeometry(7, 200, 1, 100);
    cg.rotateX(-Math.PI / 2);
    const flowA = new Float32Array(cg.getAttribute('position').count * 2);
    const foam = new Float32Array(cg.getAttribute('position').count);
    for (let k = 0; k < cg.getAttribute('position').count; k++) {
      flowA[k * 2] = -(cg.getAttribute('position') as THREE.BufferAttribute).getZ(k);
      flowA[k * 2 + 1] = (cg.getAttribute('position') as THREE.BufferAttribute).getX(k) / 3.5;
    }
    cg.setAttribute('aFlow', new THREE.BufferAttribute(flowA, 2));
    cg.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
    const ccol = new Float32Array(cg.getAttribute('position').count * 3);
    for (let k = 0; k < ccol.length; k += 3) ccol.set([0.2, 0.5, 0.58], k);
    cg.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
    const creek = new THREE.Mesh(cg, waterMaterial(this.time, { opacity: 0.85, speed: -0.8 }));
    creek.position.set(CREEK_X, CREEK_Y, 0);
    creek.renderOrder = 3;
    sc.add(creek);
    // ---- cuneta con agua (se llena cuando llueve)
    const gt = new THREE.PlaneGeometry(DRAIN_X + 46, 0.9, 60, 1);
    gt.rotateX(-Math.PI / 2);
    const gn = gt.getAttribute('position').count;
    const gf = new Float32Array(gn * 2);
    for (let k = 0; k < gn; k++) {
      gf[k * 2] = (gt.getAttribute('position') as THREE.BufferAttribute).getX(k);
      gf[k * 2 + 1] = 0;
    }
    gt.setAttribute('aFlow', new THREE.BufferAttribute(gf, 2));
    gt.setAttribute('aFoam', new THREE.BufferAttribute(new Float32Array(gn), 1));
    this.gutterCol = new Float32Array(gn * 3);
    gt.setAttribute('color', new THREE.BufferAttribute(this.gutterCol, 3));
    this.gutter = new THREE.Mesh(gt, waterMaterial(this.time, { opacity: 0.8, speed: 1.6 }));
    this.gutter.position.set((DRAIN_X - 46) / 2, 0.03, 3.55);
    this.gutter.renderOrder = 3;
    this.gutter.visible = false;
    sc.add(this.gutter);
    // ---- lluvia
    // gotas como rayitas verticales (se leen mejor que puntos a cualquier distancia)
    const nr = 2200, rp = new Float32Array(nr * 6);
    for (let k = 0; k < nr; k++) {
      const x = -50 + R() * 116, y = -6 + R() * 36, z = -18 + R() * 46;
      rp.set([x, y, z, x + 0.05, y - 0.9, z + 0.05], k * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rainPts = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#dbe8f3', transparent: true, opacity: 0.7, depthWrite: false }));
    this.rainPts.visible = false;
    this.rainPts.frustumCulled = false;
    sc.add(this.rainPts);
    // ---- basura y mugre en la calle, pluma en la quebrada y gotas de colorante
    this.litter = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.08, 0.25), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), 90);
    this.dirt = new THREE.InstancedMesh(new THREE.CircleGeometry(0.45, 7), new THREE.MeshStandardMaterial({ color: '#3d342a', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }), 110);
    this.dirt.geometry.rotateX(-Math.PI / 2);
    const lc = ['#e9e4d8', '#d64c3b', '#3a7bd5', '#f2c230', '#5aa361', '#ffffff', '#b06bc9'];
    for (let k = 0; k < 90; k++) this.litter.setColorAt(k, new THREE.Color(lc[k % lc.length]));
    this.plume = new THREE.InstancedMesh(new THREE.CircleGeometry(0.9, 10), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }), 70);
    this.plume.geometry.rotateX(-Math.PI / 2);
    this.dyeDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#e0218a' }), 40);
    for (const m of [this.litter, this.dirt, this.plume, this.dyeDots]) {
      m.frustumCulled = false;
      m.renderOrder = 8;
      sc.add(m);
    }
    stage.view(this.views.general, false);
  }

  private lateralPath(i: number, wrong: boolean): THREE.Vector3[] {
    const x = HX(i);
    const to = wrong ? STORM : SEWER;
    return [new THREE.Vector3(x - 0.6, -0.4, -6.2), new THREE.Vector3(x - 0.6, -1.2, -6.2), new THREE.Vector3(x - 0.6, to.y + 0.6, to.z - (wrong ? 1.2 : 0.8)), new THREE.Vector3(x - 0.6, to.y, to.z)];
  }

  set(v: StreetView): void {
    const prev = this.v;
    this.v = v;
    // laterales: cada casa conectada a su tubo (errada → aguas lluvias)
    if (!prev || prev.wrong !== v.wrong) {
      for (let i = 0; i < N; i++) {
        const curve = new THREE.CatmullRomCurve3(this.lateralPath(i, v.wrong.has(i)), false, 'catmullrom', 0.1);
        this.laterals[i].geometry.dispose();
        this.laterals[i].geometry = new THREE.TubeGeometry(curve, 16, 0.13, 8, false);
      }
      // basura y mugre: posiciones fijas; salen al sumidero según la masa lavada
      const R = rng(55);
      this.items = [];
      const nl = Math.min(90, v.wash.trashItems);
      // manchas de mugre: proporcionales a lo acumulado en la calle (hasta 25 g/m² sin barrido)
      const nd = Math.min(110, Math.round(4 * buildup(v.inp.dryDays, v.inp.sweeping)));
      for (let k = 0; k < nl; k++) this.items.push({ x: -44 + R() * 82, z: -3.4 + R() * 6.6, kind: 'l', leave: 0, rot: R() * 6 });
      for (let k = 0; k < nd; k++) this.items.push({ x: -44 + R() * 82, z: -3.6 + R() * 7, kind: 'd', leave: 0, rot: R() * 6 });
    }
    // momento en que cada cosa sale de la calle: cuando la fracción lavada (del total acumulado) alcanza su
    // turno; lo que la lluvia no alcanza a lavar se queda en la calle
    const B0 = Math.max(1e-9, (buildup(v.inp.dryDays, v.inp.sweeping) * STREET.area) / 1000);
    let li = 0, di = 0;
    const nl = this.items.filter((it) => it.kind === 'l').length, nd = this.items.length - nl;
    for (const it of this.items) {
      const rank = it.kind === 'l' ? (li++ + 0.5) / Math.max(1, nl) : (di++ + 0.5) / Math.max(1, nd);
      const m = v.wash.massKg.findIndex((kg) => kg / B0 >= rank);
      it.leave = m < 0 ? Infinity : m + 1;
    }
    // marcas sobre las casas probadas
    this.marks.clear();
    for (const [i, wrong] of v.tested) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshStandardMaterial({ color: wrong ? '#d0342c' : '#2f8f55', emissive: new THREE.Color(wrong ? '#501010' : '#0f3a20') }));
      m.position.set(HX(i), 0.5 + 9.6, -6.6);
      this.marks.add(m);
    }
    this.stage.setLabels(this.labels());
  }

  private labels(): StageLabel[] {
    const v = this.v!;
    const out: StageLabel[] = [
      { id: 'sumidero', text: 'Sumidero', at: new THREE.Vector3(DRAIN_X, 1.2, 3.6), kind: 'dato', prio: 4 },
      { id: 'lluvias', text: 'Tubo de aguas lluvias', sub: 'va a la quebrada sin tratar', at: new THREE.Vector3(-30, STORM.y + 0.8, STORM.z + 2), kind: 'lugar', prio: 5 },
      { id: 'residuales', text: 'Tubo de aguas residuales', sub: 'va a la planta de tratamiento', at: new THREE.Vector3(-12, SEWER.y + 0.7, SEWER.z + 4), kind: 'lugar', prio: 5 },
      { id: 'quebrada', text: 'Quebrada', at: new THREE.Vector3(CREEK_X, CREEK_Y + 2, 14), kind: 'lugar', prio: 3 },
    ];
    for (const [i, wrong] of v.tested) out.push({ id: `h-${i}`, text: wrong ? 'Conexión errada' : 'Bien conectada', at: new THREE.Vector3(HX(i), 11.4, -6.6), kind: wrong ? 'alerta' : 'ok', prio: 6 });
    return out;
  }

  /** Empieza el aguacero (la animación dura la duración de la lluvia × SEC_PER_MIN). */
  startRain(): void {
    if (this.stage.reducedMotion && this.v) {
      // sin animación: el resultado de una vez
      this.lastMin = this.v.inp.durationMin;
      this.cb.onRainMinute(this.v.inp.durationMin);
      this.cb.onRainEnd();
      return;
    }
    this.rain = { t0: this.stage.t, min: 0 };
    this.lastMin = -1;
  }

  /** Colorante por el desagüe de la casa i: viaja por su lateral y por el tubo al que está conectada. */
  dye(i: number, wrong: boolean): void {
    const lat = this.lateralPath(i, wrong);
    const main = wrong
      ? [new THREE.Vector3(HX(i) - 0.6, STORM.y, STORM.z), new THREE.Vector3(46, STORM.y, STORM.z), new THREE.Vector3(53, STORM.y - 0.1, STORM.z), new THREE.Vector3(CREEK_X - 3.6, CREEK_Y + 0.6, STORM.z)]
      : [new THREE.Vector3(HX(i) - 0.6, SEWER.y, SEWER.z), new THREE.Vector3(46.5, SEWER.y, SEWER.z), new THREE.Vector3(48, SEWER.y, SEWER.z - 6), new THREE.Vector3(49, SEWER.y, -30)];
    const path = [...lat, ...main.slice(1)];
    const len = [0];
    for (let k = 1; k < path.length; k++) len.push(len[k - 1] + path[k].distanceTo(path[k - 1]));
    this.flow = { path, len, total: len[len.length - 1], t0: this.stage.t, dur: Math.max(2.5, len[len.length - 1] / 26), wrong, house: i };
  }

  private along(f: Flow, s: number, out: THREE.Vector3): THREE.Vector3 {
    const d = Math.max(0, Math.min(f.total, s * f.total));
    let k = 1;
    while (k < f.len.length - 1 && f.len[k] < d) k++;
    const a = f.path[k - 1], b = f.path[k];
    const t = (d - f.len[k - 1]) / Math.max(1e-6, f.len[k] - f.len[k - 1]);
    return out.copy(a).lerp(b, t);
  }

  /** Minuto de lluvia mostrado (o −1 si no llueve). */
  rainMinute(): number {
    return this.rain ? this.rain.min : -1;
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    const v = this.v;
    if (!v) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    // ---- lluvia: minuto simulado
    let minute = Infinity, raining = false;
    if (this.rain) {
      const el = (t - this.rain.t0) / StreetWorld.SEC_PER_MIN;
      minute = Math.floor(el);
      raining = el < v.inp.durationMin;
      this.rain.min = Math.min(v.inp.durationMin, minute);
      if (this.rain.min !== this.lastMin) {
        this.lastMin = this.rain.min;
        this.cb.onRainMinute(this.rain.min);
      }
      if (!raining && el > v.inp.durationMin + 4) {
        this.rain = null;
        this.cb.onRainEnd();
      }
    }
    this.rainPts.visible = raining;
    // cielo de aguacero: gris mientras llueve, se aclara al terminar
    this.sky += ((raining ? 1 : 0) - this.sky) * Math.min(1, dt * 1.5 || 0);
    this.stage.weather(this.sky);
    if (raining && dt > 0) {
      const P = this.rainPts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const fall = dt * (16 + v.inp.rainMmH * 0.3);
      for (let k = 0; k < P.count; k += 2) {
        let y = P.getY(k) - fall;
        if (y < -6) y += 36;
        P.setY(k, y);
        P.setY(k + 1, y - 0.9);
      }
      P.needsUpdate = true;
    }
    const mi = Math.max(0, Math.min(v.wash.t.length - 1, (this.rain ? this.rain.min : 0) - 1));
    const flowing = raining || (this.rain !== null && minute < v.inp.durationMin + 3);
    const q0 = v.wash.flowLs.length ? v.wash.flowLs[mi] : 0;
    this.gutter.visible = flowing;
    if (flowing) {
      const c = new THREE.Color();
      const conc = v.wash.conc[mi] ?? 0;
      c.setRGB(0.36, 0.52, 0.6).lerp(new THREE.Color(0.5, 0.4, 0.27), Math.min(1, conc / 600));
      for (let k = 0; k < this.gutterCol.length; k += 3) this.gutterCol.set([c.r, c.g, c.b], k);
      (this.gutter.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      this.gutter.scale.z = 0.5 + Math.min(1, q0 / 20);
    }
    (this.road.material as THREE.MeshStandardMaterial).color.set(raining || flowing ? '#3f4245' : '#55585c');
    // ---- basura y mugre: se quedan hasta su minuto; luego corren por la cuneta al sumidero
    let il = 0, id = 0;
    for (const it of this.items) {
      const mesh = it.kind === 'l' ? this.litter : this.dirt;
      const idx = it.kind === 'l' ? il++ : id++;
      let x = it.x, z = it.z, y = it.kind === 'l' ? 0.05 : 0.02;
      if (this.rain && minute >= it.leave) {
        const tt = (t - this.rain.t0 - it.leave * StreetWorld.SEC_PER_MIN) * 1.2;
        const toCurb = Math.min(1, tt / 0.8);
        z = it.z + (3.5 - it.z) * toCurb;
        const along = Math.max(0, tt - 0.8) * 9;
        x = Math.min(DRAIN_X, it.x + along);
        if (x >= DRAIN_X) {
          mesh.setMatrixAt(idx, zero);
          continue;
        }
        y = 0.08;
      } else if (!this.rain && this.lastMin >= 0 && it.leave <= v.inp.durationMin) {
        // ya llovió: lo que se lavó no vuelve hasta que se reinicie la cuadra
        mesh.setMatrixAt(idx, zero);
        continue;
      }
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
      mesh.setMatrixAt(idx, m4.compose(p.set(x, y, z), q, s.setScalar(it.kind === 'd' ? 1 + (it.rot % 1) : 1)));
    }
    for (; il < this.litter.count; il++) this.litter.setMatrixAt(il, zero);
    for (; id < this.dirt.count; id++) this.dirt.setMatrixAt(id, zero);
    this.litter.instanceMatrix.needsUpdate = true;
    this.dirt.instanceMatrix.needsUpdate = true;
    // ---- pluma en la quebrada: lavado de la calle (lluvia), agua usada (conexiones erradas) o colorante
    const pm = this.plume.material as THREE.MeshBasicMaterial;
    const conc = flowing ? v.wash.conc[mi] ?? 0 : 0;
    const sewage = v.wrong.size > 0 ? 0.25 + 0.4 * Math.min(1, v.wrong.size / 8) : 0;
    let strength = Math.max(flowing ? Math.min(1, 0.25 + conc / 400) : 0, sewage);
    let col = flowing && conc > 30 ? '#7a5a34' : '#6f6a55';
    if (this.dyePlume > 0) {
      strength = Math.min(1, this.dyePlume);
      col = '#e0218a';
      this.dyePlume -= dt * 0.18;
    }
    pm.color.set(col);
    pm.opacity = 0.6 * strength;
    for (let k = 0; k < this.plume.count; k++) {
      const ph = ((t * 0.12 + k / this.plume.count) % 1);
      const spread = 0.4 + ph * 2.6;
      const x = CREEK_X - 2.6 + ph * 2.2 + Math.sin(k * 2.1) * 0.6 * ph;
      const z = STORM.z + ph * 34 + Math.cos(k * 1.7) * 0.8;
      if (strength < 0.02) {
        this.plume.setMatrixAt(k, zero);
        continue;
      }
      this.plume.setMatrixAt(k, m4.compose(p.set(x, CREEK_Y + 0.04 + k * 0.0005, z), q.identity(), s.set(spread, 1, spread * 1.3)));
    }
    this.plume.instanceMatrix.needsUpdate = true;
    // ---- colorante
    const f = this.flow;
    if (f) {
      const el = (t - f.t0) / f.dur;
      for (let k = 0; k < this.dyeDots.count; k++) {
        const sk = el - k * 0.012;
        if (sk < 0 || sk > 1) {
          this.dyeDots.setMatrixAt(k, zero);
          continue;
        }
        this.dyeDots.setMatrixAt(k, m4.compose(this.along(f, sk, p), q.identity(), s.setScalar(1)));
      }
      this.dyeDots.instanceMatrix.needsUpdate = true;
      if (el > 1 + this.dyeDots.count * 0.012) {
        if (f.wrong) this.dyePlume = 1.2;
        this.flow = null;
        this.cb.onDyeEnd(f.house, f.wrong);
        for (let k = 0; k < this.dyeDots.count; k++) this.dyeDots.setMatrixAt(k, zero);
        this.dyeDots.instanceMatrix.needsUpdate = true;
      }
      // con «movimiento reducido» el tiempo no avanza: se termina de una vez
      if (this.stage.reducedMotion) {
        this.flow = null;
        if (f.wrong) this.dyePlume = 1.2;
        this.cb.onDyeEnd(f.house, f.wrong);
      }
    }
    for (const mk of this.marks.children) mk.position.y = 10.1 + 0.25 * Math.sin(t * 2 + mk.position.x);
  }

  /** Para la lluvia y vuelve a poner la basura y la mugre en la calle. */
  resetStreet(): void {
    this.rain = null;
    this.lastMin = -1;
    if (this.v) this.set({ ...this.v });
  }
}

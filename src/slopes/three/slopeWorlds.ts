// Mundos 3D de la sala «Laderas»: la parcela donde llueve (el frente de humedecimiento baja por el corte, se forman
// charcos y el agua escurre), la ladera con su capa de suelo sobre la roca (el nivel del agua sube y, si el factor de
// seguridad baja de 1, la capa se desliza) y la ladera de cultivo que pierde suelo (surcos, barreras, terrazas y la
// quebrada que se enturbia). Todo a escala, sin exagerar.

import * as THREE from 'three';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { houses, rng, type HouseSpot } from '../../quality/three/kit';
import { lookMaterial, lookWater } from '../../three/look';
import { Birds, RainStreaks, studioFloor, trees, type TreeSpot } from '../../three/scenery';
import { es } from '../../canals/common';
import type { GAResult } from '../slope';
import { COVERS, type Cover, type Practice, type Texture, TEXTURES } from '../slope';

const soilMat = (color: string, detail = 0.18) => lookMaterial(new THREE.MeshStandardMaterial({ color, roughness: 1 }), { detail, scale: 2 });
const rockMat = () => lookMaterial(new THREE.MeshStandardMaterial({ color: '#8b857c', roughness: 0.95 }), { detail: 0.22, patches: 0.08, scale: 0.8 });

/** Quita y libera lo que tenga el grupo. */
function clear(g: THREE.Group): void {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

/** Pasto en matas: conos delgados con instancias. */
function grass(n: number, at: (R: () => number) => [number, number, number] | null, seed: number, h = 0.25, color = '#5d9a43', radius = 0.035): THREE.InstancedMesh {
  const g = new THREE.ConeGeometry(radius, 1, radius > 0.08 ? 5 : 3);
  g.translate(0, 0.5, 0);
  const m = new THREE.InstancedMesh(g, lookMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), { sway: 0.05 }), n);
  const R = rng(seed), M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  let k = 0;
  for (let j = 0; j < n * 3 && k < n; j++) {
    const pos = at(R);
    if (!pos) continue;
    q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.5, R() * 6, (R() - 0.5) * 0.5));
    const hh = h * (0.6 + R() * 0.8);
    m.setMatrixAt(k, M.compose(p.set(...pos), q, s.set(1 + R(), hh, 1 + R())));
    m.setColorAt(k, c.set(color).multiplyScalar(0.8 + R() * 0.35));
    k++;
  }
  m.count = k;
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ 1. la lluvia entra al suelo

const PX = 5, PZ = 4, PD = 1.6; // media longitud, medio ancho y profundidad de la parcela [m]
const TILT = 0.04; // pendiente suave de la parcela hacia +x
const topY = (x: number) => -TILT * x;

export interface InfState {
  texture: Texture;
  r: GAResult;
  i: number;
  dTheta: number;
}

/** Parcela de 10 × 8 m con su corte: el suelo, el frente de humedecimiento que baja, los charcos y la escorrentía. */
export class InfiltrationWorld {
  private stage: QStage;
  private body = new THREE.Group();
  private wet: THREE.Mesh;
  private wetTop: THREE.Mesh;
  private frontLine: THREE.Mesh;
  private pond: THREE.Mesh;
  private ditch: THREE.Mesh;
  private flow: THREE.InstancedMesh;
  private drops: THREE.InstancedMesh;
  private rain: RainStreaks;
  private ring: THREE.Mesh;
  private st: InfState | null = null;
  private k = 0;
  private flowSeed: { x: number; z: number; v: number }[] = [];
  private dropSeed: { x: number; y: number; v: number }[] = [];
  readonly views: Record<'general' | 'corte' | 'superficie', StageView> = {
    general: { eye: [9, 5.5, 11], target: [0, -0.5, 0.5], fit: 12, portrait: { eye: [11, 9, 18], target: [0, -0.5, 0] } },
    corte: { eye: [1.5, -0.2, 9.5], target: [0.5, -0.7, PZ], fit: 7 },
    superficie: { eye: [-2, 4.5, 6], target: [0.5, 0, 0], fit: 9 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(14);
    stage.controls.minDistance = 1.5;
    sc.add(this.body);
    sc.add(studioFloor(0, 0, 9, -PD - 0.05));
    // frente de humedecimiento en el corte (z = PZ): una capa oscura y una línea clara en el borde
    this.wet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#3b2f28', transparent: true, opacity: 0.5, roughness: 0.6, depthWrite: false }));
    (this.wet.material as THREE.Material).userData.noLook = true;
    this.wetTop = new THREE.Mesh(new THREE.PlaneGeometry(2 * PX, 2 * PZ), new THREE.MeshStandardMaterial({ color: '#2c241e', transparent: true, opacity: 0, roughness: 0.4, depthWrite: false }));
    this.wetTop.rotation.x = -Math.PI / 2;
    this.wetTop.rotation.y = Math.atan(TILT);
    this.frontLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.025), new THREE.MeshBasicMaterial({ color: '#7fd0ff' }));
    // charcos sobre la superficie: una lámina de agua con manchas que crecen con el encharcamiento
    this.pond = new THREE.Mesh(new THREE.PlaneGeometry(2 * PX - 0.2, 2 * PZ - 0.2, 60, 48), lookWater(new THREE.MeshStandardMaterial({ color: '#4d87a8', transparent: true, opacity: 0.0, roughness: 0.06, depthWrite: false, vertexColors: false }), [0.25, 0.02], 0.5));
    this.pond.rotation.x = -Math.PI / 2;
    this.pond.rotation.y = Math.atan(TILT);
    this.pond.position.y = 0.012;
    // cuneta al pie de la parcela donde llega la escorrentía
    this.ditch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 2 * PZ), lookWater(new THREE.MeshStandardMaterial({ color: '#4d87a8', transparent: true, opacity: 0.85, roughness: 0.06 }), [0, 0.4], 0.6));
    // vetas de escorrentía que bajan por la superficie
    const fg = new THREE.PlaneGeometry(0.5, 0.04);
    fg.rotateX(-Math.PI / 2);
    this.flow = new THREE.InstancedMesh(fg, new THREE.MeshBasicMaterial({ color: '#d9eef9', transparent: true, opacity: 0.7, depthWrite: false }), 160);
    this.flow.frustumCulled = false;
    const RF = rng(7);
    for (let k = 0; k < 160; k++) this.flowSeed.push({ x: -PX + RF() * 2 * PX, z: -PZ + 0.3 + RF() * (2 * PZ - 0.6), v: 0.5 + RF() * 0.6 });
    // gotas que bajan dentro del suelo, junto al corte
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshBasicMaterial({ color: '#8fd3ff' }), 140);
    this.drops.frustumCulled = false;
    const RD = rng(9);
    for (let k = 0; k < 140; k++) this.dropSeed.push({ x: -PX + 0.2 + RD() * (2 * PX - 0.4), y: RD(), v: 0.6 + RD() * 0.8 });
    // infiltrómetro de doble anillo sobre la parcela
    const metal = new THREE.MeshStandardMaterial({ color: '#9aa3ab', roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide });
    metal.userData.noLook = true;
    const ringG = new THREE.Group();
    for (const r of [0.3, 0.6]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 32, 1, true), metal);
      c.position.y = 0.1;
      c.castShadow = true;
      ringG.add(c);
    }
    this.ring = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), lookWater(new THREE.MeshStandardMaterial({ color: '#4d87a8', transparent: true, opacity: 0.8, roughness: 0.05 }), [0.02, 0.01], 0.3));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.18;
    ringG.add(this.ring);
    ringG.position.set(-2.4, topY(-2.4), -1.4);
    // lluvia
    this.rain = new RainStreaks({ x0: -PX - 1, x1: PX + 1, z0: -PZ - 1, z1: PZ + 1, top: 9 }, (x) => topY(x), 1800, 9, 0.5, [0.06, 0.02], 0.12);
    sc.add(this.wet, this.wetTop, this.frontLine, this.pond, this.ditch, this.flow, this.drops, ringG, this.rain.group);
    // alrededor: pradera baja con árboles, para dar escala
    const ts: TreeSpot[] = [];
    const RT = rng(5);
    for (let k = 0; k < 9; k++) {
      const a = RT() * Math.PI * 2, d = 10 + RT() * 6;
      ts.push({ x: Math.cos(a) * d, y: -PD, z: Math.sin(a) * d - 3, r: 1.2 + RT() * 0.8 });
    }
    sc.add(trees(ts.filter((t) => t.z < -5), 3));
    stage.view(this.views.general, false);
  }

  private built = '';
  private build(tx: Texture): void {
    clear(this.body);
    const t = TEXTURES[tx];
    // suelo: bloque con color por profundidad (capa orgánica más oscura arriba)
    const g = new THREE.BoxGeometry(2 * PX, PD, 2 * PZ, 40, 16, 32);
    const P = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(P.count * 3);
    const base = new THREE.Color(t.color), dark = new THREE.Color(t.color).multiplyScalar(0.55), c = new THREE.Color();
    for (let k = 0; k < P.count; k++) {
      const x = P.getX(k), y = P.getY(k) + PD / 2 - PD; // de 0 (arriba) a −PD
      const yTop = topY(x);
      const yy = y > -0.001 ? yTop : y;
      P.setY(k, yy);
      const depth = yTop - yy;
      c.copy(dark).lerp(base, THREE.MathUtils.smoothstep(depth, 0.05, 0.35));
      col.set([c.r, c.g, c.b], 3 * k);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const soil = new THREE.Mesh(g, lookMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { detail: 0.22, scale: 3 }));
    soil.receiveShadow = true;
    soil.castShadow = true;
    this.body.add(soil);
    // pasto en la superficie
    this.body.add(grass(1400, (R) => {
      const x = -PX + 0.1 + R() * (2 * PX - 0.2), z = -PZ + 0.1 + R() * (2 * PZ - 0.2);
      if (Math.hypot(x + 2.4, z + 1.4) < 0.75) return null;
      return [x, topY(x), z];
    }, 3, 0.16));
    this.built = tx;
  }

  set(s: InfState): void {
    if (this.built !== s.texture) this.build(s.texture);
    this.st = s;
    this.k = s.r.t.length - 1;
    this.at(this.k);
  }

  /** Muestra el instante k de la serie (para reproducir la lluvia). */
  at(k: number): void {
    const s = this.st;
    if (!s) return;
    this.k = Math.max(0, Math.min(s.r.t.length - 1, k));
    const r = s.r;
    const F = r.F[this.k];
    const front = Math.min(PD - 0.02, F / Math.max(1e-6, s.dTheta) / 1000); // m
    // capa húmeda en el corte (z = PZ): de la superficie al frente, siguiendo la pendiente de la superficie
    const wg = new THREE.BufferGeometry();
    const nx = 20, pos: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nx; j++) {
      const x = -PX + (2 * PX * j) / nx;
      pos.push(x, topY(x), PZ + 0.006, x, topY(x) - front, PZ + 0.006);
      if (j < nx) idx.push(2 * j, 2 * j + 1, 2 * j + 2, 2 * j + 2, 2 * j + 1, 2 * j + 3);
    }
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wg.setIndex(idx);
    this.wet.geometry.dispose();
    this.wet.geometry = wg;
    this.wet.visible = front > 0.003;
    this.frontLine.visible = this.wet.visible;
    this.frontLine.scale.x = 2 * PX;
    this.frontLine.position.set(0, -front, PZ + 0.008);
    this.frontLine.rotation.z = -Math.atan(TILT);
    // superficie mojada y charcos
    const wetK = Math.min(1, F / 6);
    (this.wetTop.material as THREE.MeshStandardMaterial).opacity = 0.35 * wetK;
    const ponded = r.tp !== null && r.t[this.k] >= r.tp && r.f[this.k] < s.i - 1e-9;
    const excess = ponded ? 1 - r.f[this.k] / s.i : 0;
    (this.pond.material as THREE.MeshStandardMaterial).opacity = Math.min(0.75, 0.2 + excess * 0.8) * (ponded ? 1 : 0);
    this.pond.visible = ponded;
    this.ditch.visible = r.R[this.k] > 0.05;
    this.ditch.scale.y = 1 + Math.min(4, r.R[this.k] / 4);
    this.ditch.position.set(PX + 0.3, topY(PX) - 0.12 + 0.01 * this.ditch.scale.y, 0);
    this.flow.visible = ponded;
    (this.flow.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.5 * excess;
    // infiltrómetro: el agua del anillo baja con la capacidad de infiltración
    this.ring.position.y = 0.06 + 0.12 * Math.min(1, s.i / Math.max(1, r.fcap[this.k]));
    const tMin = r.t[this.k] * 60;
    const labels: StageLabel[] = [
      { id: 'front', text: `Frente a ${es(front * 100, 1)} cm`, sub: `entraron ${es(F, 1)} mm`, at: new THREE.Vector3(-PX * 0.55, topY(-PX * 0.55) - front, PZ + 0.05), kind: 'dato', prio: 5 },
      {
        id: 'sup',
        text: ponded ? 'Charcos: el suelo no da abasto' : 'El suelo recibe toda la lluvia',
        sub: ponded ? `escurren ${es(r.R[this.k], 1)} mm · minuto ${es(tMin, 0)}` : `minuto ${es(tMin, 0)}`,
        at: new THREE.Vector3(1.5, topY(1.5) + 0.3, -1),
        kind: ponded ? 'alerta' : 'ok',
        prio: 6,
      },
      { id: 'anillo', text: 'Infiltrómetro', sub: `capacidad ${es(Math.min(r.fcap[this.k], 999), 0)} mm/h`, at: new THREE.Vector3(-2.4, 0.45, -1.4), kind: 'lugar', prio: 3 },
    ];
    this.stage.setLabels(labels);
  }

  /** Lluvia en curso (0..1 de intensidad relativa); 0 la apaga. */
  raining(k: number): void {
    this.rain.intensity = k;
    this.stage.weather(Math.min(0.7, k * 0.8));
  }

  update(dt: number, t: number): void {
    this.rain.update(dt);
    const s = this.st;
    if (!s) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.atan(TILT)), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    if (this.flow.visible) {
      for (let k = 0; k < this.flowSeed.length; k++) {
        const f = this.flowSeed[k];
        const x = -PX + ((((f.x + PX + t * f.v * 0.8) % (2 * PX)) + 2 * PX) % (2 * PX));
        this.flow.setMatrixAt(k, m.compose(p.set(x, topY(x) + 0.02, f.z), q, sc));
      }
      this.flow.instanceMatrix.needsUpdate = true;
    }
    // gotas que bajan dentro de la capa húmeda (junto al corte), más rápido cuanto más entra
    const F = s.r.F[this.k];
    const front = Math.min(PD - 0.02, F / Math.max(1e-6, s.dTheta) / 1000);
    const rate = s.r.f[this.k] / Math.max(1, s.i);
    this.drops.visible = front > 0.01 && this.rain.intensity > 0;
    if (this.drops.visible) {
      for (let k = 0; k < this.dropSeed.length; k++) {
        const d = this.dropSeed[k];
        const y = (d.y + t * d.v * (0.15 + 0.5 * rate)) % 1;
        this.drops.setMatrixAt(k, m.compose(p.set(d.x, topY(d.x) - y * front, PZ + 0.02), q, sc));
      }
      this.drops.instanceMatrix.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------ 2. la ladera y el agua

const SL = 40; // largo de la ladera inclinada [m]
const SW = 26; // ancho [m]

export interface SlopeState {
  beta: number;
  z: number;
  m: number;
  FS: number;
  veg: 'desnudo' | 'pasto' | 'bosque';
  drains: boolean;
  q: number;
}

/**
 * Ladera de 40 m inclinada a β con una capa de suelo de espesor z sobre la roca; el corte del frente muestra el
 * nivel del agua; si el factor de seguridad baja de 1, la capa se desliza hacia las casas del pie.
 */
export class SlopeWorld {
  private stage: QStage;
  private body = new THREE.Group();
  private slab = new THREE.Group();
  private water: THREE.Mesh;
  private rain: RainStreaks;
  private st: SlopeState | null = null;
  private slide = 0;
  private sliding = false;
  private dir = new THREE.Vector3();
  private debris: THREE.InstancedMesh;
  private debrisSeed: { a: number; b: number; c: number }[] = [];
  private spouts: THREE.Group = new THREE.Group();
  readonly views: Record<'general' | 'corte' | 'pie', StageView> = {
    general: { eye: [44, 34, 58], target: [2, 6, 0], fit: 64, portrait: { eye: [50, 50, 92], target: [2, 6, 0] } },
    corte: { eye: [6, 10, 34], target: [0, 8, SW / 2], fit: 26 },
    pie: { eye: [40, 8, 30], target: [22, 0, 0], fit: 34 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(48);
    sc.add(this.body, this.slab, this.spouts);
    this.water = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#2f86c4', transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    (this.water.material as THREE.Material).userData.noLook = true;
    sc.add(this.water);
    this.debris = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.35, 0), lookMaterial(new THREE.MeshStandardMaterial({ color: '#7a5a3b', roughness: 1, flatShading: true }), { detail: 0.2 }), 90);
    this.debris.frustumCulled = false;
    this.debris.visible = false;
    const RD = rng(13);
    for (let k = 0; k < 90; k++) this.debrisSeed.push({ a: RD(), b: RD(), c: RD() });
    sc.add(this.debris);
    this.rain = new RainStreaks({ x0: -30, x1: 40, z0: -SW / 2 - 4, z1: SW / 2 + 4, top: 45 }, (x) => this.surfaceY(x), 2200, 40, 1.8, [0.08, 0.03], 0.5);
    sc.add(this.rain.group);
    sc.add(studioFloor(5, 0, 40, -8));
    const birds = new Birds(new THREE.Vector3(0, 10, -10), 50, 32, 6, 1.1);
    sc.add(birds.group);
    stage.animate((t) => birds.update(t));
    stage.view(this.views.general, false);
  }

  /** Cota de la superficie en x (la ladera va de x0 a x1; arriba una meseta y abajo el pie plano). */
  private x0 = -18;
  private x1 = 18;
  private h = 20;
  private surfaceY(x: number): number {
    if (x <= this.x0) return this.h;
    if (x >= this.x1) return 0;
    return this.h * (1 - (x - this.x0) / (this.x1 - this.x0));
  }

  private key = '';
  set(s: SlopeState): void {
    this.st = s;
    const key = `${s.beta}|${s.z}|${s.veg}|${s.drains}`;
    if (key !== this.key) {
      this.build(s);
      this.key = key;
    }
    // nivel del agua en el corte: desde la roca hasta m·z (en vertical) a lo largo de la ladera
    const wz = SW / 2 + 0.05;
    const pos: number[] = [], idx: number[] = [];
    const n = 30;
    for (let j = 0; j <= n; j++) {
      const x = this.x0 + ((this.x1 - this.x0) * j) / n;
      const ys = this.surfaceY(x), yr = ys - s.z;
      pos.push(x, yr, wz, x, yr + s.m * s.z, wz);
      if (j < n) idx.push(2 * j, 2 * j + 1, 2 * j + 2, 2 * j + 2, 2 * j + 1, 2 * j + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.water.geometry.dispose();
    this.water.geometry = g;
    this.water.visible = s.m > 0.005;
    // lluvia sostenida
    this.rain.intensity = Math.min(1, s.q / 60);
    this.stage.weather(Math.min(0.6, s.q / 100));
    // deslizamiento
    const fail = s.FS < 1;
    if (fail && !this.sliding) {
      this.sliding = true;
      this.slide = 0;
    }
    if (!fail) {
      this.sliding = false;
      this.slide = 0;
      this.slab.position.set(0, 0, 0);
      this.debris.visible = false;
    }
    for (const sp of this.spouts.children) sp.visible = s.drains && s.m > 0.02;
    this.labels();
  }

  private build(s: SlopeState): void {
    clear(this.body);
    clear(this.slab);
    clear(this.spouts);
    const b = (s.beta * Math.PI) / 180;
    // la ladera inclinada cubre SL m de largo: altura total y extremos
    this.h = SL * Math.sin(b);
    const run = SL * Math.cos(b);
    this.x0 = -run / 2;
    this.x1 = run / 2;
    const top = this.h, dz = s.z;
    // roca: perfil (meseta arriba, ladera, pie) extruido en z
    const prof: [number, number][] = [[this.x0 - 14, -8], [this.x1 + 26, -8], [this.x1 + 26, -dz], [this.x1, -dz], [this.x0, top - dz], [this.x0 - 14, top - dz]];
    const ext = (pts: [number, number][], mat: THREE.Material, w = SW) => {
      const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
      g.translate(0, 0, -w / 2);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    this.body.add(ext(prof, rockMat()));
    // suelo de la meseta y del pie (no se desliza)
    const soilC = s.veg === 'desnudo' ? '#8a6a48' : '#7a5a3b';
    this.body.add(ext([[this.x0 - 14, top - dz], [this.x0, top - dz], [this.x0, top], [this.x0 - 14, top]], soilMat(soilC)));
    this.body.add(ext([[this.x1, -dz], [this.x1 + 26, -dz], [this.x1 + 26, 0], [this.x1, 0]], soilMat(soilC)));
    // capa que se puede deslizar: el suelo de la ladera, sobre el plano de la roca
    const slabMesh = ext([[this.x0, top - dz], [this.x1, -dz], [this.x1, 0], [this.x0, top]], soilMat(soilC, 0.2));
    this.slab.add(slabMesh);
    // superficie: pasto (o tierra) encima de todo, con una capa delgada de color
    const green = s.veg === 'desnudo' ? '#9a7a55' : s.veg === 'pasto' ? '#6aa84f' : '#4d8a3a';
    const skin = (x0: number, x1: number, y0: number, y1: number, into: THREE.Group) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const g = new THREE.PlaneGeometry(len, SW, Math.max(2, Math.round(len)), 8);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, lookMaterial(new THREE.MeshStandardMaterial({ color: green, roughness: 0.95 }), { detail: 0.16, patches: 0.1, clouds: [0.12, 30] }));
      m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.02, 0);
      m.receiveShadow = true;
      into.add(m);
    };
    skin(this.x0 - 14, this.x0, top, top, this.body);
    skin(this.x1, this.x1 + 26, 0, 0, this.body);
    skin(this.x0, this.x1, top, 0, this.slab);
    // vegetación
    const R = rng(21);
    if (s.veg === 'bosque') {
      const ts: TreeSpot[] = [];
      for (let k = 0; k < 70; k++) {
        const x = this.x0 + 1 + R() * (run - 2), z = -SW / 2 + 1 + R() * (SW - 2);
        ts.push({ x, y: this.surfaceY(x), z, r: 1.4 + R() * 1.2 });
      }
      this.slab.add(trees(ts, 8));
      // raíces vistas en el corte: trazos oscuros que entran en el suelo
      const rootM = new THREE.MeshStandardMaterial({ color: '#3d2a1c', roughness: 1 });
      for (let k = 0; k < 26; k++) {
        const x = this.x0 + 1 + R() * (run - 2), d = Math.min(dz * 0.9, 0.8 + R() * 1.6);
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, d, 5), rootM);
        r.position.set(x, this.surfaceY(x) - d / 2, SW / 2 + 0.02);
        r.rotation.z = (R() - 0.5) * 0.8;
        this.slab.add(r);
      }
    } else if (s.veg === 'pasto') {
      this.slab.add(grass(1600, (RR) => {
        const x = this.x0 + RR() * run, z = -SW / 2 + RR() * SW;
        return [x, this.surfaceY(x), z];
      }, 4, 0.35));
    }
    // árboles en la meseta y casas en el pie (un barrio de ladera ilustrativo)
    const ts2: TreeSpot[] = [];
    for (let k = 0; k < 14; k++) ts2.push({ x: this.x0 - 3 - R() * 10, y: top, z: -SW / 2 + 1 + R() * (SW - 2), r: 1.3 + R() });
    this.body.add(trees(ts2, 9));
    const hs: HouseSpot[] = [];
    const walls = ['#c06c48', '#efe0c0', '#f0c9a2', '#bcd6e6', '#f2d27a', '#b4603f'];
    for (let k = 0; k < 9; k++) hs.push({ x: this.x1 + 6 + (k % 3) * 6, y: 0, z: -SW / 2 + 4 + Math.floor(k / 3) * 7.5, w: 4.4, d: 5, h: 3 + R() * 3.5, rot: 0, wall: walls[k % walls.length] });
    this.body.add(houses(hs));
    // drenes horizontales que salen al pie de la capa
    if (s.drains) {
      const pipeM = new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.5 });
      for (let k = 0; k < 4; k++) {
        const xr = this.x0 + run * (0.25 + 0.17 * k);
        const y = this.surfaceY(xr) - dz * 0.75;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, run * 0.4, 8), pipeM);
        p.rotation.z = Math.PI / 2 - b;
        p.position.set(xr, y, SW / 2 + 0.15);
        this.slab.add(p);
      }
      // chorritos en el pie
      const jet = lookWater(new THREE.MeshStandardMaterial({ color: '#4d97c9', transparent: true, opacity: 0.8, roughness: 0.05 }), [0, -1], 0.4);
      for (let k = 0; k < 3; k++) {
        const j = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 1, 8), jet);
        j.position.set(this.x1 + 0.5, -dz * 0.5, -SW / 4 + k * (SW / 4));
        j.visible = false;
        this.spouts.add(j);
      }
    }
    // dirección del deslizamiento: hacia abajo por la ladera
    this.dir.set(Math.cos(b), -Math.sin(b), 0);
  }

  private labels(): void {
    const s = this.st;
    if (!s) return;
    const xm = (this.x0 + this.x1) / 2;
    const L: StageLabel[] = [
      {
        id: 'fs',
        text: s.FS < 1 ? `Se desliza: factor ${es(s.FS, 2)}` : `Factor de seguridad ${es(s.FS, 2)}`,
        sub: s.FS < 1 ? 'el empuje supera la resistencia' : s.FS < 1.5 ? 'aguanta, con poco margen' : 'aguanta con margen',
        at: new THREE.Vector3(xm, this.surfaceY(xm) + 3, 0),
        kind: s.FS < 1 ? 'alerta' : s.FS < 1.5 ? 'dato' : 'ok',
        prio: 8,
      },
      { id: 'agua', text: `Agua: ${es(s.m * 100, 0)} % del suelo`, sub: s.drains ? 'los drenes bajan el nivel' : `capa de ${es(s.z, 1)} m sobre la roca`, at: new THREE.Vector3(this.x0 + (this.x1 - this.x0) * 0.3, this.surfaceY(this.x0 + (this.x1 - this.x0) * 0.3) - s.z * 0.6, SW / 2), kind: 'dato', prio: 5 },
      { id: 'casas', text: 'Casas al pie', at: new THREE.Vector3(this.x1 + 12, 6.5, 0), kind: 'lugar', prio: 2 },
    ];
    this.stage.setLabels(L);
  }

  update(dt: number, t: number): void {
    this.rain.update(dt);
    const s = this.st;
    if (!s) return;
    if (this.sliding) {
      this.slide = Math.min(1, this.slide + dt / 3.2);
      const e = this.slide < 1 ? 1 - Math.pow(1 - this.slide, 2.2) : 1;
      const dist = e * (this.x1 - this.x0) * 0.45;
      this.slab.position.copy(this.dir).multiplyScalar(dist);
      this.slab.position.y = Math.max(this.slab.position.y, -this.surfaceY(this.x1));
      // escombros que ruedan delante de la masa
      this.debris.visible = true;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
      for (let k = 0; k < this.debrisSeed.length; k++) {
        const d = this.debrisSeed[k];
        const x = this.x1 - 2 + d.a * (4 + dist * 0.8);
        q.setFromEuler(new THREE.Euler(t * (2 + d.b * 3), d.c * 6, t * 1.5));
        const r = 0.5 + d.c * 1.2;
        m.compose(p.set(x, r * 0.35 + Math.abs(Math.sin(t * 3 + d.a * 9)) * 0.3 * (1 - e), -SW / 2 + 1 + d.b * (SW - 2)), q, sc.set(r, r * 0.8, r));
        this.debris.setMatrixAt(k, m);
      }
      this.debris.instanceMatrix.needsUpdate = true;
    }
    // chorritos de los drenes que tiemblan
    for (const sp of this.spouts.children) sp.scale.x = 1 + Math.sin(t * 20 + sp.position.z) * 0.1;
  }
}

// ------------------------------------------------------------------ 3. la ladera pierde suelo

const EW = 40; // ancho de la ladera [m]

export interface ErosionState {
  slopePct: number;
  lambda: number;
  cover: Cover;
  practice: Practice;
  A: number;
  ok: boolean;
}

/** Ladera de cultivo a escala con su cobertura y prácticas; abajo una quebrada que se enturbia con lo que se lleva la lluvia. */
export class ErosionWorld {
  private stage: QStage;
  private body = new THREE.Group();
  private creek: THREE.Mesh;
  private creekMat: THREE.MeshStandardMaterial;
  private fan: THREE.Mesh;
  private mud: THREE.InstancedMesh;
  private mudSeed: { x: number; z: number; v: number }[] = [];
  private rain: RainStreaks;
  private st: ErosionState | null = null;
  private hgt = 20;
  readonly views: Record<'general' | 'surcos' | 'quebrada', StageView> = {
    general: { eye: [70, 48, 72], target: [0, 6, 0], fit: 90, portrait: { eye: [80, 70, 120], target: [0, 6, 0] } },
    surcos: { eye: [14, 18, 22], target: [-6, 10, 0], fit: 26 },
    quebrada: { eye: [62, 12, 26], target: [40, 0, 0], fit: 34 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(80);
    sc.add(this.body);
    this.creekMat = lookWater(new THREE.MeshStandardMaterial({ color: '#3f86b5', transparent: true, opacity: 0.88, roughness: 0.06 }), [0, 0.8], 0.6);
    this.creek = new THREE.Mesh(new THREE.PlaneGeometry(9, EW + 30, 8, 40), this.creekMat);
    this.creek.rotation.x = -Math.PI / 2;
    sc.add(this.creek);
    this.fan = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), lookMaterial(new THREE.MeshStandardMaterial({ color: '#9a7650', roughness: 1 }), { detail: 0.2 }));
    this.fan.receiveShadow = true;
    sc.add(this.fan);
    const mg = new THREE.PlaneGeometry(1.2, 0.12);
    mg.rotateX(-Math.PI / 2);
    this.mud = new THREE.InstancedMesh(mg, new THREE.MeshBasicMaterial({ color: '#8a6440', transparent: true, opacity: 0.7, depthWrite: false }), 260);
    this.mud.frustumCulled = false;
    const R = rng(17);
    for (let k = 0; k < 260; k++) this.mudSeed.push({ x: R(), z: -EW / 2 + 1 + R() * (EW - 2), v: 0.6 + R() * 0.8 });
    sc.add(this.mud);
    this.rain = new RainStreaks({ x0: -60, x1: 50, z0: -EW / 2 - 6, z1: EW / 2 + 6, top: 70 }, (x) => this.surfaceY(x), 2400, 40, 2, [0.06, 0.02], 0.6);
    sc.add(this.rain.group);
    sc.add(studioFloor(0, 0, 70, -6));
    const birds = new Birds(new THREE.Vector3(-10, 10, 0), 60, 40, 6, 1.4);
    sc.add(birds.group);
    stage.animate((t) => birds.update(t));
    stage.view(this.views.general, false);
  }

  private x0 = -30;
  private x1 = 30;
  private surfaceY(x: number): number {
    if (x <= this.x0) return this.hgt;
    if (x >= this.x1) return 0;
    return this.hgt * (1 - (x - this.x0) / (this.x1 - this.x0));
  }

  private key = '';
  set(s: ErosionState): void {
    this.st = s;
    const key = `${s.slopePct}|${s.lambda}|${s.cover}|${s.practice}`;
    if (key !== this.key) {
      this.build(s);
      this.key = key;
    }
    // la quebrada se enturbia con la pérdida de suelo y el abanico de sedimento crece
    const k = Math.min(1, Math.log10(1 + s.A) / 3);
    this.creekMat.color.set('#3f86b5').lerp(new THREE.Color('#8a6a45'), k);
    const r = 1.5 + 9 * k;
    this.fan.scale.set(r, 0.12 + 0.45 * k, r * 1.3);
    this.fan.position.set(this.x1 + 2, -0.1, 0);
    this.labels();
  }

  private build(s: ErosionState): void {
    clear(this.body);
    const th = Math.atan(s.slopePct / 100);
    this.hgt = s.lambda * Math.sin(th);
    const run = s.lambda * Math.cos(th);
    this.x0 = -run / 2;
    this.x1 = run / 2;
    const terr = s.practice === 'terrazas';
    // superficie de la ladera (con escalones si hay terrazas)
    const nx = Math.max(20, Math.round(run * 1.5)), nz = 40;
    const g = new THREE.PlaneGeometry(run + 40, EW, nx + 20, nz);
    g.rotateX(-Math.PI / 2);
    g.translate((this.x0 - 14 + this.x1 + 26) / 2 - 0, 0, 0);
    const P = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(P.count * 3);
    const cov = s.cover;
    const base = new THREE.Color(cov === 'desnudo' ? '#9a7550' : cov === 'cultivo' ? '#8f7a52' : cov === 'cafe' ? '#5f8a3e' : cov === 'pasto' ? '#6aa84f' : cov === 'rastrojo' ? '#6f8f45' : '#4d8a3a');
    const earth = new THREE.Color('#7d5c3c'), c = new THREE.Color();
    const step = Math.max(3, s.lambda / 8);
    for (let k = 0; k < P.count; k++) {
      const x = P.getX(k), z = P.getZ(k);
      let y = this.surfaceY(x);
      if (terr && x > this.x0 && x < this.x1) {
        // terrazas: escalones planos con un talud corto
        const u = (x - this.x0) / step, f = u - Math.floor(u);
        const yStep = this.surfaceY(this.x0 + Math.floor(u) * step);
        y = yStep - (f > 0.8 ? ((f - 0.8) / 0.2) * (step * (this.hgt / run)) : 0);
      }
      P.setY(k, y);
      c.copy(base);
      const onSlope = x > this.x0 && x < this.x1;
      if (onSlope && (cov === 'desnudo' || cov === 'cultivo')) {
        // surcos de erosión que bajan por la pendiente (más marcados con más pérdida)
        const rill = Math.pow(Math.abs(Math.sin(z * 2.2 + Math.sin(x * 0.3) * 1.5)), 8);
        c.lerp(earth, rill * Math.min(0.8, s.A / 800));
      }
      if (onSlope && s.practice === 'curvas') {
        const row = Math.abs(Math.sin((x * Math.PI) / 1.2));
        c.multiplyScalar(0.85 + 0.15 * row);
      }
      col.set([c.r, c.g, c.b], 3 * k);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const surf = new THREE.Mesh(g, lookMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }), { detail: 0.16, patches: 0.08, clouds: [0.12, 40] }));
    surf.receiveShadow = true;
    surf.castShadow = true;
    this.body.add(surf);
    // cuerpo de la maqueta: paredes con capas de suelo a los lados
    const sideP = (zz: number) => {
      const pts: [number, number][] = [];
      for (let k = 0; k <= 60; k++) {
        const x = this.x0 - 14 + ((run + 40) * k) / 60;
        pts.push([x, zz]);
      }
      return pts;
    };
    const wall = (pts: [number, number][]) => {
      const pos: number[] = [], cc: number[] = [], idx: number[] = [];
      const colr = new THREE.Color();
      pts.forEach(([x, z], k) => {
        const y = this.surfaceY(x);
        for (let r = 0; r <= 6; r++) {
          const yy = y - (y + 6) * Math.pow(r / 6, 1.5);
          pos.push(x, yy, z);
          colr.set(r === 0 ? '#5d4630' : r < 3 ? '#8a6747' : '#9a8f80');
          cc.push(colr.r, colr.g, colr.b);
        }
        if (k < pts.length - 1) {
          const a = 7 * k, b = 7 * (k + 1);
          for (let r = 0; r < 6; r++) idx.push(a + r, a + r + 1, b + r, b + r, a + r + 1, b + r + 1);
        }
      });
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      wg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      wg.setIndex(idx);
      wg.computeVertexNormals();
      return new THREE.Mesh(wg, lookMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), { detail: 0.2, scale: 1.5 }));
    };
    this.body.add(wall(sideP(EW / 2)), wall(sideP(-EW / 2)));
    // vegetación según la cobertura
    const R = rng(31);
    const onS = (RR: () => number): [number, number, number] => {
      const x = this.x0 + RR() * run, z = -EW / 2 + 0.5 + RR() * (EW - 1);
      return [x, this.surfaceY(x), z];
    };
    if (cov === 'bosque' || cov === 'cafe') {
      const ts: TreeSpot[] = [];
      const n = cov === 'bosque' ? Math.round(run * EW * 0.09) : Math.round(run * EW * 0.015);
      for (let k = 0; k < n; k++) {
        const [x, y, z] = onS(R);
        ts.push({ x, y, z, r: cov === 'bosque' ? 1.6 + R() * 1.6 : 2.2 + R() });
      }
      this.body.add(trees(ts, 6));
    }
    if (cov === 'cafe' || cov === 'rastrojo') {
      // matas de café o rastrojo: arbustos bajos
      const n = Math.round(run * EW * (cov === 'cafe' ? 0.35 : 0.2));
      const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1), lookMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), { sway: 0.03 }), n);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3(), cc = new THREE.Color();
      for (let k = 0; k < n; k++) {
        const [x, y, z] = cov === 'cafe' ? [this.x0 + ((k % Math.max(1, Math.round(run))) + 0.5) * (run / Math.max(1, Math.round(run))), 0, -EW / 2 + 1 + (Math.floor(k / Math.max(1, Math.round(run))) * 1.6) % (EW - 2)] : onS(R);
        const yy = this.surfaceY(x);
        bush.setMatrixAt(k, M.compose(p.set(x, (cov === 'cafe' ? yy : y) + 0.4, z), q, sv.setScalar(0.7 + R() * 0.6)));
        bush.setColorAt(k, cc.set(cov === 'cafe' ? '#2f6a33' : '#6f8f45').multiplyScalar(0.85 + R() * 0.3));
      }
      bush.castShadow = true;
      this.body.add(bush);
    }
    if (cov === 'cultivo') {
      // maíz en surcos (a lo largo de la pendiente sin prácticas; en curvas de nivel con prácticas)
      const along = s.practice === 'ninguna';
      const plants: [number, number, number][] = [];
      for (let a = 0; a < (along ? EW : run); a += 1) for (let b = 0; b < (along ? run : EW); b += 0.7) {
        const x = along ? this.x0 + b : this.x0 + a;
        const z = along ? -EW / 2 + a + 0.5 : -EW / 2 + b + 0.3;
        if (z > EW / 2 - 0.3 || x > this.x1) continue;
        plants.push([x, this.surfaceY(x), z]);
      }
      this.body.add(grass(Math.min(6000, plants.length), (RR) => plants[Math.floor(RR() * plants.length)], 5, 1.5, '#7aa64a', 0.22));
    }
    if (cov === 'pasto') this.body.add(grass(3500, onS, 7, 0.3));
    if (s.practice === 'barreras') {
      // barreras vivas: hileras de arbustos a lo largo de las curvas de nivel
      const rows = Math.max(2, Math.round(s.lambda / 8));
      const n = rows * Math.round(EW / 0.8);
      const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), lookMaterial(new THREE.MeshStandardMaterial({ color: '#3d7a35', roughness: 0.9 }), { sway: 0.03 }), n);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3();
      let k = 0;
      for (let r = 1; r <= rows; r++) {
        const x = this.x0 + (run * r) / (rows + 1);
        for (let z = -EW / 2 + 0.5; z < EW / 2 && k < n; z += 0.8) bush.setMatrixAt(k++, M.compose(p.set(x + (R() - 0.5) * 0.3, this.surfaceY(x) + 0.35, z), q, sv.setScalar(0.8 + R() * 0.4)));
      }
      bush.count = k;
      bush.castShadow = true;
      this.body.add(bush);
    }
    // quebrada al pie
    this.creek.position.set(this.x1 + 18, 0.05, 0);
  }

  private labels(): void {
    const s = this.st;
    if (!s) return;
    const xm = (this.x0 + this.x1) / 2;
    const mm = (s.A / 13000) * 1000;
    this.stage.setLabels([
      { id: 'A', text: `Pierde ${es(s.A, s.A < 10 ? 1 : 0)} t/(ha·año)`, sub: `${es(mm, 2)} mm de suelo por año · ${COVERS[s.cover].name.toLowerCase()}`, at: new THREE.Vector3(xm, this.surfaceY(xm) + 4, 0), kind: s.ok ? 'ok' : 'alerta', prio: 8 },
      { id: 'q', text: s.A > 100 ? 'Quebrada con lodo' : s.A > 11 ? 'Quebrada algo turbia' : 'Quebrada limpia', at: new THREE.Vector3(this.x1 + 18, 1.5, EW / 2 - 4), kind: 'lugar', prio: 4 },
    ]);
  }

  raining(k: number): void {
    this.rain.intensity = k;
    this.stage.weather(Math.min(0.65, k * 0.75));
  }

  update(dt: number, t: number): void {
    this.rain.update(dt);
    const s = this.st;
    // lodo que baja por la ladera mientras llueve, más cuanto más suelo se pierde
    const on = !!s && this.rain.intensity > 0 && s.A > 0.5;
    this.mud.visible = on;
    if (!on || !s) return;
    const count = Math.round(this.mudSeed.length * Math.min(1, Math.log10(1 + s.A) / 3));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const th = Math.atan(s.slopePct / 100);
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -th);
    for (let k = 0; k < this.mudSeed.length; k++) {
      const d = this.mudSeed[k];
      if (k >= count) {
        this.mud.setMatrixAt(k, m.makeScale(0, 0, 0));
        continue;
      }
      const u = (d.x + t * d.v * 0.12) % 1;
      const x = this.x0 + u * (this.x1 - this.x0);
      this.mud.setMatrixAt(k, m.compose(p.set(x, this.surfaceY(x) + 0.08, d.z), q, sc));
    }
    this.mud.instanceMatrix.needsUpdate = true;
  }
}

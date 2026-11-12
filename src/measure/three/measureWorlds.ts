// Mundos 3D de la sala «Medir el agua»: la estación meteorológica con el pluviómetro de balancín abierto (el cubo
// se vuelca con cada 0,2 mm), el anemómetro y un radar que barre el aguacero y pinta su reflectividad; la estación
// de aforo en un río, con la regla, la tarabita y el molinete que baja por cada vertical sobre el corte de
// velocidades; y el banco de tuberías con un Venturi y una placa de orificio de acrílico, sus piezómetros y las
// partículas que se aceleran en la garganta. Todo a escala.

import * as THREE from 'three';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { concreteMaterial, rng } from '../../quality/three/kit';
import { lookMaterial, lookWater } from '../../three/look';
import { Birds, RainStreaks, meadow, terrainBlock, trees, type TreeSpot } from '../../three/scenery';
import { FlowPipe, GateValve, flange, glass, paint, roundedPath, steel } from '../../three/machines';
import { es } from '../../canals/common';
import { BANK, bedZ, pointVelocity, trueFlow, waterEdges, type Vertical } from '../measure';
import { DBZ_COLORS } from '../scene';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function clear(g: THREE.Group): void {
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
const own = <M extends THREE.Material>(m: M): M => {
  m.userData.own = true;
  return m;
};
const waterMat = (color = '#3f86b0', opacity = 0.86, flow: [number, number] = [0.2, 0.05], strength = 0.6) =>
  own(lookWater(new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.06, metalness: 0.05, depthWrite: false }), flow, strength));

/** Textura de texto para carteles y pantallas. */
function screen(w: number, h: number): { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; cv: HTMLCanvasElement } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, ctx, cv };
}

// ================================================================== 1. medir la lluvia

export interface RainState {
  /** Intensidad real de ahora [mm/h] y la que registra el balancín. */
  I: number;
  Im: number;
  u: number;
  dbz: number;
  Rr: number;
  /** Vuelcos contados y lluvia registrada [mm] (en la reproducción) . */
  tips: number;
  P: number;
  Pm: number;
  algo: string;
  /** Sin reproducción: el registrador cuenta solo, en cámara rápida (×6). */
  live: boolean;
}

const RADAR = V3(62, 0, -58);

/**
 * Estación meteorológica en una pradera: el pluviómetro de balancín con su camisa de vidrio, el anemómetro y la
 * veleta, el registrador con su pantalla, y a lo lejos un radar en una loma cuyo barrido pinta la reflectividad.
 */
export class RainWorld {
  private stage: QStage;
  private rain: RainStreaks;
  private seesaw: THREE.Group;
  private tipTarget = 0;
  private tipAngle = 0;
  private lastTips = 0;
  private cups: THREE.Group;
  private vane: THREE.Group;
  private sweep: THREE.Mesh;
  private map: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; cv: HTMLCanvasElement };
  private mapMesh: THREE.Mesh;
  private logger: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D };
  private cloud = new THREE.Group();
  private drips: THREE.Mesh;
  private st: RainState | null = null;
  private ang = 0;
  private liveMm = 0;
  private liveTips = 0;
  private height: (x: number, z: number) => number;
  readonly views: Record<'estacion' | 'pluviometro' | 'radar', StageView> = {
    estacion: { eye: [7, 4.2, 9], target: [0, 1, 0], fit: 9, portrait: { eye: [9, 6, 14], target: [0, 1, 0] } },
    pluviometro: { eye: [0.42, 1.12, 0.5], target: [0, 0.86, 0], fit: 0.55 },
    radar: { eye: [-55, 75, 95], target: [22, 6, -28], fit: 170 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(14);
    stage.controls.minDistance = 0.4;
    const m = meadow({ keep: [-12, 12, -12, 12], extent: [-160, 160, -160, 160], y0: 0, hills: 14, ramp: 30, seed: 6 });
    this.height = m.height;
    sc.add(m.mesh);
    // cerca de la estación y grava
    const gravel = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40), lookMaterial(new THREE.MeshStandardMaterial({ color: '#9d9b95', roughness: 1 }), { detail: 0.3, scale: 6 }));
    gravel.rotation.x = -Math.PI / 2;
    gravel.position.y = 0.02;
    gravel.receiveShadow = true;
    sc.add(gravel);
    const postM = paint('#e9e6df', 0.7, 0.05);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), postM, 36);
    const M = new THREE.Matrix4();
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      posts.setMatrixAt(k, M.makeTranslation(Math.cos(a) * 4.4, 0.55, Math.sin(a) * 4.4));
    }
    posts.castShadow = true;
    sc.add(posts);
    for (const y of [0.45, 0.95]) {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.02, 6, 72), postM);
      rail.rotation.x = Math.PI / 2;
      rail.position.y = y;
      sc.add(rail);
    }
    // pluviómetro de balancín: poste, cuerpo con camisa de vidrio, embudo y el balancín adentro
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.62, 12), steel('#9aa3ab', 0.4));
    post.position.y = 0.31;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 32), paint('#d9dde0', 0.5, 0.3));
    base.position.y = 0.63;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.36, 40, 1, true), glass(0.14));
    sleeve.position.y = 0.82;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.0798, 0.004, 8, 40), steel('#dfe4e8', 0.2));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.0;
    const funnel = new THREE.Mesh(new THREE.ConeGeometry(0.078, 0.07, 32, 1, true), steel('#cdd3d8', 0.25));
    (funnel.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    funnel.rotation.x = Math.PI;
    funnel.position.y = 0.955;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 8), steel('#cdd3d8', 0.25));
    spout.position.y = 0.895;
    // balancín: dos cubos triangulares sobre un eje
    this.seesaw = new THREE.Group();
    const bucketMat = paint('#c0392b', 0.45, 0.2);
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(s * 0.05, 0);
      shape.lineTo(0, 0.035);
      shape.closePath();
      const b = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false }), bucketMat);
      b.position.z = -0.02;
      this.seesaw.add(b);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 8), steel());
    axle.rotation.x = Math.PI / 2;
    this.seesaw.add(axle);
    this.seesaw.position.y = 0.76;
    // gota que cae del embudo al cubo
    this.drips = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), new THREE.MeshStandardMaterial({ color: '#8fd3ff', roughness: 0.1 }));
    g.add(post, base, sleeve, rim, funnel, spout, this.seesaw, this.drips);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    sc.add(g);
    // registrador con pantalla
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.18), paint('#e4e7ea', 0.55, 0.2));
    box.position.set(1.4, 1.05, -0.4);
    box.castShadow = true;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 10), steel('#9aa3ab', 0.4));
    stand.position.set(1.4, 0.4, -0.4);
    this.logger = screen(256, 160);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.2), new THREE.MeshBasicMaterial({ map: this.logger.tex, toneMapped: false }));
    scr.position.set(1.4, 1.1, -0.309);
    sc.add(box, stand, scr);
    // anemómetro de cazoletas y veleta en un mástil de 3 m
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 3, 12), steel('#a3abb2', 0.35));
    mast.position.set(-1.6, 1.5, -1.2);
    mast.castShadow = true;
    sc.add(mast);
    this.cups = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 6), steel());
      arm.rotation.z = Math.PI / 2;
      arm.position.x = 0.09;
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint('#d9dde0', 0.4, 0.3));
      cup.rotation.z = Math.PI / 2;
      cup.position.x = 0.18;
      const hold = new THREE.Group();
      hold.add(arm, cup);
      hold.rotation.y = (k / 3) * Math.PI * 2;
      this.cups.add(hold);
    }
    this.cups.position.set(-1.6, 3.08, -1.2);
    this.vane = new THREE.Group();
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.01), paint('#c0392b', 0.5, 0.2));
    tail.position.x = -0.18;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 10), paint('#2b2f33', 0.5, 0.3));
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.1;
    this.vane.add(tail, nose);
    this.vane.position.set(-1.6, 2.86, -1.2);
    sc.add(this.cups, this.vane);
    // el radar en su loma: torre de celosía y domo con la antena que gira
    const ry = this.height(RADAR.x, RADAR.z);
    const tower = new THREE.Group();
    const legM = paint('#d0d4d7', 0.5, 0.3);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as [number, number][]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 22, 8), legM);
      leg.position.set(dx * 0.75, 11, dz * 0.75);
      leg.rotation.set(dz * 0.03, 0, -dx * 0.03);
      tower.add(leg);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.5, 5.5), legM);
    deck.position.y = 22;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 32, 24), lookMaterial(new THREE.MeshStandardMaterial({ color: '#f4f4f1', roughness: 0.55 }), { detail: 0.05 }));
    dome.position.y = 25.2;
    const hut = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), concreteMaterial('#d7d3c9'));
    hut.position.set(4.5, 1.5, 3);
    tower.add(deck, dome, hut);
    tower.position.set(RADAR.x, ry, RADAR.z);
    tower.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    sc.add(tower);
    // haz del radar: una cuña translúcida que barre
    const wedge = new THREE.CircleGeometry(150, 24, -0.04, 0.08);
    wedge.rotateX(-Math.PI / 2);
    this.sweep = new THREE.Mesh(wedge, new THREE.MeshBasicMaterial({ color: '#9fe3ff', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    this.sweep.position.set(RADAR.x, ry + 25, RADAR.z);
    sc.add(this.sweep);
    // mapa de reflectividad sobre el terreno (lo pinta el barrido)
    this.map = screen(256, 256);
    const mg = new THREE.PlaneGeometry(220, 220, 64, 64);
    mg.rotateX(-Math.PI / 2);
    const mp = mg.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < mp.count; k++) mp.setY(k, this.height(mp.getX(k) + 10, mp.getZ(k) - 10) + 0.25);
    this.mapMesh = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ map: this.map.tex, transparent: true, opacity: 0.55, depthWrite: false }));
    this.mapMesh.position.set(10, 0, -10);
    sc.add(this.mapMesh);
    // la nube del aguacero sobre la estación
    const cm = new THREE.MeshStandardMaterial({ color: '#8d96a0', roughness: 1, transparent: true, opacity: 0.9 });
    cm.userData.noLook = true;
    const RC = rng(8);
    for (let k = 0; k < 26; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(6 + RC() * 8, 14, 10), cm);
      s.position.set((RC() - 0.5) * 50, 42 + RC() * 8, (RC() - 0.5) * 40);
      s.scale.y = 0.6;
      this.cloud.add(s);
    }
    sc.add(this.cloud);
    this.rain = new RainStreaks({ x0: -30, x1: 30, z0: -30, z1: 30, top: 30 }, (x, z) => this.height(x, z), 2600, 9, 0.6, [0.12, 0.04], 0.1);
    sc.add(this.rain.group);
    // árboles alrededor
    const ts: TreeSpot[] = [];
    const RT = rng(3);
    for (let k = 0; k < 70; k++) {
      const a = RT() * Math.PI * 2, d = 18 + RT() * 90;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.hypot(x - RADAR.x, z - RADAR.z) < 12) continue;
      ts.push({ x, y: this.height(x, z), z, r: 2 + RT() * 2.4 });
    }
    sc.add(trees(ts, 9));
    const birds = new Birds(V3(0, 0, 0), 50, 30, 5, 1);
    sc.add(birds.group);
    stage.animate((t) => birds.update(t));
    stage.view(this.views.estacion, false);
  }

  set(s: RainState): void {
    const first = !this.st;
    if (first) this.lastTips = s.tips;
    if (s.live && this.st && !this.st.live) {
      this.liveMm = 0;
      this.liveTips = 0;
    }
    this.st = s;
    if (!s.live) {
      if (s.tips > this.lastTips) this.tipTarget += (s.tips - this.lastTips) * Math.PI * 0.32;
      if (s.tips < this.lastTips) this.tipTarget = 0;
      this.lastTips = s.tips;
    }
    this.rain.intensity = Math.min(1, s.I / 90);
    this.stage.weather(Math.min(1, s.I / 70) * 0.85);
    (this.cloud.children[0] as THREE.Mesh).material && ((this.cloud.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set('#8d96a0').lerp(new THREE.Color('#5b636c'), Math.min(1, s.I / 100));
    this.drawLogger(s);
    this.labels(s);
  }

  private drawLogger(s: RainState): void {
    const { ctx: c, tex } = this.logger;
    c.fillStyle = '#0f1a14';
    c.fillRect(0, 0, 256, 160);
    c.fillStyle = '#7dffa8';
    c.font = 'bold 30px ui-monospace, monospace';
    c.fillText(`${s.live ? this.liveTips : s.tips} vuelcos`, 14, 46);
    c.fillText(`${es(s.live ? this.liveTips * 0.2 : s.Pm, 1)} mm`, 14, 92);
    c.font = '20px ui-monospace, monospace';
    c.fillStyle = '#4fbf78';
    c.fillText(`${es(s.Im, 1)} mm/h`, 14, 134);
    tex.needsUpdate = true;
  }

  private labels(s: RainState): void {
    const L: StageLabel[] = [
      { id: 'pluvio', text: `Pluviómetro: ${es(s.Im, 1)} mm/h`, sub: `la lluvia real es ${es(s.I, 1)} mm/h · ${es((s.Im / Math.max(1e-9, s.I) - 1) * 100, 1)} %`, at: V3(0, 1.4, 0), kind: Math.abs(s.Im / Math.max(1e-9, s.I) - 1) > 0.08 ? 'alerta' : 'dato', prio: 9 },
      { id: 'radar', text: `Radar: ${es(s.dbz, 1)} dBZ`, sub: `con la relación ${s.algo}: ${es(s.Rr, 1)} mm/h`, at: V3(RADAR.x, this.height(RADAR.x, RADAR.z) + 31, RADAR.z), kind: Math.abs(s.Rr / Math.max(1e-9, s.I) - 1) > 0.1 ? 'alerta' : 'ok', prio: 7 },
      { id: 'viento', text: `Viento ${es(s.u, 1)} m/s`, at: V3(-1.6, 3.4, -1.2), kind: 'lugar', prio: 3 },
    ];
    this.stage.setLabels(L);
  }

  /** Pinta la reflectividad del aguacero (una celda centrada en la estación) solo donde ya pasó el barrido. */
  private paint(fromA: number, toA: number): void {
    const s = this.st;
    if (!s) return;
    const { ctx: c, tex } = this.map;
    const S = 256, span = 220; // la textura cubre x de −100 a 120 y z de −120 a 100
    const steps = 18;
    for (let k = 0; k <= steps; k++) {
      const a = fromA + ((toA - fromA) * k) / steps;
      for (let r = 2; r < 150; r += 2.4) {
        const x = RADAR.x + Math.cos(a) * r, z = RADAR.z + Math.sin(a) * r;
        const u = (x - (10 - span / 2)) / span, v = (z - (-10 - span / 2)) / span;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        // celda gaussiana de 35 m de radio con el pico en la estación
        const d2 = (x * x + z * z) / (35 * 35) * (1 + 0.35 * Math.sin(x * 0.06 + 1.3) * Math.cos(z * 0.05 - 0.4));
        const ripple = 2.2 * Math.sin(x * 0.11 + z * 0.07) + 1.6 * Math.sin(z * 0.13 - x * 0.04);
        const dbz = s.dbz + 10 * Math.log10(Math.max(1e-6, Math.exp(-Math.max(0, d2)))) + (d2 > 0.05 ? ripple : 0);
        let col = '';
        for (const [lv, cc] of DBZ_COLORS) if (dbz >= lv) col = cc;
        c.fillStyle = col || 'rgba(0,0,0,0)';
        if (!col) c.clearRect(u * S - 2, v * S - 2, 4, 4);
        else c.fillRect(u * S - 2, v * S - 2, 4, 4);
      }
    }
    tex.needsUpdate = true;
  }

  update(dt: number, t: number): void {
    this.rain.update(dt);
    const s = this.st;
    if (!s) return;
    if (s.live) {
      // cámara rápida: cada segundo de pantalla son seis de lluvia
      this.liveMm += (s.Im * dt * 6) / 3600;
      const n = Math.floor(this.liveMm / 0.2 + 1e-9);
      if (n > this.liveTips) {
        this.tipTarget += (n - this.liveTips) * Math.PI * 0.32;
        this.liveTips = n;
        this.drawLogger(s);
      }
    }
    // el balancín se vuelca de un lado al otro con cada vuelco
    this.tipAngle += (this.tipTarget - this.tipAngle) * Math.min(1, dt * 14);
    const side = Math.round(this.tipTarget / (Math.PI * 0.32)) % 2 === 0 ? 1 : -1;
    this.seesaw.rotation.z = side * 0.32 + Math.sin(this.tipAngle * 6) * 0.02;
    // gotas del embudo
    this.drips.visible = s.I > 0.5;
    this.drips.position.set(0, 0.87 - ((t * 3) % 1) * 0.08, 0);
    // anemómetro y veleta
    this.cups.rotation.y += s.u * dt * 3;
    this.vane.rotation.y = Math.PI + Math.sin(t * 0.7) * 0.15 / (1 + s.u);
    // barrido del radar (una vuelta cada 6 s)
    const a0 = this.ang;
    this.ang += dt * ((Math.PI * 2) / 6);
    this.sweep.rotation.y = -this.ang;
    this.paint(a0, this.ang);
  }
}

// ================================================================== 2. aforar el río

export interface RiverState {
  h: number;
  Q: number;
  V: number;
  verts: Vertical[];
  /** Vertical que se está midiendo (−1 sin aforo en curso) y método. */
  active: number;
  method: '06' | '0208';
  Qg: number;
  done: boolean;
}

const REACH = 34; // medio largo del tramo [m]

/**
 * Estación de aforo: el río con su sección pedregosa y sus llanuras, la regla limnimétrica, la caseta con el pozo
 * de aquietamiento, la tarabita con el molinete y un corte de velocidades en la línea de aforo.
 */
export class RiverGaugeWorld {
  private stage: QStage;
  private water: THREE.Mesh;
  private section = new THREE.Group();
  private vlines = new THREE.Group();
  private carriage = new THREE.Group();
  private meter = new THREE.Group();
  private prop: THREE.Mesh;
  private line: THREE.Mesh;
  private st: RiverState | null = null;
  private key = '';
  private cx = 0;
  private cy = 4;
  private cableY = 7.2;
  readonly views: Record<'rio' | 'molinete' | 'regla', StageView> = {
    rio: { eye: [22, 14, 30], target: [0, 1.2, -12], fit: 50, portrait: { eye: [24, 26, 52], target: [0, 1.5, -12] } },
    molinete: { eye: [3, 4.6, 13], target: [0, 3.2, -0.6], fit: 18 },
    regla: { eye: [-4.5, 3.6, 4.5], target: [-8.4, 2, -2.5], fit: 8 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(34);
    stage.controls.minDistance = 1;
    // terreno: la sección extruida a lo largo del río, con ondulaciones solo en las llanuras
    const h = (x: number, z: number) => bedZ(x) + (Math.abs(x) > 9 ? (Math.sin(x * 0.21 + z * 0.17) + Math.sin(z * 0.09 - x * 0.05)) * 0.12 : 0) + (Math.abs(x) < 8.4 ? (Math.sin(x * 2.1 + z * 1.3) * 0.04 + Math.sin(z * 0.9) * 0.03) : 0);
    const col = (x: number, _z: number, y: number) => (Math.abs(x) < 8.6 ? new THREE.Color('#8f8573').lerp(new THREE.Color('#6d655a'), THREE.MathUtils.clamp((2.7 - y) / 2.4, 0, 1)) : new THREE.Color('#79a052').lerp(new THREE.Color('#a1b36a'), 0.3 + 0.2 * Math.sin(x * 0.3)));
    sc.add(terrainBlock(h, -50, 50, -2 * REACH, 0, 200, 70, col, -1.6));
    // piedras en el cauce
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 0), lookMaterial(new THREE.MeshStandardMaterial({ color: '#8a8378', roughness: 0.95, flatShading: true }), { detail: 0.2 }), 70);
    const R = rng(12), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    for (let k = 0; k < 70; k++) {
      const x = -7.6 + R() * 15, z = -2 * REACH + 1 + R() * (2 * REACH - 4);
      Q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3));
      const s = 0.4 + R() * 1.4;
      M.compose(P.set(x, bedZ(x) + 0.05, z), Q, S.set(s, s * 0.6, s * 0.9));
      rocks.setMatrixAt(k, M);
    }
    rocks.castShadow = rocks.receiveShadow = true;
    sc.add(rocks);
    // agua
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1, 2 * REACH, 1, 40), waterMat('#4a8db0', 0.72, [0, 1], 0.9));
    this.water.rotation.x = -Math.PI / 2;
    sc.add(this.water, this.section, this.vlines);
    // regla limnimétrica en la orilla izquierda
    const rl = screen(64, 512);
    const c = rl.ctx;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 64, 512);
    for (let k = 0; k < 40; k++) {
      // cada 10 cm, con la «E» de las reglas
      const y = 512 - ((k + 1) * 512) / 40;
      c.fillStyle = Math.floor(k / 10) % 2 === 0 ? '#c0392b' : '#1d242b';
      if (k % 2 === 0) c.fillRect(8, y, 30, 512 / 40 / 2);
      c.fillRect(8, y, 8, 512 / 40);
      if (k % 10 === 9) {
        c.font = 'bold 22px system-ui';
        c.fillText(String((k + 1) / 10), 40, y + 18);
      }
    }
    rl.tex.needsUpdate = true;
    const staff = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4, 0.03), [steel(), steel(), steel(), steel(), new THREE.MeshStandardMaterial({ map: rl.tex, roughness: 0.6 }), steel()]);
    staff.position.set(-8.3, 2, -2.5);
    staff.castShadow = true;
    sc.add(staff);
    // caseta con el pozo de aquietamiento
    const hut = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.4), concreteMaterial('#e3ddcf'));
    hut.position.set(-12.5, bedZ(-12.5) + 1.2, -6);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3, 0.18, 2.8), paint('#8c4a37', 0.7, 0.1));
    roof.position.set(-12.5, bedZ(-12.5) + 2.5, -6);
    const well = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 3.2, 20), concreteMaterial('#cfccc4'));
    well.position.set(-10.4, bedZ(-10.4) + 0.4, -6);
    hut.castShadow = roof.castShadow = well.castShadow = true;
    sc.add(hut, roof, well);
    // tarabita: dos torres en A en las llanuras y el cable
    const tm = paint('#8b949b', 0.5, 0.45);
    for (const x of [-15, 15]) {
      for (const dz of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.9, 8), tm);
        leg.position.set(x, bedZ(x) + 2.35, -0.6 + dz * 0.5);
        leg.rotation.x = dz * 0.15;
        leg.castShadow = true;
        sc.add(leg);
      }
    }
    this.cableY = bedZ(15) + 4.6;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 30, 6), steel('#3b4148', 0.4));
    cable.rotation.z = Math.PI / 2;
    cable.position.set(0, this.cableY, -0.6);
    sc.add(cable);
    // carro, línea y molinete (cuerpo, aletas y hélice)
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.2), paint('#e0a526', 0.5, 0.3));
    this.carriage.add(car);
    this.line = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), steel('#2b2f33', 0.4));
    this.carriage.add(this.line);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 6, 12), paint('#9aa3ab', 0.3, 0.7));
    body.rotation.x = Math.PI / 2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.1, 0.08), paint('#9aa3ab', 0.3, 0.7));
    fin.position.z = -0.16;
    this.prop = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 3), paint('#c0632b', 0.4, 0.4));
    this.prop.rotation.x = Math.PI / 2;
    this.prop.position.z = 0.16;
    const weight = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), paint('#3b4148', 0.4, 0.6));
    weight.position.y = -0.12;
    this.meter.add(body, fin, this.prop, weight);
    this.meter.rotation.y = Math.PI; // la hélice mira aguas arriba (−z)
    this.carriage.add(this.meter);
    sc.add(this.carriage);
    // alrededores
    const ts: TreeSpot[] = [];
    const RT = rng(14);
    for (let k = 0; k < 60; k++) {
      const x = (RT() < 0.5 ? -1 : 1) * (20 + RT() * 28), z = -2 * REACH + 2 + RT() * (2 * REACH - 8);
      ts.push({ x, y: bedZ(x), z, r: 1.8 + RT() * 2 });
    }
    sc.add(trees(ts, 6));
    const birds = new Birds(V3(0, 0, 0), 30, 18, 5, 0.9);
    sc.add(birds.group);
    stage.animate((t) => birds.update(t));
    stage.view(this.views.rio, false);
  }

  /** Corte de velocidades en la línea de aforo: colores de lento a rápido bajo la superficie. */
  private buildSection(h: number): void {
    clear(this.section);
    const [a, b] = waterEdges(h);
    const nx = 120, ny = 14;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const vmax = Math.max(0.2, (trueFlow(h).Q / Math.max(1, trueFlow(h).A)) * 1.8);
    const slow = new THREE.Color('#e6f4fb'), fast = new THREE.Color('#0d4f8b'), c = new THREE.Color();
    for (let i = 0; i <= nx; i++) {
      const x = a + ((b - a) * i) / nx;
      const zb = bedZ(x), d = Math.max(0, h - zb);
      for (let j = 0; j <= ny; j++) {
        const y = zb + (d * j) / ny;
        pos.push(x, y, 0.03);
        c.copy(slow).lerp(fast, Math.min(1, pointVelocity(x, (d * j) / ny, h) / vmax));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const p = i * (ny + 1) + j;
        idx.push(p, p + ny + 1, p + 1, p + 1, p + ny + 1, p + ny + 2);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false })));
    m.renderOrder = 2;
    this.section.add(m);
    // marco del corte: la línea del agua
    const wl = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.02, 0.02), own(new THREE.MeshBasicMaterial({ color: '#1f6fa5' })));
    wl.position.set((a + b) / 2, h, 0.03);
    this.section.add(wl);
  }

  private buildVerticals(s: RiverState): void {
    clear(this.vlines);
    const lm = own(new THREE.MeshBasicMaterial({ color: '#17324d', transparent: true, opacity: 0.55 }));
    const pm = own(new THREE.MeshBasicMaterial({ color: '#e0a526' }));
    for (const v of s.verts) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, Math.max(0.01, v.d), 0.02), lm);
      l.position.set(v.x, s.h - v.d / 2, 0.06);
      this.vlines.add(l);
      const ys = s.method === '06' ? [0.6] : [0.2, 0.8];
      for (const f of ys) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), pm);
        p.position.set(v.x, s.h - f * v.d, 0.08);
        this.vlines.add(p);
      }
    }
  }

  set(s: RiverState): void {
    const prev = this.st;
    this.st = s;
    if (!prev || Math.abs(prev.h - s.h) > 1e-9) {
      this.buildSection(s.h);
      const [a, b] = waterEdges(s.h);
      this.water.scale.set(b - a, 1, 1);
      this.water.position.set((a + b) / 2, s.h, -REACH);
    }
    const key = `${s.h}|${s.verts.length}|${s.method}`;
    if (key !== this.key) {
      this.key = key;
      this.buildVerticals(s);
    }
    this.labels(s);
  }

  private labels(s: RiverState): void {
    const L: StageLabel[] = [
      { id: 'regla', text: `Regla: ${es(s.h, 2)} m`, sub: s.h > BANK ? 'el río salió del cauce' : `la orilla está a ${es(BANK, 2)} m`, at: V3(-8.3, 4.4, -2.5), kind: s.h > BANK ? 'alerta' : 'lugar', prio: 6 },
      {
        id: 'aforo',
        text: s.done ? `Aforo: ${es(s.Qg, 2)} m³/s` : s.active >= 0 ? `Midiendo la vertical ${s.active + 1} de ${s.verts.length}` : `${s.verts.length} verticales`,
        sub: s.done ? `el verdadero es ${es(s.Q, 2)} m³/s (${es((s.Qg / s.Q - 1) * 100, 1)} %)` : `velocidad media ${es(s.V, 2)} m/s`,
        at: V3(this.cx, this.cableY + 1.2, 0),
        kind: s.done ? (Math.abs(s.Qg / s.Q - 1) <= 0.05 ? 'ok' : 'alerta') : 'dato',
        prio: 9,
      },
    ];
    this.stage.setLabels(L);
  }

  update(dt: number, t: number): void {
    const s = this.st;
    if (!s) return;
    // el carro va a la vertical activa y el molinete baja a su punto (con 0,2 y 0,8 alterna)
    const v = s.active >= 0 && s.active < s.verts.length ? s.verts[s.active] : null;
    const tx = v ? v.x : -13;
    const f = v ? (s.method === '06' ? 0.6 : (t % 1.2) < 0.6 ? 0.2 : 0.8) : 0;
    const ty = v ? s.h - f * v.d : this.cableY - 0.8;
    this.cx += (tx - this.cx) * Math.min(1, dt * 3);
    this.cy += (ty - this.cy) * Math.min(1, dt * 3);
    this.carriage.position.set(this.cx, this.cableY - 0.12, -0.6);
    const drop = this.cableY - 0.12 - this.cy;
    this.line.scale.y = Math.max(0.01, drop);
    this.line.position.y = -drop / 2;
    this.meter.position.y = -drop;
    const speed = v && this.cy < s.h ? pointVelocity(v.x, Math.max(0, this.cy - bedZ(v.x)), s.h) : 0;
    this.prop.rotation.y += speed * dt * 25;
    this.water.position.y = s.h + Math.sin(t * 1.3) * 0.004;
  }
}

// ================================================================== 3. el banco de tuberías

export interface PipeState {
  Q: number;
  beta: number;
  H: number;
  piezo: number[];
  dhV: number;
  dhO: number;
  Qv: number;
  Qo: number;
  cavV: boolean;
  cavO: boolean;
  lossV: number;
  lossO: number;
  V1: number;
}

const AX = 1.1; // eje de la tubería sobre el piso [m]
const PR = 0.05; // radio de la tubería (100 mm)
const TAPS = [-4.4, -2.75, -0.6, 1.6, 2.36, 3.6];

/**
 * Banco de tuberías del laboratorio: un tanque elevado de nivel constante, la tubería de acrílico con un Venturi y
 * una placa de orificio, seis piezómetros de vidrio frente a una regla, partículas que se aceleran en la garganta,
 * la válvula y el tanque de aforo volumétrico que se llena.
 */
export class MeterWorld {
  private stage: QStage;
  private dyn = new THREE.Group();
  private cols: THREE.Mesh[] = [];
  private bubbles: THREE.Mesh[] = [];
  private parts: THREE.InstancedMesh;
  private pdata: { x: number; r: number; a: number }[] = [];
  private profile: (x: number) => number = () => PR;
  private headWater: THREE.Mesh;
  private headTank: THREE.Group;
  private volWater: THREE.Mesh;
  private vol = 0;
  private feed: FlowPipe | null = null;
  private valve: GateValve;
  private st: PipeState | null = null;
  private key = '';
  readonly views: Record<'banco' | 'venturi' | 'placa', StageView> = {
    banco: { eye: [1.2, 4.6, 12.5], target: [-0.6, 3.4, 0], fit: 14, portrait: { eye: [0.5, 6, 22], target: [-0.5, 4, 0] } },
    venturi: { eye: [-2.1, 1.6, 2.1], target: [-2.5, 1.2, 0], fit: 2.8 },
    placa: { eye: [2.6, 1.6, 2.0], target: [2.1, 1.2, 0], fit: 2.6 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(12);
    stage.controls.minDistance = 0.6;
    // piso y pared del laboratorio
    const floor = new THREE.Mesh(new THREE.BoxGeometry(26, 0.2, 12), concreteMaterial('#cfccc6'));
    floor.position.set(0, -0.1, 0);
    floor.receiveShadow = true;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(26, 14, 0.3), concreteMaterial('#e6e3dc'));
    wall.position.set(0, 7, -1.4);
    wall.receiveShadow = true;
    sc.add(floor, wall);
    // regla graduada detrás de los piezómetros (de 0 a 12 m sobre el eje), con líneas cada 10 cm
    const board = screen(1152, 1536);
    const c = board.ctx;
    c.fillStyle = '#fbfaf6';
    c.fillRect(0, 0, 1152, 1536);
    for (let k = 0; k <= 120; k++) {
      const y = 1536 - (k / 120) * 1536;
      const major = k % 10 === 0;
      c.fillStyle = major ? '#2b3640' : k % 5 === 0 ? '#8a96a0' : '#c9d1d7';
      c.fillRect(0, y - (major ? 2 : 1), 1152, major ? 3 : 1.5);
      if (major && k > 0) {
        c.font = '600 30px system-ui';
        c.fillStyle = '#2b3640';
        c.fillText(`${k / 10} m`, 10, y + 32);
        c.fillText(`${k / 10} m`, 1080, y + 32);
      }
    }
    board.tex.needsUpdate = true;
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(9, 12), new THREE.MeshStandardMaterial({ map: board.tex, roughness: 0.8 }));
    bm.position.set(-0.4, AX + 6, -1.2);
    sc.add(bm);
    // tanque elevado de nivel constante sobre su torre
    this.headTank = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 32, 1, true), glass(0.2));
    const tankBase = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.1, 32), paint('#5d6973', 0.5, 0.4));
    tankBase.position.y = -0.85;
    this.headWater = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 1, 32), waterMat('#3b83ad', 0.7, [0.02, 0.01], 0.5));
    this.headTank.add(shell, tankBase, this.headWater);
    sc.add(this.headTank);
    // volumen de aforo: tanque de vidrio que se llena
    const vt = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.2), glass(0.18));
    vt.position.set(7.4, 0.7, 0.4);
    this.volWater = new THREE.Mesh(new THREE.BoxGeometry(1.56, 1, 1.16), waterMat('#3b83ad', 0.75, [0.02, 0.01], 0.5));
    sc.add(vt, this.volWater, this.dyn);
    // válvula a la salida
    this.valve = new GateValve(PR);
    this.valve.group.position.set(5.2, AX, 0);
    sc.add(this.valve.group);
    // partículas dentro de la tubería
    this.parts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 420);
    this.parts.frustumCulled = false;
    const RP = rng(3);
    for (let k = 0; k < 420; k++) this.pdata.push({ x: -6 + RP() * 11.2, r: Math.sqrt(RP()) * 0.85, a: RP() * Math.PI * 2 });
    sc.add(this.parts);
    stage.view(this.views.banco, false);
  }

  /** Arma la tubería (con el β de ahora), los piezómetros y el tanque elevado. */
  private build(s: PipeState): void {
    clear(this.dyn);
    this.cols = [];
    this.bubbles = [];
    const d = PR * s.beta;
    // perfil del radio a lo largo de x: Venturi de −3,4 a −1,1 (convergente 21°, garganta, divergente 7°)
    const xc0 = -3.4, lc = (PR - d) / Math.tan((10.5 * Math.PI) / 180), xt0 = xc0 + lc, xt1 = xt0 + 2 * d, ld = (PR - d) / Math.tan((3.5 * Math.PI) / 180), xd1 = xt1 + ld;
    this.profile = (x: number) => (x < xc0 ? PR : x < xt0 ? PR - ((x - xc0) / lc) * (PR - d) : x < xt1 ? d : x < xd1 ? d + ((x - xt1) / ld) * (PR - d) : PR);
    const pts: THREE.Vector2[] = [];
    for (let x = -6; x <= 5.2; x += 0.02) pts.push(new THREE.Vector2(this.profile(x) + 0.004, x));
    const outer = new THREE.LatheGeometry(pts, 32);
    outer.rotateZ(-Math.PI / 2);
    const tube = new THREE.Mesh(outer, own(glass(0.22, '#e8f6ff')));
    tube.position.y = AX;
    const innerPts = pts.map((p) => new THREE.Vector2(p.x - 0.006, p.y));
    const inner = new THREE.LatheGeometry(innerPts, 24);
    inner.rotateZ(-Math.PI / 2);
    const wat = new THREE.Mesh(inner, own(new THREE.MeshStandardMaterial({ color: '#59a7d8', transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false })));
    (wat.material as THREE.Material).userData.noLook = true;
    wat.position.y = AX;
    this.dyn.add(tube, wat);
    // placa de orificio con sus bridas en x = 2,1
    const plate = new THREE.Mesh(new THREE.RingGeometry(d, PR * 1.5, 40), own(new THREE.MeshStandardMaterial({ color: '#b8c0c7', metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide })));
    plate.rotation.y = Math.PI / 2;
    plate.position.set(2.1, AX, 0);
    this.dyn.add(plate, flange(PR, V3(2.08, AX, 0), V3(1, 0, 0)), flange(PR, V3(2.12, AX, 0), V3(1, 0, 0)));
    for (const x of [-6, xc0 - 0.05, xd1 + 0.05, 5.2]) this.dyn.add(flange(PR, V3(x, AX, 0), V3(1, 0, 0)));
    // soportes
    for (const x of [-5.4, -1.8, 0.8, 3.2, 4.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, AX - PR, 0.3), paint('#5d6973', 0.5, 0.4));
      leg.position.set(x, (AX - PR) / 2, 0);
      leg.castShadow = true;
      this.dyn.add(leg);
    }
    // piezómetros: tomas, tubos de vidrio de 12 m y la columna de agua
    const tubeM = own(glass(0.16, '#ffffff'));
    const colM = own(new THREE.MeshStandardMaterial({ color: '#1f7fd0', emissive: '#0d4f8b', emissiveIntensity: 0.5, roughness: 0.2 }));
    (colM as THREE.Material).userData.noLook = true;
    const tapX = [-4.4, (xt0 + xt1) / 2, xd1 + 0.4, 1.6, 2.1 + 2 * d * 0.5 + 0.04, 3.6];
    TAPS.splice(0, TAPS.length, ...tapX);
    for (const x of tapX) {
      const r = this.profile(x);
      const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18 + (PR - r), 8), steel());
      tap.position.set(x, AX + r + (0.18 + (PR - r)) / 2, -0.1);
      const pt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 12, 12, 1, true), tubeM);
      pt.position.set(x, AX + 0.2 + 6, -0.1);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 1, 12), colM);
      col.position.set(x, AX + 0.7, -0.1);
      const bub = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), own(new THREE.MeshBasicMaterial({ color: '#ffffff' })));
      bub.visible = false;
      const conn = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), steel());
      conn.rotation.x = Math.PI / 2;
      conn.position.set(x, AX + 0.2, -0.05);
      this.dyn.add(tap, pt, col, bub, conn);
      this.cols.push(col);
      this.bubbles.push(bub);
    }
  }

  set(s: PipeState): void {
    const prev = this.st;
    this.st = s;
    const key = `${s.beta}`;
    if (key !== this.key) {
      this.key = key;
      this.build(s);
    }
    // tanque elevado: su nivel es la presión más la energía de la velocidad y las pérdidas de la entrada
    const top = AX + s.H + (s.V1 * s.V1) / (2 * 9.81) * 1.5;
    this.headTank.position.set(-8.4, top - 0.4, 0.2);
    this.headWater.scale.y = 1.2;
    this.headWater.position.y = -0.2;
    if (!prev || Math.abs(prev.H - s.H) > 1e-9 || !this.feed) {
      if (this.feed) {
        this.stage.scene.remove(this.feed.mesh);
        this.feed.mesh.geometry.dispose();
      }
      this.feed = new FlowPipe(roundedPath([V3(-8.4, top - 1.2, 0.2), V3(-8.4, AX, 0.2), V3(-7.6, AX, 0), V3(-6, AX, 0)], 0.35), PR, '#7c8b97', { gain: 0.7, tint: '#7cc8ff' });
      this.stage.scene.add(this.feed.mesh);
      // torre del tanque
      const towerKey = 'tower';
      const old = this.stage.scene.getObjectByName(towerKey);
      if (old) this.stage.scene.remove(old);
      const tw = new THREE.Group();
      tw.name = towerKey;
      for (const [dx, dz] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 1], [0.8, 1]] as [number, number][]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, top - 1.25, 0.1), paint('#5d6973', 0.5, 0.4));
        leg.position.set(-8.4 + dx, (top - 1.25) / 2, dz);
        leg.castShadow = true;
        tw.add(leg);
      }
      this.stage.scene.add(tw);
    }
    this.feed.setFlow(s.V1);
    this.valve.setOpen(Math.min(1, 0.25 + s.Q / 20));
    this.labels(s);
  }

  private labels(s: PipeState): void {
    const L: StageLabel[] = [
      { id: 'v', text: `Venturi: Δh = ${es(s.dhV * 1000, 0)} mm`, sub: s.cavV ? 'la garganta cavita' : `${es(s.Qv, 2)} L/s · pierde ${es(s.lossV * 100, 0)} cm`, at: V3(-2.5, AX + 0.6, 0.3), kind: s.cavV ? 'alerta' : 'dato', prio: 8 },
      { id: 'o', text: `Placa: Δh = ${es(s.dhO * 1000, 0)} mm`, sub: s.cavO ? 'el orificio cavita' : `${es(s.Qo, 2)} L/s · pierde ${es(s.lossO * 100, 0)} cm`, at: V3(2.4, AX + 0.6, 0.3), kind: s.cavO ? 'alerta' : 'dato', prio: 7 },
      { id: 'tanque', text: `Tanque de aforo: ${es(s.Q, 1)} L/s`, sub: 'volumen entre tiempo: el caudal de referencia', at: V3(7.4, 1.9, 0.4), kind: 'lugar', prio: 4 },
    ];
    if (s.piezo.some((p) => p < 0)) L.push({ id: 'aire', text: 'Presión menor que la del aire', sub: 'ese piezómetro chupa aire en vez de subir agua', at: V3(TAPS[s.piezo.findIndex((p) => p < 0)], AX + 1.4, 0), kind: 'alerta', prio: 9 });
    this.stage.setLabels(L);
  }

  update(dt: number, t: number): void {
    const s = this.st;
    this.feed?.tick(dt);
    this.valve.tick(dt);
    if (!s) return;
    // columnas de los piezómetros (suben suave); si la presión es negativa, burbujas que entran
    s.piezo.forEach((p, k) => {
      const col = this.cols[k];
      if (!col) return;
      const target = Math.max(0.01, p + 0.0 - 0.2 + 0.2);
      const now = col.scale.y + (target - col.scale.y) * Math.min(1, dt * 3);
      col.scale.y = Math.max(0.01, now);
      col.position.y = AX + 0.2 + col.scale.y / 2;
      col.visible = p > 0.01;
      const b = this.bubbles[k];
      b.visible = p < 0;
      if (p < 0) b.position.set(TAPS[k], AX + 0.25 + ((t * 0.8) % 1) * 0.6, -0.1);
    });
    // partículas: avanzan con la velocidad local Q/A(x) (a la décima parte, para que se vean)
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
    const q = s.Q / 1000;
    for (let k = 0; k < this.pdata.length; k++) {
      const p = this.pdata[k];
      const r = this.profile(p.x);
      p.x += ((q / (Math.PI * r * r)) * dt) / 10;
      if (p.x > 5.1) p.x = -6 + (p.x - 5.1);
      const rr = this.profile(p.x) * p.r;
      M.compose(P.set(p.x, AX + Math.cos(p.a) * rr, Math.sin(p.a) * rr), Q, S);
      this.parts.setMatrixAt(k, M);
    }
    this.parts.instanceMatrix.needsUpdate = true;
    // el tanque de aforo se llena (1,6 × 1,2 m de planta) y se vacía al llegar arriba
    this.vol += (q * dt) / (1.56 * 1.16);
    if (this.vol > 1.25) this.vol = 0.05;
    this.volWater.scale.y = Math.max(0.01, this.vol);
    this.volWater.position.set(7.4, 0.02 + this.vol / 2, 0.4);
  }
}

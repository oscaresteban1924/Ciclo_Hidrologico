// Mundo 3D de la sala «El agua en casa»: una casa de un piso a escala con su baño, cocina, patio de ropas y antejardín,
// la tubería que llega del medidor de la calle a cada aparato (con el agua que avanza cuando se usa), la ducha, las
// llaves, el sanitario que se llena y la lavadora que gira; el medidor con sus tambores y agujas; y el tanque de agua
// lluvia con la canoa, el bajante, el separador del primer lavado y el rebose. Tres modos: consumo, factura y lluvia.

import * as THREE from 'three';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { concreteMaterial, rng } from '../../quality/three/kit';
import { lookMaterial, lookWater } from '../../three/look';
import { RainStreaks, meadow, trees, type TreeSpot } from '../../three/scenery';
import { FlowPipe, glass, paint, roundedPath, steel } from '../../three/machines';
import { es } from '../../canals/common';
import { meterDigits, type Use } from '../house';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const FLOOR = 0.15;
const WALL_H = 2.6;

export type HouseMode = 'consumo' | 'factura' | 'lluvia';

export interface HouseState {
  mode: HouseMode;
  /** Hora del día (0 a 24) y litros por hora de cada uso. */
  hour: number;
  hrs: Record<Use, number[]> | null;
  /** Lectura del medidor [m³] y fuga escondida [L/h]. */
  reading: number;
  leak: number;
  /** Tanque de agua lluvia: volumen y agua de ahora [m³], lluvia del día [mm], si rebosa y la demanda [L/día]. */
  tank?: { V: number; S: number; rain: number; spill: boolean; A: number; D: number; day: number; label: string };
  people: number;
}

const own = <M extends THREE.Material>(m: M): M => {
  m.userData.own = true;
  return m;
};
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
const waterMat = (color = '#3f86b0', opacity = 0.86, flow: [number, number] = [0.05, 0.02], strength = 0.6) =>
  own(lookWater(new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.06, metalness: 0.05, depthWrite: false }), flow, strength));

/** Aparatos con su punto de agua y su tramo de tubería. */
interface Fixture {
  use: Use;
  pipe: FlowPipe;
  at: THREE.Vector3;
}

export class HouseWorld {
  private stage: QStage;
  private roof = new THREE.Group();
  private frontWall = new THREE.Group();
  private fixtures: Fixture[] = [];
  private showerStream: THREE.Mesh;
  private basinStream: THREE.Mesh;
  private sinkStream: THREE.Mesh;
  private hoseStream: THREE.Mesh;
  private toiletWater: THREE.Mesh;
  private drum: THREE.Mesh;
  private main: FlowPipe;
  private meterFace: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D };
  private star: THREE.Mesh;
  private clockFace: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D };
  private tankG = new THREE.Group();
  private tankWater: THREE.Mesh | null = null;
  private tankR = 0.6;
  private tankH = 1.5;
  private overflowJet: THREE.Mesh;
  private downJet: THREE.Mesh;
  private rainLine: FlowPipe;
  private rain: RainStreaks;
  private gutterG = new THREE.Group();
  private walls: THREE.Mesh[] = [];
  private clock: THREE.Mesh;
  private rainKit = new THREE.Group();
  private st: HouseState | null = null;
  private tankKey = '';
  private lastDraw = -1;
  readonly views: Record<string, StageView> = {
    casa: { eye: [4.5, 8.2, 8.2], target: [-0.6, 0.6, -1.2], fit: 11, portrait: { eye: [6, 12, 13], target: [-0.6, 0.6, -1] } },
    bano: { eye: [-1.4, 3.6, 0.9], target: [-3.4, 0.7, -2.4], fit: 4.2 },
    cocina: { eye: [5.2, 3.4, 0.4], target: [3.7, 0.8, -2.8], fit: 4.6 },
    medidor: { eye: [-3.5, 0.78, 5.86], target: [-3.5, 0.19, 5.4], fit: 0.42 },
    fachada: { eye: [3, 3.4, 13], target: [-0.5, 1.4, 3], fit: 13 },
    tanque: { eye: [11, 5, 9], target: [6.4, 1.6, 2.4], fit: 8 },
  };

  constructor(stage: QStage, mode: HouseMode) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(12);
    stage.controls.minDistance = 0.4;
    // terreno: antejardín, calle y lomas suaves alrededor
    const m = meadow({ keep: [-9, 11, -8, 9], extent: [-90, 90, -90, 90], y0: 0, hills: 9, ramp: 26, seed: 4 });
    sc.add(m.mesh);
    const road = new THREE.Mesh(new THREE.BoxGeometry(60, 0.05, 5), lookMaterial(new THREE.MeshStandardMaterial({ color: '#5c5f63', roughness: 0.9 }), { detail: 0.2, scale: 3 }));
    road.position.set(0, 0.02, 9.2);
    const walk = new THREE.Mesh(new THREE.BoxGeometry(60, 0.12, 1.9), concreteMaterial('#cfccc5'));
    walk.position.set(0, 0.06, 5.7);
    road.receiveShadow = walk.receiveShadow = true;
    sc.add(road, walk);
    // losa, muros y divisiones
    const slab = new THREE.Mesh(new THREE.BoxGeometry(10.4, FLOOR, 8.4), concreteMaterial('#d8d2c6'));
    slab.position.set(0, FLOOR / 2, 0);
    slab.receiveShadow = true;
    sc.add(slab);
    const floorTiles = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), lookMaterial(new THREE.MeshStandardMaterial({ color: '#c9b9a0', roughness: 0.6 }), { detail: 0.08, scale: 2 }));
    floorTiles.rotation.x = -Math.PI / 2;
    floorTiles.position.y = FLOOR + 0.005;
    floorTiles.receiveShadow = true;
    sc.add(floorTiles);
    const wallM = lookMaterial(new THREE.MeshStandardMaterial({ color: '#f1e8d6', roughness: 0.92 }), { detail: 0.06 });
    const tileM = lookMaterial(new THREE.MeshStandardMaterial({ color: '#dfe9ee', roughness: 0.35 }), { detail: 0.03 });
    const wall = (sx: number, sz: number, x: number, z: number, mat: THREE.Material = wallM, g: THREE.Object3D = sc, h = WALL_H) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), mat);
      w.position.set(x, FLOOR + h / 2, z);
      w.castShadow = w.receiveShadow = true;
      g.add(w);
      if (g === sc) this.walls.push(w);
      return w;
    };
    wall(10.3, 0.15, 0, -4.05); // fondo
    wall(0.15, 8.1, -5.08, 0); // izquierda
    wall(0.15, 8.1, 5.08, 0); // derecha
    wall(0.12, 3.2, -1.95, -2.45, tileM); // baño
    wall(3.1, 0.12, -3.5, -0.85, tileM);
    wall(0.12, 2.6, 1.4, -2.75); // cocina
    // muro del frente (se quita en el modo de consumo para ver adentro)
    for (const [sx, x] of [[2.6, -3.8], [2.8, 0.2], [2.4, 3.9]] as [number, number][]) wall(sx, 0.15, x, 4.05, wallM, this.frontWall);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(10.3, 0.55, 0.15), wallM);
    lintel.position.set(0, FLOOR + WALL_H - 0.27, 4.05);
    this.frontWall.add(lintel);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.05, 0.06), paint('#7b4a2e', 0.6, 0.1));
    door.position.set(-1.95, FLOOR + 1.03, 4.06);
    this.frontWall.add(door);
    for (const x of [-1.25 - 2.6 + 0.2, 2.45]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.04), glass(0.35, '#bcd6e6'));
      win.position.set(x, FLOOR + 1.5, 4.1);
      this.frontWall.add(win);
    }
    sc.add(this.frontWall);
    // techo de teja a dos aguas
    const tileRoof = lookMaterial(new THREE.MeshStandardMaterial({ color: '#a8553a', roughness: 0.85 }), { detail: 0.14, scale: 4 });
    const theta = Math.atan(1.45 / 4.2);
    for (const sd of [-1, 1]) {
      const g = new THREE.PlaneGeometry(11.2, 4.8, 1, 24);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) p.setZ(k, Math.abs(Math.sin(p.getY(k) * 9)) * 0.03);
      g.computeVertexNormals();
      const r = new THREE.Mesh(g, tileRoof);
      r.rotation.x = -Math.PI / 2 + sd * theta;
      r.position.set(0, FLOOR + WALL_H + 0.7, sd * 2.2);
      r.castShadow = r.receiveShadow = true;
      (r.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      this.roof.add(r);
    }
    const gable = new THREE.BufferGeometry();
    gable.setAttribute('position', new THREE.Float32BufferAttribute([-4.1, 0, 0, 4.1, 0, 0, 0, 1.45, 0], 3));
    gable.computeVertexNormals();
    for (const x of [-5.08, 5.08]) {
      const gm = new THREE.Mesh(gable, wallM);
      gm.rotation.y = Math.PI / 2;
      gm.position.set(x, FLOOR + WALL_H, 0);
      (gm.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      this.roof.add(gm);
    }
    sc.add(this.roof);
    // muebles para dar escala: cama, sofá, mesa y mesón de cocina
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2), paint('#d7e2ea', 0.8, 0));
    bed.position.set(-3.8, FLOOR + 0.25, 2.4);
    const sofa = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 0.85), paint('#7e8f6a', 0.85, 0));
    sofa.position.set(1.8, FLOOR + 0.4, 2.9);
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.8), paint('#8a6343', 0.6, 0));
    table.position.set(0, FLOOR + 0.75, 0.6);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.6), paint('#e6e2da', 0.5, 0.05));
    counter.position.set(3.25, FLOOR + 0.45, -3.65);
    for (const o of [bed, sofa, table, counter]) {
      o.castShadow = o.receiveShadow = true;
      sc.add(o);
    }
    // reloj de pared
    this.clockFace = this.canvas(256, 256);
    this.clock = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshBasicMaterial({ map: this.clockFace.tex, toneMapped: false }));
    this.clock.position.set(0, FLOOR + 2.0, -3.96);
    sc.add(this.clock);
    // aparatos del baño, la cocina y el patio
    const white = paint('#f6f6f3', 0.25, 0.05);
    const toilet = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 20), white);
    bowl.position.y = 0.2;
    const tankBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.18), glass(0.3, '#f4f8fa'));
    tankBox.position.set(0, 0.62, -0.18);
    this.toiletWater = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1, 0.14), waterMat('#5aa7d6', 0.8));
    this.toiletWater.position.set(0, 0.45, -0.18);
    toilet.add(bowl, tankBox, this.toiletWater);
    toilet.position.set(-2.55, FLOOR, -3.6);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.18, 0.18, 24), white);
    basin.position.set(-3.6, FLOOR + 0.85, -1.15);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.75, 12), white);
    ped.position.set(-3.6, FLOOR + 0.38, -1.15);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), white);
    tray.position.set(-4.45, FLOOR + 0.03, -3.45);
    const screenG = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.9, 1), glass(0.18));
    screenG.position.set(-3.95, FLOOR + 0.98, -3.45);
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.42), steel('#c9cfd4', 0.25));
    sink.position.set(3.0, FLOOR + 0.86, -3.62);
    // patio de ropas: lavadora y lavadero, y la llave de la manguera
    const washer = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.9, 0.62), paint('#f2f2ef', 0.35, 0.1));
    washer.position.set(6.1, FLOOR + 0.45, -3.4);
    this.drum = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshStandardMaterial({ color: '#4c6f8c', roughness: 0.2, metalness: 0.4 }));
    this.drum.position.set(6.1, FLOOR + 0.48, -3.08);
    const patio = new THREE.Mesh(new THREE.BoxGeometry(2.6, FLOOR, 4), concreteMaterial('#cfccc4'));
    patio.position.set(6.4, FLOOR / 2, -2.1);
    for (const o of [toilet, basin, ped, tray, screenG, sink, washer, patio]) {
      o.traverse((c) => ((c as THREE.Mesh).castShadow = true));
      sc.add(o);
    }
    sc.add(this.drum);
    // chorros de agua
    const jet = (r: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.6, 1, 10, 1, true), own(lookWater(new THREE.MeshStandardMaterial({ color: '#6fb8e6', emissive: '#1d5f8f', emissiveIntensity: 0.35, transparent: true, opacity: 0.7, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }), [0, -2.5], 1)));
      m.visible = false;
      sc.add(m);
      return m;
    };
    this.showerStream = jet(0.07);
    this.showerStream.position.set(-4.45, FLOOR + 1.05, -3.45);
    this.showerStream.scale.y = 1.9;
    this.basinStream = jet(0.008);
    this.basinStream.position.set(-3.6, FLOOR + 1.04, -1.25);
    this.basinStream.scale.y = 0.18;
    this.sinkStream = jet(0.01);
    this.sinkStream.position.set(3.0, FLOOR + 1.08, -3.7);
    this.sinkStream.scale.y = 0.24;
    this.hoseStream = jet(0.012);
    this.hoseStream.rotation.z = -1.1;
    this.hoseStream.position.set(7.4, FLOOR + 0.55, 1.4);
    this.hoseStream.scale.y = 1.4;
    // tubería: del medidor (en la calle) a cada aparato
    const mainPts = [V3(-3.5, 0.15, 5.33), V3(-3.5, 0.05, 5.1), V3(-3.5, 0.05, 4.3), V3(-3.5, FLOOR + 0.08, 3.8), V3(-0.4, FLOOR + 0.08, 3.8), V3(-0.4, FLOOR + 0.08, -0.4)];
    this.main = new FlowPipe(roundedPath(mainPts, 0.25), 0.016, '#e9ecef', { metal: 0.05, rough: 0.5, gain: 0.85, spacing: 0.25 });
    sc.add(this.main.mesh);
    const hub = V3(-0.4, FLOOR + 0.08, -0.4);
    const branch = (use: Use, pts: THREE.Vector3[], at: THREE.Vector3) => {
      const p = new FlowPipe(roundedPath([hub, ...pts], 0.2), 0.012, '#e9ecef', { metal: 0.05, rough: 0.5, gain: 0.85, spacing: 0.2 });
      sc.add(p.mesh);
      this.fixtures.push({ use, pipe: p, at });
    };
    branch('ducha', [V3(-1.6, FLOOR + 0.08, -0.4), V3(-1.6, FLOOR + 0.08, -3.9), V3(-4.95, FLOOR + 0.08, -3.9), V3(-4.95, FLOOR + 2.05, -3.9), V3(-4.45, FLOOR + 2.05, -3.45)], V3(-4.45, FLOOR + 2.0, -3.45));
    branch('sanitario', [V3(-1.6, FLOOR + 0.08, -0.4), V3(-1.6, FLOOR + 0.08, -3.95), V3(-2.55, FLOOR + 0.08, -3.95), V3(-2.55, FLOOR + 0.5, -3.95)], V3(-2.55, FLOOR + 0.8, -3.75));
    branch('lavamanos', [V3(-1.6, FLOOR + 0.08, -0.4), V3(-1.6, FLOOR + 0.08, -1.0), V3(-3.6, FLOOR + 0.08, -1.0), V3(-3.6, FLOOR + 0.95, -1.0), V3(-3.6, FLOOR + 1.05, -1.25)], V3(-3.6, FLOOR + 1.0, -1.15));
    branch('cocina', [V3(1.6, FLOOR + 0.08, -0.4), V3(1.6, FLOOR + 0.08, -3.95), V3(3.0, FLOOR + 0.08, -3.95), V3(3.0, FLOOR + 1.12, -3.95), V3(3.0, FLOOR + 1.12, -3.7)], V3(3.0, FLOOR + 1.0, -3.62));
    branch('lavadora', [V3(4.95, FLOOR + 0.08, -0.4), V3(4.95, FLOOR + 0.08, -3.95), V3(6.1, FLOOR + 0.08, -3.95), V3(6.1, FLOOR + 1.0, -3.95)], V3(6.1, FLOOR + 1.1, -3.4));
    branch('manguera', [V3(4.95, FLOOR + 0.08, -0.4), V3(4.95, FLOOR + 0.08, 1.4), V3(5.25, FLOOR + 0.6, 1.4)], V3(5.4, FLOOR + 0.6, 1.4));
    // medidor en su caja del andén: cuerpo de bronce, carátula con tambores y agujas, la estrella de fugas
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.4), concreteMaterial('#b9b5ac'));
    box.position.set(-3.5, 0.0, 5.4);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 32), paint('#b08d3b', 0.3, 0.75));
    body.position.set(-3.5, 0.165, 5.4);
    this.meterFace = this.canvas(512, 512);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.068, 48), new THREE.MeshBasicMaterial({ map: this.meterFace.tex, toneMapped: false }));
    face.rotation.x = -Math.PI / 2;
    face.position.set(-3.5, 0.201, 5.4);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 48), glass(0.12, '#ffffff'));
    lens.rotation.x = -Math.PI / 2;
    lens.position.set(-3.5, 0.204, 5.4);
    this.star = new THREE.Mesh(new THREE.CircleGeometry(0.009, 6), new THREE.MeshBasicMaterial({ color: '#c0392b' }));
    this.star.rotation.x = -Math.PI / 2;
    this.star.position.set(-3.5 + 0.035, 0.203, 5.4 + 0.03);
    for (const o of [box, body]) o.castShadow = true;
    sc.add(box, body, face, lens, this.star);
    // tanque de agua lluvia, canoa, bajante y rebose
    sc.add(this.tankG);
    const gutter = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 11, 10, 1, true, 0, Math.PI), paint('#e8eaec', 0.4, 0.1));
    (gutter.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    gutter.rotation.z = Math.PI / 2;
    gutter.rotation.x = Math.PI;
    gutter.position.set(0, FLOOR + WALL_H - 0.1, 4.62);
    this.gutterG.add(gutter);
    sc.add(this.gutterG, this.rainKit);
    this.rainLine = new FlowPipe(roundedPath([V3(5.5, FLOOR + WALL_H - 0.12, 4.62), V3(5.85, FLOOR + WALL_H - 0.12, 4.62), V3(5.85, 2.3, 4.0), V3(5.85, 2.3, 2.4), V3(6.4, 2.3, 2.4)], 0.2), 0.04, '#e8eaec', { metal: 0.05, rough: 0.5, gain: 0.8, spacing: 0.3, tint: '#4fa3d8' });
    this.rainKit.add(this.rainLine.mesh);
    // separador del primer lavado: un tubo vertical que se llena primero
    const ff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 12), glass(0.3, '#e8f6ff'));
    ff.position.set(5.85, 1.65, 3.2);
    this.rainKit.add(ff);
    this.downJet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1, 8, 1, true), own(lookWater(new THREE.MeshStandardMaterial({ color: '#d6eefa', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }), [0, -3], 1)));
    this.overflowJet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1, 8, 1, true), own(lookWater(new THREE.MeshStandardMaterial({ color: '#d6eefa', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }), [0, -3], 1)));
    this.downJet.visible = this.overflowJet.visible = false;
    sc.add(this.downJet, this.overflowJet);
    this.rain = new RainStreaks({ x0: -12, x1: 14, z0: -10, z1: 12, top: 16 }, (x, z) => (Math.abs(x) < 5.6 && Math.abs(z) < 4.6 ? FLOOR + WALL_H + 0.8 : m.height(x, z)), 1800, 9, 0.5, [0.08, 0.03], 0.08);
    sc.add(this.rain.group);
    // jardín
    const ts: TreeSpot[] = [];
    const RT = rng(5);
    for (let k = 0; k < 28; k++) {
      const a = RT() * Math.PI * 2, d = 13 + RT() * 22;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z > 4 && z < 13) continue;
      ts.push({ x, y: m.height(x, z), z, r: 1.4 + RT() * 1.6 });
    }
    ts.push({ x: -7.5, y: 0, z: 2.5, r: 1.3 }, { x: 8.6, y: 0, z: -1.5, r: 1.5 });
    sc.add(trees(ts, 2));
    this.applyMode(mode);
    stage.view(this.views[mode === 'consumo' ? 'casa' : mode === 'factura' ? 'fachada' : 'tanque'], false);
  }

  private canvas(w: number, h: number) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d')!;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { tex, ctx };
  }

  private applyMode(mode: HouseMode): void {
    // en el modo de consumo la casa se corta a 1,3 m (como en un plano), para ver los aparatos desde arriba
    const k = mode === 'consumo' ? 0.5 : 1;
    for (const w of this.walls) {
      w.scale.y = k;
      w.position.y = FLOOR + (WALL_H * k) / 2;
    }
    this.clock.visible = mode !== 'consumo';
    this.roof.visible = mode !== 'consumo';
    this.frontWall.visible = mode !== 'consumo';
    this.tankG.visible = mode === 'lluvia';
    this.rainKit.visible = mode === 'lluvia';
    this.gutterG.visible = mode !== 'consumo';
  }

  private drawMeter(reading: number, leak: number): void {
    const { ctx: c, tex } = this.meterFace;
    const d = meterDigits(reading);
    c.fillStyle = '#fbfaf6';
    c.fillRect(0, 0, 512, 512);
    c.fillStyle = '#1d242b';
    c.font = '600 30px system-ui';
    c.textAlign = 'center';
    c.fillText('m³', 256, 96);
    // tambores
    c.fillStyle = '#1d242b';
    c.fillRect(126, 112, 260, 70);
    c.font = 'bold 54px ui-monospace, monospace';
    c.fillStyle = '#ffffff';
    for (let k = 0; k < 5; k++) c.fillText(d.drums[k], 152 + k * 52, 165);
    // agujas: ×0,1 y ×0,01 en negro, ×0,001 y ×0,0001 en rojo
    const dials = [[150, 300], [362, 300], [150, 410], [362, 410]];
    const lab = ['×0,1', '×0,01', '×0,001', '×0,0001'];
    dials.forEach(([x, y], k) => {
      c.strokeStyle = '#8a96a0';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x, y, 46, 0, Math.PI * 2);
      c.stroke();
      c.font = '16px system-ui';
      c.fillStyle = '#44505b';
      for (let n = 0; n < 10; n++) {
        const a = (n / 10) * Math.PI * 2 - Math.PI / 2;
        c.fillText(String(n), x + Math.cos(a) * 34, y + Math.sin(a) * 34 + 6);
      }
      const a = (d.needles[k] / 10) * Math.PI * 2 - Math.PI / 2;
      c.strokeStyle = k < 2 ? '#1d242b' : '#c0392b';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * 40, y + Math.sin(a) * 40);
      c.stroke();
      c.font = '15px system-ui';
      c.fillStyle = '#44505b';
      c.fillText(lab[k], x, y + 66);
    });
    c.font = '600 18px system-ui';
    c.fillStyle = leak > 0 ? '#c0392b' : '#44505b';
    c.fillText(leak > 0 ? 'la estrella gira: pasa agua' : 'estrella quieta', 256, 492);
    tex.needsUpdate = true;
  }

  private drawClock(hour: number): void {
    const { ctx: c, tex } = this.clockFace;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(128, 128, 124, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#2b3640';
    c.lineWidth = 8;
    c.stroke();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100);
      c.lineTo(128 + Math.sin(a) * 112, 128 - Math.cos(a) * 112);
      c.stroke();
    }
    const hA = ((hour % 12) / 12) * Math.PI * 2, mA = ((hour % 1) * Math.PI * 2);
    c.lineWidth = 10;
    c.beginPath();
    c.moveTo(128, 128);
    c.lineTo(128 + Math.sin(hA) * 60, 128 - Math.cos(hA) * 60);
    c.stroke();
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(128, 128);
    c.lineTo(128 + Math.sin(mA) * 95, 128 - Math.cos(mA) * 95);
    c.stroke();
    tex.needsUpdate = true;
  }

  private buildTank(V: number): void {
    clear(this.tankG);
    this.tankH = 1.5;
    this.tankR = Math.max(0.35, Math.sqrt(V / (Math.PI * this.tankH)));
    const r = this.tankR, h = this.tankH;
    const base = new THREE.Mesh(new THREE.BoxGeometry(2 * r + 0.4, 0.5, 2 * r + 0.4), concreteMaterial('#c9c6bf'));
    base.position.set(6.4 + r - 0.5, 0.25, 2.4);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40, 1, true), own(new THREE.MeshStandardMaterial({ color: '#2f6fa8', roughness: 0.4, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })));
    (shell.material as THREE.Material).userData.noLook = true;
    shell.position.set(6.4 + r - 0.5, 0.5 + h / 2, 2.4);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.06, 40), paint('#25588a', 0.5, 0.1));
    lid.position.set(6.4 + r - 0.5, 0.5 + h + 0.03, 2.4);
    for (const y of [0.35, 0.7]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.005, 0.015, 6, 40), paint('#25588a', 0.5, 0.1));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(6.4 + r - 0.5, 0.5 + h * y, 2.4);
      this.tankG.add(ring);
    }
    this.tankWater = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 1, 40), waterMat('#2f7fc0', 0.85));
    this.tankG.add(base, shell, lid, this.tankWater);
    // tubería de agua lluvia al sanitario (aparte del acueducto)
    const toToilet = new FlowPipe(roundedPath([V3(6.4 + r - 0.5 - r, 0.6, 2.4), V3(5.25, 0.6, 2.4), V3(5.25, FLOOR + 0.12, 2.4), V3(5.25, FLOOR + 0.12, -4.25), V3(-2.4, FLOOR + 0.12, -4.25), V3(-2.4, FLOOR + 0.7, -4.25)], 0.2), 0.013, '#5b9a43', { metal: 0.05, rough: 0.5, gain: 0.7, spacing: 0.25, tint: '#bff0c6' });
    toToilet.setFlow(0.3);
    this.tankG.add(toToilet.mesh);
    this.tankPipe = toToilet;
  }
  private tankPipe: FlowPipe | null = null;

  set(s: HouseState): void {
    const prev = this.st;
    this.st = s;
    if (!prev || prev.mode !== s.mode) this.applyMode(s.mode);
    if (s.tank) {
      const key = `${s.tank.V}`;
      if (key !== this.tankKey) {
        this.tankKey = key;
        this.buildTank(s.tank.V);
      }
      const r = this.tankR, h = this.tankH;
      const lvl = Math.max(0.005, Math.min(1, s.tank.S / Math.max(1e-9, s.tank.V))) * h;
      if (this.tankWater) {
        this.tankWater.scale.y = lvl;
        this.tankWater.position.set(6.4 + r - 0.5, 0.5 + lvl / 2, 2.4);
      }
      const raining = s.tank.rain > 0.5;
      this.rain.intensity = Math.min(1, s.tank.rain / 30);
      this.stage.weather(raining ? Math.min(0.8, 0.25 + s.tank.rain / 40) : 0);
      this.rainLine.setFlow(raining ? 0.6 : 0);
      this.downJet.visible = raining;
      this.downJet.position.set(6.4, 2.3 - 0.2, 2.4);
      this.downJet.scale.y = 0.4;
      this.overflowJet.visible = s.tank.spill;
      this.overflowJet.position.set(6.4 + 2 * r - 0.5 + 0.05, 0.5 + h * 0.5, 2.4);
      this.overflowJet.scale.y = h;
    } else {
      this.rain.intensity = 0;
      this.stage.weather(0);
    }
    // aparatos en uso a esta hora
    const hr = Math.floor(Math.max(0, Math.min(23.999, s.hour)));
    for (const f of this.fixtures) {
      const L = s.hrs ? s.hrs[f.use][hr] : 0;
      const daily = s.hrs ? s.hrs[f.use].reduce((a, b) => a + b, 0) : 0;
      const on = s.mode === 'consumo' && daily > 0 && L > daily * 0.06;
      f.pipe.setFlow(on ? 0.15 + Math.min(1.5, L / 60) : 0);
      if (f.use === 'ducha') this.showerStream.visible = on;
      if (f.use === 'lavamanos') this.basinStream.visible = on;
      if (f.use === 'cocina') this.sinkStream.visible = on;
      if (f.use === 'manguera') this.hoseStream.visible = on;
    }
    const totalNow = s.hrs ? (Object.keys(s.hrs) as Use[]).reduce((a, k) => a + s.hrs![k][hr], 0) : 0;
    this.main.setFlow(s.mode === 'consumo' ? Math.min(1.8, totalNow / 50) : s.leak > 0 ? 0.1 : 0);
    if (Math.abs(s.reading - this.lastDraw) > 2e-5 || this.lastDraw < 0) {
      this.drawMeter(s.reading, s.leak);
      this.lastDraw = s.reading;
    }
    this.drawClock(s.hour);
    this.labels(s);
  }

  private labels(s: HouseState): void {
    const hh = Math.floor(s.hour), mm = Math.floor((s.hour % 1) * 60);
    const L: StageLabel[] = [];
    if (s.mode === 'consumo' && s.hrs) {
      const hr = Math.min(23, hh);
      const now = (Object.keys(s.hrs) as Use[]).reduce((a, k) => a + s.hrs![k][hr], 0);
      L.push({ id: 'hora', text: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, sub: `${es(now, 0)} litros en esta hora`, at: V3(0, FLOOR + 2.6, -3.9), kind: 'dato', prio: 9 });
      const busy = (Object.keys(s.hrs) as Use[]).filter((k) => {
        const d = s.hrs![k].reduce((a, b) => a + b, 0);
        return d > 0 && s.hrs![k][hr] > d * 0.06;
      });
      for (const f of this.fixtures) if (busy.includes(f.use)) L.push({ id: f.use, text: f.use === 'ducha' ? 'Ducha' : f.use === 'sanitario' ? 'Sanitario' : f.use === 'lavamanos' ? 'Lavamanos' : f.use === 'cocina' ? 'Lavaplatos' : f.use === 'lavadora' ? 'Lavadora' : 'Manguera', sub: `${es(s.hrs[f.use][hr], 0)} L esta hora`, at: f.at.clone().add(V3(0, 0.5, 0)), kind: 'lugar', prio: 5 });
    }
    if (s.mode === 'factura') {
      L.push({ id: 'medidor', text: `Medidor: ${es(s.reading, 4)} m³`, sub: s.leak > 0 ? `la estrella gira: pasan ${es(s.leak, 1)} L/h` : 'tambores en m³, agujas en fracciones', at: V3(-3.5, 0.75, 5.4), kind: s.leak > 0 ? 'alerta' : 'dato', prio: 9 });
      L.push({ id: 'reloj', text: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, at: V3(1.2, FLOOR + 3.1, 4.3), kind: 'lugar', prio: 3 });
    }
    if (s.mode === 'lluvia' && s.tank) {
      const t = s.tank;
      L.push({ id: 'tanque', text: `Tanque: ${es(t.S * 1000, 0)} de ${es(t.V * 1000, 0)} L`, sub: t.spill ? 'lleno: rebosa' : t.S <= 1e-6 ? `vacío: el sanitario usa agua del acueducto` : `da ${es(t.D, 0)} L/día al sanitario`, at: V3(6.4 + this.tankR - 0.5, 0.5 + this.tankH + 0.6, 2.4), kind: t.spill ? 'dato' : t.S <= 1e-6 ? 'alerta' : 'ok', prio: 9 });
      L.push({ id: 'dia', text: t.label, sub: t.rain > 0.2 ? `llueven ${es(t.rain, 1)} mm` : 'sin lluvia', at: V3(0, FLOOR + WALL_H + 2.2, 0), kind: 'lugar', prio: 6 });
      L.push({ id: 'techo', text: `Techo que drena: ${es(t.A, 0)} m²`, sub: 'canoa, bajante y primer lavado', at: V3(-3, FLOOR + WALL_H + 0.4, 4.7), kind: 'lugar', prio: 3 });
    }
    this.stage.setLabels(L);
  }

  update(dt: number, t: number): void {
    const s = this.st;
    this.main.tick(dt);
    for (const f of this.fixtures) f.pipe.tick(dt);
    this.rainLine.tick(dt);
    this.tankPipe?.tick(dt);
    this.rain.update(dt);
    if (!s) return;
    // estrella del medidor: gira si pasa agua (fuga o consumo)
    const flowing = s.leak > 0 || (s.mode === 'consumo' && !!s.hrs);
    this.star.rotation.z += (flowing ? (s.leak > 0 ? 2 + s.leak * 0.4 : 6) : 0) * dt;
    // sanitario: se vacía y se llena; lavadora: gira si está en uso
    const hr = Math.floor(Math.max(0, Math.min(23.999, s.hour)));
    const busy = (u: Use) => !!s.hrs && s.mode === 'consumo' && s.hrs[u][hr] > s.hrs[u].reduce((a, b) => a + b, 0) * 0.06;
    const cyc = busy('sanitario') ? (t * 0.35) % 1 : 1;
    const lvl = cyc < 0.15 ? 1 - cyc / 0.15 : Math.min(1, (cyc - 0.15) / 0.6);
    this.toiletWater.scale.y = Math.max(0.02, lvl * 0.3);
    this.toiletWater.position.y = FLOOR + 0.45 + (lvl * 0.3) / 2;
    if (busy('lavadora')) this.drum.rotation.z += dt * 6;
    this.showerStream.scale.x = this.showerStream.scale.z = 1 + Math.sin(t * 25) * 0.05;
  }
}

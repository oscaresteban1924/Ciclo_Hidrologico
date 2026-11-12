// Mundos 3D de la sala «Bombas y energía del agua»: la estación que sube agua de un tanque de succión a un tanque
// en lo alto de una loma (bombas con su motor, válvulas, manómetros y el flujo que avanza por la tubería), la bomba
// de vidrio donde el agua hierve cuando le falta presión (burbujas que nacen en el ojo del rodete y revientan), y
// una pequeña central de pasada en un valle de montaña (bocatoma, canal, tubería de presión, casa de máquinas con su
// turbina, red y un pueblo que se ilumina). Alturas y diámetros a escala; los largos de tubería se acortan donde se
// dice.

import * as THREE from 'three';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { concreteMaterial, rng, tank } from '../../quality/three/kit';
import { lookMaterial, lookWater } from '../../three/look';
import { Birds, studioFloor, terrainBlock, trees, type TreeSpot } from '../../three/scenery';
import { CentrifugalPump, FlowPipe, Gauge, GateValve, LitHouses, PAINT, bankiRunner, flange, francisRunner, glass, kaplanRunner, paint, peltonWheel, powerPole, roundedPath, steel, wire, type LitHouse } from '../../three/machines';
import { es } from '../../canals/common';
import type { Arrangement, Turbine } from '../pump';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Quita y libera lo que tenga el grupo (geometrías y los materiales propios). */
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

const grassColor = (x: number, z: number, y: number) => {
  const n = Math.sin(x * 0.11 + z * 0.07) * 0.5 + Math.sin(x * 0.031 - z * 0.05) * 0.5;
  return new THREE.Color('#6f9b4c').lerp(new THREE.Color('#9db06a'), 0.25 + 0.2 * n + THREE.MathUtils.clamp(y / 120, 0, 0.3));
};

// ================================================================== 1. la estación de bombeo

export interface StationState {
  Q: number;
  H: number;
  Hs: number;
  D: number;
  Dname: string;
  arr: Arrangement;
  n: number;
  open: number;
  eta: number;
  Pshaft: number;
  V: number;
  flows: boolean;
  /** Altura que marca el manómetro de la descarga [m] (con caudal cero, la de la bomba cerrada). */
  pOut: number;
}

const WS = -0.8; // nivel del agua en el tanque de succión
const SLAB = 0.2; // piso de la casa de bombas
const PR = 0.32; // radio de la carcasa de las bombas
const AXIS = SLAB + PR * 1.9; // eje de las bombas
const SUMP: [number, number] = [-15.5, 0]; // centro del tanque de succión
const SUMP_W = 5;

/**
 * Estación de bombeo: tanque de succión enterrado, casa de bombas con una o dos bombas, válvulas y manómetros, y la
 * tubería de impulsión que sube la loma hasta el tanque alto. La loma tiene la altura real; la tubería, que en el
 * caso mide 450 m, se acorta en la maqueta.
 */
export class StationWorld {
  private stage: QStage;
  private site = new THREE.Group();
  private plant = new THREE.Group();
  private pumps: CentrifugalPump[] = [];
  private pipes: FlowPipe[] = [];
  private gauges: Gauge[] = [];
  private valve: GateValve | null = null;
  private jet: THREE.Mesh;
  private ring: THREE.Mesh;
  private tankWater: THREE.Mesh | null = null;
  private inflow: THREE.Mesh;
  private panel: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D } | null = null;
  private st: StationState | null = null;
  private key = '';
  private hx = { X0: 10, X1: 45, yp: 24, Xt: 53 };
  private outlet = V3(0, 0, 0);
  private discharge = V3(0, 0, 0);
  private shake = 0;
  readonly views: Record<'general' | 'bombas' | 'tanque', StageView> = {
    general: { eye: [40, 42, 80], target: [18, 10, 0], fit: 90 },
    bombas: { eye: [-2.6, 2.9, 8.4], target: [-7.2, 0.9, 0.3], fit: 11 },
    tanque: { eye: [62, 34, 18], target: [53, 24, 0], fit: 20 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(40);
    stage.controls.minDistance = 2;
    sc.add(this.site, this.plant);
    // casa de bombas (fija): losa, columnas y techo de lámina ondulada
    const house = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(11.6, SLAB + 0.5, 8.4), concreteMaterial('#c9c6bf'));
    slab.position.set(-6, SLAB / 2 - 0.25, 0);
    slab.receiveShadow = true;
    house.add(slab);
    const colMat = paint('#5d6973', 0.5, 0.4);
    for (const [x, z] of [[-11.5, -4], [-11.5, 4], [-0.5, -4], [-0.5, 4], [-6, -4]] as [number, number][]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.1, 0.2), colMat);
      c.position.set(x, SLAB + 2.05, z);
      c.castShadow = true;
      house.add(c);
    }
    const roofGeo = new THREE.PlaneGeometry(12.4, 9.2, 80, 2);
    const rp = roofGeo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < rp.count; k++) rp.setZ(k, Math.abs(Math.sin(rp.getX(k) * 7.5)) * 0.06);
    roofGeo.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeo, lookMaterial(new THREE.MeshStandardMaterial({ color: '#b9c1c7', roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide }), { detail: 0.06 }));
    roof.rotation.x = -Math.PI / 2 + 0.08;
    roof.position.set(-6, SLAB + 4.25, 0);
    roof.castShadow = true;
    house.add(roof);
    // baranda del tanque de succión
    const rail = paint('#e0b11e', 0.5, 0.2);
    for (const z of [-SUMP_W / 2 - 0.2, SUMP_W / 2 + 0.2]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(SUMP_W + 0.4, 0.05, 0.05), rail);
      r.position.set(SUMP[0], 1.3, z);
      house.add(r);
      for (const dx of [-2.6, 0, 2.6]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), rail);
        p.position.set(SUMP[0] + dx, 0.8, z);
        house.add(p);
      }
    }
    sc.add(house);
    // tanque de succión enterrado, su agua y el tubo que lo llena
    const sump = tank(SUMP_W, 3.6, SUMP_W, { wall: 0.3 });
    sump.position.set(SUMP[0], 0.3 - 3.6, SUMP[1]);
    sc.add(sump);
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(SUMP_W - 0.6, SUMP_W - 0.6, 24, 24), waterMat('#3d7fa6', 0.88, [0.05, 0.02], 0.5));
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(SUMP[0], WS, SUMP[1]);
    sc.add(sw);
    const feed = new FlowPipe(roundedPath([V3(SUMP[0] - 8, 0.6, -1.2), V3(SUMP[0] - 2.2, 0.6, -1.2), V3(SUMP[0] - 1.6, 0.2, -1.2)], 0.4), 0.15, PAINT.pipe);
    sc.add(feed.mesh);
    feed.setFlow(1);
    this.pipes.push(feed);
    this.inflow = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1, 12, 1, true), waterMat('#cfe8f5', 0.75, [0, -1.2], 0.9));
    this.inflow.position.set(SUMP[0] - 1.6, (0.15 + WS) / 2, -1.2);
    this.inflow.scale.y = 0.15 - WS;
    sc.add(this.inflow);
    // chorro y anillo de olas en el tanque alto
    this.jet = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), own(lookWater(new THREE.MeshStandardMaterial({ color: '#d8eef8', transparent: true, opacity: 0.8, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }), [0, -2], 1)));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    sc.add(this.jet, this.ring);
    // tablero del variador con su pantalla
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.9, 0.45), paint('#d7dbde', 0.55, 0.2));
    cab.position.set(-10.6, SLAB + 0.95, -3.4);
    cab.castShadow = true;
    sc.add(cab);
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const ctx = cv.getContext('2d')!;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    scr.position.set(-10.6, SLAB + 1.45, -3.17);
    sc.add(scr);
    this.panel = { tex, ctx };
    const birds = new Birds(V3(20, 0, -10), 60, 45, 6, 1.2);
    sc.add(birds.group);
    stage.animate((t) => birds.update(t));
    stage.view(this.views.general, false);
  }

  /** Cota del terreno: plano en la estación, la loma que sube hasta la meseta del tanque, y el pozo del tanque de succión. */
  private h = (x: number, z: number): number => {
    const { X0, X1, yp } = this.hx;
    if (Math.abs(x - SUMP[0]) < SUMP_W / 2 + 0.05 && Math.abs(z - SUMP[1]) < SUMP_W / 2 + 0.05) return -3.3;
    const u = THREE.MathUtils.smoothstep(x, X0, X1);
    const ridge = yp * u;
    // la loma se ensancha hacia los lados con ondulaciones suaves (no en el corredor de la tubería)
    const side = Math.max(0, Math.abs(z) - 4);
    const wav = (Math.sin(x * 0.09 + z * 0.13) + Math.sin(x * 0.041 - z * 0.07)) * 0.6 * THREE.MathUtils.smoothstep(side, 0, 10);
    const fall = u > 0 ? -Math.pow(side / 60, 2) * yp * 0.6 : 0;
    return ridge + wav + fall;
  };

  private build(s: StationState): void {
    clear(this.site);
    clear(this.plant);
    this.pipes.length = 1;
    this.gauges = [];
    this.pumps = [];
    // ---------------- el sitio: la loma, el tanque alto, la impulsión
    const yp = Math.max(4, s.Hs + WS - 3.2);
    const X0 = 10, X1 = X0 + THREE.MathUtils.clamp(s.Hs * 1.15, 26, 58), Xt = X1 + 9;
    this.hx = { X0, X1, yp, Xt };
    const tR = 4.4, tH = 3.6;
    const tb = terrainBlock(this.h, -34, Xt + 34, -36, 36, 150, 72, grassColor, -6);
    this.site.add(tb);
    const ts: TreeSpot[] = [];
    const RT = rng(11);
    for (let k = 0; k < 110 && ts.length < 64; k++) {
      const x = -30 + RT() * (Xt + 60), z = (RT() < 0.5 ? -1 : 1) * (9 + RT() * 25);
      if (x > -20 && x < Xt + 4 && Math.abs(z) < 9) continue;
      if (Math.hypot(x - Xt, z) < 15) continue;
      // el frente de la loma queda despejado para ver la tubería desde la cámara
      if (z > 0 && x > X0 - 6 && x < X1 + 4) continue;
      ts.push({ x, y: this.h(x, z), z, r: 1.4 + RT() * 1.4 });
    }
    this.site.add(trees(ts, 4));
    // servidumbre de la tubería: una franja de gravilla de la casa de bombas al tanque
    {
      const xa = -0.5, xb = Xt - tR - 1;
      const n = Math.round((xb - xa) / 0.8);
      const g = new THREE.PlaneGeometry(xb - xa, 2.6, n, 2);
      g.rotateX(-Math.PI / 2);
      g.translate((xa + xb) / 2, 0, 0.2);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) p.setY(k, this.h(p.getX(k), p.getZ(k)) + 0.05);
      g.computeVertexNormals();
      const strip = new THREE.Mesh(g, own(lookMaterial(new THREE.MeshStandardMaterial({ color: '#b3a68c', roughness: 1 }), { detail: 0.25, scale: 3 })));
      strip.receiveShadow = true;
      this.site.add(strip);
    }
    // tanque alto de concreto, abierto arriba para ver el agua
    
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(tR, tR, tH, 48, 1, true), concreteMaterial('#cfccc4'));
    (shell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    shell.position.set(Xt, yp + tH / 2, 0);
    shell.castShadow = shell.receiveShadow = true;
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(tR, tR, 0.3, 48), concreteMaterial('#c4c1b9'));
    bottom.position.set(Xt, yp + 0.15, 0);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(tR, 0.12, 8, 48), concreteMaterial('#d9d6ce'));
    lip.rotation.x = Math.PI / 2;
    lip.position.set(Xt, yp + tH, 0);
    this.tankWater = new THREE.Mesh(new THREE.CircleGeometry(tR - 0.08, 48), waterMat('#3b83ad', 0.9, [0.03, 0.01], 0.7));
    this.tankWater.rotation.x = -Math.PI / 2;
    this.tankWater.position.set(Xt, yp + 2.2, 0);
    // pedestal de tierra plana bajo el tanque
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(tR + 2.5, tR + 3.5, 1.5, 40), lookMaterial(new THREE.MeshStandardMaterial({ color: '#9a8c74', roughness: 1 }), { detail: 0.2 }));
    pad.position.set(Xt, yp - 0.74, 0);
    pad.receiveShadow = true;
    this.site.add(pad, shell, bottom, lip, this.tankWater);
    // la impulsión: de la casa de bombas por el piso y loma arriba, apoyada en silletas
    const r = s.D / 2;
    const yIn = s.Hs + WS; // cota de la entrega
    const pts: THREE.Vector3[] = [V3(-0.2, 1.8, 0.2), V3(1.2, 0.5, 0.2)];
    for (let x = 3; x < Xt - tR - 1.5; x += 2) pts.push(V3(x, Math.max(0.5, this.h(x, 0.2) + 0.45), 0.2));
    const xr = Xt - tR - 1.2;
    pts.push(V3(xr, Math.max(this.h(xr, 0.2) + 0.45, yIn), 0.2), V3(xr, yIn + 0.5, 0.2), V3(Xt - tR + 1.4, yIn + 0.5, 0.2), V3(Xt - tR + 1.4, yIn - 0.1, 0.2));
    const imp = new FlowPipe(roundedPath(pts, 0.9), r, '#d9dde0', { metal: 0.05, rough: 0.5, gain: 0.75 });
    this.site.add(imp.mesh);
    this.pipes.push(imp);
    this.outlet.set(Xt - tR + 1.4, yIn - 0.1, 0.2);
    const sad = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 1, 0.9), concreteMaterial('#bfbbb2'), 60);
    const M = new THREE.Matrix4();
    let ns = 0;
    for (let x = 3; x < xr - 1 && ns < 60; x += 4) {
      const y = this.h(x, 0.2);
      const top = Math.max(0.5, y + 0.45) - r;
      M.compose(V3(x, (top + y - 0.3) / 2, 0.2), new THREE.Quaternion(), V3(1, Math.max(0.2, top - y + 0.3), 1));
      sad.setMatrixAt(ns++, M);
    }
    sad.count = ns;
    sad.castShadow = true;
    this.site.add(sad);
    // ---------------- la casa de bombas: bombas, tubería de succión y de descarga, válvulas y manómetros
    const rs = 0.1; // succión de 8"
    const add = (curve: THREE.Curve<THREE.Vector3>, rad: number, v: number, color = '#5d7487') => {
      const p = new FlowPipe(curve, rad, color, { metal: 0.35, rough: 0.4, gain: 0.7, tint: '#7cc8ff' });
      this.plant.add(p.mesh);
      this.pipes.push(p);
      void v;
      return p;
    };
    const pumpAt = (x: number, z: number) => {
      const p = new CentrifugalPump({ R: PR });
      p.group.position.set(x, SLAB, z);
      this.plant.add(p.group);
      this.pumps.push(p);
      return { suc: p.suction.clone().add(p.group.position), dis: p.discharge.clone().add(p.group.position) };
    };
    const As = Math.PI * rs * rs, Ad = Math.PI * r * r;
    const q = s.flows ? s.Q / 1000 : 0;
    const xRise = SUMP[0] + SUMP_W / 2 - 0.8;
    const sumpRiser = [V3(xRise, -2.6, 0), V3(xRise, AXIS, 0)];
    // canastilla con válvula de pie al fondo del tanque de succión
    const strainer = new THREE.Mesh(new THREE.CylinderGeometry(rs * 1.9, rs * 1.9, 0.5, 18), paint('#4a5560', 0.6, 0.4));
    strainer.position.set(xRise, -2.85, 0);
    this.plant.add(strainer);
    let gaugeD = V3(0, 0, 0), gaugeS = V3(0, 0, 0);
    let header = V3(0, 0, 0);
    if (s.arr === 'una') {
      const a = pumpAt(-8.2, 0);
      add(roundedPath([...sumpRiser, a.suc], 0.35), rs, q / As);
      header = V3(-5.2, 1.8, a.dis.z);
      add(roundedPath([a.dis, V3(a.dis.x, 1.8, a.dis.z), header], 0.3), r, q / Ad);
      gaugeD = V3(a.dis.x + 0.02, 1.35, a.dis.z + r + 0.16);
      gaugeS = V3(a.suc.x - 0.6, AXIS + rs + 0.2, 0.16);
    } else if (s.arr === 'serie') {
      const a = pumpAt(-9.7, 0);
      const b = pumpAt(-5.9, 0);
      add(roundedPath([...sumpRiser, a.suc], 0.35), rs, q / As);
      add(roundedPath([a.dis, V3(a.dis.x, 1.75, a.dis.z), V3(b.suc.x - 1.1, 1.75, a.dis.z), V3(b.suc.x - 1.1, AXIS, 0), b.suc], 0.3), rs, q / As);
      header = V3(-3.4, 1.8, b.dis.z);
      add(roundedPath([b.dis, V3(b.dis.x, 1.8, b.dis.z), header], 0.3), r, q / Ad);
      gaugeD = V3(b.dis.x + 0.02, 1.35, b.dis.z + r + 0.16);
      gaugeS = V3(a.suc.x - 0.6, AXIS + rs + 0.2, 0.16);
    } else {
      const a = pumpAt(-8.2, -1.4);
      const b = pumpAt(-8.2, 1.4);
      const xh = -10.3;
      add(roundedPath([...sumpRiser, V3(xh, AXIS, 0)], 0.35), rs * 1.25, q / (Math.PI * (rs * 1.25) ** 2));
      for (const p of [a, b]) {
        add(roundedPath([V3(xh, AXIS, 0), V3(xh, AXIS, p.suc.z), p.suc], 0.25), rs, q / 2 / As);
        add(roundedPath([p.dis, V3(p.dis.x, 1.8, p.dis.z), V3(-5.6, 1.8, p.dis.z), V3(-5.6, 1.8, 0.2)], 0.25), r * 0.8, q / 2 / (Math.PI * (r * 0.8) ** 2));
      }
      header = V3(-5.6, 1.8, 0.2);
      gaugeD = V3(b.dis.x + 0.02, 1.35, b.dis.z + r + 0.16);
      gaugeS = V3(xh + 0.5, AXIS + rs * 1.25 + 0.2, 0.18);
    }
    // de la descarga a la salida de la casa: válvula de retención, válvula de compuerta y la impulsión
    add(roundedPath([header, V3(-0.2, 1.8, 0.2)], 0.3), r, q / Ad);
    const check = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.5, r * 1.5, r * 3.2, 18), paint('#3e4a55', 0.5, 0.4));
    check.rotation.z = Math.PI / 2;
    check.position.set(-3.0, 1.8, 0.2);
    this.plant.add(check, flange(r, V3(-3.0 - r * 1.7, 1.8, 0.2), V3(1, 0, 0)), flange(r, V3(-3.0 + r * 1.7, 1.8, 0.2), V3(1, 0, 0)));
    this.valve = new GateValve(Math.max(0.06, r));
    this.valve.group.position.set(-1.6, 1.8, 0.2);
    this.valve.setOpen(s.open);
    this.plant.add(this.valve.group);
    // manómetros: a la descarga (m de columna de agua) y a la succión (vacío)
    const gD = new Gauge(0, s.arr === 'serie' ? 120 : 60, 'm c.a.', { r: 0.13, title: 'descarga', step: s.arr === 'serie' ? 20 : 10 });
    gD.group.position.copy(gaugeD);
    const gS = new Gauge(-10, 0, 'm c.a.', { r: 0.11, title: 'succión', step: 2, red: [-10, -7] });
    gS.group.position.copy(gaugeS);
    this.plant.add(gD.group, gS.group);
    this.gauges = [gD, gS];
    this.discharge.copy(gaugeD);
    this.views.general = { eye: [Xt * 0.42 + 6, yp * 0.75 + 22, Xt * 0.62 + 26], target: [Xt * 0.4, yp * 0.4, 0], fit: Xt * 0.85 + 18, portrait: { eye: [Xt * 0.4, yp + 50, Xt + 60], target: [Xt * 0.4, yp * 0.35, 0] } };
    this.views.tanque = { eye: [Xt + 12, yp + 12, 17], target: [Xt - 1, yp + 2, 0], fit: 20 };
  }

  set(s: StationState): void {
    const key = `${s.arr}|${s.D}|${s.Hs}`;
    const first = this.st === null;
    this.st = s;
    if (key !== this.key) {
      this.key = key;
      this.build(s);
      if (first) this.stage.view(this.views.general, false);
    }
    const q = s.flows ? s.Q / 1000 : 0;
    const As = Math.PI * 0.1 * 0.1, Ad = Math.PI * (s.D / 2) ** 2;
    this.rescale(q, As, Ad);
    this.valve?.setOpen(s.open);
    this.gauges[0]?.set(s.pOut);
    // en la succión: el agua está 1,6 m por debajo del eje, más las pérdidas y la energía de la velocidad
    const vs = q / As;
    this.gauges[1]?.set(WS - AXIS - (vs * vs) / (2 * 9.81) * 2.5);
    this.drawPanel(s);
    this.labels(s);
  }

  /** Reparte el caudal de ahora por los tramos (en paralelo cada bomba lleva la mitad). */
  private rescale(q: number, As: number, Ad: number): void {
    const s = this.st!;
    const r = s.D / 2;
    // mismo orden en que build() crea los tramos: llenado, impulsión y los de la casa de bombas
    const sp: number[] = [1, q / Ad];
    if (s.arr === 'una') sp.push(q / As, q / Ad);
    else if (s.arr === 'serie') sp.push(q / As, q / As, q / Ad);
    else {
      sp.push(q / (Math.PI * (0.125 ** 2)));
      for (let k = 0; k < 2; k++) sp.push(q / 2 / As, q / 2 / (Math.PI * (r * 0.8) ** 2));
    }
    sp.push(q / Ad);
    for (let k = 0; k < this.pipes.length; k++) this.pipes[k].setFlow(sp[k] ?? 0);
  }

  private drawPanel(s: StationState): void {
    if (!this.panel) return;
    const { ctx: c, tex } = this.panel;
    c.fillStyle = '#0f1a14';
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#7dffa8';
    c.font = 'bold 30px ui-monospace, monospace';
    c.textAlign = 'left';
    c.fillText(`${Math.round(1750 * s.n)} rpm`, 14, 46);
    c.fillText(`${es(s.Pshaft * (s.arr === 'una' ? 1 : 1), 1)} kW`, 14, 92);
    c.font = '16px ui-monospace, monospace';
    c.fillStyle = '#4fbf78';
    c.fillText(`${es(s.n * 60, 0)} Hz`, 180, 46);
    c.fillText('variador', 166, 92);
    tex.needsUpdate = true;
  }

  private labels(s: StationState): void {
    const { yp, Xt } = this.hx;
    const p0 = this.pumps[this.pumps.length - 1]?.group.position ?? V3(-8, 0, 0);
    const L: StageLabel[] = [
      {
        id: 'bomba',
        text: s.flows ? `${es(s.Q, 1)} L/s a ${es(s.H, 1)} m` : 'La bomba gira, pero el agua no llega',
        sub: s.flows ? `eficiencia ${es(s.eta * 100, 0)} % · ${es(s.Pshaft, 1)} kW en el eje` : 'no alcanza la altura del tanque: el agua se calienta adentro',
        at: V3(p0.x, AXIS + 1.6, p0.z),
        kind: s.flows ? (s.eta >= 0.7 ? 'ok' : 'dato') : 'alerta',
        prio: 9,
      },
      { id: 'tanque', text: `Tanque alto: ${es(s.Hs, 0)} m más arriba`, sub: `tubería de ${s.Dname}, 450 m (acortada en la maqueta)`, at: V3(Xt, yp + 5.4, 0), kind: 'lugar', prio: 6 },
      { id: 'succion', text: 'Tanque de succión', sub: 'el agua está 1,6 m bajo el eje de la bomba', at: V3(SUMP[0], 1.9, 0), kind: 'lugar', prio: 3 },
    ];
    if (s.open < 0.999) L.push({ id: 'valvula', text: `Válvula abierta al ${es(s.open * 100, 0)} %`, sub: 'la energía que frena se pierde en calor', at: V3(-1.6, 2.9, 0.2), kind: 'dato', prio: 5 });
    if (Math.abs(s.n - 1) > 0.005) L.push({ id: 'variador', text: `Motor a ${es(1750 * s.n, 0)} rpm`, sub: 'el variador cambia la velocidad', at: V3(-10.6, SLAB + 2.4, -3.4), kind: 'dato', prio: 4 });
    this.stage.setLabels(L);
  }

  update(dt: number, t: number): void {
    const s = this.st;
    for (const p of this.pipes) p.tick(dt);
    for (const g of this.gauges) g.tick(dt, t);
    this.valve?.tick(dt);
    if (!s) return;
    const w = 7 * s.n;
    for (const p of this.pumps) p.spin(dt, w);
    // vibración leve cuando la bomba trabaja lejos de su mejor punto o sin flujo
    this.shake += ((s.flows ? Math.max(0, 0.72 - s.eta) * 0.02 : 0.012) - this.shake) * Math.min(1, dt * 2);
    for (const p of this.pumps) p.group.position.y = SLAB + Math.sin(t * 61) * this.shake * 0.4;
    // chorro que cae al tanque alto
    const q = s.flows ? s.Q / 1000 : 0;
    const surf = this.hx.yp + 2.2;
    const fall = Math.max(0.05, this.outlet.y - surf);
    const rj = q > 0 ? Math.max(0.03, Math.min(s.D / 2, Math.sqrt(q / Math.PI / Math.max(0.5, Math.sqrt(2 * 9.81 * fall)))) * 1.3) : 0;
    this.jet.visible = rj > 0;
    this.jet.scale.set(rj, fall, rj);
    this.jet.position.set(this.outlet.x, surf + fall / 2, this.outlet.z);
    const ph = (t * 1.3) % 1;
    this.ring.visible = rj > 0;
    this.ring.position.set(this.outlet.x, surf + 0.02, this.outlet.z);
    this.ring.scale.setScalar(rj * 3 + ph * 1.6);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - ph);
  }
}

// ================================================================== 2. la bomba de vidrio

export interface CavState {
  zs: number;
  T: number;
  Q: number;
  NPSHa: number;
  NPSHr: number;
  margin: number;
  cav: number;
  state: 'ok' | 'justo' | 'cavita';
  patm: number;
  pv: number;
  pIn: number;
  place: string;
  z: number;
  hfs: number;
}

const WELL: [number, number, number, number] = [-4.6, -0.9, -8.6, 4.4]; // x0, x1, fondo, borde del pozo
const CR = 0.55; // radio de la carcasa de vidrio

/**
 * Corte de una estación: pozo húmedo con frente de vidrio (el nivel del agua sube y baja respecto al eje de la
 * bomba), la tubería de succión transparente con el agua coloreada por su presión, la bomba de vidrio con su rodete,
 * las flechas de la atmósfera sobre el agua y el termómetro. Si falta presión, nacen burbujas en el ojo del rodete.
 */
export class CavitationWorld {
  private stage: QStage;
  private pump: CentrifugalPump;
  private water: THREE.Mesh;
  private waterBody: THREE.Mesh;
  private arrows = new THREE.Group();
  private bubbles: THREE.InstancedMesh;
  private bub: { r: number; a: number; age: number; life: number; x: number; s: number }[] = [];
  private pipeIn: THREE.Mesh | null = null;
  private pipeColors: THREE.BufferAttribute | null = null;
  private pipePath: THREE.CurvePath<THREE.Vector3>;
  private flow: FlowPipe;
  private thermo: THREE.Mesh;
  private gauge: Gauge | null = null;
  private gaugeT = -99;
  private steam: THREE.InstancedMesh;
  private steamSeed: { x: number; z: number; v: number; p: number }[] = [];
  private st: CavState | null = null;
  private level = -3;
  readonly views: Record<'general' | 'bomba' | 'pozo', StageView> = {
    general: { eye: [3.5, 2.2, 17], target: [-1, -2, 0], fit: 15, portrait: { eye: [2, 2, 26], target: [-1, -2, 0] } },
    bomba: { eye: [-0.7, 1.15, 2.7], target: [1.0, 0.45, 0], fit: 3.8 },
    pozo: { eye: [-1, 1, 11], target: [-2.8, -3.5, 0], fit: 10 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(12);
    stage.controls.minDistance = 1.2;
    const [x0, x1, yb, yt] = WELL;
    // pozo húmedo: fondo, pared de atrás, paredes laterales y frente de vidrio
    const conc = concreteMaterial('#c8c4bb');
    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, m: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      b.position.set(x, y, z);
      b.castShadow = b.receiveShadow = true;
      sc.add(b);
      return b;
    };
    const W = x1 - x0, D = 3.2;
    box(W + 0.6, 0.4, D + 0.6, (x0 + x1) / 2, yb - 0.2, 0, conc);
    box(W + 0.6, yt - yb, 0.3, (x0 + x1) / 2, (yt + yb) / 2, -D / 2 - 0.15, conc);
    box(0.3, yt - yb, D, x0 - 0.15, (yt + yb) / 2, 0, conc);
    box(0.3, yt - yb, D, x1 + 0.15, (yt + yb) / 2, 0, conc);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, yt - yb), glass(0.1));
    front.position.set((x0 + x1) / 2, (yt + yb) / 2, D / 2);
    sc.add(front);
    // marcas de nivel cada metro en la pared del fondo
    const ticks = new THREE.Group();
    for (let y = Math.ceil(yb); y <= Math.floor(yt); y++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(y === 0 ? 0.8 : 0.4, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: y === 0 ? '#c0392b' : '#2b3640' }));
      m.position.set(x0 + 0.3, y, -D / 2 + 0.02);
      ticks.add(m);
    }
    sc.add(ticks);
    // cuarto seco de la bomba: losa al nivel del eje y piso del terreno arriba
    box(4.6, 0.3, D + 0.6, x1 + 2.45, -CR * 1.9 - 0.15, 0, conc);
    box(4.6, 0.3, D + 0.6, x1 + 2.45, yt - 0.15, -D / 2 - 0.4, conc);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 30), lookMaterial(new THREE.MeshStandardMaterial({ color: '#7f9b56', roughness: 1 }), { detail: 0.15, patches: 0.1 }));
    ground.position.set(2, yt + 0.25, -17);
    ground.receiveShadow = true;
    sc.add(ground, studioFloor(0, 0, 14, yb - 0.45));
    // agua del pozo: superficie con ondas y el cuerpo de agua visto por el vidrio
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 20, 14), waterMat('#3f86b0', 0.85, [0.04, 0.02], 0.7));
    this.water.rotation.x = -Math.PI / 2;
    this.waterBody = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, 1, D - 0.02), own(new THREE.MeshStandardMaterial({ color: '#3a8bbd', transparent: true, opacity: 0.32, roughness: 0.2, depthWrite: false })));
    (this.waterBody.material as THREE.Material).userData.noLook = true;
    sc.add(this.water, this.waterBody, this.arrows);
    // flechas de la atmósfera
    const arrowMat = new THREE.MeshStandardMaterial({ color: '#7d55c7', roughness: 0.4, transparent: true, opacity: 0.85 });
    arrowMat.userData.noLook = true;
    for (const [ax, az] of [[-3.7, -0.7], [-2.7, 0.6], [-1.8, -0.5]] as [number, number][]) {
      const a = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 10), arrowMat);
      shaft.position.y = 0.5 + 0.22;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 14), arrowMat);
      head.rotation.x = Math.PI;
      head.position.y = 0.18;
      a.add(shaft, head);
      a.position.set(ax, 0, az);
      this.arrows.add(a);
    }
    // bomba de vidrio en el cuarto seco
    this.pump = new CentrifugalPump({ R: CR, glass: true, motorLen: CR * 2.6 });
    this.pump.group.position.set(1.0, -CR * 1.9, 0);
    sc.add(this.pump.group);
    // tubería de succión: entra al pozo, baja a la boca de campana cerca del fondo
    const suc = this.pump.suction.clone().add(this.pump.group.position);
    const xi = -2.6;
    this.pipePath = roundedPath([V3(xi, yb + 0.9, 0), V3(xi, suc.y, 0), suc], 0.6);
    this.flow = new FlowPipe(this.pipePath, 0.2, '#b8c4cc', { tint: '#e6f6ff', spacing: 0.9, metal: 0.1, rough: 0.2 });
    (this.flow.mesh.material as THREE.MeshStandardMaterial).transparent = true;
    (this.flow.mesh.material as THREE.MeshStandardMaterial).opacity = 0.32;
    (this.flow.mesh.material as THREE.MeshStandardMaterial).depthWrite = false;
    this.flow.mesh.castShadow = false;
    sc.add(this.flow.mesh);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 0.4, 24, 1, true), paint('#5b6670', 0.5, 0.4));
    (bell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    bell.position.set(xi, yb + 0.72, 0);
    sc.add(bell, flange(0.2, V3(suc.x + 0.05, suc.y, 0), V3(1, 0, 0)));
    // agua dentro de la succión, coloreada por su presión absoluta
    const inner = new THREE.TubeGeometry(this.pipePath, 160, 0.17, 12, false);
    const cols = new Float32Array((inner.attributes.position as THREE.BufferAttribute).count * 3);
    inner.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.pipeColors = inner.attributes.color as THREE.BufferAttribute;
    const innerMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.82, roughness: 0.2, depthWrite: false });
    innerMat.userData.noLook = true;
    this.pipeIn = new THREE.Mesh(inner, innerMat);
    sc.add(this.pipeIn);
    // burbujas de vapor en el rodete
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.9, emissive: '#cfefff', emissiveIntensity: 0.25 }), 260);
    (this.bubbles.material as THREE.Material).userData.noLook = true;
    this.bubbles.frustumCulled = false;
    this.bubbles.count = 0;
    sc.add(this.bubbles);
    // termómetro en la pared del pozo
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 14), glass(0.3, '#ffffff'));
    tube.position.set(x1 - 0.35, yt - 2.2, -D / 2 + 0.25);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshStandardMaterial({ color: '#d0392b', roughness: 0.3 }));
    bulb.position.set(x1 - 0.35, yt - 3.75, -D / 2 + 0.25);
    this.thermo = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 10), new THREE.MeshStandardMaterial({ color: '#d0392b', roughness: 0.3, emissive: '#5a0e08' }));
    this.thermo.position.set(x1 - 0.35, 0, -D / 2 + 0.25);
    sc.add(tube, bulb, this.thermo);
    // vapor que sube del agua caliente
    this.steam = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false }), 40);
    this.steam.frustumCulled = false;
    const RS = rng(4);
    for (let k = 0; k < 40; k++) this.steamSeed.push({ x: x0 + 0.3 + RS() * (W - 0.6), z: -D / 2 + 0.3 + RS() * (D - 0.6), v: 0.3 + RS() * 0.4, p: RS() });
    sc.add(this.steam);
    stage.view(this.views.general, false);
  }

  set(s: CavState): void {
    this.st = s;
    // manómetro de presión absoluta en la entrada, con la zona roja hasta la presión de vapor
    if (Math.abs(s.T - this.gaugeT) > 1.5 || !this.gauge) {
      if (this.gauge) this.stage.scene.remove(this.gauge.group);
      this.gauge = new Gauge(0, 110, 'kPa abs.', { r: 0.2, title: 'entrada', red: [0, Math.max(1, s.pv)], step: 20 });
      const suc = this.pump.suction.clone().add(this.pump.group.position);
      this.gauge.group.position.set(suc.x - 0.55, suc.y + 0.55, 0.24);
      this.stage.scene.add(this.gauge.group);
      this.gaugeT = s.T;
    }
    this.gauge.set(Math.max(0, s.pIn));
    this.flow.setFlow((s.Q / 1000) / (Math.PI * 0.1 ** 2));
    // termómetro: de 0 a 100 °C en 3 m
    const [, x1, , yt] = WELL;
    const hT = 0.1 + (s.T / 100) * 2.8;
    this.thermo.scale.y = hT;
    this.thermo.position.set(x1 - 0.35, yt - 3.7 + hT / 2, -3.2 / 2 + 0.25);
    // flechas de la atmósfera: largo proporcional a la presión
    for (const a of this.arrows.children) a.scale.set(1, 0.4 + (s.patm / 101.3) * 1.1, 1);
    this.colorPipe(s);
    this.labels(s);
  }

  /** Color del agua en la succión: azul con presión de sobra; rojo cerca de la presión de vapor. */
  private colorPipe(s: CavState): void {
    if (!this.pipeColors || !this.pipeIn) return;
    const pos = (this.pipeIn.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const hi = new THREE.Color('#2f7fc0'), mid = new THREE.Color('#9fd3e6'), lo = new THREE.Color('#e0503c'), c = new THREE.Color();
    const len = this.pipePath.getLength();
    const segs = 160, radial = 12;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const y = this.pipePath.getPointAt(u).y;
      // presión absoluta [kPa]: atmósfera + agua sobre el punto − pérdidas acumuladas − energía de la velocidad
      const p = s.patm + 9.81 * (s.zs - y) - 9.81 * s.hfs * u - 9.81 * ((s.Q / 1000 / (Math.PI * 0.1 ** 2)) ** 2 / (2 * 9.81)) * Math.min(1, u * 8);
      const k = THREE.MathUtils.clamp((p - s.pv) / Math.max(5, s.patm - s.pv), 0, 1);
      if (k > 0.5) c.copy(mid).lerp(hi, (k - 0.5) * 2);
      else c.copy(lo).lerp(mid, k * 2);
      for (let j = 0; j <= radial; j++) this.pipeColors.setXYZ(i * (radial + 1) + j, c.r, c.g, c.b);
    }
    void len;
    void pos;
    this.pipeColors.needsUpdate = true;
  }

  private labels(s: CavState): void {
    const pumpTop = this.pump.group.position.clone().add(V3(0.6, CR * 1.9 + 1.4, 0));
    const L: StageLabel[] = [
      {
        id: 'estado',
        text: s.state === 'cavita' ? 'El agua hierve en el rodete' : s.state === 'justo' ? 'Al borde: casi hierve' : 'El agua entra sin hervir',
        sub: `margen de NPSH ${es(s.margin, 2)} m · entra a ${es(Math.max(0, s.pIn), 0)} kPa (hierve a ${es(s.pv, 1)})`,
        at: pumpTop,
        kind: s.state === 'cavita' ? 'alerta' : s.state === 'justo' ? 'dato' : 'ok',
        prio: 9,
      },
      { id: 'atm', text: `${s.place}: ${es(s.patm, 1)} kPa`, sub: 'la atmósfera empuja el agua hacia la bomba', at: V3(-2.7, this.level + 2.1, 0.6), kind: 'dato', prio: 6 },
      { id: 'nivel', text: s.zs >= 0 ? `Agua ${es(s.zs, 1)} m sobre el eje` : `Agua ${es(-s.zs, 1)} m bajo el eje`, sub: s.zs >= 0 ? 'bomba ahogada' : 'la bomba succiona', at: V3(WELL[0] + 0.5, this.level + 0.3, 1.2), kind: 'lugar', prio: 5 },
      { id: 'temp', text: `${es(s.T, 0)} °C`, sub: 'temperatura del agua', at: V3(WELL[1] - 0.35, WELL[3] - 0.4, -1.3), kind: 'dato', prio: 3 },
    ];
    this.stage.setLabels(L);
  }

  update(dt: number, t: number): void {
    const s = this.st;
    this.flow.tick(dt);
    this.gauge?.tick(dt, t);
    if (!s) return;
    // el nivel del agua se mueve suave hacia el pedido
    this.level += (s.zs - this.level) * Math.min(1, dt * 3);
    const [, , yb] = WELL;
    this.water.position.set((WELL[0] + WELL[1]) / 2, this.level, 0);
    const hB = Math.max(0.01, this.level - yb);
    this.waterBody.scale.y = hB;
    this.waterBody.position.set((WELL[0] + WELL[1]) / 2, yb + hB / 2, 0);
    for (const a of this.arrows.children) a.position.y = this.level + 0.05 + Math.sin(t * 2 + a.position.x) * 0.03;
    // el agua tibia se tiñe un poco; el vapor sube si está caliente
    const warm = THREE.MathUtils.smoothstep(s.T, 35, 95);
    ((this.waterBody.material as THREE.MeshStandardMaterial).color as THREE.Color).set('#3a8bbd').lerp(new THREE.Color('#7fb6c9'), warm * 0.5);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    let n = 0;
    if (s.T > 50) {
      for (const sd of this.steamSeed) {
        const ph = (t * sd.v + sd.p) % 1;
        const sz = 0.12 + ph * 0.4;
        M.compose(P.set(sd.x + Math.sin(t + sd.p * 9) * 0.2, this.level + ph * 2.2, sd.z), Q, S.setScalar(sz * THREE.MathUtils.smoothstep(s.T, 50, 90)));
        this.steam.setMatrixAt(n++, M);
      }
    }
    this.steam.count = n;
    this.steam.instanceMatrix.needsUpdate = true;
    // rodete y vibración
    this.pump.spin(dt, 9);
    const jit = s.cav * 0.006;
    this.pump.group.position.set(1.0 + Math.sin(t * 73) * jit, -CR * 1.9 + Math.sin(t * 91) * jit, Math.sin(t * 57) * jit * 0.5);
    // burbujas: nacen en el ojo del rodete (baja presión) y revientan al llegar a la zona de alta presión
    const want = Math.round(s.cav * 240 + (s.state === 'justo' ? 14 : 0));
    while (this.bub.length < want) this.bub.push({ r: 0.12 + Math.random() * 0.2, a: Math.random() * Math.PI * 2, age: 0, life: 0.25 + Math.random() * 0.5, x: (Math.random() - 0.5) * 0.18, s: 0.012 + Math.random() * 0.03 });
    if (this.bub.length > want) this.bub.length = want;
    const c = this.pump.rotor.getWorldPosition(new THREE.Vector3());
    let k = 0;
    for (const b of this.bub) {
      b.age += dt;
      if (b.age > b.life) {
        b.age = 0;
        b.r = 0.1 + Math.random() * 0.2;
        b.a = Math.random() * Math.PI * 2;
      }
      const u = b.age / b.life;
      const rr = (b.r + u * 0.35) * CR;
      const a = b.a - u * 2.2 + this.pump.rotor.rotation.x;
      // crece al principio y revienta al final
      const sz = b.s * 1.6 * (u < 0.75 ? 0.6 + u : Math.max(0, (1 - u) * 6));
      M.compose(P.set(c.x - 0.16 - Math.abs(b.x) * CR * 0.5, c.y + Math.cos(a) * rr, c.z + Math.sin(a) * rr), Q, S.setScalar(sz));
      this.bubbles.setMatrixAt(k++, M);
    }
    this.bubbles.count = k;
    this.bubbles.instanceMatrix.needsUpdate = true;
  }
}

// ================================================================== 3. la central hidroeléctrica

export interface HydroState {
  Hg: number;
  D: number;
  Qd: number;
  Qriver: number;
  Qt: number;
  Qeco: number;
  P: number;
  turbine: Turbine;
  homesNow: number;
  inRange: boolean;
  lossPct: number;
  eta: number;
}

const SLOPE = 0.577; // ladera de 30°: la tubería de presión mide unas dos veces la caída
/** Hogares que representa cada casa de la maqueta. */
export const HOMES_PER_HOUSE = 60;

/**
 * Valle de montaña con un río de pasada: bocatoma con su azud, canal de conducción por la ladera, cámara de carga,
 * tubería de presión, casa de máquinas con la turbina a la vista, descarga al río, red eléctrica y un pueblo. El
 * tramo del río entre la bocatoma y la descarga lleva menos agua (la que se deja en el río más lo que sobra).
 */
export class HydroWorld {
  private stage: QStage;
  private site = new THREE.Group();
  private river: THREE.Mesh[] = [];
  private canalWater: THREE.Mesh | null = null;
  private tail: THREE.Mesh | null = null;
  private weirSheet: THREE.Mesh | null = null;
  private pen: FlowPipe | null = null;
  private runner = new THREE.Group();
  private jet: THREE.Mesh | null = null;
  private village: LitHouses | null = null;
  private pulses: THREE.InstancedMesh | null = null;
  private wires: THREE.CatmullRomCurve3[] = [];
  private st: HydroState | null = null;
  private key = '';
  private g = { Lr: 220, Hg: 90, zf: 160, xPh: 220 };
  private spin = 0;
  private pulse = 0;
  readonly views: Record<'general' | 'casa' | 'bocatoma' | 'pueblo', StageView> = {
    general: { eye: [260, 220, 330], target: [110, 40, 60], fit: 360 },
    casa: { eye: [250, 18, 40], target: [222, 4, 14], fit: 34 },
    bocatoma: { eye: [30, 110, 40], target: [0, 90, 4], fit: 40 },
    pueblo: { eye: [300, 30, -80], target: [270, 2, -40], fit: 80 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    stage.setShadowSpan(120);
    stage.controls.minDistance = 4;
    stage.scene.add(this.site);
    const birds = new Birds(V3(120, 0, 40), 140, 80, 7, 3);
    stage.scene.add(birds.group);
    stage.animate((t) => birds.update(t));
    stage.view(this.views.general, false);
  }

  /** Lecho del río: baja la caída entre la bocatoma (x = 0) y la casa de máquinas (x = Lr), y sigue suave. */
  private yr = (x: number): number => {
    const { Lr, Hg } = this.g;
    if (x <= 0) return Hg + -x * 0.02;
    if (x <= Lr) return Hg * (1 - x / Lr);
    return -(x - Lr) * 0.012;
  };
  /** Terreno: el valle con el río al fondo, la ladera norte (+z) donde va el canal y una ladera sur más baja. */
  private h = (x: number, z: number): number => {
    const bed = this.yr(x);
    const w = 7;
    const az = Math.abs(z);
    let y: number;
    if (az < w) y = bed - 1.6 * (1 - (az / w) ** 2);
    else if (z > 0) y = bed + (z - w) * SLOPE;
    else y = bed + (az - w) * 0.32;
    const n = Math.sin(x * 0.03 + z * 0.05) * 2 + Math.sin(x * 0.011 - z * 0.023) * 4;
    const fade = THREE.MathUtils.smoothstep(az, w + 4, w + 40);
    // plano para el pueblo y la casa de máquinas
    const { Lr } = this.g;
    if (x > Lr + 20 && z < -12 && z > -70) y = Math.min(y, bed + 1.2 + Math.max(0, -z - 60) * 0.3);
    if (Math.abs(x - Lr) < 11 && z > 7.5 && z < 25) y = Math.min(y, 1.1);
    return y + n * fade * (z > 0 ? 1 : 0.6);
  };

  private build(s: HydroState): void {
    clear(this.site);
    this.river = [];
    this.wires = [];
    const Hg = s.Hg;
    const Lr = Math.max(170, 2.4 * Hg);
    const zf = Hg / SLOPE + 7;
    this.g = { Lr, Hg, zf, xPh: Lr };
    const x0 = -70, x1 = Lr + 130, z0 = -95, z1 = zf + 60;
    const nx = 180, nz = Math.round(180 * ((z1 - z0) / (x1 - x0)));
    const col = (x: number, z: number, y: number) => {
      const c = grassColor(x, z, y);
      if (Math.abs(z) < 8.5) c.lerp(new THREE.Color('#8b8270'), 0.6);
      return c;
    };
    this.site.add(terrainBlock(this.h, x0, x1, z0, z1, nx, nz, col, -14));
    // bosque en las laderas
    const ts: TreeSpot[] = [];
    const R = rng(21);
    for (let k = 0; k < 420; k++) {
      const x = x0 + 5 + R() * (x1 - x0 - 10), z = z0 + 5 + R() * (z1 - z0 - 10);
      if (Math.abs(z) < 11) continue;
      if (z > 0 && Math.abs(z - this.zCanal(x)) < 6 && x > -2 && x < Lr + 2) continue;
      if (Math.abs(x - Lr) < 10 && z > 0) continue;
      if (x > Lr + 15 && z < -8 && z > -75) continue;
      ts.push({ x, y: this.h(x, z), z, r: 2.4 + R() * 3.2 });
    }
    this.site.add(trees(ts, 7));
    // el río en tres tramos: arriba de la bocatoma, el tramo con menos agua y abajo de la descarga
    const ribbon = (xa: number, xb: number) => {
      const n = Math.max(8, Math.round((xb - xa) / 3));
      const geo = new THREE.PlaneGeometry(xb - xa, 1, n, 1);
      geo.rotateX(-Math.PI / 2);
      geo.translate((xa + xb) / 2, 0, 0);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) p.setY(k, this.yr(p.getX(k)) - 0.9);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, waterMat('#4d8fae', 0.88, [1.4, 0], 0.9));
      m.receiveShadow = true;
      this.site.add(m);
      this.river.push(m);
    };
    ribbon(x0, 0);
    ribbon(0, Lr + 4);
    ribbon(Lr + 4, x1);
    // azud de la bocatoma y la lámina que vierte por encima
    const weir = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 16), concreteMaterial('#c6c2b8'));
    weir.position.set(0, this.yr(0) - 0.4, 0);
    weir.castShadow = weir.receiveShadow = true;
    this.weirSheet = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.8, 1, 8), waterMat('#e2f1f8', 0.75, [0, -1.5], 1));
    this.weirSheet.rotation.set(0, Math.PI / 2, 0);
    this.weirSheet.position.set(1.3, this.yr(0) - 0.6, 0);
    this.site.add(weir, this.weirSheet);
    // canal de conducción por la ladera, de la bocatoma a la cámara de carga
    const cpts: THREE.Vector3[] = [];
    for (let x = 0; x <= Lr - 2; x += 6) cpts.push(V3(x, Hg + 0.6 - x * 0.002, this.zCanal(x)));
    cpts.unshift(V3(-1, Hg + 0.6, 7.5));
    const ccurve = new THREE.CatmullRomCurve3(cpts);
    const shape = new THREE.Shape();
    shape.moveTo(-1.2, -0.9);
    shape.lineTo(1.2, -0.9);
    shape.lineTo(1.2, 0.4);
    shape.lineTo(0.95, 0.4);
    shape.lineTo(0.95, -0.65);
    shape.lineTo(-0.95, -0.65);
    shape.lineTo(-0.95, 0.4);
    shape.lineTo(-1.2, 0.4);
    shape.closePath();
    const canal = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { steps: cpts.length * 6, extrudePath: ccurve }), concreteMaterial('#c4c0b6'));
    canal.castShadow = canal.receiveShadow = true;
    this.canalWater = new THREE.Mesh(new THREE.TubeGeometry(ccurve, cpts.length * 6, 0.92, 4, false), waterMat('#4a8db0', 0.9, [1, 0], 0.8));
    this.canalWater.scale.set(1, 1, 1);
    this.site.add(canal, this.canalWater);
    // cámara de carga y tubería de presión por la ladera hasta la casa de máquinas
    const xf = Lr - 2, zc = this.zCanal(xf);
    const fore = tank(7, 4, 6, { wall: 0.35 });
    fore.position.set(xf + 2, Hg - 3, zc);
    this.site.add(fore);
    const ppts: THREE.Vector3[] = [V3(xf + 2, Hg - 1.6, zc - 3)];
    for (let z = zc - 6; z > 27; z -= 5) ppts.push(V3(xf + 2, this.h(xf + 2, z) + 1.4 + s.D / 2, z));
    const yTurb = 2.9;
    ppts.push(V3(xf + 2, yTurb + 1.2, 21), V3(xf + 2, yTurb, 16.5), V3(xf + 2, yTurb, 14.4));
    this.pen = new FlowPipe(roundedPath(ppts, 3), s.D / 2, '#59636b', { metal: 0.55, rough: 0.35 });
    this.site.add(this.pen.mesh);
    // bloques de anclaje
    for (let k = 1; k < ppts.length - 2; k += 3) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(s.D * 2.6, s.D * 2.2, 2.4), concreteMaterial('#bbb7ad'));
      a.position.copy(ppts[k]).add(V3(0, -s.D * 0.5, 0));
      a.castShadow = a.receiveShadow = true;
      this.site.add(a);
    }
    // casa de máquinas: muros, techo y frente de vidrio para ver la turbina
    const ph = new THREE.Group();
    const wallM = lookMaterial(new THREE.MeshStandardMaterial({ color: '#e6dfcf', roughness: 0.85 }), { detail: 0.08 });
    const floorY = 1.2;
    const bw = 12, bd = 10, bh = 8;
    const wb = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallM);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      ph.add(m);
    };
    wb(bw, 0.4, bd, 0, floorY, 0);
    wb(bw, bh, 0.35, 0, floorY + bh / 2, bd / 2);
    wb(0.35, bh, bd, -bw / 2, floorY + bh / 2, 0);
    wb(0.35, bh, bd, bw / 2, floorY + bh / 2, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 1, 0.4, bd + 1), paint('#8c4a37', 0.7, 0.1));
    roof.position.set(0, floorY + bh + 0.2, 0);
    roof.castShadow = true;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), glass(0.08));
    front.position.set(0, floorY + bh / 2, -bd / 2);
    front.rotation.y = Math.PI;
    ph.add(roof, front);
    ph.position.set(xf + 2, 0, 12);
    this.site.add(ph);
    // turbina y generador según el tipo
    this.runner = new THREE.Group();
    const tc = V3(xf + 2, yTurb, 12);
    const gen = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.8, 32), paint('#2f6e5a', 0.4, 0.35));
    const genBox = new THREE.Group();
    genBox.add(gen);
    this.jet = null;
    if (s.turbine === 'pelton') {
      const w = peltonWheel(1.5, 18);
      w.rotation.x = Math.PI / 2;
      this.runner.add(w);
      this.runner.position.copy(tc).add(V3(0, 1.2, 0));
      gen.rotation.x = Math.PI / 2;
      genBox.position.copy(this.runner.position).add(V3(0, 0, -2.4));
      const casing = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.9, 32, 1, true, 0, Math.PI), paint('#3d6f8e', 0.45, 0.4));
      (casing.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      casing.rotation.x = Math.PI / 2;
      casing.position.copy(this.runner.position);
      this.site.add(casing);
      // chorro desde la tobera
      this.jet = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.2, 10), waterMat('#e9f6fc', 0.9, [0, -4], 1));
      this.jet.rotation.z = Math.PI / 2;
      this.jet.position.copy(this.runner.position).add(V3(-1.2, -1.32, 0));
      this.site.add(this.jet);
    } else if (s.turbine === 'banki') {
      const b = bankiRunner(0.7, 1.4);
      b.rotation.x = Math.PI / 2;
      this.runner.add(b);
      this.runner.position.copy(tc).add(V3(0, 0.8, 0));
      gen.rotation.x = Math.PI / 2;
      genBox.position.copy(this.runner.position).add(V3(0, 0, -2.2));
      this.jet = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 1.2), waterMat('#e9f6fc', 0.85, [0, -4], 1));
      this.jet.position.copy(this.runner.position).add(V3(-0.9, 0.7, 0));
      this.jet.rotation.z = -0.5;
      this.site.add(this.jet);
    } else {
      // caja espiral abierta por arriba para ver el rodete, tubo de aspiración y generador sobre el eje
      const sp = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.62 + s.D * 0.15, 16, 48, Math.PI * 1.7), paint('#3d6f8e', 0.42, 0.45));
      sp.rotation.x = Math.PI / 2;
      sp.rotation.z = -Math.PI / 2;
      sp.position.copy(tc);
      const draft = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.95, 1.6, 32, 1, true), paint('#56636d', 0.5, 0.4));
      (draft.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      draft.position.copy(tc).add(V3(0, -1.0, 0));
      this.site.add(sp, draft);
      const run = s.turbine === 'kaplan' ? kaplanRunner(1.25) : francisRunner(1.25);
      this.runner.add(run);
      this.runner.position.copy(tc);
      genBox.position.copy(tc).add(V3(0, 3.4, 0));
      gen.scale.set(1.25, 1.25, 1.25);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.8, 12), steel());
      shaft.position.copy(tc).add(V3(0, 1.6, 0));
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.18, 40, 1, false, 0, Math.PI * 1.5), paint('#9aa4ad', 0.5, 0.4));
      deck.position.copy(tc).add(V3(0, 1.0, 0));
      this.site.add(shaft, deck);
    }
    this.site.add(this.runner, genBox);
    // descarga al río
    const tailGeo = new THREE.PlaneGeometry(3, 12, 1, 6);
    tailGeo.rotateX(-Math.PI / 2);
    this.tail = new THREE.Mesh(tailGeo, waterMat('#4d8fae', 0.9, [0, -1.5], 0.9));
    this.tail.position.set(xf + 2, this.yr(Lr) - 0.3, 4);
    this.site.add(this.tail);
    // red eléctrica de la casa de máquinas al pueblo
    const poles: THREE.Vector3[] = [];
    const start = V3(xf + 10, 0, 10), end = V3(Lr + 52, 0, -30);
    for (let k = 0; k <= 5; k++) {
      const p = start.clone().lerp(end, k / 5);
      p.y = this.h(p.x, p.z);
      poles.push(p);
    }
    const tipsAll: THREE.Vector3[][] = [];
    const rotY = Math.atan2(end.x - start.x, end.z - start.z);
    for (const p of poles) {
      const pp = powerPole(p, 11, rotY);
      this.site.add(pp.group);
      tipsAll.push(pp.tips);
    }
    const wm = new THREE.MeshStandardMaterial({ color: '#2d3236', roughness: 0.5, metalness: 0.6 });
    for (let k = 0; k < poles.length - 1; k++)
      for (let j = 0; j < 3; j++) {
        this.site.add(wire(tipsAll[k][j], tipsAll[k + 1][j], 0.9, wm));
        const a = tipsAll[k][j], b = tipsAll[k + 1][j];
        const pts = Array.from({ length: 11 }, (_, i) => a.clone().lerp(b, i / 10).add(V3(0, -4 * 0.9 * (i / 10) * (1 - i / 10), 0)));
        this.wires.push(new THREE.CatmullRomCurve3(pts));
      }
    this.pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe08a' }), this.wires.length * 3);
    this.pulses.frustumCulled = false;
    this.site.add(this.pulses);
    // el pueblo
    const spots: LitHouse[] = [];
    const RH = rng(17);
    const WALL = ['#efe0c0', '#f0c9a2', '#cfe1d4', '#bcd6e6', '#f2d27a', '#e9b9c2', '#ffffff', '#d9c7a7'];
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 5; j++) {
        if (RH() < 0.12) continue;
        const x = Lr + 40 + i * 8.5 + (RH() - 0.5) * 2, z = -22 - j * 9 + (RH() - 0.5) * 2;
        spots.push({ x, y: this.h(x, z), z, w: 5 + RH() * 2.5, d: 5 + RH() * 2, h: 3 + Math.floor(RH() * 2) * 2.6, rot: (RH() - 0.5) * 0.2, wall: WALL[Math.floor(RH() * WALL.length)] });
      }
    this.village = new LitHouses(spots, 5);
    this.site.add(this.village.group);
    this.houseCount = spots.length;
    // vistas según el tamaño del valle
    const W = x1 - x0;
    this.views.general = { eye: [Lr * 0.55 + W * 0.42, Hg * 0.6 + W * 0.5, -W * 0.62], target: [Lr * 0.52, Hg * 0.35, zf * 0.32], fit: W * 0.78, portrait: { eye: [Lr * 0.55 + W * 0.5, Hg + W * 0.9, -W * 1.05], target: [Lr * 0.5, Hg * 0.3, zf * 0.3] } };
    this.views.casa = { eye: [xf + 13, yTurb + 7.5, -11], target: [xf + 2, yTurb + 2.2, 12], fit: 24 };
    this.views.bocatoma = { eye: [-30, Hg + 22, -34], target: [8, Hg - 1, 8], fit: 44 };
    this.views.pueblo = { eye: [Lr + 112, 34, -104], target: [Lr + 72, 3, -42], fit: 84 };
  }

  private houseCount = 1;
  private zCanal(x: number): number {
    return (this.g.Hg - this.yr(Math.max(0, x))) / SLOPE + 7 + 1.4;
  }

  set(s: HydroState): void {
    const key = `${s.Hg}|${s.D}|${s.turbine}`;
    const first = this.st === null;
    this.st = s;
    if (key !== this.key) {
      this.key = key;
      this.build(s);
      if (first) this.stage.view(this.views.general, false);
    }
    // caudales: ancho de la lámina de agua según el caudal (proporción suave, a escala de la maqueta)
    const wOf = (q: number) => Math.max(0.6, 13 * Math.pow(Math.max(0.01, q) / 3, 0.4));
    const reduced = Math.max(0, s.Qriver - s.Qt);
    const ws = [wOf(s.Qriver), wOf(reduced), wOf(s.Qriver)];
    this.river.forEach((m, k) => m.scale.set(1, 1, ws[k]));
    if (this.canalWater) this.canalWater.visible = s.Qt > 0.001;
    if (this.canalWater) this.canalWater.scale.set(1, 1, 1);
    if (this.tail) {
      this.tail.visible = s.Qt > 0.001;
      this.tail.scale.set(Math.max(0.3, Math.sqrt(s.Qt / Math.max(0.1, s.Qd))), 1, 1);
    }
    if (this.weirSheet) {
      const over = Math.max(0, s.Qriver - s.Qt);
      this.weirSheet.visible = over > 0.005;
      this.weirSheet.scale.set(Math.min(1, 0.25 + over / 3), 1, 1);
    }
    this.pen?.setFlow(s.Qt / (Math.PI * (s.D / 2) ** 2));
    if (this.jet) this.jet.visible = s.Qt > 0.001;
    this.village?.setLit(s.homesNow / (this.houseCount * HOMES_PER_HOUSE));
    this.labels(s);
  }

  private labels(s: HydroState): void {
    const { Lr, Hg } = this.g;
    const xf = Lr - 2;
    const L: StageLabel[] = [
      {
        id: 'casa',
        text: s.P > 0 ? `${es(s.P, 0)} kW ahora` : 'La turbina está parada',
        sub: s.P > 0 ? `${s.turbine === 'banki' ? 'Michell-Banki' : s.turbine[0].toUpperCase() + s.turbine.slice(1)} con ${es(s.Qt, 2)} m³/s · eficiencia ${es(s.eta * 100, 0)} %` : !s.inRange ? 'esta turbina no sirve para esta caída' : 'le llega muy poca agua para su tamaño',
        at: V3(xf + 2, this.yr(Lr) + 11.5, 12),
        kind: s.P > 0 ? 'ok' : 'alerta',
        prio: 9,
      },
      { id: 'bocatoma', text: `Bocatoma: el río trae ${es(s.Qriver, 2)} m³/s`, sub: `se dejan ${es(s.Qeco, 2)} m³/s en el río`, at: V3(0, Hg + 5, 0), kind: 'lugar', prio: 6 },
      { id: 'pueblo', text: `${es(Math.min(s.homesNow, 999999), 0)} hogares con luz`, sub: `cada casa de la maqueta son ${HOMES_PER_HOUSE} hogares`, at: V3(Lr + 75, 14, -40), kind: s.P > 0 ? 'dato' : 'alerta', prio: 5 },
      { id: 'tuberia', text: `Tubería de presión de ${es(s.D, 2)} m`, sub: `${es(Hg, 0)} m de caída · pierde ${es(s.lossPct, 1)} %`, at: V3(xf + 2, Hg * 0.55 + 6, this.zCanal(xf) * 0.5 + 8), kind: 'lugar', prio: 4 },
    ];
    if (s.Qt > 0.01) L.push({ id: 'tramo', text: 'Tramo con menos agua', sub: `${es(Math.max(0, s.Qriver - s.Qt), 2)} m³/s entre la bocatoma y la descarga`, at: V3(Lr * 0.5, this.yr(Lr * 0.5) + 6, -4), kind: 'dato', prio: 3 });
    this.stage.setLabels(L);
  }

  update(dt: number, t: number): void {
    const s = this.st;
    this.pen?.tick(dt);
    this.village?.tick(dt, t);
    if (!s) return;
    const target = s.P > 0 ? (s.turbine === 'pelton' || s.turbine === 'banki' ? 5 : 3.5) : 0;
    this.spin += (target - this.spin) * Math.min(1, dt * 0.8);
    if (s.turbine === 'pelton' || s.turbine === 'banki') this.runner.rotation.z -= this.spin * dt;
    else this.runner.rotation.y += this.spin * dt;
    if (this.jet) (this.jet.material as THREE.MeshStandardMaterial).opacity = 0.75 + Math.sin(t * 30) * 0.08;
    // pulsos de energía que viajan por los cables
    if (this.pulses) {
      this.pulse += dt * (s.P > 0 ? 0.35 : 0);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
      let n = 0;
      if (s.P > 0)
        for (const w of this.wires)
          for (let k = 0; k < 3; k++) {
            const u = (this.pulse + k / 3) % 1;
            P.copy(w.getPointAt(u));
            M.compose(P, Q, S.setScalar(0.6 + 0.6 * Math.min(1, s.P / 1500)));
            this.pulses.setMatrixAt(n++, M);
          }
      this.pulses.count = n;
      this.pulses.instanceMatrix.needsUpdate = true;
    }
  }
}

// «Medir el caudal» en 3D: un canal de laboratorio de 0,30 m de ancho con paredes de vidrio, sobre su mesa. La bomba
// sube el agua del tanque de abajo al tanque de llegada; el agua corre por el canal, pasa por el vertedero
// (rectangular o triangular) o bajo la compuerta y cae de vuelta al tanque. La regla pegada al vidrio, aguas
// arriba, sirve para leer la profundidad, y un flotador puede soltarse para medir la velocidad de la superficie.

import * as THREE from 'three';
import { FLUME, G, type GaugeResult } from '../hydraulics';
import { concreteMaterial } from '../../quality/three/kit';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { WATER, WaterBody, glassMaterial, slab, staffGauge, type Station } from './canalKit';

const X0 = -4;
const X1 = 3;
const XD = 1.5;
const XG = -1.5;
const HB = FLUME.b / 2;
const FLOAT: [number, number] = [-3.6, -1.6];

export class GaugeWorld {
  private stage: QStage;
  private time = { value: 0 };
  private dyn = new THREE.Group();
  private water: WaterBody;
  private jet: WaterBody;
  private fall: WaterBody;
  private float: THREE.Mesh;
  private meterTex: THREE.CanvasTexture;
  private meterCv: HTMLCanvasElement;
  private r: GaugeResult | null = null;
  private built = '';
  private floatT0: number | null = null;
  readonly views: Record<'general' | 'estructura' | 'regla', StageView> = {
    general: { eye: [0.2, 1.9, 5.2], target: [-0.3, -0.1, 0], fit: 8.5 },
    estructura: { eye: [2.6, 0.55, 1.35], target: [1.6, 0.18, 0], fit: 1.9 },
    regla: { eye: [-1.25, 0.32, 1.05], target: [-1.5, 0.2, 0.15], fit: 0.9 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(8);
    stage.controls.minDistance = 0.4;
    // piso del laboratorio y pared
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ color: '#cfd3d6', roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.95;
    floor.receiveShadow = true;
    sc.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 1 }));
    wall.position.set(0, 2, -3);
    sc.add(wall);
    const steel = new THREE.MeshStandardMaterial({ color: '#59636b', roughness: 0.45, metalness: 0.6 });
    const glass = glassMaterial(0.16);
    // canal: fondo de acero, paredes de vidrio y marco
    sc.add(slab(steel, X0, X1, -0.03, 0, -HB - 0.02, HB + 0.02));
    sc.add(slab(glass, X0, X1, 0, FLUME.H, -HB - 0.012, -HB, false));
    sc.add(slab(glass, X0, X1, 0, FLUME.H, HB, HB + 0.012, false));
    for (let x = X0; x <= X1 + 1e-6; x += 1) {
      for (const sg of [-1, 1]) {
        sc.add(slab(steel, x - 0.02, x + 0.02, 0, FLUME.H, sg * HB - 0.02, sg * HB + 0.02));
        sc.add(slab(steel, x - 0.025, x + 0.025, -0.93, -0.03, sg * (HB + 0.03) - 0.025, sg * (HB + 0.03) + 0.025));
      }
    }
    for (const sg of [-1, 1]) sc.add(slab(steel, X0, X1, FLUME.H, FLUME.H + 0.025, sg * HB - 0.02, sg * HB + 0.02));
    // tanque de llegada, tanque de abajo, bomba y tubería
    sc.add(slab(glassMaterial(0.25), X0 - 0.7, X0, -0.3, 0.6, -0.35, 0.35, false));
    sc.add(slab(steel, X0 - 0.72, X0 + 0.02, -0.32, -0.3, -0.37, 0.37));
    sc.add(slab(concreteMaterial('#9aa3aa'), X1 - 0.2, X1 + 1.1, -0.95, -0.35, -0.45, 0.45));
    const pump = slab(new THREE.MeshStandardMaterial({ color: '#2f6fa8', roughness: 0.5, metalness: 0.3 }), X1 + 1.3, X1 + 1.75, -0.95, -0.6, -0.2, 0.2);
    sc.add(pump);
    const pipeM = new THREE.MeshStandardMaterial({ color: '#8d969c', roughness: 0.5, metalness: 0.4 });
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, X1 + 1.5 - (X0 - 0.4), 12), pipeM);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set((X1 + 1.5 + X0 - 0.4) / 2, -0.75, -0.3);
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.35, 12), pipeM);
    riser.position.set(X0 - 0.4, -0.08, -0.3);
    sc.add(pipe, riser);
    // caudalímetro de la bomba (pantalla)
    this.meterCv = document.createElement('canvas');
    this.meterCv.width = 256;
    this.meterCv.height = 96;
    this.meterTex = new THREE.CanvasTexture(this.meterCv);
    this.meterTex.colorSpace = THREE.SRGBColorSpace;
    const meter = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), [steel, steel, steel, steel, new THREE.MeshBasicMaterial({ map: this.meterTex }), steel]);
    meter.position.set(X0 - 0.4, 0.35, -0.22);
    sc.add(meter);
    // regla en el vidrio, aguas arriba
    const g = staffGauge(FLUME.H, 0.01, 0.05, 0.05);
    g.position.set(XG, 0, HB + 0.016);
    sc.add(g);
    sc.add(this.dyn);
    this.water = new WaterBody(this.time);
    this.jet = new WaterBody(this.time);
    this.fall = new WaterBody(this.time, { side: false });
    for (const w of [this.water, this.jet, this.fall]) {
      w.setColor(WATER.lab);
      sc.add(w.group);
    }
    this.float = new THREE.Mesh(new THREE.SphereGeometry(0.025, 14, 10), new THREE.MeshStandardMaterial({ color: '#f07a1a', roughness: 0.5 }));
    sc.add(this.float);
    stage.view(this.views.general, false);
  }

  private build(r: GaugeResult): void {
    for (const c of [...this.dyn.children]) {
      this.dyn.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const plate = new THREE.MeshStandardMaterial({ color: '#c9cdd1', roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide });
    if (r.inp.device === 'rect') {
      this.dyn.add(slab(plate, XD - 0.006, XD + 0.006, 0, FLUME.P, -HB, HB));
    } else if (r.inp.device === 'tri') {
      const h = FLUME.H - 0.02;
      const v = FLUME.Ptri;
      const w = Math.min(HB, h - v);
      const sh = new THREE.Shape([new THREE.Vector2(-HB, 0), new THREE.Vector2(HB, 0), new THREE.Vector2(HB, h), new THREE.Vector2(w, h), new THREE.Vector2(0, v), new THREE.Vector2(-w, h), new THREE.Vector2(-HB, h)]);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false });
      const m = new THREE.Mesh(geo, plate);
      m.rotation.y = Math.PI / 2;
      m.position.set(XD - 0.006, 0, 0);
      this.dyn.add(m);
    } else {
      // compuerta: placa que baja hasta la abertura, con su tornillo y manivela
      this.dyn.add(slab(plate, XD - 0.008, XD + 0.008, r.inp.gate, FLUME.H + 0.15, -HB, HB));
      this.dyn.add(slab(new THREE.MeshStandardMaterial({ color: '#59636b', metalness: 0.6, roughness: 0.4 }), XD - 0.04, XD + 0.04, FLUME.H + 0.15, FLUME.H + 0.19, -HB - 0.05, HB + 0.05));
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 8), new THREE.MeshStandardMaterial({ color: '#8d969c', metalness: 0.7 }));
      screw.position.set(XD, FLUME.H + 0.3, 0);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 20), new THREE.MeshStandardMaterial({ color: '#c0392b' }));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(XD, FLUME.H + 0.46, 0);
      this.dyn.add(screw, wheel);
    }
  }

  set(r: GaugeResult): void {
    this.r = r;
    const key = `${r.inp.device}-${r.inp.gate}`;
    if (key !== this.built) {
      this.build(r);
      this.built = key;
    }
    const st: Station[] = [], jet: Station[] = [], fall: Station[] = [];
    const yUp = Math.min(r.yUp, FLUME.H + 0.01);
    const q = r.Q / FLUME.b;
    const hw = HB - 0.003;
    // aguas arriba: casi horizontal, baja un poco al acercarse a la estructura
    for (let k = 0; k <= 40; k++) {
      const x = X0 + ((XD - X0) * k) / 40;
      const near = Math.max(0, 1 - (XD - x) / Math.max(0.05, 3 * r.H));
      const draw = r.inp.device === 'gate' ? 0 : 0.15 * r.H * near * near;
      st.push({ x, bed: 0, depth: yUp - draw, halfW: hw, foam: 0.02 });
    }
    let xEnd: number, yDown: number;
    if (r.inp.device === 'gate') {
      const y2 = r.gateFree ? r.yUp : r.yVena!;
      st.push({ x: XD + 0.01, bed: 0, depth: y2 * 1.2, halfW: hw, foam: 0.2 });
      for (let k = 1; k <= 20; k++) st.push({ x: XD + ((X1 - XD) * k) / 20, bed: 0, depth: y2, halfW: hw, foam: 0.25 });
      xEnd = X1;
      yDown = y2;
      this.jet.group.visible = false;
    } else {
      // lámina que cae: sale de la cresta con la velocidad de la carga y cae con la gravedad
      const crest = r.inp.device === 'rect' ? FLUME.P : FLUME.Ptri;
      const v0 = Math.sqrt(2 * G * r.H * 0.5);
      const th = r.H * 0.65;
      const halfJet = r.inp.device === 'rect' ? hw : Math.max(0.01, Math.min(hw, r.H * 0.8));
      let x = XD, t = 0;
      while (true) {
        const yLow = crest + 0.12 * r.H - 0.5 * G * t * t;
        if (yLow <= 0.0) break;
        jet.push({ x, bed: yLow, depth: Math.max(0.004, th * (1 - t * 2)), halfW: halfJet, foam: 0.15 });
        t += 0.006;
        x = XD + v0 * t;
        if (t > 1) break;
      }
      this.jet.group.visible = jet.length >= 2;
      if (jet.length >= 2) this.jet.update(jet);
      const xi = Math.min(X1 - 0.1, x);
      // al caer, el agua corre rápida y delgada hasta el final del canal
      const Vi = Math.sqrt(v0 * v0 + 2 * G * crest);
      yDown = Math.max(0.004, q / Vi);
      st.push({ x: XD + 0.008, bed: 0, depth: 0.002, halfW: hw });
      for (let k = 0; k <= 12; k++) st.push({ x: xi + ((X1 - xi) * k) / 12, bed: 0, depth: yDown, halfW: hw, foam: k < 3 ? 0.6 : 0.2 });
      xEnd = X1;
    }
    this.water.update(st);
    this.water.setSpeed(r.Vup * 4);
    this.jet.setSpeed(2);
    // caída al tanque
    for (let k = 0; k <= 12; k++) {
      const t = k * 0.03;
      const x = xEnd + Math.min(0.9, (r.Q / (FLUME.b * yDown)) * t);
      fall.push({ x, bed: -0.5 * G * t * t, depth: yDown, halfW: hw * 0.95, foam: 0.3 });
    }
    this.fall.update(fall);
    // pantalla del caudalímetro
    const c = this.meterCv.getContext('2d')!;
    c.fillStyle = '#10261a';
    c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#6dff9a';
    c.font = 'bold 44px monospace';
    c.fillText(`${r.inp.Qls.toFixed(1).replace('.', ',')} L/s`, 18, 62);
    this.meterTex.needsUpdate = true;
    this.stage.setLabels(this.labels());
  }

  /** Suelta el flotador; devuelve los segundos que tarda en recorrer los 2 m. */
  dropFloat(): number {
    const r = this.r;
    if (!r) return 0;
    this.floatT0 = this.stage.t;
    return (FLOAT[1] - FLOAT[0]) / (r.Vup / 0.85);
  }

  private labels(): StageLabel[] {
    const r = this.r!;
    const name = r.inp.device === 'rect' ? 'Vertedero rectangular' : r.inp.device === 'tri' ? 'Vertedero triangular (90°)' : 'Compuerta';
    const out: StageLabel[] = [
      { id: 'dev', text: name, at: new THREE.Vector3(XD, FLUME.H + (r.inp.device === 'gate' ? 0.62 : 0.12), 0), kind: 'lugar', prio: 5 },
      { id: 'regla', text: 'Regla', sub: 'lee aquí la profundidad', at: new THREE.Vector3(XG, FLUME.H + 0.1, HB), kind: 'dato', prio: 4 },
      { id: 'bomba', text: 'Caudalímetro de la bomba', at: new THREE.Vector3(X0 - 0.4, 0.52, -0.22), kind: 'dato', prio: 3 },
    ];
    if (r.overflow) out.push({ id: 'rebosa', text: 'El agua rebosa el canal', at: new THREE.Vector3(-0.5, FLUME.H + 0.15, 0), kind: 'alerta', prio: 6 });
    return out;
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    const r = this.r;
    if (!r) return;
    let x = FLOAT[0];
    if (this.floatT0 !== null) {
      const Vs = r.Vup / 0.85;
      x = FLOAT[0] + (t - this.floatT0) * Vs;
      if (this.stage.reducedMotion || x > FLOAT[1] + 0.3) {
        x = FLOAT[0];
        this.floatT0 = null;
      }
    }
    this.float.visible = this.floatT0 !== null;
    this.float.position.set(Math.min(x, XD - 0.05), Math.min(r.yUp, FLUME.H) + 0.012, 0);
    void dt;
  }
}

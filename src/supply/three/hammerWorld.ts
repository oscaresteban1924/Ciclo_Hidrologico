// «El golpe de ariete» en 3D: una tubería recta de 600 m entre un tanque en la loma y una válvula en el valle. Al
// cerrar la válvula, la onda de presión viaja por el tubo (rojo donde la presión sube, azul donde baja, gris sin
// cambio) y la línea piezométrica, a escala, sube y baja sobre él. Se reproduce en cámara lenta. El tubo se dibuja más
// grueso que el real para verlo.

import * as THREE from 'three';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { noise2, trees, type TreeSpot } from '../../quality/three/kit';
import { polyline, setPolyline } from '../../canals/three/canalKit';
import type { HammerResult } from '../hammer';
import { StorageTank, diorama } from './supplyKit';

const X0 = -300, X1 = 300, AXIS = 2.2;
/** Segundos de la reproducción completa. */
export const HAMMER_PLAY = 24;

const hill = (x: number, z: number) => 72 / (1 + Math.exp((x + 330) / 14)) + noise2(x * 0.03, z * 0.04) * 1.5 * Math.min(1, Math.abs(z) / 12) + 0.02 * Math.abs(z);

export class HammerWorld {
  private stage: QStage;
  private tankObj: StorageTank;
  private pipe: THREE.Mesh;
  private pipeX: Float32Array;
  private hgl: THREE.Mesh | null = null;
  private hglMat = new THREE.MeshStandardMaterial({ color: '#1f78b4', emissive: '#1f78b4', emissiveIntensity: 0.5 });
  private steady = polyline('#8a96a0', true);
  private envHi = polyline('#c0392b', true);
  private envLo = polyline('#2166ac', true);
  private wheel: THREE.Mesh;
  private r: HammerResult | null = null;
  private playing = false;
  private tPlay = 0;
  private frame = 0;
  /** Llamado en cada cuadro durante la reproducción: tiempo del cálculo (s), o null al terminar. */
  onTime: ((t: number | null) => void) | null = null;
  readonly views: Record<'general' | 'valvula' | 'tanque', StageView> = {
    general: { eye: [40, 150, 520], target: [0, 40, 0], fit: 700, portrait: { eye: [40, 260, 900], target: [0, 50, 0] } },
    valvula: { eye: [360, 60, 150], target: [270, 40, 0], fit: 140 },
    tanque: { eye: [-250, 90, 140], target: [-320, 50, 0], fit: 140 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(380);
    const green = new THREE.Color('#93bf6c'), rock = new THREE.Color('#a59a83');
    sc.add(diorama(hill, -400, 340, -70, 70, 148, 28, (x, z, y) => green.clone().lerp(rock, Math.min(1, y / 70) * 0.6).multiplyScalar(0.93 + 0.08 * noise2(x * 0.2, z * 0.2)), -5));
    const R = (() => {
      let s = 3;
      return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    })();
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 150; k++) {
      const x = -390 + R() * 720, z = (R() < 0.5 ? -1 : 1) * (12 + R() * 56);
      ts.push({ x, y: hill(x, z), z, r: 2 + R() * 2.2 });
    }
    sc.add(trees(ts, 2));
    this.tankObj = new StorageTank(14, hill(-345, 0) - 1, 75);
    this.tankObj.group.position.set(-345, 0, 0);
    sc.add(this.tankObj.group);
    // tubo con colores por vértice (la onda)
    const g = new THREE.CylinderGeometry(1.1, 1.1, X1 - X0, 14, 120, true);
    g.rotateZ(-Math.PI / 2);
    g.translate((X0 + X1) / 2, AXIS, 0);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(0.85), 3));
    this.pipeX = new Float32Array(n);
    for (let k = 0; k < n; k++) this.pipeX[k] = (g.attributes.position as THREE.BufferAttribute).getX(k);
    this.pipe = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }));
    this.pipe.castShadow = true;
    const lead = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 40, 14), new THREE.MeshStandardMaterial({ color: '#d9d4c7' }));
    lead.rotateZ(-Math.PI / 2);
    lead.position.set(X0 - 20, AXIS, 0);
    sc.add(this.pipe, lead);
    // casa de válvulas
    const house = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 12), new THREE.MeshStandardMaterial({ color: '#e3dccb', roughness: 0.9 }));
    house.position.set(X1 + 9, 4, -10);
    house.castShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.8, 13), new THREE.MeshStandardMaterial({ color: '#7d3b2b' }));
    roof.position.set(X1 + 9, 8.4, -10);
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: '#2f5f8a', metalness: 0.3, roughness: 0.4 }));
    body.position.set(X1 + 1.5, AXIS, 0);
    this.wheel = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.2, 8, 24), new THREE.MeshStandardMaterial({ color: '#c0392b' }));
    this.wheel.position.set(X1 + 1.5, AXIS + 3.4, 0);
    this.wheel.rotation.x = Math.PI / 2;
    sc.add(house, roof, body, this.wheel, this.steady, this.envHi, this.envLo);
    stage.view(this.views.general, false);
  }

  set(r: HammerResult): void {
    this.r = r;
    this.playing = false;
    this.frame = 0;
    this.tankObj.setLevel(AXIS + r.inp.H0);
    const N = r.frames[0].H.length - 1;
    const xs = (i: number) => X0 + ((X1 - X0) * i) / N;
    setPolyline(this.steady, r.frames[0].H.map((H, i) => new THREE.Vector3(xs(i), AXIS + H, 0)), [6, 4]);
    this.envHi.visible = this.envLo.visible = false;
    setPolyline(this.envHi, r.Hmax.map((H, i) => new THREE.Vector3(xs(i), AXIS + H, 0)), [4, 3]);
    setPolyline(this.envLo, r.Hmin.map((H, i) => new THREE.Vector3(xs(i), AXIS + H, 0)), [4, 3]);
    this.show(0);
  }

  play(on: boolean): void {
    if (!this.r) return;
    this.playing = on;
    this.tPlay = 0;
    if (!on) {
      this.show(this.r.frames.length - 1);
      this.envHi.visible = this.envLo.visible = true;
      this.onTime?.(null);
    } else {
      this.envHi.visible = this.envLo.visible = false;
      this.show(0);
    }
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Factor de cámara lenta de la reproducción. */
  get slow(): number {
    return this.r ? HAMMER_PLAY / Math.max(1e-6, this.r.inp.tEnd) : 1;
  }

  private show(k: number): void {
    const r = this.r;
    if (!r) return;
    this.frame = Math.max(0, Math.min(r.frames.length - 1, k));
    const fr = r.frames[this.frame], base = r.frames[0].H;
    const N = fr.H.length - 1;
    const ref = Math.max(1, (r.a * r.inp.V0) / 9.81);
    const xs = (i: number) => X0 + ((X1 - X0) * i) / N;
    if (this.hgl) {
      this.stage.scene.remove(this.hgl);
      this.hgl.geometry.dispose();
    }
    const pts = fr.H.map((H, i) => new THREE.Vector3(xs(i), AXIS + H, 0));
    this.hgl = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), N * 2, 1.2, 5, false), this.hglMat);
    this.stage.scene.add(this.hgl);
    const col = this.pipe.geometry.attributes.color as THREE.BufferAttribute;
    const hot = new THREE.Color('#c0392b'), cold = new THREE.Color('#2166ac'), mid = new THREE.Color('#d9d4c7'), c = new THREE.Color();
    for (let v = 0; v < this.pipeX.length; v++) {
      const u = ((this.pipeX[v] - X0) / (X1 - X0)) * N;
      const i = Math.min(N - 1, Math.max(0, Math.floor(u))), t = u - i;
      const dH = fr.H[i] * (1 - t) + fr.H[i + 1] * t - (base[i] * (1 - t) + base[i + 1] * t);
      const s = Math.max(-1, Math.min(1, dH / ref));
      c.copy(mid).lerp(s >= 0 ? hot : cold, Math.abs(s));
      col.setXYZ(v, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    const tau = r.inp.tc <= 0 ? (fr.t > 0 ? 0 : 1) : Math.max(0, 1 - fr.t / r.inp.tc);
    this.wheel.rotation.z = (1 - tau) * Math.PI * 3;
    this.labels(fr.t, fr.H);
  }

  private labels(t: number, H: number[]): void {
    const r = this.r;
    if (!r) return;
    const es = (x: number, d = 1) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const N = H.length - 1;
    const out: StageLabel[] = [
      { id: 'valvula', text: `Válvula: ${es(H[N])} m`, sub: this.playing ? `t = ${es(t, 2)} s · ${this.slow >= 1 ? `cámara lenta ×${es(this.slow, 1)}` : `acelerado ×${es(1 / this.slow, 1)}`}` : `antes ${es(r.Hv0)} m · máximo ${es(r.maxV)} m`, at: new THREE.Vector3(X1, AXIS + Math.max(H[N], 0) + 8, 0), kind: H[N] - r.Hv0 > 0.5 * (r.maxV - r.Hv0) && t > 0 ? 'alerta' : 'sonda', prio: 6 },
      { id: 'tanque', text: 'Tanque', sub: `agua ${es(r.inp.H0)} m sobre el tubo`, at: new THREE.Vector3(-345, AXIS + r.inp.H0 + 8, 0), kind: 'lugar', prio: 4 },
    ];
    if (r.vapor && !this.playing) out.push({ id: 'vapor', text: 'La presión llega a la de vapor', sub: 'el agua se separa: el cálculo deja de valer', at: new THREE.Vector3(150, AXIS + 12, 0), kind: 'alerta', prio: 5 });
    this.stage.setLabels(out);
  }

  update(dt: number): void {
    const r = this.r;
    if (!r || !this.playing) return;
    this.tPlay += Math.min(0.1, Math.max(0, dt));
    const t = (this.tPlay / HAMMER_PLAY) * r.inp.tEnd;
    if (t >= r.inp.tEnd) {
      this.play(false);
      return;
    }
    const k = Math.round((t / r.inp.tEnd) * (r.frames.length - 1));
    if (k !== this.frame) this.show(k);
    this.onTime?.(t);
  }
}

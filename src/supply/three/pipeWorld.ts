// «La tubería» en 3D: una maqueta de ladera cortada a lo largo de la conducción. El tubo va enterrado y se ve en el
// corte; sale del tanque en la loma, pasa una loma pequeña y llega a la válvula del barrio. Seis piezómetros de vidrio
// muestran la presión como una columna de agua a escala; la línea piezométrica une sus niveles y la de energía va
// encima. El tubo se dibuja más grueso que el real para verlo.

import * as THREE from 'three';
import { Birds } from '../../three/scenery';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { noise2, trees, type TreeSpot } from '../../quality/three/kit';
import { polyline, setPolyline } from '../../canals/three/canalKit';
import { PIPE_PROFILE } from '../scene';
import type { PipelineResult } from '../pipes';
import { Piezometer, StorageTank, diorama, pipeMesh } from './supplyKit';

const OFF = -210;
const COVER = 1.2;
export const PIEZO_X = [30, 90, 125, 210, 245, 360];

function zPipe(x: number): number {
  const p = PIPE_PROFILE;
  if (x <= p[0].x) return p[0].z;
  for (let k = 1; k < p.length; k++) if (x <= p[k].x) return p[k - 1].z + ((x - p[k - 1].x) / (p[k].x - p[k - 1].x)) * (p[k].z - p[k - 1].z);
  return p[p.length - 1].z;
}

export class PipeWorld {
  private stage: QStage;
  private tankObj: StorageTank;
  private piezos: Piezometer[] = [];
  private hgl: THREE.Mesh | null = null;
  private hglMat = new THREE.MeshStandardMaterial({ color: '#1f78b4', emissive: '#1f78b4', emissiveIntensity: 0.5, transparent: true, opacity: 0.85 });
  private egl = polyline('#7b5ea7', true);
  private stat = polyline('#8a96a0', true);
  private flow: THREE.InstancedMesh;
  private flowS: Float32Array;
  private jet: THREE.Points;
  private jetT: Float32Array;
  private handle: THREE.Mesh;
  private path: THREE.Vector3[];
  private len: number[];
  private r: PipelineResult | null = null;
  private m4 = new THREE.Matrix4();
  private labelT = 0;
  readonly views: Record<'general' | 'tanque' | 'loma' | 'valvula', StageView> = {
    general: { eye: [-30, 48, 205], target: [-10, 24, 0], fit: 300, portrait: { eye: [-20, 90, 420], target: [0, 24, 0] } },
    tanque: { eye: [-150, 62, 70], target: [-200, 46, -4], fit: 70 },
    loma: { eye: [55, 42, 80], target: [35, 26, 0], fit: 90 },
    valvula: { eye: [245, 22, 46], target: [205, 9, 0], fit: 60 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(260);
    // maqueta: el terreno sube un poco hacia atrás; el frente (z = 0) es el corte por el eje del tubo
    const ground = (x: number, z: number) => zPipe(x - OFF) + COVER + 0.06 * -z + noise2(x * 0.03, z * 0.05) * 1.2 * Math.min(1, -z / 8);
    const green = new THREE.Color('#8fbf6a'), dry = new THREE.Color('#b9b073');
    const terr = diorama(ground, -230, 230, -70, 0, 120, 24, (x, z, y) => green.clone().lerp(dry, Math.max(0, Math.min(1, (y - 10) / 50)) * 0.5).multiplyScalar(0.94 + 0.08 * noise2(x * 0.2, z * 0.2)), -6);
    sc.add(terr);
    const R = (() => {
      let s = 5;
      return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    })();
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 140; k++) {
      const x = -220 + R() * 440, z = -12 - R() * 56;
      if (x < -185 && z > -24) continue;
      ts.push({ x, y: ground(x, z), z, r: 1.6 + R() * 1.6 });
    }
    sc.add(trees(ts, 4));
    const birds = new Birds(new THREE.Vector3(0, 50, -30), 150, 40, 7, 2.2);
    sc.add(birds.group);
    stage.animate((t) => birds.update(t));
    // el tubo, en el corte
    this.path = PIPE_PROFILE.map((p) => new THREE.Vector3(p.x + OFF, p.z, 0.6));
    const dense: THREE.Vector3[] = [];
    for (let x = 0; x <= 420; x += 5) dense.push(new THREE.Vector3(x + OFF, zPipe(x), 0.6));
    sc.add(pipeMesh(dense, 0.8, new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.55 })));
    this.len = [0];
    for (let k = 1; k < dense.length; k++) this.len.push(this.len[k - 1] + dense[k].distanceTo(dense[k - 1]));
    this.path = dense;
    // tanque en la loma
    this.tankObj = new StorageTank(7, zPipe(0) + COVER - 0.4, 62);
    this.tankObj.group.position.set(OFF - 9, 0, -4);
    sc.add(this.tankObj.group);
    // piezómetros
    for (const x of PIEZO_X) {
      const p = new Piezometer(x + OFF, zPipe(x) + 0.8, 2.2, 64, 0.9);
      this.piezos.push(p);
      sc.add(p.group);
      const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 8), new THREE.MeshStandardMaterial({ color: '#d9d4c7' }));
      stub.rotation.x = Math.PI / 2;
      stub.position.set(x + OFF, zPipe(x) + 0.8, 1.4);
      sc.add(stub);
    }
    sc.add(this.egl, this.stat);
    // válvula y salida al barrio
    const vx = 420 + OFF, vz = zPipe(420);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: '#2f5f8a', metalness: 0.3, roughness: 0.4 }));
    body.position.set(vx, vz, 0.6);
    this.handle = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 8, 20), new THREE.MeshStandardMaterial({ color: '#c0392b' }));
    this.handle.position.set(vx, vz + 1.6, 0.6);
    this.handle.rotation.x = Math.PI / 2;
    const basin = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 6), new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.9 }));
    basin.position.set(vx + 9, vz - 1.4, 0.6);
    sc.add(body, this.handle, basin);
    // partículas dentro del tubo y chorro a la salida
    this.flow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: '#7fd0ff', emissive: '#2a8fd0', emissiveIntensity: 0.6 }), 160);
    this.flow.frustumCulled = false;
    this.flowS = new Float32Array(160).map((_, k) => (k / 160) * this.len[this.len.length - 1]);
    sc.add(this.flow);
    const jg = new THREE.BufferGeometry();
    jg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(300 * 3), 3));
    this.jet = new THREE.Points(jg, new THREE.PointsMaterial({ color: '#7fb2d9', size: 0.35, transparent: true, opacity: 0.85, depthWrite: false }));
    this.jet.frustumCulled = false;
    this.jetT = new Float32Array(300).map((_, k) => (k / 300) * 0.45);
    sc.add(this.jet);
    stage.view(this.views.general, false);
  }

  set(r: PipelineResult): void {
    this.r = r;
    this.tankObj.setLevel(r.inp.H0);
    const hglAt = (x: number) => {
      const pts = r.pts;
      for (let k = 1; k < pts.length; k++) if (x <= pts[k].x) return pts[k - 1].hgl + ((x - pts[k - 1].x) / Math.max(1e-9, pts[k].x - pts[k - 1].x)) * (pts[k].hgl - pts[k - 1].hgl);
      return pts[pts.length - 1].hgl;
    };
    this.piezos.forEach((p, k) => {
      p.target = hglAt(PIEZO_X[k]);
      p.step(0, this.stage.reducedMotion);
    });
    if (this.hgl) {
      this.stage.scene.remove(this.hgl);
      this.hgl.geometry.dispose();
    }
    const hp = r.pts.filter((p, k) => k === 0 || Math.abs(p.x - r.pts[k - 1].x) > 1e-6).map((p) => new THREE.Vector3(p.x + OFF, p.hgl, 2.2));
    this.hgl = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp, false, 'catmullrom', 0), hp.length * 8, 0.3, 6, false), this.hglMat);
    this.stage.scene.add(this.hgl);
    setPolyline(this.egl, r.pts.map((p) => new THREE.Vector3(p.x + OFF, p.egl, 2.2)), [2, 1.4]);
    setPolyline(this.stat, [new THREE.Vector3(OFF - 9, r.inp.H0, 2.2), new THREE.Vector3(420 + OFF, r.inp.H0, 2.2)], [3, 2]);
    this.handle.rotation.z = (1 - r.inp.open) * Math.PI * 1.5;
    this.labels();
  }

  /** Presión que muestra cada piezómetro (m), en el orden de PIEZO_X. */
  readings(): number[] {
    return this.piezos.map((p, k) => p.target - zPipe(PIEZO_X[k]));
  }

  private labels(): void {
    const r = this.r;
    if (!r) return;
    const es = (x: number, d = 1) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const out: StageLabel[] = [
      { id: 'tanque', text: 'Tanque', sub: `agua a ${es(r.inp.H0)} m`, at: new THREE.Vector3(OFF - 9, 64, -4), kind: 'lugar', prio: 5 },
      { id: 'valvula', text: 'Válvula del barrio', sub: `${es(r.Q * 1000)} L/s · abierta ${es(r.inp.open * 100, 0)} %`, at: new THREE.Vector3(420 + OFF, zPipe(420) + 5, 1), kind: 'sonda', prio: 6 },
    ];
    this.piezos.forEach((p, k) => {
      const pr = p.target - zPipe(PIEZO_X[k]);
      out.push({ id: `p${k}`, text: `${String.fromCharCode(65 + k)}: ${es(pr, 2)} m`, sub: pr < 0 ? 'presión negativa' : undefined, at: new THREE.Vector3(PIEZO_X[k] + OFF, Math.max(p.target, zPipe(PIEZO_X[k])) + 3, 1.6), kind: pr < 0 ? 'alerta' : 'dato', prio: 3 });
    });
    this.stage.setLabels(out);
  }

  update(dt: number): void {
    const r = this.r;
    if (!r) return;
    const h = Math.min(0.1, Math.max(0, dt));
    let moving = false;
    for (const p of this.piezos) moving = p.step(h, this.stage.reducedMotion) || moving;
    this.labelT += h;
    if (moving && this.labelT > 0.25) {
      this.labelT = 0;
      this.labels();
    }
    // partículas a la velocidad media del agua
    const total = this.len[this.len.length - 1];
    for (let j = 0; j < this.flowS.length; j++) {
      this.flowS[j] = (this.flowS[j] + r.V * h) % total;
      const s = this.flowS[j];
      let k = 1;
      while (k < this.len.length - 1 && this.len[k] < s) k++;
      const a = this.path[k - 1], b = this.path[k];
      const t = (s - this.len[k - 1]) / Math.max(1e-9, this.len[k] - this.len[k - 1]);
      this.m4.makeTranslation(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 0.6 + 0.82);
      this.flow.setMatrixAt(j, r.Q > 1e-6 ? this.m4 : this.m4.makeScale(0, 0, 0));
    }
    this.flow.instanceMatrix.needsUpdate = true;
    // chorro: tiro parabólico con la velocidad de salida
    const p = this.jet.geometry.attributes.position as THREE.BufferAttribute;
    const vx = 420 + OFF + 0.8, vz = zPipe(420);
    const v = r.V;
    for (let k = 0; k < p.count; k++) {
      this.jetT[k] = (this.jetT[k] + h) % 0.45;
      const t = this.jetT[k];
      const show = v > 0.05 && !this.stage.reducedMotion;
      p.setXYZ(k, show ? vx + v * t : vx, show ? vz - 4.905 * t * t : -100, 0.6 + ((k % 7) - 3) * 0.05);
    }
    p.needsUpdate = true;
  }
}

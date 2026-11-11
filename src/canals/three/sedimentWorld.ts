// Transporte de sedimentos en 3D: un tramo recto de cauce de 10 m de ancho con el lecho del grano escogido y una
// pared de vidrio al frente. Los granos se quedan quietos, ruedan y saltan por el fondo o van suspendidos, repartidos
// en la altura según el perfil de Rouse; el agua se enturbia con lo que va suspendido. Los granos menores de 8 cm se
// dibujan de 8 cm (la escena dice cuántas veces se aumentaron) para que se vean; la profundidad del agua está a escala.
// Los granos se dibujan en la franja de 1,6 m junto al vidrio, que es la que se ve; el resto del lecho es del mismo color.

import * as THREE from 'three';
import { BED_W, rouseProfile, type SedimentResult } from '../sediment';
import { rng, trees, type TreeSpot } from '../../quality/three/kit';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { WaterBody, glassMaterial, slab, staffGauge } from './canalKit';

const LEN = 40;
const HB = BED_W / 2;
const NB = 2600;
const NM = 320;
/** Franja junto al vidrio donde se dibujan los granos (m). */
const BAND = 1.6;
/** Tramo central con granos (m). */
const GL = 26;

/** Tamaño con que se dibuja el grano (m) y cuántas veces se aumentó. */
export function drawnGrain(d: number): { r: number; k: number } {
  const r = Math.max(d / 2, 0.04);
  return { r, k: r / (d / 2) };
}

export class SedimentWorld {
  private stage: QStage;
  private time = { value: 0 };
  private water: WaterBody;
  private bed: THREE.InstancedMesh;
  private bedMat: THREE.MeshStandardMaterial;
  private gauge: THREE.Mesh;
  private moving: THREE.InstancedMesh;
  private seeds: { x: number; z: number; zf: number; ph: number }[] = [];
  private r: SedimentResult | null = null;
  readonly views: Record<'general' | 'fondo' | 'arriba', StageView> = {
    general: { eye: [6, 1.25, HB + 7], target: [0, 0.75, HB - 2], fit: 11, portrait: { eye: [4.5, 1.6, HB + 9], target: [0, 0.7, HB - 2], fit: 6 } },
    fondo: { eye: [0, 0.55, HB + 2.3], target: [0, 0.32, HB - 0.5], fit: 3.2 },
    arriba: { eye: [0, 13, HB + 6], target: [0, 0, HB - 2], fit: 22 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(30);
    stage.controls.minDistance = 1;
    const R = rng(41);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 200), new THREE.MeshStandardMaterial({ color: '#6c9a4a', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 3;
    ground.position.z = -100 - HB;
    sc.add(ground);
    const low = new THREE.Mesh(new THREE.PlaneGeometry(300, 200), new THREE.MeshStandardMaterial({ color: '#5f8a42', roughness: 1 }));
    low.rotation.x = -Math.PI / 2;
    low.position.set(0, -0.6, 100 + HB);
    sc.add(low);
    // orilla de atrás, lecho y vidrio al frente
    sc.add(slab(new THREE.MeshStandardMaterial({ color: '#7d6a4f', roughness: 1 }), -LEN / 2, LEN / 2, -0.6, 3, -HB - 4, -HB));
    this.bedMat = new THREE.MeshStandardMaterial({ color: '#9c8f7c', roughness: 1 });
    sc.add(slab(this.bedMat, -LEN / 2, LEN / 2, -0.6, 0, -HB, HB + 0.05));
    sc.add(slab(glassMaterial(0.08), -LEN / 2, LEN / 2, 0, 3, HB, HB + 0.04, false));
    // marco del vidrio: zócalo, pasamanos y parales cada 4 m
    const steel = new THREE.MeshStandardMaterial({ color: '#5d6873', roughness: 0.5, metalness: 0.4 });
    sc.add(slab(steel, -LEN / 2, LEN / 2, -0.06, 0.03, HB + 0.04, HB + 0.12));
    sc.add(slab(steel, -LEN / 2, LEN / 2, 3, 3.08, HB - 0.02, HB + 0.1));
    for (let x = -LEN / 2 + 2; x <= LEN / 2 + 1e-6; x += 4) sc.add(slab(steel, x - 0.04, x + 0.04, 0, 3, HB + 0.04, HB + 0.1));
    this.gauge = staffGauge(3, 0.1, 1, 0.12);
    this.gauge.position.set(-6, 0, HB - 0.06);
    sc.add(this.gauge);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 40; k++) ts.push({ x: -80 + R() * 160, y: 3, z: -HB - 6 - R() * 40, r: 1.4 + R() * 1.6 });
    sc.add(trees(ts, 7));
    this.water = new WaterBody(this.time, { opacity: 0.62, sideOpacity: 0.34 });
    sc.add(this.water.group);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
    // el lecho con 20 caras por grano (2 600 granos), los que se mueven con 80
    this.bed = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat, NB);
    this.moving = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat.clone(), NM);
    this.bed.receiveShadow = true;
    this.moving.frustumCulled = this.bed.frustumCulled = false;
    sc.add(this.bed, this.moving);
    for (let k = 0; k < NM; k++) this.seeds.push({ x: R(), z: R(), zf: R(), ph: R() });
    stage.view(this.views.general, false);
  }

  set(r: SedimentResult): void {
    this.r = r;
    const { r: gr } = drawnGrain(r.inp.d);
    const R = rng(3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3();
    const base = new THREE.Color(r.inp.d < 0.002 ? '#c9b38a' : r.inp.d < 0.05 ? '#9c8f7c' : '#8a8378');
    this.bedMat.color.copy(base).multiplyScalar(0.82);
    // lecho: granos en la franja junto al vidrio, que es la que se ve
    for (let k = 0; k < NB; k++) {
      const s = gr * (0.7 + R() * 0.6);
      q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3));
      this.bed.setMatrixAt(k, m4.compose(p.set(-GL / 2 + R() * GL, s * 0.45, HB - 0.05 - R() * BAND), q, sv.set(s, s * 0.75, s)));
      this.bed.setColorAt(k, base.clone().multiplyScalar(0.78 + R() * 0.44));
    }
    this.bed.instanceMatrix.needsUpdate = true;
    if (this.bed.instanceColor) this.bed.instanceColor.needsUpdate = true;
    (this.moving.material as THREE.MeshStandardMaterial).color.copy(base);
    // agua: color según lo que va suspendido
    const susp = r.mode === 'lavado' ? 1 : r.mode === 'suspension' ? 0.75 : r.mode === 'mixto' ? 0.4 : 0;
    this.water.setColor(new THREE.Color('#2f84b5').lerp(new THREE.Color('#9a7d55'), susp));
    this.water.setSpeed(r.V);
    this.water.update([
      { x: -LEN / 2, bed: 0, depth: r.h, halfW: HB - 0.02, foam: Math.min(0.4, r.V / 10) },
      { x: LEN / 2, bed: 0, depth: r.h, halfW: HB - 0.02, foam: Math.min(0.4, r.V / 10) },
    ]);
    this.stage.setLabels(this.labels());
  }

  private labels(): StageLabel[] {
    const r = this.r!;
    const es = (x: number, d = 2) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const { k } = drawnGrain(r.inp.d);
    const name: Record<SedimentResult['mode'], string> = { quieto: 'Los granos no se mueven', fondo: 'Ruedan y saltan por el fondo', mixto: 'Por el fondo y suspendidos', suspension: 'Van suspendidos', lavado: 'Suspendidos: no se asientan' };
    const out: StageLabel[] = [
      { id: 'modo', text: name[r.mode], sub: `θ/θcr = ${es(r.mobility)} · Rouse ${es(r.rouse)}`, at: new THREE.Vector3(0, r.h + 1.2, HB), kind: r.mode === 'quieto' ? 'ok' : 'dato', prio: 6 },
      { id: 'prof', text: `Agua: ${es(r.h)} m a ${es(r.V)} m/s`, sub: 'profundidad a escala', at: new THREE.Vector3(-6, r.h + 0.25, HB), kind: 'dato', prio: 3 },
    ];
    if (k > 1.5) out.push({ id: 'escala', text: `Granos dibujados ${Math.round(k).toLocaleString('es-CO')} veces más grandes`, sub: `grano real de ${r.inp.d < 0.002 ? es(r.inp.d * 1000, 2) + ' mm' : es(r.inp.d * 100, 1) + ' cm'}`, at: new THREE.Vector3(5, 0.3, HB), kind: 'dato', prio: 2 });
    return out;
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    const r = this.r;
    if (!r) return;
    const { r: gr } = drawnGrain(r.inp.d);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    // cuántos se mueven: crece con el arrastre o con lo suspendido
    const susp = r.mode === 'mixto' || r.mode === 'suspension' || r.mode === 'lavado';
    const nOn = r.mode === 'quieto' ? 0 : Math.round(NM * Math.min(1, susp ? 1 : 0.15 + r.qStar * 6));
    const tt = this.stage.reducedMotion ? 0 : t;
    for (let k = 0; k < NM; k++) {
      const sd = this.seeds[k];
      if (k >= nOn) {
        this.moving.setMatrixAt(k, zero);
        continue;
      }
      let y: number, speed: number;
      const inSusp = susp && (r.mode !== 'mixto' || k % 2 === 0);
      if (inSusp) {
        // altura con el perfil de Rouse (aceptación con el valor de la semilla)
        let z = 0.05 + sd.zf * 0.9;
        for (let j = 0; j < 6 && rouseProfile(r.rouse, 1, z) < ((sd.ph * 7.3 + j * 0.37) % 1); j++) z = 0.05 + (((sd.zf + j * 0.618) % 1) * 0.9);
        y = z * r.h;
        speed = r.V * (1 + 0.25 * Math.log(Math.max(0.05, z) / 0.37));
      } else {
        const hop = Math.abs(Math.sin(tt * 4 + sd.ph * 10)) * gr * (2 + 4 * Math.min(1, r.mobility - 1));
        y = gr + hop;
        speed = Math.min(r.V * 0.6, 0.15 + r.ustar * 6 * Math.min(1, r.mobility - 1));
      }
      const x = ((((sd.x * GL + tt * speed) % GL) + GL) % GL) - GL / 2;
      p.set(x, y, HB - 0.15 - sd.z * (BAND - 0.2));
      q.setFromEuler(new THREE.Euler(tt * 3 + k, tt * 2, 0));
      sv.setScalar(gr * (inSusp ? 0.7 : 1));
      this.moving.setMatrixAt(k, m4.compose(p, q, sv));
    }
    this.moving.instanceMatrix.needsUpdate = true;
    void dt;
  }
}

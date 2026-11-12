// Transporte de sedimentos en 3D: un tramo recto de cauce de 10 m de ancho con el lecho del grano escogido y una
// pared de vidrio al frente. Los granos se quedan quietos, ruedan y saltan por el fondo o van suspendidos, repartidos
// en la altura según el perfil de Rouse; el agua se enturbia con lo que va suspendido. Los granos menores de 8 cm se
// dibujan de 8 cm (la escena dice cuántas veces se aumentaron) para que se vean; la profundidad del agua está a escala.
// Los granos se dibujan en la franja de 1,6 m junto al vidrio, que es la que se ve; el resto del lecho es del mismo color.

import * as THREE from 'three';
import { meadow } from '../../three/scenery';
import { BED_W, rouseProfile, type SedimentResult } from '../sediment';
import { BEDFORM_NAME, transport, type TransportResult } from '../advanced';
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
  private formTop: THREE.Mesh;
  private formSide: THREE.Mesh;
  private tr: TransportResult | null = null;
  private phase = 0;
  private bedBase: { x: number; y: number; z: number; q: THREE.Quaternion; s: THREE.Vector3 }[] = [];
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
    // orilla de atrás (a la cota de la ribera) y la de adelante (más baja, desde donde se mira por el vidrio)
    const back = meadow({ keep: [-150, 150, -HB - 14, -HB], extent: [-160, 160, -HB - 220, -HB], y0: 3, hills: 10, ramp: 40, cell: 2.5, seed: 9 });
    sc.add(back.mesh);
    const front = meadow({ keep: [-160, 160, HB, HB + 300], extent: [-160, 160, HB, HB + 200], y0: -0.6, hills: 0, cell: 3, seed: 10 });
    sc.add(front.mesh);
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
    for (let k = 0; k < 70; k++) {
      const x = -120 + R() * 240, z = -HB - 6 - R() * 110;
      ts.push({ x, y: back.height(x, z), z, r: 1.4 + R() * 1.6 });
    }
    sc.add(trees(ts, 7));
    // formas del lecho (rizos, dunas, antidunas): superficie en la franja junto al vidrio y su cara en el corte
    const fg = new THREE.PlaneGeometry(GL, BAND + 0.1, 260, 2);
    fg.rotateX(-Math.PI / 2);
    fg.translate(0, 0, HB - (BAND + 0.1) / 2 - 0.03);
    this.formTop = new THREE.Mesh(fg, this.bedMat);
    this.formTop.receiveShadow = true;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(261 * 2 * 3), 3));
    const si: number[] = [];
    for (let k = 0; k < 260; k++) si.push(2 * k, 2 * k + 2, 2 * k + 1, 2 * k + 1, 2 * k + 2, 2 * k + 3);
    sg.setIndex(si);
    this.formSide = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: '#7d6a4f', roughness: 1, side: THREE.DoubleSide }));
    this.formTop.visible = this.formSide.visible = false;
    sc.add(this.formTop, this.formSide);
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
    for (const w of [this.water]) w.setEnvironment(stage.scene.environment);
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
      const bx = -GL / 2 + R() * GL, bz = HB - 0.05 - R() * BAND;
      this.bedBase[k] = { x: bx, y: s * 0.45, z: bz, q: q.clone(), s: new THREE.Vector3(s, s * 0.75, s) };
      this.bed.setMatrixAt(k, m4.compose(p.set(bx, s * 0.45, bz), q, sv.set(s, s * 0.75, s)));
      this.bed.setColorAt(k, base.clone().multiplyScalar(0.78 + R() * 0.44));
    }
    this.bed.instanceMatrix.needsUpdate = true;
    if (this.bed.instanceColor) this.bed.instanceColor.needsUpdate = true;
    (this.moving.material as THREE.MeshStandardMaterial).color.copy(base);
    // agua: color según lo que va suspendido
    const susp = r.mode === 'lavado' ? 1 : r.mode === 'suspension' ? 0.75 : r.mode === 'mixto' ? 0.4 : 0;
    this.water.setColor(new THREE.Color('#2f84b5').lerp(new THREE.Color('#9a7d55'), susp));
    this.water.setSpeed(r.V);
    // formas del lecho con van Rijn (1984); en arena, el lecho se dibuja como superficie (sin granos aumentados)
    this.tr = transport({ d: r.inp.d, h: r.h, V: r.V, S: r.inp.S, R: r.R });
    const hasForm = this.tr.dune.height > 0.002;
    this.formTop.visible = this.formSide.visible = hasForm;
    this.bed.visible = !(hasForm && r.inp.d < 0.002);
    (this.formSide.material as THREE.MeshStandardMaterial).color.copy(this.bedMat.color).multiplyScalar(0.85);
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
    const t = this.tr;
    if (t && t.dune.height > 0.002) {
      const perHour = t.dune.celerity * 3600;
      out.push({ id: 'formas', text: `El fondo forma ${BEDFORM_NAME[t.bedform]}`, sub: `alto ${es(t.dune.height * 100, 1)} cm · largo ${es(t.dune.length, 2)} m · ${t.bedform === 'antidunas' ? 'casi quietas' : `avanzan ${perHour >= 1 ? `${es(perHour, 1)} m` : `${es(perHour * 100, 1)} cm`} por hora (acelerado en la escena)`}`, at: new THREE.Vector3(-3, -0.1, HB), kind: 'dato', prio: 5 });
    }
    if (k > 1.5) out.push({ id: 'escala', text: `Granos dibujados ${Math.round(k).toLocaleString('es-CO')} veces más grandes`, sub: `grano real de ${r.inp.d < 0.002 ? es(r.inp.d * 1000, 2) + ' mm' : es(r.inp.d * 100, 1) + ' cm'}`, at: new THREE.Vector3(5, 0.3, HB), kind: 'dato', prio: 2 });
    return out;
  }

  /** Alto del lecho en x por las formas del lecho (perfil asimétrico de duna o seno de antiduna). */
  private eta(x: number): number {
    const tr = this.tr;
    if (!tr || tr.dune.height <= 0.002) return 0;
    const L = tr.dune.length, H = tr.dune.height;
    if (tr.bedform === 'antidunas') return (H / 2) * (1 + Math.sin((2 * Math.PI * (x - this.phase)) / L));
    const p = ((((x - this.phase) / L) % 1) + 1) % 1;
    return p < 0.8 ? (H * p) / 0.8 : H * (1 - (p - 0.8) / 0.2);
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    const r = this.r;
    if (!r) return;
    const tr = this.tr;
    if (tr && tr.dune.height > 0.002) {
      // avance acelerado: una longitud de onda cada 25 s (las antidunas pueden ir contra la corriente: se dibujan quietas)
      if (!this.stage.reducedMotion && tr.bedform !== 'antidunas') this.phase += (tr.dune.length / 25) * Math.min(0.05, dt);
      const pos = this.formTop.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) pos.setY(k, this.eta(pos.getX(k)));
      pos.needsUpdate = true;
      this.formTop.geometry.computeVertexNormals();
      const sp = this.formSide.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k <= 260; k++) {
        const x = -GL / 2 + (GL * k) / 260;
        sp.setXYZ(2 * k, x, -0.02, HB - 0.03);
        sp.setXYZ(2 * k + 1, x, this.eta(x), HB - 0.03);
      }
      sp.needsUpdate = true;
      this.formSide.geometry.computeVertexNormals();
      if (this.bed.visible) {
        const mb = new THREE.Matrix4(), pb = new THREE.Vector3();
        for (let k = 0; k < this.bedBase.length; k++) {
          const b = this.bedBase[k];
          this.bed.setMatrixAt(k, mb.compose(pb.set(b.x, b.y + this.eta(b.x), b.z), b.q, b.s));
        }
        this.bed.instanceMatrix.needsUpdate = true;
      }
    }
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
      p.set(x, y + (inSusp ? 0 : this.eta(x)), HB - 0.15 - sd.z * (BAND - 0.2));
      q.setFromEuler(new THREE.Euler(tt * 3 + k, tt * 2, 0));
      sv.setScalar(gr * (inSusp ? 0.7 : 1));
      this.moving.setMatrixAt(k, m4.compose(p, q, sv));
    }
    this.moving.instanceMatrix.needsUpdate = true;
    void dt;
  }
}

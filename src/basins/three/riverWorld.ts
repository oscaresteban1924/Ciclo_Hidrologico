// «Crecientes y riesgo» en 3D: un tramo de río ilustrativo con su cauce, las llanuras a cada lado y casas a distintas
// distancias. El agua sube al nivel que calcula la sección dividida para el caudal del período de retorno elegido; una
// regla en la orilla marca los niveles de 2, 10, 50 y 100 años. El agua se dibuja con su profundidad calculada.

import * as THREE from 'three';
import { houses, noise2, rng, trees, waterMaterial, type HouseSpot, type TreeSpot } from '../../quality/three/kit';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { RIVER, RIVER_HOUSES, groundAt } from '../river';

const XL = 150, ZW = 110;

export { groundAt };

export interface RiverMark {
  T: number;
  y: number;
}

export interface RiverHouse {
  z: number;
  y: number;
  /** Profundidad del agua sobre el piso (m), o 0. */
  wet: number;
}

export class RiverWorld {
  private stage: QStage;
  private time = { value: 0 };
  private water: THREE.Mesh;
  private level = 0.8;
  private target = 0.8;
  private markGroup = new THREE.Group();
  private houseSpots: { x: number; z: number; y: number }[] = [];
  private marks: RiverMark[] = [];
  private labelT = 0;
  private label = '';
  readonly views: Record<'general' | 'regla' | 'casas', StageView> = {
    general: { eye: [-150, 70, 150], target: [0, 2, 0], portrait: { eye: [-170, 120, 230], target: [0, 2, 0] } },
    regla: { eye: [-26, 9, 34], target: [-6, 3, 12], fit: 40 },
    casas: { eye: [-34, 30, -20], target: [8, 3, 32], fit: 90 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(160);
    // terreno: el corte extruido a lo largo del río, con algo de rugosidad lejos del cauce
    const g = new THREE.PlaneGeometry(2 * XL, 2 * ZW, 90, 140);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const y0 = groundAt(z);
      const far = Math.max(0, Math.abs(z) - 14);
      const y = y0 + (far > 0 ? noise2(x * 0.04, z * 0.04) * Math.min(1.2, far * 0.02) : 0);
      pos.setY(k, y);
      const a = Math.abs(z);
      c.set(a <= RIVER.b / 2 + 0.5 ? '#7b6a52' : a < 12 ? '#a39070' : a < 72 ? '#9cc373' : '#7aa35e');
      const v = 0.92 + 0.1 * noise2(x * 0.3, z * 0.3);
      col.set([c.r * v, c.g * v, c.b * v], 3 * k);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    ground.receiveShadow = true;
    sc.add(ground);
    // agua: un plano al nivel calculado (el terreno tapa lo que queda por debajo)
    const wg = new THREE.PlaneGeometry(2 * XL, 2 * ZW, 1, 1);
    wg.rotateX(-Math.PI / 2);
    const wc = new THREE.Color('#3f7fa8');
    wg.setAttribute('color', new THREE.Float32BufferAttribute([wc.r, wc.g, wc.b, wc.r, wc.g, wc.b, wc.r, wc.g, wc.b, wc.r, wc.g, wc.b], 3));
    this.water = new THREE.Mesh(wg, waterMaterial(this.time, { opacity: 0.82, speed: 0.4 }));
    this.water.renderOrder = 2;
    sc.add(this.water);
    // casas en las llanuras a varias distancias del cauce, y árboles en las laderas
    const R = rng(11);
    const hs: HouseSpot[] = RIVER_HOUSES.map((h) => ({ ...h }));
    for (const h of RIVER_HOUSES) this.houseSpots.push({ x: h.x, z: h.z, y: h.y });
    sc.add(houses(hs));
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 260; k++) {
      const side = R() < 0.5 ? -1 : 1, z = side * (74 + R() * 34), x = -XL + R() * 2 * XL;
      ts.push({ x, y: groundAt(z), z, r: 2.4 + R() * 2 });
    }
    for (let k = 0; k < 60; k++) {
      const side = R() < 0.5 ? -1 : 1, z = side * (11 + R() * 3), x = -XL + R() * 2 * XL;
      ts.push({ x, y: groundAt(z), z, r: 1.8 + R() * 1.2 });
    }
    sc.add(trees(ts, 6));
    // regla de niveles en la orilla izquierda
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7, 0.35), new THREE.MeshStandardMaterial({ color: '#f4f1e8' }));
    post.position.set(-6, 3.5, 11.2);
    post.castShadow = true;
    sc.add(post, this.markGroup);
    stage.view(this.views.general, false);
  }

  /** Marcas de los niveles de 2, 10, 50 y 100 años (profundidad sobre el fondo, m). */
  setMarks(marks: RiverMark[]): void {
    this.marks = marks;
    this.markGroup.clear();
    const colors = ['#2e7d32', '#f2b705', '#e67e22', '#c0392b'];
    marks.forEach((m, k) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: colors[k % colors.length] }));
      bar.position.set(-6, m.y, 11.2);
      this.markGroup.add(bar);
    });
  }

  /** Nivel del agua (profundidad sobre el fondo del cauce) al que debe llegar. */
  setLevel(y: number, label: string): void {
    this.target = y;
    this.label = label;
    if (this.stage.reducedMotion) this.level = y;
    this.labelsNow();
  }

  houses(level = this.level): RiverHouse[] {
    return this.houseSpots.map((h) => ({ z: h.z, y: h.y, wet: Math.max(0, level - h.y) }));
  }

  private labelsNow(): void {
    const es = (x: number, d = 2) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const wet = this.houses().filter((h) => h.wet > 0.05).length;
    const out: StageLabel[] = [
      { id: 'nivel', text: this.label || 'Nivel del agua', sub: `${es(this.level)} m sobre el fondo`, at: new THREE.Vector3(-6, this.level + 2.2, 11.2), kind: 'sonda', prio: 6 },
      { id: 'casas', text: wet ? `${wet} casas con agua adentro` : 'Las casas están secas', sub: 'llanura del río', at: new THREE.Vector3(30, 10, 40), kind: wet ? 'alerta' : 'ok', prio: 5 },
    ];
    this.marks.forEach((m) => out.push({ id: `m${m.T}`, text: `${m.T} años`, at: new THREE.Vector3(-4.6, m.y, 11.6), kind: 'dato', prio: 2 }));
    this.stage.setLabels(out);
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    // el nivel se acerca al calculado en algo más de un segundo, aunque el equipo dibuje pocos cuadros
    const h = Math.min(0.25, Math.max(0, dt));
    if (this.target !== this.level) {
      this.level += (this.target - this.level) * Math.min(1, h * 2.2);
      if (Math.abs(this.target - this.level) < 2e-3) this.level = this.target;
      this.labelT += h;
      if (this.labelT > 0.2 || this.level === this.target) {
        this.labelT = 0;
        this.labelsNow();
      }
    }
    this.water.position.y = this.level;
  }
}

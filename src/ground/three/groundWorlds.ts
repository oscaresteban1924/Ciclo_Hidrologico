// Escenas 3D de la sala «Aguas subterráneas»: el acuífero libre entre la loma y el río (corte con el nivel freático y
// partículas que viajan), el pozo con su cono de abatimiento (corte por el pozo) y la mancha que viaja hacia un pozo
// (planta, con la zona de captura). Todas son maquetas ilustrativas; donde una escala se exagera, el rótulo lo dice.

import * as THREE from 'three';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { houses, noise2, trees, type TreeSpot } from '../../quality/three/kit';
import { polyline, setPolyline } from '../../canals/three/canalKit';
import { diorama } from '../../supply/three/supplyKit';
import { SOILS, captureZone, theis, type Particle, type Soil } from '../aquifer';
import { AQ, PLUME, WELL, plumeQ, wellT, type AquiferResult, type WellScene } from '../scene';

const es = (x: number, d = 1) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const SOIL_COLOR: Record<Soil, string> = { grava: '#9a958c', arena: '#d6bf86', arenafina: '#c9b27c', limo: '#9c8063', arcilla: '#a5674a' };
const seeded = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

// ------------------------------------------------------------------ 1. el acuífero

const AX = (x: number) => x - 320;
const groundAt = (x: number) => (x < 560 ? 40 - (16 * x) / 600 + 2.5 * Math.exp(-((x - 60) ** 2) / 3000) : x < 590 ? 40 - (16 * 560) / 600 - ((x - 560) / 30) * 8 : 17);

export class AquiferWorld {
  private stage: QStage;
  private section: THREE.Mesh;
  private water: THREE.Mesh;
  private table = polyline('#1f78b4', false);
  private parts: THREE.InstancedMesh;
  private pos: { x: number; f: number }[] = [];
  private wells: { x: number; col: THREE.Mesh }[] = [];
  private r: AquiferResult | null = null;
  /** Días del modelo por segundo de animación. */
  daysPerSecond = 1;
  private m4 = new THREE.Matrix4();
  readonly views: Record<'general' | 'pozos' | 'rio', StageView> = {
    general: { eye: [-330, 85, 230], target: [-10, 12, -30], portrait: { eye: [-420, 160, 520], target: [0, 12, -30] } },
    pozos: { eye: [-60, 35, 120], target: [-20, 20, 0], fit: 200 },
    rio: { eye: [330, 40, 110], target: [270, 18, 0], fit: 140 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(360);
    const green = new THREE.Color('#8fbf6a');
    sc.add(diorama((x, z) => groundAt(x + 320) + (z < -6 ? noise2(x * 0.02, z * 0.03) * 1.5 : 0), -320, 320, -90, 0, 128, 18, (x, z) => green.clone().multiplyScalar(0.93 + 0.08 * noise2(x * 0.2, z * 0.2)), -3));
    // corte del frente: el material del acuífero hasta la superficie, y el agua (saturado) encima
    const g = new THREE.PlaneGeometry(640, 1, 160, 1);
    this.section = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#d6bf86', roughness: 1 }));
    this.section.position.z = 0.15;
    const wg = new THREE.PlaneGeometry(640, 1, 160, 1);
    this.water = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: '#3f8fc4', transparent: true, opacity: 0.4, depthWrite: false }));
    this.water.position.z = 0.35;
    this.shapeSection();
    // río
    const river = new THREE.Mesh(new THREE.BoxGeometry(50, 3, 90), new THREE.MeshStandardMaterial({ color: '#2f84b5', transparent: true, opacity: 0.85, roughness: 0.15 }));
    river.position.set(AX(615), AQ.h2 - 1.5, -45);
    sc.add(this.section, this.water, river, this.table);
    // pozos de observación en el corte
    for (const x of [120, 300, 480]) {
      const casing = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, groundAt(x) + 1.5, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#e8e2d2', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      casing.position.set(AX(x), (groundAt(x) + 1.5) / 2, 1.4);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1, 12), new THREE.MeshStandardMaterial({ color: '#2f84b5', emissive: '#12466a', emissiveIntensity: 0.3 }));
      col.position.set(AX(x), 0, 1.4);
      sc.add(casing, col);
      this.wells.push({ x, col });
    }
    const R = seeded(4);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 120; k++) {
      const x = R() * 560, z = -8 - R() * 78;
      ts.push({ x: AX(x), y: groundAt(x), z, r: 1.8 + R() * 1.8 });
    }
    sc.add(trees(ts, 6));
    this.parts = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshStandardMaterial({ color: '#cfeeff', emissive: '#2a8fd0', emissiveIntensity: 0.7 }), 140);
    this.parts.frustumCulled = false;
    for (let k = 0; k < 140; k++) this.pos.push({ x: R() * 590, f: 0.08 + R() * 0.85 });
    sc.add(this.parts);
    stage.view(this.views.general, false);
  }

  private shapeSection(): void {
    const top = (x: number) => groundAt(x);
    const sp = this.section.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < sp.count; k++) {
      const x = sp.getX(k) + 320, isTop = sp.getY(k) > 0;
      sp.setXYZ(k, sp.getX(k) - 0, isTop ? Math.max(0.05, x < 585 ? top(x) : AQ.h2 - 3) : 0, 0);
    }
    sp.needsUpdate = true;
    this.section.geometry.computeVertexNormals();
  }

  set(r: AquiferResult): void {
    this.r = r;
    (this.section.material as THREE.MeshStandardMaterial).color.set(SOIL_COLOR[r.s.soil]);
    const wp = this.water.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < wp.count; k++) {
      const x = Math.min(600, wp.getX(k) + 320 + (wp.getX(k) === 320 ? 0 : 0));
      const isTop = k <= 160;
      wp.setY(k, isTop ? Math.min(groundAt(Math.min(584, x)), x >= 600 ? AQ.h2 : r.h(x)) : 0);
    }
    wp.needsUpdate = true;
    setPolyline(this.table, Array.from({ length: 61 }, (_, k) => new THREE.Vector3(AX(k * 10), r.h(k * 10) + 0.05, 0.6)));
    for (const w of this.wells) {
      const h = r.h(w.x);
      w.col.scale.y = h;
      w.col.position.y = h / 2;
    }
    this.daysPerSecond = r.travel / 20;
    const out: StageLabel[] = [
      ...this.wells.map((w, k) => ({ id: `w${k}`, text: `Pozo ${k + 1}: ${es(r.h(w.x), 2)} m`, sub: `${es(w.x, 0)} m de la loma`, at: new THREE.Vector3(AX(w.x), groundAt(w.x) + 5, 1.4), kind: 'dato' as const, prio: 3 })),
      { id: 'rio', text: 'El río', sub: `agua a ${es(AQ.h2, 0)} m`, at: new THREE.Vector3(AX(612), AQ.h2 + 6, -10), kind: 'lugar', prio: 4 },
      { id: 'viaje', text: `${SOILS[r.s.soil].name}: ${r.travel < 730 ? `${es(r.travel, 0)} días` : `${es(r.travel / 365, r.travel > 36500 ? 0 : 1)} años`} de la loma al río`, sub: `animación: 1 s = ${this.daysPerSecond < 1 ? `${es(this.daysPerSecond * 24, 1)} horas` : this.daysPerSecond < 730 ? `${es(this.daysPerSecond, 1)} días` : `${es(this.daysPerSecond / 365, 0)} años`}`, at: new THREE.Vector3(AX(80), 46, 0), kind: 'sonda', prio: 5 },
    ];
    this.stage.setLabels(out);
  }

  update(dt: number): void {
    const r = this.r;
    if (!r) return;
    const h = Math.min(0.1, Math.max(0, dt));
    for (let k = 0; k < this.pos.length; k++) {
      const p = this.pos[k];
      if (!this.stage.reducedMotion) p.x += r.v(p.x) * this.daysPerSecond * h;
      if (p.x > 588) p.x = 2;
      const y = p.f * r.h(p.x);
      this.m4.makeTranslation(AX(p.x), y, 0.8);
      this.parts.setMatrixAt(k, this.m4);
    }
    this.parts.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ 2. el pozo

const TOP = 25, SURF = 32, STATIC = 29, RW = 250;

export class WellWorld {
  private stage: QStage;
  private cone: THREE.Mesh;
  private profile = polyline('#1f78b4', false);
  private obs: { r: number; col: THREE.Mesh }[] = [];
  private s: WellScene | null = null;
  private t = 1;
  ex = 10;
  readonly views: Record<'general' | 'pozo' | 'arriba', StageView> = {
    general: { eye: [150, 85, 250], target: [10, 16, -40], fit: 420, portrait: { eye: [160, 170, 520], target: [0, 16, -40] } },
    pozo: { eye: [70, 40, 95], target: [20, 20, -10], fit: 140 },
    arriba: { eye: [0, 420, 30], target: [0, 0, -80] },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(420);
    const green = new THREE.Color('#93bf6c');
    // la mitad de atrás del bloque (z ≤ 0): el corte pasa por el pozo
    sc.add(diorama((x, z) => SURF + noise2(x * 0.01, z * 0.01) * 0.6 * Math.min(1, -z / 20), -RW, RW, -RW, 0, 80, 40, (x, z) => green.clone().multiplyScalar(0.93 + 0.08 * noise2(x * 0.15, z * 0.15)), -2));
    // capas en el corte: arena (acuífero) y arcilla (capa confinante)
    const layer = (y0: number, y1: number, color: string) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * RW, y1 - y0), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
      m.position.set(0, (y0 + y1) / 2, 0.15);
      sc.add(m);
    };
    layer(0, TOP, '#d6bf86');
    layer(TOP, SURF - 1.5, '#a5674a');
    layer(SURF - 1.5, SURF, '#7f5f40');
    // cono: superficie piezométrica en una malla polar sobre la mitad de atrás
    const nr = 60, nt = 48;
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array((nr + 1) * (nt + 1) * 3), idx: number[] = [];
    for (let i = 0; i <= nr; i++) for (let j = 0; j <= nt; j++) {
      const k = i * (nt + 1) + j;
      if (i < nr && j < nt) idx.push(k, k + nt + 1, k + 1, k + 1, k + nt + 1, k + nt + 2);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setIndex(idx);
    this.cone = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#2f8fd8', emissive: '#1b5f9a', emissiveIntensity: 0.35, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, roughness: 0.2 }));
    this.cone.userData = { nr, nt };
    sc.add(this.cone, this.profile);
    // pozo de bombeo y casa de bombas
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, SURF + 1, 14), new THREE.MeshStandardMaterial({ color: '#d9d4c7' }));
    casing.position.set(0, (SURF + 1) / 2, 0.6);
    const hut = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 8), new THREE.MeshStandardMaterial({ color: '#e3dccb' }));
    hut.position.set(0, SURF + 3, -10);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(11, 0.8, 9), new THREE.MeshStandardMaterial({ color: '#7d3b2b' }));
    roof.position.set(0, SURF + 6.4, -10);
    sc.add(casing, hut, roof);
    for (const r of WELL.rObs) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, SURF + 1, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#e8e2d2', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      c.position.set(r, (SURF + 1) / 2, 0.8);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1, 12), new THREE.MeshStandardMaterial({ color: '#2f84b5', emissive: '#12466a', emissiveIntensity: 0.3 }));
      col.position.set(r, 0, 0.8);
      sc.add(c, col);
      this.obs.push({ r, col });
    }
    const R = seeded(8);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 70; k++) ts.push({ x: -RW + 10 + R() * (2 * RW - 20), y: SURF, z: -20 - R() * (RW - 30), r: 2 + R() * 2 });
    sc.add(trees(ts, 3));
    sc.add(houses(Array.from({ length: 18 }, () => ({ x: -230 + R() * 170, y: SURF, z: -40 - R() * 190, w: 8 + R() * 4, d: 8 + R() * 4, h: 4 + R() * 5, rot: R() * 0.3, wall: ['#e8d9c0', '#c06c48', '#f0c9a2', '#bcd6e6'][Math.floor(R() * 4)] }))));
    stage.view(this.views.general, false);
  }

  /** Abatimiento del modelo (m) a la distancia r en el tiempo t. */
  private sOf(r: number, t: number): number {
    const s = this.s as WellScene;
    return theis(s.Qls * 86.4, wellT(s.soil), WELL.S, Math.max(WELL.rw, r), t);
  }

  set(s: WellScene, t = s.t): void {
    this.s = s;
    this.t = t;
    // exageración vertical: el cono a 10 m llega a unos 15 m de dibujo, con un factor redondo
    const s10 = this.sOf(10, s.t);
    const want = 15 / Math.max(1e-6, s10);
    this.ex = [1, 2, 5, 10, 20, 50].reduce((a, v) => (v <= want ? v : a), 1);
    this.draw();
  }

  /** Muestra el cono en el tiempo t (días) sin cambiar los datos. */
  at(t: number): void {
    this.t = t;
    this.draw();
  }

  private draw(): void {
    const s = this.s;
    if (!s) return;
    const { nr, nt } = this.cone.userData as { nr: number; nt: number };
    const p = this.cone.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i <= nr; i++) {
      const r = Math.pow(10, Math.log10(1.5) + (i * (Math.log10(RW) - Math.log10(1.5))) / nr);
      const y = STATIC - this.ex * this.sOf(r, this.t);
      for (let j = 0; j <= nt; j++) {
        const th = Math.PI + (j * Math.PI) / nt;
        p.setXYZ(i * (nt + 1) + j, r * Math.cos(th), y, Math.min(0, r * Math.sin(th)));
      }
    }
    p.needsUpdate = true;
    this.cone.geometry.computeVertexNormals();
    const xs = Array.from({ length: 161 }, (_, k) => -RW + (k * 2 * RW) / 160);
    setPolyline(this.profile, xs.map((x) => new THREE.Vector3(x, STATIC - this.ex * this.sOf(Math.abs(x), this.t), 0.5)));
    for (const o of this.obs) {
      const h = STATIC - this.ex * this.sOf(o.r, this.t);
      o.col.scale.y = Math.max(0.05, h);
      o.col.position.y = Math.max(0.05, h) / 2;
    }
    const sw = this.sOf(WELL.rw, this.t);
    const out: StageLabel[] = [
      { id: 'pozo', text: `Pozo: baja ${es(sw, 2)} m`, sub: `${es(s.Qls, 1)} L/s · ${this.t < 1 ? `${es(this.t * 24, 1)} horas` : `${es(this.t, 1)} días`} de bombeo`, at: new THREE.Vector3(0, SURF + 12, -10), kind: STATIC - sw < TOP ? 'alerta' : 'sonda', prio: 6 },
      ...this.obs.map((o, k) => ({ id: `o${k}`, text: `${o.r} m: ${es(this.sOf(o.r, this.t), 2)} m`, at: new THREE.Vector3(o.r, SURF + 4, 0.8), kind: 'dato' as const, prio: 3 })),
      { id: 'ex', text: `Cono con escala vertical ×${this.ex}`, sub: 'el resto de la maqueta, a escala', at: new THREE.Vector3(-170, SURF + 10, -40), kind: 'lugar', prio: 2 },
    ];
    this.stage.setLabels(out);
  }

  update(): void {
    /* el cono se redibuja cuando cambian los datos o el tiempo */
  }
}

// ------------------------------------------------------------------ 3. la mancha

const PX0 = -560, PX1 = 360, PZ = 260, PGROUND = 10;

export class PlumeWorld {
  private stage: QStage;
  private dots: THREE.InstancedMesh;
  private border = polyline('#c0392b', true);
  private source: THREE.Group;
  private ps: Particle[] = [];
  private m4 = new THREE.Matrix4();
  private captured = new THREE.Color('#8a96a0');
  private loose = new THREE.Color('#7b3fa0');
  readonly views: Record<'general' | 'arriba' | 'pozo', StageView> = {
    general: { eye: [-120, 330, 470], target: [-100, 0, 0], fit: 900, portrait: { eye: [-120, 560, 820], target: [-100, 0, 0] } },
    arriba: { eye: [-100, 820, 30], target: [-100, 0, 0] },
    pozo: { eye: [120, 120, 200], target: [0, 8, 0], fit: 260 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(520);
    const green = new THREE.Color('#9cc373'), field = new THREE.Color('#c9c27a');
    sc.add(diorama((x, z) => PGROUND + noise2(x * 0.01, z * 0.01) * 0.5, PX0, PX1, -PZ, PZ, 92, 52, (x, z) => (noise2(x * 0.006 + 3, z * 0.006) > 0.25 ? field.clone() : green.clone()).multiplyScalar(0.94 + 0.06 * noise2(x * 0.1, z * 0.1)), -4));
    // flechas del flujo regional
    for (let k = 0; k < 5; k++) {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 3), new THREE.MeshStandardMaterial({ color: '#2f84b5', emissive: '#1b4f86', emissiveIntensity: 0.4 }));
      arrow.rotation.z = -Math.PI / 2;
      arrow.position.set(PX0 + 40, PGROUND + 1, -200 + k * 100);
      sc.add(arrow);
    }
    // el pozo de abastecimiento
    const hut = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 10), new THREE.MeshStandardMaterial({ color: '#e3dccb' }));
    hut.position.set(0, PGROUND + 3.5, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.8, 11), new THREE.MeshStandardMaterial({ color: '#2f5f8a' }));
    roof.position.set(0, PGROUND + 7.4, 0);
    sc.add(hut, roof);
    // la fuente: un tanque enterrado de combustible bajo una estación
    this.source = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(22, 1, 16), new THREE.MeshStandardMaterial({ color: '#c0392b' }));
    canopy.position.y = PGROUND + 7;
    const pole = new THREE.Mesh(new THREE.BoxGeometry(1, 7, 1), new THREE.MeshStandardMaterial({ color: '#d9d4c7' }));
    pole.position.y = PGROUND + 3.5;
    this.source.add(canopy, pole);
    sc.add(this.source, this.border);
    const R = seeded(12);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 140; k++) ts.push({ x: PX0 + 10 + R() * (PX1 - PX0 - 20), y: PGROUND, z: -PZ + 10 + R() * (2 * PZ - 20), r: 2.4 + R() * 2.4 });
    sc.add(trees(ts.filter((t) => Math.hypot(t.x, t.z) > 30 && Math.hypot(t.x - PLUME.x0, t.z) > 30), 5));
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(2.2, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }), 800);
    this.dots.frustumCulled = false;
    sc.add(this.dots);
    stage.view(this.views.general, false);
  }

  set(Qls: number, y0: number, ps: Particle[], tDays: number, frac: number): void {
    this.ps = ps;
    this.source.position.set(PLUME.x0, 0, y0);
    if (Qls > 0) {
      const cz = captureZone(Qls * 86.4, PLUME.b, plumeQ());
      const ys = Array.from({ length: 81 }, (_, k) => (-0.495 + (k * 0.99) / 80) * cz.width);
      setPolyline(this.border, ys.map((y) => new THREE.Vector3(Math.max(PX0, cz.boundary(y)), PGROUND + 0.8, y)).filter((p) => Math.abs(p.z) < PZ), [6, 4]);
      this.border.visible = true;
    } else this.border.visible = false;
    this.draw();
    const yr = tDays / 365;
    this.stage.setLabels([
      { id: 'pozo', text: 'Pozo de abastecimiento', sub: `${es(Qls, 1)} L/s · le llega ${es(frac * 100, 0)} % de la mancha`, at: new THREE.Vector3(0, PGROUND + 14, 0), kind: frac > 0 ? 'alerta' : 'sonda', prio: 6 },
      { id: 'fuga', text: 'La fuga', sub: `a ${es(Math.abs(y0), 0)} m del eje del pozo`, at: new THREE.Vector3(PLUME.x0, PGROUND + 14, y0), kind: 'lugar', prio: 5 },
      { id: 't', text: `Año ${es(yr, 1)}`, sub: 'la mancha va bajo tierra; se dibuja encima para verla', at: new THREE.Vector3(PX0 + 90, PGROUND + 30, -PZ + 30), kind: 'dato', prio: 4 },
      ...(Qls > 0 ? [{ id: 'zona', text: 'Borde de la zona de captura', at: new THREE.Vector3(-240, PGROUND + 6, Math.min(PZ - 20, captureZone(Qls * 86.4, PLUME.b, plumeQ()).width / 2 - 10)), kind: 'dato' as const, prio: 2 }] : []),
    ]);
  }

  private draw(): void {
    const n = Math.min(this.ps.length, 800);
    for (let k = 0; k < 800; k++) {
      const p = this.ps[k];
      if (k >= n || !p || p.x < PX0 || p.x > PX1 || Math.abs(p.y) > PZ) {
        this.dots.setMatrixAt(k, this.m4.makeScale(0, 0, 0));
        continue;
      }
      this.dots.setMatrixAt(k, this.m4.makeTranslation(p.caught >= 0 ? 0 : p.x, PGROUND + 1.2, p.caught >= 0 ? 0 : p.y));
      this.dots.setColorAt(k, p.caught >= 0 ? this.captured : this.loose);
    }
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
  }

  update(): void {
    this.draw();
  }
}

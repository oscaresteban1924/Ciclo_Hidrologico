// «Ondas y crecientes» en 3D: un canal de concreto de 300 m con pared de vidrio al frente. El agua se dibuja en
// cada cuadro con la profundidad y la velocidad que calcula el modelo de Saint-Venant (sin exagerar). La presa es
// una compuerta en x = 100 m que se levanta al romperse; la compuerta de x = 200 m baja hasta su abertura. Dos
// reglas (estaciones A y B) en el vidrio, trazadores que viajan con el agua y espuma en los frentes empinados.

import * as THREE from 'three';
import { meadow } from '../../three/scenery';
import { WAVE, type WaveSim } from '../waves';
import { concreteMaterial, rng, trees, type TreeSpot } from '../../quality/three/kit';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { Splash, Tracers, WaterBody, glassMaterial, slab, staffGauge, stationField, type Station } from './canalKit';

const HB = WAVE.b / 2;

export class WavesWorld {
  private stage: QStage;
  private time = { value: 0 };
  private sim: WaveSim | null = null;
  private water: WaterBody;
  private fall: WaterBody;
  private pit: WaterBody;
  private tracers: Tracers;
  private dyn = new THREE.Group();
  private dam: THREE.Mesh;
  private damLift = 0;
  private gate: THREE.Group;
  private gatePlate: THREE.Mesh;
  private builtS = NaN;
  private version = -1;
  private labelT = 0;
  private splash = new Splash(360, 0.05);
  /** Huella del nivel máximo en el vidrio y en la pared del fondo: una franja ocre donde el agua llegó y ya bajó. */
  private mark: THREE.Mesh;
  /** La cámara acompaña el frente de la onda. */
  follow = false;
  /** Segundos de simulación por segundo de reloj. */
  speed = 1;
  paused = false;
  readonly views: Record<'general' | 'presa' | 'compuerta', StageView> = {
    general: { eye: [-14, 11, 26], target: [120, -0.5, -4], portrait: { eye: [-20, 16, 40], target: [110, 0, -4] } },
    presa: { eye: [124, 5.5, 17], target: [104, 1.2, 0], fit: 36 },
    compuerta: { eye: [216, 4.5, 15], target: [198, 0.6, 0], fit: 30 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(160);
    stage.controls.minDistance = 3;
    sc.add(this.dyn);
    this.water = new WaterBody(this.time, { cols: 6, depthRef: 1.4 });
    this.water.setColor('#2f84b5');
    this.fall = new WaterBody(this.time, { side: false, cols: 4 });
    this.fall.setColor('#3d8fbe');
    this.pit = new WaterBody(this.time, { side: false, cols: 4 });
    this.pit.setColor('#3a86b4');
    sc.add(this.water.group, this.fall.group, this.pit.group);
    this.tracers = new Tracers(520, 0.07);
    sc.add(this.tracers.mesh);
    const conc = concreteMaterial('#c2bdb3');
    // presa: compuerta maciza que se levanta
    this.dam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, WAVE.b + 0.1), conc);
    this.dam.castShadow = true;
    sc.add(this.dam);
    // compuerta deslizante con su marco y su volante
    this.gate = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: '#7d8a94', metalness: 0.6, roughness: 0.35 });
    this.gatePlate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, WAVE.b - 0.04), steel);
    this.gatePlate.castShadow = true;
    this.gate.add(this.gatePlate);
    for (const z of [-HB - 0.2, HB + 0.2]) this.gate.add(slab(steel, -0.18, 0.18, 0, WAVE.wall + 1.6, z - 0.12, z + 0.12));
    this.gate.add(slab(steel, -0.2, 0.2, WAVE.wall + 1.4, WAVE.wall + 1.7, -HB - 0.35, HB + 0.35));
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 28), new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.5 }));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, WAVE.wall + 2.05, 0);
    this.gate.add(wheel);
    sc.add(this.gate);
    for (const w of [this.water, this.fall, this.pit]) w.setEnvironment(stage.scene.environment);
    sc.add(this.splash.mesh);
    // dos franjas (vidrio y pared del fondo) con WAVE.N columnas; el color lleva la transparencia de cada punto
    const nv = WAVE.N * 2 * 2;
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(nv * 3), 3));
    mg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(nv * 4), 4));
    const mi: number[] = [];
    for (let w = 0; w < 2; w++)
      for (let k = 0; k < WAVE.N - 1; k++) {
        const a = (w * WAVE.N + k) * 2;
        mi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    mg.setIndex(mi);
    this.mark = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mark.frustumCulled = false;
    this.mark.renderOrder = 4;
    sc.add(this.mark);
    stage.view(this.views.general, false);
  }

  private bed(x: number): number {
    return -(this.sim?.inp.S ?? 0) * x;
  }

  private build(): void {
    const sim = this.sim!;
    const S = sim.inp.S;
    if (S === this.builtS) return;
    this.builtS = S;
    for (const c of [...this.dyn.children]) {
      this.dyn.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const R = rng(51);
    const L = WAVE.L, H = WAVE.wall;
    const conc = concreteMaterial('#c2bdb3'), wallC = concreteMaterial('#b3ada2');
    const tilt = new THREE.Group();
    tilt.rotation.z = -Math.atan(S);
    // fondo, pared de atrás y vidrio al frente (el canal entero va inclinado con la pendiente)
    tilt.add(slab(conc, -0.4, L, -0.5, 0, -HB - 0.3, HB + 0.3));
    tilt.add(slab(wallC, -0.4, L, -0.5, H, -HB - 0.3, -HB));
    tilt.add(slab(wallC, -0.4, 0, 0, H, -HB, HB));
    tilt.add(slab(glassMaterial(0.1), 0, L, 0, H, HB, HB + 0.04, false));
    const steel = new THREE.MeshStandardMaterial({ color: '#5d6873', roughness: 0.5, metalness: 0.4 });
    for (let x = 10; x < L; x += 10) tilt.add(slab(steel, x - 0.05, x + 0.05, 0, H, HB + 0.04, HB + 0.1));
    tilt.add(slab(steel, 0, L, H, H + 0.08, HB - 0.02, HB + 0.1));
    // terreno: talud de atrás con pasto y relleno bajo el canal
    tilt.add(slab(new THREE.MeshStandardMaterial({ color: '#6a9a48', roughness: 1 }), -40, L + 2, -2.5, H, -HB - 40, -HB - 0.3, false));
    tilt.add(slab(new THREE.MeshStandardMaterial({ color: '#7d6a4f', roughness: 1 }), -40, L, -2.5, -0.5, -HB - 0.3, HB + 0.3, false));
    // reglas de las estaciones A y B
    for (const xg of WAVE.gauges) {
      const g = staffGauge(H, 0.1, 0.5, 0.16);
      g.position.set(xg, 0, HB + 0.11);
      tilt.add(g);
    }
    this.dyn.add(tilt);
    // al final, la caída a un tanque
    const yE = -S * L;
    this.dyn.add(slab(conc, L, L + 14, yE - 3.6, yE - 3.2, -HB - 2, HB + 2));
    this.dyn.add(slab(wallC, L + 14, L + 14.4, yE - 3.6, yE - 0.8, -HB - 2, HB + 2));
    for (const z of [-HB - 2.2, HB + 2]) this.dyn.add(slab(wallC, L, L + 14.4, yE - 3.6, yE - 0.8, z, z + 0.2));
    const land = meadow({ keep: [-80, L + 60, -HB - 70, HB + 12], extent: [-300, 600, -320, 320], y0: yE - 3.6, hills: 14, ramp: 70, cell: 4, seed: 8 });
    this.dyn.add(land.mesh);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 90; k++) {
      const x = -60 + R() * 420;
      const z = -HB - 8 - R() * 60;
      ts.push({ x, y: -S * Math.min(L, Math.max(0, x)) + H, z, r: 1.6 + R() * 1.8 });
    }
    for (let k = 0; k < 80; k++) {
      const x = -200 + R() * 700, z = HB + 14 + R() * 200;
      ts.push({ x, y: land.height(x, z), z, r: 1.6 + R() * 1.6 });
    }
    this.dyn.add(trees(ts, 7));
  }

  private lastScenario = '';

  set(sim: WaveSim): void {
    this.sim = sim;
    this.build();
    // cada situación abre con su vista: la presa, la compuerta o todo el canal
    if (sim.inp.scenario !== this.lastScenario) {
      const first = this.lastScenario === '';
      this.lastScenario = sim.inp.scenario;
      this.stage.view(this.views[sim.inp.scenario === 'presa' ? 'presa' : sim.inp.scenario === 'compuerta' ? 'compuerta' : 'general'], !first);
    }
    this.version = -1;
    this.draw(0);
  }

  /** Dibuja el agua y las estructuras con el estado actual del modelo. */
  private draw(dt: number): void {
    const sim = this.sim;
    if (!sim) return;
    const pts = sim.sv.points();
    const dx = sim.sv.dx;
    const st: Station[] = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dh = i > 0 && i < pts.length - 1 ? Math.abs(pts[i + 1].z - pts[i - 1].z) / (2 * dx) : 0;
      const wet = p.h > 0.004;
      const foam = wet ? Math.min(1, dh * 2.2 + (p.Fr > 1.15 ? 0.15 : 0) + (sim.inp.scenario === 'compuerta' && Math.abs(p.x - WAVE.xGate) < 6 && p.x > WAVE.xGate ? 0.5 : 0)) : 0;
      st[i] = { x: p.x, bed: p.zb + 0.003, depth: wet ? p.h : 0, halfW: HB - 0.02, foam, vel: Math.abs(p.u) };
    }
    this.water.updateFast(st);
    this.tracers.set(stationField(st.filter((s) => s.depth > 0.02)), 0, WAVE.L, [HB - 0.9, HB - 0.08], null, this.version < 0);
    // caída al tanque: lámina con la velocidad de la última celda
    const last = pts[pts.length - 1];
    const yE = this.bed(WAVE.L);
    const qEnd = Math.max(0, last.u * last.h);
    const fallSt: Station[] = [];
    if (qEnd > 0.01 && last.h > 0.01) {
      const v0 = Math.max(0.3, last.u);
      for (let k = 0; k <= 16; k++) {
        const t = k * 0.06;
        const yb = yE - 0.5 * 9.81 * t * t;
        if (yb < yE - 3.2) break;
        fallSt.push({ x: WAVE.L + v0 * t, bed: yb - last.h * 0.4, depth: Math.max(0.02, last.h * 0.8), halfW: HB - 0.05, foam: 0.25 + k * 0.03, vel: Math.hypot(v0, 9.81 * t) });
      }
    }
    this.fall.group.visible = fallSt.length >= 2;
    if (fallSt.length >= 2) this.fall.updateFast(fallSt);
    const pitD = Math.min(2.2, 0.3 + sim.sv.vOut / 900);
    this.drawMark(pts);
    this.emitSplash(dt, pts, last, qEnd, yE);
    this.pit.updateFast([
      { x: WAVE.L + 0.2, bed: yE - 3.2, depth: pitD, halfW: HB + 1.95, foam: qEnd > 0.05 ? 0.5 : 0.05, vel: 0.3 },
      { x: WAVE.L + 13.8, bed: yE - 3.2, depth: pitD, halfW: HB + 1.95, foam: 0.05, vel: 0.3 },
    ]);
    // presa
    const presa = sim.inp.scenario === 'presa';
    this.dam.visible = presa;
    if (presa) {
      const h = sim.inp.h0 + 0.5;
      const target = sim.broken ? WAVE.wall + 3 : 0;
      this.damLift = this.stage.reducedMotion ? target : this.damLift + (target - this.damLift) * Math.min(1, dt * 2.5);
      this.dam.scale.set(1, h, 1);
      this.dam.position.set(WAVE.xDam, this.bed(WAVE.xDam) + h / 2 + this.damLift, 0);
    }
    // compuerta
    const comp = sim.inp.scenario === 'compuerta';
    this.gate.visible = comp;
    if (comp) {
      const a = sim.sv.gate?.a ?? 0;
      const yb = this.bed(WAVE.xGate);
      const hp = WAVE.wall + 1.4 - a;
      this.gatePlate.scale.set(1, hp, 1);
      this.gatePlate.position.set(0, a + hp / 2, 0);
      this.gate.position.set(WAVE.xGate, yb, 0);
    }
  }

  /** Franja ocre de 4 cm en la cota máxima que alcanzó el agua, visible donde el agua ya bajó. */
  private drawMark(pts: { z: number }[]): void {
    const sim = this.sim!;
    const g = this.mark.geometry;
    const P = (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const Cc = (g.getAttribute('color') as THREE.BufferAttribute).array as Float32Array;
    const dx = sim.sv.dx;
    for (let w = 0; w < 2; w++) {
      const z = w ? -HB + 0.03 : HB - 0.03;
      for (let k = 0; k < WAVE.N; k++) {
        const zm = sim.zmax[k], over = zm - pts[k].z;
        const a = smooth(0.03, 0.12, over) * 0.9;
        const x = (k + 0.5) * dx;
        const i = (w * WAVE.N + k) * 2;
        P.set([x, zm - 0.03, z, x, zm + 0.01, z], 3 * i);
        Cc.set([0.82, 0.55, 0.12, a, 0.82, 0.55, 0.12, a], 4 * i);
      }
    }
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('color').needsUpdate = true;
  }

  /** Salpicaduras en el frente de la onda y donde la lámina de la caída golpea el tanque. */
  private emitSplash(dt: number, pts: { x: number; h: number; u: number; zb: number }[], last: { h: number; u: number }, qEnd: number, yE: number): void {
    const sim = this.sim!;
    if (dt > 0 && !this.paused) {
      const xf = sim.frontX();
      const v = sim.frontSpeed();
      if (xf !== null && v !== null && Math.abs(v) > 0.3) {
        const i = Math.max(0, Math.min(pts.length - 1, Math.floor(xf / sim.sv.dx)));
        const p = pts[i];
        // en el frente sobre canal seco la lengua es delgada: salpica poco; en el resalto que avanza, más
        const hJump = sim.inp.scenario === 'compuerta' ? Math.max(0, (sim.theory().h2 ?? 0) - sim.before.hA) : p.h;
        this.splash.emit(dt * this.speed, Math.min(220, 40 * Math.abs(v) * Math.min(1, hJump + 0.15)), xf, p.zb + p.h + 0.05, 0, 0.4, HB - 0.2, v * 0.6, 1.2 + 1.5 * Math.min(1, hJump), 0.5);
      }
      if (qEnd > 0.05 && last.h > 0.01) {
        const v0 = Math.max(0.3, last.u), tFall = Math.sqrt((2 * 3.2) / 9.81) * 0.85;
        this.splash.emit(dt * this.speed, Math.min(200, 30 * qEnd), WAVE.L + v0 * tFall, yE - 3.2 + Math.min(2.2, 0.3 + sim.sv.vOut / 900), 0, 0.5, HB - 0.3, 0.3, 2.2, 0.9);
      }
    }
    this.splash.update(dt * (this.paused ? 0 : 1), this.stage.reducedMotion);
  }

  private labels(): StageLabel[] {
    const sim = this.sim!;
    const es = (x: number, d = 2) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const out: StageLabel[] = [];
    WAVE.gauges.forEach((xg, k) => {
      const h = sim.sv.depthAt(xg), Q = sim.sv.flowAt(xg);
      out.push({ id: `est${k}`, text: `Estación ${k ? 'B' : 'A'}`, sub: `${es(h)} m · ${es(Q, 1)} m³/s`, at: new THREE.Vector3(xg, this.bed(xg) + WAVE.wall + 0.9, HB), kind: 'sonda', prio: 4 });
    });
    if (sim.inp.scenario === 'presa') out.push({ id: 'presa', text: sim.broken ? 'La presa se abrió' : 'Presa', sub: sim.broken ? undefined : `embalse de ${es(sim.inp.h0, 1)} m`, at: new THREE.Vector3(WAVE.xDam, this.bed(WAVE.xDam) + sim.inp.h0 + 1.4 + (sim.broken ? 2 : 0), 0), kind: 'lugar', prio: 5 });
    if (sim.inp.scenario === 'compuerta') {
      const a = sim.sv.gate?.a ?? 0;
      out.push({ id: 'comp', text: a > 0 ? 'Compuerta abierta' : 'Compuerta cerrada', sub: a > 0 ? `${es(a)} m` : undefined, at: new THREE.Vector3(WAVE.xGate, this.bed(WAVE.xGate) + WAVE.wall + 2.8, 0), kind: a > 0 ? 'lugar' : 'alerta', prio: 5 });
    }
    const xf = sim.frontX();
    if (xf !== null && xf > 0 && xf < WAVE.L - 2) {
      const v = sim.frontSpeed();
      out.push({ id: 'frente', text: 'Frente de la onda', sub: v !== null ? `${es(Math.abs(v), 1)} m/s ${v < 0 ? 'aguas arriba' : 'aguas abajo'}` : undefined, at: new THREE.Vector3(xf, this.bed(xf) + sim.sv.depthAt(xf) + 1.2, HB), kind: 'alerta', prio: 6 });
    }
    return out;
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    const sim = this.sim;
    if (!sim) return;
    const h = Math.min(0.05, Math.max(0, dt));
    // el modelo avanza también con movimiento reducido: es el cálculo, no un adorno
    if (!this.paused) sim.tick(h * this.speed);
    this.draw(h);
    this.tracers.update(h * this.speed, this.stage.reducedMotion);
    if (this.follow) {
      const xf = sim.frontX();
      if (xf !== null) {
        // la cámara se corre con el frente sin cambiar el ángulo que dejó quien mira
        const c = this.stage.controls, d = (xf - c.target.x) * Math.min(1, h * 2.5);
        c.target.x += d;
        this.stage.camera.position.x += d;
      }
    }
    this.labelT += dt;
    if (this.labelT > 0.25 || sim.version !== this.version) {
      this.labelT = 0;
      this.version = sim.version;
      this.stage.setLabels(this.labels());
    }
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

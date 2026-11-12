// «Cuencas» en 3D: una cuenca de ladera ilustrativa (no es una quebrada real) con su red de drenaje, coberturas
// (bosque, pasto, cultivos, barrio y vías, de arriba hacia abajo según las fracciones), lluvia, pulsos que viajan por
// los cauces con el tiempo de concentración calculado y la estación de aforo en la salida. Al «lanzar el aguacero» se
// reproduce el hietograma y el hidrograma calculados en tiempo comprimido (unos 24 s).

import * as THREE from 'three';
import { lookWater } from '../../three/look';
import { houses, noise2, rng, trees, type HouseSpot, type TreeSpot } from '../../quality/three/kit';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { staffGauge } from '../../canals/three/canalKit';
import { COVERS, type BasinResult, type Cover } from '../hydrology';

const X0 = -160, X1 = 160, Z0 = -110, Z1 = 110, NX = 128, NZ = 88;
const OUTLET = new THREE.Vector3(152, 0, 0);
const COVER_COLOR: Record<Cover, string> = { pavimento: '#8d8f91', barrio: '#cdb08f', cultivo: '#c9b860', pasto: '#93c06c', bosque: '#3f7a3a' };
const ORDER: Cover[] = ['pavimento', 'barrio', 'cultivo', 'pasto', 'bosque'];

/** Cauce principal: línea central que serpentea hasta la salida. */
const mainZ = (x: number) => 16 * Math.sin(x * 0.019 + 0.6) * (1 - (x - X0) / (X1 - X0)) ;

function segDist(px: number, pz: number, a: THREE.Vector2, b: THREE.Vector2): number {
  const abx = b.x - a.x, abz = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.y) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(px - (a.x + t * abx), pz - (a.y + t * abz));
}

export class BasinWorld {
  private stage: QStage;
  private ground: THREE.Mesh;
  private heights = new Float32Array((NX + 1) * (NZ + 1));
  private paths: THREE.Vector3[][] = [];
  private pathLen: number[] = [];
  private streams: THREE.Mesh[] = [];
  private streamMat: THREE.MeshStandardMaterial;
  private rain: THREE.Points;
  private rainV: Float32Array;
  private pulses: THREE.InstancedMesh;
  private pulseT: Float32Array;
  private veg = new THREE.Group();
  private r: BasinResult | null = null;
  private slope = 0.12;
  private builtKey = '';
  private m4 = new THREE.Matrix4();
  private playing = false;
  private tAnim = 0;
  private labelT = 0;
  /** Escala de la reproducción: minutos del modelo por segundo de animación. */
  private scale = 1;
  /** Llamado en cada cuadro durante el aguacero: minuto del modelo (o null al terminar). */
  onTime: ((tMin: number | null) => void) | null = null;
  readonly views: Record<'general' | 'salida' | 'arriba', StageView> = {
    general: { eye: [250, 245, 235], target: [-5, 0, 0], fit: 330, portrait: { eye: [300, 380, 360], target: [-10, 0, -10] } },
    salida: { eye: [196, 34, 66], target: [138, 2, 0], fit: 70 },
    arriba: { eye: [0, 380, 2], target: [0, 0, 0] },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(200);
    const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, NX, NZ);
    g.rotateX(-Math.PI / 2);
    g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    this.ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    this.ground.receiveShadow = true;
    sc.add(this.ground, this.veg);
    this.streamMat = new THREE.MeshStandardMaterial({ color: '#2f84b5', emissive: '#1f5f8a', emissiveIntensity: 0.15, roughness: 0.2, metalness: 0.05 });
    // lluvia
    const N = 1600, R = rng(9);
    const pos = new Float32Array(N * 3);
    this.rainV = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      pos[3 * k] = X0 + R() * (X1 - X0);
      pos[3 * k + 1] = 20 + R() * 120;
      pos[3 * k + 2] = Z0 + R() * (Z1 - Z0);
      this.rainV[k] = 60 + R() * 30;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: '#7fb2d9', size: 0.9, transparent: true, opacity: 0.75, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    sc.add(this.rain);
    // pulsos de agua por los cauces
    this.pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshStandardMaterial({ color: '#7fd0ff', emissive: '#2a8fd0', emissiveIntensity: 0.6 }), 60);
    this.pulses.frustumCulled = false;
    this.pulseT = new Float32Array(60).fill(-1);
    sc.add(this.pulses);
    // estación de aforo en la salida
    const st = new THREE.Group();
    const hut = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 4), new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.8 }));
    hut.position.set(0, 2, 0);
    hut.castShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.4, 4.6), new THREE.MeshStandardMaterial({ color: '#7d3b2b' }));
    roof.position.set(0, 4.2, 0);
    const gauge = staffGauge(4, 0.5, 1, 0.3);
    gauge.position.set(-4, 0, -6);
    st.add(hut, roof, gauge);
    st.position.set(OUTLET.x - 4, 0, OUTLET.z + 12);
    sc.add(st);
    this.station = st;
    // tanque de retención junto a la salida (solo en «El hidrograma», cuando se le da un volumen)
    const wall = new THREE.MeshStandardMaterial({ color: '#b9b4a8', roughness: 0.85 });
    const TW = 18, TD = 11, TH = 3.2;
    for (const [w, d, x, z] of [[TW + 0.8, 0.4, 0, -TD / 2], [TW + 0.8, 0.4, 0, TD / 2], [0.4, TD, -TW / 2, 0], [0.4, TD, TW / 2, 0]] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, TH + 4, d), wall);
      m.position.set(x, (TH - 4) / 2, z);
      m.castShadow = true;
      this.tank.add(m);
    }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(TW, 0.3, TD), wall);
    floor.position.y = 0.15;
    this.tankWater = new THREE.Mesh(new THREE.BoxGeometry(TW - 0.2, 1, TD - 0.2), lookWater(new THREE.MeshStandardMaterial({ color: '#3b8fc4', roughness: 0.1, transparent: true, opacity: 0.85 }), [0.05, 0.03], 0.35));
    this.tankWater.position.y = 0.3;
    this.tankWater.scale.y = 0.001;
    this.tankWater.userData.max = TH - 0.4;
    this.tank.add(floor, this.tankWater);
    this.tank.visible = false;
    sc.add(this.tank);
    stage.view(this.views.general, false);
  }

  private tank = new THREE.Group();
  private tankWater: THREE.Mesh;
  private tankFill: number[] | null = null;
  private tankNow = 0;

  /** Tanque de retención: fracción llena al final de cada intervalo Δt del hidrograma (o null: no hay tanque). */
  setTank(fill: number[] | null): void {
    this.tankFill = fill && fill.length ? fill : null;
    this.tank.visible = !!this.tankFill;
    if (!this.playing) this.setTankLevel(this.tankFill ? this.tankFill[this.tankFill.length - 1] : 0);
    this.stage.setLabels(this.labels(null));
  }

  private setTankLevel(f: number): void {
    this.tankNow = Math.max(0, Math.min(1, f));
    const max = this.tankWater.userData.max as number;
    this.tankWater.scale.y = Math.max(0.001, this.tankNow * max);
    this.tankWater.position.y = 0.3 + (this.tankNow * max) / 2;
  }

  private station: THREE.Group;

  private h(x: number, z: number, S: number): number {
    const u = (x - X0) / (X1 - X0);
    const along = Math.min(70, 420 * S) * Math.pow(1 - u, 1.15);
    const across = 40 * Math.pow(Math.abs(z) / 110, 1.7) * (0.55 + 0.45 * (1 - u));
    const rough = noise2(x * 0.025, z * 0.025) * 6 + noise2(x * 0.08 + 3, z * 0.08) * 1.8;
    // cauces: el principal y tres afluentes
    let carve = 0;
    const dz = z - mainZ(x);
    carve = Math.max(carve, 3.6 * Math.exp(-(dz * dz) / 50));
    for (const tr of this.tribs) {
      let d = Infinity;
      for (let k = 1; k < tr.length; k++) d = Math.min(d, segDist(x, z, tr[k - 1], tr[k]));
      carve = Math.max(carve, 2.4 * Math.exp(-(d * d) / 30));
    }
    return Math.max(0, along + across + rough * (0.4 + 0.6 * (1 - u)) - carve + 2);
  }

  /** Afluentes: curvas suaves desde la divisoria hasta su unión con el principal (puntos en planta). */
  private tribs: THREE.Vector2[][] = [
    curve(new THREE.Vector2(-96, -102), new THREE.Vector2(-86, -46), new THREE.Vector2(-40, mainZ(-40))),
    curve(new THREE.Vector2(-26, 102), new THREE.Vector2(-6, 50), new THREE.Vector2(30, mainZ(30))),
    curve(new THREE.Vector2(52, -102), new THREE.Vector2(92, -60), new THREE.Vector2(100, mainZ(100))),
  ];

  private skirt: THREE.Mesh | null = null;

  /** Borde de maqueta: paredes de suelo desde el contorno del terreno hasta la base, para que no se vea el vacío. */
  private buildSkirt(S: number): void {
    const BASE = -8;
    const edge: [number, number][] = [];
    for (let i = 0; i <= NX; i++) edge.push([X0 + ((X1 - X0) * i) / NX, Z0]);
    for (let j = 1; j <= NZ; j++) edge.push([X1, Z0 + ((Z1 - Z0) * j) / NZ]);
    for (let i = NX - 1; i >= 0; i--) edge.push([X0 + ((X1 - X0) * i) / NX, Z1]);
    for (let j = NZ - 1; j >= 0; j--) edge.push([X0, Z0 + ((Z1 - Z0) * j) / NZ]);
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const top = new THREE.Color('#8a6a48'), bot = new THREE.Color('#5b4630');
    edge.forEach(([x, z], k) => {
      pos.push(x, this.h(x, z, S), z, x, BASE, z);
      col.push(top.r, top.g, top.b, bot.r, bot.g, bot.b);
      if (k < edge.length - 1) {
        const a = 2 * k;
        idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (this.skirt) {
      this.skirt.geometry.dispose();
      this.skirt.geometry = g;
    } else {
      this.skirt = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
      const base = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 60, Z1 - Z0 + 60), new THREE.MeshStandardMaterial({ color: '#c9d6cf', roughness: 1 }));
      base.rotateX(-Math.PI / 2);
      base.position.set((X0 + X1) / 2, BASE, (Z0 + Z1) / 2);
      base.receiveShadow = true;
      this.stage.scene.add(this.skirt, base);
    }
  }

  private buildTerrain(S: number): void {
    const pos = this.ground.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const y = this.h(pos.getX(k), pos.getZ(k), S);
      pos.setY(k, y);
      this.heights[k] = y;
    }
    pos.needsUpdate = true;
    this.ground.geometry.computeVertexNormals();
    // cauces: el principal desde la cabecera y los afluentes hasta su unión
    for (const m of this.streams) {
      this.stage.scene.remove(m);
      m.geometry.dispose();
    }
    this.streams = [];
    this.paths = [];
    const main: THREE.Vector3[] = [];
    for (let x = X0 + 6; x <= OUTLET.x; x += 3) main.push(new THREE.Vector3(x, this.h(x, mainZ(x), S) + 0.35, mainZ(x)));
    this.paths.push(main);
    for (const tr of this.tribs) {
      const p: THREE.Vector3[] = tr.map((q) => new THREE.Vector3(q.x, this.h(q.x, q.y, S) + 0.3, q.y));
      // sigue por el principal hasta la salida
      const end = tr[tr.length - 1];
      for (const q of main) if (q.x > end.x) p.push(q.clone());
      this.paths.push(p);
    }
    this.buildSkirt(S);
    this.tank.position.set(OUTLET.x - 16, this.h(OUTLET.x - 16, OUTLET.z - 24, S), OUTLET.z - 24);
    this.pathLen = this.paths.map((p) => p.reduce((a, q, k) => a + (k ? q.distanceTo(p[k - 1]) : 0), 0));
    this.paths.forEach((p, k) => {
      const w = k === 0 ? 2.4 : 1.4;
      const geo = ribbon(k === 0 ? p : p.slice(0, Math.max(2, p.findIndex((q, j) => j > 0 && q.x > this.tribs[k - 1][this.tribs[k - 1].length - 1].x) + 1)), w);
      const m = new THREE.Mesh(geo, this.streamMat);
      this.streams.push(m);
      this.stage.scene.add(m);
    });
    this.station.position.y = this.h(this.station.position.x, this.station.position.z, S);
  }

  private paint(mix: Record<Cover, number>, seed: number): void {
    const pos = this.ground.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.ground.geometry.attributes.color as THREE.BufferAttribute;
    // de abajo hacia arriba: vías y barrio cerca de la salida, luego cultivos, pasto y bosque arriba
    const idx = Array.from({ length: pos.count }, (_, k) => k).sort((a, b) => this.heights[a] - this.heights[b]);
    const cuts: number[] = [];
    let acc = 0;
    for (const c of ORDER) {
      acc += mix[c];
      cuts.push(acc * pos.count);
    }
    const cover = new Array<Cover>(pos.count);
    idx.forEach((k, rank) => {
      let j = cuts.findIndex((v) => rank < v);
      if (j < 0) j = ORDER.length - 1;
      cover[k] = ORDER[j];
    });
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const z = pos.getZ(k), x = pos.getX(k);
      const inCh = Math.abs(z - mainZ(x)) < 3;
      c.set(inCh ? '#7b6a52' : COVER_COLOR[cover[k]]);
      const v = 0.9 + 0.12 * noise2(x * 0.2, z * 0.2);
      col.setXYZ(k, c.r * v, c.g * v, c.b * v);
    }
    col.needsUpdate = true;
    // árboles en el bosque, casas en el barrio
    this.veg.clear();
    const R = rng(seed);
    const ts: TreeSpot[] = [], hs: HouseSpot[] = [];
    for (let k = 0; k < pos.count; k += 1) {
      const x = pos.getX(k), z = pos.getZ(k), y = pos.getY(k);
      if (Math.abs(z - mainZ(x)) < 6) continue;
      if (cover[k] === 'bosque' && R() < 0.35 && ts.length < 900) ts.push({ x: x + (R() - 0.5) * 2, y, z: z + (R() - 0.5) * 2, r: 1.6 + R() * 1.4 });
      if (cover[k] === 'barrio' && R() < 0.55 && hs.length < 420) hs.push({ x: x + (R() - 0.5), y, z: z + (R() - 0.5), w: 2 + R() * 1.4, d: 2 + R() * 1.2, h: 2 + R() * 3.5, rot: R() * Math.PI, wall: ['#e8d9c0', '#c06c48', '#f0c9a2', '#bcd6e6', '#f2d27a'][Math.floor(R() * 5)] });
    }
    if (ts.length) this.veg.add(trees(ts, 4));
    if (hs.length) this.veg.add(houses(hs));
  }

  set(r: BasinResult): void {
    this.r = r;
    const key = `${r.inp.S.toFixed(3)}`;
    if (key !== this.builtKey) {
      this.slope = r.inp.S;
      this.buildTerrain(this.slope);
      this.builtKey = key;
      this.paintKey = '';
    }
    const pk = ORDER.map((c) => r.inp.mix[c].toFixed(3)).join(',');
    if (pk !== this.paintKey) {
      this.paint(r.inp.mix, 5);
      this.paintKey = pk;
    }
    const total = r.hydro.length * r.dt;
    this.scale = total / 24;
    this.stage.setLabels(this.labels(null));
  }

  private paintKey = '';

  /** Empieza el aguacero (o lo detiene si ya corre). */
  play(on: boolean): void {
    this.playing = on;
    this.tAnim = 0;
    this.pulseT.fill(-1);
    if (on && this.tankFill) this.setTankLevel(0);
    if (!on) {
      this.rain.visible = false;
      this.onTime?.(null);
    }
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private labels(tMin: number | null): StageLabel[] {
    const r = this.r;
    if (!r) return [];
    const es = (x: number, d = 1) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const k = tMin === null ? -1 : Math.floor(tMin / r.dt);
    const Q = k >= 0 && k < r.hydro.length ? r.hydro[k] : 0;
    const head = this.paths[0]?.[0];
    const out: StageLabel[] = [
      { id: 'salida', text: 'Salida de la cuenca', sub: tMin === null ? `pico calculado ${es(r.Qpeak, 2)} m³/s` : `${es(Q, 2)} m³/s ahora`, at: new THREE.Vector3(OUTLET.x - 6, (this.paths[0]?.[this.paths[0].length - 1]?.y ?? 0) + 9, 4), kind: 'sonda', prio: 6 },
    ];
    if (this.tankFill) out.push({ id: 'tanque', text: 'Tanque de retención', sub: `${es(this.tankNow * 100, 0)} % lleno`, at: new THREE.Vector3(this.tank.position.x, this.tank.position.y + 6, this.tank.position.z), kind: this.tankNow > 0.99 ? 'alerta' : 'dato', prio: 5 });
    if (head) out.push({ id: 'lejos', text: 'El punto más lejano', sub: `el agua tarda unos ${es(r.tc.used, 0)} min en salir`, at: head.clone().add(new THREE.Vector3(0, 10, 0)), kind: 'lugar', prio: 4 });
    if (tMin !== null) {
      const kr = Math.floor(tMin / r.dt);
      const i = kr < r.rain.length ? (r.rain[kr] / r.dt) * 60 : 0;
      out.push({ id: 'lluvia', text: i > 0 ? 'Llueve' : 'Ya no llueve', sub: i > 0 ? `${es(i, 0)} mm/h` : `minuto ${es(tMin, 0)}`, at: new THREE.Vector3(-40, 95, 0), kind: i > 0 ? 'alerta' : 'dato', prio: 5 });
    }
    return out;
  }

  update(dt: number, _t: number): void {
    const r = this.r;
    if (!r) return;
    const h = Math.min(0.05, Math.max(0, dt));
    if (!this.playing) return;
    // el reloj del aguacero sigue el tiempo real aunque el equipo dibuje pocos cuadros (hasta 0,25 s por cuadro)
    this.tAnim += Math.min(0.25, Math.max(0, dt));
    const tMin = this.tAnim * this.scale;
    const total = r.hydro.length * r.dt;
    if (tMin >= total) {
      this.play(false);
      this.stage.setLabels(this.labels(null));
      return;
    }
    this.onTime?.(tMin);
    if (this.tankFill) {
      const kt = Math.min(this.tankFill.length - 1, Math.floor(tMin / r.dt));
      this.setTankLevel(this.tankFill[kt]);
    }
    const kr = Math.floor(tMin / r.dt);
    const iNow = kr < r.rain.length ? (r.rain[kr] / r.dt) * 60 : 0;
    const iMax = Math.max(...r.rain) / r.dt * 60;
    // lluvia: más gotas con más intensidad
    this.rain.visible = iNow > 0 && !this.stage.reducedMotion;
    if (this.rain.visible) {
      const p = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const n = p.count, show = Math.floor(n * Math.min(1, iNow / Math.max(1, iMax)));
      for (let k = 0; k < n; k++) {
        let y = p.getY(k) - this.rainV[k] * h;
        if (y < 0) y += 140;
        p.setY(k, k < show ? y : -500);
      }
      p.needsUpdate = true;
      this.rain.geometry.setDrawRange(0, n);
    }
    // cauces: más brillo y algo más anchos con más caudal
    const k = Math.floor(tMin / r.dt);
    const Q = k < r.hydro.length ? r.hydro[k] : 0;
    const f = Math.min(1, Q / Math.max(1e-6, r.Qpeak));
    this.streamMat.emissiveIntensity = 0.15 + 0.85 * f;
    for (const m of this.streams) m.scale.set(1, 1, 1);
    // pulsos: salen de las cabeceras mientras llueve y viajan hasta la salida en el tiempo de concentración
    const travelAnim = r.tc.used / this.scale;
    if (iNow > 0 && Math.random() < h * 6) {
      const free = this.pulseT.findIndex((v) => v < 0);
      if (free >= 0) {
        this.pulseT[free] = 0;
        this.pulsePath[free] = Math.floor(Math.random() * this.paths.length);
      }
    }
    for (let j = 0; j < this.pulseT.length; j++) {
      if (this.pulseT[j] < 0) {
        this.pulses.setMatrixAt(j, this.m4.makeScale(0, 0, 0));
        continue;
      }
      this.pulseT[j] += h;
      const path = this.paths[this.pulsePath[j]];
      // el camino del principal mide lo más largo: llega en tc; los afluentes, en proporción a su largo
      const s = this.pulseT[j] / travelAnim;
      const L = this.pathLen[this.pulsePath[j]] / this.pathLen[0];
      if (s >= L) {
        this.pulseT[j] = -1;
        continue;
      }
      const p = pointAt(path, (s / L) * this.pathLen[this.pulsePath[j]]);
      this.pulses.setMatrixAt(j, this.m4.makeTranslation(p.x, p.y + 0.8, p.z));
    }
    this.pulses.instanceMatrix.needsUpdate = true;
    this.labelT += h;
    if (this.labelT > 0.25) {
      this.labelT = 0;
      this.stage.setLabels(this.labels(tMin));
    }
  }

  private pulsePath = new Int32Array(60);
}

/** Curva cuadrática de a a b con el punto de control c, en 16 tramos. */
function curve(a: THREE.Vector2, c: THREE.Vector2, b: THREE.Vector2): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, u = 1 - t;
    out.push(new THREE.Vector2(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y));
  }
  return out;
}

function pointAt(path: THREE.Vector3[], d: number): THREE.Vector3 {
  let acc = 0;
  for (let k = 1; k < path.length; k++) {
    const seg = path[k].distanceTo(path[k - 1]);
    if (acc + seg >= d) return path[k - 1].clone().lerp(path[k], (d - acc) / seg);
    acc += seg;
  }
  return path[path.length - 1].clone();
}

/** Cinta plana que sigue una línea (el cauce). */
function ribbon(pts: THREE.Vector3[], w: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;
    const ww = w * (0.6 + 0.4 * (k / Math.max(1, pts.length - 1)));
    pos.push(pts[k].x + nx * ww, pts[k].y, pts[k].z + nz * ww, pts[k].x - nx * ww, pts[k].y, pts[k].z - nz * ww);
    if (k < pts.length - 1) {
      const i = 2 * k;
      idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const BASIN_COVERS = COVERS;

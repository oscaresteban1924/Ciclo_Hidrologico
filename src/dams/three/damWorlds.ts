// Escenas 3D de la sala «Presas y embalses»: el embalse con su presa y vertedero (la creciente sube el agua y sale por
// el vertedero), el vertedero de cresta con el pozo de disipación y el resalto, y la presa de gravedad con sus fuerzas.
// Maquetas ilustrativas; las alturas y las fuerzas van a escala (las flechas, proporcionales a su valor).

import * as THREE from 'three';
import { Birds } from '../../three/scenery';
import { lookWater } from '../../three/look';
import type { ProbeInfo, QStage, StageLabel, StageView } from '../../quality/three/stage';
import { noise2, trees, type TreeSpot } from '../../quality/three/kit';
import { diorama } from '../../supply/three/supplyKit';
import { wesTangent, wesY, type GravityDam, type RoutingResult, type StabilityResult } from '../dam';

const es = (x: number, d = 1) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const seeded = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
/**
 * Concreto de presa: juntas de vaciado horizontales cada 1,5 m, manchas de lavado que bajan por las caras y un poco de
 * verdín cerca del agua. Medidas en metros (1 unidad = 1 m).
 */
const concrete = () => {
  const m = new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: 0.85 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;\nvarying vec3 vCN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCW;
        varying vec3 vCN;
        float cH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float cN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(cH(i), cH(i + vec2(1.0, 0.0)), u.x), mix(cH(i + vec2(0.0, 1.0)), cH(i + vec2(1.0, 1.0)), u.x), u.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (abs(vCN.y) < 0.85) {
          float y = vCW.y;
          float fw = max(fwidth(y), 1e-4);
          float lift = 1.0 - smoothstep(0.0, 1.4 * fw + 0.02, abs(fract(y / 1.5 + 0.5) - 0.5) * 1.5);
          float far = smoothstep(0.08, 0.3, fw);
          diffuseColor.rgb *= 1.0 - 0.16 * lift * (1.0 - far);
          // lavado: vetas verticales más oscuras que bajan desde las juntas
          vec2 q = vec2((abs(vCN.x) > 0.5 ? vCW.z : vCW.x) * 0.6, y * 0.05);
          diffuseColor.rgb *= 0.93 + 0.1 * cN(q) + 0.04 * cN(vec2(q.x * 7.0, y * 1.3));
        }`,
      );
  };
  m.customProgramCacheKey = () => 'damConcrete1';
  return m;
};
const waterMat = (opacity = 0.82) => lookWater(new THREE.MeshStandardMaterial({ color: '#2a7fb0', roughness: 0.08, metalness: 0.05, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }), [0.3, 0.05], 0.55);

/** Perfil de una presa de gravedad con cresta WES: corona en y = top; devuelve puntos (x, y) del contorno. */
function spillwayOutline(top: number, Hd: number, m: number, base: number): [number, number][] {
  const tg = wesTangent(Hd, m);
  const pts: [number, number][] = [[-2, base], [-2, top], [0, top]];
  for (let k = 1; k <= 16; k++) {
    const x = (k / 16) * tg.x;
    pts.push([x, top - wesY(x, Hd)]);
  }
  const yT = top - tg.y;
  pts.push([tg.x + (yT - base) * m, base]);
  return pts;
}

function extrude(outline: [number, number][], depth: number, mat: THREE.Material): THREE.Mesh {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ 1. el embalse

const CREST = 30, FB = 6;
const valley = (x: number, z: number) => 0.45 * Math.abs(z) + (x < -10 ? 0.02 * -x : 0) + noise2(x * 0.02, z * 0.03) * 2 * Math.min(1, Math.abs(z) / 30);

export class ReservoirWorld {
  private stage: QStage;
  private lake: THREE.Mesh;
  private river: THREE.Mesh;
  private sheet: THREE.Mesh;
  private spill: THREE.Group = new THREE.Group();
  private res: RoutingResult | null = null;
  private L = 30;
  readonly views: Record<'general' | 'presa' | 'aguas' , StageView> = {
    general: { eye: [320, 190, 70], target: [-90, 18, 0], fit: 460, portrait: { eye: [400, 320, 90], target: [-90, 18, 0] } },
    presa: { eye: [120, 75, 60], target: [0, 24, 0], fit: 150 },
    aguas: { eye: [60, 140, 40], target: [-170, 28, 0], fit: 330 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(420);
    const green = new THREE.Color('#8fbf6a'), rock = new THREE.Color('#a59a83');
    // la orilla del embalse: una franja sin vegetación hasta unos 4 m sobre la cresta (donde el agua sube y baja)
    const bare = new THREE.Color('#a8957a'), bed = new THREE.Color('#9a8566');
    const terr = diorama(valley, -420, 260, -130, 130, 240, 104, (x, z, y) => (y < 2 ? bed.clone() : x < 0 && y < CREST + 4 ? bare.clone().lerp(green, THREE.MathUtils.smoothstep(y, CREST + 1, CREST + 4)) : green.clone().lerp(rock, Math.min(1, y / 70) * 0.5)).multiplyScalar(0.93 + 0.08 * noise2(x * 0.2, z * 0.2)), -4);
    sc.add(terr);
    stage.addProbe(terr.children[0], (p) => this.probe(p.x, p.z, 'tierra'));
    const R = seeded(6);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 220; k++) {
      const x = -410 + R() * 660, z = (R() < 0.5 ? -1 : 1) * (40 + R() * 85);
      const y = valley(x, z);
      if (x < 0 && y < CREST + 10) continue;
      ts.push({ x, y, z, r: 2.2 + R() * 2.2 });
    }
    sc.add(trees(ts, 9));
    const birds = new Birds(new THREE.Vector3(-120, 40, 0), 140, 55, 8, 2.6);
    sc.add(birds.group);
    stage.animate((t) => birds.update(t));
    // el lago: un plano que la ladera recorta
    this.lake = new THREE.Mesh(new THREE.PlaneGeometry(420, 260), waterMat(0.86));
    this.lake.rotation.x = -Math.PI / 2;
    this.lake.position.set(-212, CREST, 0);
    this.river = new THREE.Mesh(new THREE.PlaneGeometry(240, 260), waterMat(0.8));
    this.river.rotation.x = -Math.PI / 2;
    this.river.position.set(140, 1, 0);
    // la lámina sobre el vertedero
    this.sheet = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#cfeaf8', emissive: '#4f9fd2', emissiveIntensity: 0.35, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    sc.add(this.lake, this.river, this.spill, this.sheet);
    stage.addProbe(this.lake, (p) => this.probe(p.x, p.z, 'lago'));
    stage.addProbe(this.river, (p) => this.probe(p.x, p.z, 'rio'));
    stage.addProbe(this.spill, () => this.probe(0, 0, 'presa'));
    this.build(30);
    stage.view(this.views.general, false);
  }

  /** Presa (bloques laterales con corona) y vertedero central de ancho L. */
  private build(L: number): void {
    this.L = L;
    this.spill.clear();
    const span = 2 * ((CREST + FB) / 0.45) + 10;
    const top = CREST + FB;
    const side = (span - L) / 2;
    // estribos: sección de gravedad con la corona a top
    for (const s of [-1, 1]) {
      const blk = extrude([[-2, 0], [-2, top], [4, top], [4 + top * 0.75, 0]], side, concrete());
      blk.position.z = s * (L / 2 + side / 2);
      this.spill.add(blk);
    }
    const sp = extrude(spillwayOutline(CREST, 3, 0.75, 0), L, concrete());
    this.spill.add(sp);
    // pilas en los bordes del vertedero
    for (const s of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(6, top - CREST + 2, 1.6), concrete());
      pier.position.set(1, CREST + (top - CREST) / 2, s * (L / 2 + 0.8));
      this.spill.add(pier);
    }
  }

  set(res: RoutingResult, L: number): void {
    this.res = res;
    if (Math.abs(L - this.L) > 1e-6) this.build(L);
    this.at(0);
  }

  private k = 0;

  private probe(x: number, z: number, what: 'lago' | 'rio' | 'presa' | 'tierra'): ProbeInfo | null {
    const res = this.res;
    if (!res) return null;
    const i = this.k, h = res.h[i];
    const g = valley(x, z);
    if (what === 'lago' && x < 0) {
      const lev = CREST + h;
      return {
        title: 'El embalse',
        rows: [
          ['Profundidad aquí', `${es(Math.max(0, lev - g), 1)} m`],
          ['Nivel', `${es(h, 2)} m sobre la cresta del vertedero`],
          ['Entra / sale', `${es(res.I[i], 0)} / ${es(res.O[i], 0)} m³/s`],
          ['Hora', es(res.t[i], 1)],
        ],
        strong: 2,
      };
    }
    if (what === 'rio' || (what === 'lago' && x >= 0)) {
      const d = Math.max(0, this.river.position.y - g);
      return { title: 'El río abajo de la presa', rows: [['Caudal', `${es(res.O[i], 0)} m³/s (sale del vertedero)`], ['Profundidad aquí', `unos ${es(d, 1)} m`], ['Pico que sale', `${es(res.Opeak, 0)} m³/s a la hora ${es(res.tOpeak, 1)}`]], strong: 0 };
    }
    if (what === 'presa')
      return {
        title: 'Presa y vertedero',
        rows: [
          ['Cresta del vertedero', `${CREST} m sobre el cauce, ${es(this.L, 0)} m de ancho`],
          ['Corona', `${CREST + FB} m (borde libre de ${FB} m)`],
          ['Agua sobre la cresta', `${es(h, 2)} m · máximo ${es(res.hMax, 2)} m`],
          ['Le queda de borde', `${es(FB - h, 2)} m`],
        ],
        strong: 3,
      };
    const lev = CREST + h;
    return { title: x < 0 && g < lev + 4 ? 'Orilla del embalse' : 'Ladera', rows: [['Cota', `${es(g, 1)} m sobre el cauce`], ['Agua ahora', g < lev && x < 0 ? `${es(lev - g, 1)} m` : 'seca'], ...(x < 0 ? ([['Sobre el embalse', `${es(g - lev, 1)} m`]] as [string, string][]) : [])], strong: 1 };
  }

  /** Muestra el instante k del tránsito. */
  at(k: number): void {
    const res = this.res;
    if (!res) return;
    const i = Math.max(0, Math.min(res.t.length - 1, k));
    this.k = i;
    const h = res.h[i];
    this.lake.position.y = CREST + h;
    // río aguas abajo: profundidad de un cauce ancho con Manning, para que se vea crecer
    const q = res.O[i] / 60;
    this.river.position.y = 0.4 + Math.pow((q * 0.035) / Math.sqrt(0.002), 0.6);
    // lámina: sigue el perfil con un espesor que baja de 2/3·h a 0,2·h
    const L = this.L, g = new THREE.BufferGeometry();
    const tg = wesTangent(3, 0.75);
    const xs: number[] = [];
    for (let x = -8; x <= 0; x += 2) xs.push(x);
    for (let k2 = 1; k2 <= 16; k2++) xs.push((k2 / 16) * tg.x);
    for (let y = CREST - tg.y; y > 0.5; y -= 2) xs.push(tg.x + (CREST - tg.y - y) * 0.75);
    const surf = (x: number) => (x <= 0 ? CREST : x <= tg.x ? CREST - wesY(x, 3) : Math.max(0, CREST - tg.y - (x - tg.x) / 0.75));
    const th = (x: number) => (h <= 0.02 ? 0 : x <= 0 ? h * (1 - (0.33 * (x + 8)) / 8) : Math.max(0.05, (h * 0.67) / (1 + x * 0.08)));
    const pos: number[] = [], idx: number[] = [];
    xs.forEach((x, n) => {
      const y = surf(x) + th(x) + 0.05;
      pos.push(x, y, -L / 2, x, y, L / 2);
      if (n < xs.length - 1) idx.push(2 * n, 2 * n + 2, 2 * n + 1, 2 * n + 1, 2 * n + 2, 2 * n + 3);
    });
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.sheet.geometry.dispose();
    this.sheet.geometry = g;
    this.sheet.visible = h > 0.02;
    const out: StageLabel[] = [
      { id: 'lago', text: `Embalse: ${es(h, 2)} m sobre la cresta`, sub: `entra ${es(res.I[i], 0)} m³/s · hora ${es(res.t[i], 1)}`, at: new THREE.Vector3(-160, CREST + h + 8, 0), kind: 'sonda', prio: 6 },
      { id: 'vert', text: `Sale ${es(res.O[i], 0)} m³/s`, sub: `vertedero de ${es(L, 0)} m`, at: new THREE.Vector3(14, CREST + 4, 0), kind: h > FB - 1.5 ? 'alerta' : 'dato', prio: 5 },
      { id: 'corona', text: 'Corona de la presa', sub: `${FB} m sobre la cresta`, at: new THREE.Vector3(2, CREST + FB + 3, L / 2 + 26), kind: 'lugar', prio: 3 },
    ];
    this.stage.setLabels(out);
  }

  update(): void {
    /* la escena cambia con at() */
  }
}

// ------------------------------------------------------------------ 2. el vertedero y el pozo

export interface SpillState {
  H: number;
  Hd: number;
  q: number;
  y1: number;
  y2: number;
  tw: number;
  D: number;
  P: number;
}

export class SpillWorld {
  private stage: QStage;
  private body = new THREE.Group();
  private water: THREE.Mesh;
  private foam: THREE.Points;
  private foamBase: Float32Array;
  private st: SpillState | null = null;
  private jumpX = 0;
  private jumpL = 1;
  private bedL = 46;
  readonly views: Record<'general' | 'cresta' | 'pozo', StageView> = {
    general: { eye: [55, 48, 120], target: [30, 12, 0], fit: 120, portrait: { eye: [55, 80, 230], target: [30, 12, 0] } },
    cresta: { eye: [14, 42, 44], target: [3, 30, 0], fit: 30 },
    pozo: { eye: [80, 26, 70], target: [52, 0, 0], fit: 70 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(140);
    sc.add(this.body);
    // el agua se blanquea donde corre muy rápido (lámina aireada en la rápida) y en el resalto
    const wm = waterMat(0.86);
    wm.vertexColors = true;
    this.water = new THREE.Mesh(new THREE.BufferGeometry(), wm);
    sc.add(this.water);
    stage.addProbe(this.water, (pt) => this.probe(pt.x));
    const n = 500, p = new Float32Array(n * 3);
    this.foamBase = new Float32Array(n * 3);
    const R = seeded(3);
    for (let k = 0; k < n; k++) this.foamBase.set([R(), R(), R() * 2 - 1], 3 * k);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    this.foam = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.45, transparent: true, opacity: 0.9, depthWrite: false }));
    this.foam.frustumCulled = false;
    sc.add(this.foam);
    stage.view(this.views.general, false);
  }

  private prof: [number, number, number][] = [];

  /** Profundidad, velocidad y número de Froude a lo largo del agua. */
  private probe(x: number): ProbeInfo | null {
    const s = this.st, P = this.prof;
    if (!s || P.length < 2) return null;
    let k = 1;
    while (k < P.length - 1 && P[k][0] < x) k++;
    const a = P[k - 1], b = P[k], t = Math.max(0, Math.min(1, (x - a[0]) / Math.max(1e-6, b[0] - a[0])));
    const zb = a[1] + (b[1] - a[1]) * t, y = a[2] + (b[2] - a[2]) * t;
    const d = Math.max(0.01, y - zb), V = s.q / d, Fr = V / Math.sqrt(9.81 * d);
    const where = x < 0 ? 'Llegando a la cresta' : x < this.toeX(s) ? 'Bajando por la rápida' : x >= this.jumpX && x <= this.jumpX + this.jumpL ? 'En el resalto' : x < this.toeX(s) + 6 * s.y2 ? 'En el pozo de disipación' : 'En el río';
    return {
      title: where,
      rows: [
        ['Profundidad', `${es(d, 2)} m`],
        ['Velocidad', `${es(V, 1)} m/s`],
        ['Número de Froude', `${es(Fr, 2)} (${Fr > 1.05 ? 'supercrítico' : Fr < 0.95 ? 'subcrítico' : 'crítico'})`],
        ['Caudal', `${es(s.q, 1)} m³/s por metro`],
      ],
      strong: 1,
    };
  }

  private toeX(s: SpillState): number {
    const tg = wesTangent(s.Hd, 0.75);
    return tg.x + (s.P - tg.y + s.D) * 0.75;
  }

  set(s: SpillState): void {
    this.st = s;
    this.body.clear();
    const W = 30, toe = this.toeX(s), floor = -s.D, Lb = 6 * s.y2;
    const dam = extrude(spillwayOutline(s.P, s.Hd, 0.75, floor), W, concrete());
    const apron = new THREE.Mesh(new THREE.BoxGeometry(Lb + 4, 1, W), concrete());
    apron.position.set(toe + (Lb + 4) / 2 - 2, floor - 0.5, 0);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.5, Math.max(0.5, s.D + 0.6), W), concrete());
    sill.position.set(toe + Lb + 1.25, floor + Math.max(0.5, s.D + 0.6) / 2, 0);
    // solo el muro del fondo: la maqueta está cortada por el eje para ver el perfil
    const wall = new THREE.Mesh(new THREE.BoxGeometry(toe + Lb + 12, s.P + 4 + s.D, 1.6), concrete());
    wall.position.set((toe + Lb + 12) / 2 - 6, (s.P + 4 - s.D) / 2, -W / 2 - 0.8);
    this.body.add(wall);
    const earth = new THREE.MeshStandardMaterial({ color: '#9a8566', roughness: 1 });
    this.bedL = Math.max(46, (s.tw + s.D >= s.y2 ? 0 : 0.4 * Lb + 6 * s.tw) + 20);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(this.bedL, 2, W + 4), earth);
    bed.position.set(toe + Lb + 2 + this.bedL / 2, -1, 0);
    const under = new THREE.Mesh(new THREE.BoxGeometry(toe + Lb + 24 + this.bedL, 3, W + 4), earth);
    under.position.set((toe + Lb + 24 + this.bedL) / 2 - 22, floor - 2.5, 0);
    // embalse aguas arriba, a la cota del agua que llega a la cresta
    const pool = new THREE.Mesh(new THREE.BoxGeometry(20, s.P + s.H - floor, W), waterMat(0.55));
    pool.position.set(-12, (s.P + s.H + floor) / 2, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(20, s.P - 8 - floor, W + 4), earth);
    back.position.set(-12, (s.P - 8 + floor) / 2 - 0.05, 0);
    this.body.add(dam, apron, sill, bed, under, pool, back);
    // agua: perfil (x, superficie) a lo largo
    const tg = wesTangent(s.Hd, 0.75);
    const yc = Math.pow((s.q * s.q) / 9.81, 1 / 3);
    const pts: [number, number, number][] = []; // x, fondo, superficie
    for (let x = -14; x <= 0; x += 2) pts.push([x, s.P - 8, s.P + s.H * (1 - (0.33 * (x + 14)) / 14)]);
    for (let k = 1; k <= 12; k++) {
      const x = (k / 12) * tg.x, zb = s.P - wesY(x, s.Hd);
      pts.push([x, zb, zb + Math.max(s.y1, yc * (1 - (k / 12) * 0.5))]);
    }
    const zT = s.P - tg.y;
    for (let k = 1; k <= 8; k++) {
      const zb = zT - ((zT - floor) * k) / 8;
      const x = tg.x + (zT - zb) * 0.75;
      pts.push([x, zb, zb + s.y1 + (yc * 0.5 - s.y1) * (1 - k / 8)]);
    }
    // después del pie: como en el corte 2D, el resalto en el pozo o, si el río no alcanza, más abajo en el río
    const inBasin = s.tw + s.D >= s.y2;
    this.jumpX = inBasin ? toe : toe + 1.4 * Lb;
    this.jumpL = inBasin ? 0.6 * Lb : 6 * s.tw;
    const jStart = inBasin ? toe + 0.08 * Lb : this.jumpX;
    const end = toe + Lb + 2 + this.bedL;
    for (let x = toe + 0.5; x <= end; x += 1.5) {
      const zb = x < toe + Lb ? floor : x < toe + Lb + 2 ? floor + Math.max(0.5, s.D + 0.6) : 0;
      let y: number;
      if (x < jStart) y = (x < toe + Lb ? floor : zb) + s.y1 * (inBasin ? 1 : 1 + (0.15 * Math.max(0, x - toe - Lb)) / (0.4 * Lb));
      else if (x < this.jumpX + this.jumpL) {
        const k = (x - jStart) / (this.jumpX + this.jumpL - jStart);
        const y0 = (inBasin ? floor : 0) + s.y1 * (inBasin ? 1 : 1.15);
        y = y0 + (s.tw - y0) * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, k)));
      } else y = s.tw;
      pts.push([x, zb, Math.max(zb + 0.1, y)]);
    }
    const pos: number[] = [], idx: number[] = [], cols: number[] = [];
    this.prof = pts;
    const blue = new THREE.Color('#ffffff'), white = new THREE.Color('#f4f1ea').multiplyScalar(2.6), c = new THREE.Color();
    pts.forEach(([x, zb, y], n) => {
      pos.push(x, y, -W / 2, x, y, W / 2);
      if (n < pts.length - 1) idx.push(2 * n, 2 * n + 2, 2 * n + 1, 2 * n + 1, 2 * n + 2, 2 * n + 3);
      const d = Math.max(0.05, y - zb), Fr = s.q / d / Math.sqrt(9.81 * d);
      const inJump = x >= this.jumpX && x <= this.jumpX + this.jumpL;
      const air = x > 0 ? Math.min(1, Math.max(0, (Fr - 2.5) / 6)) * 0.55 : 0;
      c.copy(blue).lerp(white, Math.max(air, inJump ? 0.7 * Math.sin(Math.PI * Math.min(1, (x - this.jumpX) / this.jumpL)) : 0));
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.water.geometry.dispose();
    this.water.geometry = g;
    this.stage.setLabels([
      { id: 'cresta', text: `Cresta: ${es(s.H, 2)} m de agua`, sub: `H/Hd = ${es(s.H / s.Hd, 2)}`, at: new THREE.Vector3(0, s.P + s.H + 4, 0), kind: s.H / s.Hd > 1.33 ? 'alerta' : 'sonda', prio: 6 },
      { id: 'pie', text: `Al pie: ${es(s.q / s.y1, 1)} m/s`, sub: `y1 = ${es(s.y1, 2)} m`, at: new THREE.Vector3(toe, floor + 4, 0), kind: 'dato', prio: 4 },
      { id: 'resalto', text: inBasin ? 'El resalto queda en el pozo' : 'El resalto se sale del pozo', sub: `pide ${es(s.y2, 2)} m; hay ${es(s.tw + s.D, 2)} m`, at: new THREE.Vector3(this.jumpX + this.jumpL * 0.4, s.tw + 5, 0), kind: inBasin ? 'ok' : 'alerta', prio: 5 },
    ]);
  }

  update(_dt: number, t: number): void {
    const s = this.st;
    if (!s) return;
    const p = this.foam.geometry.attributes.position as THREE.BufferAttribute;
    const inBasin = s.tw + s.D >= s.y2;
    const base = inBasin ? -s.D : 0, y0 = s.y1 * (inBasin ? 1 : 1.15), y2 = s.tw - base;
    for (let k = 0; k < p.count; k++) {
      const a = this.foamBase[3 * k], b = this.foamBase[3 * k + 1], c = this.foamBase[3 * k + 2];
      const ph = (a + t * 0.6) % 1;
      const x = this.jumpX + ph * this.jumpL * 0.8;
      const top = y0 + (y2 - y0) * Math.min(1, ph * 1.6);
      p.setXYZ(k, x, base + top * (0.55 + 0.45 * b) + Math.sin(t * 6 + a * 20) * 0.15, c * 14);
    }
    p.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ 3. la presa de gravedad

export class GravityWorld {
  private stage: QStage;
  private body = new THREE.Group();
  private arrows = new THREE.Group();
  readonly views: Record<'general' | 'base' | 'frente', StageView> = {
    general: { eye: [62, 46, 118], target: [8, 8, 0], fit: 100, portrait: { eye: [62, 80, 220], target: [8, 8, 0] } },
    base: { eye: [24, 6, 80], target: [12, -4, 0], fit: 54 },
    frente: { eye: [10, 14, 140], target: [10, 10, 0], fit: 86 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    stage.setShadowSpan(120);
    stage.scene.add(this.body, this.arrows);
    stage.addProbe(this.body, (p, hit) => {
      const o = hit.object as THREE.Mesh;
      const mat = o.material as THREE.MeshStandardMaterial;
      const what = mat.transparent && mat.opacity < 0.9 && o.geometry.type === 'BoxGeometry' ? 'agua' : o.geometry.type === 'BoxGeometry' && p.y < 0 ? 'roca' : 'presa';
      return this.probe(p.x, p.y, what);
    });
    stage.view(this.views.general, false);
  }

  private d: GravityDam | null = null;
  private r: StabilityResult | null = null;
  private drains = false;

  private probe(x: number, y: number, what: 'presa' | 'roca' | 'agua'): ProbeInfo | null {
    const d = this.d, r = this.r;
    if (!d || !r) return null;
    const g = 9.81;
    if (what === 'agua') {
      const up = x < 0;
      const depth = Math.max(0, (up ? d.hw : d.tail) - y);
      return { title: up ? 'El embalse' : 'El agua de abajo', rows: [['Profundidad aquí', `${es(depth, 1)} m`], ['Presión del agua', `${es(g * depth, 0)} kPa`]], strong: 1 };
    }
    if (what === 'roca' || y < 0.6) {
      const t = Math.max(0, Math.min(1, x / r.B));
      const sv = r.sHeel + (r.sToe - r.sHeel) * t;
      const up = d.uplift * g * (d.hw + (d.tail - d.hw) * t);
      return {
        title: x > r.B ? "Roca al pie de la presa" : `Base de la presa a ${es(Math.max(0, x), 1)} m del talón`,
        rows: [
          ['Esfuerzo en la roca', `${es(Math.abs(sv), 0)} kPa (${sv >= 0 ? 'compresión' : 'tracción'})`],
          ['Subpresión', `${es(up, 0)} kPa${this.drains ? ' (con drenes)' : ''}`],
          ['Resultante', `a ${es(r.xR, 1)} m del talón (tercio medio: ${es(r.B / 3, 1)} a ${es((2 * r.B) / 3, 1)} m)`],
        ],
        strong: 0,
      };
    }
    // en la presa: si es la cara de aguas arriba, la presión del agua; si no, el concreto
    if (x < 0.4) {
      const depth = Math.max(0, d.hw - y);
      return { title: 'Paramento aguas arriba', rows: [['Profundidad del agua', `${es(depth, 1)} m`], ['Presión del agua', `${es(g * depth, 0)} kPa`], ['Empuje total', `${es((g * d.hw * d.hw) / 2, 0)} kN por metro`]], strong: 1 };
    }
    return { title: 'Concreto de la presa', rows: [['Altura', `${es(y, 1)} de ${es(d.H, 0)} m`], ['Peso', '23,5 kN por m³'], ['Factores', `volcamiento ${es(r.FSo, 2)} · deslizamiento ${es(r.FSs, 2)}`]], strong: 2 };
  }

  set(d: GravityDam, r: StabilityResult, drains: boolean): void {
    this.d = d;
    this.r = r;
    this.drains = drains;
    this.body.clear();
    this.arrows.clear();
    const W = 50, B = r.B;
    const dam = extrude([[0, 0], [0, d.H], [d.crest, d.H], [B, 0]], W, concrete());
    const rock = new THREE.Mesh(new THREE.BoxGeometry(B + 92, 10, W + 6), new THREE.MeshStandardMaterial({ color: '#8d8478', roughness: 1 }));
    rock.position.set((B + 30 - 62) / 2, -5, 0);
    rock.receiveShadow = true;
    this.body.add(dam, rock);
    if (d.hw > 0) {
      const lake = new THREE.Mesh(new THREE.BoxGeometry(60, d.hw, W), waterMat(0.6));
      lake.position.set(-30, d.hw / 2, 0);
      this.body.add(lake);
    }
    if (d.tail > 0) {
      const tw = new THREE.Mesh(new THREE.BoxGeometry(30, d.tail, W), waterMat(0.6));
      tw.position.set(B + 15 - (d.m * d.tail) / 2, d.tail / 2, 0);
      this.body.add(tw);
    }
    if (drains) {
      const gal = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, W), new THREE.MeshStandardMaterial({ color: '#4a4f55' }));
      gal.position.set(Math.min(B * 0.2, 4), 2.5, 0);
      this.body.add(gal);
    }
    // diagrama de esfuerzos bajo la base: compresión azul, tracción rojo
    const sMax = Math.max(1, Math.abs(r.sHeel), Math.abs(r.sToe));
    const k = 8 / sMax;
    const diag = extrude([[0, 0], [0, -r.sHeel * k], [B, -r.sToe * k], [B, 0]], 2, new THREE.MeshStandardMaterial({ color: r.sHeel < 0 ? '#c0392b' : '#2f84b5', transparent: true, opacity: 0.8 }));
    diag.position.z = W / 2 + 4;
    this.body.add(diag);
    // tercio medio en la base
    const third = new THREE.Mesh(new THREE.BoxGeometry(B / 3, 0.25, 2), new THREE.MeshStandardMaterial({ color: '#2e7d32', emissive: '#1b5e20', emissiveIntensity: 0.4 }));
    third.position.set(B / 2, 0.15, W / 2 + 4);
    this.body.add(third);
    // flechas de las fuerzas, en el plano del frente, proporcionales a su valor
    const big = Math.max(...r.forces.map((f) => Math.hypot(f.Fx, f.Fy)));
    const scale = 16 / big;
    const color: Record<string, string> = { 'Peso de la corona': '#5b4630', 'Peso del talud': '#5b4630', 'Empuje del agua': '#1f78b4', 'Empuje del agua de abajo': '#1f78b4', 'Agua sobre el talud': '#1f78b4', 'Subpresión': '#7b3fa0' };
    for (const f of r.forces) {
      const len = Math.hypot(f.Fx, f.Fy) * scale;
      if (len < 0.3) continue;
      const dir = new THREE.Vector3(f.Fx, -f.Fy, 0).normalize();
      const at = new THREE.Vector3(f.x, f.y, W / 2 + 4.5);
      const from = at.clone().sub(dir.clone().multiplyScalar(len));
      this.arrows.add(new THREE.ArrowHelper(dir, from, len, color[f.name] ?? '#17324d', Math.min(2.5, len * 0.3), Math.min(1.4, len * 0.18)));
    }
    // resultante: del punto de la base hacia arriba, en el sentido opuesto a la fuerza total
    const R = new THREE.Vector3(r.Hsum, -r.V, 0);
    const len = R.length() * scale;
    if (len > 0.3) {
      const dir = R.clone().normalize();
      const hit = new THREE.Vector3(r.xR, 0, W / 2 + 5);
      this.arrows.add(new THREE.ArrowHelper(dir, hit.clone().sub(dir.clone().multiplyScalar(len)), len, r.inThird ? '#2e7d32' : '#c0392b', 2.5, 1.4));
    }
    const ok = r.FSo >= 1.5 && r.FSs >= 1.5 && r.inThird && r.sHeel >= 0;
    this.stage.setLabels([
      { id: 'fs', text: `Volcamiento ${es(r.FSo, 2)} · deslizamiento ${es(r.FSs, 2)}`, sub: ok ? 'cumple los criterios' : 'no cumple todos los criterios', at: new THREE.Vector3(d.crest / 2, d.H + 4, 0), kind: ok ? 'ok' : 'alerta', prio: 6 },
      { id: 'res', text: r.inThird ? 'Resultante en el tercio medio' : 'Resultante fuera del tercio medio', sub: `a ${es(r.xR, 1)} m del talón`, at: new THREE.Vector3(B + 14, -5, W / 2 + 4), kind: r.inThird ? 'dato' : 'alerta', prio: 5 },
      { id: 'agua', text: `Agua: ${es(d.hw, 1)} m`, sub: drains ? 'con drenes' : 'sin drenes', at: new THREE.Vector3(-30, Math.max(2, d.hw) + 3, W / 2), kind: 'lugar', prio: 4 },
    ]);
  }

  update(): void {
    /* estática */
  }
}

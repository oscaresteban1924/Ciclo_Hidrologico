// Un modelo bidimensional de verdad, en el navegador, construido como HEC-RAS 2D: un preprocesador que convierte el
// terreno de 1 m en tablas «subgrid» (cada celda sabe cuánto volumen guarda a cada cota; cada cara, cuánta área y
// cuánta conducción tiene a cada cota) y un motor que resuelve continuidad y cantidad de movimiento en volúmenes
// finitos. Dos ecuaciones: la onda difusiva, implícita (con el peso θ, iteraciones y tolerancias, como en HEC-RAS),
// y la inercia local (las ecuaciones de aguas someras sin advección), explícita. La malla es cuadrada; HEC-RAS usa
// mallas no estructuradas, pero la idea de celdas, caras y tablas es la misma.

import { COVER_KEYS, NX, NY, ROAD, POIS, truth, terrainFor, type Cover, type TerrainOpts } from './terrain';

export const G = 9.81;
/** Niveles de las tablas de las caras: cada 0,1 m durante 6,3 m sobre el punto más bajo de la cara. */
const L = 64;
const DH = 0.1;
/** Profundidad mínima sobre el punto más bajo de una cara para que conduzca en la onda difusiva [m]. */
const HMIN = 0.01;

export type Eq = 'difusiva' | 'inercia';
export type BuildingMode = 'n' | 'bloque' | 'nada';
export const EQ_NAMES: Record<Eq, string> = { difusiva: 'Onda difusiva (implícita)', inercia: 'Inercia local (explícita)' };
export const BUILDING_NAMES: Record<BuildingMode, string> = { n: 'n alto', bloque: 'Bloques en el terreno', nada: 'Sin representar' };

export interface MeshOpts {
  /** Lado de las celdas [m]: 5, 10, 20 o 40. */
  c: number;
  subgrid: boolean;
  breaklines: boolean;
}

export interface Roughness {
  n: Record<Cover, number>;
  /** Multiplicador de todos los n (sensibilidad). */
  mult: number;
  buildings: BuildingMode;
}

export const normalN = (): Record<Cover, number> => Object.fromEntries(COVER_KEYS.map((c) => [c, ({ cauce: 0.04, pasto: 0.03, cultivo: 0.035, rastrojo: 0.06, bosque: 0.1, via: 0.016, edificio: 0.2 } as Record<Cover, number>)[c]])) as Record<Cover, number>;

// ------------------------------------------------------------------ el preprocesador

export interface Geometry {
  c: number;
  MX: number;
  MY: number;
  NC: number;
  /** Caras interiores en x, en y, y las de borde oeste (entrada) y este (salida). */
  NXF: number;
  NYF: number;
  NF: number;
  fa: Int32Array;
  fb: Int32Array;
  /** Celdas: elevaciones de sus píxeles ordenadas, sumas acumuladas y área de cada entrada. */
  cOff: Int32Array;
  cCnt: Int32Array;
  cArea: Float32Array;
  zs: Float32Array;
  ps: Float64Array;
  zmin: Float32Array;
  /** Caras: muestras del terreno y de n a lo largo de la cara (una por metro) y sus tablas. */
  fz: Float32Array;
  fn: Float32Array;
  fzmin: Float32Array;
  tabA: Float32Array;
  tabK: Float32Array;
  /** El terreno de 1 m con el que se hicieron las tablas y el n por píxel. */
  z: Float32Array;
  n: Float32Array;
  ms: number;
  key: string;
}

export const geomKey = (t: TerrainOpts, m: MeshOpts, r: Roughness) => `${t.surf}|${t.p}|${t.method}|${t.sigma}|${t.burn}|${m.c}|${m.subgrid}|${m.breaklines}|${COVER_KEYS.map((c) => r.n[c]).join(',')}|${r.mult}|${r.buildings}`;

/** Terreno de 1 m que entra al modelo (con o sin casas) y el n de Manning por píxel. */
export function modelSurface(t: TerrainOpts, r: Roughness): { z: Float32Array; n: Float32Array } {
  const T = truth();
  const base = terrainFor(t).fine;
  const E = COVER_KEYS.indexOf('edificio'), P = COVER_KEYS.indexOf('pasto');
  let z = base;
  if (r.buildings === 'bloque' && t.surf === 'mdt') {
    z = new Float32Array(base);
    // las casas se levantan en el terreno: el agua no entra en ellas (salvo con píxeles gruesos que las diluyen)
    const raised = terrainFor({ ...t, surf: 'mds', burn: false }).fine;
    for (let k = 0; k < z.length; k++) if (T.cover[k] === E) z[k] = Math.max(z[k], t.p === 1 ? T.mds[k] : raised[k]);
  }
  const n = new Float32Array(NX * NY);
  for (let k = 0; k < n.length; k++) {
    let c = T.cover[k];
    if (c === E && r.buildings !== 'n') c = P;
    n[k] = r.n[COVER_KEYS[c]] * r.mult;
  }
  return { z, n };
}

const GCACHE = new Map<string, Geometry>();

/** Preprocesador: malla, tablas de volumen de las celdas y de área y conducción de las caras. */
export function buildGeometry(t: TerrainOpts, m: MeshOpts, r: Roughness): Geometry {
  const key = geomKey(t, m, r);
  const hit = GCACHE.get(key);
  if (hit) return hit;
  const t0 = performance.now();
  const { z, n } = modelSurface(t, r);
  const T = truth();
  const c = m.c, MX = NX / c, MY = NY / c, NC = MX * MY;
  const NXF = MY * (MX - 1), NYF = (MY - 1) * MX, NF = NXF + NYF + 2 * MY;
  const fa = new Int32Array(NF), fb = new Int32Array(NF);
  // ---- celdas
  const per = m.subgrid ? c * c : 1;
  const cOff = new Int32Array(NC), cCnt = new Int32Array(NC).fill(per), cArea = new Float32Array(NC).fill(m.subgrid ? 1 : c * c);
  const zs = new Float32Array(NC * per), ps = new Float64Array(NC * (per + 1)), zmin = new Float32Array(NC);
  const buf = new Float32Array(c * c);
  for (let J = 0; J < MY; J++)
    for (let I = 0; I < MX; I++) {
      const ci = J * MX + I;
      let q = 0;
      for (let j = J * c; j < (J + 1) * c; j++) for (let i = I * c; i < (I + 1) * c; i++) buf[q++] = z[j * NX + i];
      const off = ci * per;
      cOff[ci] = off;
      if (m.subgrid) {
        const s = buf.slice().sort();
        zs.set(s, off);
      } else {
        let a = 0;
        for (let k = 0; k < q; k++) a += buf[k];
        zs[off] = a / q;
      }
      const po = ci * (per + 1);
      ps[po] = 0;
      for (let k = 0; k < per; k++) ps[po + k + 1] = ps[po + k] + zs[off + k];
      zmin[ci] = zs[off];
    }
  // ---- caras: muestras
  const fz = new Float32Array(NF * c), fn = new Float32Array(NF * c), fzmin = new Float32Array(NF);
  const cellMean = (ci: number) => (m.subgrid ? 0 : zs[cOff[ci]]);
  const ridgeMax = (i0: number, i1: number, j0: number, j1: number) => {
    let v = -Infinity;
    for (let j = Math.max(0, j0); j <= Math.min(NY - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(NX - 1, i1); i++) {
        const k = j * NX + i;
        if (T.ridge[k] && z[k] > v) v = z[k];
      }
    return v;
  };
  let f = 0;
  const half = Math.floor(c / 2);
  // interiores en x (líneas verticales entre (I−1,J) e (I,J))
  for (let J = 0; J < MY; J++)
    for (let I = 1; I < MX; I++, f++) {
      const a = J * MX + I - 1;
      fa[f] = a;
      fb[f] = a + 1;
      const x = I * c;
      for (let k = 0; k < c; k++) {
        const j = J * c + k;
        const k1 = j * NX + x - 1, k2 = j * NX + x;
        let zz = z[k1] >= z[k2] ? z[k1] : z[k2];
        if (m.breaklines) zz = Math.max(zz, ridgeMax(x - half, x + half - 1, j, j));
        fz[f * c + k] = zz;
        fn[f * c + k] = 0.5 * (n[k1] + n[k2]);
      }
      if (!m.subgrid) {
        const zf = Math.max(cellMean(a), cellMean(a + 1));
        let nn = 0;
        for (let k = 0; k < c; k++) nn += fn[f * c + k];
        for (let k = 0; k < c; k++) {
          fz[f * c + k] = zf;
          fn[f * c + k] = nn / c;
        }
      }
    }
  // interiores en y (líneas horizontales entre (I,J−1) e (I,J))
  for (let J = 1; J < MY; J++)
    for (let I = 0; I < MX; I++, f++) {
      const a = (J - 1) * MX + I;
      fa[f] = a;
      fb[f] = a + MX;
      const y = J * c;
      for (let k = 0; k < c; k++) {
        const i = I * c + k;
        const k1 = (y - 1) * NX + i, k2 = y * NX + i;
        let zz = z[k1] >= z[k2] ? z[k1] : z[k2];
        if (m.breaklines) zz = Math.max(zz, ridgeMax(i, i, y - half, y + half - 1));
        fz[f * c + k] = zz;
        fn[f * c + k] = 0.5 * (n[k1] + n[k2]);
      }
      if (!m.subgrid) {
        const zf = Math.max(cellMean(a), cellMean(a + MX));
        let nn = 0;
        for (let k = 0; k < c; k++) nn += fn[f * c + k];
        for (let k = 0; k < c; k++) {
          fz[f * c + k] = zf;
          fn[f * c + k] = nn / c;
        }
      }
    }
  // bordes oeste (entrada) y este (salida): el terreno de la primera o la última columna
  for (const side of [0, 1])
    for (let J = 0; J < MY; J++, f++) {
      const a = J * MX + (side === 0 ? 0 : MX - 1);
      fa[f] = a;
      fb[f] = side === 0 ? -1 : -2;
      const i = side === 0 ? 0 : NX - 1;
      for (let k = 0; k < c; k++) {
        const kk = (J * c + k) * NX + i;
        fz[f * c + k] = m.subgrid ? z[kk] : cellMean(a);
        fn[f * c + k] = n[kk];
      }
    }
  // ---- tablas de las caras: área A(η) y conducción K(η) = Σ (1/n) d^(5/3) por franjas de 1 m
  const tabA = new Float32Array(NF * L), tabK = new Float32Array(NF * L);
  for (let ff = 0; ff < NF; ff++) {
    let lo = Infinity;
    for (let k = 0; k < c; k++) lo = Math.min(lo, fz[ff * c + k]);
    fzmin[ff] = lo;
    for (let l = 1; l < L; l++) {
      const eta = lo + l * DH;
      let A = 0, K = 0;
      for (let k = 0; k < c; k++) {
        const d = eta - fz[ff * c + k];
        if (d > 0) {
          A += d;
          K += (d * Math.cbrt(d * d)) / fn[ff * c + k];
        }
      }
      tabA[ff * L + l] = A;
      tabK[ff * L + l] = K;
    }
  }
  const g: Geometry = { c, MX, MY, NC, NXF, NYF, NF, fa, fb, cOff, cCnt, cArea, zs, ps, zmin, fz, fn, fzmin, tabA, tabK, z, n, ms: performance.now() - t0, key };
  if (GCACHE.size > 4) GCACHE.delete(GCACHE.keys().next().value as string);
  GCACHE.set(key, g);
  return g;
}

// ------------------------------------------------------------------ propiedades de celdas y caras

/** Volumen guardado en la celda con el agua a la cota η [m³]. */
export function cellVolume(g: Geometry, ci: number, eta: number): number {
  const off = g.cOff[ci], m = g.cCnt[ci], a = g.cArea[ci], po = ci * (m + 1);
  if (eta <= g.zs[off]) return 0;
  // k = cuántas entradas están por debajo de η (búsqueda binaria)
  let lo = 1, hi = m;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.zs[off + mid - 1] < eta) lo = mid;
    else hi = mid - 1;
  }
  return a * (lo * eta - g.ps[po + lo]);
}

/** Área mojada en planta de la celda a la cota η [m²]. */
export function cellWetArea(g: Geometry, ci: number, eta: number): number {
  const off = g.cOff[ci], m = g.cCnt[ci], a = g.cArea[ci];
  if (eta <= g.zs[off]) return 0;
  let lo = 1, hi = m;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.zs[off + mid - 1] < eta) lo = mid;
    else hi = mid - 1;
  }
  return a * lo;
}

/** Cota del agua que corresponde a un volumen (inversa exacta de la curva cota-volumen). */
export function cellLevel(g: Geometry, ci: number, V: number): number {
  const off = g.cOff[ci], m = g.cCnt[ci], a = g.cArea[ci], po = ci * (m + 1);
  if (V <= 0) return g.zs[off];
  // mayor k con V(z_k) ≤ V, donde V(z_k) = a·(k·z_(k) − P_k) con z_(k) la k-ésima (base 0)
  let lo = 1, hi = m;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const Vk = a * ((mid - 1) * g.zs[off + mid - 1] - g.ps[po + mid - 1]);
    if (Vk <= V) lo = mid;
    else hi = mid - 1;
  }
  return (V / a + g.ps[po + lo]) / lo;
}

let lastA = 0;
/** Conducción de la cara a la cota η; deja el área en `lastA`. Con las tablas, o directo por encima de ellas. */
function faceK(g: Geometry, f: number, eta: number): number {
  const s = (eta - g.fzmin[f]) / DH;
  if (s <= 0) {
    lastA = 0;
    return 0;
  }
  if (s < L - 1) {
    const l = Math.floor(s), w = s - l, b = f * L + l;
    lastA = g.tabA[b] + w * (g.tabA[b + 1] - g.tabA[b]);
    return g.tabK[b] + w * (g.tabK[b + 1] - g.tabK[b]);
  }
  const c = g.c;
  let A = 0, K = 0;
  for (let k = 0; k < c; k++) {
    const d = eta - g.fz[f * c + k];
    if (d > 0) {
      A += d;
      K += (d * Math.cbrt(d * d)) / g.fn[f * c + k];
    }
  }
  lastA = A;
  return K;
}
export function faceProps(g: Geometry, f: number, eta: number): { A: number; K: number } {
  const K = faceK(g, f, eta);
  return { A: lastA, K };
}

/** Índice de la celda que contiene el punto (x, y). */
export const cellAt = (g: Geometry, x: number, y: number) => Math.min(g.MY - 1, Math.max(0, Math.floor(y / g.c))) * g.MX + Math.min(g.MX - 1, Math.max(0, Math.floor(x / g.c)));

// ------------------------------------------------------------------ hidrograma de entrada

export interface Hydro {
  /** Caudal pico [m³/s], tiempo al pico [min] y caudal base [m³/s]. */
  Qp: number;
  tp: number;
  Qb: number;
}
/** Hidrograma con forma gamma (aproximación al hidrograma unitario adimensional del SCS, m = 3,7). */
export function hydroQ(h: Hydro, tSec: number): number {
  if (tSec <= 0) return h.Qb;
  const r = tSec / (h.tp * 60);
  return h.Qb + (h.Qp - h.Qb) * Math.pow(r * Math.exp(1 - r), 3.7);
}

// ------------------------------------------------------------------ la corrida

export interface RunOpts {
  terrain: TerrainOpts;
  mesh: MeshOpts;
  rough: Roughness;
  eq: Eq;
  /** Paso de tiempo: fijo o ajustado por el número de Courant. */
  dtMode: 'fijo' | 'courant';
  dt: number;
  courantMax: number;
  theta: number;
  /** Tolerancia del nivel [m] e iteraciones máximas (onda difusiva). */
  tolWS: number;
  maxIter: number;
  hydro: Hydro;
  /** Pendiente de energía para repartir el caudal en la línea de entrada y pendiente de fricción a la salida. */
  egSlope: number;
  outSlope: number;
  /** Tiempo de condiciones iniciales con el caudal base y duración del evento [min]. */
  warmup: number;
  duration: number;
  /** Intervalo de salida de mapas [s]. */
  outEvery: number;
}

export interface Series {
  t: number[];
  qin: number[];
  qout: number[];
  qBridge: number[];
  wseBridge: number[];
  depthSchool: number[];
  vol: number[];
}

export interface RunResult {
  geom: Geometry;
  opts: RunOpts;
  frames: Float32Array[];
  frameT: number[];
  etaMax: Float32Array;
  vMax: Float32Array;
  /** Cota y velocidad en el instante del mayor producto profundidad × velocidad de cada celda. */
  etaDV: Float32Array;
  vDV: Float32Array;
  ux: Float32Array;
  uy: Float32Array;
  series: Series;
  vol: { init: number; vin: number; vout: number; end: number; err: number; errPct: number; clipped: number };
  steps: number;
  iters: { total: number; max: number; nonconv: number; maxErr: number };
  courantMax: number;
  dtMin: number;
  dtMax: number;
  ms: number;
  unstable: { t: number; why: string } | null;
  log: string[];
}

export type RunStatus = 'preproceso' | 'corriendo' | 'listo' | 'inestable';

/** Una corrida que avanza a ratos (para no congelar la página) y guarda mapas, series y el balance de volumen. */
export class Run {
  readonly o: RunOpts;
  g!: Geometry;
  status: RunStatus = 'preproceso';
  t: number;
  private tEnd: number;
  private eta!: Float64Array;
  private V!: Float64Array;
  private Q!: Float64Array;
  private beta!: Float64Array;
  private betaN!: Float64Array;
  private bc!: Float64Array;
  private dt: number;
  private nextOut: number;
  private belowCount = 0;
  private west: number[] = [];
  private east: number[] = [];
  private bridgeFaces: number[] = [];
  private cBridge = 0;
  private cSchool = 0;
  private zSchool = 0;
  private clock = 0;
  private chunk0 = 0;
  private etaIn = NaN;
  private lastDt = 0;
  res!: RunResult;
  // solucionador lineal
  private D!: Float64Array;
  private Ex!: Float64Array;
  private Ny!: Float64Array;
  private rhs!: Float64Array;
  private x!: Float64Array;
  private r!: Float64Array;
  private zv!: Float64Array;
  private p!: Float64Array;
  private Ap!: Float64Array;
  private Ld!: Float64Array;
  private ek!: Float64Array;
  /** Nivel del paso anterior (para empezar las iteraciones con una extrapolación). */
  private etaOld!: Float64Array;
  /** Parte de almacenamiento de la diagonal (As/Δt): mide el residuo como error de nivel. */
  private Sd!: Float64Array;
  private etaN!: Float64Array;
  private expl!: Float64Array;
  /** Área de cada cara con el nivel del último paso (para las velocidades). */
  private fA!: Float64Array;
  /** Último cambio de volumen de cada celda y cuántas veces seguidas cambió de signo con fuerza. */
  private dEta!: Float32Array;
  private osc!: Uint8Array;

  constructor(o: RunOpts) {
    this.o = o;
    this.t = -o.warmup * 60;
    this.tEnd = o.duration * 60;
    this.dt = o.dt;
    this.nextOut = 0;
  }

  get progress(): number {
    const t0 = -this.o.warmup * 60;
    return Math.max(0, Math.min(1, (this.t - t0) / (this.tEnd - t0)));
  }

  private setup(): void {
    const o = this.o;
    const g = (this.g = buildGeometry(o.terrain, o.mesh, o.rough));
    const NC = g.NC, NF = g.NF;
    this.eta = new Float64Array(NC);
    this.V = new Float64Array(NC);
    for (let i = 0; i < NC; i++) this.eta[i] = g.zmin[i];
    this.Q = new Float64Array(NF);
    this.beta = new Float64Array(NF);
    this.betaN = new Float64Array(NF);
    this.bc = new Float64Array(NC);
    this.fA = new Float64Array(NF);
    this.dEta = new Float32Array(NC);
    this.osc = new Uint8Array(NC);
    for (let f = g.NXF + g.NYF; f < NF; f++) (g.fb[f] === -1 ? this.west : this.east).push(f);
    const Ib = Math.round(440 / g.c);
    for (let J = 0; J < g.MY; J++) this.bridgeFaces.push(J * (g.MX - 1) + (Ib - 1));
    this.cBridge = cellAt(g, POIS.puente.x, POIS.puente.y);
    this.cSchool = cellAt(g, POIS.escuela.x, POIS.escuela.y);
    this.zSchool = g.z[Math.floor(POIS.escuela.y) * NX + Math.floor(POIS.escuela.x)];
    for (const k of ['D', 'Ex', 'Ny', 'rhs', 'x', 'r', 'zv', 'p', 'Ap', 'Ld', 'ek', 'Sd', 'etaN', 'expl', 'etaOld'] as const) this[k] = new Float64Array(NC);
    this.res = {
      geom: g,
      opts: o,
      frames: [],
      frameT: [],
      etaMax: new Float32Array(NC).fill(-Infinity),
      vMax: new Float32Array(NC),
      etaDV: new Float32Array(g.zmin),
      vDV: new Float32Array(NC),
      ux: new Float32Array(NC),
      uy: new Float32Array(NC),
      series: { t: [], qin: [], qout: [], qBridge: [], wseBridge: [], depthSchool: [], vol: [] },
      vol: { init: 0, vin: 0, vout: 0, end: 0, err: 0, errPct: 0, clipped: 0 },
      steps: 0,
      iters: { total: 0, max: 0, nonconv: 0, maxErr: 0 },
      courantMax: 0,
      dtMin: Infinity,
      dtMax: 0,
      ms: 0,
      unstable: null,
      log: [],
    };
    const r = this.res;
    r.log.push(`Preprocesador: ${g.NC.toLocaleString('es-CO')} celdas de ${g.c} m, ${g.NF.toLocaleString('es-CO')} caras, ${(g.NF * L).toLocaleString('es-CO')} puntos de tablas, ${g.ms.toFixed(0)} ms.`);
    r.log.push(`Condiciones iniciales: ${o.warmup} min con el caudal base de ${o.hydro.Qb} m³/s desde el cauce seco.`);
    this.status = 'corriendo';
  }

  /** Reparte el caudal de entrada en la línea oeste: profundidad normal con la pendiente de energía y conducción. */
  private inflow(Qin: number): number {
    const g = this.g, S = Math.sqrt(this.o.egSlope);
    const total = (eta: number) => {
      let s = 0;
      for (const f of this.west) s += faceK(g, f, eta);
      return s * S;
    };
    // nivel normal en la línea de entrada: se busca cerca del anterior (cambia poco de un paso a otro)
    let lo: number, hi: number;
    if (Number.isFinite(this.etaIn)) {
      lo = this.etaIn - 0.25;
      hi = this.etaIn + 0.25;
      while (total(lo) > Qin && lo > this.etaIn - 20) lo -= 1;
      while (total(hi) < Qin && hi < this.etaIn + 20) hi += 1;
    } else {
      lo = Infinity;
      hi = -Infinity;
      for (const f of this.west) {
        lo = Math.min(lo, g.fzmin[f]);
        hi = Math.max(hi, g.fzmin[f]);
      }
      hi += 12;
    }
    for (let k = 0; k < 26; k++) {
      const mid = 0.5 * (lo + hi);
      if (total(mid) < Qin) lo = mid;
      else hi = mid;
    }
    const eta = (this.etaIn = 0.5 * (lo + hi));
    const tot = total(eta);
    for (const f of this.west) {
      const q = tot > 0 ? (faceK(g, f, eta) * S * Qin) / tot : 0;
      this.bc[g.fa[f]] += q;
      this.Q[f] = q;
    }
    return eta;
  }

  private oscillating(): boolean {
    let n = 0;
    for (let i = 0; i < this.g.NC; i++) if (this.osc[i] >= 3) n++;
    return n >= 3;
  }

  /** Avanza la corrida durante `budgetMs` milisegundos; devuelve true al terminar. */
  advance(budgetMs = 12): boolean {
    if (this.status === 'listo' || this.status === 'inestable') return true;
    const t0 = performance.now();
    this.chunk0 = t0;
    if (this.status === 'preproceso') {
      this.setup();
      this.clock += performance.now() - t0;
      return false;
    }
    while (performance.now() - t0 < budgetMs) {
      if (this.t >= this.tEnd - 1e-9) {
        this.finish();
        break;
      }
      const ok = this.o.eq === 'inercia' ? this.stepLI() : this.stepDW();
      if (!ok) break;
    }
    this.clock += performance.now() - t0;
    const st = this.status as RunStatus;
    return st === 'listo' || st === 'inestable';
  }

  /** Corre todo de una vez (pruebas y tablas). */
  runAll(): RunResult {
    while (!this.advance(1e9));
    return this.res;
  }

  private record(dt: number): void {
    const g = this.g, r = this.res, t = this.t;
    r.steps++;
    r.dtMin = Math.min(r.dtMin, dt);
    r.dtMax = Math.max(r.dtMax, dt);
    // velocidades de las celdas desde las caras, y máximos (desde t = 0)
    const ux = r.ux, uy = r.uy;
    ux.fill(0);
    uy.fill(0);
    const minA = 0.02 * g.c;
    for (let f = 0; f < g.NXF + g.NYF; f++) {
      const q = this.Q[f];
      if (q === 0) continue;
      const a = g.fa[f], b = g.fb[f];
      // con láminas de menos de 2 cm en promedio la velocidad no se puede leer bien: no cuenta
      const A = this.fA[f];
      if (A < minA) continue;
      const v = q / A;
      if (f < g.NXF) {
        ux[a] += v * 0.5;
        ux[b] += v * 0.5;
      } else {
        uy[a] += v * 0.5;
        uy[b] += v * 0.5;
      }
    }
    if (t <= 0) return;
    for (let i = 0; i < g.NC; i++) {
      const e = this.eta[i];
      const d = e - g.zmin[i];
      if (e > r.etaMax[i]) r.etaMax[i] = e;
      if (d < 0.01) continue;
      const v = Math.hypot(ux[i], uy[i]);
      if (v > r.vMax[i]) r.vMax[i] = v;
      if (v * d > r.vDV[i] * (r.etaDV[i] - g.zmin[i])) {
        r.vDV[i] = v;
        r.etaDV[i] = e;
      }
    }
  }

  private output(Qin: number, Qout: number): void {
    const r = this.res, g = this.g;
    while (this.t >= this.nextOut - 1e-9 && this.nextOut <= this.tEnd + 1e-9) {
      r.frames.push(Float32Array.from(this.eta));
      r.frameT.push(this.nextOut);
      let qb = 0;
      for (const f of this.bridgeFaces) qb += this.Q[f];
      let vol = 0;
      for (let i = 0; i < g.NC; i++) vol += this.V[i];
      const s = r.series;
      s.t.push(this.nextOut);
      s.qin.push(Qin);
      s.qout.push(Qout);
      s.qBridge.push(qb);
      s.wseBridge.push(this.eta[this.cBridge]);
      s.depthSchool.push(Math.max(0, this.eta[this.cSchool] - this.zSchool));
      s.vol.push(vol);
      this.nextOut += this.o.outEvery;
    }
  }

  private finish(): void {
    const r = this.res, g = this.g;
    let end = 0;
    for (let i = 0; i < g.NC; i++) end += this.V[i];
    r.vol.end = end;
    r.vol.err = r.vol.init + r.vol.vin - r.vol.vout - end;
    r.vol.errPct = (100 * r.vol.err) / Math.max(1, r.vol.vin + r.vol.init);
    r.ms = this.clock + performance.now() - this.chunk0;
    r.log.push(`Fin: ${r.steps.toLocaleString('es-CO')} pasos de tiempo (de ${r.dtMin.toFixed(2)} a ${r.dtMax.toFixed(2)} s), ${(r.ms / 1000).toFixed(1)} s de cálculo.`);
    r.log.push(`Balance de volumen: entró ${Math.round(r.vol.vin).toLocaleString('es-CO')} m³, salió ${Math.round(r.vol.vout).toLocaleString('es-CO')} m³, quedó ${Math.round(end).toLocaleString('es-CO')} m³; error ${r.vol.errPct.toFixed(4)} %.`);
    this.status = 'listo';
  }

  private fail(why: string): boolean {
    const r = this.res;
    r.unstable = { t: this.t, why };
    r.ms = this.clock + performance.now() - this.chunk0;
    r.log.push(`El cálculo se volvió inestable en t = ${(this.t / 60).toFixed(1)} min: ${why}`);
    this.status = 'inestable';
    return false;
  }

  /** Volumen inicial al pasar por t = 0 (después de las condiciones iniciales). */
  private markInit(prevT: number): void {
    if (prevT < 0 && this.t >= 0) {
      let v = 0;
      for (let i = 0; i < this.g.NC; i++) v += this.V[i];
      this.res.vol.init = v;
      this.res.vol.vin = 0;
      this.res.vol.vout = 0;
    }
  }

  // ---------------------------------------------------------------- inercia local (explícita)

  private stepLI(): boolean {
    const g = this.g, o = this.o, NC = g.NC, c = g.c;
    const eta = this.eta, V = this.V, Q = this.Q, bc = this.bc;
    // paso de tiempo: Courant de la onda (velocidad + celeridad) con α = 0,7, o el fijo
    let hmax = 0, umax = 0;
    for (let i = 0; i < NC; i++) {
      const d = eta[i] - g.zmin[i];
      if (d > hmax) hmax = d;
    }
    for (let i = 0; i < NC; i++) {
      const u = Math.abs(this.res.ux[i]) + Math.abs(this.res.uy[i]);
      if (u > umax) umax = u;
    }
    const cel = Math.sqrt(G * Math.max(0.05, hmax)) + umax;
    let dt = o.dtMode === 'fijo' ? o.dt : Math.min(o.dt, (o.courantMax * c) / cel);
    if (this.t < 0) dt = Math.min(dt, -this.t);
    else dt = Math.min(dt, this.tEnd - this.t);
    if (dt <= 0) dt = 1e-3;
    const C = (cel * dt) / c;
    if (this.t >= 0 && C > this.res.courantMax) this.res.courantMax = C;
    const Qin = hydroQ(o.hydro, this.t);
    bc.fill(0);
    this.inflow(Qin);
    // cantidad de movimiento en las caras interiores: Q = (Q − g·A·Δt·∂η/∂n) / (1 + g·A·Δt·|Q|/K²)
    const nInt = g.NXF + g.NYF;
    for (let f = 0; f < nInt; f++) {
      const a = g.fa[f], b = g.fb[f];
      const ea = eta[a], eb = eta[b];
      const ef = ea > eb ? ea : eb;
      const K = faceK(g, f, ef);
      const A = lastA;
      this.fA[f] = A;
      if (A < 1e-6 || K < 1e-9) {
        Q[f] = 0;
        continue;
      }
      const q = Q[f];
      Q[f] = (q - (G * A * dt * (eb - ea)) / c) / (1 + (G * A * dt * Math.abs(q)) / (K * K));
    }
    // salida: profundidad normal con la pendiente de fricción, Q = K(η)·√S, evaluada al final del paso
    // (linealizada): así la celda del borde no se vacía y se llena paso a paso
    const So = Math.sqrt(o.outSlope);
    const qin = this.zv;
    for (const f of this.east) qin[g.fa[f]] = bc[g.fa[f]];
    for (let f = 0; f < nInt; f++) {
      const q = Q[f];
      if (q > 0 && g.fb[f] % g.MX === g.MX - 1) qin[g.fb[f]] += q;
      else if (q < 0 && g.fa[f] % g.MX === g.MX - 1) qin[g.fa[f]] -= q;
    }
    for (const f of this.east) {
      const a = g.fa[f];
      const q0 = faceK(g, f, eta[a]) * So;
      if (q0 <= 0) {
        Q[f] = 0;
        continue;
      }
      const As = Math.max(cellWetArea(g, a, eta[a] + 0.01), 1e-3 * c * c);
      const dq = ((faceK(g, f, eta[a] + 0.01) * So - q0) / 0.01) * (dt / As);
      Q[f] = (q0 + dq * qin[a]) / (1 + dq);
    }
    // que ninguna celda entregue más agua de la que tiene
    const out = this.r;
    out.fill(0);
    for (let f = 0; f < nInt; f++) {
      const q = Q[f];
      if (q > 0) out[g.fa[f]] += q * dt;
      else if (q < 0) out[g.fb[f]] -= q * dt;
    }
    for (const f of this.east) out[g.fa[f]] += Q[f] * dt;
    const sc = this.zv;
    for (let i = 0; i < NC; i++) sc[i] = out[i] > V[i] + bc[i] * dt ? (V[i] + bc[i] * dt) / out[i] : 1;
    for (let f = 0; f < nInt; f++) {
      const q = Q[f];
      if (q > 0) Q[f] = q * sc[g.fa[f]];
      else if (q < 0) Q[f] = q * sc[g.fb[f]];
    }
    let Qout = 0;
    for (const f of this.east) {
      Q[f] *= sc[g.fa[f]];
      Qout += Q[f];
    }
    // continuidad
    const dV = this.x;
    for (let i = 0; i < NC; i++) dV[i] = bc[i] * dt;
    for (let f = 0; f < nInt; f++) {
      const q = Q[f] * dt;
      dV[g.fa[f]] -= q;
      dV[g.fb[f]] += q;
    }
    for (const f of this.east) dV[g.fa[f]] -= Q[f] * dt;
    let bad = false;
    // una oscilación «grande» mueve en un paso el equivalente a 10 cm sobre toda la celda
    const last = this.dEta, osc = this.osc, big = 0.1 * c * c;
    for (let i = 0; i < NC; i++) {
      let v = V[i] + dV[i];
      if (v < 0) {
        this.res.vol.clipped -= v;
        v = 0;
      }
      V[i] = v;
      const e = cellLevel(g, i, v);
      const dv = dV[i];
      if (!Number.isFinite(e)) bad = true;
      osc[i] = dv * last[i] < 0 && Math.abs(dv) > big && Math.abs(last[i]) > big ? osc[i] + 1 : 0;
      last[i] = dv;
      eta[i] = e;
    }
    if (bad) return this.fail('aparecieron números no válidos (la solución explotó).');
    const prevT = this.t;
    this.t += dt;
    this.markInit(prevT);
    if (this.t > 0) {
      this.res.vol.vin += Qin * dt;
      this.res.vol.vout += Qout * dt;
    }
    this.record(dt);
    // detector de inestabilidad: niveles que oscilan (suben y bajan más de 30 cm en pasos seguidos, la firma de
    // un esquema explícito con un paso demasiado grande) o velocidades absurdas
    if (this.oscillating()) return this.fail(`los niveles empezaron a oscilar paso a paso (Courant ${C.toFixed(2)}).`);
    let vmax = 0;
    for (let i = 0; i < NC; i++) vmax = Math.max(vmax, Math.abs(this.res.ux[i]), Math.abs(this.res.uy[i]));
    if (vmax > 25) return this.fail(`velocidades de ${vmax.toFixed(0)} m/s, que no existen en este valle (Courant ${C.toFixed(2)}).`);
    this.output(Qin, Qout);
    return true;
  }

  // ---------------------------------------------------------------- onda difusiva (implícita)

  private stepDW(): boolean {
    const g = this.g, o = this.o, NC = g.NC, c = g.c, MX = g.MX;
    const eta = this.eta, V = this.V, beta = this.beta, betaN = this.betaN, bc = this.bc;
    const theta = o.theta;
    const nInt = g.NXF + g.NYF;
    let dt = this.dt;
    if (this.t < 0) dt = Math.min(dt, -this.t);
    else dt = Math.min(dt, this.tEnd - this.t);
    if (dt <= 0) dt = 1e-3;
    const Qin = hydroQ(o.hydro, this.t + dt);
    bc.fill(0);
    this.inflow(Qin);
    const So = Math.sqrt(o.outSlope);
    const SMIN = 1e-5;
    // η^k empieza en η^n
    const ek = this.ek, etaN = this.etaN, expl = this.expl;
    etaN.set(eta);
    // primer intento: lo que venía cambiando el nivel (sin bajar del fondo de la celda)
    const eo = this.etaOld;
    const ratio = this.lastDt > 0 ? Math.min(1, dt / this.lastDt) : 0;
    for (let i = 0; i < NC; i++) {
      const e = eta[i] + (eo[i] > 0 ? (eta[i] - eo[i]) * ratio : 0);
      ek[i] = e > g.zmin[i] ? e : g.zmin[i];
    }
    // flujos explícitos (1 − θ) con β del paso anterior
    expl.fill(0);
    if (theta < 1) {
      for (let f = 0; f < nInt; f++) {
        const q = betaN[f] * (etaN[g.fa[f]] - etaN[g.fb[f]]) * (1 - theta);
        expl[g.fa[f]] -= q;
        expl[g.fb[f]] += q;
      }
    }
    let it = 0, err = Infinity;
    for (it = 1; it <= o.maxIter; it++) {
      // β de las caras: Q = β·(η_a − η_b), β = K/(Δx·√|S|). Se evalúa con el nivel del paso anterior y se corrige
      // una vez con el de la iteración; luego queda fijo y las iteraciones resuelven la curva cota-volumen (que es
      // convexa: así convergen siempre).
      if (it <= 2) {
        const src = it === 1 ? etaN : ek;
        for (let f = 0; f < nInt; f++) {
          const a = g.fa[f], b = g.fb[f];
          const ea = src[a], eb = src[b];
          const ef = ea > eb ? ea : eb;
          const K = faceK(g, f, ef);
          let bn = 0;
          // una cara con menos de 1 cm de agua sobre su punto más bajo no conduce (umbral de mojado)
          if (K > 0 && ef - g.fzmin[f] > HMIN) {
            const S = Math.abs(eb - ea) / c;
            bn = K / (c * Math.sqrt(S > SMIN ? S : SMIN));
          }
          beta[f] = it === 1 ? bn : Math.sqrt(beta[f] * bn) || 0.5 * (beta[f] + bn);
        }
      }
      // ensamblar: (As/Δt + θΣβ + dQout/dη)·η − θΣβ·η_vecino = (As·η^k − V(η^k) + V^n)/Δt + explícito + entradas
      const D = this.D, Ex = this.Ex, Ny = this.Ny, rhs = this.rhs;
      Ex.fill(0);
      Ny.fill(0);
      for (let i = 0; i < NC; i++) {
        // área mojada (la derivada de la curva cota-volumen); en una celda seca, la de 5 cm sobre su punto más
        // bajo, para que no salte al recibir agua
        const As = Math.max(cellWetArea(g, i, ek[i] - g.zmin[i] > 0.005 ? ek[i] : g.zmin[i] + 0.05), 1e-3 * c * c);
        D[i] = As / dt;
        this.Sd[i] = As / dt;
        rhs[i] = (As * ek[i] - cellVolume(g, i, ek[i]) + V[i]) / dt + expl[i] + bc[i];
      }
      for (let f = 0; f < nInt; f++) {
        const w = theta * beta[f];
        if (w === 0) continue;
        const a = g.fa[f];
        D[a] += w;
        D[g.fb[f]] += w;
        if (f < g.NXF) Ex[a] = -w;
        else Ny[a] = -w;
      }
      for (const f of this.east) {
        const a = g.fa[f];
        const K0 = faceK(g, f, ek[a]);
        const K1 = faceK(g, f, ek[a] + 0.01);
        const q0 = K0 * So, dq = ((K1 - K0) * So) / 0.01;
        D[a] += dq;
        rhs[a] -= q0 - dq * ek[a];
      }
      this.solve(MX, NC, ek);
      // nivel nuevo (no por debajo del fondo de la celda)
      err = 0;
      for (let i = 0; i < NC; i++) {
        let e = this.x[i];
        if (e < g.zmin[i]) e = g.zmin[i];
        if (e > ek[i] + 2) e = ek[i] + 2;
        else if (e < ek[i] - 2) e = ek[i] - 2;
        const de = Math.abs(e - ek[i]);
        if (de > err) err = de;
        ek[i] = e;
      }
      if (!Number.isFinite(err)) return this.fail('el sistema de ecuaciones no tuvo solución válida.');
      if (err < o.tolWS) break;
    }
    const conv = err < o.tolWS;
    if (it > o.maxIter) it = o.maxIter;
    // flujos finales (ponderados con θ) y actualización conservativa del volumen
    const Q = this.Q;
    for (let f = 0; f < nInt; f++) Q[f] = theta * beta[f] * (ek[g.fa[f]] - ek[g.fb[f]]) + (1 - theta) * betaN[f] * (etaN[g.fa[f]] - etaN[g.fb[f]]);
    for (const f of this.east) Q[f] = faceK(g, f, ek[g.fa[f]]) * So;
    // que ninguna celda entregue más agua de la que tiene más la que le llega en el paso (en un esquema implícito el
    // agua puede atravesar una celda seca en un solo paso). Una celda que se seca no puede dar más: se ajustan sus
    // salidas y se repite, porque eso cambia lo que reciben las de aguas abajo.
    const out = this.r, sc = this.zv, inn = this.D;
    for (let pass = 0; pass < 6; pass++) {
      out.fill(0);
      inn.fill(0);
      for (let f = 0; f < nInt; f++) {
        const q = Q[f];
        if (q > 0) {
          out[g.fa[f]] += q * dt;
          inn[g.fb[f]] += q * dt;
        } else if (q < 0) {
          out[g.fb[f]] -= q * dt;
          inn[g.fa[f]] -= q * dt;
        }
      }
      for (const f of this.east) out[g.fa[f]] += Q[f] * dt;
      let any = false;
      for (let i = 0; i < NC; i++) {
        const avail = V[i] + bc[i] * dt + inn[i];
        sc[i] = out[i] > avail * (1 + 1e-9) + 1e-9 ? avail / out[i] : 1;
        if (sc[i] < 1) any = true;
      }
      if (!any) break;
      for (let f = 0; f < nInt; f++) {
        const q = Q[f];
        if (q !== 0) Q[f] = q * (q > 0 ? sc[g.fa[f]] : sc[g.fb[f]]);
      }
      for (const f of this.east) Q[f] *= sc[g.fa[f]];
    }
    const dV = this.x;
    for (let i = 0; i < NC; i++) dV[i] = bc[i] * dt;
    for (let f = 0; f < nInt; f++) {
      const q = Q[f];
      dV[g.fa[f]] -= q * dt;
      dV[g.fb[f]] += q * dt;
    }
    let Qout = 0;
    for (const f of this.east) {
      dV[g.fa[f]] -= Q[f] * dt;
      Qout += Q[f];
    }
    let vErr = 0;
    for (let i = 0; i < NC; i++) {
      let v = V[i] + dV[i];
      if (v < 0) {
        this.res.vol.clipped -= v;
        v = 0;
      }
      V[i] = v;
      const e = cellLevel(g, i, v);
      const d = Math.abs(e - ek[i]);
      if (d > vErr && v > 0) vErr = d;
      eta[i] = e;
    }
    betaN.set(beta);
    this.etaOld.set(etaN);
    this.lastDt = dt;
    const r = this.res;
    if (this.t + dt > 0) {
      r.iters.total += it;
      r.iters.max = Math.max(r.iters.max, it);
      if (!conv) r.iters.nonconv++;
      r.iters.maxErr = Math.max(r.iters.maxErr, err);
    }
    // Courant con la velocidad del agua en las caras (como lo define HEC-RAS)
    let C = 0;
    for (let f = 0; f < nInt; f++) {
      const a = g.fa[f], b = g.fb[f];
      faceK(g, f, Math.max(eta[a], eta[b]));
      this.fA[f] = lastA;
      if (Q[f] === 0 || lastA < 0.05 * c) continue;
      const v = Math.abs(Q[f]) / lastA;
      if (v * dt > C * c) C = (v * dt) / c;
    }
    const prevT = this.t;
    this.t += dt;
    this.markInit(prevT);
    if (this.t > 0) {
      r.vol.vin += Qin * dt;
      r.vol.vout += Qout * dt;
      if (C > r.courantMax) r.courantMax = C;
    }
    this.record(dt);
    if (vErr > 5) return this.fail(`el volumen y el nivel dejaron de cuadrar (${vErr.toFixed(1)} m).`);
    let vmax = 0;
    for (let i = 0; i < NC; i++) vmax = Math.max(vmax, Math.abs(r.ux[i]), Math.abs(r.uy[i]));
    if (vmax > 25 || !Number.isFinite(vmax)) return this.fail(`velocidades de ${vmax.toFixed(0)} m/s, que no existen en este valle.`);
    this.output(Qin, Qout);
    // paso ajustable por Courant (como la opción de HEC-RAS: se parte o se duplica el paso base)
    if (o.dtMode === 'courant') {
      if (C > o.courantMax && this.dt > o.dt / 64) {
        this.dt /= 2;
        this.belowCount = 0;
      } else if (C < o.courantMax / 2.5 && this.dt < o.dt) {
        if (++this.belowCount >= 4) {
          this.dt *= 2;
          this.belowCount = 0;
        }
      } else this.belowCount = 0;
    }
    return true;
  }

  /**
   * Gradiente conjugado con precondicionador de Cholesky incompleto modificado, MIC(0), para la matriz de 5
   * puntos (cada celda con sus vecinas del este, oeste, norte y sur).
   */
  private solve(MX: number, NC: number, x0: Float64Array): void {
    const D = this.D, Ex = this.Ex, Ny = this.Ny, b = this.rhs, x = this.x, r = this.r, z = this.zv, p = this.p, Ap = this.Ap, P = this.Ld, Sd = this.Sd;
    const MY = NC / MX;
    // factor: P = 1/√e, con e = D − (Ex·P)² − (Ny·P)² − τ·(términos de relleno que el IC(0) descarta)
    const TAU = 0.97;
    for (let J = 0, i = 0; J < MY; J++)
      for (let I = 0; I < MX; I++, i++) {
        let e = D[i];
        if (I > 0) {
          const w = Ex[i - 1] * P[i - 1];
          e -= w * w + TAU * Ex[i - 1] * Ny[i - 1] * P[i - 1] * P[i - 1];
        }
        if (J > 0) {
          const sN = Ny[i - MX] * P[i - MX];
          e -= sN * sN + TAU * Ny[i - MX] * Ex[i - MX] * P[i - MX] * P[i - MX];
        }
        if (e < 1e-10 * D[i]) e = D[i];
        P[i] = 1 / Math.sqrt(e);
      }
    const mul = (v: Float64Array, out: Float64Array) => {
      for (let J = 0, i = 0; J < MY; J++)
        for (let I = 0; I < MX; I++, i++) {
          let s = D[i] * v[i];
          if (I > 0) s += Ex[i - 1] * v[i - 1];
          if (I < MX - 1) s += Ex[i] * v[i + 1];
          if (J > 0) s += Ny[i - MX] * v[i - MX];
          if (J < MY - 1) s += Ny[i] * v[i + MX];
          out[i] = s;
        }
    };
    const prec = (rr: Float64Array, out: Float64Array) => {
      for (let J = 0, i = 0; J < MY; J++)
        for (let I = 0; I < MX; I++, i++) {
          let s = rr[i];
          if (I > 0) s -= Ex[i - 1] * P[i - 1] * out[i - 1];
          if (J > 0) s -= Ny[i - MX] * P[i - MX] * out[i - MX];
          out[i] = s * P[i];
        }
      for (let J = MY - 1, i = NC - 1; J >= 0; J--)
        for (let I = MX - 1; I >= 0; I--, i--) {
          let s = out[i];
          if (I < MX - 1) s -= Ex[i] * P[i] * out[i + 1];
          if (J < MY - 1) s -= Ny[i] * P[i] * out[i + MX];
          out[i] = s * P[i];
        }
    };
    x.set(x0);
    mul(x, Ap);
    let r0 = 0;
    for (let i = 0; i < NC; i++) {
      r[i] = b[i] - Ap[i];
      const e = Math.abs(r[i] / Sd[i]);
      if (e > r0) r0 = e;
    }
    // el residuo se mide como error de nivel de cada celda (volumen que falta cuadrar entre su almacenamiento)
    if (r0 < 1e-6) return;
    prec(r, z);
    p.set(z);
    let rz = 0;
    for (let i = 0; i < NC; i++) rz += r[i] * z[i];
    for (let k = 0; k < 600; k++) {
      mul(p, Ap);
      let pAp = 0;
      for (let i = 0; i < NC; i++) pAp += p[i] * Ap[i];
      if (pAp <= 0) break;
      const al = rz / pAp;
      let rmax = 0;
      for (let i = 0; i < NC; i++) {
        x[i] += al * p[i];
        r[i] -= al * Ap[i];
        const e = Math.abs(r[i] / Sd[i]);
        if (e > rmax) rmax = e;
      }
      if (rmax < 1e-6) break;
      prec(r, z);
      let rz2 = 0;
      for (let i = 0; i < NC; i++) rz2 += r[i] * z[i];
      const be = rz2 / rz;
      rz = rz2;
      for (let i = 0; i < NC; i++) p[i] = z[i] + be * p[i];
    }
  }
}

export { ROAD, L as TABLE_LEVELS, DH as TABLE_DH };

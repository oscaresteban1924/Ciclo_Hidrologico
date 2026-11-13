// La práctica profesional sobre el modelo 2D de la sala: calibración con marcas de agua, incertidumbre con un
// ensamble de corridas (mapa de probabilidad de inundación), zonificación de la amenaza como ejercicio (con un
// criterio usado en estudios colombianos, no una norma) y daños con curvas profundidad-daño y el daño anual
// esperado. Todo es ilustrativo: el valle, la creciente observada y las marcas son inventados.

import { COVER_KEYS, LEVEE, NX, NY, POIS, ROAD, rand, truth, yc } from './terrain';
import { cellAt, normalN, type Geometry, type MeshOpts, type RunOpts, type RunResult } from './solver';
import { baseRun, LIDAR_BURNED } from './scene';
import { AMS_FIT, designHydro, gumbelK, quantile } from './hydrology';

/** Malla de las partes de práctica profesional: celdas de 20 m refinadas a 10 m en el cauce y el jarillón. */
export const RISK_MESH: MeshOpts = { c: 20, subgrid: true, breaklines: true, refine: [{ region: 'cauce', c: 10 }, { region: 'jarillon', c: 10 }] };

/** Cota representativa del suelo de una celda (la mediana de sus píxeles). */
export function cellGround(g: Geometry, ci: number): number {
  return g.zs[g.cOff[ci] + Math.floor((g.cCnt[ci] - 1) / 2)];
}

// ------------------------------------------------------------------ calibración con marcas de agua

/** La creciente del ejercicio (inventada): pico de 66 m³/s a los 40 min. */
export const EVENT = { Qp: 66, tp: 40, Qb: 4 };
/** El multiplicador del n con que se hizo la corrida «real» escondida que dejó las marcas. */
export const HIDDEN_MULT = 1.18;
/** Error de medición de las marcas (uniforme, ± m). */
export const MARK_NOISE = 0.05;

export interface Mark {
  id: string;
  name: string;
  x: number;
  y: number;
}
/** Marcas de agua levantadas después de la creciente: en árboles y muros de las orillas, el estribo del puente y
 * dos casas del barrio. */
export const MARKS: Mark[] = [
  { id: 'm1', name: 'Árbol en la orilla sur, aguas arriba', x: 70, y: yc(70) - 8 },
  { id: 'm2', name: 'Muro de la orilla norte', x: 150, y: yc(150) + 8 },
  { id: 'm3', name: 'Árbol en la orilla sur', x: 215, y: yc(215) - 8 },
  { id: 'm4', name: 'Poste frente al barrio', x: 300, y: yc(300) + 8 },
  { id: 'm5', name: 'Árbol en la orilla sur', x: 350, y: yc(350) - 8 },
  { id: 'm6', name: 'Estribo del puente, aguas arriba', x: ROAD.x - 8, y: yc(ROAD.x) - 9 },
  { id: 'm7', name: 'Árbol en la orilla sur, aguas abajo', x: 520, y: yc(520) - 5 },
  { id: 'm8', name: 'Muro de la orilla norte, aguas abajo', x: 600, y: yc(600) + 5 },
];

export const calibRun = (mult: number): RunOpts => baseRun({ rough: { n: normalN(), mult, buildings: 'n' }, hydro: EVENT, mesh: RISK_MESH, duration: 120, store: 'max' });

/** Las marcas que dejó la corrida escondida, con su error de medición (cota en m, o null si la marca no quedó). */
export function marksFrom(hidden: RunResult): (number | null)[] {
  const R = rand(2024);
  return MARKS.map((m) => {
    const ci = cellAt(hidden.geom, m.x, m.y);
    const e = hidden.etaMax[ci];
    const zg = hidden.geom.z[Math.floor(m.y) * NX + Math.floor(m.x)];
    const noise = (R() * 2 - 1) * MARK_NOISE;
    return e - zg > 0.05 ? Math.round((e + noise) * 100) / 100 : null;
  });
}

export interface Fit {
  rmse: number;
  bias: number;
  n: number;
  /** Modelo menos marca en cada punto (m). */
  resid: (number | null)[];
  model: number[];
}
export function fitStats(res: RunResult, obs: (number | null)[]): Fit {
  const resid: (number | null)[] = [];
  const model: number[] = [];
  let s = 0, s2 = 0, n = 0;
  MARKS.forEach((m, k) => {
    const e = res.etaMax[cellAt(res.geom, m.x, m.y)];
    model.push(e);
    const o = obs[k];
    if (o === null || !Number.isFinite(e)) {
      resid.push(null);
      return;
    }
    const r = e - o;
    resid.push(r);
    s += r;
    s2 += r * r;
    n++;
  });
  return { rmse: n ? Math.sqrt(s2 / n) : NaN, bias: n ? s / n : NaN, n, resid, model };
}

/** Búsqueda de sección dorada del mínimo de f en [a, b] (cada evaluación es una corrida). */
export async function golden(f: (x: number) => Promise<number>, a: number, b: number, tol = 0.02, onStep: (x: number, v: number) => void = () => {}): Promise<{ x: number; v: number; evals: { x: number; v: number }[] }> {
  const gr = (Math.sqrt(5) - 1) / 2;
  const evals: { x: number; v: number }[] = [];
  const ev = async (x: number) => {
    const v = await f(x);
    evals.push({ x, v });
    onStep(x, v);
    return v;
  };
  let c = b - gr * (b - a), d = a + gr * (b - a);
  let fc = await ev(c), fd = await ev(d);
  while (b - a > tol) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = await ev(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = await ev(d);
    }
  }
  const best = evals.reduce((p, q) => (q.v < p.v ? q : p));
  return { x: best.x, v: best.v, evals };
}

// ------------------------------------------------------------------ incertidumbre: el ensamble

/** Error estándar del cuantil de Gumbel ajustado por momentos (Kite): s/√n·√(1 + 1,1396·K + 1,1·K²). */
export const gumbelSE = (T: number, f = AMS_FIT) => {
  const K = gumbelK(T);
  return (f.sd / Math.sqrt(f.n)) * Math.sqrt(1 + 1.1396 * K + 1.1 * K * K);
};

export interface Member {
  mult: number;
  Qp: number;
}
/** Miembros del ensamble: el caudal de 100 años con su error estándar y el n con un error de ±15 % (lognormal). */
export function members(n: number, seed = 7, T = 100, sdN = 0.15): Member[] {
  const R = rand(seed);
  const gauss = () => {
    let u = 0;
    while (u === 0) u = R();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R());
  };
  const Q = quantile(AMS_FIT, T), se = gumbelSE(T);
  return Array.from({ length: n }, () => ({ mult: Math.round(Math.exp(sdN * gauss()) * 1000) / 1000, Qp: Math.round(Math.max(10, Q + se * gauss()) * 10) / 10 }));
}
export const memberRun = (m: Member, tp = 30): RunOpts => baseRun({ rough: { n: normalN(), mult: m.mult, buildings: 'n' }, hydro: { Qp: m.Qp, tp, Qb: 4 }, mesh: RISK_MESH, store: 'max' });

/** Probabilidad de inundación de cada celda: la fracción de miembros con más de `thr` m sobre su suelo. */
export function probabilityMap(rs: RunResult[], thr = 0.1): Float32Array {
  const g = rs[0].geom, p = new Float32Array(g.NC);
  for (let i = 0; i < g.NC; i++) {
    const zg = cellGround(g, i);
    let k = 0;
    for (const r of rs) if (r.etaMax[i] - zg > thr) k++;
    p[i] = k / rs.length;
  }
  return p;
}

// ------------------------------------------------------------------ zonificación de la amenaza (ejercicio)

/** Umbrales de intensidad de un estudio de amenaza colombiano (corredor del río Cauca, CVC): profundidad, velocidad
 * y su producto. Cada estudio fija los suyos; aquí se usan como ejemplo. */
export const INTENSITY = { baja: { h: 0.5, v: 0.5, hv: 0.225 }, media: { h: 1.0, v: 0.8, hv: 0.45 } };
export const INTENSITY_NAMES = ['Sin agua', 'Baja', 'Media', 'Alta'];
/** Intensidad (0 sin agua, 1 baja, 2 media, 3 alta) con la profundidad, la velocidad y su producto. */
export function intensity(h: number, v: number, hv: number): number {
  if (h < 0.05) return 0;
  if (h > INTENSITY.media.h || v > INTENSITY.media.v || hv > INTENSITY.media.hv) return 3;
  if (h > INTENSITY.baja.h || v > INTENSITY.baja.v || hv > INTENSITY.baja.hv) return 2;
  return 1;
}
/** Matriz del ejercicio: la intensidad con la creciente frecuente (30 años) pesa más que con la rara (100 años). */
export function zoneOf(i30: number, i100: number): number {
  if (i30 >= 2 || i100 === 3) return 3;
  if (i30 === 1 || i100 === 2) return 2;
  if (i100 === 1) return 1;
  return 0;
}
export const ZONE_NAMES = ['Sin amenaza en el ejercicio', 'Amenaza baja', 'Amenaza media', 'Amenaza alta'];

/** Intensidad de cada celda en una corrida (profundidad sobre su suelo, velocidad máxima y el mayor producto). */
export function intensityMap(r: RunResult): Uint8Array {
  const g = r.geom, out = new Uint8Array(g.NC);
  for (let i = 0; i < g.NC; i++) {
    const zg = cellGround(g, i);
    const h = r.etaMax[i] - zg;
    const hv = Math.max(0, r.etaDV[i] - zg) * r.vDV[i];
    out[i] = intensity(h, r.vMax[i], hv);
  }
  return out;
}
export function zoneMap(r30: RunResult, r100: RunResult): Uint8Array {
  const a = intensityMap(r30), b = intensityMap(r100), out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = zoneOf(a[i], b[i]);
  return out;
}
/** Área de cada zona en el barrio [m²] (por píxel). */
export function zoneAreas(g: Geometry, z: Uint8Array): number[] {
  const T = truth();
  const out = [0, 0, 0, 0];
  for (let j = 236; j < 356; j++)
    for (let i = 100; i < 440; i++) {
      const k = j * NX + i;
      if (T.dist[k] <= LEVEE.dn + 5) continue;
      const ci = g.pmap[k];
      if (ci >= 0) out[z[ci]] += g.px * g.px;
    }
  return out;
}

// ------------------------------------------------------------------ daños y daño anual esperado

/** Curva profundidad-daño residencial con la forma de las funciones globales del JRC para Suramérica (Huizinga et
 * al., 2017): fracción del valor de la vivienda dañada según la profundidad del agua. Ilustrativa. */
export const DAMAGE_CURVE = { d: [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6], f: [0, 0.49, 0.71, 0.84, 0.93, 0.98, 1, 1, 1] };
export function damageFrac(d: number): number {
  const { d: D, f: F } = DAMAGE_CURVE;
  if (d <= 0) return 0;
  if (d >= D[D.length - 1]) return 1;
  let k = 0;
  while (D[k + 1] < d) k++;
  return F[k] + ((F[k + 1] - F[k]) * (d - D[k])) / (D[k + 1] - D[k]);
}

/** Profundidad máxima en cada casa (el mayor valor sobre su huella, contra el suelo del MDT) [m]. */
export function buildingDepths(r: RunResult): number[] {
  const T = truth(), g = r.geom;
  return T.buildings.map((b) => {
    let d = 0;
    for (let j = Math.floor(b.y0); j < Math.ceil(b.y1); j++)
      for (let i = Math.floor(b.x0); i < Math.ceil(b.x1); i++) {
        if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
        const k = j * NX + i, ci = g.pmap[k];
        if (ci >= 0) d = Math.max(d, r.etaMax[ci] - T.mdt[k]);
      }
    return d;
  });
}
/** Área de cada casa [m²] (el valor expuesto se mide en metros cuadrados de vivienda). */
export const buildingAreas = () => truth().buildings.map((b) => (b.x1 - b.x0) * (b.y1 - b.y0));

export interface Damage {
  depths: number[];
  fracs: number[];
  /** Daño total en metros cuadrados de vivienda equivalentes y casas con agua. */
  total: number;
  wet: number;
}
export function damageOf(r: RunResult): Damage {
  const depths = buildingDepths(r), A = buildingAreas();
  const fracs = depths.map(damageFrac);
  return { depths, fracs, total: fracs.reduce((s, f, k) => s + f * A[k], 0), wet: depths.filter((d) => d > 0.05).length };
}

/** Periodos de retorno de la curva de daño. */
export const EAD_PERIODS = [2, 5, 10, 25, 50, 100, 500];
export const eadRun = (T: number): RunOpts => baseRun({ hydro: designHydro(T, 30), mesh: RISK_MESH, store: 'max', terrain: LIDAR_BURNED });

/**
 * Daño anual esperado: el área bajo la curva daño–probabilidad de excedencia (regla del trapecio entre los periodos
 * corridos); por debajo de la probabilidad del mayor periodo se supone el mismo daño (cola), y por encima de la del
 * menor, el daño de ese periodo hasta P = 0,5.
 */
export function ead(points: { T: number; D: number }[]): { total: number; parts: { from: number; to: number; area: number }[] } {
  const s = [...points].sort((a, b) => a.T - b.T);
  const parts: { from: number; to: number; area: number }[] = [];
  for (let k = 0; k + 1 < s.length; k++) {
    const p1 = 1 / s[k].T, p2 = 1 / s[k + 1].T;
    parts.push({ from: s[k].T, to: s[k + 1].T, area: 0.5 * (s[k].D + s[k + 1].D) * (p1 - p2) });
  }
  const last = s[s.length - 1];
  parts.push({ from: last.T, to: Infinity, area: last.D / last.T });
  return { total: parts.reduce((a, p) => a + p.area, 0), parts };
}

export { COVER_KEYS, POIS };

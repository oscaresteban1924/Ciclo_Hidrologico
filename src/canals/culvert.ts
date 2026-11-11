// Alcantarillas: tubos de concreto bajo un terraplén vial. El nivel del agua a la entrada (HW) es el mayor entre el
// que exige la entrada (control a la entrada) y el que exige el tubo con su fricción y el nivel aguas abajo (control
// a la salida). Si supera la vía, el agua pasa por encima. Métodos de FHWA HDS-5, Hydraulic Design of Highway
// Culverts (3.ª ed., 2012), en unidades del SI. Cálculo didáctico: no es un diseño de ingeniería.

import { G, circMaxDepth, criticalDepth, geom, manningQ, normalDepth, type Section } from './hydraulics';

export type Inlet = 'muro' | 'campana' | 'saliente';

/** Constantes de control a la entrada para tubo circular de concreto (HDS-5, tabla A.1) y pérdida de entrada ke. */
export const INLETS: Record<Inlet, { name: string; K: number; M: number; c: number; Y: number; Ks: number; ke: number }> = {
  muro: { name: 'Muro con borde recto', K: 0.0098, M: 2.0, c: 0.0398, Y: 0.67, Ks: -0.5, ke: 0.5 },
  campana: { name: 'Muro con borde de campana', K: 0.0018, M: 2.0, c: 0.0292, Y: 0.74, Ks: -0.5, ke: 0.2 },
  saliente: { name: 'Campana saliente del terraplén', K: 0.0045, M: 2.0, c: 0.0317, Y: 0.69, Ks: -0.5, ke: 0.2 },
};

/** Conversión de unidades de HDS-5 en el SI. */
export const KU = 1.811;
/** n de Manning del tubo de concreto. */
export const N_PIPE = 0.012;
/** Coeficiente de vertedero de la vía pavimentada (HDS-5: 3,0 en unidades inglesas ≈ 1,66 en el SI). */
export const CR_ROAD = 1.66;
/** Largo de la vía por donde puede pasar el agua (m). */
export const ROAD_LEN = 40;
/** Reglas del juego para el prediseño: agua a la entrada hasta 1,5 D, 0,5 m bajo la vía y salida a 4,5 m/s o menos. */
export const CULVERT_RULES = { hwd: 1.5, free: 0.5, vout: 4.5 };

export interface CulvertInput {
  Q: number;
  D: number;
  barrels: number;
  L: number;
  S: number;
  inlet: Inlet;
  /** Profundidad del agua aguas abajo (m). */
  tw: number;
  /** Altura de la vía sobre el fondo del tubo a la entrada (m). */
  road: number;
}

export const DEFAULT_CULVERT: CulvertInput = { Q: 6, D: 1.5, barrels: 1, L: 30, S: 0.01, inlet: 'muro', tw: 0.6, road: 4 };

export function sanitizeCulvert(p: Partial<CulvertInput>): CulvertInput {
  const d = DEFAULT_CULVERT;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  return {
    Q: num(p.Q, 0.2, 60, d.Q),
    D: num(p.D, 0.4, 3.6, d.D),
    barrels: Math.round(num(p.barrels, 1, 4, d.barrels)),
    L: num(p.L, 5, 120, d.L),
    S: num(p.S, 0, 0.08, d.S),
    inlet: p.inlet && p.inlet in INLETS ? p.inlet : d.inlet,
    tw: num(p.tw, 0, 6, d.tw),
    road: num(p.road, 1, 12, d.road),
  };
}

const pipe = (D: number): Section => ({ shape: 'circ', b: 0, z: 0, D, H: D });

/** Nivel a la entrada por control a la entrada para el caudal de un tubo (HDS-5, forma 1 y transición). */
export function inletHW(q: number, D: number, S: number, inlet: Inlet): { hw: number; X: number; regime: 'libre' | 'transicion' | 'sumergida' } {
  const C = INLETS[inlet];
  const A = (Math.PI * D * D) / 4;
  const X = (KU * q) / (A * Math.sqrt(D));
  const sec = pipe(D);
  const unsub = (x: number) => {
    const qq = (x * A * Math.sqrt(D)) / KU;
    const dc = criticalDepth(sec, qq);
    const Ac = geom(sec, dc).A;
    const Hc = dc + (qq * qq) / (2 * G * Ac * Ac);
    return Hc / D + C.K * Math.pow(x, C.M) + C.Ks * S;
  };
  const sub = (x: number) => C.c * x * x + C.Y + C.Ks * S;
  if (X <= 3.5) return { hw: D * unsub(X), X, regime: 'libre' };
  if (X >= 4) return { hw: D * sub(X), X, regime: 'sumergida' };
  const f = (X - 3.5) / 0.5;
  return { hw: D * ((1 - f) * unsub(3.5) + f * sub(4)), X, regime: 'transicion' };
}

/** Nivel a la entrada por control a la salida (HDS-5, ecuación de energía con el tubo lleno). */
export function outletHW(q: number, D: number, L: number, S: number, tw: number, inlet: Inlet): { hw: number; H: number; ho: number } {
  const A = (Math.PI * D * D) / 4, R = D / 4, V = q / A;
  const ke = INLETS[inlet].ke;
  const H = (1 + ke + (2 * G * N_PIPE * N_PIPE * L) / Math.pow(R, 4 / 3)) * ((V * V) / (2 * G));
  const dc = Math.min(criticalDepth(pipe(D), q), D);
  const ho = Math.max(tw, (dc + D) / 2);
  return { hw: H + ho - L * S, H, ho };
}

function culvertHW(q: number, inp: CulvertInput) {
  const i = inletHW(q, inp.D, inp.S, inp.inlet);
  const o = outletHW(q, inp.D, inp.L, inp.S, inp.tw, inp.inlet);
  return { i, o, hw: Math.max(i.hw, o.hw), control: (i.hw >= o.hw ? 'entrada' : 'salida') as 'entrada' | 'salida' };
}

export interface CulvertResult {
  inp: CulvertInput;
  /** Caudal por cada tubo (m³/s). */
  q: number;
  /** Agua a la entrada sobre el fondo del tubo (m). */
  hw: number;
  hwInlet: number;
  hwOutlet: number;
  control: 'entrada' | 'salida';
  regime: 'libre' | 'transicion' | 'sumergida';
  /** HW / D. */
  ratio: number;
  /** Lo que pasa por encima de la vía (m³/s). */
  Qover: number;
  overtop: boolean;
  /** Profundidad y velocidad a la salida del tubo. */
  yOut: number;
  Vout: number;
  /** Profundidad normal en el tubo (NaN si va lleno) y crítica. */
  yn: number;
  yc: number;
  /** Capacidad de un tubo a superficie libre con Manning. */
  Qfree: number;
  /** Cumple las reglas del juego (HW ≤ 1,5 D, 0,5 m bajo la vía, salida ≤ 4,5 m/s). */
  ok: boolean;
  checks: { name: string; ok: boolean; value: string }[];
}

export function culvertModel(inp0: Partial<CulvertInput>): CulvertResult {
  const inp = sanitizeCulvert(inp0);
  const nb = inp.barrels;
  let q = inp.Q / nb;
  let h = culvertHW(q, inp);
  let Qover = 0;
  if (h.hw > inp.road) {
    // el agua pasa también por encima de la vía: se reparte el caudal hasta igualar el nivel
    const f = (qc: number) => culvertHW(qc, inp).hw - (inp.road + Math.pow(Math.max(0, inp.Q - qc * nb) / (CR_ROAD * ROAD_LEN), 2 / 3));
    let lo = 0, hi = q;
    for (let k = 0; k < 80; k++) {
      const m = (lo + hi) / 2;
      if (f(m) > 0) hi = m;
      else lo = m;
    }
    q = (lo + hi) / 2;
    h = culvertHW(q, inp);
    Qover = Math.max(0, inp.Q - q * nb);
  }
  const sec = pipe(inp.D);
  const ym = circMaxDepth(inp.D);
  const Qfree = inp.S > 0 ? manningQ(sec, N_PIPE, inp.S, ym) : 0;
  const yn = inp.S > 0 ? normalDepth(sec, N_PIPE, inp.S, q) : NaN;
  const yc = criticalDepth(sec, q);
  // a la salida (HDS-5): con control a la salida, la mayor entre la crítica y el nivel de abajo (lleno si el nivel
  // de abajo tapa el tubo); con control a la entrada, la profundidad normal del tubo
  let yOut: number;
  if (h.control === 'salida') yOut = inp.tw >= inp.D ? inp.D : Math.min(inp.D, Math.max(yc, inp.tw));
  else yOut = Number.isNaN(yn) ? inp.D : Math.min(inp.D, yn);
  const Aout = yOut >= inp.D * 0.999 ? (Math.PI * inp.D * inp.D) / 4 : geom(sec, yOut).A;
  const Vout = q / Aout;
  const ratio = h.hw / inp.D;
  const checks = [
    { name: `Agua a la entrada de ${CULVERT_RULES.hwd} D o menos`, ok: ratio <= CULVERT_RULES.hwd, value: `${ratio.toFixed(2).replace('.', ',')} D` },
    { name: `Al menos ${CULVERT_RULES.free.toString().replace('.', ',')} m bajo la vía`, ok: inp.road - h.hw >= CULVERT_RULES.free, value: `${(inp.road - h.hw).toFixed(2).replace('.', ',')} m` },
    { name: `Salida a ${CULVERT_RULES.vout.toString().replace('.', ',')} m/s o menos`, ok: Vout <= CULVERT_RULES.vout, value: `${Vout.toFixed(2).replace('.', ',')} m/s` },
  ];
  return {
    inp,
    q,
    hw: h.hw,
    hwInlet: h.i.hw,
    hwOutlet: h.o.hw,
    control: h.control,
    regime: h.i.regime,
    ratio,
    Qover,
    overtop: Qover > 1e-6,
    yOut,
    Vout,
    yn,
    yc,
    Qfree,
    ok: checks.every((c) => c.ok),
    checks,
  };
}

/** Curva de funcionamiento: nivel a la entrada para caudales de 0 a Qmax (control a la entrada y a la salida). */
export function ratingCurve(inp0: Partial<CulvertInput>, Qmax: number, n = 40): { Q: number; inlet: number; outlet: number }[] {
  const inp = sanitizeCulvert(inp0);
  const out: { Q: number; inlet: number; outlet: number }[] = [];
  for (let k = 1; k <= n; k++) {
    const Q = (Qmax * k) / n;
    const q = Q / inp.barrels;
    out.push({ Q, inlet: inletHW(q, inp.D, inp.S, inp.inlet).hw, outlet: outletHW(q, inp.D, inp.L, inp.S, inp.tw, inp.inlet).hw });
  }
  return out;
}

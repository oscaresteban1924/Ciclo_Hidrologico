// Cálculo de la sala «Bombas y energía del agua»: curva de una bomba y leyes de afinidad, bombas en serie y en
// paralelo, curva del sistema con Darcy-Weisbach, punto de operación, NPSH y cavitación, y una pequeña central
// hidroeléctrica con su curva de duración de caudales. Sin interfaz.

import { darcy, nuWater, PIPE_MATS } from '../supply/pipes';

export const G = 9.81;
export const RHO = 1000;

// ------------------------------------------------------------------ la bomba

export interface PumpCurve {
  /** Altura a caudal cero a velocidad nominal [m]. */
  H0: number;
  /** Curva H = H0 − a·Q² con Q en L/s. */
  a: number;
  /** Caudal de mejor eficiencia a velocidad nominal [L/s]. */
  Qbep: number;
  etaMax: number;
  /** NPSH requerido: NPSHr0 + b·Q² [m], Q en L/s. */
  NPSHr0: number;
  b: number;
  /** Velocidad nominal [rpm]. */
  N0: number;
  name: string;
}

/** Bomba centrífuga ilustrativa (curva típica de catálogo, no de una marca). */
export const PUMP: PumpCurve = { H0: 52, a: 0.0055, Qbep: 55, etaMax: 0.78, NPSHr0: 1.5, b: 0.0008, N0: 1750, name: 'Bomba centrífuga ilustrativa' };

/**
 * Altura de una bomba a la velocidad relativa n = N/N0 (leyes de afinidad: los puntos homólogos cumplen Q ∝ n y
 * H ∝ n², de modo que H(Q, n) = n²·H0 − a·Q²).
 */
export function pumpHead(p: PumpCurve, Q: number, n = 1): number {
  return n * n * p.H0 - p.a * Q * Q;
}

/** Eficiencia: la de la curva nominal en el punto homólogo Q/n (parábola alrededor del mejor punto). */
export function pumpEta(p: PumpCurve, Q: number, n = 1): number {
  const x = (Q / Math.max(1e-9, n) - p.Qbep) / p.Qbep;
  return Math.max(0, p.etaMax * (1 - x * x));
}

/** NPSH requerido a la velocidad relativa n: n²·NPSHr0 + b·Q². */
export function npshr(p: PumpCurve, Q: number, n = 1): number {
  return n * n * p.NPSHr0 + p.b * Q * Q;
}

export type Arrangement = 'una' | 'serie' | 'paralelo';
export const ARRANGEMENTS: Record<Arrangement, string> = { una: 'Una bomba', serie: 'Dos en serie', paralelo: 'Dos en paralelo' };

/** Curva del conjunto: en serie se suman las alturas con el mismo caudal; en paralelo, los caudales con la misma altura. */
export function setHead(p: PumpCurve, arr: Arrangement, Q: number, n = 1): number {
  if (arr === 'serie') return 2 * pumpHead(p, Q, n);
  if (arr === 'paralelo') return pumpHead(p, Q / 2, n);
  return pumpHead(p, Q, n);
}

/** Caudal por cada bomba del conjunto. */
export const perPump = (arr: Arrangement, Q: number) => (arr === 'paralelo' ? Q / 2 : Q);

// ------------------------------------------------------------------ el sistema

export interface SystemInput {
  /** Altura estática (del nivel de succión al de entrega) [m]. */
  Hs: number;
  /** Tubería: largo [m], diámetro [m], material. */
  L: number;
  D: number;
  mat: keyof typeof PIPE_MATS;
  /** Suma de coeficientes de pérdidas locales (codos, válvulas, entrada y salida). */
  K: number;
  /** Temperatura del agua [°C]. */
  T: number;
}

/** Altura que pide el sistema para llevar Q [L/s]: estática + fricción (Darcy-Weisbach) + locales. */
export function systemHead(s: SystemInput, Q: number): { H: number; hf: number; hm: number; V: number } {
  if (Q <= 0) return { H: s.Hs, hf: 0, hm: 0, V: 0 };
  const q = Q / 1000;
  const d = darcy(q, s.D, s.L, PIPE_MATS[s.mat].eps, nuWater(s.T));
  const hm = (s.K * d.V * d.V) / (2 * G);
  return { H: s.Hs + d.hf + hm, hf: d.hf, hm, V: d.V };
}

export interface OperatingPoint {
  /** Caudal del conjunto [L/s] y altura [m]; null si la bomba no alcanza la altura estática. */
  Q: number;
  H: number;
  eta: number;
  /** Potencia que recibe el agua y la que pide el eje del conjunto [kW]. */
  Pw: number;
  Pshaft: number;
  /** Energía por metro cúbico bombeado [kWh/m³]. */
  e: number;
  hf: number;
  hm: number;
  V: number;
  flows: boolean;
}

/** Punto de operación: el caudal donde la curva del conjunto corta la del sistema (bisección). */
export function operatingPoint(p: PumpCurve, arr: Arrangement, n: number, s: SystemInput): OperatingPoint {
  const f = (Q: number) => setHead(p, arr, Q, n) - systemHead(s, Q).H;
  const Qmax = (arr === 'paralelo' ? 2 : 1) * n * Math.sqrt(p.H0 / p.a);
  if (f(0) <= 0) return { Q: 0, H: setHead(p, arr, 0, n), eta: 0, Pw: 0, Pshaft: 0, e: 0, hf: 0, hm: 0, V: 0, flows: false };
  let lo = 0, hi = Qmax;
  for (let k = 0; k < 80; k++) {
    const m = (lo + hi) / 2;
    if (f(m) > 0) lo = m;
    else hi = m;
  }
  const Q = (lo + hi) / 2;
  const sh = systemHead(s, Q);
  const eta = pumpEta(p, perPump(arr, Q), n);
  const Pw = (RHO * G * (Q / 1000) * sh.H) / 1000;
  const Pshaft = eta > 0 ? Pw / eta : Infinity;
  return { Q, H: sh.H, eta, Pw, Pshaft, e: Pshaft / ((Q / 1000) * 3600), hf: sh.hf, hm: sh.hm, V: sh.V, flows: true };
}

// ------------------------------------------------------------------ cavitación

/** Presión atmosférica estándar a la altitud z [m] (kPa). */
export function patm(z: number): number {
  return 101.325 * Math.pow(1 - 2.25577e-5 * z, 5.25588);
}

/** Presión de vapor del agua [kPa] (Tetens, de 0 a 100 °C). */
export function pvap(T: number): number {
  return 0.61078 * Math.exp((17.27 * T) / (T + 237.3));
}

/** Densidad del agua [kg/m³] entre 0 y 100 °C (ajuste usual). */
export function rhoWater(T: number): number {
  return 1000 * (1 - ((T + 288.9414) / (508929.2 * (T + 68.12963))) * (T - 3.9863) ** 2);
}

export interface SuctionInput {
  /** Altitud del lugar [m]. */
  z: number;
  /** Temperatura del agua [°C]. */
  T: number;
  /** Altura del nivel del agua sobre el eje de la bomba [m] (negativa si la bomba está más arriba: succión). */
  zs: number;
  /** Tubería de succión: largo [m], diámetro [m] y coeficiente de pérdidas locales (entrada, codo, válvula de pie). */
  Ls: number;
  Ds: number;
  Ks: number;
}

/** NPSH disponible: (Patm − Pv)/(ρg) + zs − pérdidas en la succión [m]. */
export function npsha(s: SuctionInput, Q: number): { NPSHa: number; hfs: number; atm: number; vap: number; V: number } {
  const rho = rhoWater(s.T);
  const atm = (patm(s.z) * 1000) / (rho * G), vap = (pvap(s.T) * 1000) / (rho * G);
  let hfs = 0, V = 0;
  if (Q > 0) {
    const d = darcy(Q / 1000, s.Ds, s.Ls, PIPE_MATS.acero.eps, nuWater(s.T));
    V = d.V;
    hfs = d.hf + (s.Ks * V * V) / (2 * G);
  }
  return { NPSHa: atm - vap + s.zs - hfs, hfs, atm, vap, V };
}

/** Margen usual del NPSH disponible sobre el requerido [m]. */
export const NPSH_MARGIN = 0.5;

/** Caudal máximo [L/s] sin cavitación (NPSHa = NPSHr + margen), o 0 si cavita aun con caudal mínimo. */
export function maxFlowNoCav(p: PumpCurve, s: SuctionInput, n = 1, margin = NPSH_MARGIN): number {
  const g = (Q: number) => npsha(s, Q).NPSHa - npshr(p, Q, n) - margin;
  if (g(0.01) < 0) return 0;
  let lo = 0.01, hi = 3 * n * Math.sqrt(p.H0 / p.a);
  if (g(hi) > 0) return hi;
  for (let k = 0; k < 80; k++) {
    const m = (lo + hi) / 2;
    if (g(m) > 0) lo = m;
    else hi = m;
  }
  return lo;
}

// ------------------------------------------------------------------ pequeña central hidroeléctrica

export type Turbine = 'pelton' | 'banki' | 'francis' | 'kaplan';

/**
 * Turbinas: rango usual de altura [m] y de caudal [m³/s] (envolventes aproximadas de las guías de pequeñas centrales,
 * ESHA, 2004), eficiencia máxima y caudal mínimo de operación como fracción del de diseño.
 */
export const TURBINES: Record<Turbine, { name: string; H: [number, number]; Q: [number, number]; etaMax: number; minFrac: number }> = {
  pelton: { name: 'Pelton', H: [60, 1000], Q: [0.02, 10], etaMax: 0.9, minFrac: 0.1 },
  banki: { name: 'Michell-Banki (flujo cruzado)', H: [3, 150], Q: [0.02, 2.5], etaMax: 0.8, minFrac: 0.2 },
  francis: { name: 'Francis', H: [15, 400], Q: [0.3, 40], etaMax: 0.93, minFrac: 0.4 },
  kaplan: { name: 'Kaplan', H: [2, 35], Q: [0.8, 60], etaMax: 0.92, minFrac: 0.25 },
};

/** Eficiencia de la turbina con carga parcial (q = Q/Qd): curvas típicas suavizadas de cada tipo. */
export function turbineEta(t: Turbine, q: number): number {
  const T = TURBINES[t];
  if (q < T.minFrac || q <= 0) return 0;
  const x = Math.min(1, q);
  const shape = t === 'pelton' ? 1 - 0.35 * Math.pow(1 - x, 3) : t === 'kaplan' ? 1 - 0.3 * Math.pow(1 - x, 2.5) : t === 'banki' ? 1 - 0.18 * Math.pow(1 - x, 2) : 1 - 0.85 * Math.pow(1 - x, 2.2);
  return T.etaMax * Math.max(0, shape);
}

/** Tipos de turbina cuyo rango incluye la altura neta y el caudal de diseño. */
export function turbinesFor(H: number, Q: number): Turbine[] {
  return (Object.keys(TURBINES) as Turbine[]).filter((k) => H >= TURBINES[k].H[0] && H <= TURBINES[k].H[1] && Q >= TURBINES[k].Q[0] && Q <= TURBINES[k].Q[1]);
}

/** Inversa de la distribución logística: curva de duración de caudales ilustrativa alrededor de la mediana Q50. */
export function fdc(Q50: number, p: number, spread = 1.15): number {
  const pp = Math.min(0.999, Math.max(0.001, p));
  return Q50 * Math.exp((spread * Math.log((1 - pp) / pp)) / 1.7);
}

export interface HydroInput {
  /** Caída bruta [m]. */
  Hg: number;
  /** Caudal de diseño de la turbina [m³/s]. */
  Qd: number;
  /** Tubería de presión: diámetro [m] y largo [m] (acero). */
  D: number;
  L: number;
  turbine: Turbine;
  /** Mediana del caudal del río [m³/s] y caudal que se deja en el río [m³/s]. */
  Q50: number;
  Qeco: number;
  /** Eficiencia del generador y del transformador. */
  etaG: number;
}

export interface HydroResult {
  /** Con el caudal de diseño: pérdida en la tubería, altura neta y potencia [kW]. */
  hf: number;
  Hn: number;
  P: number;
  V: number;
  /** Energía al año [MWh], factor de planta y curva de potencia sobre la de duración. */
  E: number;
  cf: number;
  curve: { p: number; Qriver: number; Qt: number; P: number }[];
  fits: Turbine[];
}

/** Potencia con un caudal Q por la turbina [kW] y la altura neta. */
export function hydroPower(h: HydroInput, Q: number): { P: number; Hn: number; hf: number; V: number } {
  if (Q <= 0) return { P: 0, Hn: h.Hg, hf: 0, V: 0 };
  const d = darcy(Q, h.D, h.L, PIPE_MATS.acero.eps, nuWater(15));
  const Hn = Math.max(0, h.Hg - d.hf * 1.1); // 10 % más por pérdidas locales (rejilla, codos, válvula)
  const eta = turbineEta(h.turbine, Q / h.Qd) * h.etaG;
  return { P: (RHO * G * Q * Hn * eta) / 1000, Hn, hf: h.Hg - Hn, V: d.V };
}

/** Central de pasada: con la curva de duración del río, el caudal turbinado es min(Qrío − Qeco, Qd). */
export function hydro(h: HydroInput, n = 200): HydroResult {
  const d = hydroPower(h, h.Qd);
  const curve: HydroResult['curve'] = [];
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const p = (k + 0.5) / n;
    const Qr = fdc(h.Q50, p);
    const Qt = Math.max(0, Math.min(h.Qd, Qr - h.Qeco));
    const P = hydroPower(h, Qt).P;
    curve.push({ p, Qriver: Qr, Qt, P });
    sum += P;
  }
  const Pmean = sum / n;
  const E = (Pmean * 8760) / 1000;
  return { hf: d.hf, Hn: d.Hn, P: d.P, V: d.V, E, cf: d.P > 0 ? Pmean / d.P : 0, curve, fits: turbinesFor(d.Hn, h.Qd) };
}

/** Consumo de un hogar colombiano típico para contar casas abastecidas [kWh/mes] (ilustrativo). */
export const HOME_KWH_MONTH = 150;

// Cálculos avanzados de la hidráulica de canales: funciones puras que usan las calculadoras, los prediseñadores y
// las escenas. Cada una cita su fuente. Son cálculos académicos: no son diseños de ingeniería.
//
// - Canal en tierra por fuerza tractiva (Lane, 1955; en Chow, 1959, cap. 7) y rugosidad compuesta (Horton y
//   Einstein, en Chow, 1959).
// - Pozos amortiguadores USBR tipos II, III y IV (Peterka, 1958/1978; U.S. Bureau of Reclamation, Design of Small
//   Dams, 1987).
// - Pilas de puente: remanso de Yarnell (1934; HEC-RAS Hydraulic Reference Manual) y socavación local y por
//   contracción (FHWA HEC-18, 5.ª ed., 2012).
// - Transporte de sedimentos: Meyer-Peter y Müller (Wong y Parker, 2006), Einstein y Brown (Brown, 1950), van Rijn
//   (1984) y Engelund y Hansen (1967); formas del lecho de van Rijn (1984).
// - Aforo: canaleta Parshall (USBR, Water Measurement Manual, tabla 8-6) y molinete por sección media (ISO 748).

import { G } from './hydraulics';
import { KAPPA, NU, RHO, RHO_S, SG, dStar, fallVelocity, shieldsCrit } from './sediment';

const GAMMA = RHO * G;
const deg = (a: number) => (a * Math.PI) / 180;

// ------------------------------------------------------------------ canal en tierra (fuerza tractiva)

/** Razón de fuerza tractiva de Lane: K = √(1 − sen²θ/sen²φ), θ el ángulo del talud, φ el de reposo. */
export function laneK(z: number, phiDeg: number): number {
  const th = Math.atan(1 / Math.max(1e-9, z));
  const s = Math.sin(th) ** 2 / Math.sin(deg(phiDeg)) ** 2;
  return s >= 1 ? 0 : Math.sqrt(1 - s);
}

/**
 * Esfuerzo permisible en el fondo para material grueso no cohesivo (Lane): τp ≈ 0,4·d75 (lb/ft², d75 en pulgadas),
 * es decir, 0,754 Pa por milímetro de d75. Válido para d75 de 6 mm o más.
 */
export function lanePermissible(d75mm: number): number {
  return 0.754 * d75mm;
}

/**
 * Esfuerzos máximos en un trapecio (Lane, en Chow 1959, fig. 7-7, para b/y ≥ 4 y taludes de 1,5 a 2): en el fondo
 * 0,97·γ·y·S y en los taludes 0,75·γ·y·S.
 */
export function maxShear(y: number, S: number): { bed: number; side: number } {
  return { bed: 0.97 * GAMMA * y * S, side: 0.75 * GAMMA * y * S };
}

/** Rugosidad compuesta de Horton y Einstein: n = [Σ Pᵢ·nᵢ^1,5 / P]^(2/3). */
export function hortonN(parts: { P: number; n: number }[]): number {
  const P = parts.reduce((a, p) => a + p.P, 0);
  if (P <= 0) return NaN;
  return Math.pow(parts.reduce((a, p) => a + p.P * Math.pow(p.n, 1.5), 0) / P, 2 / 3);
}

// ------------------------------------------------------------------ pozos USBR

export type BasinType = 'I' | 'II' | 'III' | 'IV';

export interface BasinDesign {
  type: BasinType;
  /** Por qué ese tipo. */
  why: string;
  /** Largo del pozo (m) y su razón con y2. */
  L: number;
  LperY2: number;
  /** Agua mínima a la salida (m). */
  twMin: number;
  /** Dados de entrada, bloques amortiguadores y umbral (m). Cero si el tipo no los lleva. */
  chute: { h: number; w: number; s: number } | null;
  baffle: { h: number; w: number; s: number; x: number } | null;
  sill: { h: number; dentated: boolean };
  /** Largo de un resalto libre (tipo I) para comparar. */
  Lfree: number;
}

/**
 * Selección y proporciones de los pozos del USBR (Peterka 1958/1978; Design of Small Dams, 1987):
 * - Tipo III: F1 > 4,5, V1 ≤ 18 m/s y q ≤ 18,6 m²/s. Dados de entrada de alto, ancho y separación y1; bloques
 *   amortiguadores de alto h3 = y1·(4 + F1)/6, ancho y separación 0,75·h3, a 0,8·y2 del pie; umbral macizo de alto
 *   h4 = y1·(18 + F1)/18. Largo ≈ 2,7·y2. Agua a la salida: y2.
 * - Tipo II: F1 > 4,5 con velocidades mayores. Dados y1; umbral dentado de 0,2·y2. Largo ≈ 4,3·y2. Agua a la
 *   salida: 1,05·y2.
 * - Tipo IV: 2,5 < F1 < 4,5 (resalto oscilante). Deflectores de alto 2·y1, ancho y1 y separación 2,5·y1; umbral
 *   opcional; largo ≈ 6·y2; agua a la salida 1,1·y2.
 * Los largos son aproximaciones de las curvas de Peterka para valores típicos de F1.
 * - Tipo I (sin accesorios): resalto libre, largo 6,9·(y2 − y1).
 */
export function usbrBasin(y1: number, V1: number, F1: number, y2: number, q: number): BasinDesign {
  const Lfree = 6.9 * (y2 - y1);
  if (F1 > 4.5 && V1 <= 18 && q <= 18.6) {
    const h3 = (y1 * (4 + F1)) / 6;
    return {
      type: 'III',
      why: `F1 = ${F1.toFixed(1)} > 4,5, V1 = ${V1.toFixed(1)} m/s ≤ 18 m/s y q = ${q.toFixed(1)} m²/s ≤ 18,6 m²/s`,
      L: 2.7 * y2,
      LperY2: 2.7,
      twMin: y2,
      chute: { h: y1, w: y1, s: y1 },
      baffle: { h: h3, w: 0.75 * h3, s: 0.75 * h3, x: 0.8 * y2 },
      sill: { h: (y1 * (18 + F1)) / 18, dentated: false },
      Lfree,
    };
  }
  if (F1 > 4.5) {
    return {
      type: 'II',
      why: `F1 = ${F1.toFixed(1)} > 4,5, pero V1 = ${V1.toFixed(1)} m/s o q = ${q.toFixed(1)} m²/s exceden los límites del tipo III (los bloques sufrirían cavitación)`,
      L: 4.3 * y2,
      LperY2: 4.3,
      twMin: 1.05 * y2,
      chute: { h: y1, w: y1, s: y1 },
      baffle: null,
      sill: { h: 0.2 * y2, dentated: true },
      Lfree,
    };
  }
  if (F1 > 2.5) {
    return {
      type: 'IV',
      why: `2,5 < F1 = ${F1.toFixed(1)} < 4,5: resalto oscilante, que manda ondas aguas abajo`,
      L: 6.0 * y2,
      LperY2: 6.0,
      twMin: 1.1 * y2,
      chute: { h: 2 * y1, w: y1, s: 2.5 * y1 },
      baffle: null,
      // el umbral macizo es opcional en el tipo IV: no se dimensiona aquí
      sill: { h: 0, dentated: false },
      Lfree,
    };
  }
  return { type: 'I', why: `F1 = ${F1.toFixed(1)} ≤ 2,5: resalto débil, basta un pozo liso`, L: Lfree, LperY2: Lfree / y2, twMin: y2, chute: null, baffle: null, sill: { h: 0, dentated: false }, Lfree };
}

// ------------------------------------------------------------------ pilas de puente

export type PierShape = 'semicircular' | 'cilindros' | 'cilindrosSin' | 'triangular' | 'cuadrada';

/** Coeficiente de forma K de Yarnell (HEC-RAS Hydraulic Reference Manual) y K1 de HEC-18 para la socavación. */
export const PIERS: Record<PierShape, { name: string; K: number; K1: number }> = {
  semicircular: { name: 'Punta y cola semicirculares', K: 0.9, K1: 1.0 },
  cilindros: { name: 'Dos cilindros con diafragma', K: 0.95, K1: 1.0 },
  cilindrosSin: { name: 'Dos cilindros sin diafragma', K: 1.05, K1: 1.0 },
  triangular: { name: 'Punta y cola triangulares de 90°', K: 1.05, K1: 0.9 },
  cuadrada: { name: 'Punta y cola cuadradas', K: 1.25, K1: 1.1 },
};

/**
 * Remanso de Yarnell (flujo lento sin estrangular, clase A): Δy = K·F3²·(K + 5·F3² − 0,6)·(α + 15·α⁴)·y3, con y3
 * y F3 aguas abajo del puente y α la fracción del área de paso que tapan las pilas.
 */
export function yarnell(K: number, y3: number, V3: number, alpha: number): number {
  const F2 = (V3 * V3) / (G * y3);
  return K * F2 * (K + 5 * F2 - 0.6) * (alpha + 15 * alpha ** 4) * y3;
}

/**
 * Socavación local en una pila (HEC-18, ecuación de la CSU): ys/y1 = 2,0·K1·K2·K3·(a/y1)^0,65·Fr1^0,43, con
 * K2 = (cos θ + L/a·sen θ)^0,65 y K3 = 1,1 (agua clara, lecho plano o dunas pequeñas). Límites para pilas de punta
 * redonda alineadas: ys ≤ 2,4·a si Fr1 ≤ 0,8 y ys ≤ 3,0·a si Fr1 > 0,8.
 */
export function pierScour(a: number, y1: number, V1: number, K1: number, opts: { L?: number; skew?: number; K3?: number } = {}): { ys: number; Fr: number; K2: number; capped: boolean } {
  const Fr = V1 / Math.sqrt(G * y1);
  const th = deg(opts.skew ?? 0);
  const L = opts.L ?? a;
  const K2 = Math.pow(Math.cos(th) + (L / a) * Math.sin(th), 0.65);
  const K3 = opts.K3 ?? 1.1;
  let ys = y1 * 2.0 * K1 * K2 * K3 * Math.pow(a / y1, 0.65) * Math.pow(Fr, 0.43);
  const cap = (Fr <= 0.8 ? 2.4 : 3.0) * a;
  const capped = (opts.skew ?? 0) === 0 && K1 <= 1.0 && ys > cap;
  if (capped) ys = cap;
  return { ys, Fr, K2, capped };
}

/** Velocidad crítica para mover el lecho (HEC-18): Vc = 6,19·y^(1/6)·D50^(1/3), en SI. */
export function criticalVelocity(y: number, d50: number): number {
  return 6.19 * Math.pow(y, 1 / 6) * Math.cbrt(d50);
}

/**
 * Socavación por contracción (HEC-18). Lecho vivo (Laursen modificada): y2/y1 = (Q2/Q1)^(6/7)·(W1/W2)^k1, con k1
 * de 0,59, 0,64 o 0,69 según u* / ω. Agua clara: y2 = [0,025·Q²/(Dm^(2/3)·W²)]^(3/7), Dm = 1,25·D50. ys = y2 − y0.
 */
export function contractionScour(Q: number, W1: number, W2: number, y1: number, y0: number, d50: number, S: number): { ys: number; y2: number; live: boolean; k1: number; Vc: number; V1: number } {
  const V1 = Q / (W1 * y1);
  const Vc = criticalVelocity(y1, d50);
  const live = V1 > Vc;
  let y2: number, k1 = 0;
  if (live) {
    const ustar = Math.sqrt(G * y1 * S);
    const r = ustar / fallVelocity(d50);
    k1 = r < 0.5 ? 0.59 : r <= 2 ? 0.64 : 0.69;
    y2 = y1 * Math.pow(W1 / W2, k1);
  } else {
    const Dm = 1.25 * d50;
    y2 = Math.pow((0.025 * Q * Q) / (Math.pow(Dm, 2 / 3) * W2 * W2), 3 / 7);
  }
  return { ys: Math.max(0, y2 - y0), y2, live, k1, Vc, V1 };
}

// ------------------------------------------------------------------ sedimentos: varias fórmulas y formas del lecho

export interface TransportCase {
  /** Diámetro mediano (m), profundidad (m), velocidad media (m/s), pendiente (m/m) y radio hidráulico (m). */
  d: number;
  h: number;
  V: number;
  S: number;
  R: number;
}

export interface TransportResult {
  theta: number;
  thetaCr: number;
  Dstar: number;
  ustar: number;
  /** Transporte por unidad de ancho (m²/s) de cada fórmula. */
  mpm: number;
  einsteinBrown: number;
  vanRijn: number;
  engelundHansen: number;
  /** Etapa de transporte de van Rijn: T = (u*'² − u*cr²)/u*cr². */
  T: number;
  bedform: Bedform;
  /** Alto y largo de las formas del lecho (m) y su velocidad de avance (m/s). */
  dune: { height: number; length: number; celerity: number };
  /** Si el grano está dentro del rango con que se calibró cada fórmula. */
  valid: { mpm: boolean; einsteinBrown: boolean; vanRijn: boolean; engelundHansen: boolean };
}

/** Rangos de grano con que se calibraron las fórmulas (m): MPM en grava, van Rijn y Engelund-Hansen en arena. */
export const FORMULA_RANGE = { mpm: [0.0004, 0.0286], einsteinBrown: [0.0003, 0.0286], vanRijn: [0.0002, 0.002], engelundHansen: [0.00015, 0.005] } as const;

export type Bedform = 'plano-quieto' | 'rizos' | 'dunas' | 'transicion' | 'plano-alto' | 'antidunas';

export const BEDFORM_NAME: Record<Bedform, string> = {
  'plano-quieto': 'lecho plano, sin movimiento',
  rizos: 'rizos (ondas pequeñas)',
  dunas: 'dunas',
  transicion: 'dunas que se borran (transición)',
  'plano-alto': 'lecho plano de régimen alto',
  antidunas: 'antidunas (ondas que suben contra la corriente)',
};

/**
 * Cuatro fórmulas para el mismo caso. q* = q/√((s − 1)·g·d³).
 * - Meyer-Peter y Müller (Wong y Parker, 2006): q* = 3,97·(θ − θcr)^1,5.
 * - Einstein y Brown (Brown, 1950): q* = 40·K·θ³ si θ ≥ 0,18; si no, q* = K·e^(−0,391/θ)/0,465; con
 *   K = √(2/3 + 36/D*³) − √(36/D*³).
 * - van Rijn (1984), arrastre de fondo: q* = 0,053·T^2,1/D*^0,3 (T < 3) o 0,1·T^1,5/D*^0,3 (T ≥ 3), con
 *   u*' = √g·V/C', C' = 18·log10(12·R/(3·d90)) y d90 ≈ 2·d50.
 * - Engelund y Hansen (1967), carga total: q* = 0,1·θ^2,5/f, con f = 2·g·R·S/V².
 * Formas del lecho (van Rijn, 1984): rizos si D* < 10 y T < 3; dunas si T < 15; transición si T < 25; lecho plano
 * o antidunas (Fr > 0,8) arriba. Dunas: alto Δ = 0,11·h·(d/h)^0,3·(1 − e^(−0,5T))·(25 − T), largo 7,3·h; rizos:
 * largo ≈ 1 000·d y alto ≈ largo/7. Avance (Exner, forma triangular): c = 2·qb/((1 − p)·Δ), p = 0,4.
 */
export function transport(c: TransportCase): TransportResult {
  const { d, h, V, S, R } = c;
  const tau = GAMMA * R * S;
  const ustar = Math.sqrt(tau / RHO);
  const theta = tau / ((RHO_S - RHO) * G * d);
  const thetaCr = shieldsCrit(d);
  const D = dStar(d);
  const scale = Math.sqrt((SG - 1) * G * d * d * d);
  const mpm = theta > thetaCr ? 3.97 * Math.pow(theta - thetaCr, 1.5) * scale : 0;
  const K = Math.sqrt(2 / 3 + 36 / D ** 3) - Math.sqrt(36 / D ** 3);
  const eb = (theta >= 0.18 ? 40 * K * theta ** 3 : (K * Math.exp(-0.391 / theta)) / 0.465) * scale;
  const ucr = Math.sqrt(thetaCr * (SG - 1) * G * d);
  const Cg = 18 * Math.log10((12 * R) / (3 * 2 * d));
  const usg = Cg > 0 ? (Math.sqrt(G) * V) / Cg : 0;
  const T = (usg * usg - ucr * ucr) / (ucr * ucr);
  const vr = T > 0 ? (T < 3 ? (0.053 * Math.pow(T, 2.1)) / Math.pow(D, 0.3) : (0.1 * Math.pow(T, 1.5)) / Math.pow(D, 0.3)) * scale : 0;
  const f = (2 * G * R * S) / (V * V);
  const ehq = f > 0 ? ((0.1 * Math.pow(theta, 2.5)) / f) * scale : 0;
  const Fr = V / Math.sqrt(G * h);
  let bedform: Bedform;
  if (T <= 0) bedform = 'plano-quieto';
  else if (D < 10 && T < 3) bedform = 'rizos';
  else if (T < 15) bedform = 'dunas';
  else if (T < 25) bedform = 'transicion';
  else bedform = Fr > 0.8 ? 'antidunas' : 'plano-alto';
  let height = 0, length = 0;
  if (bedform === 'rizos') {
    length = 1000 * d;
    height = length / 7;
  } else if (bedform === 'dunas' || bedform === 'transicion') {
    height = Math.max(0, 0.11 * h * Math.pow(d / h, 0.3) * (1 - Math.exp(-0.5 * T)) * (25 - T));
    length = 7.3 * h;
  } else if (bedform === 'antidunas') {
    // antidunas: largo ≈ 2π·V²/g (Kennedy, 1963), alto pequeño
    length = (2 * Math.PI * V * V) / G;
    height = 0.04 * h;
  }
  const qb = mpm;
  const celerity = height > 0 ? (2 * qb) / (0.6 * height) : 0;
  const inR = (r: readonly [number, number]) => d >= r[0] && d <= r[1];
  return {
    theta, thetaCr, Dstar: D, ustar, mpm, einsteinBrown: eb, vanRijn: vr, engelundHansen: ehq, T, bedform,
    dune: { height, length, celerity },
    valid: { mpm: inR(FORMULA_RANGE.mpm), einsteinBrown: inR(FORMULA_RANGE.einsteinBrown), vanRijn: inR(FORMULA_RANGE.vanRijn), engelundHansen: inR(FORMULA_RANGE.engelundHansen) },
  };
}

void KAPPA;
void NU;

// ------------------------------------------------------------------ aforo: Parshall y molinete

export type ParshallSize = '1in' | '2in' | '3in' | '6in' | '9in' | '1ft' | '2ft' | '3ft';

/**
 * Canaleta Parshall en flujo libre: Q = C·Ha^n (pies³/s y pies; USBR, Water Measurement Manual, tabla 8-6). En el
 * cálculo se convierten a m³/s y metros. Límite de sumergencia (Hb/Ha): 0,5 de 1 a 3 pulgadas, 0,6 de 6 y 9
 * pulgadas, 0,7 de 1 a 8 pies.
 */
export const PARSHALL: Record<ParshallSize, { name: string; W: number; C: number; n: number; St: number; Hmin: number; Hmax: number }> = {
  '1in': { name: '1 pulgada (2,5 cm)', W: 0.0254, C: 0.338, n: 1.55, St: 0.5, Hmin: 0.015, Hmax: 0.21 },
  '2in': { name: '2 pulgadas (5,1 cm)', W: 0.0508, C: 0.676, n: 1.55, St: 0.5, Hmin: 0.015, Hmax: 0.24 },
  '3in': { name: '3 pulgadas (7,6 cm)', W: 0.0762, C: 0.992, n: 1.55, St: 0.5, Hmin: 0.03, Hmax: 0.33 },
  '6in': { name: '6 pulgadas (15,2 cm)', W: 0.1524, C: 2.06, n: 1.58, St: 0.6, Hmin: 0.03, Hmax: 0.45 },
  '9in': { name: '9 pulgadas (22,9 cm)', W: 0.2286, C: 3.07, n: 1.53, St: 0.6, Hmin: 0.03, Hmax: 0.61 },
  '1ft': { name: '1 pie (30,5 cm)', W: 0.3048, C: 3.95, n: 1.55, St: 0.7, Hmin: 0.03, Hmax: 0.76 },
  '2ft': { name: '2 pies (61 cm)', W: 0.6096, C: 8.0, n: 1.55, St: 0.7, Hmin: 0.046, Hmax: 0.76 },
  '3ft': { name: '3 pies (91 cm)', W: 0.9144, C: 12.0, n: 1.57, St: 0.7, Hmin: 0.046, Hmax: 0.76 },
};

const FT = 0.3048;
const CFS = 0.0283168;

/** Caudal de una canaleta Parshall (m³/s) con la carga Ha en metros. */
export function parshallQ(size: ParshallSize, Ha: number): number {
  const p = PARSHALL[size];
  return CFS * p.C * Math.pow(Math.max(0, Ha) / FT, p.n);
}

/** Carga Ha (m) que da un caudal Q (m³/s) en una canaleta Parshall. */
export function parshallH(size: ParshallSize, Q: number): number {
  const p = PARSHALL[size];
  return FT * Math.pow(Math.max(0, Q) / (CFS * p.C), 1 / p.n);
}

export interface Vertical {
  /** Distancia desde la orilla (m), profundidad (m) y velocidad media en la vertical (m/s). */
  x: number;
  d: number;
  v: number;
}

/**
 * Aforo con molinete por el método de la sección media (ISO 748): cada vertical representa la franja que va de la
 * mitad hacia la vertical anterior a la mitad hacia la siguiente; qᵢ = vᵢ·dᵢ·(xᵢ₊₁ − xᵢ₋₁)/2. Las orillas son las
 * verticales primera y última (profundidad cero).
 */
export function midSection(vs: Vertical[]): { Q: number; A: number; parts: { x: number; w: number; q: number }[] } {
  const S = vs.slice().sort((a, b) => a.x - b.x);
  const parts: { x: number; w: number; q: number }[] = [];
  let Q = 0, A = 0;
  for (let i = 0; i < S.length; i++) {
    const xl = i > 0 ? S[i - 1].x : S[i].x;
    const xr = i < S.length - 1 ? S[i + 1].x : S[i].x;
    const w = (xr - xl) / 2;
    const q = S[i].v * S[i].d * w;
    parts.push({ x: S[i].x, w, q });
    Q += q;
    A += S[i].d * w;
  }
  return { Q, A, parts };
}

/** Velocidad media en una vertical: con un punto (0,6·d desde la superficie) o con dos (0,2 y 0,8). */
export function verticalMean(v02: number | null, v06: number | null, v08: number | null): number {
  if (v02 !== null && v08 !== null) return (v02 + v08) / 2;
  return v06 ?? 0;
}

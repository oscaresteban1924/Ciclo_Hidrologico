// Transporte de sedimentos en un cauce ancho de lecho móvil: ¿se mueven los granos del fondo?, ¿ruedan, saltan o
// van suspendidos?, ¿cuánto se lleva el agua? y ¿qué piedra aguanta la corriente (enrocado)?
//
// Fuentes: Shields (1936) con la curva de Soulsby y Whitehouse (1997); arrastre de fondo de Meyer-Peter y Müller
// (1948) en la forma corregida de Wong y Parker (2006); velocidad de caída de Ferguson y Church (2004); número de
// Rouse (1937) y sus rangos de modo de transporte (en García, ASCE Manual 110, 2008); n de Strickler para lecho de
// grava. Cálculo didáctico: no es un diseño de ingeniería.

import { G, manningQ, normalDepth, type Section } from './hydraulics';

export const RHO = 1000;
export const RHO_S = 2650;
export const SG = RHO_S / RHO;
/** Viscosidad cinemática del agua a unos 20 °C (m²/s). */
export const NU = 1.0e-6;
export const KAPPA = 0.4;
/** Ancho del cauce (m). */
export const BED_W = 10;

export const GRAINS: { id: string; name: string; d: number }[] = [
  { id: 'limo', name: 'Limo', d: 0.00004 },
  { id: 'arena-fina', name: 'Arena fina', d: 0.0002 },
  { id: 'arena', name: 'Arena gruesa', d: 0.001 },
  { id: 'gravilla', name: 'Gravilla', d: 0.005 },
  { id: 'grava', name: 'Grava', d: 0.03 },
  { id: 'cantos', name: 'Cantos', d: 0.15 },
  { id: 'bloques', name: 'Bloques', d: 0.5 },
];

/** Diámetro adimensional D* = d·((s − 1)·g / ν²)^(1/3). */
export function dStar(d: number): number {
  return d * Math.cbrt(((SG - 1) * G) / (NU * NU));
}

/** Shields crítico (Soulsby y Whitehouse 1997): θcr = 0,30/(1 + 1,2 D*) + 0,055·(1 − e^(−0,020 D*)). */
export function shieldsCrit(d: number): number {
  const D = dStar(d);
  return 0.3 / (1 + 1.2 * D) + 0.055 * (1 - Math.exp(-0.02 * D));
}

/** Velocidad de caída de un grano natural (Ferguson y Church 2004, C1 = 18, C2 = 1). */
export function fallVelocity(d: number): number {
  const R = SG - 1;
  return (R * G * d * d) / (18 * NU + Math.sqrt(0.75 * 1.0 * R * G * d * d * d));
}

/** Arrastre de fondo adimensional q* = 3,97·(θ − θcr)^1,5 (Meyer-Peter y Müller, corregida por Wong y Parker). */
export function bedloadStar(theta: number, thetaCr: number): number {
  return theta > thetaCr ? 3.97 * Math.pow(theta - thetaCr, 1.5) : 0;
}

/** n de Manning del lecho (Strickler: d^(1/6)/21,1, con d en m; al menos 0,02 por las formas del fondo). */
export function bedN(d: number): number {
  return Math.max(0.02, Math.pow(d, 1 / 6) / 21.1);
}

export type Mode = 'quieto' | 'fondo' | 'mixto' | 'suspension' | 'lavado';

export const MODE_NAME: Record<Mode, string> = {
  quieto: 'no se mueve',
  fondo: 'rueda y salta por el fondo',
  mixto: 'parte por el fondo y parte suspendida',
  suspension: 'va suspendido',
  lavado: 'va suspendido sin asentarse (carga de lavado)',
};

export interface SedimentInput {
  Q: number;
  S: number;
  /** Diámetro del grano (m). */
  d: number;
}

export const DEFAULT_SEDIMENT: SedimentInput = { Q: 20, S: 0.004, d: 0.03 };

export function sanitizeSediment(p: Partial<SedimentInput>): SedimentInput {
  const d = DEFAULT_SEDIMENT;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  return { Q: num(p.Q, 0.5, 200, d.Q), S: num(p.S, 0.0002, 0.05, d.S), d: num(p.d, 0.00002, 1, d.d) };
}

export interface SedimentResult {
  inp: SedimentInput;
  n: number;
  /** Profundidad normal (m), velocidad (m/s) y radio hidráulico. */
  h: number;
  V: number;
  R: number;
  /** Esfuerzo en el fondo (Pa) y velocidad de corte (m/s). */
  tau: number;
  ustar: number;
  Dstar: number;
  theta: number;
  thetaCr: number;
  /** Relación θ / θcr. */
  mobility: number;
  w: number;
  rouse: number;
  mode: Mode;
  /** Arrastre de fondo: adimensional, por metro (m²/s) y del cauce entero (m³/día de grano y t/día). */
  qStar: number;
  qb: number;
  volDay: number;
  tDay: number;
  /** Piedra mínima que aguanta este esfuerzo con factor de seguridad 1,5 (θ de diseño 0,047). */
  dRiprap: number;
}

/** Enrocado: d = FS · τ / ((ρs − ρ)·g·θ), con θ = 0,047 y FS = 1,5 (criterio de Shields para piedra gruesa). */
export const RIPRAP = { theta: 0.047, fs: 1.5 };

export function sedimentModel(inp0: Partial<SedimentInput>): SedimentResult {
  const inp = sanitizeSediment(inp0);
  const sec: Section = { shape: 'rect', b: BED_W, z: 0, D: 0, H: 99 };
  const n = bedN(inp.d);
  const h = normalDepth(sec, n, inp.S, inp.Q);
  const R = (BED_W * h) / (BED_W + 2 * h);
  const V = inp.Q / (BED_W * h);
  const tau = RHO * G * R * inp.S;
  const ustar = Math.sqrt(tau / RHO);
  const theta = tau / ((RHO_S - RHO) * G * inp.d);
  const thetaCr = shieldsCrit(inp.d);
  const w = fallVelocity(inp.d);
  const rouse = w / (KAPPA * ustar);
  let mode: Mode;
  if (theta < thetaCr && rouse > 0.8) mode = 'quieto';
  else if (rouse > 2.5) mode = 'fondo';
  else if (rouse > 1.2) mode = 'mixto';
  else if (rouse > 0.8) mode = 'suspension';
  else mode = 'lavado';
  const qStar = bedloadStar(theta, thetaCr);
  const qb = qStar * Math.sqrt((SG - 1) * G * inp.d * inp.d * inp.d);
  const volDay = qb * BED_W * 86400;
  return {
    inp,
    n,
    h,
    V,
    R,
    tau,
    ustar,
    Dstar: dStar(inp.d),
    theta,
    thetaCr,
    mobility: theta / thetaCr,
    w,
    rouse,
    mode,
    qStar,
    qb,
    volDay,
    tDay: (volDay * RHO_S) / 1000,
    dRiprap: (RIPRAP.fs * tau) / ((RHO_S - RHO) * G * RIPRAP.theta),
  };
}

/** Concentración relativa de Rouse a la altura z sobre el fondo, respecto a la de a = 0,05 h. */
export function rouseProfile(P: number, h: number, z: number): number {
  const a = 0.05 * h;
  if (z <= a) return 1;
  if (z >= h) return 0;
  return Math.pow(((h - z) / z) * (a / (h - a)), P);
}

export { manningQ };

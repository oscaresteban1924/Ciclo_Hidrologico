// Cobertura (alcantarilla de cajón) bajo una vía: enlace 1D entre la celda aguas arriba y la de aguas abajo.
//
// Hidráulica según la guía de diseño de alcantarillas de la FHWA (HDS-5, «Hydraulic Design of Highway
// Culverts», 3.ª ed., 2012), apéndice A, ecuaciones de control de entrada de forma 1 y control de salida:
//   · control de entrada, no sumergida (Ku·Q/(A·D^0,5) ≤ 3,5):  HW/D = Hc/D + K·(Ku·Q/(A·D^0,5))^M + Ks·S
//   · control de entrada, sumergida   (Ku·Q/(A·D^0,5) ≥ 4,0):  HW/D = c·(Ku·Q/(A·D^0,5))² + Y + Ks·S
//     entre 3,5 y 4,0 se interpola linealmente; Hc = dc + Vc²/2g = 1,5·dc en sección rectangular;
//     cajón de concreto con aletas de 30° a 75°: K = 0,026, M = 1,0, c = 0,0347, Y = 0,81, Ks = −0,5;
//     Ku = 1,811 en unidades SI.
//   · control de salida (cañón lleno): HW = h₀ + (1 + Ke + 2g·n²·L/R^(4/3))·V²/2g, con
//     h₀ = max(nivel aguas abajo, (dc + D)/2) sobre la batea de salida; Ke = 0,4 (aletas de 30° a 75°,
//     arista viva en la corona).
// Para un nivel aguas arriba dado, el caudal es el menor de los dos controles. La obstrucción (troncos y
// ramas atrapados en la entrada) reduce el ancho útil de la entrada y del cañón.
//
// Este módulo no usa Three.js ni el DOM: se prueba en Node.

import { G } from './constants';

export const HDS5_BOX = { K: 0.026, M: 1.0, c: 0.0347, Y: 0.81, Ks: -0.5, Ku: 1.811, Ke: 0.4 } as const;

/** Profundidad crítica en sección rectangular para un caudal unitario q [m²/s]. */
export function criticalDepth(q: number): number {
  return Math.cbrt((q * q) / G);
}

/** Carga sobre la batea de entrada [m] con control de entrada para un caudal unitario q (cajón de altura D). */
export function inletHeadwater(q: number, D: number, S: number): number {
  if (q <= 0) return 0;
  const k = HDS5_BOX;
  const di = (k.Ku * q) / Math.pow(D, 1.5); // = Ku·Q/(A·D^0,5) con A = B·D
  const dc = criticalDepth(q);
  const unsub = (1.5 * dc) / D + k.K * Math.pow(di, k.M) + k.Ks * S;
  const sub = k.c * di * di + k.Y + k.Ks * S;
  const w = di <= 3.5 ? 0 : di >= 4 ? 1 : (di - 3.5) / 0.5;
  // con caudales muy pequeños la corrección por pendiente (Ks·S < 0) daría una carga negativa
  return Math.max(0, D * ((1 - w) * unsub + w * sub));
}

export interface CulvertGeom {
  /** Ancho total de los cajones [m], altura [m], longitud [m], pendiente [m/m], número de cajones. */
  B: number;
  D: number;
  L: number;
  S: number;
  barrels: number;
  n: number;
  Ke: number;
}

/** Tabla de control de entrada: caudal unitario frente a carga, para invertir HW(q). */
export interface InletRating {
  hw: Float64Array;
  q: Float64Array;
}

export function inletRating(g: CulvertGeom): InletRating {
  const n = 600;
  // hasta una intensidad de descarga de 12 (carga de varias veces la altura del cajón)
  const qMax = (12 * Math.pow(g.D, 1.5)) / HDS5_BOX.Ku;
  const q = new Float64Array(n + 1), hw = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    // más puntos en caudales bajos (la carga crece como q^(2/3))
    const f = i / n;
    q[i] = qMax * f * f;
    hw[i] = inletHeadwater(q[i], g.D, g.S);
  }
  return { hw, q };
}

/** Caudal unitario con control de entrada para una carga H sobre la batea [m²/s]. */
export function qInlet(r: InletRating, H: number): number {
  if (H <= 0) return 0;
  const { hw, q } = r;
  const n = hw.length - 1;
  if (H >= hw[n]) {
    // más allá de la tabla: orificio, Q ∝ √H
    return q[n] * Math.sqrt(H / hw[n]);
  }
  let lo = 0, hi = n;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (hw[m] <= H) lo = m;
    else hi = m;
  }
  const f = (H - hw[lo]) / Math.max(1e-12, hw[hi] - hw[lo]);
  return q[lo] + f * (q[hi] - q[lo]);
}

/** Radio hidráulico de un cajón lleno [m]. */
export function barrelR(g: CulvertGeom): number {
  const b = g.B / g.barrels;
  return (b * g.D) / (2 * (b + g.D));
}

/**
 * Caudal por la cobertura [m³/s] (positivo de entrada a salida) con niveles de agua aguas arriba (`up`) y
 * aguas abajo (`dn`), bateas de entrada y salida, y fracción obstruida. Devuelve el control que gobierna.
 */
export function culvertFlow(g: CulvertGeom, r: InletRating, up: number, dn: number, zIn: number, zOut: number, obstruction: number): { Q: number; control: 'entrada' | 'salida' | 'sin flujo' } {
  const open = Math.max(0, Math.min(1, 1 - obstruction));
  const Beff = g.B * open;
  if (Beff <= 1e-6) return { Q: 0, control: 'sin flujo' };
  // sentido: del lado con el agua más alta
  let hU = up, hD = dn, zU = zIn, zD = zOut, sign = 1;
  if (dn > up) {
    hU = dn;
    hD = up;
    zU = zOut;
    zD = zIn;
    sign = -1;
  }
  const H = hU - zU;
  if (H <= 0) return { Q: 0, control: 'sin flujo' };
  const Qi = Beff * qInlet(r, H);
  // control de salida con el cañón lleno (iterando dc, que depende del caudal)
  const R = barrelR(g);
  const kf = (2 * G * g.n * g.n * g.L) / Math.pow(R, 4 / 3);
  const A = Beff * g.D;
  let Qo = Qi;
  for (let it = 0; it < 4; it++) {
    const dc = Math.min(g.D, criticalDepth(Qo / Beff));
    const h0 = Math.max(hD - zD, (dc + g.D) / 2);
    const head = hU - (zD + h0);
    Qo = head > 0 ? A * Math.sqrt((2 * G * head) / (1 + g.Ke + kf)) : 0;
  }
  if (Qo < Qi) return { Q: sign * Qo, control: 'salida' };
  return { Q: sign * Qi, control: 'entrada' };
}

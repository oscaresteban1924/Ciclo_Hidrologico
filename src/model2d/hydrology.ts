// Hidrología de la sala 2D: una serie ilustrativa de caudales máximos anuales de la quebrada, el ajuste de Gumbel
// por momentos, el periodo de retorno y el riesgo de que se presente en la vida útil de una obra, y el hidrograma de
// entrada del modelo. La serie es inventada (con la forma típica de una quebrada de montaña), no es de una
// estación del IDEAM.

import { hydroQ, type Hydro } from './solver';

/** Constante de Euler-Mascheroni. */
export const EULER = 0.5772156649;

/** Factor de frecuencia de Gumbel: K_T = −(√6/π)·(0,5772 + ln(ln(T/(T − 1)))). */
export const gumbelK = (T: number) => -(Math.sqrt(6) / Math.PI) * (EULER + Math.log(Math.log(T / (T - 1))));
/** Variable reducida de Gumbel para un periodo de retorno. */
export const reducedY = (T: number) => -Math.log(-Math.log(1 - 1 / T));
/** Periodo de retorno de una variable reducida. */
export const periodOfY = (y: number) => 1 / (1 - Math.exp(-Math.exp(-y)));
/** Probabilidad de que el evento de T años se presente al menos una vez en n años. */
export const risk = (T: number, n: number) => 1 - Math.pow(1 - 1 / T, n);
/** Periodo de retorno para un riesgo aceptado R en n años: T = 1/(1 − (1 − R)^(1/n)). */
export const periodForRisk = (R: number, n: number) => 1 / (1 - Math.pow(1 - R, 1 / n));

export interface GumbelFit {
  n: number;
  mean: number;
  sd: number;
  /** Parámetros de la distribución: posición u y escala α. */
  u: number;
  alpha: number;
}

export function fitGumbel(Q: number[]): GumbelFit {
  const n = Q.length;
  const mean = Q.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(Q.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1));
  const alpha = (Math.sqrt(6) * sd) / Math.PI;
  return { n, mean, sd, u: mean - EULER * alpha, alpha };
}

/** Caudal de T años con el factor de frecuencia: Q_T = media + K_T·desviación. */
export const quantile = (f: GumbelFit, T: number) => f.mean + gumbelK(T) * f.sd;

/** Posiciones de graficación de Weibull: T = (n + 1)/m para el m-ésimo mayor. */
export function plotting(Q: number[]): { Q: number; T: number; m: number }[] {
  const s = [...Q].sort((a, b) => b - a);
  return s.map((q, k) => ({ Q: q, m: k + 1, T: (s.length + 1) / (k + 1) }));
}

/** Serie ilustrativa de 30 años (1995–2024) con media cercana a 33 m³/s y desviación cercana a 16 m³/s. */
export const AMS: { year: number; Q: number }[] = (() => {
  const n = 30, u = 25.8, a = 12.5;
  // cuantiles de Gringorten con un poco de ruido determinista y un orden de años revuelto
  const qs = Array.from({ length: n }, (_, k) => {
    const p = (k + 1 - 0.44) / (n + 0.12);
    const jitter = 1 + 0.04 * Math.sin(k * 12.9898);
    return Math.round((u - a * Math.log(-Math.log(p))) * jitter * 10) / 10;
  });
  const order = Array.from({ length: n }, (_, k) => (k * 17 + 5) % n);
  return order.map((o, k) => ({ year: 1995 + k, Q: qs[o] }));
})();

export const AMS_FIT = fitGumbel(AMS.map((a) => a.Q));
export const PERIODS = [2, 5, 10, 25, 50, 100, 500];

/** Hidrograma de diseño para un periodo de retorno, con el caudal base y el tiempo al pico. */
export const designHydro = (T: number, tp: number, Qb = 4, f: GumbelFit = AMS_FIT): Hydro => ({ Qp: Math.max(Qb + 1, quantile(f, T)), tp, Qb });

/** Volumen del hidrograma por encima del caudal base durante la duración [m³]. */
export function hydroVolume(h: Hydro, durMin: number): number {
  let V = 0;
  const dt = 10;
  for (let t = 0; t < durMin * 60; t += dt) V += (hydroQ(h, t) - h.Qb) * dt;
  return V;
}

export { hydroQ };

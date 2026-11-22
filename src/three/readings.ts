// Fórmulas de las fichas de lectura, separadas de las escenas para probarlas.

const G = 9.81;

/** Número de Froude con la profundidad hidráulica D = A/T. */
export function froude(V: number, D: number): number {
  return V / Math.sqrt(G * Math.max(1e-6, D));
}

/** Energía específica [m]: profundidad más carga de velocidad. */
export function specificEnergy(y: number, V: number): number {
  return y + (V * V) / (2 * G);
}

/** Profundidad hidráulica A/T de una sección trapecial (rectangular con z = 0). */
export function hydraulicDepthTrap(y: number, b: number, z: number): number {
  const A = (b + z * y) * y, T = b + 2 * z * y;
  return T > 0 ? A / T : y;
}

/** Interpolación lineal de una serie ordenada por x (fuera del rango, el extremo). */
export function lerpSeries(xs: ArrayLike<number>, ys: ArrayLike<number>, x: number): number {
  const n = xs.length;
  if (!n) return NaN;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= x) lo = m;
    else hi = m;
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

/**
 * Presión en la llave del primer piso de una casa [m de agua]: la de la esquina que la abastece, menos lo que la casa
 * está más alta que la esquina y la altura de la llave sobre el piso.
 */
export function tapPressure(nodeP: number, zHouse: number, zNode: number, tapH = 1.2): number {
  return nodeP - (zHouse - zNode) - tapH;
}

/** Fracción de valores de una lista ordenada que son menores o iguales que t. */
export function fractionWithin(sorted: ArrayLike<number>, t: number): number {
  const n = sorted.length;
  if (!n) return 0;
  let lo = 0, hi = n;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m] <= t) lo = m + 1;
    else hi = m;
  }
  return lo / n;
}

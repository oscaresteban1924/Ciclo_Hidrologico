// Tiempo de viaje del agua hasta la salida, punto por punto, con el método de velocidades del NRCS (National
// Engineering Handbook, parte 630, cap. 15): en la ladera, flujo concentrado poco profundo con V = k·√S, donde k depende
// de la cobertura; en el cauce, Manning. Cada nodo de la grilla manda su agua al vecino de mayor pendiente hacia abajo
// (8 vecinos); si queda en un hoyo del terreno, sigue hacia el cauce más cercano. Los tiempos sirven para dibujar las
// isócronas y el área que ya aporta; el caudal de la salida sigue saliendo del hidrograma unitario del SCS.

import type { Cover } from './hydrology';

/** Coeficiente k [m/s] de V = k·√S (NEH-630, tabla 15-3, convertido de pies por segundo). */
export const NRCS_K: Record<Cover, number> = {
  bosque: 0.76, // bosque con mucha hojarasca (2,5 pies/s)
  pasto: 2.13, // pasto corto (7)
  cultivo: 2.74, // cultivo en surcos rectos (9)
  barrio: 6.19, // superficie pavimentada (20,3): techos, patios y calles
  pavimento: 6.19,
};

/** Pendiente mínima para que la velocidad no se anule en zonas planas. */
const S_MIN = 0.005;

export interface TravelGrid {
  nx: number;
  nz: number;
  /** Separación de la grilla [m]. */
  dx: number;
  /** Cota de cada nodo [m] (fila por fila, nz × nx). */
  z: ArrayLike<number>;
  /** k de cada nodo [m/s]. */
  k: ArrayLike<number>;
  /** Distancia por el cauce hasta la salida [m] en los nodos de cauce; negativa fuera del cauce. */
  channel: ArrayLike<number>;
  /** Velocidad en el cauce [m/s]. */
  vch: number;
}

/** Velocidad de Manning en un cauce [m/s]. */
export function manningV(n: number, R: number, S: number): number {
  return (Math.pow(R, 2 / 3) * Math.sqrt(Math.max(S_MIN, S))) / n;
}

/** Tiempo de viaje [s] de cada nodo hasta la salida. */
export function travelTimes(g: TravelGrid): Float64Array {
  const { nx, nz, dx } = g;
  const N = nx * nz;
  const down = new Int32Array(N).fill(-1);
  const seg = new Float64Array(N);
  const isCh = (v: number) => g.channel[v] >= 0;
  // nodos de cauce más cercanos (para salir de los hoyos): búsqueda en anchura desde todo el cauce
  const near = new Int32Array(N).fill(-1);
  const q: number[] = [];
  for (let v = 0; v < N; v++)
    if (isCh(v)) {
      near[v] = v;
      q.push(v);
    }
  for (let h = 0; h < q.length; h++) {
    const v = q[h], i = v % nx, j = (v / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const w = jj * nx + ii;
      if (near[w] < 0) {
        near[w] = near[v];
        q.push(w);
      }
    }
  }
  for (let v = 0; v < N; v++) {
    if (isCh(v)) continue;
    const i = v % nx, j = (v / nx) | 0;
    let best = -1, bs = 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const w = jj * nx + ii, L = Math.hypot(di, dj) * dx;
        const s = (g.z[v] - g.z[w]) / L;
        if (s > bs) [bs, best] = [s, w];
      }
    if (best < 0 && near[v] >= 0) {
      // hoyo: un paso hacia el cauce más cercano, con la pendiente mínima
      const c = near[v], ci = c % nx, cj = (c / nx) | 0;
      const si = Math.sign(ci - i), sj = Math.sign(cj - j);
      best = (j + sj) * nx + (i + si);
      bs = S_MIN;
    }
    if (best < 0) continue;
    const L = Math.hypot((best % nx) - i, ((best / nx) | 0) - j) * dx;
    down[v] = best;
    seg[v] = L / (Math.max(0.05, g.k[v]) * Math.sqrt(Math.max(S_MIN, bs)));
  }
  const t = new Float64Array(N).fill(NaN);
  const stack: number[] = [];
  for (let v0 = 0; v0 < N; v0++) {
    if (!Number.isNaN(t[v0])) continue;
    // sigue la ruta hasta un nodo con tiempo conocido (o el cauce) y la recorre de vuelta
    let v = v0;
    stack.length = 0;
    const seen = new Set<number>();
    while (Number.isNaN(t[v]) && !isCh(v) && down[v] >= 0 && !seen.has(v)) {
      seen.add(v);
      stack.push(v);
      v = down[v];
    }
    let base: number;
    if (!Number.isNaN(t[v])) base = t[v];
    else if (isCh(v)) base = t[v] = g.channel[v] / g.vch;
    else {
      // ruta sin salida (ciclo o borde): en línea recta al cauce más cercano a la velocidad mínima
      const c = near[v];
      const d = c >= 0 ? Math.hypot((c % nx) - (v % nx), ((c / nx) | 0) - ((v / nx) | 0)) * dx : 0;
      base = (c >= 0 ? g.channel[c] / g.vch : 0) + d / (Math.max(0.05, g.k[v]) * Math.sqrt(S_MIN));
      if (!seen.has(v)) t[v] = base;
    }
    // de vuelta por la ruta: cada nodo tarda lo de su tramo más lo del nodo de abajo
    for (let k = stack.length - 1; k >= 0; k--) {
      const w = stack[k];
      if (Number.isNaN(t[w])) t[w] = base = base + seg[w];
      else base = t[w];
    }
  }
  for (let v = 0; v < N; v++) if (Number.isNaN(t[v])) t[v] = isCh(v) ? g.channel[v] / g.vch : 0;
  return t;
}

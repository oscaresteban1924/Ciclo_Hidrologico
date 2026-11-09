// Peligro de la inundación según profundidad y velocidad, y exposición de viviendas y vehículos.
//
// Clasificación: curvas combinadas de vulnerabilidad H1–H6 de la guía técnica australiana de riesgo de
// inundación (Australian Disaster Resilience Guideline 7-3, «Flood Hazard», AIDR 2014, a partir de Smith et
// al., 2014). Una celda pertenece a la clase más baja cuyos tres límites cumple: profundidad, velocidad y
// producto profundidad × velocidad. Es una referencia técnica publicada para enseñar el concepto; no es la
// zonificación oficial de amenaza de Medellín (que define el POT con estudios de detalle).
//
// Este módulo no usa Three.js ni el DOM: se prueba en Node.

import type { Compiled } from './compile';

/** Profundidad mínima para considerar mojada una celda en el peligro [m]. */
export const HAZARD_WET_M = 0.01;

export interface HazardClass {
  id: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  code: string;
  /** Límites de la clase: profundidad [m], velocidad [m/s], profundidad × velocidad [m²/s]. */
  dMax: number;
  vMax: number;
  dvMax: number;
  /** Descripción traducida de la guía. */
  text: string;
  /** Lectura corta para niños. */
  short: string;
  color: string;
}

/**
 * Seis clases y «seco». Colores: rampa secuencial amarillo → rojo → vino (de menos a más peligro), con
 * luminosidad OKLab decreciente en pasos parejos (0,94 → 0,31; ΔE ≥ 12,9 entre clases vecinas) para que
 * se lea también en escala de grises; el código H1–H6 acompaña siempre al color.
 */
export const HAZARD: HazardClass[] = [
  { id: 0, code: '—', dMax: 0, vMax: 0, dvMax: 0, text: 'Sin agua.', short: 'seco', color: '#e9ecef' },
  { id: 1, code: 'H1', dMax: 0.3, vMax: 2, dvMax: 0.3, text: 'En general seguro para vehículos, personas y edificaciones.', short: 'en general seguro', color: '#fdeda0' },
  { id: 2, code: 'H2', dMax: 0.5, vMax: 2, dvMax: 0.6, text: 'Inseguro para vehículos pequeños.', short: 'inseguro para carros pequeños', color: '#f6b94c' },
  { id: 3, code: 'H3', dMax: 1.2, vMax: 2, dvMax: 0.6, text: 'Inseguro para vehículos, niños y personas mayores.', short: 'inseguro para niños y mayores', color: '#ec7f35' },
  { id: 4, code: 'H4', dMax: 2, vMax: 2, dvMax: 1, text: 'Inseguro para vehículos y personas.', short: 'inseguro para todas las personas', color: '#cf4a26' },
  { id: 5, code: 'H5', dMax: 4, vMax: 4, dvMax: 4, text: 'Inseguro para vehículos y personas. Toda edificación expuesta a daño estructural; las menos robustas pueden fallar.', short: 'puede dañar la estructura de las casas', color: '#9b2121' },
  { id: 6, code: 'H6', dMax: Infinity, vMax: Infinity, dvMax: Infinity, text: 'Inseguro para vehículos y personas. Cualquier edificación puede fallar.', short: 'cualquier casa puede fallar', color: '#57102d' },
];

export const HAZARD_SOURCE = 'Australian Disaster Resilience Guideline 7-3 «Flood Hazard» (AIDR, 2014), curvas de Smith et al. (2014)';

/** Clase de peligro (0 = seco) para una profundidad d [m] y una velocidad v [m/s]. */
export function hazardClass(d: number, v: number): number {
  if (!(d >= HAZARD_WET_M)) return 0;
  const dv = d * v;
  for (let k = 1; k <= 5; k++) {
    const c = HAZARD[k];
    if (d <= c.dMax && v <= c.vMax && dv <= c.dvMax) return k;
  }
  return 6;
}

/** Clase a partir de la cual cada objeto deja de ser estable (según la descripción de la guía). */
export const UNSTABLE_FROM = { carro: 2, moto: 2 } as const;

/** Profundidad del agua junto a una vivienda desde la que se considera afectada [m]. */
export const AFFECTED_DEPTH_M = 0.1;

export interface BuildingExposure {
  index: number;
  id: string;
  /** Profundidad máxima del agua contra la fachada [m]; velocidad y peligro máximos alrededor. */
  depth: number;
  speed: number;
  hazard: number;
  /** Celdas libres que rodean la vivienda. */
  ring: number[];
}

/** Celdas libres vecinas (4 direcciones) de cada edificio: donde el agua toca sus muros. */
export function buildingRings(nx: number, ny: number, building: Int16Array, solid: Uint8Array, count: number): number[][] {
  const rings: Set<number>[] = Array.from({ length: count }, () => new Set<number>());
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const b = building[k];
      if (b < 0) continue;
      const nb = [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < ny - 1 ? k + nx : -1];
      for (const q of nb) if (q >= 0 && !solid[q] && building[q] < 0) rings[b].add(q);
    }
  }
  return rings.map((s) => [...s].sort((a, b) => a - b));
}

const ringCache = new WeakMap<Compiled, number[][]>();
/** Anillos de celdas alrededor de cada edificio de un escenario compilado (se calculan una vez). */
export function ringsFor(c: Compiled): number[][] {
  let r = ringCache.get(c);
  if (!r) {
    r = buildingRings(c.nx, c.ny, c.building, c.solid, c.buildings.length);
    ringCache.set(c, r);
  }
  return r;
}

/** Exposición de cada edificio a partir de los máximos calculados en las celdas que lo rodean. */
export function buildingExposure(
  rings: number[][],
  ids: string[],
  hmax: ArrayLike<number>,
  vmax: ArrayLike<number>,
  hazMax: ArrayLike<number>,
): BuildingExposure[] {
  return rings.map((ring, index) => {
    let depth = 0, speed = 0, hazard = 0;
    for (const k of ring) {
      if (hmax[k] > depth) depth = hmax[k];
      if (vmax[k] > speed) speed = vmax[k];
      if (hazMax[k] > hazard) hazard = hazMax[k];
    }
    return { index, id: ids[index], depth, speed, hazard, ring };
  });
}

/** Resumen de daños: viviendas a las que llegó el agua y las expuestas a daño estructural (H5 o más). */
export function damageSummary(ex: BuildingExposure[]): { affected: number; severe: number; failure: number; worst: BuildingExposure | null } {
  let affected = 0, severe = 0, failure = 0;
  let worst: BuildingExposure | null = null;
  for (const e of ex) {
    if (e.depth >= AFFECTED_DEPTH_M) affected++;
    if (e.hazard >= 5) severe++;
    if (e.hazard >= 6) failure++;
    if (e.depth >= AFFECTED_DEPTH_M && (!worst || e.hazard > worst.hazard || (e.hazard === worst.hazard && e.depth > worst.depth))) worst = e;
  }
  return { affected, severe, failure, worst };
}

/** Factor de volumen por sedimentos: la mezcla ocupa 1/(1 − Cv) veces el volumen del agua. */
export function bulkingFactor(cv: number): number {
  const c = Math.min(0.35, Math.max(0, cv));
  return 1 / (1 - c);
}

/** Exposición calculada de los edificios de una corrida (máximos hasta el instante actual). */
export function exposureOf(sim: { c: Compiled; hmaxField: ArrayLike<number>; vmaxField: ArrayLike<number>; hazMax: ArrayLike<number> }): BuildingExposure[] {
  return buildingExposure(ringsFor(sim.c), sim.c.buildings.map((b) => b.id), sim.hmaxField, sim.vmaxField, sim.hazMax);
}

/** Área [m²] que alcanzó cada clase de peligro (índice 0–6) como máximo. */
export function hazardAreas(hazMax: ArrayLike<number>, solid: ArrayLike<number>, area: number): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < hazMax.length; k++) if (!solid[k]) out[hazMax[k]] += area;
  return out;
}

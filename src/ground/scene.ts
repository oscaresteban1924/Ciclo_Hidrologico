// Escenas de la sala «Aguas subterráneas» (ilustrativas, no son acuíferos reales del valle de Aburrá): un acuífero
// libre entre una loma y un río, un pozo en un acuífero confinado y una mancha que viaja hacia un pozo de abastecimiento.

import { SOILS, theis, type Soil } from './aquifer';

// ------------------------------------------------------------------ 1. el acuífero libre (Dupuit)

export interface AquiferScene {
  soil: Soil;
  /** Nivel del agua en la loma sobre el del río (m). */
  dh: number;
}

/** Largo del acuífero (m), nivel del río sobre la base impermeable (m) y ancho considerado (m). */
export const AQ = { L: 600, h2: 20, width: 1000 };

export interface AquiferResult {
  s: AquiferScene;
  K: number;
  ne: number;
  h1: number;
  /** Caudal por metro de río (m²/día), por el ancho considerado (m³/día) y gradiente medio. */
  qx: number;
  Q: number;
  i: number;
  /** Nivel freático h(x) (Dupuit) y velocidad media en los poros v(x) (m/día). */
  h: (x: number) => number;
  v: (x: number) => number;
  /** Tiempo de viaje de la loma al río (días), integrado por tramos. */
  travel: number;
}

export function aquifer(s: AquiferScene): AquiferResult {
  const { K, ne } = SOILS[s.soil];
  const h1 = AQ.h2 + s.dh, h2 = AQ.h2, L = AQ.L;
  const qx = (K * (h1 * h1 - h2 * h2)) / (2 * L);
  const h = (x: number) => Math.sqrt(Math.max(0, h1 * h1 - ((h1 * h1 - h2 * h2) * Math.min(L, Math.max(0, x))) / L));
  const v = (x: number) => qx / (ne * h(x));
  let travel = 0;
  const n = 600;
  for (let k = 0; k < n; k++) {
    const x = ((k + 0.5) * L) / n;
    travel += L / n / v(x);
  }
  return { s, K, ne, h1, qx, Q: qx * AQ.width, i: s.dh / L, h, v, travel };
}

/** Permeámetro de laboratorio: columna de 30 cm y 10 cm de diámetro. */
export const PERM = { L: 0.3, D: 0.1 };
export const permArea = () => (Math.PI * PERM.D * PERM.D) / 4;
/** Caudal que sale del permeámetro (mL/s) con la carga dh (m). */
export function permFlow(soil: Soil, dh: number): number {
  const K = SOILS[soil].K / 86400;
  return ((K * permArea() * dh) / PERM.L) * 1e6;
}

// ------------------------------------------------------------------ 2. el pozo (Theis)

export interface WellScene {
  soil: Soil;
  /** Caudal de bombeo (L/s). */
  Qls: number;
  /** Tiempo de bombeo (días). */
  t: number;
}

/** Acuífero confinado de 25 m de espesor con coeficiente de almacenamiento 2e-4; pozos de observación. */
export const WELL = { b: 25, S: 2e-4, rObs: [10, 50, 200], rw: 0.15 };

export const wellT = (soil: Soil) => SOILS[soil].K * WELL.b;

/** Lecturas de una prueba de bombeo en un pozo de observación: Theis con un error de lectura de ±1 cm (semilla fija). */
export function pumpingTest(s: WellScene, r: number, n = 18): { t: number; s: number }[] {
  const T = wellT(s.soil), Q = s.Qls * 86.4;
  let x = 17 + Math.round(r);
  const R = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: n }, (_, k) => {
    const t = Math.pow(10, -3 + (k * (Math.log10(Math.max(0.0011, s.t)) + 3)) / (n - 1));
    return { t, s: Math.round((theis(Q, T, WELL.S, r, t) + (R() - 0.5) * 0.02) * 1000) / 1000 };
  });
}

// ------------------------------------------------------------------ 3. la mancha

export interface PlumeScene {
  /** Caudal del pozo (L/s), posición transversal de la fuga (m), dispersividad longitudinal (m). */
  Qls: number;
  y0: number;
  aL: number;
}

/** Acuífero de arena gruesa con gradiente 0,002, espesor 20 m; la fuga queda 300 m aguas arriba del pozo. */
export const PLUME = { K: 30, i: 0.002, b: 20, ne: 0.28, x0: -300, years: 8 };
export const plumeQ = () => PLUME.K * PLUME.i;
export const plumeV = () => plumeQ() / PLUME.ne;

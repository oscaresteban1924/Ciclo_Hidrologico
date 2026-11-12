// Escenas de la sala «Presas y embalses» (ilustrativas: no son presas reales de Antioquia ni de Colombia): un embalse
// con su vertedero libre que recibe una creciente, el vertedero de cresta con el pozo de disipación y una presa de
// gravedad de concreto.

import { gammaInflow, routePuls, stability, stillingBasin, type GravityDam, type Reservoir, type RoutingResult, type StabilityResult } from './dam';

// ------------------------------------------------------------------ 1. el embalse

export interface ReservoirScene {
  /** Ancho del vertedero (m), pico de la creciente (m³/s) y tiempo al pico (h). */
  L: number;
  Qp: number;
  tp: number;
  /** Descarga de fondo abierta (m³/s). */
  bottom: number;
}

/** Coeficiente de descarga de la cresta (SI) con la carga de diseño; espejo de agua de 150 ha en la cresta. */
export const EMB = { C: 2.18, A0: 1500000, A1: 150000, freeboard: 6, Qb: 10, tEnd: 48, dt: 0.25 };

export function reservoirOf(s: ReservoirScene): Reservoir {
  return { A0: EMB.A0, A1: EMB.A1, L: s.L, C: EMB.C, bottom: s.bottom };
}

export function routeScene(s: ReservoirScene): RoutingResult {
  return routePuls(reservoirOf(s), gammaInflow(EMB.Qb, s.Qp, s.tp), EMB.tEnd, EMB.dt);
}

// ------------------------------------------------------------------ 2. el vertedero

export interface SpillScene {
  /** Carga sobre la cresta (m) y carga de diseño del perfil (m). */
  H: number;
  Hd: number;
  /** Ancho de la cresta (m). */
  L: number;
  /** Profundización del piso del pozo bajo el lecho del río (m). */
  D?: number;
}

/** Altura de la cresta sobre el piso del pozo (m), pendiente de la rápida (H:V) y río aguas abajo (Manning). */
export const SPILL = { P: 30, m: 0.75, C: 2.18, n: 0.035, S: 0.002 };

/** Profundidad del río aguas abajo para un caudal unitario q (cauce ancho, Manning). */
export const tailwater = (q: number) => Math.pow((q * SPILL.n) / Math.sqrt(SPILL.S), 0.6);

/**
 * Coeficiente de la cresta con una carga distinta de la de diseño: ajuste potencial aproximado a la curva de
 * coeficientes del USBR (Design of Small Dams): menor con poca carga, algo mayor por encima de la de diseño.
 */
export const crestC = (ratio: number) => SPILL.C * Math.pow(Math.min(1.6, Math.max(0.2, ratio)), 0.13);

export function spillScene(s: SpillScene) {
  const D = s.D ?? 0;
  const ratio = s.H / s.Hd;
  const C = crestC(ratio);
  const Q = C * s.L * Math.pow(s.H, 1.5);
  const q = Q / s.L;
  const basin = stillingBasin(q, SPILL.P + D, s.H);
  const tw = tailwater(q);
  return { Q, q, C, D, ...basin, tw, ratio, inBasin: tw + D >= basin.y2 };
}

// ------------------------------------------------------------------ 3. la presa de gravedad

export const DEFAULT_DAM: GravityDam = { H: 30, crest: 5, m: 0.75, hw: 27, tail: 0, uplift: 1, mu: 0.7, c: 0 };

export function damScene(d: GravityDam): StabilityResult {
  return stability(d);
}

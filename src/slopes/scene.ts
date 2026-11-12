// Escenas ilustrativas de la sala «Laderas»: la parcela donde llueve, la ladera con su suelo sobre la roca y la
// ladera de cultivo que pierde suelo. Los valores son típicos de la literatura, no de un lugar real.

import { COVERS, TEXTURES, criticalM, criticalRain, greenAmpt, infiniteSlope, practiceP, rusle, wetness, type Cover, type Practice, type SlopeInput, type Texture } from './slope';

// ------------------------------------------------------------------ parte 1: la lluvia entra al suelo

export interface InfScene {
  texture: Texture;
  /** Saturación inicial del suelo (0 seco, 1 saturado). */
  Se: number;
  /** Intensidad de la lluvia [mm/h]. */
  i: number;
  /** Duración [h]. */
  T: number;
}

export const DEFAULT_INF: InfScene = { texture: 'franco', Se: 0.3, i: 30, T: 1 };

export function infScene(s: InfScene) {
  const tx = TEXTURES[s.texture];
  const dTheta = Math.max(0.005, (1 - s.Se) * tx.thetaE);
  const r = greenAmpt({ Ks: tx.Ks, psi: tx.psi, dTheta, i: s.i, T: s.T });
  return { ...r, dTheta, tx };
}

// ------------------------------------------------------------------ parte 2: la ladera y el agua

export type Soil = 'residual' | 'coluvion' | 'arenoso';
/** Suelos de ladera (valores típicos): cohesión c [kPa], fricción φ [°], peso γ [kN/m³] y conductividad K [m/día]. */
export const SLOPE_SOILS: Record<Soil, { name: string; c: number; phi: number; gamma: number; K: number }> = {
  residual: { name: 'Suelo residual limoso', c: 6, phi: 31, gamma: 18.5, K: 0.6 },
  coluvion: { name: 'Depósito de ladera (coluvión)', c: 2, phi: 30, gamma: 19.5, K: 2 },
  arenoso: { name: 'Suelo arenoso', c: 0.5, phi: 35, gamma: 18, K: 6 },
};

export type Veg = 'desnudo' | 'pasto' | 'bosque';
/** Cohesión que aportan las raíces [kPa] (valores típicos; Sidle y Ochiai, 2006). */
export const VEG: Record<Veg, { name: string; cr: number }> = {
  desnudo: { name: 'Sin vegetación', cr: 0 },
  pasto: { name: 'Pasto', cr: 1.5 },
  bosque: { name: 'Bosque', cr: 7 },
};

/** Área aportante por metro de contorno [m]: la ladera recibe el agua de la parte de arriba. */
export const A_OVER_B = 25;
/** Los drenes horizontales bajan el nivel del agua a esta fracción. */
export const DRAIN_FACTOR = 0.4;

export interface SlopeScene {
  beta: number;
  z: number;
  soil: Soil;
  veg: Veg;
  /** Recarga de la lluvia [mm/día] (lluvia sostenida que llega al nivel del agua). */
  q: number;
  drains: boolean;
}

export const DEFAULT_SLOPE: SlopeScene = { beta: 30, z: 2, soil: 'residual', veg: 'pasto', q: 8, drains: false };

export function slopeInput(s: SlopeScene): Omit<SlopeInput, 'm'> {
  const so = SLOPE_SOILS[s.soil];
  return { beta: s.beta, z: s.z, c: so.c, cr: VEG[s.veg].cr, phi: so.phi, gamma: so.gamma };
}

export function slopeScene(s: SlopeScene) {
  const inp = slopeInput(s);
  const T = SLOPE_SOILS[s.soil].K * s.z;
  const m0 = wetness(s.q, A_OVER_B, T, s.beta);
  const m = s.drains ? m0 * DRAIN_FACTOR : m0;
  const r = infiniteSlope({ ...inp, m });
  const qc = criticalRain(inp, A_OVER_B, T);
  const mc = criticalM(inp);
  const dry = infiniteSlope({ ...inp, m: 0 });
  return { ...r, m, m0, T, qc, mc, dry, inp };
}

// ------------------------------------------------------------------ parte 3: la ladera pierde suelo

/** Erosividad de la lluvia de una ladera andina (ilustrativa) [MJ·mm/(ha·h·año)]. */
export const R_FACTOR = 5000;
/** Erodabilidad K de los suelos de la escena [t·ha·h/(ha·MJ·mm)] (típicos). */
export const K_SOILS: Record<'francoArenoso' | 'franco' | 'francoLimoso', { name: string; K: number }> = {
  francoArenoso: { name: 'Franco arenoso', K: 0.018 },
  franco: { name: 'Franco', K: 0.03 },
  francoLimoso: { name: 'Franco limoso', K: 0.042 },
};
/** Pérdida tolerable de suelo usual [t/(ha·año)] (Wischmeier y Smith, 1978). */
export const T_TOL = 11;

export interface ErosionScene {
  slopePct: number;
  lambda: number;
  cover: Cover;
  practice: Practice;
  soil: keyof typeof K_SOILS;
}

export const DEFAULT_EROSION: ErosionScene = { slopePct: 35, lambda: 60, cover: 'cultivo', practice: 'ninguna', soil: 'franco' };

export function erosionScene(s: ErosionScene) {
  const C = COVERS[s.cover].C, P = practiceP(s.practice, s.slopePct), K = K_SOILS[s.soil].K;
  const r = rusle({ R: R_FACTOR, K, lambda: s.lambda, slopePct: s.slopePct, C, P });
  // espesor de suelo que se pierde por año: A [t/ha] / (densidad aparente 1,3 t/m³ · 10 000 m²) → mm
  const mmYear = (r.A / (1.3 * 10000)) * 1000;
  return { ...r, C, P, K, mmYear, ok: r.A <= T_TOL };
}

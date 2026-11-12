// Cálculo de la sala «Laderas»: infiltración de Green-Ampt con encharcamiento (Mein y Larson), estabilidad de un talud
// infinito con agua en el suelo, lluvia crítica del modelo SHALSTAB y pérdida de suelo con la ecuación universal
// revisada (RUSLE). Sin interfaz: lo usan las escenas, las herramientas de diseño y las pruebas.

export const G = 9.81;
export const GAMMA_W = 9.81; // kN/m³

// ------------------------------------------------------------------ suelos (Green-Ampt)

export type Texture = 'arena' | 'arenaFranca' | 'francoArenoso' | 'franco' | 'francoLimoso' | 'francoArcilloso' | 'arcilla';

/**
 * Parámetros de Green-Ampt por textura (Rawls, Brakensiek y Miller, 1983; Chow, Maidment y Mays, 1988, tabla 4.3.1):
 * conductividad hidráulica Ks [mm/h], succión en el frente de humedecimiento ψ [mm] y porosidad efectiva θe.
 */
export const TEXTURES: Record<Texture, { name: string; Ks: number; psi: number; thetaE: number; color: string }> = {
  arena: { name: 'Arena', Ks: 117.8, psi: 49.5, thetaE: 0.417, color: '#d9c38f' },
  arenaFranca: { name: 'Arena franca', Ks: 29.9, psi: 61.3, thetaE: 0.401, color: '#c9ad7a' },
  francoArenoso: { name: 'Franco arenoso', Ks: 10.9, psi: 110.1, thetaE: 0.412, color: '#b8956a' },
  franco: { name: 'Franco', Ks: 3.4, psi: 88.9, thetaE: 0.434, color: '#9c7a55' },
  francoLimoso: { name: 'Franco limoso', Ks: 6.5, psi: 166.8, thetaE: 0.486, color: '#8f7458' },
  francoArcilloso: { name: 'Franco arcilloso', Ks: 1.0, psi: 208.8, thetaE: 0.309, color: '#86603f' },
  arcilla: { name: 'Arcilla', Ks: 0.3, psi: 316.3, thetaE: 0.385, color: '#7a4f35' },
};

export interface GAInput {
  /** Conductividad hidráulica [mm/h]. */
  Ks: number;
  /** Succión en el frente [mm]. */
  psi: number;
  /** Déficit de humedad Δθ = (1 − Se)·θe. */
  dTheta: number;
  /** Intensidad de la lluvia [mm/h] (constante). */
  i: number;
  /** Duración de la lluvia [h]. */
  T: number;
}

export interface GAResult {
  t: number[];
  /** Capacidad de infiltración [mm/h] y lo que de verdad entra [mm/h]. */
  fcap: number[];
  f: number[];
  /** Infiltración acumulada [mm] y escorrentía acumulada [mm]. */
  F: number[];
  R: number[];
  /** Momento en que empieza el encharcamiento [h] (null si no se encharca). */
  tp: number | null;
  /** Profundidad del frente de humedecimiento al final [mm]. */
  front: number;
  P: number;
  Ftot: number;
  Rtot: number;
}

/** Infiltración acumulada F [mm] que cumple F − ψΔθ·ln(1 + F/ψΔθ) = Ks·t (Green-Ampt con encharcamiento desde t = 0). */
export function gaPonded(Ks: number, psiD: number, t: number): number {
  if (t <= 0) return 0;
  let F = Math.max(Ks * t, Math.sqrt(2 * psiD * Ks * t));
  for (let k = 0; k < 60; k++) {
    const g = F - psiD * Math.log(1 + F / psiD) - Ks * t;
    const dg = F / (psiD + F);
    const step = g / dg;
    F = Math.max(1e-12, F - step);
    if (Math.abs(step) < 1e-12 * Math.max(1, F)) break;
  }
  return F;
}

/** Momento del encharcamiento con lluvia constante: tp = Ks·ψΔθ / (i·(i − Ks)), si i > Ks. */
export function pondingTime(Ks: number, psiD: number, i: number): number | null {
  return i > Ks ? (Ks * psiD) / (i * (i - Ks)) : null;
}

/**
 * Lluvia constante sobre un suelo (Green-Ampt con el método de Mein y Larson): antes del encharcamiento entra toda
 * la lluvia; después, F sigue la curva de Green-Ampt corrida en el tiempo para que empiece con Fp = i·tp.
 */
export function greenAmpt(inp: GAInput, n = 240): GAResult {
  const { Ks, psi, dTheta, i, T } = inp;
  const psiD = Math.max(1e-9, psi * dTheta);
  const tp0 = pondingTime(Ks, psiD, i);
  const tp = tp0 !== null && tp0 < T ? tp0 : null;
  const Fp = tp !== null ? i * tp : 0;
  // tiempo equivalente: el que tardaría en entrar Fp con encharcamiento desde el principio
  const tEq = tp !== null ? (Fp - psiD * Math.log(1 + Fp / psiD)) / Ks : 0;
  const out: GAResult = { t: [], fcap: [], f: [], F: [], R: [], tp, front: 0, P: i * T, Ftot: 0, Rtot: 0 };
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * T;
    let F: number;
    if (tp === null || t <= tp) F = i * t;
    else F = gaPonded(Ks, psiD, t - tp + tEq);
    const fcap = F > 0 ? Ks * (1 + psiD / F) : Infinity;
    const f = tp === null || t < tp ? i : Math.min(i, fcap);
    out.t.push(t);
    out.fcap.push(Math.min(fcap, 10 * Math.max(i, Ks)));
    out.f.push(f);
    out.F.push(F);
    out.R.push(i * t - F);
  }
  out.Ftot = out.F[n];
  out.Rtot = out.R[n];
  out.front = out.Ftot / Math.max(1e-9, dTheta);
  return out;
}

// ------------------------------------------------------------------ talud infinito

export interface SlopeInput {
  /** Ángulo de la ladera [°]. */
  beta: number;
  /** Espesor del suelo sobre la roca, medido en vertical [m]. */
  z: number;
  /** Cohesión efectiva del suelo [kPa]. */
  c: number;
  /** Cohesión que aportan las raíces [kPa]. */
  cr: number;
  /** Ángulo de fricción efectivo [°]. */
  phi: number;
  /** Peso unitario del suelo [kN/m³]. */
  gamma: number;
  /** Fracción del espesor saturada (altura del nivel del agua sobre la roca / z), de 0 a 1. */
  m: number;
}

export interface SlopeResult {
  FS: number;
  /** Términos del factor: cohesión (suelo + raíces) y fricción. */
  cohesionTerm: number;
  frictionTerm: number;
  /** Esfuerzos sobre el plano de falla [kPa]: cortante que empuja, normal total, presión del agua y resistencia. */
  tau: number;
  sigma: number;
  u: number;
  strength: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Talud infinito con flujo paralelo a la ladera (Skempton y DeLory, 1957):
 * FS = (c + cr)/(γ·z·sinβ·cosβ) + (1 − m·γw/γ)·tanφ/tanβ.
 */
export function infiniteSlope(s: SlopeInput): SlopeResult {
  const b = rad(s.beta), p = rad(s.phi);
  const m = Math.min(1, Math.max(0, s.m));
  const sigma = s.gamma * s.z * Math.cos(b) ** 2;
  const tau = s.gamma * s.z * Math.sin(b) * Math.cos(b);
  const u = m * GAMMA_W * s.z * Math.cos(b) ** 2;
  const strength = s.c + s.cr + (sigma - u) * Math.tan(p);
  const cohesionTerm = (s.c + s.cr) / Math.max(1e-9, tau);
  const frictionTerm = (1 - (m * GAMMA_W) / s.gamma) * (Math.tan(p) / Math.tan(b));
  return { FS: strength / Math.max(1e-9, tau), cohesionTerm, frictionTerm, tau, sigma, u, strength };
}

/** Fracción saturada con la que el factor de seguridad vale 1 (puede salir negativa o mayor que 1). */
export function criticalM(s: Omit<SlopeInput, 'm'>): number {
  const b = rad(s.beta), p = rad(s.phi);
  const sigma = s.gamma * s.z * Math.cos(b) ** 2;
  const tau = s.gamma * s.z * Math.sin(b) * Math.cos(b);
  // c + (σ − u)·tanφ = τ  →  u = σ − (τ − c)/tanφ
  const u = sigma - (tau - s.c - s.cr) / Math.tan(p);
  return u / (GAMMA_W * s.z * Math.cos(b) ** 2);
}

/**
 * Humedad de SHALSTAB (Montgomery y Dietrich, 1994): con una recarga estable q [mm/día] que llega desde un área
 * aportante a por ancho de contorno b [m], el flujo por el suelo de transmisividad T [m²/día] satura la fracción
 * W = q·(a/b)/(T·sinβ) del espesor (como máximo 1).
 */
export function wetness(qMmDay: number, aOverB: number, T: number, betaDeg: number): number {
  return Math.min(1, ((qMmDay / 1000) * aOverB) / Math.max(1e-9, T * Math.sin(rad(betaDeg))));
}

/** Recarga estable [mm/día] con la que la ladera llega a FS = 1 (null si nunca falla o si falla aun seca). */
export function criticalRain(s: Omit<SlopeInput, 'm'>, aOverB: number, T: number): number | null {
  const mc = criticalM(s);
  if (mc <= 0 || mc > 1) return null;
  return (mc * T * Math.sin(rad(s.beta)) * 1000) / aOverB;
}

// ------------------------------------------------------------------ erosión (RUSLE)

/**
 * Exponente m de la longitud en RUSLE (McCool y otros, 1989), con una relación usual entre erosión en surcos y
 * entre surcos: m = β/(1 + β), β = (sinθ/0,0896)/(3·sinθ^0,8 + 0,56).
 */
export function lsExponent(slopePct: number): number {
  const s = Math.sin(Math.atan(slopePct / 100));
  const b = s / 0.0896 / (3 * Math.pow(s, 0.8) + 0.56);
  return b / (1 + b);
}

/** Factor de pendiente S de RUSLE (McCool y otros, 1987): 10,8·sinθ + 0,03 bajo 9 %; 16,8·sinθ − 0,50 desde 9 %. */
export function sFactor(slopePct: number): number {
  const s = Math.sin(Math.atan(slopePct / 100));
  return slopePct < 9 ? 10.8 * s + 0.03 : 16.8 * s - 0.5;
}

/** Factor topográfico LS = (λ/22,13)^m · S. Vale ≈ 1 en la parcela unitaria (22,13 m y 9 %). */
export function lsFactor(lambda: number, slopePct: number): number {
  return Math.pow(lambda / 22.13, lsExponent(slopePct)) * sFactor(slopePct);
}

export type Cover = 'desnudo' | 'cultivo' | 'cafe' | 'pasto' | 'rastrojo' | 'bosque';
/** Factor de cobertura C (valores típicos de la literatura; Wischmeier y Smith, 1978; Renard y otros, 1997). */
export const COVERS: Record<Cover, { name: string; C: number }> = {
  desnudo: { name: 'Suelo desnudo', C: 1 },
  cultivo: { name: 'Cultivo limpio (maíz, fríjol)', C: 0.4 },
  cafe: { name: 'Café con sombrío', C: 0.12 },
  pasto: { name: 'Pasto denso', C: 0.03 },
  rastrojo: { name: 'Rastrojo', C: 0.01 },
  bosque: { name: 'Bosque', C: 0.002 },
};

export type Practice = 'ninguna' | 'curvas' | 'barreras' | 'terrazas';
/** Factor de prácticas P (típicos; dependen de la pendiente). */
export function practiceP(p: Practice, slopePct: number): number {
  if (p === 'ninguna') return 1;
  if (p === 'curvas') return slopePct <= 12 ? 0.6 : slopePct <= 20 ? 0.8 : 0.9;
  if (p === 'barreras') return slopePct <= 12 ? 0.3 : slopePct <= 20 ? 0.4 : 0.5;
  return slopePct <= 12 ? 0.12 : slopePct <= 20 ? 0.16 : 0.2;
}
export const PRACTICES: Record<Practice, string> = { ninguna: 'Ninguna', curvas: 'Siembra en curvas de nivel', barreras: 'Barreras vivas', terrazas: 'Terrazas' };

export interface RusleInput {
  /** Erosividad de la lluvia R [MJ·mm/(ha·h·año)]. */
  R: number;
  /** Erodabilidad del suelo K [t·ha·h/(ha·MJ·mm)]. */
  K: number;
  lambda: number;
  slopePct: number;
  C: number;
  P: number;
}

/** Pérdida de suelo A = R·K·LS·C·P [t/(ha·año)]. */
export function rusle(r: RusleInput): { A: number; LS: number } {
  const LS = lsFactor(r.lambda, r.slopePct);
  return { A: r.R * r.K * LS * r.C * r.P, LS };
}

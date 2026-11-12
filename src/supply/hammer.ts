// Golpe de ariete: celeridad de la onda (Korteweg), sobrepresión de Joukowsky, cierre lento (Michaud) y el cálculo en
// el tiempo por el método de las características (Wylie y Streeter, 1993; Chaudhry, 2014) en una tubería horizontal
// entre un tanque de nivel fijo y una válvula que se cierra. Funciones puras, sin interfaz.

import { G, PIPE_MATS, area, type PipeMat } from './pipes';

/** Módulo de compresibilidad del agua (Pa) y densidad (kg/m³) a unos 20 °C. */
export const K_WATER = 2.19e9;
export const RHO = 998;

/** Celeridad de la onda de presión (m/s) en un tubo de pared delgada anclado con juntas de expansión (c1 = 1). */
export function waveSpeed(D: number, e: number, mat: PipeMat): number {
  const E = PIPE_MATS[mat].E;
  return Math.sqrt(K_WATER / RHO / (1 + (K_WATER * D) / (E * e)));
}

/** Sobrepresión de Joukowsky (m) para un cambio de velocidad ΔV (m/s). */
export const joukowsky = (a: number, dV: number) => (a * dV) / G;

/** Sobrepresión aproximada de Michaud para un cierre lento en tc s (m): ΔH = 2·L·V/(g·tc). */
export const michaud = (L: number, V: number, tc: number) => (2 * L * V) / (G * tc);

export interface HammerInput {
  L: number;
  D: number;
  /** Espesor de la pared (m). */
  e: number;
  mat: PipeMat;
  /** Nivel del tanque sobre el eje del tubo (m) y velocidad inicial (m/s). */
  H0: number;
  V0: number;
  /** Factor de fricción de Darcy (0 = sin fricción). */
  f: number;
  /** Tiempo de cierre de la válvula (s); 0 = instantáneo. El área de paso baja linealmente con el tiempo. */
  tc: number;
  /** Tiempo simulado (s). */
  tEnd: number;
  /** Tramos de cálculo. */
  N?: number;
}

export interface HammerResult {
  inp: HammerInput;
  a: number;
  /** Periodo de la tubería 4L/a y tiempo de ida y vuelta 2L/a (s). */
  period: number;
  tr: number;
  dt: number;
  /** Cota piezométrica inicial en la válvula (m). */
  Hv0: number;
  /** Series en la válvula y en la mitad: tiempo (s), cota (m) y caudal en la válvula (m³/s). */
  t: number[];
  Hv: number[];
  Hm: number[];
  Qv: number[];
  /** Cotas en todos los puntos, cada `stride` pasos (para animar). */
  frames: { t: number; H: number[]; Q: number[] }[];
  /** Envolventes de cota máxima y mínima a lo largo del tubo. */
  Hmax: number[];
  Hmin: number[];
  /** Mayor y menor cota en la válvula, y si la presión baja a la de vapor (separación de columna: el modelo deja de valer). */
  maxV: number;
  minV: number;
  vapor: boolean;
}

/** Presión de vapor del agua relativa a la atmosférica, en metros (≈ −10,1 m a 20 °C y nivel del mar). */
export const VAPOR_REL = -10.1;

export function hammer(inp: HammerInput): HammerResult {
  const N = Math.max(4, Math.round(inp.N ?? 40));
  const a = waveSpeed(inp.D, inp.e, inp.mat);
  const A = area(inp.D);
  const dx = inp.L / N, dt = dx / a;
  const B = a / (G * A);
  const R = (inp.f * dx) / (2 * G * inp.D * A * A);
  const Q0 = inp.V0 * A;
  const hf = (inp.f * inp.L * inp.V0 * inp.V0) / (inp.D * 2 * G);
  const Hv0 = inp.H0 - hf;
  let H = Array.from({ length: N + 1 }, (_, i) => inp.H0 - (hf * i) / N);
  let Q = new Array<number>(N + 1).fill(Q0);
  const Hmax = H.slice(), Hmin = H.slice();
  const t: number[] = [0], Hv: number[] = [Hv0], Hm: number[] = [H[N >> 1]], Qv: number[] = [Q0];
  const steps = Math.ceil(inp.tEnd / dt);
  const stride = Math.max(1, Math.round(steps / 900));
  const frames: HammerResult['frames'] = [{ t: 0, H: H.slice(), Q: Q.slice() }];
  let vapor = false;
  const tau = (time: number) => (inp.tc <= 0 ? 0 : Math.max(0, 1 - time / inp.tc));
  for (let k = 1; k <= steps; k++) {
    const time = k * dt;
    const HP = new Array<number>(N + 1), QP = new Array<number>(N + 1);
    for (let i = 1; i < N; i++) {
      const Cp = H[i - 1] + B * Q[i - 1] - R * Q[i - 1] * Math.abs(Q[i - 1]);
      const Cm = H[i + 1] - B * Q[i + 1] + R * Q[i + 1] * Math.abs(Q[i + 1]);
      HP[i] = (Cp + Cm) / 2;
      QP[i] = (Cp - Cm) / (2 * B);
    }
    // tanque: cota fija
    const Cm0 = H[1] - B * Q[1] + R * Q[1] * Math.abs(Q[1]);
    HP[0] = inp.H0;
    QP[0] = (inp.H0 - Cm0) / B;
    // válvula: Q = τ·Q0·√(H/Hv0) combinada con la característica positiva
    const CpN = H[N - 1] + B * Q[N - 1] - R * Q[N - 1] * Math.abs(Q[N - 1]);
    const tv = tau(time);
    if (tv <= 0 || Hv0 <= 0) {
      QP[N] = 0;
      HP[N] = CpN;
    } else {
      const Cv = (tv * Q0) ** 2 / Hv0;
      QP[N] = 0.5 * (-B * Cv + Math.sqrt((B * Cv) ** 2 + 4 * Cv * Math.max(0, CpN)));
      HP[N] = CpN - B * QP[N];
    }
    H = HP;
    Q = QP;
    for (let i = 0; i <= N; i++) {
      if (H[i] > Hmax[i]) Hmax[i] = H[i];
      if (H[i] < Hmin[i]) Hmin[i] = H[i];
      if (H[i] < VAPOR_REL) vapor = true;
    }
    t.push(time);
    Hv.push(H[N]);
    Hm.push(H[N >> 1]);
    Qv.push(Q[N]);
    if (k % stride === 0) frames.push({ t: time, H: H.slice(), Q: Q.slice() });
  }
  return { inp, a, period: (4 * inp.L) / a, tr: (2 * inp.L) / a, dt, Hv0, t, Hv, Hm, Qv, frames, Hmax, Hmin, maxV: Math.max(...Hv), minV: Math.min(...Hv), vapor };
}

/** Clases de presión de tubos de PVC por relación diámetro/espesor (presión de trabajo a 23 °C, m de columna de agua). */
export const PVC_RDE: { rde: number; psi: number; m: number }[] = [
  { rde: 41, psi: 100, m: 70.3 },
  { rde: 32.5, psi: 125, m: 87.9 },
  { rde: 26, psi: 160, m: 112.5 },
  { rde: 21, psi: 200, m: 140.6 },
];

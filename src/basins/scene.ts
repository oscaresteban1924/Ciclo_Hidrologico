// Cuenca de la escena de la sala «Cuencas» y los cálculos de sus experimentos: la mezcla de coberturas según la parte
// urbanizada, el largo del cauce según el área, el almacenamiento de aguas lluvias con salida limitada y la simulación
// de muchas vidas útiles para comprobar la fórmula del riesgo. Todo es ilustrativo (no es una cuenca real).

import { basinModel, gumbelQ, type BasinResult, type Cover, type Soil } from './hydrology';

/**
 * Largo del cauce principal (m) según el área (ha): L ≈ 1,8·√A, una relación de forma de cuenca alargada
 * (del orden de la ley de Hack, L ∝ A^0,5 a 0,6). Con 60 ha da unos 1 400 m.
 */
export function lengthFor(Aha: number): number {
  return 1.8 * Math.sqrt(Aha * 1e4);
}

/** Coberturas con una fracción u urbanizada (80 % barrio, 20 % vías) y el resto 60 % bosque y 40 % pasto. */
export function mixFor(u: number): Record<Cover, number> {
  const k = Math.min(1, Math.max(0, u));
  return { pavimento: 0.2 * k, barrio: 0.8 * k, cultivo: 0, pasto: 0.4 * (1 - k), bosque: 0.6 * (1 - k) };
}

export interface SceneBasin {
  A: number;
  S: number;
  u: number;
  soil: Soil;
  T: number;
  dur: number;
}

export const DEFAULT_SCENE: SceneBasin = { A: 60, S: 0.12, u: 0.25, soil: 'C', T: 10, dur: 60 };

export function sceneModel(b: SceneBasin): BasinResult {
  return basinModel({ A: b.A, L: lengthFor(b.A), S: b.S, mix: mixFor(b.u), soil: b.soil, T: b.T, dur: b.dur });
}

/** Volumen (m³) de un hidrograma con ordenadas cada dt minutos. */
export function volumeOf(q: number[], dtMin: number): number {
  return q.reduce((a, x) => a + x * dtMin * 60, 0);
}

/** Volumen que supera un caudal límite: lo que habría que guardar para no pasar de él (m³). */
export function volumeAbove(q: number[], dtMin: number, Qlim: number): number {
  return q.reduce((a, x) => a + Math.max(0, x - Qlim) * dtMin * 60, 0);
}

export interface Detention {
  /** Caudal que sale (m³/s cada dt, puede durar más que la entrada mientras el tanque se vacía). */
  out: number[];
  /** Fracción llena al final de cada intervalo. */
  fill: number[];
  peakOut: number;
  /** Máximo volumen guardado y volumen que rebosó sin pasar por la salida limitada (m³). */
  maxStored: number;
  overflow: number;
}

/**
 * Almacenamiento con salida limitada a Qlim (como un regulador de caudal): mientras haya espacio, sale como mucho
 * Qlim y el resto se guarda; cuando el tanque se llena, lo que sobra rebosa; después se vacía a Qlim. Conserva la masa:
 * todo lo que entra sale (por la salida o rebosando). No es un tránsito con la curva de descarga de un orificio.
 */
export function detention(inflow: number[], dtMin: number, Qlim: number, V: number): Detention {
  const dt = dtMin * 60;
  const out: number[] = [], fill: number[] = [];
  let S = 0, maxStored = 0, overflow = 0;
  const step = (I: number) => {
    let O = Math.min(Qlim, I + S / dt);
    S += (I - O) * dt;
    if (S > V) {
      overflow += S - V;
      O += (S - V) / dt;
      S = V;
    }
    S = Math.max(0, S);
    maxStored = Math.max(maxStored, S);
    out.push(O);
    fill.push(V > 0 ? S / V : 0);
  };
  for (const I of inflow) step(I);
  for (let k = 0; S > 1e-6 && k < 4 * inflow.length + 200; k++) step(0);
  return { out, fill, peakOut: Math.max(0, ...out), maxStored, overflow };
}

/** Generador de números con semilla (Park y Miller): la misma serie para la misma semilla. */
export function lcg(seed: number): () => number {
  let x = Math.floor(Math.abs(seed)) % 2147483647 || 1;
  return () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
}

/** Máximo anual de Gumbel (por momentos) a partir de un número uniforme. */
function gumbelDraw(mu: number, sg: number, U: number): number {
  const a = (Math.sqrt(6) * sg) / Math.PI, u = mu - 0.5772 * a;
  return u - a * Math.log(-Math.log(Math.min(1 - 1e-12, Math.max(1e-12, U))));
}

/**
 * Simula `lives` vidas útiles de n años con máximos anuales de Gumbel y cuenta en cuántas se supera, al menos una vez,
 * el caudal de T años. La fracción debe acercarse a R = 1 − (1 − 1/T)^n.
 */
export function simulateLives(mu: number, sg: number, T: number, n: number, lives: number, seed: number): { hit: number; lives: number } {
  const R = lcg(seed), QT = gumbelQ(mu, sg, T);
  let hit = 0;
  for (let l = 0; l < lives; l++) {
    for (let y = 0; y < n; y++)
      if (gumbelDraw(mu, sg, R()) > QT) {
        hit++;
        // se descartan los años que quedan de esta vida, pero se consumen sus números para no sesgar la serie
        for (let z = y + 1; z < n; z++) R();
        break;
      }
  }
  return { hit, lives };
}

/** En `years` años simulados, cuántas veces se supera el caudal de T años y cada cuánto en promedio. */
export function exceedances(mu: number, sg: number, T: number, years: number, seed: number): { count: number; every: number } {
  const R = lcg(seed), QT = gumbelQ(mu, sg, T);
  let count = 0;
  for (let y = 0; y < years; y++) if (gumbelDraw(mu, sg, R()) > QT) count++;
  return { count, every: count ? years / count : Infinity };
}

/**
 * Pasa un hidrograma con ordenadas cada dt0 minutos (en el centro de cada intervalo) a otro paso dt1, interpolando en
 * línea recta y empezando y terminando en cero. Sirve para dibujar en el mismo eje dos hidrogramas de pasos distintos.
 */
export function resample(q: number[], dt0: number, dt1: number): number[] {
  const xs = [0, ...q.map((_, k) => (k + 0.5) * dt0), q.length * dt0];
  const ys = [0, ...q, 0];
  const n = Math.ceil((q.length * dt0) / dt1);
  const out: number[] = [];
  let i = 0;
  for (let j = 0; j < n; j++) {
    const t = (j + 0.5) * dt1;
    while (i < xs.length - 2 && xs[i + 1] < t) i++;
    const f = Math.min(1, Math.max(0, (t - xs[i]) / (xs[i + 1] - xs[i])));
    out.push(ys[i] + f * (ys[i + 1] - ys[i]));
  }
  return out;
}

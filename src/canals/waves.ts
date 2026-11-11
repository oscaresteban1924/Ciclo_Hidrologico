// «Ondas y crecientes»: un canal de concreto de 300 m donde el agua se mueve en el tiempo, calculada con las
// ecuaciones de Saint-Venant (unsteady.ts). Tres situaciones:
// - Rotura de presa: un embalse de profundidad h0 detrás de una compuerta en x = 100 m; al romperla, el frente
//   avanza sobre el canal seco (Ritter) o con agua (Stoker).
// - Compuerta: un caudal constante pasa bajo una compuerta en x = 200 m; al cerrarla de golpe, una onda positiva
//   sube por el canal (Favre) y aguas abajo el agua se va.
// - Creciente: el caudal de entrada sube a un pico y vuelve (hidrograma gamma); la onda viaja y se aplana.
// Dos estaciones (A en x = 60 m y B en x = 240 m) registran la profundidad y el caudal.

import { G, SaintVenant, favreSurge, stoker } from './unsteady';
import { gammaHydrograph } from './common';

export type WaveScenario = 'presa' | 'compuerta' | 'creciente';

export interface WaveInput {
  scenario: WaveScenario;
  /** Presa: profundidad del embalse y del agua aguas abajo (m). */
  h0: number;
  h1: number;
  /** Compuerta y creciente: caudal de base (m³/s), abertura de la compuerta (m) y pico de la creciente (m³/s). */
  Q: number;
  gate: number;
  peak: number;
  /** Tiempo al pico de la creciente (s) y pendiente del canal (m/m). */
  tp: number;
  S: number;
}

export const WAVE = { L: 300, N: 300, b: 4, n: 0.015, xDam: 100, xGate: 200, gauges: [60, 240] as [number, number], wall: 3.2 };

export const DEFAULT_WAVE: WaveInput = { scenario: 'presa', h0: 2, h1: 0, Q: 4, gate: 0.6, peak: 24, tp: 30, S: 0.001 };

export function sanitizeWave(p: Partial<WaveInput>): WaveInput {
  const d = DEFAULT_WAVE;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  return {
    scenario: p.scenario === 'compuerta' || p.scenario === 'creciente' ? p.scenario : p.scenario === 'presa' ? 'presa' : d.scenario,
    h0: num(p.h0, 0.3, 3, d.h0),
    h1: num(p.h1, 0, 1, d.h1),
    Q: num(p.Q, 0.5, 15, d.Q),
    gate: num(p.gate, 0, 2.5, d.gate),
    peak: num(p.peak, 2, 40, d.peak),
    tp: num(p.tp, 10, 120, d.tp),
    S: num(p.S, 0, 0.01, d.S),
  };
}

export interface WaveSample {
  t: number;
  hA: number;
  QA: number;
  hB: number;
  QB: number;
  Qin: number;
}

export class WaveSim {
  inp: WaveInput;
  sv: SaintVenant;
  /** Tiempo desde el último evento (rotura, cierre, inicio de la creciente), o null si no ha pasado nada. */
  t0: number | null = null;
  broken = false;
  floodOn = false;
  history: WaveSample[] = [];
  /** Posiciones del frente (t, x) desde el evento, para medir su velocidad. */
  fronts: [number, number][] = [];
  /** Nivel antes del cierre en la estación A, para medir la onda. */
  before = { hA: 0, VA: 0 };
  version = 0;
  /** Huella: cota máxima del agua en cada celda desde el último evento (m). */
  zmax: Float64Array = new Float64Array(WAVE.N);
  private lastRec = -1;
  private ratingCache: { S: number; pts: RatingPoint[] } | null = null;

  constructor(inp: Partial<WaveInput> = {}) {
    this.inp = sanitizeWave(inp);
    this.sv = this.build();
    this.reset();
  }

  private build(): SaintVenant {
    const { scenario, S } = this.inp;
    const inflow = scenario !== 'presa';
    const sv = new SaintVenant({
      L: WAVE.L,
      N: WAVE.N,
      b: WAVE.b,
      n: WAVE.n,
      zb: (x) => -S * x,
      up: inflow ? { kind: 'Q', Q: (t) => this.qIn(t) } : { kind: 'wall' },
      down: { kind: 'fall' },
    });
    // segundo orden: frentes más nítidos con las mismas celdas (prueba H30)
    sv.order = 2;
    return sv;
  }

  /** Vuelve a empezar la huella del nivel máximo con el agua de ahora. */
  private resetEnvelope(): void {
    const sv = this.sv;
    for (let i = 0; i < sv.cfg.N; i++) this.zmax[i] = sv.zb[i] + sv.h[i];
  }

  /** Caudal que entra al canal (m³/s). */
  qIn(t: number): number {
    const { scenario, Q, peak, tp } = this.inp;
    if (scenario === 'presa') return 0;
    if (scenario === 'creciente' && this.floodOn && this.t0 !== null) return Q + (peak - Q) * gammaHydrograph(t - this.t0, tp);
    return Q;
  }

  /** Cambia los datos: si cambia la situación o la pendiente, vuelve a empezar; si no, aplica lo que se pueda. */
  set(p: Partial<WaveInput>): void {
    const next = sanitizeWave({ ...this.inp, ...p });
    const rebuild = next.scenario !== this.inp.scenario || next.S !== this.inp.S;
    const restart = rebuild || (next.scenario === 'presa' && (next.h0 !== this.inp.h0 || next.h1 !== this.inp.h1));
    this.inp = next;
    if (rebuild) this.sv = this.build();
    if (restart) this.reset();
    else if (next.scenario === 'compuerta' && this.sv.gate) this.sv.gate.a = next.gate;
    this.version++;
  }

  /** Estado inicial: la presa cerrada, o el caudal de base ya establecido (se calcula sin dibujar). */
  reset(): void {
    const { scenario, h0, h1, Q, gate } = this.inp;
    const sv = this.sv;
    this.t0 = null;
    this.broken = false;
    this.floodOn = false;
    this.history = [];
    this.fronts = [];
    this.lastRec = -1;
    if (scenario === 'presa') {
      sv.gate = { k: Math.round(WAVE.xDam / sv.dx), a: 0 };
      sv.init((x, zb) => ({ h: x < WAVE.xDam ? Math.max(0, h0 - zb) : h1 > 0 ? h1 : 0 }));
    } else {
      sv.gate = scenario === 'compuerta' ? { k: Math.round(WAVE.xGate / sv.dx), a: gate } : null;
      sv.init(() => ({ h: 0.6, q: Q / WAVE.b }));
      sv.advance(900, 60000);
      sv.t = 0;
      sv.vIn = sv.vOut = 0;
    }
    this.resetEnvelope();
    this.version++;
  }

  /** Rompe la presa (desde el embalse lleno). */
  breakDam(): void {
    if (this.inp.scenario !== 'presa') return;
    this.reset();
    this.sv.gate = null;
    this.broken = true;
    this.t0 = this.sv.t;
    this.resetEnvelope();
    this.version++;
  }

  /** Cierra de golpe la compuerta (o la vuelve a abrir con la abertura del control). */
  slam(close: boolean): void {
    if (this.inp.scenario !== 'compuerta' || !this.sv.gate) return;
    if (close) {
      const xA = WAVE.gauges[0];
      const h = this.sv.depthAt(xA);
      this.before = { hA: h, VA: this.sv.flowAt(xA) / (WAVE.b * Math.max(h, 1e-3)) };
      this.t0 = this.sv.t;
      this.fronts = [];
    }
    this.resetEnvelope();
    this.sv.gate.a = close ? 0 : this.inp.gate;
    this.version++;
  }

  startFlood(): void {
    if (this.inp.scenario !== 'creciente') return;
    this.floodOn = true;
    this.t0 = this.sv.t;
    this.history = [];
    this.lastRec = -1;
    this.resetEnvelope();
    this.version++;
  }

  /** Avanza `dt` segundos de simulación. */
  tick(dt: number): void {
    if (dt <= 0) return;
    this.sv.advance(Math.min(dt, 0.5), 400);
    const sv = this.sv;
    for (let i = 0; i < sv.cfg.N; i++) {
      const z = sv.zb[i] + sv.h[i];
      if (z > this.zmax[i]) this.zmax[i] = z;
    }
    const t = this.sv.t;
    if (t - this.lastRec >= 0.2) {
      this.lastRec = t;
      const [a, b] = WAVE.gauges;
      this.history.push({ t, hA: this.sv.depthAt(a), QA: this.sv.flowAt(a), hB: this.sv.depthAt(b), QB: this.sv.flowAt(b), Qin: this.qIn(t) });
      if (this.history.length > 900) this.history.shift();
      const xf = this.frontX();
      if (xf !== null && this.t0 !== null) {
        this.fronts.push([t - this.t0, xf]);
        if (this.fronts.length > 400) this.fronts.shift();
      }
    }
  }

  /** Posición del frente de la onda (m) según la situación, o null. */
  frontX(): number | null {
    const sv = this.sv, { scenario, h1 } = this.inp;
    if (scenario === 'presa' && this.broken) {
      const thr = h1 > 0 ? h1 + 0.5 * Math.max(0.01, stoker(Math.max(this.inp.h0, h1 * 1.01), h1).h2 - h1) : 0.01;
      let xf: number | null = null;
      for (let i = 0; i < sv.cfg.N; i++) if (sv.x[i] > WAVE.xDam && sv.h[i] > thr) xf = sv.x[i];
      return xf;
    }
    if (scenario === 'compuerta' && this.t0 !== null && this.sv.gate && this.sv.gate.a === 0) {
      const y1 = this.before.hA, th = favreSurge(Math.max(0.05, y1), Math.max(0.01, this.before.VA), 0);
      const mid = (y1 + th.y2) / 2;
      const k = this.sv.gate.k;
      let xf: number | null = null;
      for (let i = k - 1; i >= 0; i--) {
        if (sv.h[i] > mid) xf = sv.x[i];
        else break;
      }
      return xf;
    }
    return null;
  }

  /** Velocidad del frente medida en los últimos 2 s (m/s), o null. */
  frontSpeed(): number | null {
    const f = this.fronts;
    if (f.length < 6) return null;
    const last = f[f.length - 1][0];
    const pts = f.filter((p) => p[0] >= last - 2);
    if (pts.length < 4) return null;
    const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    let sxx = 0, sxy = 0;
    for (const [x, y] of pts) {
      sxx += (x - mx) ** 2;
      sxy += (x - mx) * (y - my);
    }
    return sxx > 0 ? sxy / sxx : null;
  }

  /** Lo que dice la teoría para la situación (velocidad del frente y alturas). */
  theory(): { front: number | null; h2: number | null; label: string } {
    const { scenario, h0, h1 } = this.inp;
    if (scenario === 'presa') {
      if (h1 <= 0) return { front: 2 * Math.sqrt(G * h0), h2: (4 / 9) * h0, label: 'Ritter: frente a 2·√(g·h0); en la presa queda 4/9·h0' };
      const st = stoker(h0, Math.min(h1, h0 * 0.99));
      return { front: st.S, h2: st.h2, label: 'Stoker: resalto móvil y meseta de altura h2' };
    }
    if (scenario === 'compuerta') {
      const y1 = this.before.hA || this.sv.depthAt(WAVE.gauges[0]);
      const V1 = this.before.VA || this.sv.flowAt(WAVE.gauges[0]) / (WAVE.b * Math.max(y1, 1e-3));
      const th = favreSurge(Math.max(0.05, y1), Math.max(0.01, V1), 0);
      return { front: -th.Vw, h2: th.y2, label: 'Favre: onda que sube a −Vw con altura y2' };
    }
    return { front: null, h2: null, label: 'Onda de creciente: celeridad cinemática ≈ 5/3·V' };
  }

  /** Curva de gasto permanente en A para la pendiente de ahora (se calcula una vez por pendiente). */
  rating(): RatingPoint[] {
    const S = this.inp.S;
    if (!this.ratingCache || this.ratingCache.S !== S) this.ratingCache = { S, pts: ratingA(S, 44) };
    return this.ratingCache.pts;
  }

  /** Pico del caudal en cada estación y en la entrada desde que empezó la creciente: (t, Q). */
  peaks(): { inn: [number, number]; A: [number, number]; B: [number, number] } | null {
    if (!this.floodOn || !this.history.length) return null;
    const best = (k: 'Qin' | 'QA' | 'QB'): [number, number] => this.history.reduce<[number, number]>((m, s) => (s[k] > m[1] ? [s.t, s[k]] : m), [0, -Infinity]);
    return { inn: best('Qin'), A: best('QA'), B: best('QB') };
  }
}

// ------------------------------------------------------------------ curva de gasto en A: permanente y en lazo
//
// En flujo permanente, cada profundidad en A corresponde a un solo caudal (la curva de gasto). En una creciente no:
// con la misma profundidad pasa más agua mientras el nivel sube que cuando baja, porque la pendiente de la
// superficie es mayor al frente de la onda (Henderson, 1966, cap. 9). La curva medida hace un lazo. La fórmula de
// Jones corrige ese efecto en crecientes lentas; las de la escena son tan rápidas que no se aplica, y no se usa.

export interface RatingPoint {
  Q: number;
  /** Profundidad en la estación A con ese caudal en flujo permanente (m). */
  h: number;
  /** Pendiente de fricción allí (m/m). */
  Sf: number;
}

const RB = WAVE.b, RN = WAVE.n;
const sfOf = (Q: number, h: number) => {
  const A = RB * h, R = A / (RB + 2 * h), V = Q / A;
  return (RN * RN * V * V) / Math.pow(R, 4 / 3);
};

/**
 * Profundidad permanente en x con caudal Q en el canal de la escena (rectangular, n = 0,015, pendiente S, caída al
 * final). Pendiente suave u horizontal: curva M2 (o H2) que se integra aguas arriba desde la profundidad crítica de la
 * caída. Pendiente fuerte: curva S2 que se integra aguas abajo desde la crítica a la entrada. Runge-Kutta de cuarto
 * orden con pasos de 0,5 m sobre dy/dx = (S0 − Sf)/(1 − Fr²).
 */
export function steadyDepth(Q: number, S: number, x: number): number {
  const q = Q / RB, yc = Math.cbrt((q * q) / G);
  const mild = S <= 0 || sfOf(Q, yc) > S; // la normal queda por encima de la crítica
  // la curva no cruza la crítica (allí dy/dx es infinita): cada evaluación se queda en su rama
  const cl = (y: number) => (mild ? Math.max(y, yc * 1.001) : Math.min(Math.max(y, 1e-4), yc * 0.999));
  const dydx = (y0: number) => {
    const y = cl(y0);
    return (S - sfOf(Q, y)) / (1 - (q * q) / (G * y * y * y));
  };
  let y = cl(mild ? yc * 1.01 : yc * 0.99);
  const span = mild ? WAVE.L - x : x;
  // pasos cortos junto a la crítica, donde la curva cambia rápido
  const marks = [0, 0.02, 0.1, 0.5, 2].filter((m) => m < span).concat(span);
  for (let j = 1; j < marks.length; j++) {
    const len = marks[j] - marks[j - 1], ds = j < 4 ? len / 20 : 0.5;
    const n = Math.max(1, Math.round(len / ds)), h = (mild ? -len : len) / n;
    for (let k = 0; k < n; k++) {
      const k1 = dydx(y), k2 = dydx(y + 0.5 * h * k1), k3 = dydx(y + 0.5 * h * k2), k4 = dydx(y + h * k3);
      y = cl(y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4));
    }
  }
  return y;
}

/** Curva de gasto permanente en la estación A, de 0,2 m³/s a `Qtop` (35 puntos). */
export function ratingA(S: number, Qtop: number): RatingPoint[] {
  const out: RatingPoint[] = [];
  const x = WAVE.gauges[0];
  for (let k = 0; k <= 34; k++) {
    const Q = 0.2 * Math.pow(Qtop / 0.2, k / 34);
    const h = steadyDepth(Q, S, x);
    out.push({ Q, h, Sf: sfOf(Q, h) });
  }
  return out;
}

/** Interpola la curva de gasto: caudal permanente con la profundidad h, su pendiente de fricción y dQ/dh. */
export function ratingAt(pts: RatingPoint[], h: number): { Q: number; Sf: number; dQdh: number } | null {
  if (pts.length < 2 || h <= pts[0].h || h >= pts[pts.length - 1].h) return null;
  let k = 1;
  while (k < pts.length - 1 && pts[k].h < h) k++;
  const a = pts[k - 1], b = pts[k];
  const w = (h - a.h) / (b.h - a.h);
  return { Q: a.Q + w * (b.Q - a.Q), Sf: a.Sf + w * (b.Sf - a.Sf), dQdh: (b.Q - a.Q) / (b.h - a.h) };
}

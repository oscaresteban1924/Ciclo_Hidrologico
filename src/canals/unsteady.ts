// Flujo no permanente en un canal rectangular: ecuaciones de Saint-Venant 1D resueltas en tiempo real.
//
//   ∂h/∂t + ∂q/∂x = 0
//   ∂q/∂t + ∂(q²/h + g·h²/2)/∂x = −g·h·∂zb/∂x − g·h·Sf,   Sf = n²·u·|u| / R^(4/3)
//
// con h la profundidad y q = h·u el caudal por metro de ancho. Volúmenes finitos de primer orden con flujo HLL y
// reconstrucción hidrostática (Audusse et al., 2004): conserva el volumen, deja quieto un lago sobre un fondo
// irregular («bien balanceado») y no da profundidades negativas cuando el agua avanza sobre fondo seco. La
// fricción es semi-implícita. Paso de tiempo por la condición CFL (Courant 0,45).
//
// Contornos: caudal de entrada Q(t), pared, salida libre, salida en caída (profundidad crítica) o nivel fijo. Una
// compuerta interna entre dos celdas: si su abertura queda bajo el agua, el caudal es el de un orificio
// (Cc = 0,61, libre o ahogado) y el chorro entra aguas abajo con la velocidad de la vena contraída; cerrada, es una
// pared. Cálculo académico: no es un modelo de ingeniería.

export const G = 9.81;
const HDRY = 1e-6;

export interface SVConfig {
  /** Largo del canal (m) y número de celdas. */
  L: number;
  N: number;
  /** Ancho del canal (m), rectangular. */
  b: number;
  /** n de Manning (0: sin fricción). */
  n: number;
  /** Cota del fondo (m) en x. */
  zb: (x: number) => number;
  up: { kind: 'Q'; Q: (t: number) => number } | { kind: 'wall' } | { kind: 'free' } | { kind: 'jet'; h: number; Q: (t: number) => number };
  down: { kind: 'free' } | { kind: 'wall' } | { kind: 'fall' } | { kind: 'level'; z: number };
}

export interface SVGate {
  /** Interfaz donde está la compuerta: entre la celda k − 1 y la k. */
  k: number;
  /** Abertura (m); 0 es cerrada. */
  a: number;
}

export interface SVPoint {
  x: number;
  zb: number;
  h: number;
  u: number;
  /** Cota del agua y de la energía (m), y número de Froude. */
  z: number;
  E: number;
  Fr: number;
}

export class SaintVenant {
  readonly cfg: SVConfig;
  readonly dx: number;
  readonly x: Float64Array;
  readonly zb: Float64Array;
  h: Float64Array;
  q: Float64Array;
  t = 0;
  gate: SVGate | null = null;
  /** Volumen que entró y salió por los contornos (m³), para revisar la conservación. */
  vIn = 0;
  vOut = 0;
  private fh: Float64Array;
  private fqL: Float64Array;
  private fqR: Float64Array;

  constructor(cfg: SVConfig) {
    this.cfg = cfg;
    const N = cfg.N;
    this.dx = cfg.L / N;
    this.x = new Float64Array(N);
    this.zb = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      this.x[i] = (i + 0.5) * this.dx;
      this.zb[i] = cfg.zb(this.x[i]);
    }
    this.h = new Float64Array(N);
    this.q = new Float64Array(N);
    this.fh = new Float64Array(N + 1);
    this.fqL = new Float64Array(N + 1);
    this.fqR = new Float64Array(N + 1);
  }

  /** Pone el agua: cota de la superficie o profundidad en cada x, y caudal por metro. */
  init(f: (x: number, zb: number) => { h: number; q?: number }): void {
    for (let i = 0; i < this.cfg.N; i++) {
      const r = f(this.x[i], this.zb[i]);
      this.h[i] = Math.max(0, r.h);
      this.q[i] = this.h[i] > HDRY ? (r.q ?? 0) : 0;
    }
    this.t = 0;
    this.vIn = this.vOut = 0;
  }

  /** Volumen de agua en el canal (m³). */
  volume(): number {
    let v = 0;
    for (let i = 0; i < this.cfg.N; i++) v += this.h[i];
    return v * this.dx * this.cfg.b;
  }

  /** Paso de tiempo estable (CFL 0,45). */
  dtStable(): number {
    let s = 1e-9;
    if (this.cfg.up.kind === 'jet') {
      const u = this.cfg.up;
      s = Math.max(s, Math.abs(u.Q(this.t) / this.cfg.b / u.h) + Math.sqrt(G * u.h));
    }
    if (this.cfg.up.kind === 'Q') {
      const qg = Math.abs(this.cfg.up.Q(this.t)) / this.cfg.b;
      if (qg > 0) s = Math.max(s, 1.5 * Math.sqrt(G * Math.cbrt((qg * qg) / G)));
    }
    for (let i = 0; i < this.cfg.N; i++) {
      const h = this.h[i];
      if (h <= HDRY) continue;
      s = Math.max(s, Math.abs(this.q[i] / h) + Math.sqrt(G * h));
    }
    return Math.min(1, (0.45 * this.dx) / s);
  }

  /** Avanza un paso (no más de `dtMax`); devuelve el paso usado. */
  step(dtMax = Infinity): number {
    const N = this.cfg.N, dx = this.dx, b = this.cfg.b;
    const dt = Math.min(dtMax, this.dtStable());
    const h = this.h, q = this.q, zb = this.zb;
    // celdas fantasma de los contornos
    const ghost = (side: 'up' | 'down'): [number, number, number] => {
      const i = side === 'up' ? 0 : N - 1;
      const hi = h[i], qi = q[i], z = zb[i];
      if (side === 'up') {
        const c = this.cfg.up;
        if (c.kind === 'wall') return [hi, -qi, z];
        // chorro rápido (supercrítico) que entra con profundidad y caudal dados
        if (c.kind === 'jet') return [c.h, c.Q(this.t) / b, z];
        if (c.kind === 'Q') {
          // entra con al menos la profundidad crítica de su caudal (sirve también con el canal seco)
          const qg = c.Q(this.t) / b;
          return [Math.max(hi, Math.cbrt((qg * qg) / G), HDRY * 10), qg, z];
        }
        return [hi, qi, z];
      }
      const c = this.cfg.down;
      if (c.kind === 'wall') return [hi, -qi, z];
      if (c.kind === 'level') return [Math.max(0, c.z - z), qi, z];
      if (c.kind === 'fall') {
        const qo = Math.max(0, qi);
        const hc = Math.cbrt((qo * qo) / G);
        return [Math.min(hi, Math.max(hc, HDRY)), qo, z];
      }
      return [hi, qi, z];
    };
    const g0 = ghost('up'), g1 = ghost('down');
    for (let k = 0; k <= N; k++) {
      const hL = k === 0 ? g0[0] : h[k - 1], qL = k === 0 ? g0[1] : q[k - 1], zL = k === 0 ? g0[2] : zb[k - 1];
      const hR = k === N ? g1[0] : h[k], qR = k === N ? g1[1] : q[k], zR = k === N ? g1[2] : zb[k];
      const gate = this.gate;
      if (gate && gate.k === k && k > 0 && k < N && gate.a < Math.max(hL, hR) - 1e-6) {
        // compuerta: pared con un orificio abajo
        const a = Math.max(0, gate.a);
        let qg = 0;
        if (a > 0) {
          const up = hL + zL >= hR + zR;
          const h1 = up ? hL : hR, h2 = up ? hR : hL;
          const vena = 0.61 * a;
          const head = h2 > vena ? h1 - h2 : h1 - vena;
          qg = head > 0 ? vena * Math.sqrt(2 * G * head) : 0;
          // no puede salir más agua de la que el lado de arriba tiene para dar en este paso
          qg = Math.min(qg, (h1 * dx) / Math.max(dt, 1e-9) * 0.5);
          if (!up) qg = -qg;
        }
        const uJet = a > 0 ? qg / (0.61 * a) : 0;
        this.fh[k] = qg;
        this.fqL[k] = 0.5 * G * hL * hL + (qg > 0 ? (qg * qL) / Math.max(hL, HDRY) : qg * uJet);
        this.fqR[k] = 0.5 * G * hR * hR + (qg > 0 ? qg * uJet : (qg * qR) / Math.max(hR, HDRY));
        continue;
      }
      // reconstrucción hidrostática
      const zM = Math.max(zL, zR);
      const hl = Math.max(0, hL + zL - zM), hr = Math.max(0, hR + zR - zM);
      const ul = hL > HDRY ? qL / hL : 0, ur = hR > HDRY ? qR / hR : 0;
      const [Fh, Fq] = hll(hl, hl * ul, hr, hr * ur);
      this.fh[k] = Fh;
      this.fqL[k] = Fq + 0.5 * G * (hL * hL - hl * hl);
      this.fqR[k] = Fq + 0.5 * G * (hR * hR - hr * hr);
    }
    const r = dt / dx;
    const n2 = this.cfg.n * this.cfg.n;
    for (let i = 0; i < N; i++) {
      let hn = h[i] - r * (this.fh[i + 1] - this.fh[i]);
      let qn = q[i] - r * (this.fqL[i + 1] - this.fqR[i]);
      if (hn <= HDRY) {
        hn = Math.max(0, hn);
        qn = 0;
      } else if (n2 > 0) {
        const u = qn / hn;
        const R = (b * hn) / (b + 2 * hn);
        qn = qn / (1 + (dt * G * n2 * Math.abs(u)) / Math.pow(R, 4 / 3));
      }
      h[i] = hn;
      q[i] = qn;
    }
    this.vIn += this.fh[0] * dt * b;
    this.vOut += this.fh[N] * dt * b;
    this.t += dt;
    return dt;
  }

  /** Avanza `T` segundos (con el paso estable); a lo sumo `maxSteps` pasos. Devuelve el tiempo avanzado. */
  advance(T: number, maxSteps = 4000): number {
    const t0 = this.t, end = this.t + T;
    for (let k = 0; k < maxSteps && this.t < end - 1e-12; k++) this.step(end - this.t);
    return this.t - t0;
  }

  /** Estado en cada celda. */
  points(): SVPoint[] {
    const out: SVPoint[] = [];
    for (let i = 0; i < this.cfg.N; i++) {
      const h = this.h[i], u = h > 1e-4 ? this.q[i] / h : 0;
      out.push({ x: this.x[i], zb: this.zb[i], h, u, z: this.zb[i] + h, E: this.zb[i] + h + (u * u) / (2 * G), Fr: h > 1e-4 ? Math.abs(u) / Math.sqrt(G * h) : 0 });
    }
    return out;
  }

  /**
   * Caudal total (m³/s) que cruza la interfaz más cercana a x en el último paso. Es el flujo de masa del esquema (el
   * que conserva el volumen); el q de las celdas puede diferir un poco en un fondo inclinado.
   */
  flowAt(x: number): number {
    const k = Math.max(0, Math.min(this.cfg.N, Math.round(x / this.dx)));
    return this.fh[k] * this.cfg.b;
  }

  depthAt(x: number): number {
    const i = Math.max(0, Math.min(this.cfg.N - 1, Math.floor(x / this.dx)));
    return this.h[i];
  }

  /** Frente de la onda: la última celda mojada (h > umbral) desde aguas arriba. */
  front(threshold = 1e-3): number {
    let xf = 0;
    for (let i = 0; i < this.cfg.N; i++) if (this.h[i] > threshold) xf = this.x[i] + this.dx / 2;
    return xf;
  }
}

/** Flujo HLL de las ecuaciones de aguas someras (por metro de ancho), con fondo seco a uno o ambos lados. */
function hll(hL: number, qL: number, hR: number, qR: number): [number, number] {
  if (hL <= HDRY && hR <= HDRY) return [0, 0];
  const uL = hL > HDRY ? qL / hL : 0, uR = hR > HDRY ? qR / hR : 0;
  const cL = Math.sqrt(G * hL), cR = Math.sqrt(G * hR);
  let sL: number, sR: number;
  if (hL <= HDRY) {
    sL = uR - 2 * cR;
    sR = uR + cR;
  } else if (hR <= HDRY) {
    sL = uL - cL;
    sR = uL + 2 * cL;
  } else {
    sL = Math.min(uL - cL, uR - cR);
    sR = Math.max(uL + cL, uR + cR);
  }
  const FL = [qL, qL * uL + 0.5 * G * hL * hL];
  const FR = [qR, qR * uR + 0.5 * G * hR * hR];
  if (sL >= 0) return [FL[0], FL[1]];
  if (sR <= 0) return [FR[0], FR[1]];
  const d = sR - sL;
  return [(sR * FL[0] - sL * FR[0] + sL * sR * (hR - hL)) / d, (sR * FL[1] - sL * FR[1] + sL * sR * (qR - qL)) / d];
}

// ------------------------------------------------------------------ soluciones exactas para comparar

/** Rotura de presa sobre fondo seco y sin fricción (Ritter, 1892): profundidad en x a un tiempo t (presa en x0). */
export function ritter(x: number, t: number, x0: number, h0: number): number {
  if (t <= 0) return x < x0 ? h0 : 0;
  const c0 = Math.sqrt(G * h0), s = (x - x0) / t;
  if (s <= -c0) return h0;
  if (s >= 2 * c0) return 0;
  return ((2 * c0 - s) ** 2) / (9 * G);
}

/**
 * Rotura de presa sobre fondo mojado (Stoker, 1957): estado intermedio h2, velocidad u2 y velocidad del frente
 * (resalto móvil) S, con h0 aguas arriba y h1 aguas abajo, sin fricción.
 */
export function stoker(h0: number, h1: number): { h2: number; u2: number; S: number } {
  const c0 = Math.sqrt(G * h0);
  const h2of = (S: number) => (h1 / 2) * (Math.sqrt(1 + (8 * S * S) / (G * h1)) - 1);
  const f = (S: number) => {
    const h2 = h2of(S);
    const u2 = S * (1 - h1 / h2);
    return 2 * (c0 - Math.sqrt(G * h2)) - u2;
  };
  let lo = Math.sqrt(G * h1) * 1.000001, hi = 2 * c0;
  for (let k = 0; k < 200; k++) {
    const m = (lo + hi) / 2;
    if (f(m) > 0) lo = m;
    else hi = m;
  }
  const S = (lo + hi) / 2, h2 = h2of(S);
  return { h2, u2: S * (1 - h1 / h2), S };
}

/** Exacta de Stoker en x a un tiempo t (presa en x0). */
export function stokerProfile(x: number, t: number, x0: number, h0: number, h1: number): number {
  const { h2, u2, S } = stoker(h0, h1);
  const c0 = Math.sqrt(G * h0), c2 = Math.sqrt(G * h2);
  const s = (x - x0) / Math.max(t, 1e-9);
  if (s <= -c0) return h0;
  if (s <= u2 - c2) return ((2 * c0 - s) ** 2) / (9 * G);
  if (s <= S) return h2;
  return h1;
}

/**
 * Onda positiva por el cierre de una compuerta (Favre): aguas arriba de la compuerta llega un frente que sube el agua
 * de y1 a y2 y avanza contra la corriente con velocidad Vw. Conservación de masa y cantidad de movimiento en el frente
 * (con caudal q1 = V1·y1 antes y q2 después, por metro): Vw = (q1 − q2)/(y2 − y1) y
 * (V1 + Vw)² = g·y2·(y1 + y2)/(2·y1), con el frente moviéndose hacia aguas arriba.
 */
export function favreSurge(y1: number, V1: number, q2: number): { y2: number; Vw: number } {
  const q1 = V1 * y1;
  const f = (y2: number) => {
    const Vw = (q1 - q2) / (y2 - y1);
    return (V1 + Vw) ** 2 - (G * y2 * (y1 + y2)) / (2 * y1);
  };
  let lo = y1 * 1.0000001, hi = y1 * 1.01;
  while (f(hi) > 0 && hi < y1 * 100) hi *= 1.5;
  for (let k = 0; k < 200; k++) {
    const m = (lo + hi) / 2;
    if (f(m) > 0) lo = m;
    else hi = m;
  }
  const y2 = (lo + hi) / 2;
  return { y2, Vw: (q1 - q2) / (y2 - y1) };
}

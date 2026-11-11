// Flujo no permanente en un canal rectangular: ecuaciones de Saint-Venant 1D resueltas en tiempo real.
//
//   ∂h/∂t + ∂q/∂x = 0
//   ∂q/∂t + ∂(q²/h + g·h²/2)/∂x = −g·h·∂zb/∂x − g·h·Sf,   Sf = n²·u·|u| / R^(4/3)
//
// con h la profundidad y q = h·u el caudal por metro de ancho. Volúmenes finitos con flujo HLL y
// reconstrucción hidrostática (Audusse et al., 2004): conserva el volumen, deja quieto un lago sobre un fondo
// irregular («bien balanceado») y no da profundidades negativas cuando el agua avanza sobre fondo seco. Primer
// orden (Euler) o segundo orden (reconstrucción lineal con el limitador minmod y Heun, que afila los frentes). La
// fricción es semi-implícita. Paso de tiempo por la condición CFL (Courant 0,45, o 0,4 en segundo orden).
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
  /** Orden del esquema: 1 (Euler y valores de celda) o 2 (reconstrucción minmod y Heun). */
  order: 1 | 2 = 1;
  private fh: Float64Array;
  private fqL: Float64Array;
  private fqR: Float64Array;
  private fc: { hl: Float64Array; hr: Float64Array; ul: Float64Array; ur: Float64Array; zl: Float64Array; zr: Float64Array };
  private stage: { h0: Float64Array; q0: Float64Array; h1: Float64Array; q1: Float64Array; fh0: Float64Array };

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
    const A = () => new Float64Array(N);
    this.fc = { hl: A(), hr: A(), ul: A(), ur: A(), zl: A(), zr: A() };
    this.stage = { h0: A(), q0: A(), h1: A(), q1: A(), fh0: new Float64Array(N + 1) };
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

  /** Paso de tiempo estable (Courant 0,45 en primer orden y 0,4 en segundo). */
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
    return Math.min(1, ((this.order === 2 ? 0.4 : 0.45) * this.dx) / s);
  }

  /** Celda fantasma de un contorno (profundidad, caudal por metro y fondo), con el estado `h`, `q` al tiempo `t`. */
  private ghost(side: 'up' | 'down', h: Float64Array, q: Float64Array, t: number): [number, number, number] {
    const N = this.cfg.N, b = this.cfg.b;
    const i = side === 'up' ? 0 : N - 1;
    const hi = h[i], qi = q[i], z = this.zb[i];
    if (side === 'up') {
      const c = this.cfg.up;
      if (c.kind === 'wall') return [hi, -qi, z];
      // chorro rápido (supercrítico) que entra con profundidad y caudal dados
      if (c.kind === 'jet') return [c.h, c.Q(t) / b, z];
      if (c.kind === 'Q') {
        // entra con al menos la profundidad crítica de su caudal (sirve también con el canal seco)
        const qg = c.Q(t) / b;
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
  }

  /**
   * Valores en las caras de cada celda. En primer orden, los del centro. En segundo orden, reconstrucción lineal de la
   * profundidad, la velocidad y la cota del agua con el limitador minmod (no crea máximos ni mínimos nuevos y no da
   * profundidades negativas); el fondo de cada cara sale de la cota del agua menos la profundidad, como en Audusse et
   * al. (2004), para que un lago quieto siga quieto. Las celdas de los contornos y las vecinas de la compuerta quedan
   * en primer orden.
   */
  private faces(h: Float64Array, q: Float64Array): void {
    const N = this.cfg.N, zb = this.zb, F = this.fc;
    const gk = this.gate ? this.gate.k : -9;
    for (let i = 0; i < N; i++) {
      const hi = h[i], ui = hi > HDRY ? q[i] / hi : 0;
      let sh = 0, su = 0, se = 0;
      if (this.order === 2 && i > 0 && i < N - 1 && i !== gk - 1 && i !== gk) {
        const hm = h[i - 1], hp = h[i + 1];
        const um = hm > HDRY ? q[i - 1] / hm : 0, up = hp > HDRY ? q[i + 1] / hp : 0;
        sh = minmod(hi - hm, hp - hi);
        su = minmod(ui - um, up - ui);
        se = minmod(hi + zb[i] - hm - zb[i - 1], hp + zb[i + 1] - hi - zb[i]);
      }
      F.hl[i] = hi - 0.5 * sh;
      F.hr[i] = hi + 0.5 * sh;
      F.ul[i] = ui - 0.5 * su;
      F.ur[i] = ui + 0.5 * su;
      const e = hi + zb[i];
      F.zl[i] = e - 0.5 * se - F.hl[i];
      F.zr[i] = e + 0.5 * se - F.hr[i];
    }
  }

  /**
   * Un paso de Euler desde el estado (hs, qs) al tiempo t, escrito en (ho, qo) (puede ser el mismo arreglo). Deja los
   * flujos de masa en `fh`. Sin fricción: la fricción se aplica al final del paso completo.
   */
  private euler(hs: Float64Array, qs: Float64Array, ho: Float64Array, qo: Float64Array, t: number, dt: number): void {
    const N = this.cfg.N, dx = this.dx, F = this.fc;
    this.faces(hs, qs);
    const g0 = this.ghost('up', hs, qs, t), g1 = this.ghost('down', hs, qs, t);
    for (let k = 0; k <= N; k++) {
      const hL = k === 0 ? g0[0] : F.hr[k - 1], uL = k === 0 ? (g0[0] > HDRY ? g0[1] / g0[0] : 0) : F.ur[k - 1], zL = k === 0 ? g0[2] : F.zr[k - 1];
      const hR = k === N ? g1[0] : F.hl[k], uR = k === N ? (g1[0] > HDRY ? g1[1] / g1[0] : 0) : F.ul[k], zR = k === N ? g1[2] : F.zl[k];
      if (k === 0 && this.cfg.up.kind === 'Q') {
        // caudal de entrada impuesto en la interfaz: entra exactamente Q(t). La cantidad de movimiento usa la
        // profundidad de la primera celda, o la crítica si el canal está seco o el agua es más baja que ella
        const qg = this.cfg.up.Q(t) / this.cfg.b;
        const hb = Math.max(hR, Math.cbrt((qg * qg) / G), HDRY * 10);
        this.fh[0] = qg;
        this.fqL[0] = this.fqR[0] = (qg * qg) / hb + 0.5 * G * hb * hb;
        continue;
      }
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
        this.fqL[k] = 0.5 * G * hL * hL + (qg > 0 ? qg * uL : qg * uJet);
        this.fqR[k] = 0.5 * G * hR * hR + (qg > 0 ? qg * uJet : qg * uR);
        continue;
      }
      // reconstrucción hidrostática en la interfaz
      const zM = Math.max(zL, zR);
      const hl = Math.max(0, hL + zL - zM), hr = Math.max(0, hR + zR - zM);
      const [Fh, Fq] = hll(hl, hl * uL, hr, hr * uR);
      this.fh[k] = Fh;
      this.fqL[k] = Fq + 0.5 * G * (hL * hL - hl * hl);
      this.fqR[k] = Fq + 0.5 * G * (hR * hR - hr * hr);
    }
    const r = dt / dx;
    for (let i = 0; i < N; i++) {
      // término del fondo dentro de la celda (cero en primer orden)
      const sc = 0.5 * G * (F.hl[i] + F.hr[i]) * (F.zl[i] - F.zr[i]);
      let hn = hs[i] - r * (this.fh[i + 1] - this.fh[i]);
      let qn = qs[i] - r * (this.fqL[i + 1] - this.fqR[i]) + r * sc;
      if (hn <= HDRY) {
        hn = Math.max(0, hn);
        qn = 0;
      }
      ho[i] = hn;
      qo[i] = qn;
    }
  }

  /**
   * Avanza un paso (no más de `dtMax`); devuelve el paso usado. Primer orden: Euler. Segundo orden: Heun (Runge-Kutta
   * de dos etapas que conserva la positividad), con el promedio de los flujos de las dos etapas para el balance.
   */
  step(dtMax = Infinity): number {
    const N = this.cfg.N, b = this.cfg.b;
    const dt = Math.min(dtMax, this.dtStable());
    const h = this.h, q = this.q;
    if (this.order === 1) {
      this.euler(h, q, h, q, this.t, dt);
    } else {
      const S = this.stage;
      S.h0.set(h);
      S.q0.set(q);
      this.euler(h, q, S.h1, S.q1, this.t, dt);
      S.fh0.set(this.fh);
      this.euler(S.h1, S.q1, S.h1, S.q1, this.t + dt, dt);
      for (let i = 0; i < N; i++) {
        const hn = 0.5 * (S.h0[i] + S.h1[i]);
        h[i] = hn;
        q[i] = hn > HDRY ? 0.5 * (S.q0[i] + S.q1[i]) : 0;
      }
      for (let k = 0; k <= N; k++) this.fh[k] = 0.5 * (S.fh0[k] + this.fh[k]);
    }
    // fricción de Manning, semi-implícita (estable con poca agua)
    const n2 = this.cfg.n * this.cfg.n;
    if (n2 > 0) {
      for (let i = 0; i < N; i++) {
        const hn = h[i];
        if (hn <= HDRY) continue;
        const u = q[i] / hn;
        const R = (b * hn) / (b + 2 * hn);
        q[i] = q[i] / (1 + (dt * G * n2 * Math.abs(u)) / Math.pow(R, 4 / 3));
      }
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

/** Limitador minmod: la pendiente más pequeña si las dos tienen el mismo signo; cero en un extremo. */
function minmod(a: number, b: number): number {
  if (a * b <= 0) return 0;
  return Math.abs(a) < Math.abs(b) ? a : b;
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

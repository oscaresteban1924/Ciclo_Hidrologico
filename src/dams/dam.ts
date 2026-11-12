// Presas y embalses para la sala «Presas y embalses»: tránsito de una creciente por el embalse (Puls), vertedero de
// cresta en perfil WES con su descarga y el pozo de disipación al pie, y estabilidad de una presa de gravedad
// (volcamiento, deslizamiento, tercio medio y esfuerzos en la base). Funciones puras, sin interfaz.

export const G = 9.81;
export const GAMMA_W = 9.81; // kN/m³
export const GAMMA_C = 23.5; // kN/m³, concreto en masa

// ------------------------------------------------------------------ hidrograma de entrada

/** Hidrograma de forma gamma (NRCS): Q(t) = Qb + (Qp − Qb)·(t/tp·e^(1 − t/tp))^m. Tiempos en horas, Q en m³/s. */
export function gammaInflow(Qb: number, Qp: number, tp: number, m = 3.7): (t: number) => number {
  return (t: number) => (t <= 0 ? Qb : Qb + (Qp - Qb) * Math.pow((t / tp) * Math.exp(1 - t / tp), m));
}

// ------------------------------------------------------------------ embalse y vertedero

export interface Reservoir {
  /** Área del espejo de agua (m²) como función de la cota sobre la cresta del vertedero: A = A0 + A1·h. */
  A0: number;
  A1: number;
  /** Vertedero libre: ancho de la cresta (m) y coeficiente C de Q = C·L·H^1,5 (SI). */
  L: number;
  C: number;
  /** Descarga de fondo abierta: caudal constante (m³/s, 0 = cerrada). */
  bottom: number;
}

/** Volumen sobre la cresta (m³) con el agua a h (m) sobre ella. */
export const storage = (r: Reservoir, h: number) => r.A0 * h + (r.A1 * h * h) / 2;
/** Caudal que sale (m³/s) con el agua a h sobre la cresta. */
export const outflow = (r: Reservoir, h: number) => r.C * r.L * Math.pow(Math.max(0, h), 1.5) + r.bottom;

export interface RoutingResult {
  t: number[];
  I: number[];
  O: number[];
  h: number[];
  Ipeak: number;
  Opeak: number;
  tIpeak: number;
  tOpeak: number;
  hMax: number;
  /** Volumen que entró, salió y quedó guardado (m³). */
  vin: number;
  vout: number;
  dS: number;
}

/**
 * Tránsito por piscina nivelada (Puls modificado): (2S/Δt + O)ₙ₊₁ = Iₙ + Iₙ₊₁ + (2S/Δt − O)ₙ. La función
 * 2S/Δt + O de h es creciente, así que se invierte por bisección en cada paso. Empieza con el agua en la cresta (h0).
 */
export function routePuls(r: Reservoir, inflow: (tH: number) => number, tEndH: number, dtH: number, h0 = 0): RoutingResult {
  const dt = dtH * 3600;
  const n = Math.ceil(tEndH / dtH);
  const t: number[] = [0], I: number[] = [inflow(0)], h: number[] = [h0], O: number[] = [outflow(r, h0)];
  const ind = (hh: number) => (2 * storage(r, hh)) / dt + outflow(r, hh);
  for (let k = 1; k <= n; k++) {
    const tk = k * dtH, Ik = inflow(tk);
    const rhs = I[k - 1] + Ik + (2 * storage(r, h[k - 1])) / dt - O[k - 1];
    let lo = 0, hi = Math.max(1, h[k - 1] * 2 + 1);
    while (ind(hi) < rhs && hi < 1e4) hi *= 2;
    for (let j = 0; j < 100; j++) {
      const m = (lo + hi) / 2;
      if (ind(m) < rhs) lo = m;
      else hi = m;
    }
    const hk = Math.max(0, (lo + hi) / 2);
    t.push(tk);
    I.push(Ik);
    h.push(hk);
    O.push(outflow(r, hk));
  }
  const trap = (a: number[]) => a.reduce((s, v, k) => (k ? s + ((v + a[k - 1]) / 2) * dt : 0), 0);
  let ki = 0, ko = 0;
  I.forEach((v, k) => (v > I[ki] ? (ki = k) : 0));
  O.forEach((v, k) => (v > O[ko] ? (ko = k) : 0));
  return { t, I, O, h, Ipeak: I[ki], Opeak: O[ko], tIpeak: t[ki], tOpeak: t[ko], hMax: Math.max(...h), vin: trap(I), vout: trap(O), dS: storage(r, h[h.length - 1]) - storage(r, h0) };
}

/**
 * Embalse lineal (O = k·S) con una entrada constante I0 desde S = 0: solución exacta S(t) = (I0/k)·(1 − e^(−k·t)).
 * Sirve para comprobar el método de Puls.
 */
export const linearReservoir = (I0: number, k: number, tS: number) => (I0 / k) * (1 - Math.exp(-k * tS));

// ------------------------------------------------------------------ perfil del vertedero

/** Perfil aguas abajo de la cresta WES: x^1,85 = 2·Hd^0,85·y (y hacia abajo desde la cresta). */
export const wesY = (x: number, Hd: number) => Math.pow(Math.max(0, x), 1.85) / (2 * Math.pow(Hd, 0.85));

/** Punto de tangencia con una rápida de pendiente m (horizontal:vertical): dy/dx = 1/m. */
export function wesTangent(Hd: number, m: number): { x: number; y: number } {
  // dy/dx = 1,85·x^0,85/(2·Hd^0,85) = 1/m
  const x = Math.pow((2 * Math.pow(Hd, 0.85)) / (1.85 * m), 1 / 0.85);
  return { x, y: wesY(x, Hd) };
}

/** Resalto al pie: profundidades conjugadas (Bélanger) y largo de un pozo USBR tipo I (≈ 6·y2). */
export function stillingBasin(q: number, drop: number, H: number): { V1: number; y1: number; F1: number; y2: number; Lb: number } {
  // energía al pie: la caída más la carga sobre la cresta (sin pérdidas en la rápida, cota superior de la velocidad)
  const E = drop + H;
  let y1 = q / Math.sqrt(2 * G * E);
  for (let k = 0; k < 50; k++) y1 = q / Math.sqrt(2 * G * Math.max(1e-6, E - y1));
  const V1 = q / y1, F1 = V1 / Math.sqrt(G * y1);
  const y2 = (y1 / 2) * (Math.sqrt(1 + 8 * F1 * F1) - 1);
  return { V1, y1, F1, y2, Lb: 6 * y2 };
}

// ------------------------------------------------------------------ estabilidad de una presa de gravedad

export interface GravityDam {
  /** Altura (m), ancho de la corona (m), talud aguas abajo m (H:V) y altura del agua (m). */
  H: number;
  crest: number;
  m: number;
  hw: number;
  /** Agua aguas abajo (m). */
  tail: number;
  /** Fracción de la subpresión que queda con drenes (1 = sin drenes). */
  uplift: number;
  /** Coeficiente de fricción concreto-roca y cohesión (kPa). */
  mu: number;
  c: number;
}

export interface Force {
  name: string;
  /** Componente horizontal (kN/m, positiva hacia aguas abajo) y vertical (kN/m, positiva hacia abajo). */
  Fx: number;
  Fy: number;
  /** Punto de aplicación: x desde el talón (paramento aguas arriba) y altura sobre la base (m). */
  x: number;
  y: number;
}

export interface StabilityResult {
  B: number;
  forces: Force[];
  V: number;
  Hsum: number;
  /** Momentos respecto a la punta (pie aguas abajo), resistentes y volcadores (kN·m/m). */
  Mr: number;
  Mo: number;
  FSo: number;
  FSs: number;
  FSsf: number;
  /** Posición de la resultante desde el talón y excentricidad respecto al centro (m). */
  xR: number;
  e: number;
  inThird: boolean;
  /** Esfuerzos verticales en el talón y la punta (kPa, positivos = compresión). */
  sHeel: number;
  sToe: number;
}

/**
 * Sección: paramento aguas arriba vertical, corona de ancho `crest` y talud aguas abajo m:1 desde la corona hasta la
 * base. Fuerzas por metro de presa: peso (corona + triángulo), empuje del agua arriba y abajo, y subpresión lineal
 * entre γ·hw en el talón y γ·tail en la punta (multiplicada por `uplift`).
 */
export function stability(d: GravityDam): StabilityResult {
  const hs = Math.max(0, d.H - 0); // altura del talud: de la base a la corona
  const B = d.crest + d.m * hs;
  const forces: Force[] = [];
  // peso: rectángulo de la corona y triángulo del talud
  forces.push({ name: 'Peso de la corona', Fx: 0, Fy: GAMMA_C * d.crest * d.H, x: d.crest / 2, y: d.H / 2 });
  forces.push({ name: 'Peso del talud', Fx: 0, Fy: (GAMMA_C * d.m * hs * hs) / 2, x: d.crest + (d.m * hs) / 3, y: hs / 3 });
  // agua aguas arriba (paramento vertical)
  forces.push({ name: 'Empuje del agua', Fx: (GAMMA_W * d.hw * d.hw) / 2, Fy: 0, x: 0, y: d.hw / 3 });
  // agua aguas abajo: empuje (hacia aguas arriba) y peso sobre el talud
  if (d.tail > 0) {
    forces.push({ name: 'Empuje del agua de abajo', Fx: (-GAMMA_W * d.tail * d.tail) / 2, Fy: 0, x: B, y: d.tail / 3 });
    forces.push({ name: 'Agua sobre el talud', Fx: 0, Fy: (GAMMA_W * d.m * d.tail * d.tail) / 2, x: B - (d.m * d.tail) / 3, y: (2 * d.tail) / 3 });
  }
  // subpresión: trapecio de γ·hw a γ·tail, reducido por drenes
  const u1 = GAMMA_W * d.hw * d.uplift, u2 = GAMMA_W * d.tail;
  const U = ((u1 + u2) / 2) * B;
  const xU = U > 0 ? (B * (2 * u2 + u1)) / (3 * (u1 + u2)) : B / 2;
  forces.push({ name: 'Subpresión', Fx: 0, Fy: -U, x: xU, y: 0 });
  const V = forces.reduce((a, f) => a + f.Fy, 0);
  const Hsum = forces.reduce((a, f) => a + f.Fx, 0);
  // momentos respecto a la punta (x = B): las cargas verticales hacia abajo resisten; el empuje y la subpresión vuelcan
  let Mr = 0, Mo = 0;
  for (const f of forces) {
    const mv = f.Fy * (B - f.x); // positivo = resiste
    const mh = f.Fx * f.y; // positivo = vuelca
    if (mv >= 0) Mr += mv;
    else Mo += -mv;
    if (mh >= 0) Mo += mh;
    else Mr += -mh;
  }
  const M = Mr - Mo;
  const xToe = V > 0 ? M / V : 0; // distancia de la resultante a la punta
  const xR = B - xToe;
  const e = B / 2 - xToe;
  const sAvg = V / B;
  return {
    B,
    forces,
    V,
    Hsum,
    Mr,
    Mo,
    FSo: Mo > 0 ? Mr / Mo : Infinity,
    FSs: Hsum > 0 ? (d.mu * V) / Hsum : Infinity,
    FSsf: Hsum > 0 ? (d.mu * V + d.c * B) / Hsum : Infinity,
    xR,
    e,
    inThird: Math.abs(e) <= B / 6 + 1e-9,
    sHeel: sAvg * (1 - (6 * e) / B),
    sToe: sAvg * (1 + (6 * e) / B),
  };
}

// Cálculo de la sala «Medir el agua»: el pluviómetro de balancín (tiempo de vuelco y viento) y el radar con sus
// relaciones Z-R; el aforo de un río con molinete por el método de la sección media y la curva de gasto; y los
// medidores de presión diferencial en una tubería (Venturi y placa de orificio). Sin interfaz.

export const G = 9.81;

// ------------------------------------------------------------------ lluvia

export type ZRKey = 'mp' | 'conv' | 'trop';
/** Relaciones Z = a·R^b (Z en mm⁶/m³, R en mm/h). */
export const ZR: Record<ZRKey, { name: string; short: string; a: number; b: number; src: string }> = {
  mp: { name: 'Marshall-Palmer: lluvia estratiforme', short: 'Estratiforme', a: 200, b: 1.6, src: 'Marshall y Palmer (1948)' },
  conv: { name: 'Convectiva (la del radar WSR-88D)', short: 'Convectiva', a: 300, b: 1.4, src: 'Fulton y otros (1998)' },
  trop: { name: 'Tropical', short: 'Tropical', a: 250, b: 1.2, src: 'Rosenfeld, Wolff y Atlas (1993)' },
};

export const dbz = (R: number, k: ZRKey) => 10 * Math.log10(ZR[k].a * Math.pow(Math.max(1e-6, R), ZR[k].b));
export const rainFromDbz = (dBZ: number, k: ZRKey) => Math.pow(Math.pow(10, dBZ / 10) / ZR[k].a, 1 / ZR[k].b);

/** Pluviómetro de balancín ilustrativo: 0,2 mm por vuelco, boca de 200 cm² y medio segundo de vuelco. */
export const TIP_MM = 0.2;
export const TIP_S = 0.5;
export const ORIFICE_CM2 = 200;

/**
 * Fracción de la lluvia que entra al pluviómetro con viento u [m/s] a la altura de la boca. Aproximación lineal
 * ilustrativa, dentro del rango de pérdidas de 2 % a 10 % que la OMM reporta para la lluvia.
 */
export const catchRatio = (u: number) => Math.max(0.88, 1 - 0.012 * Math.max(0, u));

/**
 * Intensidad que registra el balancín [mm/h] con una lluvia real I [mm/h]: mientras se vuelca (τ) el agua que cae
 * se pierde, así que los vuelcos por hora son 1/(δ/Ic + τ) y la intensidad medida Ic/(1 + Ic·τ/δ).
 */
export function gaugeIntensity(I: number, u: number): number {
  const Ic = I * catchRatio(u);
  return Ic / (1 + (Ic * (TIP_S / 3600)) / TIP_MM);
}

/** Lluvia real que corresponde a una intensidad registrada (inversa de gaugeIntensity). */
export function correctIntensity(Im: number, u: number): number {
  const Ic = Im / (1 - (Im * (TIP_S / 3600)) / TIP_MM);
  return Ic / catchRatio(u);
}

export interface Storm {
  t: number[];
  I: number[];
  /** Lluvia real acumulada y la que registra el balancín [mm], y los vuelcos contados. */
  P: number[];
  Pm: number[];
  tips: number[];
  total: number;
  totalM: number;
}

/** Aguacero triangular de una hora con pico Ip [mm/h] a la media hora. */
export function storm(Ip: number, u: number, n = 600): Storm {
  const t: number[] = [], I: number[] = [], P: number[] = [], Pm: number[] = [], tips: number[] = [];
  let acc = 0, accM = 0;
  const dt = 1 / n;
  for (let k = 0; k <= n; k++) {
    const tt = k * dt;
    const i = Ip * Math.max(0, 1 - Math.abs(tt - 0.5) / 0.5);
    if (k > 0) {
      const im = (I[k - 1] + i) / 2;
      acc += im * dt;
      accM += gaugeIntensity(im, u) * dt;
    }
    t.push(tt);
    I.push(i);
    P.push(acc);
    Pm.push(accM);
    tips.push(Math.floor(accM / TIP_MM + 1e-9));
  }
  return { t, I, P, Pm, tips, total: acc, totalM: tips[n] * TIP_MM };
}

/**
 * Densidades mínimas de estaciones de lluvia [km² por estación] (OMM, Guía de prácticas hidrológicas, n.º 168,
 * tabla I.2.1): pluviómetros comunes y registradores.
 */
export const WMO_DENSITY: Record<string, { name: string; plain: number; rec: number }> = {
  costera: { name: 'Costera', plain: 900, rec: 9000 },
  montana: { name: 'Montañosa', plain: 250, rec: 2500 },
  llanura: { name: 'Llanura interior', plain: 575, rec: 5750 },
  colinas: { name: 'Colinas y ondulada', plain: 575, rec: 5750 },
  islas: { name: 'Islas pequeñas', plain: 25, rec: 250 },
  urbana: { name: 'Urbana', plain: 10, rec: 10 },
  arida: { name: 'Polar o árida', plain: 10000, rec: 100000 },
};

// ------------------------------------------------------------------ el río

/**
 * Sección ilustrativa de un río de montaña: cauce principal de 16 m con 2,4 m de profundidad y llanuras de
 * inundación anchas y casi planas a los lados; el fondo del cauce es pedregoso (pozos y barras). Cotas respecto al
 * cero de la regla, que está 0,35 m bajo el punto más hondo.
 */
export const BED: [number, number][] = [
  [-50, 4.2],
  [-42, 3.05],
  [-20, 2.92],
  [-8.6, 2.75],
  [-7.6, 1.6],
  [-6.4, 1.05],
  [-5.2, 1.25],
  [-3.8, 0.7],
  [-2.6, 0.55],
  [-1.2, 0.85],
  [0, 0.35],
  [1.2, 0.5],
  [2.5, 0.95],
  [3.6, 0.72],
  [4.8, 1.2],
  [6.2, 1.35],
  [7.4, 2.0],
  [8.4, 2.75],
  [20, 2.92],
  [42, 3.05],
  [50, 4.2],
];
/** Cota de la orilla (el agua sale del cauce) y cero de caudal [m de regla]. */
export const BANK = 2.75;
export const H_ZERO = 0.35;
export const SLOPE = 0.0015;
export const N_MAIN = 0.035;
export const N_PLAIN = 0.06;

export function bedZ(x: number): number {
  if (x <= BED[0][0]) return BED[0][1];
  for (let k = 1; k < BED.length; k++) {
    const [x0, z0] = BED[k - 1], [x1, z1] = BED[k];
    if (x <= x1) return z0 + ((x - x0) / (x1 - x0)) * (z1 - z0);
  }
  return BED[BED.length - 1][1];
}

/** Rugosidad de Manning en x: cauce o llanura. */
export const manningAt = (x: number) => (x > -8.6 && x < 8.4 ? N_MAIN : N_PLAIN);

/** Velocidad media de la vertical en x con el nivel h (Manning por vertical: n⁻¹·d^(2/3)·S^(1/2)). */
export function verticalMean(x: number, h: number): number {
  const d = Math.max(0, h - bedZ(x));
  return d > 0 ? (Math.pow(d, 2 / 3) * Math.sqrt(SLOPE)) / manningAt(x) : 0;
}

/** Velocidad puntual a la altura y sobre el fondo: perfil potencial 1/6 (la media de la vertical da v̄). */
export function pointVelocity(x: number, y: number, h: number): number {
  const d = Math.max(0, h - bedZ(x));
  if (d <= 0) return 0;
  return verticalMean(x, h) * (7 / 6) * Math.pow(Math.max(0, Math.min(1, y / d)), 1 / 6);
}

/** Bordes del agua con el nivel h: donde la superficie corta el fondo. */
export function waterEdges(h: number): [number, number] {
  const find = (from: number, to: number) => {
    const n = 2000;
    for (let k = 0; k <= n; k++) {
      const x = from + ((to - from) * k) / n;
      if (h - bedZ(x) > 0) return x;
    }
    return 0;
  };
  return [find(BED[0][0], 0.5), find(BED[BED.length - 1][0], 0.5)];
}

/** Caudal «verdadero» de la escena: la suma de 2 000 franjas. */
export function trueFlow(h: number): { Q: number; A: number; B: number } {
  const [a, b] = waterEdges(h);
  const n = 2000, dx = (b - a) / n;
  let Q = 0, A = 0;
  for (let k = 0; k < n; k++) {
    const x = a + (k + 0.5) * dx;
    const d = Math.max(0, h - bedZ(x));
    A += d * dx;
    Q += verticalMean(x, h) * d * dx;
  }
  return { Q, A, B: b - a };
}

export type Method = '06' | '0208';
export const METHODS: Record<Method, string> = { '06': 'Un punto: a 0,6 de la profundidad', '0208': 'Dos puntos: a 0,2 y 0,8' };

export interface Vertical {
  x: number;
  d: number;
  v: number;
  w: number;
  q: number;
}

/**
 * Aforo por el método de la sección media (ISO 748): N verticales igualmente espaciadas entre las orillas; en cada
 * una se mide la profundidad y la velocidad con el molinete (a 0,6 de la profundidad desde la superficie, o el
 * promedio a 0,2 y 0,8); cada vertical representa la mitad de la distancia a sus vecinas.
 */
export function gauge(h: number, N: number, method: Method): { verts: Vertical[]; Q: number; A: number; maxShare: number; edges: [number, number] } {
  const [a, b] = waterEdges(h);
  const xs = Array.from({ length: N }, (_, k) => a + ((k + 1) * (b - a)) / (N + 1));
  const verts: Vertical[] = [];
  let Q = 0, A = 0;
  for (let k = 0; k < N; k++) {
    const x = xs[k];
    const d = Math.max(0, h - bedZ(x));
    const v = method === '06' ? pointVelocity(x, 0.4 * d, h) : (pointVelocity(x, 0.8 * d, h) + pointVelocity(x, 0.2 * d, h)) / 2;
    const left = k === 0 ? a : xs[k - 1], right = k === N - 1 ? b : xs[k + 1];
    const w = (right - left) / 2;
    verts.push({ x, d, v, w, q: v * d * w });
    Q += v * d * w;
    A += d * w;
  }
  const maxShare = Q > 0 ? Math.max(...verts.map((p) => p.q)) / Q : 1;
  return { verts, Q, A, maxShare, edges: [a, b] };
}

/** Aforos históricos ilustrativos (dentro del cauce), con el ±5 % de error típico de un buen aforo. */
export const GAUGINGS: { h: number; Q: number }[] = (() => {
  const hs = [0.62, 0.78, 0.95, 1.12, 1.3, 1.48, 1.7, 1.92, 2.15, 2.4];
  const noise = [0.03, -0.04, 0.02, -0.01, 0.045, -0.03, 0.01, -0.025, 0.035, -0.015];
  return hs.map((h, k) => ({ h, Q: trueFlow(h).Q * (1 + noise[k]) }));
})();

export interface Rating {
  a: number;
  b: number;
  h0: number;
  r2: number;
  /** Error estándar del logaritmo del caudal (≈ error relativo típico). */
  se: number;
  ok: boolean;
}

/** Curva de gasto Q = a·(h − h0)^b por mínimos cuadrados en logaritmos, con h0 dado. */
export function fitRating(pts: { h: number; Q: number }[], h0: number): Rating {
  const use = pts.filter((p) => p.h > h0 && p.Q > 0);
  if (use.length < 3 || use.length < pts.length) return { a: NaN, b: NaN, h0, r2: NaN, se: NaN, ok: false };
  const X = use.map((p) => Math.log(p.h - h0)), Y = use.map((p) => Math.log(p.Q));
  const n = use.length, mx = X.reduce((s, v) => s + v, 0) / n, my = Y.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let k = 0; k < n; k++) {
    sxx += (X[k] - mx) ** 2;
    sxy += (X[k] - mx) * (Y[k] - my);
    syy += (Y[k] - my) ** 2;
  }
  const b = sxy / sxx, la = my - b * mx;
  let sse = 0;
  for (let k = 0; k < n; k++) sse += (Y[k] - la - b * X[k]) ** 2;
  return { a: Math.exp(la), b, h0, r2: 1 - sse / syy, se: Math.sqrt(sse / Math.max(1, n - 2)), ok: true };
}

/** El h0 que deja el menor error (búsqueda en una rejilla de 1 cm bajo el aforo más bajo). */
export function bestH0(pts: { h: number; Q: number }[]): Rating {
  const hmin = Math.min(...pts.map((p) => p.h));
  let best: Rating | null = null;
  for (let h0 = hmin - 0.01; h0 >= hmin - 2; h0 -= 0.01) {
    const r = fitRating(pts, Math.round(h0 * 100) / 100);
    if (r.ok && (!best || r.se < best.se)) best = r;
  }
  return best!;
}

export const ratingQ = (r: Rating, h: number) => (h > r.h0 && r.ok ? r.a * Math.pow(h - r.h0, r.b) : 0);

// ------------------------------------------------------------------ medidores en la tubería

export const RHO = 998.2;
export const NU = 1.004e-6;

/** Coeficiente de descarga del Venturi clásico con convergente mecanizado (ISO 5167-4). */
export const C_VENTURI = 0.995;

/**
 * Coeficiente de la placa de orificio con tomas en las esquinas: ecuación de Reader-Harris/Gallagher (ISO 5167-2,
 * 2003) para D de 71,12 mm o más.
 */
export function cOrifice(beta: number, ReD: number): number {
  const A = Math.pow((19000 * beta) / ReD, 0.8);
  return 0.5961 + 0.0261 * beta ** 2 - 0.216 * beta ** 8 + 0.000521 * Math.pow((1e6 * beta) / ReD, 0.7) + (0.0188 + 0.0063 * A) * Math.pow(beta, 3.5) * Math.pow(1e6 / ReD, 0.3);
}

export type Meter = 'venturi' | 'orificio';

export interface MeterResult {
  C: number;
  ReD: number;
  /** Diferencia de presión [Pa] y su altura de agua [m]. */
  dp: number;
  dh: number;
  /** Pérdida permanente [m]. */
  loss: number;
  /** Velocidades en la tubería y en la garganta (o el orificio) [m/s]. */
  V1: number;
  V2: number;
}

/** Diferencia de presión que produce un caudal Q [m³/s] en un medidor de razón de diámetros β en una tubería D [m]. */
export function meterDp(kind: Meter, Q: number, D: number, beta: number): MeterResult {
  const d = beta * D, Ad = (Math.PI * d * d) / 4, AD = (Math.PI * D * D) / 4;
  const ReD = (Q / AD) * D / NU;
  const C = kind === 'venturi' ? C_VENTURI : cOrifice(beta, Math.max(1, ReD));
  const dp = (RHO / 2) * Math.pow((Q * Math.sqrt(1 - beta ** 4)) / (C * Ad), 2);
  let lossRatio: number;
  if (kind === 'venturi') lossRatio = 0.1;
  else {
    const s = Math.sqrt(1 - beta ** 4 * (1 - C * C));
    lossRatio = (s - C * beta * beta) / (s + C * beta * beta);
  }
  return { C, ReD, dp, dh: dp / (RHO * G), loss: (dp * lossRatio) / (RHO * G), V1: Q / AD, V2: Q / Ad };
}

/** Caudal que se calcula desde una lectura Δh [m] (se itera porque C depende del caudal). */
export function meterFlow(kind: Meter, dh: number, D: number, beta: number): number {
  if (dh <= 0) return 0;
  const d = beta * D, Ad = (Math.PI * d * d) / 4;
  let C = kind === 'venturi' ? C_VENTURI : 0.6;
  let Q = 0;
  for (let k = 0; k < 30; k++) {
    Q = (C / Math.sqrt(1 - beta ** 4)) * Ad * Math.sqrt(2 * G * dh);
    if (kind === 'venturi') break;
    const ReD = (4 * Q) / (Math.PI * D * NU);
    C = cOrifice(beta, ReD);
  }
  return Q;
}

/** Rangos de validez (ISO 5167-2 y 5167-4) para avisar cuando el medidor se usa fuera de ellos. */
export function meterValid(kind: Meter, D: number, beta: number, ReD: number): string[] {
  const out: string[] = [];
  if (kind === 'venturi') {
    if (beta < 0.4 || beta > 0.75) out.push('β fuera de 0,4 a 0,75');
    if (ReD < 2e5) out.push('Re menor que 2·10⁵: C real algo menor');
    if (D < 0.05 || D > 0.25) out.push('D fuera de 50 a 250 mm');
  } else {
    if (beta < 0.1 || beta > 0.75) out.push('β fuera de 0,1 a 0,75');
    if (ReD < (beta <= 0.56 ? 5000 : 16000 * beta * beta)) out.push('Re por debajo del mínimo');
    if (D < 0.07112) out.push('D menor que 71,12 mm (falta la corrección de tubo pequeño)');
  }
  return out;
}

// Aguas subterráneas para la sala «Aguas subterráneas»: ley de Darcy y permeámetros, pozos (Thiem, Theis y
// Cooper-Jacob), transporte de un contaminante (Ogata-Banks y partículas con caminata aleatoria) y la zona de captura
// de un pozo en un flujo regional. Funciones puras, sin interfaz.

export type Soil = 'grava' | 'arena' | 'arenafina' | 'limo' | 'arcilla';

/** Conductividad hidráulica K (m/día) y porosidad eficaz típicas (Freeze y Cherry, 1979, tabla 2.2; Fetter, 2001). */
export const SOILS: Record<Soil, { name: string; K: number; ne: number }> = {
  grava: { name: 'Grava', K: 300, ne: 0.25 },
  arena: { name: 'Arena gruesa', K: 30, ne: 0.28 },
  arenafina: { name: 'Arena fina', K: 3, ne: 0.25 },
  limo: { name: 'Limo', K: 0.1, ne: 0.15 },
  arcilla: { name: 'Arcilla', K: 1e-4, ne: 0.05 },
};

/** Darcy: caudal (m³/día), descarga específica q (m/día) y velocidad media del agua en los poros v = q/ne (m/día). */
export function darcy(K: number, i: number, A: number, ne: number): { Q: number; q: number; v: number } {
  const q = K * i;
  return { Q: q * A, q, v: q / ne };
}

/** Permeámetro de carga constante: K = Q·L/(A·Δh). */
export const permConstant = (Q: number, L: number, A: number, dh: number) => (Q * L) / (A * dh);

/** Permeámetro de carga variable: K = (a·L/(A·t))·ln(h0/h1). */
export const permFalling = (a: number, L: number, A: number, t: number, h0: number, h1: number) => ((a * L) / (A * t)) * Math.log(h0 / h1);

// ------------------------------------------------------------------ pozos

const EULER = 0.5772156649015329;

/** Función de pozo de Theis W(u) = E1(u): serie para u ≤ 1 y fracción continua para u > 1. */
export function wellW(u: number): number {
  if (!(u > 0)) return Infinity;
  if (u <= 1) {
    let sum = 0, term = 1;
    for (let n = 1; n < 200; n++) {
      term *= -u / n;
      const add = -term / n;
      sum += add;
      if (Math.abs(add) < 1e-16 * Math.abs(sum)) break;
    }
    return -EULER - Math.log(u) + sum;
  }
  // E1(u) = e^−u · 1/(u + 1/(1 + 1/(u + 2/(1 + 2/(u + …))))) evaluada de atrás hacia adelante
  let f = 0;
  for (let k = 60; k >= 1; k--) f = k / (1 + k / (u + f));
  return Math.exp(-u) / (u + f);
}

/** Abatimiento de Theis (m): s = Q/(4πT)·W(u), u = r²S/(4Tt). Q en m³/día, T en m²/día, t en días. */
export function theis(Q: number, T: number, S: number, r: number, t: number): number {
  if (t <= 0) return 0;
  return (Q / (4 * Math.PI * T)) * wellW((r * r * S) / (4 * T * t));
}

/** Aproximación de Cooper y Jacob (vale con u < 0,01 aproximadamente): s = 2,30·Q/(4πT)·log10(2,25·T·t/(r²S)). */
export function cooperJacob(Q: number, T: number, S: number, r: number, t: number): number {
  return ((2.302585 * Q) / (4 * Math.PI * T)) * Math.log10((2.25 * T * t) / (r * r * S));
}

/** Thiem (régimen permanente en un acuífero confinado): s(r) = Q/(2πT)·ln(R/r). */
export const thiem = (Q: number, T: number, R: number, r: number) => (Q / (2 * Math.PI * T)) * Math.log(R / r);

/** Radio de influencia de Cooper-Jacob: donde la recta corta s = 0, R = √(2,25·T·t/S). */
export const radiusOfInfluence = (T: number, S: number, t: number) => Math.sqrt((2.25 * T * t) / S);

/**
 * Ajuste de Cooper-Jacob a una prueba de bombeo: recta s = a + b·log10(t) por mínimos cuadrados con los puntos de
 * u < 0,05 (o la mitad final si no se sabe); Δs = b por ciclo, t0 donde s = 0. T = 2,30·Q/(4π·Δs), S = 2,25·T·t0/r².
 */
export function fitCooperJacob(pts: { t: number; s: number }[], Q: number, r: number): { T: number; S: number; ds: number; t0: number; used: number } | null {
  const ok = pts.filter((p) => p.t > 0 && Number.isFinite(p.s)).sort((a, b) => a.t - b.t);
  if (ok.length < 3) return null;
  const use = ok.slice(Math.floor(ok.length / 2));
  const xs = use.map((p) => Math.log10(p.t)), ys = use.map((p) => p.s);
  const mx = xs.reduce((a, x) => a + x, 0) / xs.length, my = ys.reduce((a, y) => a + y, 0) / ys.length;
  let sxx = 0, sxy = 0;
  xs.forEach((x, k) => {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (ys[k] - my);
  });
  if (sxx <= 0) return null;
  const b = sxy / sxx, a = my - b * mx;
  if (b <= 0) return null;
  const t0 = Math.pow(10, -a / b);
  const T = (2.302585 * Q) / (4 * Math.PI * b);
  return { T, S: (2.25 * T * t0) / (r * r), ds: b, t0, used: use.length };
}

// ------------------------------------------------------------------ transporte

/** Función de error complementaria (Abramowitz y Stegun 7.1.26 mejorada con la fracción de Chebyshev de Numerical Recipes). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

/** Ogata y Banks (1961): concentración relativa C/C0 a la distancia x y el tiempo t con fuente continua en x = 0. */
export function ogataBanks(x: number, t: number, v: number, D: number): number {
  if (t <= 0) return 0;
  const s = 2 * Math.sqrt(D * t);
  const a = erfc((x - v * t) / s);
  const ex = (v * x) / D;
  // el segundo término es despreciable cuando el exponente es grande (y numéricamente peligroso)
  const b = ex < 600 ? Math.exp(ex) * erfc((x + v * t) / s) : 0;
  return Math.min(1, Math.max(0, 0.5 * (a + (Number.isFinite(b) ? b : 0))));
}

/**
 * Lo mismo con una entrada de flujo (tercera clase) en x = 0 en vez de concentración fija (van Genuchten y Alves, 1982):
 * conserva la masa que entra, v·C0 por unidad de área.
 */
export function ogataBanksFlux(x: number, t: number, v: number, D: number): number {
  if (t <= 0) return 0;
  const s = 2 * Math.sqrt(D * t);
  const ex = (v * x) / D;
  const a = 0.5 * erfc((x - v * t) / s) + Math.sqrt((v * v * t) / (Math.PI * D)) * Math.exp(-((x - v * t) ** 2) / (4 * D * t));
  const b = ex < 600 ? 0.5 * (1 + ex + (v * v * t) / D) * Math.exp(ex) * erfc((x + v * t) / s) : 0;
  return Math.min(1, Math.max(0, a - (Number.isFinite(b) ? b : 0)));
}

/**
 * Zona de captura de un pozo en el origen con un flujo regional hacia +x (Todd, 1980): el punto de estancamiento queda
 * aguas abajo, a Q/(2π·b·q); lejos aguas arriba, la zona tiene un ancho Q/(b·q). El borde es x = |y|/tan(2π·|y|/ancho):
 * el agua que pasa por |y| < ancho/2 y a la izquierda del borde termina en el pozo.
 */
export function captureZone(Q: number, b: number, q: number): { xs: number; width: number; boundary: (y: number) => number } {
  const width = Q / (b * q);
  return {
    xs: width / (2 * Math.PI),
    width,
    boundary: (y: number) => {
      const a = Math.abs(y), th = (2 * Math.PI * a) / width;
      return th < 1e-9 ? width / (2 * Math.PI) : th >= Math.PI ? -Infinity : a / Math.tan(th);
    },
  };
}

/** Generador con semilla y normal estándar (Box-Muller). */
export function rand(seed: number): { u: () => number; n: () => number } {
  let x = Math.floor(Math.abs(seed)) % 2147483647 || 1;
  const u = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646 + 1e-12;
  return { u, n: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) };
}

export interface FlowField {
  /** Velocidad regional en los poros (m/día, hacia +x). */
  v: number;
  /** Pozo: posición (m), caudal (m³/día), espesor (m) y porosidad eficaz. */
  well: { x: number; y: number; Q: number; b: number; ne: number } | null;
}

/** Velocidad en los poros (m/día) en (x, y): regional más la del pozo, que atrae el agua radialmente. */
export function velocity(f: FlowField, x: number, y: number): [number, number] {
  let vx = f.v, vy = 0;
  if (f.well && f.well.Q > 0) {
    const dx = x - f.well.x, dy = y - f.well.y;
    const r2 = Math.max(1, dx * dx + dy * dy);
    const k = f.well.Q / (2 * Math.PI * f.well.b * f.well.ne * r2);
    vx -= k * dx;
    vy -= k * dy;
  }
  return [vx, vy];
}

export interface Particle {
  x: number;
  y: number;
  /** Día en que llegó al pozo (o −1). */
  caught: number;
}

/**
 * Avanza partículas con advección (Runge-Kutta de segundo orden) y dispersión por caminata aleatoria:
 * Δ = √(2·αL·|v|·Δt) en la dirección del flujo y √(2·αT·|v|·Δt) transversal. Las que pasan a menos de rw del pozo quedan
 * capturadas.
 */
export function stepParticles(ps: Particle[], f: FlowField, aL: number, aT: number, dt: number, day: number, R: { n: () => number }, rw = 2): void {
  for (const p of ps) {
    if (p.caught >= 0) continue;
    const [u1, w1] = velocity(f, p.x, p.y);
    const [u2, w2] = velocity(f, p.x + u1 * dt * 0.5, p.y + w1 * dt * 0.5);
    const sp = Math.hypot(u2, w2) || 1e-12;
    const ex = u2 / sp, ey = w2 / sp;
    const dl = Math.sqrt(2 * aL * sp * dt) * R.n(), dtr = Math.sqrt(2 * aT * sp * dt) * R.n();
    p.x += u2 * dt + ex * dl - ey * dtr;
    p.y += w2 * dt + ey * dl + ex * dtr;
    if (f.well && Math.hypot(p.x - f.well.x, p.y - f.well.y) < rw) p.caught = day;
  }
}

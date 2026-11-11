// Hidráulica de canales: el cálculo de las cuatro partes del módulo. Todo en unidades del SI (m, s, m³/s).
//
// Fuentes: Chow, V. T. (1959) Open-Channel Hydraulics (geometría, Manning y sus coeficientes, energía específica,
// flujo crítico, resalto, flujo gradualmente variado, velocidades permisibles de Fortier y Scobey); Henderson,
// F. M. (1966) Open Channel Flow (estrangulamiento en contracciones, compuerta con contracción 0,61); Peterka
// (1958, USBR, Monografía 25) y French (1985) para la longitud del resalto; Rehbock (1929) y Kindsvater y Shen
// (1959) para los vertederos de pared delgada; FHWA HDS-7 (2012) para el paso a presión bajo un puente.
// Son cálculos didácticos: no son diseños de ingeniería ni pronósticos.

export const G = 9.81;
/** Peso específico del agua (N/m³). */
export const GAMMA = 9810;

// ------------------------------------------------------------------ secciones

export type Shape = 'rect' | 'trap' | 'circ';

export interface Section {
  shape: Shape;
  /** Ancho del fondo (rectangular y trapecial), m. */
  b: number;
  /** Talud de las paredes, horizontal por cada 1 vertical (trapecial). */
  z: number;
  /** Diámetro (circular), m. */
  D: number;
  /** Altura de las paredes (o el diámetro en la circular), m. */
  H: number;
}

export interface Geom {
  /** Área mojada (m²). */
  A: number;
  /** Perímetro mojado (m). */
  P: number;
  /** Ancho de la superficie (m). */
  T: number;
  /** Radio hidráulico A/P (m). */
  R: number;
  /** Profundidad hidráulica A/T (m). */
  Dh: number;
  /** Momento estático del área respecto a la superficie, A·ȳ (m³). */
  Ay: number;
}

/**
 * Geometría de la sección con el agua a la profundidad y. En las secciones abiertas, si y supera las paredes se
 * calcula como si siguieran hacia arriba (así se sabe cuánto falta); el desborde se revisa aparte.
 */
export function geom(s: Section, y: number): Geom {
  const yy = Math.max(y, 1e-9);
  if (s.shape === 'circ') {
    const h = Math.min(yy, s.D * (1 - 1e-9));
    const th = 2 * Math.acos(1 - (2 * h) / s.D);
    const A = ((s.D * s.D) / 8) * (th - Math.sin(th));
    const P = (s.D * th) / 2;
    const T = Math.max(1e-9, s.D * Math.sin(th / 2));
    // centroide del segmento circular medido desde el centro: 4 r sin³(θ/2) / (3 (θ − sin θ))
    const r = s.D / 2;
    const yc = (4 * r * Math.sin(th / 2) ** 3) / (3 * (th - Math.sin(th)));
    const depthC = h - (r - yc);
    return { A, P, T, R: A / P, Dh: A / T, Ay: A * Math.max(0, depthC) };
  }
  const z = s.shape === 'trap' ? s.z : 0;
  const A = (s.b + z * yy) * yy;
  const P = s.b + 2 * yy * Math.sqrt(1 + z * z);
  const T = s.b + 2 * z * yy;
  return { A, P, T, R: A / P, Dh: A / T, Ay: (s.b * yy * yy) / 2 + (z * yy * yy * yy) / 3 };
}

/** Caudal de Manning a la profundidad y: Q = A R^(2/3) S^(1/2) / n. */
export function manningQ(s: Section, n: number, S: number, y: number): number {
  const g = geom(s, y);
  return (g.A * Math.pow(g.R, 2 / 3) * Math.sqrt(Math.max(S, 0))) / n;
}

/** Profundidad a la que el caudal de Manning es máximo en un tubo circular (≈ 0,938 D). */
export function circMaxDepth(D: number): number {
  let lo = 0.8 * D, hi = 0.999 * D;
  const s: Section = { shape: 'circ', b: 0, z: 0, D, H: D };
  for (let k = 0; k < 80; k++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (manningQ(s, 1, 1, a) < manningQ(s, 1, 1, b)) lo = a;
    else hi = b;
  }
  return (lo + hi) / 2;
}

function bisect(f: (y: number) => number, lo: number, hi: number, it = 100): number {
  let flo = f(lo);
  for (let k = 0; k < it; k++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm === 0) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

/**
 * Profundidad normal (flujo uniforme). En el tubo circular, si el caudal supera el máximo con superficie libre,
 * devuelve NaN (el tubo trabajaría a presión).
 */
export function normalDepth(s: Section, n: number, S: number, Q: number): number {
  if (Q <= 0 || S <= 0) return NaN;
  if (s.shape === 'circ') {
    const ym = circMaxDepth(s.D);
    if (Q > manningQ(s, n, S, ym)) return NaN;
    return bisect((y) => manningQ(s, n, S, y) - Q, 1e-6, ym);
  }
  let hi = 1;
  while (manningQ(s, n, S, hi) < Q && hi < 1e4) hi *= 2;
  return bisect((y) => manningQ(s, n, S, y) - Q, 1e-6, hi);
}

/** Profundidad crítica: Q² T / (g A³) = 1. */
export function criticalDepth(s: Section, Q: number): number {
  if (Q <= 0) return 0;
  const f = (y: number) => {
    const g = geom(s, y);
    return (Q * Q * g.T) / (G * g.A ** 3) - 1;
  };
  if (s.shape === 'circ') return bisect(f, 1e-6, 0.9999 * s.D);
  let hi = 1;
  while (f(hi) > 0 && hi < 1e4) hi *= 2;
  return bisect(f, 1e-6, hi);
}

export function velocity(s: Section, Q: number, y: number): number {
  return Q / geom(s, y).A;
}

/** Número de Froude V / √(g D), con D = A/T. */
export function froude(s: Section, Q: number, y: number): number {
  const g = geom(s, y);
  return Q / g.A / Math.sqrt(G * g.Dh);
}

/** Energía específica E = y + V² / 2g (m). */
export function specificEnergy(s: Section, Q: number, y: number): number {
  const A = geom(s, y).A;
  return y + (Q * Q) / (2 * G * A * A);
}

/** Función de momento (fuerza específica) M = Q²/(gA) + A·ȳ (m³). */
export function momentum(s: Section, Q: number, y: number): number {
  const g = geom(s, y);
  return (Q * Q) / (G * g.A) + g.Ay;
}

/** Profundidades alternas para una energía E: la subcrítica (lenta) y la supercrítica (rápida). */
export function alternateDepths(s: Section, Q: number, E: number): { sub: number; sup: number } | null {
  const yc = criticalDepth(s, Q);
  if (E < specificEnergy(s, Q, yc) - 1e-12) return null;
  const f = (y: number) => specificEnergy(s, Q, y) - E;
  const sup = bisect(f, 1e-6, yc);
  const sub = bisect(f, yc, Math.max(E, yc) + 1e-6);
  return { sub, sup };
}

/** Profundidad conjugada del resalto (misma fuerza específica, al otro lado de la crítica). */
export function conjugateDepth(s: Section, Q: number, y: number): number {
  const yc = criticalDepth(s, Q);
  const M = momentum(s, Q, y);
  const f = (x: number) => momentum(s, Q, x) - M;
  if (y < yc) {
    let hi = yc * 2;
    while (f(hi) < 0 && hi < 1e4) hi *= 2;
    return bisect(f, yc, hi);
  }
  return bisect(f, 1e-6, yc);
}

/** Resalto en canal rectangular: ecuación de Bélanger. */
export function belanger(y1: number, F1: number): number {
  return (y1 / 2) * (Math.sqrt(1 + 8 * F1 * F1) - 1);
}

export type JumpKind = 'ondular' | 'debil' | 'oscilante' | 'estable' | 'fuerte';

/** Clasificación del resalto por el Froude de llegada (USBR, en Chow 1959). */
export function jumpKind(F1: number): JumpKind {
  if (F1 < 1.7) return 'ondular';
  if (F1 < 2.5) return 'debil';
  if (F1 < 4.5) return 'oscilante';
  if (F1 < 9) return 'estable';
  return 'fuerte';
}

export const JUMP_NAME: Record<JumpKind, string> = {
  ondular: 'ondular',
  debil: 'débil',
  oscilante: 'oscilante',
  estable: 'estable',
  fuerte: 'fuerte',
};

/** Longitud del resalto: 6,9 (y2 − y1) (Smetana; en French 1985). */
export function jumpLength(y1: number, y2: number): number {
  return 6.9 * (y2 - y1);
}

/** Pendiente de fricción de Manning: Sf = n² V² / R^(4/3). */
export function frictionSlope(s: Section, n: number, Q: number, y: number): number {
  const g = geom(s, y);
  const V = Q / g.A;
  return (n * n * V * V) / Math.pow(g.R, 4 / 3);
}

export interface ProfilePoint {
  /** Distancia desde el punto de partida (m); negativa = aguas arriba. */
  x: number;
  y: number;
}

/**
 * Flujo gradualmente variado por el método del paso directo (Chow 1959, cap. 10): Δx = ΔE / (S0 − S̄f), con la
 * pendiente de fricción media del tramo. Va de y0 a y1 en `steps` pasos iguales de profundidad.
 */
export function directStep(s: Section, n: number, S0: number, Q: number, y0: number, y1: number, steps = 80): ProfilePoint[] {
  const out: ProfilePoint[] = [{ x: 0, y: y0 }];
  let x = 0;
  for (let k = 1; k <= steps; k++) {
    const ya = y0 + ((y1 - y0) * (k - 1)) / steps;
    const yb = y0 + ((y1 - y0) * k) / steps;
    const dE = specificEnergy(s, Q, yb) - specificEnergy(s, Q, ya);
    const sf = (frictionSlope(s, n, Q, ya) + frictionSlope(s, n, Q, yb)) / 2;
    const den = S0 - sf;
    if (Math.abs(den) < 1e-12) break;
    x += dE / den;
    out.push({ x, y: yb });
  }
  return out;
}

/** Profundidad de un perfil en la distancia x (interpolación lineal; fuera del perfil, su extremo). */
export function depthAt(p: ProfilePoint[], x: number): number {
  if (!p.length) return NaN;
  const asc = p[p.length - 1].x >= p[0].x;
  const q = asc ? p : [...p].reverse();
  if (x <= q[0].x) return q[0].y;
  if (x >= q[q.length - 1].x) return q[q.length - 1].y;
  for (let k = 1; k < q.length; k++) {
    if (x <= q[k].x) {
      const t = (x - q[k - 1].x) / Math.max(1e-12, q[k].x - q[k - 1].x);
      return q[k - 1].y + t * (q[k].y - q[k - 1].y);
    }
  }
  return q[q.length - 1].y;
}

// ------------------------------------------------------------------ parte 1: el canal y su caudal

export type Material = 'concreto' | 'piedra' | 'tierra' | 'pasto' | 'cantos';

export const MATERIALS: Record<Material, { name: string; n: number; vmax: number | null; note: string }> = {
  // n: valor «normal» de la tabla de Chow (1959, tabla 5-6). vmax: velocidad máxima permisible con agua limpia de
  // Fortier y Scobey (1926), de la misma obra (tabla 7-3), salvo el pasto (Servicio de Conservación de Suelos de
  // EE. UU., pasto bermuda en suelo resistente con pendiente de 0 a 5 %, tabla 7-6).
  concreto: { name: 'Concreto', n: 0.013, vmax: null, note: 'concreto con acabado de llana; resiste velocidades altas' },
  piedra: { name: 'Piedra pegada', n: 0.025, vmax: null, note: 'mampostería de piedra con mortero' },
  tierra: { name: 'Tierra', n: 0.022, vmax: 0.76, note: 'tierra firme (franco), recta y limpia' },
  pasto: { name: 'Pasto', n: 0.027, vmax: 1.8, note: 'tierra con pasto corto y poca maleza' },
  cantos: { name: 'Cantos rodados', n: 0.04, vmax: 1.52, note: 'lecho de grava gruesa y cantos' },
};

/** Velocidad media por debajo de la cual se depositan arena y limo (Chow 1959: 0,6 a 0,9 m/s con poco limo). */
export const VMIN = 0.6;
/** Borde libre: al menos el 20 % de la profundidad (regla del juego; Chow cita entre 5 y 30 %), y 0,1 m. */
export const FREEBOARD_FRAC = 0.2;
export const FREEBOARD_MIN = 0.1;
/** En el tubo, el agua no debe pasar de 85 % del diámetro (regla del juego). */
export const PIPE_FILL = 0.85;
/** Flujo cerca del crítico: la superficie se vuelve inestable (regla del juego con el criterio de Chow). */
export const NEAR_CRITICAL: [number, number] = [0.8, 1.2];

export const SHAPES: Record<Shape, Section> = {
  rect: { shape: 'rect', b: 2, z: 0, D: 0, H: 1.5 },
  trap: { shape: 'trap', b: 1.5, z: 1.5, D: 0, H: 1.5 },
  circ: { shape: 'circ', b: 0, z: 0, D: 1.5, H: 1.5 },
};

export interface UniformInput {
  shape: Shape;
  material: Material;
  /** Pendiente del fondo (m/m). */
  S: number;
  /** Caudal (m³/s). */
  Q: number;
}

export const DEFAULT_UNIFORM: UniformInput = { shape: 'trap', material: 'concreto', S: 0.001, Q: 3 };

export function sanitizeUniform(p: Partial<UniformInput>): UniformInput {
  const d = DEFAULT_UNIFORM;
  const shape = p.shape && p.shape in SHAPES ? p.shape : d.shape;
  let material = p.material && p.material in MATERIALS ? p.material : d.material;
  if (shape === 'circ') material = 'concreto';
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  return { shape, material, S: num(p.S, 0.0002, 0.08, d.S), Q: num(p.Q, 0.05, 25, d.Q) };
}

export interface UniformResult {
  sec: Section;
  n: number;
  /** Profundidad normal (NaN si el tubo trabaja a presión). */
  yn: number;
  yc: number;
  A: number;
  P: number;
  R: number;
  T: number;
  V: number;
  F: number;
  /** Esfuerzo cortante medio en el fondo γ R S (Pa). */
  tau: number;
  /** Caudal que cabe con el borde libre exigido. */
  Qcap: number;
  /** Caudal que cabe hasta el borde (o el máximo del tubo). */
  Qbrim: number;
  /** Caudal del tubo lleno (solo circular). */
  Qfull: number;
  regime: 'subcritico' | 'supercritico' | 'critico';
  overflow: boolean;
  freeboardOk: boolean;
  erosion: boolean;
  sediment: boolean;
  unstable: boolean;
  /** Fracción del tubo o de la pared ocupada por el agua. */
  fill: number;
  ok: boolean;
}

export function uniformModel(inp0: Partial<UniformInput>): UniformResult {
  const inp = sanitizeUniform(inp0);
  const sec = SHAPES[inp.shape];
  const mat = MATERIALS[inp.material];
  const n = mat.n;
  const yn = normalDepth(sec, n, inp.S, inp.Q);
  const yc = criticalDepth(sec, inp.Q);
  const isPipe = sec.shape === 'circ';
  const ymax = isPipe ? circMaxDepth(sec.D) : sec.H;
  const Qbrim = manningQ(sec, n, inp.S, ymax);
  const Qfull = isPipe ? (Math.PI * sec.D * sec.D) / 4 * Math.pow(sec.D / 4, 2 / 3) * Math.sqrt(inp.S) / n : Qbrim;
  // borde libre: la profundidad más alta permitida
  const yAllow = isPipe ? PIPE_FILL * sec.D : sec.H / (1 + FREEBOARD_FRAC);
  const yAllow2 = isPipe ? yAllow : Math.min(yAllow, sec.H - FREEBOARD_MIN);
  const Qcap = manningQ(sec, n, inp.S, yAllow2);
  const pressure = Number.isNaN(yn);
  const y = pressure ? ymax : yn;
  const g = geom(sec, y);
  const V = inp.Q / g.A;
  const F = froude(sec, inp.Q, y);
  const overflow = pressure || (!isPipe && yn > sec.H);
  const freeboardOk = !overflow && y <= yAllow2 + 1e-9;
  const erosion = mat.vmax !== null && V > mat.vmax;
  const sediment = V < VMIN;
  const unstable = F > NEAR_CRITICAL[0] && F < NEAR_CRITICAL[1];
  const regime = Math.abs(F - 1) < 0.02 ? 'critico' : F < 1 ? 'subcritico' : 'supercritico';
  return {
    sec,
    n,
    yn,
    yc,
    A: g.A,
    P: g.P,
    R: g.R,
    T: g.T,
    V,
    F,
    tau: GAMMA * g.R * inp.S,
    Qcap,
    Qbrim,
    Qfull,
    regime,
    overflow,
    freeboardOk,
    erosion,
    sediment,
    unstable,
    fill: y / (isPipe ? sec.D : sec.H),
    ok: freeboardOk && !erosion && !sediment && !unstable,
  };
}

// ------------------------------------------------------------------ parte 2: la caída y el resalto

export interface JumpInput {
  /** Caudal (m³/s). */
  Q: number;
  /** Altura de la caída: del fondo del canal de arriba al piso del pozo (m). */
  drop: number;
  /** Altura del vertedero al final del pozo (m). */
  weir: number;
  /** Largo del pozo (m). */
  basin: number;
}

/** Ancho de la rápida y del pozo (m), pendiente de la rápida y n del concreto. */
export const CHUTE = { b: 4, S: 0.25, n: 0.014 };
/** Coeficiente del vertedero de cresta ancha: (2/3)^(3/2) √g ≈ 1,70 (SI). */
export const BROAD_C = Math.pow(2 / 3, 1.5) * Math.sqrt(G);

export const DEFAULT_JUMP: JumpInput = { Q: 12, drop: 6, weir: 0.8, basin: 16 };

export function sanitizeJump(p: Partial<JumpInput>): JumpInput {
  const d = DEFAULT_JUMP;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  return { Q: num(p.Q, 2, 30, d.Q), drop: num(p.drop, 2, 12, d.drop), weir: num(p.weir, 0, 4, d.weir), basin: num(p.basin, 6, 40, d.basin) };
}

export type JumpPlace = 'pie' | 'pozo' | 'barrido' | 'ahogado';

export interface JumpResult {
  inp: JumpInput;
  q: number;
  yc: number;
  /** Energía de llegada (sobre el piso del pozo) en la cresta: caída + 1,5 yc (m). */
  E0: number;
  /** Perfil del agua en la rápida (x horizontal desde la cresta). */
  chute: ProfilePoint[];
  chuteLen: number;
  /** Profundidad y velocidad al pie de la rápida. */
  y1: number;
  V1: number;
  F1: number;
  /** Profundidad conjugada de y1 (Bélanger). */
  y2: number;
  /** Profundidad en el pozo que impone el vertedero. */
  ytw: number;
  /** Carga sobre el vertedero. */
  Hw: number;
  /** Dónde empieza el resalto, medido desde el pie de la rápida (m). */
  xJump: number;
  /** Profundidad justo antes del resalto (si corre por el pozo, es mayor que y1). */
  yA: number;
  FA: number;
  Lj: number;
  kind: JumpKind;
  place: JumpPlace;
  contained: boolean;
  /** Perfil supercrítico sobre el piso del pozo antes del resalto (x desde el pie). */
  floor: ProfilePoint[];
  /** Energía perdida en el resalto (m) y fracción de la energía de llegada que se disipa en toda la estructura. */
  dEjump: number;
  dissipated: number;
  /** Velocidad que sigue aguas abajo, sobre el vertedero. */
  Vout: number;
}

export function jumpModel(inp0: Partial<JumpInput>): JumpResult {
  const inp = sanitizeJump(inp0);
  const sec: Section = { shape: 'rect', b: CHUTE.b, z: 0, D: 0, H: 99 };
  const q = inp.Q / CHUTE.b;
  const yc = Math.cbrt((q * q) / G);
  const E0 = inp.drop + 1.5 * yc;
  const chuteLen = inp.drop / CHUTE.S;
  // la rápida: de la profundidad crítica en la cresta hacia la normal, perfil S2
  const ynCh = normalDepth(sec, CHUTE.n, CHUTE.S, inp.Q);
  const p = directStep(sec, CHUTE.n, CHUTE.S, inp.Q, yc * 0.999, ynCh * 1.001, 160);
  // si la rápida es más larga que el perfil, el agua llega a la profundidad normal y sigue con ella
  const y1 = p[p.length - 1].x <= chuteLen ? p[p.length - 1].y : depthAt(p, chuteLen);
  const chute = [...p.filter((pt) => pt.x < chuteLen), { x: chuteLen, y: y1 }];
  const V1 = q / y1;
  const F1 = V1 / Math.sqrt(G * y1);
  const y2 = belanger(y1, F1);
  // el vertedero de cresta ancha al final del pozo fija la profundidad del pozo
  const Hw = Math.pow(inp.Q / (BROAD_C * CHUTE.b), 2 / 3);
  const ytw = inp.weir + Hw;
  let xJump = 0, yA = y1, place: JumpPlace;
  let floor: ProfilePoint[] = [{ x: 0, y: y1 }];
  if (ytw >= y2) {
    place = ytw > y2 * 1.1 ? 'ahogado' : 'pie';
  } else {
    // corre rápido por el piso horizontal (perfil H3) hasta que su conjugada iguala la profundidad del pozo
    const target = bisect((y) => belanger(y, q / y / Math.sqrt(G * y)) - ytw, y1, yc * 0.999);
    floor = directStep(sec, CHUTE.n, 0, inp.Q, y1, target, 80);
    xJump = floor[floor.length - 1].x;
    yA = target;
    place = 'pozo';
  }
  const FA = q / yA / Math.sqrt(G * yA);
  const yB = place === 'ahogado' ? ytw : belanger(yA, FA);
  const Lj = jumpLength(yA, yB);
  const contained = xJump + Lj <= inp.basin;
  if (place === 'pozo' && xJump > inp.basin) place = 'barrido';
  const dEjump = specificEnergy(sec, inp.Q, yA) - specificEnergy(sec, inp.Q, yB);
  const Etw = specificEnergy(sec, inp.Q, ytw);
  return {
    inp,
    q,
    yc,
    E0,
    chute,
    chuteLen,
    y1,
    V1,
    F1,
    y2,
    ytw,
    Hw,
    xJump,
    yA,
    FA,
    Lj,
    kind: jumpKind(FA),
    place,
    contained: place !== 'barrido' && contained,
    floor,
    dEjump: Math.max(0, dEjump),
    dissipated: Math.max(0, Math.min(1, (E0 - Etw) / E0)),
    Vout: q / ytw,
  };
}

// ------------------------------------------------------------------ parte 3: el puente y el remanso

export type Debris = 'limpio' | 'palos' | 'tapado';

export const DEBRIS: Record<Debris, { name: string; block: number }> = {
  limpio: { name: 'Limpio', block: 0 },
  palos: { name: 'Con palos', block: 0.3 },
  tapado: { name: 'Muy tapado', block: 0.6 },
};

export interface BridgeInput {
  Q: number;
  /** Pendiente del canal (m/m). */
  S: number;
  /** Luz del puente (ancho de la abertura), m. */
  span: number;
  /** Altura del bajo del puente sobre el fondo, m. */
  soffit: number;
  debris: Debris;
  /** Pilas en la abertura (0, 1 o 2), de punta y cola semicirculares y 0,6 m de ancho. */
  piers?: number;
}

/** La quebrada canalizada: rectangular de concreto lanzado, paredes de 3 m. */
export const CREEK = { b: 8, H: 3, n: 0.02, deck: 0.8 };
/** Coeficiente de descarga del paso a presión bajo el tablero (FHWA HDS-7, orden de 0,5). */
export const CD_PRESSURE = 0.5;
/** Coeficiente de vertedero del agua que pasa por encima del tablero (vía, FHWA: del orden de 1,5 en SI). */
export const CW_DECK = 1.5;

export const DEFAULT_BRIDGE: BridgeInput = { Q: 30, S: 0.003, span: 6, soffit: 2.2, debris: 'limpio', piers: 0 };
/** Ancho de cada pila (m) y su coeficiente de forma de Yarnell (punta y cola semicirculares). */
export const PIER_A = 0.6;
export const PIER_K = 0.9;

export function sanitizeBridge(p: Partial<BridgeInput>): BridgeInput {
  const d = DEFAULT_BRIDGE;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  return {
    Q: num(p.Q, 5, 90, d.Q),
    S: num(p.S, 0.001, 0.02, d.S),
    span: num(p.span, 3, CREEK.b, d.span),
    soffit: num(p.soffit, 1.2, 4, d.soffit),
    debris: p.debris && p.debris in DEBRIS ? p.debris : d.debris,
    piers: Math.round(num(p.piers, 0, 2, 0)),
  };
}

export type BridgeFlow = 'libre' | 'estrangulado' | 'presion' | 'encima';

export interface BridgeResult {
  inp: BridgeInput;
  sec: Section;
  yn: number;
  yc: number;
  Fn: number;
  steep: boolean;
  /** Ancho efectivo de la abertura (descontando lo tapado). */
  bEff: number;
  /** Energía crítica en la abertura. */
  Ecp: number;
  /** Profundidad del agua justo aguas arriba del puente. */
  yU: number;
  flow: BridgeFlow;
  /** Cuánto sube el agua sobre la normal en el puente (m). */
  rise: number;
  /** Perfil aguas arriba (x negativas, en m, desde el puente). */
  profile: ProfilePoint[];
  /** Largo del remanso: hasta donde el agua está 1 % sobre la normal (m). */
  backwater: number;
  /** Tramo donde el agua sale del canal: [desde, hasta] en x (m) o null. */
  spill: [number, number] | null;
  /** Resalto aguas arriba (canal de pendiente fuerte estrangulado): x del resalto. */
  jumpX: number | null;
  /** Caudal que pasa por encima del tablero. */
  Qover: number;
  /** Capacidad del canal sin puente (m³/s). */
  Qcanal: number;
}

/** Caudal que pasa por el puente con el agua a la profundidad y aguas arriba (paso a presión + sobre el tablero). */
function bridgeQ(y: number, bEff: number, soffit: number, deckTop: number, B: number): { Qp: number; Qo: number } {
  const Qp = y > soffit / 2 ? CD_PRESSURE * bEff * soffit * Math.sqrt(2 * G * (y - soffit / 2)) : 0;
  const Qo = y > deckTop ? CW_DECK * B * Math.pow(y - deckTop, 1.5) : 0;
  return { Qp, Qo };
}

export function bridgeModel(inp0: Partial<BridgeInput>): BridgeResult {
  const inp = sanitizeBridge(inp0);
  const sec: Section = { shape: 'rect', b: CREEK.b, z: 0, D: 0, H: CREEK.H };
  const yn = normalDepth(sec, CREEK.n, inp.S, inp.Q);
  const yc = criticalDepth(sec, inp.Q);
  const Fn = froude(sec, inp.Q, yn);
  const steep = yn < yc;
  const np = inp.piers ?? 0;
  const bEff = Math.max(0.3, inp.span * (1 - DEBRIS[inp.debris].block) - np * PIER_A);
  const qp = inp.Q / bEff;
  const ycp = Math.cbrt((qp * qp) / G);
  const Ecp = 1.5 * ycp;
  const En = specificEnergy(sec, inp.Q, yn);
  const deckTop = inp.soffit + CREEK.deck;
  let flow: BridgeFlow = 'libre';
  let yU = yn;
  if (En < Ecp) {
    // no le alcanza la energía para pasar por la abertura: el agua se represa hasta tenerla (Henderson 1966)
    flow = 'estrangulado';
    yU = alternateDepths(sec, inp.Q, Ecp)?.sub ?? yn;
  } else if (np > 0 && !steep) {
    // sin estrangular, las pilas suben el agua (Yarnell, clase A): Δy = K·F²·(K + 5F² − 0,6)·(α + 15α⁴)·y
    const alpha = (np * PIER_A) / inp.span;
    const F2 = (Fn * Fn);
    yU = yn + PIER_K * F2 * (PIER_K + 5 * F2 - 0.6) * (alpha + 15 * alpha ** 4) * yn;
  }
  const touches = yU >= inp.soffit || (flow === 'estrangulado' && ycp >= inp.soffit);
  let Qover = 0;
  if (touches) {
    // a presión bajo el tablero y, si no alcanza, también por encima (HDS-7)
    const f = (y: number) => {
      const r = bridgeQ(y, bEff, inp.soffit, deckTop, CREEK.b);
      return r.Qp + r.Qo - inp.Q;
    };
    let hi = inp.soffit + 1;
    while (f(hi) < 0 && hi < 200) hi *= 1.5;
    const yP = bisect(f, inp.soffit / 2 + 1e-6, hi);
    yU = Math.max(yU, yP, inp.soffit);
    const r = bridgeQ(yU, bEff, inp.soffit, deckTop, CREEK.b);
    Qover = yU > deckTop ? Math.min(inp.Q, r.Qo) : 0;
    flow = yU > deckTop ? 'encima' : 'presion';
  }
  // perfil aguas arriba
  let profile: ProfilePoint[] = [{ x: 0, y: yU }];
  let backwater = 0;
  let jumpX: number | null = null;
  if (!steep && yU > yn * 1.01) {
    profile = directStep(sec, CREEK.n, inp.S, inp.Q, yU, yn * 1.01, 120);
    backwater = -profile[profile.length - 1].x;
  } else if (steep && yU > yc) {
    // canal rápido: el agua represada (perfil S1) termina en un resalto donde iguala la conjugada de la normal
    const y2n = conjugateDepth(sec, inp.Q, yn);
    if (yU > y2n) {
      profile = directStep(sec, CREEK.n, inp.S, inp.Q, yU, y2n, 120);
      jumpX = profile[profile.length - 1].x;
    } else {
      profile = [{ x: 0, y: yU }];
      jumpX = 0;
    }
    profile.push({ x: (jumpX ?? 0) - 0.01, y: yn });
    backwater = -(jumpX ?? 0);
  }
  // dónde sale del canal
  let spill: [number, number] | null = null;
  const over = profile.filter((p) => p.y > CREEK.H);
  if (over.length) spill = [Math.min(...over.map((p) => p.x)), 0];
  const Qcanal = manningQ(sec, CREEK.n, inp.S, CREEK.H);
  return { inp, sec, yn, yc, Fn, steep, bEff, Ecp, yU, flow, rise: yU - yn, profile, backwater, spill, jumpX, Qover, Qcanal };
}

// ------------------------------------------------------------------ parte 4: medir el caudal

export type Device = 'rect' | 'tri' | 'gate';

/** Canal de laboratorio: 0,30 m de ancho y 0,45 m de alto; vertedero rectangular de 0,15 m, triangular a 0,08 m. */
export const FLUME = { b: 0.3, H: 0.45, P: 0.15, Ptri: 0.08, Cc: 0.61, triCd: 0.58 };

export interface GaugeInput {
  device: Device;
  /** Caudal de la bomba (L/s). */
  Qls: number;
  /** Abertura de la compuerta (m). */
  gate: number;
}

export const DEFAULT_GAUGE: GaugeInput = { device: 'rect', Qls: 12, gate: 0.05 };

export function sanitizeGauge(p: Partial<GaugeInput>): GaugeInput {
  const d = DEFAULT_GAUGE;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  return { device: p.device === 'tri' || p.device === 'gate' || p.device === 'rect' ? p.device : d.device, Qls: num(p.Qls, 0.5, 25, d.Qls), gate: num(p.gate, 0.02, 0.12, d.gate) };
}

/** Vertedero rectangular sin contracciones (Rehbock): Q = (2/3) Cd b √(2g) H^1,5, Cd = 0,611 + 0,08 H/P. */
export function rectWeirQ(H: number, b = FLUME.b, P = FLUME.P): number {
  const Cd = 0.611 + (0.08 * H) / P;
  return (2 / 3) * Cd * b * Math.sqrt(2 * G) * Math.pow(Math.max(H, 0), 1.5);
}

/** Vertedero triangular de 90° (Kindsvater y Shen): Q = (8/15) Cd √(2g) tan(45°) H^2,5, Cd ≈ 0,58. */
export function triWeirQ(H: number): number {
  return (8 / 15) * FLUME.triCd * Math.sqrt(2 * G) * Math.pow(Math.max(H, 0), 2.5);
}

/** Compuerta con salida libre: energía igual antes y en la vena contraída (Cc = 0,61), Henderson (1966). */
export function gateUpstream(q: number, a: number): number {
  const y2 = FLUME.Cc * a;
  const E2 = y2 + (q * q) / (2 * G * y2 * y2);
  const f = (y: number) => y + (q * q) / (2 * G * y * y) - E2;
  return bisect(f, Math.max(y2, Math.cbrt((q * q) / G)), Math.max(E2, 0.001) + 1e-6);
}

export interface GaugeResult {
  inp: GaugeInput;
  Q: number;
  /** Carga sobre la cresta o el vértice (m) o profundidad aguas arriba de la compuerta. */
  H: number;
  /** Profundidad del agua aguas arriba (sobre el fondo del canal). */
  yUp: number;
  /** Velocidad media en la sección de aforo, aguas arriba. */
  Vup: number;
  /** Coeficiente de descarga de la compuerta (solo compuerta). */
  Cd: number | null;
  /** Profundidad en la vena contraída (compuerta). */
  yVena: number | null;
  overflow: boolean;
  /** Carga muy baja: la lámina se pega a la placa y la ecuación deja de valer (3 cm rectangular, 6 cm triangular). */
  thin: boolean;
  /** La compuerta queda por encima del agua y no controla nada (abertura mayor que la crítica / 0,61). */
  gateFree: boolean;
}

export function gaugeModel(inp0: Partial<GaugeInput>): GaugeResult {
  const inp = sanitizeGauge(inp0);
  const Q = inp.Qls / 1000;
  let H: number, yUp: number, Cd: number | null = null, yVena: number | null = null, gateFree = false;
  if (inp.device === 'rect') {
    H = bisect((h) => rectWeirQ(h) - Q, 1e-6, 1);
    yUp = FLUME.P + H;
  } else if (inp.device === 'tri') {
    H = Math.pow(Q / triWeirQ(1), 0.4);
    yUp = FLUME.Ptri + H;
  } else {
    const q = Q / FLUME.b;
    const yc = Math.cbrt((q * q) / G);
    if (FLUME.Cc * inp.gate >= yc) {
      // el agua pasa por debajo sin tocar la compuerta: la controla la caída libre al final del canal
      gateFree = true;
      yUp = yc;
    } else {
      yUp = gateUpstream(q, inp.gate);
      Cd = Q / (inp.gate * FLUME.b * Math.sqrt(2 * G * yUp));
      yVena = FLUME.Cc * inp.gate;
    }
    H = yUp;
  }
  const thin = inp.device === 'rect' ? H < 0.03 : inp.device === 'tri' ? H < 0.06 : false;
  return { inp, Q, H, yUp, Vup: Q / (FLUME.b * yUp), Cd, yVena, overflow: yUp > FLUME.H, thin, gateFree };
}

/** Flotador: la velocidad media es cerca de 0,85 veces la de la superficie (USBR, Water Measurement Manual). */
export const FLOAT_K = 0.85;

/** Ajuste de una ley potencial Q = k H^m por mínimos cuadrados en logaritmos. */
export function powerFit(pts: { H: number; Q: number }[]): { k: number; m: number } | null {
  const P = pts.filter((p) => p.H > 0 && p.Q > 0);
  if (P.length < 2) return null;
  const X = P.map((p) => Math.log(p.H)), Y = P.map((p) => Math.log(p.Q));
  const mx = X.reduce((a, b) => a + b, 0) / X.length, my = Y.reduce((a, b) => a + b, 0) / Y.length;
  let sxx = 0, sxy = 0;
  for (let k = 0; k < X.length; k++) {
    sxx += (X[k] - mx) ** 2;
    sxy += (X[k] - mx) * (Y[k] - my);
  }
  if (sxx < 1e-12) return null;
  const m = sxy / sxx;
  return { m, k: Math.exp(my - m * mx) };
}

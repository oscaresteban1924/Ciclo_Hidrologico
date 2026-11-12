// Hidráulica de tuberías a presión para la sala «Acueducto: el agua a presión»: propiedades del agua, materiales,
// factor de fricción (Colebrook-White y Swamee-Jain), pérdidas por fricción (Darcy-Weisbach y Hazen-Williams) y
// accesorios, y una conducción por gravedad desde un tanque con su línea de energía y su línea piezométrica.
// Funciones puras, sin interfaz.

export const G = 9.81;

/** Viscosidad cinemática del agua (m²/s) entre 0 y 40 °C (tabla interpolada; White, Fluid Mechanics, tabla A.1). */
const NU_T: [number, number][] = [
  [0, 1.792e-6],
  [5, 1.519e-6],
  [10, 1.307e-6],
  [15, 1.139e-6],
  [20, 1.004e-6],
  [25, 0.893e-6],
  [30, 0.801e-6],
  [40, 0.658e-6],
];

export function nuWater(T: number): number {
  const t = Math.min(40, Math.max(0, T));
  for (let k = 1; k < NU_T.length; k++) {
    const [t0, n0] = NU_T[k - 1], [t1, n1] = NU_T[k];
    if (t <= t1) return n0 + ((t - t0) / (t1 - t0)) * (n1 - n0);
  }
  return NU_T[NU_T.length - 1][1];
}

export type PipeMat = 'pvc' | 'pead' | 'hd' | 'acero' | 'galv' | 'concreto';

/**
 * Materiales: rugosidad absoluta ε (m), coeficiente de Hazen-Williams C de tubo nuevo y módulo de elasticidad E (Pa).
 * Valores típicos de Saldarriaga (2007), *Hidráulica de tuberías*, y de Chaudhry (2014), *Applied Hydraulic Transients*.
 */
export const PIPE_MATS: Record<PipeMat, { name: string; eps: number; C: number; E: number }> = {
  pvc: { name: 'PVC', eps: 1.5e-6, C: 150, E: 2.9e9 },
  pead: { name: 'Polietileno (PEAD)', eps: 7e-6, C: 150, E: 0.9e9 },
  hd: { name: 'Hierro dúctil con mortero', eps: 3e-5, C: 140, E: 169e9 },
  acero: { name: 'Acero', eps: 4.5e-5, C: 130, E: 207e9 },
  galv: { name: 'Hierro galvanizado', eps: 1.5e-4, C: 120, E: 200e9 },
  concreto: { name: 'Concreto', eps: 3e-4, C: 120, E: 30e9 },
};

/** Coeficientes de pérdida K de accesorios comunes (valores típicos; Crane, TP-410, y Saldarriaga, 2007). */
export const FITTINGS: Record<string, { name: string; K: number }> = {
  entrada: { name: 'Entrada desde el tanque (arista viva)', K: 0.5 },
  codo90: { name: 'Codo de 90°', K: 0.9 },
  codo45: { name: 'Codo de 45°', K: 0.4 },
  tee: { name: 'Tee, paso directo', K: 0.6 },
  compuerta: { name: 'Válvula de compuerta abierta', K: 0.2 },
  salida: { name: 'Salida a un tanque', K: 1 },
};

/** K de una válvula de compuerta según su apertura (fracción de 0 a 1; tabla típica, interpolada en el logaritmo). */
const GATE_K: [number, number][] = [
  [0.1, 200],
  [0.25, 24],
  [0.5, 5.6],
  [0.75, 1.15],
  [1, 0.2],
];
export function gateK(open: number): number {
  const o = Math.min(1, Math.max(0.1, open));
  for (let k = 1; k < GATE_K.length; k++) {
    const [a0, k0] = GATE_K[k - 1], [a1, k1] = GATE_K[k];
    if (o <= a1) return Math.exp(Math.log(k0) + ((o - a0) / (a1 - a0)) * (Math.log(k1) - Math.log(k0)));
  }
  return GATE_K[GATE_K.length - 1][1];
}

// ------------------------------------------------------------------ fricción

/** Swamee y Jain (1976): explícita, válida con 5000 ≤ Re ≤ 1e8 y 1e-6 ≤ ε/D ≤ 0,01. */
export function swameeJain(Re: number, rr: number): number {
  return 0.25 / Math.pow(Math.log10(rr / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2);
}

/** Colebrook-White resuelta por punto fijo sobre 1/√f (converge en pocas iteraciones). Devuelve f y las iteraciones. */
export function colebrook(Re: number, rr: number): { f: number; it: number[] } {
  let x = 1 / Math.sqrt(swameeJain(Math.max(Re, 4000), rr));
  const it: number[] = [1 / (x * x)];
  for (let k = 0; k < 60; k++) {
    const nx = -2 * Math.log10(rr / 3.7 + (2.51 * x) / Re);
    it.push(1 / (nx * nx));
    if (Math.abs(nx - x) < 1e-12) {
      x = nx;
      break;
    }
    x = nx;
  }
  return { f: 1 / (x * x), it };
}

/** Factor de fricción de Darcy: laminar 64/Re bajo 2000, Colebrook sobre 4000 y transición lineal entre ambos. */
export function frictionFactor(Re: number, rr: number): number {
  if (Re <= 0) return 0;
  if (Re < 2000) return 64 / Re;
  if (Re > 4000) return colebrook(Re, rr).f;
  const fl = 64 / 2000, ft = colebrook(4000, rr).f;
  return fl + ((Re - 2000) / 2000) * (ft - fl);
}

export const area = (D: number) => (Math.PI * D * D) / 4;

/** Pérdida por fricción con Darcy-Weisbach (m) y sus datos. */
export function darcy(Q: number, D: number, L: number, eps: number, nu: number): { hf: number; V: number; Re: number; f: number } {
  const V = Math.abs(Q) / area(D);
  const Re = (V * D) / nu;
  const f = frictionFactor(Re, eps / D);
  return { hf: (f * L * V * V) / (D * 2 * G), V, Re, f };
}

/** Pérdida por fricción con Hazen-Williams en el SI (m): hf = 10,67·L·Q^1,852/(C^1,852·D^4,87). */
export function hazenWilliams(Q: number, D: number, L: number, C: number): number {
  return (10.67 * L * Math.pow(Math.abs(Q), 1.852)) / (Math.pow(C, 1.852) * Math.pow(D, 4.8704));
}

// ------------------------------------------------------------------ conducción por gravedad

export type Method = 'darcy' | 'hw';

/** Un punto del perfil de la tubería: distancia horizontal (m) y cota del eje del tubo (m). */
export interface PipePoint {
  x: number;
  z: number;
}

export interface PipelineInput {
  /** Cota del agua en el tanque (m). */
  H0: number;
  /** Perfil de la tubería desde la salida del tanque hasta la válvula del final. */
  profile: PipePoint[];
  D: number;
  mat: PipeMat;
  T: number;
  /** Accesorios repartidos: distancia y K (además de la entrada y la válvula del final). */
  fittings: { x: number; K: number; name: string }[];
  /** Apertura de la válvula del final (0,1 a 1); descarga a la atmósfera. */
  open: number;
  method: Method;
}

export interface PipelineResult {
  inp: PipelineInput;
  Q: number;
  V: number;
  Re: number;
  f: number;
  hv: number;
  /** Pérdidas: por fricción total, por accesorios (incluida la entrada) y en la válvula (m). */
  hfTot: number;
  hmTot: number;
  hValve: number;
  /** A lo largo del tubo: distancia medida sobre el tubo, cota, línea de energía, piezométrica y presión (m). */
  pts: { x: number; s: number; z: number; egl: number; hgl: number; p: number }[];
  pMin: number;
  pEnd: number;
  /** Cierre de la ecuación de energía entre el tanque y la salida (m): debe ser 0. */
  closure: number;
  /** Con la válvula cerrada: presión estática máxima (m). */
  pStatic: number;
}

const segLen = (a: PipePoint, b: PipePoint) => Math.hypot(b.x - a.x, b.z - a.z);
export const pipeLength = (pr: PipePoint[]) => pr.reduce((acc, p, k) => acc + (k ? segLen(pr[k - 1], p) : 0), 0);

/** Pérdida de fricción por metro de tubo para un caudal (m/m). */
export function slopeOf(Q: number, inp: Pick<PipelineInput, 'D' | 'mat' | 'T' | 'method'>): number {
  const m = PIPE_MATS[inp.mat];
  return inp.method === 'hw' ? hazenWilliams(Q, inp.D, 1, m.C) : darcy(Q, inp.D, 1, m.eps, nuWater(inp.T)).hf;
}

/**
 * Caudal que sale por la válvula abierta a la atmósfera: H0 − z_salida = V²/2g·(1 + K_entrada + ΣK + K_válvula) + hf(Q).
 * Se resuelve por bisección (la pérdida crece con Q). Luego se recorren las líneas de energía y piezométrica.
 */
export function pipeline(inp: PipelineInput): PipelineResult {
  const pr = inp.profile;
  const Lp = pipeLength(pr);
  const zEnd = pr[pr.length - 1].z;
  const A = area(inp.D);
  const Kin = FITTINGS.entrada.K, Kv = gateK(inp.open);
  const Kf = inp.fittings.reduce((a, x) => a + x.K, 0);
  const avail = inp.H0 - zEnd;
  const need = (Q: number) => {
    const V = Q / A;
    return ((V * V) / (2 * G)) * (1 + Kin + Kf + Kv) + slopeOf(Q, inp) * Lp;
  };
  let Q = 0;
  if (avail > 0) {
    let lo = 0, hi = 0.01;
    while (need(hi) < avail && hi < 100) hi *= 2;
    for (let k = 0; k < 200; k++) {
      const m = (lo + hi) / 2;
      if (need(m) < avail) lo = m;
      else hi = m;
    }
    Q = (lo + hi) / 2;
  }
  const V = Q / A, hv = (V * V) / (2 * G);
  const nu = nuWater(inp.T), m = PIPE_MATS[inp.mat];
  const dw = darcy(Q, inp.D, 1, m.eps, nu);
  const Sf = slopeOf(Q, inp);
  // recorrido: después de la entrada, la energía baja con la fricción y en cada accesorio
  const pts: PipelineResult['pts'] = [];
  let s = 0, E = inp.H0 - Kin * hv;
  const fits = inp.fittings.slice().sort((a, b) => a.x - b.x);
  let fi = 0;
  const push = (x: number, z: number) => pts.push({ x, s, z, egl: E, hgl: E - hv, p: E - hv - z });
  push(pr[0].x, pr[0].z);
  for (let k = 1; k < pr.length; k++) {
    const a = pr[k - 1], b = pr[k];
    // accesorios dentro del tramo
    while (fi < fits.length && fits[fi].x <= b.x) {
      const t = Math.max(0, Math.min(1, (fits[fi].x - a.x) / Math.max(1e-9, b.x - a.x)));
      const xs = a.x + t * (b.x - a.x), zs = a.z + t * (b.z - a.z);
      const sNow = pts[pts.length - 1].s + Math.hypot(xs - pts[pts.length - 1].x, zs - pts[pts.length - 1].z);
      E -= Sf * (sNow - s);
      s = sNow;
      push(xs, zs);
      E -= fits[fi].K * hv;
      push(xs, zs);
      fi++;
    }
    const sEnd = pts[pts.length - 1].s + Math.hypot(b.x - pts[pts.length - 1].x, b.z - pts[pts.length - 1].z);
    E -= Sf * (sEnd - s);
    s = sEnd;
    push(b.x, b.z);
  }
  const last = pts[pts.length - 1];
  // la válvula consume Kv·hv y sale el chorro con su energía cinética a presión atmosférica
  const closure = Q > 0 ? last.egl - Kv * hv - (zEnd + hv) : 0;
  const pStatic = inp.H0 - Math.min(...pr.map((p) => p.z));
  return {
    inp,
    Q,
    V,
    Re: dw.Re,
    f: dw.f,
    hv,
    hfTot: Sf * Lp,
    hmTot: (Kin + Kf) * hv,
    hValve: Kv * hv,
    pts,
    pMin: Math.min(...pts.map((p) => p.p)),
    pEnd: last.p,
    closure,
    pStatic,
  };
}

/** Diámetros internos comerciales de PVC (m; RDE 21, aproximados) con su nombre en pulgadas. */
export const PVC_DIAMETERS: { name: string; D: number }[] = [
  { name: '2"', D: 0.0546 },
  { name: '3"', D: 0.0803 },
  { name: '4"', D: 0.1033 },
  { name: '6"', D: 0.1522 },
  { name: '8"', D: 0.1982 },
  { name: '10"', D: 0.2471 },
  { name: '12"', D: 0.2932 },
  { name: '16"', D: 0.3874 },
  { name: '20"', D: 0.4844 },
];

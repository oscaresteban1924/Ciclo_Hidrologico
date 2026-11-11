// Sala «Cuencas: de la lluvia al caudal». Cálculo puro (sin interfaz), con fuentes:
//
// - Curva IDF ilustrativa de la forma de Sherman, i = K·T^m/(t + c)^n (mm/h, t en minutos). Sus parámetros son del
//   orden de los de una estación de montaña andina, pero NO son los de una estación real: un diseño usa la curva IDF
//   de la estación más cercana (Resolución 0330 de 2017, Art. 135, num. 2).
// - Tiempo de concentración: Kirpich (1940), Témez (1978) y el retardo del SCS (USDA, NEH-630 cap. 15).
// - Método racional: Q = C·i·A/360 (m³/s, mm/h, ha); coeficientes de escorrentía de Chow, Maidment y Mays (1988),
//   tabla 15.1.1, para ladera (pendiente > 7 %). El RAS lo admite solo con áreas menores de 80 ha (Art. 135).
// - Número de curva del SCS: Q = (P − Ia)²/(P − Ia + S), Ia = 0,2·S, S = 25 400/CN − 254 (mm); CN de la TR-55
//   (USDA, 1986, tablas 2-2a y 2-2c).
// - Hietograma de diseño por bloques alternos (Chow et al., 1988, sec. 14.4) e hidrograma unitario triangular del
//   SCS: tp = Δt/2 + 0,6·tc, qp = 0,208·A/tp (m³/s por mm, A en km², tp en h), tb = 2,67·tp.
// - Frecuencia: Gumbel por momentos, x_T = μ + K_T·σ con K_T = −(√6/π)·(0,5772 + ln(ln(T/(T − 1)))) (Chow et al.,
//   1988, sec. 12.3); riesgo de que se supere al menos una vez en n años, R = 1 − (1 − 1/T)^n.

export const G = 9.81;

// ------------------------------------------------------------------ lluvia de diseño

/** Curva IDF ilustrativa (no es de una estación real). */
export const IDF_ILUS = { K: 812, m: 0.18, c: 10, n: 0.75 };

/** Intensidad (mm/h) para un período de retorno T (años) y una duración t (min). */
export function idf(T: number, tMin: number, p = IDF_ILUS): number {
  return (p.K * Math.pow(Math.max(1.0001, T), p.m)) / Math.pow(Math.max(0, tMin) + p.c, p.n);
}

/**
 * Hietograma de diseño por bloques alternos: para cada duración k·Δt, la lámina de la curva IDF; los incrementos se
 * ordenan con el mayor en el centro y los demás alternando a derecha e izquierda. Devuelve la lámina de cada bloque
 * (mm), en orden de tiempo.
 */
export function alternatingBlocks(T: number, durMin: number, dtMin: number, p = IDF_ILUS): number[] {
  const n = Math.max(1, Math.round(durMin / dtMin));
  const cum: number[] = [];
  for (let k = 1; k <= n; k++) cum.push((idf(T, k * dtMin, p) * k * dtMin) / 60);
  const inc = cum.map((v, k) => v - (k ? cum[k - 1] : 0)).sort((a, b) => b - a);
  const out = new Array<number>(n).fill(0);
  const mid = Math.floor((n - 1) / 2);
  inc.forEach((v, k) => {
    const off = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
    const pos = Math.min(n - 1, Math.max(0, mid + off));
    out[pos] += v;
  });
  return out;
}

// ------------------------------------------------------------------ coberturas

export type Cover = 'bosque' | 'pasto' | 'cultivo' | 'barrio' | 'pavimento';
export type Soil = 'B' | 'C' | 'D';

/** Períodos de retorno de la tabla de coeficientes de escorrentía (Chow et al., 1988, tabla 15.1.1). */
export const C_T = [2, 5, 10, 25, 50, 100, 500];

export const COVERS: Record<Cover, { name: string; C: number[]; CN: Record<Soil, number>; note: string }> = {
  // C: ladera (pendiente mayor de 7 %), tabla 15.1.1; CN: TR-55, tablas 2-2a y 2-2c (condición hidrológica buena)
  bosque: { name: 'Bosque', C: [0.35, 0.39, 0.41, 0.45, 0.48, 0.52, 0.58], CN: { B: 55, C: 70, D: 77 }, note: 'bosque en buena condición' },
  pasto: { name: 'Pasto', C: [0.37, 0.4, 0.42, 0.46, 0.49, 0.53, 0.6], CN: { B: 61, C: 74, D: 80 }, note: 'pastizal en buena condición' },
  cultivo: { name: 'Cultivos', C: [0.39, 0.42, 0.44, 0.48, 0.51, 0.54, 0.61], CN: { B: 78, C: 85, D: 89 }, note: 'cultivos en hileras, condición buena' },
  // barrio: 65 % concreto y techos más 35 % de zonas verdes en condición promedio y ladera (ponderado de la tabla)
  barrio: { name: 'Barrio', C: [0.617, 0.66, 0.687, 0.733, 0.77, 0.816, 0.86], CN: { B: 85, C: 90, D: 92 }, note: 'residencial denso (65 % impermeable)' },
  pavimento: { name: 'Pavimento', C: [0.73, 0.77, 0.81, 0.86, 0.9, 0.95, 1], CN: { B: 98, C: 98, D: 98 }, note: 'vías y parqueaderos (asfalto)' },
};

/** Coeficiente de escorrentía de una cobertura para un período de retorno (interpolado en log T). */
export function coverC(cover: Cover, T: number): number {
  const c = COVERS[cover].C;
  const lt = Math.log(Math.max(2, Math.min(500, T)));
  for (let k = 1; k < C_T.length; k++) {
    if (lt <= Math.log(C_T[k])) {
      const w = (lt - Math.log(C_T[k - 1])) / (Math.log(C_T[k]) - Math.log(C_T[k - 1]));
      return c[k - 1] + w * (c[k] - c[k - 1]);
    }
  }
  return c[c.length - 1];
}

export type Mix = Partial<Record<Cover, number>>;

/** Fracciones normalizadas (suman 1). */
export function normMix(mix: Mix): Record<Cover, number> {
  const keys = Object.keys(COVERS) as Cover[];
  const tot = keys.reduce((a, k) => a + Math.max(0, mix[k] ?? 0), 0) || 1;
  return Object.fromEntries(keys.map((k) => [k, Math.max(0, mix[k] ?? 0) / tot])) as Record<Cover, number>;
}

/** C ponderado por área. */
export function mixC(mix: Mix, T: number): number {
  const m = normMix(mix);
  return (Object.keys(m) as Cover[]).reduce((a, k) => a + m[k] * coverC(k, T), 0);
}

/**
 * CN ponderado. Se pondera la escorrentía, no el CN: para una lluvia P se suma la escorrentía de cada cobertura y se
 * busca el CN que da lo mismo (TR-55 recomienda no promediar CN muy distintos).
 */
export function mixRunoff(mix: Mix, soil: Soil, P: number): number {
  const m = normMix(mix);
  return (Object.keys(m) as Cover[]).reduce((a, k) => a + m[k] * scsRunoff(P, COVERS[k].CN[soil]), 0);
}

// ------------------------------------------------------------------ tiempo de concentración

/** Kirpich (1940): tc (min) = 0,0195·L^0,77·S^−0,385, L en m y S en m/m. */
export function tcKirpich(L: number, S: number): number {
  return 0.0195 * Math.pow(L, 0.77) * Math.pow(Math.max(S, 1e-5), -0.385);
}

/** Témez (1978): tc (h) = 0,3·(L/S^0,25)^0,76, L en km y S en m/m. Devuelve minutos. */
export function tcTemez(L: number, S: number): number {
  return 60 * 0.3 * Math.pow(L / 1000 / Math.pow(Math.max(S, 1e-5), 0.25), 0.76);
}

/**
 * Retardo del SCS (NEH-630, cap. 15): tL (h) = L^0,8·(S + 1)^0,7/(1900·Y^0,5), L en pies, S = 1000/CN − 10 (pulgadas) y Y
 * la pendiente en %; tc = tL/0,6. Devuelve minutos.
 */
export function tcSCS(L: number, S: number, CN: number): number {
  const Lft = L / 0.3048, Sin = 1000 / CN - 10, Y = Math.max(S, 1e-5) * 100;
  const tL = (Math.pow(Lft, 0.8) * Math.pow(Sin + 1, 0.7)) / (1900 * Math.sqrt(Y));
  return (tL / 0.6) * 60;
}

// ------------------------------------------------------------------ escorrentía

/** Método racional: Q (m³/s) = C·i·A/360, con i en mm/h y A en ha. */
export function rational(C: number, i: number, Aha: number): number {
  return (C * i * Aha) / 360;
}

/** Número de curva: escorrentía (mm) de una lluvia P (mm). */
export function scsRunoff(P: number, CN: number): number {
  const S = 25400 / Math.max(1, Math.min(100, CN)) - 254;
  const Ia = 0.2 * S;
  return P > Ia ? ((P - Ia) * (P - Ia)) / (P - Ia + S) : 0;
}

/** Lámina efectiva de cada bloque de un hietograma (mm) con el número de curva (pérdidas acumuladas). */
export function effectiveBlocks(blocks: number[], runoffOf: (P: number) => number): number[] {
  let P = 0, Q = 0;
  return blocks.map((b) => {
    P += b;
    const q = runoffOf(P);
    const e = Math.max(0, q - Q);
    Q = q;
    return e;
  });
}

/** Hidrograma unitario triangular del SCS (1 mm sobre A km² en Δt h): ordenadas cada Δt (m³/s). */
export function scsUnitHydrograph(Akm2: number, tcH: number, dtH: number): { tp: number; qp: number; tb: number; uh: number[] } {
  const tp = dtH / 2 + 0.6 * tcH;
  const qp = (0.208 * Akm2) / tp;
  const tb = 2.67 * tp;
  const uh: number[] = [];
  // ordenadas promediadas en cada intervalo, para que el volumen sea exactamente 1 mm × A
  const at = (t: number) => (t <= 0 ? 0 : t <= tp ? (qp * t) / tp : t <= tb ? (qp * (tb - t)) / (tb - tp) : 0);
  const area = (t0: number, t1: number) => {
    // integral exacta de la función triangular por tramos
    const pts = [t0, t1, tp, tb].filter((x) => x > t0 && x < t1).concat([t0, t1]).sort((a, b) => a - b);
    let s = 0;
    for (let k = 1; k < pts.length; k++) s += ((at(pts[k - 1]) + at(pts[k])) / 2) * (pts[k] - pts[k - 1]);
    return s;
  };
  for (let k = 0; k * dtH < tb + dtH; k++) uh.push(area(k * dtH, (k + 1) * dtH) / dtH);
  // escala al volumen exacto: 1 mm sobre A km² = 1000·A m³
  const vol = uh.reduce((a, q) => a + q * dtH * 3600, 0);
  const f = (1000 * Akm2) / vol;
  return { tp, qp, tb, uh: uh.map((q) => q * f) };
}

/** Convolución de la lluvia efectiva (mm por intervalo) con el hidrograma unitario: caudal directo (m³/s). */
export function convolve(eff: number[], uh: number[]): number[] {
  const out = new Array<number>(eff.length + uh.length - 1).fill(0);
  eff.forEach((e, i) => uh.forEach((u, j) => (out[i + j] += e * u)));
  return out;
}

// ------------------------------------------------------------------ frecuencia

/** Factor de frecuencia de Gumbel. */
export function gumbelK(T: number): number {
  return -(Math.sqrt(6) / Math.PI) * (0.5772 + Math.log(Math.log(T / (T - 1))));
}

export function mean(x: number[]): number {
  return x.reduce((a, v) => a + v, 0) / Math.max(1, x.length);
}

export function std(x: number[]): number {
  const m = mean(x);
  return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, x.length - 1));
}

/** Caudal (o lluvia) de período de retorno T con Gumbel por momentos. */
export function gumbelQ(mu: number, sigma: number, T: number): number {
  return mu + gumbelK(T) * sigma;
}

/** Período de retorno de un valor x con Gumbel por momentos. */
export function gumbelT(mu: number, sigma: number, x: number): number {
  const a = (Math.sqrt(6) * sigma) / Math.PI, u = mu - 0.5772 * a;
  const F = Math.exp(-Math.exp(-(x - u) / a));
  return 1 / Math.max(1e-9, 1 - F);
}

/** Riesgo de que el evento de T años se supere al menos una vez en n años. */
export function risk(T: number, n: number): number {
  return 1 - Math.pow(1 - 1 / T, n);
}

/** Período de retorno que deja un riesgo R en n años. */
export function tForRisk(R: number, n: number): number {
  return 1 / (1 - Math.pow(1 - R, 1 / n));
}

/**
 * Serie sintética de caudales máximos anuales: Gumbel con media y desviación dadas, generada con una semilla (siempre la
 * misma serie para los mismos datos). No son mediciones de un río real.
 */
export function syntheticSeries(mu: number, sigma: number, years: number, seed = 7): number[] {
  let x = seed % 2147483647 || 1;
  const rnd = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
  const a = (Math.sqrt(6) * sigma) / Math.PI, u = mu - 0.5772 * a;
  return Array.from({ length: years }, () => {
    const F = Math.min(0.9995, Math.max(0.0005, rnd()));
    return u - a * Math.log(-Math.log(F));
  });
}

/** Posición de graficación de Weibull: T = (n + 1)/m para el m-ésimo mayor. */
export function weibullPositions(x: number[]): { x: number; T: number }[] {
  const s = x.slice().sort((a, b) => b - a);
  return s.map((v, k) => ({ x: v, T: (s.length + 1) / (k + 1) }));
}

// ------------------------------------------------------------------ modelo de la escena

/** Cuenca de la escena (ilustrativa): ladera andina con una quebrada principal. */
export interface BasinInput {
  /** Área (ha), largo del cauce principal (m) y pendiente media del cauce (m/m). */
  A: number;
  L: number;
  S: number;
  /** Coberturas (fracciones). */
  mix: Record<Cover, number>;
  soil: Soil;
  /** Período de retorno (años) y duración del aguacero (min). */
  T: number;
  dur: number;
}

export const DEFAULT_BASIN: BasinInput = {
  A: 60,
  L: 1400,
  S: 0.12,
  mix: { bosque: 0.45, pasto: 0.3, cultivo: 0, barrio: 0.2, pavimento: 0.05 },
  soil: 'C',
  T: 10,
  dur: 60,
};

export function sanitizeBasin(p: Partial<BasinInput>): BasinInput {
  const d = DEFAULT_BASIN;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  const mix = normMix({ ...d.mix, ...(p.mix ?? {}) });
  return {
    A: num(p.A, 5, 2000, d.A),
    L: num(p.L, 200, 15000, d.L),
    S: num(p.S, 0.005, 0.5, d.S),
    mix,
    soil: p.soil === 'B' || p.soil === 'D' ? p.soil : p.soil === 'C' ? 'C' : d.soil,
    T: num(p.T, 2, 500, d.T),
    dur: num(p.dur, 10, 360, d.dur),
  };
}

export interface BasinResult {
  inp: BasinInput;
  tc: { kirpich: number; temez: number; scs: number; used: number };
  C: number;
  /** Intensidad con duración igual a tc (mm/h) y caudal pico racional (m³/s). */
  iTc: number;
  Qrat: number;
  rationalOk: boolean;
  /** Aguacero de diseño: bloques cada Δt (mm), lámina efectiva (mm) e hidrograma SCS (m³/s cada Δt). */
  dt: number;
  rain: number[];
  eff: number[];
  P: number;
  Q: number;
  CNeq: number;
  hydro: number[];
  Qpeak: number;
  tPeak: number;
  /** Volumen de escorrentía (m³). */
  vol: number;
  uh: { tp: number; qp: number; tb: number };
}

/** CN equivalente: el que da la misma escorrentía que la mezcla para la lluvia P. */
export function equivalentCN(P: number, Q: number): number {
  let lo = 1, hi = 100;
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    if (scsRunoff(P, m) < Q) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

export function basinModel(p0: Partial<BasinInput>): BasinResult {
  const inp = sanitizeBasin(p0);
  const { A, L, S, mix, soil, T, dur } = inp;
  const C = mixC(mix, T);
  // CN equivalente con la lluvia de 24 h de este T (para el retardo del SCS)
  const P24 = (idf(T, 1440) * 1440) / 60;
  const CN24 = equivalentCN(P24, mixRunoff(mix, soil, P24));
  const kir = tcKirpich(L, S), tem = tcTemez(L, S), scs = tcSCS(L, S, CN24);
  // se usa el promedio de los tres, con el mínimo de 10 min (dentro del rango 3 a 10 min que pide simular el RAS)
  const used = Math.max(10, (kir + tem + scs) / 3);
  const iTc = idf(T, used);
  const Qrat = rational(C, iTc, A);
  // aguacero de diseño e hidrograma unitario
  const dt = Math.max(2, Math.min(15, Math.round(used / 5)));
  const rain = alternatingBlocks(T, dur, dt);
  const P = rain.reduce((a, v) => a + v, 0);
  const eff = effectiveBlocks(rain, (x) => mixRunoff(mix, soil, x));
  const Q = eff.reduce((a, v) => a + v, 0);
  const uh = scsUnitHydrograph(A / 100, used / 60, dt / 60);
  const hydro = convolve(eff, uh.uh);
  let Qpeak = 0, kp = 0;
  hydro.forEach((q, k) => {
    if (q > Qpeak) {
      Qpeak = q;
      kp = k;
    }
  });
  return {
    inp,
    tc: { kirpich: kir, temez: tem, scs, used },
    C,
    iTc,
    Qrat,
    rationalOk: A < 80,
    dt,
    rain,
    eff,
    P,
    Q,
    CNeq: equivalentCN(P, Q),
    hydro,
    Qpeak,
    tPeak: (kp + 0.5) * dt,
    vol: hydro.reduce((a, q) => a + q * dt * 60, 0),
    uh: { tp: uh.tp, qp: uh.qp, tb: uh.tb },
  };
}

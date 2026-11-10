// Modelo didáctico de calidad del agua: una quebrada de montaña que recibe un vertimiento, una planta de
// potabilización y el lavado de las calles cuando llueve. Funciones puras (sin interfaz), probadas en
// tests/quality/model.test.ts. Las fórmulas y las fuentes están en docs/calidad/MODELO_CALIDAD.md.
//
// Lo que es dato o ecuación publicada y lo que es regla didáctica se señala en cada función. Nada de esto es
// un monitoreo real de una quebrada de Medellín.

// ------------------------------------------------------------------ física básica

/** Altitud de referencia del valle de Aburrá en Medellín [m s. n. m.]. */
export const ELEV_MEDELLIN_M = 1495;

/** Presión relativa a la del nivel del mar a una altitud dada (atmósfera estándar internacional). */
export function pressureRatio(elevM: number): number {
  return Math.pow(1 - 2.25577e-5 * elevM, 5.25588);
}

/**
 * Oxígeno disuelto de saturación en agua dulce [mg/L] a la temperatura T [°C] y a la altitud dada. Ecuación de
 * Benson y Krause adoptada en Standard Methods (APHA, 4500-O), corregida por presión con la razón de presiones
 * (se desprecia la corrección por vapor de agua, menor de 1 % entre 10 y 30 °C).
 */
export function doSat(T: number, elevM = 0): number {
  const Ta = T + 273.15;
  const ln = -139.34411 + 1.575701e5 / Ta - 6.642308e7 / Ta ** 2 + 1.2438e10 / Ta ** 3 - 8.621949e11 / Ta ** 4;
  return Math.exp(ln) * pressureRatio(elevM);
}

/** Corrección de una constante de velocidad por temperatura (forma de Arrhenius usada en calidad de aguas). */
export function theta(k20: number, th: number, T: number): number {
  return k20 * Math.pow(th, T - 20);
}

// ------------------------------------------------------------------ la quebrada

export type Treatment = 'ninguno' | 'septico' | 'ptar' | 'alcantarillado';
export type Season = 'verano' | 'normal' | 'lluvioso';
export type Slope = 'montana' | 'plana';

/** Agua residual doméstica cruda: valores típicos (orden de magnitud de la literatura). */
export const RAW_SEWAGE = {
  /** Agua usada que vuelve como residual por persona [L/día] (120 L de consumo × 0,85 de retorno). */
  litersPerPerson: 102,
  dbo: 300, // mg/L (DBO5; típico 200–400)
  turbidity: 150, // UNT (los sólidos suspendidos la enturbian)
  coliforms: 1e7, // NMP/100 mL de coliformes fecales (típico 10⁶–10⁸)
  conductivity: 900, // µS/cm
  temperature: 22, // °C
  dissolvedO2: 0.5, // mg/L
  pH: 7.2,
  /** Nitrógeno amoniacal [mg/L de N]: agua residual doméstica de concentración media (Metcalf y Eddy). */
  ammoniaN: 25,
} as const;

/** Fracción que queda después de cada tratamiento (valores típicos de remoción). */
export const TREATMENTS: Record<Treatment, { name: string; dbo: number; solids: number; coliforms: number; ammonia: number; flow: number; note: string }> = {
  ninguno: { name: 'Directo a la quebrada', dbo: 1, solids: 1, coliforms: 1, ammonia: 1, flow: 1, note: 'El tubo de las casas descarga sin tratar.' },
  septico: { name: 'Tanque séptico', dbo: 0.6, solids: 0.4, coliforms: 0.5, ammonia: 1, flow: 1, note: 'Remueve cerca de 40 % de la materia orgánica y 60 % de los sólidos; casi no quita microbios ni el amonio (sin aire, el nitrógeno sale como amonio).' },
  ptar: { name: 'Planta pequeña (tratamiento secundario)', dbo: 0.1, solids: 0.1, coliforms: 0.01, ammonia: 0.5, flow: 1, note: 'Remueve cerca de 90 % de la materia orgánica y de los sólidos y 99 % de los coliformes (sin desinfección); convierte cerca de la mitad del amonio en nitrato.' },
  alcantarillado: { name: 'Conectadas al alcantarillado', dbo: 0, solids: 0, coliforms: 0, ammonia: 0, flow: 0, note: 'El agua usada se va por la red de aguas residuales hasta la planta de tratamiento del valle: no llega a la quebrada.' },
};

/** Nitrificación en la quebrada: velocidad a 20 °C [1/día], corrección por temperatura y oxígeno que gasta cada
 *  gramo de nitrógeno amoniacal que pasa a nitrato (Bowie et al., 1985; Chapra, 1997). */
export const NITRIF = { k20: 0.5, theta: 1.08, o2PerN: 4.57 } as const;

/**
 * Fracción del nitrógeno amoniacal que está como amoníaco libre (NH₃, el tóxico para los peces) según la
 * temperatura [°C] y el pH: pKa = 0,09018 + 2 729,92 / T[K] (Emerson et al., 1975).
 */
export function nh3Fraction(T: number, pH: number): number {
  const pKa = 0.09018 + 2729.92 / (T + 273.15);
  return 1 / (1 + Math.pow(10, pKa - pH));
}
/** mg/L de NH₃ (como amoníaco) a partir de mg/L de N amoniacal. */
export const NH3_PER_N = 17.031 / 14.007;

/** Caudal de la quebrada antes del vertimiento [m³/s] según la temporada. */
export const SEASON_FLOW: Record<Season, number> = { verano: 0.05, normal: 0.15, lluvioso: 0.4 };

/** Agua de la quebrada aguas arriba (sin vertimientos): valores típicos de una quebrada de montaña limpia. */
export interface Upstream {
  T: number;
  dbo: number;
  /** Nitrógeno amoniacal [mg/L de N]. */
  ammoniaN: number;
  turbidity: number;
  coliforms: number;
  conductivity: number;
  pH: number;
  /** Saturación de oxígeno [fracción]. */
  sat: number;
}

export interface CreekInput {
  houses: number;
  treatment: Treatment;
  season: Season;
  slope: Slope;
  /** Árboles en la orilla: sombra (agua más fresca) y menos tierra que llega con la lluvia. */
  trees: boolean;
  /** Recién llovió: la escorrentía de las calles y las laderas enturbia el agua y trae microbios. */
  afterRain: boolean;
  elevM?: number;
}

export const DEFAULT_CREEK: CreekInput = { houses: 60, treatment: 'ninguno', season: 'normal', slope: 'montana', trees: true, afterRain: false };

export const PERSONS_PER_HOUSE = 4;
/** Ancho de la quebrada [m]; pendiente y rugosidad de Manning de cada tipo de cauce. */
export const CHANNEL = { width: 4, montana: { S: 0.04, n: 0.05 }, plana: { S: 0.005, n: 0.035 } } as const;

export function upstreamWater(inp: CreekInput): Upstream {
  const T = (inp.trees ? 17 : 19.5) - (inp.afterRain ? 1 : 0);
  return {
    T,
    dbo: inp.afterRain ? 4 : 1.5,
    ammoniaN: inp.afterRain ? 0.08 : 0.03,
    turbidity: inp.afterRain ? (inp.trees ? 60 : 140) : 4,
    coliforms: inp.afterRain ? 4000 : 150,
    conductivity: inp.afterRain ? 45 : 70,
    pH: 7.3,
    sat: 0.95,
  };
}

/** Profundidad y velocidad del agua en un cauce ancho rectangular con la ecuación de Manning. */
export function hydraulics(Q: number, slope: Slope): { H: number; U: number; S: number } {
  const { S, n } = CHANNEL[slope];
  const q = Q / CHANNEL.width;
  const H = Math.pow((q * n) / Math.sqrt(S), 3 / 5);
  return { H, U: q / H, S };
}

/**
 * Coeficiente de reaireación a 20 °C [1/día] con la fórmula de Tsivoglou y Neal para quebradas pequeñas
 * (Chapra, Surface Water-Quality Modeling): ka = 31 183·S·U si Q ≤ 0,4247 m³/s; 15 308·S·U si es mayor.
 */
export function reaeration(Q: number, S: number, U: number): number {
  return (Q <= 0.4247 ? 31183 : 15308) * S * U;
}

/** Descomposición de la DBO a 20 °C en cauces poco profundos [1/día] (Hydroscience, en Chapra). */
export function boDecay(H: number): number {
  return 0.3 * Math.pow(Math.min(H, 2.4) / 2.4, -0.434);
}

/** Demanda de oxígeno del lodo del fondo cerca de un vertimiento [g O₂/m²/día] según el tratamiento. */
export const SOD: Record<Treatment, number> = { ninguno: 4, septico: 2, ptar: 0.5, alcantarillado: 0 };
/** Distancia aguas abajo con lodo en el fondo [m]. */
export const SLUDGE_REACH_M = 800;

export interface Reading {
  x: number;
  T: number;
  dissolvedO2: number;
  satPct: number;
  pH: number;
  conductivity: number;
  turbidity: number;
  coliforms: number;
  dbo: number;
  /** Nitrógeno amoniacal [mg/L de N] y amoníaco libre [mg/L de NH₃]. */
  ammoniaN: number;
  nh3: number;
  /** Caudal en ese punto [m³/s] y tiempo de viaje desde el vertimiento [h]. */
  Q: number;
  travelH: number;
}

export interface CreekModel {
  inp: CreekInput;
  Qr: number;
  Qw: number;
  up: Upstream;
  mix: Omit<Reading, 'x' | 'travelH'>;
  H: number;
  U: number;
  ka: number;
  kd: number;
  kb: number;
  ks: number;
  /** Nitrificación [1/día] a la temperatura de la mezcla. */
  kn: number;
  /** Lectura en una posición x [m] (negativa: aguas arriba del vertimiento). */
  at: (x: number) => Reading;
}

// ------------------------------------------------------------------ pluma del vertimiento
/**
 * Mezcla transversal de un vertimiento en la orilla (Fischer et al., 1979, Mixing in Inland and Coastal Waters,
 * cap. 5). El modelo de la quebrada supone el agua mezclada de orilla a orilla; esto reparte el exceso de
 * contaminante a lo ancho antes de que se mezcle. Coeficiente de mezcla transversal εt = 0,6·H·u*, con
 * u* = √(g·H·S) (cauces naturales: 0,3 a 1,0; se usa el valor central). Largo de mezcla para un vertimiento
 * en la orilla: Lm = 0,4·U·W²/εt (concentración a lo ancho dentro del 5 % de la media).
 */
export const PLUME = { epsCoef: 0.6, lmCoef: 0.4, y0: 0.12 } as const;

/** Coeficiente de mezcla transversal [m²/s] y largo de mezcla completa [m] de la quebrada. */
export function plumeMixing(m: Pick<CreekModel, 'H' | 'U' | 'inp'>): { eps: number; Lm: number } {
  const S = CHANNEL[m.inp.slope].S;
  const ustar = Math.sqrt(9.81 * m.H * S);
  const eps = PLUME.epsCoef * m.H * ustar;
  return { eps, Lm: (PLUME.lmCoef * m.U * CHANNEL.width * CHANNEL.width) / eps };
}

/**
 * Concentración relativa de la pluma: exceso en (x, y) ÷ exceso con mezcla completa (1 = mezclado). x [m] aguas
 * abajo del tubo; yFrac de 0 (orilla del tubo) a 1 (orilla opuesta). El chorro del tubo cae a y0 = 0,12·W de la
 * orilla; las orillas no dejan pasar contaminante (imágenes): C/C̄ = Σ [exp(−(y′ − y0′ − 2n)²/(4x′)) +
 * exp(−(y′ + y0′ − 2n)²/(4x′))] / √(4πx′), con x′ = εt·x/(U·W²) y y′ = y/W (Fischer et al., ec. 5.9). Nunca pasa
 * del agua del tubo sin mezclar (Q/Qw).
 */
export function plumeFactor(m: Pick<CreekModel, 'H' | 'U' | 'inp' | 'Qr' | 'Qw'>, x: number, yFrac: number): number {
  if (x <= 0 || m.Qw <= 0) return 1;
  const { eps } = plumeMixing(m);
  const xp = (eps * x) / (m.U * CHANNEL.width * CHANNEL.width);
  const y = Math.min(1, Math.max(0, yFrac));
  const y0 = PLUME.y0;
  let f: number;
  if (xp < 0.05) {
    // cerca del tubo: imágenes (convergen rápido cuando la pluma es angosta)
    let sum = 0;
    for (let n = -3; n <= 3; n++) sum += Math.exp(-((y - y0 - 2 * n) ** 2) / (4 * xp)) + Math.exp(-((y + y0 - 2 * n) ** 2) / (4 * xp));
    f = sum / Math.sqrt(4 * Math.PI * xp);
  } else {
    // lejos: la misma solución en serie de cosenos (converge rápido cuando la pluma ya es ancha)
    f = 1;
    for (let k = 1; k <= 40; k++) f += 2 * Math.cos(k * Math.PI * y0) * Math.cos(k * Math.PI * y) * Math.exp(-k * k * Math.PI * Math.PI * xp);
  }
  return Math.min(f, (m.Qr + m.Qw) / m.Qw);
}

// ------------------------------------------------------------------ entradas válidas
const fin = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const oneOf = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (typeof v === 'string' && (ok as readonly string[]).includes(v) ? (v as T) : d);
/** Límites de las entradas de la quebrada (lo que está fuera se lleva al borde; lo que no es válido, al valor por defecto). */
export const CREEK_LIMITS = { houses: [0, 5000], elevM: [0, 4500] } as const;

/** Entrada de la quebrada siempre válida: números finitos dentro de sus límites y opciones conocidas. */
export function sanitizeCreek(inp: Partial<CreekInput> | null | undefined): CreekInput {
  const i = (inp ?? {}) as Partial<CreekInput>;
  const elev = i.elevM === undefined ? undefined : clamp(fin(i.elevM, ELEV_MEDELLIN_M), CREEK_LIMITS.elevM[0], CREEK_LIMITS.elevM[1]);
  return {
    houses: Math.round(clamp(fin(i.houses, DEFAULT_CREEK.houses), CREEK_LIMITS.houses[0], CREEK_LIMITS.houses[1])),
    treatment: oneOf(i.treatment, ['ninguno', 'septico', 'ptar', 'alcantarillado'] as const, DEFAULT_CREEK.treatment),
    season: oneOf(i.season, ['verano', 'normal', 'lluvioso'] as const, DEFAULT_CREEK.season),
    slope: oneOf(i.slope, ['montana', 'plana'] as const, DEFAULT_CREEK.slope),
    trees: typeof i.trees === 'boolean' ? i.trees : DEFAULT_CREEK.trees,
    afterRain: typeof i.afterRain === 'boolean' ? i.afterRain : DEFAULT_CREEK.afterRain,
    ...(elev === undefined ? {} : { elevM: elev }),
  };
}

/**
 * Quebrada con un vertimiento en x = 0. Aguas arriba, el agua de montaña; en el vertimiento, mezcla completa
 * (balance de masa); aguas abajo, la DBO se descompone, el oxígeno sigue la ecuación de Streeter y Phelps con
 * reaireación y demanda del lodo del fondo, los coliformes mueren (Mancini) y la turbiedad se asienta.
 */
export function creekModel(input: CreekInput): CreekModel {
  const inp = sanitizeCreek(input);
  const elev = inp.elevM ?? ELEV_MEDELLIN_M;
  const up = upstreamWater(inp);
  const Qr = SEASON_FLOW[inp.season] * (inp.afterRain ? 2.5 : 1);
  const tr = TREATMENTS[inp.treatment];
  const Qw = (inp.houses * PERSONS_PER_HOUSE * RAW_SEWAGE.litersPerPerson * tr.flow) / 1000 / 86400;
  const Q = Qr + Qw;
  const mixC = (a: number, b: number) => (Qr * a + Qw * b) / Q;
  const T = mixC(up.T, RAW_SEWAGE.temperature);
  const sat0 = doSat(up.T, elev);
  const doUp = up.sat * sat0;
  const sewDO = inp.treatment === 'ptar' ? 2 : RAW_SEWAGE.dissolvedO2;
  const mix = {
    T,
    dissolvedO2: mixC(doUp, sewDO),
    satPct: 0,
    pH: mixC(up.pH, RAW_SEWAGE.pH),
    conductivity: mixC(up.conductivity, RAW_SEWAGE.conductivity),
    turbidity: mixC(up.turbidity, RAW_SEWAGE.turbidity * tr.solids),
    coliforms: mixC(up.coliforms, RAW_SEWAGE.coliforms * tr.coliforms),
    dbo: mixC(up.dbo, RAW_SEWAGE.dbo * tr.dbo),
    ammoniaN: mixC(up.ammoniaN, RAW_SEWAGE.ammoniaN * tr.ammonia),
    nh3: 0,
    Q,
  };
  mix.nh3 = mix.ammoniaN * nh3Fraction(T, mix.pH) * NH3_PER_N;
  const satMix = doSat(T, elev);
  mix.satPct = (mix.dissolvedO2 / satMix) * 100;
  const { H, U, S } = hydraulics(Q, inp.slope);
  const ka = theta(reaeration(Q, S, U), 1.024, T);
  const kd = theta(boDecay(H), 1.047, T);
  const kb = theta(0.8, 1.07, T);
  const kn = theta(NITRIF.k20, NITRIF.theta, T);
  // asentamiento de partículas finas: velocidad de caída de 1 m/día sobre la profundidad
  const ks = 1 / Math.max(0.05, H);
  const sodV = (theta(SOD[inp.treatment], 1.065, T) / H) * (Qw > 0 ? 1 : 0); // mg/L/día (g/m³)
  const L0 = mix.dbo;
  const N0 = mix.ammoniaN;
  const D0 = satMix - mix.dissolvedO2;
  const nh3Up = up.ammoniaN * nh3Fraction(up.T, up.pH) * NH3_PER_N;
  /** Déficit que deja una demanda de primer orden de carga C0 y velocidad k (forma de Streeter y Phelps). */
  const sp = (k: number, C0: number, t: number) => (Math.abs(ka - k) > 1e-9 ? ((k * C0) / (ka - k)) * (Math.exp(-k * t) - Math.exp(-ka * t)) : k * C0 * t * Math.exp(-ka * t));
  const at = (x: number): Reading => {
    if (!Number.isFinite(x)) x = 0;
    if (x < 0) {
      const sat = doSat(up.T, elev);
      return { x, T: up.T, dissolvedO2: doUp, satPct: (doUp / sat) * 100, pH: up.pH, conductivity: up.conductivity, turbidity: up.turbidity, coliforms: up.coliforms, dbo: up.dbo, ammoniaN: up.ammoniaN, nh3: nh3Up, Q: Qr, travelH: 0 };
    }
    const t = x / U / 86400; // días
    const L = L0 * Math.exp(-kd * t);
    // déficit: inicial + DBO (Streeter y Phelps) + lodo del fondo mientras dura el tramo con lodo
    const tS = Math.min(t, SLUDGE_REACH_M / U / 86400);
    const dDBO = sp(kd, L0, t);
    // nitrificación: el amonio pasa a nitrato y gasta 4,57 g de oxígeno por gramo de nitrógeno
    const dN = sp(kn, NITRIF.o2PerN * N0, t);
    const dSOD = (sodV / ka) * (1 - Math.exp(-ka * tS)) * Math.exp(-ka * (t - tS));
    const D = D0 * Math.exp(-ka * t) + dDBO + dN + dSOD;
    const dO = Math.max(0, satMix - D);
    const N = N0 * Math.exp(-kn * t);
    return {
      x,
      T,
      dissolvedO2: dO,
      satPct: (dO / satMix) * 100,
      pH: mix.pH,
      conductivity: mix.conductivity,
      turbidity: up.turbidity + (mix.turbidity - up.turbidity) * Math.exp(-ks * t),
      coliforms: mix.coliforms * Math.exp(-kb * t),
      dbo: L,
      ammoniaN: N,
      nh3: N * nh3Fraction(T, mix.pH) * NH3_PER_N,
      Q,
      travelH: t * 24,
    };
  };
  return { inp, Qr, Qw, up, mix, H, U, ka, kd, kb, ks, kn, at };
}

/** Regla de los peces (didáctica, con criterios publicados): oxígeno de al menos 5 mg/L (Decreto 1076 de 2015,
 *  art. 2.2.3.3.9.10, aguas dulces frías), DBO5 de 6 mg/L o menos y amoníaco libre de 0,025 mg/L de NH₃ o menos
 *  (Directiva 78/659/CEE, valor guía de aguas ciprinícolas y valor imperativo, respectivamente). */
export const FISH = { minDO: 5, maxDBO: 6, maxNH3: 0.025 } as const;
export const fishOk = (r: { dissolvedO2: number; dbo: number; nh3?: number }) => r.dissolvedO2 >= FISH.minDO && r.dbo <= FISH.maxDBO && (r.nh3 ?? 0) <= FISH.maxNH3;

/** Criterios para nadar (contacto primario, Decreto 1076 de 2015, art. 2.2.3.3.9.7, antes Decreto 1594 de 1984). */
export const SWIM = { coliformsFecal: 200, satPct: 70, pHmin: 5, pHmax: 9 } as const;

export function canSwim(r: Reading): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (r.coliforms > SWIM.coliformsFecal) reasons.push(`coliformes fecales por encima de ${SWIM.coliformsFecal} NMP/100 mL`);
  if (r.satPct < SWIM.satPct) reasons.push(`oxígeno por debajo de ${SWIM.satPct} % de saturación`);
  if (r.pH < SWIM.pHmin || r.pH > SWIM.pHmax) reasons.push('pH fuera de 5 a 9');
  return { ok: reasons.length === 0, reasons };
}

// ------------------------------------------------------------------ bichos debajo de las piedras (BMWP/Col)

export type Glyph = 'ninfa' | 'estuche' | 'red' | 'escarabajo' | 'centavito' | 'patinador' | 'larva' | 'caracol' | 'sanguijuela' | 'planaria' | 'libelula' | 'gusano' | 'diablito';

export interface Family {
  id: string;
  family: string;
  common: string;
  group: string;
  /** Puntaje BMWP/Col (Roldán, 2003). */
  score: number;
  glyph: Glyph;
  color: string;
  note: string;
}

/** Familias del juego con su puntaje BMWP/Col (Roldán 2003, tabla reproducida por Roldán-Pérez 2016). */
export const FAMILIES: Family[] = [
  { id: 'perlidae', family: 'Perlidae', common: 'Plecóptero', group: 'Plecoptera', score: 10, glyph: 'ninfa', color: '#8a6a3f', note: 'Necesita agua fría, muy oxigenada y piedras limpias.' },
  { id: 'psephenidae', family: 'Psephenidae', common: 'Centavito de agua', group: 'Coleoptera', score: 10, glyph: 'centavito', color: '#a0743c', note: 'Larva plana como una moneda, pegada a las piedras en el agua rápida.' },
  { id: 'leptophlebiidae', family: 'Leptophlebiidae', common: 'Efímera', group: 'Ephemeroptera', score: 9, glyph: 'ninfa', color: '#9b7b4c', note: 'Respira por agallas en el abdomen; se va si falta oxígeno.' },
  { id: 'philopotamidae', family: 'Philopotamidae', common: 'Tricóptero de red fina', group: 'Trichoptera', score: 9, glyph: 'red', color: '#7c6a52', note: 'Teje una red de seda para atrapar comida que trae la corriente.' },
  { id: 'leptoceridae', family: 'Leptoceridae', common: 'Tricóptero de estuche', group: 'Trichoptera', score: 8, glyph: 'estuche', color: '#8d7a5c', note: 'Se construye una casita con granos de arena o pedacitos de hojas.' },
  { id: 'simuliidae', family: 'Simuliidae', common: 'Larva de mosca negra', group: 'Diptera', score: 8, glyph: 'larva', color: '#5d5a52', note: 'Se pega a las piedras donde el agua corre rápido.' },
  { id: 'veliidae', family: 'Veliidae', common: 'Patinador pequeño', group: 'Hemiptera', score: 8, glyph: 'patinador', color: '#4b4f55', note: 'Camina sobre el agua en los remansos de la orilla.' },
  { id: 'baetidae', family: 'Baetidae', common: 'Efímera nadadora', group: 'Ephemeroptera', score: 7, glyph: 'ninfa', color: '#87805f', note: 'Nada rápido entre las piedras; aguanta un poco más que otras efímeras.' },
  { id: 'hydropsychidae', family: 'Hydropsychidae', common: 'Tricóptero de red', group: 'Trichoptera', score: 7, glyph: 'red', color: '#6f6a4c', note: 'Hace redes en las piedras; tolera algo de materia orgánica.' },
  { id: 'planariidae', family: 'Planariidae', common: 'Planaria', group: 'Tricladida', score: 7, glyph: 'planaria', color: '#5f5048', note: 'Gusano plano que se desliza bajo las piedras.' },
  { id: 'elmidae', family: 'Elmidae', common: 'Escarabajo de agua', group: 'Coleoptera', score: 6, glyph: 'escarabajo', color: '#3f3a33', note: 'Pequeño escarabajo que vive todo el tiempo bajo el agua.' },
  { id: 'corydalidae', family: 'Corydalidae', common: 'Diablito o megalóptero', group: 'Megaloptera', score: 6, glyph: 'diablito', color: '#5a4636', note: 'Larva grande y cazadora, con pinzas.' },
  { id: 'libellulidae', family: 'Libellulidae', common: 'Ninfa de libélula', group: 'Odonata', score: 6, glyph: 'libelula', color: '#6b6b3f', note: 'Caza a otros bichos en el fondo, donde el agua es más lenta.' },
  { id: 'physidae', family: 'Physidae', common: 'Caracol de agua', group: 'Gastropoda', score: 3, glyph: 'caracol', color: '#7a6249', note: 'Respira aire en la superficie: aguanta agua con poco oxígeno.' },
  { id: 'glossiphoniidae', family: 'Glossiphoniidae', common: 'Sanguijuela', group: 'Hirudinea', score: 3, glyph: 'sanguijuela', color: '#4a3c35', note: 'Tolera agua con bastante materia orgánica.' },
  { id: 'chironomidae', family: 'Chironomidae', common: 'Larva roja de mosquito', group: 'Diptera', score: 2, glyph: 'larva', color: '#b33a2c', note: 'Es roja por la hemoglobina, que le ayuda con poco oxígeno.' },
  { id: 'culicidae', family: 'Culicidae', common: 'Larva de zancudo', group: 'Diptera', score: 2, glyph: 'larva', color: '#565049', note: 'Respira por un tubito en la superficie del agua quieta.' },
  { id: 'tubificidae', family: 'Tubificidae', common: 'Gusano de lodo', group: 'Oligochaeta', score: 1, glyph: 'gusano', color: '#c2554a', note: 'Vive en el lodo; aguanta casi sin oxígeno.' },
];

/**
 * Regla didáctica de presencia: cada familia aparece si el oxígeno y la materia orgánica están dentro de lo que
 * tolera, según su puntaje (las más sensibles piden más oxígeno y menos DBO). Los pocos tolerantes viven también
 * en agua limpia, pero allí son escasos. En la naturaleza influyen además el fondo, la corriente y la época.
 */
export function tolerance(score: number): { minDO: number; maxDBO: number } {
  if (score >= 10) return { minDO: 7, maxDBO: 2.5 };
  if (score >= 9) return { minDO: 6.5, maxDBO: 3.5 };
  if (score >= 8) return { minDO: 6, maxDBO: 5 };
  if (score >= 7) return { minDO: 5.5, maxDBO: 7 };
  if (score >= 6) return { minDO: 5, maxDBO: 10 };
  if (score >= 3) return { minDO: 2, maxDBO: 40 };
  if (score >= 2) return { minDO: 1, maxDBO: 120 };
  return { minDO: 0, maxDBO: Infinity };
}

export interface SampleFamily extends Family {
  count: number;
}

/** Bichos debajo de una piedra en la lectura r: familias presentes y cuántos individuos (determinista). */
export function stoneSample(r: Reading): SampleFamily[] {
  const out: SampleFamily[] = [];
  const dirty = Math.min(1, Math.max(0, (r.dbo - 2) / 30));
  for (const f of FAMILIES) {
    const tol = tolerance(f.score);
    if (r.dissolvedO2 < tol.minDO || r.dbo > tol.maxDBO) continue;
    // abundancia: los sensibles son más en agua limpia; los tolerantes se multiplican con la materia orgánica
    const base = f.score >= 6 ? Math.round(3 + (f.score - 5) * 1.6 * (1 - dirty)) : Math.round(1 + (f.score <= 2 ? 40 : 8) * dirty);
    if (f.score <= 3 && dirty < 0.02 && f.id !== 'chironomidae') continue; // en agua muy limpia casi no aparecen
    out.push({ ...f, count: Math.max(1, base) });
  }
  return out;
}

/** Clases de calidad del índice BMWP/Col (Roldán, 2003). */
export const BMWP_CLASSES = [
  { min: 101, cls: 'I', name: 'Buena', meaning: 'Aguas muy limpias a limpias', color: '#2f6fb3' },
  { min: 61, cls: 'II', name: 'Aceptable', meaning: 'Aguas ligeramente contaminadas', color: '#3a9b5c' },
  { min: 36, cls: 'III', name: 'Dudosa', meaning: 'Aguas moderadamente contaminadas', color: '#d4b82c' },
  { min: 16, cls: 'IV', name: 'Crítica', meaning: 'Aguas muy contaminadas', color: '#e0832f' },
  { min: 0, cls: 'V', name: 'Muy crítica', meaning: 'Aguas fuertemente contaminadas', color: '#c9372c' },
] as const;

export function bmwp(sample: { score: number }[]): { total: number; aspt: number; cls: (typeof BMWP_CLASSES)[number] } {
  const total = sample.reduce((a, f) => a + f.score, 0);
  const cls = BMWP_CLASSES.find((c) => total >= c.min)!;
  return { total, aspt: sample.length ? total / sample.length : 0, cls };
}

// ------------------------------------------------------------------ del río a la llave

export type RawCase = 'verano' | 'lluvia' | 'creciente';

/** Agua cruda que llega a la planta según el clima (valores típicos de un río de montaña). */
export const RAW_WATER: Record<RawCase, { name: string; turbidity: number; coliTotal: number; eColi: number; pH: number; note: string }> = {
  verano: { name: 'Tiempo seco', turbidity: 8, coliTotal: 2000, eColi: 300, pH: 7.4, note: 'El río baja claro.' },
  lluvia: { name: 'Después de llover', turbidity: 80, coliTotal: 20000, eColi: 3000, pH: 7.2, note: 'La lluvia arrastra tierra: el agua llega color café.' },
  creciente: { name: 'Creciente', turbidity: 400, coliTotal: 80000, eColi: 12000, pH: 7.1, note: 'Mucha tierra y basura: la planta trabaja al límite.' },
};

/** Dosis óptima didáctica de coagulante (sulfato de aluminio) [mg/L] para una turbiedad de agua cruda [UNT]. */
export function optimumDose(turbidity: number): number {
  return 6 * Math.pow(turbidity, 0.35);
}

/**
 * Turbiedad después de coagular, flocular y sedimentar [UNT] (regla didáctica que reproduce la forma de una
 * prueba de jarras: poca dosis no forma flocs; la dosis justa los forma; demasiada los vuelve a dispersar).
 */
export function settledTurbidity(raw: number, dose: number): number {
  const opt = optimumDose(raw);
  const e = dose > 0 ? 0.97 * Math.exp(-(Math.log(dose / opt) ** 2) / (2 * 0.55 ** 2)) : 0;
  return raw * (1 - Math.max(0.25, e));
}

/** Turbiedad después de los filtros de arena [UNT]: quitan 90 % si llega poca; si llega mucha, se tapan. */
export function filteredTurbidity(settled: number): { out: number; clogged: boolean } {
  const clogged = settled > 10;
  return { out: settled * (clogged ? 0.3 : 0.1), clogged };
}

export interface PlantInput {
  raw: RawCase;
  dose: number;
  chlorine: number;
  /** Horas que tarda el agua en llegar a la llave por la red. */
  networkH?: number;
}

export interface PlantResult {
  raw: (typeof RAW_WATER)[RawCase];
  optimum: number;
  settled: number;
  filtered: number;
  clogged: boolean;
  pH: number;
  demand: number;
  clExit: number;
  clTap: number;
  logKill: number;
  coliTotalTap: number;
  eColiTap: number;
  checks: { id: 'turbiedad' | 'ph' | 'cloro' | 'coliformes' | 'ecoli'; name: string; value: string; limit: string; ok: boolean; score: number }[];
  irca: number;
  risk: string;
}

/** Puntajes de riesgo de la Resolución 2115 de 2007 (cuadro 6) para las características que mide el juego. */
export const IRCA_SCORES = { turbiedad: 15, ph: 1.5, cloro: 15, coliformes: 15, ecoli: 25 } as const;

export function irvaRisk(irca: number): string {
  return irca <= 5 ? 'Sin riesgo' : irca <= 14 ? 'Riesgo bajo' : irca <= 35 ? 'Riesgo medio' : irca <= 80 ? 'Riesgo alto' : 'Inviable sanitariamente';
}

/**
 * Planta de potabilización: coagulación, floculación y sedimentación (prueba de jarras), filtración, cloración
 * y red hasta la llave. Resultado comparado con la Resolución 2115 de 2007 y su índice IRCA calculado con las
 * cinco características que mide el juego.
 */
/** Límites de las entradas de la planta. */
export const PLANT_LIMITS = { dose: [0, 200], chlorine: [0, 10], networkH: [0, 72] } as const;

/** Entrada de la planta siempre válida. */
export function sanitizePlant(inp: Partial<PlantInput> | null | undefined): PlantInput {
  const i = (inp ?? {}) as Partial<PlantInput>;
  return {
    raw: oneOf(i.raw, ['verano', 'lluvia', 'creciente'] as const, 'verano'),
    dose: clamp(fin(i.dose, 0), PLANT_LIMITS.dose[0], PLANT_LIMITS.dose[1]),
    chlorine: clamp(fin(i.chlorine, 0), PLANT_LIMITS.chlorine[0], PLANT_LIMITS.chlorine[1]),
    ...(i.networkH === undefined ? {} : { networkH: clamp(fin(i.networkH, 12), PLANT_LIMITS.networkH[0], PLANT_LIMITS.networkH[1]) }),
  };
}

export function treatPlant(input: PlantInput): PlantResult {
  const inp = sanitizePlant(input);
  const raw = RAW_WATER[inp.raw];
  const settled = settledTurbidity(raw.turbidity, inp.dose);
  const { out: filtered, clogged } = filteredTurbidity(settled);
  // el coagulante consume alcalinidad: el pH baja un poco (aproximación didáctica)
  const pH = raw.pH - 0.006 * inp.dose;
  // demanda de cloro: lo que reacciona con materia orgánica y partículas antes de quedar libre
  const demand = 0.4 + 0.15 * filtered + (inp.raw === 'creciente' ? 0.4 : inp.raw === 'lluvia' ? 0.2 : 0);
  const clExit = Math.max(0, inp.chlorine - demand);
  const net = inp.networkH ?? 12;
  const clTap = clExit * Math.exp(-0.05 * net);
  // microbios: la coagulación y los filtros quitan una parte; el cloro libre durante 30 min inactiva el resto,
  // menos si hay partículas que los esconden (turbiedad)
  const removal = (1 - Math.min(0.9, (raw.turbidity - settled) / raw.turbidity)) * (clogged ? 0.1 : 0.01);
  const ct = clExit * 30;
  const logKill = Math.min(6, (40 * ct) / (1 + 2 * filtered)) * (clExit >= 0.05 ? 1 : 0);
  const coliTotalTap = raw.coliTotal * removal * Math.pow(10, -logKill);
  const eColiTap = raw.eColi * removal * Math.pow(10, -logKill);
  const es = (v: number, d: number) => v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
  const show = (v: number) => (v < 0.5 ? '0' : v < 10 ? es(v, 1) : Math.round(v).toLocaleString('es-CO'));
  const checks: PlantResult['checks'] = [
    { id: 'turbiedad', name: 'Turbiedad', value: `${es(filtered, filtered < 10 ? 2 : 0)} UNT`, limit: 'máximo 2 UNT', ok: filtered <= 2, score: IRCA_SCORES.turbiedad },
    { id: 'ph', name: 'pH', value: es(pH, 1), limit: 'entre 6,5 y 9,0', ok: pH >= 6.5 && pH <= 9, score: IRCA_SCORES.ph },
    { id: 'cloro', name: 'Cloro residual libre', value: `${es(clExit, 2)} mg/L en la planta · ${es(clTap, 2)} en la llave`, limit: 'entre 0,3 y 2,0 mg/L en toda la red', ok: clExit <= 2 && clTap >= 0.3, score: IRCA_SCORES.cloro },
    { id: 'coliformes', name: 'Coliformes totales', value: `${show(coliTotalTap)} UFC/100 mL`, limit: '0 UFC/100 mL', ok: coliTotalTap < 0.5, score: IRCA_SCORES.coliformes },
    { id: 'ecoli', name: 'Escherichia coli', value: `${show(eColiTap)} UFC/100 mL`, limit: '0 UFC/100 mL', ok: eColiTap < 0.5, score: IRCA_SCORES.ecoli },
  ];
  const all = checks.reduce((a, c) => a + c.score, 0);
  const bad = checks.filter((c) => !c.ok).reduce((a, c) => a + c.score, 0);
  const irca = (bad / all) * 100;
  return { raw, optimum: optimumDose(raw.turbidity), settled, filtered, clogged, pH, demand, clExit, clTap, logKill, coliTotalTap, eColiTap, checks, irca, risk: irvaRisk(irca) };
}

/** Planta de tratamiento de aguas residuales: lo que queda de la materia orgánica (DBO5) después de cada etapa. */
export const PTAR_STAGES = [
  { id: 'cribado', name: 'Rejas y desarenador', remain: 0.95, what: 'Atrapan basura, plásticos y arena que llegan por el alcantarillado.' },
  { id: 'primario', name: 'Sedimentación primaria', remain: 0.65, what: 'El agua se queda quieta y lo pesado se va al fondo como lodo.' },
  { id: 'biologico', name: 'Tratamiento biológico', remain: 0.15, what: 'Bacterias, con aire que se les inyecta, se comen la materia orgánica disuelta.' },
  { id: 'secundario', name: 'Sedimentación secundaria', remain: 0.08, what: 'Las bacterias se asientan y el agua clara sale hacia el río.' },
] as const;

// ------------------------------------------------------------------ la calle cuando llueve

export interface StreetInput {
  dryDays: number;
  sweeping: boolean;
  litter: 'poca' | 'mucha';
  rainMmH: number;
  durationMin: number;
  /** Casas con el desagüe conectado por error al alcantarillado de aguas lluvias (de 20). */
  wrongHouses: number;
}

/** Área de calle y andenes de la cuadra del juego [m²] y techos [m²]. */
export const STREET = { area: 1200, roofs: 1600, houses: 20 } as const;

/**
 * Acumulación de sólidos en la calle entre lluvias [g/m²]: B = Bmax·(1 − e^(−k·días)), con Bmax = 25 g/m² y
 * k = 0,4/día (forma usada en SWMM); el barrido semanal quita cerca de la mitad.
 */
export function buildup(days: number, sweeping: boolean): number {
  const B = 25 * (1 - Math.exp(-0.4 * days));
  return sweeping ? B * 0.5 : B;
}

/**
 * Lavado de la calle con la lluvia (Sartor y Boyd, 1972): la fracción arrastrada es 1 − e^(−0,18·R), con R la
 * lluvia caída en mm. Devuelve la serie cada minuto: masa arrastrada [kg], concentración en el agua que sale
 * de la calle [mg/L] y caudal [L/s].
 */
/** Límites de las entradas de la calle. */
export const STREET_LIMITS = { dryDays: [0, 60], rainMmH: [0, 300], durationMin: [1, 240], wrongHouses: [0, STREET.houses] } as const;

/** Entrada de la calle siempre válida. */
export function sanitizeStreet(inp: Partial<StreetInput> | null | undefined): StreetInput {
  const i = (inp ?? {}) as Partial<StreetInput>;
  return {
    dryDays: clamp(fin(i.dryDays, 5), STREET_LIMITS.dryDays[0], STREET_LIMITS.dryDays[1]),
    sweeping: typeof i.sweeping === 'boolean' ? i.sweeping : false,
    litter: oneOf(i.litter, ['poca', 'mucha'] as const, 'poca'),
    rainMmH: clamp(fin(i.rainMmH, 30), STREET_LIMITS.rainMmH[0], STREET_LIMITS.rainMmH[1]),
    durationMin: Math.round(clamp(fin(i.durationMin, 30), STREET_LIMITS.durationMin[0], STREET_LIMITS.durationMin[1])),
    wrongHouses: Math.round(clamp(fin(i.wrongHouses, 0), STREET_LIMITS.wrongHouses[0], STREET_LIMITS.wrongHouses[1])),
  };
}

export function washoff(input: StreetInput): { t: number[]; conc: number[]; massKg: number[]; flowLs: number[]; totalKg: number; firstFlushPct: number; trashItems: number; sewageM3: number; coliformsGiga: number } {
  const inp = sanitizeStreet(input);
  const B0 = buildup(inp.dryDays, inp.sweeping) * STREET.area; // g
  const t: number[] = [], conc: number[] = [], massKg: number[] = [], flowLs: number[] = [];
  let left = B0, cum = 0, cumRain = 0, firstHalf = 0;
  const runoffC = 0.9;
  for (let m = 1; m <= inp.durationMin; m++) {
    const rainMm = inp.rainMmH / 60;
    const r0 = cumRain;
    cumRain += rainMm;
    const washed = left * (1 - Math.exp(-0.18 * rainMm));
    left -= washed;
    cum += washed;
    if (r0 < 10 && rainMm > 0) firstHalf += washed * Math.min(1, (10 - r0) / rainMm);
    const vol = (runoffC * rainMm * STREET.area) / 1000; // m³ en ese minuto
    t.push(m);
    conc.push(vol > 0 ? washed / vol : 0); // g/m³ = mg/L
    massKg.push(cum / 1000);
    flowLs.push((vol * 1000) / 60);
  }
  // basura: cada día seco se acumulan papeles y plásticos; sin barrido llegan más al sumidero
  const trashItems = Math.round(inp.dryDays * (inp.litter === 'mucha' ? 6 : 1.5) * (inp.sweeping ? 0.4 : 1));
  // conexiones erradas: el agua usada de esas casas va al tubo de aguas lluvias todos los días, llueva o no
  const sewageM3 = (inp.wrongHouses * PERSONS_PER_HOUSE * RAW_SEWAGE.litersPerPerson) / 1000; // m³/día
  const coliformsGiga = (sewageM3 * 1e6 * (RAW_SEWAGE.coliforms / 100)) / 1e9; // miles de millones por día
  return { t, conc, massKg, flowLs, totalKg: cum / 1000, firstFlushPct: cum > 0 ? (firstHalf / cum) * 100 : 0, trashItems, sewageM3, coliformsGiga };
}

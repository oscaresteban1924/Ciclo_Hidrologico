// «De la casa al río»: una planta de tratamiento de aguas residuales (PTAR) de lodos activados, del colector a la
// descarga, con su línea de lodos. Funciones puras (sin interfaz), probadas en tests/quality/model.test.ts. Las
// fórmulas, los valores y las fuentes están en docs/calidad/MODELO_CALIDAD.md (sección PTAR).
//
// Lo que es ecuación publicada (cinética de Monod con edad del lodo, remoción primaria de Crites y
// Tchobanoglous, demanda de oxígeno, Streeter y Phelps) y lo que es regla didáctica (el sedimentador secundario,
// el índice volumétrico del lodo, la desinfección UV) se señala en cada función. La planta es una escena
// ilustrativa: no describe San Fernando, Aguas Claras ni otra planta real, y su resultado no es un diseño de
// ingeniería.

import { ELEV_MEDELLIN_M, FISH, NH3_PER_N, NITRIF, RAW_SEWAGE, doSat, nh3Fraction, theta } from './model';

// ------------------------------------------------------------------ entradas

export type Weather = 'seco' | 'lluvia' | 'aguacero';
export type Purga = 'poca' | 'normal' | 'mucha';

export interface PtarInput {
  /** Habitantes conectados al alcantarillado que llega a la planta. */
  pop: number;
  /** Líneas de tratamiento en servicio (cada una con su primario, su reactor y su secundario). */
  lines: 1 | 2;
  weather: Weather;
  /** Sedimentador primario en servicio (si no, el agua pasa directo del desarenador al reactor). */
  primary: boolean;
  /** Oxígeno disuelto que los sopladores mantienen en el reactor [mg/L] (0 = sopladores apagados). */
  air: number;
  /** Recirculación del lodo del sedimentador secundario al reactor. */
  recirc: boolean;
  /** Cuánto lodo se purga cada día: fija la edad del lodo. */
  purga: Purga;
  /** Desinfección con luz ultravioleta encendida. */
  uv: boolean;
}

export const DEFAULT_PTAR: PtarInput = { pop: 50000, lines: 1, weather: 'seco', primary: true, air: 2, recirc: true, purga: 'normal', uv: true };

/** Límites de las entradas (lo que está fuera se lleva al borde; lo que no es válido, al valor por defecto). */
export const PTAR_LIMITS = { pop: [5000, 150000], air: [0, 4] } as const;

const fin = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const oneOf = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (typeof v === 'string' && (ok as readonly string[]).includes(v) ? (v as T) : d);

/** Entrada de la PTAR siempre válida. */
export function sanitizePtar(inp: Partial<PtarInput> | null | undefined): PtarInput {
  const i = (inp ?? {}) as Partial<PtarInput>;
  return {
    pop: Math.round(clamp(fin(i.pop, DEFAULT_PTAR.pop), PTAR_LIMITS.pop[0], PTAR_LIMITS.pop[1])),
    lines: i.lines === 2 ? 2 : 1,
    weather: oneOf(i.weather, ['seco', 'lluvia', 'aguacero'] as const, DEFAULT_PTAR.weather),
    primary: typeof i.primary === 'boolean' ? i.primary : DEFAULT_PTAR.primary,
    air: clamp(fin(i.air, DEFAULT_PTAR.air), PTAR_LIMITS.air[0], PTAR_LIMITS.air[1]),
    recirc: typeof i.recirc === 'boolean' ? i.recirc : DEFAULT_PTAR.recirc,
    purga: oneOf(i.purga, ['poca', 'normal', 'mucha'] as const, DEFAULT_PTAR.purga),
    uv: typeof i.uv === 'boolean' ? i.uv : DEFAULT_PTAR.uv,
  };
}

// ------------------------------------------------------------------ datos de la planta

/** Agua residual doméstica cruda: la misma de la quebrada (model.ts) más sólidos suspendidos y grasas. */
export const SEWAGE = {
  /** Agua usada que vuelve al alcantarillado por persona [L/día]. */
  lpcd: RAW_SEWAGE.litersPerPerson,
  dbo: RAW_SEWAGE.dbo,
  /** Sólidos suspendidos totales [mg/L] (agua residual de concentración media a alta, Metcalf y Eddy). */
  sst: 250,
  nh4: RAW_SEWAGE.ammoniaN,
  /** Grasas y aceites [mg/L]. */
  gya: 80,
  coli: RAW_SEWAGE.coliforms,
  T: RAW_SEWAGE.temperature,
  pH: RAW_SEWAGE.pH,
  dO: RAW_SEWAGE.dissolvedO2,
} as const;

/** Agua de lluvia que entra al alcantarillado combinado (escorrentía urbana, valores típicos). */
export const RUNOFF = { dbo: 20, sst: 150, nh4: 1, gya: 5, coli: 1e5, T: 18 } as const;

/** El clima: cuántas veces crece el caudal que llega (alcantarillado combinado) y el río que recibe la descarga. */
export const WEATHER: Record<Weather, { name: string; mult: number; river: { Q: number; T: number; sat: number; dbo: number; nh4: number; sst: number; coli: number; pH: number } }> = {
  seco: { name: 'Tiempo seco', mult: 1, river: { Q: 0.4, T: 21, sat: 0.9, dbo: 3, nh4: 0.2, sst: 15, coli: 2000, pH: 7.5 } },
  lluvia: { name: 'Lluvia', mult: 2, river: { Q: 1.2, T: 20, sat: 0.92, dbo: 5, nh4: 0.3, sst: 80, coli: 1e4, pH: 7.4 } },
  aguacero: { name: 'Aguacero', mult: 4, river: { Q: 3.5, T: 19, sat: 0.94, dbo: 8, nh4: 0.4, sst: 250, coli: 5e4, pH: 7.3 } },
};

/**
 * Dimensiones de cada línea de tratamiento, calculadas para el caudal medio de 50 000 habitantes (5 100 m³/día):
 * primario de 2 h, reactor de 6 h y secundario con carga superficial de 24 m³/m²·día. La planta recibe hasta
 * 2,5 veces ese caudal por línea; lo que sobra se va por el aliviadero sin tratar.
 */
export const PTAR_DESIGN = {
  popPerLine: 50000,
  peak: 2.5,
  primaryHRTh: 2,
  /** Profundidad del agua en el primario [m]: con 2 h de retención, carga superficial de 42 m³/m²·día. */
  primaryDepth: 3.5,
  reactorHRTh: 6,
  sor: 24,
  /** Temperatura del agua en el reactor [°C] (el agua residual del valle es tibia). */
  T: 22,
  /** Edad del lodo [días] según la purga. */
  srt: { poca: 20, normal: 8, mucha: 1.5 } as Record<Purga, number>,
} as const;

/** Caudal medio de diseño de una línea [m³/día]. */
export const Q_LINE = (PTAR_DESIGN.popPerLine * SEWAGE.lpcd) / 1000;

/**
 * Cinética de las bacterias del lodo activado a 20 °C (Metcalf y Eddy, Wastewater Engineering, 4.ª ed., tablas
 * 7-9 y 7-10): heterótrofas que comen la DBO (k, Ks, Y, kd) y nitrificantes que pasan el amonio a nitrato (μn,
 * KN, kdn). K_OH y K_O: oxígeno al que cada grupo trabaja a la mitad de su velocidad.
 */
export const KIN = {
  k: 5, thK: 1.07, Ks: 60, Y: 0.6, kd: 0.06, thKd: 1.04, KOH: 0.2,
  muN: 0.75, thMuN: 1.07, KN: 0.74, thKN: 1.053, kdN: 0.08, thKdN: 1.04, KO: 0.5,
  /** DBO5 / DBO última. */
  f: 0.68,
  /** Nitrógeno que se queda en las bacterias nuevas [g N / g SSV]. */
  nCell: 0.12,
} as const;

/** Resolución 0631 de 2015, artículo 8: ARD de prestadores del servicio de alcantarillado a aguas superficiales,
 *  por carga de DBO5 (≤ 625, de 625 a 3 000 y > 3 000 kg/día). pH entre 6 y 9 en las tres. */
export const RES_0631: Record<1 | 2 | 3, { label: string; dqo: number; dbo: number; sst: number; ssed: number; gya: number }> = {
  1: { label: 'carga de 625 kg/día de DBO5 o menos', dqo: 180, dbo: 90, sst: 90, ssed: 5, gya: 20 },
  2: { label: 'carga de más de 625 y hasta 3 000 kg/día de DBO5', dqo: 180, dbo: 90, sst: 90, ssed: 5, gya: 20 },
  3: { label: 'carga de más de 3 000 kg/día de DBO5', dqo: 150, dbo: 70, sst: 70, ssed: 5, gya: 10 },
};

/** Energía neta máxima del reto «Cumplir gastando poco» [kWh por m³ tratado]. */
export const ENERGY_GOAL = 0.17;

/** Oxígeno mínimo para los peces de un río de aguas cálidas [mg/L] (Decreto 1076 de 2015, art. 2.2.3.3.9.10,
 *  antes art. 45 del Decreto 1594 de 1984: 4,0 mg/L en aguas cálidas y 5,0 en frías). */
export const RIVER_FISH_DO = 4;

// ------------------------------------------------------------------ resultado

/** Calidad del agua en un punto de la planta. Concentraciones en mg/L; coliformes en NMP/100 mL; Q en m³/día. */
export interface Water {
  Q: number;
  dbo: number;
  dqo: number;
  sst: number;
  /** Sólidos sedimentables [mL/L] (cono Imhoff, 1 h). */
  ssed: number;
  nh4: number;
  no3: number;
  gya: number;
  coli: number;
  dO: number;
  pH: number;
}

export interface Reactor {
  /** Tiempo de retención hidráulica [h] y edad del lodo [días]. */
  hrtH: number;
  srtD: number;
  /** Edad mínima del lodo: con menos, las bacterias se van con el agua más rápido de lo que crecen [días]. */
  srtMinD: number;
  /** Las bacterias heterótrofas se lavaron (sin recirculación, sin aire o con la edad del lodo muy corta). */
  washout: boolean;
  /** Las nitrificantes sobreviven y pasan el amonio a nitrato. */
  nitrify: boolean;
  srtMinND: number;
  /** DBO soluble que queda en el reactor [mg/L]. */
  S: number;
  /** Biomasa activa [mg/L SSV] y sólidos del licor mixto [mg/L SST]. */
  X: number;
  mlss: number;
  /** Índice volumétrico del lodo [mL/g] y volumen sedimentado en la probeta a los 30 min [mL/L]. */
  svi: number;
  sv30: number;
  /** El lodo no se asienta bien: «abultamiento» (bacterias en hilos) o crecimiento disperso (lodo muy joven). */
  bulking: boolean;
  dispersed: boolean;
  /** Oxígeno que hay que darle al reactor [kg O₂/día] y energía de los sopladores [kWh/día]. */
  o2KgD: number;
  kgO2PerKwh: number;
  airKwhD: number;
  /** Lodo nuevo que crece cada día [kg SSV/día]. */
  pxKgD: number;
}

export interface Clarifier {
  /** Carga superficial [m³/m²·día]. */
  sor: number;
  /** Tiempo de retención del primario [h] y remociones (fracción). */
  hrtH: number;
  rDbo: number;
  rSst: number;
}

export interface Sludge {
  primaryKgD: number;
  wasKgD: number;
  vsKgD: number;
  vsDestroyedKgD: number;
  biogasM3D: number;
  ch4Pct: number;
  kwhD: number;
  /** Biosólido deshidratado (torta con 22 % de sólidos) [toneladas/día]. */
  cakeTD: number;
}

export interface Energy {
  airKwhD: number;
  baseKwhD: number;
  uvKwhD: number;
  totalKwhD: number;
  biogasKwhD: number;
  /** Energía por metro cúbico tratado, total y neta (descontando la del biogás) [kWh/m³]. */
  perM3: number;
  netPerM3: number;
  /** Parte de la energía de la planta que da el biogás [%]. */
  coverPct: number;
}

export interface RiverPoint {
  xKm: number;
  dO: number;
  dbo: number;
  nh4: number;
  nh3: number;
  coli: number;
}

export interface River {
  Q: number;
  up: RiverPoint;
  /** Mezcla en la descarga. */
  mix: RiverPoint;
  at: (xKm: number) => RiverPoint;
  minDO: number;
  xMinKm: number;
  sat: number;
  /** Los peces aguantan en todo el tramo (oxígeno ≥ 4 mg/L y amoníaco libre ≤ 0,025 mg/L). */
  fishOk: boolean;
  fishWhy: string[];
}

export interface PtarCheck {
  id: 'ph' | 'dqo' | 'dbo' | 'sst' | 'ssed' | 'gya';
  name: string;
  value: number;
  shown: string;
  limit: string;
  ok: boolean;
}

export interface PtarResult {
  inp: PtarInput;
  /** Carga de DBO5 de las aguas residuales que recoge el alcantarillado [kg/día] y categoría de la norma. */
  loadKgD: number;
  cat: 1 | 2 | 3;
  /** Caudales [m³/día]: aguas residuales, lluvia, llegada, capacidad, tratado y aliviado. */
  Qsew: number;
  Qrun: number;
  Qin: number;
  Qcap: number;
  Qtreat: number;
  Qbypass: number;
  bypassPct: number;
  /** Agua en cada punto: lo que llega, después del pretratamiento, del primario, del secundario y a la salida. */
  raw: Water;
  pre: Water;
  prim: Water;
  sec: Water;
  eff: Water;
  /** Lo que pasa por el aliviadero sin tratar (Q = 0 si no rebosa). */
  bypass: Water;
  primary: Clarifier;
  secondary: Clarifier;
  reactor: Reactor;
  /** Remoción de coliformes en unidades logarítmicas (1 log = 90 %, 2 = 99 %…). */
  logs: { primary: number; bio: number; uv: number; total: number };
  sludge: Sludge;
  energy: Energy;
  /** Basura de las rejas [L/día], arena [L/día] y grasas retiradas [kg/día]. */
  trashLD: number;
  sandLD: number;
  fogKgD: number;
  checks: PtarCheck[];
  complies: boolean;
  river: River;
}

// ------------------------------------------------------------------ partes del cálculo

/** Remoción en el sedimentador primario según su tiempo de retención t [h]: R = t / (a + b·t) (Crites y
 *  Tchobanoglous, 1998, en Metcalf y Eddy). DBO: a = 0,018, b = 0,020; SST: a = 0,0075, b = 0,014. */
export function primaryRemoval(tH: number): { dbo: number; sst: number } {
  if (!(tH > 0)) return { dbo: 0, sst: 0 };
  return { dbo: tH / (0.018 + 0.02 * tH), sst: tH / (0.0075 + 0.014 * tH) };
}
// las fórmulas dan porcentaje: se pasan a fracción al usarlas

/** Sólidos suspendidos que se escapan del sedimentador secundario [mg/L] (regla didáctica): 10 mg/L con la carga
 *  de diseño; crecen con la carga superficial, con más lodo en el reactor, con un lodo que se asienta mal y con
 *  el crecimiento disperso de un lodo muy joven. Nunca más que el lodo que hay. */
export function secondaryTss(sor: number, mlss: number, svi: number, dispersed: boolean): number {
  const f = 10 * Math.exp((sor - PTAR_DESIGN.sor) / 20) * Math.pow(Math.max(mlss, 300) / 3000, 0.7) * Math.pow(svi / 100, 0.8) * (dispersed ? 2.2 : 1);
  return Math.min(f, Math.max(mlss, 30));
}

/** Índice volumétrico del lodo [mL/g] (regla didáctica): unos 110 con la purga normal; con poco oxígeno crecen
 *  bacterias en hilos y el lodo «se abulta» (más de 150 se asienta mal). */
export function sludgeVolumeIndex(air: number, purga: Purga): number {
  const base = { poca: 95, normal: 110, mucha: 170 }[purga];
  return base + 220 * Math.pow(Math.max(0, 1 - air / 1.2), 1.5);
}

/** Oxígeno que la aireación pasa al agua por kWh [kg O₂/kWh]: difusores de burbuja fina con 3,6 kg/kWh en agua
 *  limpia, factor α = 0,5 del agua residual y la fuerza que queda entre la saturación y el oxígeno pedido. */
export function aerationEfficiency(air: number, T: number, elevM = ELEV_MEDELLIN_M): number {
  const cs = doSat(T, elevM), cs20 = doSat(20, 0);
  return (3.6 * 0.5 * Math.max(0.05, cs - air)) / cs20 * Math.pow(1.024, T - 20);
}

/** Déficit que deja una demanda de primer orden de carga C0 y velocidad k con reaireación ka (Streeter y Phelps). */
function spDeficit(ka: number, k: number, C0: number, t: number): number {
  return Math.abs(ka - k) > 1e-9 ? ((k * C0) / (ka - k)) * (Math.exp(-k * t) - Math.exp(-ka * t)) : k * C0 * t * Math.exp(-ka * t);
}

const dqoOf = (dbo: number) => 2 * dbo + 25;

// ------------------------------------------------------------------ la planta

/**
 * Planta de lodos activados de una o dos líneas: llegada (con aliviadero), rejas, desarenador y desengrasador,
 * sedimentador primario, reactor aireado, sedimentador secundario con recirculación, desinfección UV y descarga
 * al río; los lodos van al espesador, al digestor (biogás) y a la deshidratación.
 */
export function ptarModel(input: Partial<PtarInput>): PtarResult {
  const inp = sanitizePtar(input);
  const W = WEATHER[inp.weather];
  const T = PTAR_DESIGN.T;
  const Qsew = (inp.pop * SEWAGE.lpcd) / 1000;
  const Qrun = Qsew * (W.mult - 1);
  const Qin = Qsew + Qrun;
  const Qdes = Q_LINE * inp.lines;
  const Qcap = Qdes * PTAR_DESIGN.peak;
  const Qtreat = Math.min(Qin, Qcap);
  const Qbypass = Qin - Qtreat;
  const loadKgD = (Qsew * SEWAGE.dbo) / 1000;
  const cat: 1 | 2 | 3 = loadKgD <= 625 ? 1 : loadKgD <= 3000 ? 2 : 3;
  const mix = (a: number, b: number) => (Qsew * a + Qrun * b) / Qin;
  const rawDbo = mix(SEWAGE.dbo, RUNOFF.dbo), rawSst = mix(SEWAGE.sst, RUNOFF.sst);
  const raw: Water = {
    Q: Qin,
    dbo: rawDbo,
    dqo: dqoOf(rawDbo),
    sst: rawSst,
    ssed: 0.04 * rawSst,
    nh4: mix(SEWAGE.nh4, RUNOFF.nh4),
    no3: 0,
    gya: mix(SEWAGE.gya, RUNOFF.gya),
    coli: mix(SEWAGE.coli, RUNOFF.coli),
    dO: SEWAGE.dO,
    pH: SEWAGE.pH,
  };
  const bypass: Water = { ...raw, Q: Qbypass };

  // ---- pretratamiento: rejas (basura), desarenador (arena) y desengrasador (la mitad de las grasas)
  const pre: Water = { ...raw, Q: Qtreat, gya: raw.gya * 0.5 };
  const trashLD = (Qtreat / 1000) * 20 * (inp.weather === 'seco' ? 1 : inp.weather === 'lluvia' ? 2 : 3.5);
  const sandLD = (Qtreat / 1000) * 15 * (inp.weather === 'seco' ? 1 : inp.weather === 'lluvia' ? 3 : 6);
  const fogKgD = (Qtreat * (raw.gya - pre.gya)) / 1000;

  // ---- sedimentador primario
  const tPrim = (PTAR_DESIGN.primaryHRTh * Qdes) / Qtreat;
  const rp = inp.primary ? primaryRemoval(tPrim) : { dbo: 0, sst: 0 };
  const rDbo = rp.dbo / 100, rSst = rp.sst / 100;
  const primSor = inp.primary ? (PTAR_DESIGN.primaryDepth * 24) / tPrim : 0;
  const primDbo = pre.dbo * (1 - rDbo), primSst = pre.sst * (1 - rSst);
  const prim: Water = {
    ...pre,
    dbo: primDbo,
    dqo: dqoOf(primDbo),
    sst: primSst,
    ssed: pre.ssed * (1 - Math.min(0.95, 1.7 * rSst)),
    gya: pre.gya * (inp.primary ? 0.5 : 1),
    coli: pre.coli * (inp.primary ? 0.5 : 1),
  };

  // ---- reactor de lodos activados (mezcla completa, cinética de Monod con edad del lodo)
  const hrtD = (PTAR_DESIGN.reactorHRTh / 24) * (Qdes / Qtreat);
  const srtSet = PTAR_DESIGN.srt[inp.purga];
  // sin recirculación las bacterias se van con el agua: la edad del lodo es el tiempo de retención
  const srtD = inp.recirc ? Math.max(srtSet, hrtD) : hrtD;
  const kT = theta(KIN.k, KIN.thK, T) * (inp.air / (KIN.KOH + inp.air));
  const kdT = theta(KIN.kd, KIN.thKd, T);
  const grow = KIN.Y * kT - kdT;
  const srtMinD = grow > 0 ? 1 / grow : Infinity;
  const washout = !(srtD > srtMinD * 1.02);
  const S0 = prim.dbo;
  const S = washout ? S0 : Math.min(S0, (KIN.Ks * (1 + kdT * srtD)) / (srtD * grow - 1));
  const X = washout ? 0 : (srtD / hrtD) * ((KIN.Y * (S0 - S)) / (1 + kdT * srtD));
  // sólidos inertes que llegan con el agua y se acumulan con la edad del lodo
  const inert = (srtD / hrtD) * 0.25 * prim.sst;
  const mlss = X / 0.8 + inert;
  const pxKgD = washout ? 0 : (KIN.Y * Qtreat * (S0 - S)) / (1 + kdT * srtD) / 1000;
  // nitrificantes
  const muN = theta(KIN.muN, KIN.thMuN, T) * (inp.air / (KIN.KO + inp.air));
  const kdN = theta(KIN.kdN, KIN.thKdN, T);
  const KN = theta(KIN.KN, KIN.thKN, T);
  const growN = muN - kdN;
  const srtMinND = growN > 0 ? 1 / growN : Infinity;
  const nAvail = Math.max(0, prim.nh4 - (KIN.nCell * pxKgD * 1000) / Qtreat);
  const nitrify = !washout && srtD > srtMinND * 1.02;
  const nh4Out = nitrify ? Math.min(nAvail, (KN * (1 + kdN * srtD)) / (srtD * growN - 1)) : nAvail;
  const nNitr = Math.max(0, nAvail - nh4Out);
  // asentamiento del lodo
  const dispersed = !washout && srtD < 2;
  const svi = washout ? 300 : sludgeVolumeIndex(inp.air, inp.purga);
  const bulking = !washout && svi > 150;
  const sv30 = Math.min(1000, (mlss * svi) / 1000);
  // oxígeno: DBO última removida − la que queda en las bacterias nuevas + la nitrificación (Metcalf y Eddy, ec. 7-59)
  const o2KgD = washout || inp.air <= 0 ? 0 : Math.max(0, (Qtreat * (S0 - S)) / KIN.f / 1000 - 1.42 * pxKgD + (4.57 * Qtreat * nNitr) / 1000);
  const kgO2PerKwh = aerationEfficiency(inp.air, T);
  const airKwhD = o2KgD > 0 ? o2KgD / kgO2PerKwh : 0;
  const reactor: Reactor = { hrtH: hrtD * 24, srtD, srtMinD, washout, nitrify, srtMinND, S, X, mlss, svi, sv30, bulking, dispersed, o2KgD, kgO2PerKwh, airKwhD, pxKgD };

  // ---- sedimentador secundario
  const sor = (PTAR_DESIGN.sor * Qtreat) / Qdes;
  // sin bacterias, casi nada más se asienta y la materia orgánica sigue entera; con bacterias, la DBO que queda
  // es la disuelta más la de los sólidos que se escapan (0,5 mg de DBO por mg). Un secundario sobrecargado puede
  // perder su lodo: el juego no deja que el agua salga más sucia que como llegó al reactor ni que a la planta.
  const secSst = washout ? 0.85 * prim.sst : Math.min(secondaryTss(sor, mlss, svi, dispersed), raw.sst);
  const secDbo = washout ? S0 : Math.min(S0, S + 0.5 * secSst);
  const logBio = washout ? 0.2 : 1.5;
  const sec: Water = {
    ...prim,
    dbo: secDbo,
    dqo: dqoOf(secDbo),
    sst: secSst,
    ssed: washout ? 0.01 * secSst : 0.03 * secSst,
    nh4: nh4Out,
    no3: nNitr,
    gya: prim.gya * (washout ? 0.9 : 0.12),
    coli: prim.coli * Math.pow(10, -logBio),
    dO: washout ? 0.3 : Math.min(doSat(T, ELEV_MEDELLIN_M), 0.6 * inp.air + 0.4),
    pH: SEWAGE.pH - 0.025 * nNitr,
  };

  // ---- desinfección UV: la turbiedad esconde a las bacterias de la luz
  const logUv = inp.uv ? 3.5 / (1 + Math.max(0, sec.sst - 10) / 20) : 0;
  const eff: Water = { ...sec, coli: sec.coli * Math.pow(10, -logUv), dO: Math.min(doSat(T, ELEV_MEDELLIN_M), sec.dO + 1.5) };
  const logPrim = inp.primary ? Math.log10(2) : 0;
  const logs = { primary: logPrim, bio: logBio, uv: logUv, total: logPrim + logBio + logUv };

  // ---- lodos: espesador, digestor anaerobio (biogás) y deshidratación
  const primaryKgD = (Qtreat * (pre.sst - prim.sst)) / 1000;
  const wasKgD = washout ? 0 : (mlss * (hrtD * Qtreat)) / srtD / 1000;
  // sólidos volátiles: 65 % del lodo primario; del biológico, la biomasa activa y 60 % de los inertes
  const vsP = 0.65 * primaryKgD, vsW = mlss > 0 ? (wasKgD * (X + 0.6 * inert)) / mlss : 0;
  // el lodo primario se digiere mejor que el biológico (60 % y 35 % de los sólidos volátiles)
  const vsDestroyedKgD = 0.6 * vsP + 0.35 * vsW;
  const biogasM3D = 0.9 * vsDestroyedKgD;
  const ch4Pct = 65;
  // 35,8 MJ/m³ de metano, 35 % de eficiencia eléctrica del motor-generador
  const kwhD = (biogasM3D * (ch4Pct / 100) * 35.8 * 0.35) / 3.6;
  const cakeTD = (primaryKgD + wasKgD - vsDestroyedKgD) / 0.22 / 1000;
  const sludge: Sludge = { primaryKgD, wasKgD, vsKgD: vsP + vsW, vsDestroyedKgD, biogasM3D, ch4Pct, kwhD, cakeTD };

  // ---- energía de la planta
  const baseKwhD = 0.12 * Qtreat; // bombeo, rejas, puentes, recirculación, edificios
  const uvKwhD = inp.uv ? 0.03 * Qtreat : 0;
  const totalKwhD = airKwhD + baseKwhD + uvKwhD;
  const energy: Energy = {
    airKwhD,
    baseKwhD,
    uvKwhD,
    totalKwhD,
    biogasKwhD: kwhD,
    perM3: totalKwhD / Qtreat,
    netPerM3: Math.max(0, totalKwhD - kwhD) / Qtreat,
    coverPct: Math.min(100, (kwhD / totalKwhD) * 100),
  };

  // ---- norma: Resolución 0631 de 2015, art. 8, sobre el agua tratada
  const lim = RES_0631[cat];
  const es = (v: number, d: number) => v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
  const mg = (v: number) => `${es(v, v < 10 ? 1 : 0)} mg/L`;
  const checks: PtarCheck[] = [
    { id: 'ph', name: 'pH', value: eff.pH, shown: es(eff.pH, 1), limit: 'entre 6 y 9', ok: eff.pH >= 6 && eff.pH <= 9 },
    { id: 'dqo', name: 'DQO', value: eff.dqo, shown: mg(eff.dqo), limit: `máximo ${lim.dqo} mg/L`, ok: eff.dqo <= lim.dqo },
    { id: 'dbo', name: 'DBO5', value: eff.dbo, shown: mg(eff.dbo), limit: `máximo ${lim.dbo} mg/L`, ok: eff.dbo <= lim.dbo },
    { id: 'sst', name: 'Sólidos suspendidos', value: eff.sst, shown: mg(eff.sst), limit: `máximo ${lim.sst} mg/L`, ok: eff.sst <= lim.sst },
    { id: 'ssed', name: 'Sólidos sedimentables', value: eff.ssed, shown: `${es(eff.ssed, 1)} mL/L`, limit: `máximo ${lim.ssed} mL/L`, ok: eff.ssed <= lim.ssed },
    { id: 'gya', name: 'Grasas y aceites', value: eff.gya, shown: mg(eff.gya), limit: `máximo ${lim.gya} mg/L`, ok: eff.gya <= lim.gya },
  ];
  const complies = checks.every((c) => c.ok);

  // ---- el río: mezcla en la descarga y oxígeno aguas abajo (Streeter y Phelps con nitrificación y lodo del fondo)
  const river = riverModel(inp, eff, Qtreat, bypass, washout);

  return {
    inp, loadKgD, cat, Qsew, Qrun, Qin, Qcap, Qtreat, Qbypass, bypassPct: (Qbypass / Qin) * 100,
    raw, pre, prim, sec, eff, bypass,
    primary: { sor: primSor, hrtH: inp.primary ? tPrim : 0, rDbo, rSst },
    secondary: { sor, hrtH: 0, rDbo: 1 - sec.dbo / Math.max(1e-9, prim.dbo), rSst: 1 - sec.sst / Math.max(1e-9, prim.sst) },
    reactor, logs, sludge, energy, trashLD, sandLD, fogKgD, checks, complies, river,
  };
}

/** Geometría ilustrativa del río que recibe la descarga: ancho, profundidad y velocidad para un caudal [m³/s]. */
export function riverHydraulics(Q: number): { W: number; H: number; U: number } {
  const H = 0.9 * Math.pow(Q, 0.35), W = 10 * Math.pow(Q, 0.45);
  return { W, H, U: Q / (W * H) };
}

/** Distancia del tramo con lodo en el fondo cuando llega agua sin tratar [km]. */
export const RIVER_SLUDGE_KM = 4;

function riverModel(inp: PtarInput, eff: Water, Qtreat: number, bp: Water, washout: boolean): River {
  const up = WEATHER[inp.weather].river;
  const elev = ELEV_MEDELLIN_M;
  const Qr = up.Q * 86400; // m³/día
  const Q = Qr + Qtreat + bp.Q;
  const m = (r: number, e: number, b: number) => (Qr * r + Qtreat * e + bp.Q * b) / Q;
  const T = m(up.T, PTAR_DESIGN.T, PTAR_DESIGN.T - 1);
  const satUp = doSat(up.T, elev);
  const sat = doSat(T, elev);
  const dO0 = m(up.sat * satUp, eff.dO, bp.dO);
  const L0 = m(up.dbo, eff.dbo, bp.dbo);
  const N0 = m(up.nh4, eff.nh4, bp.nh4);
  const C0 = m(up.coli, eff.coli, bp.coli);
  const pH = m(up.pH, eff.pH, bp.pH);
  // la materia orgánica sin tratar se descompone más rápido que la que dejó la planta; deja lodo en el fondo
  const rawLoad = (bp.Q * bp.dbo + (washout ? Qtreat * eff.dbo : 0)) / 1000; // kg/día
  const addLoad = (bp.Q * bp.dbo + Qtreat * eff.dbo) / 1000;
  const fraw = addLoad > 0 ? rawLoad / addLoad : 0;
  const { H, U } = riverHydraulics(Q / 86400);
  // reaireación de O'Connor y Dobbins (Chapra): ka = 3,93·U^0,5/H^1,5 a 20 °C
  const ka = theta((3.93 * Math.sqrt(U)) / Math.pow(H, 1.5), 1.024, T);
  const kd = theta(0.25 + 0.35 * fraw, 1.047, T);
  const kn = theta(NITRIF.k20, NITRIF.theta, T);
  const kb = theta(0.8, 1.07, T);
  const sodV = (theta(Math.min(5, rawLoad / 400), 1.065, T) / H); // mg/L/día
  const D0 = sat - dO0;
  const frac = nh3Fraction(T, pH);
  const at = (xKm: number): RiverPoint => {
    const x = Math.max(0, Number.isFinite(xKm) ? xKm : 0);
    const t = (x * 1000) / U / 86400;
    const tS = Math.min(t, (RIVER_SLUDGE_KM * 1000) / U / 86400);
    const dSod = sodV > 0 ? (sodV / ka) * (1 - Math.exp(-ka * tS)) * Math.exp(-ka * (t - tS)) : 0;
    const D = D0 * Math.exp(-ka * t) + spDeficit(ka, kd, L0, t) + spDeficit(ka, kn, NITRIF.o2PerN * N0, t) + dSod;
    const N = N0 * Math.exp(-kn * t);
    return { xKm: x, dO: Math.max(0, sat - D), dbo: L0 * Math.exp(-kd * t), nh4: N, nh3: N * frac * NH3_PER_N, coli: C0 * Math.exp(-kb * t) };
  };
  let minDO = Infinity, xMinKm = 0;
  for (let k = 0; k <= 400; k++) {
    const p = at(k * 0.1);
    if (p.dO < minDO) {
      minDO = p.dO;
      xMinKm = p.xKm;
    }
  }
  const mixP = at(0);
  const upP: RiverPoint = { xKm: -1, dO: up.sat * satUp, dbo: up.dbo, nh4: up.nh4, nh3: up.nh4 * nh3Fraction(up.T, up.pH) * NH3_PER_N, coli: up.coli };
  const fishWhy: string[] = [];
  if (minDO < RIVER_FISH_DO) fishWhy.push(`el oxígeno baja a ${minDO.toLocaleString('es-CO', { maximumFractionDigits: 1 })} mg/L`);
  if (mixP.nh3 > FISH.maxNH3) fishWhy.push('hay demasiado amoníaco libre');
  return { Q: Q / 86400, up: upP, mix: mixP, at, minDO, xMinKm, sat, fishOk: fishWhy.length === 0, fishWhy };
}

/** Lo que queda de la materia orgánica (DBO5) después de cada etapa, para el resumen de «Del río a la llave»
 *  (con la planta del juego en su operación normal). */
export function ptarStages(r: PtarResult = ptarModel(DEFAULT_PTAR)): { id: string; name: string; what: string; remain: number; dbo: number }[] {
  const d0 = r.raw.dbo;
  return [
    { id: 'cribado', name: 'Rejas y desarenador', what: 'Atajan basura, arena y grasa que llegan por el alcantarillado.', dbo: r.pre.dbo },
    { id: 'primario', name: 'Sedimentación primaria', what: 'El agua se queda casi quieta y lo pesado se va al fondo como lodo.', dbo: r.prim.dbo },
    { id: 'biologico', name: 'Reactor y sedimentación secundaria', what: 'Bacterias, con aire que se les sopla, se comen la materia orgánica disuelta; luego se asientan y el agua clara sale.', dbo: r.sec.dbo },
  ].map((s) => ({ ...s, remain: s.dbo / d0 }));
}

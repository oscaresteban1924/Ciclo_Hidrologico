// Simulación educativa de una tormenta sobre una cuenca imaginaria: cómo responde el caudal del
// río en el tiempo (hidrograma). Modelo de depósitos (hojas, suelo, flujo subsuperficial, acuífero y
// agua en camino) con reglas explícitas. Unidades: milímetros de agua sobre la cuenca (mm) y horas (h).
// Los valores son ilustrativos, no predicen un río real; el balance de agua se conserva en cada paso.

import type { LabInputs } from './model';

export interface RainProfile {
  /** Intensidad máxima de la lluvia (mm/h). */
  peak: number;
  /** Duración de la lluvia (h). */
  duration: number;
}

export const STORM = {
  /** Horas simuladas. */
  duration: 48,
  rainStart: 3,
  /** Intensidad máxima de cada nivel de lluvia (mm/h), con una duración de 12 h. */
  intensity: [3, 7, 12],
  baseDuration: 12,
  /** Agua que pueden retener las hojas (mm) según la cobertura vegetal. */
  canopy: [0.5, 1.5, 3],
  /** Fracción de la superficie que deja infiltrar: permeable, mixta, pavimentada. */
  permeable: [1, 0.6, 0.15],
  /** Capacidad de infiltración con el suelo seco (mm/h), según la vegetación. */
  infilMax: [8, 11, 15],
  infilMin: 0.5,
  /** Agua que cabe en el suelo (mm) y la que retiene sin drenar (capacidad de campo). */
  soilMax: 120,
  fieldCapacity: 60,
  soilStart: [25, 70, 112],
  /** Agua subterránea al inicio (mm) según la humedad previa de la cuenca. */
  groundStart: [40, 60, 80],
  kPerc: 0.12,
  /** Parte del drenaje del suelo que se mueve lateralmente hacia el río (flujo subsuperficial). */
  interShare: 0.5,
  kInter: 0.08,
  kBase: 0.004,
  /** Rapidez con que la escorrentía llega al río: los drenajes urbanos la aceleran. */
  kQuick: [0.25, 0.35, 0.6],
  kCanopyEvap: 0.1,
  etMax: 0.12,
  /** Extracción del pozo (mm/h). */
  pumping: [0, 0.1, 0.2],
  /** Fracción del flujo base que sigue llegando al río cuando se bombea (el resto lo capta el pozo). */
  baseKept: [1, 0.6, 0.25],
} as const;

export function profileFor(level: 0 | 1 | 2): RainProfile {
  return { peak: STORM.intensity[level], duration: STORM.baseDuration };
}

/** Forma de la lluvia: empieza suave, se intensifica y luego amaina. */
export function rainAt(t: number, p: RainProfile): number {
  const end = STORM.rainStart + p.duration;
  if (t < STORM.rainStart || t > end) return 0;
  const k = (t - STORM.rainStart) / p.duration;
  return p.peak * Math.sin(Math.PI * k) ** 0.6;
}

/** Lluvia total (mm) de un perfil, integrada numéricamente. */
export function rainTotal(p: RainProfile): number {
  let s = 0;
  const dt = 0.01;
  for (let t = STORM.rainStart; t <= STORM.rainStart + p.duration; t += dt) s += rainAt(t, p) * dt;
  return s;
}

export interface StormState {
  t: number;
  canopy: number;
  soil: number;
  ground: number;
  surface: number;
  inter: number;
  /** Acumulados para el balance (mm). */
  rainIn: number;
  evapOut: number;
  riverOut: number;
  pumpOut: number;
  start: number;
}

export interface StormSample {
  t: number;
  rain: number;
  quick: number;
  sub: number;
  base: number;
  total: number;
  /** Humedad del suelo (0–1). */
  soil: number;
  ground: number;
}

export interface Balance {
  rain: number;
  evap: number;
  river: number;
  pump: number;
  stored: number;
  error: number;
}

export function createStorm(inputs: LabInputs): StormState {
  const soil = STORM.soilStart[inputs.soilMoisture];
  const ground = STORM.groundStart[inputs.soilMoisture];
  return { t: 0, canopy: 0, soil, ground, surface: 0, inter: 0, rainIn: 0, evapOut: 0, riverOut: 0, pumpOut: 0, start: soil + ground };
}

/** Avanza la simulación dt horas y devuelve el estado del instante (mm/h). */
export function stepStorm(s: StormState, inputs: LabInputs, rain: RainProfile, dt: number): StormSample {
  const solar = [0.6, 1, 1.4][inputs.solar];
  const P = rainAt(s.t, rain);

  // Hojas: retienen hasta su capacidad; el resto gotea al suelo (trascolación)
  s.canopy += P * dt;
  const cap = STORM.canopy[inputs.vegetation];
  let through = 0;
  if (s.canopy > cap) {
    through = s.canopy - cap;
    s.canopy = cap;
  }
  const canopyEvap = Math.min(s.canopy, STORM.kCanopyEvap * solar * s.canopy * dt);
  s.canopy -= canopyEvap;

  // Superficie: sobre lo sellado escurre; sobre suelo permeable entra hasta su capacidad de infiltración
  const f = STORM.permeable[inputs.surface];
  const sealed = through * (1 - f);
  const onSoil = through * f;
  const room = Math.max(0, 1 - s.soil / STORM.soilMax);
  const capRate = (STORM.infilMax[inputs.vegetation] * room + STORM.infilMin) * f;
  const infil = Math.min(onSoil, capRate * dt);
  s.surface += sealed + (onSoil - infil);

  // Suelo: drena por encima de la capacidad de campo; las plantas y el sol retiran agua
  s.soil += infil;
  const excess = Math.max(0, s.soil - STORM.fieldCapacity);
  const perc = Math.min(excess, STORM.kPerc * excess * dt);
  s.soil -= perc;
  const et = Math.min(s.soil, STORM.etMax * solar * (s.soil / STORM.soilMax) * dt);
  s.soil -= et;

  // Una parte drena lateralmente hacia el río; el resto recarga el acuífero
  s.inter += perc * STORM.interShare;
  const sub = Math.min(s.inter, STORM.kInter * s.inter * dt);
  s.inter -= sub;

  // Acuífero: recibe recarga, entrega flujo base y puede ser bombeado
  s.ground += perc * (1 - STORM.interShare);
  const pumpLevel = inputs.pumping ?? 0;
  const base = Math.min(s.ground, STORM.kBase * s.ground * STORM.baseKept[pumpLevel] * dt);
  s.ground -= base;
  const pump = Math.min(s.ground, STORM.pumping[pumpLevel] * dt);
  s.ground -= pump;

  // Escorrentía hacia el río
  const quick = Math.min(s.surface, STORM.kQuick[inputs.surface] * s.surface * dt);
  s.surface -= quick;

  s.rainIn += P * dt;
  s.evapOut += canopyEvap + et;
  s.riverOut += quick + sub + base;
  s.pumpOut += pump;
  s.t += dt;

  return { t: s.t, rain: P, quick: quick / dt, sub: sub / dt, base: base / dt, total: (quick + sub + base) / dt, soil: s.soil / STORM.soilMax, ground: s.ground };
}

export function balance(s: StormState): Balance {
  const storedNow = s.canopy + s.soil + s.ground + s.surface + s.inter;
  const stored = storedNow - s.start;
  return { rain: s.rainIn, evap: s.evapOut, river: s.riverOut, pump: s.pumpOut, stored, error: s.rainIn - s.evapOut - s.riverOut - s.pumpOut - stored };
}

/** Simulación completa (para pruebas y resúmenes). */
export function simulate(inputs: LabInputs, rain: RainProfile, dt = 0.05) {
  const s = createStorm(inputs);
  const samples: StormSample[] = [];
  while (s.t < STORM.duration - 1e-9) samples.push(stepStorm(s, inputs, rain, dt));
  return { samples, balance: balance(s) };
}

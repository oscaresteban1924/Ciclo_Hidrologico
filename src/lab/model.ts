// Modelo educativo cualitativo del laboratorio.
// No es un simulador hidrológico predictivo: usa reglas explícitas y "unidades de modelo"
// arbitrarias para mostrar tendencias coherentes. El balance siempre se conserva:
//   lluvia = intercepción + infiltración + escorrentía
//   infiltración = cambio de humedad del suelo + percolación (recarga)

export type Level3 = 0 | 1 | 2;
export type Level4 = 0 | 1 | 2 | 3;

export interface LabInputs {
  solar: Level3;
  rain: Level4;
  soilMoisture: Level3;
  vegetation: Level3;
  surface: Level3;
  /** Extracción de agua subterránea con el pozo de bombeo. */
  pumping?: Level3;
}

export interface Conditions extends LabInputs {
  wind: Level3;
  temperature: Level3;
}

export const DEFAULT_LAB: LabInputs = { solar: 1, rain: 2, soilMoisture: 1, vegetation: 2, surface: 0, pumping: 0 };

export const DEFAULT_CONDITIONS: Conditions = {
  solar: 1,
  rain: 2,
  soilMoisture: 1,
  vegetation: 2,
  surface: 1,
  wind: 1,
  temperature: 1,
  pumping: 0,
};

/** Reglas del modelo (unidades de modelo, no mediciones). */
export const RULES = {
  rain: [0, 3, 6, 10],
  canopyStorage: [0.4, 1.0, 1.8],
  permeableFraction: [1, 0.6, 0.15],
  infiltrationCapacity: [7, 4, 0.8],
  vegetationInfiltration: [0.8, 1, 1.25],
  soilStart: [2, 5, 8],
  fieldCapacity: 5,
  soilMax: 8,
  baseflow: [1.5, 2.5, 3.5],
  solarEvaporation: [0.3, 0.6, 1],
  solarTranspiration: [0.3, 0.65, 1],
  vegetationTranspiration: [0.15, 0.6, 1],
  windEvaporation: [0.85, 1, 1.15],
  pumpingCapture: [0, 0.9, 1.9],
} as const;

export type Effect = 'sube' | 'baja' | 'neutro';

export interface Factor {
  label: string;
  effect: Effect;
}

export type QualKey =
  | 'evaporacion'
  | 'transpiracion'
  | 'intercepcion'
  | 'infiltracion'
  | 'escorrentia'
  | 'recarga'
  | 'rio';

export interface ModelResult {
  rain: number;
  interception: number;
  reachesGround: number;
  infiltration: number;
  runoff: number;
  soilStart: number;
  soilEnd: number;
  soilChange: number;
  percolation: number;
  baseflow: number;
  riverFlow: number;
  /** Índices visuales 0–1. */
  idx: Record<QualKey, number> & { turbidity: number; soil: number; waterTableRise: number };
  levels: Record<QualKey, number>;
  factors: Record<QualKey, Factor[]>;
  balanceOk: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const LEVEL_NAMES = ['Ninguna', 'Poca', 'Moderada', 'Mucha'];
export const RIVER_LEVEL_NAMES = ['Bajo', 'Medio', 'Alto', 'Muy alto'];

export const INPUT_NAMES = {
  solar: ['Baja', 'Media', 'Alta'],
  rain: ['Sin lluvia', 'Ligera', 'Moderada', 'Fuerte'],
  soilMoisture: ['Seco', 'Húmedo', 'Saturado'],
  vegetation: ['Escasa', 'Media', 'Densa'],
  surface: ['Permeable', 'Mixta', 'Pavimentada'],
  wind: ['Débil', 'Moderado', 'Fuerte'],
  temperature: ['Fría', 'Templada', 'Cálida'],
  pumping: ['Ninguna', 'Moderada', 'Intensa'],
} as const;

function toLevel(v: number): number {
  if (v < 0.04) return 0;
  if (v < 0.34) return 1;
  if (v < 0.67) return 2;
  return 3;
}

export function runModel(c: Conditions): ModelResult {
  const R = RULES.rain[c.rain];
  const interception = Math.min(R, RULES.canopyStorage[c.vegetation]);
  const reachesGround = R - interception;
  const f = RULES.permeableFraction[c.surface];
  const onPermeable = reachesGround * f;
  const onSealed = reachesGround - onPermeable;
  const capacity = RULES.infiltrationCapacity[c.soilMoisture] * RULES.vegetationInfiltration[c.vegetation] * f;
  const infiltration = Math.min(onPermeable, capacity);
  const runoff = onSealed + (onPermeable - infiltration);

  const soilStart = RULES.soilStart[c.soilMoisture];
  const room = Math.max(0, RULES.fieldCapacity - soilStart);
  const retained = Math.min(infiltration, room);
  const percolation = infiltration - retained;
  const soilEnd = soilStart + retained;
  const soilChange = retained;

  const pump = c.pumping ?? 0;
  // El bombeo captura agua que antes descargaba al río (y, si es intenso, puede tomarla del río).
  const baseflow = Math.max(0.2, RULES.baseflow[c.soilMoisture] - RULES.pumpingCapture[pump]);
  const riverFlow = baseflow + runoff + percolation * 0.2;

  const wetness = soilEnd / RULES.soilMax;
  const evaporation =
    RULES.solarEvaporation[c.solar] * (0.55 + 0.45 * wetness) * RULES.windEvaporation[c.wind];
  const waterAvailable = soilEnd < 3 ? 0.35 : soilEnd < 5 ? 0.75 : 1;
  const transpiration =
    RULES.solarTranspiration[c.solar] * RULES.vegetationTranspiration[c.vegetation] * waterAvailable;

  const idx = {
    evaporacion: clamp01(evaporation),
    transpiracion: clamp01(transpiration),
    intercepcion: clamp01(interception / 1.8),
    infiltracion: clamp01(infiltration / 7),
    escorrentia: clamp01(runoff / 9),
    recarga: clamp01(percolation / 6),
    rio: clamp01((riverFlow - 1) / 12),
    turbidity: clamp01(runoff / 8),
    soil: clamp01(soilEnd / RULES.soilMax),
    waterTableRise: clamp01(percolation / 6),
  };

  const levels: Record<QualKey, number> = {
    evaporacion: toLevel(idx.evaporacion),
    transpiracion: toLevel(idx.transpiracion),
    intercepcion: R === 0 ? 0 : toLevel(idx.intercepcion),
    infiltracion: R === 0 ? 0 : toLevel(idx.infiltracion),
    escorrentia: R === 0 ? 0 : toLevel(idx.escorrentia),
    recarga: toLevel(idx.recarga),
    rio: Math.min(3, Math.floor(idx.rio * 4)),
  };

  const rainName = INPUT_NAMES.rain[c.rain].toLowerCase();
  const soilName = INPUT_NAMES.soilMoisture[c.soilMoisture].toLowerCase();
  const vegName = INPUT_NAMES.vegetation[c.vegetation].toLowerCase();
  const surfName = INPUT_NAMES.surface[c.surface].toLowerCase();
  const solarName = INPUT_NAMES.solar[c.solar].toLowerCase();

  const factors: Record<QualKey, Factor[]> = {
    evaporacion: [
      { label: `energía solar ${solarName}`, effect: c.solar === 2 ? 'sube' : c.solar === 0 ? 'baja' : 'neutro' },
      { label: `suelo ${soilEnd >= 5 ? 'con mucha agua' : 'con poca agua'}`, effect: soilEnd >= 5 ? 'sube' : 'baja' },
      { label: `viento ${INPUT_NAMES.wind[c.wind].toLowerCase()}`, effect: c.wind === 2 ? 'sube' : c.wind === 0 ? 'baja' : 'neutro' },
    ],
    transpiracion: [
      { label: `energía solar ${solarName}`, effect: c.solar === 2 ? 'sube' : c.solar === 0 ? 'baja' : 'neutro' },
      { label: `vegetación ${vegName}`, effect: c.vegetation === 2 ? 'sube' : c.vegetation === 0 ? 'baja' : 'neutro' },
      { label: waterAvailable < 1 ? 'poca agua en el suelo: los estomas se cierran en parte' : 'agua disponible en el suelo', effect: waterAvailable < 1 ? 'baja' : 'neutro' },
    ],
    intercepcion: [
      { label: `vegetación ${vegName}`, effect: c.vegetation === 2 ? 'sube' : c.vegetation === 0 ? 'baja' : 'neutro' },
      { label: `lluvia ${rainName}`, effect: c.rain === 0 ? 'baja' : 'neutro' },
    ],
    infiltracion: [
      { label: `lluvia ${rainName}`, effect: c.rain >= 2 ? 'sube' : c.rain === 0 ? 'baja' : 'neutro' },
      { label: `suelo ${soilName}`, effect: c.soilMoisture === 0 ? 'sube' : c.soilMoisture === 2 ? 'baja' : 'neutro' },
      { label: `superficie ${surfName}`, effect: c.surface === 0 ? 'neutro' : 'baja' },
      { label: `vegetación ${vegName}`, effect: c.vegetation === 2 ? 'sube' : c.vegetation === 0 ? 'baja' : 'neutro' },
    ],
    escorrentia: [
      { label: `lluvia ${rainName}`, effect: c.rain === 3 ? 'sube' : c.rain === 0 ? 'baja' : 'neutro' },
      { label: `suelo ${soilName}`, effect: c.soilMoisture === 2 ? 'sube' : c.soilMoisture === 0 ? 'baja' : 'neutro' },
      { label: `superficie ${surfName}`, effect: c.surface === 2 ? 'sube' : c.surface === 0 ? 'baja' : 'neutro' },
      { label: `vegetación ${vegName}`, effect: c.vegetation === 2 ? 'baja' : c.vegetation === 0 ? 'sube' : 'neutro' },
    ],
    recarga: [
      { label: 'cantidad de agua infiltrada', effect: infiltration > 3 ? 'sube' : infiltration < 1 ? 'baja' : 'neutro' },
      { label: `suelo ${soilName}${c.soilMoisture === 0 ? ': primero retiene agua' : ': ya no retiene más'}`, effect: c.soilMoisture === 0 ? 'baja' : 'sube' },
    ],
    rio: [
      { label: 'flujo base: agua que entrega el acuífero', effect: c.soilMoisture === 2 ? 'sube' : c.soilMoisture === 0 ? 'baja' : 'neutro' },
      { label: 'escorrentía que llega al río', effect: runoff > 4 ? 'sube' : runoff < 1 ? 'baja' : 'neutro' },
      { label: `extracción de agua subterránea ${INPUT_NAMES.pumping[pump].toLowerCase()}`, effect: pump > 0 ? 'baja' : 'neutro' },
    ],
  };

  const balanceOk =
    Math.abs(R - (interception + infiltration + runoff)) < 1e-9 &&
    Math.abs(infiltration - (soilChange + percolation)) < 1e-9;

  return {
    rain: R,
    interception,
    reachesGround,
    infiltration,
    runoff,
    soilStart,
    soilEnd,
    soilChange,
    percolation,
    baseflow,
    riverFlow,
    idx,
    levels,
    factors,
    balanceOk,
  };
}

/** Reglas expresadas en palabras (se muestran en el laboratorio). */
export const RULES_TEXT: string[] = [
  'La lluvia aporta 0, 3, 6 o 10 unidades de modelo según su intensidad.',
  'El dosel retiene primero hasta 0,4, 1 o 1,8 unidades (vegetación escasa, media o densa). Esa agua interceptada luego se evapora o gotea.',
  'Del agua que llega al suelo, la parte que cae sobre pavimento no puede infiltrarse: escurre.',
  'La parte que cae sobre suelo permeable se infiltra hasta la capacidad del suelo, que es mayor si está seco y si tiene vegetación. Lo que sobra escurre.',
  'El suelo seco retiene agua hasta llenar su capacidad de campo; el agua infiltrada que ya no puede retener continúa hacia abajo (percolación) y recarga el acuífero.',
  'Balance: lluvia = intercepción + infiltración + escorrentía; infiltración = agua retenida en el suelo + percolación.',
  'La evaporación y la transpiración se muestran como intensidad (no como cantidad): aumentan con la energía solar y con el agua disponible.',
  'El río siempre recibe flujo base desde el acuífero (mayor si el periodo previo fue húmedo) y, cuando llueve, recibe también escorrentía.',
  'El bombeo de agua subterránea captura parte del agua que el acuífero entregaba al río: el flujo base disminuye. Con bombeo intenso, el nivel freático cerca del río baja tanto que el río puede perder agua hacia el pozo.',
];

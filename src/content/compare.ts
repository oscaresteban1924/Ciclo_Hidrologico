// Experimentos de comparación del laboratorio: un escenario de referencia (A) y otro con una sola
// condición modificada (B). Todo lo demás se mantiene igual y se muestra de forma explícita.

import { INPUT_NAMES, type LabInputs, type Level3 } from '../lab/model';
import { STORM, profileFor, rainTotal, type RainProfile } from '../lab/storm';
import type { CompareUi } from '../state/store';

export type VarKey = 'soilMoisture' | 'surface' | 'vegetation' | 'rain' | 'pumping';
export type Metric = 'peak' | 'base' | 'lag';

export interface Scenario {
  inputs: LabInputs;
  rain: RainProfile;
}

export interface CompareExperiment {
  id: string;
  title: string;
  question: string;
  variable: VarKey;
  a: Scenario;
  b: Scenario;
  metric: Metric;
  watch: string;
  explain: string;
  nuance?: string;
  /** Solo para la lluvia: qué se mantiene constante. */
  rainModes?: boolean;
}

export const VAR_NAMES: Record<VarKey, string> = {
  soilMoisture: 'Humedad inicial del suelo',
  surface: 'Superficie',
  vegetation: 'Cobertura vegetal',
  rain: 'Lluvia',
  pumping: 'Bombeo del pozo',
};

export const RAIN_NAMES = ['Suave', 'Moderada', 'Intensa'] as const;

/** Condiciones de referencia: cuenca con suelo permeable, húmedo, vegetación media y lluvia moderada. */
export const REFERENCE: LabInputs = { solar: 1, rain: 2, soilMoisture: 1, vegetation: 1, surface: 0, pumping: 0 };

const sc = (patch: Partial<LabInputs>, rain: RainProfile = profileFor(1)): Scenario => ({ inputs: { ...REFERENCE, ...patch }, rain });

/** Lluvia intensa con el mismo volumen que la suave: cae en un tercio del tiempo. */
export const SAME_VOLUME_INTENSE: RainProfile = { peak: STORM.intensity[0] * 3, duration: STORM.baseDuration / 3 };

export const COMPARE_EXPERIMENTS: CompareExperiment[] = [
  {
    id: 'suelo',
    title: 'Suelo seco o húmedo',
    question: '¿Responde igual el río si el suelo estaba seco o húmedo antes de la tormenta?',
    variable: 'soilMoisture',
    a: sc({ soilMoisture: 0 }),
    b: sc({ soilMoisture: 1 }),
    metric: 'peak',
    watch: 'Compara cuánto se oscurece el suelo y cuánta agua corre por la ladera en A y en B.',
    explain:
      'En el modelo, la capacidad de infiltración depende del espacio libre en los poros. El suelo seco tiene más poros con aire: guarda gran parte de la lluvia y el río sube poco. El suelo húmedo tiene menos espacio, así que más agua escurre y llega pronto al río.',
    nuance: 'Un suelo muy seco y compactado puede repeler el agua al principio de la lluvia; este modelo no incluye ese efecto.',
  },
  {
    id: 'superficie',
    title: 'Permeable o pavimento',
    question: '¿Qué le pasa al río si cambiamos el suelo permeable por pavimento?',
    variable: 'surface',
    a: sc({ surface: 0 }),
    b: sc({ surface: 2 }),
    metric: 'peak',
    watch: 'Observa las calles, las alcantarillas y el río en A y en B.',
    explain:
      'En el modelo, el pavimento deja infiltrar solo una pequeña parte de la lluvia, y las alcantarillas llevan el agua más rápido al río. Por eso, en B el pico es más alto y llega antes: el tiempo de retardo se acorta.',
    nuance: 'Las ciudades pueden reducir este efecto con parques, jardines de lluvia y pavimentos permeables.',
  },
  {
    id: 'lluvia',
    title: 'Lluvia suave o intensa',
    question: '¿Cómo cambia la respuesta del río con una lluvia suave o una intensa?',
    variable: 'rain',
    a: sc({}, profileFor(0)),
    b: sc({}, profileFor(2)),
    metric: 'peak',
    watch: 'Mira la gráfica de lluvia: en una opción cambia la cantidad total; en la otra, solo la rapidez con que cae.',
    explain:
      'Con la misma duración, la lluvia intensa trae mucha más agua y además supera la capacidad de infiltración: el pico es mucho mayor. Con el mismo volumen, la lluvia intensa cae en menos tiempo: el suelo no alcanza a recibirla y el pico es más alto y más temprano, aunque el agua total sea la misma.',
    rainModes: true,
  },
  {
    id: 'vegetacion',
    title: 'Poca o mucha vegetación',
    question: '¿Cambia la respuesta del río si la cuenca tiene poca o mucha vegetación?',
    variable: 'vegetation',
    a: sc({ vegetation: 0 }),
    b: sc({ vegetation: 2 }),
    metric: 'peak',
    watch: 'Observa las copas de los árboles y la ladera en A y en B.',
    explain:
      'En el modelo, la vegetación densa retiene más agua en las hojas y sus raíces y la materia orgánica abren poros que aumentan la infiltración. Por eso en B escurre menos agua y el pico del río es más bajo.',
    nuance: 'Las condiciones de esta comparación son explícitas: suelo permeable y húmedo, lluvia moderada de 12 h, sin bombeo. Con otras condiciones, la diferencia puede ser mayor o menor.',
  },
  {
    id: 'bombeo',
    title: 'Con o sin bombeo',
    question: '¿Qué le pasa al río cuando se bombea agua subterránea cerca de él?',
    variable: 'pumping',
    a: sc({ pumping: 0 }),
    b: sc({ pumping: 2 }),
    metric: 'base',
    watch: 'Fíjate en la parte baja de la curva, antes y después de la lluvia: es el flujo base. En el paisaje, mira el nivel freático junto al pozo.',
    explain:
      'En el modelo, el pozo extrae agua del acuífero y capta parte del agua que antes llegaba al río. El nivel freático baja alrededor del pozo (cono de depresión) y el flujo base disminuye: entre lluvias, el río lleva menos agua.',
    nuance: 'Cerca de la costa, bajar el nivel freático también puede permitir que el agua salada avance hacia el acuífero.',
  },
];

export const EXP_BY_ID = Object.fromEntries(COMPARE_EXPERIMENTS.map((e) => [e.id, e])) as Record<string, CompareExperiment>;

export function rainLabel(r: RainProfile): string {
  const total = Math.round(rainTotal(r) / 5) * 5;
  const level = STORM.intensity.findIndex((v) => Math.abs(v - r.peak) < 1e-6);
  const name = level >= 0 && r.duration === STORM.baseDuration ? RAIN_NAMES[level].toLowerCase() : r.peak > STORM.intensity[1] ? 'intensa' : 'suave';
  return `${name}: ${Math.round(r.duration)} h, unos ${total} mm en total`;
}

export function valueLabel(key: VarKey, s: Scenario): string {
  switch (key) {
    case 'soilMoisture':
      return INPUT_NAMES.soilMoisture[s.inputs.soilMoisture];
    case 'surface':
      return INPUT_NAMES.surface[s.inputs.surface];
    case 'vegetation':
      return INPUT_NAMES.vegetation[s.inputs.vegetation];
    case 'pumping':
      return INPUT_NAMES.pumping[(s.inputs.pumping ?? 0) as Level3];
    case 'rain':
      return rainLabel(s.rain);
  }
}

/** Lista explícita de lo que no cambia entre A y B. */
export function constantsOf(exp: { variable: VarKey; a: Scenario }, rainMode?: 'duracion' | 'volumen'): string[] {
  const keys: VarKey[] = ['rain', 'soilMoisture', 'surface', 'vegetation', 'pumping'];
  const out = keys.filter((k) => k !== exp.variable).map((k) => `${VAR_NAMES[k]}: ${valueLabel(k, exp.a).toLowerCase()}`);
  out.push(`Energía solar: ${INPUT_NAMES.solar[exp.a.inputs.solar].toLowerCase()}`);
  if (exp.variable === 'rain') out.unshift(rainMode === 'volumen' ? 'Volumen total de lluvia: el mismo en A y en B' : 'Duración de la lluvia: la misma en A y en B (12 h)');
  return out;
}

/** Nivel de lluvia del paisaje (1–3) que mejor representa un perfil. */
export function rainLevelOf(r: RainProfile): 1 | 2 | 3 {
  return r.peak <= STORM.intensity[0] + 0.5 ? 1 : r.peak <= STORM.intensity[1] + 0.5 ? 2 : 3;
}

/** Escenarios A y B del experimento elegido (o del experimento libre a partir de las condiciones del laboratorio). */
export function scenariosOf(cmp: CompareUi, lab: LabInputs): { variable: VarKey; a: Scenario; b: Scenario; exp: CompareExperiment | null } {
  const exp = EXP_BY_ID[cmp.expId] ?? null;
  if (exp) {
    if (exp.variable === 'rain' && cmp.rainMode === 'volumen') return { variable: 'rain', a: exp.a, b: { ...exp.b, rain: SAME_VOLUME_INTENSE }, exp };
    return { variable: exp.variable, a: exp.a, b: exp.b, exp };
  }
  const level = (Math.max(1, lab.rain) - 1) as 0 | 1 | 2;
  const a: Scenario = { inputs: { ...lab, pumping: lab.pumping ?? 0 }, rain: profileFor(level) };
  const v = cmp.free.variable;
  const b: Scenario =
    v === 'rain'
      ? { inputs: { ...a.inputs, rain: (cmp.free.value + 1) as 1 | 2 | 3 }, rain: profileFor(cmp.free.value as 0 | 1 | 2) }
      : { inputs: { ...a.inputs, [v]: cmp.free.value }, rain: a.rain };
  return { variable: v, a, b, exp: null };
}

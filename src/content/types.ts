import type { Conditions } from '../lab/model';

export type ElementKind = 'reservorio' | 'proceso' | 'elemento' | 'fuerza';

/** Capas animadas del paisaje (cada una corresponde a un grupo de partículas o flujos). */
export type LayerId =
  | 'evap'
  | 'transp'
  | 'cond'
  | 'wind'
  | 'rain'
  | 'snow'
  | 'intercept'
  | 'infilt'
  | 'perc'
  | 'runoff'
  | 'gw'
  | 'river'
  | 'melt'
  | 'sublim'
  | 'atmos'
  | 'fog'
  | 'pump'
  | 'deco';

export const ALL_LAYERS: LayerId[] = [
  'atmos', 'wind', 'evap', 'sublim', 'cond', 'fog', 'transp', 'intercept', 'rain', 'snow', 'melt', 'river', 'runoff', 'infilt', 'perc', 'gw', 'pump', 'deco',
];

export interface SceneElement {
  id: string;
  name: string;
  kind: ElementKind;
  short: string;
  more: string;
  region: string;
  layers: LayerId[];
  /** Paso del recorrido donde se estudia en detalle. */
  step?: string;
  terms?: string[];
}

export interface Question {
  prompt: string;
  options: string[];
  correct: number;
  right: string;
  hint: string;
}

export type InteractionId =
  | 'intro'
  | 'reservoirs'
  | 'evaporation'
  | 'transpiration'
  | 'condensation'
  | 'transport'
  | 'precipitation'
  | 'interception'
  | 'infiltration'
  | 'percolation'
  | 'runoff'
  | 'groundwater'
  | 'storage'
  | 'people'
  | 'final';

export type CalloutId = 'stoma' | 'cloud' | 'drop' | 'soil' | 'aquifer' | 'parcel' | 'wells' | 'compare';

export interface Step {
  id: string;
  /** Letra del contenido científico (A–L), si corresponde. */
  letter?: string;
  title: string;
  lead: string;
  what: string;
  cause: string;
  key?: string;
  metaphor?: { image: string; science: string };
  interactionPrompt: string;
  interaction: InteractionId;
  question: Question;
  more: string[];
  staticDescription: string;
  /** Región que encuadra la cámara en pantallas pequeñas. */
  region: string;
  /** Regiones iluminadas (el resto se atenúa sin desaparecer). */
  highlight: string[];
  layers: LayerId[] | 'all';
  labels: string[];
  arrows: string[] | 'all';
  conditions?: Partial<Conditions>;
  callouts?: CalloutId[];
  terms: string[];
}

export interface GlossaryTerm {
  id: string;
  term: string;
  def: string;
  region?: string;
  layers?: LayerId[];
  element?: string;
  see?: string[];
}

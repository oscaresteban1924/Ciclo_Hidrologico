// Traduce el estado de la experiencia en una "especificación de escena":
// qué condiciones simular, qué capas resaltar, qué etiquetas y lupas mostrar.

import { ELEMENT_BY_ID, ELEMENTS } from '../content/elements';
import { STEPS } from '../content/steps';
import { PHASE_CHANGES } from '../content/states';
import type { CalloutId, LayerId } from '../content/types';
import { DEFAULT_CONDITIONS, runModel, type Conditions, type ModelResult } from '../lab/model';
import { STORM } from '../lab/storm';
import { rainLevelOf, scenariosOf } from '../content/compare';
import type { State, StepKnobs } from './store';

export type LabelMode = 'info' | 'buttons' | 'none';

export interface SceneSpec {
  conditions: Conditions;
  model: ModelResult;
  layers: LayerId[] | 'all';
  isolate: boolean;
  highlight: string[];
  camera: string;
  labels: string[];
  labelMode: LabelMode;
  arrows: string[] | 'all';
  arrowsFaint: boolean;
  callouts: CalloutId[];
  knobs: StepKnobs;
  stepId: string | null;
  wideRain: boolean;
  forces: boolean;
  levels: ('condensation' | 'freezing')[];
  /** Intensidad de lluvia de la simulación de tormenta (0–1) mientras está activa. */
  stormRain: number | null;
}

const LAB_LABELS = ['oceano', 'rio', 'ciudad', 'suelo', 'zona-no-saturada', 'nivel-freatico', 'acuifero'];

export function buildSpec(s: State): SceneSpec {
  const knobs = s.knobs;
  let conditions: Conditions = { ...DEFAULT_CONDITIONS };
  let layers: LayerId[] | 'all' = 'all';
  let isolate = false;
  let highlight: string[] = [];
  let camera = 'all';
  let labels: string[] = [];
  let labelMode: LabelMode = 'info';
  let arrows: string[] | 'all' = 'all';
  let arrowsFaint = true;
  let callouts: CalloutId[] = [];
  let stepId: string | null = null;
  let wideRain = false;
  let forces = false;
  const levels: ('condensation' | 'freezing')[] = [];

  if (s.mode === 'guided') {
    const step = STEPS[s.step];
    stepId = step.id;
    conditions = { ...DEFAULT_CONDITIONS, ...step.conditions, ...s.overrides };
    layers = step.layers;
    highlight = step.highlight;
    camera = step.region;
    labels = step.labels;
    arrows = step.arrows;
    callouts = [...(step.callouts ?? [])];
    if (step.id === 'inicio' && knobs.showAll) {
      arrows = 'all';
      labels = [];
    }
    if (step.id === 'inicio' && !knobs.showAll) arrows = [];
    if (step.id === 'reservorios') {
      forces = knobs.showForces;
      labelMode = 'buttons';
    }
    if (step.id === 'transpiracion' && !knobs.showStoma) callouts = callouts.filter((c) => c !== 'stoma');
    if (step.id === 'condensacion') {
      levels.push('condensation');
      if (!knobs.showCloudLens) callouts = callouts.filter((c) => c !== 'cloud');
    }
    if (step.id === 'precipitacion') levels.push('freezing');
    if (step.id === 'almacenamiento') {
      levels.push('freezing');
      const ph = PHASE_CHANGES.find((p) => p.id === knobs.phase);
      if (ph) {
        highlight = [ph.region];
        layers = ph.layers;
      }
    }
    if (step.id === 'flujo-subterraneo') {
      if (!knobs.showWells) callouts = callouts.filter((c) => c !== 'wells');
      if (knobs.compareRun > 0) callouts.push('compare');
    }
    if (step.id === 'percolacion' && knobs.longRain) conditions = { ...conditions, rain: 3 };
    if (step.id === 'escorrentia') wideRain = true;
  } else if (s.mode === 'explore') {
    labelMode = 'buttons';
    const on = s.layersOn;
    labels = ELEMENTS.filter(
      (e) =>
        e.id !== 'gravedad' &&
        ((on.reservorio && e.kind === 'reservorio') || (on.proceso && e.kind === 'proceso') || (on.elemento && (e.kind === 'elemento' || e.kind === 'fuerza')) || e.id === s.selected),
    ).map((e) => e.id);
    // ver todos los procesos es una elección deliberada: por defecto se atenúan
    arrows = on.proceso ? 'all' : [];
    arrowsFaint = true;
    layers = on.proceso ? 'all' : [];
    const el = s.selected ? ELEMENT_BY_ID[s.selected] : null;
    if (el) {
      layers = el.layers;
      highlight = el.region === 'all' ? [] : [el.region];
      camera = el.region;
      if (el.kind === 'proceso') arrows = [el.id];
      if (el.id === 'gravedad' || el.id === 'sol') forces = true;
      if (el.id === 'nube') callouts = ['cloud'];
      if (el.id === 'acuifero') callouts = ['aquifer'];
      if (el.id === 'transpiracion' || el.id === 'vegetacion') callouts = ['stoma'];
      if (el.id === 'suelo' || el.id === 'infiltracion') callouts = ['soil'];
      if (el.id === 'nivel-freatico' || el.id === 'flujo-subterraneo') callouts = ['wells'];
      if (el.id === 'precipitacion') callouts = ['drop'];
      if (el.id === 'condensacion') levels.push('condensation');
      if (el.id === 'nevada' || el.id === 'nieve') levels.push('freezing');
    }
  } else {
    conditions = { ...DEFAULT_CONDITIONS, ...s.lab };
    if (s.labTab === 'comparar') {
      // el paisaje muestra el escenario elegido (A o B) sin mover la cámara
      const { a, b, variable } = scenariosOf(s.cmp, s.lab);
      const sc = s.cmp.view === 'A' ? a : b;
      // encuadre fijo durante la comparación, centrado en lo que cambia
      camera = variable === 'pumping' ? 'well' : variable === 'rain' ? 'all' : 'runoff';
      conditions = { ...DEFAULT_CONDITIONS, ...sc.inputs, rain: s.cmp.running ? rainLevelOf(sc.rain) : 0 };
    }
    labels = LAB_LABELS;
    wideRain = true;
    arrows = 'all';
  }

  if (s.tool === 'tracer') {
    layers = [];
    highlight = [];
    labels = [];
    labelMode = 'none';
    arrows = [];
    arrowsFaint = false;
    callouts = [];
    forces = false;
    levels.length = 0;
  } else if (s.tool === 'glossary' || s.tool === 'challenges') {
    labelMode = 'none';
    labels = [];
    callouts = [];
    forces = false;
  }

  if (s.focus) {
    layers = s.focus.layers;
    highlight = s.focus.region === 'all' ? [] : [s.focus.region];
    camera = s.focus.region;
    isolate = !!s.focus.isolate;
    if (s.focus.conditions) conditions = { ...conditions, ...s.focus.conditions };
    if (s.focus.hideLabels) {
      labels = [];
      labelMode = 'none';
      arrows = [];
      arrowsFaint = false;
    }
    if (s.focus.source === 'challenge' && s.focus.region === 'condensation') callouts = ['cloud'];
  }

  if (!s.prefs.labels && labelMode !== 'buttons') labels = [];
  if (!s.prefs.arrows && !s.prefs.reducedMotion) {
    arrows = [];
    arrowsFaint = false;
  }
  if (s.prefs.reducedMotion && arrows !== 'all' && arrows.length === 0 && s.tool !== 'tracer') {
    arrows = 'all';
  }

  let model = runModel(conditions);
  let stormRain: number | null = null;
  const run = s.mode === 'lab' && s.labTab === 'comparar' && s.cmp.running ? s.cmp[s.cmp.view] : null;
  const cur = run && run.samples.length ? run.samples[run.samples.length - 1] : null;
  if (cur) {
    // La escena sigue a la tormenta simulada: lluvia, escorrentía, río y humedad del suelo.
    stormRain = Math.min(1, cur.rain / STORM.intensity[2]);
    const rainLevel = (stormRain === 0 ? 0 : stormRain < 0.3 ? 1 : stormRain < 0.65 ? 2 : 3) as 0 | 1 | 2 | 3;
    conditions = { ...conditions, rain: rainLevel };
    // valores redondeados: el dibujo estático solo se vuelve a pintar cuando el cambio se nota
    const q = (v: number) => Math.round(v * 10) / 10;
    stormRain = q(stormRain);
    const quickIdx = q(Math.min(1, cur.quick / 5));
    model = {
      ...model,
      idx: {
        ...model.idx,
        escorrentia: quickIdx,
        turbidity: quickIdx,
        rio: q(Math.min(1, Math.max(0, (cur.total - 0.05) / 5.5))),
        soil: q(cur.soil),
        infiltracion: stormRain > 0 ? q(Math.min(1, stormRain * (1 - cur.soil) * 1.6 + 0.08)) : 0,
      },
    };
  }

  return {
    conditions,
    model,
    stormRain,
    layers,
    isolate,
    highlight,
    camera,
    labels,
    labelMode,
    arrows,
    arrowsFaint,
    callouts,
    knobs,
    stepId,
    wideRain,
    forces,
    levels,
  };
}

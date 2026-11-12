// Estado de la experiencia (modo, paso, preferencias, progreso, laboratorio, trazadora).
// Solo se guardan localmente las preferencias y el progreso.

import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { DEFAULT_CONDITIONS, DEFAULT_LAB, type Conditions, type LabInputs } from '../lab/model';
import { STEPS } from '../content/steps';
import type { LayerId } from '../content/types';
import { loadSaved, save } from '../lib/storage';
import type { Balance, RainProfile, StormSample } from '../lab/storm';

export type Mode = 'guided' | 'explore' | 'lab' | 'city' | 'quality' | 'canals' | 'basins' | 'supply' | 'ground' | 'dams' | 'slopes' | 'house' | 'pumps' | 'measure';
export type Tool = 'tracer' | 'challenges' | 'glossary' | 'logbook' | null;
/** Salas: el ciclo del agua agrupa el recorrido, la exploración y los experimentos. */
export type Room = 'ciclo' | 'basins' | 'ground' | 'slopes' | 'city' | 'quality' | 'supply' | 'house' | 'canals' | 'dams' | 'pumps' | 'measure';
export const roomOf = (m: Mode): Room => (m === 'guided' || m === 'explore' || m === 'lab' ? 'ciclo' : m);

/** Enlaces directos: la dirección termina en #recorrido, #explorar, #experimentos, #cuencas, #acuifero, #laderas, #medellin, #calidad, #acueducto, #casa, #canales, #presas, #bombas o #medir. */
export const MODE_HASH: Record<Mode, string> = { guided: 'recorrido', explore: 'explorar', lab: 'experimentos', city: 'medellin', quality: 'calidad', canals: 'canales', basins: 'cuencas', supply: 'acueducto', ground: 'acuifero', dams: 'presas', slopes: 'laderas', house: 'casa', pumps: 'bombas', measure: 'medir' };

/** Grupos de salas, en el orden en que viaja el agua (portada y encabezado). */
export const ROOM_GROUPS: { id: string; title: string; short: string; rooms: Room[] }[] = [
  { id: 'naturaleza', title: 'El agua en la naturaleza', short: 'Naturaleza', rooms: ['ciclo', 'basins', 'ground', 'slopes'] },
  { id: 'ciudad', title: 'El agua en la ciudad', short: 'Ciudad', rooms: ['city', 'quality', 'supply', 'house'] },
  { id: 'obras', title: 'Obras hidráulicas', short: 'Obras', rooms: ['canals', 'dams', 'pumps', 'measure'] },
];

/** Salas ya construidas (las demás no aparecen en la portada, en el encabezado ni por enlace directo). */
export const ROOMS_OPEN: Room[] = ['ciclo', 'basins', 'ground', 'slopes', 'city', 'quality', 'supply', 'canals', 'dams', 'pumps', 'measure'];
export const roomOpen = (r: Room) => ROOMS_OPEN.includes(r);

export function modeFromHash(): Mode | null {
  try {
    const h = decodeURIComponent(window.location.hash.replace(/^#/, '')).toLowerCase();
    const hit = (Object.keys(MODE_HASH) as Mode[]).find((m) => MODE_HASH[m] === h && roomOpen(roomOf(m)));
    return hit ?? (h === 'ciclo' ? 'guided' : null);
  } catch {
    return null;
  }
}
export type Speed = 0.5 | 1 | 2;
export type Quality = 'auto' | 'alta' | 'ligera';
export type DetailId = 'poros' | 'zonas' | 'planta' | 'nube' | 'subterraneo';

export interface Prefs {
  reducedMotion: boolean;
  sound: boolean;
  narration: boolean;
  labels: boolean;
  arrows: boolean;
}

/** Entrada de la bitácora del investigador (solo se guarda en este dispositivo). */
export interface LogEntry {
  id: string;
  kind: 'observacion' | 'prediccion' | 'comparacion' | 'explicacion';
  title: string;
  text: string;
  at: number;
  /** Resultado de una predicción, cuando ya se comprobó. */
  outcome?: 'coincide' | 'distinta';
}

export interface DetailState {
  id: DetailId;
  /** Lugar del paisaje que se amplía (coordenadas de escena). */
  at: [number, number];
}

export interface Progress {
  visited: string[];
  found: string[];
  challenges: string[];
  /** Descubrimientos del cuaderno de campo. */
  discovered: string[];
}

export interface StormRun {
  inputs: LabInputs;
  rain: RainProfile;
  samples: StormSample[];
  balance: Balance | null;
}

export type ScenarioKey = 'A' | 'B';
export type LabTab = 'reparto' | 'comparar';

/** Laboratorio de comparación: dos escenarios simulados a la vez. */
export interface CompareUi {
  expId: string;
  rainMode: 'duracion' | 'volumen';
  /** Experimento libre: variable que cambia en B y su valor. */
  free: { variable: 'soilMoisture' | 'surface' | 'vegetation' | 'rain' | 'pumping'; value: number };
  running: boolean;
  done: boolean;
  view: ScenarioKey;
  runId: number;
  A: StormRun | null;
  B: StormRun | null;
  prediction: number | null;
}

export interface FocusOverride {
  source: 'glossary' | 'challenge' | 'experiment' | 'states';
  region: string;
  layers: LayerId[] | 'all';
  conditions?: Partial<Conditions>;
  hideLabels?: boolean;
  isolate?: boolean;
}

export interface TracerState {
  node: string;
  history: string[];
  moving: string | null;
  run: number;
  /** Tramos pendientes cuando se reproduce una ruta completa. */
  queue: string[];
}

/** Ajustes propios de las interacciones de cada paso. */
export interface StepKnobs {
  showAll: boolean;
  showForces: boolean;
  showStoma: boolean;
  showCloudLens: boolean;
  parcel: number;
  dropSize: number;
  updraft: 0 | 1;
  showWells: boolean;
  compareRun: number;
  phase: string | null;
  longRain: boolean;
}

export const DEFAULT_KNOBS: StepKnobs = {
  showAll: false,
  showForces: false,
  showStoma: true,
  showCloudLens: true,
  parcel: 0.15,
  dropSize: 1,
  updraft: 1,
  showWells: true,
  compareRun: 0,
  phase: null,
  longRain: false,
};

export interface State {
  /** Portada con las salas (al abrir y con el nombre de la aplicación). */
  home: boolean;
  mode: Mode;
  tool: Tool;
  step: number;
  paused: boolean;
  prefs: Prefs;
  progress: Progress;
  selected: string | null;
  lab: LabInputs;
  overrides: Partial<Conditions>;
  knobs: StepKnobs;
  replay: number;
  focus: FocusOverride | null;
  tracer: TracerState | null;
  zoom: 'auto' | 'in' | 'out';
  settingsOpen: boolean;
  legendOpen: boolean;
  /** Capas visibles en la exploración libre. */
  layersOn: ExploreLayers;
  term: string | null;
  cmp: CompareUi;
  labTab: LabTab;
  /** Pregunta para investigar abierta en el panel. */
  inquiry: string | null;
  speed: Speed;
  quality: Quality;
  panelCollapsed: boolean;
  detail: DetailState | null;
  logbook: LogEntry[];
}

export interface ExploreLayers {
  reservorio: boolean;
  proceso: boolean;
  elemento: boolean;
  preguntas: boolean;
}

export type Action =
  | { type: 'mode'; mode: Mode }
  | { type: 'home' }
  | { type: 'tool'; tool: Tool }
  | { type: 'step'; index: number }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'pause'; value?: boolean }
  | { type: 'replay' }
  | { type: 'pref'; key: keyof Prefs; value: boolean }
  | { type: 'select'; id: string | null }
  | { type: 'lab'; patch: Partial<LabInputs> }
  | { type: 'labSet'; inputs: LabInputs }
  | { type: 'override'; patch: Partial<Conditions> }
  | { type: 'knob'; patch: Partial<StepKnobs> }
  | { type: 'found'; id: string }
  | { type: 'challengeDone'; id: string }
  | { type: 'focus'; focus: FocusOverride | null }
  | { type: 'tracerStart'; node: string }
  | { type: 'tracerGo'; edge: string; to: string }
  | { type: 'tracerArrive' }
  | { type: 'tracerBack' }
  | { type: 'tracerClear' }
  | { type: 'tracerPlay'; start: string; edges: string[] }
  | { type: 'zoom'; zoom: 'auto' | 'in' | 'out' }
  | { type: 'settings'; open: boolean }
  | { type: 'legend'; open: boolean }
  | { type: 'layers'; patch: Partial<ExploreLayers> }
  | { type: 'openTerm'; term: string | null }
  | { type: 'discover'; ids: string[] }
  | { type: 'cmpSet'; patch: Partial<CompareUi> }
  | { type: 'cmpStart'; A: StormRun; B: StormRun }
  | { type: 'cmpTick'; A: StormSample[]; B: StormSample[]; done: boolean; balA: Balance; balB: Balance }
  | { type: 'cmpStop' }
  | { type: 'labTab'; tab: LabTab }
  | { type: 'inquiry'; id: string | null }
  | { type: 'resetProgress' }
  | { type: 'speed'; speed: Speed }
  | { type: 'quality'; quality: Quality }
  | { type: 'panel'; collapsed: boolean }
  | { type: 'openDetail'; detail: DetailState }
  | { type: 'closeDetail' }
  | { type: 'log'; entry: Omit<LogEntry, 'id' | 'at'> & { id?: string } }
  | { type: 'logOutcome'; id: string; outcome: 'coincide' | 'distinta' }
  | { type: 'logRemove'; id: string };

const systemReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function initial(): State {
  const saved = loadSaved();
  const linked = typeof window !== 'undefined' ? modeFromHash() : null;
  const startStep = Math.min(saved?.step ?? 0, STEPS.length - 1);
  const visited = saved?.progress?.visited ?? [];
  const prefs: Prefs = {
    reducedMotion: saved?.prefs?.reducedMotion ?? systemReducedMotion(),
    sound: false,
    narration: saved?.prefs?.narration ?? false,
    labels: saved?.prefs?.labels ?? true,
    arrows: saved?.prefs?.arrows ?? true,
  };
  return {
    home: linked === null,
    mode: linked ?? 'guided',
    tool: null,
    step: startStep,
    paused: false,
    prefs,
    progress: {
      visited: visited.includes(STEPS[startStep].id) ? visited : [...visited, STEPS[startStep].id],
      found: saved?.progress?.found ?? [],
      challenges: saved?.progress?.challenges ?? [],
      discovered: saved?.progress?.discovered ?? [],
    },
    selected: null,
    lab: { ...DEFAULT_LAB },
    overrides: {},
    knobs: { ...DEFAULT_KNOBS },
    replay: 0,
    focus: null,
    tracer: null,
    zoom: 'auto',
    settingsOpen: false,
    legendOpen: false,
    layersOn: { reservorio: true, proceso: false, elemento: false, preguntas: true },
    term: null,
    cmp: { expId: 'superficie', rainMode: 'duracion', free: { variable: 'surface', value: 2 }, running: false, done: false, view: 'A', runId: 0, A: null, B: null, prediction: null },
    labTab: 'reparto',
    inquiry: null,
    speed: saved?.speed ?? 1,
    quality: saved?.quality ?? 'auto',
    panelCollapsed: false,
    detail: null,
    logbook: saved?.logbook ?? [],
  };
}

const MAX_LOG = 150;

function visit(progress: Progress, index: number): Progress {
  const id = STEPS[index].id;
  return progress.visited.includes(id) ? progress : { ...progress, visited: [...progress.visited, id] };
}

function goStep(s: State, index: number): State {
  const i = Math.max(0, Math.min(STEPS.length - 1, index));
  return {
    ...s,
    step: i,
    overrides: {},
    knobs: { ...DEFAULT_KNOBS },
    focus: null,
    zoom: 'auto',
    replay: s.replay + 1,
    progress: visit(s.progress, i),
  };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'home':
      return { ...s, home: true, tool: null, detail: null, focus: null, selected: null, tracer: null, inquiry: null, cmp: { ...s.cmp, running: false } };
    case 'mode':
      return {
        ...s,
        home: false,
        cmp: { ...s.cmp, running: false },
        inquiry: null,
        mode: a.mode,
        tool: null,
        detail: null,
        focus: null,
        selected: null,
        tracer: null,
        overrides: {},
        knobs: { ...DEFAULT_KNOBS },
        zoom: 'auto',
        replay: s.replay + 1,
        progress: a.mode === 'guided' ? visit(s.progress, s.step) : s.progress,
      };
    case 'tool':
      return { ...s, home: a.tool ? false : s.home, tool: a.tool, focus: null, tracer: a.tool === 'tracer' ? s.tracer : null, selected: null, term: null };
    case 'step':
      return { ...goStep(s, a.index), detail: null };
    case 'next':
      return { ...goStep(s, s.step + 1), detail: null };
    case 'prev':
      return { ...goStep(s, s.step - 1), detail: null };
    case 'pause':
      return { ...s, paused: a.value ?? !s.paused };
    case 'replay':
      return { ...s, replay: s.replay + 1, knobs: { ...s.knobs, compareRun: 0 } };
    case 'pref':
      return { ...s, prefs: { ...s.prefs, [a.key]: a.value } };
    case 'select':
      return { ...s, selected: a.id, focus: null, zoom: 'auto' };
    case 'lab':
      return { ...s, lab: { ...s.lab, ...a.patch } };
    case 'labSet':
      return { ...s, lab: { ...a.inputs } };
    case 'override':
      return { ...s, overrides: { ...s.overrides, ...a.patch } };
    case 'knob':
      return { ...s, knobs: { ...s.knobs, ...a.patch } };
    case 'found':
      return s.progress.found.includes(a.id)
        ? s
        : { ...s, progress: { ...s.progress, found: [...s.progress.found, a.id] } };
    case 'challengeDone':
      return s.progress.challenges.includes(a.id)
        ? s
        : { ...s, progress: { ...s.progress, challenges: [...s.progress.challenges, a.id] } };
    case 'focus':
      return { ...s, focus: a.focus };
    case 'tracerStart':
      return { ...s, tracer: { node: a.node, history: [], moving: null, run: (s.tracer?.run ?? 0) + 1, queue: [] } };
    case 'tracerGo': {
      if (!s.tracer || s.tracer.moving) return s;
      const queue = s.tracer.queue[0] === a.edge ? s.tracer.queue.slice(1) : [];
      return { ...s, tracer: { ...s.tracer, moving: a.edge, history: [...s.tracer.history, a.edge], queue } };
    }
    case 'tracerArrive': {
      if (!s.tracer || !s.tracer.moving) return s;
      const to = s.tracer.moving.split('>')[1];
      return { ...s, tracer: { ...s.tracer, node: to, moving: null } };
    }
    case 'tracerBack': {
      if (!s.tracer || s.tracer.moving || !s.tracer.history.length) return s;
      const history = s.tracer.history.slice(0, -1);
      const last = s.tracer.history[s.tracer.history.length - 1];
      return { ...s, tracer: { ...s.tracer, history, node: last.split('>')[0], run: s.tracer.run + 1, queue: [] } };
    }
    case 'tracerClear':
      return { ...s, tracer: null };
    case 'tracerPlay':
      return {
        ...s,
        tool: 'tracer',
        focus: null,
        selected: null,
        tracer: { node: a.start, history: [], moving: null, run: (s.tracer?.run ?? 0) + 1, queue: a.edges },
      };
    case 'zoom':
      return { ...s, zoom: a.zoom };
    case 'settings':
      return { ...s, settingsOpen: a.open };
    case 'legend':
      return { ...s, legendOpen: a.open };
    case 'layers':
      return { ...s, layersOn: { ...s.layersOn, ...a.patch } };
    case 'openTerm':
      return { ...s, tool: 'glossary', term: a.term, focus: null, selected: null, tracer: null };
    case 'resetProgress':
      return { ...s, progress: { visited: [], found: [], challenges: [], discovered: [] }, logbook: [] };
    case 'discover': {
      const fresh = a.ids.filter((id) => !s.progress.discovered.includes(id));
      if (!fresh.length) return s;
      return { ...s, progress: { ...s.progress, discovered: [...s.progress.discovered, ...fresh] } };
    }
    case 'cmpSet': {
      const next = { ...s.cmp, ...a.patch };
      // cambiar el experimento o sus condiciones invalida los resultados anteriores
      const reset = a.patch.expId !== undefined || a.patch.rainMode !== undefined || a.patch.free !== undefined;
      return { ...s, cmp: reset ? { ...next, running: false, done: false, A: null, B: null, prediction: a.patch.prediction ?? null } : next };
    }
    case 'cmpStart':
      return { ...s, paused: false, cmp: { ...s.cmp, running: true, done: false, runId: s.cmp.runId + 1, A: a.A, B: a.B } };
    case 'cmpTick': {
      if (!s.cmp.A || !s.cmp.B) return s;
      const A = { ...s.cmp.A, samples: [...s.cmp.A.samples, ...a.A], balance: a.balA };
      const B = { ...s.cmp.B, samples: [...s.cmp.B.samples, ...a.B], balance: a.balB };
      return { ...s, cmp: { ...s.cmp, A, B, running: !a.done, done: a.done } };
    }
    case 'cmpStop':
      return { ...s, cmp: { ...s.cmp, running: false, done: false, A: null, B: null } };
    case 'labTab':
      return { ...s, labTab: a.tab, cmp: a.tab === 'comparar' ? s.cmp : { ...s.cmp, running: false } };
    case 'inquiry':
      return { ...s, inquiry: a.id, selected: null };
    case 'speed':
      return { ...s, speed: a.speed };
    case 'quality':
      return { ...s, quality: a.quality };
    case 'panel':
      return { ...s, panelCollapsed: a.collapsed };
    case 'openDetail':
      return { ...s, detail: a.detail, paused: false };
    case 'closeDetail':
      return { ...s, detail: null };
    case 'log': {
      const id = a.entry.id ?? `${a.entry.kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const entry: LogEntry = { ...a.entry, id, at: Date.now() };
      const rest = s.logbook.filter((e) => e.id !== id);
      return { ...s, logbook: [...rest, entry].slice(-MAX_LOG) };
    }
    case 'logOutcome':
      return { ...s, logbook: s.logbook.map((e) => (e.id === a.id ? { ...e, outcome: a.outcome } : e)) };
    case 'logRemove':
      return { ...s, logbook: s.logbook.filter((e) => e.id !== a.id) };
    default:
      return s;
  }
}

const Ctx = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  useEffect(() => {
    save({
      prefs: {
        reducedMotion: state.prefs.reducedMotion,
        narration: state.prefs.narration,
        labels: state.prefs.labels,
        arrows: state.prefs.arrows,
      },
      progress: state.progress,
      step: state.step,
      speed: state.speed,
      quality: state.quality,
      logbook: state.logbook,
    });
  }, [state.prefs, state.progress, state.step, state.speed, state.quality, state.logbook]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore fuera de StoreProvider');
  return v;
}

export { DEFAULT_CONDITIONS };

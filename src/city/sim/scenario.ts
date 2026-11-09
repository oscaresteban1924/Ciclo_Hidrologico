// Formato versionado de escenario y de configuración del laboratorio de lluvia urbana.
// Coordenadas locales en metros: x hacia el este, y hacia el norte, origen en la esquina suroeste.

import { COVER_LIST, DURATION_RANGE, RAIN_RANGE, type CoverId } from './constants';

export type Pt = [number, number];
export type Polygon = Pt[];

/** Naturaleza de cada capa: obligatoria para no confundir datos reales con elementos didácticos. */
export type DataKind = 'real' | 'estimado' | 'didactico' | 'hipotetico';

export interface LayerProvenance {
  layer: string;
  kind: DataKind;
  note: string;
}

export interface Source {
  label: string;
  url?: string;
  license?: string;
  accessed?: string;
}

export interface Provenance {
  kind: 'demostrativo' | 'datos-reales' | 'mixto';
  /** Frase visible para el público. */
  statement: string;
  /** Etiqueta corta para la maqueta (p. ej., «Escenario didáctico»). */
  badge?: string;
  layers: LayerProvenance[];
  sources: Source[];
  generatedBy: string;
  generatedAt?: string;
}

export interface TerrainRaster {
  kind: 'raster';
  /** Resolución del ráster [m]. */
  dx: number;
  nx: number;
  ny: number;
  /** Cotas [m] en orden fila a fila desde el sur (j) y de oeste a este (i), centro de celda. */
  values: ArrayLike<number>;
  datum: string;
  verticalAccuracy?: string;
}

export interface SurfacePatch {
  id: string;
  polygon: Polygon;
  cover?: CoverId;
  /** Desnivel que se suma a la cota [m] (p. ej., andén +0,15). */
  dz?: number;
  /** Plataforma nivelada (cancha, lote en terraza): z = z0 + sx·(x−x0) + sy·(y−y0), antes de dz. */
  plane?: { z0: number; at: Pt; sx: number; sy: number };
  /** Pendiente transversal opcional: dz adicional = slope·distancia al eje [m/m]. */
  crossSlope?: { axis: 'x' | 'y'; at: number; slope: number };
  kind: DataKind;
  label?: string;
}

export interface Bowl {
  id: string;
  cx: number;
  cy: number;
  r: number;
  depth: number;
  kind: DataKind;
  label: string;
}

export interface BuildingSpec {
  id: string;
  polygon: Polygon;
  floors: number;
  heightM: number;
  /** Punto de la bajante; el compilador busca la celda libre más cercana. */
  downspout: Pt;
  style: 'ladrillo' | 'revoque' | 'torre' | 'comercial';
  color?: string;
  kind: DataKind;
  /** Atributos de origen cuando vienen de datos reales (agl, n_pisos...). */
  attrs?: Record<string, number | string | null>;
}

export interface DrainSpec {
  id: string;
  name: string;
  at: Pt;
  /** Dimensiones de la rejilla [m]. */
  widthM: number;
  lengthM: number;
  /** Lados libres de la rejilla para el vertedero (contra el bordillo uno queda bloqueado). */
  freeSides: number;
  /** Fracción de área libre de la rejilla [-]. */
  openFraction: number;
  /** Capacidad máxima de la conexión [L/s]. */
  capacityLps: number;
  /** Pendiente transversal de la cuneta hacia el bordillo [m/m]; reconstruye la profundidad junto al bordillo. */
  gutterSlope?: number;
  /** Obstrucción inicial 0–1. */
  obstruction: number;
  kind: DataKind;
}

export interface OutletSpec {
  id: string;
  name: string;
  edge: 'N' | 'S' | 'E' | 'W';
  /** Tramo del borde [m] medido a lo largo del borde. */
  from: number;
  to: number;
  /** Pendiente de la salida para la condición de profundidad normal [m/m]. */
  slope: number;
  kind: DataKind;
}

export interface InflowSpec {
  id: string;
  name: string;
  edge: 'N' | 'S' | 'E' | 'W';
  from: number;
  to: number;
  kind: DataKind;
}

export interface ZoneSpec {
  id: string;
  name: string;
  polygon: Polygon;
  cover: CoverId;
  options: CoverId[];
  /** Costo en puntos del juego para cada opción distinta de la original. */
  cost: number;
}

export interface GardenSite {
  id: string;
  name: string;
  polygon: Polygon;
  /** Abertura en el bordillo por la que entra el agua de la calle. */
  inlet: Polygon;
  depthM: number;
  cost: number;
}

export interface TankSite {
  id: string;
  name: string;
  buildingIds: string[];
  capacityM3: number;
  releaseLps: number;
  cost: number;
}

export interface Probe {
  id: string;
  name: string;
  at: Pt;
}

export interface PlaceLabel {
  id: string;
  text: string;
  at: Pt;
  priority: number;
}

export interface Scenario {
  format: 'medellin-lluvia/escenario';
  version: 1;
  id: string;
  title: string;
  shortTitle: string;
  summary: string;
  provenance: Provenance;
  extent: {
    crs: 'LOCAL' | 'EPSG:9377';
    /** Coordenadas del origen local en el CRS (si es EPSG:9377). */
    origin: Pt;
    /** Centro aproximado en grados (longitud, latitud) para ubicarlo en el esquema del valle. */
    lonLat?: Pt;
    width: number;
    height: number;
  };
  units: { length: 'm'; elevation: 'm'; rain: 'mm/h'; time: 's'; flow: 'L/s' };
  /** Resoluciones de cálculo permitidas [m] y la predeterminada. */
  resolutions: number[];
  defaultResolution: number;
  terrain: TerrainRaster;
  defaultCover: CoverId;
  surfaces: SurfacePatch[];
  bowls: Bowl[];
  buildings: BuildingSpec[];
  drains: DrainSpec[];
  outlets: OutletSpec[];
  inflows: InflowSpec[];
  zones: ZoneSpec[];
  gardens: GardenSite[];
  tanks: TankSite[];
  probes: Probe[];
  labels: PlaceLabel[];
  /** Línea de calle para la vista a nivel de calle: posición y punto al que mira. */
  streetView: { eye: Pt; look: Pt };
  /** Puntos de las tuberías esquemáticas (solo dibujo) hacia la descarga. */
  pipes: { id: string; path: Pt[]; kind: DataKind }[];
  /** Elementos decorativos: no participan en el cálculo. */
  decor?: Decor;
  defaults: Shared;
  engine: { name: string; version: string };
  seed: number;
}

export interface Decor {
  markings: { kind: 'dash' | 'zebra' | 'line'; a: Pt; b: Pt; width: number }[];
  trees: Pt[];
  lamps: Pt[];
  /** Cable aéreo decorativo (p. ej., Metrocable) con torres. */
  cable?: { towers: Pt[]; label: string };
  /** Escaleras peatonales decorativas. */
  stairs?: { a: Pt; b: Pt; width: number }[];
}

// ---------------------------------------------------------------- configuración

export interface RainConfig {
  intensityMmH: number;
  durationMin: number;
  pattern: 'constante' | 'pico';
  spatial: 'uniforme' | 'localizada';
  center: Pt;
  radiusM: number;
}

/** Condiciones que deben ser idénticas en una comparación A/B. */
export interface Shared {
  scenarioId: string;
  dx: number;
  rain: RainConfig;
  /** Tiempo total simulado [min] (lluvia + escurrimiento posterior). */
  simMinutes: number;
  /** Humedad inicial del suelo: fracción del almacenamiento ya ocupada. */
  soilInitial: 'seco' | 'humedo';
  /** Agua que llega desde calles de arriba [L/s] (entrada externa). */
  inflowLps: number;
  seed: number;
}

/** Lo que el estudiante puede cambiar en la ciudad. */
export interface Interventions {
  zones: Record<string, CoverId>;
  gardens: Record<string, boolean>;
  tanks: Record<string, { on: boolean; destination: 'red' | 'retener' }>;
  drains: Record<string, number>;
}

export interface CityConfig {
  format: 'medellin-lluvia/config';
  version: 1;
  shared: Shared;
  A: Interventions;
  B: Interventions;
}

export const SOIL_INITIAL_FRACTION: Record<Shared['soilInitial'], number> = { seco: 0.2, humedo: 0.7 };

export function baseInterventions(sc: Scenario): Interventions {
  return {
    zones: Object.fromEntries(sc.zones.map((z) => [z.id, z.cover])),
    gardens: Object.fromEntries(sc.gardens.map((g) => [g.id, false])),
    tanks: Object.fromEntries(sc.tanks.map((t) => [t.id, { on: false, destination: 'red' as const }])),
    drains: Object.fromEntries(sc.drains.map((d) => [d.id, d.obstruction])),
  };
}

export function cloneInterventions(iv: Interventions): Interventions {
  return {
    zones: { ...iv.zones },
    gardens: { ...iv.gardens },
    tanks: Object.fromEntries(Object.entries(iv.tanks).map(([k, v]) => [k, { ...v }])),
    drains: { ...iv.drains },
  };
}

// ---------------------------------------------------------------- validación

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const isNum = (v: unknown, min = -Infinity, max = Infinity): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Valida una configuración importada contra el escenario. Nunca confía en el archivo. */
export function validateConfig(raw: unknown, scenarios: Record<string, Scenario>): ValidationResult & { config?: CityConfig } {
  const errors: string[] = [];
  const o = raw as Partial<CityConfig> | null;
  if (!o || typeof o !== 'object') return { ok: false, errors: ['El archivo no contiene un objeto JSON.'] };
  if (o.format !== 'medellin-lluvia/config') errors.push('Formato desconocido: se esperaba «medellin-lluvia/config».');
  if (o.version !== 1) errors.push('Versión no compatible: se esperaba la versión 1.');
  const sh = o.shared as Partial<Shared> | undefined;
  if (!sh || typeof sh !== 'object') return { ok: false, errors: [...errors, 'Falta la sección «shared».'] };
  const sc = typeof sh.scenarioId === 'string' ? scenarios[sh.scenarioId] : undefined;
  if (!sc) errors.push(`Escenario desconocido: ${String(sh.scenarioId)}.`);
  if (sc && !sc.resolutions.includes(sh.dx as number)) errors.push(`Resolución no permitida: ${String(sh.dx)} m.`);
  const r = sh.rain as Partial<RainConfig> | undefined;
  if (!r) errors.push('Falta la lluvia.');
  else {
    if (!isNum(r.intensityMmH, RAIN_RANGE.min, RAIN_RANGE.max)) errors.push(`Intensidad fuera del rango ${RAIN_RANGE.min}–${RAIN_RANGE.max} mm/h.`);
    if (!isNum(r.durationMin, DURATION_RANGE.min, DURATION_RANGE.max)) errors.push(`Duración fuera del rango ${DURATION_RANGE.min}–${DURATION_RANGE.max} min.`);
    if (r.pattern !== 'constante' && r.pattern !== 'pico') errors.push('Patrón de lluvia desconocido.');
    if (r.spatial !== 'uniforme' && r.spatial !== 'localizada') errors.push('Distribución espacial desconocida.');
    if (!Array.isArray(r.center) || r.center.length !== 2 || !isNum(r.center[0]) || !isNum(r.center[1])) errors.push('Centro de lluvia inválido.');
    if (!isNum(r.radiusM, 5, 500)) errors.push('Radio de lluvia fuera de rango (5–500 m).');
  }
  if (!isNum(sh.simMinutes, 10, 120)) errors.push('Tiempo simulado fuera de rango (10–120 min).');
  if (r && isNum(sh.simMinutes) && isNum(r.durationMin) && sh.simMinutes < r.durationMin) errors.push('El tiempo simulado debe ser mayor o igual que la duración de la lluvia.');
  if (sh.soilInitial !== 'seco' && sh.soilInitial !== 'humedo') errors.push('Humedad inicial desconocida.');
  if (!isNum(sh.inflowLps, 0, 500)) errors.push('Entrada externa fuera de rango (0–500 L/s).');
  if (!isNum(sh.seed, 0, 2 ** 31)) errors.push('Semilla inválida.');
  if (sc) {
    for (const key of ['A', 'B'] as const) {
      const iv = o[key] as Partial<Interventions> | undefined;
      if (!iv) {
        errors.push(`Falta el escenario ${key}.`);
        continue;
      }
      for (const [zid, cov] of Object.entries(iv.zones ?? {})) {
        const z = sc.zones.find((q) => q.id === zid);
        if (!z) errors.push(`${key}: zona desconocida «${zid}».`);
        else if (!COVER_LIST.includes(cov) || (!z.options.includes(cov) && cov !== z.cover)) errors.push(`${key}: superficie no permitida en «${z.name}».`);
      }
      for (const gid of Object.keys(iv.gardens ?? {})) if (!sc.gardens.some((g) => g.id === gid)) errors.push(`${key}: jardín desconocido «${gid}».`);
      for (const [tid, tv] of Object.entries(iv.tanks ?? {})) {
        if (!sc.tanks.some((t) => t.id === tid)) errors.push(`${key}: depósito desconocido «${tid}».`);
        if (!tv || typeof tv.on !== 'boolean' || (tv.destination !== 'red' && tv.destination !== 'retener')) errors.push(`${key}: depósito «${tid}» mal definido.`);
      }
      for (const [did, ob] of Object.entries(iv.drains ?? {})) {
        if (!sc.drains.some((d) => d.id === did)) errors.push(`${key}: sumidero desconocido «${did}».`);
        if (!isNum(ob, 0, 1)) errors.push(`${key}: obstrucción de «${did}» fuera de 0–1.`);
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  // Completar con valores base para claves ausentes
  const base = baseInterventions(sc!);
  const fill = (iv: Partial<Interventions>): Interventions => ({
    zones: { ...base.zones, ...(iv.zones ?? {}) },
    gardens: { ...base.gardens, ...(iv.gardens ?? {}) },
    tanks: { ...base.tanks, ...(iv.tanks ?? {}) },
    drains: { ...base.drains, ...(iv.drains ?? {}) },
  });
  return { ok: true, errors: [], config: { format: 'medellin-lluvia/config', version: 1, shared: sh as Shared, A: fill(o.A as Interventions), B: fill(o.B as Interventions) } };
}

/** Validación estructural mínima de un escenario importado (p. ej., generado por el pipeline). */
export function validateScenario(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const s = raw as Partial<Scenario> | null;
  if (!s || typeof s !== 'object') return { ok: false, errors: ['No es un objeto JSON.'] };
  if (s.format !== 'medellin-lluvia/escenario') errors.push('Formato desconocido.');
  if (s.version !== 1) errors.push('Versión no compatible.');
  if (typeof s.id !== 'string' || !/^[a-z0-9-]{3,48}$/.test(s.id)) errors.push('Identificador inválido.');
  const t = s.terrain as TerrainRaster | undefined;
  if (!t || t.kind !== 'raster' || !isNum(t.dx, 0.1, 10) || !Number.isInteger(t.nx) || !Number.isInteger(t.ny)) errors.push('Terreno inválido.');
  else if (!t.values || t.values.length !== t.nx * t.ny) errors.push('El número de cotas no coincide con nx·ny.');
  else {
    for (let k = 0; k < t.values.length; k++) if (!Number.isFinite(t.values[k])) {
      errors.push(`Cota no finita en la posición ${k}.`);
      break;
    }
  }
  const ext = s.extent;
  if (!ext || !isNum(ext.width, 10, 2000) || !isNum(ext.height, 10, 2000)) errors.push('Extensión inválida (10–2000 m por lado).');
  if (!s.provenance || !Array.isArray(s.provenance.layers) || !s.provenance.statement) errors.push('Falta la procedencia de los datos.');
  if (!Array.isArray(s.outlets) || s.outlets.length === 0) errors.push('Debe existir al menos una salida hidráulica definida.');
  if (!Array.isArray(s.buildings)) errors.push('Falta la lista de edificios.');
  if (errors.length === 0 && ext && t) {
    if (Math.abs(t.nx * t.dx - ext.width) > t.dx || Math.abs(t.ny * t.dx - ext.height) > t.dx) errors.push('El terreno no cubre la extensión declarada.');
  }
  return { ok: errors.length === 0, errors };
}

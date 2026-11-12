// Escenas de la sala «Modelación hidráulica 2D»: lo que cada parte calcula con sus controles, el resumen de una
// corrida del modelo (nivel en el puente, barrio inundado, la escuela, amenaza) y las corridas de referencia.

import { COVER_KEYS, COVERS, LEVEE, NX, NY, POIS, ROAD, yc, bankZ, bridgeOpening, buildingsRaised, capacityAt, dn, leveeLoss, meanCapacity, sectionAt, terrainFor, truth, verticalError, type Cover, type TerrainOpts } from './terrain';
import { normalN, type BuildingMode, type Eq, type MeshOpts, type Roughness, type RunOpts, type RunResult } from './solver';
import { AMS_FIT, designHydro, quantile, risk } from './hydrology';

// ------------------------------------------------------------------ parte 1: el terreno

export interface TerrainScene extends TerrainOpts {
  /** Abscisa del corte [m]. */
  x: number;
}
export const DEFAULT_TERRAIN_SCENE: TerrainScene = { surf: 'mdt', p: 1, method: 'promedio', sigma: 0, burn: false, x: 250 };

let TRUE_CAP = NaN;
export const trueCapacity = () => (Number.isFinite(TRUE_CAP) ? TRUE_CAP : (TRUE_CAP = meanCapacity(truth().mdt)));

export function terrainScene(s: TerrainScene) {
  const T = truth();
  const { fine, raster } = terrainFor(s);
  const cap = meanCapacity(fine), capTrue = trueCapacity();
  const capX = capacityAt(fine, s.x), capXTrue = capacityAt(T.mdt, s.x);
  const ve = verticalError(fine);
  return {
    fine,
    raster,
    cap,
    capTrue,
    capRatio: cap / capTrue,
    capX,
    capXTrue,
    levee: leveeLoss(fine),
    rmse: ve.rmse,
    bias: ve.bias,
    bridge: bridgeOpening(fine),
    bridgeTrue: bridgeOpening(T.mdt),
    raised: buildingsRaised(fine),
    secTrue: sectionAt(T.mdt, s.x),
    secMds: sectionAt(T.mds, s.x),
    secModel: sectionAt(fine, s.x),
    bank: bankZ(s.x),
  };
}

/** Fuentes de elevación típicas (para la tabla de la parte 1 y el paso a paso). */
export interface Source {
  id: string;
  name: string;
  pixel: string;
  surface: string;
  accuracy: string;
  note: string;
  opts: TerrainOpts;
}
export const SOURCES: Source[] = [
  { id: 'lidar', name: 'LiDAR aerotransportado (MDT)', pixel: '1 m', surface: 'Terreno (suelo clasificado)', accuracy: 'RMSEz ≤ 10 cm (calidad QL2 del USGS)', note: 'El láser no atraviesa el agua: falta el cauce bajo la lámina.', opts: { surf: 'mdt', p: 1, method: 'promedio', sigma: 0.1, burn: false } },
  { id: 'dron', name: 'Fotogrametría con dron (MDS)', pixel: '1 m o menos', surface: 'Superficie (techos, copas, el tablero del puente)', accuracy: 'Depende del vuelo y de los puntos de control', note: 'Hay que clasificar el suelo para tener un MDT; bajo los árboles las fotos no ven el suelo.', opts: { surf: 'mds', p: 1, method: 'promedio', sigma: 0.1, burn: false } },
  { id: 'alos', name: 'ALOS PALSAR RTC (12,5 m)', pixel: '12,5 m (dato de 30 m)', surface: 'Superficie (es el SRTM)', accuracy: 'La del SRTM: del orden de metros', note: 'Fuera de EE. UU. el ráster de 12,5 m es el SRTM de 30 m remuestreado: no tiene más detalle.', opts: { surf: 'mds', p: 30, method: 'promedio', sigma: 3, burn: false } },
  { id: 'copernicus', name: 'Copernicus GLO-30', pixel: '30 m', surface: 'Superficie (edificios, infraestructura y vegetación)', accuracy: 'Absoluta < 4 m (LE90); relativa < 2 m en pendientes ≤ 20 %', note: 'Gratuito y global; útil para cuencas, no para el detalle de un cauce urbano.', opts: { surf: 'mds', p: 30, method: 'promedio', sigma: 2.4, burn: false } },
];

// ------------------------------------------------------------------ corridas del modelo

export type NLevel = 'min' | 'normal' | 'max';
export const N_LEVEL_NAMES: Record<NLevel, string> = { min: 'Mínimos', normal: 'Normales', max: 'Máximos' };
export function nSet(level: NLevel, nB = 0.2): Record<Cover, number> {
  const k = level === 'min' ? 0 : level === 'normal' ? 1 : 2;
  const out = Object.fromEntries(COVER_KEYS.map((c) => [c, COVERS[c].n[k]])) as Record<Cover, number>;
  out.edificio = nB;
  return out;
}

export const LIDAR_BURNED: TerrainOpts = { surf: 'mdt', p: 1, method: 'promedio', sigma: 0, burn: true };

/** Corrida base de las partes 2 y 3: celdas de 20 m con subgrid, inercia local, T = 100 años. */
export function baseRun(o: Partial<RunOpts> = {}): RunOpts {
  return {
    terrain: LIDAR_BURNED,
    mesh: { c: 20, subgrid: true, breaklines: true },
    rough: { n: normalN(), mult: 1, buildings: 'n' },
    eq: 'inercia',
    dtMode: 'courant',
    dt: 10,
    courantMax: 0.7,
    theta: 1,
    tolWS: 0.003,
    maxIter: 20,
    hydro: designHydro(100, 30),
    egSlope: 0.005,
    outSlope: 0.005,
    warmup: 20,
    duration: 100,
    outEvery: 60,
    ...o,
  };
}

/** Píxeles del barrio protegido por el jarillón (para medir el área inundada). */
let TOWN: Int32Array | null = null;
export function townPixels(): Int32Array {
  if (TOWN) return TOWN;
  const T = truth();
  const out: number[] = [];
  for (let j = 245; j < NY; j++)
    for (let i = 100; i < 438; i++) {
      const k = j * NX + i;
      if (T.dist[k] > LEVEE.dn + 5 && j < 352) out.push(k);
    }
  return (TOWN = Int32Array.from(out));
}

/** Clase de amenaza H1 a H6 (AIDR, Guideline 7-3, 2017) con la profundidad, la velocidad y su producto. */
export function hazardClass(D: number, V: number, DV: number): number {
  if (D < 0.02) return 0;
  if (DV <= 0.3 && D <= 0.3 && V <= 2) return 1;
  if (DV <= 0.6 && D <= 0.5 && V <= 2) return 2;
  if (DV <= 0.6 && D <= 1.2 && V <= 2) return 3;
  if (DV <= 1 && D <= 2 && V <= 2) return 4;
  if (DV <= 4 && D <= 4 && V <= 4) return 5;
  return 6;
}
export const HAZARD_TEXT = ['Seco', 'H1: en general seguro para personas, vehículos y edificaciones', 'H2: inseguro para vehículos pequeños', 'H3: inseguro para vehículos, niños y adultos mayores', 'H4: inseguro para vehículos y personas', 'H5: inseguro para todos; edificaciones con posible daño estructural', 'H6: inseguro para todos; cualquier edificación puede fallar'];

export interface Summary {
  ok: boolean;
  wseBridge: number;
  qBridge: number;
  qin: number;
  qout: number;
  attenuation: number;
  townArea: number;
  townHazard: number[];
  school: number;
  schoolArrival: number;
  wetArea: number;
  vmax: number;
  volErr: number;
  ms: number;
  overtop: boolean;
  outletWse: number;
}

/** Lo que se lee de una corrida: niveles, caudales, el barrio, la escuela y la amenaza. */
export function summarize(r: RunResult): Summary {
  const g = r.geom, s = r.series;
  const town = townPixels();
  let townArea = 0;
  const townHazard = [0, 0, 0, 0, 0, 0, 0];
  for (const k of town) {
    const ci = Math.floor(Math.floor(k / NX) / g.c) * g.MX + Math.floor((k % NX) / g.c);
    const D = r.etaMax[ci] - g.z[k];
    if (D > 0.1) townArea++;
    if (D > 0.02) {
      const DV = Math.max(0, r.etaDV[ci] - g.z[k]) * r.vDV[ci];
      townHazard[hazardClass(D, r.vMax[ci], DV)]++;
    }
  }
  let wet = 0;
  for (let j = 0; j < NY; j += 2)
    for (let i = 0; i < NX; i += 2) {
      const ci = Math.floor(j / g.c) * g.MX + Math.floor(i / g.c);
      if (r.etaMax[ci] - g.z[j * NX + i] > 0.05) wet += 4;
    }
  let vmax = 0;
  for (let i = 0; i < g.NC; i++) vmax = Math.max(vmax, r.vMax[i]);
  const k = s.depthSchool.findIndex((d) => d > 0.1);
  const qin = Math.max(0, ...s.qin), qout = Math.max(0, ...s.qout);
  // nivel cerca de la salida (celda sobre el eje en x = 620)
  const xo = 620;
  const co = Math.floor(Math.min(NY - 1, yc(xo)) / g.c) * g.MX + Math.floor(xo / g.c);
  return {
    ok: !r.unstable,
    wseBridge: s.wseBridge.length ? Math.max(...s.wseBridge) : NaN,
    qBridge: s.qBridge.length ? Math.max(...s.qBridge) : NaN,
    qin,
    qout,
    attenuation: qin > 0 ? 1 - qout / qin : 0,
    townArea,
    townHazard,
    school: s.depthSchool.length ? Math.max(...s.depthSchool) : 0,
    schoolArrival: k >= 0 ? s.t[k] / 60 : NaN,
    wetArea: wet,
    vmax,
    volErr: r.vol.errPct,
    ms: r.ms,
    overtop: townArea > 400,
    outletWse: r.etaMax[co],
  };
}

// ------------------------------------------------------------------ parte 2: coberturas

export interface CoverScene {
  level: NLevel;
  mult: number;
  buildings: BuildingMode;
  nB: number;
  /** Colorear por cobertura o por n. */
  view: 'cobertura' | 'n';
}
export const DEFAULT_COVER: CoverScene = { level: 'normal', mult: 1, buildings: 'n', nB: 0.2, view: 'cobertura' };
export const coverRun = (s: CoverScene) => baseRun({ rough: { n: nSet(s.level, s.nB), mult: s.mult, buildings: s.buildings } });
export const coverBase = () => baseRun();

// ------------------------------------------------------------------ parte 3: periodos de retorno

export interface ReturnScene {
  T: number;
  /** Vida útil de la obra [años]. */
  life: number;
  /** Tiempo al pico del hidrograma [min]. */
  tp: number;
  outSlope: number;
  egSlope: number;
}
export const DEFAULT_RETURN: ReturnScene = { T: 25, life: 50, tp: 30, outSlope: 0.005, egSlope: 0.005 };
export const returnRun = (s: ReturnScene) => baseRun({ hydro: designHydro(s.T, s.tp), outSlope: s.outSlope, egSlope: s.egSlope, duration: Math.max(100, Math.round(s.tp * 3.4)) });
export function returnScene(s: ReturnScene) {
  return { Q: quantile(AMS_FIT, s.T), risk: risk(s.T, s.life), fit: AMS_FIT };
}

// ------------------------------------------------------------------ parte 4: malla y ecuaciones

export interface EqScene {
  c: number;
  subgrid: boolean;
  breaklines: boolean;
  eq: Eq;
  dtMode: 'fijo' | 'courant';
  dt: number;
  theta: number;
  /** Celda inspeccionada (centro en m). */
  cx: number;
  cy: number;
  /** Nivel del agua en el inspector, sobre el punto más bajo de la celda [m]. */
  h: number;
}
export const DEFAULT_EQ: EqScene = { c: 20, subgrid: true, breaklines: true, eq: 'inercia', dtMode: 'courant', dt: 10, theta: 1, cx: 250, cy: 220, h: 1.5 };
export const eqMesh = (s: EqScene): MeshOpts => ({ c: s.c, subgrid: s.subgrid, breaklines: s.breaklines });
export const eqRun = (s: EqScene) => baseRun({ mesh: eqMesh(s), eq: s.eq, dtMode: s.dtMode, dt: s.dt, theta: s.theta, courantMax: s.eq === 'inercia' ? 0.7 : 2 });
/** Referencia de la parte 4: celdas de 10 m con subgrid y líneas de quiebre. */
export const eqReference = () => baseRun({ mesh: { c: 10, subgrid: true, breaklines: true } });

// ------------------------------------------------------------------ parte 5: HEC-RAS paso a paso

export type Crs = 'origen' | 'geograficas';
export interface ModelScene {
  step: number;
  crs: Crs;
  source: string;
  burn: boolean;
  level: NLevel;
  buildings: BuildingMode;
  c: number;
  breaklines: boolean;
  egSlope: number;
  outSlope: number;
  T: number;
  tp: number;
  warmup: number;
  duration: number;
  dtMode: 'fijo' | 'courant';
  dt: number;
  courantMax: number;
  eq: Eq;
  theta: number;
  tolWS: number;
  maxIter: number;
  layer: 'profundidad' | 'velocidad' | 'cota' | 'amenaza' | 'llegada';
}
export const DEFAULT_MODEL: ModelScene = {
  step: 0,
  crs: 'origen',
  source: 'lidar',
  burn: true,
  level: 'normal',
  buildings: 'n',
  c: 10,
  breaklines: true,
  egSlope: 0.005,
  outSlope: 0.005,
  T: 100,
  tp: 30,
  warmup: 20,
  duration: 100,
  dtMode: 'fijo',
  dt: 15,
  courantMax: 2,
  eq: 'difusiva',
  theta: 1,
  tolWS: 0.003,
  maxIter: 20,
  layer: 'profundidad',
};

export function modelTerrain(s: ModelScene): TerrainOpts {
  const src = SOURCES.find((x) => x.id === s.source) ?? SOURCES[0];
  return { ...src.opts, burn: s.burn };
}
export function modelRun(s: ModelScene): RunOpts {
  return {
    terrain: modelTerrain(s),
    mesh: { c: s.c, subgrid: true, breaklines: s.breaklines },
    rough: { n: nSet(s.level), mult: 1, buildings: s.buildings } as Roughness,
    eq: s.eq,
    dtMode: s.dtMode,
    dt: s.dt,
    courantMax: s.courantMax,
    theta: s.theta,
    tolWS: s.tolWS,
    maxIter: s.maxIter,
    hydro: designHydro(s.T, s.tp),
    egSlope: s.egSlope,
    outSlope: s.outSlope,
    warmup: s.warmup,
    duration: s.duration,
    outEvery: 60,
  };
}

export const STEPS = [
  { id: 'proyeccion', name: 'Proyección', ras: 'RAS Mapper → Set Projection' },
  { id: 'terreno', name: 'Terreno', ras: 'RAS Mapper → Terrains → Create a New RAS Terrain' },
  { id: 'cobertura', name: 'Coberturas y n', ras: 'RAS Mapper → Map Layers → Land Cover / Manning\'s n' },
  { id: 'malla', name: 'Área 2D y malla', ras: 'Geometries → 2D Flow Areas · Breaklines · Generate Computation Points' },
  { id: 'bordes', name: 'Condiciones de borde', ras: 'Geometries → BC Lines' },
  { id: 'flujo', name: 'Flujo no permanente', ras: 'Edit → Unsteady Flow Data' },
  { id: 'plan', name: 'Plan y opciones', ras: 'Run → Unsteady Flow Analysis · Computation Options and Tolerances' },
  { id: 'correr', name: 'Correr', ras: 'Compute: Geometry Preprocessor + Unsteady Flow Simulation' },
  { id: 'resultados', name: 'Resultados', ras: 'RAS Mapper → Results (Depth, Velocity, WSE, Arrival Time)' },
  { id: 'comparar', name: 'Comparar', ras: 'Plans: corridas de sensibilidad' },
] as const;

export { POIS, ROAD, dn };

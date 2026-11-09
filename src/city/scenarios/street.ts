// Escenario 1 — «Calle de prueba»: escenario didáctico de verificación (no es una calle real).
// Contiene todos los elementos exigidos: calle en pendiente, intersección, edificios que bloquean,
// andenes y bordillos, depresión donde se encharca, zona permeable, sumideros y salida definida.

import type { BuildingSpec, Scenario } from '../sim/scenario';
import { ENGINE } from '../sim/constants';
import { prng, rasterFrom, rect } from './primitives';

const W = 80;
const H = 56;
/** Eje de la calle principal (y) y de la carrera (x). */
const YC = 28;
const XC = 46;

/** Perfil a lo largo de la calle: 4 % de pendiente, casi plano (1 %) en la intersección (x 40–60). */
const drop = (x: number) => 0.04 * Math.min(x, 40) + 0.01 * Math.min(Math.max(x - 40, 0), 20) + 0.04 * Math.max(x - 60, 0);
/** Terreno: baja hacia el este y tiene 2 % de pendiente transversal hacia el eje de la calle. Cotas relativas. */
const ground = (x: number, y: number) => 10 - drop(x) + 0.02 * Math.abs(y - YC);

function b(id: string, x0: number, y0: number, x1: number, y1: number, floors: number, down: [number, number], style: BuildingSpec['style'], color?: string): BuildingSpec {
  return { id, polygon: rect(x0, y0, x1, y1), floors, heightM: floors * 3, downspout: down, style, color, kind: 'didactico' };
}

export function streetScenario(): Scenario {
  return {
    format: 'medellin-lluvia/escenario',
    version: 1,
    id: 'calle-de-prueba',
    title: 'Calle de prueba (escenario didáctico)',
    shortTitle: 'Calle de prueba',
    summary: 'Una calle en pendiente con una intersección, andenes, edificios, un parque, una esquina baja y dos sumideros. Sirve para verificar el modelo paso a paso.',
    provenance: {
      kind: 'demostrativo',
      badge: 'Escenario didáctico (no es una calle real)',
      statement: 'Escenario didáctico de verificación. No corresponde a ninguna calle real de Medellín; las cotas son relativas.',
      layers: [
        { layer: 'Terreno', kind: 'didactico', note: 'Calle con 4 % de pendiente (1 % en la intersección) y 2 % de pendiente transversal; cotas relativas (no m s. n. m.).' },
        { layer: 'Edificios', kind: 'didactico', note: 'Huellas y alturas inventadas (3 m por piso).' },
        { layer: 'Andenes y bordillos', kind: 'hipotetico', note: 'Bordillo de 0,15 m y andén con 2 % hacia la calzada.' },
        { layer: 'Esquina baja', kind: 'didactico', note: 'Depresión de 0,12 m en la cuneta.' },
        { layer: 'Sumideros', kind: 'hipotetico', note: 'Rejillas de 0,6 × 0,9 m con capacidad de 40 L/s. No son infraestructura levantada.' },
        { layer: 'Coberturas', kind: 'estimado', note: 'Parámetros estimados de literatura general.' },
      ],
      sources: [],
      generatedBy: 'src/city/scenarios/street.ts',
    },
    extent: { crs: 'LOCAL', origin: [0, 0], width: W, height: H },
    units: { length: 'm', elevation: 'm', rain: 'mm/h', time: 's', flow: 'L/s' },
    resolutions: [0.5, 1, 2],
    defaultResolution: 1,
    terrain: rasterFrom(ground, W, H, 0.5, 'Cotas relativas (escenario didáctico)'),
    defaultCover: 'concreto',
    surfaces: [
      // Lotes: 0,30 m sobre la calle (drenan hacia el andén)
      { id: 'lote-so', polygon: rect(0, 0, 39, 21), cover: 'concreto', dz: 0.3, kind: 'didactico' },
      { id: 'lote-se', polygon: rect(53, 0, 80, 21), cover: 'concreto', dz: 0.3, kind: 'didactico' },
      { id: 'lote-no', polygon: rect(0, 35, 39, 56), cover: 'concreto', dz: 0.3, kind: 'didactico' },
      { id: 'lote-ne', polygon: rect(53, 35, 80, 56), cover: 'concreto', dz: 0.3, kind: 'didactico' },
      // Calzadas con bombeo (centro más alto, cunetas junto al bordillo)
      { id: 'calle', polygon: rect(0, 24, 80, 32), cover: 'asfalto', crossSlope: { axis: 'y', at: YC, slope: -0.035 }, kind: 'didactico', label: 'Calzada' },
      { id: 'carrera-sur', polygon: rect(42, 0, 50, 24), cover: 'asfalto', crossSlope: { axis: 'x', at: XC, slope: -0.035 }, kind: 'didactico' },
      { id: 'carrera-norte', polygon: rect(42, 32, 50, 56), cover: 'asfalto', crossSlope: { axis: 'x', at: XC, slope: -0.035 }, kind: 'didactico' },
      // Andenes: +0,15 m (bordillo) y 2 % hacia la calzada
      { id: 'anden-s', polygon: rect(0, 21, 42, 24), cover: 'anden', dz: 0.15, crossSlope: { axis: 'y', at: 24, slope: 0.02 }, kind: 'hipotetico' },
      { id: 'anden-s2', polygon: rect(50, 21, 80, 24), cover: 'anden', dz: 0.15, crossSlope: { axis: 'y', at: 24, slope: 0.02 }, kind: 'hipotetico' },
      { id: 'anden-n', polygon: rect(0, 32, 42, 35), cover: 'anden', dz: 0.15, crossSlope: { axis: 'y', at: 32, slope: 0.02 }, kind: 'hipotetico' },
      { id: 'anden-n2', polygon: rect(50, 32, 80, 35), cover: 'anden', dz: 0.15, crossSlope: { axis: 'y', at: 32, slope: 0.02 }, kind: 'hipotetico' },
      { id: 'anden-cso', polygon: rect(39, 0, 42, 21), cover: 'anden', dz: 0.15, crossSlope: { axis: 'x', at: 42, slope: 0.02 }, kind: 'hipotetico' },
      { id: 'anden-cse', polygon: rect(50, 0, 53, 21), cover: 'anden', dz: 0.15, crossSlope: { axis: 'x', at: 50, slope: 0.02 }, kind: 'hipotetico' },
      { id: 'anden-cno', polygon: rect(39, 35, 42, 56), cover: 'anden', dz: 0.15, crossSlope: { axis: 'x', at: 42, slope: 0.02 }, kind: 'hipotetico' },
      { id: 'anden-cne', polygon: rect(50, 35, 53, 56), cover: 'anden', dz: 0.15, crossSlope: { axis: 'x', at: 50, slope: 0.02 }, kind: 'hipotetico' },
      // Zona permeable fija: parque con árboles
      { id: 'parque', polygon: rect(1, 36, 20, 55), cover: 'zona_verde', kind: 'didactico', label: 'Parque' },
    ],
    bowls: [{ id: 'esquina-baja', cx: 53.5, cy: 24.6, r: 2.6, depth: 0.12, kind: 'didactico', label: 'Esquina baja' }],
    buildings: [
      b('so-1', 23, 9, 30.5, 20.5, 4, [27, 21.4], 'ladrillo'),
      b('so-3', 31, 9, 38.5, 16.5, 3, [35, 16.9], 'ladrillo'),
      b('so-2', 23, 0.5, 38.5, 8, 2, [22.4, 4], 'revoque', '#e3c48f'),
      b('se-1', 54, 10, 66, 20.5, 3, [60, 21.4], 'ladrillo'),
      b('se-2', 67, 13, 76, 20.5, 5, [71, 21.4], 'revoque', '#d98f6b'),
      b('se-3', 54, 0.5, 66, 9, 2, [66.6, 5], 'ladrillo'),
      b('no-1', 21, 35.5, 38.5, 46, 3, [30, 34.6], 'ladrillo'),
      b('no-2', 21, 47, 38.5, 55.5, 2, [20.4, 51], 'revoque', '#9cc3c9'),
      b('ne-1', 71, 35.5, 79.5, 48, 6, [75, 34.6], 'torre'),
      b('ne-2', 55, 51, 79.5, 55.5, 3, [62, 50.4], 'ladrillo'),
    ],
    drains: [
      { id: 'sum-esquina', name: 'Sumidero de la esquina baja', at: [53.5, 24.6], widthM: 0.6, lengthM: 0.9, freeSides: 3, openFraction: 0.5, capacityLps: 40, gutterSlope: 0.02, obstruction: 0, kind: 'hipotetico' },
      { id: 'sum-carrera', name: 'Sumidero de la carrera', at: [49.5, 36.5], widthM: 0.6, lengthM: 0.9, freeSides: 3, openFraction: 0.5, capacityLps: 40, gutterSlope: 0.02, obstruction: 0, kind: 'hipotetico' },
    ],
    outlets: [{ id: 'salida-este', name: 'Salida: la calle sigue bajando', edge: 'E', from: 24, to: 32, slope: 0.04, kind: 'didactico' }],
    inflows: [{ id: 'desde-arriba', name: 'Agua que baja de calles más altas', edge: 'W', from: 24, to: 32, kind: 'didactico' }],
    zones: [
      { id: 'parqueadero', name: 'Parqueadero', polygon: rect(2, 2, 22, 20.5), cover: 'asfalto', options: ['asfalto', 'adoquin_permeable', 'grama'], cost: 40 },
      { id: 'plazoleta', name: 'Plazoleta', polygon: rect(55, 36, 70, 50), cover: 'concreto', options: ['concreto', 'adoquin_permeable', 'grama'], cost: 30 },
    ],
    gardens: [{ id: 'jardin-calle', name: 'Jardín de lluvia junto a la calle', polygon: rect(31, 17, 38.5, 21), inlet: rect(32, 21, 38, 24), depthM: 0.15, cost: 30 }],
    tanks: [{ id: 'deposito-torre', name: 'Depósito de la torre', buildingIds: ['ne-1'], capacityM3: 5, releaseLps: 0.5, cost: 25 }],
    probes: [
      { id: 'esquina', name: 'Esquina baja', at: [53.5, 25.2] },
      { id: 'mitad', name: 'Mitad de la calle', at: [20, 24.6] },
      { id: 'salida', name: 'Cerca de la salida', at: [78.5, 24.6] },
      { id: 'jardin', name: 'Jardín de lluvia', at: [34.5, 18.5] },
    ],
    labels: [
      { id: 'calle', text: 'Calle en pendiente (baja hacia el este)', at: [12, 28], priority: 3 },
      { id: 'carrera', text: 'Carrera', at: [46, 48], priority: 2 },
      { id: 'parque', text: 'Parque (permeable)', at: [10, 46], priority: 2 },
      { id: 'parqueadero', text: 'Parqueadero', at: [12, 11], priority: 2 },
      { id: 'plazoleta', text: 'Plazoleta', at: [62.5, 43], priority: 1 },
      { id: 'salida', text: 'Salida del agua', at: [78, 28], priority: 3 },
      { id: 'torre', text: 'Torre', at: [75, 42], priority: 1 },
    ],
    streetView: { eye: [6, 26.2], look: [60, 26.8] },
    pipes: [
      { id: 'tubo-esquina', path: [[53.5, 24.6], [53.5, 26], [80, 26]], kind: 'hipotetico' },
      { id: 'tubo-carrera', path: [[49.5, 36.5], [47, 36.5], [47, 26], [53.5, 26]], kind: 'hipotetico' },
    ],
    decor: streetDecor(),
    defaults: {
      scenarioId: 'calle-de-prueba',
      dx: 1,
      rain: { intensityMmH: 60, durationMin: 20, pattern: 'constante', spatial: 'uniforme', center: [40, 28], radiusM: 25 },
      simMinutes: 35,
      soilInitial: 'seco',
      inflowLps: 0,
      seed: 20261108,
    },
    engine: { name: ENGINE.name, version: ENGINE.version },
    seed: 20261108,
  };
}

function streetDecor(): Scenario['decor'] {
  const rnd = prng(11);
  const trees: [number, number][] = [];
  for (let q = 0; q < 26; q++) trees.push([2.5 + rnd() * 16, 37.5 + rnd() * 16]);
  for (let x = 4; x < 38; x += 7) trees.push([x, 22.2]);
  for (let x = 57; x < 79; x += 7) trees.push([x, 33.8]);
  return {
    markings: [
      { kind: 'dash', a: [0, YC], b: [41, YC], width: 0.15 },
      { kind: 'dash', a: [51, YC], b: [80, YC], width: 0.15 },
      { kind: 'dash', a: [XC, 0], b: [XC, 23], width: 0.15 },
      { kind: 'dash', a: [XC, 33], b: [XC, 56], width: 0.15 },
      { kind: 'zebra', a: [40.5, 24.3], b: [40.5, 31.7], width: 2.4 },
      { kind: 'zebra', a: [51.5, 24.3], b: [51.5, 31.7], width: 2.4 },
      { kind: 'zebra', a: [42.3, 22.5], b: [49.7, 22.5], width: 2.4 },
      { kind: 'zebra', a: [42.3, 33.5], b: [49.7, 33.5], width: 2.4 },
    ],
    trees,
    lamps: [[10, 34.4], [30, 34.4], [62, 21.6], [76, 21.6], [40.6, 10], [51.4, 46]],
  };
}

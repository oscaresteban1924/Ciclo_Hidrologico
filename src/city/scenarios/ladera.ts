// Escenario 2 — «Ladera con quebrada»: sector DEMOSTRATIVO inspirado en barrios de ladera de Medellín.
// No reproduce un lugar real: ni las calles, ni las cotas, ni los sumideros ni las tuberías son levantamientos.
// Reúne rasgos típicos: calle empinada que baja hacia el valle, carrera a lo largo de la ladera, casas de
// ladrillo de 2 a 5 pisos, cancha en terraza, colegio, retiro verde de quebrada y quebrada que baja al río.

import type { BuildingSpec, Polygon, Scenario, SurfacePatch } from '../sim/scenario';
import { ENGINE } from '../sim/constants';
import { prng, rasterFrom, rect } from './primitives';

const W = 128;
const H = 96;

/** Eje de la quebrada (meandro suave). */
export const yq = (x: number): number => 16 + 3 * Math.sin(x / 18);

/** Ladera: 10 % hacia el este (hacia el valle), rellano en la intersección y 3,5 % hacia la quebrada; cauce encajado 2,2 m. Cotas relativas. */
/** Descenso acumulado hacia el este: 10 %, con un rellano de 2 % en la intersección (x 80–100). */
const drop = (x: number) => 0.1 * Math.min(x, 80) + 0.02 * Math.min(Math.max(x - 80, 0), 20) + 0.1 * Math.max(x - 100, 0);

export function laderaGround(x: number, y: number): number {
  let z = 44 - drop(x) + 0.035 * (y - 16);
  const d = Math.abs(y - yq(x));
  if (d < 2) z -= 2.2;
  else if (d < 6) z -= 2.2 * (1 - (d - 2) / 4);
  return z;
}

function band(y0: (x: number) => number, y1: (x: number) => number, x0 = 0, x1 = W, step = 4): Polygon {
  const top: [number, number][] = [];
  const bot: [number, number][] = [];
  for (let x = x0; x <= x1 + 1e-9; x += step) {
    bot.push([x, y0(x)]);
    top.push([x, y1(x)]);
  }
  return [...bot, ...top.reverse()];
}

const PALETTE = ['#e3c48f', '#9cc3c9', '#d98f6b', '#f0e2c4', '#c7b7d9', '#a9cfa1'];

/** Hilera de casas a lo largo de un eje, con anchos, pisos y estilos pseudoaleatorios (semilla fija). */
function row(
  id: string,
  rnd: () => number,
  axis: 'x' | 'y',
  from: number,
  to: number,
  front: number,
  depth: number,
  frontSide: 1 | -1,
  floors: [number, number],
  out: BuildingSpec[],
): void {
  let p = from;
  let n = 0;
  while (p < to - 4) {
    const w = Math.min(to - p, 6 + Math.floor(rnd() * 4));
    const f = floors[0] + Math.floor(rnd() * (floors[1] - floors[0] + 1));
    const d = depth - Math.floor(rnd() * 3);
    const brick = rnd() < 0.62;
    const color = brick ? undefined : PALETTE[Math.floor(rnd() * PALETTE.length)];
    const a = p + 0.25, bnd = p + w - 0.25;
    // La fachada da al andén; la bajante cae medio metro delante de la fachada
    const f0 = front, f1 = front - frontSide * d;
    const poly = axis === 'x' ? rect(a, Math.min(f0, f1), bnd, Math.max(f0, f1)) : rect(Math.min(f0, f1), a, Math.max(f0, f1), bnd);
    const mid = (a + bnd) / 2;
    const down: [number, number] = axis === 'x' ? [mid, front + frontSide * 0.6] : [front + frontSide * 0.6, mid];
    out.push({ id: `${id}-${++n}`, polygon: poly, floors: f, heightM: f * 2.8, downspout: down, style: brick ? 'ladrillo' : 'revoque', color, kind: 'didactico' });
    p += w;
  }
}

export function laderaScenario(): Scenario {
  const rnd = prng(57);
  const buildings: BuildingSpec[] = [];
  // Calle (y 58–65) con andenes 56–58 y 65–67; carrera (x 84–91) con andenes 82–84 y 91–93
  row('cn', rnd, 'x', 1, 81.5, 67.4, 9, -1, [2, 5], buildings); // norte de la calle, fachada en y = 67,4 (detrás crece hacia +y)
  row('cs', rnd, 'x', 1, 62, 55.6, 8, 1, [2, 4], buildings); // sur de la calle
  row('kn', rnd, 'y', 77, 95.5, 81.6, 8, 1, [2, 4], buildings); // oeste de la carrera norte
  row('ks', rnd, 'y', 27, 45, 81.6, 8, 1, [2, 4], buildings); // oeste de la carrera sur
  row('ce', rnd, 'x', 94, 127.5, 67.4, 6, -1, [2, 4], buildings); // norte de la calle, al este
  row('se', rnd, 'x', 94, 127.5, 55.6, 7, 1, [2, 4], buildings); // sur de la calle, al este
  buildings.push({ id: 'colegio', polygon: rect(106, 76, 126, 93), floors: 3, heightM: 10.5, downspout: [105.4, 84], style: 'comercial', color: '#e7e1d2', kind: 'didactico' });
  buildings.push({ id: 'bloque-medio', polygon: rect(42, 30, 57, 44), floors: 4, heightM: 11.2, downspout: [49.5, 44.6], style: 'ladrillo', kind: 'didactico' });
  buildings.push({ id: 'casa-retiro', polygon: rect(97, 29, 104, 36), floors: 2, heightM: 5.6, downspout: [100.5, 36.6], style: 'revoque', color: '#f0e2c4', kind: 'didactico' });

  const g = laderaGround;
  const surfaces: SurfacePatch[] = [
    // Lotes y manzanas 0,30 m sobre el andén
    { id: 'manzana-no', polygon: rect(0, 67, 82, 96), cover: 'concreto', dz: 0.3, kind: 'didactico' },
    { id: 'manzana-ne', polygon: rect(93, 67, 128, 96), cover: 'concreto', dz: 0.3, kind: 'didactico' },
    { id: 'manzana-so', polygon: rect(0, 27, 82, 56), cover: 'concreto', dz: 0.3, kind: 'didactico' },
    { id: 'manzana-se', polygon: rect(93, 27, 128, 56), cover: 'concreto', dz: 0.3, kind: 'didactico' },
    // Retiro de quebrada (zona verde) y cauce
    { id: 'retiro', polygon: band(() => 0, (x) => Math.max(yq(x) + 10, 27)), cover: 'zona_verde', kind: 'didactico', label: 'Retiro de quebrada' },
    { id: 'cauce', polygon: band((x) => yq(x) - 2.4, (x) => yq(x) + 2.4), cover: 'cauce', kind: 'didactico', label: 'Quebrada' },
    // Cancha en terraza (plataforma nivelada con 1 % hacia el este)
    { id: 'cancha', polygon: rect(14, 79, 44, 94), cover: 'cancha', plane: { z0: g(29, 86.5) + 0.3, at: [29, 86.5], sx: -0.01, sy: 0 }, kind: 'didactico', label: 'Cancha' },
    // Parque de barrio en la ladera
    { id: 'parque', polygon: rect(2, 28, 40, 45), cover: 'zona_verde', kind: 'didactico', label: 'Parque' },
    // Calzadas
    { id: 'calle', polygon: rect(0, 58, 128, 65), cover: 'asfalto', crossSlope: { axis: 'y', at: 61.5, slope: -0.03 }, kind: 'didactico' },
    { id: 'carrera-n', polygon: rect(84, 65, 91, 96), cover: 'asfalto', crossSlope: { axis: 'x', at: 87.5, slope: -0.03 }, kind: 'didactico' },
    { id: 'carrera-s', polygon: rect(84, 24, 91, 58), cover: 'asfalto', crossSlope: { axis: 'x', at: 87.5, slope: -0.03 }, kind: 'didactico' },
    // Andenes
    { id: 'anden-cs-o', polygon: rect(0, 56, 84, 58), cover: 'anden', dz: 0.15, crossSlope: { axis: 'y', at: 58, slope: 0.02 }, kind: 'hipotetico' },
    { id: 'anden-cs-e', polygon: rect(91, 56, 128, 58), cover: 'anden', dz: 0.15, crossSlope: { axis: 'y', at: 58, slope: 0.02 }, kind: 'hipotetico' },
    { id: 'anden-cn-o', polygon: rect(0, 65, 84, 67), cover: 'anden', dz: 0.15, crossSlope: { axis: 'y', at: 65, slope: 0.02 }, kind: 'hipotetico' },
    { id: 'anden-cn-e', polygon: rect(91, 65, 128, 67), cover: 'anden', dz: 0.15, crossSlope: { axis: 'y', at: 65, slope: 0.02 }, kind: 'hipotetico' },
    { id: 'anden-kn-o', polygon: rect(82, 67, 84, 96), cover: 'anden', dz: 0.15, crossSlope: { axis: 'x', at: 84, slope: 0.02 }, kind: 'hipotetico' },
    { id: 'anden-kn-e', polygon: rect(91, 67, 93, 96), cover: 'anden', dz: 0.15, crossSlope: { axis: 'x', at: 91, slope: 0.02 }, kind: 'hipotetico' },
    { id: 'anden-ks-o', polygon: rect(82, 27, 84, 56), cover: 'anden', dz: 0.15, crossSlope: { axis: 'x', at: 84, slope: 0.02 }, kind: 'hipotetico' },
    { id: 'anden-ks-e', polygon: rect(91, 27, 93, 56), cover: 'anden', dz: 0.15, crossSlope: { axis: 'x', at: 91, slope: 0.02 }, kind: 'hipotetico' },
  ];

  const yOut = yq(W);
  const yIn = yq(0);
  return {
    format: 'medellin-lluvia/escenario',
    version: 1,
    id: 'ladera-quebrada',
    title: 'Ladera con quebrada (sector demostrativo inspirado en Medellín)',
    shortTitle: 'Ladera con quebrada',
    summary: 'Un barrio de ladera: una calle empinada que baja hacia el valle, una carrera a lo largo de la montaña, casas de ladrillo, una cancha en terraza, un colegio y una quebrada con su retiro verde.',
    provenance: {
      kind: 'demostrativo',
      badge: 'Demostrativo (no es un lugar real)',
      statement: 'Sector demostrativo inspirado en barrios de ladera de Medellín. No reproduce un lugar real; terreno, edificios, sumideros y tuberías son elementos didácticos o hipotéticos.',
      layers: [
        { layer: 'Terreno', kind: 'didactico', note: 'Ladera con 10 % hacia el valle (rellano de 2 % en la intersección) y quebrada encajada 2,2 m; cotas relativas.' },
        { layer: 'Edificios', kind: 'didactico', note: 'Hileras de casas generadas con semilla fija (2–5 pisos, 2,8 m por piso).' },
        { layer: 'Andenes y bordillos', kind: 'hipotetico', note: 'Bordillo de 0,15 m, andén con 2 % hacia la calzada.' },
        { layer: 'Sumideros y tuberías', kind: 'hipotetico', note: 'Cuatro rejillas de 0,6 × 0,9 m (40 L/s) y tubería esquemática no calculada.' },
        { layer: 'Coberturas', kind: 'estimado', note: 'Parámetros estimados de literatura general; no calibrados.' },
      ],
      sources: [],
      generatedBy: 'src/city/scenarios/ladera.ts',
    },
    extent: { crs: 'LOCAL', origin: [0, 0], width: W, height: H },
    units: { length: 'm', elevation: 'm', rain: 'mm/h', time: 's', flow: 'L/s' },
    resolutions: [1, 2],
    defaultResolution: 1,
    terrain: rasterFrom(laderaGround, W, H, 0.5, 'Cotas relativas (sector demostrativo)'),
    defaultCover: 'concreto',
    surfaces,
    bowls: [{ id: 'esquina-baja', cx: 94.5, cy: 58.5, r: 2.6, depth: 0.12, kind: 'didactico', label: 'Esquina baja' }],
    buildings,
    drains: [
      { id: 'sum-esquina', name: 'Sumidero de la esquina', at: [94.5, 58.5], widthM: 0.6, lengthM: 0.9, freeSides: 3, openFraction: 0.5, capacityLps: 40, gutterSlope: 0.02, obstruction: 0, kind: 'hipotetico' },
      { id: 'sum-calle', name: 'Sumidero de la calle (arriba)', at: [48.5, 58.5], widthM: 0.6, lengthM: 0.9, freeSides: 3, openFraction: 0.5, capacityLps: 40, gutterSlope: 0.02, obstruction: 0, kind: 'hipotetico' },
      { id: 'sum-carrera-n', name: 'Sumidero de la carrera norte', at: [90.5, 80.5], widthM: 0.6, lengthM: 0.9, freeSides: 3, openFraction: 0.5, capacityLps: 40, gutterSlope: 0.02, obstruction: 0, kind: 'hipotetico' },
      { id: 'sum-carrera-s', name: 'Sumidero de la carrera sur', at: [90.5, 31.5], widthM: 0.6, lengthM: 0.9, freeSides: 3, openFraction: 0.5, capacityLps: 40, gutterSlope: 0.02, obstruction: 0, kind: 'hipotetico' },
    ],
    outlets: [
      { id: 'salida-calle', name: 'La calle sigue bajando', edge: 'E', from: 58, to: 65, slope: 0.1, kind: 'didactico' },
      { id: 'salida-quebrada', name: 'La quebrada sigue hacia el río', edge: 'E', from: yOut - 6, to: yOut + 6, slope: 0.03, kind: 'didactico' },
    ],
    inflows: [{ id: 'quebrada-arriba', name: 'Agua que trae la quebrada desde arriba', edge: 'W', from: yIn - 2, to: yIn + 2, kind: 'didactico' }],
    zones: [
      { id: 'parqueadero', name: 'Parqueadero comunal', polygon: rect(96, 38, 126, 47), cover: 'asfalto', options: ['asfalto', 'adoquin_permeable', 'grama'], cost: 40 },
      { id: 'patio', name: 'Patio del colegio', polygon: rect(98, 73, 105.5, 94), cover: 'concreto', options: ['concreto', 'adoquin_permeable', 'grama'], cost: 30 },
      { id: 'plazoleta', name: 'Plazoleta', polygon: rect(59, 28, 73, 44), cover: 'concreto', options: ['concreto', 'adoquin_permeable', 'zona_verde'], cost: 30 },
    ],
    gardens: [
      { id: 'jardin-calle', name: 'Jardín de lluvia en la calle', polygon: rect(64.5, 50.5, 79, 55.8), inlet: rect(65, 56, 78.5, 58), depthM: 0.15, cost: 30 },
      { id: 'jardin-carrera', name: 'Jardín de lluvia en la carrera', polygon: rect(93.2, 74, 97.6, 88), inlet: rect(91, 74.5, 93, 87.5), depthM: 0.15, cost: 30 },
    ],
    tanks: [{ id: 'deposito-colegio', name: 'Depósito del colegio', buildingIds: ['colegio'], capacityM3: 15, releaseLps: 1, cost: 25 }],
    probes: [
      { id: 'esquina', name: 'Esquina baja', at: [94.5, 59.1] },
      { id: 'calle-arriba', name: 'Calle (arriba)', at: [40, 58.5] },
      { id: 'carrera-sur', name: 'Carrera sur', at: [90.5, 40] },
      { id: 'quebrada', name: 'Quebrada (salida)', at: [125.5, yq(125.5)] },
      { id: 'jardin', name: 'Jardín de la calle', at: [72, 53] },
    ],
    labels: [
      { id: 'calle', text: 'Calle empinada (baja hacia el valle)', at: [26, 61.5], priority: 3 },
      { id: 'carrera', text: 'Carrera', at: [87.5, 90], priority: 2 },
      { id: 'quebrada', text: 'Quebrada', at: [60, yq(60)], priority: 4 },
      { id: 'retiro', text: 'Retiro verde', at: [30, yq(30) + 7], priority: 1 },
      { id: 'cancha', text: 'Cancha', at: [29, 86.5], priority: 2 },
      { id: 'colegio', text: 'Colegio', at: [116, 84.5], priority: 2 },
      { id: 'parqueadero', text: 'Parqueadero comunal', at: [111, 42.5], priority: 1 },
      { id: 'parque', text: 'Parque', at: [20, 36], priority: 1 },
      { id: 'plazoleta', text: 'Plazoleta', at: [66, 36], priority: 1 },
    ],
    streetView: { eye: [24, 60.6], look: [104, 59.6] },
    pipes: [
      { id: 'tubo-calle', path: [[48.5, 58.5], [48.5, 61.5], [128, 61.5]], kind: 'hipotetico' },
      { id: 'tubo-esquina', path: [[94.5, 58.5], [94.5, 61.5]], kind: 'hipotetico' },
      { id: 'tubo-carrera-n', path: [[90.5, 80.5], [87.5, 80.5], [87.5, 61.5]], kind: 'hipotetico' },
      { id: 'tubo-carrera-s', path: [[90.5, 31.5], [87.5, 31.5], [87.5, 61.5]], kind: 'hipotetico' },
    ],
    decor: laderaDecor(),
    defaults: {
      scenarioId: 'ladera-quebrada',
      dx: 1,
      rain: { intensityMmH: 60, durationMin: 20, pattern: 'constante', spatial: 'uniforme', center: [64, 60], radiusM: 30 },
      simMinutes: 35,
      soilInitial: 'seco',
      inflowLps: 0,
      seed: 20261108,
    },
    engine: { name: ENGINE.name, version: ENGINE.version },
    seed: 20261108,
  };
}

function laderaDecor(): Scenario['decor'] {
  const rnd = prng(23);
  const trees: [number, number][] = [];
  // Árboles del retiro (a ambos lados del cauce) y del parque
  for (let q = 0; q < 70; q++) {
    const x = 1 + rnd() * 126;
    const side = rnd() < 0.5 ? -1 : 1;
    const y = yq(x) + side * (3.4 + rnd() * 6);
    if (x > 83 && x < 92 && y > 22) continue;
    trees.push([x, y]);
  }
  for (let q = 0; q < 22; q++) trees.push([3 + rnd() * 36, 29 + rnd() * 15]);
  for (let x = 6; x < 80; x += 9) trees.push([x, 56.4]);
  return {
    markings: [
      { kind: 'dash', a: [0, 61.5], b: [83, 61.5], width: 0.15 },
      { kind: 'dash', a: [92, 61.5], b: [128, 61.5], width: 0.15 },
      { kind: 'dash', a: [87.5, 66], b: [87.5, 96], width: 0.15 },
      { kind: 'dash', a: [87.5, 25], b: [87.5, 57], width: 0.15 },
      { kind: 'zebra', a: [82.6, 58.3], b: [82.6, 64.7], width: 2.2 },
      { kind: 'zebra', a: [92.4, 58.3], b: [92.4, 64.7], width: 2.2 },
      { kind: 'zebra', a: [84.3, 66.2], b: [90.7, 66.2], width: 2 },
    ],
    trees,
    lamps: [[20, 66.4], [50, 66.4], [70, 56.6], [100, 56.6], [120, 66.4], [91.6, 75], [82.4, 40]],
    stairs: [{ a: [57.5, 45], b: [57.5, 55.5], width: 2.2 }],
    cable: { towers: [[62, 46], [126, 90]], label: 'Cable aéreo decorativo (evoca el Metrocable)' },
  };
}

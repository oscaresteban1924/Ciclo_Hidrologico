// Geografía de referencia del Valle de Aburrá para la vista de orientación (sin Three.js: se prueba en Node).
//
// IMPORTANTE: no es un modelo digital de elevación ni un levantamiento. Son coordenadas y cotas
// APROXIMADAS de lugares públicos conocidos (estaciones del metro, cerros, municipios, el río), con
// errores típicos de cientos de metros en planta y de decenas de metros en altura. A partir de ellas se
// construye un relieve suave que conserva la forma del valle: el río de sur a norte, el fondo plano y
// ancho en el centro (Laureles, Guayabal), las laderas cortadas por quebradas, la cuchilla occidental
// más alta (cerro El Padre Amaya) y el altiplano de Santa Elena al oriente.
// Para reemplazarlo por datos oficiales (MDE y capas del Distrito), ver docs/medellin/DATOS_REALES.md.

/** Origen del esquema (≈ La Alpujarra). Es el mismo que usa el controlador para los sectores con datos reales. */
export const LON0 = -75.5736;
export const LAT0 = 6.2442;
const KX = 111.32 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110.57;

/** lon/lat → km (x este, y norte) desde el origen. */
export function toKm(lon: number, lat: number): [number, number] {
  return [(lon - LON0) * KX, (lat - LAT0) * KY];
}

/** Extensión del esquema [km]. */
export const EXTENT = { x0: -12, x1: 10, y0: -16.5, y1: 12 };

// ---------------------------------------------------------------- río Medellín (lon, lat, cota aprox. del cauce [m])
const RIVER_LL: [number, number, number][] = [
  [-75.64, 6.075, 1780], // Caldas (sur)
  [-75.633, 6.1, 1730],
  [-75.63, 6.125, 1640],
  [-75.627, 6.145, 1590],
  [-75.621, 6.157, 1565], // Sabaneta / La Estrella
  [-75.609, 6.165, 1550], // Itagüí
  [-75.598, 6.176, 1540], // Envigado
  [-75.589, 6.187, 1525], // Ayurá
  [-75.583, 6.196, 1515], // Aguacatala
  [-75.58, 6.212, 1500], // Poblado
  [-75.5775, 6.229, 1485], // Industriales
  [-75.5755, 6.24, 1478], // Exposiciones
  [-75.5765, 6.252, 1472], // Cisneros / San Juan
  [-75.5745, 6.265, 1465], // Universidad
  [-75.5715, 6.278, 1458], // Caribe
  [-75.566, 6.29, 1452], // Tricentenario
  [-75.5605, 6.302, 1447], // Acevedo
  [-75.5565, 6.318, 1440], // Madera
  [-75.5525, 6.332, 1433], // Bello
  [-75.543, 6.342, 1428], // Niquía
  [-75.525, 6.35, 1420],
];
export const RIVER: [number, number, number][] = RIVER_LL.map(([lo, la, z]) => [...toKm(lo, la), z]);

function interpY(table: [number, number, number][], y: number): [number, number] {
  if (y <= table[0][1]) return [table[0][0], table[0][2]];
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1], b = table[i];
    if (y <= b[1]) {
      const t = (y - a[1]) / (b[1] - a[1]);
      return [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  const l = table[table.length - 1];
  return [l[0], l[2]];
}
/** Posición x del río y cota de su cauce en la latitud y [km]. */
export function riverAt(y: number): { x: number; z: number } {
  const [x, z] = interpY(RIVER, y);
  return { x, z };
}

// ---------------------------------------------------------------- forma transversal del valle (tablas por y [km])
function lerpTable(ys: number[], vs: number[], y: number): number {
  if (y <= ys[0]) return vs[0];
  for (let i = 1; i < ys.length; i++) if (y <= ys[i]) return vs[i - 1] + ((vs[i] - vs[i - 1]) * (y - ys[i - 1])) / (ys[i] - ys[i - 1]);
  return vs[vs.length - 1];
}
const TY = [-17, -12, -8, -5, -2.5, 0.5, 3, 6, 9, 12];
/** Medio ancho del fondo plano al occidente / oriente del río [km] (Laureles y Guayabal, anchos; el norte, estrecho). */
const FLAT_W = [0.3, 0.6, 1.5, 1.7, 2.4, 4.0, 2.3, 0.7, 0.9, 0.6];
const FLAT_E = [0.3, 0.45, 0.9, 0.55, 0.6, 0.95, 0.7, 0.5, 0.7, 0.5];
/** Distancia del río a la cuchilla [km] y cota de la cuchilla [m]. */
const CREST_DW = [4.5, 5.5, 7.0, 8.0, 8.8, 9.6, 10.0, 9.0, 8.0, 7.0];
const CREST_HW = [2600, 2700, 2750, 2800, 2850, 2920, 2980, 2900, 2800, 2750];
const CREST_DE = [4.0, 5.0, 6.0, 6.3, 6.6, 7.0, 7.0, 6.6, 6.2, 6.0];
const CREST_HE = [2550, 2600, 2550, 2550, 2550, 2550, 2600, 2650, 2700, 2700];

// ---------------------------------------------------------------- cerros (lon, lat, altura sobre el entorno [m], radio [km])
export interface Hill {
  id: string;
  name: string;
  x: number;
  y: number;
  rise: number;
  r: number;
  /** Cota aproximada de la cima [m] (referencia para la prueba de consistencia). */
  peak: number;
}
const HILLS_LL: [string, string, number, number, number, number, number][] = [
  ['nutibara', 'Cerro Nutibara', -75.5797, 6.2365, 95, 0.5, 1580],
  ['volador', 'Cerro El Volador', -75.5825, 6.2675, 160, 0.72, 1630],
  ['asomadera', 'Cerro La Asomadera', -75.5555, 6.229, 50, 0.42, 1640],
  ['pan-de-azucar', 'Cerro Pan de Azúcar', -75.5317, 6.239, 120, 0.8, 2000],
  ['tres-cruces', 'Cerro de las Tres Cruces', -75.6075, 6.229, 210, 0.6, 1840],
  ['padre-amaya', 'Cerro El Padre Amaya', -75.67, 6.28, 120, 1.6, 3100],
];
export const HILLS: Hill[] = HILLS_LL.map(([id, name, lo, la, rise, r, peak]) => {
  const [x, y] = toKm(lo, la);
  return { id, name, x, y, rise, r, peak };
});

// ---------------------------------------------------------------- quebradas (lado, y de la desembocadura [km], y de la cabecera [km], nombre)
export interface Creek {
  name: string | null;
  pts: [number, number][];
}
const CREEKS_DEF: [number, number, number, string | null][] = [
  // occidente
  [-1, 9.6, 10.5, 'La García'],
  [-1, 7.4, 8.4, null],
  [-1, 5.9, 6.6, null],
  [-1, 4.4, 5.2, 'La Quintana'],
  [-1, 2.0, 3.6, 'La Iguaná'],
  [-1, 0.9, 1.6, 'Ana Díaz'],
  [-1, -0.2, 0.2, 'La Hueso'],
  [-1, -1.4, -1.6, 'La Picacha'],
  [-1, -2.6, -3.4, 'Altavista'],
  [-1, -5.0, -6.0, null],
  [-1, -8.2, -9.0, 'Doña María'],
  [-1, -11.4, -12.0, 'La Grande'],
  [-1, -13.8, -14.6, null],
  // oriente
  [1, 10.0, 10.8, null],
  [1, 7.6, 7.2, 'La Rosa'],
  [1, 5.8, 5.4, 'La Herrera'],
  [1, 4.3, 4.0, 'La Honda'],
  [1, 2.6, 2.1, null],
  [1, 0.5, -0.2, 'Santa Elena'],
  [1, -1.6, -2.2, 'La Poblada'],
  [1, -3.4, -3.6, 'La Presidenta'],
  [1, -5.4, -6.0, 'La Zúñiga'],
  [1, -7.3, -8.2, 'Ayurá'],
  [1, -9.4, -10.0, 'La Doctora'],
  [1, -12.6, -13.4, null],
];

// ---------------------------------------------------------------- relieve
function hash2(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Datos transversales en (x, y) [km]: lado, distancia al río, fracción de ladera t (0 = pie, 1 = cuchilla). */
export interface Cross {
  side: number;
  d: number;
  flat: number;
  t: number;
  crestD: number;
  crestH: number;
  floorZ: number;
  riverX: number;
}
export function cross(x: number, y: number): Cross {
  const r = riverAt(y);
  const dx = x - r.x;
  const side = dx >= 0 ? 1 : -1;
  const d = Math.abs(dx);
  const flat = lerpTable(TY, side > 0 ? FLAT_E : FLAT_W, y);
  const crestD = lerpTable(TY, side > 0 ? CREST_DE : CREST_DW, y);
  const crestH = lerpTable(TY, side > 0 ? CREST_HE : CREST_HW, y);
  const t = Math.max(0, (d - flat) / Math.max(0.5, crestD - flat));
  return { side, d, flat, t, crestD, crestH, floorZ: r.z, riverX: r.x };
}

let creekCache: Creek[] | null = null;
/** Quebradas: bajan de la cuchilla al río con un trazado suave (aproximado). */
export function creeks(): Creek[] {
  if (creekCache) return creekCache;
  creekCache = CREEKS_DEF.map(([side, yMouth, yHead, name], ci) => {
    const pts: [number, number][] = [];
    const N = 40;
    for (let k = 0; k <= N; k++) {
      const s = k / N; // 0 = cabecera, 1 = desembocadura
      const y = yHead + (yMouth - yHead) * s;
      const c = cross(riverAt(y).x + side * 1, y);
      const dd = c.flat + (c.crestD * 0.88 - c.flat) * (1 - s) ** 1.05;
      const wig = 0.18 * Math.sin(s * 7 + ci * 1.7) * (1 - s);
      pts.push([riverAt(y).x + side * (s > 0.999 ? 0 : dd + wig), y]);
    }
    return { name, pts };
  });
  return creekCache;
}

/** Distancia del punto (x, y) a la quebrada más cercana [km] y su posición relativa (0 cabecera, 1 boca). */
function nearestCreek(x: number, y: number): { dist: number; s: number } {
  let best = Infinity, bs = 0;
  for (const c of creeks()) {
    const p = c.pts;
    // descarte rápido por caja
    const y0 = Math.min(p[0][1], p[p.length - 1][1]) - 1.2, y1 = Math.max(p[0][1], p[p.length - 1][1]) + 1.2;
    if (y < y0 || y > y1) continue;
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1][0], ay = p[i - 1][1], bx = p[i][0], by = p[i][1];
      const vx = bx - ax, vy = by - ay;
      const L2 = vx * vx + vy * vy || 1e-9;
      const h = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
      const dd = Math.hypot(x - ax - vx * h, y - ay - vy * h);
      if (dd < best) {
        best = dd;
        bs = (i - 1 + h) / (p.length - 1);
      }
    }
  }
  return { dist: best, s: bs };
}

/**
 * Manchas de bosque [0–1] en la montaña: más en las partes altas y empinadas, en el altiplano de
 * Santa Elena (Arví) y en la cuchilla occidental; potreros en medio.
 */
export function forestAt(x: number, y: number): number {
  const c = cross(x, y);
  const n = 0.65 * vnoise(x * 0.9 + 3.1, y * 0.9) + 0.35 * vnoise(x * 2.7, y * 2.7 + 5.3);
  const high = Math.min(1, c.t);
  const arvi = c.side > 0 && c.t > 0.7 ? 0.25 : 0;
  return smooth(0.55, 0.75, n + 0.25 * high + arvi - 0.12);
}

/** Cota aproximada [m] del terreno en (x, y) [km]. */
export function valleyZ(x: number, y: number): number {
  const c = cross(x, y);
  // fondo: sube suavemente desde el río hasta el pie de las laderas (≈ 75 m hasta La América y San Javier)
  let z = c.floorZ + Math.min(80, 20 * c.flat) * Math.min(1, c.d / Math.max(0.2, c.flat)) ** 1.6;
  if (c.t > 0) {
    const t = Math.min(1, c.t);
    // Perfil típico de las laderas del valle: piedemonte que sube hasta un banco a media ladera (donde
    // están los barrios altos y los corregimientos) y luego un escarpe hasta la cuchilla. En el
    // nororiente el banco es más alto y más cercano al río (laderas empinadas desde abajo).
    const ne = c.side > 0 ? smooth(1.0, 2.6, y) : smooth(1.5, 3.5, y) * 0.5;
    const B = 0.4 + 0.32 * ne, Wb = 0.6 - 0.15 * ne;
    const P = B * smooth(0, Wb, t) + (1 - B) * smooth(Wb - 0.05, 1, t) ** 1.2;
    z += (c.crestH - z) * P;
    if (c.t > 1) z += (c.t - 1) * 120 * Math.exp(-(c.t - 1)); // más allá de la cuchilla
    // filos y cañadas: textura de ladera
    z += t * (55 * (vnoise(x * 1.6, y * 1.6) - 0.5) + 25 * (vnoise(x * 4.1 + 7, y * 4.1) - 0.5));
    // quebradas: cañones más hondos a media ladera
    const q = nearestCreek(x, y);
    const w = 0.12 + 0.22 * t;
    const depth = 140 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 15;
    z -= depth * Math.exp(-((q.dist / w) ** 2));
  }
  for (const h of HILLS) {
    const qd = Math.hypot(x - h.x, y - h.y) / h.r;
    if (qd < 1) z += h.rise * (0.5 + 0.5 * Math.cos(Math.PI * qd));
  }
  // al sur del esquema el valle se cierra en el Alto de San Miguel (nacimiento del río)
  if (y < EXTENT.y0) z += Math.min(900, (EXTENT.y0 - y) * 140) * smooth(0, 1, (EXTENT.y0 - y) / 6);
  return z;
}

/** Cota [m] con las montañas que rodean el valle: más allá de la cuchilla, sierras de 2 300 a 2 900 m
 *  (oriente antioqueño y occidente). Dentro del valle coincide con valleyZ. */
export function outerZ(x: number, y: number): number {
  let z = valleyZ(x, y);
  const c = cross(x, y);
  if (c.t > 1) z = Math.max(z, c.crestH - 250 + 380 * (Math.sin(x * 0.31 + y * 0.17) * 0.5 + Math.sin(y * 0.23 - x * 0.11) * 0.5));
  return z;
}

// ---------------------------------------------------------------- tejido urbano
/** Tipos de tejido urbano. */
export const Fabric = {
  /** Sin ciudad (montaña, cauce). */
  None: 0,
  /** Barrios populares de ladera: ladrillo, muy denso (comunas 1 a 9, 13, laderas de Bello). */
  Ladera: 1,
  /** Barrios planos de casas y edificios bajos con muchos árboles (Laureles, Belén, Castilla). */
  Plano: 2,
  /** Centro: edificios altos y medianos. */
  Centro: 3,
  /** El Poblado: torres residenciales (muchas de ladrillo a la vista) entre árboles. */
  Poblado: 4,
  /** Zonas industriales y de bodegas (Guayabal, Itagüí). */
  Industria: 5,
  /** Cabeceras de los otros municipios del valle. */
  Municipio: 6,
} as const;
export type Fabric = (typeof Fabric)[keyof typeof Fabric];

interface Zone {
  f: Fabric;
  x: number;
  y: number;
  rx: number;
  ry: number;
}
const Z = (f: Fabric, lon: number, lat: number, rx: number, ry: number): Zone => {
  const [x, y] = toKm(lon, lat);
  return { f, x, y, rx, ry };
};
const ZONES: Zone[] = [
  Z(Fabric.Centro, -75.5675, 6.2485, 0.95, 0.85),
  Z(Fabric.Poblado, -75.565, 6.205, 1.6, 2.4),
  Z(Fabric.Plano, -75.594, 6.247, 1.5, 1.2), // Laureles–Estadio
  Z(Fabric.Plano, -75.6, 6.226, 1.1, 0.9), // Belén
  Z(Fabric.Plano, -75.578, 6.287, 0.9, 0.8), // Castilla
  Z(Fabric.Industria, -75.5875, 6.2, 0.8, 1.0), // Guayabal
  Z(Fabric.Industria, -75.607, 6.177, 0.9, 0.8), // Itagüí industrial
  Z(Fabric.Municipio, -75.5839, 6.1717, 1.3, 1.1), // Envigado
  Z(Fabric.Municipio, -75.6119, 6.1719, 1.0, 0.9), // Itagüí
  Z(Fabric.Municipio, -75.6166, 6.1515, 0.9, 0.8), // Sabaneta
  Z(Fabric.Municipio, -75.643, 6.1576, 0.8, 0.8), // La Estrella
  Z(Fabric.Municipio, -75.6357, 6.0911, 0.8, 1.0), // Caldas
  Z(Fabric.Municipio, -75.556, 6.335, 1.6, 1.3), // Bello
];

/** Cota máxima urbana [m] según la zona (más alta en el nororiente). */
function urbanTop(y: number, side: number): number {
  if (side > 0) {
    if (y > 1.6 && y < 7.5) return 2010; // nororiente (comunas 1 a 4)
    if (y > -2 && y <= 1.6) return 1960; // centro oriental (comunas 8 y 9)
    if (y > -6 && y <= -2) return 1880; // El Poblado
    return 1760;
  }
  if (y > 2 && y < 8) return 1900; // noroccidente (comunas 5 a 7)
  if (y > -1 && y <= 2) return 1860; // San Javier (comuna 13)
  if (y > -4 && y <= -1) return 1840; // Belén alto
  return 1720;
}

/** Tejido urbano en (x, y) [km] con su cota z: tipo y fuerza [0–1] (borde irregular). */
export function fabricAt(x: number, y: number, z: number): { f: Fabric; k: number } {
  if (y < EXTENT.y0 + 0.5 || y > EXTENT.y1 - 0.3) return { f: Fabric.None, k: 0 };
  const c = cross(x, y);
  if (c.d < 0.09) return { f: Fabric.None, k: 0 }; // cauce y retiro del río
  // cerros tutelares: conservan su bosque
  for (const h of HILLS) if (h.id !== 'padre-amaya' && Math.hypot(x - h.x, y - h.y) < h.r * 0.6) return { f: Fabric.None, k: 0 };
  // borde irregular: los barrios suben más por los filos y menos por las cañadas
  const top = urbanTop(y, c.side) + 150 * (vnoise(x * 0.9 + 11, y * 0.9) - 0.5) + 70 * (vnoise(x * 2.3, y * 2.3) - 0.5);
  const k = 1 - smooth(top - 90, top + 10, z);
  if (k <= 0.02) return { f: Fabric.None, k: 0 };
  // al sur de Caldas y al norte de Bello el valle es más rural
  const south = smooth(-15.5, -13.5, y);
  const kk = k * (y < -13.5 ? south * 0.6 : 1);
  const wob = 0.45 * (vnoise(x * 1.7 + 4, y * 1.7) - 0.5);
  for (const zn of ZONES) {
    const q = ((x - zn.x) / zn.rx) ** 2 + ((y - zn.y) / zn.ry) ** 2;
    if (q < 1 + wob) {
      if (zn.f === Fabric.Poblado && c.side < 0) continue; // El Poblado está al oriente del río
      if (zn.f === Fabric.Plano && c.t > 0.18) return { f: Fabric.Ladera, k: kk };
      return { f: zn.f, k: kk };
    }
  }
  return { f: c.t > 0.04 ? Fabric.Ladera : Fabric.Plano, k: kk };
}

// ---------------------------------------------------------------- transporte (trazados aproximados)
const LL = (pts: [number, number][]) => pts.map(([lo, la]) => toKm(lo, la));
export interface Line {
  id: string;
  name: string;
  pts: [number, number][];
  stations: [number, number][];
}
const METRO_A_ST: [number, number][] = [
  [-75.6261, 6.1525], [-75.6175, 6.1575], [-75.6083, 6.1631], [-75.596, 6.1749], [-75.5859, 6.1862], [-75.58, 6.1935],
  [-75.5779, 6.2125], [-75.5744, 6.2297], [-75.5721, 6.2391], [-75.5713, 6.2425], [-75.5697, 6.2472], [-75.5685, 6.2504],
  [-75.5664, 6.2573], [-75.5636, 6.2635], [-75.5656, 6.269], [-75.5694, 6.2774], [-75.5649, 6.2905], [-75.5584, 6.3003],
  [-75.555, 6.3149], [-75.5538, 6.3299], [-75.5446, 6.3379],
];
const METRO_B_ST: [number, number][] = [
  [-75.5697, 6.2472], [-75.5755, 6.2475], [-75.5822, 6.2537], [-75.588, 6.2543], [-75.5977, 6.2585], [-75.603, 6.2582], [-75.613, 6.2565],
];
export const METRO_A: Line = { id: 'metro-a', name: 'Metro línea A', pts: LL(METRO_A_ST), stations: LL(METRO_A_ST) };
export const METRO_B: Line = { id: 'metro-b', name: 'Metro línea B', pts: LL(METRO_B_ST), stations: LL(METRO_B_ST) };
export const TRANVIA: Line = {
  id: 'tranvia',
  name: 'Tranvía de Ayacucho',
  pts: LL([[-75.5697, 6.2472], [-75.56, 6.2462], [-75.5532, 6.241], [-75.548, 6.2385], [-75.5435, 6.2363]]),
  stations: LL([[-75.5697, 6.2472], [-75.5532, 6.241], [-75.5435, 6.2363]]),
};
/** Metrocables (trazado aproximado entre estaciones). */
export const CABLES: Line[] = [
  { id: 'K', name: 'Metrocable K', pts: LL([[-75.5584, 6.3003], [-75.5524, 6.2993], [-75.5482, 6.2973], [-75.5418, 6.2933]]), stations: [] },
  { id: 'L', name: 'Metrocable L (Arví)', pts: LL([[-75.5418, 6.2933], [-75.5025, 6.28]]), stations: [] },
  { id: 'J', name: 'Metrocable J', pts: LL([[-75.613, 6.2565], [-75.6205, 6.2595], [-75.6275, 6.2635], [-75.634, 6.2724]]), stations: [] },
  { id: 'H', name: 'Metrocable H', pts: LL([[-75.5435, 6.2363], [-75.5385, 6.2345], [-75.5326, 6.2335]]), stations: [] },
  { id: 'M', name: 'Metrocable M', pts: LL([[-75.5532, 6.241], [-75.547, 6.244], [-75.541, 6.2433]]), stations: [] },
  { id: 'P', name: 'Metrocable P', pts: LL([[-75.5584, 6.3003], [-75.567, 6.2985], [-75.576, 6.295], [-75.585, 6.296]]), stations: [] },
].map((c) => ({ ...c, stations: c.pts }));

/** Vías principales (trazado aproximado). */
export const ROADS: { name: string; pts: [number, number][]; w: number }[] = [
  { name: 'Avenida Las Palmas', pts: LL([[-75.5655, 6.2335], [-75.556, 6.2265], [-75.545, 6.2215], [-75.532, 6.2135], [-75.518, 6.2055]]), w: 0.022 },
  { name: 'Avenida 80', pts: LL([[-75.6035, 6.2135], [-75.6005, 6.235], [-75.5985, 6.26], [-75.5965, 6.285]]), w: 0.02 },
  { name: 'Avenida El Poblado', pts: LL([[-75.5905, 6.1685], [-75.5785, 6.1935], [-75.5705, 6.2135], [-75.5675, 6.2335]]), w: 0.02 },
  { name: 'Calle San Juan', pts: LL([[-75.5735, 6.251], [-75.587, 6.2515], [-75.6015, 6.252], [-75.612, 6.2525]]), w: 0.018 },
  { name: 'Avenida Oriental', pts: LL([[-75.5655, 6.2365], [-75.5625, 6.247], [-75.5615, 6.258]]), w: 0.018 },
];

// ---------------------------------------------------------------- lugares
const P = (lon: number, lat: number) => toKm(lon, lat);
export const PLACES = {
  centro: P(-75.5675, 6.2485),
  poblado: P(-75.5655, 6.2085),
  laureles: P(-75.5945, 6.2455),
  belen: P(-75.6025, 6.2255),
  comuna13: P(-75.6235, 6.2575),
  nororiente: P(-75.5465, 6.2855),
  robledo: P(-75.5945, 6.2815),
  bello: P(-75.556, 6.337),
  envigado: P(-75.5839, 6.1717),
  itagui: P(-75.6119, 6.1719),
  sabaneta: P(-75.6166, 6.1515),
  laEstrella: P(-75.643, 6.1576),
  caldas: P(-75.6357, 6.0911),
  copacabana: P(-75.5095, 6.3485),
  santaElena: P(-75.5005, 6.2105),
  arvi: P(-75.5025, 6.28),
  aeropuerto: P(-75.5905, 6.2205),
  runwayS: P(-75.5925, 6.2085),
  runwayN: P(-75.5893, 6.2318),
  estadio: P(-75.5903, 6.2566),
  coltejer: P(-75.5664, 6.2495),
  bibliotecaEspana: P(-75.542, 6.2925),
};

/** Posiciones ilustrativas de los sectores de laboratorio (no son lugares reales; están rotulados así). */
export const SECTOR_SPOTS: Record<string, [number, number]> = {
  'calle-de-prueba': P(-75.5795, 6.2885), // pie de la ladera noroccidental, cerca del río
  'ladera-quebrada': P(-75.5885, 6.299), // más arriba en la misma ladera
};

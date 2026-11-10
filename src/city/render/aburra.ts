// Geografía del Valle de Aburrá para la vista de orientación (sin Three.js: se prueba en Node).
//
// Datos oficiales (Alcaldía de Medellín y Área Metropolitana del Valle de Aburrá), procesados por
// tools/geo/valle.py y guardados en aburraData.ts (módulo generado):
//  · relieve: modelo de elevación del AMVA (10 m) filtrado y muestreado cada 100 m; horizonte cada 800 m.
//    Fuera del área del AMVA no hay datos: allí el relieve es un relleno suave, ilustrativo (RELLENO);
//  · río y quebradas: D8 sobre el modelo de 25 m con los drenajes oficiales de Medellín quemados; nombres
//    de la red hídrica oficial;
//  · ciudad: densidad de calles de la red vial metropolitana y barrios de Medellín (tipo de tejido ilustrativo);
//  · metro, tranvía, metrocables y Metroplús: trazados y estaciones oficiales de las líneas existentes;
//  · cerros: toponimia oficial; aeropuerto, unidad deportiva, Coltejer y Biblioteca España: capas oficiales.
// No se usa para calcular: el cálculo ocurre solo en los sectores. Ver docs/medellin/DATOS_REALES.md §7.

import { unzlibSync } from 'three/examples/jsm/libs/fflate.module.js';
import {
  BLOQUE,
  CERROS,
  ESTACIONES,
  HORIZONTE,
  LIMITES,
  LINEAS,
  LUGARES,
  QUEBRADAS,
  QUEBRADAS_ROTULOS,
  REFERENTES,
  RELIEVE,
  RIO,
  SECCIONES,
  TRANSVERSAL,
  VALLE_INFORME,
  VALLE_META,
  VIAS,
} from './aburraData';

export { VALLE_INFORME, VALLE_META };

/** Origen del esquema (≈ La Alpujarra). Es el mismo que usa el controlador para los sectores con datos reales. */
export const LON0 = -75.5736;
export const LAT0 = 6.2442;
const KX = 111.32 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110.57;

/** lon/lat → km (x este, y norte) desde el origen. */
export function toKm(lon: number, lat: number): [number, number] {
  return [(lon - LON0) * KX, (lat - LAT0) * KY];
}

/** Extensión del relieve detallado [km]. */
export const EXTENT = { x0: RELIEVE.x0, x1: RELIEVE.x1, y0: RELIEVE.y0, y1: RELIEVE.y1 };

// ---------------------------------------------------------------- decodificación (perezosa, una sola vez)
function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
let rawBlock: Uint8Array | null = null;
function section(name: keyof typeof SECCIONES): Uint8Array {
  if (!rawBlock) rawBlock = unzlibSync(b64(BLOQUE));
  const [o, l] = SECCIONES[name];
  return rawBlock.subarray(o, o + l);
}
/** Lector de enteros LEB128 (con zigzag opcional). */
class Reader {
  k = 0;
  constructor(private b: Uint8Array) {}
  get done(): boolean {
    return this.k >= this.b.length;
  }
  u(): number {
    let v = 0, mul = 1, c: number;
    do {
      c = this.b[this.k++];
      v += (c & 0x7f) * mul;
      mul *= 128;
    } while (c & 0x80);
    return v;
  }
  z(): number {
    const u = this.u();
    return u % 2 === 0 ? u / 2 : -(u + 1) / 2;
  }
}
function decodeGrid(b: Uint8Array, nx: number, ny: number): Float32Array {
  const r = new Reader(b);
  const q = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const o = j * nx + i;
      const p = i === 0 && j === 0 ? 0 : j === 0 ? q[o - 1] : i === 0 ? q[o - nx] : q[o - 1] + q[o - nx] - q[o - nx - 1];
      q[o] = p + r.z();
    }
  return q;
}
function decodeRle(b: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  const r = new Reader(b);
  let k = 0;
  while (!r.done && k < n) {
    const v = b[r.k++];
    const run = r.u();
    out.fill(v, k, Math.min(n, k + run));
    k += run;
  }
  return out;
}
function decodeLines(b: Uint8Array, counts: number[]): [number, number][][] {
  const r = new Reader(b);
  return counts.map((c) => {
    let x = 0, y = 0;
    const pts: [number, number][] = [];
    for (let i = 0; i < c; i++) {
      x += r.z();
      y += r.z();
      pts.push([x / 1000, y / 1000]);
    }
    return pts;
  });
}

interface Decoded {
  z: Float32Array;
  zo: Float32Array;
  filled: Uint8Array;
  fabric: Uint8Array;
}
let dec: Decoded | null = null;
function data(): Decoded {
  if (dec) return dec;
  const n = RELIEVE.nx * RELIEVE.ny;
  dec = {
    z: decodeGrid(section('relieve'), RELIEVE.nx, RELIEVE.ny),
    zo: decodeGrid(section('horizonte'), HORIZONTE.nx, HORIZONTE.ny),
    filled: decodeRle(section('relleno'), n),
    fabric: decodeRle(section('tejido'), n),
  };
  return dec;
}

// ---------------------------------------------------------------- relieve
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Interpolación bicúbica (Catmull-Rom) en una malla regular; pasa por los nodos. */
function bicubic(g: Float32Array, nx: number, ny: number, fx: number, fy: number): number {
  fx = Math.min(nx - 1, Math.max(0, fx));
  fy = Math.min(ny - 1, Math.max(0, fy));
  const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(ny - 2, Math.floor(fy));
  const u = fx - i, v = fy - j;
  const row = (jj: number) => {
    const o = Math.min(ny - 1, Math.max(0, jj)) * nx;
    const p0 = g[o + Math.max(0, i - 1)], p1 = g[o + i], p2 = g[o + i + 1], p3 = g[o + Math.min(nx - 1, i + 2)];
    return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
  };
  const q0 = row(j - 1), q1 = row(j), q2 = row(j + 1), q3 = row(j + 2);
  return q1 + 0.5 * v * (q2 - q0 + v * (2 * q0 - 5 * q1 + 4 * q2 - q3 + v * (3 * (q1 - q2) + q3 - q0)));
}
const BLEND_KM = 1.5;
/** Cota [m] del terreno en (x, y) [km]: relieve detallado del AMVA (100 m); fuera de él, el horizonte (800 m),
 *  con una transición de 1,5 km en el borde para que no haya escalones. Definida en todo el plano. */
export function valleyZ(x: number, y: number): number {
  const d = data();
  const R = RELIEVE, H = HORIZONTE;
  const e = Math.min(x - R.x0, R.x1 - x, y - R.y0, R.y1 - y);
  if (e >= BLEND_KM) return bicubic(d.z, R.nx, R.ny, (x - R.x0) / R.st, (y - R.y0) / R.st);
  const zo = bicubic(d.zo, H.nx, H.ny, (x - H.x0) / H.st, (y - H.y0) / H.st);
  if (e <= 0) return zo;
  const zi = bicubic(d.z, R.nx, R.ny, (x - R.x0) / R.st, (y - R.y0) / R.st);
  return zo + (zi - zo) * smooth(0, BLEND_KM, e);
}
/** Igual que valleyZ (se conserva el nombre: el horizonte ya viene de los datos del AMVA y su relleno). */
export function outerZ(x: number, y: number): number {
  return valleyZ(x, y);
}
/** true donde el relieve detallado es relleno ilustrativo (fuera del área con datos del AMVA). */
export function isFilled(x: number, y: number): boolean {
  const R = RELIEVE;
  if (x < R.x0 || x > R.x1 || y < R.y0 || y > R.y1) return true;
  const i = Math.round((x - R.x0) / R.st), j = Math.round((y - R.y0) / R.st);
  return data().filled[j * R.nx + i] === 1;
}

// ---------------------------------------------------------------- río Medellín
/** Eje del río (D8 sobre el MDE del AMVA, dentro del cauce oficial en Medellín): [x, y, cota del cauce]. */
export const RIVER: [number, number, number][] = RIO as [number, number, number][];
/** Tabla x(y) con y creciente (el río corre de sur a norte). */
const RIVER_Y: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  let ym = -Infinity;
  for (const [x, y, z] of RIVER) {
    if (y > ym + 1e-6) {
      out.push([x, y, z]);
      ym = y;
    }
  }
  return out;
})();
/** Posición x del río y cota de su cauce en la latitud y [km]. */
export function riverAt(y: number): { x: number; z: number } {
  const t = RIVER_Y;
  if (y <= t[0][1]) return { x: t[0][0], z: t[0][2] };
  if (y >= t[t.length - 1][1]) return { x: t[t.length - 1][0], z: t[t.length - 1][2] };
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (t[m][1] <= y) lo = m;
    else hi = m;
  }
  const a = t[lo], b = t[hi], f = (y - a[1]) / (b[1] - a[1]);
  return { x: a[0] + (b[0] - a[0]) * f, z: a[2] + (b[2] - a[2]) * f };
}
/** Polilínea del río [km] (para dibujarlo: en el norte corre hacia el nororiente). */
export const RIVER_PATH: [number, number][] = RIVER.map(([x, y]) => [x, y]);
/** Distancia [km] de (x, y) al eje del río. */
const RIVER_BIN = 0.5;
const riverBins = new Map<number, number[]>();
for (let i = 1; i < RIVER_PATH.length; i++) {
  const ya = RIVER_PATH[i - 1][1], yb = RIVER_PATH[i][1];
  for (let b = Math.floor(Math.min(ya, yb) / RIVER_BIN); b <= Math.floor(Math.max(ya, yb) / RIVER_BIN); b++) {
    const arr = riverBins.get(b);
    if (arr) arr.push(i);
    else riverBins.set(b, [i]);
  }
}
export function riverDistance(x: number, y: number): number {
  const b0 = Math.floor(y / RIVER_BIN);
  let best = Infinity;
  for (let b = b0 - 2; b <= b0 + 2; b++) {
    const arr = riverBins.get(b);
    if (!arr) continue;
    for (const i of arr) {
      const [ax, ay] = RIVER_PATH[i - 1], [bx, by] = RIVER_PATH[i];
      const vx = bx - ax, vy = by - ay;
      const h = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1e-12)));
      best = Math.min(best, Math.hypot(x - ax - vx * h, y - ay - vy * h));
    }
  }
  return Number.isFinite(best) ? best : Math.abs(x - riverAt(y).x);
}

// ---------------------------------------------------------------- perfil transversal (tablas por y del MDE)
function lerpRow(arr: readonly number[], y: number): number {
  const f = (y - TRANSVERSAL.y0) / TRANSVERSAL.dy;
  const i = Math.min(arr.length - 2, Math.max(0, Math.floor(f)));
  const t = Math.min(1, Math.max(0, f - i));
  return arr[i] + (arr[i + 1] - arr[i]) * t;
}
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
  const side = x - r.x >= 0 ? 1 : -1;
  const d = riverDistance(x, y);
  const T = TRANSVERSAL;
  const flat = lerpRow(side > 0 ? T.fE : T.fW, y);
  const crestD = lerpRow(side > 0 ? T.dE : T.dW, y);
  const crestH = lerpRow(side > 0 ? T.hE : T.hW, y);
  const t = Math.max(0, (d - flat) / Math.max(0.5, crestD - flat));
  return { side, d, flat, t, crestD, crestH, floorZ: r.z, riverX: r.x };
}

// ---------------------------------------------------------------- cerros (toponimia oficial; cima del MDE)
export interface Hill {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Radio aproximado [km] (el del polígono de cerro tutelar si lo es). */
  r: number;
  /** Cota de la cima según el MDE del AMVA [m] (máximo a menos de 400 m del punto oficial). */
  peak: number;
  /** Cerro tutelar de Medellín (parque: sin barrios encima). */
  tutelar: boolean;
}
export const HILLS: Hill[] = CERROS.map((c) => ({ id: c.id, name: c.name, x: c.x, y: c.y, r: c.r, peak: c.peak, tutelar: c.tutelar }));

// ---------------------------------------------------------------- quebradas (D8; nombres de la red hídrica oficial)
export interface Creek {
  name: string | null;
  /** De la cabecera (o confluencia) hacia aguas abajo [km]. */
  pts: [number, number][];
  /** Orden de Strahler (1 = cabecera). */
  order: number;
  /** Cuenca al final del tramo [km²]. */
  area: number;
}
let creekCache: Creek[] | null = null;
export function creeks(): Creek[] {
  if (creekCache) return creekCache;
  const lines = decodeLines(section('quebradas'), QUEBRADAS.map((q) => q.c));
  creekCache = QUEBRADAS.map((q, i) => ({ name: q.n, pts: lines[i], order: q.o, area: q.a }));
  return creekCache;
}
/** Quebradas con nombre: punto para su rótulo (de mayor a menor cuenca). */
export const CREEK_LABELS: { name: string; x: number; y: number; area: number }[] = QUEBRADAS_ROTULOS.map((q) => ({ name: q.name, x: q.x, y: q.y, area: q.a }));

// ---------------------------------------------------------------- vegetación
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
/**
 * Manchas de bosque [0–1] en la montaña (ilustrativas: no hay una capa de coberturas para todo el valle):
 * más en las partes altas y en el altiplano de Santa Elena (Arví); potreros en medio.
 */
export function forestAt(x: number, y: number): number {
  const c = cross(x, y);
  const n = 0.65 * vnoise(x * 0.9 + 3.1, y * 0.9) + 0.35 * vnoise(x * 2.7, y * 2.7 + 5.3);
  const high = Math.min(1, c.t);
  const arvi = c.side > 0 && c.t > 0.7 ? 0.25 : 0;
  return smooth(0.55, 0.75, n + 0.25 * high + arvi - 0.12);
}

// ---------------------------------------------------------------- tejido urbano
/** Tipos de tejido urbano (ilustrativos: dónde hay ciudad sale de los datos; el tipo, de la comuna y la pendiente). */
export const Fabric = {
  /** Sin ciudad (montaña, cauce, parques). */
  None: 0,
  /** Barrios de ladera: ladrillo, muy denso. */
  Ladera: 1,
  /** Barrios planos de casas y edificios bajos con árboles (Laureles, Belén, Castilla). */
  Plano: 2,
  /** Centro: edificios altos y medianos (La Candelaria). */
  Centro: 3,
  /** El Poblado: torres residenciales entre árboles. */
  Poblado: 4,
  /** Zonas de industria y bodegas (fondo plano de Guayabal). */
  Industria: 5,
  /** Cabeceras de los otros municipios del valle. */
  Municipio: 6,
} as const;
export type Fabric = (typeof Fabric)[keyof typeof Fabric];

/** Tejido urbano en (x, y) [km]: tipo y fuerza [0–1]. El tercer argumento (cota) se conserva por compatibilidad. */
export function fabricAt(x: number, y: number, _z?: number): { f: Fabric; k: number } {
  const R = RELIEVE;
  const fx = (x - R.x0) / R.st, fy = (y - R.y0) / R.st;
  if (fx < 0 || fy < 0 || fx > R.nx - 1 || fy > R.ny - 1) return { f: Fabric.None, k: 0 };
  const g = data().fabric;
  const i = Math.min(R.nx - 2, Math.floor(fx)), j = Math.min(R.ny - 2, Math.floor(fy));
  const u = fx - i, v = fy - j;
  const o = j * R.nx + i;
  const c = [g[o], g[o + 1], g[o + R.nx], g[o + R.nx + 1]];
  const w = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
  let k = 0;
  for (let q = 0; q < 4; q++) k += ((c[q] & 15) / 15) * w[q];
  // tipo: el de la celda más cercana con ciudad
  const near = Math.round(fy) * R.nx + Math.round(fx);
  let f = g[near] >> 4;
  if (!f) for (let q = 0; q < 4 && !f; q++) f = c[q] >> 4;
  if (!f || k < 0.02) return { f: Fabric.None, k: 0 };
  return { f: f as Fabric, k };
}

// ---------------------------------------------------------------- transporte (trazados y estaciones oficiales)
export type LineKind = 'metro' | 'tranvia' | 'cable' | 'metroplus';
export interface Line {
  id: string;
  /** Código oficial de la línea (A, B, K, L, T, 1…). */
  code: string;
  kind: LineKind;
  name: string;
  /** Tramo principal (el más largo) [km]. */
  pts: [number, number][];
  /** Todos los tramos (Metroplús tiene uno por sentido y ramales). */
  parts: [number, number][][];
  /** Estaciones [km], ordenadas a lo largo del tramo principal. */
  stations: [number, number][];
  stationNames: string[];
}
const lineParts = decodeLines(section('lineas'), LINEAS.map((l) => l.c));
function along(pts: [number, number][], p: [number, number]): { s: number; d: number; seg: number; q: [number, number] } {
  let best = { s: 0, d: Infinity, seg: 1, q: pts[0] };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const vx = bx - ax, vy = by - ay, L = Math.hypot(vx, vy) || 1e-12;
    const h = Math.max(0, Math.min(1, ((p[0] - ax) * vx + (p[1] - ay) * vy) / (L * L)));
    const qx = ax + vx * h, qy = ay + vy * h;
    const d = Math.hypot(p[0] - qx, p[1] - qy);
    if (d < best.d) best = { s: acc + h * L, d, seg: i, q: [qx, qy] };
    acc += L;
  }
  return best;
}
const KIND_NAME: Record<LineKind, string> = { metro: 'Metro', tranvia: 'Tranvía', cable: 'Metrocable', metroplus: 'Metroplús' };
function lineTitle(kind: LineKind, code: string, name: string): string {
  const route = name.replace(/\s*-\s*/g, '–').trim();
  if (kind === 'metro') return `Metro línea ${code} (${route})`;
  if (kind === 'tranvia') return `Tranvía de Ayacucho (línea T-A)`;
  if (kind === 'metroplus') return `Metroplús línea ${code}`;
  if (code === 'La Aldea') return 'Cable La Aldea (Palmitas)';
  return `Metrocable ${code} (${route})`;
}
/** Todas las líneas existentes (estado «Existente» en la capa oficial). */
export const LINES: Line[] = (() => {
  const byId = new Map<string, Line>();
  LINEAS.forEach((l, i) => {
    const kind = l.kind as LineKind;
    let ln = byId.get(l.id);
    if (!ln) {
      ln = { id: l.id, code: l.code, kind, name: lineTitle(kind, l.code, l.name), pts: [], parts: [], stations: [], stationNames: [] };
      byId.set(l.id, ln);
    }
    ln.parts.push(lineParts[i]);
  });
  for (const ln of byId.values()) {
    const len = (p: [number, number][]) => p.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
    ln.pts = ln.parts.reduce((a, b) => (len(b) > len(a) ? b : a), ln.parts[0]);
    const st = ESTACIONES.filter((s) => s.kind === ln.kind && s.line === ln.code).map((s) => ({ s, a: along(ln.pts, [s.x, s.y]) }));
    st.sort((p, q) => p.a.s - q.a.s);
    ln.stations = st.map((q) => [q.s.x, q.s.y] as [number, number]);
    ln.stationNames = st.map((q) => q.s.name);
    if (ln.kind === 'cable') {
      // en los cables las estaciones son vértices del trazado: se insertan donde se proyectan (las intermedias
      // de un tramo recto no vienen como vértices en la capa de líneas)
      const pts = [...ln.pts];
      for (const q of st) {
        if (q.a.d > 0.06) continue;
        const a = along(pts, q.a.q);
        const [ax, ay] = pts[a.seg - 1], [bx, by] = pts[a.seg];
        if (Math.hypot(a.q[0] - ax, a.q[1] - ay) < 0.03 || Math.hypot(a.q[0] - bx, a.q[1] - by) < 0.03) continue;
        pts.splice(a.seg, 0, a.q);
      }
      ln.pts = pts;
      ln.parts = [pts];
    }
  }
  return [...byId.values()];
})();
const byCode = (kind: LineKind, code: string): Line => LINES.find((l) => l.kind === kind && l.code === code)!;
export const METRO_A: Line = byCode('metro', 'A');
export const METRO_B: Line = byCode('metro', 'B');
export const TRANVIA: Line = byCode('tranvia', 'T');
/** Metrocables y el cable de Palmitas. */
export const CABLES: Line[] = LINES.filter((l) => l.kind === 'cable');
export const METROPLUS: Line[] = LINES.filter((l) => l.kind === 'metroplus');
export const LINE_KIND_NAME = KIND_NAME;
/** Todas las estaciones con nombre (para rótulos). */
export const STATIONS: { name: string; line: string; kind: LineKind; x: number; y: number }[] = ESTACIONES.map((s) => ({ ...s, kind: s.kind as LineKind }));

// ---------------------------------------------------------------- vías principales (red vial metropolitana)
let roadCache: { name: string; pts: [number, number][]; w: number; cls: number }[] | null = null;
/** Autopistas (jerarquía 1) y arterias principales (2) [km]; w = ancho de dibujo [km]. */
export function roads(): { name: string; pts: [number, number][]; w: number; cls: number }[] {
  if (roadCache) return roadCache;
  const ls = decodeLines(section('vias'), VIAS.map((v) => v[1]));
  roadCache = VIAS.map((v, i) => ({ name: v[0] === 1 ? 'Autopista' : 'Arteria principal', pts: ls[i], w: v[0] === 1 ? 0.024 : 0.014, cls: v[0] }));
  return roadCache;
}
/** Vías principales como lista. */
export const ROADS = roads();

/** Límites entre los municipios del área metropolitana [km]. */
let boundCache: [number, number][][] | null = null;
export function boundaries(): [number, number][][] {
  if (!boundCache) boundCache = decodeLines(section('limites'), LIMITES as number[]);
  return boundCache;
}

// ---------------------------------------------------------------- lugares (anclas de rótulos)
const LG = LUGARES as unknown as Record<string, [number, number] | string>;
const pt = (k: string, fallback: [number, number]): [number, number] => {
  const v = LG[k];
  return Array.isArray(v) ? [v[0], v[1]] : fallback;
};
const mean = (ps: [number, number][]): [number, number] => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
const arvi = STATIONS.find((s) => s.line === 'L' && /arv/i.test(s.name));
const REF = REFERENTES as Record<string, number[] | number>;
const refPt = (k: string): [number, number] => {
  const v = REF[k] as number[];
  return [v[0], v[1]];
};
/** Anclas de rótulos y referentes [km], derivadas de los datos (centro de la mancha urbana de cada comuna o
 *  municipio; estaciones; capas oficiales de referentes). */
export const PLACES = {
  medellin: pt('mun:Medellín', [0, 0]),
  centro: pt('com:10', [0.5, 0.4]),
  poblado: pt('com:14', [0.8, -4.7]),
  laureles: pt('com:11', [-2, 0.7]),
  belen: pt('com:16', [-2.9, -2]),
  comuna13: pt('com:13', [-4.9, 1.4]),
  nororiente: mean([pt('com:01', [3, 5]), pt('com:02', [2, 6]), pt('com:03', [3, 3]), pt('com:04', [1.4, 3.5])]),
  robledo: pt('com:07', [-2, 4]),
  guayabal: pt('com:15', [-1.4, -3.4]),
  bello: pt('mun:Bello', [1.5, 9.7]),
  envigado: pt('mun:Envigado', [-0.6, -8.6]),
  itagui: pt('mun:Itagüí', [-4.2, -7.5]),
  sabaneta: pt('mun:Sabaneta', [-4.6, -10.2]),
  laEstrella: pt('mun:La Estrella', [-7, -10.6]),
  caldas: pt('mun:Caldas', [-6.8, -16.9]),
  copacabana: pt('mun:Copacabana', [6.7, 11]),
  santaElena: pt('com:90', [3.2, -4]),
  sanCristobal: pt('com:60', [-5.6, 3.7]),
  sanAntonioDePrado: pt('com:80', [-8.1, -6.9]),
  arvi: arvi ? ([arvi.x, arvi.y] as [number, number]) : ([7.8, 4.2] as [number, number]),
  aeropuerto: refPt('aeropuerto'),
  runwayS: refPt('runwayS'),
  runwayN: refPt('runwayN'),
  estadio: refPt('unidadAtanasio'),
  coltejer: refPt('coltejer'),
  bibliotecaEspana: refPt('bibliotecaEspana'),
};
/** Ancho de la pista del aeropuerto [km] y radio de la unidad deportiva [km] (capas oficiales). */
export const RUNWAY_W = REF.runwayW as number;
export const ESTADIO_R = REF.unidadAtanasioR as number;
/** Nombres de las comunas y corregimientos de Medellín con su ancla. */
export const COMUNAS: { code: string; name: string; at: [number, number] }[] = Object.keys(LG)
  .filter((k) => k.startsWith('com:'))
  .map((k) => ({ code: k.slice(4), name: String(LG['comname:' + k.slice(4)] ?? ''), at: pt(k, [0, 0]) }));

/** Posiciones ilustrativas de los sectores de laboratorio (no son lugares reales; están rotulados así). */
const P = (lon: number, lat: number) => toKm(lon, lat);
export const SECTOR_SPOTS: Record<string, [number, number]> = {
  'calle-de-prueba': P(-75.5795, 6.2885), // pie de la ladera noroccidental, cerca del río
  'ladera-quebrada': P(-75.5885, 6.299), // más arriba en la misma ladera
};

// Convierte un escenario (polígonos + ráster) y las intervenciones en campos de malla para el cálculo.
// Es determinista: la misma entrada produce exactamente la misma malla (se verifica con un hash).

import { COVERS, COVER_LIST, G, NUMERICS, coverIndex, mmhToMs, type CoverId } from './constants';
import type { ExposedObject, InflowSpec, Interventions, Polygon, Pt, Scenario, Shared, TerrainRaster } from './scenario';
import { buildNodeTable, fullFlow, windowK, type CompiledSewer, type SInlet, type SNode, type SPipe } from './sewer';
import { barrelR, inletRating, qInlet, type CulvertGeom, type InletRating } from './culvert';
import type { BasinCover, BasinSpec } from './basin';

export interface CompiledBuilding {
  id: string;
  index: number;
  cells: number;
  roofArea: number;
  downCell: number;
  /** Índice del depósito activo que recibe el techo, o -1. */
  tank: number;
  baseZ: number;
  heightM: number;
  /** Suma de pesos de lluvia de sus celdas (para lluvia localizada). */
  rainWeight: number;
  /** Distancia horizontal del contorno al eje de la quebrada [m] (Infinity sin quebrada). */
  creekDistM: number;
}

/** Distancia de un punto a un segmento [m]. */
function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const L2 = vx * vx + vy * vy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)) : 0;
  return Math.hypot(ax + t * vx - px, ay + t * vy - py);
}

/** Distancia entre el contorno de un polígono y una polilínea [m] (0 si la polilínea entra en el polígono). */
export function polyToLine(poly: Polygon, line: Pt[]): number {
  let d = Infinity;
  for (const [x, y] of line) {
    if (pointInPolygon(x, y, poly)) return 0;
  }
  for (let a = 0; a < poly.length; a++) {
    const [x0, y0] = poly[a], [x1, y1] = poly[(a + 1) % poly.length];
    for (let q = 1; q < line.length; q++) {
      const [lx0, ly0] = line[q - 1], [lx1, ly1] = line[q];
      d = Math.min(d, distSeg(x0, y0, lx0, ly0, lx1, ly1), distSeg(lx0, ly0, x0, y0, x1, y1));
    }
  }
  return d;
}

export interface CompiledDrain {
  id: string;
  index: number;
  cell: number;
  /** Perímetro efectivo del vertedero [m] y área efectiva de orificio [m²], ya reducidos por obstrucción. */
  perimeter: number;
  openArea: number;
  /** Capacidad de la conexión [m³/s]. */
  capacity: number;
  obstruction: number;
  /** Pendiente transversal de la cuneta [m/m] (0 = usar la profundidad media de la celda). */
  gutterSlope: number;
}

export interface CompiledTank {
  id: string;
  index: number;
  capacity: number;
  release: number;
  destination: 'red' | 'retener';
  overflowCell: number;
  buildings: number[];
}

export interface OutletFace {
  id: string;
  cell: number;
  axis: 'x' | 'y';
  face: number;
  /** +1 si el flujo saliente es positivo en el eje, −1 si es negativo. */
  dir: 1 | -1;
  /** Pendiente usada en la condición de profundidad normal: la del terreno junto al borde [m/m]. */
  slope: number;
  /** Pendiente escrita en el escenario (se usa solo si el terreno no baja hacia el borde). */
  slopeSpec: number;
}

/** Tramo de terreno junto al borde con que se mide la pendiente de una salida [m], y pendiente mínima aceptada. */
export const OUTLET_REACH_M = 6;
export const OUTLET_MIN_SLOPE = 0.002;

export interface Compiled {
  scenarioId: string;
  /** Celdas de patios interiores cerrados tratadas como construcción (sectores reales). */
  pockets: number;
  /** Relleno final de depresiones en sectores reales: celdas elevadas más de 1 cm y volumen [m³]. */
  fillCells: number;
  fillVolume: number;
  /** Agua de las laderas vecinas: celdas del borde, área aportante [m²] y coeficiente de escorrentía. */
  runon: { id: string; cells: number[]; areaM2: number; c: number }[];
  dx: number;
  nx: number;
  ny: number;
  area: number;
  z: Float64Array;
  /** Cota sin bordillos ni intervenciones (para dibujar cortes y referencias). */
  zGround: Float64Array;
  solid: Uint8Array;
  building: Int16Array;
  cover: Uint8Array;
  zone: Int16Array;
  garden: Int16Array;
  n: Float64Array;
  fc: Float64Array;
  smax: Float64Array;
  rainWeight: Float64Array;
  buildings: CompiledBuilding[];
  drains: CompiledDrain[];
  tanks: CompiledTank[];
  outlets: OutletFace[];
  inflowCells: number[];
  probes: { id: string; name: string; cell: number }[];
  /** Red de alcantarillado separada (si el escenario la trae). */
  sewer: CompiledSewer | null;
  /** Por edificio: nodo de aguas residuales al que va su bajante por conexión errada (−1 si no). */
  erradaNode: Int32Array;
  /** Quebrada con creciente (si el escenario la trae). */
  creek: CompiledCreek | null;
  /** Vehículos expuestos (no participan en el flujo; el motor calcula si el agua los mueve). */
  exposed: ExposedObject[];
  /** Coberturas bajo vías. */
  culverts: CompiledCulvert[];
  hash: string;
}

/** Cobertura compilada: celdas de entrada y salida, geometría, tabla de control de entrada y estado. */
export interface CompiledCulvert {
  id: string;
  name: string;
  inCells: number[];
  outCells: number[];
  /** Bateas de entrada y salida [m] (la celda más baja de cada grupo). */
  zIn: number;
  zOut: number;
  geom: CulvertGeom;
  rating: InletRating;
  /** Cota más baja de la vía sobre el cauce (desde ahí el agua pasa por encima) [m]. */
  crestZ: number;
  /** Caudal que pasa libre (sin obstrucción) con el agua a la cota de la vía [m³/s]. */
  capacityFree: number;
  /** Caras al borde aguas abajo de la vía, para medir el agua que pasa por encima. */
  overFaces: number[];
  obstruction: number;
  /** Coeficiente de pérdidas del cañón lleno 1 + Ke + 2g·n²·L/R^(4/3) (para la inercia del agua en los cajones). */
  lossK: number;
  progressive: boolean;
  road: { x0: number; x1: number; y0: number; y1: number };
}

/** Sección de control de la quebrada (columna de celdas a lo largo de y en la abscisa x). */
export interface CompiledCreek {
  /** Celdas por donde entra la creciente. */
  cells: number[];
  baseM3s: number;
  /**
   * Orientación de la sección sobre la malla: con `flow` 'x' el agua cruza una columna (i es la columna y los
   * índices j, filas); con 'y' cruza una fila (i es la fila y los índices j, columnas). `sign` es el sentido del
   * flujo a lo largo de ese eje (+1 hacia +x o +y) y `cosT`, el coseno entre el eje del cauce y el de la malla.
   * Las celdas de la sección se obtienen con `creekCell`.
   */
  flow: 'x' | 'y';
  sign: 1 | -1;
  cosT: number;
  /** Índice a lo largo del flujo (i), índices transversales analizados [j0, j1] y del cauce entre orillas [jb0, jb1]. */
  i: number;
  j0: number;
  j1: number;
  jb0: number;
  jb1: number;
  /** Índice transversal del fondo (talweg), cota del fondo y cota de cauce lleno (la orilla más baja) [m]. */
  jt: number;
  zBed: number;
  bankLevel: number;
  /** Pendiente local del fondo y capacidad a cauce lleno con la regla del modelo [m³/s]. */
  slope: number;
  capacity: number;
  /** Capacidad con Manning en flujo uniforme, sin el límite de Froude del modelo [m³/s]. */
  capacityManning: number;
  name: string;
  /** Cuenca aguas arriba y su cobertura (creciente desde la lluvia). */
  basin?: BasinSpec;
  basinCover: BasinCover;
}

/** Celda de la sección de control en el índice transversal j. */
export function creekCell(cr: CompiledCreek, nx: number, j: number): number {
  return cr.flow === 'x' ? j * nx + cr.i : cr.i * nx + j;
}

/** Centro [x, y] de la celda de la sección de control en el índice transversal j [m]. */
export function creekPoint(cr: CompiledCreek, dx: number, j: number): [number, number] {
  const a = (cr.i + 0.5) * dx, b = (j + 0.5) * dx;
  return cr.flow === 'x' ? [a, b] : [b, a];
}

/** Dirección unitaria del eje del cauce en el tramo más cercano al punto (de aguas arriba a aguas abajo). */
export function axisDirAt(axis: Pt[], x: number, y: number): [number, number] {
  let best = Infinity, ux = 1, uy = 0;
  for (let q = 1; q < axis.length; q++) {
    const [x0, y0] = axis[q - 1], [x1, y1] = axis[q];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / (L * L)));
    const d = Math.hypot(x0 + t * (x1 - x0) - x, y0 + t * (y1 - y0) - y);
    if (d < best - 1e-9) {
      best = d;
      ux = (x1 - x0) / L;
      uy = (y1 - y0) / L;
    }
  }
  return [ux, uy];
}

export function pointInPolygon(x: number, y: number, poly: Polygon): boolean {
  let inside = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, ya] = poly[a];
    const [xb, yb] = poly[b];
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}

function bbox(poly: Polygon): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Recorre las celdas cuyo centro cae dentro del polígono. */
export function forCellsIn(poly: Polygon, nx: number, ny: number, dx: number, fn: (k: number, x: number, y: number) => void): void {
  const [x0, y0, x1, y1] = bbox(poly);
  const i0 = Math.max(0, Math.floor(x0 / dx));
  const i1 = Math.min(nx - 1, Math.ceil(x1 / dx));
  const j0 = Math.max(0, Math.floor(y0 / dx));
  const j1 = Math.min(ny - 1, Math.ceil(y1 / dx));
  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) * dx;
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * dx;
      if (pointInPolygon(x, y, poly)) fn(j * nx + i, x, y);
    }
  }
}

/** Interpolación bilineal del ráster de terreno en (x, y) [m]. */
export function sampleTerrain(t: TerrainRaster, x: number, y: number): number {
  const fx = Math.min(Math.max(x / t.dx - 0.5, 0), t.nx - 1);
  const fy = Math.min(Math.max(y / t.dx - 0.5, 0), t.ny - 1);
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const i1 = Math.min(i0 + 1, t.nx - 1), j1 = Math.min(j0 + 1, t.ny - 1);
  const ax = fx - i0, ay = fy - j0;
  const v = t.values;
  const a = v[j0 * t.nx + i0], b = v[j0 * t.nx + i1], c = v[j1 * t.nx + i0], d = v[j1 * t.nx + i1];
  return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
}

export function cellOf(dx: number, nx: number, ny: number, p: Pt): number {
  const i = Math.min(nx - 1, Math.max(0, Math.floor(p[0] / dx)));
  const j = Math.min(ny - 1, Math.max(0, Math.floor(p[1] / dx)));
  return j * nx + i;
}

/** Celda libre (no edificio) más cercana a un punto, buscando en anillos crecientes. */
function nearestFree(solid: Uint8Array, nx: number, ny: number, dx: number, p: Pt): number {
  const ci = Math.min(nx - 1, Math.max(0, Math.floor(p[0] / dx)));
  const cj = Math.min(ny - 1, Math.max(0, Math.floor(p[1] / dx)));
  for (let r = 0; r < Math.max(nx, ny); r++) {
    let best = -1, bestD = Infinity;
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const k = j * nx + i;
        if (solid[k]) continue;
        const d = (i - ci) ** 2 + (j - cj) ** 2;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
    }
    if (best >= 0) return best;
  }
  throw new Error('No hay celdas libres en el dominio.');
}

function fnv(h: number, v: number): number {
  h ^= v & 0xff;
  h = Math.imul(h, 16777619);
  h ^= (v >>> 8) & 0xff;
  h = Math.imul(h, 16777619);
  h ^= (v >>> 16) & 0xff;
  h = Math.imul(h, 16777619);
  h ^= (v >>> 24) & 0xff;
  return Math.imul(h, 16777619);
}

export function compile(sc: Scenario, shared: Shared, iv: Interventions): Compiled {
  const dx = shared.dx;
  const nx = Math.round(sc.extent.width / dx);
  const ny = Math.round(sc.extent.height / dx);
  const N = nx * ny;
  const area = dx * dx;
  const z = new Float64Array(N);
  const zGround = new Float64Array(N);
  const solid = new Uint8Array(N);
  const building = new Int16Array(N).fill(-1);
  const cover = new Uint8Array(N).fill(coverIndex(sc.defaultCover));
  const zone = new Int16Array(N).fill(-1);
  const garden = new Int16Array(N).fill(-1);

  // 1) Terreno base muestreado en el centro de cada celda
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = sampleTerrain(sc.terrain, (i + 0.5) * dx, (j + 0.5) * dx);
    z[j * nx + i] = v;
    zGround[j * nx + i] = v;
  }
  // 2) Depresiones (bajos donde se encharca)
  for (const b of sc.bowls) {
    const r2 = b.r * b.r;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * dx - b.cx, y = (j + 0.5) * dx - b.cy;
      const d2 = x * x + y * y;
      if (d2 < r2) {
        const k = j * nx + i;
        const dz = b.depth * (1 - d2 / r2);
        z[k] -= dz;
        zGround[k] -= dz;
      }
    }
  }
  // 3) Superficies: cobertura, bordillos y pendientes transversales
  for (const s of sc.surfaces) {
    forCellsIn(s.polygon, nx, ny, dx, (k, x, y) => {
      if (s.cover) cover[k] = coverIndex(s.cover);
      if (s.plane) {
        const pz = s.plane.z0 + s.plane.sx * (x - s.plane.at[0]) + s.plane.sy * (y - s.plane.at[1]);
        z[k] = pz;
        zGround[k] = pz;
      }
      let dz = s.dz ?? 0;
      if (s.crossSlope) {
        const d = Math.abs((s.crossSlope.axis === 'x' ? x : y) - s.crossSlope.at);
        dz += s.crossSlope.slope * d;
      }
      z[k] += dz;
      if (s.crossSlope) zGround[k] += s.crossSlope.slope * Math.abs((s.crossSlope.axis === 'x' ? x : y) - s.crossSlope.at);
    });
  }
  // 3b) Huella de edificios (celdas sólidas: bloquean el flujo; su lluvia va a la bajante o al depósito)
  sc.buildings.forEach((b, bi) => {
    forCellsIn(b.polygon, nx, ny, dx, (k) => {
      solid[k] = 1;
      building[k] = bi;
    });
  });
  // 3c) Patios interiores cerrados (sectores reales): celdas libres sin camino hasta un borde del dominio,
  // rodeadas por construcciones. En la malla de cálculo serían pozos sin salida; en la realidad se desaguan por
  // las bajantes y tuberías de las casas. Se tratan como parte de la construcción vecina (su lluvia va a la
  // bajante) y se cuentan en `pockets`.
  const patio = new Int32Array(sc.buildings.length);
  let pockets = 0;
  if (sc.closePockets) {
    const reach = new Uint8Array(N);
    const stack: number[] = [];
    for (let i = 0; i < nx; i++) for (const j of [0, ny - 1]) if (!solid[j * nx + i]) stack.push(j * nx + i);
    for (let j = 0; j < ny; j++) for (const i of [0, nx - 1]) if (!solid[j * nx + i]) stack.push(j * nx + i);
    for (const k of stack) reach[k] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const i = k % nx, j = (k - i) / nx;
      for (const q of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < ny - 1 ? k + nx : -1]) {
        if (q >= 0 && !reach[q] && !solid[q]) {
          reach[q] = 1;
          stack.push(q);
        }
      }
    }
    for (let k = 0; k < N; k++) {
      if (solid[k] || reach[k]) continue;
      // edificio vecino (el primero que se encuentre en un radio creciente)
      const i = k % nx, j = (k - i) / nx;
      let bi = -1;
      for (let r = 1; r < Math.max(nx, ny) && bi < 0; r++) {
        for (let jj = Math.max(0, j - r); jj <= Math.min(ny - 1, j + r) && bi < 0; jj++) for (let ii = Math.max(0, i - r); ii <= Math.min(nx - 1, i + r); ii++) {
          const q = jj * nx + ii;
          if (building[q] >= 0) {
            bi = building[q];
            break;
          }
        }
      }
      if (bi < 0) continue;
      solid[k] = 1;
      building[k] = bi;
      cover[k] = coverIndex('techo');
      patio[bi]++;
      pockets++;
    }
  }
  // 4) Zonas modificables (superficie elegida por el estudiante)
  sc.zones.forEach((zn, zi) => {
    const chosen: CoverId = iv.zones[zn.id] ?? zn.cover;
    forCellsIn(zn.polygon, nx, ny, dx, (k) => {
      cover[k] = coverIndex(chosen);
      zone[k] = zi;
    });
  });
  // 4b) Planificador: una fracción del suelo abierto de concreto (patios, antejardines, lotes duros) pasa a
  // pasto, en un orden fijo y repartido por todo el sector (el mismo en cada corrida)
  if (iv.greening && iv.greening > 0) {
    const conc = coverIndex('concreto');
    const open: number[] = [];
    for (let k = 0; k < N; k++) if (!solid[k] && building[k] < 0 && zone[k] < 0 && cover[k] === conc) open.push(k);
    const key = (k: number) => {
      let x = (k * 2654435761) ^ (sc.seed * 40503);
      x = Math.imul(x ^ (x >>> 16), 2246822507);
      x = Math.imul(x ^ (x >>> 13), 3266489909);
      return (x ^ (x >>> 16)) >>> 0;
    };
    open.sort((a, b) => key(a) - key(b));
    const n = Math.round(open.length * Math.min(0.3, iv.greening));
    const gr = coverIndex('grama');
    for (let q = 0; q < n; q++) cover[open[q]] = gr;
  }
  // 5) Jardines de lluvia activos: rebaje del terreno y abertura en el bordillo
  sc.gardens.forEach((g, gi) => {
    if (!iv.gardens[g.id]) return;
    let zIn = Infinity;
    const inletCells: number[] = [];
    const inGarden = new Uint8Array(N);
    forCellsIn(g.inlet, nx, ny, dx, (k) => {
      inletCells.push(k);
      inGarden[k] = 1;
    });
    forCellsIn(g.polygon, nx, ny, dx, (k) => {
      inGarden[k] = 2;
    });
    // La abertura del bordillo queda al nivel de la cuneta más baja cercana (≤ 3 celdas)
    const R = Math.max(1, Math.round(3 / dx));
    const newZ = inletCells.map((k) => {
      const ci = k % nx, cj = (k - ci) / nx;
      let best = Infinity;
      for (let jj = cj - R; jj <= cj + R; jj++) for (let ii = ci - R; ii <= ci + R; ii++) {
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const q = jj * nx + ii;
        if (inGarden[q] || solid[q]) continue;
        if (z[q] < best) best = z[q];
      }
      return Number.isFinite(best) ? Math.min(z[k], best - 0.005) : z[k];
    });
    inletCells.forEach((k, q) => {
      z[k] = newZ[q];
      if (z[k] < zIn) zIn = z[k];
    });
    if (!Number.isFinite(zIn)) return;
    forCellsIn(g.polygon, nx, ny, dx, (k) => {
      z[k] = Math.min(z[k], zIn - g.depthM);
      cover[k] = coverIndex('jardin_lluvia');
      garden[k] = gi;
    });
  });
  // 6) Edificios: techo, bajante y depósito
  const tankOf = new Map<string, number>();
  const activeTanks = sc.tanks.filter((t) => iv.tanks[t.id]?.on);
  activeTanks.forEach((t, ti) => t.buildingIds.forEach((b) => tankOf.set(b, ti)));
  const buildings: CompiledBuilding[] = [];
  sc.buildings.forEach((b, bi) => {
    let cells = 0;
    let baseZ = Infinity;
    forCellsIn(b.polygon, nx, ny, dx, (k) => {
      cover[k] = coverIndex('techo');
      cells++;
      if (zGround[k] < baseZ) baseZ = zGround[k];
    });
    cells += patio[bi];
    buildings.push({ id: b.id, index: bi, cells, roofArea: cells * area, downCell: -1, tank: tankOf.get(b.id) ?? -1, baseZ: Number.isFinite(baseZ) ? baseZ : 0, heightM: b.heightM, rainWeight: 0, creekDistM: sc.creek ? polyToLine(b.polygon, sc.creek.axis) : Infinity });
  });
  buildings.forEach((cb, bi) => {
    cb.downCell = nearestFree(solid, nx, ny, dx, sc.buildings[bi].downspout);
  });

  // Parámetros hidráulicos por celda
  const n = new Float64Array(N), fc = new Float64Array(N), smax = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const c = COVERS[COVER_LIST[cover[k]]];
    n[k] = c.manning;
    fc[k] = solid[k] ? 0 : mmhToMs(c.ksMmH);
    smax[k] = solid[k] ? 0 : c.storageM;
  }

  // Lluvia: peso espacial por celda (uniforme o localizada)
  const rainWeight = new Float64Array(N);
  const r = shared.rain;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (r.spatial === 'uniforme') rainWeight[k] = 1;
    else {
      const ddx = (i + 0.5) * dx - r.center[0], ddy = (j + 0.5) * dx - r.center[1];
      rainWeight[k] = ddx * ddx + ddy * ddy <= r.radiusM * r.radiusM ? 1 : 0;
    }
  }
  for (let k = 0; k < N; k++) if (building[k] >= 0) buildings[building[k]].rainWeight += rainWeight[k];

  // Sumideros
  const drains: CompiledDrain[] = sc.drains.map((d, di) => {
    const cell = nearestFree(solid, nx, ny, dx, d.at);
    const obs = Math.min(1, Math.max(0, iv.drains[d.id] ?? d.obstruction));
    const fullP = d.freeSides >= 4 ? 2 * (d.widthM + d.lengthM) : d.widthM + 2 * d.lengthM;
    return {
      id: d.id,
      index: di,
      cell,
      perimeter: fullP * (1 - obs),
      openArea: d.widthM * d.lengthM * d.openFraction * (1 - obs),
      capacity: d.capacityLps / 1000,
      obstruction: obs,
      gutterSlope: d.gutterSlope ?? 0,
    };
  });

  // Depósitos activos
  const tanks: CompiledTank[] = activeTanks.map((t, ti) => {
    const bIdx = t.buildingIds.map((id) => sc.buildings.findIndex((b) => b.id === id)).filter((q) => q >= 0);
    return {
      id: t.id,
      index: ti,
      capacity: t.capacityM3,
      release: t.releaseLps / 1000,
      destination: iv.tanks[t.id].destination,
      overflowCell: buildings[bIdx[0]].downCell,
      buildings: bIdx,
    };
  });

  // Salidas: caras de borde con condición de profundidad normal. La pendiente es la del terreno junto al borde
  // (de la celda a ≈ 6 m hacia adentro hasta la del borde): el cauce o la calle siguen bajando fuera del sector
  // con esa pendiente. La del escenario solo se usa si el terreno no baja hacia el borde.
  const outlets: OutletFace[] = [];
  const reach = Math.max(2, Math.round(OUTLET_REACH_M / dx));
  const edgeSlope = (cell: number, step: number, spec: number): number => {
    let k = cell, n = 0;
    for (let q = 0; q < reach; q++) {
      const nk = k + step;
      if (nk < 0 || nk >= N || solid[nk]) break;
      k = nk;
      n++;
    }
    const sl = n > 0 ? (z[k] - z[cell]) / (n * dx) : 0;
    return sl > OUTLET_MIN_SLOPE ? sl : spec;
  };
  for (const o of sc.outlets) {
    if (o.edge === 'E' || o.edge === 'W') {
      const i = o.edge === 'E' ? nx - 1 : 0;
      for (let j = 0; j < ny; j++) {
        const y = (j + 0.5) * dx;
        if (y < o.from || y > o.to) continue;
        const cell = j * nx + i;
        if (solid[cell]) continue;
        outlets.push({ id: o.id, cell, axis: 'x', face: j * (nx + 1) + (o.edge === 'E' ? nx : 0), dir: o.edge === 'E' ? 1 : -1, slope: edgeSlope(cell, o.edge === 'E' ? -1 : 1, o.slope), slopeSpec: o.slope });
      }
    } else {
      const j = o.edge === 'N' ? ny - 1 : 0;
      for (let i = 0; i < nx; i++) {
        const x = (i + 0.5) * dx;
        if (x < o.from || x > o.to) continue;
        const cell = j * nx + i;
        if (solid[cell]) continue;
        outlets.push({ id: o.id, cell, axis: 'y', face: (o.edge === 'N' ? ny : 0) * nx + i, dir: o.edge === 'N' ? 1 : -1, slope: edgeSlope(cell, o.edge === 'N' ? -nx : nx, o.slope), slopeSpec: o.slope });
      }
    }
  }

  // Entradas externas (agua que llega desde fuera del sector)
  const inflowCells: number[] = [];
  const edgeCells = (f: InflowSpec): number[] => {
    const out: number[] = [];
    if (f.edge === 'E' || f.edge === 'W') {
      const i = f.edge === 'E' ? nx - 1 : 0;
      for (let j = 0; j < ny; j++) {
        const y = (j + 0.5) * dx;
        if (y >= f.from && y <= f.to && !solid[j * nx + i]) out.push(j * nx + i);
      }
    } else {
      const j = f.edge === 'N' ? ny - 1 : 0;
      for (let i = 0; i < nx; i++) {
        const x = (i + 0.5) * dx;
        if (x >= f.from && x <= f.to && !solid[j * nx + i]) out.push(j * nx + i);
      }
    }
    // tramo más corto que una celda: la celda libre más cercana al centro del tramo
    if (!out.length) out.push(nearestFree(solid, nx, ny, dx, f.edge === 'E' || f.edge === 'W' ? [f.edge === 'E' ? nx * dx - dx / 2 : dx / 2, (f.from + f.to) / 2] : [(f.from + f.to) / 2, f.edge === 'N' ? ny * dx - dx / 2 : dx / 2]));
    return out;
  };
  // Agua de las laderas vecinas (entra mientras llueve, C·i·A); las demás son entradas fijas
  const runon: { id: string; cells: number[]; areaM2: number; c: number }[] = [];
  // Las laderas entran por el tramo de borde donde cruza su drenaje; si casi todo el tramo está ocupado por
  // construcciones, el tramo se amplía a lado y lado hasta 15 m (sin entrar en el de la quebrada) buscando una
  // celda libre por cada 2000 m² de ladera (entre 5 y 20 celdas): el agua de la ladera llega repartida por las
  // calles y escaleras, no por un solo metro de borde.
  // Solo sirven celdas de borde comunicadas con el resto del barrio (componente de celdas libres de 200 m² o
  // más): un rincón del borde encerrado por casas no tiene por dónde dejar pasar el agua de la ladera.
  const comp = new Int32Array(N).fill(-1);
  const compSize: number[] = [];
  for (let k0 = 0; k0 < N; k0++) {
    if (solid[k0] || comp[k0] >= 0) continue;
    const id = compSize.length;
    let size = 0;
    const st = [k0];
    comp[k0] = id;
    while (st.length) {
      const k = st.pop()!;
      size++;
      const i = k % nx, j = (k - i) / nx;
      for (const q of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < ny - 1 ? k + nx : -1]) {
        if (q >= 0 && !solid[q] && comp[q] < 0) {
          comp[q] = id;
          st.push(q);
        }
      }
    }
    compSize.push(size);
  }
  const open = (k: number) => !solid[k] && compSize[comp[k]] * area >= 200;
  // sin celdas de borde útiles: las `m` celdas comunicadas más cercanas al centro del tramo (el agua cruza por
  // encima o entre las casas del borde y aparece en la calle más cercana)
  const nearestOpen = (f: InflowSpec, m: number): number[] => {
    const cx = f.edge === 'E' ? nx * dx : f.edge === 'W' ? 0 : (f.from + f.to) / 2;
    const cy = f.edge === 'N' ? ny * dx : f.edge === 'S' ? 0 : (f.from + f.to) / 2;
    const cand: [number, number][] = [];
    for (let k = 0; k < N; k++) if (open(k)) cand.push([Math.hypot((k % nx + 0.5) * dx - cx, (Math.floor(k / nx) + 0.5) * dx - cy), k]);
    cand.sort((a, b) => a[0] - b[0]);
    const out = cand.slice(0, m).map((q) => q[1]);
    return out.length ? out : edgeCells(f).slice(0, 1);
  };
  const creekIn = sc.creek ? sc.inflows.find((q) => q.id === sc.creek!.inflowId) : undefined;
  for (const f of sc.inflows) {
    if (f.rainAreaM2 && f.rainAreaM2 > 0) {
      const want = Math.min(20, Math.max(5, Math.ceil(f.rainAreaM2 / 2000)));
      const L = f.edge === 'E' || f.edge === 'W' ? ny * dx : nx * dx;
      // celda útil: comunicada y con el terreno bajando hacia adentro (donde baja hacia afuera, el borde es una
      // salida del barrio y debe seguir siéndolo)
      const di = f.edge === 'E' ? -1 : f.edge === 'W' ? 1 : f.edge === 'N' ? -nx : nx;
      const ok = (k: number) => open(k) && z[k] > z[k + 2 * di] + 0.02;
      let g = { ...f };
      let cells = edgeCells(g).filter(ok);
      for (let w = 1; cells.length < want && (g.from > 0 || g.to < L) && w * dx <= 15; w++) {
        g = { ...f, from: Math.max(0, f.from - w * dx), to: Math.min(L, f.to + w * dx) };
        cells = edgeCells(g).filter(ok);
        if (creekIn && creekIn.edge === f.edge) cells = cells.filter((k) => {
          const t = ((f.edge === 'E' || f.edge === 'W' ? Math.floor(k / nx) : k % nx) + 0.5) * dx;
          return t < creekIn.from - dx || t > creekIn.to + dx;
        });
      }
      if (!cells.length) cells = edgeCells(f).filter(open);
      if (!cells.length) cells = nearestOpen(f, want);
      runon.push({ id: f.id, cells, areaM2: f.rainAreaM2, c: f.runoffC ?? 0.75 });
    } else inflowCells.push(...edgeCells(f));
  }
  // las celdas por donde entra agua de una ladera no son salidas (la condición de salida no mira hacia dónde
  // baja el terreno)
  if (runon.length) {
    const rs = new Set(runon.flatMap((r) => r.cells));
    for (let q = outlets.length - 1; q >= 0; q--) if (rs.has(outlets[q].cell)) outlets.splice(q, 1);
  }

  // 3d) Sectores reales: relleno final de depresiones con la malla de cálculo ya rasterizada (inundación por
  // prioridad desde las celdas de salida, con las construcciones como muros). El constructor del sector ya rellenó
  // el terreno con sus polígonos; aquí se corrigen los pozos de una o dos celdas que deja la diferencia entre ambas
  // rasterizaciones. Toda celda libre queda con un camino descendente (pendiente mínima de 1 mm por celda) hasta
  // una salida. Se cuentan las celdas y el volumen rellenados.
  let fillCells = 0, fillVolume = 0;
  if (sc.closePockets && outlets.length) {
    const done = new Uint8Array(N);
    // montículo binario de mínimos por cota
    const hk: number[] = [], hz: number[] = [];
    const push = (k: number, v: number) => {
      let p = hk.length;
      hk.push(k);
      hz.push(v);
      while (p > 0) {
        const q = (p - 1) >> 1;
        if (hz[q] <= hz[p]) break;
        [hk[p], hk[q]] = [hk[q], hk[p]];
        [hz[p], hz[q]] = [hz[q], hz[p]];
        p = q;
      }
    };
    const pop = (): number => {
      const top = hk[0];
      const lk = hk.pop()!, lz = hz.pop()!;
      if (hk.length) {
        hk[0] = lk;
        hz[0] = lz;
        let p = 0;
        for (;;) {
          const a = 2 * p + 1, b = a + 1;
          let m = p;
          if (a < hk.length && hz[a] < hz[m]) m = a;
          if (b < hk.length && hz[b] < hz[m]) m = b;
          if (m === p) break;
          [hk[p], hk[m]] = [hk[m], hk[p]];
          [hz[p], hz[m]] = [hz[m], hz[p]];
          p = m;
        }
      }
      return top;
    };
    for (const o of outlets) if (!done[o.cell]) {
      done[o.cell] = 1;
      push(o.cell, z[o.cell]);
    }
    const eps = 0.001;
    while (hk.length) {
      const k = pop();
      const i = k % nx, j = (k - i) / nx;
      for (const q of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < ny - 1 ? k + nx : -1]) {
        if (q < 0 || done[q] || solid[q]) continue;
        done[q] = 1;
        if (z[q] < z[k] + eps) {
          const d = z[k] + eps - z[q];
          if (d > 0.01) {
            fillCells++;
            fillVolume += d * area;
          }
          z[q] = z[k] + eps;
        }
        push(q, z[q]);
      }
    }
  }


  const probes = sc.probes.map((p) => ({ id: p.id, name: p.name, cell: nearestFree(solid, nx, ny, dx, p.at) }));

  // Red de alcantarillado separada
  const erradaNode = new Int32Array(sc.buildings.length).fill(-1);
  let sewer: CompiledSewer | null = null;
  if (sc.sewer) {
    const sp = sc.sewer;
    const idx = new Map<string, number>();
    const sysOf = (v: 'lluvias' | 'residuales') => (v === 'lluvias' ? 0 : 1) as 0 | 1;
    const nodes: SNode[] = sp.nodes.map((nd, k) => {
      idx.set(nd.id, k);
      // la caja de un sumidero queda en la celda del sumidero (misma que usa la captación)
      const di = sc.drains.findIndex((d) => d.node === nd.id);
      const cell = di >= 0 ? drains[di].cell : nearestFree(solid, nx, ny, dx, nd.at);
      const area0 = nd.kind === 'caja-sumidero' ? nd.diameterM * nd.diameterM : (Math.PI * nd.diameterM * nd.diameterM) / 4;
      return { id: nd.id, name: nd.name, system: sysOf(nd.system), kind: nd.kind, x: nd.at[0], y: nd.at[1], cell, rim: z[cell], inv: nd.invertM, area0, outfall: nd.kind === 'descarga' ? (nd.outfall === 'quebrada' ? 2 : 1) : 0, vTab: new Float64Array(2), dy: 0.005, vRim: 0 };
    });
    const pipes: SPipe[] = sp.pipes.map((pp) => {
      const a = idx.get(pp.from), b = idx.get(pp.to);
      if (a === undefined || b === undefined) throw new Error(`Tramo ${pp.id}: nodo desconocido.`);
      if (nodes[a].system !== sysOf(pp.system) || nodes[b].system !== sysOf(pp.system)) throw new Error(`Tramo ${pp.id}: une sistemas distintos (la red debe ser separada).`);
      const L = Math.max(1, Math.hypot(nodes[b].x - nodes[a].x, nodes[b].y - nodes[a].y));
      if (pp.invertUpM < nodes[a].inv - 1e-6 || pp.invertDownM < nodes[b].inv - 1e-6) throw new Error(`Tramo ${pp.id}: la batea queda por debajo del fondo de su nodo.`);
      return { id: pp.id, system: sysOf(pp.system), a, b, D: pp.diameterM, n: pp.manning, L, zUp: pp.invertUpM, zDn: pp.invertDownM, role: pp.role, material: pp.material, qFull: fullFlow(pp.diameterM, pp.manning, (pp.invertUpM - pp.invertDownM) / L) };
    });
    nodes.forEach((nd, k) => {
      if (nd.outfall) return;
      const ends = pipes.filter((pp) => pp.a === k || pp.b === k).map((pp) => ({ L: pp.L, D: pp.D, zEnd: pp.a === k ? pp.zUp : pp.zDn }));
      Object.assign(nd, buildNodeTable(nd, ends));
    });
    const inlets: (SInlet | null)[] = sc.drains.map((d, di) => {
      if (!d.node) return null;
      const k = idx.get(d.node);
      if (k === undefined || nodes[k].kind !== 'caja-sumidero' || nodes[k].system !== 0) throw new Error(`Sumidero ${d.id}: debe entregar a una caja de sumidero de aguas lluvias.`);
      const obs = drains[di].obstruction;
      const type = d.type ?? 'rejilla';
      return {
        drain: di,
        node: k,
        cell: drains[di].cell,
        type,
        perimeter: type === 'ventana' ? 0 : drains[di].perimeter,
        openArea: type === 'ventana' ? 0 : drains[di].openArea,
        winL: type === 'rejilla' ? 0 : (d.windowLengthM ?? 1.5) * (1 - obs),
        winH: d.windowHeightM ?? 0.15,
        kGrade: windowK(d.longSlope ?? 0.02),
        sag: (d.longSlope ?? 0) < 0.01,
        gutterSlope: d.gutterSlope ?? 0,
      };
    });
    const dryIn = new Float64Array(nodes.length);
    let persons = 0;
    const san = sp.sanitary;
    sc.buildings.forEach((b) => {
      const k = idx.get(san.buildingNode[b.id] ?? '');
      if (k === undefined) return;
      const pers = b.floors * san.personsPerFloor;
      persons += pers;
      dryIn[k] += (pers * san.dotacionLpd * san.returnCoef * san.peakFactor) / 86400 / 1000;
    });
    const sanNodes = nodes.map((n, k) => (n.system === 1 && !n.outfall ? k : -1)).filter((k) => k >= 0);
    const inf = (san.infiltrationLpsHa * (sc.extent.width * sc.extent.height)) / 1e4 / 1000;
    for (const k of sanNodes) dryIn[k] += inf / sanNodes.length;
    for (const u of san.upstream) {
      const k = idx.get(u.node);
      if (k !== undefined) dryIn[k] += u.lps / 1000;
    }
    let dryTotal = 0;
    for (let k = 0; k < dryIn.length; k++) dryTotal += dryIn[k];
    const erradas: { building: number; node: number }[] = [];
    if (iv.erradas) {
      for (const bid of sp.erradas.buildingIds) {
        const bi = sc.buildings.findIndex((b) => b.id === bid);
        const k = idx.get(san.buildingNode[bid] ?? '');
        if (bi >= 0 && k !== undefined) {
          erradas.push({ building: bi, node: k });
          erradaNode[bi] = k;
        }
      }
    }
    // los depósitos con descarga a la red entregan en la cámara de aguas lluvias más cercana
    let tankNode = -1;
    if (tanks.length) {
      const oc = tanks[0].overflowCell;
      const ox = ((oc % nx) + 0.5) * dx, oy = (Math.floor(oc / nx) + 0.5) * dx;
      let bd = Infinity;
      nodes.forEach((n, k) => {
        if (n.system !== 0 || n.outfall || n.kind === 'caja-sumidero') return;
        const dd = Math.hypot(n.x - ox, n.y - oy);
        if (dd < bd) {
          bd = dd;
          tankNode = k;
        }
      });
    }
    const upRunoff = (sp.upstreamRunoff ?? []).map((u) => ({ node: idx.get(u.node) ?? -1, cA: u.coef * u.areaM2 })).filter((u) => u.node >= 0);
    sewer = { nodes, pipes, inlets, dryIn, upRunoff, erradas, upErradasM2: iv.erradas ? sp.erradas.upstreamRoofM2 : 0, upErradasNode: idx.get(sp.erradas.upstreamNode) ?? -1, tankNode, persons, dryTotal };
  }

  // Quebrada: celdas de la creciente y sección de control (capacidad a cauce lleno con la regla del modelo)
  let creek: CompiledCreek | null = null;
  if (sc.creek) {
    const ck = sc.creek;
    const f = sc.inflows.find((q) => q.id === ck.inflowId);
    const cells: number[] = [];
    if (f && (f.edge === 'E' || f.edge === 'W')) {
      const i = f.edge === 'E' ? nx - 1 : 0;
      for (let j = 0; j < ny; j++) {
        const y = (j + 0.5) * dx;
        if (y >= f.from && y <= f.to && !solid[j * nx + i]) cells.push(j * nx + i);
      }
    } else if (f) {
      const j = f.edge === 'N' ? ny - 1 : 0;
      for (let i = 0; i < nx; i++) {
        const x = (i + 0.5) * dx;
        if (x >= f.from && x <= f.to && !solid[j * nx + i]) cells.push(j * nx + i);
      }
    }
    const [sx, sy] = ck.section.at;
    // orientación: la sección es la columna (cauce que corre en x) o la fila (cauce que corre en y) de la malla
    // que pasa por el punto, según la dirección del eje allí
    const [ux, uy] = axisDirAt(ck.axis, sx, sy);
    const flow: 'x' | 'y' = ck.section.flowAxis ?? (Math.abs(ux) >= Math.abs(uy) ? 'x' : 'y');
    const along = flow === 'x' ? ux : uy;
    const sign: 1 | -1 = along >= 0 ? 1 : -1;
    // con menos de ≈ 6° entre el eje y la malla la corrección es menor de 0,5 % y no se aplica
    const cos0 = Math.abs(along) / Math.hypot(ux, uy);
    const cosT = cos0 >= 0.995 ? 1 : Math.max(0.5, cos0);
    const nAlong = flow === 'x' ? nx : ny, nCross = flow === 'x' ? ny : nx;
    const [sa, sx2] = flow === 'x' ? [sx, sy] : [sy, sx];
    const i = Math.min(nAlong - 1, Math.max(0, Math.floor(sa / dx)));
    const cell = (ii: number, j: number) => (flow === 'x' ? j * nx + ii : ii * nx + j);
    const j0 = Math.max(0, Math.floor((sx2 - ck.section.halfWidthM) / dx));
    const j1 = Math.min(nCross - 1, Math.floor((sx2 + ck.section.halfWidthM) / dx));
    let jt: number, jb0: number, jb1: number, bankLevel: number;
    if (ck.section.bankDepthM != null) {
      // sectores reales: talweg junto al punto, cauce lleno a la profundidad estimada en la sección y orillas
      // donde el terreno (o una construcción) alcanza ese nivel a cada lado
      const jc = Math.min(j1, Math.max(j0, Math.floor(sx2 / dx)));
      jt = jc;
      for (let j = Math.max(j0, jc - 2); j <= Math.min(j1, jc + 2); j++) if (z[cell(i, j)] < z[cell(i, jt)]) jt = j;
      bankLevel = z[cell(i, jt)] + ck.section.bankDepthM;
      jb0 = j0;
      for (let j = jt - 1; j >= j0; j--) if (solid[cell(i, j)] || z[cell(i, j)] >= bankLevel) { jb0 = j; break; }
      jb1 = j1;
      for (let j = jt + 1; j <= j1; j++) if (solid[cell(i, j)] || z[cell(i, j)] >= bankLevel) { jb1 = j; break; }
    } else {
      jt = j0;
      for (let j = j0; j <= j1; j++) if (z[cell(i, j)] < z[cell(i, jt)]) jt = j;
      // orillas: primera celda a cada lado cuyo centro queda fuera del cauce encajado (a ≥ semiancho del eje)
      const bh = ck.section.bankHalfWidthM / cosT;
      jb0 = Math.max(j0, Math.floor((sx2 - bh) / dx - 0.5));
      jb1 = Math.min(j1, Math.ceil((sx2 + bh) / dx - 0.5));
      bankLevel = Math.min(z[cell(i, jb0)], z[cell(i, jb1)]);
    }
    const zBed = z[cell(i, jt)];
    // pendiente del fondo: talweg 5 m aguas arriba y aguas abajo (sobre el eje del cauce, no de la malla)
    const bedAt = (ii: number) => {
      let m = Infinity;
      const iic = Math.min(nAlong - 1, Math.max(0, ii));
      for (let j = j0; j <= j1; j++) m = Math.min(m, z[cell(iic, j)]);
      return m;
    };
    const di = Math.max(1, Math.round(5 / dx));
    // si aguas arriba hay una vía en terraplén sobre el cauce (cobertura), se toma el primer punto del cauce
    // natural después de ella
    let iu = i - sign * di;
    if (flow === 'x' && sign > 0) {
      for (const cs of sc.culverts ?? []) {
        const a = Math.floor(cs.road.x0 / dx), b = Math.ceil(cs.road.x1 / dx);
        if (iu >= a && iu < b && b < i) iu = b;
      }
    }
    const idn = i + sign * di;
    const slope = Math.max(1e-4, (Math.abs(bedAt(iu) - bedAt(idn)) * cosT) / (Math.abs(idn - iu) * dx));
    // capacidad: caudal normal a la sección; si cruza el cauce en diagonal, la línea de la malla es 1/cosT más
    // larga que el ancho del cauce
    let capacity = 0, capacityManning = 0;
    for (let j = jb0; j <= jb1; j++) {
      const k = cell(i, j);
      const hh = bankLevel - z[k];
      if (hh <= 0 || solid[k]) continue;
      const qm = (Math.pow(hh, 5 / 3) * Math.sqrt(slope)) / n[k];
      const qf = NUMERICS.froudeMax * hh * Math.sqrt(G * hh);
      capacity += Math.min(qm, qf) * dx * cosT;
      capacityManning += qm * dx * cosT;
    }
    creek = { cells, baseM3s: ck.baseM3s, flow, sign, cosT, i, j0, j1, jb0, jb1, jt, zBed, bankLevel, slope, capacity, capacityManning, name: ck.section.name, basin: ck.basin, basinCover: iv.basinCover ?? 'mixta' };
  }

  // Coberturas: grupos de celdas a la entrada y a la salida, bateas, tabla de control de entrada
  const culverts: CompiledCulvert[] = [];
  for (const cs of sc.culverts ?? []) {
    const group = ([px, py]: Pt) => {
      const i = Math.min(nx - 1, Math.max(0, Math.floor(px / dx)));
      const cells: number[] = [];
      for (let j = 0; j < ny; j++) {
        const y = (j + 0.5) * dx;
        if (Math.abs(y - py) <= cs.spanM / 2 + 1e-9 && !solid[j * nx + i]) cells.push(j * nx + i);
      }
      if (!cells.length) cells.push(Math.min(ny - 1, Math.max(0, Math.floor(py / dx))) * nx + i);
      return cells;
    };
    const inCells = group(cs.inlet), outCells = group(cs.outlet);
    const zIn = Math.min(...inCells.map((k) => z[k])), zOut = Math.min(...outCells.map((k) => z[k]));
    const L = Math.max(dx, Math.abs(cs.outlet[0] - cs.inlet[0]));
    const geom: CulvertGeom = { B: cs.spanM, D: cs.riseM, L, S: Math.max(0.001, (zIn - zOut) / L), barrels: cs.barrels, n: cs.n, Ke: cs.ke };
    const rating = inletRating(geom);
    // cota de la vía: la celda más baja de la franja de la vía sobre el cauce
    // celdas enteras dentro de la franja de la vía (las de borde mezclan vía y cauce al remuestrear)
    const i0 = Math.max(0, Math.ceil(cs.road.x0 / dx - 1e-9)), i1 = Math.min(nx - 1, Math.floor(cs.road.x1 / dx + 1e-9) - 1);
    const j0 = Math.max(0, Math.ceil(cs.road.y0 / dx - 1e-9)), j1 = Math.min(ny - 1, Math.floor(cs.road.y1 / dx + 1e-9) - 1);
    let crestZ = Infinity;
    const overFaces: number[] = [];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) if (!solid[j * nx + i]) crestZ = Math.min(crestZ, z[j * nx + i]);
      if (i1 + 1 < nx) overFaces.push(j * (nx + 1) + i1 + 1);
    }
    const st = iv.culverts?.[cs.id] ?? { obstruction: 0, progressive: false };
    culverts.push({
      id: cs.id,
      name: cs.name,
      inCells,
      outCells,
      zIn,
      zOut,
      geom,
      rating,
      crestZ,
      capacityFree: cs.spanM * qInlet(rating, crestZ - zIn),
      overFaces,
      obstruction: Math.max(0, Math.min(1, st.obstruction)),
      progressive: st.progressive,
      road: cs.road,
      lossK: 1 + cs.ke + (2 * G * cs.n * cs.n * L) / Math.pow(barrelR(geom), 4 / 3),
    });
  }

  let h = 2166136261;
  for (let k = 0; k < N; k++) {
    h = fnv(h, Math.round(z[k] * 1e4));
    h = fnv(h, solid[k] | (cover[k] << 1));
  }
  for (const d of drains) h = fnv(h, d.cell ^ Math.round(d.perimeter * 1e4) ^ Math.round(d.gutterSlope * 1e4));
  for (const t of tanks) h = fnv(h, Math.round(t.capacity * 1e3) ^ (t.destination === 'red' ? 1 : 2));
  if (sewer) {
    for (const nd of sewer.nodes) h = fnv(h, nd.cell ^ Math.round(nd.inv * 1e3));
    for (const pp of sewer.pipes) h = fnv(h, Math.round(pp.D * 1e3) ^ Math.round(pp.zUp * 1e3) ^ Math.round(pp.zDn * 1e3));
    h = fnv(h, iv.erradas ? 7 : 3);
  }
  for (const cu of culverts) h = fnv(h, Math.round(cu.obstruction * 1000) ^ (cu.progressive ? 1 << 20 : 0) ^ cu.inCells[0]);
  if (creek?.basin) h = fnv(h, 11 + ['bosque', 'mixta', 'urbanizada'].indexOf(creek.basinCover));

  return {
    pockets,
    fillCells,
    fillVolume,
    runon,
    scenarioId: sc.id,
    dx,
    nx,
    ny,
    area,
    z,
    zGround,
    solid,
    building,
    cover,
    zone,
    garden,
    n,
    fc,
    smax,
    rainWeight,
    buildings,
    drains,
    tanks,
    outlets,
    inflowCells,
    probes,
    sewer,
    erradaNode,
    creek,
    exposed: (sc.exposed ?? []).map((o) => ({ ...o, at: [o.at[0], o.at[1]] as Pt })),
    culverts,
    hash: (h >>> 0).toString(16).padStart(8, '0'),
  };
}

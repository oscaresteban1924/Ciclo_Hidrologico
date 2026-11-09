// Convierte un escenario (polígonos + ráster) y las intervenciones en campos de malla para el cálculo.
// Es determinista: la misma entrada produce exactamente la misma malla (se verifica con un hash).

import { COVERS, COVER_LIST, coverIndex, mmhToMs, type CoverId } from './constants';
import type { Interventions, Polygon, Pt, Scenario, Shared, TerrainRaster } from './scenario';

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
  slope: number;
}

export interface Compiled {
  scenarioId: string;
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
  hash: string;
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
  // 4) Zonas modificables (superficie elegida por el estudiante)
  sc.zones.forEach((zn, zi) => {
    const chosen: CoverId = iv.zones[zn.id] ?? zn.cover;
    forCellsIn(zn.polygon, nx, ny, dx, (k) => {
      cover[k] = coverIndex(chosen);
      zone[k] = zi;
    });
  });
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
    buildings.push({ id: b.id, index: bi, cells, roofArea: cells * area, downCell: -1, tank: tankOf.get(b.id) ?? -1, baseZ: Number.isFinite(baseZ) ? baseZ : 0, heightM: b.heightM, rainWeight: 0 });
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

  // Salidas: caras de borde con condición de profundidad normal
  const outlets: OutletFace[] = [];
  for (const o of sc.outlets) {
    if (o.edge === 'E' || o.edge === 'W') {
      const i = o.edge === 'E' ? nx - 1 : 0;
      for (let j = 0; j < ny; j++) {
        const y = (j + 0.5) * dx;
        if (y < o.from || y > o.to) continue;
        const cell = j * nx + i;
        if (solid[cell]) continue;
        outlets.push({ id: o.id, cell, axis: 'x', face: j * (nx + 1) + (o.edge === 'E' ? nx : 0), dir: o.edge === 'E' ? 1 : -1, slope: o.slope });
      }
    } else {
      const j = o.edge === 'N' ? ny - 1 : 0;
      for (let i = 0; i < nx; i++) {
        const x = (i + 0.5) * dx;
        if (x < o.from || x > o.to) continue;
        const cell = j * nx + i;
        if (solid[cell]) continue;
        outlets.push({ id: o.id, cell, axis: 'y', face: (o.edge === 'N' ? ny : 0) * nx + i, dir: o.edge === 'N' ? 1 : -1, slope: o.slope });
      }
    }
  }

  // Entradas externas (agua que llega desde fuera del sector)
  const inflowCells: number[] = [];
  for (const f of sc.inflows) {
    if (f.edge === 'E' || f.edge === 'W') {
      const i = f.edge === 'E' ? nx - 1 : 0;
      for (let j = 0; j < ny; j++) {
        const y = (j + 0.5) * dx;
        if (y >= f.from && y <= f.to && !solid[j * nx + i]) inflowCells.push(j * nx + i);
      }
    } else {
      const j = f.edge === 'N' ? ny - 1 : 0;
      for (let i = 0; i < nx; i++) {
        const x = (i + 0.5) * dx;
        if (x >= f.from && x <= f.to && !solid[j * nx + i]) inflowCells.push(j * nx + i);
      }
    }
  }

  const probes = sc.probes.map((p) => ({ id: p.id, name: p.name, cell: nearestFree(solid, nx, ny, dx, p.at) }));

  let h = 2166136261;
  for (let k = 0; k < N; k++) {
    h = fnv(h, Math.round(z[k] * 1e4));
    h = fnv(h, solid[k] | (cover[k] << 1));
  }
  for (const d of drains) h = fnv(h, d.cell ^ Math.round(d.perimeter * 1e4) ^ Math.round(d.gutterSlope * 1e4));
  for (const t of tanks) h = fnv(h, Math.round(t.capacity * 1e3) ^ (t.destination === 'red' ? 1 : 2));

  return {
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
    hash: (h >>> 0).toString(16).padStart(8, '0'),
  };
}

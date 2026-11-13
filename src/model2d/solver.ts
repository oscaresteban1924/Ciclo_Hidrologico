// Un modelo bidimensional de verdad, en el navegador, construido como HEC-RAS 2D: un preprocesador que convierte el
// terreno en tablas «subgrid» (cada celda sabe cuánto volumen guarda a cada cota; cada cara, cuánta área y cuánta
// conducción tiene a cada cota) y un motor que resuelve continuidad y cantidad de movimiento en volúmenes finitos.
//
// La malla es de celdas cuadradas que se pueden refinar por regiones (un árbol cuaternario balanceado: una celda no
// tiene vecinas de menos de la mitad de su lado). HEC-RAS usa mallas no estructuradas; la idea de celdas, caras y
// tablas es la misma, y el motor solo ve celdas, caras y distancias.
//
// Tres ecuaciones: la onda difusiva, implícita (con el peso θ, iteraciones y tolerancias, como en HEC-RAS); la
// inercia local (aguas someras sin advección), explícita; y las aguas someras completas, explícitas, con la
// advección escrita en la forma que conserva la cantidad de movimiento de Stelling y Duinmeijer (2003).
//
// Además: el puente como estructura (flujo libre bajo el tablero, a presión cuando el agua lo toca y vertedero
// sobre el tablero y el terraplén, con sumergencia), la rotura progresiva del jarillón, la lluvia sobre la malla con
// las pérdidas del número de curva del SCS y mapas de diagnóstico (Courant e iteraciones).

import { COVER_KEYS, LEVEE, NX as VNX, NY as VNY, POIS, ROAD, ROAD_Z, dn, leveeHeight, terrainFor, truth, yc, type Cover, type TerrainOpts } from './terrain';

export const G = 9.81;
/** Niveles de las tablas de las caras: cada 0,1 m durante 6,3 m sobre el punto más bajo de la cara. */
const L = 64;
const DH = 0.1;
/** Profundidad mínima sobre el punto más bajo de una cara para que conduzca en la onda difusiva [m]. */
const HMIN = 0.01;

export type Eq = 'difusiva' | 'inercia' | 'swe';
export type BuildingMode = 'n' | 'bloque' | 'nada';
export const EQ_NAMES: Record<Eq, string> = { difusiva: 'Onda difusiva (implícita)', inercia: 'Inercia local (explícita)', swe: 'Aguas someras completas (explícita)' };
export const EQ_SHORT: Record<Eq, string> = { difusiva: 'Onda difusiva', inercia: 'Inercia local', swe: 'Aguas someras' };
export const BUILDING_NAMES: Record<BuildingMode, string> = { n: 'n alto', bloque: 'Bloques en el terreno', nada: 'Sin representar' };

/** Región de refinamiento: un nombre del sitio (o «rect:x0:y0:x1:y1» en metros) y el lado de celda que pide [m]. */
export interface Refine {
  region: string;
  c: number;
}

export interface MeshOpts {
  /** Lado de las celdas de base [m]. */
  c: number;
  subgrid: boolean;
  breaklines: boolean;
  refine?: Refine[];
}

export interface Roughness {
  n: Record<Cover, number>;
  /** Multiplicador de todos los n (sensibilidad y calibración). */
  mult: number;
  buildings: BuildingMode;
}

export const normalN = (): Record<Cover, number> => Object.fromEntries(COVER_KEYS.map((c) => [c, ({ cauce: 0.04, pasto: 0.03, cultivo: 0.035, rastrojo: 0.06, bosque: 0.1, via: 0.016, edificio: 0.2 } as Record<Cover, number>)[c]])) as Record<Cover, number>;

// ------------------------------------------------------------------ terrenos propios

/** Un terreno cargado por el usuario (un GeoTIFF pequeño): cota por píxel (NaN sin dato) y tamaño del píxel. */
export interface CustomDomain {
  id: string;
  name: string;
  NX: number;
  NY: number;
  px: number;
  z: Float32Array;
  /** Esquina suroeste en las coordenadas del archivo y su sistema (si lo declaraba). */
  E0?: number;
  N0?: number;
  epsg?: number | null;
}
const DOMAINS = new Map<string, CustomDomain>();
export function registerDomain(d: CustomDomain): void {
  DOMAINS.set(d.id, d);
}
export const domainOf = (id: string) => DOMAINS.get(id) ?? null;

/** Sitio de una corrida sobre un terreno propio: n uniforme y número de curva uniforme. */
export interface Site {
  id: string;
  n: number;
  cn: number;
}

// ------------------------------------------------------------------ condiciones de borde, estructuras, rotura y lluvia

export type Side = 'O' | 'E' | 'S' | 'N';
export const SIDE_NAMES: Record<Side, string> = { O: 'Oeste', E: 'Este', S: 'Sur', N: 'Norte' };
/** Línea de condición de borde sobre un lado del dominio, de `from` a `to` metros a lo largo de él. */
export interface BcLine {
  side: Side;
  from: number;
  to: number;
  /** Hidrograma de caudal (repartido con la pendiente de energía) o profundidad normal (pendiente de fricción). */
  kind: 'caudal' | 'normal';
  slope: number;
}
export const valleyBcs = (eg: number, out: number): BcLine[] => [
  { side: 'O', from: 0, to: VNY, kind: 'caudal', slope: eg },
  { side: 'E', from: 0, to: VNY, kind: 'normal', slope: out },
];

/** Cota de la cara inferior del tablero (tablero de 0,6 m bajo la rasante). */
export const LOW_CHORD = ROAD_Z - 0.6;
/**
 * El puente como estructura: coeficientes (SI) del vertedero sobre la vía y sobre el tablero, del orificio sumergido
 * y de la compuerta; cota de la cara inferior del tablero y fracción de la luz tapada por troncos y basura.
 */
export interface BridgeOpts {
  cwRoad: number;
  cwDeck: number;
  cOrifice: number;
  cSluice: number;
  low: number;
  block: number;
  /** Coeficientes de contracción y expansión para el flujo libre bajo el tablero (pérdidas locales). */
  cc: number;
  ce: number;
}
export const BRIDGE_DEFAULT: BridgeOpts = { cwRoad: 1.66, cwDeck: 1.44, cOrifice: 0.8, cSluice: 0.5, low: LOW_CHORD, block: 0, cc: 0.3, ce: 0.5 };
/** Línea de la malla donde se ubica la estructura del puente (la cara a 6 m aguas arriba del eje de la vía). */
export const BRIDGE_LINE = 440;

/** Rotura del jarillón (los datos que pide HEC-RAS para una rotura por rebose). */
export interface BreachOpts {
  /** Abscisa del centro de la rotura [m]. */
  x: number;
  /** Ancho final del fondo [m]. */
  width: number;
  /** Fondo final sobre el terreno natural al pie del jarillón [m]. */
  bottom: number;
  /** Taludes laterales (H:V). */
  slope: number;
  /** Tiempo de formación completa [min]. */
  tForm: number;
  trigger: 'nivel' | 'tiempo';
  /** Cota del agua del lado del río que dispara la rotura [m] o tiempo de inicio [min]. */
  zTrigger: number;
  tTrigger: number;
}

export type Soil = 'A' | 'B' | 'C' | 'D';
/** Lluvia sobre la malla: lámina total [mm], duración [min] y grupo hidrológico del suelo. */
export interface RainOpts {
  P: number;
  D: number;
  soil: Soil;
}

/** Números de curva (TR-55, condición de humedad II) por cobertura y grupo de suelo. */
export const CN_TABLE: Record<Cover, Record<Soil, number>> = {
  cauce: { A: 100, B: 100, C: 100, D: 100 },
  pasto: { A: 39, B: 61, C: 74, D: 80 },
  cultivo: { A: 67, B: 78, C: 85, D: 89 },
  rastrojo: { A: 43, B: 65, C: 76, D: 82 },
  bosque: { A: 30, B: 55, C: 70, D: 77 },
  via: { A: 98, B: 98, C: 98, D: 98 },
  edificio: { A: 98, B: 98, C: 98, D: 98 },
};
export const CN_SOURCE: Record<Cover, string> = {
  cauce: 'Lámina de agua: toda la lluvia escurre',
  pasto: 'Pastos en buena condición',
  cultivo: 'Cultivos en hileras rectas, buena condición',
  rastrojo: 'Combinación bosque–pasto, condición regular',
  bosque: 'Bosque en buena condición',
  via: 'Calles pavimentadas',
  edificio: 'Techos (impermeable)',
};
/** Retención potencial máxima del SCS [mm]. */
export const scsS = (cn: number) => (cn >= 99.999 ? 0 : 25400 / cn - 254);
/** Lámina de escorrentía acumulada del SCS para una lluvia acumulada P [mm] (abstracción inicial 0,2·S). */
export const scsQ = (P: number, S: number) => (S <= 0 ? Math.max(0, P) : P > 0.2 * S ? ((P - 0.2 * S) * (P - 0.2 * S)) / (P + 0.8 * S) : 0);

/** Hietograma de bloques alternos (bloques de 5 min) con una curva intensidad-duración ilustrativa i = a/(t + 10)^0,75. */
export function hyetograph(P: number, D: number): { t: number[]; cum: number[]; blocks: number[] } {
  const dtb = 5, n = Math.max(1, Math.round(D / dtb));
  const depth = (t: number) => t / Math.pow(t + 10, 0.75);
  const k = P / depth(n * dtb);
  const inc: number[] = [];
  for (let i = 1; i <= n; i++) inc.push(k * (depth(i * dtb) - depth((i - 1) * dtb)));
  inc.sort((a, b) => b - a);
  // el mayor en el centro y los demás alternando a cada lado
  const blocks = new Array<number>(n).fill(0);
  const mid = Math.floor((n - 1) / 2);
  inc.forEach((v, i) => {
    const off = Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1);
    const pos = Math.min(n - 1, Math.max(0, mid + off));
    blocks[blocks[pos] === 0 ? pos : blocks.indexOf(0)] = v;
  });
  const t = [0], cum = [0];
  blocks.forEach((v, i) => {
    t.push((i + 1) * dtb);
    cum.push(cum[i] + v);
  });
  return { t, cum, blocks };
}
const rainAt = (h: { t: number[]; cum: number[] }, tMin: number) => {
  if (tMin <= 0) return 0;
  const n = h.t.length - 1;
  if (tMin >= h.t[n]) return h.cum[n];
  const i = Math.min(n - 1, Math.floor(tMin / 5));
  const w = (tMin - h.t[i]) / (h.t[i + 1] - h.t[i]);
  return h.cum[i] + w * (h.cum[i + 1] - h.cum[i]);
};

/**
 * Vertedero de cresta ancha (SI): Q = C·L·H^1,5, reducido por la sumergencia con la fórmula de Villemonte,
 * (1 − (Hd/Hu)^1,5)^0,385, con Hu y Hd las cargas de aguas arriba y aguas abajo sobre la cresta.
 */
export function weirFlow(eu: number, ed: number, crest: number, C: number, L: number): number {
  const H = eu - crest;
  if (H <= 0) return 0;
  const r = Math.max(0, ed - crest) / H;
  const sub = r < 1 ? Math.pow(1 - Math.pow(r, 1.5), 0.385) : 0;
  return C * L * H * Math.sqrt(H) * sub;
}

// ------------------------------------------------------------------ la superficie que entra al modelo

interface Surface {
  key: string;
  site: string;
  NX: number;
  NY: number;
  px: number;
  z: Float32Array;
  n: Float32Array;
  ridge: Uint8Array | null;
  cover: Uint8Array | null;
}

/** Terreno de 1 m del valle que entra al modelo (con o sin casas) y el n de Manning por píxel. */
export function modelSurface(t: TerrainOpts, r: Roughness, bridge = false): { z: Float32Array; n: Float32Array } {
  const T = truth();
  const base = terrainFor(t).fine;
  const E = COVER_KEYS.indexOf('edificio'), P = COVER_KEYS.indexOf('pasto');
  let z = base;
  if (r.buildings === 'bloque' && t.surf === 'mdt') {
    z = new Float32Array(base);
    // las casas se levantan en el terreno: el agua no entra en ellas (salvo con píxeles gruesos que las diluyen)
    const raised = terrainFor({ ...t, surf: 'mds', burn: false }).fine;
    for (let k = 0; k < z.length; k++) if (T.cover[k] === E) z[k] = Math.max(z[k], t.p === 1 ? T.mds[k] : raised[k]);
  }
  if (bridge) {
    // con el puente como estructura, el terraplén y el tablero los representa la estructura: se quitan del terreno
    if (z === base) z = new Float32Array(base);
    const mdt = t.surf === 'mds' ? terrainFor({ ...t, surf: 'mdt' }).fine : base;
    for (let j = 0; j < VNY; j++)
      for (let i = BRIDGE_LINE - 4; i < ROAD.x + 12; i++) {
        const k = j * VNX + i;
        if (T.road[k]) z[k] = t.p === 1 ? T.bare[k] + (base[k] - T.mdt[k]) : T.bare[k];
        else if (t.surf === 'mds' && Math.abs(T.dist[k]) <= ROAD.open + 2 && i >= ROAD.x - 4 && i < ROAD.x + 4) z[k] = mdt[k];
      }
  }
  const n = new Float32Array(VNX * VNY);
  for (let k = 0; k < n.length; k++) {
    let c = T.cover[k];
    if (c === E && r.buildings !== 'n') c = P;
    n[k] = r.n[COVER_KEYS[c]] * r.mult;
  }
  return { z, n };
}

function surfaceFor(t: TerrainOpts, r: Roughness, site: Site | undefined, bridge: boolean): Surface {
  if (site) {
    const d = DOMAINS.get(site.id);
    if (!d) throw new Error(`No hay un terreno registrado con el nombre ${site.id}.`);
    const n = new Float32Array(d.NX * d.NY).fill(site.n * r.mult);
    return { key: `${site.id}|${site.n}|${r.mult}`, site: site.id, NX: d.NX, NY: d.NY, px: d.px, z: d.z, n, ridge: null, cover: null };
  }
  const { z, n } = modelSurface(t, r, bridge);
  const T = truth();
  return { key: `valle|${t.surf}|${t.p}|${t.method}|${t.sigma}|${t.burn}|${COVER_KEYS.map((c) => r.n[c]).join(',')}|${r.mult}|${r.buildings}|${bridge}`, site: 'valle', NX: VNX, NY: VNY, px: 1, z, n, ridge: T.ridge, cover: T.cover };
}

// ------------------------------------------------------------------ regiones de refinamiento

export const VALLEY_REGIONS: Record<string, string> = {
  cauce: 'El cauce y sus orillas',
  jarillon: 'El jarillón',
  barrio: 'El barrio',
  puente: 'El puente y la vía',
};

function regionFn(S: Surface, region: string): (i: number, j: number) => boolean {
  if (region.startsWith('rect:')) {
    const [x0, y0, x1, y1] = region.slice(5).split(':').map(Number);
    return (i, j) => {
      const x = (i + 0.5) * S.px, y = (j + 0.5) * S.px;
      return x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1);
    };
  }
  if (S.site !== 'valle') return () => false;
  const T = truth();
  const d = (i: number, j: number) => T.dist[j * VNX + i];
  switch (region) {
    case 'cauce':
      return (i, j) => Math.abs(d(i, j)) <= 14;
    case 'jarillon':
      return (i, j) => i >= LEVEE.x0 - 10 && i <= LEVEE.x1 + 10 && Math.abs(d(i, j) - LEVEE.dn) <= 10;
    case 'barrio':
      return (i, j) => i >= 100 && i < 440 && j >= 236 && j < 356 && d(i, j) > LEVEE.dn + 2;
    case 'puente':
      return (i, j) => i >= 400 && i < 490 && Math.abs(d(i, j)) <= 40;
    default:
      return () => false;
  }
}

// ------------------------------------------------------------------ el preprocesador

export interface Geometry {
  key: string;
  site: string;
  NX: number;
  NY: number;
  /** Tamaño del píxel del terreno [m]. */
  px: number;
  /** Lado de las celdas de base [m] y bloques de base en x e y. */
  c: number;
  MX: number;
  MY: number;
  /** Malla sin refinar (todas las celdas del mismo lado). */
  uniform: boolean;
  /** Lado de la celda más pequeña [m]. */
  cmin: number;
  NC: number;
  NF: number;
  /** Las primeras `nInt` caras son interiores (primero las de normal en x, luego en y); después, las de borde. */
  nInt: number;
  /** Celdas: esquina y lado en píxeles; mapa píxel → celda (−1 fuera). */
  cx0: Int32Array;
  cy0: Int32Array;
  cs: Int32Array;
  pmap: Int32Array;
  /** Tablas de las celdas: cotas de sus píxeles ordenadas, sumas acumuladas y área de cada entrada. */
  cOff: Int32Array;
  cCnt: Int32Array;
  cArea: Float32Array;
  zs: Float32Array;
  ps: Float64Array;
  zmin: Float32Array;
  /** Caras: celdas a (oeste o sur) y b (este o norte; en el borde, −1 − número de la línea), orientación (0: normal
   * en x, 1: en y), posición de la línea y tramo en píxeles, distancia entre centros [m], muestras y tablas. */
  fa: Int32Array;
  fb: Int32Array;
  fo: Uint8Array;
  fpos: Int32Array;
  fstart: Int32Array;
  flen: Int32Array;
  fd: Float32Array;
  fOff: Int32Array;
  fz: Float32Array;
  fn: Float32Array;
  fzmin: Float32Array;
  tabA: Float32Array;
  tabK: Float32Array;
  bcs: BcLine[];
  /** Caras de cada línea de borde. */
  bcFaces: number[][];
  /** Vecinas de cada celda por las caras interiores (formato comprimido por filas). */
  adjOff: Int32Array;
  adjCell: Int32Array;
  adjFace: Int32Array;
  /** El terreno con el que se hicieron las tablas, el n por píxel, las crestas y las coberturas. */
  z: Float32Array;
  n: Float32Array;
  ridge: Uint8Array | null;
  cover: Uint8Array | null;
  subgrid: boolean;
  breaklines: boolean;
  ms: number;
}

export interface GeoExtra {
  site?: Site;
  bridge?: boolean;
  bcs?: BcLine[];
}

export const geomKey = (t: TerrainOpts, m: MeshOpts, r: Roughness, x: GeoExtra = {}) =>
  `${x.site ? `${x.site.id}|${x.site.n}` : `${t.surf}|${t.p}|${t.method}|${t.sigma}|${t.burn}|${COVER_KEYS.map((c) => r.n[c]).join(',')}|${r.buildings}`}|${r.mult}|${m.c}|${m.subgrid}|${m.breaklines}|${(m.refine ?? []).map((q) => `${q.region}@${q.c}`).join(';')}|${x.bridge ? 1 : 0}|${JSON.stringify(x.bcs ?? null)}`;

const GCACHE = new Map<string, Geometry>();
/** Guarda una geometría hecha en otro hilo (para no repetir el preprocesador). */
export function adoptGeometry(g: Geometry): void {
  GCACHE.delete(g.key);
  GCACHE.set(g.key, g);
  while (GCACHE.size > 6) GCACHE.delete(GCACHE.keys().next().value as string);
}
export const cachedGeometry = (key: string) => GCACHE.get(key) ?? null;

/** Celdas del árbol cuaternario balanceado (en píxeles) y el mapa píxel → celda. */
function buildCells(S: Surface, m: MeshOpts) {
  const { NX, NY, px } = S;
  const B = Math.max(1, Math.round(m.c / px));
  const MX = Math.ceil(NX / B), MY = Math.ceil(NY / B);
  let want: Uint8Array | null = null;
  for (const r of m.refine ?? []) {
    const target = Math.max(1, Math.round(r.c / px));
    let k = 0;
    while (B >> (k + 1) >= target && B % (1 << (k + 1)) === 0) k++;
    if (k === 0) continue;
    want ??= new Uint8Array(NX * NY);
    const f = regionFn(S, r.region);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (f(i, j) && want[j * NX + i] < k) want[j * NX + i] = k;
  }
  // hojas: esquina, lado y nivel
  let X: number[] = [], Y: number[] = [], Sz: number[] = [], Lv: number[] = [];
  const maxWant = (x0: number, y0: number, s: number) => {
    let v = 0;
    for (let j = y0; j < Math.min(NY, y0 + s); j++) for (let i = x0; i < Math.min(NX, x0 + s); i++) if (want![j * NX + i] > v) v = want![j * NX + i];
    return v;
  };
  const split = (x0: number, y0: number, s: number, lv: number) => {
    if (want && s > 1 && s % 2 === 0 && x0 < NX && y0 < NY && maxWant(x0, y0, s) > lv) {
      const h = s / 2;
      split(x0, y0, h, lv + 1);
      split(x0 + h, y0, h, lv + 1);
      split(x0, y0 + h, h, lv + 1);
      split(x0 + h, y0 + h, h, lv + 1);
      return;
    }
    X.push(x0);
    Y.push(y0);
    Sz.push(s);
    Lv.push(lv);
  };
  for (let J = 0; J < MY; J++) for (let I = 0; I < MX; I++) split(I * B, J * B, B, 0);
  const pmap = new Int32Array(NX * NY);
  const paint = () => {
    for (let l = 0; l < X.length; l++)
      for (let j = Y[l]; j < Math.min(NY, Y[l] + Sz[l]); j++) for (let i = X[l]; i < Math.min(NX, X[l] + Sz[l]); i++) pmap[j * NX + i] = l;
  };
  // balance 2:1: ninguna celda con vecinas de menos de la mitad de su lado
  if (want) {
    for (let pass = 0; pass < 12; pass++) {
      paint();
      const need: boolean[] = new Array(X.length).fill(false);
      let any = false;
      for (let l = 0; l < X.length; l++) {
        const s = Sz[l];
        if (s < 4) continue;
        const x0 = X[l], y0 = Y[l], x1 = Math.min(NX, x0 + s), y1 = Math.min(NY, y0 + s);
        const check = (i: number, j: number) => {
          if (i < 0 || j < 0 || i >= NX || j >= NY) return;
          if (Sz[pmap[j * NX + i]] < s / 2) need[l] = true;
        };
        for (let j = y0; j < y1 && !need[l]; j++) {
          check(x0 - 1, j);
          check(x1, j);
        }
        for (let i = x0; i < x1 && !need[l]; i++) {
          check(i, y0 - 1);
          check(i, y1);
        }
        if (need[l]) any = true;
      }
      if (!any) break;
      const X2: number[] = [], Y2: number[] = [], S2: number[] = [], L2: number[] = [];
      for (let l = 0; l < X.length; l++) {
        if (!need[l]) {
          X2.push(X[l]);
          Y2.push(Y[l]);
          S2.push(Sz[l]);
          L2.push(Lv[l]);
          continue;
        }
        const h = Sz[l] / 2;
        for (const [dx, dy] of [
          [0, 0],
          [h, 0],
          [0, h],
          [h, h],
        ]) {
          if (X[l] + dx >= NX || Y[l] + dy >= NY) continue;
          X2.push(X[l] + dx);
          Y2.push(Y[l] + dy);
          S2.push(h);
          L2.push(Lv[l] + 1);
        }
      }
      X = X2;
      Y = Y2;
      Sz = S2;
      Lv = L2;
    }
  }
  // celdas activas: con al menos un píxel con dato
  const keep: number[] = [];
  for (let l = 0; l < X.length; l++) {
    let ok = false;
    for (let j = Y[l]; j < Math.min(NY, Y[l] + Sz[l]) && !ok; j++) for (let i = X[l]; i < Math.min(NX, X[l] + Sz[l]); i++) if (!Number.isNaN(S.z[j * NX + i])) ok = true;
    if (ok) keep.push(l);
  }
  const NC = keep.length;
  const cx0 = new Int32Array(NC), cy0 = new Int32Array(NC), cs = new Int32Array(NC);
  keep.forEach((l, c) => {
    cx0[c] = X[l];
    cy0[c] = Y[l];
    cs[c] = Sz[l];
  });
  pmap.fill(-1);
  for (let c = 0; c < NC; c++) for (let j = cy0[c]; j < Math.min(NY, cy0[c] + cs[c]); j++) for (let i = cx0[c]; i < Math.min(NX, cx0[c] + cs[c]); i++) pmap[j * NX + i] = c;
  return { B, MX, MY, NC, cx0, cy0, cs, pmap, uniform: !want };
}

/** Rehace la tabla cota-volumen de una celda (al construir la malla o al cambiar el terreno). */
function cellTable(g: Geometry, ci: number): void {
  const { NX, NY } = g;
  const off = g.cOff[ci], po = off + ci;
  const vals: number[] = [];
  for (let j = g.cy0[ci]; j < Math.min(NY, g.cy0[ci] + g.cs[ci]); j++)
    for (let i = g.cx0[ci]; i < Math.min(NX, g.cx0[ci] + g.cs[ci]); i++) {
      const v = g.z[j * NX + i];
      if (!Number.isNaN(v)) vals.push(v);
    }
  if (g.subgrid) {
    vals.sort((a, b) => a - b);
    for (let k = 0; k < vals.length; k++) g.zs[off + k] = vals[k];
  } else {
    let s = 0;
    for (const v of vals) s += v;
    g.zs[off] = s / vals.length;
  }
  const m = g.cCnt[ci];
  g.ps[po] = 0;
  for (let k = 0; k < m; k++) g.ps[po + k + 1] = g.ps[po + k] + g.zs[off + k];
  g.zmin[ci] = g.zs[off];
}

/** Muestras del terreno y de n a lo largo de una cara (una por píxel) y sus tablas A(η) y K(η). */
function faceTable(g: Geometry, f: number): void {
  const { NX, NY, px } = g;
  const o = g.fo[f], pos = g.fpos[f], st = g.fstart[f], len = g.flen[f], off = g.fOff[f], a = g.fa[f], b = g.fb[f];
  const z = g.z, n = g.n, R = g.breaklines ? g.ridge : null;
  const num = (v: number) => (Number.isNaN(v) ? Infinity : v);
  const ridgeMax = (i0: number, i1: number, j0: number, j1: number) => {
    let v = -Infinity;
    for (let j = Math.max(0, j0); j <= Math.min(NY - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(NX - 1, i1); i++) {
        const k = j * NX + i;
        if (R![k] && z[k] > v) v = z[k];
      }
    return v;
  };
  if (b >= 0) {
    const half = Math.floor(Math.min(g.cs[a], g.cs[b]) / 2);
    for (let k = 0; k < len; k++) {
      let k1: number, k2: number;
      if (o === 0) {
        const j = st + k;
        k1 = j * NX + pos - 1;
        k2 = j * NX + pos;
      } else {
        const i = st + k;
        k1 = (pos - 1) * NX + i;
        k2 = pos * NX + i;
      }
      const z1 = num(z[k1]), z2 = num(z[k2]);
      let zz = z1 >= z2 ? z1 : z2;
      if (R) zz = Math.max(zz, o === 0 ? ridgeMax(pos - half, pos + half - 1, st + k, st + k) : ridgeMax(st + k, st + k, pos - half, pos + half - 1));
      g.fz[off + k] = zz;
      g.fn[off + k] = 0.5 * (n[k1] + n[k2]);
    }
    if (!g.subgrid) {
      const zf = Math.max(g.zs[g.cOff[a]], g.zs[g.cOff[b]]);
      let nn = 0;
      for (let k = 0; k < len; k++) nn += g.fn[off + k];
      for (let k = 0; k < len; k++) {
        g.fz[off + k] = zf;
        g.fn[off + k] = nn / len;
      }
    }
  } else {
    const side = g.bcs[-1 - b].side;
    for (let k = 0; k < len; k++) {
      const kk = side === 'O' ? (st + k) * NX : side === 'E' ? (st + k) * NX + NX - 1 : side === 'S' ? st + k : (NY - 1) * NX + st + k;
      g.fz[off + k] = Number.isNaN(z[kk]) ? Infinity : g.subgrid ? z[kk] : g.zs[g.cOff[a]];
      g.fn[off + k] = n[kk];
    }
  }
  let lo = Infinity;
  for (let k = 0; k < len; k++) lo = Math.min(lo, g.fz[off + k]);
  g.fzmin[f] = lo;
  for (let l = 0; l < L; l++) {
    let A = 0, K = 0;
    if (l > 0 && lo < Infinity) {
      const eta = lo + l * DH;
      for (let k = 0; k < len; k++) {
        const d = eta - g.fz[off + k];
        if (d > 0) {
          A += d;
          K += (d * Math.cbrt(d * d)) / g.fn[off + k];
        }
      }
    }
    g.tabA[f * L + l] = A * px;
    g.tabK[f * L + l] = K * px;
  }
}

/** Preprocesador: malla, tablas de volumen de las celdas y de área y conducción de las caras. */
export function buildGeometry(t: TerrainOpts, m: MeshOpts, r: Roughness, x: GeoExtra = {}): Geometry {
  const key = geomKey(t, m, r, x);
  const hit = GCACHE.get(key);
  if (hit) return hit;
  const t0 = performance.now();
  const S = surfaceFor(t, r, x.site, !!x.bridge);
  const bcs = x.bcs ?? (x.site ? [] : valleyBcs(0.005, 0.005));
  const { NX, NY, px } = S;
  const cells = buildCells(S, m);
  const { NC, cx0, cy0, cs, pmap } = cells;
  // ---- celdas
  const cCnt = new Int32Array(NC), cOff = new Int32Array(NC);
  let tot = 0;
  for (let c = 0; c < NC; c++) {
    let n = 0;
    for (let j = cy0[c]; j < Math.min(NY, cy0[c] + cs[c]); j++) for (let i = cx0[c]; i < Math.min(NX, cx0[c] + cs[c]); i++) if (!Number.isNaN(S.z[j * NX + i])) n++;
    cCnt[c] = m.subgrid ? n : 1;
    cOff[c] = tot;
    tot += cCnt[c];
  }
  const cArea = new Float32Array(NC);
  for (let c = 0; c < NC; c++) {
    let n = 0;
    if (!m.subgrid) for (let j = cy0[c]; j < Math.min(NY, cy0[c] + cs[c]); j++) for (let i = cx0[c]; i < Math.min(NX, cx0[c] + cs[c]); i++) if (!Number.isNaN(S.z[j * NX + i])) n++;
    cArea[c] = m.subgrid ? px * px : n * px * px;
  }
  // ---- caras: primero interiores (x y luego y), después las de borde por línea
  const FA: number[] = [], FB: number[] = [], FO: number[] = [], FP: number[] = [], FS: number[] = [], FL: number[] = [];
  const push = (a: number, b: number, o: number, pos: number, st: number, len: number) => {
    FA.push(a);
    FB.push(b);
    FO.push(o);
    FP.push(pos);
    FS.push(st);
    FL.push(len);
  };
  for (let a = 0; a < NC; a++) {
    const x1 = cx0[a] + cs[a];
    if (x1 >= NX) continue;
    const jEnd = Math.min(NY, cy0[a] + cs[a]);
    let j = cy0[a];
    while (j < jEnd) {
      const b = pmap[j * NX + x1];
      let j2 = j + 1;
      while (j2 < jEnd && pmap[j2 * NX + x1] === b) j2++;
      if (b >= 0) push(a, b, 0, x1, j, j2 - j);
      j = j2;
    }
  }
  for (let a = 0; a < NC; a++) {
    const y1 = cy0[a] + cs[a];
    if (y1 >= NY) continue;
    const iEnd = Math.min(NX, cx0[a] + cs[a]);
    let i = cx0[a];
    while (i < iEnd) {
      const b = pmap[y1 * NX + i];
      let i2 = i + 1;
      while (i2 < iEnd && pmap[y1 * NX + i2] === b) i2++;
      if (b >= 0) push(a, b, 1, y1, i, i2 - i);
      i = i2;
    }
  }
  const nInt = FA.length;
  const bcFaces: number[][] = bcs.map(() => []);
  bcs.forEach((line, li) => {
    const r0 = Math.max(0, Math.floor(line.from / px)), along = line.side === 'O' || line.side === 'E' ? NY : NX;
    const r1 = Math.min(along, Math.ceil(line.to / px));
    for (let a = 0; a < NC; a++) {
      const onSide = line.side === 'O' ? cx0[a] === 0 : line.side === 'E' ? cx0[a] + cs[a] >= NX : line.side === 'S' ? cy0[a] === 0 : cy0[a] + cs[a] >= NY;
      if (!onSide) continue;
      const s0 = line.side === 'O' || line.side === 'E' ? cy0[a] : cx0[a];
      const lo = Math.max(r0, s0), hi = Math.min(r1, s0 + cs[a], along);
      if (hi <= lo) continue;
      bcFaces[li].push(FA.length);
      push(a, -1 - li, line.side === 'O' || line.side === 'E' ? 0 : 1, line.side === 'O' ? 0 : line.side === 'E' ? NX : line.side === 'S' ? 0 : NY, lo, hi - lo);
    }
  });
  const NF = FA.length;
  const fOff = new Int32Array(NF + 1);
  for (let f = 0; f < NF; f++) fOff[f + 1] = fOff[f] + FL[f];
  const fd = new Float32Array(NF);
  for (let f = 0; f < NF; f++) fd[f] = FB[f] >= 0 ? ((cs[FA[f]] + cs[FB[f]]) / 2) * px : (cs[FA[f]] / 2) * px;
  // vecinas por caras interiores
  const deg = new Int32Array(NC + 1);
  for (let f = 0; f < nInt; f++) {
    deg[FA[f] + 1]++;
    deg[FB[f] + 1]++;
  }
  for (let c = 0; c < NC; c++) deg[c + 1] += deg[c];
  const adjCell = new Int32Array(2 * nInt), adjFace = new Int32Array(2 * nInt), fill = deg.slice(0, NC);
  for (let f = 0; f < nInt; f++) {
    const a = FA[f], b = FB[f];
    adjCell[fill[a]] = b;
    adjFace[fill[a]++] = f;
    adjCell[fill[b]] = a;
    adjFace[fill[b]++] = f;
  }
  let cmin = Infinity;
  for (let c = 0; c < NC; c++) cmin = Math.min(cmin, cs[c] * px);
  const g: Geometry = {
    key,
    site: S.site,
    NX,
    NY,
    px,
    c: cells.B * px,
    MX: cells.MX,
    MY: cells.MY,
    uniform: cells.uniform,
    cmin,
    NC,
    NF,
    nInt,
    cx0,
    cy0,
    cs,
    pmap,
    cOff,
    cCnt,
    cArea,
    zs: new Float32Array(tot),
    ps: new Float64Array(tot + NC),
    zmin: new Float32Array(NC),
    fa: Int32Array.from(FA),
    fb: Int32Array.from(FB),
    fo: Uint8Array.from(FO),
    fpos: Int32Array.from(FP),
    fstart: Int32Array.from(FS),
    flen: Int32Array.from(FL),
    fd,
    fOff,
    fz: new Float32Array(fOff[NF]),
    fn: new Float32Array(fOff[NF]),
    fzmin: new Float32Array(NF),
    tabA: new Float32Array(NF * L),
    tabK: new Float32Array(NF * L),
    bcs,
    bcFaces,
    adjOff: deg,
    adjCell,
    adjFace,
    z: S.z,
    n: S.n,
    ridge: S.ridge,
    cover: S.cover,
    subgrid: m.subgrid,
    breaklines: m.breaklines,
    ms: 0,
  };
  for (let c = 0; c < NC; c++) cellTable(g, c);
  for (let f = 0; f < NF; f++) faceTable(g, f);
  g.ms = performance.now() - t0;
  adoptGeometry(g);
  return g;
}

/** La geometría de una corrida. */
export const geometryFor = (o: RunOpts) => buildGeometry(o.terrain, o.mesh, o.rough, { site: o.site, bridge: !!o.bridge, bcs: bcsOf(o) });
export const bcsOf = (o: RunOpts): BcLine[] => o.bcs ?? (o.site ? [] : valleyBcs(o.egSlope, o.outSlope));

/** Copia con su propio terreno y sus tablas (para cambiar el terreno durante la corrida, como en la rotura). */
function cloneGeometry(g: Geometry): Geometry {
  return { ...g, key: `${g.key}|propia`, z: new Float32Array(g.z), zs: new Float32Array(g.zs), ps: new Float64Array(g.ps), zmin: new Float32Array(g.zmin), fz: new Float32Array(g.fz), fn: new Float32Array(g.fn), fzmin: new Float32Array(g.fzmin), tabA: new Float32Array(g.tabA), tabK: new Float32Array(g.tabK) };
}

// ------------------------------------------------------------------ propiedades de celdas y caras

/** Volumen guardado en la celda con el agua a la cota η [m³]. */
export function cellVolume(g: Geometry, ci: number, eta: number): number {
  const off = g.cOff[ci], m = g.cCnt[ci], a = g.cArea[ci], po = off + ci;
  if (eta <= g.zs[off]) return 0;
  let lo = 1, hi = m;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.zs[off + mid - 1] < eta) lo = mid;
    else hi = mid - 1;
  }
  return a * (lo * eta - g.ps[po + lo]);
}

/** Área mojada en planta de la celda a la cota η [m²]. */
export function cellWetArea(g: Geometry, ci: number, eta: number): number {
  const off = g.cOff[ci], m = g.cCnt[ci], a = g.cArea[ci];
  if (eta <= g.zs[off]) return 0;
  let lo = 1, hi = m;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.zs[off + mid - 1] < eta) lo = mid;
    else hi = mid - 1;
  }
  return a * lo;
}

/** Cota del agua que corresponde a un volumen (inversa exacta de la curva cota-volumen). */
export function cellLevel(g: Geometry, ci: number, V: number): number {
  const off = g.cOff[ci], m = g.cCnt[ci], a = g.cArea[ci], po = off + ci;
  if (V <= 0) return g.zs[off];
  let lo = 1, hi = m;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const Vk = a * ((mid - 1) * g.zs[off + mid - 1] - g.ps[po + mid - 1]);
    if (Vk <= V) lo = mid;
    else hi = mid - 1;
  }
  return (V / a + g.ps[po + lo]) / lo;
}

let lastA = 0;
/** Conducción de la cara a la cota η; deja el área en `lastA`. Con las tablas, o directo por encima de ellas. */
function faceK(g: Geometry, f: number, eta: number): number {
  const s = (eta - g.fzmin[f]) / DH;
  if (!(s > 0)) {
    lastA = 0;
    return 0;
  }
  if (s < L - 1) {
    const l = Math.floor(s), w = s - l, b = f * L + l;
    lastA = g.tabA[b] + w * (g.tabA[b + 1] - g.tabA[b]);
    return g.tabK[b] + w * (g.tabK[b + 1] - g.tabK[b]);
  }
  const off = g.fOff[f], len = g.flen[f];
  let A = 0, K = 0;
  for (let k = 0; k < len; k++) {
    const d = eta - g.fz[off + k];
    if (d > 0) {
      A += d;
      K += (d * Math.cbrt(d * d)) / g.fn[off + k];
    }
  }
  lastA = A * g.px;
  return K * g.px;
}
export function faceProps(g: Geometry, f: number, eta: number): { A: number; K: number } {
  const K = faceK(g, f, eta);
  return { A: lastA, K };
}

/** Índice de la celda que contiene el punto (x, y) [m] (−1 fuera del dominio). */
export function cellAt(g: Geometry, x: number, y: number): number {
  const i = Math.min(g.NX - 1, Math.max(0, Math.floor(x / g.px))), j = Math.min(g.NY - 1, Math.max(0, Math.floor(y / g.px)));
  return g.pmap[j * g.NX + i];
}
/** Centro de una celda [m]. */
export const cellCenter = (g: Geometry, ci: number): [number, number] => [(g.cx0[ci] + g.cs[ci] / 2) * g.px, (g.cy0[ci] + g.cs[ci] / 2) * g.px];
/** Lado de una celda [m]. */
export const cellSize = (g: Geometry, ci: number) => g.cs[ci] * g.px;
/** Caras de una celda con el lado donde están (O, E, S o N). */
export function cellFaces(g: Geometry, ci: number): { f: number; side: Side }[] {
  const out: { f: number; side: Side }[] = [];
  for (let f = 0; f < g.NF; f++) {
    if (g.fa[f] === ci) out.push({ f, side: g.fb[f] >= 0 ? (g.fo[f] === 0 ? 'E' : 'N') : g.bcs[-1 - g.fb[f]].side });
    else if (g.fb[f] === ci) out.push({ f, side: g.fo[f] === 0 ? 'O' : 'S' });
  }
  return out;
}
/** Cota del terreno en el punto (x, y) [m]. */
export const groundAt = (g: Geometry, x: number, y: number) => g.z[Math.min(g.NY - 1, Math.max(0, Math.floor(y / g.px))) * g.NX + Math.min(g.NX - 1, Math.max(0, Math.floor(x / g.px)))];

// ------------------------------------------------------------------ hidrograma de entrada

export interface Hydro {
  /** Caudal pico [m³/s], tiempo al pico [min] y caudal base [m³/s]. */
  Qp: number;
  tp: number;
  Qb: number;
}
/** Hidrograma con forma gamma (aproximación al hidrograma unitario adimensional del SCS, m = 3,7). */
export function hydroQ(h: Hydro, tSec: number): number {
  if (tSec <= 0) return h.Qb;
  const r = tSec / (h.tp * 60);
  return h.Qb + (h.Qp - h.Qb) * Math.pow(r * Math.exp(1 - r), 3.7);
}

// ------------------------------------------------------------------ la corrida

export interface RunOpts {
  terrain: TerrainOpts;
  mesh: MeshOpts;
  rough: Roughness;
  eq: Eq;
  /** Paso de tiempo: fijo o ajustado por el número de Courant. */
  dtMode: 'fijo' | 'courant';
  dt: number;
  courantMax: number;
  theta: number;
  /** Tolerancia del nivel [m] e iteraciones máximas (onda difusiva). */
  tolWS: number;
  maxIter: number;
  hydro: Hydro;
  /** Pendiente de energía para repartir el caudal en la línea de entrada y pendiente de fricción a la salida. */
  egSlope: number;
  outSlope: number;
  /** Tiempo de condiciones iniciales con el caudal base y duración del evento [min]. */
  warmup: number;
  duration: number;
  /** Intervalo de salida de mapas [s]. */
  outEvery: number;
  /** Terreno propio (si no, el valle). */
  site?: Site;
  /** Líneas de borde (si no, las del valle: entrada al oeste y salida al este). */
  bcs?: BcLine[];
  /** El puente como estructura (coeficientes). */
  bridge?: BridgeOpts | null;
  breach?: BreachOpts | null;
  rain?: RainOpts | null;
  /** Agua inicial a la cota `eta` en las celdas con centro en x < `x1` (para la rotura de presa). */
  initWS?: { x1: number; eta: number } | null;
  /** «todo»: mapas en cada salida; «max»: solo máximos y series (ensambles y calibración). */
  store?: 'todo' | 'max';
}

export interface Series {
  t: number[];
  qin: number[];
  qout: number[];
  qBridge: number[];
  wseBridge: number[];
  depthSchool: number[];
  vol: number[];
  qBreach: number[];
  /** Lluvia y escorrentía acumuladas [mm]. */
  rain: number[];
  excess: number[];
}

export interface RunResult {
  geom: Geometry;
  opts: RunOpts;
  frames: Float32Array[];
  /** Velocidades de las celdas y caudales de las caras en cada salida. */
  uFrames: Float32Array[];
  vFrames: Float32Array[];
  qFrames: Float32Array[];
  frameT: number[];
  etaMax: Float32Array;
  vMax: Float32Array;
  /** Cota y velocidad en el instante del mayor producto profundidad × velocidad de cada celda. */
  etaDV: Float32Array;
  vDV: Float32Array;
  ux: Float32Array;
  uy: Float32Array;
  /** Diagnóstico: Courant máximo de cada celda, mayor cambio de nivel en la última iteración y pasos sin converger. */
  courantCell: Float32Array;
  iterErr: Float32Array;
  nonconvCell: Uint16Array;
  series: Series;
  vol: { init: number; vin: number; vout: number; rain: number; infil: number; end: number; err: number; errPct: number; clipped: number };
  breach: { t0: number | null; full: number | null; zCrest: number; zBottom: number } | null;
  steps: number;
  iters: { total: number; max: number; nonconv: number; maxErr: number };
  courantMax: number;
  dtMin: number;
  dtMax: number;
  ms: number;
  unstable: { t: number; why: string } | null;
  log: string[];
}

export type RunStatus = 'preproceso' | 'corriendo' | 'listo' | 'inestable';

/** Datos de una muestra de la estructura del puente. */
interface StructSample {
  deck: boolean;
  crest: number;
  floor: number;
  low: number;
  n: number;
}

/** Una corrida que avanza a ratos (para no congelar la página) y guarda mapas, series y el balance de volumen. */
export class Run {
  readonly o: RunOpts;
  g!: Geometry;
  status: RunStatus = 'preproceso';
  t: number;
  private tEnd: number;
  private eta!: Float64Array;
  private V!: Float64Array;
  private Q!: Float64Array;
  private beta!: Float64Array;
  private betaN!: Float64Array;
  private bc!: Float64Array;
  private dt: number;
  private nextOut: number;
  /** Volumen que sale y tiempo desde el último dato de las series: el caudal de salida es el medio del intervalo. */
  private outAcc = 0;
  private outT = 0;
  private belowCount = 0;
  private inFaces: number[] = [];
  private outFaces: number[] = [];
  private outS!: Float64Array;
  private bridgeFaces: number[] = [];
  private isStruct!: Uint8Array;
  private sData = new Map<number, StructSample[]>();
  private Qo!: Float64Array;
  private Qw!: Float64Array;
  /** Coeficiente de pérdida local del flujo libre por la luz: (Cc + Ce)·(1 − (A_luz/A_sin vía)²). */
  private kLoss = 0;
  private cBridge = -1;
  private cSchool = -1;
  private zSchool = 0;
  private clock = 0;
  private chunk0 = 0;
  private etaIn = NaN;
  private lastDt = 0;
  private qinNow = 0;
  private qrainNow = 0;
  res!: RunResult;
  // solucionador lineal
  private D!: Float64Array;
  private W!: Float64Array;
  private rhs!: Float64Array;
  private x!: Float64Array;
  private r!: Float64Array;
  private zv!: Float64Array;
  private p!: Float64Array;
  private Ap!: Float64Array;
  private Pc!: Float64Array;
  private cgP!: Float64Array;
  private ek!: Float64Array;
  private etaOld!: Float64Array;
  private Sd!: Float64Array;
  private etaN!: Float64Array;
  private expl!: Float64Array;
  private fA!: Float64Array;
  private fK!: Float64Array;
  private dEta!: Float32Array;
  private osc!: Uint8Array;
  private bigV!: Float64Array;
  // aguas someras completas
  private adv!: Float64Array;
  private uF!: Float64Array;
  private qNow!: Float64Array;
  private cq!: Float64Array[];
  // rotura
  private br: { ks: Int32Array; us: Float32Array; gs: Float32Array; z0: Float32Array; Zc: number; Hb: number; cells: number[]; faces: number[]; ref: number; t0: number | null; p: number; across: { f: number; s: number }[] } | null = null;
  // lluvia
  private rain: { h: { t: number[]; cum: number[] }; off: Int32Array; S: Float32Array; A: Float32Array; last: Float64Array; area: number; excess: number } | null = null;

  constructor(o: RunOpts) {
    this.o = o;
    this.t = -o.warmup * 60;
    this.tEnd = o.duration * 60;
    this.dt = o.dt;
    this.nextOut = 0;
  }

  get progress(): number {
    const t0 = -this.o.warmup * 60;
    return Math.max(0, Math.min(1, (this.t - t0) / (this.tEnd - t0)));
  }

  private setup(): void {
    const o = this.o;
    let g = geometryFor(o);
    if (o.breach && g.site === 'valle') g = cloneGeometry(g);
    this.g = g;
    const NC = g.NC, NF = g.NF;
    this.eta = new Float64Array(NC);
    this.V = new Float64Array(NC);
    for (let i = 0; i < NC; i++) this.eta[i] = g.zmin[i];
    if (o.initWS) {
      for (let i = 0; i < NC; i++) {
        if (cellCenter(g, i)[0] < o.initWS.x1 && o.initWS.eta > g.zmin[i]) {
          this.eta[i] = o.initWS.eta;
          this.V[i] = cellVolume(g, i, o.initWS.eta);
        }
      }
    }
    for (const k of ['Q', 'beta', 'betaN', 'fA', 'fK', 'adv', 'uF', 'qNow', 'Qo', 'Qw', 'outS'] as const) this[k] = new Float64Array(NF);
    this.isStruct = new Uint8Array(NF);
    this.bc = new Float64Array(NC);
    this.dEta = new Float32Array(NC);
    this.osc = new Uint8Array(NC);
    this.bigV = new Float64Array(NC);
    for (let i = 0; i < NC; i++) this.bigV[i] = 0.1 * (g.cs[i] * g.px) ** 2;
    g.bcs.forEach((line, li) => {
      for (const f of g.bcFaces[li]) {
        if (line.kind === 'caudal') this.inFaces.push(f);
        else {
          this.outFaces.push(f);
          this.outS[f] = Math.sqrt(line.slope);
        }
      }
    });
    for (let f = 0; f < g.nInt; f++) if (g.fo[f] === 0 && g.fpos[f] * g.px === BRIDGE_LINE && g.site === 'valle') this.bridgeFaces.push(f);
    if (g.site === 'valle') {
      this.cBridge = cellAt(g, POIS.puente.x, POIS.puente.y);
      this.cSchool = cellAt(g, POIS.escuela.x, POIS.escuela.y);
      this.zSchool = g.z[Math.floor(POIS.escuela.y) * g.NX + Math.floor(POIS.escuela.x)];
    }
    for (const k of ['D', 'W', 'rhs', 'x', 'r', 'zv', 'p', 'Ap', 'Pc', 'cgP', 'ek', 'Sd', 'etaN', 'expl', 'etaOld'] as const) this[k] = new Float64Array(NC);
    this.W = new Float64Array(NF);
    this.cq = Array.from({ length: 16 }, () => new Float64Array(NC));
    this.res = {
      geom: g,
      opts: o,
      frames: [],
      uFrames: [],
      vFrames: [],
      qFrames: [],
      frameT: [],
      etaMax: new Float32Array(NC).fill(-Infinity),
      vMax: new Float32Array(NC),
      etaDV: new Float32Array(g.zmin),
      vDV: new Float32Array(NC),
      ux: new Float32Array(NC),
      uy: new Float32Array(NC),
      courantCell: new Float32Array(NC),
      iterErr: new Float32Array(NC),
      nonconvCell: new Uint16Array(NC),
      series: { t: [], qin: [], qout: [], qBridge: [], wseBridge: [], depthSchool: [], vol: [], qBreach: [], rain: [], excess: [] },
      vol: { init: 0, vin: 0, vout: 0, rain: 0, infil: 0, end: 0, err: 0, errPct: 0, clipped: 0 },
      breach: null,
      steps: 0,
      iters: { total: 0, max: 0, nonconv: 0, maxErr: 0 },
      courantMax: 0,
      dtMin: Infinity,
      dtMax: 0,
      ms: 0,
      unstable: null,
      log: [],
    };
    const r = this.res;
    const sizes = new Set<number>();
    for (let i = 0; i < NC; i++) sizes.add(g.cs[i] * g.px);
    const sz = [...sizes].sort((a, b) => b - a).join(', ');
    r.log.push(`Preprocesador: ${g.NC.toLocaleString('es-CO')} celdas de ${sz} m, ${g.NF.toLocaleString('es-CO')} caras, ${(g.NF * L).toLocaleString('es-CO')} puntos de tablas, ${g.ms.toFixed(0)} ms.`);
    if (o.bridge && g.site === 'valle') this.setupBridge();
    if (o.breach && g.site === 'valle') this.setupBreach();
    if (o.rain) this.setupRain();
    if (o.warmup <= 0) for (let i = 0; i < NC; i++) r.vol.init += this.V[i];
    if (o.warmup > 0) r.log.push(`Condiciones iniciales: ${o.warmup} min con el caudal base de ${o.hydro.Qb} m³/s desde el cauce seco.`);
    this.status = 'corriendo';
  }

  // ---------------------------------------------------------------- el puente como estructura

  private setupBridge(): void {
    const g = this.g, T = truth();
    const nC = this.o.rough.n.cauce * this.o.rough.mult;
    for (const f of this.bridgeFaces) {
      this.isStruct[f] = 1;
      const list: StructSample[] = [];
      for (let k = 0; k < g.flen[f]; k++) {
        const j = g.fstart[f] + k;
        const deck = Math.abs(dn(ROAD.x + 0.5, j + 0.5)) <= ROAD.open + 2;
        let crest = -Infinity;
        for (let i = Math.floor(ROAD.x - ROAD.half); i <= Math.ceil(ROAD.x + ROAD.half); i++) crest = Math.max(crest, T.mdt[j * VNX + i]);
        const floor = g.z[j * VNX + Math.floor(ROAD.x)];
        list.push(deck ? { deck: true, crest: ROAD_Z, floor, low: Math.max(floor, Math.min(ROAD_Z - 0.3, this.o.bridge!.low)), n: nC } : { deck: false, crest: Math.max(crest, floor), floor, low: floor, n: nC });
      }
      this.sData.set(f, list);
    }
    const b = this.o.bridge!;
    this.res.log.push(`Puente como estructura en x = ${BRIDGE_LINE} m: ${this.bridgeFaces.length} caras con flujo bajo el tablero (libre o a presión) y vertedero sobre el tablero y la vía; cara inferior del tablero a ${b.low.toFixed(2)} m${b.block > 0 ? `, ${Math.round(b.block * 100)} % de la luz tapada` : ''}.`);
  }

  /** Área y conducción de la luz del puente (bajo el tablero) con el agua a la cota η. */
  private openAK(f: number, eta: number): [number, number] {
    let A = 0, K = 0;
    const px = this.g.px * (1 - (this.o.bridge?.block ?? 0));
    for (const s of this.sData.get(f)!) {
      if (!s.deck) continue;
      const d = Math.min(eta, s.low) - s.floor;
      if (d <= 0) continue;
      A += d * px;
      K += (px * d * Math.cbrt(d * d)) / s.n;
    }
    return [A, K];
  }

  /** Caudal a presión por la luz (compuerta si solo toca aguas arriba; orificio si está sumergida) [m³/s]. */
  private pressureQ(f: number, eu: number, ed: number): number {
    const bo = this.o.bridge!;
    let A = 0, zc = 0, low = -Infinity;
    for (const s of this.sData.get(f)!) {
      if (!s.deck || s.low <= s.floor) continue;
      const a = (s.low - s.floor) * this.g.px * (1 - bo.block);
      A += a;
      zc += a * 0.5 * (s.low + s.floor);
      low = Math.max(low, s.low);
    }
    if (A <= 0) return 0;
    zc /= A;
    if (ed >= low) return bo.cOrifice * A * Math.sqrt(2 * G * Math.max(0, eu - ed));
    return bo.cSluice * A * Math.sqrt(2 * G * Math.max(0, eu - Math.max(zc, ed)));
  }

  /** Caudal sobre el tablero y la vía como vertedero de cresta ancha con la sumergencia de Villemonte [m³/s]. */
  private weirQ(f: number, eu: number, ed: number): number {
    const bo = this.o.bridge!, px = this.g.px;
    let q = 0;
    for (const s of this.sData.get(f)!) q += weirFlow(eu, ed, s.crest, s.deck ? bo.cwDeck : bo.cwRoad, px);
    return q;
  }

  /** Pérdida local del puente: compara el área de la luz con la que tendría la sección sin la vía, al nivel de aguas arriba. */
  private updateLoss(): void {
    if (!this.sData.size) return;
    const b = this.o.bridge!, g = this.g;
    let eu = -Infinity;
    for (const f of this.bridgeFaces) eu = Math.max(eu, this.eta[g.fa[f]], this.eta[g.fb[f]]);
    let Ao = 0, Ab = 0;
    for (const f of this.bridgeFaces) {
      Ao += this.openAK(f, eu)[0];
      for (const s of this.sData.get(f)!) Ab += Math.max(0, eu - s.floor) * g.px;
    }
    const r = Ab > 0 ? Math.min(1, Ao / Ab) : 1;
    this.kLoss = (b.cc + b.ce) * Math.max(0, 1 - r * r);
  }

  /** Mezcla de flujo libre y a presión cerca de la cara inferior del tablero (±5 cm). */
  private pressureWeight(f: number, eu: number): number {
    let low = Infinity;
    for (const s of this.sData.get(f)!) if (s.deck && s.low > s.floor) low = Math.min(low, s.low);
    if (!Number.isFinite(low)) return 0;
    return Math.min(1, Math.max(0, (eu - (low - 0.05)) / 0.1));
  }

  // ---------------------------------------------------------------- la rotura del jarillón

  private setupBreach(): void {
    const g = this.g, b = this.o.breach!;
    const reach = b.width / 2 + (LEVEE.H + 1.5) * b.slope + 3;
    const ks: number[] = [], us: number[] = [], gs: number[] = [], z0: number[] = [];
    let Zc = -Infinity, Zg = Infinity;
    for (let j = 0; j < g.NY; j++)
      for (let i = Math.max(0, Math.floor(b.x - reach)); i <= Math.min(g.NX - 1, Math.ceil(b.x + reach)); i++) {
        const x = i + 0.5, y = j + 0.5, lev = leveeHeight(x, y);
        if (lev <= 0.01) continue;
        const k = j * g.NX + i, u = Math.abs(x - b.x);
        ks.push(k);
        us.push(u);
        gs.push(g.z[k] - lev);
        z0.push(g.z[k]);
        if (u < 2) {
          Zc = Math.max(Zc, g.z[k]);
          Zg = Math.min(Zg, g.z[k] - lev);
        }
      }
    const cellSet = new Set<number>();
    for (const k of ks) cellSet.add(g.pmap[k]);
    const cells = [...cellSet].filter((c) => c >= 0);
    const faceSet = new Set<number>();
    for (let f = 0; f < g.NF; f++) if (cellSet.has(g.fa[f]) || (g.fb[f] >= 0 && cellSet.has(g.fb[f]))) faceSet.add(f);
    // caras que cruzan el jarillón cerca de la rotura: de una celda del lado del río a una del barrio
    const T = truth();
    const side = (c: number) => {
      const [x, y] = cellCenter(g, c);
      return T.dist[Math.min(g.NY - 1, Math.floor(y)) * g.NX + Math.min(g.NX - 1, Math.floor(x))] > LEVEE.dn ? 1 : 0;
    };
    const across: { f: number; s: number }[] = [];
    for (let f = 0; f < g.nInt; f++) {
      const a = g.fa[f], c = g.fb[f];
      const [xa] = cellCenter(g, a);
      if (Math.abs(xa - b.x) > reach + 25) continue;
      const sa = side(a), sb = side(c);
      if (sa !== sb) across.push({ f, s: sa === 0 ? 1 : -1 });
    }
    const ref = cellAt(g, b.x, yc(b.x) + 9);
    this.br = { ks: Int32Array.from(ks), us: Float32Array.from(us), gs: Float32Array.from(gs), z0: Float32Array.from(z0), Zc, Hb: Zc - (Zg + b.bottom), cells, faces: [...faceSet], ref, t0: null, p: 0, across };
    this.res.breach = { t0: null, full: null, zCrest: Zc, zBottom: Zg + b.bottom };
    this.res.log.push(`Rotura del jarillón en x = ${b.x} m: ancho final ${b.width} m, taludes ${b.slope}H:1V, formación en ${b.tForm} min; ${b.trigger === 'nivel' ? `se dispara cuando el agua del lado del río pasa la cota ${b.zTrigger.toFixed(2)} m` : `empieza en t = ${b.tTrigger} min`}.`);
  }

  /** Avanza la rotura y rehace las tablas de las celdas y caras afectadas (conservando el volumen de cada celda). */
  private updateBreach(): void {
    const br = this.br!, b = this.o.breach!, g = this.g;
    if (br.p >= 1) return;
    if (br.t0 === null) {
      const go = b.trigger === 'tiempo' ? this.t >= b.tTrigger * 60 : this.t >= 0 && this.eta[br.ref] >= b.zTrigger;
      if (!go) return;
      br.t0 = this.t;
      this.res.breach!.t0 = this.t;
      this.res.log.push(`La rotura empieza en t = ${(this.t / 60).toFixed(1)} min (nivel del lado del río ${this.eta[br.ref].toFixed(2)} m).`);
    }
    const p = Math.min(1, (this.t - br.t0) / Math.max(1, b.tForm * 60));
    if (p < 1 && p - br.p < 0.02) return;
    br.p = p;
    const gmax = Math.max(b.width, br.Hb), gc = p * gmax;
    const dcur = Math.min(br.Hb, gc), bcur = Math.min(b.width, gc);
    for (let q = 0; q < br.ks.length; q++) {
      const u = br.us[q];
      const low = u <= bcur / 2 ? dcur : Math.max(0, dcur - (u - bcur / 2) / Math.max(0.01, b.slope));
      const Zb = br.Zc - low;
      g.z[br.ks[q]] = Math.max(br.gs[q] + b.bottom, Math.min(br.z0[q], Zb));
    }
    for (const c of br.cells) cellTable(g, c);
    for (const f of br.faces) faceTable(g, f);
    for (const c of br.cells) {
      this.eta[c] = cellLevel(g, c, this.V[c]);
      this.etaOld[c] = this.eta[c];
    }
    if (p >= 1) {
      this.res.breach!.full = this.t;
      this.res.log.push(`La rotura queda completa en t = ${(this.t / 60).toFixed(1)} min.`);
    }
  }

  // ---------------------------------------------------------------- la lluvia sobre la malla

  private setupRain(): void {
    const g = this.g, R = this.o.rain!;
    const h = hyetograph(R.P, R.D);
    const off = new Int32Array(g.NC + 1);
    const S: number[] = [], A: number[] = [];
    let area = 0;
    for (let c = 0; c < g.NC; c++) {
      const count = new Map<number, number>();
      for (let j = g.cy0[c]; j < Math.min(g.NY, g.cy0[c] + g.cs[c]); j++)
        for (let i = g.cx0[c]; i < Math.min(g.NX, g.cx0[c] + g.cs[c]); i++) {
          const k = j * g.NX + i;
          if (Number.isNaN(g.z[k])) continue;
          const cn = this.o.site ? this.o.site.cn : CN_TABLE[COVER_KEYS[g.cover![k]]][R.soil];
          count.set(cn, (count.get(cn) ?? 0) + 1);
        }
      for (const [cn, n] of count) {
        S.push(scsS(cn));
        A.push(n * g.px * g.px);
        area += n * g.px * g.px;
      }
      off[c + 1] = S.length;
    }
    this.rain = { h, off, S: Float32Array.from(S), A: Float32Array.from(A), last: new Float64Array(g.NC), area, excess: 0 };
    this.res.log.push(`Lluvia sobre la malla: ${R.P} mm en ${R.D} min (bloques alternos de 5 min), pérdidas con el número de curva del SCS, suelo del grupo ${R.soil}.`);
  }

  /** Suma a `bc` la escorrentía de la lluvia entre t y t + Δt [m³/s] y devuelve el total. */
  private rainSource(t0: number, dt: number): number {
    const rn = this.rain;
    if (!rn) return 0;
    const P1 = rainAt(rn.h, (t0 + dt) / 60);
    if (t0 + dt <= 0) return 0;
    let tot = 0;
    for (let c = 0; c < this.g.NC; c++) {
      let v = 0;
      for (let q = rn.off[c]; q < rn.off[c + 1]; q++) v += (rn.A[q] * scsQ(P1, rn.S[q])) / 1000;
      const dv = v - rn.last[c];
      rn.last[c] = v;
      if (dv > 0) {
        this.bc[c] += dv / dt;
        tot += dv;
      }
    }
    rn.excess += tot;
    return tot / dt;
  }

  // ---------------------------------------------------------------- bordes

  /** Reparte el caudal de entrada en las líneas de caudal: profundidad normal con la pendiente de energía y conducción. */
  private inflow(Qin: number): number {
    const g = this.g;
    if (!this.inFaces.length) return NaN;
    const S = Math.sqrt(g.bcs[-1 - g.fb[this.inFaces[0]]].slope);
    const total = (eta: number) => {
      let s = 0;
      for (const f of this.inFaces) s += faceK(g, f, eta);
      return s * S;
    };
    let lo: number, hi: number;
    if (Number.isFinite(this.etaIn)) {
      lo = this.etaIn - 0.25;
      hi = this.etaIn + 0.25;
      while (total(lo) > Qin && lo > this.etaIn - 20) lo -= 1;
      while (total(hi) < Qin && hi < this.etaIn + 20) hi += 1;
    } else {
      lo = Infinity;
      hi = -Infinity;
      for (const f of this.inFaces) {
        if (!Number.isFinite(g.fzmin[f])) continue;
        lo = Math.min(lo, g.fzmin[f]);
        hi = Math.max(hi, g.fzmin[f]);
      }
      hi += 12;
    }
    for (let k = 0; k < 26; k++) {
      const mid = 0.5 * (lo + hi);
      if (total(mid) < Qin) lo = mid;
      else hi = mid;
    }
    const eta = (this.etaIn = 0.5 * (lo + hi));
    const tot = total(eta);
    for (const f of this.inFaces) {
      const K = faceK(g, f, eta);
      const q = tot > 0 ? (K * S * Qin) / tot : 0;
      this.fA[f] = lastA;
      this.bc[g.fa[f]] += q;
      this.Q[f] = q;
    }
    return eta;
  }

  private oscillating(): boolean {
    let n = 0;
    for (let i = 0; i < this.g.NC; i++) if (this.osc[i] >= 3) n++;
    return n >= 3;
  }

  /** Avanza la corrida durante `budgetMs` milisegundos; devuelve true al terminar. */
  advance(budgetMs = 12): boolean {
    if (this.status === 'listo' || this.status === 'inestable') return true;
    const t0 = performance.now();
    this.chunk0 = t0;
    if (this.status === 'preproceso') {
      this.setup();
      this.clock += performance.now() - t0;
      return false;
    }
    while (performance.now() - t0 < budgetMs) {
      if (this.t >= this.tEnd - 1e-9) {
        this.finish();
        break;
      }
      const ok = this.o.eq === 'difusiva' ? this.stepDW() : this.stepExplicit(this.o.eq === 'swe');
      if (!ok) break;
    }
    this.clock += performance.now() - t0;
    const st = this.status as RunStatus;
    return st === 'listo' || st === 'inestable';
  }

  /** Corre todo de una vez (pruebas y tablas). */
  runAll(): RunResult {
    while (!this.advance(1e9));
    return this.res;
  }

  /** Último mapa de niveles (para mostrar el agua mientras se calcula). */
  snapshot(): Float32Array {
    return Float32Array.from(this.eta);
  }

  private record(dt: number, Cdt: (f: number, v: number, A: number) => number): void {
    const g = this.g, r = this.res, t = this.t;
    r.steps++;
    r.dtMin = Math.min(r.dtMin, dt);
    r.dtMax = Math.max(r.dtMax, dt);
    const ux = r.ux, uy = r.uy, px = g.px;
    ux.fill(0);
    uy.fill(0);
    for (let f = 0; f < g.NF; f++) {
      const q = this.Q[f];
      if (q === 0) continue;
      const a = g.fa[f], b = g.fb[f];
      const A = this.fA[f];
      // con láminas de menos de 2 cm en promedio la velocidad no se puede leer bien: no cuenta
      if (A < 0.02 * g.flen[f] * px) continue;
      let v = q / A;
      if (b < 0) {
        const line = g.bcs[-1 - b];
        const sgn = line.kind === 'caudal' ? (line.side === 'O' || line.side === 'S' ? 1 : -1) : line.side === 'E' || line.side === 'N' ? 1 : -1;
        v *= sgn;
      }
      const wa = (0.5 * g.flen[f]) / g.cs[a];
      if (g.fo[f] === 0) ux[a] += v * wa;
      else uy[a] += v * wa;
      if (b >= 0) {
        const wb = (0.5 * g.flen[f]) / g.cs[b];
        if (g.fo[f] === 0) ux[b] += v * wb;
        else uy[b] += v * wb;
      }
      if (t > 0 && b >= 0 && A >= 0.05 * g.flen[f] * px) {
        const C = Cdt(f, Math.abs(q / A), A);
        if (C > r.courantCell[a]) r.courantCell[a] = C;
        if (b >= 0 && C > r.courantCell[b]) r.courantCell[b] = C;
      }
    }
    if (t <= 0) return;
    for (let i = 0; i < g.NC; i++) {
      const e = this.eta[i];
      const d = e - g.zmin[i];
      if (e > r.etaMax[i]) r.etaMax[i] = e;
      if (d < 0.01) continue;
      const v = Math.hypot(ux[i], uy[i]);
      if (v > r.vMax[i]) r.vMax[i] = v;
      if (v * d > r.vDV[i] * (r.etaDV[i] - g.zmin[i])) {
        r.vDV[i] = v;
        r.etaDV[i] = e;
      }
    }
  }

  /**
   * Paso que llega justo al fin del calentamiento o de la corrida. Si lo que falta es menos de dos pasos, se reparte
   * en dos mitades: un último paso diminuto haría que los caudales de borde (que dependen del paso por el limitador de
   * volumen) dieran un salto en el último dato de las series.
   */
  private toBreak(dt: number): number {
    const rem = this.t < 0 ? -this.t : this.tEnd - this.t;
    if (rem <= dt) return rem;
    if (rem < 2 * dt) return rem / 2;
    return dt;
  }

  private output(Qin: number, Qout: number): void {
    const r = this.res, g = this.g;
    let wrote = false;
    while (this.t >= this.nextOut - 1e-9 && this.nextOut <= this.tEnd + 1e-9) {
      if (this.o.store !== 'max') {
        r.frames.push(Float32Array.from(this.eta));
        r.uFrames.push(Float32Array.from(r.ux));
        r.vFrames.push(Float32Array.from(r.uy));
        r.qFrames.push(Float32Array.from(this.Q));
      }
      r.frameT.push(this.nextOut);
      let qb = 0;
      for (const f of this.bridgeFaces) qb += this.Q[f];
      let qbr = 0;
      if (this.br) for (const { f, s } of this.br.across) qbr += s * this.Q[f];
      let vol = 0;
      for (let i = 0; i < g.NC; i++) vol += this.V[i];
      const s = r.series;
      s.t.push(this.nextOut);
      s.qin.push(Qin);
      s.qout.push(this.outT > 0 ? this.outAcc / this.outT : Qout);
      s.qBridge.push(qb);
      s.wseBridge.push(this.cBridge >= 0 ? this.eta[this.cBridge] : NaN);
      s.depthSchool.push(this.cSchool >= 0 ? Math.max(0, this.eta[this.cSchool] - this.zSchool) : 0);
      s.vol.push(vol);
      s.qBreach.push(qbr);
      s.rain.push(this.rain ? rainAt(this.rain.h, Math.max(0, this.t) / 60) : 0);
      s.excess.push(this.rain ? (1000 * this.rain.excess) / this.rain.area : 0);
      this.nextOut += this.o.outEvery;
      wrote = true;
    }
    if (wrote) {
      this.outAcc = 0;
      this.outT = 0;
    }
  }

  private finish(): void {
    const r = this.res, g = this.g;
    let end = 0;
    for (let i = 0; i < g.NC; i++) end += this.V[i];
    r.vol.end = end;
    if (this.rain) {
      const Ptot = rainAt(this.rain.h, this.tEnd / 60);
      r.vol.infil = (Ptot * this.rain.area) / 1000 - r.vol.rain;
    }
    r.vol.err = r.vol.init + r.vol.vin + r.vol.rain - r.vol.vout - end;
    r.vol.errPct = (100 * r.vol.err) / Math.max(1, r.vol.vin + r.vol.init + r.vol.rain);
    r.ms = this.clock + performance.now() - this.chunk0;
    r.log.push(`Fin: ${r.steps.toLocaleString('es-CO')} pasos de tiempo (de ${r.dtMin.toFixed(2)} a ${r.dtMax.toFixed(2)} s), ${(r.ms / 1000).toFixed(1)} s de cálculo.`);
    r.log.push(`Balance de volumen: entró ${Math.round(r.vol.vin + r.vol.rain).toLocaleString('es-CO')} m³${r.vol.rain > 0 ? ` (${Math.round(r.vol.rain).toLocaleString('es-CO')} de escorrentía de la lluvia)` : ''}, salió ${Math.round(r.vol.vout).toLocaleString('es-CO')} m³, quedó ${Math.round(end).toLocaleString('es-CO')} m³; error ${r.vol.errPct.toFixed(4)} %.`);
    this.status = 'listo';
  }

  private fail(why: string): boolean {
    const r = this.res;
    r.unstable = { t: this.t, why };
    r.ms = this.clock + performance.now() - this.chunk0;
    r.log.push(`El cálculo se volvió inestable en t = ${(this.t / 60).toFixed(1)} min: ${why}`);
    this.status = 'inestable';
    return false;
  }

  /** Volumen inicial al pasar por t = 0 (después de las condiciones iniciales). */
  private markInit(prevT: number): void {
    if (prevT < 0 && this.t >= 0) {
      let v = 0;
      for (let i = 0; i < this.g.NC; i++) v += this.V[i];
      this.res.vol.init = v;
      this.res.vol.vin = 0;
      this.res.vol.vout = 0;
    }
  }

  /** Lo que se hace al empezar cada paso: la rotura, las entradas (caudal y lluvia). */
  private prepare(dt: number, tQ: number): void {
    if (this.br) this.updateBreach();
    this.updateLoss();
    this.bc.fill(0);
    this.qinNow = hydroQ(this.o.hydro, tQ);
    this.inflow(this.qinNow);
    this.qrainNow = this.rainSource(this.t, dt);
  }

  /** Cuenta lo que entró en el paso. */
  private account(prevT: number, dt: number, Qout: number): void {
    this.markInit(prevT);
    if (this.t > 0) {
      this.res.vol.vin += this.qinNow * dt;
      this.res.vol.rain += this.qrainNow * dt;
      this.res.vol.vout += Qout * dt;
      this.outAcc += Qout * dt;
      this.outT += dt;
    }
  }

  // ---------------------------------------------------------------- inercia local y aguas someras (explícitas)

  /**
   * Términos de advección de cada cara, en la forma que conserva la cantidad de movimiento de Stelling y Duinmeijer
   * (2003): u·∂u/∂x ≈ [ (q̄·u*)_b − (q̄·u*)_a − u_f·(q̄_b − q̄_a) ] / (Δx·h̄), con q̄ el caudal unitario en el centro de
   * cada celda y u* la velocidad del agua que entra en ella. Esa velocidad se toma de todas las caras por donde
   * entra agua: por las paralelas, su velocidad; por las transversales, la velocidad media de la celda vecina en esa
   * dirección (el agua que gira en la escalera de la malla trae su cantidad de movimiento).
   */
  private advection(): void {
    const g = this.g, Q = this.Q, fA = this.fA, NC = g.NC, px = g.px;
    const [Qmx, Amx, Qpx, Apx, Qmy, Amy, Qpy, Apy, qbx, usx, qby, usy, inQ, inMx, inMy, qn] = this.cq;
    for (const a of [Qmx, Amx, Qpx, Apx, Qmy, Amy, Qpy, Apy, inQ, inMx, inMy]) a.fill(0);
    // caudal de cada cara con el área actual (positivo hacia +x o +y)
    const qf = this.qNow;
    for (let f = 0; f < g.NF; f++) {
      const a = g.fa[f], b = g.fb[f];
      const A = this.isStruct[f] ? 0 : fA[f];
      let q: number;
      if (b >= 0) q = this.isStruct[f] ? Q[f] : A * this.uF[f];
      else {
        const line = g.bcs[-1 - b];
        q = (line.kind === 'caudal' ? (line.side === 'O' || line.side === 'S' ? 1 : -1) : line.side === 'E' || line.side === 'N' ? 1 : -1) * Q[f];
      }
      qf[f] = q;
      const side = b >= 0 ? null : g.bcs[-1 - b].side;
      if (g.fo[f] === 0) {
        if (b >= 0 || side === 'E') {
          Qpx[a] += q;
          Apx[a] += A;
        } else {
          Qmx[a] += q;
          Amx[a] += A;
        }
        if (b >= 0) {
          Qmx[b] += q;
          Amx[b] += A;
        }
      } else {
        if (b >= 0 || side === 'N') {
          Qpy[a] += q;
          Apy[a] += A;
        } else {
          Qmy[a] += q;
          Amy[a] += A;
        }
        if (b >= 0) {
          Qmy[b] += q;
          Amy[b] += A;
        }
      }
    }
    // velocidad media de cada celda en x y en y (con las caras de esa dirección)
    const Uxc = qn, Uyc = this.Pc;
    for (let i = 0; i < NC; i++) {
      Uxc[i] = Amx[i] + Apx[i] > 1e-6 ? (Qmx[i] + Qpx[i]) / (Amx[i] + Apx[i]) : 0;
      Uyc[i] = Amy[i] + Apy[i] > 1e-6 ? (Qmy[i] + Qpy[i]) / (Amy[i] + Apy[i]) : 0;
    }
    // lo que entra a cada celda y la cantidad de movimiento en x e y que trae
    for (let f = 0; f < g.NF; f++) {
      const q = qf[f], a = g.fa[f], b = g.fb[f];
      if (q === 0) continue;
      const A = this.isStruct[f] ? this.openAK(f, Math.max(this.eta[a], b >= 0 ? this.eta[b] : -Infinity))[0] : fA[f];
      const u = A > 1e-6 ? q / A : 0;
      if (b < 0) {
        const side = g.bcs[-1 - b].side;
        const into = (side === 'O' || side === 'S') === q > 0;
        if (!into) continue;
        const m = Math.abs(q);
        inQ[a] += m;
        if (g.fo[f] === 0) inMx[a] += m * u;
        else inMy[a] += m * u;
        continue;
      }
      const [dst, src] = q > 0 ? [b, a] : [a, b];
      const m = Math.abs(q);
      inQ[dst] += m;
      if (g.fo[f] === 0) {
        inMx[dst] += m * u;
        inMy[dst] += m * Uyc[src];
      } else {
        inMy[dst] += m * u;
        inMx[dst] += m * Uxc[src];
      }
    }
    for (let i = 0; i < NC; i++) {
      const w = g.cs[i] * px;
      qbx[i] = (Qmx[i] + Qpx[i]) / (2 * w);
      qby[i] = (Qmy[i] + Qpy[i]) / (2 * w);
      const upx = qbx[i] > 0 ? (Amx[i] > 1e-6 ? Qmx[i] / Amx[i] : 0) : Apx[i] > 1e-6 ? Qpx[i] / Apx[i] : 0;
      const upy = qby[i] > 0 ? (Amy[i] > 1e-6 ? Qmy[i] / Amy[i] : 0) : Apy[i] > 1e-6 ? Qpy[i] / Apy[i] : 0;
      usx[i] = inQ[i] > 1e-9 ? inMx[i] / inQ[i] : upx;
      usy[i] = inQ[i] > 1e-9 ? inMy[i] / inQ[i] : upy;
    }
    const adv = this.adv;
    for (let f = 0; f < g.nInt; f++) {
      adv[f] = 0;
      const A = fA[f];
      if (A <= 0 || this.isStruct[f]) continue;
      const a = g.fa[f], b = g.fb[f], uf = this.uF[f], d = g.fd[f];
      const hb = 0.5 * (this.cellDepth(a) + this.cellDepth(b));
      if (A / (g.flen[f] * px) < 0.02 || hb < 0.02) continue;
      const v = g.fo[f] === 0 ? (qbx[b] * usx[b] - qbx[a] * usx[a] - uf * (qbx[b] - qbx[a])) / (d * hb) : (qby[b] * usy[b] - qby[a] * usy[a] - uf * (qby[b] - qby[a])) / (d * hb);
      adv[f] = Number.isFinite(v) ? v : 0;
    }
  }

  /** Profundidad media de la parte mojada de una celda [m]. */
  private cellDepth(i: number): number {
    const Aw = cellWetArea(this.g, i, this.eta[i]);
    return Aw > 0 ? this.V[i] / Aw : 0;
  }

  private stepExplicit(swe: boolean): boolean {
    const g = this.g, o = this.o, NC = g.NC, nInt = g.nInt;
    const eta = this.eta, V = this.V, Q = this.Q, bc = this.bc;
    // paso de tiempo: Courant de la onda (velocidad + celeridad) con la celda más pequeña, o el fijo
    let hmax = 0, umax = 0;
    for (let i = 0; i < NC; i++) {
      const d = eta[i] - g.zmin[i];
      if (d > hmax) hmax = d;
    }
    for (let i = 0; i < NC; i++) {
      const u = Math.abs(this.res.ux[i]) + Math.abs(this.res.uy[i]);
      if (u > umax) umax = u;
    }
    const cel = Math.sqrt(G * Math.max(0.05, hmax)) + umax;
    let dt = this.toBreak(o.dtMode === 'fijo' ? o.dt : Math.min(o.dt, (o.courantMax * g.cmin) / cel));
    if (dt <= 0) dt = 1e-3;
    const C = (cel * dt) / g.cmin;
    if (this.t >= 0 && C > this.res.courantMax) this.res.courantMax = C;
    this.prepare(dt, this.t);
    // áreas y conducciones de las caras con el nivel actual
    const fA = this.fA, fK = this.fK;
    for (let f = 0; f < nInt; f++) {
      const ea = eta[g.fa[f]], eb = eta[g.fb[f]];
      fK[f] = faceK(g, f, ea > eb ? ea : eb);
      fA[f] = lastA;
    }
    if (swe) this.advection();
    // cantidad de movimiento: Q = (Q − Δt·A·(g·∂η/∂n + advección)) / (1 + g·A·Δt·|Q|/K²)
    for (let f = 0; f < nInt; f++) {
      const a = g.fa[f], b = g.fb[f];
      const ea = eta[a], eb = eta[b], d = g.fd[f];
      if (this.isStruct[f]) {
        const up = ea >= eb, eu = up ? ea : eb, ed = up ? eb : ea;
        // luz del puente: libre (cantidad de movimiento con su área) o a presión; vertedero encima
        const [Ao, Ko] = this.openAK(f, eu);
        let qo = 0;
        if (Ao > 1e-6 && Ko > 1e-9) {
          // fricción y pérdidas de contracción y expansión, semi-implícitas
          const q = this.Qo[f];
          qo = (q - (G * Ao * dt * (eb - ea)) / d) / (1 + (G * Ao * dt * Math.abs(q)) / (Ko * Ko) + (dt * this.kLoss * Math.abs(q)) / (2 * d * Ao));
        }
        const w = this.pressureWeight(f, eu);
        if (w > 0) qo = (1 - w) * qo + w * (up ? 1 : -1) * this.pressureQ(f, eu, ed);
        this.Qo[f] = qo;
        const qw = (up ? 1 : -1) * this.weirQ(f, eu, ed);
        this.Qw[f] = this.Qw[f] + 0.5 * (qw - this.Qw[f]);
        Q[f] = qo + this.Qw[f];
        fA[f] = Ao;
        continue;
      }
      const K = fK[f], A = fA[f];
      if (A < 1e-6 || K < 1e-9) {
        Q[f] = 0;
        this.uF[f] = 0;
        continue;
      }
      if (swe) {
        // aguas someras: la incógnita de la cara es la velocidad (así el frente no se frena al crecer el área)
        const u = this.uF[f];
        const un = (u - dt * ((G * (eb - ea)) / d + this.adv[f])) / (1 + (G * dt * Math.abs(u) * A * A) / (K * K));
        this.uF[f] = un;
        Q[f] = A * un;
        continue;
      }
      const q = Q[f];
      Q[f] = (q - (G * A * dt * (eb - ea)) / d) / (1 + (G * A * dt * Math.abs(q)) / (K * K));
    }
    // salida: profundidad normal con la pendiente de fricción, Q = K(η)·√S, evaluada al final del paso
    // (linealizada): así la celda del borde no se vacía y se llena paso a paso
    const qin = this.zv;
    for (let i = 0; i < NC; i++) qin[i] = bc[i];
    for (let f = 0; f < nInt; f++) {
      const q = Q[f];
      if (q > 0) qin[g.fb[f]] += q;
      else if (q < 0) qin[g.fa[f]] -= q;
    }
    for (const f of this.outFaces) {
      const a = g.fa[f], So = this.outS[f];
      const q0 = faceK(g, f, eta[a]) * So;
      fA[f] = lastA;
      if (q0 <= 0) {
        Q[f] = 0;
        continue;
      }
      const As = Math.max(cellWetArea(g, a, eta[a] + 0.01), 1e-3 * (g.cs[a] * g.px) ** 2);
      const dq = ((faceK(g, f, eta[a] + 0.01) * So - q0) / 0.01) * (dt / As);
      Q[f] = (q0 + dq * qin[a]) / (1 + dq);
    }
    // que ninguna celda entregue más agua de la que tiene
    const out = this.r;
    out.fill(0);
    for (let f = 0; f < nInt; f++) {
      const q = Q[f];
      if (q > 0) out[g.fa[f]] += q * dt;
      else if (q < 0) out[g.fb[f]] -= q * dt;
    }
    for (const f of this.outFaces) out[g.fa[f]] += Q[f] * dt;
    const sc = this.zv;
    for (let i = 0; i < NC; i++) sc[i] = out[i] > V[i] + bc[i] * dt ? (V[i] + bc[i] * dt) / out[i] : 1;
    for (let f = 0; f < nInt; f++) {
      const q = Q[f];
      if (q > 0) Q[f] = q * sc[g.fa[f]];
      else if (q < 0) Q[f] = q * sc[g.fb[f]];
      if (swe && q !== 0) this.uF[f] *= Q[f] / q;
      if (this.isStruct[f]) {
        const s = q !== 0 ? Q[f] / q : 1;
        this.Qo[f] *= s;
        this.Qw[f] *= s;
      }
    }
    let Qout = 0;
    for (const f of this.outFaces) {
      Q[f] *= sc[g.fa[f]];
      Qout += Q[f];
    }
    // continuidad
    const dV = this.x;
    for (let i = 0; i < NC; i++) dV[i] = bc[i] * dt;
    for (let f = 0; f < nInt; f++) {
      const q = Q[f] * dt;
      dV[g.fa[f]] -= q;
      dV[g.fb[f]] += q;
    }
    for (const f of this.outFaces) dV[g.fa[f]] -= Q[f] * dt;
    let bad = false;
    const last = this.dEta, osc = this.osc;
    for (let i = 0; i < NC; i++) {
      let v = V[i] + dV[i];
      if (v < 0) {
        this.res.vol.clipped -= v;
        v = 0;
      }
      V[i] = v;
      const e = cellLevel(g, i, v);
      const dv = dV[i], big = this.bigV[i];
      if (!Number.isFinite(e)) bad = true;
      // una oscilación «grande» mueve en un paso el equivalente a 10 cm sobre toda la celda
      osc[i] = dv * last[i] < 0 && Math.abs(dv) > big && Math.abs(last[i]) > big ? osc[i] + 1 : 0;
      last[i] = dv;
      eta[i] = e;
    }
    if (bad) return this.fail('aparecieron números no válidos (la solución explotó).');
    const prevT = this.t;
    this.t += dt;
    this.account(prevT, dt, Qout);
    this.record(dt, (f, v, A) => ((v + Math.sqrt(G * Math.max(0.01, A / (g.flen[f] * g.px)))) * dt) / g.fd[f]);
    if (this.oscillating()) return this.fail(`los niveles empezaron a oscilar paso a paso (Courant ${C.toFixed(2)}).`);
    let vmax = 0;
    for (let i = 0; i < NC; i++) vmax = Math.max(vmax, Math.abs(this.res.ux[i]), Math.abs(this.res.uy[i]));
    if (vmax > 25 || !Number.isFinite(vmax)) return this.fail(`velocidades de ${vmax.toFixed(0)} m/s, que no existen en este valle (Courant ${C.toFixed(2)}).`);
    this.output(this.qinNow, Qout);
    return true;
  }

  // ---------------------------------------------------------------- onda difusiva (implícita)

  private stepDW(): boolean {
    const g = this.g, o = this.o, NC = g.NC, nInt = g.nInt;
    const eta = this.eta, V = this.V, beta = this.beta, betaN = this.betaN, bc = this.bc;
    const theta = o.theta;
    let dt = this.toBreak(this.dt);
    if (dt <= 0) dt = 1e-3;
    this.prepare(dt, this.t + dt);
    const SMIN = 1e-5;
    const ek = this.ek, etaN = this.etaN, expl = this.expl;
    etaN.set(eta);
    // primer intento: lo que venía cambiando el nivel (sin bajar del fondo de la celda)
    const eo = this.etaOld;
    const ratio = this.lastDt > 0 ? Math.min(1, dt / this.lastDt) : 0;
    for (let i = 0; i < NC; i++) {
      const e = eta[i] + (eo[i] > 0 ? (eta[i] - eo[i]) * ratio : 0);
      ek[i] = e > g.zmin[i] ? e : g.zmin[i];
    }
    expl.fill(0);
    if (theta < 1) {
      for (let f = 0; f < nInt; f++) {
        const q = betaN[f] * (etaN[g.fa[f]] - etaN[g.fb[f]]) * (1 - theta);
        expl[g.fa[f]] -= q;
        expl[g.fb[f]] += q;
      }
    }
    const lastDe = this.p;
    let it = 0, err = Infinity;
    for (it = 1; it <= o.maxIter; it++) {
      // β de las caras: Q = β·(η_a − η_b), β = K/(Δx·√|S|). Se evalúa con el nivel del paso anterior y se corrige
      // una vez con el de la iteración; luego queda fijo y las iteraciones resuelven la curva cota-volumen (que es
      // convexa: así convergen siempre). Las caras de la estructura usan la secante de su ecuación.
      if (it <= 2) {
        const src = it === 1 ? etaN : ek;
        for (let f = 0; f < nInt; f++) {
          const a = g.fa[f], b = g.fb[f];
          const ea = src[a], eb = src[b];
          let bn = 0;
          if (this.isStruct[f]) bn = this.structBeta(f, ea, eb);
          else {
            const ef = ea > eb ? ea : eb;
            const K = faceK(g, f, ef);
            // una cara con menos de 1 cm de agua sobre su punto más bajo no conduce (umbral de mojado)
            if (K > 0 && ef - g.fzmin[f] > HMIN) {
              const S = Math.abs(eb - ea) / g.fd[f];
              bn = K / (g.fd[f] * Math.sqrt(S > SMIN ? S : SMIN));
            }
          }
          beta[f] = it === 1 ? bn : Math.sqrt(beta[f] * bn) || 0.5 * (beta[f] + bn);
        }
      }
      // ensamblar: (As/Δt + θΣβ + dQout/dη)·η − θΣβ·η_vecino = (As·η^k − V(η^k) + V^n)/Δt + explícito + entradas
      const D = this.D, W = this.W, rhs = this.rhs;
      for (let i = 0; i < NC; i++) {
        // área mojada (la derivada de la curva cota-volumen); en una celda seca, la de 5 cm sobre su punto más
        // bajo, para que no salte al recibir agua
        const As = Math.max(cellWetArea(g, i, ek[i] - g.zmin[i] > 0.005 ? ek[i] : g.zmin[i] + 0.05), 1e-3 * (g.cs[i] * g.px) ** 2);
        D[i] = As / dt;
        this.Sd[i] = As / dt;
        rhs[i] = (As * ek[i] - cellVolume(g, i, ek[i]) + V[i]) / dt + expl[i] + bc[i];
      }
      for (let f = 0; f < nInt; f++) {
        const w = theta * beta[f];
        W[f] = w;
        if (w === 0) continue;
        D[g.fa[f]] += w;
        D[g.fb[f]] += w;
      }
      for (const f of this.outFaces) {
        const a = g.fa[f], So = this.outS[f];
        const K0 = faceK(g, f, ek[a]);
        const K1 = faceK(g, f, ek[a] + 0.01);
        const q0 = K0 * So, dq = ((K1 - K0) * So) / 0.01;
        D[a] += dq;
        rhs[a] -= q0 - dq * ek[a];
      }
      this.solve(NC, ek);
      // nivel nuevo (no por debajo del fondo de la celda)
      err = 0;
      for (let i = 0; i < NC; i++) {
        let e = this.x[i];
        if (e < g.zmin[i]) e = g.zmin[i];
        if (e > ek[i] + 2) e = ek[i] + 2;
        else if (e < ek[i] - 2) e = ek[i] - 2;
        const de = Math.abs(e - ek[i]);
        lastDe[i] = de;
        if (de > err) err = de;
        ek[i] = e;
      }
      if (!Number.isFinite(err)) return this.fail('el sistema de ecuaciones no tuvo solución válida.');
      if (err < o.tolWS) break;
    }
    const conv = err < o.tolWS;
    if (it > o.maxIter) it = o.maxIter;
    // flujos finales (ponderados con θ) y actualización conservativa del volumen
    const Q = this.Q;
    for (let f = 0; f < nInt; f++) Q[f] = theta * beta[f] * (ek[g.fa[f]] - ek[g.fb[f]]) + (1 - theta) * betaN[f] * (etaN[g.fa[f]] - etaN[g.fb[f]]);
    for (const f of this.outFaces) Q[f] = faceK(g, f, ek[g.fa[f]]) * this.outS[f];
    // que ninguna celda entregue más agua de la que tiene más la que le llega en el paso (en un esquema implícito el
    // agua puede atravesar una celda seca en un solo paso). Una celda que se seca no puede dar más: se ajustan sus
    // salidas y se repite, porque eso cambia lo que reciben las de aguas abajo.
    const out = this.r, sc = this.zv, inn = this.D;
    for (let pass = 0; pass < 60; pass++) {
      out.fill(0);
      inn.fill(0);
      for (let f = 0; f < nInt; f++) {
        const q = Q[f];
        if (q > 0) {
          out[g.fa[f]] += q * dt;
          inn[g.fb[f]] += q * dt;
        } else if (q < 0) {
          out[g.fb[f]] -= q * dt;
          inn[g.fa[f]] -= q * dt;
        }
      }
      for (const f of this.outFaces) out[g.fa[f]] += Q[f] * dt;
      let any = false;
      for (let i = 0; i < NC; i++) {
        const avail = V[i] + bc[i] * dt + inn[i];
        sc[i] = out[i] > avail * (1 + 1e-9) + 1e-9 ? avail / out[i] : 1;
        if (sc[i] < 1) any = true;
      }
      if (!any) break;
      for (let f = 0; f < nInt; f++) {
        const q = Q[f];
        if (q !== 0) Q[f] = q * (q > 0 ? sc[g.fa[f]] : sc[g.fb[f]]);
      }
      for (const f of this.outFaces) Q[f] *= sc[g.fa[f]];
    }
    const dV = this.x;
    for (let i = 0; i < NC; i++) dV[i] = bc[i] * dt;
    for (let f = 0; f < nInt; f++) {
      const q = Q[f];
      dV[g.fa[f]] -= q * dt;
      dV[g.fb[f]] += q * dt;
    }
    let Qout = 0;
    for (const f of this.outFaces) {
      dV[g.fa[f]] -= Q[f] * dt;
      Qout += Q[f];
    }
    let vErr = 0;
    for (let i = 0; i < NC; i++) {
      let v = V[i] + dV[i];
      if (v < 0) {
        this.res.vol.clipped -= v;
        v = 0;
      }
      V[i] = v;
      const e = cellLevel(g, i, v);
      const d = Math.abs(e - ek[i]);
      if (d > vErr && v > 0) vErr = d;
      eta[i] = e;
    }
    betaN.set(beta);
    this.etaOld.set(etaN);
    this.lastDt = dt;
    const r = this.res;
    if (this.t + dt > 0) {
      r.iters.total += it;
      r.iters.max = Math.max(r.iters.max, it);
      if (!conv) r.iters.nonconv++;
      r.iters.maxErr = Math.max(r.iters.maxErr, err);
      for (let i = 0; i < NC; i++) {
        if (lastDe[i] > r.iterErr[i]) r.iterErr[i] = lastDe[i];
        if (!conv && lastDe[i] >= o.tolWS && r.nonconvCell[i] < 65535) r.nonconvCell[i]++;
      }
    }
    // Courant con la velocidad del agua en las caras (como lo define HEC-RAS)
    let C = 0;
    for (let f = 0; f < nInt; f++) {
      const a = g.fa[f], b = g.fb[f];
      faceK(g, f, Math.max(eta[a], eta[b]));
      this.fA[f] = this.isStruct[f] ? this.openAK(f, Math.max(eta[a], eta[b]))[0] : lastA;
      if (Q[f] === 0 || this.fA[f] < 0.05 * g.flen[f] * g.px) continue;
      const v = Math.abs(Q[f]) / this.fA[f];
      if ((v * dt) / g.fd[f] > C) C = (v * dt) / g.fd[f];
    }
    for (const f of this.inFaces) faceK(g, f, eta[g.fa[f]]);
    const prevT = this.t;
    this.t += dt;
    this.account(prevT, dt, Qout);
    if (this.t > 0 && C > r.courantMax) r.courantMax = C;
    this.record(dt, (f, v) => (v * dt) / g.fd[f]);
    if (vErr > 5) return this.fail(`el volumen y el nivel dejaron de cuadrar (${vErr.toFixed(1)} m).`);
    let vmax = 0;
    for (let i = 0; i < NC; i++) vmax = Math.max(vmax, Math.abs(r.ux[i]), Math.abs(r.uy[i]));
    if (vmax > 25 || !Number.isFinite(vmax)) return this.fail(`velocidades de ${vmax.toFixed(0)} m/s, que no existen en este valle.`);
    this.output(this.qinNow, Qout);
    // paso ajustable por Courant (como la opción de HEC-RAS: se parte o se duplica el paso base)
    if (o.dtMode === 'courant') {
      if (C > o.courantMax && this.dt > o.dt / 64) {
        this.dt /= 2;
        this.belowCount = 0;
      } else if (C < o.courantMax / 2.5 && this.dt < o.dt) {
        if (++this.belowCount >= 4) {
          this.dt *= 2;
          this.belowCount = 0;
        }
      } else this.belowCount = 0;
    }
    return true;
  }

  /** β de una cara de la estructura: la secante de su caudal (luz libre o a presión y vertedero). */
  private structBeta(f: number, ea: number, eb: number): number {
    const up = ea >= eb, eu = up ? ea : eb, ed = up ? eb : ea;
    const dH = Math.max(0.01, eu - ed), d = this.g.fd[f];
    const [Ao, Ko] = this.openAK(f, eu);
    let b = 0;
    if (Ko > 0 && Ao > 0) {
      // conducción equivalente con la fricción y las pérdidas locales: S = Q²/K² + k·Q²/(2g·A²·d)
      const Ke = 1 / Math.sqrt(1 / (Ko * Ko) + this.kLoss / (2 * G * Ao * Ao * d));
      b = Ke / (d * Math.sqrt(Math.max(1e-5, dH / d)));
    }
    const w = this.pressureWeight(f, eu);
    if (w > 0) b = (1 - w) * b + (w * this.pressureQ(f, eu, eu - dH)) / dH;
    return b + this.weirQ(f, eu, eu - dH) / dH;
  }

  /**
   * Gradiente conjugado con precondicionador de Cholesky incompleto modificado (MIC(0) en su versión diagonal) para
   * la matriz dispersa de la malla: diagonal D y fuera de ella −w de cada cara.
   */
  private solve(NC: number, x0: Float64Array): void {
    const g = this.g, D = this.D, W = this.W, b = this.rhs, x = this.x, r = this.r, z = this.zv, pp = this.cgP, AP = this.Ap, P = this.Pc, Sd = this.Sd;
    const off = g.adjOff, nb = g.adjCell, fc = g.adjFace;
    // factor: e_i = D_i − Σ_{j<i} [w_ij² + τ·w_ij·(U_j − w_ij)]/e_j, con U_j la suma de los w de j hacia celdas mayores
    const TAU = 0.97;
    const U = z;
    for (let i = 0; i < NC; i++) {
      let s = 0;
      for (let q = off[i]; q < off[i + 1]; q++) if (nb[q] > i) s += W[fc[q]];
      U[i] = s;
    }
    for (let i = 0; i < NC; i++) {
      let e = D[i];
      for (let q = off[i]; q < off[i + 1]; q++) {
        const j = nb[q];
        if (j >= i) continue;
        const w = W[fc[q]];
        if (w === 0) continue;
        e -= (w * w + TAU * w * (U[j] - w)) * (P[j] * P[j]);
      }
      if (e < 1e-10 * D[i]) e = D[i];
      P[i] = 1 / Math.sqrt(e);
    }
    const mul = (v: Float64Array, out: Float64Array) => {
      for (let i = 0; i < NC; i++) {
        let s = D[i] * v[i];
        for (let q = off[i]; q < off[i + 1]; q++) s -= W[fc[q]] * v[nb[q]];
        out[i] = s;
      }
    };
    const prec = (rr: Float64Array, out: Float64Array) => {
      for (let i = 0; i < NC; i++) {
        let s = rr[i];
        for (let q = off[i]; q < off[i + 1]; q++) {
          const j = nb[q];
          if (j < i) s += W[fc[q]] * P[j] * out[j];
        }
        out[i] = s * P[i];
      }
      for (let i = NC - 1; i >= 0; i--) {
        let s = out[i];
        for (let q = off[i]; q < off[i + 1]; q++) {
          const k = nb[q];
          if (k > i) s += W[fc[q]] * P[i] * out[k];
        }
        out[i] = s * P[i];
      }
    };
    x.set(x0);
    mul(x, AP);
    let r0 = 0;
    for (let i = 0; i < NC; i++) {
      r[i] = b[i] - AP[i];
      const e = Math.abs(r[i] / Sd[i]);
      if (e > r0) r0 = e;
    }
    // el residuo se mide como error de nivel de cada celda (volumen que falta cuadrar entre su almacenamiento)
    if (r0 < 1e-6) return;
    prec(r, z);
    pp.set(z);
    let rz = 0;
    for (let i = 0; i < NC; i++) rz += r[i] * z[i];
    for (let k = 0; k < 600; k++) {
      mul(pp, AP);
      let pAp = 0;
      for (let i = 0; i < NC; i++) pAp += pp[i] * AP[i];
      if (pAp <= 0) break;
      const al = rz / pAp;
      let rmax = 0;
      for (let i = 0; i < NC; i++) {
        x[i] += al * pp[i];
        r[i] -= al * AP[i];
        const e = Math.abs(r[i] / Sd[i]);
        if (e > rmax) rmax = e;
      }
      if (rmax < 1e-6) break;
      prec(r, z);
      let rz2 = 0;
      for (let i = 0; i < NC; i++) rz2 += r[i] * z[i];
      const be = rz2 / rz;
      rz = rz2;
      for (let i = 0; i < NC; i++) pp[i] = z[i] + be * pp[i];
    }
  }
}

export { ROAD, L as TABLE_LEVELS, DH as TABLE_DH };

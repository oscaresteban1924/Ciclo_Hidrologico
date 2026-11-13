// El terreno de la sala «Modelación hidráulica 2D»: un valle ilustrativo de 640 × 400 m con su quebrada meándrica,
// un jarillón en la orilla izquierda que protege un barrio, el terraplén de una vía con su puente y las coberturas
// del suelo. Se construye el «terreno verdadero» a 1 m (modelo digital del terreno, MDT, y de superficie, MDS) y,
// a partir de él, lo que verían distintas fuentes: el tamaño del píxel, el método de remuestreo, el error vertical
// y la lámina de agua que el sensor no atraviesa. No es un lugar de Medellín.

export const NX = 640;
export const NY = 400;
/** Pendiente del valle (y de la quebrada) en la dirección del flujo (+x). */
export const S0 = 0.005;
/** Cota del fondo del valle en x = 0 [m s. n. m.]. */
export const Z0 = 1480;
/** Profundidad del cauce bajo la orilla y semianchos de fondo y de boca [m]. */
export const DC = 2.4;
export const HALF_BED = 3;
export const HALF_TOP = 5.5;
/** Lámina de agua que el sensor ve en el cauce con el caudal base (el láser no la atraviesa) [m sobre el fondo]. */
export const BASE_WATER = 0.5;
/** Jarillón: a 14 m del eje por la orilla izquierda (norte); arranca en la loma (x = 60 m) y muere en el terraplén de la vía. */
export const LEVEE = { x0: 60, x1: 444, dn: 14, crest: 1.5, foot: 4.8, H: 1.3 };
/** Terraplén de la vía (norte-sur) y su puente sobre la quebrada. */
export const ROAD = { x: 446, half: 3, side: 3.2, H: 2.8, open: 10 };
export const ROAD_Z = Z0 - S0 * ROAD.x + ROAD.H;

const TAU = Math.PI * 2;
/** Eje de la quebrada: meandros de 320 m de longitud de onda y 30 m de amplitud. */
export const yc = (x: number) => 200 + 30 * Math.sin((TAU * x) / 320);
const ycp = (x: number) => ((30 * TAU) / 320) * Math.cos((TAU * x) / 320);
/** Distancia al eje medida en perpendicular (positiva hacia la orilla izquierda, el norte). */
export const dn = (x: number, y: number) => (y - yc(x)) / Math.sqrt(1 + ycp(x) * ycp(x));

/** Generador pseudoaleatorio con semilla (xorshift32). */
export function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ coberturas y n de Manning

export type Cover = 'cauce' | 'pasto' | 'cultivo' | 'rastrojo' | 'bosque' | 'via' | 'edificio';
export const COVER_KEYS: Cover[] = ['cauce', 'pasto', 'cultivo', 'rastrojo', 'bosque', 'via', 'edificio'];
export interface CoverInfo {
  name: string;
  /** Mínimo, normal y máximo de la tabla de Chow (1959); el de las edificaciones es un valor de calibración. */
  n: [number, number, number];
  desc: string;
  color: string;
}
export const COVERS: Record<Cover, CoverInfo> = {
  cauce: { name: 'Cauce', n: [0.03, 0.04, 0.05], desc: 'Corriente de montaña, fondo de gravas y cantos con pocos bloques', color: '#5f8fae' },
  pasto: { name: 'Pasto', n: [0.025, 0.03, 0.035], desc: 'Pastos cortos sin matorral (también patios y el jarillón)', color: '#9cc06b' },
  cultivo: { name: 'Cultivos', n: [0.025, 0.035, 0.045], desc: 'Cultivos en hileras, maduros', color: '#d4c46a' },
  rastrojo: { name: 'Rastrojo', n: [0.04, 0.06, 0.08], desc: 'Matorral claro y árboles, en verano', color: '#8aa45a' },
  bosque: { name: 'Bosque', n: [0.08, 0.1, 0.12], desc: 'Bosque denso, poco sotobosque, agua por debajo de las ramas', color: '#3f7a46' },
  via: { name: 'Vías', n: [0.013, 0.016, 0.016], desc: 'Asfalto (calles y la vía)', color: '#8c8f93' },
  edificio: { name: 'Edificaciones', n: [0.1, 0.2, 1], desc: 'Valor alto para representar el estorbo de las casas (de calibración, no de tabla)', color: '#c9765b' },
};

export interface Building {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  h: number;
  name?: string;
}

/** Puntos de interés del valle (para leer resultados). */
export const POIS = {
  escuela: { x: 218, y: 265.5, name: 'El patio de la escuela' },
  puente: { x: 432, y: 0, name: 'Aguas arriba del puente' },
  calle: { x: 300, y: 302, name: 'La calle principal' },
};
POIS.puente.y = yc(POIS.puente.x);

// ------------------------------------------------------------------ el terreno verdadero

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Fondo del valle sin el cauce ni las obras: pendiente, terraza sur, llanura norte y laderas. */
export function valley(x: number, y: number): number {
  const c = yc(x);
  let lat: number;
  if (y < c) lat = 0.011 * (c - y); // terraza sur
  else {
    // orilla norte: loma aguas arriba (el jarillón arranca en ella), llanura baja del barrio entre la loma y la
    // vía (algo más baja hacia el norte, donde se empoza el agua) y potreros que suben aguas abajo de la vía
    const d = y - c;
    const high = 0.011 * d;
    const town = -0.0015 * Math.min(d, 90) + 0.004 * Math.max(0, d - 90);
    const down = 0.006 * d;
    const w1 = smooth(70, 125, x), w2 = smooth(452, 482, x);
    lat = (high * (1 - w1) + town * w1) * (1 - w2) + down * w2;
  }
  const w = Math.abs(y - 200) - 150;
  const wall = w > 0 ? 0.07 * Math.pow(w, 1.35) : 0;
  const micro = 0.11 * Math.sin(x / 17.3 + 1.3 * Math.sin(y / 41)) * Math.sin(y / 13.7 - x / 61) + 0.05 * Math.sin(x / 7.1 + 0.7) * Math.sin(y / 9.3);
  return Z0 - S0 * x + lat + wall + micro;
}

/** Cota del fondo del cauce (perfil del levantamiento). */
export const bedZ = (x: number) => Z0 - S0 * x - DC;

/** Profundidad del cauce bajo la orilla según la distancia al eje. */
function channelCut(d: number): number {
  const a = Math.abs(d);
  if (a <= HALF_BED) return DC;
  if (a >= HALF_TOP) return 0;
  const t = (HALF_TOP - a) / (HALF_TOP - HALF_BED);
  return DC * t;
}

/** Altura del jarillón sobre el terreno natural en el punto (x, y) [m] (0 fuera de él). */
export const leveeHeight = (x: number, y: number) => leveeH(x, dn(x, y));

function leveeH(x: number, d: number): number {
  if (d <= 0) return 0;
  const taper = smooth(LEVEE.x0, LEVEE.x0 + 30, x) * (1 - smooth(LEVEE.x1 - 6, LEVEE.x1, x));
  if (taper <= 0) return 0;
  const a = Math.abs(d - LEVEE.dn);
  if (a >= LEVEE.foot) return 0;
  const k = a <= LEVEE.crest ? 1 : (LEVEE.foot - a) / (LEVEE.foot - LEVEE.crest);
  return LEVEE.H * k * taper;
}

/** Cota del terraplén de la vía (sin el puente) o −∞ fuera de él. */
function roadZ(x: number): number {
  const a = Math.abs(x - ROAD.x);
  if (a <= ROAD.half) return ROAD_Z;
  if (a >= ROAD.half + ROAD.side * 1.2) return -Infinity;
  return ROAD_Z - ((a - ROAD.half) / ROAD.side) * ROAD.H;
}

/** Cuadras del barrio (manzanas de 40 × 36 m con calles de 8 m) y una finca aguas abajo. */
function makeBuildings(): { list: Building[]; streets: [number, number, number, number][] } {
  const R = rand(41);
  const list: Building[] = [];
  const streets: [number, number, number, number][] = [];
  const bx0 = 150, pitchX = 48, by = [262, 306];
  // calles: una al sur del barrio, la principal (este-oeste) y una al norte; carreras entre manzanas
  streets.push([142, 390, 254, 262], [142, 390, 298, 306], [142, 390, 342, 350]);
  for (let k = 0; k <= 5; k++) streets.push([bx0 + k * pitchX - 8, bx0 + k * pitchX, 254, 350]);
  for (let col = 0; col < 5; col++)
    for (const y0 of by) {
      const x0 = bx0 + col * pitchX;
      if (col === 1 && y0 === 262) {
        list.push({ x0: x0 + 5, x1: x0 + 35, y0: y0 + 8, y1: y0 + 28, h: 7, name: 'escuela' });
        continue;
      }
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 2; b++) {
          if (R() < 0.12) continue; // un lote vacío
          const w = 9 + R() * 3, d = 12 + R() * 3;
          const cx = x0 + 2 + a * 13 + (12 - w) / 2, cy = y0 + 1.5 + b * 17.5 + (16 - d) / 2;
          list.push({ x0: cx, x1: cx + w, y0: cy, y1: cy + d, h: 3 + Math.floor(R() * 3) * 2.8 });
        }
    }
  // finca en la terraza sur, aguas abajo de la vía
  for (const [x0, y0, w, d, h] of [
    [500, 112, 16, 10, 4.5],
    [522, 108, 10, 8, 3.5],
    [505, 128, 8, 8, 3],
  ] as const)
    list.push({ x0, x1: x0 + w, y0, y1: y0 + d, h });
  return { list, streets };
}

export interface Crown {
  x: number;
  y: number;
  r: number;
  h: number;
}

export interface Truth {
  /** Modelo digital del terreno a 1 m (suelo desnudo, con el cauce levantado). */
  mdt: Float32Array;
  /** Modelo digital de superficie a 1 m (con casas, copas de árboles y el tablero del puente). */
  mds: Float32Array;
  cover: Uint8Array;
  /** 1: corona del jarillón, 2: corona de la vía (para las líneas de quiebre). */
  ridge: Uint8Array;
  /** Distancia al eje por píxel. */
  dist: Float32Array;
  buildings: Building[];
  streets: [number, number, number, number][];
  crowns: Crown[];
  /** Cota de la corona del jarillón por columna (NaN fuera de él). */
  leveeCrest: Float32Array;
  /** 1 donde está el terraplén de la vía y la cota del suelo sin él (para modelarla como estructura). */
  road: Uint8Array;
  bare: Float32Array;
}

let TRUTH: Truth | null = null;

/** El valle verdadero a 1 m (se construye una vez). */
export function truth(): Truth {
  if (TRUTH) return TRUTH;
  const N = NX * NY;
  const mdt = new Float32Array(N), mds = new Float32Array(N), cover = new Uint8Array(N), ridge = new Uint8Array(N), dist = new Float32Array(N);
  const road = new Uint8Array(N), bare = new Float32Array(N);
  const leveeCrest = new Float32Array(NX).fill(NaN);
  const { list, streets } = makeBuildings();
  const C = (c: Cover) => COVER_KEYS.indexOf(c);
  const inStreet = (x: number, y: number) => streets.some(([a, b, c, d]) => x >= a && x < b && y >= c && y < d);
  for (let j = 0; j < NY; j++) {
    const y = j + 0.5;
    for (let i = 0; i < NX; i++) {
      const x = i + 0.5;
      const k = j * NX + i;
      const d = dn(x, y);
      dist[k] = d;
      let z = valley(x, y);
      const cut = channelCut(d);
      if (cut > 0) z = Math.min(z, Z0 - S0 * x - DC + (DC - cut)) - 0.0;
      const lev = leveeH(x, d);
      z += lev;
      if (lev > LEVEE.H * 0.97) ridge[k] = 1;
      // vía: terraplén salvo en la luz del puente (estribos con talud)
      const rz = roadZ(x);
      let onRoad = false;
      if (rz > -Infinity) {
        const open = Math.abs(dn(x, y));
        const keep = smooth(ROAD.open, ROAD.open + 4, open);
        const zr = z + (rz - z) * keep;
        if (zr > z + 0.02) {
          bare[k] = z;
          road[k] = 1;
          z = zr;
          onRoad = true;
          if (Math.abs(x - ROAD.x) <= ROAD.half && keep > 0.98) ridge[k] = 2;
        }
      }
      const street = !onRoad && inStreet(x, y);
      if (street) z -= 0.12;
      mdt[k] = z;
      // coberturas
      let cv: Cover;
      const ad = Math.abs(d);
      if (cut > 0 || ad <= HALF_TOP) cv = 'cauce';
      else if (onRoad && Math.abs(x - ROAD.x) <= ROAD.half + 0.5) cv = 'via';
      else if (onRoad) cv = 'pasto';
      else if (street) cv = 'via';
      else if (lev > 0.05) cv = 'pasto';
      else if (d > 0 && x > LEVEE.x0 && x < LEVEE.x1 && d < LEVEE.dn - LEVEE.foot) cv = 'bosque';
      else if (ad < 16 && !(d > 0 && x > LEVEE.x0 - 10 && x < LEVEE.x1 + 10)) cv = 'bosque';
      else if (y < 58) cv = x < 420 ? 'bosque' : 'rastrojo';
      else if (y > 352) cv = 'pasto';
      else if (d < 0) cv = x < 300 ? 'cultivo' : x > 470 && x < 620 && y < 100 ? 'rastrojo' : 'pasto';
      else cv = x > ROAD.x ? 'cultivo' : 'pasto';
      cover[k] = C(cv);
    }
  }
  // corona del jarillón por columna (para medir cuánto se conserva)
  for (let i = 0; i < NX; i++) {
    let m = -Infinity;
    for (let j = 0; j < NY; j++) if (ridge[j * NX + i] === 1) m = Math.max(m, mdt[j * NX + i]);
    if (m > -Infinity) leveeCrest[i] = m;
  }
  mds.set(mdt);
  // casas: en el MDS y en la cobertura
  for (const b of list) {
    for (let j = Math.floor(b.y0); j < Math.ceil(b.y1); j++)
      for (let i = Math.floor(b.x0); i < Math.ceil(b.x1); i++) {
        if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
        const k = j * NX + i;
        cover[k] = C('edificio');
        mds[k] = mdt[k] + b.h;
      }
  }
  // copas de los árboles (en el bosque y algunos sueltos en potreros)
  const crowns: Crown[] = [];
  const R = rand(77);
  for (let n = 0; n < 9000 && crowns.length < 720; n++) {
    const x = R() * NX, y = R() * NY;
    const k = Math.floor(y) * NX + Math.floor(x);
    const cv = COVER_KEYS[cover[k]];
    const p = cv === 'bosque' ? 0.55 : cv === 'rastrojo' ? 0.12 : cv === 'pasto' && y > 60 && y < 250 && dist[k] < -16 ? 0.004 : 0;
    if (R() >= p) continue;
    const near = crowns.some((c) => (c.x - x) ** 2 + (c.y - y) ** 2 < (c.r * 1.1) ** 2);
    if (near) continue;
    crowns.push({ x, y, r: cv === 'rastrojo' ? 2 + R() * 1.5 : 3 + R() * 2.2, h: cv === 'rastrojo' ? 4 + R() * 3 : Math.abs(dist[k]) < 20 ? 10 + R() * 5 : 14 + R() * 6 });
  }
  for (const c of crowns) {
    const r = Math.ceil(c.r);
    for (let j = Math.floor(c.y) - r; j <= Math.floor(c.y) + r; j++)
      for (let i = Math.floor(c.x) - r; i <= Math.floor(c.x) + r; i++) {
        if (i < 0 || j < 0 || i >= NX || j >= NY) continue;
        const q = ((i + 0.5 - c.x) ** 2 + (j + 0.5 - c.y) ** 2) / (c.r * c.r);
        if (q >= 1) continue;
        const k = j * NX + i;
        mds[k] = Math.max(mds[k], mdt[k] + c.h * Math.sqrt(1 - q) * 0.4 + c.h * 0.6);
      }
  }
  // el tablero del puente tapa la luz en el MDS
  for (let j = 0; j < NY; j++)
    for (let i = Math.floor(ROAD.x - 4); i < Math.ceil(ROAD.x + 4); i++) {
      const k = j * NX + i;
      if (Math.abs(dist[k]) <= ROAD.open + 2) mds[k] = Math.max(mds[k], ROAD_Z);
    }
  TRUTH = { mdt, mds, cover, ridge, dist, buildings: list, streets, crowns, leveeCrest, road, bare };
  return TRUTH;
}

// ------------------------------------------------------------------ lo que ve cada fuente

export type Surface = 'mdt' | 'mds';
export type Resample = 'promedio' | 'minimo' | 'maximo' | 'cercano';
export const RESAMPLE_NAMES: Record<Resample, string> = { promedio: 'Promedio', minimo: 'Mínimo', maximo: 'Máximo', cercano: 'Vecino más cercano' };
export const PIXELS = [1, 2, 5, 10, 20, 30] as const;

export interface TerrainOpts {
  surf: Surface;
  /** Tamaño del píxel [m]. */
  p: number;
  method: Resample;
  /** Error vertical de la fuente (desviación típica) [m]. */
  sigma: number;
  /** Insertar el cauce levantado a 1 m (como una modificación de terreno de RAS Mapper). */
  burn: boolean;
}

export const DEFAULT_TERRAIN: TerrainOpts = { surf: 'mdt', p: 1, method: 'promedio', sigma: 0, burn: false };

/** El sensor ve la lámina de agua del caudal base, no el fondo del cauce. */
function seen(src: Float32Array): Float32Array {
  const T = truth();
  const out = new Float32Array(src);
  for (let k = 0; k < out.length; k++) {
    if (Math.abs(T.dist[k]) > HALF_TOP) continue;
    const x = (k % NX) + 0.5;
    const wl = bedZ(x) + BASE_WATER;
    if (out[k] < wl) out[k] = wl;
  }
  return out;
}

/** Ruido vertical de la fuente: una parte suave (correlacionada) y otra por píxel; desviación típica ≈ 1. */
function noiseAt(ci: number, cj: number, p: number, seed: number): number {
  const x = (ci + 0.5) * p, y = (cj + 0.5) * p;
  const smoothN = 0.9 * Math.sin(x / 83 + seed) * Math.cos(y / 67 - seed * 0.7) + 0.6 * Math.sin(x / 41 - y / 53 + seed * 1.3);
  let h = (ci * 73856093) ^ (cj * 19349663) ^ (seed * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const u = ((h >>> 0) % 100000) / 100000;
  const white = (u - 0.5) * 2 * 1.2;
  return (smoothN + white) / 1.17;
}

export interface Raster {
  p: number;
  CX: number;
  CY: number;
  z: Float32Array;
}

/** Remuestrea el terreno de 1 m a píxeles de `p` m con el método elegido y le suma el error de la fuente. */
export function resample(src: Float32Array, p: number, method: Resample, sigma = 0, seed = 3): Raster {
  const CX = Math.ceil(NX / p), CY = Math.ceil(NY / p);
  const z = new Float32Array(CX * CY);
  for (let cj = 0; cj < CY; cj++)
    for (let ci = 0; ci < CX; ci++) {
      const i0 = ci * p, j0 = cj * p, i1 = Math.min(NX, i0 + p), j1 = Math.min(NY, j0 + p);
      let v = 0;
      if (method === 'cercano') {
        const i = Math.min(NX - 1, Math.floor(i0 + p / 2)), j = Math.min(NY - 1, Math.floor(j0 + p / 2));
        v = src[j * NX + i];
      } else {
        let s = 0, n = 0, lo = Infinity, hi = -Infinity;
        for (let j = j0; j < j1; j++)
          for (let i = i0; i < i1; i++) {
            const q = src[j * NX + i];
            s += q;
            n++;
            if (q < lo) lo = q;
            if (q > hi) hi = q;
          }
        v = method === 'promedio' ? s / n : method === 'minimo' ? lo : hi;
      }
      z[cj * CX + ci] = v + (sigma > 0 ? sigma * noiseAt(ci, cj, p, seed) : 0);
    }
  return { p, CX, CY, z };
}

/** El ráster de vuelta a la malla de 1 m (cada píxel de 1 m toma el valor del píxel grueso que lo contiene). */
export function upsample(r: Raster): Float32Array {
  const out = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) {
    const cj = Math.floor(j / r.p);
    for (let i = 0; i < NX; i++) out[j * NX + i] = r.z[cj * r.CX + Math.floor(i / r.p)];
  }
  return out;
}

/** Inserta el cauce levantado (batimetría a 1 m) sobre el terreno: dentro de la boca manda el levantamiento. */
export function burnChannel(fine: Float32Array): Float32Array {
  const T = truth();
  const out = new Float32Array(fine);
  for (let k = 0; k < out.length; k++) if (Math.abs(T.dist[k]) <= HALF_TOP) out[k] = T.mdt[k];
  return out;
}

const CACHE = new Map<string, { fine: Float32Array; raster: Raster }>();
export const terrainKey = (o: TerrainOpts) => `${o.surf}|${o.p}|${o.method}|${o.sigma}|${o.burn}`;

/** El terreno que vería el modelo con esas opciones, en la malla de 1 m, y el ráster grueso. */
export function terrainFor(o: TerrainOpts): { fine: Float32Array; raster: Raster } {
  const key = terrainKey(o);
  const hit = CACHE.get(key);
  if (hit) return hit;
  const T = truth();
  const src = seen(o.surf === 'mdt' ? T.mdt : T.mds);
  const raster = resample(src, o.p, o.method, o.sigma);
  let fine = o.p === 1 && o.sigma === 0 ? src : upsample(raster);
  if (o.burn) fine = burnChannel(fine);
  const r = { fine, raster };
  if (CACHE.size > 14) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, r);
  return r;
}

// ------------------------------------------------------------------ medidas sobre un terreno

/** Corte norte-sur en x: cotas cada metro. */
export function sectionAt(z: Float32Array, x: number): number[] {
  const i = Math.max(0, Math.min(NX - 1, Math.floor(x)));
  return Array.from({ length: NY }, (_, j) => z[j * NX + i]);
}

/** Cota de la orilla (llanura junto al cauce) en x, del terreno verdadero. */
export function bankZ(x: number): number {
  const T = truth();
  const i = Math.max(0, Math.min(NX - 1, Math.floor(x)));
  let lo = Infinity;
  for (const s of [-1, 1]) {
    const y = yc(x) + s * (HALF_TOP + 2.5) * Math.sqrt(1 + ycp(x) ** 2);
    const j = Math.max(0, Math.min(NY - 1, Math.floor(y)));
    lo = Math.min(lo, T.mdt[j * NX + i]);
  }
  return lo;
}

/**
 * Capacidad del cauce en el corte de x: el caudal que cabe bajo la cota de la orilla verdadera, sumando la
 * conducción de franjas de 1 m (n = 0,04, pendiente S0) en ±20 m del eje. Mide cuánto cauce «ve» el terreno.
 */
export function capacityAt(z: Float32Array, x: number, n = 0.04): number {
  const i = Math.max(0, Math.min(NX - 1, Math.floor(x)));
  const eta = bankZ(x);
  const c = yc(x);
  let K = 0;
  for (let j = Math.max(0, Math.floor(c - 20)); j <= Math.min(NY - 1, Math.ceil(c + 20)); j++) {
    const d = eta - z[j * NX + i];
    if (d > 0) K += Math.pow(d, 5 / 3) / n;
  }
  return K * Math.sqrt(S0);
}

/** Capacidad media del cauce en varios cortes (x de 40 a 400 m cada 20 m). */
export function meanCapacity(z: Float32Array): number {
  let s = 0, n = 0;
  for (let x = 40; x <= 400; x += 20) {
    s += capacityAt(z, x + 0.5);
    n++;
  }
  return s / n;
}

/** Cuánto baja la corona del jarillón: promedio de (máximo del terreno en la franja del jarillón − corona verdadera). */
export function leveeLoss(z: Float32Array): number {
  const T = truth();
  let s = 0, n = 0;
  for (let i = LEVEE.x0 + 30; i <= LEVEE.x1 - 30; i += 5) {
    const crest = T.leveeCrest[i];
    if (!Number.isFinite(crest)) continue;
    let m = -Infinity;
    for (let j = 0; j < NY; j++) {
      const d = T.dist[j * NX + i] - LEVEE.dn;
      if (Math.abs(d) <= LEVEE.foot) m = Math.max(m, z[j * NX + i]);
    }
    s += m - crest;
    n++;
  }
  return n ? s / n : 0;
}

/** Error cuadrático medio y sesgo frente al MDT verdadero. */
export function verticalError(z: Float32Array): { rmse: number; bias: number } {
  const T = truth();
  let s = 0, s2 = 0;
  for (let k = 0; k < z.length; k++) {
    const e = z[k] - T.mdt[k];
    s += e;
    s2 += e * e;
  }
  return { rmse: Math.sqrt(s2 / z.length), bias: s / z.length };
}

/** Luz del puente: área bajo la cota de la vía en el eje de la vía [m²]. */
export function bridgeOpening(z: Float32Array): number {
  const i = Math.floor(ROAD.x);
  let A = 0;
  for (let j = 0; j < NY; j++) A += Math.max(0, ROAD_Z - 0.6 - z[j * NX + i]);
  return A;
}

/** Fracción del área de casas que el terreno levanta más de 2 m sobre el MDT. */
export function buildingsRaised(z: Float32Array): number {
  const T = truth();
  const E = COVER_KEYS.indexOf('edificio');
  let a = 0, b = 0;
  for (let k = 0; k < z.length; k++)
    if (T.cover[k] === E) {
      a++;
      if (z[k] - T.mdt[k] > 2) b++;
    }
  return a ? b / a : 0;
}

/** Píxeles por cobertura (fracciones). */
export function coverShares(): Record<Cover, number> {
  const T = truth();
  const out = Object.fromEntries(COVER_KEYS.map((c) => [c, 0])) as Record<Cover, number>;
  for (let k = 0; k < T.cover.length; k++) out[COVER_KEYS[T.cover[k]]]++;
  for (const c of COVER_KEYS) out[c] /= T.cover.length;
  return out;
}

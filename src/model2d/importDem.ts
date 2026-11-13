// Cargar un terreno propio: un GeoTIFF pequeño (un MDT de una sola banda) que el usuario elige en su equipo. Se lee
// en el navegador (no sale del equipo), se reduce si es muy grande promediando bloques de píxeles y queda listo para
// correr el modelo 2D con un n y unas condiciones de borde uniformes. También hay un terreno de ejemplo para quien
// no tenga uno a mano.

import { fromArrayBuffer } from 'geotiff';
import type { CustomDomain } from './solver';
import { geotiff } from './exports';

/** Píxeles máximos con que corre el modelo en el navegador (el terreno se reduce si los pasa). */
export const MAX_PIXELS = 360_000;

export interface DemInfo {
  name: string;
  /** Tamaño del archivo original y su ráster. */
  bytes: number;
  width: number;
  height: number;
  /** Tamaño del píxel original y el que se usa [m]; factor de reducción. */
  pxIn: number;
  px: number;
  factor: number;
  epsg: number | null;
  geographic: boolean;
  zmin: number;
  zmax: number;
  nodata: number;
  notes: string[];
}

/** Lee un GeoTIFF de una banda y lo convierte en un terreno del modelo. */
export async function readDem(buf: ArrayBuffer, name: string): Promise<{ domain: CustomDomain; info: DemInfo }> {
  const tiff = await fromArrayBuffer(buf);
  const img = await tiff.getImage();
  const W = img.getWidth(), H = img.getHeight();
  if (W < 8 || H < 8) throw new Error('El ráster es demasiado pequeño (menos de 8 × 8 píxeles).');
  if (W * H > 60_000_000) throw new Error('El ráster es demasiado grande para leerlo en el navegador (más de 60 millones de píxeles). Recorte un sector pequeño.');
  const notes: string[] = [];
  if (img.getSamplesPerPixel() > 1) notes.push('El archivo tiene varias bandas: se usa la primera.');
  let res: number[] = [1, -1], origin: number[] = [0, H];
  try {
    res = img.getResolution();
    origin = img.getOrigin();
  } catch {
    notes.push('El archivo no trae georreferencia: se supone un píxel de 1 m.');
  }
  const keys = (img.getGeoKeys?.() ?? {}) as Record<string, number>;
  const projected = keys.ProjectedCSTypeGeoKey;
  const geographic = !projected && (keys.GTModelTypeGeoKey === 2 || !!keys.GeographicTypeGeoKey || Math.abs(res[0]) < 0.01);
  const epsg = projected && projected !== 32767 ? projected : null;
  let pxIn = Math.abs(res[0]);
  if (geographic) {
    // grados → metros (aproximado, en la latitud del centro)
    const lat = origin[1] - (H / 2) * Math.abs(res[1]);
    pxIn = Math.abs(res[0]) * 111_320 * Math.cos((lat * Math.PI) / 180);
    notes.push(`Coordenadas geográficas (grados): el píxel se tomó como ${pxIn.toFixed(1)} m aproximados. Para un modelo de verdad use un sistema proyectado (en Colombia, EPSG:9377).`);
  }
  if (Math.abs(Math.abs(res[0]) - Math.abs(res[1])) > 1e-6 * Math.abs(res[0])) notes.push('Los píxeles no son cuadrados: se usa el ancho.');
  const raw = (await img.readRasters({ samples: [0], interleave: true })) as unknown as ArrayLike<number>;
  const nd = img.getGDALNoData();
  const nodata = nd === null || nd === undefined ? NaN : Number(nd);
  const bad = (v: number) => !Number.isFinite(v) || v === nodata || v < -1000 || v > 9000;
  const factor = Math.max(1, Math.ceil(Math.sqrt((W * H) / MAX_PIXELS)));
  if (factor > 1) notes.push(`El ráster tiene ${(W * H).toLocaleString('es-CO')} píxeles: se promediaron bloques de ${factor} × ${factor} (píxel de ${(pxIn * factor).toFixed(2)} m).`);
  const NX = Math.floor(W / factor), NY = Math.floor(H / factor);
  const z = new Float32Array(NX * NY);
  let zmin = Infinity, zmax = -Infinity, holes = 0;
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      let s = 0, n = 0;
      for (let b = 0; b < factor; b++)
        for (let a = 0; a < factor; a++) {
          const r = j * factor + b, c = i * factor + a;
          const v = Number(raw[r * W + c]);
          if (bad(v)) continue;
          s += v;
          n++;
        }
      // fila 0 del archivo = norte; en el modelo j = 0 es el sur
      const k = (NY - 1 - j) * NX + i;
      if (n === 0) {
        z[k] = NaN;
        holes++;
        continue;
      }
      z[k] = s / n;
      zmin = Math.min(zmin, z[k]);
      zmax = Math.max(zmax, z[k]);
    }
  if (!Number.isFinite(zmin)) throw new Error('El ráster no tiene cotas válidas (todo es «sin dato»).');
  if (holes) notes.push(`${holes.toLocaleString('es-CO')} píxeles sin dato quedan fuera del dominio (como paredes).`);
  const px = pxIn * factor;
  const id = `propio-${hash(name, W, H, raw)}`;
  const domain: CustomDomain = { id, name, NX, NY, px, z, E0: origin[0], N0: origin[1] - NY * factor * Math.abs(res[1]), epsg };
  return { domain, info: { name, bytes: buf.byteLength, width: W, height: H, pxIn, px, factor, epsg, geographic, zmin, zmax, nodata, notes } };
}

function hash(name: string, W: number, H: number, a: ArrayLike<number>): string {
  let h = 2166136261 ^ W ^ (H << 12);
  for (let k = 0; k < name.length; k++) h = Math.imul(h ^ name.charCodeAt(k), 16777619);
  const step = Math.max(1, Math.floor(a.length / 4096));
  for (let k = 0; k < a.length; k += step) h = Math.imul(h ^ Math.round(Number(a[k]) * 100), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * Terreno de ejemplo (inventado): una cañada de 360 × 240 m con píxeles de 2 m, una quebrada con un estrechamiento y
 * una terraza baja en la orilla derecha. Sin sistema de referencia (coordenadas locales).
 */
export function exampleDem(): { bytes: Uint8Array; NX: number; NY: number; px: number; z: Float32Array } {
  const NX = 180, NY = 120, px = 2;
  const z = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const x = (i + 0.5) * px, y = (j + 0.5) * px;
      const yc = 120 + 18 * Math.sin((x / 360) * Math.PI * 2) - (x > 200 && x < 240 ? 0 : 0);
      const d = y - yc;
      const narrow = x > 200 && x < 240 ? 0.55 : 1;
      const half = 6 * narrow;
      const ch = Math.abs(d) < half ? 1.8 * (1 - (Math.abs(d) / half) ** 2) : 0;
      const side = d > 0 ? 0.012 * Math.max(0, d - 40) + (d > 10 && d < 40 ? -0.25 : 0) : 0.04 * Math.max(0, -d - 8);
      const walls = Math.max(0, Math.abs(y - 120) - 95) * 0.25;
      z[j * NX + i] = 100 - 0.006 * x - ch + side + walls + 0.05 * Math.sin(x / 9) * Math.cos(y / 7);
    }
  return { bytes: geotiff(NX, NY, z, { E0: 0, N0: 0, px, epsg: null }), NX, NY, px, z };
}

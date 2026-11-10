// Frentes de edificios del Valle de Aburrá (tools/geo/edificios_valle.py): franjas a lo largo de la red vial
// oficial del AMVA, sin montarse sobre vías, cauces ni cerros tutelares. En Medellín, la altura de los
// edificios de cada barrio o vereda sigue la distribución real de su huella construida por número de pisos
// (catastro); en los otros municipios la distribución es ilustrativa. La posición de cada edificio dentro de
// su franja es ilustrativa (azar fijo por franja).

import { unzlibSync } from 'three/examples/jsm/libs/fflate.module.js';
import { EDIFICIOS_INFORME, EDIFICIOS_META, FLUJOS, FRANJAS, N_FRANJAS, ZONAS, ZONAS_NOMBRE } from './edificiosData';

export { EDIFICIOS_INFORME, EDIFICIOS_META };

/** Una franja edificable: empieza en (x, y) [km], corre en la dirección `a` [rad] con los edificios a la
 *  izquierda, mide `L` [m] de frente y `d` [m] de fondo, y pertenece a la zona `z`. */
export interface Franja {
  x: number;
  y: number;
  a: number;
  L: number;
  d: number;
  z: number;
}

/** Grupos de pisos de la tabla de zonas: [mínimo, máximo]. */
export const GRUPOS_PISOS = EDIFICIOS_META.grupos as [number, number][];

export interface Zona {
  /** Fracción de la huella construida en cada grupo de pisos (suma 1). */
  h: number[];
  /** Fracción de los frentes que está construida (0–1). */
  fill: number;
  nombre: string;
  /** true si la distribución sale del catastro de Medellín; false si es ilustrativa. */
  real: boolean;
}

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

class Reader {
  k = 0;
  constructor(private b: Uint8Array) {}
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

/** cos(2πa/128) × 4096 redondeado; sen(x) = cos(x − π/2), es decir, el índice a − 32. */
const COS4096 = Array.from({ length: 128 }, (_, a) => Math.floor(Math.cos((a / 128) * 2 * Math.PI) * 4096 + 0.5));

let cache: Franja[] | null = null;
/** Todas las franjas, decodificadas una vez. */
export function franjas(): Franja[] {
  if (cache) return cache;
  const raw = unzlibSync(b64(FRANJAS));
  const off = [0];
  for (const l of FLUJOS) off.push(off[off.length - 1] + l);
  const s = off.map((o, i) => (i < FLUJOS.length ? raw.subarray(o, o + FLUJOS[i]) : raw.subarray(0, 0)));
  const rx = new Reader(s[0]), ry = new Reader(s[1]), ra = new Reader(s[2]), rl = new Reader(s[3]), rz = new Reader(s[5]);
  const depth = s[4];
  const out: Franja[] = new Array(N_FRANJAS);
  let ex = 0, ey = 0, a = 0, z = 0;
  const Q = 2; // m por unidad
  for (let i = 0; i < N_FRANJAS; i++) {
    const x = ex + rx.z(), y = ey + ry.z();
    a = (((a + ra.z()) % 128) + 128) % 128;
    const L = rl.u();
    z += rz.z();
    const ang = (a / 128) * Math.PI * 2;
    out[i] = { x: (x * Q) / 1000, y: (y * Q) / 1000, a: ang, L: L * Q, d: depth[i] * 2, z };
    // final de la franja con enteros (igual que el generador): punto de partida de la siguiente
    ex = x + Math.floor((L * COS4096[a] + 2048) / 4096);
    ey = y + Math.floor((L * COS4096[(a + 96) % 128] + 2048) / 4096);
  }
  cache = out;
  return out;
}

const zonas: Zona[] = (ZONAS as unknown as [number[], number][]).map(([h, fill], i) => {
  const t = h.reduce((a, b) => a + b, 0) || 1;
  return { h: h.map((v) => v / t), fill: fill / 100, nombre: ZONAS_NOMBRE[i][0] as string, real: ZONAS_NOMBRE[i][1] === 1 };
});
export function zona(i: number): Zona {
  return zonas[Math.max(0, Math.min(zonas.length - 1, i))];
}
export const N_ZONAS = zonas.length;

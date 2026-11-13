// Archivos para llevar el ejercicio a HEC-RAS: el terreno y las coberturas en GeoTIFF, el área 2D, las líneas de
// borde, las líneas de quiebre y las regiones de refinamiento en shapefile, los hidrogramas en CSV y un LEAME, todo
// en un ZIP. Y los resultados: profundidad, cota y velocidad máximas en GeoTIFF y las series en CSV.
//
// Las coordenadas son ficticias y están declaradas como tales: el valle se ubica en el sistema MAGNA-SIRGAS 2018 /
// Origen-Nacional (EPSG:9377) sobre el océano Pacífico, lejos de la costa, para que nadie lo confunda con un lugar
// real.

import { COVER_KEYS, COVERS, LEVEE, NX, NY, ROAD, truth, yc } from './terrain';
import { domainOf, hydroQ, type BcLine, type Geometry, type RunOpts, type RunResult } from './solver';

/** Esquina suroeste ficticia del valle en EPSG:9377 (≈ 3,97° N, 80,19° O: mar abierto). */
export const ORIGIN = { E: 4_200_000, N: 2_000_000 };
export const EPSG = 9377;
/** Definición del sistema en WKT de ESRI (para los .prj). */
export const PRJ_9377 =
  'PROJCS["MAGNA-SIRGAS_2018_Origen-Nacional",GEOGCS["MAGNA-SIRGAS_2018",DATUM["Marco_Geocentrico_Nacional_de_Referencia_2018",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",5000000.0],PARAMETER["False_Northing",2000000.0],PARAMETER["Central_Meridian",-73.0],PARAMETER["Scale_Factor",0.9992],PARAMETER["Latitude_Of_Origin",4.0],UNIT["Meter",1.0]]';

const enc = new TextEncoder();

// ------------------------------------------------------------------ ZIP (sin compresión)

let CRC_T: Uint32Array | null = null;
export function crc32(b: Uint8Array): number {
  if (!CRC_T) {
    CRC_T = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_T[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipFile {
  name: string;
  data: Uint8Array | string;
}

/** Un ZIP «almacenado» (método 0): cualquier programa lo abre y no necesita bibliotecas. */
export function zip(files: ZipFile[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  const now = new Date(2026, 0, 1);
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true);
    lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true);
    ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, off, true);
  return concat([...parts, ...central, new Uint8Array(end.buffer)]);
}

function concat(list: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(list.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const b of list) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}

// ------------------------------------------------------------------ GeoTIFF

export interface GeoTiffOpts {
  /** Esquina suroeste [m] y tamaño del píxel [m]. */
  E0: number;
  N0: number;
  px: number;
  nodata?: number;
  /** Código EPSG del sistema (null: sin sistema declarado). */
  epsg?: number | null;
}

/**
 * GeoTIFF de una banda (flotante de 32 bits o entero sin signo de 8 bits), sin compresión, con la georreferencia
 * (píxel de esquina y tamaño) y el sistema EPSG:9377. `data` va por filas de sur a norte (como el modelo); el
 * archivo se escribe de norte a sur, como pide el formato.
 */
export function geotiff(w: number, h: number, data: Float32Array | Uint8Array, o: GeoTiffOpts): Uint8Array {
  const float = data instanceof Float32Array;
  const bps = float ? 4 : 1;
  const raster = new Uint8Array(w * h * bps);
  const rv = new DataView(raster.buffer);
  for (let r = 0; r < h; r++) {
    const j = h - 1 - r;
    for (let i = 0; i < w; i++) {
      const v = data[j * w + i];
      if (float) rv.setFloat32((r * w + i) * 4, Number.isNaN(v) ? (o.nodata ?? -9999) : v, true);
      else raster[r * w + i] = v;
    }
  }
  const code = o.epsg === undefined ? EPSG : o.epsg;
  const geoKeys = code ? [1, 1, 0, 4, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, code, 3076, 0, 1, 9001] : [1, 1, 0, 2, 1024, 0, 1, 1, 1025, 0, 1, 1];
  const nodata = enc.encode(`${o.nodata ?? -9999}\0`);
  type Tag = { tag: number; type: number; count: number; value: number[] | Uint8Array };
  const tags: Tag[] = [
    { tag: 256, type: 4, count: 1, value: [w] },
    { tag: 257, type: 4, count: 1, value: [h] },
    { tag: 258, type: 3, count: 1, value: [bps * 8] },
    { tag: 259, type: 3, count: 1, value: [1] },
    { tag: 262, type: 3, count: 1, value: [1] },
    { tag: 273, type: 4, count: 1, value: [0] },
    { tag: 277, type: 3, count: 1, value: [1] },
    { tag: 278, type: 4, count: 1, value: [h] },
    { tag: 279, type: 4, count: 1, value: [raster.length] },
    { tag: 284, type: 3, count: 1, value: [1] },
    { tag: 339, type: 3, count: 1, value: [float ? 3 : 1] },
    { tag: 33550, type: 12, count: 3, value: [o.px, o.px, 0] },
    { tag: 33922, type: 12, count: 6, value: [0, 0, 0, o.E0, o.N0 + h * o.px, 0] },
    { tag: 34735, type: 3, count: geoKeys.length, value: geoKeys },
  ];
  if (float) tags.push({ tag: 42113, type: 2, count: nodata.length, value: nodata });
  const size = (t: Tag) => t.count * (t.type === 3 ? 2 : t.type === 4 ? 4 : t.type === 12 ? 8 : 1);
  const ifdSize = 2 + tags.length * 12 + 4;
  let extra = 8 + ifdSize;
  const extraOff = new Map<Tag, number>();
  for (const t of tags)
    if (size(t) > 4) {
      extraOff.set(t, extra);
      extra += size(t) + (size(t) % 2);
    }
  const dataOff = extra;
  (tags.find((t) => t.tag === 273)!.value as number[])[0] = dataOff;
  const out = new Uint8Array(dataOff + raster.length);
  const v = new DataView(out.buffer);
  out[0] = 0x49;
  out[1] = 0x49;
  v.setUint16(2, 42, true);
  v.setUint32(4, 8, true);
  v.setUint16(8, tags.length, true);
  const put = (off: number, t: Tag) => {
    const vals = t.value;
    for (let k = 0; k < t.count; k++) {
      const x = vals[k] as number;
      if (t.type === 3) v.setUint16(off + 2 * k, x, true);
      else if (t.type === 4) v.setUint32(off + 4 * k, x, true);
      else if (t.type === 12) v.setFloat64(off + 8 * k, x, true);
      else out[off + k] = x;
    }
  };
  tags.forEach((t, k) => {
    const e = 10 + k * 12;
    v.setUint16(e, t.tag, true);
    v.setUint16(e + 2, t.type, true);
    v.setUint32(e + 4, t.count, true);
    if (size(t) > 4) {
      v.setUint32(e + 8, extraOff.get(t)!, true);
      put(extraOff.get(t)!, t);
    } else put(e + 8, t);
  });
  v.setUint32(10 + tags.length * 12, 0, true);
  out.set(raster, dataOff);
  return out;
}

// ------------------------------------------------------------------ shapefile

export type Pt = [number, number];
export interface ShpRecord {
  parts: Pt[][];
  attrs: Record<string, string | number>;
}

/** Shapefile de líneas (3) o polígonos (5) con sus atributos: .shp, .shx, .dbf, .prj y .cpg. */
export function shapefile(base: string, type: 3 | 5, recs: ShpRecord[], fields: { name: string; type: 'C' | 'N'; len: number; dec?: number }[]): ZipFile[] {
  const box = (pts: Pt[]) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of pts) {
      a = Math.min(a, x);
      b = Math.min(b, y);
      c = Math.max(c, x);
      d = Math.max(d, y);
    }
    return [a, b, c, d];
  };
  const all = recs.flatMap((r) => r.parts.flat());
  const B = box(all);
  const contents = recs.map((r) => {
    const pts = r.parts.flat();
    const len = 44 + 4 * r.parts.length + 16 * pts.length;
    const b = new DataView(new ArrayBuffer(len));
    b.setInt32(0, type, true);
    box(pts).forEach((x, k) => b.setFloat64(4 + 8 * k, x, true));
    b.setInt32(36, r.parts.length, true);
    b.setInt32(40, pts.length, true);
    let start = 0;
    r.parts.forEach((p, k) => {
      b.setInt32(44 + 4 * k, start, true);
      start += p.length;
    });
    const p0 = 44 + 4 * r.parts.length;
    pts.forEach(([x, y], k) => {
      b.setFloat64(p0 + 16 * k, x, true);
      b.setFloat64(p0 + 16 * k + 8, y, true);
    });
    return new Uint8Array(b.buffer);
  });
  const header = (fileLen: number) => {
    const h = new DataView(new ArrayBuffer(100));
    h.setInt32(0, 9994, false);
    h.setInt32(24, fileLen / 2, false);
    h.setInt32(28, 1000, true);
    h.setInt32(32, type, true);
    B.forEach((x, k) => h.setFloat64(36 + 8 * k, x, true));
    return new Uint8Array(h.buffer);
  };
  const shpLen = 100 + contents.reduce((a, c) => a + 8 + c.length, 0);
  const shp: Uint8Array[] = [header(shpLen)];
  const shx: Uint8Array[] = [header(100 + 8 * recs.length)];
  let off = 100;
  contents.forEach((c, k) => {
    const rh = new DataView(new ArrayBuffer(8));
    rh.setInt32(0, k + 1, false);
    rh.setInt32(4, c.length / 2, false);
    shp.push(new Uint8Array(rh.buffer), c);
    const xh = new DataView(new ArrayBuffer(8));
    xh.setInt32(0, off / 2, false);
    xh.setInt32(4, c.length / 2, false);
    shx.push(new Uint8Array(xh.buffer));
    off += 8 + c.length;
  });
  // dBASE III con texto en UTF-8 (declarado en el .cpg)
  const recLen = 1 + fields.reduce((a, f) => a + f.len, 0);
  const hdrLen = 32 + 32 * fields.length + 1;
  const dbf = new Uint8Array(hdrLen + recLen * recs.length + 1).fill(0x20, hdrLen);
  const dv = new DataView(dbf.buffer);
  dbf.fill(0, 0, hdrLen);
  dbf[0] = 3;
  dbf[1] = 126;
  dbf[2] = 1;
  dbf[3] = 1;
  dv.setUint32(4, recs.length, true);
  dv.setUint16(8, hdrLen, true);
  dv.setUint16(10, recLen, true);
  fields.forEach((f, k) => {
    const o = 32 + 32 * k;
    dbf.set(enc.encode(f.name.slice(0, 10)), o);
    dbf[o + 11] = f.type.charCodeAt(0);
    dbf[o + 16] = f.len;
    dbf[o + 17] = f.dec ?? 0;
  });
  dbf[hdrLen - 1] = 0x0d;
  recs.forEach((r, k) => {
    let o = hdrLen + k * recLen;
    dbf[o++] = 0x20;
    for (const f of fields) {
      const raw = r.attrs[f.name];
      let s = f.type === 'N' ? (typeof raw === 'number' ? raw.toFixed(f.dec ?? 0) : '') : String(raw ?? '');
      let b = enc.encode(s);
      while (b.length > f.len) {
        s = s.slice(0, -1);
        b = enc.encode(s);
      }
      if (f.type === 'N') dbf.set(b, o + f.len - b.length);
      else dbf.set(b, o);
      o += f.len;
    }
  });
  dbf[dbf.length - 1] = 0x1a;
  return [
    { name: `${base}.shp`, data: concat(shp) },
    { name: `${base}.shx`, data: concat(shx) },
    { name: `${base}.dbf`, data: dbf },
    { name: `${base}.prj`, data: PRJ_9377 },
    { name: `${base}.cpg`, data: 'UTF-8' },
  ];
}

// ------------------------------------------------------------------ el paquete para HEC-RAS

const E = (x: number) => Math.round((ORIGIN.E + x) * 100) / 100;
const N = (y: number) => Math.round((ORIGIN.N + y) * 100) / 100;
const P = (x: number, y: number): Pt => [E(x), N(y)];

/** Una banda de ancho variable alrededor de una curva y = f(x) como polígono (sentido horario). */
function band(x0: number, x1: number, lo: (x: number) => number, hi: (x: number) => number, dx = 5): Pt[] {
  const top: Pt[] = [], bot: Pt[] = [];
  for (let x = x0; x <= x1 + 1e-9; x += dx) {
    top.push(P(x, Math.min(NY, hi(x))));
    bot.push(P(x, Math.max(0, lo(x))));
  }
  const ring = [...top, ...bot.reverse()];
  ring.push(ring[0]);
  return ring;
}
const levY = (x: number) => yc(x) + LEVEE.dn * Math.sqrt(1 + (((30 * 2 * Math.PI) / 320) * Math.cos((2 * Math.PI * x) / 320)) ** 2);

const bcPts = (l: BcLine, W: number, H: number): Pt[] => (l.side === 'O' ? [P(0, l.from), P(0, l.to)] : l.side === 'E' ? [P(W, l.from), P(W, l.to)] : l.side === 'S' ? [P(l.from, 0), P(l.to, 0)] : [P(l.from, H), P(l.to, H)]);

/** CSV del hidrograma de entrada (cada minuto). */
export function hydrographCsv(o: RunOpts): string {
  const rows = ['tiempo_min;caudal_m3s'];
  for (let t = -o.warmup; t <= o.duration; t++) rows.push(`${t};${hydroQ(o.hydro, t * 60).toFixed(3).replace('.', ',')}`);
  return rows.join('\r\n') + '\r\n';
}

const FICTION = [
  'COORDENADAS FICTICIAS. El valle de este ejercicio es inventado. Para poder abrirlo en un SIG y en HEC-RAS se le dieron',
  `coordenadas en MAGNA-SIRGAS 2018 / Origen-Nacional (EPSG:${EPSG}) con la esquina suroeste en E = ${ORIGIN.E.toLocaleString('es-CO')} m,`,
  `N = ${ORIGIN.N.toLocaleString('es-CO')} m, un punto del océano Pacífico (≈ 3,97° N, 80,19° O) lejos de la costa: no es un lugar real`,
  'de Colombia ni de Medellín, y las cotas (cerca de 1480 m) no tienen relación con ese sitio.',
].join('\r\n');

/** Paquete para armar el modelo en HEC-RAS 6 con el terreno, las coberturas, las líneas y el hidrograma de la sala. */
export function hecrasPackage(o: RunOpts, fine: Float32Array, nByCover: Record<string, number>, refine: { name: string; c: number }[]): Uint8Array {
  const T = truth();
  const files: ZipFile[] = [];
  const geo = { E0: ORIGIN.E, N0: ORIGIN.N, px: 1 };
  files.push({ name: 'terreno/terreno_1m.tif', data: geotiff(NX, NY, fine, geo) });
  const cls = new Uint8Array(NX * NY);
  for (let k = 0; k < cls.length; k++) cls[k] = T.cover[k] + 1;
  files.push({ name: 'coberturas/coberturas.tif', data: geotiff(NX, NY, cls, geo) });
  files.push({ name: 'coberturas/coberturas_n.csv', data: ['codigo;cobertura;n_manning', ...COVER_KEYS.map((c, k) => `${k + 1};${COVERS[c].name};${(nByCover[c] ?? COVERS[c].n[1]).toFixed(3).replace('.', ',')}`)].join('\r\n') + '\r\n' });
  files.push(...shapefile('geometria/area_2d', 5, [{ parts: [[P(0, 0), P(0, NY), P(NX, NY), P(NX, 0), P(0, 0)]], attrs: { nombre: 'Valle', celda_m: o.mesh.c } }], [{ name: 'nombre', type: 'C', len: 40 }, { name: 'celda_m', type: 'N', len: 6 }]));
  const bcs = o.bcs ?? [
    { side: 'O' as const, from: 0, to: NY, kind: 'caudal' as const, slope: o.egSlope },
    { side: 'E' as const, from: 0, to: NY, kind: 'normal' as const, slope: o.outSlope },
  ];
  files.push(...shapefile('geometria/lineas_borde', 3, bcs.map((l) => ({ parts: [bcPts(l, NX, NY)], attrs: { nombre: l.kind === 'caudal' ? 'Entrada' : 'Salida', tipo: l.kind === 'caudal' ? 'Flow Hydrograph' : 'Normal Depth', pendiente: l.slope } })), [{ name: 'nombre', type: 'C', len: 20 }, { name: 'tipo', type: 'C', len: 30 }, { name: 'pendiente', type: 'N', len: 10, dec: 5 }]));
  const lev: Pt[] = [];
  for (let x = LEVEE.x0 + 8; x <= LEVEE.x1 - 4; x += 4) lev.push(P(x, levY(x)));
  const yb = yc(ROAD.x);
  files.push(
    ...shapefile(
      'geometria/lineas_quiebre',
      3,
      [
        { parts: [lev], attrs: { nombre: 'Corona del jarillón', celda_m: 10 } },
        { parts: [[P(ROAD.x, 0), P(ROAD.x, yb - ROAD.open - 2)], [P(ROAD.x, yb + ROAD.open + 2), P(ROAD.x, NY)]], attrs: { nombre: 'Eje de la vía', celda_m: 10 } },
      ],
      [{ name: 'nombre', type: 'C', len: 40 }, { name: 'celda_m', type: 'N', len: 6 }],
    ),
  );
  const regions: ShpRecord[] = [];
  for (const r of refine) {
    if (r.name === 'cauce') regions.push({ parts: [band(0, NX, (x) => yc(x) - 14, (x) => yc(x) + 14)], attrs: { nombre: 'Cauce y orillas', celda_m: r.c } });
    if (r.name === 'jarillon') regions.push({ parts: [band(LEVEE.x0 - 10, LEVEE.x1 + 10, (x) => levY(x) - 10, (x) => levY(x) + 10)], attrs: { nombre: 'Jarillón', celda_m: r.c } });
    if (r.name === 'barrio') regions.push({ parts: [[P(100, 236), P(100, 356), P(440, 356), P(440, 236), P(100, 236)]], attrs: { nombre: 'Barrio', celda_m: r.c } });
    if (r.name === 'puente') regions.push({ parts: [band(400, 490, (x) => yc(x) - 40, (x) => yc(x) + 40)], attrs: { nombre: 'Puente y vía', celda_m: r.c } });
  }
  if (regions.length) files.push(...shapefile('geometria/regiones_refinamiento', 5, regions, [{ name: 'nombre', type: 'C', len: 40 }, { name: 'celda_m', type: 'N', len: 6 }]));
  files.push({ name: 'flujo/hidrograma_entrada.csv', data: hydrographCsv(o) });
  files.push({ name: 'flujo/condiciones_de_borde.csv', data: ['linea;tipo;dato', ...bcs.map((l) => `${l.kind === 'caudal' ? 'Entrada' : 'Salida'};${l.kind === 'caudal' ? 'Flow Hydrograph (con pendiente de energía para repartir)' : 'Normal Depth'};pendiente ${String(l.slope).replace('.', ',')}`)].join('\r\n') + '\r\n' });
  files.push({ name: 'LEAME.txt', data: readmeModel(o, refine) });
  return zip(files);
}

function readmeModel(o: RunOpts, refine: { name: string; c: number }[]): string {
  return [
    'Laboratorio del agua · Modelación hidráulica 2D',
    'Paquete para armar el modelo del valle en HEC-RAS 6',
    '',
    FICTION,
    '',
    'CONTENIDO',
    '  terreno/terreno_1m.tif           Terreno de 1 m (Float32, m s. n. m.) tal como lo usa la sala.',
    '  coberturas/coberturas.tif        Clases de cobertura (1 a 7) en píxeles de 1 m.',
    '  coberturas/coberturas_n.csv      n de Manning de cada clase.',
    '  geometria/area_2d.shp            Perímetro del área 2D.',
    '  geometria/lineas_borde.shp       Líneas de condición de borde (entrada y salida).',
    '  geometria/lineas_quiebre.shp     Corona del jarillón y eje de la vía.',
    refine.length ? '  geometria/regiones_refinamiento.shp  Regiones con celdas más pequeñas (atributo celda_m).' : '',
    '  flujo/hidrograma_entrada.csv     Hidrograma de entrada, minuto a minuto (incluye las condiciones iniciales).',
    '  flujo/condiciones_de_borde.csv   Tipo y pendiente de cada línea de borde.',
    '',
    'PASOS EN HEC-RAS 6',
    '  1. RAS Mapper → Set Projection: el archivo .prj de cualquier shapefile (EPSG:9377).',
    '  2. Terrains → Create a New RAS Terrain: terreno/terreno_1m.tif.',
    '  3. Map Layers → Land Cover: coberturas/coberturas.tif; asigne a cada clase el n de coberturas_n.csv.',
    `  4. Geometries → 2D Flow Areas: importe area_2d.shp; celdas de ${o.mesh.c} m; Breaklines: lineas_quiebre.shp${refine.length ? '; Refinement Regions: regiones_refinamiento.shp' : ''}.`,
    '  5. BC Lines: importe lineas_borde.shp (Entrada: Flow Hydrograph; Salida: Normal Depth) con las pendientes del CSV.',
    '  6. Unsteady Flow Data: pegue el hidrograma de flujo/hidrograma_entrada.csv en la línea de entrada.',
    `  7. Plan: ecuaciones ${o.eq === 'difusiva' ? 'Diffusion Wave' : o.eq === 'swe' ? 'Shallow Water (SWE)' : 'de inercia local (en HEC-RAS: use SWE o DWE)'}; paso ${o.dtMode === 'fijo' ? `fijo de ${o.dt} s` : `ajustable con Courant máximo ${o.courantMax}`}; θ = ${o.theta}; tolerancia ${o.tolWS} m; ${o.maxIter} iteraciones.`,
    '',
    'ADVERTENCIA',
    '  Ejercicio educativo. No es un estudio de amenaza, no es un pronóstico oficial de inundación y las obras no son diseños',
    '  de ingeniería. Los resultados de HEC-RAS no tienen por qué coincidir con los de la sala: cambian la malla, el',
    '  preprocesador y los métodos numéricos.',
    '',
  ]
    .filter((l, k, a) => l !== '' || a[k - 1] !== '')
    .join('\r\n');
}

/** Resultados de una corrida: profundidad, cota y velocidad máximas por píxel y las series. */
export function resultsPackage(r: RunResult, name = 'corrida'): Uint8Array {
  const g = r.geom;
  const depth = new Float32Array(g.NX * g.NY), wse = new Float32Array(g.NX * g.NY), vel = new Float32Array(g.NX * g.NY);
  for (let k = 0; k < depth.length; k++) {
    const ci = g.pmap[k];
    const z = g.z[k];
    if (ci < 0 || Number.isNaN(z)) {
      depth[k] = wse[k] = vel[k] = NaN;
      continue;
    }
    const d = r.etaMax[ci] - z;
    depth[k] = d > 0.005 ? d : 0;
    wse[k] = d > 0.005 ? r.etaMax[ci] : NaN;
    vel[k] = d > 0.005 ? r.vMax[ci] : 0;
  }
  const valley = g.site === 'valle';
  const dom = valley ? null : domainOf(g.site);
  const geo = { E0: valley ? ORIGIN.E : (dom?.E0 ?? 0), N0: valley ? ORIGIN.N : (dom?.N0 ?? 0), px: g.px, epsg: valley ? EPSG : (dom?.epsg ?? null) };
  const s = r.series;
  const rows = ['tiempo_min;caudal_entrada_m3s;caudal_salida_m3s;caudal_puente_m3s;cota_puente_m;volumen_m3'];
  s.t.forEach((t, k) => rows.push([t / 60, s.qin[k], s.qout[k], s.qBridge[k], s.wseBridge[k], s.vol[k]].map((v, j) => (Number.isFinite(v) ? v.toFixed(j === 0 ? 1 : 3) : '').replace('.', ',')).join(';')));
  const files: ZipFile[] = [
    { name: `${name}/profundidad_maxima.tif`, data: geotiff(g.NX, g.NY, depth, geo) },
    { name: `${name}/cota_maxima.tif`, data: geotiff(g.NX, g.NY, wse, geo) },
    { name: `${name}/velocidad_maxima.tif`, data: geotiff(g.NX, g.NY, vel, geo) },
    { name: `${name}/series.csv`, data: rows.join('\r\n') + '\r\n' },
    {
      name: `${name}/LEAME.txt`,
      data: [
        'Laboratorio del agua · Modelación hidráulica 2D · Resultados de una corrida',
        '',
        valley ? FICTION : dom?.epsg ? `Terreno propio: con la georreferencia del archivo cargado (EPSG:${dom.epsg}).` : 'Terreno propio: con la esquina y el tamaño del píxel del archivo cargado; el archivo no declaraba un sistema de referencia y estos tampoco lo declaran.',
        '',
        `Máximos de la corrida (${r.opts.eq}, celdas de ${g.c} m${g.uniform ? '' : ' refinadas'}, ${(r.opts.duration).toFixed(0)} min).`,
        'profundidad_maxima.tif  Profundidad máxima por píxel [m] (nivel máximo de la celda menos el terreno del píxel).',
        'cota_maxima.tif         Cota máxima del agua [m] (sin dato donde no hubo agua).',
        'velocidad_maxima.tif    Velocidad máxima de la celda [m/s].',
        'series.csv              Caudales de entrada, salida y bajo el puente, nivel aguas arriba del puente y volumen.',
        '',
        'Ejercicio educativo: no es un estudio de amenaza ni un pronóstico oficial de inundación.',
      ].join('\r\n'),
    },
  ];
  return zip(files);
}

/** Geometría de una corrida como texto (para el resumen del paquete). */
export const meshNote = (g: Geometry) => `${g.NC.toLocaleString('es-CO')} celdas, ${g.NF.toLocaleString('es-CO')} caras`;

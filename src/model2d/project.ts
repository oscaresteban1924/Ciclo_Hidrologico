// Proyecto, reporte y comparación con HEC-RAS de «El modelo completo» (sala de modelación 2D).
//
// - Proyecto: las decisiones del modelo (fuente del terreno, malla, condiciones de borde, creciente, plan) en un
//   archivo JSON que se guarda en el equipo y se vuelve a abrir. Al abrirlo se valida cada dato contra las opciones
//   de la sala; lo que no se reconoce se deja como estaba y se avisa.
// - Reporte: una página HTML autocontenida con las decisiones, los resultados, el hidrograma, las series y una imagen
//   de la escena; se abre en cualquier navegador y se imprime a PDF.
// - Comparación con HEC-RAS: se carga la profundidad máxima que exporta RAS Mapper (GeoTIFF en EPSG:9377, sobre el
//   paquete que da la sala) y se compara píxel a píxel con la de la corrida: áreas mojadas, índice de ajuste F, aciertos,
//   falsas alarmas y diferencias de profundidad.

import { fromArrayBuffer } from 'geotiff';
import { DEFAULT_MODEL, N_LEVEL_NAMES, REFINE_NAMES, SOURCES, type ModelScene, type Summary } from './scene';
import { PERIODS } from './hydrology';
import { BUILDING_NAMES, EQ_NAMES, type RunResult } from './solver';

export const PROJECT_KIND = 'laboratorio-del-agua/modelo-2d';
export const PROJECT_VERSION = 1;

/** Opciones válidas de cada dato (las mismas de la sala). */
const CHOICES: { [K in keyof ModelScene]?: readonly (string | number | boolean)[] } = {
  crs: ['origen', 'geograficas'],
  source: SOURCES.map((s) => s.id),
  burn: [true, false],
  level: ['min', 'normal', 'max'],
  buildings: ['n', 'bloque', 'nada'],
  c: [5, 10, 20, 40],
  breaklines: [true, false],
  refine: ['no', 'cauce10', 'cauce5'],
  egSlope: [0.001, 0.005, 0.02],
  outSlope: [0.0005, 0.002, 0.005, 0.02],
  T: PERIODS,
  dtMode: ['fijo', 'courant'],
  dt: [1, 2, 5, 10, 15, 20, 30, 60],
  courantMax: [0.5, 0.7, 0.9, 1, 2, 3, 5],
  eq: ['difusiva', 'inercia', 'swe'],
  tolWS: [0.001, 0.003, 0.01, 0.03],
  layer: ['natural', 'profundidad', 'velocidad', 'cota', 'amenaza', 'llegada', 'courant', 'iteraciones'],
};
/** Rangos de los datos continuos (los de los controles de la sala). */
const RANGES: { [K in keyof ModelScene]?: [number, number] } = { step: [0, 20], tp: [10, 60], warmup: [10, 40], theta: [0.6, 1], maxIter: [2, 40], duration: [80, 180] };

/** Nombre de cada dato para el reporte y los avisos. */
export const FIELD_NAMES: Record<keyof ModelScene, string> = {
  step: 'Paso del recorrido',
  crs: 'Sistema de coordenadas',
  source: 'Fuente del terreno',
  burn: 'Cauce grabado en el terreno',
  level: 'Rugosidad (nivel de n)',
  buildings: 'Edificios',
  c: 'Tamaño de las celdas [m]',
  breaklines: 'Líneas de quiebre',
  refine: 'Refinamiento',
  egSlope: 'Pendiente de energía en la entrada [%]',
  outSlope: 'Pendiente de fricción en la salida [%]',
  T: 'Periodo de retorno [años]',
  tp: 'Tiempo al pico [min]',
  warmup: 'Condiciones iniciales [min]',
  duration: 'Duración del evento [min]',
  dtMode: 'Paso de tiempo',
  dt: 'Δt [s]',
  courantMax: 'Courant máximo',
  eq: 'Ecuaciones',
  theta: 'Peso implícito θ',
  tolWS: 'Tolerancia del nivel [mm]',
  maxIter: 'Iteraciones máximas',
  layer: 'Capa del agua',
};

export function projectJson(s: ModelScene, note = ''): string {
  return JSON.stringify({ tipo: PROJECT_KIND, version: PROJECT_VERSION, guardado: new Date().toISOString(), nota: note, escena: s }, null, 2);
}

/** Lee un proyecto: devuelve la escena (con los datos válidos) y los avisos de lo que no se pudo usar. */
export function parseProject(text: string): { s: ModelScene; warnings: string[] } | { error: string } {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return { error: 'El archivo no es un JSON válido.' };
  }
  const obj = o as { tipo?: unknown; version?: unknown; escena?: unknown };
  if (!obj || typeof obj !== 'object' || obj.tipo !== PROJECT_KIND) return { error: 'El archivo no es un proyecto de «El modelo completo» del Laboratorio del agua.' };
  if (typeof obj.version !== 'number' || obj.version > PROJECT_VERSION) return { error: `El proyecto es de una versión más nueva (${String(obj.version)}) que la de esta sala (${PROJECT_VERSION}).` };
  const e = (obj.escena ?? {}) as Record<string, unknown>;
  const s: ModelScene = { ...DEFAULT_MODEL };
  const warnings: string[] = [];
  for (const k of Object.keys(DEFAULT_MODEL) as (keyof ModelScene)[]) {
    if (!(k in e)) {
      warnings.push(`Falta «${FIELD_NAMES[k]}»: queda el valor por omisión.`);
      continue;
    }
    const v = e[k];
    const ch = CHOICES[k], rg = RANGES[k];
    if (ch) {
      if (ch.includes(v as never)) (s as unknown as Record<string, unknown>)[k] = v;
      else warnings.push(`«${FIELD_NAMES[k]}» = ${JSON.stringify(v)} no es una opción de la sala: queda ${JSON.stringify(DEFAULT_MODEL[k])}.`);
    } else if (rg) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= rg[0] && v <= rg[1]) (s as unknown as Record<string, unknown>)[k] = k === 'step' || k === 'maxIter' ? Math.round(v) : v;
      else warnings.push(`«${FIELD_NAMES[k]}» = ${JSON.stringify(v)} está fuera del rango ${rg[0]}–${rg[1]}: queda ${JSON.stringify(DEFAULT_MODEL[k])}.`);
    }
  }
  for (const k of Object.keys(e)) if (!(k in DEFAULT_MODEL)) warnings.push(`Se ignoró el dato desconocido «${k}».`);
  return { s, warnings };
}

// ---------------------------------------------------------------- reporte

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const num = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');

function valueText(k: keyof ModelScene, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  switch (k) {
    case 'source':
      return SOURCES.find((x) => x.id === v)?.name ?? String(v);
    case 'crs':
      return v === 'origen' ? 'MAGNA-SIRGAS 2018 / Origen-Nacional (EPSG:9377)' : 'Geográficas en grados (EPSG:4326)';
    case 'level':
      return N_LEVEL_NAMES[v as ModelScene['level']] ?? String(v);
    case 'buildings':
      return BUILDING_NAMES[v as ModelScene['buildings']] ?? String(v);
    case 'refine':
      return REFINE_NAMES[v as ModelScene['refine']] ?? String(v);
    case 'eq':
      return EQ_NAMES[v as ModelScene['eq']] ?? String(v);
    case 'dtMode':
      return v === 'fijo' ? 'Fijo' : 'Ajustado por el número de Courant';
    case 'egSlope':
    case 'outSlope':
      return num((v as number) * 100, 2);
    case 'tolWS':
      return num((v as number) * 1000, 0);
  }
  if (typeof v === 'number') return num(v, Number.isInteger(v) ? 0 : 2);
  return String(v);
}

/** Marcas «redondas» de un eje (1, 2, 2,5 o 5 por potencia de diez). */
function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1;
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => span / x <= n + 0.5) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Polilínea SVG de varias series (minutos en x). */
function svgChart(series: { name: string; color: string; t: number[]; y: number[] }[], yLabel: string): string {
  const W = 640, H = 240, L = 54, R = 12, T = 14, B = 34;
  const xs = series.flatMap((s) => s.t), ys = series.flatMap((s) => s.y).filter(Number.isFinite);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys);
  const ymax = Math.max(...ys) || 1;
  const yt = niceTicks(y0, ymax);
  if (yt.length > 1 && yt[yt.length - 1] < ymax) yt.push(yt[yt.length - 1] + (yt[1] - yt[0]));
  const y1 = yt[yt.length - 1];
  const xt = niceTicks(x0, x1, 6);
  const X = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R), Y = (y: number) => H - B - ((y - y0) / (y1 - y0 || 1)) * (H - T - B);
  let g = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(yLabel)}">`;
  for (const v of yt) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e3e8ec"/><text x="${L - 6}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="#5b6b78">${num(v, y1 < 10 ? 1 : 0)}</text>`;
  for (const v of xt) g += `<text x="${X(v)}" y="${H - B + 16}" font-size="11" text-anchor="middle" fill="#5b6b78">${num(v, 0)}</text>`;
  g += `<text x="${(L + W - R) / 2}" y="${H - 4}" font-size="11" text-anchor="middle" fill="#5b6b78">tiempo (min)</text>`;
  g += `<text x="12" y="${T + (H - T - B) / 2}" font-size="11" text-anchor="middle" fill="#5b6b78" transform="rotate(-90 12 ${T + (H - T - B) / 2})">${esc(yLabel)}</text>`;
  for (const s of series) {
    const pts = s.t.map((t, i) => (Number.isFinite(s.y[i]) ? `${X(t).toFixed(1)},${Y(s.y[i]).toFixed(1)}` : '')).filter(Boolean).join(' ');
    g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
  }
  g += '</svg>';
  g += `<p class="leg">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</p>`;
  return g;
}

/** Página HTML autocontenida con el reporte de una corrida. */
export function runReportHtml(o: { s: ModelScene; res: RunResult; sum: Summary; QT: number; image?: string; comparison?: RasComparison | null }): string {
  const { s, res, sum } = o;
  const S = res.series;
  const t = S.t.map((v) => v / 60);
  const fecha = new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
  const skip = new Set<keyof ModelScene>(['step', 'layer', ...(s.dtMode === 'fijo' ? (['courantMax'] as const) : []), ...(s.eq !== 'difusiva' ? (['theta', 'tolWS', 'maxIter'] as const) : [])]);
  const rows = (Object.keys(FIELD_NAMES) as (keyof ModelScene)[]).filter((k) => !skip.has(k)).map((k) => `<tr><th>${esc(FIELD_NAMES[k])}</th><td>${esc(valueText(k, s[k]))}</td></tr>`).join('');
  const every = Math.max(1, Math.round(S.t.length / 40));
  const ser = S.t
    .map((_, k) => k)
    .filter((k) => k % every === 0 || k === S.t.length - 1)
    .map((k) => `<tr><td>${num(t[k], 1)}</td><td>${num(S.qin[k], 2)}</td><td>${num(S.qout[k], 2)}</td><td>${num(S.qBridge[k], 2)}</td><td>${num(S.wseBridge[k], 2)}</td></tr>`)
    .join('');
  const c = o.comparison;
  const cmp = c
    ? `<h2>Comparación con HEC-RAS</h2><p>Archivo «${esc(c.name)}»: ${c.width} × ${c.height} píxeles de ${num(c.pxIn, 2)} m${c.epsg ? `, EPSG:${c.epsg}` : ''}; mojado si la profundidad supera ${num(c.thr, 2)} m.</p>
<table><tbody>
<tr><th>Área mojada en la sala / en HEC-RAS</th><td>${num(c.aModel / 1e4, 2)} / ${num(c.aRas / 1e4, 2)} ha</td></tr>
<tr><th>Mojada en los dos</th><td>${num(c.aBoth / 1e4, 2)} ha</td></tr>
<tr><th>Índice de ajuste F = A∩B / A∪B</th><td>${num(c.F * 100, 1)} %</td></tr>
<tr><th>Aciertos (de lo que moja HEC-RAS, lo que moja la sala)</th><td>${num(c.hit * 100, 1)} %</td></tr>
<tr><th>Falsas alarmas (de lo que moja la sala, lo que HEC-RAS deja seco)</th><td>${num(c.falseAlarm * 100, 1)} %</td></tr>
<tr><th>Diferencia media de profundidad (sala − HEC-RAS), donde mojan los dos</th><td>${num(c.bias, 3)} m</td></tr>
<tr><th>Raíz del error cuadrático medio</th><td>${num(c.rmse, 3)} m</td></tr>
<tr><th>Profundidad máxima en la sala / en HEC-RAS</th><td>${num(c.maxModel, 2)} / ${num(c.maxRas, 2)} m</td></tr>
</tbody></table>`
    : '';
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Reporte de la corrida · creciente de ${s.T} años</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d2a35;max-width:860px;margin:28px auto;padding:0 18px;line-height:1.45}
h1{font-size:1.45rem;margin:0 0 4px}h2{font-size:1.08rem;margin:26px 0 8px;border-bottom:1px solid #dfe5ea;padding-bottom:4px}
.sub{color:#5b6b78;margin:0 0 14px}.warn{background:#fff6e0;border:1px solid #f0d38a;border-radius:8px;padding:8px 12px;font-size:.9rem}
table{border-collapse:collapse;width:100%;font-size:.9rem;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #eef1f4}
th{font-weight:600;color:#33424f;width:58%}.ser th,.ser td{width:auto;text-align:right}.ser th:first-child,.ser td:first-child{text-align:left}
img{width:100%;border-radius:10px;border:1px solid #dfe5ea}.leg span{margin-right:14px;font-size:.85rem}.leg i{display:inline-block;width:14px;height:3px;margin-right:6px;vertical-align:middle}
@media print{body{margin:0}h2{break-after:avoid}table,svg,img{break-inside:avoid}}
</style></head><body>
<h1>Reporte de la corrida</h1>
<p class="sub">Laboratorio del agua · Modelación hidráulica 2D · «El modelo completo» · ${esc(fecha)}</p>
<p class="warn">Ejercicio educativo sobre un valle ficticio: no es un estudio de amenaza ni un pronóstico oficial de inundación, y las obras no son diseños de ingeniería.</p>
<h2>Resultados</h2>
<table><tbody>
<tr><th>Creciente</th><td>${s.T} años, pico de ${num(o.QT, 1)} m³/s</td></tr>
<tr><th>Nivel máximo en el puente</th><td>${num(sum.wseBridge, 2)} m</td></tr>
<tr><th>Caudal máximo de entrada / de salida</th><td>${num(sum.qin, 1)} / ${num(sum.qout, 1)} m³/s (atenuación ${num(sum.attenuation * 100, 1)} %)</td></tr>
<tr><th>Área del barrio con más de 10 cm de agua</th><td>${num(sum.townArea, 0)} m²</td></tr>
<tr><th>Agua en la escuela</th><td>${sum.school > 0.005 ? `${num(sum.school, 2)} m, llega a los ${num(sum.schoolArrival, 0)} min` : 'no llega'}</td></tr>
<tr><th>Área mojada total (más de 5 cm)</th><td>${num(sum.wetArea / 1e4, 2)} ha</td></tr>
<tr><th>Velocidad máxima</th><td>${num(sum.vmax, 2)} m/s</td></tr>
<tr><th>¿Pasa el agua por encima de la vía?</th><td>${sum.overtop ? 'sí' : 'no'}</td></tr>
<tr><th>Error de volumen</th><td>${num(Math.abs(sum.volErr) < 5e-5 ? 0 : sum.volErr, 4)} %</td></tr>
<tr><th>Cálculo</th><td>${res.steps.toLocaleString('es-CO')} pasos en ${num(res.ms / 1000, 1)} s; ${res.geom.NC.toLocaleString('es-CO')} celdas</td></tr>
</tbody></table>
${o.image ? `<h2>La escena al terminar</h2><img alt="Vista 3D del valle con el agua al final de la corrida" src="${o.image}">` : ''}
<h2>Hidrograma</h2>
${svgChart(
  [
    { name: 'entrada', color: '#2a78d6', t, y: S.qin },
    { name: 'salida', color: '#d1495b', t, y: S.qout },
    { name: 'bajo el puente', color: '#3b9b6f', t, y: S.qBridge },
  ],
  'caudal (m³/s)',
)}
<h2>Decisiones del modelo</h2>
<table><tbody>${rows}</tbody></table>
${cmp}
<h2>Series</h2>
<table class="ser"><thead><tr><th>Minuto</th><th>Entrada [m³/s]</th><th>Salida [m³/s]</th><th>Puente [m³/s]</th><th>Nivel en el puente [m]</th></tr></thead><tbody>${ser}</tbody></table>
</body></html>`;
}

// ---------------------------------------------------------------- comparación con HEC-RAS

export interface RasComparison {
  name: string;
  width: number;
  height: number;
  pxIn: number;
  epsg: number | null;
  thr: number;
  /** Píxeles de la sala con dato de HEC-RAS (dentro de su extensión). */
  covered: number;
  aModel: number;
  aRas: number;
  aBoth: number;
  F: number;
  hit: number;
  falseAlarm: number;
  bias: number;
  rmse: number;
  maxModel: number;
  maxRas: number;
  /** Mapa por píxel de la sala: 0 seco en los dos, 1 solo la sala, 2 solo HEC-RAS, 3 los dos, 255 sin dato. */
  map: Uint8Array;
  /** Profundidades por píxel de la sala (NaN sin dato) y tamaño de ese píxel [m]. */
  dModel: Float32Array;
  dRas: Float32Array;
  pxModel: number;
  NX: number;
  NY: number;
  notes: string[];
}

export interface ModelGrid {
  depth: Float32Array;
  NX: number;
  NY: number;
  /** Esquina suroeste y tamaño del píxel [m]. */
  E0: number;
  N0: number;
  px: number;
  epsg: number | null;
}

/** Compara la profundidad máxima de la sala con la de un GeoTIFF de HEC-RAS (vecino más cercano). */
export async function compareWithRas(buf: ArrayBuffer, name: string, m: ModelGrid, thr = 0.05): Promise<RasComparison | { error: string }> {
  let img;
  try {
    const tif = await fromArrayBuffer(buf);
    img = await tif.getImage();
  } catch {
    return { error: 'No se pudo leer el archivo como GeoTIFF.' };
  }
  const W = img.getWidth(), H = img.getHeight();
  let origin: number[], res: number[];
  try {
    origin = img.getOrigin();
    res = img.getResolution();
  } catch {
    return { error: 'El GeoTIFF no trae georreferencia (origen y tamaño del píxel): no se puede ubicar sobre el valle.' };
  }
  const notes: string[] = [];
  const keys = (img.getGeoKeys?.() ?? {}) as Record<string, number>;
  const epsg = keys.ProjectedCSTypeGeoKey ?? keys.GeographicTypeGeoKey ?? null;
  if (epsg && m.epsg && epsg !== m.epsg) notes.push(`El archivo dice EPSG:${epsg} y la sala usa EPSG:${m.epsg}: se comparan las coordenadas tal cual.`);
  if (!epsg) notes.push('El archivo no declara su sistema de referencia: se supone el de la sala.');
  const nodata = img.getGDALNoData();
  const rasters = (await img.readRasters({ interleave: false })) as unknown as ArrayLike<number>[];
  const band = rasters[0];
  const pxIn = Math.abs(res[0]);
  const { NX, NY } = m;
  const map = new Uint8Array(NX * NY).fill(255);
  const dRas = new Float32Array(NX * NY).fill(NaN);
  let covered = 0, nM = 0, nR = 0, nB = 0, sum = 0, sum2 = 0, maxM = 0, maxR = 0;
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      const dm = m.depth[k];
      if (!Number.isFinite(dm)) continue;
      // centro del píxel de la sala (filas de sur a norte) en el archivo (filas de norte a sur si res[1] < 0)
      const E = m.E0 + (i + 0.5) * m.px, N = m.N0 + (j + 0.5) * m.px;
      const c = Math.floor((E - origin[0]) / res[0]), r = Math.floor((N - origin[1]) / res[1]);
      if (c < 0 || r < 0 || c >= W || r >= H) continue;
      let dr = Number(band[r * W + c]);
      if (!Number.isFinite(dr) || (nodata !== null && Math.abs(dr - nodata) < 1e-6) || dr < -1e3) dr = 0;
      covered++;
      dRas[k] = dr;
      const wm = dm > thr, wr = dr > thr;
      if (wm) nM++;
      if (wr) nR++;
      if (wm && wr) {
        nB++;
        sum += dm - dr;
        sum2 += (dm - dr) ** 2;
      }
      maxM = Math.max(maxM, dm);
      maxR = Math.max(maxR, dr);
      map[k] = (wm ? 1 : 0) + (wr ? 2 : 0);
    }
  if (!covered) return { error: 'El GeoTIFF no se superpone con el valle de la sala (revise el sistema de referencia y la extensión).' };
  if (covered < 0.5 * NX * NY) notes.push(`El archivo cubre ${Math.round((100 * covered) / (NX * NY))} % del valle: se compara solo esa parte.`);
  const a = m.px * m.px;
  const union = nM + nR - nB;
  return {
    name,
    width: W,
    height: H,
    pxIn,
    epsg,
    thr,
    covered,
    aModel: nM * a,
    aRas: nR * a,
    aBoth: nB * a,
    F: union ? nB / union : 1,
    hit: nR ? nB / nR : 1,
    falseAlarm: nM ? (nM - nB) / nM : 0,
    bias: nB ? sum / nB : 0,
    rmse: nB ? Math.sqrt(sum2 / nB) : 0,
    maxModel: maxM,
    maxRas: maxR,
    map,
    dModel: m.depth,
    dRas,
    pxModel: m.px,
    NX,
    NY,
    notes,
  };
}

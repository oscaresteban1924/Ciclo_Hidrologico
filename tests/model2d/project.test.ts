// Pruebas del proyecto, el reporte y la comparación con HEC-RAS de «El modelo completo» (sala 2D).
// La comparación se prueba con GeoTIFF escritos por la propia sala (el mismo escritor del paquete de resultados), con
// profundidades conocidas: idénticas, desplazadas en nivel, corridas en el espacio y a otra resolución.

import { record, finish } from '../harness';
import { Run } from '../../src/model2d/solver';
import { DEFAULT_MODEL, modelRun, summarize } from '../../src/model2d/scene';
import { designHydro } from '../../src/model2d/hydrology';
import { geotiff, maxGrids } from '../../src/model2d/exports';
import { compareWithRas, parseProject, projectJson, runReportHtml, type ModelGrid, type RasComparison } from '../../src/model2d/project';

const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

// ---------------------------------------------------------------- P1 proyecto: ida y vuelta
{
  const s = { ...DEFAULT_MODEL, source: 'dron' as const, c: 20, T: 25, theta: 0.8, eq: 'swe' as const, refine: 'cauce5' as const, burn: false };
  const p = parseProject(projectJson(s, 'prueba'));
  const ok = 's' in p && JSON.stringify(p.s) === JSON.stringify(s) && p.warnings.length === 0;
  record({ id: 'P1', name: 'Proyecto guardado y vuelto a abrir', tolerance: 'la escena leída es idéntica y no hay avisos', measured: 's' in p ? `${p.warnings.length} avisos; idéntica: ${JSON.stringify(p.s) === JSON.stringify(s) ? 'sí' : 'no'}` : p.error, pass: ok });
}

// ---------------------------------------------------------------- P2 proyecto con datos inválidos
{
  const j = JSON.parse(projectJson(DEFAULT_MODEL));
  j.escena.c = 7; // no es una opción
  j.escena.T = 37; // no es un periodo de la sala
  j.escena.theta = 2; // fuera de rango
  j.escena.secreto = 'x'; // desconocido
  delete j.escena.tp; // falta
  const p = parseProject(JSON.stringify(j));
  const ok = 's' in p && p.s.c === DEFAULT_MODEL.c && p.s.T === DEFAULT_MODEL.T && p.s.theta === DEFAULT_MODEL.theta && p.s.tp === DEFAULT_MODEL.tp && p.warnings.length === 5 && !('secreto' in p.s);
  record({ id: 'P2', name: 'Proyecto con datos inválidos, faltantes y desconocidos', tolerance: 'cada dato malo queda en el valor por omisión con su aviso (5 avisos) y no entra nada desconocido', measured: 's' in p ? `${p.warnings.length} avisos: ${p.warnings.map((w) => w.slice(0, 40)).join(' | ')}` : p.error, pass: ok });
}

// ---------------------------------------------------------------- P3 archivo que no es un proyecto
{
  const a = parseProject('{"tipo":"otra-cosa"}'), b = parseProject('no es json'), c = parseProject(JSON.stringify({ tipo: 'laboratorio-del-agua/modelo-2d', version: 99, escena: {} }));
  const ok = 'error' in a && 'error' in b && 'error' in c;
  record({ id: 'P3', name: 'Archivos que no son proyectos de la sala', tolerance: 'otro tipo, JSON roto y versión futura se rechazan con un mensaje', measured: [a, b, c].map((x) => ('error' in x ? x.error.slice(0, 34) + '…' : 'aceptado')).join(' / '), pass: ok });
}

// ---------------------------------------------------------------- una corrida real y gruesa para la comparación y el reporte
const s = { ...DEFAULT_MODEL, c: 20, T: 100, dtMode: 'fijo' as const, dt: 20, eq: 'difusiva' as const };
const res = new Run(modelRun(s)).runAll();
const sum = summarize(res);
const mg = maxGrids(res);
const grid: ModelGrid = { depth: mg.depth, NX: mg.NX, NY: mg.NY, E0: mg.geo.E0, N0: mg.geo.N0, px: mg.geo.px, epsg: mg.geo.epsg ?? null };
const ras = (d: Float32Array, o: Partial<{ E0: number; N0: number; px: number; w: number; h: number }> = {}) =>
  buf(geotiff(o.w ?? mg.NX, o.h ?? mg.NY, d, { E0: o.E0 ?? mg.geo.E0, N0: o.N0 ?? mg.geo.N0, px: o.px ?? mg.geo.px, nodata: -9999, epsg: mg.geo.epsg ?? undefined }));
const noNaN = (d: Float32Array) => d.map((v) => (Number.isFinite(v) ? v : -9999));
const fmt = (c: RasComparison) => `F ${(c.F * 100).toFixed(2)} %, aciertos ${(c.hit * 100).toFixed(1)} %, falsas ${(c.falseAlarm * 100).toFixed(1)} %, sesgo ${c.bias.toFixed(4)} m, RMSE ${c.rmse.toFixed(4)} m`;

// ---------------------------------------------------------------- P4 la misma profundidad
{
  const c = await compareWithRas(ras(noNaN(mg.depth)), 'misma.tif', grid);
  const ok = !('error' in c) && c.F === 1 && c.hit === 1 && c.falseAlarm === 0 && Math.abs(c.bias) < 1e-6 && c.rmse < 1e-6 && c.aBoth > 0;
  record({ id: 'P4', name: 'Comparación con un GeoTIFF idéntico (la profundidad máxima de la propia corrida)', tolerance: 'F = 100 %, sin falsas alarmas, sesgo y RMSE < 1 µm', measured: 'error' in c ? c.error : `${fmt(c)}; ${(c.aBoth / 1e4).toFixed(2)} ha mojadas`, pass: ok });
}

// ---------------------------------------------------------------- P5 HEC-RAS 10 cm más profundo donde hay agua
{
  const d = noNaN(mg.depth).map((v) => (v > 0.05 ? v + 0.1 : v));
  const c = await compareWithRas(ras(d), 'mas10cm.tif', grid);
  const ok = !('error' in c) && c.F === 1 && Math.abs(c.bias + 0.1) < 1e-5 && Math.abs(c.rmse - 0.1) < 1e-5;
  record({ id: 'P5', name: 'Comparación con un GeoTIFF 10 cm más profundo en la zona mojada', tolerance: 'misma área (F = 100 %), sesgo sala − HEC-RAS = −0,100 m y RMSE = 0,100 m (± 10 µm)', measured: 'error' in c ? c.error : fmt(c), pass: ok });
}

// ---------------------------------------------------------------- P6 mancha distinta: contada a mano
{
  // HEC-RAS moja solo la mitad oeste de lo que moja la sala y además una franja seca en el norte
  const d = noNaN(mg.depth).map((v) => v);
  let nM = 0, nR = 0, nB = 0;
  for (let j = 0; j < mg.NY; j++)
    for (let i = 0; i < mg.NX; i++) {
      const k = j * mg.NX + i;
      if (!Number.isFinite(mg.depth[k])) continue;
      const wm = mg.depth[k] > 0.05;
      if (i >= mg.NX / 2) d[k] = 0;
      if (j >= mg.NY - 6) d[k] = 0.5;
      const wr = d[k] > 0.05;
      nM += +wm;
      nR += +wr;
      nB += +(wm && wr);
    }
  const F = nB / (nM + nR - nB), hit = nB / nR, fa = (nM - nB) / nM;
  const c = await compareWithRas(ras(d), 'mitad.tif', grid);
  const ok = !('error' in c) && Math.abs(c.F - F) < 1e-12 && Math.abs(c.hit - hit) < 1e-12 && Math.abs(c.falseAlarm - fa) < 1e-12;
  record({ id: 'P6', name: 'Índices de ajuste contra un conteo independiente', tolerance: 'F, aciertos y falsas alarmas iguales al conteo píxel por píxel', measured: 'error' in c ? c.error : `${fmt(c)} (esperado F ${(F * 100).toFixed(2)} %, aciertos ${(hit * 100).toFixed(1)} %, falsas ${(fa * 100).toFixed(1)} %)`, pass: ok });
}

// ---------------------------------------------------------------- P7 otra extensión y otra resolución
{
  // archivo a 2 m, corrido 100 m al este: cubre solo una parte del valle
  const w2 = Math.ceil(mg.NX / 2), h2 = Math.ceil(mg.NY / 2);
  const d2 = new Float32Array(w2 * h2);
  for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) d2[j * w2 + i] = 0.3;
  const c = await compareWithRas(ras(d2, { E0: mg.geo.E0 + 100, px: 2 * mg.geo.px, w: w2, h: h2 }), 'grueso.tif', grid);
  // píxeles de la sala dentro del archivo: E en [E0+100, E0+100+2·w2)
  let cov = 0;
  for (let j = 0; j < mg.NY; j++)
    for (let i = 0; i < mg.NX; i++) {
      const E = (i + 0.5) * mg.geo.px;
      if (Number.isFinite(mg.depth[j * mg.NX + i]) && E >= 100 && E < 100 + 2 * w2 * mg.geo.px && (j + 0.5) * mg.geo.px < 2 * h2 * mg.geo.px) cov++;
    }
  const ok = !('error' in c) && c.covered === cov && c.pxIn === 2 * mg.geo.px;
  record({ id: 'P7', name: 'GeoTIFF a otra resolución y corrido 100 m: ubicación por la georreferencia', tolerance: 'compara exactamente los píxeles de la sala que caen dentro del archivo', measured: 'error' in c ? c.error : `${c.covered} píxeles comparados (esperados ${cov}); píxel del archivo ${c.pxIn} m`, pass: ok });
}

// ---------------------------------------------------------------- P8 archivo fuera del valle
{
  const c = await compareWithRas(ras(noNaN(mg.depth), { E0: mg.geo.E0 + 50_000 }), 'lejos.tif', grid);
  const bad = await compareWithRas(new Uint8Array([1, 2, 3, 4]).buffer, 'roto.tif', grid);
  const ok = 'error' in c && 'error' in bad;
  record({ id: 'P8', name: 'GeoTIFF que no se superpone con el valle y archivo dañado', tolerance: 'los dos se rechazan con un mensaje claro', measured: `${'error' in c ? c.error.slice(0, 50) : 'aceptado'}… / ${'error' in bad ? bad.error : 'aceptado'}`, pass: ok });
}

// ---------------------------------------------------------------- P9 reporte de la corrida
{
  const c = await compareWithRas(ras(noNaN(mg.depth)), 'misma.tif', grid);
  const html = runReportHtml({ s, res, sum, QT: designHydro(s.T, s.tp).Qp, comparison: 'error' in c ? null : c });
  const sections = ['Resultados', 'Hidrograma', 'Decisiones del modelo', 'Comparación con HEC-RAS', 'Series'].filter((h) => html.includes(`<h2>${h}</h2>`));
  const bad = /NaN|undefined|\[object/.test(html);
  const ok = html.startsWith('<!DOCTYPE html>') && sections.length === 5 && !bad && html.includes('no es un estudio de amenaza') && html.includes('<polyline');
  record({ id: 'P9', name: 'Reporte HTML de la corrida', tolerance: 'página completa con las 5 secciones, hidrograma dibujado, aviso de ejercicio educativo y sin NaN ni undefined', measured: `${(html.length / 1024).toFixed(1)} kB; secciones ${sections.length}/5; textos rotos: ${bad ? 'sí' : 'no'}`, pass: ok });
}

finish('docs/modelo2d/PRUEBAS_PROYECTO.md', 'Pruebas del proyecto, el reporte y la comparación con HEC-RAS (sala 2D)', 'npm run test:project');

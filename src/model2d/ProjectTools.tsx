// Herramientas de archivo de «El modelo completo»: guardar y abrir el proyecto, el reporte de la corrida y la
// comparación con la profundidad máxima de HEC-RAS (GeoTIFF). Todo ocurre en el navegador: los archivos no salen del
// equipo y no se necesita ninguna cuenta.

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { es } from '../canals/common';
import { downloadText } from '../lib/download';
import { maxGrids } from './exports';
import { compareWithRas, parseProject, projectJson, runReportHtml, type RasComparison } from './project';
import type { ModelScene, Summary } from './scene';
import type { RunResult } from './solver';

const said = (r: 'saved' | 'declined' | 'error', ok: string) => (r === 'saved' ? ok : r === 'declined' ? 'La descarga se canceló.' : 'No se pudo descargar en esta vista.');

/** Guardar y abrir el proyecto (las decisiones del modelo) como un archivo JSON. */
export function ProjectFiles({ s, onOpen }: { s: ModelScene; onOpen: (s: ModelScene) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const save = async () => {
    const r = await downloadText(`modelo_2d_T${s.T}.json`, projectJson(s));
    setMsg(said(r, 'Proyecto guardado: al abrirlo vuelven todas las decisiones del modelo.'));
  };
  const open = async (f?: File) => {
    if (!f) return;
    if (f.size > 1_000_000) return setMsg('El archivo es demasiado grande para ser un proyecto de la sala.');
    const p = parseProject(await f.text());
    if ('error' in p) return setMsg(p.error);
    onOpen(p.s);
    setMsg(p.warnings.length ? `Proyecto abierto con ${p.warnings.length} aviso${p.warnings.length > 1 ? 's' : ''}: ${p.warnings.join(' ')}` : `Proyecto «${f.name}» abierto. Córrelo en el paso «Correr».`);
  };
  return (
    <>
      <div className="hc-flood is-inline">
        <input
          ref={ref}
          type="file"
          accept=".json,application/json"
          aria-label="Abrir un proyecto"
          hidden
          onChange={(e) => {
            void open(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={save}>
          Guardar el proyecto
        </button>
        <button type="button" onClick={() => ref.current?.click()}>
          Abrir un proyecto
        </button>
      </div>
      <p className="q3-small" aria-live="polite">
        {msg || 'El proyecto guarda las decisiones del modelo (terreno, malla, bordes, creciente y plan) en un archivo JSON de tu equipo; los resultados se recalculan al correrlo.'}
      </p>
    </>
  );
}

/** Reporte HTML de la corrida, con una imagen de la escena tomada al momento de descargarlo. */
export function ReportButton({ s, res, sum, QT, cmp, snapshot }: { s: ModelScene; res: RunResult; sum: Summary; QT: number; cmp: RasComparison | null; snapshot: () => string }) {
  const [msg, setMsg] = useState('');
  const go = async () => {
    setMsg('Preparando el reporte…');
    const html = runReportHtml({ s, res, sum, QT, image: snapshot(), comparison: cmp });
    const r = await downloadText(`reporte_corrida_T${s.T}.html`, html, 'text/html;charset=utf-8');
    setMsg(said(r, 'Reporte listo: ábrelo en el navegador; se puede imprimir a PDF.'));
  };
  return (
    <>
      <button type="button" onClick={go}>
        Reporte de la corrida (HTML)
      </button>
      {msg && (
        <span className="sr-only" aria-live="polite">
          {msg}
        </span>
      )}
      {msg && <p className="q3-small">{msg}</p>}
    </>
  );
}

/** Carga del GeoTIFF de HEC-RAS y comparación con la corrida. */
export function RasLoader({ res, onResult }: { res: RunResult; onResult: (c: RasComparison | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const load = async (f?: File) => {
    if (!f) return;
    if (f.size > 200_000_000) return setMsg('El archivo pasa de 200 MB: recorte el ráster al área del valle en RAS Mapper o en un SIG.');
    setMsg('Leyendo el GeoTIFF…');
    const g = maxGrids(res);
    const c = await compareWithRas(await f.arrayBuffer(), f.name, { depth: g.depth, NX: g.NX, NY: g.NY, E0: g.geo.E0, N0: g.geo.N0, px: g.geo.px, epsg: g.geo.epsg ?? null });
    if ('error' in c) {
      onResult(null);
      return setMsg(c.error);
    }
    onResult(c);
    setMsg(`Ajuste F = ${es(c.F * 100, 1)} %; aciertos ${es(c.hit * 100, 1)} %, falsas alarmas ${es(c.falseAlarm * 100, 1)} %. El mapa y la tabla están en «Experimentos».`);
  };
  return (
    <>
      <div className="hc-flood is-inline">
        <input
          ref={ref}
          type="file"
          accept=".tif,.tiff,image/tiff"
          aria-label="Cargar la profundidad máxima de HEC-RAS"
          hidden
          onChange={(e) => {
            void load(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => ref.current?.click()}>
          Comparar con HEC-RAS (GeoTIFF)
        </button>
      </div>
      <p className="q3-small" aria-live="polite">
        {msg || 'Corre en HEC-RAS el paquete de la sala, exporta desde RAS Mapper la profundidad máxima como GeoTIFF y cárgala aquí: se compara píxel a píxel con esta corrida.'}
      </p>
    </>
  );
}

// colores validados para daltonismo entre todos los pares (azul, ámbar, magenta) y gris para lo seco
const MAP_COLORS: Record<number, [number, number, number, number]> = {
  0: [232, 236, 239, 255],
  1: [227, 161, 27, 255],
  2: [194, 24, 91, 255],
  3: [42, 120, 214, 255],
  255: [0, 0, 0, 0],
};
const CLASS_TEXT: Record<number, string> = { 0: 'seco en los dos', 1: 'solo la sala lo moja (falsa alarma)', 2: 'solo HEC-RAS lo moja (faltante)', 3: 'mojado en los dos', 255: 'sin dato de HEC-RAS' };

/** Mapa de acuerdo y tabla de la comparación (pestaña «Experimentos»). */
export function RasReport({ c, onClear }: { c: RasComparison; onClear: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; left: boolean; text: string } | null>(null);
  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    el.width = c.NX;
    el.height = c.NY;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(c.NX, c.NY);
    for (let j = 0; j < c.NY; j++)
      for (let i = 0; i < c.NX; i++) {
        const col = MAP_COLORS[c.map[j * c.NX + i]] ?? MAP_COLORS[255];
        img.data.set(col, ((c.NY - 1 - j) * c.NX + i) * 4); // norte arriba
      }
    ctx.putImageData(img, 0, 0);
  }, [c]);
  const count = (k: number) => {
    let n = 0;
    for (let i = 0; i < c.map.length; i++) if (c.map[i] === k) n++;
    return n;
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * c.NX), j = c.NY - 1 - Math.floor(((e.clientY - r.top) / r.height) * c.NY);
    if (i < 0 || j < 0 || i >= c.NX || j >= c.NY) return setTip(null);
    const k = j * c.NX + i;
    const cls = c.map[k];
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, left: e.clientX - r.left > r.width * 0.55, text: `(${i}, ${j}) m · ${CLASS_TEXT[cls] ?? ''}${cls !== 255 ? ` · sala ${es(Math.max(0, c.dModel[k]), 2)} m, HEC-RAS ${es(Math.max(0, c.dRas[k]), 2)} m` : ''}` });
  };
  const ha = (k: number) => (count(k) * c.pxModel * c.pxModel) / 1e4;
  return (
    <>
      <h3>Comparación con HEC-RAS</h3>
      <p className="q3-small">
        «{c.name}»: {c.width} × {c.height} píxeles de {es(c.pxIn, 2)} m{c.epsg ? `, EPSG:${c.epsg}` : ''}. Mojado si la profundidad máxima pasa de {es(c.thr * 100, 0)} cm. {c.notes.join(' ')}
      </p>
      <div className="m2-cmpmap">
        <canvas ref={cv} style={{ aspectRatio: `${c.NX} / ${c.NY}` }} role="img" aria-label={`Mapa de acuerdo entre la sala y HEC-RAS: índice F de ${es(c.F * 100, 1)} %. La tabla de abajo tiene los mismos datos.`} onPointerMove={move} onPointerLeave={() => setTip(null)} />
        {tip && (
          <div className={`m2-cmptip${tip.left ? ' is-left' : ''}`} style={{ left: tip.x, top: tip.y }}>
            {tip.text}
          </div>
        )}
      </div>
      <ul className="m2-cmpleg">
        {[3, 1, 2, 0].map((k) => (
          <li key={k}>
            <i style={{ background: `rgb(${MAP_COLORS[k].slice(0, 3).join(',')})` }} />
            {CLASS_TEXT[k]}: {es(ha(k), 2)} ha
          </li>
        ))}
      </ul>
      <table className="q3-table">
        <caption>Índices de la comparación</caption>
        <tbody>
          <tr>
            <th>Área mojada: sala / HEC-RAS</th>
            <td>
              {es(c.aModel / 1e4, 2)} / {es(c.aRas / 1e4, 2)} ha
            </td>
          </tr>
          <tr>
            <th>Índice de ajuste F = A∩B / A∪B</th>
            <td>{es(c.F * 100, 1)} %</td>
          </tr>
          <tr>
            <th>Aciertos: de lo que moja HEC-RAS, lo que moja la sala</th>
            <td>{es(c.hit * 100, 1)} %</td>
          </tr>
          <tr>
            <th>Falsas alarmas: de lo que moja la sala, lo que HEC-RAS deja seco</th>
            <td>{es(c.falseAlarm * 100, 1)} %</td>
          </tr>
          <tr>
            <th>Diferencia media de profundidad (sala − HEC-RAS) donde mojan los dos</th>
            <td>{es(c.bias, 3)} m</td>
          </tr>
          <tr>
            <th>Raíz del error cuadrático medio</th>
            <td>{es(c.rmse, 3)} m</td>
          </tr>
          <tr>
            <th>Profundidad máxima: sala / HEC-RAS</th>
            <td>
              {es(c.maxModel, 2)} / {es(c.maxRas, 2)} m
            </td>
          </tr>
        </tbody>
      </table>
      <p className="q3-small">
        F vale 100 % si las dos manchas coinciden y 0 % si no se tocan; castiga por igual lo que sobra y lo que falta. Aquí las dos manchas salen de modelos, no de una inundación observada: la sala resuelve las mismas ecuaciones con una malla y un esquema más simples, así que se esperan diferencias en los bordes de la mancha y en el cauce. Pasa el cursor por el mapa para leer cada píxel.
      </p>
      <div className="hc-flood is-inline">
        <button type="button" onClick={onClear}>
          Quitar la comparación
        </button>
      </div>
    </>
  );
}

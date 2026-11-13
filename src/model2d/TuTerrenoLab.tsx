// «Tu terreno»: el mismo modelo 2D sobre un terreno propio. Se carga un GeoTIFF pequeño de una banda (un MDT
// recortado a un sector), se leen su píxel y su georreferencia en el navegador, se eligen el n, el número de curva,
// las líneas de borde, el hidrograma, la malla y las ecuaciones, y se corre. Hay un terreno de ejemplo para quien no
// tenga uno. El archivo no sale del equipo. La pregunta: ¿cómo se inunda tu terreno?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { HydroChart, LayerLegend, SER, XYChart, type XY } from './charts';
import { MODEL2D_TOOLS, ROOM } from './design';
import { baseRun } from './scene';
import { EQ_NAMES, SIDE_NAMES, cellAt, groundAt, registerDomain, type BcLine, type CustomDomain, type Eq, type RunOpts, type Side } from './solver';
import { useModelRun } from './runs';
import { MAX_PIXELS, exampleDem, readDem, type DemInfo } from './importDem';
import { resultsPackage, zip } from './exports';
import { downloadBytes } from '../lib/download';
import { FlowTools, RunBadge, TimeBar, VexChoice, WATER_LAYERS, WaterChoice, usePlayback, valleyState, vexNote, waterOf } from './common';
import { PARTICLE_SPEED, ValleyWorld, type ClickTool, type Layer } from './three/valleyWorld';

interface Params {
  n: number;
  cn: number;
  inSide: Side;
  inFrom: number;
  inTo: number;
  outSide: Side;
  outFrom: number;
  outTo: number;
  Qp: number;
  Qb: number;
  tp: number;
  slope: number;
  /** Lado de la celda en píxeles. */
  k: number;
  eq: Eq;
  duration: number;
  rain: boolean;
  P: number;
  D: number;
}
interface Ctx {
  example: boolean;
  own: boolean;
  ok: boolean;
  volErr: number;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'm2-ejemplo',
    title: 'La cañada de ejemplo',
    goal: 'Carga el terreno de ejemplo, ponle una entrada y una salida y córrelo sin inestabilidad y con un error de volumen menor que 0,01 %.',
    hint: 'La quebrada entra por el oeste y sale por el este; con las líneas de borde sobre el cauce el agua sigue la cañada.',
    check: (c) => c.example && c.ok && Math.abs(c.volErr) < 0.01,
    progress: (c) => (c.example ? (c.ok ? `error de volumen ${es(Math.abs(c.volErr) < 5e-5 ? 0 : c.volErr, 4)} %` : 'córrelo') : 'carga el ejemplo'),
  },
  {
    id: 'm2-propio',
    title: 'Mi propio terreno',
    goal: 'Carga un GeoTIFF propio (un MDT recortado a un sector pequeño) y corre una creciente sobre él.',
    hint: 'Recorta en un SIG un sector de unas decenas de hectáreas, en un sistema proyectado en metros, y expórtalo como GeoTIFF de una banda.',
    check: (c) => c.own && c.ok,
    progress: (c) => (c.own ? (c.ok ? 'corrido' : 'córrelo') : 'carga tu archivo'),
  },
];

/**
 * Primera propuesta de bordes: la salida en el lado con el punto más bajo; la entrada en el lado opuesto, en un tramo
 * centrado en su punto más bajo (por donde entraría el cauce). Se cambian en el panel.
 */
function guessSides(d: CustomDomain): { inSide: Side; outSide: Side; inFrom: number; inTo: number } {
  const edge = (side: Side) => {
    let m = Infinity, at = 0.5;
    const n = side === 'O' || side === 'E' ? d.NY : d.NX;
    for (let t = 0; t < n; t++) {
      const k = side === 'O' ? t * d.NX : side === 'E' ? t * d.NX + d.NX - 1 : side === 'S' ? t : (d.NY - 1) * d.NX + t;
      if (!Number.isNaN(d.z[k]) && d.z[k] < m) {
        m = d.z[k];
        at = (t + 0.5) / n;
      }
    }
    return { m, at };
  };
  const sides: Side[] = ['O', 'E', 'S', 'N'];
  const v = sides.map(edge);
  const outSide = sides[v.reduce((b, e, k) => (e.m < v[b].m ? k : b), 0)];
  const opp: Record<Side, Side> = { O: 'E', E: 'O', S: 'N', N: 'S' };
  const inSide = opp[outSide];
  const at = v[sides.indexOf(inSide)].at;
  const c = Math.round(at * 20) * 5;
  return { inSide, outSide, inFrom: Math.max(0, Math.min(70, c - 15)), inTo: Math.min(100, Math.max(30, c + 15)) };
}

/** Celda de base (en píxeles) para quedarse cerca de 3000 celdas. */
const guessK = (d: CustomDomain) => Math.max(2, Math.ceil(Math.sqrt((d.NX * d.NY) / 3000)));

/** Lados de celda que se ofrecen: la sugerida y las vecinas, sin pasar de 15 000 celdas ni de un cuarto del terreno. */
function kOptions(d: CustomDomain): number[] {
  const cells = (k: number) => Math.ceil(d.NX / k) * Math.ceil(d.NY / k);
  const g = guessK(d);
  const ks = [...new Set([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, g])].sort((a, b) => a - b);
  return ks.filter((k) => k === g || (cells(k) <= 15000 && k * d.px <= (Math.min(d.NX, d.NY) * d.px) / 4));
}

export function TuTerrenoLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [dem, setDem] = useState<{ domain: CustomDomain; info: DemInfo; example: boolean } | null>(null);
  const [p, setP] = useState<Params>({ n: 0.04, cn: 80, inSide: 'O', inFrom: 0, inTo: 100, outSide: 'E', outFrom: 0, outTo: 100, Qp: 25, Qb: 1, tp: 20, slope: 0.006, k: 3, eq: 'inercia', duration: 60, rain: false, P: 60, D: 60 });
  const [layer, setLayer] = useState<Layer>('natural');
  const [tool, setTool] = useState<ClickTool>('sonda');
  const [notice, setNotice] = useState('');
  const [particles, setParticles] = useState(true);
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null);
  const [vex, setVex] = useState(3);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [msg, setMsg] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const load = async (buf: ArrayBuffer, name: string, example: boolean) => {
    setMsg('Leyendo el GeoTIFF…');
    try {
      const r = await readDem(buf, name);
      registerDomain(r.domain);
      setDem({ ...r, example });
      const sd = guessSides(r.domain);
      const L = (side: Side) => (side === 'O' || side === 'E' ? r.domain.NY : r.domain.NX) * r.domain.px;
      setP((x) => ({ ...x, ...(example ? { inSide: 'O', outSide: 'E', inFrom: 25, inTo: 75, outFrom: 25, outTo: 75 } : { ...sd, outFrom: 0, outTo: 100 }), k: guessK(r.domain), Qp: example ? 25 : Math.max(5, Math.round(L(sd.inSide) / 20)) }));
      setProbe(null);
      setMsg(`Listo: ${r.info.width} × ${r.info.height} píxeles${r.info.factor > 1 ? `, reducido a ${r.domain.NX} × ${r.domain.NY}` : ''}.`);
    } catch (e) {
      setMsg(`No se pudo leer el archivo: ${(e as Error).message}`);
    }
  };
  const onFile = async (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > 80e6) {
      setMsg('El archivo pasa de 80 MB: recorta un sector más pequeño.');
      return;
    }
    await load(await f.arrayBuffer(), f.name, false);
  };
  const useExample = () => {
    const ex = exampleDem();
    void load(ex.bytes.buffer.slice(0) as ArrayBuffer, 'cañada de ejemplo.tif', true);
  };
  const saveExample = async () => {
    const ex = exampleDem();
    const r = await downloadBytes('terreno_de_ejemplo.zip', zip([{ name: 'terreno_de_ejemplo.tif', data: ex.bytes }, { name: 'LEAME.txt', data: 'Laboratorio del agua · Terreno de ejemplo (inventado)\r\n\r\nUna cañada de 360 × 240 m con píxeles de 2 m (GeoTIFF Float32, una banda, coordenadas locales sin sistema de referencia).\r\nSe puede cargar en la parte «Tu terreno» de la sala de modelación 2D o en un SIG. No es un lugar real.\r\n' }]));
    setMsg(r === 'saved' ? 'Ejemplo descargado.' : r === 'declined' ? 'La descarga se canceló.' : 'No se pudo descargar en esta vista.');
  };
  const d = dem?.domain ?? null;
  const W = d ? d.NX * d.px : 0, H = d ? d.NY * d.px : 0;
  const along = (side: Side) => (side === 'O' || side === 'E' ? H : W);
  const bcs = useMemo<BcLine[]>(
    () =>
      d
        ? [
            { side: p.inSide, from: (along(p.inSide) * p.inFrom) / 100, to: (along(p.inSide) * p.inTo) / 100, kind: 'caudal', slope: p.slope },
            { side: p.outSide, from: (along(p.outSide) * p.outFrom) / 100, to: (along(p.outSide) * p.outTo) / 100, kind: 'normal', slope: p.slope },
          ]
        : [],
    [d, p.inSide, p.inFrom, p.inTo, p.outSide, p.outFrom, p.outTo, p.slope], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const opts = useMemo<RunOpts | null>(
    () =>
      d
        ? {
            ...baseRun(),
            site: { id: d.id, n: p.n, cn: p.cn },
            bcs,
            mesh: { c: p.k * d.px, subgrid: true, breaklines: false },
            eq: p.eq,
            dtMode: p.eq === 'difusiva' ? 'fijo' : 'courant',
            dt: p.eq === 'difusiva' ? Math.max(2, Math.round(p.k * d.px * 0.8)) : 10,
            courantMax: p.eq === 'difusiva' ? 2 : 0.7,
            hydro: { Qp: p.Qp, tp: p.tp, Qb: p.Qb },
            warmup: 10,
            duration: p.duration,
            outEvery: 60,
            ...(p.rain ? { rain: { P: p.P, D: p.D, soil: 'C' as const } } : {}),
          }
        : null,
    [d, p, bcs],
  );
  const run = useModelRun(opts, false);
  const res = run.status === 'listo' || run.status === 'inestable' ? run.res : null;
  const cells = d ? Math.ceil(d.NX / p.k) * Math.ceil(d.NY / p.k) : 0;
  const world = useRef<ValleyWorld | null>(null);
  const play = usePlayback(res, (f) => world.current?.setFrame(f));
  const sync = useRef({ d, run, vex, layer, particles, probe, bcs, p, tool });
  sync.current = { d, run, vex, layer, particles, probe, bcs, p, tool };
  const toWorld = () => {
    const { d: dd, run: rr, vex: v, layer: ly, particles: pt, probe: pb, bcs: bl, p: pp, tool: tl } = sync.current;
    const w = world.current;
    if (!w || !dd) return;
    w.onProbe = rr.res ? (x, y) => setProbe({ x: Math.round(x), y: Math.round(y) }) : null;
    w.onNotice = setNotice;
    w.set(
      valleyState({
        vex: v,
        fine: dd.z,
        site: { id: dd.id, NX: dd.NX, NY: dd.NY, px: dd.px, z: dd.z },
        objects: 'no',
        bc: true,
        bcLines: bl,
        rain: pp.rain,
        mesh: rr.res ? null : { c: pp.k * dd.px },
        water: waterOf(rr, ly, play.ref.current, { particles: pt }),
        tool: tl,
        probe: pb,
        labels: [],
      }),
    );
  };
  useEffect(() => {
    toWorld();
  }, [d, run.res, run.status, run.live, vex, layer, particles, probe, bcs, p.k, p.rain, tool]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ example: !!dem?.example, own: !!dem && !dem.example, ok: !!res && !res.unstable, volErr: res?.vol.errPct ?? NaN }), [dem, res]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (q: Partial<Params>) => setP((x) => ({ ...x, ...q }));
  const pser = useMemo(() => {
    if (!res || !probe || !res.frames.length) return null;
    const ci = cellAt(res.geom, probe.x, probe.y);
    if (ci < 0) return null;
    const zg = groundAt(res.geom, probe.x, probe.y);
    // la cota de una celda seca es su punto más bajo, que puede quedar bajo el suelo de la sonda: se dibuja sobre el suelo
    return { zg, pts: res.frames.map((f, k) => [res.frameT[k] / 60, Math.max(zg, f[ci])] as XY), dmax: Math.max(0, res.etaMax[ci] - zg) };
  }, [res, probe]);
  let wet = 0;
  if (res) for (let k = 0; k < res.geom.z.length; k++) {
    const ci = res.geom.pmap[k];
    if (ci >= 0 && res.etaMax[ci] - res.geom.z[k] > 0.1) wet += res.geom.px * res.geom.px;
  }
  const saveRes = async () => {
    if (!res) return;
    const r = await downloadBytes('resultados_tu_terreno.zip', resultsPackage(res, 'tu_terreno'));
    setMsg(r === 'saved' ? 'Resultados descargados.' : r === 'declined' ? 'La descarga se canceló.' : 'No se pudo descargar en esta vista.');
  };
  const answer = !d ? (
    <>Carga un GeoTIFF de una banda con el terreno de un sector pequeño (lo lee tu navegador; no sale de tu equipo) o usa la cañada de ejemplo. Luego ubica la entrada y la salida, elige la creciente y la malla, y calcula.</>
  ) : res ? (
    res.unstable ? (
      <>La corrida se volvió inestable: {res.unstable.why} Prueba la onda difusiva, celdas más grandes o un caudal menor.</>
    ) : (
      <>
        Con {es(p.Qp, 0)} m³/s entrando por el {SIDE_NAMES[p.inSide].toLowerCase()}, el agua cubre <strong>{es(wet / 10000, 2)} ha</strong> con más de 10 cm (de {es((W * H) / 10000, 1)} ha). El modelo corrió {res.steps.toLocaleString('es-CO')} pasos en {es(res.ms / 1000, 1)} s con un error de volumen de {es(Math.abs(res.vol.errPct) < 5e-5 ? 0 : res.vol.errPct, 4)} %.
        {pser ? (pser.dmax > 0.005 ? ` En la sonda, la profundidad máxima es ${es(pser.dmax, 2)} m.` : ' La sonda quedó en seco.') : ' Toca el terreno para poner una sonda.'}
      </>
    )
  ) : (
    <>
      Terreno de {es(W, 0)} × {es(H, 0)} m con píxeles de {es(d.px, 2)} m: la malla tendría unas {cells.toLocaleString('es-CO')} celdas de {es(p.k * d.px, 1)} m. Ubica las líneas de borde y calcula.
    </>
  );

  const stage = (
    <>
      {gl && d ? (
        <Scene3D
          label={`Maqueta 3D de ${dem?.example ? 'la cañada de ejemplo' : 'tu terreno'} (${es(W, 0)} × ${es(H, 0)} m), coloreada por altura, con las líneas de borde (azul la entrada, naranja la salida)${res ? ` y el agua de la corrida coloreada por ${layer}` : ''}${particles && res ? `, con partículas que siguen la velocidad (${PARTICLE_SPEED} veces más rápido)` : ''}; ${vexNote(vex)}.`}
          viewNames={[
            { id: 'valle', label: 'Todo el terreno' },
            { id: 'cerca', label: 'De cerca' },
          ]}
          make={(st) => new ValleyWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <div
            className={`m2-drop${drag ? ' is-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void onFile(e.dataTransfer.files?.[0]);
            }}
          >
            <p>{d ? `${dem?.info.name}: ${d.NX} × ${d.NY} píxeles de ${es(d.px, 2)} m` : 'Suelta aquí un GeoTIFF o usa los botones del panel.'}</p>
          </div>
        </FlatStage>
      )}
      <Question q="¿Cómo se inunda tu terreno?" answer={answer} tone={res && !res.unstable ? 'ok' : 'mid'} />
      {d && <RunBadge r={run} />}
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const sideOpts = (['O', 'E', 'S', 'N'] as Side[]).map((k) => ({ value: k, label: SIDE_NAMES[k] }));
  const dock = (
    <>
      <LiveHud
        head={d ? [`${es(W, 0)} × ${es(H, 0)} m`, `${cells.toLocaleString('es-CO')} celdas`, res ? `${es(wet / 10000, 2)} ha con agua` : 'sin correr'] : ['Sin terreno', '', '']}
        chart={
          pser ? (
            <XYChart series={[{ name: 'cota del agua en la sonda', pts: pser.pts, color: SER.a, width: 2.4 }]} hlines={[{ y: pser.zg, text: 'terreno' }]} vlines={play.t !== null ? [{ x: play.t / 60, text: 'ahora' }] : []} onScrub={play.seekMin} tipFmt={(v) => `${es(v, 0)} min`} xLabel="tiempo (min)" yLabel="cota (m)" yFmt={(v) => es(v, 2)} label="Nivel del agua en la sonda a lo largo de la corrida; si se queda en la línea del terreno, la sonda no se mojó." />
          ) : res ? (
            <HydroChart t={res.series.t} qin={res.series.qin} qBridge={res.series.qin.map(() => NaN)} qout={res.series.qout} now={play.t} onScrub={play.seekMin} />
          ) : undefined
        }
        traces={[
          { key: 'a', label: 'Área con más de 10 cm de agua', unit: 'ha', value: res ? wet / 10000 : NaN, digits: 2 },
          { key: 'q', label: 'Caudal máximo de salida', unit: 'm³/s', value: res ? Math.max(0, ...res.series.qout) : NaN, digits: 1 },
          { key: 'v', label: 'Error de volumen', unit: '%', value: res?.vol.errPct ?? NaN, digits: 4 },
        ]}
      />
      <TimeBar pb={play} res={res} />
      <div className="hc-flood is-inline m2-file">
        <input
          ref={fileRef}
          type="file"
          accept=".tif,.tiff,image/tiff"
          aria-label="Cargar un GeoTIFF"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()}>
          Cargar un GeoTIFF
        </button>
        <button type="button" onClick={useExample}>
          Usar el ejemplo
        </button>
      </div>
      <p className="q3-small" aria-live="polite">
        {msg || `Un MDT de una banda; hasta ${MAX_PIXELS.toLocaleString('es-CO')} píxeles se usan tal cual, más grandes se promedian por bloques.`}
      </p>
      {d && (
        <>
          <DockChoice label="Entrada (hidrograma)" value={p.inSide} options={sideOpts} onChange={(v) => set({ inSide: v as Side })} />
          <DockRange label="Tramo de la entrada" value={p.inFrom} min={0} max={95} step={5} show={`${p.inFrom} a ${p.inTo} %`} onChange={(v) => set({ inFrom: Math.min(v, p.inTo - 5) })} />
          <DockRange label="… hasta" value={p.inTo} min={5} max={100} step={5} show={`${p.inTo} %`} onChange={(v) => set({ inTo: Math.max(v, p.inFrom + 5) })} />
          <DockChoice label="Salida (profundidad normal)" value={p.outSide} options={sideOpts} onChange={(v) => set({ outSide: v as Side })} />
          <DockRange label="Tramo de la salida" value={p.outFrom} min={0} max={95} step={5} show={`${p.outFrom} a ${p.outTo} %`} onChange={(v) => set({ outFrom: Math.min(v, p.outTo - 5) })} />
          <DockRange label="… hasta" value={p.outTo} min={5} max={100} step={5} show={`${p.outTo} %`} onChange={(v) => set({ outTo: Math.max(v, p.outFrom + 5) })} />
          <DockRange label="Caudal pico" value={p.Qp} min={1} max={300} step={1} show={`${p.Qp} m³/s`} onChange={(v) => set({ Qp: v })} />
          <DockRange label="Tiempo al pico" value={p.tp} min={5} max={60} step={5} show={`${p.tp} min`} onChange={(v) => set({ tp: v })} />
          <DockChoice label="Pendiente de los bordes" value={String(p.slope)} options={[0.001, 0.003, 0.006, 0.01, 0.03].map((x) => ({ value: String(x), label: `${es(x * 100, 1)} %` }))} onChange={(v) => set({ slope: Number(v) })} />
          <DockRange label="n de Manning (uniforme)" value={p.n} min={0.02} max={0.15} step={0.005} show={es(p.n, 3)} onChange={(v) => set({ n: Math.round(v * 1000) / 1000 })} />
          <DockChoice
            label="Lluvia sobre el terreno"
            value={p.rain ? 'si' : 'no'}
            options={[
              { value: 'no', label: 'No' },
              { value: 'si', label: 'Sí' },
            ]}
            onChange={(v) => set({ rain: v === 'si' })}
          />
          {p.rain && (
            <>
              <DockRange label="Lluvia total" value={p.P} min={10} max={160} step={10} show={`${p.P} mm en ${p.D} min`} onChange={(v) => set({ P: v })} />
              <DockRange label="Número de curva (uniforme)" value={p.cn} min={40} max={98} step={1} show={String(p.cn)} onChange={(v) => set({ cn: v })} />
            </>
          )}
          <DockChoice label="Celdas" value={String(p.k)} options={kOptions(d).map((k) => ({ value: String(k), label: `${es(k * d.px, 1)} m (${(Math.ceil(d.NX / k) * Math.ceil(d.NY / k)).toLocaleString('es-CO')})` }))} onChange={(v) => set({ k: Number(v) })} />
          <DockChoice<Eq> label="Ecuaciones" value={p.eq} options={(Object.keys(EQ_NAMES) as Eq[]).map((k) => ({ value: k, label: EQ_NAMES[k] }))} onChange={(v) => set({ eq: v })} />
          <DockRange label="Duración" value={p.duration} min={30} max={180} step={10} show={`${p.duration} min`} onChange={(v) => set({ duration: v })} />
          <WaterChoice value={layer} onChange={setLayer} options={[...WATER_LAYERS, { value: 'courant', label: 'Courant' }]} />
          <LayerLegend layer={layer} maxT={p.duration} eq={p.eq} />
          <FlowTools particles={particles} setParticles={setParticles} tool={tool} setTool={setTool} notice={notice} />
          {res && (
            <div className="hc-flood is-inline">
              <button type="button" onClick={saveRes}>
                Resultados (ZIP con GeoTIFF y CSV)
              </button>
            </div>
          )}
        </>
      )}
      <VexChoice value={vex} onChange={setVex} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <h3>Preparar un terreno</h3>
        <p>
          El modelo necesita un <strong>MDT</strong> (suelo desnudo) de un <strong>sector pequeño</strong>: una quebrada y su llanura, unas decenas de hectáreas. No hace falta la ciudad entera: en un SIG (por ejemplo QGIS: Ráster → Extracción → Cortar) se recorta el sector y se exporta como <strong>GeoTIFF de una banda</strong>, en un sistema proyectado en metros (en Colombia, MAGNA-SIRGAS 2018 / Origen-Nacional, EPSG:9377). La sala lee el píxel y la esquina del archivo; si tiene más de {MAX_PIXELS.toLocaleString('es-CO')} píxeles, los promedia por bloques.
        </p>
        <p>
          Revise que el cauce se vea: si el sensor no atravesó el agua, falta la sección bajo la lámina y el modelo inunda antes de tiempo (parte «Terreno»). Un MDS (con techos y copas) no sirve para el flujo.
        </p>
        <h3>Armar el modelo</h3>
        <p>
          Las <strong>líneas de borde</strong> van en los lados del rectángulo: la entrada lleva un hidrograma (con forma gamma, como en el valle), repartido con la pendiente de energía; la salida, profundidad normal. Póngalas sobre el cauce y lejos de lo que interesa. El n y el número de curva son uniformes (un primer ensayo); las celdas, de 2 píxeles o más para que las tablas subgrid sirvan.
        </p>
        <h3>El archivo no sale del equipo</h3>
        <p>El GeoTIFF lo lee el navegador; no se sube a ningún servidor. Los resultados se pueden descargar como un ZIP con la profundidad, la cota y la velocidad máximas en GeoTIFF (con la georreferencia del archivo cargado) y las series en CSV.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Corre la cañada de ejemplo o tu propio terreno. Las corridas se lanzan con el botón «Calcular»." />,
    diseno: <DesignTab part="propio" set={MODEL2D_TOOLS.propio} room={ROOM} />,
    datos: (
      <div className="q3-data">
        {dem ? (
          <table className="q3-table">
            <caption>El archivo</caption>
            <tbody>
              <Row name="Nombre" value={dem.info.name} note={`${es(dem.info.bytes / 1e6, 2)} MB`} />
              <Row name="Ráster" value={`${dem.info.width} × ${dem.info.height} píxeles de ${es(dem.info.pxIn, 2)} m`} note={dem.info.factor > 1 ? `promediado de ${dem.info.factor} en ${dem.info.factor}: ${d!.NX} × ${d!.NY} píxeles de ${es(d!.px, 2)} m` : 'usado tal cual'} />
              <Row name="Sistema de referencia" value={dem.info.epsg ? `EPSG:${dem.info.epsg}` : dem.info.geographic ? 'geográfico (grados)' : 'no declarado'} note={d?.E0 !== undefined ? `esquina suroeste ${es(d!.E0!, 1)}, ${es(d!.N0!, 1)}` : ''} />
              <Row name="Cotas" value={`${es(dem.info.zmin, 2)} a ${es(dem.info.zmax, 2)} m`} note={Number.isFinite(dem.info.nodata) ? `sin dato = ${dem.info.nodata}` : 'sin valor de «sin dato»'} />
              {dem.info.notes.map((n, k) => (
                <Row key={k} name="Nota" value={n} />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="q3-small">Todavía no hay un terreno cargado.</p>
        )}
        <div className="hc-flood is-inline">
          <button type="button" onClick={saveExample}>
            Descargar el terreno de ejemplo (ZIP con el GeoTIFF)
          </button>
        </div>
        {res && (
          <table className="q3-table">
            <caption>Registro de la corrida</caption>
            <tbody>
              {res.log.map((l, k) => (
                <tr key={k}>
                  <td>{l}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Que el mismo modelo sirve para cualquier terreno; cómo se prepara un MDT para un modelo 2D (recorte, sistema proyectado, banda única, sin dato); cómo se ubican las líneas de borde; la escala de un modelo que corre en el navegador.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>Lectura del GeoTIFF con geotiff.js en el navegador; reducción por promedio de bloques; el motor 2D de la sala (subgrid, onda difusiva, inercia local o aguas someras completas). Prueba M27.</p>
        <h3>Límites</h3>
        <p>n y número de curva uniformes; líneas de borde solo en los lados del rectángulo; sin estructuras. Un sector pequeño y una primera aproximación: no es un estudio de amenaza ni un pronóstico oficial de inundación.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'diseno', 'datos', 'docente']} />;
}

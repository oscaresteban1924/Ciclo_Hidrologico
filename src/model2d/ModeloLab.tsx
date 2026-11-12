// «HEC-RAS 2D paso a paso»: el orden de trabajo de un modelo bidimensional, sección por sección: proyección,
// terreno, coberturas y n, área 2D y malla, condiciones de borde, flujo no permanente, plan y opciones de cálculo,
// la corrida (preprocesador y cálculo), los resultados (profundidad, velocidad, cota, amenaza y llegada) y la
// comparación de corridas. Cada paso dice qué hace y qué pasa por dentro. La pregunta: ¿está listo el modelo?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { HazardBars, HydroChart, LayerLegend, SectionChart, StageChart, XYChart } from './charts';
import { MODEL2D_TOOLS, ROOM } from './design';
import { DEFAULT_MODEL, HAZARD_TEXT, N_LEVEL_NAMES, SOURCES, STEPS, modelRun, modelTerrain, nSet, type ModelScene, type NLevel, type Summary } from './scene';
import { AMS_FIT, PERIODS, quantile, risk } from './hydrology';
import { BUILDING_NAMES, EQ_NAMES, buildGeometry, hydroQ, type BuildingMode, type Eq } from './solver';
import { COVER_KEYS, COVERS, LEVEE, NX, NY, ROAD, ROAD_Z, sectionAt, terrainFor, truth, yc } from './terrain';
import { useModelRun } from './runs';
import { PLACE, VexChoice, sg, valleyState, vexNote } from './common';
import { ValleyWorld, type Layer } from './three/valleyWorld';

interface Saved {
  key: string;
  s: ModelScene;
  sum: Summary;
  ms: number;
}
/** Corridas de esta sesión (se comparan en el último paso). */
const HISTORY: Saved[] = [];

interface Ctx {
  s: ModelScene;
  hist: Saved[];
  sum: Summary | null;
}

const same = (a: ModelScene, b: ModelScene, except: (keyof ModelScene)[]) => (Object.keys(a) as (keyof ModelScene)[]).every((k) => except.includes(k) || k === 'step' || k === 'layer' || a[k] === b[k]);
const pairs = (h: Saved[], key: keyof ModelScene, f: (a: Saved, b: Saved) => boolean) => h.some((a) => h.some((b) => a !== b && a.s[key] !== b.s[key] && same(a.s, b.s, [key]) && f(a, b)));

const RETOS: Reto<Ctx>[] = [
  {
    id: 'm2-satelite',
    title: 'Con el satélite',
    goal: 'Corre el modelo con el LiDAR y con Copernicus GLO-30, sin cambiar nada más, y encuentra una diferencia de 50 cm o más en el nivel del puente.',
    hint: 'Un MDS de 30 m con metros de error vertical no ve el cauce, ni la luz del puente, ni el jarillón.',
    check: (c) => pairs(c.hist, 'source', (a, b) => a.s.source === 'lidar' && b.s.source === 'copernicus' && Math.abs(a.sum.wseBridge - b.sum.wseBridge) >= 0.5),
    progress: (c) => `${c.hist.length} corridas guardadas`,
  },
  {
    id: 'm2-cauce',
    title: 'El cauce que el láser no ve',
    goal: 'Corre el modelo con el LiDAR con y sin el cauce levantado, sin cambiar nada más, y compara el área inundada del barrio.',
    hint: 'Sin el cauce bajo la lámina de agua, el modelo tiene menos sección y el agua sale antes a la llanura.',
    check: (c) => pairs(c.hist, 'burn', (a, b) => a.s.source === 'lidar' && a.s.burn && !b.s.burn && b.sum.townArea > a.sum.townArea),
    progress: (c) => `${c.hist.length} corridas guardadas`,
  },
  {
    id: 'm2-amenaza',
    title: 'El mapa de amenaza',
    goal: 'Haz una corrida en la que 500 m² o más del barrio quedan en amenaza H3 o mayor (inseguro para niños y adultos mayores) y míralo en la capa de amenaza.',
    hint: 'Las crecientes más raras y el agua que se empoza junto a la vía hacen la amenaza mayor.',
    check: (c) => !!c.sum && c.s.layer === 'amenaza' && c.sum.townHazard.slice(3).reduce((a, b) => a + b, 0) >= 500,
    progress: (c) => (c.sum ? `${es(c.sum.townHazard.slice(3).reduce((a, b) => a + b, 0), 0)} m² en H3 o más` : 'sin corrida'),
  },
  {
    id: 'm2-sensibilidad',
    title: 'Tres corridas de sensibilidad',
    goal: 'Guarda tres corridas o más que cambien el terreno, el n o la malla, y compáralas en el último paso.',
    hint: 'Un modelo serio se corre varias veces: la diferencia entre corridas dice cuánto confiar en el mapa.',
    check: (c) => c.hist.length >= 3 && (new Set(c.hist.map((h) => h.s.source + h.s.burn)).size >= 2 || new Set(c.hist.map((h) => h.s.level)).size >= 2 || new Set(c.hist.map((h) => h.s.c)).size >= 2),
    progress: (c) => `${c.hist.length} corridas guardadas`,
  },
];

const label = (s: ModelScene) => `${SOURCES.find((x) => x.id === s.source)?.name.split(' (')[0] ?? s.source}${s.burn ? ' + cauce' : ''} · n ${N_LEVEL_NAMES[s.level].toLowerCase()} · ${s.c} m · ${s.eq === 'difusiva' ? 'difusiva' : 'inercia'} · T ${s.T}`;

export function ModeloLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<ModelScene>(DEFAULT_MODEL);
  const [vex, setVex] = useState(3);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [frame, setFrame] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hist, setHist] = useState<Saved[]>(() => [...HISTORY]);
  const opts = useMemo(() => modelRun(s), [s]);
  const run = useModelRun(s.crs === 'origen' ? opts : null, false);
  const terr = useMemo(() => terrainFor(modelTerrain(s)), [s.source, s.burn]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = STEPS[s.step].id;
  const geom = useMemo(() => (step === 'malla' || step === 'plan' ? buildGeometry(opts.terrain, opts.mesh, opts.rough) : null), [step, opts.terrain, opts.mesh, opts.rough]);
  const res = run.status === 'listo' || run.status === 'inestable' ? run.res : null;
  const sum = run.status === 'listo' ? run.sum : null;
  // guardar la corrida terminada para comparar
  useEffect(() => {
    if (run.status !== 'listo' || !run.sum || !run.res) return;
    if (HISTORY.some((h) => h.key === run.key)) return;
    HISTORY.push({ key: run.key, s: { ...s }, sum: run.sum, ms: run.res.ms });
    while (HISTORY.length > 8) HISTORY.shift();
    setHist([...HISTORY]);
  }, [run.status, run.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // reproducción de los mapas en el tiempo
  useEffect(() => {
    if (!playing || !res) return;
    const id = window.setInterval(() => setFrame((f) => (f === null ? 0 : f + 1 >= res.frames.length ? (setPlaying(false), res.frames.length - 1) : f + 1)), 140);
    return () => window.clearInterval(id);
  }, [playing, res]);
  useEffect(() => {
    setFrame(null);
    setPlaying(false);
  }, [run.key]);
  const world = useRef<ValleyWorld | null>(null);
  const sync = useRef({ s, vex, terr, res, frame, sum });
  sync.current = { s, vex, terr, res, frame, sum };
  const toWorld = () => {
    const { s: x, vex: v, terr: t, res: rr, frame: fr, sum: sm } = sync.current;
    const id = STEPS[x.step].id;
    const showWater = !!rr && ['correr', 'resultados', 'comparar'].includes(id);
    world.current?.set(
      valleyState({
        vex: v,
        fine: t.fine,
        raster: t.raster.p >= 5 ? t.raster : null,
        colorBy: id === 'cobertura' ? 'cobertura' : id === 'terreno' || id === 'malla' || id === 'plan' ? 'altura' : 'natural',
        objects: id === 'malla' || id === 'plan' ? 'no' : modelTerrain(x).surf === 'mds' ? 'no' : id === 'terreno' ? 'fantasma' : t.raster.p <= 2 ? 'si' : 'no',
        mesh: id === 'malla' || id === 'plan' ? { c: x.c } : null,
        breaklines: (id === 'malla' || id === 'plan') && x.breaklines,
        bc: id === 'bordes' || id === 'flujo',
        water: showWater ? { res: rr!, frame: id === 'resultados' ? fr : null, layer: id === 'resultados' ? x.layer : 'profundidad' } : null,
        labels: worldLabels(x, sm, rr ? rr.frameT[fr ?? 0] : null, fr),
      }),
    );
  };
  useEffect(() => {
    toWorld();
  }, [s, vex, terr, res, frame, sum]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, hist, sum }), [s, hist, sum]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<ModelScene>) => setS((x) => ({ ...x, ...p }));
  const go = (k: number) => set({ step: Math.max(0, Math.min(STEPS.length - 1, k)) });
  const QT = quantile(AMS_FIT, s.T);
  const estC = (2.5 * s.dt) / s.c;

  const ready = s.crs === 'origen';
  const tone: 'ok' | 'mid' | 'bad' = !ready || run.status === 'inestable' ? 'bad' : sum ? (Math.abs(sum.volErr) < 0.1 ? 'ok' : 'mid') : 'mid';
  const answer = !ready ? (
    <>Con coordenadas geográficas las distancias quedan en grados: RAS Mapper necesita una proyección plana en metros (en Colombia, MAGNA-SIRGAS 2018 / Origen-Nacional, EPSG:9377) para calcular pendientes, áreas y caudales.</>
  ) : sum && res ? (
    <>
      El modelo corrió {res.steps.toLocaleString('es-CO')} pasos en {es(res.ms / 1000, 1)} s con un error de volumen de {es(Math.abs(sum.volErr) < 5e-5 ? 0 : sum.volErr, 4)} %. La creciente de {s.T} años ({es(QT, 1)} m³/s) sube a <strong>{es(sum.wseBridge, 2)} m</strong> en el puente y deja {es(sum.townArea, 0)} m² del barrio con agua
      {sum.school > 0.05 ? `; en la escuela, ${es(sum.school, 2)} m` : ''}. Es un escenario: sin calibrar con observaciones no es un pronóstico.
    </>
  ) : run.status === 'inestable' ? (
    <>La corrida se volvió inestable: {res?.unstable?.why} Revisa el paso de tiempo, el peso θ o las ecuaciones en el paso «Plan y opciones».</>
  ) : (
    <>
      Paso {s.step + 1} de {STEPS.length}: <strong>{STEPS[s.step].name}</strong>. En HEC-RAS: {STEPS[s.step].ras}. Arma el modelo y córrelo en el paso «Correr».
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label={`Maqueta 3D del valle en el paso «${STEPS[s.step].name}» del modelo: ${stepScene(step)}; ${vexNote(vex)}.`}
          viewNames={[
            { id: 'valle', label: 'El valle' },
            { id: 'barrio', label: 'El barrio' },
            { id: 'puente', label: 'El puente' },
            { id: step === 'bordes' || step === 'flujo' ? 'entrada' : 'malla', label: step === 'bordes' || step === 'flujo' ? 'La entrada' : 'De cerca' },
          ]}
          make={(st) => new ValleyWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>{sum ? <HazardBars areas={sum.townHazard} /> : <SectionChart x={250} secTrue={sectionAt(truth().mdt, 250)} secModel={sectionAt(terr.fine, 250)} bank={truth().mdt[Math.floor(yc(250) + 8) * NX + 250]} W={520} H={240} cls="hc-exp-svg cu-svg" />}</FlatStage>
      )}
      <Question q="¿Está listo el modelo?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  // ---- controles de cada paso
  const controls: Record<string, ReactNode> = {
    proyeccion: (
      <DockChoice
        label="Sistema de coordenadas del proyecto"
        value={s.crs}
        options={[
          { value: 'origen', label: 'MAGNA-SIRGAS 2018 / Origen-Nacional (EPSG:9377)' },
          { value: 'geograficas', label: 'Geográficas en grados (EPSG:4326)' },
        ]}
        onChange={(v) => set({ crs: v as ModelScene['crs'] })}
      />
    ),
    terreno: (
      <>
        <DockChoice label="Fuente del terreno" value={s.source} options={SOURCES.map((x) => ({ value: x.id, label: x.name.split(' (')[0] }))} onChange={(v) => set({ source: v })} />
        <DockChoice
          label="Cauce levantado encima del terreno"
          value={s.burn ? 'si' : 'no'}
          options={[
            { value: 'si', label: 'Sí' },
            { value: 'no', label: 'No' },
          ]}
          onChange={(v) => set({ burn: v === 'si' })}
        />
      </>
    ),
    cobertura: (
      <>
        <DockChoice<NLevel> label="n de las coberturas (Chow)" value={s.level} options={(Object.keys(N_LEVEL_NAMES) as NLevel[]).map((k) => ({ value: k, label: N_LEVEL_NAMES[k] }))} onChange={(v) => set({ level: v })} />
        <DockChoice<BuildingMode> label="Las casas" value={s.buildings} options={(Object.keys(BUILDING_NAMES) as BuildingMode[]).map((k) => ({ value: k, label: BUILDING_NAMES[k] }))} onChange={(v) => set({ buildings: v })} />
      </>
    ),
    malla: (
      <>
        <DockChoice label="Tamaño de las celdas" value={String(s.c)} options={[5, 10, 20, 40].map((c) => ({ value: String(c), label: `${c} m` }))} onChange={(v) => set({ c: Number(v) })} />
        <DockChoice
          label="Líneas de quiebre (jarillón y vía)"
          value={s.breaklines ? 'si' : 'no'}
          options={[
            { value: 'si', label: 'Sí' },
            { value: 'no', label: 'No' },
          ]}
          onChange={(v) => set({ breaklines: v === 'si' })}
        />
      </>
    ),
    bordes: (
      <>
        <DockChoice label="Entrada: pendiente de energía para repartir el caudal" value={String(s.egSlope)} options={[0.001, 0.005, 0.02].map((v) => ({ value: String(v), label: `${es(v * 100, 1)} %` }))} onChange={(v) => set({ egSlope: Number(v) })} />
        <DockChoice label="Salida: pendiente de fricción (profundidad normal)" value={String(s.outSlope)} options={[0.0005, 0.002, 0.005, 0.02].map((v) => ({ value: String(v), label: `${es(v * 100, 2)} %` }))} onChange={(v) => set({ outSlope: Number(v) })} />
      </>
    ),
    flujo: (
      <>
        <DockChoice label="Creciente (periodo de retorno)" value={String(s.T)} options={PERIODS.map((T) => ({ value: String(T), label: `${T} años` }))} onChange={(v) => set({ T: Number(v) })} />
        <DockRange label="Tiempo al pico" value={s.tp} min={10} max={60} step={5} show={`${s.tp} min`} onChange={(v) => set({ tp: v })} />
        <DockRange label="Condiciones iniciales (caudal base)" value={s.warmup} min={10} max={40} step={5} show={`${s.warmup} min`} onChange={(v) => set({ warmup: v })} />
      </>
    ),
    plan: (
      <>
        <DockChoice<Eq> label="Ecuaciones" value={s.eq} options={(Object.keys(EQ_NAMES) as Eq[]).map((k) => ({ value: k, label: EQ_NAMES[k] }))} onChange={(v) => set({ eq: v, dtMode: v === 'inercia' ? 'courant' : s.dtMode, courantMax: v === 'inercia' ? 0.7 : 2 })} />
        <DockChoice
          label="Intervalo de cálculo"
          value={s.dtMode}
          options={[
            { value: 'fijo', label: 'Fijo' },
            { value: 'courant', label: 'Ajustado por Courant' },
          ]}
          onChange={(v) => set({ dtMode: v as ModelScene['dtMode'] })}
        />
        <DockChoice label={s.dtMode === 'fijo' ? 'Δt' : 'Δt base'} value={String(s.dt)} options={[1, 2, 5, 10, 15, 20, 30, 60].map((d) => ({ value: String(d), label: `${d} s` }))} onChange={(v) => set({ dt: Number(v) })} />
        {s.dtMode === 'courant' && <DockChoice label="Courant máximo" value={String(s.courantMax)} options={(s.eq === 'inercia' ? [0.5, 0.7, 0.9] : [1, 2, 3, 5]).map((c) => ({ value: String(c), label: es(c, 1) }))} onChange={(v) => set({ courantMax: Number(v) })} />}
        {s.eq === 'difusiva' && (
          <>
            <DockRange label="Peso implícito θ" value={s.theta} min={0.6} max={1} step={0.05} show={es(s.theta, 2)} onChange={(v) => set({ theta: v })} />
            <DockChoice label="Tolerancia del nivel" value={String(s.tolWS)} options={[0.001, 0.003, 0.01, 0.03].map((v) => ({ value: String(v), label: `${es(v * 1000, 0)} mm` }))} onChange={(v) => set({ tolWS: Number(v) })} />
            <DockRange label="Iteraciones máximas" value={s.maxIter} min={2} max={40} step={1} show={String(s.maxIter)} onChange={(v) => set({ maxIter: v })} />
          </>
        )}
        <DockRange label="Duración del evento" value={s.duration} min={80} max={180} step={10} show={`${s.duration} min`} onChange={(v) => set({ duration: v })} />
      </>
    ),
    correr: (
      <div className="m2-run">
        {!ready ? (
          <p className="q3-small">No se puede correr: el proyecto está en coordenadas geográficas (vuelve al paso 1).</p>
        ) : run.status === 'preproceso' || run.status === 'corriendo' ? (
          <div className="m2-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(run.progress * 100)} aria-label="Avance de la corrida">
            <i style={{ width: `${run.progress * 100}%` }} />
            <span>{run.status === 'preproceso' ? 'Preprocesador de geometría: tablas de celdas y caras…' : `Cálculo no permanente: t = ${es(run.t / 60, 1)} min (${es(run.progress * 100, 0)} %)`}</span>
          </div>
        ) : (
          <div className="hc-flood is-inline">
            <button type="button" onClick={run.start}>
              {run.status === 'espera' ? 'Calcular (preprocesador y cálculo)' : 'Calcular de nuevo'}
            </button>
          </div>
        )}
        {res && (
          <ul className="m2-log" aria-label="Registro de la corrida">
            {res.log.map((l, k) => (
              <li key={k}>{l}</li>
            ))}
            {s.eq === 'difusiva' && res.iters.total > 0 && (
              <li>
                Iteraciones: {res.iters.total.toLocaleString('es-CO')}, hasta {res.iters.max} en un paso; {res.iters.nonconv} pasos sin llegar a la tolerancia (error máximo {es(res.iters.maxErr * 1000, 1)} mm).
              </li>
            )}
            <li>Courant máximo {es(res.courantMax, 2)}.</li>
          </ul>
        )}
      </div>
    ),
    resultados: (
      <>
        <DockChoice<Layer>
          label="Capa de resultados"
          value={s.layer}
          options={[
            { value: 'profundidad', label: 'Profundidad' },
            { value: 'velocidad', label: 'Velocidad' },
            { value: 'cota', label: 'Cota del agua' },
            { value: 'amenaza', label: 'Amenaza H1–H6' },
            { value: 'llegada', label: 'Llegada' },
          ]}
          onChange={(v) => set({ layer: v })}
        />
        <LayerLegend layer={s.layer} maxT={s.duration} />
        {res ? (
          <>
            <div className="hc-flood is-inline">
              <button type="button" onClick={() => (frame === null || frame >= res.frames.length - 1 ? (setFrame(0), setPlaying(true)) : setPlaying(!playing))}>
                {playing ? 'Pausar' : 'Reproducir la creciente'}
              </button>
              <button type="button" onClick={() => (setPlaying(false), setFrame(null))}>
                Máximos
              </button>
            </div>
            <DockRange label="Tiempo" value={frame ?? res.frames.length - 1} min={0} max={res.frames.length - 1} step={1} show={frame === null ? 'máximos' : `${es(res.frameT[frame] / 60, 0)} min`} onChange={(v) => (setPlaying(false), setFrame(v))} />
          </>
        ) : (
          <p className="q3-small">Todavía no hay resultados: corre el modelo en el paso «Correr».</p>
        )}
      </>
    ),
    comparar: <p className="q3-small">{hist.length ? `${hist.length} corridas guardadas en esta sesión. La tabla está en «Esquema».` : 'Todavía no hay corridas guardadas.'}</p>,
  };

  const hydroPreview = useMemo(() => {
    const h = { Qp: QT, tp: s.tp, Qb: 4 };
    return Array.from({ length: 61 }, (_, k) => [(k / 60) * s.duration, hydroQ(h, (k / 60) * s.duration * 60)] as [number, number]);
  }, [QT, s.tp, s.duration]);
  const chart =
    res && (step === 'resultados' || step === 'correr' || step === 'comparar') ? (
      <HydroChart t={res.series.t} qin={res.series.qin} qBridge={res.series.qBridge} qout={res.series.qout} now={frame !== null ? res.frameT[frame] : null} />
    ) : step === 'flujo' || step === 'bordes' ? (
      <XYChart series={[{ name: 'hidrograma de entrada', pts: hydroPreview, color: '#2a78d6', area: true }]} xLabel="tiempo (min)" yLabel="caudal (m³/s)" yFmt={(v) => es(v, 0)} label={`Hidrograma de entrada de la creciente de ${s.T} años: pico de ${es(QT, 1)} m³/s.`} />
    ) : (
      <SectionChart x={250} secTrue={sectionAt(truth().mdt, 250)} secModel={sectionAt(terr.fine, 250)} bank={truth().mdt[Math.floor(yc(250) + 8) * NX + 250]} />
    );

  const dock = (
    <>
      <nav className="m2-steps" aria-label="Pasos del modelo">
        {STEPS.map((st, k) => (
          <button key={st.id} type="button" className={k === s.step ? 'is-on' : k < s.step ? 'is-done' : ''} aria-current={k === s.step ? 'step' : undefined} onClick={() => go(k)} title={st.ras}>
            <b>{k + 1}</b> {st.name}
          </button>
        ))}
      </nav>
      <LiveHud
        head={[
          `${STEPS[s.step].name}`,
          step === 'malla' && geom ? `${geom.NC.toLocaleString('es-CO')} celdas, ${geom.NF.toLocaleString('es-CO')} caras` : step === 'plan' ? `Courant estimado ${es(estC, 1)} (V = 2,5 m/s)` : `T = ${s.T} años: ${es(QT, 1)} m³/s`,
          sum ? `puente ${es(sum.wseBridge, 2)} m` : 'sin resultados',
        ]}
        chart={chart}
        traces={[
          { key: 'w', label: 'Agua en el puente (máxima)', unit: 'm', value: sum?.wseBridge ?? NaN, digits: 2 },
          { key: 'a', label: 'Barrio con agua', unit: 'm²', value: sum?.townArea ?? 0, digits: 0 },
          { key: 'v', label: 'Error de volumen', unit: '%', value: sum?.volErr ?? 0, digits: 4 },
        ]}
      />
      {controls[step]}
      <div className="m2-stepnav">
        <button type="button" onClick={() => go(s.step - 1)} disabled={s.step === 0}>
          ← Anterior
        </button>
        <button type="button" onClick={() => go(s.step + 1)} disabled={s.step === STEPS.length - 1}>
          Siguiente →
        </button>
      </div>
      <VexChoice value={vex} onChange={setVex} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: <StepText s={s} geomCells={geom?.NC ?? null} res={res} sum={sum} hist={hist} />,
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Arma el modelo paso a paso, córrelo y compara corridas. Las corridas terminadas se guardan en esta sesión para el último paso." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Corridas de esta sesión</h3>
        <CompareTable hist={hist} />
        {res && (
          <>
            <h3>Nivel aguas arriba del puente</h3>
            <StageChart t={res.series.t} wse={res.series.wseBridge} ref={{ y: ROAD_Z, text: 'corona de la vía' }} W={480} H={190} cls="hc-exp-svg cu-svg" />
          </>
        )}
        {sum && (
          <>
            <h3>Amenaza en el barrio (AIDR, 2017)</h3>
            <HazardBars areas={sum.townHazard} />
          </>
        )}
      </div>
    ),
    diseno: <DesignTab part="modelo" set={MODEL2D_TOOLS.modelo} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El modelo armado</caption>
          <tbody>
            <Row name="Proyección" value={s.crs === 'origen' ? 'MAGNA-SIRGAS 2018 / Origen-Nacional (EPSG:9377)' : 'Geográficas (no sirven para el cálculo)'} note="coordenadas locales de la sala de 0 a 640 m y de 0 a 400 m" />
            <Row name="Terreno" value={SOURCES.find((x) => x.id === s.source)?.name ?? s.source} note={s.burn ? 'con el cauce levantado encima' : 'sin el cauce bajo el agua'} />
            <Row name="Coberturas" value={`n ${N_LEVEL_NAMES[s.level].toLowerCase()}`} note={COVER_KEYS.filter((c) => c !== 'edificio').map((c) => `${COVERS[c].name.toLowerCase()} ${es(nSet(s.level)[c], 3)}`).join(', ')} />
            <Row name="Casas" value={BUILDING_NAMES[s.buildings]} />
            <Row name="Malla" value={`celdas de ${s.c} m, ${(NX / s.c) * (NY / s.c)} celdas`} note={s.breaklines ? 'líneas de quiebre en el jarillón y la vía' : 'sin líneas de quiebre'} />
            <Row name="Entrada" value={`hidrograma de caudal, pico ${es(QT, 1)} m³/s (T = ${s.T} años)`} note={`pendiente de energía ${es(s.egSlope * 100, 1)} %; riesgo en 50 años ${es(risk(s.T, 50) * 100, 0)} %`} />
            <Row name="Salida" value="profundidad normal" note={`pendiente de fricción ${es(s.outSlope * 100, 2)} %`} />
            <Row name="Plan" value={`${EQ_NAMES[s.eq]}, Δt ${s.dtMode === 'fijo' ? `fijo de ${s.dt} s` : `ajustado (Courant ${es(s.courantMax, 1)})`}`} note={s.eq === 'difusiva' ? `θ = ${es(s.theta, 2)}, tolerancia ${es(s.tolWS * 1000, 0)} mm, ${s.maxIter} iteraciones` : 'esquema explícito'} />
            <Row name="Tiempos" value={`${s.warmup} min de condiciones iniciales y ${s.duration} min de evento`} note="mapas cada minuto" />
            <Row name="Obras" value={`jarillón de ${es(LEVEE.H, 1)} m; vía a ${es(ROAD_Z, 2)} m`} note={`puente en x = ${ROAD.x} m`} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>El orden de trabajo de un modelo 2D en HEC-RAS (proyección, terreno, coberturas, área 2D y malla, líneas de quiebre, condiciones de borde, datos de flujo no permanente, plan, opciones de cálculo, preprocesador, cálculo, resultados) y qué hace cada sección; la lectura crítica de los resultados (balance de volumen, Courant, iteraciones); los mapas de profundidad, velocidad, cota, llegada y amenaza; la sensibilidad a las decisiones.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Modelo 2D de la sala (onda difusiva implícita o inercia local explícita con tablas subgrid), con las opciones y valores por omisión documentados para HEC-RAS (θ = 1, tolerancia del nivel 0,01 pie, 20 iteraciones, Courant hasta 3 o 5). Reparto del caudal de entrada por conducción con la profundidad normal. Amenaza H1 a H6 con los límites combinados de profundidad, velocidad y su producto de la guía 7-3 del Australian Institute for Disaster Resilience (2017). Proyección oficial de Colombia: Resolución 370 de 2021 del IGAC (EPSG:9377).
        </p>
        <h3>Límites</h3>
        <p>No es HEC-RAS ni reemplaza su uso: es un modelo hecho con sus ideas para entenderlo por dentro. El valle, la serie y las obras son ilustrativos; los mapas no son un estudio de amenaza ni un pronóstico oficial de inundación, y las opciones de la sala no son diseños de ingeniería.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

function stepScene(id: string): string {
  switch (id) {
    case 'proyeccion':
      return 'el valle con sus esquinas en coordenadas planas';
    case 'terreno':
      return 'el terreno que se cargó, con el contorno de las casas que el MDT no tiene';
    case 'cobertura':
      return 'el terreno coloreado por cobertura del suelo';
    case 'malla':
    case 'plan':
      return 'la malla de cálculo sobre el terreno y las líneas de quiebre en amarillo';
    case 'bordes':
    case 'flujo':
      return 'las líneas de borde: azul la entrada del hidrograma y naranja la salida con profundidad normal';
    default:
      return 'el agua de la corrida coloreada según la capa elegida';
  }
}

function worldLabels(s: ModelScene, sum: Summary | null, t: number | null, frame: number | null) {
  const id = STEPS[s.step].id;
  if (id === 'proyeccion')
    return [
      { id: 'c0', text: 'x = 0 m, y = 0 m', sub: s.crs === 'origen' ? 'coordenadas planas en metros' : 'en grados: ¡no sirve!', x: 4, y: 6, up: 3, kind: (s.crs === 'origen' ? 'dato' : 'alerta') as 'dato' | 'alerta', prio: 7 },
      { id: 'c1', text: 'x = 640 m, y = 400 m', x: NX - 4, y: NY - 6, up: 3, kind: 'dato' as const, prio: 6 },
    ];
  if (id === 'bordes' || id === 'flujo') return [PLACE.entrada('Entrada: hidrograma de caudal', `pendiente de energía ${es(s.egSlope * 100, 1)} %`), PLACE.salida('Salida: profundidad normal', `pendiente de fricción ${es(s.outSlope * 100, 2)} %`)];
  if (id === 'malla' || id === 'plan') return [PLACE.jarillon('Línea de quiebre', s.breaklines ? 'las caras toman la corona' : 'sin línea de quiebre', s.breaklines ? 'lugar' : 'alerta')];
  if (sum && (id === 'resultados' || id === 'correr' || id === 'comparar'))
    return [
      PLACE.puente(`Puente: ${es(sum.wseBridge, 2)} m`, undefined, 'dato'),
      PLACE.escuela('La escuela', sum.school > 0.05 ? `${es(sum.school, 2)} m de agua` : 'seca', sum.school > 0.05 ? 'alerta' : 'ok'),
      PLACE.barrio(frame !== null && t !== null ? `t = ${es(t / 60, 0)} min` : 'Máximos de la creciente', `${es(sum.townArea, 0)} m² del barrio con agua`, 'dato'),
    ];
  return [PLACE.puente(), PLACE.barrio(), PLACE.escuela()];
}

function CompareTable({ hist }: { hist: Saved[] }) {
  if (!hist.length) return <p className="q3-small">Todavía no hay corridas: arma el modelo y córrelo en el paso «Correr».</p>;
  const ref = hist[0];
  return (
    <table className="q3-table">
      <thead>
        <tr>
          <th>Corrida</th>
          <th>Puente</th>
          <th>Barrio con agua</th>
          <th>Escuela</th>
          <th>Error de volumen</th>
          <th>Cálculo</th>
        </tr>
      </thead>
      <tbody>
        {hist.map((h, k) => (
          <tr key={h.key}>
            <td>{label(h.s)}</td>
            <td>
              {es(h.sum.wseBridge, 2)} m{k ? ` (${sg(h.sum.wseBridge - ref.sum.wseBridge)})` : ''}
            </td>
            <td>{es(h.sum.townArea, 0)} m²</td>
            <td>{es(h.sum.school, 2)} m</td>
            <td>{es(Math.abs(h.sum.volErr) < 5e-5 ? 0 : h.sum.volErr, 4)} %</td>
            <td>{es(h.ms / 1000, 1)} s</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Qué hace cada sección del modelo y qué pasa por dentro. */
function StepText({ s, geomCells, res, sum, hist }: { s: ModelScene; geomCells: number | null; res: ReturnType<typeof useModelRun>['res']; sum: Summary | null; hist: Saved[] }) {
  const st = STEPS[s.step];
  const src = SOURCES.find((x) => x.id === s.source)!;
  const body: Record<string, ReactNode> = {
    proyeccion: (
      <>
        <p>Antes que nada, el proyecto se define en un sistema de coordenadas <strong>planas en metros</strong>: el terreno, las coberturas y la malla deben estar en el mismo sistema. En Colombia, la Resolución 370 de 2021 del IGAC estableció como proyección oficial el Origen-Nacional sobre MAGNA-SIRGAS (EPSG:9377).</p>
        <p>Por qué importa: el modelo calcula pendientes (∂η/∂x), áreas de celdas y longitudes de caras. Con grados de latitud y longitud esas cuentas no tienen sentido físico. Si una capa viene en otro sistema, RAS Mapper la reproyecta al del proyecto.</p>
      </>
    ),
    terreno: (
      <>
        <p>Se crea el <strong>terreno de RAS</strong> a partir de uno o varios rásteres (GeoTIFF): RAS Mapper los prepara para dibujarlos rápido, permite combinarlos con prioridad (por ejemplo, el cauce levantado encima del terreno general) y modificarlos (canales, terraplenes).</p>
        <p>
          Fuente elegida: <strong>{src.name}</strong> — píxel {src.pixel}, {src.surface.toLowerCase()}; precisión: {src.accuracy}. {src.note}
        </p>
        <p>El terreno no entra a las ecuaciones directamente: entra a través de las tablas que el preprocesador saca de él (paso 8). Por eso su detalle cuenta aunque las celdas sean grandes.</p>
      </>
    ),
    cobertura: (
      <>
        <p>Una capa de coberturas (polígonos o ráster de clases) se asocia a una tabla de n de Manning, y el preprocesador pasa esa rugosidad a las caras de la malla. En esta sala el n de cada metro de cara entra a su conducción K = Σ (1/nᵢ)·dᵢ^(5/3)·Δy.</p>
        <p>Valores elegidos ({N_LEVEL_NAMES[s.level].toLowerCase()} de Chow): {COVER_KEYS.filter((c) => c !== 'edificio').map((c) => `${COVERS[c].name.toLowerCase()} ${es(nSet(s.level)[c], 3)}`).join('; ')}. Las casas: {BUILDING_NAMES[s.buildings].toLowerCase()}.</p>
      </>
    ),
    malla: (
      <>
        <p>
          Se dibuja el perímetro del <strong>área de flujo 2D</strong>, se elige el tamaño de las celdas y se generan los puntos de cálculo: aquí {geomCells?.toLocaleString('es-CO') ?? (NX / s.c) * (NY / s.c)} celdas de {s.c} m. Las <strong>líneas de quiebre</strong> obligan a las caras a seguir el jarillón y la vía: si no, una corona angosta puede quedar dentro de una celda y el agua «la atraviesa» por las caras vecinas.
        </p>
        <p>HEC-RAS revisa la malla (celdas con demasiadas caras, puntos repetidos) y luego el preprocesador arma, para cada celda, la curva cota-volumen con sus píxeles, y para cada cara las tablas de área, perímetro mojado y rugosidad según la cota.</p>
      </>
    ),
    bordes: (
      <>
        <p>
          Se dibujan las <strong>líneas de condición de borde</strong> sobre el perímetro. Aguas arriba, un hidrograma de caudal: con la pendiente de energía ({es(s.egSlope * 100, 1)} %) HEC-RAS calcula la profundidad normal en la línea y reparte el caudal entre las celdas mojadas según su conducción (solo reciben agua las que quedan por debajo de ese nivel).
        </p>
        <p>Aguas abajo, la profundidad normal con la pendiente de fricción ({es(s.outSlope * 100, 2)} %): Q = K(η)·√S, una curva de gasto que deja salir el agua. Los bordes se ponen lejos de la zona que interesa, perpendiculares al flujo, y donde el agua no se devuelva.</p>
      </>
    ),
    flujo: (
      <>
        <p>
          En los datos de flujo no permanente se escribe el hidrograma de la línea de entrada (aquí la creciente de {s.T} años: pico de {es(quantile(AMS_FIT, s.T), 1)} m³/s a los {s.tp} min, sobre un caudal base de 4 m³/s) y la condición de la salida. Las <strong>condiciones iniciales</strong>: el área 2D puede empezar seca, con un nivel dado o con un tiempo de calentamiento; aquí, {s.warmup} min con el caudal base para mojar el cauce antes del evento.
        </p>
      </>
    ),
    plan: (
      <>
        <p>
          El <strong>plan</strong> junta la geometría y los datos de flujo, la ventana de simulación y los intervalos: de cálculo (Δt) y de salida (mapas cada minuto). En las opciones de cálculo se elige la ecuación (aquí {EQ_NAMES[s.eq].toLowerCase()}), el paso fijo o ajustado por Courant, el peso θ, la tolerancia del nivel y las iteraciones máximas.
        </p>
        <p className="m2-eq">C = V·Δt/Δx → con V ≈ 2,5 m/s, Δx = {s.c} m y Δt = {s.dt} s, C ≈ {es((2.5 * s.dt) / s.c, 1)}</p>
        <p>La guía de HEC-RAS pide C cerca de 1 en las zonas rápidas, hasta 3 con las ecuaciones completas y hasta 5 con la onda difusiva. La inercia local de esta sala es explícita: su paso lo fija la celeridad de las ondas.</p>
      </>
    ),
    correr: (
      <>
        <p>Al calcular, primero corre el <strong>preprocesador de geometría</strong> (las tablas de celdas y caras) y después el <strong>cálculo no permanente</strong>, paso a paso:</p>
        <ol className="m2-algo">
          <li>Leer el caudal de entrada del hidrograma y repartirlo en la línea de borde.</li>
          <li>Con los niveles del paso anterior, calcular para cada cara su área A(η) y su conducción K(η) en las tablas.</li>
          <li>{s.eq === 'difusiva' ? 'Armar el sistema de ecuaciones de todas las celdas (continuidad con los caudales de la onda difusiva, ponderados con θ) y resolverlo; repetir hasta que los niveles cambien menos que la tolerancia o se llegue al máximo de iteraciones.' : 'Calcular el caudal de cada cara con la inercia local (el del paso anterior, el gradiente del nivel y la fricción).'}</li>
          <li>Actualizar el volumen de cada celda con lo que entra y sale, y pasar del volumen al nivel con su curva cota-volumen.</li>
          <li>Guardar los máximos y, cada minuto, el mapa; avanzar Δt y repetir.</li>
        </ol>
        <p>Al final: el registro de pasos, iteraciones y el balance de volumen.</p>
      </>
    ),
    resultados: (
      <>
        <p>
          RAS Mapper dibuja los resultados al detalle del terreno: la <strong>profundidad</strong> en cada píxel es la cota del agua de su celda menos la cota del píxel, así que el mapa es más fino que la malla. También muestra la <strong>velocidad</strong>, la <strong>cota del agua</strong>, el <strong>tiempo de llegada</strong> (cuándo pasa de 10 cm) y combinaciones como la <strong>amenaza</strong> por profundidad y velocidad.
        </p>
        <p>Amenaza (AIDR, 2017): {HAZARD_TEXT.slice(1, 4).join('; ')}; …; {HAZARD_TEXT[6]}. Límites: H1 hasta 0,3 m y D·V ≤ 0,3; H2 hasta 0,5 m y D·V ≤ 0,6; H3 hasta 1,2 m y D·V ≤ 0,6; H4 hasta 2 m y D·V ≤ 1; H5 hasta 4 m, 4 m/s y D·V ≤ 4 (todas con V ≤ 2 m/s hasta H4).</p>
        {sum && <HazardBars areas={sum.townHazard} />}
      </>
    ),
    comparar: (
      <>
        <p>Ningún resultado de un solo modelo es «la» inundación. Se comparan corridas que cambian el terreno, el n, la malla, la ecuación o la creciente: lo que no cambia es sólido; lo que cambia mucho es incierto y se dice en el informe. Con observaciones (marcas de crecientes, niveles medidos) se calibra.</p>
        <CompareTable hist={hist} />
      </>
    ),
  };
  return (
    <div className="q3-exps m2-math">
      <h3>
        Paso {s.step + 1}. {st.name}
      </h3>
      <p className="q3-small">En HEC-RAS: {st.ras}.</p>
      {body[st.id]}
      {res && st.id === 'correr' && <p className="q3-small">Última corrida: {res.log[res.log.length - 1]}</p>}
    </div>
  );
}

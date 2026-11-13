// «Coberturas, n y calibración»: cada cobertura del suelo frena al agua distinto. Se eligen los valores de la tabla
// de Chow (mínimos, normales o máximos), un multiplicador de sensibilidad y cómo se representan las casas, y el
// modelo 2D corre con la creciente de 100 años. Después se calibra el n con marcas de agua de una creciente (a mano
// o con una búsqueda automática). La pregunta: ¿cuánto cambia la inundación con el n y cuál n reproduce las marcas?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { HazardBars, HydroChart, SER, XYChart, type XY } from './charts';
import { MODEL2D_TOOLS, ROOM } from './design';
import { DEFAULT_COVER, LIDAR_BURNED, N_LEVEL_NAMES, coverBase, coverRun, nSet, type CoverScene, type NLevel, type Summary } from './scene';
import { COVER_KEYS, COVERS, coverShares, terrainFor } from './terrain';
import { BUILDING_NAMES, modelSurface, type BuildingMode } from './solver';
import { runAsync, useModelRun, useReference } from './runs';
import { EVENT, HIDDEN_MULT, MARKS, MARK_NOISE, calibRun, fitStats, golden, marksFrom, type Fit } from './analysis';
import { PLACE, RunBadge, VIEWS_BASE, VexChoice, sg, useBatch, valleyState, vexNote, waterOf } from './common';
import { ValleyWorld, type PlanLabel } from './three/valleyWorld';

interface Ctx {
  s: CoverScene;
  sum: Summary | null;
  base: Summary | null;
  fit: Fit | null;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'm2-rugoso',
    title: 'Más rugoso, más alto',
    goal: 'Encuentra coberturas y un multiplicador con los que el agua en el puente sube 20 cm o más sobre la corrida con los valores normales.',
    hint: 'El n frena el agua; para pasar el mismo caudal, el agua tiene que ir más honda.',
    check: (c) => !!c.sum && !!c.base && c.sum.ok && c.sum.wseBridge - c.base.wseBridge >= 0.2,
    progress: (c) => (c.sum && c.base ? `el puente cambia ${sg(c.sum.wseBridge - c.base.wseBridge)}` : 'esperando el cálculo'),
  },
  {
    id: 'm2-liso',
    title: 'Un mapa optimista',
    goal: 'Encuentra valores de n con los que el área inundada del barrio queda en menos de la mitad de la que da la corrida normal.',
    hint: 'Con los valores más bajos de la tabla el agua corre más y se queda menos: por eso el n se calibra con crecientes observadas.',
    check: (c) => !!c.sum && !!c.base && c.sum.ok && c.base.townArea > 1000 && c.sum.townArea < 0.5 * c.base.townArea,
    progress: (c) => (c.sum && c.base ? `barrio ${es(c.sum.townArea, 0)} m² frente a ${es(c.base.townArea, 0)} m²` : 'esperando el cálculo'),
  },
  {
    id: 'm2-veloz',
    title: 'Más liso, más rápido',
    goal: 'Encuentra valores de n con los que la velocidad máxima en el valle pasa de 4 m/s.',
    hint: 'Bajar el n baja los niveles, pero el agua corre más rápido: el mapa de amenaza no siempre mejora.',
    check: (c) => !!c.sum && c.sum.ok && c.sum.vmax > 4,
    progress: (c) => (c.sum ? `velocidad máxima ${es(c.sum.vmax, 2)} m/s` : 'esperando el cálculo'),
  },
  {
    id: 'm2-calibra',
    title: 'Calibrar con las marcas',
    goal: 'En «Calibrar con marcas de agua», encuentra un multiplicador del n con el que el error medio cuadrático frente a las marcas baja de 5 cm y el sesgo queda a menos de 3 cm.',
    hint: 'Si el modelo queda bajo (sesgo negativo), el agua corre demasiado fácil: el n tiene que subir. La búsqueda automática prueba multiplicadores hasta encontrar el mínimo.',
    check: (c) => c.s.mode === 'calibrar' && !!c.fit && c.fit.rmse < 0.05 && Math.abs(c.fit.bias) < 0.03,
    progress: (c) => (c.s.mode !== 'calibrar' ? 'pasa al modo de calibración' : c.fit ? `RMSE ${es(c.fit.rmse * 100, 1)} cm, sesgo ${sg(c.fit.bias * 100, 1, 'cm')}` : 'esperando el cálculo'),
  },
];

export function CoberturaLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<CoverScene>(DEFAULT_COVER);
  const [vex, setVex] = useState(3);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const cal = s.mode === 'calibrar';
  const opts = useMemo(() => (cal ? calibRun(s.cal) : coverRun(s)), [s, cal]);
  const run = useModelRun(opts);
  const base = useReference(coverBase());
  const hidden = useModelRun(cal ? calibRun(HIDDEN_MULT) : null, true, 40);
  const obs = useMemo(() => (hidden.res ? marksFrom(hidden.res) : null), [hidden.res]);
  // el ajuste solo con la corrida del multiplicador elegido (mientras se recalcula, la anterior no cuenta)
  const current = run.resKey === run.key;
  const fit = useMemo(() => (cal && current && run.res && obs ? fitStats(run.res, obs) : null), [cal, current, run.res, obs]);
  const [auto, setAuto] = useState<{ busy: boolean; evals: { x: number; v: number }[]; best: number | null }>({ busy: false, evals: [], best: null });
  const fine = useMemo(() => terrainFor(LIDAR_BURNED).fine, []);
  const nGrid = useMemo(() => (s.view === 'n' ? modelSurface(LIDAR_BURNED, opts.rough).n : null), [s.view, opts.rough]);
  const sum = run.sum;
  const world = useRef<ValleyWorld | null>(null);
  const sync = useRef({ s, run, vex, nGrid, sum, fit, obs });
  sync.current = { s, run, vex, nGrid, sum, fit, obs };
  const toWorld = () => {
    const { s: x, run: rr, vex: v, nGrid: ng, sum: sm, fit: ft, obs: ob } = sync.current;
    const marks: PlanLabel[] =
      x.mode === 'calibrar' && ob
        ? MARKS.flatMap((m, k) =>
            ob[k] === null
              ? []
              : [{ id: m.id, text: `Marca ${k + 1}: ${es(ob[k] as number, 2)} m`, sub: ft && ft.resid[k] !== null ? `modelo ${es(ft.model[k], 2)} m (${sg((ft.resid[k] as number) * 100, 0, 'cm')})` : m.name, x: m.x, y: m.y, up: 3, kind: (ft && Math.abs((ft.resid[k] as number) ?? 0) < 0.06 ? 'ok' : 'sonda') as PlanLabel['kind'], prio: 7 }],
          )
        : [];
    world.current?.set(
      valleyState({
        vex: v,
        fine,
        colorBy: x.view,
        n: ng,
        objects: 'si',
        water: waterOf(rr),
        labels: x.mode === 'calibrar' ? marks : sm
          ? [
              PLACE.puente(`Puente: ${es(sm.wseBridge, 2)} m`, 'cota máxima del agua aguas arriba', 'dato'),
              PLACE.escuela('La escuela', sm.school > 0.05 ? `${es(sm.school, 2)} m de agua` : 'seca', sm.school > 0.05 ? 'alerta' : 'ok'),
              PLACE.barrio(`Barrio: ${es(sm.townArea, 0)} m² con agua`, 'más de 10 cm', sm.townArea > 400 ? 'alerta' : 'ok'),
            ]
          : [PLACE.puente(), PLACE.escuela(), PLACE.barrio()],
      }),
    );
  };
  useEffect(() => {
    toWorld();
  }, [run.res, run.status, run.live, vex, nGrid, s.view, s.mode, sum, fit, obs]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, sum, base, fit }), [s, sum, base, fit]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<CoverScene>) => setS((x) => ({ ...x, ...p }));
  const calibrate = async () => {
    if (!obs || auto.busy) return;
    setAuto({ busy: true, evals: [], best: null });
    const ev: { x: number; v: number }[] = [];
    const r = await golden(
      async (m) => fitStats(await runAsync(calibRun(Math.round(m * 1000) / 1000)), obs).rmse,
      0.7,
      1.6,
      0.02,
      (x, v) => {
        ev.push({ x, v });
        setAuto({ busy: true, evals: [...ev], best: null });
      },
    );
    const best = Math.round(r.x * 100) / 100;
    setAuto({ busy: false, evals: ev, best });
    set({ cal: best });
  };
  const tone: 'ok' | 'mid' | 'bad' = cal ? (!fit ? 'mid' : fit.rmse < 0.05 ? 'ok' : fit.rmse < 0.15 ? 'mid' : 'bad') : !sum ? 'mid' : sum.townArea < 400 ? 'ok' : sum.townArea < 15000 ? 'mid' : 'bad';
  const d = sum && base ? sum.wseBridge - base.wseBridge : NaN;
  const answer = cal ? (
    fit ? (
      <>
        Con el n normal ×{es(s.cal, 2)}, el modelo queda a <strong>{es(fit.rmse * 100, 1)} cm</strong> de las {fit.n} marcas en promedio (RMSE), con un sesgo de {sg(fit.bias * 100, 1, 'cm')}: {Math.abs(fit.bias) < 0.03 ? 'el n reproduce las marcas dentro de su error de medición.' : fit.bias < 0 ? 'el agua del modelo queda baja; el n tendría que subir.' : 'el agua del modelo queda alta; el n tendría que bajar.'}
      </>
    ) : (
      <>El modelo está corriendo la creciente observada ({es(EVENT.Qp, 0)} m³/s) para compararla con las marcas…</>
    )
  ) : sum ? (
    <>
      Con los n {N_LEVEL_NAMES[s.level].toLowerCase()} ×{es(s.mult, 1)} y las casas como «{BUILDING_NAMES[s.buildings].toLowerCase()}», la creciente de 100 años sube a <strong>{es(sum.wseBridge, 2)} m</strong> en el puente
      {Number.isFinite(d) && Math.abs(d) > 0.005 ? ` (${sg(d)} frente a los valores normales)` : ''} y deja {es(sum.townArea, 0)} m² del barrio con agua{base && Math.abs(sum.townArea - base.townArea) > 50 ? ` (normal: ${es(base.townArea, 0)} m²)` : ''}. La velocidad máxima llega a {es(sum.vmax, 1)} m/s.
    </>
  ) : (
    <>El modelo 2D está corriendo la creciente de 100 años con estos n…</>
  );
  const resid: XY[] = fit ? fit.resid.flatMap((r, k) => (r === null ? [] : [[k + 1, r * 100] as XY])) : [];

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label={`Maqueta 3D del valle coloreada por ${s.view === 'n' ? 'el n de Manning (más oscuro, más rugoso)' : 'cobertura del suelo (cauce, pasto, cultivos, rastrojo, bosque, vías y casas)'}, con el agua máxima de la creciente de 100 años coloreada por profundidad; ${vexNote(vex)}.`}
          viewNames={VIEWS_BASE}
          make={(st) => new ValleyWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>{sum && <HazardBars areas={sum.townHazard} />}</FlatStage>
      )}
      <Question q={cal ? '¿Qué n reproduce las marcas de la creciente?' : '¿Cuánto cambia la inundación con el n?'} answer={answer} tone={tone} />
      <RunBadge r={run} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      {cal ? (
        <LiveHud
          head={[`n normal ×${es(s.cal, 2)}`, fit ? `RMSE ${es(fit.rmse * 100, 1)} cm` : 'calculando', fit ? `sesgo ${sg(fit.bias * 100, 1, 'cm')}` : '']}
          chart={
            auto.evals.length ? (
              <XYChart series={[{ name: 'corridas de la búsqueda', pts: auto.evals.map((e) => [e.x, e.v * 100] as XY), color: SER.a, dots: true }]} xLabel="multiplicador del n" yLabel="RMSE (cm)" xFmt={(v) => es(v, 2)} label="Error medio cuadrático de cada corrida de la búsqueda de sección dorada según el multiplicador del n." />
            ) : resid.length ? (
              <XYChart series={[{ name: 'modelo − marca', pts: resid, color: SER.b, dots: true }]} xLabel="marca" yLabel="residuo (cm)" hlines={[{ y: 0, text: 'ajuste perfecto' }]} xTicks={resid.map(([k]) => ({ v: k, t: String(k) }))} label="Residuo de cada marca de agua: cota del modelo menos cota observada, en centímetros." />
            ) : undefined
          }
          traces={[
            { key: 'r', label: 'Error medio cuadrático (RMSE)', unit: 'cm', value: fit ? fit.rmse * 100 : NaN, digits: 1 },
            { key: 'b', label: 'Sesgo (modelo − marcas)', unit: 'cm', value: fit ? fit.bias * 100 : NaN, digits: 1 },
          ]}
        />
      ) : (
        <LiveHud
          head={[`n ${N_LEVEL_NAMES[s.level].toLowerCase()} ×${es(s.mult, 1)}`, sum ? `puente ${es(sum.wseBridge, 2)} m` : 'calculando', base ? `normal ${es(base.wseBridge, 2)} m` : '']}
          chart={run.res ? <HydroChart t={run.res.series.t} qin={run.res.series.qin} qBridge={run.res.series.qBridge} qout={run.res.series.qout} /> : undefined}
          traces={[
            { key: 'w', label: 'Agua en el puente frente a los n normales', unit: 'm', value: Number.isFinite(d) ? d : NaN, digits: 2 },
            { key: 'a', label: 'Barrio con agua', unit: 'm²', value: sum?.townArea ?? NaN, digits: 0, ref: base ? { value: base.townArea, label: 'normal' } : undefined },
            { key: 'v', label: 'Velocidad máxima', unit: 'm/s', value: sum?.vmax ?? NaN, digits: 2 },
          ]}
        />
      )}
      <DockChoice
        label="Qué hacer"
        value={s.mode}
        options={[
          { value: 'sensibilidad', label: 'Sensibilidad al n' },
          { value: 'calibrar', label: 'Calibrar con marcas de agua' },
        ]}
        onChange={(v) => set({ mode: v as CoverScene['mode'] })}
      />
      {cal ? (
        <>
          <DockRange label="Multiplicador del n normal" value={s.cal} min={0.7} max={1.6} step={0.02} show={`×${es(s.cal, 2)}`} onChange={(v) => set({ cal: Math.round(v * 100) / 100 })} />
          <div className="hc-flood is-inline">
            {auto.busy ? (
              <span className="hc-flood-q" aria-live="polite">
                Buscando: corrida {auto.evals.length + 1}
                {auto.evals.length ? ` (×${es(auto.evals[auto.evals.length - 1].x, 3)}: ${es(auto.evals[auto.evals.length - 1].v * 100, 1)} cm)` : ''}…
              </span>
            ) : (
              <button type="button" onClick={calibrate} disabled={!obs}>
                {auto.best ? `Calibrado: ×${es(auto.best, 2)} · buscar de nuevo` : 'Calibrar automáticamente'}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <DockChoice<NLevel> label="Valores de la tabla de Chow" value={s.level} options={(Object.keys(N_LEVEL_NAMES) as NLevel[]).map((k) => ({ value: k, label: N_LEVEL_NAMES[k] }))} onChange={(v) => set({ level: v })} />
          <DockRange label="Multiplicador de todos los n" value={s.mult} min={0.6} max={1.6} step={0.1} show={`×${es(s.mult, 1)}`} onChange={(v) => set({ mult: v })} />
          <DockChoice<BuildingMode> label="Las casas" value={s.buildings} options={(Object.keys(BUILDING_NAMES) as BuildingMode[]).map((k) => ({ value: k, label: BUILDING_NAMES[k] }))} onChange={(v) => set({ buildings: v })} />
          {s.buildings === 'n' && <DockRange label="n de las casas" value={s.nB} min={0.1} max={1} step={0.05} show={es(s.nB, 2)} onChange={(v) => set({ nB: v })} />}
        </>
      )}
      <DockChoice
        label="Colorear el terreno por"
        value={s.view}
        options={[
          { value: 'cobertura', label: 'Cobertura' },
          { value: 'n', label: 'n de Manning' },
        ]}
        onChange={(v) => set({ view: v as CoverScene['view'] })}
      />
      <VexChoice value={vex} onChange={setVex} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <div className="m2-legend">
          {COVER_KEYS.map((c) => (
            <span key={c}>
              <i style={{ background: COVERS[c].color }} />
              {COVERS[c].name}
            </span>
          ))}
        </div>
        <h3>De la cobertura al n</h3>
        <p>
          En HEC-RAS se carga una capa de <strong>coberturas del suelo</strong> (polígonos o un ráster de clases) y a cada clase se le asigna un <strong>n de Manning</strong>; el preprocesador pasa esa rugosidad a las caras de la malla. Se pueden dibujar regiones de calibración para ajustar el n por zonas. En esta sala cada metro de cara usa el n de la cobertura que cruza: una cara que pasa por el cauce y por el bosque suma la conducción de cada tramo con su propio n.
        </p>
        <h3>Qué hace el n en las ecuaciones</h3>
        <p>
          En la ecuación de cantidad de movimiento, la fricción con el fondo es g·n²·|V|·V/R^(4/3): con un n más alto, el agua necesita más pendiente o más profundidad para pasar el mismo caudal. En la conducción de una cara, K = Σ(1/n)·d^(5/3)·Δy, cada franja aporta según su propio n y su propia profundidad.
        </p>
        <h3>Las casas</h3>
        <p>
          No hay un n «de casa» en las tablas. Las casas se representan levantándolas en el terreno (bloques: el agua las rodea y no las llena), con un n muy alto (un valor de calibración que representa el estorbo) o no se representan. Cada opción cambia cuánta agua guarda el barrio y por dónde corre.
        </p>
        <h3>Calibrar con marcas de agua</h3>
        <p>
          Después de una creciente se levantan <strong>marcas de agua</strong>: la línea de barro en un muro, la basura colgada de un árbol, la huella en un estribo. Con su cota y el caudal de la creciente, el modelo se corre con varios n hasta que sus niveles máximos las reproducen: se mide el <strong>error medio cuadrático</strong> (RMSE) y el <strong>sesgo</strong> (si el modelo queda alto o bajo en promedio). La búsqueda automática usa el método de sección dorada: cada corrida descarta un tramo de multiplicadores hasta acorralar el mínimo.
        </p>
        <p>
          En esta sala la creciente «observada» (pico de {es(EVENT.Qp, 0)} m³/s) y sus {MARKS.length} marcas son inventadas: salen de una corrida escondida con otro n más un error de medición de ±{es(MARK_NOISE * 100, 0)} cm. Por eso hay una respuesta, pero nunca exacta. En un estudio real, el n calibrado se verifica con otra creciente distinta de la que se usó para calibrar.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia los valores de n, el multiplicador y las casas, o calibra con las marcas de agua: el modelo 2D corre solo con cada cambio (celdas de 20 m con subgrid)." />,
    experimentos: <CoverExperiments s={s} />,
    diseno: <DesignTab part="cobertura" set={MODEL2D_TOOLS.cobertura} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>Coberturas y n de Manning (Chow, 1959)</caption>
          <thead>
            <tr>
              <th>Cobertura</th>
              <th>Descripción</th>
              <th>Mín.</th>
              <th>Normal</th>
              <th>Máx.</th>
              <th>Área</th>
            </tr>
          </thead>
          <tbody>
            {COVER_KEYS.map((c) => (
              <tr key={c}>
                <td>{COVERS[c].name}</td>
                <td>{COVERS[c].desc}</td>
                <td>{es(COVERS[c].n[0], 3)}</td>
                <td>{es(COVERS[c].n[1], 3)}</td>
                <td>{es(COVERS[c].n[2], 3)}</td>
                <td>{es(coverShares()[c] * 100, 1)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="q3-table">
          <caption>La corrida</caption>
          <tbody>
            <Row name="Terreno" value="LiDAR de 1 m con el cauce levantado" />
            <Row name="Malla" value="celdas de 20 m con subgrid y líneas de quiebre" />
            <Row name="Ecuaciones" value="inercia local, paso ajustado (Courant 0,7)" />
            <Row name="Creciente" value={cal ? `observada (inventada): ${es(EVENT.Qp, 0)} m³/s, pico a los ${EVENT.tp} min` : `100 años: ${es(opts.hydro.Qp, 1)} m³/s, pico a los 30 min`} />
            {cal && <Row name="Malla" value="20 m refinada a 10 m en el cauce y el jarillón" />}
          </tbody>
        </table>
        <table className="q3-table">
          <caption>Marcas de agua de la creciente del ejercicio</caption>
          <thead>
            <tr>
              <th>Marca</th>
              <th>Dónde</th>
              <th>Cota observada</th>
              <th>Modelo (×{es(s.cal, 2)})</th>
              <th>Residuo</th>
            </tr>
          </thead>
          <tbody>
            {MARKS.map((m, k) => (
              <tr key={m.id}>
                <td>{k + 1}</td>
                <td>{m.name}</td>
                <td>{obs ? (obs[k] === null ? 'no quedó marca' : `${es(obs[k] as number, 2)} m`) : cal ? 'calculando' : 'pasa al modo de calibración'}</td>
                <td>{fit ? `${es(fit.model[k], 2)} m` : '—'}</td>
                <td>{fit && fit.resid[k] !== null ? sg((fit.resid[k] as number) * 100, 1, 'cm') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Cómo se pasa de un mapa de coberturas a la rugosidad del modelo; los rangos de la tabla de Chow; la sensibilidad de niveles, áreas y velocidades al n; la representación de las casas; la calibración del n con marcas de agua (RMSE, sesgo y búsqueda de sección dorada); por qué un modelo sin calibrar es un escenario y no un pronóstico.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>n de cada cobertura con los rangos de Chow (1959, tabla 5-6): corriente de montaña con gravas y cantos, pastos cortos, cultivos en hileras, matorral claro, bosque denso con el agua bajo las ramas y asfalto. El n de las casas es un valor de calibración. Modelo 2D de esta sala (inercia local con subgrid), conducción de las caras por franjas de 1 m. Calibración: un solo multiplicador para todas las coberturas, ajustado por sección dorada sobre el RMSE de las marcas. Pruebas M4 a M10 y M23.</p>
        <h3>Límites</h3>
        <p>Valle, coberturas, creciente observada y marcas ilustrativos (las marcas salen de una corrida escondida). El n real cambia con la profundidad (la vegetación se dobla o queda sumergida) y con la época; aquí es fijo por cobertura. Calibrar un solo multiplicador con una sola creciente puede compensar errores de otra fuente (terreno, caudal): por eso se valida con otra creciente. No es un estudio de amenaza ni un mapa oficial.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

const VARIANTS: { name: string; s: Partial<CoverScene> }[] = [
  { name: 'Mínimos de la tabla', s: { level: 'min' } },
  { name: 'Normales', s: {} },
  { name: 'Máximos de la tabla', s: { level: 'max' } },
  { name: 'Normales ×0,7', s: { mult: 0.7 } },
  { name: 'Normales ×1,3', s: { mult: 1.3 } },
  { name: 'Casas como bloques', s: { buildings: 'bloque' } },
  { name: 'Casas sin representar', s: { buildings: 'nada' } },
];

const VARIANT_RUNS = VARIANTS.map((v) => coverRun({ ...DEFAULT_COVER, ...v.s }));

function CoverExperiments({ s }: { s: CoverScene }) {
  const { rows, busy, done, go } = useBatch(VARIANT_RUNS);
  const base = rows[1];
  return (
    <div className="q3-exps">
      <h3>Sensibilidad al n (creciente de 100 años)</h3>
      <div className="hc-flood is-inline">
        {busy ? (
          <span className="hc-flood-q">Corriendo las variantes… {done} de {VARIANTS.length}</span>
        ) : (
          <button type="button" onClick={go}>
            Correr las {VARIANTS.length} variantes
          </button>
        )}
      </div>
      <table className="q3-table">
        <thead>
          <tr>
            <th>Variante</th>
            <th>Agua en el puente</th>
            <th>Barrio con agua</th>
            <th>La escuela</th>
            <th>Velocidad máxima</th>
          </tr>
        </thead>
        <tbody>
          {VARIANTS.map((v, k) => {
            const r = rows[k];
            return (
              <tr key={v.name}>
                <td>{v.name}</td>
                <td>{r ? `${es(r.wseBridge, 2)} m${base && k !== 1 ? ` (${sg(r.wseBridge - base.wseBridge)})` : ''}` : '—'}</td>
                <td>{r ? `${es(r.townArea, 0)} m²` : '—'}</td>
                <td>{r ? `${es(r.school, 2)} m` : '—'}</td>
                <td>{r ? `${es(r.vmax, 2)} m/s` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="q3-small">Tu combinación actual: n {N_LEVEL_NAMES[s.level].toLowerCase()} ×{es(s.mult, 1)}, casas «{BUILDING_NAMES[s.buildings].toLowerCase()}». El rango de la tabla ya mueve el nivel decenas de centímetros y el área inundada en miles de metros cuadrados.</p>
      <h3>n de cada cobertura con tus valores</h3>
      <table className="q3-table">
        <tbody>
          {COVER_KEYS.map((c) => (
            <Row key={c} name={COVERS[c].name} value={es(nSet(s.level, s.nB)[c] * (c === 'edificio' && s.buildings !== 'n' ? NaN : s.mult), 3)} note={c === 'edificio' && s.buildings !== 'n' ? 'las casas no usan n con esta opción' : COVERS[c].desc} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

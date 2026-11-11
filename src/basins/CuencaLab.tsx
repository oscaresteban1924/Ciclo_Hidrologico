// «La cuenca»: una ladera andina ilustrativa con su quebrada. El estudiante cambia el área, la pendiente, cuánto está
// urbanizado, el suelo y el período de retorno; lanza el aguacero de diseño y ve la lluvia, los pulsos que bajan por los
// cauces en el tiempo de concentración y el hidrograma que mide la estación de la salida. La pregunta: ¿cuánta agua llega
// a la salida, y cuándo?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { StormChart } from './charts';
import { BasinMap } from './diagrams';
import { BASIN_TOOLS, IDF_NOTE, ROOM } from './design';
import { COVERS, IDF_ILUS, type BasinResult, type Soil } from './hydrology';
import { DEFAULT_SCENE, sceneModel, type SceneBasin } from './scene';
import { StormButton, useStorm, type StormRun } from './storm';
import { BasinWorld } from './three/basinWorld';

interface Snap {
  b: SceneBasin;
  r: BasinResult;
}

interface Ctx {
  b: SceneBasin;
  r: BasinResult;
  runs: StormRun[];
  saved: Snap[];
}

const balanceErr = (x: StormRun) => Math.abs(x.measured - x.theory) / Math.max(1e-9, x.theory);

/** Pares de escenarios guardados con la misma cuenca y el mismo aguacero, uno poco y otro muy urbanizado. */
function urbanPairs(saved: Snap[]): { lo: Snap; hi: Snap; ratio: number }[] {
  const out: { lo: Snap; hi: Snap; ratio: number }[] = [];
  for (const a of saved)
    for (const c of saved) {
      if (a.b.u > 0.1 + 1e-9 || c.b.u < 0.5 - 1e-9) continue;
      if (a.b.A !== c.b.A || a.b.S !== c.b.S || a.b.soil !== c.b.soil || a.b.T !== c.b.T) continue;
      out.push({ lo: a, hi: c, ratio: c.r.Qpeak / Math.max(1e-9, a.r.Qpeak) });
    }
  return out;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'cu-rapida',
    title: 'Una cuenca que responde rápido',
    goal: 'Arma una cuenca cuyo tiempo de concentración sea menor de 15 minutos.',
    hint: 'El agua llega antes en una cuenca pequeña (cauce corto) y empinada. Mira el promedio de las tres fórmulas en Datos.',
    check: (c) => c.r.tc.used < 15,
    progress: (c) => `Tiempo de concentración: ${es(c.r.tc.used, 1)} min`,
  },
  {
    id: 'cu-balance',
    title: 'El balance de masa',
    goal: 'Lanza un aguacero completo: el volumen que pasó por la estación debe quedar a menos de 2 % de la lluvia que escurre por toda el área.',
    hint: 'Deja correr el aguacero hasta el final, sin cambiar los datos. La estación suma el caudal de cada instante por su duración.',
    check: (c) => c.runs.some((x) => balanceErr(x) < 0.02),
    progress: (c) => (c.runs.length ? `Último aguacero: ${es(balanceErr(c.runs[c.runs.length - 1]) * 100, 2)} % de diferencia` : 'Lanza el aguacero con el botón del pie de la escena.'),
  },
  {
    id: 'cu-urbano',
    title: 'Urbanizar duplica el pico',
    goal: 'Guarda dos escenarios con la misma área, pendiente, suelo y período de retorno: uno con 10 % urbanizado o menos y otro con 50 % o más. El pico del segundo debe ser al menos el doble.',
    hint: 'Usa «Guardar este escenario» en Experimentos; luego cambia solo lo urbanizado y guarda otra vez.',
    check: (c) => urbanPairs(c.saved).some((p) => p.ratio >= 2),
    progress: (c) => {
      const p = urbanPairs(c.saved);
      return p.length ? `El pico creció ${es(Math.max(...p.map((x) => x.ratio)), 2)} veces` : `${c.saved.length} escenarios guardados`;
    },
  },
  {
    id: 'cu-80ha',
    title: 'Más allá del método racional',
    goal: 'Lanza un aguacero completo en una cuenca de 80 ha o más: el RAS ya no admite el método racional y el caudal sale del hidrograma.',
    hint: 'Sube el área con el control del pie de la escena y lanza el aguacero.',
    check: (c) => c.runs.some((x) => x.r.inp.A >= 80),
  },
];

const T_OPTS = [2, 5, 10, 25, 50, 100];
const SOIL_NAME: Record<Soil, string> = { B: 'B (franco)', C: 'C (arcilloso)', D: 'D (muy arcilloso)' };

export function CuencaLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [b, setB] = useState<SceneBasin>(DEFAULT_SCENE);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [saved, setSaved] = useState<Snap[]>([]);
  // la duración del aguacero de diseño: al menos 60 min y al menos dos veces el tiempo de concentración
  const r = useMemo(() => {
    const first = sceneModel({ ...b, dur: 60 });
    const dur = Math.max(60, Math.ceil((2 * first.tc.used) / 10) * 10);
    return dur === 60 ? first : sceneModel({ ...b, dur });
  }, [b]);
  const world = useRef<BasinWorld | null>(null);
  const sync = useRef(r);
  sync.current = r;
  useEffect(() => world.current?.set(sync.current), [r]);
  const storm = useStorm(r, gl, world);
  const ctx = useMemo<Ctx>(() => ({ b, r, runs: storm.runs, saved }), [b, r, storm.runs, saved]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<SceneBasin>) => setB((s) => ({ ...s, ...p }));
  const total = r.hydro.length * r.dt;
  const k = storm.tNow === null ? -1 : Math.floor(storm.tNow / r.dt);
  const qNow = k >= 0 && k < r.hydro.length ? r.hydro[k] : 0;
  const iNow = k >= 0 && k < r.rain.length ? (r.rain[k] / r.dt) * 60 : 0;
  const frac = r.Q / Math.max(1e-9, r.P);
  const tone: 'ok' | 'mid' | 'bad' = frac < 0.25 ? 'ok' : frac < 0.5 ? 'mid' : 'bad';
  const answer = (
    <>
      Con el aguacero de {b.T} años ({es(r.P, 0)} mm en {es(r.inp.dur, 0)} min), el agua de la parte más lejana tarda unos {es(r.tc.used, 0)} min en llegar a la salida. Escurren {es(r.Q, 1)} mm ({es(frac * 100, 0)} %); el resto se infiltra. El hidrograma llega a <strong>{es(r.Qpeak, 2)} m³/s</strong> hacia el minuto {es(r.tPeak, 0)}.{' '}
      {r.rationalOk ? `El método racional da ${es(r.Qrat, 2)} m³/s: suele dar más, porque supone que toda la cuenca aporta con el mismo coeficiente C durante el tiempo de concentración.` : 'Con 80 ha o más, el RAS no admite el método racional: el caudal sale del hidrograma.'}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Cuenca de ladera ilustrativa en 3D: una quebrada principal con tres afluentes que bajan hasta una estación de aforo en la salida. Las coberturas van del bosque en la cabecera al barrio y las vías cerca de la salida. Al lanzar el aguacero cae la lluvia y unos pulsos de agua bajan por los cauces en el tiempo de concentración."
          viewNames={[
            { id: 'general', label: 'La cuenca' },
            { id: 'salida', label: 'La salida' },
            { id: 'arriba', label: 'Desde arriba' },
          ]}
          make={(st) => new BasinWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <BasinMap r={r} tNow={storm.tNow} />
        </FlatStage>
      )}
      <Question q="¿Cuánta agua llega a la salida de la cuenca, y cuándo?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`tc = ${es(r.tc.used, 0)} min`, `pico ${es(r.Qpeak, 2)} m³/s`, `escurre ${es(frac * 100, 0)} %`]}
        chart={<StormChart dt={r.dt} rain={r.rain} eff={r.eff} series={[{ name: 'caudal', q: r.hydro, color: '#1f78b4' }]} tNow={storm.tNow} peakLine={r.rationalOk ? { q: r.Qrat, label: `racional ${es(r.Qrat, 1)}` } : undefined} />}
        traces={[
          { key: 'q', label: 'Caudal en la salida', unit: 'm³/s', value: qNow, digits: 2, ref: { value: r.Qpeak, label: 'pico calculado' } },
          { key: 'i', label: 'Lluvia', unit: 'mm/h', value: iNow, digits: 0 },
        ]}
      />
      <StormButton playing={storm.playing} tNow={storm.tNow} total={total} start={storm.start} stop={storm.stop} />
      <DockRange label="Área de la cuenca" value={b.A} min={10} max={300} step={5} show={`${es(b.A, 0)} ha`} onChange={(v) => set({ A: v })} />
      <DockRange label="Pendiente del cauce" value={Math.round(b.S * 100)} min={2} max={30} step={1} show={`${es(b.S * 100, 0)} %`} onChange={(v) => set({ S: v / 100 })} />
      <DockRange label="Urbanizado (techos y vías)" value={Math.round(b.u * 100)} min={0} max={90} step={5} show={`${es(b.u * 100, 0)} %`} onChange={(v) => set({ u: v / 100 })} />
      <DockChoice<Soil> label="Suelo" value={b.soil} options={(['B', 'C', 'D'] as Soil[]).map((s) => ({ value: s, label: s }))} onChange={(v) => set({ soil: v })} />
      <DockChoice<string> label="Período de retorno (años)" value={String(b.T)} options={T_OPTS.map((t) => ({ value: String(t), label: String(t) }))} onChange={(v) => set({ T: Number(v) })} />
    </>
  );

  const pairs = urbanPairs(saved);
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <BasinMap r={r} tNow={storm.tNow} />
        <h3>Una cuenca recoge la lluvia y la entrega por un solo punto</h3>
        <p>
          La <strong>cuenca</strong> es todo el terreno cuya agua termina en la misma salida. Cuando llueve, una parte se infiltra y el resto corre por la superficie hacia los cauces. El <strong>tiempo de concentración</strong> es lo que tarda el agua del punto más lejano en llegar a la salida: desde ese momento toda la cuenca aporta a la vez.
        </p>
        <h3>Del aguacero al hidrograma</h3>
        <p>
          La lluvia de diseño se arma con la curva intensidad-duración-frecuencia (IDF) por bloques alternos: el bloque más intenso en el centro. El <strong>número de curva</strong> del SCS dice cuánto de cada bloque escurre, y el <strong>hidrograma unitario</strong> reparte esa lluvia efectiva en el tiempo: el resultado es el caudal en la salida, minuto a minuto.
        </p>
        <h3>Techos y vías</h3>
        <p>Lo urbanizado casi no deja infiltrar y acelera el agua: la creciente sube más y llega antes. Por eso el RAS pide revisar el drenaje cuando cambia el uso del suelo.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la cuenca, lanza el aguacero y mide en la salida. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>El balance de masa en la estación</h3>
        <p className="q3-small">Mientras corre el aguacero, la estación suma el caudal de cada instante por su duración. Al final, ese volumen debe ser igual a la lluvia que escurre (en metros) por el área: el agua no se crea ni se pierde.</p>
        {storm.runs.length ? (
          <table className="q3-table">
            <caption>Aguaceros completos</caption>
            <thead>
              <tr>
                <th>T</th>
                <th>Área</th>
                <th>Medido</th>
                <th>Escorrentía × área</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {storm.runs.slice(-6).map((x, i) => (
                <tr key={i}>
                  <td>{x.r.inp.T} a</td>
                  <td>{es(x.r.inp.A, 0)} ha</td>
                  <td>{es(x.measured, 0)} m³</td>
                  <td>{es(x.theory, 0)} m³</td>
                  <td>{es(balanceErr(x) * 100, 2)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="q3-small">Todavía no hay aguaceros completos: usa «Lanzar el aguacero» y déjalo terminar.</p>
        )}
        <h3>Antes y después</h3>
        <p className="q3-small">Guarda el escenario, cambia un dato y guarda otra vez para comparar.</p>
        <div className="hc-read">
          <button type="button" className="btn btn-primary" onClick={() => setSaved((x) => [...x, { b, r }].slice(-8))}>
            Guardar este escenario
          </button>
          {saved.length > 0 && (
            <button type="button" className="btn-ghost" onClick={() => setSaved([])}>
              Borrar los escenarios
            </button>
          )}
        </div>
        {saved.length > 0 && (
          <table className="q3-table">
            <caption>Escenarios guardados</caption>
            <thead>
              <tr>
                <th>Área</th>
                <th>Pend.</th>
                <th>Urb.</th>
                <th>Suelo</th>
                <th>T</th>
                <th>tc</th>
                <th>Pico</th>
              </tr>
            </thead>
            <tbody>
              {saved.map((s, i) => (
                <tr key={i}>
                  <td>{es(s.b.A, 0)} ha</td>
                  <td>{es(s.b.S * 100, 0)} %</td>
                  <td>{es(s.b.u * 100, 0)} %</td>
                  <td>{s.b.soil}</td>
                  <td>{s.b.T} a</td>
                  <td>{es(s.r.tc.used, 0)} min</td>
                  <td>{es(s.r.Qpeak, 2)} m³/s</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pairs.length > 0 && <p className="q3-progress is-ok">Con la misma cuenca y el mismo aguacero, urbanizar multiplicó el pico por {es(Math.max(...pairs.map((p) => p.ratio)), 2)}.</p>}
      </div>
    ),
    diseno: <DesignTab part="cuenca" set={BASIN_TOOLS.cuenca} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La cuenca de la escena (ilustrativa)</caption>
          <tbody>
            <Row name="Área" value={`${es(r.inp.A, 0)} ha (${es(r.inp.A / 100, 2)} km²)`} />
            <Row name="Largo del cauce principal" value={`${es(r.inp.L, 0)} m`} note="L ≈ 1,8·√A, cuenca alargada" />
            <Row name="Pendiente media del cauce" value={`${es(r.inp.S * 100, 1)} %`} />
            <Row name="Coberturas" value={(Object.keys(COVERS) as (keyof typeof COVERS)[]).filter((c) => r.inp.mix[c] > 0.001).map((c) => `${COVERS[c].name.toLowerCase()} ${es(r.inp.mix[c] * 100, 0)} %`).join(', ')} />
            <Row name="Suelo" value={SOIL_NAME[r.inp.soil]} />
            <Row name="Tiempo de concentración" value={`${es(r.tc.used, 1)} min`} note={`Kirpich ${es(r.tc.kirpich, 1)}, Témez ${es(r.tc.temez, 1)}, SCS ${es(r.tc.scs, 1)}; promedio con mínimo de 10`} />
            <Row name="Aguacero de diseño" value={`T = ${r.inp.T} años, ${es(r.inp.dur, 0)} min, ${es(r.P, 1)} mm`} note={`bloques alternos de ${r.dt} min`} />
            <Row name="Escorrentía" value={`${es(r.Q, 1)} mm (${es(frac * 100, 1)} %)`} note={`CN equivalente ${es(r.CNeq, 1)}`} />
            <Row name="Coeficiente de escorrentía C" value={es(r.C, 3)} note="ponderado, Chow et al. (1988)" />
            <Row name="Intensidad con duración tc" value={`${es(r.iTc, 1)} mm/h`} />
            <Row name="Caudal racional" value={r.rationalOk ? `${es(r.Qrat, 2)} m³/s` : 'no aplica'} note={r.rationalOk ? '' : 'RAS: solo con menos de 80 ha'} />
            <Row name="Pico del hidrograma (SCS)" value={`${es(r.Qpeak, 2)} m³/s`} note={`hacia el minuto ${es(r.tPeak, 0)}`} />
            <Row name="Volumen de escorrentía" value={`${es(r.vol, 0)} m³`} />
            <Row name="Hidrograma unitario" value={`tp = ${es(r.uh.tp * 60, 1)} min, qp = ${es(r.uh.qp, 3)} m³/s por mm`} note={`base ${es(r.uh.tb * 60, 0)} min`} />
          </tbody>
        </table>
        <p className="q3-small">{IDF_NOTE}</p>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Qué es una cuenca y su salida; el tiempo de concentración y por qué las fórmulas empíricas no coinciden; cómo la cobertura y el suelo deciden cuánto escurre; el hidrograma como respuesta de la cuenca a un aguacero; el efecto de urbanizar (más volumen y un pico más alto y temprano); el balance de masa; el límite de 80 ha del método racional en el RAS.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Curva IDF ilustrativa de la forma i = K·T^m/(t + c)^n con K = {IDF_ILUS.K}, m = {es(IDF_ILUS.m, 2)}, c = {IDF_ILUS.c} min y n = {es(IDF_ILUS.n, 2)}; aguacero por bloques alternos (Chow, Maidment y Mays, 1988, sec. 14.4). Tiempo de concentración: Kirpich (1940), Témez (1978) y el retardo del SCS (NRCS, National Engineering Handbook, parte 630, cap. 15), promediados con un mínimo de 10 min. Escorrentía por el número de curva con Ia = 0,2·S (NRCS, TR-55, 1986), con la lluvia acumulada de cada cobertura. Hidrograma unitario triangular del SCS (tp = Δt/2 + 0,6·tc, qp = 0,208·A/tp, tb = 2,67·tp) con volumen exacto, y convolución. Coeficientes C de la tabla 15.1.1 de Chow et al. (1988). Método racional Q = C·i·A/360. {ROOM}: pruebas C1 a C12.
        </p>
        <h3>Límites</h3>
        <p>La cuenca, el terreno y la curva IDF son ilustrativos. La lluvia cae pareja sobre toda la cuenca; el hidrograma es solo escorrentía directa (sin caudal base) y no se transita por los cauces; el número de curva se aplica a cada cobertura con su suelo y condición de humedad normal. La animación comprime el tiempo: unos 24 s para todo el aguacero.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

// «Aforar un río»: con un molinete colgado de una tarabita se mide la profundidad y la velocidad en varias
// verticales y se suma el caudal por el método de la sección media. Con varios aforos se ajusta la curva de gasto,
// que convierte la lectura de la regla en caudal. La pregunta: ¿cuánta agua lleva el río?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { RatingChart, SectionChart } from './charts';
import { MEASURE_TOOLS, ROOM } from './design';
import { BANK, GAUGINGS, METHODS, N_MAIN, N_PLAIN, SLOPE, gauge, trueFlow, type Method } from './measure';
import { DEFAULT_RIVER, H_MAX_GAUGED, riverScene, type RiverScene } from './scene';
import { RiverGaugeWorld } from './three/measureWorlds';

type R = ReturnType<typeof riverScene>;
interface Ctx {
  s: RiverScene;
  r: R;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'me-calidad',
    title: 'Un aforo de calidad',
    goal: 'Haz un aforo con 20 verticales o más, sin que ninguna lleve más del 10 % del caudal, y con 2 % de error o menos.',
    hint: 'Así lo recomienda la norma ISO 748: muchas verticales y ninguna demasiado importante.',
    check: (c) => c.s.N >= 20 && c.r.g.maxShare <= 0.1 && Math.abs(c.r.err) <= 0.02,
    progress: (c) => `${c.s.N} verticales, la mayor lleva ${es(c.r.g.maxShare * 100, 1)} %, error ${es(c.r.err * 100, 1)} %`,
  },
  {
    id: 'me-pocas',
    title: 'Pocas verticales',
    goal: 'Con 6 verticales o menos, encuentra un nivel del río con el que el aforo se equivoca 5 % o más.',
    hint: 'El fondo del río tiene pozos y barras: con pocas verticales, unas caen en lo hondo y otras en lo bajo.',
    check: (c) => c.s.N <= 6 && Math.abs(c.r.err) >= 0.05,
    progress: (c) => `${c.s.N} verticales con ${es(c.s.h, 2)} m: error ${es(c.r.err * 100, 1)} %`,
  },
  {
    id: 'me-h0',
    title: 'Curva afinada',
    goal: 'Elige a mano el nivel de caudal cero (h0) con el que la curva de gasto deja un error típico de 6 % o menos.',
    hint: 'El caudal se hace cero un poco por encima del cero de la regla: donde el agua deja de correr en lo más hondo.',
    check: (c) => c.r.fit.ok && c.r.fit.se <= 0.06,
    progress: (c) => (c.r.fit.ok ? `h0 = ${es(c.s.h0, 2)} m, error típico ${es(c.r.fit.se * 100, 1)} %` : 'con ese h0 quedan aforos por debajo del cero'),
  },
  {
    id: 'me-desborde',
    title: 'Fuera de la curva',
    goal: 'Sube el río por encima del aforo más alto hasta un nivel donde la mejor curva se equivoca 10 % o más.',
    hint: 'La curva se ajustó con el río dentro de su cauce. Cuando se sale, el agua ocupa las llanuras y la ley cambia.',
    check: (c) => c.s.h > H_MAX_GAUGED && Math.abs(c.r.errBest) >= 0.1,
    progress: (c) => `${es(c.s.h, 2)} m: la curva dice ${es(c.r.Qb, 1)} y pasan ${es(c.r.true.Q, 1)} m³/s (${es(c.r.errBest * 100, 0)} %)`,
  },
];

export function AforoLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<RiverScene>(DEFAULT_RIVER);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [active, setActive] = useState(-1);
  const [doneRun, setDoneRun] = useState(false);
  const r = useMemo(() => riverScene(s), [s]);
  const world = useRef<RiverGaugeWorld | null>(null);
  const sync = useRef({ s, r, active, doneRun });
  sync.current = { s, r, active, doneRun };
  const toWorld = () => {
    const { s: x, r: y, active: a, doneRun: d } = sync.current;
    world.current?.set({ h: x.h, Q: y.true.Q, V: y.V, verts: y.g.verts, active: a, method: x.method, Qg: y.g.Q, done: d });
  };
  useEffect(() => {
    setActive(-1);
    setDoneRun(false);
  }, [s.h, s.N, s.method]);
  useEffect(() => {
    toWorld();
  }, [r, active, doneRun]); // eslint-disable-line react-hooks/exhaustive-deps
  // el aforo: una vertical tras otra (unos 18 s en total)
  useEffect(() => {
    if (active < 0) return;
    if (active >= s.N) {
      setActive(-1);
      setDoneRun(true);
      return;
    }
    const id = window.setTimeout(() => setActive((x) => x + 1), Math.min(1600, 18000 / s.N));
    return () => window.clearTimeout(id);
  }, [active, s.N]);
  const ctx = useMemo<Ctx>(() => ({ s, r }), [s, r]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<RiverScene>) => setS((x) => ({ ...x, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = Math.abs(r.err) <= 0.02 ? 'ok' : Math.abs(r.err) <= 0.05 ? 'mid' : 'bad';
  const answer = (
    <>
      Con la regla en {es(s.h, 2)} m pasan <strong>{es(r.true.Q, 2)} m³/s</strong>. El aforo con {s.N} verticales da {es(r.g.Q, 2)} m³/s ({r.err >= 0 ? '+' : ''}
      {es(r.err * 100, 1)} %){r.g.maxShare > 0.1 ? ` y una vertical lleva el ${es(r.g.maxShare * 100, 0)} % del caudal: hacen falta más.` : '.'} La mejor curva de gasto dice {es(r.Qb, 2)} m³/s
      {r.extrapolated ? `, pero ${es(s.h, 2)} m está por encima del aforo más alto: es una extrapolación.` : '.'}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una estación de aforo en un río de montaña con fondo pedregoso: la regla limnimétrica en la orilla, una caseta con su pozo, la tarabita con el molinete que baja por cada vertical y, en la línea de aforo, un corte del agua coloreado por la velocidad (más oscuro, más rápido)."
          viewNames={[
            { id: 'rio', label: 'El río' },
            { id: 'molinete', label: 'El molinete' },
            { id: 'regla', label: 'La regla' },
          ]}
          make={(st) => new RiverGaugeWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <SectionChart h={s.h} verts={r.g.verts} W={520} H={240} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Cuánta agua lleva el río?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`verdadero ${es(r.true.Q, 2)} m³/s`, `aforo ${es(r.g.Q, 2)} m³/s`, `curva ${r.fit.ok ? es(r.Qc, 2) : '—'} m³/s`]}
        chart={
          <>
            <SectionChart h={s.h} verts={r.g.verts} />
            <RatingChart fit={r.fit} best={r.best} h={s.h} />
          </>
        }
        traces={[
          { key: 'e', label: 'Error del aforo', unit: '%', value: r.err * 100, digits: 1 },
          { key: 'c', label: 'Error típico de tu curva', unit: '%', value: r.fit.ok ? r.fit.se * 100 : 0, digits: 1 },
        ]}
      />
      <div className="hc-flood">
        {active >= 0 ? (
          <span className="hc-flood-q">
            vertical {Math.min(active + 1, s.N)} de {s.N}
          </span>
        ) : (
          <button type="button" onClick={() => setActive(0)} title="El molinete recorre las verticales">
            Aforar
          </button>
        )}
      </div>
      <DockRange label="Nivel en la regla" value={s.h} min={0.5} max={3.6} step={0.05} show={`${es(s.h, 2)} m`} onChange={(v) => set({ h: v })} />
      <DockRange label="Verticales del aforo" value={s.N} min={3} max={30} step={1} show={String(s.N)} onChange={(v) => set({ N: v })} />
      <DockChoice label="Método" value={s.method} options={(Object.keys(METHODS) as Method[]).map((m) => ({ value: m, label: m === '06' ? 'Un punto (0,6)' : 'Dos puntos (0,2 y 0,8)' }))} onChange={(v) => set({ method: v })} />
      <DockRange label="Caudal cero de la curva (h0)" value={s.h0} min={0} max={0.6} step={0.01} show={`${es(s.h0, 2)} m`} onChange={(v) => set({ h0: v })} />
    </>
  );

  const Ns = [4, 6, 8, 12, 20, 30];
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <SectionChart h={s.h} verts={r.g.verts} W={480} H={220} cls="hc-exp-svg cu-svg" />
        <h3>Sección media</h3>
        <p>
          El caudal es velocidad por área. En cada <strong>vertical</strong> se mide la profundidad y la velocidad con un molinete, cuya hélice gira más rápido con más corriente. En una vertical el agua corre despacio junto al fondo y más rápido arriba; la velocidad a <strong>0,6 de la profundidad</strong> (contada desde la superficie), o el promedio a 0,2 y 0,8, se parece mucho a la media. Cada vertical representa la mitad del espacio hasta sus vecinas.
        </p>
        <h3>La curva de gasto</h3>
        <p>
          Aforar cuesta: no se puede hacer a toda hora. Con varios aforos a distintos niveles se ajusta una <strong>curva de gasto</strong> Q = a·(h − h0)^b, y con ella cualquier lectura de la regla se vuelve caudal. Vale para el rango aforado; más arriba es una extrapolación.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el nivel del río, las verticales, el método y el h0 de la curva. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>El aforo vertical por vertical</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Distancia</th>
              <th>Profundidad</th>
              <th>Velocidad</th>
              <th>Ancho</th>
              <th>Caudal</th>
            </tr>
          </thead>
          <tbody>
            {r.g.verts.map((v, k) => (
              <tr key={k} className={k === active ? 'is-on' : ''}>
                <td>{es(v.x, 2)} m</td>
                <td>{es(v.d, 2)} m</td>
                <td>{es(v.v, 2)} m/s</td>
                <td>{es(v.w, 2)} m</td>
                <td>{es(v.q, 3)} ({es((v.q / r.g.Q) * 100, 0)} %)</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Más verticales, menos error</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Verticales</th>
              <th>Un punto</th>
              <th>Dos puntos</th>
              <th>La mayor lleva</th>
            </tr>
          </thead>
          <tbody>
            {Ns.map((n) => {
              const a = gauge(s.h, n, '06'), b = gauge(s.h, n, '0208');
              return (
                <tr key={n} className={n === s.N ? 'is-on' : ''}>
                  <td>{n}</td>
                  <td>{es((a.Q / r.true.Q - 1) * 100, 1)} %</td>
                  <td>{es((b.Q / r.true.Q - 1) * 100, 1)} %</td>
                  <td>{es(a.maxShare * 100, 0)} %</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h3>Los aforos y la curva</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Nivel</th>
              <th>Aforado</th>
              <th>Tu curva</th>
              <th>Mejor curva</th>
            </tr>
          </thead>
          <tbody>
            {GAUGINGS.map((g) => (
              <tr key={g.h}>
                <td>{es(g.h, 2)} m</td>
                <td>{es(g.Q, 2)} m³/s</td>
                <td>{r.fit.ok ? es(r.fit.a * Math.pow(g.h - r.fit.h0, r.fit.b), 2) : '—'}</td>
                <td>{es(r.best.a * Math.pow(g.h - r.best.h0, r.best.b), 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="q3-small">
          Mejor curva: Q = {es(r.best.a, 3)}·(h − {es(r.best.h0, 2)})^{es(r.best.b, 3)}, error típico {es(r.best.se * 100, 1)} %. Con el río a {es(3.3, 1)} m (fuera del cauce) la curva dice {es(r.best.a * Math.pow(3.3 - r.best.h0, r.best.b), 1)} m³/s y pasan {es(trueFlow(3.3).Q, 1)} m³/s.
        </p>
      </div>
    ),
    diseno: <DesignTab part="aforo" set={MEASURE_TOOLS.aforo} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El río (ilustrativo)</caption>
          <tbody>
            <Row name="Cauce" value="16 m de ancho, fondo pedregoso" note={`orilla a ${es(BANK, 2)} m en la regla`} />
            <Row name="Cero de la regla" value="0,35 m bajo lo más hondo" />
            <Row name="Pendiente" value={`${es(SLOPE * 100, 2)} %`} />
            <Row name="Manning" value={`cauce ${N_MAIN}, llanuras ${N_PLAIN}`} note="velocidad media de cada vertical con su profundidad" />
            <Row name="Perfil de velocidades" value="potencial 1/6" note="lento junto al fondo, rápido arriba" />
            <Row name="Aforos históricos" value={`${GAUGINGS.length}, de ${es(GAUGINGS[0].h, 2)} a ${es(H_MAX_GAUGED, 2)} m`} note="con ±5 % de error típico" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Caudal como velocidad por área; perfil de velocidades en una vertical y las reglas de 0,6 y de 0,2 y 0,8; método de la sección media; cuántas verticales hacen falta; curva de gasto, su ajuste en logaritmos y el nivel de caudal cero; extrapolación y desbordes.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Sección media y recomendaciones de ISO 748 (2007). Velocidad media por vertical con Manning y perfil potencial 1/6, con el que la regla de 0,6 da 1,0014 veces la media y la de 0,2 y 0,8 da 1,0081 (Chow, 1959; Herschy, 2009). Curva de gasto por mínimos cuadrados en logaritmos con búsqueda de h0 (OMM-n.º 1044, 2010). Pruebas M4 a M6.
        </p>
        <h3>Límites</h3>
        <p>
          El río es ilustrativo y su caudal «verdadero» viene del mismo modelo; un aforo real tiene además errores del molinete, del tiempo de medida y de la turbulencia. Sin lazo de crecientes (ver la sala de canales), sin cambios del fondo entre aforos ni remanso. No es una estación de la red del IDEAM.
        </p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

// «El embalse»: una presa de gravedad con un vertedero libre recibe una creciente. El embalse sube, guarda parte del
// volumen y lo suelta despacio (tránsito de Puls). La pregunta: ¿cuánto baja el embalse la creciente, y pasa el agua por
// encima de la presa?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { tiny } from './fmt';
import { RoutingChart } from './charts';
import { DAM_TOOLS, ROOM } from './design';
import { storage, type RoutingResult } from './dam';
import { EMB, reservoirOf, routeScene, type ReservoirScene } from './scene';
import { ReservoirWorld } from './three/damWorlds';

const MARGIN = 1.5;

interface Ctx {
  s: ReservoirScene;
  r: RoutingResult;
}

const att = (r: RoutingResult) => 1 - r.Opeak / r.Ipeak;

const RETOS: Reto<Ctx>[] = [
  {
    id: 'pr-borde',
    title: 'Una creciente grande, con borde libre',
    goal: `Con una creciente de 1 000 m³/s o más, escoge el ancho del vertedero para que el agua quede al menos ${MARGIN} m bajo la corona.`,
    hint: 'Un vertedero más ancho saca más agua con menos carga.',
    check: (c) => c.s.Qp >= 1000 && c.r.hMax <= EMB.freeboard - MARGIN,
    progress: (c) => `El agua llega a ${es(c.r.hMax, 2)} m de ${EMB.freeboard} m`,
  },
  {
    id: 'pr-atenua',
    title: 'El embalse amortigua',
    goal: 'Logra que el pico que sale sea al menos 35 % menor que el que entra, sin que el agua pase por encima de la corona.',
    hint: 'Un vertedero angosto y una creciente rápida dejan más agua guardada en el embalse.',
    check: (c) => att(c.r) >= 0.35 && c.r.hMax < EMB.freeboard,
    progress: (c) => `Atenuación ${es(att(c.r) * 100, 1)} %`,
  },
  {
    id: 'pr-retraso',
    title: 'El pico llega tarde',
    goal: 'Haz que el pico de salida llegue 3 horas o más después del pico de entrada.',
    hint: 'Mientras la entrada supera la salida, el embalse sigue subiendo: el pico sale cuando las dos se cruzan.',
    check: (c) => c.r.tOpeak - c.r.tIpeak >= 3,
    progress: (c) => `Retraso ${es(c.r.tOpeak - c.r.tIpeak, 2)} h`,
  },
  {
    id: 'pr-sobre',
    title: 'Por encima de la presa',
    goal: 'Encuentra una creciente y un vertedero con los que el agua pase por encima de la corona.',
    hint: 'Cuando el agua pasa por encima de una presa que no está hecha para eso, puede erosionar el pie y los estribos.',
    check: (c) => c.r.hMax > EMB.freeboard,
    progress: (c) => `El agua llega a ${es(c.r.hMax, 2)} m`,
  },
];

export function EmbalseLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<ReservoirScene>({ L: 30, Qp: 800, tp: 6, bottom: 0 });
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [k, setK] = useState<number | null>(null);
  const r = useMemo(() => routeScene(s), [s]);
  const world = useRef<ReservoirWorld | null>(null);
  const sync = useRef({ r, L: s.L });
  sync.current = { r, L: s.L };
  useEffect(() => {
    world.current?.set(sync.current.r, sync.current.L);
    world.current?.at(r.h.indexOf(r.hMax));
    setK(null);
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const playing = k !== null;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      // el primer cuadro puede llegar con una marca de tiempo anterior a t0
      const kk = Math.min(r.t.length - 1, Math.max(0, Math.floor(((now - t0) / 24000) * (r.t.length - 1))));
      world.current?.at(kk);
      setK(kk);
      if (kk >= r.t.length - 1) {
        setK(null);
        world.current?.at(r.h.indexOf(r.hMax));
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // el bucle empieza al pulsar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const ctx = useMemo<Ctx>(() => ({ s, r }), [s, r]);
  const widths = useMemo(() => [...new Set([10, 20, 30, 40, 60, 80, s.L])].sort((a, b) => a - b).map((L) => ({ L, r: routeScene({ ...s, L }) })), [s]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<ReservoirScene>) => setS((x) => ({ ...x, ...p }));
  const i = k ?? r.h.indexOf(r.hMax);
  const over = r.hMax > EMB.freeboard;
  const tone: 'ok' | 'mid' | 'bad' = over ? 'bad' : r.hMax > EMB.freeboard - MARGIN ? 'mid' : 'ok';
  const answer = (
    <>
      Entra un pico de {es(r.Ipeak, 0)} m³/s y sale uno de <strong>{es(r.Opeak, 0)} m³/s</strong> ({es(att(r) * 100, 0)} % menos), {es(r.tOpeak - r.tIpeak, 1)} h más tarde. El agua sube hasta {es(r.hMax, 2)} m sobre la cresta:{' '}
      {over ? 'pasa por encima de la corona.' : r.hMax > EMB.freeboard - MARGIN ? `queda a menos de ${MARGIN} m de la corona.` : `quedan ${es(EMB.freeboard - r.hMax, 2)} m de borde libre.`} El embalse guardó {es(storage(reservoirOf(s), r.hMax) / 1e6, 2)} millones de m³ en el momento más alto.
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de un valle con una presa de gravedad de concreto y un vertedero en el centro. Aguas arriba está el embalse; al llegar la creciente el agua sube y pasa por el vertedero, y el río de aguas abajo crece."
          viewNames={[
            { id: 'general', label: 'El valle' },
            { id: 'presa', label: 'La presa' },
            { id: 'aguas', label: 'El embalse' },
          ]}
          make={(st) => new ReservoirWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current.r, sync.current.L);
            w.at(sync.current.r.h.indexOf(sync.current.r.hMax));
          }}
        />
      ) : (
        <FlatStage>
          <RoutingChart res={r} k={k} W={520} H={260} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Cuánto baja el embalse la creciente, y pasa el agua por encima de la presa?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`entra ${es(r.Ipeak, 0)} m³/s`, `sale ${es(r.Opeak, 0)} m³/s`, `agua máx. ${es(r.hMax, 2)} m`]}
        chart={<RoutingChart res={r} k={k} />}
        traces={[
          { key: 'h', label: 'Agua sobre la cresta', unit: 'm', value: r.h[i], digits: 2, ref: { value: EMB.freeboard, label: 'corona' } },
          { key: 'o', label: 'Sale por el vertedero', unit: 'm³/s', value: r.O[i], digits: 0 },
        ]}
      />
      <div className="hc-flood">
        {playing ? (
          <span className="hc-flood-q">hora {es(r.t[k as number], 1)}</span>
        ) : (
          <button type="button" onClick={() => setK(0)} title="48 horas de la creciente en 24 s">
            Llega la creciente
          </button>
        )}
      </div>
      <DockRange label="Ancho del vertedero" value={s.L} min={10} max={80} step={1} show={`${es(s.L, 0)} m`} onChange={(v) => set({ L: v })} />
      <DockRange label="Pico de la creciente" value={s.Qp} min={200} max={1500} step={50} show={`${es(s.Qp, 0)} m³/s`} onChange={(v) => set({ Qp: v })} />
      <DockRange label="Tiempo al pico" value={s.tp} min={2} max={12} step={0.5} show={`${es(s.tp, 1)} h`} onChange={(v) => set({ tp: v })} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <RoutingChart res={r} k={null} W={480} H={220} cls="hc-exp-svg cu-svg" />
        <h3>Un embalse guarda y suelta</h3>
        <p>
          Mientras entra más agua de la que sale, el embalse sube; al subir, el vertedero saca más agua. El pico de salida llega cuando la salida alcanza a la entrada, y es menor y más tardío que el de entrada: el embalse <strong>amortigua</strong> la creciente. El área celeste del gráfico es el volumen de la creciente; la diferencia entre las dos curvas, hasta el cruce, es lo que el embalse guardó.
        </p>
        <h3>El borde libre</h3>
        <p>La corona de la presa debe quedar por encima del agua más alta, con un margen para el oleaje y lo que no se previó. Si el agua pasa por encima de una presa que no está hecha para eso, puede erosionar el pie y los estribos.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el vertedero y la creciente, y mira cómo pasa. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>El balance del embalse</h3>
        <p className="q3-small">Lo que entra es lo que sale más lo que queda guardado. El método de Puls lo cumple en cada paso de 15 minutos.</p>
        <table className="q3-table">
          <tbody>
            <Row name="Entró" value={`${es(r.vin / 1e6, 3)} millones de m³`} />
            <Row name="Salió" value={`${es(r.vout / 1e6, 3)} millones de m³`} />
            <Row name="Quedó guardado al final" value={`${es(r.dS / 1e6, 3)} millones de m³`} />
            <Row name="Error del balance" value={`${tiny(Math.abs(r.vin - r.vout - r.dS) / r.vin)}`} />
            <Row name="En el pico de salida, entrada − salida" value={`${es(r.I[r.O.indexOf(r.Opeak)] - r.Opeak, 1)} m³/s`} note="el pico sale en el cruce" />
          </tbody>
        </table>
        <h3>¿Más ancho o más angosto?</h3>
        <p className="q3-small">La misma creciente con vertederos de distinto ancho. Uno angosto amortigua más, pero el agua sube más: el diseño busca el equilibrio entre lo que se protege aguas abajo y el borde libre.</p>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Vertedero</th>
              <th>Pico que sale</th>
              <th>Atenuación</th>
              <th>Agua máx.</th>
            </tr>
          </thead>
          <tbody>
            {widths.map((w) => (
              <tr key={w.L} className={w.L === s.L ? 'is-on' : ''}>
                <td>{w.L} m</td>
                <td>{es(w.r.Opeak, 0)} m³/s</td>
                <td>{es(att(w.r) * 100, 0)} %</td>
                <td>
                  {es(w.r.hMax, 2)} m{w.r.hMax > EMB.freeboard ? ' · rebosa' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="embalse" set={DAM_TOOLS.embalse} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El embalse (ilustrativo)</caption>
          <tbody>
            <Row name="Espejo de agua en la cresta" value={`${es(EMB.A0 / 1e4, 0)} ha`} note={`crece ${es(EMB.A1 / 1e4, 0)} ha por metro`} />
            <Row name="Vertedero libre" value={`${es(s.L, 0)} m`} note={`Q = ${EMB.C}·L·H^1,5`} />
            <Row name="Corona" value={`${EMB.freeboard} m sobre la cresta`} />
            <Row name="Creciente de entrada" value={`gamma: base ${EMB.Qb} m³/s, pico ${es(s.Qp, 0)} m³/s a las ${es(s.tp, 1)} h`} />
            <Row name="Paso del cálculo" value={`${EMB.dt * 60} min, ${EMB.tEnd} h`} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>La ecuación de continuidad de un embalse; el tránsito por piscina nivelada; atenuación y retraso de una creciente; por qué el pico de salida está en el cruce de los hidrogramas; el ancho del vertedero y el borde libre.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>Método de Puls modificado (piscina nivelada) con la relación almacenamiento-descarga invertida por bisección en cada paso (Chow, Maidment y Mays, 1988, sec. 8.2); hidrograma de entrada de forma gamma (NRCS). Se verifica contra el embalse lineal exacto y con el balance de masa (pruebas D1, D2 y D6).</p>
        <h3>Límites</h3>
        <p>El embalse se supone horizontal (sin la cuña de la creciente que entra); el coeficiente del vertedero es constante; la presa y el valle son ilustrativos.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

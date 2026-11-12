// «La lluvia entra al suelo»: una parcela con su corte. Llueve con intensidad constante; el agua entra al suelo
// (Green-Ampt) hasta que el suelo no da abasto, se forman charcos y el resto escurre. La pregunta: ¿cuánta lluvia se
// toma el suelo y cuánta escurre?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { InfChart } from './charts';
import { ROOM, SLOPE_TOOLS } from './design';
import { TEXTURES, pondingTime, type Texture } from './slope';
import { DEFAULT_INF, infScene, type InfScene } from './scene';
import { InfiltrationWorld } from './three/slopeWorlds';

const SHOWN: Texture[] = ['arena', 'francoArenoso', 'franco', 'francoLimoso', 'arcilla'];
const PLAY = 20;

type R = ReturnType<typeof infScene>;
interface Ctx {
  s: InfScene;
  r: R;
  /** La misma lluvia sobre el mismo suelo seco (saturación 0,1). */
  dry: R;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'la-nada',
    title: 'Que no escurra nada',
    goal: 'Con un aguacero de 40 mm/h o más durante una hora o más, logra que todo el agua entre al suelo.',
    hint: 'El suelo recibe todo mientras la lluvia no supere lo que alcanza a dejar pasar. ¿Qué suelo deja pasar más?',
    check: (c) => c.s.i >= 40 && c.s.T >= 1 && c.r.Rtot < 0.05,
    progress: (c) => `${es(c.s.i, 0)} mm/h durante ${es(c.s.T, 2)} h; escurren ${es(c.r.Rtot, 1)} mm`,
  },
  {
    id: 'la-charco',
    title: 'Charcos enseguida',
    goal: 'Con una lluvia de 30 mm/h o menos, haz que se formen charcos antes de 5 minutos.',
    hint: 'Un suelo que deja pasar poca agua, o que ya está húmedo, se llena muy pronto.',
    check: (c) => c.s.i <= 30 && c.r.tp !== null && c.r.tp * 60 < 5,
    progress: (c) => (c.r.tp === null ? 'no se encharca' : `se encharca a los ${es(c.r.tp * 60, 1)} min`),
  },
  {
    id: 'la-frente',
    title: 'El agua llega hondo',
    goal: 'Lleva el frente de humedecimiento a 50 cm de profundidad o más.',
    hint: 'El frente baja más cuando entra mucha agua y cuando el suelo ya tenía poco espacio libre en sus poros.',
    check: (c) => c.r.front >= 500,
    progress: (c) => `frente a ${es(c.r.front / 10, 1)} cm`,
  },
  {
    id: 'la-humedo',
    title: 'Llueve sobre mojado',
    goal: 'Encuentra una lluvia y un suelo húmedo (saturación de 0,7 o más) que escurran al menos el doble que el mismo suelo seco.',
    hint: 'Después de días de lluvia el suelo tiene menos espacio para guardar agua: la misma tormenta escurre más.',
    check: (c) => c.s.Se >= 0.7 && c.dry.Rtot > 0.5 && c.r.Rtot >= 2 * c.dry.Rtot,
    progress: (c) => `húmedo ${es(c.r.Rtot, 1)} mm, seco ${es(c.dry.Rtot, 1)} mm`,
  },
];

export function InfiltracionLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<InfScene>(DEFAULT_INF);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [k, setK] = useState<number | null>(null);
  const r = useMemo(() => infScene(s), [s]);
  const dry = useMemo(() => infScene({ ...s, Se: 0.1 }), [s]);
  const world = useRef<InfiltrationWorld | null>(null);
  const sync = useRef({ s, r });
  sync.current = { s, r };
  const toWorld = () => world.current?.set({ texture: sync.current.s.texture, r: sync.current.r, i: sync.current.s.i, dTheta: sync.current.r.dTheta });
  useEffect(() => {
    toWorld();
    world.current?.raining(0);
    setK(null);
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const playing = k !== null;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const t0 = performance.now();
    world.current?.raining(Math.max(0.15, Math.min(1, s.i / 100)));
    const loop = (now: number) => {
      const kk = Math.min(r.t.length - 1, Math.max(0, Math.floor(((now - t0) / (PLAY * 1000)) * (r.t.length - 1))));
      world.current?.at(kk);
      setK(kk);
      if (kk >= r.t.length - 1) {
        setK(null);
        world.current?.raining(0);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // el bucle empieza al pulsar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  const ctx = useMemo<Ctx>(() => ({ s, r, dry }), [s, r, dry]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<InfScene>) => setS((x) => ({ ...x, ...p }));
  const i = k ?? r.t.length - 1;
  const tone: 'ok' | 'mid' | 'bad' = r.Rtot < 0.05 ? 'ok' : r.Rtot < r.P * 0.3 ? 'mid' : 'bad';
  const answer = (
    <>
      De {es(r.P, 1)} mm de lluvia, entran al suelo <strong>{es(r.Ftot, 1)} mm</strong> y escurren <strong>{es(r.Rtot, 1)} mm</strong> ({es((r.Rtot / r.P) * 100, 0)} %).{' '}
      {r.tp === null ? 'El suelo alcanza a recibir toda la lluvia: no se forman charcos.' : `A los ${es(r.tp * 60, 1)} minutos el suelo ya no da abasto: se forman charcos y desde ahí el agua corre por encima.`} El agua mojó el suelo hasta {es(r.front / 10, 1)} cm de profundidad.
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una parcela de pasto con su corte de suelo. Llueve: en el corte se ve bajar el frente de humedecimiento; cuando el suelo no da abasto se forman charcos y el agua corre hacia una cuneta. Sobre la parcela hay un infiltrómetro de doble anillo."
          viewNames={[
            { id: 'general', label: 'La parcela' },
            { id: 'corte', label: 'El corte' },
            { id: 'superficie', label: 'La superficie' },
          ]}
          make={(st) => new InfiltrationWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <InfChart r={r} i={s.i} k={k} W={520} H={240} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Cuánta lluvia se toma el suelo y cuánta escurre?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`entran ${es(r.Ftot, 1)} mm`, `escurren ${es(r.Rtot, 1)} mm`, r.tp === null ? 'sin charcos' : `charcos a los ${es(r.tp * 60, 1)} min`]}
        chart={<InfChart r={r} i={s.i} k={k} />}
        traces={[
          { key: 'f', label: 'Entra al suelo ahora', unit: 'mm/h', value: r.f[i], digits: 1, ref: { value: s.i, label: 'lluvia' } },
          { key: 'R', label: 'Escorrentía acumulada', unit: 'mm', value: r.R[i], digits: 1 },
        ]}
      />
      <div className="hc-flood">
        {playing ? (
          <span className="hc-flood-q">minuto {es(r.t[k as number] * 60, 0)}</span>
        ) : (
          <button type="button" onClick={() => setK(0)} title={`La lluvia completa en ${PLAY} s`}>
            Que llueva
          </button>
        )}
      </div>
      <DockChoice label="Suelo" value={s.texture} options={SHOWN.map((t) => ({ value: t, label: TEXTURES[t].name }))} onChange={(v) => set({ texture: v })} />
      <DockRange label="Humedad inicial del suelo" value={s.Se} min={0.05} max={0.95} step={0.05} show={`${es(s.Se * 100, 0)} %`} onChange={(v) => set({ Se: v })} />
      <DockRange label="Intensidad de la lluvia" value={s.i} min={5} max={120} step={5} show={`${es(s.i, 0)} mm/h`} onChange={(v) => set({ i: v })} />
      <DockRange label="Duración" value={s.T} min={0.25} max={3} step={0.25} show={`${es(s.T, 2)} h`} onChange={(v) => set({ T: v })} />
    </>
  );

  const textures = Object.keys(TEXTURES) as Texture[];
  const tpF = pondingTime(r.tx.Ks, r.tx.psi * r.dTheta, s.i);
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <InfChart r={r} i={s.i} W={480} H={200} cls="hc-exp-svg cu-svg" />
        <h3>El suelo es una esponja con un límite</h3>
        <p>
          Al empezar a llover, el suelo seco «chupa» el agua con fuerza (la succión de sus poros) y recibe toda la lluvia. A medida que se moja, el agua tiene que recorrer un camino más largo y la <strong>capacidad de infiltración</strong> baja. Cuando baja de la intensidad de la lluvia, el suelo ya no da abasto: se forman <strong>charcos</strong> y el resto escurre por encima.
        </p>
        <h3>El frente de humedecimiento</h3>
        <p>En el corte se ve un borde claro entre el suelo mojado de arriba y el seco de abajo: el frente baja más cuando entra más agua y cuando el suelo tenía menos espacio libre en sus poros.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el suelo, la humedad y la lluvia. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>El balance del agua</h3>
        <p className="q3-small">Lo que llueve es lo que entra más lo que escurre (sin evaporación en una tormenta corta).</p>
        <table className="q3-table">
          <tbody>
            <Row name="Lluvia" value={`${es(r.P, 2)} mm`} />
            <Row name="Entró al suelo" value={`${es(r.Ftot, 2)} mm`} />
            <Row name="Escurrió" value={`${es(r.Rtot, 2)} mm`} />
            <Row name="Lluvia − entró − escurrió" value={`${es(Math.abs(r.P - r.Ftot - r.Rtot), 6)} mm`} />
            <Row name="Encharcamiento: fórmula y serie" value={tpF === null ? 'no ocurre' : `${es(tpF * 60, 2)} min y ${r.tp === null ? 'después de la lluvia' : `${es(r.tp * 60, 2)} min`}`} note="tp = Ks·ψΔθ/(i·(i − Ks))" />
          </tbody>
        </table>
        <h3>La misma lluvia sobre cada suelo</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Suelo</th>
              <th>Ks</th>
              <th>Charcos</th>
              <th>Escurre</th>
            </tr>
          </thead>
          <tbody>
            {textures.map((t) => {
              const x = infScene({ ...s, texture: t });
              return (
                <tr key={t} className={t === s.texture ? 'is-on' : ''}>
                  <td>{TEXTURES[t].name}</td>
                  <td>{es(TEXTURES[t].Ks, 1)} mm/h</td>
                  <td>{x.tp === null ? 'no' : `${es(x.tp * 60, 1)} min`}</td>
                  <td>{es(x.Rtot, 1)} mm</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="infiltracion" set={SLOPE_TOOLS.infiltracion} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El suelo de la parcela (Rawls y otros, 1983)</caption>
          <tbody>
            <Row name="Suelo" value={r.tx.name} />
            <Row name="Conductividad hidráulica Ks" value={`${es(r.tx.Ks, 1)} mm/h`} />
            <Row name="Succión en el frente ψ" value={`${es(r.tx.psi, 1)} mm`} />
            <Row name="Porosidad efectiva θe" value={es(r.tx.thetaE, 3)} />
            <Row name="Déficit de humedad Δθ" value={es(r.dTheta, 3)} note="(1 − humedad)·θe" />
            <Row name="Parcela" value="10 × 8 m con 4 % de pendiente" note="ilustrativa" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Infiltración y escorrentía; la capacidad de infiltración que baja en el tiempo; el encharcamiento; el frente de humedecimiento; por qué un suelo húmedo escurre más con la misma tormenta.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>Modelo de Green y Ampt (1911) con el encharcamiento de Mein y Larson (1973) para lluvia constante; parámetros por textura de Rawls, Brakensiek y Miller (1983), tal como los presentan Chow, Maidment y Mays (1988, cap. 4). Se verifica contra los ejemplos del libro y con el balance de agua (pruebas L1 a L4).</p>
        <h3>Límites</h3>
        <p>Suelo homogéneo, frente nítido, lluvia constante, sin evaporación ni la lámina de agua de los charcos; en un suelo real hay capas, raíces, grietas y macroporos que cambian mucho la infiltración. La parcela es ilustrativa.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

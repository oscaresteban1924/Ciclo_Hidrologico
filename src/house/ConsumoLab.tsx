// «¿Cuánta agua usa la casa?»: una casa de un piso con su baño, cocina y patio. Cada aparato gasta según su caudal
// y los hábitos de la familia; el agua se reparte en el día (duchas en la madrugada, cocina a las comidas) y las
// fugas no paran. La pregunta: ¿cuánta agua usa la casa, y dónde se va?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { DayChart, UseBars } from './charts';
import { HOUSE_TOOLS, ROOM } from './design';
import { BASIC_M3, COMPLEMENTARY_M3, RATES, USE_NAMES, type Use } from './house';
import { DEFAULT_USE, useScene, type UseScene } from './scene';
import { START_READING } from './scene';
import { HouseWorld } from './three/houseWorld';

const PLAY = 24;
const IDLE_HOUR = 7.2;
type R = ReturnType<typeof useScene>;
interface Ctx {
  s: UseScene;
  r: R;
  base: R;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'ca-basico',
    title: 'Dentro del básico',
    goal: 'Con cuatro personas o más, logra que la casa use 13 m³ al mes o menos (el consumo básico de Medellín).',
    hint: 'Los aparatos ahorradores gastan menos con los mismos hábitos. La ducha es lo que más pesa.',
    check: (c) => c.s.people >= 4 && c.r.m3 <= BASIC_M3,
    progress: (c) => `${c.s.people} personas, ${es(c.r.m3, 1)} m³ al mes`,
  },
  {
    id: 'ca-ducha',
    title: 'La ducha manda',
    goal: 'Encuentra unos hábitos con los que la ducha se lleva más de la mitad del agua de la casa.',
    hint: 'Una ducha de 9 L/min gasta 90 L en diez minutos: más que todas las descargas del sanitario de un día.',
    check: (c) => c.r.u.ducha / c.r.L > 0.5,
    progress: (c) => `la ducha lleva el ${es((c.r.u.ducha / c.r.L) * 100, 0)} %`,
  },
  {
    id: 'ca-fuga',
    title: 'La fuga silenciosa',
    goal: 'Encuentra una casa en la que las fugas son la quinta parte del consumo o más.',
    hint: 'Un sanitario que deja pasar un hilo de agua bota más de 100 litros al día, aunque nadie lo use.',
    check: (c) => c.r.u.fugas / c.r.L >= 0.2,
    progress: (c) => `las fugas son el ${es((c.r.u.fugas / c.r.L) * 100, 0)} %`,
  },
  {
    id: 'ca-mitad',
    title: 'La mitad',
    goal: 'Sin bañarse menos de 5 minutos, gasta la mitad o menos de lo que gastaría la misma familia con los hábitos y aparatos de partida.',
    hint: 'Combina aparatos ahorradores con hábitos: menos minutos de ducha y de lavaplatos, lavadas llenas.',
    check: (c) => c.s.shower >= 5 && c.r.L <= 0.5 * c.base.L,
    progress: (c) => `${es((c.r.L / c.base.L) * 100, 0)} % de lo de partida, ducha de ${es(c.s.shower, 0)} min`,
  },
];

export function ConsumoLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<UseScene>(DEFAULT_USE);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [hour, setHour] = useState<number | null>(null);
  const r = useMemo(() => useScene(s), [s]);
  const base = useMemo(() => useScene({ ...DEFAULT_USE, people: s.people }), [s.people]);
  const world = useRef<HouseWorld | null>(null);
  const sync = useRef({ r, hour, s });
  sync.current = { r, hour, s };
  const toWorld = () => {
    const { r: y, hour: h, s: x } = sync.current;
    const hh = h ?? IDLE_HOUR;
    const upTo = y.byHour.slice(0, Math.floor(hh)).reduce((a, b) => a + b, 0) + y.byHour[Math.min(23, Math.floor(hh))] * (hh % 1);
    world.current?.set({ mode: 'consumo', hour: hh, hrs: y.hrs, reading: START_READING + upTo / 1000, leak: 0, people: x.people });
  };
  useEffect(() => {
    toWorld();
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const playing = hour !== null;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const h = Math.min(24, Math.max(0, ((now - t0) / (PLAY * 1000)) * 24));
      sync.current.hour = h;
      toWorld();
      setHour(h);
      if (h >= 24) {
        setHour(null);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // el bucle empieza al pulsar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  useEffect(() => {
    if (hour === null) toWorld();
  }, [hour]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, r, base }), [s, r, base]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<UseScene>) => setS((x) => ({ ...x, ...p }));
  const devices = s.lowShower && s.lowToilet && s.aerators && s.frontLoader ? 'ahorro' : !s.lowShower && !s.lowToilet && !s.aerators && !s.frontLoader ? 'normal' : 'mixto';
  const leaks = s.drip && s.toiletLeak ? 'dos' : s.drip ? 'goteo' : s.toiletLeak ? 'sanitario' : 'no';
  const tone: 'ok' | 'mid' | 'bad' = r.m3 <= BASIC_M3 ? 'ok' : r.m3 <= COMPLEMENTARY_M3 ? 'mid' : 'bad';
  const hNow = hour === null ? null : Math.min(23, Math.floor(hour));
  const answer = (
    <>
      La casa usa <strong>{es(r.L, 0)} litros al día</strong>, {es(r.per, 0)} por persona: {es(r.m3, 1)} m³ al mes, en el rango de consumo {r.range}. Lo que más gasta es {USE_NAMES[r.top].toLowerCase()} ({es((r.u[r.top] / r.L) * 100, 0)} %).
      {r.u.fugas > 0 ? ` Las fugas botan ${es(r.u.fugas, 0)} L al día sin que nadie las use.` : ''}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una casa de un piso sin techo, vista desde arriba: el baño con ducha, sanitario y lavamanos, la cocina, el patio con la lavadora y la manguera, y la tubería que llega del medidor de la calle a cada aparato. Cuando un aparato se usa, el agua avanza por su tubo y sale el chorro."
          viewNames={[
            { id: 'casa', label: 'La casa' },
            { id: 'bano', label: 'El baño' },
            { id: 'cocina', label: 'La cocina' },
          ]}
          make={(st) => new HouseWorld(st, 'consumo')}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <UseBars u={r.u} W={520} H={230} />
        </FlatStage>
      )}
      <Question q="¿Cuánta agua usa la casa, y dónde se va?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`${es(r.L, 0)} L/día`, `${es(r.per, 0)} L por persona`, `${es(r.m3, 1)} m³/mes`]}
        chart={<DayChart hrs={r.hrs} hour={hNow} />}
        traces={[
          { key: 'h', label: hour === null ? 'A las 7 de la mañana' : 'En esta hora', unit: 'L', value: r.byHour[hNow ?? 7], digits: 0 },
          { key: 'm', label: 'Al mes', unit: 'm³', value: r.m3, digits: 1, ref: { value: BASIC_M3, label: 'básico' } },
        ]}
      />
      <div className="hc-flood">
        {playing ? (
          <span className="hc-flood-q">
            {String(Math.floor(hour as number)).padStart(2, '0')}:{String(Math.floor(((hour as number) % 1) * 60)).padStart(2, '0')}
          </span>
        ) : (
          <button type="button" onClick={() => setHour(0)} title={`Un día completo en ${PLAY} s`}>
            Un día en la casa
          </button>
        )}
      </div>
      <DockRange label="Personas" value={s.people} min={1} max={8} step={1} show={String(s.people)} onChange={(v) => set({ people: v })} />
      <DockRange label="Ducha por persona" value={s.shower} min={2} max={20} step={1} show={`${es(s.shower, 0)} min`} onChange={(v) => set({ shower: v })} />
      <DockRange label="Lavaplatos al día" value={s.dishes} min={0} max={40} step={1} show={`${es(s.dishes, 0)} min`} onChange={(v) => set({ dishes: v })} />
      <DockRange label="Lavadas de ropa" value={s.loads} min={0} max={10} step={1} show={`${s.loads} por semana`} onChange={(v) => set({ loads: v })} />
      <DockRange label="Manguera" value={s.hose} min={0} max={120} step={5} show={`${es(s.hose, 0)} min por semana`} onChange={(v) => set({ hose: v })} />
      <DockChoice
        label="Aparatos"
        value={devices === 'mixto' ? 'normal' : devices}
        options={[
          { value: 'normal', label: 'Convencionales' },
          { value: 'ahorro', label: 'Ahorradores' },
        ]}
        onChange={(v) => set({ lowShower: v === 'ahorro', lowToilet: v === 'ahorro', aerators: v === 'ahorro', frontLoader: v === 'ahorro' })}
      />
      <DockChoice
        label="Fugas"
        value={leaks}
        options={[
          { value: 'no', label: 'Ninguna' },
          { value: 'goteo', label: 'Llave que gotea' },
          { value: 'sanitario', label: 'Sanitario' },
          { value: 'dos', label: 'Las dos' },
        ]}
        onChange={(v) => set({ drip: v === 'goteo' || v === 'dos', toiletLeak: v === 'sanitario' || v === 'dos' })}
      />
    </>
  );

  const keys = Object.keys(r.u) as Use[];
  const saved = useScene({ ...s, lowShower: true, lowToilet: true, aerators: true, frontLoader: true, drip: false, toiletLeak: false });
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <UseBars u={r.u} W={480} H={210} />
        <h3>Caudal por tiempo</h3>
        <p>
          Lo que gasta un aparato es su <strong>caudal</strong> por el tiempo que se usa: una ducha de {RATES.shower.std} L/min durante {es(s.shower, 0)} minutos son {es(RATES.shower.std * s.shower, 0)} litros. El sanitario gasta lo mismo en cada descarga; la lavadora, en cada lavada. Las <strong>fugas</strong> gastan poco a la vez, pero todo el día y toda la noche.
        </p>
        <h3>El día de una casa</h3>
        <p>El agua no se usa pareja: hay una punta en la madrugada (duchas y desayuno), otra al mediodía y otra en la noche. Por eso el acueducto tiene tanques que se llenan de noche y se vacían de día.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia las personas, los hábitos, los aparatos y las fugas. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Uso por uso</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Uso</th>
              <th>Hoy</th>
              <th>Con ahorradores y sin fugas</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}>
                <td>{USE_NAMES[k]}</td>
                <td>{es(r.u[k], 0)} L/día</td>
                <td>{es(saved.u[k], 0)} L/día</td>
              </tr>
            ))}
            <tr className="is-on">
              <td>Total</td>
              <td>
                {es(r.L, 0)} L · {es(r.m3, 1)} m³/mes
              </td>
              <td>
                {es(saved.L, 0)} L · {es(saved.m3, 1)} m³/mes
              </td>
            </tr>
          </tbody>
        </table>
        <h3>Minutos de ducha</h3>
        <table className="q3-table">
          <tbody>
            {[3, 5, 7, 10, 15].map((m) => {
              const x = useScene({ ...s, shower: m });
              return <Row key={m} name={`${m} minutos`} value={`${es(x.m3, 1)} m³/mes`} note={`${es(x.per, 0)} L por persona al día`} />;
            })}
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="consumo" set={HOUSE_TOOLS.consumo} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>Los aparatos (valores típicos)</caption>
          <tbody>
            <Row name="Ducha" value={`${RATES.shower.std} L/min`} note={`ahorradora ${RATES.shower.low} L/min`} />
            <Row name="Sanitario" value={`${RATES.toilet.std} L por descarga`} note={`de bajo consumo ${RATES.toilet.low} L; 4 descargas por persona al día`} />
            <Row name="Lavamanos" value={`${RATES.basin.std} L/min`} note={`con aireador ${RATES.basin.low} L/min; 1,5 min por persona al día`} />
            <Row name="Lavaplatos" value={`${RATES.sink.std} L/min`} note={`con aireador ${RATES.sink.low} L/min`} />
            <Row name="Lavadora" value={`${RATES.washer.std} L por lavada`} note={`eficiente ${RATES.washer.low} L`} />
            <Row name="Manguera" value={`${RATES.hose} L/min`} />
            <Row name="Llave que gotea" value={`${RATES.drip} L/día`} note="una gota por segundo" />
            <Row name="Sanitario con fuga" value={`${RATES.toiletLeak} L/día`} note="ilustrativo" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Caudal, tiempo y volumen; litros por persona al día; metros cúbicos al mes; dónde se va el agua de una casa; curva de consumo del día y horas pico; aparatos ahorradores; fugas que no se ven; el consumo básico de la regulación.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Volumen = caudal × tiempo (o volumen por descarga o por lavada). Rangos de consumo de la Resolución CRA 750 de 2016 (básico de 13 m³ al mes por suscriptor en ciudades entre 1 000 y 2 000 m). Goteo con la cuenta de la calculadora del USGS. El reparto en el día es una forma típica, ilustrativa. Pruebas H1 y H2.
        </p>
        <h3>Límites</h3>
        <p>Caudales típicos: los de cada aparato varían con la presión y el modelo. La casa y la familia son ilustrativas. El agua para beber y cocinar (pocos litros) va dentro del lavaplatos.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

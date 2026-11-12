// «La central hidroeléctrica»: una pequeña central de pasada toma parte del río en una bocatoma, la lleva por un
// canal y la deja caer por una tubería hasta la turbina. La potencia depende del caudal y de la caída; la energía del
// año, de cuánta agua trae el río en cada época. La pregunta: ¿cuánta luz da el río?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { FdcChart, HydroSection } from './charts';
import { PUMP_TOOLS, ROOM } from './design';
import { HOME_KWH_MONTH, TURBINES, fdc, type Turbine } from './pump';
import { DEFAULT_HYDRO, PENSTOCK_RATIO, RIVER_Q50, hydroScene, type HydroScene } from './scene';
import { HOMES_PER_HOUSE, HydroWorld } from './three/pumpWorlds';

type R = ReturnType<typeof hydroScene>;
interface Ctx {
  s: HydroScene;
  r: R;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'bo-sequia',
    title: 'En la sequía',
    goal: 'Con el río en época seca (época de 80 % o más), mantén la central generando.',
    hint: 'Cada turbina para por debajo de cierta fracción de su caudal de diseño. La Pelton aguanta caudales muy bajos.',
    check: (c) => c.s.p >= 0.8 && c.r.now.P > 0,
    progress: (c) => `época ${es(c.s.p * 100, 0)} %, ${es(c.r.now.P, 0)} kW`,
  },
  {
    id: 'bo-energia',
    title: 'Más energía',
    goal: 'Produce 7 000 MWh al año o más con pérdidas de 5 % o menos en la tubería de presión.',
    hint: 'La potencia crece con la caída y con el caudal; una tubería más ancha pierde menos.',
    check: (c) => c.r.E >= 7000 && c.r.lossPct <= 5,
    progress: (c) => `${es(c.r.E, 0)} MWh/año, pérdidas ${es(c.r.lossPct, 1)} %`,
  },
  {
    id: 'bo-baja',
    title: 'Poca caída',
    goal: 'Con 25 m de caída o menos, elige una turbina que sirva y genera 150 kW o más ahora.',
    hint: 'Las Pelton necesitan mucha caída; para poca caída y mucho caudal están las Kaplan.',
    check: (c) => c.s.Hg <= 25 && c.r.inRange && c.r.now.P >= 150,
    progress: (c) => `caída ${es(c.s.Hg, 0)} m, ${TURBINES[c.s.turbine].name.split(' (')[0]} ${c.r.inRange ? 'sirve' : 'no sirve'}, ${es(c.r.now.P, 0)} kW`,
  },
  {
    id: 'bo-rio',
    title: 'El río primero',
    goal: 'Deja en el río el 30 % de su caudal mediano o más y logra un factor de planta de 50 % o más.',
    hint: 'El factor de planta compara lo que la central produce en el año con lo que produciría siempre llena. Una turbina más pequeña se llena más días.',
    check: (c) => c.s.eco >= 0.3 && c.r.cf >= 0.5,
    progress: (c) => `se deja ${es(c.s.eco * 100, 0)} %, factor de planta ${es(c.r.cf * 100, 0)} %`,
  },
];

const P_LABEL = (p: number) => (p <= 0.2 ? 'muy lluviosa' : p <= 0.4 ? 'lluviosa' : p < 0.6 ? 'normal' : p < 0.8 ? 'seca' : 'muy seca');

export function CentralLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<HydroScene>(DEFAULT_HYDRO);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const r = useMemo(() => hydroScene(s), [s]);
  const world = useRef<HydroWorld | null>(null);
  const sync = useRef({ s, r });
  sync.current = { s, r };
  const toWorld = () => {
    const { s: x, r: y } = sync.current;
    world.current?.set({ Hg: x.Hg, D: x.D, Qd: x.Qd, Qriver: y.Qriver, Qt: y.Qt, Qeco: y.inp.Qeco, P: y.now.P, turbine: x.turbine, homesNow: y.homesNow, inRange: y.inRange, lossPct: y.lossPct, eta: y.eta });
  };
  useEffect(() => {
    toWorld();
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, r }), [s, r]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<HydroScene>) => setS((x) => ({ ...x, ...p }));
  const T = TURBINES[s.turbine];
  const tone: 'ok' | 'mid' | 'bad' = r.now.P <= 0 ? 'bad' : r.inRange && r.lossPct <= 5 ? 'ok' : 'mid';
  const answer = (
    <>
      {r.now.P > 0 ? (
        <>
          Hoy el río trae {es(r.Qriver, 2)} m³/s y la turbina recibe {es(r.Qt, 2)}: da <strong>{es(r.now.P, 0)} kW</strong>, luz para unos {es(r.homesNow, 0)} hogares.{' '}
        </>
      ) : (
        <>
          Hoy la turbina está <strong>parada</strong>: {r.Qt <= 0 ? 'el río apenas trae el caudal que se deja para los peces y la gente de abajo.' : `le llegan ${es(r.Qt, 2)} m³/s, menos del ${es(T.minFrac * 100, 0)} % de su caudal de diseño que necesita una ${T.name.split(' (')[0]}.`}{' '}
        </>
      )}
      En el año produce {es(r.E, 0)} MWh (factor de planta {es(r.cf * 100, 0)} %), lo que usan unos {es(r.homes, 0)} hogares.{!r.inRange && ` La ${T.name.split(' (')[0]} no es la turbina adecuada para ${es(r.Hn, 0)} m de caída.`}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de un valle de montaña con una pequeña central de pasada: la bocatoma con su azud en el río, el canal por la ladera, la cámara de carga, la tubería de presión que baja hasta la casa de máquinas con la turbina a la vista, la red eléctrica y un pueblo cuyas ventanas se encienden según la energía."
          viewNames={[
            { id: 'general', label: 'El valle' },
            { id: 'bocatoma', label: 'La bocatoma' },
            { id: 'casa', label: 'La turbina' },
            { id: 'pueblo', label: 'El pueblo' },
          ]}
          make={(st) => new HydroWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <HydroSection Hg={s.Hg} P={r.now.P} Qt={r.Qt} />
        </FlatStage>
      )}
      <Question q="¿Cuánta luz da el río?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`${es(r.now.P, 0)} kW ahora`, `${es(r.E, 0)} MWh/año`, `factor ${es(r.cf * 100, 0)} %`]}
        chart={<FdcChart Q50={RIVER_Q50} Qd={s.Qd} Qeco={r.inp.Qeco} p={s.p} />}
        traces={[
          { key: 'p', label: 'Potencia ahora', unit: 'kW', value: r.now.P, digits: 0 },
          { key: 'h', label: 'Hogares con luz ahora', unit: '', value: r.homesNow, digits: 0 },
        ]}
      />
      <DockRange label="Época del año" value={s.p} min={0.05} max={0.95} step={0.05} show={`${P_LABEL(s.p)} · ${es(r.Qriver, 2)} m³/s`} onChange={(v) => set({ p: v })} />
      <DockRange label="Caída bruta" value={s.Hg} min={15} max={300} step={5} show={`${es(s.Hg, 0)} m`} onChange={(v) => set({ Hg: v })} />
      <DockRange label="Caudal de diseño" value={s.Qd} min={0.2} max={3} step={0.1} show={`${es(s.Qd, 1)} m³/s`} onChange={(v) => set({ Qd: v })} />
      <DockRange label="Tubería de presión" value={s.D} min={0.4} max={1.4} step={0.05} show={`${es(s.D, 2)} m`} onChange={(v) => set({ D: v })} />
      <DockRange label="Agua que se deja en el río" value={s.eco} min={0.05} max={0.4} step={0.01} show={`${es(s.eco * 100, 0)} % de la mediana`} onChange={(v) => set({ eco: v })} />
      <DockChoice label="Turbina" value={s.turbine} options={(Object.keys(TURBINES) as Turbine[]).map((k) => ({ value: k, label: TURBINES[k].name.split(' (')[0] }))} onChange={(v) => set({ turbine: v })} />
    </>
  );

  const ps = [0.1, 0.3, 0.5, 0.7, 0.9];
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <HydroSection Hg={s.Hg} P={r.now.P} Qt={r.Qt} W={480} H={220} />
        <h3>Caída por caudal</h3>
        <p>
          La potencia del agua es su peso por segundo multiplicado por la altura que cae: <strong>P = ρ·g·Q·H</strong>. Un metro cúbico por segundo que cae 100 m lleva unos 980 kW; la turbina y el generador convierten cerca del 85 % en electricidad. La tubería de presión le quita algo de altura por fricción: la que queda es la <strong>altura neta</strong>.
        </p>
        <h3>Un río que cambia</h3>
        <p>
          Una central de pasada no guarda agua: genera con lo que el río trae cada día. La <strong>curva de duración</strong> ordena los caudales del año del más alto al más bajo. La central se llena en las épocas de lluvia, trabaja a media carga en las secas y se detiene si le llega muy poca agua. Parte del río se deja pasar siempre por la bocatoma para la vida del río.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la época, la caída, el caudal de diseño, la tubería, la turbina y el agua que se deja en el río. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>La central en cada época</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Época</th>
              <th>Río</th>
              <th>Turbina</th>
              <th>Potencia</th>
            </tr>
          </thead>
          <tbody>
            {ps.map((p) => {
              const x = hydroScene({ ...s, p });
              return (
                <tr key={p} className={Math.abs(p - s.p) < 0.01 ? 'is-on' : ''}>
                  <td>{P_LABEL(p)} ({es(p * 100, 0)} %)</td>
                  <td>{es(fdc(RIVER_Q50, p), 2)} m³/s</td>
                  <td>{es(x.Qt, 2)} m³/s</td>
                  <td>{x.now.P > 0 ? `${es(x.now.P, 0)} kW` : 'parada'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h3>Cada turbina con esta caída y este caudal</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Turbina</th>
              <th>¿Sirve?</th>
              <th>Potencia</th>
              <th>Energía</th>
              <th>Factor</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(TURBINES) as Turbine[]).map((t) => {
              const x = hydroScene({ ...s, turbine: t });
              return (
                <tr key={t} className={t === s.turbine ? 'is-on' : ''}>
                  <td>{TURBINES[t].name.split(' (')[0]}</td>
                  <td>{x.inRange ? 'sí' : `no (${TURBINES[t].H[0]} a ${TURBINES[t].H[1]} m)`}</td>
                  <td>{es(x.P, 0)} kW</td>
                  <td>{es(x.E, 0)} MWh</td>
                  <td>{es(x.cf * 100, 0)} %</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h3>La tubería de presión</h3>
        <table className="q3-table">
          <tbody>
            {[0.5, 0.7, 0.9, 1.1].map((D) => {
              const x = hydroScene({ ...s, D });
              return <Row key={D} name={`${es(D, 2)} m`} value={`pierde ${es(x.lossPct, 1)} %`} note={`${es(x.V, 2)} m/s · ${es(x.P, 0)} kW`} />;
            })}
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="central" set={PUMP_TOOLS.central} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La central (ilustrativa)</caption>
          <tbody>
            <Row name="Río" value={`mediana ${es(RIVER_Q50, 1)} m³/s`} note="curva de duración ilustrativa de un río de montaña" />
            <Row name="Agua que se deja" value={`${es(r.inp.Qeco, 2)} m³/s`} note={`${es(s.eco * 100, 0)} % de la mediana`} />
            <Row name="Tubería de presión" value={`acero, ${es(s.D, 2)} m, ${es(s.Hg * PENSTOCK_RATIO, 0)} m`} note="baja por una ladera de 30°" />
            <Row name="Altura neta con el caudal de diseño" value={`${es(r.Hn, 1)} m`} note={`pierde ${es(r.hf, 2)} m (${es(r.lossPct, 1)} %)`} />
            <Row name="Turbina" value={T.name} note={`de ${T.H[0]} a ${T.H[1]} m y ${T.Q[0]} a ${T.Q[1]} m³/s; para bajo ${es(T.minFrac * 100, 0)} %`} />
            <Row name="Generador" value="95 %" />
            <Row name="Consumo de un hogar" value={`${HOME_KWH_MONTH} kWh/mes`} note={`cada casa de la maqueta son ${HOMES_PER_HOUSE} hogares`} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Potencia hidráulica; altura bruta y neta; pérdidas en la tubería de presión; eficiencia de turbina y generador; tipos de turbina según la caída y el caudal; curva de duración de caudales; energía del año y factor de planta; caudal que se deja en el río.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          P = ρ·g·Q·Hn·ηt·ηg; pérdidas con Darcy-Weisbach más 10 % de locales. Rangos de turbinas y curvas de eficiencia con carga parcial, típicos de las guías de pequeñas centrales (ESHA, <em>Guide on how to develop a small hydropower plant</em>, 2004; Penche, 1998). Curva de duración logística alrededor de la mediana. Pruebas B6 a B8.
        </p>
        <h3>Límites</h3>
        <p>
          Río, central y pueblo ilustrativos: no son un proyecto ni un lugar de Colombia, y el caudal que se deja aquí no es el caudal ambiental de ninguna autoridad. Sin golpe de ariete, sin pérdidas en la red ni variación de la demanda en el día. El valle está a escala; el ancho del agua en la maqueta crece con el caudal, sin exagerar su profundidad.
        </p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

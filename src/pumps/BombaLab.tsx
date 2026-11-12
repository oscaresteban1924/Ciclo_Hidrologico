// «La bomba y la tubería»: una estación sube agua de un tanque de succión a un tanque en lo alto de una loma. La
// bomba da más altura con poco caudal y menos con mucho; la tubería pide más altura cuanto más caudal pasa. Donde
// las dos curvas se cruzan trabaja la bomba. La pregunta: ¿cuánta agua sube, y cuánta energía gasta?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { PumpChart, PumpSection } from './charts';
import { POR, PUMP_TOOLS, ROOM } from './design';
import { ARRANGEMENTS, PUMP, type Arrangement } from './pump';
import { DEFAULT_PUMP, K_FIXED, PUMP_DIAMETERS, PUMP_L, pumpScene, throttleVsSpeed, type PumpScene } from './scene';
import { StationWorld } from './three/pumpWorlds';

type R = ReturnType<typeof pumpScene>;
interface Ctx {
  s: PumpScene;
  r: R;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'bo-mejor',
    title: 'En su mejor punto',
    goal: 'Logra que la bomba trabaje con 76 % de eficiencia o más subiendo 45 L/s o más.',
    hint: 'La bomba rinde más cerca de su caudal de diseño (55 L/s). Una tubería más ancha frena menos el agua.',
    check: (c) => c.r.flows && c.r.eta >= 0.76 && c.r.Q >= 45,
    progress: (c) => `${es(c.r.Q, 1)} L/s con ${es(c.r.eta * 100, 1)} % de eficiencia`,
  },
  {
    id: 'bo-no-llega',
    title: 'Gira, pero no llega',
    goal: 'Encuentra una combinación con la que el motor gira y el agua no alcanza a llegar al tanque.',
    hint: 'Con caudal cero la bomba da su altura máxima. Si el tanque está más alto, el agua no sube.',
    check: (c) => !c.r.flows,
    progress: (c) => (c.r.flows ? `todavía sube ${es(c.r.Q, 1)} L/s` : 'no llega'),
  },
  {
    id: 'bo-alto',
    title: 'Más alto',
    goal: 'Con el tanque a 45 m o más de altura, sube 50 L/s o más.',
    hint: 'Dos bombas en serie suman sus alturas con el mismo caudal.',
    check: (c) => c.s.Hs >= 45 && c.r.flows && c.r.Q >= 50,
    progress: (c) => `tanque a ${es(c.s.Hs, 0)} m, ${c.r.flows ? `${es(c.r.Q, 1)} L/s` : 'no llega'}`,
  },
  {
    id: 'bo-ahorro',
    title: 'Gasta menos',
    goal: 'Sube 40 L/s o más gastando 0,115 kWh por metro cúbico o menos.',
    hint: 'La energía se va en subir el agua y en vencer la fricción de la tubería. Una tubería ancha pierde menos; la válvula cerrada desperdicia.',
    check: (c) => c.r.flows && c.r.Q >= 40 && c.r.e <= 0.115,
    progress: (c) => (c.r.flows ? `${es(c.r.Q, 1)} L/s con ${es(c.r.e, 3)} kWh/m³` : 'no llega'),
  },
];

export function BombaLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<PumpScene>(DEFAULT_PUMP);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const r = useMemo(() => pumpScene(s), [s]);
  const world = useRef<StationWorld | null>(null);
  const sync = useRef({ s, r });
  sync.current = { s, r };
  const toWorld = () => {
    const { s: x, r: y } = sync.current;
    world.current?.set({ Q: y.Q, H: y.H, Hs: x.Hs, D: y.D, Dname: y.Dname, arr: x.arr, n: x.n, open: x.open, eta: y.eta, Pshaft: Number.isFinite(y.Pshaft) ? y.Pshaft : 0, V: y.V, flows: y.flows, pOut: y.pOut });
  };
  useEffect(() => {
    toWorld();
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, r }), [s, r]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<PumpScene>) => setS((x) => ({ ...x, ...p }));
  const per = s.arr === 'paralelo' ? r.Q / 2 : r.Q;
  const ratio = per / (PUMP.Qbep * s.n);
  const tone: 'ok' | 'mid' | 'bad' = !r.flows ? 'bad' : ratio >= POR[0] && ratio <= POR[1] ? 'ok' : 'mid';
  const answer = r.flows ? (
    <>
      La bomba sube <strong>{es(r.Q, 1)} L/s</strong> dando {es(r.H, 1)} m: {es(s.Hs, 0)} m para subir el agua y {es(r.hf + r.hm, 1)} m para vencer la fricción
      {s.open < 0.999 ? ' y la válvula' : ''}. Trabaja con {es(r.eta * 100, 0)} % de eficiencia, pide {es(r.Pshaft, 1)} kW y gasta {es(r.e, 3)} kWh por metro cúbico
      {ratio < POR[0] ? ', lejos de su mejor caudal (le falta caudal).' : ratio > POR[1] ? ', lejos de su mejor caudal (va forzada).' : ', cerca de su mejor punto.'}
    </>
  ) : (
    <>
      El agua <strong>no llega</strong>: con caudal cero {s.arr === 'una' ? 'la bomba da' : 'las bombas dan'} {es(r.pOut, 1)} m y el tanque está a {es(s.Hs, 0)} m. El motor gira, pero el agua solo se calienta dentro de la bomba.
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una estación de bombeo: un tanque de succión enterrado, la casa de bombas con una o dos bombas centrífugas, sus motores, válvulas y manómetros, y la tubería que sube una loma hasta un tanque alto. Unas flechas claras avanzan por la tubería a la velocidad del agua."
          viewNames={[
            { id: 'general', label: 'La loma' },
            { id: 'bombas', label: 'Las bombas' },
            { id: 'tanque', label: 'El tanque alto' },
          ]}
          make={(st) => new StationWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <PumpSection Hs={s.Hs} Q={r.Q} Hd={r.H} flows={r.flows} arr={s.arr} />
        </FlatStage>
      )}
      <Question q="¿Cuánta agua sube la bomba, y cuánta energía gasta?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={r.flows ? [`${es(r.Q, 1)} L/s`, `${es(r.H, 1)} m`, `eficiencia ${es(r.eta * 100, 0)} %`] : ['0 L/s', `cierra en ${es(r.pOut, 1)} m`, 'no llega']}
        chart={<PumpChart arr={s.arr} n={s.n} sys={r.sys} Q={r.Q} Hd={r.H} flows={r.flows} />}
        traces={[
          { key: 'p', label: 'Potencia en el eje', unit: 'kW', value: r.flows ? r.Pshaft : 0, digits: 1 },
          { key: 'e', label: 'Energía por metro cúbico', unit: 'kWh/m³', value: r.flows ? r.e : 0, digits: 3 },
        ]}
      />
      <DockRange label="Velocidad del motor" value={s.n} min={0.6} max={1.2} step={0.01} show={`${es(s.n * 100, 0)} % · ${es(1750 * s.n, 0)} rpm`} onChange={(v) => set({ n: v })} />
      <DockRange label="Altura del tanque" value={s.Hs} min={10} max={50} step={1} show={`${es(s.Hs, 0)} m`} onChange={(v) => set({ Hs: v })} />
      <DockRange label="Válvula de descarga" value={s.open} min={0.1} max={1} step={0.05} show={`${es(s.open * 100, 0)} % abierta`} onChange={(v) => set({ open: v })} />
      <DockChoice label="Tubería" value={String(s.d)} options={PUMP_DIAMETERS.map((d, k) => ({ value: String(k), label: `${d.name} PVC` }))} onChange={(v) => set({ d: Number(v) })} />
      <DockChoice label="Bombas" value={s.arr} options={(Object.keys(ARRANGEMENTS) as Arrangement[]).map((k) => ({ value: k, label: ARRANGEMENTS[k] }))} onChange={(v) => set({ arr: v })} />
    </>
  );

  const speeds = [0.7, 0.8, 0.9, 1, 1.1];
  const target = r.flows ? Math.round(r.Q * 0.7) : 0;
  const tv = r.flows ? throttleVsSpeed(s, target) : null;
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <PumpSection Hs={s.Hs} Q={r.Q} Hd={r.H} flows={r.flows} arr={s.arr} W={480} Ht={220} />
        <h3>Dos curvas que se cruzan</h3>
        <p>
          La <strong>curva de la bomba</strong> dice cuánta altura le da al agua según el caudal: mucha con poco caudal y cada vez menos con más caudal. La <strong>curva de la tubería</strong> dice cuánta altura hace falta: la del tanque más la que se pierde por fricción, que crece con el cuadrado de la velocidad. La bomba trabaja donde las dos se cruzan: el <strong>punto de operación</strong>.
        </p>
        <h3>Velocidad, válvula y dos bombas</h3>
        <p>
          Un variador cambia la velocidad del motor: el caudal cambia en proporción, la altura con el cuadrado y la potencia con el cubo (leyes de afinidad). Cerrar la válvula también baja el caudal, pero desperdicia la energía que frena. Dos bombas <strong>en serie</strong> suman sus alturas; <strong>en paralelo</strong> suman sus caudales.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la velocidad, la altura del tanque, la válvula, la tubería y las bombas. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Leyes de afinidad: la velocidad del motor</h3>
        <p className="q3-small">Con esta tubería y este tanque. Con el tanque alto, bajar la velocidad baja mucho el caudal: la altura de la bomba cae con el cuadrado.</p>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Velocidad</th>
              <th>Caudal</th>
              <th>Altura</th>
              <th>Eficiencia</th>
              <th>Potencia</th>
              <th>kWh/m³</th>
            </tr>
          </thead>
          <tbody>
            {speeds.map((n) => {
              const x = pumpScene({ ...s, n });
              return (
                <tr key={n} className={Math.abs(n - s.n) < 0.005 ? 'is-on' : ''}>
                  <td>{es(n * 100, 0)} %</td>
                  <td>{x.flows ? `${es(x.Q, 1)} L/s` : 'no llega'}</td>
                  <td>{x.flows ? `${es(x.H, 1)} m` : '—'}</td>
                  <td>{x.flows ? `${es(x.eta * 100, 0)} %` : '—'}</td>
                  <td>{x.flows ? `${es(x.Pshaft, 1)} kW` : '—'}</td>
                  <td>{x.flows ? es(x.e, 3) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h3>Bajar el caudal: válvula o variador</h3>
        {tv ? (
          <>
            <p className="q3-small">Para bajar de {es(pumpScene({ ...s, n: 1, open: 1 }).Q, 1)} a {es(target, 0)} L/s con esta tubería:</p>
            <table className="q3-table">
              <tbody>
                <Row name="Cerrando la válvula" value={`abierta al ${es(tv.open * 100, 0)} %`} note={`${es(tv.valve.Pshaft, 1)} kW · ${es(tv.valve.e, 3)} kWh/m³`} />
                <Row name="Con el variador" value={`${es(tv.n * 100, 0)} % de la velocidad`} note={`${es(tv.speed.Pshaft, 1)} kW · ${es(tv.speed.e, 3)} kWh/m³`} />
                <Row name="Ahorro del variador" value={`${es(tv.saving * 100, 0)} %`} />
              </tbody>
            </table>
          </>
        ) : (
          <p className="q3-small">Con la válvula y la velocidad actuales no se puede comparar: abre la válvula y deja que el agua llegue.</p>
        )}
        <h3>Una, dos en serie o dos en paralelo</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Bombas</th>
              {PUMP_DIAMETERS.map((d) => (
                <th key={d.name}>{d.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(ARRANGEMENTS) as Arrangement[]).map((a) => (
              <tr key={a} className={a === s.arr ? 'is-on' : ''}>
                <td>{ARRANGEMENTS[a]}</td>
                {PUMP_DIAMETERS.map((d, k) => {
                  const x = pumpScene({ ...s, arr: a, d: k });
                  return <td key={d.name} className={k === s.d && a === s.arr ? 'is-on' : ''}>{x.flows ? `${es(x.Q, 0)} L/s` : 'no llega'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="q3-small">En una tubería estrecha (mucha fricción), la serie rinde más; en una ancha, el paralelo.</p>
      </div>
    ),
    diseno: <DesignTab part="bomba" set={PUMP_TOOLS.bomba} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La estación (ilustrativa; curva típica de catálogo)</caption>
          <tbody>
            <Row name="Bomba" value={`${es(PUMP.H0, 0)} m a caudal cero`} note={`mejor punto ${es(PUMP.Qbep, 0)} L/s con ${es(PUMP.etaMax * 100, 0)} %, ${es(PUMP.N0, 0)} rpm`} />
            <Row name="Tubería de impulsión" value={`PVC ${r.Dname}, ${PUMP_L} m`} note={`diámetro interno ${es(r.D * 1000, 0)} mm`} />
            <Row name="Pérdidas locales" value={`K = ${es(K_FIXED, 1)} + válvula ${es(r.valveK, 1)}`} note="entrada, cuatro codos, retención y salida" />
            <Row name="Velocidad en la tubería" value={`${es(r.V, 2)} m/s`} />
            <Row name="Fricción y pérdidas locales" value={`${es(r.hf, 2)} m + ${es(r.hm, 2)} m`} />
            <Row name="Agua" value="20 °C" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Curva de una bomba y curva del sistema; punto de operación; eficiencia y potencia; energía por metro cúbico; leyes de afinidad y variadores de velocidad; bombas en serie y en paralelo; por qué estrangular con una válvula desperdicia energía.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Curva parabólica H = H0 − a·Q² y eficiencia parabólica alrededor del mejor punto; leyes de afinidad (Karassik y otros, <em>Pump Handbook</em>, 2008). Pérdidas con Darcy-Weisbach y el factor de Swamee-Jain (Saldarriaga, 2007). Punto de operación por bisección. Pruebas B1 a B3 y B9.
        </p>
        <h3>Límites</h3>
        <p>
          Bomba ilustrativa (no de un fabricante). Las leyes de afinidad valen para cambios moderados de velocidad. Sin golpe de ariete, sin arranques y paradas, sin variación del nivel de los tanques. La tubería real de 450 m se acorta en la maqueta; las alturas son reales.
        </p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

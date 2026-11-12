// «El medidor en la tubería»: un Venturi y una placa de orificio estrechan el paso; el agua se acelera, la presión
// baja y la diferencia que marcan los piezómetros dice el caudal. La pregunta: ¿cuánta agua pasa, y qué cuesta
// medirla?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { PiezoChart } from './charts';
import { MEASURE_TOOLS, ROOM } from './design';
import { C_VENTURI, meterDp } from './measure';
import { DEFAULT_PIPE, LAB_D, LAB_PATM_M, PV_M, READ_RES, pipeScene, type PipeScene } from './scene';
import { MeterWorld } from './three/measureWorlds';

type R = ReturnType<typeof pipeScene>;
interface Ctx {
  s: PipeScene;
  r: R;
}

/** El mismo β sirve todo el día si a 2 L/s se lee 4 cm o más y a 15 L/s no pasa de 3,5 m. */
const dhAt = (beta: number, Q: number) => meterDp('venturi', Q / 1000, LAB_D, beta).dh;

const RETOS: Reto<Ctx>[] = [
  {
    id: 'me-lectura',
    title: 'Lectura clara',
    goal: 'Con 2 L/s o menos, logra que la lectura del Venturi deje una incertidumbre de 0,5 % o menos en el caudal.',
    hint: 'La regla se lee al milímetro: una diferencia pequeña se lee mal. Una garganta más estrecha da más diferencia.',
    check: (c) => c.s.Q <= 2 && c.r.uv <= 0.005,
    progress: (c) => `${es(c.s.Q, 1)} L/s, lectura ${es(c.r.v.dh * 1000, 0)} mm, incertidumbre ${es(c.r.uv * 100, 2)} %`,
  },
  {
    id: 'me-energia',
    title: 'Medir sin gastar',
    goal: 'Con 10 L/s o más, logra que la placa de orificio pierda 0,5 m o menos de energía.',
    hint: 'La placa no recupera la presión como el Venturi. Un orificio más grande frena menos el agua.',
    check: (c) => c.s.Q >= 10 && c.r.o.loss <= 0.5,
    progress: (c) => `${es(c.s.Q, 1)} L/s, la placa pierde ${es(c.r.o.loss, 2)} m`,
  },
  {
    id: 'me-rango',
    title: 'Un medidor para todo el día',
    goal: 'Elige un β con el que el Venturi lea 4 cm o más con 2 L/s y no más de 3,5 m con 15 L/s.',
    hint: 'La lectura crece con el cuadrado del caudal: entre 2 y 15 L/s cambia unas 56 veces.',
    check: (c) => dhAt(c.s.beta, 2) >= 0.04 && dhAt(c.s.beta, 15) <= 3.5,
    progress: (c) => `con β = ${es(c.s.beta, 2)}: ${es(dhAt(c.s.beta, 2) * 1000, 0)} mm a 2 L/s y ${es(dhAt(c.s.beta, 15), 2)} m a 15 L/s`,
  },
  {
    id: 'me-garganta',
    title: 'La garganta hierve',
    goal: 'Encuentra un caudal, un β y una presión con los que el agua hierve en la garganta del Venturi.',
    hint: 'En la garganta la velocidad es máxima y la presión mínima. Si baja hasta la presión de vapor, el agua hierve (como en la sala de bombas).',
    check: (c) => c.r.cavV,
    progress: (c) => `presión en la garganta ${es(c.r.throatAbs, 2)} m absolutos (hierve a ${es(PV_M, 2)})`,
  },
];

export function MedidorLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<PipeScene>(DEFAULT_PIPE);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const r = useMemo(() => pipeScene(s), [s]);
  const world = useRef<MeterWorld | null>(null);
  const sync = useRef({ s, r });
  sync.current = { s, r };
  const toWorld = () => {
    const { s: x, r: y } = sync.current;
    world.current?.set({ Q: x.Q, beta: x.beta, H: x.H, piezo: y.piezo, dhV: y.v.dh, dhO: y.o.dh, Qv: y.Qv, Qo: y.Qo, cavV: y.cavV, cavO: y.cavO, lossV: y.v.loss, lossO: y.o.loss, V1: y.Vel });
  };
  useEffect(() => {
    toWorld();
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, r }), [s, r]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<PipeScene>) => setS((x) => ({ ...x, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.cavV || r.cavO ? 'bad' : r.warnV.length || r.warnO.length ? 'mid' : 'ok';
  const answer = (
    <>
      Pasan <strong>{es(s.Q, 1)} L/s</strong>. En el Venturi el agua pasa de {es(r.v.V1, 2)} a {es(r.v.V2, 2)} m/s y la presión baja {es(r.v.dh * 1000, 0)} mm: con esa lectura se calculan {es(r.Qv, 2)} L/s. La placa marca {es(r.o.dh * 1000, 0)} mm ({es(r.Qo, 2)} L/s), pero pierde {es(r.o.loss, 2)} m de energía; el Venturi, solo {es(r.v.loss, 2)} m.
      {r.cavV || r.cavO ? ` ${r.cavV ? 'En la garganta' : 'Tras el orificio'} la presión baja hasta la de vapor: el agua hierve.` : ''}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de un banco de tuberías de laboratorio: un tanque elevado alimenta una tubería de acrílico con un Venturi y una placa de orificio; seis piezómetros de vidrio frente a una regla muestran cómo baja la presión en la garganta y en el orificio; partículas blancas se aceleran al pasar por el estrechamiento y el agua termina en un tanque de aforo que se llena."
          viewNames={[
            { id: 'banco', label: 'El banco' },
            { id: 'venturi', label: 'El Venturi' },
            { id: 'placa', label: 'La placa' },
          ]}
          make={(st) => new MeterWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <PiezoChart p={r.piezo} beta={s.beta} W={520} H={240} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Cuánta agua pasa por la tubería, y qué cuesta medirla?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`Venturi ${es(r.v.dh * 1000, 0)} mm`, `placa ${es(r.o.dh * 1000, 0)} mm`, `${es(s.Q, 1)} L/s`]}
        chart={<PiezoChart p={r.piezo} beta={s.beta} />}
        traces={[
          { key: 'lv', label: 'Pierde el Venturi', unit: 'm', value: r.v.loss, digits: 2 },
          { key: 'lo', label: 'Pierde la placa', unit: 'm', value: r.o.loss, digits: 2 },
        ]}
      />
      <DockRange label="Caudal" value={s.Q} min={1} max={20} step={0.5} show={`${es(s.Q, 1)} L/s`} onChange={(v) => set({ Q: v })} />
      <DockRange label="Razón de diámetros β" value={s.beta} min={0.4} max={0.75} step={0.01} show={`${es(s.beta, 2)} · ${es(s.beta * LAB_D * 1000, 0)} mm`} onChange={(v) => set({ beta: v })} />
      <DockRange label="Presión en la tubería" value={s.H} min={1} max={10} step={0.5} show={`${es(s.H, 1)} m de agua`} onChange={(v) => set({ H: v })} />
    </>
  );

  const Qs = [2, 5, 8, 12, 16, 20];
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <PiezoChart p={r.piezo} beta={s.beta} W={480} H={220} cls="hc-exp-svg cu-svg" />
        <h3>Estrechar para medir</h3>
        <p>
          Por la misma tubería pasa siempre el mismo caudal: donde el paso es más angosto, el agua va más rápido. Con la <strong>ecuación de Bernoulli</strong>, lo que gana en velocidad lo pierde en presión. Los piezómetros muestran esa diferencia; con ella, la razón de diámetros β y un coeficiente medido en laboratorio, se calcula el caudal.
        </p>
        <h3>Venturi o placa</h3>
        <p>
          El <strong>Venturi</strong> tiene un cono de entrada y uno de salida largo que devuelve casi toda la presión. La <strong>placa de orificio</strong> es un disco con un agujero: es barata y fácil de cambiar, pero el chorro sale contraído, se arremolina y se pierde buena parte de la energía para siempre.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el caudal, la razón de diámetros y la presión. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Lectura y caudal</h3>
        <p className="q3-small">Con β = {es(s.beta, 2)}. La lectura crece con el cuadrado del caudal.</p>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Caudal</th>
              <th>Venturi</th>
              <th>Placa</th>
              <th>C de la placa</th>
              <th>Pérdidas</th>
            </tr>
          </thead>
          <tbody>
            {Qs.map((q) => {
              const v = meterDp('venturi', q / 1000, LAB_D, s.beta), o = meterDp('orificio', q / 1000, LAB_D, s.beta);
              return (
                <tr key={q} className={Math.abs(q - s.Q) < 0.01 ? 'is-on' : ''}>
                  <td>{q} L/s</td>
                  <td>{es(v.dh * 1000, 0)} mm</td>
                  <td>{es(o.dh * 1000, 0)} mm</td>
                  <td>{es(o.C, 4)}</td>
                  <td>
                    {es(v.loss, 2)} / {es(o.loss, 2)} m
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h3>La lectura de hoy</h3>
        <table className="q3-table">
          <tbody>
            <Row name="Venturi: lectura al milímetro" value={`${es(r.rv * 1000, 0)} mm → ${es(r.Qv, 3)} L/s`} note={`incertidumbre ${es(r.uv * 100, 2)} %`} />
            <Row name="Placa: lectura al milímetro" value={`${es(r.ro * 1000, 0)} mm → ${es(r.Qo, 3)} L/s`} note={`incertidumbre ${es(r.uo * 100, 2)} %; C = ${es(r.o.C, 4)}`} />
            <Row name="Número de Reynolds" value={es(r.ReD, 0)} />
            <Row name="Presión en la garganta" value={`${es(r.throatAbs, 2)} m absolutos`} note={`atmósfera de Medellín ${es(LAB_PATM_M, 2)} m; vapor ${es(PV_M, 2)} m`} />
            <Row name="Fuera de norma" value={[...r.warnV.map((w) => `Venturi: ${w}`), ...r.warnO.map((w) => `placa: ${w}`)].join('; ') || 'no'} />
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="medidor" set={MEASURE_TOOLS.medidor} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El banco (ilustrativo)</caption>
          <tbody>
            <Row name="Tubería" value={`${es(LAB_D * 1000, 0)} mm de acrílico`} note="agua a 20 °C" />
            <Row name="Venturi" value={`garganta de ${es(s.beta * LAB_D * 1000, 1)} mm`} note={`C = ${C_VENTURI} (convergente mecanizado); pérdida cercana al 10 % de la lectura`} />
            <Row name="Placa de orificio" value={`orificio de ${es(s.beta * LAB_D * 1000, 1)} mm`} note="tomas en las esquinas; C de Reader-Harris/Gallagher" />
            <Row name="Regla de los piezómetros" value={`al ${es(READ_RES * 1000, 0)} mm`} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Continuidad y Bernoulli; línea piezométrica y de energía; medidores de presión diferencial; coeficiente de descarga y número de Reynolds; pérdida permanente; rango de medida e incertidumbre de lectura; presión negativa y cavitación en una garganta.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Q = C/√(1 − β⁴)·(π·d²/4)·√(2·g·Δh), con C del Venturi clásico (ISO 5167-4) y de la placa con tomas en las esquinas por la ecuación de Reader-Harris/Gallagher (ISO 5167-2), y la pérdida permanente de la placa con su fórmula de la norma. Fricción de la tubería entre tomas con un factor típico. Pruebas M7 y M8.
        </p>
        <h3>Límites</h3>
        <p>El Venturi se usa también por debajo del Reynolds de su norma (se avisa). Sin la corrección de tubos menores de 71 mm, sin efectos de instalación (codos cerca) ni incertidumbre del coeficiente. El tanque elevado y el banco son ilustrativos.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

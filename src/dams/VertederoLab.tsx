// «El vertedero»: el agua pasa sobre una cresta de perfil WES, baja por la rápida y llega al pie con mucha velocidad.
// Un pozo de disipación la frena con un resalto hidráulico. La pregunta: ¿queda el resalto dentro del pozo, o se sale y
// erosiona el río?

import { useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import { DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { tiny } from './fmt';
import { SpillChart } from './charts';
import { DAM_TOOLS, HD_MAX, ROOM } from './design';
import { GAMMA_W, G, stillingBasin } from './dam';
import { SPILL, spillScene, tailwater, type SpillScene } from './scene';
import { SpillWorld } from './three/damWorlds';

type Spill = ReturnType<typeof spillScene>;

interface Ctx {
  s: SpillScene & { D: number };
  v: Spill;
}

/** Pérdida de energía en el resalto (m): (y2 − y1)³/(4·y1·y2). */
const lossJump = (y1: number, y2: number) => Math.pow(y2 - y1, 3) / (4 * y1 * y2);

const RETOS: Reto<Ctx>[] = [
  {
    id: 'pv-pozo',
    title: 'El resalto, dentro del pozo',
    goal: 'Con la carga de diseño (H igual a Hd, de 3 m o más), profundiza el pozo hasta que el resalto quede dentro.',
    hint: 'El agua del río por sí sola no alcanza la profundidad conjugada: hundir el piso le suma esa altura.',
    check: (c) => Math.abs(c.v.ratio - 1) <= 0.05 && c.s.H >= 3 && c.v.inBasin,
    progress: (c) => `H/Hd = ${es(c.v.ratio, 2)}; el agua sobre el piso es ${es(c.v.tw + c.s.D, 2)} m de ${es(c.v.y2, 2)} m`,
  },
  {
    id: 'pv-estable',
    title: 'Un resalto estable',
    goal: 'Logra un resalto dentro del pozo con un número de Froude al pie entre 4,5 y 9.',
    hint: 'Con poca carga el chorro es delgado y muy rápido (Froude alto). Con más caudal por metro de cresta, el Froude baja.',
    check: (c) => c.v.F1 >= 4.5 && c.v.F1 <= 9 && c.v.inBasin,
    progress: (c) => `Froude ${es(c.v.F1, 1)}; resalto ${c.v.inBasin ? 'dentro' : 'fuera'} del pozo`,
  },
  {
    id: 'pv-creciente',
    title: 'La creciente de diseño',
    goal: `Pasa 1 500 m³/s o más sin superar ${es(HD_MAX, 2)} veces la carga de diseño y con el resalto en el pozo.`,
    hint: 'Más ancho de cresta o más carga de diseño. El pozo tendrá que bajar.',
    check: (c) => c.v.Q >= 1500 && c.v.ratio <= HD_MAX && c.v.inBasin,
    progress: (c) => `${es(c.v.Q, 0)} m³/s; H/Hd = ${es(c.v.ratio, 2)}`,
  },
  {
    id: 'pv-cavita',
    title: 'Más allá de la carga de diseño',
    goal: `Encuentra una carga con la que la lámina se despegaría de la cresta (H/Hd mayor de ${es(HD_MAX, 2)}).`,
    hint: 'El perfil WES sigue la forma del chorro con la carga de diseño. Con mucha más carga, el chorro «vuela» sobre la cresta y la presión bajo él se vuelve negativa: riesgo de cavitación.',
    check: (c) => c.v.ratio > HD_MAX,
    progress: (c) => `H/Hd = ${es(c.v.ratio, 2)}`,
  },
];

export function VertederoLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<SpillScene & { D: number }>({ H: 3, Hd: 4, L: 30, D: 0 });
  const [tab, setTab] = useState<PanelTab>('esquema');
  const v = useMemo(() => spillScene(s), [s]);
  const world = useRef<SpillWorld | null>(null);
  const state = { H: s.H, Hd: s.Hd, q: v.q, y1: v.y1, y2: v.y2, tw: v.tw, D: s.D, P: SPILL.P };
  const sync = useRef(state);
  sync.current = state;
  useEffect(() => {
    world.current?.set(sync.current);
  }, [v, s.D, s.Hd, s.H]);
  const ctx = useMemo<Ctx>(() => ({ s, v }), [s, v]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<SpillScene & { D: number }>) => setS((x) => ({ ...x, ...p }));
  const dE = lossJump(v.y1, v.y2);
  const power = (GAMMA_W * v.Q * dE) / 1000; // MW
  const over = v.ratio > HD_MAX;
  const tone: 'ok' | 'mid' | 'bad' = !v.inBasin ? 'bad' : over ? 'mid' : 'ok';
  const answer = (
    <>
      Pasan <strong>{es(v.Q, 0)} m³/s</strong> ({es(v.q, 1)} m³/s por metro de cresta). Al pie el agua llega a {es(v.V1, 1)} m/s con {es(v.y1, 2)} m de profundidad (Froude {es(v.F1, 1)}). El resalto necesita {es(v.y2, 2)} m de agua y el río da {es(v.tw, 2)} m
      {s.D > 0 ? ` más ${es(s.D, 1)} m del pozo` : ''}: {v.inBasin ? <>el resalto <strong>queda dentro del pozo</strong> y disipa {es(power, 0)} MW.</> : <>el resalto <strong>se sale del pozo</strong> y el chorro rápido llega al lecho del río.</>}
      {over ? ` La carga es ${es(v.ratio, 2)} veces la de diseño: riesgo de presiones negativas en la cresta.` : ''}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de un vertedero de concreto: el agua pasa sobre la cresta, baja por la rápida, llega al pozo de disipación y forma un resalto con espuma antes de seguir por el río."
          viewNames={[
            { id: 'general', label: 'El vertedero' },
            { id: 'cresta', label: 'La cresta' },
            { id: 'pozo', label: 'El pozo' },
          ]}
          make={(st) => new SpillWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <SpillChart H={s.H} Hd={s.Hd} q={v.q} y1={v.y1} y2={v.y2} tw={v.tw} D={s.D} P={SPILL.P} W={520} Ht={240} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Queda el resalto dentro del pozo, o se sale y erosiona el río?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`${es(v.Q, 0)} m³/s`, `Froude ${es(v.F1, 1)}`, v.inBasin ? 'resalto en el pozo' : 'el resalto se sale']}
        chart={<SpillChart H={s.H} Hd={s.Hd} q={v.q} y1={v.y1} y2={v.y2} tw={v.tw} D={s.D} P={SPILL.P} />}
        traces={[
          { key: 'w', label: 'Agua sobre el piso del pozo', unit: 'm', value: v.tw + s.D, digits: 2, ref: { value: v.y2, label: 'y2 del resalto' } },
          { key: 'v', label: 'Velocidad al pie', unit: 'm/s', value: v.V1, digits: 1 },
        ]}
      />
      <DockRange label="Agua sobre la cresta" value={s.H} min={0.5} max={8} step={0.1} show={`${es(s.H, 1)} m`} onChange={(x) => set({ H: x })} />
      <DockRange label="Carga de diseño del perfil" value={s.Hd} min={1} max={6} step={0.1} show={`${es(s.Hd, 1)} m`} onChange={(x) => set({ Hd: x })} />
      <DockRange label="Ancho de la cresta" value={s.L} min={10} max={80} step={1} show={`${es(s.L, 0)} m`} onChange={(x) => set({ L: x })} />
      <DockRange label="Profundidad del pozo" value={s.D} min={0} max={8} step={0.1} show={`${es(s.D, 1)} m`} onChange={(x) => set({ D: x })} />
    </>
  );

  // experimentos: el resalto por energía y por cantidad de movimiento, y el pozo necesario para distintas cargas
  const E1 = v.y1 + (v.V1 * v.V1) / (2 * G);
  const V2 = v.q / v.y2;
  const E2 = v.y2 + (V2 * V2) / (2 * G);
  const M1 = (v.q * v.q) / (G * v.y1) + (v.y1 * v.y1) / 2;
  const M2 = (v.q * v.q) / (G * v.y2) + (v.y2 * v.y2) / 2;
  const heads = [1, 2, 3, 4, 5, 6, 7, 8].map((H) => {
    const q = spillScene({ ...s, H, D: 0 }).q;
    // profundidad del pozo para tw + D = 1,1·y2 (se itera: al bajar el piso crece la caída)
    let D = 0;
    for (let k = 0; k < 40; k++) D = Math.max(0, 1.1 * stillingBasin(q, SPILL.P + D, H).y2 - tailwater(q));
    const sb = stillingBasin(q, SPILL.P + D, H);
    return { H, q, D, F1: sb.F1, Lb: sb.Lb };
  });

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <SpillChart H={s.H} Hd={s.Hd} q={v.q} y1={v.y1} y2={v.y2} tw={v.tw} D={s.D} P={SPILL.P} W={480} Ht={210} cls="hc-exp-svg cu-svg" />
        <h3>La cresta</h3>
        <p>
          El perfil de la cresta copia la cara inferior del chorro que saltaría sobre una pared delgada con la <strong>carga de diseño</strong> Hd (perfil WES: x^1,85 = 2·Hd^0,85·y). Con esa carga la lámina se apoya sin empujar ni succionar. Con menos carga el coeficiente baja un poco; con mucha más, la lámina tiende a despegarse y la presión bajo ella se vuelve negativa.
        </p>
        <h3>El pozo</h3>
        <p>
          Al pie de la rápida casi toda la caída se volvió velocidad. Un <strong>resalto hidráulico</strong> la convierte en profundidad y disipa energía en remolinos. Para que se forme dentro del pozo, el agua del río sobre el piso debe alcanzar la profundidad conjugada y2; si no alcanza, el resalto se corre aguas abajo y el chorro rápido erosiona el lecho.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la carga, la cresta y el pozo. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>El resalto, por energía y por cantidad de movimiento</h3>
        <p className="q3-small">En el resalto se conserva la cantidad de movimiento (por eso vale Bélanger), no la energía: la diferencia es lo que el pozo disipa.</p>
        <table className="q3-table">
          <tbody>
            <Row name="Fuerza específica antes / después" value={`${es(M1, 3)} / ${es(M2, 3)} m²`} note={`diferencia ${tiny(Math.abs(M1 - M2) / M1)}`} />
            <Row name="Energía antes / después" value={`${es(E1, 2)} / ${es(E2, 2)} m`} />
            <Row name="Pérdida E1 − E2" value={`${es(E1 - E2, 3)} m`} />
            <Row name="Pérdida por fórmula (y2 − y1)³/(4·y1·y2)" value={`${es(dE, 3)} m`} note={`diferencia ${tiny(Math.abs(E1 - E2 - dE) / Math.max(1e-9, dE))}`} />
            <Row name="Potencia que disipa el pozo, γ·Q·ΔE" value={`${es(power, 1)} MW`} />
          </tbody>
        </table>
        <h3>¿Cuánto hay que hundir el pozo?</h3>
        <p className="q3-small">Con la cresta y el ancho actuales, para cada carga: profundidad del pozo para tener 1,1·y2 de agua sobre el piso, largo (≈ 6·y2) y Froude al pie.</p>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Carga</th>
              <th>q</th>
              <th>Pozo</th>
              <th>Largo</th>
              <th>Froude</th>
            </tr>
          </thead>
          <tbody>
            {heads.map((h) => (
              <tr key={h.H} className={Math.abs(h.H - s.H) < 0.05 ? 'is-on' : ''}>
                <td>{h.H} m</td>
                <td>{es(h.q, 1)} m²/s</td>
                <td>{es(h.D, 2)} m</td>
                <td>{es(h.Lb, 0)} m</td>
                <td>{es(h.F1, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="vertedero" set={DAM_TOOLS.vertedero} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El vertedero (ilustrativo)</caption>
          <tbody>
            <Row name="Altura de la cresta sobre el lecho del río" value={`${SPILL.P} m`} />
            <Row name="Rápida" value={`talud ${es(SPILL.m, 2)}:1 (H:V)`} />
            <Row name="Coeficiente con la carga de diseño" value={`${es(SPILL.C, 2)}`} note={`ahora ${es(v.C, 3)} con H/Hd = ${es(v.ratio, 2)}`} />
            <Row name="Río aguas abajo" value={`Manning n = ${SPILL.n}, pendiente ${SPILL.S}`} note="cauce ancho" />
            <Row name="Largo del pozo" value={`${es(v.Lb, 1)} m`} note="≈ 6·y2 (USBR tipo I)" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>La ecuación del vertedero de cresta; el perfil WES y la carga de diseño; la energía al pie de una rápida; el resalto hidráulico (Bélanger) y la pérdida de energía; el agua del río como condición de borde del pozo; por qué se profundiza un pozo.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Perfil WES del U.S. Army Corps of Engineers; coeficiente con cargas distintas de la de diseño por un ajuste potencial aproximado a la curva del USBR (Design of Small Dams). Velocidad al pie sin pérdidas en la rápida (cota superior). Profundidades conjugadas de Bélanger y largo del pozo USBR tipo I ≈ 6·y2 (Chow, 1959, cap. 15; Peterka, 1978). Río aguas abajo con Manning en cauce ancho. Prueba D3.
        </p>
        <h3>Límites</h3>
        <p>No se modelan las pérdidas ni el aire en la rápida, los bloques del pozo (USBR tipo II, III o IV) ni las presiones sobre la cresta; el criterio H/Hd ≤ 1,33 es una regla usual, no un cálculo de cavitación. El vertedero es ilustrativo.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

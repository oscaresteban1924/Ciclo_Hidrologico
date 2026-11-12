// «La red del barrio»: nueve esquinas en una ladera, alimentadas por un tanque en la loma. El estudiante cambia la
// hora del día (la demanda), el nivel del tanque y cierra tubos; la red se resuelve con el método del gradiente y se
// puede seguir Hardy Cross paso a paso. La pregunta: ¿les llega el agua con buena presión a todas las casas, a toda hora?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { ConvergenceChart, DayChart } from './charts';
import { NetMap } from './diagrams';
import { P_MIN, P_STATIC_MAX, ROOM, SUPPLY_TOOLS } from './design';
import { hardyCross, solveGradient, type NetSolution } from './network';
import { CLOSABLE, barrio, dayFactor } from './scene';
import { NetWorld } from './three/netWorld';

interface RInput {
  H0: number;
  hour: number;
  closed: string;
  pob: 'mayor' | 'menor';
}

interface Ctx {
  inp: RInput;
  sol: NetSolution;
  day: number[];
  stat: number;
  hcIt: number;
  hcDiff: number;
}

const freeIds = (sol: NetSolution) => Object.keys(sol.p).filter((k) => k !== 'T');
const minP = (sol: NetSolution) => Math.min(...freeIds(sol).map((k) => (Number.isFinite(sol.p[k]) ? sol.p[k] : -Infinity)));

const RETOS: Reto<Ctx>[] = [
  {
    id: 'ac-norma',
    title: 'Todo el día dentro de la norma',
    goal: 'Escoge el nivel del tanque para que, a toda hora, la presión más baja cumpla el Art. 61 y la estática más alta no pase de 50 m (Art. 62).',
    hint: 'La gráfica de los instrumentos muestra la presión más baja hora a hora. Con el tanque más alto sube todo; con el tanque más bajo, la hora pico se queda corta.',
    check: (c) => c.inp.closed === '' && Math.min(...c.day) >= P_MIN(c.inp.pob) && c.stat <= P_STATIC_MAX,
    progress: (c) => `Mínima del día ${es(Math.min(...c.day), 1)} m; estática ${es(c.stat, 1)} m`,
  },
  {
    id: 'ac-pico',
    title: 'La hora más difícil',
    goal: 'Pon la hora en la que la presión más baja de la red es la menor del día.',
    hint: 'Es cuando más agua se consume. Mira la curva de los instrumentos.',
    check: (c) => c.inp.hour === c.day.indexOf(Math.min(...c.day)),
    progress: (c) => `A las ${c.inp.hour} h: ${es(c.day[c.inp.hour], 1)} m`,
  },
  {
    id: 'ac-malla',
    title: 'Otro camino para el agua',
    goal: 'Cierra un tubo de la red (no la matriz) a la hora pico y comprueba que todas las esquinas siguen con agua y con la presión del Art. 61.',
    hint: 'En una red en malla el agua llega por más de un camino: por eso se diseñan así. Necesitas el tanque lo bastante alto.',
    check: (c) => c.inp.closed !== '' && c.inp.closed !== 'P0' && c.sol.cut.length === 0 && c.day[c.inp.hour] === Math.min(...c.day) && minP(c.sol) >= P_MIN(c.inp.pob),
    progress: (c) => (c.inp.closed && c.inp.closed !== 'P0' ? `Presión más baja ${es(minP(c.sol), 1)} m` : 'Cierra un tubo con el control del pie.'),
  },
  {
    id: 'ac-hardy',
    title: 'Hardy Cross a mano',
    goal: 'En Experimentos, avanza Hardy Cross iteración por iteración hasta que sus caudales queden a menos de 0,01 L/s de los del método del gradiente.',
    hint: 'Cada iteración corrige el caudal de cada malla para que las pérdidas de su recorrido sumen cero.',
    check: (c) => c.hcIt > 0 && c.hcDiff < 0.01,
    progress: (c) => (c.hcIt ? `${c.hcIt} iteraciones: diferencia ${es(c.hcDiff, 4)} L/s` : 'Empieza en Experimentos.'),
  },
];

export function RedLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [inp, setInp] = useState<RInput>({ H0: 66, hour: 12, closed: '', pob: 'mayor' });
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [hcIt, setHcIt] = useState(0);
  const net = useMemo(() => barrio(inp.H0, inp.closed || null), [inp.H0, inp.closed]);
  const fac = dayFactor(inp.hour);
  const sol = useMemo(() => solveGradient(net, fac), [net, fac]);
  const day = useMemo(() => Array.from({ length: 24 }, (_, h) => minP(solveGradient(net, dayFactor(h)))), [net]);
  const stat = Math.max(...net.nodes.filter((n) => n.id !== 'T').map((n) => inp.H0 - n.z));
  const hc = useMemo(() => (hcIt > 0 ? hardyCross(net, fac, 0, hcIt) : null), [net, fac, hcIt]);
  const hcDiff = hc ? Math.max(...net.pipes.map((p) => Math.abs(hc.Q[p.id] - sol.Q[p.id]))) : Infinity;
  useEffect(() => setHcIt(0), [net, fac]);
  const req = P_MIN(inp.pob);
  const world = useRef<NetWorld | null>(null);
  const sync = useRef({ net, sol, req });
  sync.current = { net, sol, req };
  useEffect(() => world.current?.set(sync.current.net, sync.current.sol, sync.current.req), [net, sol, req]);
  const ctx = useMemo<Ctx>(() => ({ inp, sol, day, stat, hcIt, hcDiff }), [inp, sol, day, stat, hcIt, hcDiff]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<RInput>) => setInp((x) => ({ ...x, ...p }));
  const pm = minP(sol);
  const worst = freeIds(sol).reduce((a, k) => (sol.p[k] < sol.p[a] || !Number.isFinite(sol.p[k]) ? k : a), freeIds(sol)[0]);
  const out = net.pipes.filter((p) => p.a === 'T' || p.b === 'T').reduce((a, p) => a + Math.abs(sol.Q[p.id]), 0);
  const tone: 'ok' | 'mid' | 'bad' = sol.cut.length || pm < req ? 'bad' : stat > P_STATIC_MAX ? 'mid' : 'ok';
  const answer = sol.cut.length ? (
    <>Con la matriz cerrada, ninguna esquina recibe agua: todo el barrio depende de ese tubo.</>
  ) : (
    <>
      A las {inp.hour} h el barrio consume {es(out, 1)} L/s ({es(fac, 2)} veces el promedio). La presión más baja es <strong>{es(pm, 1)} m</strong>, en la esquina {worst}: {pm >= req ? 'cumple' : 'no cumple'} los {req} m del Art. 61. Sin consumo, la presión estática más alta sería {es(stat, 1)} m: {stat <= P_STATIC_MAX ? 'cumple' : 'pasa'} los 50 m del Art. 62.
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Barrio ilustrativo en 3D en una ladera: nueve esquinas unidas por tubos bajo las calles y un tanque en la loma. Los tubos cambian de color con la velocidad del agua y unas flechas avanzan en el sentido del caudal; en cada esquina una columna de vidrio muestra la presión como altura de agua."
          viewNames={[
            { id: 'general', label: 'El barrio' },
            { id: 'tanque', label: 'El tanque' },
            { id: 'arriba', label: 'Desde arriba' },
          ]}
          make={(st) => new NetWorld(st, barrio(66))}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current.net, sync.current.sol, sync.current.req);
          }}
        />
      ) : (
        <FlatStage>
          <NetMap net={net} sol={sol} req={req} />
        </FlatStage>
      )}
      <Question q="¿Les llega el agua con buena presión a todas las casas, a toda hora?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`presión más baja ${es(pm, 1)} m`, `estática ${es(stat, 1)} m`, `salen ${es(out, 1)} L/s`]}
        chart={<DayChart pmin={day} stat={stat} req={req} hour={inp.hour} />}
        traces={[
          { key: 'p', label: 'Presión más baja', unit: 'm', value: Number.isFinite(pm) ? pm : 0, digits: 1, ref: { value: req, label: `mínima ${req} m` } },
          { key: 'q', label: 'Sale del tanque', unit: 'L/s', value: out, digits: 1 },
        ]}
      />
      <DockRange label="Hora del día" value={inp.hour} min={0} max={23} step={1} show={`${inp.hour}:00 · ×${es(fac, 2)}`} onChange={(v) => set({ hour: v })} />
      <DockRange label="Agua en el tanque" value={inp.H0} min={40} max={75} step={0.5} show={`${es(inp.H0, 1)} m`} onChange={(v) => set({ H0: v })} />
      <DockChoice<string> label="Válvula cerrada" value={inp.closed} options={[{ value: '', label: 'Ninguna' }, ...CLOSABLE.map((c) => ({ value: c.id, label: c.short }))]} onChange={(v) => set({ closed: v })} />
      <DockChoice<'mayor' | 'menor'> label="Población de diseño" value={inp.pob} options={[{ value: 'mayor', label: 'Más de 12 500' }, { value: 'menor', label: 'Hasta 12 500' }]} onChange={(v) => set({ pob: v })} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <NetMap net={net} sol={sol} req={req} />
        <h3>Una red en malla</h3>
        <p>
          Los tubos del barrio forman mallas: cada esquina recibe agua por más de un camino. El caudal de cada tubo se reparte solo, de modo que en cada esquina entra lo que sale más lo que se consume, y en cada malla las pérdidas de un lado y del otro se igualan. Si se cierra un tubo para repararlo, el agua sigue llegando por los demás.
        </p>
        <h3>Presión de día y de noche</h3>
        <p>De noche casi no se consume: el agua va despacio, casi no pierde energía y la presión es la más alta (la estática). En la hora pico pasa mucha agua, las pérdidas crecen y la presión baja. El RAS pide al menos 15 m de presión en la red (10 m en poblaciones pequeñas) y no más de 50 m estáticos.</p>
        <p className="q3-small">Los tubos se dibujan más gruesos que los reales y las flechas van seis veces más rápido que el agua; las columnas de presión van a escala.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la hora, el tanque y las válvulas, y sigue Hardy Cross. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Hardy Cross, paso a paso</h3>
        <p className="q3-small">Se empieza con caudales que cumplen la continuidad pero no la energía. En cada iteración, cada una de las {hc?.loops.length ?? 4} mallas corrige su caudal con ΔQ = −Σh/(1,852·Σ|h/Q|). Se compara con el método del gradiente, que resuelve todo a la vez.</p>
        <div className="hc-read">
          <button type="button" className="btn btn-primary" onClick={() => setHcIt((k) => k + 1)}>
            Una iteración más
          </button>
          <button type="button" className="btn-ghost" onClick={() => setHcIt((k) => k + 5)}>
            Cinco más
          </button>
          {hcIt > 0 && (
            <button type="button" className="btn-ghost" onClick={() => setHcIt(0)}>
              Empezar de nuevo
            </button>
          )}
        </div>
        {hc && (
          <>
            <ConvergenceChart history={hc.history} />
            <p className={hcDiff < 0.01 ? 'q3-progress is-ok' : 'q3-progress'}>
              {hcIt} iteraciones: la mayor diferencia con el método del gradiente es {es(hcDiff, 5)} L/s. El gradiente convergió en {sol.iterations} iteraciones.
            </p>
          </>
        )}
        <h3>Balance de la red</h3>
        <table className="q3-table">
          <tbody>
            <Row name="Sale del tanque" value={`${es(out, 3)} L/s`} />
            <Row name="Consumen las esquinas" value={`${es(net.nodes.reduce((a, n) => a + n.q * fac, 0), 3)} L/s`} />
            <Row name="Mayor desbalance en una esquina" value={`${sol.massErr.toExponential(1)} L/s`} />
            <Row name="Mayor desbalance de energía en un tubo" value={`${sol.energyErr.toExponential(1)} m`} />
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="red" set={SUPPLY_TOOLS.red} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>Esquinas a las {inp.hour} h</caption>
          <thead>
            <tr>
              <th />
              <th>Cota</th>
              <th>Consumo</th>
              <th>Presión</th>
              <th>Estática</th>
            </tr>
          </thead>
          <tbody>
            {net.nodes.filter((n) => n.id !== 'T').map((n) => (
              <tr key={n.id}>
                <th>{n.id}</th>
                <td>{es(n.z, 1)} m</td>
                <td>{es(n.q * fac, 2)} L/s</td>
                <td>{Number.isFinite(sol.p[n.id]) ? `${es(sol.p[n.id], 2)} m` : 'sin agua'}</td>
                <td>{es(inp.H0 - n.z, 1)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="q3-table">
          <caption>Tubos (Hazen-Williams, C = 140)</caption>
          <thead>
            <tr>
              <th />
              <th>Tramo</th>
              <th>Diámetro</th>
              <th>Caudal</th>
              <th>Velocidad</th>
              <th>Pérdida</th>
            </tr>
          </thead>
          <tbody>
            {net.pipes.map((p) => (
              <tr key={p.id}>
                <th>{p.id}</th>
                <td>
                  {p.a}–{p.b}, {p.L} m
                </td>
                <td>{es(p.D * 1000, 0)} mm</td>
                <td>{p.closed ? 'cerrado' : `${es(Math.abs(sol.Q[p.id]), 2)} L/s`}</td>
                <td>{es(sol.V[p.id], 2)} m/s</td>
                <td>{es(Math.abs(sol.h[p.id]), 2)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Continuidad en los nudos y energía en las mallas; redes en malla contra ramificadas; la variación de la demanda en el día y su efecto en la presión; las presiones mínima y máxima del RAS (Arts. 61 y 62); la sectorización; Hardy Cross y el método del gradiente.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Hazen-Williams en cada tubo. Método del gradiente de Todini y Pilati (1988), el de EPANET (Rossman, 2000), y Hardy Cross (1936) sobre las mallas fundamentales de un árbol de expansión. Resolución 0330 de 2017 (RAS): Art. 61, presión dinámica mínima de 15 m (10 m hasta 12 500 habitantes); Art. 62, presión estática máxima de 50 m en sistemas nuevos u optimizados. La curva de consumo del día es ilustrativa (promedio 1, pico de 1,6). Pruebas A5 a A7.
        </p>
        <h3>Límites</h3>
        <p>El barrio, sus cotas y consumos son ilustrativos: no es una red de Medellín. Las demandas se concentran en las esquinas; no hay fugas, bombas ni válvulas reductoras. El parágrafo del Art. 61 (hasta 10 % del área con una presión algo menor) no se aplica.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

// «La mancha»: una fuga de combustible 300 m aguas arriba de un pozo de abastecimiento. El agua subterránea arrastra
// la mancha (advección) y la extiende (dispersión); el pozo atrae el agua de su zona de captura. La pregunta: ¿llega la
// mancha al pozo? ¿Cuándo y cuánto?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { BreakthroughChart, PlumeMap } from './charts';
import { GROUND_TOOLS, ROOM } from './design';
import { captureZone, rand, stepParticles, type FlowField, type Particle } from './aquifer';
import { PLUME, plumeQ, plumeV, type PlumeScene } from './scene';
import { PlumeWorld } from './three/groundWorlds';

const NP = 600, DT = 5, TEND = PLUME.years * 365;

interface Run {
  s: PlumeScene;
  frac: number;
  first: number | null;
}

interface Ctx {
  s: PlumeScene;
  width: number;
  runs: Run[];
  row: { theory: number; measured: number } | null;
}

const field = (s: PlumeScene): FlowField => ({ v: plumeV(), well: s.Qls > 0 ? { x: 0, y: 0, Q: s.Qls * 86.4, b: PLUME.b, ne: PLUME.ne } : null });
const widthOf = (Qls: number) => (Qls > 0 ? captureZone(Qls * 86.4, PLUME.b, plumeQ()).width : 0);

const RETOS: Reto<Ctx>[] = [
  {
    id: 'as-salva',
    title: 'Lejos del pozo',
    goal: 'Con el pozo bombeando 5 L/s o más, ubica la fuga de modo que menos de 1 % de la mancha llegue al pozo en ocho años.',
    hint: 'La línea roja punteada es el borde de la zona de captura: el agua de adentro termina en el pozo.',
    check: (c) => c.runs.some((r) => r.s.Qls >= 5 && r.frac < 0.01),
  },
  {
    id: 'as-bombeo',
    title: 'Bombear sin traer la mancha',
    goal: 'Con la fuga a 100 m o más del eje, encuentra un caudal de 2 L/s o más con el que menos de 1 % de la mancha llegue al pozo.',
    hint: 'El ancho de la zona de captura crece con el caudal: Q/(b·q). La dispersión ensancha la mancha: deja margen.',
    check: (c) => c.runs.some((r) => Math.abs(r.s.y0) >= 100 && r.s.Qls >= 2 && r.frac < 0.01),
  },
  {
    id: 'as-fila',
    title: 'El ancho de la zona de captura',
    goal: 'En Experimentos, suelta una fila de partículas sin dispersión: el ancho que termina en el pozo debe quedar a menos de 10 % del de la teoría.',
    hint: 'Es un experimento: solo hay que lanzarlo y comparar.',
    check: (c) => !!c.row && c.row.theory > 0 && Math.abs(c.row.measured - c.row.theory) / c.row.theory < 0.1,
  },
  {
    id: 'as-dispersion',
    title: 'La dispersión la acerca',
    goal: 'Con la fuga fuera de la zona de captura (más allá de la mitad de su ancho) y una dispersividad de 15 m o más, logra que algo de la mancha (más de 1 %) llegue al pozo.',
    hint: 'La dispersión abre la mancha hacia los lados mientras viaja. Pon la fuga cerca del borde.',
    check: (c) => c.runs.some((r) => r.s.aL >= 15 && Math.abs(r.s.y0) > widthOf(r.s.Qls) / 2 && r.frac > 0.01),
  },
];

export function ManchaLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<PlumeScene>({ Qls: 5, y0: 120, aL: 5 });
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [runs, setRuns] = useState<Run[]>([]);
  const [row, setRow] = useState<Ctx['row']>(null);
  const [tick, setTick] = useState(0);
  const sim = useRef<{ ps: Particle[]; t: number; series: { t: number; f: number }[]; playing: boolean; first: number | null; R: ReturnType<typeof rand> }>({ ps: [], t: 0, series: [], playing: false, first: null, R: rand(1) });
  const world = useRef<PlumeWorld | null>(null);
  const sRef = useRef(s);
  sRef.current = s;
  const width = widthOf(s.Qls);
  const frac = () => sim.current.ps.length ? sim.current.ps.filter((p) => p.caught >= 0).length / sim.current.ps.length : 0;
  const push = () => world.current?.set(sRef.current.Qls, sRef.current.y0, sim.current.ps, sim.current.t, frac());
  // al cambiar los datos se reinicia la fuga
  useEffect(() => {
    sim.current = { ps: [], t: 0, series: [], playing: false, first: null, R: rand(1) };
    push();
    setTick((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  const start = () => {
    const R = rand(Math.round(Math.abs(s.y0) * 7 + s.Qls * 13 + s.aL * 31) + 3);
    const ps: Particle[] = Array.from({ length: NP }, () => ({ x: PLUME.x0 + R.n() * 4, y: s.y0 + R.n() * 4, caught: -1 }));
    sim.current = { ps, t: 0, series: [{ t: 0, f: 0 }], playing: true, first: null, R };
    setTick((k) => k + 1);
  };
  // reloj: ocho años en 24 s
  useEffect(() => {
    if (!sim.current.playing) return;
    let raf = 0, last = performance.now(), acc = 0, shown = 0;
    const fld = field(sRef.current);
    const loop = (now: number) => {
      const c = sim.current;
      acc += ((Math.min(0.1, (now - last) / 1000) * TEND) / 24);
      last = now;
      while (acc >= DT && c.t < TEND) {
        stepParticles(c.ps, fld, sRef.current.aL, sRef.current.aL / 10, DT, c.t + DT, c.R, 4);
        c.t += DT;
        acc -= DT;
        const f = frac();
        if (f > 0 && c.first === null) c.first = c.t;
        if (c.t % 30 === 0) c.series.push({ t: c.t, f });
      }
      world.current?.update();
      if (now - shown > 120) {
        shown = now;
        push();
        setTick((k) => k + 1);
      }
      if (c.t >= TEND) {
        c.playing = false;
        c.series.push({ t: c.t, f: frac() });
        push();
        setRuns((x) => [...x, { s: sRef.current, frac: frac(), first: c.first }].slice(-12));
        setTick((k) => k + 1);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // el bucle empieza con cada fuga nueva
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.current.playing, tick === 0]);
  void tick;
  const c = sim.current;
  const f = frac();
  const ctx = useMemo<Ctx>(() => ({ s, width, runs, row }), [s, width, runs, row]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<PlumeScene>) => setS((x) => ({ ...x, ...p }));
  const inside = Math.abs(s.y0) < width / 2;
  const last = runs.length ? runs[runs.length - 1] : null;
  const tone: 'ok' | 'mid' | 'bad' = inside ? 'bad' : Math.abs(s.y0) < width / 2 + 3 * Math.sqrt(2 * (s.aL / 10) * 300) ? 'mid' : 'ok';
  const answer = (
    <>
      El agua subterránea avanza {es(plumeV(), 2)} m por día hacia el pozo. Con {es(s.Qls, 1)} L/s, el pozo atrae el agua de una franja de <strong>{es(width, 0)} m</strong> de ancho; la fuga, a {es(Math.abs(s.y0), 0)} m del eje, queda {inside ? 'adentro: la mancha termina en el pozo' : 'afuera'}.{' '}
      {c.t > 0 ? `Año ${es(c.t / 365, 1)}: ha llegado ${es(f * 100, 0)} % de la mancha${c.first !== null ? `; la primera traza llegó en el año ${es(c.first / 365, 1)}` : ''}.` : last ? `En la última simulación llegó ${es(last.frac * 100, 0)} %.` : 'Simula la fuga para verla viajar.'}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una llanura vista desde arriba: a la izquierda una estación de combustible con una fuga, a la derecha la casa de un pozo de abastecimiento. Las flechas azules marcan el sentido del agua subterránea; la línea roja punteada es el borde de la zona de captura del pozo. La mancha, que va bajo tierra, se dibuja encima como puntos morados que viajan en cámara rápida."
          viewNames={[
            { id: 'general', label: 'La llanura' },
            { id: 'arriba', label: 'Desde arriba' },
            { id: 'pozo', label: 'El pozo' },
          ]}
          make={(st) => new PlumeWorld(st)}
          onReady={(w) => {
            world.current = w;
            push();
          }}
        />
      ) : (
        <FlatStage>
          <PlumeMap Qls={s.Qls} y0={s.y0} ps={c.ps} />
        </FlatStage>
      )}
      <Question q="¿Llega la mancha al pozo? ¿Cuándo y cuánto?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const center = c.ps.filter((p) => p.caught < 0);
  const cx = center.length ? center.reduce((a, p) => a + p.x, 0) / center.length : PLUME.x0;
  const cy = center.length ? center.reduce((a, p) => a + p.y, 0) / center.length : s.y0;
  const dock = (
    <>
      <LiveHud
        head={[`zona de captura ${es(width, 0)} m`, `llegó ${es(f * 100, 0)} %`, `año ${es(c.t / 365, 1)}`]}
        chart={<BreakthroughChart series={c.series} tNow={c.t > 0 ? c.t : null} />}
        traces={[
          { key: 'f', label: 'Parte que llegó al pozo', unit: '%', value: f * 100, digits: 1 },
          { key: 'd', label: 'Distancia del centro de la mancha al pozo', unit: 'm', value: Math.hypot(cx, cy), digits: 0 },
        ]}
      />
      <div className="hc-flood">
        {c.playing ? (
          <span className="hc-flood-q">año {es(c.t / 365, 1)}</span>
        ) : (
          <button type="button" onClick={start} title="Ocho años de viaje en unos 24 s">
            Simular la fuga
          </button>
        )}
      </div>
      <DockRange label="Caudal del pozo" value={s.Qls} min={0} max={10} step={0.5} show={`${es(s.Qls, 1)} L/s`} onChange={(v) => set({ Qls: v })} />
      <DockRange label="Distancia de la fuga al eje" value={s.y0} min={0} max={220} step={5} show={`${es(s.y0, 0)} m`} onChange={(v) => set({ y0: v })} />
      <DockRange label="Dispersividad longitudinal" value={s.aL} min={1} max={20} step={1} show={`${es(s.aL, 0)} m`} onChange={(v) => set({ aL: v })} />
    </>
  );

  const runRow = () => {
    const fld = field({ ...s, aL: 0 });
    const ys = Array.from({ length: 81 }, (_, k) => -240 + k * 6);
    const ps: Particle[] = ys.map((y) => ({ x: -540, y, caught: -1 }));
    const R = rand(5);
    for (let k = 0; k < 4000 && ps.some((p) => p.caught < 0 && p.x < 300); k++) stepParticles(ps, fld, 0, 0, 2, k * 2, R, 3);
    const got = ys.filter((_, k) => ps[k].caught >= 0);
    setRow({ theory: width, measured: got.length ? got[got.length - 1] - got[0] + 6 : 0 });
  };

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <PlumeMap Qls={s.Qls} y0={s.y0} ps={c.ps} />
        <h3>Advección y dispersión</h3>
        <p>
          Una sustancia disuelta viaja con el agua subterránea (<strong>advección</strong>) y además se extiende, porque el agua no va igual de rápido por todos los poros (<strong>dispersión</strong>). Una mancha pequeña se vuelve larga en el sentido del flujo y algo más ancha hacia los lados. La dispersividad longitudinal αL mide cuánto se estira; la transversal suele ser diez veces menor.
        </p>
        <h3>La zona de captura de un pozo</h3>
        <p>Un pozo que bombea atrae el agua de una franja aguas arriba, de ancho Q/(b·q). Toda el agua que pasa por ahí termina en el pozo, y con ella lo que traiga. Por eso alrededor de los pozos de abastecimiento se protege el suelo: no se permiten fugas, rellenos ni vertimientos.</p>
        <p className="q3-small">La mancha va bajo tierra; en la escena se dibuja sobre el suelo para verla, en cámara rápida (ocho años en unos 24 s).</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Mueve la fuga, cambia el caudal y la dispersividad, y simula. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Una fila de partículas</h3>
        <p className="q3-small">Se sueltan 81 partículas en una fila transversal, lejos aguas arriba, sin dispersión. Las que terminan en el pozo marcan el ancho de la zona de captura; la teoría dice Q/(b·q).</p>
        <div className="hc-read">
          <button type="button" className="btn btn-primary" onClick={runRow} disabled={s.Qls <= 0}>
            Soltar la fila
          </button>
        </div>
        {row && (
          <p className={row.theory > 0 && Math.abs(row.measured - row.theory) / row.theory < 0.1 ? 'q3-progress is-ok' : 'q3-progress'}>
            Terminaron en el pozo las partículas de una franja de {es(row.measured, 0)} m (con la separación de 6 m entre partículas); la teoría da {es(row.theory, 0)} m.
          </p>
        )}
        <h3>Simulaciones hechas</h3>
        {runs.length ? (
          <ul className="q3-small">
            {runs.slice(-6).map((r, i) => (
              <li key={i}>
                {es(r.s.Qls, 1)} L/s, fuga a {es(Math.abs(r.s.y0), 0)} m, αL {es(r.s.aL, 0)} m: llegó {es(r.frac * 100, 1)} %{r.first !== null ? `, desde el año ${es(r.first / 365, 1)}` : ''}.
              </li>
            ))}
          </ul>
        ) : (
          <p className="q3-small">Usa «Simular la fuga» al pie de la escena.</p>
        )}
      </div>
    ),
    diseno: <DesignTab part="mancha" set={GROUND_TOOLS.mancha} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El acuífero y la fuga (ilustrativos)</caption>
          <tbody>
            <Row name="Acuífero" value={`arena gruesa, ${PLUME.b} m de espesor`} note={`K = ${PLUME.K} m/día; ne = ${PLUME.ne}`} />
            <Row name="Gradiente regional" value={es(PLUME.i, 3)} note={`q = ${es(plumeQ(), 3)} m/día; v = ${es(plumeV(), 3)} m/día`} />
            <Row name="Fuga" value={`${Math.abs(PLUME.x0)} m aguas arriba, a ${es(Math.abs(s.y0), 0)} m del eje`} note={`${NP} partículas, una sola vez`} />
            <Row name="Dispersividades" value={`αL = ${es(s.aL, 0)} m, αT = ${es(s.aL / 10, 1)} m`} />
            <Row name="Zona de captura" value={`ancho ${es(width, 0)} m`} note={s.Qls > 0 ? `estancamiento ${es(width / (2 * Math.PI), 0)} m aguas abajo` : 'el pozo no bombea'} />
            <Row name="Sin bombeo, la fuga llegaría al eje del pozo en" value={`${es(Math.abs(PLUME.x0) / plumeV() / 365, 1)} años`} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Transporte de contaminantes en el agua subterránea: advección, dispersión, la forma de una mancha; la zona de captura de un pozo y su protección; por qué una fuga lejana puede llegar años después.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Campo de velocidades: flujo regional uniforme más un pozo que atrae el agua radialmente; partículas con advección (Runge-Kutta de segundo orden) y dispersión por caminata aleatoria (αT = αL/10). Zona de captura de Todd (1980). La caminata se verifica contra la solución con entrada de flujo de van Genuchten y Alves (1982) y Ogata y Banks (1961). Pruebas S6 y S7.
        </p>
        <h3>Límites</h3>
        <p>Contaminante disuelto que no reacciona ni se adsorbe (el combustible real flota y se degrada); acuífero homogéneo; flujo en dos dimensiones. Escena ilustrativa.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

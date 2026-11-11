// «Crecientes y riesgo»: un tramo de río ilustrativo con casas en la llanura. Con una serie de caudales máximos anuales
// (sintética: un río «de verdad» de este juego con media 70 m³/s y desviación 25 m³/s) se ajusta Gumbel, se estima la
// creciente del período de retorno elegido y el agua sube a su nivel. Se simulan muchas vidas útiles para comprobar la
// fórmula del riesgo. La pregunta: ¿hasta dónde sube el río con la creciente de T años, y qué tan seguido pasa?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { GumbelChart } from './charts';
import { RiverSection } from './diagrams';
import { BASIN_TOOLS, ROOM } from './design';
import { gumbelQ, mean, risk, std, syntheticSeries, weibullPositions } from './hydrology';
import { RIVER, bankfullQ, houseWater, riverDepth } from './river';
import { exceedances, simulateLives } from './scene';
import { RiverWorld } from './three/riverWorld';

/** El río «de verdad» del juego (de donde salen las series sintéticas). */
export const TRUTH = { mu: 70, sg: 25 };
const T_OPTS = [2, 5, 10, 25, 50, 100, 200, 500];
const MARK_T = [2, 10, 50, 100];
const LIFE = 50;

interface Ctx {
  years: number;
  T: number;
  fit: { mu: number; sg: number };
  sim: { hit: number; lives: number; T: number };
}

const wetCount = (fit: { mu: number; sg: number }, T: number) => houseWater(riverDepth(gumbelQ(fit.mu, fit.sg, T))).filter((w) => w > 0.05).length;
const q100err = (fit: { mu: number; sg: number }) => (gumbelQ(fit.mu, fit.sg, 100) - gumbelQ(TRUTH.mu, TRUTH.sg, 100)) / gumbelQ(TRUTH.mu, TRUTH.sg, 100);

const RETOS: Reto<Ctx>[] = [
  {
    id: 'cu-casa',
    title: 'La primera casa con agua',
    goal: 'Encuentra el menor período de retorno con el que el agua entra a alguna casa (con el período anterior de la lista, ninguna se moja).',
    hint: 'Sube el período de retorno de uno en uno y mira la vista «Las casas». Depende de la serie: con otra serie el resultado puede cambiar.',
    check: (c) => {
      const i = T_OPTS.indexOf(c.T);
      return i > 0 && wetCount(c.fit, c.T) > 0 && wetCount(c.fit, T_OPTS[i - 1]) === 0;
    },
    progress: (c) => `Con ${c.T} años: ${wetCount(c.fit, c.T)} casas con agua`,
  },
  {
    id: 'cu-corta',
    title: 'Pocos años, mucho error',
    goal: 'Con 15 años de registro o menos, encuentra una serie cuya creciente de 100 años se aleje más de 15 % de la del río «de verdad».',
    hint: 'Baja los años de registro y pide otras series. Con pocos datos, un año raro cambia mucho el ajuste.',
    check: (c) => c.years <= 15 && Math.abs(q100err(c.fit)) > 0.15,
    progress: (c) => `Diferencia de la creciente de 100 años: ${es(q100err(c.fit) * 100, 0)} %`,
  },
  {
    id: 'cu-riesgo',
    title: 'Menos de 10 % en 50 años',
    goal: `Escoge un período de retorno con el que la probabilidad de que se supere al menos una vez en ${LIFE} años sea menor de 10 %.`,
    hint: 'La creciente de 100 años no es «una vez cada 100 años»: en 50 años se supera con casi 40 % de probabilidad.',
    check: (c) => risk(c.T, LIFE) < 0.1,
    progress: (c) => `Con ${c.T} años: ${es(risk(c.T, LIFE) * 100, 1)} %`,
  },
  {
    id: 'cu-simula',
    title: 'La fórmula del riesgo, comprobada',
    goal: `Simula al menos 1 000 vidas de ${LIFE} años con un mismo período de retorno: la fracción de vidas con al menos una creciente mayor debe quedar a menos de 3 puntos de la fórmula.`,
    hint: 'Usa «Simular 500 vidas» en Experimentos varias veces, sin cambiar el período de retorno.',
    check: (c) => c.sim.lives >= 1000 && c.sim.T === c.T && Math.abs(c.sim.hit / c.sim.lives - risk(c.T, LIFE)) < 0.03,
    progress: (c) => (c.sim.lives ? `${c.sim.lives} vidas: ${es((c.sim.hit / c.sim.lives) * 100, 1)} % contra ${es(risk(c.sim.T, LIFE) * 100, 1)} %` : 'Todavía no hay vidas simuladas.'),
  },
];

export function FrecuenciaLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [years, setYears] = useState(30);
  const [T, setT] = useState(100);
  const [seed, setSeed] = useState(1);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [sim, setSim] = useState({ hit: 0, lives: 0, T: 100, n: 0 });
  const [long, setLong] = useState<{ T: number; count: number; every: number } | null>(null);
  const serie = useMemo(() => syntheticSeries(TRUTH.mu, TRUTH.sg, years, seed * 7919), [years, seed]);
  const fit = useMemo(() => ({ mu: mean(serie), sg: std(serie) }), [serie]);
  const pts = useMemo(() => weibullPositions(serie), [serie]);
  const QT = gumbelQ(fit.mu, fit.sg, T);
  const QTtrue = gumbelQ(TRUTH.mu, TRUTH.sg, T);
  const y = riverDepth(QT);
  const water = houseWater(y);
  const wet = water.filter((w) => w > 0.05).length;
  const marks = useMemo(() => MARK_T.map((t) => ({ T: t, y: riverDepth(gumbelQ(fit.mu, fit.sg, t)) })), [fit]);
  const world = useRef<RiverWorld | null>(null);
  const sync = useRef({ y, T, marks });
  sync.current = { y, T, marks };
  useEffect(() => world.current?.setMarks(sync.current.marks), [marks]);
  useEffect(() => world.current?.setLevel(sync.current.y, `Creciente de ${sync.current.T} años`), [y, T]);
  // las vidas simuladas son de un período de retorno: si cambia, empiezan de nuevo
  useEffect(() => setSim((s) => (s.T === T ? s : { hit: 0, lives: 0, T, n: 0 })), [T]);
  const ctx = useMemo<Ctx>(() => ({ years, T, fit, sim }), [years, T, fit, sim]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const R50 = risk(T, LIFE);
  const tone: 'ok' | 'mid' | 'bad' = wet > 0 ? 'bad' : y > RIVER.bank ? 'mid' : 'ok';
  const answer = (
    <>
      Con {years} años de registro, la creciente de {T} años se estima en <strong>{es(QT, 0)} m³/s</strong> (la del río «de verdad» de este juego es {es(QTtrue, 0)} m³/s). El agua sube a {es(y, 2)} m:{' '}
      {y > RIVER.bank ? (wet ? `se sale del cauce y entra a ${wet} de ${water.length} casas.` : 'se sale del cauce y cubre parte de la llanura, sin entrar a las casas.') : 'no se sale del cauce.'} En {LIFE} años, la probabilidad de que se supere al menos una vez es {es(R50 * 100, 0)} %.
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Tramo de río ilustrativo en 3D: el cauce principal con sus orillas y, a cada lado, una llanura con casas a distintas distancias. El agua sube al nivel calculado para la creciente elegida; una regla en la orilla marca los niveles de 2, 10, 50 y 100 años."
          viewNames={[
            { id: 'general', label: 'El río' },
            { id: 'regla', label: 'La regla' },
            { id: 'casas', label: 'Las casas' },
          ]}
          make={(st) => new RiverWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.setMarks(sync.current.marks);
            w.setLevel(sync.current.y, `Creciente de ${sync.current.T} años`);
          }}
        />
      ) : (
        <FlatStage>
          <RiverSection y={y} marks={marks} label={`Creciente de ${T} años`} />
        </FlatStage>
      )}
      <Question q={`¿Hasta dónde sube el río con la creciente de ${T} años, y qué tan seguido pasa?`} answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`Q${T} = ${es(QT, 0)} m³/s`, `nivel ${es(y, 2)} m`, `${wet} casas con agua`]}
        chart={<GumbelChart pts={pts} fit={fit} truth={TRUTH} T={T} W={560} H={210} />}
        traces={[
          { key: 'y', label: 'Nivel del río', unit: 'm', value: y, digits: 2, ref: { value: RIVER.bank, label: 'borde del cauce' } },
          { key: 'q', label: 'Creciente estimada', unit: 'm³/s', value: QT, digits: 0, ref: { value: bankfullQ(), label: 'cauce lleno' } },
        ]}
      />
      <div className="hc-flood">
        <button type="button" onClick={() => setSeed((s) => s + 1)} title="Otra serie sintética con el mismo número de años">
          Otra serie de años
        </button>
        <span className="hc-flood-q">serie n.º {seed}</span>
      </div>
      <DockRange label="Años de registro" value={years} min={10} max={80} step={5} show={`${years} años`} onChange={setYears} />
      <DockChoice<string> label="Período de retorno (años)" value={String(T)} options={T_OPTS.map((t) => ({ value: String(t), label: String(t) }))} onChange={(v) => setT(Number(v))} />
    </>
  );

  const runLives = () => {
    const r = simulateLives(TRUTH.mu, TRUTH.sg, T, LIFE, 500, 1000 + sim.n * 7 + T);
    setSim((s) => (s.T === T ? { hit: s.hit + r.hit, lives: s.lives + r.lives, T, n: s.n + 1 } : { hit: r.hit, lives: r.lives, T, n: 1 }));
  };
  const frac = sim.lives ? sim.hit / sim.lives : 0;
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <RiverSection y={y} marks={marks} label={`Creciente de ${T} años`} />
        <h3>El período de retorno es un promedio, no un calendario</h3>
        <p>
          La creciente de 100 años es la que, en promedio, se supera una vez cada 100 años: cada año tiene 1 % de probabilidad. Puede pasar dos años seguidos o no pasar en dos siglos. Lo que importa para una obra es el <strong>riesgo</strong>: la probabilidad de que se supere al menos una vez durante su vida útil, R = 1 − (1 − 1/T)^n.
        </p>
        <h3>De los registros a la creciente de diseño</h3>
        <p>Con el caudal más alto de cada año se ajusta una distribución de probabilidad (aquí Gumbel, por momentos) y con ella se estima la creciente de cualquier período de retorno. Con pocos años de registro, la estimación de las crecientes raras es muy incierta.</p>
        <GumbelChart pts={pts} fit={fit} truth={TRUTH} T={T} W={480} H={220} />
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia los años de registro, la serie y el período de retorno, y simula. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Simula vidas útiles</h3>
        <p className="q3-small">
          Cada vida son {LIFE} años con caudales máximos al azar del río «de verdad». Se cuenta en cuántas vidas la creciente de {T} años se supera al menos una vez. La fórmula dice {es(R50 * 100, 1)} %.
        </p>
        <div className="hc-read">
          <button type="button" className="btn btn-primary" onClick={runLives}>
            Simular 500 vidas
          </button>
          {sim.lives > 0 && (
            <button type="button" className="btn-ghost" onClick={() => setSim({ hit: 0, lives: 0, T, n: 0 })}>
              Empezar de nuevo
            </button>
          )}
        </div>
        {sim.lives > 0 && (
          <>
            <svg viewBox="0 0 480 54" className="hc-exp-svg" role="img" aria-label={`Simulado ${es(frac * 100, 1)} % contra ${es(R50 * 100, 1)} % de la fórmula.`}>
              <rect x={40} y={10} width={420} height={14} fill="#eef2f5" />
              <rect x={40} y={10} width={420 * frac} height={14} fill="#1f78b4" />
              <line x1={40 + 420 * R50} x2={40 + 420 * R50} y1={4} y2={30} stroke="#c0392b" strokeWidth="2" />
              <text x={40} y={44} className="lz-s" fill="#17324d">0 %</text>
              <text x={460} y={44} className="lz-s" textAnchor="end" fill="#17324d">100 %</text>
              <text x={Math.min(440, Math.max(80, 40 + 420 * R50))} y={44} className="lz-s" textAnchor="middle" fill="#c0392b">fórmula</text>
            </svg>
            <p className={Math.abs(frac - R50) < 0.03 && sim.lives >= 1000 ? 'q3-progress is-ok' : 'q3-progress'}>
              {sim.lives} vidas: en {sim.hit} se superó la creciente de {T} años ({es(frac * 100, 1)} %; la fórmula da {es(R50 * 100, 1)} %).
            </p>
          </>
        )}
        <h3>Diez mil años</h3>
        <p className="q3-small">En un registro simulado de 10 000 años, ¿cada cuánto se supera la creciente de {T} años?</p>
        <div className="hc-read">
          <button type="button" className="btn btn-primary" onClick={() => setLong({ T, ...exceedances(TRUTH.mu, TRUTH.sg, T, 10000, 77 + T) })}>
            Simular 10 000 años
          </button>
        </div>
        {long && (
          <p className="q3-progress">
            La creciente de {long.T} años se superó {long.count} veces: en promedio, una vez cada {Number.isFinite(long.every) ? es(long.every, 1) : '—'} años.
          </p>
        )}
      </div>
    ),
    diseno: <DesignTab part="frecuencia" set={BASIN_TOOLS.frecuencia} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>Crecientes del tramo (ilustrativo)</caption>
          <thead>
            <tr>
              <th>T (años)</th>
              <th>Con la serie</th>
              <th>Río «de verdad»</th>
              <th>Nivel</th>
              <th>Casas con agua</th>
            </tr>
          </thead>
          <tbody>
            {T_OPTS.map((t) => {
              const q = gumbelQ(fit.mu, fit.sg, t), yy = riverDepth(q);
              return (
                <tr key={t} className={t === T ? 'is-on' : ''}>
                  <td>{t}</td>
                  <td>{es(q, 1)} m³/s</td>
                  <td>{es(gumbelQ(TRUTH.mu, TRUTH.sg, t), 1)} m³/s</td>
                  <td>{es(yy, 2)} m</td>
                  <td>{houseWater(yy).filter((w) => w > 0.05).length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <table className="q3-table">
          <caption>La serie y el río</caption>
          <tbody>
            <Row name="Años de registro" value={`${years} (serie n.º ${seed})`} />
            <Row name="Media y desviación de la serie" value={`${es(fit.mu, 1)} y ${es(fit.sg, 1)} m³/s`} note={`río «de verdad»: ${TRUTH.mu} y ${TRUTH.sg} m³/s`} />
            <Row name="Mayor caudal registrado" value={`${es(pts[0].x, 1)} m³/s`} note={`T ≈ ${es(pts[0].T, 0)} años por Weibull`} />
            <Row name="Cauce principal" value={`fondo ${RIVER.b} m, taludes ${es(RIVER.z, 1)}:1, orillas de ${RIVER.bank} m`} note={`n = ${RIVER.n.main}`} />
            <Row name="Llanuras" value={`${RIVER.plain} m a cada lado`} note={`n = ${RIVER.n.plain}; pendiente del río ${es(RIVER.S * 1000, 1)} ‰`} />
            <Row name="Caudal a cauce lleno" value={`${es(bankfullQ(), 0)} m³/s`} />
          </tbody>
        </table>
        <p className="q3-small">Serie (m³/s): {serie.map((x) => es(x, 0)).join(' · ')}</p>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Caudales máximos anuales y posiciones de graficación; el ajuste de Gumbel por momentos y el papel de probabilidad; el período de retorno como promedio; el riesgo en la vida útil y cómo cambia la decisión de diseño; la incertidumbre de extrapolar con registros cortos; la relación entre caudal y nivel en una sección con llanuras.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Gumbel por momentos con K_T = −(√6/π)·(0,5772 + ln(ln(T/(T − 1)))) (Chow, Maidment y Mays, 1988, sec. 12.3); posiciones de Weibull T = (n + 1)/m; riesgo R = 1 − (1 − 1/T)^n. Nivel con la sección dividida: Manning en el cauce y en cada llanura, sin fricción en las interfaces verticales (Chow, 1959, sec. 6-6). Las series son sintéticas, de un Gumbel con media {TRUTH.mu} y desviación {TRUTH.sg} m³/s; las vidas útiles se simulan con el mismo modelo (pruebas C6, C7 y C12).
        </p>
        <h3>Límites</h3>
        <p>El río, sus casas y sus caudales son ilustrativos: no es un pronóstico oficial de inundación ni un mapa de amenaza. Un estudio real usa registros medidos, prueba varias distribuciones, calcula intervalos de confianza y modela el flujo con la topografía levantada.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

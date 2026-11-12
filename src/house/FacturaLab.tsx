// «El medidor y la factura»: el medidor de la calle cuenta cada litro con sus tambores y agujas. La factura cobra
// cargos fijos y el consumo por rangos (básico, complementario y suntuario), con subsidios para los estratos 1 a 3 y
// contribuciones de los estratos 5 y 6. Una fuga escondida se descubre de noche con todo cerrado. La pregunta:
// ¿cuánto se paga por el agua, y por qué?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { BillView } from './charts';
import { HOUSE_TOOLS, ROOM } from './design';
import { BASIC_M3, COMPLEMENTARY_M3, STRATA, TARIFF, bill } from './house';
import { DEFAULT_BILL, START_READING, billScene, type BillScene } from './scene';
import { HouseWorld } from './three/houseWorld';

const TEST_S = 10;
const pesos = (x: number) => `$ ${Math.round(x).toLocaleString('es-CO')}`;
type R = ReturnType<typeof billScene>;
interface Ctx {
  s: BillScene;
  r: R;
  found: boolean;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'ca-noche',
    title: 'La prueba de noche',
    goal: 'Esconde una fuga y descúbrela con la prueba de noche: todo cerrado, el medidor no debería moverse.',
    hint: 'Si con todas las llaves cerradas la estrella del medidor gira o las agujas rojas avanzan, hay una fuga.',
    check: (c) => c.found,
    progress: (c) => (c.found ? 'fuga encontrada' : c.s.leak > 0 ? 'hay una fuga escondida: haz la prueba de noche' : 'no hay fuga escondida'),
  },
  {
    id: 'ca-fugacara',
    title: 'Lo que cuesta una fuga',
    goal: 'Encuentra una fuga que sume $ 30 000 o más a la factura del mes.',
    hint: 'Un litro por hora son 0,72 m³ al mes. La fuga también empuja el consumo a un rango más caro.',
    check: (c) => c.r.leakCost >= 30000,
    progress: (c) => `la fuga cuesta ${pesos(c.r.leakCost)} al mes`,
  },
  {
    id: 'ca-solidaridad',
    title: 'Solidaridad',
    goal: 'Con el mismo consumo básico (13 m³), elige un estrato que pague tres veces o más lo que paga el estrato 1.',
    hint: 'Los estratos 5 y 6 pagan una contribución que ayuda a cubrir los subsidios de los estratos 1, 2 y 3.',
    check: (c) => c.r.ratioVs1 >= 3,
    progress: (c) => `${c.r.stratum.name.toLowerCase()}: ${es(c.r.ratioVs1, 2)} veces el estrato 1`,
  },
  {
    id: 'ca-familia',
    title: 'Familia grande, básico',
    goal: 'Con cinco personas o más, quédate en el consumo básico (13 m³ al mes).',
    hint: 'Trece metros cúbicos al mes son 433 litros al día para toda la casa.',
    check: (c) => c.s.people >= 5 && c.r.m3 <= BASIC_M3,
    progress: (c) => `${c.s.people} personas, ${es(c.r.m3, 1)} m³`,
  },
];

export function FacturaLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<BillScene>(DEFAULT_BILL);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [test, setTest] = useState<number | null>(null);
  const [found, setFound] = useState(false);
  const [result, setResult] = useState<{ a: number; b: number } | null>(null);
  const r = useMemo(() => billScene(s), [s]);
  const world = useRef<HouseWorld | null>(null);
  const sync = useRef({ s, r, test });
  sync.current = { s, r, test };
  const toWorld = () => {
    const { s: x, r: y, test: t } = sync.current;
    const hour = t === null ? 19.5 : t;
    const reading = t === null ? y.end : y.end + (x.leak * t) / 1000;
    world.current?.set({ mode: 'factura', hour, hrs: null, reading, leak: t === null ? 0 : x.leak, people: x.people });
  };
  useEffect(() => {
    toWorld();
    setResult(null);
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const testing = test !== null;
  useEffect(() => {
    if (!testing) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = Math.min(1, (now - t0) / (TEST_S * 1000));
      sync.current.test = t;
      toWorld();
      setTest(t);
      if (t >= 1) {
        const a = sync.current.r.end, b = a + sync.current.s.leak / 1000;
        setResult({ a, b });
        if (sync.current.s.leak > 0) setFound(true);
        setTest(null);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // la prueba empieza al pulsar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testing]);
  useEffect(() => {
    if (test === null) toWorld();
  }, [test]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, r, found }), [s, r, found]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<BillScene>) => setS((x) => ({ ...x, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.m3 <= BASIC_M3 && r.leakM3 === 0 ? 'ok' : r.m3 <= COMPLEMENTARY_M3 ? 'mid' : 'bad';
  const answer = (
    <>
      El medidor pasó de {es(START_READING, 4)} a {es(r.end, 4)} m³: la casa usó <strong>{es(r.m3, 1)} m³</strong> en el mes y paga <strong>{pesos(r.b.total)}</strong> ({pesos(r.b.perM3)} por metro cúbico).{' '}
      {STRATA[s.stratum].f < 0 ? `Como ${STRATA[s.stratum].name.toLowerCase()}, tiene subsidio en los cargos fijos y el consumo básico.` : STRATA[s.stratum].f > 0 ? `Como ${STRATA[s.stratum].name.toLowerCase()}, paga una contribución de solidaridad.` : 'Paga la tarifa sin subsidio ni contribución.'}
      {r.leakM3 > 0 ? ` Una fuga escondida suma ${es(r.leakM3, 1)} m³ y ${pesos(r.leakCost)}.` : ''}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una casa vista desde la calle, con el medidor de agua en su caja del andén. La carátula del medidor muestra los tambores de metros cúbicos, cuatro agujas para las fracciones y una estrella que gira cuando pasa agua."
          viewNames={[
            { id: 'fachada', label: 'La casa' },
            { id: 'medidor', label: 'El medidor' },
          ]}
          make={(st) => new HouseWorld(st, 'factura')}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <BillView m3={r.m3} lines={r.b.lines} total={r.b.total} stratum={r.stratum.name} W={520} H={240} />
        </FlatStage>
      )}
      <Question q="¿Cuánto se paga por el agua, y por qué?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`${es(r.m3, 1)} m³`, pesos(r.b.total), r.leakM3 > 0 ? `fuga ${es(r.leakM3, 1)} m³` : 'sin fuga escondida']}
        chart={<BillView m3={r.m3} lines={r.b.lines} total={r.b.total} stratum={r.stratum.name} cls="hc-hud-svg" />}
        traces={[
          { key: 'p', label: 'Por metro cúbico', unit: '$', value: r.b.perM3, digits: 0 },
          { key: 'f', label: 'Lo que cuesta la fuga', unit: '$', value: r.leakCost, digits: 0 },
        ]}
      />
      <div className="hc-flood">
        {testing ? (
          <span className="hc-flood-q">
            0:{String(Math.floor((test as number) * 60)).padStart(2, '0')} · todo cerrado
          </span>
        ) : (
          <button type="button" onClick={() => setTest(0)} title="Una hora de la madrugada con todas las llaves cerradas">
            Prueba de noche
          </button>
        )}
      </div>
      <DockRange label="Personas" value={s.people} min={1} max={8} step={1} show={String(s.people)} onChange={(v) => set({ people: v })} />
      <DockRange label="Litros por persona al día" value={s.lpd} min={50} max={250} step={5} show={`${es(s.lpd, 0)} L`} onChange={(v) => set({ lpd: v })} />
      <DockRange label="Fuga escondida" value={s.leak} min={0} max={30} step={0.5} show={s.leak > 0 ? `${es(s.leak, 1)} L/h` : 'ninguna'} onChange={(v) => set({ leak: v })} />
      <DockChoice label="Estrato" value={String(s.stratum)} options={[1, 2, 3, 4, 5, 6].map((k) => ({ value: String(k), label: String(k) }))} onChange={(v) => set({ stratum: Number(v) })} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <BillView m3={r.m3} lines={r.b.lines} total={r.b.total} stratum={r.stratum.name} W={480} H={230} />
        <h3>Leer el medidor</h3>
        <p>
          Los <strong>tambores</strong> cuentan metros cúbicos enteros (1 m³ = 1 000 litros). Las agujas cuentan fracciones: la primera, décimas (100 L); la segunda, centésimas (10 L); las rojas, litros y décimas de litro. La <strong>estrella</strong> gira con cualquier paso de agua: si gira con todo cerrado, hay una fuga.
        </p>
        <h3>La factura</h3>
        <p>
          Se paga un <strong>cargo fijo</strong> (tener el servicio) y el <strong>consumo</strong> de acueducto y de alcantarillado (el agua que se devuelve sucia). En Medellín, los primeros 13 m³ son el consumo básico, hasta 26 m³ el complementario y lo demás el suntuario. Los estratos 1, 2 y 3 reciben un subsidio en el cargo fijo y el consumo básico; los estratos 5 y 6 pagan una contribución.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia las personas, lo que gasta cada una, la fuga escondida y el estrato. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>La prueba de noche</h3>
        {result ? (
          <table className="q3-table">
            <tbody>
              <Row name="Lectura a las 0:00" value={`${es(result.a, 4)} m³`} />
              <Row name="Lectura a la 1:00" value={`${es(result.b, 4)} m³`} />
              <Row name="Diferencia" value={`${es((result.b - result.a) * 1000, 1)} L en una hora`} note={result.b > result.a ? 'hay una fuga' : 'no hay fuga'} />
            </tbody>
          </table>
        ) : (
          <p className="q3-small">Pulsa «Prueba de noche»: se leen el medidor a la medianoche y a la una de la mañana con todas las llaves cerradas.</p>
        )}
        <h3>El mismo consumo en cada estrato</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Estrato</th>
              <th>13 m³</th>
              <th>{es(r.m3, 1)} m³</th>
              <th>Factor de ejemplo</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6].map((e) => (
              <tr key={e} className={e === s.stratum ? 'is-on' : ''}>
                <td>{e}</td>
                <td>{pesos(bill(13, e).total)}</td>
                <td>{pesos(bill(r.m3, e).total)}</td>
                <td>{STRATA[e].f === 0 ? '—' : `${STRATA[e].f > 0 ? '+' : '−'}${es(Math.abs(STRATA[e].f) * 100, 0)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Lo que suma cada metro cúbico</h3>
        <table className="q3-table">
          <tbody>
            {[10, 13, 20, 26, 35].map((m) => (
              <Row key={m} name={`${m} m³`} value={pesos(bill(m, s.stratum).total)} note={`${pesos(bill(m, s.stratum).perM3)} por m³`} />
            ))}
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="factura" set={HOUSE_TOOLS.factura} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>Tarifa ilustrativa (no es la de una empresa)</caption>
          <tbody>
            <Row name="Cargo fijo" value={pesos(TARIFF.fixedAq + TARIFF.fixedSew)} note={`acueducto ${pesos(TARIFF.fixedAq)} y alcantarillado ${pesos(TARIFF.fixedSew)} al mes`} />
            <Row name="Consumo" value={`${pesos(TARIFF.m3Aq + TARIFF.m3Sew)} por m³`} note={`acueducto ${pesos(TARIFF.m3Aq)} y alcantarillado ${pesos(TARIFF.m3Sew)}`} />
            <Row name="Consumo básico" value={`${BASIC_M3} m³ al mes`} note="Resolución CRA 750 de 2016, entre 1 000 y 2 000 m" />
            <Row name="Complementario" value={`de ${BASIC_M3} a ${COMPLEMENTARY_M3} m³`} note="lo que pasa es suntuario" />
            <Row name="Subsidios y contribuciones" value="de ejemplo" note="los fija cada municipio dentro de los topes de la ley" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Lectura de un medidor; consumo como diferencia de lecturas; litros, metros cúbicos y caudal; cargo fijo y cargo por consumo; rangos de consumo; subsidios y contribuciones por estrato (solidaridad); detección de fugas con la prueba nocturna.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Rangos de consumo de la Resolución CRA 750 de 2016. Topes de subsidios (70 %, 40 % y 15 % para los estratos 1, 2 y 3) y aportes mínimos (50 % y 60 % para los estratos 5 y 6) del artículo 125 de la Ley 1450 de 2011; la Ley 2294 de 2023 permite a los municipios otros topes con condiciones. Los subsidios no pasan del consumo básico (Ley 142 de 1994, art. 99). Prueba H3.
        </p>
        <h3>Límites</h3>
        <p>La tarifa y los factores son de ejemplo: la tarifa real la fija cada empresa con la metodología de la CRA y los porcentajes los fija cada concejo municipal. No incluye aseo, intereses, otros cobros ni las medidas para desincentivar el consumo excesivo en temporadas secas.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

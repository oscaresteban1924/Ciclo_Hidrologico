// «Del río a la llave» en 3D: una planta de potabilización convencional con sus once procesos y tanques de frente
// de vidrio. La pregunta de la escena: ¿el agua de la llave es segura para tomar? La respuesta se ve en el vaso,
// en los tanques y en el IRCA. La pestaña Procesos explica cada paso y tiene un recorrido guiado.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { JarTest, Microscope } from './experiments';
import { RAW_WATER, treatPlant, type PlantInput, type RawCase } from './model';
import { ptarStages } from './ptar';

const PTAR_STAGES = ptarStages();
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from './shell';
import { ProcessPanel, TOUR_S } from './ProcessPanel';
import { PROCESSES, processById, type ProcessId } from './processes';
import { PlantWorld, WASH_S } from './three/plantWorld';
import { fmt } from './ui';

interface Ctx {
  inp: PlantInput;
  irca: number;
  settled: number;
  optimum: number;
  jarBest: boolean;
  micro: Set<string>;
  seen: ReadonlySet<ProcessId>;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'p-recorrido',
    title: 'Los once pasos',
    goal: 'Mira los once pasos de la planta, del río a la llave, en la pestaña Procesos.',
    hint: 'Usa «Recorrer la planta» o toca cada parte de la planta en la escena.',
    check: (c) => c.seen.size >= PROCESSES.length,
    progress: (c) => `Pasos vistos: ${c.seen.size} de ${PROCESSES.length}`,
  },
  {
    id: 'p-jarras',
    title: 'La jarra más clara',
    goal: 'Haz la prueba de jarras y elige la jarra que quedó más clara.',
    hint: 'Abre la pestaña Experimentos, empieza la prueba y espera a que los grumos caigan. Mira los números de turbiedad.',
    check: (c) => c.jarBest,
  },
  {
    id: 'p-segura',
    title: 'Agua segura después de la lluvia',
    goal: 'Con el río turbio después de llover, logra que el agua de la llave cumpla todo (IRCA 0 %).',
    hint: 'Primero la dosis de coagulante (la prueba de jarras te la da). Luego el cloro: debe quedar algo en la llave, pero no pasar de 2 mg/L al salir de la planta.',
    check: (c) => c.inp.raw === 'lluvia' && c.irca < 0.5,
    progress: (c) => (c.inp.raw !== 'lluvia' ? 'Pon el río «Después de llover».' : `IRCA ahora: ${fmt(c.irca, 0)} %`),
  },
  {
    id: 'p-cloro',
    title: 'El cloro justo',
    goal: 'Después de la lluvia, agua segura con 1,4 mg/L de cloro o menos: sin gastar químicos de más.',
    hint: 'Con la dosis justa de coagulante el agua sale más clara y gasta menos cloro.',
    check: (c) => c.inp.raw === 'lluvia' && c.irca < 0.5 && c.inp.chlorine <= 1.4 + 1e-9,
  },
  {
    id: 'p-creciente',
    title: 'Cuando llega la creciente',
    goal: 'Con el río en creciente, encuentra la mejor dosis de coagulante. ¿Alcanza para cumplir la norma?',
    hint: 'Haz la prueba de jarras con el río en creciente. Aunque elijas la mejor jarra, mira cuánta turbiedad llega a los filtros.',
    // la mejor jarra deja el 3 % de la turbiedad cruda (eficiencia máxima de la regla didáctica): basta acercarse
    check: (c) => c.inp.raw === 'creciente' && c.settled <= RAW_WATER.creciente.turbidity * 0.03 * 1.15,
    progress: (c) => (c.inp.raw !== 'creciente' ? 'Pon el río en «Creciente».' : `Después de sedimentar quedan ${fmt(c.settled, 0)} UNT.`),
  },
  {
    id: 'p-micro',
    title: 'Bacterias en el vaso',
    goal: 'Mira con el microscopio el agua de la llave sin cloro y después con el cloro justo.',
    hint: 'Pon el cloro en 0 y mira el vaso en el microscopio; luego sube el cloro hasta que el agua cumpla y míralo otra vez.',
    check: (c) => c.micro.has('con') && c.micro.has('sin'),
    progress: (c) => `Vasos mirados: con bacterias ${c.micro.has('con') ? '✓' : '—'} · sin bacterias ${c.micro.has('sin') ? '✓' : '—'}`,
  },
];

export function PlantLab({ head, goPtar }: { head: ReactNode; goPtar?: () => void }) {
  const { state, dispatch } = useStore();
  const [inp, setInp] = useState<PlantInput>({ raw: 'lluvia', dose: 10, chlorine: 0.8 });
  const reduced = state.prefs.reducedMotion;
  const [unit, setUnit] = useState<ProcessId | null>(null);
  const [card, setCard] = useState(false);
  // el primer paso se muestra al entrar: cuenta como visto
  const [seen, setSeen] = useState<Set<ProcessId>>(() => new Set<ProcessId>(['rio']));
  const [touring, setTouring] = useState(false);
  const [washing, setWashing] = useState(false);
  const [fly, setFly] = useState<{ id: string; n: number } | null>(null);
  const [tab, setTab] = useState<PanelTab>('procesos');
  const [jarBest, setJarBest] = useState(false);
  const [micro, setMicro] = useState<Set<string>>(new Set());
  const [sample, setSample] = useState<'llave' | 'rio'>('llave');
  const [hover, setHover] = useState<string | null>(null);
  const world = useRef<PlantWorld | null>(null);
  const r = useMemo(() => treatPlant(inp), [inp]);
  const set = (p: Partial<PlantInput>) => setInp((s) => ({ ...s, ...p }));
  const view = { inp, r, unit };
  const sync = useRef(view);
  sync.current = view;
  useEffect(() => {
    world.current?.set(sync.current);
  }, [inp, r, unit]);
  const ctx = useMemo<Ctx>(() => ({ inp, irca: r.irca, settled: r.settled, optimum: r.optimum, jarBest, micro, seen }), [inp, r, jarBest, micro, seen]);
  const flyN = useRef(0);
  const look = (id: string) => setFly({ id, n: ++flyN.current });
  /** «Ver en la planta»: vuela la cámara y, en el teléfono (escena arriba del panel), sube hasta la escena. */
  const showInScene = (id: string) => {
    look(id);
    const el = document.querySelector('.q3-scene');
    if (el && el.getBoundingClientRect().bottom < 80) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };
  /** Elige un proceso: desde el panel o el recorrido la cámara vuela hasta él; desde la escena se abre su tarjeta. */
  const pick = (id: ProcessId, from: 'panel' | 'escena' | 'recorrido') => {
    setUnit(id);
    setSeen((s) => (s.has(id) ? s : new Set(s).add(id)));
    if (from === 'escena') {
      setCard(true);
      setTab('procesos');
    } else {
      setCard(false);
      look(`p-${id}`);
    }
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const cur: ProcessId = unit ?? 'rio';
  // recorrido guiado: avanza solo cada TOUR_S segundos; al terminar vuelve a la vista general
  useEffect(() => {
    if (!touring) return;
    const h = window.setTimeout(() => {
      const i = PROCESSES.findIndex((p) => p.id === cur);
      if (i >= PROCESSES.length - 1) {
        setTouring(false);
        look('general');
      } else pick(PROCESSES[i + 1].id, 'recorrido');
    }, TOUR_S * 1000);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touring, cur]);
  const toggleTour = () => {
    if (touring) {
      setTouring(false);
      return;
    }
    setTab('procesos');
    pick(unit && unit !== 'lodos' ? unit : 'rio', 'recorrido');
    setTouring(true);
  };
  const wash = () => {
    world.current?.backwash();
    look('p-filtro');
    setWashing(true);
    window.setTimeout(() => setWashing(false), WASH_S * 1000);
  };
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const ok = r.irca < 0.5;
  const fails = r.checks.filter((c) => !c.ok).map((c) => c.name.toLowerCase());
  const answer = ok
    ? 'Sí: cumple los cinco análisis de la norma (IRCA 0 %, sin riesgo).'
    : `Todavía no: falla ${fails.join(', ')}. IRCA ${fmt(r.irca, 0)} %: ${r.risk.toLowerCase()}.`;
  const u = unit && card ? processById(unit) : null;
  const rw = RAW_WATER[inp.raw];

  const stage = (
    <>
      <Scene3D
        label="Planta de potabilización convencional en 3D: captación y rejilla, desarenador, mezcla rápida, floculadores, sedimentador, filtros, tanque de contacto de cloro, estabilización del pH, almacenamiento, tratamiento de lodos y la llave de una casa. Toca cada parte para ver qué pasa allí."
        viewNames={[
          { id: 'general', label: 'Toda la planta' },
          { id: 'entrada', label: 'Entrada' },
          { id: 'tanques', label: 'Tanques' },
          { id: 'salida', label: 'Salida' },
          { id: 'llave', label: 'La llave' },
        ]}
        make={(st) => new PlantWorld(st, { onUnit: (id) => pickRef.current(id, 'escena') })}
        flyTo={fly}
        onReady={(w) => {
          world.current = w;
          w.set(sync.current);
        }}
        onHover={setHover}
      />
      <Question q="¿El agua de la llave es segura para tomar?" answer={answer} tone={ok ? 'ok' : r.irca <= 35 ? 'mid' : 'bad'} />
      <div className="q3-card q3-probe">
        <strong>En la llave (Resolución 2115)</strong>
        <ul>
          {r.checks.map((c) => (
            <li key={c.id} className={c.ok ? 'is-ok' : 'is-bad'}>
              <span>{c.name}</span>
              <b>{c.ok ? 'cumple' : 'no cumple'}</b>
            </li>
          ))}
        </ul>
        <button type="button" className="link" onClick={() => setTab('experimentos')}>
          Mirar el vaso con el microscopio
        </button>
      </div>
      {u && (
        <div className="q3-card q3-unit" role="dialog" aria-label={u.name}>
          <button type="button" className="icon-close" aria-label="Cerrar" onClick={() => setCard(false)}>
            ×
          </button>
          <strong>
            {u.n}. {u.name}
          </strong>
          <p>{u.short}</p>
          <p className="q3-small">
            {u.inOut(r, inp)
              .slice(0, 3)
              .map((x) => `${x.label}: ${x.value}`)
              .join(' · ')}
          </p>
          <p className="q3-unit-actions">
            <button type="button" className="link" onClick={() => look(`p-${u.id}`)}>
              Acercarse
            </button>
            <button type="button" className="link" onClick={() => setTab('procesos')}>
              Cómo funciona, en el panel
            </button>
          </p>
        </div>
      )}
      {hover && <p className="q3-hover">{hover}</p>}
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <DockChoice<RawCase>
        label="¿Cómo viene el río?"
        value={inp.raw}
        options={[
          { value: 'verano', label: 'Tiempo seco' },
          { value: 'lluvia', label: 'Después de llover' },
          { value: 'creciente', label: 'Creciente' },
        ]}
        onChange={(v) => set({ raw: v })}
      />
      <DockRange label="Coagulante" value={inp.dose} min={0} max={80} step={1} show={`${inp.dose} mg/L`} onChange={(v) => set({ dose: v })} />
      <DockRange label="Cloro" value={inp.chlorine} min={0} max={4} step={0.1} show={`${fmt(inp.chlorine, 1)} mg/L`} onChange={(v) => set({ chlorine: Math.round(v * 10) / 10 })} />
      <div className="q3-flags">
        <button type="button" className="q3-flag is-action" onClick={() => setTab('experimentos')}>
          Prueba de jarras
        </button>
      </div>
    </>
  );

  const tapCount = sample === 'llave' ? r.coliTotalTap : rw.coliTotal;
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    procesos: (
      <ProcessPanel
        cur={cur}
        r={r}
        inp={inp}
        seen={seen}
        touring={touring}
        washing={washing}
        reduced={reduced}
        onPick={(id) => pick(id, 'panel')}
        onTour={toggleTour}
        onWash={wash}
        onLook={(id) => showInScene(`p-${id}`)}
      />
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Mueve las dosis con los controles de abajo y mira los tanques y el vaso. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Prueba de jarras</h3>
        <JarTest
          raw={rw.turbidity}
          onResult={(dose, best) => {
            set({ dose });
            if (best) setJarBest(true);
          }}
        />
        <h3>Una gota en el microscopio</h3>
        <div className="q3-seg" role="radiogroup" aria-label="Muestra">
          {(['llave', 'rio'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={sample === s} className={sample === s ? 'is-on' : ''} onClick={() => setSample(s)}>
              {s === 'llave' ? 'Vaso de la llave' : 'Agua del río'}
            </button>
          ))}
        </div>
        <Microscope
          count={tapCount}
          unit="coliformes por 100 mL"
          what={sample === 'llave' ? `vaso de la llave (cloro ${fmt(inp.chlorine, 1)} mg/L)` : `río, ${rw.name.toLowerCase()}`}
          onLook={(n) => {
            if (sample !== 'llave') return;
            setMicro((s) => new Set(s).add(n > 0 && inp.chlorine < 0.05 ? 'con' : n === 0 && ok ? 'sin' : 'otro'));
          }}
        />
      </div>
    ),
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El agua en cada etapa</caption>
          <thead>
            <tr>
              <th scope="col">Etapa</th>
              <th scope="col">Turbiedad (UNT)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Río</th>
              <td>{fmt(rw.turbidity, 0)}</td>
            </tr>
            <tr>
              <th scope="row">Después de sedimentar</th>
              <td>{fmt(r.settled, r.settled < 10 ? 1 : 0)}</td>
            </tr>
            <tr>
              <th scope="row">Después de los filtros{r.clogged ? ' (tapados)' : ''}</th>
              <td>{fmt(r.filtered, 2)}</td>
            </tr>
          </tbody>
        </table>
        <table className="q3-table">
          <caption>En la llave: Resolución 2115 de 2007</caption>
          <thead>
            <tr>
              <th scope="col">Análisis</th>
              <th scope="col">Valor</th>
              <th scope="col">Norma</th>
            </tr>
          </thead>
          <tbody>
            {r.checks.map((c) => (
              <tr key={c.id}>
                <th scope="row" style={{ color: c.ok ? '#2f8f55' : '#c9372c' }}>
                  {c.ok ? '✓' : '✗'} {c.name}
                </th>
                <td>{c.value}</td>
                <td>{c.limit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="q3-big">
          IRCA {fmt(r.irca, 1)} % · {r.risk}
        </p>
        <h3>¿Y después de usarla?</h3>
        <p className="q3-small">El agua del baño y la cocina se va por el alcantarillado hasta una planta de tratamiento de aguas residuales. Lo que queda de la materia orgánica (DBO5) después de cada etapa, en la planta de «De la casa al río» en su operación normal:</p>
        <ol className="q3-ptar">
          {PTAR_STAGES.map((s) => (
            <li key={s.id}>
              <strong>{s.name}</strong>
              <span className="q3-bar" aria-hidden="true">
                <i style={{ width: `${s.remain * 100}%` }} />
              </span>
              <em>queda {Math.round(s.remain * 100)} %</em>
            </li>
          ))}
        </ol>
        {goPtar && (
          <p>
            <button type="button" className="btn small" onClick={goPtar}>
              Ver la planta de aguas residuales
            </button>
          </p>
        )}
        <button
          type="button"
          className="btn small"
          onClick={() =>
            dispatch({
              type: 'log',
              entry: { kind: 'observacion', title: 'Del río a la llave', text: `Río ${rw.name.toLowerCase()} (${rw.turbidity} UNT). Coagulante ${inp.dose} mg/L, cloro ${fmt(inp.chlorine, 1)} mg/L. En la llave: ${fmt(r.filtered, 2)} UNT, cloro ${fmt(r.clTap, 2)} mg/L. IRCA ${fmt(r.irca, 1)} % (${r.risk.toLowerCase()}).` },
            })
          }
        >
          Guardar en la bitácora
        </button>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>La norma</h3>
        <p>
          Resolución 2115 de 2007 (Ministerio de la Protección Social y Ministerio de Ambiente): turbiedad máxima 2 UNT, pH entre 6,5 y 9,0, cloro residual libre entre 0,3 y 2,0 mg/L en cualquier punto de la red, coliformes totales y E. coli 0 UFC/100 cm³. IRCA = suma de los puntajes de riesgo de lo que no cumple / suma de los puntajes de lo analizado × 100, con los puntajes del cuadro 6 (turbiedad 15, pH 1,5, cloro 15, coliformes totales 15, E. coli 25) y los rangos del cuadro 7 (0–5 sin riesgo, 5,1–14 bajo, 14,1–35 medio, 35,1–80 alto, 80,1–100 inviable sanitariamente). Aquí se calcula con las cinco características que mide el juego.
        </p>
        <h3>Reglas didácticas</h3>
        <p>
          Dosis óptima de coagulante 6·T<sup>0,35</sup> mg/L (T, turbiedad cruda en UNT); remoción en forma de campana alrededor de esa dosis, con al menos 25 % por sedimentación simple. Los filtros quitan 90 % si llegan 10 UNT o menos y 70 % si llega más (se tapan). Demanda de cloro 0,4 mg/L + 0,15 por UNT filtrada (+0,2 tras la lluvia, +0,4 en creciente); en la red el cloro decae 5 % por hora durante 12 h. La inactivación de los microbios crece con concentración × tiempo de contacto y baja con la turbiedad, que los protege. Con la creciente, ni la mejor dosis deja el agua por debajo de 2 UNT: por eso algunas plantas dejan de captar mientras pasa la creciente y trabajan con el agua que tienen guardada.
        </p>
        <p className="q3-small">
          En la escena, el número de partículas y de bacterias crece con el logaritmo de la turbiedad y del conteo calculados: es un dibujo que sigue el cálculo, no un conteo real.
        </p>
        <h3>Los once procesos</h3>
        <p>
          La pestaña Procesos describe una planta convencional de filtración rápida: captación y rejilla, desarenador, mezcla rápida, floculación, sedimentación de alta tasa, filtración, desinfección, estabilización del pH, almacenamiento, red y tratamiento de lodos. Los criterios de diseño citados vienen de la Resolución 0330 de 2017 del Ministerio de Vivienda, Ciudad y Territorio (artículos 55, 111 a 114, 121, 122, 125 y 133, con las modificaciones de las Resoluciones 799 y 908 de 2021, según el texto compilado de la CRA) y, para la calidad en la red, de la Resolución 2115 de 2007. Son rangos generales de diseño: no describen una planta de EPM ni reemplazan un diseño de ingeniería.
        </p>
        <p className="q3-small">
          El cálculo del juego usa la coagulación, la sedimentación, la filtración, el cloro y la red. El desarenador, la estabilización del pH, el almacenamiento y los lodos se dibujan y se explican, pero no cambian el resultado: el desarenador no quita la arcilla que da la turbiedad, el pH del juego siempre queda dentro de la norma y el lodo se muestra como la turbiedad retirada. Las animaciones «con lupa» son ilustrativas; donde dependen de la dosis, la turbiedad o el cloro, usan los valores calculados.
        </p>
        <h3>Medellín</h3>
        <p>
          El 96 % de los usuarios de EPM en el valle recibe agua de los embalses La Fe, Riogrande II y Piedras Blancas, potabilizada en plantas como La Ayurá (9,2 m³/s) y Manantiales (6,0 m³/s). San Fernando trata el sur del valle desde 2000 (1,8 m³/s nominales) y Aguas Claras, el norte desde 2018 (unos 5 m³/s). Fuentes: EPM y Superservicios, citadas en <em>docs/calidad/MODELO_CALIDAD.md</em>.
        </p>
        <h3>Para conversar en clase</h3>
        <ol>
          <li>¿Por qué la planta necesita más coagulante después de llover?</li>
          <li>¿Por qué no sirve echar mucho cloro si el agua sigue turbia?</li>
          <li>¿Para qué debe quedar algo de cloro cuando el agua llega a la casa?</li>
          <li>¿Por qué la floculación revuelve cada vez más despacio?</li>
          <li>¿Qué pasaría con la quebrada si la planta botara sus lodos al río?</li>
        </ol>
      </div>
    ),
  };

  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['procesos', 'retos', 'experimentos', 'datos', 'docente']} />;
}

// «Del río a la llave» en 3D: una planta de potabilización con tanques de frente de vidrio. La pregunta de la
// escena: ¿el agua de la llave es segura para tomar? La respuesta se ve en el vaso, en los tanques y en el IRCA.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { JarTest, Microscope } from './experiments';
import { PTAR_STAGES, RAW_WATER, treatPlant, type PlantInput, type RawCase } from './model';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from './shell';
import { PlantWorld, UNITS, type UnitId } from './three/plantWorld';
import { fmt, fmtBig } from './ui';

interface Ctx {
  inp: PlantInput;
  irca: number;
  settled: number;
  optimum: number;
  jarBest: boolean;
  micro: Set<string>;
}

const RETOS: Reto<Ctx>[] = [
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

export function PlantLab({ head }: { head: ReactNode }) {
  const { dispatch } = useStore();
  const [inp, setInp] = useState<PlantInput>({ raw: 'lluvia', dose: 10, chlorine: 0.8 });
  const [unit, setUnit] = useState<UnitId | null>(null);
  const [tab, setTab] = useState<PanelTab>('retos');
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
  const ctx = useMemo<Ctx>(() => ({ inp, irca: r.irca, settled: r.settled, optimum: r.optimum, jarBest, micro }), [inp, r, jarBest, micro]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const ok = r.irca < 0.5;
  const fails = r.checks.filter((c) => !c.ok).map((c) => c.name.toLowerCase());
  const answer = ok
    ? 'Sí: cumple los cinco análisis de la norma (IRCA 0 %, sin riesgo).'
    : `Todavía no: falla ${fails.join(', ')}. IRCA ${fmt(r.irca, 0)} %: ${r.risk.toLowerCase()}.`;
  const u = unit ? UNITS.find((x) => x.id === unit)! : null;
  const rw = RAW_WATER[inp.raw];

  const stage = (
    <>
      <Scene3D
        label="Planta de potabilización en 3D: río, mezcla, floculadores, sedimentador, filtros, cloro, tanque y la llave de una casa. Toca cada parte para ver qué pasa allí."
        viewNames={[
          { id: 'general', label: 'Toda la planta' },
          { id: 'entrada', label: 'Coagulante y flocs' },
          { id: 'tanques', label: 'Sedimentador y filtros' },
          { id: 'llave', label: 'La llave' },
        ]}
        make={(st) => new PlantWorld(st, { onUnit: setUnit })}
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
          <button type="button" className="icon-close" aria-label="Cerrar" onClick={() => setUnit(null)}>
            ×
          </button>
          <strong>{u.name}</strong>
          <p>{u.what}</p>
          <p className="q3-small">
            {unit === 'rio' && `${rw.note} Turbiedad ${fmt(rw.turbidity, 0)} UNT; coliformes totales ${fmtBig(rw.coliTotal)} por 100 mL.`}
            {unit === 'mezcla' && `Dosis: ${inp.dose} mg/L. La dosis justa para este río está cerca de ${fmt(r.optimum, 0)} mg/L (la prueba de jarras la encuentra).`}
            {unit === 'floc' && `Con esta dosis los grumos atrapan el ${fmt(100 * (1 - r.settled / rw.turbidity), 0)} % de la turbiedad.`}
            {unit === 'sedim' && `Sale agua con ${fmt(r.settled, r.settled < 10 ? 1 : 0)} UNT; lo demás queda en el fondo como lodo.`}
            {unit === 'filtro' && (r.clogged ? `Llegan ${fmt(r.settled, 0)} UNT: demasiado. Los filtros se tapan y dejan pasar ${fmt(r.filtered, 1)} UNT.` : `Llegan ${fmt(r.settled, 1)} UNT y salen ${fmt(r.filtered, 2)} UNT.`)}
            {unit === 'cloro' && `Se agregan ${fmt(inp.chlorine, 1)} mg/L; el agua gasta ${fmt(r.demand, 2)} mg/L reaccionando y quedan ${fmt(r.clExit, 2)} mg/L libres.`}
            {unit === 'tanque' && `Después de 12 horas en la red quedan ${fmt(r.clTap, 2)} mg/L de cloro (la norma pide entre 0,3 y 2,0).`}
            {unit === 'llave' && `IRCA ${fmt(r.irca, 1)} %: ${r.risk.toLowerCase()}. Coliformes totales: ${r.coliTotalTap < 0.5 ? '0' : fmtBig(r.coliTotalTap)} por 100 mL.`}
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
  const panels: Record<PanelTab, ReactNode> = {
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
        <p className="q3-small">El agua del baño y la cocina se va por el alcantarillado hasta una planta de tratamiento de aguas residuales. Lo que queda de la materia orgánica (DBO5) después de cada etapa, en una planta típica:</p>
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
        <h3>Medellín</h3>
        <p>
          El 96 % de los usuarios de EPM en el valle recibe agua de los embalses La Fe, Riogrande II y Piedras Blancas, potabilizada en plantas como La Ayurá (9,2 m³/s) y Manantiales (6,0 m³/s). San Fernando trata el sur del valle desde 2000 (1,8 m³/s nominales) y Aguas Claras, el norte desde 2018 (unos 5 m³/s). Fuentes: EPM y Superservicios, citadas en <em>docs/calidad/MODELO_CALIDAD.md</em>.
        </p>
        <h3>Para conversar en clase</h3>
        <ol>
          <li>¿Por qué la planta necesita más coagulante después de llover?</li>
          <li>¿Por qué no sirve echar mucho cloro si el agua sigue turbia?</li>
          <li>¿Para qué debe quedar algo de cloro cuando el agua llega a la casa?</li>
        </ol>
      </div>
    ),
  };

  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} />;
}

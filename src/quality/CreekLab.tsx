// «La quebrada y su salud» en 3D: un barrio vierte su agua usada a una quebrada de montaña. La pregunta de la
// escena: ¿dónde pueden vivir los peces? La respuesta se ve en el dibujo (peces, color del agua, estaciones).

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { Microscope, StoneLens } from './experiments';
import { BMWP_CLASSES, DEFAULT_CREEK, PERSONS_PER_HOUSE, SWIM, TREATMENTS, bmwp, canSwim, creekModel, stoneSample, type CreekInput, type Reading, type Season, type Treatment } from './model';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from './shell';
import { CreekWorld, FISH, STATIONS, fishOk, type StationId } from './three/creekWorld';
import { RealCreeks, nadarEn, subeAguasAbajo } from './RealData';
import { DO_CLASSES } from './three/kit';
import { ProfileChart, fmt, fmtBig } from './ui';

interface Ctx {
  inp: CreekInput;
  probe: number;
  probeR: Reading;
  stations: Reading[];
  stones: Set<string>;
  micro: Set<string>;
  /** Quebradas reales que se eligieron en la pestaña Medellín. */
  real: Set<string>;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'q-peces',
    title: 'Que vuelvan los peces',
    goal: 'En verano y con 600 casas o más en el barrio, logra que haya peces en las cuatro estaciones.',
    hint: 'En verano la quebrada lleva poca agua para diluir lo que sale del tubo. Cambia «¿A dónde va el agua de las casas?» y mira cuál opción deja la materia orgánica por debajo de 6 mg/L.',
    check: (c) => c.inp.season === 'verano' && c.inp.houses >= 600 && c.stations.every(fishOk),
    progress: (c) => `${c.stations.filter(fishOk).length} de 4 estaciones con peces${c.inp.season !== 'verano' ? ' · falta poner verano' : ''}${c.inp.houses < 600 ? ' · faltan casas' : ''}`,
  },
  {
    id: 'q-bichos',
    title: 'Detective de bichos',
    goal: 'Con el tubo vertiendo sin tratar, levanta una piedra arriba del tubo (A) y otra junto al tubo (B). ¿Qué bichos desaparecen?',
    hint: 'Toca las piedras grises junto a las banderitas A y B, o usa la pestaña Experimentos.',
    check: (c) => c.stones.has('A') && c.stones.has('B'),
    progress: (c) => `Piedras levantadas sin tratamiento: A ${c.stones.has('A') ? '✓' : '—'} · B ${c.stones.has('B') ? '✓' : '—'}`,
  },
  {
    id: 'q-nadar',
    title: '¿Se puede nadar?',
    goal: 'Con 300 casas o más, encuentra con la sonda un lugar abajo del tubo donde se pueda nadar.',
    hint: 'Para nadar importan los microbios del agua de los baños (coliformes). ¿Qué opción hace que esa agua no llegue a la quebrada?',
    check: (c) => c.inp.houses >= 300 && c.probe >= 0 && canSwim(c.probeR).ok,
  },
  {
    id: 'q-micro',
    title: 'Bacterias en una gota',
    goal: 'Mira con el microscopio una gota arriba del tubo y otra abajo del tubo, con el tubo vertiendo sin tratar.',
    hint: 'Pon la sonda arriba del tubo, abre Experimentos y mira el microscopio; luego pon la sonda abajo del tubo.',
    check: (c) => c.micro.has('arriba') && c.micro.has('abajo'),
    progress: (c) => `Gotas: arriba ${c.micro.has('arriba') ? '✓' : '—'} · abajo ${c.micro.has('abajo') ? '✓' : '—'}`,
  },
  {
    id: 'q-real-sube',
    title: 'Datos de verdad',
    goal: 'En la pestaña Medellín, encuentra una quebrada real de San Antonio de Prado donde los coliformes suben de la parte alta a la baja.',
    hint: 'Elige una quebrada en la lista y mira la gráfica de coliformes: la parte alta va arriba y la baja abajo.',
    check: (c) => [...c.real].some((q) => subeAguasAbajo(q) === true),
    progress: (c) => `${c.real.size} quebradas reales revisadas`,
  },
  {
    id: 'q-real-nadar',
    title: '¿Dónde se podría nadar de verdad?',
    goal: 'En la pestaña Medellín, encuentra una quebrada real con algún sitio donde los coliformes estén por debajo del máximo para nadar.',
    hint: 'Busca barras verdes en la gráfica de coliformes. ¿En qué parte de la quebrada aparecen?',
    check: (c) => [...c.real].some((q) => nadarEn(q)),
  },
];

const TREAT_OPTS: { value: Treatment; label: string }[] = [
  { value: 'ninguno', label: 'Directo' },
  { value: 'septico', label: 'Tanque séptico' },
  { value: 'ptar', label: 'Planta pequeña' },
  { value: 'alcantarillado', label: 'Alcantarillado' },
];

function where(x: number): string {
  return x < 0 ? `${fmt(-x, 0)} m arriba del tubo` : x === 0 ? 'en el tubo' : x < 1000 ? `${fmt(x, 0)} m abajo del tubo` : `${fmt(x / 1000, 1)} km abajo del tubo`;
}

export function CreekLab({ head }: { head: ReactNode }) {
  const { dispatch } = useStore();
  const [inp, setInp] = useState<CreekInput>({ ...DEFAULT_CREEK, houses: 600 });
  const [probe, setProbe] = useState(300);
  const [mode, setMode] = useState<'natural' | 'oxigeno'>('natural');
  const [station, setStation] = useState<StationId>('B');
  const [tab, setTab] = useState<PanelTab>('retos');
  const [stones, setStones] = useState<Set<string>>(new Set());
  const [micro, setMicro] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [param, setParam] = useState<'oxigeno' | 'dbo' | 'coliformes' | 'amonio' | 'turbiedad'>('dbo');
  const [realPick, setRealPick] = useState('Barro Azul');
  const [real, setReal] = useState<Set<string>>(new Set());
  const pickReal = (name: string) => {
    setRealPick(name);
    setReal((s) => new Set(s).add(name));
  };
  const world = useRef<CreekWorld | null>(null);
  const set = (p: Partial<CreekInput>) => setInp((s) => ({ ...s, ...p }));
  const m = useMemo(() => creekModel(inp), [inp]);
  // los bichos cuentan cómo ha estado el agua por semanas: se calculan con tiempo seco
  const mDry = useMemo(() => creekModel({ ...inp, afterRain: false }), [inp]);
  const stations = useMemo(() => STATIONS.map((s) => m.at(s.x)), [m]);
  const r = m.at(probe);
  const swim = canSwim(r);
  const viewState = { inp, m, probe, mode, station };
  const sync = useRef(viewState);
  sync.current = viewState;
  useEffect(() => {
    world.current?.set(sync.current);
  }, [inp, m, probe, mode, station]);
  const ctx = useMemo<Ctx>(() => ({ inp, probe, probeR: m.at(probe), stations, stones, micro, real }), [inp, m, probe, stations, stones, micro, real]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);

  const lookStone = useCallback(
    (id: StationId) => {
      setStation(id);
      setTab('experimentos');
      if (sync.current.inp.treatment === 'ninguno' && sync.current.inp.houses > 0) setStones((s) => new Set(s).add(id));
    },
    [],
  );
  // respuesta de la pregunta: tramo sin peces
  const answer = useMemo(() => {
    let x0: number | null = null, x1: number | null = null;
    for (let x = -400; x <= 3000; x += 10) {
      if (!fishOk(m.at(x))) {
        if (x0 === null) x0 = x;
        x1 = x;
      }
    }
    if (x0 === null) return { tone: 'ok' as const, text: 'En toda la quebrada: hay oxígeno y poca materia orgánica.' };
    const r0 = m.at(Math.max(0, x0));
    const why = r0.dbo > FISH.maxDBO ? `demasiada materia orgánica (más de ${FISH.maxDBO} mg/L de DBO5)` : r0.dissolvedO2 < FISH.minDO ? `poco oxígeno (menos de ${FISH.minDO} mg/L)` : `demasiado amoníaco libre (más de ${fmt(FISH.maxNH3 * 1000, 0)} µg/L)`;
    return { tone: 'bad' as const, text: `No hay peces desde el tubo hasta ${x1! >= 3000 ? 'el final del recorrido (2,5 km o más)' : where(x1!).replace(' del tubo', '')}: ${why}.` };
  }, [m]);
  const sample = useMemo(() => stoneSample(mDry.at(STATIONS.find((s) => s.id === station)!.x)), [mDry, station]);
  const stName = (id: StationId) => `${id} · ${STATIONS.find((s) => s.id === id)!.name}`;
  const lev = (ok: boolean, mid = false) => (ok ? 'ok' : mid ? 'mid' : 'bad');

  const stage = (
    <>
      <Scene3D
        label="Quebrada en 3D: montaña, barrio con su tubo y tramo de potreros. Toca el agua para medir y las piedras para ver los bichos."
        viewNames={[
          { id: 'todo', label: 'Todo el recorrido' },
          { id: 'tubo', label: 'El tubo' },
          { id: 'abajo', label: 'Aguas abajo' },
          { id: 'montana', label: 'La montaña' },
        ]}
        make={(st) => new CreekWorld(st, { onProbe: setProbe, onStone: lookStone })}
        onReady={(w) => {
          world.current = w;
          w.onStation = lookStone;
          w.set(sync.current);
        }}
        onHover={setHover}
      />
      <Question q="¿Dónde pueden vivir los peces?" answer={answer.text} tone={answer.tone} />
      <div className="q3-card q3-probe" aria-live="polite">
        <strong>Sonda · {where(probe)}</strong>
        <ul>
          <li className={`is-${lev(fishOk(r))}`}>
            <span>Peces</span>
            <b>{fishOk(r) ? 'Sí' : 'No'}</b>
          </li>
          <li className={`is-${lev(r.dissolvedO2 >= FISH.minDO, r.dissolvedO2 >= 3)}`}>
            <span>Oxígeno</span>
            <b>{fmt(r.dissolvedO2, 1)} mg/L</b>
          </li>
          <li className={`is-${lev(r.dbo <= FISH.maxDBO, r.dbo <= 10)}`}>
            <span>Materia orgánica</span>
            <b>{fmt(r.dbo, 1)} mg/L</b>
          </li>
          <li className={`is-${lev(r.nh3 <= FISH.maxNH3, r.nh3 <= 2 * FISH.maxNH3)}`}>
            <span>Amoníaco libre</span>
            <b>{fmt(r.nh3 * 1000, 1)} µg/L</b>
          </li>
          <li className={`is-${lev(r.coliforms <= SWIM.coliformsFecal, r.coliforms <= 2000)}`}>
            <span>Coliformes</span>
            <b>{fmtBig(r.coliforms)}</b>
          </li>
          <li className={`is-${lev(r.turbidity < 10, r.turbidity < 50)}`}>
            <span>Turbiedad</span>
            <b>{fmt(r.turbidity, 0)} UNT</b>
          </li>
          <li className={`is-${lev(swim.ok)}`}>
            <span>¿Nadar?</span>
            <b>{swim.ok ? 'Sí' : 'No'}</b>
          </li>
        </ul>
        <button type="button" className="link" onClick={() => setTab('experimentos')}>
          Ver la gota con el microscopio
        </button>
      </div>
      {mode === 'oxigeno' && (
        <div className="q3-card q3-legend">
          <strong>Oxígeno disuelto (mg/L)</strong>
          <ul>
            {DO_CLASSES.map((c) => (
              <li key={c.label}>
                <i style={{ background: c.color }} />
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hover && <p className="q3-hover">{hover}</p>}
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <DockRange label="Casas que vierten al tubo" value={inp.houses} min={0} max={1000} step={20} show={`${inp.houses.toLocaleString('es-CO')} casas`} onChange={(v) => set({ houses: v })} />
      <DockChoice label="¿A dónde va el agua de las casas?" value={inp.treatment} options={TREAT_OPTS} onChange={(v) => set({ treatment: v })} />
      <DockChoice
        label="Temporada"
        value={inp.season}
        options={[
          { value: 'verano' as Season, label: 'Verano' },
          { value: 'normal' as Season, label: 'Normal' },
          { value: 'lluvioso' as Season, label: 'Lluvias' },
        ]}
        onChange={(v) => set({ season: v })}
      />
      <div className="q3-flags">
        <button type="button" className={`q3-flag${inp.trees ? ' is-on' : ''}`} aria-pressed={inp.trees} onClick={() => set({ trees: !inp.trees })}>
          Árboles en la orilla
        </button>
        <button type="button" className={`q3-flag${inp.afterRain ? ' is-on' : ''}`} aria-pressed={inp.afterRain} onClick={() => set({ afterRain: !inp.afterRain })}>
          Recién llovió
        </button>
        <button type="button" className={`q3-flag${mode === 'oxigeno' ? ' is-on' : ''}`} aria-pressed={mode === 'oxigeno'} onClick={() => setMode(mode === 'oxigeno' ? 'natural' : 'oxigeno')}>
          Ver el oxígeno
        </button>
      </div>
    </>
  );

  const paramDef = {
    oxigeno: { title: 'Oxígeno disuelto', unit: 'mg/L', get: (q: Reading) => q.dissolvedO2, log: false, refs: [{ y: FISH.minDO, label: `mínimo para peces (${FISH.minDO})`, color: '#c0462a' }], fmtY: (v: number) => fmt(v, 1) },
    dbo: { title: 'Materia orgánica (DBO5)', unit: 'mg/L', get: (q: Reading) => q.dbo, log: false, refs: [{ y: FISH.maxDBO, label: `máximo para peces (${FISH.maxDBO})`, color: '#c0462a' }], fmtY: (v: number) => fmt(v, 1) },
    coliformes: { title: 'Coliformes fecales', unit: 'NMP/100 mL', get: (q: Reading) => q.coliforms, log: true, refs: [{ y: SWIM.coliformsFecal, label: `máximo para nadar (${SWIM.coliformsFecal})`, color: '#c0462a' }], fmtY: (v: number) => fmtBig(v) },
    amonio: { title: 'Amoníaco libre (NH₃)', unit: 'µg/L', get: (q: Reading) => q.nh3 * 1000, log: false, refs: [{ y: FISH.maxNH3 * 1000, label: `máximo para peces (${fmt(FISH.maxNH3 * 1000, 0)} µg/L)`, color: '#c0462a' }], fmtY: (v: number) => fmt(v, 1) },
    turbiedad: { title: 'Turbiedad', unit: 'UNT', get: (q: Reading) => q.turbidity, log: false, refs: [], fmtY: (v: number) => fmt(v, 0) },
  }[param];
  const profile = useMemo(() => {
    const pts: [number, number][] = [];
    for (let x = -400; x <= 3000; x += 25) pts.push([x, paramDef.get(m.at(x))]);
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, param]);

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el barrio con los controles de abajo y mira la quebrada. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Levantar una piedra</h3>
        <div className="q3-seg" role="radiogroup" aria-label="Estación">
          {STATIONS.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={station === s.id} className={station === s.id ? 'is-on' : ''} onClick={() => lookStone(s.id)}>
              {s.id}
            </button>
          ))}
        </div>
        <StoneLens sample={sample} where={stName(station)} onLook={() => lookStone(station)} />
        <h3>Una gota en el microscopio</h3>
        <Microscope
          count={r.coliforms}
          unit="coliformes por 100 mL"
          what={`agua de la quebrada, ${where(probe)}`}
          onLook={() => {
            if (inp.treatment === 'ninguno' && inp.houses > 0) setMicro((s) => new Set(s).add(probe < 0 ? 'arriba' : 'abajo'));
          }}
        />
      </div>
    ),
    datos: (
      <div className="q3-data">
        <div className="q3-seg" role="radiogroup" aria-label="Qué medir a lo largo de la quebrada">
          {(['dbo', 'oxigeno', 'coliformes', 'amonio', 'turbiedad'] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={param === p} className={param === p ? 'is-on' : ''} onClick={() => setParam(p)}>
              {{ dbo: 'Materia orgánica', oxigeno: 'Oxígeno', coliformes: 'Coliformes', amonio: 'Amoníaco', turbiedad: 'Turbiedad' }[p]}
            </button>
          ))}
        </div>
        <ProfileChart
          title={`${paramDef.title} a lo largo de la quebrada`}
          lines={[{ points: profile, color: '#1f6fb2', label: paramDef.title }]}
          yUnit={paramDef.unit}
          log={paramDef.log}
          refs={paramDef.refs}
          marks={[...STATIONS.map((s) => ({ x: s.x, label: s.id })), { x: probe, label: 'sonda', strong: true }]}
          fmtY={paramDef.fmtY}
        />
        <table className="q3-table">
          <caption>Las cuatro estaciones (bichos con tiempo seco)</caption>
          <thead>
            <tr>
              <th scope="col">Estación</th>
              <th scope="col">O₂ (mg/L)</th>
              <th scope="col">DBO5 (mg/L)</th>
              <th scope="col">Coliformes</th>
              <th scope="col">BMWP</th>
            </tr>
          </thead>
          <tbody>
            {STATIONS.map((s, k) => {
              const b = bmwp(stoneSample(mDry.at(s.x)));
              return (
                <tr key={s.id}>
                  <th scope="row">{stName(s.id)}</th>
                  <td>{fmt(stations[k].dissolvedO2, 1)}</td>
                  <td>{fmt(stations[k].dbo, 1)}</td>
                  <td>{fmtBig(stations[k].coliforms)}</td>
                  <td style={{ color: b.cls.color, fontWeight: 700 }}>
                    {b.total} ({b.cls.cls})
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="q3-small">
          Caudal de la quebrada: {fmt(m.Qr * 1000, 0)} L/s · agua usada que llega por el tubo: {fmt(m.Qw * 1000, 1)} L/s ({(inp.houses * PERSONS_PER_HOUSE).toLocaleString('es-CO')} personas; {TREATMENTS[inp.treatment].name.toLowerCase()}).
        </p>
        <button
          type="button"
          className="btn small"
          onClick={() =>
            dispatch({
              type: 'log',
              entry: {
                kind: 'observacion',
                title: 'La quebrada y su salud',
                text: `${inp.houses} casas (${TREATMENTS[inp.treatment].name.toLowerCase()}), temporada ${inp.season}. ${STATIONS.map((s, k) => `${s.id}: ${fishOk(stations[k]) ? 'con peces' : 'sin peces'}, O₂ ${fmt(stations[k].dissolvedO2, 1)} mg/L, DBO5 ${fmt(stations[k].dbo, 1)} mg/L`).join('; ')}.`,
              },
            })
          }
        >
          Guardar en la bitácora
        </button>
      </div>
    ),
    medellin: <RealCreeks picked={realPick} onPick={pickReal} />,
    docente: (
      <div className="q3-teacher">
        <h3>Qué calcula la escena</h3>
        <p>
          En el tubo, el agua usada del barrio se mezcla con la de la quebrada (balance de masa). Aguas abajo, la materia orgánica (DBO5) se descompone y gasta oxígeno; el amonio del agua usada pasa a nitrato y también gasta oxígeno (4,57 g por gramo de nitrógeno); la quebrada lo recupera del aire (reaireación de Tsivoglou y Neal), y el lodo del fondo también consume oxígeno (ecuación de Streeter y Phelps con demanda del sedimento y nitrificación). Los coliformes mueren con el tiempo de viaje (Mancini), la turbiedad se asienta y la parte del amonio que está como amoníaco libre (la tóxica) depende del pH y de la temperatura (Emerson et al.). Los números están en <em>docs/calidad/MODELO_CALIDAD.md</em>.
        </p>
        <h3>Peces, bichos y nadar</h3>
        <ul>
          <li>
            <strong>Peces</strong> (regla didáctica con criterios publicados): oxígeno de al menos {FISH.minDO} mg/L, criterio de preservación de flora y fauna para aguas dulces frías del Decreto 1594 de 1984 (compilado en el Decreto 1076 de 2015, artículo 2.2.3.3.9.10); DBO5 de {FISH.maxDBO} mg/L o menos, valor guía para aguas de peces ciprinícolas de la Directiva europea 78/659/CEE, y amoníaco libre de {fmt(FISH.maxNH3 * 1000, 0)} µg/L o menos, valor imperativo de la misma directiva. En una quebrada empinada el oxígeno se recupera rápido: lo que más pesa es la materia orgánica. Con el pH de la quebrada (cerca de 7,3) el amoníaco libre queda por debajo de su límite; subiría si el agua se volviera más alcalina.
          </li>
          <li>
            <strong>Bichos</strong>: índice BMWP/Col (Roldán, 2003). Clases: {BMWP_CLASSES.map((c) => `${c.cls} desde ${c.min}`).join(' · ')}.
          </li>
          <li>
            <strong>Nadar</strong> (contacto primario, Decreto 1076 de 2015, artículo 2.2.3.3.9.7): coliformes fecales hasta {SWIM.coliformsFecal} NMP/100 mL, oxígeno de al menos {SWIM.satPct} % de saturación y pH entre 5 y 9.
          </li>
        </ul>
        <p className="q3-small">
          Los criterios de calidad por uso del Decreto 1076 siguen vigentes de manera transitoria: la Resolución 0565 de 2026 del Ministerio de Ambiente los reemplazará desde el 21 de mayo de 2027.
        </p>
        <h3>Para conversar en clase</h3>
        <ol>
          <li>¿Por qué en verano el mismo barrio hace más daño que en temporada de lluvias?</li>
          <li>El tanque séptico ayuda en temporada normal pero no en verano. ¿Por qué?</li>
          <li>Arriba del tubo hay bichos que necesitan agua muy limpia. ¿Cuáles desaparecen junto al tubo?</li>
        </ol>
        <p className="q3-small">
          Dibujo esquemático: la distancia aguas abajo está comprimida (hay más espacio cerca del tubo). Peces y bichos son ilustrativos; los valores de la sonda, la tabla y la gráfica son los calculados. La quebrada de la escena no es una quebrada real; la pestaña Medellín muestra mediciones reales de 18 quebradas de San Antonio de Prado para comparar.
        </p>
      </div>
    ),
  };

  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['retos', 'experimentos', 'datos', 'medellin', 'docente']} />;
}

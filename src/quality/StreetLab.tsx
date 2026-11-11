// «La ciudad y la lluvia» en 3D: una cuadra con veinte casas, la calle y los dos tubos que van debajo. La
// pregunta de la escena: ¿a dónde va lo que cae en la calle? La respuesta se ve cuando llueve (la mugre corre
// al sumidero y sale a la quebrada) y con la prueba del colorante (las casas mal conectadas).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setCityIntent } from '../city/intent';
import { useStore } from '../state/store';
import { STREET, buildup, washoff, type StreetInput } from './model';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from './shell';
import { StreetWorld, wrongSet } from './three/streetWorld';
import { ProfileChart, fmt } from './ui';

interface Run {
  dryDays: number;
  sweeping: boolean;
  rainMmH: number;
  kg: number;
}

interface Ctx {
  inp: StreetInput;
  wrong: Set<number>;
  tested: Map<number, boolean>;
  runs: Run[];
}

const found = (c: Ctx) => [...c.wrong].filter((i) => c.tested.get(i) === true).length;

const RETOS: Reto<Ctx>[] = [
  {
    id: 's-detective',
    title: 'Detective de conexiones erradas',
    goal: 'Encuentra todas las casas que mandan su agua usada al tubo de aguas lluvias. Toca una casa para echar colorante en su desagüe y mira por cuál tubo sale.',
    hint: 'Si el colorante sale en la quebrada, esa casa está mal conectada. Si se va hacia la planta de tratamiento, está bien.',
    check: (c) => c.wrong.size > 0 && found(c) === c.wrong.size,
    progress: (c) => (c.wrong.size ? `Encontradas: ${found(c)} de ${c.wrong.size}` : 'Pon al menos una casa con conexión errada.'),
  },
  {
    id: 's-primer',
    title: 'El primer lavado',
    goal: 'Haz llover después de 10 días secos o más sin barrer la calle, y otra vez con barrido. ¿Cuánta mugre menos llega a la quebrada?',
    hint: 'Pon «Días sin llover» en 10 o más, haz llover; luego activa el barrido, limpia la calle y haz llover otra vez.',
    check: (c) => c.runs.some((r) => r.dryDays >= 10 && !r.sweeping) && c.runs.some((r) => r.dryDays >= 10 && r.sweeping),
    progress: (c) => `Aguaceros: sin barrido ${c.runs.some((r) => r.dryDays >= 10 && !r.sweeping) ? '✓' : '—'} · con barrido ${c.runs.some((r) => r.dryDays >= 10 && r.sweeping) ? '✓' : '—'}`,
  },
  {
    id: 's-limpia',
    title: 'Una quebrada que no recibe mugre',
    goal: 'Con un aguacero fuerte o muy fuerte, logra que lleguen 5 kg de mugre o menos a la quebrada.',
    hint: 'La mugre se acumula con los días secos. ¿Qué pasa si se barre seguido?',
    check: (c) => c.runs.some((r) => r.rainMmH >= 30 && r.kg <= 5),
  },
];

export function StreetLab({ head }: { head: ReactNode }) {
  const { dispatch } = useStore();
  const [inp, setInp] = useState<StreetInput>({ dryDays: 7, sweeping: false, litter: 'mucha', rainMmH: 30, durationMin: 30, wrongHouses: 3 });
  const [tested, setTested] = useState<Map<number, boolean>>(new Map());
  const [busy, setBusy] = useState<number | null>(null);
  const [rain, setRain] = useState<{ state: 'seco' | 'lloviendo' | 'llovio'; minute: number }>({ state: 'seco', minute: 0 });
  const [runs, setRuns] = useState<Run[]>([]);
  const [tab, setTab] = useState<PanelTab>('retos');
  const [hover, setHover] = useState<string | null>(null);
  const world = useRef<StreetWorld | null>(null);
  const wash = useMemo(() => washoff(inp), [inp]);
  const wrong = useMemo(() => wrongSet(inp.wrongHouses), [inp.wrongHouses]);
  const set = (p: Partial<StreetInput>) => {
    setInp((s) => ({ ...s, ...p }));
    if (rain.state !== 'seco') {
      world.current?.resetStreet();
      setRain({ state: 'seco', minute: 0 });
    }
    if (p.wrongHouses !== undefined) setTested(new Map());
  };
  const view = { inp, wash, wrong, tested, picked: busy };
  const sync = useRef(view);
  sync.current = view;
  const inpRef = useRef(inp);
  inpRef.current = inp;
  useEffect(() => {
    world.current?.set(sync.current);
  }, [inp, wash, wrong, tested, busy]);
  const ctx = useMemo<Ctx>(() => ({ inp, wrong, tested, runs }), [inp, wrong, tested, runs]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const busyRef = useRef<number | null>(null);
  busyRef.current = busy;

  const rainMm = (inp.rainMmH * inp.durationMin) / 60;
  const kgNow = rain.state === 'seco' ? 0 : rain.minute <= 0 ? 0 : wash.massKg[Math.min(wash.massKg.length - 1, rain.minute - 1)];
  const onStreet = (buildup(inp.dryDays, inp.sweeping) * STREET.area) / 1000;
  const nFound = found(ctx);
  const answer =
    rain.state === 'seco'
      ? `Cuando llueva, la mugre (${fmt(onStreet, 0)} kg) y la basura de la calle irán por el sumidero y el tubo de aguas lluvias a la quebrada, sin pasar por ninguna planta.`
      : rain.state === 'lloviendo'
        ? `Lloviendo: minuto ${rain.minute} de ${inp.durationMin}. Ya llegaron ${fmt(kgNow, 1)} kg de mugre a la quebrada.`
        : `Llegaron ${fmt(wash.totalKg, 1)} kg de mugre y unos ${wash.trashItems} papeles y plásticos a la quebrada. El ${fmt(wash.firstFlushPct, 0)} % llegó con los primeros 10 mm de lluvia.`;
  const extra = inp.wrongHouses > 0 ? ` Además, ${inp.wrongHouses === 1 ? 'una casa manda' : `${inp.wrongHouses} casas mandan`} su agua usada a la quebrada todos los días, llueva o no.` : '';
  const goLab = (missionId: string) => {
    setCityIntent({ missionId });
    dispatch({ type: 'mode', mode: 'city' });
  };

  const stage = (
    <>
      <Scene3D
        label="Una cuadra ilustrativa en 3D con sus casas de barrio, la calle, el sumidero y, en un corte del suelo, los dos tubos que van debajo: aguas lluvias hacia la quebrada y aguas residuales hacia la planta de tratamiento. Toca una casa para hacer la prueba del colorante."
        viewNames={[
          { id: 'general', label: 'La cuadra' },
          { id: 'calle', label: 'En la calle' },
          { id: 'tubos', label: 'Los tubos' },
          { id: 'quebrada', label: 'La quebrada' },
        ]}
        make={(st) =>
          new StreetWorld(st, {
            onHouse: (i) => {
              if (busyRef.current !== null) return;
              setBusy(i);
              world.current?.dye(i, wrongSet(inpRef.current.wrongHouses).has(i));
            },
            onRainMinute: (m) => setRain({ state: 'lloviendo', minute: m }),
            onRainEnd: () => {
              setRain((r) => ({ state: 'llovio', minute: r.minute }));
              const w = washoff(inpRef.current);
              setRuns((rs) => [...rs.slice(-9), { dryDays: inpRef.current.dryDays, sweeping: inpRef.current.sweeping, rainMmH: inpRef.current.rainMmH, kg: w.totalKg }]);
            },
            onDyeEnd: (i, isWrong) => {
              setTested((t) => new Map(t).set(i, isWrong));
              setBusy(null);
            },
          })
        }
        onReady={(w) => {
          world.current = w;
          w.set(sync.current);
        }}
        onHover={setHover}
      />
      <Question q="¿A dónde va lo que cae en la calle?" answer={answer + extra} tone={rain.state === 'llovio' || inp.wrongHouses > 0 ? 'bad' : 'mid'} />
      <div className="q3-card q3-probe">
        <strong>Prueba del colorante</strong>
        <p className="q3-small">Toca una casa: el colorante rosado baja por su desagüe. ¿Sale en la quebrada o se va a la planta?</p>
        <ul>
          <li className={inp.wrongHouses && nFound === inp.wrongHouses ? 'is-ok' : 'is-mid'}>
            <span>Conexiones erradas</span>
            <b>
              {nFound} de {inp.wrongHouses}
            </b>
          </li>
          <li className="is-ok">
            <span>Bien conectadas</span>
            <b>{[...tested.values()].filter((w) => !w).length} probadas</b>
          </li>
        </ul>
        {busy !== null && <p className="q3-progress">Colorante en la casa {busy + 1}…</p>}
      </div>
      {hover && <p className="q3-hover">{hover}</p>}
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <DockRange label="Días sin llover" value={inp.dryDays} min={1} max={30} step={1} show={`${inp.dryDays} días`} onChange={(v) => set({ dryDays: v })} />
      <DockChoice<'si' | 'no'> label="Barrido de la calle" value={inp.sweeping ? 'si' : 'no'} options={[{ value: 'no', label: 'No' }, { value: 'si', label: 'Sí, cada semana' }]} onChange={(v) => set({ sweeping: v === 'si' })} />
      <DockChoice<'poca' | 'mucha'> label="Basura" value={inp.litter} options={[{ value: 'poca', label: 'Poca' }, { value: 'mucha', label: 'Mucha' }]} onChange={(v) => set({ litter: v })} />
      <DockChoice<'10' | '30' | '60'>
        label="Aguacero de 30 minutos"
        value={String(inp.rainMmH) as '10' | '30' | '60'}
        options={[
          { value: '10', label: 'Suave' },
          { value: '30', label: 'Fuerte' },
          { value: '60', label: 'Muy fuerte' },
        ]}
        onChange={(v) => set({ rainMmH: Number(v) })}
      />
      <DockRange label="Casas con conexión errada" value={inp.wrongHouses} min={0} max={8} step={1} show={`${inp.wrongHouses} de ${STREET.houses}`} onChange={(v) => set({ wrongHouses: v })} />
      <div className="q3-flags">
        <button
          type="button"
          className="q3-flag is-action"
          disabled={rain.state === 'lloviendo'}
          onClick={() => {
            if (rain.state === 'llovio') world.current?.resetStreet();
            setRain({ state: 'lloviendo', minute: 0 });
            world.current?.startRain();
          }}
        >
          {rain.state === 'lloviendo' ? 'Lloviendo…' : `Que llueva (${fmt(rainMm, 0)} mm)`}
        </button>
        {rain.state === 'llovio' && (
          <button
            type="button"
            className="q3-flag is-plain"
            onClick={() => {
              world.current?.resetStreet();
              setRain({ state: 'seco', minute: 0 });
            }}
          >
            Volver a ensuciar la calle
          </button>
        )}
      </div>
    </>
  );

  const shown = rain.state === 'seco' ? -1 : rain.minute;
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la cuadra con los controles de abajo, haz llover y busca las casas mal conectadas. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>La prueba del colorante</h3>
        <p className="q3-small">
          Los técnicos de las empresas de acueducto y alcantarillado echan un colorante inofensivo en el baño o el lavadero de una casa y miran en qué tubo aparece. Si sale en el de aguas lluvias, la casa está mal conectada: su agua usada llega a la quebrada sin tratar, todos los días.
        </p>
        <ul className="q3-houses" aria-label="Casas probadas">
          {[...Array(STREET.houses)].map((_, i) => {
            const t = tested.get(i);
            return (
              <li key={i} className={t === undefined ? '' : t ? 'is-bad' : 'is-ok'}>
                <button type="button" disabled={busy !== null} onClick={() => world.current && (setBusy(i), world.current.dye(i, wrong.has(i)))} aria-label={`Casa ${i + 1}${t === undefined ? ': sin probar' : t ? ': conexión errada' : ': bien conectada'}`}>
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ul>
        <h3>El primer lavado</h3>
        <ProfileChart
          title="Mugre en el agua que entra al sumidero"
          yUnit="mg/L"
          fmtY={(v) => fmt(v, 0)}
          xLabel="minutos de lluvia"
          xUnit="min"
          lines={[{ label: 'mugre', color: '#8a5a2b', points: wash.t.map((t, i) => [t, wash.conc[i]]) }]}
          marks={shown >= 0 ? [{ x: Math.max(1, Math.min(inp.durationMin, shown)), label: 'ahora', strong: true }] : []}
        />
        <p className="q3-small">Al empezar el aguacero el agua sale muy sucia y después se va aclarando, porque ya no queda tanta mugre que arrastrar.</p>
        <h3>Pruébalo en el laboratorio de Medellín</h3>
        <div className="q3-flags">
          <button type="button" className="q3-flag is-action" onClick={() => goLab('sumidero-obstruido')}>
            Misión: sumidero obstruido
          </button>
          <button type="button" className="q3-flag is-action" onClick={() => goLab('conexiones-erradas')}>
            Misión: conexiones erradas
          </button>
        </div>
      </div>
    ),
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La cuadra</caption>
          <tbody>
            <tr>
              <th scope="row">Mugre acumulada en la calle</th>
              <td>
                {fmt(buildup(inp.dryDays, inp.sweeping), 1)} g/m² · {fmt(onStreet, 1)} kg
              </td>
            </tr>
            <tr>
              <th scope="row">Arrastrada por el aguacero</th>
              <td>{fmt(wash.totalKg, 1)} kg</td>
            </tr>
            <tr>
              <th scope="row">En los primeros 10 mm</th>
              <td>{fmt(wash.firstFlushPct, 0)} %</td>
            </tr>
            <tr>
              <th scope="row">Basura que llega al sumidero</th>
              <td>unos {wash.trashItems} objetos</td>
            </tr>
            <tr>
              <th scope="row">Agua usada por conexiones erradas</th>
              <td>{fmt(wash.sewageM3, 1)} m³ cada día</td>
            </tr>
            <tr>
              <th scope="row">Coliformes fecales que llegan por ellas</th>
              <td>{wash.coliformsGiga >= 1000 ? `${fmt(wash.coliformsGiga / 1000, 1)} billones` : `${fmt(wash.coliformsGiga, 0)} mil millones`} al día</td>
            </tr>
          </tbody>
        </table>
        {runs.length > 0 && (
          <table className="q3-table">
            <caption>Aguaceros de esta visita</caption>
            <thead>
              <tr>
                <th scope="col">Días secos</th>
                <th scope="col">Barrido</th>
                <th scope="col">Aguacero</th>
                <th scope="col">Mugre a la quebrada</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r, k) => (
                <tr key={k}>
                  <th scope="row">{r.dryDays}</th>
                  <td>{r.sweeping ? 'sí' : 'no'}</td>
                  <td>{r.rainMmH} mm/h</td>
                  <td>{fmt(r.kg, 1)} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3>¿Qué podemos hacer?</h3>
        <ul className="q3-small">
          <li>Barrer y recoger la basura antes de que llueva; nunca barrerla hacia el sumidero.</li>
          <li>Revisar que el baño, la cocina y el lavadero vayan a la red de aguas residuales, y los techos a la de aguas lluvias.</li>
          <li>Recoger los excrementos de las mascotas: la lluvia también los lleva a la quebrada.</li>
        </ul>
        <button
          type="button"
          className="btn small"
          onClick={() =>
            dispatch({
              type: 'log',
              entry: { kind: 'observacion', title: 'La ciudad y la lluvia', text: `${inp.dryDays} días sin llover, ${inp.sweeping ? 'con' : 'sin'} barrido, aguacero de ${inp.rainMmH} mm/h por ${inp.durationMin} min: ${fmt(wash.totalKg, 1)} kg de mugre a la quebrada (${fmt(wash.firstFlushPct, 0)} % en los primeros 10 mm). Conexiones erradas encontradas: ${nFound} de ${inp.wrongHouses}.` },
            })
          }
        >
          Guardar en la bitácora
        </button>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>El modelo y sus fuentes</h3>
        <p>
          <strong>Acumulación.</strong> B = B<sub>máx</sub>·(1 − e<sup>−k·días</sup>) con B<sub>máx</sub> = 25 g/m² y k = 0,4/día, la forma exponencial que usa el modelo SWMM de la EPA; el barrido la reduce a la mitad. Calle y andenes de {fmt(STREET.area, 0)} m².
        </p>
        <p>
          <strong>Lavado.</strong> Sartor y Boyd (1972): la fracción arrastrada es 1 − e<sup>−0,18·R</sup>, con R la lluvia acumulada en mm (con 13 mm se va cerca del 90 %). La concentración del minuto es la masa arrastrada sobre el agua que escurre (coeficiente 0,9).
        </p>
        <p>
          <strong>Conexiones erradas.</strong> 4 personas por casa y 102 L de agua usada por persona al día con 10⁷ coliformes fecales por 100 mL (orden de magnitud del agua residual doméstica cruda). Las cantidades de mugre y de basura son ilustrativas: muestran la forma del proceso, no medidas de una calle de Medellín.
        </p>
        <p className="q3-small">
          En la escena, cada mancha y cada papel salen de la calle cuando la fracción lavada calculada llega a su turno; lo que la lluvia no alcanza a lavar se queda. La animación dura {fmt(StreetWorld.SEC_PER_MIN, 1)} s por minuto de lluvia. La tierra se dibuja en corte, con un vidrio al frente y en el costado, para ver los tubos. La cuadra es un dibujo ilustrativo: sus casas, tubos, pozos, cajas de inspección, sumidero y descarga no son el levantamiento de una calle de Medellín.
        </p>
        <h3>Para conversar en clase</h3>
        <ol>
          <li>¿Por qué el agua del primer lavado es la más sucia?</li>
          <li>Una casa mal conectada contamina la quebrada aunque no llueva. ¿Por qué?</li>
          <li>¿Qué le pasa al sumidero si llega mucha basura?</li>
        </ol>
      </div>
    ),
  };

  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} />;
}

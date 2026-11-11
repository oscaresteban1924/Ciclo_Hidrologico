// «De la casa al río» en 3D: una planta de tratamiento de aguas residuales de lodos activados, con su línea de
// lodos y el río que recibe la descarga. La pregunta de la escena: ¿el agua que vuelve al río cumple la norma?
// La respuesta se ve en el color del agua de cada tanque, en el lodo, en la pluma del río y en sus peces, y se
// compara con la Resolución 0631 de 2015. La pestaña Procesos explica las once partes con un recorrido guiado.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { Microscope, SettleTest, type SettleSample } from './experiments';
import { DEFAULT_PTAR, ENERGY_GOAL, RES_0631, RIVER_FISH_DO, WEATHER, ptarModel, type Purga, type PtarInput, type Weather } from './ptar';
import { TOUR_S } from './ProcessPanel';
import { PtarPanel } from './PtarPanel';
import { PTAR_UNITS, ptarUnitById, type PtarUnitId } from './ptarUnits';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from './shell';
import { PtarWorld } from './three/ptarWorld';
import { ProfileChart, fmt, fmtBig } from './ui';

type PtarR = ReturnType<typeof ptarModel>;

interface Ctx {
  inp: PtarInput;
  r: PtarR;
  seen: ReadonlySet<PtarUnitId>;
  sawWashout: boolean;
  sawNH4: boolean;
  micro: ReadonlySet<string>;
  probeta: ReadonlySet<string>;
}

const PTAR_RETOS: Reto<Ctx>[] = [
  {
    id: 'w-recorrido',
    title: 'Las once partes',
    goal: 'Mira las once partes de la planta, de la llegada a la deshidratación del lodo, en la pestaña Procesos.',
    hint: 'Usa «Recorrer la planta» o toca cada parte en la escena.',
    check: (c) => c.seen.size >= PTAR_UNITS.length,
    progress: (c) => `Partes vistas: ${c.seen.size} de ${PTAR_UNITS.length}`,
  },
  {
    id: 'w-lavado',
    title: 'Sin recirculación',
    goal: 'Apaga la recirculación del lodo y mira qué les pasa a las bacterias del reactor. Después haz que la planta vuelva a cumplir la norma.',
    hint: 'Sin recirculación, las bacterias se van con el agua más rápido de lo que crecen. Mira el reactor y el panel del agua de salida.',
    check: (c) => c.sawWashout && c.inp.recirc && c.r.complies,
    progress: (c) => (c.sawWashout ? (c.r.complies ? 'Ya viste el lavado; ahora la planta cumple.' : 'Ya viste el lavado. Falta que la planta vuelva a cumplir.') : 'Apaga la recirculación.'),
  },
  {
    id: 'w-amonio',
    title: 'Amonio para los peces',
    goal: 'Pon la purga de lodo en «Mucha» y mira cuánto amonio sale. Después déjalo por debajo de 2 mg/L con los peces del río a salvo.',
    hint: 'Las bacterias que pasan el amonio a nitrato crecen despacio: si el lodo se purga muy seguido, se van antes de multiplicarse. También necesitan oxígeno.',
    check: (c) => c.sawNH4 && c.r.eff.nh4 < 2 && c.r.river.fishOk,
    progress: (c) => (c.sawNH4 ? `Amonio a la salida: ${fmt(c.r.eff.nh4, 1)} mg/L` : 'Pon la purga en «Mucha».'),
  },
  {
    id: 'w-energia',
    title: 'Cumplir gastando poco',
    goal: `En tiempo seco, con 50 000 habitantes o más y la luz UV encendida: que la planta cumpla, el amonio quede por debajo de 2 mg/L, el lodo se asiente bien (IVL de 150 o menos) y la energía neta no pase de ${fmt(ENERGY_GOAL, 2)} kWh por m³.`,
    hint: 'Los sopladores gastan casi toda la energía: prueba con menos oxígeno, pero no tan poco que crezcan bacterias en hilos. ¿El sedimentador primario ayuda o estorba? ¿Y la edad del lodo?',
    check: (c) => c.inp.weather === 'seco' && c.inp.pop >= 50000 && c.inp.uv && c.r.complies && c.r.eff.nh4 < 2 && c.r.reactor.svi <= 150 && c.r.energy.netPerM3 <= ENERGY_GOAL + 1e-9,
    progress: (c) => `Energía neta: ${fmt(c.r.energy.netPerM3, 3)} kWh/m³ · IVL ${Math.round(c.r.reactor.svi)} mL/g · amonio ${fmt(c.r.eff.nh4, 1)} mg/L`,
  },
  {
    id: 'w-crece',
    title: 'La ciudad creció',
    goal: 'Con 100 000 habitantes o más en tiempo seco, haz que la planta cumpla la norma, que ahora es más estricta (más de 3 000 kg/día de DBO5).',
    hint: 'Una sola línea quedó pequeña: mira la carga superficial del sedimentador secundario. ¿Qué pasa si pones en servicio la segunda línea?',
    check: (c) => c.inp.pop >= 100000 && c.inp.weather === 'seco' && c.r.complies,
    progress: (c) => (c.inp.pop < 100000 ? 'Sube los habitantes a 100 000 o más.' : c.inp.weather !== 'seco' ? 'Pon el tiempo seco.' : `Falla: ${c.r.checks.filter((k) => !k.ok).map((k) => k.name.toLowerCase()).join(', ') || 'nada'}`),
  },
  {
    id: 'w-aguacero',
    title: 'El aguacero',
    goal: 'Con un aguacero y 50 000 habitantes o más, que no pase agua sin tratar por el aliviadero y que los peces del río aguanten.',
    hint: 'El aliviadero rebosa cuando llega más agua de la que cabe. ¿Cómo se le da más capacidad a la planta?',
    check: (c) => c.inp.weather === 'aguacero' && c.inp.pop >= 50000 && c.r.Qbypass <= 0 && c.r.river.fishOk,
    progress: (c) => (c.inp.weather !== 'aguacero' ? 'Pon el clima en «Aguacero».' : `Sin tratar: ${fmt(c.r.bypassPct, 0)} % · peces: ${c.r.river.fishOk ? 'sí' : 'no'}`),
  },
  {
    id: 'w-micro',
    title: 'Bacterias a la salida',
    goal: 'Mira con el microscopio el agua tratada con la luz UV apagada y después encendida.',
    hint: 'En Experimentos, elige «Agua tratada»; apaga y prende la luz UV con el botón de abajo.',
    check: (c) => c.micro.has('sin-uv') && c.micro.has('con-uv'),
    progress: (c) => `Muestras: sin UV ${c.micro.has('sin-uv') ? '✓' : '—'} · con UV ${c.micro.has('con-uv') ? '✓' : '—'}`,
  },
  {
    id: 'w-probeta',
    title: 'La probeta de 30 minutos',
    goal: 'Haz la prueba de la probeta con un lodo que se asienta mal (IVL de más de 150) y con uno que se asienta bien.',
    hint: 'Con muy poco oxígeno crecen bacterias en hilos y el lodo «se abulta». Baja el aire, haz la prueba, súbelo y repítela.',
    check: (c) => c.probeta.has('mal') && c.probeta.has('bien'),
    progress: (c) => `Lodo que se asienta mal ${c.probeta.has('mal') ? '✓' : '—'} · bien ${c.probeta.has('bien') ? '✓' : '—'}`,
  },
];

const es = (v: number, d = 0) => v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const mg = (v: number) => es(v, v < 10 ? 1 : 0);
const big = (v: number) => (v < 0.5 ? '0' : fmtBig(v));

export function PtarLab({ head }: { head: ReactNode }) {
  const { state, dispatch } = useStore();
  const reduced = state.prefs.reducedMotion;
  const [inp, setInp] = useState<PtarInput>(DEFAULT_PTAR);
  const [unit, setUnit] = useState<PtarUnitId | null>(null);
  const [card, setCard] = useState(false);
  const [seen, setSeen] = useState<Set<PtarUnitId>>(() => new Set<PtarUnitId>(['llegada']));
  const [touring, setTouring] = useState(false);
  const [fly, setFly] = useState<{ id: string; n: number } | null>(null);
  const [tab, setTab] = useState<PanelTab>('procesos');
  const [hover, setHover] = useState<string | null>(null);
  const [sawWashout, setSawWashout] = useState(false);
  const [sawNH4, setSawNH4] = useState(false);
  const [micro, setMicro] = useState<Set<string>>(new Set());
  const [probeta, setProbeta] = useState<Set<string>>(new Set());
  const [sample, setSample] = useState<'salida' | 'llegada'>('salida');
  const [settle, setSettle] = useState<'cruda' | 'licor' | 'salida'>('licor');
  const world = useRef<PtarWorld | null>(null);
  const r = useMemo(() => ptarModel(inp), [inp]);
  const set = (p: Partial<PtarInput>) => setInp((s) => ({ ...s, ...p }));
  const view = { inp, r, unit };
  const sync = useRef(view);
  sync.current = view;
  useEffect(() => {
    world.current?.set(sync.current);
  }, [inp, r, unit]);
  useEffect(() => {
    if (r.reactor.washout && !inp.recirc) setSawWashout(true);
    if (inp.purga === 'mucha' && r.eff.nh4 >= 5) setSawNH4(true);
  }, [r, inp]);
  const ctx = useMemo<Ctx>(() => ({ inp, r, seen, sawWashout, sawNH4, micro, probeta }), [inp, r, seen, sawWashout, sawNH4, micro, probeta]);
  const flyN = useRef(0);
  const look = (id: string) => setFly({ id, n: ++flyN.current });
  const showInScene = (id: string) => {
    look(id);
    const el = document.querySelector('.q3-scene');
    if (el && el.getBoundingClientRect().bottom < 80) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };
  const pick = (id: PtarUnitId, from: 'panel' | 'escena' | 'recorrido') => {
    setUnit(id);
    setSeen((s) => (s.has(id) ? s : new Set(s).add(id)));
    if (from === 'escena') {
      setCard(true);
      setTab('procesos');
    } else {
      setCard(false);
      look(`u-${id}`);
    }
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const cur: PtarUnitId = unit ?? 'llegada';
  useEffect(() => {
    if (!touring) return;
    const h = window.setTimeout(() => {
      const i = PTAR_UNITS.findIndex((p) => p.id === cur);
      if (i >= PTAR_UNITS.length - 1) {
        setTouring(false);
        look('general');
      } else pick(PTAR_UNITS[i + 1].id, 'recorrido');
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
    pick(unit ?? 'llegada', 'recorrido');
    setTouring(true);
  };
  const { done, fresh, clearFresh } = useRetos(PTAR_RETOS, ctx);

  const fails = r.checks.filter((c) => !c.ok).map((c) => c.name.toLowerCase());
  const tone: 'ok' | 'mid' | 'bad' = !r.complies ? 'bad' : r.Qbypass > 0 || !r.river.fishOk ? 'mid' : 'ok';
  const answer = r.complies
    ? `Sí: cumple los seis análisis de la Resolución 0631 (DBO5 ${mg(r.eff.dbo)} mg/L).${r.Qbypass > 0 ? ` Pero el ${es(r.bypassPct)} % del agua pasó sin tratar por el aliviadero.` : ''}${!r.river.fishOk ? ` En el río, ${r.river.fishWhy.join(' y ')}.` : ''}`
    : `Todavía no: falla ${fails.join(', ')}.${r.reactor.washout ? ' Las bacterias del reactor se lavaron.' : ''}`;
  const u = unit && card ? ptarUnitById(unit) : null;
  const W = WEATHER[inp.weather];

  const stage = (
    <>
      <Scene3D
        label="Planta de tratamiento de aguas residuales en 3D: colector y aliviadero, rejas, desarenador y desengrasador, sedimentador primario, reactor aireado de lodos activados, sedimentador secundario, desinfección con luz ultravioleta, descarga al río, espesador, digestores con biogás y deshidratación del lodo. Toca cada parte para ver qué pasa allí."
        viewNames={[
          { id: 'general', label: 'Toda la planta' },
          { id: 'entrada', label: 'Entrada' },
          { id: 'biologico', label: 'Tratamiento' },
          { id: 'salida', label: 'Salida y río' },
          { id: 'lodos', label: 'Lodos' },
        ]}
        make={(st) => new PtarWorld(st, { onUnit: (id) => pickRef.current(id, 'escena') })}
        flyTo={fly}
        onReady={(w) => {
          world.current = w;
          w.set(sync.current);
        }}
        onHover={setHover}
      />
      <Question q="¿El agua que vuelve al río cumple la norma?" answer={answer} tone={tone} />
      <div className="q3-card q3-probe">
        <strong>A la salida (Resolución 0631)</strong>
        <ul>
          {r.checks.map((c) => (
            <li key={c.id} className={c.ok ? 'is-ok' : 'is-bad'}>
              <span>{c.name}</span>
              <b>{c.ok ? 'cumple' : 'no cumple'}</b>
            </li>
          ))}
          <li className={r.river.fishOk ? 'is-ok' : 'is-bad'}>
            <span>Peces en el río</span>
            <b>{r.river.fishOk ? 'sí' : 'no'}</b>
          </li>
        </ul>
        <button type="button" className="link" onClick={() => setTab('datos')}>
          Ver los números
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
            {u
              .inOut(r, inp)
              .slice(0, 3)
              .map((x) => `${x.label}: ${x.value}`)
              .join(' · ')}
          </p>
          <p className="q3-unit-actions">
            <button type="button" className="link" onClick={() => look(`u-${u.id}`)}>
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

  const flag = (on: boolean, label: string, onClick: () => void) => (
    <button type="button" className={`q3-flag${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onClick}>
      {label}
    </button>
  );
  const dock = (
    <>
      <DockRange label="Habitantes" value={inp.pop} min={10000} max={150000} step={5000} show={inp.pop.toLocaleString('es-CO')} onChange={(v) => set({ pop: Math.round(v / 5000) * 5000 })} />
      <DockChoice<Weather>
        label="Clima"
        value={inp.weather}
        options={[
          { value: 'seco', label: 'Seco' },
          { value: 'lluvia', label: 'Lluvia' },
          { value: 'aguacero', label: 'Aguacero' },
        ]}
        onChange={(v) => set({ weather: v })}
      />
      <DockRange label="Aire en el reactor" value={inp.air} min={0} max={4} step={0.25} show={inp.air > 0 ? `${fmt(inp.air, 2)} mg/L` : 'apagado'} onChange={(v) => set({ air: Math.round(v * 4) / 4 })} />
      <DockChoice<Purga>
        label="Purga de lodo"
        value={inp.purga}
        options={[
          { value: 'poca', label: 'Poca' },
          { value: 'normal', label: 'Normal' },
          { value: 'mucha', label: 'Mucha' },
        ]}
        onChange={(v) => set({ purga: v })}
      />
      <div className="q3-flags">
        {flag(inp.primary, 'Primario', () => set({ primary: !inp.primary }))}
        {flag(inp.recirc, 'Recirculación', () => set({ recirc: !inp.recirc }))}
        {flag(inp.uv, 'Luz UV', () => set({ uv: !inp.uv }))}
        {flag(inp.lines === 2, 'Segunda línea', () => set({ lines: inp.lines === 2 ? 1 : 2 }))}
      </div>
    </>
  );

  const settleSamples: Record<'cruda' | 'licor' | 'salida', SettleSample> = {
    cruda: { id: 'cruda', name: 'agua que llega', kind: 'imhoff', settled: r.raw.ssed, sst: r.raw.sst, topSst: r.raw.sst * 0.55 },
    licor: { id: 'licor', name: r.reactor.washout ? 'agua del reactor (sin lodo)' : 'licor mixto del reactor', kind: 'probeta', settled: r.reactor.washout ? 2 : r.reactor.sv30, sst: r.reactor.mlss, topSst: r.reactor.washout ? r.prim.sst : r.sec.sst, slow: r.reactor.bulking },
    salida: { id: 'salida', name: 'agua tratada', kind: 'imhoff', settled: r.eff.ssed, sst: r.eff.sst, topSst: r.eff.sst * 0.7 },
  };
  const stages = [
    { name: 'Llega', w: r.raw },
    { name: 'Después de rejas y desarenador', w: r.pre },
    { name: inp.primary ? 'Después del primario' : 'Primario fuera de servicio', w: r.prim },
    { name: 'Después del secundario', w: r.sec },
    { name: 'Sale al río (después de la luz UV)', w: r.eff },
  ];
  const prof = useMemo(() => {
    const pts: [number, number][] = [];
    for (let k = 0; k <= 80; k++) pts.push([k * 0.5, r.river.at(k * 0.5).dO]);
    return pts;
  }, [r]);
  const lim = RES_0631[r.cat];

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    procesos: <PtarPanel cur={cur} r={r} inp={inp} seen={seen} touring={touring} reduced={reduced} onPick={(id) => pick(id, 'panel')} onTour={toggleTour} onLook={(id) => showInScene(`u-${id}`)} />,
    retos: <RetosList retos={PTAR_RETOS} ctx={ctx} done={done} intro="Mueve los controles de abajo y mira los tanques, el lodo y el río. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Prueba de sedimentación</h3>
        <div className="q3-seg" role="radiogroup" aria-label="Muestra para la prueba de sedimentación">
          {(['cruda', 'licor', 'salida'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={settle === s} className={settle === s ? 'is-on' : ''} onClick={() => setSettle(s)}>
              {s === 'cruda' ? 'Agua que llega' : s === 'licor' ? 'Lodo del reactor' : 'Agua tratada'}
            </button>
          ))}
        </div>
        <SettleTest
          sample={settleSamples[settle]}
          mlss={settle === 'licor' && !r.reactor.washout ? r.reactor.mlss : undefined}
          onDone={(s) => {
            if (s.kind !== 'probeta' || r.reactor.washout) return;
            setProbeta((p) => new Set(p).add(r.reactor.svi > 150 ? 'mal' : 'bien'));
          }}
        />
        <h3>Una gota en el microscopio</h3>
        <div className="q3-seg" role="radiogroup" aria-label="Muestra para el microscopio">
          {(['salida', 'llegada'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={sample === s} className={sample === s ? 'is-on' : ''} onClick={() => setSample(s)}>
              {s === 'salida' ? 'Agua tratada' : 'Agua que llega'}
            </button>
          ))}
        </div>
        <Microscope
          count={sample === 'salida' ? r.eff.coli : r.raw.coli}
          unit="coliformes por 100 mL"
          what={sample === 'salida' ? `agua tratada (luz UV ${inp.uv ? 'encendida' : 'apagada'})` : 'agua que llega a la planta'}
          onLook={() => {
            if (sample !== 'salida') return;
            setMicro((m) => new Set(m).add(inp.uv ? 'con-uv' : 'sin-uv'));
          }}
        />
        <p className="q3-small">La norma de vertimientos no fija un máximo de coliformes para esta descarga: pide medirlos y reportarlos. La luz UV se usa cuando el río sirve, aguas abajo, para bañarse, regar o tomar agua.</p>
      </div>
    ),
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El agua en cada etapa</caption>
          <thead>
            <tr>
              <th scope="col">Punto</th>
              <th scope="col">DBO5 (mg/L)</th>
              <th scope="col">Sólidos (mg/L)</th>
              <th scope="col">Amonio (mg/L de N)</th>
              <th scope="col">Coliformes (NMP/100 mL)</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.name}>
                <th scope="row">{s.name}</th>
                <td>{mg(s.w.dbo)}</td>
                <td>{mg(s.w.sst)}</td>
                <td>{mg(s.w.nh4)}</td>
                <td>{big(s.w.coli)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="q3-table">
          <caption>A la salida: Resolución 0631 de 2015, art. 8 ({lim.label})</caption>
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
                <td>{c.shown}</td>
                <td>{c.limit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="q3-small">
          Carga que recoge el alcantarillado: {es(r.loadKgD)} kg/día de DBO5. Nitrógeno y fósforo: la norma pide analizarlos y reportarlos; aquí el amonio sale con {mg(r.eff.nh4)} mg/L y el nitrato con {mg(r.eff.no3)} mg/L de N.
        </p>
        <h3>Caudales</h3>
        <dl className="q3-io">
          <div>
            <dt>Llega</dt>
            <dd>{Math.round((r.Qin * 1000) / 86400).toLocaleString('es-CO')} L/s</dd>
          </div>
          <div>
            <dt>Cabe en la planta</dt>
            <dd>{Math.round((r.Qcap * 1000) / 86400).toLocaleString('es-CO')} L/s</dd>
          </div>
          <div>
            <dt>Sin tratar (aliviadero)</dt>
            <dd>{r.Qbypass > 0 ? `${Math.round((r.Qbypass * 1000) / 86400).toLocaleString('es-CO')} L/s (${es(r.bypassPct)} %)` : 'nada'}</dd>
          </div>
          <div>
            <dt>Río antes de la descarga</dt>
            <dd>{fmt(W.river.Q, 1)} m³/s</dd>
          </div>
        </dl>
        <h3>El reactor</h3>
        <dl className="q3-io">
          <div>
            <dt>Edad del lodo</dt>
            <dd>{fmt(r.reactor.srtD, r.reactor.srtD < 2 ? 2 : 1)} días</dd>
          </div>
          <div>
            <dt>Sólidos del licor mixto</dt>
            <dd>{Math.round(r.reactor.mlss).toLocaleString('es-CO')} mg/L</dd>
          </div>
          <div>
            <dt>IVL (probeta)</dt>
            <dd>{r.reactor.washout ? '—' : `${Math.round(r.reactor.svi)} mL/g`}</dd>
          </div>
          <div>
            <dt>Oxígeno que se le da</dt>
            <dd>{es(r.reactor.o2KgD)} kg/día</dd>
          </div>
        </dl>
        <h3>Lodos y energía</h3>
        <dl className="q3-io">
          <div>
            <dt>Lodo primario + biológico</dt>
            <dd>{es(r.sludge.primaryKgD + r.sludge.wasKgD)} kg/día</dd>
          </div>
          <div>
            <dt>Biogás</dt>
            <dd>{es(r.sludge.biogasM3D)} m³/día</dd>
          </div>
          <div>
            <dt>Biosólido (22 % sólidos)</dt>
            <dd>{fmt(r.sludge.cakeTD, 1)} t/día</dd>
          </div>
          <div>
            <dt>Energía de la planta</dt>
            <dd>{es(r.energy.totalKwhD)} kWh/día</dd>
          </div>
          <div>
            <dt>De ella, aireación</dt>
            <dd>{es(r.energy.totalKwhD > 0 ? (r.energy.airKwhD / r.energy.totalKwhD) * 100 : 0)} %</dd>
          </div>
          <div>
            <dt>Electricidad del biogás</dt>
            <dd>
              {es(r.energy.biogasKwhD)} kWh/día ({es(r.energy.coverPct)} %)
            </dd>
          </div>
          <div>
            <dt>Energía neta</dt>
            <dd>{fmt(r.energy.netPerM3, 3)} kWh/m³</dd>
          </div>
        </dl>
        <ProfileChart
          title="Oxígeno del río aguas abajo de la descarga"
          lines={[{ points: prof, color: '#2f6fa8', label: 'oxígeno disuelto' }]}
          yUnit="mg/L"
          refs={[{ y: RIVER_FISH_DO, label: 'peces (4 mg/L)', color: '#c9372c' }]}
          marks={[{ x: r.river.xMinKm, label: `mínimo ${fmt(r.river.minDO, 1)}`, strong: true }]}
          fmtY={(v) => fmt(v, 1)}
          xLabel="distancia aguas abajo de la descarga (km)"
          xUnit="km"
        />
        <p className="q3-small">
          El río del juego es ilustrativo ({fmt(W.river.Q, 1)} m³/s en {W.name.toLowerCase()}). Recibe el agua tratada y, si rebosa el aliviadero, agua sin tratar. Sus bacterias gastan oxígeno descomponiendo lo que llega y el aire se lo devuelve (Streeter y Phelps); el amonio libre, a {fmt(r.river.mix.nh3, 3)} mg/L en la mezcla, es tóxico para los peces por encima de 0,025 mg/L.
        </p>
        <button
          type="button"
          className="btn small"
          onClick={() =>
            dispatch({
              type: 'log',
              entry: {
                kind: 'observacion',
                title: 'De la casa al río',
                text: `${inp.pop.toLocaleString('es-CO')} habitantes, ${W.name.toLowerCase()}, ${inp.lines} línea${inp.lines === 2 ? 's' : ''}; primario ${inp.primary ? 'sí' : 'no'}, aire ${fmt(inp.air, 2)} mg/L, recirculación ${inp.recirc ? 'sí' : 'no'}, purga ${inp.purga}, luz UV ${inp.uv ? 'sí' : 'no'}. Salida: DBO5 ${mg(r.eff.dbo)} mg/L, sólidos ${mg(r.eff.sst)} mg/L, amonio ${mg(r.eff.nh4)} mg/L; ${r.complies ? 'cumple' : 'no cumple'} la Resolución 0631. Aliviadero: ${r.Qbypass > 0 ? `${es(r.bypassPct)} % sin tratar` : 'no rebosa'}. Río: oxígeno mínimo ${fmt(r.river.minDO, 1)} mg/L; peces ${r.river.fishOk ? 'sí' : 'no'}. Energía neta ${fmt(r.energy.netPerM3, 3)} kWh/m³.`,
              },
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
          Resolución 0631 de 2015 del Ministerio de Ambiente, artículo 8: vertimientos de aguas residuales domésticas de los prestadores del servicio de alcantarillado a aguas superficiales. Los límites dependen de la carga de DBO5 que recoge el alcantarillado: hasta 625 kg/día y de 625 a 3 000 kg/día, DQO 180, DBO5 90, sólidos suspendidos 90 y grasas y aceites 20 mg/L; más de 3 000 kg/día, DQO 150, DBO5 70, sólidos 70 y grasas 10 mg/L. En las tres: pH de 6 a 9 y sólidos sedimentables de 5 mL/L o menos; nitrógeno, fósforo, detergentes (SAAM) e hidrocarburos se analizan y reportan. El artículo 6 pide analizar y reportar los coliformes termotolerantes cuando la carga antes del tratamiento pasa de 125 kg/día de DBO5. El juego compara el agua tratada (no la del aliviadero) con esos límites.
        </p>
        <h3>El modelo</h3>
        <p>
          Aguas residuales de 102 L por persona al día con DBO5 de 300, sólidos de 250, amonio de 25 y grasas de 80 mg/L; con lluvia, el alcantarillado combinado trae 2 o 4 veces más agua, más diluida. Cada línea se dimensiona para 50 000 habitantes (5 100 m³/día) y recibe hasta 2,5 veces ese caudal; el resto sale por el aliviadero. Primario: remoción R = t/(a + b·t) con t en horas (Crites y Tchobanoglous). Reactor de mezcla completa con cinética de Monod y edad del lodo θc (Metcalf y Eddy): S = Ks(1 + kd·θc)/(θc(Y·k − kd) − 1), con k = 5 d⁻¹, Ks = 60 mg/L, Y = 0,6, kd = 0,06 d⁻¹ a 20 °C, corregidos a 22 °C y por el oxígeno (K = 0,2 mg/L). Sin recirculación la edad del lodo es el tiempo de retención (6 h) y las bacterias se lavan. Nitrificantes: μ = 0,75 d⁻¹, K_N = 0,74, kd = 0,08 d⁻¹, K_O = 0,5 mg/L. Oxígeno = DBO última removida − 1,42 × lodo producido + 4,57 × N nitrificado; aireación de burbuja fina de 3,6 kg O₂/kWh en agua limpia con α = 0,5. Digestión: 60 % de los sólidos volátiles del lodo primario y 35 % del biológico; 0,9 m³ de biogás por kg destruido, 65 % metano, 35 % de eficiencia eléctrica.
        </p>
        <h3>Reglas didácticas</h3>
        <p>
          Sólidos que escapan del secundario: 10 mg/L con la carga de diseño (24 m³/m²·día), más con más carga, más lodo, un lodo que se asienta mal (IVL) o un lodo muy joven. IVL de 110 mL/g con la purga normal; con menos de 1,2 mg/L de oxígeno crecen bacterias en hilos. Desinfección UV de 3,5 unidades logarítmicas con agua clara, menos con sólidos. Río ilustrativo con reaireación de O&apos;Connor y Dobbins, Streeter y Phelps con nitrificación y lodo del fondo cuando llega agua sin tratar, y criterio de 4 mg/L de oxígeno (aguas cálidas, Decreto 1076 de 2015, art. 2.2.3.3.9.10) y 0,025 mg/L de amoníaco libre. La escena dibuja lo calculado: no es una planta real ni un diseño de ingeniería.
        </p>
        <h3>Medellín</h3>
        <p>
          Las aguas residuales del sur del valle de Aburrá se tratan en San Fernando (Itagüí, desde 2000; 1,8 m³/s nominales) y las del norte en Aguas Claras (Bello, desde 2018; unos 5 m³/s); según EPM, en 2025 se trataba cerca del 93 % de las aguas residuales del valle. San Fernando trata con lodos activados y digiere sus lodos sin aire; Aguas Claras tiene tratamiento secundario, digestión y secado térmico de los lodos. Fuentes en <em>docs/calidad/MODELO_CALIDAD.md</em>. La planta del juego no representa ninguna de ellas.
        </p>
        <h3>Para conversar en clase</h3>
        <ol>
          <li>¿Por qué no se deben botar toallitas, aceite de cocina ni basura por el inodoro o el sifón?</li>
          <li>¿Por qué la planta necesita devolver el lodo al reactor?</li>
          <li>¿Qué gasta más energía en la planta, y cómo puede la misma planta producir parte de su electricidad?</li>
          <li>¿Qué le pasa al río cuando llueve mucho, si el alcantarillado lleva junta la lluvia y el agua usada?</li>
          <li>¿Por qué una ciudad que crece necesita ampliar su planta?</li>
        </ol>
      </div>
    ),
  };

  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['procesos', 'retos', 'experimentos', 'datos', 'docente']} />;
}

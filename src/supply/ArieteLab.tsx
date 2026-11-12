// «El golpe de ariete»: una tubería de 600 m entre un tanque y una válvula. Al cerrar la válvula, la onda de presión
// viaja por el tubo, rebota en el tanque y vuelve; se calcula con el método de las características y se compara con
// Joukowsky, Michaud y Allievi. La pregunta: ¿cuánto sube la presión al cerrar la válvula, y cómo evitar que el tubo se
// rompa?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { HammerChart } from './charts';
import { HammerFlat } from './diagrams';
import { ROOM, SUPPLY_TOOLS } from './design';
import { G, PIPE_MATS, colebrook, nuWater } from './pipes';
import { PVC_RDE, VAPOR_REL, hammer, joukowsky, michaud, waveSpeed, type HammerResult } from './hammer';
import { HAMMER_WALL } from './scene';
import { HAMMER_PLAY, HammerWorld } from './three/hammerWorld';

const L = 600, D = 0.3, H0 = 60;
type HMat = 'acero' | 'hd' | 'pvc' | 'pead';

interface HInput {
  mat: HMat;
  V0: number;
  tc: number;
}

interface Ctx {
  inp: HInput;
  r: HammerResult;
  runs: HammerResult[];
  period: number | null;
}

const rise = (r: HammerResult) => r.maxV - r.Hv0;

const RETOS: Reto<Ctx>[] = [
  {
    id: 'ac-joukowsky',
    title: 'Cierre de golpe',
    goal: 'Cierra la válvula de golpe (tiempo de cierre 0) y mira la onda: la sobrepresión en la válvula debe quedar a menos de 3 % de Joukowsky, a·V/g.',
    hint: 'Pon el tiempo de cierre en 0 y usa «Cerrar la válvula».',
    check: (c) => c.runs.some((r) => r.inp.tc <= r.tr && Math.abs(rise(r) - joukowsky(r.a, r.inp.V0)) / joukowsky(r.a, r.inp.V0) < 0.03),
  },
  {
    id: 'ac-periodo',
    title: 'El periodo de la tubería',
    goal: 'Mide en la gráfica el tiempo entre dos picos de presión en la válvula y escríbelo en Experimentos: debe quedar a menos de 5 % de 4L/a.',
    hint: 'Con un cierre de golpe, la presión en la válvula sube y baja como una onda cuadrada. Lee el tiempo entre dos subidas.',
    check: (c) => c.period !== null && Math.abs(c.period - c.r.period) / c.r.period < 0.05,
    progress: (c) => (c.period === null ? 'Escribe tu medición en Experimentos.' : `Tu periodo ${es(c.period, 2)} s; 4L/a = ${es(c.r.period, 2)} s`),
  },
  {
    id: 'ac-lento',
    title: 'Cerrar despacio',
    goal: 'En acero, con 1,5 m/s o más, cierra la válvula tan despacio que la sobrepresión sea menos de la quinta parte de la de un cierre de golpe.',
    hint: 'La onda tarda 2L/a en ir y volver. Si el cierre dura muchas veces ese tiempo, la onda que vuelve del tanque alivia la presión.',
    check: (c) => c.runs.some((r) => r.inp.mat === 'acero' && r.inp.V0 >= 1.5 && rise(r) < joukowsky(r.a, r.inp.V0) / 5),
  },
  {
    id: 'ac-material',
    title: 'Un tubo que amortigua',
    goal: 'Con un cierre de golpe y 1 m/s o más, encuentra un material con el que la presión suba menos de 40 m.',
    hint: 'La celeridad de la onda depende de lo elástica que sea la pared: un tubo flexible baja la celeridad y la sobrepresión.',
    check: (c) => c.runs.some((r) => r.inp.tc <= r.tr && r.inp.V0 >= 1 && rise(r) < 40),
  },
];

function model(inp: HInput): HammerResult {
  const wall = HAMMER_WALL[inp.mat] as { e: number };
  const a = waveSpeed(D, wall.e, inp.mat);
  const f = colebrook((inp.V0 * D) / nuWater(20), PIPE_MATS[inp.mat].eps / D).f;
  return hammer({ L, D, e: wall.e, mat: inp.mat, H0, V0: inp.V0, f, tc: inp.tc, tEnd: inp.tc + 3 * ((4 * L) / a), N: 60 });
}

export function ArieteLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [inp, setInp] = useState<HInput>({ mat: 'acero', V0: 0.5, tc: 0 });
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [runs, setRuns] = useState<HammerResult[]>([]);
  const [period, setPeriod] = useState<number | null>(null);
  const [tNow, setTNow] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const r = useMemo(() => model(inp), [inp]);
  const world = useRef<HammerWorld | null>(null);
  const sync = useRef(r);
  sync.current = r;
  const playingRef = useRef(false);
  const stopped = useRef(false);
  const lastSet = useRef(-1);
  const onTime = useRef((t: number | null) => {
    if (t === null) {
      if (playingRef.current && !stopped.current) setRuns((x) => [...x, sync.current].slice(-12));
      stopped.current = false;
      playingRef.current = false;
      setPlaying(false);
      setTNow(null);
      return;
    }
    if (Math.abs(t - lastSet.current) > sync.current.inp.tEnd / 200) {
      lastSet.current = t;
      setTNow(t);
    }
  });
  useEffect(() => {
    world.current?.set(sync.current);
    if (playingRef.current) {
      stopped.current = true;
      playingRef.current = false;
      setPlaying(false);
      setTNow(null);
    }
  }, [r]);
  // sin WebGL: reloj propio con la misma duración
  useEffect(() => {
    if (!playing || gl) return;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const t = ((now - t0) / 1000 / HAMMER_PLAY) * sync.current.inp.tEnd;
      if (t >= sync.current.inp.tEnd) {
        onTime.current(null);
        return;
      }
      onTime.current(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, gl]);
  const start = () => {
    playingRef.current = true;
    stopped.current = false;
    lastSet.current = -1;
    setPlaying(true);
    setTNow(0);
    if (gl && world.current) {
      world.current.onTime = (t) => onTime.current(t);
      world.current.play(true);
    }
  };
  const stop = () => {
    stopped.current = true;
    if (gl && world.current) world.current.play(false);
    else onTime.current(null);
  };
  const ctx = useMemo<Ctx>(() => ({ inp, r, runs, period }), [inp, r, runs, period]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<HInput>) => setInp((x) => ({ ...x, ...p }));
  const J = joukowsky(r.a, inp.V0);
  const fast = inp.tc <= r.tr;
  const cls = inp.mat === 'pvc' ? PVC_RDE[3] : null;
  const k = tNow === null ? r.t.length - 1 : Math.min(r.t.length - 1, Math.round(tNow / r.dt));
  const frameIdx = tNow === null ? r.frames.length - 1 : Math.min(r.frames.length - 1, Math.round((tNow / r.inp.tEnd) * (r.frames.length - 1)));
  const tone: 'ok' | 'mid' | 'bad' = r.vapor || (cls && r.maxV > cls.m) ? 'bad' : rise(r) > 0.5 * r.Hv0 ? 'mid' : 'ok';
  const answer = (
    <>
      En {PIPE_MATS[inp.mat].name.toLowerCase()} la onda viaja a <strong>{es(r.a, 0)} m/s</strong> e ida y vuelta tarda 2L/a = {es(r.tr, 2)} s. {fast ? `Cerrando en ${es(inp.tc, 1)} s (cierre rápido), la presión sube a·V/g = ${es(J, 0)} m: de ${es(r.Hv0, 0)} a ${es(r.maxV, 0)} m.` : `Cerrando en ${es(inp.tc, 1)} s (cierre lento), la presión sube ${es(rise(r), 1)} m en vez de ${es(J, 0)} m.`}{' '}
      {r.vapor ? 'Después baja hasta la presión de vapor: el agua se separa y al juntarse de nuevo golpea más fuerte (el cálculo ya no vale).' : `Después baja hasta ${es(r.minV, 0)} m.`}
      {cls && ` El tubo de PVC RDE ${cls.rde} aguanta ${es(cls.m, 0)} m: ${r.maxV <= cls.m ? 'resiste' : 'se puede romper'}.`}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Tubería recta de 600 m en 3D, entre un tanque en la loma y una casa de válvulas en el valle. Al cerrar la válvula, el tubo se colorea con la onda de presión (rojo donde sube, azul donde baja) y la línea piezométrica sube y baja sobre él, a escala."
          viewNames={[
            { id: 'general', label: 'La tubería' },
            { id: 'valvula', label: 'La válvula' },
            { id: 'tanque', label: 'El tanque' },
          ]}
          make={(st) => new HammerWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.onTime = (t) => onTime.current(t);
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <HammerFlat r={r} frame={frameIdx} />
        </FlatStage>
      )}
      <Question q="¿Cuánto sube la presión al cerrar la válvula, y cómo evitar que el tubo se rompa?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`a = ${es(r.a, 0)} m/s`, `Joukowsky +${es(J, 0)} m`, `máximo ${es(r.maxV, 0)} m`]}
        chart={<HammerChart r={r} tNow={tNow} />}
        traces={[
          { key: 'h', label: 'Cota en la válvula', unit: 'm', value: playing ? r.Hv[k] : r.Hv0, digits: 1, ref: cls ? { value: cls.m, label: `clase RDE ${cls.rde}` } : { value: r.Hv0 + J, label: 'Joukowsky' } },
          { key: 'q', label: 'Caudal en la válvula', unit: 'L/s', value: (playing ? r.Qv[k] : r.Qv[0]) * 1000, digits: 1 },
        ]}
      />
      <div className="hc-flood">
        {playing ? (
          <>
            <span className="hc-flood-q">t = {es(tNow ?? 0, 2)} s</span>
            <button type="button" onClick={stop}>
              Detener
            </button>
          </>
        ) : (
          <button type="button" onClick={start} title={`Reproduce ${es(r.inp.tEnd, 1)} s del cálculo en ${HAMMER_PLAY} s`}>
            Cerrar la válvula
          </button>
        )}
      </div>
      <DockChoice<HMat> label="Material del tubo" value={inp.mat} options={(['acero', 'hd', 'pvc', 'pead'] as HMat[]).map((m) => ({ value: m, label: m === 'hd' ? 'Hierro dúctil' : m === 'pead' ? 'PEAD' : PIPE_MATS[m].name }))} onChange={(v) => set({ mat: v })} />
      <DockRange label="Velocidad del agua" value={inp.V0} min={0.5} max={2.5} step={0.1} show={`${es(inp.V0, 1)} m/s`} onChange={(v) => set({ V0: v })} />
      <DockRange label="Tiempo de cierre" value={inp.tc} min={0} max={20} step={0.5} show={inp.tc > 0 ? `${es(inp.tc, 1)} s` : 'de golpe'} onChange={(v) => set({ tc: v })} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <HammerFlat r={r} frame={frameIdx} />
        <h3>El agua no se puede frenar de golpe</h3>
        <p>
          Si la válvula se cierra de golpe, el agua que llega choca con la que ya se detuvo: se comprime un poco y el tubo se estira. Esa zona de alta presión viaja hacia el tanque a la <strong>celeridad</strong> a (más de 1 000 m/s en acero, unos 360 m/s en PVC), rebota en el tanque y vuelve como una baja presión. La presión en la válvula sube y baja con un periodo de 4L/a hasta que la fricción la apaga.
        </p>
        <h3>Joukowsky, Michaud y Allievi</h3>
        <p>
          Con un cierre más rápido que 2L/a la sobrepresión es la de Joukowsky, ΔH = a·V/g. Con un cierre lento, la onda que vuelve del tanque alivia la presión antes de que termine el cierre: Michaud estima ΔH ≈ 2LV/(g·tc), un límite superior. El cálculo en el tiempo (método de las características) da el valor para el cierre real de la válvula.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el material, la velocidad y el tiempo de cierre, y cierra la válvula. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Mide el periodo</h3>
        <PeriodReading onResult={setPeriod} r={r} key={`${inp.mat}-${inp.V0}-${inp.tc}`} />
        <h3>Tres fórmulas contra el cálculo</h3>
        <table className="q3-table">
          <tbody>
            <Row name="Joukowsky (cierre de golpe)" value={`+${es(J, 2)} m`} />
            <Row name="Michaud (cierre lento)" value={inp.tc > 0 ? `+${es(michaud(L, inp.V0, inp.tc), 2)} m` : '—'} note="límite superior" />
            <Row name="Allievi (columna rígida)" value={inp.tc > 0 ? `+${es(allievi(inp.V0, inp.tc), 2)} m` : '—'} note="sin elasticidad" />
            <Row name="Método de las características" value={`+${es(rise(r), 2)} m`} note={`${fast ? 'cierre rápido' : 'cierre lento'}, con fricción`} />
          </tbody>
        </table>
        <h3>Cierres hechos</h3>
        {runs.length ? (
          <ul className="q3-small">
            {runs.slice(-6).map((x, i) => (
              <li key={i}>
                {PIPE_MATS[x.inp.mat].name}, {es(x.inp.V0, 1)} m/s, cierre {x.inp.tc > 0 ? `en ${es(x.inp.tc, 1)} s` : 'de golpe'}: +{es(rise(x), 1)} m{x.vapor ? ' (llegó a la presión de vapor)' : ''}.
              </li>
            ))}
          </ul>
        ) : (
          <p className="q3-small">Usa «Cerrar la válvula» al pie de la escena.</p>
        )}
      </div>
    ),
    diseno: <DesignTab part="ariete" set={SUPPLY_TOOLS.ariete} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La tubería (ilustrativa)</caption>
          <tbody>
            <Row name="Largo y diámetro" value={`${L} m · ${D * 1000} mm`} />
            <Row name="Pared" value={(HAMMER_WALL[inp.mat] as { note: string }).note} note={`E = ${es(PIPE_MATS[inp.mat].E / 1e9, 1)} GPa`} />
            <Row name="Celeridad de la onda" value={`${es(r.a, 1)} m/s`} note="Korteweg, K = 2,19 GPa" />
            <Row name="2L/a y 4L/a" value={`${es(r.tr, 3)} s · ${es(r.period, 3)} s`} />
            <Row name="Carga del tanque" value={`${H0} m sobre el tubo`} note={`en la válvula, antes del cierre: ${es(r.Hv0, 2)} m`} />
            <Row name="Factor de fricción" value={es(r.inp.f, 4)} note="Colebrook, régimen permanente" />
            <Row name="Máximo y mínimo en la válvula" value={`${es(r.maxV, 2)} m · ${es(r.minV, 2)} m`} />
            <Row name="Presión de vapor" value={`${es(VAPOR_REL, 1)} m`} note={r.vapor ? 'se alcanza: separación de columna' : 'no se alcanza'} />
            <Row name="Cálculo" value={`${r.frames[0].H.length - 1} tramos, Δt = ${es(r.dt * 1000, 2)} ms`} note={`${es(r.inp.tEnd, 1)} s simulados`} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>La compresibilidad del agua y la elasticidad del tubo; la celeridad de la onda; la sobrepresión de Joukowsky; el tiempo crítico 2L/a y el periodo 4L/a; cierres rápidos y lentos; la depresión y la separación de columna; cómo se protege una tubería (cierre lento, materiales flexibles, válvulas de alivio, tanques de oscilación).</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Celeridad de Korteweg para un tubo de pared delgada con juntas de expansión; método de las características con malla regular (Δx = a·Δt), tanque de nivel fijo aguas arriba y válvula con Q = τ·Q0·√(H/H0), con el área que baja en línea recta; fricción permanente de Darcy (Wylie y Streeter, 1993; Chaudhry, 2014). Michaud y la fórmula de columna rígida de Allievi para comparar. Clases de presión del PVC por RDE a 23 °C. Pruebas A8 a A11.
        </p>
        <h3>Límites</h3>
        <p>No se modela la separación de columna (se avisa cuando la presión llega a la de vapor) ni la fricción no permanente, que en un tubo real amortigua más rápido la oscilación. La tubería es horizontal e ilustrativa.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

/** Sobrepresión con la columna rígida de Allievi para un cierre lento (m). */
function allievi(V0: number, tc: number): number {
  const k = (L * V0) / (G * H0 * tc);
  return H0 * (k / 2) * (k + Math.sqrt(k * k + 4));
}

function PeriodReading({ r, onResult }: { r: HammerResult; onResult: (T: number) => void }) {
  const [txt, setTxt] = useState('');
  const [res, setRes] = useState<number | null>(null);
  const calc = () => {
    const v = Number(txt.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return;
    setRes(v);
    onResult(v);
  };
  return (
    <div className="q3-exp">
      <p className="q3-small">En la gráfica de los instrumentos, la presión en la válvula sube, baja y vuelve a subir. Lee el tiempo entre dos subidas seguidas y escríbelo.</p>
      <div className="hc-read">
        <label htmlFor="ac-per">Periodo medido (s)</label>
        <input id="ac-per" inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && calc()} />
        <button type="button" className="btn btn-primary" onClick={calc}>
          Comparar
        </button>
      </div>
      {res !== null && (
        <p className={Math.abs(res - r.period) / r.period < 0.05 ? 'q3-progress is-ok' : 'q3-progress'}>
          Tu periodo: {es(res, 2)} s; la teoría, 4L/a = 4·{L}/{es(r.a, 0)} = {es(r.period, 3)} s ({es((Math.abs(res - r.period) / r.period) * 100, 1)} % de diferencia).
        </p>
      )}
    </div>
  );
}

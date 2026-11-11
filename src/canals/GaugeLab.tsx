// «Medir el caudal»: un canal de laboratorio con un vertedero rectangular, uno triangular o una compuerta. La bomba
// da un caudal; el estudiante lee la regla, calcula la carga sobre la cresta y, con la fórmula de la estructura,
// el caudal. También puede medir con un flotador y armar la curva de calibración. La pregunta: ¿cuánta agua pasa?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from './design';
import { FlatStage, Row, es } from './common';
import { GaugeDiagram } from './diagrams';
import { DEFAULT_GAUGE, FLOAT_K, FLUME, G, gaugeModel, powerFit, rectWeirQ, triWeirQ, type Device, type GaugeInput, type GaugeResult } from './hydraulics';
import { GaugeWorld } from './three/gaugeWorld';

interface Ctx {
  inp: GaugeInput;
  r: GaugeResult;
  reads: { device: Device; Qls: number; err: number }[];
  floatErr: number | null;
  fit: { device: Device; m: number; n: number } | null;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'hc-aforo-rect',
    title: 'Aforo con el vertedero rectangular',
    goal: 'Con el vertedero rectangular, lee la regla, calcula la carga y obtén el caudal con menos de 3 % de diferencia con la bomba.',
    hint: 'La regla mide desde el fondo del canal; la carga H se mide desde la cresta, que está a 15 cm. Escribe tu lectura en Experimentos.',
    check: (c) => c.reads.some((x) => x.device === 'rect' && x.err < 0.03),
  },
  {
    id: 'hc-aforo-tri',
    title: 'Poca agua: el triangular',
    goal: 'Con 4 L/s o menos, mide con el vertedero triangular con menos de 3 % de diferencia.',
    hint: 'Con poca agua, el triángulo da cargas más altas y fáciles de leer que el rectangular. El vértice está a 8 cm del fondo.',
    check: (c) => c.reads.some((x) => x.device === 'tri' && x.Qls <= 4 && x.err < 0.03),
  },
  {
    id: 'hc-flotador',
    title: 'Medir con un flotador',
    goal: 'Mide el caudal con el flotador (cronómetro en mano) con menos de 10 % de diferencia con la bomba.',
    hint: 'Detén el cronómetro justo cuando el flotador pasa la marca de 2 m. La velocidad media es 0,85 veces la de la superficie.',
    check: (c) => c.floatErr !== null && c.floatErr < 0.1,
    progress: (c) => (c.floatErr === null ? 'Suelta el flotador en Experimentos.' : `Última medición: ${es(c.floatErr * 100, 0)} % de diferencia`),
  },
  {
    id: 'hc-curva',
    title: 'La curva de calibración',
    goal: 'Anota al menos tres puntos con el mismo vertedero y ajusta la curva Q = k·H^m: el exponente debe salir cerca del teórico (1,5 el rectangular, 2,5 el triangular).',
    hint: 'Cambia el caudal de la bomba entre punto y punto, y anota cada uno.',
    check: (c) => !!c.fit && c.fit.n >= 3 && Math.abs(c.fit.m - (c.fit.device === 'tri' ? 2.5 : 1.5)) < (c.fit.device === 'tri' ? 0.1 : 0.15),
    progress: (c) => (c.fit ? `Exponente ${es(c.fit.m, 2)} con ${c.fit.n} puntos` : 'Anota puntos en Experimentos.'),
  },
];

const DEV_NAME: Record<Device, string> = { rect: 'Vertedero rectangular', tri: 'Vertedero triangular', gate: 'Compuerta' };

export function GaugeLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const { state } = useStore();
  const [inp, setInp] = useState<GaugeInput>(DEFAULT_GAUGE);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [reads, setReads] = useState<Ctx['reads']>([]);
  const [floatErr, setFloatErr] = useState<number | null>(null);
  const [pts, setPts] = useState<{ device: Device; H: number; Q: number }[]>([]);
  const r = useMemo(() => gaugeModel(inp), [inp]);
  const world = useRef<GaugeWorld | null>(null);
  const sync = useRef(r);
  sync.current = r;
  useEffect(() => world.current?.set(sync.current), [r]);
  const fit = useMemo(() => {
    const own = pts.filter((p) => p.device === inp.device && p.device !== 'gate');
    const f = powerFit(own);
    return f ? { device: inp.device, m: f.m, k: f.k, n: own.length } : null;
  }, [pts, inp.device]);
  const ctx = useMemo<Ctx>(() => ({ inp, r, reads, floatErr, fit }), [inp, r, reads, floatErr, fit]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<GaugeInput>) => setInp((s) => ({ ...s, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.overflow ? 'bad' : r.thin || r.gateFree ? 'mid' : 'ok';
  const answer = r.overflow
    ? 'No se puede medir así: el agua rebosa el canal. Baja el caudal o abre la compuerta.'
    : r.gateFree
      ? 'La compuerta quedó por encima del agua: no controla nada y no sirve para medir. Bájala.'
      : r.inp.device === 'gate'
        ? `Con la compuerta abierta ${es(inp.gate * 100, 1)} cm el agua sube a ${es(r.yUp * 100, 1)} cm. Con Cd = ${es(r.Cd ?? 0, 3)}, Q = Cd · a · b · √(2g · y1) da ${es(r.inp.Qls, 1)} L/s.`
        : `La regla marca ${es(r.yUp * 100, 1)} cm; menos la ${r.inp.device === 'rect' ? 'cresta' : 'altura del vértice'} (${es((r.inp.device === 'rect' ? FLUME.P : FLUME.Ptri) * 100, 0)} cm), la carga es ${es(r.H * 100, 1)} cm y la fórmula da ${es(r.inp.Qls, 1)} L/s.${r.thin ? ' Con tan poca carga la medición no es confiable.' : ''}`;

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Canal de laboratorio en 3D con paredes de vidrio: la bomba lleva el agua al tanque de llegada; el agua pasa por el vertedero o bajo la compuerta y vuelve al tanque de abajo. La regla, aguas arriba, sirve para leer la profundidad."
          viewNames={[
            { id: 'general', label: 'El canal' },
            { id: 'estructura', label: 'La estructura' },
            { id: 'regla', label: 'La regla' },
          ]}
          make={(st) => new GaugeWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <GaugeDiagram r={r} />
        </FlatStage>
      )}
      <Question q="¿Cuánta agua pasa? Mídelo con la estructura." answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <DockChoice<Device>
        label="Estructura"
        value={inp.device}
        options={[
          { value: 'rect', label: 'Rectangular' },
          { value: 'tri', label: 'Triangular' },
          { value: 'gate', label: 'Compuerta' },
        ]}
        onChange={(v) => set({ device: v })}
      />
      <DockRange label="Caudal de la bomba" value={inp.Qls} min={0.5} max={25} step={0.5} show={`${es(inp.Qls, 1)} L/s`} onChange={(v) => set({ Qls: v })} />
      {inp.device === 'gate' && <DockRange label="Abertura de la compuerta" value={inp.gate * 100} min={2} max={12} step={0.5} show={`${es(inp.gate * 100, 1)} cm`} onChange={(v) => set({ gate: v / 100 })} />}
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <GaugeDiagram r={r} />
        <h3>Un vertedero convierte una altura en caudal</h3>
        <p>
          Cuanta más agua pasa, más alto se pone el agua sobre la cresta. Esa altura, la <strong>carga H</strong>, se mide aguas arriba (a 3 o 4 veces H, donde la superficie todavía no baja) y desde la cresta, no desde el fondo. Con la fórmula del vertedero se obtiene el caudal: el rectangular sigue H<sup>1,5</sup> y el triangular H<sup>2,5</sup>, por eso el triangular es mejor para caudales pequeños.
        </p>
        <h3>La compuerta</h3>
        <p>Bajo la compuerta el agua sale rápida y delgada (la vena contraída mide 0,61 de la abertura). Igualando la energía antes y después se obtiene el caudal: Q = Cd · a · b · √(2g · y1), con Cd entre 0,5 y 0,6.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la estructura y el caudal de la bomba, lee la regla y mide. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Lee la regla y calcula</h3>
        <ReadGauge
          r={r}
          onRead={(_q, err) => setReads((x) => [...x, { device: inp.device, Qls: inp.Qls, err }].slice(-30))}
          key={`${inp.device}-${inp.Qls}-${inp.gate}`}
        />
        <h3>El flotador</h3>
        <FloatTimer r={r} reduced={state.prefs.reducedMotion} onDrop={() => world.current?.dropFloat() ?? (2 / (r.Vup / FLOAT_K))} onResult={(err) => setFloatErr(err)} />
        <h3>La curva de calibración</h3>
        <Calibration
          device={inp.device}
          pts={pts.filter((p) => p.device === inp.device)}
          fit={fit}
          onAdd={() => inp.device !== 'gate' && setPts((x) => [...x.filter((p) => !(p.device === inp.device && Math.abs(p.Q - r.Q) < 1e-9)), { device: inp.device, H: r.H, Q: r.Q }])}
          onClear={() => setPts((x) => x.filter((p) => p.device !== inp.device))}
        />
      </div>
    ),
    diseno: <DesignTab part="aforo" />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El canal de laboratorio</caption>
          <tbody>
            <Row name="Canal" value={`${es(FLUME.b * 100, 0)} cm de ancho, ${es(FLUME.H * 100, 0)} cm de alto`} />
            <Row name="Estructura" value={DEV_NAME[inp.device]} note={inp.device === 'rect' ? `cresta a ${es(FLUME.P * 100, 0)} cm; Rehbock: Cd = 0,611 + 0,08 H/P` : inp.device === 'tri' ? `vértice a ${es(FLUME.Ptri * 100, 0)} cm; 90°, Cd = ${es(FLUME.triCd, 2)}` : `contracción Cc = ${es(FLUME.Cc, 2)}`} />
            <Row name="Caudal de la bomba" value={`${es(inp.Qls, 1)} L/s`} />
            <Row name="Profundidad aguas arriba" value={`${es(r.yUp * 100, 2)} cm`} />
            {inp.device !== 'gate' && <Row name="Carga sobre la cresta" value={`${es(r.H * 100, 2)} cm`} note={r.thin ? 'demasiado baja para medir bien' : ''} />}
            {inp.device === 'gate' && <Row name="Vena contraída" value={r.yVena ? `${es(r.yVena * 100, 2)} cm` : '—'} />}
            {inp.device === 'gate' && <Row name="Coeficiente de descarga" value={r.Cd ? es(r.Cd, 3) : '—'} />}
            <Row name="Velocidad media aguas arriba" value={`${es(r.Vup, 3)} m/s`} />
            <Row name="Velocidad de la superficie" value={`${es(r.Vup / FLOAT_K, 3)} m/s`} note={`media / ${es(FLOAT_K, 2)}`} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Aforo de caudales con estructuras de pared delgada y con compuerta; lectura de una regla (la carga se mide desde la cresta); calibración de una estructura con una ley potencial; aforo con flotador y su coeficiente; por qué cada estructura sirve para un rango de caudales.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Rectangular sin contracciones de Rehbock (1929): Q = ⅔ · Cd · b · √(2g) · H^1,5 con Cd = 0,611 + 0,08 H/P, válido con H de 3 cm o más. Triangular de 90°: Q = 8⁄15 · Cd · √(2g) · tan(45°) · H^2,5 con Cd = 0,58 (Kindsvater y Shen), que da 1,37 H^2,5 en el SI; se recomienda H de al menos 6 cm (USBR, Water Measurement Manual). Compuerta con salida libre: energía igual antes y en la vena contraída (Cc = 0,61, Henderson 1966). Flotador: velocidad media ≈ 0,85 de la superficial (USBR). Pruebas H11.
        </p>
        <h3>Límites</h3>
        <p>La lámina se supone bien aireada y con caída libre; no se calcula la sumersión aguas abajo. Las mediciones del juego no tienen error de la bomba: la diferencia sale de la lectura del estudiante (regla y cronómetro).</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

function ReadGauge({ r, onRead }: { r: GaugeResult; onRead: (Qls: number, err: number) => void }) {
  const [txt, setTxt] = useState('');
  const [res, setRes] = useState<{ Q: number; err: number } | null>(null);
  const dev = r.inp.device;
  const crest = dev === 'rect' ? FLUME.P : dev === 'tri' ? FLUME.Ptri : 0;
  const calc = () => {
    const v = Number(txt.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return;
    const y = v / 100;
    const H = y - crest;
    let Q: number;
    if (dev === 'rect') Q = rectWeirQ(Math.max(0, H));
    else if (dev === 'tri') Q = triWeirQ(Math.max(0, H));
    else Q = (r.Cd ?? 0.6) * r.inp.gate * FLUME.b * Math.sqrt(2 * G * y);
    const err = Math.abs(Q - r.Q) / r.Q;
    setRes({ Q, err });
    onRead(Q * 1000, err);
  };
  return (
    <div className="q3-exp">
      <p className="q3-small">
        Mira la regla en la escena (vista «La regla») o en el esquema, y escribe cuántos centímetros marca el agua. {dev === 'gate' ? 'Con la compuerta se usa la profundidad completa.' : `Para la carga, réstale ${es(crest * 100, 0)} cm.`}
      </p>
      <div className="hc-read">
        <label htmlFor="hc-read-in">La regla marca (cm)</label>
        <input id="hc-read-in" inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && calc()} />
        <button type="button" className="btn btn-primary" onClick={calc}>
          Calcular
        </button>
      </div>
      {res && (
        <p className={res.err < 0.03 ? 'q3-progress is-ok' : 'q3-progress'}>
          Tu medición: {es(res.Q * 1000, 2)} L/s; la bomba: {es(r.inp.Qls, 1)} L/s; diferencia {es(res.err * 100, 1)} %.
        </p>
      )}
    </div>
  );
}

function FloatTimer({ r, reduced, onDrop, onResult }: { r: GaugeResult; reduced: boolean; onDrop: () => number; onResult: (err: number) => void }) {
  const [t0, setT0] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [res, setRes] = useState<{ t: number; Q: number; err: number } | null>(null);
  useEffect(() => {
    if (t0 === null) return;
    let raf = 0;
    const loop = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [t0]);
  const finish = (t: number) => {
    const Vs = 2 / t;
    const Q = FLOAT_K * Vs * FLUME.b * r.yUp;
    const err = Math.abs(Q - r.Q) / r.Q;
    setRes({ t, Q, err });
    setT0(null);
    onResult(err);
  };
  return (
    <div className="q3-exp">
      <p className="q3-small">El flotador recorre 2 m sobre la superficie. Suelta el flotador, mira la escena y detén el cronómetro cuando cruce la marca.</p>
      <div className="hc-read">
        {t0 === null ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const real = onDrop();
              if (reduced) finish(real);
              else setT0(performance.now());
            }}
          >
            Soltar el flotador
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => finish((performance.now() - t0) / 1000)}>
            Detener ({es((now - t0) / 1000, 1)} s)
          </button>
        )}
      </div>
      {res && (
        <p className={res.err < 0.1 ? 'q3-progress is-ok' : 'q3-progress'}>
          {es(res.t, 2)} s en 2 m: superficie a {es(2 / res.t, 3)} m/s; media ≈ 0,85 × eso; caudal ≈ {es(res.Q * 1000, 2)} L/s (la bomba da {es(r.inp.Qls, 1)}; diferencia {es(res.err * 100, 0)} %).
        </p>
      )}
    </div>
  );
}

function Calibration({ device, pts, fit, onAdd, onClear }: { device: Device; pts: { H: number; Q: number }[]; fit: { m: number; k: number; n: number } | null; onAdd: () => void; onClear: () => void }) {
  if (device === 'gate') return <p className="q3-small">La curva de calibración se arma con los vertederos.</p>;
  const Hmax = Math.max(0.12, ...pts.map((p) => p.H)) * 1.15;
  const Qmax = Math.max(0.006, ...pts.map((p) => p.Q)) * 1.15;
  const X = (h: number) => 40 + (h / Hmax) * 420, Y = (q: number) => 130 - (q / Qmax) * 118;
  return (
    <div className="q3-exp">
      <svg viewBox="0 0 480 150" className="hc-exp-svg" role="img" aria-label={`Curva de calibración con ${pts.length} puntos.`}>
        <line x1="40" y1="130" x2="470" y2="130" stroke="#17324d" />
        <line x1="40" y1="8" x2="40" y2="130" stroke="#17324d" />
        {fit && <polyline points={[...Array(40)].map((_, k) => { const h = (Hmax * (k + 1)) / 40; return `${X(h)},${Y(fit.k * Math.pow(h, fit.m))}`; }).join(' ')} fill="none" stroke="#2f7fb0" strokeWidth="2" />}
        {pts.map((p, k) => (
          <circle key={k} cx={X(p.H)} cy={Y(p.Q)} r="4.5" fill="#c0462a" />
        ))}
        <text x="466" y="146" textAnchor="end" className="lz-s" fill="#17324d">carga H</text>
        <text x="44" y="16" className="lz-s" fill="#17324d">caudal Q</text>
      </svg>
      <p className="q3-small">{fit ? `Ajuste: Q = ${es(fit.k, 3)} · H^${es(fit.m, 2)} (Q en m³/s, H en m) con ${fit.n} puntos.` : 'Anota dos puntos o más para ajustar la curva.'}</p>
      <div className="hc-read">
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          Anotar este punto
        </button>
        <button type="button" className="link" onClick={onClear}>
          Borrar los puntos
        </button>
      </div>
    </div>
  );
}

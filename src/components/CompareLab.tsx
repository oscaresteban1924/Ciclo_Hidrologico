// Laboratorio de comparación: un escenario de referencia (A) y otro con una sola condición cambiada (B).
// Secuencia: pregunta → predicción → cambio → ejecutar y observar → comparar → explicar.
// Ambos escenarios se simulan a la vez con el mismo reloj; la velocidad de reproducción no cambia
// las condiciones ni los resultados, solo el ritmo con que se muestran.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { COMPARE_EXPERIMENTS, RAIN_NAMES, VAR_NAMES, constantsOf, scenariosOf, valueLabel, type Metric, type Scenario, type VarKey } from '../content/compare';
import { INPUT_NAMES } from '../lab/model';
import { STORM, balance, createStorm, rainTotal, stepStorm, type Balance, type StormSample, type StormState } from '../lab/storm';
import { useStore, type ScenarioKey, type StormRun } from '../state/store';
import { Disclosure, Segmented } from './ui';

const TICK_MS = 100;
const SUB_DT = 0.05;
const COLORS: Record<ScenarioKey, string> = { A: '#1f78b4', B: '#c8691a' };

const fmt = (v: number, d = 1) => v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const mm = (v: number) => `${Math.round(v)} mm`;

export interface RunStats {
  peak: number;
  peakT: number;
  lag: number;
  river: number;
  baseEnd: number;
}

export function runStats(run: StormRun | null): RunStats | null {
  if (!run || !run.samples.length) return null;
  let peak = -1;
  let peakT = 0;
  let rainPeak = -1;
  let rainT = 0;
  for (const s of run.samples) {
    if (s.t >= STORM.rainStart && s.total > peak) {
      peak = s.total;
      peakT = s.t;
    }
    if (s.rain > rainPeak) {
      rainPeak = s.rain;
      rainT = s.t;
    }
  }
  const last = run.samples[run.samples.length - 1];
  return { peak, peakT, lag: Math.max(0, peakT - rainT), river: run.balance?.river ?? 0, baseEnd: last.base };
}

/** Bucle de simulación de los dos escenarios (montado mientras el laboratorio está abierto). */
export function useCompareLoop() {
  const { state, dispatch } = useStore();
  const sims = useRef<{ id: number; A: StormState; B: StormState } | null>(null);
  const { running, runId, A, B } = state.cmp;
  const paused = state.paused;
  const speed = state.speed;

  useEffect(() => {
    if (!running || !A || !B) return;
    if (!sims.current || sims.current.id !== runId) sims.current = { id: runId, A: createStorm(A.inputs), B: createStorm(B.inputs) };
    if (paused) return;
    const h = window.setInterval(() => {
      const s = sims.current;
      if (!s) return;
      const raining = (sc: StormRun, st: StormState) => st.t >= STORM.rainStart - 0.5 && st.t <= STORM.rainStart + sc.rain.duration + 2;
      // más despacio mientras llueve, para poder observar; luego más rápido
      const hours = (raining(A, s.A) || raining(B, s.B) ? 0.12 : 0.3) * speed;
      const steps = Math.max(1, Math.round(hours / SUB_DT));
      const acc = (sc: StormRun, st: StormState): StormSample => {
        let last: StormSample | null = null;
        let rain = 0;
        let quick = 0;
        let sub = 0;
        let base = 0;
        let n = 0;
        for (let k = 0; k < steps && st.t < STORM.duration - 1e-9; k++) {
          last = stepStorm(st, sc.inputs, sc.rain, SUB_DT);
          rain += last.rain;
          quick += last.quick;
          sub += last.sub;
          base += last.base;
          n++;
        }
        if (!last || !n) return { t: st.t, rain: 0, quick: 0, sub: 0, base: 0, total: 0, soil: 0, ground: st.ground };
        return { ...last, rain: rain / n, quick: quick / n, sub: sub / n, base: base / n, total: (quick + sub + base) / n };
      };
      const sa = acc(A, s.A);
      const sb = acc(B, s.B);
      const done = s.A.t >= STORM.duration - 1e-9;
      dispatch({ type: 'cmpTick', A: [sa], B: [sb], done, balA: balance(s.A), balB: balance(s.B) });
    }, TICK_MS);
    return () => window.clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, paused, runId, speed, dispatch]);
}

// ---------------------------------------------------------------- gráficos

const W = 360;
const PAD_L = 34;
const PAD_R = 22;
const PLOT_W = W - PAD_L - PAD_R;
const xOf = (t: number) => PAD_L + (t / STORM.duration) * PLOT_W;
const X_TICKS = [0, 12, 24, 36, 48];

function niceMax(v: number): number {
  const steps = [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12];
  return steps.find((s) => s >= v) ?? Math.ceil(v);
}

function linePath(samples: StormSample[], key: 'total' | 'base', yOf: (v: number) => number): string {
  if (!samples.length) return '';
  return `M${xOf(0).toFixed(1)} ${yOf(samples[0][key]).toFixed(1)}` + samples.map((s) => `L${xOf(s.t).toFixed(1)} ${yOf(s[key]).toFixed(1)}`).join('');
}

function RainBars({ scenarios, sameRain }: { scenarios: { key: ScenarioKey; sc: Scenario }[]; sameRain: boolean }) {
  const H = 46;
  const top = 6;
  const peak = Math.max(...scenarios.map((x) => x.sc.rain.peak));
  const max = peak <= 4 ? 4 : peak <= 8 ? 8 : peak <= 12 ? 12 : 16;
  const rows = sameRain ? scenarios.slice(0, 1) : scenarios;
  return (
    <div className="hg-chart">
      <p className="hg-title">Lluvia (mm/h){sameRain ? ' · igual en A y B' : ''}</p>
      {rows.map(({ key, sc }) => {
        const bars: { t: number; v: number }[] = [];
        for (let b = 0; b < STORM.duration; b++) {
          let v = 0;
          for (let k = 0; k < 10; k++) {
            const t = b + (k + 0.5) / 10;
            const end = STORM.rainStart + sc.rain.duration;
            if (t >= STORM.rainStart && t <= end) v += sc.rain.peak * Math.sin((Math.PI * (t - STORM.rainStart)) / sc.rain.duration) ** 0.6;
          }
          bars.push({ t: b, v: v / 10 });
        }
        const yOf = (v: number) => top + H - (v / max) * H;
        return (
          <div key={key} className="rain-row">
            {!sameRain && (
              <span className="rain-key" style={{ color: COLORS[key] }}>
                {key}
              </span>
            )}
            <svg viewBox={`0 0 ${W} ${H + top + 4}`} className="hg-svg" aria-hidden="true">
              <line x1={PAD_L} x2={W - PAD_R} y1={yOf(0)} y2={yOf(0)} className="hg-axis" />
              <text x={PAD_L - 6} y={yOf(0) + 4} className="hg-tick" textAnchor="end">
                0
              </text>
              <text x={PAD_L - 6} y={yOf(max) + 8} className="hg-tick" textAnchor="end">
                {max}
              </text>
              {bars.map((b) => {
                const w = PLOT_W / STORM.duration - 1.6;
                const y = yOf(b.v);
                const h = yOf(0) - y;
                if (h < 0.4) return null;
                const r = Math.min(2, w / 2, h);
                const x = xOf(b.t) + 0.8;
                return <path key={b.t} d={`M${x} ${yOf(0)}V${y + r}q0 ${-r} ${r} ${-r}h${w - 2 * r}q${r} 0 ${r} ${r}V${yOf(0)}Z`} fill={sameRain ? '#4f97c9' : COLORS[key]} opacity={sameRain ? 1 : 0.85} />;
              })}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

function Hydrograph({ A, B, showBase }: { A: StormRun | null; B: StormRun | null; showBase: boolean }) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const runs = [
    { key: 'A' as const, run: A },
    { key: 'B' as const, run: B },
  ].filter((r) => r.run && r.run.samples.length);
  const all = runs.flatMap((r) => r.run!.samples);
  const yMax = niceMax(Math.max(0.5, ...all.map((s) => s.total)) * 1.08);
  const H = 176;
  const top = 10;
  const yOf = (v: number) => top + H - (v / yMax) * H;
  const yTicks = [0, yMax / 2, yMax];

  const pick = (samples: StormSample[], t: number) => samples.reduce((b, s) => (Math.abs(s.t - t) < Math.abs(b.t - t) ? s : b), samples[0]);
  const lastT = Math.max(0, ...all.map((s) => s.t));
  const at = cursor !== null && runs.length ? runs.map((r) => ({ key: r.key, s: pick(r.run!.samples, cursor) })) : [];

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const t = ((((e.clientX - r.left) / r.width) * W - PAD_L) / PLOT_W) * STORM.duration;
    setCursor(t < 0 || t > lastT ? null : t);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!runs.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? 4 : 1;
      const cur = cursor ?? (e.key === 'ArrowRight' ? -step : lastT + step);
      setCursor(Math.max(0, Math.min(lastT, cur + (e.key === 'ArrowRight' ? step : -step))));
    }
    if (e.key === 'Home') setCursor(0);
    if (e.key === 'End') setCursor(lastT);
    if (e.key === 'Escape') setCursor(null);
  };

  const sA = runStats(A);
  const sB = runStats(B);
  const summary =
    sA && sB
      ? `Hidrograma. A: caudal pico de ${fmt(sA.peak)} milímetros por hora a las ${fmt(sA.peakT, 0)} horas. B: caudal pico de ${fmt(sB.peak)} milímetros por hora a las ${fmt(sB.peakT, 0)} horas.`
      : 'Hidrograma vacío: ejecuta los escenarios para dibujar las curvas del caudal del río.';

  // etiquetas directas al final de cada curva, separadas si chocan
  const ends = runs.map((r) => {
    const last = r.run!.samples[r.run!.samples.length - 1];
    return { key: r.key, x: xOf(last.t), y: yOf(last.total) };
  });
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 13) {
    const mid = (ends[0].y + ends[1].y) / 2;
    const up = ends[0].y <= ends[1].y ? 0 : 1;
    ends[up].y = mid - 7;
    ends[1 - up].y = mid + 7;
  }

  return (
    <div className="hg-chart">
      <p className="hg-title">Caudal del río (mm/h)</p>
      <div className="hg-legend" aria-hidden="true">
        <span>
          <i className="sw-line" style={{ borderTopColor: COLORS.A }} />A · referencia
        </span>
        <span>
          <i className="sw-line" style={{ borderTopColor: COLORS.B }} />B · modificado
        </span>
        {showBase && (
          <span>
            <i className="sw-line is-dashed" />
            flujo base
          </span>
        )}
      </div>
      <div className="hg-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H + top + 32}`}
          className="hg-svg is-interactive"
          role="img"
          tabIndex={0}
          aria-labelledby={`${id}-d`}
          onPointerMove={onMove}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={onKey}
          onBlur={() => setCursor(null)}
        >
          <desc id={`${id}-d`}>{summary} Usa las flechas izquierda y derecha para recorrer las curvas.</desc>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD_L} x2={W - PAD_R} y1={yOf(v)} y2={yOf(v)} className={v === 0 ? 'hg-axis' : 'hg-grid'} />
              <text x={PAD_L - 6} y={yOf(v) + 4} className="hg-tick" textAnchor="end">
                {fmt(v, v % 1 ? 1 : 0)}
              </text>
            </g>
          ))}
          {X_TICKS.map((t) => (
            <text key={t} x={xOf(t)} y={top + H + 16} className="hg-tick" textAnchor="middle">
              {t}
            </text>
          ))}
          <text x={PAD_L + PLOT_W / 2} y={top + H + 30} className="hg-axis-title" textAnchor="middle">
            tiempo (horas)
          </text>
          {showBase &&
            runs.map((r) => <path key={`b${r.key}`} d={linePath(r.run!.samples, 'base', yOf)} className="hg-line" stroke={COLORS[r.key]} strokeWidth="1.6" strokeDasharray="4 3" />)}
          {runs.map((r) => (
            <path key={r.key} d={linePath(r.run!.samples, 'total', yOf)} className="hg-line" stroke={COLORS[r.key]} strokeWidth="2.4" />
          ))}
          {ends.map((e) => (
            <text key={e.key} x={e.x + 5} y={e.y + 4} className="hg-direct-key" fill={COLORS[e.key]}>
              {e.key}
            </text>
          ))}
          {at.length > 0 && (
            <g>
              <line x1={xOf(at[0].s.t)} x2={xOf(at[0].s.t)} y1={top} y2={top + H} className="hg-cross" />
              {at.map((p) => (
                <circle key={p.key} cx={xOf(p.s.t)} cy={yOf(p.s.total)} r="4" fill={COLORS[p.key]} stroke="#fff" strokeWidth="2" />
              ))}
            </g>
          )}
          <rect x={PAD_L} y={top} width={PLOT_W} height={H} fill="transparent" />
        </svg>
        {at.length > 0 && (
          <div className="hg-tip" style={{ left: `${Math.min(80, Math.max(20, (xOf(at[0].s.t) / W) * 100))}%` }}>
            <strong>Hora {fmt(at[0].s.t, 0)}</strong>
            {at.map((p) => (
              <span key={p.key}>
                <i className="sw-line" style={{ borderTopColor: p.key === 'A' ? '#8ec5ea' : '#f2b27a' }} />
                {p.key}: {fmt(p.s.total)} mm/h · lluvia {fmt(p.s.rain)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BalanceBars({ k, b }: { k: ScenarioKey; b: Balance }) {
  const parts = [
    { label: 'Llegó al río', v: b.river, cls: 'bb-river' },
    { label: 'Volvió al aire', v: b.evap, cls: 'bb-evap' },
    { label: 'Bombeo', v: b.pump, cls: 'bb-pump' },
    { label: b.stored >= 0 ? 'Quedó guardada' : 'Salió de lo guardado', v: Math.abs(b.stored), cls: b.stored >= 0 ? 'bb-store' : 'bb-draw' },
  ].filter((p) => p.v >= 0.5);
  const out = b.river + b.evap + b.pump + Math.max(0, b.stored);
  return (
    <div className="bb">
      <p className="bb-title">
        <span className="bb-key" style={{ background: COLORS[k] }}>
          {k}
        </span>
        Lluvia: {mm(b.rain)}
      </p>
      <div className="bb-bar" role="img" aria-label={parts.map((p) => `${p.label}: ${mm(p.v)}`).join('; ')}>
        {parts
          .filter((p) => p.cls !== 'bb-draw')
          .map((p) => (
            <span key={p.label} className={p.cls} style={{ width: `${(p.v / Math.max(1, out)) * 100}%` }} />
          ))}
      </div>
      <ul className="bb-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i className={`bb-sw ${p.cls}`} aria-hidden="true" />
            {p.label}: <strong>{mm(p.v)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STEPS_UI = ['Pregunta', 'Predicción', 'Cambio', 'Observa', 'Compara', 'Explica'];

const PREDICTIONS: Record<Metric, string[]> = {
  peak: ['En B, el río crecerá más que en A', 'Crecerá parecido en A y en B', 'En B, el río crecerá menos que en A'],
  base: ['En B, el río llevará más agua entre lluvias', 'Llevará parecido en A y en B', 'En B, el río llevará menos agua entre lluvias'],
  lag: ['En B, el pico llegará antes', 'Llegará casi al mismo tiempo', 'En B, el pico llegará después'],
};

function outcomeIndex(metric: Metric, a: RunStats, b: RunStats): number {
  if (metric === 'base') {
    const r = b.baseEnd / Math.max(1e-6, a.baseEnd);
    return r > 1.12 ? 0 : r < 0.89 ? 2 : 1;
  }
  const r = b.peak / Math.max(1e-6, a.peak);
  return r > 1.12 ? 0 : r < 0.89 ? 2 : 1;
}

function compareSentence(a: RunStats, b: RunStats): string {
  const r = b.peak / Math.max(1e-6, a.peak);
  const peak = r > 1.12 ? 'más alto' : r < 0.89 ? 'más bajo' : 'parecido';
  const dt = b.peakT - a.peakT;
  const when = dt < -0.7 ? 'y llegó antes' : dt > 0.7 ? 'y llegó después' : 'y llegó casi al mismo tiempo';
  const rb = b.baseEnd / Math.max(1e-6, a.baseEnd);
  const base = rb < 0.89 ? ' Entre lluvias, el río de B quedó con menos agua.' : rb > 1.12 ? ' Entre lluvias, el río de B quedó con más agua.' : '';
  return `En B, el pico del río fue ${peak} ${when}.${base}`;
}

const VAR_OPTIONS: Record<VarKey, string[]> = {
  soilMoisture: [...INPUT_NAMES.soilMoisture],
  surface: [...INPUT_NAMES.surface],
  vegetation: [...INPUT_NAMES.vegetation],
  rain: [...RAIN_NAMES],
  pumping: [...INPUT_NAMES.pumping],
};

export function CompareLab() {
  const { state, dispatch } = useStore();
  const { cmp, lab } = state;
  const { variable, a, b, exp } = useMemo(() => scenariosOf(cmp, lab), [cmp, lab]);
  const metric: Metric = exp?.metric ?? (variable === 'pumping' ? 'base' : 'peak');
  const constants = constantsOf({ variable, a }, cmp.rainMode);
  const sA = cmp.done ? runStats(cmp.A) : null;
  const sB = cmp.done ? runStats(cmp.B) : null;
  const started = !!cmp.A;
  const stage = cmp.done ? 5 : started ? 3 : cmp.prediction !== null ? 2 : 1;
  const [showBase, setShowBase] = useState(metric === 'base');
  const [explain, setExplain] = useState('');
  const [saved, setSaved] = useState(false);
  const logged = useRef(-1);
  const explainId = useId();
  const sameRain = a.rain.peak === b.rain.peak && a.rain.duration === b.rain.duration;
  const title = exp?.title ?? `Experimento libre: ${VAR_NAMES[variable].toLowerCase()}`;
  const question = exp?.question ?? `¿Qué cambia en el río si modifico ${VAR_NAMES[variable].toLowerCase()}?`;
  const freeInvalid = !exp && valueLabel(variable, a) === valueLabel(variable, b);

  useEffect(() => setShowBase(metric === 'base'), [metric]);
  useEffect(() => {
    setExplain('');
    setSaved(false);
  }, [cmp.expId, cmp.rainMode]);

  // registrar el resultado de la predicción y la comparación una sola vez por ejecución
  useEffect(() => {
    if (!cmp.done || !sA || !sB || logged.current === cmp.runId) return;
    logged.current = cmp.runId;
    const actual = outcomeIndex(metric, sA, sB);
    if (cmp.prediction !== null) dispatch({ type: 'logOutcome', id: `pred-${cmp.runId}-${cmp.expId}`, outcome: actual === cmp.prediction ? 'coincide' : 'distinta' });
    dispatch({
      type: 'log',
      entry: {
        id: `cmp-${cmp.runId}-${cmp.expId}`,
        kind: 'comparacion',
        title: `Comparé: ${title}`,
        text: `A: pico de ${fmt(sA.peak)} mm/h a las ${fmt(sA.peakT, 0)} h. B: pico de ${fmt(sB.peak)} mm/h a las ${fmt(sB.peakT, 0)} h. ${compareSentence(sA, sB)}`,
      },
    });
    dispatch({ type: 'discover', ids: ['comparar-escenarios', `lab-${cmp.expId}`] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmp.done, cmp.runId]);

  const run = () => {
    const pred = cmp.prediction;
    const nextRun = cmp.runId + 1;
    if (pred !== null) {
      dispatch({
        type: 'log',
        entry: { id: `pred-${nextRun}-${cmp.expId}`, kind: 'prediccion', title, text: `${question} Mi predicción: «${PREDICTIONS[metric][pred]}».` },
      });
    }
    dispatch({
      type: 'cmpStart',
      A: { inputs: a.inputs, rain: a.rain, samples: [], balance: null },
      B: { inputs: b.inputs, rain: b.rain, samples: [], balance: null },
    });
  };

  const progressT = cmp.A?.samples.length ? cmp.A.samples[cmp.A.samples.length - 1].t : 0;
  const predOutcome = cmp.done && sA && sB && cmp.prediction !== null ? outcomeIndex(metric, sA, sB) === cmp.prediction : null;

  return (
    <section className="cmp" aria-labelledby="cmp-title">
      <h3 id="cmp-title" className="sr-only">
        Comparar escenarios
      </h3>
      <ol className="cmp-steps" aria-label="Pasos del experimento">
        {STEPS_UI.map((s, i) => (
          <li key={s} className={i === stage ? 'is-current' : i < stage ? 'is-done' : ''} aria-current={i === stage ? 'step' : undefined}>
            <span>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {/* 1. Pregunta */}
      <div className="cmp-block">
        <label className="cmp-label" htmlFor="cmp-exp">
          1 · Elige una pregunta
        </label>
        <select
          id="cmp-exp"
          className="cmp-select"
          value={cmp.expId}
          disabled={cmp.running}
          onChange={(e) => dispatch({ type: 'cmpSet', patch: { expId: e.target.value } })}
        >
          {COMPARE_EXPERIMENTS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
          <option value="libre">Diseña tu propio experimento</option>
        </select>
        <p className="cmp-question">{question}</p>
        {exp?.rainModes && (
          <Segmented
            label="¿Qué se mantiene igual en A y en B?"
            options={[
              { value: 'duracion', label: 'La duración' },
              { value: 'volumen', label: 'El volumen total' },
            ]}
            value={cmp.rainMode}
            onChange={(v) => dispatch({ type: 'cmpSet', patch: { rainMode: v as 'duracion' | 'volumen' } })}
            disabled={cmp.running}
            help={cmp.rainMode === 'duracion' ? 'Ambas lluvias duran 12 horas: la intensa trae más agua en total.' : 'Ambas lluvias traen la misma cantidad de agua: la intensa cae en 4 horas en lugar de 12.'}
          />
        )}
        {!exp && (
          <div className="cmp-free">
            <p className="hint-inline">A usa las condiciones de la pestaña «Explorar condiciones». En B cambia una sola condición:</p>
            <Segmented
              label="Condición que cambia"
              options={(Object.keys(VAR_NAMES) as VarKey[]).map((k) => ({ value: k, label: VAR_NAMES[k].replace('Humedad inicial del suelo', 'Humedad del suelo') }))}
              value={cmp.free.variable}
              disabled={cmp.running}
              onChange={(v) => dispatch({ type: 'cmpSet', patch: { free: { variable: v as VarKey, value: 0 } } })}
            />
            <Segmented
              label="Valor en B"
              options={VAR_OPTIONS[cmp.free.variable].map((l, i) => ({ value: i, label: l }))}
              value={cmp.free.value}
              disabled={cmp.running}
              onChange={(v) => dispatch({ type: 'cmpSet', patch: { free: { variable: cmp.free.variable, value: v } } })}
            />
            {freeInvalid && <p className="hint-inline is-warn">B es igual a A: elige otro valor para que haya algo que comparar.</p>}
          </div>
        )}
      </div>

      {/* 2. Predicción */}
      <div className="cmp-block">
        <p className="cmp-label">2 · Predice antes de ejecutar</p>
        <div className="question-options">
          {PREDICTIONS[metric].map((p, i) => (
            <button
              key={p}
              type="button"
              className={`option${cmp.prediction === i ? ' is-chosen' : ''}`}
              aria-pressed={cmp.prediction === i}
              disabled={cmp.running}
              onClick={() => dispatch({ type: 'cmpSet', patch: { prediction: i } })}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Cambio y constantes */}
      <div className="cmp-block">
        <p className="cmp-label">3 · Lo que cambia y lo que se mantiene</p>
        <div className="ab-cards">
          {(['A', 'B'] as const).map((k) => (
            <div key={k} className="ab-card" style={{ borderColor: COLORS[k] }}>
              <p className="ab-name">
                <span className="bb-key" style={{ background: COLORS[k] }}>
                  {k}
                </span>
                {k === 'A' ? 'Referencia' : 'Modificado'}
              </p>
              <p className="ab-var">{VAR_NAMES[variable]}</p>
              <p className="ab-val">{valueLabel(variable, k === 'A' ? a : b)}</p>
            </div>
          ))}
        </div>
        <details className="constants">
          <summary>Se mantiene igual en A y en B ({constants.length})</summary>
          <ul>
            {constants.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      </div>

      {/* 4. Ejecutar y observar */}
      <div className="cmp-block">
        <p className="cmp-label">4 · Ejecuta y observa</p>
        <div className="cmp-run">
          {cmp.running ? (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'cmpStop' })}>
              Detener
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={cmp.prediction === null || freeInvalid} onClick={run}>
              {cmp.done ? 'Ejecutar de nuevo' : 'Ejecutar A y B'}
            </button>
          )}
          <div className="view-toggle" role="radiogroup" aria-label="Escenario que muestra el paisaje">
            <span>Paisaje:</span>
            {(['A', 'B'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={cmp.view === k}
                className={cmp.view === k ? 'is-on' : ''}
                style={cmp.view === k ? { background: COLORS[k], borderColor: COLORS[k] } : undefined}
                onClick={() => dispatch({ type: 'cmpSet', patch: { view: k } })}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        {cmp.prediction === null && !cmp.running && <p className="hint-inline">Primero elige una predicción.</p>}
        {cmp.running && (
          <p className="hint-inline" aria-live="polite">
            {state.paused ? 'En pausa.' : `Hora ${fmt(progressT, 0)} de ${STORM.duration}.`} {exp?.watch ?? 'Alterna A y B en el paisaje: el encuadre no cambia.'}
          </p>
        )}
        <figure className="hg">
          <RainBars scenarios={[{ key: 'A', sc: a }, { key: 'B', sc: b }]} sameRain={sameRain} />
          <Hydrograph A={cmp.A} B={cmp.B} showBase={showBase} />
          <label className="check">
            <input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} />
            Mostrar el flujo base (agua que llega desde el acuífero)
          </label>
        </figure>
      </div>

      {/* 5. Comparar */}
      {cmp.done && sA && sB && cmp.A?.balance && cmp.B?.balance && (
        <div className="cmp-block" aria-live="polite">
          <p className="cmp-label">5 · Compara</p>
          <table className="ab-table">
            <thead>
              <tr>
                <th scope="col">Resultado</th>
                <th scope="col" style={{ color: COLORS.A }}>
                  A
                </th>
                <th scope="col" style={{ color: COLORS.B }}>
                  B
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Caudal pico</th>
                <td>{fmt(sA.peak)} mm/h</td>
                <td>{fmt(sB.peak)} mm/h</td>
              </tr>
              <tr>
                <th scope="row">Hora del pico</th>
                <td>{fmt(sA.peakT, 0)} h</td>
                <td>{fmt(sB.peakT, 0)} h</td>
              </tr>
              <tr>
                <th scope="row">Retardo desde la lluvia más fuerte</th>
                <td>{fmt(sA.lag, 0)} h</td>
                <td>{fmt(sB.lag, 0)} h</td>
              </tr>
              <tr>
                <th scope="row">Flujo base al final</th>
                <td>{fmt(sA.baseEnd, 2)} mm/h</td>
                <td>{fmt(sB.baseEnd, 2)} mm/h</td>
              </tr>
            </tbody>
          </table>
          <p className="compare">{compareSentence(sA, sB)}</p>
          <div className="bb-wrap">
            <BalanceBars k="A" b={cmp.A.balance} />
            <BalanceBars k="B" b={cmp.B.balance} />
          </div>
          <p className="balance">
            Balance de agua de cada escenario: lluvia = lo que llegó al río + lo que volvió al aire + bombeo + cambio en lo guardado (suelo, acuífero y agua en camino). Diferencia en A: {fmt(Math.abs(cmp.A.balance.error) < 0.05 ? 0 : cmp.A.balance.error, 1)} mm; en B: {fmt(Math.abs(cmp.B.balance.error) < 0.05 ? 0 : cmp.B.balance.error, 1)} mm. Valores redondeados.
          </p>
        </div>
      )}

      {/* 6. Explicar */}
      {cmp.done && sA && sB && (
        <div className="cmp-block">
          <p className="cmp-label">6 · Explica</p>
          {predOutcome !== null && (
            <p className={`feedback ${predOutcome ? 'is-right' : 'is-hint'}`}>
              <strong>{predOutcome ? 'Tu predicción coincide con lo observado.' : 'Lo observado fue distinto a tu predicción: eso también es hacer ciencia.'}</strong> Quedó registrado en tu bitácora.
            </p>
          )}
          {exp && (
            <>
              <p>{exp.explain}</p>
              {exp.nuance && <p className="nuance">{exp.nuance}</p>}
            </>
          )}
          <div className="d-explain">
            <label htmlFor={explainId}>
              <strong>Con tus palabras:</strong> ¿por qué crees que A y B fueron diferentes (o parecidos)?
            </label>
            <textarea id={explainId} rows={3} maxLength={400} value={explain} onChange={(e) => { setExplain(e.target.value); setSaved(false); }} />
            <div className="d-explain-actions">
              <button
                type="button"
                className="btn-ghost small"
                disabled={explain.trim().length < 3}
                onClick={() => {
                  dispatch({ type: 'log', entry: { kind: 'explicacion', title, text: explain.trim() } });
                  dispatch({ type: 'discover', ids: ['explicar'] });
                  setSaved(true);
                }}
              >
                Guardar en la bitácora
              </button>
              {saved && <span role="status">Guardado en tu bitácora.</span>}
            </div>
          </div>
        </div>
      )}

      <Disclosure title="¿Qué significan mm y mm/h?">
        <p>
          Un milímetro (mm) de lluvia es una capa de agua de un milímetro de altura sobre el suelo: equivale a un litro por cada metro cuadrado. El caudal del río se expresa igual, en milímetros por hora (mm/h): la altura de agua que sale de la cuenca cada hora, como si se repartiera sobre toda su superficie. Así se pueden comparar directamente la lluvia y el río.
        </p>
        <p className="nuance">
          Es una cuenca imaginaria con reglas explícitas y valores ilustrativos. Sirve para comparar tendencias, no para predecir un río real. Lluvia total de A: {mm(rainTotal(a.rain))}; de B: {mm(rainTotal(b.rain))}.
        </p>
      </Disclosure>
      <Disclosure title="Cómo se lee un hidrograma">
        <dl className="hg-read">
          <dt>Rama ascendente</dt>
          <dd>El caudal sube cuando la escorrentía empieza a llegar al cauce.</dd>
          <dt>Caudal pico</dt>
          <dd>El valor más alto de la curva: el momento de mayor riesgo de desbordamiento.</dd>
          <dt>Tiempo de retardo</dt>
          <dd>Lo que tarda el pico del río después de la lluvia más intensa. En cuencas urbanizadas suele ser más corto.</dd>
          <dt>Rama de recesión</dt>
          <dd>El caudal baja poco a poco cuando deja de llover.</dd>
          <dt>Flujo base</dt>
          <dd>El agua subterránea que alimenta al río incluso sin lluvia.</dd>
        </dl>
      </Disclosure>
    </section>
  );
}

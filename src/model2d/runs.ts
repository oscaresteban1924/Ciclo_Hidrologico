// Las corridas del modelo en la página: se hacen a ratos (para que la página siga respondiendo), se guardan las
// últimas para no repetirlas al volver a una parte, y se puede pedir una corrida sin mostrarla (referencias).

import { useEffect, useRef, useState } from 'react';
import { Run, type RunOpts, type RunResult, type RunStatus } from './solver';
import { summarize, type Summary } from './scene';

const RESULTS = new Map<string, RunResult>();
const SUMMARIES = new Map<string, Summary>();
export const runKey = (o: RunOpts) => JSON.stringify(o);

function keep(key: string, r: RunResult): void {
  RESULTS.delete(key);
  RESULTS.set(key, r);
  while (RESULTS.size > 10) RESULTS.delete(RESULTS.keys().next().value as string);
}

export const cachedResult = (o: RunOpts) => RESULTS.get(runKey(o)) ?? null;

/** Resumen de una corrida ya hecha (o null). */
export function cachedSummary(o: RunOpts): Summary | null {
  const k = runKey(o);
  const s = SUMMARIES.get(k);
  if (s) return s;
  const r = RESULTS.get(k);
  if (!r) return null;
  const v = summarize(r);
  SUMMARIES.set(k, v);
  return v;
}

/** Corre de una vez (pruebas y tablas pequeñas) y guarda el resultado. */
export function runNow(o: RunOpts): RunResult {
  const k = runKey(o);
  const hit = RESULTS.get(k);
  if (hit) return hit;
  const r = new Run(o).runAll();
  keep(k, r);
  return r;
}

export interface RunState {
  status: RunStatus | 'espera';
  progress: number;
  res: RunResult | null;
  sum: Summary | null;
  /** Tiempo simulado y paso de tiempo de la corrida en curso (para el registro de cálculo). */
  t: number;
}

/**
 * Corre el modelo con `opts` (si `auto`, apenas cambian y tras una pausa breve; si no, al llamar `start`). Devuelve
 * el estado, el progreso y el resultado con su resumen.
 */
export function useModelRun(opts: RunOpts | null, auto = true, delay = 280): RunState & { start: () => void; key: string } {
  const key = opts ? runKey(opts) : '';
  const [st, setSt] = useState<RunState>(() => {
    const hit = opts ? RESULTS.get(key) : null;
    return hit ? { status: hit.unstable ? 'inestable' : 'listo', progress: 1, res: hit, sum: cachedSummary(opts!), t: 0 } : { status: 'espera', progress: 0, res: null, sum: null, t: 0 };
  });
  const job = useRef<{ key: string; cancel: () => void } | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const launch = () => {
    const o = optsRef.current;
    if (!o) return;
    const k = runKey(o);
    job.current?.cancel();
    const hit = RESULTS.get(k);
    if (hit) {
      setSt({ status: hit.unstable ? 'inestable' : 'listo', progress: 1, res: hit, sum: cachedSummary(o), t: 0 });
      return;
    }
    const run = new Run(o);
    let alive = true;
    let tm = 0;
    let last = 0;
    let lastEnd = performance.now();
    const tick = () => {
      if (!alive) return;
      // el cálculo toma al menos la mitad del tiempo, aunque la escena tarde en dibujarse (equipos lentos)
      const gap = performance.now() - lastEnd;
      const done = run.advance(Math.max(14, Math.min(120, gap)));
      const now = performance.now();
      lastEnd = now;
      if (done) {
        keep(k, run.res);
        setSt({ status: run.status, progress: 1, res: run.res, sum: cachedSummary(o), t: run.t });
        job.current = null;
        return;
      }
      if (now - last > 90) {
        last = now;
        setSt((p) => ({ ...p, status: run.status, progress: run.progress, t: run.t }));
      }
      tm = window.setTimeout(tick, 0);
    };
    setSt((p) => ({ ...p, status: 'preproceso', progress: 0 }));
    tm = window.setTimeout(tick, 0);
    job.current = {
      key: k,
      cancel: () => {
        alive = false;
        window.clearTimeout(tm);
      },
    };
  };
  useEffect(() => {
    if (!opts) return;
    const hit = RESULTS.get(key);
    if (hit) {
      job.current?.cancel();
      job.current = null;
      setSt({ status: hit.unstable ? 'inestable' : 'listo', progress: 1, res: hit, sum: cachedSummary(opts), t: 0 });
      return;
    }
    if (!auto) {
      job.current?.cancel();
      job.current = null;
      setSt({ status: 'espera', progress: 0, res: null, sum: null, t: 0 });
      return;
    }
    const id = window.setTimeout(launch, delay);
    return () => window.clearTimeout(id);
    // la corrida se lanza por su clave
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, auto]);
  useEffect(() => () => job.current?.cancel(), []);
  return { ...st, start: launch, key };
}

/** Corrida de referencia en segundo plano (sin mostrarla): su resumen, cuando esté. */
export function useReference(opts: RunOpts): Summary | null {
  const r = useModelRun(opts, true, 600);
  return r.sum;
}

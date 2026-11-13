// Las corridas del modelo en la página. Se calculan en un hilo aparte (Web Worker) para que la página siga
// respondiendo, con el agua avanzando en la escena mientras calcula; si el navegador no deja crear el hilo, se
// calculan a ratos en la página. Se guardan las últimas para no repetirlas al volver a una parte.

import { useEffect, useRef, useState } from 'react';
import { Run, adoptGeometry, bcsOf, cachedGeometry, domainOf, geomKey, type CustomDomain, type Geometry, type RunOpts, type RunResult, type RunStatus } from './solver';
import { summarize, type Summary } from './scene';
import RunWorker from './worker?worker&inline';

const RESULTS = new Map<string, RunResult>();
const SUMMARIES = new Map<string, Summary>();
export const runKey = (o: RunOpts) => JSON.stringify(o);
const keyOfGeom = (o: RunOpts) => geomKey(o.terrain, o.mesh, o.rough, { site: o.site, bridge: !!o.bridge, bcs: bcsOf(o) });

function keep(key: string, r: RunResult): void {
  RESULTS.delete(key);
  RESULTS.set(key, r);
  // las corridas livianas (solo máximos) pesan poco: se guardan más
  let heavy = 0;
  for (const v of RESULTS.values()) if (v.frames.length) heavy++;
  while (RESULTS.size > 60 || heavy > 10) {
    const k = RESULTS.keys().next().value as string;
    if (RESULTS.get(k)!.frames.length) heavy--;
    RESULTS.delete(k);
  }
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

/** Corre de una vez en esta página (pruebas) y guarda el resultado. */
export function runNow(o: RunOpts): RunResult {
  const k = runKey(o);
  const hit = RESULTS.get(k);
  if (hit) return hit;
  const r = new Run(o).runAll();
  keep(k, r);
  return r;
}

// ------------------------------------------------------------------ el motor: hilos o la página

export interface Progress {
  status: RunStatus;
  progress: number;
  t: number;
  /** Último mapa de niveles mientras calcula y la geometría con que se dibuja. */
  frame: Float32Array | null;
  geom: Geometry | null;
}

interface Job {
  id: number;
  opts: RunOpts;
  onProgress: (p: Progress) => void;
  resolve: (r: RunResult) => void;
  reject: (e: Error) => void;
  geom: Geometry | null;
  worker: Slot | null;
  cancelled: boolean;
}
interface Slot {
  w: Worker;
  job: Job | null;
  domains: Set<string>;
}

let mode: 'pendiente' | 'hilo' | 'pagina' = 'pendiente';
/** Marca en la página cómo se está calculando (para revisarlo desde las herramientas del navegador). */
const mark = () => {
  if (typeof document !== 'undefined') document.documentElement.dataset.m2Motor = mode;
};
let probing: Promise<void> | null = null;
const slots: Slot[] = [];
const queue: Job[] = [];
let nextId = 1;

/**
 * Prueba si se puede calcular en un hilo aparte (crear el hilo y recibir respuesta). Si la respuesta tarda (la página
 * está ocupada armando la escena), las corridas que llegan mientras tanto se calculan en la página, pero el hilo no
 * se descarta: si responde después, las siguientes corridas ya van al hilo.
 */
function probe(): Promise<void> {
  if (probing) return probing;
  probing = new Promise<void>((done) => {
    if (typeof Worker === 'undefined') {
      mode = 'pagina';
      done();
      return;
    }
    let w: Worker;
    try {
      w = new RunWorker();
    } catch {
      mode = 'pagina';
      done();
      return;
    }
    let settled = false;
    const tm = window.setTimeout(() => {
      settled = true;
      mode = 'pagina';
      mark();
      done();
    }, 4000);
    w.onmessage = (e) => {
      if (e.data?.type !== 'pong') return;
      window.clearTimeout(tm);
      mode = 'hilo';
      mark();
      slots.push(wire({ w, job: null, domains: new Set() }));
      if (settled) pump();
      else done();
    };
    w.onerror = () => {
      window.clearTimeout(tm);
      if (mode !== 'hilo') mode = 'pagina';
      w.terminate();
      if (!settled) done();
    };
    w.postMessage({ type: 'ping' });
  });
  return probing;
}
// el hilo se prueba apenas carga la sala, antes de que la escena ocupe la página
if (typeof window !== 'undefined') void probe();

/** Cómo se calcula en este navegador. */
export const engineMode = () => mode;
export const engineReady = () => probe().then(() => mode);

function wire(s: Slot): Slot {
  s.w.onmessage = (e) => {
    const m = e.data;
    const job = s.job;
    if (!job || m.id !== job.id) return;
    if (m.type === 'geom') {
      job.geom = m.geom as Geometry;
      adoptGeometry(job.geom);
      job.onProgress({ status: 'corriendo', progress: 0, t: -job.opts.warmup * 60, frame: null, geom: job.geom });
    } else if (m.type === 'progress') {
      job.onProgress({ status: m.status, progress: m.progress, t: m.t, frame: m.frame, geom: job.geom });
    } else if (m.type === 'done') {
      const r = m.res as RunResult;
      if (!r.geom) r.geom = job.geom ?? cachedGeometry(m.key)!;
      s.job = null;
      job.resolve(r);
      pump();
    } else if (m.type === 'error') {
      s.job = null;
      job.reject(new Error(m.message));
      pump();
    }
  };
  s.w.onerror = (ev) => {
    const job = s.job;
    s.job = null;
    ev.preventDefault?.();
    if (job) job.reject(new Error('el hilo de cálculo falló'));
    pump();
  };
  return s;
}

/** Reparte los trabajos en espera entre los hilos (hasta dos). */
function pump(): void {
  while (queue.length) {
    let s = slots.find((x) => !x.job);
    if (!s && slots.length < 2) {
      try {
        s = wire({ w: new RunWorker(), job: null, domains: new Set() });
        slots.push(s);
      } catch {
        s = undefined;
      }
    }
    if (!s) return;
    const job = queue.shift()!;
    if (job.cancelled) continue;
    s.job = job;
    job.worker = s;
    const site = job.opts.site;
    if (site && !s.domains.has(site.id)) {
      const d = domainOf(site.id);
      if (d) s.w.postMessage({ type: 'domain', domain: d satisfies CustomDomain });
      s.domains.add(site.id);
    }
    const gk = keyOfGeom(job.opts);
    const have = !job.opts.breach && !!cachedGeometry(gk);
    if (have) job.geom = cachedGeometry(gk);
    s.w.postMessage({ type: 'run', id: job.id, opts: job.opts, haveGeom: have });
    if (have) job.onProgress({ status: 'corriendo', progress: 0, t: -job.opts.warmup * 60, frame: null, geom: job.geom });
  }
}

/** Corrida en esta página, a ratos (cuando no hay hilos). */
function onPage(job: Job): void {
  const run = new Run(job.opts);
  let lastEnd = performance.now(), last = 0;
  const tick = () => {
    if (job.cancelled) return;
    const gap = performance.now() - lastEnd;
    let done: boolean;
    try {
      done = run.advance(Math.max(14, Math.min(120, gap)));
    } catch (e) {
      job.reject(e as Error);
      return;
    }
    const now = performance.now();
    lastEnd = now;
    if (done) {
      job.resolve(run.res);
      return;
    }
    if (now - last > 120 && run.g) {
      last = now;
      job.onProgress({ status: run.status, progress: run.progress, t: run.t, frame: run.status === 'corriendo' ? run.snapshot() : null, geom: run.g });
    }
    window.setTimeout(tick, 0);
  };
  window.setTimeout(tick, 0);
}

export interface Handle {
  promise: Promise<RunResult>;
  cancel: () => void;
}

/** Lanza una corrida (en un hilo si se puede) y avisa el avance. */
export function launch(opts: RunOpts, onProgress: (p: Progress) => void = () => {}): Handle {
  const k = runKey(opts);
  const hit = RESULTS.get(k);
  if (hit) return { promise: Promise.resolve(hit), cancel: () => {} };
  let job!: Job;
  const promise = new Promise<RunResult>((resolve, reject) => {
    job = { id: nextId++, opts, onProgress, resolve, reject, geom: null, worker: null, cancelled: false };
  }).then((r) => {
    keep(k, r);
    return r;
  });
  probe().then(() => {
    if (job.cancelled) return;
    if (mode === 'hilo') {
      queue.push(job);
      pump();
    } else onPage(job);
  });
  return {
    promise,
    cancel: () => {
      job.cancelled = true;
      const qi = queue.indexOf(job);
      if (qi >= 0) queue.splice(qi, 1);
      const s = job.worker;
      if (s && s.job === job) {
        s.w.postMessage({ type: 'cancel', id: job.id });
        s.job = null;
        pump();
      }
    },
  };
}

/** Corrida sin mostrarla (promesa con el resultado). */
export const runAsync = (o: RunOpts) => launch(o).promise;

/** Varias corridas seguidas (en los hilos que haya), con el avance de cuántas van. */
export async function runMany(list: RunOpts[], onEach: (done: number, total: number) => void = () => {}, stop: () => boolean = () => false): Promise<RunResult[]> {
  const out: RunResult[] = new Array(list.length);
  let done = 0, k = 0;
  const worker = async () => {
    while (k < list.length && !stop()) {
      const i = k++;
      out[i] = await runAsync(list[i]);
      onEach(++done, list.length);
    }
  };
  await probe();
  await Promise.all(Array.from({ length: mode === 'hilo' ? 2 : 1 }, worker));
  return out;
}

// ------------------------------------------------------------------ el gancho de las partes

export interface RunState {
  status: RunStatus | 'espera';
  progress: number;
  res: RunResult | null;
  sum: Summary | null;
  /** Tiempo simulado de la corrida en curso. */
  t: number;
  /** Mientras calcula: el último mapa de niveles y su geometría (para ver el agua avanzar). */
  live: { frame: Float32Array; geom: Geometry; t: number } | null;
  /** Clave de las opciones con que se calculó `res` (mientras se recalcula, `res` es la corrida anterior). */
  resKey: string;
}

const idle: RunState = { status: 'espera', progress: 0, res: null, sum: null, t: 0, live: null, resKey: '' };

/**
 * Corre el modelo con `opts` (si `auto`, apenas cambian y tras una pausa breve; si no, al llamar `start`). Devuelve
 * el estado, el progreso, el agua mientras calcula y el resultado con su resumen.
 */
export function useModelRun(opts: RunOpts | null, auto = true, delay = 280): RunState & { start: () => void; key: string } {
  const key = opts ? runKey(opts) : '';
  const [st, setSt] = useState<RunState>(() => {
    const hit = opts ? RESULTS.get(key) : null;
    return hit ? { status: hit.unstable ? 'inestable' : 'listo', progress: 1, res: hit, sum: cachedSummary(opts!), t: 0, live: null, resKey: key } : idle;
  });
  const job = useRef<Handle | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const launchIt = () => {
    const o = optsRef.current;
    if (!o) return;
    job.current?.cancel();
    const ko = runKey(o);
    const hit = RESULTS.get(ko);
    if (hit) {
      setSt({ status: hit.unstable ? 'inestable' : 'listo', progress: 1, res: hit, sum: cachedSummary(o), t: 0, live: null, resKey: ko });
      return;
    }
    setSt((p) => ({ ...p, status: 'preproceso', progress: 0, live: null }));
    const h = launch(o, (p) => setSt((x) => ({ ...x, status: p.status, progress: p.progress, t: p.t, live: p.frame && p.geom ? { frame: p.frame, geom: p.geom, t: p.t } : x.live })));
    job.current = h;
    h.promise.then(
      (r) => {
        if (job.current !== h) return;
        job.current = null;
        setSt({ status: r.unstable ? 'inestable' : 'listo', progress: 1, res: r, sum: cachedSummary(o), t: 0, live: null, resKey: ko });
      },
      () => {
        if (job.current !== h) return;
        job.current = null;
        setSt({ ...idle, status: 'inestable' });
      },
    );
  };
  useEffect(() => {
    if (!opts) return;
    const hit = RESULTS.get(key);
    if (hit) {
      job.current?.cancel();
      job.current = null;
      setSt({ status: hit.unstable ? 'inestable' : 'listo', progress: 1, res: hit, sum: cachedSummary(opts), t: 0, live: null, resKey: key });
      return;
    }
    if (!auto) {
      job.current?.cancel();
      job.current = null;
      setSt(idle);
      return;
    }
    const id = window.setTimeout(launchIt, delay);
    return () => window.clearTimeout(id);
    // la corrida se lanza por su clave
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, auto]);
  useEffect(() => () => job.current?.cancel(), []);
  return { ...st, start: launchIt, key };
}

/** Corrida de referencia en segundo plano (sin mostrarla): su resumen, cuando esté. */
export function useReference(opts: RunOpts): Summary | null {
  const r = useModelRun(opts, true, 600);
  return r.sum;
}

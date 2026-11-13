// El modelo 2D en un hilo aparte: la página sigue respondiendo mientras calcula. Recibe una corrida, avanza a ratos
// y manda el avance con el último mapa de niveles (para ver el agua avanzar) y, al final, el resultado completo.

import { Run, registerDomain, type CustomDomain, type Geometry, type RunOpts, type RunResult } from './solver';

type In = { type: 'ping' } | { type: 'domain'; domain: CustomDomain } | { type: 'run'; id: number; opts: RunOpts; haveGeom: boolean } | { type: 'cancel'; id: number };

const ctx = self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void; onmessage: ((e: MessageEvent<In>) => void) | null };

let current: { id: number; cancel: boolean } | null = null;

ctx.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'ping') ctx.postMessage({ type: 'pong' });
  else if (m.type === 'domain') registerDomain(m.domain);
  else if (m.type === 'cancel') {
    if (current && current.id === m.id) current.cancel = true;
  } else if (m.type === 'run') start(m.id, m.opts, m.haveGeom);
};

function start(id: number, opts: RunOpts, haveGeom: boolean): void {
  if (current) current.cancel = true;
  const job = { id, cancel: false };
  current = job;
  let run: Run;
  try {
    run = new Run(opts);
  } catch (err) {
    ctx.postMessage({ type: 'error', id, message: String((err as Error)?.message ?? err) });
    return;
  }
  let sentGeom = haveGeom;
  let last = 0;
  const loop = () => {
    if (job.cancel) return;
    let done: boolean;
    try {
      done = run.advance(45);
    } catch (err) {
      ctx.postMessage({ type: 'error', id, message: String((err as Error)?.message ?? err) });
      if (current === job) current = null;
      return;
    }
    if (!sentGeom && run.g) {
      sentGeom = true;
      ctx.postMessage({ type: 'geom', id, geom: run.g });
    }
    if (done) {
      const r = run.res;
      const own = r.geom.key.endsWith('|propia');
      const out: RunResult = { ...r, geom: (own ? r.geom : null) as unknown as Geometry };
      const tr: Transferable[] = [];
      for (const list of [r.frames, r.uFrames, r.vFrames, r.qFrames]) for (const a of list) tr.push(a.buffer as ArrayBuffer);
      ctx.postMessage({ type: 'done', id, res: out, key: r.geom.key }, tr);
      if (current === job) current = null;
      return;
    }
    const now = performance.now();
    if (now - last > 140 && run.status === 'corriendo') {
      last = now;
      const frame = run.snapshot();
      ctx.postMessage({ type: 'progress', id, status: run.status, progress: run.progress, t: run.t, frame }, [frame.buffer]);
    }
    setTimeout(loop, 0);
  };
  setTimeout(loop, 0);
}

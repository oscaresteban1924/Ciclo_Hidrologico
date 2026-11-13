// Piezas comunes de las partes de la sala 2D: el estado por omisión del valle en 3D, los rótulos de los lugares, el
// aviso de la corrida en curso y el control de la exageración vertical.

import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { DockChoice } from '../quality/shell';
import { es } from '../canals/common';
import { LEVEE, NX, POIS, ROAD, yc } from './terrain';
import { cachedSummary, runKey, runMany, type RunState } from './runs';
import { summarize, type Summary } from './scene';
import type { RunOpts, RunResult } from './solver';
import { PARTICLE_SPEED, type ClickTool, type Layer, type PlanLabel, type ValleyState, type WaterState } from './three/valleyWorld';

export const VIEWS_BASE = [
  { id: 'valle', label: 'El valle' },
  { id: 'barrio', label: 'El barrio' },
  { id: 'puente', label: 'El puente' },
];

export function valleyState(p: Partial<ValleyState> & Pick<ValleyState, 'fine'>): ValleyState {
  return { vex: 3, raster: null, colorBy: 'altura', n: null, objects: 'si', section: null, mesh: null, breaklines: false, bc: false, cell: null, water: null, labels: [], ...p };
}

const levY = (x: number) => yc(x) + LEVEE.dn * Math.sqrt(1 + (((30 * 2 * Math.PI) / 320) * Math.cos((2 * Math.PI * x) / 320)) ** 2);

export const PLACE = {
  escuela: (text = 'La escuela', sub?: string, kind: PlanLabel['kind'] = 'lugar'): PlanLabel => ({ id: 'escuela', text, sub, x: POIS.escuela.x, y: POIS.escuela.y + 14, up: 9, kind, prio: 6 }),
  puente: (text = 'El puente', sub?: string, kind: PlanLabel['kind'] = 'lugar'): PlanLabel => ({ id: 'puente', text, sub, x: ROAD.x, y: yc(ROAD.x) - 16, up: 7, kind, prio: 7 }),
  jarillon: (text = 'El jarillón', sub?: string, kind: PlanLabel['kind'] = 'lugar'): PlanLabel => ({ id: 'jarillon', text, sub, x: 300, y: levY(300), up: 5, kind, prio: 6 }),
  barrio: (text = 'El barrio', sub?: string, kind: PlanLabel['kind'] = 'lugar'): PlanLabel => ({ id: 'barrio', text, sub, x: 330, y: 330, up: 12, kind, prio: 5 }),
  entrada: (text = 'Entrada: hidrograma de caudal', sub?: string, kind: PlanLabel['kind'] = 'dato'): PlanLabel => ({ id: 'entrada', text, sub, x: 6, y: 250, up: 6, kind, prio: 8 }),
  salida: (text = 'Salida: profundidad normal', sub?: string, kind: PlanLabel['kind'] = 'dato'): PlanLabel => ({ id: 'salida', text, sub, x: NX - 6, y: 150, up: 6, kind, prio: 8 }),
  rotura: (x: number, text = 'La rotura', sub?: string, kind: PlanLabel['kind'] = 'alerta'): PlanLabel => ({ id: 'rotura', text, sub, x, y: levY(x) + 4, up: 6, kind, prio: 9 }),
};

/** El agua para la escena: el resultado al terminar o, mientras calcula, el último mapa (el agua avanzando). */
export function waterOf(r: RunState, layer: Layer = 'profundidad', frame: number | null = null, extra: Partial<WaterState> = {}): WaterState | null {
  if (r.res && (r.status === 'listo' || r.status === 'inestable')) return { res: r.res, frame, layer, ...extra };
  if (r.live) return { res: null, frame: null, layer, live: r.live };
  return null;
}

/** Corridas de una tabla de experimentos: se lanzan juntas (en los hilos que haya) y se llenan a medida que terminan. */
export function useBatch(list: RunOpts[]): { rows: (Summary | null)[]; res: (RunResult | null)[]; busy: boolean; done: number; go: () => void } {
  const key = list.map(runKey).join('§');
  const [rows, setRows] = useState<(Summary | null)[]>(() => list.map(cachedSummary));
  const [res, setRes] = useState<(RunResult | null)[]>(() => list.map(() => null));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    setRows(list.map(cachedSummary));
    setRes(list.map(() => null));
    // la lista se identifica por su clave
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);
  const go = () => {
    if (busy) return;
    setBusy(true);
    setDone(0);
    const order = list.map((_, i) => i);
    runMany(
      list,
      (n) => alive.current && setDone(n),
      () => !alive.current,
    ).then((rs) => {
      if (!alive.current) return;
      setRes(rs);
      setRows(rs.map((r, i) => (r ? (cachedSummary(list[order[i]]) ?? summarize(r)) : null)));
      setBusy(false);
    });
  };
  return { rows, res, busy, done, go };
}

/** Aviso del cálculo en curso (o de su resultado) en la franja de la pregunta. */
export function RunBadge({ r, onRun, label = 'Calcular' }: { r: RunState & { start: () => void }; onRun?: () => void; label?: string }) {
  const busy = r.status === 'preproceso' || r.status === 'corriendo';
  return (
    <div className="hc-flood m2-badge">
      {busy ? (
        <span className="hc-flood-q" aria-live="polite">
          {r.status === 'preproceso' ? 'Preprocesador: tablas de la malla…' : `Calculando… ${es(r.progress * 100, 0)} %`}
        </span>
      ) : r.status === 'espera' ? (
        <button type="button" onClick={onRun ?? r.start}>
          {label}
        </button>
      ) : (
        <span className={`hc-flood-q${r.status === 'inestable' ? ' is-bad' : ''}`}>{r.status === 'inestable' ? 'La corrida se volvió inestable' : `Listo en ${es((r.res?.ms ?? 0) / 1000, 1)} s`}</span>
      )}
    </div>
  );
}

export function VexChoice({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <DockChoice
      label="Relieve en la escena"
      value={String(value) as '1' | '3' | '6'}
      options={[
        { value: '1', label: 'Real (×1)' },
        { value: '3', label: 'Exagerado ×3' },
        { value: '6', label: 'Exagerado ×6' },
      ]}
      onChange={(v) => onChange(Number(v))}
    />
  );
}

export const vexNote = (vex: number) => (vex === 1 ? 'relieve a escala real' : `relieve exagerado ×${vex} (el agua y el terreno se estiran lo mismo)`);

/** Diferencia con signo y unidades. */
export const sg = (v: number, d = 2, u = 'm') => `${v >= 0 ? '+' : '−'}${es(Math.abs(v), d)} ${u}`;

// ------------------------------------------------------------------ la creciente en el tiempo

/** Velocidades de la reproducción: minutos de creciente por segundo. */
export const SPEEDS = [
  { m: 1, label: '1 min/s' },
  { m: 3, label: '3 min/s' },
  { m: 8, label: '8 min/s' },
];

export interface Playback {
  /** Mapa que se ve (con decimales: entre dos mapas guardados) o null para los máximos; se actualiza unas 7 veces por segundo. */
  frame: number | null;
  /** El mismo, al día en cada cuadro (para la escena). */
  ref: MutableRefObject<number | null>;
  playing: boolean;
  speed: number;
  n: number;
  /** Tiempo [s] del mapa que se ve (null con los máximos). */
  t: number | null;
  toggle: () => void;
  seek: (f: number | null) => void;
  /** Ir a un minuto de la corrida. */
  seekMin: (min: number) => void;
  setSpeed: (k: number) => void;
}

/** Tiempo [s] de un mapa con decimales. */
export function frameTime(r: RunResult, f: number): number {
  const n = r.frameT.length;
  if (!n) return 0;
  const g = Math.max(0, Math.min(n - 1, f)), k = Math.min(n - 2, Math.floor(g));
  return n > 1 ? r.frameT[k] + (g - k) * (r.frameT[k + 1] - r.frameT[k]) : r.frameT[0];
}
/** Mapa (con decimales) de un tiempo [s]. */
export function frameAt(r: RunResult, t: number): number {
  const T = r.frameT, n = T.length;
  if (n < 2) return 0;
  if (t <= T[0]) return 0;
  if (t >= T[n - 1]) return n - 1;
  let k = 0;
  while (k + 1 < n && T[k + 1] < t) k++;
  return k + (t - T[k]) / Math.max(1e-9, T[k + 1] - T[k]);
}

/**
 * Reproducción de una corrida: avanza el mapa en cada cuadro (`push` lleva el instante a la escena sin pasar por
 * React) y avisa a la interfaz unas siete veces por segundo. Al cambiar de corrida vuelve a los máximos.
 */
export function usePlayback(res: RunResult | null, push: (f: number | null) => void): Playback {
  const [frame, setFrame] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const ref = useRef<number | null>(null);
  const pushRef = useRef(push);
  pushRef.current = push;
  const n = res?.frames.length ?? 0;
  useEffect(() => {
    ref.current = null;
    setFrame(null);
    setPlaying(false);
  }, [res]);
  useEffect(() => {
    if (!playing || !res || n < 2) return;
    let raf = 0, last = performance.now(), lastUi = 0, lastPush = 0;
    const dtOut = Math.max(1, (res.frameT[n - 1] - res.frameT[0]) / (n - 1));
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let f = ref.current ?? 0;
      f += (dt * SPEEDS[speed].m * 60) / dtOut;
      const end = f >= n - 1;
      if (end) f = n - 1;
      ref.current = f;
      // la escena se rehace a unos 30 cuadros por segundo como mucho (rehacer el agua cuesta unos milisegundos)
      if (now - lastPush > 30 || end) {
        lastPush = now;
        pushRef.current(f);
      }
      if (now - lastUi > 140 || end) {
        lastUi = now;
        setFrame(f);
      }
      if (end) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, res, speed, n]);
  const seek = (f: number | null) => {
    setPlaying(false);
    ref.current = f;
    setFrame(f);
    pushRef.current(f);
  };
  return {
    frame,
    ref,
    playing,
    speed,
    n,
    t: res && frame !== null ? frameTime(res, frame) : null,
    toggle: () => {
      if (!res || n < 2) return;
      if (playing) return setPlaying(false);
      if (ref.current === null || ref.current >= n - 1.001) {
        ref.current = 0;
        setFrame(0);
        pushRef.current(0);
      }
      setPlaying(true);
    },
    seek,
    seekMin: (min: number) => res && n > 1 && seek(frameAt(res, min * 60)),
    setSpeed,
  };
}

/** Barra de tiempo: reproducir, ir a un instante, volver a los máximos y la velocidad. */
export function TimeBar({ pb, res, note }: { pb: Playback; res: RunResult | null; note?: string }) {
  if (!res || pb.n < 2) return null;
  const f = pb.frame;
  const dur = res.frameT[pb.n - 1] / 60;
  const tm = pb.t === null ? null : pb.t / 60;
  const pct = ((f ?? pb.n - 1) / (pb.n - 1)) * 100;
  return (
    <div className="m2-time" role="group" aria-label="La creciente en el tiempo">
      <div className="m2-time-row">
        <button type="button" className="m2-play" onClick={pb.toggle} aria-label={pb.playing ? 'Pausar la creciente' : 'Reproducir la creciente'}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            {pb.playing ? <path d="M6 4h3v12H6zM11 4h3v12h-3z" /> : <path d="M6 4l10 6-10 6z" />}
          </svg>
          <span>{pb.playing ? 'Pausar' : f !== null && f < pb.n - 1.001 ? 'Seguir' : 'Reproducir'}</span>
        </button>
        <input
          type="range"
          className="m2-time-range"
          min={0}
          max={pb.n - 1}
          step={0.01}
          value={f ?? pb.n - 1}
          aria-label="Tiempo de la creciente"
          aria-valuetext={tm === null ? 'máximos de la corrida' : `${es(tm, 0)} minutos`}
          style={{ '--p': `${pct.toFixed(1)}%` } as CSSProperties}
          onChange={(e) => pb.seek(Number(e.target.value))}
        />
        <output className="m2-time-t">{tm === null ? 'Máximos' : `${es(tm, 0)} de ${es(dur, 0)} min`}</output>
      </div>
      <div className="m2-time-row is-opts">
        <button type="button" className={f === null ? 'is-on' : ''} aria-pressed={f === null} onClick={() => pb.seek(null)}>
          Máximos
        </button>
        <span className="m2-time-sp" role="radiogroup" aria-label="Velocidad">
          {SPEEDS.map((sp, k) => (
            <button key={sp.m} type="button" role="radio" aria-checked={pb.speed === k} className={pb.speed === k ? 'is-on' : ''} onClick={() => pb.setSpeed(k)}>
              {sp.label}
            </button>
          ))}
        </span>
      </div>
      {note && <p className="q3-small">{note}</p>}
    </div>
  );
}

/** Qué muestra el agua: su aspecto o un dato. */
export const WATER_LAYERS: { value: Layer; label: string }[] = [
  { value: 'natural', label: 'Aspecto' },
  { value: 'profundidad', label: 'Profundidad' },
  { value: 'velocidad', label: 'Velocidad' },
  { value: 'amenaza', label: 'Amenaza H1–H6' },
  { value: 'llegada', label: 'Llegada' },
];

export function WaterChoice({ value, onChange, options = WATER_LAYERS }: { value: Layer; onChange: (v: Layer) => void; options?: { value: Layer; label: string }[] }) {
  return <DockChoice<Layer> label="El agua muestra" value={value} options={options} onChange={onChange} />;
}

/** Partículas que siguen la corriente y lo que hace un clic en la escena. */
export function FlowTools({ particles, setParticles, tool, setTool, probeLabel = 'Sonda', notice }: { particles: boolean; setParticles: (v: boolean) => void; tool: ClickTool; setTool: (t: ClickTool) => void; probeLabel?: string; notice?: string }) {
  return (
    <>
      <DockChoice
        label="Partículas que siguen la corriente"
        value={particles ? 'si' : 'no'}
        options={[
          { value: 'si', label: `Sí (${PARTICLE_SPEED}× más rápido)` },
          { value: 'no', label: 'No' },
        ]}
        onChange={(v) => setParticles(v === 'si')}
      />
      <DockChoice<ClickTool>
        label="Un clic en la escena"
        value={tool}
        options={[
          { value: 'sonda', label: probeLabel },
          { value: 'tinta', label: 'Suelta tinta' },
        ]}
        onChange={setTool}
      />
      <p className="q3-small" aria-live="polite">
        {notice || (tool === 'tinta' ? 'Toca el agua: la tinta sigue la corriente del instante que se ve (reproduce la creciente para verla cambiar).' : 'Con el ratón, pasa el puntero sobre la escena para leer el suelo, el agua y la velocidad del punto.')}
      </p>
    </>
  );
}

/** Valor de una serie de la corrida en un tiempo [s] (interpolado). */
export function seriesAt(t: number[], v: number[], tq: number): number {
  if (!t.length) return NaN;
  if (tq <= t[0]) return v[0];
  for (let k = 0; k + 1 < t.length; k++) if (tq <= t[k + 1]) return v[k] + ((tq - t[k]) / Math.max(1e-9, t[k + 1] - t[k])) * (v[k + 1] - v[k]);
  return v[v.length - 1];
}

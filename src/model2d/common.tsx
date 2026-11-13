// Piezas comunes de las partes de la sala 2D: el estado por omisión del valle en 3D, los rótulos de los lugares, el
// aviso de la corrida en curso y el control de la exageración vertical.

import { useEffect, useRef, useState } from 'react';
import { DockChoice } from '../quality/shell';
import { es } from '../canals/common';
import { LEVEE, NX, POIS, ROAD, yc } from './terrain';
import { cachedSummary, runKey, runMany, type RunState } from './runs';
import { summarize, type Summary } from './scene';
import type { RunOpts, RunResult } from './solver';
import type { Layer, PlanLabel, ValleyState, WaterState } from './three/valleyWorld';

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

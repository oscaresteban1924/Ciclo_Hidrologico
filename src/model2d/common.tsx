// Piezas comunes de las partes de la sala 2D: el estado por omisión del valle en 3D, los rótulos de los lugares, el
// aviso de la corrida en curso y el control de la exageración vertical.

import { DockChoice } from '../quality/shell';
import { es } from '../canals/common';
import { LEVEE, NX, POIS, ROAD, yc } from './terrain';
import type { RunState } from './runs';
import type { PlanLabel, ValleyState } from './three/valleyWorld';

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
};

/** Aviso del cálculo en curso (o de su resultado) en la franja de la pregunta. */
export function RunBadge({ r, onRun, label = 'Calcular' }: { r: RunState & { start: () => void }; onRun?: () => void; label?: string }) {
  const busy = r.status === 'preproceso' || r.status === 'corriendo';
  return (
    <div className="hc-flood">
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

// Etiquetas del paisaje en HTML (tamaño constante y legible en cualquier encuadre).
// En exploración son botones: se pueden pulsar, tocar o activar con el teclado.

import { ELEMENT_BY_ID } from '../content/elements';
import type { ElementKind } from '../content/types';
import type { Mapper } from './camera';
import { ANCHORS, LABEL_OFFSETS } from './geometry';

export function KindGlyph({ kind }: { kind: ElementKind }) {
  if (kind === 'reservorio')
    return (
      <svg className="glyph" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="1.5" y="3" width="11" height="9" rx="1" fill="currentColor" opacity="0.35" />
        <rect x="1.5" y="3" width="11" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M1.5 7.5 h11" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  if (kind === 'proceso')
    return (
      <svg className="glyph" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M2 10 C5 10 6 4 11 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8.5 1.8 L11.8 4 L8.8 6.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (kind === 'fuerza')
    return (
      <svg className="glyph" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="3" fill="currentColor" />
        <path d="M7 1 v2 M7 11 v2 M1 7 h2 M11 7 h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg className="glyph" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7" cy="7" r="1.6" fill="currentColor" />
    </svg>
  );
}

interface Placed {
  id: string;
  x: number;
  y: number;
  w: number;
  ax: number;
  ay: number;
  primary: boolean;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function Labels({
  ids,
  mode,
  mapper,
  width,
  height,
  selected,
  found,
  compact,
  onSelect,
  blocked = [],
  primary,
}: {
  ids: string[];
  mode: 'info' | 'buttons';
  mapper: Mapper;
  width: number;
  height: number;
  selected: string | null;
  found?: string[];
  compact: boolean;
  onSelect?: (id: string) => void;
  /** Zonas ocupadas por controles o lupas: los rótulos las evitan. */
  blocked?: Box[];
  /** Rótulo del proceso principal (se muestra con más peso). */
  primary?: string | null;
}) {
  // Colocación con evasión de solapamientos: entre rótulos, con los controles y con las lupas.
  const placed: Placed[] = [];
  const main = selected ?? primary ?? null;
  const order = [...ids].sort((a, b) => (a === main ? -1 : b === main ? 1 : 0));
  const H = compact ? 28 : 30;
  for (const id of order) {
    const el = ELEMENT_BY_ID[id];
    const anchor = ANCHORS[id];
    if (!el || !anchor) continue;
    const [sx, sy] = mapper.toScreen(anchor[0], anchor[1]);
    if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;
    const isMain = id === main;
    const off = LABEL_OFFSETS[id] ?? [0, 0];
    const w = el.name.length * (compact ? (isMain ? 8.4 : 7.4) : isMain ? 8.7 : 7.7) + (isMain ? 48 : 40);
    const x0 = Math.max(w / 2 + 6, Math.min(width - w / 2 - 6, sx + off[0]));
    const y0 = sy + off[1];
    let best: { x: number; y: number } | null = null;
    // candidatos: posición preferida y alternativas cercanas (arriba, abajo, a los lados)
    const cands: [number, number][] = [
      [0, 0], [0, -H - 4], [0, H + 4], [w * 0.55, 0], [-w * 0.55, 0], [0, -2 * H - 8], [0, 2 * H + 8], [w * 0.6, -H - 4], [-w * 0.6, -H - 4], [w * 0.6, H + 4], [-w * 0.6, H + 4],
      [0, -3 * H - 12], [0, 3 * H + 12], [w, 0], [-w, 0], [w, -2 * H], [-w, -2 * H], [w, 2 * H], [-w, 2 * H],
    ];
    for (const [dx, dy] of cands) {
      const x = Math.max(w / 2 + 6, Math.min(width - w / 2 - 6, x0 + dx));
      const y = y0 + dy;
      if (y < H / 2 + 4 || y > height - H / 2 - 4) continue;
      const box = { x: x - w / 2 - 3, y: y - H / 2 - 3, w: w + 6, h: H + 6 };
      if (blocked.some((b) => overlaps(box, b))) continue;
      if (placed.some((p) => overlaps(box, { x: p.x - p.w / 2, y: p.y - H / 2, w: p.w, h: H }))) continue;
      best = { x, y };
      break;
    }
    if (!best && id === main) {
      // el rótulo principal siempre se muestra: se busca el lugar libre más cercano a su ancla
      let bestD = Infinity;
      for (let yy = H / 2 + 6; yy <= height - H / 2 - 6; yy += 12) {
        for (let xx = w / 2 + 6; xx <= width - w / 2 - 6; xx += 16) {
          const box = { x: xx - w / 2 - 3, y: yy - H / 2 - 3, w: w + 6, h: H + 6 };
          if (blocked.some((b) => overlaps(box, b))) continue;
          if (placed.some((p) => overlaps(box, { x: p.x - p.w / 2, y: p.y - H / 2, w: p.w, h: H }))) continue;
          const d = Math.hypot(xx - sx, yy - sy);
          if (d < bestD) {
            bestD = d;
            best = { x: xx, y: yy };
          }
        }
      }
      if (!best) best = { x: x0, y: Math.max(H / 2 + 4, Math.min(height - H / 2 - 4, y0)) };
    }
    if (!best) continue;
    placed.push({ id, x: best.x, y: best.y, w, ax: sx, ay: sy, primary: isMain });
  }

  return (
    <>
      <svg className="label-leaders" width={width} height={height} aria-hidden="true">
        {placed.map((p) => {
          const d = Math.hypot(p.x - p.ax, p.y - p.ay);
          if (d < 26) return null;
          return (
            <g key={p.id}>
              <path d={`M${p.ax.toFixed(1)} ${p.ay.toFixed(1)} L${p.x.toFixed(1)} ${p.y.toFixed(1)}`} stroke="#fff" strokeWidth="4" opacity="0.85" />
              <path d={`M${p.ax.toFixed(1)} ${p.ay.toFixed(1)} L${p.x.toFixed(1)} ${p.y.toFixed(1)}`} stroke="#17324d" strokeWidth="1.5" />
              <circle cx={p.ax} cy={p.ay} r="3.5" fill="#fff" stroke="#17324d" strokeWidth="1.8" />
            </g>
          );
        })}
      </svg>
      {placed.map(({ id, x, y, primary: isMain }) => {
        const el = ELEMENT_BY_ID[id];
        const isFound = found?.includes(id);
        const cls = `scene-label kind-${el.kind}${isMain ? ' is-primary' : ' is-secondary'}${selected === id ? ' is-selected' : ''}${isFound ? ' is-found' : ''}`;
        const style = { left: x, top: y };
        const content = (
          <>
            <KindGlyph kind={el.kind} />
            <span>{el.name}</span>
            {isFound && (
              <svg className="check" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M2.5 7.5 L5.8 10.5 L11.5 3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </>
        );
        return mode === 'buttons' ? (
          <button
            key={id}
            type="button"
            className={cls}
            style={style}
            aria-pressed={selected === id}
            aria-label={`${el.name}. ${el.kind === 'reservorio' ? 'Reservorio' : el.kind === 'proceso' ? 'Proceso' : 'Elemento'}${isFound ? ', encontrado' : ''}`}
            onClick={() => onSelect?.(id)}
          >
            {content}
          </button>
        ) : (
          <div key={id} className={cls} style={style}>
            {content}
          </div>
        );
      })}
    </>
  );
}

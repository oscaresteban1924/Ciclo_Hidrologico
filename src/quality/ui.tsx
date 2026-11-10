// Piezas de interfaz del módulo de calidad del agua: formato de números, control deslizante y gráfica de
// perfil (una línea, con escala logarítmica opcional y marcas de referencia).

import { createContext, useContext, useId, useState, type ReactNode } from 'react';

/** Pestaña activa del módulo (para enlazar el panel con su pestaña). */
export const ActiveTab = createContext('');

export function fmt(v: number, d = 1): string {
  return v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Número grande legible: 93 700 → «93 700»; 2,4 × 10⁶ → «2,4 millones». */
export function fmtBig(v: number): string {
  if (v < 1) return fmt(v, 1);
  if (v < 1e5) return Math.round(v).toLocaleString('es-CO');
  if (v < 1e6) return `${fmt(v / 1000, 0)} mil`;
  const m = v / 1e6;
  return `${fmt(m, m < 10 ? 1 : 0)} ${m < 2 ? 'millón' : 'millones'}`;
}

export function QRange({ label, value, min, max, step, unit, onChange, help, digits }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; help?: ReactNode; digits?: number }) {
  const id = useId();
  return (
    <div className="q-range">
      <label htmlFor={id}>
        <span>{label}</span>
        <output htmlFor={id}>{`${fmt(value, digits ?? (step < 1 ? 1 : 0))} ${unit}`}</output>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {help && <p className="q-help">{help}</p>}
    </div>
  );
}

export interface ProfileLine {
  points: [number, number][];
  color: string;
  label: string;
}

/**
 * Gráfica de un parámetro a lo largo de la quebrada (eje x en metros). `refs` son líneas horizontales de
 * referencia (por ejemplo, un criterio) y `marks`, posiciones verticales (estaciones y sonda).
 */
export function ProfileChart({ title, lines, yUnit, log = false, refs = [], marks = [], fmtY, xLabel = 'distancia desde el vertimiento (m)', xUnit = 'm' }: { title: string; lines: ProfileLine[]; yUnit: string; log?: boolean; refs?: { y: number; label: string; color: string }[]; marks?: { x: number; label: string; strong?: boolean }[]; fmtY: (v: number) => string; xLabel?: string; xUnit?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 520, H = 200, L = 58, R = 14, T = 14, B = 34;
  const xs = lines.flatMap((l) => l.points.map((p) => p[0]));
  const ys = lines.flatMap((l) => l.points.map((p) => p[1])).concat(refs.map((r) => r.y));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const tr = (v: number) => (log ? Math.log10(Math.max(v, 1e-3)) : v);
  let y0 = log ? Math.floor(Math.min(...ys.map(tr))) : 0;
  let y1 = Math.max(...ys.map(tr));
  if (log) y1 = Math.ceil(y1 + 0.01);
  else y1 = y1 > 0 ? y1 * 1.12 : 1;
  if (y1 - y0 < 1e-9) y1 = y0 + 1;
  if (log) y0 = Math.max(y0, -1);
  const sx = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (v: number) => T + (1 - (tr(v) - y0) / (y1 - y0)) * (H - T - B);
  const ticks = log ? Array.from({ length: Math.round(y1 - y0) + 1 }, (_, k) => Math.pow(10, y0 + k)) : [0, (y1 / 1.12) / 2, y1 / 1.12].map((v) => v);
  const main = lines[0];
  const hp = hover !== null ? main.points[hover] : null;
  return (
    <figure className="q-chart">
      <figcaption id={`${id}-t`}>{title}</figcaption>
      {lines.length > 1 && (
        <ul className="q-legend">
          {lines.map((l) => (
            <li key={l.label}>
              <svg width="18" height="8" aria-hidden="true"><line x1="1" y1="4" x2="17" y2="4" stroke={l.color} strokeWidth="2.5" /></svg>
              {l.label}
            </li>
          ))}
        </ul>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}-t`}
        tabIndex={0}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          let best = 0, bd = Infinity;
          main.points.forEach(([px], i) => {
            const d = Math.abs(sx(px) - x);
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((h) => Math.min(main.points.length - 1, (h ?? -1) + 1));
          if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? main.points.length) - 1));
          if (e.key === 'Escape') setHover(null);
        }}
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="q-grid" />
            <text x={L - 6} y={sy(v) + 4} textAnchor="end" className="q-tick">{fmtY(v)}</text>
          </g>
        ))}
        {refs.map((r) => (
          <g key={r.label}>
            <line x1={L} x2={W - R} y1={sy(r.y)} y2={sy(r.y)} stroke={r.color} strokeWidth="1.4" strokeDasharray="5 3" />
            <text x={L + 4} y={sy(r.y) - 4} className="q-tick" fill={r.color}>{r.label}</text>
          </g>
        ))}
        {marks.map((m) => (
          <g key={m.label}>
            <line x1={sx(m.x)} x2={sx(m.x)} y1={T} y2={H - B} stroke={m.strong ? '#c8246f' : '#9aa9b5'} strokeWidth={m.strong ? 1.6 : 1} strokeDasharray={m.strong ? undefined : '2 3'} />
            <text x={sx(m.x)} y={H - B + 13} textAnchor="middle" className="q-tick" fill={m.strong ? '#c8246f' : undefined}>{m.label}</text>
          </g>
        ))}
        {lines.map((l) => (
          <polyline key={l.label} points={l.points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')} fill="none" stroke={l.color} strokeWidth="2.2" strokeLinejoin="round" />
        ))}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" className="q-tick">{xLabel}</text>
        {hp && (
          <g>
            <line x1={sx(hp[0])} x2={sx(hp[0])} y1={T} y2={H - B} stroke="#17324d" strokeWidth="1" />
            <circle cx={sx(hp[0])} cy={sy(hp[1])} r="4" fill={main.color} stroke="#fff" strokeWidth="1.5" />
            <text x={Math.min(W - R - 4, Math.max(L + 4, sx(hp[0])))} y={T + 10} textAnchor={sx(hp[0]) > W / 2 ? 'end' : 'start'} className="q-tick q-tip">{`${Math.round(hp[0])} ${xUnit}: ${fmtY(hp[1])} ${yUnit}`}</text>
          </g>
        )}
      </svg>
    </figure>
  );
}

/** Distribución del módulo: escena a la izquierda y panel a la derecha (encabezado con las pestañas arriba). */
export function QLayout({ head, stage, panel }: { head: ReactNode; stage: ReactNode; panel: ReactNode }) {
  const tab = useContext(ActiveTab);
  return (
    <main className="layout-quality">
      <section className="q-stage" aria-label="Escena interactiva">
        {stage}
      </section>
      <aside className="q-panel" aria-label="Controles y resultados">
        {head}
        <div className="q-scroll" id="q-tabpanel" role="tabpanel" aria-labelledby={tab} tabIndex={-1}>
          {panel}
        </div>
      </aside>
    </main>
  );
}

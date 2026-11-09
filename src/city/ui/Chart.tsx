// Gráfica de líneas en SVG: una o dos series (A punteada, B continua), leyenda siempre visible para
// dos series, etiqueta directa al final de cada línea y lectura con el puntero o el teclado.

import { useId, useMemo, useState } from 'react';

export interface Series {
  id: string;
  name: string;
  points: [number, number][];
  color: string;
  dash?: boolean;
}

export function LineChart({
  title,
  series,
  fmtY,
  yUnit,
  height = 150,
  marker,
  refY,
}: {
  title: string;
  series: Series[];
  fmtY: (v: number) => string;
  yUnit: string;
  height?: number;
  /** Línea vertical opcional (p. ej., fin de la lluvia) [min]. */
  marker?: { x: number; label: string };
  /** Línea horizontal de referencia opcional (p. ej., capacidad del cauce), en unidades de y. */
  refY?: { y: number; label: string };
}) {
  const id = useId();
  const W = 340, H = height, L = 46, R = 14, T = 12, B = 26;
  const [hover, setHover] = useState<number | null>(null);
  const { xMax, yMax } = useMemo(() => {
    let xm = 1, ym = 0;
    for (const s of series) for (const [x, y] of s.points) {
      if (x > xm) xm = x;
      if (y > ym) ym = y;
    }
    if (refY && refY.y > ym) ym = refY.y;
    return { xMax: xm, yMax: ym > 0 ? ym * 1.12 : 1 };
  }, [series, refY]);
  const sx = (x: number) => L + (x / xMax) * (W - L - R);
  const sy = (y: number) => T + (1 - y / yMax) * (H - T - B);
  const ticksY = [0, yMax / 2, yMax];
  const ticksX = [0, xMax / 2, xMax];
  const longest = series.reduce((m, s) => Math.max(m, s.points.length), 0);
  const hx = hover !== null ? series.find((s) => s.points.length === longest)?.points[hover]?.[0] : undefined;
  const move = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const ref = series.find((s) => s.points.length === longest);
    if (!ref || !ref.points.length) return;
    let best = 0, bd = Infinity;
    ref.points.forEach(([px], i) => {
      const d = Math.abs(sx(px) - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  };
  const empty = series.every((s) => s.points.length < 2);
  return (
    <figure className="city-chart">
      <figcaption id={`${id}-t`}>{title}</figcaption>
      {series.length > 1 && (
        <ul className="chart-legend">
          {series.map((s) => (
            <li key={s.id}>
              <svg width="26" height="10" aria-hidden="true">
                <line x1="1" y1="5" x2="25" y2="5" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash ? '5 3' : undefined} />
              </svg>
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}-t`}
        tabIndex={0}
        onPointerMove={(e) => move(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setHover((h) => Math.min(longest - 1, (h ?? -1) + 1));
          if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? longest) - 1));
          if (e.key === 'Escape') setHover(null);
        }}
      >
        {ticksY.map((v, i) => (
          <g key={`y${i}`}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" />
            <text x={L - 6} y={sy(v) + 4} textAnchor="end" className="tick">
              {fmtY(v)}
            </text>
          </g>
        ))}
        {ticksX.map((v, i) => (
          <text key={`x${i}`} x={sx(v)} y={H - 8} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} className="tick">
            {Math.round(v)} min
          </text>
        ))}
        {refY && (
          <g>
            <line x1={L} x2={W - R} y1={sy(refY.y)} y2={sy(refY.y)} className="marker" strokeDasharray="5 4" />
            <text x={L + 4} y={sy(refY.y) - 4} className="tick">
              {refY.label}
            </text>
          </g>
        )}
        {marker && marker.x <= xMax && (
          <g>
            <line x1={sx(marker.x)} x2={sx(marker.x)} y1={T} y2={H - B} className="marker" />
            <text x={sx(marker.x) + 4} y={T + 9} className="tick">
              {marker.label}
            </text>
          </g>
        )}
        {series.map((s) =>
          s.points.length > 1 ? (
            <polyline key={s.id} points={s.points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash ? '6 4' : undefined} strokeLinejoin="round" />
          ) : null,
        )}
        {series.length > 1 &&
          (() => {
            // etiquetas directas al final de cada línea, separadas si quedan muy cerca
            const ends = series.map((s) => ({ s, p: s.points[s.points.length - 1] })).filter((e) => e.p).map((e) => ({ id: e.s.id, x: Math.min(sx(e.p[0]) - 2, W - R - 2), y: sy(e.p[1]) - 6 }));
            ends.sort((a, b) => a.y - b.y);
            for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
            return ends.map((e) => (
              <text key={`l${e.id}`} x={e.x} y={Math.min(e.y, H - B - 2)} textAnchor="end" className="direct">
                {e.id}
              </text>
            ));
          })()}
        {hover !== null && hx !== undefined && (
          <g>
            <line x1={sx(hx)} x2={sx(hx)} y1={T} y2={H - B} className="cross" />
            {series.map((s) => {
              const p = s.points[Math.min(hover, s.points.length - 1)];
              return p ? <circle key={`c${s.id}`} cx={sx(p[0])} cy={sy(p[1])} r="4" fill={s.color} stroke="var(--panel)" strokeWidth="2" /> : null;
            })}
          </g>
        )}
        {empty && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="tick">
            Aún no hay datos: inicia la lluvia.
          </text>
        )}
      </svg>
      <p className="chart-read" aria-live="polite">
        {hover !== null && hx !== undefined
          ? `Minuto ${hx.toFixed(1).replace('.', ',')}: ${series.map((s) => `${s.name} ${fmtY(s.points[Math.min(hover, s.points.length - 1)]?.[1] ?? 0)}`).join(' · ')}`
          : `Eje vertical: ${yUnit}. Pasa el puntero o usa las flechas para leer valores.`}
      </p>
    </figure>
  );
}

// Gráfica de líneas en SVG: una o varias series, leyenda siempre visible para dos o más, rótulo directo al
// final de cada línea (en un margen propio, sin superponerse) y lectura con el puntero o el teclado.

import { useId, useMemo, useState } from 'react';

export interface Series {
  id: string;
  name: string;
  points: [number, number][];
  color: string;
  dash?: boolean;
  /** Rótulo corto al final de la línea (por defecto, `id`). */
  label?: string;
  /** Rellena el área bajo la línea (tenue). */
  fill?: boolean;
}

export function LineChart({
  title,
  series,
  fmtY,
  yUnit,
  height = 150,
  marker,
  refY,
  xMax: xMaxFixed,
  nowX,
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
  /** Dominio fijo del eje x [min] (si no, se ajusta a los datos). */
  xMax?: number;
  /** Instante actual [min]: línea vertical tenue. */
  nowX?: number;
}) {
  const id = useId();
  const multi = series.length > 1;
  const W = 340, H = height, L = 46, R = multi ? 66 : 14, T = 12, B = 26;
  const [hover, setHover] = useState<number | null>(null);
  const { xMax, yMax } = useMemo(() => {
    let xm = 1, ym = 0;
    for (const s of series) for (const [x, y] of s.points) {
      if (x > xm) xm = x;
      if (y > ym) ym = y;
    }
    if (xMaxFixed && xMaxFixed > xm) xm = xMaxFixed;
    if (refY && refY.y > ym) ym = refY.y;
    return { xMax: xm, yMax: ym > 0 ? ym * 1.12 : 1 };
  }, [series, refY, xMaxFixed]);
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
  // rótulos al final de cada línea, en el margen derecho, separados al menos 12 px
  const ends = multi
    ? series
        .filter((s) => s.points.length > 1)
        .map((s) => {
          const p = s.points[s.points.length - 1];
          // el rótulo va junto al final de la línea (o en el margen derecho si la línea llega hasta él)
          const x = sx(p[0]);
          return { s, x, lx: Math.min(x + 6, W - R + 4), y0: sy(p[1]), y: sy(p[1]) };
        })
        .sort((a, b) => a.y0 - b.y0)
    : [];
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
  const over = ends.length ? ends[ends.length - 1].y - (H - B - 2) : 0;
  if (over > 0) for (const e of ends) e.y -= over;
  return (
    <figure className="city-chart">
      <figcaption id={`${id}-t`}>{title}</figcaption>
      {multi && (
        <ul className="chart-legend">
          {series.map((s) => (
            <li key={s.id} title={s.name}>
              <svg width="22" height="10" aria-hidden="true">
                <line x1="1" y1="5" x2="21" y2="5" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash ? '5 3' : undefined} />
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
            <line x1={L} x2={W - R} y1={sy(refY.y)} y2={sy(refY.y)} className="ref" />
            {/* a la izquierda: los rótulos de las líneas van a la derecha */}
            <text x={L + 4} y={sy(refY.y) - 4} textAnchor="start" className="tick ref-label">
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
        {nowX !== undefined && nowX > 0 && nowX <= xMax && <line x1={sx(nowX)} x2={sx(nowX)} y1={T} y2={H - B} className="now" />}
        {series.map((s) =>
          s.fill && s.points.length > 1 ? (
            <polygon
              key={`f${s.id}`}
              points={`${sx(s.points[0][0]).toFixed(1)},${sy(0).toFixed(1)} ${s.points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')} ${sx(s.points[s.points.length - 1][0]).toFixed(1)},${sy(0).toFixed(1)}`}
              fill={s.color}
              opacity="0.16"
            />
          ) : null,
        )}
        {series.map((s) =>
          s.points.length > 1 ? (
            <polyline key={s.id} points={s.points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash ? '6 4' : undefined} strokeLinejoin="round" />
          ) : null,
        )}
        {ends.map((e) => (
          <g key={`l${e.s.id}`}>
            <circle cx={e.x} cy={e.y0} r="2.5" fill={e.s.color} />
            <rect x={e.lx} y={e.y - 6} width="3" height="8" fill={e.s.color} />
            <text x={e.lx + 6} y={e.y + 1} className="direct">
              {e.s.label ?? e.s.id}
            </text>
          </g>
        ))}
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
          <text x={(L + W - R) / 2} y={H / 2} textAnchor="middle" className="tick">
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

// Piezas comunes de las vistas de detalle: rampas de tiempo, rótulos con línea guía,
// flechas y símbolos con la misma lógica visual del paisaje (la forma distingue el estado).


export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 0 antes de a, 1 después de b, lineal entre ambos. */
export const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const ease = (v: number) => v * v * (3 - 2 * v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const INK = '#17324d';
export const WATER = '#3b8fd0';
export const WATER_DEEP = '#1f6fae';
export const AIR = '#f7f1e3';

/** Marcadores y patrones compartidos por las vistas de detalle. */
export function DetailDefs() {
  return (
    <defs>
      <marker id="d-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill={INK} />
      </marker>
      <marker id="d-arrow-water" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill={WATER_DEEP} />
      </marker>
      <marker id="d-arrow-vapor" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M1 1 L9 5 L1 9" fill="none" stroke="#6b6fd1" strokeWidth="1.8" />
      </marker>
      <pattern id="d-ripple" width="14" height="8" patternUnits="userSpaceOnUse">
        <rect width="14" height="8" fill={WATER} />
        <path d="M1 5 q3 -2.4 6 0 t6 0" fill="none" stroke="#7fbbe6" strokeWidth="1" />
      </pattern>
    </defs>
  );
}

/** Rótulo dentro del esquema con línea guía hasta lo que señala. Se mantiene dentro del cuadro. */
export function Callout({
  x,
  y,
  tx,
  ty,
  children,
  opacity = 1,
  anchor = 'start',
  width,
  vbW = 640,
  vbH = 400,
}: {
  x: number;
  y: number;
  tx: number;
  ty: number;
  children: string;
  opacity?: number;
  anchor?: 'start' | 'end' | 'middle';
  width?: number;
  vbW?: number;
  vbH?: number;
}) {
  if (opacity <= 0.01) return null;
  const w = width ?? Math.round(children.length * 8.3 + 28);
  let bx = anchor === 'start' ? tx : anchor === 'end' ? tx - w : tx - w / 2;
  bx = Math.max(6, Math.min(vbW - w - 6, bx));
  const by = Math.max(18, Math.min(vbH - 18, ty));
  const ex = Math.max(bx + 14, Math.min(bx + w - 14, tx));
  return (
    <g opacity={opacity} className="d-callout">
      <path d={`M${x} ${y} L${ex} ${by}`} stroke={INK} strokeWidth="1.5" fill="none" />
      <circle cx={x} cy={y} r="3.4" fill="#fff" stroke={INK} strokeWidth="1.7" />
      <rect x={bx} y={by - 14} width={w} height="28" rx="14" fill="#fff" stroke={INK} strokeWidth="1.5" />
      <text x={bx + w / 2} y={by + 5} textAnchor="middle" className="d-label">
        {children}
      </text>
    </g>
  );
}

/** Gota líquida (misma forma que en el paisaje). */
export function Drop({ x, y, s = 1, opacity = 1 }: { x: number; y: number; s?: number; opacity?: number }) {
  return (
    <path
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})`}
      d="M0 -7 C3.5 -2.4 4.8 0 4.8 2.2 A4.8 4.8 0 0 1 -4.8 2.2 C-4.8 0 -3.5 -2.4 0 -7Z"
      fill={WATER_DEEP}
      stroke="#fff"
      strokeWidth="1.2"
      opacity={opacity}
    />
  );
}

/** Vapor: anillo hueco con contorno discontinuo. El vapor real es invisible; esto es un símbolo. */
export function Vapor({ x, y, s = 1, opacity = 1 }: { x: number; y: number; s?: number; opacity?: number }) {
  return (
    <circle cx={x} cy={y} r={6 * s} fill="none" stroke="#6b6fd1" strokeWidth={1.8} strokeDasharray="3.2 2.4" opacity={opacity} />
  );
}

/** Lluvia en bucle continuo, con un número fijo y moderado de gotas. */
export function Rain({ clock, x0, x1, y0, y1, n = 12, opacity = 1, seed = 5 }: { clock: number; x0: number; x1: number; y0: number; y1: number; n?: number; opacity?: number; seed?: number }) {
  if (opacity <= 0.01) return null;
  const r = seeded(seed);
  const drops = Array.from({ length: n }, () => ({ x: x0 + r() * (x1 - x0), ph: r(), sp: 0.7 + r() * 0.5 }));
  return (
    <g opacity={opacity}>
      {drops.map((d, i) => {
        const k = (clock * d.sp + d.ph) % 1;
        return <Drop key={i} x={d.x} y={y0 + k * (y1 - y0)} s={0.9} />;
      })}
    </g>
  );
}

export interface Grain {
  x: number;
  y: number;
  r: number;
  d: string;
  fill: string;
}

/** Contorno cerrado suave de un grano (Catmull-Rom a Bézier). */
export function blob(cx: number, cy: number, r: number, rnd: () => number, squash = 0.92): string {
  const n = 8;
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const rr = r * (0.86 + rnd() * 0.24);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

/** Granos distribuidos sin superponerse dentro de un rectángulo. */
export function makeGrains(o: { seed: number; x0: number; x1: number; y0: number; y1: number; rMin: number; rMax: number; gap: number; n: number; fills: string[] }): Grain[] {
  const rnd = seeded(o.seed);
  const out: Grain[] = [];
  let tries = 0;
  while (out.length < o.n && tries++ < o.n * 80) {
    const r = o.rMin + rnd() * (o.rMax - o.rMin);
    const x = o.x0 + rnd() * (o.x1 - o.x0);
    const y = o.y0 + rnd() * (o.y1 - o.y0);
    if (out.some((g) => Math.hypot(g.x - x, g.y - y) < g.r + r + o.gap)) continue;
    out.push({ x, y, r, d: blob(x, y, r, rnd), fill: o.fills[out.length % o.fills.length] });
  }
  return out;
}

/** Cristal de hielo de seis brazos (misma forma que en el paisaje). */
export function Ice({ x, y, s = 1, opacity = 1, rot = 0 }: { x: number; y: number; s?: number; opacity?: number; rot?: number }) {
  const arms = [0, 60, 120];
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(0)}) scale(${s})`} opacity={opacity}>
      {arms.map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M-8 0 H8 M-5 0 l-2.4 -2.4 M-5 0 l-2.4 2.4 M5 0 l2.4 -2.4 M5 0 l2.4 2.4" stroke="#5b8fc0" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M-8 0 H8 M-5 0 l-2.4 -2.4 M-5 0 l-2.4 2.4 M5 0 l2.4 -2.4 M5 0 l2.4 2.4" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

/** Flecha gruesa con contorno blanco (para indicar dirección sobre fondos variados). */
export function BigArrow({ d, color = INK, width = 4, opacity = 1 }: { d: string; color?: string; width?: number; opacity?: number }) {
  if (opacity <= 0.01) return null;
  return (
    <g opacity={opacity} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke="#fff" strokeWidth={width + 4} />
      <path d={d} stroke={color} strokeWidth={width} markerEnd={color === WATER_DEEP ? 'url(#d-arrow-water)' : 'url(#d-arrow)'} />
    </g>
  );
}

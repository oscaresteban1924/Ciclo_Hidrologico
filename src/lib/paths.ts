// Utilidades geométricas para construir y recorrer trazados del paisaje.

export type Pt = readonly [number, number];

interface Bezier {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p1: Pt;
}

/** Convierte una lista de puntos en segmentos Bézier suaves (Catmull-Rom). */
function toBeziers(points: readonly Pt[], tension = 1): Bezier[] {
  const out: Bezier[] = [];
  const k = tension / 6;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    out.push({
      p0: p1,
      c1: [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k],
      c2: [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k],
      p1: p2,
    });
  }
  return out;
}

const f = (n: number) => Math.round(n * 10) / 10;

/** Trazado SVG suave que pasa por todos los puntos. */
export function smoothPath(points: readonly Pt[], tension = 1, move = true): string {
  if (points.length < 2) return '';
  const segs = toBeziers(points, tension);
  let d = move ? `M${f(points[0][0])} ${f(points[0][1])}` : `L${f(points[0][0])} ${f(points[0][1])}`;
  for (const s of segs) {
    d += ` C${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.p1[0])} ${f(s.p1[1])}`;
  }
  return d;
}

/** Trazado SVG de segmentos rectos. */
export function linePath(points: readonly Pt[], close = false): string {
  if (!points.length) return '';
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join(' ');
  return close ? `${d} Z` : d;
}

function bezierAt(b: Bezier, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const c = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return [
    a * b.p0[0] + c * b.c1[0] + d * b.c2[0] + e * b.p1[0],
    a * b.p0[1] + c * b.c1[1] + d * b.c2[1] + e * b.p1[1],
  ];
}

/** Muestrea densamente una curva suave para recorrerla con partículas. */
export function densify(points: readonly Pt[], perSegment = 14, smooth = true): Pt[] {
  if (!smooth || points.length < 3) {
    const out: Pt[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      for (let j = 0; j < perSegment; j++) {
        const t = j / perSegment;
        out.push([
          points[i][0] + (points[i + 1][0] - points[i][0]) * t,
          points[i][1] + (points[i + 1][1] - points[i][1]) * t,
        ]);
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }
  const segs = toBeziers(points);
  const out: Pt[] = [];
  for (const s of segs) {
    for (let j = 0; j < perSegment; j++) out.push(bezierAt(s, j / perSegment));
  }
  out.push(points[points.length - 1]);
  return out;
}

export interface PathSampler {
  readonly length: number;
  readonly points: readonly Pt[];
  /** Posición a una distancia s (en unidades de escena) desde el inicio. */
  at(s: number): { x: number; y: number; angle: number };
}

export function makeSampler(points: readonly Pt[], smooth = true): PathSampler {
  const pts = densify(points, 16, smooth);
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const length = cum[cum.length - 1];
  return {
    length,
    points: pts,
    at(s: number) {
      const d = Math.max(0, Math.min(length, s));
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= d) lo = mid;
        else hi = mid;
      }
      const span = cum[hi] - cum[lo] || 1;
      const t = (d - cum[lo]) / span;
      const a = pts[lo];
      const b = pts[hi];
      return {
        x: a[0] + (b[0] - a[0]) * t,
        y: a[1] + (b[1] - a[1]) * t,
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      };
    },
  };
}

/** Interpolación lineal de y para un perfil ordenado por x. */
export function yAt(points: readonly Pt[], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const a = points[i - 1];
      const b = points[i];
      const t = (x - a[0]) / (b[0] - a[0] || 1);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return points[points.length - 1][1];
}

/** Banda (cinta) de ancho variable alrededor de una línea central. */
export function ribbon(points: readonly Pt[], width: (t: number) => number): string {
  const pts = densify(points, 10, true);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const w = width(i / (pts.length - 1)) / 2;
    const nx = -Math.sin(ang) * w;
    const ny = Math.cos(ang) * w;
    left.push([pts[i][0] + nx, pts[i][1] + ny]);
    right.push([pts[i][0] - nx, pts[i][1] - ny]);
  }
  return linePath([...left, ...right.reverse()], true);
}

/** Generador pseudoaleatorio determinista (para que el paisaje sea siempre igual). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

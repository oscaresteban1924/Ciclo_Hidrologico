// Colores de la red separada y camino principal de cada red (sin Three.js: los usa también la interfaz).

import type { Compiled } from '../sim/compile';

/** Colores por sistema (cáscara de la tubería y agua dentro). Rótulos y leyenda los acompañan siempre. */
export const SEWER_COLORS = {
  lluvias: { shell: '#2f6fb3', water: '#6fb1ea' },
  residuales: { shell: '#8a5a2b', water: '#c9925a' },
  carga: '#e03131',
  errada: '#7048e8',
} as const;

/** Camino principal de una red: de la cámara más alejada a la descarga, siguiendo el tramo con más recorrido. */
export function mainPath(c: Compiled, system: 0 | 1): number[] {
  const s = c.sewer;
  if (!s) return [];
  const outs = s.nodes.map((n, k) => (n.system === system && n.outfall ? k : -1)).filter((k) => k >= 0);
  if (!outs.length) return [];
  // longitud de recorrido aguas arriba de cada nodo (solo colectores)
  const up = new Map<number, number>();
  const lenUp = (k: number): number => {
    if (up.has(k)) return up.get(k)!;
    let best = 0;
    for (const p of s.pipes) if (p.b === k && p.role === 'colector') best = Math.max(best, p.L + lenUp(p.a));
    up.set(k, best);
    return best;
  };
  const start = outs.reduce((a, b) => (lenUp(b) > lenUp(a) ? b : a));
  const path = [start];
  let k = start;
  for (let guard = 0; guard < 100; guard++) {
    const ins = s.pipes.filter((p) => p.b === k && p.role === 'colector');
    if (!ins.length) break;
    const p = ins.reduce((a, b) => (b.L + lenUp(b.a) > a.L + lenUp(a.a) ? b : a));
    k = p.a;
    path.unshift(k);
  }
  return path;
}

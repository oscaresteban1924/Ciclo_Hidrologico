// Colores de la red separada y camino principal de cada red (sin Three.js: los usa también la interfaz).

import type { Compiled } from '../sim/compile';
import type { Scenario } from '../sim/scenario';

/** Qué red se muestra bajo la calle y en el esquema. */
export type NetFilter = 'ambas' | 'lluvias' | 'residuales';
export const showsSystem = (f: NetFilter, sys: 0 | 1): boolean => f === 'ambas' || (f === 'lluvias' ? sys === 0 : sys === 1);

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

export interface Acometida {
  /** Edificio, nodo de aguas residuales al que entrega en el cálculo y tramo al que se conecta en el dibujo. */
  b: number;
  node: number;
  pipe: number;
  /** Bajante (planta) y punto de conexión sobre el eje del colector (planta y cota de la clave del tubo). */
  from: [number, number];
  to: [number, number];
  zTo: number;
  errada: boolean;
}

/**
 * Acometidas domiciliarias dibujadas como en la calle: de la casa al colector de aguas residuales, en el
 * punto del tramo más cercano a la bajante (perpendicular al colector). En el cálculo, su caudal entra en la
 * cámara asignada (práctica usual de modelación: el aporte se concentra en el nodo de aguas abajo del tramo).
 */
export function acometidas(sc: Scenario, c: Compiled, erradasOn: boolean): Acometida[] {
  const s = c.sewer;
  if (!s || !sc.sewer) return [];
  const err = new Set(erradasOn ? sc.sewer.erradas.buildingIds : []);
  const out: Acometida[] = [];
  sc.buildings.forEach((b, bi) => {
    const nid = sc.sewer!.sanitary.buildingNode[b.id];
    const k = s.nodes.findIndex((n) => n.id === nid);
    if (k < 0) return;
    const [px, py] = b.downspout;
    // tramos de colector que llegan a la cámara o salen de ella
    let best = { d: Infinity, pipe: -1, x: s.nodes[k].x, y: s.nodes[k].y, t: 0 };
    s.pipes.forEach((p, q) => {
      if (p.system !== 1 || p.role !== 'colector' || (p.a !== k && p.b !== k)) return;
      const A = s.nodes[p.a], B = s.nodes[p.b];
      const ex = B.x - A.x, ey = B.y - A.y, L2 = ex * ex + ey * ey;
      const t = L2 > 0 ? Math.max(0.04, Math.min(0.96, ((px - A.x) * ex + (py - A.y) * ey) / L2)) : 0;
      const x = A.x + t * ex, y = A.y + t * ey;
      const d = Math.hypot(px - x, py - y);
      if (d < best.d) best = { d, pipe: q, x, y, t };
    });
    const p = best.pipe >= 0 ? s.pipes[best.pipe] : null;
    const zTo = p ? p.zUp + (p.zDn - p.zUp) * best.t + p.D : s.nodes[k].inv + 0.6;
    out.push({ b: bi, node: k, pipe: best.pipe, from: [px, py], to: [best.x, best.y], zTo, errada: err.has(b.id) });
  });
  return out;
}

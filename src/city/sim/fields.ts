// Adaptador simulación → dibujo: muestrea el estado calculado para flechas, colores y trazadores.
// No modifica la simulación. Las flechas usan la misma velocidad que el modelo calcula en cada celda.

import { H_WET } from './constants';
import type { CitySim } from './engine';

export interface Arrow {
  x: number;
  y: number;
  ux: number;
  uy: number;
  speed: number;
  depth: number;
}

/** Flechas de flujo cada `stride` celdas donde hay agua suficiente y movimiento apreciable. */
export function flowArrows(sim: CitySim, stride: number, minDepth = 0.002, minSpeed = 0.02): Arrow[] {
  const { nx, ny, dx } = sim.c;
  const out: Arrow[] = [];
  const off = Math.floor(stride / 2);
  for (let j = off; j < ny; j += stride) {
    for (let i = off; i < nx; i += stride) {
      const k = j * nx + i;
      const h = sim.h[k];
      if (h < minDepth) continue;
      const [ux, uy] = sim.velocityAt(k);
      const sp = Math.hypot(ux, uy);
      if (sp < minSpeed) continue;
      out.push({ x: (i + 0.5) * dx, y: (j + 0.5) * dx, ux, uy, speed: sp, depth: h });
    }
  }
  return out;
}

/** Velocidad interpolada en un punto cualquiera a partir de los caudales de cara (malla escalonada). */
export function velocityAtPoint(sim: CitySim, x: number, y: number): [number, number] {
  const { nx, ny, dx } = sim.c;
  const h = sim.h;
  const depthAt = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : h[j * nx + i]);
  // u en caras x: posición (i·dx, (j+0.5)·dx)
  const fx = x / dx, fy = y / dx - 0.5;
  const i0 = Math.floor(fx), j0 = Math.floor(fy);
  const ax = fx - i0, ay = fy - j0;
  const uFace = (i: number, j: number) => {
    if (i < 0 || i > nx || j < 0 || j >= ny) return 0;
    const q = sim.qx[j * (nx + 1) + i];
    const hf = Math.max(depthAt(i - 1, j), depthAt(i, j));
    return hf > H_WET ? q / hf : 0;
  };
  const u = (uFace(i0, j0) * (1 - ax) + uFace(i0 + 1, j0) * ax) * (1 - ay) + (uFace(i0, j0 + 1) * (1 - ax) + uFace(i0 + 1, j0 + 1) * ax) * ay;
  const gx = x / dx - 0.5, gy = y / dx;
  const i1 = Math.floor(gx), j1 = Math.floor(gy);
  const bx = gx - i1, by = gy - j1;
  const vFace = (i: number, j: number) => {
    if (i < 0 || i >= nx || j < 0 || j > ny) return 0;
    const q = sim.qy[j * nx + i];
    const hf = Math.max(depthAt(i, j - 1), depthAt(i, j));
    return hf > H_WET ? q / hf : 0;
  };
  const v = (vFace(i1, j1) * (1 - bx) + vFace(i1 + 1, j1) * bx) * (1 - by) + (vFace(i1, j1 + 1) * (1 - bx) + vFace(i1 + 1, j1 + 1) * bx) * by;
  return [u, v];
}

// Utilidades para construir escenarios de forma determinista.

import type { Polygon, TerrainRaster } from '../sim/scenario';

export const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Ráster de terreno a partir de una función analítica z(x, y), muestreada en el centro de celda. */
export function rasterFrom(fn: (x: number, y: number) => number, width: number, height: number, dx: number, datum: string): TerrainRaster {
  const nx = Math.round(width / dx), ny = Math.round(height / dx);
  const values = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[j * nx + i] = fn((i + 0.5) * dx, (j + 0.5) * dx);
  return { kind: 'raster', dx, nx, ny, values, datum };
}

/** Generador pseudoaleatorio determinista (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

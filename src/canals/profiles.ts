// Perfiles del agua para dibujar (escena 3D y esquemas): a partir del cálculo, la cota del fondo, la profundidad y
// la espuma en cada punto, y la línea de energía. Los usan las escenas y los dibujos planos, así los dos muestran
// exactamente lo mismo.

import { CHUTE, CREEK, G, depthAt, type BridgeResult, type JumpResult } from './hydraulics';

export interface Pt {
  x: number;
  bed: number;
  y: number;
  foam: number;
}

/** Tramos de la caída: canal de arriba, rápida, pozo, resalto, vertedero y canal de abajo. */
export const JUMP_UP = 24;
export const JUMP_DOWN = 30;

export function jumpSurface(r: JumpResult): { pts: Pt[]; egl: { x: number; e: number }[]; jump: [number, number, number, number] } {
  const { drop, weir, basin } = r.inp;
  const L = r.chuteLen;
  const q = r.q;
  const pts: Pt[] = [];
  const add = (x: number, bed: number, y: number, foam = 0) => pts.push({ x, bed, y: Math.max(0.02, y), foam });
  for (let k = 0; k <= 12; k++) {
    const f = k / 12;
    add(-L - JUMP_UP + JUMP_UP * f, drop, r.yc * (1.35 - 0.35 * f * f));
  }
  const pool = r.place === 'ahogado' ? r.ytw : -Infinity;
  for (const p of r.chute) {
    const bed = drop - p.x * CHUTE.S;
    const x = -L + p.x;
    if (bed + p.y < pool) add(x, bed, pool - bed, x > -3 ? 0.7 : 0.15);
    else add(x, bed, p.y, Math.min(0.5, p.x / L));
  }
  let jump: [number, number, number, number];
  if (r.place === 'pozo' || r.place === 'barrido') for (const p of r.floor) if (p.x > 0 && p.x <= basin) add(p.x, 0, p.y, 0.3);
  if (r.place !== 'barrido') {
    const yB = r.place === 'ahogado' ? r.ytw : Math.min(r.ytw, r.y2 * 1.5);
    const x0 = r.place === 'ahogado' ? 0 : Math.min(r.xJump, basin);
    const x1 = Math.min(basin - 0.05, x0 + r.Lj);
    for (let k = 1; k <= 24; k++) {
      const f = k / 24;
      const s = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, f * 1.4));
      add(x0 + (x1 - x0) * f, 0, r.yA + (yB - r.yA) * s, 1 - 0.7 * f);
    }
    jump = [x0, x1, r.yA, yB];
    add(basin - 0.02, 0, r.ytw, 0.05);
    add(basin + 0.1, weir, r.Hw * 0.95, 0.05);
    add(basin + 1, weir, (2 / 3) * r.Hw, 0.1);
    add(basin + 1 + JUMP_DOWN, weir, (2 / 3) * r.Hw, 0.05);
  } else {
    // el resalto se forma afuera del pozo (ilustrativo: allí no hay piso que lo aguante)
    const yE = r.floor[r.floor.length - 1]?.y ?? r.y1;
    const yOut = (2 / 3) * r.Hw * 1.6;
    add(basin + 0.2, weir, Math.max(yE * 0.8, 0.05), 0.4);
    add(basin + 3, weir, Math.max(yE, 0.05), 0.5);
    for (let k = 1; k <= 16; k++) add(basin + 3 + (k / 16) * 8, weir, yE + (yOut - yE) * (k / 16), 1 - k / 20);
    add(basin + 1 + JUMP_DOWN, weir, yOut, 0.1);
    jump = [basin + 3, basin + 11, yE, yOut];
  }
  pts.sort((a, b) => a.x - b.x);
  const egl = pts.map((p) => ({ x: p.x, e: p.bed + p.y + (q * q) / (2 * G * p.y * p.y) }));
  return { pts, egl, jump };
}

/** Agua de la quebrada entre x0 y x1 (x = 0 en el puente; negativo, aguas arriba). */
export function bridgeSurface(r: BridgeResult, x0: number, x1: number, fine = 2): Pt[] {
  const xMin = r.profile.reduce((a, p) => Math.min(a, p.x), 0);
  const out: Pt[] = [];
  const step = Math.max(fine, (x1 - x0) / 400);
  for (let x = x0; x <= x1 + 1e-9; x += x < -10 && x > -40 ? Math.min(0.5, step) : step) {
    let y = x <= 0 ? (x >= xMin ? depthAt(r.profile, x) : r.yn) : r.yn;
    if (r.jumpX !== null && x < r.jumpX) y = r.yn;
    const foam = r.jumpX !== null && Math.abs(x - r.jumpX) < 3 ? 0.9 : x > -5 && x < 7 && r.flow !== 'libre' ? 0.6 : 0.05;
    out.push({ x, bed: -r.inp.S * x, y, foam });
  }
  return out;
}

export const CREEK_H = CREEK.H;

// «Seguir el agua»: partículas trazadoras transportadas por la velocidad CALCULADA (no alteran el volumen).
// Integración de punto medio (RK2) en cada paso de la simulación. La captura por sumideros y la
// infiltración son probabilísticas con semilla fija, en proporción a lo que el modelo calculó en ese paso.

import { prng } from '../scenarios/primitives';
import { H_FLOW_MIN } from './constants';
import type { CitySim } from './engine';
import { velocityAtPoint } from './fields';

export type TracerState = 'agua' | 'sumidero' | 'suelo' | 'salida' | 'deposito';

export interface Tracer {
  id: number;
  /** Tanda con la que se soltó (todas las gotas de un mismo toque comparten tanda). */
  group: number;
  x: number;
  y: number;
  state: TracerState;
  /**
   * Recorrido (x, y intercalados) desde donde se soltó: un punto cada 0,35 m recorridos, de modo que
   * el dibujo sigue la trayectoria calculada sin cortar esquinas. Si supera 1400 puntos, se
   * aligera la mitad más antigua.
   */
  trail: number[];
  /** Distancia recorrida [m]. */
  dist: number;
  /** Tiempo de simulación al soltarla y al llegar a su destino [s] (tEnd = null si sigue en movimiento). */
  t0: number;
  tEnd: number | null;
  /** Celda donde terminó (sumidero, suelo o borde de salida); −1 si sigue en movimiento. */
  endCell: number;
}

/** Distancia entre puntos guardados del recorrido [m]. */
export const TRAIL_STEP = 0.35;
const TRAIL_MAX = 1400;

export class TracerSet {
  readonly sim: CitySim;
  tracers: Tracer[] = [];
  private rnd: () => number;
  private nextId = 1;
  private nextGroup = 1;
  /** Puntos donde se soltó cada tanda (para marcarlos en la escena). */
  readonly releases: { group: number; x: number; y: number; t: number; n: number }[] = [];

  constructor(sim: CitySim, seed: number) {
    this.sim = sim;
    this.rnd = prng(seed);
  }

  clear(): void {
    this.tracers = [];
    this.releases.length = 0;
  }

  /** Suelta n trazadores alrededor de (x, y). Si cae en un techo, va a la bajante o al depósito. */
  release(x: number, y: number, n = 20, radius = 1.2): void {
    const { nx, ny, dx } = this.sim.c;
    const group = this.nextGroup++;
    this.releases.push({ group, x, y, t: this.sim.t, n });
    for (let q = 0; q < n; q++) {
      const a = this.rnd() * Math.PI * 2, r = Math.sqrt(this.rnd()) * radius;
      let px = Math.min(nx * dx - 0.01, Math.max(0.01, x + Math.cos(a) * r));
      let py = Math.min(ny * dx - 0.01, Math.max(0.01, y + Math.sin(a) * r));
      let state: TracerState = 'agua';
      const k = Math.floor(py / dx) * nx + Math.floor(px / dx);
      const trail: number[] = [px, py];
      const b = this.sim.c.building[k];
      if (b >= 0) {
        const cb = this.sim.c.buildings[b];
        if (cb.tank >= 0) state = 'deposito';
        else {
          const dk = cb.downCell;
          px = ((dk % nx) + 0.3 + 0.4 * this.rnd()) * dx;
          py = (Math.floor(dk / nx) + 0.3 + 0.4 * this.rnd()) * dx;
          trail.push(px, py);
        }
      }
      this.tracers.push({ id: this.nextId++, group, x: px, y: py, state, trail, dist: 0, t0: this.sim.t, tEnd: state === 'agua' ? null : this.sim.t, endCell: state === 'agua' ? -1 : k });
    }
  }

  /** Distancia y tiempo promedio de viaje de las gotas que llegaron a cada destino. */
  journeys(): Record<TracerState, { n: number; dist: number; time: number }> {
    const r = { agua: { n: 0, dist: 0, time: 0 }, sumidero: { n: 0, dist: 0, time: 0 }, suelo: { n: 0, dist: 0, time: 0 }, salida: { n: 0, dist: 0, time: 0 }, deposito: { n: 0, dist: 0, time: 0 } };
    for (const t of this.tracers) {
      const e = r[t.state];
      e.n++;
      e.dist += t.dist;
      e.time += (t.tEnd ?? this.sim.t) - t.t0;
    }
    for (const k of Object.keys(r) as TracerState[]) if (r[k].n) {
      r[k].dist /= r[k].n;
      r[k].time /= r[k].n;
    }
    return r;
  }

  counts(): Record<TracerState, number> {
    const c: Record<TracerState, number> = { agua: 0, sumidero: 0, suelo: 0, salida: 0, deposito: 0 };
    for (const t of this.tracers) c[t.state]++;
    return c;
  }

  /** Avanza con el campo de velocidades del paso recién calculado. */
  step(dt: number): void {
    const sim = this.sim;
    const { nx, ny, dx, solid, area } = sim.c;
    const W = nx * dx, H = ny * dx;
    const drainCell = new Map<number, number>();
    sim.c.drains.forEach((d, q) => drainCell.set(d.cell, q));
    const tNow = sim.t;
    const end = (t: Tracer, state: TracerState, cell: number) => {
      t.state = state;
      t.tEnd = tNow;
      t.endCell = cell;
      t.trail.push(t.x, t.y);
    };
    const cellAt = (x: number, y: number) => Math.min(ny - 1, Math.max(0, Math.floor(y / dx))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(x / dx)));
    const crosses = (ax: number, ay: number, bx: number, by: number) => {
      for (let q = 1; q < 10; q++) {
        const f = q / 10;
        if (solid[cellAt(ax + (bx - ax) * f, ay + (by - ay) * f)]) return true;
      }
      return false;
    };
    for (const t of this.tracers) {
      if (t.state !== 'agua') continue;
      const [u1, v1] = velocityAtPoint(sim, t.x, t.y);
      const mx = t.x + 0.5 * dt * u1, my = t.y + 0.5 * dt * v1;
      const [u2, v2] = velocityAtPoint(sim, Math.min(W, Math.max(0, mx)), Math.min(H, Math.max(0, my)));
      let nxp = t.x + dt * u2, nyp = t.y + dt * v2;
      if (nxp < 0 || nyp < 0 || nxp >= W || nyp >= H) {
        // Solo sale por un borde con salida definida; si no, se queda en el borde
        const k = Math.min(ny - 1, Math.max(0, Math.floor(t.y / dx))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(t.x / dx)));
        if (sim.c.outlets.some((o) => o.cell === k)) {
          t.x = Math.min(W, Math.max(0, nxp));
          t.y = Math.min(H, Math.max(0, nyp));
          end(t, 'salida', k);
          continue;
        }
        nxp = Math.min(W - 0.01, Math.max(0.01, nxp));
        nyp = Math.min(H - 0.01, Math.max(0.01, nyp));
      }
      const k2 = Math.floor(nyp / dx) * nx + Math.floor(nxp / dx);
      if (solid[k2]) continue; // nunca atraviesa un edificio
      // El dibujo une los puntos guardados con tramos rectos. Si el tramo desde el último punto guardado
      // rozaría un edificio (una esquina), se guarda también la posición anterior, que está libre; y si
      // el propio paso dobla una esquina, un punto intermedio por la celda libre. Así el dibujo nunca
      // corta por dentro de un edificio (prueba V6).
      const L0 = t.trail.length;
      const lx = t.trail[L0 - 2], ly = t.trail[L0 - 1];
      if (!solid[cellAt(lx, ly)] && crosses(lx, ly, nxp, nyp)) {
        const moved = lx !== t.x || ly !== t.y;
        if (moved) t.trail.push(t.x, t.y);
        if (!moved || crosses(t.x, t.y, nxp, nyp)) {
          if (!solid[cellAt(t.x, nyp)]) t.trail.push(t.x, nyp);
          else if (!solid[cellAt(nxp, t.y)]) t.trail.push(nxp, t.y);
        }
      }
      t.dist += Math.hypot(nxp - t.x, nyp - t.y);
      t.x = nxp;
      t.y = nyp;
      const L = t.trail.length;
      if (Math.hypot(t.x - t.trail[L - 2], t.y - t.trail[L - 1]) >= TRAIL_STEP) {
        t.trail.push(t.x, t.y);
        if (t.trail.length > TRAIL_MAX * 2) {
          // aligera la mitad más antigua (conserva el punto de partida)
          const half = Math.floor(t.trail.length / 4) * 2;
          const older: number[] = [];
          for (let q = 0; q < half; q += 2) if (q === 0 || (q / 2) % 2 === 0) older.push(t.trail[q], t.trail[q + 1]);
          t.trail = older.concat(t.trail.slice(half));
        }
      }
      const h = sim.h[k2];
      const d = drainCell.get(k2);
      if (d !== undefined && sim.lastDrain[d] > 0) {
        const p = sim.lastDrain[d] / (sim.lastDrain[d] + h * area);
        if (this.rnd() < p) {
          end(t, 'sumidero', k2);
          continue;
        }
      }
      const f = sim.lastInf[k2];
      if (f > 0) {
        const p = f / (f + Math.max(h, H_FLOW_MIN));
        if (this.rnd() < p) end(t, 'suelo', k2);
      }
    }
  }
}

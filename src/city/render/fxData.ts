// Datos para los efectos de lluvia y agua. Todo sale del estado calculado de la simulación; este
// módulo no usa Three.js para poder probarlo en Node. Ningún valor de profundidad se amplifica aquí:
// la amplificación opcional (×5) solo afecta la altura dibujada de la lámina en la escena.

import { H_WET, mmhToMs } from '../sim/constants';
import type { CitySim } from '../sim/engine';
import type { RainConfig } from '../sim/scenario';

/** Canales del campo por celda: profundidad [m], velocidad este y norte [m/s] y huella mojada [0–1]. */
export const FIELD_CHANNELS = 4;
/** Profundidad máxima alcanzada a partir de la cual la celda se considera «ya mojada» [m]. */
export const WET_TRAIL_DEPTH = 0.003;

/**
 * Llena `out` (nx·ny·4) con el campo que dibuja el agua.
 * - R: profundidad actual (o máxima, en la vista de resultados), tal como la calcula el modelo.
 * - G, B: velocidad en el centro de la celda, la misma que usan las flechas.
 * - A: huella mojada, proporcional a la profundidad máxima alcanzada hasta 3 mm.
 */
export function packField(sim: CitySim, useMax: boolean, out: Float32Array): void {
  const N = sim.c.nx * sim.c.ny;
  const h = sim.h, hm = sim.hmaxField, solid = sim.c.solid;
  for (let k = 0; k < N; k++) {
    const o = k * 4;
    if (solid[k]) {
      out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
      continue;
    }
    const d = useMax ? hm[k] : h[k];
    out[o] = d;
    if (!useMax && h[k] >= H_WET) {
      const [u, v] = sim.velocityAt(k);
      out[o + 1] = u;
      out[o + 2] = v;
    } else {
      out[o + 1] = 0;
      out[o + 2] = 0;
    }
    out[o + 3] = Math.min(1, hm[k] / WET_TRAIL_DEPTH);
  }
}

/** Intensidad de lluvia que se aplica en este instante [mm/h]. */
export function rainNow(sim: CitySim): number {
  return sim.t >= sim.endT ? 0 : sim.rainAt(sim.t);
}

/**
 * Caudal que sale por la bajante de cada edificio [m³/s]: la lluvia sobre su techo (solo las celdas
 * donde llueve) cuando el techo no está conectado a un depósito. Es el mismo reparto del motor.
 */
export function spoutFlows(sim: CitySim, out: Float64Array): void {
  const R = mmhToMs(rainNow(sim));
  const area = sim.c.dx * sim.c.dx;
  sim.c.buildings.forEach((b, i) => {
    out[i] = b.tank >= 0 ? 0 : R * b.rainWeight * area;
  });
}

export interface TankFx {
  /** Fracción de llenado [0–1]. */
  fill: number;
  /** Caudal que entra desde los techos [m³/s]. */
  inflow: number;
  /** Caudal de rebose estimado en este instante [m³/s] (0 si no está lleno). */
  overflow: number;
}

/** Estado de cada depósito: llenado calculado y rebose cuando está lleno. */
export function tankFx(sim: CitySim): TankFx[] {
  const R = mmhToMs(rainNow(sim));
  const area = sim.c.dx * sim.c.dx;
  return sim.c.tanks.map((t) => {
    const vol = sim.tankVol[t.index];
    const inflow = t.buildings.reduce((s, bi) => s + R * sim.c.buildings[bi].rainWeight * area, 0);
    const full = vol >= t.capacity * (1 - 1e-9);
    const out = t.destination === 'red' ? t.release : 0;
    return { fill: t.capacity > 0 ? Math.min(1, vol / t.capacity) : 0, inflow, overflow: full ? Math.max(0, inflow - out) : 0 };
  });
}

/** Caudal captado por cada sumidero en el último paso [m³/s]. */
export function drainFlows(sim: CitySim, out: Float64Array): void {
  for (let d = 0; d < out.length; d++) out[d] = sim.lastDt > 0 ? sim.lastDrain[d] / sim.lastDt : 0;
}

/** Caudal que sale por cada cara de salida [m³/s] (positivo hacia afuera del sector). */
export function outletFlows(sim: CitySim, out: Float64Array): void {
  const { dx } = sim.c;
  sim.c.outlets.forEach((o, i) => {
    const q = o.axis === 'x' ? sim.qx[o.face] : sim.qy[o.face];
    out[i] = Math.max(0, o.dir * q * dx);
  });
}

/** ¿Llueve en el punto (x, y) del modelo? Misma regla que el motor (celda dentro del círculo). */
export function rainsAt(r: RainConfig, x: number, y: number): boolean {
  if (r.spatial === 'uniforme') return true;
  const dx = x - r.center[0], dy = y - r.center[1];
  return dx * dx + dy * dy <= r.radiusM * r.radiusM;
}

/**
 * Intensidad visual de un efecto a partir de un caudal [m³/s]: 0 por debajo de `q0`, 1 desde `q1`,
 * con raíz cuadrada entre ambos para que los caudales pequeños se noten. Solo para el dibujo.
 */
export function flowLevel(q: number, q0: number, q1: number): number {
  if (q <= q0) return 0;
  return Math.min(1, Math.sqrt((q - q0) / (q1 - q0)));
}

// Comparación reproducible A/B: las dos corridas comparten exactamente lluvia, estado inicial, tiempo
// simulado, dominio, bordes, resolución, umbral y semilla. Solo cambian las intervenciones.

import { compile, type Compiled } from './compile';
import { CitySim, type SimOptions } from './engine';
import type { Interventions, Scenario, Shared } from './scenario';

export interface Indicators {
  precipitation: number;
  inflow: number;
  infiltrated: number;
  drained: number;
  devices: number;
  surfaceEnd: number;
  boundaryOut: number;
  residual: number;
  /** Profundidad máxima en cada sonda [m] y momento [s]. */
  probeMax: { id: string; name: string; depth: number; t: number }[];
  /** Caudal pico de salida por bordes [m³/s] y momento [s]. */
  peakOutlet: number;
  peakOutletT: number;
  /** Área máxima con profundidad ≥ umbral [m²]. */
  maxAreaAbove: number;
  threshold: number;
  gardenIn: number;
  gardenOut: number;
  roofToSurface: number;
  roofToTank: number;
  tankOverflow: number;
  /** Red separada: rebose a la calle y salida por los colectores [m³] (lluvias, residuales); llenado máximo y/D de los colectores. */
  sewerOverflow: [number, number];
  sewerOut: [number, number];
  sewerPeakFill: [number, number];
  /** Quebrada: caudal máximo que pasa por fuera del cauce y altura máxima del agua sobre la orilla en la sección [m³/s, m]. */
  creekOutsideMax: number;
  creekOverBankMax: number;
  creekPeakIn: number;
  /** Volumen captado por cada sumidero [m³]. */
  drainTotals: Record<string, number>;
  t: number;
}

export function indicators(sim: CitySim): Indicators {
  const b = sim.bal;
  let peak = 0, peakT = 0;
  for (const s of sim.samples) if (s.outletQ > peak) {
    peak = s.outletQ;
    peakT = s.t;
  }
  let gIn = 0, gOut = 0;
  for (let k = 0; k < sim.gardenIn.length; k++) {
    gIn += sim.gardenIn[k];
    gOut += sim.gardenOut[k];
  }
  return {
    precipitation: b.precipitation,
    inflow: b.inflow,
    infiltrated: b.infiltrated,
    drained: b.drained,
    devices: b.devices,
    surfaceEnd: b.surface,
    boundaryOut: b.boundaryOut,
    residual: b.residual,
    probeMax: sim.c.probes.map((p, q) => ({ id: p.id, name: p.name, depth: sim.probeMax[q].depth, t: sim.probeMax[q].t })),
    peakOutlet: peak,
    peakOutletT: peakT,
    maxAreaAbove: sim.maxAreaAbove,
    threshold: sim.threshold,
    gardenIn: gIn,
    gardenOut: gOut,
    roofToSurface: b.roofToSurface,
    roofToTank: b.roofToTank,
    tankOverflow: b.tankOverflow,
    sewerOverflow: sim.sewer ? [sim.sewer.tot.overflow[0], sim.sewer.tot.overflow[1]] : [0, 0],
    sewerOut: sim.sewer ? [sim.sewer.tot.out[0], sim.sewer.tot.out[1]] : [0, 0],
    sewerPeakFill: sim.sewer ? ([0, 1] as const).map((sys) => Math.max(0, ...sim.sewer!.s.pipes.map((p, k) => (p.system === sys && p.role === 'colector' ? sim.sewer!.peakFill[k] : 0)))) as [number, number] : [0, 0],
    creekOutsideMax: Math.max(0, ...sim.samples.map((q) => q.creek?.qOutside ?? 0)),
    creekOverBankMax: sim.c.creek ? Math.max(-9, ...sim.samples.map((q) => (q.creek ? q.creek.level - sim.c.creek!.bankLevel : -9))) : -9,
    creekPeakIn: Math.max(0, ...sim.samples.map((q) => q.creek?.qin ?? 0)),
    drainTotals: Object.fromEntries(sim.c.drains.map((d, k) => [d.id, sim.drainTotal[k]])),
    t: sim.t,
  };
}

export interface Change {
  abs: number;
  /** Cambio porcentual respecto de A, o null si A es (casi) cero. */
  pct: number | null;
  note: string | null;
}

/** Cambio de B respecto de A, sin dividir por cero. */
export function change(a: number, b: number, eps: number): Change {
  const abs = b - a;
  if (Math.abs(a) < eps) {
    return { abs, pct: null, note: Math.abs(b) < eps ? 'Ambos son prácticamente cero.' : 'A es prácticamente cero: no se calcula el porcentaje, se muestra la diferencia.' };
  }
  return { abs, pct: (abs / a) * 100, note: null };
}

export class ComparePair {
  readonly shared: Shared;
  readonly ca: Compiled;
  readonly cb: Compiled;
  readonly a: CitySim;
  readonly b: CitySim;

  constructor(sc: Scenario, shared: Shared, ivA: Interventions, ivB: Interventions, opts: SimOptions = {}) {
    this.shared = shared;
    this.ca = compile(sc, shared, ivA);
    this.cb = compile(sc, shared, ivB);
    this.a = new CitySim(this.ca, shared, opts);
    this.b = new CitySim(this.cb, shared, opts);
  }

  get t(): number {
    return Math.min(this.a.t, this.b.t);
  }

  get finished(): boolean {
    return this.a.finished && this.b.finished;
  }

  reset(): void {
    this.a.reset();
    this.b.reset();
  }

  /** Avanza ambas corridas al mismo tiempo de simulación (presupuesto repartido). */
  advanceTo(t: number, budgetMs = Infinity): boolean {
    const ra = this.a.advanceTo(t, budgetMs / 2);
    const rb = this.b.advanceTo(Math.min(t, this.a.t), budgetMs / 2);
    return ra && rb && this.b.t >= this.a.t - 1e-9;
  }

  /** Verifica que las condiciones externas sean idénticas (se muestra al docente). */
  sameConditions(): { ok: boolean; items: { label: string; ok: boolean }[] } {
    const a = this.a, b = this.b, ca = this.ca, cb = this.cb;
    const items = [
      { label: 'Misma lluvia (hietograma y distribución espacial)', ok: JSON.stringify(a.hyeto) === JSON.stringify(b.hyeto) && sameArr(ca.rainWeight, cb.rainWeight) },
      { label: 'Mismo tiempo simulado', ok: a.endT === b.endT },
      { label: 'Mismo dominio y resolución', ok: ca.nx === cb.nx && ca.ny === cb.ny && ca.dx === cb.dx },
      { label: 'Mismos bordes y salidas', ok: JSON.stringify(ca.outlets) === JSON.stringify(cb.outlets) },
      { label: 'Misma entrada externa', ok: a.shared.inflowLps === b.shared.inflowLps },
      { label: 'Mismo estado inicial (suelo y agua)', ok: a.shared.soilInitial === b.shared.soilInitial },
      { label: 'Mismo umbral de profundidad', ok: a.threshold === b.threshold },
      { label: 'Misma semilla', ok: a.shared.seed === b.shared.seed },
    ];
    return { ok: items.every((q) => q.ok), items };
  }
}

function sameArr(x: ArrayLike<number>, y: ArrayLike<number>): boolean {
  if (x.length !== y.length) return false;
  for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return false;
  return true;
}

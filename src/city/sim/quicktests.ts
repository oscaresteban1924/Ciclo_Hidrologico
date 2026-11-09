// Pruebas rápidas que el docente puede ejecutar en el navegador (subconjunto de tests/city/sim.test.ts).

import { compile } from './compile';
import { CitySim } from './engine';
import { mmhToMs } from './constants';
import { baseInterventions, type Scenario, type Shared } from './scenario';
import { rasterFrom } from '../scenarios/primitives';
import { builtinScenarios } from '../scenarios/index';

export interface QuickResult {
  name: string;
  tolerance: string;
  measured: string;
  pass: boolean;
}

function mini(ground: (x: number, y: number) => number): Scenario {
  const sc = builtinScenarios()['calle-de-prueba'];
  return {
    ...sc,
    id: 'mini',
    extent: { crs: 'LOCAL', origin: [0, 0], width: 24, height: 16 },
    terrain: rasterFrom(ground, 24, 16, 0.5, 'prueba'),
    defaultCover: 'concreto',
    surfaces: [],
    bowls: [],
    buildings: [],
    drains: [],
    outlets: [],
    inflows: [],
    zones: [],
    gardens: [],
    tanks: [],
    probes: [],
  };
}

const shared = (mmh: number, minutes: number): Shared => ({ scenarioId: 'mini', dx: 1, rain: { intensityMmH: Math.max(5, mmh), durationMin: minutes, pattern: 'constante', spatial: 'uniforme', center: [0, 0], radiusM: 10 }, simMinutes: minutes, soilInitial: 'seco', inflowLps: 0, seed: 1 });

export function runQuickTests(): QuickResult[] {
  const out: QuickResult[] = [];
  {
    const sc = mini((x, y) => 1 + 0.04 * x + 0.2 * Math.sin(y / 3));
    const sh = shared(5, 10);
    const c = compile(sc, sh, baseInterventions(sc));
    const h0 = new Float64Array(c.nx * c.ny).map((_, k) => ((k % c.nx) < 6 ? 0.25 : 0));
    const s = new CitySim(c, sh, { initialDepth: h0 });
    s.hyeto.mmh.fill(0);
    const v0 = s.bal.surface;
    s.runToEnd();
    const rel = Math.abs(s.bal.surface - v0) / v0;
    out.push({ name: 'Dominio cerrado sin lluvia conserva el volumen', tolerance: '|ΔV|/V₀ ≤ 1·10⁻¹⁰', measured: rel.toExponential(2), pass: rel <= 1e-10 });
  }
  {
    const sc = mini((x) => 1 + 0.02 * x);
    const sh = shared(50, 10);
    const s = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
    s.runToEnd();
    const exp = mmhToMs(50) * 24 * 16 * 600;
    const rel = Math.abs(s.bal.surface - exp) / exp;
    out.push({ name: 'Lluvia en dominio cerrado: ΔV = I·A·t', tolerance: 'error relativo ≤ 1·10⁻¹⁰', measured: `${s.bal.surface.toFixed(4)} m³ vs ${exp.toFixed(4)} m³ (${rel.toExponential(1)})`, pass: rel <= 1e-10 });
  }
  {
    const sc = mini((x, y) => 0.5 + 0.4 * Math.sin(x / 2) * Math.cos(y / 3));
    const sh = shared(5, 10);
    const c = compile(sc, sh, baseInterventions(sc));
    const h0 = new Float64Array(c.nx * c.ny).map((_, k) => Math.max(0, 0.7 - c.z[k]));
    const s = new CitySim(c, sh, { initialDepth: h0 });
    s.hyeto.mmh.fill(0);
    s.runToEnd();
    let dh = 0;
    for (let k = 0; k < h0.length; k++) dh = Math.max(dh, Math.abs(s.h[k] - h0[k]));
    out.push({ name: 'Lago en reposo permanece en reposo', tolerance: 'máx |Δh| ≤ 1·10⁻¹² m', measured: dh.toExponential(2), pass: dh <= 1e-12 });
  }
  {
    const sc = builtinScenarios()['calle-de-prueba'];
    const sh: Shared = { ...sc.defaults, dx: 2, simMinutes: 12 };
    const s = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
    s.runToEnd();
    const a = Float64Array.from(s.h), b1 = JSON.stringify(s.bal);
    s.reset();
    let t = 0;
    while (!s.finished) s.advanceTo((t += 7.3));
    let same = JSON.stringify(s.bal) === b1;
    for (let k = 0; k < a.length; k++) if (a[k] !== s.h[k]) same = false;
    out.push({ name: 'Reiniciar reproduce exactamente la corrida', tolerance: 'igualdad bit a bit', measured: same ? 'idéntica' : 'distinta', pass: same });
  }
  return out;
}

// Valida, compila y simula brevemente un escenario externo (p. ej., el generado por el pipeline).
// Uso: npx tsx tests/city/scenario-check.ts ruta/escenario.json

import { readFileSync } from 'node:fs';
import { compile } from '../../src/city/sim/compile';
import { CitySim } from '../../src/city/sim/engine';
import { baseInterventions, validateScenario, type Scenario, type Shared } from '../../src/city/sim/scenario';

const path = process.argv[2];
const sc = JSON.parse(readFileSync(path, 'utf8')) as Scenario;
const v = validateScenario(sc);
if (!v.ok) {
  console.error('Escenario inválido:', v.errors.join(' '));
  process.exit(1);
}
const sh: Shared = { ...sc.defaults, simMinutes: 15, rain: { ...sc.defaults.rain, durationMin: 10 } };
const c = compile(sc, sh, baseInterventions(sc));
const sim = new CitySim(c, sh);
sim.runToEnd();
const chk = sim.check();
const rel = Math.abs(sim.bal.residual) / sim.bal.precipitation;
let solidWater = 0;
for (let k = 0; k < sim.h.length; k++) if (c.solid[k] && sim.h[k] !== 0) solidWater++;
const ok = chk.nonFinite === 0 && chk.negative === 0 && rel < 1e-9 && solidWater === 0;
console.log(`malla ${c.nx}×${c.ny}; edificios ${c.buildings.length} (${c.buildings.reduce((s, b) => s + b.cells, 0)} celdas); P ${sim.bal.precipitation.toFixed(2)} m³; salida ${sim.bal.boundaryOut.toFixed(2)} m³; residuo/P ${rel.toExponential(1)}; NaN ${chk.nonFinite}; agua en edificios ${solidWater}`);
console.log(ok ? 'OK: escenario válido, compilado y simulado' : 'FALLA');
process.exit(ok ? 0 : 1);

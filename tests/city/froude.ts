import { builtinScenarios } from '../../src/city/scenarios/index';
import { compile } from '../../src/city/sim/compile';
import { CitySim } from '../../src/city/sim/engine';
import { baseInterventions } from '../../src/city/sim/scenario';
const sc = builtinScenarios()[process.argv[2] ?? 'calle-de-prueba'];
for (const fr of (process.argv[3] ?? "1,1.5,3,1e9").split(",").map(Number)) for (const th of [0.9]) {
  const sh = sc.defaults;
  const c = compile(sc, sh, baseInterventions(sc));
  const sim = new CitySim(c, sh, { numerics: { froudeMax: fr, theta: th } });
  const t0 = performance.now();
  sim.runToEnd();
  const b = sim.bal;
  const peak = Math.max(...sim.samples.map((s) => s.outletQ));
  let osc = 0; // cambios de signo de dh en la serie de la esquina
  const ser = sim.samples.map((s) => s.probes[0]);
  for (let k = 2; k < ser.length; k++) if ((ser[k] - ser[k - 1]) * (ser[k - 1] - ser[k - 2]) < 0) osc++;
  console.log(`Fr≤${fr} θ=${th}`, 'ms', (performance.now() - t0).toFixed(0), 'steps', sim.diag.steps, 'lim%', (100 * sim.diag.froudeLimited / sim.diag.faceUpdates).toFixed(1), 'B', b.boundaryOut.toFixed(2), 'D', b.drained.toFixed(2), 'peakQ L/s', (peak * 1000).toFixed(1), 'esq cm', (sim.probeMax[0].depth * 100).toFixed(2), 'hmax cm', (Math.max(...sim.hmaxField) * 100).toFixed(1), 'osc', osc, 'res', b.residual.toExponential(1), JSON.stringify(sim.check()));
}

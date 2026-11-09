// Costo del cálculo (Node, CPU de este equipo): ms por segundo simulado, por escenario y resolución.
import { builtinScenarios } from '../../src/city/scenarios/index';
import { compile } from '../../src/city/sim/compile';
import { CitySim } from '../../src/city/sim/engine';
import { baseInterventions } from '../../src/city/sim/scenario';
for (const sc of Object.values(builtinScenarios())) for (const dx of sc.resolutions) {
  const sh = { ...sc.defaults, dx, rain: { ...sc.defaults.rain, intensityMmH: 100 } };
  const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
  sim.advanceTo(60);
  const t0 = performance.now();
  sim.runToEnd();
  const ms = performance.now() - t0;
  const simS = sim.endT - 60;
  console.log(`${sc.id} dx=${dx} m: ${sim.c.nx}×${sim.c.ny} celdas, ${sim.diag.steps} pasos, ${(ms / simS).toFixed(3)} ms por s simulado, ${((ms / simS) * 30).toFixed(1)} ms por s real a ×30, ${((ms / simS) * 60).toFixed(1)} a ×60`);
}

// Creciente al 200 % de la capacidad de la sección de control (la condición más exigente)
{
  const sc = builtinScenarios()['ladera-quebrada'];
  for (const dx of sc.resolutions) {
    const cap = compile(sc, { ...sc.defaults, dx }, baseInterventions(sc)).creek!.capacity;
    const sh = { ...sc.defaults, dx, creek: { peakM3s: Math.round(2 * cap), timeToPeakMin: 6, startMin: 2 } };
    const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
    const t0 = performance.now();
    sim.runToEnd();
    const ms = performance.now() - t0;
    console.log(`ladera-quebrada con creciente de ${Math.round(2 * cap)} m³/s dx=${dx} m: ${sim.diag.steps} pasos, ${(ms / sim.endT).toFixed(3)} ms por s simulado, ${((ms / sim.endT) * 30).toFixed(1)} ms por s real a ×30`);
  }
}

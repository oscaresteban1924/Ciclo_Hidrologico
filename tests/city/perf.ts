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

// Crecientes: al 200 % de la capacidad y la avenida torrencial (350 % con 30 % de lodo, la más exigente)
{
  const sc = builtinScenarios()['ladera-quebrada'];
  for (const [f, tp, cv] of [[2, 6, 0], [3.5, 3, 0.3]] as const) for (const dx of sc.resolutions) {
    const cap = compile(sc, { ...sc.defaults, dx }, baseInterventions(sc)).creek!.capacity;
    const sh = { ...sc.defaults, dx, creek: { peakM3s: Math.round(f * cap), timeToPeakMin: tp, startMin: 2, sedimentCv: cv } };
    const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
    const t0 = performance.now();
    sim.runToEnd();
    const ms = performance.now() - t0;
    console.log(`ladera-quebrada con creciente de ${Math.round(f * cap)} m³/s${cv ? ` y ${cv * 100} % de lodo` : ''} dx=${dx} m: ${sim.diag.steps} pasos, ${(ms / sim.endT).toFixed(3)} ms por s simulado, ${((ms / sim.endT) * 30).toFixed(1)} ms por s real a ×30`);
  }
}

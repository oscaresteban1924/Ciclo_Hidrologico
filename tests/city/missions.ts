// Ejecuta cada misión como lo hace la aplicación y muestra el resultado calculado (sin resultados predeterminados).
import { MISSIONS, budgetItems } from '../../src/city/content/missions';
import { ComparePair, indicators } from '../../src/city/sim/compare';
import { compile } from '../../src/city/sim/compile';
import { CitySim } from '../../src/city/sim/engine';
import { baseInterventions, cloneInterventions, type Shared } from '../../src/city/sim/scenario';
import { builtinScenarios } from '../../src/city/scenarios/index';

for (const m of MISSIONS) {
  const sc = builtinScenarios()[m.scenarioId];
  const A = baseInterventions(sc);
  m.setupA?.(A);
  const B = cloneInterventions(A);
  if (m.change.kind === 'auto') m.change.apply(B);
  if (m.change.kind === 'presupuesto') {
    // una elección de ejemplo dentro del presupuesto: limpiar los dos sumideros y un jardín (50 puntos)
    const sel = ['sum:sum-esquina', 'sum:sum-carrera-s', 'jar:jardin-calle'];
    const used = budgetItems(sc).filter((i) => sel.includes(i.id)).reduce((s, i) => s + i.cost, 0);
    console.log(`  presupuesto de ejemplo: ${used} puntos`);
    B.drains['sum-esquina'] = 0; B.drains['sum-carrera-s'] = 0; B.gardens['jardin-calle'] = true;
  }
  const cap = m.creek && sc.creek ? compile(sc, sc.defaults, A).creek?.capacity ?? 0 : 0;
  const creek = m.creek && cap > 0 ? { peakM3s: Math.round(m.creek.fraction * cap), timeToPeakMin: m.creek.timeToPeakMin, startMin: m.creek.startMin, sedimentCv: m.creek.sedimentCv ?? 0 } : null;
  const sh: Shared = { ...sc.defaults, rain: { ...sc.defaults.rain, ...m.rain }, simMinutes: m.simMinutes, creek };
  let r;
  if (m.change.kind === 'ninguno') {
    const s = new CitySim(compile(sc, sh, B), sh);
    s.runToEnd();
    r = m.evaluate(indicators(s), null, sc);
  } else {
    const p = new ComparePair(sc, sh, A, B);
    while (!p.finished) p.advanceTo(p.t + 120);
    r = m.evaluate(indicators(p.a), indicators(p.b), sc);
  }
  console.log(`${m.title} → opción que coincide con lo calculado: ${r.outcome}`);
  for (const o of r.observed) console.log('   ·', o);
}

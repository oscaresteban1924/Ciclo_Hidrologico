// Pruebas del módulo «Calidad del agua» (se ejecutan con: npm run test:quality). Cada prueba declara su
// tolerancia antes de ejecutarse; el informe se escribe en docs/calidad/PRUEBAS_CALIDAD.md.

import { writeFileSync, mkdirSync } from 'node:fs';
import {
  BMWP_CLASSES,
  DEFAULT_CREEK,
  FAMILIES,
  IRCA_SCORES,
  RAW_WATER,
  bmwp,
  boDecay,
  buildup,
  canSwim,
  creekModel,
  doSat,
  hydraulics,
  optimumDose,
  pressureRatio,
  reaeration,
  settledTurbidity,
  stoneSample,
  treatPlant,
  washoff,
  type CreekInput,
} from '../../src/quality/model';

interface Result { id: string; name: string; tolerance: string; measured: string; pass: boolean }
const results: Result[] = [];
const record = (r: Result) => results.push(r);
const f = (v: number, d = 2) => v.toFixed(d);

// Q1) Oxígeno de saturación (APHA 4500-O) y corrección por altitud
{
  const s20 = doSat(20), s25 = doSat(25), s10 = doSat(10);
  const pr = pressureRatio(1495);
  const sMed = doSat(20, 1495);
  record({
    id: 'Q1',
    name: 'Oxígeno disuelto de saturación y altitud de Medellín',
    tolerance: 'a nivel del mar, 9,09 mg/L a 20 °C, 8,26 a 25 °C y 11,29 a 10 °C (tabla de Standard Methods, error < 0,02 mg/L); a 1 495 m la presión es 0,835 de la del mar (error < 0,002) y la saturación baja en la misma proporción',
    measured: `20 °C: ${f(s20, 3)}; 25 °C: ${f(s25, 3)}; 10 °C: ${f(s10, 3)} mg/L; presión a 1 495 m: ${f(pr, 4)}; saturación a 20 °C en Medellín: ${f(sMed, 3)} mg/L`,
    pass: Math.abs(s20 - 9.09) < 0.02 && Math.abs(s25 - 8.26) < 0.02 && Math.abs(s10 - 11.29) < 0.02 && Math.abs(pr - 0.835) < 0.002 && Math.abs(sMed / s20 - pr) < 1e-12,
  });
}

// Q2) Hidráulica y coeficientes: Manning, Tsivoglou y descomposición de la DBO
{
  const { H, U, S } = hydraulics(0.15, 'montana');
  const q = 0.15 / 4;
  const Hhand = Math.pow((q * 0.05) / Math.sqrt(0.04), 0.6);
  const ka = reaeration(0.15, S, U);
  const kd = boDecay(H);
  record({
    id: 'Q2',
    name: 'Profundidad por Manning, reaireación de Tsivoglou y descomposición de la DBO',
    tolerance: 'con 0,15 m³/s en 4 m de ancho, pendiente 4 % y n = 0,05 la profundidad es la del cálculo a mano (error < 10⁻¹²) y U·H·ancho = Q; ka = 31 183·S·U; kd = 0,3·(H/2,4)^−0,434',
    measured: `H ${f(H, 4)} m (a mano ${f(Hhand, 4)}), U ${f(U, 3)} m/s, caudal reconstruido ${f(U * H * 4, 6)} m³/s; ka ${f(ka, 1)} 1/día; kd ${f(kd, 3)} 1/día`,
    pass: Math.abs(H - Hhand) < 1e-12 && Math.abs(U * H * 4 - 0.15) < 1e-12 && Math.abs(ka - 31183 * 0.04 * U) < 1e-9 && Math.abs(kd - 0.3 * Math.pow(H / 2.4, -0.434)) < 1e-12,
  });
}

// Q3) Mezcla en el vertimiento: balance de masa
{
  const m = creekModel({ ...DEFAULT_CREEK, houses: 300 });
  const Qr = m.Qr, Qw = m.Qw;
  const hand = (Qr * m.up.coliforms + Qw * 1e7) / (Qr + Qw);
  const r0 = m.at(0);
  const handC = (Qr * m.up.conductivity + Qw * 900) / (Qr + Qw);
  record({
    id: 'Q3',
    name: 'Mezcla completa en el punto del vertimiento',
    tolerance: 'con 300 casas (1 200 personas, 102 L/persona·día) el caudal vertido es 1,417 L/s; coliformes y conductividad justo después del vertimiento iguales al balance de masa a mano (error < 10⁻⁹)',
    measured: `vertimiento ${f(Qw * 1000, 3)} L/s; quebrada ${f(Qr * 1000, 0)} L/s; coliformes ${Math.round(r0.coliforms)} (a mano ${Math.round(hand)}); conductividad ${f(r0.conductivity, 2)} µS/cm (a mano ${f(handC, 2)})`,
    pass: Math.abs(Qw * 1000 - 1.4167) < 1e-3 && Math.abs(r0.coliforms - hand) / hand < 1e-9 && Math.abs(r0.conductivity - handC) < 1e-9,
  });
}

// Q4) Streeter y Phelps: solución analítica frente a integración numérica
{
  const inp: CreekInput = { ...DEFAULT_CREEK, houses: 600, season: 'verano', slope: 'plana' };
  const m = creekModel(inp);
  const satMix = doSat(m.mix.T, 1495);
  const sodV = (4 * Math.pow(1.065, m.mix.T - 20)) / m.H;
  // integración explícita fina de dL/dt = −kd L; dD/dt = kd L + SOD/H (en el tramo con lodo) − ka D
  let L = m.mix.dbo, D = satMix - m.mix.dissolvedO2, t = 0, worst = 0;
  const dt = 1e-6;
  const tEnd = 2000 / m.U / 86400;
  for (let k = 0; t < tEnd; k++) {
    const x = t * m.U * 86400;
    const s = x <= 800 ? sodV : 0;
    const dL = -m.kd * L, dD = m.kd * L + s - m.ka * D;
    L += dL * dt;
    D += dD * dt;
    t += dt;
    if (k % 2000 === 0) {
      const r = m.at(t * m.U * 86400);
      worst = Math.max(worst, Math.abs(satMix - D - r.dissolvedO2));
    }
  }
  const r2 = m.at(2000);
  // el oxígeno mínimo aparece aguas abajo del vertimiento y luego se recupera
  let xm = 0, dm = Infinity;
  for (let x = 0; x <= 3000; x += 5) {
    const r = m.at(x);
    if (r.dissolvedO2 < dm) {
      dm = r.dissolvedO2;
      xm = x;
    }
  }
  record({
    id: 'Q4',
    name: 'Curva de oxígeno de Streeter y Phelps con demanda del lodo',
    tolerance: 'la solución analítica coincide con la integración numérica fina de las ecuaciones (diferencia < 0,01 mg/L en 2 km); con 600 casas sin tratamiento, verano y cauce plano, el mínimo de oxígeno está aguas abajo del vertimiento y a 3 km el oxígeno es mayor que en el mínimo',
    measured: `diferencia máxima ${worst.toExponential(1)} mg/L; mezcla ${f(m.mix.dissolvedO2)} mg/L; mínimo ${f(dm)} mg/L a ${xm} m; a 2 km ${f(r2.dissolvedO2)} mg/L; a 3 km ${f(m.at(3000).dissolvedO2)} mg/L (ka ${f(m.ka, 1)}, kd ${f(m.kd, 2)} 1/día)`,
    pass: worst < 0.01 && xm > 0 && m.at(3000).dissolvedO2 > dm,
  });
}

// Q5) Comportamiento: más casas sin tratar empeoran; conectarlas al alcantarillado devuelve el agua de arriba
{
  const base = creekModel({ ...DEFAULT_CREEK, houses: 300 });
  const more = creekModel({ ...DEFAULT_CREEK, houses: 900 });
  const sew = creekModel({ ...DEFAULT_CREEK, houses: 900, treatment: 'alcantarillado' });
  const ptar = creekModel({ ...DEFAULT_CREEK, houses: 900, treatment: 'ptar' });
  const dry = creekModel({ ...DEFAULT_CREEK, houses: 300, season: 'verano' });
  const a = base.at(100), b = more.at(100), c = sew.at(100), d = ptar.at(100), e = dry.at(100);
  const up = base.at(-50);
  const ok = b.coliforms > a.coliforms && b.dbo > a.dbo && b.dissolvedO2 < a.dissolvedO2 && Math.abs(c.coliforms - sew.up.coliforms * Math.exp(-sew.kb * c.travelH / 24)) < 1e-6 && d.coliforms < b.coliforms / 50 && e.coliforms > a.coliforms && !canSwim(a).ok && canSwim(up).ok;
  record({
    id: 'Q5',
    name: 'Respuesta del modelo a las decisiones del barrio',
    tolerance: '100 m aguas abajo: con 900 casas hay más coliformes y DBO y menos oxígeno que con 300; conectadas al alcantarillado, el agua es la de arriba (solo cambia por la muerte natural de los microbios); con planta secundaria los coliformes bajan más de 50 veces; en verano (menos caudal) hay más coliformes; aguas arriba se puede nadar y abajo del vertimiento no',
    measured: `coliformes 300/900 casas: ${Math.round(a.coliforms)} / ${Math.round(b.coliforms)}; DBO ${f(a.dbo)} / ${f(b.dbo)} mg/L; oxígeno ${f(a.dissolvedO2)} / ${f(b.dissolvedO2)} mg/L; alcantarillado ${Math.round(c.coliforms)}; planta ${Math.round(d.coliforms)}; verano ${Math.round(e.coliforms)}; arriba ${Math.round(up.coliforms)} NMP/100 mL`,
    pass: ok,
  });
}

// Q6) BMWP/Col: puntajes, clases y regla de presencia
{
  const clean = creekModel(DEFAULT_CREEK).at(-100);
  const s1 = stoneSample(clean);
  const b1 = bmwp(s1);
  const dirtyM = creekModel({ ...DEFAULT_CREEK, houses: 900, season: 'verano', slope: 'plana' });
  const s2 = stoneSample(dirtyM.at(100));
  const b2 = bmwp(s2);
  const scores: Record<string, number> = { perlidae: 10, psephenidae: 10, leptophlebiidae: 9, philopotamidae: 9, leptoceridae: 8, simuliidae: 8, veliidae: 8, baetidae: 7, hydropsychidae: 7, planariidae: 7, elmidae: 6, corydalidae: 6, libellulidae: 6, physidae: 3, glossiphoniidae: 3, chironomidae: 2, culicidae: 2, tubificidae: 1 };
  const tableOk = FAMILIES.every((x) => scores[x.id] === x.score) && FAMILIES.length === Object.keys(scores).length;
  const classOk = bmwp([{ score: 101 }]).cls.cls === 'I' && bmwp([{ score: 100 }]).cls.cls === 'II' && bmwp([{ score: 60 }]).cls.cls === 'III' && bmwp([{ score: 35 }]).cls.cls === 'IV' && bmwp([{ score: 15 }]).cls.cls === 'V' && BMWP_CLASSES.length === 5;
  record({
    id: 'Q6',
    name: 'Bioindicadores: puntajes BMWP/Col, clases y presencia',
    tolerance: 'los 18 puntajes son los de la tabla de Roldán (2003) reproducida por Roldán-Pérez (2016); las clases cortan en 101, 61, 36 y 16; la quebrada limpia de arriba da clase I (más de 100) y la quebrada con 900 casas sin tratar en verano y cauce plano da clase III o peor, con más gusanos de lodo y larvas rojas que arriba',
    measured: `arriba: ${s1.length} familias, BMWP/Col ${b1.total} (clase ${b1.cls.cls}, ${b1.cls.name}); abajo: ${s2.length} familias (${s2.map((x) => x.family).join(', ')}), BMWP/Col ${b2.total} (clase ${b2.cls.cls})`,
    pass: tableOk && classOk && b1.cls.cls === 'I' && ['III', 'IV', 'V'].includes(b2.cls.cls),
  });
}

// Q7) Potabilización: prueba de jarras, filtros, cloro y Resolución 2115
{
  const lluvia = RAW_WATER.lluvia.turbidity;
  const opt = optimumDose(lluvia);
  const atOpt = settledTurbidity(lluvia, opt), low = settledTurbidity(lluvia, opt / 3), high = settledTurbidity(lluvia, opt * 3);
  const good = treatPlant({ raw: 'lluvia', dose: opt, chlorine: 1.5 });
  const noCoag = treatPlant({ raw: 'lluvia', dose: 0, chlorine: 1.5 });
  const noCl = treatPlant({ raw: 'lluvia', dose: opt, chlorine: 0 });
  const tooMuch = treatPlant({ raw: 'lluvia', dose: opt, chlorine: 4 });
  const allBasic = Object.values(IRCA_SCORES).reduce((a, b) => a + b, 0);
  const iOk = Math.abs(noCl.irca - ((IRCA_SCORES.cloro + IRCA_SCORES.coliformes + IRCA_SCORES.ecoli) / allBasic) * 100) < 1e-9;
  record({
    id: 'Q7',
    name: 'Planta de potabilización e índice IRCA',
    tolerance: 'la prueba de jarras tiene forma de U: con la dosis óptima el agua sedimentada es más clara que con un tercio o con el triple; con dosis óptima y 1,5 mg/L de cloro el agua cumple las cinco características (IRCA 0, sin riesgo); sin coagulante los filtros se tapan y no cumple la turbiedad; sin cloro fallan cloro, coliformes y E. coli y el IRCA es la suma de sus puntajes (15 + 15 + 25) sobre 71,5; con 4 mg/L el cloro pasa de 2,0 mg/L',
    measured: `dosis óptima ${f(opt, 1)} mg/L; sedimentada ${f(atOpt)} / ${f(low)} / ${f(high)} UNT (óptima, un tercio, triple); con todo bien: IRCA ${f(good.irca, 1)} (${good.risk}), turbiedad ${f(good.filtered)} UNT, cloro ${f(good.clExit)}–${f(good.clTap)} mg/L; sin coagulante: ${f(noCoag.filtered, 1)} UNT, filtros tapados ${noCoag.clogged ? 'sí' : 'no'}; sin cloro: IRCA ${f(noCl.irca, 1)} (${noCl.risk}); exceso: ${f(tooMuch.clExit)} mg/L`,
    pass: atOpt < low && atOpt < high && good.irca === 0 && good.checks.every((c) => c.ok) && noCoag.clogged && !noCoag.checks.find((c) => c.id === 'turbiedad')!.ok && iOk && tooMuch.clExit > 2 && !tooMuch.checks.find((c) => c.id === 'cloro')!.ok,
  });
}

// Q8) La calle: acumulación, lavado de Sartor y Boyd y primer lavado
{
  const w = washoff({ dryDays: 7, sweeping: false, litter: 'mucha', rainMmH: 30, durationMin: 30, wrongHouses: 3 });
  const B = buildup(7, false) * 1200;
  const hand = B * (1 - Math.exp(-0.18 * 15)) / 1000;
  const swept = washoff({ dryDays: 7, sweeping: true, litter: 'mucha', rainMmH: 30, durationMin: 30, wrongHouses: 0 });
  const decreasing = w.conc.every((c, i) => i === 0 || c <= w.conc[i - 1] + 1e-12);
  record({
    id: 'Q8',
    name: 'Lavado de la calle y primer lavado',
    tolerance: 'con 7 días secos y 15 mm de lluvia, la masa arrastrada es B·(1 − e^(−0,18·15)) (error < 10⁻⁹ kg); la concentración baja minuto a minuto (primer lavado) y los primeros 10 mm llevan más de 80 %; el barrido reduce la mugre a la mitad; 3 casas con conexión errada vierten 1,224 m³ de agua residual al día',
    measured: `arrastrado ${f(w.totalKg, 3)} kg (a mano ${f(hand, 3)}); primeros 10 mm: ${f(w.firstFlushPct, 1)} %; concentración del minuto 1 al 30: ${Math.round(w.conc[0])} → ${Math.round(w.conc[w.conc.length - 1])} mg/L; con barrido ${f(swept.totalKg, 3)} kg; conexiones erradas ${f(w.sewageM3, 3)} m³/día`,
    pass: Math.abs(w.totalKg - hand) < 1e-9 && decreasing && w.firstFlushPct > 80 && Math.abs(swept.totalKg / w.totalKg - 0.5) < 1e-9 && Math.abs(w.sewageM3 - 1.224) < 1e-9,
  });
}

const ok = results.filter((r) => r.pass).length;
for (const r of results) {
  console.log(`${r.pass ? 'PASA ' : 'FALLA'}  [${r.id}] ${r.name}`);
  console.log(`        tolerancia: ${r.tolerance}`);
  console.log(`        medido:     ${r.measured}`);
}
console.log(`\n${ok}/${results.length} cumplen.`);
mkdirSync('docs/calidad', { recursive: true });
writeFileSync(
  'docs/calidad/PRUEBAS_CALIDAD.md',
  `# Pruebas del módulo «Calidad del agua»\n\nSe ejecutan con \`npm run test:quality\`. Cada prueba declara su tolerancia antes de ejecutarse.\n\n**${ok} de ${results.length} cumplen.**\n\n` +
    results.map((r) => `## ${r.id}. ${r.name} — ${r.pass ? 'cumple' : 'NO cumple'}\n\n- Tolerancia: ${r.tolerance}\n- Medido: ${r.measured}\n`).join('\n'),
);
if (ok !== results.length) process.exit(1);

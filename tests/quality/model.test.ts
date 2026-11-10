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
  NH3_PER_N,
  NITRIF,
  CREEK_LIMITS,
  PLANT_LIMITS,
  STREET,
  STREET_LIMITS,
  TREATMENTS,
  nh3Fraction,
  sanitizeCreek,
  sanitizePlant,
  sanitizeStreet,
  type CreekInput,
  type PlantInput,
  type StreetInput,
  PLUME,
  plumeFactor,
  plumeMixing,
} from '../../src/quality/model';
import { MONITOREO_META, SITIOS, cuencas, impliedTemp, resumen } from '../../src/quality/realdata';
import { FISH, STATIONS, fishOk, uOf, xOf } from '../../src/quality/three/creekWorld';
import { rodsFor } from '../../src/quality/three/kit';
import { PROCESSES, processComplete } from '../../src/quality/processes';
import { UNIT_X, bugsFor, partsFor } from '../../src/quality/three/plantWorld';
import { wrongSet } from '../../src/quality/three/streetWorld';

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
  // integración explícita fina de dL/dt = −kd L; dN/dt = −kn N; dD/dt = kd L + 4,57 kn N + SOD/H (en el tramo
  // con lodo) − ka D
  let L = m.mix.dbo, N = m.mix.ammoniaN, D = satMix - m.mix.dissolvedO2, t = 0, worst = 0, worstN = 0;
  const dt = 1e-6;
  const tEnd = 2000 / m.U / 86400;
  for (let k = 0; t < tEnd; k++) {
    const x = t * m.U * 86400;
    const s = x <= 800 ? sodV : 0;
    const dL = -m.kd * L, dN = -m.kn * N, dD = m.kd * L + 4.57 * m.kn * N + s - m.ka * D;
    L += dL * dt;
    N += dN * dt;
    D += dD * dt;
    t += dt;
    if (k % 2000 === 0) {
      const r = m.at(t * m.U * 86400);
      worst = Math.max(worst, Math.abs(satMix - D - r.dissolvedO2));
      worstN = Math.max(worstN, Math.abs(N - r.ammoniaN));
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
    name: 'Curva de oxígeno de Streeter y Phelps con demanda del lodo y nitrificación',
    tolerance: 'la solución analítica coincide con la integración numérica fina de las ecuaciones de DBO, amonio y oxígeno (diferencia < 0,01 mg/L en 2 km, en el oxígeno y en el amonio); con 600 casas sin tratamiento, verano y cauce plano, el mínimo de oxígeno está aguas abajo del vertimiento y a 3 km el oxígeno es mayor que en el mínimo',
    measured: `diferencia máxima ${worst.toExponential(1)} mg/L de oxígeno y ${worstN.toExponential(1)} mg/L de amonio; amonio en la mezcla ${f(m.mix.ammoniaN)} mg/L de N (kn ${f(m.kn, 2)} 1/día); mezcla ${f(m.mix.dissolvedO2)} mg/L; mínimo ${f(dm)} mg/L a ${xm} m; a 2 km ${f(r2.dissolvedO2)} mg/L; a 3 km ${f(m.at(3000).dissolvedO2)} mg/L (ka ${f(m.ka, 1)}, kd ${f(m.kd, 2)} 1/día)`,
    pass: worst < 0.01 && worstN < 0.01 && xm > 0 && m.at(3000).dissolvedO2 > dm,
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

// Q9) Peces en la escena 3D: la regla y el reto «Que vuelvan los peces» tienen solución
{
  const at = (t: CreekInput['treatment'], season: CreekInput['season']) => STATIONS.map((s) => creekModel({ ...DEFAULT_CREEK, houses: 600, treatment: t, season }).at(s.x));
  const edges = fishOk({ dissolvedO2: FISH.minDO, dbo: FISH.maxDBO }) && !fishOk({ dissolvedO2: FISH.minDO - 0.01, dbo: 1 }) && !fishOk({ dissolvedO2: 9, dbo: FISH.maxDBO + 0.01 });
  const raw = at('ninguno', 'verano'), sep = at('septico', 'verano'), ptar = at('ptar', 'verano'), sew = at('alcantarillado', 'verano');
  const cnt = (rs: ReturnType<typeof at>) => rs.filter(fishOk).length;
  record({
    id: 'Q9',
    name: 'Peces de la escena: oxígeno de al menos 5 mg/L y DBO5 de 6 mg/L o menos',
    tolerance: 'la regla acepta exactamente los bordes (5 mg/L y 6 mg/L) y rechaza lo que pasa de ellos; en verano con 600 casas: sin tratar y con tanque séptico no hay peces junto al tubo (B); con planta pequeña o alcantarillado hay peces en las cuatro estaciones; arriba del tubo (A) siempre hay',
    measured: `bordes ${edges ? 'correctos' : 'INCORRECTOS'}; estaciones con peces (de 4): directo ${cnt(raw)}, séptico ${cnt(sep)}, planta ${cnt(ptar)}, alcantarillado ${cnt(sew)}; DBO5 en B: ${raw.map((r) => f(r.dbo, 1))[1]} / ${f(sep[1].dbo, 1)} / ${f(ptar[1].dbo, 1)} / ${f(sew[1].dbo, 1)} mg/L`,
    pass: edges && !fishOk(raw[1]) && !fishOk(sep[1]) && cnt(ptar) === 4 && cnt(sew) === 4 && [raw, sep, ptar, sew].every((rs) => fishOk(rs[0])),
  });
}

// Q10) Dibujo de la quebrada: la distancia comprimida se invierte sin error y conserva el orden
{
  const xs = [-400, -150, -1, 0, 1, 30, 350, 600, 2500, 3000];
  const err = Math.max(...xs.map((x) => Math.abs(xOf(uOf(x)) - x)));
  const mono = xs.every((x, i) => i === 0 || uOf(x) > uOf(xs[i - 1]));
  record({
    id: 'Q10',
    name: 'Escala del dibujo de la quebrada (comprimida aguas abajo)',
    tolerance: 'ida y vuelta entre metros y dibujo con error < 10⁻⁹ m en −400 a 3 000 m, y el orden de los puntos se conserva (las estaciones y la sonda caen donde corresponde)',
    measured: `error máximo ${err.toExponential(1)} m; orden ${mono ? 'conservado' : 'ALTERADO'}; 600 m → ${f(uOf(600), 1)}, 2 500 m → ${f(uOf(2500), 1)} unidades`,
    pass: err < 1e-9 && mono,
  });
}

// Q11) Conexiones erradas del juego del colorante
{
  const sets = [...Array(21).keys()].map((k) => wrongSet(k));
  const sizes = sets.every((s, k) => s.size === k);
  const nested = sets.every((s, k) => k === 0 || [...sets[k - 1]].every((i) => s.has(i)));
  const same = [...wrongSet(5)].join() === [...wrongSet(5)].join();
  record({
    id: 'Q11',
    name: 'Casas mal conectadas del juego del colorante',
    tolerance: 'con k casas pedidas hay exactamente k (de 0 a 20), siempre las mismas en cada visita, y al subir k se agregan casas sin cambiar las anteriores',
    measured: `tamaños ${sizes ? 'correctos' : 'INCORRECTOS'}; anidadas ${nested ? 'sí' : 'NO'}; deterministas ${same ? 'sí' : 'NO'}; con 3: casas ${[...wrongSet(3)].map((i) => i + 1).join(', ')}`,
    pass: sizes && nested && same,
  });
}

// Q12) Partículas y bacterias dibujadas siguen el cálculo
{
  const grid = [0, 0.4, 1, 3, 10, 30, 100, 300, 1e3, 1e4, 1e5, 1e6];
  const nd = (fn: (v: number) => number) => grid.every((v, i) => i === 0 || fn(v) >= fn(grid[i - 1]));
  const best = treatPlant({ raw: 'lluvia', dose: optimumDose(RAW_WATER.lluvia.turbidity), chlorine: 1.3 });
  const none = treatPlant({ raw: 'lluvia', dose: optimumDose(RAW_WATER.lluvia.turbidity), chlorine: 0 });
  record({
    id: 'Q12',
    name: 'Partículas, bacterias y bastoncitos del dibujo',
    tolerance: 'el número dibujado nunca baja cuando sube la turbiedad o el conteo; sin bacterias no se dibuja ninguna; con la dosis justa y 1,3 mg/L de cloro el vaso de la llave queda sin bacterias y con 0 mg/L sí tiene',
    measured: `partículas ${nd(partsFor) ? 'no decrecientes' : 'DECRECEN'}; bacterias ${nd(bugsFor) ? 'no decrecientes' : 'DECRECEN'}; bastoncitos ${nd(rodsFor) ? 'no decrecientes' : 'DECRECEN'}; vaso con cloro justo: ${bugsFor(best.coliTotalTap)} (IRCA ${f(best.irca, 0)} %); sin cloro: ${bugsFor(none.coliTotalTap)}`,
    pass: nd(partsFor) && nd(bugsFor) && nd(rodsFor) && bugsFor(0) === 0 && rodsFor(0) === 0 && bugsFor(best.coliTotalTap) === 0 && best.irca < 0.5 && bugsFor(none.coliTotalTap) > 0,
  });
}

// Q13) Los once procesos de la planta: completos, en orden, dibujados y con valores del modelo
{
  const ids = PROCESSES.map((p) => p.id);
  const order = PROCESSES.every((p, i) => p.n === i + 1) && new Set(ids).size === ids.length && ids.length === 11;
  const complete = PROCESSES.filter(processComplete).length;
  const drawn = ids.every((id) => Number.isFinite(UNIT_X[id]));
  // los once valores «en el juego» para los tres ríos, con dosis baja, justa y alta, y cloro 0 y 1,3 mg/L
  let cells = 0, bad = 0;
  for (const raw of ['verano', 'lluvia', 'creciente'] as const)
    for (const k of [0, 1, 3])
      for (const chlorine of [0, 1.3]) {
        const inp = { raw, dose: Math.round(k * optimumDose(RAW_WATER[raw].turbidity)), chlorine };
        const r = treatPlant(inp);
        for (const p of PROCESSES)
          for (const x of p.inOut(r, inp)) {
            cells++;
            if (!x.value || /NaN|undefined|Infinity/.test(x.value) || !x.label) bad++;
          }
      }
  // los artículos de la Resolución 0330 de 2017 citados por los procesos de la línea de agua y de lodos
  const cites: Record<string, string> = { desarenador: '55', mezcla: '111', floc: '112', sedim: '113', filtro: '114', cloro: '121', lodos: '125' };
  const cited = Object.entries(cites).every(([id, art]) => {
    const src = PROCESSES.find((p) => p.id === id)!.source;
    return src.includes('0330 de 2017') && src.includes(`artículo${id === 'lodos' ? 's' : ''} ${art}`);
  });
  // lo que dice el proceso de la llave coincide con el cálculo del IRCA
  const rr = treatPlant({ raw: 'lluvia', dose: 10, chlorine: 0.8 });
  const tap = PROCESSES.find((p) => p.id === 'llave')!.inOut(rr, { raw: 'lluvia', dose: 10, chlorine: 0.8 });
  const sameIrca = tap.some((x) => x.label === 'IRCA' && x.value.startsWith(rr.irca.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })));
  record({
    id: 'Q13',
    name: 'Los once procesos de la planta convencional',
    tolerance: 'once procesos numerados del 1 al 11 sin repetir, cada uno con texto, mecanismo, criterios de diseño, fuente, fallas y mediciones, y con su lugar en la escena; sus valores «en el juego» existen y son números válidos para los tres ríos, tres dosis y dos dosis de cloro (ninguno NaN ni vacío); los procesos citan los artículos 55, 111, 112, 113, 114, 121 y 125 de la Resolución 0330 de 2017; el IRCA que muestra la llave es el calculado',
    measured: `orden ${order ? 'correcto' : 'INCORRECTO'}; completos ${complete} de ${PROCESSES.length}; en la escena ${drawn ? 'todos' : 'FALTAN'}; valores revisados ${cells}, inválidos ${bad}; citas ${cited ? 'correctas' : 'INCORRECTAS'}; IRCA de la llave ${sameIrca ? 'coincide' : 'NO coincide'} (${f(rr.irca, 1)} %)`,
    pass: order && complete === PROCESSES.length && drawn && bad === 0 && cells > 0 && cited && sameIrca,
  });
}

// Q14) Amoníaco: fracción libre (Emerson et al., 1975) y nitrificación aguas abajo
{
  // valores de la tabla de Emerson et al. (1975): porcentaje de NH₃ libre
  const table: [number, number, number][] = [
    [20, 7, 0.397],
    [20, 8, 3.82],
    [20, 9, 28.4],
    [25, 7, 0.566],
    [25, 8, 5.38],
    [25, 9, 36.2],
  ];
  const errs = table.map(([T, pH, pct]) => Math.abs((nh3Fraction(T, pH) * 100) / pct - 1));
  const worstRel = Math.max(...errs);
  // amonio en la mezcla = balance de masa; aguas abajo decae con kn; el nitrato formado + el amonio que queda = el inicial
  const m = creekModel({ ...DEFAULT_CREEK, houses: 600, season: 'verano', slope: 'plana' });
  const Nmix = (m.Qr * m.up.ammoniaN + m.Qw * 25) / (m.Qr + m.Qw);
  const r1 = m.at(1500);
  const expectN = Nmix * Math.exp(-m.kn * (r1.travelH / 24));
  // el oxígeno baja más con la nitrificación que sin ella (la demanda nitrogenada existe)
  const noN = creekModel({ ...DEFAULT_CREEK, houses: 600, season: 'verano', slope: 'plana', treatment: 'ninguno' });
  const nbodLoad = NITRIF.o2PerN * noN.mix.ammoniaN;
  // tratamientos: lo que queda de amonio sigue la tabla
  const order = (['ninguno', 'septico', 'ptar', 'alcantarillado'] as const).map((t) => creekModel({ ...DEFAULT_CREEK, houses: 600, treatment: t }).mix.ammoniaN);
  const nh3Ok = Math.abs(r1.nh3 - r1.ammoniaN * nh3Fraction(r1.T, r1.pH) * NH3_PER_N) < 1e-12;
  record({
    id: 'Q14',
    name: 'Amoníaco libre (Emerson et al.) y nitrificación aguas abajo',
    tolerance: 'fracción de NH₃ libre igual a la tabla de Emerson et al. (1975) a 20 y 25 °C y pH 7, 8 y 9 (error relativo < 2 %); amonio de la mezcla = balance de masa (error < 10⁻⁹) y aguas abajo = N₀·e^(−kn·t) (error < 10⁻⁹); el amoníaco libre de la lectura es el amonio por su fracción libre; el amonio que llega baja con cada tratamiento (directo = séptico ≥ planta ≥ alcantarillado) y la demanda nitrogenada (4,57 g O₂/g N) es positiva',
    measured: `error máximo frente a la tabla ${(worstRel * 100).toFixed(2)} %; amonio en la mezcla ${f(m.mix.ammoniaN, 4)} frente a ${f(Nmix, 4)} mg/L; a 1,5 km ${f(r1.ammoniaN, 4)} frente a ${f(expectN, 4)} mg/L; NH₃ libre ${f(r1.nh3 * 1000, 2)} µg/L; amonio que llega (directo, séptico, planta, alcantarillado): ${order.map((v) => f(v, 3)).join(' / ')} mg/L; demanda nitrogenada en la mezcla ${f(nbodLoad, 2)} mg/L de O₂ (${TREATMENTS.ptar.ammonia * 100} % del amonio queda con la planta pequeña)`,
    pass: worstRel < 0.02 && Math.abs(m.mix.ammoniaN - Nmix) < 1e-9 && Math.abs(r1.ammoniaN - expectN) < 1e-9 && nh3Ok && order[0] === order[1] && order[1] >= order[2] && order[2] >= order[3] && nbodLoad > 0,
  });
}

// Q15) Datos reales: monitoreo de 18 quebradas de San Antonio de Prado (Secretaría de Medio Ambiente)
{
  const R = resumen();
  const finite = SITIOS.every((s) => [s.od, s.sat, s.cf, s.ct, s.turb, s.ce, s.altura].every((v) => v === null || Number.isFinite(v)) && (s.dbo === null || Number.isFinite(s.dbo[0])));
  const dates = SITIOS.every((s) => s.fecha !== null && s.fecha >= '2017-12-01' && s.fecha <= '2018-01-31');
  // recuento independiente de lo que muestra el panel
  const noSwim = SITIOS.filter((s) => s.cf !== null && s.cf > 200).length;
  const fishDO = SITIOS.filter((s) => s.od !== null && s.od >= 5).length;
  const order = cuencas().every((c) => c.sitios.every((s, k) => k === 0 || s.orden >= c.sitios[k - 1].orden));
  // coherencia de oxígeno y saturación con la ecuación de Benson y Krause a la altitud de cada sitio
  const tt = SITIOS.map((s) => (s.od !== null && s.sat !== null && s.altura !== null ? impliedTemp(s.od, s.sat, s.altura) : null));
  const evaluated = tt.filter((t) => t !== null).length;
  const roundTrip = SITIOS.every((s, k) => {
    const T = tt[k];
    return T === null || Math.abs(doSat(T, s.altura as number) * ((s.sat as number) / 100) - (s.od as number)) < 1e-6;
  });
  // el modelo dice lo mismo que los datos: en una quebrada de montaña con 600 casas sin tratar el oxígeno no baja de 5 mg/L
  // pero los coliformes impiden nadar en los 3 km
  const mm = creekModel({ ...DEFAULT_CREEK, houses: 600, treatment: 'ninguno', slope: 'montana' });
  let minDO = Infinity, swimAny = false;
  for (let x = 0; x <= 3000; x += 25) {
    const r = mm.at(x);
    minDO = Math.min(minDO, r.dissolvedO2);
    if (canSwim(r).ok) swimAny = true;
  }
  record({
    id: 'Q15',
    name: 'Datos reales de 18 quebradas de San Antonio de Prado y lo que dicen frente al modelo',
    tolerance: '68 sitios con medición en 18 microcuencas, todos con números válidos y medidos entre diciembre de 2017 y enero de 2018; los sitios de cada microcuenca, de la parte alta a la baja; el resumen del panel = un recuento independiente; el oxígeno y la saturación medidos son coherentes con la ecuación de Benson y Krause a la altitud del sitio (temperatura del agua implícita entre 10 y 26 °C en al menos 90 % de los sitios; ida y vuelta < 10⁻⁶ mg/L); el modelo y los datos coinciden en lo cualitativo: oxígeno de al menos 5 mg/L en la mayoría de los sitios reales y en la quebrada de montaña del modelo, y coliformes por encima del criterio para nadar en la mayoría de los sitios reales y en todo el tramo del modelo con 600 casas sin tratar',
    measured: `${R.sitios} sitios en ${R.cuencas} microcuencas (${MONITOREO_META.fechas?.join(' a ')}); números ${finite ? 'válidos' : 'INVÁLIDOS'}; fechas ${dates ? 'en el rango' : 'FUERA'}; orden ${order ? 'correcto' : 'INCORRECTO'}; oxígeno ≥ 5 mg/L: ${R.oxigenoParaPeces} (recuento ${fishDO}) de ${R.conOxigeno}, mediana ${f(R.medianaOxigeno)} mg/L y ${f(R.medianaSaturacion, 1)} %; coliformes > 200: ${R.noNadar} (recuento ${noSwim}) de ${R.conColiformes}; suben aguas abajo en ${R.subenAguasAbajo} de ${R.conAltaYBaja} microcuencas; temperatura implícita ${f(R.tempP5, 1)}–${f(R.tempP95, 1)} °C (5 % a 95 %), coherente en ${R.tempCoherentes} de ${evaluated}; modelo: oxígeno mínimo ${f(minDO)} mg/L, ¿se puede nadar en algún punto? ${swimAny ? 'sí' : 'no'}`,
    pass:
      R.sitios === 68 && R.cuencas === 18 && finite && dates && order && R.noNadar === noSwim && R.oxigenoParaPeces === fishDO && R.tempCoherentes >= 0.9 * evaluated && evaluated > 60 && roundTrip &&
      R.oxigenoParaPeces > R.conOxigeno / 2 && R.noNadar > R.conColiformes / 2 && minDO >= 5 && !swimAny,
  });
}

// Q16) Robustez: miles de entradas al azar y entradas inválidas, sin NaN, sin infinitos y dentro de lo físico
{
  let seed = 20261110;
  const rnd = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const weird = [NaN, Infinity, -Infinity, -1, -1e9, 1e12, 0, 0.5, '7' as unknown as number, null as unknown as number, undefined as unknown as number];
  const num = (lo: number, hi: number) => (rnd() < 0.08 ? pick(weird) : lo + rnd() * (hi - lo));
  let creekCases = 0, creekBad = 0, plantCases = 0, plantBad = 0, streetCases = 0, streetBad = 0, thrown = 0;
  const bad = (v: number) => !Number.isFinite(v);
  for (let k = 0; k < 6000; k++) {
    const raw = {
      houses: num(0, 6000),
      treatment: rnd() < 0.05 ? 'otro' : pick(['ninguno', 'septico', 'ptar', 'alcantarillado'] as const),
      season: rnd() < 0.05 ? 7 : pick(['verano', 'normal', 'lluvioso'] as const),
      slope: pick(['montana', 'plana', 'x'] as const),
      trees: rnd() < 0.05 ? ('si' as unknown as boolean) : rnd() < 0.5,
      afterRain: rnd() < 0.5,
      ...(rnd() < 0.3 ? { elevM: num(0, 5000) } : {}),
    } as unknown as CreekInput;
    try {
      const m = creekModel(raw);
      const sat = doSat(m.mix.T, m.inp.elevM ?? 1495);
      for (let q = 0; q < 6; q++) {
        const r = m.at(q === 5 ? NaN : -400 + rnd() * 6000);
        creekCases++;
        const vals = [r.dissolvedO2, r.satPct, r.dbo, r.coliforms, r.turbidity, r.ammoniaN, r.nh3, r.pH, r.conductivity, r.T, r.Q, r.travelH];
        if (vals.some(bad) || r.dissolvedO2 < 0 || r.dissolvedO2 > Math.max(sat, doSat(m.up.T, m.inp.elevM ?? 1495)) * 1.0001 || r.dbo < 0 || r.coliforms < 0 || r.turbidity < 0 || r.ammoniaN < 0 || r.nh3 > r.ammoniaN * NH3_PER_N + 1e-12 || r.pH < 6 || r.pH > 9) creekBad++;
      }
    } catch {
      thrown++;
    }
    const pin = { raw: rnd() < 0.05 ? 'nada' : pick(['verano', 'lluvia', 'creciente'] as const), dose: num(0, 250), chlorine: num(0, 12), ...(rnd() < 0.3 ? { networkH: num(0, 100) } : {}) } as unknown as PlantInput;
    try {
      const p = treatPlant(pin);
      plantCases++;
      const vals = [p.settled, p.filtered, p.pH, p.demand, p.clExit, p.clTap, p.logKill, p.coliTotalTap, p.eColiTap, p.irca];
      if (vals.some(bad) || p.irca < 0 || p.irca > 100 || p.filtered < 0 || p.clTap > p.clExit + 1e-12 || p.coliTotalTap < 0 || p.filtered > p.raw.turbidity + 1e-9) plantBad++;
    } catch {
      thrown++;
    }
    if (k % 3 === 0) {
      const sin = { dryDays: num(0, 80), sweeping: rnd() < 0.5, litter: pick(['poca', 'mucha', '?'] as const), rainMmH: num(0, 400), durationMin: num(0, 300), wrongHouses: num(0, 30) } as unknown as StreetInput;
      try {
        const w = washoff(sin);
        streetCases++;
        const si = sanitizeStreet(sin);
        const B = (buildup(si.dryDays, si.sweeping) * STREET.area) / 1000;
        const mono = w.massKg.every((v, i) => i === 0 || v >= w.massKg[i - 1] - 1e-12);
        if ([w.totalKg, w.firstFlushPct, w.sewageM3, w.coliformsGiga].some(bad) || w.conc.some((c) => bad(c) || c < 0) || w.totalKg > B + 1e-9 || !mono || w.firstFlushPct < 0 || w.firstFlushPct > 100 + 1e-9) streetBad++;
      } catch {
        thrown++;
      }
    }
  }
  // las entradas saneadas quedan dentro de sus límites
  const sc = sanitizeCreek({ houses: -5, treatment: 'x' as never, elevM: 1e9 });
  const sp = sanitizePlant({ dose: NaN, chlorine: 99, raw: 'x' as never });
  const ss = sanitizeStreet({ dryDays: -3, durationMin: 0.2, wrongHouses: 99 });
  const limits = sc.houses === CREEK_LIMITS.houses[0] && sc.treatment === 'ninguno' && sc.elevM === CREEK_LIMITS.elevM[1] && sp.dose === 0 && sp.chlorine === PLANT_LIMITS.chlorine[1] && sp.raw === 'verano' && ss.dryDays === 0 && ss.durationMin === STREET_LIMITS.durationMin[0] && ss.wrongHouses === STREET_LIMITS.wrongHouses[1];
  record({
    id: 'Q16',
    name: 'Robustez ante miles de entradas al azar y entradas inválidas',
    tolerance: '6 000 barrios, 6 000 plantas y 2 000 calles al azar (8 % de los números son NaN, infinitos, negativos, enormes o de otro tipo, y algunas opciones no existen): ninguna excepción; ningún NaN ni infinito; oxígeno entre 0 y la saturación; DBO, coliformes, turbiedad y amonio ≥ 0; amoníaco libre ≤ amonio; pH entre 6 y 9; IRCA entre 0 y 100; cloro en la llave ≤ cloro a la salida; turbiedad filtrada entre 0 y la del río; masa lavada creciente y nunca mayor que la acumulada; primer lavado entre 0 y 100 %; las entradas saneadas quedan en sus límites',
    measured: `lecturas de la quebrada ${creekCases} (fuera de rango ${creekBad}); plantas ${plantCases} (fuera de rango ${plantBad}); calles ${streetCases} (fuera de rango ${streetBad}); excepciones ${thrown}; límites ${limits ? 'correctos' : 'INCORRECTOS'}`,
    pass: thrown === 0 && creekBad === 0 && plantBad === 0 && streetBad === 0 && creekCases > 30000 && plantCases === 6000 && streetCases === 2000 && limits,
  });
}

// Q17) Coherencia: cada decisión empuja el resultado hacia donde debe (sin excepciones en la malla de casos)
{
  let checks = 0, viol = 0;
  const xs = [0, 100, 400, 1000, 2500];
  const treats = ['ninguno', 'septico', 'ptar', 'alcantarillado'] as const;
  for (const slope of ['montana', 'plana'] as const)
    for (const season of ['verano', 'normal', 'lluvioso'] as const)
      for (const afterRain of [false, true])
        for (const trees of [false, true]) {
          // más casas (mismo tratamiento): más DBO, coliformes y amonio; menos oxígeno
          for (const treatment of treats.slice(0, 3)) {
            let prev = creekModel({ houses: 0, treatment, season, slope, afterRain, trees });
            for (let h = 100; h <= 1000; h += 150) {
              const cur = creekModel({ houses: h, treatment, season, slope, afterRain, trees });
              for (const x of xs) {
                const a = prev.at(x), b = cur.at(x);
                checks += 4;
                if (b.dbo < a.dbo - 1e-9) viol++;
                if (b.coliforms < a.coliforms - 1e-9) viol++;
                if (b.ammoniaN < a.ammoniaN - 1e-9) viol++;
                if (b.dissolvedO2 > a.dissolvedO2 + 1e-9) viol++;
              }
              prev = cur;
            }
          }
          // mejor tratamiento (mismo barrio): no más DBO ni coliformes
          for (let k = 1; k < treats.length; k++) {
            const a = creekModel({ houses: 600, treatment: treats[k - 1], season, slope, afterRain, trees }), b = creekModel({ houses: 600, treatment: treats[k], season, slope, afterRain, trees });
            for (const x of xs) {
              checks += 2;
              if (b.at(x).dbo > a.at(x).dbo + 1e-9) viol++;
              if (b.at(x).coliforms > a.at(x).coliforms + 1e-9) viol++;
            }
          }
        }
  // temporadas (sin lluvia reciente): más caudal, menos concentración junto al tubo
  for (const treatment of treats.slice(0, 3)) {
    const v = (['verano', 'normal', 'lluvioso'] as const).map((season) => creekModel({ ...DEFAULT_CREEK, houses: 600, treatment, season }).at(50));
    checks += 2;
    if (!(v[0].dbo > v[1].dbo && v[1].dbo > v[2].dbo)) viol++;
    if (!(v[0].coliforms > v[1].coliforms && v[1].coliforms > v[2].coliforms)) viol++;
  }
  // planta: más cloro, no menos cloro en la llave ni menos inactivación; calle: más días secos, más mugre; barrer, menos
  for (const raw of ['verano', 'lluvia', 'creciente'] as const)
    for (const dose of [5, 15, 40]) {
      let prev = treatPlant({ raw, dose, chlorine: 0 });
      for (let c = 0.2; c <= 4; c += 0.2) {
        const cur = treatPlant({ raw, dose, chlorine: c });
        checks += 2;
        if (cur.clTap < prev.clTap - 1e-12) viol++;
        if (cur.logKill < prev.logKill - 1e-12) viol++;
        prev = cur;
      }
    }
  for (const sweeping of [false, true]) {
    let prev = washoff({ dryDays: 0, sweeping, litter: 'poca', rainMmH: 40, durationMin: 30, wrongHouses: 0 }).totalKg;
    for (let d = 1; d <= 30; d++) {
      const cur = washoff({ dryDays: d, sweeping, litter: 'poca', rainMmH: 40, durationMin: 30, wrongHouses: 0 }).totalKg;
      checks++;
      if (cur < prev - 1e-12) viol++;
      prev = cur;
    }
  }
  for (let d = 1; d <= 30; d += 3) {
    checks++;
    if (washoff({ dryDays: d, sweeping: true, litter: 'poca', rainMmH: 40, durationMin: 30, wrongHouses: 0 }).totalKg > washoff({ dryDays: d, sweeping: false, litter: 'poca', rainMmH: 40, durationMin: 30, wrongHouses: 0 }).totalKg) viol++;
  }
  record({
    id: 'Q17',
    name: 'Coherencia de las respuestas en toda la malla de decisiones',
    tolerance: 'en 2 cauces × 3 temporadas × lluvia reciente o no × árboles o no: más casas nunca bajan la DBO, los coliformes ni el amonio ni suben el oxígeno; un mejor tratamiento nunca sube la DBO ni los coliformes; más caudal (verano → normal → lluvias) baja las concentraciones junto al tubo; en la planta, más cloro nunca deja menos cloro en la llave ni menos inactivación; en la calle, más días secos nunca lavan menos mugre y barrer nunca lava más; 0 violaciones',
    measured: `${checks} comprobaciones; violaciones ${viol}`,
    pass: viol === 0 && checks > 3000,
  });
}

// Q18) Pluma del tubo: mezcla transversal (Fischer et al., 1979) que conserva la masa y termina mezclada
{
  let worstMean = 0, worstLm = 0, monot = 0, overCap = 0, cases = 0;
  const lms: string[] = [];
  for (const season of ['verano', 'normal', 'lluvioso'] as const)
    for (const slope of ['montana', 'plana'] as const)
      for (const houses of [60, 600, 3000]) {
        const m = creekModel({ houses, treatment: 'ninguno', season, slope, trees: true, afterRain: false });
        const { Lm } = plumeMixing(m);
        if (houses === 600) lms.push(`${season}/${slope} ${Math.round(Lm)} m`);
        const cap = (m.Qr + m.Qw) / m.Qw;
        cases++;
        for (const x of [20, 60, 200, 600, 2000]) {
          // media a lo ancho (regla del punto medio, 2000 franjas); con el tope cerca del tubo puede quedar algo abajo
          let s = 0;
          const N = 2000;
          for (let i = 0; i < N; i++) {
            const f = plumeFactor(m, x, (i + 0.5) / N);
            if (f > cap + 1e-9) overCap++;
            s += f;
          }
          worstMean = Math.max(worstMean, Math.abs(s / N - 1));
        }
        // en el largo de mezcla, de orilla a orilla dentro del 5 % de la media
        worstLm = Math.max(worstLm, Math.abs(plumeFactor(m, Lm, 0) - 1), Math.abs(plumeFactor(m, Lm, 1) - 1));
        // aguas abajo, en la línea donde cae el chorro (y0) la pluma baja y en la orilla opuesta sube
        let pb = Infinity, pf = -Infinity;
        for (const x of [10, 40, 100, 300, 1000, 3000]) {
          const b = plumeFactor(m, x, PLUME.y0), f = plumeFactor(m, x, 1);
          if (b > pb + 1e-12 || f < pf - 1e-12) monot++;
          pb = b;
          pf = f;
        }
      }
  const none = plumeFactor(creekModel({ houses: 0, treatment: 'ninguno', season: 'normal', slope: 'montana', trees: true, afterRain: false }), 50, 0);
  record({
    id: 'Q18',
    name: 'Pluma del tubo: conserva la masa, se mezcla en el largo de Fischer y nunca supera el agua del tubo',
    tolerance: 'en 3 temporadas × 2 cauces × 60, 600 y 3000 casas y a 20, 60, 200, 600 y 2000 m: la media a lo ancho del exceso relativo es 1 (error < 0,5 %); en Lm = 0,4·U·W²/εt las dos orillas están dentro del 5 % de la media; aguas abajo, en la línea donde cae el chorro la pluma nunca sube y en la orilla opuesta nunca baja; nunca más que el agua del tubo sin mezclar; sin casas, sin pluma',
    measured: `${cases} casos; error máximo de la media ${(worstMean * 100).toFixed(3)} %; desvío máximo en Lm ${(worstLm * 100).toFixed(2)} %; violaciones de orden ${monot}; sobre el tope ${overCap}; sin casas F = ${none}; Lm con 600 casas: ${lms.join(', ')}`,
    pass: worstMean < 0.005 && worstLm <= 0.05 && monot === 0 && overCap === 0 && none === 1,
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

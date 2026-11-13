// Pruebas de la sala «Modelación hidráulica 2D»: tablas subgrid, remuestreo, conducción, lago en reposo,
// conservación del volumen, rotura de presa contra Ritter, Gumbel y riesgo, onda difusiva frente a inercia local,
// inestabilidad del esquema explícito, flujo permanente, sensibilidad al terreno y al subgrid, herramientas,
// escenas y retos.

import { record, rel, robust, finish } from '../harness';
import { NX, NY, PIXELS, terrainFor, truth, resample, upsample, meanCapacity, leveeLoss, bridgeOpening } from '../../src/model2d/terrain';
import { BRIDGE_DEFAULT, LOW_CHORD, Run, buildGeometry, cellAt, cellLevel, cellVolume, cellWetArea, faceProps, hyetograph, normalN, registerDomain, scsQ, scsS, weirFlow, type RunOpts, type RunResult } from '../../src/model2d/solver';
import { EAD_PERIODS, HIDDEN_MULT, RISK_MESH, calibRun, damageFrac, damageOf, ead, eadRun, fitStats, golden, intensity, marksFrom, memberRun, members, probabilityMap, zoneAreas, zoneMap, zoneOf } from '../../src/model2d/analysis';
import { crc32, geotiff, hecrasPackage, zip } from '../../src/model2d/exports';
import { exampleDem, readDem } from '../../src/model2d/importDem';
import { designHydro } from '../../src/model2d/hydrology';
import { LEVEE, ROAD_Z, leveeHeight, yc } from '../../src/model2d/terrain';
import { damBreak, ritterH } from '../../src/model2d/dambreak';
import { AMS, AMS_FIT, fitGumbel, gumbelK, periodForRisk, quantile, risk } from '../../src/model2d/hydrology';
import { DEFAULT_COVER, DEFAULT_EQ, DEFAULT_MODEL, DEFAULT_RETURN, DEFAULT_TERRAIN_SCENE, LIDAR_BURNED, baseRun, coverRun, eqReference, eqRun, hazardClass, modelRun, returnRun, summarize, terrainScene } from '../../src/model2d/scene';
import { MODEL2D_TOOLS } from '../../src/model2d/design';

// M2D_ONLY=16-28 (o 3,5,17) corre solo esas pruebas y no reescribe el informe
const ONLY = process.env.M2D_ONLY;
const want = (id: string) => {
  if (!ONLY) return true;
  const n = Number(id.slice(1));
  return ONLY.split(',').some((part) => {
    const [a, b] = part.split('-').map(Number);
    return b ? n >= a && n <= b : n === a;
  });
};
const DOC = ONLY ? '/tmp/model2d-parcial.md' : 'docs/modelo2d/PRUEBAS.md';
const rough = { n: normalN(), mult: 1, buildings: 'n' as const };

// ---------------------------------------------------------------- M1 curva cota-volumen exacta
if (want('M1')) {
  const g = buildGeometry(LIDAR_BURNED, { c: 10, subgrid: true, breaklines: true }, rough);
  let worst = 0, worstInv = 0;
  for (const ci of [0, 517, 1203, 2000, 2559]) {
    const I = ci % g.MX, J = Math.floor(ci / g.MX);
    for (const h of [0.05, 0.4, 1.3, 3.2]) {
      const eta = g.zmin[ci] + h;
      let brute = 0;
      for (let j = J * 10; j < J * 10 + 10; j++) for (let i = I * 10; i < I * 10 + 10; i++) brute += Math.max(0, eta - g.z[j * NX + i]);
      const V = cellVolume(g, ci, eta);
      worst = Math.max(worst, Math.abs(V - brute) / Math.max(1, brute));
      worstInv = Math.max(worstInv, Math.abs(cellLevel(g, ci, V) - eta));
    }
  }
  record({ id: 'M1', name: 'Curva cota-volumen de las celdas (subgrid) e inversa exacta', tolerance: 'volumen igual a la suma píxel por píxel (error < 1e-5) y nivel recuperado a < 1 mm', measured: `error relativo ${worst.toExponential(2)}; nivel ${(worstInv * 1000).toFixed(4)} mm`, pass: worst < 1e-5 && worstInv < 1e-3 });
}

// ---------------------------------------------------------------- M2 remuestreo por promedio conserva la cota media
if (want('M2')) {
  const T = truth();
  let mean1 = 0;
  for (let k = 0; k < T.mdt.length; k++) mean1 += T.mdt[k];
  mean1 /= T.mdt.length;
  const errs = [10, 20].map((p) => {
    const up = upsample(resample(T.mdt, p, 'promedio'));
    let m = 0;
    for (let k = 0; k < up.length; k++) m += up[k];
    return Math.abs(m / up.length - mean1);
  });
  const caps = PIXELS.map((p) => meanCapacity(terrainFor({ surf: 'mdt', p, method: 'promedio', sigma: 0, burn: false }).fine));
  const mono = caps.every((c, k) => k === 0 || c <= caps[k - 1] + 0.5);
  record({ id: 'M2', name: 'El promedio conserva la cota media pero pierde capacidad del cauce', tolerance: 'cota media igual a < 1 mm con píxeles de 10 y 20 m; capacidad que no sube al crecer el píxel', measured: `diferencias ${errs.map((e) => (e * 1000).toFixed(3)).join(' y ')} mm; capacidades ${caps.map((c) => c.toFixed(0)).join(', ')} m³/s`, pass: errs.every((e) => e < 1e-3) && mono });
}

// ---------------------------------------------------------------- M3 el MDS tapa el puente y el máximo conserva la corona
if (want('M3')) {
  const mdt = terrainFor({ surf: 'mdt', p: 1, method: 'promedio', sigma: 0, burn: false }).fine;
  const mds = terrainFor({ surf: 'mds', p: 1, method: 'promedio', sigma: 0, burn: false }).fine;
  const max10 = terrainFor({ surf: 'mdt', p: 10, method: 'maximo', sigma: 0, burn: false }).fine;
  const mean10 = terrainFor({ surf: 'mdt', p: 10, method: 'promedio', sigma: 0, burn: false }).fine;
  const burned = terrainFor({ surf: 'mdt', p: 1, method: 'promedio', sigma: 0, burn: true }).fine;
  const capT = meanCapacity(truth().mdt), capB = meanCapacity(burned), capF = meanCapacity(mdt);
  const ok = bridgeOpening(mds) < 1 && bridgeOpening(mdt) > 50 && Math.abs(leveeLoss(max10)) < 0.05 && leveeLoss(mean10) < -0.3 && rel(capB, capT) < 0.01 && capF < 0.85 * capT;
  record({ id: 'M3', name: 'MDS, remuestreo por máximo y cauce levantado', tolerance: 'el MDS tapa la luz del puente; el máximo a 10 m conserva la corona (±5 cm) y el promedio la baja más de 30 cm; sin el cauce bajo el agua la capacidad baja más de 15 %; insertado vuelve a la real (±1 %)', measured: `luz MDS ${bridgeOpening(mds).toFixed(1)} m² (MDT ${bridgeOpening(mdt).toFixed(0)}); corona máx ${leveeLoss(max10).toFixed(3)} m, prom ${leveeLoss(mean10).toFixed(2)} m; capacidad ${capF.toFixed(1)} / ${capB.toFixed(1)} / ${capT.toFixed(1)} m³/s`, pass: ok });
}

// ---------------------------------------------------------------- M4 conducción por franjas y profundidad normal
if (want('M4')) {
  const g = buildGeometry(LIDAR_BURNED, { c: 20, subgrid: true, breaklines: false }, rough);
  let worst = 0;
  for (const f of [3, 140, 300, 615]) {
    for (const h of [0.2, 1.1, 2.7, 5.9]) {
      const eta = g.fzmin[f] + h;
      let A = 0, K = 0;
      for (let k = 0; k < g.flen[f]; k++) {
        const d = eta - g.fz[g.fOff[f] + k];
        if (d > 0) {
          A += d;
          K += Math.pow(d, 5 / 3) / g.fn[g.fOff[f] + k];
        }
      }
      const p = faceProps(g, f, eta);
      worst = Math.max(worst, rel(p.K, K), rel(p.A, A));
    }
  }
  // cara plana de ancho b con n uniforme: K = b·h^(5/3)/n
  const gf = buildGeometry(LIDAR_BURNED, { c: 20, subgrid: false, breaklines: false }, { n: normalN(), mult: 1, buildings: 'n' });
  const f = 100;
  const h = 1.2, nn = gf.fn[gf.fOff[f]];
  const Kp = faceProps(gf, f, gf.fzmin[f] + h).K, Ka = (gf.c * Math.pow(h, 5 / 3)) / nn;
  record({ id: 'M4', name: 'Tablas de área y conducción de las caras', tolerance: 'la tabla reproduce la suma por franjas (< 1,5 %, interpolación cada 10 cm) y una cara plana da K = b·h^(5/3)/n (< 1 %)', measured: `peor diferencia ${(worst * 100).toFixed(2)} %; cara plana ${Kp.toFixed(2)} frente a ${Ka.toFixed(2)}`, pass: worst < 0.015 && rel(Kp, Ka) < 0.01 });
}

// ---------------------------------------------------------------- M5 lago en reposo
const lake = (eq: 'inercia' | 'difusiva' | 'swe', mesh = baseRun().mesh) => {
  const o: RunOpts = { ...baseRun(), mesh, eq, dtMode: 'fijo', dt: eq === 'difusiva' ? 10 : 0.5, hydro: { Qp: 0, tp: 30, Qb: 0 }, outSlope: 0, warmup: 0, duration: 5 };
  const run = new Run(o);
  run.advance(); // preproceso
  const g = run.g;
  const anyRun = run as unknown as { eta: Float64Array; V: Float64Array };
  for (let i = 0; i < g.NC; i++) {
    anyRun.eta[i] = Math.max(g.zmin[i], 1477.4);
    anyRun.V[i] = cellVolume(g, i, anyRun.eta[i]);
  }
  const before = Float64Array.from(anyRun.eta);
  run.runAll();
  let d = 0;
  for (let i = 0; i < g.NC; i++) d = Math.max(d, Math.abs(anyRun.eta[i] - before[i]));
  return d;
};
if (want('M5')) {
  const dLI = lake('inercia'), dDW = lake('difusiva');
  record({ id: 'M5', name: 'Lago en reposo sobre el terreno irregular', tolerance: 'con el agua quieta a una cota y los bordes cerrados, ningún nivel cambia más de 1 mm en 5 min (inercia local y onda difusiva)', measured: `inercia ${(dLI * 1000).toExponential(2)} mm; difusiva ${(dDW * 1000).toExponential(2)} mm`, pass: dLI < 1e-3 && dDW < 1e-3 });
}

// ---------------------------------------------------------------- M6 conservación del volumen
let _li: RunResult | null = null, _dw: RunResult | null = null;
const runLI = () => (_li ??= new Run(baseRun()).runAll());
const runDW = () => (_dw ??= new Run(baseRun({ eq: 'difusiva', dtMode: 'fijo', dt: 20 })).runAll());
if (want('M6')) {
  record({ id: 'M6', name: 'Conservación del volumen en la creciente de 100 años', tolerance: 'error de volumen < 0,01 % con los dos esquemas; volumen recortado < 0,01 % de lo que entró', measured: `inercia ${runLI().vol.errPct.toExponential(2)} %, recorte ${runLI().vol.clipped.toFixed(1)} m³; difusiva ${runDW().vol.errPct.toExponential(2)} %, recorte ${runDW().vol.clipped.toFixed(1)} m³ de ${runDW().vol.vin.toFixed(0)} m³`, pass: Math.abs(runLI().vol.errPct) < 0.01 && Math.abs(runDW().vol.errPct) < 0.01 && runLI().vol.clipped < 1e-4 * runLI().vol.vin && runDW().vol.clipped < 1e-4 * runDW().vol.vin });
}

// ---------------------------------------------------------------- M7 Ritter
if (want('M7')) {
  const d = damBreak(2, 20);
  const exactMid = ritterH(2, 0, 20);
  record({ id: 'M7', name: 'Rotura de presa contra la solución de Ritter', tolerance: 'en la presa h = 4·h0/9 exacto; aguas someras completas con error medio < 5 %; la inercia local se aleja más (más de 15 %)', measured: `h(0) = ${exactMid.toFixed(4)} (4h0/9 = ${((4 * 2) / 9).toFixed(4)}); completas ${(d.errSWE * 100).toFixed(1)} %, inercia ${(d.errLI * 100).toFixed(1)} %`, pass: Math.abs(exactMid - 8 / 9) < 1e-9 && d.errSWE < 0.05 && d.errLI > 0.15 });
}

// ---------------------------------------------------------------- M8 Gumbel y riesgo
if (want('M8')) {
  const K = gumbelK(100), R = risk(100, 50), T = periodForRisk(0.1, 50);
  const fit = fitGumbel(AMS.map((a) => a.Q));
  record({ id: 'M8', name: 'Gumbel por momentos y riesgo', tolerance: 'K₁₀₀ = 3,1367 (±0,001); R(100, 50) = 0,3950 (±0,001); T para 10 % en 50 años = 475 (±1); Q₁₀₀ = media + K·desviación', measured: `K = ${K.toFixed(4)}, R = ${R.toFixed(4)}, T = ${T.toFixed(1)}, Q₁₀₀ = ${quantile(fit, 100).toFixed(2)} m³/s (media ${fit.mean.toFixed(2)}, desv. ${fit.sd.toFixed(2)})`, pass: Math.abs(K - 3.1367) < 1e-3 && Math.abs(R - 0.395) < 1e-3 && Math.abs(T - 475.06) < 1 && rel(quantile(fit, 100), fit.mean + K * fit.sd) < 1e-12 });
}

// ---------------------------------------------------------------- M9 onda difusiva frente a inercia local
if (want('M9')) {
  const a = summarize(runLI()), b = summarize(runDW());
  record({ id: 'M9', name: 'Onda difusiva (implícita) frente a inercia local (explícita)', tolerance: 'nivel máximo en el puente a menos de 5 cm; caudal pico bajo el puente a menos de 3 %', measured: `puente ${a.wseBridge.toFixed(3)} y ${b.wseBridge.toFixed(3)} m; pico ${a.qBridge.toFixed(2)} y ${b.qBridge.toFixed(2)} m³/s`, pass: Math.abs(a.wseBridge - b.wseBridge) < 0.05 && rel(a.qBridge, b.qBridge) < 0.03 });
}

// ---------------------------------------------------------------- M10 inestabilidad del explícito y pasos largos del implícito
if (want('M10')) {
  const bad = new Run(baseRun({ mesh: { c: 10, subgrid: true, breaklines: true }, dtMode: 'fijo', dt: 3 })).runAll();
  const long = new Run(baseRun({ eq: 'difusiva', dtMode: 'fijo', dt: 60 })).runAll();
  const ref = summarize(runLI()), lg = summarize(long);
  record({ id: 'M10', name: 'Paso de tiempo: explícito inestable, implícito con Courant alto', tolerance: 'inercia local con Δt fijo de 3 s en celdas de 10 m: se detecta la inestabilidad; onda difusiva con Δt = 60 s (Courant > 3): estable y a menos de 5 cm en el puente', measured: `explícito: ${bad.unstable ? `inestable a los ${(bad.unstable.t / 60).toFixed(1)} min` : 'estable'}; implícito: Courant ${long.courantMax.toFixed(1)}, ${long.unstable ? 'inestable' : 'estable'}, puente ${lg.wseBridge.toFixed(3)} m`, pass: !!bad.unstable && !long.unstable && long.courantMax > 3 && Math.abs(lg.wseBridge - ref.wseBridge) < 0.05 });
}

// ---------------------------------------------------------------- M11 flujo permanente: entra lo que sale
if (want('M11')) {
  const o = baseRun({ hydro: { Qp: 30, tp: 1, Qb: 30 }, warmup: 40, duration: 20 });
  const r = new Run(o).runAll();
  const qo = r.series.qout[r.series.qout.length - 1], qb = r.series.qBridge[r.series.qBridge.length - 1];
  record({ id: 'M11', name: 'Flujo permanente con caudal constante', tolerance: 'después de una hora con 30 m³/s, la salida y el puente llevan 30 m³/s (±2 %)', measured: `salida ${qo.toFixed(2)} m³/s, puente ${qb.toFixed(2)} m³/s`, pass: rel(qo, 30) < 0.02 && rel(qb, 30) < 0.02 });
}

// ---------------------------------------------------------------- M12 sensibilidad: subgrid y terreno
if (want('M12')) {
  const ref = summarize(new Run(eqReference()).runAll());
  const sg40 = summarize(new Run(eqRun({ ...DEFAULT_EQ, c: 40, subgrid: true })).runAll());
  const fl40 = summarize(new Run(eqRun({ ...DEFAULT_EQ, c: 40, subgrid: false })).runAll());
  const p30 = summarize(new Run(baseRun({ terrain: { surf: 'mdt', p: 30, method: 'promedio', sigma: 0, burn: false } })).runAll());
  const base = summarize(runLI());
  record({ id: 'M12', name: 'Celdas grandes con y sin subgrid; terreno de 30 m', tolerance: 'con celdas de 40 m, el subgrid queda a menos de 15 cm de la referencia de 10 m y sin subgrid a más de 30 cm; el terreno de 30 m inunda más el barrio que el de 1 m', measured: `referencia ${ref.wseBridge.toFixed(2)} m; 40 m con subgrid ${(sg40.wseBridge - ref.wseBridge).toFixed(2)} m, sin subgrid ${(fl40.wseBridge - ref.wseBridge).toFixed(2)} m; barrio ${base.townArea} m² (1 m) y ${p30.townArea} m² (30 m)`, pass: Math.abs(sg40.wseBridge - ref.wseBridge) < 0.15 && fl40.wseBridge - ref.wseBridge > 0.3 && p30.townArea > base.townArea });
}

// ---------------------------------------------------------------- M13 amenaza H1–H6
if (want('M13')) {
  const cases: [number, number, number][] = [
    [0.2, 0.5, 1],
    [0.4, 1, 2],
    [1, 0.5, 3],
    [1.5, 0.6, 4],
    [1, 2.5, 5],
    [5, 1, 6],
    [0.25, 1.8, 2],
    [0.25, 2.5, 5],
  ];
  const got = cases.map(([D, V]) => hazardClass(D, V, D * V));
  record({ id: 'M13', name: 'Clases de amenaza H1 a H6 (AIDR, 2017)', tolerance: 'profundidad, velocidad y su producto en combinación dan la clase de la tabla', measured: cases.map(([D, V, h], k) => `D ${D}, V ${V} → H${got[k]} (esperada H${h})`).join('; '), pass: got.every((g, k) => g === cases[k][2]) });
}

// ---------------------------------------------------------------- M14 herramientas de diseño
if (want('M14')) {
  const fns: Record<string, (v: Record<string, number | string>) => { outs: { value: string }[]; steps: string[]; error?: string }> = {};
  for (const [part, set] of Object.entries(MODEL2D_TOOLS)) {
    fns[`${part}-calc`] = set.calc.run;
    fns[`${part}-pre`] = set.pre.run;
    for (const [k, e] of (set.extra ?? []).entries()) fns[`${part}-extra${k}`] = e.run;
  }
  const r = robust(fns, (R) => ({ b: R() * 20 - 1, D: R() * 5, z: R() * 3, n: R() * 0.2, S: R() * 3, p: R() * 40, W: R() * 30, crest: R() * 6, V: R() * 6, h: R() * 5, rmse: R() * 3, dz: R() * 1, L: R() * 2000, tabla: R() < 0.5 ? 'pasto 40 0,03\nbosque 60 0,1' : 'x', T: 1 + R() * 600, n0: 'roca', serie: R() < 0.5 ? '10 20 30 40 50 60 70 80 90' : '1 2', R: R() * 120, Qp: R() * 200, tp: R() * 90, Qb: R() * 10, dur: R() * 200, dx: R() * 40, C: R() * 6, A: R() * 100, c: R() * 40, px: R() * 5, pix: '1 2 3 4', eta: R() * 5, a: R() * 2, V0: R() * 1e5, Vin: R() * 1e6, Vout: R() * 1e6, V1: R() * 1e5, runs: R() * 5, dist: R() * 400, err: R() * 2 }));
  const def = Object.values(MODEL2D_TOOLS).flatMap((s) => [s.calc, s.pre, ...(s.extra ?? [])]).map((t) => t.run(Object.fromEntries(t.fields.map((f) => [f.id, f.def]))));
  record({ id: 'M14', name: 'Herramientas de diseño: robustez y valores de ejemplo', tolerance: 'sin excepciones ni NaN con datos al azar; con los valores de ejemplo todas dan resultado sin error', measured: `${r.calls} llamadas, ${r.bad} con NaN, ${r.thrown} excepciones; ${def.filter((d) => !d.error).length} de ${def.length} con los valores de ejemplo`, pass: r.bad === 0 && r.thrown === 0 && def.every((d) => !d.error) });
}

// ---------------------------------------------------------------- M15 escenas y retos
if (want('M15')) {
  const t0 = terrainScene(DEFAULT_TERRAIN_SCENE);
  const t30 = terrainScene({ ...DEFAULT_TERRAIN_SCENE, p: 30 });
  const t30b = terrainScene({ ...DEFAULT_TERRAIN_SCENE, p: 30, burn: true });
  const mds = terrainScene({ ...DEFAULT_TERRAIN_SCENE, surf: 'mds' });
  const max5 = terrainScene({ ...DEFAULT_TERRAIN_SCENE, p: 5, method: 'maximo' });
  // retos de la parte 1: ninguno se cumple con los valores por omisión y todos tienen solución
  const r1 = [t0.capRatio < 0.3, false, Math.abs(t0.levee) <= 0.1 && false, t0.bridge < 5];
  const sol1 = [t30.capRatio < 0.3, t30b.capRatio >= 0.8 && t30b.capRatio <= 1.2, Math.abs(max5.levee) <= 0.1, mds.bridge < 5];
  // partes 2 y 3: la corrida por omisión no cumple; variantes sí
  const cb = summarize(new Run(coverRun(DEFAULT_COVER)).runAll());
  const cMax = summarize(new Run(coverRun({ ...DEFAULT_COVER, mult: 1.4 })).runAll());
  const cMin = summarize(new Run(coverRun({ ...DEFAULT_COVER, level: 'min' })).runAll());
  const r2 = [cMax.wseBridge - cb.wseBridge >= 0.2, cMin.townArea < 0.5 * cb.townArea, cMin.vmax > 4 || summarize(new Run(coverRun({ ...DEFAULT_COVER, mult: 0.6 })).runAll()).vmax > 4];
  const d3 = summarize(new Run(returnRun(DEFAULT_RETURN)).runAll());
  const t10 = summarize(new Run(returnRun({ ...DEFAULT_RETURN, T: 10 })).runAll());
  const t100 = summarize(new Run(returnRun({ ...DEFAULT_RETURN, T: 100 })).runAll());
  const t100s = summarize(new Run(returnRun({ ...DEFAULT_RETURN, T: 100, outSlope: 0.0005 })).runAll());
  const t100f = summarize(new Run(returnRun({ ...DEFAULT_RETURN, T: 100, tp: 10 })).runAll());
  const r3 = [risk(DEFAULT_RETURN.T, DEFAULT_RETURN.life) >= 0.4 && risk(100, 50) < 0.4, d3.overtop && !t10.overtop, Math.abs(t100s.outletWse - t100.outletWse) >= 0.4 && Math.abs(t100s.wseBridge - t100.wseBridge) < 0.5 * Math.abs(t100s.outletWse - t100.outletWse), d3.attenuation < 0.14 && t100f.attenuation >= 0.14];
  const mr = modelRun(DEFAULT_MODEL);
  const okModel = mr.eq === 'difusiva' && mr.mesh.c === 10 && mr.tolWS === 0.003 && mr.maxIter === 20 && mr.theta === 1;
  record({
    id: 'M15',
    name: 'Escenas y retos',
    tolerance: 'ningún reto de las partes 1 a 3 se cumple con los valores por omisión; cada uno tiene una solución; el modelo por omisión usa las opciones de HEC-RAS (onda difusiva, θ = 1, 20 iteraciones, 3 mm)',
    measured: `parte 1 por omisión ${r1.map((x) => (x ? 'sí' : 'no')).join('/')}, soluciones ${sol1.map((x) => (x ? 'sí' : 'no')).join('/')}; parte 2: +${(cMax.wseBridge - cb.wseBridge).toFixed(2)} m, barrio ${cMin.townArea}/${cb.townArea} m², ${r2.map((x) => (x ? 'sí' : 'no')).join('/')}; parte 3: ${r3.map((x) => (x ? 'sí' : 'no')).join('/')} (T 25 barrio ${d3.townArea} m², T 10 ${t10.townArea} m²); modelo ${okModel ? 'sí' : 'no'}`,
    pass: r1.every((x) => !x) && sol1.every((x) => x) && r2.every((x) => x) && r3.every((x) => x) && okModel,
  });
}


// ---------------------------------------------------------------- M16 malla refinada
if (want('M16')) {
  const ref = { c: 20, subgrid: true, breaklines: true, refine: [{ region: 'cauce', c: 10 }, { region: 'jarillon', c: 10 }] };
  const dLake = lake('inercia', ref);
  const rr = new Run(baseRun({ mesh: ref })).runAll();
  const r10 = summarize(new Run(eqReference()).runAll()), r20 = summarize(runLI()), rf = summarize(rr);
  // balance 2:1: ninguna cara une celdas de más del doble de tamaño
  const g = rr.geom;
  let worst = 1;
  for (let f = 0; f < g.nInt; f++) worst = Math.max(worst, g.cs[g.fa[f]] / g.cs[g.fb[f]], g.cs[g.fb[f]] / g.cs[g.fa[f]]);
  record({ id: 'M16', name: 'Malla refinada (árbol cuaternario balanceado)', tolerance: 'lago en reposo a < 1 mm; volumen conservado (< 0,01 %); ninguna cara une celdas de más del doble de tamaño; con 20 m refinada a 10 m en el cauce y el jarillón, el puente a < 3 cm de la malla de 10 m y el barrio más cerca de ella que la de 20 m', measured: `lago ${(dLake * 1000).toExponential(2)} mm; volumen ${rr.vol.errPct.toExponential(2)} %; razón máxima ${worst}; ${g.NC} celdas (10 m: ${2560}); puente ${rf.wseBridge.toFixed(3)} / ${r10.wseBridge.toFixed(3)} m; barrio ${rf.townArea} / ${r10.townArea} / ${r20.townArea} m²`, pass: dLake < 1e-3 && Math.abs(rr.vol.errPct) < 0.01 && worst <= 2 && Math.abs(rf.wseBridge - r10.wseBridge) < 0.03 && Math.abs(rf.townArea - r10.townArea) < Math.abs(r20.townArea - r10.townArea) });
}

// ---------------------------------------------------------------- M17 Ritter en 2D con las tres ecuaciones
if (want('M17')) {
  registerDomain({ id: 'canal-prueba', name: 'canal', NX: 1200, NY: 8, px: 1, z: new Float32Array(1200 * 8).fill(100) });
  const err = (eq: 'swe' | 'inercia') => {
    const o: RunOpts = { ...baseRun(), site: { id: 'canal-prueba', n: 0.0001, cn: 100 }, bcs: [], mesh: { c: 2, subgrid: true, breaklines: false }, eq, dtMode: 'courant', dt: 1, courantMax: 0.5, warmup: 0, duration: 20 / 60, outEvery: 20, initWS: { x1: 600, eta: 102 }, hydro: { Qp: 0, tp: 30, Qb: 0 } };
    const r = new Run(o).runAll();
    const g = r.geom, eta = r.frames[r.frames.length - 1], c0 = Math.sqrt(9.81 * 2);
    let e = 0, s = 0;
    for (let i = 0; i < g.NC; i++) {
      if (g.cy0[i] !== 0) continue;
      const x = g.cx0[i] + g.cs[i] / 2 - 600, he = ritterH(2, x, 20);
      if (x < -c0 * 20 * 1.2 || x > 2 * c0 * 20 * 1.2) continue;
      e += Math.abs(eta[i] - 100 - he);
      s += Math.max(he, 0.1);
    }
    return { e: e / s, vol: r.vol.errPct };
  };
  const a = err('swe'), b = err('inercia');
  record({ id: 'M17', name: 'Rotura de presa en 2D: aguas someras completas contra Ritter', tolerance: 'con la advección (Stelling y Duinmeijer) el error medio es < 10 % y la inercia local se aleja más de 15 %; volumen conservado', measured: `aguas someras ${(a.e * 100).toFixed(1)} %, inercia local ${(b.e * 100).toFixed(1)} %; volumen ${a.vol.toExponential(1)} %`, pass: a.e < 0.1 && b.e > 0.15 && Math.abs(a.vol) < 1e-6 });
}

// ---------------------------------------------------------------- M18 lluvia sobre la malla y número de curva
if (want('M18')) {
  const S = scsS(74), Q = scsQ(80, S);
  const Qa = ((80 - 0.2 * S) ** 2) / (80 + 0.8 * S);
  const h = hyetograph(80, 60);
  const peakMid = h.blocks.indexOf(Math.max(...h.blocks));
  const rl = new Run(baseRun({ hydro: { Qp: 4, tp: 30, Qb: 4 }, rain: { P: 80, D: 60, soil: 'C' }, duration: 150 })).runAll();
  const rd = new Run(baseRun({ eq: 'difusiva', dtMode: 'fijo', dt: 10, hydro: { Qp: 4, tp: 30, Qb: 4 }, rain: { P: 80, D: 60, soil: 'C' }, duration: 150 })).runAll();
  const sl = summarize(rl);
  const tot = (rl.vol.rain + rl.vol.infil) / (640 * 400) * 1000;
  record({ id: 'M18', name: 'Lluvia sobre la malla con pérdidas del número de curva', tolerance: 'escorrentía del SCS exacta (CN 74, P 80 mm); el hietograma suma P con el pico en el centro; volumen conservado (< 0,001 %) con la inercia y la onda difusiva; lluvia = escorrentía + pérdidas; el barrio se encharca detrás del jarillón sin creciente del río', measured: `Q ${Q.toFixed(3)} mm (fórmula ${Qa.toFixed(3)}); hietograma ${h.cum[h.cum.length - 1].toFixed(3)} mm, pico en el bloque ${peakMid + 1} de ${h.blocks.length}; volumen ${rl.vol.errPct.toExponential(1)} % y ${rd.vol.errPct.toExponential(1)} %; lámina total ${tot.toFixed(2)} mm; barrio ${sl.townArea} m²`, pass: Math.abs(Q - Qa) < 1e-9 && Math.abs(h.cum[h.cum.length - 1] - 80) < 1e-9 && Math.abs(peakMid - (h.blocks.length - 1) / 2) <= 0.5 && Math.abs(rl.vol.errPct) < 1e-3 && Math.abs(rd.vol.errPct) < 1e-3 && Math.abs(tot - 80) < 0.05 && sl.townArea > 1000 });
}

// ---------------------------------------------------------------- M19 rotura del jarillón
if (want('M19')) {
  const x = 300;
  let crest = -Infinity, toe = Infinity;
  for (let j = 0; j < 400; j++) {
    const k = j * 640 + x;
    if (truth().ridge[k] === 1) crest = Math.max(crest, truth().mdt[k]);
    const lev = leveeHeight(x + 0.5, j + 0.5);
    if (lev > 0.01) toe = Math.min(toe, truth().mdt[k] - lev);
  }
  const breach = { x, width: 30, bottom: 0, slope: 1, tForm: 10, trigger: 'nivel' as const, zTrigger: toe + 0.15, tTrigger: 10 };
  const o = baseRun({ mesh: { c: 10, subgrid: true, breaklines: true }, breach });
  const r = new Run(o).runAll(), base = summarize(new Run(eqReference()).runAll()), s = summarize(r);
  const gz = r.geom.z[Math.floor(yc(x) + LEVEE.dn) * 640 + x];
  record({ id: 'M19', name: 'Rotura progresiva del jarillón (disparada por nivel)', tolerance: 'la rotura se dispara y se completa en el tiempo de formación; la corona baja al terreno natural; el volumen se conserva al cambiar el terreno (< 0,01 %); entra agua por la rotura y el barrio se inunda más que sin ella', measured: `corona ${crest.toFixed(2)} m → ${gz.toFixed(2)} m (pie ${r.breach?.zBottom.toFixed(2)} m); inicio ${((r.breach?.t0 ?? NaN) / 60).toFixed(1)} min, completa ${((r.breach?.full ?? NaN) / 60).toFixed(1)} min; caudal por la rotura ${Math.max(...r.series.qBreach).toFixed(1)} m³/s; volumen ${r.vol.errPct.toExponential(1)} %; barrio ${s.townArea} frente a ${base.townArea} m²`, pass: r.breach?.t0 !== null && r.breach?.full !== null && Math.abs(((r.breach!.full as number) - (r.breach!.t0 as number)) / 60 - 10) < 0.6 && Math.abs(gz - (r.breach!.zBottom)) < 0.15 && Math.abs(r.vol.errPct) < 0.01 && Math.max(...r.series.qBreach) > 0.5 && s.townArea > base.townArea });
}

// ---------------------------------------------------------------- M20 el puente como estructura
if (want('M20')) {
  // vertedero: libre = C·L·H^1,5; sumergido según Villemonte
  const free = weirFlow(101, 99, 100, 1.66, 10), sub = weirFlow(101, 100.5, 100, 1.66, 10);
  const freeA = 1.66 * 10, subA = freeA * Math.pow(1 - Math.pow(0.5, 1.5), 0.385);
  const run = (b: typeof BRIDGE_DEFAULT | null) => summarize(new Run(baseRun({ mesh: { c: 10, subgrid: true, breaklines: true }, bridge: b })).runAll());
  const none = summarize(new Run(eqReference()).runAll()), open = run(BRIDGE_DEFAULT), blk = run({ ...BRIDGE_DEFAULT, block: 0.5 });
  const pr = new Run(baseRun({ mesh: { c: 10, subgrid: true, breaklines: true }, bridge: { ...BRIDGE_DEFAULT, low: 1478.3, block: 0.5 } })).runAll();
  const sp = summarize(pr);
  record({ id: 'M20', name: 'El puente como estructura: flujo libre, a presión y vertedero', tolerance: 'vertedero libre = C·L·H^1,5 y sumergido con Villemonte (exactos); las pérdidas de la luz suben el agua sobre la corrida sin estructura; tapar media luz la sube más de 20 cm; con el tablero bajo y la luz tapada el agua pasa la cara inferior del tablero (flujo a presión) sin inestabilidad y con el volumen conservado', measured: `vertedero ${free.toFixed(3)}/${freeA.toFixed(3)} y ${sub.toFixed(3)}/${subA.toFixed(3)} m³/s; puente sin estructura ${none.wseBridge.toFixed(2)} m, con la luz libre ${open.wseBridge.toFixed(2)} m, media luz tapada ${blk.wseBridge.toFixed(2)} m; tablero a 1478,30 y luz tapada: ${sp.wseBridge.toFixed(2)} m, volumen ${pr.vol.errPct.toExponential(1)} %`, pass: Math.abs(free - freeA) < 1e-9 && Math.abs(sub - subA) < 1e-9 && open.wseBridge > none.wseBridge && blk.wseBridge - none.wseBridge > 0.2 && sp.wseBridge > 1478.3 && !pr.unstable && Math.abs(pr.vol.errPct) < 0.01 && LOW_CHORD < ROAD_Z });
}

// ---------------------------------------------------------------- M21 las tres ecuaciones en el valle
if (want('M21')) {
  const mesh = { c: 10, subgrid: true, breaklines: true };
  const sw = new Run(baseRun({ eq: 'swe', mesh })).runAll(), dw = new Run(baseRun({ eq: 'difusiva', dtMode: 'fijo', dt: 10, mesh })).runAll(), li = new Run(eqReference()).runAll();
  const a = summarize(sw), b = summarize(dw), c = summarize(li);
  record({ id: 'M21', name: 'Onda difusiva, inercia local y aguas someras en el mismo valle', tolerance: 'las tres estables y con el volumen conservado (< 0,01 %); la difusiva y la inercia a < 3 cm en el puente; las aguas someras, con las pérdidas por curvas, contracción y expansión, suben el agua en el puente (más de 5 cm)', measured: `puente: difusiva ${b.wseBridge.toFixed(3)}, inercia ${c.wseBridge.toFixed(3)}, aguas someras ${a.wseBridge.toFixed(3)} m; volumen ${dw.vol.errPct.toExponential(1)}, ${li.vol.errPct.toExponential(1)}, ${sw.vol.errPct.toExponential(1)} %`, pass: !sw.unstable && !dw.unstable && !li.unstable && [sw, dw, li].every((r) => Math.abs(r.vol.errPct) < 0.01) && Math.abs(b.wseBridge - c.wseBridge) < 0.03 && a.wseBridge - b.wseBridge > 0.05 });
}

// ---------------------------------------------------------------- M22 incertidumbre: ensamble
if (want('M22')) {
  const ms = members(8);
  const again = members(8);
  const rs = ms.map((m) => new Run(memberRun(m)).runAll());
  const p = probabilityMap(rs);
  let lo = 1, hi = 0, mid = 0;
  for (const v of p) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
    if (v > 0 && v < 1) mid++;
  }
  const far = p[cellAt(rs[0].geom, 300, 30)];
  let ones = 0;
  for (const v of p) if (v === 1) ones++;
  record({ id: 'M22', name: 'Ensamble: mapa de probabilidad de inundación', tolerance: 'los miembros se repiten con la misma semilla; la probabilidad va de 0 a 1: hay celdas que se mojan en todos los miembros (1), la ladera lejana nunca se moja (0) y hay celdas con probabilidad intermedia', measured: `${ms.length} miembros (n ×${ms.map((m) => m.mult.toFixed(2)).join(', ')}; Q ${ms.map((m) => m.Qp.toFixed(0)).join(', ')} m³/s); probabilidad de ${lo} a ${hi}; ${ones} celdas con 1; ladera ${far}; ${mid} celdas intermedias`, pass: JSON.stringify(ms) === JSON.stringify(again) && lo === 0 && hi === 1 && ones > 20 && far === 0 && mid > 20 });
}

// ---------------------------------------------------------------- M23 calibración con marcas de agua
if (want('M23')) {
  const hidden = new Run(calibRun(HIDDEN_MULT)).runAll();
  const obs = marksFrom(hidden);
  const best = await golden(async (m) => fitStats(new Run(calibRun(m)).runAll(), obs).rmse, 0.7, 1.6, 0.03);
  const f1 = fitStats(new Run(calibRun(1)).runAll(), obs);
  record({ id: 'M23', name: 'Calibración del n con marcas de agua (búsqueda de sección dorada)', tolerance: 'las marcas salen de una corrida escondida con n ×1,18 y ±5 cm de error; la búsqueda recupera el multiplicador a ±0,06 con un RMSE del orden del error de las marcas; con n ×1 el sesgo es negativo (el modelo queda bajo)', measured: `${obs.filter((o) => o !== null).length} marcas; mejor ×${best.x.toFixed(3)} con RMSE ${(best.v * 100).toFixed(1)} cm en ${best.evals.length} corridas; con ×1: RMSE ${(f1.rmse * 100).toFixed(1)} cm, sesgo ${(f1.bias * 100).toFixed(1)} cm`, pass: Math.abs(best.x - HIDDEN_MULT) < 0.06 && best.v < 0.05 && f1.bias < 0 });
}

// ---------------------------------------------------------------- M24 daños y daño anual esperado
if (want('M24')) {
  const ex = ead([{ T: 10, D: 0 }, { T: 100, D: 100 }, { T: 500, D: 200 }]);
  const exA = 0.5 * 100 * (0.1 - 0.01) + 0.5 * 300 * (0.01 - 0.002) + 200 * 0.002;
  const f = [0, 0.25, 0.5, 1.25, 7].map(damageFrac);
  const pts = [10, 100, 500].map((T) => ({ T, D: damageOf(new Run(eadRun(T)).runAll()).total }));
  record({ id: 'M24', name: 'Curva profundidad-daño y daño anual esperado', tolerance: 'regla del trapecio exacta en un caso a mano (con la cola del periodo mayor); la curva interpola y llega a 1; el daño crece con el periodo de retorno', measured: `DAE ${ex.total.toFixed(4)} (a mano ${exA.toFixed(4)}); curva ${f.map((x) => x.toFixed(3)).join(', ')}; daño 10/100/500 años ${pts.map((p) => p.D.toFixed(0)).join(' / ')} m²`, pass: Math.abs(ex.total - exA) < 1e-12 && f[0] === 0 && Math.abs(f[1] - 0.245) < 1e-9 && Math.abs(f[3] - 0.775) < 1e-9 && f[4] === 1 && pts[0].D <= pts[1].D && pts[1].D < pts[2].D && EAD_PERIODS.length === 7 });
}

// ---------------------------------------------------------------- M25 zonificación de la amenaza (ejercicio)
if (want('M25')) {
  const cases: [number, number, number, number][] = [
    [0.3, 0.3, 0.09, 1],
    [0.7, 0.3, 0.21, 2],
    [0.3, 0.6, 0.18, 2],
    [0.4, 0.55, 0.22, 2],
    [1.2, 0.2, 0.24, 3],
    [0.4, 0.9, 0.36, 3],
    [0.6, 0.7, 0.42, 2],
    [0.02, 0, 0, 0],
  ];
  const got = cases.map(([h, v, hv]) => intensity(h, v, hv));
  const z = [zoneOf(2, 1), zoneOf(1, 1), zoneOf(0, 3), zoneOf(0, 2), zoneOf(0, 1), zoneOf(0, 0)];
  const r30 = new Run(eadRun(30)).runAll(), r100 = new Run(eadRun(100)).runAll();
  const areas = zoneAreas(r100.geom, zoneMap(r30, r100));
  record({ id: 'M25', name: 'Intensidad y zonificación de la amenaza (ejercicio)', tolerance: 'umbrales de profundidad, velocidad y su producto (0,5/0,5/0,225 y 1,0/0,8/0,45) y la matriz con 30 y 100 años dan la clase esperada; el barrio tiene zonas de amenaza con la creciente de 100 años', measured: `${cases.map(([h, v], k) => `h ${h}, v ${v} → ${got[k]}`).join('; ')}; matriz ${z.join(',')}; barrio sin/baja/media/alta ${areas.join(' / ')} m²`, pass: got.every((g, k) => g === cases[k][3]) && z.join(',') === '3,2,3,2,1,0' && areas[1] + areas[2] + areas[3] > 1000 });
}

// ---------------------------------------------------------------- M26 GeoTIFF, shapefile y ZIP
if (want('M26')) {
  const w = 12, h = 9, data = Float32Array.from({ length: w * h }, (_, k) => 1480 + k * 0.25);
  data[3] = NaN;
  const tif = geotiff(w, h, data, { E0: 4_200_000, N0: 2_000_000, px: 2 });
  const back = await readDem(tif.buffer.slice(0) as ArrayBuffer, 'prueba.tif');
  let worst = 0;
  for (let k = 0; k < w * h; k++) if (k !== 3) worst = Math.max(worst, Math.abs(back.domain.z[k] - data[k]));
  const z = zip([{ name: 'a.txt', data: 'hola' }, { name: 'b/c.bin', data: new Uint8Array([1, 2, 3]) }]);
  const dv = new DataView(z.buffer);
  const eocd = z.length - 22;
  const pkg = hecrasPackage(baseRun(), truth().mdt, {}, [{ name: 'cauce', c: 5 }]);
  const pdv = new DataView(pkg.buffer);
  const nFiles = pdv.getUint16(pkg.length - 22 + 10, true);
  record({ id: 'M26', name: 'GeoTIFF, shapefile y ZIP para HEC-RAS', tolerance: 'el GeoTIFF se lee con geotiff.js con las mismas cotas, el «sin dato», el píxel y la esquina; CRC-32 de «123456789» = cbf43926; el ZIP termina en su directorio central con el número de archivos; el paquete trae terreno, coberturas, 4 shapefiles de 5 archivos, 2 CSV y el LEAME', measured: `${back.domain.NX} × ${back.domain.NY}, píxel ${back.domain.px} m, esquina ${back.domain.E0}, ${back.domain.N0}, EPSG ${back.domain.epsg}; peor diferencia ${worst}; sin dato ${Number.isNaN(back.domain.z[3])}; CRC ${crc32(new TextEncoder().encode('123456789')).toString(16)}; ZIP ${dv.getUint32(eocd, true).toString(16)} con ${dv.getUint16(eocd + 10, true)} archivos; paquete ${nFiles} archivos`, pass: worst === 0 && back.domain.NX === w && back.domain.NY === h && back.domain.px === 2 && back.domain.E0 === 4_200_000 && back.domain.N0 === 2_000_000 && back.domain.epsg === 9377 && Number.isNaN(back.domain.z[3]) && crc32(new TextEncoder().encode('123456789')) === 0xcbf43926 && dv.getUint32(eocd, true) === 0x06054b50 && dv.getUint16(eocd + 10, true) === 2 && nFiles === 2 + 1 + 4 * 5 + 2 + 1 });
}

// ---------------------------------------------------------------- M27 un terreno propio en el navegador
if (want('M27')) {
  const ex = exampleDem();
  const { domain, info } = await readDem(ex.bytes.buffer.slice(0) as ArrayBuffer, 'ejemplo.tif');
  registerDomain(domain);
  const o: RunOpts = { ...baseRun(), site: { id: domain.id, n: 0.04, cn: 80 }, bcs: [{ side: 'O', from: 60, to: 180, kind: 'caudal', slope: 0.006 }, { side: 'E', from: 60, to: 180, kind: 'normal', slope: 0.006 }], mesh: { c: 6, subgrid: true, breaklines: false }, eq: 'inercia', dtMode: 'courant', dt: 10, courantMax: 0.7, hydro: { Qp: 20, tp: 1, Qb: 20 }, warmup: 30, duration: 20, outEvery: 60 };
  const r = new Run(o).runAll();
  const qo = r.series.qout[r.series.qout.length - 1];
  record({ id: 'M27', name: 'Terreno propio: GeoTIFF cargado, malla y corrida', tolerance: 'el ejemplo se lee igual que se escribió; la malla cubre el terreno; con 20 m³/s constantes, a la hora sale lo mismo que entra (±2 %) con el volumen conservado', measured: `${info.width} × ${info.height} píxeles de ${info.px} m; ${r.geom.NC} celdas de ${r.geom.c} m; salida ${qo.toFixed(2)} m³/s; volumen ${r.vol.errPct.toExponential(1)} %`, pass: info.width === ex.NX && r.geom.NC === 60 * 40 && !r.unstable && rel(qo, 20) < 0.02 && Math.abs(r.vol.errPct) < 1e-3 });
}

// ---------------------------------------------------------------- M28 mapas de diagnóstico
if (want('M28')) {
  let cmax = 0;
  for (const v of runDW().courantCell) cmax = Math.max(cmax, v);
  const tight = new Run(baseRun({ eq: 'difusiva', dtMode: 'fijo', dt: 30, maxIter: 2, tolWS: 0.0005 })).runAll();
  let nc = 0, ie = 0;
  for (let i = 0; i < tight.geom.NC; i++) {
    if (tight.nonconvCell[i] > 0) nc++;
    ie = Math.max(ie, tight.iterErr[i]);
  }
  record({ id: 'M28', name: 'Mapas de diagnóstico: Courant e iteraciones', tolerance: 'el mayor Courant por celda coincide con el de la corrida; con 2 iteraciones y una tolerancia de 0,5 mm aparecen celdas sin converger y su error coincide con el mayor del registro', measured: `Courant ${cmax.toFixed(3)} / ${runDW().courantMax.toFixed(3)}; ${tight.iters.nonconv} pasos sin converger, ${nc} celdas marcadas, error ${(ie * 1000).toFixed(2)} / ${(tight.iters.maxErr * 1000).toFixed(2)} mm`, pass: Math.abs(cmax - runDW().courantMax) < 1e-5 * runDW().courantMax && tight.iters.nonconv > 0 && nc > 0 && Math.abs(ie - tight.iters.maxErr) < 1e-6 * tight.iters.maxErr });
}

void designHydro;
void RISK_MESH;

finish(DOC, 'Pruebas de la sala «Modelación hidráulica 2D»', 'npm run test:model2d');

void NY;
void cellWetArea;
void eqRun;

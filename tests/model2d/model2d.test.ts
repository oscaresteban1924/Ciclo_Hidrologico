// Pruebas de la sala «Modelación hidráulica 2D»: tablas subgrid, remuestreo, conducción, lago en reposo,
// conservación del volumen, rotura de presa contra Ritter, Gumbel y riesgo, onda difusiva frente a inercia local,
// inestabilidad del esquema explícito, flujo permanente, sensibilidad al terreno y al subgrid, herramientas,
// escenas y retos.

import { record, rel, robust, finish } from '../harness';
import { NX, NY, PIXELS, terrainFor, truth, resample, upsample, meanCapacity, leveeLoss, bridgeOpening } from '../../src/model2d/terrain';
import { Run, buildGeometry, cellLevel, cellVolume, cellWetArea, faceProps, normalN, type RunOpts } from '../../src/model2d/solver';
import { damBreak, ritterH } from '../../src/model2d/dambreak';
import { AMS, AMS_FIT, fitGumbel, gumbelK, periodForRisk, quantile, risk } from '../../src/model2d/hydrology';
import { DEFAULT_COVER, DEFAULT_EQ, DEFAULT_MODEL, DEFAULT_RETURN, DEFAULT_TERRAIN_SCENE, LIDAR_BURNED, baseRun, coverRun, eqReference, eqRun, hazardClass, modelRun, returnRun, summarize, terrainScene } from '../../src/model2d/scene';
import { MODEL2D_TOOLS } from '../../src/model2d/design';

const DOC = 'docs/modelo2d/PRUEBAS.md';
const rough = { n: normalN(), mult: 1, buildings: 'n' as const };

// ---------------------------------------------------------------- M1 curva cota-volumen exacta
{
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
{
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
{
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
{
  const g = buildGeometry(LIDAR_BURNED, { c: 20, subgrid: true, breaklines: false }, rough);
  let worst = 0;
  for (const f of [3, 140, 300, 615]) {
    for (const h of [0.2, 1.1, 2.7, 5.9]) {
      const eta = g.fzmin[f] + h;
      let A = 0, K = 0;
      for (let k = 0; k < g.c; k++) {
        const d = eta - g.fz[f * g.c + k];
        if (d > 0) {
          A += d;
          K += Math.pow(d, 5 / 3) / g.fn[f * g.c + k];
        }
      }
      const p = faceProps(g, f, eta);
      worst = Math.max(worst, rel(p.K, K), rel(p.A, A));
    }
  }
  // cara plana de ancho b con n uniforme: K = b·h^(5/3)/n
  const gf = buildGeometry(LIDAR_BURNED, { c: 20, subgrid: false, breaklines: false }, { n: normalN(), mult: 1, buildings: 'n' });
  const f = 100;
  const h = 1.2, nn = gf.fn[f * gf.c];
  const Kp = faceProps(gf, f, gf.fzmin[f] + h).K, Ka = (gf.c * Math.pow(h, 5 / 3)) / nn;
  record({ id: 'M4', name: 'Tablas de área y conducción de las caras', tolerance: 'la tabla reproduce la suma por franjas (< 1,5 %, interpolación cada 10 cm) y una cara plana da K = b·h^(5/3)/n (< 1 %)', measured: `peor diferencia ${(worst * 100).toFixed(2)} %; cara plana ${Kp.toFixed(2)} frente a ${Ka.toFixed(2)}`, pass: worst < 0.015 && rel(Kp, Ka) < 0.01 });
}

// ---------------------------------------------------------------- M5 lago en reposo
const lake = (eq: 'inercia' | 'difusiva') => {
  const o: RunOpts = { ...baseRun(), eq, dtMode: 'fijo', dt: eq === 'inercia' ? 0.5 : 10, hydro: { Qp: 0, tp: 30, Qb: 0 }, outSlope: 0, warmup: 0, duration: 5 };
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
{
  const dLI = lake('inercia'), dDW = lake('difusiva');
  record({ id: 'M5', name: 'Lago en reposo sobre el terreno irregular', tolerance: 'con el agua quieta a una cota y los bordes cerrados, ningún nivel cambia más de 1 mm en 5 min (inercia local y onda difusiva)', measured: `inercia ${(dLI * 1000).toExponential(2)} mm; difusiva ${(dDW * 1000).toExponential(2)} mm`, pass: dLI < 1e-3 && dDW < 1e-3 });
}

// ---------------------------------------------------------------- M6 conservación del volumen
const runLI = new Run(baseRun()).runAll();
const runDW = new Run(baseRun({ eq: 'difusiva', dtMode: 'fijo', dt: 20 })).runAll();
{
  record({ id: 'M6', name: 'Conservación del volumen en la creciente de 100 años', tolerance: 'error de volumen < 0,01 % con los dos esquemas; volumen recortado < 0,01 % de lo que entró', measured: `inercia ${runLI.vol.errPct.toExponential(2)} %, recorte ${runLI.vol.clipped.toFixed(1)} m³; difusiva ${runDW.vol.errPct.toExponential(2)} %, recorte ${runDW.vol.clipped.toFixed(1)} m³ de ${runDW.vol.vin.toFixed(0)} m³`, pass: Math.abs(runLI.vol.errPct) < 0.01 && Math.abs(runDW.vol.errPct) < 0.01 && runLI.vol.clipped < 1e-4 * runLI.vol.vin && runDW.vol.clipped < 1e-4 * runDW.vol.vin });
}

// ---------------------------------------------------------------- M7 Ritter
{
  const d = damBreak(2, 20);
  const exactMid = ritterH(2, 0, 20);
  record({ id: 'M7', name: 'Rotura de presa contra la solución de Ritter', tolerance: 'en la presa h = 4·h0/9 exacto; aguas someras completas con error medio < 5 %; la inercia local se aleja más (más de 15 %)', measured: `h(0) = ${exactMid.toFixed(4)} (4h0/9 = ${((4 * 2) / 9).toFixed(4)}); completas ${(d.errSWE * 100).toFixed(1)} %, inercia ${(d.errLI * 100).toFixed(1)} %`, pass: Math.abs(exactMid - 8 / 9) < 1e-9 && d.errSWE < 0.05 && d.errLI > 0.15 });
}

// ---------------------------------------------------------------- M8 Gumbel y riesgo
{
  const K = gumbelK(100), R = risk(100, 50), T = periodForRisk(0.1, 50);
  const fit = fitGumbel(AMS.map((a) => a.Q));
  record({ id: 'M8', name: 'Gumbel por momentos y riesgo', tolerance: 'K₁₀₀ = 3,1367 (±0,001); R(100, 50) = 0,3950 (±0,001); T para 10 % en 50 años = 475 (±1); Q₁₀₀ = media + K·desviación', measured: `K = ${K.toFixed(4)}, R = ${R.toFixed(4)}, T = ${T.toFixed(1)}, Q₁₀₀ = ${quantile(fit, 100).toFixed(2)} m³/s (media ${fit.mean.toFixed(2)}, desv. ${fit.sd.toFixed(2)})`, pass: Math.abs(K - 3.1367) < 1e-3 && Math.abs(R - 0.395) < 1e-3 && Math.abs(T - 475.06) < 1 && rel(quantile(fit, 100), fit.mean + K * fit.sd) < 1e-12 });
}

// ---------------------------------------------------------------- M9 onda difusiva frente a inercia local
{
  const a = summarize(runLI), b = summarize(runDW);
  record({ id: 'M9', name: 'Onda difusiva (implícita) frente a inercia local (explícita)', tolerance: 'nivel máximo en el puente a menos de 5 cm; caudal pico bajo el puente a menos de 3 %', measured: `puente ${a.wseBridge.toFixed(3)} y ${b.wseBridge.toFixed(3)} m; pico ${a.qBridge.toFixed(2)} y ${b.qBridge.toFixed(2)} m³/s`, pass: Math.abs(a.wseBridge - b.wseBridge) < 0.05 && rel(a.qBridge, b.qBridge) < 0.03 });
}

// ---------------------------------------------------------------- M10 inestabilidad del explícito y pasos largos del implícito
{
  const bad = new Run(baseRun({ mesh: { c: 10, subgrid: true, breaklines: true }, dtMode: 'fijo', dt: 3 })).runAll();
  const long = new Run(baseRun({ eq: 'difusiva', dtMode: 'fijo', dt: 60 })).runAll();
  const ref = summarize(runLI), lg = summarize(long);
  record({ id: 'M10', name: 'Paso de tiempo: explícito inestable, implícito con Courant alto', tolerance: 'inercia local con Δt fijo de 3 s en celdas de 10 m: se detecta la inestabilidad; onda difusiva con Δt = 60 s (Courant > 3): estable y a menos de 5 cm en el puente', measured: `explícito: ${bad.unstable ? `inestable a los ${(bad.unstable.t / 60).toFixed(1)} min` : 'estable'}; implícito: Courant ${long.courantMax.toFixed(1)}, ${long.unstable ? 'inestable' : 'estable'}, puente ${lg.wseBridge.toFixed(3)} m`, pass: !!bad.unstable && !long.unstable && long.courantMax > 3 && Math.abs(lg.wseBridge - ref.wseBridge) < 0.05 });
}

// ---------------------------------------------------------------- M11 flujo permanente: entra lo que sale
{
  const o = baseRun({ hydro: { Qp: 30, tp: 1, Qb: 30 }, warmup: 40, duration: 20 });
  const r = new Run(o).runAll();
  const qo = r.series.qout[r.series.qout.length - 1], qb = r.series.qBridge[r.series.qBridge.length - 1];
  record({ id: 'M11', name: 'Flujo permanente con caudal constante', tolerance: 'después de una hora con 30 m³/s, la salida y el puente llevan 30 m³/s (±2 %)', measured: `salida ${qo.toFixed(2)} m³/s, puente ${qb.toFixed(2)} m³/s`, pass: rel(qo, 30) < 0.02 && rel(qb, 30) < 0.02 });
}

// ---------------------------------------------------------------- M12 sensibilidad: subgrid y terreno
{
  const ref = summarize(new Run(eqReference()).runAll());
  const sg40 = summarize(new Run(eqRun({ ...DEFAULT_EQ, c: 40, subgrid: true })).runAll());
  const fl40 = summarize(new Run(eqRun({ ...DEFAULT_EQ, c: 40, subgrid: false })).runAll());
  const p30 = summarize(new Run(baseRun({ terrain: { surf: 'mdt', p: 30, method: 'promedio', sigma: 0, burn: false } })).runAll());
  const base = summarize(runLI);
  record({ id: 'M12', name: 'Celdas grandes con y sin subgrid; terreno de 30 m', tolerance: 'con celdas de 40 m, el subgrid queda a menos de 15 cm de la referencia de 10 m y sin subgrid a más de 30 cm; el terreno de 30 m inunda más el barrio que el de 1 m', measured: `referencia ${ref.wseBridge.toFixed(2)} m; 40 m con subgrid ${(sg40.wseBridge - ref.wseBridge).toFixed(2)} m, sin subgrid ${(fl40.wseBridge - ref.wseBridge).toFixed(2)} m; barrio ${base.townArea} m² (1 m) y ${p30.townArea} m² (30 m)`, pass: Math.abs(sg40.wseBridge - ref.wseBridge) < 0.15 && fl40.wseBridge - ref.wseBridge > 0.3 && p30.townArea > base.townArea });
}

// ---------------------------------------------------------------- M13 amenaza H1–H6
{
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
{
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
{
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

finish(DOC, 'Pruebas de la sala «Modelación hidráulica 2D»', 'npm run test:model2d');

void NY;
void cellWetArea;
void eqRun;

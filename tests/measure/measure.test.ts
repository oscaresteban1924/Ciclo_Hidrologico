// Pruebas de la sala «Medir el agua»: relaciones Z-R, el balancín contra una simulación de sus vuelcos, el aguacero,
// el perfil de velocidades y las reglas de 0,6 y de 0,2 y 0,8, el aforo por sección media, la curva de gasto, el
// Venturi y la placa de orificio, y las herramientas de diseño, cada una con su tolerancia declarada.

import { finish, record, rel, robust } from '../harness';
import { BED, GAUGINGS, TIP_MM, TIP_S, ZR, bedZ, bestH0, cOrifice, correctIntensity, dbz, fitRating, gauge, gaugeIntensity, meterDp, meterFlow, pointVelocity, rainFromDbz, storm, trueFlow, verticalMean, type ZRKey } from '../../src/measure/measure';
import { calcBalancin, calcMedidor, calcMolinete, calcZR, preCurva, preMedidor, preRed } from '../../src/measure/design';
import { DEFAULT_PIPE, DEFAULT_RAIN, DEFAULT_RIVER, pipeScene, rainScene, riverScene } from '../../src/measure/scene';
import { planFor } from '../../src/canals/designPlans';
import { chartSVG } from '../../src/canals/plan';

// M1) Relaciones Z-R
{
  let worst = 0;
  for (const k of Object.keys(ZR) as ZRKey[]) for (const R of [0.5, 5, 30, 120]) worst = Math.max(worst, rel(rainFromDbz(dbz(R, k), k), R));
  const r40 = rainFromDbz(40, 'mp'), r50 = rainFromDbz(50, 'mp');
  record({
    id: 'M1',
    name: 'Relaciones Z-R: ida y vuelta, y Marshall-Palmer con 40 y 50 dBZ',
    tolerance: 'la lluvia vuelve igual desde su reflectividad (1e-9); con Marshall-Palmer, 40 dBZ son 11,53 mm/h y 50 dBZ son 48,6 mm/h (valores de tabla) con 0,5 %',
    measured: `ida y vuelta ${worst.toExponential(1)}; 40 dBZ → ${r40.toFixed(2)} mm/h; 50 dBZ → ${r50.toFixed(2)} mm/h`,
    pass: worst < 1e-9 && rel(r40, 11.53) < 0.005 && rel(r50, 48.6) < 0.005,
  });
}

// M2) El balancín contra una simulación de sus vuelcos
{
  // se llena el cubo, se vuelca durante τ (el agua que cae mientras tanto se pierde) y se cuenta
  const sim = (I: number) => {
    const dt = 0.01 / 3600; // pasos de 0,01 s en horas
    const steps = 360000, busySteps = Math.round(TIP_S / 0.01);
    let fill = 0, busy = 0, tips = 0;
    for (let k = 0; k < steps; k++) {
      if (busy > 0) {
        busy--;
        continue;
      }
      fill += I * dt;
      if (fill >= TIP_MM - 1e-12) {
        tips++;
        fill = 0;
        busy = busySteps;
      }
    }
    return tips * TIP_MM;
  };
  const cases = [20, 80, 150].map((I) => ({ I, f: gaugeIntensity(I, 0), s: sim(I) }));
  const worst = Math.max(...cases.map((c) => Math.abs(c.f - c.s)));
  let inv = 0;
  for (const I of [5, 50, 140]) for (const u of [0, 4, 9]) inv = Math.max(inv, rel(correctIntensity(gaugeIntensity(I, u), u), I));
  record({
    id: 'M2',
    name: 'Balancín: la fórmula del tiempo de vuelco contra una simulación vuelco a vuelco, y su corrección',
    tolerance: 'la intensidad de la fórmula y la simulada (pasos de 0,01 s durante una hora) difieren en dos vuelcos (0,4 mm/h) o menos; la corrección devuelve la lluvia real (1e-9)',
    measured: cases.map((c) => `${c.I} mm/h: fórmula ${c.f.toFixed(2)}, simulada ${c.s.toFixed(2)}`).join('; ') + `; corrección ${inv.toExponential(1)}`,
    pass: worst <= 2 * TIP_MM + 1e-9 && inv < 1e-9,
  });
}

// M3) El aguacero
{
  const s = storm(60, 3);
  const mono = s.tips.every((t, k) => k === 0 || t >= s.tips[k - 1]);
  record({
    id: 'M3',
    name: 'Aguacero triangular: lluvia total, vuelcos y lo que registra el balancín',
    tolerance: 'lluvia total igual a Ip·T/2 = 30 mm (1e-9); los vuelcos nunca bajan; lo registrado es menor que lo real y queda dentro de un vuelco de la integral de la intensidad registrada',
    measured: `real ${s.total.toFixed(6)} mm, registrado ${s.totalM.toFixed(2)} mm (${s.tips[s.tips.length - 1]} vuelcos), integral ${s.Pm[s.Pm.length - 1].toFixed(3)} mm`,
    pass: Math.abs(s.total - 30) < 1e-9 && mono && s.totalM < s.total && s.Pm[s.Pm.length - 1] - s.totalM < TIP_MM + 1e-9 && s.Pm[s.Pm.length - 1] - s.totalM >= 0,
  });
}

// M4) El perfil de velocidades y las reglas del molinete
{
  const h = 1.8, x = 0;
  const d = h - bedZ(x), vbar = verticalMean(x, h);
  const n = 20000;
  let s = 0;
  for (let k = 0; k < n; k++) s += pointVelocity(x, ((k + 0.5) / n) * d, h);
  const mean = s / n;
  const r06 = pointVelocity(x, 0.4 * d, h) / vbar;
  const r28 = (pointVelocity(x, 0.8 * d, h) + pointVelocity(x, 0.2 * d, h)) / 2 / vbar;
  const t06 = (7 / 6) * Math.pow(0.4, 1 / 6), t28 = ((7 / 6) * (Math.pow(0.8, 1 / 6) + Math.pow(0.2, 1 / 6))) / 2;
  record({
    id: 'M4',
    name: 'Perfil potencial 1/6: su promedio es la velocidad media; la regla de 0,6 y la de 0,2 y 0,8',
    tolerance: 'el promedio numérico del perfil iguala la media de la vertical con 1e-4; la lectura a 0,6 de la profundidad da 1,0014·v̄ y el promedio a 0,2 y 0,8 da 1,0081·v̄ (valores cerrados) con 1e-9',
    measured: `promedio/v̄ = ${(mean / vbar).toFixed(6)}; 0,6 → ${r06.toFixed(5)}; 0,2 y 0,8 → ${r28.toFixed(5)}`,
    pass: rel(mean, vbar) < 1e-4 && Math.abs(r06 - t06) < 1e-9 && Math.abs(r28 - t28) < 1e-9 && Math.abs(t06 - 1.0014) < 5e-5 && Math.abs(t28 - 1.0081) < 5e-5,
  });
}

// M5) Área de la sección y convergencia del aforo
{
  // área exacta con el nivel de la orilla: trapecios del polígono del fondo bajo la superficie
  const h = 2.75;
  let Aex = 0;
  for (let k = 1; k < BED.length; k++) {
    const [x0, z0] = BED[k - 1], [x1, z1] = BED[k];
    const d0 = h - z0, d1 = h - z1;
    if (d0 <= 0 && d1 <= 0) continue;
    if (d0 >= 0 && d1 >= 0) Aex += ((d0 + d1) / 2) * (x1 - x0);
    else {
      const xc = x0 + (d0 / (d0 - d1)) * (x1 - x0);
      Aex += d0 > 0 ? (d0 / 2) * (xc - x0) : (d1 / 2) * (x1 - xc);
    }
  }
  const t = trueFlow(h);
  const g60 = gauge(1.5, 60, '06'), Q15 = trueFlow(1.5).Q;
  record({
    id: 'M5',
    name: 'Área de la sección con el nivel de la orilla y aforo con muchas verticales',
    tolerance: 'el área de las 2 000 franjas iguala la de los trapecios del fondo con 0,1 %; con 60 verticales la sección media se acerca al caudal verdadero con 1 %',
    measured: `área ${t.A.toFixed(3)} m² (trapecios ${Aex.toFixed(3)}); aforo de 60 verticales ${g60.Q.toFixed(3)} m³/s, verdadero ${Q15.toFixed(3)}`,
    pass: rel(t.A, Aex) < 0.001 && rel(g60.Q, Q15) < 0.01,
  });
}

// M6) Curva de gasto
{
  const a = 5, h0 = 0.3, b = 2.2;
  const syn = [0.6, 0.9, 1.2, 1.6, 2.0, 2.5].map((h) => ({ h, Q: a * Math.pow(h - h0, b) }));
  const r = bestH0(syn);
  const real = bestH0(GAUGINGS);
  const manual = fitRating(GAUGINGS, 0);
  record({
    id: 'M6',
    name: 'Curva de gasto: recupera una ley potencial exacta y se ajusta a los aforos de la escena',
    tolerance: 'con datos exactos recupera h0 con 0,01 m, b con 0,01 y a con 1 %; con los aforos de la escena, el mejor h0 queda a 0,1 m del cero real (0,35 m), su error típico es de 6 % o menos y es menor que con h0 = 0',
    measured: `exactos: h0 ${r.h0.toFixed(2)}, b ${r.b.toFixed(4)}, a ${r.a.toFixed(4)}; escena: h0 ${real.h0.toFixed(2)}, error ${(real.se * 100).toFixed(1)} % (con h0 = 0: ${(manual.se * 100).toFixed(1)} %)`,
    pass: Math.abs(r.h0 - h0) <= 0.01 + 1e-9 && Math.abs(r.b - b) < 0.01 && rel(r.a, a) < 0.01 && Math.abs(real.h0 - 0.35) <= 0.1 && real.se <= 0.06 && real.se < manual.se,
  });
}

// M7) Venturi: Bernoulli y continuidad
{
  let worst = 0, trip = 0;
  for (const beta of [0.4, 0.55, 0.7])
    for (const Q of [0.002, 0.008, 0.015]) {
      const v = meterDp('venturi', Q, 0.1, beta);
      const ideal = (v.V2 ** 2 - v.V1 ** 2) / (2 * 9.81);
      worst = Math.max(worst, rel(v.dh, ideal / (v.C * v.C)));
      for (const k of ['venturi', 'orificio'] as const) trip = Math.max(trip, rel(meterFlow(k, meterDp(k, Q, 0.1, beta).dh, 0.1, beta), Q));
    }
  record({
    id: 'M7',
    name: 'Venturi contra Bernoulli y continuidad; ida y vuelta de los dos medidores',
    tolerance: 'Δh = (V2² − V1²)/(2g·C²) con 1e-9; el caudal calculado desde la lectura vuelve al caudal con 1e-6 (en la placa, iterando C)',
    measured: `Bernoulli ${worst.toExponential(1)}; ida y vuelta ${trip.toExponential(1)}`,
    pass: worst < 1e-9 && trip < 1e-6,
  });
}

// M8) Placa de orificio: Reader-Harris/Gallagher y pérdida permanente
{
  const betas = [0.3, 0.5, 0.7];
  const asym = Math.max(...betas.map((b) => Math.abs(cOrifice(b, 1e12) - (0.5961 + 0.0261 * b * b - 0.216 * b ** 8))));
  const dec = betas.every((b) => cOrifice(b, 1e4) > cOrifice(b, 1e5) && cOrifice(b, 1e5) > cOrifice(b, 1e6));
  const range = betas.every((b) => [1e4, 1e5, 1e6].every((Re) => cOrifice(b, Re) > 0.59 && cOrifice(b, Re) < 0.64));
  const loss = [0.3, 0.5, 0.7].map((b) => meterDp('orificio', 0.008, 0.1, b)).map((r) => r.loss / r.dh);
  const v = meterDp('venturi', 0.008, 0.1, 0.6);
  record({
    id: 'M8',
    name: 'Coeficiente de la placa (ISO 5167-2) y pérdidas permanentes',
    tolerance: 'con Reynolds muy alto C tiende a 0,5961 + 0,0261β² − 0,216β⁸ (1e-4); C baja al subir Re y queda entre 0,59 y 0,64; la pérdida de la placa es una fracción entre 0 y 1 de la lectura que baja con β; la del Venturi es el 10 %',
    measured: `asíntota ${asym.toExponential(1)}; baja con Re ${dec}; rango ${range}; pérdida de la placa ${loss.map((x) => x.toFixed(3)).join(', ')}; Venturi ${(v.loss / v.dh).toFixed(3)}`,
    pass: asym < 1e-4 && dec && range && loss.every((x) => x > 0 && x < 1) && loss[0] > loss[1] && loss[1] > loss[2] && Math.abs(v.loss / v.dh - 0.1) < 1e-12,
  });
}

// M9) Herramientas de diseño
{
  const rb = robust({ calcBalancin, calcZR, preRed, calcMolinete, preCurva, calcMedidor, preMedidor }, (R) => ({
    tips: Math.floor(R() * 200),
    min: 1 + R() * 60,
    u: R() * 12,
    d: 0.1 + R() * 0.4,
    tau: R() * 1,
    dbz: -5 + R() * 80,
    A: 1 + R() * 20000,
    terr: ['costera', 'montana', 'llanura', 'urbana', 'arida'][Math.floor(R() * 5)],
    modo: R() < 0.5 ? 'auto' : 'manual',
    h0: R() * 0.6,
    hq: 0.3 + R() * 3.5,
    tipo: R() < 0.5 ? 'venturi' : 'orificio',
    D: 60 + R() * 300,
    beta: 0.2 + R() * 0.6,
    dh: R() * 3000,
    Qmin: 0.5 + R() * 5,
    Qmax: 6 + R() * 40,
    hmax: 0.5 + R() * 5,
    hmin: R() * 80,
  }));
  const med = calcMedidor({});
  const okMed = Math.abs(Number(med.data?.Q) - 8) < 0.02;
  const pm = preMedidor({});
  const b = Number(pm.data?.beta);
  const okPm = meterDp('venturi', 0.015, 0.1, b).dh <= 3 + 1e-9 && meterDp('venturi', 0.015, 0.1, b - 0.01).dh > 3;
  const mol = calcMolinete({});
  const Qmol = Number(String(mol.outs[0].value).replace(' m³/s', '').replace(',', '.'));
  const okMol = rel(Qmol, gauge(1.5, 12, '0208').Q) < 0.02;
  const cur = preCurva({});
  const okCur = Math.abs(Number(cur.data?.h0) - bestH0(GAUGINGS).h0) < 1e-9;
  const runs = [calcBalancin, calcZR, preRed, calcMolinete, preCurva, calcMedidor, preMedidor];
  const charts = runs.map((run) => chartSVG(planFor(run, run({})).chart!));
  const okCharts = charts.every((c) => c.length > 200 && !/NaN|Infinity|undefined/.test(c));
  record({
    id: 'M9',
    name: 'Herramientas de diseño: datos al azar, medidor de la escena, β que llena la escala, molinete, curva de gasto y gráficas',
    tolerance: 'sin excepciones ni valores raros en 2 100 llamadas; la lectura de ejemplo del Venturi da los 8 L/s de la escena (±0,02); el β elegido deja el caudal máximo dentro de la escala y 0,01 menos no; el molinete de ejemplo da el aforo de la escena con 2 % (vueltas redondeadas); la curva automática usa el mejor h0; las siete gráficas se dibujan',
    measured: `${rb.calls} llamadas, ${rb.bad} con valores raros, ${rb.thrown} excepciones; Venturi ${Number(med.data?.Q).toFixed(3)} L/s; β ${b} ${okPm}; molinete ${Qmol} m³/s ${okMol}; curva ${okCur}; gráficas ${okCharts}`,
    pass: rb.bad === 0 && rb.thrown === 0 && okMed && okPm && okMol && okCur && okCharts,
  });
}

// M10) Escenas de partida
{
  const r = rainScene(DEFAULT_RAIN), v = riverScene(DEFAULT_RIVER), p = pipeScene(DEFAULT_PIPE);
  record({
    id: 'M10',
    name: 'Escenas de partida: el pluviómetro marca un poco menos, el radar se equivoca de relación, el aforo es aceptable y los medidores no cavitan',
    tolerance: 'el balancín marca entre 2 % y 8 % menos; el radar (relación estratiforme con lluvia convectiva) se equivoca 10 % o más; el aforo de 8 verticales queda a 5 % o menos; la curva con h0 = 0 tiene más error típico que la mejor; ni el Venturi ni la placa cavitan y las dos lecturas dan el caudal con 1 %',
    measured: `balancín ${(r.errGauge * 100).toFixed(1)} %; radar ${(r.errRadar * 100).toFixed(1)} %; aforo ${(v.err * 100).toFixed(1)} %; curva ${(v.fit.se * 100).toFixed(1)} % frente a ${(v.best.se * 100).toFixed(1)} %; Venturi ${p.Qv.toFixed(3)} y placa ${p.Qo.toFixed(3)} L/s`,
    pass: r.errGauge < -0.02 && r.errGauge > -0.08 && Math.abs(r.errRadar) >= 0.1 && Math.abs(v.err) <= 0.05 && v.fit.se > v.best.se && !p.cavV && !p.cavO && rel(p.Qv, 8) < 0.01 && rel(p.Qo, 8) < 0.01,
  });
}

finish('docs/medir/PRUEBAS_MEDIR.md', 'Pruebas de la sala «Medir el agua»', 'npm run test:measure');

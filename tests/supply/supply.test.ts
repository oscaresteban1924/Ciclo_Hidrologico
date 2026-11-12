// Pruebas de la sala «Acueducto: el agua a presión»: fricción, conducción por gravedad, redes y golpe de ariete,
// cada una con su tolerancia declarada.

import { finish, record, rel } from '../harness';
import { G, PIPE_MATS, colebrook, darcy, frictionFactor, gateK, hazenWilliams, nuWater, pipeline, swameeJain } from '../../src/supply/pipes';
import { hardyCross, solveGradient, type Network } from '../../src/supply/network';
import { PVC_RDE, hammer, joukowsky, michaud, waveSpeed } from '../../src/supply/hammer';
import { calcAriete, calcColebrook, calcPerdidas, calcRed, preCierre, preConduccion, preSector } from '../../src/supply/design';
import { planFor } from '../../src/canals/designPlans';
import { chartSVG } from '../../src/canals/plan';
import { robust } from '../harness';
import { DEFAULT_PIPE, barrio, dayFactor, pipeInput, DAY_CURVE } from '../../src/supply/scene';

// A1) Factor de fricción: Colebrook, Swamee-Jain y laminar
{
  const cb = colebrook(1e5, 1e-4).f;
  let worst = 0;
  for (const Re of [5e3, 2e4, 1e5, 1e6, 1e7]) for (const rr of [1e-6, 1e-5, 1e-4, 1e-3, 1e-2]) worst = Math.max(worst, rel(swameeJain(Re, rr), colebrook(Re, rr).f));
  const lam = frictionFactor(1000, 1e-3);
  const res = (() => {
    const { f } = colebrook(3e5, 2e-4);
    return Math.abs(1 / Math.sqrt(f) + 2 * Math.log10(2e-4 / 3.7 + 2.51 / (3e5 * Math.sqrt(f))));
  })();
  record({
    id: 'A1',
    name: 'Factor de fricción: Colebrook-White, Swamee-Jain y flujo laminar',
    tolerance: 'Colebrook con Re = 1e5 y ε/D = 1e-4 da 0,0185 (diagrama de Moody, ±0,5 %); la ecuación de Colebrook se cumple (residuo < 1e-10); Swamee-Jain queda a menos de 3 % de Colebrook en su rango (Re 5e3 a 1e7, ε/D 1e-6 a 1e-2); laminar f = 64/Re',
    measured: `Colebrook ${cb.toFixed(5)}; residuo ${res.toExponential(1)}; mayor diferencia de Swamee-Jain ${(worst * 100).toFixed(2)} %; laminar con Re 1000: ${lam.toFixed(4)}`,
    pass: rel(cb, 0.0185) < 0.005 && res < 1e-10 && worst < 0.03 && Math.abs(lam - 0.064) < 1e-12,
  });
}

// A2) Pérdidas: Darcy-Weisbach contra Hazen-Williams, viscosidad
{
  const Q = 0.02, D = 0.1522, L = 500;
  const dw = darcy(Q, D, L, PIPE_MATS.pvc.eps, nuWater(20)).hf;
  const hw = hazenWilliams(Q, D, L, PIPE_MATS.pvc.C);
  const hand = (10.67 * L * Math.pow(Q, 1.852)) / (Math.pow(150, 1.852) * Math.pow(D, 4.8704));
  const nu20 = nuWater(20), nu12 = nuWater(12.5);
  record({
    id: 'A2',
    name: 'Pérdidas por fricción: Darcy-Weisbach y Hazen-Williams',
    tolerance: 'Hazen-Williams igual a la fórmula a mano (1e-12); en PVC de 6" con 20 L/s, Darcy-Weisbach y Hazen-Williams (C = 150) difieren menos de 15 %; viscosidad del agua a 20 °C 1,004e-6 m²/s y a 12,5 °C entre la de 10 y 15 °C',
    measured: `Darcy ${dw.toFixed(3)} m, Hazen-Williams ${hw.toFixed(3)} m (diferencia ${(rel(hw, dw) * 100).toFixed(1)} %); ν(20) = ${nu20.toExponential(3)}, ν(12,5) = ${nu12.toExponential(3)}`,
    pass: Math.abs(hw - hand) < 1e-12 && rel(hw, dw) < 0.15 && Math.abs(nu20 - 1.004e-6) < 1e-12 && nu12 < nuWater(10) && nu12 > nuWater(15),
  });
}

// A3) Conducción por gravedad: energía, válvula y presiones
{
  const cases = [0.15, 0.3, 0.6, 1].map((open) => pipeline(pipeInput({ ...DEFAULT_PIPE, open })));
  const closure = Math.max(...cases.map((r) => Math.abs(r.closure)));
  const monoQ = cases.every((r, k) => k === 0 || r.Q > cases[k - 1].Q);
  const monoP = cases.every((r, k) => k === 0 || r.pEnd < cases[k - 1].pEnd);
  const r = cases[1];
  const sum = r.hfTot + r.hmTot + r.hValve + r.hv;
  const avail = r.inp.H0 - r.inp.profile[r.inp.profile.length - 1].z;
  const hwCase = pipeline(pipeInput({ ...DEFAULT_PIPE, method: 'hw' }));
  const Kmono = [0.1, 0.25, 0.5, 0.75, 1].every((o, k, a) => k === 0 || gateK(o) < gateK(a[k - 1]));
  record({
    id: 'A3',
    name: 'Conducción desde el tanque: la ecuación de energía se cierra y la válvula reparte la carga',
    tolerance: 'en la salida, energía = cota + V²/2g + pérdida en la válvula (cierre < 1e-9 m) con cuatro aperturas; la suma de pérdidas y la carga de velocidad es la carga disponible (1e-6); abrir la válvula sube el caudal y baja la presión al final; el K de la válvula baja al abrirla; Hazen-Williams da otro caudal, del mismo orden (±20 %)',
    measured: `cierre ${closure.toExponential(1)} m; con 30 %: Q ${(r.Q * 1000).toFixed(2)} L/s, pérdidas + V²/2g = ${sum.toFixed(4)} de ${avail.toFixed(4)} m; presión al final ${cases.map((c) => c.pEnd.toFixed(1)).join(' / ')} m; Hazen-Williams Q ${(hwCase.Q * 1000).toFixed(2)} L/s`,
    pass: closure < 1e-9 && Math.abs(sum - avail) < 1e-6 && monoQ && monoP && Kmono && rel(hwCase.Q, r.Q) < 0.2,
  });
}

// A4) Conducción: la loma pequeña y la presión negativa; presión estática
{
  const open = pipeline(pipeInput({ ...DEFAULT_PIPE, open: 1 }));
  const half = pipeline(pipeInput({ ...DEFAULT_PIPE, open: 0.2 }));
  const low = open.pts.reduce((a, p) => (p.p < a.p ? p : a));
  const stat = pipeline(pipeInput({ ...DEFAULT_PIPE, open: 0.1 }));
  record({
    id: 'A4',
    name: 'La línea piezométrica pasa bajo la loma cuando se abre la válvula',
    tolerance: 'con la válvula abierta la presión mínima es negativa y está en la loma (x = 245 m); con 20 % de apertura toda la tubería queda con presión positiva; la presión estática máxima es la cota del tanque menos la del punto más bajo (1e-12)',
    measured: `abierta: mínima ${open.pMin.toFixed(2)} m en x = ${low.x} m; con 20 %: mínima ${half.pMin.toFixed(2)} m; estática ${stat.pStatic.toFixed(2)} m`,
    pass: open.pMin < 0 && low.x === 245 && half.pMin > 0 && Math.abs(stat.pStatic - (DEFAULT_PIPE.H0 - 6)) < 1e-12,
  });
}

// A5) Red: método del gradiente contra Hardy Cross
{
  let dq = 0, mass = 0, energy = 0, itG = 0, itH = 0;
  for (const h of [3, 12, 19]) {
    const net = barrio(56);
    const g = solveGradient(net, dayFactor(h)), c = hardyCross(net, dayFactor(h));
    dq = Math.max(dq, ...net.pipes.map((p) => Math.abs(g.Q[p.id] - c.Q[p.id])));
    mass = Math.max(mass, g.massErr, c.massErr);
    energy = Math.max(energy, g.energyErr, c.energyErr);
    itG = Math.max(itG, g.iterations);
    itH = Math.max(itH, c.iterations);
  }
  record({
    id: 'A5',
    name: 'Red del barrio: el método del gradiente y Hardy Cross dan los mismos caudales',
    tolerance: 'en tres horas del día, los caudales de los dos métodos difieren menos de 0,001 L/s; en cada nudo entra lo que sale más la demanda (< 1e-9 L/s); en cada tubo la diferencia de cotas es su pérdida (< 1e-5 m); el gradiente converge en menos de 15 iteraciones',
    measured: `mayor diferencia ${dq.toExponential(1)} L/s; continuidad ${mass.toExponential(1)} L/s; energía ${energy.toExponential(1)} m; iteraciones: gradiente ${itG}, Hardy Cross ${itH}`,
    pass: dq < 1e-3 && mass < 1e-9 && energy < 1e-5 && itG < 15,
  });
}

// A6) Red: mallas, válvulas y una red de libro
{
  const c = hardyCross(barrio(56), 1);
  // cada malla: suma de pérdidas en su recorrido ≈ 0
  const loopSum = Math.max(...c.loops.map((l) => Math.abs(l.reduce((a, { pipe, dir }) => a + dir * c.h[pipe], 0))));
  const cut = solveGradient(barrio(56, 'P0'), 1);
  const valve = solveGradient(barrio(56, 'P7'), dayFactor(19)), open = solveGradient(barrio(56), dayFactor(19));
  // red de libro: dos tubos en paralelo entre el tanque y un nudo; el caudal se reparte con Q ∝ (D^4,87/L)^(1/1,852)
  const par: Network = {
    source: 'T',
    H0: 30,
    nodes: [
      { id: 'T', z: 0, q: 0, x: 0, y: 0 },
      { id: 'A', z: 0, q: 50, x: 1, y: 0 },
    ],
    pipes: [
      { id: 'a', a: 'T', b: 'A', L: 400, D: 0.2, C: 130 },
      { id: 'b', a: 'T', b: 'A', L: 900, D: 0.15, C: 130 },
    ],
  };
  const ps = solveGradient(par, 1);
  const ratio = ps.Q.a / ps.Q.b, expect = Math.pow(Math.pow(0.2, 4.8704) / 400 / (Math.pow(0.15, 4.8704) / 900), 1 / 1.852);
  record({
    id: 'A6',
    name: 'Mallas cerradas, nudos sin servicio y tubos en paralelo',
    tolerance: `${c.loops.length} mallas fundamentales con suma de pérdidas nula (< 1e-5 m); al cerrar la matriz los nueve nudos quedan sin servicio; cerrar un tubo de la red baja la presión mínima; dos tubos en paralelo se reparten el caudal según (D^4,87/L)^(1/1,852) (1e-6)`,
    measured: `mallas ${c.loops.length}, mayor suma ${loopSum.toExponential(1)} m; sin servicio ${cut.cut.length}; presión mínima ${Math.min(...Object.values(open.p).filter((x, i) => i > 0)).toFixed(2)} → ${Math.min(...Object.values(valve.p).filter((x, i) => i > 0)).toFixed(2)} m; reparto ${ratio.toFixed(5)} (esperado ${expect.toFixed(5)})`,
    pass: c.loops.length === 4 && loopSum < 1e-5 && cut.cut.length === 9 && Math.min(...Object.entries(valve.p).filter(([k]) => k !== 'T').map(([, v]) => v)) < Math.min(...Object.entries(open.p).filter(([k]) => k !== 'T').map(([, v]) => v)) && rel(ratio, expect) < 1e-6,
  });
}

// A7) Curva de consumo
{
  const mean = DAY_CURVE.reduce((a, x) => a + x, 0) / 24;
  const peak = Math.max(...DAY_CURVE), night = Math.min(...DAY_CURVE);
  record({
    id: 'A7',
    name: 'Curva de consumo del día',
    tolerance: 'promedio 1 (1e-12); pico entre 1,4 y 1,8 veces el promedio; mínimo de la madrugada menor de 0,5; la interpolación entre horas coincide en las horas enteras',
    measured: `promedio ${mean.toFixed(12)}; pico ${peak.toFixed(3)}; mínimo ${night.toFixed(3)}; f(7) = ${dayFactor(7).toFixed(4)} contra ${DAY_CURVE[7].toFixed(4)}`,
    pass: Math.abs(mean - 1) < 1e-12 && peak > 1.4 && peak < 1.8 && night < 0.5 && Math.abs(dayFactor(7) - DAY_CURVE[7]) < 1e-12,
  });
}

// A8) Celeridad de la onda (Korteweg)
{
  const acero = waveSpeed(0.5, 0.01, 'acero');
  const hand = Math.sqrt(2.19e9 / 998 / (1 + (2.19e9 * 0.5) / (207e9 * 0.01)));
  const pvc = waveSpeed(0.3, 0.3 / 21, 'pvc');
  const rigid = waveSpeed(0.3, 10, 'acero');
  record({
    id: 'A8',
    name: 'Celeridad de la onda de presión',
    tolerance: 'igual a la fórmula de Korteweg a mano (1e-9); acero entre 1 000 y 1 300 m/s; PVC entre 300 y 500 m/s; en un tubo muy rígido tiende a √(K/ρ) ≈ 1 480 m/s (±1 %)',
    measured: `acero D 0,5 m e 10 mm: ${acero.toFixed(1)} m/s (a mano ${hand.toFixed(1)}); PVC RDE 21: ${pvc.toFixed(1)} m/s; tubo rígido ${rigid.toFixed(1)} m/s`,
    pass: Math.abs(acero - hand) < 1e-9 && acero > 1000 && acero < 1300 && pvc > 300 && pvc < 500 && rel(rigid, Math.sqrt(2.19e9 / 998)) < 0.01,
  });
}

// A9) Golpe de ariete: cierre instantáneo sin fricción
{
  const base = { L: 600, D: 0.3, e: 0.0064, mat: 'acero' as const, H0: 60, V0: 0.5, f: 0, tc: 0, tEnd: 8, N: 40 };
  const r = hammer(base);
  const dH = r.maxV - r.Hv0, J = joukowsky(r.a, 0.5);
  // periodo: la cota en la válvula cambia de signo (respecto a H0) cada 2L/a
  const cross: number[] = [];
  for (let k = 1; k < r.t.length; k++) if ((r.Hv[k - 1] - r.Hv0) * (r.Hv[k] - r.Hv0) < 0) cross.push(r.t[k]);
  const T = cross.length >= 3 ? cross[2] - cross[0] : NaN;
  const sym = Math.abs(r.minV - (r.Hv0 - J));
  record({
    id: 'A9',
    name: 'Cierre instantáneo: Joukowsky y el periodo 4L/a',
    tolerance: 'sin fricción, la sobrepresión en la válvula es a·V/g (±0,1 %) y la depresión es la misma (±0,1 m); la presión cambia de signo cada 2L/a: el periodo es 4L/a (±2 %); no baja a la presión de vapor',
    measured: `a = ${r.a.toFixed(1)} m/s; sobrepresión ${dH.toFixed(3)} m contra ${J.toFixed(3)} m; mínimo ${r.minV.toFixed(2)} m (esperado ${(r.Hv0 - J).toFixed(2)}); periodo ${T.toFixed(3)} s contra ${r.period.toFixed(3)} s; vapor ${r.vapor ? 'sí' : 'no'}`,
    pass: rel(dH, J) < 1e-3 && sym < 0.1 && rel(T, r.period) < 0.02 && !r.vapor,
  });
}

// A10) Golpe de ariete: cierre lento, fricción y vapor
{
  const base = { L: 600, D: 0.3, e: 0.0064, mat: 'acero' as const, H0: 40, V0: 0.5, f: 0, tc: 0, tEnd: 8, N: 40 };
  const a = waveSpeed(0.3, 0.0064, 'acero');
  const out = [5, 10, 20].map((k) => {
    const tc = (k * 2 * 600) / a;
    const r = hammer({ ...base, tc, tEnd: tc + 6 });
    const kk = (600 * 0.5) / (G * 40 * tc);
    const allievi = 40 * (kk / 2) * (kk + Math.sqrt(kk * kk + 4));
    return { k, rise: r.maxV - r.Hv0, mich: michaud(600, 0.5, tc), allievi };
  });
  const between = out.every((o) => o.rise < o.mich && o.rise > o.allievi * 0.95);
  const amp = (r: ReturnType<typeof hammer>) => {
    const n = r.Hv.length;
    return [Math.max(...r.Hv.slice(0, Math.floor(n * 0.1))) - r.Hv0, Math.max(...r.Hv.slice(Math.floor(n * 0.8))) - r.Hv0];
  };
  const [f1, f2] = amp(hammer({ ...base, f: 0.02, tEnd: 30 }));
  const [n1, n2] = amp(hammer({ ...base, tEnd: 30 }));
  const decay = f2 < 0.9 * f1 && Math.abs(n2 - n1) < 1e-3 * n1;
  const vap = hammer({ ...base, V0: 1.5 });
  record({
    id: 'A10',
    name: 'Cierre lento entre Allievi y Michaud; la fricción amortigua; aviso de vapor',
    tolerance: 'con cierres de 5, 10 y 20 veces 2L/a, la sobrepresión calculada queda por debajo de Michaud (2LV/(g·tc), que la sobrestima) y no más de 5 % por debajo de la columna rígida de Allievi; en 30 s, sin fricción la oscilación no cambia (±0,1 %) y con f = 0,02 baja a menos del 90 % de la primera (la fricción permanente amortigua menos que en un tubo real); con 1,5 m/s la depresión llega a la presión de vapor y se avisa',
    measured: out.map((o) => `${o.k}·2L/a: ${o.rise.toFixed(2)} m (Allievi ${o.allievi.toFixed(2)}, Michaud ${o.mich.toFixed(2)})`).join('; ') + `; oscilación en 30 s: sin fricción ${n1.toFixed(2)} → ${n2.toFixed(2)} m, con fricción ${f1.toFixed(2)} → ${f2.toFixed(2)} m; vapor con 1,5 m/s: ${vap.vapor ? 'sí' : 'no'}`,
    pass: between && decay && vap.vapor,
  });
}

// A11) Golpe de ariete: el cálculo no depende de la malla y conserva la masa en el tubo cerrado
{
  const base = { L: 600, D: 0.3, e: 0.3 / 21, mat: 'pvc' as const, H0: 60, V0: 1, f: 0.015, tc: 3, tEnd: 12 };
  const r20 = hammer({ ...base, N: 20 }), r80 = hammer({ ...base, N: 80 });
  const diff = Math.abs(r20.maxV - r80.maxV);
  const closed = r80.Qv.slice(r80.t.findIndex((t) => t > base.tc) + 1).every((q) => Math.abs(q) < 1e-12);
  const ratings = PVC_RDE.every((c) => Math.abs(c.m - c.psi * 0.70307) < 0.1);
  record({
    id: 'A11',
    name: 'El golpe de ariete no depende del número de tramos; la válvula cerrada no deja pasar agua',
    tolerance: 'con 20 y con 80 tramos la mayor cota en la válvula difiere menos de 1 %; después del cierre el caudal en la válvula es 0 (1e-12); las clases de PVC convierten bien psi a metros (1 psi = 0,703 m)',
    measured: `máximo con 20 tramos ${r20.maxV.toFixed(2)} m, con 80 ${r80.maxV.toFixed(2)} m; caudal después del cierre ${closed ? '0' : 'distinto de 0'}; clases ${PVC_RDE.map((c) => `RDE ${c.rde}: ${c.m} m`).join(', ')}`,
    pass: diff / r80.maxV < 0.01 && closed && ratings,
  });
}

// A12) Herramientas de diseño: robustez, normas y gráficas
{
  const fns = { calcPerdidas, preConduccion, calcColebrook, calcRed, preSector, calcAriete, preCierre };
  const r = robust(fns, (R) => ({
    Q: R() * 80 - 5, D: R() * 600, L: R() * 3000, mat: ['pvc', 'acero', 'pead', 'x'][Math.floor(R() * 4)], K: R() * 20, T: R() * 50 - 5, H0: R() * 120, z: R() * 60, p: R() * 30,
    Re: R() * 1e7, rr: R() * 0.05, tubos: ['', 'T A 100 100 140', 'T A 100 100 140\nA B 50 80 140\nB T 80 80 140', 'x y z', 'T A -1 100 140'][Math.floor(R() * 5)], nudos: ['A 10 5', 'A 10 5\nB 8 2', '', 'A x 1'][Math.floor(R() * 4)],
    pob: ['mayor', 'menor'][Math.floor(R() * 2)], zHi: R() * 60, zLo: R() * 40, loss: R() * 20, e: R() * 30, V: R() * 4, tc: R() * 20, rde: ['21', '26', '32.5', '41', '7'][Math.floor(R() * 5)],
  }), 60);
  const sector = preSector({ zHi: 30, zLo: 5, loss: 8, pob: 'mayor' });
  const sector2 = preSector({ zHi: 50, zLo: 5, loss: 8, pob: 'mayor' });
  const red = calcRed({});
  const cierre = preCierre({});
  let charts = 0, badSvg = 0;
  for (const fn of Object.values(fns)) {
    const res = fn({});
    const ex = planFor(fn, res);
    if (ex.chart) {
      charts++;
      const svg = chartSVG(ex.chart, 420, 250);
      if (!svg.startsWith('<svg') || /NaN|undefined|Infinity/.test(svg)) badSvg++;
    }
  }
  const ok = r.thrown === 0 && r.bad === 0 && sector.checks?.[0].ok === true && sector2.checks?.[0].ok === false && !red.error && red.checks?.some((c) => c.name.includes('Art. 61')) && !cierre.error && cierre.checks?.[0].ok === true && charts === 7 && badSvg === 0;
  record({
    id: 'A12',
    name: 'Herramientas de diseño de la sala: sin errores, con los artículos del RAS y sus gráficas',
    tolerance: '60 juegos de datos al azar en las siete herramientas: ninguna excepción ni valores NaN, indefinidos o infinitos (salvo los avisos de datos inválidos); un sector de 25 m de desnivel cabe entre los Arts. 61 y 62 y uno de 45 m no; la red de ejemplo revisa el Art. 61; el cierre recomendado deja la presión dentro de la clase del tubo; las siete dibujan su gráfica sin valores inválidos',
    measured: `${r.calls} llamadas; excepciones ${r.thrown}; inválidos ${r.bad}; sector de 25 m: ${sector.checks?.[0].value}; de 45 m: ${sector2.checks?.[0].value}; cierre: ${cierre.outs[1]?.value}; gráficas ${charts}, con errores ${badSvg}`,
    pass: ok,
  });
}

finish('docs/acueducto/PRUEBAS_ACUEDUCTO.md', 'Pruebas de la sala «Acueducto: el agua a presión»', 'npm run test:supply');

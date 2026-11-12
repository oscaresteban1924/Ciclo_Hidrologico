// Pruebas de la sala «Aguas subterráneas»: Darcy, función de pozo, Theis y Cooper-Jacob, Thiem, transporte y zona de
// captura, cada una con su tolerancia declarada.

import { finish, record, rel } from '../harness';
import { SOILS, captureZone, cooperJacob, darcy, erfc, fitCooperJacob, ogataBanks, ogataBanksFlux, permConstant, permFalling, rand, stepParticles, theis, thiem, wellW, type Particle } from '../../src/ground/aquifer';
import { calcDarcy, calcOgata, calcPermeametro, calcPrueba, calcTheis, preCaptura, preProteccion, prePozo } from '../../src/ground/design';
import { planFor } from '../../src/canals/designPlans';
import { chartSVG } from '../../src/canals/plan';
import { robust } from '../harness';
import { AQ, aquifer, permArea, permFlow, pumpingTest, wellT, WELL } from '../../src/ground/scene';

// S1) Función de pozo
{
  const ref: [number, number][] = [[1e-4, 8.6332], [0.01, 4.0379], [0.1, 1.8229], [1, 0.2194], [5, 0.001148]];
  const worst = Math.max(...ref.map(([u, w]) => rel(wellW(u), w)));
  // continuidad entre la serie y la fracción continua en u = 1
  const jump = Math.abs(wellW(1 - 1e-9) - wellW(1 + 1e-9));
  record({
    id: 'S1',
    name: 'Función de pozo de Theis W(u)',
    tolerance: 'W(0,0001) = 8,6332, W(0,01) = 4,0379, W(0,1) = 1,8229, W(1) = 0,2194 y W(5) = 0,001148 (tablas de Theis, ±0,05 %); sin salto entre la serie y la fracción continua en u = 1 (< 1e-7)',
    measured: ref.map(([u]) => `W(${u}) = ${wellW(u).toPrecision(5)}`).join('; ') + `; salto ${jump.toExponential(1)}`,
    pass: worst < 5e-4 && jump < 1e-7,
  });
}

// S2) Theis, Cooper-Jacob y Thiem
{
  const Q = 864, T = 500, S = 1e-4, r = 50;
  const late = 10, early = 0.0005;
  const dLate = rel(cooperJacob(Q, T, S, r, late), theis(Q, T, S, r, late));
  const uEarly = (r * r * S) / (4 * T * early);
  const dEarly = rel(cooperJacob(Q, T, S, r, early), theis(Q, T, S, r, early));
  // Thiem: la diferencia de abatimientos entre dos pozos de observación coincide con Theis en tiempos largos
  const th = thiem(Q, T, 1000, 10) - thiem(Q, T, 1000, 100), tt = theis(Q, T, S, 10, 100) - theis(Q, T, S, 100, 100);
  record({
    id: 'S2',
    name: 'Theis, Cooper-Jacob y Thiem',
    tolerance: 'con u < 0,01 Cooper-Jacob queda a menos de 0,5 % de Theis; con u = 0,25 se aparta más de 10 %; en tiempos largos la diferencia de abatimiento entre 10 y 100 m es la de Thiem, Q·ln(10)/(2πT) (±0,1 %)',
    measured: `u = ${((r * r * S) / (4 * T * late)).toExponential(1)}: diferencia ${(dLate * 100).toFixed(3)} %; u = ${uEarly.toFixed(2)}: ${(dEarly * 100).toFixed(1)} %; Thiem ${th.toFixed(4)} m, Theis ${tt.toFixed(4)} m`,
    pass: dLate < 0.005 && dEarly > 0.1 && rel(tt, th) < 1e-3,
  });
}

// S3) Prueba de bombeo: el ajuste de Cooper-Jacob recupera T y S
{
  const s = { soil: 'arena' as const, Qls: 10, t: 2 };
  const pts = pumpingTest(s, 50);
  const fit = fitCooperJacob(pts, s.Qls * 86.4, 50);
  const T = wellT('arena');
  record({
    id: 'S3',
    name: 'Prueba de bombeo con error de lectura: Cooper-Jacob recupera T y S',
    tolerance: '18 lecturas de Theis con ±1 cm de error en el pozo a 50 m: T a menos de 5 % y S a menos de 25 % de los del acuífero',
    measured: fit ? `T ${fit.T.toFixed(1)} m²/día (verdadera ${T}); S ${fit.S.toExponential(2)} (verdadero ${WELL.S}); Δs ${fit.ds.toFixed(3)} m por ciclo` : 'sin ajuste',
    pass: !!fit && rel(fit.T, T) < 0.05 && rel(fit.S, WELL.S) < 0.25,
  });
}

// S4) Darcy y permeámetros
{
  const d = darcy(30, 0.01, 50, 0.28);
  const Q = (30 / 86400) * permArea() * 0.5 / 0.3;
  const Kc = permConstant(Q, 0.3, permArea(), 0.5) * 86400;
  const ml = permFlow('arena', 0.5);
  // carga variable: con K conocido, el descenso de h sigue h1 = h0·exp(−K·A·t/(a·L))
  const a = 1e-4, A = permArea(), L = 0.3, K = 0.1 / 86400, t = 3600, h0 = 1;
  const h1 = h0 * Math.exp((-K * A * t) / (a * L));
  const Kf = permFalling(a, L, A, t, h0, h1) * 86400;
  record({
    id: 'S4',
    name: 'Ley de Darcy y permeámetros',
    tolerance: 'q = K·i y v = q/ne (1e-12); el permeámetro de carga constante devuelve la K de la muestra (1e-12) y el de carga variable también (1e-9); 50 cm de carga en arena gruesa dan del orden de 5 mL/s',
    measured: `q ${d.q} m/día, v ${d.v.toFixed(4)} m/día, Q ${d.Q} m³/día; carga constante K = ${Kc.toFixed(6)} m/día; carga variable K = ${Kf.toFixed(6)} m/día; arena gruesa ${ml.toFixed(2)} mL/s`,
    pass: Math.abs(d.q - 0.3) < 1e-12 && Math.abs(d.v - 0.3 / 0.28) < 1e-12 && Math.abs(Kc - 30) < 1e-9 && Math.abs(Kf - 0.1) < 1e-9 && ml > 3 && ml < 7,
  });
}

// S5) Acuífero libre (Dupuit)
{
  const r = aquifer({ soil: 'arena', dh: 6 });
  const h1 = AQ.h2 + 6;
  // continuidad: q = −K·h·dh/dx igual en todo el tramo
  let worst = 0;
  for (const x of [50, 200, 400, 550]) {
    const e = 0.01, dhdx = (r.h(x + e) - r.h(x - e)) / (2 * e);
    worst = Math.max(worst, rel(-r.K * r.h(x) * dhdx, r.qx));
  }
  const order = (['grava', 'arena', 'arenafina', 'limo', 'arcilla'] as const).map((s) => aquifer({ soil: s, dh: 6 }).travel);
  record({
    id: 'S5',
    name: 'Acuífero libre entre la loma y el río (Dupuit)',
    tolerance: 'q = K·(h1² − h2²)/(2L) es el mismo en todo el tramo (±0,01 %); h(0) = h1 y h(L) = h2 (1e-12); el tiempo de viaje crece de la grava a la arcilla',
    measured: `q ${r.qx.toFixed(4)} m²/día, mayor desvío ${(worst * 100).toExponential(1)} %; h(0) ${r.h(0).toFixed(4)}, h(L) ${r.h(AQ.L).toFixed(4)}; viaje ${order.map((d) => `${(d / 365).toPrecision(3)} años`).join(', ')}`,
    pass: worst < 1e-4 && Math.abs(r.h(0) - h1) < 1e-12 && Math.abs(r.h(AQ.L) - AQ.h2) < 1e-12 && order.every((d, k) => k === 0 || d > order[k - 1]),
  });
}

// S6) Ogata-Banks contra partículas en un flujo uniforme
{
  const v = 0.5, aL = 2, D = aL * v, t = 200;
  const R = rand(7);
  // fuente continua: partículas que entran a ritmo constante en x = 0
  const ps: Particle[] = [];
  const dt = 0.5;
  for (let k = 0; k < t / dt; k++) {
    for (let j = 0; j < 40; j++) ps.push({ x: 0, y: 0, caught: -1 });
    stepParticles(ps, { v, well: null }, aL, 0, dt, k * dt, R);
    // entrada de flujo: la que la dispersión devuelve aguas arriba de la fuente se refleja
    for (const p of ps) if (p.x < 0) p.x = -p.x;
  }
  const inside = ps;
  const total = inside.length;
  const integ = (x: number) => {
    let s2 = 0;
    for (let xx = x; xx < x + 400; xx += 0.25) s2 += ogataBanksFlux(xx + 0.125, t, v, D) * 0.25;
    return s2;
  };
  const all = integ(0);
  // fracción de la masa más allá de x: partículas contra la integral de C/C0 de Ogata-Banks
  let worst = 0;
  for (const x of [40, 80, 100, 120]) worst = Math.max(worst, Math.abs(inside.filter((p) => p.x > x).length / total - integ(x) / all));
  const e = [erfc(0.5), erfc(1), erfc(2)];
  const far = Math.abs(ogataBanks(100, t, v, D) - ogataBanksFlux(100, t, v, D));
  record({
    id: 'S6',
    name: 'Transporte: Ogata-Banks contra partículas con caminata aleatoria',
    tolerance: 'erfc(0,5) = 0,4795, erfc(1) = 0,1573 y erfc(2) = 0,004678 (±1e-6); con fuente continua, v = 0,5 m/día y αL = 2 m, la fracción de la masa más allá de cada distancia a los 200 días queda a menos de 0,02 de la solución con entrada de flujo (van Genuchten y Alves, 1982); la masa total es v·t (±2 %); Ogata-Banks (concentración fija en la entrada) mete más masa por dispersión y da más concentración en el frente: se informa la diferencia en x = v·t',
    measured: `erfc ${e.map((x) => x.toFixed(6)).join(', ')}; ${total} partículas; mayor diferencia ${worst.toFixed(4)}; masa ${all.toFixed(2)} contra v·t = ${v * t}; en el frente, Ogata-Banks da ${far.toFixed(4)} más`,
    pass: Math.abs(e[0] - 0.4795001) < 1e-6 && Math.abs(e[1] - 0.1572992) < 1e-6 && Math.abs(e[2] - 0.0046777) < 1e-6 && worst < 0.02 && rel(all, v * t) < 0.02 && far > 0,
  });
}

// S7) Zona de captura contra trayectorias
{
  const Q = 1000, b = 20, q = 0.5, ne = 0.25;
  const cz = captureZone(Q, b, q);
  const f = { v: q / ne, well: { x: 0, y: 0, Q, b, ne } };
  const ys = [-70, -55, -45, -20, 0, 20, 45, 55, 70];
  const caught = ys.map((y0) => {
    const ps: Particle[] = [{ x: -500, y: y0, caught: -1 }];
    const R = rand(1);
    for (let d = 0; d < 4000; d++) stepParticles(ps, f, 0, 0, 0.5, d * 0.5, R);
    return ps[0].caught >= 0;
  });
  const ok = ys.every((y, k) => caught[k] === Math.abs(y) < cz.width / 2);
  record({
    id: 'S7',
    name: 'Zona de captura de un pozo en un flujo regional (Todd)',
    tolerance: 'ancho Q/(b·q) y punto de estancamiento Q/(2π·b·q) (1e-12); las trayectorias sin dispersión que salen con |y| menor que la mitad del ancho terminan en el pozo y las demás no',
    measured: `ancho ${cz.width} m, estancamiento ${cz.xs.toFixed(3)} m; capturadas: ${ys.filter((_, k) => caught[k]).join(', ')} m`,
    pass: Math.abs(cz.width - 100) < 1e-12 && Math.abs(cz.xs - 100 / (2 * Math.PI)) < 1e-12 && ok,
  });
}

// S8) Datos de los suelos
{
  const ks = Object.values(SOILS).map((s) => s.K);
  record({
    id: 'S8',
    name: 'Suelos: conductividades en orden y dentro de los rangos de la literatura',
    tolerance: 'la conductividad baja de la grava a la arcilla; grava entre 100 y 1 000 m/día, arena gruesa entre 1 y 100, arcilla menor de 1e-3 (Freeze y Cherry, 1979); porosidades eficaces entre 0,01 y 0,35',
    measured: Object.values(SOILS).map((s) => `${s.name} ${s.K} m/día, ne ${s.ne}`).join('; '),
    pass: ks.every((k, i) => i === 0 || k < ks[i - 1]) && SOILS.grava.K >= 100 && SOILS.grava.K <= 1000 && SOILS.arena.K >= 1 && SOILS.arena.K <= 100 && SOILS.arcilla.K < 1e-3 && Object.values(SOILS).every((s) => s.ne > 0.01 && s.ne < 0.35),
  });
}

// S9) Herramientas de diseño
{
  const fns = { calcDarcy, calcPermeametro, preProteccion, calcTheis, calcPrueba, prePozo, calcOgata, preCaptura };
  const r = robust(fns, (R) => ({
    K: R() * 400 - 10, i: R() * 0.1, A: R() * 1000, ne: R() * 1.2, L: R() * 1000, tipo: ['constante', 'variable'][Math.floor(R() * 2)], D: R() * 0.2, Q: R() * 40 - 2, dh: R(), d: R() * 0.02, t: R() * 400, h0: R() * 2, h1: R() * 2,
    dias: R() * 400, b: R() * 50, T: R() * 2000, S: R() * 0.01, r: R() * 300, tabla: ['', '1 2', '0.01 0.1\n0.1 0.3\n1 0.5\n2 0.6', 'a b'][Math.floor(R() * 4)], smax: R() * 30, loss: R() * 120, rw: R() * 0.5, v: R(), aL: R() * 20, x: R() * 500, C0: R() * 100, y: R() * 200,
  }), 60);
  const perm = calcPermeametro({ tipo: 'constante', L: 0.3, D: 0.1, Q: 4.55, dh: 0.5 });
  const prueba = calcPrueba({});
  const cap = preCaptura({ Q: 5, y: 50 });
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
  record({
    id: 'S9',
    name: 'Herramientas de diseño de la sala: sin errores y con sus gráficas',
    tolerance: '60 juegos de datos al azar en las ocho herramientas: ninguna excepción ni valores NaN, indefinidos o infinitos (salvo los avisos de datos inválidos); 4,55 mL/s con 50 cm de carga se reconocen como arena gruesa; la prueba de ejemplo da una transmisividad; con 5 L/s una fuente a 50 m del eje queda dentro de la zona de captura (ancho 360 m); las ocho dibujan su gráfica',
    measured: `${r.calls} llamadas; excepciones ${r.thrown}; inválidos ${r.bad}; permeámetro: ${perm.outs[1]?.value}; prueba: T ${prueba.outs[0]?.value}; captura: ${cap.outs[1]?.value}; gráficas ${charts}, con errores ${badSvg}`,
    pass: r.thrown === 0 && r.bad === 0 && perm.outs[1]?.value === 'arena gruesa' && !prueba.error && cap.outs[1]?.value === 'termina en el pozo' && charts === 8 && badSvg === 0,
  });
}

finish('docs/subterraneas/PRUEBAS_SUBTERRANEAS.md', 'Pruebas de la sala «Aguas subterráneas»', 'npm run test:ground');

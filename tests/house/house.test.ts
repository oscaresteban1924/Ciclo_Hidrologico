// Pruebas de la sala «El agua en casa»: el consumo por uso y su reparto en el día, el goteo de una llave, la
// factura con los rangos de la CRA, subsidios y contribuciones, el medidor, el año de lluvia y el balance del
// tanque, y las herramientas de diseño, cada una con su tolerancia declarada.

import { finish, record, rel, robust } from '../harness';
import { BASIC_M3, COMPLEMENTARY_M3, MONTHLY_MM, PROFILES, RAIN_YEAR, RATES, TARIFF, bill, dailyUse, hourly, meterDigits, monthOfDay, tankYear, total, type Use } from '../../src/house/house';
import { calcConsumo, calcFactura, calcTanque, preAhorro, preFuga, preTanque } from '../../src/house/design';
import { DEFAULT_BILL, DEFAULT_TANK, DEFAULT_USE, billScene, tankScene, useScene } from '../../src/house/scene';
import { planFor } from '../../src/canals/designPlans';
import { chartSVG } from '../../src/canals/plan';

// H1) Consumo por uso y su reparto en el día
{
  const h = { people: 3, shower: 8, flushes: 5, basin: 2, dishes: 10, loads: 2, hose: 14 };
  const d = { lowShower: true, lowToilet: false, aerators: true, frontLoader: false, drip: true, toiletLeak: true };
  const u = dailyUse(h, d);
  const hand = { ducha: 3 * 8 * 6, sanitario: 3 * 5 * 9, lavamanos: 3 * 2 * 3, cocina: 10 * 5, lavadora: (2 * 100) / 7, manguera: (14 * 15) / 7, fugas: 21 + 120 };
  const worst = Math.max(...(Object.keys(hand) as Use[]).map((k) => Math.abs(u[k] - hand[k])));
  const sums = Math.max(...(Object.keys(PROFILES) as Use[]).map((k) => Math.abs(PROFILES[k].reduce((a, b) => a + b, 0) - 1)));
  const hrs = hourly(u);
  const back = Math.abs((Object.keys(hrs) as Use[]).reduce((s, k) => s + hrs[k].reduce((a, b) => a + b, 0), 0) - total(u));
  record({
    id: 'H1',
    name: 'Consumo de cada uso a mano, y su reparto en las 24 horas',
    tolerance: 'cada uso igual a la cuenta a mano (1e-9 L); cada perfil horario suma 1 (1e-12); las horas suman el total del día (1e-9 L)',
    measured: `diferencia máxima ${worst.toExponential(1)} L; perfiles ${sums.toExponential(1)}; horas ${back.toExponential(1)} L`,
    pass: worst < 1e-9 && sums < 1e-12 && back < 1e-9,
  });
}

// H2) El goteo de una llave
{
  const perDay = (86400 / 15140) * 3.78541;
  record({
    id: 'H2',
    name: 'Una gota por segundo: la cuenta de la calculadora de goteo del USGS',
    tolerance: '86 400 gotas al día, 15 140 gotas por galón y 3,785 L por galón dan unos 21,6 L/día; el valor de la sala queda a 3 % o menos',
    measured: `cuenta ${perDay.toFixed(2)} L/día; sala ${RATES.drip} L/día`,
    pass: rel(RATES.drip, perDay) <= 0.03,
  });
}

// H3) La factura: rangos, subsidios y contribuciones
{
  const unit = TARIFF.m3Aq + TARIFF.m3Sew, fixed = TARIFF.fixedAq + TARIFF.fixedSew;
  let split = 0;
  for (const m of [0, 5, 13, 13.01, 20, 26, 30, 45]) {
    const b = bill(m, 4);
    split = Math.max(split, Math.abs(b.basic + b.comp + b.sumpt - m));
  }
  const b4 = bill(30, 4);
  const plain = Math.abs(b4.total - (fixed + 30 * unit));
  // con subsidio, lo que pasa del básico se cobra completo (igual que el estrato 4)
  const comp1 = bill(30, 1).lines.slice(2).reduce((s, l) => s + l.value, 0), comp4 = b4.lines.slice(2).reduce((s, l) => s + l.value, 0);
  const sub = Math.abs(comp1 - comp4);
  // la contribución se cobra en todo
  const contrib = Math.abs(bill(30, 6).total - 1.6 * b4.total);
  let mono = true;
  for (const e of [1, 3, 4, 6]) for (let m = 0; m < 40; m += 0.5) if (bill(m + 0.5, e).total <= bill(m, e).total) mono = false;
  record({
    id: 'H3',
    name: 'Factura: rangos de la CRA (13 y 26 m³), subsidio solo en el básico y contribución en todo',
    tolerance: 'básico + complementario + suntuario = consumo (1e-12); el estrato 4 paga cargo fijo más consumo por la tarifa (1e-6 $); lo que pasa del básico cuesta igual en estrato 1 y 4 (1e-6 $); el estrato 6 paga 1,6 veces el 4 (1e-6 $); la factura siempre sube con el consumo',
    measured: `reparto ${split.toExponential(1)}; estrato 4 ${plain.toExponential(1)} $; fuera del básico ${sub.toExponential(1)} $; estrato 6 ${contrib.toExponential(1)} $; sube ${mono}; básico ${BASIC_M3}, complementario hasta ${COMPLEMENTARY_M3}`,
    pass: split < 1e-12 && plain < 1e-6 && sub < 1e-6 && contrib < 1e-6 && mono && BASIC_M3 === 13 && COMPLEMENTARY_M3 === 26,
  });
}

// H4) El medidor
{
  let worst = 0;
  for (const m of [0, 1.0001, 1487.2316, 99999.9999, 12.3456]) {
    const d = meterDigits(m);
    const back = Number(d.drums) + d.needles.reduce((s, x, k) => s + Math.floor(x + 1e-6) * Math.pow(10, -(k + 1)), 0);
    worst = Math.max(worst, Math.abs(back - (m % 100000)));
  }
  record({
    id: 'H4',
    name: 'Lectura del medidor: tambores de metros cúbicos y agujas de décimas a diezmilésimas',
    tolerance: 'los tambores y la parte entera de cada aguja reconstruyen la lectura con 1e-4 m³',
    measured: `diferencia máxima ${worst.toExponential(1)} m³`,
    pass: worst < 1e-4 + 1e-9,
  });
}

// H5) El año de lluvia
{
  const months = Array.from({ length: 12 }, () => 0);
  RAIN_YEAR.forEach((p, d) => (months[monthOfDay(d)] += p));
  const worst = Math.max(...months.map((m, k) => Math.abs(m - MONTHLY_MM[k])));
  const total = RAIN_YEAR.reduce((a, b) => a + b, 0);
  const bimodal = MONTHLY_MM[4] > MONTHLY_MM[5] && MONTHLY_MM[4] > MONTHLY_MM[2] && MONTHLY_MM[9] > MONTHLY_MM[7] && MONTHLY_MM[9] > MONTHLY_MM[11] && MONTHLY_MM[0] < MONTHLY_MM[4] && MONTHLY_MM[6] < MONTHLY_MM[4];
  record({
    id: 'H5',
    name: 'Año de lluvia ilustrativo: 365 días que suman la media de cada mes, con dos temporadas de lluvia',
    tolerance: 'cada mes suma su media con 1e-9 mm; 365 días, todos sin lluvia negativa; máximos en mayo y octubre, mínimos en enero y julio',
    measured: `diferencia ${worst.toExponential(1)} mm; ${RAIN_YEAR.length} días, ${RAIN_YEAR.filter((p) => p > 0).length} con lluvia; total ${total.toFixed(0)} mm; bimodal ${bimodal}`,
    pass: worst < 1e-9 && RAIN_YEAR.length === 365 && RAIN_YEAR.every((p) => p >= 0) && bimodal,
  });
}

// H6) El balance del tanque
{
  let worst = 0, mono = true;
  let prev = -1;
  for (const V of [0.25, 0.5, 1, 2, 4, 8]) {
    const t = { A: 70, C: 0.85, ff: 1, V, D: 220 };
    // el año que se reporta empieza con lo que quedó del de calentamiento
    const one = tankYear(t, RAIN_YEAR, 1);
    const S0 = one.S[one.S.length - 1];
    const r = tankYear(t);
    const S1 = r.S[r.S.length - 1];
    worst = Math.max(worst, Math.abs(r.captured - r.served - r.spilled - (S1 - S0)));
    if (r.share < prev - 1e-12) mono = false;
    prev = r.share;
  }
  const big = tankYear({ A: 70, C: 0.85, ff: 1, V: 1000, D: 50 });
  const zero = tankYear({ A: 70, C: 0.85, ff: 1, V: 2, D: 0 });
  record({
    id: 'H6',
    name: 'Tanque de agua lluvia: balance de masa, más tanque nunca atiende menos, y casos límite',
    tolerance: 'lo captado = lo usado + lo que rebosa + el cambio de almacenamiento (1e-9 m³); la fracción atendida no baja al crecer el tanque; con un tanque enorme y poca demanda se atiende todo; sin demanda la fracción es 0 sin valores raros',
    measured: `balance ${worst.toExponential(1)} m³; no baja ${mono}; tanque enorme ${(big.share * 100).toFixed(1)} %; sin demanda ${zero.share}`,
    pass: worst < 1e-9 && mono && big.share > 0.999 && zero.share === 0 && Number.isFinite(zero.reliability),
  });
}

// H7) Herramientas de diseño
{
  const rb = robust({ calcConsumo, preAhorro, calcFactura, preFuga, calcTanque, preTanque }, (R) => ({
    P: 1 + Math.floor(R() * 10),
    tm: R() * 20,
    qd: 4 + R() * 12,
    nd: R() * 8,
    vd: 3 + R() * 10,
    otros: R() * 80,
    fuga: R() * 300,
    q0: 6 + R() * 8,
    q1: 4 + R() * 4,
    v0: 6 + R() * 8,
    v1: 3 + R() * 4,
    cost: R() * 1e6,
    unit: 1000 + R() * 9000,
    r0: 1000 + R() * 100,
    r1: 1100 + R() * 100,
    e: String(1 + Math.floor(R() * 6)),
    a: 1200,
    b: 1200 + R() * 0.05,
    min: 10 + R() * 120,
    A: 10 + R() * 300,
    C: 0.5 + R() * 0.5,
    ff: R() * 3,
    V: 0.2 + R() * 8,
    D: 20 + R() * 500,
    obj: 50 + R() * 40,
  }), 80);
  const pt = preTanque({});
  const V = Number(pt.data?.V);
  const okPt = tankYear({ ...DEFAULT_TANK, V }).share >= 0.8 && tankYear({ ...DEFAULT_TANK, V: V - 0.1 }).share < 0.8;
  const fa = calcFactura({});
  const okFa = Math.abs(Number(fa.data?.m3) - (1502.6582 - 1487.2316)) < 1e-9;
  const fu = preFuga({});
  const okFu = Math.abs(Number(fu.data?.Lh) - 12) < 1e-6;
  const runs = [calcConsumo, preAhorro, calcFactura, preFuga, calcTanque, preTanque];
  const charts = runs.map((run) => chartSVG(planFor(run, run({})).chart!));
  const okCharts = charts.every((c) => c.length > 200 && !/NaN|Infinity|undefined/.test(c));
  record({
    id: 'H7',
    name: 'Herramientas de diseño: datos al azar, tanque mínimo, consumo desde lecturas, fuga nocturna y gráficas',
    tolerance: 'sin excepciones ni valores raros en 480 llamadas; el tanque elegido llega al 80 % y 0,1 m³ menos no; el consumo es la resta de lecturas; la prueba de ejemplo da 12 L/h; las seis gráficas se dibujan',
    measured: `${rb.calls} llamadas, ${rb.bad} con valores raros, ${rb.thrown} excepciones; tanque ${V} m³ ${okPt}; lecturas ${okFa}; fuga ${Number(fu.data?.Lh).toFixed(2)} L/h; gráficas ${okCharts}`,
    pass: rb.bad === 0 && rb.thrown === 0 && okPt && okFa && okFu && okCharts,
  });
}

// H8) Escenas de partida y retos alcanzables
{
  const u = useScene(DEFAULT_USE), saving = useScene({ ...DEFAULT_USE, lowShower: true, lowToilet: true, aerators: true, frontLoader: true });
  const b = billScene(DEFAULT_BILL), t = tankScene(DEFAULT_TANK);
  // un tanque de 3 m³ o menos sin días vacíos, dentro de los rangos de los controles
  let noEmpty = false;
  for (let D = 50; D <= 400 && !noEmpty; D += 10) if (tankScene({ ...DEFAULT_TANK, A: 200, V: 3, D }).emptyDays === 0) noEmpty = true;
  record({
    id: 'H8',
    name: 'Escenas de partida: la casa pasa del básico, la factura sin fuga, el tanque atiende parte; los retos se pueden cumplir',
    tolerance: 'la casa de cuatro personas usa entre 13 y 26 m³ al mes y con aparatos ahorradores queda en el básico; la factura de partida no tiene fuga; el tanque atiende entre 60 % y 80 %; existe un tanque de 3 m³ o menos sin días vacíos',
    measured: `casa ${u.m3.toFixed(1)} m³ (${u.per.toFixed(0)} L/persona), con ahorradores ${saving.m3.toFixed(1)} m³; factura ${b.m3.toFixed(1)} m³ con fuga de ${b.leakM3} m³; tanque ${(t.share * 100).toFixed(1)} %; sin días vacíos ${noEmpty}`,
    pass: u.m3 > BASIC_M3 && u.m3 <= COMPLEMENTARY_M3 && saving.m3 <= BASIC_M3 && b.leakM3 === 0 && t.share > 0.6 && t.share < 0.8 && noEmpty,
  });
}

finish('docs/casa/PRUEBAS_CASA.md', 'Pruebas de la sala «El agua en casa»', 'npm run test:house');

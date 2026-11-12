// Pruebas de la sala «Bombas y energía del agua»: leyes de afinidad, punto de operación, bombas en serie y en
// paralelo, atmósfera, presión de vapor, NPSH, potencia de una central, curva de duración, elección de turbina y las
// herramientas de diseño, cada una con su tolerancia declarada.

import { finish, record, rel, robust } from '../harness';
import { ARRANGEMENTS, PUMP, fdc, hydro, hydroPower, maxFlowNoCav, npsha, npshr, operatingPoint, patm, pumpEta, pumpHead, pvap, rhoWater, setHead, systemHead, turbinesFor, type Arrangement, type SystemInput } from '../../src/pumps/pump';
import { calcCentral, calcNpsh, calcOperacion, maxSuctionLift, preEstacion, preSuccion, preTuberia } from '../../src/pumps/design';
import { DEFAULT_CAV, DEFAULT_HYDRO, DEFAULT_PUMP, cavScene, hydroScene, pumpScene, throttleVsSpeed } from '../../src/pumps/scene';
import { PVC_DIAMETERS } from '../../src/supply/pipes';
import { planFor } from '../../src/canals/designPlans';
import { chartSVG } from '../../src/canals/plan';

// B1) Leyes de afinidad
{
  let worstH = 0, worstEta = 0, worstP = 0;
  for (const n of [0.6, 0.8, 0.9, 1.1, 1.2])
    for (const Q of [10, 30, 55, 80]) {
      const H1 = pumpHead(PUMP, Q), Hn = pumpHead(PUMP, Q * n, n);
      const e1 = pumpEta(PUMP, Q), en = pumpEta(PUMP, Q * n, n);
      worstH = Math.max(worstH, rel(Hn, n * n * H1));
      worstEta = Math.max(worstEta, Math.abs(en - e1));
      const P1 = (Q * H1) / e1, Pn = (Q * n * Hn) / en;
      worstP = Math.max(worstP, rel(Pn, n ** 3 * P1));
    }
  record({
    id: 'B1',
    name: 'Leyes de afinidad: puntos homólogos con Q ∝ n, H ∝ n² y P ∝ n³',
    tolerance: 'error relativo de 1e-9 o menos en la altura y la potencia, y la misma eficiencia en los puntos homólogos (velocidades de 60 % a 120 %)',
    measured: `altura ${worstH.toExponential(1)}, eficiencia ${worstEta.toExponential(1)}, potencia ${worstP.toExponential(1)}`,
    pass: worstH < 1e-9 && worstEta < 1e-9 && worstP < 1e-9,
  });
}

// B2) El punto de operación está en las dos curvas
{
  let x = 7;
  const R = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  let worst = 0, energy = 0, cases = 0;
  for (let k = 0; k < 300; k++) {
    const arr = (['una', 'serie', 'paralelo'] as Arrangement[])[k % 3];
    const sys: SystemInput = { Hs: R() * 60, L: 50 + R() * 1500, D: 0.08 + R() * 0.3, mat: 'pvc', K: R() * 20, T: 20 };
    const n = 0.6 + R() * 0.6;
    const op = operatingPoint(PUMP, arr, n, sys);
    if (!op.flows) continue;
    cases++;
    worst = Math.max(worst, Math.abs(setHead(PUMP, arr, op.Q, n) - systemHead(sys, op.Q).H));
    energy = Math.max(energy, rel(op.e, (9.81 * op.H) / (op.eta * 3600)));
  }
  record({
    id: 'B2',
    name: 'Punto de operación: la altura de la bomba iguala la del sistema',
    tolerance: 'diferencia de 1e-6 m o menos en 300 sistemas al azar (una, serie y paralelo); la energía por metro cúbico es g·H/(η·3 600) con error de 1e-9',
    measured: `${cases} casos con flujo; diferencia máxima ${worst.toExponential(1)} m; energía ${energy.toExponential(1)}`,
    pass: cases > 200 && worst < 1e-6 && energy < 1e-9,
  });
}

// B3) Serie o paralelo depende de la tubería
{
  const flat: SystemInput = { Hs: 30, L: 60, D: 0.3, mat: 'pvc', K: 2, T: 20 };
  const steep: SystemInput = { Hs: 5, L: 1200, D: 0.12, mat: 'pvc', K: 8, T: 20 };
  const q = (s: SystemInput, a: Arrangement) => operatingPoint(PUMP, a, 1, s).Q;
  const f1 = q(flat, 'una'), fs = q(flat, 'serie'), fp = q(flat, 'paralelo');
  const s1 = q(steep, 'una'), ss = q(steep, 'serie'), sp = q(steep, 'paralelo');
  record({
    id: 'B3',
    name: 'Dos bombas: en paralelo rinden más en una tubería holgada y en serie en una tubería estrecha y larga',
    tolerance: 'con poca fricción, paralelo > serie > una; con mucha fricción, serie > paralelo > una; y dos bombas nunca dan el doble de caudal',
    measured: `holgada: una ${f1.toFixed(1)}, serie ${fs.toFixed(1)}, paralelo ${fp.toFixed(1)} L/s; estrecha: una ${s1.toFixed(1)}, serie ${ss.toFixed(1)}, paralelo ${sp.toFixed(1)} L/s`,
    pass: fp > fs && fs > f1 && ss > sp && sp > s1 && fp < 2 * f1 && ss < 2 * s1,
  });
}

// B4) Atmósfera, presión de vapor y densidad contra tablas
{
  const atm = [
    [1500, 84.556],
    [3000, 70.121],
  ];
  const vap = [
    [20, 2.339],
    [60, 19.946],
    [80, 47.414],
    [100, 101.42],
  ];
  const rho = [
    [4, 999.97],
    [20, 998.21],
    [60, 983.2],
    [90, 965.3],
  ];
  const ea = Math.max(...atm.map(([z, p]) => rel(patm(z), p)));
  const ev = Math.max(...vap.map(([t, p]) => rel(pvap(t), p)));
  const er = Math.max(...rho.map(([t, r]) => rel(rhoWater(t), r)));
  record({
    id: 'B4',
    name: 'Presión de la atmósfera, presión de vapor y densidad del agua contra tablas',
    tolerance: 'atmósfera estándar de 1976 a 1 500 y 3 000 m con 0,1 %; presión de vapor (IAPWS) de 20 a 100 °C con 1 %; densidad de 4 a 90 °C con 0,05 %',
    measured: `atmósfera ${(ea * 100).toFixed(3)} %, vapor ${(ev * 100).toFixed(2)} %, densidad ${(er * 100).toFixed(3)} %`,
    pass: ea < 0.001 && ev < 0.01 && er < 0.0005,
  });
}

// B5) NPSH disponible y caudal máximo sin cavitación
{
  const s = { z: 1495, T: 20, zs: -3, Ls: 6, Ds: 0.2027, Ks: 3.4 };
  const a = npsha(s, 55);
  const rho = rhoWater(20);
  const hand = (patm(1495) * 1000) / (rho * 9.81) - (pvap(20) * 1000) / (rho * 9.81) - 3 - a.hfs;
  const Qm = maxFlowNoCav(PUMP, s);
  const atMax = npsha(s, Qm).NPSHa - npshr(PUMP, Qm) - 0.5;
  const boil = npsha({ ...s, z: 0, T: 100, zs: 0 }, 30);
  const mono = npsha({ ...s, z: 2600 }, 55).NPSHa < a.NPSHa && npsha({ ...s, T: 60 }, 55).NPSHa < a.NPSHa && npsha(s, 70).NPSHa < a.NPSHa;
  const lift = maxSuctionLift(0, 20, 0, 0, 0);
  record({
    id: 'B5',
    name: 'NPSH disponible, caudal máximo sin cavitación, agua hirviendo y altura máxima de succión',
    tolerance: 'NPSHa igual a la suma de sus partes (1e-9 m); en el caudal máximo el margen es 0,5 m (1e-6 m); con agua a 100 °C al nivel del mar y la bomba al ras, NPSHa + pérdidas está a 0,15 m o menos de cero; NPSHa baja con la altitud, la temperatura y el caudal; succión teórica al nivel del mar a 20 °C de 10,11 m ± 0,05 m (10,35 m de atmósfera menos 0,24 m de vapor)',
    measured: `NPSHa ${a.NPSHa.toFixed(3)} m (suma ${hand.toFixed(3)}); caudal máximo ${Qm.toFixed(1)} L/s, margen ${atMax.toExponential(1)}; a 100 °C ${(boil.NPSHa + boil.hfs).toFixed(3)} m; baja ${mono}; succión ${lift.toFixed(3)} m`,
    pass: Math.abs(a.NPSHa - hand) < 1e-9 && Math.abs(atMax) < 1e-6 && Math.abs(boil.NPSHa + boil.hfs) < 0.15 && mono && Math.abs(lift - 10.11) < 0.05,
  });
}

// B6) Potencia de una central
{
  const h = { Hg: 100, Qd: 1, D: 5, L: 200, turbine: 'pelton' as const, Q50: 2, Qeco: 0, etaG: 0.95 };
  const P = hydroPower(h, 1).P;
  const ref = 9.81 * 1 * 100 * 0.9 * 0.95;
  const real = hydroPower({ ...h, D: 0.6 }, 1);
  const ident = (1000 * 9.81 * 1 * real.Hn * 0.9 * 0.95) / 1000;
  record({
    id: 'B6',
    name: 'Potencia de una central: P = ρ·g·Q·Hn·ηt·ηg',
    tolerance: 'con 1 m³/s, 100 m y pérdidas despreciables, 838,8 kW con 0,05 %; con una tubería real la potencia usa la altura neta (1e-9) y la altura neta es menor que la bruta',
    measured: `${P.toFixed(1)} kW (referencia ${ref.toFixed(1)}); con tubería de 0,6 m Hn = ${real.Hn.toFixed(2)} m y P = ${real.P.toFixed(1)} kW`,
    pass: rel(P, ref) < 0.0005 && rel(real.P, ident) < 1e-9 && real.Hn < 100,
  });
}

// B7) Curva de duración y energía al año
{
  const ps = Array.from({ length: 99 }, (_, k) => (k + 1) / 100);
  const mono = ps.every((p, k) => k === 0 || fdc(1, p) < fdc(1, ps[k - 1]));
  const r = hydro({ Hg: 90, Qd: 1.6, D: 0.8, L: 180, turbine: 'francis', Q50: 1.2, Qeco: 0.18, etaG: 0.95 });
  const mean = r.curve.reduce((a, c) => a + c.P, 0) / r.curve.length;
  const big = hydro({ Hg: 90, Qd: 1, D: 0.8, L: 180, turbine: 'francis', Q50: 1000, Qeco: 0, etaG: 0.95 });
  record({
    id: 'B7',
    name: 'Curva de duración de caudales, energía al año y factor de planta',
    tolerance: 'la mediana es Q50 y la curva baja siempre; energía = potencia media × 8 760 h (1e-9); factor de planta entre 0 y 1; con un río enorme frente a la turbina el factor pasa de 0,99',
    measured: `Q(50 %) = ${fdc(1.2, 0.5).toFixed(6)}; baja ${mono}; E = ${r.E.toFixed(1)} MWh (media ${((mean * 8760) / 1000).toFixed(1)}); factor ${r.cf.toFixed(3)}; con río enorme ${big.cf.toFixed(4)}`,
    pass: Math.abs(fdc(1.2, 0.5) - 1.2) < 1e-12 && mono && rel(r.E, (mean * 8760) / 1000) < 1e-9 && r.cf > 0 && r.cf <= 1 && big.cf > 0.99,
  });
}

// B8) Elección de la turbina
{
  const has = (H: number, Q: number) => turbinesFor(H, Q).sort().join(',');
  const cases: [number, number, string][] = [
    [300, 0.5, 'francis,pelton'],
    [600, 2, 'pelton'],
    [10, 5, 'kaplan'],
    [10, 1, 'banki,kaplan'],
    [40, 0.1, 'banki'],
  ];
  const got = cases.map(([H, Q]) => has(H, Q));
  record({
    id: 'B8',
    name: 'Turbinas que sirven según la altura neta y el caudal (envolventes de las guías de pequeñas centrales)',
    tolerance: 'Pelton para mucha altura, Kaplan para poca altura y mucho caudal, Michell-Banki para caudales pequeños, Francis en medio; exactamente los tipos esperados en cinco casos',
    measured: cases.map(([H, Q], k) => `${H} m y ${Q} m³/s → ${got[k] || 'ninguna'}`).join('; '),
    pass: cases.every(([, , e], k) => got[k] === e),
  });
}

// B9) Bajar el caudal: válvula o variador
{
  const t = throttleVsSpeed({ ...DEFAULT_PUMP, d: 2 }, 40)!;
  record({
    id: 'B9',
    name: 'Para bajar el caudal, el variador de velocidad gasta menos que cerrar la válvula',
    tolerance: 'las dos maneras dan el caudal pedido (40 L/s ± 0,01) y el variador ahorra 15 % o más de la potencia',
    measured: `válvula abierta al ${(t.open * 100).toFixed(1)} %: ${t.valve.Q.toFixed(2)} L/s y ${t.valve.Pshaft.toFixed(2)} kW; velocidad ${(t.n * 100).toFixed(1)} %: ${t.speed.Q.toFixed(2)} L/s y ${t.speed.Pshaft.toFixed(2)} kW; ahorro ${(t.saving * 100).toFixed(1)} %`,
    pass: Math.abs(t.valve.Q - 40) < 0.01 && Math.abs(t.speed.Q - 40) < 0.01 && t.saving >= 0.15,
  });
}

// B10) Herramientas de diseño
{
  const rb = robust({ calcOperacion, preEstacion, calcNpsh, preSuccion, calcCentral, preTuberia }, (R) => ({
    H0: 5 + R() * 120,
    Qmax: 10 + R() * 300,
    Qbep: 5 + R() * 150,
    eta: 30 + R() * 60,
    arr: (Object.keys(ARRANGEMENTS) as Arrangement[])[Math.floor(R() * 3)],
    n: 40 + R() * 80,
    Hs: R() * 80,
    L: 10 + R() * 2000,
    D: 50 + R() * 400,
    mat: ['pvc', 'hd', 'acero', 'concreto'][Math.floor(R() * 4)],
    K: R() * 30,
    Q: 1 + R() * 150,
    Vmax: 0.5 + R() * 2,
    h: 1 + R() * 23,
    z: R() * 4000,
    T: R() * 95,
    zs: -8 + R() * 12,
    Ls: R() * 30,
    Ds: 60 + R() * 300,
    Ks: R() * 10,
    NPSHr: R() * 8,
    Hg: 5 + R() * 600,
    Qd: 0.05 + R() * 10,
    Q50: 0.1 + R() * 20,
    eco: R() * 0.5,
    tur: ['pelton', 'banki', 'francis', 'kaplan'][Math.floor(R() * 4)],
    pct: 1 + R() * 15,
  }));
  const st = preEstacion({ Q: 40, Hs: 28, L: 450, K: 5, Vmax: 1.5 });
  const D = Number(st.data?.D);
  const k = PVC_DIAMETERS.findIndex((x) => x.D === D);
  const vOf = (d: number) => 0.04 / ((Math.PI * d * d) / 4);
  const okSt = vOf(D) <= 1.5 && (k === 0 || vOf(PVC_DIAMETERS[k - 1].D) > 1.5);
  const sc = preSuccion({});
  const okSc = sc.checks?.every((c) => c.ok) ?? false;
  const tb = preTuberia({ pct: 5 });
  const Dt = Number(tb.data?.D);
  const loss = (d: number) => hydroPower({ Hg: 90, Qd: 1.6, D: d, L: 180, turbine: 'francis', Q50: 1.2, Qeco: 0.18, etaG: 0.95 }, 1.6).hf;
  const okTb = loss(Dt) <= 4.5 + 1e-9 && loss(Dt - 0.05) > 4.5;
  const runs = [calcOperacion, preEstacion, calcNpsh, preSuccion, calcCentral, preTuberia];
  const charts = runs.map((run) => chartSVG(planFor(run, run({})).chart!));
  const okCharts = charts.every((c) => c.length > 200 && !/NaN|Infinity|undefined/.test(c));
  record({
    id: 'B10',
    name: 'Herramientas de diseño: datos al azar, diámetro de la impulsión, altura de la bomba, tubería de presión y gráficas',
    tolerance: 'sin excepciones ni valores raros en 1 800 llamadas; el diámetro elegido es el menor con la velocidad pedida; la altura de la bomba deja justo el margen; la tubería de presión es la menor (en pasos de 0,05 m) con 5 % de pérdidas; las seis gráficas se dibujan',
    measured: `${rb.calls} llamadas, ${rb.bad} con valores raros, ${rb.thrown} excepciones; impulsión ${D} m ${okSt}; succión ${okSc}; tubería de presión ${Dt} m ${okTb}; gráficas ${okCharts}`,
    pass: rb.bad === 0 && rb.thrown === 0 && okSt && okSc && okTb && okCharts,
  });
}

// B11) Escenas de partida
{
  const p = pumpScene(DEFAULT_PUMP), c = cavScene(DEFAULT_CAV), h = hydroScene(DEFAULT_HYDRO);
  record({
    id: 'B11',
    name: 'Escenas de partida: la bomba sube agua cerca de su mejor punto, no cavita, y la central da energía con su turbina en rango',
    tolerance: 'caudal con eficiencia entre 90 % y 98 % de la máxima (queda margen para el reto); margen de NPSH de 0,5 m o más; la turbina sirve, la central genera y las pérdidas no pasan de 5 %',
    measured: `bomba ${p.Q.toFixed(1)} L/s al ${(p.etaRel * 100).toFixed(1)} % de su mejor eficiencia; margen ${c.margin.toFixed(2)} m; central ${h.P.toFixed(0)} kW, ahora ${h.now.P.toFixed(0)} kW, pérdidas ${h.lossPct.toFixed(1)} %, en rango ${h.inRange}`,
    pass: p.flows && p.etaRel > 0.9 && p.etaRel < 0.98 && c.margin >= 0.5 && h.inRange && h.now.P > 0 && h.lossPct <= 5,
  });
}

finish('docs/bombas/PRUEBAS_BOMBAS.md', 'Pruebas de la sala «Bombas y energía del agua»', 'npm run test:pumps');

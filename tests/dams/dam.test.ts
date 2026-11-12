// Pruebas de la sala «Presas y embalses»: tránsito de crecientes, vertedero, pozo de disipación y estabilidad de una
// presa de gravedad, cada una con su tolerancia declarada.

import { finish, record, rel } from '../harness';
import { GAMMA_C, GAMMA_W, gammaInflow, linearReservoir, outflow, routePuls, stability, stillingBasin, storage, wesTangent, wesY, type Reservoir } from '../../src/dams/dam';
import { calcEstabilidad, calcTransito, calcVertedero, prePozo, preTalud, preVertedero } from '../../src/dams/design';
import { planFor } from '../../src/canals/designPlans';
import { chartSVG } from '../../src/canals/plan';
import { robust } from '../harness';
import { DEFAULT_DAM, EMB, SPILL, crestC, routeScene, spillScene, tailwater } from '../../src/dams/scene';

// D1) Puls contra el embalse lineal exacto
{
  // un embalse prismático con descarga lineal O = k·S se obtiene con A0 y una descarga de fondo variable: aquí se
  // usa la forma directa del método con O(S) = k·S para comparar con la solución exacta
  const k = 1 / 7200, I0 = 50, dtH = 0.05, A = 1e5;
  const r: Reservoir = { A0: A, A1: 0, L: 0, C: 0, bottom: 0 };
  const lin = { ...r };
  // tránsito propio: (2S/Δt + O) con O = k·S
  const dt = dtH * 3600;
  let S = 0, worst = 0;
  for (let n = 1; n <= 200; n++) {
    S = ((2 * I0 + (2 / dt - k) * S) / (2 / dt + k));
    worst = Math.max(worst, Math.abs(S - linearReservoir(I0, k, n * dt)) / ((I0 / k) || 1));
  }
  void lin;
  void outflow;
  record({
    id: 'D1',
    name: 'Esquema de Puls contra el embalse lineal exacto',
    tolerance: 'con O = k·S y entrada constante, el esquema de Puls (trapecios en el tiempo) sigue a S(t) = (I/k)·(1 − e^(−kt)) con error menor que 0,05 % del volumen final',
    measured: `mayor error ${(worst * 100).toFixed(4)} % del volumen final; Δt = ${dtH * 60} min, k = 1/${1 / k} s`,
    pass: worst < 5e-4,
  });
}

// D2) Tránsito del embalse de la escena: masa, atenuación, retraso y el pico en el cruce
{
  const r = routeScene({ L: 30, Qp: 800, tp: 6, bottom: 0 });
  const mass = Math.abs(r.vin - r.vout - r.dS) / r.vin;
  // el pico de salida ocurre cuando la salida cruza la entrada (piscina nivelada)
  const k = r.O.indexOf(r.Opeak);
  const crossing = Math.abs(r.I[k] - r.O[k]) / r.Opeak;
  const wider = routeScene({ L: 60, Qp: 800, tp: 6, bottom: 0 });
  record({
    id: 'D2',
    name: 'Tránsito por el embalse: conserva la masa, atenúa y retrasa el pico',
    tolerance: 'entra = sale + guardado (1e-9); el pico de salida es menor que el de entrada y llega después; en ese instante entrada y salida casi coinciden (±3 % con Δt = 15 min); un vertedero más ancho atenúa menos y deja el agua más baja',
    measured: `masa ${mass.toExponential(1)}; pico ${r.Ipeak.toFixed(0)} → ${r.Opeak.toFixed(0)} m³/s, de ${r.tIpeak} a ${r.tOpeak} h; en el pico I − O = ${(crossing * 100).toFixed(2)} %; con 60 m: ${wider.Opeak.toFixed(0)} m³/s y ${wider.hMax.toFixed(2)} m (con 30 m, ${r.hMax.toFixed(2)} m)`,
    pass: mass < 1e-9 && r.Opeak < r.Ipeak && r.tOpeak > r.tIpeak && crossing < 0.03 && wider.Opeak > r.Opeak && wider.hMax < r.hMax,
  });
}

// D3) Vertedero WES y pozo de disipación
{
  const Hd = 3;
  const y1 = wesY(Hd, Hd), hand = Math.pow(3, 1.85) / (2 * Math.pow(3, 0.85));
  const tg = wesTangent(Hd, 0.75);
  const slope = (wesY(tg.x + 1e-5, Hd) - wesY(tg.x - 1e-5, Hd)) / 2e-5;
  const sb = stillingBasin(10, 30, 3);
  const momentum = Math.abs((sb.y1 * sb.y1) / 2 + (10 * 10) / (9.81 * sb.y1) - ((sb.y2 * sb.y2) / 2 + (10 * 10) / (9.81 * sb.y2)));
  const energy = Math.abs(33 - (sb.y1 + (sb.V1 * sb.V1) / (2 * 9.81)));
  const s = spillScene({ H: 3, Hd: 3, L: 30 });
  record({
    id: 'D3',
    name: 'Perfil WES, tangencia con la rápida y resalto al pie',
    tolerance: 'el perfil x^1,85 = 2·Hd^0,85·y da y(Hd) = Hd/2 (1e-12); en el punto de tangencia la pendiente es 1/m (1e-6); al pie se conserva la energía (1e-6) y las profundidades conjugadas igualan la fuerza específica (1e-9); Q = C·L·H^1,5',
    measured: `y(Hd) = ${y1.toFixed(4)} (a mano ${hand.toFixed(4)}); tangencia en x = ${tg.x.toFixed(3)} m con pendiente ${slope.toFixed(6)}; y1 ${sb.y1.toFixed(4)} m, F1 ${sb.F1.toFixed(2)}, y2 ${sb.y2.toFixed(3)} m; Q con 3 m de carga ${s.Q.toFixed(1)} m³/s`,
    pass: Math.abs(y1 - 1.5) < 1e-12 && Math.abs(slope - 1 / 0.75) < 1e-6 && energy < 1e-6 && momentum < 1e-9 && Math.abs(s.Q - 2.18 * 30 * Math.pow(3, 1.5)) < 1e-9 && rel(tailwater(10), Math.pow((10 * 0.035) / Math.sqrt(0.002), 0.6)) < 1e-12,
  });
}

// D4) Estabilidad: un triángulo a mano
{
  // triángulo (corona 0) de 20 m, talud 0,8, embalse lleno, sin agua abajo, subpresión completa
  const d = { H: 20, crest: 0, m: 0.8, hw: 20, tail: 0, uplift: 1, mu: 0.7, c: 0 };
  const r = stability(d);
  const B = 16, W = (GAMMA_C * B * 20) / 2, P = (GAMMA_W * 400) / 2, U = (GAMMA_W * 20 * B) / 2;
  const Mr = W * (B - B / 3), Mo = P * (20 / 3) + U * (B - B / 3);
  const V = W - U;
  const xToe = (Mr - Mo) / V, e = B / 2 - xToe;
  record({
    id: 'D4',
    name: 'Estabilidad de una presa triangular, a mano',
    tolerance: 'peso, empuje y subpresión, momentos respecto a la punta, factores de volcamiento y deslizamiento y la excentricidad iguales al cálculo a mano (1e-9)',
    measured: `B ${r.B} m; V ${r.V.toFixed(2)} kN/m (a mano ${V.toFixed(2)}); FSv ${r.FSo.toFixed(4)} (a mano ${(Mr / Mo).toFixed(4)}); FSd ${r.FSs.toFixed(4)} (a mano ${((0.7 * V) / P).toFixed(4)}); e ${r.e.toFixed(4)} m (a mano ${e.toFixed(4)})`,
    pass: r.B === B && Math.abs(r.V - V) < 1e-9 && Math.abs(r.FSo - Mr / Mo) < 1e-9 && Math.abs(r.FSs - (0.7 * V) / P) < 1e-9 && Math.abs(r.e - e) < 1e-9,
  });
}

// D5) Estabilidad: tercio medio, esfuerzos y drenes
{
  const r = stability(DEFAULT_DAM);
  const sum = (r.sHeel + r.sToe) / 2 * r.B;
  // buscar la altura de agua con la que la resultante sale del tercio medio (e = B/6) en una presa esbelta: el talón queda en cero
  const slim = { ...DEFAULT_DAM, m: 0.5 };
  const eOf = (hw: number) => { const x = stability({ ...slim, hw }); return x.e - x.B / 6; };
  let lo = 0, hi = slim.H;
  const bracket = eOf(lo) < 0 && eOf(hi) > 0;
  for (let k = 0; k < 80; k++) {
    const m = (lo + hi) / 2;
    if (eOf(m) < 0) lo = m;
    else hi = m;
  }
  const edge = stability({ ...slim, hw: (lo + hi) / 2 });
  const drains = stability({ ...DEFAULT_DAM, uplift: 0.33 });
  record({
    id: 'D5',
    name: 'Tercio medio, esfuerzos en la base y el efecto de los drenes',
    tolerance: 'el promedio de los esfuerzos del talón y la punta por B es la fuerza vertical (1e-9); cuando la resultante pasa por el borde del tercio medio el esfuerzo en el talón es cero (±1 kPa); con drenes (un tercio de la subpresión) suben los dos factores de seguridad',
    measured: `V ${r.V.toFixed(1)} contra ${sum.toFixed(1)} kN/m; talud 0,5: sale del tercio con ${((lo + hi) / 2).toFixed(2)} m de agua y el talón queda en ${edge.sHeel.toFixed(3)} kPa; sin drenes FSv ${r.FSo.toFixed(2)} y FSd ${r.FSs.toFixed(2)}; con drenes ${drains.FSo.toFixed(2)} y ${drains.FSs.toFixed(2)}`,
    pass: Math.abs(sum - r.V) < 1e-9 && bracket && Math.abs(edge.sHeel) < 1 && drains.FSo > r.FSo && drains.FSs > r.FSs,
  });
}

// D6) Embalse: volumen y área
{
  const r: Reservoir = { A0: EMB.A0, A1: EMB.A1, L: 30, C: 2.18, bottom: 5 };
  const h = 3;
  let num = 0;
  for (let k = 0; k < 3000; k++) num += (EMB.A0 + EMB.A1 * ((k + 0.5) * h) / 3000) * (h / 3000);
  const inflow = gammaInflow(10, 500, 6);
  record({
    id: 'D6',
    name: 'Volumen del embalse, descarga y forma del hidrograma',
    tolerance: 'el volumen sobre la cresta es la integral del área (±1e-6 relativo); la descarga es C·L·H^1,5 más la de fondo (1e-12); el hidrograma gamma llega a su pico en tp y empieza en el caudal base (1e-12)',
    measured: `volumen con 3 m: ${storage(r, h).toFixed(0)} m³ (integral ${num.toFixed(0)}); descarga ${outflow(r, h).toFixed(3)} m³/s; hidrograma: Q(0) ${inflow(0)}, Q(tp) ${inflow(6).toFixed(6)}`,
    pass: rel(storage(r, h), num) < 1e-6 && Math.abs(outflow(r, h) - (2.18 * 30 * Math.pow(3, 1.5) + 5)) < 1e-12 && Math.abs(inflow(6) - 500) < 1e-9 && inflow(0) === 10,
  });
}

// D7) Herramientas de diseño
{
  const fns = { calcTransito, preVertedero, calcVertedero, prePozo, calcEstabilidad, preTalud };
  const r = robust(fns, (R) => ({
    A0: R() * 400 - 10, A1: R() * 40, L: R() * 120, C: R() * 3, Qp: R() * 2000, tp: R() * 12, Qb: R() * 50, fb: R() * 10, margin: R() * 3, H: R() * 60, Hd: R() * 5, m: R() * 2, q: R() * 30, P: R() * 50, tw: R() * 10,
    crest: R() * 10, hw: R() * 60, tail: R() * 10, uplift: R() * 120, mu: R(), c: R() * 500,
  }), 40);
  const pv = preVertedero({});
  const pz = prePozo({});
  const pt = preTalud({});
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
    id: 'D7',
    name: 'Herramientas de diseño de la sala: sin errores, criterios y gráficas',
    tolerance: '40 juegos de datos al azar en las seis herramientas: ninguna excepción ni valores NaN, indefinidos o infinitos (salvo los avisos de datos inválidos); el ancho del vertedero, el pozo y el talud propuestos cumplen sus verificaciones; las seis dibujan su gráfica',
    measured: `${r.calls} llamadas; excepciones ${r.thrown}; inválidos ${r.bad}; vertedero ${pv.outs[0]?.value}; pozo ${pz.outs[0]?.value}; talud ${pt.outs[0]?.value}; gráficas ${charts}, con errores ${badSvg}`,
    pass: r.thrown === 0 && r.bad === 0 && !!pv.checks?.every((c) => c.ok) && !!pt.checks?.every((c) => c.ok) && !pz.error && charts === 6 && badSvg === 0,
  });
}

// D8) La cresta con otras cargas y el pozo profundizado
{
  const rs = [0.2, 0.5, 0.75, 1, 1.2, 1.33, 1.6];
  const Cs = rs.map(crestC);
  const mono = Cs.every((c, i) => i === 0 || c > Cs[i - 1]);
  const base = spillScene({ H: 4, Hd: 4, L: 30 });
  // con el pozo justo en la profundidad que pide el resalto, queda dentro; un poco menos, se sale
  let D = 0;
  for (let k = 0; k < 60; k++) D = Math.max(0, stillingBasin(base.q, SPILL.P + D, 4).y2 - base.tw);
  const inside = spillScene({ H: 4, Hd: 4, L: 30, D: D + 1e-6 });
  const outside = spillScene({ H: 4, Hd: 4, L: 30, D: D - 0.01 });
  // pérdida del resalto: E1 − E2 igual a (y2 − y1)³/(4·y1·y2)
  const E = (y: number) => y + (inside.q * inside.q) / (2 * 9.81 * y * y);
  const lossE = E(inside.y1) - E(inside.y2), lossF = Math.pow(inside.y2 - inside.y1, 3) / (4 * inside.y1 * inside.y2);
  record({
    id: 'D8',
    name: 'Coeficiente de la cresta con otras cargas, pozo profundizado y pérdida del resalto',
    tolerance: 'C(H/Hd = 1) es el de diseño (1e-12) y crece con la carga; con el pozo a la profundidad justa el resalto queda dentro y 1 cm menos lo saca; la pérdida por energía y por la fórmula del resalto coinciden (1e-9)',
    measured: `C = ${Cs.map((c) => c.toFixed(3)).join(', ')} para H/Hd = ${rs.join(', ')}; pozo justo ${D.toFixed(3)} m (dentro ${inside.inBasin}, 1 cm menos ${outside.inBasin}); pérdida ${lossE.toFixed(4)} m y ${lossF.toFixed(4)} m`,
    pass: Math.abs(crestC(1) - SPILL.C) < 1e-12 && mono && inside.inBasin && !outside.inBasin && rel(lossE, lossF) < 1e-9,
  });
}

finish('docs/presas/PRUEBAS_PRESAS.md', 'Pruebas de la sala «Presas y embalses»', 'npm run test:dams');

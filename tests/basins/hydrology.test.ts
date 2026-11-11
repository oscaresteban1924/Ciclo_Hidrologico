// Pruebas de la sala «Cuencas: de la lluvia al caudal» (npm run test:basins). Informe en docs/cuencas/PRUEBAS_CUENCAS.md.

import { finish, record, rel, robust } from '../harness';
import {
  COVERS,
  IDF_ILUS,
  alternatingBlocks,
  basinModel,
  convolve,
  coverC,
  effectiveBlocks,
  gumbelK,
  gumbelQ,
  gumbelT,
  idf,
  mean,
  rational,
  risk,
  scsRunoff,
  scsUnitHydrograph,
  std,
  syntheticSeries,
  tForRisk,
  tcKirpich,
  tcSCS,
  tcTemez,
} from '../../src/basins/hydrology';
import { calcGumbel, calcRacional, calcSCS, calcTc, preCaudal, preRetencion, preRiesgo } from '../../src/basins/design';
import { planFor } from '../../src/canals/designPlans';
import { DEFAULT_SCENE, detention, exceedances, lengthFor, mixFor, resample, sceneModel, simulateLives, volumeAbove, volumeOf } from '../../src/basins/scene';
import { RIVER, RIVER_HOUSES, groundAt, houseWater, riverDepth, riverQ } from '../../src/basins/river';
import { chartSVG } from '../../src/canals/plan';

// C1) Número de curva: ejemplo de la TR-55 (P = 5,0 pulgadas, CN = 80 → Q = 2,89 pulgadas) y umbral Ia = 0,2·S
{
  const Q = scsRunoff(5 * 25.4, 80) / 25.4;
  const S = 25400 / 80 - 254;
  const below = scsRunoff(0.19 * S, 80);
  const imp = scsRunoff(50, 98);
  record({
    id: 'C1',
    name: 'Escorrentía con el número de curva del SCS',
    tolerance: 'P = 5,0 pulgadas con CN = 80 da 2,89 pulgadas (TR-55, tabla 2-1; error < 0,5 %); con P menor que Ia = 0,2·S no hay escorrentía; una superficie impermeable (CN 98) con 50 mm da la escorrentía de la fórmula escrita a mano (S = 5,18 mm, Ia = 1,04 mm: 44,28 mm, casi 90 %; error < 1e-6)',
    measured: `Q = ${Q.toFixed(3)} pulgadas; P = 0,19·S → ${below} mm; CN 98 con 50 mm → ${imp.toFixed(1)} mm`,
    pass: rel(Q, 2.89) < 0.005 && below === 0 && rel(imp, (50 - 0.2 * (25400 / 98 - 254)) ** 2 / (50 - 0.2 * (25400 / 98 - 254) + (25400 / 98 - 254))) < 1e-6 && Math.abs(imp - 44.28) < 0.01,
  });
}

// C2) Tiempo de concentración: fórmulas escritas a mano y orden esperado
{
  const L = 1400, S = 0.12;
  const k = tcKirpich(L, S), kh = 0.0195 * Math.pow(1400, 0.77) * Math.pow(0.12, -0.385);
  const t = tcTemez(L, S), th = 60 * 0.3 * Math.pow(1.4 / Math.pow(0.12, 0.25), 0.76);
  const sA = tcSCS(L, S, 60), sB = tcSCS(L, S, 90);
  record({
    id: 'C2',
    name: 'Tiempo de concentración: Kirpich, Témez y retardo del SCS',
    tolerance: 'Kirpich y Témez iguales a la fórmula escrita a mano (error < 1e-9); el retardo del SCS baja al subir el CN (la urbanización acelera el agua); los tres bajan si la pendiente sube',
    measured: `Kirpich ${k.toFixed(2)} min, Témez ${t.toFixed(2)} min, SCS ${sA.toFixed(2)} min (CN 60) y ${sB.toFixed(2)} min (CN 90)`,
    pass: rel(k, kh) < 1e-9 && rel(t, th) < 1e-9 && sB < sA && tcKirpich(L, 0.3) < k && tcTemez(L, 0.3) < t && tcSCS(L, 0.3, 60) < sA,
  });
}

// C3) Método racional (unidades) y coeficientes de escorrentía
{
  const q = rational(1, 1, 1);
  const cT = coverC('pavimento', 10), cT2 = coverC('pavimento', 2), c100 = coverC('bosque', 100);
  record({
    id: 'C3',
    name: 'Método racional y coeficientes de escorrentía de la tabla 15.1.1 de Chow et al. (1988)',
    tolerance: 'C = 1, i = 1 mm/h y A = 1 ha dan 1/360 = 0,002778 m³/s (error < 1e-9); los coeficientes de la tabla se recuperan en sus períodos de retorno (asfalto 0,73 con T = 2 y 0,81 con T = 10; bosque en ladera 0,52 con T = 100) y crecen con T',
    measured: `Q = ${q.toFixed(6)} m³/s; asfalto ${cT2.toFixed(3)} y ${cT.toFixed(3)}; bosque ${c100.toFixed(3)}`,
    pass: rel(q, 1 / 360) < 1e-9 && Math.abs(cT2 - 0.73) < 1e-9 && Math.abs(cT - 0.81) < 1e-9 && Math.abs(c100 - 0.52) < 1e-9 && coverC('pasto', 50) > coverC('pasto', 5),
  });
}

// C4) Bloques alternos: la lámina total es la de la curva IDF para la duración del aguacero; el máximo queda en el centro
{
  const T = 25, D = 120, dt = 10;
  const b = alternatingBlocks(T, D, dt);
  const tot = b.reduce((a, x) => a + x, 0), ref = (idf(T, D) * D) / 60;
  const kmax = b.indexOf(Math.max(...b));
  record({
    id: 'C4',
    name: 'Hietograma de diseño por bloques alternos',
    tolerance: 'aguacero de 120 min con bloques de 10 min y T = 25 años: la suma de los bloques es la lámina de la curva IDF para 120 min (error < 1e-9); el bloque mayor es el de 10 min de la curva y queda en el centro (bloque 6 de 12)',
    measured: `suma ${tot.toFixed(3)} mm (IDF ${ref.toFixed(3)} mm); bloque mayor ${Math.max(...b).toFixed(3)} mm en la posición ${kmax + 1} (IDF 10 min: ${((idf(T, 10) * 10) / 60).toFixed(3)} mm)`,
    pass: rel(tot, ref) < 1e-9 && kmax === 5 && rel(Math.max(...b), (idf(T, 10) * 10) / 60) < 1e-9,
  });
}

// C5) Hidrograma unitario: volumen de 1 mm sobre la cuenca, pico y convolución que conserva el volumen
{
  const A = 0.8, tc = 0.5, dt = 5 / 60;
  const u = scsUnitHydrograph(A, tc, dt);
  const vol = u.uh.reduce((a, q) => a + q * dt * 3600, 0);
  const eff = effectiveBlocks(alternatingBlocks(10, 60, 5), (P) => scsRunoff(P, 80));
  const hy = convolve(eff, u.uh);
  const Qmm = eff.reduce((a, x) => a + x, 0);
  const vh = hy.reduce((a, q) => a + q * dt * 3600, 0);
  record({
    id: 'C5',
    name: 'Hidrograma unitario triangular del SCS y convolución',
    tolerance: 'el hidrograma unitario lleva 1 mm sobre 0,8 km² = 800 m³ (error < 1e-9); tp = Δt/2 + 0,6·tc y qp = 0,208·A/tp como en NEH-630; el hidrograma de la convolución lleva el volumen de la lluvia efectiva (error < 1e-9)',
    measured: `volumen unitario ${vol.toFixed(3)} m³; tp ${u.tp.toFixed(4)} h; qp ${u.qp.toFixed(4)} m³/s·mm; escorrentía ${Qmm.toFixed(2)} mm → ${vh.toFixed(1)} m³ (esperado ${(Qmm * 800).toFixed(1)} m³)`,
    pass: rel(vol, 800) < 1e-9 && rel(u.tp, dt / 2 + 0.3) < 1e-12 && rel(u.qp, (0.208 * A) / u.tp) < 1e-12 && rel(vh, Qmm * 800) < 1e-9,
  });
}

// C6) Gumbel: factores de frecuencia de Chow et al. (1988) y ajuste por momentos de una serie sintética larga
{
  const k5 = gumbelK(5), k100 = gumbelK(100), k2 = gumbelK(2);
  const s = syntheticSeries(100, 30, 20000, 3);
  const m = mean(s), sd = std(s);
  const q100 = gumbelQ(100, 30, 100);
  const tBack = gumbelT(100, 30, q100);
  record({
    id: 'C6',
    name: 'Frecuencia de crecientes con Gumbel',
    tolerance: 'K_T = 0,719 (T = 5), 3,137 (T = 100) y −0,164 (T = 2), los de la tabla de Chow et al. (1988) (error < 0,002); una serie sintética de 20 000 años recupera la media y la desviación pedidas (error < 2 %); el período de retorno de Q100 vuelve a dar 100 años (error < 1e-6)',
    measured: `K5 ${k5.toFixed(4)}, K100 ${k100.toFixed(4)}, K2 ${k2.toFixed(4)}; serie: media ${m.toFixed(2)}, desviación ${sd.toFixed(2)}; T(Q100) = ${tBack.toFixed(6)}`,
    pass: Math.abs(k5 - 0.719) < 0.002 && Math.abs(k100 - 3.137) < 0.002 && Math.abs(k2 + 0.164) < 0.002 && rel(m, 100) < 0.02 && rel(sd, 30) < 0.02 && Math.abs(tBack - 100) < 1e-6,
  });
}

// C7) Riesgo de superación
{
  const r = risk(100, 50), back = tForRisk(r, 50), r2 = risk(2, 1);
  record({
    id: 'C7',
    name: 'Riesgo de que la creciente de diseño se supere en la vida útil',
    tolerance: 'T = 100 años en 50 años: R = 1 − 0,99^50 = 39,5 % (error < 0,1 %); el período de retorno para ese riesgo vuelve a dar 100 años (error < 1e-9); T = 2 años en 1 año: 50 %',
    measured: `R = ${(r * 100).toFixed(2)} %; T = ${back.toFixed(6)} años; R(2, 1) = ${(r2 * 100).toFixed(1)} %`,
    pass: Math.abs(r - (1 - Math.pow(0.99, 50))) < 1e-12 && rel(r, 0.395) < 0.001 && Math.abs(back - 100) < 1e-6 && Math.abs(r2 - 0.5) < 1e-12,
  });
}

// C8) Modelo de la escena: urbanizar sube el pico y el volumen; el método racional se marca fuera de rango con 80 ha o más
{
  const base = basinModel({});
  const urb = basinModel({ mix: { bosque: 0.1, pasto: 0.1, cultivo: 0, barrio: 0.6, pavimento: 0.2 } });
  const big = basinModel({ A: 300 });
  const vol = base.vol, volMm = base.Q * base.inp.A * 10;
  record({
    id: 'C8',
    name: 'Cuenca de la escena: coberturas, volumen y rango del método racional',
    tolerance: 'el volumen del hidrograma es la lámina de escorrentía por el área (error < 1e-6); con 80 % urbano el pico, el volumen y el C suben, y el tiempo de concentración no sube; con 300 ha el método racional queda fuera del rango del RAS (Art. 135)',
    measured: `volumen ${vol.toFixed(1)} m³ (lámina ${volMm.toFixed(1)} m³); pico ${base.Qpeak.toFixed(2)} → ${urb.Qpeak.toFixed(2)} m³/s; C ${base.C.toFixed(3)} → ${urb.C.toFixed(3)}; tc ${base.tc.used.toFixed(1)} → ${urb.tc.used.toFixed(1)} min; racional con 300 ha: ${big.rationalOk ? 'permitido' : 'fuera de rango'}`,
    pass: rel(vol, volMm) < 1e-6 && urb.Qpeak > base.Qpeak && urb.vol > base.vol && urb.C > base.C && urb.tc.used <= base.tc.used + 1e-9 && !big.rationalOk && base.rationalOk,
  });
}

// C9) Herramientas de diseño: robustez y criterios
{
  const fns = { calcTc, preCaudal, calcRacional, calcSCS, preRetencion, calcGumbel, preRiesgo };
  const r = robust(fns, (R) => ({
    L: R() * 8000, S: R() * 40, CN: R() * 110, A: R() * 400, imp: R() * 110, resto: ['bosque', 'pasto', 'cultivo', 'x'][Math.floor(R() * 4)], obra: ['res2', 'alc', 'canal', 'canalg', 'z'][Math.floor(R() * 5)], suelo: ['B', 'C', 'D', 'E'][Math.floor(R() * 4)],
    T: R() * 300, t: R() * 200, P: R() * 300, tc: R() * 200, D: R() * 300, imp0: R() * 60, imp1: R() * 100, h: R() * 3, serie: ['', '10 20', '38 52 41 66 47 35 58 44', 'a b c', '5 5 5 5 5 5'][Math.floor(R() * 5)], n: R() * 120, R: R() * 120, mu: R() * 200, sg: R() * 60,
  }));
  const big = preCaudal({ A: 150, L: 2500, S: 8, imp: 30, resto: 'pasto', obra: 'canal', suelo: 'C' });
  const small = preCaudal({ A: 40, L: 1200, S: 10, imp: 30, resto: 'pasto', obra: 'canal', suelo: 'C' });
  const ret = preRetencion({});
  const rk = preRiesgo({ n: 50, R: 10, obra: 'canal' });
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
  const ok = r.thrown === 0 && r.bad === 0 && big.outs.some((o) => o.value.includes('SCS')) && small.outs.some((o) => o.value === 'racional') && !!ret.outs[2] && Math.abs(Number(rk.outs[0].value.split(' ')[0].replace('.', '').replace(',', '.')) - 475) < 2 && charts === 7 && badSvg === 0;
  record({
    id: 'C9',
    name: 'Herramientas de diseño de la sala: sin errores, con los criterios del RAS y sus gráficas',
    tolerance: '300 juegos de datos al azar en las siete herramientas: ninguna excepción ni valores NaN, indefinidos o infinitos (salvo los avisos de datos inválidos); con 150 ha el caudal de diseño se calcula con el SCS y con 40 ha con el método racional (Art. 135); 10 % de riesgo en 50 años pide T ≈ 475 años; las siete dibujan su gráfica sin valores inválidos',
    measured: `${r.calls} llamadas; excepciones ${r.thrown}; inválidos ${r.bad}; 150 ha: ${big.outs.find((o) => o.label === 'Método')?.value}; 40 ha: ${small.outs.find((o) => o.label === 'Método')?.value}; riesgo: ${rk.outs[0].value}; gráficas ${charts}, con errores ${badSvg}`,
    pass: ok,
  });
}

// C10) Tanque de retención con salida limitada: masa, volumen necesario y rebose
{
  const r0 = sceneModel({ ...DEFAULT_SCENE, u: 0 });
  const r = sceneModel({ ...DEFAULT_SCENE, u: 0.6 });
  const Qlim = r0.Qpeak;
  const Vreq = volumeAbove(r.hydro, r.dt, Qlim);
  const vin = volumeOf(r.hydro, r.dt);
  const cases = [0.3, 0.5, 1, 1.2].map((k) => ({ k, d: detention(r.hydro, r.dt, Qlim, k * Vreq) }));
  const massErr = Math.max(...cases.map((c) => Math.abs(vin - volumeOf(c.d.out, r.dt)) / vin));
  const full = cases.find((c) => c.k === 1)!.d, big = cases.find((c) => c.k === 1.2)!.d, small = cases.find((c) => c.k === 0.3)!.d;
  const fillOk = cases.every((c) => c.d.fill.every((f) => f >= -1e-12 && f <= 1 + 1e-12));
  record({
    id: 'C10',
    name: 'Tanque de retención: conserva la masa, guarda el volumen calculado y rebosa si es pequeño',
    tolerance: 'lo que entra es igual a lo que sale (error < 1e-9) con cuatro tamaños; con el volumen necesario (área del hidrograma sobre el pico de antes) el pico que sale no supera el de antes (1e-9) y el máximo guardado iguala ese volumen (error < 1e-6); con un tanque mayor no rebosa; con 30 % del volumen rebosa y el pico supera el de antes; la fracción llena queda entre 0 y 1',
    measured: `entra ${vin.toFixed(1)} m³, error de masa ${massErr.toExponential(1)}; necesario ${Vreq.toFixed(1)} m³; con él sale ${full.peakOut.toFixed(4)} m³/s (antes ${Qlim.toFixed(4)}), guardó ${full.maxStored.toFixed(1)} m³; con 120 % rebosa ${big.overflow.toFixed(2)} m³; con 30 % rebosa ${small.overflow.toFixed(0)} m³ y sale ${small.peakOut.toFixed(3)} m³/s`,
    pass: massErr < 1e-9 && full.peakOut <= Qlim + 1e-9 && rel(full.maxStored, Vreq) < 1e-6 && big.overflow < 1e-6 && small.overflow > 0 && small.peakOut > Qlim && fillOk,
  });
}

// C11) La cuenca de la escena: coberturas, largo del cauce y remuestreo para dibujar
{
  const m = mixFor(0.25);
  const sum = Object.values(m).reduce((a, x) => a + x, 0);
  const L60 = lengthFor(60);
  const r = sceneModel(DEFAULT_SCENE);
  const q = resample(r.hydro, r.dt, 3);
  const v0 = volumeOf(r.hydro, r.dt), v1 = volumeOf(q, 3);
  const back = resample(r.hydro, r.dt, r.dt);
  const peak0 = Math.max(...r.hydro), peak1 = Math.max(...q);
  record({
    id: 'C11',
    name: 'Cuenca de la escena: coberturas, largo del cauce y remuestreo del hidrograma',
    tolerance: 'las coberturas suman 1 y con 25 % urbanizado dan 20 % de barrio y 5 % de vías; L ≈ 1,8·√A da unos 1 400 m con 60 ha (±1 %); remuestrear a 3 min conserva el volumen (±3 %) y el pico (±5 %); con el mismo paso devuelve los mismos valores (1e-9)',
    measured: `suma ${sum.toFixed(6)}, barrio ${m.barrio.toFixed(3)}, vías ${m.pavimento.toFixed(3)}; L(60 ha) = ${L60.toFixed(0)} m; volumen ${v0.toFixed(0)} → ${v1.toFixed(0)} m³; pico ${peak0.toFixed(3)} → ${peak1.toFixed(3)} m³/s; mismo paso: error ${Math.max(...back.map((x, k) => Math.abs(x - r.hydro[k]))).toExponential(1)}`,
    pass: Math.abs(sum - 1) < 1e-12 && Math.abs(m.barrio - 0.2) < 1e-12 && Math.abs(m.pavimento - 0.05) < 1e-12 && rel(L60, 1400) < 0.01 && rel(v1, v0) < 0.03 && rel(peak1, peak0) < 0.05 && back.every((x, k) => Math.abs(x - r.hydro[k]) < 1e-9),
  });
}

// C12) El riesgo, simulado; el río y sus casas
{
  const s100 = simulateLives(70, 25, 100, 50, 20000, 2024);
  const s10 = simulateLives(70, 25, 10, 20, 20000, 7);
  const e = exceedances(70, 25, 50, 200000, 99);
  const f100 = s100.hit / s100.lives, f10 = s10.hit / s10.lives;
  const R100 = risk(100, 50), R10 = risk(10, 20);
  // río: el nivel sube con el caudal, a cauce lleno el agua llega a la orilla, y las casas se mojan en orden de altura
  const yb = riverDepth(riverQ(RIVER.bank));
  const ys = [50, 100, 150, 200, 300].map(riverDepth);
  const mono = ys.every((y, k) => k === 0 || y > ys[k - 1]);
  const wet = [3.2, 3.6, 4.1].map((y) => houseWater(y).filter((w) => w > 0.05).length);
  const sorted = RIVER_HOUSES.every((h) => Math.abs(h.y - groundAt(h.z)) < 1e-12);
  record({
    id: 'C12',
    name: 'Riesgo simulado contra la fórmula, y el nivel del río con sus casas',
    tolerance: '20 000 vidas: la fracción con al menos una creciente mayor que la de T años queda a menos de 1 punto de R = 1 − (1 − 1/T)^n (T = 100, n = 50 y T = 10, n = 20); en 200 000 años la de 50 años se supera en promedio cada 50 ± 2,5 años; a cauce lleno el nivel es la orilla (±1 mm); el nivel sube con el caudal; con más nivel no se secan casas; cada casa está sobre el terreno',
    measured: `T 100, n 50: ${(f100 * 100).toFixed(2)} % contra ${(R100 * 100).toFixed(2)} %; T 10, n 20: ${(f10 * 100).toFixed(2)} % contra ${(R10 * 100).toFixed(2)} %; cada ${e.every.toFixed(2)} años; cauce lleno ${yb.toFixed(4)} m; casas con agua a 3,2 / 3,6 / 4,1 m: ${wet.join(' / ')}`,
    pass: Math.abs(f100 - R100) < 0.01 && Math.abs(f10 - R10) < 0.01 && Math.abs(e.every - 50) < 2.5 && Math.abs(yb - RIVER.bank) < 1e-3 && mono && wet[0] <= wet[1] && wet[1] <= wet[2] && wet[2] > 0 && sorted,
  });
}

void IDF_ILUS;
void COVERS;
finish('docs/cuencas/PRUEBAS_CUENCAS.md', 'Pruebas de la sala «Cuencas: de la lluvia al caudal»', 'npm run test:basins');

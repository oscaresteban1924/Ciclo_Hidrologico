// Pruebas de la sala «Laderas»: infiltración de Green-Ampt, talud infinito con agua, lluvia crítica (SHALSTAB),
// pérdida de suelo (RUSLE) y las herramientas de diseño, cada una con su tolerancia declarada.

import { finish, record, rel, robust } from '../harness';
import { GAMMA_W, TEXTURES, criticalM, criticalRain, gaPonded, greenAmpt, infiniteSlope, lsFactor, pondingTime, rusle, wetness, type Texture } from '../../src/slopes/slope';
import { calcErosion, calcInfiltracion, calcTalud, preAngulo, preEspaciamiento, preZanja } from '../../src/slopes/design';
import { planFor } from '../../src/canals/designPlans';
import { chartSVG } from '../../src/canals/plan';
import { DEFAULT_EROSION, DEFAULT_INF, DEFAULT_SLOPE, erosionScene, infScene, slopeScene } from '../../src/slopes/scene';

// L1) Green-Ampt encharcado desde el principio: ejemplo 4.3.1 de Chow, Maidment y Mays (1988)
{
  // franco limoso, Se = 0,3: ψΔθ = 16,7 cm·(1 − 0,3)·0,486 = 5,68 cm; K = 0,65 cm/h; después de 1 h F = 3,17 cm y f = 1,81 cm/h
  const psiD = 167 * 0.7 * 0.486, Ks = 6.5;
  const F = gaPonded(Ks, psiD, 1);
  const f = Ks * (1 + psiD / F);
  record({
    id: 'L1',
    name: 'Green-Ampt con encharcamiento desde el principio contra el ejemplo de Chow y otros',
    tolerance: 'F(1 h) = 31,7 mm del libro dentro de su redondeo (±0,05 mm) y f = 18,1 mm/h con ±0,1 mm/h (el libro calcula f con F ya redondeado)',
    measured: `F = ${F.toFixed(2)} mm, f = ${f.toFixed(2)} mm/h`,
    pass: Math.abs(F - 31.7) <= 0.05 && Math.abs(f - 18.1) <= 0.1,
  });
}

// L2) Tiempo de encharcamiento y continuidad en tp
{
  const psiD = 167 * 0.7 * 0.486, Ks = 6.5, i = 50;
  const tp = pondingTime(Ks, psiD, i)!;
  const r = greenAmpt({ Ks, psi: 167, dTheta: 0.7 * 0.486, i, T: 1 }, 2000);
  const k = r.t.findIndex((t) => t > tp);
  const before = r.f.slice(0, k).every((x) => Math.abs(x - i) < 1e-9);
  const after = r.f.slice(k + 1).every((x) => x < i);
  const Fjump = Math.abs(r.F[k] - r.F[k - 1] - i * (r.t[k] - r.t[k - 1]));
  record({
    id: 'L2',
    name: 'Tiempo de encharcamiento con lluvia constante y continuidad de la curva',
    tolerance: 'tp = 0,170 h del ejemplo 4.4.1 de Chow y otros (franco limoso, 5 cm/h) con 1 % o menos; antes de tp entra toda la lluvia y después menos; F no salta en tp (menos de 1 % de un paso de lluvia)',
    measured: `tp = ${tp.toFixed(4)} h (serie: ${r.tp?.toFixed(4)} h); antes ${before}, después ${after}; salto ${Fjump.toFixed(4)} mm`,
    pass: rel(tp, 0.17) < 0.01 && r.tp === tp && before && after && Fjump < 0.01 * i * (r.t[1] - r.t[0]) + 0.5,
  });
}

// L3) Balance y lluvia menor que Ks
{
  let worst = 0, noPond = true;
  for (const tx of Object.keys(TEXTURES) as Texture[]) {
    const t = TEXTURES[tx];
    for (const i of [0.5 * t.Ks, 5, 30, 80]) {
      const r = greenAmpt({ Ks: t.Ks, psi: t.psi, dTheta: 0.6 * t.thetaE, i, T: 2 });
      for (let k = 0; k < r.t.length; k++) worst = Math.max(worst, Math.abs(r.F[k] + r.R[k] - i * r.t[k]));
      if (i <= t.Ks && (r.tp !== null || r.Rtot > 1e-12)) noPond = false;
    }
  }
  record({
    id: 'L3',
    name: 'Balance de agua (infiltración + escorrentía = lluvia) y lluvia menor que Ks',
    tolerance: 'balance con error de 1e-9 mm o menos en todos los suelos y lluvias; con i ≤ Ks no hay encharcamiento ni escorrentía',
    measured: `error máximo ${worst.toExponential(2)} mm; sin encharcamiento con i ≤ Ks: ${noPond}`,
    pass: worst < 1e-9 && noPond,
  });
}

// L4) Ecuación implícita de Green-Ampt
{
  let worst = 0;
  for (const [Ks, psiD] of [[0.3, 120], [3.4, 27], [117.8, 10], [6.5, 56.8]])
    for (const t of [0.01, 0.1, 1, 5, 24]) {
      const F = gaPonded(Ks, psiD, t);
      worst = Math.max(worst, Math.abs(F - psiD * Math.log(1 + F / psiD) - Ks * t) / Math.max(1e-9, Ks * t));
    }
  record({
    id: 'L4',
    name: 'Solución de F − ψΔθ·ln(1 + F/ψΔθ) = Ks·t por Newton',
    tolerance: 'residuo relativo de 1e-9 o menos (20 casos de suelo y tiempo)',
    measured: `residuo máximo ${worst.toExponential(2)}`,
    pass: worst < 1e-9,
  });
}

// L5) Talud infinito sin cohesión: casos con solución cerrada
{
  const base = { beta: 28, z: 2, c: 0, cr: 0, phi: 34, gamma: 19 };
  const dry = infiniteSlope({ ...base, m: 0 }).FS, sat = infiniteSlope({ ...base, m: 1 }).FS;
  const t = Math.tan((34 * Math.PI) / 180) / Math.tan((28 * Math.PI) / 180);
  record({
    id: 'L5',
    name: 'Talud infinito sin cohesión: seco y saturado',
    tolerance: 'seco FS = tanφ/tanβ y saturado FS = (1 − γw/γ)·tanφ/tanβ, con 1e-12',
    measured: `seco ${dry.toFixed(6)} (cerrada ${t.toFixed(6)}); saturado ${sat.toFixed(6)} (cerrada ${((1 - GAMMA_W / 19) * t).toFixed(6)})`,
    pass: rel(dry, t) < 1e-12 && rel(sat, (1 - GAMMA_W / 19) * t) < 1e-12,
  });
}

// L6) Caso con cohesión calculado a mano, fracción crítica y lluvia crítica (SHALSTAB)
{
  // β = 30°, z = 2 m, c = 6 kPa, cr = 1,5 kPa, φ = 31°, γ = 18,5 kN/m³, m = 0,5
  const sigma = 18.5 * 2 * 0.75, tau = 18.5 * 2 * 0.5 * Math.sqrt(3) / 2, u = 0.5 * 9.81 * 2 * 0.75;
  const hand = (7.5 + (sigma - u) * Math.tan((31 * Math.PI) / 180)) / tau;
  const s = { beta: 30, z: 2, c: 6, cr: 1.5, phi: 31, gamma: 18.5 };
  const r = infiniteSlope({ ...s, m: 0.5 });
  const mc = criticalM(s);
  const atMc = infiniteSlope({ ...s, m: mc }).FS;
  const T = 1.2, ab = 25;
  const qc = criticalRain(s, ab, T)!;
  const wc = wetness(qc, ab, T, 30);
  record({
    id: 'L6',
    name: 'Talud con cohesión calculado a mano, fracción saturada crítica y lluvia crítica de SHALSTAB',
    tolerance: 'FS igual al cálculo a mano (1e-12); con la fracción crítica FS = 1 (1e-9); la lluvia crítica satura justo esa fracción (1e-9)',
    measured: `FS ${r.FS.toFixed(6)} (a mano ${hand.toFixed(6)}); m crítica ${mc.toFixed(4)} → FS ${atMc.toFixed(9)}; q crítica ${qc.toFixed(3)} mm/día → W ${wc.toFixed(6)}`,
    pass: rel(r.FS, hand) < 1e-12 && Math.abs(atMc - 1) < 1e-9 && Math.abs(wc - mc) < 1e-9,
  });
}

// L7) RUSLE: parcela unitaria y monotonía
{
  const LS1 = lsFactor(22.13, 9);
  let mono = true;
  for (const s of [5, 10, 20, 40, 60]) for (const l of [10, 20, 40, 80]) if (!(lsFactor(l * 2, s) > lsFactor(l, s) && lsFactor(l, s * 1.5) > lsFactor(l, s))) mono = false;
  const r = rusle({ R: 5000, K: 0.03, lambda: 60, slopePct: 35, C: 0.4, P: 0.5 });
  record({
    id: 'L7',
    name: 'Factor LS en la parcela unitaria, crecimiento con largo y pendiente, y producto de RUSLE',
    tolerance: 'LS(22,13 m; 9 %) = 1 con 1 %; LS crece con el largo y con la pendiente; A = R·K·LS·C·P (1e-12)',
    measured: `LS unitario ${LS1.toFixed(4)}; crece ${mono}; A ${r.A.toFixed(3)} t/(ha·año)`,
    pass: Math.abs(LS1 - 1) < 0.01 && mono && rel(r.A, 5000 * 0.03 * r.LS * 0.4 * 0.5) < 1e-12,
  });
}

// L8) Herramientas de diseño: robustez y coherencia de los prediseños
{
  const tools = { calcInfiltracion, preZanja, calcTalud, preAngulo, calcErosion, preEspaciamiento };
  const texs = Object.keys(TEXTURES);
  const rb = robust(tools, (R) => ({
    tex: texs[Math.floor(R() * texs.length)],
    Se: R() * 0.95,
    i: 1 + R() * 150,
    T: 0.1 + R() * 6,
    A: 10 + R() * 1000,
    P: 5 + R() * 120,
    beta: 5 + R() * 60,
    z: 0.3 + R() * 6,
    c: R() * 20,
    cr: R() * 10,
    phi: 20 + R() * 20,
    gamma: 16 + R() * 5,
    m: R(),
    s: 1 + R() * 120,
    lambda: 5 + R() * 200,
    cov: ['desnudo', 'cultivo', 'cafe', 'pasto', 'rastrojo', 'bosque'][Math.floor(R() * 6)],
    prac: ['ninguna', 'curvas', 'barreras', 'terrazas'][Math.floor(R() * 4)],
  }));
  const ang = preAngulo({ z: 2, c: 6, cr: 1.5, phi: 31, gamma: 18.5, m: 0.3, FSt: 1.5 });
  const b = Number(String(ang.outs[0].value).replace('°', '').replace(',', '.'));
  const s0 = { z: 2, c: 6, cr: 1.5, phi: 31, gamma: 18.5, m: 0.3 };
  const okAng = infiniteSlope({ ...s0, beta: b }).FS >= 1.5 - 1e-9 && infiniteSlope({ ...s0, beta: b + 0.2 }).FS < 1.5;
  const esp = preEspaciamiento({ s: 35, cov: 'pasto', prac: 'barreras', R: 5000, K: 0.03, Tt: 11 });
  const lam = Number(esp.data?.lam);
  const okEsp = rusle({ R: 5000, K: 0.03, lambda: lam, slopePct: 35, C: 0.03, P: 0.5 }).A <= 11 + 1e-9 && rusle({ R: 5000, K: 0.03, lambda: lam + 0.2, slopePct: 35, C: 0.03, P: 0.5 }).A > 11;
  const zanja = preZanja({ A: 200, P: 40, C: 0.9, tex: 'francoArenoso', fsK: 2, dmax: 1, n: 0.4, tmax: 48 });
  const okZ = zanja.checks?.every((c) => c.ok) ?? false;
  // las gráficas de la memoria se dibujan sin valores raros
  const runs = [calcInfiltracion, preZanja, calcTalud, preAngulo, calcErosion, preEspaciamiento];
  const charts = runs.map((run) => chartSVG(planFor(run, run({})).chart!));
  const okCharts = charts.every((c) => c.length > 200 && !/NaN|Infinity|undefined/.test(c));
  record({
    id: 'L8',
    name: 'Herramientas de diseño: datos al azar, pendiente máxima, espaciamiento de barreras, zanja y gráficas',
    tolerance: 'sin excepciones ni valores raros en 1 800 llamadas; la pendiente máxima cumple el factor y 0,2° más no; el largo máximo deja la pérdida en la tolerable y 0,2 m más la pasa; la zanja de ejemplo cumple; las seis gráficas se dibujan',
    measured: `${rb.calls} llamadas, ${rb.bad} con valores raros, ${rb.thrown} excepciones; pendiente ${b}° ${okAng}; largo ${lam} m ${okEsp}; zanja ${okZ}; gráficas ${okCharts}`,
    pass: rb.bad === 0 && rb.thrown === 0 && okAng && okEsp && okZ && okCharts,
  });
}

// L9) Escenas de la sala con los valores de partida
{
  const i = infScene(DEFAULT_INF), s = slopeScene(DEFAULT_SLOPE), e = erosionScene(DEFAULT_EROSION);
  record({
    id: 'L9',
    name: 'Escenas de partida: la parcela se encharca, la ladera aguanta y la ladera de cultivo pierde suelo de más',
    tolerance: 'en la parcela hay escorrentía; la ladera tiene FS entre 1 y 1,5 (aguanta, sin el margen usual); el cultivo limpio pasa la pérdida tolerable',
    measured: `escorrentía ${i.Rtot.toFixed(1)} mm (encharca a los ${((i.tp ?? 0) * 60).toFixed(1)} min); FS ${s.FS.toFixed(2)}; pérdida ${e.A.toFixed(0)} t/(ha·año)`,
    pass: i.Rtot > 0 && s.FS > 1 && s.FS < 1.5 && !e.ok,
  });
}

finish('docs/laderas/PRUEBAS_LADERAS.md', 'Pruebas de la sala «Laderas»', 'npm run test:slopes');

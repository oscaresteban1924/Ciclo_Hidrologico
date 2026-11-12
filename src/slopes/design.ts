// Herramientas de diseño de la sala «Laderas»: funciones puras (datos del formulario → resultados, paso a paso y
// verificaciones) con su gráfica registrada para la memoria. Son prediseños académicos.

import { f, type Result, type Vals } from '../canals/designCalc';
import { registerPlan } from '../canals/designPlans';
import type { XY } from '../canals/plan';
import type { ToolSet } from '../canals/design';
import { COVERS, PRACTICES, TEXTURES, criticalM, greenAmpt, infiniteSlope, lsExponent, lsFactor, practiceP, sFactor, type Cover, type Practice, type Texture } from './slope';

export const ROOM = 'Laderas';
/** Factor de seguridad usual para taludes en condición estática (criterio de enseñanza). */
export const FS_TARGET = 1.5;

const num = (v: number | string | undefined, def: number) => {
  if (v === undefined) return def;
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};
const bad = (error: string): Result => ({ outs: [], steps: [], kid: '', error });
const N = (x: number | string | undefined) => (typeof x === 'number' ? x : Number(x));
const tex = (v: Vals): Texture => (String(v.tex ?? 'franco') in TEXTURES ? (String(v.tex ?? 'franco') as Texture) : 'franco');

// ------------------------------------------------------------------ infiltración

export function calcInfiltracion(v: Vals): Result {
  const t = TEXTURES[tex(v)];
  const Se = num(v.Se, 0.3), i = num(v.i, 30), T = num(v.T, 1);
  if (!(Se >= 0 && Se < 1 && i > 0 && T > 0)) return bad('Revisa los datos: la saturación entre 0 y 0,99, y la lluvia y la duración mayores que cero.');
  const dTheta = (1 - Se) * t.thetaE, psiD = t.psi * dTheta;
  const r = greenAmpt({ Ks: t.Ks, psi: t.psi, dTheta, i, T });
  return {
    outs: [
      { label: 'Agua que entra al suelo', value: `${f(r.Ftot, 1)} mm de ${f(r.P, 1)} mm`, kid: true },
      { label: 'Agua que escurre', value: `${f(r.Rtot, 1)} mm (${f((r.Rtot / r.P) * 100, 0)} %)`, kid: true },
      { label: 'Encharcamiento', value: r.tp === null ? 'no ocurre' : `a los ${f(r.tp * 60, 1)} min`, kid: true },
      { label: 'Profundidad del frente de humedecimiento', value: `${f(r.front / 10, 1)} cm` },
      { label: 'Capacidad de infiltración al final', value: `${f(r.fcap[r.fcap.length - 1], 1)} mm/h` },
    ],
    steps: [
      `Suelo ${t.name.toLowerCase()} (Rawls y otros, 1983): Ks = ${f(t.Ks, 1)} mm/h, ψ = ${f(t.psi, 1)} mm, θe = ${f(t.thetaE, 3)}.`,
      `Déficit de humedad: Δθ = (1 − Se)·θe = (1 − ${f(Se, 2)})·${f(t.thetaE, 3)} = ${f(dTheta, 3)}; ψΔθ = ${f(psiD, 1)} mm.`,
      i <= t.Ks
        ? `La lluvia (${f(i, 1)} mm/h) no supera Ks: todo el agua entra y no se encharca.`
        : `Encharcamiento con lluvia constante: tp = Ks·ψΔθ/(i·(i − Ks)) = ${f(t.Ks, 1)}·${f(psiD, 1)}/(${f(i, 1)}·${f(i - t.Ks, 1)}) = ${f((t.Ks * psiD) / (i * (i - t.Ks)), 3)} h${r.tp === null ? ', después de que termina la lluvia: no se encharca' : ''}.`,
      r.tp === null ? `Infiltración acumulada: F = i·T = ${f(r.Ftot, 1)} mm.` : `Desde tp, F sigue F − ψΔθ·ln(1 + F/ψΔθ) = Ks·(t − tp + t'), con F(tp) = i·tp (Mein y Larson): al final F = ${f(r.Ftot, 1)} mm.`,
      `Escorrentía = lluvia − infiltración = ${f(r.P, 1)} − ${f(r.Ftot, 1)} = ${f(r.Rtot, 1)} mm. Frente de humedecimiento: F/Δθ = ${f(r.front / 10, 1)} cm.`,
    ],
    kid: r.tp === null ? `Toda la lluvia entra al suelo: ${f(r.Ftot, 0)} mm.` : `El suelo se llena a los ${f(r.tp * 60, 0)} minutos y desde ahí escurren ${f(r.Rtot, 0)} mm.`,
    data: { kind: 'infiltracion', tex: tex(v), Se, i, T },
  };
}

export function preZanja(v: Vals): Result {
  const t = TEXTURES[tex(v)];
  const A = num(v.A, 200), P = num(v.P, 40), C = num(v.C, 0.9), fsK = num(v.fsK, 2), dmax = num(v.dmax, 1), n = num(v.n, 0.4), tmax = num(v.tmax, 48);
  if (!(A > 0 && P > 0 && C > 0 && C <= 1 && fsK >= 1 && dmax > 0 && n > 0 && n < 1 && tmax > 0)) return bad('Revisa los datos: todos mayores que cero, C hasta 1, factor de seguridad de 1 o más y porosidad entre 0 y 1.');
  const V = (C * P * A) / 1000;
  const k = t.Ks / fsK / 1000; // m/h por el fondo
  const dDrain = (k * tmax) / n; // profundidad que alcanza a vaciarse en tmax
  const d = Math.min(dmax, dDrain);
  const Ab = V / (n * d);
  const tDrain = (n * d) / k;
  return {
    outs: [
      { label: 'Volumen que llega', value: `${f(V, 2)} m³`, kid: true },
      { label: 'Área del fondo de la zanja', value: `${f(Ab, 1)} m²`, kid: true },
      { label: 'Profundidad de grava', value: `${f(d, 2)} m` },
      { label: 'Tiempo de vaciado', value: `${f(tDrain, 1)} h` },
    ],
    steps: [
      `Volumen de la lluvia de diseño que sale del área dura: V = C·P·A = ${f(C, 2)}·${f(P, 0)} mm·${f(A, 0)} m² = ${f(V, 2)} m³.`,
      `Infiltración por el fondo: Ks/FS = ${f(t.Ks, 1)}/${f(fsK, 1)} = ${f(k * 1000, 2)} mm/h (${t.name.toLowerCase()}).`,
      `La grava (porosidad ${f(n, 2)}) se debe vaciar en ${f(tmax, 0)} h: puede tener hasta ${f(dDrain, 2)} m; se usa ${f(d, 2)} m.`,
      `Área del fondo: V/(n·d) = ${f(V, 2)}/(${f(n, 2)}·${f(d, 2)}) = ${f(Ab, 1)} m². Vaciado: n·d/(Ks/FS) = ${f(tDrain, 1)} h.`,
    ],
    checks: [
      { name: `Se vacía en ${f(tmax, 0)} h o menos`, ok: tDrain <= tmax + 1e-9, value: `${f(tDrain, 1)} h` },
      { name: 'El suelo deja pasar agua (Ks de 3,6 mm/h o más)', ok: t.Ks >= 3.6, value: `${f(t.Ks, 1)} mm/h` },
    ],
    kid: `Una zanja con piedras de ${f(Ab, 0)} m² guarda la lluvia del techo y la devuelve al suelo despacio.`,
    data: { kind: 'zanja', V, k: k * 1000, n, d },
  };
}

// ------------------------------------------------------------------ talud

function slopeVals(v: Vals) {
  return { beta: num(v.beta, 30), z: num(v.z, 2), c: num(v.c, 6), cr: num(v.cr, 1.5), phi: num(v.phi, 31), gamma: num(v.gamma, 18.5), m: num(v.m, 0.3) };
}

export function calcTalud(v: Vals): Result {
  const s = slopeVals(v);
  if (!(s.beta > 0 && s.beta < 80 && s.z > 0 && s.c >= 0 && s.cr >= 0 && s.phi > 0 && s.phi < 60 && s.gamma > 9.81 && s.m >= 0 && s.m <= 1)) return bad('Revisa los datos: ángulos entre 0 y 80°, espesor mayor que cero, γ mayor que la del agua y la fracción saturada entre 0 y 1.');
  const r = infiniteSlope(s);
  const mc = criticalM(s);
  return {
    outs: [
      { label: 'Factor de seguridad', value: f(r.FS, 2), kid: true },
      { label: 'Aporte de la cohesión (suelo y raíces)', value: f(r.cohesionTerm, 2) },
      { label: 'Aporte de la fricción', value: f(r.frictionTerm, 2) },
      { label: 'Fracción saturada con la que falla', value: mc <= 0 ? 'falla aun seca' : mc > 1 ? 'no falla ni saturada' : `${f(mc * 100, 0)} %`, kid: true },
    ],
    steps: [
      `Esfuerzos sobre el plano paralelo a la ladera a ${f(s.z, 2)} m: normal σ = γ·z·cos²β = ${f(r.sigma, 2)} kPa; cortante τ = γ·z·sinβ·cosβ = ${f(r.tau, 2)} kPa.`,
      `Presión del agua con ${f(s.m * 100, 0)} % del espesor saturado: u = m·γw·z·cos²β = ${f(r.u, 2)} kPa.`,
      `Resistencia: c + cr + (σ − u)·tanφ = ${f(s.c, 1)} + ${f(s.cr, 1)} + ${f(r.sigma - r.u, 2)}·tan ${f(s.phi, 1)}° = ${f(r.strength, 2)} kPa.`,
      `FS = resistencia/τ = ${f(r.FS, 3)} = ${f(r.cohesionTerm, 3)} (cohesión) + ${f(r.frictionTerm, 3)} (fricción) (Skempton y DeLory, 1957).`,
    ],
    checks: [{ name: `Factor de seguridad de ${f(FS_TARGET, 1)} o más`, ok: r.FS >= FS_TARGET, value: f(r.FS, 2) }],
    kid: r.FS >= 1 ? `La ladera aguanta: resiste ${f(r.FS, 1)} veces lo que la empuja.` : 'La ladera no aguanta: el suelo se desliza sobre la roca.',
    data: { kind: 'talud', ...s },
  };
}

export function preAngulo(v: Vals): Result {
  const s = slopeVals(v);
  const target = num(v.FSt, FS_TARGET);
  if (!(s.z > 0 && s.c >= 0 && s.cr >= 0 && s.phi > 0 && s.phi < 60 && s.gamma > 9.81 && s.m >= 0 && s.m <= 1 && target >= 1)) return bad('Revisa los datos: espesor mayor que cero, γ mayor que la del agua, fracción saturada entre 0 y 1 y factor buscado de 1 o más.');
  const FS = (b: number) => infiniteSlope({ ...s, beta: b }).FS;
  if (FS(1) < target) return bad('Ni con 1° de pendiente se alcanza el factor pedido: el suelo o el agua no lo permiten.');
  let lo = 1, hi = 79;
  if (FS(hi) >= target) lo = hi;
  else
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (FS(mid) >= target) lo = mid;
      else hi = mid;
    }
  const b = Math.floor(lo * 10) / 10;
  return {
    outs: [
      { label: 'Pendiente máxima', value: `${f(b, 1)}°`, kid: true },
      { label: 'En porcentaje', value: `${f(Math.tan((b * Math.PI) / 180) * 100, 0)} %`, kid: true },
      { label: 'Talud (horizontal por vertical)', value: `${f(1 / Math.tan((b * Math.PI) / 180), 2)} : 1` },
      { label: 'Factor con esa pendiente', value: f(FS(b), 2) },
    ],
    steps: [
      `Se busca por bisección el mayor ángulo β con FS(β) ≥ ${f(target, 2)} en el talud infinito, con ${f(s.z, 2)} m de suelo, c = ${f(s.c, 1)} kPa, cr = ${f(s.cr, 1)} kPa, φ = ${f(s.phi, 1)}° y ${f(s.m * 100, 0)} % saturado.`,
      `Resultado: ${f(b, 1)}° (${f(Math.tan((b * Math.PI) / 180) * 100, 0)} %), con FS = ${f(FS(b), 3)}.`,
      `Sin cohesión el límite no depende del espesor: tanβ = (1 − m·γw/γ)·tanφ/FS.`,
    ],
    checks: [{ name: `Factor de ${f(target, 1)} o más con la pendiente propuesta`, ok: FS(b) >= target - 1e-9, value: f(FS(b), 2) }],
    kid: `Con este suelo, la ladera aguanta bien hasta unos ${f(b, 0)} grados.`,
    data: { kind: 'angulo', ...s, target },
  };
}

// ------------------------------------------------------------------ erosión

const cover = (v: Vals): Cover => (String(v.cov ?? 'cultivo') in COVERS ? (String(v.cov ?? 'cultivo') as Cover) : 'cultivo');
const practice = (v: Vals): Practice => (String(v.prac ?? 'ninguna') in PRACTICES ? (String(v.prac ?? 'ninguna') as Practice) : 'ninguna');

export function calcErosion(v: Vals): Result {
  const R = num(v.R, 5000), K = num(v.K, 0.03), lambda = num(v.lambda, 60), s = num(v.s, 35), T = num(v.Tt, 11);
  if (!(R > 0 && K > 0 && lambda > 0 && s > 0 && s <= 150 && T > 0)) return bad('Revisa los datos: todos mayores que cero y la pendiente hasta 150 %.');
  const C = COVERS[cover(v)].C, P = practiceP(practice(v), s);
  const S = sFactor(s), m = lsExponent(s), L = Math.pow(lambda / 22.13, m), LS = lsFactor(lambda, s);
  const A = R * K * LS * C * P;
  return {
    outs: [
      { label: 'Pérdida de suelo', value: `${f(A, 1)} t/(ha·año)`, kid: true },
      { label: 'Espesor que se pierde', value: `${f((A / 13000) * 1000, 2)} mm por año` },
      { label: 'Factor topográfico LS', value: f(LS, 2) },
      { label: 'Frente a la tolerancia', value: `${f(A / T, 1)} veces`, kid: true },
    ],
    steps: [
      `Ecuación universal revisada (RUSLE; Renard y otros, 1997): A = R·K·LS·C·P.`,
      `Pendiente ${f(s, 1)} %: S = ${s < 9 ? '10,8·sinθ + 0,03' : '16,8·sinθ − 0,50'} = ${f(S, 3)}; exponente m = ${f(m, 3)}; L = (λ/22,13)^m = (${f(lambda, 1)}/22,13)^${f(m, 3)} = ${f(L, 3)} (McCool y otros, 1987 y 1989).`,
      `Cobertura: ${COVERS[cover(v)].name.toLowerCase()}, C = ${f(C, 3)}. Práctica: ${PRACTICES[practice(v)].toLowerCase()}, P = ${f(P, 2)}.`,
      `A = ${f(R, 0)}·${f(K, 3)}·${f(LS, 3)}·${f(C, 3)}·${f(P, 2)} = ${f(A, 2)} t/(ha·año). Con densidad aparente de 1,3 t/m³ son ${f((A / 13000) * 1000, 2)} mm de suelo por año.`,
    ],
    checks: [{ name: `Pérdida tolerable de ${f(T, 0)} t/(ha·año) o menos`, ok: A <= T, value: f(A, 1) }],
    kid: A <= T ? 'La ladera pierde poco suelo: el suelo se forma más o menos igual de rápido.' : `La ladera pierde ${f(A / T, 0)} veces más suelo del que se forma.`,
    data: { kind: 'erosion', R, K, lambda, s, C, P, T },
  };
}

export function preEspaciamiento(v: Vals): Result {
  const R = num(v.R, 5000), K = num(v.K, 0.03), s = num(v.s, 35), T = num(v.Tt, 11);
  if (!(R > 0 && K > 0 && s > 0 && s <= 150 && T > 0)) return bad('Revisa los datos: todos mayores que cero y la pendiente hasta 150 %.');
  const C = COVERS[cover(v)].C, P = practiceP(practice(v), s);
  const S = sFactor(s), m = lsExponent(s);
  // A = R·K·(λ/22,13)^m·S·C·P ≤ T  →  λ ≤ 22,13·(T/(R·K·S·C·P))^(1/m)
  const lam = 22.13 * Math.pow(T / (R * K * S * C * P), 1 / m);
  const spacing = Math.max(0, Math.floor(lam * 10) / 10);
  const vertical = (spacing * s) / 100 / Math.sqrt(1 + (s / 100) ** 2);
  return {
    outs: [
      { label: 'Largo máximo de la ladera sin cortes', value: spacing < 1 ? 'menos de 1 m: hay que cambiar la cobertura' : `${f(spacing, 1)} m`, kid: true },
      { label: 'Desnivel entre barreras o terrazas', value: `${f(vertical, 2)} m` },
      { label: 'Pérdida con ese largo', value: `${f(R * K * Math.pow(Math.max(spacing, 0.01) / 22.13, m) * S * C * P, 2)} t/(ha·año)` },
    ],
    steps: [
      `Con A = R·K·(λ/22,13)^m·S·C·P y A ≤ ${f(T, 0)} t/(ha·año): λ ≤ 22,13·(T/(R·K·S·C·P))^(1/m).`,
      `S = ${f(S, 3)}, m = ${f(m, 3)}, C = ${f(C, 3)}, P = ${f(P, 2)}: λ ≤ ${f(lam, 2)} m.`,
      `Las barreras vivas, zanjas o terrazas cortan la ladera cada ${f(spacing, 1)} m (${f(vertical, 2)} m de desnivel).`,
    ],
    checks: [{ name: 'Largo práctico (3 m o más entre barreras)', ok: spacing >= 3, value: `${f(spacing, 1)} m` }],
    kid: spacing >= 3 ? `Hay que cortar la ladera con una barrera cada ${f(spacing, 0)} m.` : 'Con esta cobertura no alcanza con barreras: hay que sembrar algo que cubra más el suelo.',
    data: { kind: 'espaciamiento', R, K, s, C, P, T, lam: spacing },
  };
}

// ------------------------------------------------------------------ gráficas de la memoria

registerPlan(calcInfiltracion, (d) => {
  const t = TEXTURES[(String(d.tex) in TEXTURES ? String(d.tex) : 'franco') as Texture];
  const r = greenAmpt({ Ks: t.Ks, psi: t.psi, dTheta: (1 - N(d.Se)) * t.thetaE, i: N(d.i), T: N(d.T) }, 80);
  return {
    chart: {
      title: 'Lluvia e infiltración (Green-Ampt)',
      xLabel: 'tiempo (min)',
      yLabel: 'mm/h',
      series: [
        { name: 'capacidad de infiltración', pts: r.t.map((x, k) => [x * 60, Math.min(r.fcap[k], 4 * N(d.i))] as XY), dash: true },
        { name: 'lo que entra', pts: r.t.map((x, k) => [x * 60, r.f[k]] as XY) },
      ],
      hlines: [{ y: N(d.i), text: 'lluvia' }],
    },
  };
});
registerPlan(preZanja, (d) => {
  const k = N(d.k), n = N(d.n), dd = N(d.d);
  const tEnd = (n * dd) / (k / 1000);
  const ts = Array.from({ length: 30 }, (_, j) => (j * tEnd * 1.1) / 29);
  return { chart: { title: 'Vaciado de la zanja', xLabel: 'horas', yLabel: 'agua en la grava (m)', series: [{ name: 'nivel', pts: ts.map((t) => [t, Math.max(0, dd - ((k / 1000) * t) / n)] as XY) }], hlines: [{ y: dd, text: 'lleno' }] } };
});
const fsVsM = (d: Record<string, number | string>) => {
  const base = { beta: N(d.beta), z: N(d.z), c: N(d.c), cr: N(d.cr), phi: N(d.phi), gamma: N(d.gamma) };
  const ms = Array.from({ length: 21 }, (_, k) => k / 20);
  return { chart: { title: 'Factor de seguridad según el agua en el suelo', xLabel: 'fracción saturada (%)', yLabel: 'factor de seguridad', series: [{ name: 'FS', pts: ms.map((m) => [m * 100, infiniteSlope({ ...base, m }).FS] as XY) }], hlines: [{ y: 1, text: 'falla' }, { y: FS_TARGET, text: 'usual' }], mark: { at: [N(d.m) * 100, infiniteSlope({ ...base, m: N(d.m) }).FS] as XY, text: 'ahora' } } };
};
registerPlan(calcTalud, fsVsM);
registerPlan(preAngulo, (d) => {
  const base = { z: N(d.z), c: N(d.c), cr: N(d.cr), phi: N(d.phi), gamma: N(d.gamma), m: N(d.m) };
  const bs = Array.from({ length: 30 }, (_, k) => 10 + k * 1.6);
  return { chart: { title: 'Factor de seguridad según la pendiente', xLabel: 'pendiente (°)', yLabel: 'factor de seguridad', series: [{ name: 'FS', pts: bs.map((b) => [b, Math.min(6, infiniteSlope({ ...base, beta: b }).FS)] as XY) }], hlines: [{ y: N(d.target), text: 'buscado' }] } };
});
registerPlan(calcErosion, (d) => {
  const ss = Array.from({ length: 30 }, (_, k) => 2 + k * 3);
  return { chart: { title: 'Pérdida de suelo según la pendiente', xLabel: 'pendiente (%)', yLabel: 't/(ha·año)', series: [{ name: 'A', pts: ss.map((s) => [s, N(d.R) * N(d.K) * lsFactor(N(d.lambda), s) * N(d.C) * N(d.P)] as XY) }], hlines: [{ y: N(d.T), text: 'tolerable' }], mark: { at: [N(d.s), N(d.R) * N(d.K) * lsFactor(N(d.lambda), N(d.s)) * N(d.C) * N(d.P)] as XY, text: 'esta ladera' } } };
});
registerPlan(preEspaciamiento, (d) => {
  const ls = Array.from({ length: 30 }, (_, k) => 1 + k * Math.max(2, N(d.lam) * 2) / 29);
  return { chart: { title: 'Pérdida de suelo según el largo de la ladera', xLabel: 'largo sin cortes (m)', yLabel: 't/(ha·año)', series: [{ name: 'A', pts: ls.map((l) => [l, N(d.R) * N(d.K) * lsFactor(l, N(d.s)) * N(d.C) * N(d.P)] as XY) }], hlines: [{ y: N(d.T), text: 'tolerable' }] } };
});

// ------------------------------------------------------------------ juegos de herramientas

const NORM =
  'En esta sala no se citan artículos de normas. El factor de seguridad de 1,5, la pérdida tolerable de 11 t/(ha·año) y el vaciado de una zanja en 48 horas son criterios usuales de la práctica, para aprender. Un estudio real de una ladera necesita exploración del suelo, ensayos, el análisis de un especialista y lo que pidan las normas y los planes de ordenamiento.';
const TEX_OPTS = (Object.keys(TEXTURES) as Texture[]).map((k) => ({ value: k, label: `${TEXTURES[k].name} (Ks ${TEXTURES[k].Ks} mm/h)` }));
const COVER_OPTS = (Object.keys(COVERS) as Cover[]).map((k) => ({ value: k, label: `${COVERS[k].name} (C ${COVERS[k].C})` }));
const PRAC_OPTS = (Object.keys(PRACTICES) as Practice[]).map((k) => ({ value: k, label: PRACTICES[k] }));
const SLOPE_FIELDS = [
  { id: 'z', label: 'Espesor del suelo sobre la roca', unit: 'm', def: 2, kid: true },
  { id: 'c', label: 'Cohesión del suelo', unit: 'kPa', def: 6 },
  { id: 'cr', label: 'Cohesión de las raíces', unit: 'kPa', def: 1.5, kid: true },
  { id: 'phi', label: 'Ángulo de fricción', unit: '°', def: 31 },
  { id: 'gamma', label: 'Peso unitario del suelo', unit: 'kN/m³', def: 18.5 },
  { id: 'm', label: 'Fracción saturada (0 seco, 1 saturado)', def: 0.3, kid: true },
];
const EROS_FIELDS = [
  { id: 'R', label: 'Erosividad de la lluvia R', unit: 'MJ·mm/(ha·h·año)', def: 5000 },
  { id: 'K', label: 'Erodabilidad del suelo K', unit: 't·ha·h/(ha·MJ·mm)', def: 0.03 },
  { id: 'cov', label: 'Cobertura', def: 'cultivo', kid: true, options: COVER_OPTS },
  { id: 'prac', label: 'Práctica de conservación', def: 'ninguna', kid: true, options: PRAC_OPTS },
  { id: 'Tt', label: 'Pérdida tolerable', unit: 't/(ha·año)', def: 11 },
];

export const SLOPE_TOOLS: Record<'infiltracion' | 'talud' | 'erosion', ToolSet> = {
  infiltracion: {
    norm: NORM,
    calc: {
      title: 'Calculadora de infiltración (Green-Ampt)',
      intro: 'Cuánta lluvia entra al suelo y cuánta escurre con una lluvia constante, cuándo se encharca y hasta dónde llega el frente de humedecimiento.',
      kidIntro: '¿Cuánta lluvia se toma el suelo?',
      fields: [
        { id: 'tex', label: 'Suelo', def: 'franco', kid: true, options: TEX_OPTS },
        { id: 'Se', label: 'Saturación inicial (0 seco, 0,99 casi saturado)', def: 0.3 },
        { id: 'i', label: 'Intensidad de la lluvia', unit: 'mm/h', def: 30, kid: true },
        { id: 'T', label: 'Duración', unit: 'h', def: 1, kid: true },
      ],
      run: calcInfiltracion,
    },
    pre: {
      title: 'Prediseño de una zanja de infiltración',
      intro: 'Área de una zanja con grava que recibe la lluvia de un techo o un patio y la devuelve al suelo, vaciándose en el tiempo pedido.',
      kidIntro: '¿Qué tan grande debe ser la zanja para guardar la lluvia del techo?',
      fields: [
        { id: 'A', label: 'Área dura que drena a la zanja', unit: 'm²', def: 200, kid: true },
        { id: 'P', label: 'Lluvia de diseño', unit: 'mm', def: 40, kid: true },
        { id: 'C', label: 'Coeficiente de escorrentía', def: 0.9 },
        { id: 'tex', label: 'Suelo del fondo', def: 'francoArenoso', options: TEX_OPTS },
        { id: 'fsK', label: 'Factor de seguridad sobre Ks', def: 2 },
        { id: 'dmax', label: 'Profundidad máxima de grava', unit: 'm', def: 1 },
        { id: 'n', label: 'Porosidad de la grava', def: 0.4 },
        { id: 'tmax', label: 'Tiempo máximo de vaciado', unit: 'h', def: 48 },
      ],
      run: preZanja,
    },
  },
  talud: {
    norm: NORM,
    calc: { title: 'Calculadora de un talud infinito', intro: 'Factor de seguridad de una capa de suelo sobre roca, con agua en el suelo (flujo paralelo a la ladera) y la cohesión de las raíces.', kidIntro: '¿Aguanta la ladera?', fields: [{ id: 'beta', label: 'Pendiente de la ladera', unit: '°', def: 30, kid: true }, ...SLOPE_FIELDS], run: calcTalud },
    pre: { title: 'Prediseño de la pendiente máxima', intro: 'Mayor pendiente con la que la ladera alcanza el factor de seguridad pedido, con el suelo y el agua dados.', kidIntro: '¿Qué tan empinada puede ser la ladera?', fields: [...SLOPE_FIELDS, { id: 'FSt', label: 'Factor de seguridad buscado', def: FS_TARGET }], run: preAngulo },
  },
  erosion: {
    norm: NORM,
    calc: { title: 'Calculadora de pérdida de suelo (RUSLE)', intro: 'Pérdida de suelo de una ladera por la lluvia y la escorrentía, según el suelo, la pendiente, el largo, la cobertura y las prácticas.', kidIntro: '¿Cuánta tierra se lleva la lluvia?', fields: [{ id: 's', label: 'Pendiente', unit: '%', def: 35, kid: true }, { id: 'lambda', label: 'Largo de la ladera', unit: 'm', def: 60, kid: true }, ...EROS_FIELDS], run: calcErosion },
    pre: { title: 'Prediseño del espaciamiento de barreras', intro: 'Largo máximo de ladera sin cortes (barreras vivas, zanjas o terrazas) para que la pérdida de suelo no pase de la tolerable.', kidIntro: '¿Cada cuánto hay que sembrar una barrera?', fields: [{ id: 's', label: 'Pendiente', unit: '%', def: 35, kid: true }, ...EROS_FIELDS], run: preEspaciamiento },
  },
};

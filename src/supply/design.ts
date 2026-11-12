// Herramientas de diseño de la sala «Acueducto»: funciones puras (datos del formulario → resultados, paso a paso y
// verificaciones) con su gráfica registrada para la memoria. Son prediseños académicos.

import { f, type Check, type Result, type Vals } from '../canals/designCalc';
import { registerPlan } from '../canals/designPlans';
import type { XY } from '../canals/plan';
import { RAS_SHORT } from '../canals/norms';
import type { Field, ToolSet } from '../canals/design';
import { G, PIPE_MATS, PVC_DIAMETERS, area, colebrook, darcy, hazenWilliams, nuWater, swameeJain, type PipeMat } from './pipes';
import { solveGradient, type Network } from './network';
import { PVC_RDE, VAPOR_REL, hammer, joukowsky, michaud, waveSpeed } from './hammer';

export const ROOM = 'Acueducto: el agua a presión';

const num = (v: number | string | undefined, def: number) => {
  if (v === undefined) return def;
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};
const bad = (error: string): Result => ({ outs: [], steps: [], kid: '', error });
const matOf = (v: unknown, def: PipeMat = 'pvc'): PipeMat => (typeof v === 'string' && v in PIPE_MATS ? (v as PipeMat) : def);
const MAT_OPTS = (Object.keys(PIPE_MATS) as PipeMat[]).map((m) => ({ value: m, label: PIPE_MATS[m].name }));

/** Velocidad mínima en aducción y conducción (RAS, Art. 56, modificado por la Res. 799 de 2021). */
export const V_MIN = 0.5;
/** Presión dinámica mínima en la red (Art. 61) y estática máxima (Art. 62), en metros de columna de agua. */
export const P_MIN = (pob: string) => (pob === 'menor' ? 10 : 15);
export const P_STATIC_MAX = 50;

// ------------------------------------------------------------------ tubería

export function calcPerdidas(v: Vals): Result {
  const Q = num(v.Q, 15) / 1000, D = num(v.D, 100) / 1000, L = num(v.L, 400), T = num(v.T, 20), K = num(v.K, 3);
  const mat = matOf(v.mat);
  if (!(Q > 0 && D > 0 && L > 0 && K >= 0) || !(T >= 0 && T <= 40)) return bad('Revisa los datos: caudal, diámetro y largo mayores que cero; temperatura de 0 a 40 °C.');
  const nu = nuWater(T), m = PIPE_MATS[mat];
  const dw = darcy(Q, D, L, m.eps, nu);
  const hw = hazenWilliams(Q, D, L, m.C);
  const hv = (dw.V * dw.V) / (2 * G), hm = K * hv;
  const regime = dw.Re < 2000 ? 'laminar' : dw.Re < 4000 ? 'de transición' : 'turbulento';
  const checks: Check[] = [
    { name: `${RAS_SHORT}, Art. 56: velocidad mínima de 0,5 m/s en aducción y conducción (o esfuerzo cortante de 1,5 Pa)`, ok: dw.V >= V_MIN, value: `${f(dw.V, 2)} m/s` },
    { name: 'Velocidad de 3 m/s o menos (criterio usual contra el desgaste y el golpe de ariete)', ok: dw.V <= 3, value: `${f(dw.V, 2)} m/s` },
  ];
  return {
    outs: [
      { label: 'Pérdida por fricción (Darcy-Weisbach)', value: `${f(dw.hf, 2)} m`, kid: true },
      { label: 'Pérdida por fricción (Hazen-Williams)', value: `${f(hw, 2)} m` },
      { label: 'Pérdida en accesorios', value: `${f(hm, 2)} m`, kid: true },
      { label: 'Velocidad', value: `${f(dw.V, 2)} m/s`, kid: true },
      { label: 'Reynolds y régimen', value: `${f(dw.Re, 0)}, ${regime}` },
      { label: 'Factor de fricción', value: f(dw.f, 4) },
    ],
    steps: [
      `V = Q/A = ${f(Q, 4)}/${f(area(D), 5)} = ${f(dw.V, 3)} m/s; Re = V·D/ν = ${f(dw.V, 3)}·${f(D, 4)}/${f(nu * 1e6, 3)}e-6 = ${f(dw.Re, 0)} (${regime}).`,
      `Rugosidad del ${m.name.toLowerCase()}: ε = ${f(m.eps * 1000, 4)} mm; ε/D = ${f(m.eps / D, 6)}. Colebrook-White: f = ${f(dw.f, 5)} (Swamee-Jain da ${f(swameeJain(Math.max(dw.Re, 5000), m.eps / D), 5)}).`,
      `Darcy-Weisbach: hf = f·(L/D)·V²/2g = ${f(dw.f, 5)}·${f(L / D, 1)}·${f(hv, 4)} = ${f(dw.hf, 3)} m.`,
      `Hazen-Williams con C = ${m.C}: hf = 10,67·L·Q^1,852/(C^1,852·D^4,87) = ${f(hw, 3)} m (${f((hw / dw.hf - 1) * 100, 0)} % ${hw > dw.hf ? 'más' : 'menos'}). Hazen-Williams solo vale para agua a temperatura normal y flujo turbulento.`,
      `Accesorios: hm = ΣK·V²/2g = ${f(K, 2)}·${f(hv, 4)} = ${f(hm, 3)} m. Pérdida total: ${f(dw.hf + hm, 3)} m.`,
    ],
    checks,
    kid: `En ${f(L, 0)} m de tubo el agua pierde unos ${f(dw.hf + hm, 1)} m de presión por el roce.`,
    data: { kind: 'perdidas', D: D * 1000, L, T, mat, Q: Q * 1000 },
  };
}

export function preConduccion(v: Vals): Result {
  const H0 = num(v.H0, 60), z = num(v.z, 20), pr = num(v.p, 15), L = num(v.L, 900), Q = num(v.Q, 12) / 1000, K = num(v.K, 5);
  const mat = matOf(v.mat);
  if (!(L > 0 && Q > 0 && pr >= 0 && K >= 0) || !Number.isFinite(H0 + z)) return bad('Revisa los datos: largo y caudal mayores que cero.');
  const avail = H0 - z - pr;
  if (avail <= 0) return bad('El tanque no está lo bastante alto: la cota del tanque debe superar la del final más la presión pedida.');
  const nu = nuWater(20), m = PIPE_MATS[mat];
  const rows = PVC_DIAMETERS.map((d) => {
    const dw = darcy(Q, d.D, L, m.eps, nu);
    const hv = (dw.V * dw.V) / (2 * G);
    return { ...d, V: dw.V, loss: dw.hf + K * hv + hv, p: H0 - z - dw.hf - K * hv - hv };
  });
  const pick = rows.find((r) => r.loss <= avail);
  if (!pick) return bad(`Ni con ${PVC_DIAMETERS[PVC_DIAMETERS.length - 1].name} alcanza: hace falta más carga, menos caudal o un bombeo.`);
  const checks: Check[] = [
    { name: 'Presión al final igual o mayor que la pedida', ok: pick.p >= pr, value: `${f(pick.p, 1)} m (pedida ${f(pr, 1)} m)` },
    { name: `${RAS_SHORT}, Art. 56: velocidad mínima de 0,5 m/s en aducción y conducción`, ok: pick.V >= V_MIN, value: `${f(pick.V, 2)} m/s` },
    { name: 'Velocidad de 3 m/s o menos (criterio usual)', ok: pick.V <= 3, value: `${f(pick.V, 2)} m/s` },
  ];
  return {
    outs: [
      { label: 'Diámetro comercial', value: `${pick.name} (interno ${f(pick.D * 1000, 1)} mm)`, kid: true },
      { label: 'Presión al final', value: `${f(pick.p, 1)} m`, kid: true },
      { label: 'Velocidad', value: `${f(pick.V, 2)} m/s` },
      { label: 'Carga disponible para pérdidas', value: `${f(avail, 1)} m` },
    ],
    steps: [
      `Carga disponible: cota del tanque − cota del final − presión pedida = ${f(H0, 1)} − ${f(z, 1)} − ${f(pr, 1)} = ${f(avail, 2)} m.`,
      ...rows.slice(0, PVC_DIAMETERS.indexOf(PVC_DIAMETERS.find((d) => d.name === pick.name) ?? PVC_DIAMETERS[0]) + 1).map((r) => `${r.name}: V = ${f(r.V, 2)} m/s, pérdidas + V²/2g = ${f(r.loss, 2)} m → ${r.loss <= avail ? 'alcanza' : 'no alcanza'}.`),
      `Se escoge el menor diámetro que alcanza: ${pick.name}. Pérdidas con Darcy-Weisbach y Colebrook (agua a 20 °C) y ΣK = ${f(K, 1)} en accesorios.`,
    ],
    checks,
    kid: `Con un tubo de ${pick.name} llegan ${f(Q * 1000, 0)} L/s con ${f(pick.p, 0)} m de presión.`,
    data: { kind: 'conduccion', H0, z, p: pr, L, Q: Q * 1000, K, mat },
  };
}

export function calcColebrook(v: Vals): Result {
  const Re = num(v.Re, 1e5), rr = num(v.rr, 0.0001);
  if (!(Re > 0 && rr >= 0 && rr < 0.1)) return bad('Revisa los datos: Reynolds mayor que cero y ε/D entre 0 y 0,1.');
  if (Re < 4000) return { outs: [{ label: 'Factor de fricción', value: f(64 / Re, 5) }], steps: [`Con Re < 2 000 el flujo es laminar: f = 64/Re = ${f(64 / Re, 5)}. (Entre 2 000 y 4 000 la transición es incierta.)`], kid: '', data: { kind: 'colebrook', Re, rr } };
  const { f: fc, it } = colebrook(Re, rr);
  return {
    outs: [
      { label: 'Factor de fricción (Colebrook-White)', value: f(fc, 5) },
      { label: 'Swamee-Jain (explícita)', value: f(swameeJain(Re, rr), 5) },
      { label: 'Iteraciones', value: `${it.length - 1}` },
    ],
    steps: [`1/√f = −2·log10(ε/(3,7·D) + 2,51/(Re·√f)). Se empieza con Swamee-Jain y se repite hasta que no cambia:`, ...it.map((x, k) => `iteración ${k}: f = ${f(x, 7)}`)],
    kid: '',
    data: { kind: 'colebrook', Re, rr },
  };
}

// ------------------------------------------------------------------ red

export const RED_EJEMPLO = 'T A 300 200 140\nA B 250 150 140\nA C 250 150 140\nB D 250 100 140\nC D 250 100 140';
export const NUDOS_EJEMPLO = 'A 20 8\nB 18 10\nC 15 6\nD 12 9';

/** Lee una red escrita: tubos «de a L(m) D(mm) C» y nudos «nombre cota(m) demanda(L/s)»; el tanque es T. */
export function parseNetwork(pipesTxt: string, nodesTxt: string, H0: number): Network | string {
  const pipes = pipesTxt.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l, k) => {
    const [a, b, L, D, C] = l.split(/[\s;]+/);
    return { id: `t${k + 1}`, a, b, L: Number(String(L).replace(',', '.')), D: Number(String(D).replace(',', '.')) / 1000, C: Number(String(C ?? '140').replace(',', '.')) };
  });
  const nodes = nodesTxt.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [id, z, q] = l.split(/[\s;]+/);
    return { id, z: Number(String(z).replace(',', '.')), q: Number(String(q ?? '0').replace(',', '.')), x: 0, y: 0 };
  });
  if (!pipes.length || !nodes.length) return 'Escribe al menos un tubo y un nudo.';
  if (pipes.some((p) => !p.a || !p.b || !(p.L > 0) || !(p.D > 0) || !(p.C > 0))) return 'Cada tubo: de, a, largo (m), diámetro (mm) y C de Hazen-Williams, mayores que cero.';
  if (nodes.some((n) => !n.id || !Number.isFinite(n.z) || !(n.q >= 0))) return 'Cada nudo: nombre, cota (m) y demanda (L/s) de cero o más.';
  const ids = new Set(['T', ...nodes.map((n) => n.id)]);
  const missing = pipes.flatMap((p) => [p.a, p.b]).find((x) => !ids.has(x));
  if (missing) return `El nudo «${missing}» está en un tubo pero no en la lista de nudos.`;
  if (!pipes.some((p) => p.a === 'T' || p.b === 'T')) return 'Algún tubo debe salir del tanque T.';
  return { source: 'T', H0, nodes: [{ id: 'T', z: H0, q: 0, x: 0, y: 0 }, ...nodes], pipes };
}

export function calcRed(v: Vals): Result {
  const H0 = num(v.H0, 55);
  const pob = typeof v.pob === 'string' ? v.pob : 'mayor';
  const net = parseNetwork(String(v.tubos ?? RED_EJEMPLO), String(v.nudos ?? NUDOS_EJEMPLO), H0);
  if (typeof net === 'string') return bad(net);
  if (!Number.isFinite(H0)) return bad('Escribe la cota del agua en el tanque.');
  const s = solveGradient(net, 1);
  const free = net.nodes.filter((n) => n.id !== 'T');
  const served = free.filter((n) => !s.cut.includes(n.id));
  const pmin = Math.min(...served.map((n) => s.p[n.id]));
  const stat = Math.max(...free.map((n) => H0 - n.z));
  const low = served.find((n) => s.p[n.id] === pmin);
  const checks: Check[] = [
    { name: `${RAS_SHORT}, Art. 61: presión dinámica mínima de ${P_MIN(pob)} m (población de diseño ${pob === 'menor' ? 'hasta' : 'de más de'} 12 500 habitantes)`, ok: pmin >= P_MIN(pob), value: `${f(pmin, 1)} m en ${low?.id ?? '—'}` },
    { name: `${RAS_SHORT}, Art. 62: presión estática máxima de ${P_STATIC_MAX} m`, ok: stat <= P_STATIC_MAX, value: `${f(stat, 1)} m` },
    { name: 'Todos los nudos conectados con el tanque', ok: s.cut.length === 0, value: s.cut.length ? s.cut.join(', ') : 'sí' },
  ];
  return {
    outs: [
      { label: 'Presión más baja', value: `${f(pmin, 1)} m en ${low?.id ?? '—'}`, kid: true },
      { label: 'Presión estática más alta', value: `${f(stat, 1)} m` },
      { label: 'Sale del tanque', value: `${f(free.reduce((a, n) => a + n.q, 0), 1)} L/s` },
      { label: 'Iteraciones (método del gradiente)', value: `${s.iterations}` },
    ],
    steps: [
      `Tanque T con el agua a ${f(H0, 1)} m. Hazen-Williams en cada tubo: h = 10,67·L·Q^1,852/(C^1,852·D^4,87).`,
      `Método del gradiente (Todini y Pilati, 1988): se resuelven a la vez la continuidad en los nudos y la energía en los tubos, con Newton; ${s.iterations} iteraciones (continuidad ${s.massErr.toExponential(1)} L/s).`,
      ...net.pipes.map((p) => `Tubo ${p.a}–${p.b}: ${f(Math.abs(s.Q[p.id]), 2)} L/s ${s.Q[p.id] >= 0 ? `de ${p.a} a ${p.b}` : `de ${p.b} a ${p.a}`}, V = ${f(s.V[p.id], 2)} m/s, pérdida ${f(Math.abs(s.h[p.id]), 2)} m.`),
      ...served.map((n) => `Nudo ${n.id}: cota piezométrica ${f(s.H[n.id], 2)} m, presión ${f(s.p[n.id], 2)} m.`),
    ],
    checks,
    kid: `La casa con menos presión tiene ${f(pmin, 0)} m de columna de agua.`,
    data: { kind: 'red', H0, tubos: String(v.tubos ?? RED_EJEMPLO), nudos: String(v.nudos ?? NUDOS_EJEMPLO), pob },
  };
}

export function preSector(v: Vals): Result {
  const zHi = num(v.zHi, 30), zLo = num(v.zLo, 5), loss = num(v.loss, 8);
  const pob = typeof v.pob === 'string' ? v.pob : 'mayor';
  if (!(zHi >= zLo) || !(loss >= 0)) return bad('Revisa los datos: la cota más alta no puede ser menor que la más baja; pérdidas de cero o más.');
  const lo = zHi + P_MIN(pob) + loss, hi = zLo + P_STATIC_MAX;
  const ok = lo <= hi;
  const checks: Check[] = [
    { name: `${RAS_SHORT}, Arts. 61 y 62: hay una cota del tanque que cumple la mínima dinámica y la máxima estática`, ok, value: ok ? `entre ${f(lo, 1)} y ${f(hi, 1)} m` : `faltan ${f(lo - hi, 1)} m` },
  ];
  // si no cabe, dos sectores: el alto con el tanque y el bajo detrás de una válvula reductora
  const zCut = hi - P_MIN(pob) - loss;
  return {
    outs: [
      { label: 'Cota mínima del agua en el tanque', value: `${f(lo, 1)} m`, kid: true },
      { label: 'Cota máxima del agua en el tanque', value: `${f(hi, 1)} m`, kid: true },
      { label: 'Desnivel del sector', value: `${f(zHi - zLo, 1)} m` },
      ...(ok ? [] : [{ label: 'Propuesta', value: `dos sectores: con el tanque a ${f(lo, 1)} m, una válvula reductora para los predios bajo la cota ${f(Math.max(zLo, zCut), 1)} m`, kid: true }]),
    ],
    steps: [
      `Para que el punto más alto (${f(zHi, 1)} m) tenga ${P_MIN(pob)} m de presión en la hora de más consumo, con ${f(loss, 1)} m de pérdidas: el agua del tanque debe estar a ${f(zHi, 1)} + ${P_MIN(pob)} + ${f(loss, 1)} = ${f(lo, 1)} m o más (Art. 61).`,
      `Para que el punto más bajo (${f(zLo, 1)} m) no pase de ${P_STATIC_MAX} m de presión estática (sin consumo): ${f(zLo, 1)} + ${P_STATIC_MAX} = ${f(hi, 1)} m o menos (Art. 62).`,
      ok
        ? `Cabe: cualquier cota entre ${f(lo, 1)} y ${f(hi, 1)} m cumple los dos artículos.`
        : `No cabe: el desnivel del sector (${f(zHi - zLo, 1)} m) más la presión mínima y las pérdidas pasa de ${P_STATIC_MAX} m. Hay que sectorizar (el RAS trata la sectorización hidráulica en el Art. 58): un sector alto y otro bajo con una válvula reductora de presión.`,
    ],
    checks,
    kid: ok ? `El agua del tanque debe quedar entre ${f(lo, 0)} y ${f(hi, 0)} m.` : 'El barrio tiene demasiado desnivel para un solo tanque: hay que partirlo en dos sectores.',
    data: { kind: 'sector', zHi, zLo, loss, pob },
  };
}

// ------------------------------------------------------------------ golpe de ariete

function hammerInputs(v: Vals) {
  const L = num(v.L, 600), D = num(v.D, 300) / 1000, e = num(v.e, 14.3) / 1000, V0 = num(v.V, 1), H0 = num(v.H0, 60), tc = num(v.tc, 0);
  const mat = matOf(v.mat);
  return { L, D, e, V0, H0, tc, mat };
}

export function calcAriete(v: Vals): Result {
  const { L, D, e, V0, H0, tc, mat } = hammerInputs(v);
  if (!(L > 0 && D > 0 && e > 0 && e < D / 2 && V0 > 0 && H0 > 0 && tc >= 0)) return bad('Revisa los datos: todos mayores que cero y espesor menor que el radio.');
  const a = waveSpeed(D, e, mat), tr = (2 * L) / a, J = joukowsky(a, V0);
  const fric = colebrook((V0 * D) / nuWater(20), PIPE_MATS[mat].eps / D).f;
  const r = hammer({ L, D, e, mat, H0, V0, f: fric, tc, tEnd: Math.max(tc, 0) + 4 * (4 * L) / a, N: 40 });
  const fast = tc <= tr;
  const checks: Check[] = [
    { name: 'La presión no baja a la de vapor (no hay separación de columna)', ok: !r.vapor, value: `mínima ${f(r.minV, 1)} m` },
    { name: 'Presión máxima dentro de la clase del tubo (si es PVC, RDE 21: 140 m)', ok: mat !== 'pvc' || r.maxV <= PVC_RDE[3].m, value: `${f(r.maxV, 1)} m` },
  ];
  return {
    outs: [
      { label: 'Celeridad de la onda', value: `${f(a, 0)} m/s`, kid: true },
      { label: 'Sobrepresión de Joukowsky (cierre rápido)', value: `${f(J, 1)} m`, kid: true },
      { label: 'Cierre', value: fast ? `rápido (tc ≤ 2L/a = ${f(tr, 2)} s)` : `lento (tc > 2L/a = ${f(tr, 2)} s)` },
      { label: 'Máximo en la válvula (cálculo en el tiempo)', value: `${f(r.maxV, 1)} m (+${f(r.maxV - r.Hv0, 1)})`, kid: true },
      { label: 'Mínimo en la válvula', value: `${f(r.minV, 1)} m` },
      { label: 'Periodo 4L/a', value: `${f(r.period, 2)} s` },
    ],
    steps: [
      `Celeridad (Korteweg): a = √((K/ρ)/(1 + K·D/(E·e))) con K = 2,19 GPa, E = ${f(PIPE_MATS[mat].E / 1e9, 1)} GPa, D = ${f(D * 1000, 0)} mm y e = ${f(e * 1000, 1)} mm: a = ${f(a, 1)} m/s.`,
      `Joukowsky: ΔH = a·V/g = ${f(a, 1)}·${f(V0, 2)}/9,81 = ${f(J, 2)} m, si la válvula se cierra en menos de 2L/a = ${f(tr, 3)} s.`,
      fast ? 'El cierre es rápido: la onda no alcanza a volver antes de terminar el cierre y la sobrepresión es la de Joukowsky.' : `El cierre es lento: Michaud da ΔH ≈ 2·L·V/(g·tc) = ${f(michaud(L, V0, tc), 2)} m (cota superior).`,
      `Método de las características con ${40} tramos, fricción de Darcy f = ${f(fric, 4)} y válvula que cierra su área en línea recta: máximo ${f(r.maxV, 2)} m y mínimo ${f(r.minV, 2)} m en la válvula.`,
      r.vapor ? `La presión baja a la de vapor (${f(VAPOR_REL, 1)} m): la columna de agua se separa y el cálculo deja de valer; hace falta protección (cierre más lento, válvula de alivio o tanque de oscilación).` : 'La presión no baja a la de vapor.',
    ],
    checks,
    kid: `Si la llave se cierra de golpe, la presión sube ${f(J, 0)} m en un instante.`,
    data: { kind: 'ariete', L, D: D * 1000, e: e * 1000, V: V0, H0, tc, mat },
  };
}

export function preCierre(v: Vals): Result {
  const { L, D, V0, H0, mat } = hammerInputs(v);
  const rde = num(v.rde, 21);
  const cls = PVC_RDE.find((c) => c.rde === rde) ?? PVC_RDE[3];
  const e = D / cls.rde;
  if (!(L > 0 && D > 0 && V0 > 0 && H0 > 0)) return bad('Revisa los datos: todos mayores que cero.');
  if (H0 >= cls.m) return bad(`La presión de trabajo ya pasa la clase del tubo (RDE ${cls.rde}: ${cls.m} m).`);
  const pm: PipeMat = mat === 'pead' ? 'pead' : 'pvc';
  const a = waveSpeed(D, e, pm), tr = (2 * L) / a;
  const fric = colebrook((V0 * D) / nuWater(20), PIPE_MATS[pm].eps / D).f;
  const maxAt = (tc: number) => hammer({ L, D, e, mat: pm, H0, V0, f: fric, tc, tEnd: tc + 3 * (4 * L) / a, N: 30 }).maxV;
  const limit = cls.m;
  let tc = 0;
  if (maxAt(0) > limit) {
    let lo = 0, hi = tr;
    while (maxAt(hi) > limit && hi < 600) hi *= 2;
    for (let k = 0; k < 30; k++) {
      const m = (lo + hi) / 2;
      if (maxAt(m) > limit) lo = m;
      else hi = m;
    }
    tc = hi;
  }
  const tcUse = Math.max(tc * 1.25, tr);
  const r = hammer({ L, D, e, mat: pm, H0, V0, f: fric, tc: tcUse, tEnd: tcUse + 3 * (4 * L) / a, N: 30 });
  return {
    outs: [
      { label: 'Tiempo mínimo de cierre', value: tc > 0 ? `${f(tc, 1)} s` : 'cualquiera (aguanta el cierre instantáneo)', kid: true },
      { label: 'Tiempo recomendado (25 % de margen)', value: `${f(tcUse, 1)} s`, kid: true },
      { label: 'Máximo con ese cierre', value: `${f(r.maxV, 1)} m de ${f(limit, 1)} m` },
      { label: 'Celeridad y 2L/a', value: `${f(a, 0)} m/s · ${f(tr, 2)} s` },
    ],
    steps: [
      `Tubo de ${pm === 'pead' ? 'PEAD' : 'PVC'} RDE ${cls.rde}: espesor D/${cls.rde} = ${f(e * 1000, 1)} mm, clase ${cls.psi} psi = ${f(cls.m, 1)} m.`,
      `Celeridad ${f(a, 1)} m/s; con cierre instantáneo la cota llegaría a ${f(maxAt(0), 1)} m.`,
      tc > 0 ? `Se busca por bisección el menor tiempo de cierre con el que el máximo calculado (método de las características) no pasa de ${f(limit, 1)} m: ${f(tc, 2)} s.` : 'Aun con cierre instantáneo el máximo queda dentro de la clase.',
      `Se recomienda ${f(tcUse, 1)} s (25 % más, y nunca menos de 2L/a). Válvulas de cierre lento o con actuador lo garantizan.`,
    ],
    checks: [
      { name: `Máximo dentro de la clase del tubo (RDE ${cls.rde})`, ok: r.maxV <= limit, value: `${f(r.maxV, 1)} m` },
      { name: 'La presión no baja a la de vapor', ok: !r.vapor, value: `mínima ${f(r.minV, 1)} m` },
    ],
    kid: `Cerrando la válvula en ${f(tcUse, 0)} segundos o más, el tubo aguanta el golpe.`,
    data: { kind: 'cierre', L, D: D * 1000, V: V0, H0, rde: cls.rde, mat: pm, tc: tcUse },
  };
}

// ------------------------------------------------------------------ gráficas de la memoria

const N = (x: number | string | undefined) => (typeof x === 'number' ? x : Number(x));

registerPlan(calcPerdidas, (d) => {
  const D = N(d.D) / 1000, L = N(d.L), mat = matOf(d.mat), nu = nuWater(N(d.T));
  const qs = Array.from({ length: 30 }, (_, k) => (N(d.Q) * 2 * (k + 1)) / 30);
  return {
    chart: {
      title: 'Pérdida por fricción según el caudal',
      xLabel: 'caudal (L/s)',
      yLabel: 'pérdida (m)',
      series: [
        { name: 'Darcy-Weisbach', pts: qs.map((q) => [q, darcy(q / 1000, D, L, PIPE_MATS[mat].eps, nu).hf] as XY) },
        { name: 'Hazen-Williams', pts: qs.map((q) => [q, hazenWilliams(q / 1000, D, L, PIPE_MATS[mat].C)] as XY), dash: true },
      ],
      mark: { at: [N(d.Q), darcy(N(d.Q) / 1000, D, L, PIPE_MATS[mat].eps, nu).hf] as XY, text: 'diseño' },
    },
  };
});

registerPlan(preConduccion, (d) => {
  const mat = matOf(d.mat), m = PIPE_MATS[mat], Q = N(d.Q) / 1000, L = N(d.L), K = N(d.K);
  return {
    chart: {
      title: 'Presión al final según el diámetro',
      xLabel: 'diámetro interno (mm)',
      yLabel: 'presión al final (m)',
      series: [{ name: 'presión', pts: PVC_DIAMETERS.map((dd) => { const dw = darcy(Q, dd.D, L, m.eps, nuWater(20)); const hv = (dw.V * dw.V) / (2 * G); return [dd.D * 1000, N(d.H0) - N(d.z) - dw.hf - (K + 1) * hv] as XY; }) }],
      hlines: [{ y: N(d.p), text: 'presión pedida' }],
    },
  };
});

registerPlan(calcColebrook, (d) => ({
  chart: {
    title: 'Diagrama de Moody (Colebrook-White)',
    xLabel: 'log10 del número de Reynolds',
    yLabel: 'factor de fricción',
    series: [1e-5, 1e-4, 1e-3, 1e-2].map((rr) => ({ name: `ε/D = ${rr}`, pts: Array.from({ length: 30 }, (_, k) => { const Re = Math.pow(10, 3.7 + (k * 4.3) / 29); return [Math.log10(Re), colebrook(Re, rr).f] as XY; }), dash: rr !== N(d.rr) })),
    mark: { at: [Math.log10(N(d.Re)), N(d.Re) < 4000 ? 64 / N(d.Re) : colebrook(N(d.Re), N(d.rr)).f] as XY, text: 'punto' },
  },
}));

registerPlan(calcRed, (d) => {
  const net = parseNetwork(String(d.tubos), String(d.nudos), N(d.H0));
  if (typeof net === 'string') return {};
  const s = solveGradient(net, 1);
  const free = net.nodes.filter((n) => n.id !== 'T');
  return {
    chart: {
      title: 'Presión en cada nudo',
      xLabel: `nudo (${free.map((n, k) => `${k + 1} = ${n.id}`).join(', ')})`,
      yLabel: 'presión (m)',
      series: [
        { name: 'dinámica', pts: free.map((n, k) => [k + 1, s.p[n.id]] as XY) },
        { name: 'estática', pts: free.map((n, k) => [k + 1, N(d.H0) - n.z] as XY), dash: true },
      ],
      hlines: [
        { y: P_MIN(String(d.pob)), text: 'mínima (Art. 61)' },
        { y: P_STATIC_MAX, text: 'estática máxima (Art. 62)' },
      ],
    },
  };
});

registerPlan(preSector, (d) => {
  const zHi = N(d.zHi), zLo = N(d.zLo), loss = N(d.loss), pm = P_MIN(String(d.pob));
  const hs = Array.from({ length: 2 }, (_, k) => zHi + (k ? 70 : 0));
  return {
    chart: {
      title: 'Presiones según la cota del agua en el tanque',
      xLabel: 'cota del agua en el tanque (m)',
      yLabel: 'presión (m)',
      series: [
        { name: 'dinámica en el punto alto', pts: hs.map((h) => [h, h - loss - zHi] as XY) },
        { name: 'estática en el punto bajo', pts: hs.map((h) => [h, h - zLo] as XY), dash: true },
      ],
      hlines: [
        { y: pm, text: 'mínima' },
        { y: P_STATIC_MAX, text: 'estática máxima' },
      ],
    },
  };
});

registerPlan(calcAriete, (d) => {
  const { L, D, e, V0, H0, tc, mat } = hammerInputs(d as Vals);
  const a = waveSpeed(D, e, mat);
  const fric = colebrook((V0 * D) / nuWater(20), PIPE_MATS[mat].eps / D).f;
  const r = hammer({ L, D, e, mat, H0, V0, f: fric, tc, tEnd: tc + 4 * (4 * L) / a, N: 40 });
  const step = Math.max(1, Math.floor(r.t.length / 300));
  return {
    chart: {
      title: 'Cota piezométrica en la válvula durante el cierre',
      xLabel: 'tiempo (s)',
      yLabel: 'cota (m)',
      series: [{ name: 'válvula', pts: r.t.filter((_, k) => k % step === 0).map((t, k) => [t, r.Hv[k * step]] as XY) }],
      hlines: [{ y: r.Hv0, text: 'antes del cierre' }],
    },
  };
});

registerPlan(preCierre, (d) => {
  const L = N(d.L), D = N(d.D) / 1000, V0 = N(d.V), H0 = N(d.H0);
  const cls = PVC_RDE.find((c) => c.rde === N(d.rde)) ?? PVC_RDE[3];
  const pm: PipeMat = d.mat === 'pead' ? 'pead' : 'pvc';
  const e = D / cls.rde, a = waveSpeed(D, e, pm), tr = (2 * L) / a;
  const fric = colebrook((V0 * D) / nuWater(20), PIPE_MATS[pm].eps / D).f;
  const tcs = Array.from({ length: 16 }, (_, k) => k * tr * 0.8);
  return {
    chart: {
      title: 'Presión máxima según el tiempo de cierre',
      xLabel: 'tiempo de cierre (s)',
      yLabel: 'cota máxima (m)',
      series: [{ name: 'método de las características', pts: tcs.map((tc) => [tc, hammer({ L, D, e, mat: pm, H0, V0, f: fric, tc, tEnd: tc + 3 * (4 * L) / a, N: 24 }).maxV] as XY) }],
      hlines: [{ y: cls.m, text: `clase RDE ${cls.rde}` }],
      mark: { at: [N(d.tc), hammer({ L, D, e, mat: pm, H0, V0, f: fric, tc: N(d.tc), tEnd: N(d.tc) + 3 * (4 * L) / a, N: 24 }).maxV] as XY, text: 'recomendado' },
    },
  };
});

// ------------------------------------------------------------------ juegos de herramientas

const POB_FIELD: Field = { id: 'pob', label: 'Población de diseño', def: 'mayor', options: [{ value: 'mayor', label: 'Más de 12 500 habitantes (15 m)' }, { value: 'menor', label: 'Hasta 12 500 habitantes (10 m)' }] };
const MAT_FIELD: Field = { id: 'mat', label: 'Material', def: 'pvc', kid: true, options: MAT_OPTS };

const NORM = 'En acueductos, el RAS pide una presión dinámica mínima en la red de 15 m de columna de agua (10 m en sistemas de hasta 12 500 habitantes; Art. 61), una presión estática máxima de 50 m en sistemas nuevos u optimizados (Art. 62), trata la sectorización hidráulica (Art. 58) y pide una velocidad mínima de 0,5 m/s en aducción y conducción, o la que dé un esfuerzo cortante de 1,5 Pa (Art. 56, modificado por la Res. 799 de 2021). El límite de 3 m/s y las clases de presión de los tubos son criterios usuales, no artículos del RAS; las demás verificaciones son criterios de la herramienta para aprender.';

export const SUPPLY_TOOLS: Record<'tuberia' | 'red' | 'ariete', ToolSet> = {
  tuberia: {
    norm: NORM,
    calc: {
      title: 'Calculadora de pérdidas en una tubería',
      intro: 'Pérdida por fricción con Darcy-Weisbach (Colebrook-White) y con Hazen-Williams, y pérdidas en accesorios, para un tubo con un caudal.',
      kidIntro: '¿Cuánta presión pierde el agua al rozar con el tubo?',
      fields: [
        { id: 'Q', label: 'Caudal', unit: 'L/s', def: 15, kid: true },
        { id: 'D', label: 'Diámetro interno', unit: 'mm', def: 100, kid: true },
        { id: 'L', label: 'Largo', unit: 'm', def: 400, kid: true },
        MAT_FIELD,
        { id: 'K', label: 'Suma de K de los accesorios', def: 3 },
        { id: 'T', label: 'Temperatura del agua', unit: '°C', def: 20 },
      ],
      run: calcPerdidas,
    },
    pre: {
      title: 'Prediseño de una conducción por gravedad',
      intro: 'Menor diámetro comercial de PVC que lleva el caudal desde un tanque hasta un punto con la presión pedida, con las verificaciones de velocidad.',
      kidIntro: '¿Qué tan grueso debe ser el tubo para que el agua llegue con fuerza?',
      fields: [
        { id: 'H0', label: 'Cota del agua en el tanque', unit: 'm', def: 60, kid: true },
        { id: 'z', label: 'Cota del final', unit: 'm', def: 20, kid: true },
        { id: 'p', label: 'Presión pedida al final', unit: 'm', def: 15 },
        { id: 'L', label: 'Largo de la tubería', unit: 'm', def: 900, kid: true },
        { id: 'Q', label: 'Caudal', unit: 'L/s', def: 12, kid: true },
        { id: 'K', label: 'Suma de K de los accesorios', def: 5 },
        MAT_FIELD,
      ],
      run: preConduccion,
    },
    extra: [
      {
        kind: 'calc',
        title: 'Calculadora del factor de fricción (Colebrook-White)',
        intro: 'Resuelve la ecuación de Colebrook-White paso a paso y la compara con Swamee-Jain, sobre el diagrama de Moody.',
        kidIntro: '',
        fields: [
          { id: 'Re', label: 'Número de Reynolds', def: 100000 },
          { id: 'rr', label: 'Rugosidad relativa ε/D', def: 0.0001 },
        ],
        run: calcColebrook,
      },
    ],
  },
  red: {
    norm: NORM,
    calc: {
      title: 'Calculadora de redes (método del gradiente)',
      intro: 'Caudales, velocidades y presiones de una red escrita como texto, con Hazen-Williams y el método del gradiente, y las presiones del RAS.',
      kidIntro: 'Escribe los tubos y las casas: te digo cuánta presión llega a cada una.',
      fields: [
        { id: 'H0', label: 'Cota del agua en el tanque T', unit: 'm', def: 55, kid: true },
        { id: 'tubos', label: 'Tubos: de, a, largo (m), diámetro (mm), C (uno por línea)', def: RED_EJEMPLO, text: true, kid: true },
        { id: 'nudos', label: 'Nudos: nombre, cota (m), demanda (L/s) (uno por línea)', def: NUDOS_EJEMPLO, text: true, kid: true },
        POB_FIELD,
      ],
      run: calcRed,
    },
    pre: {
      title: 'Prediseño de la cota del tanque de un sector',
      intro: 'Entre qué cotas debe estar el agua del tanque para cumplir la presión dinámica mínima (Art. 61) y la estática máxima (Art. 62), y si hay que sectorizar.',
      kidIntro: '¿A qué altura pongo el tanque para que a todos les llegue bien el agua?',
      fields: [
        { id: 'zHi', label: 'Cota del punto más alto del sector', unit: 'm', def: 30, kid: true },
        { id: 'zLo', label: 'Cota del punto más bajo', unit: 'm', def: 5, kid: true },
        { id: 'loss', label: 'Pérdidas hasta el punto alto en la hora pico', unit: 'm', def: 8 },
        POB_FIELD,
      ],
      run: preSector,
    },
  },
  ariete: {
    norm: NORM,
    calc: {
      title: 'Calculadora del golpe de ariete',
      intro: 'Celeridad de la onda, sobrepresión de Joukowsky, tipo de cierre y la presión en la válvula en el tiempo con el método de las características.',
      kidIntro: '¿Cuánto sube la presión si cierro la llave de golpe?',
      fields: [
        { id: 'L', label: 'Largo de la tubería', unit: 'm', def: 600, kid: true },
        { id: 'D', label: 'Diámetro interno', unit: 'mm', def: 300 },
        { id: 'e', label: 'Espesor de la pared', unit: 'mm', def: 14.3 },
        MAT_FIELD,
        { id: 'V', label: 'Velocidad del agua', unit: 'm/s', def: 1, kid: true },
        { id: 'H0', label: 'Carga del tanque sobre la válvula', unit: 'm', def: 60 },
        { id: 'tc', label: 'Tiempo de cierre (0 = instantáneo)', unit: 's', def: 0, kid: true },
      ],
      run: calcAriete,
    },
    pre: {
      title: 'Prediseño del tiempo de cierre de una válvula',
      intro: 'Menor tiempo de cierre con el que la presión máxima calculada no pasa la clase del tubo de PVC o PEAD.',
      kidIntro: '¿Qué tan despacio hay que cerrar la llave para no romper el tubo?',
      fields: [
        { id: 'L', label: 'Largo de la tubería', unit: 'm', def: 600, kid: true },
        { id: 'D', label: 'Diámetro interno', unit: 'mm', def: 300 },
        { id: 'mat', label: 'Material', def: 'pvc', options: [{ value: 'pvc', label: 'PVC' }, { value: 'pead', label: 'Polietileno (PEAD)' }] },
        { id: 'rde', label: 'Clase (RDE)', def: '21', options: PVC_RDE.map((c) => ({ value: String(c.rde), label: `RDE ${c.rde}: ${c.psi} psi (${c.m} m)` })) },
        { id: 'V', label: 'Velocidad del agua', unit: 'm/s', def: 2, kid: true },
        { id: 'H0', label: 'Presión de trabajo en la válvula', unit: 'm', def: 80 },
      ],
      run: preCierre,
    },
  },
};

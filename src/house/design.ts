// Herramientas de diseño de la sala «El agua en casa»: funciones puras (datos del formulario → resultados, paso a
// paso y verificaciones) con su gráfica registrada para la memoria. Son cálculos académicos.

import { f, type Result, type Vals } from '../canals/designCalc';
import { registerPlan } from '../canals/designPlans';
import type { XY } from '../canals/plan';
import type { ToolSet } from '../canals/design';
import { BASIC_M3, COMPLEMENTARY_M3, STRATA, TARIFF, bill, tankYear } from './house';

export const ROOM = 'El agua en casa';

const num = (v: number | string | undefined, def: number) => {
  if (v === undefined) return def;
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};
const bad = (error: string): Result => ({ outs: [], steps: [], kid: '', error });
const N = (x: number | string | undefined) => (typeof x === 'number' ? x : Number(x));
const pesos = (x: number) => `$ ${Math.round(x).toLocaleString('es-CO')}`;

// ------------------------------------------------------------------ consumo

export function calcConsumo(v: Vals): Result {
  const P = num(v.P, 4), tm = num(v.tm, 7), qd = num(v.qd, 9), nd = num(v.nd, 4), vd = num(v.vd, 9), otros = num(v.otros, 40), fuga = num(v.fuga, 0);
  if (!(P >= 1 && P <= 20 && tm >= 0 && qd >= 0 && nd >= 0 && vd >= 0 && otros >= 0 && fuga >= 0)) return bad('Revisa los datos: de 1 a 20 personas y los demás valores positivos.');
  const ducha = P * tm * qd, san = P * nd * vd, otro = P * otros, tot = ducha + san + otro + fuga;
  const m3 = (tot * 30) / 1000;
  return {
    outs: [
      { label: 'Consumo de la casa', value: `${f(tot, 0)} L/día`, kid: true },
      { label: 'Por persona', value: `${f(tot / P, 0)} L/día`, kid: true },
      { label: 'Al mes', value: `${f(m3, 1)} m³`, kid: true },
      { label: 'Rango de consumo', value: m3 <= BASIC_M3 ? 'básico' : m3 <= COMPLEMENTARY_M3 ? 'complementario' : 'suntuario' },
    ],
    steps: [
      `Ducha: ${f(P, 0)} personas × ${f(tm, 1)} min × ${f(qd, 1)} L/min = ${f(ducha, 0)} L/día.`,
      `Sanitario: ${f(P, 0)} × ${f(nd, 1)} descargas × ${f(vd, 1)} L = ${f(san, 0)} L/día.`,
      `Lavamanos, cocina y ropa: ${f(P, 0)} × ${f(otros, 0)} L = ${f(otro, 0)} L/día; fugas: ${f(fuga, 0)} L/día.`,
      `Total ${f(tot, 0)} L/día × 30 días = ${f(m3, 2)} m³/mes. En ciudades entre 1 000 y 2 000 m, el consumo básico es de ${BASIC_M3} m³ y el complementario llega hasta ${COMPLEMENTARY_M3} m³ (Resolución CRA 750 de 2016).`,
    ],
    checks: [{ name: `Dentro del consumo básico (${BASIC_M3} m³ al mes)`, ok: m3 <= BASIC_M3, value: `${f(m3, 1)} m³` }],
    kid: `Tu casa usa ${f(tot, 0)} litros al día: como ${f(tot / 10, 0)} baldes.`,
    data: { kind: 'consumo', P, tm, qd, nd, vd, otros, fuga, m3 },
  };
}

export function preAhorro(v: Vals): Result {
  const P = num(v.P, 4), tm = num(v.tm, 7), q0 = num(v.q0, 9), q1 = num(v.q1, 6), nd = num(v.nd, 4), v0 = num(v.v0, 9), v1 = num(v.v1, 4.8), cost = num(v.cost, 450000), unit = num(v.unit, TARIFF.m3Aq + TARIFF.m3Sew);
  if (!(P >= 1 && tm >= 0 && q0 >= 0 && q1 >= 0 && nd >= 0 && v0 >= 0 && v1 >= 0 && cost >= 0 && unit > 0)) return bad('Revisa los datos: todos positivos y al menos una persona.');
  const save = (P * tm * Math.max(0, q0 - q1) + P * nd * Math.max(0, v0 - v1)) * 365 / 1000; // m³/año
  const money = save * unit;
  const months = money > 0 ? (cost / money) * 12 : Infinity;
  return {
    outs: [
      { label: 'Agua ahorrada', value: `${f(save, 1)} m³ al año`, kid: true },
      { label: 'Dinero ahorrado', value: `${pesos(money)} al año`, kid: true },
      { label: 'Se paga en', value: Number.isFinite(months) ? `${f(months, 0)} meses` : 'no se paga' },
    ],
    steps: [
      `Ducha: ${f(P, 0)} × ${f(tm, 1)} min × (${f(q0, 1)} − ${f(q1, 1)}) L/min = ${f(P * tm * Math.max(0, q0 - q1), 0)} L/día.`,
      `Sanitario: ${f(P, 0)} × ${f(nd, 1)} × (${f(v0, 1)} − ${f(v1, 1)}) L = ${f(P * nd * Math.max(0, v0 - v1), 0)} L/día.`,
      `Al año: ${f(save, 2)} m³ × ${pesos(unit)}/m³ (acueducto y alcantarillado, tarifa ilustrativa) = ${pesos(money)}.`,
      Number.isFinite(months) ? `Retorno: ${pesos(cost)} / ${pesos(money)} por año = ${f(months, 1)} meses.` : 'Sin ahorro no hay retorno.',
    ],
    checks: [{ name: 'Se paga en menos de tres años', ok: months <= 36, value: Number.isFinite(months) ? `${f(months, 0)} meses` : '—' }],
    kid: `Con aparatos ahorradores la casa ahorra ${f(save, 0)} metros cúbicos al año.`,
    data: { kind: 'ahorro', cost, money },
  };
}

// ------------------------------------------------------------------ factura

const tariffOf = (v: Vals) => ({ fixedAq: num(v.fa, TARIFF.fixedAq), fixedSew: num(v.fs, TARIFF.fixedSew), m3Aq: num(v.ua, TARIFF.m3Aq), m3Sew: num(v.us, TARIFF.m3Sew) });

export function calcFactura(v: Vals): Result {
  const r0 = num(v.r0, 1487.2316), r1 = num(v.r1, 1502.6582), e = Math.round(num(v.e, 3));
  const t = tariffOf(v);
  if (!(r1 >= r0 && r0 >= 0 && e >= 1 && e <= 6 && t.fixedAq >= 0 && t.fixedSew >= 0 && t.m3Aq >= 0 && t.m3Sew >= 0)) return bad('Revisa los datos: la lectura final no puede ser menor que la inicial, el estrato va de 1 a 6 y la tarifa es positiva.');
  const m3 = r1 - r0;
  const b = bill(m3, e, t);
  const fct = STRATA[e].f;
  return {
    outs: [
      { label: 'Consumo del mes', value: `${f(m3, 2)} m³`, kid: true },
      ...b.lines.filter((l) => l.base > 0).map((l) => ({ label: l.label, value: pesos(l.value) })),
      { label: 'Total', value: pesos(b.total), kid: true },
      { label: 'Cada metro cúbico sale a', value: pesos(b.perM3) },
    ],
    steps: [
      `Consumo = lectura final − lectura inicial = ${f(r1, 4)} − ${f(r0, 4)} = ${f(m3, 4)} m³.`,
      `Se reparte en básico (hasta ${BASIC_M3} m³): ${f(b.basic, 2)}; complementario (hasta ${COMPLEMENTARY_M3} m³): ${f(b.comp, 2)}; suntuario: ${f(b.sumpt, 2)} m³.`,
      fct < 0 ? `${STRATA[e].name}: subsidio de ejemplo del ${f(-fct * 100, 0)} % sobre los cargos fijos y el consumo básico (los subsidios no pasan del consumo básico).` : fct > 0 ? `${STRATA[e].name}: contribución de solidaridad de ejemplo del ${f(fct * 100, 0)} % sobre todo el cargo.` : `${STRATA[e].name}: paga la tarifa sin subsidio ni contribución.`,
      `Total = ${b.lines.map((l) => pesos(l.value)).join(' + ')} = ${pesos(b.total)} (tarifa ilustrativa).`,
    ],
    checks: [{ name: 'Consumo dentro del básico', ok: m3 <= BASIC_M3, value: `${f(m3, 1)} m³` }],
    kid: `Este mes la casa gastó ${f(m3, 1)} metros cúbicos y paga ${pesos(b.total)}.`,
    data: { kind: 'factura', e, m3, ...t },
  };
}

export function preFuga(v: Vals): Result {
  const a = num(v.a, 1502.6582), b = num(v.b, 1502.6702), min = num(v.min, 60), e = Math.round(num(v.e, 3));
  if (!(b >= a && min > 0 && e >= 1 && e <= 6)) return bad('Revisa los datos: la segunda lectura no puede ser menor que la primera; minutos mayores que cero.');
  const Lh = ((b - a) * 1000) / (min / 60);
  const m3 = (Lh * 24 * 30) / 1000;
  const cost = bill(15 + m3, e).total - bill(15, e).total;
  return {
    outs: [
      { label: 'Fuga', value: Lh > 0 ? `${f(Lh, 1)} L/h` : 'no hay fuga', kid: true },
      { label: 'Al mes', value: `${f(m3, 2)} m³` },
      { label: 'Cuesta al mes (sobre 15 m³ de consumo)', value: pesos(cost), kid: true },
    ],
    steps: [
      `Con todas las llaves cerradas, el medidor pasó de ${f(a, 4)} a ${f(b, 4)} m³ en ${f(min, 0)} min: ${f((b - a) * 1000, 1)} L.`,
      `Fuga = ${f((b - a) * 1000, 1)} L / ${f(min / 60, 2)} h = ${f(Lh, 2)} L/h → ${f(m3, 2)} m³ en 30 días.`,
      `Lo que suma a una factura de 15 m³ del ${STRATA[e].name.toLowerCase()}: ${pesos(cost)} (tarifa ilustrativa).`,
    ],
    checks: [{ name: 'Sin fuga', ok: Lh <= 0.05, value: `${f(Lh, 1)} L/h` }],
    kid: Lh > 0 ? `Hay una fuga: se pierden ${f(Lh * 24, 0)} litros al día.` : 'El medidor no se movió: no hay fuga.',
    data: { kind: 'fuga', e, Lh },
  };
}

// ------------------------------------------------------------------ tanque

const tankVals = (v: Vals) => ({ A: num(v.A, 60), C: num(v.C, 0.9), ff: num(v.ff, 1), V: num(v.V, 1), D: num(v.D, 200) });
const tankOk = (t: ReturnType<typeof tankVals>) => t.A > 0 && t.A <= 5000 && t.C > 0 && t.C <= 1 && t.ff >= 0 && t.V > 0 && t.V <= 500 && t.D >= 0;

export function calcTanque(v: Vals): Result {
  const t = tankVals(v);
  if (!tankOk(t)) return bad('Revisa los datos: área, volumen y demanda positivos y coeficiente entre 0 y 1.');
  const r = tankYear(t);
  return {
    outs: [
      { label: 'Demanda atendida con lluvia', value: `${f(r.share * 100, 0)} %`, kid: true },
      { label: 'Agua lluvia usada al año', value: `${f(r.served, 1)} m³`, kid: true },
      { label: 'Días con la demanda completa', value: `${f(r.reliability * 100, 0)} %` },
      { label: 'Días con el tanque vacío', value: f(r.emptyDays, 0) },
      { label: 'Rebosa al año', value: `${f(r.spilled, 1)} m³` },
    ],
    steps: [
      `Lluvia del año (ilustrativa, régimen del valle de Aburrá): ${f(r.rainVol / (t.A / 1000), 0)} mm sobre ${f(t.A, 0)} m² = ${f(r.rainVol, 1)} m³.`,
      `Cada día entra (P − ${f(t.ff, 1)} mm de primer lavado)·A·C; se captan ${f(r.captured, 1)} m³ con C = ${f(t.C, 2)}.`,
      `Balance diario del tanque de ${f(t.V, 2)} m³: S = S + entrada; si pasa de V, rebosa; luego sale la demanda de ${f(t.D, 0)} L/día si hay agua.`,
      `Atendido ${f(r.served, 1)} de ${f(r.demand, 1)} m³ (${f(r.share * 100, 1)} %); rebosan ${f(r.spilled, 1)} m³.`,
    ],
    checks: [{ name: 'Atiende el 80 % de la demanda o más', ok: r.share >= 0.8, value: `${f(r.share * 100, 0)} %` }],
    kid: `El tanque da agua lluvia para el ${f(r.share * 100, 0)} % de lo que se necesita.`,
    data: { kind: 'tanque', ...t },
  };
}

export function preTanque(v: Vals): Result {
  const t = tankVals(v);
  const target = num(v.obj, 80) / 100;
  if (!tankOk({ ...t, V: 1 }) || !(target > 0 && target < 1)) return bad('Revisa los datos: área y demanda positivas, coeficiente entre 0 y 1 y meta entre 1 % y 99 %.');
  const top = tankYear({ ...t, V: 500 });
  if (top.share < target) return bad(`Ni con un tanque enorme se llega al ${f(target * 100, 0)} %: el techo no capta tanta agua en el año (máximo ${f(top.share * 100, 0)} %). Reduce la demanda o usa más techo.`);
  let V = 0.1;
  while (V < 500 && tankYear({ ...t, V }).share < target) V = Math.round((V + 0.1) * 10) / 10;
  const r = tankYear({ ...t, V });
  return {
    outs: [
      { label: 'Volumen del tanque', value: `${f(V, 1)} m³ (${f(V * 1000, 0)} L)`, kid: true },
      { label: 'Demanda atendida', value: `${f(r.share * 100, 1)} %` },
      { label: 'Agua lluvia usada al año', value: `${f(r.served, 1)} m³`, kid: true },
    ],
    steps: [
      `Se prueba el balance diario de un año con tanques de 0,1 m³ en 0,1 m³ hasta atender el ${f(target * 100, 0)} % de la demanda.`,
      `El menor que lo logra: ${f(V, 1)} m³, con ${f(r.share * 100, 1)} %; uno 0,1 m³ menor se queda corto.`,
      `Con un tanque enorme se llegaría al ${f(top.share * 100, 1)} %: más tanque ya casi no ayuda.`,
    ],
    checks: [{ name: `Atiende el ${f(target * 100, 0)} %`, ok: r.share >= target, value: `${f(r.share * 100, 1)} %` }],
    kid: `Hace falta un tanque de unos ${f(V * 1000, 0)} litros.`,
    data: { kind: 'pretanque', ...t, V, target },
  };
}

// ------------------------------------------------------------------ gráficas de la memoria

registerPlan(calcConsumo, (d) => {
  const ts = Array.from({ length: 21 }, (_, k) => k);
  const m3 = (tm: number) => ((N(d.P) * tm * N(d.qd) + N(d.P) * N(d.nd) * N(d.vd) + N(d.P) * N(d.otros) + N(d.fuga)) * 30) / 1000;
  return { chart: { title: 'Consumo del mes según los minutos de ducha', xLabel: 'minutos de ducha por persona', yLabel: 'm³ al mes', series: [{ name: 'consumo', pts: ts.map((t) => [t, m3(t)] as XY) }], hlines: [{ y: BASIC_M3, text: 'básico' }], mark: { at: [N(d.tm), N(d.m3)] as XY, text: 'esta casa' } } };
});
registerPlan(preAhorro, (d) => {
  const ms = Array.from({ length: 37 }, (_, k) => k);
  return { chart: { title: 'Ahorro acumulado contra el costo de los aparatos', xLabel: 'meses', yLabel: 'pesos', series: [{ name: 'ahorro', pts: ms.map((m) => [m, (N(d.money) * m) / 12] as XY) }], hlines: [{ y: N(d.cost), text: 'costo' }] } };
});
registerPlan(calcFactura, (d) => {
  const ms = Array.from({ length: 41 }, (_, k) => k);
  const t = { fixedAq: N(d.fixedAq), fixedSew: N(d.fixedSew), m3Aq: N(d.m3Aq), m3Sew: N(d.m3Sew) };
  return { chart: { title: 'La factura según el consumo', xLabel: 'm³ al mes', yLabel: 'pesos', series: [{ name: STRATA[N(d.e)].name.toLowerCase(), pts: ms.map((m) => [m, bill(m, N(d.e), t).total] as XY) }, { name: 'estrato 4', pts: ms.map((m) => [m, bill(m, 4, t).total] as XY), dash: true }], mark: { at: [N(d.m3), bill(N(d.m3), N(d.e), t).total] as XY, text: 'este mes' } } };
});
registerPlan(preFuga, (d) => {
  const ls = Array.from({ length: 31 }, (_, k) => k);
  return { chart: { title: 'Lo que cuesta una fuga al mes', xLabel: 'fuga (L/h)', yLabel: 'pesos al mes', series: [{ name: 'costo', pts: ls.map((l) => [l, bill(15 + (l * 720) / 1000, N(d.e)).total - bill(15, N(d.e)).total] as XY) }], mark: { at: [N(d.Lh), bill(15 + (N(d.Lh) * 720) / 1000, N(d.e)).total - bill(15, N(d.e)).total] as XY, text: 'esta fuga' } } };
});
registerPlan(calcTanque, (d) => {
  const r = tankYear({ A: N(d.A), C: N(d.C), ff: N(d.ff), V: N(d.V), D: N(d.D) });
  return { chart: { title: 'Agua en el tanque a lo largo del año', xLabel: 'día del año', yLabel: 'm³', series: [{ name: 'almacenada', pts: r.S.map((s, k) => [k + 1, s] as XY) }], hlines: [{ y: N(d.V), text: 'lleno' }] } };
});
registerPlan(preTanque, (d) => {
  const Vs = Array.from({ length: 30 }, (_, k) => 0.2 + (k / 29) * Math.max(2, N(d.V) * 3));
  return { chart: { title: 'Demanda atendida según el volumen del tanque', xLabel: 'volumen (m³)', yLabel: 'atendida (%)', series: [{ name: 'atendida', pts: Vs.map((V) => [V, tankYear({ A: N(d.A), C: N(d.C), ff: N(d.ff), V, D: N(d.D) }).share * 100] as XY) }], hlines: [{ y: N(d.target) * 100, text: 'meta' }], mark: { at: [N(d.V), tankYear({ A: N(d.A), C: N(d.C), ff: N(d.ff), V: N(d.V), D: N(d.D) }).share * 100] as XY, text: 'tanque elegido' } } };
});

// ------------------------------------------------------------------ juegos de herramientas

const NORM =
  'Los rangos de consumo (básico de 13 m³ y complementario hasta 26 m³ al mes en ciudades entre 1 000 y 2 000 m) son los de la Resolución CRA 750 de 2016. La tarifa, los factores de subsidio y de contribución y los caudales de los aparatos son ilustrativos: la tarifa real la fija cada empresa con la metodología de la CRA y los porcentajes, cada municipio dentro de los topes de la ley. Un sistema de agua lluvia para uso doméstico debe seguir las normas sanitarias y no conectarse con la red del acueducto.';
const STRATA_OPTS = [1, 2, 3, 4, 5, 6].map((k) => ({ value: String(k), label: STRATA[k].name }));

export const HOUSE_TOOLS: Record<'consumo' | 'factura' | 'lluvia', ToolSet> = {
  consumo: {
    norm: NORM,
    calc: {
      title: 'Calculadora del consumo de una casa',
      intro: 'Litros al día y metros cúbicos al mes de una casa con sus duchas, sanitarios, otros usos y fugas, comparados con el consumo básico.',
      kidIntro: '¿Cuánta agua usa tu casa?',
      fields: [
        { id: 'P', label: 'Personas', def: 4, kid: true },
        { id: 'tm', label: 'Minutos de ducha por persona', unit: 'min', def: 7, kid: true },
        { id: 'qd', label: 'Caudal de la ducha', unit: 'L/min', def: 9 },
        { id: 'nd', label: 'Descargas del sanitario por persona', def: 4, kid: true },
        { id: 'vd', label: 'Litros por descarga', unit: 'L', def: 9 },
        { id: 'otros', label: 'Otros usos por persona (lavamanos, cocina, ropa)', unit: 'L/día', def: 40 },
        { id: 'fuga', label: 'Fugas de la casa', unit: 'L/día', def: 0 },
      ],
      run: calcConsumo,
    },
    pre: {
      title: 'Prediseño del cambio a aparatos ahorradores',
      intro: 'Agua y dinero que se ahorran al cambiar la ducha y el sanitario, y en cuánto tiempo se paga el cambio.',
      kidIntro: '¿Cuánto se ahorra con una ducha y un sanitario ahorradores?',
      fields: [
        { id: 'P', label: 'Personas', def: 4, kid: true },
        { id: 'tm', label: 'Minutos de ducha por persona', unit: 'min', def: 7 },
        { id: 'q0', label: 'Ducha actual', unit: 'L/min', def: 9 },
        { id: 'q1', label: 'Ducha ahorradora', unit: 'L/min', def: 6 },
        { id: 'nd', label: 'Descargas por persona al día', def: 4 },
        { id: 'v0', label: 'Sanitario actual', unit: 'L', def: 9 },
        { id: 'v1', label: 'Sanitario ahorrador', unit: 'L', def: 4.8 },
        { id: 'cost', label: 'Costo de los aparatos', unit: '$', def: 450000, kid: true },
        { id: 'unit', label: 'Costo de un metro cúbico (acueducto y alcantarillado)', unit: '$', def: TARIFF.m3Aq + TARIFF.m3Sew },
      ],
      run: preAhorro,
    },
  },
  factura: {
    norm: NORM,
    calc: {
      title: 'Calculadora de la factura',
      intro: 'Consumo desde dos lecturas del medidor y la factura con los rangos de la CRA, el estrato y una tarifa que puedes cambiar.',
      kidIntro: '¿Cuánto se paga por el agua del mes?',
      fields: [
        { id: 'r0', label: 'Lectura al empezar el mes', unit: 'm³', def: 1487.2316 },
        { id: 'r1', label: 'Lectura al terminar el mes', unit: 'm³', def: 1502.6582, kid: true },
        { id: 'e', label: 'Estrato', def: '3', kid: true, options: STRATA_OPTS },
        { id: 'fa', label: 'Cargo fijo de acueducto', unit: '$/mes', def: TARIFF.fixedAq },
        { id: 'fs', label: 'Cargo fijo de alcantarillado', unit: '$/mes', def: TARIFF.fixedSew },
        { id: 'ua', label: 'Acueducto por metro cúbico', unit: '$/m³', def: TARIFF.m3Aq },
        { id: 'us', label: 'Alcantarillado por metro cúbico', unit: '$/m³', def: TARIFF.m3Sew },
      ],
      run: calcFactura,
    },
    pre: {
      title: 'Prueba nocturna de fugas',
      intro: 'Con todas las llaves cerradas se lee el medidor dos veces: si se movió, hay una fuga. Cuánta agua se pierde y cuánto cuesta.',
      kidIntro: '¿Hay una fuga escondida en la casa?',
      fields: [
        { id: 'a', label: 'Primera lectura', unit: 'm³', def: 1502.6582, kid: true },
        { id: 'b', label: 'Segunda lectura', unit: 'm³', def: 1502.6702, kid: true },
        { id: 'min', label: 'Minutos entre lecturas', unit: 'min', def: 60 },
        { id: 'e', label: 'Estrato', def: '3', options: STRATA_OPTS },
      ],
      run: preFuga,
    },
  },
  lluvia: {
    norm: NORM,
    calc: {
      title: 'Calculadora de un tanque de agua lluvia',
      intro: 'Balance diario de un año: cuánta agua lluvia capta el techo, cuánta de la demanda atiende el tanque y cuánta rebosa.',
      kidIntro: '¿Cuánta agua lluvia aprovecha la casa?',
      fields: [
        { id: 'A', label: 'Área del techo en planta', unit: 'm²', def: 60, kid: true },
        { id: 'C', label: 'Coeficiente de escorrentía del techo', def: 0.9 },
        { id: 'ff', label: 'Primer lavado que se descarta', unit: 'mm', def: 1 },
        { id: 'V', label: 'Volumen del tanque', unit: 'm³', def: 1, kid: true },
        { id: 'D', label: 'Demanda con agua lluvia', unit: 'L/día', def: 200, kid: true },
      ],
      run: calcTanque,
    },
    pre: {
      title: 'Prediseño del volumen del tanque',
      intro: 'El tanque más pequeño (en pasos de 100 litros) con el que el agua lluvia atiende la fracción pedida de la demanda.',
      kidIntro: '¿Qué tan grande debe ser el tanque?',
      fields: [
        { id: 'A', label: 'Área del techo en planta', unit: 'm²', def: 60, kid: true },
        { id: 'C', label: 'Coeficiente de escorrentía del techo', def: 0.9 },
        { id: 'ff', label: 'Primer lavado que se descarta', unit: 'mm', def: 1 },
        { id: 'D', label: 'Demanda con agua lluvia', unit: 'L/día', def: 200, kid: true },
        { id: 'obj', label: 'Fracción de la demanda que se quiere atender', unit: '%', def: 80, kid: true },
      ],
      run: preTanque,
    },
  },
};

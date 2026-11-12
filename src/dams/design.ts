// Herramientas de diseño de la sala «Presas y embalses»: funciones puras (datos del formulario → resultados, paso a paso
// y verificaciones) con su gráfica registrada para la memoria. Son prediseños académicos.

import { f, type Check, type Result, type Vals } from '../canals/designCalc';
import { registerPlan } from '../canals/designPlans';
import type { XY } from '../canals/plan';
import type { ToolSet } from '../canals/design';
import { gammaInflow, routePuls, stability, stillingBasin, wesTangent, wesY, type GravityDam, type Reservoir } from './dam';

export const ROOM = 'Presas y embalses';

const num = (v: number | string | undefined, def: number) => {
  if (v === undefined) return def;
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};
const bad = (error: string): Result => ({ outs: [], steps: [], kid: '', error });
const N = (x: number | string | undefined) => (typeof x === 'number' ? x : Number(x));

/** Criterios de la herramienta (usuales en la práctica, para aprender). */
export const FS_MIN = 1.5;
export const HD_MAX = 1.33;

// ------------------------------------------------------------------ embalse

function resOf(v: Vals): { r: Reservoir; Qp: number; tp: number; Qb: number } {
  return { r: { A0: num(v.A0, 150) * 1e4, A1: num(v.A1, 15) * 1e4, L: num(v.L, 30), C: num(v.C, 2.18), bottom: 0 }, Qp: num(v.Qp, 800), tp: num(v.tp, 6), Qb: num(v.Qb, 10) };
}

export function calcTransito(v: Vals): Result {
  const { r, Qp, tp, Qb } = resOf(v);
  if (!(r.A0 > 0 && r.A1 >= 0 && r.L > 0 && r.C > 0 && Qp > Qb && Qb >= 0 && tp > 0)) return bad('Revisa los datos: áreas y ancho mayores que cero, y el pico mayor que el caudal base.');
  const res = routePuls(r, gammaInflow(Qb, Qp, tp), Math.max(24, 8 * tp), Math.min(0.25, tp / 24));
  return {
    outs: [
      { label: 'Pico que sale', value: `${f(res.Opeak, 0)} m³/s de ${f(res.Ipeak, 0)}`, kid: true },
      { label: 'Atenuación', value: `${f((1 - res.Opeak / res.Ipeak) * 100, 1)} %`, kid: true },
      { label: 'Agua máxima sobre la cresta', value: `${f(res.hMax, 2)} m`, kid: true },
      { label: 'Retraso del pico', value: `${f(res.tOpeak - res.tIpeak, 2)} h` },
      { label: 'Cierre del balance', value: `${f((Math.abs(res.vin - res.vout - res.dS) / res.vin) * 100, 6)} %` },
    ],
    steps: [
      `Creciente de entrada de forma gamma: base ${f(Qb, 0)} m³/s, pico ${f(Qp, 0)} m³/s a las ${f(tp, 1)} h.`,
      `Embalse: área ${f(r.A0 / 1e4, 0)} ha en la cresta que crece ${f(r.A1 / 1e4, 1)} ha por metro; vertedero libre de ${f(r.L, 1)} m con Q = ${f(r.C, 2)}·L·H^1,5.`,
      `Puls modificado: (2S/Δt + O) en el paso siguiente = I + I' + (2S/Δt − O); se despeja la cota en cada paso.`,
      `El pico de salida (${f(res.Opeak, 1)} m³/s) ocurre cuando la salida cruza la entrada, ${f(res.tOpeak - res.tIpeak, 2)} h después del pico de entrada; el embalse guardó el resto.`,
    ],
    kid: `El embalse baja la creciente de ${f(res.Ipeak, 0)} a ${f(res.Opeak, 0)} m³/s: guarda el agua un rato y la suelta despacio.`,
    data: { kind: 'transito', A0: r.A0 / 1e4, A1: r.A1 / 1e4, L: r.L, C: r.C, Qp, tp, Qb },
  };
}

export function preVertedero(v: Vals): Result {
  const { r, Qp, tp, Qb } = resOf(v);
  const fb = num(v.fb, 6), margin = num(v.margin, 1.5);
  if (!(r.A0 > 0 && r.A1 >= 0 && r.C > 0 && Qp > Qb && tp > 0 && fb > margin && margin >= 0)) return bad('Revisa los datos: la altura de la presa sobre la cresta debe ser mayor que el borde libre.');
  const hAllow = fb - margin;
  const run = (L: number) => routePuls({ ...r, L }, gammaInflow(Qb, Qp, tp), Math.max(24, 8 * tp), Math.min(0.25, tp / 24));
  let lo = 1, hi = 400;
  if (run(hi).hMax > hAllow) return bad(`Ni con 400 m de vertedero el agua queda ${f(margin, 1)} m bajo la corona: hace falta más altura o una descarga de fondo.`);
  for (let k = 0; k < 40; k++) {
    const m = (lo + hi) / 2;
    if (run(m).hMax > hAllow) lo = m;
    else hi = m;
  }
  const L = Math.ceil(hi);
  const res = run(L);
  return {
    outs: [
      { label: 'Ancho del vertedero', value: `${L} m`, kid: true },
      { label: 'Agua máxima sobre la cresta', value: `${f(res.hMax, 2)} m de ${f(hAllow, 2)} m`, kid: true },
      { label: 'Pico que sale', value: `${f(res.Opeak, 0)} m³/s` },
      { label: 'Carga de diseño del perfil', value: `${f(res.hMax, 2)} m` },
    ],
    steps: [
      `La corona está ${f(fb, 1)} m sobre la cresta y se deja un borde libre de ${f(margin, 1)} m: el agua puede subir ${f(hAllow, 2)} m.`,
      `Se busca por bisección el menor ancho con el que el tránsito de la creciente no pasa de esa altura: ${L} m (redondeado).`,
      `Con ese ancho sale un pico de ${f(res.Opeak, 1)} m³/s. La carga máxima se toma como carga de diseño del perfil WES.`,
    ],
    checks: [{ name: 'Borde libre al pasar la creciente', ok: fb - res.hMax >= margin - 1e-9, value: `${f(fb - res.hMax, 2)} m` }],
    kid: `Con un vertedero de ${L} m, la creciente pasa sin acercarse a la corona.`,
    data: { kind: 'vertedero', A0: r.A0 / 1e4, A1: r.A1 / 1e4, L, C: r.C, Qp, tp, Qb },
  };
}

// ------------------------------------------------------------------ vertedero y pozo

export function calcVertedero(v: Vals): Result {
  const L = num(v.L, 30), H = num(v.H, 3), Hd = num(v.Hd, 3), C = num(v.C, 2.18), m = num(v.m, 0.75);
  if (!(L > 0 && H > 0 && Hd > 0 && C > 0 && m > 0)) return bad('Revisa los datos: todos mayores que cero.');
  const Q = C * L * Math.pow(H, 1.5), tg = wesTangent(Hd, m);
  const rows = [0.25, 0.5, 1, 1.5, 2].map((k) => k * Hd).filter((x) => x <= tg.x + 1e-9);
  return {
    outs: [
      { label: 'Caudal', value: `${f(Q, 1)} m³/s`, kid: true },
      { label: 'Relación de cargas H/Hd', value: f(H / Hd, 2), kid: true },
      { label: 'Tangencia con la rápida', value: `x = ${f(tg.x, 2)} m, y = ${f(tg.y, 2)} m` },
    ],
    steps: [
      `Q = C·L·H^1,5 = ${f(C, 2)}·${f(L, 1)}·${f(H, 2)}^1,5 = ${f(Q, 2)} m³/s (C de la carga de diseño; con otras cargas cambia algo).`,
      `Perfil aguas abajo (WES): x^1,85 = 2·Hd^0,85·y, con Hd = ${f(Hd, 2)} m: ${rows.map((x) => `(${f(x, 2)}; ${f(wesY(x, Hd), 3)})`).join(', ')}.`,
      `La curva empalma con la rápida de talud ${f(m, 2)}:1 donde su pendiente es 1/m: x = ${f(tg.x, 3)} m.`,
      H / Hd > HD_MAX ? `Con H/Hd = ${f(H / Hd, 2)} la lámina se despega de la cresta y aparecen presiones negativas: se recomienda no pasar de 1,33.` : 'La carga no pasa de 1,33 veces la de diseño: la lámina sigue el perfil.',
    ],
    checks: [{ name: `Carga de hasta ${HD_MAX} veces la de diseño (criterio usual contra la cavitación en la cresta)`, ok: H / Hd <= HD_MAX, value: f(H / Hd, 2) }],
    kid: `Con ${f(H, 1)} m de agua sobre la cresta pasan ${f(Q, 0)} m³ cada segundo.`,
    data: { kind: 'wes', Hd, m, H },
  };
}

export function prePozo(v: Vals): Result {
  const q = num(v.q, 11), P = num(v.P, 30), H = num(v.H, 3), tw = num(v.tw, 3.7);
  if (!(q > 0 && P > 0 && H > 0 && tw >= 0)) return bad('Revisa los datos: caudal unitario, caída y carga mayores que cero.');
  // el pozo se hunde D: la caída crece y el agua del río sobre el piso también; se itera hasta que tw + D = 1,1·y2
  let D = 0, sb = stillingBasin(q, P, H);
  for (let k = 0; k < 40; k++) {
    sb = stillingBasin(q, P + D, H);
    const nd = Math.max(0, 1.1 * sb.y2 - tw);
    if (Math.abs(nd - D) < 1e-6) break;
    D = nd;
  }
  return {
    outs: [
      { label: 'Profundidad del pozo bajo el lecho del río', value: `${f(D, 2)} m`, kid: true },
      { label: 'Largo del pozo (USBR tipo I)', value: `${f(sb.Lb, 1)} m`, kid: true },
      { label: 'Al pie: velocidad y Froude', value: `${f(sb.V1, 1)} m/s · ${f(sb.F1, 1)}` },
      { label: 'Profundidades conjugadas', value: `${f(sb.y1, 3)} → ${f(sb.y2, 2)} m` },
    ],
    steps: [
      `Al pie, toda la caída (${f(P + D, 2)} m) más la carga (${f(H, 2)} m) se vuelve velocidad: y1 = q/√(2g·(E − y1)) = ${f(sb.y1, 4)} m y V1 = ${f(sb.V1, 2)} m/s (sin pérdidas en la rápida: es la velocidad más alta posible).`,
      `Bélanger: y2 = y1/2·(√(1 + 8F1²) − 1) = ${f(sb.y2, 3)} m con F1 = ${f(sb.F1, 2)}.`,
      `Para que el resalto quede dentro, el agua sobre el piso debe ser al menos 1,1·y2: el río da ${f(tw, 2)} m, así que el piso baja ${f(D, 2)} m (se itera, porque al bajarlo crece la caída).`,
      `Largo del pozo ≈ 6·y2 = ${f(sb.Lb, 1)} m. Con F1 > 4,5 conviene un pozo con bloques (USBR tipo II o III) para acortarlo.`,
    ],
    checks: [{ name: 'Froude al pie mayor de 4,5 (resalto estable)', ok: sb.F1 > 4.5, value: f(sb.F1, 1) }],
    kid: `El agua llega abajo a ${f(sb.V1, 0)} m/s; un pozo de ${f(sb.Lb, 0)} m la frena con un resalto.`,
    data: { kind: 'pozo', q, P, H, tw },
  };
}

// ------------------------------------------------------------------ estabilidad

function damOf(v: Vals): GravityDam {
  return { H: num(v.H, 30), crest: num(v.crest, 5), m: num(v.m, 0.75), hw: num(v.hw, 27), tail: num(v.tail, 0), uplift: num(v.uplift, 100) / 100, mu: num(v.mu, 0.7), c: num(v.c, 0) };
}

function stabChecks(r: ReturnType<typeof stability>): Check[] {
  return [
    { name: `Volcamiento: factor de seguridad de ${FS_MIN} o más`, ok: r.FSo >= FS_MIN, value: f(r.FSo, 2) },
    { name: `Deslizamiento por fricción: factor de ${FS_MIN} o más`, ok: r.FSs >= FS_MIN, value: f(r.FSs, 2) },
    { name: 'Resultante en el tercio medio (sin tracción en el talón)', ok: r.inThird, value: `e = ${f(r.e, 2)} m de ${f(r.B / 6, 2)} m` },
    { name: 'Esfuerzos en la base de compresión', ok: r.sHeel >= 0 && r.sToe >= 0, value: `talón ${f(r.sHeel, 0)} kPa · punta ${f(r.sToe, 0)} kPa` },
  ];
}

export function calcEstabilidad(v: Vals): Result {
  const d = damOf(v);
  if (!(d.H > 0 && d.crest >= 0 && d.m > 0 && d.hw >= 0 && d.hw <= d.H && d.tail >= 0 && d.tail < d.hw + 1e-9 && d.uplift >= 0 && d.uplift <= 1 && d.mu > 0 && d.c >= 0)) return bad('Revisa los datos: el agua no puede pasar la presa, el agua de abajo debe ser menor que la de arriba y la subpresión va de 0 a 100 %.');
  const r = stability(d);
  return {
    outs: [
      { label: 'Factor contra el volcamiento', value: f(r.FSo, 2), kid: true },
      { label: 'Factor contra el deslizamiento', value: f(r.FSs, 2), kid: true },
      { label: 'Con cohesión (corte-fricción)', value: f(r.FSsf, 2) },
      { label: 'Resultante', value: `${f(r.xR, 2)} m del talón (tercio medio de ${f(r.B / 3, 2)} a ${f((2 * r.B) / 3, 2)} m)` },
      { label: 'Esfuerzos en la base', value: `talón ${f(r.sHeel, 0)} · punta ${f(r.sToe, 0)} kPa` },
    ],
    steps: [
      `Base B = corona + m·H = ${f(d.crest, 1)} + ${f(d.m, 2)}·${f(d.H, 1)} = ${f(r.B, 2)} m. Concreto de ${f(23.5, 1)} kN/m³ y agua de 9,81 kN/m³.`,
      ...r.forces.map((x) => `${x.name}: ${x.Fx ? `H = ${f(x.Fx, 0)}` : ''}${x.Fx && x.Fy ? ', ' : ''}${x.Fy ? `V = ${f(x.Fy, 0)}` : ''} kN/m, aplicada a ${f(x.x, 2)} m del talón y ${f(x.y, 2)} m de altura.`),
      `Respecto a la punta: momentos que resisten ${f(r.Mr, 0)} y que vuelcan ${f(r.Mo, 0)} kN·m/m: FS = ${f(r.FSo, 3)}.`,
      `Deslizamiento: μ·ΣV/ΣH = ${f(d.mu, 2)}·${f(r.V, 0)}/${f(r.Hsum, 0)} = ${f(r.FSs, 3)}${d.c > 0 ? `; con cohesión: (μ·ΣV + c·B)/ΣH = ${f(r.FSsf, 3)}` : ''}.`,
      `Excentricidad e = B/2 − (Mr − Mo)/ΣV = ${f(r.e, 3)} m; esfuerzos σ = ΣV/B·(1 ± 6e/B).`,
    ],
    checks: stabChecks(r),
    kid: r.FSo >= FS_MIN && r.FSs >= FS_MIN && r.inThird ? 'La presa aguanta el empuje del agua con margen.' : 'La presa está al límite: el agua la empuja más de lo que su peso aguanta con margen.',
    data: { kind: 'estabilidad', H: d.H, crest: d.crest, m: d.m, hw: d.hw, tail: d.tail, uplift: d.uplift * 100, mu: d.mu, c: d.c },
  };
}

export function preTalud(v: Vals): Result {
  const d = damOf(v);
  if (!(d.H > 0 && d.crest >= 0 && d.hw >= 0 && d.hw <= d.H && d.uplift >= 0 && d.uplift <= 1 && d.mu > 0)) return bad('Revisa los datos: el agua no puede pasar la presa y la subpresión va de 0 a 100 %.');
  const ok = (m: number) => {
    const r = stability({ ...d, m });
    return r.FSo >= FS_MIN && r.FSs >= FS_MIN && r.inThird && r.sHeel >= 0;
  };
  let lo = 0.05, hi = 3;
  if (!ok(hi)) return bad('Ni con un talud de 3:1 cumple: revisa la fricción, los drenes o el agua.');
  for (let k = 0; k < 50; k++) {
    const m = (lo + hi) / 2;
    if (ok(m)) hi = m;
    else lo = m;
  }
  const m = Math.ceil(hi * 20) / 20;
  const r = stability({ ...d, m });
  const vol = (d.crest * d.H + (m * d.H * d.H) / 2);
  return {
    outs: [
      { label: 'Talud aguas abajo mínimo', value: `${f(m, 2)}:1`, kid: true },
      { label: 'Base', value: `${f(r.B, 2)} m`, kid: true },
      { label: 'Concreto por metro de presa', value: `${f(vol, 0)} m³` },
      { label: 'Factores', value: `volcamiento ${f(r.FSo, 2)} · deslizamiento ${f(r.FSs, 2)}` },
    ],
    steps: [
      `Se busca por bisección el talud más empinado (menos concreto) que cumple: volcamiento y deslizamiento con factor ${FS_MIN}, resultante en el tercio medio y sin tracción en el talón.`,
      `Resultado: ${f(hi, 3)}:1, redondeado a ${f(m, 2)}:1. Con drenes (menos subpresión) el talud puede ser más empinado.`,
    ],
    checks: stabChecks(r),
    kid: `La presa necesita una base de ${f(r.B, 0)} m para aguantar ${f(d.hw, 0)} m de agua.`,
    data: { kind: 'talud', H: d.H, crest: d.crest, m, hw: d.hw, tail: d.tail, uplift: d.uplift * 100, mu: d.mu, c: d.c },
  };
}

// ------------------------------------------------------------------ gráficas

const routeChart = (d: Record<string, number | string>) => {
  const r: Reservoir = { A0: N(d.A0) * 1e4, A1: N(d.A1) * 1e4, L: N(d.L), C: N(d.C), bottom: 0 };
  const res = routePuls(r, gammaInflow(N(d.Qb), N(d.Qp), N(d.tp)), Math.max(24, 8 * N(d.tp)), Math.min(0.25, N(d.tp) / 24));
  const step = Math.max(1, Math.floor(res.t.length / 120));
  return {
    chart: {
      title: 'Creciente que entra y que sale del embalse',
      xLabel: 'tiempo (h)',
      yLabel: 'caudal (m³/s)',
      series: [
        { name: 'entra', pts: res.t.filter((_, k) => k % step === 0).map((t, k) => [t, res.I[k * step]] as XY), dash: true },
        { name: 'sale', pts: res.t.filter((_, k) => k % step === 0).map((t, k) => [t, res.O[k * step]] as XY) },
      ],
    },
  };
};
registerPlan(calcTransito, routeChart);
registerPlan(preVertedero, routeChart);
registerPlan(calcVertedero, (d) => {
  const Hd = N(d.Hd), tg = wesTangent(Hd, N(d.m));
  const xs = Array.from({ length: 30 }, (_, k) => (k * tg.x) / 29);
  return { chart: { title: 'Perfil de la cresta (WES)', xLabel: 'x desde la cresta (m)', yLabel: 'cota respecto a la cresta (m)', series: [{ name: 'perfil', pts: xs.map((x) => [x, -wesY(x, Hd)] as XY) }], hlines: [{ y: N(d.H), text: 'agua sobre la cresta' }] } };
});
registerPlan(prePozo, (d) => {
  const qs = Array.from({ length: 25 }, (_, k) => (N(d.q) * 2 * (k + 1)) / 25);
  return { chart: { title: 'Profundidad conjugada y agua del río', xLabel: 'caudal unitario (m²/s)', yLabel: 'profundidad (m)', series: [{ name: 'y2 (resalto)', pts: qs.map((q) => [q, stillingBasin(q, N(d.P), N(d.H)).y2] as XY) }], hlines: [{ y: N(d.tw), text: 'agua del río' }], mark: { at: [N(d.q), stillingBasin(N(d.q), N(d.P), N(d.H)).y2] as XY, text: 'diseño' } } };
});
const stabChart = (d: Record<string, number | string>) => {
  const base: GravityDam = { H: N(d.H), crest: N(d.crest), m: N(d.m), hw: N(d.hw), tail: N(d.tail), uplift: N(d.uplift) / 100, mu: N(d.mu), c: N(d.c) };
  const hs = Array.from({ length: 25 }, (_, k) => (k * base.H) / 24);
  return {
    chart: {
      title: 'Factores de seguridad según la altura del agua',
      xLabel: 'agua en el embalse (m)',
      yLabel: 'factor de seguridad',
      series: [
        { name: 'volcamiento', pts: hs.slice(4).map((h) => [h, Math.min(10, stability({ ...base, hw: h, tail: Math.min(base.tail, h) }).FSo)] as XY) },
        { name: 'deslizamiento', pts: hs.slice(4).map((h) => [h, Math.min(10, stability({ ...base, hw: h, tail: Math.min(base.tail, h) }).FSs)] as XY), dash: true },
      ],
      hlines: [{ y: FS_MIN, text: 'mínimo' }],
    },
  };
};
registerPlan(calcEstabilidad, stabChart);
registerPlan(preTalud, stabChart);

// ------------------------------------------------------------------ juegos de herramientas

const NORM = 'En esta sala no se citan artículos del RAS. Los factores de seguridad de 1,5, la resultante en el tercio medio y el límite de 1,33 veces la carga de diseño son criterios usuales de la práctica, para aprender; una presa real se diseña con las normas de presas, estudios geológicos y sísmicos, y la revisión de un equipo de especialistas.';
const RES_FIELDS = [
  { id: 'Qp', label: 'Pico de la creciente', unit: 'm³/s', def: 800, kid: true },
  { id: 'tp', label: 'Tiempo al pico', unit: 'h', def: 6 },
  { id: 'Qb', label: 'Caudal base', unit: 'm³/s', def: 10 },
  { id: 'A0', label: 'Área del embalse en la cresta', unit: 'ha', def: 150, kid: true },
  { id: 'A1', label: 'Aumento del área por metro', unit: 'ha/m', def: 15 },
  { id: 'C', label: 'Coeficiente del vertedero C', def: 2.18 },
];
const DAM_FIELDS = [
  { id: 'H', label: 'Altura de la presa', unit: 'm', def: 30, kid: true },
  { id: 'crest', label: 'Ancho de la corona', unit: 'm', def: 5 },
  { id: 'hw', label: 'Agua en el embalse', unit: 'm', def: 27, kid: true },
  { id: 'tail', label: 'Agua aguas abajo', unit: 'm', def: 0 },
  { id: 'uplift', label: 'Subpresión que queda (100 % sin drenes)', unit: '%', def: 100 },
  { id: 'mu', label: 'Coeficiente de fricción concreto-roca', def: 0.7 },
  { id: 'c', label: 'Cohesión', unit: 'kPa', def: 0 },
];

export const DAM_TOOLS: Record<'embalse' | 'vertedero' | 'estabilidad', ToolSet> = {
  embalse: {
    norm: NORM,
    calc: { title: 'Calculadora del tránsito por un embalse', intro: 'Pico, atenuación, retraso y nivel máximo cuando una creciente pasa por un embalse con vertedero libre (método de Puls).', kidIntro: '¿Cuánto baja una creciente al pasar por un embalse?', fields: [...RES_FIELDS, { id: 'L', label: 'Ancho del vertedero', unit: 'm', def: 30, kid: true }], run: calcTransito },
    pre: { title: 'Prediseño del ancho de un vertedero', intro: 'Menor ancho del vertedero libre con el que la creciente de diseño pasa dejando el borde libre pedido bajo la corona.', kidIntro: '¿Qué tan ancha debe ser la salida para que el agua no pase por encima de la presa?', fields: [...RES_FIELDS, { id: 'fb', label: 'Altura de la corona sobre la cresta', unit: 'm', def: 6, kid: true }, { id: 'margin', label: 'Borde libre', unit: 'm', def: 1.5 }], run: preVertedero },
  },
  vertedero: {
    norm: NORM,
    calc: { title: 'Calculadora del vertedero de cresta (WES)', intro: 'Caudal de un vertedero de cresta, el perfil WES aguas abajo y su empalme con la rápida.', kidIntro: '¿Cuánta agua pasa por encima de la presa?', fields: [{ id: 'L', label: 'Ancho de la cresta', unit: 'm', def: 30, kid: true }, { id: 'H', label: 'Agua sobre la cresta', unit: 'm', def: 3, kid: true }, { id: 'Hd', label: 'Carga de diseño del perfil', unit: 'm', def: 3 }, { id: 'C', label: 'Coeficiente C', def: 2.18 }, { id: 'm', label: 'Talud de la rápida (H:V)', def: 0.75 }], run: calcVertedero },
    pre: { title: 'Prediseño del pozo de disipación', intro: 'Profundidad y largo de un pozo con resalto hidráulico al pie de la rápida, para que el resalto no se salga con el agua del río.', kidIntro: '¿Cómo frenamos el agua que baja tan rápido?', fields: [{ id: 'q', label: 'Caudal por metro de ancho', unit: 'm²/s', def: 11, kid: true }, { id: 'P', label: 'Caída de la cresta al lecho del río', unit: 'm', def: 30, kid: true }, { id: 'H', label: 'Agua sobre la cresta', unit: 'm', def: 3 }, { id: 'tw', label: 'Profundidad del río aguas abajo', unit: 'm', def: 3.7 }], run: prePozo },
  },
  estabilidad: {
    norm: NORM,
    calc: { title: 'Calculadora de estabilidad de una presa de gravedad', intro: 'Fuerzas, factores de seguridad al volcamiento y al deslizamiento, posición de la resultante y esfuerzos en la base.', kidIntro: '¿Aguanta la presa el empuje del agua?', fields: [...DAM_FIELDS.slice(0, 2), { id: 'm', label: 'Talud aguas abajo (H:V)', def: 0.75, kid: true }, ...DAM_FIELDS.slice(2)], run: calcEstabilidad },
    pre: { title: 'Prediseño del talud de una presa de gravedad', intro: 'Talud aguas abajo más empinado (menos concreto) que cumple los factores de seguridad, el tercio medio y la compresión en la base.', kidIntro: '¿Qué tan ancha debe ser la base de la presa?', fields: DAM_FIELDS, run: preTalud },
  },
};

// Herramientas de diseño de la sala «Medir el agua»: funciones puras (datos del formulario → resultados, paso a
// paso y verificaciones) con su gráfica registrada para la memoria. Son cálculos académicos.

import { f, type Result, type Vals } from '../canals/designCalc';
import { registerPlan } from '../canals/designPlans';
import type { XY } from '../canals/plan';
import type { ToolSet } from '../canals/design';
import { G, GAUGINGS, WMO_DENSITY, ZR, bestH0, fitRating, gauge, meterDp, meterFlow, meterValid, rainFromDbz, ratingQ, type Meter, type ZRKey } from './measure';

export const ROOM = 'Medir el agua';

/** Molinete ilustrativo: v = a·n + b, con n en vueltas por segundo. */
export const METER_A = 0.25;
export const METER_B = 0.01;

const num = (v: number | string | undefined, def: number) => {
  if (v === undefined) return def;
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};
const bad = (error: string): Result => ({ outs: [], steps: [], kid: '', error });
const N = (x: number | string | undefined) => (typeof x === 'number' ? x : Number(x));
const rows = (txt: string) =>
  txt
    .split(/\n+/)
    .map((l) => l.trim().split(/[\s;]+/).filter(Boolean).map((x) => Number(x.replace(',', '.'))))
    .filter((p) => p.length >= 2 && p.every(Number.isFinite));

// ------------------------------------------------------------------ lluvia

export function calcBalancin(v: Vals): Result {
  const tips = num(v.tips, 33), min = num(v.min, 10), u = num(v.u, 2), d = num(v.d, 0.2), tau = num(v.tau, 0.5);
  if (!(tips >= 0 && min > 0 && u >= 0 && u <= 20 && d > 0 && tau >= 0)) return bad('Revisa los datos: vuelcos y viento positivos, minutos, volumen y tiempo de vuelco mayores que cero.');
  const Im = (tips * d) / (min / 60);
  const deadFrac = (Im * (tau / 3600)) / d;
  if (deadFrac >= 0.95) return bad('Con ese tiempo de vuelco el balancín estaría volcando todo el tiempo: revisa los datos.');
  const Ic = Im / (1 - deadFrac);
  const cr = Math.max(0.88, 1 - 0.012 * u);
  const I = Ic / cr;
  return {
    outs: [
      { label: 'Intensidad registrada', value: `${f(Im, 1)} mm/h`, kid: true },
      { label: 'Corregida por el tiempo de vuelco', value: `${f(Ic, 1)} mm/h` },
      { label: 'Corregida también por el viento', value: `${f(I, 1)} mm/h`, kid: true },
      { label: 'Lluvia del período', value: `${f((I * min) / 60, 2)} mm` },
    ],
    steps: [
      `Registrada: ${f(tips, 0)} vuelcos × ${f(d, 2)} mm en ${f(min, 0)} min = ${f(tips * d, 2)} mm → ${f(Im, 2)} mm/h.`,
      `Mientras se vuelca (${f(tau, 2)} s) el agua que cae se pierde: la que entró es Ic = Im/(1 − Im·τ/δ) = ${f(Im, 2)}/(1 − ${f(deadFrac, 4)}) = ${f(Ic, 2)} mm/h.`,
      `El viento desvía gotas sobre la boca: con ${f(u, 1)} m/s entra el ${f(cr * 100, 1)} % (aproximación ilustrativa en el rango de 2 % a 10 % que reporta la OMM): I = ${f(Ic, 2)}/${f(cr, 3)} = ${f(I, 2)} mm/h.`,
    ],
    checks: [{ name: 'Corrección total de 10 % o menos', ok: I / Math.max(1e-9, Im) - 1 <= 0.1, value: `${f((I / Math.max(1e-9, Im) - 1) * 100, 1)} %` }],
    kid: `Llovió unos ${f(I, 0)} milímetros por hora; el aparato marcó ${f(Im, 0)}.`,
    data: { kind: 'balancin', d, tau, u, Im, I },
  };
}

export function calcZR(v: Vals): Result {
  const Z = num(v.dbz, 45);
  if (!(Z >= -10 && Z <= 80)) return bad('La reflectividad va de −10 a 80 dBZ.');
  const keys = Object.keys(ZR) as ZRKey[];
  const R = keys.map((k) => rainFromDbz(Z, k));
  return {
    outs: keys.map((k, j) => ({ label: ZR[k].name, value: `${f(R[j], 1)} mm/h`, kid: j === 0 })),
    steps: [
      `Reflectividad: Z = 10^(dBZ/10) = 10^(${f(Z, 1)}/10) = ${f(Math.pow(10, Z / 10), 0)} mm⁶/m³.`,
      ...keys.map((k, j) => `${ZR[k].src}: Z = ${ZR[k].a}·R^${f(ZR[k].b, 1)} → R = (Z/${ZR[k].a})^(1/${f(ZR[k].b, 1)}) = ${f(R[j], 2)} mm/h.`),
      `La misma lectura del radar da lluvias distintas según el tipo de gotas: por eso los radares se ajustan con pluviómetros.`,
    ],
    kid: `Con ${f(Z, 0)} dBZ llueven entre ${f(Math.min(...R), 0)} y ${f(Math.max(...R), 0)} milímetros por hora, según el tipo de lluvia.`,
    data: { kind: 'zr', Z },
  };
}

export function preRed(v: Vals): Result {
  const A = num(v.A, 1200);
  const t = String(v.terr ?? 'montana') in WMO_DENSITY ? String(v.terr ?? 'montana') : 'montana';
  if (!(A > 0)) return bad('El área debe ser mayor que cero.');
  const w = WMO_DENSITY[t];
  const nP = Math.max(1, Math.ceil(A / w.plain)), nR = Math.max(1, Math.ceil(A / w.rec));
  return {
    outs: [
      { label: 'Pluviómetros (mínimo)', value: f(nP, 0), kid: true },
      { label: 'De ellos, registradores (mínimo)', value: f(Math.min(nP, nR), 0), kid: true },
      { label: 'Área por pluviómetro', value: `${f(A / nP, 0)} km²` },
    ],
    steps: [
      `Densidad mínima para una región ${w.name.toLowerCase()} (OMM, n.º 168, tabla I.2.1): un pluviómetro cada ${f(w.plain, 0)} km² y un registrador cada ${f(w.rec, 0)} km².`,
      `Pluviómetros: ⌈${f(A, 0)}/${f(w.plain, 0)}⌉ = ${f(nP, 0)}; registradores: ⌈${f(A, 0)}/${f(w.rec, 0)}⌉ = ${f(nR, 0)}.`,
      `Son mínimos para una red nacional: una cuenca urbana o con crecientes rápidas suele necesitar más, repartidos por altura y por exposición.`,
    ],
    kid: `Para ${f(A, 0)} km² hacen falta al menos ${f(nP, 0)} pluviómetros.`,
    data: { kind: 'red', A, plain: w.plain, rec: w.rec },
  };
}

// ------------------------------------------------------------------ aforo

/** Lecturas de ejemplo de un aforo con molinete a 0,2 y 0,8 (sacadas de la escena con el río a 1,5 m). */
export const MOLINETE_LECTURAS = (() => {
  const g = gauge(1.5, 12, '0208');
  const [a, b] = g.edges;
  const lines = [`${f(a, 2).replace(',', '.')} 0 0 0 60`];
  for (const p of g.verts) {
    // vueltas en 60 s que darían las dos lecturas (se reparte la velocidad media del método)
    const n = Math.max(0, Math.round(((p.v - METER_B) / METER_A) * 60));
    lines.push(`${p.x.toFixed(2)} ${p.d.toFixed(2)} ${Math.round(n * 1.07)} ${Math.round(n * 0.93)} 60`);
  }
  lines.push(`${b.toFixed(2)} 0 0 0 60`);
  return lines.join('\n');
})();

export function calcMolinete(v: Vals): Result {
  const pts = rows(String(v.tabla ?? MOLINETE_LECTURAS)).filter((p) => p.length >= 5).map(([x, d, n2, n8, t]) => ({ x, d, n2, n8, t }));
  const a = num(v.a, METER_A), b = num(v.b, METER_B);
  if (pts.length < 3) return bad('Hacen falta al menos tres líneas: distancia, profundidad, vueltas a 0,2, vueltas a 0,8 y segundos (las orillas con profundidad 0).');
  if (pts.some((p) => p.d < 0 || p.t <= 0 || p.n2 < 0 || p.n8 < 0) || !(a > 0 && b >= 0)) return bad('Revisa las lecturas: profundidades, vueltas y tiempos positivos; el molinete con a mayor que cero.');
  pts.sort((p, q) => p.x - q.x);
  let Q = 0, A = 0;
  const qs: number[] = [];
  const vels: number[] = [];
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    const vel = p.d > 0 ? (a * (p.n2 / p.t) + b + a * (p.n8 / p.t) + b) / 2 : 0;
    const left = k === 0 ? p.x : pts[k - 1].x, right = k === pts.length - 1 ? p.x : pts[k + 1].x;
    const w = (right - left) / 2;
    vels.push(vel);
    qs.push(vel * p.d * w);
    Q += vel * p.d * w;
    A += p.d * w;
  }
  const nv = pts.filter((p) => p.d > 0).length;
  const share = Q > 0 ? Math.max(...qs) / Q : 1;
  return {
    outs: [
      { label: 'Caudal', value: `${f(Q, 2)} m³/s`, kid: true },
      { label: 'Área mojada', value: `${f(A, 2)} m²` },
      { label: 'Velocidad media', value: `${f(Q / Math.max(1e-9, A), 2)} m/s`, kid: true },
      { label: 'Verticales con agua', value: f(nv, 0) },
      { label: 'La vertical que más lleva', value: `${f(share * 100, 1)} % del caudal` },
    ],
    steps: [
      `Molinete: v = ${f(a, 3)}·n + ${f(b, 3)} (n en vueltas por segundo). En cada vertical, la velocidad media es el promedio a 0,2 y 0,8 de la profundidad.`,
      `Sección media (ISO 748): cada vertical representa la mitad de la distancia a sus vecinas; q = v·d·(b(k+1) − b(k−1))/2.`,
      `Q = Σ q = ${f(Q, 3)} m³/s; A = Σ d·ancho = ${f(A, 3)} m²; V = Q/A = ${f(Q / Math.max(1e-9, A), 3)} m/s.`,
    ],
    checks: [
      { name: 'Veinte verticales o más (recomendación usual de ISO 748)', ok: nv >= 20, value: f(nv, 0) },
      { name: 'Ninguna vertical con más de 10 % del caudal', ok: share <= 0.1, value: `${f(share * 100, 1)} %` },
    ],
    kid: `Por el río pasan ${f(Q, 1)} metros cúbicos de agua cada segundo.`,
    data: { kind: 'molinete', tabla: String(v.tabla ?? MOLINETE_LECTURAS), a, b },
  };
}

const GAUGING_TXT = GAUGINGS.map((g) => `${g.h.toFixed(2)} ${g.Q.toFixed(2)}`).join('\n');

export function preCurva(v: Vals): Result {
  const pts = rows(String(v.tabla ?? GAUGING_TXT)).map(([h, Q]) => ({ h, Q }));
  const auto = String(v.modo ?? 'auto') !== 'manual';
  const hq = num(v.hq, 2), h0m = num(v.h0, 0.35);
  if (pts.length < 4) return bad('Hacen falta al menos cuatro aforos: nivel (m) y caudal (m³/s), uno por línea.');
  if (pts.some((p) => p.Q <= 0)) return bad('Los caudales deben ser mayores que cero.');
  const fit = auto ? bestH0(pts) : fitRating(pts, h0m);
  if (!fit.ok) return bad('Con ese h0 hay aforos por debajo del cero de la curva: elige un h0 menor que el nivel más bajo.');
  const hmax = Math.max(...pts.map((p) => p.h)), hmin = Math.min(...pts.map((p) => p.h));
  const Q = ratingQ(fit, hq);
  return {
    outs: [
      { label: 'Curva', value: `Q = ${f(fit.a, 3)}·(h − ${f(fit.h0, 2)})^${f(fit.b, 3)}`, kid: true },
      { label: 'Ajuste (R² en logaritmos)', value: f(fit.r2, 4) },
      { label: 'Error típico de un aforo frente a la curva', value: `${f(fit.se * 100, 1)} %` },
      { label: `Caudal con h = ${f(hq, 2)} m`, value: `${f(Q, 2)} m³/s`, kid: true },
    ],
    steps: [
      auto ? `h0 (nivel de caudal cero) se busca en pasos de 1 cm bajo el aforo más bajo: el que deja el menor error es ${f(fit.h0, 2)} m.` : `h0 elegido: ${f(fit.h0, 2)} m.`,
      `Regresión de ln Q contra ln(h − h0) con ${pts.length} aforos: b = ${f(fit.b, 4)}, ln a = ${f(Math.log(fit.a), 4)} → a = ${f(fit.a, 4)}.`,
      `Error típico: desviación de los residuos en logaritmos = ${f(fit.se, 4)} (≈ ${f(fit.se * 100, 1)} % en caudal).`,
      hq > hmax ? `Ojo: ${f(hq, 2)} m está por encima del aforo más alto (${f(hmax, 2)} m): es una extrapolación; si el río sale del cauce, la curva puede equivocarse mucho.` : hq < hmin ? `${f(hq, 2)} m está por debajo del aforo más bajo: extrapolación hacia abajo.` : `${f(hq, 2)} m está dentro del rango aforado (${f(hmin, 2)} a ${f(hmax, 2)} m).`,
    ],
    checks: [
      { name: 'Nivel dentro del rango aforado', ok: hq >= hmin && hq <= hmax, value: `${f(hq, 2)} m` },
      { name: 'Error típico de 8 % o menos', ok: fit.se <= 0.08, value: `${f(fit.se * 100, 1)} %` },
    ],
    kid: `Con la regla en ${f(hq, 2)} metros pasan unos ${f(Q, 0)} metros cúbicos por segundo.`,
    data: { kind: 'curva', tabla: String(v.tabla ?? GAUGING_TXT), a: fit.a, b: fit.b, h0: fit.h0, hq, Q },
  };
}

// ------------------------------------------------------------------ medidores

const meterOf = (v: Vals): Meter => (String(v.tipo ?? 'venturi') === 'orificio' ? 'orificio' : 'venturi');

export function calcMedidor(v: Vals): Result {
  const kind = meterOf(v);
  const D = num(v.D, 100) / 1000, beta = num(v.beta, 0.6), dh = num(v.dh, 359) / 1000;
  if (!(D > 0.01 && D < 3 && beta > 0.05 && beta < 0.95 && dh >= 0)) return bad('Revisa los datos: diámetro mayor que 10 mm, β entre 0,05 y 0,95 y lectura positiva.');
  const Q = meterFlow(kind, dh, D, beta);
  const r = meterDp(kind, Q, D, beta);
  const warns = meterValid(kind, D, beta, r.ReD);
  return {
    outs: [
      { label: 'Caudal', value: `${f(Q * 1000, 2)} L/s`, kid: true },
      { label: 'Coeficiente de descarga C', value: f(r.C, 4) },
      { label: 'Número de Reynolds en la tubería', value: f(r.ReD, 0) },
      { label: 'Velocidad en la tubería y en la garganta', value: `${f(r.V1, 2)} y ${f(r.V2, 2)} m/s` },
      { label: 'Pérdida permanente', value: `${f(r.loss, 3)} m (${f((r.loss / Math.max(1e-9, r.dh)) * 100, 0)} % de la lectura)`, kid: true },
    ],
    steps: [
      `Bernoulli y continuidad entre la tubería y ${kind === 'venturi' ? 'la garganta' : 'el orificio'}: Q = C/√(1 − β⁴)·(π·d²/4)·√(2·g·Δh), con d = β·D = ${f(beta * D * 1000, 1)} mm.`,
      kind === 'venturi' ? `Venturi clásico con convergente mecanizado: C = ${f(r.C, 3)} (ISO 5167-4).` : `Placa con tomas en las esquinas: C de Reader-Harris/Gallagher (ISO 5167-2), que depende de β y del número de Reynolds; se itera: C = ${f(r.C, 4)} con Re = ${f(r.ReD, 0)}.`,
      `Q = ${f(r.C, 4)}/√(1 − ${f(beta ** 4, 4)})·${f((Math.PI * (beta * D) ** 2) / 4, 6)}·√(2·9,81·${f(dh, 3)}) = ${f(Q * 1000, 3)} L/s.`,
      kind === 'venturi' ? `Pérdida permanente: el cono de salida recupera casi toda la presión; queda cerca del 10 % de Δh (de 5 % a 20 % según ISO 5167-4).` : `Pérdida permanente de la placa (ISO 5167-2): Δω/Δp = (√(1 − β⁴(1 − C²)) − C·β²)/(√(1 − β⁴(1 − C²)) + C·β²) = ${f(r.loss / Math.max(1e-9, r.dh), 3)}.`,
    ],
    checks: [{ name: 'Dentro del rango de validez de la norma', ok: warns.length === 0, value: warns.length ? warns.join('; ') : 'sí' }],
    kid: `Por la tubería pasan ${f(Q * 1000, 1)} litros cada segundo.`,
    data: { kind: 'medidor', tipo: kind, D, beta, dh, Q: Q * 1000 },
  };
}

export function preMedidor(v: Vals): Result {
  const kind = meterOf(v);
  const D = num(v.D, 100) / 1000, Qmin = num(v.Qmin, 2) / 1000, Qmax = num(v.Qmax, 15) / 1000, hmax = num(v.hmax, 3), hmin = num(v.hmin, 50) / 1000;
  if (!(D > 0.01 && Qmin > 0 && Qmax > Qmin && hmax > 0 && hmin >= 0)) return bad('Revisa los datos: diámetro, caudales y lecturas positivos, con el caudal máximo mayor que el mínimo.');
  // el β que hace que el caudal máximo llene la escala: Δh baja cuando β crece
  const dhAt = (b: number, q: number) => meterDp(kind, q, D, b).dh;
  let lo = 0.2, hi = 0.8;
  if (dhAt(hi, Qmax) > hmax) return bad('Ni con β = 0,8 la lectura del caudal máximo cabe en la escala: usa una escala más alta o una tubería más grande.');
  if (dhAt(lo, Qmax) < hmax) lo = 0.2;
  else
    for (let k = 0; k < 60; k++) {
      const m = (lo + hi) / 2;
      if (dhAt(m, Qmax) > hmax) lo = m;
      else hi = m;
    }
  const beta = Math.ceil(hi * 100) / 100;
  const rMax = meterDp(kind, Qmax, D, beta), rMin = meterDp(kind, Qmin, D, beta);
  const turndown = Qmax / Qmin;
  return {
    outs: [
      { label: 'Razón de diámetros β', value: f(beta, 2), kid: true },
      { label: kind === 'venturi' ? 'Diámetro de la garganta' : 'Diámetro del orificio', value: `${f(beta * D * 1000, 1)} mm`, kid: true },
      { label: 'Lectura con el caudal mínimo', value: `${f(rMin.dh * 1000, 0)} mm` },
      { label: 'Lectura con el caudal máximo', value: `${f(rMax.dh, 2)} m` },
      { label: 'Pérdida permanente con el caudal máximo', value: `${f(rMax.loss, 2)} m` },
    ],
    steps: [
      `Se busca por bisección el β con el que el caudal máximo (${f(Qmax * 1000, 1)} L/s) da justo la lectura máxima de ${f(hmax, 2)} m, y se redondea hacia arriba: β = ${f(beta, 2)}.`,
      `Como Δh crece con Q², con el caudal mínimo la lectura es unas ${f(turndown ** 2, 0)} veces menor: ${f(rMin.dh * 1000, 1)} mm.`,
      `Una lectura pequeña es poco precisa: con una regla al milímetro, la incertidumbre del caudal con el mínimo es cerca de ${f((0.25 / Math.max(1e-9, rMin.dh * 1000)) * 100, 1)} %.`,
    ],
    checks: [
      { name: `Lectura de ${f(hmin * 1000, 0)} mm o más con el caudal mínimo`, ok: rMin.dh >= hmin, value: `${f(rMin.dh * 1000, 0)} mm` },
      { name: 'β dentro del rango de la norma', ok: kind === 'venturi' ? beta >= 0.4 && beta <= 0.75 : beta >= 0.1 && beta <= 0.75, value: f(beta, 2) },
    ],
    kid: `Un ${kind === 'venturi' ? 'Venturi' : 'orificio'} de ${f(beta * D * 1000, 0)} milímetros mide bien de ${f(Qmin * 1000, 0)} a ${f(Qmax * 1000, 0)} litros por segundo.`,
    data: { kind: 'premedidor', tipo: kind, D, beta, Qmin: Qmin * 1000, Qmax: Qmax * 1000, hmax, hmin },
  };
}

// ------------------------------------------------------------------ gráficas de la memoria

registerPlan(calcBalancin, (d) => {
  const Is = Array.from({ length: 31 }, (_, k) => k * 7);
  const meas = (I: number) => {
    const Ic = I * Math.max(0.88, 1 - 0.012 * N(d.u));
    return Ic / (1 + (Ic * (N(d.tau) / 3600)) / N(d.d));
  };
  return { chart: { title: 'Lo que marca el balancín según la lluvia real', xLabel: 'lluvia real (mm/h)', yLabel: 'registrada (mm/h)', series: [{ name: 'registrada', pts: Is.map((I) => [I, meas(I)] as XY) }, { name: 'perfecta', pts: Is.map((I) => [I, I] as XY), dash: true }], mark: { at: [N(d.I), N(d.Im)] as XY, text: 'esta lectura' } } };
});
registerPlan(calcZR, (d) => {
  const zs = Array.from({ length: 31 }, (_, k) => 15 + k * 1.5);
  return { chart: { title: 'Lluvia según la reflectividad del radar', xLabel: 'reflectividad (dBZ)', yLabel: 'lluvia (mm/h)', logY: true, series: (Object.keys(ZR) as ZRKey[]).map((k) => ({ name: ZR[k].short.toLowerCase(), pts: zs.map((z) => [z, rainFromDbz(z, k)] as XY) })), mark: { at: [N(d.Z), rainFromDbz(N(d.Z), 'mp')] as XY, text: 'esta lectura' } } };
});
registerPlan(preRed, (d) => {
  const As = Array.from({ length: 21 }, (_, k) => (k / 20) * Math.max(100, N(d.A) * 2));
  return { chart: { title: 'Pluviómetros mínimos según el área', xLabel: 'área (km²)', yLabel: 'estaciones', series: [{ name: 'pluviómetros', pts: As.map((A) => [A, Math.max(1, Math.ceil(A / N(d.plain)))] as XY) }, { name: 'registradores', pts: As.map((A) => [A, Math.max(1, Math.ceil(A / N(d.rec)))] as XY) }], mark: { at: [N(d.A), Math.max(1, Math.ceil(N(d.A) / N(d.plain)))] as XY, text: 'esta cuenca' } } };
});
registerPlan(calcMolinete, (d) => {
  const pts = rows(String(d.tabla)).filter((p) => p.length >= 5).sort((p, q) => p[0] - q[0]);
  return { chart: { title: 'La sección aforada', xLabel: 'distancia (m)', yLabel: 'profundidad (m) y velocidad (m/s)', series: [{ name: 'profundidad', pts: pts.map((p) => [p[0], p[1]] as XY) }, { name: 'velocidad', pts: pts.map((p) => [p[0], p[1] > 0 ? (N(d.a) * (p[2] / p[4]) + N(d.b) + N(d.a) * (p[3] / p[4]) + N(d.b)) / 2 : 0] as XY), dash: true }] } };
});
registerPlan(preCurva, (d) => {
  const pts = rows(String(d.tabla)).map(([h, Q]) => ({ h, Q }));
  const hmax = Math.max(N(d.hq), ...pts.map((p) => p.h)) * 1.05;
  const hs = Array.from({ length: 40 }, (_, k) => N(d.h0) + 0.01 + ((hmax - N(d.h0) - 0.01) * k) / 39);
  const fit = { a: N(d.a), b: N(d.b), h0: N(d.h0), r2: 1, se: 0, ok: true };
  return { chart: { title: 'Curva de gasto y aforos', xLabel: 'nivel en la regla (m)', yLabel: 'caudal (m³/s)', series: [{ name: 'curva', pts: hs.map((h) => [h, ratingQ(fit, h)] as XY) }, { name: 'aforos', pts: pts.map((p) => [p.h, p.Q] as XY), dots: true }], mark: { at: [N(d.hq), N(d.Q)] as XY, text: 'nivel pedido' } } };
});
registerPlan(calcMedidor, (d) => {
  const kind = String(d.tipo) as Meter;
  const Qs = Array.from({ length: 31 }, (_, k) => (k / 30) * Math.max(1, N(d.Q) * 1.8));
  return { chart: { title: 'Lectura del medidor según el caudal', xLabel: 'caudal (L/s)', yLabel: 'lectura Δh (m)', series: [{ name: 'Δh', pts: Qs.map((q) => [q, q > 0 ? meterDp(kind, q / 1000, N(d.D), N(d.beta)).dh : 0] as XY) }], mark: { at: [N(d.Q), N(d.dh)] as XY, text: 'esta lectura' } } };
});
registerPlan(preMedidor, (d) => {
  const kind = String(d.tipo) as Meter;
  const Qs = Array.from({ length: 31 }, (_, k) => (k / 30) * N(d.Qmax) * 1.1);
  return { chart: { title: 'Lectura del medidor elegido', xLabel: 'caudal (L/s)', yLabel: 'lectura Δh (m)', series: [{ name: 'Δh', pts: Qs.map((q) => [q, q > 0 ? meterDp(kind, q / 1000, N(d.D), N(d.beta)).dh : 0] as XY) }], hlines: [{ y: N(d.hmax), text: 'escala' }, { y: N(d.hmin), text: 'mínimo legible' }] } };
});

// ------------------------------------------------------------------ juegos de herramientas

const NORM =
  'En esta sala se citan métodos de normas internacionales (ISO 748 para el aforo con molinete y la familia ISO 5167 para los medidores de presión diferencial) y la guía de la OMM para las redes de pluviómetros, como referencia para aprender. El pluviómetro, el río, los aforos y el banco de tuberías son ilustrativos. Una medición oficial sigue los procedimientos de la entidad responsable (en Colombia, el IDEAM para la red hidrometeorológica).';
const ZR_OPTS = (Object.keys(WMO_DENSITY) as string[]).map((k) => ({ value: k, label: WMO_DENSITY[k].name }));
const METER_OPTS = [
  { value: 'venturi', label: 'Venturi clásico' },
  { value: 'orificio', label: 'Placa de orificio (tomas en las esquinas)' },
];

export const MEASURE_TOOLS: Record<'lluvia' | 'aforo' | 'medidor', ToolSet> = {
  lluvia: {
    norm: NORM,
    calc: {
      title: 'Corrección de un pluviómetro de balancín',
      intro: 'De los vuelcos contados a la lluvia real, corrigiendo el agua que se pierde mientras el balancín se vuelca y la que desvía el viento.',
      kidIntro: '¿Cuánto llovió de verdad?',
      fields: [
        { id: 'tips', label: 'Vuelcos contados', def: 33, kid: true },
        { id: 'min', label: 'En un período de', unit: 'min', def: 10, kid: true },
        { id: 'u', label: 'Viento a la altura de la boca', unit: 'm/s', def: 2 },
        { id: 'd', label: 'Lluvia por vuelco', unit: 'mm', def: 0.2 },
        { id: 'tau', label: 'Tiempo de vuelco', unit: 's', def: 0.5 },
      ],
      run: calcBalancin,
    },
    pre: {
      title: 'Prediseño de una red de pluviómetros',
      intro: 'Número mínimo de pluviómetros y de registradores para un área, con las densidades de la guía de la OMM.',
      kidIntro: '¿Cuántos pluviómetros necesita una cuenca?',
      fields: [
        { id: 'A', label: 'Área', unit: 'km²', def: 1200, kid: true },
        { id: 'terr', label: 'Tipo de región', def: 'montana', kid: true, options: ZR_OPTS },
      ],
      run: preRed,
    },
    extra: [{ kind: 'calc', title: 'Lluvia desde el radar (relaciones Z-R)', intro: 'La lluvia que corresponde a una reflectividad con tres relaciones Z-R publicadas.', kidIntro: '¿Cuánto llueve según el radar?', fields: [{ id: 'dbz', label: 'Reflectividad', unit: 'dBZ', def: 45 }], run: calcZR }],
  },
  aforo: {
    norm: NORM,
    calc: {
      title: 'Aforo con molinete (sección media)',
      intro: 'Caudal de un río con las lecturas de un molinete a 0,2 y 0,8 de la profundidad en cada vertical, por el método de la sección media.',
      kidIntro: '¿Cuánta agua lleva el río?',
      fields: [
        { id: 'tabla', label: 'Verticales: distancia (m), profundidad (m), vueltas a 0,2, vueltas a 0,8 y segundos (las orillas con profundidad 0)', def: MOLINETE_LECTURAS, text: true, kid: true },
        { id: 'a', label: 'Molinete: a', unit: 'm por vuelta', def: METER_A },
        { id: 'b', label: 'Molinete: b', unit: 'm/s', def: METER_B },
      ],
      run: calcMolinete,
    },
    pre: {
      title: 'Curva de gasto',
      intro: 'Ajuste de la curva Q = a·(h − h0)^b a una serie de aforos, con el nivel de caudal cero automático o elegido, y el caudal para un nivel.',
      kidIntro: '¿Cuánta agua pasa con la regla en un nivel?',
      fields: [
        { id: 'tabla', label: 'Aforos: nivel (m) y caudal (m³/s), uno por línea', def: GAUGING_TXT, text: true },
        {
          id: 'modo',
          label: 'Nivel de caudal cero h0',
          def: 'auto',
          options: [
            { value: 'auto', label: 'Buscarlo (menor error)' },
            { value: 'manual', label: 'Elegirlo' },
          ],
        },
        { id: 'h0', label: 'h0 elegido', unit: 'm', def: 0.35, when: ['modo', ['manual']] },
        { id: 'hq', label: 'Nivel para calcular el caudal', unit: 'm', def: 2, kid: true },
      ],
      run: preCurva,
    },
  },
  medidor: {
    norm: NORM,
    calc: {
      title: 'Caudal con un Venturi o una placa de orificio',
      intro: 'Caudal desde la lectura de la diferencia de presión, con el coeficiente de la norma y la pérdida permanente.',
      kidIntro: '¿Cuánta agua pasa por el tubo?',
      fields: [
        { id: 'tipo', label: 'Medidor', def: 'venturi', kid: true, options: METER_OPTS },
        { id: 'D', label: 'Diámetro de la tubería', unit: 'mm', def: 100 },
        { id: 'beta', label: 'Razón de diámetros β = d/D', def: 0.6 },
        { id: 'dh', label: 'Lectura Δh (diferencia de los piezómetros)', unit: 'mm', def: 359, kid: true },
      ],
      run: calcMedidor,
    },
    pre: {
      title: 'Prediseño de un medidor',
      intro: 'Razón de diámetros para que el caudal máximo llene la escala de lectura, y si el caudal mínimo se alcanza a leer bien.',
      kidIntro: '¿De qué tamaño debe ser la garganta?',
      fields: [
        { id: 'tipo', label: 'Medidor', def: 'venturi', kid: true, options: METER_OPTS },
        { id: 'D', label: 'Diámetro de la tubería', unit: 'mm', def: 100 },
        { id: 'Qmin', label: 'Caudal mínimo', unit: 'L/s', def: 2, kid: true },
        { id: 'Qmax', label: 'Caudal máximo', unit: 'L/s', def: 15, kid: true },
        { id: 'hmax', label: 'Lectura máxima de la escala', unit: 'm', def: 3 },
        { id: 'hmin', label: 'Lectura mínima legible', unit: 'mm', def: 50 },
      ],
      run: preMedidor,
    },
  },
};

export { G };

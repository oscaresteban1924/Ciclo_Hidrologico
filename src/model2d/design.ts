// Herramientas de diseño de la sala «Modelación hidráulica 2D»: funciones puras (datos del formulario → resultados,
// pasos y verificaciones) con su gráfica para la memoria. Son cálculos académicos para preparar un modelo, no
// diseños de ingeniería.

import { f, type Result, type Vals } from '../canals/designCalc';
import { registerPlan } from '../canals/designPlans';
import type { XY } from '../canals/plan';
import type { ToolSet } from '../canals/design';
import { AMS, fitGumbel, gumbelK, periodForRisk, periodOfY, plotting, quantile, reducedY, risk } from './hydrology';
import { hydroQ, scsQ, scsS, weirFlow } from './solver';
import { damageFrac, ead, intensity, zoneOf, INTENSITY_NAMES, ZONE_NAMES } from './analysis';

export const ROOM = 'Modelación hidráulica 2D';

const num = (v: number | string | undefined, def: number) => {
  if (v === undefined) return def;
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};
const bad = (error: string): Result => ({ outs: [], steps: [], kid: '', error });
const N = (x: number | string | undefined) => (typeof x === 'number' ? x : Number(x));
const lines = (txt: string) =>
  txt
    .split(/[\n;]+/)
    .map((l) => l.trim())
    .filter(Boolean);
const numbers = (txt: string) =>
  txt
    .split(/[\s;]+/)
    .filter(Boolean)
    .map((x) => Number(x.replace(',', '.')))
    .filter((x) => Number.isFinite(x));

// ------------------------------------------------------------------ terreno

/** Sección trapecial vista con píxeles: cotas cada 0,1 m de una franja de ancho W centrada en el cauce. */
function trapezoid(b: number, D: number, z: number, x: number): number {
  const a = Math.abs(x);
  if (a <= b / 2) return -D;
  if (a >= b / 2 + z * D) return 0;
  return -D + (a - b / 2) / z;
}
function pixelated(b: number, D: number, z: number, p: number, method: string, shift: number, x: number): number {
  const k = Math.floor((x + shift) / p);
  const x0 = k * p - shift, x1 = x0 + p;
  let s = 0, lo = Infinity, hi = -Infinity, n = 0;
  for (let u = x0 + 0.05; u < x1; u += 0.1) {
    const v = trapezoid(b, D, z, u);
    s += v;
    n++;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return method === 'minimo' ? lo : method === 'maximo' ? hi : s / n;
}
function stripQ(zf: (x: number) => number, half: number, n: number, S: number): number {
  let K = 0;
  for (let x = -half + 0.05; x < half; x += 0.1) {
    const d = -zf(x);
    if (d > 0) K += (0.1 * Math.pow(d, 5 / 3)) / n;
  }
  return K * Math.sqrt(S);
}

export function calcPixelCauce(v: Vals): Result {
  const b = num(v.b, 6), D = num(v.D, 2.4), z = num(v.z, 1), n = num(v.n, 0.04), S = num(v.S, 0.5) / 100, p = num(v.p, 10);
  const method = String(v.metodo ?? 'promedio');
  if (!(b > 0 && D > 0 && z >= 0 && z <= 10 && n > 0.005 && n < 1 && S > 0 && S < 0.5 && p >= 0.5 && p <= 100)) return bad('Revisa los datos: ancho, profundidad, n, pendiente y píxel mayores que cero; talud entre 0 y 10.');
  const top = b + 2 * z * D;
  const half = top / 2 + 2 * p + 5;
  const Qt = stripQ((x) => trapezoid(b, D, z, x), half, n, S);
  const Qa = stripQ((x) => pixelated(b, D, z, p, method, p / 2, x), half, n, S);
  const Qs = stripQ((x) => pixelated(b, D, z, p, method, 0, x), half, n, S);
  const across = top / p;
  return {
    outs: [
      { label: 'Capacidad real (a orilla llena)', value: `${f(Qt, 1)} m³/s`, kid: true },
      { label: 'Vista con píxeles centrados en el cauce', value: `${f(Qa, 1)} m³/s (${f((Qa / Qt) * 100, 0)} %)`, kid: true },
      { label: 'Vista con el borde de un píxel en el eje', value: `${f(Qs, 1)} m³/s (${f((Qs / Qt) * 100, 0)} %)` },
      { label: 'Píxeles a lo ancho de la boca', value: f(across, 1) },
    ],
    steps: [
      `Sección trapecial: fondo ${f(b, 1)} m, profundidad ${f(D, 2)} m, talud ${f(z, 1)}:1 → boca de ${f(top, 1)} m.`,
      `Capacidad por franjas de 10 cm: Q = √S·Σ (1/n)·d^(5/3)·Δy con n = ${f(n, 3)} y S = ${f(S * 100, 2)} %: ${f(Qt, 2)} m³/s.`,
      `Con píxeles de ${f(p, 1)} m (${method === 'minimo' ? 'mínimo' : method === 'maximo' ? 'máximo' : 'promedio'} de cada píxel) el cauce se vuelve ${method === 'promedio' ? 'más ancho y menos hondo' : method === 'minimo' ? 'un foso del ancho del píxel' : 'más angosto o desaparece'}: ${f(Qa, 2)} m³/s si un píxel cae centrado y ${f(Qs, 2)} m³/s si un borde cae en el eje.`,
      `La conducción depende de d^(5/3): repartir la misma área en una franja ancha y poco honda conduce menos agua.`,
    ],
    checks: [
      { name: 'Cuatro píxeles o más a lo ancho de la boca (criterio de esta sala)', ok: across >= 4, value: f(across, 1) },
      { name: 'Capacidad vista entre 80 % y 120 % de la real', ok: Qa / Qt >= 0.8 && Qa / Qt <= 1.2 && Qs / Qt >= 0.8 && Qs / Qt <= 1.2, value: `${f((Qa / Qt) * 100, 0)} % y ${f((Qs / Qt) * 100, 0)} %` },
    ],
    kid: `Con cuadritos de ${f(p, 0)} metros el modelo ve un cauce que lleva ${f(Qa, 0)} en vez de ${f(Qt, 0)} metros cúbicos por segundo.`,
    data: { kind: 'pixel', b, D, z, p, method },
  };
}

export function preResolucion(v: Vals): Result {
  const W = num(v.W, 11), crest = num(v.crest, 3), V = num(v.V, 2.5), h = num(v.h, 2), rmse = num(v.rmse, 0.1), dz = num(v.dz, 0.3), L = num(v.L, 640);
  if (!(W > 0 && crest > 0 && V > 0 && V < 20 && h > 0 && rmse >= 0 && dz > 0 && L > 0)) return bad('Revisa los datos: anchos, velocidad, profundidad y diferencias mayores que cero.');
  const pMax = W / 4;
  const pCrest = crest / 2;
  const p = Math.min(pMax, pCrest);
  const vOk = rmse <= dz / 3;
  // malla: celdas que no salten el cauce sin subgrid; con subgrid basta que las caras sigan los quiebres
  const cMin = Math.max(2, Math.round(W / 2)), cMax = Math.max(cMin, Math.round(W * 3));
  const cel = Math.sqrt(9.81 * h);
  const dtSWE = (1 * cMin) / V, dtDWE = (5 * cMin) / V, dtLI = (0.7 * cMin) / (V + cel);
  const cells = Math.ceil(((L * L) / 1.6 / (cMin * cMin)) / 1000) * 1000;
  return {
    outs: [
      { label: 'Píxel del terreno', value: `${f(p, 2)} m o menos`, kid: true },
      { label: 'Tamaño de las celdas (con subgrid)', value: `${f(cMin, 0)} a ${f(cMax, 0)} m`, kid: true },
      { label: 'Líneas de quiebre', value: 'en el jarillón, la vía y las orillas' },
      { label: 'Paso de tiempo: aguas someras, C ≈ 1', value: `${f(dtSWE, 1)} s` },
      { label: 'Paso de tiempo: onda difusiva, C hasta 5', value: `${f(dtDWE, 1)} s` },
      { label: 'Paso de tiempo de un esquema explícito (inercia local)', value: `${f(dtLI, 2)} s` },
      { label: 'Celdas aproximadas para un área de L × 0,6 L', value: f(cells, 0) },
    ],
    steps: [
      `Cauce de ${f(W, 1)} m de boca: con cuatro píxeles o más a lo ancho, píxel ≤ ${f(pMax, 2)} m. Corona de ${f(crest, 1)} m: con dos píxeles, ≤ ${f(pCrest, 2)} m. Manda el menor: ${f(p, 2)} m.`,
      `Error vertical de la fuente ${f(rmse, 2)} m frente a la diferencia que interesa (${f(dz, 2)} m): ${vOk ? 'es menos de un tercio, sirve' : 'es más de un tercio, la fuente no alcanza'}.`,
      `Con subgrid las celdas pueden ser más grandes que el píxel: cada celda guarda su curva cota-volumen y cada cara su perfil. Las caras deben seguir los quiebres (jarillones, vías, orillas): eso hacen las líneas de quiebre.`,
      `Paso de tiempo con Courant C = V·Δt/Δx (guía de HEC-RAS: C cerca de 1 en las zonas más rápidas; hasta 3 con las ecuaciones completas y hasta 5 con la onda difusiva): Δt = C·${f(cMin, 0)}/${f(V, 1)}.`,
      `Un esquema explícito necesita además Δt ≤ 0,7·Δx/(V + √(g·h)) = 0,7·${f(cMin, 0)}/(${f(V, 1)} + ${f(cel, 2)}) = ${f(dtLI, 2)} s.`,
    ],
    checks: [
      { name: 'Error vertical ≤ un tercio de la diferencia que interesa', ok: vOk, value: `${f(rmse, 2)} m frente a ${f(dz / 3, 2)} m` },
      { name: 'Celdas que no pasen de tres veces la boca del cauce', ok: cMax <= W * 3 + 1e-9, value: `${f(cMax, 0)} m` },
    ],
    kid: `Para este cauce el terreno necesita cuadritos de ${f(p, 1)} metros o menos.`,
    data: { kind: 'resolucion', W, crest, p, cMin, cMax, V, h },
  };
}

// ------------------------------------------------------------------ coberturas

const COWAN = {
  n0: { tierra: 0.02, roca: 0.025, gravafina: 0.024, gravagruesa: 0.028 },
  n1: { liso: 0, menor: 0.005, moderado: 0.01, severo: 0.02 },
  n2: { gradual: 0, ocasional: 0.005, frecuente: 0.0125 },
  n3: { despreciable: 0, menor: 0.0125, apreciable: 0.025, severo: 0.05 },
  n4: { baja: 0.0075, media: 0.0175, alta: 0.0375, muyalta: 0.075 },
  m5: { menor: 1, apreciable: 1.15, severo: 1.3 },
} as const;
const pick = <T extends Record<string, number>>(t: T, k: string | number | undefined, d: keyof T) => (String(k) in t ? t[String(k) as keyof T] : t[d]);

export function calcCowan(v: Vals): Result {
  const n0 = pick(COWAN.n0, v.n0, 'gravagruesa'), n1 = pick(COWAN.n1, v.n1, 'menor'), n2 = pick(COWAN.n2, v.n2, 'ocasional'), n3 = pick(COWAN.n3, v.n3, 'menor'), n4 = pick(COWAN.n4, v.n4, 'baja'), m5 = pick(COWAN.m5, v.m5, 'apreciable');
  const n = (n0 + n1 + n2 + n3 + n4) * m5;
  return {
    outs: [
      { label: 'n de Manning', value: f(n, 3), kid: true },
      { label: 'Suma antes de los meandros', value: f(n0 + n1 + n2 + n3 + n4, 4) },
    ],
    steps: [
      `Método de Cowan (Chow, 1959, tabla 5-5): n = (n0 + n1 + n2 + n3 + n4)·m5.`,
      `Material del cauce n0 = ${f(n0, 3)}; irregularidad n1 = ${f(n1, 3)}; variación de la sección n2 = ${f(n2, 4)}; obstrucciones n3 = ${f(n3, 4)}; vegetación n4 = ${f(n4, 4)}; meandros m5 = ${f(m5, 2)} (en los rangos se usa el valor medio).`,
      `n = (${f(n0, 3)} + ${f(n1, 3)} + ${f(n2, 4)} + ${f(n3, 4)} + ${f(n4, 4)})·${f(m5, 2)} = ${f(n, 4)}.`,
      `Es un valor de partida: un modelo se calibra con niveles o huellas de crecientes observadas.`,
    ],
    checks: [{ name: 'Dentro del rango usual de cauces naturales (0,025 a 0,15)', ok: n >= 0.025 && n <= 0.15, value: f(n, 3) }],
    kid: `Este cauce tiene un n de ${f(n, 3)}: entre más grande, más frena al agua.`,
    data: { kind: 'cowan', n, base: n0, add: n1 + n2 + n3 + n4, m5 },
  };
}

const DEF_MIX = 'pasto 50 0,030\nbosque 30 0,100\ncultivo 20 0,035';
export function preCompuesto(v: Vals): Result {
  const rows = lines(String(v.tabla ?? DEF_MIX))
    .map((l) => {
      const parts = l.split(/\s+/);
      const nums = parts.slice(1).map((x) => Number(x.replace(',', '.')));
      return { name: parts[0], pct: nums[0], n: nums[1] };
    })
    .filter((r) => Number.isFinite(r.pct) && Number.isFinite(r.n));
  const h = num(v.h, 0.8), Wf = num(v.W, 20), S = num(v.S, 0.5) / 100;
  if (rows.length < 1) return bad('Escribe al menos una línea: cobertura, porcentaje del ancho y n (por ejemplo «pasto 50 0,030»).');
  if (rows.some((r) => r.pct <= 0 || r.n <= 0.005 || r.n > 2) || !(h > 0 && Wf > 0 && S > 0)) return bad('Revisa los datos: porcentajes positivos, n entre 0,005 y 2, profundidad, ancho y pendiente mayores que cero.');
  const tot = rows.reduce((a, r) => a + r.pct, 0);
  const fr = rows.map((r) => ({ ...r, f: r.pct / tot }));
  const nArea = fr.reduce((a, r) => a + r.f * r.n, 0);
  const nHorton = Math.pow(fr.reduce((a, r) => a + r.f * Math.pow(r.n, 1.5), 0), 2 / 3);
  const nLotter = 1 / fr.reduce((a, r) => a + r.f / r.n, 0);
  const Q = (n: number) => ((Wf * Math.pow(h, 5 / 3)) / n) * Math.sqrt(S);
  return {
    outs: [
      { label: 'Promedio por área', value: f(nArea, 4), kid: true },
      { label: 'Horton y Einstein (igual velocidad)', value: f(nHorton, 4) },
      { label: 'Por conducción (franjas, como esta sala)', value: f(nLotter, 4), kid: true },
      { label: `Caudal por la cara con ${f(h, 2)} m: área / conducción`, value: `${f(Q(nArea), 2)} / ${f(Q(nLotter), 2)} m³/s` },
    ],
    steps: [
      `Fracciones del ancho: ${fr.map((r) => `${r.name} ${f(r.f * 100, 0)} % (n ${f(r.n, 3)})`).join('; ')}${Math.abs(tot - 100) > 0.5 ? ` (los porcentajes sumaban ${f(tot, 0)} y se normalizaron)` : ''}.`,
      `Promedio por área: n = Σ fᵢ·nᵢ = ${f(nArea, 4)}.`,
      `Horton y Einstein (cada franja con la misma velocidad): n = (Σ fᵢ·nᵢ^1,5)^(2/3) = ${f(nHorton, 4)}.`,
      `Por conducción, con franjas de la misma profundidad (Lotter): n = 1/Σ(fᵢ/nᵢ) = ${f(nLotter, 4)}. Es lo que hace el modelo de esta sala al sumar la conducción de cada metro de cara.`,
      `Con ${f(Wf, 0)} m de ancho, ${f(h, 2)} m de agua y S = ${f(S * 100, 2)} %: Q = (W·h^(5/3)/n)·√S.`,
    ],
    checks: [{ name: 'Los métodos difieren menos de 20 %', ok: Math.max(nArea, nHorton, nLotter) / Math.min(nArea, nHorton, nLotter) <= 1.2, value: `${f((Math.max(nArea, nHorton, nLotter) / Math.min(nArea, nHorton, nLotter) - 1) * 100, 0)} %` }],
    kid: `Mezclando las coberturas, el n queda entre ${f(Math.min(nArea, nHorton, nLotter), 3)} y ${f(Math.max(nArea, nHorton, nLotter), 3)}.`,
    data: { kind: 'compuesto', nArea, nHorton, nLotter, W: Wf, S, h },
  };
}

// ------------------------------------------------------------------ periodos de retorno

export const AMS_TXT = AMS.map((a) => f(a.Q, 1)).join('\n');

export function calcGumbel(v: Vals): Result {
  const Q = numbers(String(v.serie ?? AMS_TXT));
  const T = num(v.T, 100);
  if (Q.length < 8) return bad('Hacen falta al menos 8 máximos anuales (uno por línea).');
  if (Q.some((q) => q <= 0) || !(T > 1.01 && T <= 10000)) return bad('Los caudales deben ser positivos y el periodo de retorno mayor que 1 año.');
  const fit = fitGumbel(Q);
  const K = gumbelK(T), QT = quantile(fit, T);
  const Ts = [2, 5, 10, 25, 50, 100, 500];
  return {
    outs: [
      { label: `Caudal de ${f(T, 0)} años`, value: `${f(QT, 1)} m³/s`, kid: true },
      { label: 'Media y desviación', value: `${f(fit.mean, 2)} y ${f(fit.sd, 2)} m³/s` },
      ...Ts.map((t) => ({ label: `Q${t}`, value: `${f(quantile(fit, t), 1)} m³/s` })),
    ],
    steps: [
      `${Q.length} máximos anuales: media ${f(fit.mean, 3)} m³/s, desviación ${f(fit.sd, 3)} m³/s.`,
      `Gumbel por momentos: K_T = −(√6/π)·(0,5772 + ln(ln(T/(T − 1)))); para T = ${f(T, 0)}: K = ${f(K, 4)}.`,
      `Q_T = media + K_T·desviación = ${f(fit.mean, 3)} + ${f(K, 4)}·${f(fit.sd, 3)} = ${f(QT, 2)} m³/s.`,
      `Con ${Q.length} años de datos, los periodos mucho mayores que la serie (más de dos o tres veces su largo) son extrapolaciones con mucha incertidumbre.`,
    ],
    checks: [{ name: 'El periodo pedido no pasa de tres veces el largo de la serie', ok: T <= 3 * Q.length, value: `${f(T, 0)} frente a ${Q.length} años` }],
    kid: `La creciente de ${f(T, 0)} años trae unos ${f(QT, 0)} metros cúbicos por segundo.`,
    data: { kind: 'gumbel', serie: Q.join(' '), T, QT },
  };
}

export function preRiesgo(v: Vals): Result {
  const n = num(v.n, 50), R = num(v.R, 10) / 100;
  if (!(n >= 1 && n <= 500 && R > 0 && R < 1)) return bad('La vida útil va de 1 a 500 años y el riesgo entre 0 y 100 %.');
  const T = periodForRisk(R, n);
  const fit = fitGumbel(AMS.map((a) => a.Q));
  const QT = quantile(fit, T);
  return {
    outs: [
      { label: 'Periodo de retorno necesario', value: `${f(T, 0)} años`, kid: true },
      { label: 'Caudal con la serie de la sala', value: `${f(QT, 1)} m³/s` },
      { label: `Riesgo con T = 100 años en ${f(n, 0)} años`, value: `${f(risk(100, n) * 100, 1)} %` },
    ],
    steps: [
      `La probabilidad de que la creciente de T años se presente al menos una vez en n años es R = 1 − (1 − 1/T)^n.`,
      `Despejando T para R = ${f(R * 100, 1)} % y n = ${f(n, 0)}: T = 1/(1 − (1 − R)^(1/n)) = ${f(T, 1)} años.`,
      `Con la serie ilustrativa de la quebrada (Gumbel): Q = ${f(QT, 1)} m³/s.`,
      `Por eso una obra «para 100 años» tiene casi 40 % de probabilidad de ver esa creciente en 50 años.`,
    ],
    kid: `Para que en ${f(n, 0)} años la creciente llegue con solo ${f(R * 100, 0)} % de probabilidad, hay que diseñar para ${f(T, 0)} años.`,
    data: { kind: 'riesgo', n, R, T },
  };
}

export function calcHidrograma(v: Vals): Result {
  const Qp = num(v.Qp, 80), tp = num(v.tp, 30), Qb = num(v.Qb, 4), dur = num(v.dur, 120);
  if (!(Qp > 0 && tp > 0 && Qb >= 0 && Qb < Qp && dur > tp)) return bad('Revisa los datos: pico mayor que el caudal base, tiempo al pico y duración positivos (la duración mayor que el tiempo al pico).');
  const h = { Qp, tp, Qb };
  let V = 0;
  for (let t = 0; t < dur * 60; t += 10) V += (hydroQ(h, t) - Qb) * 10;
  // ∫[(t/tp)·e^(1 − t/tp)]^m dt = tp·e^m·Γ(m + 1)/m^(m + 1)
  const Vtheory = ((Qp - Qb) * tp * 60 * Math.exp(3.7) * gammaFn(4.7)) / Math.pow(3.7, 4.7);
  return {
    outs: [
      { label: 'Volumen de la creciente (sobre el base)', value: `${f(V / 1000, 1)} mil m³`, kid: true },
      { label: 'Caudal a la mitad del tiempo al pico', value: `${f(hydroQ(h, tp * 30), 1)} m³/s` },
      { label: 'Caudal al doble del tiempo al pico', value: `${f(hydroQ(h, tp * 120), 1)} m³/s` },
    ],
    steps: [
      `Forma gamma (aproximación del hidrograma unitario adimensional del SCS): Q(t) = Qb + (Qp − Qb)·[(t/tp)·e^(1 − t/tp)]^3,7.`,
      `Con Qp = ${f(Qp, 1)} m³/s, tp = ${f(tp, 0)} min y Qb = ${f(Qb, 1)} m³/s.`,
      `Volumen sobre el base hasta ${f(dur, 0)} min: ${f(V, 0)} m³ (sin cortar sería ${f(Vtheory, 0)} m³).`,
      `Es la condición de borde de entrada: en HEC-RAS se escribe como «Flow Hydrograph» en la línea de borde de aguas arriba.`,
    ],
    checks: [{ name: 'La duración recoge la creciente (al final queda menos de 2 % del pico)', ok: hydroQ(h, dur * 60) - Qb <= 0.02 * (Qp - Qb), value: `${f(hydroQ(h, dur * 60), 1)} m³/s` }],
    kid: `La creciente trae ${f(V / 1000, 0)} mil metros cúbicos de agua.`,
    data: { kind: 'hidrograma', Qp, tp, Qb, dur },
  };
}
function gammaFn(z: number): number {
  // Lanczos (g = 7)
  const p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  z -= 1;
  let x = p[0];
  for (let i = 1; i < 9; i++) x += p[i] / (z + i);
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// ------------------------------------------------------------------ malla y ecuaciones

export function calcCourant(v: Vals): Result {
  const dx = num(v.dx, 10), V = num(v.V, 2.5), h = num(v.h, 2), C = num(v.C, 1);
  if (!(dx > 0 && V > 0 && V < 30 && h > 0 && h < 50 && C > 0 && C <= 10)) return bad('Revisa los datos: tamaño de celda, velocidad y profundidad mayores que cero; Courant entre 0 y 10.');
  const dt = (C * dx) / V;
  const cel = Math.sqrt(9.81 * h);
  const dtLI = (0.7 * dx) / (V + cel);
  return {
    outs: [
      { label: `Paso de tiempo para C = ${f(C, 2)}`, value: `${f(dt, 2)} s`, kid: true },
      { label: 'Celeridad de las ondas √(g·h)', value: `${f(cel, 2)} m/s` },
      { label: 'Paso máximo de un esquema explícito', value: `${f(dtLI, 2)} s` },
    ],
    steps: [
      `Número de Courant como lo usa HEC-RAS: C = V·Δt/Δx. Para C = ${f(C, 2)}: Δt = ${f(C, 2)}·${f(dx, 1)}/${f(V, 2)} = ${f(dt, 3)} s.`,
      `Guía de HEC-RAS: C cerca de 1 en las zonas más rápidas; con el esquema implícito se puede llegar a 3 (ecuaciones completas) y a 5 (onda difusiva) si los resultados no cambian.`,
      `Un esquema explícito (como la inercia local de esta sala) es estable solo si las ondas no saltan una celda en un paso: Δt ≤ 0,7·Δx/(V + √(g·h)) = 0,7·${f(dx, 1)}/(${f(V, 2)} + ${f(cel, 2)}) = ${f(dtLI, 3)} s.`,
    ],
    checks: [
      { name: 'C ≤ 3 (ecuaciones completas, esquema implícito)', ok: C <= 3, value: f(C, 2) },
      { name: 'El paso pedido sirve también a un esquema explícito', ok: dt <= dtLI, value: `${f(dt, 2)} s frente a ${f(dtLI, 2)} s` },
    ],
    kid: `Con celdas de ${f(dx, 0)} metros y agua a ${f(V, 1)} m/s, el paso de tiempo es de ${f(dt, 1)} segundos.`,
    data: { kind: 'courant', dx, V, h, C },
  };
}

export function preMalla(v: Vals): Result {
  const A = num(v.A, 25.6), c = num(v.c, 10), dur = num(v.dur, 120), V = num(v.V, 2.5), C = num(v.C, 2), px = num(v.px, 1);
  if (!(A > 0 && A < 100000 && c > 0 && dur > 0 && V > 0 && C > 0 && px > 0 && px <= c)) return bad('Revisa los datos: área, celda, duración, velocidad y Courant mayores que cero; el píxel no puede ser mayor que la celda.');
  const cells = (A * 10000) / (c * c);
  const faces = cells * 2;
  const perCell = (c / px) * (c / px);
  const dt = (C * c) / V;
  const steps = (dur * 60) / dt;
  const work = cells * steps;
  return {
    outs: [
      { label: 'Celdas', value: f(cells, 0), kid: true },
      { label: 'Caras (unas dos por celda)', value: f(faces, 0) },
      { label: 'Píxeles del terreno dentro de cada celda', value: f(perCell, 0) },
      { label: `Pasos de tiempo con C = ${f(C, 1)}`, value: `${f(steps, 0)} (Δt = ${f(dt, 1)} s)` },
      { label: 'Trabajo relativo (celdas × pasos)', value: f(work, 0), kid: true },
    ],
    steps: [
      `Área de ${f(A, 2)} ha con celdas de ${f(c, 1)} m: ${f(A * 10000, 0)}/${f(c * c, 0)} = ${f(cells, 0)} celdas.`,
      `Con subgrid cada celda guarda una curva cota-volumen hecha con sus ${f(perCell, 0)} píxeles y cada cara un perfil de ${f(c / px, 0)} puntos: el terreno fino no se pierde aunque la celda sea grande.`,
      `Paso de tiempo con Courant ${f(C, 1)} y V = ${f(V, 1)} m/s: Δt = ${f(dt, 2)} s; ${f(dur, 0)} min son ${f(steps, 0)} pasos.`,
      `Partir las celdas a la mitad multiplica el trabajo por unas ocho: cuatro veces más celdas y el doble de pasos.`,
    ],
    kid: `Tu malla tiene ${f(cells, 0)} celdas.`,
    data: { kind: 'malla', A, c, dur, V, C },
  };
}

const DEF_PIXELS = '1478,2 1478,3 1478,1 1477,6\n1477,4 1476,1 1475,9 1477,0\n1476,3 1475,8 1475,7 1476,6\n1478,0 1477,2 1477,5 1478,4';
export function calcSubgrid(v: Vals): Result {
  const z = numbers(String(v.pix ?? DEF_PIXELS));
  const eta = num(v.eta, 1477), a = num(v.a, 1);
  if (z.length < 2) return bad('Escribe al menos dos cotas de píxeles (separadas por espacios o por líneas).');
  if (!(a > 0 && Number.isFinite(eta))) return bad('El área de cada píxel debe ser mayor que cero.');
  const wet = z.filter((q) => q < eta);
  const V = wet.reduce((s, q) => s + (eta - q) * a, 0);
  const Aw = wet.length * a;
  const mean = z.reduce((s, q) => s + q, 0) / z.length;
  const Vflat = Math.max(0, eta - mean) * z.length * a;
  return {
    outs: [
      { label: 'Volumen guardado (subgrid)', value: `${f(V, 2)} m³`, kid: true },
      { label: 'Área mojada', value: `${f(Aw, 1)} m² de ${f(z.length * a, 1)} m²`, kid: true },
      { label: 'Profundidad media donde hay agua', value: `${f(Aw > 0 ? V / Aw : 0, 2)} m` },
      { label: 'Volumen si la celda fuera plana (a su cota media)', value: `${f(Vflat, 2)} m³` },
    ],
    steps: [
      `${z.length} píxeles de ${f(a, 2)} m²; el agua a ${f(eta, 2)} m cubre los ${wet.length} que están más bajos.`,
      `V(η) = Σ (η − zᵢ)·a sobre los píxeles mojados = ${f(V, 3)} m³. Así arma HEC-RAS la curva cota-volumen de cada celda en el preprocesador.`,
      `Si la celda fuera plana a su cota media (${f(mean, 3)} m) guardaría ${f(Vflat, 3)} m³: ${Vflat < V ? 'menos' : 'más'} agua, y con un nivel bajo no tendría agua aunque el cauce sí.`,
    ],
    kid: `Con el agua a ${f(eta, 2)} metros, la celda guarda ${f(V, 1)} metros cúbicos.`,
    data: { kind: 'subgrid', pix: z.join(' '), a },
  };
}

// ------------------------------------------------------------------ el modelo

export function calcBalance(v: Vals): Result {
  const V0 = num(v.V0, 12000), Vin = num(v.Vin, 260000), Vout = num(v.Vout, 230000), V1 = num(v.V1, 41900);
  if (![V0, Vin, Vout, V1].every((x) => x >= 0)) return bad('Los volúmenes no pueden ser negativos.');
  if (Vin + V0 <= 0) return bad('Hace falta que entre o que haya agua.');
  const err = V0 + Vin - Vout - V1;
  const pct = (100 * err) / (V0 + Vin);
  return {
    outs: [
      { label: 'Error de volumen', value: `${f(err, 0)} m³`, kid: true },
      { label: 'Error relativo', value: `${f(pct, 3)} %`, kid: true },
    ],
    steps: [
      `Balance: lo que había + lo que entró − lo que salió − lo que quedó = ${f(V0, 0)} + ${f(Vin, 0)} − ${f(Vout, 0)} − ${f(V1, 0)} = ${f(err, 0)} m³.`,
      `Relativo a lo que pasó por el modelo: ${f(err, 0)}/${f(V0 + Vin, 0)} = ${f(pct, 4)} %. HEC-RAS lo informa al final de cada corrida (Volume Accounting).`,
      `Un error grande delata un problema: inestabilidad, celdas que se secan mal o un paso de tiempo inadecuado.`,
    ],
    checks: [{ name: 'Error de volumen menor que 1 %', ok: Math.abs(pct) < 1, value: `${f(pct, 3)} %` }],
    kid: `El modelo ${Math.abs(pct) < 1 ? 'no perdió ni inventó agua' : 'perdió o inventó agua: algo anda mal'}.`,
    data: { kind: 'balance', V0, Vin, Vout, V1 },
  };
}

export function preChequeo(v: Vals): Result {
  const proj = String(v.proj ?? 'origen'), px = num(v.px, 1), W = num(v.W, 11), burn = String(v.burn ?? 'si'), brk = String(v.brk ?? 'si'), dist = num(v.dist, 200), C = num(v.C, 2), eq = String(v.eq ?? 'difusiva'), err = num(v.err, 0.01), runs = num(v.runs, 3);
  if (!(px > 0 && W > 0 && dist >= 0 && C > 0 && runs >= 0)) return bad('Revisa los datos: píxel, ancho, distancia, Courant y corridas no negativos.');
  const checks = [
    { name: 'Coordenadas planas en metros (por ejemplo MAGNA-SIRGAS 2018 / Origen-Nacional, EPSG:9377)', ok: proj === 'origen', value: proj === 'origen' ? 'sí' : 'geográficas' },
    { name: 'Cuatro píxeles o más a lo ancho del cauce', ok: W / px >= 4, value: f(W / px, 1) },
    { name: 'Cauce bajo el agua levantado e insertado en el terreno', ok: burn === 'si', value: burn === 'si' ? 'sí' : 'no' },
    { name: 'Líneas de quiebre en jarillones, vías y orillas', ok: brk === 'si', value: brk === 'si' ? 'sí' : 'no' },
    { name: 'Bordes a más de 150 m de la zona que interesa (criterio de esta sala)', ok: dist >= 150, value: `${f(dist, 0)} m` },
    { name: eq === 'difusiva' ? 'Courant ≤ 5 con la onda difusiva' : 'Courant ≤ 3 con las ecuaciones completas', ok: C <= (eq === 'difusiva' ? 5 : 3), value: f(C, 2) },
    { name: 'Error de volumen menor que 1 %', ok: Math.abs(err) < 1, value: `${f(err, 3)} %` },
    { name: 'Tres corridas de sensibilidad o más (n, malla, terreno)', ok: runs >= 3, value: f(runs, 0) },
  ];
  const ok = checks.filter((c) => c.ok).length;
  return {
    outs: [
      { label: 'Puntos que cumplen', value: `${ok} de ${checks.length}`, kid: true },
      { label: 'Ecuaciones', value: eq === 'difusiva' ? 'onda difusiva' : 'aguas someras' },
    ],
    steps: [
      'Lista de chequeo de un modelo 2D antes de usar sus resultados, siguiendo el orden de trabajo de HEC-RAS: proyección, terreno, coberturas, malla, bordes, flujo, plan, corrida, resultados y sensibilidad.',
      'Cada punto que no cumple no invalida el modelo por sí solo, pero debe estar justificado en la memoria.',
      'Ningún modelo reemplaza la calibración con niveles o huellas observadas: sin ella, los resultados son un escenario, no un pronóstico.',
    ],
    checks,
    kid: `Tu modelo cumple ${ok} de ${checks.length} puntos de la lista.`,
    data: { kind: 'chequeo', ok, n: checks.length },
  };
}

// ------------------------------------------------------------------ gráficas de la memoria

registerPlan(calcPixelCauce, (d) => {
  const b = N(d.b), D = N(d.D), z = N(d.z), p = N(d.p), m = String(d.method);
  const half = b / 2 + z * D + p + 4;
  const xs = Array.from({ length: 161 }, (_, k) => -half + (2 * half * k) / 160);
  return { chart: { title: 'El cauce real y visto con píxeles', xLabel: 'distancia al eje (m)', yLabel: 'cota bajo la orilla (m)', series: [{ name: 'real', pts: xs.map((x) => [x, trapezoid(b, D, z, x)] as XY) }, { name: `píxeles de ${f(p, 1)} m`, pts: xs.map((x) => [x, pixelated(b, D, z, p, m, p / 2, x)] as XY), dash: true }] } };
});
registerPlan(preResolucion, (d) => {
  const W = N(d.W), V = N(d.V);
  const cs = Array.from({ length: 20 }, (_, k) => Math.max(1, W / 4) * (1 + k * 0.4));
  return { chart: { title: 'Paso de tiempo según el tamaño de las celdas', xLabel: 'celda (m)', yLabel: 'Δt (s)', series: [{ name: 'C = 1', pts: cs.map((c) => [c, c / V] as XY) }, { name: 'C = 5', pts: cs.map((c) => [c, (5 * c) / V] as XY), dash: true }], mark: { at: [N(d.cMin), N(d.cMin) / V] as XY, text: 'celda propuesta' } } };
});
registerPlan(calcCowan, (d) => ({ chart: { title: 'Cómo se arma el n', xLabel: 'componentes sumados', yLabel: 'n', series: [{ name: 'n acumulado', pts: [[0, 0], [1, N(d.base)], [2, N(d.base) + N(d.add)], [3, N(d.n)]] as XY[] }], mark: { at: [3, N(d.n)] as XY, text: 'con meandros' } } }));
registerPlan(preCompuesto, (d) => {
  const hs = Array.from({ length: 21 }, (_, k) => (k / 20) * Math.max(0.5, N(d.h) * 2));
  const Q = (n: number, h: number) => ((N(d.W) * Math.pow(h, 5 / 3)) / n) * Math.sqrt(N(d.S));
  return { chart: { title: 'Caudal por la cara según el n compuesto', xLabel: 'profundidad (m)', yLabel: 'caudal (m³/s)', series: [{ name: 'por área', pts: hs.map((h) => [h, Q(N(d.nArea), h)] as XY) }, { name: 'por conducción', pts: hs.map((h) => [h, Q(N(d.nLotter), h)] as XY), dash: true }], mark: { at: [N(d.h), Q(N(d.nLotter), N(d.h))] as XY, text: 'profundidad elegida' } } };
});
registerPlan(calcGumbel, (d) => {
  const Q = numbers(String(d.serie));
  const fit = fitGumbel(Q);
  const ys = Array.from({ length: 25 }, (_, k) => -1.5 + (k / 24) * 7.5);
  return { chart: { title: 'Papel de Gumbel', xLabel: 'variable reducida y = −ln(−ln(1 − 1/T))', yLabel: 'caudal (m³/s)', series: [{ name: 'máximos anuales', pts: plotting(Q).map((p) => [reducedY(p.T), p.Q] as XY), dots: true }, { name: 'Gumbel', pts: ys.map((y) => [y, quantile(fit, periodOfY(y))] as XY) }], mark: { at: [reducedY(N(d.T)), N(d.QT)] as XY, text: `T = ${f(N(d.T), 0)}` } } };
});
registerPlan(preRiesgo, (d) => {
  const Ts = [2, 5, 10, 25, 50, 100, 200, 500, 1000];
  return { chart: { title: `Riesgo en ${f(N(d.n), 0)} años según el periodo de retorno`, xLabel: 'variable reducida del periodo', yLabel: 'riesgo (%)', series: [{ name: 'riesgo', pts: Ts.map((T) => [reducedY(T), risk(T, N(d.n)) * 100] as XY) }], mark: { at: [reducedY(N(d.T)), N(d.R) * 100] as XY, text: `T = ${f(N(d.T), 0)}` } } };
});
registerPlan(calcHidrograma, (d) => {
  const h = { Qp: N(d.Qp), tp: N(d.tp), Qb: N(d.Qb) };
  const ts = Array.from({ length: 61 }, (_, k) => (k / 60) * N(d.dur));
  return { chart: { title: 'Hidrograma de entrada', xLabel: 'tiempo (min)', yLabel: 'caudal (m³/s)', series: [{ name: 'Q', pts: ts.map((t) => [t, hydroQ(h, t * 60)] as XY) }], mark: { at: [N(d.tp), N(d.Qp)] as XY, text: 'pico' } } };
});
registerPlan(calcCourant, (d) => {
  const Cs = Array.from({ length: 21 }, (_, k) => 0.25 + k * 0.25);
  return { chart: { title: 'Paso de tiempo según el Courant', xLabel: 'Courant', yLabel: 'Δt (s)', series: [{ name: 'Δt', pts: Cs.map((C) => [C, (C * N(d.dx)) / N(d.V)] as XY) }], hlines: [{ y: (0.7 * N(d.dx)) / (N(d.V) + Math.sqrt(9.81 * N(d.h))), text: 'límite explícito' }] } };
});
registerPlan(preMalla, (d) => {
  const cs = [2, 5, 10, 20, 40, 80];
  return { chart: { title: 'Trabajo según el tamaño de las celdas', xLabel: 'celda (m)', yLabel: 'celdas × pasos (millones)', logY: true, series: [{ name: 'trabajo', pts: cs.map((c) => [c, ((N(d.A) * 10000) / (c * c)) * ((N(d.dur) * 60 * N(d.V)) / (N(d.C) * c)) / 1e6] as XY) }], mark: { at: [N(d.c), ((N(d.A) * 10000) / (N(d.c) * N(d.c))) * ((N(d.dur) * 60 * N(d.V)) / (N(d.C) * N(d.c))) / 1e6] as XY, text: 'tu malla' } } };
});
registerPlan(calcSubgrid, (d) => {
  const z = numbers(String(d.pix)).sort((a, b) => a - b);
  const lo = z[0] - 0.2, hi = z[z.length - 1] + 0.6;
  const es = Array.from({ length: 41 }, (_, k) => lo + ((hi - lo) * k) / 40);
  const mean = z.reduce((s, q) => s + q, 0) / z.length;
  return { chart: { title: 'Curva cota-volumen de la celda', xLabel: 'nivel del agua (m)', yLabel: 'volumen (m³)', series: [{ name: 'subgrid', pts: es.map((e) => [e, z.reduce((s, q) => s + Math.max(0, e - q) * N(d.a), 0)] as XY) }, { name: 'celda plana', pts: es.map((e) => [e, Math.max(0, e - mean) * z.length * N(d.a)] as XY), dash: true }] } };
});


// ------------------------------------------------------------------ calibración y lluvia (herramientas extra)

const DEF_MARKS = '1479,87 1479,74\n1479,53 1479,41\n1479,16 1479,05\n1478,72 1478,60\n1478,46 1478,33\n1478,03 1477,96';
export function calcMarcas(v: Vals): Result {
  const rows = lines(String(v.marcas ?? DEF_MARKS)).map(numbers).filter((r) => r.length >= 2);
  if (rows.length < 2) return bad('Escribe al menos dos marcas: una línea por marca con la cota observada y la del modelo.');
  const r = rows.map(([o, m]) => m - o);
  const n = r.length, bias = r.reduce((a, b) => a + b, 0) / n, rmse = Math.sqrt(r.reduce((a, b) => a + b * b, 0) / n);
  const mae = r.reduce((a, b) => a + Math.abs(b), 0) / n;
  return {
    outs: [
      { label: 'Error medio cuadrático (RMSE)', value: `${f(rmse * 100, 1)} cm`, kid: true },
      { label: 'Sesgo (modelo − marca)', value: `${bias >= 0 ? '+' : '−'}${f(Math.abs(bias) * 100, 1)} cm`, kid: true },
      { label: 'Error absoluto medio', value: `${f(mae * 100, 1)} cm` },
      { label: 'Marcas', value: f(n, 0) },
    ],
    steps: [
      `Residuo de cada marca = cota del modelo − cota observada: ${r.map((x) => f(x * 100, 1)).join(', ')} cm.`,
      `Sesgo = promedio de los residuos = ${f(bias * 100, 2)} cm: ${bias < 0 ? 'el modelo queda bajo (el n podría ser mayor)' : 'el modelo queda alto (el n podría ser menor)'}.`,
      `RMSE = √(Σ residuo²/n) = ${f(rmse * 100, 2)} cm. Con marcas de agua levantadas después de una creciente, un RMSE del orden de su error de medida (5 a 15 cm) es un buen ajuste.`,
    ],
    checks: [
      { name: 'Sesgo menor que 5 cm (criterio de esta sala)', ok: Math.abs(bias) < 0.05, value: `${f(bias * 100, 1)} cm` },
      { name: 'RMSE menor que 15 cm (criterio de esta sala)', ok: rmse < 0.15, value: `${f(rmse * 100, 1)} cm` },
    ],
    kid: `El modelo se equivoca en promedio ${f(mae * 100, 0)} cm frente a las marcas.`,
    data: { kind: 'marcas', pts: JSON.stringify(rows) },
  };
}

export function calcSCS(v: Vals): Result {
  const P = num(v.P, 80), CN = num(v.CN, 74);
  if (!(P >= 0 && P <= 1000 && CN >= 30 && CN <= 100)) return bad('Revisa los datos: lluvia entre 0 y 1000 mm y número de curva entre 30 y 100.');
  const S = scsS(CN), Ia = 0.2 * S, Q = scsQ(P, S);
  return {
    outs: [
      { label: 'Escorrentía', value: `${f(Q, 1)} mm`, kid: true },
      { label: 'Pérdidas (infiltración y retención)', value: `${f(P - Q, 1)} mm`, kid: true },
      { label: 'Abstracción inicial Ia', value: `${f(Ia, 1)} mm` },
      { label: 'Coeficiente de escorrentía', value: P > 0 ? f(Q / P, 2) : '—' },
    ],
    steps: [
      `Retención potencial máxima: S = 25 400/CN − 254 = 25 400/${f(CN, 0)} − 254 = ${f(S, 1)} mm.`,
      `Abstracción inicial: Ia = 0,2·S = ${f(Ia, 1)} mm (la lluvia que se queda antes de que empiece a escurrir).`,
      P > Ia ? `Escorrentía: Q = (P − Ia)²/(P − Ia + S) = (${f(P, 1)} − ${f(Ia, 1)})²/(${f(P, 1)} − ${f(Ia, 1)} + ${f(S, 1)}) = ${f(Q, 2)} mm.` : `Como P ≤ Ia, no hay escorrentía: Q = 0.`,
      'En la lluvia sobre la malla, cada celda aplica la fórmula a la lluvia acumulada con el CN de las coberturas de sus píxeles; lo que entra a la celda en cada paso es el aumento de la escorrentía acumulada.',
    ],
    checks: [{ name: 'Número de curva de una tabla (TR-55) para la cobertura y el suelo', ok: true, value: f(CN, 0) }],
    kid: `De ${f(P, 0)} mm de lluvia escurren ${f(Q, 0)} mm.`,
    data: { kind: 'scs', P, CN },
  };
}

// ------------------------------------------------------------------ estructuras

export function calcVertederoVia(v: Vals): Result {
  const C = num(v.C, 1.66), L = num(v.L, 40), crest = num(v.crest, 1480.57), eu = num(v.eu, 1481.0), ed = num(v.ed, 1480.7);
  if (!(C > 0.3 && C < 2.5 && L > 0 && Number.isFinite(crest) && Number.isFinite(eu) && Number.isFinite(ed))) return bad('Revisa los datos: coeficiente entre 0,3 y 2,5 (SI), longitud mayor que cero y cotas válidas.');
  if (ed > eu) return bad('La cota de aguas abajo no puede ser mayor que la de aguas arriba (el agua iría al revés).');
  const H = eu - crest, Hd = Math.max(0, ed - crest);
  const free = weirFlow(eu, crest - 1, crest, C, L), q = weirFlow(eu, ed, crest, C, L);
  const r = H > 0 ? Hd / H : 0;
  return {
    outs: [
      { label: 'Caudal sobre la vía', value: `${f(q, 2)} m³/s`, kid: true },
      { label: 'Carga sobre la corona', value: `${f(Math.max(0, H), 2)} m`, kid: true },
      { label: 'Sumergencia Hd/Hu', value: H > 0 ? f(r, 2) : '—' },
      { label: 'Caudal sin sumergencia', value: `${f(free, 2)} m³/s` },
    ],
    steps: [
      H > 0 ? `Vertedero de cresta ancha: Q = C·L·H^1,5 = ${f(C, 2)}·${f(L, 1)}·${f(H, 3)}^1,5 = ${f(free, 3)} m³/s.` : 'El agua no llega a la corona: no hay flujo sobre la vía.',
      H > 0 ? `Sumergencia (Villemonte): Q = Q_libre·(1 − (Hd/Hu)^1,5)^0,385 = ${f(free, 3)}·(1 − ${f(r, 3)}^1,5)^0,385 = ${f(q, 3)} m³/s.` : '—',
      'Coeficientes típicos en unidades SI: 1,66 sobre los terraplenes de una vía y 1,44 sobre el tablero de un puente (HEC-RAS). Con una carga pequeña y aguas abajo alto, el vertedero se ahoga y pasa mucho menos.',
    ],
    checks: [{ name: 'Sumergencia menor que 0,98 (por encima HEC-RAS cambia de método)', ok: r < 0.98, value: H > 0 ? f(r, 2) : '—' }],
    kid: H > 0 ? `Pasan ${f(q, 1)} m³/s por encima de la vía.` : 'El agua no pasa por encima de la vía.',
    data: { kind: 'vertedero', C, L, crest, eu, ed },
  };
}

export function prePresion(v: Vals): Result {
  const b = num(v.b, 10), zf = num(v.zf, 1475.4), low = num(v.low, 1479.97), eu = num(v.eu, 1480.3), ed = num(v.ed, 1479.6), block = num(v.block, 0) / 100, Cd = num(v.Cd, 0.5), Co = num(v.Co, 0.8);
  if (!(b > 0 && low > zf && block >= 0 && block < 1 && Cd > 0 && Cd <= 1 && Co > 0 && Co <= 1)) return bad('Revisa los datos: luz mayor que cero, tablero sobre el fondo, luz tapada entre 0 y 99 % y coeficientes entre 0 y 1.');
  if (ed > eu) return bad('La cota de aguas abajo no puede ser mayor que la de aguas arriba.');
  const A = b * (1 - block) * (low - zf);
  let regime: string, Q: number;
  if (eu <= low) {
    regime = 'flujo libre bajo el tablero';
    Q = NaN;
  } else if (ed < low) {
    regime = 'compuerta (el agua toca el tablero solo aguas arriba)';
    Q = Cd * A * Math.sqrt(2 * 9.81 * Math.max(0, eu - Math.max(zf + (low - zf) / 2, ed)));
  } else {
    regime = 'orificio sumergido (el tablero bajo el agua a los dos lados)';
    Q = Co * A * Math.sqrt(2 * 9.81 * Math.max(0, eu - ed));
  }
  return {
    outs: [
      { label: 'Tipo de flujo', value: regime, kid: true },
      { label: 'Caudal por la luz', value: Number.isFinite(Q) ? `${f(Q, 1)} m³/s` : 'se calcula con las ecuaciones del cauce', kid: true },
      { label: 'Área de la luz útil', value: `${f(A, 1)} m²` },
      { label: 'Gálibo (de fondo a tablero)', value: `${f(low - zf, 2)} m` },
    ],
    steps: [
      `Área útil de la luz: ancho × (1 − tapado) × altura = ${f(b, 1)}·${f(1 - block, 2)}·${f(low - zf, 2)} = ${f(A, 2)} m².`,
      eu <= low ? 'El agua no toca el tablero: el puente es un estrechamiento del cauce con pérdidas de contracción y expansión.' : ed < low ? `Compuerta: Q = Cd·A·√(2g·(Hu − Z/2)) con Cd = ${f(Cd, 2)}, sobre el centro de la luz.` : `Orificio: Q = C·A·√(2g·ΔH) con C = ${f(Co, 2)} y ΔH = ${f(eu - ed, 2)} m.`,
      'Con el agua sobre la rasante se suma el vertedero sobre el tablero y la vía. Troncos y basura atrapados en la luz la achican y suben el agua aguas arriba: hay que revisar el puente después de cada creciente.',
    ],
    checks: [
      { name: 'El agua no toca el tablero (borde libre)', ok: eu <= low, value: `${f(low - eu, 2)} m` },
      { name: 'Luz sin obstrucciones', ok: block === 0, value: `${f(block * 100, 0)} %` },
    ],
    kid: eu <= low ? 'El agua pasa por debajo del puente sin tocarlo.' : 'El agua empuja contra el puente: pasa a presión.',
    data: { kind: 'presion', b: b * (1 - block), zf, low, ed, Cd, Co },
  };
}

export function calcRoturaJarillon(v: Vals): Result {
  const W = num(v.W, 30), Hb = num(v.Hb, 1.3), z = num(v.z, 1), tf = num(v.tf, 10), H = num(v.H, 0.4), C = num(v.C, 1.44);
  if (!(W > 0 && Hb > 0 && z >= 0 && z <= 5 && tf > 0 && H >= 0 && C > 0)) return bad('Revisa los datos: ancho, altura y tiempo mayores que cero; talud entre 0 y 5; carga no negativa.');
  const g = Math.max(W, Hb);
  const Q = C * (W + z * H) * Math.pow(H, 1.5);
  return {
    outs: [
      { label: 'Caudal por la rotura completa', value: `${f(Q, 1)} m³/s`, kid: true },
      { label: 'Tiempo hasta llegar al fondo', value: `${f((Hb / g) * tf, 1)} min` },
      { label: 'Ancho de arriba al final', value: `${f(W + 2 * z * Hb, 1)} m` },
    ],
    steps: [
      `HEC-RAS abre la rotura como un cuadrado que crece hacia abajo y a los lados al mismo ritmo hasta llegar al fondo final (${f(Hb, 2)} m) y luego se ensancha hasta el ancho final (${f(W, 1)} m) en el tiempo de formación (${f(tf, 0)} min); los taludes (${f(z, 1)}H:1V) se mantienen.`,
      `Con la rotura completa y el agua ${f(H, 2)} m sobre su fondo, como vertedero: Q ≈ C·(b + z·H)·H^1,5 = ${f(C, 2)}·(${f(W, 1)} + ${f(z, 1)}·${f(H, 2)})·${f(H, 2)}^1,5 = ${f(Q, 2)} m³/s.`,
      'El ancho, el fondo y el tiempo de formación no salen del modelo hidráulico: se estiman con ecuaciones empíricas de roturas observadas o con modelos de erosión, y conviene probar varios.',
    ],
    checks: [{ name: 'Tiempo de formación probado con dos valores o más (sensibilidad)', ok: false, value: `${f(tf, 0)} min` }],
    kid: `Por la rotura pasarían unos ${f(Q, 0)} m³/s.`,
    data: { kind: 'rotura', W, Hb, z, tf },
  };
}

// ------------------------------------------------------------------ incertidumbre, amenaza y daños

const DEF_DAMAGE = '2 0\n10 0\n25 0\n50 23\n100 308\n500 1698';
export function calcDAE(v: Vals): Result {
  const rows = lines(String(v.tabla ?? DEF_DAMAGE)).map(numbers).filter((r) => r.length >= 2 && r[0] > 1 && r[1] >= 0);
  if (rows.length < 2) return bad('Escribe al menos dos líneas con el periodo de retorno (mayor que 1) y el daño.');
  const pts = rows.map(([T, D]) => ({ T, D }));
  const e = ead(pts);
  return {
    outs: [
      { label: 'Daño anual esperado', value: `${f(e.total, 2)} por año`, kid: true },
      { label: 'Aporte de la cola (mayor que el último periodo)', value: f(e.parts[e.parts.length - 1].area, 2) },
    ],
    steps: [
      'El daño anual esperado es el área bajo la curva daño–probabilidad de excedencia (P = 1/T): cada tramo entre dos periodos aporta el promedio de sus daños por la diferencia de probabilidades.',
      ...e.parts.map((p) => (Number.isFinite(p.to) ? `De ${f(p.from, 0)} a ${f(p.to, 0)} años: ${f(p.area, 3)}` : `Más allá de ${f(p.from, 0)} años (se supone el mismo daño): ${f(p.area, 3)}`)),
      'Las unidades son las del daño (aquí, metros cuadrados de vivienda equivalentes). Sirve para comparar alternativas: la obra que más reduce el daño anual esperado por cada peso invertido.',
    ],
    checks: [{ name: 'Periodos frecuentes y raros en la curva (de 2 a 500 años o más)', ok: Math.min(...pts.map((p) => p.T)) <= 2 && Math.max(...pts.map((p) => p.T)) >= 500, value: `${f(Math.min(...pts.map((p) => p.T)), 0)} a ${f(Math.max(...pts.map((p) => p.T)), 0)} años` }],
    kid: `En promedio, cada año se perdería el equivalente a ${f(e.total, 1)}.`,
    data: { kind: 'dae', pts: JSON.stringify(pts) },
  };
}

export function preZonas(v: Vals): Result {
  const h30 = num(v.h30, 0.3), v30 = num(v.v30, 0.4), h100 = num(v.h100, 0.8), v100 = num(v.v100, 0.6);
  if (![h30, v30, h100, v100].every((x) => x >= 0 && x < 50)) return bad('Revisa los datos: profundidades y velocidades no negativas.');
  const i30 = intensity(h30, v30, h30 * v30), i100 = intensity(h100, v100, h100 * v100);
  const z = zoneOf(i30, i100);
  return {
    outs: [
      { label: 'Zona del ejercicio', value: ZONE_NAMES[z], kid: true },
      { label: 'Intensidad con 30 años', value: INTENSITY_NAMES[i30] },
      { label: 'Intensidad con 100 años', value: INTENSITY_NAMES[i100] },
    ],
    steps: [
      'Intensidad con la profundidad h, la velocidad v y su producto h·v (umbrales de un estudio de amenaza del corredor del río Cauca): baja si h ≤ 0,5 m, v ≤ 0,5 m/s y h·v ≤ 0,225 m²/s; alta si h > 1,0 m, v > 0,8 m/s o h·v > 0,45 m²/s; media entre ambas.',
      `Con 30 años: h ${f(h30, 2)} m, v ${f(v30, 2)} m/s, h·v ${f(h30 * v30, 3)} → ${INTENSITY_NAMES[i30].toLowerCase()}. Con 100 años: h ${f(h100, 2)} m, v ${f(v100, 2)} m/s, h·v ${f(h100 * v100, 3)} → ${INTENSITY_NAMES[i100].toLowerCase()}.`,
      'Matriz del ejercicio: la intensidad media o alta con la creciente frecuente, o alta con la rara, da amenaza alta; baja con la frecuente o media con la rara, amenaza media; baja con la rara, amenaza baja.',
      'El Decreto 1077 de 2015 (que recoge el 1807 de 2014) pide zonificar la amenaza por inundación en alta, media y baja en los estudios básicos de los POT; los umbrales y la matriz los fija cada estudio. Este es un ejercicio, no una norma.',
    ],
    checks: [{ name: 'Zonificación con dos o más periodos de retorno', ok: true, value: '30 y 100 años' }],
    kid: `Este punto queda en ${ZONE_NAMES[z].toLowerCase()} en el ejercicio.`,
    data: { kind: 'zonas', h30, v30, h100, v100 },
  };
}

export function calcErrorCaudal(v: Vals): Result {
  const T = num(v.T, 100), n = num(v.n, 30), mean = num(v.media, 32.66), sd = num(v.desv, 14.97);
  if (!(T > 1.01 && T <= 10000 && n >= 5 && n <= 500 && mean > 0 && sd > 0)) return bad('Revisa los datos: periodo mayor que 1, entre 5 y 500 años de registro, media y desviación mayores que cero.');
  const K = gumbelK(T), Q = mean + K * sd;
  const se = (sd / Math.sqrt(n)) * Math.sqrt(1 + 1.1396 * K + 1.1 * K * K);
  return {
    outs: [
      { label: `Caudal de ${f(T, 0)} años`, value: `${f(Q, 1)} m³/s`, kid: true },
      { label: 'Error estándar', value: `±${f(se, 1)} m³/s`, kid: true },
      { label: 'Intervalo del 90 %', value: `${f(Q - 1.645 * se, 1)} a ${f(Q + 1.645 * se, 1)} m³/s` },
    ],
    steps: [
      `Factor de frecuencia de Gumbel: K = ${f(K, 4)}; Q = media + K·desviación = ${f(mean, 2)} + ${f(K, 3)}·${f(sd, 2)} = ${f(Q, 2)} m³/s.`,
      `Error estándar del cuantil ajustado por momentos: s/√n·√(1 + 1,1396·K + 1,1·K²) = ${f(sd, 2)}/√${f(n, 0)}·√(1 + 1,1396·${f(K, 3)} + 1,1·${f(K, 3)}²) = ${f(se, 2)} m³/s.`,
      'Con pocos años de registro, el caudal de 100 años tiene una incertidumbre grande: un ensamble de corridas con caudales y n posibles da un mapa de probabilidad en vez de una sola mancha.',
    ],
    checks: [{ name: 'Registro de 30 años o más', ok: n >= 30, value: `${f(n, 0)} años` }],
    kid: `El caudal de ${f(T, 0)} años está entre ${f(Q - 1.645 * se, 0)} y ${f(Q + 1.645 * se, 0)} m³/s con 90 % de confianza.`,
    data: { kind: 'error', mean, sd, n },
  };
}

// ------------------------------------------------------------------ tu terreno

export function calcMallaPropia(v: Vals): Result {
  const Lx = num(v.Lx, 360), Ly = num(v.Ly, 240), px = num(v.px, 2), c = num(v.c, 6), V = num(v.V, 2), h = num(v.h, 1.5);
  if (!(Lx > 0 && Ly > 0 && px > 0 && c >= px && V > 0 && h > 0)) return bad('Revisa los datos: dimensiones, píxel y celda mayores que cero, con la celda igual o mayor que el píxel.');
  const cells = Math.ceil(Lx / c) * Math.ceil(Ly / c), ppc = Math.round(c / px) ** 2;
  const dtLI = (0.7 * c) / (V + Math.sqrt(9.81 * h)), dtDW = (2 * c) / V;
  return {
    outs: [
      { label: 'Celdas', value: f(cells, 0), kid: true },
      { label: 'Píxeles por celda (subgrid)', value: f(ppc, 0) },
      { label: 'Paso de tiempo explícito (Courant 0,7)', value: `${f(dtLI, 2)} s`, kid: true },
      { label: 'Paso de la onda difusiva (Courant 2)', value: `${f(dtDW, 1)} s` },
    ],
    steps: [
      `Celdas: ⌈${f(Lx, 0)}/${f(c, 1)}⌉ × ⌈${f(Ly, 0)}/${f(c, 1)}⌉ = ${f(cells, 0)}; cada una con ${f(ppc, 0)} píxeles en sus tablas.`,
      `Inercia local o aguas someras (explícitas): Δt = 0,7·Δx/(V + √(g·h)) = 0,7·${f(c, 1)}/(${f(V, 2)} + √(9,81·${f(h, 2)})) = ${f(dtLI, 3)} s.`,
      `Onda difusiva (implícita) con Courant 2: Δt = 2·Δx/V = ${f(dtDW, 2)} s.`,
      'En el navegador, conviene quedarse por debajo de unas 6000 celdas para que la corrida tome segundos.',
    ],
    checks: [
      { name: 'Menos de 6000 celdas (para correr en el navegador)', ok: cells <= 6000, value: f(cells, 0) },
      { name: 'Celda de 2 píxeles o más (para que el subgrid sirva)', ok: c / px >= 2, value: f(c / px, 1) },
    ],
    kid: `Tu malla tendría ${f(cells, 0)} celdas.`,
    data: { kind: 'malla', c, V, h },
  };
}

export function preTerrenoPropio(v: Vals): Result {
  const px = num(v.px, 2), rmse = num(v.rmse, 0.15), W = num(v.W, 12), D = num(v.D, 1.8), src = String(v.src ?? 'mdt');
  if (!(px > 0 && rmse >= 0 && W > 0 && D > 0)) return bad('Revisa los datos: píxel, ancho y profundidad mayores que cero; error no negativo.');
  const checks = [
    { name: 'Modelo del terreno (suelo desnudo), no de superficie', ok: src === 'mdt', value: src === 'mdt' ? 'MDT' : 'MDS' },
    { name: 'Cuatro píxeles o más a lo ancho del cauce', ok: W / px >= 4, value: f(W / px, 1) },
    { name: 'Error vertical menor que la décima parte de la profundidad del cauce', ok: rmse <= 0.1 * D, value: `${f(rmse, 2)} m` },
    { name: 'Coordenadas planas en metros', ok: true, value: 'revise el sistema del archivo' },
  ];
  const ok = checks.filter((c) => c.ok).length;
  return {
    outs: [
      { label: 'Puntos que cumplen', value: `${ok} de ${checks.length}`, kid: true },
      { label: 'Píxeles a lo ancho del cauce', value: f(W / px, 1) },
    ],
    steps: [
      'Un terreno para un modelo 2D se revisa antes de correr: que sea un MDT (sin techos ni copas), que el cauce quepa con varios píxeles y que el error vertical sea pequeño frente a las profundidades.',
      'Si el sensor no atravesó el agua, el cauce bajo la lámina falta: hay que levantarlo e insertarlo (en HEC-RAS, con un terreno del cauce o el modificador de canal).',
      'La sala solo corre un sector pequeño en el navegador: no hace falta descargar la ciudad para estudiar una quebrada.',
    ],
    checks,
    kid: `Tu terreno cumple ${ok} de ${checks.length} puntos.`,
    data: { kind: 'dem', ok },
  };
}

registerPlan(calcMarcas, (d) => {
  const rows = JSON.parse(String(d.pts)) as number[][];
  const lo = Math.min(...rows.flat()) - 0.2, hi = Math.max(...rows.flat()) + 0.2;
  return { chart: { title: 'Marcas observadas y modelo', xLabel: 'cota observada (m)', yLabel: 'cota del modelo (m)', series: [{ name: 'marcas', pts: rows.map(([o, m]) => [o, m] as XY), dots: true }, { name: 'ajuste perfecto', pts: [[lo, lo], [hi, hi]] as XY[], dash: true }] } };
});
registerPlan(calcSCS, (d) => {
  const S = scsS(N(d.CN));
  const ps = Array.from({ length: 41 }, (_, k) => (k / 40) * Math.max(100, N(d.P) * 1.5));
  return { chart: { title: 'Escorrentía del número de curva', xLabel: 'lluvia acumulada (mm)', yLabel: 'escorrentía (mm)', series: [{ name: `CN ${f(N(d.CN), 0)}`, pts: ps.map((p) => [p, scsQ(p, S)] as XY) }, { name: 'todo escurre', pts: ps.map((p) => [p, p] as XY), dash: true }], mark: { at: [N(d.P), scsQ(N(d.P), S)] as XY, text: 'tu lluvia' } } };
});
registerPlan(calcVertederoVia, (d) => {
  const crest = N(d.crest), eu = N(d.eu);
  const eds = Array.from({ length: 31 }, (_, k) => crest - 0.3 + ((eu - crest + 0.3) * k) / 30);
  return { chart: { title: 'Caudal sobre la vía según el nivel aguas abajo', xLabel: 'cota aguas abajo (m)', yLabel: 'caudal (m³/s)', series: [{ name: 'Villemonte', pts: eds.map((e) => [e, weirFlow(eu, e, crest, N(d.C), N(d.L))] as XY) }], mark: { at: [N(d.ed), weirFlow(eu, N(d.ed), crest, N(d.C), N(d.L))] as XY, text: 'tu caso' } } };
});
registerPlan(prePresion, (d) => {
  const zf = N(d.zf), low = N(d.low), ed = N(d.ed), A = N(d.b) * (low - zf);
  const eus = Array.from({ length: 31 }, (_, k) => low + (k / 30) * 1.5);
  const q = (eu: number) => (ed < low ? N(d.Cd) * A * Math.sqrt(2 * 9.81 * Math.max(0, eu - Math.max(zf + (low - zf) / 2, ed))) : N(d.Co) * A * Math.sqrt(2 * 9.81 * Math.max(0, eu - ed)));
  return { chart: { title: 'Caudal a presión según el nivel aguas arriba', xLabel: 'cota aguas arriba (m)', yLabel: 'caudal (m³/s)', series: [{ name: 'por la luz', pts: eus.map((e) => [e, q(e)] as XY) }] } };
});
registerPlan(calcRoturaJarillon, (d) => {
  const W = N(d.W), Hb = N(d.Hb), tf = N(d.tf), g = Math.max(W, Hb);
  const ts = Array.from({ length: 41 }, (_, k) => (k / 40) * tf);
  return { chart: { title: 'Cómo se abre la rotura', xLabel: 'tiempo desde que empieza (min)', yLabel: 'metros', series: [{ name: 'ancho del fondo', pts: ts.map((t) => [t, Math.min(W, (t / tf) * g)] as XY) }, { name: 'profundidad', pts: ts.map((t) => [t, Math.min(Hb, (t / tf) * g)] as XY), dash: true }] } };
});
registerPlan(calcDAE, (d) => {
  const pts = (JSON.parse(String(d.pts)) as { T: number; D: number }[]).sort((a, b) => b.T - a.T);
  return { chart: { title: 'Daño según la probabilidad anual de excedencia', xLabel: 'probabilidad anual (%)', yLabel: 'daño', series: [{ name: 'daño', pts: [[0, pts[0].D] as XY, ...pts.map((p) => [100 / p.T, p.D] as XY)] }] } };
});
registerPlan(preZonas, (d) => {
  const hs = Array.from({ length: 31 }, (_, k) => (k / 30) * 1.6);
  return { chart: { title: 'Umbrales de intensidad (profundidad contra velocidad)', xLabel: 'profundidad (m)', yLabel: 'velocidad (m/s)', series: [{ name: 'baja / media', pts: hs.map((h) => [h, Math.min(0.5, h > 0 ? 0.225 / h : 9)] as XY).filter((p) => p[0] <= 0.5) }, { name: 'media / alta', pts: hs.map((h) => [h, Math.min(0.8, h > 0 ? 0.45 / h : 9)] as XY).filter((p) => p[0] <= 1), dash: true }, { name: 'tus puntos', pts: [[N(d.h30), N(d.v30)], [N(d.h100), N(d.v100)]] as XY[], dots: true }] } };
});
registerPlan(calcErrorCaudal, (d) => {
  const Ts = [2, 5, 10, 25, 50, 100, 200, 500];
  const q = (T: number, s: number) => N(d.mean) + gumbelK(T) * N(d.sd) + s * 1.645 * (N(d.sd) / Math.sqrt(N(d.n))) * Math.sqrt(1 + 1.1396 * gumbelK(T) + 1.1 * gumbelK(T) ** 2);
  return { chart: { title: 'Caudal de diseño con su intervalo del 90 %', xLabel: 'variable reducida del periodo', yLabel: 'caudal (m³/s)', series: [{ name: 'Gumbel', pts: Ts.map((T) => [reducedY(T), q(T, 0)] as XY) }, { name: 'límite superior', pts: Ts.map((T) => [reducedY(T), q(T, 1)] as XY), dash: true }, { name: 'límite inferior', pts: Ts.map((T) => [reducedY(T), q(T, -1)] as XY), dash: true }] } };
});
registerPlan(calcMallaPropia, (d) => {
  const cs = [1, 2, 4, 6, 8, 10, 15, 20, 30];
  return { chart: { title: 'Paso de tiempo explícito según la celda', xLabel: 'celda (m)', yLabel: 'Δt (s)', series: [{ name: 'Courant 0,7', pts: cs.map((c) => [c, (0.7 * c) / (N(d.V) + Math.sqrt(9.81 * N(d.h)))] as XY) }], mark: { at: [N(d.c), (0.7 * N(d.c)) / (N(d.V) + Math.sqrt(9.81 * N(d.h)))] as XY, text: 'tu celda' } } };
});
void damageFrac;

// ------------------------------------------------------------------ juegos de herramientas

const NORM =
  'Las herramientas siguen la práctica de la modelación con HEC-RAS 2D (guías del Hydrologic Engineering Center del Cuerpo de Ingenieros de EE. UU.), la tabla de rugosidades de Chow (1959) y el ajuste de Gumbel por momentos, como referencia para aprender. Los criterios marcados «de esta sala» son orientativos. Un estudio de amenaza en Colombia sigue los términos de referencia de la autoridad que lo pide (la corporación ambiental, el municipio o la entidad que administra el cauce) y se calibra con observaciones.';

const OPT = (o: Record<string, number>, names: Record<string, string>) => Object.keys(o).map((k) => ({ value: k, label: `${names[k]} (${f(o[k], k.startsWith('m') ? 2 : 4)})` }));

export const MODEL2D_TOOLS: Record<'terreno' | 'cobertura' | 'retorno' | 'ecuaciones' | 'estructuras' | 'riesgo' | 'modelo' | 'propio', ToolSet> = {
  terreno: {
    norm: NORM,
    calc: {
      title: 'El cauce visto con píxeles',
      intro: 'Capacidad de un cauce trapecial a orilla llena, real y como la ve un terreno de píxeles de cierto tamaño con el método de remuestreo elegido.',
      kidIntro: '¿Cuánta agua cabe en el cauce si el mapa tiene cuadritos grandes?',
      fields: [
        { id: 'b', label: 'Ancho del fondo', unit: 'm', def: 6, kid: true },
        { id: 'D', label: 'Profundidad bajo la orilla', unit: 'm', def: 2.4, kid: true },
        { id: 'z', label: 'Talud (horizontal : 1)', def: 1 },
        { id: 'n', label: 'n de Manning', def: 0.04 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.5 },
        { id: 'p', label: 'Tamaño del píxel', unit: 'm', def: 10, kid: true },
        { id: 'metodo', label: 'Remuestreo', def: 'promedio', options: [{ value: 'promedio', label: 'Promedio' }, { value: 'minimo', label: 'Mínimo' }, { value: 'maximo', label: 'Máximo' }] },
      ],
      run: calcPixelCauce,
    },
    pre: {
      title: 'Resolución del terreno y de la malla',
      intro: 'Píxel del terreno, tamaño de celdas y pasos de tiempo para un cauce y sus obras, con los criterios de Courant de HEC-RAS.',
      kidIntro: '¿De qué tamaño deben ser los cuadritos del mapa?',
      fields: [
        { id: 'W', label: 'Boca del cauce', unit: 'm', def: 11, kid: true },
        { id: 'crest', label: 'Corona del jarillón o la vía más angosta', unit: 'm', def: 3, kid: true },
        { id: 'V', label: 'Velocidad máxima esperada', unit: 'm/s', def: 2.5 },
        { id: 'h', label: 'Profundidad máxima esperada', unit: 'm', def: 2 },
        { id: 'rmse', label: 'Error vertical de la fuente (RMSE)', unit: 'm', def: 0.1 },
        { id: 'dz', label: 'Diferencia de nivel que interesa', unit: 'm', def: 0.3 },
        { id: 'L', label: 'Largo del área a modelar', unit: 'm', def: 640 },
      ],
      run: preResolucion,
    },
  },
  cobertura: {
    norm: NORM,
    calc: {
      title: 'n de un cauce por el método de Cowan',
      intro: 'El n de Manning sumando el material del cauce, sus irregularidades, los cambios de sección, las obstrucciones y la vegetación, y multiplicando por los meandros.',
      kidIntro: '¿Qué tanto frena este río al agua?',
      fields: [
        { id: 'n0', label: 'Material', def: 'gravagruesa', kid: true, options: OPT(COWAN.n0, { tierra: 'Tierra', roca: 'Roca', gravafina: 'Grava fina', gravagruesa: 'Grava gruesa' }) },
        { id: 'n1', label: 'Irregularidad', def: 'menor', options: OPT(COWAN.n1, { liso: 'Lisa', menor: 'Menor', moderado: 'Moderada', severo: 'Severa' }) },
        { id: 'n2', label: 'Cambios de sección', def: 'ocasional', options: OPT(COWAN.n2, { gradual: 'Graduales', ocasional: 'Ocasionales', frecuente: 'Frecuentes' }) },
        { id: 'n3', label: 'Obstrucciones', def: 'menor', options: OPT(COWAN.n3, { despreciable: 'Despreciables', menor: 'Menores', apreciable: 'Apreciables', severo: 'Severas' }) },
        { id: 'n4', label: 'Vegetación', def: 'baja', kid: true, options: OPT(COWAN.n4, { baja: 'Baja', media: 'Media', alta: 'Alta', muyalta: 'Muy alta' }) },
        { id: 'm5', label: 'Meandros', def: 'apreciable', options: OPT(COWAN.m5, { menor: 'Menores', apreciable: 'Apreciables', severo: 'Severos' }) },
      ],
      run: calcCowan,
    },
    pre: {
      title: 'n compuesto de una cara con varias coberturas',
      intro: 'El n equivalente de una cara (o de una sección) que cruza varias coberturas, por tres métodos, y el caudal que pasa con una profundidad.',
      kidIntro: 'Si el agua pasa por pasto y por bosque, ¿qué n le toca?',
      fields: [
        { id: 'tabla', label: 'Coberturas: nombre, % del ancho y n (una por línea)', def: DEF_MIX, text: true, kid: true },
        { id: 'h', label: 'Profundidad', unit: 'm', def: 0.8 },
        { id: 'W', label: 'Ancho de la cara', unit: 'm', def: 20 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.5 },
      ],
      run: preCompuesto,
    },
    extra: [
      {
        kind: 'calc',
        title: 'Ajuste con marcas de agua',
        intro: 'El error medio cuadrático y el sesgo del modelo frente a marcas de agua levantadas después de una creciente.',
        kidIntro: '¿Qué tanto se equivoca el modelo?',
        fields: [{ id: 'marcas', label: 'Cota observada y del modelo (m), una marca por línea', def: DEF_MARKS, text: true, kid: true }],
        run: calcMarcas,
      },
    ],
  },
  retorno: {
    norm: NORM,
    calc: {
      title: 'Caudales de diseño por Gumbel',
      intro: 'Ajuste de Gumbel por momentos a una serie de máximos anuales y el caudal de cualquier periodo de retorno.',
      kidIntro: '¿Qué tan grande es la creciente de 100 años?',
      fields: [
        { id: 'serie', label: 'Máximos anuales (m³/s), uno por línea', def: AMS_TXT, text: true },
        { id: 'T', label: 'Periodo de retorno', unit: 'años', def: 100, kid: true },
      ],
      run: calcGumbel,
    },
    pre: {
      title: 'Periodo de retorno según el riesgo aceptado',
      intro: 'El periodo de retorno para que la probabilidad de ver la creciente durante la vida útil no pase de un valor.',
      kidIntro: '¿Para cuántos años hay que diseñar?',
      fields: [
        { id: 'n', label: 'Vida útil', unit: 'años', def: 50, kid: true },
        { id: 'R', label: 'Riesgo aceptado', unit: '%', def: 10, kid: true },
      ],
      run: preRiesgo,
    },
    extra: [
      {
        kind: 'calc',
        title: 'Hidrograma de entrada',
        intro: 'El hidrograma con forma gamma que entra al modelo: volumen de la creciente y caudales a distintos tiempos.',
        kidIntro: '¿Cuánta agua trae la creciente?',
        fields: [
          { id: 'Qp', label: 'Caudal pico', unit: 'm³/s', def: 80 },
          { id: 'tp', label: 'Tiempo al pico', unit: 'min', def: 30 },
          { id: 'Qb', label: 'Caudal base', unit: 'm³/s', def: 4 },
          { id: 'dur', label: 'Duración de la simulación', unit: 'min', def: 120 },
        ],
        run: calcHidrograma,
      },
      {
        kind: 'calc',
        title: 'Escorrentía con el número de curva',
        intro: 'La lámina de lluvia que escurre con el método del SCS (número de curva), la que usa la lluvia sobre la malla.',
        kidIntro: '¿Cuánta lluvia corre por el suelo?',
        fields: [
          { id: 'P', label: 'Lluvia acumulada', unit: 'mm', def: 80, kid: true },
          { id: 'CN', label: 'Número de curva', def: 74, kid: true },
        ],
        run: calcSCS,
      },
    ],
  },
  ecuaciones: {
    norm: NORM,
    calc: {
      title: 'Paso de tiempo por el número de Courant',
      intro: 'Paso de tiempo para un Courant pedido y el máximo que admitiría un esquema explícito.',
      kidIntro: '¿Cada cuánto calcula el modelo?',
      fields: [
        { id: 'dx', label: 'Tamaño de celda', unit: 'm', def: 10, kid: true },
        { id: 'V', label: 'Velocidad del agua', unit: 'm/s', def: 2.5, kid: true },
        { id: 'h', label: 'Profundidad', unit: 'm', def: 2 },
        { id: 'C', label: 'Courant pedido', def: 1 },
      ],
      run: calcCourant,
    },
    pre: {
      title: 'Tamaño de la malla y trabajo de cálculo',
      intro: 'Celdas, caras, píxeles por celda y pasos de tiempo de una malla, para comparar cuánto cuesta afinarla.',
      kidIntro: '¿Cuántas celdas tiene tu malla?',
      fields: [
        { id: 'A', label: 'Área del flujo 2D', unit: 'ha', def: 25.6, kid: true },
        { id: 'c', label: 'Tamaño de celda', unit: 'm', def: 10, kid: true },
        { id: 'px', label: 'Píxel del terreno', unit: 'm', def: 1 },
        { id: 'dur', label: 'Duración', unit: 'min', def: 120 },
        { id: 'V', label: 'Velocidad máxima', unit: 'm/s', def: 2.5 },
        { id: 'C', label: 'Courant', def: 2 },
      ],
      run: preMalla,
    },
    extra: [
      {
        kind: 'calc',
        title: 'Volumen de una celda con subgrid',
        intro: 'Con las cotas de los píxeles de una celda y un nivel de agua: el volumen guardado y el área mojada, como en el preprocesador de HEC-RAS.',
        kidIntro: '¿Cuánta agua cabe en la celda?',
        fields: [
          { id: 'pix', label: 'Cotas de los píxeles (m)', def: DEF_PIXELS, text: true },
          { id: 'eta', label: 'Nivel del agua', unit: 'm', def: 1477 },
          { id: 'a', label: 'Área de cada píxel', unit: 'm²', def: 1 },
        ],
        run: calcSubgrid,
      },
    ],
  },
  estructuras: {
    norm: NORM,
    calc: {
      title: 'Vertedero sobre la vía',
      intro: 'El caudal que pasa por encima del terraplén de una vía como vertedero de cresta ancha, con la reducción por sumergencia.',
      kidIntro: '¿Cuánta agua pasa por encima de la vía?',
      fields: [
        { id: 'C', label: 'Coeficiente del vertedero (SI)', def: 1.66 },
        { id: 'L', label: 'Longitud de vía que vierte', unit: 'm', def: 40, kid: true },
        { id: 'crest', label: 'Cota de la corona', unit: 'm', def: 1480.57 },
        { id: 'eu', label: 'Cota del agua aguas arriba', unit: 'm', def: 1481.0, kid: true },
        { id: 'ed', label: 'Cota del agua aguas abajo', unit: 'm', def: 1480.7 },
      ],
      run: calcVertederoVia,
    },
    pre: {
      title: 'El puente a presión',
      intro: 'Tipo de flujo bajo el tablero (libre, compuerta u orificio) y su caudal, con la luz tapada por troncos y basura.',
      kidIntro: '¿El agua pasa libre o empuja el puente?',
      fields: [
        { id: 'b', label: 'Ancho de la luz', unit: 'm', def: 10 },
        { id: 'zf', label: 'Cota del fondo bajo el puente', unit: 'm', def: 1475.4 },
        { id: 'low', label: 'Cota de la cara inferior del tablero', unit: 'm', def: 1479.97, kid: true },
        { id: 'eu', label: 'Cota del agua aguas arriba', unit: 'm', def: 1480.3, kid: true },
        { id: 'ed', label: 'Cota del agua aguas abajo', unit: 'm', def: 1479.6 },
        { id: 'block', label: 'Luz tapada', unit: '%', def: 0 },
        { id: 'Cd', label: 'Coeficiente de compuerta', def: 0.5 },
        { id: 'Co', label: 'Coeficiente de orificio', def: 0.8 },
      ],
      run: prePresion,
    },
    extra: [
      {
        kind: 'calc',
        title: 'Rotura del jarillón',
        intro: 'Cómo se abre una rotura en HEC-RAS (ancho, fondo, taludes y tiempo de formación) y el caudal que pasa cuando está completa.',
        kidIntro: '¿Cuánta agua entra por un hueco en el jarillón?',
        fields: [
          { id: 'W', label: 'Ancho final del fondo', unit: 'm', def: 30, kid: true },
          { id: 'Hb', label: 'Altura de la rotura', unit: 'm', def: 1.3 },
          { id: 'z', label: 'Taludes (H:1V)', def: 1 },
          { id: 'tf', label: 'Tiempo de formación', unit: 'min', def: 10 },
          { id: 'H', label: 'Agua sobre el fondo de la rotura', unit: 'm', def: 0.4, kid: true },
          { id: 'C', label: 'Coeficiente del vertedero (SI)', def: 1.44 },
        ],
        run: calcRoturaJarillon,
      },
    ],
  },
  riesgo: {
    norm: NORM,
    calc: {
      title: 'Daño anual esperado',
      intro: 'El área bajo la curva daño–probabilidad con los daños de varios periodos de retorno (regla del trapecio y cola).',
      kidIntro: '¿Cuánto se pierde en promedio cada año?',
      fields: [{ id: 'tabla', label: 'Periodo de retorno (años) y daño, uno por línea', def: DEF_DAMAGE, text: true, kid: true }],
      run: calcDAE,
    },
    pre: {
      title: 'Zona de amenaza de un punto (ejercicio)',
      intro: 'La intensidad con la profundidad, la velocidad y su producto para dos crecientes, y la zona con la matriz del ejercicio.',
      kidIntro: '¿Qué tan peligroso es este punto?',
      fields: [
        { id: 'h30', label: 'Profundidad con 30 años', unit: 'm', def: 0.3, kid: true },
        { id: 'v30', label: 'Velocidad con 30 años', unit: 'm/s', def: 0.4 },
        { id: 'h100', label: 'Profundidad con 100 años', unit: 'm', def: 0.8, kid: true },
        { id: 'v100', label: 'Velocidad con 100 años', unit: 'm/s', def: 0.6 },
      ],
      run: preZonas,
    },
    extra: [
      {
        kind: 'calc',
        title: 'Incertidumbre del caudal de diseño',
        intro: 'El error estándar del caudal de un periodo de retorno ajustado con Gumbel por momentos, y su intervalo del 90 %.',
        kidIntro: '¿Qué tan seguro es el caudal de 100 años?',
        fields: [
          { id: 'T', label: 'Periodo de retorno', unit: 'años', def: 100, kid: true },
          { id: 'n', label: 'Años de registro', def: 30, kid: true },
          { id: 'media', label: 'Media de los máximos', unit: 'm³/s', def: 32.66 },
          { id: 'desv', label: 'Desviación estándar', unit: 'm³/s', def: 14.97 },
        ],
        run: calcErrorCaudal,
      },
    ],
  },
  modelo: {
    norm: NORM,
    calc: {
      title: 'Balance de volumen de una corrida',
      intro: 'El error de volumen de una corrida con lo que había, lo que entró, lo que salió y lo que quedó.',
      kidIntro: '¿El modelo perdió agua?',
      fields: [
        { id: 'V0', label: 'Volumen al empezar', unit: 'm³', def: 12000 },
        { id: 'Vin', label: 'Volumen que entró', unit: 'm³', def: 260000, kid: true },
        { id: 'Vout', label: 'Volumen que salió', unit: 'm³', def: 230000, kid: true },
        { id: 'V1', label: 'Volumen al terminar', unit: 'm³', def: 41900 },
      ],
      run: calcBalance,
    },
    pre: {
      title: 'Lista de chequeo del modelo',
      intro: 'Revisión de un modelo 2D antes de usar sus resultados: proyección, terreno, cauce, líneas de quiebre, bordes, Courant, volumen y sensibilidad.',
      kidIntro: '¿Está bien armado tu modelo?',
      fields: [
        { id: 'proj', label: 'Coordenadas', def: 'origen', kid: true, options: [{ value: 'origen', label: 'Planas (EPSG:9377)' }, { value: 'geo', label: 'Geográficas (grados)' }] },
        { id: 'px', label: 'Píxel del terreno', unit: 'm', def: 1 },
        { id: 'W', label: 'Boca del cauce', unit: 'm', def: 11 },
        { id: 'burn', label: 'Cauce levantado e insertado', def: 'si', options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
        { id: 'brk', label: 'Líneas de quiebre', def: 'si', options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
        { id: 'dist', label: 'Distancia de los bordes a la zona de interés', unit: 'm', def: 200 },
        { id: 'eq', label: 'Ecuaciones', def: 'difusiva', options: [{ value: 'difusiva', label: 'Onda difusiva' }, { value: 'completas', label: 'Aguas someras' }] },
        { id: 'C', label: 'Courant máximo de la corrida', def: 2 },
        { id: 'err', label: 'Error de volumen', unit: '%', def: 0.01 },
        { id: 'runs', label: 'Corridas de sensibilidad', def: 3, kid: true },
      ],
      run: preChequeo,
    },
  },
  propio: {
    norm: NORM,
    calc: {
      title: 'La malla de tu terreno',
      intro: 'Celdas, píxeles por celda y pasos de tiempo de una malla sobre un terreno propio.',
      kidIntro: '¿Cuántas celdas tendría tu terreno?',
      fields: [
        { id: 'Lx', label: 'Largo del terreno', unit: 'm', def: 360, kid: true },
        { id: 'Ly', label: 'Ancho del terreno', unit: 'm', def: 240, kid: true },
        { id: 'px', label: 'Píxel del terreno', unit: 'm', def: 2 },
        { id: 'c', label: 'Tamaño de celda', unit: 'm', def: 6, kid: true },
        { id: 'V', label: 'Velocidad esperada', unit: 'm/s', def: 2 },
        { id: 'h', label: 'Profundidad esperada', unit: 'm', def: 1.5 },
      ],
      run: calcMallaPropia,
    },
    pre: {
      title: 'Revisión del terreno',
      intro: 'Antes de correr: tipo de modelo, píxeles a lo ancho del cauce y error vertical frente a la profundidad.',
      kidIntro: '¿Sirve tu terreno para el modelo?',
      fields: [
        { id: 'src', label: 'Tipo de modelo', def: 'mdt', kid: true, options: [{ value: 'mdt', label: 'MDT (suelo)' }, { value: 'mds', label: 'MDS (con techos y copas)' }] },
        { id: 'px', label: 'Píxel', unit: 'm', def: 2 },
        { id: 'rmse', label: 'Error vertical (RMSE)', unit: 'm', def: 0.15 },
        { id: 'W', label: 'Ancho del cauce', unit: 'm', def: 12, kid: true },
        { id: 'D', label: 'Profundidad del cauce', unit: 'm', def: 1.8 },
      ],
      run: preTerrenoPropio,
    },
  },
};

export { gumbelK };

// Herramientas de diseño de la sala «Cuencas»: funciones puras (datos del formulario → resultados, paso a paso y
// verificaciones), con su gráfica registrada para la memoria. Son prediseños académicos.

import { f, type Check, type Result, type Vals } from '../canals/designCalc';
import type { Field, ToolSet } from '../canals/design';
import { registerPlan } from '../canals/designPlans';
import type { XY } from '../canals/plan';
import { RAS_SHORT, RAS_TABLA16 } from '../canals/norms';
import {
  COVERS,
  IDF_ILUS,
  alternatingBlocks,
  convolve,
  coverC,
  effectiveBlocks,
  gumbelK,
  gumbelQ,
  idf,
  mean,
  rational,
  risk,
  scsRunoff,
  scsUnitHydrograph,
  std,
  tForRisk,
  tcKirpich,
  tcSCS,
  tcTemez,
  weibullPositions,
  type Cover,
} from './hydrology';

const num = (v: number | string | undefined, def: number) => {
  if (v === undefined) return def;
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
};
const bad = (error: string): Result => ({ outs: [], steps: [], kid: '', error });

export const ROOM = 'Cuencas: de la lluvia al caudal';
export const IDF_NOTE = `Curva IDF ilustrativa, i = ${IDF_ILUS.K}·T^${f(IDF_ILUS.m, 2)}/(t + ${IDF_ILUS.c})^${f(IDF_ILUS.n, 2)} (mm/h, t en min): no es la de una estación real. Un diseño usa la curva IDF de la estación más cercana (RAS, Art. 135, num. 2).`;

/** Obras de la Tabla 16 del RAS (Art. 135). */
export const OBRAS = [
  { value: 'res2', label: 'Tramo inicial residencial (< 2 ha)', T: 3 },
  { value: 'com2', label: 'Tramo inicial comercial o industrial (< 2 ha)', T: 5 },
  { value: 'alc10', label: 'Alcantarillado de 2 a 10 ha', T: 5 },
  { value: 'alc', label: 'Alcantarillado de más de 10 ha', T: 10 },
  { value: 'canal', label: 'Canal abierto (< 1 000 ha)', T: 50 },
  { value: 'canalg', label: 'Canal abierto (> 1 000 ha)', T: 100 },
];
const obraT = (o: string) => OBRAS.find((x) => x.value === o)?.T ?? 10;
const RESTO_OPTS = [
  { value: 'bosque', label: 'Bosque' },
  { value: 'pasto', label: 'Pasto' },
  { value: 'cultivo', label: 'Cultivos' },
];

/** C de una cuenca con una fracción impermeable (barrio y vías) y el resto en una cobertura. */
function cImp(imp: number, resto: Cover, T: number): number {
  return imp * (0.8 * coverC('barrio', T) + 0.2 * coverC('pavimento', T)) + (1 - imp) * coverC(resto, T);
}
function runoffImp(imp: number, resto: Cover, soil: 'B' | 'C' | 'D', P: number): number {
  return imp * (0.8 * scsRunoff(P, COVERS.barrio.CN[soil]) + 0.2 * scsRunoff(P, 98)) + (1 - imp) * scsRunoff(P, COVERS[resto].CN[soil]);
}

// ------------------------------------------------------------------ la cuenca: tiempo de concentración

export function calcTc(v: Vals): Result {
  const L = num(v.L, 1400), S = num(v.S, 12) / 100, CN = num(v.CN, 75);
  if (L <= 0 || S <= 0 || CN <= 0 || CN > 100) return bad('Revisa los datos: largo y pendiente mayores que cero, CN entre 1 y 100.');
  const k = tcKirpich(L, S), t = tcTemez(L, S), s = tcSCS(L, S, CN);
  const avg = (k + t + s) / 3;
  return {
    outs: [
      { label: 'Kirpich', value: `${f(k, 1)} min`, kid: true },
      { label: 'Témez', value: `${f(t, 1)} min`, kid: true },
      { label: 'Retardo del SCS', value: `${f(s, 1)} min` },
      { label: 'Promedio', value: `${f(avg, 1)} min`, kid: true },
      { label: 'Dispersión entre fórmulas', value: `${f((Math.max(k, t, s) / Math.min(k, t, s) - 1) * 100, 0)} %` },
    ],
    steps: [
      `Kirpich (1940): tc = 0,0195·L^0,77·S^−0,385 = 0,0195·${f(L, 0)}^0,77·${f(S, 4)}^−0,385 = ${f(k, 2)} min.`,
      `Témez (1978): tc = 0,3·(L/S^0,25)^0,76 h, con L = ${f(L / 1000, 3)} km → ${f(t / 60, 3)} h = ${f(t, 2)} min.`,
      `SCS: retardo tL = L^0,8·(S' + 1)^0,7/(1900·Y^0,5) con L en pies (${f(L / 0.3048, 0)}), S' = 1000/CN − 10 = ${f(1000 / CN - 10, 2)} pulgadas e Y = ${f(S * 100, 1)} %; tc = tL/0,6 = ${f(s, 2)} min.`,
      `Las fórmulas son empíricas y salen de cuencas distintas: difieren entre sí. El RAS (Art. 135, num. 4) pide incluir el tiempo de entrada y el de viaje, y simular tiempos mínimos de 3 a 10 minutos para ver cuánto cambia el resultado.`,
    ],
    checks: [{ name: `${RAS_SHORT}, Art. 135, num. 4: tiempo de concentración mínimo simulado entre 3 y 10 min`, ok: avg >= 3, value: `${f(avg, 1)} min` }],
    kid: `El agua de la parte más lejana tarda unos ${f(avg, 0)} minutos en llegar a la salida de la cuenca.`,
    data: { kind: 'tc', k, t, s, avg },
  };
}

// ------------------------------------------------------------------ la cuenca: caudal de diseño

export function preCaudal(v: Vals): Result {
  const A = num(v.A, 40), L = num(v.L, 1200), S = num(v.S, 10) / 100, imp = num(v.imp, 30) / 100;
  const resto = (typeof v.resto === 'string' && v.resto in COVERS ? v.resto : 'pasto') as Cover;
  const obra = typeof v.obra === 'string' ? v.obra : 'canal';
  const soil = v.suelo === 'B' || v.suelo === 'D' ? v.suelo : 'C';
  if (A <= 0 || L <= 0 || S <= 0 || imp < 0 || imp > 1) return bad('Revisa los datos: área, largo y pendiente mayores que cero; impermeable entre 0 y 100 %.');
  const T = obraT(obra);
  const C = cImp(imp, resto, T);
  const CNav = imp * COVERS.barrio.CN[soil] + (1 - imp) * COVERS[resto].CN[soil];
  const tc = Math.max(10, (tcKirpich(L, S) + tcTemez(L, S) + tcSCS(L, S, CNav)) / 3);
  const i = idf(T, tc);
  const steps: string[] = [`Obra: ${OBRAS.find((o) => o.value === obra)?.label ?? obra} → período de retorno mínimo T = ${T} años (RAS, Art. 135, Tabla 16).`, `Tiempo de concentración: promedio de Kirpich, Témez y SCS, con mínimo de 10 min: tc = ${f(tc, 1)} min.`, `Intensidad de la curva IDF ilustrativa con T = ${T} años y duración tc: i = ${f(i, 1)} mm/h.`];
  let Q: number, method: string;
  if (A < 80) {
    Q = rational(C, i, A);
    method = 'racional';
    steps.push(`Área ${f(A, 1)} ha < 80 ha: método racional, Q = C·i·A/360 = ${f(C, 3)}·${f(i, 1)}·${f(A, 1)}/360 = ${f(Q, 3)} m³/s (C ponderado: ${f(imp * 100, 0)} % impermeable y el resto en ${COVERS[resto].name.toLowerCase()}).`);
  } else {
    // aguacero de 2·tc por bloques alternos y número de curva con hidrograma unitario del SCS
    const dt = Math.max(2, Math.min(15, Math.round(tc / 5)));
    const rain = alternatingBlocks(T, Math.max(2 * tc, 60), dt);
    const eff = effectiveBlocks(rain, (P) => runoffImp(imp, resto, soil, P));
    const uh = scsUnitHydrograph(A / 100, tc / 60, dt / 60);
    const hy = convolve(eff, uh.uh);
    Q = Math.max(...hy);
    method = 'número de curva e hidrograma unitario del SCS';
    steps.push(`Área ${f(A, 1)} ha ≥ 80 ha: el RAS no admite el método racional. Aguacero de ${f(Math.max(2 * tc, 60), 0)} min por bloques alternos, lluvia efectiva con el número de curva (suelo ${soil}) e hidrograma unitario triangular del SCS: pico ${f(Q, 3)} m³/s.`);
  }
  const checks: Check[] = [
    { name: `${RAS_SHORT}, Art. 135: método racional solo con áreas menores de 80 ha`, ok: method !== 'racional' || A < 80, value: `${f(A, 1)} ha · ${method}` },
    { name: `${RAS_SHORT}, Art. 135, Tabla 16: período de retorno mínimo para esta obra`, ok: true, value: `T = ${T} años` },
  ];
  return {
    outs: [
      { label: 'Caudal de diseño', value: `${f(Q, 2)} m³/s`, kid: true },
      { label: 'Período de retorno', value: `${T} años`, kid: true },
      { label: 'Tiempo de concentración', value: `${f(tc, 1)} min` },
      { label: 'Intensidad de diseño', value: `${f(i, 1)} mm/h` },
      { label: 'Método', value: method },
      ...(method === 'racional' ? [{ label: 'Coeficiente de escorrentía C', value: f(C, 3) }] : []),
    ],
    steps: [...steps, IDF_NOTE],
    checks,
    kid: `Para esta obra se diseña con el aguacero que pasa en promedio una vez cada ${T} años: llegan unos ${f(Q, 1)} m³/s.`,
    data: { kind: 'idf', T, tc, i },
  };
}

export function calcRacional(v: Vals): Result {
  const A = num(v.A, 20), T = num(v.T, 10), t = num(v.t, 15), imp = num(v.imp, 40) / 100;
  const resto = (typeof v.resto === 'string' && v.resto in COVERS ? v.resto : 'pasto') as Cover;
  if (A <= 0 || T < 2 || t <= 0 || imp < 0 || imp > 1) return bad('Revisa los datos: área y duración mayores que cero, T de 2 años o más.');
  const C = cImp(imp, resto, T), i = idf(T, t), Q = rational(C, i, A);
  return {
    outs: [
      { label: 'Caudal pico', value: `${f(Q, 3)} m³/s`, kid: true },
      { label: 'Coeficiente de escorrentía C', value: f(C, 3), kid: true },
      { label: 'Intensidad', value: `${f(i, 1)} mm/h` },
      { label: 'Caudal por hectárea', value: `${f((Q / A) * 1000, 1)} L/s·ha` },
    ],
    steps: [
      `C ponderado: ${f(imp * 100, 0)} % impermeable (80 % techos y zonas duras del barrio, 20 % vías) y ${f((1 - imp) * 100, 0)} % ${COVERS[resto].name.toLowerCase()}, con los valores de la tabla 15.1.1 de Chow et al. (1988) para T = ${f(T, 0)} años: C = ${f(C, 3)}.`,
      `Intensidad con T = ${f(T, 0)} años y t = ${f(t, 0)} min: ${f(i, 1)} mm/h.`,
      `Q = C·i·A/360 = ${f(C, 3)}·${f(i, 1)}·${f(A, 2)}/360 = ${f(Q, 4)} m³/s. El método supone que la lluvia cae pareja sobre toda la cuenca durante el tiempo de concentración.`,
      IDF_NOTE,
    ],
    checks: [{ name: `${RAS_SHORT}, Art. 135: método racional solo con áreas menores de 80 ha`, ok: A < 80, value: `${f(A, 1)} ha` }],
    kid: `Con esta lluvia salen unos ${f(Q * 1000, 0)} litros por segundo.`,
    data: { kind: 'idf', T, tc: t, i },
  };
}

// ------------------------------------------------------------------ hidrograma

export function calcSCS(v: Vals): Result {
  const P = num(v.P, 60), CN = num(v.CN, 80), A = num(v.A, 0.6), tc = num(v.tc, 25), D = num(v.D, 30);
  if (P <= 0 || CN <= 0 || CN > 100 || A <= 0 || tc <= 0 || D <= 0) return bad('Revisa los datos: todos mayores que cero y CN de 1 a 100.');
  const S = 25400 / CN - 254, Ia = 0.2 * S, Q = scsRunoff(P, CN);
  const dt = Math.max(1, Math.min(15, Math.round(D / 6)));
  const n = Math.max(1, Math.round(D / dt));
  const blocks = new Array(n).fill(P / n);
  const eff = effectiveBlocks(blocks, (x) => scsRunoff(x, CN));
  const uh = scsUnitHydrograph(A, tc / 60, dt / 60);
  const hy = convolve(eff, uh.uh);
  const Qp = Math.max(...hy);
  return {
    outs: [
      { label: 'Escorrentía', value: `${f(Q, 1)} mm de ${f(P, 1)} mm`, kid: true },
      { label: 'Se infiltra o queda en el suelo', value: `${f(P - Q, 1)} mm`, kid: true },
      { label: 'Caudal pico', value: `${f(Qp, 2)} m³/s`, kid: true },
      { label: 'Volumen de escorrentía', value: `${f(Q * A * 1000, 0)} m³` },
      { label: 'Abstracción inicial Ia', value: `${f(Ia, 1)} mm` },
    ],
    steps: [
      `S = 25 400/CN − 254 = ${f(S, 1)} mm; abstracción inicial Ia = 0,2·S = ${f(Ia, 1)} mm (hasta ahí no hay escorrentía).`,
      `Q = (P − Ia)²/(P − Ia + S) = (${f(P, 1)} − ${f(Ia, 1)})²/(${f(P, 1)} − ${f(Ia, 1)} + ${f(S, 1)}) = ${f(Q, 2)} mm (NRCS, TR-55).`,
      `Lluvia pareja de ${f(D, 0)} min en ${n} bloques de ${dt} min; lluvia efectiva por bloque con las pérdidas acumuladas.`,
      `Hidrograma unitario triangular del SCS: tp = Δt/2 + 0,6·tc = ${f(uh.tp, 3)} h, qp = 0,208·A/tp = ${f(uh.qp, 3)} m³/s por mm, tb = 2,67·tp = ${f(uh.tb, 3)} h. La convolución da el pico de ${f(Qp, 3)} m³/s.`,
    ],
    kid: `De ${f(P, 0)} mm de lluvia, ${f(Q, 0)} mm corren por encima del suelo y el resto se infiltra.`,
    data: { kind: 'hidro', P, CN, A, tc, D },
  };
}

/** Hidrograma de una cuenca con una fracción impermeable (para el prediseño de almacenamiento). */
function hydroImp(A: number, L: number, S: number, imp: number, resto: Cover, soil: 'B' | 'C' | 'D', T: number, D: number) {
  const CNav = imp * COVERS.barrio.CN[soil] + (1 - imp) * COVERS[resto].CN[soil];
  // la urbanización también acelera el agua: el retardo del SCS baja con el CN
  const tc = Math.max(10, (tcKirpich(L, S) + tcTemez(L, S) + tcSCS(L, S, CNav)) / 3);
  const dt = Math.max(2, Math.min(15, Math.round(tc / 5)));
  const rain = alternatingBlocks(T, D, dt);
  const eff = effectiveBlocks(rain, (P) => runoffImp(imp, resto, soil, P));
  const uh = scsUnitHydrograph(A / 100, tc / 60, dt / 60);
  return { hy: convolve(eff, uh.uh), dt, tc, Q: eff.reduce((a, x) => a + x, 0), P: rain.reduce((a, x) => a + x, 0) };
}

export function preRetencion(v: Vals): Result {
  const A = num(v.A, 30), L = num(v.L, 900), S = num(v.S, 10) / 100, i0 = num(v.imp0, 10) / 100, i1 = num(v.imp1, 60) / 100, T = num(v.T, 10), D = num(v.D, 60), h = num(v.h, 1.5);
  const resto = (typeof v.resto === 'string' && v.resto in COVERS ? v.resto : 'pasto') as Cover;
  const soil = v.suelo === 'B' || v.suelo === 'D' ? v.suelo : 'C';
  if (A <= 0 || L <= 0 || S <= 0 || T < 2 || D <= 0 || h <= 0 || i0 < 0 || i1 > 1 || i1 < i0) return bad('Revisa los datos: la cuenca después debe tener igual o más superficie impermeable que antes.');
  const pre = hydroImp(A, L, S, i0, resto, soil, T, D), post = hydroImp(A, L, S, i1, resto, soil, T, D);
  const Qp0 = Math.max(...pre.hy), Qp1 = Math.max(...post.hy);
  // volumen que hay que guardar para que la salida no supere el pico de antes (recorte del hidrograma de después)
  const Vs = post.hy.reduce((a, q) => a + Math.max(0, q - Qp0) * post.dt * 60, 0);
  const Ast = Vs / h;
  return {
    outs: [
      { label: 'Pico antes de urbanizar', value: `${f(Qp0, 2)} m³/s`, kid: true },
      { label: 'Pico después', value: `${f(Qp1, 2)} m³/s (${f((Qp1 / Qp0 - 1) * 100, 0)} % más)`, kid: true },
      { label: 'Volumen que hay que retener', value: `${f(Vs, 0)} m³`, kid: true },
      { label: `Área de un tanque o jardín de ${f(h, 1)} m de agua`, value: `${f(Ast, 0)} m²` },
      { label: 'Escorrentía antes / después', value: `${f(pre.Q, 1)} / ${f(post.Q, 1)} mm` },
    ],
    steps: [
      `Aguacero de diseño de ${f(D, 0)} min y T = ${f(T, 0)} años por bloques alternos (P = ${f(post.P, 1)} mm).`,
      `Antes: ${f(i0 * 100, 0)} % impermeable, tc = ${f(pre.tc, 1)} min → pico ${f(Qp0, 3)} m³/s. Después: ${f(i1 * 100, 0)} % impermeable, tc = ${f(post.tc, 1)} min → pico ${f(Qp1, 3)} m³/s (más escorrentía y más rápida).`,
      `Volumen a retener = parte del hidrograma de después que supera el pico de antes: ${f(Vs, 0)} m³ (cálculo de primer tanteo: un diseño real transita el hidrograma por el tanque con su descarga).`,
      `Con ${f(h, 1)} m de agua, el almacenamiento necesita ${f(Ast, 0)} m² (${f((Ast / (A * 10000)) * 100, 2)} % de la cuenca).`,
    ],
    checks: [{ name: 'Con el almacenamiento, el pico no supera el de antes de urbanizar', ok: true, value: `${f(Qp0, 2)} m³/s` }],
    kid: `Urbanizar sube el pico de la quebrada ${f((Qp1 / Qp0 - 1) * 100, 0)} %. Guardando ${f(Vs, 0)} m³ de agua lluvia se puede dejar como antes.`,
    data: { kind: 'retencion', A, L, S: S * 100, imp0: i0 * 100, imp1: i1 * 100, T, D, resto, suelo: soil, Qp0 },
  };
}

// ------------------------------------------------------------------ frecuencia y riesgo

export const SERIE_EJEMPLO = '38 52 41 66 47 35 58 44 71 49 39 62 45 54 83 42 50 37 60 46';

function parseSeries(txt: string): number[] {
  return txt
    .split(/[\s;]+/)
    .map((x) => Number(x.replace(',', '.')))
    .filter((x) => Number.isFinite(x) && x > 0);
}

export function calcGumbel(v: Vals): Result {
  const s = parseSeries(String(v.serie ?? SERIE_EJEMPLO));
  const T = num(v.T, 100);
  if (s.length < 5) return bad('Escribe al menos 5 caudales máximos anuales (m³/s), separados por espacios.');
  if (T <= 1.01) return bad('El período de retorno debe ser mayor que 1 año.');
  const mu = mean(s), sg = std(s), K = gumbelK(T), QT = gumbelQ(mu, sg, T);
  const pos = weibullPositions(s);
  return {
    outs: [
      { label: `Caudal de ${f(T, 0)} años`, value: `${f(QT, 1)} m³/s`, kid: true },
      { label: 'Media y desviación', value: `${f(mu, 1)} y ${f(sg, 1)} m³/s` },
      { label: 'Factor de frecuencia K_T', value: f(K, 3) },
      { label: 'Mayor caudal de la serie', value: `${f(pos[0].x, 1)} m³/s (T ≈ ${f(pos[0].T, 0)} años por Weibull)` },
      { label: 'Años de registro', value: `${s.length}` },
    ],
    steps: [
      `Media μ = ${f(mu, 2)} m³/s y desviación estándar σ = ${f(sg, 2)} m³/s de ${s.length} máximos anuales.`,
      `Gumbel por momentos: K_T = −(√6/π)·(0,5772 + ln(ln(T/(T − 1)))) = ${f(K, 4)} para T = ${f(T, 0)} años.`,
      `Q_T = μ + K_T·σ = ${f(mu, 2)} + ${f(K, 4)}·${f(sg, 2)} = ${f(QT, 2)} m³/s.`,
      `Con ${s.length} años de datos, estimar caudales de más de ${f(2 * s.length, 0)} o ${f(3 * s.length, 0)} años es extrapolar: la incertidumbre crece mucho.`,
    ],
    checks: [{ name: 'Serie de al menos 20 años para estimar crecientes (recomendación usual)', ok: s.length >= 20, value: `${s.length} años` }],
    kid: `La creciente de ${f(T, 0)} años trae unos ${f(QT, 0)} m³/s.`,
    data: { kind: 'gumbel', serie: s.join(' '), T },
  };
}

export function preRiesgo(v: Vals): Result {
  const n = num(v.n, 50), R = num(v.R, 10) / 100, mu = num(v.mu, 50), sg = num(v.sg, 13);
  const obra = typeof v.obra === 'string' ? v.obra : 'canal';
  if (n <= 0 || R <= 0 || R >= 1 || mu <= 0 || sg <= 0) return bad('Revisa los datos: vida útil mayor que cero y riesgo entre 0 y 100 %.');
  const T = tForRisk(R, n), Tmin = obraT(obra), Tuse = Math.max(T, Tmin), QT = gumbelQ(mu, sg, Tuse);
  return {
    outs: [
      { label: 'Período de retorno necesario', value: `${f(T, 0)} años`, kid: true },
      { label: 'Período de retorno a usar', value: `${f(Tuse, 0)} años`, kid: true },
      { label: 'Caudal de diseño', value: `${f(QT, 1)} m³/s`, kid: true },
      { label: 'Riesgo con el mínimo del RAS', value: `${f(risk(Tmin, n) * 100, 0)} % en ${f(n, 0)} años` },
    ],
    steps: [
      `Riesgo de que la creciente de T años se supere al menos una vez en n años: R = 1 − (1 − 1/T)^n.`,
      `Despejando: T = 1/(1 − (1 − R)^(1/n)) = 1/(1 − (1 − ${f(R, 3)})^(1/${f(n, 0)})) = ${f(T, 1)} años.`,
      `El mínimo del RAS para esta obra es ${Tmin} años (Art. 135, Tabla 16), con riesgo de ${f(risk(Tmin, n) * 100, 1)} % en ${f(n, 0)} años; se usa el mayor: ${f(Tuse, 0)} años.`,
      `Con Gumbel (μ = ${f(mu, 1)}, σ = ${f(sg, 1)} m³/s): Q = μ + K_T·σ = ${f(QT, 2)} m³/s.`,
    ],
    checks: [{ name: `${RAS_SHORT}, Art. 135, Tabla 16: período de retorno mínimo de la obra`, ok: Tuse >= Tmin, value: `${f(Tuse, 0)} años (mínimo ${Tmin})` }],
    kid: `Para que en ${f(n, 0)} años haya solo ${f(R * 100, 0)} % de probabilidad de que el agua supere la obra, se diseña con la creciente de ${f(Tuse, 0)} años.`,
    data: { kind: 'riesgo', n, R: R * 100, T: Tuse },
  };
}

// ------------------------------------------------------------------ gráficas de la memoria

const N = (x: number | string | undefined) => (typeof x === 'number' ? x : Number(x));

registerPlan(calcTc, (d) => ({
  chart: {
    title: 'Tiempo de concentración según cada fórmula',
    xLabel: 'fórmula (1 Kirpich, 2 Témez, 3 SCS)',
    yLabel: 'minutos',
    series: [{ name: 'tc', pts: [[1, N(d.k)], [2, N(d.t)], [3, N(d.s)]] as XY[] }],
    hlines: [{ y: N(d.avg), text: 'promedio' }],
  },
}));

const idfChart = (d: Record<string, number | string>) => ({
  chart: {
    title: 'Curva IDF ilustrativa y punto de diseño',
    xLabel: 'duración (min)',
    yLabel: 'intensidad (mm/h)',
    series: [2, 10, 100].map((T, k) => ({ name: `T = ${T} años`, pts: Array.from({ length: 40 }, (_, j) => [5 + j * 5, idf(T, 5 + j * 5)] as XY), dash: k === 0 })),
    mark: { at: [N(d.tc), N(d.i)] as XY, text: `T = ${N(d.T)} años` },
  },
});
registerPlan(preCaudal, idfChart);
registerPlan(calcRacional, idfChart);

registerPlan(calcSCS, (d) => {
  const P = N(d.P), CN = N(d.CN), A = N(d.A), tc = N(d.tc), D = N(d.D);
  const dt = Math.max(1, Math.min(15, Math.round(D / 6)));
  const n = Math.max(1, Math.round(D / dt));
  const eff = effectiveBlocks(new Array(n).fill(P / n), (x) => scsRunoff(x, CN));
  const hy = convolve(eff, scsUnitHydrograph(A, tc / 60, dt / 60).uh);
  return { chart: { title: 'Hidrograma de escorrentía directa (SCS)', xLabel: 'tiempo (min)', yLabel: 'caudal (m³/s)', series: [{ name: 'caudal', pts: hy.map((q, k) => [(k + 0.5) * dt, q] as XY) }] } };
});

registerPlan(preRetencion, (d) => {
  const A = N(d.A), L = N(d.L), S = N(d.S) / 100, T = N(d.T), D = N(d.D);
  const resto = String(d.resto) as Cover, soil = String(d.suelo) as 'B' | 'C' | 'D';
  const a = hydroImp(A, L, S, N(d.imp0) / 100, resto, soil, T, D), b = hydroImp(A, L, S, N(d.imp1) / 100, resto, soil, T, D);
  return {
    chart: {
      title: 'Hidrograma antes y después de urbanizar',
      xLabel: 'tiempo (min)',
      yLabel: 'caudal (m³/s)',
      series: [
        { name: 'antes', pts: a.hy.map((q, k) => [(k + 0.5) * a.dt, q] as XY), dash: true },
        { name: 'después', pts: b.hy.map((q, k) => [(k + 0.5) * b.dt, q] as XY) },
      ],
      hlines: [{ y: N(d.Qp0), text: 'pico de antes' }],
    },
  };
});

const red = (T: number) => -Math.log(-Math.log(1 - 1 / T));
registerPlan(calcGumbel, (d) => {
  const s = parseSeries(String(d.serie));
  const mu = mean(s), sg = std(s);
  const pos = weibullPositions(s);
  const Ts = [1.05, 1.5, 2, 5, 10, 25, 50, 100, 200, Math.max(200, N(d.T))];
  return {
    chart: {
      title: 'Caudales máximos anuales en papel de Gumbel',
      xLabel: 'variable reducida y = −ln(−ln(1 − 1/T))  (T = 2 → 0,37; 10 → 2,25; 100 → 4,60)',
      yLabel: 'caudal (m³/s)',
      series: [
        { name: 'registros (Weibull)', pts: pos.map((p) => [red(p.T), p.x] as XY), dash: true },
        { name: 'Gumbel', pts: Ts.map((T) => [red(T), gumbelQ(mu, sg, T)] as XY) },
      ],
      mark: { at: [red(N(d.T)), gumbelQ(mu, sg, N(d.T))] as XY, text: `T = ${N(d.T)} años` },
    },
  };
});

registerPlan(preRiesgo, (d) => ({
  chart: {
    title: 'Riesgo de que se supere al menos una vez',
    xLabel: 'años de vida útil',
    yLabel: 'riesgo (%)',
    series: [10, 50, 100, N(d.T)].map((T, k) => ({ name: k === 3 ? `T = ${f(T, 0)} años (diseño)` : `T = ${T} años`, pts: Array.from({ length: 41 }, (_, j) => [j * 2.5, risk(T, j * 2.5) * 100] as XY), dash: k < 3 })),
    hlines: [{ y: N(d.R), text: 'riesgo aceptado' }],
  },
}));

export const RAS_T16 = RAS_TABLA16;
export const RESTO = RESTO_OPTS;

// ------------------------------------------------------------------ herramientas de cada parte

const SOIL_FIELD: Field = {
  id: 'suelo',
  label: 'Suelo (grupo hidrológico)',
  def: 'C',
  options: [
    { value: 'B', label: 'B: franco, se infiltra bien' },
    { value: 'C', label: 'C: arcilloso, se infiltra poco' },
    { value: 'D', label: 'D: arcilla o roca, casi no se infiltra' },
  ],
};
const RESTO_FIELD: Field = { id: 'resto', label: 'El resto de la cuenca es', def: 'pasto', kid: true, options: RESTO_OPTS };
const OBRA_FIELD: Field = { id: 'obra', label: 'Obra que se diseña', def: 'canal', kid: true, options: OBRAS.map((o) => ({ value: o.value, label: `${o.label}: ${o.T} años` })) };

const NORM = `En hidrología de aguas lluvias, el RAS pide la curva IDF de la estación más cercana (Art. 135, num. 2), admite el método racional solo con áreas menores de 80 ha y fija el período de retorno mínimo de cada obra en la Tabla 16 (de 3 años en tramos iniciales residenciales a 100 años en canales que drenan más de 1 000 ha). Las curvas IDF y las series de esta sala son ilustrativas; las demás verificaciones son criterios de la herramienta para aprender.`;

export const BASIN_TOOLS: Record<'cuenca' | 'hidrograma' | 'frecuencia', ToolSet> = {
  cuenca: {
    norm: NORM,
    calc: {
      title: 'Calculadora del tiempo de concentración',
      intro: 'Tiempo que tarda el agua de la parte más lejana de la cuenca en llegar a la salida, con tres fórmulas empíricas (Kirpich, Témez y el retardo del SCS), y cuánto difieren entre sí.',
      kidIntro: '¿Cuánto tarda en llegar a la salida la gota que cae más lejos?',
      fields: [
        { id: 'L', label: 'Largo del cauce principal', unit: 'm', def: 1400, kid: true },
        { id: 'S', label: 'Pendiente media del cauce', unit: '%', def: 12, kid: true },
        { id: 'CN', label: 'Número de curva CN', def: 75 },
      ],
      run: calcTc,
    },
    pre: {
      title: 'Prediseño del caudal de diseño de una cuenca',
      intro: 'Caudal con el que se diseña una obra de drenaje: período de retorno mínimo de la Tabla 16 del RAS, tiempo de concentración, intensidad de la curva IDF y método racional (menos de 80 ha) o número de curva con hidrograma unitario (80 ha o más).',
      kidIntro: 'Dime cómo es la cuenca y qué obra quieres hacer: te digo con cuánta agua diseñarla.',
      fields: [
        OBRA_FIELD,
        { id: 'A', label: 'Área de la cuenca', unit: 'ha', def: 40, kid: true },
        { id: 'L', label: 'Largo del cauce principal', unit: 'm', def: 1200 },
        { id: 'S', label: 'Pendiente media del cauce', unit: '%', def: 10 },
        { id: 'imp', label: 'Parte impermeable (techos y vías)', unit: '%', def: 30, kid: true },
        RESTO_FIELD,
        SOIL_FIELD,
      ],
      run: preCaudal,
    },
    extra: [
      {
        kind: 'calc',
        title: 'Calculadora del método racional',
        intro: 'Caudal pico Q = C·i·A/360 con un coeficiente de escorrentía ponderado (Chow et al., 1988) y la intensidad de la curva IDF ilustrativa.',
        kidIntro: '',
        fields: [
          { id: 'A', label: 'Área', unit: 'ha', def: 20 },
          { id: 'T', label: 'Período de retorno', unit: 'años', def: 10 },
          { id: 't', label: 'Duración (tiempo de concentración)', unit: 'min', def: 15 },
          { id: 'imp', label: 'Parte impermeable', unit: '%', def: 40 },
          RESTO_FIELD,
        ],
        run: calcRacional,
      },
    ],
  },
  hidrograma: {
    norm: NORM,
    calc: {
      title: 'Calculadora de escorrentía e hidrograma (SCS)',
      intro: 'Lluvia que escurre con el número de curva (NRCS, TR-55) e hidrograma de escorrentía directa con el hidrograma unitario triangular del SCS.',
      kidIntro: 'De la lluvia que cae, ¿cuánta corre por encima y cuánta se infiltra?',
      fields: [
        { id: 'P', label: 'Lluvia total', unit: 'mm', def: 60, kid: true },
        { id: 'CN', label: 'Número de curva CN', def: 80, kid: true },
        { id: 'A', label: 'Área', unit: 'km²', def: 0.6 },
        { id: 'tc', label: 'Tiempo de concentración', unit: 'min', def: 25 },
        { id: 'D', label: 'Duración de la lluvia', unit: 'min', def: 30 },
      ],
      run: calcSCS,
    },
    pre: {
      title: 'Prediseño de un almacenamiento de aguas lluvias',
      intro: 'Volumen que hay que guardar para que, después de urbanizar, el pico de la quebrada no supere el de antes (primer tanteo, sin tránsito por el tanque).',
      kidIntro: 'Si construimos un barrio, ¿cuánta agua hay que guardar para no crecer la quebrada?',
      fields: [
        { id: 'A', label: 'Área de la cuenca', unit: 'ha', def: 30, kid: true },
        { id: 'L', label: 'Largo del cauce', unit: 'm', def: 900 },
        { id: 'S', label: 'Pendiente del cauce', unit: '%', def: 10 },
        { id: 'imp0', label: 'Impermeable antes', unit: '%', def: 10, kid: true },
        { id: 'imp1', label: 'Impermeable después', unit: '%', def: 60, kid: true },
        RESTO_FIELD,
        SOIL_FIELD,
        { id: 'T', label: 'Período de retorno', unit: 'años', def: 10 },
        { id: 'D', label: 'Duración del aguacero', unit: 'min', def: 60 },
        { id: 'h', label: 'Profundidad útil del tanque o jardín', unit: 'm', def: 1.5 },
      ],
      run: preRetencion,
    },
  },
  frecuencia: {
    norm: NORM,
    calc: {
      title: 'Calculadora de crecientes con Gumbel',
      intro: 'Caudal de un período de retorno con la distribución de Gumbel ajustada por momentos a una serie de caudales máximos anuales (la de ejemplo es inventada).',
      kidIntro: 'Con los caudales más altos de cada año, ¿qué creciente esperar una vez cada tantos años?',
      fields: [
        { id: 'serie', label: 'Caudales máximos anuales (m³/s), separados por espacios', def: SERIE_EJEMPLO, text: true, kid: true },
        { id: 'T', label: 'Período de retorno', unit: 'años', def: 100, kid: true },
      ],
      run: calcGumbel,
    },
    pre: {
      title: 'Prediseño del período de retorno por riesgo',
      intro: 'Período de retorno con el que se diseña para aceptar un riesgo dado durante la vida útil, comparado con el mínimo de la Tabla 16 del RAS, y el caudal de diseño con Gumbel.',
      kidIntro: '¿Qué tan grande debe ser la creciente de diseño para estar casi seguros durante muchos años?',
      fields: [
        OBRA_FIELD,
        { id: 'n', label: 'Vida útil de la obra', unit: 'años', def: 50, kid: true },
        { id: 'R', label: 'Riesgo aceptado', unit: '%', def: 10, kid: true },
        { id: 'mu', label: 'Media de los máximos anuales', unit: 'm³/s', def: 50 },
        { id: 'sg', label: 'Desviación de los máximos anuales', unit: 'm³/s', def: 13 },
      ],
      run: preRiesgo,
    },
  },
};

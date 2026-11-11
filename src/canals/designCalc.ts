// Calculadoras y prediseñadores de la hidráulica de canales: funciones puras (sin interfaz) para que las pruebas
// las revisen. Cada una recibe los datos del formulario y devuelve resultados, pasos con las fórmulas y los números,
// verificaciones y la memoria de cálculo. Son prediseños académicos: no son diseños de ingeniería.

import { CULVERT_RULES, INLETS, inletHW, outletHW, N_PIPE, type Inlet } from './culvert';
import { BROAD_C, FLUME, G, MATERIALS, VMIN, alternateDepths, belanger, criticalDepth, froude, geom, jumpKind, JUMP_NAME, manningQ, normalDepth, rectWeirQ, specificEnergy, triWeirQ, gateUpstream, type Material, type Section, type Shape } from './hydraulics';
import { RHO, RHO_S, RIPRAP, dStar, fallVelocity, shieldsCrit, bedloadStar, KAPPA, SG, MODE_NAME, type Mode } from './sediment';

export type Vals = Record<string, number | string>;
export interface Out {
  label: string;
  value: string;
  kid?: boolean;
}
export interface Check {
  name: string;
  ok: boolean;
  value: string;
}
export interface Result {
  outs: Out[];
  steps: string[];
  checks?: Check[];
  /** Frase para el nivel de niños. */
  kid: string;
  error?: string;
}

export const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const num = (v: number | string | undefined, def = 0) => {
  const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : def;
};
const ceilTo = (v: number, s: number) => Math.ceil(v / s - 1e-9) * s;

function section(v: Vals): Section {
  const shape: Shape = v.forma === 'trap' || v.forma === 'circ' ? v.forma : 'rect';
  return { shape, b: num(v.b, 2), z: shape === 'trap' ? num(v.z, 1.5) : 0, D: num(v.D, 1), H: 99 };
}
function nOf(v: Vals): number {
  const m = v.material as Material | 'otro';
  return m && m !== 'otro' && m in MATERIALS ? MATERIALS[m as Material].n : num(v.n, 0.015);
}
const regimeTxt = (F: number) => (F < 0.98 ? 'subcrítico (lento)' : F > 1.02 ? 'supercrítico (rápido)' : 'crítico');

// ------------------------------------------------------------------ 1. canal

export function calcCanal(v: Vals): Result {
  const s = section(v);
  const n = nOf(v);
  const S = num(v.S, 0.1) / 100;
  const Q = num(v.Q, 1);
  if (S <= 0 || Q <= 0 || n <= 0 || (s.shape !== 'circ' && s.b <= 0) || (s.shape === 'circ' && s.D <= 0)) return { outs: [], steps: [], kid: '', error: 'Revisa los datos: todos deben ser mayores que cero.' };
  const y = normalDepth(s, n, S, Q);
  if (Number.isNaN(y)) return { outs: [], steps: [], kid: 'El tubo no alcanza: tendría que ir lleno, a presión.', error: 'El tubo no lleva ese caudal con superficie libre: trabajaría a presión.' };
  const g = geom(s, y);
  const V = Q / g.A, F = froude(s, Q, y), yc = criticalDepth(s, Q), E = specificEnergy(s, Q, y);
  return {
    outs: [
      { label: 'Profundidad normal', value: `${f(y, 3)} m`, kid: true },
      { label: 'Velocidad media', value: `${f(V)} m/s`, kid: true },
      { label: 'Tipo de flujo', value: regimeTxt(F), kid: true },
      { label: 'Área mojada', value: `${f(g.A, 3)} m²` },
      { label: 'Perímetro mojado', value: `${f(g.P, 3)} m` },
      { label: 'Radio hidráulico', value: `${f(g.R, 4)} m` },
      { label: 'Ancho de superficie', value: `${f(g.T, 3)} m` },
      { label: 'Froude', value: f(F, 3) },
      { label: 'Profundidad crítica', value: `${f(yc, 3)} m` },
      { label: 'Energía específica', value: `${f(E, 3)} m` },
      { label: 'Esfuerzo en el fondo', value: `${f(1000 * G * g.R * S, 1)} Pa` },
    ],
    steps: [
      `Con y = ${f(y, 4)} m: A = ${f(g.A, 4)} m², P = ${f(g.P, 4)} m, R = A/P = ${f(g.R, 4)} m.`,
      `Manning: Q = (1/n)·A·R^(2/3)·S^(1/2) = (1/${f(n, 3)})·${f(g.A, 4)}·${f(g.R, 4)}^(2/3)·${f(S, 5)}^(1/2) = ${f(manningQ(s, n, S, y), 4)} m³/s (se busca y hasta igualar ${f(Q, 3)}).`,
      `V = Q/A = ${f(V, 3)} m/s; D = A/T = ${f(g.Dh, 4)} m; F = V/√(g·D) = ${f(F, 3)}.`,
      `Crítica: Q²·T/(g·A³) = 1 → yc = ${f(yc, 4)} m. Energía E = y + V²/2g = ${f(E, 4)} m.`,
    ],
    kid: `El agua va a ${f(y, 2)} m de profundidad y ${f(V, 1)} m/s: ${F < 1 ? 'lenta (las ondas pueden subir)' : 'rápida (las ondas no pueden subir)'}.`,
  };
}

export function preCanal(v: Vals): Result {
  const Q = num(v.Q, 3), S = num(v.S, 0.1) / 100;
  const mat: Material = typeof v.material === 'string' && v.material in MATERIALS ? (v.material as Material) : 'concreto';
  const n = MATERIALS[mat].n;
  const shape = v.forma === 'rect' ? 'rect' : 'trap';
  const z = shape === 'trap' ? num(v.z, 1.5) : 0;
  const fb = num(v.fb, 20) / 100;
  if (Q <= 0 || S <= 0) return { outs: [], steps: [], kid: '', error: 'El caudal y la pendiente deben ser mayores que cero.' };
  // sección de máxima eficiencia: rectangular b = 2y; trapecial b = 2y(√(1 + z²) − z)
  const k = shape === 'rect' ? 2 : 2 * (Math.sqrt(1 + z * z) - z);
  let lo = 1e-4, hi = 50;
  for (let i = 0; i < 100; i++) {
    const y = (lo + hi) / 2;
    const s: Section = { shape, b: k * y, z, D: 0, H: 99 };
    if (manningQ(s, n, S, y) < Q) lo = y;
    else hi = y;
  }
  const y0 = (lo + hi) / 2;
  const b = Math.max(0.3, ceilTo(k * y0, 0.05));
  const sec: Section = { shape, b, z, D: 0, H: 99 };
  const y = normalDepth(sec, n, S, Q);
  const g = geom(sec, y);
  const V = Q / g.A, F = froude(sec, Q, y);
  const H = ceilTo(Math.max(y * (1 + fb), y + 0.1), 0.05);
  const gH = geom(sec, H);
  const vmax = MATERIALS[mat].vmax;
  const checks: Check[] = [
    { name: 'No se deposita arena (V ≥ 0,6 m/s)', ok: V >= VMIN, value: `${f(V)} m/s` },
    { name: vmax ? `No erosiona (V ≤ ${f(vmax)} m/s)` : 'Revestimiento resistente (sin límite de erosión en el juego)', ok: !vmax || V <= vmax, value: `${f(V)} m/s` },
    { name: 'Flujo estable (Froude fuera de 0,8 a 1,2)', ok: F < 0.8 || F > 1.2, value: f(F) },
    { name: `Borde libre de ${Math.round(fb * 100)} % (y al menos 0,10 m)`, ok: true, value: `${f(H - y)} m` },
  ];
  return {
    outs: [
      { label: shape === 'rect' ? 'Ancho del fondo' : 'Ancho del fondo', value: `${f(b)} m`, kid: true },
      { label: 'Profundidad del agua', value: `${f(y)} m`, kid: true },
      { label: 'Altura de las paredes', value: `${f(H)} m`, kid: true },
      { label: 'Ancho arriba', value: `${f(gH.T)} m` },
      { label: 'Velocidad', value: `${f(V)} m/s`, kid: true },
      { label: 'Froude', value: f(F) },
      { label: 'Área de excavación', value: `${f(gH.A + 0.15 * gH.P)} m² por metro` },
      { label: 'Revestimiento de 0,10 m', value: `${f(0.1 * gH.P, 3)} m³ por metro` },
    ],
    steps: [
      shape === 'rect' ? 'Máxima eficiencia en un rectángulo: medio cuadrado, b = 2y (el menor perímetro para el área).' : `Máxima eficiencia con talud ${f(z, 1)}:1: b = 2y·(√(1 + z²) − z) = ${f(k, 4)}·y.`,
      `Se busca y con Manning (n = ${f(n, 3)}, S = ${f(S * 100, 3)} %): y ≈ ${f(y0, 3)} m → b = ${f(k * y0, 3)} m, que se redondea a ${f(b)} m.`,
      `Con b = ${f(b)} m la profundidad normal queda en ${f(y, 3)} m; V = ${f(V, 3)} m/s; F = ${f(F, 3)}.`,
      `Paredes: y·(1 + ${f(fb, 2)}) = ${f(y * (1 + fb), 3)} m (al menos y + 0,10), redondeado a ${f(H)} m.`,
    ],
    checks,
    kid: `Un canal de ${f(b, 2)} m de ancho con paredes de ${f(H, 2)} m lleva ${f(Q, 1)} m³/s a ${f(y, 2)} m de profundidad.`,
  };
}

// ------------------------------------------------------------------ 2. resalto y pozo

export function calcResalto(v: Vals): Result {
  const Q = num(v.Q, 10), b = num(v.b, 4), y1 = num(v.y1, 0.3);
  if (Q <= 0 || b <= 0 || y1 <= 0) return { outs: [], steps: [], kid: '', error: 'Revisa los datos.' };
  const q = Q / b, V1 = q / y1, F1 = V1 / Math.sqrt(G * y1);
  if (F1 <= 1) return { outs: [], steps: [], kid: 'El agua llega lenta: no hay resalto.', error: `Con ${f(y1)} m el agua llega lenta (F = ${f(F1)}): no hay resalto. Prueba con menos profundidad.` };
  const y2 = belanger(y1, F1), dE = (y2 - y1) ** 3 / (4 * y1 * y2), E1 = y1 + V1 * V1 / (2 * G), Lj = 6.9 * (y2 - y1);
  const kind = jumpKind(F1);
  return {
    outs: [
      { label: 'Froude de llegada', value: f(F1), kid: true },
      { label: 'Profundidad después', value: `${f(y2, 3)} m`, kid: true },
      { label: 'Tipo de resalto', value: JUMP_NAME[kind], kid: true },
      { label: 'Energía perdida', value: `${f(dE, 3)} m (${f((dE / E1) * 100, 0)} %)` },
      { label: 'Largo del resalto', value: `${f(Lj, 2)} m`, kid: true },
      { label: 'Velocidad después', value: `${f(q / y2)} m/s` },
    ],
    steps: [
      `q = Q/b = ${f(q, 3)} m²/s; V1 = q/y1 = ${f(V1, 3)} m/s; F1 = V1/√(g·y1) = ${f(F1, 3)}.`,
      `Bélanger: y2 = (y1/2)·(√(1 + 8·F1²) − 1) = ${f(y2, 4)} m.`,
      `Pérdida: ΔE = (y2 − y1)³/(4·y1·y2) = ${f(dE, 4)} m, de E1 = ${f(E1, 3)} m.`,
      `Largo: Lj = 6,9·(y2 − y1) = ${f(Lj, 2)} m (Smetana).`,
    ],
    kid: `El agua salta de ${f(y1, 2)} m a ${f(y2, 2)} m de profundidad y pierde el ${f((dE / E1) * 100, 0)} % de su energía.`,
  };
}

export function prePozo(v: Vals): Result {
  const Q = num(v.Q, 12), b = num(v.b, 4), H = num(v.H, 6), loss = num(v.loss, 10) / 100, fs = num(v.fs, 1.1);
  if (Q <= 0 || b <= 0 || H <= 0) return { outs: [], steps: [], kid: '', error: 'Revisa los datos.' };
  const q = Q / b, yc = Math.cbrt(q * q / G), E0 = H + 1.5 * yc, E1 = (1 - loss) * E0;
  const sec: Section = { shape: 'rect', b, z: 0, D: 0, H: 99 };
  const alt = alternateDepths(sec, Q, E1);
  if (!alt) return { outs: [], steps: [], kid: '', error: 'Con esa caída no hay energía suficiente.' };
  const y1 = alt.sup, F1 = q / y1 / Math.sqrt(G * y1), y2 = belanger(y1, F1);
  const ytw = fs * y2, Hw = Math.pow(Q / (BROAD_C * b), 2 / 3), P = Math.max(0, ytw - Hw);
  const Lj = 6.9 * (y2 - y1), L = ceilTo(Lj, 0.5), wall = ceilTo(ytw + Math.max(0.5, 0.2 * ytw), 0.1);
  const kind = jumpKind(F1);
  const checks: Check[] = [
    { name: 'Resalto estable (F1 de 4,5 a 9)', ok: F1 >= 4.5 && F1 <= 9, value: f(F1, 1) },
    { name: 'Evita el oscilante (F1 de 2,5 a 4,5)', ok: F1 < 2.5 || F1 >= 4.5, value: JUMP_NAME[kind] },
    { name: 'El vertedero de salida tiene altura positiva', ok: ytw > Hw, value: `${f(P)} m` },
  ];
  return {
    outs: [
      { label: 'Profundidad al pie', value: `${f(y1, 3)} m`, kid: true },
      { label: 'Froude al pie', value: f(F1, 1) },
      { label: 'Conjugada', value: `${f(y2, 3)} m` },
      { label: 'Agua en el pozo', value: `${f(ytw, 2)} m`, kid: true },
      { label: 'Largo del pozo', value: `${f(L, 1)} m`, kid: true },
      { label: 'Altura del vertedero de salida', value: `${f(P, 2)} m`, kid: true },
      { label: 'Altura de las paredes', value: `${f(wall, 1)} m` },
      { label: 'Energía disipada en el resalto', value: `${f((((y2 - y1) ** 3 / (4 * y1 * y2)) / E1) * 100, 0)} %` },
    ],
    steps: [
      `q = ${f(q, 3)} m²/s; en la cresta yc = (q²/g)^(1/3) = ${f(yc, 3)} m; energía sobre el piso del pozo E0 = H + 1,5·yc = ${f(E0, 3)} m.`,
      `Con ${f(loss * 100, 0)} % de pérdida en la rápida, E1 = ${f(E1, 3)} m; la profundidad rápida con esa energía es y1 = ${f(y1, 4)} m (F1 = ${f(F1, 2)}).`,
      `Conjugada y2 = ${f(y2, 3)} m; con factor ${f(fs, 2)} el pozo debe tener ${f(ytw, 3)} m de agua.`,
      `Vertedero de cresta ancha: Hw = (Q/(1,70·b))^(2/3) = ${f(Hw, 3)} m → altura P = ${f(ytw, 3)} − ${f(Hw, 3)} = ${f(P, 3)} m.`,
      `Largo del resalto 6,9·(y2 − y1) = ${f(Lj, 2)} m → pozo de ${f(L, 1)} m; paredes = agua del pozo + borde libre (el mayor entre 0,5 m y 20 %) = ${f(wall, 1)} m.`,
    ],
    checks,
    kid: `Un pozo de ${f(L, 1)} m de largo con un muro de ${f(P, 2)} m al final atrapa el salto del agua.`,
  };
}

// ------------------------------------------------------------------ 3. puente

export function calcPuente(v: Vals): Result {
  const Q = num(v.Q, 30), B = num(v.B, 8), S = num(v.S, 0.3) / 100, n = num(v.n, 0.02), bp = num(v.bp, 6);
  if (Q <= 0 || B <= 0 || S <= 0 || bp <= 0 || bp > B) return { outs: [], steps: [], kid: '', error: 'Revisa los datos (la luz no puede ser mayor que el cauce).' };
  const sec: Section = { shape: 'rect', b: B, z: 0, D: 0, H: 99 };
  const yn = normalDepth(sec, n, S, Q), En = specificEnergy(sec, Q, yn);
  const qp = Q / bp, ycp = Math.cbrt(qp * qp / G), Ecp = 1.5 * ycp;
  const choke = En < Ecp;
  const yU = choke ? (alternateDepths(sec, Q, Ecp)?.sub ?? yn) : yn;
  return {
    outs: [
      { label: 'Profundidad normal (sin puente)', value: `${f(yn, 3)} m`, kid: true },
      { label: 'Energía del agua', value: `${f(En, 3)} m` },
      { label: 'Energía que pide la abertura', value: `${f(Ecp, 3)} m` },
      { label: '¿Estrangula?', value: choke ? 'sí' : 'no', kid: true },
      { label: 'Agua antes del puente', value: `${f(yU, 3)} m`, kid: true },
      { label: 'Cuánto sube', value: `${f(yU - yn, 3)} m`, kid: true },
    ],
    steps: [
      `Normal con Manning: yn = ${f(yn, 4)} m; E = yn + V²/2g = ${f(En, 4)} m.`,
      `En la abertura: q = Q/b = ${f(qp, 3)} m²/s; yc = ${f(ycp, 4)} m; Ec = 1,5·yc = ${f(Ecp, 4)} m.`,
      choke ? `Como E < Ec, el agua se represa hasta tener Ec: la profundidad lenta con esa energía es ${f(yU, 4)} m (sin pérdidas locales).` : 'Como E ≥ Ec, pasa sin represarse (sin contar pérdidas locales).',
    ],
    kid: choke ? `El puente es angosto: el agua sube ${f(yU - yn, 2)} m antes de pasar.` : 'El puente deja pasar el agua sin represarla.',
  };
}

export function prePuente(v: Vals): Result {
  const Q = num(v.Q, 40), B = num(v.B, 8), Hw = num(v.Hc, 3), S = num(v.S, 0.3) / 100, n = num(v.n, 0.02), blk = num(v.blk, 20) / 100, gal = num(v.gal, 0.6);
  if (Q <= 0 || B <= 0 || S <= 0) return { outs: [], steps: [], kid: '', error: 'Revisa los datos.' };
  const sec: Section = { shape: 'rect', b: B, z: 0, D: 0, H: 99 };
  const yn = normalDepth(sec, n, S, Q), En = specificEnergy(sec, Q, yn);
  // se prueba hasta 1,5 veces el ancho del cauce (más allá del cauce hay que ensancharlo bajo el puente)
  let span = 1.5 * B, choke = true;
  for (let b = 1; b <= 1.5 * B + 1e-9; b += 0.5) {
    const qp = Q / (b * (1 - blk));
    if (En >= 1.5 * Math.cbrt(qp * qp / G)) {
      span = b;
      choke = false;
      break;
    }
  }
  const qp = Q / (span * (1 - blk)), Ecp = 1.5 * Math.cbrt(qp * qp / G);
  if (choke && En >= Ecp) choke = false; // la última luz (1,5 veces el cauce) no cae en la grilla de 0,5 m
  const yU = choke ? (alternateDepths(sec, Q, Ecp)?.sub ?? yn) : yn;
  const soffit = ceilTo(Math.max(yU, yn) + gal, 0.1);
  const checks: Check[] = [
    { name: 'El puente no estrangula el paso (con lo tapado previsto)', ok: !choke, value: choke ? `sube ${f(yU - yn)} m` : 'no estrangula' },
    { name: 'La luz cabe en el cauce sin ensancharlo', ok: span <= B + 1e-9, value: span > B ? `hay que ensanchar a ${f(span, 1)} m` : `${f(span, 1)} m de ${f(B, 1)} m` },
    { name: 'El agua queda dentro de las paredes', ok: yU <= Hw, value: `${f(yU)} m de ${f(Hw, 1)} m` },
    { name: `Gálibo de ${f(gal, 1)} m bajo el tablero`, ok: true, value: `bajo del puente a ${f(soffit, 1)} m` },
  ];
  return {
    outs: [
      { label: 'Luz mínima del puente', value: `${f(span, 1)} m`, kid: true },
      { label: 'Altura del bajo del puente', value: `${f(soffit, 1)} m`, kid: true },
      { label: 'Agua antes del puente', value: `${f(yU, 2)} m`, kid: true },
      { label: 'Profundidad normal', value: `${f(yn, 2)} m` },
      { label: 'Energía del agua', value: `${f(En, 3)} m` },
      { label: 'Energía que pide la abertura', value: `${f(Ecp, 3)} m` },
    ],
    steps: [
      `Sin puente: yn = ${f(yn, 4)} m y E = ${f(En, 4)} m.`,
      `Se prueba la luz de 0,5 en 0,5 m (hasta 1,5 veces el cauce), descontando ${f(blk * 100, 0)} % tapado, hasta que la energía crítica de la abertura (1,5·(q²/g)^(1/3)) no supere la del agua: luz de ${f(span, 1)} m${choke ? ' (ni así alcanza: el agua se represa)' : span > B ? ' (más ancha que el cauce: hay que ensancharlo bajo el puente, con transiciones)' : ''}.`,
      `Bajo del puente = agua en el puente (${f(Math.max(yU, yn), 3)} m) + gálibo (${f(gal, 2)} m), redondeado a ${f(soffit, 1)} m.`,
    ],
    checks,
    kid: `Un puente de ${f(span, 1)} m de luz con el bajo a ${f(soffit, 1)} m deja pasar la creciente.`,
  };
}

// ------------------------------------------------------------------ 4. alcantarilla

export function calcAlcantarilla(v: Vals): Result {
  const Q = num(v.Q, 5), D = num(v.D, 1.2), L = num(v.L, 30), S = num(v.S, 1) / 100, tw = num(v.tw, 0.5), inlet: Inlet = typeof v.entrada === 'string' && v.entrada in INLETS ? (v.entrada as Inlet) : 'muro';
  if (Q <= 0 || D <= 0 || L <= 0) return { outs: [], steps: [], kid: '', error: 'Revisa los datos.' };
  const i = inletHW(Q, D, S, inlet), o = outletHW(Q, D, L, S, tw, inlet);
  const hw = Math.max(i.hw, o.hw), ctrl = i.hw >= o.hw ? 'entrada' : 'salida';
  return {
    outs: [
      { label: 'Agua a la entrada', value: `${f(hw, 3)} m`, kid: true },
      { label: 'Veces el diámetro', value: f(hw / D), kid: true },
      { label: 'Manda', value: `la ${ctrl}`, kid: true },
      { label: 'Control a la entrada', value: `${f(i.hw, 3)} m` },
      { label: 'Control a la salida', value: `${f(o.hw, 3)} m` },
      { label: 'Ku·Q/(A·D^0,5)', value: f(i.X, 2) },
    ],
    steps: [
      `Entrada (${INLETS[inlet].name.toLowerCase()}): X = Ku·Q/(A·D^0,5) = ${f(i.X, 3)}; ${i.regime === 'libre' ? 'sin ahogar (forma 1)' : i.regime === 'sumergida' ? 'ahogada' : 'transición'} → HWi = ${f(i.hw, 3)} m.`,
      `Salida: H = [1 + ${INLETS[inlet].ke} + 2g·n²·L/R^(4/3)]·V²/2g = ${f(o.H, 3)} m; ho = ${f(o.ho, 3)} m; HWo = H + ho − L·S = ${f(o.hw, 3)} m.`,
      `Manda el mayor: ${f(hw, 3)} m (control a la ${ctrl}).`,
    ],
    kid: `El agua sube ${f(hw, 2)} m antes de entrar al tubo (${f(hw / D, 1)} veces su diámetro).`,
  };
}

export const PIPES = [0.6, 0.8, 0.9, 1.0, 1.2, 1.4, 1.5, 1.8, 2.0, 2.4, 2.7, 3.0];

export function preAlcantarilla(v: Vals): Result {
  const Q = num(v.Q, 8), L = num(v.L, 30), S = num(v.S, 1) / 100, tw = num(v.tw, 0.5), road = num(v.road, 4), inlet: Inlet = typeof v.entrada === 'string' && v.entrada in INLETS ? (v.entrada as Inlet) : 'muro';
  const hwd = num(v.hwd, CULVERT_RULES.hwd), free = num(v.free, CULVERT_RULES.free), vmax = num(v.vmax, CULVERT_RULES.vout);
  if (Q <= 0 || L <= 0) return { outs: [], steps: [], kid: '', error: 'Revisa los datos.' };
  const options: { D: number; nb: number; hw: number; V: number; ctrl: string; area: number }[] = [];
  for (const D of PIPES)
    for (let nb = 1; nb <= 3; nb++) {
      const q = Q / nb;
      const i = inletHW(q, D, S, inlet), o = outletHW(q, D, L, S, tw, inlet);
      const hw = Math.max(i.hw, o.hw);
      const sec: Section = { shape: 'circ', b: 0, z: 0, D, H: D };
      const yn = S > 0 ? normalDepth(sec, N_PIPE, S, q) : NaN;
      const yc = criticalDepth(sec, q);
      const yOut = i.hw >= o.hw ? (Number.isNaN(yn) ? D : Math.min(D, yn)) : tw >= D ? D : Math.min(D, Math.max(yc, tw));
      const A = yOut >= D * 0.999 ? (Math.PI * D * D) / 4 : geom(sec, yOut).A;
      const V = q / A;
      if (hw / D <= hwd && road - hw >= free && V <= vmax) options.push({ D, nb, hw, V, ctrl: i.hw >= o.hw ? 'entrada' : 'salida', area: nb * D * D });
    }
  options.sort((a, b) => a.area - b.area || a.nb - b.nb);
  const best = options[0];
  if (!best) return { outs: [], steps: [`Se probaron ${PIPES.length} diámetros (0,6 a 3,0 m) con 1 a 3 tubos: ninguno cumple.`], kid: 'Ningún tubo alcanza: hace falta un puente o un cajón más grande.', error: 'Ninguna combinación de 1 a 3 tubos de 0,6 a 3,0 m cumple: considera un puente, un cajón o subir la vía.' };
  return {
    outs: [
      { label: 'Tubos', value: `${best.nb} de ${f(best.D, 1)} m`, kid: true },
      { label: 'Agua a la entrada', value: `${f(best.hw, 2)} m (${f(best.hw / best.D)} D)`, kid: true },
      { label: 'Bajo la vía quedan', value: `${f(road - best.hw, 2)} m`, kid: true },
      { label: 'Velocidad a la salida', value: `${f(best.V, 2)} m/s` },
      { label: 'Control', value: `a la ${best.ctrl}` },
      { label: 'Otras opciones que cumplen', value: `${options.length - 1}` },
    ],
    steps: [
      `Se probaron ${PIPES.length} diámetros comerciales (0,6 a 3,0 m) con 1, 2 y 3 tubos; para cada uno, el nivel a la entrada es el mayor entre el control a la entrada y a la salida (HDS-5).`,
      `Criterios: HW ≤ ${f(hwd, 2)} D, al menos ${f(free, 2)} m bajo la vía y velocidad a la salida ≤ ${f(vmax, 1)} m/s.`,
      `Cumplen ${options.length} combinaciones (la escogida y ${options.length - 1} más); se escoge la de menor área de tubo: ${best.nb} × ${f(best.D, 1)} m.`,
    ],
    checks: [
      { name: `HW ≤ ${f(hwd, 1)} D`, ok: best.hw / best.D <= hwd, value: `${f(best.hw / best.D)} D` },
      { name: `Al menos ${f(free, 1)} m bajo la vía`, ok: road - best.hw >= free, value: `${f(road - best.hw)} m` },
      { name: `Salida ≤ ${f(vmax, 1)} m/s`, ok: best.V <= vmax, value: `${f(best.V)} m/s` },
    ],
    kid: `${best.nb === 1 ? 'Un tubo' : `${best.nb} tubos`} de ${f(best.D, 1)} m deja${best.nb === 1 ? '' : 'n'} pasar la creciente sin que el agua llegue a la vía.`,
  };
}

// ------------------------------------------------------------------ 5. sedimentos

export function calcSedimento(v: Vals): Result {
  const d = num(v.d, 10) / 1000, h = num(v.h, 1), S = num(v.S, 0.4) / 100, b = num(v.b, 10);
  if (d <= 0 || h <= 0 || S <= 0 || b <= 0) return { outs: [], steps: [], kid: '', error: 'Revisa los datos.' };
  const R = (b * h) / (b + 2 * h), tau = RHO * G * R * S, us = Math.sqrt(tau / RHO);
  const th = tau / ((RHO_S - RHO) * G * d), thc = shieldsCrit(d), w = fallVelocity(d), P = w / (KAPPA * us);
  const mode: Mode = th < thc && P > 0.8 ? 'quieto' : P > 2.5 ? 'fondo' : P > 1.2 ? 'mixto' : P > 0.8 ? 'suspension' : 'lavado';
  const qs = bedloadStar(th, thc), qb = qs * Math.sqrt((SG - 1) * G * d ** 3);
  return {
    outs: [
      { label: '¿Se mueve?', value: th >= thc ? 'sí' : 'no', kid: true },
      { label: 'Qué hace el grano', value: MODE_NAME[mode], kid: true },
      { label: 'Esfuerzo en el fondo', value: `${f(tau, 2)} Pa` },
      { label: 'Shields θ', value: f(th, 4) },
      { label: 'Umbral θcr', value: f(thc, 4) },
      { label: 'Velocidad de caída', value: `${f(w, 5)} m/s` },
      { label: 'Número de Rouse', value: f(P, 2) },
      { label: 'Arrastre por metro de ancho', value: `${(qb * 1000).toLocaleString('es-CO', { maximumSignificantDigits: 3 })} L/s·m` },
      { label: 'Arrastre del cauce', value: `${Math.round(qb * b * 86400 * RHO_S / 1000).toLocaleString('es-CO')} t/día`, kid: true },
    ],
    steps: [
      `R = b·h/(b + 2h) = ${f(R, 4)} m; τ = ρ·g·R·S = ${f(tau, 3)} Pa; u* = √(τ/ρ) = ${f(us, 4)} m/s.`,
      `θ = τ/((ρs − ρ)·g·d) = ${f(th, 4)}; D* = ${f(dStar(d), 2)} → θcr = ${f(thc, 4)} (Soulsby y Whitehouse).`,
      `w = ${f(w, 5)} m/s (Ferguson y Church); Rouse P = w/(0,4·u*) = ${f(P, 3)}.`,
      `q* = 3,97·(θ − θcr)^1,5 = ${f(qs, 4)}; qb = q*·√((s − 1)·g·d³) = ${qb.toExponential(3).replace('.', ',')} m²/s.`,
    ],
    kid: th >= thc ? `El agua mueve este grano: ${MODE_NAME[mode]}.` : 'El agua no alcanza a mover este grano.',
  };
}

export const RIPRAP_CLASSES = [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 1.0];

export function preEnrocado(v: Vals): Result {
  const Q = num(v.Q, 50), b = num(v.b, 10), S = num(v.S, 1) / 100, n = num(v.n, 0.035), fs = num(v.fs, RIPRAP.fs);
  if (Q <= 0 || b <= 0 || S <= 0) return { outs: [], steps: [], kid: '', error: 'Revisa los datos.' };
  const sec: Section = { shape: 'rect', b, z: 0, D: 0, H: 99 };
  const h = normalDepth(sec, n, S, Q), R = (b * h) / (b + 2 * h), tau = RHO * G * R * S;
  const d = (fs * tau) / ((RHO_S - RHO) * G * RIPRAP.theta);
  const cls = RIPRAP_CLASSES.find((c) => c >= d);
  const D50 = cls ?? d;
  const W = (RHO_S * Math.PI * D50 ** 3) / 6;
  return {
    outs: [
      { label: 'Piedra necesaria (d50)', value: `${f(d * 100, 1)} cm`, kid: true },
      { label: 'Piedra escogida', value: cls ? `${f(cls * 100, 0)} cm` : 'más de 1 m', kid: true },
      { label: 'Peso de una piedra media', value: `${f(W, 0)} kg`, kid: true },
      { label: 'Espesor de la capa (2·d50)', value: `${f(2 * D50, 2)} m` },
      { label: 'Profundidad del agua', value: `${f(h, 2)} m` },
      { label: 'Esfuerzo en el fondo', value: `${f(tau, 1)} Pa` },
    ],
    steps: [
      `Profundidad normal con n = ${f(n, 3)}: h = ${f(h, 3)} m; R = ${f(R, 3)} m; τ = ρ·g·R·S = ${f(tau, 2)} Pa.`,
      `Shields para piedra gruesa con factor de seguridad: d50 = FS·τ/((ρs − ρ)·g·θc) = ${f(fs, 2)}·${f(tau, 1)}/(1650·9,81·${RIPRAP.theta}) = ${f(d, 3)} m.`,
      `Se escoge la clase comercial siguiente: ${cls ? `${f(cls * 100, 0)} cm` : 'ninguna (más de 1 m)'}; capa de 2·d50 = ${f(2 * D50, 2)} m; piedra media de ${f(W, 0)} kg.`,
    ],
    checks: [{ name: 'Existe una clase de piedra de 1 m o menos', ok: !!cls, value: `${f(d * 100, 1)} cm` }],
    kid: `Hacen falta piedras de unos ${f(D50 * 100, 0)} cm (${f(W, 0)} kg cada una) para que el agua no las arrastre.`,
  };
}

// ------------------------------------------------------------------ 6. aforo

export function calcAforo(v: Vals): Result {
  const tipo = (v.tipo as string) ?? 'rect';
  const H = num(v.H, 10) / 100;
  if (tipo === 'gate') {
    const a = num(v.a, 5) / 100, y1 = num(v.y1, 30) / 100, b = num(v.b, 30) / 100;
    if (a <= 0 || y1 <= a || b <= 0) return { outs: [], steps: [], kid: '', error: 'La profundidad aguas arriba debe ser mayor que la abertura.' };
    // caudal con energía igual antes y en la vena (Cc = 0,61)
    const y2 = FLUME.Cc * a;
    const q = Math.sqrt((2 * G * (y1 - y2)) / (1 / (y2 * y2) - 1 / (y1 * y1)));
    const Q = q * b, Cd = Q / (a * b * Math.sqrt(2 * G * y1));
    return {
      outs: [
        { label: 'Caudal', value: `${f(Q * 1000, 2)} L/s`, kid: true },
        { label: 'Coeficiente de descarga', value: f(Cd, 3) },
        { label: 'Vena contraída', value: `${f(y2 * 100, 2)} cm` },
      ],
      steps: [`Vena contraída y2 = 0,61·a = ${f(y2 * 100, 2)} cm.`, `Energía igual: y1 + q²/(2g·y1²) = y2 + q²/(2g·y2²) → q = ${f(q, 5)} m²/s; Q = q·b = ${f(Q * 1000, 3)} L/s; Cd = Q/(a·b·√(2g·y1)) = ${f(Cd, 3)}.`],
      kid: `Pasan unos ${f(Q * 1000, 1)} litros por segundo.`,
    };
  }
  if (H <= 0) return { outs: [], steps: [], kid: '', error: 'La carga debe ser mayor que cero.' };
  if (tipo === 'tri') {
    const ang = num(v.ang, 90);
    const Q = (8 / 15) * FLUME.triCd * Math.sqrt(2 * G) * Math.tan(((ang / 2) * Math.PI) / 180) * Math.pow(H, 2.5);
    return {
      outs: [{ label: 'Caudal', value: `${f(Q * 1000, 2)} L/s`, kid: true }],
      steps: [`Q = (8/15)·Cd·√(2g)·tan(θ/2)·H^2,5 con Cd = ${FLUME.triCd} y θ = ${f(ang, 0)}°: ${f(Q * 1000, 3)} L/s.`],
      kid: `Pasan unos ${f(Q * 1000, 1)} litros por segundo.`,
    };
  }
  const b = num(v.b, 30) / 100, P = num(v.P, 15) / 100;
  const Q = rectWeirQ(H, b, P), Cd = 0.611 + (0.08 * H) / P;
  return {
    outs: [
      { label: 'Caudal', value: `${f(Q * 1000, 2)} L/s`, kid: true },
      { label: 'Coeficiente Cd', value: f(Cd, 4) },
    ],
    steps: [`Rehbock: Cd = 0,611 + 0,08·H/P = ${f(Cd, 4)}; Q = (2/3)·Cd·b·√(2g)·H^1,5 = ${f(Q * 1000, 3)} L/s.`],
    kid: `Pasan unos ${f(Q * 1000, 1)} litros por segundo.`,
  };
}

export function preAforador(v: Vals): Result {
  const qmin = num(v.qmin, 2) / 1000, qmax = num(v.qmax, 20) / 1000, b = num(v.b, 30) / 100, Hc = num(v.Hc, 45) / 100, P = num(v.P, 15) / 100;
  if (qmin <= 0 || qmax <= qmin || b <= 0) return { outs: [], steps: [], kid: '', error: 'El caudal máximo debe ser mayor que el mínimo.' };
  const invRect = (Q: number) => {
    let lo = 0, hi = 2;
    for (let k = 0; k < 80; k++) {
      const m = (lo + hi) / 2;
      if (rectWeirQ(m, b, P) < Q) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  const invTri = (Q: number) => Math.pow(Q / triWeirQ(1), 0.4);
  const r1 = invRect(qmin), r2 = invRect(qmax);
  const t1 = invTri(qmin), t2 = invTri(qmax);
  const Pt = 0.08;
  const okR = r1 >= 0.03 && P + r2 <= Hc - 0.05 && r2 / P <= 1;
  const okT = t1 >= 0.06 && Pt + t2 <= Hc - 0.05 && 2 * t2 <= b;
  const pick = okT && (!okR || qmax <= 0.03) ? 'triangular de 90°' : okR ? 'rectangular' : okT ? 'triangular de 90°' : 'ninguno';
  return {
    outs: [
      { label: 'Recomendado', value: pick, kid: true },
      { label: 'Rectangular: carga', value: `${f(r1 * 100, 1)} a ${f(r2 * 100, 1)} cm` },
      { label: 'Triangular: carga', value: `${f(t1 * 100, 1)} a ${f(t2 * 100, 1)} cm` },
      { label: 'Agua máxima (rectangular)', value: `${f((P + r2) * 100, 1)} cm` },
      { label: 'Agua máxima (triangular)', value: `${f((Pt + t2) * 100, 1)} cm` },
    ],
    steps: [
      `Rectangular (P = ${f(P * 100, 0)} cm, b = ${f(b * 100, 0)} cm): carga de ${f(r1 * 100, 2)} a ${f(r2 * 100, 2)} cm; pide H ≥ 3 cm, H/P ≤ 1 y que el agua quede 5 cm bajo el borde.`,
      `Triangular de 90° (vértice a 8 cm): carga de ${f(t1 * 100, 2)} a ${f(t2 * 100, 2)} cm; pide H ≥ 6 cm (USBR), que el triángulo quepa en el ancho y 5 cm bajo el borde.`,
      'Si los dos sirven y el caudal máximo es pequeño (30 L/s o menos), se prefiere el triangular: con poca agua da cargas más altas y fáciles de leer.',
    ],
    checks: [
      { name: 'Rectangular sirve en todo el rango', ok: okR, value: okR ? 'sí' : 'no' },
      { name: 'Triangular sirve en todo el rango', ok: okT, value: okT ? 'sí' : 'no' },
    ],
    kid: pick === 'ninguno' ? 'Ninguno sirve para todo el rango: divide el rango o cambia el canal.' : `Para medir entre ${f(qmin * 1000, 1)} y ${f(qmax * 1000, 1)} L/s, usa el vertedero ${pick}.`,
  };
}

export { gateUpstream, specificEnergy };

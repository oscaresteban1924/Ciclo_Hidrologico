// Herramientas de diseño avanzadas (nivel universitario, con frase para niños): funciones puras que reciben los
// datos del formulario y devuelven resultados, pasos con las fórmulas y los números, y verificaciones. Usan los
// cálculos de `advanced.ts`. Son prediseños académicos: no son diseños de ingeniería.

import { BEDFORM_NAME, PARSHALL, PIERS, contractionScour, hortonN, laneK, lanePermissible, midSection, parshallH, parshallQ, pierScour, transport, usbrBasin, yarnell, type ParshallSize, type PierShape } from './advanced';
import { G, alternateDepths, belanger, geom, manningQ, normalDepth, type Section } from './hydraulics';
import { bedN } from './sediment';
import { favreSurge, stoker } from './unsteady';
import { f, type Check, type Result, type Vals } from './designCalc';

const GAMMA = 9810;
const num = (v: number | string | undefined, def = 0) => {
  if (v === undefined) return def; // dato ausente: el valor de ejemplo (un campo vacío sigue siendo 0 y se avisa)
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : def;
};
const ceilTo = (v: number, s: number) => Math.ceil(v / s - 1e-9) * s;
const bad = (error: string): Result => ({ outs: [], steps: [], kid: '', error });

// ------------------------------------------------------------------ canal: rugosidad compuesta

export function calcRugosidad(v: Vals): Result {
  const b = num(v.b, 3), z = v.forma === 'rect' ? 0 : num(v.z, 1.5), y = num(v.y, 1), nb = num(v.nb, 0.03), nw = num(v.nw, 0.014), S = num(v.S, 0.1) / 100;
  if (b <= 0 || y <= 0 || nb <= 0 || nw <= 0 || S <= 0) return bad('Revisa los datos: todos deben ser mayores que cero.');
  const Pb = b, Pw = 2 * y * Math.sqrt(1 + z * z);
  const n = hortonN([{ P: Pb, n: nb }, { P: Pw, n: nw }]);
  const sec: Section = { shape: z > 0 ? 'trap' : 'rect', b, z, D: 0, H: 99 };
  const Q = manningQ(sec, n, S, y);
  const g = geom(sec, y);
  return {
    outs: [
      { label: 'n equivalente', value: f(n, 4), kid: true },
      { label: 'Caudal con esa profundidad', value: `${f(Q, 2)} m³/s`, kid: true },
      { label: 'Velocidad media', value: `${f(Q / g.A, 2)} m/s` },
      { label: 'Perímetro del fondo / de las paredes', value: `${f(Pb, 2)} m / ${f(Pw, 2)} m` },
    ],
    steps: [
      `Perímetro del fondo Pf = b = ${f(Pb, 3)} m; de las dos paredes Pp = 2·y·√(1 + z²) = ${f(Pw, 3)} m.`,
      `Horton y Einstein (cada parte del perímetro aporta con su propia velocidad): n = [(Pf·nf^1,5 + Pp·np^1,5)/P]^(2/3) = [(${f(Pb, 2)}·${f(nb, 3)}^1,5 + ${f(Pw, 2)}·${f(nw, 3)}^1,5)/${f(Pb + Pw, 2)}]^(2/3) = ${f(n, 4)}.`,
      `Manning con A = ${f(g.A, 3)} m², R = ${f(g.A / g.P, 3)} m y S = ${f(S * 100, 3)} %: Q = ${f(Q, 3)} m³/s.`,
    ],
    kid: `Con el fondo de n ${f(nb, 3)} y las paredes de n ${f(nw, 3)}, el canal se comporta como uno de n ${f(n, 3)}: lleva ${f(Q, 1)} m³/s.`,
  };
}

// ------------------------------------------------------------------ canal: prediseño en tierra (fuerza tractiva)

export function preCanalTierra(v: Vals): Result {
  const Q = num(v.Q, 5), S = num(v.S, 0.15) / 100, d75 = num(v.d75, 25), phi = num(v.phi, 33), z = num(v.z, 2), n = num(v.n, 0.025), fb = num(v.fb, 20) / 100;
  if (Q <= 0 || S <= 0 || d75 <= 0 || n <= 0 || z <= 0) return bad('Revisa los datos: todos deben ser mayores que cero.');
  if (d75 < 6) return bad('El método de Lane con esfuerzo permisible 0,754·d75 es para material grueso (d75 de 6 mm o más). Para arena o suelos cohesivos se usan otras tablas.');
  const K = laneK(z, phi);
  if (K <= 0) return bad(`Con talud ${f(z, 1)}:1 la orilla es más empinada que el ángulo de reposo (${f(phi, 0)}°): las piedras rodarían. Usa un talud más tendido.`);
  const tpB = lanePermissible(d75), tpS = K * tpB;
  const yB = tpB / (0.97 * GAMMA * S), yS = tpS / (0.75 * GAMMA * S);
  const y = Math.min(yB, yS);
  const sec = (b: number): Section => ({ shape: 'trap', b, z, D: 0, H: 99 });
  if (manningQ(sec(400), n, S, y) < Q) return bad('Ni con 400 m de ancho cabe ese caudal sin pasar del esfuerzo permisible: el material es muy fino para esa pendiente.');
  let lo = 0.05, hi = 400;
  for (let k = 0; k < 80; k++) {
    const m = (lo + hi) / 2;
    if (manningQ(sec(m), n, S, y) >= Q) hi = m;
    else lo = m;
  }
  const b = ceilTo(hi, 0.1);
  const yn = normalDepth(sec(b), n, S, Q);
  const g = geom(sec(b), yn);
  const V = Q / g.A;
  const tb = 0.97 * GAMMA * yn * S, ts = 0.75 * GAMMA * yn * S;
  const H = ceilTo(Math.max(yn * (1 + fb), yn + 0.15), 0.05);
  const checks: Check[] = [
    { name: `Fondo: esfuerzo 0,97·γ·y·S ≤ τp = ${f(tpB, 1)} Pa`, ok: tb <= tpB * 1.0001, value: `${f(tb, 1)} Pa` },
    { name: `Taludes: esfuerzo 0,75·γ·y·S ≤ K·τp = ${f(tpS, 1)} Pa`, ok: ts <= tpS * 1.0001, value: `${f(ts, 1)} Pa` },
    { name: 'Canal ancho (b/y ≥ 4, rango de los coeficientes de Lane)', ok: b / yn >= 4, value: `b/y = ${f(b / yn, 1)}` },
  ];
  return {
    outs: [
      { label: 'Ancho del fondo', value: `${f(b, 1)} m`, kid: true },
      { label: 'Profundidad del agua', value: `${f(yn, 2)} m`, kid: true },
      { label: 'Altura del canal (con borde libre)', value: `${f(H, 2)} m`, kid: true },
      { label: 'Ancho arriba', value: `${f(b + 2 * z * H, 1)} m` },
      { label: 'Velocidad media', value: `${f(V, 2)} m/s`, kid: true },
      { label: 'Razón de fuerza tractiva K', value: f(K, 3) },
      { label: 'Esfuerzo permisible fondo / taludes', value: `${f(tpB, 1)} / ${f(tpS, 1)} Pa` },
    ],
    steps: [
      `Ángulo del talud θ = arctan(1/${f(z, 1)}) = ${f((Math.atan(1 / z) * 180) / Math.PI, 1)}°. Lane: K = √(1 − sen²θ/sen²φ) = ${f(K, 3)} con φ = ${f(phi, 0)}°.`,
      `Esfuerzo permisible del fondo (material grueso) τp = 0,754·d75 = 0,754·${f(d75, 0)} = ${f(tpB, 1)} Pa; en los taludes K·τp = ${f(tpS, 1)} Pa.`,
      `Profundidad máxima por el fondo: y = τp/(0,97·γ·S) = ${f(yB, 3)} m; por los taludes: y = K·τp/(0,75·γ·S) = ${f(yS, 3)} m. Manda la menor: ${f(y, 3)} m.`,
      `Ancho para llevar ${f(Q, 2)} m³/s con esa profundidad (Manning, n = ${f(n, 3)}): b = ${f(hi, 2)} m, redondeado a ${f(b, 1)} m; la profundidad normal queda en ${f(yn, 3)} m.`,
      `Altura del canal con ${f(fb * 100, 0)} % de borde libre (al menos 0,15 m): ${f(H, 2)} m.`,
    ],
    checks,
    data: { b, z, y: yn, H, Q, n, S },
    kid: `Un canal de tierra con piedras de ${f(d75, 0)} mm aguanta si el fondo mide ${f(b, 1)} m y el agua va a ${f(yn, 2)} m de hondo.`,
  };
}

// ------------------------------------------------------------------ resalto: pozo USBR

export function prePozoUSBR(v: Vals): Result {
  const Q = num(v.Q, 12), b = num(v.b, 4), H = num(v.H, 6), loss = num(v.loss, 10) / 100, tw = num(v.tw, 2.2);
  if (Q <= 0 || b <= 0 || H <= 0 || tw < 0) return bad('Revisa los datos.');
  const q = Q / b, yc = Math.cbrt((q * q) / G);
  const sec: Section = { shape: 'rect', b, z: 0, D: 0, H: 99 };
  // se baja el piso del pozo lo necesario para tener el agua que pide el tipo de pozo (unas pasadas)
  let drop = 0, y1 = 0, V1 = 0, F1 = 0, y2 = 0;
  let des = usbrBasin(1, 1, 1, 1, q);
  for (let k = 0; k < 8; k++) {
    const E1 = (H + drop + 1.5 * yc) * (1 - loss);
    const alt = alternateDepths(sec, Q, E1);
    if (!alt) return bad('Con esa caída no hay energía suficiente.');
    y1 = alt.sup;
    V1 = q / y1;
    F1 = V1 / Math.sqrt(G * y1);
    y2 = belanger(y1, F1);
    des = usbrBasin(y1, V1, F1, y2, q);
    const need = Math.max(0, des.twMin - tw);
    if (Math.abs(need - drop) < 0.005) break;
    drop = need;
  }
  const floorDrop = ceilTo(drop, 0.05);
  const L = ceilTo(des.L, 0.5);
  const wall = ceilTo(Math.max(tw + floorDrop, des.twMin) + Math.max(0.6, 0.25 * y2), 0.1);
  const outs = [
    { label: 'Tipo de pozo', value: `USBR tipo ${des.type}`, kid: true },
    { label: 'Largo del pozo', value: `${f(L, 1)} m (${f(des.LperY2, 1)}·y2)`, kid: true },
    { label: 'Bajar el piso del pozo', value: floorDrop > 0 ? `${f(floorDrop, 2)} m` : 'no hace falta', kid: true },
    { label: 'Al pie: y1, V1, F1', value: `${f(y1, 3)} m, ${f(V1, 1)} m/s, ${f(F1, 2)}` },
    { label: 'Conjugada y2', value: `${f(y2, 2)} m` },
    { label: 'Agua mínima a la salida', value: `${f(des.twMin, 2)} m` },
    { label: 'Paredes', value: `${f(wall, 1)} m` },
    { label: 'Largo de un resalto libre', value: `${f(des.Lfree, 1)} m` },
  ];
  if (des.chute) outs.push({ label: des.type === 'IV' ? 'Deflectores (alto, ancho, separación)' : 'Dados de entrada (alto, ancho, separación)', value: `${f(des.chute.h, 2)}, ${f(des.chute.w, 2)}, ${f(des.chute.s, 2)} m` });
  if (des.baffle) outs.push({ label: 'Bloques amortiguadores (alto, ancho, a qué distancia del pie)', value: `${f(des.baffle.h, 2)}, ${f(des.baffle.w, 2)} m, a ${f(des.baffle.x, 2)} m` });
  if (des.sill.h > 0) outs.push({ label: des.sill.dentated ? 'Umbral dentado' : 'Umbral macizo (talud 2:1)', value: `${f(des.sill.h, 2)} m de alto` });
  const checks: Check[] = [
    { name: 'El agua de abajo alcanza la que pide el pozo', ok: tw + floorDrop >= des.twMin - 1e-6, value: `${f(tw + floorDrop, 2)} m de ${f(des.twMin, 2)} m` },
    { name: 'El pozo con accesorios es más corto que el resalto libre', ok: des.type === 'I' || des.L < des.Lfree, value: `${f(des.L, 1)} m frente a ${f(des.Lfree, 1)} m` },
    { name: 'Fuera del resalto oscilante (F1 de 2,5 a 4,5) o con pozo tipo IV', ok: !(F1 > 2.5 && F1 < 4.5) || des.type === 'IV', value: `F1 = ${f(F1, 2)}` },
  ];
  return {
    outs,
    steps: [
      `q = Q/b = ${f(q, 3)} m²/s; crítica en la cresta yc = ${f(yc, 3)} m; energía sobre el piso del pozo E0 = H + Δ + 1,5·yc, con ${f(loss * 100, 0)} % de pérdida en la rápida.`,
      `Al pie: y1 = ${f(y1, 4)} m, V1 = ${f(V1, 2)} m/s, F1 = ${f(F1, 2)}; conjugada de Bélanger y2 = (y1/2)(√(1 + 8F1²) − 1) = ${f(y2, 3)} m.`,
      `Tipo ${des.type}: ${des.why} (Peterka; Design of Small Dams, USBR).`,
      des.type === 'III'
        ? `Proporciones del tipo III: dados de y1 = ${f(y1, 3)} m; bloques de h3 = y1·(4 + F1)/6 = ${f(des.baffle!.h, 3)} m a 0,8·y2 = ${f(des.baffle!.x, 2)} m del pie; umbral h4 = y1·(18 + F1)/18 = ${f(des.sill.h, 3)} m; largo ≈ 2,7·y2.`
        : des.type === 'II'
          ? `Proporciones del tipo II: dados de y1; umbral dentado de 0,2·y2 = ${f(des.sill.h, 3)} m; largo ≈ 4,3·y2; agua a la salida 1,05·y2.`
          : des.type === 'IV'
            ? `Proporciones del tipo IV: deflectores de 2·y1 = ${f(2 * y1, 3)} m; largo ≈ 6·y2; agua a la salida 1,1·y2 para que el resalto no se corra.`
            : `Tipo I: pozo liso con el largo del resalto libre, 6,9·(y2 − y1).`,
      floorDrop > 0
        ? `El agua de abajo (${f(tw, 2)} m) no alcanza los ${f(des.twMin, 2)} m: se baja el piso ${f(floorDrop, 2)} m (la caída crece, y se recalculan y1 e y2).`
        : `El agua de abajo (${f(tw, 2)} m) alcanza lo que pide el pozo: no hace falta bajar el piso.`,
    ],
    checks,
    data: { drop: H + floorDrop, L, y1, y2, tw: tw + floorDrop, type: des.type, ch: des.chute?.h ?? 0, cw: des.chute?.w ?? 0, bh: des.baffle?.h ?? 0, bx: des.baffle?.x ?? 0, sill: des.sill.h },
    kid: `Un pozo tipo ${des.type} de ${f(L, 1)} m${des.baffle ? ' con bloques en el piso' : ''} atrapa el resalto${floorDrop > 0 ? `, si bajamos el piso ${f(floorDrop, 2)} m` : ''}.`,
  };
}

// ------------------------------------------------------------------ puente: pilas (Yarnell y socavación local)

export function calcPilas(v: Vals): Result {
  const Q = num(v.Q, 60), B = num(v.B, 20), y3 = num(v.y3, 2.5), np = Math.round(num(v.np, 2)), a = num(v.a, 1), Lp = num(v.Lp, 6), skew = num(v.skew, 0), K3 = num(v.K3, 1.1);
  const shape: PierShape = typeof v.pila === 'string' && v.pila in PIERS ? (v.pila as PierShape) : 'semicircular';
  if (Q <= 0 || B <= 0 || y3 <= 0 || a <= 0 || np < 1) return bad('Revisa los datos.');
  if (np * a >= B) return bad('Las pilas taparían todo el cauce.');
  const P = PIERS[shape];
  const V3 = Q / (B * y3), F3 = V3 / Math.sqrt(G * y3);
  const alpha = (np * a) / B;
  const dy = yarnell(P.K, y3, V3, alpha);
  const y1 = y3 + dy, V1 = Q / (B * y1);
  const sc = pierScour(a, y1, V1, P.K1, { L: Lp, skew, K3 });
  const checks: Check[] = [
    { name: 'Flujo lento aguas abajo (Yarnell vale para la clase A)', ok: F3 < 1, value: `F3 = ${f(F3, 2)}` },
    { name: 'Las pilas tapan menos de la mitad del cauce (rango de Yarnell)', ok: alpha <= 0.5, value: `α = ${f(alpha, 3)}` },
  ];
  return {
    outs: [
      { label: 'El agua sube antes del puente', value: `${f(dy * 100, 1)} cm`, kid: true },
      { label: 'Hueco que excava el agua junto a cada pila', value: `${f(sc.ys, 2)} m`, kid: true },
      { label: 'Fondo del hueco bajo la superficie', value: `${f(y1 + sc.ys, 2)} m` },
      { label: 'Froude aguas abajo / en la pila', value: `${f(F3, 2)} / ${f(sc.Fr, 2)}` },
      { label: 'Fracción tapada α', value: f(alpha, 3) },
      { label: 'K de Yarnell, K1, K2, K3', value: `${P.K}, ${P.K1}, ${f(sc.K2, 2)}, ${f(K3, 1)}` },
    ],
    steps: [
      `Aguas abajo: V3 = Q/(B·y3) = ${f(V3, 3)} m/s; F3 = ${f(F3, 3)}; α = n·a/B = ${np}·${f(a, 2)}/${f(B, 1)} = ${f(alpha, 3)}.`,
      `Yarnell (${P.name.toLowerCase()}, K = ${P.K}): Δy = K·F3²·(K + 5·F3² − 0,6)·(α + 15·α⁴)·y3 = ${f(dy, 4)} m.`,
      `Socavación local HEC-18: ys = 2,0·K1·K2·K3·y1·(a/y1)^0,65·Fr1^0,43, con y1 = ${f(y1, 3)} m y Fr1 = ${f(sc.Fr, 3)}: ys = ${f(sc.ys, 3)} m${sc.capped ? ` (tope de ${sc.Fr <= 0.8 ? '2,4' : '3,0'}·a para pila redonda alineada)` : ''}.`,
      `K2 = (cos θ + L/a·sen θ)^0,65 = ${f(sc.K2, 3)} con θ = ${f(skew, 0)}° y L/a = ${f(Lp / a, 1)}.`,
    ],
    checks,
    kid: `Las pilas suben el agua ${f(dy * 100, 0)} cm y el agua cava un hueco de ${f(sc.ys, 1)} m junto a cada una: la cimentación tiene que ir más abajo.`,
  };
}

// ------------------------------------------------------------------ puente: socavación por contracción

export function calcContraccion(v: Vals): Result {
  const Q = num(v.Q, 120), W1 = num(v.W1, 40), W2 = num(v.W2, 25), y1 = num(v.y1, 2.5), y0 = num(v.y0, 2.5), d50 = num(v.d50, 2) / 1000, S = num(v.S, 0.2) / 100;
  if (Q <= 0 || W1 <= 0 || W2 <= 0 || y1 <= 0 || y0 <= 0 || d50 <= 0 || S <= 0) return bad('Revisa los datos.');
  if (W2 > W1) return bad('El ancho bajo el puente no puede ser mayor que el del cauce aguas arriba.');
  const c = contractionScour(Q, W1, W2, y1, y0, d50, S);
  return {
    outs: [
      { label: 'Tipo', value: c.live ? 'lecho vivo (el fondo ya se mueve)' : 'agua clara (el fondo no se mueve aguas arriba)', kid: true },
      { label: 'Profundidad bajo el puente después de socavar', value: `${f(c.y2, 2)} m` },
      { label: 'Socavación por contracción', value: `${f(c.ys, 2)} m`, kid: true },
      { label: 'Velocidad aguas arriba / crítica', value: `${f(c.V1, 2)} / ${f(c.Vc, 2)} m/s` },
    ],
    steps: [
      `Velocidad aguas arriba V1 = Q/(W1·y1) = ${f(c.V1, 3)} m/s; velocidad crítica del lecho Vc = 6,19·y1^(1/6)·D50^(1/3) = ${f(c.Vc, 3)} m/s → ${c.live ? 'lecho vivo' : 'agua clara'}.`,
      c.live
        ? `Lecho vivo (Laursen modificada, todo el caudal pasa por el puente): y2 = y1·(W1/W2)^k1 con k1 = ${c.k1} (según u*/ω) = ${f(c.y2, 3)} m.`
        : `Agua clara: y2 = [0,025·Q²/(Dm^(2/3)·W2²)]^(3/7) con Dm = 1,25·D50 = ${f(1.25 * d50 * 1000, 2)} mm: y2 = ${f(c.y2, 3)} m.`,
      `Socavación ys = y2 − y0 = ${f(c.y2, 3)} − ${f(y0, 3)} = ${f(c.ys, 3)} m (cero si sale negativa).`,
    ],
    kid: c.ys > 0 ? `Al angostar el cauce de ${f(W1, 0)} a ${f(W2, 0)} m, el agua cava ${f(c.ys, 1)} m bajo el puente.` : 'Con ese ancho bajo el puente, el agua no cava el fondo por la contracción.',
  };
}

// ------------------------------------------------------------------ sedimentos: varias fórmulas y formas del lecho

export function calcFormulas(v: Vals): Result {
  const Q = num(v.Q, 30), b = num(v.b, 10), S = num(v.S, 0.3) / 100, d = num(v.d, 2) / 1000;
  if (Q <= 0 || b <= 0 || S <= 0 || d <= 0) return bad('Revisa los datos.');
  const n = num(v.n, 0) > 0 ? num(v.n, 0) : bedN(d);
  const sec: Section = { shape: 'rect', b, z: 0, D: 0, H: 99 };
  const h = normalDepth(sec, n, S, Q), R = (b * h) / (b + 2 * h), V = Q / (b * h);
  const t = transport({ d, h, V, S, R });
  const day = (q: number) => q * b * 86400 * 2650 / 1000;
  const row = (name: string, q: number, ok: boolean) => ({ label: `${name}${ok ? '' : ' (fuera de su rango de grano)'}`, value: `${f(q * 1000, 3)} L/s por metro · ${f(day(q), 0)} t/día` });
  return {
    outs: [
      { label: 'Forma del lecho', value: BEDFORM_NAME[t.bedform], kid: true },
      { label: 'Profundidad y velocidad', value: `${f(h, 2)} m · ${f(V, 2)} m/s`, kid: true },
      { label: 'Shields θ / umbral θcr', value: `${f(t.theta, 3)} / ${f(t.thetaCr, 3)}` },
      { label: 'Etapa de transporte T (van Rijn)', value: f(t.T, 2) },
      row('Meyer-Peter y Müller', t.mpm, t.valid.mpm),
      row('Einstein y Brown', t.einsteinBrown, t.valid.einsteinBrown),
      row('van Rijn (fondo)', t.vanRijn, t.valid.vanRijn),
      row('Engelund y Hansen (total)', t.engelundHansen, t.valid.engelundHansen),
      ...(t.dune.height > 0 ? [{ label: 'Formas del lecho: alto, largo, avance', value: `${f(t.dune.height * 100, 1)} cm, ${f(t.dune.length, 2)} m, ${f(t.dune.celerity * 3600, 2)} m/h`, kid: true }] : []),
    ],
    steps: [
      `Profundidad normal con n = ${f(n, 3)}${num(v.n, 0) > 0 ? '' : ' (Strickler)'}: h = ${f(h, 3)} m, R = ${f(R, 3)} m, V = ${f(V, 3)} m/s.`,
      `τ = γ·R·S = ${f(GAMMA * R * S, 2)} Pa; θ = τ/((ρs − ρ)·g·d) = ${f(t.theta, 4)}; θcr (Soulsby y Whitehouse) = ${f(t.thetaCr, 4)}; D* = ${f(t.Dstar, 1)}.`,
      'q* = q/√((s − 1)·g·d³). MPM: 3,97·(θ − θcr)^1,5. Einstein-Brown: 40·K·θ³ (θ ≥ 0,18) o K·e^(−0,391/θ)/0,465. van Rijn: 0,053·T^2,1/D*^0,3 (T < 3) o 0,1·T^1,5/D*^0,3. Engelund-Hansen: 0,1·θ^2,5/f con f = 2·g·R·S/V².',
      `van Rijn: u*' = √g·V/C' con C' = 18·log10(12R/3d90), d90 ≈ 2·d50 → T = ${f(t.T, 2)}: ${BEDFORM_NAME[t.bedform]}.`,
      'Las fórmulas pueden diferir varias veces entre sí: cada una se calibró con otros ríos y granos. Usa la que corresponde a tu grano y compárala con mediciones.',
    ],
    data: { Q, b, S, d, n },
    kid: `Con granos de ${f(d * 1000, 1)} mm, el fondo forma ${BEDFORM_NAME[t.bedform]}${t.dune.height > 0 ? ` de unos ${f(t.dune.height * 100, 0)} cm de alto` : ''}.`,
  };
}

// ------------------------------------------------------------------ aforo: Parshall

export function calcParshall(v: Vals): Result {
  const size: ParshallSize = typeof v.size === 'string' && v.size in PARSHALL ? (v.size as ParshallSize) : '6in';
  const Ha = num(v.Ha, 15) / 100, Hb = num(v.Hb, 0) / 100;
  const P = PARSHALL[size];
  if (Ha <= 0) return bad('La carga debe ser mayor que cero.');
  const Q = parshallQ(size, Ha);
  const s = Hb > 0 ? Hb / Ha : 0;
  const checks: Check[] = [
    { name: `Carga dentro del rango de la canaleta (${f(P.Hmin * 100, 1)} a ${f(P.Hmax * 100, 0)} cm)`, ok: Ha >= P.Hmin && Ha <= P.Hmax, value: `${f(Ha * 100, 1)} cm` },
    { name: `Flujo libre: Hb/Ha menor que ${f(P.St, 1)}`, ok: s < P.St, value: Hb > 0 ? f(s, 2) : 'sin Hb' },
  ];
  return {
    outs: [
      { label: 'Caudal', value: `${f(Q * 1000, 2)} L/s`, kid: true },
      { label: 'Ecuación (pies y pies³/s)', value: `Q = ${P.C}·Ha^${P.n}` },
      { label: 'Sumergencia Hb/Ha', value: Hb > 0 ? f(s, 2) : '—' },
    ],
    steps: [
      `Canaleta Parshall de ${P.name}: Q = C·Ha^n con C = ${P.C} y n = ${P.n} en pies y pies³/s (USBR, Water Measurement Manual, tabla 8-6).`,
      `Ha = ${f(Ha * 100, 1)} cm = ${f(Ha / 0.3048, 4)} pies → Q = ${f(Q / 0.0283168, 4)} pies³/s = ${f(Q * 1000, 2)} L/s.`,
      s >= P.St ? `Hb/Ha = ${f(s, 2)} ≥ ${P.St}: la canaleta está sumergida y la fórmula de flujo libre da más caudal del real; hay que corregir con las curvas de sumergencia.` : 'Flujo libre: basta medir Ha.',
    ],
    checks,
    kid: `Con ${f(Ha * 100, 0)} cm de agua en la canaleta pasan ${f(Q * 1000, 1)} litros cada segundo.`,
  };
}

export function preParshall(v: Vals): Result {
  const qmin = num(v.qmin, 5) / 1000, qmax = num(v.qmax, 120) / 1000;
  if (qmin <= 0 || qmax <= qmin) return bad('El caudal máximo debe ser mayor que el mínimo.');
  const sizes = Object.keys(PARSHALL) as ParshallSize[];
  const fit = sizes.map((s) => ({ s, h1: parshallH(s, qmin), h2: parshallH(s, qmax) })).map((o) => ({ ...o, ok: o.h1 >= PARSHALL[o.s].Hmin && o.h2 <= PARSHALL[o.s].Hmax }));
  const pick = fit.find((o) => o.ok);
  return {
    outs: [
      { label: 'Canaleta escogida', value: pick ? PARSHALL[pick.s].name : 'ninguna cubre todo el rango', kid: true },
      ...(pick ? [{ label: 'Carga de mínimo a máximo', value: `${f(pick.h1 * 100, 1)} a ${f(pick.h2 * 100, 1)} cm`, kid: true }, { label: 'Ancho de la garganta', value: `${f(PARSHALL[pick.s].W * 100, 1)} cm` }] : []),
    ],
    steps: [
      `Para cada tamaño se calcula la carga del caudal mínimo y del máximo (Ha = 0,3048·(Q/(0,02832·C))^(1/n)) y se exige que queden dentro del rango de la canaleta.`,
      ...fit.map((o) => `${PARSHALL[o.s].name}: ${f(o.h1 * 100, 1)} a ${f(o.h2 * 100, 1)} cm → ${o.ok ? 'sirve' : 'no sirve'}.`),
      'Se escoge la más pequeña que sirve: mide con más carga, y más carga es más precisión.',
    ],
    checks: [{ name: 'Una canaleta estándar cubre todo el rango', ok: !!pick, value: pick ? PARSHALL[pick.s].name : 'ninguna' }],
    data: { size: pick ? pick.s : '', qmin, qmax },
    kid: pick ? `Para medir entre ${f(qmin * 1000, 0)} y ${f(qmax * 1000, 0)} L/s sirve una canaleta Parshall de ${PARSHALL[pick.s].name}.` : 'Ninguna canaleta estándar sirve para todo el rango: divide el rango.',
  };
}

// ------------------------------------------------------------------ aforo: molinete (sección media)

export const MOLINETE_EJEMPLO = '0 0 0\n1 0,35 0,22\n2 0,62 0,48\n3 0,85 0,63\n4 0,9 0,66\n5 0,7 0,5\n6 0,4 0,3\n7 0 0';

export function calcMolinete(v: Vals): Result {
  const txt = String(v.tabla ?? MOLINETE_EJEMPLO);
  const rows = txt
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/[\s;\t]+/).map((x) => Number(x.replace(',', '.'))));
  if (rows.some((r) => r.length < 3 || r.slice(0, 3).some((x) => !Number.isFinite(x) || x < 0))) return bad('Cada línea debe tener tres números: distancia desde la orilla (m), profundidad (m) y velocidad media en la vertical (m/s).');
  if (rows.length < 3) return bad('Hacen falta al menos tres verticales (las dos orillas y una en el agua).');
  const ms = midSection(rows.map((r) => ({ x: r[0], d: r[1], v: r[2] })));
  const W = Math.max(...rows.map((r) => r[0])) - Math.min(...rows.map((r) => r[0]));
  const maxShare = Math.max(...ms.parts.map((p) => p.q)) / (ms.Q || 1);
  return {
    outs: [
      { label: 'Caudal', value: `${f(ms.Q, 3)} m³/s`, kid: true },
      { label: 'Área mojada', value: `${f(ms.A, 3)} m²` },
      { label: 'Velocidad media', value: `${f(ms.Q / (ms.A || 1), 3)} m/s`, kid: true },
      { label: 'Ancho', value: `${f(W, 2)} m` },
      { label: 'Franja con más caudal', value: `${f(maxShare * 100, 0)} %` },
    ],
    steps: [
      'Sección media (ISO 748): cada vertical representa la franja entre la mitad hacia la anterior y la mitad hacia la siguiente; qᵢ = vᵢ·dᵢ·(xᵢ₊₁ − xᵢ₋₁)/2.',
      ...ms.parts.map((p, k) => `Vertical ${k + 1} (x = ${f(p.x, 2)} m): franja de ${f(p.w, 2)} m → ${f(p.q, 4)} m³/s.`),
      `Q = Σqᵢ = ${f(ms.Q, 4)} m³/s. La velocidad de cada vertical es la de 0,6 de la profundidad o el promedio de 0,2 y 0,8.`,
    ],
    checks: [{ name: 'Ninguna franja lleva más del 10 % del caudal (práctica del USGS, Rantz 1982: más verticales si pasa)', ok: maxShare <= 0.1, value: `${f(maxShare * 100, 0)} %` }],
    kid: `Por la quebrada pasan ${f(ms.Q * 1000, 0)} litros cada segundo.`,
  };
}

// ------------------------------------------------------------------ ondas: rotura de presa, compuertas y crecientes

export function calcRotura(v: Vals): Result {
  const h0 = num(v.h0, 2), h1 = num(v.h1, 0), x = num(v.x, 200);
  if (h0 <= 0 || h1 < 0 || x <= 0) return bad('Revisa los datos.');
  if (h1 >= h0) return bad('El agua de abajo debe ser menos profunda que el embalse.');
  const c0 = Math.sqrt(G * h0);
  if (h1 <= 0) {
    const vf = 2 * c0, ta = x / vf;
    const qd = (8 / 27) * Math.sqrt(G) * Math.pow(h0, 1.5);
    return {
      outs: [
        { label: 'Velocidad del frente', value: `${f(vf, 2)} m/s`, kid: true },
        { label: `Llega a ${f(x, 0)} m en`, value: `${f(ta, 1)} s`, kid: true },
        { label: 'Profundidad en el sitio de la presa', value: `${f((4 / 9) * h0, 3)} m` },
        { label: 'Caudal por metro en la presa', value: `${f(qd, 3)} m²/s` },
        { label: 'La onda de vaciado sube por el embalse a', value: `${f(c0, 2)} m/s` },
      ],
      steps: [
        `Fondo seco y sin fricción (Ritter, 1892): c0 = √(g·h0) = ${f(c0, 3)} m/s.`,
        `El frente avanza a 2·c0 = ${f(vf, 3)} m/s (la fricción real lo frena); llega a ${f(x, 0)} m en ${f(ta, 2)} s.`,
        `Entre −c0·t y 2·c0·t la profundidad es h = (2c0 − x/t)²/(9g); en la presa (x = 0) queda 4/9·h0 = ${f((4 / 9) * h0, 3)} m y pasa q = (8/27)·√g·h0^1,5 = ${f(qd, 3)} m²/s.`,
      ],
      kid: `Si la presa se rompe, el agua llega a ${f(x, 0)} m en unos ${f(ta, 0)} segundos.`,
      data: { h0, h1, x, kind: 'ritter' },
    };
  }
  const st = stoker(h0, h1);
  const ta = x / st.S;
  return {
    outs: [
      { label: 'Velocidad del frente (resalto móvil)', value: `${f(st.S, 2)} m/s`, kid: true },
      { label: `Llega a ${f(x, 0)} m en`, value: `${f(ta, 1)} s`, kid: true },
      { label: 'Altura detrás del frente', value: `${f(st.h2, 3)} m`, kid: true },
      { label: 'El agua sube de golpe', value: `${f(st.h2 - h1, 3)} m` },
      { label: 'Velocidad del agua detrás del frente', value: `${f(st.u2, 2)} m/s` },
    ],
    steps: [
      `Fondo mojado y sin fricción (Stoker, 1957): onda de vaciado aguas arriba y un resalto que avanza aguas abajo.`,
      `En el resalto móvil: masa h2·(S − u2) = h1·S y cantidad de movimiento h2 = (h1/2)·(√(1 + 8S²/(g·h1)) − 1); en la onda de vaciado u2 = 2·(√(g·h0) − √(g·h2)).`,
      `Se resuelve S por bisección: S = ${f(st.S, 3)} m/s, h2 = ${f(st.h2, 4)} m, u2 = ${f(st.u2, 3)} m/s.`,
    ],
    kid: `Con agua abajo, llega un muro de agua de ${f(st.h2 - h1, 2)} m que avanza a ${f(st.S, 1)} m/s.`,
    data: { h0, h1, x, kind: 'stoker' },
  };
}

export function preMuroCompuerta(v: Vals): Result {
  const Q = num(v.Q, 8), b = num(v.b, 4), n = num(v.n, 0.015), S = num(v.S, 0.1) / 100, fb = num(v.fb, 0.3), keep = num(v.keep, 0) / 100;
  if (Q <= 0 || b <= 0 || n <= 0 || S <= 0 || fb < 0) return bad('Revisa los datos.');
  const sec: Section = { shape: 'rect', b, z: 0, D: 0, H: 99 };
  const y1 = normalDepth(sec, n, S, Q), V1 = Q / (b * y1);
  const q2 = (keep * Q) / b;
  const fv = favreSurge(y1, V1, q2);
  const H = ceilTo(fv.y2 + fb, 0.05);
  return {
    outs: [
      { label: 'Agua antes del cierre', value: `${f(y1, 2)} m a ${f(V1, 2)} m/s`, kid: true },
      { label: 'Agua cuando pasa la onda', value: `${f(fv.y2, 2)} m`, kid: true },
      { label: 'La onda sube', value: `${f(fv.y2 - y1, 2)} m`, kid: true },
      { label: 'Velocidad de la onda (aguas arriba)', value: `${f(fv.Vw, 2)} m/s` },
      { label: 'Altura de los muros', value: `${f(H, 2)} m`, kid: true },
    ],
    steps: [
      `Antes del cierre, flujo uniforme (Manning, n = ${f(n, 3)}): y1 = ${f(y1, 3)} m, V1 = ${f(V1, 3)} m/s.`,
      `Cierre ${keep > 0 ? `hasta dejar pasar ${f(keep * 100, 0)} % del caudal` : 'total'}: q2 = ${f(q2, 3)} m²/s.`,
      `Onda positiva de Favre: masa Vw = (q1 − q2)/(y2 − y1) y cantidad de movimiento (V1 + Vw)² = g·y2·(y1 + y2)/(2·y1) → y2 = ${f(fv.y2, 3)} m, Vw = ${f(fv.Vw, 3)} m/s.`,
      `Muros = y2 + borde libre = ${f(fv.y2, 3)} + ${f(fb, 2)} = ${f(H, 2)} m (redondeado a 5 cm). Sin fricción en el frente: la onda real se aplana un poco al viajar.`,
    ],
    checks: [{ name: 'La onda cabe en los muros con su borde libre', ok: H >= fv.y2 + fb - 1e-9, value: `${f(H - fv.y2, 2)} m sobre la onda` }],
    kid: `Si cerramos la compuerta de golpe, el agua sube ${f(fv.y2 - y1, 2)} m: los muros deben medir ${f(H, 2)} m.`,
    data: { b, y1, y2: fv.y2, H },
  };
}

export function calcCeleridad(v: Vals): Result {
  const Q = num(v.Q, 20), b = num(v.b, 10), n = num(v.n, 0.03), S = num(v.S, 0.1) / 100, L = num(v.L, 5000);
  if (Q <= 0 || b <= 0 || n <= 0 || S <= 0 || L <= 0) return bad('Revisa los datos.');
  const sec: Section = { shape: 'rect', b, z: 0, D: 0, H: 99 };
  const y = normalDepth(sec, n, S, Q), V = Q / (b * y);
  // celeridad cinemática c = dQ/dA con Manning (numérica)
  const dy = y * 1e-4;
  const c = (manningQ(sec, n, S, y + dy) - manningQ(sec, n, S, y - dy)) / (b * 2 * dy);
  const cd = V + Math.sqrt(G * y);
  return {
    outs: [
      { label: 'Profundidad y velocidad del agua', value: `${f(y, 2)} m · ${f(V, 2)} m/s`, kid: true },
      { label: 'Celeridad de la creciente (onda cinemática)', value: `${f(c, 2)} m/s`, kid: true },
      { label: `Tarda en recorrer ${f(L / 1000, 1)} km`, value: `${f(L / c / 60, 1)} min`, kid: true },
      { label: 'Celeridad de una onda pequeña (dinámica)', value: `${f(cd, 2)} m/s` },
      { label: 'Razón c/V', value: f(c / V, 2) },
    ],
    steps: [
      `Flujo uniforme: y = ${f(y, 3)} m, V = ${f(V, 3)} m/s.`,
      `La creciente avanza con c = dQ/dA (onda cinemática; Lighthill y Whitham, 1955): ${f(c, 3)} m/s, es decir ${f(c / V, 2)} veces la velocidad del agua (5/3 en un canal muy ancho con Manning).`,
      `Una onda pequeña (perturbación) viaja más rápido, a V + √(g·y) = ${f(cd, 3)} m/s, pero en una creciente larga la fricción la frena hasta la celeridad cinemática.`,
      `Tiempo de viaje en ${f(L, 0)} m: ${f(L / c, 0)} s = ${f(L / c / 60, 1)} min.`,
    ],
    kid: `La creciente avanza a ${f(c, 1)} m/s: tarda unos ${f(L / c / 60, 0)} minutos en recorrer ${f(L / 1000, 1)} km.`,
    data: { Q, b, n, S },
  };
}

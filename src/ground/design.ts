// Herramientas de diseño de la sala «Aguas subterráneas»: funciones puras (datos del formulario → resultados, paso a
// paso y verificaciones) con su gráfica registrada para la memoria. Son prediseños académicos.

import { f, type Check, type Result, type Vals } from '../canals/designCalc';
import { registerPlan } from '../canals/designPlans';
import type { XY } from '../canals/plan';
import type { ToolSet } from '../canals/design';
import { SOILS, captureZone, cooperJacob, darcy, fitCooperJacob, ogataBanks, ogataBanksFlux, permConstant, permFalling, theis, velocity, wellW, type Soil } from './aquifer';

export const ROOM = 'Aguas subterráneas';

const num = (v: number | string | undefined, def: number) => {
  if (v === undefined) return def;
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};
const bad = (error: string): Result => ({ outs: [], steps: [], kid: '', error });
const N = (x: number | string | undefined) => (typeof x === 'number' ? x : Number(x));

/** Material cuya conductividad típica está más cerca (en escala logarítmica). */
export function nearestSoil(K: number): Soil {
  return (Object.keys(SOILS) as Soil[]).reduce((a, s) => (Math.abs(Math.log10(SOILS[s].K / K)) < Math.abs(Math.log10(SOILS[a].K / K)) ? s : a), 'grava');
}
const years = (d: number) => (d >= 730 ? `${f(d / 365, 1)} años` : `${f(d, 0)} días`);

// ------------------------------------------------------------------ el acuífero

export function calcDarcy(v: Vals): Result {
  const K = num(v.K, 30), i = num(v.i, 0.01), A = num(v.A, 500), ne = num(v.ne, 0.28), L = num(v.L, 300);
  if (!(K > 0 && i > 0 && A > 0 && ne > 0 && ne < 1 && L > 0)) return bad('Revisa los datos: todos mayores que cero y la porosidad menor que 1.');
  const d = darcy(K, i, A, ne);
  const T = L / d.v;
  return {
    outs: [
      { label: 'Caudal', value: `${f(d.Q, 2)} m³/día (${f(d.Q / 86.4, 3)} L/s)`, kid: true },
      { label: 'Descarga específica q', value: `${f(d.q, 4)} m/día` },
      { label: 'Velocidad del agua en los poros', value: `${f(d.v, 4)} m/día`, kid: true },
      { label: `Tiempo para recorrer ${f(L, 0)} m`, value: years(T), kid: true },
    ],
    steps: [
      `Darcy: q = K·i = ${f(K, 4)}·${f(i, 4)} = ${f(d.q, 5)} m/día; Q = q·A = ${f(d.Q, 3)} m³/día.`,
      `El agua solo pasa por los poros conectados: v = q/ne = ${f(d.q, 5)}/${f(ne, 2)} = ${f(d.v, 5)} m/día.`,
      `Tiempo de viaje: L/v = ${f(L, 0)}/${f(d.v, 5)} = ${f(T, 1)} días. La ley de Darcy vale con flujo laminar (número de Reynolds del grano menor de 1 a 10).`,
    ],
    checks: [{ name: 'Flujo laminar en los poros (q·d10/ν < 1 con un grano de 1 mm)', ok: (d.q / 86400) * 0.001 / 1e-6 < 1, value: `Re ≈ ${f(((d.q / 86400) * 0.001) / 1e-6, 4)}` }],
    kid: `El agua avanza unos ${f(d.v, 2)} metros por día: tarda ${years(T)} en recorrer ${f(L, 0)} m.`,
    data: { kind: 'darcy', K, i, ne, L },
  };
}

export function calcPermeametro(v: Vals): Result {
  const tipo = v.tipo === 'variable' ? 'variable' : 'constante';
  const L = num(v.L, 0.3), D = num(v.D, 0.1), A = (Math.PI * D * D) / 4;
  let K: number, steps: string[];
  if (tipo === 'constante') {
    const Q = num(v.Q, 4.5) / 1e6, dh = num(v.dh, 0.5);
    if (!(L > 0 && D > 0 && Q > 0 && dh > 0)) return bad('Revisa los datos: todos mayores que cero.');
    K = permConstant(Q, L, A, dh);
    steps = [`Carga constante: K = Q·L/(A·Δh) = ${f(Q * 1e6, 3)}e-6·${f(L, 3)}/(${f(A, 5)}·${f(dh, 3)}) = ${K.toExponential(3)} m/s.`];
  } else {
    const d = num(v.d, 0.01), t = num(v.t, 600), h0 = num(v.h0, 1), h1 = num(v.h1, 0.8);
    if (!(L > 0 && D > 0 && d > 0 && t > 0 && h0 > h1 && h1 > 0)) return bad('Revisa los datos: todos mayores que cero y la carga final menor que la inicial.');
    const a = (Math.PI * d * d) / 4;
    K = permFalling(a, L, A, t, h0, h1);
    steps = [`Carga variable (para suelos finos): K = (a·L/(A·t))·ln(h0/h1) con a = ${f(a, 6)} m² del tubo: K = ${K.toExponential(3)} m/s.`];
  }
  const Kd = K * 86400, soil = nearestSoil(Kd);
  return {
    outs: [
      { label: 'Conductividad hidráulica K', value: `${K.toExponential(2)} m/s = ${f(Kd, Kd < 1 ? 4 : 2)} m/día`, kid: true },
      { label: 'Se parece a', value: SOILS[soil].name.toLowerCase(), kid: true },
    ],
    steps: [...steps, `En m/día: ${f(Kd, 5)}. Valores típicos: grava 300, arena gruesa 30, arena fina 3, limo 0,1 y arcilla 0,0001 m/día (Freeze y Cherry, 1979).`],
    kid: `Tu muestra deja pasar el agua como una ${SOILS[soil].name.toLowerCase()}.`,
    data: { kind: 'perm', K: Kd },
  };
}

export function preProteccion(v: Vals): Result {
  const K = num(v.K, 30), i = num(v.i, 0.005), ne = num(v.ne, 0.28), dias = num(v.dias, 50), Q = num(v.Q, 5), b = num(v.b, 20);
  if (!(K > 0 && i > 0 && ne > 0 && ne < 1 && dias > 0 && Q >= 0 && b > 0)) return bad('Revisa los datos: todos mayores que cero.');
  const q = K * i, vr = q / ne;
  const Qd = Q * 86.4;
  // distancia aguas arriba del pozo que el agua recorre en `dias` días por el eje (con la atracción del pozo)
  const fld = { v: vr, well: Qd > 0 ? { x: 0, y: 0, Q: Qd, b, ne } : null };
  let x = 0, t = 0;
  const dt = Math.max(0.01, dias / 4000);
  while (t < dias) {
    const [u] = velocity(fld, x - 0.5, 0);
    x -= Math.abs(u) * dt;
    t += dt;
  }
  const up = -x;
  const cz = Qd > 0 ? captureZone(Qd, b, q) : null;
  const rCyl = Qd > 0 ? Math.sqrt((Qd * dias) / (Math.PI * b * ne)) : 0;
  return {
    outs: [
      { label: `Distancia aguas arriba que el agua recorre en ${f(dias, 0)} días`, value: `${f(up, 0)} m`, kid: true },
      { label: 'Radio del cilindro de agua bombeada (sin flujo regional)', value: `${f(rCyl, 0)} m` },
      ...(cz ? [{ label: 'Ancho de la zona de captura lejos del pozo', value: `${f(cz.width, 0)} m`, kid: true }, { label: 'Punto de estancamiento aguas abajo', value: `${f(cz.xs, 0)} m` }] : []),
    ],
    steps: [
      `Flujo regional: q = K·i = ${f(q, 4)} m/día y v = q/ne = ${f(vr, 4)} m/día.`,
      Qd > 0 ? `Por el eje, aguas arriba, el pozo suma Q/(2π·b·ne·r) a la velocidad; integrando en el tiempo, en ${f(dias, 0)} días el agua viene de ${f(up, 1)} m.` : `Sin bombeo, en ${f(dias, 0)} días el agua recorre v·t = ${f(up, 1)} m.`,
      Qd > 0 ? `Cilindro equivalente: r = √(Q·t/(π·b·ne)) = ${f(rCyl, 1)} m (método del volumen fijo, sin flujo regional).` : 'Sin bombeo no hay zona de captura.',
      ...(cz ? [`Zona de captura (Todd, 1980): ancho Q/(b·q) = ${f(cz.width, 1)} m; estancamiento a Q/(2π·b·q) = ${f(cz.xs, 1)} m aguas abajo.`] : []),
      'Una zona de protección de un pozo se traza con el tiempo de viaje: dentro de ella no deben quedar fuentes de contaminación.',
    ],
    kid: `El agua que el pozo bombea dentro de ${f(dias, 0)} días está hoy a menos de ${f(up, 0)} m aguas arriba.`,
    data: { kind: 'proteccion', K, i, ne, dias, Q, b },
  };
}

// ------------------------------------------------------------------ el pozo

export function calcTheis(v: Vals): Result {
  const Q = num(v.Q, 10), T = num(v.T, 750), S = num(v.S, 2e-4), r = num(v.r, 50), t = num(v.t, 1);
  if (!(Q > 0 && T > 0 && S > 0 && S < 1 && r > 0 && t > 0)) return bad('Revisa los datos: todos mayores que cero y S menor que 1.');
  const Qd = Q * 86.4, u = (r * r * S) / (4 * T * t);
  const s = theis(Qd, T, S, r, t), cj = cooperJacob(Qd, T, S, r, t);
  const checks: Check[] = [{ name: 'Cooper-Jacob vale (u < 0,01)', ok: u < 0.01, value: `u = ${u.toExponential(2)}` }];
  return {
    outs: [
      { label: 'Abatimiento (Theis)', value: `${f(s, 3)} m`, kid: true },
      { label: 'Abatimiento (Cooper-Jacob)', value: `${f(cj, 3)} m` },
      { label: 'u y W(u)', value: `${u.toExponential(3)} · ${f(wellW(u), 4)}` },
    ],
    steps: [
      `u = r²·S/(4·T·t) = ${f(r, 1)}²·${S.toExponential(2)}/(4·${f(T, 1)}·${f(t, 3)}) = ${u.toExponential(4)}.`,
      `W(u) = E1(u) = ${f(wellW(u), 5)} (serie o fracción continua).`,
      `Theis: s = Q/(4πT)·W(u) = ${f(Qd, 1)}/(4π·${f(T, 1)})·${f(wellW(u), 4)} = ${f(s, 4)} m.`,
      `Cooper-Jacob: s = 2,30·Q/(4πT)·log10(2,25·T·t/(r²·S)) = ${f(cj, 4)} m (${u < 0.01 ? 'vale' : 'no vale todavía: u es grande'}).`,
    ],
    checks,
    kid: `A ${f(r, 0)} m del pozo, el nivel baja ${f(s, 2)} m después de ${f(t, 1)} días.`,
    data: { kind: 'theis', Q, T, S, r, t },
  };
}

export const PRUEBA_EJEMPLO = '0.001 0.12\n0.003 0.26\n0.01 0.41\n0.03 0.53\n0.1 0.66\n0.3 0.77\n1 0.88\n2 0.94';

export function calcPrueba(v: Vals): Result {
  const Q = num(v.Q, 10), r = num(v.r, 50);
  const pts = String(v.tabla ?? PRUEBA_EJEMPLO).split(/\n+/).map((l) => l.trim().split(/[\s;]+/).map((x) => Number(x.replace(',', '.')))).filter((p) => p.length >= 2 && p.every(Number.isFinite)).map(([t, s]) => ({ t, s }));
  if (!(Q > 0 && r > 0)) return bad('Revisa los datos: caudal y distancia mayores que cero.');
  if (pts.length < 4) return bad('Escribe al menos cuatro lecturas: tiempo (días) y abatimiento (m) en cada línea.');
  const fit = fitCooperJacob(pts, Q * 86.4, r);
  if (!fit) return bad('No se pudo ajustar una recta: revisa que el abatimiento crezca con el tiempo.');
  const uMax = (r * r * fit.S) / (4 * fit.T * pts.sort((a, b) => a.t - b.t)[Math.floor(pts.length / 2)].t);
  return {
    outs: [
      { label: 'Transmisividad T', value: `${f(fit.T, 1)} m²/día`, kid: true },
      { label: 'Coeficiente de almacenamiento S', value: fit.S.toExponential(2), kid: true },
      { label: 'Abatimiento por ciclo logarítmico', value: `${f(fit.ds, 3)} m` },
      { label: 't0 (corte con s = 0)', value: `${fit.t0.toExponential(2)} días` },
    ],
    steps: [
      `Se ajusta una recta s = a + Δs·log10(t) con la mitad final de las lecturas (${fit.used} puntos), donde u es pequeño.`,
      `T = 2,30·Q/(4π·Δs) = 2,30·${f(Q * 86.4, 1)}/(4π·${f(fit.ds, 4)}) = ${f(fit.T, 2)} m²/día.`,
      `S = 2,25·T·t0/r² = 2,25·${f(fit.T, 1)}·${fit.t0.toExponential(3)}/${f(r, 1)}² = ${fit.S.toExponential(3)}.`,
    ],
    checks: [{ name: 'Los puntos usados cumplen u < 0,05', ok: uMax < 0.05, value: `u = ${uMax.toExponential(2)}` }],
    kid: `El acuífero deja pasar ${f(fit.T, 0)} m² por día.`,
    data: { kind: 'prueba', Q, r, tabla: String(v.tabla ?? PRUEBA_EJEMPLO) },
  };
}

export function prePozo(v: Vals): Result {
  const T = num(v.T, 750), S = num(v.S, 2e-4), smax = num(v.smax, 10), t = num(v.t, 365), rw = num(v.rw, 0.15), d = num(v.d, 300), loss = num(v.loss, 30);
  if (!(T > 0 && S > 0 && S < 1 && smax > 0 && t > 0 && rw > 0 && d > 0 && loss >= 0 && loss < 90)) return bad('Revisa los datos: todos mayores que cero y las pérdidas del pozo menores de 90 %.');
  // el abatimiento en el pozo incluye pérdidas por la rejilla y el empaque (fracción del total)
  const sAq = smax * (1 - loss / 100);
  const Qd = (sAq * 4 * Math.PI * T) / wellW((rw * rw * S) / (4 * T * t));
  const sN = theis(Qd, T, S, d, t);
  return {
    outs: [
      { label: 'Caudal máximo del pozo', value: `${f(Qd / 86.4, 2)} L/s (${f(Qd, 0)} m³/día)`, kid: true },
      { label: `Abatimiento en un pozo vecino a ${f(d, 0)} m`, value: `${f(sN, 2)} m`, kid: true },
      { label: 'Abatimiento del acuífero junto al pozo', value: `${f(sAq, 2)} m` },
    ],
    steps: [
      `Del abatimiento disponible (${f(smax, 2)} m) se reserva ${f(loss, 0)} % para las pérdidas del pozo (rejilla, empaque, turbulencia): quedan ${f(sAq, 2)} m para el acuífero.`,
      `Con Theis en la pared del pozo (r = ${f(rw, 2)} m) después de ${f(t, 0)} días: Q = 4πT·s/W(u) = ${f(Qd, 1)} m³/día.`,
      `Interferencia: con ese caudal, un pozo a ${f(d, 0)} m baja ${f(sN, 3)} m en el mismo tiempo (los abatimientos se suman).`,
    ],
    checks: [{ name: 'El vecino baja menos de 10 % del abatimiento disponible', ok: sN < 0.1 * smax, value: `${f(sN, 2)} m` }],
    kid: `Este pozo puede sacar unos ${f(Qd / 86.4, 1)} litros por segundo durante ${f(t, 0)} días.`,
    data: { kind: 'pozo', T, S, smax, t, rw, d, loss },
  };
}

// ------------------------------------------------------------------ la mancha

export function calcOgata(v: Vals): Result {
  const vv = num(v.v, 0.2), aL = num(v.aL, 5), x = num(v.x, 100), t = num(v.t, 600), C0 = num(v.C0, 100);
  if (!(vv > 0 && aL > 0 && x > 0 && t > 0 && C0 > 0)) return bad('Revisa los datos: todos mayores que cero.');
  const D = aL * vv;
  const c1 = ogataBanks(x, t, vv, D), c2 = ogataBanksFlux(x, t, vv, D);
  // tiempo en que llega la mitad (bisección)
  let lo = 0, hi = (x / vv) * 4;
  for (let k = 0; k < 80; k++) {
    const m = (lo + hi) / 2;
    if (ogataBanks(x, m, vv, D) < 0.5) lo = m;
    else hi = m;
  }
  return {
    outs: [
      { label: 'Concentración en x', value: `${f(c1 * C0, 2)} (C/C0 = ${f(c1, 4)})`, kid: true },
      { label: 'Con entrada de flujo', value: `C/C0 = ${f(c2, 4)}` },
      { label: 'Llega la mitad de la concentración', value: years(hi), kid: true },
      { label: 'Número de Péclet v·x/D', value: f((vv * x) / D, 1) },
    ],
    steps: [
      `Dispersión hidrodinámica D = αL·v = ${f(aL, 2)}·${f(vv, 4)} = ${f(D, 4)} m²/día (se desprecia la difusión molecular).`,
      `Ogata y Banks (1961): C/C0 = ½·[erfc((x − vt)/(2√(Dt))) + e^(vx/D)·erfc((x + vt)/(2√(Dt)))] = ${f(c1, 5)}.`,
      `Con una entrada de flujo (van Genuchten y Alves, 1982), que conserva la masa: ${f(c2, 5)}.`,
      `Sin dispersión, el frente llegaría en x/v = ${f(x / vv, 0)} días; la dispersión adelanta la llegada de las primeras trazas y atrasa la de las últimas.`,
    ],
    kid: `A ${f(x, 0)} m, después de ${f(t, 0)} días, el agua tiene ${f(c1 * 100, 0)} % de la concentración de la fuga.`,
    data: { kind: 'ogata', v: vv, aL, x, t },
  };
}

export function preCaptura(v: Vals): Result {
  const Q = num(v.Q, 5), b = num(v.b, 20), K = num(v.K, 30), i = num(v.i, 0.002), ne = num(v.ne, 0.28), y = num(v.y, 50);
  if (!(Q > 0 && b > 0 && K > 0 && i > 0 && ne > 0 && ne < 1 && y >= 0)) return bad('Revisa los datos: todos mayores que cero.');
  const q = K * i, Qd = Q * 86.4;
  const cz = captureZone(Qd, b, q);
  const inside = y < cz.width / 2;
  const Qlim = 2 * y * b * q;
  return {
    outs: [
      { label: 'Ancho de la zona de captura', value: `${f(cz.width, 0)} m`, kid: true },
      { label: `Una fuente a ${f(y, 0)} m del eje`, value: inside ? 'termina en el pozo' : 'pasa de largo', kid: true },
      { label: 'Caudal con el que el borde pasa por la fuente', value: `${f(Qlim / 86.4, 2)} L/s` },
      { label: 'Punto de estancamiento aguas abajo', value: `${f(cz.xs, 0)} m` },
    ],
    steps: [
      `q = K·i = ${f(q, 4)} m/día. Ancho lejano Q/(b·q) = ${f(Qd, 1)}/(${f(b, 1)}·${f(q, 4)}) = ${f(cz.width, 1)} m.`,
      `Estancamiento: Q/(2π·b·q) = ${f(cz.xs, 1)} m aguas abajo del pozo. Borde: x = |y|/tan(2π·|y|·b·q/Q) (Todd, 1980).`,
      `Una fuente lejana a ${f(y, 1)} m del eje queda ${inside ? 'dentro' : 'fuera'} (mitad del ancho: ${f(cz.width / 2, 1)} m). El borde pasa por ella con Q = 2·y·b·q = ${f(Qlim, 1)} m³/día.`,
      'La dispersión ensancha la mancha: una fuente cerca del borde puede llegar en parte al pozo.',
    ],
    checks: [{ name: 'La fuente queda fuera de la zona de captura, con margen de 20 %', ok: y > 0.6 * cz.width, value: `${f(y, 0)} m de ${f(cz.width / 2, 0)} m` }],
    kid: inside ? 'La mancha terminaría en el pozo: hay que bombear menos o mover el pozo.' : 'La mancha pasa al lado del pozo.',
    data: { kind: 'captura', Q, b, K, i, y },
  };
}

// ------------------------------------------------------------------ gráficas

registerPlan(calcDarcy, (d) => ({
  chart: {
    title: 'Velocidad del agua en los poros según el material',
    xLabel: 'log10 de K (m/día)',
    yLabel: 'log10 del tiempo de viaje (días)',
    series: [{ name: 'tiempo de viaje', pts: Array.from({ length: 30 }, (_, k) => { const K = Math.pow(10, -4 + (k * 7) / 29); return [Math.log10(K), Math.log10(N(d.L) / darcy(K, N(d.i), 1, N(d.ne)).v)] as XY; }) }],
    mark: { at: [Math.log10(N(d.K)), Math.log10(N(d.L) / darcy(N(d.K), N(d.i), 1, N(d.ne)).v)] as XY, text: 'tu acuífero' },
  },
}));
registerPlan(calcPermeametro, (d) => ({
  chart: {
    title: 'Tu muestra entre los suelos típicos',
    xLabel: 'suelo (1 grava … 5 arcilla)',
    yLabel: 'log10 de K (m/día)',
    series: [{ name: 'típicos', pts: Object.values(SOILS).map((s, k) => [k + 1, Math.log10(s.K)] as XY), dash: true }],
    hlines: [{ y: Math.log10(N(d.K)), text: 'tu muestra' }],
  },
}));
registerPlan(preProteccion, (d) => {
  const q = N(d.K) * N(d.i), Qd = N(d.Q) * 86.4;
  if (!(Qd > 0)) return {};
  const cz = captureZone(Qd, N(d.b), q);
  const ys = Array.from({ length: 41 }, (_, k) => (-0.49 + (k * 0.98) / 40) * cz.width);
  return { chart: { title: 'Borde de la zona de captura (planta)', xLabel: 'x (m, el agua va hacia la derecha)', yLabel: 'y (m)', series: [{ name: 'borde', pts: ys.map((y) => [Math.max(-cz.width * 2, cz.boundary(y)), y] as XY) }], mark: { at: [0, 0] as XY, text: 'pozo' } } };
});
registerPlan(calcTheis, (d) => ({
  chart: {
    title: 'Abatimiento en el tiempo (Theis y Cooper-Jacob)',
    xLabel: 'log10 del tiempo (días)',
    yLabel: 'abatimiento (m)',
    series: [
      { name: 'Theis', pts: Array.from({ length: 40 }, (_, k) => { const t = Math.pow(10, -4 + (k * 6) / 39); return [Math.log10(t), theis(N(d.Q) * 86.4, N(d.T), N(d.S), N(d.r), t)] as XY; }) },
      { name: 'Cooper-Jacob', pts: Array.from({ length: 40 }, (_, k) => { const t = Math.pow(10, -4 + (k * 6) / 39); return [Math.log10(t), Math.max(0, cooperJacob(N(d.Q) * 86.4, N(d.T), N(d.S), N(d.r), t))] as XY; }), dash: true },
    ],
    mark: { at: [Math.log10(N(d.t)), theis(N(d.Q) * 86.4, N(d.T), N(d.S), N(d.r), N(d.t))] as XY, text: 'tu tiempo' },
  },
}));
registerPlan(calcPrueba, (d) => {
  const pts = String(d.tabla).split(/\n+/).map((l) => l.trim().split(/[\s;]+/).map((x) => Number(x.replace(',', '.')))).filter((p) => p.length >= 2 && p.every(Number.isFinite)).map(([t, s]) => ({ t, s }));
  const fit = fitCooperJacob(pts, N(d.Q) * 86.4, N(d.r));
  return {
    chart: {
      title: 'Prueba de bombeo y recta de Cooper-Jacob',
      xLabel: 'log10 del tiempo (días)',
      yLabel: 'abatimiento (m)',
      series: [
        { name: 'lecturas', pts: pts.map((p) => [Math.log10(p.t), p.s] as XY), dash: true },
        ...(fit ? [{ name: 'recta', pts: [-3.5, 1].map((x) => [x, Math.max(0, fit.ds * (x - Math.log10(fit.t0)))] as XY) }] : []),
      ],
    },
  };
});
registerPlan(prePozo, (d) => {
  const T = N(d.T), S = N(d.S), t = N(d.t), rw = N(d.rw), sAq = N(d.smax) * (1 - N(d.loss) / 100);
  const Qd = (sAq * 4 * Math.PI * T) / wellW((rw * rw * S) / (4 * T * t));
  return { chart: { title: 'Cono de abatimiento después del tiempo de diseño', xLabel: 'log10 de la distancia (m)', yLabel: 'abatimiento (m)', series: [{ name: 'Theis', pts: Array.from({ length: 40 }, (_, k) => { const r = Math.pow(10, Math.log10(rw) + (k * (4 - Math.log10(rw))) / 39); return [Math.log10(r), theis(Qd, T, S, r, t)] as XY; }) }], mark: { at: [Math.log10(N(d.d)), theis(Qd, T, S, N(d.d), t)] as XY, text: 'vecino' } } };
});
registerPlan(calcOgata, (d) => {
  const vv = N(d.v), D = N(d.aL) * vv, t = N(d.t), x = N(d.x);
  return {
    chart: {
      title: 'Concentración a lo largo del acuífero',
      xLabel: 'distancia (m)',
      yLabel: 'C/C0',
      series: [
        { name: 'Ogata-Banks', pts: Array.from({ length: 50 }, (_, k) => { const xx = (k * 2 * Math.max(x, vv * t)) / 49; return [xx, ogataBanks(xx, t, vv, D)] as XY; }) },
        { name: 'entrada de flujo', pts: Array.from({ length: 50 }, (_, k) => { const xx = (k * 2 * Math.max(x, vv * t)) / 49; return [xx, ogataBanksFlux(xx, t, vv, D)] as XY; }), dash: true },
      ],
      mark: { at: [x, ogataBanks(x, t, vv, D)] as XY, text: 'tu punto' },
    },
  };
});
registerPlan(preCaptura, (d) => {
  const cz = captureZone(N(d.Q) * 86.4, N(d.b), N(d.K) * N(d.i));
  const ys = Array.from({ length: 41 }, (_, k) => (-0.49 + (k * 0.98) / 40) * cz.width);
  return { chart: { title: 'Zona de captura y la fuente', xLabel: 'x (m, el agua va hacia la derecha)', yLabel: 'y (m)', series: [{ name: 'borde', pts: ys.map((y) => [Math.max(-cz.width * 2, cz.boundary(y)), y] as XY) }], mark: { at: [-cz.width, N(d.y)] as XY, text: 'fuente' } } };
});

// ------------------------------------------------------------------ juegos de herramientas

const NORM = 'En esta sala no se citan artículos del RAS: las verificaciones son criterios usuales de la hidrogeología, para aprender. Un pozo real necesita concesión de aguas de la autoridad ambiental y estudios de campo.';
const SOIL_OPTS = (Object.keys(SOILS) as Soil[]).map((s) => ({ value: String(SOILS[s].K), label: `${SOILS[s].name} (${SOILS[s].K} m/día)` }));

export const GROUND_TOOLS: Record<'acuifero' | 'pozo' | 'mancha', ToolSet> = {
  acuifero: {
    norm: NORM,
    calc: {
      title: 'Calculadora de Darcy',
      intro: 'Caudal, descarga específica, velocidad en los poros y tiempo de viaje en un acuífero con la ley de Darcy.',
      kidIntro: '¿Qué tan rápido viaja el agua bajo tierra?',
      fields: [
        { id: 'K', label: 'Conductividad hidráulica', unit: 'm/día', def: '30', kid: true, options: SOIL_OPTS },
        { id: 'i', label: 'Gradiente hidráulico', def: 0.01, kid: true },
        { id: 'A', label: 'Área de paso', unit: 'm²', def: 500 },
        { id: 'ne', label: 'Porosidad eficaz', def: 0.28 },
        { id: 'L', label: 'Distancia a recorrer', unit: 'm', def: 300, kid: true },
      ],
      run: calcDarcy,
    },
    pre: {
      title: 'Prediseño de la zona de protección de un pozo',
      intro: 'Distancia aguas arriba que el agua recorre hasta el pozo en un tiempo dado, cilindro equivalente y zona de captura: dónde no debe haber fuentes de contaminación.',
      kidIntro: '¿Qué tan lejos del pozo hay que cuidar el suelo?',
      fields: [
        { id: 'K', label: 'Conductividad hidráulica', unit: 'm/día', def: 30, kid: true },
        { id: 'i', label: 'Gradiente regional', def: 0.005 },
        { id: 'ne', label: 'Porosidad eficaz', def: 0.28 },
        { id: 'b', label: 'Espesor del acuífero', unit: 'm', def: 20 },
        { id: 'Q', label: 'Caudal del pozo', unit: 'L/s', def: 5, kid: true },
        { id: 'dias', label: 'Tiempo de viaje que se protege', unit: 'días', def: 50, kid: true },
      ],
      run: preProteccion,
    },
    extra: [
      {
        kind: 'calc',
        title: 'Calculadora del permeámetro (carga constante o variable)',
        intro: 'Conductividad hidráulica de una muestra con un permeámetro de carga constante (suelos gruesos) o variable (suelos finos).',
        kidIntro: '',
        fields: [
          { id: 'tipo', label: 'Ensayo', def: 'constante', options: [{ value: 'constante', label: 'Carga constante' }, { value: 'variable', label: 'Carga variable' }] },
          { id: 'L', label: 'Largo de la muestra', unit: 'm', def: 0.3 },
          { id: 'D', label: 'Diámetro de la muestra', unit: 'm', def: 0.1 },
          { id: 'Q', label: 'Caudal medido', unit: 'mL/s', def: 4.5, when: ['tipo', ['constante']] },
          { id: 'dh', label: 'Diferencia de carga', unit: 'm', def: 0.5, when: ['tipo', ['constante']] },
          { id: 'd', label: 'Diámetro del tubo de carga', unit: 'm', def: 0.01, when: ['tipo', ['variable']] },
          { id: 't', label: 'Tiempo del ensayo', unit: 's', def: 600, when: ['tipo', ['variable']] },
          { id: 'h0', label: 'Carga inicial', unit: 'm', def: 1, when: ['tipo', ['variable']] },
          { id: 'h1', label: 'Carga final', unit: 'm', def: 0.8, when: ['tipo', ['variable']] },
        ],
        run: calcPermeametro,
      },
    ],
  },
  pozo: {
    norm: NORM,
    calc: {
      title: 'Calculadora de Theis y Cooper-Jacob',
      intro: 'Abatimiento a una distancia y un tiempo de bombeo en un acuífero confinado, con Theis y con la aproximación de Cooper-Jacob.',
      kidIntro: '¿Cuánto baja el agua alrededor de un pozo que bombea?',
      fields: [
        { id: 'Q', label: 'Caudal de bombeo', unit: 'L/s', def: 10, kid: true },
        { id: 'T', label: 'Transmisividad', unit: 'm²/día', def: 750 },
        { id: 'S', label: 'Coeficiente de almacenamiento', def: 0.0002 },
        { id: 'r', label: 'Distancia al pozo', unit: 'm', def: 50, kid: true },
        { id: 't', label: 'Tiempo de bombeo', unit: 'días', def: 1, kid: true },
      ],
      run: calcTheis,
    },
    pre: {
      title: 'Prediseño del caudal de un pozo',
      intro: 'Caudal máximo de un pozo para no pasar un abatimiento en un tiempo de diseño, con las pérdidas del pozo, y su efecto en un pozo vecino.',
      kidIntro: '¿Cuánta agua puede sacar un pozo sin secarse?',
      fields: [
        { id: 'T', label: 'Transmisividad', unit: 'm²/día', def: 750, kid: true },
        { id: 'S', label: 'Coeficiente de almacenamiento', def: 0.0002 },
        { id: 'smax', label: 'Abatimiento disponible en el pozo', unit: 'm', def: 10, kid: true },
        { id: 'loss', label: 'Pérdidas del pozo', unit: '% del abatimiento', def: 30 },
        { id: 't', label: 'Tiempo de diseño', unit: 'días', def: 365 },
        { id: 'rw', label: 'Radio del pozo', unit: 'm', def: 0.15 },
        { id: 'd', label: 'Distancia a un pozo vecino', unit: 'm', def: 300 },
      ],
      run: prePozo,
    },
    extra: [
      {
        kind: 'calc',
        title: 'Calculadora de una prueba de bombeo (Cooper-Jacob)',
        intro: 'Transmisividad y coeficiente de almacenamiento a partir de las lecturas de abatimiento en un pozo de observación.',
        kidIntro: '',
        fields: [
          { id: 'Q', label: 'Caudal de bombeo', unit: 'L/s', def: 10 },
          { id: 'r', label: 'Distancia del pozo de observación', unit: 'm', def: 50 },
          { id: 'tabla', label: 'Lecturas: tiempo (días) y abatimiento (m), una por línea', def: PRUEBA_EJEMPLO, text: true },
        ],
        run: calcPrueba,
      },
    ],
  },
  mancha: {
    norm: NORM,
    calc: {
      title: 'Calculadora de Ogata-Banks',
      intro: 'Concentración de un contaminante que entra de forma continua a un acuífero, con advección y dispersión en una dimensión.',
      kidIntro: '¿Cuándo llega la mancha a un punto del acuífero?',
      fields: [
        { id: 'v', label: 'Velocidad del agua en los poros', unit: 'm/día', def: 0.2, kid: true },
        { id: 'aL', label: 'Dispersividad longitudinal', unit: 'm', def: 5 },
        { id: 'x', label: 'Distancia a la fuente', unit: 'm', def: 100, kid: true },
        { id: 't', label: 'Tiempo', unit: 'días', def: 600, kid: true },
        { id: 'C0', label: 'Concentración de la fuente', def: 100 },
      ],
      run: calcOgata,
    },
    pre: {
      title: 'Prediseño de la zona de captura de un pozo',
      intro: 'Ancho y forma de la zona de captura de un pozo en un flujo regional, y si una fuente de contaminación quedaría dentro.',
      kidIntro: '¿De dónde viene el agua que saca el pozo?',
      fields: [
        { id: 'Q', label: 'Caudal del pozo', unit: 'L/s', def: 5, kid: true },
        { id: 'b', label: 'Espesor del acuífero', unit: 'm', def: 20 },
        { id: 'K', label: 'Conductividad hidráulica', unit: 'm/día', def: 30 },
        { id: 'i', label: 'Gradiente regional', def: 0.002 },
        { id: 'ne', label: 'Porosidad eficaz', def: 0.28 },
        { id: 'y', label: 'Distancia de la fuente al eje del pozo', unit: 'm', def: 50, kid: true },
      ],
      run: preCaptura,
    },
  },
};

// Herramientas de diseño de la sala «Bombas y energía del agua»: funciones puras (datos del formulario → resultados,
// paso a paso y verificaciones) con su gráfica registrada para la memoria. Son prediseños académicos.

import { f, type Result, type Vals } from '../canals/designCalc';
import { registerPlan } from '../canals/designPlans';
import type { XY } from '../canals/plan';
import type { ToolSet } from '../canals/design';
import { PIPE_MATS, PVC_DIAMETERS, type PipeMat } from '../supply/pipes';
import { ARRANGEMENTS, G, NPSH_MARGIN, RHO, TURBINES, hydro, hydroPower, npsha, operatingPoint, patm, pvap, rhoWater, setHead, systemHead, turbineEta, type Arrangement, type PumpCurve, type SystemInput, type Turbine } from './pump';

export const ROOM = 'Bombas y energía del agua';

/** Tamaños comerciales usuales de motores eléctricos [kW] (serie IEC). */
export const MOTOR_KW = [0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200, 250, 315];
/** Región preferida de operación: de 70 % a 120 % del caudal de mejor eficiencia (criterio usual de los fabricantes). */
export const POR: [number, number] = [0.7, 1.2];

const num = (v: number | string | undefined, def: number) => {
  if (v === undefined) return def;
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};
const bad = (error: string): Result => ({ outs: [], steps: [], kid: '', error });
const N = (x: number | string | undefined) => (typeof x === 'number' ? x : Number(x));
const mat = (v: Vals): PipeMat => (String(v.mat ?? 'pvc') in PIPE_MATS ? (String(v.mat ?? 'pvc') as PipeMat) : 'pvc');
const arrOf = (v: Vals): Arrangement => (String(v.arr ?? 'una') in ARRANGEMENTS ? (String(v.arr ?? 'una') as Arrangement) : 'una');
const turb = (v: Vals): Turbine => (String(v.tur ?? 'francis') in TURBINES ? (String(v.tur ?? 'francis') as Turbine) : 'francis');

/** Curva de la bomba a partir de lo que trae un catálogo: altura a caudal cero, caudal a altura cero y mejor punto. */
function curveFrom(v: Vals): PumpCurve | null {
  const H0 = num(v.H0, 52), Qmax = num(v.Qmax, 97), Qbep = num(v.Qbep, 55), eta = num(v.eta, 78) / 100;
  if (!(H0 > 0 && Qmax > 0 && Qbep > 0 && Qbep < Qmax && eta > 0 && eta <= 0.95)) return null;
  return { H0, a: H0 / (Qmax * Qmax), Qbep, etaMax: eta, NPSHr0: 0, b: 0, N0: 1750, name: 'catálogo' };
}

// ------------------------------------------------------------------ la bomba y la tubería

export function calcOperacion(v: Vals): Result {
  const p = curveFrom(v);
  const n = num(v.n, 100) / 100, Hs = num(v.Hs, 28), L = num(v.L, 450), D = num(v.D, 152) / 1000, K = num(v.K, 5);
  const arr = arrOf(v), m = mat(v);
  if (!p || !(n >= 0.3 && n <= 1.3 && Hs >= 0 && L > 0 && D > 0.01 && D < 3 && K >= 0)) return bad('Revisa los datos: alturas y largos positivos, el caudal de mejor eficiencia menor que el de altura cero, eficiencia hasta 95 % y velocidad entre 30 % y 130 %.');
  const sys: SystemInput = { Hs, L, D, mat: m, K, T: 20 };
  const op = operatingPoint(p, arr, n, sys);
  if (!op.flows) {
    return {
      outs: [
        { label: 'Caudal', value: '0 L/s: la bomba no alcanza', kid: true },
        { label: 'Altura máxima del conjunto', value: `${f(setHead(p, arr, 0, n), 1)} m`, kid: true },
      ],
      steps: [`Con caudal cero el conjunto da ${f(setHead(p, arr, 0, n), 1)} m, menos que la altura estática de ${f(Hs, 1)} m: el agua no llega arriba.`],
      checks: [{ name: 'La bomba vence la altura estática', ok: false, value: `${f(setHead(p, arr, 0, n), 1)} m < ${f(Hs, 1)} m` }],
      kid: 'La bomba no tiene fuerza para subir el agua tan alto.',
      data: { kind: 'op', H0: p.H0, a: p.a, Qbep: p.Qbep, eta: p.etaMax, n, Hs, L, D, mat: m, K, arr, Q: 0, H: Hs },
    };
  }
  const qPer = arr === 'paralelo' ? op.Q / 2 : op.Q;
  const ratio = qPer / (p.Qbep * n);
  return {
    outs: [
      { label: 'Caudal', value: `${f(op.Q, 1)} L/s`, kid: true },
      { label: 'Altura que da el conjunto', value: `${f(op.H, 1)} m`, kid: true },
      { label: 'Eficiencia de cada bomba', value: `${f(op.eta * 100, 0)} %` },
      { label: 'Potencia en el eje', value: `${f(op.Pshaft, 1)} kW`, kid: true },
      { label: 'Energía por metro cúbico', value: `${f(op.e, 3)} kWh/m³` },
      { label: 'Velocidad en la tubería', value: `${f(op.V, 2)} m/s` },
    ],
    steps: [
      `Curva de la bomba a velocidad nominal: H = H0 − a·Q² con H0 = ${f(p.H0, 1)} m y a = H0/Qmax² = ${f(p.a, 5)} m/(L/s)².`,
      `Leyes de afinidad a ${f(n * 100, 0)} % de la velocidad: H = n²·H0 − a·Q² (Q ∝ n, H ∝ n², P ∝ n³).${arr === 'serie' ? ' En serie se suman las alturas con el mismo caudal.' : arr === 'paralelo' ? ' En paralelo se suman los caudales con la misma altura: H = n²·H0 − a·(Q/2)².' : ''}`,
      `Curva del sistema: Hs + f·(L/D)·V²/2g + K·V²/2g, con f de Swamee-Jain (${PIPE_MATS[m].name}, ε = ${f(PIPE_MATS[m].eps * 1000, 4)} mm).`,
      `Punto de operación (bisección donde las curvas se cortan): Q = ${f(op.Q, 2)} L/s, H = ${f(op.H, 2)} m = ${f(Hs, 1)} + ${f(op.hf, 2)} (fricción) + ${f(op.hm, 2)} (locales).`,
      `Potencia: P = ρ·g·Q·H/η = 1000·9,81·${f(op.Q / 1000, 4)}·${f(op.H, 2)}/${f(op.eta, 3)} = ${f(op.Pshaft, 2)} kW; por metro cúbico, P/(Q·3600) = ${f(op.e, 4)} kWh/m³.`,
    ],
    checks: [
      { name: `Cada bomba trabaja entre ${f(POR[0] * 100, 0)} % y ${f(POR[1] * 100, 0)} % de su mejor caudal (criterio usual)`, ok: ratio >= POR[0] && ratio <= POR[1], value: `${f(ratio * 100, 0)} %` },
      { name: 'Velocidad en la tubería entre 0,6 y 2 m/s (criterio usual de impulsiones)', ok: op.V >= 0.6 && op.V <= 2, value: `${f(op.V, 2)} m/s` },
    ],
    kid: `La bomba sube ${f(op.Q, 0)} litros cada segundo hasta ${f(Hs, 0)} metros de alto.`,
    data: { kind: 'op', H0: p.H0, a: p.a, Qbep: p.Qbep, eta: p.etaMax, n, Hs, L, D, mat: m, K, arr, Q: op.Q, H: op.H },
  };
}

export function preEstacion(v: Vals): Result {
  const Q = num(v.Q, 40), Hs = num(v.Hs, 28), L = num(v.L, 450), K = num(v.K, 5), Vmax = num(v.Vmax, 1.5), eta = num(v.eta, 72) / 100, etaM = num(v.etaM, 90) / 100, h = num(v.h, 16), tar = num(v.tar, 800);
  const m = mat(v);
  if (!(Q > 0 && Hs >= 0 && L > 0 && K >= 0 && Vmax > 0.3 && eta > 0.2 && eta <= 0.95 && etaM > 0.5 && etaM <= 1 && h > 0 && h <= 24 && tar >= 0)) return bad('Revisa los datos: caudal y largo mayores que cero, eficiencias razonables (bomba de 20 % a 95 %, motor de 50 % a 100 %) y horas de bombeo hasta 24.');
  const q = Q / 1000;
  const pick = PVC_DIAMETERS.find((d) => q / ((Math.PI * d.D * d.D) / 4) <= Vmax) ?? PVC_DIAMETERS[PVC_DIAMETERS.length - 1];
  const sys: SystemInput = { Hs, L, D: pick.D, mat: m, K, T: 20 };
  const sh = systemHead(sys, Q);
  const Pw = (RHO * G * q * sh.H) / 1000;
  const Pshaft = Pw / eta, Pin = Pshaft / etaM;
  const need = Pshaft * 1.15;
  const motor = MOTOR_KW.find((k) => k >= need) ?? NaN;
  const E = Pin * h * 365; // kWh/año
  const vol = q * 3600 * h * 365; // m³/año
  return {
    outs: [
      { label: 'Diámetro de la impulsión', value: `${pick.name} (${f(pick.D * 1000, 0)} mm)`, kid: true },
      { label: 'Altura dinámica total', value: `${f(sh.H, 1)} m`, kid: true },
      { label: 'Potencia en el eje', value: `${f(Pshaft, 1)} kW` },
      { label: 'Motor comercial', value: Number.isFinite(motor) ? `${f(motor, 1)} kW` : 'más de 315 kW', kid: true },
      { label: 'Energía al año', value: `${f(E / 1000, 1)} MWh` },
      { label: 'Costo de la energía al año (tarifa ilustrativa)', value: `$ ${f((E * tar) / 1e6, 1)} millones` },
    ],
    steps: [
      `Diámetro: el menor de PVC con velocidad de ${f(Vmax, 2)} m/s o menos: ${pick.name}, V = Q/A = ${f(sh.V, 2)} m/s.`,
      `Altura dinámica total: Hs + hf + hm = ${f(Hs, 1)} + ${f(sh.hf, 2)} + ${f(sh.hm, 2)} = ${f(sh.H, 2)} m (Darcy-Weisbach, ${PIPE_MATS[m].name}).`,
      `Potencia hidráulica ρ·g·Q·H = ${f(Pw, 2)} kW; en el eje, con η = ${f(eta * 100, 0)} %: ${f(Pshaft, 2)} kW; de la red, con el motor al ${f(etaM * 100, 0)} %: ${f(Pin, 2)} kW.`,
      `Motor: potencia en el eje más 15 % de margen = ${f(need, 2)} kW → tamaño comercial de ${Number.isFinite(motor) ? f(motor, 1) : '—'} kW.`,
      `Energía: ${f(Pin, 2)} kW × ${f(h, 0)} h/día × 365 = ${f(E, 0)} kWh/año para ${f(vol, 0)} m³ (${f(E / vol, 3)} kWh/m³).`,
    ],
    checks: [
      { name: `Velocidad de ${f(Vmax, 1)} m/s o menos`, ok: sh.V <= Vmax + 1e-9, value: `${f(sh.V, 2)} m/s` },
      { name: 'Hay un motor comercial que sirve', ok: Number.isFinite(motor), value: Number.isFinite(motor) ? `${f(motor, 1)} kW` : '—' },
    ],
    kid: `Para subir ${f(Q, 0)} litros por segundo hace falta un motor de unos ${Number.isFinite(motor) ? f(motor, 0) : 'muchos'} kilovatios.`,
    data: { kind: 'estacion', Q, Hs, L, K, mat: m, D: pick.D, H: sh.H },
  };
}

// ------------------------------------------------------------------ cavitación

function suctionVals(v: Vals) {
  return { z: num(v.z, 1495), T: num(v.T, 20), zs: num(v.zs, -3), Ls: num(v.Ls, 6), Ds: num(v.Ds, 203) / 1000, Ks: num(v.Ks, 3.4), Q: num(v.Q, 55), NPSHr: num(v.NPSHr, 3.9) };
}
const suctionOk = (s: ReturnType<typeof suctionVals>) => s.z >= -400 && s.z <= 6000 && s.T >= 0 && s.T <= 99 && s.Ls >= 0 && s.Ds > 0.01 && s.Ks >= 0 && s.Q >= 0 && s.NPSHr >= 0 && s.zs > -15 && s.zs < 50;

export function calcNpsh(v: Vals): Result {
  const s = suctionVals(v);
  if (!suctionOk(s)) return bad('Revisa los datos: altitud de −400 a 6 000 m, agua de 0 a 99 °C, diámetro, pérdidas, caudal y NPSH requerido positivos.');
  const a = npsha(s, s.Q);
  const margin = a.NPSHa - s.NPSHr;
  return {
    outs: [
      { label: 'NPSH disponible', value: `${f(a.NPSHa, 2)} m`, kid: true },
      { label: 'Margen sobre el requerido', value: `${f(margin, 2)} m`, kid: true },
      { label: 'Presión de la atmósfera', value: `${f(patm(s.z), 1)} kPa (${f(a.atm, 2)} m)` },
      { label: 'Presión de vapor del agua', value: `${f(pvap(s.T), 2)} kPa (${f(a.vap, 2)} m)` },
      { label: 'Pérdidas en la succión', value: `${f(a.hfs, 2)} m` },
    ],
    steps: [
      `Atmósfera estándar a ${f(s.z, 0)} m: p = 101,325·(1 − 2,256·10⁻⁵·z)^5,256 = ${f(patm(s.z), 2)} kPa → ${f(a.atm, 3)} m de agua (ρ = ${f(rhoWater(s.T), 1)} kg/m³ a ${f(s.T, 0)} °C).`,
      `Presión de vapor a ${f(s.T, 0)} °C (Tetens): ${f(pvap(s.T), 3)} kPa → ${f(a.vap, 3)} m.`,
      `Pérdidas en la succión con ${f(s.Q, 1)} L/s: fricción + locales (K = ${f(s.Ks, 2)}) = ${f(a.hfs, 3)} m, V = ${f(a.V, 2)} m/s.`,
      `NPSH disponible = (patm − pv)/(ρg) + zs − pérdidas = ${f(a.atm, 2)} − ${f(a.vap, 2)} ${s.zs >= 0 ? '+' : '−'} ${f(Math.abs(s.zs), 2)} − ${f(a.hfs, 2)} = ${f(a.NPSHa, 2)} m.`,
      `Margen = NPSHa − NPSHr = ${f(a.NPSHa, 2)} − ${f(s.NPSHr, 2)} = ${f(margin, 2)} m.`,
    ],
    checks: [
      { name: 'No cavita (NPSH disponible mayor que el requerido)', ok: margin > 0, value: `${f(margin, 2)} m` },
      { name: `Margen de ${f(NPSH_MARGIN, 1)} m o más (criterio usual)`, ok: margin >= NPSH_MARGIN, value: `${f(margin, 2)} m` },
    ],
    kid: margin >= NPSH_MARGIN ? 'El agua entra a la bomba sin hervir.' : margin > 0 ? 'Está justo: el agua casi hierve en la entrada de la bomba.' : 'El agua hierve en la entrada de la bomba y las burbujas la dañan.',
    data: { kind: 'npsh', ...s, NPSHa: a.NPSHa },
  };
}

/** Altura máxima de la bomba sobre el agua [m] (negativa: debe quedar por debajo). */
export function maxSuctionLift(z: number, T: number, hfs: number, NPSHr: number, margin = NPSH_MARGIN): number {
  const rho = rhoWater(T);
  return (patm(z) * 1000) / (rho * G) - (pvap(T) * 1000) / (rho * G) - hfs - NPSHr - margin;
}

export function preSuccion(v: Vals): Result {
  const s = suctionVals(v);
  const mg = num(v.mg, NPSH_MARGIN);
  if (!suctionOk(s) || !(mg >= 0)) return bad('Revisa los datos: altitud de −400 a 6 000 m, agua de 0 a 99 °C, diámetro, pérdidas, caudal, NPSH requerido y margen positivos.');
  const hfs = npsha({ ...s, zs: 0 }, s.Q).hfs;
  const lift = maxSuctionLift(s.z, s.T, hfs, s.NPSHr, mg);
  const check = npsha({ ...s, zs: -lift }, s.Q).NPSHa - s.NPSHr;
  return {
    outs: [
      { label: lift >= 0 ? 'Altura máxima de la bomba sobre el agua' : 'La bomba debe quedar bajo el agua al menos', value: `${f(Math.abs(lift), 2)} m`, kid: true },
      { label: 'Pérdidas en la succión', value: `${f(hfs, 2)} m` },
      { label: 'Margen con esa altura', value: `${f(check, 2)} m` },
    ],
    steps: [
      `Se despeja zs de NPSHa = NPSHr + margen: altura sobre el agua = (patm − pv)/(ρg) − pérdidas − NPSHr − margen.`,
      `= ${f(maxSuctionLift(s.z, s.T, 0, 0, 0), 2)} − ${f(hfs, 2)} − ${f(s.NPSHr, 2)} − ${f(mg, 2)} = ${f(lift, 2)} m.`,
      lift >= 0 ? `La bomba puede quedar hasta ${f(lift, 2)} m por encima del nivel más bajo del agua.` : `Con estos datos la bomba debe quedar «ahogada»: su eje al menos ${f(-lift, 2)} m por debajo del nivel más bajo del agua.`,
    ],
    checks: [{ name: `Margen de ${f(mg, 1)} m con la altura propuesta`, ok: check >= mg - 1e-6, value: `${f(check, 2)} m` }],
    kid: lift >= 0 ? `La bomba puede estar hasta ${f(lift, 1)} metros más arriba que el agua.` : `La bomba tiene que estar ${f(-lift, 1)} metros más abajo que el agua.`,
    data: { kind: 'succion', z: s.z, T: s.T, hfs, NPSHr: s.NPSHr, mg, lift },
  };
}

// ------------------------------------------------------------------ la central

function hydroVals(v: Vals) {
  return { Hg: num(v.Hg, 90), Qd: num(v.Qd, 1.6), D: num(v.D, 0.8), L: num(v.L, 180), tur: turb(v), Q50: num(v.Q50, 1.2), eco: num(v.eco, 0.18), etaG: num(v.etaG, 95) / 100 };
}
const hydroOk = (s: ReturnType<typeof hydroVals>) => s.Hg > 0 && s.Hg <= 2000 && s.Qd > 0 && s.Qd <= 200 && s.D > 0.05 && s.D <= 10 && s.L > 0 && s.Q50 > 0 && s.eco >= 0 && s.etaG > 0.5 && s.etaG <= 1;

export function calcCentral(v: Vals): Result {
  const s = hydroVals(v);
  if (!hydroOk(s)) return bad('Revisa los datos: caída, caudales, diámetro y largo mayores que cero; eficiencia del generador entre 50 % y 100 %.');
  const r = hydro({ Hg: s.Hg, Qd: s.Qd, D: s.D, L: s.L, turbine: s.tur, Q50: s.Q50, Qeco: s.eco, etaG: s.etaG });
  const T = TURBINES[s.tur];
  const homes = (r.E * 1000) / (150 * 12);
  const eta = turbineEta(s.tur, 1);
  return {
    outs: [
      { label: 'Potencia con el caudal de diseño', value: `${f(r.P, 0)} kW`, kid: true },
      { label: 'Altura neta', value: `${f(r.Hn, 1)} m` },
      { label: 'Energía al año', value: `${f(r.E, 0)} MWh`, kid: true },
      { label: 'Factor de planta', value: `${f(r.cf * 100, 0)} %` },
      { label: 'Hogares que abastece (150 kWh/mes)', value: f(homes, 0), kid: true },
    ],
    steps: [
      `Tubería de presión de acero, ${f(s.D, 2)} m y ${f(s.L, 0)} m: con ${f(s.Qd, 2)} m³/s, V = ${f(r.V, 2)} m/s y pérdidas (fricción + 10 % de locales) = ${f(r.hf, 2)} m; altura neta Hn = ${f(s.Hg, 1)} − ${f(r.hf, 2)} = ${f(r.Hn, 2)} m.`,
      `Potencia: P = ρ·g·Q·Hn·ηt·ηg = 1000·9,81·${f(s.Qd, 2)}·${f(r.Hn, 2)}·${f(eta, 2)}·${f(s.etaG, 2)}/1000 = ${f(r.P, 1)} kW (turbina ${T.name}).`,
      `Curva de duración del río (ilustrativa, mediana ${f(s.Q50, 2)} m³/s); caudal turbinado = mín(Qrío − ${f(s.eco, 2)}, ${f(s.Qd, 2)}); la turbina para por debajo del ${f(T.minFrac * 100, 0)} % de su caudal de diseño.`,
      `Energía = potencia media × 8 760 h = ${f(r.E, 0)} MWh/año; factor de planta = potencia media / potencia de diseño = ${f(r.cf * 100, 1)} %.`,
    ],
    checks: [
      { name: `La turbina ${T.name} sirve para esa altura y caudal`, ok: r.fits.includes(s.tur), value: `Hn ${f(r.Hn, 0)} m, Q ${f(s.Qd, 2)} m³/s` },
      { name: 'Pérdidas en la tubería de 5 % de la caída o menos (criterio usual)', ok: r.hf <= 0.05 * s.Hg, value: `${f((r.hf / s.Hg) * 100, 1)} %` },
    ],
    kid: `La central da ${f(r.P, 0)} kilovatios: alcanza para unas ${f(homes, 0)} casas.`,
    data: { kind: 'central', Hg: s.Hg, Qd: s.Qd, D: s.D, L: s.L, tur: s.tur, Q50: s.Q50, eco: s.eco, etaG: s.etaG },
  };
}

export function preTuberia(v: Vals): Result {
  const s = hydroVals(v);
  const maxPct = num(v.pct, 5);
  if (!hydroOk(s) || !(maxPct > 0 && maxPct < 50)) return bad('Revisa los datos: caída, caudal y largo mayores que cero; pérdida máxima entre 0 y 50 %.');
  const loss = (D: number) => hydroPower({ Hg: s.Hg, Qd: s.Qd, D, L: s.L, turbine: s.tur, Q50: s.Q50, Qeco: s.eco, etaG: s.etaG }, s.Qd).hf;
  let D = 0.1;
  while (D < 6 && loss(D) > (maxPct / 100) * s.Hg) D = Math.round((D + 0.05) * 100) / 100;
  const hf = loss(D);
  const V = s.Qd / ((Math.PI * D * D) / 4);
  const t = Math.max(6, ((RHO * G * s.Hg * 1.3 * D) / (2 * 0.6 * 250e6)) * 1000 + 1.5);
  return {
    outs: [
      { label: 'Diámetro de la tubería de presión', value: `${f(D, 2)} m`, kid: true },
      { label: 'Pérdidas', value: `${f(hf, 2)} m (${f((hf / s.Hg) * 100, 1)} % de la caída)` },
      { label: 'Velocidad', value: `${f(V, 2)} m/s` },
      { label: 'Espesor de acero (orientativo)', value: `${f(t, 1)} mm` },
    ],
    steps: [
      `Se prueba en pasos de 0,05 m el menor diámetro con pérdidas de ${f(maxPct, 1)} % de la caída o menos (Darcy-Weisbach en acero más 10 % de locales).`,
      `D = ${f(D, 2)} m: hf = ${f(hf, 2)} m = ${f((hf / s.Hg) * 100, 2)} % de ${f(s.Hg, 1)} m; V = ${f(V, 2)} m/s.`,
      `Espesor por presión (fórmula de Barlow) con 30 % de sobrepresión por golpe de ariete, acero de 250 MPa al 60 % y 1,5 mm de corrosión, con un mínimo de 6 mm para manipularla: ${f(t, 1)} mm.`,
    ],
    checks: [
      { name: `Pérdidas de ${f(maxPct, 1)} % o menos`, ok: hf <= (maxPct / 100) * s.Hg + 1e-9, value: `${f((hf / s.Hg) * 100, 1)} %` },
      { name: 'Velocidad de 5 m/s o menos (criterio usual)', ok: V <= 5, value: `${f(V, 2)} m/s` },
    ],
    kid: `El tubo que baja el agua a la turbina debe medir unos ${f(D * 100, 0)} centímetros por dentro.`,
    data: { kind: 'tuberia', Hg: s.Hg, Qd: s.Qd, L: s.L, tur: s.tur, Q50: s.Q50, eco: s.eco, etaG: s.etaG, D, pct: maxPct },
  };
}

// ------------------------------------------------------------------ gráficas de la memoria

registerPlan(calcOperacion, (d) => {
  const p: PumpCurve = { H0: N(d.H0), a: N(d.a), Qbep: N(d.Qbep), etaMax: N(d.eta), NPSHr0: 0, b: 0, N0: 1750, name: '' };
  const arr = String(d.arr) as Arrangement, n = N(d.n);
  const sys: SystemInput = { Hs: N(d.Hs), L: N(d.L), D: N(d.D), mat: String(d.mat) as PipeMat, K: N(d.K), T: 20 };
  const Qtop = (arr === 'paralelo' ? 2 : 1) * n * Math.sqrt(p.H0 / p.a);
  const qs = Array.from({ length: 31 }, (_, k) => (k / 30) * Qtop);
  return {
    chart: {
      title: 'Punto de operación',
      xLabel: 'caudal (L/s)',
      yLabel: 'altura (m)',
      series: [
        { name: ARRANGEMENTS[arr].toLowerCase(), pts: qs.map((q) => [q, Math.max(0, setHead(p, arr, q, n))] as XY) },
        { name: 'sistema', pts: qs.map((q) => [q, systemHead(sys, q).H] as XY), dash: true },
      ],
      mark: N(d.Q) > 0 ? { at: [N(d.Q), N(d.H)] as XY, text: 'operación' } : undefined,
      hlines: [{ y: N(d.Hs), text: 'altura estática' }],
    },
  };
});
registerPlan(preEstacion, (d) => {
  const sys: SystemInput = { Hs: N(d.Hs), L: N(d.L), D: N(d.D), mat: String(d.mat) as PipeMat, K: N(d.K), T: 20 };
  const qs = Array.from({ length: 31 }, (_, k) => (k / 30) * N(d.Q) * 1.6);
  const k = PVC_DIAMETERS.findIndex((x) => x.D === N(d.D));
  const series = [{ name: `sistema ${PVC_DIAMETERS[k]?.name ?? ''}`, pts: qs.map((q) => [q, systemHead(sys, q).H] as XY) }];
  const smaller = PVC_DIAMETERS[k - 1];
  if (smaller) series.push({ name: `con ${smaller.name}`, pts: qs.map((q) => [q, Math.min(systemHead({ ...sys, D: smaller.D }, q).H, systemHead(sys, qs[30]).H * 2)] as XY) });
  return { chart: { title: 'Curva del sistema y punto de diseño', xLabel: 'caudal (L/s)', yLabel: 'altura (m)', series, mark: { at: [N(d.Q), N(d.H)] as XY, text: 'diseño' }, hlines: [{ y: N(d.Hs), text: 'altura estática' }] } };
});
registerPlan(calcNpsh, (d) => {
  const s = { z: N(d.z), T: N(d.T), zs: N(d.zs), Ls: N(d.Ls), Ds: N(d.Ds), Ks: N(d.Ks) };
  const Qm = Math.max(10, N(d.Q) * 1.8);
  const qs = Array.from({ length: 31 }, (_, k) => (k / 30) * Qm);
  return { chart: { title: 'NPSH disponible según el caudal', xLabel: 'caudal (L/s)', yLabel: 'NPSH (m)', series: [{ name: 'disponible', pts: qs.map((q) => [q, npsha(s, q).NPSHa] as XY) }], hlines: [{ y: N(d.NPSHr), text: 'requerido' }], mark: { at: [N(d.Q), N(d.NPSHa)] as XY, text: 'ahora' } } };
});
registerPlan(preSuccion, (d) => {
  const Ts = Array.from({ length: 19 }, (_, k) => 5 + k * 5);
  return { chart: { title: 'Altura máxima de la bomba sobre el agua según la temperatura', xLabel: 'temperatura del agua (°C)', yLabel: 'altura sobre el agua (m)', series: [{ name: 'máxima', pts: Ts.map((T) => [T, maxSuctionLift(N(d.z), T, N(d.hfs), N(d.NPSHr), N(d.mg))] as XY) }], hlines: [{ y: 0, text: 'nivel del agua' }], mark: { at: [N(d.T), N(d.lift)] as XY, text: 'este caso' } } };
});
const powerCurve = (d: Record<string, number | string>) => {
  const r = hydro({ Hg: N(d.Hg), Qd: N(d.Qd), D: N(d.D), L: N(d.L), turbine: String(d.tur) as Turbine, Q50: N(d.Q50), Qeco: N(d.eco), etaG: N(d.etaG) }, 60);
  return r.curve.map((c) => [c.p * 100, c.P] as XY);
};
registerPlan(calcCentral, (d) => ({ chart: { title: 'Potencia a lo largo del año (curva de duración)', xLabel: 'tiempo en que se iguala o supera (%)', yLabel: 'potencia (kW)', series: [{ name: 'potencia', pts: powerCurve(d) }] } }));
registerPlan(preTuberia, (d) => {
  const Ds = Array.from({ length: 30 }, (_, k) => Math.max(0.15, N(d.D) * (0.5 + (k / 29) * 1.5)));
  const pct = (D: number) => Math.min(60, (hydroPower({ Hg: N(d.Hg), Qd: N(d.Qd), D, L: N(d.L), turbine: String(d.tur) as Turbine, Q50: N(d.Q50), Qeco: N(d.eco), etaG: N(d.etaG) }, N(d.Qd)).hf / N(d.Hg)) * 100);
  return { chart: { title: 'Pérdidas en la tubería según su diámetro', xLabel: 'diámetro (m)', yLabel: 'pérdidas (% de la caída)', series: [{ name: 'pérdidas', pts: Ds.map((D) => [D, pct(D)] as XY) }], hlines: [{ y: N(d.pct), text: 'máximo' }], mark: { at: [N(d.D), pct(N(d.D))] as XY, text: 'propuesto' } } };
});

// ------------------------------------------------------------------ juegos de herramientas

const NORM =
  'En esta sala no se citan artículos de normas. La región preferida de operación (70 % a 120 % del mejor caudal), las velocidades de 0,6 a 2 m/s en impulsiones, el margen de NPSH de 0,5 m y las pérdidas de 5 % en la tubería de presión son criterios usuales de la práctica, para aprender. Las curvas de bombas son ilustrativas: un diseño real usa las curvas del fabricante, el estudio de golpe de ariete y lo que pidan las normas del sector.';
const MAT_OPTS = (Object.keys(PIPE_MATS) as PipeMat[]).map((k) => ({ value: k, label: `${PIPE_MATS[k].name} (ε ${PIPE_MATS[k].eps * 1000} mm)` }));
const ARR_OPTS = (Object.keys(ARRANGEMENTS) as Arrangement[]).map((k) => ({ value: k, label: ARRANGEMENTS[k] }));
const TUR_OPTS = (Object.keys(TURBINES) as Turbine[]).map((k) => ({ value: k, label: `${TURBINES[k].name} (${TURBINES[k].H[0]} a ${TURBINES[k].H[1]} m)` }));
const CURVE_FIELDS = [
  { id: 'H0', label: 'Altura a caudal cero (catálogo)', unit: 'm', def: 52 },
  { id: 'Qmax', label: 'Caudal a altura cero (catálogo)', unit: 'L/s', def: 97 },
  { id: 'Qbep', label: 'Caudal de mejor eficiencia', unit: 'L/s', def: 55 },
  { id: 'eta', label: 'Eficiencia máxima', unit: '%', def: 78 },
];
const SUCTION_FIELDS = [
  { id: 'z', label: 'Altitud del lugar', unit: 'm', def: 1495, kid: true },
  { id: 'T', label: 'Temperatura del agua', unit: '°C', def: 20, kid: true },
  { id: 'Ls', label: 'Largo de la succión', unit: 'm', def: 6 },
  { id: 'Ds', label: 'Diámetro de la succión', unit: 'mm', def: 203 },
  { id: 'Ks', label: 'Pérdidas locales de la succión (K)', def: 3.4 },
  { id: 'Q', label: 'Caudal', unit: 'L/s', def: 55 },
  { id: 'NPSHr', label: 'NPSH requerido (catálogo)', unit: 'm', def: 3.9 },
];
const HYDRO_FIELDS = [
  { id: 'Hg', label: 'Caída bruta', unit: 'm', def: 90, kid: true },
  { id: 'Qd', label: 'Caudal de diseño', unit: 'm³/s', def: 1.6, kid: true },
  { id: 'L', label: 'Largo de la tubería de presión', unit: 'm', def: 180 },
  { id: 'tur', label: 'Turbina', def: 'francis', options: TUR_OPTS },
  { id: 'Q50', label: 'Caudal mediano del río', unit: 'm³/s', def: 1.2 },
  { id: 'eco', label: 'Caudal que se deja en el río', unit: 'm³/s', def: 0.18 },
  { id: 'etaG', label: 'Eficiencia del generador', unit: '%', def: 95 },
];

export const PUMP_TOOLS: Record<'bomba' | 'cavitacion' | 'central', ToolSet> = {
  bomba: {
    norm: NORM,
    calc: {
      title: 'Calculadora del punto de operación',
      intro: 'Caudal, altura, eficiencia y potencia de una bomba (o dos en serie o en paralelo) contra una tubería, con las leyes de afinidad para cambiar la velocidad.',
      kidIntro: '¿Cuánta agua sube la bomba?',
      fields: [
        ...CURVE_FIELDS,
        { id: 'arr', label: 'Arreglo', def: 'una', kid: true, options: ARR_OPTS },
        { id: 'n', label: 'Velocidad (100 % = nominal)', unit: '%', def: 100 },
        { id: 'Hs', label: 'Altura estática', unit: 'm', def: 28, kid: true },
        { id: 'L', label: 'Largo de la tubería', unit: 'm', def: 450 },
        { id: 'D', label: 'Diámetro interno', unit: 'mm', def: 152, kid: true },
        { id: 'mat', label: 'Material', def: 'pvc', options: MAT_OPTS },
        { id: 'K', label: 'Suma de pérdidas locales (K)', def: 5 },
      ],
      run: calcOperacion,
    },
    pre: {
      title: 'Prediseño de una estación de bombeo',
      intro: 'Diámetro de la impulsión, altura dinámica total, motor comercial y energía al año para subir un caudal a un tanque.',
      kidIntro: '¿Qué motor hace falta para subir el agua?',
      fields: [
        { id: 'Q', label: 'Caudal que se necesita', unit: 'L/s', def: 40, kid: true },
        { id: 'Hs', label: 'Altura estática', unit: 'm', def: 28, kid: true },
        { id: 'L', label: 'Largo de la tubería', unit: 'm', def: 450 },
        { id: 'mat', label: 'Material', def: 'pvc', options: MAT_OPTS },
        { id: 'K', label: 'Suma de pérdidas locales (K)', def: 5 },
        { id: 'Vmax', label: 'Velocidad máxima', unit: 'm/s', def: 1.5 },
        { id: 'eta', label: 'Eficiencia de la bomba', unit: '%', def: 72 },
        { id: 'etaM', label: 'Eficiencia del motor', unit: '%', def: 90 },
        { id: 'h', label: 'Horas de bombeo al día', unit: 'h', def: 16, kid: true },
        { id: 'tar', label: 'Tarifa de energía (ilustrativa)', unit: '$/kWh', def: 800 },
      ],
      run: preEstacion,
    },
  },
  cavitacion: {
    norm: NORM,
    calc: { title: 'Calculadora del NPSH disponible', intro: 'Cuánta presión le queda al agua en la entrada de la bomba, comparada con la que pide el fabricante para no cavitar.', kidIntro: '¿Hierve el agua en la bomba?', fields: [...SUCTION_FIELDS.slice(0, 2), { id: 'zs', label: 'Nivel del agua sobre el eje (negativo si la bomba está arriba)', unit: 'm', def: -3, kid: true }, ...SUCTION_FIELDS.slice(2)], run: calcNpsh },
    pre: { title: 'Prediseño de la altura de la bomba', intro: 'Hasta qué altura sobre el agua puede quedar la bomba sin cavitar, o cuánto debe quedar por debajo.', kidIntro: '¿Qué tan arriba del agua puede estar la bomba?', fields: [...SUCTION_FIELDS, { id: 'mg', label: 'Margen de seguridad', unit: 'm', def: NPSH_MARGIN }], run: preSuccion },
  },
  central: {
    norm: NORM,
    calc: { title: 'Calculadora de una pequeña central de pasada', intro: 'Potencia, altura neta, energía al año y factor de planta con la curva de duración del río.', kidIntro: '¿Cuánta luz da el río?', fields: [...HYDRO_FIELDS.slice(0, 2), { id: 'D', label: 'Diámetro de la tubería de presión', unit: 'm', def: 0.8 }, ...HYDRO_FIELDS.slice(2)], run: calcCentral },
    pre: { title: 'Prediseño de la tubería de presión', intro: 'Menor diámetro de la tubería de acero con el que las pérdidas no pasan del porcentaje de la caída pedido.', kidIntro: '¿Qué tan grueso debe ser el tubo?', fields: [...HYDRO_FIELDS, { id: 'pct', label: 'Pérdida máxima', unit: '% de la caída', def: 5 }], run: preTuberia },
  },
};

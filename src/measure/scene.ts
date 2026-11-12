// Escenas ilustrativas de la sala «Medir el agua»: una estación meteorológica con su pluviómetro de balancín y un
// radar en una loma; una estación de aforo en un río de montaña; y un banco de tuberías con un Venturi y una placa
// de orificio. Los valores son típicos, no de un lugar real.

import { G, GAUGINGS, NU, TIP_MM, ZR, bestH0, catchRatio, dbz, fitRating, gauge, gaugeIntensity, meterDp, meterFlow, meterValid, rainFromDbz, ratingQ, storm, trueFlow, type Method, type ZRKey } from './measure';

// ------------------------------------------------------------------ parte 1: medir la lluvia

export interface RainScene {
  /** Intensidad de la lluvia [mm/h] (pico del aguacero cuando se reproduce). */
  I: number;
  /** Viento a la altura de la boca [m/s]. */
  u: number;
  /** Tipo de lluvia (fija su relación Z-R verdadera) y relación que usa el radar. */
  type: ZRKey;
  algo: ZRKey;
}

export const DEFAULT_RAIN: RainScene = { I: 40, u: 2, type: 'conv', algo: 'mp' };

export function rainScene(s: RainScene) {
  const Im = gaugeIntensity(s.I, s.u);
  const Z = dbz(s.I, s.type);
  const Rr = rainFromDbz(Z, s.algo);
  const st = storm(s.I, s.u);
  return {
    Im,
    errGauge: Im / s.I - 1,
    errWind: catchRatio(s.u) - 1,
    tipsPerHour: Im / TIP_MM,
    Z,
    Rr,
    errRadar: Rr / s.I - 1,
    storm: st,
    errStorm: st.totalM / st.total - 1,
  };
}

/** Escala de colores del radar por dBZ (como las de los servicios meteorológicos). */
export const DBZ_COLORS: [number, string][] = [
  [5, '#9ad8f0'],
  [15, '#3fa9e0'],
  [20, '#1f6fd1'],
  [25, '#3ccf4e'],
  [30, '#249c34'],
  [35, '#167522'],
  [40, '#f4e83b'],
  [45, '#e8b52c'],
  [50, '#e8792b'],
  [55, '#d93b2b'],
  [60, '#a3202a'],
  [65, '#d64fd6'],
];
export const dbzColor = (d: number) => {
  let c = 'transparent';
  for (const [v, col] of DBZ_COLORS) if (d >= v) c = col;
  return c;
};

// ------------------------------------------------------------------ parte 2: aforar el río

export interface RiverScene {
  /** Nivel en la regla [m]. */
  h: number;
  /** Número de verticales del aforo. */
  N: number;
  method: Method;
  /** Nivel de caudal cero de la curva de gasto elegido a mano [m]. */
  h0: number;
}

export const DEFAULT_RIVER: RiverScene = { h: 1.5, N: 8, method: '06', h0: 0 };
export const H_MAX_GAUGED = Math.max(...GAUGINGS.map((g) => g.h));

export function riverScene(s: RiverScene) {
  const t = trueFlow(s.h);
  const g = gauge(s.h, s.N, s.method);
  const fit = fitRating(GAUGINGS, s.h0);
  const best = bestH0(GAUGINGS);
  const Qc = ratingQ(fit, s.h), Qb = ratingQ(best, s.h);
  return {
    true: t,
    g,
    err: g.Q / t.Q - 1,
    fit,
    best,
    Qc,
    Qb,
    errCurve: fit.ok ? Qc / t.Q - 1 : NaN,
    errBest: Qb / t.Q - 1,
    extrapolated: s.h > H_MAX_GAUGED,
    V: t.Q / Math.max(1e-6, t.A),
  };
}

// ------------------------------------------------------------------ parte 3: medidores en la tubería

/** Banco de tuberías: PVC de 100 mm, agua a 20 °C, en Medellín. */
export const LAB_D = 0.1;
export const LAB_PATM_M = 8.62; // 84,6 kPa en metros de agua
export const PV_M = 0.24; // presión de vapor a 20 °C en metros de agua
/** Resolución de la regla de los piezómetros [m]. */
export const READ_RES = 0.001;

export interface PipeScene {
  /** Caudal [L/s]. */
  Q: number;
  /** Razón de diámetros de los dos medidores. */
  beta: number;
  /** Presión en la tubería antes del Venturi [m de agua sobre la atmósfera]. */
  H: number;
}

export const DEFAULT_PIPE: PipeScene = { Q: 8, beta: 0.6, H: 6 };

export function pipeScene(s: PipeScene) {
  const q = s.Q / 1000;
  const v = meterDp('venturi', q, LAB_D, s.beta), o = meterDp('orificio', q, LAB_D, s.beta);
  // lecturas redondeadas al milímetro y el caudal que se calcula con ellas
  const rv = Math.round(v.dh / READ_RES) * READ_RES, ro = Math.round(o.dh / READ_RES) * READ_RES;
  const Qv = meterFlow('venturi', rv, LAB_D, s.beta) * 1000, Qo = meterFlow('orificio', ro, LAB_D, s.beta) * 1000;
  // incertidumbre de lectura: medio milímetro sobre la diferencia; el caudal va con la raíz
  const uv = v.dh > 0 ? (0.5 * (READ_RES / 2)) / v.dh : 1, uo = o.dh > 0 ? (0.5 * (READ_RES / 2)) / o.dh : 1;
  // presiones a lo largo: Venturi (entrada, garganta, salida), luego la placa (antes, vena contracta, recuperada)
  const fr = (L: number) => 0.0185 * (L / LAB_D) * (v.V1 * v.V1) / (2 * G); // fricción del tubo entre tomas
  const pIn = s.H;
  const pThroat = pIn - v.dh;
  const pOutV = pIn - v.loss - fr(1.2);
  const pBeforeO = pOutV - fr(1.5);
  const pVena = pBeforeO - o.dh;
  const pAfterO = pBeforeO - o.loss - fr(0.8);
  const throatAbs = LAB_PATM_M + pThroat, venaAbs = LAB_PATM_M + pVena;
  const ReD = (q / ((Math.PI * LAB_D * LAB_D) / 4)) * LAB_D / NU;
  return {
    v,
    o,
    rv,
    ro,
    Qv,
    Qo,
    uv,
    uo,
    piezo: [pIn, pThroat, pOutV, pBeforeO, pVena, pAfterO],
    throatAbs,
    venaAbs,
    cavV: throatAbs <= PV_M,
    cavO: venaAbs <= PV_M,
    ReD,
    warnV: meterValid('venturi', LAB_D, s.beta, ReD),
    warnO: meterValid('orificio', LAB_D, s.beta, ReD),
    Vel: v.V1,
  };
}

export { ZR };

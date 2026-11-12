// Escenas ilustrativas de la sala «Bombas y energía del agua»: una estación que sube agua de un tanque bajo a uno
// alto en una loma, la entrada de una bomba donde el agua puede hervir, y una pequeña central de pasada en un río de
// montaña. Las bombas, las tuberías y el río son ilustrativos (valores típicos), no de un lugar real.

import { FITTINGS, PIPE_MATS, PVC_DIAMETERS, gateK } from '../supply/pipes';
import { NPSH_MARGIN, PUMP, fdc, hydro, hydroPower, maxFlowNoCav, npsha, npshr, operatingPoint, patm, pumpEta, pvap, setHead, turbineEta, type Arrangement, type HydroInput, type SuctionInput, type SystemInput, type Turbine } from './pump';

// ------------------------------------------------------------------ parte 1: la bomba y la tubería

/** Diámetros que ofrece la escena (tubería de PVC). */
export const PUMP_DIAMETERS = PVC_DIAMETERS.filter((d) => d.D >= 0.1 && d.D <= 0.26);
/** Largo de la tubería de impulsión que sube la loma [m]. */
export const PUMP_L = 450;
/** Pérdidas locales de la impulsión sin la válvula: entrada, cuatro codos, válvula de retención (K ≈ 2) y salida. */
export const K_FIXED = FITTINGS.entrada.K + 4 * FITTINGS.codo90.K + 2 + FITTINGS.salida.K;

export interface PumpScene {
  /** Velocidad relativa del motor (1 = nominal, con variador de frecuencia). */
  n: number;
  /** Altura estática del tanque bajo al alto [m]. */
  Hs: number;
  /** Índice del diámetro en PUMP_DIAMETERS. */
  d: number;
  arr: Arrangement;
  /** Apertura de la válvula de descarga (0,1 a 1). */
  open: number;
}

export const DEFAULT_PUMP: PumpScene = { n: 1, Hs: 28, d: 1, arr: 'una', open: 1 };

export function pumpSystem(s: PumpScene): SystemInput {
  return { Hs: s.Hs, L: PUMP_L, D: PUMP_DIAMETERS[s.d].D, mat: 'pvc', K: K_FIXED + gateK(s.open), T: 20 };
}

export function pumpScene(s: PumpScene) {
  const sys = pumpSystem(s);
  const op = operatingPoint(PUMP, s.arr, s.n, sys);
  const bep = PUMP.etaMax;
  /** Presiones a la salida de la bomba y a la llegada al tanque alto [m de columna de agua]. */
  const pOut = op.flows ? op.H : setHead(PUMP, s.arr, 0, s.n);
  return { ...op, sys, bep, pOut, Dname: PUMP_DIAMETERS[s.d].name, D: sys.D, valveK: gateK(s.open), etaRel: op.eta / bep };
}

/**
 * Dos maneras de bajar el caudal a Qt: cerrar la válvula de descarga (la bomba gira igual y la válvula quema la
 * energía sobrante) o bajar la velocidad con un variador (leyes de afinidad). Devuelve null si Qt no se alcanza.
 */
export function throttleVsSpeed(s: PumpScene, Qt: number) {
  const full = pumpScene({ ...s, open: 1, n: 1 });
  if (!full.flows || Qt <= 0 || Qt >= full.Q) return null;
  const bisect = (g: (x: number) => number, lo: number, hi: number) => {
    for (let k = 0; k < 70; k++) {
      const m = (lo + hi) / 2;
      if (g(m) < Qt) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  const qOpen = (o: number) => pumpScene({ ...s, n: 1, open: o }).Q;
  const qSpeed = (n: number) => pumpScene({ ...s, open: 1, n }).Q;
  if (qOpen(0.1) > Qt) return null;
  const open = bisect(qOpen, 0.1, 1), n = bisect(qSpeed, 0.2, 1);
  const a = pumpScene({ ...s, n: 1, open }), b = pumpScene({ ...s, open: 1, n });
  return { open, n, valve: a, speed: b, saving: 1 - b.Pshaft / a.Pshaft };
}

// ------------------------------------------------------------------ parte 2: el agua hierve en la bomba

export const PLACES: { name: string; z: number }[] = [
  { name: 'Nivel del mar', z: 0 },
  { name: 'Medellín (1 495 m)', z: 1495 },
  { name: 'Bogotá (2 600 m)', z: 2600 },
  { name: 'Páramo (3 500 m)', z: 3500 },
];

export interface CavScene {
  /** Índice del lugar en PLACES. */
  place: number;
  /** Temperatura del agua [°C]. */
  T: number;
  /** Nivel del agua sobre el eje de la bomba [m] (negativo: la bomba está más arriba y succiona). */
  zs: number;
  /** Caudal que se bombea [L/s]. */
  Q: number;
}

export const DEFAULT_CAV: CavScene = { place: 1, T: 20, zs: -3, Q: 55 };
/** Tubería de succión de la escena: 6 m de acero de 8", con válvula de pie (K ≈ 2,5) y un codo. */
export const SUCTION = { Ls: 6, Ds: 0.2027, Ks: 2.5 + FITTINGS.codo90.K };

export function suction(s: CavScene): SuctionInput {
  return { z: PLACES[s.place].z, T: s.T, zs: s.zs, ...SUCTION };
}

export function cavScene(s: CavScene) {
  const inp = suction(s);
  const a = npsha(inp, s.Q);
  const r = npshr(PUMP, s.Q);
  const margin = a.NPSHa - r;
  const Qmax = maxFlowNoCav(PUMP, inp);
  /** Presión absoluta en la entrada de la bomba [kPa]: lo que queda de la atmósfera después de subir y de las pérdidas. */
  const pIn = patm(inp.z) + (9.81 * (inp.zs - a.hfs - (a.V * a.V) / (2 * 9.81)) * 1000) / 1000;
  const state: 'ok' | 'justo' | 'cavita' = margin < 0 ? 'cavita' : margin < NPSH_MARGIN ? 'justo' : 'ok';
  /** Intensidad de la cavitación para la escena (0 a 1). */
  const cav = Math.max(0, Math.min(1, -margin / 3 + (state === 'justo' ? 0.08 : 0)));
  return { ...a, NPSHr: r, margin, Qmax, pIn, state, cav, patm: patm(inp.z), pv: pvap(s.T), inp };
}

// ------------------------------------------------------------------ parte 3: la central hidroeléctrica

/** Mediana del caudal del río de la escena [m³/s] (río de montaña ilustrativo). */
export const RIVER_Q50 = 1.2;
/** Largo de la tubería de presión por metro de caída: la tubería baja por la ladera con unos 30°. */
export const PENSTOCK_RATIO = 2;

export interface HydroScene {
  /** Caída bruta [m]. */
  Hg: number;
  /** Caudal de diseño [m³/s]. */
  Qd: number;
  /** Diámetro de la tubería de presión [m]. */
  D: number;
  turbine: Turbine;
  /** Caudal que se deja en el río, como fracción de la mediana. */
  eco: number;
  /** Época: probabilidad de que el río traiga más agua que hoy (5 % muy lluvioso … 95 % muy seco). */
  p: number;
}

export const DEFAULT_HYDRO: HydroScene = { Hg: 90, Qd: 1.6, D: 0.8, turbine: 'francis', eco: 0.15, p: 0.5 };

export function hydroInput(s: HydroScene): HydroInput {
  return { Hg: s.Hg, Qd: s.Qd, D: s.D, L: s.Hg * PENSTOCK_RATIO, turbine: s.turbine, Q50: RIVER_Q50, Qeco: s.eco * RIVER_Q50, etaG: 0.95 };
}

export function hydroScene(s: HydroScene) {
  const inp = hydroInput(s);
  const r = hydro(inp);
  const Qriver = fdc(RIVER_Q50, s.p);
  const Qt = Math.max(0, Math.min(s.Qd, Qriver - inp.Qeco));
  const now = hydroPower(inp, Qt);
  const eta = turbineEta(s.turbine, Qt / s.Qd);
  /** Casas que alcanza a abastecer en promedio y ahora [con 150 kWh/mes]. */
  const homes = (r.E * 1000) / (150 * 12);
  const homesNow = (now.P * 24 * 30) / 150;
  return { ...r, inp, Qriver, Qt, now, eta, homes, homesNow, inRange: r.fits.includes(s.turbine), lossPct: s.Hg > 0 ? (r.hf / s.Hg) * 100 : 0 };
}

export { PIPE_MATS, pumpEta };

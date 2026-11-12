// Escenas ilustrativas de la sala «El agua en casa»: una casa de cuatro personas en Medellín con sus aparatos y
// hábitos; su medidor y su factura con una tarifa ilustrativa; y un tanque de agua lluvia con un año de lluvia del
// régimen del valle de Aburrá. Los valores son típicos, no de una casa real.

import { BASIC_M3, COMPLEMENTARY_M3, RAIN_YEAR, STRATA, bill, dailyUse, hourly, tankYear, total, type Devices, type Habits, type TankInput, type Use } from './house';

// ------------------------------------------------------------------ parte 1: el consumo

export interface UseScene extends Habits, Devices {}

export const DEFAULT_USE: UseScene = { people: 4, shower: 7, flushes: 4, basin: 1.5, dishes: 12, loads: 3, hose: 0, lowShower: false, lowToilet: false, aerators: false, frontLoader: false, drip: false, toiletLeak: false };

export function useScene(s: UseScene) {
  const u = dailyUse(s, s);
  const L = total(u);
  const m3 = (L * 30) / 1000;
  const per = L / Math.max(1, s.people);
  const hrs = hourly(u);
  const byHour = Array.from({ length: 24 }, (_, h) => (Object.keys(hrs) as Use[]).reduce((a, k) => a + hrs[k][h], 0));
  const top = (Object.keys(u) as Use[]).sort((a, b) => u[b] - u[a])[0];
  const range = m3 <= BASIC_M3 ? 'básico' : m3 <= COMPLEMENTARY_M3 ? 'complementario' : 'suntuario';
  return { u, L, m3, per, hrs, byHour, top, range };
}

// ------------------------------------------------------------------ parte 2: el medidor y la factura

export interface BillScene {
  people: number;
  /** Litros por persona al día. */
  lpd: number;
  /** Fuga escondida [L/h]. */
  leak: number;
  stratum: number;
}

export const DEFAULT_BILL: BillScene = { people: 4, lpd: 120, leak: 0, stratum: 3 };
/** Lectura del medidor al empezar el mes (ilustrativa). */
export const START_READING = 1487.2316;

export function billScene(s: BillScene) {
  const use = (s.people * s.lpd * 30) / 1000;
  const leakM3 = (s.leak * 24 * 30) / 1000;
  const m3 = use + leakM3;
  const b = bill(m3, s.stratum);
  const noLeak = bill(use, s.stratum);
  const one = bill(BASIC_M3, 1), same = bill(BASIC_M3, s.stratum);
  return { use, leakM3, m3, b, noLeak, leakCost: b.total - noLeak.total, end: START_READING + m3, ratioVs1: same.total / one.total, stratum: STRATA[s.stratum] };
}

// ------------------------------------------------------------------ parte 3: el tanque de agua lluvia

export interface TankScene extends TankInput {}

export const DEFAULT_TANK: TankScene = { A: 60, C: 0.9, ff: 1, V: 1, D: 200 };

export function tankScene(s: TankScene) {
  const r = tankYear(s);
  const annual = RAIN_YEAR.reduce((a, b) => a + b, 0);
  return { ...r, annual, spillShare: r.captured > 0 ? r.spilled / r.captured : 0 };
}

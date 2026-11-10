// Monitoreo real de quebradas de Medellín (Secretaría de Medio Ambiente, San Antonio de Prado, diciembre de 2017
// y enero de 2018): lectura, agrupación por microcuenca y lo que dicen los datos frente al modelo. Funciones puras,
// probadas en tests/quality/model.test.ts (Q15). Los datos se usan tal como se publicaron.

import { MONITOREO_META, SITIOS, type SitioMonitoreo } from './data/monitoreo';
import { FISH, SWIM, doSat } from './model';

export { MONITOREO_META, SITIOS, type SitioMonitoreo };

/** Posición a lo largo del cauce, de la parte alta a la baja. */
export const SECTOR_LABEL: Record<string, string> = { ALTO: 'Alta', 'MEDIO-ALTO': 'Media alta', MEDIO: 'Media', 'MEDIO-BAJO': 'Media baja', BAJO: 'Baja' };

export interface Cuenca {
  name: string;
  /** Sitios de la parte alta a la baja (y, en la misma parte, de mayor a menor altura). */
  sitios: SitioMonitoreo[];
}

/** Microcuencas con sus sitios ordenados aguas abajo. */
export function cuencas(): Cuenca[] {
  const by = new Map<string, SitioMonitoreo[]>();
  for (const s of SITIOS) {
    const a = by.get(s.cuenca);
    if (a) a.push(s);
    else by.set(s.cuenca, [s]);
  }
  return [...by.entries()]
    .map(([name, ss]) => ({ name, sitios: [...ss].sort((a, b) => a.orden - b.orden || (b.altura ?? 0) - (a.altura ?? 0)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Temperatura del agua [°C] con la que el oxígeno de saturación de Benson y Krause, a la altitud del sitio, es el
 * que implican el oxígeno medido y su porcentaje de saturación (C_sat = OD / (sat/100)). Sirve para revisar que
 * los dos números del laboratorio son coherentes con la ecuación del modelo. null si no hay solución entre 0 y 40 °C.
 */
export function impliedTemp(od: number, satPct: number, elevM: number): number | null {
  if (!(od > 0) || !(satPct > 0)) return null;
  const target = od / (satPct / 100);
  let lo = 0, hi = 40;
  const f = (T: number) => doSat(T, elevM) - target;
  if (f(lo) < 0 || f(hi) > 0) return null; // doSat baja con la temperatura
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  const n = a.length;
  return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : NaN;
};

export interface Resumen {
  sitios: number;
  cuencas: number;
  conOxigeno: number;
  /** Sitios con oxígeno disuelto de al menos el mínimo para peces (5 mg/L). */
  oxigenoParaPeces: number;
  medianaOxigeno: number;
  medianaSaturacion: number;
  conColiformes: number;
  /** Sitios con coliformes fecales por encima del máximo para nadar (200 NMP/100 mL). */
  noNadar: number;
  /** Sitios donde se podría nadar por coliformes. */
  siNadar: string[];
  /** Microcuencas con sitio en la parte alta y en la baja, y en cuántas suben los coliformes aguas abajo. */
  conAltaYBaja: number;
  subenAguasAbajo: number;
  /** Temperatura implícita del agua: rango del 5 % al 95 % de los sitios, y cuántos quedan entre 10 y 26 °C. */
  tempP5: number;
  tempP95: number;
  tempCoherentes: number;
  tempEvaluados: number;
}

/** Lo que dicen los datos, calculado (no escrito a mano). */
export function resumen(): Resumen {
  const od = SITIOS.filter((s) => s.od !== null);
  const cf = SITIOS.filter((s) => s.cf !== null);
  const temps = SITIOS.map((s) => (s.od !== null && s.sat !== null && s.altura !== null ? impliedTemp(s.od, s.sat, s.altura) : null)).filter((t): t is number => t !== null);
  const ts = [...temps].sort((a, b) => a - b);
  const q = (p: number) => ts[Math.min(ts.length - 1, Math.max(0, Math.round(p * (ts.length - 1))))];
  let both = 0, up = 0;
  for (const c of cuencas()) {
    const alta = c.sitios.find((s) => s.orden === 0 && s.cf !== null);
    const baja = [...c.sitios].reverse().find((s) => s.orden === 4 && s.cf !== null);
    if (alta && baja) {
      both++;
      if ((baja.cf as number) > (alta.cf as number)) up++;
    }
  }
  return {
    sitios: SITIOS.length,
    cuencas: new Set(SITIOS.map((s) => s.cuenca)).size,
    conOxigeno: od.length,
    oxigenoParaPeces: od.filter((s) => (s.od as number) >= FISH.minDO).length,
    medianaOxigeno: median(od.map((s) => s.od as number)),
    medianaSaturacion: median(SITIOS.filter((s) => s.sat !== null).map((s) => s.sat as number)),
    conColiformes: cf.length,
    noNadar: cf.filter((s) => (s.cf as number) > SWIM.coliformsFecal).length,
    siNadar: cf.filter((s) => (s.cf as number) <= SWIM.coliformsFecal).map((s) => s.nombre),
    conAltaYBaja: both,
    subenAguasAbajo: up,
    tempP5: q(0.05),
    tempP95: q(0.95),
    tempCoherentes: temps.filter((t) => t >= 10 && t <= 26).length,
    tempEvaluados: temps.length,
  };
}

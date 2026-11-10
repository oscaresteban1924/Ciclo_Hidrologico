// Creciente desde la lluvia en la cuenca de la quebrada y aviso temprano.
//
// La misma lluvia del barrio cae sobre la cuenca de la quebrada, aguas arriba del sector. El caudal que llega
// al sector se calcula con los métodos del Servicio de Conservación de Recursos Naturales de EE. UU. (NRCS,
// National Engineering Handbook, parte 630):
//   · escorrentía por número de curva (cap. 10):  Q = (P − Ia)² / (P − Ia + S) si P > Ia;  S = 25 400/CN − 254 mm;
//     Ia = 0,2·S. Con suelo húmedo se usa el CN de humedad antecedente III: CN_III = 23·CN / (10 + 0,13·CN);
//   · tiempo de retardo (cap. 15, ecuación del retardo):  tL = ℓ^0,8 · (S' + 1)^0,7 / (1900 · Y^0,5)  [h],
//     con ℓ la longitud hidráulica [pies], S' = 1000/CN − 10 [pulgadas] y Y la pendiente media de la cuenca [%];
//   · hidrograma unitario triangular (cap. 16):  tp = Δt/2 + tL;  qp = 0,208 · A · Q / tp  [m³/s, con A en km²,
//     Q en mm, tp en h]; base 2,67·tp. El hidrograma de la creciente es la convolución de la escorrentía de
//     cada minuto con ese hidrograma unitario.
// La creciente llega al sector y, antes, pasa por una estación de nivel aguas arriba: el caudal en la estación
// es el del sector adelantado el tiempo de viaje de la onda entre los dos puntos.
//
// Este módulo no usa Three.js ni el DOM: se prueba en Node.

import type { Hyetograph } from './engine';

export type BasinCover = 'bosque' | 'mixta' | 'urbanizada';

/** Cobertura de la cuenca y su número de curva (suelo del grupo hidrológico C, humedad antecedente II). */
export const BASIN_COVERS: Record<BasinCover, { name: string; cn: number; note: string }> = {
  bosque: { name: 'Bosque', cn: 70, note: 'bosque en buen estado (TR-55: 70 en suelos del grupo C)' },
  mixta: { name: 'Mixta', cn: 80, note: 'potreros, cultivos y algo de vivienda dispersa' },
  urbanizada: { name: 'Urbanizada', cn: 90, note: 'barrios densos con techos y vías (TR-55: 90 en suelos del grupo C con 65 % impermeable)' },
};
export const BASIN_COVER_LIST: BasinCover[] = ['bosque', 'mixta', 'urbanizada'];

/** Cuenca de la quebrada aguas arriba del sector (didáctica) y estación de nivel. */
export interface BasinSpec {
  name: string;
  /** Área [km²], longitud hidráulica [m] y pendiente media [%] de la cuenca. */
  areaKm2: number;
  lengthM: number;
  slopePct: number;
  /** Estación de nivel aguas arriba: nombre, distancia al sector por el cauce [m] y velocidad de la onda [m/s]. */
  gauge: { name: string; distanceM: number; celerityMs: number };
}

/** Umbrales didácticos de aviso (no son los de ningún sistema oficial). */
export const WARNING = {
  /** Lluvia acumulada en la cuenca en los últimos 30 minutos que activa el aviso por lluvia [mm]. */
  rain30Mm: 20,
  /** El tiempo de aviso se mide hasta que el agua llega a una casa a esta distancia del cauce o menos [m]. */
  nearCreekM: 20,
  /** Alertas por caudal en la estación, como fracción de la capacidad del cauce en el sector. */
  levels: [
    { id: 'amarilla', name: 'Alerta amarilla', frac: 0.4, color: '#e7c35a', text: 'atentos: la quebrada viene creciendo' },
    { id: 'naranja', name: 'Alerta naranja', frac: 0.7, color: '#e8903a', text: 'prepararse para salir de la orilla' },
    { id: 'roja', name: 'Alerta roja', frac: 1.0, color: '#c92a2a', text: 'salir ya de la orilla' },
  ],
} as const;

/** Número de curva con la humedad del suelo antes de la lluvia (seco: condición II; húmedo: condición III). */
export function curveNumber(cover: BasinCover, soil: 'seco' | 'humedo'): number {
  const cn = BASIN_COVERS[cover].cn;
  return soil === 'humedo' ? (23 * cn) / (10 + 0.13 * cn) : cn;
}

/** Escorrentía acumulada [mm] para una lluvia acumulada P [mm] (NRCS, número de curva). */
export function scsRunoff(P: number, cn: number): number {
  const S = 25400 / cn - 254;
  const Ia = 0.2 * S;
  return P > Ia ? ((P - Ia) * (P - Ia)) / (P - Ia + S) : 0;
}

/** Tiempo de retardo de la cuenca [h] (NRCS, ecuación del retardo). */
export function lagHours(lengthM: number, cn: number, slopePct: number): number {
  const lFt = lengthM / 0.3048;
  const Sin = 1000 / cn - 10;
  return (Math.pow(lFt, 0.8) * Math.pow(Sin + 1, 0.7)) / (1900 * Math.sqrt(slopePct));
}

/** Lluvia acumulada del hietograma hasta t [mm]. */
export function rainDepthAt(hy: Hyetograph, t: number): number {
  let d = 0;
  for (let k = 0; k < hy.mmh.length; k++) {
    const a = hy.times[k], b = Math.min(hy.times[k + 1], t);
    if (b > a) d += (hy.mmh[k] * (b - a)) / 3600;
  }
  return d;
}

export interface BasinResult {
  /** Hidrograma en el sector [s, m³/s], cada minuto, incluido el caudal base. */
  t: number[];
  q: number[];
  cn: number;
  /** Retención potencial S y abstracción inicial Ia [mm]. */
  S: number;
  Ia: number;
  /** Lluvia total y escorrentía total [mm]; volumen de escorrentía [m³]. */
  rainMm: number;
  runoffMm: number;
  volume: number;
  /** Retardo y tiempo al pico del hidrograma unitario [min]. */
  lagMin: number;
  tpMin: number;
  /** Caudal pico (con el base) y su momento [m³/s, s]. */
  peak: number;
  tPeak: number;
  /** Tiempo de viaje de la onda desde la estación hasta el sector [s]. */
  travelS: number;
}

const DT = 60;

/**
 * Hidrograma de la creciente en el sector por la lluvia en la cuenca. Se calcula hasta `endS` (más un hidrograma
 * unitario completo para que no se corte el volumen) a intervalos de un minuto; `bulk` multiplica la escorrentía
 * (lodo: 1/(1 − Cv)).
 */
export function basinHydrograph(hy: Hyetograph, b: BasinSpec, cover: BasinCover, soil: 'seco' | 'humedo', baseM3s: number, endS: number, bulk = 1): BasinResult {
  const cn = curveNumber(cover, soil);
  const S = 25400 / cn - 254;
  const lag = lagHours(b.lengthM, cn, b.slopePct);
  const tpH = DT / 3600 / 2 + lag;
  const tp = tpH * 3600, tb = 2.67 * tp;
  // escorrentía de cada minuto [mm]
  const nRain = Math.ceil((hy.times[hy.times.length - 1] ?? 0) / DT);
  const inc: number[] = [];
  let prevQ = 0;
  for (let k = 1; k <= nRain; k++) {
    const Q = scsRunoff(rainDepthAt(hy, k * DT), cn);
    inc.push(Math.max(0, Q - prevQ));
    prevQ = Q;
  }
  // hidrograma unitario triangular (m³/s por mm de escorrentía en un minuto)
  const qpUnit = (0.208 * b.areaKm2) / tpH;
  const uh = (s: number) => (s <= 0 || s >= tb ? 0 : s <= tp ? (qpUnit * s) / tp : (qpUnit * (tb - s)) / (tb - tp));
  const n = Math.ceil(Math.max(endS, nRain * DT + tb) / DT) + 1;
  const t: number[] = [], q: number[] = [];
  let peak = 0, tPeak = 0;
  for (let j = 0; j < n; j++) {
    const tj = j * DT;
    let v = 0;
    // la escorrentía del minuto k se reparte desde el centro de ese minuto
    for (let k = 0; k < inc.length; k++) if (inc[k] > 0) v += inc[k] * uh(tj - (k + 0.5) * DT);
    const qq = baseM3s + bulk * v;
    t.push(tj);
    q.push(qq);
    if (qq > peak) {
      peak = qq;
      tPeak = tj;
    }
  }
  const P = rainDepthAt(hy, Infinity);
  const R = scsRunoff(P, cn);
  return { t, q, cn, S, Ia: 0.2 * S, rainMm: P, runoffMm: R, volume: bulk * R * b.areaKm2 * 1000, lagMin: lag * 60, tpMin: tpH * 60, peak, tPeak, travelS: b.gauge.distanceM / b.gauge.celerityMs };
}

export interface WarningEvent {
  id: string;
  name: string;
  /** Momento en que ocurre [s] o −1 si no ocurre dentro del tiempo simulado. */
  t: number;
  color?: string;
  text: string;
}

/**
 * Avisos de la estación y del pluviómetro: momento de cada umbral. `hydroAt(t)` es el caudal en el sector; en la
 * estación se lee con el adelanto del tiempo de viaje. Se busca minuto a minuto (y se afina al segundo).
 */
export function warningEvents(hy: Hyetograph, hydroAt: (t: number) => number, travelS: number, capacity: number, endS: number): WarningEvent[] {
  const gauge = (t: number) => hydroAt(t + travelS);
  const first = (f: (t: number) => boolean): number => {
    for (let t = 0; t <= endS; t += 60) {
      if (f(t)) {
        let lo = Math.max(0, t - 60), hi = t;
        if (f(lo)) return lo;
        for (let it = 0; it < 12; it++) {
          const m = 0.5 * (lo + hi);
          if (f(m)) hi = m;
          else lo = m;
        }
        return hi;
      }
    }
    return -1;
  };
  const out: WarningEvent[] = [];
  out.push({
    id: 'lluvia',
    name: 'Aviso por lluvia',
    t: first((t) => rainDepthAt(hy, t) - rainDepthAt(hy, t - 1800) >= WARNING.rain30Mm),
    color: '#4a90d9',
    text: `${WARNING.rain30Mm} mm o más de lluvia en 30 minutos`,
  });
  for (const lv of WARNING.levels) out.push({ id: lv.id, name: lv.name, t: first((t) => gauge(t) >= lv.frac * capacity), color: lv.color, text: lv.text });
  return out;
}

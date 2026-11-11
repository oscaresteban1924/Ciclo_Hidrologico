// Tramo de río de la parte «Crecientes y riesgo»: sección compuesta (cauce principal y llanuras) y nivel del agua
// para un caudal con el método de la sección dividida (Manning en cada subsección, sin fricción en las interfaces
// verticales; Chow, 1959, sec. 6-6). Tramo ilustrativo: no es un río real.

export const RIVER = {
  /** Cauce principal: ancho del fondo, talud (H:V) y altura de las orillas (m). */
  b: 14,
  z: 1.5,
  bank: 3,
  /** Llanuras: ancho a cada lado (m) y su pendiente transversal hacia las laderas. */
  plain: 60,
  rise: 0.02,
  n: { main: 0.035, plain: 0.06 },
  S: 0.002,
};

/** Caudal (m³/s) con el agua a la profundidad y (m) sobre el fondo del cauce. */
export function riverQ(y: number): number {
  const { b, z, bank, plain, rise, n, S } = RIVER;
  const ym = Math.min(y, bank);
  // cauce principal: el trapecio hasta la orilla más el rectángulo de encima cuando se desborda
  const Tm = b + 2 * z * bank;
  const Am = (b + z * ym) * ym + (y > bank ? Tm * (y - bank) : 0);
  const Pm = b + 2 * ym * Math.sqrt(1 + z * z);
  let Q = (Am * Math.pow(Am / Pm, 2 / 3) * Math.sqrt(S)) / n.main;
  if (y > bank) {
    // cada llanura: el agua cubre hasta donde el terreno sube a su nivel
    const d = y - bank;
    // hasta el pie de la ladera, el terreno sube con la pendiente transversal; después, la ladera (casi vertical)
    const full = d > rise * plain;
    const w = full ? plain : d / rise;
    const Ap = full ? plain * d - (rise * plain * plain) / 2 : (w * d) / 2;
    const Pp = Math.hypot(w, rise * w) + (full ? d - rise * plain : 0);
    Q += (2 * Ap * Math.pow(Ap / Math.max(1e-9, Pp), 2 / 3) * Math.sqrt(S)) / n.plain;
  }
  return Q;
}

/** Profundidad (m) que lleva el caudal Q (bisección). */
export function riverDepth(Q: number): number {
  let lo = 0, hi = 12;
  for (let k = 0; k < 80; k++) {
    const m = (lo + hi) / 2;
    if (riverQ(m) < Q) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Caudal a cauce lleno (justo antes de salirse a las llanuras). */
export const bankfullQ = () => riverQ(RIVER.bank);

/** Cota del terreno en el corte (m sobre el fondo del cauce; z = 0 en el eje del cauce). */
export function groundAt(z: number): number {
  const { b, z: tal, bank, plain, rise } = RIVER;
  const a = Math.abs(z);
  const edge = b / 2 + tal * bank;
  if (a <= b / 2) return 0;
  if (a <= edge) return (a - b / 2) / tal;
  if (a <= edge + plain) return bank + rise * (a - edge);
  return bank + rise * plain + 0.45 * (a - edge - plain);
}

export interface RiverHouseSpot {
  x: number;
  z: number;
  /** Cota del piso (m sobre el fondo del cauce). */
  y: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  wall: string;
}

/** Casas de la llanura (las mismas en la escena 3D, en el esquema plano y en el conteo): cinco distancias por lado. */
export const RIVER_HOUSES: RiverHouseSpot[] = (() => {
  let s = 11;
  const R = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const out: RiverHouseSpot[] = [];
  for (const side of [-1, 1])
    for (const d of [16, 24, 34, 46, 60]) {
      const x = -110 + R() * 220, z = side * (d + R() * 4);
      out.push({ x, z, y: groundAt(z), w: 6 + R() * 3, d: 5 + R() * 3, h: 3 + R() * 3, rot: (R() - 0.5) * 0.5, wall: ['#e8d9c0', '#c06c48', '#f0c9a2', '#bcd6e6', '#f2d27a'][Math.floor(R() * 5)] });
    }
  return out;
})();

/** Agua sobre el piso de cada casa (m) con el río a la profundidad y. */
export function houseWater(y: number): number[] {
  return RIVER_HOUSES.map((h) => Math.max(0, y - h.y));
}

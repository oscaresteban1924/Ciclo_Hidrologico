// Tormentas reales y clima: lluvias de diseño de Medellín con la curva IDF del IDEAM (estación Aeropuerto Olaya
// Herrera), un aguacero reconstruido con totales publicados y un factor de cambio climático.
//
// Curva IDF: IDEAM, estación A. Olaya Herrera (Medellín), datos de 1971 a 2010 (40 años), distribución de
// Gumbel con parámetros por L-momentos, actualizada en diciembre de 2016. Ecuación I = C1 / (D + X0)^C2, con
// I en mm/h y D en minutos. Los parámetros y la tabla de intensidades se tomaron del Documento Técnico de
// Soporte DTS 2022 (versión 2) de la Alcaldía de Medellín, numeral 2.2.5, que reproduce la ficha del IDEAM.
//
// Hietograma de diseño: método de los bloques alternos (Chow, Maidment y Mays, 1988): cada ventana de k bloques
// centrada en el pico tiene la profundidad que da la curva IDF para k·Δt.
//
// Cambio climático: el IPCC (AR6, Grupo I) estima que los aguaceros extremos diarios se intensifican cerca de
// 7 % por cada grado de calentamiento global; el calentamiento de 2011–2020 fue de unos 1,1 °C sobre 1850–1900.

export interface IdfCurve {
  id: string;
  station: string;
  code: string;
  /** Periodos de retorno con parámetros [años]. */
  returns: readonly number[];
  /** [C1, X0, C2] por periodo de retorno: I = C1 / (D + X0)^C2 [mm/h], D [min]. */
  params: Readonly<Record<number, readonly [number, number, number]>>;
  /** Duraciones para las que la ficha del IDEAM da intensidades [min]. */
  range: readonly [number, number];
  /** Tabla impresa (D [min] → intensidades por periodo de retorno), para la prueba. */
  printed: Readonly<Record<number, readonly number[]>>;
  /** Intensidades de 5 min impresas en la tabla 7 del DTS (por periodo de retorno). */
  printed5: readonly number[];
  source: string;
}

export const IDF_OLAYA: IdfCurve = {
  id: 'olaya',
  station: 'Aeropuerto Olaya Herrera (Medellín)',
  code: '27015070',
  returns: [2, 3, 5, 10, 25, 50, 100],
  params: {
    2: [4084.019, 25.519, 1.068],
    3: [5374.593, 27.721, 1.099],
    5: [7004.684, 29.802, 1.127],
    10: [9316.661, 31.987, 1.157],
    25: [12611.921, 34.232, 1.187],
    50: [15294.065, 35.616, 1.205],
    100: [18132.77, 36.805, 1.221],
  },
  range: [5, 360],
  printed: {
    15: [78.2, 86.7, 96.2, 108.1, 123.2, 134.4, 145.5],
    30: [56.4, 63.1, 70.5, 79.9, 91.8, 100.6, 109.3],
    60: [35.0, 39.0, 43.5, 49.0, 56.1, 61.3, 66.5],
    120: [19.6, 21.9, 24.3, 27.5, 31.4, 34.3, 37.2],
    360: [7.5, 8.3, 9.2, 10.3, 11.6, 12.6, 13.6],
  },
  printed5: [106.1, 116.3, 128.2, 142.9, 161.9, 176.2, 190.1],
  source:
    'IDEAM, curva IDF de la estación A. Olaya Herrera (Medellín), 1971–2010, Gumbel (L-momentos), actualizada en diciembre de 2016; parámetros reproducidos en el DTS 2022 (v2) de la Alcaldía de Medellín, numeral 2.2.5.',
};

/** Periodos de retorno que se ofrecen en el laboratorio [años]. */
export const DESIGN_RETURNS = [2, 5, 10, 25, 50, 100] as const;
/** Duraciones de las tormentas de diseño [min] (dentro del rango de la curva). */
export const DESIGN_DURATIONS = [30, 60, 120, 180, 360] as const;

/** Intensidad de la ecuación de la ficha, I = C1 / (D + X0)^C2 [mm/h]. */
export function idfEquation(T: number, D: number, curve: IdfCurve = IDF_OLAYA): number {
  const p = curve.params[T];
  if (!p) throw new Error(`Periodo de retorno sin parámetros: ${T} años.`);
  const [C1, X0, C2] = p;
  return C1 / Math.pow(D + X0, C2);
}

/** Duración hasta la que se usa la ecuación [min]; después, la forma de la tabla impresa. */
export const EQUATION_UNTIL = 60;

/**
 * Intensidad media de la curva IDF para una duración D [min] y un periodo de retorno T [años] (mm/h).
 * Hasta 1 h se usa la ecuación de la ficha (reproduce la tabla impresa con error menor de 3 %). Con un exponente
 * C2 mayor que 1, la lámina de la ecuación deja de crecer en duraciones largas (para 100 años, después de unas
 * 2,8 h), lo que no es físico; por eso, de 1 a 6 h se sigue la forma de la tabla impresa (interpolación
 * logarítmica entre 60, 120 y 360 min), unida a la ecuación en 60 min.
 */
export function idfIntensity(T: number, D: number, curve: IdfCurve = IDF_OLAYA): number {
  if (D <= EQUATION_UNTIL) return idfEquation(T, D, curve);
  const k = curve.returns.indexOf(T);
  const knots = Object.keys(curve.printed).map(Number).filter((d) => d >= EQUATION_UNTIL).sort((a, b) => a - b);
  const tab = (d: number) => curve.printed[d][k];
  let a = knots[0], b = knots[1];
  for (let i = 0; i < knots.length - 1; i++) if (D >= knots[i]) [a, b] = [knots[i], knots[i + 1]];
  const slope = Math.log(tab(b) / tab(a)) / Math.log(b / a);
  const iTab = tab(a) * Math.pow(D / a, slope);
  return idfEquation(T, EQUATION_UNTIL, curve) * (iTab / tab(EQUATION_UNTIL));
}

/** Lámina de la curva IDF [mm] para D [min] y T [años]. */
export const idfDepth = (T: number, D: number, curve: IdfCurve = IDF_OLAYA): number => (idfIntensity(T, D, curve) * D) / 60;

/** Paso de los bloques [min]: 5 min hasta 2 h; 10 min para lluvias más largas. */
export const blockMinutes = (D: number): number => (D <= 120 ? 5 : 10);

/**
 * Bloques alternos: profundidades incrementales de la curva IDF ordenadas con el mayor en el centro y los demás
 * alternando a derecha e izquierda. Devuelve la intensidad [mm/h] de cada bloque de Δt minutos.
 */
export function alternatingBlocks(T: number, D: number, curve: IdfCurve = IDF_OLAYA): { dtMin: number; mmh: number[] } {
  const dt = blockMinutes(D);
  const n = Math.round(D / dt);
  const inc: number[] = [];
  let prev = 0;
  for (let k = 1; k <= n; k++) {
    const P = idfDepth(T, k * dt, curve);
    inc.push(P - prev);
    prev = P;
  }
  const order = [...inc].sort((a, b) => b - a);
  const blocks = new Array<number>(n).fill(0);
  const mid = Math.floor((n - 1) / 2);
  // el mayor en el centro; los siguientes alternan a la derecha y a la izquierda
  order.forEach((d, i) => {
    blocks[mid + (i % 2 ? Math.ceil(i / 2) : -i / 2)] = d;
  });
  return { dtMin: dt, mmh: blocks.map((d) => (d * 60) / dt) };
}

// ---------------------------------------------------------------- clima

/** Calentamiento global de 2011–2020 sobre 1850–1900 [°C] (IPCC AR6, Grupo I). */
export const WARMING_NOW = 1.1;
/** Niveles de calentamiento global que se ofrecen [°C sobre 1850–1900]. */
export const WARMING_LEVELS = [WARMING_NOW, 1.5, 2, 3, 4] as const;
/** Intensificación de los aguaceros extremos por grado de calentamiento (IPCC AR6: «cerca de 7 %»). */
export const CC_RATE = 0.07;

/** Factor sobre la intensidad para un nivel de calentamiento global [°C] respecto al clima actual. */
export function climateFactor(level: number | undefined): number {
  if (level == null || level <= WARMING_NOW) return 1;
  return Math.pow(1 + CC_RATE, level - WARMING_NOW);
}

// ---------------------------------------------------------------- aguaceros reconstruidos

export interface StormEvent {
  id: string;
  name: string;
  date: string;
  place: string;
  totalMm: number;
  durationMin: number;
  /** Intensidad máxima reportada [mm/h]. */
  peakMmH: number;
  /** Forma supuesta, minuto a minuto: intensidades relativas (se escala al total y al pico). */
  shape: number[];
  source: string;
  note: string;
}

/**
 * Forma supuesta de un aguacero convectivo de 44 min (subida rápida, pico al primer tercio, varios minutos
 * fuertes y cola). Se escala para que el total sea el reportado y el pico, la intensidad reportada.
 */
const CONVECTIVE_44 = [
  0.12, 0.2, 0.3, 0.42, 0.55, 0.66, 0.74, 0.8, 0.86, 0.9, 0.93, 0.96, 1, 1, 0.97, 0.93, 0.9, 0.87, 0.84, 0.8, 0.77, 0.74, 0.71, 0.68, 0.65, 0.62, 0.58, 0.55, 0.51, 0.47, 0.43, 0.39, 0.35, 0.31, 0.27, 0.24, 0.21, 0.18, 0.15, 0.12, 0.1, 0.08, 0.06, 0.04,
];

export const STORM_EVENTS: StormEvent[] = [
  {
    id: 'poblado-2026-01-28',
    name: 'Aguacero del 28 de enero de 2026',
    date: '2026-01-28',
    place: 'ladera suroriental de Medellín (El Poblado)',
    totalMm: 87,
    durationMin: 44,
    peakMmH: 180,
    shape: CONVECTIVE_44,
    source:
      'SIATA, citado por El Colombiano, Minuto30 y Pulzo (28 y 29 de enero de 2026): cerca de 87 mm en 44 a 50 minutos en la ladera suroriental, más que el promedio de todo enero (85 mm); el alcalde informó un pico de «más de 180 milímetros» a las 3:10 p. m.',
    note: 'Solo el total, la duración y el pico vienen de los reportes; la forma minuto a minuto es supuesta. Como el total fue de 87 mm, el pico de «180 milímetros» se interpreta como una intensidad de 180 mm/h.',
  },
];

export const eventById = (id: string | undefined): StormEvent | undefined => STORM_EVENTS.find((e) => e.id === id);

/**
 * Intensidades minuto a minuto del aguacero [mm/h]: la forma se ajusta para que el máximo sea el pico reportado
 * y el total, el reportado (se resuelve el exponente que reparte el agua entre el pico y la cola).
 */
export function eventMinutes(e: StormEvent): number[] {
  const n = e.durationMin;
  const base = e.shape.length === n ? e.shape : Array.from({ length: n }, (_, i) => e.shape[Math.min(e.shape.length - 1, Math.floor((i * e.shape.length) / n))]);
  const target = e.totalMm * 60; // suma de mm/h por minuto
  const total = (g: number) => base.reduce((s, v) => s + e.peakMmH * Math.pow(v, g), 0);
  // la suma baja al subir el exponente: bisección para que el total sea el reportado
  let lo = 0.05, hi = 8;
  for (let k = 0; k < 80; k++) {
    const g = (lo + hi) / 2;
    if (total(g) > target) lo = g;
    else hi = g;
  }
  const g = (lo + hi) / 2;
  return base.map((v) => e.peakMmH * Math.pow(v, g));
}

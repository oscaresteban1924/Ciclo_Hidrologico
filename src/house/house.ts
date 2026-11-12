// Cálculo de la sala «El agua en casa»: cuánta agua usa una casa (aparatos, hábitos y fugas) y cómo se reparte en
// el día; el medidor y la factura (rangos de consumo de la CRA, subsidios y contribuciones, tarifa ilustrativa); y un
// tanque de agua lluvia con su balance diario de un año. Sin interfaz.

// ------------------------------------------------------------------ consumo

export interface Habits {
  people: number;
  /** Minutos de ducha por persona al día. */
  shower: number;
  /** Descargas del sanitario por persona al día. */
  flushes: number;
  /** Minutos de lavamanos por persona al día. */
  basin: number;
  /** Minutos de lavaplatos de la casa al día. */
  dishes: number;
  /** Lavadas de ropa a la semana. */
  loads: number;
  /** Minutos de manguera (patio, carro, plantas) a la semana. */
  hose: number;
}

export interface Devices {
  /** Ducha ahorradora, sanitario de bajo consumo, aireadores en las llaves y lavadora eficiente. */
  lowShower: boolean;
  lowToilet: boolean;
  aerators: boolean;
  frontLoader: boolean;
  /** Fugas: una llave que gotea y un sanitario que deja pasar agua. */
  drip: boolean;
  toiletLeak: boolean;
}

/** Caudales y volúmenes típicos (valores de referencia para aprender; los de cada aparato varían). */
export const RATES = {
  shower: { std: 9, low: 6 }, // L/min
  toilet: { std: 9, low: 4.8 }, // L por descarga
  basin: { std: 6, low: 3 }, // L/min
  sink: { std: 8, low: 5 }, // L/min
  washer: { std: 100, low: 55 }, // L por lavada
  hose: 15, // L/min
  /** Una gota por segundo: unos 21 L al día (calculadora de goteo del USGS, 15 140 gotas por galón). */
  drip: 21,
  /** Un sanitario que deja pasar un hilo de agua (ilustrativo). */
  toiletLeak: 120,
};

export type Use = 'ducha' | 'sanitario' | 'lavamanos' | 'cocina' | 'lavadora' | 'manguera' | 'fugas';
export const USE_NAMES: Record<Use, string> = { ducha: 'Ducha', sanitario: 'Sanitario', lavamanos: 'Lavamanos', cocina: 'Lavaplatos', lavadora: 'Lavadora', manguera: 'Manguera', fugas: 'Fugas' };
export const USE_COLORS: Record<Use, string> = { ducha: '#2f7fb8', sanitario: '#6c8ebf', lavamanos: '#4fa3d8', cocina: '#2e8f7a', lavadora: '#7b5ea7', manguera: '#5b9a43', fugas: '#c0392b' };

/** Litros al día de cada uso para toda la casa. */
export function dailyUse(h: Habits, d: Devices): Record<Use, number> {
  return {
    ducha: h.people * h.shower * (d.lowShower ? RATES.shower.low : RATES.shower.std),
    sanitario: h.people * h.flushes * (d.lowToilet ? RATES.toilet.low : RATES.toilet.std),
    lavamanos: h.people * h.basin * (d.aerators ? RATES.basin.low : RATES.basin.std),
    cocina: h.dishes * (d.aerators ? RATES.sink.low : RATES.sink.std),
    lavadora: (h.loads * (d.frontLoader ? RATES.washer.low : RATES.washer.std)) / 7,
    manguera: (h.hose * RATES.hose) / 7,
    fugas: (d.drip ? RATES.drip : 0) + (d.toiletLeak ? RATES.toiletLeak : 0),
  };
}

export const total = (u: Record<Use, number>) => (Object.values(u) as number[]).reduce((a, b) => a + b, 0);

/**
 * Reparto típico de cada uso en las horas del día (fracción por hora, suma 1): duchas de madrugada y de noche,
 * cocina a las comidas, lavadora en la mañana; las fugas, parejas todo el día.
 */
const shape = (peaks: [number, number, number][]) => {
  const w = Array.from({ length: 24 }, (_, h) => peaks.reduce((s, [c, sd, a]) => s + a * Math.exp(-0.5 * ((h + 0.5 - c) / sd) ** 2), 0));
  const t = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / t);
};
export const PROFILES: Record<Use, number[]> = {
  ducha: shape([[6.5, 1, 1], [20.5, 1.4, 0.45]]),
  sanitario: shape([[7, 1.5, 1], [13, 2, 0.5], [20, 2.5, 0.8]]),
  lavamanos: shape([[7, 1.2, 1], [13, 1.5, 0.6], [19.5, 2, 0.7]]),
  cocina: shape([[7.5, 1, 0.7], [13, 1, 1], [19.5, 1.2, 0.9]]),
  lavadora: shape([[10, 1.5, 1]]),
  manguera: shape([[16, 1.5, 1]]),
  fugas: Array.from({ length: 24 }, () => 1 / 24),
};

/** Litros en cada hora del día (24 valores por uso). */
export function hourly(u: Record<Use, number>): Record<Use, number[]> {
  const out = {} as Record<Use, number[]>;
  for (const k of Object.keys(u) as Use[]) out[k] = PROFILES[k].map((f) => f * u[k]);
  return out;
}

// ------------------------------------------------------------------ medidor y factura

/**
 * Rangos de consumo para ciudades entre 1 000 y 2 000 m (Medellín): básico hasta 13 m³ por suscriptor al mes y
 * complementario hasta 26 m³ (Resolución CRA 750 de 2016); lo que pasa de 26 m³ es suntuario.
 */
export const BASIC_M3 = 13;
export const COMPLEMENTARY_M3 = 26;

/**
 * Factores de ejemplo sobre la tarifa (negativos: subsidio; positivos: contribución). Cada municipio los fija dentro
 * de los topes de la ley: subsidios de hasta 70 %, 40 % y 15 % para los estratos 1, 2 y 3 y contribuciones de al
 * menos 50 % y 60 % para los estratos 5 y 6 (Ley 1450 de 2011, art. 125; la Ley 2294 de 2023 permite otros topes
 * con condiciones). Los subsidios solo cubren el cargo fijo y el consumo básico (Ley 142 de 1994, art. 99).
 */
export const STRATA: Record<number, { name: string; f: number }> = {
  1: { name: 'Estrato 1', f: -0.6 },
  2: { name: 'Estrato 2', f: -0.35 },
  3: { name: 'Estrato 3', f: -0.1 },
  4: { name: 'Estrato 4', f: 0 },
  5: { name: 'Estrato 5', f: 0.5 },
  6: { name: 'Estrato 6', f: 0.6 },
};

/** Tarifa ilustrativa (pesos de 2026, redondos): no es la de ninguna empresa. */
export const TARIFF = {
  fixedAq: 11000, // cargo fijo de acueducto al mes
  fixedSew: 6500, // cargo fijo de alcantarillado al mes
  m3Aq: 3200, // por metro cúbico de acueducto
  m3Sew: 2900, // por metro cúbico de alcantarillado
};

export interface BillLine {
  label: string;
  m3?: number;
  base: number;
  factor: number;
  value: number;
}

/** Factura de un mes con el consumo (m³) y el estrato. */
export function bill(m3: number, stratum: number, tariff = TARIFF): { lines: BillLine[]; total: number; perM3: number; basic: number; comp: number; sumpt: number } {
  const f = STRATA[stratum]?.f ?? 0;
  const basic = Math.min(m3, BASIC_M3), comp = Math.max(0, Math.min(m3, COMPLEMENTARY_M3) - BASIC_M3), sumpt = Math.max(0, m3 - COMPLEMENTARY_M3);
  // el subsidio solo toca cargo fijo y básico; la contribución, todo
  const fBasic = 1 + f, fRest = 1 + Math.max(0, f);
  const unit = tariff.m3Aq + tariff.m3Sew;
  const lines: BillLine[] = [
    { label: 'Cargos fijos (acueducto y alcantarillado)', base: tariff.fixedAq + tariff.fixedSew, factor: fBasic, value: (tariff.fixedAq + tariff.fixedSew) * fBasic },
    { label: 'Consumo básico', m3: basic, base: basic * unit, factor: fBasic, value: basic * unit * fBasic },
    { label: 'Consumo complementario', m3: comp, base: comp * unit, factor: fRest, value: comp * unit * fRest },
    { label: 'Consumo suntuario', m3: sumpt, base: sumpt * unit, factor: fRest, value: sumpt * unit * fRest },
  ];
  const tot = lines.reduce((s, l) => s + l.value, 0);
  return { lines, total: tot, perM3: m3 > 0 ? tot / m3 : 0, basic, comp, sumpt };
}

/** Lectura del medidor: 5 tambores de metros cúbicos y 4 agujas (×0,1, ×0,01, ×0,001 y ×0,0001 m³). */
export function meterDigits(m3: number): { drums: string; needles: number[] } {
  const whole = Math.floor(m3);
  const frac = m3 - whole;
  return { drums: String(whole % 100000).padStart(5, '0'), needles: [0.1, 0.01, 0.001, 0.0001].map((u) => ((frac / u) % 10 + 10) % 10) };
}

// ------------------------------------------------------------------ agua lluvia

/** Lluvia media de cada mes [mm] con el régimen bimodal del valle de Aburrá (ilustrativa, unos 1 600 mm al año). */
export const MONTHLY_MM = [70, 90, 130, 175, 200, 125, 105, 115, 155, 195, 160, 95];
export const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Un año de lluvia diaria ilustrativo: días lluviosos al azar (más en los meses lluviosos) que suman la media de cada mes. */
export const RAIN_YEAR: number[] = (() => {
  let x = 20250;
  const R = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  const out: number[] = [];
  MONTHLY_MM.forEach((mm, m) => {
    const p = Math.min(0.85, 0.25 + mm / 320); // probabilidad de un día con lluvia
    const raw: number[] = [];
    for (let d = 0; d < DAYS[m]; d++) raw.push(R() < p ? -Math.log(1 - R() * 0.995) * (0.6 + R()) : 0);
    const s = raw.reduce((a, b) => a + b, 0) || 1;
    for (const v of raw) out.push((v / s) * mm);
  });
  return out;
})();

export const monthOfDay = (d: number) => {
  let acc = 0;
  for (let m = 0; m < 12; m++) {
    acc += DAYS[m];
    if (d < acc) return m;
  }
  return 11;
};

export interface TankInput {
  /** Área de techo en planta [m²] y coeficiente de escorrentía del techo. */
  A: number;
  C: number;
  /** Primer lavado que se descarta en cada lluvia [mm]. */
  ff: number;
  /** Volumen del tanque [m³]. */
  V: number;
  /** Demanda que se atiende con agua lluvia [L/día]. */
  D: number;
}

export interface TankResult {
  S: number[];
  supplied: number[];
  spill: number[];
  inflow: number[];
  /** Totales del año [m³]. */
  demand: number;
  served: number;
  rainVol: number;
  captured: number;
  spilled: number;
  /** Fracción de la demanda atendida, fracción de días con la demanda completa y días con el tanque vacío. */
  share: number;
  reliability: number;
  emptyDays: number;
}

/** Balance diario del tanque: entra la lluvia del techo (menos el primer lavado), sale la demanda, rebosa lo que sobra. */
export function tankYear(t: TankInput, rain = RAIN_YEAR, years = 2): TankResult {
  const n = rain.length;
  let S = 0;
  const out: TankResult = { S: [], supplied: [], spill: [], inflow: [], demand: 0, served: 0, rainVol: 0, captured: 0, spilled: 0, share: 0, reliability: 0, emptyDays: 0 };
  // se corre un año de calentamiento para no empezar con el tanque vacío
  for (let y = 0; y < years; y++) {
    const keep = y === years - 1;
    for (let d = 0; d < n; d++) {
      const p = rain[d];
      const q = (Math.max(0, p - t.ff) * t.A * t.C) / 1000; // m³
      S += q;
      const sp = Math.max(0, S - t.V);
      S -= sp;
      const dem = t.D / 1000;
      const got = Math.min(S, dem);
      S -= got;
      if (keep) {
        out.S.push(S);
        out.supplied.push(got);
        out.spill.push(sp);
        out.inflow.push(q);
        out.demand += dem;
        out.served += got;
        out.rainVol += (p * t.A) / 1000;
        out.captured += q;
        out.spilled += sp;
        if (got >= dem - 1e-12) out.reliability += 1;
        if (S <= 1e-9 && got < dem - 1e-12) out.emptyDays += 1;
      }
    }
  }
  out.share = out.demand > 0 ? out.served / out.demand : 0;
  out.reliability /= n;
  return out;
}

// Constantes físicas, unidades y parámetros de cobertura del laboratorio de lluvia urbana.
// Todos los valores de cobertura son ESTIMADOS para fines educativos (no calibrados para Medellín).
// Las fuentes de referencia se listan en docs/medellin/MODELO.md y en el panel docente.

/** Aceleración de la gravedad [m/s²]. */
export const G = 9.81;

/** Conversión de intensidad de lluvia: R [m/s] = I [mm/h] / 3 600 000. */
export const MMH_TO_MS = 1 / 3_600_000;
export const mmhToMs = (mmh: number): number => mmh * MMH_TO_MS;
export const msToMmh = (ms: number): number => ms * 3_600_000;

/** Profundidad mínima para que haya transferencia entre celdas [m] (0,1 mm). */
export const H_FLOW_MIN = 1e-4;
/** Profundidad a partir de la cual una celda se considera «mojada» para velocidades [m]. */
export const H_WET = 1e-3;

/** Rango documentado de intensidad para la herramienta «Crear lluvia» [mm/h]. */
export const RAIN_RANGE = { min: 5, max: 150, step: 5 } as const;
/** Rango documentado de duración [min] de la lluvia inventada (hasta 6 h). */
export const DURATION_RANGE = { min: 5, max: 360, step: 5 } as const;
/** Tiempo simulado máximo [min] (lluvia de 6 h más 2 h de escurrimiento). */
export const SIM_MAX_MIN = 480;

export type CoverId =
  | 'asfalto'
  | 'concreto'
  | 'anden'
  | 'adoquin_permeable'
  | 'grama'
  | 'zona_verde'
  | 'jardin_lluvia'
  | 'cauce'
  | 'cancha'
  | 'techo'
  | 'tierra';

export interface CoverParams {
  id: CoverId;
  name: string;
  /** Coeficiente de rugosidad de Manning n [s/m^(1/3)]. */
  manning: number;
  /** Capacidad de infiltración constante [mm/h] (0 = impermeable). */
  ksMmH: number;
  /** Almacenamiento máximo en el suelo o la capa porosa [m] (lámina equivalente). */
  storageM: number;
  permeable: boolean;
  /** Color base (vista realista) y color de la vista de materiales. */
  color: string;
  matColor: string;
  /** Patrón para no depender solo del color en la vista de materiales. */
  pattern: 'liso' | 'puntos' | 'rayas' | 'cuadros' | 'ondas';
  /** Breve explicación para niñas y niños. */
  kid: string;
  /** Justificación técnica del valor (para docentes). */
  basis: string;
}

/**
 * Parámetros por cobertura. Son valores de referencia ESTIMADOS a partir de literatura general
 * (Chow 1959; USDA TR-55 1986; Rawls, Brakensiek y Miller 1983; Manual de referencia SWMM 2016).
 * No son mediciones en Medellín.
 */
export const COVERS: Record<CoverId, CoverParams> = {
  asfalto: {
    id: 'asfalto',
    name: 'Asfalto',
    manning: 0.016,
    ksMmH: 0,
    storageM: 0,
    permeable: false,
    color: '#4a4f57',
    matColor: '#5b6470',
    pattern: 'liso',
    kid: 'No deja pasar el agua: casi toda corre por encima.',
    basis: 'Superficie asfáltica lisa: n ≈ 0,011–0,016 (Chow 1959; TR-55). Impermeable.',
  },
  concreto: {
    id: 'concreto',
    name: 'Concreto',
    manning: 0.015,
    ksMmH: 0,
    storageM: 0,
    permeable: false,
    color: '#a7a39a',
    matColor: '#8f97a3',
    pattern: 'liso',
    kid: 'Duro y liso: el agua corre rápido sobre él.',
    basis: 'Concreto con acabado: n ≈ 0,011–0,015 (Chow 1959). Impermeable.',
  },
  anden: {
    id: 'anden',
    name: 'Andén',
    manning: 0.015,
    ksMmH: 0,
    storageM: 0,
    permeable: false,
    color: '#c9c2b4',
    matColor: '#a3abb6',
    pattern: 'liso',
    kid: 'El andén está un poco más alto que la calle; el bordillo guía el agua.',
    basis: 'Andén de concreto: n ≈ 0,015; impermeable. Altura de bordillo didáctica de 0,15 m (no levantada).',
  },
  adoquin_permeable: {
    id: 'adoquin_permeable',
    name: 'Pavimento permeable',
    manning: 0.018,
    ksMmH: 100,
    storageM: 0.1,
    permeable: true,
    color: '#8d7b6a',
    matColor: '#7fb3a6',
    pattern: 'cuadros',
    kid: 'Tiene juntas y una base de piedras: deja pasar parte del agua y guarda un poco.',
    basis: 'Capacidad de 100 mm/h y 0,10 m de almacenamiento (base granular ~0,35 m con porosidad ~0,3). Valor estimado conservador; el pavimento nuevo puede infiltrar mucho más y pierde capacidad si se colmata.',
  },
  grama: {
    id: 'grama',
    name: 'Grama',
    manning: 0.15,
    ksMmH: 13,
    storageM: 0.04,
    permeable: true,
    color: '#6f9e4c',
    matColor: '#7cc07a',
    pattern: 'puntos',
    kid: 'El suelo con pasto absorbe agua, pero solo hasta cierto punto.',
    basis: 'Conductividad de suelo franco Ks ≈ 13,2 mm/h (Rawls et al. 1983). Almacenamiento ≈ 0,04 m (≈0,3 m de suelo × déficit de humedad ~0,13). n = 0,15 para pasto corto en flujo laminar (TR-55).',
  },
  zona_verde: {
    id: 'zona_verde',
    name: 'Zona verde con árboles',
    manning: 0.24,
    ksMmH: 22,
    storageM: 0.06,
    permeable: true,
    color: '#4f8a3c',
    matColor: '#4fa86a',
    pattern: 'puntos',
    kid: 'Raíces y hojarasca ayudan a que el agua entre al suelo y frenan la corriente.',
    basis: 'Ks ≈ 21,8 mm/h (franco arenoso, Rawls et al. 1983) como suelo con estructura y raíces; almacenamiento 0,06 m; n = 0,24 (pasto denso, TR-55).',
  },
  jardin_lluvia: {
    id: 'jardin_lluvia',
    name: 'Jardín de lluvia',
    manning: 0.1,
    ksMmH: 50,
    storageM: 0.15,
    permeable: true,
    color: '#5c7f3a',
    matColor: '#3e9e8a',
    pattern: 'ondas',
    kid: 'Un jardín más bajo que la calle: recibe agua, la guarda un rato y la deja entrar al suelo. Si se llena, rebosa.',
    basis: 'Suelo diseñado con Ks ≈ 50 mm/h y 0,15 m de almacenamiento (≈0,6 m de medio con porosidad útil ~0,25), más una depresión de 0,15 m. Valores típicos de guías de biorretención; estimados.',
  },
  cauce: {
    id: 'cauce',
    name: 'Cauce de quebrada',
    manning: 0.035,
    ksMmH: 0,
    storageM: 0,
    permeable: false,
    color: '#7a6c55',
    matColor: '#6b8fb3',
    pattern: 'rayas',
    kid: 'El lecho de la quebrada: por aquí baja el agua hacia el río.',
    basis: 'Cauce natural con piedras: n ≈ 0,030–0,040 (Chow 1959). Se trata como impermeable durante el evento (simplificación).',
  },
  cancha: {
    id: 'cancha',
    name: 'Cancha',
    manning: 0.014,
    ksMmH: 0,
    storageM: 0,
    permeable: false,
    color: '#3f7f8f',
    matColor: '#8f97a3',
    pattern: 'liso',
    kid: 'Placa deportiva de concreto pintado: impermeable.',
    basis: 'Concreto pintado: n ≈ 0,013–0,015. Impermeable.',
  },
  techo: {
    id: 'techo',
    name: 'Techo',
    manning: 0.012,
    ksMmH: 0,
    storageM: 0,
    permeable: false,
    color: '#9a5b45',
    matColor: '#b98a74',
    pattern: 'liso',
    kid: 'La lluvia del techo baja por la bajante al andén o a un depósito.',
    basis: 'El techo no almacena agua en este modelo: su lluvia llega a la bajante en el mismo paso de cálculo.',
  },
  tierra: {
    id: 'tierra',
    name: 'Tierra suelta (obra)',
    manning: 0.05,
    ksMmH: 6,
    storageM: 0.02,
    permeable: true,
    color: '#9a7652',
    matColor: '#c39a63',
    pattern: 'rayas',
    kid: 'Tierra sin pasto, como en una obra: la lluvia la golpea y el agua se la lleva como lodo.',
    basis: 'Suelo desnudo compactado de obra: Ks ≈ 6 mm/h (suelos urbanos compactados, del orden de unos pocos mm/h); almacenamiento 0,02 m; n = 0,05 (TR-55, suelo en barbecho sin residuos). Erosionable (sim/sediment.ts).',
  },
};

export const COVER_LIST: CoverId[] = Object.keys(COVERS) as CoverId[];
export const coverIndex = (id: CoverId): number => COVER_LIST.indexOf(id);

/** Sumidero tipo rejilla en cuneta. Coeficientes de la guía HEC-22 (FHWA). */
export const INLET = {
  /** Coeficiente de vertedero en unidades SI [m^0.5/s]. */
  weirC: 1.66,
  /** Coeficiente de orificio [-]. */
  orificeC: 0.67,
} as const;

/** Parámetros numéricos por defecto del método. */
export const NUMERICS = {
  /** Factor de estabilidad α en dt = α·dx / (√(g·hmax) + |u|max). */
  alpha: 0.7,
  /** Paso de tiempo máximo [s]. */
  dtMax: 1.0,
  /** Ponderación θ de de Almeida et al. (2012); 1 = esquema de Bates et al. (2010). */
  theta: 0.9,
  /** Límite del número de Froude (estabilidad en pendientes fuertes; ver docs/medellin/MODELO.md). */
  froudeMax: 1.5,
  /** Intervalo de registro de series de tiempo [s de simulación]. */
  sampleEvery: 10,
} as const;

export const ENGINE = {
  name: 'inercial-local-urbano',
  version: '1.0.0',
  method: 'Aproximación inercial local de las ecuaciones de aguas someras 2D (Bates et al. 2010; de Almeida et al. 2012) en malla regular, con fricción de Manning semi-implícita.',
} as const;

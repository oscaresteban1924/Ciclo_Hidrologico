// Puente peatonal bajo la creciente: gálibo, empuje del agua sobre el tablero, flotación, cortante en los apoyos y
// colapso. Es un análisis DIDÁCTICO con supuestos declarados; no es una evaluación estructural de un puente real.
//
// · Empuje horizontal (arrastre) sobre el tablero inundado: por metro de puente F/L = C_D · ½ρv² · s, con s el canto
//   del tablero (losa + vigas) y C_D de la envolvente superior de Kerenyi, Sofu y Guo (2009, FHWA-HRT-09-028) en
//   función de la relación de inundación h* = (nivel − fondo de viga) / s:
//   C_D(h*) = 2,7·e^(−2h*²) − 2,7·e^(−0,75h*²) + 2,15 (vale 2,15 cuando el agua toca la viga y cuando lo cubre).
//   Se suma celda por celda a lo largo del vano, con el nivel y la velocidad calculados bajo el puente.
// · Flotación: peso del agua desalojada por la losa, las vigas y el aire que queda atrapado entre las vigas
//   (FHWA HDS-7, 2012, cap. 7: el aire atrapado bajo el tablero aumenta el empuje vertical).
// · Agua con lodo: la densidad de la mezcla es ρ = 1000 + C·(1 − 1000/2650) con la concentración de sedimento C
//   [kg/m³] que calcula el modelo en cada celda; el arrastre y la flotación crecen con ella.
// · Resistencia de cada apoyo al deslizamiento (cortante por fricción, ACI 318): V_n = μ·(A_vf·f_y + N), con
//   μ = 0,6 (concreto vaciado contra concreto endurecido sin rugosidad intencional), los pasadores de anclaje
//   A_vf y la compresión N que deja el peso menos la flotación. Capacidad nominal, sin factores de seguridad.
// · Colapso: cuando el cortante en un apoyo supera su resistencia, o la flotación supera el peso, durante al menos
//   COLLAPSE_HOLD_S segundos simulados seguidos. El tablero queda en el cauce y frena el agua (rugosidad).
// No incluye: impacto de troncos, empalizada de material flotante contra el puente, sustentación hidrodinámica,
// socavación de los estribos ni la flexión de los elementos.

/** Datos del puente (supuestos didácticos del sector demostrativo). */
export interface BridgeSpec {
  /** Vano libre entre apoyos [m] y ancho del tablero [m]. */
  spanM: number;
  widthM: number;
  /** Espesor de la losa [m]; vigas: número, ancho y altura total desde el fondo hasta la cara superior de la losa [m]. */
  slabM: number;
  beams: number;
  beamWidthM: number;
  beamM: number;
  /** Peso de barandas y acabados [kN/m]. */
  railKNm: number;
  /** Pasadores de anclaje por apoyo: número y diámetro [mm]; fluencia del acero [MPa]. */
  dowels: number;
  dowelMm: number;
  fyMPa: number;
}

export const BRIDGE_DEFAULTS: Omit<BridgeSpec, 'spanM' | 'widthM' | 'beamM'> = {
  slabM: 0.16,
  beams: 2,
  beamWidthM: 0.22,
  railKNm: 0.3,
  dowels: 2,
  dowelMm: 12.7,
  fyMPa: 420,
};

export const RHO = 1000;
export const GAMMA_C = 24; // kN/m³, concreto reforzado
export const MU_FRICTION = 0.6;
/** Tiempo simulado seguido con la resistencia superada para declarar el colapso [s]. */
export const COLLAPSE_HOLD_S = 2;
/** Rugosidad de Manning de las celdas donde queda el tablero caído (obstrucción en el cauce). */
export const DEBRIS_MANNING = 0.1;

/** Coeficiente de arrastre de la envolvente superior de Kerenyi et al. (2009) para la relación de inundación h*. */
export function dragCoefficient(hStar: number): number {
  const h = Math.max(0, hStar);
  return 2.7 * Math.exp(-2 * h * h) - 2.7 * Math.exp(-0.75 * h * h) + 2.15;
}

/** Peso propio del tablero [kN]. */
export function selfWeight(b: BridgeSpec): number {
  const area = b.widthM * b.slabM + b.beams * b.beamWidthM * (b.beamM - b.slabM);
  return (area * GAMMA_C + b.railKNm) * b.spanM;
}

/**
 * Empuje vertical del agua [kN] con el agua a `depthAboveSoffit` metros sobre el fondo de las vigas: concreto
 * sumergido más el aire atrapado entre las vigas (bajo la losa), por todo el vano.
 */
export function buoyancy(b: BridgeSpec, depthAboveSoffit: number, rho = RHO): number {
  const d = Math.max(0, depthAboveSoffit);
  const webH = b.beamM - b.slabM;
  const inWeb = Math.min(d, webH), inSlab = Math.min(Math.max(0, d - webH), b.slabM);
  // concreto: vigas en su altura propia, losa por encima
  const concrete = b.beams * b.beamWidthM * inWeb + b.widthM * inSlab;
  // aire atrapado entre las vigas, desde el fondo de las vigas hasta la losa (solo si el agua ya cerró el espacio)
  const between = Math.max(0, b.widthM - b.beams * b.beamWidthM);
  const air = between * inWeb;
  return ((concrete + air) * rho * 9.81 * b.spanM) / 1000;
}

/** Resistencia nominal al deslizamiento de un apoyo [kN] con la compresión N [kN] que le llega. */
export function bearingCapacity(b: BridgeSpec, nKN: number): number {
  const avf = b.dowels * Math.PI * Math.pow(b.dowelMm / 2000, 2); // m²
  return MU_FRICTION * (avf * b.fyMPa * 1000 + Math.max(0, nKN));
}

export type BridgeStatus = 'libre' | 'golpea' | 'sumergido' | 'colapsado';

export interface BridgeState {
  status: BridgeStatus;
  /** Nivel del agua bajo el puente (máximo de las celdas del vano) [m] y gálibo libre bajo la viga [m]. */
  level: number;
  clearance: number;
  /** Velocidad media del agua bajo el puente en el sentido del cauce [m/s]. */
  velocity: number;
  /** Relación de inundación h* y coeficiente de arrastre. */
  hStar: number;
  cd: number;
  /** Empuje horizontal total [kN], flotación [kN], peso [kN], cortante por apoyo [kN] y su resistencia [kN]. */
  drag: number;
  lift: number;
  weight: number;
  shear: number;
  capacity: number;
  /** Densidad media del agua (con lodo) bajo el puente [kg/m³]. */
  rho: number;
  /** Utilización: máximo de cortante/resistencia y flotación/peso. */
  utilization: number;
  /** Máximos del evento. */
  dragMax: number;
  utilMax: number;
  /** Tiempo seguido con la resistencia superada [s] y momento del colapso [s] (−1 si no colapsó). */
  overT: number;
  collapsedAt: number;
  mode: '' | 'deslizamiento' | 'flotacion';
}

export function initialBridge(b: BridgeSpec): BridgeState {
  const weight = selfWeight(b);
  return { status: 'libre', level: -Infinity, clearance: Infinity, velocity: 0, hStar: -1, cd: 0, rho: RHO, drag: 0, lift: 0, weight, shear: 0, capacity: bearingCapacity(b, weight / 2), utilization: 0, dragMax: 0, utilMax: 0, overT: 0, collapsedAt: -1, mode: '' };
}

/**
 * Fuerzas en este instante. `cells` da por cada celda del vano su nivel de agua [m], profundidad [m] y
 * velocidad en el sentido del cauce [m/s]; `dx` es el ancho de la celda a lo largo del vano.
 */
/** Densidad de la mezcla de agua y sedimento [kg/m³] para una concentración C [kg de sedimento por m³]. */
export function mixtureDensity(concKgM3: number): number {
  return RHO + Math.max(0, concKgM3) * (1 - RHO / 2650);
}

export function bridgeForces(b: BridgeSpec, soffit: number, cells: { level: number; depth: number; u: number; rho?: number }[], dx: number): Pick<BridgeState, 'level' | 'clearance' | 'velocity' | 'hStar' | 'cd' | 'drag' | 'lift' | 'shear' | 'capacity' | 'utilization' | 'weight' | 'rho'> & { submerged: number } {
  const s = b.beamM;
  const weight = selfWeight(b);
  let level = -Infinity, drag = 0, vSum = 0, wSum = 0, hsMax = -Infinity, cdAt = 0, rSum = 0;
  for (const q of cells) {
    if (q.depth < 0.01) continue;
    const rho = q.rho ?? RHO;
    level = Math.max(level, q.level);
    vSum += Math.abs(q.u) * q.depth;
    wSum += q.depth;
    rSum += rho * q.depth;
    const hs = (q.level - soffit) / s;
    if (hs > hsMax) hsMax = hs;
    if (hs <= 0) continue;
    const cd = dragCoefficient(hs);
    cdAt = Math.max(cdAt, cd);
    drag += (cd * 0.5 * rho * q.u * q.u * s * dx) / 1000; // kN
  }
  const above = Number.isFinite(level) ? level - soffit : -Infinity;
  const rhoMean = wSum > 0 ? rSum / wSum : RHO;
  const lift = buoyancy(b, above, rhoMean);
  const n = (weight - lift) / 2;
  const shear = drag / 2;
  const capacity = bearingCapacity(b, n);
  const utilization = Math.max(shear / capacity, lift / weight);
  return {
    level,
    clearance: Number.isFinite(level) ? soffit - level : Infinity,
    velocity: wSum > 0 ? vSum / wSum : 0,
    hStar: Number.isFinite(hsMax) ? hsMax : -1,
    cd: cdAt,
    drag,
    lift,
    weight,
    shear,
    capacity,
    utilization,
    submerged: Math.max(0, above),
    rho: rhoMean,
  };
}

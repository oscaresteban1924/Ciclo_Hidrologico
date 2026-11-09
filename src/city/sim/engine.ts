// Motor de escorrentía superficial urbana: aproximación inercial local de aguas someras 2D.
//
//  · Malla regular de celdas cuadradas (dx). Variables: profundidad h [m] en celdas y caudal unitario
//    q [m²/s] en caras (malla escalonada).
//  · Momento (Bates et al. 2010; de Almeida et al. 2012), con fricción de Manning semi-implícita:
//        q⁺ = (q̃ − g·h_f·dt·Δη/dx) / (1 + g·dt·n²·|q̃| / h_f^(7/3)),  h_f = max(η) − max(z)
//    donde q̃ = θ·q + (1−θ)/2·(q_izq + q_der). NO es la solución completa de Saint-Venant: se desprecia
//    la advección de momento. En pendientes fuertes se limita el número de Froude (Fr ≤ 1) por estabilidad.
//  · Continuidad conservativa por volúmenes finitos, con limitador de positividad: ninguna celda entrega
//    más agua de la que tiene, por lo que nunca hay profundidades negativas.
//  · Edificios: celdas sólidas sin flujo por sus caras. La lluvia sobre el techo va a su bajante o depósito.
//  · Tiempo de simulación separado del tiempo de dibujo; los pasos no se recortan por los cuadros de
//    animación (solo por cambios de lluvia y tiempos de registro), así cada corrida es reproducible.

import { G, H_FLOW_MIN, H_WET, INLET, NUMERICS, mmhToMs } from './constants';
import type { Compiled } from './compile';
import { SchematicNetwork, type DrainExchange, type DrainNetworkAdapter } from './drainage';
import { AFFECTED_DEPTH_M, HAZARD_WET_M, UNSTABLE_FROM, bulkingFactor, hazardClass, ringsFor } from './hazard';
import { basinHydrograph, type BasinResult } from './basin';
import { culvertFlow } from './culvert';

/**
 * Reparte un volumen (expresado como lámina × área de celda, [m]) en un grupo de celdas llenando primero las
 * más bajas, hasta un nivel común: el agua que sale del cajón llega al fondo del cauce, no a las orillas.
 */
function fillLowest(cells: number[], vol: number, z: Float64Array, h: Float64Array): void {
  const lv = cells.map((k) => z[k] + h[k]).sort((a, b) => a - b);
  let n = 0, used = 0, L = lv[0];
  // sube el nivel por tramos entre los niveles de las celdas, hasta agotar el volumen
  while (n < lv.length) {
    n++;
    const next = n < lv.length ? lv[n] : Infinity;
    const need = (next - L) * n;
    if (used + need >= vol) {
      L += (vol - used) / n;
      used = vol;
      break;
    }
    used += need;
    L = next;
  }
  for (const k of cells) {
    const s = z[k] + h[k];
    if (s < L) h[k] += L - s;
  }
}

/** Tiempo en que una cobertura «que se tapa con la creciente» pasa de libre a su obstrucción final [s]. */
export const CULVERT_CLOG_S = 180;
import { SOIL_INITIAL_FRACTION, type CreekFlood, type ExposedObject, type RainConfig, type Shared } from './scenario';
import { SewerModel, type SewerTotals } from './sewer';

export interface Hyetograph {
  /** Tiempos de cambio [s]; el último es el fin de la lluvia. */
  times: number[];
  /** Intensidad [mm/h] en cada intervalo [times[k], times[k+1]). */
  mmh: number[];
}

/** Hietograma: constante o con pico (triangular discretizado por minuto, mismo volumen total). */
export function hyetograph(r: RainConfig): Hyetograph {
  const D = r.durationMin * 60;
  if (r.pattern === 'constante') return { times: [0, D], mmh: [r.intensityMmH] };
  const n = Math.max(1, Math.round(r.durationMin));
  const tp = D / 3;
  const peak = 2 * r.intensityMmH;
  const tri = (t: number) => (t <= tp ? (peak * t) / tp : (peak * (D - t)) / (D - tp));
  const times: number[] = [];
  const mmh: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k * D) / n, b = ((k + 1) * D) / n;
    // Promedio exacto del triángulo en el intervalo (regla de Simpson es exacta para lineales a trozos con nodo en tp)
    const m = (a + b) / 2;
    let avg = (tri(a) + 4 * tri(m) + tri(b)) / 6;
    if (a < tp && b > tp) {
      // integrar por tramos alrededor del pico
      const i1 = ((tri(a) + peak) / 2) * (tp - a);
      const i2 = ((peak + tri(b)) / 2) * (b - tp);
      avg = (i1 + i2) / (b - a);
    }
    times.push(a);
    mmh.push(avg);
  }
  times.push(D);
  return { times, mmh };
}

/**
 * Hidrograma de la creciente: tiempos [s] y caudales [m³/s] (lineal a tramos), sobre el caudal base. Con
 * lodo (Cv > 0), el pico de la mezcla es el del agua por el factor de volumen 1/(1 − Cv).
 */
export function creekHydrograph(f: CreekFlood, baseM3s: number): { t: number[]; q: number[] } {
  const t0 = f.startMin * 60, tp = f.timeToPeakMin * 60;
  const peak = Math.max(f.peakM3s * bulkingFactor(f.sedimentCv ?? 0), baseM3s);
  // hidrograma unitario triangular del SCS: base = 2,67·tp (subida tp, bajada 1,67·tp)
  return { t: [0, t0, t0 + tp, t0 + 2.67 * tp], q: [baseM3s, baseM3s, peak, baseM3s] };
}

/** Estado de un vehículo expuesto a la creciente (se calcula en el motor: es determinista). */
export interface DriftState {
  id: string;
  name: string;
  kind: ExposedObject['kind'];
  color?: string;
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** Rumbo [rad, 0 = este, antihorario]. */
  heading: number;
  /** quieto · arrastrado (el agua lo mueve) · varado (se detuvo donde lo dejó el agua) · fuera (salió del sector). */
  state: 'quieto' | 'arrastrado' | 'varado' | 'fuera';
  /** Momento en que el agua lo movió por primera vez [s] (−1 si nunca). */
  tMoved: number;
  /** Recorrido total [m] y peligro máximo donde estuvo. */
  dist: number;
  hazard: number;
}

/** Caudal de un hidrograma lineal a tramos en t [m³/s] (constante fuera de los extremos). */
export function hydroAt(hg: { t: number[]; q: number[] }, t: number): number {
  const { t: ts, q } = hg;
  if (t <= ts[0]) return q[0];
  for (let k = 1; k < ts.length; k++) if (t <= ts[k]) return q[k - 1] + ((q[k] - q[k - 1]) * (t - ts[k - 1])) / Math.max(1e-9, ts[k] - ts[k - 1]);
  return q[q.length - 1];
}

export interface Balance {
  /** Lluvia caída en todo el dominio (incluidos techos) [m³]. */
  precipitation: number;
  /** Entrada externa por los bordes [m³]. */
  inflow: number;
  /** Agua en superficie ahora [m³] y al inicio. */
  surface: number;
  surface0: number;
  /** Infiltrado en suelos y capas porosas desde el inicio [m³]. */
  infiltrated: number;
  /** Agua guardada en depósitos [m³]. */
  devices: number;
  /** Agua aceptada por la red de drenaje (sumideros + descargas de depósitos) [m³]. */
  drained: number;
  /** Agua devuelta por la red a la calle [m³] (0 en la red esquemática). */
  returned: number;
  /** Agua almacenada dentro de la red [m³]. */
  network: number;
  /** Salida por los bordes del dominio [m³]. */
  boundaryOut: number;
  /** Volumen añadido al corregir valores negativos por redondeo [m³]. */
  clipped: number;
  /** Residuo numérico = entradas − (Δsuperficie + infiltrado + depósitos + drenado + salida) [m³].
   *  Incluye, sin compensarlo, el agua creada al corregir negativos por redondeo (ver `clipped`). */
  residual: number;
  /** Desglose de la lluvia de techos [m³]. */
  roofToSurface: number;
  roofToTank: number;
  tankOverflow: number;
  /** Lluvia de techos que fue al alcantarillado de aguas residuales por conexiones erradas [m³]. */
  roofToSewer: number;
  /** Agua de la creciente que entró por la quebrada [m³] (incluida en `inflow`). */
  creekIn: number;
  /** Aportes externos a la red: aguas residuales domésticas, de aguas arriba y conexiones erradas de arriba [m³]. */
  sewageIn: number;
  /** Agua que salió del sector por la red (descargas libres) [m³]. */
  netOut: number;
  /** Residuo de la red = entradas − (almacenado + descargado + devuelto) [m³]. */
  netResidual: number;
  /** Totales por sistema de la red separada (0 = lluvias, 1 = residuales), o null sin red. */
  sewer: SewerTotals | null;
}

export interface Sample {
  t: number;
  rainMmH: number;
  /** Caudal medio de salida por los bordes en el intervalo [m³/s]. */
  outletQ: number;
  /** Caudal medio captado por la red en el intervalo [m³/s]. */
  drainQ: number;
  probes: number[];
  probeSpeed: number[];
  /** Área con profundidad ≥ umbral [m²]. */
  areaAbove: number;
  surface: number;
  residual: number;
  /** Medidor colocado por el estudiante: profundidad [m] y velocidad [m/s], si existe. */
  extra?: [number, number];
  /** Red separada: caudal medio que sale por cada sistema y rebose a la calle [m³/s] (lluvias, residuales). */
  sewer?: { out: [number, number]; overflow: [number, number]; toCreek: number };
  /** Quebrada: caudal que entra, que pasa por la sección dentro del cauce y por fuera [m³/s]; nivel en el talweg [m]. */
  creek?: { qin: number; qChannel: number; qOutside: number; level: number };
  /** Coberturas: caudal por el cajón y sobre la vía [m³/s], nivel aguas arriba [m] y fracción tapada. */
  culverts?: { q: number; over: number; up: number; obs: number }[];
}

export interface Diagnostics {
  steps: number;
  dtMin: number;
  dtMax: number;
  froudeLimited: number;
  faceUpdates: number;
  limiterHits: number;
  maxCourant: number;
  computeMs: number;
  nonFinite: number;
  negativeFixes: number;
}

export interface SimOptions {
  network?: DrainNetworkAdapter;
  numerics?: Partial<{ alpha: number; dtMax: number; theta: number; froudeMax: number; sampleEvery: number }>;
  /** Umbral de profundidad para el indicador de área afectada [m]. */
  threshold?: number;
  /** Agua inicial opcional (pruebas). */
  initialDepth?: Float64Array;
  /** Desactiva la lluvia de techos (pruebas). */
  trunkCapacityM3s?: number;
}

export class CitySim {
  readonly c: Compiled;
  readonly shared: Shared;
  readonly hyeto: Hyetograph;
  readonly endT: number;
  readonly network: DrainNetworkAdapter;
  readonly threshold: number;
  private readonly num: { alpha: number; dtMax: number; theta: number; froudeMax: number; sampleEvery: number };
  private readonly h0: Float64Array | null;

  h: Float64Array;
  qx: Float64Array;
  qy: Float64Array;
  private qxOld: Float64Array;
  private qyOld: Float64Array;
  soil: Float64Array;
  private soil0: Float64Array;
  hmaxField: Float32Array;
  /** Velocidad máxima [m/s], profundidad × velocidad máxima [m²/s] y clase de peligro máxima (0–6) por celda. */
  vmaxField: Float32Array;
  dvMaxField: Float32Array;
  hazMax: Uint8Array;
  /** Vehículos expuestos a la creciente. */
  drift: DriftState[] = [];
  /** Coberturas: caudal por el cajón y sobre la vía en el último paso [m³/s], obstrucción actual, control. */
  culv: { q: number; over: number; up: number; obs: number; control: string; t0: number; vol: number; overVol: number; qMax: number; overMax: number; upMax: number; obsMax: number }[] = [];
  tankVol: Float64Array;
  /** Infiltración de la celda en el último paso [m] (para trazadores). */
  lastInf: Float64Array;
  /** Volumen captado por cada sumidero en el último paso [m³] y acumulado. */
  lastDrain: Float64Array;
  drainTotal: Float64Array;
  drainPeak: Float64Array;
  /** Desborde acumulado de cada jardín hacia afuera [m³] y entrada desde la calle. */
  gardenOut: Float64Array;
  gardenIn: Float64Array;
  private gardenFaces: { g: number; axis: 0 | 1; face: number; outSign: 1 | -1 }[];
  private ex: DrainExchange;
  private out: Float64Array; // flujo saliente por celda (limitador)
  /** Red de alcantarillado separada (si el escenario la trae). */
  readonly sewer: SewerModel | null;
  private extraIn: Float64Array;
  private extIn: Float64Array;
  /** Hidrograma de la creciente (si hay). */
  readonly creekHydro: { t: number[]; q: number[] } | null;
  /** Creciente calculada desde la lluvia en la cuenca (null si la creciente es la de ejemplo). */
  readonly basin: BasinResult | null = null;
  /** Momento en que el agua llegó por primera vez a 10 cm junto a cada edificación [s] (−1 si nunca). */
  firstWet: Float64Array = new Float64Array(0);
  private lastSampleSewer = { out: [0, 0], overflow: [0, 0], toCreek: 0 };

  t = 0;
  lastDt = 0;
  private hmax = 0;
  private umax = 0;
  bal!: Balance;
  samples: Sample[] = [];
  /** Máximo de cada sonda y momento [s]. */
  probeMax: { depth: number; t: number }[] = [];
  maxAreaAbove = 0;
  diag!: Diagnostics;
  private lastSampleT = 0;
  private lastSampleB = 0;
  private lastSampleD = 0;
  private nextSample = 0;
  onStep: ((dt: number) => void) | null = null;
  /** Celda del medidor del estudiante (−1 si no hay). No afecta el cálculo. */
  extraProbe = -1;

  constructor(c: Compiled, shared: Shared, opts: SimOptions = {}) {
    this.c = c;
    this.shared = shared;
    this.hyeto = hyetograph(shared.rain);
    this.endT = shared.simMinutes * 60;
    this.num = { ...NUMERICS, ...(opts.numerics ?? {}) };
    this.threshold = opts.threshold ?? 0.05;
    this.network = opts.network ?? new SchematicNetwork(opts.trunkCapacityM3s ?? 0.25);
    this.h0 = opts.initialDepth ?? null;
    const N = c.nx * c.ny;
    this.h = new Float64Array(N);
    this.qx = new Float64Array((c.nx + 1) * c.ny);
    this.qy = new Float64Array(c.nx * (c.ny + 1));
    this.qxOld = new Float64Array(this.qx.length);
    this.qyOld = new Float64Array(this.qy.length);
    this.soil = new Float64Array(N);
    this.soil0 = new Float64Array(N);
    this.hmaxField = new Float32Array(N);
    this.vmaxField = new Float32Array(N);
    this.dvMaxField = new Float32Array(N);
    this.hazMax = new Uint8Array(N);
    this.tankVol = new Float64Array(c.tanks.length);
    this.lastInf = new Float64Array(N);
    this.lastDrain = new Float64Array(c.drains.length);
    this.drainTotal = new Float64Array(c.drains.length);
    this.drainPeak = new Float64Array(c.drains.length);
    const nIn = c.drains.length + c.tanks.length;
    this.ex = { offered: new Float64Array(nIn), accepted: new Float64Array(nIn), returned: new Float64Array(nIn) };
    this.out = new Float64Array(N);
    this.sewer = c.sewer ? new SewerModel(c.sewer) : null;
    this.extraIn = new Float64Array(c.sewer ? c.sewer.nodes.length : 0);
    this.extIn = new Float64Array(this.extraIn.length);
    if (c.creek && shared.creek?.source === 'cuenca' && c.creek.basin) {
      // creciente desde la lluvia en la cuenca: la misma lluvia del barrio, con la cobertura de la cuenca
      this.basin = basinHydrograph(this.hyeto, c.creek.basin, c.creek.basinCover, shared.soilInitial, c.creek.baseM3s, this.endT, bulkingFactor(shared.creek.sedimentCv ?? 0));
      this.creekHydro = { t: this.basin.t, q: this.basin.q };
    } else this.creekHydro = c.creek && shared.creek ? creekHydrograph(shared.creek, c.creek.baseM3s) : null;
    // Caras del borde de cada jardín (para medir lo que entra y lo que rebosa)
    const gardens = new Set<number>();
    for (let k = 0; k < N; k++) if (c.garden[k] >= 0) gardens.add(c.garden[k]);
    this.gardenOut = new Float64Array(Math.max(1, Math.max(-1, ...gardens) + 1));
    this.gardenIn = new Float64Array(this.gardenOut.length);
    this.gardenFaces = [];
    const { nx, ny } = c;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const g = c.garden[k];
      if (g < 0) continue;
      if (i + 1 < nx && c.garden[k + 1] !== g) this.gardenFaces.push({ g, axis: 0, face: j * (nx + 1) + i + 1, outSign: 1 });
      if (i > 0 && c.garden[k - 1] !== g) this.gardenFaces.push({ g, axis: 0, face: j * (nx + 1) + i, outSign: -1 });
      if (j + 1 < ny && c.garden[k + nx] !== g) this.gardenFaces.push({ g, axis: 1, face: (j + 1) * nx + i, outSign: 1 });
      if (j > 0 && c.garden[k - nx] !== g) this.gardenFaces.push({ g, axis: 1, face: j * nx + i, outSign: -1 });
    }
    this.reset();
  }

  /** Restaura exactamente el estado inicial. */
  reset(): void {
    const c = this.c;
    const N = c.nx * c.ny;
    this.h.fill(0);
    if (this.h0) for (let k = 0; k < N; k++) this.h[k] = c.solid[k] ? 0 : this.h0[k];
    this.qx.fill(0);
    this.qy.fill(0);
    this.qxOld.fill(0);
    this.qyOld.fill(0);
    const f0 = SOIL_INITIAL_FRACTION[this.shared.soilInitial];
    for (let k = 0; k < N; k++) this.soil[k] = c.smax[k] * f0;
    this.soil0.set(this.soil);
    this.hmaxField.fill(0);
    this.vmaxField.fill(0);
    this.dvMaxField.fill(0);
    this.hazMax.fill(0);
    this.culv = c.culverts.map((cu) => ({ q: 0, over: 0, up: cu.zIn, obs: cu.progressive ? 0 : cu.obstruction, control: 'sin flujo', t0: -1, vol: 0, overVol: 0, qMax: 0, overMax: 0, upMax: cu.zIn, obsMax: cu.progressive ? 0 : cu.obstruction }));
    this.drift = c.exposed.map((o) => ({ id: o.id, name: o.name, kind: o.kind, color: o.color, x0: o.at[0], y0: o.at[1], x: o.at[0], y: o.at[1], heading: (o.headingDeg * Math.PI) / 180, state: 'quieto', tMoved: -1, dist: 0, hazard: 0 }));
    this.tankVol.fill(0);
    this.lastInf.fill(0);
    this.lastDrain.fill(0);
    this.drainTotal.fill(0);
    this.drainPeak.fill(0);
    this.gardenOut.fill(0);
    this.gardenIn.fill(0);
    this.network.reset();
    this.sewer?.reset();
    this.lastSampleSewer = { out: [0, 0], overflow: [0, 0], toCreek: 0 };
    this.t = 0;
    this.lastDt = 0;
    let s0 = 0;
    let hm = 0;
    for (let k = 0; k < N; k++) {
      s0 += this.h[k];
      if (this.h[k] > hm) hm = this.h[k];
      this.hmaxField[k] = this.h[k];
    }
    this.hmax = hm;
    this.umax = 0;
    s0 *= c.area;
    this.bal = {
      precipitation: 0,
      inflow: 0,
      surface: s0,
      surface0: s0,
      infiltrated: 0,
      devices: 0,
      drained: 0,
      returned: 0,
      network: 0,
      boundaryOut: 0,
      clipped: 0,
      residual: 0,
      roofToSurface: 0,
      roofToTank: 0,
      tankOverflow: 0,
      roofToSewer: 0,
      creekIn: 0,
      sewageIn: 0,
      netOut: 0,
      netResidual: 0,
      sewer: this.sewer ? this.sewer.tot : null,
    };
    this.diag = { steps: 0, dtMin: Infinity, dtMax: 0, froudeLimited: 0, faceUpdates: 0, limiterHits: 0, maxCourant: 0, computeMs: 0, nonFinite: 0, negativeFixes: 0 };
    this.samples = [];
    this.probeMax = c.probes.map(() => ({ depth: 0, t: 0 }));
    this.firstWet = new Float64Array(c.buildings.length).fill(-1);
    this.maxAreaAbove = 0;
    this.lastSampleT = 0;
    this.lastSampleB = 0;
    this.lastSampleD = 0;
    this.nextSample = 0;
    this.record();
  }

  get finished(): boolean {
    return this.t >= this.endT - 1e-9;
  }

  /** Intensidad de lluvia [mm/h] en el instante t. */
  rainAt(t: number): number {
    const { times, mmh } = this.hyeto;
    if (t < 0 || t >= times[times.length - 1]) return 0;
    for (let k = mmh.length - 1; k >= 0; k--) if (t >= times[k]) return mmh[k];
    return 0;
  }

  private nextBreak(t: number): number {
    let nb = this.endT;
    for (const tb of this.hyeto.times) if (tb > t + 1e-9 && tb < nb) nb = tb;
    if (this.creekHydro) for (const tb of this.creekHydro.t) if (tb > t + 1e-9 && tb < nb) nb = tb;
    if (this.nextSample > t + 1e-9 && this.nextSample < nb) nb = this.nextSample;
    return nb;
  }

  /** Avanza un paso de cálculo. Devuelve el dt usado [s]. */
  step(): number {
    if (this.finished) return 0;
    const t0 = performance.now();
    const c = this.c;
    const { nx, ny, dx, area } = c;
    const N = nx * ny;
    const h = this.h, z = c.z, solid = c.solid, qx = this.qx, qy = this.qy;
    const num = this.num;

    // --- 1) Paso de tiempo estable (criterio tipo CFL de Bates et al. 2010)
    const wave = Math.sqrt(G * this.hmax) + this.umax;
    let dt = wave > 0 ? (num.alpha * dx) / wave : num.dtMax;
    if (dt > num.dtMax) dt = num.dtMax;
    const nb = this.nextBreak(this.t);
    if (this.t + dt > nb) dt = nb - this.t;
    if (dt <= 0) dt = Math.min(num.dtMax, this.endT - this.t);

    // --- 2) Lluvia sobre el suelo y los techos; entrada externa
    const R = mmhToMs(this.rainAt(this.t));
    const bal = this.bal;
    if (R > 0) {
      const w = c.rainWeight;
      const d = R * dt;
      let pv = 0;
      for (let k = 0; k < N; k++) {
        if (w[k] === 0) continue;
        pv += w[k];
        if (!solid[k]) h[k] += d * w[k];
      }
      bal.precipitation += pv * d * area;
      for (const b of c.buildings) {
        if (b.rainWeight === 0) continue;
        const vol = d * b.rainWeight * area;
        if (this.sewer && c.erradaNode[b.index] >= 0) {
          // conexión errada: la bajante entrega al alcantarillado de aguas residuales
          this.extraIn[c.erradaNode[b.index]] += vol;
          bal.roofToSewer += vol;
        } else if (b.tank >= 0) {
          this.tankVol[b.tank] += vol;
          bal.roofToTank += vol;
        } else {
          h[b.downCell] += vol / area;
          bal.roofToSurface += vol;
        }
      }
      for (const tk of c.tanks) {
        const over = this.tankVol[tk.index] - tk.capacity;
        if (over > 0) {
          this.tankVol[tk.index] = tk.capacity;
          h[tk.overflowCell] += over / area;
          bal.tankOverflow += over;
        }
      }
    }
    if (this.shared.inflowLps > 0 && c.inflowCells.length > 0) {
      const vol = (this.shared.inflowLps / 1000) * dt;
      const per = vol / c.inflowCells.length / area;
      for (const k of c.inflowCells) h[k] += per;
      bal.inflow += vol;
    }
    // Creciente de la quebrada: volumen exacto del hidrograma en [t, t+dt] (los quiebres coinciden con pasos)
    if (this.creekHydro && c.creek && c.creek.cells.length > 0) {
      const vol = 0.5 * (hydroAt(this.creekHydro, this.t) + hydroAt(this.creekHydro, this.t + dt)) * dt;
      const per = vol / c.creek.cells.length / area;
      for (const k of c.creek.cells) h[k] += per;
      bal.inflow += vol;
      bal.creekIn += vol;
    }
    // Aportes a la red separada en este paso: aguas residuales, lluvia de conexiones erradas de arriba
    if (this.sewer) {
      const sw = c.sewer!;
      for (let k = 0; k < this.extIn.length; k++) this.extIn[k] = sw.dryIn[k] * dt;
      if (sw.upErradasM2 > 0 && sw.upErradasNode >= 0 && R > 0) this.extIn[sw.upErradasNode] += R * dt * sw.upErradasM2;
      if (R > 0) for (const u of sw.upRunoff) this.extIn[u.node] += R * dt * u.cA;
    }

    // --- 3) Momento en caras interiores
    this.qxOld.set(qx);
    this.qyOld.set(qy);
    const qxo = this.qxOld, qyo = this.qyOld;
    const th = num.theta, th2 = (1 - th) / 2;
    const frMax = num.froudeMax;
    const nArr = c.n;
    let umax = 0;
    let frLim = 0;
    let faces = 0;
    const gdt = G * dt;
    for (let j = 0; j < ny; j++) {
      const rowF = j * (nx + 1), rowC = j * nx;
      for (let i = 1; i < nx; i++) {
        const f = rowF + i;
        const a = rowC + i - 1, b = a + 1;
        if (solid[a] | solid[b]) {
          qx[f] = 0;
          continue;
        }
        const za = z[a], zb = z[b];
        const ea = za + h[a], eb = zb + h[b];
        const hf = (ea > eb ? ea : eb) - (za > zb ? za : zb);
        if (hf <= H_FLOW_MIN) {
          qx[f] = 0;
          continue;
        }
        const q0 = th * qxo[f] + th2 * (qxo[f - 1] + qxo[f + 1]);
        const nf = 0.5 * (nArr[a] + nArr[b]);
        // h^(7/3) = h²·∛h
        let q = q0 === 0 ? -gdt * hf * ((eb - ea) / dx) : (q0 - gdt * hf * ((eb - ea) / dx)) / (1 + (gdt * nf * nf * (q0 < 0 ? -q0 : q0)) / (hf * hf * Math.cbrt(hf)));
        const qlim = frMax * hf * Math.sqrt(G * hf);
        if (q > qlim) {
          q = qlim;
          frLim++;
        } else if (q < -qlim) {
          q = -qlim;
          frLim++;
        }
        qx[f] = q;
        faces++;
        const u = (q < 0 ? -q : q) / hf;
        if (u > umax) umax = u;
      }
    }
    for (let j = 1; j < ny; j++) {
      const rowF = j * nx;
      for (let i = 0; i < nx; i++) {
        const f = rowF + i;
        const a = f - nx, b = f;
        if (solid[a] | solid[b]) {
          qy[f] = 0;
          continue;
        }
        const za = z[a], zb = z[b];
        const ea = za + h[a], eb = zb + h[b];
        const hf = (ea > eb ? ea : eb) - (za > zb ? za : zb);
        if (hf <= H_FLOW_MIN) {
          qy[f] = 0;
          continue;
        }
        const q0 = th * qyo[f] + th2 * (qyo[f - nx] + qyo[f + nx]);
        const nf = 0.5 * (nArr[a] + nArr[b]);
        let q = q0 === 0 ? -gdt * hf * ((eb - ea) / dx) : (q0 - gdt * hf * ((eb - ea) / dx)) / (1 + (gdt * nf * nf * (q0 < 0 ? -q0 : q0)) / (hf * hf * Math.cbrt(hf)));
        const qlim = frMax * hf * Math.sqrt(G * hf);
        if (q > qlim) {
          q = qlim;
          frLim++;
        } else if (q < -qlim) {
          q = -qlim;
          frLim++;
        }
        qy[f] = q;
        faces++;
        const u = (q < 0 ? -q : q) / hf;
        if (u > umax) umax = u;
      }
    }
    // Caras de salida: profundidad normal, acotada por el caudal crítico
    for (const o of c.outlets) {
      const hc = h[o.cell];
      let q = 0;
      if (hc > H_FLOW_MIN) {
        const qn = (Math.pow(hc, 5 / 3) * Math.sqrt(o.slope)) / nArr[o.cell];
        const qc = Math.sqrt(G) * Math.pow(hc, 1.5);
        q = qn < qc ? qn : qc;
        const u = q / hc;
        if (u > umax) umax = u;
      }
      if (o.axis === 'x') qx[o.face] = o.dir * q;
      else qy[o.face] = o.dir * q;
    }

    // --- 4) Limitador de positividad: lo que sale de una celda no supera lo que tiene
    const out = this.out;
    let hits = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const fw = j * (nx + 1) + i, fe = fw + 1, fs = k, fn = k + nx;
        let o = 0;
        if (qx[fw] < 0) o -= qx[fw];
        if (qx[fe] > 0) o += qx[fe];
        if (qy[fs] < 0) o -= qy[fs];
        if (qy[fn] > 0) o += qy[fn];
        out[k] = o;
        if (o > 0) {
          const avail = h[k] * dx; // [m²/s]·dt ≤ h·dx
          if (o * dt > avail) {
            const s = avail / (o * dt);
            if (qx[fw] < 0) qx[fw] *= s;
            if (qx[fe] > 0) qx[fe] *= s;
            if (qy[fs] < 0) qy[fs] *= s;
            if (qy[fn] > 0) qy[fn] *= s;
            hits++;
          }
        }
      }
    }

    // --- 5) Continuidad
    const k_ = dt / dx;
    let hmax = 0;
    let neg = 0;
    let clip = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (solid[k]) continue;
        const fw = j * (nx + 1) + i;
        const fs = k;
        let hn = h[k] + k_ * (qx[fw] - qx[fw + 1] + qy[fs] - qy[fs + nx]);
        if (hn < 0) {
          clip -= hn;
          hn = 0;
          neg++;
        }
        h[k] = hn;
      }
    }
    let bOut = 0;
    for (const o of c.outlets) {
      const q = o.axis === 'x' ? qx[o.face] : qy[o.face];
      bOut += o.dir * q * dx * dt;
    }
    bal.boundaryOut += bOut;
    bal.clipped += clip * area;
    for (const gf of this.gardenFaces) {
      const q = (gf.axis === 0 ? qx[gf.face] : qy[gf.face]) * gf.outSign * dx * dt;
      if (q > 0) this.gardenOut[gf.g] += q;
      else this.gardenIn[gf.g] -= q;
    }

    // --- 6) Infiltración limitada por capacidad, almacenamiento y agua disponible
    const fc = c.fc, smax = c.smax, soil = this.soil, li = this.lastInf;
    let inf = 0;
    for (let k = 0; k < N; k++) {
      li[k] = 0;
      if (fc[k] === 0) continue;
      const hk = h[k];
      if (hk <= 0) continue;
      let f = fc[k] * dt;
      const room = smax[k] - soil[k];
      if (room < f) f = room;
      if (hk < f) f = hk;
      if (f <= 0) continue;
      h[k] = hk - f;
      soil[k] += f;
      li[k] = f;
      inf += f;
    }
    bal.infiltrated += inf * area;

    // --- 6b) Coberturas: el agua pasa de la entrada a la salida por el cajón (transferencia interna)
    if (c.culverts.length) this.stepCulverts(dt);

    // --- 7) Sumideros y descarga de depósitos hacia la red
    if (this.sewer) {
      this.stepSewer(dt);
    } else {
    const ex = this.ex;
    const nd = c.drains.length;
    for (let d = 0; d < nd; d++) {
      const dr = c.drains[d];
      const hd = h[dr.cell];
      let off = 0;
      if (hd > 0 && dr.perimeter > 0) {
        // Profundidad junto al bordillo: la celda guarda el promedio; en una cuneta con pendiente
        // transversal Sx la lámina es triangular (si su ancho T = d/Sx < dx) o trapezoidal.
        const sx = dr.gutterSlope;
        const dc = sx > 0 ? (hd < (sx * dx) / 2 ? Math.sqrt(2 * sx * hd * dx) : hd + (sx * dx) / 2) : hd;
        const qw = INLET.weirC * dr.perimeter * Math.pow(dc, 1.5);
        const qo = INLET.orificeC * dr.openArea * Math.sqrt(2 * G * dc);
        let Q = qw < qo ? qw : qo;
        if (Q > dr.capacity) Q = dr.capacity;
        off = Q * dt;
        const avail = hd * area;
        if (off > avail) off = avail;
      }
      ex.offered[d] = off;
    }
    for (const tk of c.tanks) {
      ex.offered[nd + tk.index] = tk.destination === 'red' ? Math.min(tk.release * dt, this.tankVol[tk.index]) : 0;
    }
    this.network.exchange(this.t, dt, ex);
    let dr = 0;
    let ret = 0;
    for (let d = 0; d < nd; d++) {
      const cell = c.drains[d].cell;
      const acc = Math.min(ex.accepted[d], ex.offered[d]);
      h[cell] -= acc / area;
      if (h[cell] < 0) h[cell] = 0; // solo redondeo: acc ≤ h·A por construcción
      h[cell] += ex.returned[d] / area;
      ret += ex.returned[d];
      this.lastDrain[d] = acc;
      this.drainTotal[d] += acc;
      const rate = acc / dt;
      if (rate > this.drainPeak[d]) this.drainPeak[d] = rate;
      dr += acc;
    }
    for (const tk of c.tanks) {
      const acc = Math.min(ex.accepted[nd + tk.index], ex.offered[nd + tk.index]);
      this.tankVol[tk.index] -= acc;
      dr += acc;
    }
    bal.drained += dr;
    bal.returned += ret;
    }

    // --- 8) Estado, máximos y balance (incluido el peligro profundidad × velocidad por celda)
    let surf = 0;
    const vmF = this.vmaxField, dvF = this.dvMaxField, hzF = this.hazMax;
    const frCap = num.froudeMax;
    for (let k = 0; k < N; k++) {
      const hk = h[k];
      surf += hk;
      if (hk > hmax) hmax = hk;
      if (hk > this.hmaxField[k]) this.hmaxField[k] = hk;
      if (hk >= HAZARD_WET_M) {
        const i = k % nx, fw = k + (k - i) / nx;
        const qxc = 0.5 * (qx[fw] + qx[fw + 1]), qyc = 0.5 * (qy[k] + qy[k + nx]);
        // velocidad de la celda, limitada con el mismo número de Froude del cálculo (evita valores
        // espurios en el frente de mojado, donde la celda aún es muy somera)
        let sp = Math.sqrt(qxc * qxc + qyc * qyc) / hk;
        const cap = frCap * Math.sqrt(G * hk);
        if (sp > cap) sp = cap;
        if (sp > vmF[k]) vmF[k] = sp;
        const dv = sp * hk;
        if (dv > dvF[k]) dvF[k] = dv;
        const cls = hazardClass(hk, sp);
        if (cls > hzF[k]) hzF[k] = cls;
      }
    }
    this.hmax = hmax;
    this.umax = umax;
    bal.surface = surf * area;
    let dev = 0;
    for (let q = 0; q < this.tankVol.length; q++) dev += this.tankVol[q];
    bal.devices = dev;
    bal.network = this.sewer ? this.sewer.storage() : this.network.storage();
    bal.residual =
      bal.precipitation + bal.inflow + bal.returned -
      (bal.surface - bal.surface0 + bal.infiltrated + bal.devices + bal.drained + bal.boundaryOut);

    const dg = this.diag;
    dg.steps++;
    if (dt < dg.dtMin) dg.dtMin = dt;
    if (dt > dg.dtMax) dg.dtMax = dt;
    dg.froudeLimited += frLim;
    dg.faceUpdates += faces;
    dg.limiterHits += hits;
    dg.negativeFixes += neg;
    const cour = (dt * (Math.sqrt(G * hmax) + umax)) / dx;
    if (cour > dg.maxCourant) dg.maxCourant = cour;

    if (this.drift.length) this.stepDrift(dt);
    this.t += dt;
    if (Math.abs(this.t - Math.round(this.t)) < 1e-9) this.t = Math.round(this.t);
    this.lastDt = dt;
    if (this.onStep) this.onStep(dt);
    if (this.t >= this.nextSample - 1e-9) this.record();
    dg.computeMs += performance.now() - t0;
    return dt;
  }

  /** Paso de la red separada: captación, red, rebose y descargas; acumula el balance. */
  private stepSewer(dt: number): void {
    const c = this.c, sw = this.sewer!, bal = this.bal, area = c.area;
    const T = sw.tot;
    const before = [T.fromSector[0] + T.fromSector[1] + T.fromCreek[0] + T.fromCreek[1], T.overflow[0] + T.overflow[1] + T.toCreek[0] + T.toCreek[1], T.external[0] + T.external[1], T.out[0] + T.out[1]];
    // depósitos que descargan a la red: a la cámara de aguas lluvias más cercana
    for (const tk of c.tanks) {
      if (tk.destination !== 'red' || c.sewer!.tankNode < 0) continue;
      const v = Math.min(tk.release * dt, this.tankVol[tk.index]);
      if (v <= 0) continue;
      this.tankVol[tk.index] -= v;
      this.extraIn[c.sewer!.tankNode] += v;
    }
    sw.step(dt, { h: this.h, z: c.z, area, dx: c.dx }, this.extraIn, this.extIn);
    this.extraIn.fill(0);
    this.extIn.fill(0);
    for (let d = 0; d < c.drains.length; d++) {
      const acc = sw.lastCapture[d];
      this.lastDrain[d] = acc;
      this.drainTotal[d] += acc;
      const rate = acc / dt;
      if (rate > this.drainPeak[d]) this.drainPeak[d] = rate;
    }
    bal.drained += T.fromSector[0] + T.fromSector[1] + T.fromCreek[0] + T.fromCreek[1] - before[0];
    bal.returned += T.overflow[0] + T.overflow[1] + T.toCreek[0] + T.toCreek[1] - before[1];
    bal.sewageIn += T.external[0] + T.external[1] - before[2];
    bal.netOut += T.out[0] + T.out[1] - before[3];
    const stored = sw.storage();
    bal.netResidual = bal.drained + bal.sewageIn - (stored + bal.netOut + bal.returned);
  }

  /** Avanza hasta tTarget (sin recortar el último paso) o hasta agotar el presupuesto de tiempo real. */
  advanceTo(tTarget: number, budgetMs = Infinity): boolean {
    const start = performance.now();
    const target = Math.min(tTarget, this.endT);
    while (this.t < target - 1e-9) {
      this.step();
      if (performance.now() - start > budgetMs) return false;
    }
    return true;
  }

  runToEnd(): void {
    while (!this.finished) this.step();
  }

  /**
   * Coberturas (FHWA HDS-5, ver culvert.ts): con el nivel en las celdas de entrada y de salida se calcula el
   * caudal del cajón (el menor entre control de entrada y de salida) y se traslada ese volumen. El enlace es
   * implícito: se busca el caudal Q que, evaluado con los niveles que quedan después de trasladar Q·dt, da el
   * mismo Q (Euler implícito, por bisección; el caudal decrece al bajar el nivel de entrada y subir el de
   * salida, así que la solución es única). Con celdas de poca área y un cajón de gran capacidad, el enlace
   * explícito oscila; el implícito no, y nunca invierte el sentido dentro de un paso. Además no se saca más
   * del 90 % del agua de la entrada. Es una transferencia interna: no cambia el balance del sector.
   */
  private stepCulverts(dt: number): void {
    const c = this.c, h = this.h, z = c.z, area = c.area, dx = c.dx;
    c.culverts.forEach((cu, ci) => {
      const st = this.culv[ci];
      // obstrucción: fija o creciendo desde que el caudal pasa de la mitad de su capacidad libre
      let obs = cu.obstruction;
      if (cu.progressive) {
        if (st.t0 < 0 && st.q >= 0.5 * cu.capacityFree) st.t0 = this.t;
        obs = st.t0 < 0 ? 0 : cu.obstruction * Math.min(1, (this.t - st.t0) / CULVERT_CLOG_S);
      }
      st.obs = obs;
      if (obs > st.obsMax) st.obsMax = obs;
      // nivel de cada lado: el de la celda más honda del grupo (el espejo de agua en el cauce); las celdas de
      // las orillas con una película de lluvia no representan el nivel del cauce
      const side = (cells: number[], z0: number) => {
        let best = -1, hb = 0, sum = 0;
        for (const k of cells) {
          sum += h[k];
          if (h[k] > hb) {
            hb = h[k];
            best = k;
          }
        }
        const level = best < 0 ? z0 : z[best] + h[best];
        // área efectiva al sacar agua (proporcional a la profundidad: la celda más honda baja hb/sum por m³)
        const aOut = best < 0 ? Infinity : (area * sum) / hb;
        // área efectiva al recibir agua (se llenan primero las celdas más bajas: las que quedan bajo el nivel)
        let m = 0;
        for (const k of cells) if (z[k] < level + 0.05) m++;
        return { level, sum, aOut, aIn: area * Math.max(1, m) };
      };
      const sIn = side(cu.inCells, cu.zIn), sOut = side(cu.outCells, cu.zOut);
      const up = sIn.level, dn = sOut.level;
      st.up = up;
      if (up > st.upMax) st.upMax = up;
      const r0 = culvertFlow(cu.geom, cu.rating, up, dn, cu.zIn, cu.zOut, obs);
      let Q = 0;
      let control: string = 'sin flujo';
      if (r0.Q !== 0) {
        const fwd = r0.Q > 0;
        const aF = fwd ? sIn.aOut : sOut.aOut, aT = fwd ? sOut.aIn : sIn.aIn;
        const hFrom = fwd ? sIn.sum : sOut.sum;
        const qCap = Math.min(Math.abs(r0.Q), (0.9 * hFrom * area) / dt);
        // g(q) = caudal con los niveles después de trasladar q·dt, menos q: decreciente en q
        const flowAfter = (q: number) => {
          const d = (q * dt) / aF, u = (q * dt) / aT;
          const r = fwd ? culvertFlow(cu.geom, cu.rating, up - d, dn + u, cu.zIn, cu.zOut, obs) : culvertFlow(cu.geom, cu.rating, up + u, dn - d, cu.zIn, cu.zOut, obs);
          return { q: fwd ? r.Q : -r.Q, control: r.control };
        };
        let lo = 0, hi = qCap;
        if (flowAfter(hi).q >= hi) lo = hi;
        else
          for (let it = 0; it < 28 && hi - lo > 1e-6 * qCap; it++) {
            const mid = 0.5 * (lo + hi);
            if (flowAfter(mid).q > mid) lo = mid;
            else hi = mid;
          }
        // inercia del agua en los cajones (columna rígida): el caudal se acerca al de equilibrio con la
        // constante de tiempo τ = 2L / ((1 + Ke + kf)·V); nunca cambia de sentido dentro de un paso ni pasa
        // del caudal que igualaría los niveles de los dos lados
        const qPrev = fwd ? Math.max(0, st.q) : Math.max(0, -st.q);
        const vBarrel = qPrev / Math.max(1e-6, cu.geom.B * Math.max(0.05, 1 - obs) * cu.geom.D);
        const tau = Math.min(10, Math.max(0.5, (2 * cu.geom.L) / (cu.lossK * Math.max(0.5, vBarrel))));
        const qEq = (Math.abs(up - dn) / dt) / (1 / aF + 1 / aT);
        Q = Math.min(qCap, qEq, qPrev + ((lo - qPrev) * dt) / (tau + dt));
        Q = Math.max(0, Q);
        control = Q > 0 ? flowAfter(lo).control : 'sin flujo';
        const from = fwd ? cu.inCells : cu.outCells, to = fwd ? cu.outCells : cu.inCells;
        const V = Q * dt;
        if (V > 0 && hFrom > 0) {
          for (const k of from) h[k] -= (V * (h[k] / hFrom)) / area;
          fillLowest(to, V / area, z, h);
        }
        if (!fwd) Q = -Q;
      }
      st.q = Q;
      st.control = control;
      st.vol += Q * dt;
      if (Q > st.qMax) st.qMax = Q;
      // agua que pasa por encima de la vía: caudal por el borde aguas abajo del terraplén
      let over = 0;
      for (const f of cu.overFaces) over += this.qx[f] * dx;
      st.over = over;
      st.overVol += Math.max(0, over) * dt;
      if (over > st.overMax) st.overMax = over;
    });
  }

  /**
   * Velocidad de celda para el peligro y los vehículos [m/s]: la de `velocityAt`, limitada con el número
   * de Froude del cálculo (en el frente de mojado la celda es muy somera y el promedio de caras la exagera).
   */
  velocityCapped(k: number): [number, number] {
    const hk = this.h[k];
    if (hk < HAZARD_WET_M) return [0, 0];
    const [u, v] = this.velocityAt(k);
    const sp = Math.hypot(u, v), cap = this.num.froudeMax * Math.sqrt(G * hk);
    return sp > cap ? [(u * cap) / sp, (v * cap) / sp] : [u, v];
  }

  /**
   * Vehículos: quietos mientras el peligro donde están sea menor que su clase de inestabilidad (H2: inseguro
   * para vehículos pequeños, AIDR 7-3); por encima, el agua los mueve con una fracción de su velocidad. Se
   * detienen contra los edificios y donde el peligro vuelve a bajar. No alteran el flujo. La trayectoria es
   * ilustrativa: sigue la velocidad calculada, pero un vehículo real rueda, gira y se atasca de otras formas.
   */
  private stepDrift(dt: number): void {
    const c = this.c, { nx, ny, dx } = c;
    const W = nx * dx, H = ny * dx;
    const carry = 0.8;
    for (const o of this.drift) {
      if (o.state === 'fuera') continue;
      const i = Math.floor(o.x / dx), j = Math.floor(o.y / dx);
      if (i < 0 || j < 0 || i >= nx || j >= ny) {
        o.state = 'fuera';
        continue;
      }
      const k = j * nx + i;
      const d = this.h[k];
      const [u, v] = this.velocityCapped(k);
      const cls = hazardClass(d, Math.hypot(u, v));
      if (cls > o.hazard) o.hazard = cls;
      if (cls < UNSTABLE_FROM[o.kind]) {
        if (o.state === 'arrastrado') o.state = 'varado';
        continue;
      }
      if (o.state !== 'arrastrado') {
        o.state = 'arrastrado';
        if (o.tMoved < 0) o.tMoved = this.t;
      }
      let xn = o.x + carry * u * dt, yn = o.y + carry * v * dt;
      // contra un edificio: se anula la componente que lo metería en la celda sólida
      const blocked = (x: number, y: number) => {
        const ii = Math.floor(x / dx), jj = Math.floor(y / dx);
        return ii >= 0 && jj >= 0 && ii < nx && jj < ny && c.solid[jj * nx + ii] === 1;
      };
      if (blocked(xn, yn)) {
        if (!blocked(xn, o.y)) yn = o.y;
        else if (!blocked(o.x, yn)) xn = o.x;
        else {
          xn = o.x;
          yn = o.y;
        }
      }
      o.dist += Math.hypot(xn - o.x, yn - o.y);
      o.x = xn;
      o.y = yn;
      // el vehículo se alinea poco a poco con la corriente
      const want = Math.atan2(v, u);
      let da = want - o.heading;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      o.heading += da * Math.min(1, 0.6 * dt);
      if (o.x < 0 || o.y < 0 || o.x >= W || o.y >= H) o.state = 'fuera';
    }
  }

  /** Velocidad en el centro de una celda a partir de los caudales de sus caras [m/s]. */
  velocityAt(k: number): [number, number] {
    const { nx } = this.c;
    const hk = this.h[k];
    if (hk < H_WET) return [0, 0];
    const i = k % nx, j = (k - i) / nx;
    const fw = j * (nx + 1) + i;
    const ux = (0.5 * (this.qx[fw] + this.qx[fw + 1])) / hk;
    const uy = (0.5 * (this.qy[k] + this.qy[k + nx])) / hk;
    return [ux, uy];
  }

  private record(): void {
    const c = this.c;
    const N = c.nx * c.ny;
    const dtS = this.t - this.lastSampleT;
    let above = 0;
    for (let k = 0; k < N; k++) if (!c.solid[k] && this.h[k] >= this.threshold) above++;
    const areaAbove = above * c.area;
    if (areaAbove > this.maxAreaAbove) this.maxAreaAbove = areaAbove;
    const probes = c.probes.map((p) => this.h[p.cell]);
    probes.forEach((d, q) => {
      if (d > this.probeMax[q].depth) this.probeMax[q] = { depth: d, t: this.t };
    });
    const s: Sample = {
      t: this.t,
      rainMmH: this.rainAt(Math.max(0, this.t - 1e-6)),
      outletQ: dtS > 0 ? (this.bal.boundaryOut - this.lastSampleB) / dtS : 0,
      drainQ: dtS > 0 ? (this.bal.drained - this.lastSampleD) / dtS : 0,
      probes,
      probeSpeed: c.probes.map((p) => {
        const [u, v] = this.velocityAt(p.cell);
        return Math.hypot(u, v);
      }),
      areaAbove,
      surface: this.bal.surface,
      residual: this.bal.residual,
    };
    if (this.extraProbe >= 0) {
      const [u, v] = this.velocityAt(this.extraProbe);
      s.extra = [this.h[this.extraProbe], Math.hypot(u, v)];
    }
    if (this.t === 0) s.rainMmH = this.rainAt(0);
    if (this.sewer) {
      const T = this.sewer.tot, L = this.lastSampleSewer;
      const r = (a: number, b: number) => (dtS > 0 ? (a - b) / dtS : 0);
      s.sewer = {
        out: [r(T.out[0], L.out[0]), r(T.out[1], L.out[1])],
        overflow: [r(T.overflow[0], L.overflow[0]), r(T.overflow[1], L.overflow[1])],
        toCreek: r(T.toCreek[0], L.toCreek),
      };
      this.lastSampleSewer = { out: [T.out[0], T.out[1]], overflow: [T.overflow[0], T.overflow[1]], toCreek: T.toCreek[0] };
    }
    if (c.creek) s.creek = this.creekSection();
    // primer momento en que el agua llega a 10 cm junto a cada edificación (para el tiempo de aviso)
    if (this.firstWet.length) {
      const rings = ringsFor(c);
      for (let b = 0; b < rings.length; b++) {
        if (this.firstWet[b] >= 0) continue;
        for (const k of rings[b]) if (this.h[k] >= AFFECTED_DEPTH_M) {
          this.firstWet[b] = this.t;
          break;
        }
      }
    }
    if (this.culv.length) s.culverts = this.culv.map((u) => ({ q: u.q, over: u.over, up: u.up, obs: u.obs }));
    this.samples.push(s);
    this.lastSampleT = this.t;
    this.lastSampleB = this.bal.boundaryOut;
    this.lastSampleD = this.bal.drained;
    this.nextSample = Math.round((this.t + this.num.sampleEvery) / this.num.sampleEvery) * this.num.sampleEvery;
    if (this.nextSample <= this.t + 1e-9) this.nextSample += this.num.sampleEvery;
  }

  /** Caudal de la creciente que entra ahora [m³/s] (0 sin creciente). */
  creekInflowAt(t = this.t): number {
    return this.creekHydro ? hydroAt(this.creekHydro, t) : 0;
  }

  /**
   * Sección de control de la quebrada, del estado calculado: caudal que la cruza dentro del cauce (entre
   * orillas) y por fuera (desborde), y nivel del agua en el talweg.
   */
  creekSection(): { qin: number; qChannel: number; qOutside: number; level: number } {
    const c = this.c, cr = c.creek!;
    const { nx, dx } = c;
    let qc = 0, qo = 0;
    for (let j = cr.j0; j <= cr.j1; j++) {
      const f = j * (nx + 1) + cr.i + 1;
      const q = this.qx[f] * dx;
      if (j > cr.jb0 && j < cr.jb1) qc += q;
      else qo += q;
    }
    const kt = cr.jt * nx + cr.i;
    return { qin: this.creekInflowAt(), qChannel: qc, qOutside: qo, level: c.z[kt] + this.h[kt] };
  }

  /** Cuenta valores no finitos o negativos (verificación). */
  check(): { nonFinite: number; negative: number } {
    let nonFinite = 0, negative = 0;
    for (let k = 0; k < this.h.length; k++) {
      if (!Number.isFinite(this.h[k])) nonFinite++;
      else if (this.h[k] < 0) negative++;
    }
    for (let k = 0; k < this.qx.length; k++) if (!Number.isFinite(this.qx[k])) nonFinite++;
    for (let k = 0; k < this.qy.length; k++) if (!Number.isFinite(this.qy[k])) nonFinite++;
    this.diag.nonFinite = nonFinite;
    return { nonFinite, negative };
  }
}

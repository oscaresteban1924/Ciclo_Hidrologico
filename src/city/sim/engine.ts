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
import { SOIL_INITIAL_FRACTION, type RainConfig, type Shared } from './scenario';

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
    this.tankVol = new Float64Array(c.tanks.length);
    this.lastInf = new Float64Array(N);
    this.lastDrain = new Float64Array(c.drains.length);
    this.drainTotal = new Float64Array(c.drains.length);
    this.drainPeak = new Float64Array(c.drains.length);
    const nIn = c.drains.length + c.tanks.length;
    this.ex = { offered: new Float64Array(nIn), accepted: new Float64Array(nIn), returned: new Float64Array(nIn) };
    this.out = new Float64Array(N);
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
    this.tankVol.fill(0);
    this.lastInf.fill(0);
    this.lastDrain.fill(0);
    this.drainTotal.fill(0);
    this.drainPeak.fill(0);
    this.gardenOut.fill(0);
    this.gardenIn.fill(0);
    this.network.reset();
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
    };
    this.diag = { steps: 0, dtMin: Infinity, dtMax: 0, froudeLimited: 0, faceUpdates: 0, limiterHits: 0, maxCourant: 0, computeMs: 0, nonFinite: 0, negativeFixes: 0 };
    this.samples = [];
    this.probeMax = c.probes.map(() => ({ depth: 0, t: 0 }));
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
        if (b.tank >= 0) {
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

    // --- 7) Sumideros y descarga de depósitos hacia la red
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

    // --- 8) Estado, máximos y balance
    let surf = 0;
    for (let k = 0; k < N; k++) {
      const hk = h[k];
      surf += hk;
      if (hk > hmax) hmax = hk;
      if (hk > this.hmaxField[k]) this.hmaxField[k] = hk;
    }
    this.hmax = hmax;
    this.umax = umax;
    bal.surface = surf * area;
    let dev = 0;
    for (let q = 0; q < this.tankVol.length; q++) dev += this.tankVol[q];
    bal.devices = dev;
    bal.network = this.network.storage();
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

    this.t += dt;
    if (Math.abs(this.t - Math.round(this.t)) < 1e-9) this.t = Math.round(this.t);
    this.lastDt = dt;
    if (this.onStep) this.onStep(dt);
    if (this.t >= this.nextSample - 1e-9) this.record();
    dg.computeMs += performance.now() - t0;
    return dt;
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
    this.samples.push(s);
    this.lastSampleT = this.t;
    this.lastSampleB = this.bal.boundaryOut;
    this.lastSampleD = this.bal.drained;
    this.nextSample = Math.round((this.t + this.num.sampleEvery) / this.num.sampleEvery) * this.num.sampleEvery;
    if (this.nextSample <= this.t + 1e-9) this.nextSample += this.num.sampleEvery;
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

// Transporte de sedimentos sobre la superficie: la lluvia y el agua arrancan tierra, el agua la lleva, la deja
// donde se frena y se la llevan los sumideros, las coberturas y las salidas del sector.
//
// Método (una sola clase de grano, D50 = 60 µm, limo grueso):
// - Concentración suspendida por celda, C = m / h [kg/m³], con m la masa por área [kg/m²]. Se mueve con los
//   mismos caudales de cara del cálculo del agua (aguas arriba), así que nunca sale de una celda más masa de la
//   que tiene (el limitador de positividad del agua ya acota el volumen que sale).
// - Capacidad de transporte de Govers (1990), como en LISEM (De Roo, Wesseling y Jetten, 1996):
//   TC = 2650·c·(100·V·S − 0,4)^d [kg/m³], con c = ((D50+5)/0,32)^−0,6 y d = ((D50+5)/300)^0,25 (D50 en µm),
//   V la velocidad del agua [m/s] y S el seno de la pendiente del terreno; se limita a 848 kg/m³ (32 % en volumen).
// - Arranque por el agua (si C < TC): Y·(TC − C)·Vs [kg/m²·s], con Vs la velocidad de caída y la eficiencia
//   Y = 1/(0,89 + 0,56·Coh) de Rauws y Govers (1988) según la cohesión del suelo y las raíces; el material suelto
//   (mugre de la calle y lodo ya depositado) tiene Y = 1. Nunca supera lo que falta para llegar a TC.
// - Depósito (si C > TC): (C − TC)·(1 − exp(−Δt·Vs/h))·h [kg/m²] (LISEM), con la caída frenada por la
//   concentración de Richardson y Zaki (1954), Vs·(1 − Cv)^4,65, que importa en el agua con mucho lodo.
// - Salpicadura de la lluvia sobre suelo erosionable (forma de WEPP para entresurcos, Liebenow et al., 1990):
//   Di = Ki·I²·Sf·Ce, con Sf = 1,05 − 0,85·exp(−4·sen θ), Ki = 2·10⁶ kg·s/m⁴ (tierra suelta) y Ce el factor de la
//   cobertura (la vegetación protege el suelo).
// - Velocidad de caída de Ferguson y Church (2004) para granos naturales.
// Simplificaciones: el sedimento no cambia el volumen ni la fricción del agua; el agua que vuelve de la red sale
// limpia; las laderas vecinas y la entrada externa aportan agua limpia. Valores ESTIMADOS: no calibrados.

import type { Compiled } from './compile';
import { COVER_LIST, G, type CoverId } from './constants';

/** Parámetros del sedimento. */
export const SED = {
  /** Diámetro medio [µm]. */
  d50um: 60,
  /** Densidad del grano [kg/m³]. */
  rhoS: 2650,
  /** Concentración máxima [kg/m³] (32 % en volumen, como en LISEM). */
  maxConc: 848,
  /** Potencia unitaria crítica de Govers [cm/s]. */
  omegaC: 0.4,
  /** Erosionabilidad entre surcos para tierra suelta [kg·s/m⁴] (WEPP: 10⁶–10⁷ en suelos agrícolas). */
  ki: 2e6,
  /** Mugre suelta inicial en calles y andenes [kg/m²] (Sartor y Boyd, 1972: decenas de g/m²). */
  streetDirt: 0.02,
  /** Lámina por debajo de la cual el agua no lleva sedimento: todo se deposita [m]. */
  hMin: 1e-4,
} as const;

/** Velocidad de caída de Ferguson y Church (2004) [m/s] para un grano de D [m]. */
export function settlingVelocity(D: number, nu = 1.0e-6, R = 1.65): number {
  return (R * G * D * D) / (18 * nu + Math.sqrt(0.75 * 1.0 * R * G * D * D * D));
}

/** Coeficientes de Govers (1990) para el D50 [µm]. */
export function goversCoeffs(d50um: number): { c: number; d: number } {
  return { c: Math.pow((d50um + 5) / 0.32, -0.6), d: Math.pow((d50um + 5) / 300, 0.25) };
}

const WS = settlingVelocity(SED.d50um * 1e-6);
const GV = goversCoeffs(SED.d50um);

/** Capacidad de transporte [kg/m³] para velocidad V [m/s] y seno de la pendiente S. */
export function transportCapacity(V: number, S: number): number {
  const om = 100 * V * S;
  if (om <= SED.omegaC) return 0;
  const tc = SED.rhoS * GV.c * Math.pow(om - SED.omegaC, GV.d);
  return tc < SED.maxConc ? tc : SED.maxConc;
}

/** Eficiencia de arranque de Rauws y Govers (1988) para una cohesión [kPa]. */
export const efficiency = (cohKPa: number): number => 1 / (0.89 + 0.56 * cohKPa);

export interface SedCover {
  /** Tierra erosionable disponible [kg/m²] (0 = la superficie no se erosiona). */
  pool: number;
  /** ¿El agua que corre puede arrancar tierra? (con pasto o árboles, no: solo la salpicadura en los claros). */
  flow: boolean;
  /** Cohesión del suelo más la de las raíces [kPa]. */
  cohesion: number;
  /** Factor de la salpicadura (1 = tierra desnuda). */
  splash: number;
  /** Mugre suelta inicial [kg/m²]. */
  loose: number;
  basis: string;
}

/** Densidad aparente del lodo depositado [kg/m³] (para expresar el depósito como espesor). */
export const DEPOSIT_DENSITY = 1600;

/**
 * Erosionabilidad por cobertura (ESTIMADA). La capa disponible limita cuánto puede perder una celda: 15 kg/m²
 * es cerca de 1 cm de tierra suelta (densidad aparente 1 600 kg/m³). Con pasto o árboles, las raíces y la
 * cobertura impiden que el agua que corre arranque tierra (simplificación); solo queda la salpicadura en los
 * claros, que es muy poca.
 */
export const SED_COVERS: Record<CoverId, SedCover> = {
  asfalto: { pool: 0, flow: false, cohesion: 0, splash: 0, loose: SED.streetDirt, basis: 'No se erosiona; lleva mugre suelta de la calle.' },
  concreto: { pool: 0, flow: false, cohesion: 0, splash: 0, loose: SED.streetDirt, basis: 'No se erosiona; lleva mugre suelta.' },
  anden: { pool: 0, flow: false, cohesion: 0, splash: 0, loose: SED.streetDirt, basis: 'No se erosiona; lleva mugre suelta.' },
  adoquin_permeable: { pool: 0, flow: false, cohesion: 0, splash: 0, loose: SED.streetDirt, basis: 'Juntas con arena; no se modela su pérdida.' },
  grama: { pool: 15, flow: false, cohesion: 30, splash: 0.05, loose: 0, basis: 'Pasto: el agua que corre no arranca tierra; la salpicadura es el 5 % de la de la tierra desnuda.' },
  zona_verde: { pool: 15, flow: false, cohesion: 45, splash: 0.03, loose: 0, basis: 'Árboles y hojarasca: el agua que corre no arranca tierra; la salpicadura es el 3 % de la de la tierra desnuda.' },
  jardin_lluvia: { pool: 5, flow: false, cohesion: 20, splash: 0.05, loose: 0, basis: 'Medio con cobertura vegetal: como el pasto.' },
  cauce: { pool: 0, flow: false, cohesion: 0, splash: 0, loose: 0, basis: 'El lecho no se erosiona en el modelo; el lodo que llega sí puede depositarse y volver a moverse.' },
  cancha: { pool: 0, flow: false, cohesion: 0, splash: 0, loose: SED.streetDirt, basis: 'Placa de concreto con mugre suelta.' },
  techo: { pool: 0, flow: false, cohesion: 0, splash: 0, loose: 0, basis: 'Sólido.' },
  tierra: { pool: 15, flow: true, cohesion: 8, splash: 1, loose: 0, basis: 'Tierra suelta de obra o ladera sin cobertura: unos 1 cm de capa suelta, cohesión baja (8 kPa) y sin protección contra la salpicadura.' },
};

export interface SedBalance {
  /** Tierra arrancada del suelo (salpicadura + agua) [kg]. */
  eroded: number;
  /** De eso, por salpicadura [kg]. */
  splash: number;
  /** Mugre suelta al empezar [kg]. */
  loose0: number;
  /** Lodo que entra con la creciente [kg]. */
  inflow: number;
  /** Suspendido en el agua ahora [kg]. */
  suspended: number;
  /** Suelto o depositado sobre la superficie ahora [kg]. */
  loose: number;
  /** Lo que se llevaron los sumideros a la red [kg]. */
  drained: number;
  /** Lo que salió del sector por los bordes y la quebrada [kg]. */
  out: number;
  /** Depositado en total (incluye lo que se vuelve a mover) [kg]. */
  deposited: number;
  /** Residuo = entradas − (existencias + salidas) [kg]. */
  residual: number;
}

export class SedimentModel {
  readonly c: Compiled;
  /** Masa suspendida por área [kg/m²]. */
  readonly m: Float64Array;
  /** Material suelto (mugre y lodo depositado) [kg/m²]. */
  readonly loose: Float64Array;
  /** Tierra erosionable que queda [kg/m²]. */
  readonly pool: Float64Array;
  /** Lodo depositado máximo alcanzado (sin la mugre inicial) [kg/m²]. */
  readonly depoMax: Float64Array;
  /** Concentración máxima alcanzada [kg/m³]. */
  readonly cMax: Float64Array;
  private Y: Float64Array;
  private ce: Float64Array;
  private sinS: Float64Array;
  private sf: Float64Array;
  private loose0: Float64Array;
  private flux: Float64Array;
  readonly bal: SedBalance;
  /** Lodo que salió por las caras de salida en el último paso [kg/s]. */
  lastOut = 0;
  readonly ws = WS;

  constructor(c: Compiled) {
    this.c = c;
    const N = c.nx * c.ny;
    this.m = new Float64Array(N);
    this.loose = new Float64Array(N);
    this.pool = new Float64Array(N);
    this.depoMax = new Float64Array(N);
    this.cMax = new Float64Array(N);
    this.Y = new Float64Array(N);
    this.ce = new Float64Array(N);
    this.sinS = new Float64Array(N);
    this.sf = new Float64Array(N);
    this.loose0 = new Float64Array(N);
    this.flux = new Float64Array(N);
    const { nx, ny, dx, z, solid, cover } = c;
    let l0 = 0;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (solid[k]) continue;
        const sc = SED_COVERS[COVER_LIST[cover[k]]] ?? SED_COVERS.concreto;
        this.pool[k] = sc.pool;
        this.loose[k] = sc.loose;
        this.loose0[k] = sc.loose;
        l0 += sc.loose;
        this.Y[k] = sc.flow ? efficiency(sc.cohesion) : 0;
        this.ce[k] = sc.splash;
        // pendiente del terreno (diferencias centradas, sin cruzar construcciones)
        const zc = z[k];
        const zx0 = i > 0 && !solid[k - 1] ? z[k - 1] : zc, zx1 = i < nx - 1 && !solid[k + 1] ? z[k + 1] : zc;
        const zy0 = j > 0 && !solid[k - nx] ? z[k - nx] : zc, zy1 = j < ny - 1 && !solid[k + nx] ? z[k + nx] : zc;
        const gx = (zx1 - zx0) / ((i > 0 && i < nx - 1 ? 2 : 1) * dx), gy = (zy1 - zy0) / ((j > 0 && j < ny - 1 ? 2 : 1) * dx);
        const tan = Math.min(1.5, Math.hypot(gx, gy));
        const sin = tan / Math.sqrt(1 + tan * tan);
        this.sinS[k] = sin;
        this.sf[k] = 1.05 - 0.85 * Math.exp(-4 * sin);
      }
    this.bal = { eroded: 0, splash: 0, loose0: l0 * c.area, inflow: 0, suspended: 0, loose: l0 * c.area, drained: 0, out: 0, deposited: 0, residual: 0 };
  }

  /** Concentración en la celda [kg/m³] para la lámina h [m]. */
  conc(k: number, h: number): number {
    return h > SED.hMin ? this.m[k] / h : 0;
  }

  /** Lodo que entra con agua (creciente): masa = concentración × volumen, repartida en las celdas. */
  addInflow(cells: number[], vol: number, concKgM3: number): void {
    if (concKgM3 <= 0 || vol <= 0 || cells.length === 0) return;
    const mass = concKgM3 * vol;
    const per = mass / cells.length / this.c.area;
    for (const k of cells) this.m[k] += per;
    this.bal.inflow += mass;
  }

  /**
   * Transporte con los caudales de cara del paso (ya limitados), aguas arriba, con la lámina antes de la
   * continuidad. Las caras de salida sacan lodo del sector.
   */
  advect(qx: Float64Array, qy: Float64Array, h: Float64Array, dt: number): void {
    const c = this.c, { nx, ny, dx, area } = c, m = this.m, fl = this.flux;
    fl.fill(0);
    const k_ = (dt * dx) / area; // volumen por unidad de caudal de cara, por área de celda: dt/dx
    for (let j = 0; j < ny; j++) {
      const rowF = j * (nx + 1), rowC = j * nx;
      for (let i = 1; i < nx; i++) {
        const q = qx[rowF + i];
        if (q === 0) continue;
        const a = rowC + i - 1, b = a + 1;
        const up = q > 0 ? a : b;
        const hu = h[up];
        if (hu <= 0 || m[up] <= 0) continue;
        const dm = (m[up] / hu) * (q > 0 ? q : -q) * k_;
        if (q > 0) {
          fl[a] -= dm;
          fl[b] += dm;
        } else {
          fl[b] -= dm;
          fl[a] += dm;
        }
      }
    }
    for (let j = 1; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const f = j * nx + i;
        const q = qy[f];
        if (q === 0) continue;
        const a = f - nx, b = f;
        const up = q > 0 ? a : b;
        const hu = h[up];
        if (hu <= 0 || m[up] <= 0) continue;
        const dm = (m[up] / hu) * (q > 0 ? q : -q) * k_;
        if (q > 0) {
          fl[a] -= dm;
          fl[b] += dm;
        } else {
          fl[b] -= dm;
          fl[a] += dm;
        }
      }
    }
    let out = 0;
    for (const o of c.outlets) {
      const q = (o.axis === 'x' ? qx[o.face] : qy[o.face]) * o.dir;
      const k = o.cell;
      if (q <= 0 || h[k] <= 0 || m[k] <= 0) continue;
      const dm = (m[k] / h[k]) * q * k_;
      fl[k] -= dm;
      out += dm * area;
    }
    for (let k = 0; k < m.length; k++) {
      if (fl[k] === 0) continue;
      const v = m[k] + fl[k];
      m[k] = v > 0 ? v : 0; // solo redondeo: la salida no supera lo que hay
    }
    this.bal.out += out;
    this.lastOut = dt > 0 ? out / dt : 0;
  }

  /**
   * Salpicadura, arranque y depósito en cada celda con la lámina y los caudales del final del paso.
   * @param R lluvia [m/s]; @param frMax límite de Froude para la velocidad de celda.
   */
  exchange(h: Float64Array, qx: Float64Array, qy: Float64Array, R: number, rainW: Float64Array, dt: number, frMax: number): void {
    const c = this.c, { nx, ny, area, solid } = c;
    const m = this.m, loose = this.loose, pool = this.pool, Y = this.Y, sinS = this.sinS;
    const ws = this.ws;
    const settleK = dt * ws;
    let eroded = 0, splashT = 0, dep = 0;
    const kiR2 = SED.ki * R * R * dt;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (solid[k]) continue;
        const hk = h[k];
        // salpicadura de la lluvia sobre suelo erosionable
        if (kiR2 > 0 && this.ce[k] > 0 && pool[k] > 0 && rainW[k] > 0) {
          let ds = kiR2 * rainW[k] * rainW[k] * this.sf[k] * this.ce[k];
          if (ds > pool[k]) ds = pool[k];
          pool[k] -= ds;
          eroded += ds;
          splashT += ds;
          if (hk > SED.hMin) m[k] += ds;
          else loose[k] += ds; // sin agua que lo lleve, queda suelto
        }
        if (hk <= SED.hMin) {
          if (m[k] > 0) {
            loose[k] += m[k];
            dep += m[k];
            m[k] = 0;
          }
          continue;
        }
        // velocidad de la celda (promedio de caras), limitada con el número de Froude del cálculo
        const fw = j * (nx + 1) + i;
        const ux = 0.5 * (qx[fw] + qx[fw + 1]), uy = 0.5 * (qy[k] + qy[k + nx]);
        let V = Math.sqrt(ux * ux + uy * uy) / hk;
        const cap = frMax * Math.sqrt(G * hk);
        if (V > cap) V = cap;
        const tc = transportCapacity(V, sinS[k]);
        const C = m[k] / hk;
        if (C > tc) {
          // caída frenada por los demás granos (Richardson y Zaki, 1954): Vs·(1 − Cv)^4,65
          const cv = C / SED.rhoS;
          const hind = cv > 0.001 ? Math.pow(1 - Math.min(0.6, cv), 4.65) : 1;
          const d = (C - tc) * (1 - Math.exp((-settleK * hind) / hk)) * hk;
          m[k] -= d;
          loose[k] += d;
          dep += d;
        } else if (tc > C) {
          let room = (tc - C) * hk;
          // primero lo suelto (sin cohesión), después la tierra con su eficiencia
          if (loose[k] > 0) {
            let e = (tc - C) * ws * dt;
            if (e > loose[k]) e = loose[k];
            if (e > room) e = room;
            loose[k] -= e;
            m[k] += e;
            room -= e;
          }
          if (room > 0 && pool[k] > 0) {
            const C2 = m[k] / hk;
            let e = Y[k] * (tc - C2) * ws * dt;
            if (e > pool[k]) e = pool[k];
            if (e > room) e = room;
            if (e > 0) {
              pool[k] -= e;
              m[k] += e;
              eroded += e;
            }
          }
        }
        const Cn = m[k] / hk;
        if (Cn > this.cMax[k]) this.cMax[k] = Cn;
        const dl = loose[k] - this.loose0[k];
        if (dl > this.depoMax[k]) this.depoMax[k] = dl;
      }
    this.bal.eroded += eroded * area;
    this.bal.splash += splashT * area;
    this.bal.deposited += dep * area;
  }

  /** El sumidero de la celda se lleva la fracción `frac` del agua (y del lodo suspendido). */
  capture(k: number, frac: number): void {
    if (frac <= 0 || this.m[k] <= 0) return;
    const f = frac > 1 ? 1 : frac;
    const dm = this.m[k] * f;
    this.m[k] -= dm;
    this.bal.drained += dm * this.c.area;
  }

  /** Traslado interno (cobertura): sale la fracción `frac` del lodo de `from` y entra repartido en `to` según `wTo`. */
  transfer(from: number[], frac: number, to: number[], wTo: number[]): void {
    if (frac <= 0) return;
    let mass = 0;
    for (const k of from) {
      const dm = this.m[k] * Math.min(1, frac);
      this.m[k] -= dm;
      mass += dm;
    }
    const W = wTo.reduce((s, v) => s + v, 0);
    if (mass <= 0) return;
    if (W <= 0) {
      for (const k of to) this.m[k] += mass / to.length;
      return;
    }
    to.forEach((k, q) => (this.m[k] += (mass * wTo[q]) / W));
  }

  /** Existencias y residuo del balance. */
  updateBalance(): SedBalance {
    const b = this.bal, area = this.c.area;
    let s = 0, l = 0, p = 0;
    for (let k = 0; k < this.m.length; k++) {
      s += this.m[k];
      l += this.loose[k];
      p += this.pool[k];
    }
    b.suspended = s * area;
    b.loose = l * area;
    b.residual = b.loose0 + b.eroded + b.inflow - (b.suspended + b.loose + b.drained + b.out);
    void p;
    return b;
  }
}

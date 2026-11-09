// Red de alcantarillado separada acoplada a la superficie (drenaje dual 1D–2D).
//
//  · Dos sistemas independientes: aguas lluvias (sumideros → cámaras → descarga) y aguas residuales
//    (acometidas de las casas → cámaras → colector fuera del sector). No se comunican entre sí.
//  · Tuberías circulares: caudal con la aproximación inercial local y fricción de Manning semi-implícita,
//        Q⁺ = (Q + g·A·dt·S) / (1 + g·dt·n²·|Q| / (A·R^(4/3))),  S = (H_arriba − H_abajo) / L,
//    con área y radio hidráulico de la sección circular para la lámina en el extremo más alto. Llena, la
//    tubería trabaja a presión con el área completa (sobrecarga).
//  · Nodos (cámaras, cámaras de caída y cajas de sumidero): guardan el agua. Su área en planta es la del
//    pozo más la mitad del espejo de agua de las tuberías que llegan (como en los modelos de nudos y
//    tramos). Cuando el nivel supera la tapa (la rasante), el exceso sale a la calle: rebose.
//  · Sumideros: captan de la celda de la calle con la ecuación de su tipo (rejilla, ventana o mixto) solo
//    mientras su caja no está llena; si la red está en carga y la caja rebosa, el sumidero devuelve agua.
//  · Descargas: «colector» = sigue fuera del sector (descarga libre); «quebrada» = entrega a la celda del
//    cauce y su nivel es el de la quebrada: si la quebrada crece, la descarga queda ahogada (remanso).
//  · Conservación: lo que entra (sumideros, acometidas, aguas arriba) = almacenado + descargado + rebosado.

import { G, INLET } from './constants';

export type SystemIdx = 0 | 1; // 0 = aguas lluvias, 1 = aguas residuales
export const SYSTEM_NAMES = ['aguas lluvias', 'aguas residuales'] as const;

/** Geometría de la sección circular con lámina y [m]: área, perímetro mojado, ancho superficial. */
export function circ(D: number, y: number): { A: number; P: number; T: number; R: number } {
  if (y <= 0) return { A: 0, P: 0, T: 0, R: 0 };
  if (y >= D) {
    const A = (Math.PI * D * D) / 4;
    return { A, P: Math.PI * D, T: 0, R: D / 4 };
  }
  const th = 2 * Math.acos(1 - (2 * y) / D);
  const A = ((D * D) / 8) * (th - Math.sin(th));
  const P = (th * D) / 2;
  return { A, P, T: D * Math.sin(th / 2), R: A / P };
}

/** Caudal a tubo lleno con Manning [m³/s]. */
export function fullFlow(D: number, n: number, S: number): number {
  const A = (Math.PI * D * D) / 4;
  return (A * Math.pow(D / 4, 2 / 3) * Math.sqrt(Math.max(S, 0))) / n;
}

/** Lámina normal [m] para un caudal Q en una tubería (bisección; null si no cabe a tubo lleno). */
export function normalDepth(D: number, n: number, S: number, Q: number): number | null {
  if (Q <= 0) return 0;
  const q = (y: number) => {
    const g = circ(D, y);
    return (g.A * Math.pow(g.R, 2 / 3) * Math.sqrt(S)) / n;
  };
  // el caudal máximo con lámina libre ocurre cerca de y/D = 0,94
  if (q(0.938 * D) < Q) return null;
  let lo = 0, hi = 0.938 * D;
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    if (q(m) < Q) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

export interface SNode {
  id: string;
  name: string;
  system: SystemIdx;
  kind: 'camara' | 'caida' | 'caja-sumidero' | 'descarga';
  x: number;
  y: number;
  cell: number;
  /** Cota de la tapa (rasante en la celda) y del fondo [m]. */
  rim: number;
  inv: number;
  /** Área en planta del pozo o de la caja [m²]. */
  area0: number;
  /** 0 = nodo interior, 1 = descarga libre fuera del sector, 2 = descarga a la quebrada. */
  outfall: 0 | 1 | 2;
  /** Tabla volumen–nivel: V[k] para y = k·dy desde el fondo hasta la tapa. */
  vTab: Float64Array;
  dy: number;
  vRim: number;
}

export interface SPipe {
  id: string;
  system: SystemIdx;
  a: number;
  b: number;
  D: number;
  n: number;
  L: number;
  zUp: number;
  zDn: number;
  role: 'colector' | 'conexion-sumidero';
  material: 'concreto' | 'PVC';
  /** Caudal a tubo lleno con la pendiente geométrica [m³/s]. */
  qFull: number;
}

export interface SInlet {
  drain: number;
  node: number;
  cell: number;
  type: 'rejilla' | 'ventana' | 'mixto';
  /** Rejilla: perímetro de vertedero y área de orificio (ya reducidos por obstrucción). */
  perimeter: number;
  openArea: number;
  /** Ventana: longitud efectiva (ya reducida), altura libre, coeficiente en pendiente y si está en punto bajo. */
  winL: number;
  winH: number;
  kGrade: number;
  sag: boolean;
  gutterSlope: number;
}

export interface CompiledSewer {
  nodes: SNode[];
  pipes: SPipe[];
  /** Por sumidero (índice del sumidero en el escenario): su entrada a la red, o null. */
  inlets: (SInlet | null)[];
  /** Aporte constante a cada nodo [m³/s]: aguas residuales domésticas, infiltración y lo que llega de arriba. */
  dryIn: Float64Array;
  /** Edificios con bajante conectada por error (si la intervención está activa) y su nodo de residuales. */
  erradas: { building: number; node: number }[];
  /** Escorrentía de aguas arriba que llega por el colector: nodo y C·A [m²]. */
  upRunoff: { node: number; cA: number }[];
  /** Techos conectados por error aguas arriba [m²] y nodo donde llega esa lluvia (−1 si no aplica). */
  upErradasM2: number;
  upErradasNode: number;
  /** Nodo de aguas lluvias que recibe la descarga de los depósitos (−1 si no hay). */
  tankNode: number;
  /** Personas estimadas y caudal de aguas residuales domésticas [m³/s] (para el panel). */
  persons: number;
  dryTotal: number;
}

/** Coeficiente k de la ventana en pendiente (EPM GD-AS002, 8.5): 0,20 (2 %), 0,22 (4 %), 0,23 (8 %). */
export function windowK(slope: number): number {
  const s = Math.max(0.02, Math.min(0.08, slope));
  return s <= 0.04 ? 0.2 + ((s - 0.02) / 0.02) * 0.02 : 0.22 + ((s - 0.04) / 0.04) * 0.01;
}

/** Caudal que capta un sumidero con lámina dc junto al bordillo [m³/s] (sin límite de la red). */
export function inletCapture(i: Pick<SInlet, 'type' | 'perimeter' | 'openArea' | 'winL' | 'winH' | 'kGrade' | 'sag'>, dc: number): number {
  if (dc <= 0) return 0;
  let Q = 0;
  if (i.type !== 'ventana' && i.perimeter > 0) {
    const qw = INLET.weirC * i.perimeter * Math.pow(dc, 1.5);
    const qo = INLET.orificeC * i.openArea * Math.sqrt(2 * G * dc);
    Q += qw < qo ? qw : qo;
  }
  if (i.type !== 'rejilla' && i.winL > 0) {
    if (!i.sag) Q += i.kGrade * i.winL * Math.sqrt(G) * Math.pow(dc, 1.5);
    else {
      const qw = 1.65 * i.winL * Math.pow(dc, 1.5);
      const qo = dc > i.winH ? INLET.orificeC * i.winL * i.winH * Math.sqrt(2 * G * (dc - i.winH / 2)) : Infinity;
      Q += qw < qo ? qw : qo;
    }
  }
  return Q;
}

/** Profundidad junto al bordillo a partir de la profundidad media de la celda (cuneta triangular). */
export function curbDepth(h: number, sx: number, dx: number): number {
  if (h <= 0) return 0;
  if (sx <= 0) return h;
  return h < (sx * dx) / 2 ? Math.sqrt(2 * sx * h * dx) : h + (sx * dx) / 2;
}

/** Construye la tabla volumen–nivel de un nodo (pozo + mitad del espejo de las tuberías conectadas). */
export function buildNodeTable(node: Pick<SNode, 'inv' | 'rim' | 'area0'>, ends: { L: number; D: number; zEnd: number }[]): { vTab: Float64Array; dy: number; vRim: number } {
  const depth = Math.max(0.05, node.rim - node.inv);
  const dy = 0.005;
  const nk = Math.ceil(depth / dy) + 1;
  const vTab = new Float64Array(nk);
  const areaAt = (y: number) => {
    let a = node.area0;
    for (const e of ends) a += 0.5 * e.L * circ(e.D, y + node.inv - e.zEnd).T;
    return a;
  };
  for (let k = 1; k < nk; k++) {
    const y0 = (k - 1) * dy, y1 = k * dy;
    vTab[k] = vTab[k - 1] + 0.5 * (areaAt(y0) + areaAt(y1)) * dy;
  }
  // volumen a la cota exacta de la tapa
  const kr = depth / dy;
  const k0 = Math.min(nk - 2, Math.floor(kr));
  const vRim = vTab[k0] + (vTab[k0 + 1] - vTab[k0]) * (kr - k0);
  return { vTab, dy, vRim };
}

/** Nivel del agua [m] (cota) en un nodo con volumen V. */
export function nodeHead(n: SNode, V: number): number {
  if (V <= 0) return n.inv;
  const t = n.vTab;
  if (V >= n.vRim) return n.rim + (V - n.vRim) / n.area0;
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (t[m] <= V) lo = m;
    else hi = m;
  }
  const f = (V - t[lo]) / Math.max(1e-12, t[hi] - t[lo]);
  return n.inv + (lo + f) * n.dy;
}

export interface SewerStepEnv {
  h: Float64Array;
  z: Float64Array;
  area: number;
  dx: number;
}

/** Acumulados por sistema [m³]. */
export interface SewerTotals {
  /** Captado desde la calle (sumideros) o recibido del sector (acometidas erradas, depósitos). */
  fromSector: [number, number];
  /** Aportes externos: aguas residuales domésticas, de aguas arriba y lluvia de conexiones erradas de arriba. */
  external: [number, number];
  /** Devuelto a la calle (rebose de cámaras y cajas). */
  overflow: [number, number];
  /** Entregado a la quebrada por la descarga (vuelve a la superficie). */
  toCreek: [number, number];
  /** Tomado de la quebrada por la descarga ahogada (remanso hacia la red). */
  fromCreek: [number, number];
  /** Salido por la descarga libre (sigue fuera del sector). */
  out: [number, number];
}

export class SewerModel {
  readonly s: CompiledSewer;
  V: Float64Array;
  Q: Float64Array;
  /** Último paso: captado por sumidero, rebose por nodo, caudal medio por tubería [m³/s]. */
  lastCapture: Float64Array;
  lastOverflow: Float64Array;
  /** Máximos: relación lámina/diámetro por tubería (>1 = en carga) y rebose acumulado por nodo. */
  peakFill: Float64Array;
  overflowTotal: Float64Array;
  captureTotal: Float64Array;
  peakHead: Float64Array;
  tot!: SewerTotals;
  /** Sub-pasos usados en el último paso (diagnóstico). */
  lastSub = 0;
  private outQ: Float64Array;
  private scale: Float64Array;
  private head: Float64Array;
  private qSum: Float64Array;

  constructor(s: CompiledSewer) {
    this.s = s;
    this.V = new Float64Array(s.nodes.length);
    this.Q = new Float64Array(s.pipes.length);
    this.lastCapture = new Float64Array(s.inlets.length);
    this.lastOverflow = new Float64Array(s.nodes.length);
    this.peakFill = new Float64Array(s.pipes.length);
    this.overflowTotal = new Float64Array(s.nodes.length);
    this.captureTotal = new Float64Array(s.inlets.length);
    this.peakHead = new Float64Array(s.nodes.length);
    this.outQ = new Float64Array(s.nodes.length);
    this.scale = new Float64Array(s.nodes.length);
    this.head = new Float64Array(s.nodes.length);
    this.qSum = new Float64Array(s.pipes.length);
    this.reset();
  }

  reset(): void {
    this.V.fill(0);
    this.Q.fill(0);
    this.lastCapture.fill(0);
    this.lastOverflow.fill(0);
    this.peakFill.fill(0);
    this.overflowTotal.fill(0);
    this.captureTotal.fill(0);
    this.s.nodes.forEach((n, k) => (this.peakHead[k] = n.inv));
    this.tot = { fromSector: [0, 0], external: [0, 0], overflow: [0, 0], toCreek: [0, 0], fromCreek: [0, 0], out: [0, 0] };
  }

  /** Volumen guardado en la red [m³] (total o de un sistema). */
  storage(system?: SystemIdx): number {
    let v = 0;
    this.s.nodes.forEach((n, k) => {
      if (system === undefined || n.system === system) v += this.V[k];
    });
    return v;
  }

  /** Nivel del agua en un nodo (cota) [m]. Para la descarga a la quebrada, el de la quebrada. */
  headAt(k: number, env?: SewerStepEnv): number {
    const n = this.s.nodes[k];
    if (n.outfall === 1) return n.inv;
    if (n.outfall === 2) return env ? Math.max(n.inv, env.z[n.cell] + env.h[n.cell]) : n.inv;
    return nodeHead(n, this.V[k]);
  }

  /** Lámina relativa y/D en una tubería según los niveles en sus extremos (>1: en carga). */
  fillOf(p: number, env?: SewerStepEnv): number {
    const pp = this.s.pipes[p];
    const ha = this.headAt(pp.a, env), hb = this.headAt(pp.b, env);
    const y = Math.max(ha - pp.zUp, hb - pp.zDn, 0);
    return y / pp.D;
  }

  /** Caudal medio del último paso en una tubería [m³/s] (positivo hacia aguas abajo). */
  flowOf(p: number): number {
    return this.qSum[p];
  }

  /**
   * Un paso de acoplamiento con la superficie.
   * @param extraIn volumen que entra a cada nodo en este paso desde el sector [m³] (acometidas erradas, depósitos)
   * @param extIn volumen externo a cada nodo en este paso [m³] (aguas residuales, aguas arriba)
   */
  step(dt: number, env: SewerStepEnv, extraIn: Float64Array, extIn: Float64Array): void {
    const s = this.s, V = this.V, Q = this.Q, T = this.tot;
    const { h, area } = env;
    // 1) Captación de los sumideros: solo si su caja no está llena (si no, el agua no puede entrar)
    for (let d = 0; d < s.inlets.length; d++) {
      const it = s.inlets[d];
      this.lastCapture[d] = 0;
      if (!it) continue;
      const nd = s.nodes[it.node];
      if (V[it.node] >= nd.vRim - 1e-9) continue;
      const hc = h[it.cell];
      if (hc <= 0) continue;
      let vol = inletCapture(it, curbDepth(hc, it.gutterSlope, env.dx)) * dt;
      const avail = hc * area;
      if (vol > avail) vol = avail;
      if (vol <= 0) continue;
      h[it.cell] = hc - vol / area;
      if (h[it.cell] < 0) h[it.cell] = 0;
      V[it.node] += vol;
      this.lastCapture[d] = vol;
      this.captureTotal[d] += vol;
      T.fromSector[nd.system] += vol;
    }
    // 2) Aportes del sector y externos
    for (let k = 0; k < V.length; k++) {
      const sys = s.nodes[k].system;
      if (extraIn[k] > 0) {
        V[k] += extraIn[k];
        T.fromSector[sys] += extraIn[k];
      }
      if (extIn[k] > 0) {
        V[k] += extIn[k];
        T.external[sys] += extIn[k];
      }
    }
    // 3) Sub-pasos de la red (estabilidad: onda en la tubería y oscilación nodo–tubería)
    const head = this.head;
    for (let k = 0; k < V.length; k++) head[k] = this.headAt(k, env);
    let dtS = dt;
    for (let p = 0; p < s.pipes.length; p++) {
      const pp = s.pipes[p];
      const y = Math.min(pp.D, Math.max(head[pp.a] - pp.zUp, head[pp.b] - pp.zDn, 0.02 * pp.D));
      const g = circ(pp.D, y);
      const hyd = g.T > 1e-6 ? g.A / g.T : pp.D;
      const c = Math.sqrt(G * hyd) + Math.abs(Q[p]) / Math.max(g.A, 1e-6);
      dtS = Math.min(dtS, (0.7 * pp.L) / c);
    }
    for (let k = 0; k < V.length; k++) {
      const n = s.nodes[k];
      if (n.outfall) continue;
      let gsum = 0;
      for (let p = 0; p < s.pipes.length; p++) {
        const pp = s.pipes[p];
        if (pp.a === k || pp.b === k) gsum += (G * (Math.PI * pp.D * pp.D) / 4) / pp.L;
      }
      if (gsum > 0) dtS = Math.min(dtS, Math.sqrt((0.5 * n.area0) / gsum));
    }
    const nSub = Math.min(400, Math.max(1, Math.ceil(dt / dtS - 1e-9)));
    const ds = dt / nSub;
    this.lastSub = nSub;
    this.qSum.fill(0);
    this.lastOverflow.fill(0);
    for (let it = 0; it < nSub; it++) {
      if (it > 0) for (let k = 0; k < V.length; k++) head[k] = this.headAt(k, env);
      // 3a) Caudales
      for (let p = 0; p < s.pipes.length; p++) {
        const pp = s.pipes[p];
        const ha = head[pp.a], hb = head[pp.b];
        const yf = Math.max(ha, hb) - Math.max(pp.zUp, pp.zDn);
        if (yf <= 1e-5) {
          Q[p] = 0;
          continue;
        }
        const g = circ(pp.D, Math.min(yf, pp.D));
        const S = (Math.max(ha, pp.zUp) - Math.max(hb, pp.zDn)) / pp.L;
        const q0 = Q[p];
        Q[p] = (q0 + G * g.A * ds * S) / (1 + (G * ds * pp.n * pp.n * Math.abs(q0)) / (g.A * Math.pow(g.R, 4 / 3)));
      }
      // 3b) Limitador: ningún nodo entrega más agua de la que tiene (la descarga a la quebrada, la de la celda)
      const outQ = this.outQ, sc = this.scale;
      outQ.fill(0);
      for (let p = 0; p < s.pipes.length; p++) {
        const pp = s.pipes[p];
        if (Q[p] > 0) outQ[pp.a] += Q[p];
        else if (Q[p] < 0) outQ[pp.b] -= Q[p];
      }
      for (let k = 0; k < V.length; k++) {
        const n = s.nodes[k];
        const have = n.outfall === 1 ? 0 : n.outfall === 2 ? h[n.cell] * area : V[k];
        sc[k] = outQ[k] * ds > have ? (outQ[k] > 0 ? have / (outQ[k] * ds) : 0) : 1;
      }
      for (let p = 0; p < s.pipes.length; p++) {
        const pp = s.pipes[p];
        if (Q[p] > 0) Q[p] *= sc[pp.a];
        else if (Q[p] < 0) Q[p] *= sc[pp.b];
        this.qSum[p] += Q[p] / nSub;
      }
      // 3c) Continuidad en los nodos
      for (let p = 0; p < s.pipes.length; p++) {
        const pp = s.pipes[p];
        const vol = Q[p] * ds;
        if (vol === 0) continue;
        const na = s.nodes[pp.a], nb = s.nodes[pp.b];
        // sale de a (o entra si vol < 0)
        if (na.outfall === 2) {
          h[na.cell] -= vol / area;
          if (vol > 0) T.fromCreek[na.system] += vol;
          else T.toCreek[na.system] -= vol;
        } else if (na.outfall === 1) {
          if (vol < 0) T.out[na.system] -= vol;
        } else V[pp.a] -= vol;
        // entra a b
        if (nb.outfall === 2) {
          h[nb.cell] += vol / area;
          if (vol > 0) T.toCreek[nb.system] += vol;
          else T.fromCreek[nb.system] -= vol;
        } else if (nb.outfall === 1) {
          if (vol > 0) T.out[nb.system] += vol;
        } else V[pp.b] += vol;
      }
      // 3d) Rebose: el agua por encima de la tapa sale a la calle
      for (let k = 0; k < V.length; k++) {
        const n = s.nodes[k];
        if (n.outfall) continue;
        if (V[k] < 0) V[k] = 0; // solo redondeo: el limitador lo impide
        if (V[k] > n.vRim) {
          const ex = V[k] - n.vRim;
          V[k] = n.vRim;
          h[n.cell] += ex / area;
          this.lastOverflow[k] += ex;
          this.overflowTotal[k] += ex;
          T.overflow[n.system] += ex;
        }
      }
    }
    for (let k = 0; k < V.length; k++) {
      const hk = this.headAt(k, env);
      if (hk > this.peakHead[k]) this.peakHead[k] = hk;
    }
    for (let p = 0; p < s.pipes.length; p++) {
      const f = this.fillOf(p, env);
      if (f > this.peakFill[p]) this.peakFill[p] = f;
    }
  }
}

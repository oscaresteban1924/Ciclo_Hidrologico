// Redes de distribución a presión: Hazen-Williams en cada tubo, un tanque de nivel fijo y nudos con demanda. Se
// resuelve con el método del gradiente (Todini y Pilati, 1988) y, para comparar, con Hardy Cross (1936) sobre las
// mallas fundamentales de un árbol de expansión. Funciones puras, sin interfaz.

import { hazenWilliams } from './pipes';

export const HW_N = 1.852;

export interface NetNode {
  id: string;
  /** Cota del terreno en el nudo (m). */
  z: number;
  /** Demanda base (L/s). */
  q: number;
  /** Planta (m), solo para dibujar. */
  x: number;
  y: number;
}

export interface NetPipe {
  id: string;
  a: string;
  b: string;
  /** Largo (m), diámetro interno (m) y coeficiente de Hazen-Williams. */
  L: number;
  D: number;
  C: number;
  /** Cerrado por una válvula. */
  closed?: boolean;
}

export interface Network {
  /** Nudo del tanque y cota de su agua (m). */
  source: string;
  H0: number;
  nodes: NetNode[];
  pipes: NetPipe[];
}

export interface NetSolution {
  /** Caudal de cada tubo (L/s, positivo de a hacia b; 0 si está cerrado). */
  Q: Record<string, number>;
  /** Cota piezométrica (m) y presión (m) de cada nudo; NaN si quedó sin conexión con el tanque. */
  H: Record<string, number>;
  p: Record<string, number>;
  /** Pérdida (m), velocidad (m/s) de cada tubo. */
  h: Record<string, number>;
  V: Record<string, number>;
  /** Nudos sin conexión con el tanque. */
  cut: string[];
  iterations: number;
  /** Mayor desbalance de caudal en un nudo (L/s) y de energía en un tubo (m). */
  massErr: number;
  energyErr: number;
}

/** Resistencia de Hazen-Williams: h = r·|Q|^0,852·Q con Q en m³/s. */
export const hwR = (p: NetPipe) => hazenWilliams(1, p.D, p.L, p.C);

/** Nudos conectados con el tanque por tubos abiertos. */
function reachable(net: Network): Set<string> {
  const seen = new Set<string>([net.source]);
  const stack = [net.source];
  while (stack.length) {
    const n = stack.pop() as string;
    for (const p of net.pipes) {
      if (p.closed) continue;
      const o = p.a === n ? p.b : p.b === n ? p.a : null;
      if (o && !seen.has(o)) {
        seen.add(o);
        stack.push(o);
      }
    }
  }
  return seen;
}

/** Resuelve A·x = b (eliminación de Gauss con pivoteo parcial). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-30;
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / d;
      if (k) for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j];
    x[r] = s / (M[r][r] || 1e-30);
  }
  return x;
}

function finish(net: Network, Qm3: Record<string, number>, H: Record<string, number>, cut: string[], iterations: number, factor: number): NetSolution {
  const Q: Record<string, number> = {}, h: Record<string, number> = {}, V: Record<string, number> = {}, p: Record<string, number> = {};
  for (const pp of net.pipes) {
    const q = pp.closed ? 0 : Qm3[pp.id] ?? 0;
    Q[pp.id] = q * 1000;
    h[pp.id] = pp.closed ? 0 : hwR(pp) * Math.pow(Math.abs(q), HW_N - 1) * q;
    V[pp.id] = Math.abs(q) / ((Math.PI * pp.D * pp.D) / 4);
  }
  for (const n of net.nodes) p[n.id] = H[n.id] - n.z;
  let massErr = 0, energyErr = 0;
  for (const n of net.nodes) {
    if (n.id === net.source || cut.includes(n.id)) continue;
    let s = -n.q * factor;
    for (const pp of net.pipes) {
      if (pp.b === n.id) s += Q[pp.id];
      if (pp.a === n.id) s -= Q[pp.id];
    }
    massErr = Math.max(massErr, Math.abs(s));
  }
  for (const pp of net.pipes) {
    if (pp.closed || cut.includes(pp.a) || cut.includes(pp.b)) continue;
    energyErr = Math.max(energyErr, Math.abs(H[pp.a] - H[pp.b] - h[pp.id]));
  }
  return { Q, H, p, h, V, cut, iterations, massErr, energyErr };
}

/**
 * Método del gradiente (Todini y Pilati, 1988): Newton sobre caudales y cotas a la vez. Con demandas factor·q (L/s).
 * Los nudos sin conexión con el tanque quedan sin servicio (NaN).
 */
export function solveGradient(net: Network, factor = 1, tol = 1e-10): NetSolution {
  const ok = reachable(net);
  const cut = net.nodes.filter((n) => !ok.has(n.id)).map((n) => n.id);
  const pipes = net.pipes.filter((p) => !p.closed && ok.has(p.a) && ok.has(p.b));
  const free = net.nodes.filter((n) => n.id !== net.source && ok.has(n.id));
  const idx = new Map(free.map((n, i) => [n.id, i]));
  const q = free.map((n) => (n.q * factor) / 1000);
  const r = pipes.map(hwR);
  let Q = pipes.map((p) => 0.25 * Math.PI * p.D * p.D * 0.5);
  let Hf = free.map(() => net.H0);
  let it = 0;
  for (; it < 100; it++) {
    const dd = pipes.map((_, i) => HW_N * r[i] * Math.pow(Math.max(Math.abs(Q[i]), 1e-9), HW_N - 1));
    const a11 = pipes.map((_, i) => r[i] * Math.pow(Math.max(Math.abs(Q[i]), 1e-9), HW_N - 1));
    // residuo de energía sin las cotas libres: A11·Q + A10·H0 (columna del tanque)
    const e0 = pipes.map((p, i) => a11[i] * Q[i] + (p.a === net.source ? -net.H0 : 0) + (p.b === net.source ? net.H0 : 0));
    const n = free.length;
    const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const rhs = new Array<number>(n).fill(0);
    // A21·Q − q (continuidad actual)
    pipes.forEach((p, i) => {
      const ia = idx.get(p.a), ib = idx.get(p.b);
      if (ia !== undefined) rhs[ia] += -Q[i];
      if (ib !== undefined) rhs[ib] += Q[i];
    });
    for (let j = 0; j < n; j++) rhs[j] -= q[j];
    // − A21·D⁻¹·e0 y la matriz A21·D⁻¹·A12
    pipes.forEach((p, i) => {
      const ia = idx.get(p.a), ib = idx.get(p.b);
      const w = 1 / dd[i];
      if (ia !== undefined) rhs[ia] -= -w * e0[i];
      if (ib !== undefined) rhs[ib] -= w * e0[i];
      // A12: −1 en a, +1 en b
      const s: [number | undefined, number][] = [
        [ia, -1],
        [ib, 1],
      ];
      for (const [r1, s1] of s) for (const [c1, s2] of s) if (r1 !== undefined && c1 !== undefined) A[r1][c1] += w * s1 * s2;
    });
    const Hn = solve(A, rhs);
    const Qn = pipes.map((p, i) => {
      const Ha = p.a === net.source ? net.H0 : Hn[idx.get(p.a) as number];
      const Hb = p.b === net.source ? net.H0 : Hn[idx.get(p.b) as number];
      // A11·Q + A12·H + A10·H0 = a11·Q − Ha + Hb
      return Q[i] - (a11[i] * Q[i] - Ha + Hb) / dd[i];
    });
    const dQ = Math.max(0, ...Qn.map((x, i) => Math.abs(x - Q[i])));
    Q = Qn;
    Hf = Hn;
    if (dQ < tol) {
      it++;
      break;
    }
  }
  const Qm: Record<string, number> = {}, H: Record<string, number> = { [net.source]: net.H0 };
  pipes.forEach((p, i) => (Qm[p.id] = Q[i]));
  free.forEach((n, i) => (H[n.id] = Hf[i]));
  for (const c of cut) H[c] = NaN;
  return finish(net, Qm, H, cut, it, factor);
}

export interface HardyCrossResult extends NetSolution {
  /** Mayor corrección |ΔQ| de cada iteración (L/s). */
  history: number[];
  loops: { pipe: string; dir: 1 | -1 }[][];
}

/**
 * Hardy Cross (1936): caudales iniciales que cumplen la continuidad (árbol de expansión desde el tanque, cuerdas en 0),
 * y correcciones ΔQ = −Σh/(n·Σ|h/Q|) en cada malla fundamental hasta que la mayor corrección baja de la tolerancia.
 */
export function hardyCross(net: Network, factor = 1, tol = 1e-7, maxIt = 400): HardyCrossResult {
  const ok = reachable(net);
  const cut = net.nodes.filter((n) => !ok.has(n.id)).map((n) => n.id);
  const pipes = net.pipes.filter((p) => !p.closed && ok.has(p.a) && ok.has(p.b));
  // árbol de expansión por anchura desde el tanque
  const parent = new Map<string, { pipe: NetPipe; from: string }>();
  const order: string[] = [net.source];
  const seen = new Set([net.source]);
  for (let k = 0; k < order.length; k++) {
    const n = order[k];
    for (const p of pipes) {
      const o = p.a === n ? p.b : p.b === n ? p.a : null;
      if (o && !seen.has(o)) {
        seen.add(o);
        parent.set(o, { pipe: p, from: n });
        order.push(o);
      }
    }
  }
  const tree = new Set([...parent.values()].map((v) => v.pipe.id));
  const Q: Record<string, number> = {};
  for (const p of pipes) Q[p.id] = 0;
  // caudales del árbol: cada nudo pasa a su padre su demanda más la de sus hijos
  const load = new Map<string, number>();
  for (const n of net.nodes) load.set(n.id, ok.has(n.id) && n.id !== net.source ? (n.q * factor) / 1000 : 0);
  for (let k = order.length - 1; k > 0; k--) {
    const n = order[k];
    const pr = parent.get(n) as { pipe: NetPipe; from: string };
    const L = load.get(n) as number;
    // el agua va del padre al hijo
    Q[pr.pipe.id] = pr.pipe.b === n ? L : -L;
    load.set(pr.from, (load.get(pr.from) as number) + L);
  }
  // mallas fundamentales: cada cuerda con los caminos del árbol hasta su ancestro común
  const pathUp = (n: string) => {
    const out: string[] = [n];
    while (parent.has(out[out.length - 1])) out.push((parent.get(out[out.length - 1]) as { from: string }).from);
    return out;
  };
  const loops: { pipe: string; dir: 1 | -1 }[][] = [];
  for (const c of pipes) {
    if (tree.has(c.id)) continue;
    const pa = pathUp(c.a), pb = pathUp(c.b);
    const lca = pa.find((x) => pb.includes(x)) as string;
    const loop: { pipe: string; dir: 1 | -1 }[] = [{ pipe: c.id, dir: 1 }];
    // recorrido: a → b por la cuerda, luego de b subiendo hasta el ancestro y bajando hasta a
    for (const n of pb.slice(0, pb.indexOf(lca))) {
      const pr = parent.get(n) as { pipe: NetPipe; from: string };
      loop.push({ pipe: pr.pipe.id, dir: pr.pipe.a === n ? 1 : -1 });
    }
    for (const n of pa.slice(0, pa.indexOf(lca)).reverse()) {
      const pr = parent.get(n) as { pipe: NetPipe; from: string };
      loop.push({ pipe: pr.pipe.id, dir: pr.pipe.b === n ? 1 : -1 });
    }
    loops.push(loop);
  }
  const R = new Map(pipes.map((p) => [p.id, hwR(p)]));
  const history: number[] = [];
  let it = 0;
  for (; it < maxIt && loops.length; it++) {
    let worst = 0;
    for (const loop of loops) {
      let sh = 0, sd = 0;
      for (const { pipe, dir } of loop) {
        const q = Q[pipe] * dir, r = R.get(pipe) as number;
        sh += r * Math.pow(Math.abs(q), HW_N - 1) * q;
        sd += HW_N * r * Math.pow(Math.max(Math.abs(q), 1e-9), HW_N - 1);
      }
      const dq = -sh / sd;
      for (const { pipe, dir } of loop) Q[pipe] += dir * dq;
      worst = Math.max(worst, Math.abs(dq));
    }
    history.push(worst * 1000);
    if (worst < tol) {
      it++;
      break;
    }
  }
  // cotas: desde el tanque por el árbol
  const H: Record<string, number> = { [net.source]: net.H0 };
  for (const n of order.slice(1)) {
    const pr = parent.get(n) as { pipe: NetPipe; from: string };
    const q = Q[pr.pipe.id], r = R.get(pr.pipe.id) as number;
    const hl = r * Math.pow(Math.abs(q), HW_N - 1) * q;
    H[n] = pr.pipe.a === pr.from ? H[pr.from] - hl : H[pr.from] + hl;
  }
  for (const c of cut) H[c] = NaN;
  return { ...finish(net, Q, H, cut, it, factor), history, loops };
}

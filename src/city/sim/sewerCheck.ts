// Comprobación de la red de un escenario frente a criterios de la norma de diseño de EPM (GD-AS002) y
// caudales de diseño por el método racional (EPM 6.3: Q = C·i·A, con C = 0,85·I + 0,15).
// Se usa en las pruebas, en la documentación y en la pestaña Docente. No reemplaza un diseño de ingeniería.

import { COVER_LIST } from './constants';
import type { Compiled } from './compile';
import type { Scenario } from './scenario';
import { circ, normalDepth, type CompiledSewer } from './sewer';

/** Coeficiente de impermeabilidad I por cobertura (EPM, tabla 6-3, aproximado por tipo de superficie). */
const IMPERV: Record<string, number> = { asfalto: 0.9, concreto: 0.9, techo: 0.9, anden: 0.9, cancha: 0.9, adoquin_permeable: 0.6, grama: 0.3, zona_verde: 0.3, jardin_lluvia: 0.3, cauce: 0.3, tierra: 0.5 };

export interface EpmCheck {
  id: string;
  criterio: string;
  referencia: string;
  medido: string;
  cumple: boolean;
}

export interface PipeDesignRow {
  id: string;
  system: 'lluvias' | 'residuales';
  D: number;
  material: string;
  L: number;
  slope: number;
  qDesign: number;
  qFull: number;
  yD: number | null;
  vDesign: number;
  vFull: number;
  coverUp: number;
  coverDn: number;
}

/**
 * Área tributaria de cada sumidero con dirección de flujo D8 sobre la malla (la lluvia del techo baja por
 * su bajante). Aproximado: sirve para el caudal de diseño, no para el cálculo de la simulación.
 */
export function inletCatchments(sc: Scenario, c: Compiled): { area: number[]; cArea: number[] } {
  const { nx, ny, z, solid, area } = c;
  const N = nx * ny;
  const target = new Int32Array(N).fill(-2); // −2 sin resolver, −1 no llega a un sumidero
  const drainAt = new Map<number, number>();
  c.drains.forEach((d, i) => drainAt.set(d.cell, i));
  const next = (k: number): number => {
    const i = k % nx, j = (k - i) / nx;
    let best = -1, bs = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const q = jj * nx + ii;
      if (solid[q]) continue;
      const s = (z[k] - z[q]) / Math.hypot(di, dj);
      if (s > bs) {
        bs = s;
        best = q;
      }
    }
    return best;
  };
  const resolve = (k0: number): number => {
    const path: number[] = [];
    let k = k0;
    for (let guard = 0; guard < N; guard++) {
      if (target[k] !== -2) break;
      if (drainAt.has(k)) {
        target[k] = drainAt.get(k)!;
        break;
      }
      path.push(k);
      const q = next(k);
      if (q < 0) {
        target[k] = -1;
        path.pop();
        break;
      }
      k = q;
    }
    const t = target[k];
    for (const p of path) target[p] = t;
    return t;
  };
  const areaOut = new Array(c.drains.length).fill(0);
  const cArea = new Array(c.drains.length).fill(0);
  for (let k = 0; k < N; k++) {
    if (solid[k]) continue;
    const t = resolve(k);
    if (t < 0) continue;
    const I = IMPERV[COVER_LIST[c.cover[k]]] ?? 0.9;
    areaOut[t] += area;
    cArea[t] += area * (0.85 * I + 0.15);
  }
  for (const b of c.buildings) {
    if (b.tank >= 0) continue;
    const t = resolve(b.downCell);
    if (t < 0) continue;
    areaOut[t] += b.roofArea;
    cArea[t] += b.roofArea * (0.85 * 0.9 + 0.15);
  }
  void sc;
  return { area: areaOut, cArea };
}

/** Caudal de diseño de cada tramo [m³/s]: lluvias por el método racional; residuales, aportes domésticos. */
export function designFlows(sc: Scenario, c: Compiled): Float64Array {
  const s = c.sewer!;
  const i = (sc.sewer!.designIntensityMmH / 1000) / 3600;
  const { cArea } = inletCatchments(sc, c);
  const nodeIn = new Float64Array(s.nodes.length);
  s.inlets.forEach((it, d) => {
    if (it) nodeIn[it.node] += cArea[d] * i;
  });
  for (const u of sc.sewer!.upstreamRunoff ?? []) {
    const k = s.nodes.findIndex((n) => n.id === u.node);
    if (k >= 0) nodeIn[k] += u.coef * u.areaM2 * i;
  }
  // residuales: aporte doméstico con un mínimo de 1,5 L/s por tramo (EPM 5.2.7)
  for (let k = 0; k < s.nodes.length; k++) if (s.nodes[k].system === 1) nodeIn[k] += s.dryIn[k];
  const q = new Float64Array(s.pipes.length);
  // acumular aguas abajo (árbol)
  const order = topo(s);
  const acc = Float64Array.from(nodeIn);
  for (const k of order) {
    const p = s.pipes.findIndex((pp) => pp.a === k);
    if (p < 0) continue;
    q[p] = acc[k];
    acc[s.pipes[p].b] += acc[k];
  }
  for (let p = 0; p < q.length; p++) if (s.pipes[p].system === 1) q[p] = Math.max(q[p], 0.0015);
  return q;
}

function topo(s: CompiledSewer): number[] {
  const indeg = new Array(s.nodes.length).fill(0);
  for (const p of s.pipes) indeg[p.b]++;
  const out: number[] = [];
  const st = indeg.map((d, k) => (d === 0 ? k : -1)).filter((k) => k >= 0);
  while (st.length) {
    const k = st.pop()!;
    out.push(k);
    for (const p of s.pipes) if (p.a === k && --indeg[p.b] === 0) st.push(p.b);
  }
  return out;
}

export function designTable(sc: Scenario, c: Compiled): PipeDesignRow[] {
  const s = c.sewer!;
  const qd = designFlows(sc, c);
  return s.pipes.map((p, k) => {
    const S = (p.zUp - p.zDn) / p.L;
    const y = normalDepth(p.D, p.n, Math.max(S, 1e-6), qd[k]);
    const g = y !== null ? circ(p.D, y) : circ(p.D, p.D);
    const na = s.nodes[p.a], nb = s.nodes[p.b];
    return {
      id: p.id,
      system: p.system === 0 ? 'lluvias' : 'residuales',
      D: p.D,
      material: p.material,
      L: p.L,
      slope: S,
      qDesign: qd[k],
      qFull: p.qFull,
      yD: y !== null ? y / p.D : null,
      vDesign: g.A > 0 ? qd[k] / g.A : 0,
      vFull: p.qFull / ((Math.PI * p.D * p.D) / 4),
      coverUp: na.rim - (p.zUp + p.D),
      coverDn: nb.outfall ? Infinity : nb.rim - (p.zDn + p.D),
    };
  });
}

/** Distancia mínima entre dos segmentos en planta y punto de cruce (si se cruzan). */
function segCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): { t: number; u: number } | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

export function epmChecks(sc: Scenario, c: Compiled): EpmCheck[] {
  const s = c.sewer!;
  const sp = sc.sewer!;
  const rows = designTable(sc, c);
  const out: EpmCheck[] = [];
  const fmt = (x: number, d = 2) => x.toFixed(d).replace('.', ',');
  const mains = rows.filter((r) => s.pipes.find((p) => p.id === r.id)!.role === 'colector');
  const conds = rows.filter((r) => s.pipes.find((p) => p.id === r.id)!.role === 'conexion-sumidero');
  // separación de sistemas
  out.push({ id: 'separado', criterio: 'Sistema separado: ningún tramo une aguas lluvias con aguas residuales', referencia: 'GD-AS002, 2.3.1', medido: `${s.pipes.length} tramos, todos dentro de su sistema`, cumple: s.pipes.every((p) => s.nodes[p.a].system === p.system && s.nodes[p.b].system === p.system) });
  // diámetros
  const dL = Math.min(...rows.filter((r) => r.system === 'lluvias' && s.pipes.find((p) => p.id === r.id)!.role === 'colector').map((r) => r.D));
  const dR = Math.min(...rows.filter((r) => r.system === 'residuales').map((r) => r.D));
  const dC = conds.length ? Math.min(...conds.map((r) => r.D)) : Infinity;
  out.push({ id: 'diam-lluvias', criterio: 'Diámetro interno mínimo de aguas lluvias ≥ 215 mm', referencia: 'GD-AS002, 6.2.7', medido: `${Math.round(dL * 1000)} mm`, cumple: dL >= 0.215 });
  out.push({ id: 'diam-residuales', criterio: 'Diámetro interno mínimo de aguas residuales ≥ 170 mm', referencia: 'GD-AS002, 5.2.8', medido: `${Math.round(dR * 1000)} mm`, cumple: dR >= 0.17 });
  out.push({ id: 'diam-sumidero', criterio: 'Conductos de sumidero: diámetro ≥ 250 mm, pendiente ≥ 2 %, longitud ≤ 15 m', referencia: 'GD-AS002, 8.5.3', medido: conds.length ? `${Math.round(dC * 1000)} mm; pendiente mín. ${fmt(Math.min(...conds.map((r) => r.slope)) * 100, 1)} %; longitud máx. ${fmt(Math.max(...conds.map((r) => r.L)), 1)} m` : 'sin conductos', cumple: conds.every((r) => r.D >= 0.25 - 1e-9 && r.slope >= 0.02 - 1e-6 && r.L <= 15 + 1e-6) });
  // recubrimiento
  const covers = rows.flatMap((r) => [r.coverUp, r.coverDn]).filter(Number.isFinite);
  const minCover = Math.min(...covers);
  out.push({ id: 'recubrimiento', criterio: 'Profundidad mínima a la cota clave ≥ 1,2 m en cámaras y cajas', referencia: 'GD-AS002, 5.2.15 y 6.2.14', medido: `mínima ${fmt(minCover)} m`, cumple: minCover >= 1.2 - 0.005 });
  // velocidad máxima
  const vmax = Math.max(...rows.map((r) => r.vFull));
  out.push({ id: 'vmax', criterio: 'Velocidad a tubo lleno ≤ 5 m/s en concreto y ≤ 10 m/s en PVC (sin análisis detallado: ≤ 4 m/s)', referencia: 'GD-AS002, 5.2.10 y 6.2.9', medido: `máxima ${fmt(vmax)} m/s`, cumple: rows.every((r) => r.vFull <= (r.material === 'PVC' ? 10 : 5) + 1e-6) });
  // lámina máxima y velocidad mínima en lluvias con el caudal de diseño
  const yd = mains.filter((r) => r.system === 'lluvias');
  const worst = Math.max(...yd.map((r) => (r.yD === null ? 9 : r.yD)));
  out.push({ id: 'ylluvias', criterio: `Lámina con el caudal de diseño ≤ 85 % del diámetro (lluvia de diseño supuesta de ${sp.designIntensityMmH} mm/h)`, referencia: 'GD-AS002, 6.2.13', medido: `máxima ${worst > 1 ? 'no cabe' : `${fmt(worst * 100, 0)} %`}`, cumple: worst <= 0.85 });
  const vminL = Math.min(...yd.map((r) => r.vDesign));
  out.push({ id: 'vmin-lluvias', criterio: 'Velocidad con el caudal de diseño ≥ 0,75 m/s en aguas lluvias', referencia: 'GD-AS002, 6.2.8', medido: `mínima ${fmt(vminL)} m/s`, cumple: vminL >= 0.75 });
  const rs = rows.filter((r) => r.system === 'residuales');
  const yr = Math.max(...rs.map((r) => (r.yD === null ? 9 : r.yD)));
  out.push({ id: 'yresiduales', criterio: 'Aguas residuales: lámina ≤ 70 % del diámetro (menos de 500 mm)', referencia: 'GD-AS002, 5.2.14 (tabla 5-2)', medido: `máxima ${fmt(yr * 100, 0)} %`, cumple: yr <= 0.7 });
  // cámaras
  const camaras = s.nodes.map((n, k) => ({ n, k })).filter(({ n }) => n.kind === 'camara' || n.kind === 'caida');
  const maxSpacing = (sys: 0 | 1) => Math.max(0, ...s.pipes.filter((p) => p.system === sys && p.role === 'colector').map((p) => p.L));
  out.push({ id: 'distancia', criterio: 'Distancia entre cámaras ≤ 80 m con sumideros (lluvias) y ≤ 120 m sin sumideros (residuales)', referencia: 'GD-AS002, 8.3.5', medido: `lluvias ${fmt(maxSpacing(0), 1)} m; residuales ${fmt(maxSpacing(1), 1)} m`, cumple: maxSpacing(0) <= 80 && maxSpacing(1) <= 120 });
  const deg = (k: number) => s.pipes.filter((p) => p.a === k || p.b === k).length;
  out.push({ id: 'uniones', criterio: 'Cámara en cada arranque, unión o cambio de dirección; máximo 4 tuberías por cámara', referencia: 'GD-AS002, 8.3.1 y 8.3.2', medido: `${camaras.length} cámaras; máximo ${Math.max(...camaras.map(({ k }) => deg(k)))} tuberías en una`, cumple: camaras.every(({ k }) => deg(k) <= 4) && s.nodes.every((n, k) => n.kind !== 'caja-sumidero' || s.pipes.some((p) => p.a === k && (s.nodes[p.b].kind === 'camara' || s.nodes[p.b].kind === 'caida'))) });
  // deflexión entre la tubería dominante de entrada y la de salida < 90°
  let maxDef = 0;
  for (const { k } of camaras) {
    const outP = s.pipes.find((p) => p.a === k);
    if (!outP) continue;
    const ins = s.pipes.filter((p) => p.b === k && p.role === 'colector');
    if (!ins.length) continue;
    const qd = designFlows(sc, c);
    const dom = ins.reduce((a, b) => (qd[s.pipes.indexOf(a)] >= qd[s.pipes.indexOf(b)] ? a : b));
    const v1 = [s.nodes[k].x - s.nodes[dom.a].x, s.nodes[k].y - s.nodes[dom.a].y];
    const v2 = [s.nodes[outP.b].x - s.nodes[k].x, s.nodes[outP.b].y - s.nodes[k].y];
    const ang = (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]))))) * 180) / Math.PI;
    maxDef = Math.max(maxDef, ang);
  }
  out.push({ id: 'deflexion', criterio: 'Deflexión entre la tubería de entrada dominante y la de salida < 90°', referencia: 'GD-AS002, 8.3.2', medido: `máxima ${fmt(maxDef, 0)}°`, cumple: maxDef < 90 });
  // caídas
  let badDrop = 0, drops = 0;
  s.nodes.forEach((n, k) => {
    const ins = s.pipes.filter((p) => p.b === k);
    if (!ins.length || n.outfall) return;
    const drop = Math.max(...ins.map((p) => p.zDn - n.inv));
    if (drop > 0.7) {
      drops++;
      if (n.kind !== 'caida') badDrop++;
    }
  });
  out.push({ id: 'caidas', criterio: 'Cámara de caída donde la batea de entrada supera en más de 0,7 m a la de salida', referencia: 'GD-AS002, 8.4.1', medido: `${drops} caídas mayores de 0,7 m; ${drops - badDrop} con cámara de caída`, cumple: badDrop === 0 });
  // ubicación en la vía: lluvias al norte y al oriente, residuales al sur y al occidente. Se juzga cada
  // colector que corre a lo largo de una calle (en las intersecciones, por la calle que sigue el tramo)
  const side = sp.streets ?? [];
  let wrong = 0, checked = 0;
  for (const p of s.pipes) {
    if (p.role !== 'colector') continue;
    const na = s.nodes[p.a], nb = s.nodes[p.b];
    const mx = (na.x + nb.x) / 2, my = (na.y + nb.y) / 2;
    const dxp = nb.x - na.x, dyp = nb.y - na.y;
    for (const st of side) {
      const alongX = st.axis === 'x';
      const parallel = alongX ? Math.abs(dyp) <= 0.2 * Math.abs(dxp) : Math.abs(dxp) <= 0.2 * Math.abs(dyp);
      if (!parallel) continue;
      const off = (alongX ? my : mx) - st.center;
      const pos = alongX ? mx : my;
      if (Math.abs(off) > st.halfWidth || pos < st.from || pos > st.to) continue;
      checked++;
      if ((p.system === 0) !== off > 0) wrong++;
    }
  }
  out.push({ id: 'costado', criterio: 'Aguas lluvias al norte y al oriente de la vía; aguas residuales al sur y al occidente', referencia: 'GD-AS002, 3.4.2', medido: `${checked - wrong} de ${checked} colectores en su costado`, cumple: wrong === 0 && checked > 0 });
  // separación vertical en cruces
  let minClear = Infinity, crossings = 0;
  for (const p of s.pipes) for (const q of s.pipes) {
    if (p.system !== 0 || q.system !== 1) continue;
    const a: [number, number] = [s.nodes[p.a].x, s.nodes[p.a].y], b: [number, number] = [s.nodes[p.b].x, s.nodes[p.b].y];
    const cc: [number, number] = [s.nodes[q.a].x, s.nodes[q.a].y], d: [number, number] = [s.nodes[q.b].x, s.nodes[q.b].y];
    const x = segCross(a, b, cc, d);
    if (!x) continue;
    crossings++;
    const zp = p.zUp + (p.zDn - p.zUp) * x.t, zq = q.zUp + (q.zDn - q.zUp) * x.u;
    // distancia libre entre la batea de la de arriba y la corona de la de abajo
    const clear = zp > zq ? zp - (zq + q.D) : zq - (zp + p.D);
    minClear = Math.min(minClear, clear);
  }
  out.push({ id: 'cruces', criterio: 'Separación vertical libre ≥ 0,5 m donde se cruzan las dos redes', referencia: 'GD-AS002, 3.4.3', medido: crossings ? `${crossings} cruces; mínima ${fmt(minClear)} m` : 'sin cruces', cumple: crossings === 0 || minClear >= 0.5 - 1e-6 });
  return out;
}

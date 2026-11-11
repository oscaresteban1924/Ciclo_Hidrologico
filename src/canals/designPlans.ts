// Plano acotado y gráfica de cada prediseño, a partir de las medidas que devuelve su cálculo (`Result.data`).

import { PARSHALL, parshallH, transport, type ParshallSize } from './advanced';
import { ratingCurve, type Inlet } from './culvert';
import { calcFormulas, calcRotura, calcTransito, muskingumCunge, preCanalTierra, preMuroCompuerta, preParshall, prePozoUSBR } from './designAdvanced';
import { ritter, stokerProfile } from './unsteady';
import { preAforador, preAlcantarilla, preCanal, preEnrocado, prePozo, prePuente, type Result, type Vals } from './designCalc';
import { CREEK, manningQ, normalDepth, rectWeirQ, triWeirQ, type Section } from './hydraulics';
import type { Chart, Plan, XY } from './plan';
import { basinPlan, bridgePlan, channelPlan, culvertPlan, riprapPlan, weirPlan } from './planBuilders';
import { bedN } from './sediment';

type Run = (v: Vals) => Result;
const N = (x: number | string | undefined) => (typeof x === 'number' ? x : Number(x));

function qyChart(d: Record<string, number | string>, title: string): Chart {
  const sec: Section = { shape: N(d.z) > 0 ? 'trap' : 'rect', b: N(d.b), z: N(d.z), D: 0, H: 99 };
  const H = N(d.H);
  const pts: XY[] = Array.from({ length: 41 }, (_, k) => {
    const y = (H * k) / 40;
    return [k ? manningQ(sec, N(d.n), N(d.S), y) : 0, y] as XY;
  });
  return { title, xLabel: 'caudal (m³/s)', yLabel: 'profundidad (m)', series: [{ name: 'curva de descarga', pts }], mark: { at: [N(d.Q), N(d.y)], text: 'caudal de diseño' }, hlines: [{ y: H, text: 'borde del canal' }] };
}

const PLANS = new Map<Run, (d: Record<string, number | string>) => { plan?: Plan; chart?: Chart }>([
  [preMuroCompuerta, (d) => ({ plan: channelPlan({ title: 'Muros del canal para la onda de cierre', b: N(d.b), z: 0, y: N(d.y2), H: N(d.H), t: 0.2, before: N(d.y1) }) })],
  [
    calcRotura,
    (d) => {
      const h0 = N(d.h0), h1 = N(d.h1), X = Math.max(60, N(d.x) * 1.2);
      const prof = (t: number): XY[] => Array.from({ length: 121 }, (_, k) => {
        const x = -X * 0.4 + (X * 1.4 * k) / 120;
        return [x, d.kind === 'ritter' ? ritter(x, t, 0, h0) : stokerProfile(x, t, 0, h0, h1)] as XY;
      });
      const c = d.kind === 'ritter' ? 2 * Math.sqrt(9.81 * h0) : 0;
      const tt = d.kind === 'ritter' ? [0.2, 0.5, 1].map((f) => (f * X) / c) : [0.2, 0.5, 1].map((f) => (f * X) / Math.max(1, Math.sqrt(9.81 * h0) * 1.4));
      return { chart: { title: 'Perfil del agua después de la rotura (presa en x = 0)', xLabel: 'distancia desde la presa (m)', yLabel: 'profundidad (m)', series: tt.map((t, k) => ({ name: `a los ${t.toFixed(0)} s`, pts: prof(t), dash: k === 0 })) } };
    },
  ],
  [
    calcTransito,
    (d) => {
      const r = muskingumCunge({ L: N(d.L), b: N(d.b), n: N(d.n), S: N(d.S), Qb: N(d.Qb), Qp: N(d.Qp), tp: N(d.tp) });
      // hasta que la salida vuelve cerca de la base
      const end = Math.min(r.t.length - 1, Math.max(...r.qout.map((q, j) => (q > N(d.Qb) + 0.03 * (N(d.Qp) - N(d.Qb)) ? j : 0))) + 8);
      const idx = Array.from({ length: end + 1 }, (_, j) => j).filter((j) => j % 2 === 0 || j === end);
      const pick = (a: number[]): XY[] => idx.map((j) => [r.t[j] / 3600, a[j]] as XY);
      return {
        chart: {
          title: `Hidrogramas a la entrada y a ${(N(d.L) / 1000).toLocaleString('es-CO')} km (Muskingum-Cunge)`,
          xLabel: 'tiempo (h)',
          yLabel: 'caudal (m³/s)',
          series: [
            { name: 'entrada', pts: pick(r.qin), dash: true },
            { name: 'salida del tramo', pts: pick(r.qout) },
          ],
          mark: { at: [r.tPeakOut / 3600, r.peakOut], text: `pico ${r.peakOut.toFixed(1).replace('.', ',')} m³/s` },
        },
      };
    },
  ],
  [preCanal, (d) => ({ plan: channelPlan({ title: 'Canal revestido propuesto', b: N(d.b), z: N(d.z), y: N(d.y), H: N(d.H), t: 0.1 }), chart: qyChart(d, 'Curva de descarga del canal propuesto') })],
  [preCanalTierra, (d) => ({ plan: channelPlan({ title: 'Canal en tierra propuesto', b: N(d.b), z: N(d.z), y: N(d.y), H: N(d.H), earth: true }), chart: qyChart(d, 'Curva de descarga del canal en tierra') })],
  [prePozo, (d) => ({ plan: basinPlan({ title: 'Pozo amortiguador propuesto', drop: N(d.drop), L: N(d.L), y1: N(d.y1), y2: N(d.y2), tw: N(d.tw), chute: null, baffle: null, sill: N(d.P), type: 'I' }) })],
  [prePozoUSBR, (d) => ({ plan: basinPlan({ title: `Pozo USBR tipo ${d.type} propuesto`, drop: N(d.drop), L: N(d.L), y1: N(d.y1), y2: N(d.y2), tw: N(d.tw), chute: N(d.ch) > 0 ? { h: N(d.ch), w: N(d.cw) } : null, baffle: N(d.bh) > 0 ? { h: N(d.bh), x: N(d.bx) } : null, sill: N(d.sill), type: String(d.type) }) })],
  [prePuente, (d) => ({ plan: bridgePlan({ title: 'Abertura del puente propuesta', B: Math.max(N(d.B), N(d.span)), H: N(d.Hw), span: N(d.span), soffit: N(d.soffit), deck: CREEK.deck, yU: N(d.yU) }) })],
  [
    preAlcantarilla,
    (d) => {
      const box = N(d.box) === 1;
      const curve = ratingCurve({ Q: N(d.Q), D: N(d.D), B: N(d.B), barrels: N(d.nb), L: N(d.L), S: N(d.S), tw: N(d.tw), inlet: String(d.inlet) as Inlet, road: N(d.road), shape: box ? 'cajon' : 'circ' }, N(d.Q) * 1.6, 32);
      return {
        plan: culvertPlan({ title: 'Alcantarilla propuesta', box, D: N(d.D), B: N(d.B), nb: N(d.nb), road: N(d.road), hw: N(d.hw) }),
        chart: {
          title: 'Nivel a la entrada según el caudal',
          xLabel: 'caudal (m³/s)',
          yLabel: 'agua a la entrada HW (m)',
          series: [
            { name: 'control a la entrada', pts: curve.map((c) => [c.Q, c.inlet] as XY) },
            { name: 'control a la salida', pts: curve.map((c) => [c.Q, c.outlet] as XY), dash: true },
          ],
          mark: { at: [N(d.Q), N(d.hw)], text: 'creciente de diseño' },
          hlines: [{ y: N(d.road), text: 'vía' }, { y: N(d.hwd) * N(d.D), text: `HW máximo (${N(d.hwd)} D)` }],
        },
      };
    },
  ],
  [preEnrocado, (d) => ({ plan: riprapPlan({ title: 'Enrocado propuesto', b: N(d.b), h: N(d.h), d50: N(d.d50) }) })],
  [
    preAforador,
    (d) => {
      const tri = String(d.pick).startsWith('triangular');
      if (d.pick === 'ninguno') return {};
      const b = N(d.b), P = tri ? N(d.Pt) : N(d.P);
      const h1 = tri ? N(d.t1) : N(d.r1), h2 = tri ? N(d.t2) : N(d.r2);
      const pts: XY[] = Array.from({ length: 31 }, (_, k) => {
        const H = (h2 * 1.15 * k) / 30;
        return [(tri ? triWeirQ(H) : rectWeirQ(H, b, P)) * 1000, H * 100] as XY;
      });
      return {
        plan: weirPlan({ title: `Vertedero ${String(d.pick)} propuesto`, kind: tri ? 'tri' : 'rect', b, Hc: N(d.Hc), P, h1, h2 }),
        chart: { title: 'Curva de calibración', xLabel: 'caudal (L/s)', yLabel: 'carga H (cm)', series: [{ name: 'vertedero', pts }], mark: { at: [N(d.qmax) * 1000, h2 * 100], text: 'caudal máximo' } },
      };
    },
  ],
  [
    preParshall,
    (d) => {
      const size = String(d.size) as ParshallSize;
      if (!(size in PARSHALL)) return {};
      const q1 = N(d.qmin), q2 = N(d.qmax);
      const pts: XY[] = Array.from({ length: 31 }, (_, k) => {
        const Q = q1 * 0.5 + ((q2 * 1.2 - q1 * 0.5) * k) / 30;
        return [Q * 1000, parshallH(size, Q) * 100] as XY;
      });
      return { chart: { title: `Canaleta Parshall de ${PARSHALL[size].name}`, xLabel: 'caudal (L/s)', yLabel: 'carga Ha (cm)', series: [{ name: 'Parshall', pts }], mark: { at: [q2 * 1000, parshallH(size, q2) * 100], text: 'caudal máximo' }, hlines: [{ y: PARSHALL[size].Hmax * 100, text: 'carga máxima de la canaleta' }] } };
    },
  ],
  [
    calcFormulas,
    (d) => {
      const Q0 = N(d.Q), b = N(d.b), S = N(d.S), dd = N(d.d);
      const n = N(d.n) > 0 ? N(d.n) : bedN(dd);
      const rows = Array.from({ length: 26 }, (_, k) => {
        const Q = Q0 * (0.2 + (2.8 * k) / 25);
        const sec: Section = { shape: 'rect', b, z: 0, D: 0, H: 99 };
        const h = normalDepth(sec, n, S, Q), R = (b * h) / (b + 2 * h);
        const t = transport({ d: dd, h, V: Q / (b * h), S, R });
        const day = (q: number) => q * b * 86400 * 2.65;
        return { Q, mpm: day(t.mpm), eb: day(t.einsteinBrown), vr: day(t.vanRijn), eh: day(t.engelundHansen) };
      });
      return {
        chart: {
          title: 'Transporte según el caudal, con cada fórmula',
          xLabel: 'caudal (m³/s)',
          yLabel: 'sedimento (t/día, escala log.)',
          logY: true,
          series: [
            { name: 'Meyer-Peter y Müller', pts: rows.map((r) => [r.Q, r.mpm] as XY) },
            { name: 'Einstein y Brown', pts: rows.map((r) => [r.Q, r.eb] as XY) },
            { name: 'van Rijn', pts: rows.map((r) => [r.Q, r.vr] as XY) },
            { name: 'Engelund y Hansen', pts: rows.map((r) => [r.Q, r.eh] as XY), dash: true },
          ],
        },
      };
    },
  ],
]);

/** Plano y gráfica del resultado de una herramienta, si los tiene. */
export function planFor(run: Run, res: Result): { plan?: Plan; chart?: Chart } {
  if (res.error || !res.data) return {};
  const fn = PLANS.get(run);
  if (!fn) return {};
  try {
    return fn(res.data);
  } catch {
    return {};
  }
}

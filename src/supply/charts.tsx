// Gráficas en vivo de la sala «Acueducto»: perfil de la conducción con sus líneas de energía y piezométrica, presiones
// de la red a lo largo del día, convergencia de Hardy Cross, diagrama de Moody y la presión en la válvula durante el
// golpe de ariete. Cada una con su eje (sin ejes dobles) y su leyenda.

import { es } from '../canals/common';
import { colebrook } from './pipes';
import type { PipelineResult } from './pipes';
import type { HammerResult } from './hammer';

const AX = '#5b6b78', INK = '#3c4b57';

function ticks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo, raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => span / s <= n) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Perfil de la conducción: terreno, tubo, líneas piezométrica y de energía, nivel estático y piezómetros. */
export function PipeProfileChart({ r, piezoX, W = 560, H = 210 }: { r: PipelineResult; piezoX: number[]; W?: number; H?: number }) {
  const L = 36, R = 10, top = 20, B = 22;
  const xMax = r.pts[r.pts.length - 1].x;
  const zs = r.pts.map((p) => p.z);
  const y0 = Math.floor(Math.min(...zs, ...r.pts.map((p) => p.hgl)) / 5) * 5 - 2, y1 = r.inp.H0 + 4;
  const X = (x: number) => L + (x / xMax) * (W - L - R);
  const Y = (y: number) => H - B - ((y - y0) / (y1 - y0)) * (H - B - top);
  const line = (k: 'z' | 'hgl' | 'egl') => r.pts.map((p) => `${X(p.x).toFixed(1)},${Y(p[k]).toFixed(1)}`).join(' ');
  const ground = r.pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.z + 1.2).toFixed(1)}`).join(' ');
  const neg = r.pts.filter((p) => p.p < 0);
  const hglAt = (x: number) => {
    for (let k = 1; k < r.pts.length; k++) if (x <= r.pts[k].x) return r.pts[k - 1].hgl + ((x - r.pts[k - 1].x) / Math.max(1e-9, r.pts[k].x - r.pts[k - 1].x)) * (r.pts[k].hgl - r.pts[k - 1].hgl);
    return r.pts[r.pts.length - 1].hgl;
  };
  const zAt = (x: number) => {
    for (let k = 1; k < r.pts.length; k++) if (x <= r.pts[k].x) return r.pts[k - 1].z + ((x - r.pts[k - 1].x) / Math.max(1e-9, r.pts[k].x - r.pts[k - 1].x)) * (r.pts[k].z - r.pts[k - 1].z);
    return r.pts[r.pts.length - 1].z;
  };
  const yt = ticks(y0, y1, 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-hud-svg" role="img" aria-label={`Perfil de la conducción: caudal ${es(r.Q * 1000, 1)} L/s, presión mínima ${es(r.pMin, 1)} m.`}>
      <rect x={L} y={top} width={W - L - R} height={H - B - top} fill="#f7fafc" />
      <polygon points={`${X(0)},${H - B} ${ground} ${X(xMax)},${H - B}`} fill="#e7dcc7" />
      <line x1={X(0)} x2={X(xMax)} y1={Y(r.inp.H0)} y2={Y(r.inp.H0)} stroke="#8a96a0" strokeDasharray="5 3" />
      <polyline points={line('z')} fill="none" stroke="#7d6a52" strokeWidth="2.6" />
      {neg.length > 0 && neg.map((p, k) => <circle key={k} cx={X(p.x)} cy={Y(p.z)} r="3.2" fill="#c0392b" />)}
      <polyline points={line('egl')} fill="none" stroke="#7b5ea7" strokeWidth="1.4" strokeDasharray="6 3" />
      <polyline points={line('hgl')} fill="none" stroke="#1f78b4" strokeWidth="2" />
      {piezoX.map((x, k) => (
        <g key={x}>
          <line x1={X(x)} x2={X(x)} y1={Y(zAt(x))} y2={Y(Math.max(zAt(x), hglAt(x)))} stroke="#1f78b4" strokeWidth="3" strokeOpacity="0.45" />
          <text x={X(x)} y={Y(Math.max(zAt(x), hglAt(x))) - 4} className="hc-hud-t" textAnchor="middle" fill={INK}>{String.fromCharCode(65 + k)}</text>
        </g>
      ))}
      {yt.map((v) => (
        <text key={v} x={L - 4} y={Y(v) + 3} className="hc-hud-t" textAnchor="end" fill={AX}>{es(v, 0)}</text>
      ))}
      <text x={4} y={12} className="hc-hud-t" fill={AX}>cota (m)</text>
      <text x={X(0)} y={H - 7} className="hc-hud-t" fill={AX}>0</text>
      <text x={X(xMax)} y={H - 7} className="hc-hud-t" textAnchor="end" fill={AX}>{es(xMax, 0)} m</text>
      <g transform={`translate(${L + 70} 11)`}>
        <line x1={0} x2={12} y1={-3} y2={-3} stroke="#1f78b4" strokeWidth="2" />
        <text x={15} y={1} className="hc-hud-t" fill={INK}>piezométrica</text>
        <line x1={86} x2={98} y1={-3} y2={-3} stroke="#7b5ea7" strokeDasharray="4 2" />
        <text x={101} y={1} className="hc-hud-t" fill={INK}>energía</text>
        <line x1={150} x2={162} y1={-3} y2={-3} stroke="#8a96a0" strokeDasharray="4 2" />
        <text x={165} y={1} className="hc-hud-t" fill={INK}>estática</text>
        <line x1={214} x2={226} y1={-3} y2={-3} stroke="#7d6a52" strokeWidth="2.6" />
        <text x={229} y={1} className="hc-hud-t" fill={INK}>tubo</text>
        {neg.length > 0 && (
          <>
            <circle cx={268} cy={-3} r="3" fill="#c0392b" />
            <text x={274} y={1} className="hc-hud-t" fill={INK}>presión negativa</text>
          </>
        )}
      </g>
    </svg>
  );
}

/** Presión mínima de la red hora a hora (dinámica) con la estática máxima y los límites del RAS. */
export function DayChart({ pmin, stat, req, hour, W = 560, H = 210 }: { pmin: number[]; stat: number; req: number; hour: number; W?: number; H?: number }) {
  const L = 36, R = 10, top = 20, B = 22;
  const vals = [...pmin.filter(Number.isFinite), stat, req, 50];
  const y0 = Math.max(0, Math.floor(Math.min(...vals) / 5) * 5 - 5), y1 = Math.ceil(Math.max(...vals) / 5) * 5 + 5;
  const X = (h: number) => L + (h / 24) * (W - L - R);
  const Y = (v: number) => H - B - ((v - y0) / (y1 - y0)) * (H - B - top);
  const pts = pmin.map((v, h) => `${X(h + 0.5).toFixed(1)},${Y(Number.isFinite(v) ? v : y0).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-hud-svg" role="img" aria-label={`Presión mínima de la red a lo largo del día; a las ${hour} h es ${es(pmin[Math.floor(hour) % 24], 1)} m.`}>
      <rect x={L} y={top} width={W - L - R} height={H - B - top} fill="#f7fafc" />
      <rect x={L} y={Y(req)} width={W - L - R} height={H - B - Y(req)} fill="#f6dcd6" opacity="0.6" />
      <line x1={L} x2={W - R} y1={Y(req)} y2={Y(req)} stroke="#c0392b" strokeDasharray="5 3" />
      <text x={W - R - 3} y={Y(req) - 3} className="hc-hud-t" textAnchor="end" fill="#9b2f22">mínima dinámica {req} m (Art. 61)</text>
      <line x1={L} x2={W - R} y1={Y(50)} y2={Y(50)} stroke="#c0632b" strokeDasharray="5 3" />
      <text x={W - R - 3} y={Y(50) - 3} className="hc-hud-t" textAnchor="end" fill="#9b4a1c">estática máxima 50 m (Art. 62)</text>
      <line x1={L} x2={W - R} y1={Y(stat)} y2={Y(stat)} stroke="#8a96a0" strokeWidth="1.6" />
      <text x={L + 4} y={Y(stat) - 3} className="hc-hud-t" fill={INK}>estática más alta {es(stat, 1)} m</text>
      <polyline points={pts} fill="none" stroke="#1f78b4" strokeWidth="2" />
      <line x1={X(hour + 0.5)} x2={X(hour + 0.5)} y1={top} y2={H - B} stroke="#17324d" strokeWidth="1.3" />
      {[0, 6, 12, 18, 24].map((h) => (
        <text key={h} x={X(h)} y={H - 7} className="hc-hud-t" textAnchor={h === 24 ? 'end' : h === 0 ? 'start' : 'middle'} fill={AX}>{h === 24 ? '24 h' : h}</text>
      ))}
      {ticks(y0, y1, 4).map((v) => (
        <text key={v} x={L - 4} y={Y(v) + 3} className="hc-hud-t" textAnchor="end" fill={AX}>{es(v, 0)}</text>
      ))}
      <text x={4} y={12} className="hc-hud-t" fill={AX}>presión (m)</text>
      <g transform={`translate(${L + 80} 11)`}>
        <line x1={0} x2={12} y1={-3} y2={-3} stroke="#1f78b4" strokeWidth="2" />
        <text x={15} y={1} className="hc-hud-t" fill={INK}>la más baja de la red, hora a hora</text>
      </g>
    </svg>
  );
}

/** Convergencia de Hardy Cross: la mayor corrección de cada iteración, en escala logarítmica. */
export function ConvergenceChart({ history, W = 480, H = 180 }: { history: number[]; W?: number; H?: number }) {
  const L = 44, R = 10, top = 16, B = 24;
  const lg = history.map((v) => Math.log10(Math.max(1e-12, v)));
  const y0 = Math.floor(Math.min(...lg, -5)), y1 = Math.ceil(Math.max(...lg, 1));
  const X = (i: number) => L + (i / Math.max(1, history.length - 1)) * (W - L - R);
  const Y = (v: number) => H - B - ((v - y0) / (y1 - y0)) * (H - B - top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-exp-svg cu-svg" role="img" aria-label={`Hardy Cross: ${history.length} iteraciones hasta una corrección de ${es(history[history.length - 1] ?? 0, 6)} L/s.`}>
      <rect x={L} y={top} width={W - L - R} height={H - B - top} fill="#f7fafc" />
      {Array.from({ length: y1 - y0 + 1 }, (_, k) => y0 + k).map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#e3eaef" />
          <text x={L - 4} y={Y(v) + 4} className="lz-s" textAnchor="end" fill={AX}>{v === 0 ? '1' : `1e${v}`}</text>
        </g>
      ))}
      <polyline points={lg.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')} fill="none" stroke="#1f78b4" strokeWidth="2" />
      {lg.map((v, i) => (
        <circle key={i} cx={X(i)} cy={Y(v)} r="2.6" fill="#1f78b4" />
      ))}
      <text x={W - R} y={H - 6} className="lz-s" textAnchor="end" fill={AX}>iteración ({history.length})</text>
      <text x={L} y={11} className="lz-s" fill={AX}>mayor corrección |ΔQ| (L/s)</text>
    </svg>
  );
}

/** Diagrama de Moody con el punto de operación. */
export function MoodyChart({ Re, rr, f, measured, W = 480, H = 230 }: { Re: number; rr: number; f: number; measured?: number | null; W?: number; H?: number }) {
  const L = 44, R = 10, top = 18, B = 26;
  const x0 = 3, x1 = 8, y0 = Math.log10(0.008), y1 = Math.log10(0.1);
  const X = (lre: number) => L + ((lre - x0) / (x1 - x0)) * (W - L - R);
  const Y = (lf: number) => H - B - ((lf - y0) / (y1 - y0)) * (H - B - top);
  const curves = [0, 1e-5, 1e-4, 1e-3, 1e-2, 0.05];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-exp-svg cu-svg" role="img" aria-label={`Diagrama de Moody: Re = ${es(Re, 0)}, ε/D = ${rr.toExponential(1)}, f = ${es(f, 4)}.`}>
      <rect x={L} y={top} width={W - L - R} height={H - B - top} fill="#f7fafc" />
      <polyline points={Array.from({ length: 20 }, (_, k) => { const lre = 3 + (k * Math.log10(2300 / 1000)) / 19; return `${X(lre).toFixed(1)},${Y(Math.log10(64 / Math.pow(10, lre))).toFixed(1)}`; }).join(' ')} fill="none" stroke="#5b6b78" strokeWidth="1.4" />
      {curves.map((c) => (
        <g key={c}>
          <polyline points={Array.from({ length: 40 }, (_, k) => { const lre = Math.log10(4000) + (k * (8 - Math.log10(4000))) / 39; return `${X(lre).toFixed(1)},${Y(Math.log10(colebrook(Math.pow(10, lre), c).f)).toFixed(1)}`; }).join(' ')} fill="none" stroke={Math.abs(c - rr) < 1e-12 ? '#1f78b4' : '#b8c7d2'} strokeWidth={Math.abs(c - rr) < 1e-12 ? 2 : 1.1} />
          <text x={W - R - 2} y={Y(Math.log10(colebrook(1e8, c).f)) - 2} className="lz-s" textAnchor="end" fill={AX}>{c === 0 ? 'liso' : c}</text>
        </g>
      ))}
      <circle cx={X(Math.log10(Math.max(1000, Re)))} cy={Y(Math.log10(f))} r="5" fill="#c0392b" />
      {measured && Number.isFinite(measured) && measured > 0 && <circle cx={X(Math.log10(Math.max(1000, Re)))} cy={Y(Math.log10(Math.min(0.1, Math.max(0.008, measured))))} r="5" fill="none" stroke="#17324d" strokeWidth="2" />}
      {[3, 4, 5, 6, 7, 8].map((v) => (
        <text key={v} x={X(v)} y={H - 9} className="lz-s" textAnchor={v === 8 ? 'end' : 'middle'} fill={AX}>{`1e${v}`}</text>
      ))}
      {[0.01, 0.02, 0.04, 0.08].map((v) => (
        <text key={v} x={L - 4} y={Y(Math.log10(v)) + 4} className="lz-s" textAnchor="end" fill={AX}>{es(v, 2)}</text>
      ))}
      <text x={L + 4} y={top + 12} className="lz-s" fill={AX}>f (Darcy)</text>
      <text x={W - R} y={H - 0} className="lz-s" textAnchor="end" fill={AX}>Reynolds</text>
      <text x={L + 60} y={top + 12} className="lz-s" fill="#c0392b">● calculado</text>
      {measured ? <text x={L + 150} y={top + 12} className="lz-s" fill="#17324d">○ con tus lecturas</text> : null}
    </svg>
  );
}

/** Cota en la válvula y en la mitad del tubo durante el cierre, con las bandas de Joukowsky. */
export function HammerChart({ r, tNow, W = 560, H = 210 }: { r: HammerResult; tNow: number | null; W?: number; H?: number }) {
  const L = 40, R = 10, top = 20, B = 22;
  const J = (r.a * r.inp.V0) / 9.81;
  const y0 = Math.min(r.minV, r.Hv0 - J, 0) - 5, y1 = Math.max(r.maxV, r.Hv0 + J) + 8;
  const X = (t: number) => L + (t / r.inp.tEnd) * (W - L - R);
  const Y = (v: number) => H - B - ((v - y0) / (y1 - y0)) * (H - B - top);
  const step = Math.max(1, Math.floor(r.t.length / 500));
  const ser = (a: number[]) => r.t.filter((_, k) => k % step === 0).map((t, k) => `${X(t).toFixed(1)},${Y(a[k * step]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-hud-svg" role="img" aria-label={`Cota en la válvula: de ${es(r.Hv0, 1)} m sube hasta ${es(r.maxV, 1)} m y baja hasta ${es(r.minV, 1)} m.`}>
      <rect x={L} y={top} width={W - L - R} height={H - B - top} fill="#f7fafc" />
      <line x1={L} x2={W - R} y1={Y(r.Hv0 + J)} y2={Y(r.Hv0 + J)} stroke="#c0392b" strokeDasharray="5 3" />
      <text x={W - R - 3} y={Y(r.Hv0 + J) - 3} className="hc-hud-t" textAnchor="end" fill="#9b2f22">Joukowsky +{es(J, 0)} m</text>
      <line x1={L} x2={W - R} y1={Y(r.Hv0 - J)} y2={Y(r.Hv0 - J)} stroke="#2166ac" strokeDasharray="5 3" />
      <text x={W - R - 3} y={Y(r.Hv0 - J) + 10} className="hc-hud-t" textAnchor="end" fill="#1b4f86">−{es(J, 0)} m</text>
      {r.Hv0 - J < -10 && <line x1={L} x2={W - R} y1={Y(-10.1)} y2={Y(-10.1)} stroke="#17324d" strokeDasharray="2 3" />}
      <line x1={L} x2={W - R} y1={Y(r.Hv0)} y2={Y(r.Hv0)} stroke="#8a96a0" />
      <polyline points={ser(r.Hm)} fill="none" stroke="#8fb4d2" strokeWidth="1.4" strokeDasharray="4 2" />
      <polyline points={ser(r.Hv)} fill="none" stroke="#1f78b4" strokeWidth="2" />
      {tNow !== null && <line x1={X(tNow)} x2={X(tNow)} y1={top} y2={H - B} stroke="#17324d" strokeWidth="1.3" />}
      {r.inp.tc > 0 && <rect x={L} y={top} width={X(r.inp.tc) - L} height={H - B - top} fill="#17324d" opacity="0.05" />}
      {ticks(y0, y1, 4).map((v) => (
        <text key={v} x={L - 4} y={Y(v) + 3} className="hc-hud-t" textAnchor="end" fill={AX}>{es(v, 0)}</text>
      ))}
      {ticks(0, r.inp.tEnd, 6).map((t, k, a) => (
        <text key={t} x={X(t)} y={H - 7} className="hc-hud-t" textAnchor={k === 0 ? 'start' : 'middle'} fill={AX}>{k === a.length - 1 ? `${es(t, 0)} s` : es(t, t % 1 ? 1 : 0)}</text>
      ))}
      <text x={4} y={12} className="hc-hud-t" fill={AX}>cota (m)</text>
      <g transform={`translate(${L + 70} 11)`}>
        <line x1={0} x2={12} y1={-3} y2={-3} stroke="#1f78b4" strokeWidth="2" />
        <text x={15} y={1} className="hc-hud-t" fill={INK}>en la válvula</text>
        <line x1={92} x2={104} y1={-3} y2={-3} stroke="#8fb4d2" strokeDasharray="4 2" />
        <text x={107} y={1} className="hc-hud-t" fill={INK}>en la mitad</text>
        <line x1={176} x2={188} y1={-3} y2={-3} stroke="#8a96a0" />
        <text x={191} y={1} className="hc-hud-t" fill={INK}>antes del cierre</text>
      </g>
    </svg>
  );
}

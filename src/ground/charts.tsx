// Gráficas y esquemas de la sala «Aguas subterráneas»: el corte del acuífero con el nivel freático, el abatimiento en
// el tiempo (Theis, Cooper-Jacob y lecturas), la llegada de la mancha al pozo y la planta con la zona de captura.

import { es } from '../canals/common';
import { captureZone, cooperJacob, theis, type Particle } from './aquifer';
import { AQ, PLUME, WELL, plumeQ, wellT, type AquiferResult, type WellScene } from './scene';

const AXC = '#5b6b78', INK = '#3c4b57';

/** Corte del acuífero libre: superficie, nivel freático de Dupuit, base y río. */
export function DupuitChart({ r, W = 560, H = 200, cls = 'hc-hud-svg' }: { r: AquiferResult; W?: number; H?: number; cls?: string }) {
  const L = 34, R = 10, top = 18, B = 22;
  const X = (x: number) => L + (x / 640) * (W - L - R);
  const Y = (y: number) => H - B - (y / 44) * (H - B - top);
  const ground = (x: number) => (x < 560 ? 40 - (16 * x) / 600 + 2.5 * Math.exp(-((x - 60) ** 2) / 3000) : x < 590 ? 40 - (16 * 560) / 600 - ((x - 560) / 30) * 8 : 17);
  const xs = Array.from({ length: 65 }, (_, k) => k * 10);
  const wt = xs.filter((x) => x <= AQ.L).map((x) => `${X(x).toFixed(1)},${Y(r.h(x)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Corte del acuífero: el agua baja de ${es(r.h1, 1)} m junto a la loma a ${AQ.h2} m en el río.`}>
      <polygon points={`${X(0)},${Y(0)} ${xs.map((x) => `${X(x).toFixed(1)},${Y(ground(x)).toFixed(1)}`).join(' ')} ${X(640)},${Y(0)}`} fill="#e7dcc7" />
      <polygon points={`${X(0)},${Y(0)} ${wt.join(' ')} ${X(640)},${Y(AQ.h2)} ${X(640)},${Y(0)}`} fill="#9fc6e3" opacity="0.8" />
      <polyline points={wt.join(' ')} fill="none" stroke="#1f78b4" strokeWidth="2" />
      <rect x={X(590)} y={Y(AQ.h2)} width={X(640) - X(590)} height={Y(17) - Y(AQ.h2)} fill="#2f84b5" />
      <line x1={X(0)} x2={X(640)} y1={Y(0)} y2={Y(0)} stroke="#5b4630" strokeWidth="3" />
      {[0, 20, 40].map((v) => (
        <text key={v} x={L - 4} y={Y(v) + 3} className="hc-hud-t" textAnchor="end" fill={AXC}>{v}</text>
      ))}
      <text x={4} y={12} className="hc-hud-t" fill={AXC}>cota (m)</text>
      <text x={X(0)} y={H - 7} className="hc-hud-t" fill={AXC}>loma</text>
      <text x={X(615)} y={H - 7} className="hc-hud-t" textAnchor="middle" fill={AXC}>río</text>
      <text x={X(300)} y={H - 7} className="hc-hud-t" textAnchor="middle" fill={AXC}>{AQ.L} m · base impermeable</text>
      <text x={X(20)} y={Y(r.h1) - 5} className="hc-hud-t" fill="#1f5f8a">nivel freático {es(r.h1, 1)} m</text>
      <g transform={`translate(${L + 230} 11)`}>
        <rect x={0} y={-8} width={11} height={9} fill="#9fc6e3" />
        <text x={14} y={0} className="hc-hud-t" fill={INK}>zona saturada</text>
        <rect x={96} y={-8} width={11} height={9} fill="#e7dcc7" />
        <text x={110} y={0} className="hc-hud-t" fill={INK}>suelo sin saturar</text>
      </g>
    </svg>
  );
}

/** Abatimiento en un pozo de observación contra el tiempo (escala logarítmica). */
export function DrawdownChart({ s, r, pts, tNow, W = 560, H = 210, cls = 'hc-hud-svg' }: { s: WellScene; r: number; pts: { t: number; s: number }[]; tNow: number | null; W?: number; H?: number; cls?: string }) {
  const L = 38, R = 10, top = 20, B = 24;
  const T = wellT(s.soil), Q = s.Qls * 86.4;
  const t0 = -3, t1 = Math.max(0, Math.ceil(Math.log10(s.t) + 0.3));
  const ts = Array.from({ length: 80 }, (_, k) => Math.pow(10, t0 + (k * (t1 - t0)) / 79));
  const sMax = Math.max(0.05, ...ts.map((t) => theis(Q, T, WELL.S, r, t)), ...pts.map((p) => p.s)) * 1.15;
  const X = (t: number) => L + ((Math.log10(t) - t0) / (t1 - t0)) * (W - L - R);
  const Y = (v: number) => H - B - (Math.max(0, v) / sMax) * (H - B - top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Abatimiento a ${r} m del pozo contra el tiempo: Theis, Cooper-Jacob y ${pts.length} lecturas.`}>
      <rect x={L} y={top} width={W - L - R} height={H - B - top} fill="#f7fafc" />
      {Array.from({ length: t1 - t0 + 1 }, (_, k) => t0 + k).map((e) => (
        <g key={e}>
          <line x1={X(Math.pow(10, e))} x2={X(Math.pow(10, e))} y1={top} y2={H - B} stroke="#e3eaef" />
          <text x={X(Math.pow(10, e))} y={H - 8} className="hc-hud-t" textAnchor={e === t1 ? 'end' : e === t0 ? 'start' : 'middle'} fill={AXC}>{e < 0 ? (e === -3 ? '1,4 min' : e === -2 ? '14 min' : '2,4 h') : e === 0 ? '1 día' : `${Math.pow(10, e)} días`}</text>
        </g>
      ))}
      <polyline points={ts.map((t) => `${X(t).toFixed(1)},${Y(cooperJacob(Q, T, WELL.S, r, t)).toFixed(1)}`).join(' ')} fill="none" stroke="#8a96a0" strokeDasharray="5 3" />
      <polyline points={ts.map((t) => `${X(t).toFixed(1)},${Y(theis(Q, T, WELL.S, r, t)).toFixed(1)}`).join(' ')} fill="none" stroke="#1f78b4" strokeWidth="2" />
      {pts.map((p, k) => (
        <circle key={k} cx={X(p.t)} cy={Y(p.s)} r="2.8" fill="#c0632b" />
      ))}
      {tNow !== null && <line x1={X(tNow)} x2={X(tNow)} y1={top} y2={H - B} stroke="#17324d" strokeWidth="1.3" />}
      <text x={L - 4} y={Y(sMax / 1.15) + 3} className="hc-hud-t" textAnchor="end" fill={AXC}>{es(sMax / 1.15, 2)}</text>
      <text x={L - 4} y={Y(0) + 3} className="hc-hud-t" textAnchor="end" fill={AXC}>0</text>
      <text x={4} y={12} className="hc-hud-t" fill={AXC}>abatimiento a {r} m (m)</text>
      <g transform={`translate(${L + 150} 11)`}>
        <line x1={0} x2={12} y1={-3} y2={-3} stroke="#1f78b4" strokeWidth="2" />
        <text x={15} y={1} className="hc-hud-t" fill={INK}>Theis</text>
        <line x1={52} x2={64} y1={-3} y2={-3} stroke="#8a96a0" strokeDasharray="4 2" />
        <text x={67} y={1} className="hc-hud-t" fill={INK}>Cooper-Jacob</text>
        <circle cx={150} cy={-3} r="2.8" fill="#c0632b" />
        <text x={156} y={1} className="hc-hud-t" fill={INK}>lecturas</text>
      </g>
    </svg>
  );
}

/** Parte de la mancha que ha llegado al pozo, año a año. */
export function BreakthroughChart({ series, tNow, W = 560, H = 210 }: { series: { t: number; f: number }[]; tNow: number | null; W?: number; H?: number }) {
  const L = 38, R = 10, top = 20, B = 22;
  const tMax = PLUME.years * 365;
  const X = (t: number) => L + (t / tMax) * (W - L - R);
  const Y = (f: number) => H - B - f * (H - B - top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-hud-svg" role="img" aria-label={`Parte de la mancha que llegó al pozo: ${es((series[series.length - 1]?.f ?? 0) * 100, 0)} %.`}>
      <rect x={L} y={top} width={W - L - R} height={H - B - top} fill="#f7fafc" />
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={Y(f)} y2={Y(f)} stroke="#e3eaef" />
          <text x={L - 4} y={Y(f) + 3} className="hc-hud-t" textAnchor="end" fill={AXC}>{f * 100} %</text>
        </g>
      ))}
      {series.length > 1 && <polyline points={series.map((p) => `${X(p.t).toFixed(1)},${Y(p.f).toFixed(1)}`).join(' ')} fill="none" stroke="#7b3fa0" strokeWidth="2" />}
      {tNow !== null && <line x1={X(tNow)} x2={X(tNow)} y1={top} y2={H - B} stroke="#17324d" strokeWidth="1.3" />}
      {Array.from({ length: PLUME.years + 1 }, (_, y) => y).filter((y) => y % 2 === 0).map((y) => (
        <text key={y} x={X(y * 365)} y={H - 7} className="hc-hud-t" textAnchor={y === PLUME.years ? 'end' : 'middle'} fill={AXC}>{y === PLUME.years ? `${y} años` : y}</text>
      ))}
      <text x={4} y={12} className="hc-hud-t" fill={AXC}>parte de la mancha que llegó al pozo</text>
    </svg>
  );
}

/** Planta: zona de captura, la fuga, el pozo y las partículas de la mancha. */
export function PlumeMap({ Qls, y0, ps, W = 520, H = 300 }: { Qls: number; y0: number; ps: Particle[]; W?: number; H?: number }) {
  const x0 = -560, x1 = 360, yr = 260;
  const s = Math.min(W / (x1 - x0), (H - 24) / (2 * yr));
  const X = (x: number) => (x - x0) * s, Y = (y: number) => (H - 24) / 2 + y * s;
  const cz = Qls > 0 ? captureZone(Qls * 86.4, PLUME.b, plumeQ()) : null;
  const ys = cz ? Array.from({ length: 81 }, (_, k) => (-0.495 + (k * 0.99) / 80) * cz.width).filter((y) => Math.abs(y) < yr) : [];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-exp-svg cu-svg" role="img" aria-label={`Planta: pozo de ${es(Qls, 1)} L/s con zona de captura de ${cz ? es(cz.width, 0) : 0} m; fuga a ${es(Math.abs(y0), 0)} m del eje.`}>
      <rect x={0} y={0} width={W} height={H - 24} fill="#eef5e6" />
      {cz && <polyline points={ys.map((y) => `${X(Math.max(x0, cz.boundary(y))).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')} fill="#f6dcd6" fillOpacity="0.6" stroke="#c0392b" strokeDasharray="5 3" />}
      {ps.slice(0, 800).map((p, k) => (p.caught < 0 && p.x > x0 && p.x < x1 && Math.abs(p.y) < yr ? <circle key={k} cx={X(p.x)} cy={Y(p.y)} r="1.6" fill="#7b3fa0" opacity="0.7" /> : null))}
      <circle cx={X(0)} cy={Y(0)} r="6" fill="#2f5f8a" />
      <rect x={X(PLUME.x0) - 6} y={Y(y0) - 6} width="12" height="12" fill="#c0392b" />
      {[-150, 0, 150].map((y) => (
        <path key={y} d={`M${X(x0 + 20)},${Y(y)} h28 m-6,-4 l6,4 l-6,4`} fill="none" stroke="#2f84b5" strokeWidth="1.6" />
      ))}
      <text x={X(0) + 9} y={Y(0) - 8} className="lz-s" fill={INK}>pozo</text>
      <text x={X(PLUME.x0) + 9} y={Y(y0) - 8} className="lz-s" fill={INK}>fuga</text>
      <text x={6} y={H - 8} className="lz-s" fill={AXC}>el agua va hacia la derecha · {x1 - x0} m × {2 * yr} m · rojo: zona de captura</text>
    </svg>
  );
}

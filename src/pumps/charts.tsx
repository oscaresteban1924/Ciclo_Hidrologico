// Gráficas de la sala «Bombas y energía del agua»: curvas de la bomba y del sistema con el punto de operación,
// NPSH disponible y requerido, la curva de duración del río con lo que se turbina, y cortes esquemáticos para la
// vista sin 3D.

import { useId } from 'react';
import { es } from '../canals/common';
import { NPSH_MARGIN, PUMP, npsha, npshr, setHead, systemHead, type Arrangement, type SuctionInput, type SystemInput } from './pump';
import { POR } from './design';
import { fdc } from './pump';

const T = { t: 'hc-hud-t' };
const ink = { soft: '#5b6b78', mid: '#3c4b57', strong: '#17324d' };

/** Altura de la bomba (o del conjunto) y del sistema según el caudal, con la región preferida y el punto de operación. */
export function PumpChart({ arr, n, sys, Q, Hd: H, flows, W = 560, Ht = 200, cls = 'hc-hud-svg' }: { arr: Arrangement; n: number; sys: SystemInput; Q: number; Hd: number; flows: boolean; W?: number; Ht?: number; cls?: string }) {
  const uid = useId().replace(/:/g, '');
  const L = 38, R = 14, Tp = 22, B = 24;
  const Qtop = Math.max(60, Math.ceil(((arr === 'paralelo' ? 2 : 1) * Math.max(1, n) * Math.sqrt(PUMP.H0 / PUMP.a)) / 20) * 20);
  const yMax = Math.max(60, Math.ceil((setHead(PUMP, arr, 0, Math.max(1, n)) * 1.08) / 10) * 10);
  const X = (q: number) => L + (q / Qtop) * (W - L - R);
  const Y = (h: number) => Ht - B - (Math.max(0, Math.min(h, yMax)) / yMax) * (Ht - Tp - B);
  const qs = Array.from({ length: 81 }, (_, k) => (k / 80) * Qtop);
  const set = qs.filter((q) => setHead(PUMP, arr, q, n) > -1).map((q) => `${X(q).toFixed(1)},${Y(setHead(PUMP, arr, q, n)).toFixed(1)}`).join(' ');
  const one = arr === 'una' ? '' : qs.filter((q) => setHead(PUMP, 'una', q, n) > -1).map((q) => `${X(q).toFixed(1)},${Y(setHead(PUMP, 'una', q, n)).toFixed(1)}`).join(' ');
  const sysPts = qs.map((q) => `${X(q).toFixed(1)},${Y(systemHead(sys, q).H).toFixed(1)}`).join(' ');
  const mult = arr === 'paralelo' ? 2 : 1;
  const por: [number, number] = [POR[0] * PUMP.Qbep * n * mult, POR[1] * PUMP.Qbep * n * mult];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((u) => u * Qtop);
  return (
    <svg viewBox={`0 0 ${W} ${Ht}`} className={cls} role="img" aria-label={flows ? `Punto de operación: ${es(Q, 1)} L/s con ${es(H, 1)} m` : 'La bomba no alcanza la altura estática'}>
      <defs>
        <linearGradient id={`${uid}p`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f7fb8" stopOpacity="0.16" />
          <stop offset="1" stopColor="#2f7fb8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x={L} y={Tp} width={W - L - R} height={Ht - Tp - B} rx="4" fill="#f5f8fb" />
      <rect x={X(por[0])} y={Tp} width={Math.max(0, Math.min(X(por[1]), W - R) - X(por[0]))} height={Ht - Tp - B} fill="#2e7d32" fillOpacity="0.07" />
      <text x={(X(por[0]) + Math.min(X(por[1]), W - R)) / 2} y={Tp + 11} className={T.t} textAnchor="middle" fill="#2e7d32">zona de mejor eficiencia</text>
      <polygon points={`${X(0)},${Y(0)} ${set} ${X(Qtop)},${Y(0)}`} fill={`url(#${uid}p)`} />
      {one && <polyline points={one} fill="none" stroke="#2f7fb8" strokeWidth="1.2" strokeDasharray="3 3" />}
      <polyline points={set} fill="none" stroke="#1f6fa5" strokeWidth="2.4" strokeLinejoin="round" />
      <polyline points={sysPts} fill="none" stroke="#b5562c" strokeWidth="2" strokeDasharray="7 4" />
      <line x1={L} x2={W - R} y1={Y(sys.Hs)} y2={Y(sys.Hs)} stroke="#b5562c" strokeOpacity="0.35" />
      <text x={W - R - 4} y={Y(sys.Hs) + 12} className={T.t} textAnchor="end" fill="#9a4a24">altura estática {es(sys.Hs, 0)} m</text>
      {flows && (
        <g>
          <line x1={X(Q)} x2={X(Q)} y1={Y(H)} y2={Y(0)} stroke={ink.strong} strokeDasharray="2 3" />
          <line x1={L} x2={X(Q)} y1={Y(H)} y2={Y(H)} stroke={ink.strong} strokeDasharray="2 3" />
          <circle cx={X(Q)} cy={Y(H)} r="6" fill="#17324d" stroke="#fff" strokeWidth="2.2" />
          <text x={X(Q) + (Q > Qtop * 0.7 ? -10 : 10)} y={Y(H) - 9} className={T.t} textAnchor={Q > Qtop * 0.7 ? 'end' : 'start'} fill={ink.strong} fontWeight="700">
            {es(Q, 1)} L/s · {es(H, 1)} m
          </text>
        </g>
      )}
      {ticks.map((q, j) => (
        <text key={j} x={X(q)} y={Ht - 8} className={T.t} textAnchor={j === 0 ? 'start' : j === ticks.length - 1 ? 'end' : 'middle'} fill={ink.soft}>
          {j === ticks.length - 1 ? `${es(q, 0)} L/s` : es(q, 0)}
        </text>
      ))}
      {[0, yMax / 2, yMax].map((v) => (
        <text key={v} x={L - 4} y={Y(v) + 3} className={T.t} textAnchor="end" fill={ink.soft}>{es(v, 0)}</text>
      ))}
      <text x={4} y={12} className={T.t} fill={ink.soft}>m</text>
      <g transform={`translate(${L + 14} 12)`}>
        <line x1={0} x2={16} y1={0} y2={0} stroke="#1f6fa5" strokeWidth="2.4" />
        <text x={20} y={3} className={T.t} fill={ink.mid}>{arr === 'una' ? 'bomba' : arr === 'serie' ? 'dos en serie' : 'dos en paralelo'}</text>
        <line x1={112} x2={128} y1={0} y2={0} stroke="#b5562c" strokeWidth="2" strokeDasharray="7 4" />
        <text x={132} y={3} className={T.t} fill={ink.mid}>tubería</text>
      </g>
    </svg>
  );
}

/** NPSH disponible y requerido según el caudal, con la zona donde cavita y el caudal de ahora. */
export function NpshChart({ inp, Q, Qmax, W = 560, H = 200, cls = 'hc-hud-svg' }: { inp: SuctionInput; Q: number; Qmax: number; W?: number; H?: number; cls?: string }) {
  const L = 36, R = 14, Tp = 22, B = 24;
  const Qtop = 100;
  const qs = Array.from({ length: 51 }, (_, k) => (k / 50) * Qtop);
  const av = qs.map((q) => npsha(inp, q).NPSHa), rq = qs.map((q) => npshr(PUMP, q));
  const yMax = Math.max(12, Math.ceil(Math.max(...av, ...rq) / 2) * 2), yMin = Math.min(0, Math.floor(Math.min(...av) / 2) * 2);
  const X = (q: number) => L + (q / Qtop) * (W - L - R);
  const Y = (v: number) => H - B - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin)) * (H - Tp - B);
  const line = (v: number[]) => qs.map((q, k) => `${X(q).toFixed(1)},${Y(v[k]).toFixed(1)}`).join(' ');
  // zona de cavitación: donde el disponible queda por debajo del requerido
  const k0 = av.findIndex((a, k) => a < rq[k]);
  const cav = k0 < 0 ? '' : `${qs.slice(k0).map((q, j) => `${X(q).toFixed(1)},${Y(rq[k0 + j]).toFixed(1)}`).join(' ')} ${qs.slice(k0).map((q, j) => [q, k0 + j] as const).reverse().map(([q, k]) => `${X(q).toFixed(1)},${Y(av[k]).toFixed(1)}`).join(' ')}`;
  const a = npsha(inp, Q).NPSHa, r = npshr(PUMP, Q);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`NPSH disponible ${es(a, 2)} m y requerido ${es(r, 2)} m con ${es(Q, 0)} L/s`}>
      <rect x={L} y={Tp} width={W - L - R} height={H - Tp - B} rx="4" fill="#f5f8fb" />
      {cav && <polygon points={cav} fill="#c0392b" fillOpacity="0.16" />}
      {k0 >= 0 && <text x={Math.min(W - R - 4, X(qs[k0]) + 6)} y={H - B - 6} className={T.t} fill="#9b2c22" textAnchor={X(qs[k0]) > W - 120 ? 'end' : 'start'}>cavita</text>}
      <polyline points={line(av)} fill="none" stroke="#1f6fa5" strokeWidth="2.4" strokeLinejoin="round" />
      <polyline points={line(rq)} fill="none" stroke="#c0392b" strokeWidth="2" strokeDasharray="6 3" />
      <polyline points={line(rq.map((x) => x + NPSH_MARGIN))} fill="none" stroke="#c0392b" strokeOpacity="0.35" strokeWidth="1" />
      {yMin < 0 && <line x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke="#7a8a97" strokeOpacity="0.5" />}
      {Qmax > 0 && Qmax < Qtop && (
        <g>
          <line x1={X(Qmax)} x2={X(Qmax)} y1={Tp} y2={H - B} stroke="#2e7d32" strokeDasharray="4 3" />
          <text x={X(Qmax) + (Qmax > 70 ? -4 : 4)} y={Tp + 11} className={T.t} textAnchor={Qmax > 70 ? 'end' : 'start'} fill="#2e7d32">máximo sin cavitar {es(Qmax, 0)} L/s</text>
        </g>
      )}
      <line x1={X(Q)} x2={X(Q)} y1={Y(a)} y2={Y(r)} stroke={a < r ? '#c0392b' : ink.strong} strokeWidth="2" />
      <circle cx={X(Q)} cy={Y(a)} r="5.5" fill="#1f6fa5" stroke="#fff" strokeWidth="2" />
      <circle cx={X(Q)} cy={Y(r)} r="4.5" fill="#c0392b" stroke="#fff" strokeWidth="2" />
      <text x={X(Q) + (Q > 70 ? -9 : 9)} y={(Y(a) + Y(r)) / 2 + 3} className={T.t} textAnchor={Q > 70 ? 'end' : 'start'} fill={ink.strong} fontWeight="700">
        margen {es(a - r, 2)} m
      </text>
      {[0, 25, 50, 75, 100].map((q, j) => (
        <text key={q} x={X(q)} y={H - 8} className={T.t} textAnchor={j === 0 ? 'start' : j === 4 ? 'end' : 'middle'} fill={ink.soft}>
          {j === 4 ? '100 L/s' : q}
        </text>
      ))}
      {[yMin, 0, yMax].filter((v, k, s) => s.indexOf(v) === k).map((v) => (
        <text key={v} x={L - 4} y={Y(v) + 3} className={T.t} textAnchor="end" fill={ink.soft}>{es(v, 0)}</text>
      ))}
      <text x={4} y={12} className={T.t} fill={ink.soft}>m</text>
      <g transform={`translate(${L + 14} 12)`}>
        <line x1={0} x2={16} y1={0} y2={0} stroke="#1f6fa5" strokeWidth="2.4" />
        <text x={20} y={3} className={T.t} fill={ink.mid}>disponible</text>
        <line x1={90} x2={106} y1={0} y2={0} stroke="#c0392b" strokeWidth="2" strokeDasharray="6 3" />
        <text x={110} y={3} className={T.t} fill={ink.mid}>requerido por la bomba</text>
      </g>
    </svg>
  );
}

/** Curva de duración del río: el caudal que se deja, lo que se turbina (sombreado) y la época de ahora. */
export function FdcChart({ Q50, Qd, Qeco, p, W = 560, H = 200, cls = 'hc-hud-svg' }: { Q50: number; Qd: number; Qeco: number; p: number; W?: number; H?: number; cls?: string }) {
  const L = 38, R = 14, Tp = 22, B = 24;
  const ps = Array.from({ length: 99 }, (_, k) => (k + 1) / 100);
  const q = ps.map((x) => fdc(Q50, x));
  const yMax = Math.max(Qd + Qeco, Q50) * 2.6;
  const X = (x: number) => L + x * (W - L - R);
  const Y = (v: number) => H - B - (Math.min(v, yMax) / yMax) * (H - Tp - B);
  const river = ps.map((x, k) => `${X(x).toFixed(1)},${Y(q[k]).toFixed(1)}`).join(' ');
  const top = ps.map((x, k) => `${X(x).toFixed(1)},${Y(Math.max(Qeco, Math.min(q[k], Qd + Qeco))).toFixed(1)}`).join(' ');
  const bottom = ps.map((x) => `${X(x).toFixed(1)},${Y(Qeco).toFixed(1)}`).reverse().join(' ');
  const qNow = fdc(Q50, p);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Curva de duración del río; hoy trae ${es(qNow, 2)} m³/s`}>
      <rect x={L} y={Tp} width={W - L - R} height={H - Tp - B} rx="4" fill="#f5f8fb" />
      <polygon points={`${X(0.01)},${Y(0)} ${river} ${X(0.99)},${Y(0)}`} fill="#4fa3d8" fillOpacity="0.14" />
      <polygon points={`${top} ${bottom}`} fill="#e0a526" fillOpacity="0.45" />
      <polyline points={river} fill="none" stroke="#1f6fa5" strokeWidth="2.2" strokeLinejoin="round" />
      <line x1={L} x2={W - R} y1={Y(Qeco)} y2={Y(Qeco)} stroke="#2e7d32" strokeWidth="1.4" />
      <text x={W - R - 4} y={Y(Qeco) - 4} className={T.t} textAnchor="end" fill="#2e7d32">se deja en el río {es(Qeco, 2)}</text>
      <line x1={L} x2={W - R} y1={Y(Qd + Qeco)} y2={Y(Qd + Qeco)} stroke="#a3740f" strokeDasharray="5 3" />
      <text x={W - R - 4} y={Y(Qd + Qeco) - 4} className={T.t} textAnchor="end" fill="#8a610c">turbina llena</text>
      <line x1={X(p)} x2={X(p)} y1={Tp} y2={H - B} stroke={ink.strong} strokeWidth="1.5" />
      <circle cx={X(p)} cy={Y(qNow)} r="5.5" fill="#1f6fa5" stroke="#fff" strokeWidth="2" />
      <text x={X(p) + (p > 0.7 ? -8 : 8)} y={Math.max(Tp + 12, Y(qNow) - 8)} className={T.t} textAnchor={p > 0.7 ? 'end' : 'start'} fill={ink.strong} fontWeight="700">hoy {es(qNow, 2)} m³/s</text>
      {[0, 0.25, 0.5, 0.75, 1].map((x, j) => (
        <text key={j} x={X(x)} y={H - 8} className={T.t} textAnchor={j === 0 ? 'start' : j === 4 ? 'end' : 'middle'} fill={ink.soft}>
          {j === 4 ? '100 % del año' : `${x * 100} %`}
        </text>
      ))}
      {[0, yMax / 2, yMax].map((v) => (
        <text key={v} x={L - 4} y={Y(v) + 3} className={T.t} textAnchor="end" fill={ink.soft}>{es(v, 1)}</text>
      ))}
      <text x={4} y={12} className={T.t} fill={ink.soft}>m³/s</text>
      <g transform={`translate(${L + 14} 12)`}>
        <line x1={0} x2={16} y1={0} y2={0} stroke="#1f6fa5" strokeWidth="2.2" />
        <text x={20} y={3} className={T.t} fill={ink.mid}>caudal del río</text>
        <rect x={104} y={-4} width={12} height={8} fill="#e0a526" fillOpacity="0.6" />
        <text x={120} y={3} className={T.t} fill={ink.mid}>se turbina</text>
      </g>
    </svg>
  );
}

/** Esquema de la estación de bombeo para la vista sin 3D. */
export function PumpSection({ Hs, Q, Hd: H, flows, arr, W = 520, Ht = 240, cls = 'hc-exp-svg cu-svg' }: { Hs: number; Q: number; Hd: number; flows: boolean; arr: Arrangement; W?: number; Ht?: number; cls?: string }) {
  const s = (Ht - 70) / 50;
  const yb = Ht - 30, yt = yb - Hs * s;
  return (
    <svg viewBox={`0 0 ${W} ${Ht}`} className={cls} role="img" aria-label={`Estación de bombeo: ${flows ? `${es(Q, 1)} L/s hasta ${es(Hs, 0)} m` : 'la bomba no alcanza'}`}>
      <path d={`M0 ${yb + 6} L${W * 0.4} ${yb + 6} L${W * 0.82} ${yt + 18} L${W} ${yt + 18} L${W} ${Ht} L0 ${Ht} Z`} fill="#c9d7b9" />
      <rect x="22" y={yb - 26} width="70" height="32" rx="3" fill="#cfd8df" stroke="#7a8a97" />
      <rect x="24" y={yb - 16} width="66" height="20" fill="#4fa3d8" fillOpacity="0.7" />
      <text x="57" y={yb + 22} className="lz-s" textAnchor="middle" fill={ink.mid}>tanque bajo</text>
      {(arr === 'una' ? [0] : [0, 1]).map((k) => (
        <g key={k} transform={`translate(${118 + (arr === 'serie' ? k * 44 : 0)} ${yb - 14 - (arr === 'paralelo' ? k * 24 : 0)})`}>
          <circle r="11" fill="#2f6e9e" stroke="#17324d" />
          <circle r="4" fill="#cfe6f5" />
        </g>
      ))}
      <path d={`M92 ${yb - 14} L110 ${yb - 14} M${arr === 'serie' ? 173 : 129} ${yb - 14} L${W * 0.4} ${yb - 14} L${W * 0.8} ${yt - 4} L${W - 70} ${yt - 4}`} fill="none" stroke={flows ? '#1f6fa5' : '#9aa3ab'} strokeWidth="5" strokeLinecap="round" />
      <rect x={W - 74} y={yt - 30} width="58" height="40" rx="3" fill="#cfd8df" stroke="#7a8a97" />
      <rect x={W - 72} y={yt - 12} width="54" height="20" fill="#4fa3d8" fillOpacity="0.7" />
      <text x={W - 45} y={yt - 36} className="lz-s" textAnchor="middle" fill={ink.mid}>tanque alto</text>
      <line x1={W - 12} x2={W - 12} y1={yt} y2={yb - 10} stroke={ink.strong} markerEnd="" />
      <text x={W - 16} y={(yt + yb) / 2} className="lz-s" textAnchor="end" fill={ink.strong}>{es(Hs, 0)} m</text>
      <text x="120" y="22" className="lz-s" fill={ink.strong} fontWeight="700">{flows ? `${es(Q, 1)} L/s · la bomba da ${es(H, 1)} m` : 'La bomba no alcanza la altura del tanque'}</text>
    </svg>
  );
}

/** Esquema de la succión para la vista sin 3D: nivel del agua, eje de la bomba y presiones. */
export function CavSection({ zs, margin, W = 520, H = 240, cls = 'hc-exp-svg cu-svg' }: { zs: number; margin: number; W?: number; H?: number; cls?: string }) {
  const s = 16, axis = 120, water = axis - zs * s;
  const ok = margin >= 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`El agua está ${zs >= 0 ? `${es(zs, 1)} m por encima` : `${es(-zs, 1)} m por debajo`} del eje de la bomba; margen de NPSH ${es(margin, 2)} m`}>
      <rect x="30" y={Math.min(H - 20, Math.max(20, water))} width="170" height={H - 10 - Math.min(H - 20, Math.max(20, water))} fill="#4fa3d8" fillOpacity="0.55" />
      <line x1="30" x2="200" y1={water} y2={water} stroke="#1f6fa5" strokeWidth="2" />
      <path d={`M110 ${H - 30} L110 ${axis} L300 ${axis}`} fill="none" stroke="#7a8a97" strokeWidth="9" strokeLinejoin="round" />
      <circle cx="320" cy={axis} r="26" fill={ok ? '#2f6e9e' : '#8e3b2e'} stroke="#17324d" />
      {!ok && [0, 1, 2, 3, 4].map((k) => <circle key={k} cx={306 + k * 6} cy={axis - 8 + (k % 2) * 12} r="3" fill="#fff" fillOpacity="0.85" />)}
      <line x1="240" x2="420" y1={axis} y2={axis} stroke={ink.strong} strokeDasharray="3 3" />
      <text x="424" y={axis + 3} className="lz-s" fill={ink.strong}>eje de la bomba</text>
      <text x="40" y={Math.max(14, water - 6)} className="lz-s" fill="#1f6fa5">nivel del agua ({zs >= 0 ? '+' : '−'}{es(Math.abs(zs), 1)} m)</text>
      <text x="300" y="30" className="lz-s" fill={ok ? '#2e7d32' : '#9b2c22'} fontWeight="700">{ok ? `No cavita · margen ${es(margin, 2)} m` : `Cavita · faltan ${es(-margin, 2)} m`}</text>
    </svg>
  );
}

/** Esquema de la central para la vista sin 3D. */
export function HydroSection({ Hg, P, Qt, W = 520, H = 240, cls = 'hc-exp-svg cu-svg' }: { Hg: number; P: number; Qt: number; W?: number; H?: number; cls?: string }) {
  const top = 40, bot = H - 40;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Central de pasada con ${es(Hg, 0)} m de caída: ${es(P, 0)} kW con ${es(Qt, 2)} m³/s`}>
      <path d={`M0 ${top + 10} L120 ${top + 10} L380 ${bot - 4} L${W} ${bot - 4} L${W} ${H} L0 ${H} Z`} fill="#b9c9a6" />
      <path d={`M0 ${top + 6} L120 ${top + 6}`} stroke="#4fa3d8" strokeWidth="6" />
      <rect x="112" y={top - 6} width="16" height="16" fill="#9aa3ab" />
      <path d={`M128 ${top + 4} L360 ${bot - 22}`} stroke="#5e6a73" strokeWidth="7" strokeLinecap="round" />
      <rect x="352" y={bot - 44} width="58" height="40" rx="3" fill="#e6e1d6" stroke="#7a8a97" />
      <circle cx="381" cy={bot - 22} r="11" fill="#c08a2b" />
      <path d={`M410 ${bot - 6} L${W} ${bot - 6}`} stroke="#4fa3d8" strokeWidth="5" />
      <line x1={W - 20} x2={W - 20} y1={top + 6} y2={bot - 6} stroke={ink.strong} />
      <text x={W - 24} y={(top + bot) / 2} className="lz-s" textAnchor="end" fill={ink.strong}>{es(Hg, 0)} m de caída</text>
      <text x="140" y="24" className="lz-s" fill={ink.strong} fontWeight="700">{P > 0 ? `${es(P, 0)} kW con ${es(Qt, 2)} m³/s` : 'La turbina está parada: no le llega agua suficiente'}</text>
    </svg>
  );
}

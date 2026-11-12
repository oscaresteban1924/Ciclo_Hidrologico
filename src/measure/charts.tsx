// Gráficas de la sala «Medir el agua»: el aguacero con lo que registra el balancín, la sección del río con sus
// verticales y velocidades, la curva de gasto con los aforos, y las alturas de los piezómetros en el banco de
// tuberías. También sirven como vista plana sin 3D.

import { useId } from 'react';
import { es } from '../canals/common';
import { BED, BANK, GAUGINGS, bedZ, pointVelocity, ratingQ, trueFlow, type Rating, type Storm, type Vertical } from './measure';
import { DBZ_COLORS } from './scene';

const T = { t: 'hc-hud-t' };
const ink = { soft: '#5b6b78', mid: '#3c4b57', strong: '#17324d' };

/** Intensidad real y registrada durante el aguacero, con lo acumulado; `k` marca el instante. */
export function StormChart({ s, k = null, W = 560, H = 200, cls = 'hc-hud-svg' }: { s: Storm; k?: number | null; W?: number; H?: number; cls?: string }) {
  const uid = useId().replace(/:/g, '');
  const L = 38, R = 44, Tp = 22, B = 24;
  const Imax = Math.max(10, ...s.I) * 1.15;
  const X = (t: number) => L + t * (W - L - R);
  const Y = (v: number) => H - B - (Math.min(v, Imax) / Imax) * (H - Tp - B);
  const Pmax = Math.max(1, s.total) * 1.1;
  const Yp = (v: number) => H - B - (v / Pmax) * (H - Tp - B);
  const n = s.t.length - 1;
  // registrada: vuelcos por intervalo de 5 minutos convertidos a mm/h
  const bins = 12;
  const bars = Array.from({ length: bins }, (_, b) => {
    const i0 = Math.round((b / bins) * n), i1 = Math.round(((b + 1) / bins) * n);
    return ((s.tips[i1] - s.tips[i0]) * 0.2) / (1 / bins);
  });
  const until = k === null ? n : k;
  const line = (vals: number[], f: (v: number) => number) => s.t.slice(0, until + 1).map((t, j) => `${X(t).toFixed(1)},${f(vals[j]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Aguacero de ${es(s.total, 1)} mm; el balancín registra ${es(s.totalM, 1)} mm`}>
      <defs>
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f7fb8" stopOpacity="0.28" />
          <stop offset="1" stopColor="#2f7fb8" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <rect x={L} y={Tp} width={W - L - R} height={H - Tp - B} rx="4" fill="#f5f8fb" />
      {bars.map((v, b) => {
        const shown = k === null || (b + 1) / bins <= s.t[until] + 1e-9;
        return shown ? <rect key={b} x={X(b / bins) + 2} y={Y(v)} width={(W - L - R) / bins - 4} height={Math.max(0, Y(0) - Y(v))} rx="2" fill="#9cc7e4" /> : null;
      })}
      <polygon points={`${X(0)},${Y(0)} ${line(s.I, Y)} ${X(s.t[until])},${Y(0)}`} fill={`url(#${uid}g)`} />
      <polyline points={line(s.I, Y)} fill="none" stroke="#1f6fa5" strokeWidth="2" />
      <polyline points={line(s.P, Yp)} fill="none" stroke="#17324d" strokeWidth="1.6" strokeDasharray="5 3" />
      <polyline points={line(s.Pm, Yp)} fill="none" stroke="#c0632b" strokeWidth="1.8" />
      {k !== null && <line x1={X(s.t[k])} x2={X(s.t[k])} y1={Tp} y2={H - B} stroke={ink.strong} strokeWidth="1.2" />}
      {[0, 15, 30, 45, 60].map((m, j) => (
        <text key={m} x={X(m / 60)} y={H - 8} className={T.t} textAnchor={j === 0 ? 'start' : j === 4 ? 'end' : 'middle'} fill={ink.soft}>
          {j === 4 ? '60 min' : m}
        </text>
      ))}
      {[0, Imax / 2, Imax].map((v) => (
        <text key={v} x={L - 4} y={Y(v) + 3} className={T.t} textAnchor="end" fill={ink.soft}>{es(v, 0)}</text>
      ))}
      {[0, Pmax / 2, Pmax].map((v) => (
        <text key={v} x={W - R + 4} y={Yp(v) + 3} className={T.t} fill={ink.soft}>{es(v, 0)}</text>
      ))}
      <text x={4} y={12} className={T.t} fill={ink.soft}>mm/h</text>
      <text x={W - 4} y={12} className={T.t} textAnchor="end" fill={ink.soft}>mm acumulados</text>
      <g transform={`translate(${L + 10} 12)`}>
        <line x1={0} x2={14} y1={0} y2={0} stroke="#1f6fa5" strokeWidth="2" />
        <text x={18} y={3} className={T.t} fill={ink.mid}>lluvia real</text>
        <rect x={80} y={-4} width={10} height={8} fill="#9cc7e4" />
        <text x={94} y={3} className={T.t} fill={ink.mid}>vuelcos cada 5 min</text>
        <line x1={200} x2={214} y1={0} y2={0} stroke="#c0632b" strokeWidth="1.8" />
        <text x={218} y={3} className={T.t} fill={ink.mid}>registrada</text>
      </g>
    </svg>
  );
}

/** Barra de colores del radar con la lectura de ahora. */
export function DbzScale({ dbz, W = 560, H = 46, cls = 'hc-hud-svg' }: { dbz: number; W?: number; H?: number; cls?: string }) {
  const L = 10, R = 10, lo = 0, hi = 70;
  const X = (d: number) => L + ((d - lo) / (hi - lo)) * (W - L - R);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Reflectividad ${es(dbz, 1)} dBZ`}>
      {DBZ_COLORS.map(([v, c], k) => (
        <rect key={v} x={X(v)} y={14} width={X(DBZ_COLORS[k + 1]?.[0] ?? hi) - X(v)} height={12} fill={c} />
      ))}
      <path d={`M${X(dbz)} 12 l-5 -8 h10z`} fill={ink.strong} />
      {[10, 20, 30, 40, 50, 60].map((v) => (
        <text key={v} x={X(v)} y={40} className={T.t} textAnchor="middle" fill={ink.soft}>{v}</text>
      ))}
      <text x={W - R} y={40} className={T.t} textAnchor="end" fill={ink.soft}>dBZ</text>
    </svg>
  );
}

/** Sección del río con el agua, las velocidades (colores) y las verticales del aforo. */
export function SectionChart({ h, verts, W = 560, H = 210, cls = 'hc-hud-svg' }: { h: number; verts: Vertical[]; W?: number; H?: number; cls?: string }) {
  const L = 34, R = 10, Tp = 16, B = 22;
  const x0 = -22, x1 = 22, z0 = 0, z1 = Math.max(4, h + 0.4);
  const X = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const Y = (z: number) => H - B - ((z - z0) / (z1 - z0)) * (H - Tp - B);
  const bed = BED.filter(([x]) => x >= x0 - 30).map(([x, z]) => `${X(Math.max(x0, Math.min(x1, x))).toFixed(1)},${Y(z).toFixed(1)}`).join(' ');
  // franjas de velocidad: colores de lento (claro) a rápido (azul oscuro)
  const vmax = Math.max(0.2, trueFlow(h).Q / Math.max(1, trueFlow(h).A) * 1.8);
  const cells: { x: number; y: number; w: number; hh: number; c: string }[] = [];
  const nx = 72, ny = 10;
  for (let i = 0; i < nx; i++) {
    const xa = x0 + ((i + 0.5) * (x1 - x0)) / nx;
    const d = h - bedZ(xa);
    if (d <= 0) continue;
    for (let j = 0; j < ny; j++) {
      const y = ((j + 0.5) / ny) * d;
      const u = pointVelocity(xa, y, h) / vmax;
      const c = `hsl(${205 - Math.min(1, u) * 10}, ${55 + Math.min(1, u) * 30}%, ${92 - Math.min(1, u) * 52}%)`;
      cells.push({ x: X(xa - (x1 - x0) / nx / 2), y: Y(bedZ(xa) + ((j + 1) / ny) * d), w: (W - L - R) / nx + 0.6, hh: (Y(0) - Y(d / ny)) + 0.6, c });
    }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Sección del río con el agua a ${es(h, 2)} m y ${verts.length} verticales`}>
      <rect x={L} y={Tp} width={W - L - R} height={H - Tp - B} rx="4" fill="#f5f8fb" />
      {cells.map((c, k) => (
        <rect key={k} x={c.x} y={c.y} width={c.w} height={c.hh} fill={c.c} />
      ))}
      <polygon points={`${X(x0)},${Y(z0)} ${bed} ${X(x1)},${Y(z0)}`} fill="#a08a6a" />
      <polyline points={bed} fill="none" stroke="#6d5a42" strokeWidth="1.5" />
      <line x1={X(x0)} x2={X(x1)} y1={Y(h)} y2={Y(h)} stroke="#1f6fa5" strokeWidth="1.6" />
      <line x1={X(x0)} x2={X(x1)} y1={Y(BANK)} y2={Y(BANK)} stroke="#2e7d32" strokeDasharray="3 4" strokeOpacity="0.6" />
      <text x={X(x1) - 4} y={Y(BANK) - 4} className={T.t} textAnchor="end" fill="#2e7d32">orilla</text>
      {verts.map((v, k) => (
        <g key={k}>
          <line x1={X(v.x)} x2={X(v.x)} y1={Y(h)} y2={Y(h - v.d)} stroke="#17324d" strokeWidth="1" />
          <circle cx={X(v.x)} cy={Y(h - 0.6 * v.d)} r="2.4" fill="#e0a526" stroke="#17324d" strokeWidth="0.8" />
        </g>
      ))}
      {[0, 1, 2, 3, 4].filter((z) => z <= z1).map((z) => (
        <text key={z} x={L - 4} y={Y(z) + 3} className={T.t} textAnchor="end" fill={ink.soft}>{z}</text>
      ))}
      <text x={4} y={12} className={T.t} fill={ink.soft}>m en la regla</text>
      <text x={W - R} y={12} className={T.t} textAnchor="end" fill={ink.soft}>más oscuro = más rápido</text>
    </svg>
  );
}

/** Curva de gasto: los aforos, la curva con el h0 elegido, la mejor y el nivel de ahora con su caudal verdadero. */
export function RatingChart({ fit, best, h, W = 560, H = 210, cls = 'hc-hud-svg' }: { fit: Rating; best: Rating; h: number; W?: number; H?: number; cls?: string }) {
  const L = 40, R = 12, Tp = 22, B = 24;
  const hTop = Math.max(3.8, h + 0.2), Qtop = Math.max(...[trueFlow(hTop).Q, ratingQ(best, hTop)]) * 1.05;
  const X = (q: number) => L + (Math.max(0, q) / Qtop) * (W - L - R);
  const Y = (z: number) => H - B - (z / hTop) * (H - Tp - B);
  const hs = Array.from({ length: 80 }, (_, k) => 0.36 + (k / 79) * (hTop - 0.36));
  const curve = (r: Rating) => (r.ok ? hs.filter((z) => z > r.h0).map((z) => `${X(Math.min(Qtop, ratingQ(r, z))).toFixed(1)},${Y(z).toFixed(1)}`).join(' ') : '');
  const truth = hs.map((z) => `${X(trueFlow(z).Q).toFixed(1)},${Y(z).toFixed(1)}`).join(' ');
  const hmax = Math.max(...GAUGINGS.map((g) => g.h));
  const qt = trueFlow(h).Q, qc = ratingQ(fit, h);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Curva de gasto; con ${es(h, 2)} m pasan ${es(qt, 1)} m³/s`}>
      <rect x={L} y={Tp} width={W - L - R} height={H - Tp - B} rx="4" fill="#f5f8fb" />
      <rect x={L} y={Tp} width={W - L - R} height={Math.max(0, Y(hmax) - Tp)} fill="#e0a526" fillOpacity="0.08" />
      <text x={W - R - 4} y={Tp + 11} className={T.t} textAnchor="end" fill="#8a610c">más arriba del aforo más alto: extrapolación</text>
      <line x1={L} x2={W - R} y1={Y(BANK)} y2={Y(BANK)} stroke="#2e7d32" strokeDasharray="3 4" strokeOpacity="0.6" />
      <polyline points={truth} fill="none" stroke="#9aa6b0" strokeWidth="1.2" strokeDasharray="2 3" />
      <polyline points={curve(best)} fill="none" stroke="#2e7d32" strokeWidth="1.4" strokeDasharray="6 4" />
      <polyline points={curve(fit)} fill="none" stroke="#1f6fa5" strokeWidth="2.2" />
      {GAUGINGS.map((g, k) => (
        <circle key={k} cx={X(g.Q)} cy={Y(g.h)} r="3.6" fill="#ffffff" stroke="#c0632b" strokeWidth="2" />
      ))}
      <line x1={L} x2={W - R} y1={Y(h)} y2={Y(h)} stroke={ink.strong} strokeDasharray="2 3" />
      <circle cx={X(qt)} cy={Y(h)} r="5" fill={ink.strong} stroke="#fff" strokeWidth="2" />
      {fit.ok && <circle cx={X(Math.min(Qtop, qc))} cy={Y(h)} r="4" fill="#1f6fa5" stroke="#fff" strokeWidth="1.5" />}
      <text x={X(qt) + (qt > Qtop * 0.6 ? -8 : 8)} y={Y(h) - 7} className={T.t} textAnchor={qt > Qtop * 0.6 ? 'end' : 'start'} fill={ink.strong} fontWeight="700">
        {es(h, 2)} m: {es(qt, 1)} m³/s
      </text>
      {[0, 0.5, 1].map((u) => (
        <text key={u} x={X(u * Qtop)} y={H - 8} className={T.t} textAnchor={u === 0 ? 'start' : u === 1 ? 'end' : 'middle'} fill={ink.soft}>
          {u === 1 ? `${es(Qtop, 0)} m³/s` : es(u * Qtop, 0)}
        </text>
      ))}
      {[0, 1, 2, 3].filter((z) => z <= hTop).map((z) => (
        <text key={z} x={L - 4} y={Y(z) + 3} className={T.t} textAnchor="end" fill={ink.soft}>{z}</text>
      ))}
      <text x={4} y={12} className={T.t} fill={ink.soft}>m</text>
      <g transform={`translate(${L + 10} ${H - B - 10})`}>
        <circle cx={4} cy={0} r="3.2" fill="#fff" stroke="#c0632b" strokeWidth="1.8" />
        <text x={12} y={3} className={T.t} fill={ink.mid}>aforos</text>
        <line x1={58} x2={72} y1={0} y2={0} stroke="#1f6fa5" strokeWidth="2.2" />
        <text x={76} y={3} className={T.t} fill={ink.mid}>curva con tu h0</text>
        <line x1={160} x2={174} y1={0} y2={0} stroke="#2e7d32" strokeWidth="1.4" strokeDasharray="6 4" />
        <text x={178} y={3} className={T.t} fill={ink.mid}>mejor curva</text>
      </g>
    </svg>
  );
}

const PIEZO_X = [0.08, 0.2, 0.36, 0.56, 0.68, 0.86];
const PIEZO_N = ['entrada', 'garganta', 'salida', 'antes', 'orificio', 'después'];

/** Banco de tuberías: el Venturi, la placa y la altura del agua en los seis piezómetros. */
export function PiezoChart({ p, beta, W = 560, H = 210, cls = 'hc-hud-svg' }: { p: number[]; beta: number; W?: number; H?: number; cls?: string }) {
  const L = 34, R = 10, Tp = 18, B = 34;
  const top = Math.max(10, Math.ceil(Math.max(...p) + 1));
  const lo = Math.min(-2, Math.floor(Math.min(...p)) - 1);
  const pipeY = H - B - 14;
  const X = (u: number) => L + u * (W - L - R);
  const Y = (v: number) => pipeY - ((v - 0) / (top - 0)) * (pipeY - Tp);
  const rr = 8, th = rr * beta;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Piezómetros: ${p.map((v, k) => `${PIEZO_N[k]} ${es(v, 2)} m`).join(', ')}`}>
      <rect x={L} y={Tp} width={W - L - R} height={pipeY - Tp} rx="4" fill="#f5f8fb" />
      {/* tubería con el Venturi y la placa */}
      <path d={`M${X(0)} ${pipeY - rr} H${X(0.14)} L${X(0.2)} ${pipeY - th} L${X(0.24)} ${pipeY - th} L${X(0.42)} ${pipeY - rr} H${X(1)} V${pipeY + rr} H${X(0.42)} L${X(0.24)} ${pipeY + th} L${X(0.2)} ${pipeY + th} L${X(0.14)} ${pipeY + rr} H${X(0)} Z`} fill="#cfe6f5" stroke="#5d7487" strokeWidth="1.2" />
      <line x1={X(0.62)} x2={X(0.62)} y1={pipeY - rr} y2={pipeY - th} stroke="#3e4a55" strokeWidth="3" />
      <line x1={X(0.62)} x2={X(0.62)} y1={pipeY + th} y2={pipeY + rr} stroke="#3e4a55" strokeWidth="3" />
      {p.map((v, k) => {
        const neg = v < 0;
        return (
          <g key={k}>
            <rect x={X(PIEZO_X[k]) - 3} y={Y(top)} width={6} height={pipeY - rr - Y(top)} fill="#ffffff" stroke="#9fb3c2" strokeWidth="0.8" />
            {!neg && <rect x={X(PIEZO_X[k]) - 2.2} y={Y(v)} width={4.4} height={Math.max(0, pipeY - rr - Y(v))} fill="#2f84b5" />}
            <text x={X(PIEZO_X[k])} y={neg ? pipeY - rr - 4 : Y(v) - 4} className={T.t} textAnchor="middle" fill={neg ? '#9b2c22' : ink.strong} fontWeight="700">
              {es(v, 2)}
            </text>
            <text x={X(PIEZO_X[k])} y={H - 6} className={T.t} textAnchor="middle" fill={ink.soft}>{PIEZO_N[k]}</text>
          </g>
        );
      })}
      <polyline points={p.map((v, k) => `${X(PIEZO_X[k]).toFixed(1)},${Y(Math.max(lo, v)).toFixed(1)}`).join(' ')} fill="none" stroke="#c0632b" strokeWidth="1.2" strokeDasharray="4 3" />
      {[0, top / 2, top].map((v) => (
        <text key={v} x={L - 4} y={Y(v) + 3} className={T.t} textAnchor="end" fill={ink.soft}>{es(v, 0)}</text>
      ))}
      <text x={4} y={12} className={T.t} fill={ink.soft}>m de agua sobre la atmósfera</text>
    </svg>
  );
}

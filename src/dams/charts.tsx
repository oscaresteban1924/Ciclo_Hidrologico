// Gráficas y esquemas de la sala «Presas y embalses»: los hidrogramas que entran y salen del embalse, el perfil del
// vertedero con el agua y el resalto, y la sección de la presa de gravedad con sus fuerzas y los esfuerzos en la base.

import { es } from '../canals/common';
import { wesTangent, wesY, type GravityDam, type RoutingResult, type StabilityResult } from './dam';

const AXC = '#5b6b78', INK = '#3c4b57';

/** Creciente que entra y que sale del embalse, con el instante actual. */
export function RoutingChart({ res, k, W = 560, H = 210, cls = 'hc-hud-svg' }: { res: RoutingResult; k: number | null; W?: number; H?: number; cls?: string }) {
  const L = 40, R = 10, top = 20, B = 22;
  const tMax = res.t[res.t.length - 1];
  const qMax = Math.max(...res.I, ...res.O) * 1.1;
  const X = (t: number) => L + (t / tMax) * (W - L - R);
  const Y = (q: number) => H - B - (q / qMax) * (H - B - top);
  const line = (a: number[]) => res.t.map((t, i) => `${X(t).toFixed(1)},${Y(a[i]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Creciente: entra un pico de ${es(res.Ipeak, 0)} m³/s y sale uno de ${es(res.Opeak, 0)} m³/s.`}>
      <rect x={L} y={top} width={W - L - R} height={H - B - top} fill="#f7fafc" />
      <polygon points={`${X(0)},${Y(0)} ${line(res.I)} ${X(tMax)},${Y(0)}`} fill="#dceefa" opacity="0.7" />
      <polyline points={line(res.I)} fill="none" stroke="#8a96a0" strokeWidth="1.6" strokeDasharray="5 3" />
      <polyline points={line(res.O)} fill="none" stroke="#1f78b4" strokeWidth="2.2" />
      <circle cx={X(res.tOpeak)} cy={Y(res.Opeak)} r="3.5" fill="#1f78b4" />
      {k !== null && <line x1={X(res.t[k])} x2={X(res.t[k])} y1={top} y2={H - B} stroke="#17324d" strokeWidth="1.3" />}
      {[0, 12, 24, 36, 48].filter((t) => t <= tMax).map((t, i, a) => (
        <text key={t} x={X(t)} y={H - 7} className="hc-hud-t" textAnchor={i === a.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fill={AXC}>{i === a.length - 1 ? `${t} h` : t}</text>
      ))}
      <text x={L - 4} y={Y(qMax / 1.1) + 3} className="hc-hud-t" textAnchor="end" fill={AXC}>{es(qMax / 1.1, 0)}</text>
      <text x={L - 4} y={Y(0) + 3} className="hc-hud-t" textAnchor="end" fill={AXC}>0</text>
      <text x={4} y={12} className="hc-hud-t" fill={AXC}>m³/s</text>
      <g transform={`translate(${L + 60} 11)`}>
        <line x1={0} x2={12} y1={-3} y2={-3} stroke="#8a96a0" strokeDasharray="4 2" />
        <text x={15} y={1} className="hc-hud-t" fill={INK}>entra al embalse</text>
        <line x1={110} x2={122} y1={-3} y2={-3} stroke="#1f78b4" strokeWidth="2" />
        <text x={125} y={1} className="hc-hud-t" fill={INK}>sale por el vertedero</text>
        <rect x={238} y={-8} width={11} height={9} fill="#dceefa" />
        <text x={252} y={1} className="hc-hud-t" fill={INK}>volumen de la creciente</text>
      </g>
    </svg>
  );
}

/** Perfil del vertedero: cresta WES, rápida, pozo y el agua, con el resalto en el pozo o fuera. */
export function SpillChart({ H, Hd, q, y1, y2, tw, D, P, W = 560, Ht: Hc = 210, cls = 'hc-hud-svg' }: { H: number; Hd: number; q: number; y1: number; y2: number; tw: number; D: number; P: number; W?: number; Ht?: number; cls?: string }) {
  const L = 34, R = 10, top = 18, B = 22;
  const tg = wesTangent(Hd, 0.75);
  const toe = tg.x + (P - tg.y + D) * 0.75, Lb = 6 * y2;
  const inBasin = tw + D >= y2;
  // fuera del pozo, el chorro rápido sigue por el río y el resalto se forma más abajo, hasta el agua del río
  const jx = inBasin ? toe : toe + Lb + 0.4 * Lb, jEnd = jx + (inBasin ? 0.6 * Lb : 6 * tw);
  const x0 = -12, x1 = Math.max(toe + Lb + 20, jEnd + 12), y0 = -D - 2, y1v = P + H + 4;
  const s = Math.min((W - L - R) / (x1 - x0), (Hc - B - top) / (y1v - y0));
  const X = (x: number) => L + (x - x0) * s, Y = (y: number) => Hc - B - (y - y0) * s;
  const prof: [number, number][] = [[-2, -D], [-2, P], [0, P]];
  for (let k = 1; k <= 16; k++) prof.push([(k / 16) * tg.x, P - wesY((k / 16) * tg.x, Hd)]);
  prof.push([toe, -D], [toe + Lb, -D], [toe + Lb, 0], [x1, 0], [x1, y0], [x0, y0], [x0, -D]);
  const crest: [number, number][] = [[x0, P + H], [0, P + H * 0.75], [tg.x * 0.5, P - wesY(tg.x * 0.5, Hd) + Math.max(y1, 0.6 * H)], [tg.x, P - tg.y + y1 * 1.5]];
  const water: [number, number][] = inBasin
    ? [...crest, [toe, -D + y1], [toe + 0.08 * Lb, -D + y1], [jEnd, tw], [x1, tw]]
    : [...crest, [toe, -D + y1], [toe + Lb, -D + y1], [toe + Lb + 1, y1], [jx, y1 * 1.15], [jEnd, tw], [x1, tw]];
  const jLabel = Math.min(W - R - 50, Math.max(L + 50, X((jx + jEnd) / 2)));
  return (
    <svg viewBox={`0 0 ${W} ${Hc}`} className={cls} role="img" aria-label={`Vertedero: ${es(H, 2)} m sobre la cresta, ${es(q, 1)} m²/s por metro; el resalto ${inBasin ? 'queda en el pozo' : 'se sale del pozo'}.`}>
      <polyline points={water.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')} fill="none" stroke="#1f78b4" strokeWidth="2.2" />
      <polygon points={prof.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')} fill="#cfcac0" stroke="#7d7568" strokeWidth="1" />
      <line x1={X(toe + Lb)} x2={X(x1)} y1={Y(tw)} y2={Y(tw)} stroke="#1f78b4" strokeDasharray="4 3" />
      <text x={X(x1) - 2} y={Y(tw) - 4} className="hc-hud-t" textAnchor="end" fill="#1f5f8a">río {es(tw, 2)} m</text>
      <text x={X(0)} y={Y(P + H) - 5} className="hc-hud-t" fill="#1f5f8a">H = {es(H, 2)} m</text>
      <text x={jLabel} y={Y(Math.max(tw, -D + y2)) - 8} className="hc-hud-t" textAnchor="middle" fill={inBasin ? '#2e7d32' : '#c0392b'}>{inBasin ? 'resalto en el pozo' : 'el resalto se sale del pozo'}</text>
      <text x={4} y={12} className="hc-hud-t" fill={AXC}>corte del vertedero · misma escala en los dos ejes</text>
      <text x={X(toe)} y={Hc - 6} className="hc-hud-t" textAnchor="middle" fill={AXC}>pie</text>
      <text x={X(toe + Lb / 2)} y={Hc - 6} className="hc-hud-t" textAnchor="middle" fill={AXC}>pozo {es(Lb, 0)} m</text>
    </svg>
  );
}

/** Sección de la presa de gravedad con las fuerzas, la resultante, el tercio medio y los esfuerzos de la base. */
export function StabilityDiagram({ d, r, W = 560, H = 230, cls = 'hc-hud-svg' }: { d: GravityDam; r: StabilityResult; W?: number; H?: number; cls?: string }) {
  const L = 20, R = 20, top = 22, B = 82;
  const x0 = -d.H * 0.6, x1 = r.B + d.H * 0.4;
  const s = Math.min((W - L - R) / (x1 - x0), (H - B - top) / (d.H + 2));
  const X = (x: number) => L + (x - x0) * s, Y = (y: number) => H - B - y * s;
  const sMax = Math.max(1, Math.abs(r.sHeel), Math.abs(r.sToe));
  const ks = 40 / sMax;
  const big = Math.max(...r.forces.map((f) => Math.hypot(f.Fx, f.Fy)));
  const fk = (d.H * 0.5 * s) / big;
  const arrow = (x: number, y: number, fx: number, fy: number, color: string, key: string) => {
    const len = Math.hypot(fx, fy) * fk;
    if (len < 3) return null;
    const ux = fx / Math.hypot(fx, fy), uy = -fy / Math.hypot(fx, fy);
    // la fuerza llega al punto de aplicación (en pantalla, y hacia abajo)
    const ex = X(x), ey = Y(y), sx = ex - ux * len, sy = ey + uy * len;
    const ang = Math.atan2(ey - sy, ex - sx);
    return (
      <g key={key}>
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth="2.2" />
        <path d={`M${ex},${ey} l${-8 * Math.cos(ang - 0.4)},${-8 * Math.sin(ang - 0.4)} M${ex},${ey} l${-8 * Math.cos(ang + 0.4)},${-8 * Math.sin(ang + 0.4)}`} stroke={color} strokeWidth="2.2" fill="none" />
      </g>
    );
  };
  const colorOf = (n: string) => (n.startsWith('Peso') ? '#5b4630' : n === 'Subpresión' ? '#7b3fa0' : '#1f78b4');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Presa de gravedad: volcamiento ${es(r.FSo, 2)}, deslizamiento ${es(r.FSs, 2)}, resultante ${r.inThird ? 'en' : 'fuera del'} tercio medio.`}>
      {d.hw > 0 && <rect x={X(x0)} y={Y(d.hw)} width={X(0) - X(x0)} height={Y(0) - Y(d.hw)} fill="#9fc6e3" />}
      {d.tail > 0 && <polygon points={`${X(r.B - d.m * d.tail)},${Y(d.tail)} ${X(x1)},${Y(d.tail)} ${X(x1)},${Y(0)} ${X(r.B)},${Y(0)}`} fill="#9fc6e3" />}
      <polygon points={`${X(0)},${Y(0)} ${X(0)},${Y(d.H)} ${X(d.crest)},${Y(d.H)} ${X(r.B)},${Y(0)}`} fill="#cfcac0" stroke="#7d7568" />
      <line x1={X(x0)} x2={X(x1)} y1={Y(0)} y2={Y(0)} stroke="#5b4630" strokeWidth="2" />
      <rect x={X(r.B / 3)} y={Y(0) - 2} width={X((2 * r.B) / 3) - X(r.B / 3)} height={4} fill="#2e7d32" />
      <polygon points={`${X(0)},${Y(0) + 4} ${X(0)},${Y(0) + 4 + r.sHeel * ks} ${X(r.B)},${Y(0) + 4 + r.sToe * ks} ${X(r.B)},${Y(0) + 4}`} fill={r.sHeel < 0 ? '#f0b9ae' : '#b9d6ec'} stroke={r.sHeel < 0 ? '#c0392b' : '#2f84b5'} />
      <text x={X(0)} y={Y(0) + 4 + Math.max(0, r.sHeel * ks) + 13} className="hc-hud-t" fill={INK}>{es(r.sHeel, 0)} kPa</text>
      <text x={X(r.B)} y={Y(0) + 4 + Math.max(0, r.sToe * ks) + 13} className="hc-hud-t" textAnchor="end" fill={INK}>{es(r.sToe, 0)} kPa</text>
      {r.forces.map((f, k) => arrow(f.x, f.y, f.Fx, f.Fy, colorOf(f.name), `f${k}`))}
      {arrow(r.xR, 0, r.Hsum, r.V, r.inThird ? '#2e7d32' : '#c0392b', 'res')}
      <text x={X(r.B / 2)} y={Y(0) + 4 + Math.max(0, r.sHeel * ks, r.sToe * ks) + 28} className="hc-hud-t" textAnchor="middle" fill="#2e7d32">barra verde: tercio medio de la base</text>
      <text x={4} y={12} className="hc-hud-t" fill={AXC}>sección · flechas proporcionales a las fuerzas</text>
      <g transform={`translate(${W - 252} 12)`}>
        {[
          ['#5b4630', 'peso'],
          ['#1f78b4', 'agua'],
          ['#7b3fa0', 'subpresión'],
          [r.inThird ? '#2e7d32' : '#c0392b', 'resultante'],
        ].map(([c, t], k) => (
          <g key={t} transform={`translate(${[0, 46, 92, 172][k]} 0)`}>
            <line x1={0} x2={10} y1={-3} y2={-3} stroke={c} strokeWidth="2.2" />
            <text x={13} y={1} className="hc-hud-t" fill={INK}>{t}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

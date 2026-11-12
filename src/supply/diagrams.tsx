// Esquemas planos de la sala «Acueducto»: la red del barrio vista desde arriba y la tubería del golpe de ariete con su
// línea piezométrica. Se ven en la pestaña Esquema y, sin WebGL, en lugar de la escena 3D.

import { es } from '../canals/common';
import type { HammerResult } from './hammer';
import type { NetSolution, Network } from './network';

const INK = '#17324d';

/** La red desde arriba: tubos con su caudal y sentido, esquinas con su presión. */
export function NetMap({ net, sol, req }: { net: Network; sol: NetSolution; req: number }) {
  const W = 520, H = 330;
  const xs = net.nodes.map((n) => n.x), ys = net.nodes.map((n) => n.y);
  const x0 = Math.min(...xs) - 70, x1 = Math.max(...xs) + 95, y0 = Math.min(...ys) - 40, y1 = Math.max(...ys) + 40;
  const s = Math.min(W / (x1 - x0), (H - 30) / (y1 - y0));
  const X = (x: number) => (x - x0) * s, Y = (y: number) => (y - y0) * s;
  const at = (id: string) => net.nodes.find((n) => n.id === id) as Network['nodes'][number];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-exp-svg cu-svg" role="img" aria-label={`Red del barrio vista desde arriba: ${net.pipes.length} tubos y ${net.nodes.length - 1} esquinas.`}>
      {net.pipes.map((p) => {
        const a = at(p.a), b = at(p.b);
        const q = sol.Q[p.id] ?? 0;
        const from = q >= 0 ? a : b, to = q >= 0 ? b : a;
        const mx = (X(from.x) + X(to.x)) / 2, my = (Y(from.y) + Y(to.y)) / 2;
        const ang = (Math.atan2(Y(to.y) - Y(from.y), X(to.x) - X(from.x)) * 180) / Math.PI;
        return (
          <g key={p.id}>
            <line x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke={p.closed ? '#b9c1c7' : '#2f84b5'} strokeWidth={2 + p.D * 30} strokeDasharray={p.closed ? '5 4' : undefined} strokeLinecap="round" />
            {!p.closed && Math.abs(q) > 1e-3 && <path d="M-5,-4 L5,0 L-5,4 Z" transform={`translate(${mx} ${my}) rotate(${ang})`} fill="#fff" stroke={INK} strokeWidth="0.8" />}
            <text x={mx} y={my - 7} className="lz-s" textAnchor="middle" fill={INK}>
              {p.closed ? 'cerrado' : `${es(Math.abs(q), 1)} L/s`}
            </text>
          </g>
        );
      })}
      {net.nodes.map((n) => {
        if (n.id === net.source) {
          return (
            <g key={n.id}>
              <rect x={X(n.x) - 14} y={Y(n.y) - 14} width="28" height="28" rx="4" fill="#d4d0c6" stroke={INK} />
              <text x={X(n.x)} y={Y(n.y) + 30} className="lz-s" textAnchor="middle" fill={INK}>tanque {es(net.H0, 1)} m</text>
            </g>
          );
        }
        const p = sol.p[n.id];
        const ok = Number.isFinite(p);
        const fill = !ok ? '#b9c1c7' : p < req ? '#c0392b' : net.H0 - n.z > 50 ? '#e67e22' : '#2f84b5';
        return (
          <g key={n.id}>
            <circle cx={X(n.x)} cy={Y(n.y)} r="9" fill={fill} stroke="#fff" strokeWidth="2" />
            <text x={X(n.x) + 12} y={Y(n.y) + 16} className="lz-s" fill={INK}>
              {n.id}: {ok ? `${es(p, 1)} m` : 'sin agua'}
            </text>
          </g>
        );
      })}
      <g transform={`translate(8 ${H - 10})`}>
        {[
          ['#2f84b5', 'presión dentro de la norma'],
          ['#c0392b', `menos de ${req} m`],
          ['#e67e22', 'estática de más de 50 m'],
        ].map(([c, t], k) => (
          <g key={t} transform={`translate(${k * 170} 0)`}>
            <circle cx={5} cy={-4} r="5" fill={c} />
            <text x={14} y={0} className="lz-s" fill={INK}>{t}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** La tubería del golpe de ariete: el tubo coloreado por el cambio de presión y la línea piezométrica de un instante. */
export function HammerFlat({ r, frame }: { r: HammerResult; frame: number }) {
  const W = 520, H = 280, L = 40, R = 14, top = 18, B = 40;
  const fr = r.frames[Math.max(0, Math.min(r.frames.length - 1, frame))], base = r.frames[0].H;
  const N = fr.H.length - 1;
  const J = (r.a * r.inp.V0) / 9.81;
  const y0 = Math.min(0, r.minV, r.Hv0 - J) - 5, y1 = Math.max(r.maxV, r.Hv0 + J) + 8;
  const X = (i: number) => L + (i / N) * (W - L - R);
  const Y = (v: number) => H - B - ((v - y0) / (y1 - y0)) * (H - B - top);
  const color = (dH: number) => {
    const s = Math.max(-1, Math.min(1, dH / Math.max(1, J)));
    const mix = (a: number[], b: number[], t: number) => a.map((v, k) => Math.round(v + (b[k] - v) * t));
    const c = mix([217, 212, 199], s >= 0 ? [192, 57, 43] : [33, 102, 172], Math.abs(s));
    return `rgb(${c.join(',')})`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-exp-svg cu-svg" role="img" aria-label={`Tubería en el instante ${es(fr.t, 2)} s: cota en la válvula ${es(fr.H[N], 1)} m.`}>
      <rect x={L} y={top} width={W - L - R} height={H - B - top} fill="#f7fafc" />
      <polyline points={base.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} fill="none" stroke="#8a96a0" strokeDasharray="5 3" />
      <polyline points={r.Hmax.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} fill="none" stroke="#c0392b" strokeDasharray="2 3" opacity="0.6" />
      <polyline points={r.Hmin.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} fill="none" stroke="#2166ac" strokeDasharray="2 3" opacity="0.6" />
      {fr.H.slice(0, N).map((_, i) => (
        <line key={i} x1={X(i)} x2={X(i + 1)} y1={Y(0)} y2={Y(0)} stroke={color((fr.H[i] + fr.H[i + 1]) / 2 - (base[i] + base[i + 1]) / 2)} strokeWidth="9" />
      ))}
      <polyline points={fr.H.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} fill="none" stroke="#1f78b4" strokeWidth="2.2" />
      <text x={L} y={H - 22} className="lz-s" fill={INK}>tanque</text>
      <text x={W - R} y={H - 22} className="lz-s" textAnchor="end" fill={INK}>válvula: {es(fr.H[N], 1)} m</text>
      <text x={(L + W - R) / 2} y={H - 8} className="lz-s" textAnchor="middle" fill="#5b6b78">t = {es(fr.t, 2)} s · {r.inp.L} m de tubo · rojo: sube la presión; azul: baja</text>
      <text x={L - 4} y={Y(0) + 4} className="lz-s" textAnchor="end" fill={INK}>0</text>
      <text x={L - 4} y={Y(r.Hv0) + 4} className="lz-s" textAnchor="end" fill={INK}>{es(r.Hv0, 0)}</text>
      <text x={L - 4} y={top + 10} className="lz-s" textAnchor="end" fill={INK}>m</text>
    </svg>
  );
}

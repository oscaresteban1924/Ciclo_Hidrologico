// Gráficas de la sala «Laderas»: lluvia e infiltración en el tiempo (Green-Ampt), factor de seguridad según el agua
// en el suelo, corte de la ladera para la vista plana, y pérdida de suelo según la cobertura.

import { useId } from 'react';
import { es } from '../canals/common';
import type { GAResult } from './slope';
import { COVERS, infiniteSlope, type Cover, type SlopeInput } from './slope';

const T = { t: 'hc-hud-t' };

/** Lluvia, capacidad de infiltración y lo que entra, con la escorrentía sombreada. `k` marca el instante. */
export function InfChart({ r, i, k = null, W = 560, H = 190, cls = 'hc-hud-svg' }: { r: GAResult; i: number; k?: number | null; W?: number; H?: number; cls?: string }) {
  const uid = useId().replace(/:/g, '');
  const L = 40, R = 12, Tp = 20, B = 24;
  const tEnd = r.t[r.t.length - 1] * 60;
  const yMax = Math.max(i * 1.25, 5);
  const X = (t: number) => L + (t / tEnd) * (W - L - R);
  const Y = (v: number) => H - B - (Math.min(v, yMax) / yMax) * (H - Tp - B);
  const line = (vals: number[]) => r.t.map((t, j) => `${X(t * 60).toFixed(1)},${Y(vals[j]).toFixed(1)}`).join(' ');
  const runoff = r.tp === null ? '' : `${line(r.t.map(() => i))} ${r.t
    .map((t, j) => [t, j] as const)
    .reverse()
    .map(([t, j]) => `${X(t * 60).toFixed(1)},${Y(r.f[j]).toFixed(1)}`)
    .join(' ')}`;
  const infil = `${line(r.f)} ${X(tEnd).toFixed(1)},${Y(0)} ${X(0)},${Y(0)}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((u) => u * tEnd);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Lluvia de ${es(i, 0)} mm/h e infiltración durante ${es(tEnd, 0)} minutos`}>
      <defs>
        <linearGradient id={`${uid}i`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a07a4f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#a07a4f" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <rect x={L} y={Tp} width={W - L - R} height={H - Tp - B} rx="4" fill="#f5f8fb" />
      <polygon points={infil} fill={`url(#${uid}i)`} />
      {runoff && <polygon points={runoff} fill="#4fa3d8" fillOpacity="0.35" />}
      <line x1={L} x2={W - R} y1={Y(i)} y2={Y(i)} stroke="#1f6fa5" strokeWidth="2" />
      <polyline points={line(r.fcap)} fill="none" stroke="#7a5a3b" strokeWidth="1.3" strokeDasharray="5 3" />
      <polyline points={line(r.f)} fill="none" stroke="#5d4630" strokeWidth="2" strokeLinejoin="round" />
      {r.tp !== null && (
        <g>
          <line x1={X(r.tp * 60)} x2={X(r.tp * 60)} y1={Tp} y2={H - B} stroke="#7b5ea7" strokeDasharray="2 3" />
          <text x={X(r.tp * 60) + 4} y={Tp + 10} className={T.t} fill="#7b5ea7">encharca: {es(r.tp * 60, 1)} min</text>
        </g>
      )}
      {k !== null && k !== undefined && <line x1={X(r.t[k] * 60)} x2={X(r.t[k] * 60)} y1={Tp} y2={H - B} stroke="#17324d" strokeWidth="1.5" />}
      {ticks.map((t, j) => (
        <text key={j} x={X(t)} y={H - 8} className={T.t} textAnchor={j === 0 ? 'start' : j === ticks.length - 1 ? 'end' : 'middle'} fill="#5b6b78">
          {j === ticks.length - 1 ? `${es(t, 0)} min` : es(t, 0)}
        </text>
      ))}
      <text x={L - 4} y={Y(i) + 3} className={T.t} textAnchor="end" fill="#1f6fa5">{es(i, 0)}</text>
      <text x={L - 4} y={Y(0) + 3} className={T.t} textAnchor="end" fill="#5b6b78">0</text>
      <text x={4} y={12} className={T.t} fill="#5b6b78">mm/h</text>
      <g transform={`translate(${W - R - 330} 8)`}>
        <line x1={0} x2={14} y1={0} y2={0} stroke="#1f6fa5" strokeWidth="2" />
        <text x={18} y={3} className={T.t} fill="#3c4b57">lluvia</text>
        <line x1={58} x2={72} y1={0} y2={0} stroke="#7a5a3b" strokeDasharray="5 3" />
        <text x={76} y={3} className={T.t} fill="#3c4b57">capacidad del suelo</text>
        <rect x={176} y={-4} width={12} height={8} fill="#a07a4f" fillOpacity="0.5" />
        <text x={192} y={3} className={T.t} fill="#3c4b57">entra</text>
        <rect x={232} y={-4} width={12} height={8} fill="#4fa3d8" fillOpacity="0.45" />
        <text x={248} y={3} className={T.t} fill="#3c4b57">escurre</text>
      </g>
    </svg>
  );
}

/** Factor de seguridad según la fracción saturada del suelo, con el estado actual y la línea de falla. */
export function FsChart({ inp, m, W = 560, H = 190, cls = 'hc-hud-svg' }: { inp: Omit<SlopeInput, 'm'>; m: number; W?: number; H?: number; cls?: string }) {
  const L = 36, R = 12, Tp = 20, B = 24;
  const ms = Array.from({ length: 41 }, (_, k) => k / 40);
  const fs = ms.map((x) => infiniteSlope({ ...inp, m: x }).FS);
  const yMax = Math.max(2, Math.ceil(Math.max(...fs) * 2) / 2), yMin = Math.min(0, Math.floor(Math.min(...fs) * 2) / 2);
  const X = (x: number) => L + x * (W - L - R);
  const Y = (v: number) => H - B - ((v - yMin) / (yMax - yMin)) * (H - Tp - B);
  const now = infiniteSlope({ ...inp, m }).FS;
  const pts = ms.map((x, k) => `${X(x).toFixed(1)},${Y(fs[k]).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Factor de seguridad ${es(now, 2)} con ${es(m * 100, 0)} % del suelo saturado`}>
      <rect x={L} y={Tp} width={W - L - R} height={H - Tp - B} rx="4" fill="#f5f8fb" />
      <rect x={L} y={Y(1)} width={W - L - R} height={Math.max(0, Y(yMin) - Y(1))} fill="#c0392b" fillOpacity="0.07" />
      <line x1={L} x2={W - R} y1={Y(1)} y2={Y(1)} stroke="#c0392b" strokeDasharray="5 3" />
      <text x={W - R - 4} y={Y(1) - 4} className={T.t} textAnchor="end" fill="#9b2c22">falla (FS = 1)</text>
      <line x1={L} x2={W - R} y1={Y(1.5)} y2={Y(1.5)} stroke="#7a8a97" strokeDasharray="2 3" />
      <text x={W - R - 4} y={Y(1.5) - 4} className={T.t} textAnchor="end" fill="#5b6b78">margen usual (1,5)</text>
      <polyline points={pts} fill="none" stroke="#7a5a3b" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx={X(m)} cy={Y(now)} r="5.5" fill={now < 1 ? '#c0392b' : '#1f6fa5'} stroke="#fff" strokeWidth="2" />
      <text x={X(m) + (m > 0.7 ? -8 : 8)} y={Y(now) - 8} className={T.t} textAnchor={m > 0.7 ? 'end' : 'start'} fill="#17324d" fontWeight="700">{es(now, 2)}</text>
      {[0, 0.25, 0.5, 0.75, 1].map((x, j) => (
        <text key={j} x={X(x)} y={H - 8} className={T.t} textAnchor={j === 0 ? 'start' : j === 4 ? 'end' : 'middle'} fill="#5b6b78">
          {j === 4 ? '100 % saturado' : `${x * 100} %`}
        </text>
      ))}
      {[yMin, 1, yMax].map((v) => (
        <text key={v} x={L - 4} y={Y(v) + 3} className={T.t} textAnchor="end" fill="#5b6b78">{es(v, 1)}</text>
      ))}
      <text x={4} y={12} className={T.t} fill="#5b6b78">factor de seguridad según el agua en el suelo</text>
    </svg>
  );
}

/** Corte de la ladera: roca, capa de suelo, nivel del agua y las fuerzas sobre un bloque (para la vista sin 3D). */
export function SlopeSection({ beta, z, m, FS, W = 520, H = 260, cls = 'hc-exp-svg cu-svg' }: { beta: number; z: number; m: number; FS: number; W?: number; H?: number; cls?: string }) {
  const b = (beta * Math.PI) / 180;
  const Ls = 40, run = Ls * Math.cos(b), hh = Ls * Math.sin(b);
  const sx = (W - 60) / (run + 30), sy = (H - 50) / (hh + 10);
  const s = Math.min(sx, sy);
  const X = (x: number) => 30 + (x + 10) * s, Y = (y: number) => H - 20 - (y + 6) * s;
  const sur = (x: number) => hh * (1 - x / run);
  const rock = `${X(-10)},${Y(-6)} ${X(run + 20)},${Y(-6)} ${X(run + 20)},${Y(-z)} ${X(run)},${Y(-z)} ${X(0)},${Y(hh - z)} ${X(-10)},${Y(hh - z)}`;
  const soil = `${X(-10)},${Y(hh - z)} ${X(0)},${Y(hh - z)} ${X(run)},${Y(-z)} ${X(run + 20)},${Y(-z)} ${X(run + 20)},${Y(0)} ${X(run)},${Y(0)} ${X(0)},${Y(hh)} ${X(-10)},${Y(hh)}`;
  const wt = `${X(0)},${Y(hh - z)} ${X(run)},${Y(-z)} ${X(run)},${Y(-z + m * z)} ${X(0)},${Y(hh - z + m * z)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Corte de una ladera de ${es(beta, 0)}° con ${es(z, 1)} m de suelo y ${es(m * 100, 0)} % saturado: factor ${es(FS, 2)}`}>
      <polygon points={rock} fill="#a39d93" />
      <polygon points={soil} fill="#9c7a55" />
      {m > 0.005 && <polygon points={wt} fill="#4fa3d8" fillOpacity="0.55" />}
      <polyline points={`${X(-10)},${Y(hh)} ${X(0)},${Y(hh)} ${X(run)},${Y(0)} ${X(run + 20)},${Y(0)}`} fill="none" stroke="#5d9a43" strokeWidth="3" />
      <line x1={X(0)} y1={Y(hh - z)} x2={X(run)} y2={Y(-z)} stroke="#7b2f22" strokeDasharray="6 4" strokeWidth="1.5" />
      <text x={X(run * 0.55)} y={Y(sur(run * 0.55) - z) + 14} className="lz-s" fill="#7b2f22">plano de falla posible</text>
      <text x={X(run * 0.2)} y={Y(sur(run * 0.2)) - 8} className="lz-s" fill="#17324d" fontWeight="700">FS {es(FS, 2)}</text>
      <text x={X(run + 4)} y={Y(-z) - 4} className="lz-s" fill="#3c4b57">roca</text>
      <text x={X(-8)} y={Y(hh) - 6} className="lz-s" fill="#3c4b57">{es(beta, 0)}° · {es(z, 1)} m de suelo</text>
    </svg>
  );
}

/** Pérdida de suelo de la misma ladera con cada cobertura (escala logarítmica), con la tolerable y la actual resaltada. */
export function CoverChart({ A0, current, T: tol, W = 560, H = 190, cls = 'hc-hud-svg' }: { A0: number; current: Cover; T: number; W?: number; H?: number; cls?: string }) {
  const keys = Object.keys(COVERS) as Cover[];
  const L = 150, R = 60, Tp = 16, B = 18;
  const vals = keys.map((k) => A0 * COVERS[k].C);
  const lo = 0.1, hi = Math.max(10 * tol, ...vals) * 1.2;
  const X = (v: number) => L + ((Math.log10(Math.max(lo, v)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (W - L - R);
  const bh = (H - Tp - B) / keys.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label="Pérdida de suelo con cada cobertura">
      {keys.map((k, j) => {
        const y = Tp + j * bh;
        const on = k === current;
        return (
          <g key={k}>
            <rect x={L} y={y + 3} width={Math.max(2, X(vals[j]) - L)} height={bh - 6} rx="4" fill={on ? '#7a5a3b' : '#cdbfae'} />
            <text x={L - 6} y={y + bh / 2 + 3} className={T.t} textAnchor="end" fill={on ? '#17324d' : '#5b6b78'} fontWeight={on ? 700 : 400}>
              {COVERS[k].name}
            </text>
            <text x={X(vals[j]) + 5} y={y + bh / 2 + 3} className={T.t} fill="#3c4b57">{es(vals[j], vals[j] < 10 ? 1 : 0)}</text>
          </g>
        );
      })}
      <line x1={X(tol)} x2={X(tol)} y1={Tp - 4} y2={H - B + 2} stroke="#2e7d32" strokeDasharray="4 3" strokeWidth="1.5" />
      <text x={X(tol) + 4} y={H - 4} className={T.t} fill="#2e7d32">tolerable {es(tol, 0)} t/(ha·año)</text>
      <text x={4} y={10} className={T.t} fill="#5b6b78">t/(ha·año), escala logarítmica</text>
    </svg>
  );
}

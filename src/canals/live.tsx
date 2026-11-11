// Instrumentos en vivo de las partes con flujo permanente: un perfil longitudinal (fondo, agua, línea de energía,
// profundidad crítica y normal, estructuras) que se recalcula con cada cambio, y registros en el tiempo de las
// magnitudes que importan en cada parte (los últimos 40 s), con su valor de referencia. Al «Simular una creciente»
// se ve cómo responde la estructura. Los datos son los del cálculo de cada parte: el dibujo no agrega nada.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { es } from './common';

export interface LivePt {
  x: number;
  zb: number;
  z: number;
  E?: number;
}

export interface LiveProfileData {
  pts: LivePt[];
  /** Cota de la profundidad crítica y de la normal a lo largo del tramo. */
  crit?: { x: number; z: number }[];
  normal?: { x: number; z: number }[];
  /** Borde de las paredes del cauce. */
  top?: { x: number; z: number }[];
  /** Estructuras (tablero, vertedero, terraplén, tubo): rectángulos o polígonos. */
  blocks?: { pts: [number, number][]; fill?: string }[];
  /** Líneas verticales con rótulo (estaciones, pie de la rápida, fin del pozo). */
  marks?: { x: number; label: string }[];
  /** Niveles con rótulo (vía, bajo del puente). */
  levels?: { z: number; x0: number; x1: number; label: string; color: string }[];
  xLabel?: string;
}

const C = { water: '#9ccbe6', waterLine: '#1f78b4', bed: '#6d5a3e', egl: '#c0392b', crit: '#7b5ea7', normal: '#5b6b78', top: '#8a96a0', block: '#b9bec3' };

/** Perfil longitudinal: x en m, cota en m, con la escala vertical exagerada para que se lea (lo dice el rótulo). */
export function LiveProfile({ d, W = 560, H = 160, label }: { d: LiveProfileData; W?: number; H?: number; label: string }) {
  const pts = d.pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.zb));
  if (pts.length < 2) return null;
  const L = 40, R = 10, T = 18, B = 22;
  const xs = pts.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const zAll = [...pts.map((p) => p.zb), ...pts.map((p) => p.z), ...(d.top ?? []).map((p) => p.z), ...(d.levels ?? []).map((l) => l.z), ...(d.blocks ?? []).flatMap((b) => b.pts.map((p) => p[1]))];
  const zLo = Math.min(...zAll), zHi = Math.max(...zAll);
  const pad = Math.max(0.15, (zHi - zLo) * 0.08);
  const zmin = zLo - pad, zmax = zHi + pad;
  const X = (x: number) => L + ((x - x0) / Math.max(1e-6, x1 - x0)) * (W - L - R);
  const Y = (z: number) => H - B - ((Math.min(zmax, Math.max(zmin, z)) - zmin) / (zmax - zmin)) * (H - T - B);
  const line = (a: { x: number; z: number }[]) => a.map((p) => `${X(p.x).toFixed(1)},${Y(p.z).toFixed(1)}`).join(' ');
  const water = `${pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.z).toFixed(1)}`).join(' ')} ${pts
    .slice()
    .reverse()
    .map((p) => `${X(p.x).toFixed(1)},${Y(p.zb).toFixed(1)}`)
    .join(' ')}`;
  const egl = pts.filter((p) => p.E !== undefined && Number.isFinite(p.E)).map((p) => ({ x: p.x, z: Math.min(p.E!, zmax) }));
  const legend: [string, string, string | undefined][] = [];
  if (egl.length > 1) legend.push(['energía', C.egl, '5 3']);
  if (d.crit) legend.push(['crítica', C.crit, '2 2']);
  if (d.normal) legend.push(['normal', C.normal, '6 3']);
  const span = x1 - x0;
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((s) => span / s <= 6) ?? 500;
  const ticks: number[] = [];
  for (let t = Math.ceil(x0 / step) * step; t <= x1 + 1e-9; t += step) ticks.push(t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-hud-svg" role="img" aria-label={label}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#f7fafc" />
      {(d.blocks ?? []).map((b, k) => (
        <polygon key={k} points={b.pts.map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join(' ')} fill={b.fill ?? C.block} stroke="#7d868d" strokeWidth="0.8" />
      ))}
      <polygon points={water} fill={C.water} stroke={C.waterLine} strokeWidth="1.2" />
      <polyline points={line(pts.map((p) => ({ x: p.x, z: p.zb })))} fill="none" stroke={C.bed} strokeWidth="1.6" />
      {d.top && <polyline points={line(d.top)} fill="none" stroke={C.top} strokeWidth="1" />}
      {d.normal && <polyline points={line(d.normal)} fill="none" stroke={C.normal} strokeWidth="1" strokeDasharray="6 3" />}
      {d.crit && <polyline points={line(d.crit)} fill="none" stroke={C.crit} strokeWidth="1.1" strokeDasharray="2 2" />}
      {egl.length > 1 && <polyline points={line(egl)} fill="none" stroke={C.egl} strokeWidth="1" strokeDasharray="5 3" />}
      {(d.levels ?? []).map((l, k) => (
        <g key={k}>
          <line x1={X(l.x0)} x2={X(l.x1)} y1={Y(l.z)} y2={Y(l.z)} stroke={l.color} strokeWidth="1.3" />
          <text x={X(l.x0) + 3} y={Y(l.z) - 3} className="hc-hud-t" fill={l.color}>{l.label}</text>
        </g>
      ))}
      {(d.marks ?? []).map((m, k) => (
        <g key={k}>
          <line x1={X(m.x)} x2={X(m.x)} y1={T} y2={H - B} stroke="#7b5ea7" strokeDasharray="2 3" />
          <text x={X(m.x) + 3} y={T + 9 + (k % 2) * 10} className="hc-hud-t" fill="#7b5ea7">{m.label}</text>
        </g>
      ))}
      {ticks.map((t, k) => (
        <text key={t} x={X(t)} y={H - 7} className="hc-hud-t" textAnchor={k === ticks.length - 1 && X(t) > W - R - 30 ? 'end' : 'middle'} fill="#5b6b78">
          {k === ticks.length - 1 ? `${es(t, 0)} m` : es(t, 0)}
        </text>
      ))}
      <text x={4} y={12} className="hc-hud-t" fill="#5b6b78">cota (m), escala vertical aumentada</text>
      <g transform={`translate(${W - R - legend.length * 64} 8)`}>
        {legend.map(([n, c, dash], i) => (
          <g key={n} transform={`translate(${i * 64} 0)`}>
            <line x1={0} x2={12} y1={0} y2={0} stroke={c} strokeDasharray={dash} strokeWidth="1.3" />
            <text x={15} y={3} className="hc-hud-t" fill="#3c4b57">{n}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export interface TraceSpec {
  key: string;
  label: string;
  unit: string;
  value: number;
  digits?: number;
  /** Valor de referencia (una línea con su rótulo): el borde, el bajo del puente, el fin del pozo. */
  ref?: { value: number; label: string };
}

const WINDOW = 40;

/** Registros en el tiempo: una gráfica pequeña por magnitud, cada una con su eje (sin ejes dobles). */
export function LiveTraces({ specs, W = 360 }: { specs: TraceSpec[]; W?: number }) {
  const hist = useRef<{ t: number; v: Record<string, number> }[]>([]);
  const latest = useRef(specs);
  latest.current = specs;
  const [, setTick] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      const v: Record<string, number> = {};
      for (const s of latest.current) v[s.key] = s.value;
      hist.current.push({ t, v });
      while (hist.current.length && hist.current[0].t < t - WINDOW) hist.current.shift();
      setTick((k) => k + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, []);
  const h = hist.current;
  const now = h.length ? h[h.length - 1].t : 0;
  const Hc = 70, L = 40, R = 10, T = 14, B = 10;
  return (
    <div className="hc-traces">
      {specs.map((s) => {
        const vals = h.map((p) => p.v[s.key]).filter((x) => Number.isFinite(x));
        const all = s.ref && Number.isFinite(s.ref.value) ? [...vals, s.ref.value] : vals;
        let lo = all.length ? Math.min(...all) : 0, hi = all.length ? Math.max(...all) : 1;
        if (hi - lo < 1e-6) {
          lo -= Math.max(0.05, Math.abs(lo) * 0.1);
          hi += Math.max(0.05, Math.abs(hi) * 0.1);
        }
        const pad = (hi - lo) * 0.12;
        lo -= pad;
        hi += pad;
        const X = (t: number) => L + ((t - (now - WINDOW)) / WINDOW) * (W - L - R);
        const Y = (v: number) => Hc - B - ((v - lo) / (hi - lo)) * (Hc - T - B);
        const pts = h.filter((p) => Number.isFinite(p.v[s.key])).map((p) => `${X(p.t).toFixed(1)},${Y(p.v[s.key]).toFixed(1)}`).join(' ');
        const d = s.digits ?? 2;
        return (
          <svg key={s.key} viewBox={`0 0 ${W} ${Hc}`} className="hc-hud-svg" role="img" aria-label={`${s.label}: ${es(s.value, d)} ${s.unit}`}>
            <rect x={L} y={T} width={W - L - R} height={Hc - T - B} fill="#f7fafc" />
            {s.ref && Number.isFinite(s.ref.value) && (
              <g>
                <line x1={L} x2={W - R} y1={Y(s.ref.value)} y2={Y(s.ref.value)} stroke="#c0632b" strokeDasharray="5 3" />
                <text x={W - R - 3} y={Y(s.ref.value) - 3} className="hc-hud-t" textAnchor="end" fill="#9b4a1c">{s.ref.label}</text>
              </g>
            )}
            {pts && <polyline points={pts} fill="none" stroke="#2f7fb0" strokeWidth="1.8" />}
            <text x={4} y={10} className="hc-hud-t" fill="#3c4b57">
              {s.label}: <tspan fontWeight="700">{es(s.value, d)} {s.unit}</tspan>
            </text>
            <text x={L - 4} y={Y(hi - pad) + 3} className="hc-hud-t" textAnchor="end" fill="#5b6b78">{es(hi - pad, d)}</text>
            <text x={L - 4} y={Y(lo + pad) + 3} className="hc-hud-t" textAnchor="end" fill="#5b6b78">{es(lo + pad, d)}</text>
          </svg>
        );
      })}
      <p className="hc-traces-foot">últimos {WINDOW} s</p>
    </div>
  );
}

/** Panel de instrumentos: encabezado con los valores, perfil y registros. */
export function LiveHud({ head, profile, profileLabel, traces }: { head: ReactNode[]; profile?: LiveProfileData | null; profileLabel?: string; traces: TraceSpec[] }) {
  return (
    <div className="hc-hud" aria-live="off">
      <div className="hc-hud-head">
        <b>Instrumentos</b>
        {head.map((h, i) => (
          <span key={i}>{h}</span>
        ))}
      </div>
      <div className={`hc-hud-row${profile ? '' : ' is-single'}`}>
        {profile && <LiveProfile d={profile} label={profileLabel ?? 'Perfil del agua'} />}
        <LiveTraces specs={traces} />
      </div>
    </div>
  );
}

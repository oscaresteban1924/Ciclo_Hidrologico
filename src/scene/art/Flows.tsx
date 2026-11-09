// Flujos dibujados: viento, escorrentía, líneas de flujo subterráneo, flechas de procesos y niveles.

import { memo } from 'react';
import { smoothPath } from '../../lib/paths';
import {
  ARROWS,
  CONDENSATION_LEVEL,
  FREEZING_LEVEL,
  GW_LINES,
  RECHARGE_POINT,
  RUNOFF_PATHS,
  SUN,
  WIND_LINES,
  type ArrowStyle,
} from '../geometry';

export const WindLines = memo(function WindLines({ wind }: { wind: number }) {
  const dur = [7, 4.5, 2.6][wind];
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round">
      {WIND_LINES.map((w, i) => (
        <g key={i}>
          <path d={smoothPath(w)} stroke="#ffffff" strokeWidth="2.4" opacity="0.28" />
          <path
            d={smoothPath(w)}
            stroke="#ffffff"
            strokeWidth="1.6"
            strokeDasharray="22 26"
            opacity="0.75"
            className="flow-dash"
            style={{ animationDuration: `${dur + i * 0.6}s` }}
          />
        </g>
      ))}
    </g>
  );
});

export const RunoffLines = memo(function RunoffLines({ level, surface }: { level: number; surface: number }) {
  if (level < 0.02) return null;
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {RUNOFF_PATHS.map((r) => {
        const w = r.zone === 'town' ? 0.5 + surface * 0.35 : 0.7;
        const width = (1.2 + level * 4.2) * w;
        return (
          <g key={r.id} opacity={Math.min(1, 0.35 + level)}>
            <path d={smoothPath(r.points)} stroke="#e6f3fb" strokeWidth={width + 2} opacity="0.7" />
            <path d={smoothPath(r.points)} stroke="#3b8ed0" strokeWidth={width} />
          </g>
        );
      })}
    </g>
  );
});

/** Brillo que corre sobre la escorrentía (capa animada). */
export const RunoffFlow = memo(function RunoffFlow({ level, surface }: { level: number; surface: number }) {
  if (level < 0.02) return null;
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round">
      {RUNOFF_PATHS.map((r) => {
        const w = r.zone === 'town' ? 0.5 + surface * 0.35 : 0.7;
        const width = (1.2 + level * 4.2) * w;
        return (
          <path key={r.id} d={smoothPath(r.points)} stroke="#d8eefb" strokeWidth={Math.max(0.8, width * 0.35)} strokeDasharray="6 10" className="flow-dash" style={{ animationDuration: '1.1s' }} opacity={Math.min(1, 0.35 + level)} />
        );
      })}
    </g>
  );
});

export const GroundwaterLines = memo(function GroundwaterLines() {
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round">
      {GW_LINES.map((l) => (
        <path key={l.id} d={smoothPath(l.points)} stroke="#0d3f73" strokeWidth="1.4" strokeDasharray="1.5 6" opacity="0.55" />
      ))}
    </g>
  );
});

const STYLE: Record<ArrowStyle, { stroke: string; halo: string; dash?: string; width: number; marker: string }> = {
  vapor: { stroke: '#4f53b8', halo: '#ffffff', dash: '8 5', width: 3.2, marker: 'url(#m-vapor)' },
  liquid: { stroke: '#1565b0', halo: '#ffffff', width: 3.6, marker: 'url(#m-liquid)' },
  subsurface: { stroke: '#0d3f73', halo: '#f6efe0', dash: '1.5 5.5', width: 3.6, marker: 'url(#m-subsurface)' },
  ice: { stroke: '#ffffff', halo: '#2f6d9f', width: 3.6, marker: 'url(#m-ice)' },
};

export const ProcessArrows = memo(function ProcessArrows({
  strong,
  faint,
}: {
  strong: string[] | 'all';
  faint: boolean;
}) {
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round">
      {ARROWS.map((a) => {
        const isStrong = strong === 'all' || strong.includes(a.process);
        if (!isStrong && !faint) return null;
        const st = STYLE[a.style];
        const d = smoothPath(a.points);
        return (
          <g key={a.id} opacity={isStrong ? 1 : 0.22} style={{ transition: 'opacity .5s' }}>
            <path d={d} stroke={st.halo} strokeWidth={st.width + 3} opacity="0.85" strokeDasharray={st.dash} />
            <path d={d} stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} markerEnd={st.marker} />
          </g>
        );
      })}
      {(strong === 'all' || strong.includes('percolacion')) && (
        <g transform={`translate(${RECHARGE_POINT[0]} ${RECHARGE_POINT[1]})`}>
          <ellipse rx="12" ry="4" fill="none" stroke="#0d3f73" strokeWidth="1.6" />
          <ellipse rx="6" ry="2" fill="#0d3f73" />
        </g>
      )}
    </g>
  );
});

export const LevelLine = memo(function LevelLine({ kind }: { kind: 'condensation' | 'freezing' }) {
  const y = kind === 'condensation' ? CONDENSATION_LEVEL : FREEZING_LEVEL;
  const x0 = kind === 'condensation' ? 330 : 1120;
  const x1 = kind === 'condensation' ? 1260 : 1760;
  return (
    <g aria-hidden="true">
      <path d={`M${x0} ${y} H${x1}`} stroke="#ffffff" strokeWidth="4" opacity="0.5" />
      <path d={`M${x0} ${y} H${x1}`} stroke={kind === 'condensation' ? '#4f53b8' : '#2f6d9f'} strokeWidth="1.8" strokeDasharray="12 7" />
    </g>
  );
});

/** Energía solar y gravedad (paso A). */
export const Forces = memo(function Forces() {
  const rays = [
    [SUN.x + 40, SUN.y + 50, 150, 520],
    [SUN.x + 60, SUN.y + 30, 520, 470],
    [SUN.x + 66, SUN.y + 8, 960, 470],
  ];
  const gravity = [
    [1160, 300],
    [880, 600],
    [940, 690],
    [600, 810],
  ];
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round">
      {rays.map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#ffffff" strokeWidth="6" opacity="0.6" />
          <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#f2b230" strokeWidth="3" strokeDasharray="14 8" markerEnd="url(#m-sunray)" />
        </g>
      ))}
      {gravity.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <circle r="15" fill="#fff8ec" stroke="#b5651d" strokeWidth="2" />
          <path d="M0 -8 V6" stroke="#b5651d" strokeWidth="2.6" markerEnd="url(#m-force)" />
        </g>
      ))}
    </g>
  );
});

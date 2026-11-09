// Alta montaña andina: páramo con frailejones y laguna, estratos de roca, glaciar y bancos de niebla.

import { memo } from 'react';
import { linePath, seeded, smoothPath, type Pt } from '../../lib/paths';
import { FOG_BANKS, PARAMO_LAGOON, PARAMO_POLY, SHADOW_FACES, pointInPoly } from '../geometry';

interface Plant {
  x: number;
  y: number;
  s: number;
  flower: boolean;
}

const FRAILEJONES: Plant[] = (() => {
  const r = seeded(91);
  const out: Plant[] = [];
  let tries = 0;
  while (out.length < 64 && tries++ < 3000) {
    const x = 1110 + r() * 760;
    const y = 330 + r() * 120;
    if (!pointInPoly(x, y, PARAMO_POLY)) continue;
    if (((x - PARAMO_LAGOON.cx) / (PARAMO_LAGOON.rx + 10)) ** 2 + ((y - PARAMO_LAGOON.cy) / (PARAMO_LAGOON.ry + 8)) ** 2 < 1) continue;
    if (out.some((p) => Math.abs(p.x - x) < 7 && Math.abs(p.y - y) < 5)) continue;
    out.push({ x, y, s: 0.42 + ((y - 330) / 140) * 0.3, flower: r() < 0.3 });
  }
  return out.sort((a, b) => a.y - b.y);
})();

const TUSSOCKS: Pt[] = (() => {
  const r = seeded(17);
  const out: Pt[] = [];
  let tries = 0;
  while (out.length < 90 && tries++ < 3000) {
    const x = 1100 + r() * 800;
    const y = 330 + r() * 130;
    if (pointInPoly(x, y, PARAMO_POLY)) out.push([x, y]);
  }
  return out;
})();

/** Frailejón: tallo cubierto de hojas secas y una roseta plateada que atrapa la niebla. */
function Frailejon({ x, y, s, flower }: Plant) {
  return (
    <g>
      <path d={`M${x} ${y} V${y - 10 * s}`} stroke="#5a4a32" strokeWidth={2.4 * s} strokeLinecap="round" />
      <path d={`M${x} ${y - 1.5 * s} V${y - 7 * s}`} stroke="#8a7650" strokeWidth={3.6 * s} strokeLinecap="round" />
      <circle cx={x} cy={y - 11.5 * s} r={4.4 * s} fill="#9fb18c" />
      <circle cx={x - 1.4 * s} cy={y - 12.6 * s} r={2.8 * s} fill="#d5e0c4" />
      {flower && <circle cx={x + 2.6 * s} cy={y - 15.5 * s} r={1.4 * s} fill="#e3c241" />}
    </g>
  );
}

export const Paramo = memo(function Paramo() {
  const poly = linePath(PARAMO_POLY, true);
  return (
    <g aria-hidden="true">
      <defs>
        <clipPath id="clip-paramo">
          <path d={poly} />
        </clipPath>
      </defs>
      <path d={poly} fill="url(#g-paramo)" filter="url(#f-haze)" opacity="0.96" />
      <g clipPath="url(#clip-paramo)">
        <rect x="1060" y="300" width="900" height="200" fill="url(#pat-paramo)" />
        {/* las caras en sombra siguen viéndose sobre el páramo */}
        {SHADOW_FACES.map((f, i) => (
          <path key={i} d={linePath(f, true)} fill="#26341f" opacity="0.22" />
        ))}
      </g>
      {/* laguna de páramo */}
      <ellipse cx={PARAMO_LAGOON.cx} cy={PARAMO_LAGOON.cy + 1} rx={PARAMO_LAGOON.rx + 4} ry={PARAMO_LAGOON.ry + 2.5} fill="#7d8f5c" />
      <ellipse cx={PARAMO_LAGOON.cx} cy={PARAMO_LAGOON.cy} rx={PARAMO_LAGOON.rx} ry={PARAMO_LAGOON.ry} fill="#4b88b8" />
      <path d={`M${PARAMO_LAGOON.cx - 12} ${PARAMO_LAGOON.cy - 1} h10`} stroke="#d8ecf7" strokeWidth="1" strokeLinecap="round" />
      <path d={smoothPath([[PARAMO_LAGOON.cx - 18, PARAMO_LAGOON.cy + 4], [1336, 394], [1332, 402]])} stroke="#4b88b8" strokeWidth="1.6" fill="none" />
      {/* macollas de pajonal */}
      <g stroke="#c9b874" strokeWidth="1" strokeLinecap="round" opacity="0.85">
        {TUSSOCKS.map(([x, y], i) => (
          <path key={i} d={`M${x - 2} ${y} l-1 -3 M${x} ${y} l0 -4 M${x + 2} ${y} l1.5 -3`} />
        ))}
      </g>
      {FRAILEJONES.map((p, i) => (
        <Frailejon key={i} {...p} />
      ))}
    </g>
  );
});

/** Estratos de roca y glaciar (se dibujan antes de la nieve). */
export const RockDetail = memo(function RockDetail() {
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round">
      <g stroke="#6f6a62" strokeWidth="1.3" opacity="0.55">
        <path d="M1150 360 Q1210 330 1262 318 T1340 300" />
        <path d="M1180 392 Q1240 366 1300 352 T1390 330" />
        <path d="M1500 300 Q1560 292 1610 286 T1700 270" />
        <path d="M1530 330 Q1600 318 1660 312 T1760 300" />
        <path d="M1380 260 Q1420 250 1450 238" />
      </g>
      <g stroke="#57534d" strokeWidth="1" opacity="0.5">
        <path d="M1240 250 l-14 40 l6 30" />
        <path d="M1560 230 l10 46 l-8 40" />
        <path d="M1690 210 l-12 50" />
      </g>
    </g>
  );
});

export const Glacier = memo(function Glacier() {
  return (
    <g aria-hidden="true">
      <path d="M1468 140 C1486 150 1500 178 1504 214 C1508 240 1500 262 1488 272 C1478 262 1470 244 1466 222 C1460 196 1460 164 1468 140Z" fill="#d6e7f4" stroke="#b4cfe4" strokeWidth="1.2" />
      <g stroke="#93b7d6" strokeWidth="1.1" strokeLinecap="round" fill="none">
        <path d="M1472 182 q8 4 18 2" />
        <path d="M1470 204 q10 5 24 2" />
        <path d="M1472 228 q10 4 22 0" />
        <path d="M1478 250 q6 3 14 0" />
      </g>
    </g>
  );
});

/** Bancos de niebla que se desplazan sobre el bosque de niebla y el páramo (capa animada). */
export const FogBanks = memo(function FogBanks({ wind, visible }: { wind: number; visible: number }) {
  return (
    <g aria-hidden="true" style={{ opacity: visible, transition: 'opacity 1s' }}>
      {FOG_BANKS.map((f, i) => (
        <ellipse
          key={i}
          className="fog-bank"
          cx={f.x}
          cy={f.y}
          rx={f.w / 2}
          ry={f.h / 2}
          fill="url(#g-fog)"
          style={{ animationDuration: `${f.dur / [0.7, 1, 1.5][wind]}s`, animationDelay: `${f.delay}s` }}
        />
      ))}
    </g>
  );
});

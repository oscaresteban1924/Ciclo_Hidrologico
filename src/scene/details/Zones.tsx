// Vista de detalle «zonas del subsuelo»: zona no saturada, franja capilar, nivel freático,
// zona saturada y un pozo de observación cuyo nivel coincide con el nivel freático.

import { memo } from 'react';
import { AIR, BigArrow, Drop, INK, WATER, WATER_DEEP, ease, lerp, makeGrains, ramp } from './common';

const COL_X1 = 470;
const TOP = 74;
const SOIL_B = 112;
const BOTTOM = 396;
const WT0 = 262;
const FRINGE = 34;
const WELL_X = 528;
const WELL_W = 44;

const GRAINS = makeGrains({ seed: 17, x0: -6, x1: COL_X1 + 6, y0: SOIL_B + 4, y1: BOTTOM + 8, rMin: 9, rMax: 16, gap: 5, n: 260, fills: ['#dcbd8c', '#cfac78', '#e5cda3', '#c9a46f', '#d8b682'] });

const Grains = memo(function Grains() {
  return (
    <defs>
      <g id="zn-grains">
        {GRAINS.map((g, i) => (
          <path key={i} d={g.d} fill={g.fill} stroke="#9c7b4c" strokeWidth="1" />
        ))}
      </g>
      <g id="zn-shapes">
        {GRAINS.map((g, i) => (
          <path key={i} d={g.d} />
        ))}
      </g>
    </defs>
  );
});

function Band({ y, h, label, on, side = 'left' }: { y: number; h: number; label: string; on: number; side?: 'left' | 'right' }) {
  if (on <= 0.01) return null;
  const x = side === 'left' ? 8 : COL_X1 - 8;
  return (
    <g opacity={on}>
      <path d={`M${x} ${y + 3} V${y + h - 3}`} stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <rect x={side === 'left' ? 16 : COL_X1 - 16 - (label.length * 8.3 + 26)} y={y + h / 2 - 14} width={label.length * 8.3 + 26} height="28" rx="14" fill="#fff" stroke={INK} strokeWidth="1.5" />
      <text x={side === 'left' ? 16 + (label.length * 8.3 + 26) / 2 : COL_X1 - 16 - (label.length * 8.3 + 26) / 2} y={y + h / 2 + 5} textAnchor="middle" className="d-label">
        {label}
      </text>
    </g>
  );
}

export function ZonesArt({ t, clock, variant }: { t: number; clock: number; variant: string }) {
  const dry = variant === 'sequia';
  const ph = t < 4.5 ? 0 : t < 8.5 ? 1 : t < 12.5 ? 2 : 3;
  // el nivel freático sube con la recarga o baja en la temporada seca
  const shift = ease(ramp(t, 13, 17)) * (dry ? 22 : -18);
  const wt = WT0 + shift;
  const fringeTop = wt - FRINGE;
  // el agua del pozo se estabiliza a la altura del nivel freático
  const fill = ease(ramp(t, 8.6, 11));
  const wellLevel = lerp(BOTTOM - 4, wt, fill);
  const dimUnsat = ph === 1 || ph === 2 ? 0.45 : 0;
  const dimSat = ph === 0 || ph === 1 ? 0.45 : 0;
  const dimFringe = ph === 0 ? 0.45 : 0;

  return (
    <>
      <Grains />
      <clipPath id="zn-col">
        <rect x="0" y={SOIL_B} width={COL_X1} height={BOTTOM - SOIL_B} />
      </clipPath>
      <clipPath id="zn-unsat">
        <rect x="0" y={SOIL_B} width={COL_X1} height={Math.max(0, fringeTop - SOIL_B)} />
      </clipPath>

      {/* cielo, superficie y suelo con raíces */}
      <rect x="0" y="0" width="640" height={TOP} fill="#dfeef6" />
      <path d={`M0 ${TOP - 4} H640 V${TOP + 4} H0Z`} fill="#5f8a45" />
      <rect x="0" y={TOP + 4} width="640" height={SOIL_B - TOP - 4} fill="#6e5434" />
      <g stroke="#3e2a1a" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M90 78 q4 14 -2 30 M96 92 q10 6 12 18 M300 78 q-6 16 2 30 M306 96 q-10 6 -8 16" />
      </g>

      <g clipPath="url(#zn-col)">
        {/* zona no saturada: aire en los poros y películas de agua */}
        <rect x="0" y={SOIL_B} width={COL_X1} height={BOTTOM - SOIL_B} fill={AIR} />
        <g clipPath="url(#zn-unsat)">
          <use href="#zn-shapes" fill={WATER} stroke={WATER} strokeWidth={dry ? 4 : 7} strokeLinejoin="round" opacity="0.9" />
        </g>
        {/* franja capilar: poros casi llenos por capilaridad */}
        <rect x="0" y={fringeTop} width={COL_X1} height={FRINGE} fill="#8fc3e6" />
        {/* zona saturada: todos los poros llenos de agua */}
        <rect x="0" y={wt} width={COL_X1} height={BOTTOM - wt} fill="url(#d-ripple)" />
        <use href="#zn-grains" />
        {/* agua que percola hacia abajo */}
        {!dry &&
          [60, 170, 260, 350, 420].map((x, i) => {
            const k = (clock * 0.22 + i * 0.21) % 1;
            const y = lerp(SOIL_B + 6, fringeTop + 6, k);
            const on = t < 4.5 || t > 12.5 ? 1 : 0.35;
            return <Drop key={i} x={x} y={y} s={0.85} opacity={on * (1 - Math.max(0, k - 0.85) * 6)} />;
          })}
        {/* ascenso capilar */}
        {ph === 1 &&
          [80, 200, 320, 430].map((x, i) => {
            const k = (clock * 0.5 + i * 0.25) % 1;
            return <path key={i} d={`M${x} ${wt - 2 - k * (FRINGE - 6)} v-8`} stroke={WATER_DEEP} strokeWidth="2.4" markerEnd="url(#d-arrow-water)" opacity={1 - k} />;
          })}
        {/* atenuar lo que no es el foco de la fase */}
        <rect x="0" y={SOIL_B} width={COL_X1} height={Math.max(0, fringeTop - SOIL_B)} fill="#fff" opacity={dimUnsat} />
        <rect x="0" y={fringeTop} width={COL_X1} height={FRINGE} fill="#fff" opacity={dimFringe} />
        <rect x="0" y={wt} width={COL_X1} height={BOTTOM - wt} fill="#fff" opacity={dimSat} />
      </g>

      {/* nivel freático */}
      <path d={`M0 ${wt} H${WELL_X + WELL_W + 30}`} stroke={WATER_DEEP} strokeWidth="2.6" strokeDasharray="10 6" />
      <path d={`M${COL_X1 - 30} ${wt - 14} l8 12 l8 -12 Z`} fill="#fff" stroke={WATER_DEEP} strokeWidth="2" />

      {/* pozo de observación: tubo con rejilla abajo */}
      <rect x={WELL_X - 18} y={TOP - 4} width={WELL_W + 36} height={BOTTOM - TOP + 8} fill="#efe6d4" />
      <rect x={WELL_X} y={TOP - 26} width={WELL_W} height={BOTTOM - TOP + 30} fill="#ffffff" stroke={INK} strokeWidth="2.2" />
      <rect x={WELL_X + 2} y={wellLevel} width={WELL_W - 4} height={BOTTOM - wellLevel + 2} fill="url(#d-ripple)" />
      <g stroke={INK} strokeWidth="1.6">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M${WELL_X} ${BOTTOM - 120 + i * 13} h7 M${WELL_X + WELL_W} ${BOTTOM - 120 + i * 13} h-7`} />
        ))}
      </g>
      <path d={`M${WELL_X - 6} ${wellLevel} H${WELL_X + WELL_W + 6}`} stroke={WATER_DEEP} strokeWidth="3" opacity={fill} />
      <text x={WELL_X + WELL_W / 2} y={TOP - 34} textAnchor="middle" className="d-label">
        Pozo
      </text>

      <Band y={SOIL_B} h={fringeTop - SOIL_B} label="Zona no saturada: aire y agua" on={ph === 0 || ph === 3 ? 1 : 0.35} />
      <Band y={fringeTop} h={FRINGE} label="Franja capilar" on={ph === 1 ? 1 : 0} />
      <Band y={wt} h={BOTTOM - wt} label="Zona saturada: solo agua" on={ph >= 2 ? 1 : 0.35} />

      {ph >= 2 && (
        <g opacity={fill}>
          <rect x={COL_X1 - 252} y={wt - 46} width="246" height="28" rx="14" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <text x={COL_X1 - 129} y={wt - 27} textAnchor="middle" className="d-label">
            Nivel freático = nivel en el pozo
          </text>
        </g>
      )}
      {ph === 3 && (
        <>
          <BigArrow d={`M${COL_X1 + 40} ${WT0} V${wt + (dry ? -2 : 2)}`} color={WATER_DEEP} width={3} opacity={Math.abs(shift) > 4 ? 1 : 0} />
          <g>
            <rect x="160" y="8" width="258" height="28" rx="14" fill="#fff" stroke={INK} strokeWidth="1.5" />
            <text x="289" y="27" textAnchor="middle" className="d-label">
              {dry ? 'Sin recarga: el nivel baja' : 'Recarga: el nivel sube'}
            </text>
          </g>
        </>
      )}
    </>
  );
}

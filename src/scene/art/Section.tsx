// Corte del terreno: horizontes del suelo, zona no saturada, franja capilar, nivel freático,
// zona saturada con lentes de grava y arcilla, roca fracturada, cuña salina, mar,
// alcantarillado pluvial y pozo de bombeo.

import { forwardRef, memo, type Ref } from 'react';
import { linePath, seeded, smoothPath, type Pt } from '../../lib/paths';
import {
  BEDROCK,
  BLOCK_BOTTOM,
  BOUNDS,
  CLAY_LENS,
  FEATURED_TREE,
  FRACTURES,
  GRAVEL_LENS,
  LAND_FRONT_D,
  RIVER_LEVEL,
  SEAFLOOR,
  SEA_LEVEL,
  SOIL_DEPTH,
  SPRING,
  STORM_PIPE,
  WATER_TABLE,
  WELL,
  WELLS,
  drawdown,
  saltWedge,
  yBedrock,
  yFront,
  yWaterTable,
} from '../geometry';

const RIGHT = BOUNDS.x + BOUNDS.w;
const GROUND: Pt[] = [[BOUNDS.x, 962], ...SEAFLOOR.slice(1), ...LAND_FRONT_D.slice(1)];
const LAND_ONLY = LAND_FRONT_D.filter(([x]) => x >= 300);

const bump = (x: number) => Math.exp(-(((x - 1020) / 300) ** 2));

/** Nivel freático con el abultamiento de recarga y el cono de depresión del pozo. */
export function waterTablePoints(rise: number, pumping: number): Pt[] {
  const xs = new Set<number>(WATER_TABLE.map(([x]) => x));
  for (let x = WELL.x - 260; x <= WELL.x + 260; x += 20) xs.add(x);
  return [...xs]
    .sort((a, b) => a - b)
    .filter((x) => x >= 300)
    .map((x) => [x, yWaterTable(x) - rise * 12 * bump(x) + drawdown(x, pumping)] as Pt);
}

export function buildWaterTable(rise: number, pumping = 0): { line: string; zone: string } {
  const pts = waterTablePoints(rise, pumping);
  const line = smoothPath(pts);
  const seabed = SEAFLOOR.map(([x, y]) => `L${x} ${y}`).join(' ');
  const zone = `${line} L${RIGHT} ${BLOCK_BOTTOM} L${BOUNDS.x} ${BLOCK_BOTTOM} ${seabed} Z`;
  return { line, zone };
}

function band(points: readonly Pt[], from: number, to: number): string {
  const top = points.map(([x, y]) => [x, y + from] as Pt);
  const bottom = [...points].reverse().map(([x, y]) => [x, y + to] as Pt);
  return linePath([...top, ...bottom], true);
}

function bandRange(x0: number, x1: number, depth: number): string {
  const pts = LAND_FRONT_D.filter(([x]) => x >= x0 && x <= x1);
  return band(pts, 0, depth);
}

/** Guijarros dispersos en el subsuelo (determinísticos). */
const PEBBLES: [number, number, number, number][] = (() => {
  const r = seeded(23);
  const out: [number, number, number, number][] = [];
  let tries = 0;
  while (out.length < 36 && tries++ < 4000) {
    const x = 320 + r() * 1560;
    const top = yFront(x) + SOIL_DEPTH + 4;
    const y = top + r() * (yBedrock(x) - top - 6);
    if (y > yBedrock(x) - 4 || y < top) continue;
    out.push([x, y, 2 + r() * 3, r() * 180]);
  }
  return out;
})();

const STRATA: Pt[][] = [
  [[300, 840], [600, 852], [900, 860], [1200, 846], [1600, 820], [1920, 800]],
  [[300, 880], [600, 890], [900, 892], [1200, 878], [1600, 852], [1920, 832]],
  [[1300, 700], [1500, 690], [1700, 670], [1920, 650]],
];

interface Props {
  surface: 0 | 1 | 2;
  vegetation: 0 | 1 | 2;
  pumping: number;
  satRef: Ref<SVGPathElement>;
  wetRef: Ref<SVGGElement>;
}

export const SectionBase = memo(function SectionBase({ surface, vegetation, pumping, satRef, wetRef }: Props) {
  const wt0 = buildWaterTable(0, 0);
  const wedge = saltWedge(pumping);
  const wedgeZone = `${linePath(wedge)} L${wedge[wedge.length - 1][0]} ${BLOCK_BOTTOM} L${BOUNDS.x} ${BLOCK_BOTTOM} L${BOUNDS.x} 962 ${SEAFLOOR.slice(1).map(([x, y]) => `L${x} ${y}`).join(' ')} Z`;
  return (
    <g aria-hidden="true">
      {/* zona no saturada (todo el bloque; luego se cubre con lo demás) */}
      <path d={`${linePath(GROUND)} L${RIGHT} ${BLOCK_BOTTOM} L${BOUNDS.x} ${BLOCK_BOTTOM} Z`} fill="url(#pat-unsat)" />
      {/* zona saturada */}
      <path ref={satRef} id="sat-zone" d={wt0.zone} fill="url(#pat-sat)" />
      <clipPath id="clip-sat">
        <use href="#sat-zone" />
      </clipPath>
      <path d={`M${BOUNDS.x} 700 H${RIGHT} V${BLOCK_BOTTOM} H${BOUNDS.x} Z`} fill="url(#g-sat-depth)" clipPath="url(#clip-sat)" />
      {/* lentes: grava (muy permeable) y arcilla (acuitardo, casi impermeable) */}
      <path d={smoothPath(GRAVEL_LENS) + ' Z'} fill="url(#pat-gravel)" stroke="#4d7fa6" strokeWidth="1" />
      <path d={smoothPath(CLAY_LENS) + ' Z'} fill="url(#pat-clay)" stroke="#6f665a" strokeWidth="1.2" />
      {/* estratos y guijarros */}
      <g fill="none" stroke="#33586f" strokeWidth="1" opacity="0.16">
        {STRATA.map((st, i) => (
          <path key={i} d={smoothPath(st)} />
        ))}
      </g>
      <g>
        {PEBBLES.map(([x, y, r, a], i) => (
          <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.7} transform={`rotate(${a.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})`} fill={i % 3 ? '#b3a284' : '#a29276'} opacity="0.55" />
        ))}
      </g>
      {/* agua salada bajo la costa (cuña salina) */}
      <path d={wedgeZone} fill="url(#g-salt)" />
      <path d={linePath(wedge)} stroke="#cfeaf2" strokeWidth="2" strokeDasharray="6 5" fill="none" />
      {/* roca fracturada */}
      <path d={`${smoothPath(BEDROCK)} L${RIGHT} ${BLOCK_BOTTOM} L${BOUNDS.x} ${BLOCK_BOTTOM} Z`} fill="url(#pat-rock)" />
      <path d={smoothPath(BEDROCK)} stroke="#4f4b46" strokeWidth="2" fill="none" opacity="0.7" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {FRACTURES.map((f, i) => (
          <g key={i}>
            <path d={linePath(f)} stroke="#4a4f52" strokeWidth="3.2" opacity="0.8" />
            <path d={linePath(f)} stroke="#5aa2d6" strokeWidth="1.4" />
          </g>
        ))}
      </g>
      {/* mar en el corte */}
      <path d={`M${BOUNDS.x} ${SEA_LEVEL} L312 ${SEA_LEVEL} ${[...SEAFLOOR].reverse().map(([x, y]) => `L${x} ${y}`).join(' ')} Z`} fill="url(#g-sea-section)" />
      <path d={linePath(SEAFLOOR)} stroke="#8f7b5a" strokeWidth="3" fill="none" />
      <path d={`M${BOUNDS.x} ${SEA_LEVEL} L312 ${SEA_LEVEL}`} stroke="#d6eef8" strokeWidth="2" opacity="0.8" />
      {/* horizontes del suelo: B (mineral), A (con materia orgánica), O (hojarasca) */}
      <path d={band(LAND_ONLY, 11, SOIL_DEPTH)} fill="url(#pat-soil-b)" />
      <path d={band(LAND_ONLY, 0, 11)} fill="url(#pat-soil)" />
      <g ref={wetRef} style={{ opacity: 0.4 }}>
        <path d={band(LAND_ONLY, 0, SOIL_DEPTH)} fill="url(#pat-soil-wet)" />
      </g>
      <path d={band(LAND_ONLY, 0, 3)} fill="#2e1d12" opacity="0.85" />
      {/* lombriz y galerías en el horizonte A */}
      <path d="M548 723 q4 -4 8 0 t8 0 t8 -1" stroke="#d98a8a" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M980 640 q-6 6 -2 12 t-4 8" stroke="#3a2618" strokeWidth="2" fill="none" opacity="0.7" />
      {/* pavimento sobre el suelo de la ciudad */}
      {surface === 2 && <path d={bandRange(486, 820, 5)} fill="#6f7479" />}
      {surface === 1 && (
        <>
          <path d={bandRange(560, 620, 5)} fill="#6f7479" />
          <path d={bandRange(680, 740, 5)} fill="#6f7479" />
        </>
      )}
      {/* alcantarillado pluvial: lleva el agua de las calles al río */}
      <path d={smoothPath(STORM_PIPE)} stroke="#3f474e" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d={smoothPath(STORM_PIPE)} stroke="#8b959e" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d={`M812 708 L812 ${yFront(812) + 2}`} stroke="#3f474e" strokeWidth="5" />
      <path d={`M660 738 L660 ${yFront(660) + 2}`} stroke="#3f474e" strokeWidth="5" />
      {/* agua del río en el cauce */}
      <path d={`${linePath(LAND_FRONT_D.filter(([x, y]) => x > 368 && x < 444 && y >= RIVER_LEVEL - 2))} Z`} fill="#2f7fbf" />
      <path d={`M368 ${RIVER_LEVEL} L444 ${RIVER_LEVEL}`} stroke="#d6eef8" strokeWidth="2" />
      {/* raíces: árbol destacado y árboles del borde */}
      {vegetation > 0 && (
        <g fill="none" strokeLinecap="round">
          {FEATURED_TREE.roots.map((r, i) => (
            <path key={i} d={smoothPath(r)} stroke="#3f2a1b" strokeWidth={i === 2 ? 3 : 2.4} />
          ))}
          {FEATURED_TREE.roots.map((r, i) => (
            <path key={`t${i}`} d={smoothPath(r)} stroke="#8a6646" strokeWidth="0.9" />
          ))}
          {[880, 942, 1090, 1150, 1210].slice(0, vegetation === 2 ? 5 : 2).map((x) => {
            const y = yFront(x);
            return <path key={x} d={`M${x} ${y} q-6 8 -12 12 M${x} ${y} q2 10 0 18 M${x} ${y} q7 7 12 10`} stroke="#4a3220" strokeWidth="1.6" />;
          })}
        </g>
      )}
      {/* manantial: el nivel freático corta la superficie */}
      <path d={`M${SPRING[0] - 2} ${SPRING[1] + 1} q-6 6 -16 6`} stroke="#4c97cf" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* sombreado de profundidad */}
      <path d={`${linePath(GROUND)} L${RIGHT} ${BLOCK_BOTTOM} L${BOUNDS.x} ${BLOCK_BOTTOM} Z`} fill="url(#g-depth)" />
      {/* arista del corte */}
      <path d={linePath(LAND_ONLY)} stroke="#fbf6e9" strokeWidth="2" fill="none" opacity="0.9" />
    </g>
  );
});

/** Franja capilar y nivel freático (sus trazos los actualiza el motor). */
export const WaterTableLine = memo(
  forwardRef<SVGPathElement, { fringeRef: Ref<SVGPathElement> }>(function WaterTableLine({ fringeRef }, ref) {
    const { line } = buildWaterTable(0, 0);
    return (
      <g aria-hidden="true">
        <path ref={fringeRef} d={line} fill="none" stroke="#a9d8f2" strokeWidth="14" opacity="0.45" transform="translate(0 -7)" />
        <path ref={ref} d={line} fill="none" stroke="#0d4f94" strokeWidth="2.2" strokeDasharray="10 6" />
        {[520, 1480].map((x) => {
          const y = yWaterTable(x);
          return (
            <g key={x} transform={`translate(${x} ${y})`}>
              <path d="M-7 -12 L7 -12 L0 -2 Z" fill="#ffffff" stroke="#0d4f94" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M-6 4 h12 M-4 8 h8" stroke="#0d4f94" strokeWidth="1.4" />
            </g>
          );
        })}
      </g>
    );
  }),
);

/** Pozo de bombeo en el corte: tubería, rejilla y nivel del agua dentro del pozo. */
export const WellCasing = memo(function WellCasing({ pumping }: { pumping: number }) {
  const x = WELL.x;
  const top = yFront(x) - 10;
  const water = yWaterTable(x) + drawdown(x, pumping);
  return (
    <g aria-hidden="true">
      <rect x={x - 7} y={top} width="14" height={WELL.bottom - top} fill="#eef2f4" stroke="#3b4a57" strokeWidth="1.6" />
      <rect x={x - 4.5} y={water} width="9" height={WELL.bottom - water - 1} fill="#2f7fbf" />
      {/* rejilla: tramo ranurado por donde entra el agua */}
      <g stroke="#3b4a57" strokeWidth="1">
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d={`M${x - 7} ${WELL.screenTop + 6 + i * 8} h14`} />
        ))}
      </g>
      <path d={`M${x + 11} ${water} l10 -6 v12 Z`} fill="#ffffff" stroke="#0d4f94" strokeWidth="1.4" />
    </g>
  );
});

/** Pozos de observación (piezómetros). */
export const Wells = memo(function Wells() {
  return (
    <g aria-hidden="true">
      {WELLS.map((w) => {
        const top = yFront(w.x) - 12;
        const water = yWaterTable(w.x);
        return (
          <g key={w.x}>
            <rect x={w.x - 5} y={top} width="10" height={w.bottom - top} fill="#f4f7f9" stroke="#3b4a57" strokeWidth="1.6" />
            <rect x={w.x - 3.4} y={water} width="6.8" height={w.bottom - water - 1} fill="#2f7fbf" />
            <path d={`M${w.x - 5} ${w.bottom - 26} h10 M${w.x - 5} ${w.bottom - 18} h10 M${w.x - 5} ${w.bottom - 10} h10`} stroke="#3b4a57" strokeWidth="1" />
            <rect x={w.x - 7} y={top - 4} width="14" height="5" rx="1.5" fill="#3b4a57" />
            <path d={`M${w.x + 9} ${water} l10 -6 v12 Z`} fill="#ffffff" stroke="#0d4f94" strokeWidth="1.4" />
          </g>
        );
      })}
      <path
        d={`M${WELLS[1].x} ${yWaterTable(WELLS[1].x)} L${WELLS[0].x} ${yWaterTable(WELLS[0].x)}`}
        stroke="#0d4f94"
        strokeWidth="1.6"
        strokeDasharray="3 4"
        markerEnd="url(#m-subsurface)"
      />
    </g>
  );
});

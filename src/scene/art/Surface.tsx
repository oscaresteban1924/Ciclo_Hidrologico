// Cielo, montañas y superficie del paisaje (vista en perspectiva del bloque).

import { forwardRef, memo, useMemo } from 'react';
import { Glacier, Paramo, RockDetail } from './Highlands';
import { linePath, ribbon, seeded, smoothPath, type Pt } from '../../lib/paths';
import {
  BOUNDS,

  COASTLINE,
  CREEK,
  FAR_HILLS,
  FEATURED_TREE,
  FIELDS_POLY,
  FLANK_POLY,
  FOREST_POLY,
  GARDENS,
  HORIZON,
  HOUSES,
  LAKE,
  LAND_FRONT_D,
  MELT_STREAMS,
  MOUNTAIN_FOOT,
  PAVEMENT_FULL,
  PAVEMENT_PLAZAS,
  RIDGE,
  RIVER,
  SHADOW_FACES,
  SPURS,
  SPRING,
  STORM_DRAIN,
  STREETS,
  SUN,
  CLOUD_SHADOWS,
  REEDS,
  RIPARIAN,
  FAR_RANGE_1,
  FAR_RANGE_2,
  type CloudDef,
  distToPolyline,
  pointInPoly,
} from '../geometry';

/* ------------------------------------------------------------------ */
/* Cielo                                                                */
/* ------------------------------------------------------------------ */

export const Sky = memo(function Sky({ solar }: { solar: number }) {
  const glow = [160, 220, 280][solar];
  const rayOpacity = [0.05, 0.1, 0.16][solar];
  // Haces de luz que bajan desde el Sol (aire con partículas)
  const beams: [number, number, number][] = [
    [18, 0.9, 1], [34, 0.8, 0.7], [52, 1, 0.9], [70, 0.7, 0.6], [88, 0.9, 0.5],
  ];
  return (
    <g aria-hidden="true">
      <rect x={BOUNDS.x} y={BOUNDS.y} width={BOUNDS.w} height={HORIZON + 20 - BOUNDS.y} fill="url(#g-sky)" />
      <rect x={BOUNDS.x} y={BOUNDS.y} width={BOUNDS.w} height={HORIZON + 20 - BOUNDS.y} fill="url(#g-sky-warm)" />
      {/* cirros altos */}
      <g stroke="#ffffff" strokeLinecap="round" fill="none" opacity="0.5">
        <path d="M420 40 q60 -14 130 -4 t120 2" strokeWidth="2.2" />
        <path d="M470 54 q50 -8 100 -2" strokeWidth="1.4" />
        <path d="M760 26 q70 -12 150 -2 t110 6" strokeWidth="2" />
        <path d="M820 40 q40 -6 90 0" strokeWidth="1.2" />
        <path d="M1180 -10 q60 -10 120 0" strokeWidth="1.6" />
      </g>
      <g opacity={rayOpacity * 6} style={{ mixBlendMode: 'screen' }}>
        {beams.map(([deg, len, w], i) => {
          const a = (deg * Math.PI) / 180;
          const L = 980 * len;
          const spread = 0.05 * w;
          const x1 = SUN.x + Math.cos(a - spread) * L;
          const y1 = SUN.y + Math.sin(a - spread) * L;
          const x2 = SUN.x + Math.cos(a + spread) * L;
          const y2 = SUN.y + Math.sin(a + spread) * L;
          return <path key={i} d={`M${SUN.x} ${SUN.y} L${x1.toFixed(0)} ${y1.toFixed(0)} L${x2.toFixed(0)} ${y2.toFixed(0)} Z`} fill="url(#g-beam)" opacity={rayOpacity} />;
        })}
      </g>
      <g className="sun" style={{ transition: 'opacity .6s' }}>
        <circle cx={SUN.x} cy={SUN.y} r={glow} fill="url(#g-sun-glow)" />
        <g stroke="#ffd56b" strokeWidth="3" strokeLinecap="round" opacity={0.35 + solar * 0.25}>
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            const r1 = SUN.r + 14;
            const r2 = SUN.r + 24 + (i % 2) * 12 + solar * 7;
            return <line key={i} x1={SUN.x + Math.cos(a) * r1} y1={SUN.y + Math.sin(a) * r1} x2={SUN.x + Math.cos(a) * r2} y2={SUN.y + Math.sin(a) * r2} />;
          })}
        </g>
        <circle cx={SUN.x} cy={SUN.y} r={SUN.r} fill="url(#g-sun)" />
        <circle cx={SUN.x - 14} cy={SUN.y - 16} r={SUN.r * 0.45} fill="#fffdf2" opacity="0.55" />
      </g>
      {/* cordilleras lejanas */}
      <path d={`${smoothPath(FAR_RANGE_2)} L1920 520 L640 520 Z`} fill="url(#g-far2)" />
      <path d={`${smoothPath(FAR_RANGE_1)} L1920 520 L880 520 Z`} fill="url(#g-far1)" />
      <path d={smoothPath(FAR_RANGE_1.filter(([, y]) => y < 300))} stroke="#f4f8fb" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.65" />
      {/* bruma del horizonte */}
      <rect x={BOUNDS.x} y={HORIZON - 44} width={BOUNDS.w} height={60} fill="url(#g-haze)" />
    </g>
  );
});

/* ------------------------------------------------------------------ */
/* Nubes                                                                */
/* ------------------------------------------------------------------ */

export const Cloud = memo(
  forwardRef<SVGGElement, { def: CloudDef; tone: 0 | 1 | 2; className?: string }>(function Cloud({ def, tone, className }, ref) {
    const xs = def.circles.map((c) => c[0]);
    const minX = Math.min(...def.circles.map((c) => c[0] - c[2]));
    const maxX = Math.max(...def.circles.map((c) => c[0] + c[2]));
    const top = Math.min(...def.circles.map((c) => c[1] - c[2]));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const id = `g-cl-${def.id}-${tone}`;
    // tres tonos: cima iluminada, cuerpo y base en sombra (más oscura si llueve)
    const stops =
      tone === 0
        ? ['#ffffff', '#eef3f7', '#c3cfda']
        : tone === 1
          ? ['#f6f8fa', '#c9d3dc', '#7f90a2']
          : ['#e8ecef', '#9caab7', '#55657a'];
    const sorted = [...def.circles].sort((a, b) => b[1] - a[1]);
    return (
      <g ref={ref} className={className} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1={top} x2="0" y2={def.base} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={stops[0]} />
            <stop offset="0.55" stopColor={stops[1]} />
            <stop offset="1" stopColor={stops[2]} />
          </linearGradient>
          <radialGradient id={`${id}-hi`} cx="0.38" cy="0.3" r="0.65">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.25" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`clip-cl-${def.id}`}>
            <rect x={minX - 30} y={top - 30} width={maxX - minX + 60} height={def.base - top + 30} />
          </clipPath>
        </defs>
        <g clipPath={`url(#clip-cl-${def.id})`}>
          <g filter="url(#f-soft)">
            {sorted.map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} fill={`url(#${id})`} />
            ))}
            <ellipse cx={cx} cy={def.base - 12} rx={(maxX - minX) / 2 - 10} ry={18} fill={`url(#${id})`} />
          </g>
          {/* volumen: cada burbuja recibe luz desde el Sol (arriba a la izquierda) */}
          {def.circles.map(([x, y, r], i) => (
            <circle key={`h${i}`} cx={x - r * 0.18} cy={y - r * 0.22} r={r * 0.82} fill={`url(#${id}-hi)`} />
          ))}
        </g>
        {/* base plana y algo más oscura: allí está el nivel de condensación */}
        <path d={`M${minX + 18} ${def.base - 2} Q${cx} ${def.base + 4} ${maxX - 18} ${def.base - 2}`} stroke={stops[2]} strokeWidth="3" fill="none" opacity="0.6" filter="url(#f-soft)" />
      </g>
    );
  }),
);

/** Sombras que las nubes proyectan sobre el terreno. */
export const CloudShadows = memo(function CloudShadows({ rain }: { rain: number }) {
  return (
    <g aria-hidden="true" clipPath="url(#clip-land)">
      {CLOUD_SHADOWS.map((c) => (
        <ellipse key={c.cloud} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill="#0e2232" opacity={c.cloud === 'B' ? 0.1 + rain * 0.05 : 0.07} filter="url(#f-haze)" />
      ))}
    </g>
  );
});

/** Nube que el viento transporta desde el océano hacia la montaña (crece al ascender). */
export const DriftCloud = memo(function DriftCloud({ wind }: { wind: number }) {
  const dur = [30, 19, 11][wind];
  const circles: [number, number, number][] = [[-110, 352, 22], [-84, 338, 30], [-52, 334, 34], [-22, 342, 26], [-70, 356, 24]];
  return (
    <g aria-hidden="true" className="drift" style={{ animationDuration: `${dur}s` }}>
      <g filter="url(#f-soft)">
        {circles.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#ffffff" opacity="0.92" />
        ))}
        <ellipse cx={-66} cy={360} rx={52} ry={10} fill="#dfe7ee" />
      </g>
    </g>
  );
});

/* ------------------------------------------------------------------ */
/* Montañas y nieve                                                     */
/* ------------------------------------------------------------------ */

const MOUNTAIN_BODY: Pt[] = [...RIDGE, [1920, 820], [960, 820]];

function noise(x: number) {
  return 9 * Math.sin(x * 0.047) + 6 * Math.sin(x * 0.13 + 1.3) + 5 * Math.sin(x * 0.021 + 2.1);
}

/** Polígono de recorte de la nieve: todo lo que queda por encima de la línea de nieve. */
export function buildSnowClip(snowline: number): string {
  const pts: string[] = ['950,-600', '1950,-600'];
  for (let x = 1950; x >= 950; x -= 18) {
    // la nieve baja más por las cañadas (cerca de las crestas secundarias)
    const gully = 18 * Math.exp(-(((x - 1300) / 24) ** 2)) + 22 * Math.exp(-(((x - 1450) / 26) ** 2)) + 16 * Math.exp(-(((x - 1610) / 22) ** 2));
    pts.push(`${x},${Math.round(snowline + noise(x) + gully)}`);
  }
  return pts.join(' ');
}

export const Mountains = memo(
  forwardRef<SVGPolygonElement, object>(function Mountains(_props, clipRef) {
    const body = linePath(MOUNTAIN_BODY, true);
    return (
      <g aria-hidden="true">
        {/* colinas intermedias */}
        <path d={`${smoothPath(FAR_HILLS)} L980 490 L560 490 Z`} fill="url(#g-far)" />
        <path d={body} fill="url(#g-rock)" />
        {SHADOW_FACES.map((f, i) => (
          <path key={i} d={linePath(f, true)} fill="url(#g-rock-shadow)" opacity="0.85" />
        ))}
        {SPURS.map((s, i) => (
          <path key={i} d={smoothPath(s)} stroke="#5f5c57" strokeWidth="1.6" fill="none" opacity="0.6" />
        ))}
        <RockDetail />
        <Paramo />
        {/* bosque andino en la ladera baja */}
        <path d={linePath(FLANK_POLY, true)} fill="url(#g-andino)" filter="url(#f-haze)" opacity="0.97" />
        <defs>
          <clipPath id="clip-snow">
            <polygon ref={clipRef} points={buildSnowClip(272)} />
          </clipPath>
        </defs>
        <g clipPath="url(#clip-snow)">
          <path d={body} fill="url(#g-snow)" />
          {SHADOW_FACES.map((f, i) => (
            <path key={i} d={linePath(f, true)} fill="#c3d4e6" opacity="0.95" />
          ))}
          {SPURS.map((s, i) => (
            <path key={i} d={smoothPath(s)} stroke="#a9bfd6" strokeWidth="1.4" fill="none" />
          ))}
          <path d={smoothPath(RIDGE.filter(([x]) => x > 1150))} stroke="#ffffff" strokeWidth="3" fill="none" opacity="0.9" />
        </g>
        <Glacier />
      </g>
    );
  }),
);

/** Recortes reutilizables: tierra firme y mar (para sombras de nubes y reflejos). */
export const SurfaceClips = memo(function SurfaceClips() {
  return (
    <defs>
      <clipPath id="clip-land">
        <path d={linePath(LAND_TOP, true)} />
        <path d={linePath(FLANK_POLY, true)} />
      </clipPath>
      <clipPath id="clip-ocean">
        <path d={linePath(OCEAN_TOP, true)} />
      </clipPath>
    </defs>
  );
});

/* ------------------------------------------------------------------ */
/* Superficie: océano, costa, campos, lago, río, ciudad, bosque          */
/* ------------------------------------------------------------------ */

const LAND_TOP: Pt[] = [
  ...COASTLINE,
  [800, 472], [900, 476], [1000, 480],
  ...MOUNTAIN_FOOT,
  ...LAND_FRONT_D.filter(([x]) => x >= 310 && x < 1400).reverse(),
];

const OCEAN_TOP: Pt[] = [[BOUNDS.x, HORIZON], ...[...COASTLINE].reverse(), [312, 770], [BOUNDS.x, 770]];

const WAVES: { x: number; y: number; w: number }[] = (() => {
  const r = seeded(7);
  const out: { x: number; y: number; w: number }[] = [];
  for (let i = 0; i < 46; i++) {
    const y = 480 + r() * 285;
    const depth = (y - 470) / 300;
    const xMax = Math.min(600, 312 + (770 - y) * 1.05) - 30;
    const x = -300 + r() * (xMax + 300);
    out.push({ x, y, w: 8 + depth * 22 });
  }
  return out;
})();

/** Reflejo del sol: trazos horizontales que se ensanchan y se apagan hacia el frente. */
const GLINTS = (() => {
  const r = seeded(77);
  const out: { x: number; y: number; w: number; t: number; o: number }[] = [];
  for (let i = 0; i < 46; i++) {
    const k = r();
    const y = 478 + k * k * 290;
    const spread = 14 + (y - 474) * 0.3;
    out.push({ x: 170 + (r() - 0.5) * spread * 2, y, w: 6 + (y - 474) * 0.09 + r() * 10, t: 1 + (y - 474) / 160, o: 0.85 - (y - 474) / 400 });
  }
  return out;
})();

export const Ocean = memo(function Ocean() {
  return (
    <g aria-hidden="true">
      <path d={linePath(OCEAN_TOP, true)} fill="url(#g-ocean)" />
      {/* reflejo del cielo cerca del horizonte y brillo del sol sobre el agua */}
      <rect x={BOUNDS.x} y={HORIZON} width={1000} height={60} fill="url(#g-sea-sheen)" clipPath="url(#clip-ocean)" />
      <g clipPath="url(#clip-ocean)" stroke="#fff6d6" strokeLinecap="round">
        {GLINTS.map((g, i) => (
          <line key={i} x1={g.x - g.w / 2} y1={g.y} x2={g.x + g.w / 2} y2={g.y} strokeWidth={g.t} opacity={g.o} />
        ))}
      </g>
      <g stroke="#e3f3fb" strokeLinecap="round" fill="none" clipPath="url(#clip-ocean)">
        {WAVES.map((w, i) => (
          <path key={i} d={`M${w.x} ${w.y} q${w.w / 2} ${-w.w * 0.18} ${w.w} 0`} strokeWidth={0.8 + (w.y - 470) / 220} opacity={0.3 + (w.y - 470) / 600} />
        ))}
      </g>
      {/* rompientes y espuma de la orilla */}
      <path d={smoothPath(COASTLINE)} stroke="#ffffff" strokeWidth="5" fill="none" opacity="0.55" transform="translate(-7 3)" />
      <path d={smoothPath(COASTLINE)} stroke="#d9f0f7" strokeWidth="2" fill="none" opacity="0.8" transform="translate(-16 6)" strokeDasharray="14 10" />
    </g>
  );
});

const PATCHES: [number, number, number, number, boolean][] = (() => {
  const r = seeded(5);
  const out: [number, number, number, number, boolean][] = [];
  for (let i = 0; i < 46; i++) {
    const x = 380 + r() * 1000;
    const y = 480 + r() * 170;
    const k = 0.6 + ((y - 470) / 200) * 0.8;
    out.push([x, y, (18 + r() * 40) * k, (4 + r() * 6) * k, r() < 0.5]);
  }
  return out;
})();

export const Land = memo(function Land() {
  const beach = ribbon(COASTLINE, (t) => 18 - t * 12);
  return (
    <g aria-hidden="true">
      <path d={linePath(LAND_TOP, true)} fill="url(#g-land)" />
      <path d={linePath(LAND_TOP, true)} fill="url(#pat-grass)" />
      <g clipPath="url(#clip-land)">
        {PATCHES.map(([x, y, rx, ry, light], i) => (
          <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} fill={light ? '#c9dca6' : '#6f9a4f'} opacity={light ? 0.35 : 0.18} />
        ))}
      </g>
      <path d={beach} fill="#eadbb0" transform="translate(6 -2)" />
      {/* campos agrícolas detrás del río */}
      <path d={smoothPath(FIELDS_POLY) + ' Z'} fill="url(#pat-field)" opacity="0.9" />
      <path d="M700 480 L820 482 L860 500 L760 520 L680 530 Z" fill="url(#pat-field2)" opacity="0.95" />
      <path d="M560 560 L640 540 L700 560 L620 590 Z" fill="url(#pat-field2)" opacity="0.8" />
      <g stroke="#6f9654" strokeWidth="3" strokeLinecap="round" opacity="0.7" fill="none">
        <path d="M680 530 L760 520 L860 500" />
        <path d="M620 590 L700 560" />
      </g>
    </g>
  );
});

export const Lake = memo(function Lake() {
  return (
    <g aria-hidden="true">
      <ellipse cx={LAKE.cx} cy={LAKE.cy + 1} rx={LAKE.rx + 6} ry={LAKE.ry + 4} fill="#d9e6c9" />
      <ellipse cx={LAKE.cx} cy={LAKE.cy} rx={LAKE.rx} ry={LAKE.ry} fill="url(#g-lake)" />
      <g stroke="#e6f4fb" strokeWidth="1.2" strokeLinecap="round" opacity="0.7">
        <path d={`M${LAKE.cx - 50} ${LAKE.cy - 4} h24`} />
        <path d={`M${LAKE.cx + 10} ${LAKE.cy + 3} h30`} />
        <path d={`M${LAKE.cx - 20} ${LAKE.cy + 9} h18`} />
      </g>
    </g>
  );
});

/** Río con ancho y turbidez variables. */
export const River = memo(function River({ level, turbidity }: { level: number; turbidity: number }) {
  const k = 0.75 + level * 0.6;
  const d = ribbon(RIVER, (t) => (5 + t * 22) * k);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * Math.min(1, turbidity * 0.85));
  const color = `rgb(${mix(52, 138)}, ${mix(134, 116)}, ${mix(196, 82)})`;
  return (
    <g aria-hidden="true">
      <path d={ribbon(RIVER, (t) => (5 + t * 22) * k + 6)} fill="#cfdcb3" opacity="0.9" />
      <path d={d} fill={color} style={{ transition: 'fill .8s' }} />
    </g>
  );
});

/** Reflejos que avanzan con la corriente (capa animada). */
export const RiverFlow = memo(function RiverFlow({ level }: { level: number }) {
  const k = 0.75 + level * 0.6;
  return (
    <path d={smoothPath(RIVER)} stroke="#cfeaf8" strokeWidth={1.2 * k} fill="none" opacity="0.65" strokeDasharray="10 14" className="flow-dash" style={{ animationDuration: `${2.6 - level * 1.4}s` }} aria-hidden="true" />
  );
});

export const Streams = memo(function Streams({ melt }: { melt: number }) {
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round">
      {MELT_STREAMS.map((s, i) => (
        <g key={i}>
          <path d={smoothPath(s)} stroke="#e9f2f7" strokeWidth={3 + melt * 2.5} opacity="0.8" />
          <path d={smoothPath(s)} stroke="#5aa6db" strokeWidth={1.4 + melt * 2.2} style={{ transition: 'stroke-width .8s' }} />
        </g>
      ))}
      <path d={smoothPath(CREEK)} stroke="#d5e6c6" strokeWidth="6" />
      <path d={smoothPath(CREEK)} stroke="#4c97cf" strokeWidth="3" />
      <ellipse cx={SPRING[0]} cy={SPRING[1] - 3} rx="9" ry="3.5" fill="#4c97cf" stroke="#d5e6c6" strokeWidth="1.5" />
    </g>
  );
});

/* ------------------------------------------------------------------ */
/* Ciudad                                                               */
/* ------------------------------------------------------------------ */

const ROOFS = ['#a5553f', '#bd7a43', '#6f6589', '#4f6f7c'];
const ROOFS_DARK = ['#8a4533', '#9f6537', '#5b5372', '#405b66'];
const WALLS = ['#f3ece0', '#e7dcc7', '#f5f1e8', '#e2d6c0'];
const WALLS_DARK = ['#cfc6b7', '#c4b9a4', '#d2cdc3', '#bfb39e'];

function House({ x, y, w, hue }: { x: number; y: number; w: number; hue: number }) {
  const h = w * 0.62;
  const dx = w * 0.32;
  const dy = w * 0.2;
  const rh = w * 0.42;
  const wall = WALLS[hue % 4];
  const wallDark = WALLS_DARK[hue % 4];
  const roof = ROOFS[hue % 4];
  const roofDark = ROOFS_DARK[hue % 4];
  return (
    <g>
      <ellipse cx={x + dx * 0.4} cy={y + 1.5} rx={w * 0.72} ry={w * 0.12} fill="#2c3b2a" opacity="0.18" />
      {/* lado */}
      <path d={`M${x + w / 2} ${y} L${x + w / 2 + dx} ${y - dy} L${x + w / 2 + dx} ${y - h - dy} L${x + w / 2} ${y - h} Z`} fill={wallDark} />
      {/* frente */}
      <rect x={x - w / 2} y={y - h} width={w} height={h} fill={wall} />
      {/* techo */}
      <path d={`M${x} ${y - h - rh} L${x + dx} ${y - h - rh - dy} L${x + w / 2 + dx + 2} ${y - h - dy} L${x + w / 2 + 2} ${y - h} Z`} fill={roofDark} />
      <path d={`M${x - w / 2 - 2} ${y - h} L${x} ${y - h - rh} L${x + w / 2 + 2} ${y - h} Z`} fill={roof} />
      {/* ventanas y puerta */}
      <rect x={x - w * 0.36} y={y - h * 0.72} width={w * 0.2} height={h * 0.26} fill="#7fa9c4" />
      <rect x={x + w * 0.16} y={y - h * 0.72} width={w * 0.2} height={h * 0.26} fill="#7fa9c4" />
      <rect x={x - w * 0.08} y={y - h * 0.48} width={w * 0.16} height={h * 0.48} fill="#6b4c37" />
    </g>
  );
}

export const Town = memo(function Town({ surface }: { surface: 0 | 1 | 2 }) {
  const houses = [...HOUSES].sort((a, b) => a.y - b.y);
  return (
    <g aria-hidden="true">
      {surface === 2 && <path d={linePath(PAVEMENT_FULL, true)} fill="#8a8f95" />}
      {surface === 2 && (
        <g stroke="#f2f2ee" strokeWidth="1.2" opacity="0.7">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M${600 + i * 40} ${646 - i * 11} l10 14`} />
          ))}
        </g>
      )}
      {surface < 2 &&
        GARDENS.slice(0, surface === 0 ? 4 : 2).map((g, i) => <path key={i} d={linePath(g, true)} fill="#93c26c" opacity="0.95" />)}
      {surface >= 1 && PAVEMENT_PLAZAS.map((p, i) => <path key={i} d={linePath(p, true)} fill="#8f949a" />)}
      {STREETS.map((s, i) => (
        <path key={i} d={smoothPath(s)} stroke="#7d8389" strokeWidth={i === 0 ? (surface === 0 ? 7 : 10) : surface === 0 ? 4 : 6} fill="none" strokeLinecap="round" />
      ))}
      <path d={smoothPath(STREETS[0])} stroke="#e9e5d6" strokeWidth="0.8" strokeDasharray="5 6" fill="none" />
      {/* alcantarilla pluvial que desagua en el río */}
      <g>
        <rect x={STORM_DRAIN[0] - 5} y={STORM_DRAIN[1] - 3} width="10" height="6" rx="1.5" fill="#4a4f55" />
        <path d={`M${STORM_DRAIN[0] - 4} ${STORM_DRAIN[1]} l-10 6`} stroke="#4a4f55" strokeWidth="3" />
      </g>
      {houses.map((h, i) => (
        <House key={i} {...h} />
      ))}
      {surface === 0 &&
        [
          [598, 690], [702, 676], [826, 652], [662, 628],
        ].map(([x, y], i) => <BroadTree key={i} x={x} y={y} s={0.65} hue={i} />)}
    </g>
  );
});

/* ------------------------------------------------------------------ */
/* Bosque                                                               */
/* ------------------------------------------------------------------ */

const LEAF = ['#3f7d4a', '#4d8c52', '#356f44', '#5a9758'];
const LEAF_HI = ['#6aa865', '#79b46c', '#5e9b5b', '#86bd73'];
const CONIFER = ['#2f5f47', '#3a6e52', '#2a5440'];

function BroadTree({ x, y, s, hue }: { x: number; y: number; s: number; hue: number }) {
  const c = LEAF[hue % 4];
  const hi = LEAF_HI[hue % 4];
  return (
    <g>
      <ellipse cx={x + 3 * s} cy={y + 1} rx={9 * s} ry={2.4 * s} fill="#23331f" opacity="0.2" />
      <rect x={x - 1.3 * s} y={y - 11 * s} width={2.6 * s} height={11 * s} fill="#6a4a33" />
      <circle cx={x - 5.5 * s} cy={y - 13 * s} r={6.8 * s} fill={c} />
      <circle cx={x + 5.5 * s} cy={y - 13 * s} r={6.8 * s} fill={c} />
      <circle cx={x} cy={y - 18 * s} r={8.5 * s} fill={c} />
      <circle cx={x - 2.6 * s} cy={y - 21 * s} r={4.2 * s} fill={hi} />
    </g>
  );
}

function Conifer({ x, y, s, hue }: { x: number; y: number; s: number; hue: number }) {
  const c = CONIFER[hue % 3];
  return (
    <g>
      <ellipse cx={x + 3 * s} cy={y + 1} rx={7 * s} ry={2 * s} fill="#23331f" opacity="0.2" />
      <rect x={x - 1 * s} y={y - 6 * s} width={2 * s} height={6 * s} fill="#5e432f" />
      <path d={`M${x} ${y - 30 * s} L${x - 7.5 * s} ${y - 6 * s} L${x + 7.5 * s} ${y - 6 * s} Z`} fill={c} />
      <path d={`M${x} ${y - 30 * s} L${x - 5 * s} ${y - 14 * s} L${x} ${y - 16 * s} Z`} fill="#4f8566" opacity="0.8" />
    </g>
  );
}

interface TreeSpot {
  x: number;
  y: number;
  s: number;
  hue: number;
  kind: 'broad' | 'andino' | 'palma' | 'conifer';
  rank: number;
}

const ANDINO = ['#2f5b3c', '#3b6a43', '#2a5236', '#466f45'];
const ANDINO_HI = ['#5f8f5a', '#6d9b5e', '#53814f', '#7aa466'];

/** Árbol del bosque andino: copa redondeada y densa. */
function AndeanTree({ x, y, s, hue }: { x: number; y: number; s: number; hue: number }) {
  const c = ANDINO[hue % 4];
  const hi = ANDINO_HI[hue % 4];
  return (
    <g>
      <rect x={x - 1 * s} y={y - 8 * s} width={2 * s} height={8 * s} fill="#4f3a2a" />
      <ellipse cx={x} cy={y - 13 * s} rx={8.5 * s} ry={7.5 * s} fill={c} />
      <ellipse cx={x - 3 * s} cy={y - 16 * s} rx={4.5 * s} ry={3.6 * s} fill={hi} opacity="0.9" />
    </g>
  );
}

/** Palma de cera: tronco muy alto y delgado que sobresale del bosque. */
function WaxPalm({ x, y, s }: { x: number; y: number; s: number }) {
  const h = 46 * s;
  return (
    <g>
      <path d={`M${x} ${y} C${x + 1 * s} ${y - h * 0.4} ${x - 1 * s} ${y - h * 0.7} ${x} ${y - h}`} stroke="#d8d2bf" strokeWidth={2 * s} fill="none" />
      <g stroke="#3f7a43" strokeWidth={1.8 * s} strokeLinecap="round" fill="none">
        <path d={`M${x} ${y - h} q${-7 * s} ${-2 * s} ${-11 * s} ${4 * s}`} />
        <path d={`M${x} ${y - h} q${7 * s} ${-2 * s} ${11 * s} ${4 * s}`} />
        <path d={`M${x} ${y - h} q${-3 * s} ${-6 * s} ${-8 * s} ${-6 * s}`} />
        <path d={`M${x} ${y - h} q${3 * s} ${-6 * s} ${8 * s} ${-6 * s}`} />
        <path d={`M${x} ${y - h} q${0} ${-5 * s} ${1 * s} ${-9 * s}`} />
      </g>
    </g>
  );
}

const TREES: TreeSpot[] = (() => {
  const r = seeded(42);
  const out: TreeSpot[] = [];
  const avoid = (x: number, y: number) =>
    distToPolyline(x, y, CREEK) < 12 ||
    distToPolyline(x, y, RIVER) < 16 ||
    MELT_STREAMS.some((m) => distToPolyline(x, y, m) < 10) ||
    ((x - LAKE.cx) / (LAKE.rx + 14)) ** 2 + ((y - LAKE.cy) / (LAKE.ry + 12)) ** 2 < 1 ||
    (Math.abs(x - 1010) < 82 && y > 560);
  let tries = 0;
  while (out.length < 150 && tries++ < 6000) {
    const inForest = r() < 0.5;
    const poly = inForest ? FOREST_POLY : FLANK_POLY;
    const x = inForest ? 850 + r() * 490 : 1070 + r() * 530;
    const y = inForest ? 536 + r() * 112 : 400 + r() * 190;
    if (!pointInPoly(x, y, poly) || avoid(x, y)) continue;
    if (out.some((t) => Math.abs(t.x - x) < 9 && Math.abs(t.y - y) < 6)) continue;
    const s = 0.5 + ((y - 400) / 250) * 0.75;
    const roll = r();
    const kind: TreeSpot['kind'] = inForest ? (roll < 0.12 ? 'andino' : 'broad') : roll < 0.08 ? 'palma' : 'andino';
    out.push({ x, y, s, hue: Math.floor(r() * 12), kind, rank: r() });
  }
  return out.sort((a, b) => a.y - b.y);
})();

export const Forest = memo(function Forest({ vegetation }: { vegetation: 0 | 1 | 2 }) {
  const limit = [0.2, 0.58, 1][vegetation];
  const shown = useMemo(() => TREES.filter((t) => t.rank < limit), [limit]);
  return (
    <g aria-hidden="true">
      <g stroke="#6f9a52" strokeWidth="1.2" strokeLinecap="round" opacity="0.8">
        {TREES.filter((_t, i) => i % 3 === 0).map((t, i) => (
          <path key={i} d={`M${t.x + 8} ${t.y + 3} l-2 -5 M${t.x + 10} ${t.y + 3} l1 -6 M${t.x + 12} ${t.y + 3} l3 -4`} />
        ))}
      </g>
      {shown.map((t, i) =>
        t.kind === 'broad' ? (
          <BroadTree key={i} x={t.x} y={t.y} s={t.s * 1.05} hue={t.hue} />
        ) : t.kind === 'palma' ? (
          <WaxPalm key={i} x={t.x} y={t.y} s={t.s} />
        ) : t.kind === 'conifer' ? (
          <Conifer key={i} x={t.x} y={t.y} s={t.s} hue={t.hue} />
        ) : (
          <AndeanTree key={i} x={t.x} y={t.y} s={t.s} hue={t.hue} />
        ),
      )}
    </g>
  );
});

/** Vegetación de ribera y juncos del humedal en la desembocadura. */
export const RiverBanks = memo(function RiverBanks({ vegetation }: { vegetation: 0 | 1 | 2 }) {
  const n = [5, 11, RIPARIAN.length][vegetation];
  return (
    <g aria-hidden="true">
      <g stroke="#5e8a3e" strokeWidth="1.3" strokeLinecap="round">
        {REEDS.map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x - 4} ${y} l-1 -10 M${x} ${y} l0 -13 M${x + 4} ${y} l1.5 -9 M${x + 7} ${y} l2 -7`} />
            <path d={`M${x} ${y - 13} v-3`} stroke="#7b5a35" strokeWidth="2.4" />
          </g>
        ))}
      </g>
      {RIPARIAN.slice(0, n).map(([x, y], i) => (
        <BroadTree key={i} x={x} y={y} s={0.55 + ((y - 500) / 220) * 0.35} hue={i + 1} />
      ))}
    </g>
  );
});

/** Árbol grande junto al corte: permite ver raíces, xilema e intercepción. */
export const FeaturedTree = memo(function FeaturedTree({ vegetation }: { vegetation: 0 | 1 | 2 }) {
  const [bx, by] = FEATURED_TREE.base;
  if (vegetation === 0) {
    return (
      <g aria-hidden="true">
        <path d={`M${bx - 10} ${by} q10 -16 20 0`} fill="#7da35b" />
        <path d={`M${bx - 3} ${by} v-6 h6 v6 Z`} fill="#6a4a33" />
      </g>
    );
  }
  const sc = vegetation === 1 ? 0.86 : 1;
  return (
    <g aria-hidden="true" transform={`translate(${bx} ${by}) scale(${sc}) translate(${-bx} ${-by})`}>
      <ellipse cx={bx + 8} cy={by - 1} rx="40" ry="5" fill="#23331f" opacity="0.22" />
      <path
        d={`M${bx - 7} ${by} C${bx - 5} ${by - 30} ${bx - 4} ${by - 60} ${bx - 3} ${by - 82} L${bx + 3} ${by - 82} C${bx + 4} ${by - 60} ${bx + 5} ${by - 30} ${bx + 7} ${by} Z`}
        fill="#6e4c34"
      />
      <path d={`M${bx - 2} ${by - 58} q-14 -8 -22 -26 M${bx + 2} ${by - 62} q14 -6 24 -24 M${bx} ${by - 78} q-2 -10 2 -22`} stroke="#6e4c34" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d={`M${bx - 1} ${by - 4} V${by - 80}`} stroke="#8b6646" strokeWidth="1.2" opacity="0.7" />
      {FEATURED_TREE.canopy.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={LEAF[i % 4]} />
      ))}
      {FEATURED_TREE.canopy.map(([x, y, r], i) => (
        <circle key={`h${i}`} cx={x - r * 0.3} cy={y - r * 0.35} r={r * 0.45} fill={LEAF_HI[i % 4]} opacity="0.85" />
      ))}
      <g fill="#2f6a3f" opacity="0.55">
        {FEATURED_TREE.canopy.map(([x, y, r], i) => (
          <path key={i} d={`M${x - r * 0.6} ${y + r * 0.4} q${r * 0.6} ${r * 0.45} ${r * 1.2} 0`} />
        ))}
      </g>
    </g>
  );
});

export { House, BroadTree };

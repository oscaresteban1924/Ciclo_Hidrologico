// Vista de detalle «poros, fracturas y carga hidráulica»: dos pozos de observación con niveles
// distintos, flujo de mayor a menor carga y caminos entre granos o por fracturas, hasta el río.

import { memo } from 'react';
import { BigArrow, Drop, INK, WATER_DEEP, ease, lerp, makeGrains, ramp } from './common';

const SURF = (x: number) => 96 + (x / 640) * 70 + Math.sin(x / 90) * 4;
const WT = (x: number) => 150 + (x / 560) * 52;
const BOTTOM = 336;
const RIVER_X = 572;
const WELLS = [150, 410];

/** Material del acuífero: velocidad relativa (tendencia, no medida) y aspecto. */
const MATERIAL: Record<string, { speed: number; label: string }> = {
  grava: { speed: 1, label: 'Grava: poros grandes y bien conectados' },
  arena: { speed: 0.45, label: 'Arena: poros medianos' },
  arcilla: { speed: 0.05, label: 'Arcilla: poros diminutos, casi no deja pasar (acuitardo)' },
  roca: { speed: 0.6, label: 'Roca: el agua solo circula por las fracturas' },
};

const G_GRAVA = makeGrains({ seed: 2, x0: -10, x1: 650, y0: 120, y1: BOTTOM + 14, rMin: 13, rMax: 21, gap: 6, n: 170, fills: ['#c7b28c', '#b8a07a', '#d3c09c', '#a9946f'] });
const G_ARENA = makeGrains({ seed: 4, x0: -10, x1: 650, y0: 120, y1: BOTTOM + 10, rMin: 6, rMax: 10, gap: 3.5, n: 620, fills: ['#dcbd8c', '#cfac78', '#e5cda3', '#c9a46f'] });

/** Líneas de flujo: bajan desde la zona de recarga y suben hacia el río. */
const FLOW_LINES: [number, number][][] = [
  [[20, 176], [140, 200], [300, 226], [450, 230], [540, 214], [RIVER_X, 202]],
  [[20, 200], [150, 240], [300, 272], [460, 268], [548, 232], [RIVER_X + 6, 206]],
  [[20, 226], [160, 282], [320, 312], [480, 300], [556, 248], [RIVER_X + 12, 210]],
];
const FRACTURES: [number, number][][] = [
  [[30, 188], [120, 214], [210, 236], [300, 248], [400, 250], [480, 236], [548, 218], [RIVER_X, 204]],
  [[60, 240], [150, 268], [250, 300], [350, 296], [450, 274], [530, 236], [RIVER_X + 8, 208]],
  [[210, 236], [250, 300]],
  [[400, 250], [450, 274]],
];

function at(path: [number, number][], k: number): [number, number] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    seg.push(d);
    total += d;
  }
  let s = k * total;
  for (let i = 0; i < seg.length; i++) {
    if (s <= seg[i]) {
      const f = s / seg[i];
      return [lerp(path[i][0], path[i + 1][0], f), lerp(path[i][1], path[i + 1][1], f)];
    }
    s -= seg[i];
  }
  return path[path.length - 1];
}

const surfPath = () => {
  let d = 'M0 0 H640 V' + SURF(640).toFixed(1);
  for (let x = 640; x >= 0; x -= 16) d += ` L${x} ${SURF(x).toFixed(1)}`;
  return d + ' Z';
};
const wtPath = () => {
  let d = `M0 ${WT(0)}`;
  for (let x = 16; x <= RIVER_X; x += 16) d += ` L${x} ${WT(x).toFixed(1)}`;
  return d + ` L640 ${WT(RIVER_X).toFixed(1)}`;
};

const Material = memo(function Material({ variant }: { variant: string }) {
  if (variant === 'grava' || variant === 'arena') {
    const grains = variant === 'grava' ? G_GRAVA : G_ARENA;
    return (
      <>
        {grains.map((g, i) => (
          <path key={i} d={g.d} fill={g.fill} stroke="#8d7550" strokeWidth={variant === 'grava' ? 1.2 : 0.7} />
        ))}
      </>
    );
  }
  if (variant === 'arcilla') {
    return (
      <>
        <defs>
          <pattern id="gw-clay" width="26" height="10" patternUnits="userSpaceOnUse">
            <rect width="26" height="10" fill="#9a8d7c" />
            <ellipse cx="7" cy="3" rx="6" ry="1.6" fill="#a99c89" />
            <ellipse cx="19" cy="7.5" rx="6" ry="1.6" fill="#8c806f" />
          </pattern>
        </defs>
        <rect x="0" y="120" width="640" height={BOTTOM - 110} fill="url(#gw-clay)" />
      </>
    );
  }
  return (
    <>
      <rect x="0" y="120" width="640" height={BOTTOM - 110} fill="#8f8a83" />
      <g stroke="#7d7870" strokeWidth="1" fill="none">
        <path d="M0 190 H640 M0 262 H640 M0 318 H640" />
      </g>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {FRACTURES.map((f, i) => (
          <g key={i}>
            <path d={`M${f.map((p) => p.join(' ')).join(' L')}`} stroke="#3f4448" strokeWidth="8" />
            <path d={`M${f.map((p) => p.join(' ')).join(' L')}`} stroke="#9fd0ef" strokeWidth="4" />
          </g>
        ))}
      </g>
    </>
  );
});

export function GroundwaterArt({ t, clock, variant }: { t: number; clock: number; variant: string }) {
  const mat = MATERIAL[variant] ?? MATERIAL.arena;
  const fill = ease(ramp(t, 0.4, 3.5));
  const flowOn = ramp(t, 4.6, 5.4);
  const paths = variant === 'roca' ? FRACTURES.slice(0, 2) : FLOW_LINES;
  return (
    <>
      <clipPath id="gw-sat">
        <path d={`${wtPath()} L640 ${BOTTOM} L0 ${BOTTOM} Z`} />
      </clipPath>
      <clipPath id="gw-ground">
        <rect x="0" y="0" width="640" height={BOTTOM} />
      </clipPath>

      {/* subsuelo: zona no saturada arriba (aire en los poros) y saturada abajo */}
      <rect x="0" y="0" width="640" height="400" fill="#f4ecdc" />
      <g clipPath="url(#gw-sat)">
        <rect x="0" y="0" width="640" height="400" fill="#79b2d6" />
      </g>
      <g clipPath="url(#gw-ground)">
        <g opacity={variant === 'roca' ? 1 : 0.95}>
          <Material variant={variant} />
        </g>
        {variant !== 'roca' && (
          <g clipPath="url(#gw-sat)" opacity="0.35">
            <rect x="0" y="0" width="640" height="400" fill="#4f93c4" />
          </g>
        )}
      </g>
      {/* superficie, ladera y cielo */}
      <path d={surfPath()} fill="#dfeef6" />
      <path d={(() => {
        let d = `M0 ${SURF(0)}`;
        for (let x = 16; x <= 640; x += 16) d += ` L${x} ${SURF(x).toFixed(1)}`;
        return d;
      })()} stroke="#5f8a45" strokeWidth="7" fill="none" />
      {/* río (zona de descarga) */}
      <path d={`M${RIVER_X - 26} ${SURF(RIVER_X - 26) + 2} Q${RIVER_X + 10} ${WT(RIVER_X) + 16} ${RIVER_X + 52} ${SURF(RIVER_X + 52) + 2} Z`} fill="#3a86c4" />
      <text x={RIVER_X + 10} y={SURF(RIVER_X) - 12} textAnchor="middle" className="d-label">
        Río
      </text>
      {/* nivel freático */}
      <path d={wtPath()} stroke={WATER_DEEP} strokeWidth="2.6" strokeDasharray="10 6" fill="none" />
      <path d={`M${36} ${WT(36) - 14} l8 12 l8 -12 Z`} fill="#fff" stroke={WATER_DEEP} strokeWidth="2" />
      <path d={`M0 ${BOTTOM} H640`} stroke="#4f4b46" strokeWidth="3" />
      <rect x="0" y={BOTTOM + 1.5} width="640" height={400 - BOTTOM} fill="#6b6660" />
      <text x="320" y={BOTTOM + 34} textAnchor="middle" className="d-label" fill="#f2efe9">
        Capa casi impermeable
      </text>

      {/* pozos de observación: la altura del agua es la carga hidráulica */}
      {WELLS.map((x, i) => {
        const level = lerp(BOTTOM - 6, WT(x), fill);
        return (
          <g key={x}>
            <rect x={x - 11} y={SURF(x) - 26} width="22" height={BOTTOM - SURF(x) + 20} fill="#fff" stroke={INK} strokeWidth="2" />
            <rect x={x - 9} y={level} width="18" height={BOTTOM - level - 6} fill="url(#d-ripple)" />
            <path d={`M${x - 15} ${level} H${x + 15}`} stroke={WATER_DEEP} strokeWidth="3" opacity={fill} />
            <text x={x} y={SURF(x) - 34} textAnchor="middle" className="d-label">
              {i === 0 ? 'Pozo 1' : 'Pozo 2'}
            </text>
          </g>
        );
      })}
      {/* diferencia de carga */}
      {t >= 4.5 && (
        <g opacity={flowOn}>
          <path d={`M${WELLS[0] + 26} ${WT(WELLS[0])} H${WELLS[1] + 26} M${WELLS[1] + 26} ${WT(WELLS[0])} V${WT(WELLS[1])}`} stroke={INK} strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
          <text x={WELLS[1] + 34} y={(WT(WELLS[0]) + WT(WELLS[1])) / 2 + 5} className="d-label">
            diferencia de carga
          </text>
          <BigArrow d={`M${WELLS[0] + 40} ${WT(WELLS[0]) + 40} L${WELLS[1] - 40} ${WT(WELLS[1]) + 40}`} color={WATER_DEEP} width={5} />
          <text x={(WELLS[0] + WELLS[1]) / 2} y={WT(WELLS[0]) + 84} textAnchor="middle" className="d-label">
            de mayor a menor carga
          </text>
        </g>
      )}

      {/* porciones de agua que avanzan por los poros o las fracturas */}
      {t >= 4.5 &&
        paths.map((p, j) =>
          Array.from({ length: variant === 'roca' ? 6 : 5 }, (_, i) => {
            const k = (clock * 0.07 * mat.speed + i / 5 + j * 0.13) % 1;
            const [x, y] = at(p, k);
            const wiggle = variant === 'roca' ? 0 : Math.sin(k * 60 + j) * (variant === 'grava' ? 6 : 3);
            return <Drop key={`${j}-${i}`} x={x} y={y + wiggle} s={0.75} opacity={flowOn * (k > 0.94 ? (1 - k) * 16 : 1)} />;
          }),
        )}

      {/* lupa: el camino real rodea los granos */}
      {t >= 9.5 && variant !== 'roca' && (
        <g opacity={ramp(t, 9.5, 10.2)}>
          <rect x="16" y="282" width={variant === 'arcilla' ? 360 : 300} height="30" rx="15" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <text x={variant === 'arcilla' ? 196 : 166} y="302" textAnchor="middle" className="d-label">
            {variant === 'arcilla' ? 'Poros diminutos: el agua casi no avanza' : 'El agua rodea los granos por los poros'}
          </text>
        </g>
      )}
      {t >= 9.5 && variant === 'roca' && (
        <g opacity={ramp(t, 9.5, 10.2)}>
          <rect x="16" y="300" width="300" height="30" rx="15" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <text x="166" y="320" textAnchor="middle" className="d-label">
            Solo circula por las fracturas
          </text>
        </g>
      )}
      {t >= 15 && (
        <g opacity={ramp(t, 15, 15.8)}>
          <BigArrow d={`M${RIVER_X - 30} ${WT(RIVER_X - 30) + 10} Q${RIVER_X - 4} ${WT(RIVER_X) + 4} ${RIVER_X + 2} ${WT(RIVER_X) - 6}`} color={WATER_DEEP} width={4} />
          <rect x="420" y="8" width="210" height="28" rx="14" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <text x="525" y="27" textAnchor="middle" className="d-label">
            Flujo base hacia el río
          </text>
        </g>
      )}
      <text x="634" y="56" textAnchor="end" className="d-small">
        {mat.label}
      </text>
    </>
  );
}

export function GroundwaterResult({ variant }: { variant: string }) {
  const rows = [
    { id: 'grava', label: 'Grava', v: 1, word: 'rápido (para el subsuelo)' },
    { id: 'arena', label: 'Arena', v: 0.45, word: 'lento' },
    { id: 'arcilla', label: 'Arcilla', v: 0.04, word: 'muy, muy lento' },
    { id: 'roca', label: 'Roca fracturada', v: -1, word: 'depende de cuántas fracturas haya y de cómo se conectan' },
  ];
  return (
    <div className="d-result">
      <p className="d-result-title">Rapidez del agua subterránea con la misma diferencia de carga (tendencias, no medidas)</p>
      <dl>
        {rows.map((r) => (
          <div key={r.id} className={`d-row${r.id === variant ? ' is-current' : ''}`}>
            <dt>{r.label}</dt>
            <dd>
              {r.v >= 0 && (
                <span className="d-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(3, r.v * 100)}%` }} />
                </span>
              )}
              {r.word}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

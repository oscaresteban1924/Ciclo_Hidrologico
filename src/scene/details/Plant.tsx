// Vista de detalle «de la raíz a la hoja»: absorción por pelos radicales, ascenso por el xilema
// y salida de vapor por los estomas. El vapor es invisible: se representa con anillos punteados.

import { memo } from 'react';
import { AIR, BigArrow, Drop, INK, Vapor, WATER, lerp, makeGrains, ramp, seeded } from './common';

const SOIL_Y = 300;
const STEM_X = 150;
const LEAF = { x: 270, y: 58, w: 350, h: 170 };
const STOMA_X = LEAF.x + LEAF.w * 0.55;

const SOIL_GRAINS = makeGrains({ seed: 5, x0: -6, x1: 646, y0: SOIL_Y + 6, y1: 404, rMin: 7, rMax: 12, gap: 4, n: 150, fills: ['#b58b5e', '#a77d52', '#c29a6b', '#9c7449'] });

const ROOT_HAIRS: [number, number, number][] = (() => {
  const r = seeded(3);
  const out: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const k = i / 15;
    const x = STEM_X - 10 - k * 70;
    const y = SOIL_Y + 18 + k * 66;
    out.push([x, y, (r() - 0.5) * 60 + (i % 2 ? 40 : -140)]);
  }
  return out;
})();

/** Células del mesófilo esponjoso con espacios de aire entre ellas. */
const SPONGY = makeGrains({ seed: 21, x0: LEAF.x + 8, x1: LEAF.x + LEAF.w - 8, y0: LEAF.y + 86, y1: LEAF.y + LEAF.h - 28, rMin: 10, rMax: 15, gap: 7, n: 40, fills: ['#8fc66f', '#9ccf7c', '#86bd67'] });

const Static = memo(function Static({ dry }: { dry: boolean }) {
  return (
    <>
      {/* suelo con granos y películas de agua */}
      <rect x="0" y={SOIL_Y} width="640" height={400 - SOIL_Y} fill={AIR} />
      {SOIL_GRAINS.map((g, i) => (
        <path key={`w${i}`} d={g.d} fill={WATER} stroke={WATER} strokeWidth={dry ? 3 : 8} strokeLinejoin="round" />
      ))}
      {SOIL_GRAINS.map((g, i) => (
        <path key={i} d={g.d} fill={g.fill} stroke="#7d5a3a" strokeWidth="0.8" />
      ))}
      <path d={`M0 ${SOIL_Y} H640`} stroke="#5f8a45" strokeWidth="6" />
      {/* raíz con pelos absorbentes */}
      <path d={`M${STEM_X - 6} ${SOIL_Y - 4} C${STEM_X - 10} ${SOIL_Y + 40} ${STEM_X - 50} ${SOIL_Y + 60} ${STEM_X - 92} ${SOIL_Y + 96}`} stroke="#8a6a44" strokeWidth="16" fill="none" strokeLinecap="round" />
      <path d={`M${STEM_X - 6} ${SOIL_Y - 4} C${STEM_X - 10} ${SOIL_Y + 40} ${STEM_X - 50} ${SOIL_Y + 60} ${STEM_X - 92} ${SOIL_Y + 96}`} stroke="#c9a77c" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d={`M${STEM_X + 4} ${SOIL_Y + 6} C${STEM_X + 20} ${SOIL_Y + 50} ${STEM_X + 70} ${SOIL_Y + 66} ${STEM_X + 120} ${SOIL_Y + 92}`} stroke="#8a6a44" strokeWidth="11" fill="none" strokeLinecap="round" />
      <path d={`M${STEM_X + 4} ${SOIL_Y + 6} C${STEM_X + 20} ${SOIL_Y + 50} ${STEM_X + 70} ${SOIL_Y + 66} ${STEM_X + 120} ${SOIL_Y + 92}`} stroke="#c9a77c" strokeWidth="6" fill="none" strokeLinecap="round" />
      <g stroke="#d9bf98" strokeWidth="1.6" strokeLinecap="round">
        {ROOT_HAIRS.map(([x, y, a], i) => (
          <path key={i} d={`M${x} ${y} l${(Math.cos((a * Math.PI) / 180) * 16).toFixed(1)} ${(Math.sin((a * Math.PI) / 180) * 16).toFixed(1)}`} />
        ))}
      </g>

      {/* tallo con dos vasos del xilema a la vista */}
      <rect x={STEM_X - 18} y="96" width="36" height={SOIL_Y - 92} rx="10" fill="#6f8f45" />
      <rect x={STEM_X - 11} y="100" width="8" height={SOIL_Y - 100} fill="#e8f4fb" stroke="#4e6b2e" strokeWidth="1.2" />
      <rect x={STEM_X + 3} y="100" width="8" height={SOIL_Y - 100} fill="#e8f4fb" stroke="#4e6b2e" strokeWidth="1.2" />
      {/* hoja pequeña de la que sale la ampliación */}
      <path d={`M${STEM_X + 14} 112 C${STEM_X + 60} 80 ${STEM_X + 104} 90 ${STEM_X + 120} 104 C${STEM_X + 90} 126 ${STEM_X + 46} 128 ${STEM_X + 14} 112Z`} fill="#7fb85c" stroke="#4e7d33" strokeWidth="1.6" />
      <circle cx={STEM_X + 74} cy="106" r="16" fill="none" stroke={INK} strokeWidth="2" />
      <path d={`M${STEM_X + 88} 98 L${LEAF.x} ${LEAF.y + 10} M${STEM_X + 86} 116 L${LEAF.x} ${LEAF.y + LEAF.h - 10}`} stroke={INK} strokeWidth="1.4" strokeDasharray="5 4" />

      {/* corte de la hoja: epidermis, parénquima en empalizada, mesófilo esponjoso y estoma */}
      <rect x={LEAF.x} y={LEAF.y} width={LEAF.w} height={LEAF.h} rx="14" fill="#e9f5df" stroke={INK} strokeWidth="2" />
      <rect x={LEAF.x + 4} y={LEAF.y + 4} width={LEAF.w - 8} height="12" rx="8" fill="#d6edc4" />
      {Array.from({ length: 15 }, (_, i) => (
        <rect key={i} x={LEAF.x + 10 + i * 22.5} y={LEAF.y + 20} width="18" height="56" rx="8" fill="#6faa4c" stroke="#4e7d33" strokeWidth="1" />
      ))}
      {SPONGY.map((g, i) => (
        <path key={i} d={g.d} fill={g.fill} stroke="#4e7d33" strokeWidth="1" />
      ))}
      {/* vena con xilema */}
      <ellipse cx={LEAF.x + 70} cy={LEAF.y + 108} rx="22" ry="17" fill="#cfe8f7" stroke="#4e7d33" strokeWidth="1.6" />
      <rect x={LEAF.x + 4} y={LEAF.y + LEAF.h - 18} width={LEAF.w - 8} height="12" rx="6" fill="#d6edc4" />
    </>
  );
});

export function PlantArt({ t, clock, variant }: { t: number; clock: number; variant: string }) {
  const night = variant === 'noche';
  const dry = variant === 'seco';
  // apertura del estoma: abierto de día, casi cerrado con el suelo seco, cerrado de noche
  const open = night ? 0 : dry ? 3 : 11;
  const flow = night ? 0.08 : dry ? 0.35 : 1;
  const absorb = ramp(t, 0.4, 1.4);
  const rise = ramp(t, 4.6, 5.4);
  const out = ramp(t, 9.1, 9.9);
  const r = seeded(11);

  return (
    <>
      {/* cielo de día o de noche */}
      <rect x="0" y="0" width="640" height={SOIL_Y} fill={night ? '#26364f' : '#dfeef6'} />
      {night ? (
        <g>
          <circle cx="60" cy="52" r="20" fill="#f3f0d8" />
          <circle cx="70" cy="46" r="18" fill="#26364f" />
        </g>
      ) : (
        <g>
          <circle cx="60" cy="52" r="22" fill="#ffd25e" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <path key={i} d={`M${60 + Math.cos(a) * 28} ${52 + Math.sin(a) * 28} L${60 + Math.cos(a) * 38} ${52 + Math.sin(a) * 38}`} stroke="#f2b632" strokeWidth="3" strokeLinecap="round" />;
          })}
        </g>
      )}
      <Static dry={dry} />

      {/* 1. absorción: el agua de los poros entra a los pelos de la raíz */}
      {ROOT_HAIRS.filter((_, i) => i % 2 === 0).map(([x, y, a], i) => {
        const k = (clock * 0.5 * Math.max(0.3, flow) + i * 0.17) % 1;
        const dx = Math.cos((a * Math.PI) / 180) * 30;
        const dy = Math.sin((a * Math.PI) / 180) * 30;
        return <Drop key={i} x={x + dx * (1 - k)} y={y + dy * (1 - k)} s={0.7} opacity={absorb * (1 - k * 0.6)} />;
      })}

      {/* 2. ascenso por el xilema: una columna continua de agua */}
      <g opacity={rise}>
        {[STEM_X - 7, STEM_X + 7].map((x, j) =>
          Array.from({ length: 9 }, (_, i) => {
            const k = ((clock * 0.16 * flow + i / 9 + j * 0.05) % 1 + 1) % 1;
            return <Drop key={`${j}-${i}`} x={x} y={lerp(SOIL_Y - 6, 106, k)} s={0.62} />;
          }),
        )}
      </g>
      {/* agua que llega a la vena y a las células */}
      <g opacity={rise}>
        {[0, 1, 2].map((i) => {
          const k = (clock * 0.4 * flow + i / 3) % 1;
          return <Drop key={i} x={LEAF.x + 70 + k * 120} y={LEAF.y + 108 + Math.sin(k * 6) * 6} s={0.6} opacity={1 - k} />;
        })}
      </g>

      {/* 3. el vapor se forma en los espacios de aire y sale por el estoma */}
      <g opacity={out}>
        {Array.from({ length: 6 }, (_, i) => {
          const k = (clock * 0.35 * flow + i / 6) % 1;
          const x0 = LEAF.x + 120 + r() * 150;
          const y0 = LEAF.y + 100 + r() * 30;
          if (k < 0.55) return <Vapor key={i} x={lerp(x0, STOMA_X, k / 0.55)} y={lerp(y0, LEAF.y + LEAF.h - 14, k / 0.55)} s={0.8} opacity={flow > 0.1 ? 1 : 0.3} />;
          if (open < 1) return null;
          const kk = (k - 0.55) / 0.45;
          return <Vapor key={i} x={STOMA_X + (i - 2.5) * 10 * kk} y={LEAF.y + LEAF.h + kk * 70} s={1 + kk * 0.5} opacity={1 - kk * 0.8} />;
        })}
      </g>

      {/* estoma con sus dos células oclusivas */}
      <g>
        <ellipse cx={STOMA_X} cy={LEAF.y + LEAF.h - 12} rx={open / 2 + 1} ry="9" fill="#2a3b24" />
        <path d={`M${STOMA_X - open / 2} ${LEAF.y + LEAF.h - 22} C${STOMA_X - open / 2 - 22} ${LEAF.y + LEAF.h - 24} ${STOMA_X - open / 2 - 22} ${LEAF.y + LEAF.h} ${STOMA_X - open / 2} ${LEAF.y + LEAF.h - 2} C${STOMA_X - open / 2 - 6} ${LEAF.y + LEAF.h - 8} ${STOMA_X - open / 2 - 6} ${LEAF.y + LEAF.h - 16} ${STOMA_X - open / 2} ${LEAF.y + LEAF.h - 22}Z`} fill="#5c9e3f" stroke="#2f5d22" strokeWidth="1.4" />
        <path d={`M${STOMA_X + open / 2} ${LEAF.y + LEAF.h - 22} C${STOMA_X + open / 2 + 22} ${LEAF.y + LEAF.h - 24} ${STOMA_X + open / 2 + 22} ${LEAF.y + LEAF.h} ${STOMA_X + open / 2} ${LEAF.y + LEAF.h - 2} C${STOMA_X + open / 2 + 6} ${LEAF.y + LEAF.h - 8} ${STOMA_X + open / 2 + 6} ${LEAF.y + LEAF.h - 16} ${STOMA_X + open / 2} ${LEAF.y + LEAF.h - 22}Z`} fill="#5c9e3f" stroke="#2f5d22" strokeWidth="1.4" />
      </g>

      {/* rótulos según la fase */}
      {t < 4.5 && (
        <g>
          <rect x="14" y={SOIL_Y + 28} width="186" height="28" rx="14" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <text x="107" y={SOIL_Y + 47} textAnchor="middle" className="d-label">
            Pelos de la raíz
          </text>
        </g>
      )}
      {t >= 4.5 && t < 9 && <BigArrow d={`M${STEM_X + 34} ${SOIL_Y - 30} V140`} color="#1f6fae" width={3} />}
      {t >= 4.5 && t < 9 && (
        <g>
          <rect x={STEM_X + 44} y="190" width="196" height="28" rx="14" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <text x={STEM_X + 142} y="209" textAnchor="middle" className="d-label">
            Xilema: el agua sube
          </text>
        </g>
      )}
      {t >= 9 && (
        <g>
          <rect x={STOMA_X - 230} y={LEAF.y + LEAF.h + 26} width="200" height="28" rx="14" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <text x={STOMA_X - 130} y={LEAF.y + LEAF.h + 45} textAnchor="middle" className="d-label">
            {night ? 'Estoma cerrado' : dry ? 'Estoma casi cerrado' : 'Estoma abierto'}
          </text>
          <path d={`M${STOMA_X - 30} ${LEAF.y + LEAF.h + 40} L${STOMA_X - 8} ${LEAF.y + LEAF.h - 6}`} stroke={INK} strokeWidth="1.5" />
          {open > 0 && (
            <g>
              <rect x={466} y={LEAF.y + LEAF.h + 82} width="168" height="28" rx="14" fill="#fff" stroke={INK} strokeWidth="1.5" />
              <text x={550} y={LEAF.y + LEAF.h + 101} textAnchor="middle" className="d-label">
                Vapor (invisible)
              </text>
            </g>
          )}
        </g>
      )}
      <text x={LEAF.x + LEAF.w - 10} y={LEAF.y - 8} textAnchor="end" className="d-label" opacity="0.9" style={night ? { fill: '#ffffff' } : undefined}>
        Corte de una hoja (ampliado)
      </text>
    </>
  );
}

export function PlantResult({ variant }: { variant: string }) {
  const rows = [
    { id: 'dia', label: 'Día soleado', v: 1, word: 'mucho vapor' },
    { id: 'seco', label: 'Suelo seco', v: 0.3, word: 'poco vapor' },
    { id: 'noche', label: 'Noche', v: 0.06, word: 'casi nada' },
  ];
  return (
    <div className="d-result">
      <p className="d-result-title">Vapor que sale por los estomas (tendencias, no medidas)</p>
      <dl>
        {rows.map((r) => (
          <div key={r.id} className={`d-row${r.id === variant ? ' is-current' : ''}`}>
            <dt>{r.label}</dt>
            <dd>
              <span className="d-bar" aria-hidden="true">
                <span style={{ width: `${r.v * 100}%` }} />
              </span>
              {r.word}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

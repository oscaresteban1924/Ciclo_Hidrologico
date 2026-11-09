// Lupas: ampliaciones que muestran lo que no se ve a simple vista
// (estoma, interior de una nube, una gota, poros del suelo y del acuífero).

import type { CalloutId } from '../content/types';
import type { Conditions } from '../lab/model';
import type { StepKnobs } from '../state/store';
import type { Pt } from '../lib/paths';
import type { Mapper } from './camera';
import type { DetailId } from '../state/store';
import { DETAIL_BY_ID } from '../content/details';

export const LENS_POS: Partial<Record<CalloutId, { at: Pt; subject: Pt; title: string }>> = {
  stoma: { at: [1300, 352], subject: [1046, 500], title: 'Estoma (ampliado)' },
  cloud: { at: [770, 104], subject: [600, 236], title: 'Dentro de una nube (ampliado)' },
  drop: { at: [840, 150], subject: [962, 214], title: 'Una gota en la nube' },
  soil: { at: [1200, 540], subject: [1080, 636], title: 'Poros del suelo (ampliado)' },
  aquifer: { at: [1235, 792], subject: [1010, 762], title: 'Acuífero (ampliado)' },
};

function Stoma({ dry }: { dry: boolean }) {
  const gap = dry ? 1.6 : 6;
  return (
    <>
      <rect x="-60" y="-60" width="120" height="120" fill="#b5d99a" />
      <g stroke="#93c178" strokeWidth="1.2" fill="none">
        <path d="M-60 -30 L-30 -36 L-12 -58 M-30 -36 L-36 -6 L-60 0 M30 -40 L58 -34 M30 -40 L24 -60 M34 -6 L60 4 M34 -6 L30 -40 M-36 34 L-60 40 M-36 34 L-24 60 M30 36 L60 30 M30 36 L22 60" />
      </g>
      <ellipse cx="0" cy="8" rx={gap * 0.9 + 1} ry="16" fill="#2a3b24" />
      <path d={`M${-gap / 2} -10 C${-gap / 2 - 20} -14 ${-gap / 2 - 20} 30 ${-gap / 2} 26 C${-gap / 2 - 6} 16 ${-gap / 2 - 6} 0 ${-gap / 2} -10Z`} fill="#6fae55" stroke="#3f7d39" strokeWidth="1.4" />
      <path d={`M${gap / 2} -10 C${gap / 2 + 20} -14 ${gap / 2 + 20} 30 ${gap / 2} 26 C${gap / 2 + 6} 16 ${gap / 2 + 6} 0 ${gap / 2} -10Z`} fill="#6fae55" stroke="#3f7d39" strokeWidth="1.4" />
      <g className="lens-rise" style={{ animationDuration: dry ? '3.4s' : '2s' }}>
        <use href="#p-vap" transform="translate(0 -6) scale(1.5)" />
      </g>
      {!dry && (
        <>
          <g className="lens-rise" style={{ animationDelay: '-0.7s' }}>
            <use href="#p-vap" transform="translate(-6 -10) scale(1.3)" />
          </g>
          <g className="lens-rise" style={{ animationDelay: '-1.4s' }}>
            <use href="#p-vap" transform="translate(6 -8) scale(1.4)" />
          </g>
        </>
      )}
    </>
  );
}

const DROPLETS: [number, number, number][] = [
  [-36, -30, 6], [-10, -40, 4.5], [20, -32, 7], [42, -14, 4], [-44, 4, 5], [-18, -6, 7.5], [12, 2, 4.5],
  [38, 18, 6.5], [-30, 30, 4], [-2, 26, 6], [26, 40, 4.5], [-50, -48, 3], [50, -44, 3.5],
];

function CloudInside() {
  return (
    <>
      <rect x="-60" y="-60" width="120" height="120" fill="#d6e1ea" />
      <g className="lens-float">
        {DROPLETS.map(([x, y, r], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill="#ffffff" stroke="#6f8fae" strokeWidth="1.2" />
            <circle cx={x + r * 0.15} cy={y + r * 0.1} r={Math.max(0.8, r * 0.2)} fill="#5f5a54" />
          </g>
        ))}
      </g>
      <g transform="translate(-4 -24) scale(1.6)">
        <use href="#p-ice" />
      </g>
      <g transform="translate(34 -2) scale(1.4)">
        <use href="#p-ice" />
      </g>
      <g opacity="0.75">
        <use href="#p-vap" transform="translate(-20 46) scale(1.1)" />
        <use href="#p-vap" transform="translate(48 2) scale(1.1)" />
        <use href="#p-vap" transform="translate(-52 22) scale(1.1)" />
      </g>
    </>
  );
}

function DropBalance({ size, updraft }: { size: number; updraft: 0 | 1 }) {
  const r = 4 + size * 3.2;
  const up = updraft ? 40 : 22;
  const down = 6 + size * 8;
  const falls = down > up;
  return (
    <>
      <rect x="-60" y="-60" width="120" height="120" fill="#e3edf4" />
      <g className={falls ? 'lens-fall' : 'lens-hover'}>
        <path
          d={`M0 ${-r * 1.5} C${r * 0.7} ${-r * 0.5} ${r} ${-r * 0.1} ${r} ${r * 0.35} A${r} ${r} 0 0 1 ${-r} ${r * 0.35} C${-r} ${-r * 0.1} ${-r * 0.7} ${-r * 0.5} 0 ${-r * 1.5}Z`}
          fill="#2a86d0"
          stroke="#fff"
          strokeWidth="1.4"
        />
      </g>
      <g strokeLinecap="round">
        <path d={`M-34 ${up / 2} V${-up / 2}`} stroke="#ffffff" strokeWidth="7" />
        <path d={`M-34 ${up / 2} V${-up / 2}`} stroke="#6b6fd1" strokeWidth="3.6" markerEnd="url(#m-vapor)" />
        <path d={`M34 ${-down / 2} V${down / 2}`} stroke="#ffffff" strokeWidth="7" />
        <path d={`M34 ${-down / 2} V${down / 2}`} stroke="#1565b0" strokeWidth="3.6" markerEnd="url(#m-liquid)" />
      </g>
    </>
  );
}

function SoilPores({ moisture }: { moisture: number }) {
  const grains: [number, number, number][] = [
    [-38, -36, 14], [-4, -42, 12], [30, -34, 15], [-46, -2, 12], [-14, -6, 15], [22, 0, 12], [48, 6, 11],
    [-36, 32, 15], [-2, 30, 12], [30, 34, 14], [56, -44, 9], [-58, 48, 9],
  ];
  return (
    <>
      <rect x="-60" y="-60" width="120" height="120" fill={moisture === 2 ? '#5f9cc6' : '#f3e7cc'} />
      {moisture === 1 &&
        grains.map(([x, y, r], i) => <circle key={`w${i}`} cx={x} cy={y} r={r + 4} fill="#7fb7df" opacity="0.9" />)}
      {grains.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={i % 3 === 0 ? '#9a7048' : i % 3 === 1 ? '#b08455' : '#8a633f'} stroke="#6b4a2f" strokeWidth="1" />
      ))}
      {moisture === 0 && (
        <g className="lens-seep">
          <use href="#p-liq" transform="translate(-24 -20) scale(1.5)" />
        </g>
      )}
    </>
  );
}

function AquiferPores() {
  const grains: [number, number, number][] = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const x = -55 + col * 22 + (row % 2) * 11;
      const y = -55 + row * 21;
      grains.push([x, y, 9 + ((row * 7 + col * 3) % 4)]);
    }
  }
  return (
    <>
      <rect x="-60" y="-60" width="120" height="120" fill="#4f93c4" />
      {grains.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? '#c8ad7c' : '#b8996a'} stroke="#8d7550" strokeWidth="0.8" />
      ))}
      <path d="M-58 -34 C-40 -44 -30 -24 -14 -33 S12 -12 26 -22 S48 -6 58 -12" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeDasharray="5 7" className="flow-dash" style={{ animationDuration: '3s' }} markerEnd="url(#m-small)" />
    </>
  );
}

export function lensCaption(id: CalloutId, c: Conditions, k: StepKnobs): string {
  switch (id) {
    case 'stoma':
      return c.soilMoisture === 0
        ? 'Con el suelo seco, las células oclusivas casi cierran el estoma: sale poco vapor.'
        : 'Estoma abierto entre dos células oclusivas: por aquí sale el vapor de agua.';
    case 'cloud':
      return 'Gotas de nube (cada una con su núcleo de condensación) y cristales de hielo. El vapor entre ellas es invisible: aquí solo se representa.';
    case 'drop': {
      const falls = 6 + k.dropSize * 8 > (k.updraft ? 40 : 22);
      return falls
        ? 'La caída de la gota supera al aire que sube: la gota cae.'
        : 'El aire que sube sostiene la gota: todavía es demasiado pequeña para caer.';
    }
    case 'soil':
      return [
        'Suelo seco: los poros tienen aire y el agua puede entrar.',
        'Suelo húmedo: películas de agua rodean los granos; aún queda algo de aire.',
        'Suelo saturado: todos los poros están llenos de agua; casi no cabe más.',
      ][c.soilMoisture];
    case 'aquifer':
      return 'Arena saturada: el agua llena los poros entre los granos y avanza lentamente entre ellos. No es una caverna.';
    default:
      return '';
  }
}

/** Posición en pantalla de cada lupa (la misma que usa el componente), para que los rótulos la eviten. */
export function lensPlacement(id: CalloutId, mapper: Mapper, compact: boolean, width: number, height: number, bottomReserve = 66) {
  const pos = LENS_POS[id];
  if (!pos) return null;
  const size = compact ? 92 : 148;
  const [sx, sy] = mapper.toScreen(pos.at[0], pos.at[1]);
  const capH = compact ? 50 : 250;
  // la figura (lupa + texto) está centrada en (x, y): se mantiene entera entre la barra de escalas y la de reproducción
  const w = Math.max(size, compact ? 124 : 234);
  const h = size + 6 + capH + 12;
  const x = Math.max(w / 2 + 8, Math.min(width - w / 2 - 8, sx));
  const y = Math.max(h / 2 + 68, Math.min(height - h / 2 - bottomReserve, sy + h / 2 - size / 2));
  return { x, y, size, box: { x: x - w / 2, y: y - h / 2, w, h } };
}

export function Lenses({
  callouts,
  mapper,
  conditions,
  knobs,
  compact,
  width,
  height,
  detailFor,
  onDetail,
  bottomReserve = 66,
}: {
  callouts: CalloutId[];
  mapper: Mapper;
  conditions: Conditions;
  knobs: StepKnobs;
  compact: boolean;
  width: number;
  height: number;
  detailFor: (id: CalloutId) => DetailId | null;
  onDetail: (id: DetailId) => void;
  bottomReserve?: number;
}) {
  const size = compact ? 92 : 148;
  return (
    <>
      {callouts.map((id) => {
        const pos = LENS_POS[id];
        if (!pos) return null;
        // mantener la lupa completa dentro del encuadre
        const { x, y } = lensPlacement(id, mapper, compact, width, height, bottomReserve)!;
        return (
          <figure key={id} className="lens" style={{ left: x, top: y, width: size }} aria-label={pos.title}>
            <svg viewBox="-60 -60 120 120" width={size} height={size} aria-hidden="true">
              <defs>
                <clipPath id={`lens-clip-${id}`}>
                  <circle r="58" />
                </clipPath>
              </defs>
              <g clipPath={`url(#lens-clip-${id})`}>
                {id === 'stoma' && <Stoma dry={conditions.soilMoisture === 0} />}
                {id === 'cloud' && <CloudInside />}
                {id === 'drop' && <DropBalance size={knobs.dropSize} updraft={knobs.updraft} />}
                {id === 'soil' && <SoilPores moisture={conditions.soilMoisture} />}
                {id === 'aquifer' && <AquiferPores />}
              </g>
              <circle r="58" fill="none" stroke="#17324d" strokeWidth="3" />
            </svg>
            <figcaption className={compact ? 'is-compact' : undefined}>
              <strong className={compact ? 'sr-only' : undefined}>{pos.title}</strong>
              {!compact && <span>{lensCaption(id, conditions, knobs)}</span>}
              {detailFor(id) && (
                <button type="button" className="lens-open" onClick={() => onDetail(detailFor(id)!)}>
                  {compact ? 'Ver de cerca' : `Ver de cerca: ${DETAIL_BY_ID[detailFor(id)!].short}`}
                </button>
              )}
            </figcaption>
          </figure>
        );
      })}
    </>
  );
}

/** Líneas que unen cada lupa con lo que amplía (en coordenadas de escena). */
export function LensConnectors({ callouts }: { callouts: CalloutId[] }) {
  return (
    <g aria-hidden="true">
      {callouts.map((id) => {
        const pos = LENS_POS[id];
        if (!pos) return null;
        return (
          <g key={id}>
            <path d={`M${pos.subject[0]} ${pos.subject[1]} L${pos.at[0]} ${pos.at[1]}`} stroke="#ffffff" strokeWidth="5" opacity="0.8" />
            <path d={`M${pos.subject[0]} ${pos.subject[1]} L${pos.at[0]} ${pos.at[1]}`} stroke="#17324d" strokeWidth="2" strokeDasharray="5 4" />
            <circle cx={pos.subject[0]} cy={pos.subject[1]} r="12" fill="none" stroke="#17324d" strokeWidth="2.4" />
          </g>
        );
      })}
    </g>
  );
}

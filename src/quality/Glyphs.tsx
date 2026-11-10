// Dibujos esquemáticos de los bichos del agua (formas generales de cada grupo, no ilustraciones de especies).

import type { ReactElement } from 'react';
import type { Glyph } from './model';

export function CritterGlyph({ glyph, color, size = 56 }: { glyph: Glyph; color: string; size?: number }) {
  const s = { fill: color, stroke: '#2b2622', strokeWidth: 0.8 } as const;
  const leg = { stroke: '#2b2622', strokeWidth: 1, fill: 'none', strokeLinecap: 'round' } as const;
  const legs = (y: number, xs: number[]) => xs.map((x, i) => <path key={`l${i}${y}`} d={`M${x} ${y} l-3 ${i % 2 ? 4 : -4} M${x} ${y + 4} l-3 ${i % 2 ? -3 : 3}`} {...leg} />);
  let body: ReactElement;
  switch (glyph) {
    case 'ninfa':
      // cuerpo alargado, patas, dos o tres colas y agallas
      body = (
        <g>
          <path d="M6 16 q4 -4 9 -4 h17 q6 0 8 4 q-2 4 -8 4 h-17 q-5 0 -9 -4z" {...s} />
          <circle cx="10" cy="16" r="2.4" {...s} />
          <path d="M40 15 l7 -5 M40 16 l8 0 M40 17 l7 5" {...leg} />
          {legs(12, [16, 21, 26])}
          {[18, 23, 28, 33].map((x) => <path key={x} d={`M${x} 20 q1 3 3 3`} {...leg} />)}
        </g>
      );
      break;
    case 'estuche':
      body = (
        <g>
          <path d="M12 12 l28 2 q4 2 0 6 l-28 2 q-4 -5 0 -10z" fill="#b9a27a" stroke="#2b2622" strokeWidth="0.8" />
          {[16, 21, 26, 31, 36].map((x) => <circle key={x} cx={x} cy={17 + ((x / 5) % 2 ? 1.5 : -1.5)} r="1.4" fill="#8f7b58" />)}
          <circle cx="9" cy="17" r="3" {...s} />
          <path d="M8 19 l-4 4 M10 20 l-2 5 M11 15 l-5 -3" {...leg} />
        </g>
      );
      break;
    case 'red':
      body = (
        <g>
          <path d="M7 16 q2 -5 8 -5 h15 q8 0 11 5 q-3 5 -11 5 h-15 q-6 0 -8 -5z" {...s} />
          {[18, 22, 26, 30, 34].map((x) => <path key={x} d={`M${x} 21 l0 3 M${x - 1} 24 l2 0`} {...leg} />)}
          <path d="M41 15 l5 -3 M41 17 l5 3" {...leg} />
          {legs(12, [11, 15, 19])}
        </g>
      );
      break;
    case 'escarabajo':
      body = (
        <g>
          <ellipse cx="25" cy="16" rx="11" ry="7" {...s} />
          <path d="M25 9 v14" stroke="#1d1a17" strokeWidth="0.8" />
          <circle cx="13" cy="16" r="3" {...s} />
          {legs(10, [20, 25, 30])}
          {legs(20, [20, 25, 30])}
        </g>
      );
      break;
    case 'centavito':
      body = (
        <g>
          <ellipse cx="24" cy="16" rx="13" ry="11" {...s} />
          {[0, 1, 2, 3].map((i) => <ellipse key={i} cx="24" cy="16" rx={11 - i * 2.6} ry={9 - i * 2.2} fill="none" stroke="#2b2622" strokeWidth="0.6" />)}
        </g>
      );
      break;
    case 'patinador':
      body = (
        <g>
          <ellipse cx="24" cy="16" rx="7" ry="4" {...s} />
          <path d="M18 14 l-9 -7 M18 18 l-9 7 M22 13 l-2 -9 M22 19 l-2 9 M29 14 l9 -6 M29 18 l9 6" {...leg} />
        </g>
      );
      break;
    case 'larva':
      body = (
        <g>
          <path d="M6 16 q2 -3 6 -3 h26 q4 0 5 3 q-1 3 -5 3 h-26 q-4 0 -6 -3z" {...s} />
          {[12, 16, 20, 24, 28, 32, 36].map((x) => <path key={x} d={`M${x} 13 v6`} stroke="#00000033" strokeWidth="0.8" />)}
          <circle cx="7.5" cy="16" r="2.3" fill="#2b2622" />
        </g>
      );
      break;
    case 'caracol':
      body = (
        <g>
          <path d="M8 22 h22 q6 0 8 -3" fill="#9a8a72" stroke="#2b2622" strokeWidth="0.8" />
          <path d="M14 22 q-6 -8 2 -14 q10 -4 14 4 q2 8 -6 10z" {...s} />
          <path d="M20 18 q-3 -4 1 -7 q5 -1 6 3 q0 4 -4 4" fill="none" stroke="#2b2622" strokeWidth="0.8" />
          <path d="M36 19 l4 -4 M37 20 l5 -2" {...leg} />
        </g>
      );
      break;
    case 'sanguijuela':
      body = (
        <g>
          <path d="M6 18 q6 -9 18 -6 q12 -4 18 4 q-6 8 -18 5 q-12 4 -18 -3z" {...s} />
          {[12, 17, 22, 27, 32, 37].map((x) => <path key={x} d={`M${x} 12 q1 4 0 8`} stroke="#00000033" strokeWidth="0.7" fill="none" />)}
        </g>
      );
      break;
    case 'planaria':
      body = (
        <g>
          <path d="M7 16 q3 -6 9 -4 l3 -3 l2 4 q12 -2 20 3 q-8 5 -20 3 l-2 4 l-3 -3 q-6 2 -9 -4z" {...s} />
          <circle cx="15" cy="14.5" r="1" fill="#fff" />
          <circle cx="15" cy="17.5" r="1" fill="#fff" />
        </g>
      );
      break;
    case 'libelula':
      body = (
        <g>
          <path d="M8 16 q2 -6 9 -6 q12 0 20 4 q4 2 0 4 q-8 4 -20 4 q-7 0 -9 -6z" {...s} />
          <circle cx="11" cy="13" r="2" fill="#2b2622" />
          <circle cx="11" cy="19" r="2" fill="#2b2622" />
          {legs(10, [18, 23, 28])}
          {legs(21, [18, 23, 28])}
        </g>
      );
      break;
    case 'diablito':
      body = (
        <g>
          <path d="M10 16 q2 -5 7 -5 h20 q5 0 6 5 q-1 5 -6 5 h-20 q-5 0 -7 -5z" {...s} />
          <path d="M10 14 l-6 -4 M10 18 l-6 4" stroke="#2b2622" strokeWidth="1.6" strokeLinecap="round" />
          {[20, 25, 30, 35, 40].map((x) => <path key={x} d={`M${x} 11 l1 -4 M${x} 21 l1 4`} {...leg} />)}
        </g>
      );
      break;
    case 'gusano':
    default:
      body = (
        <g>
          <path d="M5 18 q5 -8 11 -2 q6 6 11 0 q5 -6 10 0 q4 4 7 0" fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
        </g>
      );
  }
  return (
    <svg width={size} height={(size * 32) / 48} viewBox="0 0 48 32" aria-hidden="true">
      {body}
    </svg>
  );
}

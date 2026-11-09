// Las personas en el ciclo: pozo de bombeo, tanque, planta de tratamiento y pluma de sedimentos.

import { memo } from 'react';
import { smoothPath } from '../../lib/paths';
import { PTAR, WATER_TANK, WELL, yFront } from '../geometry';

/** Caseta del pozo de bombeo (superficie) y tubería enterrada hasta el tanque. */
export const WellHead = memo(function WellHead({ pumping }: { pumping: number }) {
  const x = WELL.x;
  const y = yFront(x) - 10;
  return (
    <g aria-hidden="true">
      <path d={smoothPath([[x + 6, y - 2], [700, 672], [780, 642], [WATER_TANK.x - 6, WATER_TANK.y + 4]])} stroke="#6c7680" strokeWidth="2" strokeDasharray="4 3" fill="none" opacity={pumping > 0 ? 0.9 : 0.45} />
      <ellipse cx={x + 3} cy={y + 2} rx="13" ry="3" fill="#23331f" opacity="0.2" />
      <path d={`M${x - 9} ${y} V${y - 10} L${x} ${y - 16} L${x + 9} ${y - 10} V${y} Z`} fill="#dfe4e7" stroke="#55626d" strokeWidth="1.2" />
      <path d={`M${x + 9} ${y} L${x + 13} ${y - 3} V${y - 13} L${x + 9} ${y - 10} Z`} fill="#b9c1c7" stroke="#55626d" strokeWidth="1" />
      <rect x={x - 3} y={y - 7} width="6" height="7" fill="#4f6f7c" />
      {pumping > 0 && <circle cx={x + 6} cy={y - 13} r="2.2" fill="#3fbf6a" />}
    </g>
  );
});

/** Tanque de almacenamiento de agua para la ciudad. */
export const WaterTank = memo(function WaterTank() {
  const { x, y } = WATER_TANK;
  return (
    <g aria-hidden="true">
      <ellipse cx={x + 4} cy={y + 2} rx="16" ry="3.5" fill="#23331f" opacity="0.2" />
      <path d={`M${x - 8} ${y} l2 -18 M${x + 8} ${y} l-2 -18`} stroke="#6c7680" strokeWidth="1.6" />
      <rect x={x - 12} y={y - 34} width="24" height="17" rx="2" fill="#cdd7de" stroke="#55626d" strokeWidth="1.2" />
      <ellipse cx={x} cy={y - 34} rx="12" ry="3" fill="#e6edf1" stroke="#55626d" strokeWidth="1.2" />
      <path d={`M${x - 12} ${y - 25} h24`} stroke="#9fb0bd" strokeWidth="1" />
    </g>
  );
});

/** Planta de tratamiento de aguas residuales: sedimentadores circulares y descarga al río. */
export const TreatmentPlant = memo(function TreatmentPlant() {
  const { x, y } = PTAR;
  return (
    <g aria-hidden="true">
      <rect x={x - 34} y={y - 12} width="70" height="30" rx="4" fill="#cfd6c4" opacity="0.9" />
      {[
        [x - 16, y + 2],
        [x + 14, y - 3],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <ellipse cx={cx} cy={cy} rx="13" ry="5.5" fill="#8f9aa3" />
          <ellipse cx={cx} cy={cy - 1} rx="11" ry="4.4" fill="#6f9fb8" />
          <path d={`M${cx - 10} ${cy - 1} h20`} stroke="#c9dde6" strokeWidth="0.9" />
        </g>
      ))}
      <rect x={x + 26} y={y - 16} width="12" height="9" fill="#e7e1d3" stroke="#6c7680" strokeWidth="0.9" />
      <path d={`M${x + 26} ${y - 16} l6 -4 l6 4`} fill="#8c5a44" />
      <path d={smoothPath([[x + 30, y + 10], [x + 50, y + 18], [x + 66, y + 22]])} stroke="#6c7680" strokeWidth="2" fill="none" />
    </g>
  );
});

/** Pluma de sedimentos que el río lleva al mar cuando hay mucha escorrentía (capa animada). */
export const SedimentPlume = memo(function SedimentPlume({ turbidity }: { turbidity: number }) {
  if (turbidity < 0.08) return null;
  return (
    <g aria-hidden="true" clipPath="url(#clip-ocean)" style={{ opacity: Math.min(0.9, turbidity * 1.1), transition: 'opacity 1.2s' }}>
      <ellipse className="plume" cx="300" cy="752" rx="120" ry="26" fill="url(#g-plume)" />
      <ellipse className="plume plume-2" cx="250" cy="730" rx="90" ry="18" fill="url(#g-plume)" />
    </g>
  );
});

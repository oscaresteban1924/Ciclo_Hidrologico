// Leyenda accesible: la forma y el trazo distinguen cada cosa, no solo el color.

import { useEffect, useRef } from 'react';
import { LEGEND, UI } from '../content/ui';
import { Icon } from './ui';

function Swatch({ id }: { id: string }) {
  const common = { width: 44, height: 24, viewBox: '0 0 44 24', 'aria-hidden': true } as const;
  switch (id) {
    case 'liquid':
      return <svg {...common}><use href="#p-liq" transform="translate(22 13) scale(1.6)" /></svg>;
    case 'vapor':
      return <svg {...common}><rect width="44" height="24" rx="4" fill="#a9d3ea" /><use href="#p-vap" transform="translate(22 12) scale(1.5)" /></svg>;
    case 'cloud':
      return <svg {...common}><rect width="44" height="24" rx="4" fill="#c9d5df" /><use href="#p-cld" transform="translate(14 12) scale(1.6)" /><use href="#p-cld" transform="translate(24 9) scale(1.3)" /><use href="#p-cld" transform="translate(31 15) scale(1.6)" /></svg>;
    case 'ice':
      return <svg {...common}><rect width="44" height="24" rx="4" fill="#a9d3ea" /><use href="#p-ice" transform="translate(22 12) scale(1.5)" /></svg>;
    case 'arrow-vapor':
      return <svg {...common}><path d="M4 12 H34" stroke="#fff" strokeWidth="5" strokeDasharray="7 5" /><path d="M4 12 H34" stroke="#4f53b8" strokeWidth="2.6" strokeDasharray="7 5" markerEnd="url(#m-vapor)" /></svg>;
    case 'arrow-liquid':
      return <svg {...common}><path d="M4 12 H34" stroke="#1565b0" strokeWidth="3" markerEnd="url(#m-liquid)" /></svg>;
    case 'arrow-subsurface':
      return <svg {...common}><rect width="44" height="24" rx="4" fill="#e2c995" /><path d="M4 12 H34" stroke="#0d3f73" strokeWidth="3" strokeDasharray="1.5 5" strokeLinecap="round" markerEnd="url(#m-subsurface)" /></svg>;
    case 'arrow-ice':
      return <svg {...common}><rect width="44" height="24" rx="4" fill="#a9d3ea" /><path d="M4 12 H34" stroke="#2f6d9f" strokeWidth="6" /><path d="M4 12 H34" stroke="#fff" strokeWidth="3" markerEnd="url(#m-ice)" /></svg>;
    case 'reservoir':
      return <span className="scene-label kind-reservorio legend-chip">Lago</span>;
    case 'process':
      return <span className="scene-label kind-proceso legend-chip">Infiltración</span>;
    case 'watertable':
      return <svg {...common}><path d="M2 16 H42" stroke="#0d4f94" strokeWidth="2.2" strokeDasharray="8 5" /><path d="M15 4 H29 L22 13 Z" fill="#fff" stroke="#0d4f94" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
    case 'tracer':
      return <svg {...common}><circle cx="22" cy="12" r="10" fill="#fff" stroke="#c8246f" strokeWidth="2.4" /><path d="M22 5.5 C25 9.5 26.2 11.6 26.2 13.4 A4.2 4.2 0 0 1 17.8 13.4 C17.8 11.6 19 9.5 22 5.5Z" fill="#c8246f" /></svg>;
    case 'fog':
      return <svg {...common}><rect width="44" height="24" rx="4" fill="#8fb98a" /><ellipse cx="22" cy="12" rx="18" ry="6" fill="#ffffff" opacity="0.85" /></svg>;
    case 'well':
      return <svg {...common}><rect width="44" height="24" rx="4" fill="#79b2d6" /><rect x="18" y="1" width="8" height="22" fill="#fff" stroke="#17324d" strokeWidth="1.4" /><path d="M2 8 Q14 8 18 15 M26 15 Q30 8 42 8" stroke="#0d4f94" strokeWidth="1.6" strokeDasharray="4 3" fill="none" /></svg>;
    case 'saltwedge':
      return <svg {...common}><rect width="44" height="24" rx="4" fill="#3f7f96" /><path d="M2 20 L42 6" stroke="#cfeaf2" strokeWidth="2" strokeDasharray="5 4" /></svg>;
    case 'detail':
      return <span className="lens-open legend-chip">Ver de cerca</span>;
    case 'pin':
      return <svg {...common}><circle cx="22" cy="12" r="10" fill="#c8246f" stroke="#fff" strokeWidth="2" /><text x="22" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">?</text></svg>;
    default:
      return null;
  }
}

export function Legend({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="legend" role="dialog" aria-label={UI.legendTitle} tabIndex={-1} ref={ref}>
      <div className="legend-head">
        <h2>{UI.legendTitle}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar leyenda">
          <Icon name="close" />
        </button>
      </div>
      <ul>
        {LEGEND.map((l) => (
          <li key={l.id}>
            <span className="legend-swatch">
              <Swatch id={l.id} />
            </span>
            <span>
              <strong>{l.label}</strong>
              <small>{l.desc}</small>
            </span>
          </li>
        ))}
      </ul>
      <p className="legend-note">{UI.simplified}</p>
    </div>
  );
}

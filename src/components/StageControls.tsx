// Controles del escenario: escala de observación (cuenca, proceso, detalle) y reproducción
// (pausa única para toda la experiencia, repetir y velocidad).

import { useEffect, useRef, useState } from 'react';
import { DETAILS } from '../content/details';
import { useStore, type DetailId } from '../state/store';
import { SPEEDS, rememberOpener } from './DetailView';
import { Icon } from './ui';

export type Scale = 'cuenca' | 'proceso' | 'detalle';

export function ScaleNav({
  scale,
  processLabel,
  canProcess,
  onBasin,
  onProcess,
  onDetail,
  compact,
}: {
  scale: Scale;
  processLabel: string | null;
  canProcess: boolean;
  onBasin: () => void;
  onProcess: () => void;
  onDetail: (id: DetailId) => void;
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <nav className={`scale-nav${compact ? ' is-compact' : ''}`} aria-label="Escala de observación">
      <button type="button" className={scale === 'cuenca' ? 'is-on' : ''} aria-current={scale === 'cuenca' ? 'true' : undefined} onClick={onBasin}>
        <span className="scale-dot" aria-hidden="true" />
        Cuenca
      </button>
      <span className="scale-sep" aria-hidden="true">›</span>
      <button
        type="button"
        className={scale === 'proceso' ? 'is-on' : ''}
        aria-current={scale === 'proceso' ? 'true' : undefined}
        onClick={onProcess}
        disabled={!canProcess && scale === 'cuenca'}
        title={processLabel ?? undefined}
      >
        <span className="scale-dot is-mid" aria-hidden="true" />
        {compact ? 'Proceso' : processLabel ? `Proceso: ${processLabel}` : 'Proceso'}
      </button>
      <span className="scale-sep" aria-hidden="true">›</span>
      <div className="scale-menu" ref={menuRef}>
        <button
          type="button"
          className={scale === 'detalle' ? 'is-on' : ''}
          aria-current={scale === 'detalle' ? 'true' : undefined}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            rememberOpener();
            setOpen(!open);
          }}
        >
          <span className="scale-dot is-small" aria-hidden="true" />
          Detalle
          <svg className="caret" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {open && (
          <div className="menu" role="menu" aria-label="Vistas de detalle">
            <p className="menu-title">Ver de cerca</p>
            {DETAILS.map((d) => (
              <button
                key={d.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onDetail(d.id);
                }}
                onKeyDown={(e) => {
                  const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
                  const i = items.indexOf(e.currentTarget);
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    items[(i + 1) % items.length]?.focus();
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    items[(i - 1 + items.length) % items.length]?.focus();
                  }
                }}
              >
                <strong>{d.title}</strong>
                <span>{d.place}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

export function Transport({ compact }: { compact: boolean }) {
  const { state, dispatch } = useStore();
  const reduced = state.prefs.reducedMotion;
  return (
    <div className="transport" role="group" aria-label="Reproducción de las animaciones">
      <button
        type="button"
        className="t-btn is-main"
        onClick={() => dispatch({ type: 'pause' })}
        aria-pressed={state.paused}
        disabled={reduced}
        title={reduced ? 'Movimiento reducido activado en Ajustes' : undefined}
      >
        <Icon name={state.paused ? 'play' : 'pause'} />
        <span>{state.paused ? 'Reanudar' : 'Pausar'}</span>
      </button>
      <button type="button" className="t-btn" onClick={() => dispatch({ type: 'replay' })} aria-label="Repetir la animación desde el inicio">
        <Icon name="replay" />
        {!compact && <span>Repetir</span>}
      </button>
      {!reduced && (
        <div className="speed" role="radiogroup" aria-label="Velocidad de reproducción">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={state.speed === s.value}
              className={state.speed === s.value ? 'is-on' : ''}
              onClick={() => dispatch({ type: 'speed', speed: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {state.paused && <span className="t-state" role="status">En pausa: la escena se queda quieta para observarla.</span>}
    </div>
  );
}

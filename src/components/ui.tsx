// Componentes de interfaz reutilizables: selector segmentado, desplegable y pregunta de observación.

import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Question } from '../content/types';
import { UI } from '../content/ui';

export function Segmented<T extends number | string>({
  label,
  options,
  value,
  onChange,
  help,
  disabled = false,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  help?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`segmented${disabled ? ' is-disabled' : ''}`} role="radiogroup" aria-labelledby={`${id}-l`} aria-disabled={disabled || undefined}>
      <span className="segmented-label" id={`${id}-l`}>
        {label}
      </span>
      <div className="segmented-track">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            disabled={disabled}
            className={value === o.value ? 'is-on' : ''}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const i = options.findIndex((x) => x.value === value);
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                onChange(options[Math.min(options.length - 1, i + 1)].value);
              }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                onChange(options[Math.max(0, i - 1)].value);
              }
            }}
            tabIndex={value === o.value ? 0 : -1}
          >
            {o.label}
          </button>
        ))}
      </div>
      {help && <p className="segmented-help">{help}</p>}
    </div>
  );
}

export function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  const id = useId();
  return (
    <div className="toggle">
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-l`} onClick={() => onChange(!checked)} className={checked ? 'is-on' : ''}>
        <span className="toggle-knob" aria-hidden="true" />
      </button>
      <div>
        <span id={`${id}-l`} className="toggle-label">
          {label}
        </span>
        {help && <p className="toggle-help">{help}</p>}
      </div>
    </div>
  );
}

export function Disclosure({ title, children, defaultOpen = false, className = '' }: { title: string; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  return (
    <div className={`disclosure ${open ? 'is-open' : ''} ${className}`}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M5 3 L11 8 L5 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {title}
      </button>
      <div id={id} hidden={!open} className="disclosure-body">
        {children}
      </div>
    </div>
  );
}

/** Pregunta de observación: sin penalización; si la respuesta no coincide, ofrece una pista. */
export function QuestionBlock({
  q,
  resetKey,
  onLookAgain,
  onRight,
  title = UI.sections.observe,
}: {
  q: Question;
  resetKey: string | number;
  onLookAgain?: () => void;
  onRight?: () => void;
  title?: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [tries, setTries] = useState<number[]>([]);
  useEffect(() => {
    setPicked(null);
    setTries([]);
  }, [resetKey]);
  const right = picked === q.correct;
  return (
    <section className="question" aria-labelledby={`q-${resetKey}`}>
      <h3 id={`q-${resetKey}`}>{title}</h3>
      <p className="question-prompt">{q.prompt}</p>
      <div className="question-options">
        {q.options.map((o, i) => {
          const state = picked === i ? (i === q.correct ? 'is-right' : 'is-hint') : tries.includes(i) ? 'is-tried' : '';
          return (
            <button
              key={i}
              type="button"
              className={`option ${state}`}
              aria-pressed={picked === i}
              onClick={() => {
                setPicked(i);
                if (!tries.includes(i)) setTries([...tries, i]);
                if (i === q.correct) onRight?.();
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="question-feedback">
        {picked !== null && right && (
          <p className="feedback is-right">
            <strong>{UI.feedback.rightLead}.</strong> {q.right}
          </p>
        )}
        {picked !== null && !right && (
          <div className="feedback is-hint">
            <p>
              <strong>{UI.feedback.hintLead}:</strong> {q.hint}
            </p>
            {onLookAgain && (
              <button type="button" className="btn-ghost" onClick={onLookAgain}>
                {UI.feedback.tryAgain}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export type IconName = 'prev' | 'next' | 'pause' | 'play' | 'replay' | 'close' | 'settings' | 'speaker' | 'stop' | 'info' | 'zoom' | 'panel' | 'list' | 'book' | 'question' | 'check' | 'expand';

export function Icon({ name }: { name: IconName }) {
  const p: Record<string, ReactNode> = {
    prev: <path d="M12.5 4 L6.5 10 L12.5 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
    next: <path d="M7.5 4 L13.5 10 L7.5 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
    pause: (
      <g fill="currentColor">
        <rect x="5" y="4" width="3.6" height="12" rx="1" />
        <rect x="11.4" y="4" width="3.6" height="12" rx="1" />
      </g>
    ),
    play: <path d="M6 4 L16 10 L6 16 Z" fill="currentColor" />,
    replay: (
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 10 A5.5 5.5 0 1 0 6.2 6" />
        <path d="M4 3.5 V7 H7.5" />
      </g>
    ),
    close: <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />,
    settings: (
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 6 H17 M3 14 H17" />
        <circle cx="7" cy="6" r="2.2" fill="var(--paper)" />
        <circle cx="13" cy="14" r="2.2" fill="var(--paper)" />
      </g>
    ),
    speaker: (
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M3.5 8 H6.5 L10.5 4.5 V15.5 L6.5 12 H3.5 Z" fill="currentColor" />
        <path d="M13.5 7 A4 4 0 0 1 13.5 13" />
        <path d="M15.5 5 A7 7 0 0 1 15.5 15" />
      </g>
    ),
    stop: <rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" />,
    info: (
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="10" cy="10" r="7.2" />
        <path d="M10 9 V14" strokeWidth="2.2" />
        <circle cx="10" cy="6.2" r="0.6" fill="currentColor" strokeWidth="1.6" />
      </g>
    ),
    zoom: (
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M13 13 L17.5 17.5" strokeWidth="2.4" />
        <path d="M6 8.5 h5 M8.5 6 v5" />
      </g>
    ),
    panel: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
        <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
        <path d="M12 3.5 V16.5" />
      </g>
    ),
    expand: (
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8 V3.5 H8 M12 3.5 H16.5 V8 M16.5 12 V16.5 H12 M8 16.5 H3.5 V12" />
      </g>
    ),
    list: (
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M7.5 5 H16.5 M7.5 10 H16.5 M7.5 15 H16.5" />
        <circle cx="4" cy="5" r="1" fill="currentColor" />
        <circle cx="4" cy="10" r="1" fill="currentColor" />
        <circle cx="4" cy="15" r="1" fill="currentColor" />
      </g>
    ),
    book: (
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M4 3.5 H14.5 A1.5 1.5 0 0 1 16 5 V16.5 H5.5 A1.5 1.5 0 0 1 4 15 Z" />
        <path d="M4 15 A1.5 1.5 0 0 1 5.5 13.5 H16" />
        <path d="M7.5 7 H12.5" strokeLinecap="round" />
      </g>
    ),
    question: (
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M7.2 7.4 A2.9 2.9 0 1 1 11.2 10 C10.3 10.5 10 11 10 12.2" />
        <circle cx="10" cy="15.4" r="0.5" fill="currentColor" strokeWidth="1.8" />
      </g>
    ),
    check: <path d="M4.5 10.5 L8.5 14.5 L15.5 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  };
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      {p[name]}
    </svg>
  );
}

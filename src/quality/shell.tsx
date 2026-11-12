// Distribución común de las tres partes en 3D: escena con su pregunta, controles al pie de la escena y panel
// con pestañas (Retos, Experimentos, Datos, Docente; la planta agrega Procesos). También el puente React ↔ escena 3D y los retos con medalla.

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../state/store';
import { QStage, type StageView } from './three/stage';

// ------------------------------------------------------------------ escena 3D en React

export interface WorldLike {
  update(dt: number, t: number): void;
  views: Record<string, StageView>;
}

/**
 * Crea el escenario y el mundo una sola vez (al montar) y los libera al desmontar. `onReady` entrega el mundo para
 * que la parte le pase su estado con `set(...)`.
 */
export function Scene3D<W extends WorldLike>({
  make,
  onReady,
  label,
  viewNames,
  onHover,
  flyTo,
}: {
  make: (s: QStage) => W;
  onReady: (w: W, s: QStage) => void;
  label: string;
  viewNames: { id: string; label: string }[];
  onHover?: (hint: string | null) => void;
  /** Vista pedida desde afuera (por ejemplo el recorrido guiado); `n` cambia en cada pedido. */
  flyTo?: { id: string; n: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stageRef = useRef<QStage | null>(null);
  const worldRef = useRef<W | null>(null);
  const { state } = useStore();
  const [view, setView] = useState(viewNames[0]?.id ?? '');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const st = new QStage(el, { reducedMotion: state.prefs.reducedMotion, label });
    const w = make(st);
    stageRef.current = st;
    worldRef.current = w;
    st.onHover = (h) => onHover?.(h);
    st.start((dt, t) => w.update(dt, t));
    onReady(w, st);
    return () => {
      st.dispose();
      stageRef.current = null;
      worldRef.current = null;
    };
    // el mundo se crea una vez; el estado le llega por onReady/set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = (id: string) => {
    const w = worldRef.current, st = stageRef.current;
    if (!w || !st || !w.views[id]) return;
    setView(viewNames.some((v) => v.id === id) ? id : '');
    st.view(w.views[id]);
  };
  useEffect(() => {
    if (flyTo) go(flyTo.id);
    // solo cuando llega un pedido nuevo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.n]);
  const cam = (f: (s: QStage) => void) => () => stageRef.current && f(stageRef.current);
  return (
    <div className="q3-scene" ref={ref}>
      <div className="q3-views" role="group" aria-label="Lugares para mirar">
        {viewNames.map((v) => (
          <button key={v.id} type="button" className={view === v.id ? 'is-on' : ''} aria-pressed={view === v.id} onClick={() => go(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="q3-cam" role="group" aria-label="Cámara">
        <button type="button" aria-label="Acercar" title="Acercar" onClick={cam((s) => s.zoom(0.8))}>
          +
        </button>
        <button type="button" aria-label="Alejar" title="Alejar" onClick={cam((s) => s.zoom(1.25))}>
          −
        </button>
        <button type="button" aria-label="Girar a la izquierda" title="Girar a la izquierda" onClick={cam((s) => s.orbit(-20))}>
          ⟲
        </button>
        <button type="button" aria-label="Girar a la derecha" title="Girar a la derecha" onClick={cam((s) => s.orbit(20))}>
          ⟳
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ distribución

export type PanelTab = 'procesos' | 'esquema' | 'retos' | 'experimentos' | 'diseno' | 'datos' | 'medellin' | 'docente';
const TAB_LABEL: Record<PanelTab, string> = { procesos: 'Procesos', esquema: 'Esquema', retos: 'Retos', experimentos: 'Experimentos', diseno: 'Diseño', datos: 'Datos', medellin: 'Medellín', docente: 'Docente' };
const DEFAULT_TABS: PanelTab[] = ['retos', 'experimentos', 'datos', 'docente'];

export const PartTab = createContext('');

export function Q3Layout({ head, stage, dock, panels, tab, setTab, tabs = DEFAULT_TABS }: { head: ReactNode; stage: ReactNode; dock: ReactNode; panels: Partial<Record<PanelTab, ReactNode>>; tab: PanelTab; setTab: (t: PanelTab) => void; tabs?: PanelTab[] }) {
  const id = useId();
  const TABS = tabs.map((t) => ({ id: t, label: TAB_LABEL[t] }));
  const partTab = useContext(PartTab);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  return (
    <main className="layout-q3">
      <section className="q3-stage" aria-label="Escena 3D">
        <div className="q3-view">{stage}</div>
        <div className="q3-dock" role="group" aria-label="Controles de la escena">
          {dock}
        </div>
      </section>
      <aside className="q3-panel" aria-label="Retos, experimentos y datos">
        {head}
        <div className="q3-ptabs" role="tablist" aria-label="Secciones del panel" id={partTab ? `${partTab}-sub` : undefined}>
          {TABS.map((t, k) => (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`${id}-panel`}
              tabIndex={tab === t.id ? 0 : -1}
              className={tab === t.id ? 'is-on' : ''}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => {
                const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
                if (!d) return;
                const nx = TABS[(k + d + TABS.length) % TABS.length].id;
                setTab(nx);
                window.setTimeout(() => refs.current[nx]?.focus(), 0);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="q3-pscroll" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={-1}>
          {panels[tab]}
        </div>
      </aside>
    </main>
  );
}

/** Pregunta de la escena, con la respuesta que se ve en el dibujo. */
export function Question({ q, answer, tone }: { q: string; answer: ReactNode; tone: 'ok' | 'mid' | 'bad' }) {
  // la altura de la tarjeta queda en --q3-qh de la escena: en el teléfono el aviso de medalla se pone encima de ella
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current, host = el?.parentElement;
    if (!el || !host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => host.style.setProperty('--q3-qh', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      host.style.removeProperty('--q3-qh');
    };
  }, []);
  // la respuesta se muestra en dos líneas para dejar ver la maqueta; «Ver todo» la abre completa
  const [open, setOpen] = useState(false);
  return (
    <div ref={ref} className={`q3-question is-${tone}${open ? ' is-open' : ''}`}>
      <strong>{q}</strong>
      <span className="q3-answer" role="status" aria-live="polite">
        {answer}
      </span>
      <button type="button" className="q3-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Ver menos' : 'Ver todo'}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ retos con medalla

export interface Reto<C> {
  id: string;
  title: string;
  goal: string;
  hint: string;
  check: (c: C) => boolean;
  /** Avance legible (por ejemplo «2 de 4 estaciones con peces»). */
  progress?: (c: C) => string;
}

const RETOS_KEY = 'ciclo-hidrologico:calidad-retos';

function loadDone(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RETOS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Revisa los retos con el contexto actual; guarda (en este equipo) y anota en la bitácora los que se cumplen. */
export function useRetos<C>(retos: Reto<C>[], ctx: C): { done: Set<string>; fresh: Reto<C> | null; clearFresh: () => void } {
  const { dispatch } = useStore();
  const [done, setDone] = useState<Set<string>>(() => new Set(loadDone()));
  const [fresh, setFresh] = useState<Reto<C> | null>(null);
  useEffect(() => {
    const newly = retos.filter((r) => !done.has(r.id) && r.check(ctx));
    if (!newly.length) return;
    const next = new Set(done);
    newly.forEach((r) => next.add(r.id));
    setDone(next);
    setFresh(newly[0]);
    try {
      window.localStorage.setItem(RETOS_KEY, JSON.stringify([...next]));
    } catch {
      /* sin almacenamiento: la medalla dura mientras la página esté abierta */
    }
    for (const r of newly) dispatch({ type: 'log', entry: { id: `reto-${r.id}`, kind: 'explicacion', title: `Reto cumplido: ${r.title}`, text: r.goal } });
  }, [ctx, retos, done, dispatch]);
  return { done, fresh, clearFresh: () => setFresh(null) };
}

export function RetosList<C>({ retos, ctx, done, intro }: { retos: Reto<C>[]; ctx: C; done: Set<string>; intro: string }) {
  const [hint, setHint] = useState<string | null>(null);
  const n = retos.filter((r) => done.has(r.id)).length;
  return (
    <div className="q3-retos">
      <p className="q3-intro">{intro}</p>
      <p className="q3-medals" aria-label={`${n} de ${retos.length} medallas`}>
        {retos.map((r) => (
          <Medal key={r.id} on={done.has(r.id)} />
        ))}
        <span>
          {n} de {retos.length} medallas
        </span>
      </p>
      <ol>
        {retos.map((r) => {
          const ok = done.has(r.id);
          return (
            <li key={r.id} className={ok ? 'is-done' : ''}>
              <Medal on={ok} />
              <div>
                <strong>{r.title}</strong>
                <p>{r.goal}</p>
                {r.progress && !ok && <p className="q3-progress">{r.progress(ctx)}</p>}
                {ok ? (
                  <p className="q3-progress is-ok">Cumplido</p>
                ) : (
                  <button type="button" className="link" aria-expanded={hint === r.id} onClick={() => setHint(hint === r.id ? null : r.id)}>
                    {hint === r.id ? 'Ocultar pista' : 'Ver una pista'}
                  </button>
                )}
                {hint === r.id && !ok && <p className="q3-hint">{r.hint}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Medal({ on }: { on: boolean }) {
  return (
    <svg className={`q3-medal${on ? ' is-on' : ''}`} viewBox="0 0 24 30" width="22" height="28" aria-hidden="true">
      <path d="M6 1 L10 12 L14 12 L18 1" fill="none" stroke={on ? '#2f78c4' : '#b8c2cb'} strokeWidth="3" />
      <circle cx="12" cy="19" r="8.5" fill={on ? '#f2c230' : '#e3e8ec'} stroke={on ? '#b98a12' : '#c5ced6'} strokeWidth="1.5" />
      {on && <path d="M8.5 19 l2.4 2.4 l4.6 -5" fill="none" stroke="#7a5a08" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** Aviso flotante cuando se gana una medalla. */
export function MedalToast({ title, onClose }: { title: string; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(t);
  }, [onClose]);
  return (
    <div className="q3-toast" role="status">
      <Medal on />
      <div>
        <strong>¡Reto cumplido!</strong>
        <span>{title}</span>
      </div>
      <button type="button" className="icon-close" aria-label="Cerrar aviso" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

/** Control de opciones grande para el pie de la escena. */
export function DockChoice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="q3-choice" role="radiogroup" aria-labelledby={id}>
      <span id={id} className="q3-dlabel">
        {label}
      </span>
      <div>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DockRange({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="q3-range">
      <label htmlFor={id}>
        <span className="q3-dlabel">{label}</span>
        <output htmlFor={id}>{show}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${(Math.max(0, Math.min(1, (value - min) / Math.max(1e-9, max - min))) * 100).toFixed(1)}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

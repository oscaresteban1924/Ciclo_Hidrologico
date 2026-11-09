// Ventana de detalle: la escala más cercana. Se abre desde un lugar del paisaje, muestra una
// secuencia (inicio, desarrollo, resultado) con una variable para investigar, y siempre ofrece
// una forma clara de volver.

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DETAIL_BY_ID, phaseAt, type DetailDef } from '../content/details';
import { GLOSSARY } from '../content/glossary';
import { useSequenceClock } from '../lib/useSequenceClock';
import { DETAIL_ART } from '../scene/details';
import { DetailDefs } from '../scene/details/common';
import { useStore, type DetailId, type Speed } from '../state/store';
import { Disclosure, Icon, Segmented } from './ui';

/** Elemento que abrió la vista, para devolverle el foco al cerrar. */
let opener: HTMLElement | null = null;
export function rememberOpener() {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

export const SPEEDS: { value: Speed; label: string }[] = [
  { value: 0.5, label: '½×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
];

function Locator({ at, onBack }: { at: [number, number]; onBack: () => void }) {
  const [x, y] = at;
  return (
    <button type="button" className="d-locator" onClick={onBack} aria-label="Volver al paisaje: ubicación de esta vista">
      <svg viewBox={`${x - 210} ${y - 130} 420 260`} aria-hidden="true">
        <use href="#scene-art" />
        <circle cx={x} cy={y} r="22" fill="none" stroke="#fff" strokeWidth="9" />
        <circle cx={x} cy={y} r="22" fill="none" stroke="#c8246f" strokeWidth="5" />
      </svg>
      <span>Estás aquí</span>
    </button>
  );
}

/** Desplaza el panel lateral para mostrar el resultado cuando aparece (una sola vez). */
function RevealOnMount({ children, smooth }: { children: ReactNode; smooth: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref}>{children}</div>;
}

function ExplainBox({ def, variant }: { def: DetailDef; variant: string }) {
  const { dispatch } = useStore();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const id = useId();
  return (
    <div className="d-explain">
      <label htmlFor={id}>
        <strong>Explica con tus palabras.</strong> {def.explain}
      </label>
      <textarea id={id} rows={3} value={text} maxLength={400} onChange={(e) => { setText(e.target.value); setSaved(false); }} />
      <div className="d-explain-actions">
        <button
          type="button"
          className="btn-ghost small"
          disabled={text.trim().length < 3}
          onClick={() => {
            const v = def.variants.find((x) => x.id === variant)?.label;
            dispatch({ type: 'log', entry: { kind: 'explicacion', title: `${def.title}${v ? ` (${v})` : ''}`, text: text.trim() } });
            dispatch({ type: 'discover', ids: ['explicar'] });
            setSaved(true);
          }}
        >
          Guardar en la bitácora
        </button>
        {saved && <span role="status">Guardado en tu bitácora.</span>}
      </div>
    </div>
  );
}

export function DetailView({ id, origin, stage, compact, fullscreen = false }: { id: DetailId; origin: [number, number]; stage: { w: number; h: number }; compact: boolean; fullscreen?: boolean }) {
  const { state, dispatch } = useStore();
  const def = DETAIL_BY_ID[id];
  const mod = DETAIL_ART[id];
  const reduced = state.prefs.reducedMotion;
  const [variant, setVariant] = useState(def.variants[0].id);
  const [run, setRun] = useState(0);
  const playing = !state.paused && !reduced;
  const { t: clockT, clock, seek, ended } = useSequenceClock(def.duration, playing, state.speed, `${id}|${variant}|${run}`);
  // con movimiento reducido, la secuencia se recorre por fases (cuadros estáticos)
  const [still, setStill] = useState(0);
  const phaseEnd = (i: number) => (i + 1 < def.phases.length ? def.phases[i + 1].at - 0.05 : def.duration);
  const t = reduced ? phaseEnd(still) : clockT;
  const phase = reduced ? still : phaseAt(def, t);
  const seen = useRef(new Set<string>());
  const winRef = useRef<HTMLElement>(null);
  const headingId = useId();

  const close = () => {
    dispatch({ type: 'closeDetail' });
    const el = opener;
    opener = null;
    window.setTimeout(() => el?.focus?.(), 0);
  };

  useEffect(() => {
    winRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Registrar la observación al terminar la secuencia (o al llegar al resultado en modo estático)
  const reachedEnd = reduced ? still === def.phases.length - 1 : ended;
  useEffect(() => {
    if (!reachedEnd || seen.current.has(variant)) return;
    seen.current.add(variant);
    const v = def.variants.find((x) => x.id === variant)?.label ?? '';
    const lastPhase = def.phases[def.phases.length - 1];
    dispatch({ type: 'log', entry: { id: `obs-${id}-${variant}`, kind: 'observacion', title: `${def.title} (${v})`, text: lastPhase.alt?.[variant] ?? lastPhase.text } });
    dispatch({ type: 'discover', ids: [`detalle-${id}`] });
    if (seen.current.size >= 2) {
      dispatch({
        type: 'log',
        entry: { id: `cmp-${id}`, kind: 'comparacion', title: `Comparé: ${def.title}`, text: `Observé la secuencia con ${def.variantLabel.toLowerCase()} ${[...seen.current].map((x) => def.variants.find((y) => y.id === x)?.label.toLowerCase()).join(' y ')}.` },
      });
      dispatch({ type: 'discover', ids: ['comparar-detalle'] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachedEnd, variant]);

  // ventana: centrada en el escenario; crece desde el lugar del paisaje que amplía
  // deja visible la barra de escalas (Cuenca › Proceso › Detalle) para volver en cualquier momento
  const ww = compact ? stage.w - 12 : Math.min(stage.w - 32, 1080);
  const wh = compact ? stage.h - 62 : Math.min(stage.h - 76, 720);
  const left = (stage.w - ww) / 2;
  const top = compact ? 56 : Math.max(64, (stage.h - wh) / 2 + 22);
  const style = {
    left,
    top,
    width: ww,
    height: wh,
    '--ox': `${origin[0] - left}px`,
    '--oy': `${origin[1] - top}px`,
  } as CSSProperties;
  const inside = fullscreen || (origin[0] > left && origin[0] < left + ww && origin[1] > top && origin[1] < top + wh);

  const Art = mod?.Art;
  const Result = mod?.Result;
  const cur0 = def.phases[phase];
  const cur = { ...cur0, text: cur0.alt?.[variant] ?? cur0.text };

  const layer = (
    <div className={`detail-layer${fullscreen ? ' is-fullscreen' : ''}`}>
      {!inside && (
        <svg className="d-link" width={stage.w} height={stage.h} aria-hidden="true">
          <circle cx={origin[0]} cy={origin[1]} r="16" fill="none" stroke="#fff" strokeWidth="7" />
          <circle cx={origin[0]} cy={origin[1]} r="16" fill="none" stroke="#c8246f" strokeWidth="3.5" />
        </svg>
      )}
      <section
        ref={winRef}
        className={`detail-window${compact || fullscreen ? ' is-compact' : ''}${reduced ? '' : ' is-animated'}`}
        style={fullscreen ? undefined : style}
        role="dialog"
        aria-modal="false"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <header className="d-head">
          <Locator at={def.subject} onBack={close} />
          <div className="d-titles">
            <p className="d-kicker">
              Vista de detalle · {def.place}
            </p>
            <h2 id={headingId}>{def.title}</h2>
            <p className="d-badge">
              <Icon name="info" /> Esquema: no está a escala
            </p>
          </div>
          <button type="button" className="btn-ghost d-close" onClick={close} aria-label="Volver al paisaje">
            <Icon name="close" />
            <span>Volver al paisaje</span>
          </button>
        </header>

        <div className="d-body">
          <figure className="d-figure">
            <div className="d-svg-wrap">
              <svg viewBox="0 0 640 400" className="d-svg" role="img" aria-label={`${cur.title}. ${cur.text}`}>
                <DetailDefs />
                {Art ? <Art t={t} clock={reduced ? 0 : clock} variant={variant} /> : <text x="320" y="200" textAnchor="middle">En preparación</text>}
              </svg>
            </div>
            {(compact || fullscreen) && <p className="d-swipe">Desliza el esquema hacia los lados para verlo completo.</p>}
            <figcaption className="d-caption" aria-live="polite">
              <span className="d-step">
                {phase + 1}/{def.phases.length}
              </span>
              <span>
                <strong>{cur.title}.</strong> {cur.text}
              </span>
            </figcaption>
            <div className="d-transport">
              <button
                type="button"
                className="icon-btn labeled"
                onClick={() => (reduced ? setStill(Math.max(0, still - 1)) : dispatch({ type: 'pause' }))}
                aria-label={reduced ? 'Fase anterior' : state.paused ? 'Reanudar' : 'Pausar'}
                disabled={reduced && still === 0}
              >
                <Icon name={reduced ? 'prev' : state.paused ? 'play' : 'pause'} />
                <span>{reduced ? 'Anterior' : state.paused ? 'Reanudar' : 'Pausar'}</span>
              </button>
              {reduced ? (
                <button type="button" className="icon-btn labeled" onClick={() => setStill(Math.min(def.phases.length - 1, still + 1))} disabled={still === def.phases.length - 1}>
                  <Icon name="next" />
                  <span>Siguiente fase</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="icon-btn labeled"
                  onClick={() => {
                    setRun((r) => r + 1);
                    if (state.paused) dispatch({ type: 'pause', value: false });
                  }}
                >
                  <Icon name="replay" />
                  <span>Repetir</span>
                </button>
              )}
              {!reduced && (
                <>
                  <input
                    type="range"
                    className="d-scrub"
                    min={0}
                    max={def.duration}
                    step={0.1}
                    value={t}
                    aria-label="Momento de la secuencia"
                    aria-valuetext={`${cur.title}`}
                    onChange={(e) => seek(Number(e.target.value))}
                  />
                  <div className="speed" role="radiogroup" aria-label="Velocidad de reproducción">
                    {SPEEDS.map((s) => (
                      <button key={s.value} type="button" role="radio" aria-checked={state.speed === s.value} className={state.speed === s.value ? 'is-on' : ''} onClick={() => dispatch({ type: 'speed', speed: s.value })}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </figure>

          <aside className="d-side">
            <ol className="d-phases">
              {def.phases.map((p, i) => (
                <li key={p.title} className={i === phase ? 'is-current' : i < phase ? 'is-done' : ''}>
                  <button type="button" onClick={() => (reduced ? setStill(i) : seek(p.at + 0.05))} aria-current={i === phase ? 'step' : undefined}>
                    <span className="d-num">{i + 1}</span>
                    {p.title}
                  </button>
                </li>
              ))}
            </ol>

            <div className="d-block">
              <p className="d-level">Observa</p>
              <p>{def.observe}</p>
            </div>
            <div className="d-block">
              <p className="d-level">Investiga</p>
              <Segmented
                label={def.variantLabel}
                options={def.variants.map((v) => ({ value: v.id, label: v.label }))}
                value={variant}
                onChange={(v) => {
                  setVariant(v);
                  setStill(0);
                }}
              />
            </div>
            {Result && phase === def.phases.length - 1 && (
              <RevealOnMount smooth={!reduced}>
                <Result variant={variant} />
              </RevealOnMount>
            )}
            {phase === def.phases.length - 1 && <ExplainBox key={variant} def={def} variant={variant} />}
            <Disclosure title="Profundiza">
              <p>{def.deeper}</p>
              <p className="nuance">{def.scaleNote}</p>
              <div className="d-terms">
                {def.terms
                  .map((tid) => GLOSSARY.find((g) => g.id === tid))
                  .filter((g): g is NonNullable<typeof g> => !!g)
                  .map((g) => (
                    <button key={g.id} type="button" className="chip" onClick={() => { close(); dispatch({ type: 'openTerm', term: g.id }); }}>
                      {g.term}
                    </button>
                  ))}
              </div>
            </Disclosure>
            {phase === def.phases.length - 1 && (
              <p className="d-next">
                <strong>Nueva pregunta:</strong> {def.next}
              </p>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
  // en celulares la vista ocupa toda la pantalla, por encima de cualquier barra fija
  return fullscreen ? createPortal(layer, document.body) : layer;
}

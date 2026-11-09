// Panel del recorrido guiado. Cada paso presenta una idea principal y una acción concreta,
// organizadas en tres niveles: Observa (lo visible), Investiga (interacción) y Profundiza (a demanda).

import { useEffect, useRef, useState } from 'react';
import { DETAIL_BY_ID } from '../content/details';
import { FACTS_BY_STEP } from '../content/facts';
import { STEP_EXTRA } from '../content/sequences';
import { STEPS } from '../content/steps';
import { TERM_BY_ID } from '../content/glossary';
import { UI } from '../content/ui';
import { speak, speechSupported, stopSpeaking } from '../lib/speech';
import type { SceneSpec } from '../state/spec';
import { useStore } from '../state/store';
import { rememberOpener } from './DetailView';
import { FactCard } from './FactCard';
import { InquiryList } from './Inquiry';
import { StepInteraction } from './StepInteraction';
import { Disclosure, Icon, QuestionBlock } from './ui';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const shortName = (i: number) => STEP_EXTRA[STEPS[i].id]?.short ?? STEPS[i].title;

/** Progreso visible con nombres: barra de pasos e índice desplegable. */
export function StepProgress() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const visitedCount = STEPS.filter((s) => state.progress.visited.includes(s.id)).length;
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLButtonElement>('[aria-current="step"]')?.focus();
  }, [open]);
  return (
    <nav className="progress" aria-label="Progreso del recorrido">
      <div className="progress-row">
        <p className="progress-text">
          <span>{UI.nav.stepOf(state.step + 1, STEPS.length)}</span>
          <span className="progress-visited">{visitedCount === STEPS.length ? ' · recorrido completo' : ` · ${visitedCount} visitados`}</span>
        </p>
        <button type="button" className="btn-ghost small" aria-expanded={open} aria-controls="step-index" onClick={() => setOpen(!open)}>
          <Icon name="list" />
          Índice
        </button>
        <button type="button" className="icon-btn" aria-label="Contraer el panel y ampliar el paisaje" title="Ampliar el paisaje" onClick={() => dispatch({ type: 'panel', collapsed: true })}>
          <Icon name="expand" />
        </button>
      </div>
      <ol className="progress-bar">
        {STEPS.map((s, i) => {
          const visited = state.progress.visited.includes(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`${i === state.step ? 'is-current' : ''}${visited ? ' is-visited' : ''}`}
                aria-label={`${i + 1}. ${s.title}${visited ? ', visitado' : ''}`}
                aria-current={i === state.step ? 'step' : undefined}
                title={s.title}
                onClick={() => dispatch({ type: 'step', index: i })}
              />
            </li>
          );
        })}
      </ol>
      {open && (
        <ol className="step-index" id="step-index" ref={listRef}>
          {STEPS.map((s, i) => {
            const visited = state.progress.visited.includes(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-current={i === state.step ? 'step' : undefined}
                  className={i === state.step ? 'is-current' : ''}
                  onClick={() => {
                    dispatch({ type: 'step', index: i });
                    setOpen(false);
                  }}
                >
                  <span className="si-num">{i + 1}</span>
                  <span className="si-name">{s.title}</span>
                  {visited && (
                    <span className="si-check" aria-label="visitado">
                      <Icon name="check" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
}

export function StepNav() {
  const { state, dispatch } = useStore();
  const last = STEPS.length - 1;
  return (
    <div className="step-nav" role="group" aria-label="Controles del recorrido">
      <button type="button" className="btn-nav" onClick={() => dispatch({ type: 'prev' })} disabled={state.step === 0} aria-label={state.step > 0 ? `Anterior: ${shortName(state.step - 1)}` : UI.nav.prev}>
        <Icon name="prev" />
        <span>{UI.nav.prev}</span>
      </button>
      <button type="button" className="btn-nav is-primary" onClick={() => dispatch({ type: 'next' })} disabled={state.step === last}>
        <span className="nav-next">
          <span>{UI.nav.next}</span>
          {state.step < last && <small>{shortName(state.step + 1)}</small>}
        </span>
        <Icon name="next" />
      </button>
    </div>
  );
}

export function GuidedPanel({ spec, compare }: { spec: SceneSpec; compare: { runoff: number; ground: number } | null }) {
  const { state, dispatch } = useStore();
  const step = STEPS[state.step];
  const extra = STEP_EXTRA[step.id];
  const [speaking, setSpeaking] = useState(false);
  const reduced = state.prefs.reducedMotion;
  const facts = FACTS_BY_STEP[step.id] ?? [];

  useEffect(() => {
    stopSpeaking();
    setSpeaking(false);
  }, [state.step]);
  useEffect(() => () => stopSpeaking(), []);

  const narrate = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const text = [`${step.title}: ${step.lead}`, step.what, step.cause, step.key ?? '', `Investiga. ${step.interactionPrompt}`, step.question.prompt].join(' ');
    setSpeaking(true);
    speak(text, () => setSpeaking(false));
  };

  return (
    <article className="guided" aria-labelledby="step-title">
      <header className="step-head">
        <h2 id="step-title" className="term" tabIndex={-1}>
          {step.title}
        </h2>
        <p className="lead">{cap(step.lead)}</p>
        <button
          type="button"
          className="mission"
          onClick={() => {
            const el = document.getElementById('lv-investigate');
            el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
            el?.parentElement?.querySelector<HTMLElement>('.try-controls button, .try-controls input')?.focus({ preventScroll: true });
          }}
        >
          <span className="mission-kicker">Tu misión</span>
          <span>{step.interactionPrompt}</span>
        </button>
        {state.prefs.narration && speechSupported() && (
          <button type="button" className="btn-ghost listen" onClick={narrate} aria-pressed={speaking}>
            <Icon name={speaking ? 'stop' : 'speaker'} />
            {speaking ? UI.sections.stopListening : UI.sections.listen}
          </button>
        )}
      </header>

      <section className="level level-observe" aria-labelledby="lv-observe">
        <h3 id="lv-observe" className="level-title">
          <span className="level-mark" aria-hidden="true">1</span>Observa
        </h3>
        {reduced && (
          <p className="static-desc">
            <strong>{UI.sections.staticDesc}: </strong>
            {step.staticDescription}
          </p>
        )}
        <p>
          <strong>Qué ocurre. </strong>
          {step.what}
        </p>
        <p>
          <strong>Por qué. </strong>
          {step.cause}
        </p>
        {step.key && (
          <aside className="key-idea">
            <h4>{UI.sections.keyIdea}</h4>
            <p>{step.key}</p>
          </aside>
        )}
      </section>

      <section className="level level-investigate" aria-labelledby="lv-investigate">
        <h3 id="lv-investigate" className="level-title">
          <span className="level-mark" aria-hidden="true">2</span>Investiga
        </h3>
        <p className="try-prompt">{step.interactionPrompt}</p>
        <div className="try-controls">
          <StepInteraction id={step.interaction} spec={spec} compare={compare} />
        </div>
        {extra?.details && extra.details.length > 0 && (
          <div className="detail-links">
            {extra.details.map((d) => (
              <button
                key={d}
                type="button"
                className="detail-link"
                onClick={() => {
                  rememberOpener();
                  dispatch({ type: 'openDetail', detail: { id: d, at: DETAIL_BY_ID[d].subject } });
                }}
              >
                <Icon name="zoom" />
                <span>
                  <strong>Ver de cerca</strong>
                  {DETAIL_BY_ID[d].title}
                </span>
              </button>
            ))}
          </div>
        )}
        <QuestionBlock q={step.question} resetKey={step.id} onLookAgain={() => dispatch({ type: 'replay' })} />
        {step.id === 'conexiones' && <InquiryList title="Elige tu próxima pregunta" />}
      </section>

      <Disclosure title="3 · Profundiza" className="level-deeper">
        {step.metaphor && (
          <aside className="metaphor">
            <div>
              <h4>{UI.sections.metaphorImage}</h4>
              <p>{step.metaphor.image}</p>
            </div>
            <div>
              <h4>{UI.sections.metaphorScience}</h4>
              <p>{step.metaphor.science}</p>
            </div>
          </aside>
        )}
        {step.more.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {facts.map((f) => (
          <FactCard key={f.id} fact={f} />
        ))}
        {!reduced && (
          <p className="static-desc">
            <strong>{UI.sections.staticDesc}: </strong>
            {step.staticDescription}
          </p>
        )}
        {step.terms.length > 0 && (
          <div className="terms">
            <span>Glosario:</span>
            {step.terms
              .filter((t) => TERM_BY_ID[t])
              .map((t) => (
                <button key={t} type="button" className="term-chip" onClick={() => dispatch({ type: 'openTerm', term: t })}>
                  {TERM_BY_ID[t].term}
                </button>
              ))}
          </div>
        )}
      </Disclosure>
    </article>
  );
}

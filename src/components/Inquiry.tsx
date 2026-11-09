// Preguntas para investigar: tarjeta con tres niveles (Observa, Investiga, Profundiza)
// y lista de preguntas. Cada pregunta lleva a una observación, una vista de detalle,
// un experimento o la gota trazadora, y permite registrar una hipótesis en la bitácora.

import { useId, useState } from 'react';
import { DETAIL_BY_ID } from '../content/details';
import { INQUIRIES, INQUIRY_BY_ID, type QuestionAction } from '../content/questions';
import { STEP_INDEX } from '../content/steps';
import { useStore } from '../state/store';
import { rememberOpener } from './DetailView';
import { FactCard } from './FactCard';
import { Disclosure, Icon } from './ui';

export function useRunAction() {
  const { dispatch } = useStore();
  return (a: QuestionAction) => {
    if (a.kind === 'detail') {
      rememberOpener();
      dispatch({ type: 'openDetail', detail: { id: a.id, at: DETAIL_BY_ID[a.id].subject } });
    } else if (a.kind === 'step') {
      dispatch({ type: 'mode', mode: 'guided' });
      dispatch({ type: 'step', index: STEP_INDEX[a.id] ?? 0 });
    } else if (a.kind === 'lab') {
      dispatch({ type: 'mode', mode: 'lab' });
      dispatch({ type: 'labTab', tab: a.tab });
      if (a.preset) dispatch({ type: 'cmpSet', patch: { expId: a.preset } });
    } else {
      dispatch({ type: 'tool', tool: 'tracer' });
    }
  };
}

export function InquiryCard({ id, onBack }: { id: string; onBack: () => void }) {
  const { state, dispatch } = useStore();
  const q = INQUIRY_BY_ID[id];
  const runAction = useRunAction();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const fieldId = useId();
  if (!q) return null;
  const hasHypothesis = state.logbook.some((e) => e.id === `hip-${q.id}`);
  return (
    <article className="inquiry" aria-labelledby="inq-title">
      <p className="kind-tag kind-pregunta">
        <Icon name="question" />
        Pregunta para investigar
      </p>
      <h2 id="inq-title" className="term">
        {q.question}
      </h2>

      <section className="level level-observe" aria-label="Observa">
        <h3 className="level-title">
          <span className="level-mark" aria-hidden="true">1</span>Observa
        </h3>
        <p>{q.observe}</p>
      </section>

      <section className="level level-investigate" aria-label="Investiga">
        <h3 className="level-title">
          <span className="level-mark" aria-hidden="true">2</span>Investiga
        </h3>
        <div className="d-explain">
          <label htmlFor={fieldId}>
            <strong>Antes de investigar, escribe tu hipótesis:</strong> ¿qué crees que ocurre y por qué?
          </label>
          <textarea id={fieldId} rows={2} maxLength={300} value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} />
          <div className="d-explain-actions">
            <button
              type="button"
              className="btn-ghost small"
              disabled={text.trim().length < 3}
              onClick={() => {
                dispatch({ type: 'log', entry: { id: `hip-${q.id}`, kind: 'prediccion', title: q.question, text: `Mi hipótesis: ${text.trim()}` } });
                setSaved(true);
              }}
            >
              Guardar hipótesis
            </button>
            {(saved || hasHypothesis) && <span role="status">{saved ? 'Guardada en tu bitácora.' : 'Ya tienes una hipótesis guardada.'}</span>}
          </div>
        </div>
        <div className="detail-links">
          {q.actions.map((a) => (
            <button key={a.label} type="button" className="detail-link" onClick={() => runAction(a)}>
              <Icon name={a.kind === 'detail' ? 'zoom' : a.kind === 'lab' ? 'replay' : 'next'} />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </section>

      <Disclosure title="3 · Profundiza">
        <p>{q.deeper}</p>
        {q.fact && <FactCard fact={q.fact} />}
      </Disclosure>

      <button type="button" className="btn-ghost back" onClick={onBack}>
        Ver todas las preguntas
      </button>
    </article>
  );
}

export function InquiryList({ title = 'Preguntas para investigar' }: { title?: string }) {
  const { state, dispatch } = useStore();
  return (
    <section className="inquiries" aria-labelledby="inq-list">
      <h3 id="inq-list">{title}</h3>
      <ul>
        {INQUIRIES.map((q) => {
          const tried = state.logbook.some((e) => e.id === `hip-${q.id}`);
          return (
            <li key={q.id}>
              <button
                type="button"
                className="inq-btn"
                onClick={() => {
                  if (state.mode !== 'explore') dispatch({ type: 'mode', mode: 'explore' });
                  dispatch({ type: 'inquiry', id: q.id });
                }}
              >
                <span className="inq-mark" aria-hidden="true">
                  ?
                </span>
                <span>{q.question}</span>
                {tried && (
                  <span className="si-check" aria-label="con hipótesis guardada">
                    <Icon name="check" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Marcas de pregunta sobre el paisaje (exploración libre). */
export function InquiryPins({ toScreen, width, height, compact }: { toScreen: (x: number, y: number) => [number, number]; width: number; height: number; compact: boolean }) {
  const { state, dispatch } = useStore();
  return (
    <>
      {INQUIRIES.map((q) => {
        const [x, y] = toScreen(q.at[0], q.at[1]);
        if (x < 16 || x > width - 16 || y < 60 || y > height - 60) return null;
        const on = state.inquiry === q.id;
        return (
          <button
            key={q.id}
            type="button"
            className={`inq-pin${on ? ' is-on' : ''}${compact ? ' is-compact' : ''}`}
            style={{ left: x, top: y }}
            aria-label={`Pregunta: ${q.question}`}
            aria-pressed={on}
            onClick={() => {
              if (state.mode !== 'explore') dispatch({ type: 'mode', mode: 'explore' });
              dispatch({ type: 'inquiry', id: on ? null : q.id });
            }}
          >
            <span aria-hidden="true">?</span>
            {!compact && <em>{q.question}</em>}
          </button>
        );
      })}
    </>
  );
}

export function pinBoxes(toScreen: (x: number, y: number) => [number, number]) {
  return INQUIRIES.map((q) => {
    const [x, y] = toScreen(q.at[0], q.at[1]);
    return { x: x - 20, y: y - 20, w: 40, h: 40 };
  });
}

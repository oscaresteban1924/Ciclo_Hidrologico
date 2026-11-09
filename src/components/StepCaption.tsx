// Subtítulo de observación sobre el paisaje: guía la mirada en tres momentos (inicio, desarrollo,
// resultado). Avanza con la reproducción, se detiene con la pausa y puede revisarse.

import { BEAT_NAMES, SEQUENCE_LENGTH, STEP_EXTRA, beatAt } from '../content/sequences';
import { STEPS } from '../content/steps';
import { useSequenceClock } from '../lib/useSequenceClock';
import { useStore } from '../state/store';

export function StepCaption({ compact, placement = 'stage' }: { compact: boolean; placement?: 'stage' | 'panel' }) {
  const { state } = useStore();
  const step = STEPS[state.step];
  const extra = STEP_EXTRA[step.id];
  const reduced = state.prefs.reducedMotion;
  const { t, seek } = useSequenceClock(SEQUENCE_LENGTH, !state.paused && !reduced, state.speed, `${state.step}|${state.replay}`);
  if (!extra) return null;
  const i = beatAt(extra.beats, t);
  const beat = extra.beats[i];
  return (
    <div className={`step-caption is-${placement}${compact ? ' is-compact' : ''}`} role="group" aria-label="Qué observar ahora">
      <div className="sc-head">
        <span className="sc-kicker">Observa</span>
        <div className="sc-beats">
          {extra.beats.map((b, k) => (
            <button
              key={k}
              type="button"
              className={k === i ? 'is-on' : k < i ? 'is-done' : ''}
              aria-label={`${BEAT_NAMES[k]}${k === i ? ' (actual)' : ''}`}
              aria-current={k === i ? 'step' : undefined}
              onClick={() => seek(b.at + 0.01)}
            >
              <span aria-hidden="true">{BEAT_NAMES[k]}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="sc-text" aria-live={placement === 'stage' ? 'polite' : undefined}>
        {beat.text}
      </p>
      {placement === 'stage' && !compact && <p className="sc-note">Velocidades, tamaños y tiempos simplificados.</p>}
    </div>
  );
}

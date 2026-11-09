// Retos: sin cronómetros ni penalizaciones. Las respuestas no esperadas reciben una pista.

import { useEffect, useMemo, useState } from 'react';
import {
  CHALLENGES,
  CLASSIFY_ITEMS,
  CLOUD_QUESTION,
  PREDICT_ITEMS,
  SPOT_ROUNDS,
  type ChallengeId,
} from '../content/challenges';
import { INVALID_OPTIONS, ROUTE_GOALS, ROUTE_NODES, edgeKey, edgesFrom } from '../content/routes';
import { DEFAULT_CONDITIONS, LEVEL_NAMES, runModel } from '../lab/model';
import { useStore } from '../state/store';
import { QuestionBlock } from './ui';

function useClearFocus() {
  const { dispatch } = useStore();
  useEffect(() => () => dispatch({ type: 'focus', focus: null }), [dispatch]);
}

function Spot({ onDone }: { onDone: () => void }) {
  const { dispatch } = useStore();
  const [i, setI] = useState(0);
  const [solved, setSolved] = useState(false);
  const round = SPOT_ROUNDS[i];
  useClearFocus();
  useEffect(() => {
    dispatch({
      type: 'focus',
      focus: { source: 'challenge', region: round.region, layers: round.layers, conditions: { ...round.conditions }, hideLabels: true, isolate: true },
    });
    dispatch({ type: 'replay' });
    setSolved(false);
  }, [round, dispatch]);
  return (
    <div>
      <p className="counter">
        Ronda {i + 1} de {SPOT_ROUNDS.length}
      </p>
      <p>Observa el movimiento que se destaca en el paisaje. Las demás animaciones están casi ocultas.</p>
      <QuestionBlock
        title="¿Qué proceso estás viendo?"
        q={{ prompt: 'Elige el nombre del proceso.', options: round.options, correct: round.correct, right: round.right, hint: round.hint }}
        resetKey={round.id}
        onLookAgain={() => {
          dispatch({ type: 'replay' });
          dispatch({ type: 'zoom', zoom: 'in' });
        }}
        onRight={() => setSolved(true)}
      />
      {solved && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (i < SPOT_ROUNDS.length - 1) setI(i + 1);
            else onDone();
          }}
        >
          {i < SPOT_ROUNDS.length - 1 ? 'Siguiente ronda' : 'Terminar el reto'}
        </button>
      )}
    </div>
  );
}

function Classify({ onDone }: { onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, 'reservorio' | 'proceso'>>({});
  const allRight = CLASSIFY_ITEMS.every((it) => answers[it.id] === it.answer);
  useEffect(() => {
    if (allRight) onDone();
  }, [allRight, onDone]);
  return (
    <div>
      <p>¿Es un lugar donde el agua se almacena (reservorio) o un movimiento del agua (proceso o flujo)?</p>
      <ul className="classify">
        {CLASSIFY_ITEMS.map((it) => {
          const a = answers[it.id];
          const ok = a === it.answer;
          return (
            <li key={it.id} className={a ? (ok ? 'is-right' : 'is-hint') : ''}>
              <span className="classify-name">{it.name}</span>
              <div className="classify-btns" role="group" aria-label={`Clasificar ${it.name}`}>
                {(['reservorio', 'proceso'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={a === k} className={`option${a === k ? (ok ? ' is-right' : ' is-hint') : ''}`} onClick={() => setAnswers({ ...answers, [it.id]: k })}>
                    {k === 'reservorio' ? 'Reservorio' : 'Proceso'}
                  </button>
                ))}
              </div>
              {a && (
                <p className="classify-feedback" aria-live="polite">
                  {ok ? it.why : 'Pista: pregúntate si puedes señalarlo como un lugar o si describe algo que el agua hace.'}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {allRight && <p className="feedback is-right"><strong>Clasificación completa.</strong> Distinguir lugares de movimientos es la base para construir balances de agua.</p>}
    </div>
  );
}

function RouteBuilder({ onDone }: { onDone: () => void }) {
  const { dispatch } = useStore();
  const [goalId, setGoalId] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const goal = ROUTE_GOALS.find((g) => g.id === goalId) ?? null;
  const node = goal ? (path.length ? path[path.length - 1].split('>')[1] : goal.from) : null;
  const reached = !!goal && node === goal.to && path.length > 0;
  useClearFocus();

  useEffect(() => {
    if (node) dispatch({ type: 'focus', focus: { source: 'challenge', region: ROUTE_NODES[node].region, layers: 'all' } });
  }, [node, dispatch]);
  useEffect(() => {
    if (reached) onDone();
  }, [reached, onDone]);

  const options = useMemo(() => {
    if (!node) return [];
    const valid = edgesFrom(node).map((e) => ({ key: edgeKey(e), process: e.process, to: e.to, hint: null as string | null }));
    const invalid = (INVALID_OPTIONS[node] ?? []).map((x, i) => ({ key: `x${i}`, process: x.process, to: null as string | null, hint: x.hint }));
    return [...valid, ...invalid].sort((a, b) => a.process.localeCompare(b.process, 'es'));
  }, [node]);

  if (!goal) {
    return (
      <div>
        <p>Elige un desafío. Hay más de un camino correcto.</p>
        <div className="chip-grid">
          {ROUTE_GOALS.map((g) => (
            <button key={g.id} type="button" className="chip" onClick={() => setGoalId(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="counter">
        {goal.label}. Ahora el agua está en: <strong>{ROUTE_NODES[node!].name}</strong>
      </p>
      {!reached && (
        <>
          <p>¿Qué proceso puede llevarla al siguiente lugar?</p>
          <div className="route-options">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                className="route-option"
                onClick={() => {
                  if (o.to) {
                    setPath([...path, o.key]);
                    setHint(null);
                  } else setHint(o.hint);
                }}
              >
                <strong>{o.process}</strong>
              </button>
            ))}
          </div>
          {hint && (
            <p className="feedback is-hint" aria-live="polite">
              <strong>Pista:</strong> {hint}
            </p>
          )}
        </>
      )}
      {path.length > 0 && (
        <ol className="route-built">
          <li>{ROUTE_NODES[goal.from].name}</li>
          {path.map((p, i) => (
            <li key={i}>{ROUTE_NODES[p.split('>')[1]].name}</li>
          ))}
        </ol>
      )}
      {reached && (
        <div className="feedback is-right" aria-live="polite">
          <p>
            <strong>Ruta completa en {path.length} {path.length === 1 ? 'paso' : 'pasos'}.</strong> Es una de varias rutas posibles: intenta otra con procesos distintos.
          </p>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'tracerPlay', start: goal.from, edges: path })}>
            Ver mi ruta con la gota trazadora
          </button>
        </div>
      )}
      <div className="tracer-actions">
        <button type="button" className="btn-ghost" disabled={!path.length} onClick={() => setPath(path.slice(0, -1))}>
          Volver un paso
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setPath([]);
            setGoalId(null);
            setHint(null);
          }}
        >
          Elegir otro desafío
        </button>
      </div>
    </div>
  );
}

function Predict({ onDone }: { onDone: () => void }) {
  const { dispatch } = useStore();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const item = PREDICT_ITEMS[i];
  const a = runModel({ ...DEFAULT_CONDITIONS, ...item.inputs });
  const b = runModel({ ...DEFAULT_CONDITIONS, ...item.compare });
  useClearFocus();
  useEffect(() => setPicked(null), [i]);
  const label = item.ask === 'escorrentia' ? 'Escorrentía' : 'Infiltración';
  return (
    <div>
      <p className="counter">
        Situación {i + 1} de {PREDICT_ITEMS.length}
      </p>
      <p className="scenario">{item.scenario}</p>
      <div className="question-options">
        {item.options.map((o, k) => (
          <button key={k} type="button" className={`option${picked === k ? (k === item.correct ? ' is-right' : ' is-hint') : ''}`} aria-pressed={picked === k} onClick={() => setPicked(k)}>
            {o}
          </button>
        ))}
      </div>
      {picked !== null && (
        <div aria-live="polite">
          <p className={`feedback ${picked === item.correct ? 'is-right' : 'is-hint'}`}>
            <strong>{picked === item.correct ? 'Bien razonado.' : 'Pista:'}</strong> {picked === item.correct ? item.right : item.hint}
          </p>
          <p className="readout">
            Comprobación con el modelo: {label} <strong>{LEVEL_NAMES[a.levels[item.ask]].toLowerCase()}</strong> en el primer caso y{' '}
            <strong>{LEVEL_NAMES[b.levels[item.ask]].toLowerCase()}</strong> en el segundo.
          </p>
          <div className="exp-buttons">
            <button type="button" className="btn-ghost" onClick={() => dispatch({ type: 'focus', focus: { source: 'challenge', region: 'runoff', layers: 'all', conditions: item.inputs } })}>
              Ver el primer caso
            </button>
            <button type="button" className="btn-ghost" onClick={() => dispatch({ type: 'focus', focus: { source: 'challenge', region: 'runoff', layers: 'all', conditions: item.compare } })}>
              Ver el segundo caso
            </button>
          </div>
          {picked === item.correct && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (i < PREDICT_ITEMS.length - 1) setI(i + 1);
                else onDone();
              }}
            >
              {i < PREDICT_ITEMS.length - 1 ? 'Siguiente situación' : 'Terminar el reto'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CloudChallenge({ onDone }: { onDone: () => void }) {
  const { dispatch } = useStore();
  useClearFocus();
  useEffect(() => {
    dispatch({ type: 'focus', focus: { source: 'challenge', region: 'condensation', layers: ['cond'], conditions: { rain: 0 } } });
  }, [dispatch]);
  return (
    <QuestionBlock
      title="Explica"
      q={CLOUD_QUESTION}
      resetKey="cloud"
      onRight={onDone}
      onLookAgain={() => {
        dispatch({ type: 'focus', focus: { source: 'challenge', region: 'condensation', layers: ['cond'], conditions: { rain: 0 } } });
        dispatch({ type: 'zoom', zoom: 'in' });
      }}
    />
  );
}

export function ChallengesPanel() {
  const { state, dispatch } = useStore();
  const [active, setActive] = useState<ChallengeId | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const done = useMemo(() => {
    const make = (id: ChallengeId) => () => {
      dispatch({ type: 'challengeDone', id });
      setCelebrate(id);
    };
    return { spot: make('spot'), classify: make('classify'), route: make('route'), predict: make('predict'), cloud: make('cloud') };
  }, [dispatch]);
  useEffect(() => setCelebrate(null), [active]);
  const ch = CHALLENGES.find((c) => c.id === active);

  return (
    <div className="challenges">
      <h2 className="term">Retos</h2>
      {!ch ? (
        <>
          <p className="lead">Pon a prueba lo que observaste. Puedes intentar cuantas veces quieras.</p>
          <ul className="challenge-list">
            {CHALLENGES.map((c) => {
              const isDone = state.progress.challenges.includes(c.id);
              return (
                <li key={c.id}>
                  <button type="button" className={`exp-card${isDone ? ' is-done' : ''}`} onClick={() => setActive(c.id)}>
                    <strong>{c.title}</strong>
                    <span>{c.desc}</span>
                    {isDone && <em className="done-tag">Completado</em>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <section aria-labelledby="ch-title">
          <h3 id="ch-title" className="exp-question">{ch.title}</h3>
          {ch.id === 'spot' && <Spot onDone={done.spot} />}
          {ch.id === 'classify' && <Classify onDone={done.classify} />}
          {ch.id === 'route' && <RouteBuilder onDone={done.route} />}
          {ch.id === 'predict' && <Predict onDone={done.predict} />}
          {ch.id === 'cloud' && <CloudChallenge onDone={done.cloud} />}
          {celebrate === ch.id && ch.id !== 'route' && ch.id !== 'classify' && (
            <p className="feedback is-right celebrate-box" aria-live="polite">
              <strong>Reto completado.</strong> Observaste, comparaste y explicaste: así trabaja una hidróloga o un hidrólogo.
            </p>
          )}
          <button type="button" className="btn-ghost back" onClick={() => setActive(null)}>
            Volver a la lista de retos
          </button>
        </section>
      )}
    </div>
  );
}

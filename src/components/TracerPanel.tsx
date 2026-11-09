// Gota trazadora: el niño elige el camino en cada bifurcación y observa dónde puede quedar almacenada.

import { useEffect } from 'react';
import { ROUTE_EDGES, ROUTE_NODES, TRACER_STARTS, edgeKey, edgesFrom } from '../content/routes';
import { useStore } from '../state/store';

const STATE_NAME = { vapor: 'vapor (invisible)', cloud: 'gota de nube', liquid: 'agua líquida', ice: 'hielo' } as const;

export function TracerPanel() {
  const { state, dispatch } = useStore();
  const t = state.tracer;

  // Reproducción automática de una ruta completa (desde el reto de construir rutas).
  useEffect(() => {
    if (t && !t.moving && t.queue.length) {
      const id = window.setTimeout(() => {
        const next = t.queue[0];
        dispatch({ type: 'tracerGo', edge: next, to: next.split('>')[1] });
      }, 900);
      return () => window.clearTimeout(id);
    }
  }, [t, dispatch]);

  const node = t ? ROUTE_NODES[t.node] : null;
  const moving = t?.moving ? ROUTE_EDGES.find((e) => edgeKey(e) === t.moving) : null;
  const options = t && !t.moving ? edgesFrom(t.node) : [];

  return (
    <div className="tracer-panel">
      <h2 className="term">Gota trazadora</h2>
      <p className="lead">Sigue una pequeña porción de agua y elige su camino en cada bifurcación.</p>
      <p className="note">
        La gota rosada es un recurso visual: marca una porción de agua que cambia de estado. No es una gota que conserve su forma: cuando se evapora, esa agua es vapor invisible.
      </p>

      {!t && (
        <section aria-labelledby="start-title">
          <h3 id="start-title">¿Dónde empieza?</h3>
          <div className="chip-grid">
            {TRACER_STARTS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => dispatch({ type: 'tracerStart', node: s })}>
                {ROUTE_NODES[s].name}
              </button>
            ))}
          </div>
        </section>
      )}

      {t && node && (
        <>
          <section className="tracer-now" aria-live="polite">
            {moving ? (
              <>
                <h3>{moving.process}</h3>
                <p>{moving.caption}</p>
              </>
            ) : (
              <>
                <h3>
                  Ahora está en: <span>{node.name}</span>
                </h3>
                <p>
                  Estado: <strong>{STATE_NAME[node.state]}</strong>. {node.storage}
                </p>
                <p className="residence">{node.time}</p>
              </>
            )}
          </section>

          {!t.moving && t.queue.length === 0 && (
            <section aria-labelledby="next-title">
              <h3 id="next-title">¿Por dónde sigue?</h3>
              <div className="route-options">
                {options.map((e) => (
                  <button key={edgeKey(e)} type="button" className="route-option" onClick={() => dispatch({ type: 'tracerGo', edge: edgeKey(e), to: e.to })}>
                    <strong>{e.process}</strong>
                    <span>hacia {ROUTE_NODES[e.to].name.toLowerCase()}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {t.history.length > 0 && (
            <section aria-labelledby="hist-title" className="history">
              <h3 id="hist-title">Ruta recorrida</h3>
              <ol>
                {t.history.map((h, i) => {
                  const e = ROUTE_EDGES.find((x) => edgeKey(x) === h);
                  return (
                    <li key={`${h}-${i}`}>
                      {e?.process} <span>→ {ROUTE_NODES[h.split('>')[1]].name}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <div className="tracer-actions">
            <button type="button" className="btn-ghost" disabled={!!t.moving || t.history.length === 0} onClick={() => dispatch({ type: 'tracerBack' })}>
              Volver un paso
            </button>
            <button type="button" className="btn-ghost" disabled={!!t.moving} onClick={() => dispatch({ type: 'tracerClear' })}>
              Empezar en otro lugar
            </button>
          </div>
          <p className="note">Los tiempos de permanencia son aproximados y cambian mucho de un lugar a otro. Las velocidades de la animación están simplificadas.</p>
        </>
      )}
    </div>
  );
}

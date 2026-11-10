// Pestaña «Procesos» de la planta: los once pasos del tratamiento convencional, uno por uno. Para cada paso: qué
// hace, una animación «con lupa», lo que le pasa al agua en el juego (valores calculados), cómo lo hace, con qué
// números se diseña (Resolución 0330 de 2017), qué puede salir mal y qué se mide. Incluye un recorrido guiado
// que avanza solo y mueve la cámara de la escena.

import type { PlantInput, PlantResult } from './model';
import { ProcessLens } from './ProcessLens';
import { PROCESSES, processById, type ProcessId } from './processes';

/** Segundos que el recorrido guiado se queda en cada paso. */
export const TOUR_S = 16;

export function ProcessPanel({
  cur,
  r,
  inp,
  seen,
  touring,
  washing,
  reduced,
  onPick,
  onTour,
  onWash,
  onLook,
}: {
  cur: ProcessId;
  r: PlantResult;
  inp: PlantInput;
  seen: ReadonlySet<ProcessId>;
  touring: boolean;
  washing: boolean;
  reduced: boolean;
  onPick: (id: ProcessId) => void;
  onTour: () => void;
  onWash: () => void;
  onLook: (id: ProcessId) => void;
}) {
  const p = processById(cur);
  const i = PROCESSES.indexOf(p);
  const prev = PROCESSES[i - 1], next = PROCESSES[i + 1];
  const io = p.inOut(r, inp);
  // criterios de diseño (Resolución 0330), valores exigidos al agua entregada (Resolución 2115) o descripción general
  const kind = p.source.includes('0330') ? 'diseño' : p.source.includes('2115') ? 'norma' : 'general';
  const tableTitle = { diseño: '¿Con qué números se diseña?', norma: '¿Qué exige la norma?', general: 'En resumen' }[kind];
  const srcNote = { diseño: ' Son criterios generales de diseño, no los datos de una planta en particular.', norma: ' Son los valores que la norma exige al agua que se entrega.', general: '' }[kind];
  return (
    <div className="q3-procs">
      <p className="q3-intro">
        Una planta convencional (de filtración rápida) limpia el agua del río en once pasos, y cada uno hace un trabajo distinto. Toca un paso aquí o una parte de la planta en la escena.
      </p>
      <div className="q3-tour">
        <button type="button" className={touring ? 'btn-ghost small' : 'btn'} aria-pressed={touring} onClick={onTour}>
          {touring ? 'Detener el recorrido' : 'Recorrer la planta'}
        </button>
        <span className="q3-small">
          {seen.size} de {PROCESSES.length} pasos vistos
        </span>
      </div>
      {touring && (
        <div className="q3-tourbar" aria-hidden="true">
          <i key={cur} className={reduced ? 'is-still' : ''} style={{ animationDuration: `${TOUR_S}s` }} />
        </div>
      )}
      <ol className="q3-steps" aria-label="Pasos del tratamiento">
        {PROCESSES.map((s) => (
          <li key={s.id}>
            <button type="button" className={`${s.id === cur ? 'is-on' : ''}${seen.has(s.id) ? ' is-seen' : ''}`} aria-current={s.id === cur ? 'step' : undefined} onClick={() => onPick(s.id)}>
              <b>{s.n}</b>
              <span>{s.name}</span>
            </button>
          </li>
        ))}
      </ol>

      <article className="q3-proc" aria-labelledby="q3-proc-h">
        <p className="q3-proc-n" aria-live="polite">
          Paso {p.n} de {PROCESSES.length}
          {touring ? ' · recorrido por la planta' : ''}
        </p>
        <h3 id="q3-proc-h">{p.name}</h3>
        <p className="q3-proc-short">{p.short}</p>
        <figure className="q3-proc-lens">
          <ProcessLens id={p.id} r={r} inp={inp} washing={washing} />
          <figcaption className="q3-small">Con lupa: dibujo ilustrativo de lo que pasa adentro{p.id === 'mezcla' || p.id === 'floc' || p.id === 'sedim' || p.id === 'cloro' || p.id === 'ph' || p.id === 'llave' ? ', con los valores del juego' : ''}.</figcaption>
        </figure>

        <h4>En la planta del juego, ahora</h4>
        <dl className="q3-io">
          {io.map((x) => (
            <div key={x.label}>
              <dt>{x.label}</dt>
              <dd>{x.value}</dd>
            </div>
          ))}
        </dl>

        <h4>¿Cómo lo hace?</h4>
        <ul className="q3-how">
          {p.how.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>

        <h4>{tableTitle}</h4>
        <table className="q3-table q3-dtable">
          <tbody>
            {p.design.map((d) => (
              <tr key={d.label}>
                <th scope="row">{d.label}</th>
                <td>{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="q3-small q3-src">
          Fuente: {p.source}
          {srcNote}
        </p>

        <h4>¿Qué puede salir mal?</h4>
        <p>{p.wrong}</p>
        <h4>¿Qué se mide?</h4>
        <p>{p.measure}</p>

        {p.id === 'filtro' && (
          <p className="q3-wash">
            <button type="button" className="btn" onClick={onWash} disabled={washing}>
              {washing ? 'Lavando los filtros…' : 'Lavar los filtros (retrolavado)'}
            </button>
            <span className="q3-small">En la escena, la costra de mugre sale con el agua hacia los lodos y el lecho se vuelve a ensuciar poco a poco.</span>
          </p>
        )}

        <nav className="q3-procnav" aria-label="Pasar de un paso a otro">
          <button type="button" className="btn-ghost small" disabled={!prev} onClick={() => prev && onPick(prev.id)}>
            ← {prev ? prev.name : 'Anterior'}
          </button>
          <button type="button" className="btn-ghost small" onClick={() => onLook(p.id)}>
            Ver en la planta
          </button>
          <button type="button" className="btn-ghost small" disabled={!next} onClick={() => next && onPick(next.id)}>
            {next ? next.name : 'Siguiente'} →
          </button>
        </nav>
      </article>
    </div>
  );
}

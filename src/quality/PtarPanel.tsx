// Pestaña «Procesos» de la planta de aguas residuales: las once partes, de la llegada a la deshidratación del
// lodo. Para cada una: qué hace, una animación «con lupa», lo que le pasa al agua en el juego (valores
// calculados), cómo lo hace, con qué rangos se diseña, qué puede salir mal y qué se mide. Incluye el recorrido
// guiado que avanza solo y mueve la cámara de la escena.

import { TOUR_S } from './ProcessPanel';
import type { PtarInput, PtarResult } from './ptar';
import { PtarLens } from './PtarLens';
import { PTAR_UNITS, ptarUnitById, type PtarUnitId } from './ptarUnits';

export function PtarPanel({
  cur,
  r,
  inp,
  seen,
  touring,
  reduced,
  onPick,
  onTour,
  onLook,
}: {
  cur: PtarUnitId;
  r: PtarResult;
  inp: PtarInput;
  seen: ReadonlySet<PtarUnitId>;
  touring: boolean;
  reduced: boolean;
  onPick: (id: PtarUnitId) => void;
  onTour: () => void;
  onLook: (id: PtarUnitId) => void;
}) {
  const u = ptarUnitById(cur);
  const i = PTAR_UNITS.indexOf(u);
  const prev = PTAR_UNITS[i - 1], next = PTAR_UNITS[i + 1];
  const io = u.inOut(r, inp);
  const norm = u.source.includes('0631');
  return (
    <div className="q3-procs">
      <p className="q3-intro">
        El agua usada de las casas pasa por once partes: primero se le quita lo grueso, luego lo que se asienta, después bacterias con aire se comen lo disuelto y al final la luz desinfecta. Lo que se retira se vuelve lodo, y el lodo, biogás. Toca una parte aquí o en la escena.
      </p>
      <div className="q3-tour">
        <button type="button" className={touring ? 'btn-ghost small' : 'btn'} aria-pressed={touring} onClick={onTour}>
          {touring ? 'Detener el recorrido' : 'Recorrer la planta'}
        </button>
        <span className="q3-small">
          {seen.size} de {PTAR_UNITS.length} partes vistas
        </span>
      </div>
      {touring && (
        <div className="q3-tourbar" aria-hidden="true">
          <i key={cur} className={reduced ? 'is-still' : ''} style={{ animationDuration: `${TOUR_S}s` }} />
        </div>
      )}
      <ol className="q3-steps" aria-label="Partes de la planta de aguas residuales">
        {PTAR_UNITS.map((s) => (
          <li key={s.id}>
            <button type="button" className={`${s.id === cur ? 'is-on' : ''}${seen.has(s.id) ? ' is-seen' : ''}`} aria-current={s.id === cur ? 'step' : undefined} onClick={() => onPick(s.id)}>
              <b>{s.n}</b>
              <span>{s.name}</span>
            </button>
          </li>
        ))}
      </ol>

      <article className="q3-proc" aria-labelledby="q3-ptar-h">
        <p className="q3-proc-n" aria-live="polite">
          Parte {u.n} de {PTAR_UNITS.length}
          {touring ? ' · recorrido por la planta' : ''}
          {u.n >= 9 ? ' · línea de lodos' : ''}
        </p>
        <h3 id="q3-ptar-h">{u.name}</h3>
        <p className="q3-proc-short">{u.short}</p>
        <figure className="q3-proc-lens">
          <PtarLens id={u.id} r={r} inp={inp} />
          <figcaption className="q3-small">Con lupa: dibujo ilustrativo de lo que pasa adentro, con los valores del juego.</figcaption>
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
          {u.how.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>

        <h4>{norm ? '¿Qué exige la norma?' : '¿Con qué números se diseña?'}</h4>
        <table className="q3-table q3-dtable">
          <tbody>
            {u.design.map((d) => (
              <tr key={d.label}>
                <th scope="row">{d.label}</th>
                <td>{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="q3-small q3-src">
          Fuente: {u.source.replace(/\.$/, '')}.{norm ? '' : ' Son rangos generales, no los datos de una planta en particular.'}
        </p>

        <h4>¿Qué puede salir mal?</h4>
        <p>{u.wrong}</p>
        <h4>¿Qué se mide?</h4>
        <p>{u.measure}</p>

        <nav className="q3-procnav" aria-label="Pasar de una parte a otra">
          <button type="button" className="btn-ghost small" disabled={!prev} onClick={() => prev && onPick(prev.id)}>
            ← {prev ? prev.name : 'Anterior'}
          </button>
          <button type="button" className="btn-ghost small" onClick={() => onLook(u.id)}>
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

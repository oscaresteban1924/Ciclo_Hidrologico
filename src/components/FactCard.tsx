// Tarjeta «¿Sabías que…?» con su fuente visible y enlazada.

import { SOURCE_BY_ID, SOURCES, type Fact } from '../content/facts';

export function FactCard({ fact }: { fact: Fact }) {
  return (
    <aside className="fact">
      <p className="fact-kicker">¿Sabías que…?</p>
      <p className="fact-text">{fact.text}</p>
      <p className="fact-src">
        Fuente:{' '}
        {fact.sources.map((id, i) => {
          const s = SOURCE_BY_ID[id];
          return (
            <span key={id}>
              {i > 0 && '; '}
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.org}
              </a>
            </span>
          );
        })}
      </p>
    </aside>
  );
}

/** Sección discreta de fuentes para docentes. */
export function TeacherSources() {
  return (
    <div className="sources">
      <p>
        Los datos de «¿Sabías que…?» provienen de estas fuentes. Las cifras son estimaciones o promedios redondeados y pueden variar según la fuente, el lugar y el método. El laboratorio usa un modelo educativo con reglas explícitas: muestra tendencias coherentes, no predicciones.
      </p>
      <ul>
        {SOURCES.map((s) => (
          <li key={s.id}>
            <strong>{s.org}.</strong>{' '}
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Glosario interactivo vinculado al paisaje.

import { useEffect, useMemo, useRef, useState } from 'react';
import { GLOSSARY } from '../content/glossary';
import { useStore } from '../state/store';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function GlossaryPanel() {
  const { state, dispatch } = useStore();
  const [q, setQ] = useState('');
  const [shown, setShown] = useState<string | null>(state.term);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => {
    const n = norm(q.trim());
    return [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'es')).filter((t) => !n || norm(t.term).includes(n) || norm(t.def).includes(n));
  }, [q]);

  const show = (id: string) => {
    const t = GLOSSARY.find((x) => x.id === id);
    if (!t) return;
    setShown(id);
    dispatch({ type: 'focus', focus: { source: 'glossary', region: t.region ?? 'all', layers: t.layers ?? 'all' } });
  };

  useEffect(() => {
    if (state.term) {
      show(state.term);
      const el = listRef.current?.querySelector(`[data-term="${state.term}"]`);
      el?.scrollIntoView({ block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.term]);

  useEffect(() => () => dispatch({ type: 'focus', focus: null }), [dispatch]);

  return (
    <div className="glossary">
      <h2 className="term">Glosario</h2>
      <label className="search">
        <span>Buscar un término</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Por ejemplo: acuífero" />
      </label>
      <ul ref={listRef}>
        {items.map((t) => (
          <li key={t.id} data-term={t.id} className={shown === t.id ? 'is-on' : ''}>
            <dfn>{t.term}</dfn>
            <p>{t.def}</p>
            {t.region && (
              <button type="button" className="btn-ghost small" aria-pressed={shown === t.id} onClick={() => show(t.id)}>
                {shown === t.id ? 'Iluminado en el paisaje' : 'Ver en el paisaje'}
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="empty">No hay términos con esa palabra. Prueba con otra, por ejemplo «nube» o «suelo».</li>}
      </ul>
    </div>
  );
}

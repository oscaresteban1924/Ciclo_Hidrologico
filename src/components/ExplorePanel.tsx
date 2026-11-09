// Exploración libre: cualquier proceso, reservorio o elemento del paisaje se puede consultar.

import { ELEMENTS, ELEMENT_BY_ID, KIND_NAMES } from '../content/elements';
import { TERM_BY_ID } from '../content/glossary';
import { ROUTE_NODES } from '../content/routes';
import { STEP_INDEX, STEPS } from '../content/steps';
import type { ElementKind } from '../content/types';
import { KindGlyph } from '../scene/Labels';
import { useStore, type ExploreLayers } from '../state/store';
import { InquiryCard, InquiryList } from './Inquiry';
import { Disclosure, Toggle } from './ui';

const LAYERS: { id: keyof ExploreLayers; label: string; help: string }[] = [
  { id: 'reservorio', label: 'Reservorios', help: 'Rótulos rectangulares oscuros: dónde se almacena el agua.' },
  { id: 'proceso', label: 'Todos los procesos', help: 'Flechas, partículas y rótulos redondeados de todos los procesos a la vez.' },
  { id: 'elemento', label: 'Elementos y fuerzas', help: 'Sol, gravedad, ciudad, pozo y otros elementos del paisaje.' },
  { id: 'preguntas', label: 'Preguntas para investigar', help: 'Marcas «?» sobre el paisaje.' },
];

const GROUPS: { kind: ElementKind[]; title: string }[] = [
  { kind: ['reservorio'], title: 'Reservorios: dónde se almacena el agua' },
  { kind: ['proceso'], title: 'Procesos: cómo se mueve o cambia de estado' },
  { kind: ['elemento', 'fuerza'], title: 'Elementos del paisaje y fuerzas' },
];

export function ExplorePanel() {
  const { state, dispatch } = useStore();
  const el = state.selected ? ELEMENT_BY_ID[state.selected] : null;
  const nodeId = el ? (el.id === 'vegetacion' ? 'planta' : el.id) : null;
  const tracerNode = nodeId && ROUTE_NODES[nodeId] ? nodeId : null;

  return (
    <div className="explore">
      <Disclosure title="Capas del paisaje" className="layers-box" defaultOpen={!el && !state.inquiry}>
        <div className="layer-toggles">
          {LAYERS.map((l) => (
            <Toggle key={l.id} label={l.label} help={l.help} checked={state.layersOn[l.id]} onChange={(v) => dispatch({ type: 'layers', patch: { [l.id]: v } })} />
          ))}
        </div>
      </Disclosure>

      {state.inquiry ? (
        <InquiryCard id={state.inquiry} onBack={() => dispatch({ type: 'inquiry', id: null })} />
      ) : el ? (
        <article className="element" aria-live="polite" aria-labelledby="el-title">
          <p className={`kind-tag kind-${el.kind}`}>
            <KindGlyph kind={el.kind} />
            {KIND_NAMES[el.kind]}
          </p>
          <h2 id="el-title" className="term">
            {el.name}
          </h2>
          <p className="lead">{el.short}</p>
          <Disclosure title="Quiero saber más" defaultOpen>
            <p>{el.more}</p>
          </Disclosure>
          <div className="element-actions">
            {el.step && STEP_INDEX[el.step] !== undefined && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  dispatch({ type: 'mode', mode: 'guided' });
                  dispatch({ type: 'step', index: STEP_INDEX[el.step!] });
                }}
              >
                Estudiarlo en el recorrido: {STEPS[STEP_INDEX[el.step]].title}
              </button>
            )}
            {tracerNode && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  dispatch({ type: 'tool', tool: 'tracer' });
                  dispatch({ type: 'tracerStart', node: tracerNode });
                }}
              >
                Seguir una gota trazadora desde aquí
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={() => dispatch({ type: 'select', id: null })}>
              Ver todo el paisaje
            </button>
          </div>
          {el.terms && el.terms.length > 0 && (
            <div className="terms">
              <span>Glosario:</span>
              {el.terms
                .filter((t) => TERM_BY_ID[t])
                .map((t) => (
                  <button key={t} type="button" className="term-chip" onClick={() => dispatch({ type: 'openTerm', term: t })}>
                    {TERM_BY_ID[t].term}
                  </button>
                ))}
            </div>
          )}
        </article>
      ) : (
        <div className="explore-intro">
          <h2 className="term">Exploración libre</h2>
          <p className="lead">Pulsa cualquier parte del paisaje, sobre o bajo la superficie, o elige un nombre de la lista.</p>
          <p>
            Las etiquetas rellenas con esquina cuadrada son <strong>reservorios</strong> (lugares donde el agua se almacena). Las etiquetas con borde y flecha son{' '}
            <strong>procesos</strong> (movimientos y cambios de estado). Enciende las capas que quieras ver.
          </p>
          <InquiryList />
        </div>
      )}

      <nav className="element-list" aria-label="Elementos del paisaje">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <div className="chip-grid">
              {ELEMENTS.filter((e) => g.kind.includes(e.kind)).map((e) => (
                <button key={e.id} type="button" className={`chip kind-${e.kind}${state.selected === e.id ? ' is-on' : ''}`} aria-pressed={state.selected === e.id} onClick={() => dispatch({ type: 'select', id: e.id })}>
                  <KindGlyph kind={e.kind} />
                  {e.name}
                </button>
              ))}
            </div>
          </section>
        ))}
      </nav>
    </div>
  );
}

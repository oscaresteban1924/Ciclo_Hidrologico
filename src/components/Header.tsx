// Encabezado: modos conectados, herramientas, pausa global y ajustes de accesibilidad.

import { useEffect, useRef, useState } from 'react';
import { TeacherSources } from './FactCard';
import { UI } from '../content/ui';
import { speechSupported } from '../lib/speech';
import { useStore, type Mode, type Tool } from '../state/store';
import { Disclosure, Icon, Segmented, Toggle } from './ui';

const MODES: Mode[] = ['guided', 'explore', 'lab', 'city'];
const TOOLS: Exclude<Tool, null>[] = ['tracer', 'challenges', 'logbook', 'glossary'];

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#17324d" />
      <path d="M20 7 C14 16 11 21 11 25.5 a9 9 0 0 0 18 0 C29 21 26 16 20 7Z" fill="#5fb0e6" />
      <path d="M8 29 q6 -4 12 0 t12 0" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M15.5 25 a4.5 4.5 0 0 0 4.5 4.5" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Settings() {
  const { state, dispatch } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dispatch({ type: 'settings', open: false });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);
  const pref = (key: keyof typeof state.prefs) => (v: boolean) => dispatch({ type: 'pref', key, value: v });
  return (
    <div className="settings" role="dialog" aria-modal="false" aria-labelledby="settings-title" tabIndex={-1} ref={ref}>
      <div className="legend-head">
        <h2 id="settings-title">{UI.settings.title}</h2>
        <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'settings', open: false })} aria-label="Cerrar ajustes">
          <Icon name="close" />
        </button>
      </div>
      <Toggle label={UI.settings.reducedMotion} help={UI.settings.reducedMotionHelp} checked={state.prefs.reducedMotion} onChange={pref('reducedMotion')} />
      <Toggle label={UI.settings.sound} help={UI.settings.soundHelp} checked={state.prefs.sound} onChange={pref('sound')} />
      {speechSupported() && <Toggle label={UI.settings.narration} help={UI.settings.narrationHelp} checked={state.prefs.narration} onChange={pref('narration')} />}
      <Toggle label={UI.settings.labels} checked={state.prefs.labels} onChange={pref('labels')} />
      <Toggle label={UI.settings.arrows} checked={state.prefs.arrows} onChange={pref('arrows')} />
      <Segmented
        label={UI.settings.quality}
        help={UI.settings.qualityHelp}
        options={[
          { value: 'auto', label: 'Automática' },
          { value: 'alta', label: 'Alta' },
          { value: 'ligera', label: 'Ligera' },
        ]}
        value={state.quality}
        onChange={(v) => dispatch({ type: 'quality', quality: v as 'auto' | 'alta' | 'ligera' })}
      />
      <p className="shortcuts">
        Teclado: <kbd>←</kbd> y <kbd>→</kbd> cambian de paso en el recorrido; <kbd>P</kbd> pausa o reanuda las animaciones; <kbd>Esc</kbd> cierra ventanas.
      </p>
      <Disclosure title="Fuentes para docentes">
        <TeacherSources />
      </Disclosure>
      <p className="privacy">{UI.settings.privacy}</p>
      <button type="button" className="btn-ghost small" onClick={() => dispatch({ type: 'resetProgress' })}>
        {UI.settings.resetProgress}
      </button>
    </div>
  );
}

export function Help({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="settings help" role="dialog" aria-modal="false" aria-labelledby="help-title" tabIndex={-1} ref={ref}>
      <div className="legend-head">
        <h2 id="help-title">Cómo explorar</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar ayuda">
          <Icon name="close" />
        </button>
      </div>
      <dl className="help-list">
        <dt>Tres escalas</dt>
        <dd>
          Arriba a la izquierda del paisaje: <strong>Cuenca</strong> muestra todo; <strong>Proceso</strong> acerca la zona que estudias; <strong>Detalle</strong> abre una vista de lo que no se ve a simple vista, como los poros del suelo o el interior de una nube.
        </dd>
        <dt>Reproducción</dt>
        <dd>Abajo a la izquierda: pausa, repite y elige la velocidad. La velocidad cambia el ritmo de la animación, no los resultados.</dd>
        <dt>Recorrido guiado</dt>
        <dd>Quince pasos. En cada uno: <strong>Observa</strong> lo que pasa, <strong>Investiga</strong> con una acción y <strong>Profundiza</strong> si quieres saber más.</dd>
        <dt>Exploración libre</dt>
        <dd>Enciende las capas que quieras, toca cualquier lugar del paisaje y abre las preguntas marcadas con «?».</dd>
        <dt>Laboratorio</dt>
        <dd>Explora condiciones o compara dos escenarios que solo se diferencian en una cosa. Predice antes de ejecutar.</dd>
        <dt>Medellín: laboratorio de lluvia</dt>
        <dd>
          Una maqueta 3D de un sector de ciudad donde la lluvia se calcula de verdad: elige un sector en el valle, crea lluvia, cambia superficies, construye un jardín de lluvia o limpia un sumidero, y compara dos versiones con la misma lluvia. Es educativo: no es un pronóstico oficial.
        </dd>
        <dt>Gota trazadora</dt>
        <dd>Sigue una pequeña porción de agua y elige su camino. Cada camino tarda tiempos muy distintos.</dd>
        <dt>Bitácora</dt>
        <dd>Guarda tus observaciones, predicciones, comparaciones y explicaciones. Solo queda en este dispositivo.</dd>
      </dl>
    </div>
  );
}

export function Header() {
  const { state, dispatch } = useStore();
  const [help, setHelp] = useState(false);
  return (
    <header className="app-header">
      <div className="brand">
        <Mark />
        <div>
          <h1>{UI.appTitle}</h1>
          <p>{UI.appSubtitle}</p>
        </div>
      </div>
      <nav className="modes" aria-label="Modos">
        <div className="mode-tabs" role="group" aria-label="Modos de exploración">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`mode-tab${state.mode === m && !state.tool ? ' is-on' : ''}`}
              aria-pressed={state.mode === m && !state.tool}
              aria-label={UI.modes[m]}
              onClick={() => dispatch({ type: 'mode', mode: m })}
            >
              <span className="lbl-long">{UI.modes[m]}</span>
              <span className="lbl-short" aria-hidden="true">
                {UI.modesShort[m]}
              </span>
            </button>
          ))}
        </div>
        <div className="tool-tabs" role="group" aria-label="Herramientas">
          {TOOLS.map((t) => (
            <button
              key={t}
              type="button"
              className={`tool-tab${state.tool === t ? ' is-on' : ''}`}
              aria-pressed={state.tool === t}
              aria-label={UI.tools[t]}
              onClick={() => dispatch({ type: 'tool', tool: state.tool === t ? null : t })}
            >
              <span className="lbl-long">{UI.tools[t]}</span>
              <span className="lbl-short" aria-hidden="true">
                {UI.toolsShort[t]}
              </span>
            </button>
          ))}
        </div>
      </nav>
      <div className="header-actions">
        <button type="button" className="icon-btn labeled" aria-label="Ayuda: cómo explorar" aria-expanded={help} onClick={() => { setHelp(!help); dispatch({ type: 'settings', open: false }); }}>
          <Icon name="question" />
          <span>Ayuda</span>
        </button>
        <button type="button" className="icon-btn labeled" aria-label={UI.settings.title} aria-expanded={state.settingsOpen} onClick={() => { setHelp(false); dispatch({ type: 'settings', open: !state.settingsOpen }); }}>
          <Icon name="settings" />
          <span>{UI.settings.title}</span>
        </button>
      </div>
      {state.settingsOpen && <Settings />}
      {help && <Help onClose={() => setHelp(false)} />}
    </header>
  );
}

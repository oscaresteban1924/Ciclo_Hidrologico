// Encabezado del Laboratorio del agua: el nombre (vuelve a la portada), las salas abiertas, las herramientas comunes
// (retos, bitácora, glosario), ayuda y ajustes. Dentro del ciclo del agua, una segunda fila con sus tres modos y la
// gota trazadora.

import { useEffect, useRef, useState } from 'react';
import { TeacherSources } from './FactCard';
import { UI } from '../content/ui';
import { Credits } from './Credits';
import { speechSupported } from '../lib/speech';
import { roomOf, roomOpen, useStore, type Mode, type Room, type Tool } from '../state/store';
import { Disclosure, Icon, Segmented, Toggle } from './ui';


/** En el orden en que viaja el agua: la naturaleza, la ciudad y las obras. */
const ROOMS: Room[] = (['ciclo', 'basins', 'ground', 'city', 'quality', 'supply', 'canals', 'dams'] as Room[]).filter(roomOpen);
const CICLO: Mode[] = ['guided', 'explore', 'lab'];
const NUM: Record<number, string> = { 4: 'cuatro', 5: 'cinco', 6: 'seis', 7: 'siete', 8: 'ocho' };
/** Herramientas de todas las salas; la gota trazadora es del ciclo del agua. */
const TOOLS: Exclude<Tool, null>[] = ['challenges', 'logbook', 'glossary'];

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
      <Credits />
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
        <dt>Portada y salas</dt>
        <dd>
          El nombre <strong>Laboratorio del agua</strong>, arriba a la izquierda, vuelve a la portada. Arriba están las {NUM[ROOMS.length] ?? ROOMS.length} salas, en el orden en que viaja el agua:{' '}
          {ROOMS.map((r, k) => (
            <span key={r}>
              <strong>{UI.roomsShort[r]}</strong>
              {k < ROOMS.length - 2 ? ', ' : k === ROOMS.length - 2 ? ' y ' : '. '}
            </span>
          ))}
          Retos, Bitácora y Glosario sirven en todas.
        </dd>
        <dt>El ciclo del agua</dt>
        <dd>
          Tiene tres modos en la segunda fila. <strong>Recorrido guiado</strong>: quince pasos; en cada uno, <strong>Observa</strong>, <strong>Investiga</strong> con una acción y <strong>Profundiza</strong> si quieres saber más. <strong>Exploración libre</strong>: enciende capas, toca el paisaje y abre las preguntas marcadas con «?». <strong>Experimentos</strong>: cambia condiciones o compara dos escenarios que solo se diferencian en una cosa; predice antes de ejecutar. La <strong>Gota trazadora</strong> sigue una pequeña porción de agua por el camino que elijas.
        </dd>
        <dt>Escalas y reproducción</dt>
        <dd>
          En el paisaje del ciclo: <strong>Cuenca</strong> muestra todo, <strong>Proceso</strong> acerca la zona que estudias y <strong>Detalle</strong> abre lo que no se ve a simple vista. Abajo a la izquierda: pausa, repite y velocidad (cambia el ritmo, no los resultados).
        </dd>
        {roomOpen('basins') && (
          <>
            <dt>Cuencas: de la lluvia al caudal</dt>
            <dd>
              Tres partes en 3D: la cuenca y su tiempo de concentración, el hidrograma (y lo que cambia al urbanizar, con un tanque de retención) y las crecientes con su período de retorno y su riesgo. Lanza el aguacero, mira el hidrograma en vivo y usa las calculadoras de caudal de diseño. La cuenca, el río y las series son ilustrativos.
            </dd>
          </>
        )}
        <dt>Medellín: laboratorio de lluvia</dt>
        <dd>
          Una maqueta 3D de un sector de ciudad donde la lluvia se calcula de verdad: elige un sector en el valle, crea lluvia, cambia superficies, construye un jardín de lluvia o limpia un sumidero, y compara dos versiones con la misma lluvia. Es educativo: no es un pronóstico oficial.
        </dd>
        <dt>Calidad del agua</dt>
        <dd>
          Mide la salud de una quebrada con una sonda y con los bichos que viven debajo de las piedras, sigue el agua del río hasta la llave, mira qué arrastra la lluvia de las calles y recorre una planta de aguas residuales. Los valores son típicos de la literatura: no es un monitoreo de una quebrada real.
        </dd>
        <dt>Hidráulica de canales</dt>
        <dd>
          Siete partes con escenas 3D, retos, instrumentos en vivo y una pestaña de diseño con calculadoras, prediseñadores y memoria de cálculo: el canal, el resalto, el puente, las alcantarillas, los sedimentos, la medición del caudal y las ondas y crecientes. Son prediseños académicos, no diseños de ingeniería.
        </dd>
        <dt>Bitácora</dt>
        <dd>Guarda tus observaciones, predicciones, comparaciones y explicaciones de todas las salas. Solo queda en este dispositivo.</dd>
      </dl>
      <Credits />
    </div>
  );
}

export function Header() {
  const { state, dispatch } = useStore();
  const [help, setHelp] = useState(false);
  const room = roomOf(state.mode);
  const lastCiclo = useRef<Mode>('guided');
  if (CICLO.includes(state.mode)) lastCiclo.current = state.mode;
  const inRoom = (r: Room) => !state.home && !state.tool && room === r;
  const enter = (r: Room) => dispatch({ type: 'mode', mode: r === 'ciclo' ? (room === 'ciclo' && !state.home ? state.mode : lastCiclo.current) : r });
  const showCiclo = !state.home && (room === 'ciclo' || state.tool === 'tracer');
  return (
    <header className={`app-header${showCiclo ? ' has-sub' : ''}`}>
      <h1 className="brand">
        <button type="button" className="brand-link" onClick={() => dispatch({ type: 'home' })} aria-label={`${UI.appTitle}: ir a la portada`} aria-current={state.home ? 'page' : undefined}>
          <Mark />
          <span className="brand-text">
            <span className="brand-name">{UI.appTitle}</span>
            <span className="brand-sub">{UI.appSubtitle}</span>
          </span>
        </button>
      </h1>
      <nav className="modes" aria-label="Salas y herramientas">
        <div className="mode-tabs room-tabs" role="group" aria-label="Salas">
          {ROOMS.map((r) => (
            <button
              key={r}
              type="button"
              className={`mode-tab room-tab${inRoom(r) ? ' is-on' : ''}`}
              aria-pressed={inRoom(r)}
              aria-label={UI.rooms[r]}
              title={UI.rooms[r]}
              onClick={() => enter(r)}
            >
              {UI.roomsShort[r]}
            </button>
          ))}
        </div>
        <div className="tool-tabs" role="group" aria-label="Herramientas de todas las salas">
          {TOOLS.map((t) => (
            <button
              key={t}
              type="button"
              className={`tool-tab${state.tool === t ? ' is-on' : ''}`}
              aria-pressed={state.tool === t}
              aria-label={UI.tools[t]}
              onClick={() => dispatch({ type: 'tool', tool: state.tool === t ? null : t })}
            >
              {UI.toolsShort[t]}
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
      {showCiclo && (
        <nav className="subnav" aria-label="Modos del ciclo del agua">
          <span className="subnav-title">{UI.rooms.ciclo}</span>
          <div className="mode-tabs" role="group" aria-label="Modos del ciclo del agua">
            {CICLO.map((m) => (
              <button
                key={m}
                type="button"
                className={`mode-tab${state.mode === m && !state.tool ? ' is-on' : ''}`}
                aria-pressed={state.mode === m && !state.tool}
                aria-label={UI.modes[m]}
                onClick={() => dispatch({ type: 'mode', mode: m })}
              >
                <span className="sub-long">{UI.modes[m]}</span>
                <span className="sub-short" aria-hidden="true">
                  {UI.modesShort[m]}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className={`tool-tab${state.tool === 'tracer' ? ' is-on' : ''}`} aria-pressed={state.tool === 'tracer'} aria-label={UI.tools.tracer} onClick={() => dispatch({ type: 'tool', tool: state.tool === 'tracer' ? null : 'tracer' })}>
            <span className="sub-long">{UI.tools.tracer}</span>
            <span className="sub-short" aria-hidden="true">
              {UI.toolsShort.tracer}
            </span>
          </button>
        </nav>
      )}
      {state.settingsOpen && <Settings />}
      {help && <Help onClose={() => setHelp(false)} />}
    </header>
  );
}

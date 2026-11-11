import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ChallengesPanel } from './components/ChallengesPanel';
import { ExplorePanel } from './components/ExplorePanel';
import { GlossaryPanel } from './components/GlossaryPanel';
import { GuidedPanel, StepNav, StepProgress, shortName } from './components/GuidedPanel';
import { Icon } from './components/ui';
import { StepCaption } from './components/StepCaption';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { LabPanel } from './components/LabPanel';
import { LogbookPanel } from './components/LogbookPanel';
import { TracerPanel } from './components/TracerPanel';
import { STEPS } from './content/steps';
import { UI } from './content/ui';
import { SceneView } from './scene/SceneView';
import { buildSpec } from './state/spec';
import { MODE_HASH, modeFromHash, useStore } from './state/store';

const CityLab = lazy(() => import('./city/CityLab'));
const QualityLab = lazy(() => import('./quality/QualityLab'));
const CanalsLab = lazy(() => import('./canals/CanalsLab'));
const BasinsLab = lazy(() => import('./basins/BasinsLab'));

export function App() {
  const { state, dispatch } = useStore();
  const spec = useMemo(() => buildSpec(state), [state]);
  const [compare, setCompare] = useState<{ runoff: number; ground: number } | null>(null);
  const [announce, setAnnounce] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => setCompare(null), [state.knobs.compareRun, state.step]);

  // Aviso breve cuando algo nuevo se guarda en la bitácora
  const [toast, setToast] = useState<string | null>(null);
  const logCount = useRef(state.logbook.length);
  useEffect(() => {
    const n = state.logbook.length;
    if (n > logCount.current) {
      const last = [...state.logbook].sort((a, b) => b.at - a.at)[0];
      setToast(last ? `Guardado en tu bitácora: ${last.title}` : 'Guardado en tu bitácora');
      const h = window.setTimeout(() => setToast(null), 3800);
      logCount.current = n;
      return () => window.clearTimeout(h);
    }
    logCount.current = n;
  }, [state.logbook]);

  // Al cambiar de paso: volver al inicio del texto y anunciarlo a lectores de pantalla.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    panelRef.current?.scrollTo({ top: 0, behavior: state.prefs.reducedMotion ? 'auto' : 'smooth' });
    if (state.mode === 'guided' && !state.tool) {
      const s = STEPS[state.step];
      setAnnounce(`${UI.nav.stepOf(state.step + 1, STEPS.length)}: ${s.title}`);
    }
  }, [state.step, state.mode, state.tool, state.prefs.reducedMotion]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [state.selected, state.tool]);

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (t && (t.getAttribute('role') === 'radio' || t.getAttribute('role') === 'button') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      if (e.key === 'p' || e.key === 'P') {
        dispatch({ type: 'pause' });
        setAnnounce(state.paused ? 'Animaciones reanudadas' : 'Animaciones en pausa');
      }
      if (state.mode === 'guided' && !state.tool && !state.home) {
        if (e.key === 'ArrowRight') dispatch({ type: 'next' });
        if (e.key === 'ArrowLeft') dispatch({ type: 'prev' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, state.mode, state.tool, state.paused, state.home]);

  // La dirección lleva la sala o el modo (#recorrido, #canales…): se puede volver al mismo lugar, compartir el
  // enlace y usar «atrás» del navegador entre la portada y las salas.
  const synced = useRef(false);
  useEffect(() => {
    try {
      const want = state.home ? '' : `#${MODE_HASH[state.mode]}`;
      if (window.location.hash !== want) {
        const url = `${window.location.pathname}${window.location.search}${want}`;
        if (synced.current) window.history.pushState(null, '', url);
        else window.history.replaceState(null, '', url);
      }
      synced.current = true;
    } catch {
      /* algunas vistas incrustadas no permiten cambiar la dirección */
    }
  }, [state.home, state.mode]);
  const latest = useRef({ home: state.home, mode: state.mode });
  latest.current = { home: state.home, mode: state.mode };
  useEffect(() => {
    const onNav = () => {
      const m = modeFromHash();
      const cur = latest.current;
      if (m === null) {
        if (!cur.home) dispatch({ type: 'home' });
      } else if (cur.home || m !== cur.mode) dispatch({ type: 'mode', mode: m });
    };
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', onNav);
    return () => {
      window.removeEventListener('popstate', onNav);
      window.removeEventListener('hashchange', onNav);
    };
  }, [dispatch]);

  // Detener animaciones cuando la pestaña no está visible
  useEffect(() => {
    let wasPaused = false;
    const onVis = () => {
      if (document.hidden) {
        wasPaused = state.paused;
        if (!state.paused) dispatch({ type: 'pause', value: true });
      } else if (!wasPaused) dispatch({ type: 'pause', value: false });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [dispatch, state.paused]);

  const guided = state.mode === 'guided' && !state.tool;

  return (
    <div className={`app mode-${state.mode}${state.tool ? ` tool-${state.tool}` : ''}${state.home ? ' is-home' : ''}`}>
      <a className="skip" href="#panel">
        Ir a la explicación
      </a>
      <Header />
      {state.home ? (
        <Home />
      ) : state.mode === 'city' && !state.tool ? (
        <Suspense
          fallback={
            <main className="layout layout-city">
              <div className="city-loading" role="status">
                Cargando el laboratorio de lluvia…
              </div>
            </main>
          }
        >
          <CityLab />
        </Suspense>
      ) : state.mode === 'quality' && !state.tool ? (
        <Suspense
          fallback={
            <main className="layout layout-quality">
              <div className="city-loading" role="status">
                Cargando el laboratorio de calidad del agua…
              </div>
            </main>
          }
        >
          <QualityLab />
        </Suspense>
      ) : state.mode === 'basins' && !state.tool ? (
        <Suspense
          fallback={
            <main className="layout layout-quality">
              <div className="city-loading" role="status">
                Cargando la sala de cuencas…
              </div>
            </main>
          }
        >
          <BasinsLab />
        </Suspense>
      ) : state.mode === 'canals' && !state.tool ? (
        <Suspense
          fallback={
            <main className="layout layout-quality">
              <div className="city-loading" role="status">
                Cargando el laboratorio de hidráulica de canales…
              </div>
            </main>
          }
        >
          <CanalsLab />
        </Suspense>
      ) : (
      <main className={`layout${state.panelCollapsed ? ' is-collapsed' : ''}`}>
        <section className="stage" aria-label="Paisaje interactivo">
          <SceneView spec={spec} onCompare={setCompare} />
          {state.panelCollapsed && (
            <div className="panel-peek" role="group" aria-label="Panel contraído">
              {guided && (
                <>
                  <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'prev' })} disabled={state.step === 0} aria-label="Paso anterior">
                    <Icon name="prev" />
                  </button>
                  <span className="peek-title">
                    <small>
                      {state.step + 1}/{STEPS.length}
                    </small>
                    {shortName(state.step)}
                  </span>
                  <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'next' })} disabled={state.step === STEPS.length - 1} aria-label="Paso siguiente">
                    <Icon name="next" />
                  </button>
                </>
              )}
              <button type="button" className="btn-ghost small" onClick={() => dispatch({ type: 'panel', collapsed: false })}>
                <Icon name="panel" />
                Mostrar explicación
              </button>
            </div>
          )}
        </section>
        <aside id="panel" className="panel" tabIndex={-1} aria-label="Explicación" hidden={state.panelCollapsed}>
          {guided && !state.detail && <StepCaption compact placement="panel" />}
          {guided && <StepProgress />}
          {!guided && (
            <div className="panel-top">
              <button type="button" className="icon-btn" aria-label="Contraer el panel y ampliar el paisaje" title="Ampliar el paisaje" onClick={() => dispatch({ type: 'panel', collapsed: true })}>
                <Icon name="expand" />
              </button>
            </div>
          )}
          <div className="panel-scroll" ref={panelRef}>
            {state.tool === 'tracer' ? (
              <TracerPanel />
            ) : state.tool === 'challenges' ? (
              <ChallengesPanel />
            ) : state.tool === 'glossary' ? (
              <GlossaryPanel />
            ) : state.tool === 'logbook' ? (
              <LogbookPanel />
            ) : state.mode === 'guided' ? (
              <GuidedPanel spec={spec} compare={compare} />
            ) : state.mode === 'explore' ? (
              <ExplorePanel />
            ) : (
              <LabPanel spec={spec} />
            )}
          </div>
          {guided && <StepNav />}
        </aside>
      </main>
      )}
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
      <div className="toast-region" aria-live="polite">
        {toast && (
          <button type="button" className="toast" onClick={() => dispatch({ type: 'tool', tool: 'logbook' })}>
            {toast}
            <span>Ver bitácora</span>
          </button>
        )}
      </div>
    </div>
  );
}

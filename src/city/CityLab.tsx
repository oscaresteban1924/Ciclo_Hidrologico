// «Medellín: laboratorio de lluvia» — módulo integrado a la aplicación del ciclo del agua.
// Dos escalas conectadas: el valle (orientación y elección de sector) y el laboratorio (cálculo).

import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { CityController, detectCapabilities, type Capabilities, type RendererKind } from './controller';
import { loadCity, saveCity, type CitySaved } from './persist';
import { allScenarios } from './scenarios/index';
import { baseInterventions, cloneInterventions, type Interventions, type Scenario } from './sim/scenario';
import { COVERS, COVER_LIST, H_WET } from './sim/constants';
import { budgetItems, type Mission } from './content/missions';
import { DEPTH_STOPS, VALLEY_EXAGGERATION, cssDepthGradient, fmtDepth, fmtNum, fmtTime } from './render/palette';
import { CompareTab, MissionsTab, TeacherTab, ToolsTab, WordsTab, type LabApi, type MissionUi, type TabId, type ToolId } from './ui/Panels';
import { RainBudget } from './ui/RainBudget';
import { compile } from './sim/compile';
import { SEWER_COLORS } from './render/sewerColors';
import { HAZARD, HAZARD_SOURCE, exposureOf, hazardClass as hazardClassOf } from './sim/hazard';
import { buildingName } from './render/floodNames';
import { Icon } from '../components/ui';
import { useStore } from '../state/store';
import './city.css';

const TABS: { id: TabId; label: string }[] = [
  { id: 'misiones', label: 'Misiones' },
  { id: 'herramientas', label: 'Herramientas' },
  { id: 'comparar', label: 'Comparar' },
  { id: 'palabras', label: 'Palabras' },
  { id: 'docente', label: 'Docente' },
];

const KIND_LABEL: Record<Scenario['provenance']['kind'], string> = {
  demostrativo: 'Sector demostrativo: no es un lugar real',
  'datos-reales': 'Datos reales con elementos estimados',
  mixto: 'Datos reales y elementos didácticos',
};

function dirText(ux: number, uy: number): string {
  const a = (Math.atan2(uy, ux) * 180) / Math.PI;
  const dirs = ['el este', 'el noreste', 'el norte', 'el noroeste', 'el oeste', 'el suroeste', 'el sur', 'el sureste'];
  return dirs[(Math.round(a / 45) + 8) % 8];
}

function applyBudget(sc: Scenario, iv: Interventions, sel: string[]): void {
  for (const it of budgetItems(sc)) {
    if (!sel.includes(it.id)) continue;
    if (it.kind === 'sumidero') iv.drains[it.target] = 0;
    if (it.kind === 'jardin') iv.gardens[it.target] = true;
    if (it.kind === 'deposito') iv.tanks[it.target] = { on: true, destination: 'red' };
    if (it.kind === 'zona' && it.value) iv.zones[it.target] = it.value as Interventions['zones'][string];
  }
}

/** Lámina de lluvia acumulada hasta t [mm]. */
function rainDepth(times: number[], mmh: number[], t: number): number {
  let d = 0;
  for (let k = 0; k < mmh.length; k++) {
    const a = times[k], b = Math.min(times[k + 1], t);
    if (b > a) d += (mmh[k] * (b - a)) / 3600;
  }
  return d;
}

export default function CityLab() {
  const { state, dispatch } = useStore();
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<CityController | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [saved, setSavedState] = useState<CitySaved>(() => loadCity());
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const setSaved = useCallback((f: (s: CitySaved) => CitySaved) => {
    setSavedState((s) => {
      const n = f(s);
      saveCity(n);
      return n;
    });
  }, []);
  const [renderer, setRendererState] = useState<RendererKind | null>(null);
  const [tab, setTab] = useState<TabId>('misiones');
  const [tool, setTool] = useState<ToolId>('lluvia');
  const [mission, setMissionState] = useState<MissionUi | null>(null);
  const missionRef = useRef(mission);
  missionRef.current = mission;
  const [announce, setAnnounce] = useState('');
  const resumeRef = useRef<string | null>(null);
  const lastCfg = useRef('');
  const down = useRef<[number, number] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab, mission?.id, mission?.step]);

  // Panel derecho contraíble: la maqueta ocupa todo el ancho. El foco pasa al botón que deshace la acción.
  const panelHidden = saved.panelHidden === true;
  const hideBtnRef = useRef<HTMLButtonElement>(null);
  const peekRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef(false);
  const setPanelHidden = useCallback(
    (hidden: boolean) => {
      focusAfterToggle.current = true;
      setSaved((s) => ({ ...s, panelHidden: hidden || undefined }));
      setAnnounce(hidden ? 'Panel contraído: la maqueta ocupa todo el ancho.' : 'Panel visible.');
    },
    [setSaved],
  );
  useEffect(() => {
    if (!focusAfterToggle.current) return;
    focusAfterToggle.current = false;
    (panelHidden ? peekRef : hideBtnRef).current?.focus();
  }, [panelHidden]);

  // 1) Capacidades del equipo (se miden después del primer cuadro)
  useEffect(() => {
    const h = window.setTimeout(() => {
      const c = detectCapabilities();
      setCaps(c);
      setRendererState(savedRef.current.renderer && (c.webgl2 || savedRef.current.renderer === '2d') ? savedRef.current.renderer : c.webgl2 ? 'webgl' : '2d');
    }, 40);
    return () => window.clearTimeout(h);
  }, []);

  // 2) Controlador: se crea y se libera por completo al salir
  useEffect(() => {
    if (!renderer || !caps || !hostRef.current) return;
    // automática: ligera en pantallas pequeñas, táctiles o si el navegador dibuja por software (sin GPU)
    const quality = state.quality === 'auto' ? (window.innerWidth >= 900 && !window.matchMedia('(pointer: coarse)').matches && !caps.softwareGL ? 'alta' : 'ligera') : state.quality;
    const ctrl = new CityController({
      container: hostRef.current,
      reducedMotion: state.prefs.reducedMotion,
      quality,
      renderer,
      sound: false,
      onChange: bump,
      onFinished: () => {
        if (missionRef.current?.running) setMissionState({ ...missionRef.current, running: false });
        setAnnounce('La simulación terminó. Los resultados están listos.');
      },
      reserved: () => [...(stageRef.current?.querySelectorAll('.city-ov') ?? [])].map((e) => e.getBoundingClientRect()),
    });
    ctrl.speed = savedRef.current.speed;
    ctrl.setLabels(savedRef.current.labels !== false);
    ctrlRef.current = ctrl;
    const resume = resumeRef.current;
    if (resume && allScenarios()[resume]) ctrl.enterSector(resume, savedRef.current.configs[resume] ?? null);
    else void ctrl.showValley();
    return () => {
      const cfg = ctrl.config();
      if (cfg) {
        resumeRef.current = cfg.shared.scenarioId;
        setSaved((s) => ({ ...s, configs: { ...s.configs, [cfg.shared.scenarioId]: cfg } }));
      }
      ctrl.dispose();
      ctrlRef.current = null;
    };
  }, [renderer, caps, state.prefs.reducedMotion, state.quality, setSaved]);

  useEffect(() => {
    ctrlRef.current?.setPaused(state.paused);
  }, [state.paused, renderer, caps]);
  useEffect(() => {
    ctrlRef.current?.setSound(state.prefs.sound);
  }, [state.prefs.sound, renderer, caps]);

  // Guardar la configuración cuando cambia (solo en este dispositivo)
  useEffect(() => {
    const cfg = ctrlRef.current?.config();
    if (!cfg) return;
    const j = JSON.stringify(cfg);
    if (j === lastCfg.current) return;
    lastCfg.current = j;
    setSaved((s) => ({ ...s, configs: { ...s.configs, [cfg.shared.scenarioId]: cfg }, lastScenario: cfg.shared.scenarioId }));
  });

  const ctrl = ctrlRef.current;

  const goSector = useCallback(
    (id: string) => {
      const c = ctrlRef.current;
      if (!c) return;
      const savedCfg = savedRef.current.configs[id] ?? null;
      c.enterSector(
        id,
        savedCfg,
        () => setAnnounce(`Entraste al sector ${allScenarios()[id].shortTitle}.`),
        caps?.recommendedDx,
      );
      setSaved((s) => ({ ...s, lastScenario: id }));
      if (!missionRef.current) setTab('herramientas');
    },
    [caps, setSaved],
  );

  const runMission = useCallback((m: Mission, sel: string[]) => {
    const c = ctrlRef.current;
    if (!c) return;
    const go = () => {
      const sc = allScenarios()[m.scenarioId];
      const A = baseInterventions(sc);
      m.setupA?.(A);
      const B = cloneInterventions(A);
      if (m.change.kind === 'auto') m.change.apply(B);
      if (m.change.kind === 'presupuesto') applyBudget(sc, B, sel);
      const dx = c.shared && sc.resolutions.includes(c.shared.dx) ? c.shared.dx : sc.defaultResolution;
      // creciente de la misión: fracción de la capacidad de la sección de control, calculada con el escenario
      const cap = m.creek && sc.creek ? compile(sc, { ...sc.defaults, dx }, A).creek?.capacity ?? 0 : 0;
      const creek = m.creek && cap > 0 ? { peakM3s: Math.round(m.creek.fraction * cap), timeToPeakMin: m.creek.timeToPeakMin, startMin: m.creek.startMin, sedimentCv: m.creek.sedimentCv ?? 0, source: m.creek.source ?? 'ejemplo' } : null;
      c.update({ shared: { ...sc.defaults, dx, rain: { ...sc.defaults.rain, ...m.rain }, simMinutes: m.simMinutes, creek }, A, B });
      c.setCompare(m.change.kind !== 'ninguno');
      c.start();
      dispatch({ type: 'pause', value: false });
    };
    if (c.sc?.id !== m.scenarioId) c.enterSector(m.scenarioId, null, go);
    else go();
  }, [dispatch]);

  const onUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 6 || !ctrl) return;
    if (ctrl.scale === 'ciudad') {
      const id = ctrl.pickPin(e.clientX, e.clientY);
      if (id) goSector(id);
      return;
    }
    const p = ctrl.pickAt(e.clientX, e.clientY);
    if (!p || tab !== 'herramientas') return;
    if (tool === 'trazadores') ctrl.releaseTracers(p.x, p.y);
    else if (tool === 'medir' && p.kind !== 'building') ctrl.setProbe([p.x, p.y]);
    else if (tool === 'lluvia' && ctrl.shared.rain.spatial === 'localizada') ctrl.update({ shared: { rain: { ...ctrl.shared.rain, center: [p.x, p.y] } } });
  };

  const api: LabApi | null = ctrl
    ? {
        ctrl,
        sc: ctrl.sc,
        saved,
        setSaved,
        tool,
        setTool,
        caps,
        renderer: renderer ?? 'webgl',
        setRenderer: (r) => {
          setSaved((s) => ({ ...s, renderer: r }));
          const cfg = ctrl.config();
          resumeRef.current = cfg?.shared.scenarioId ?? null;
          setRendererState(r);
        },
        mission,
        setMission: setMissionState,
        runMission,
        goSector,
        panelHidden,
        setPanelHidden,
        peekRef,
      }
    : null;

  const sim = ctrl?.displayed() ?? null;
  const sc = ctrl?.sc ?? null;
  const inSector = ctrl?.scale === 'sector' && !!sc && !!sim;

  return (
    <main className={`layout layout-city${panelHidden ? ' is-collapsed' : ''}`}>
      <section className="stage city-stage" aria-label="Laboratorio de lluvia de Medellín" ref={stageRef}>
        <div
          className="city-canvas-host"
          ref={hostRef}
          onPointerDown={(e) => (down.current = [e.clientX, e.clientY])}
          onPointerUp={onUp}
        />
        {!ctrl && (
          <div className="city-loading" role="status">
            Preparando el laboratorio: midiendo el equipo para elegir la resolución…
          </div>
        )}
        {ctrl && ctrl.scale === 'ciudad' && (
          <>
            <div className="city-ov city-crumb">
              <strong>Valle de Aburrá</strong>
              <span>Vista aproximada para orientarse · relieve y edificios ×{fmtNum(VALLEY_EXAGGERATION, 1)} · trazados y cotas aproximados</span>
            </div>
            {renderer === '2d' && <ValleyList api={api!} />}
            {panelHidden && (
              <div className="city-topright">
                <PanelPeek api={api!} />
              </div>
            )}
            <div className="city-ov city-pick">
              <p>Elige un sector para estudiar:</p>
              {Object.values(allScenarios()).map((s) => (
                <button key={s.id} type="button" className="btn" onClick={() => goSector(s.id)}>
                  {s.shortTitle}
                </button>
              ))}
            </div>
          </>
        )}
        {inSector && ctrl && sim && sc && <SectorOverlays api={api!} sc={sc} />}
        {ctrl?.isFlying() && <div className="city-fade" aria-hidden="true" />}
      </section>
      <aside id="panel" className="panel city-panel" aria-label="Panel del laboratorio" hidden={panelHidden}>
        <div className="city-disclaimer">
          <p>
            <strong>Medellín: laboratorio de lluvia.</strong> Es un laboratorio educativo: no es un pronóstico oficial de inundaciones y sus intervenciones no son diseños de ingeniería.
          </p>
          <button
            type="button"
            ref={hideBtnRef}
            className="icon-btn city-hide-panel"
            aria-label="Contraer el panel y ampliar la maqueta"
            title="Contraer el panel y ampliar la maqueta"
            onClick={() => setPanelHidden(true)}
          >
            <Icon name="expand" />
          </button>
        </div>
        <div className="city-tabs" role="tablist" aria-label="Secciones del laboratorio">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="city-tabpanel"
              tabIndex={tab === t.id ? 0 : -1}
              className={tab === t.id ? 'is-on' : ''}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => {
                const i = TABS.findIndex((q) => q.id === tab);
                if (e.key === 'ArrowRight') setTab(TABS[(i + 1) % TABS.length].id);
                if (e.key === 'ArrowLeft') setTab(TABS[(i - 1 + TABS.length) % TABS.length].id);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="panel-scroll" id="city-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} ref={scrollRef}>
          {inSector && api && <StateSummary api={api} />}
          {inSector && api && sim && (tab === 'herramientas' || tab === 'misiones') && <RainBudget bal={sim.bal} title={ctrl?.pair ? `¿Adónde fue la lluvia? (${ctrl.show})` : undefined} />}
          {!api ? (
            <p>Cargando…</p>
          ) : tab === 'misiones' ? (
            <MissionsTab api={api} />
          ) : tab === 'herramientas' ? (
            <ToolsTab api={api} />
          ) : tab === 'comparar' ? (
            <CompareTab api={api} />
          ) : tab === 'palabras' ? (
            <WordsTab />
          ) : (
            <TeacherTab api={api} />
          )}
        </div>
      </aside>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </main>
  );
}

/** Botón sobre la maqueta para volver a abrir el panel contraído. */
function PanelPeek({ api }: { api: LabApi }) {
  return (
    <button type="button" ref={api.peekRef} className="city-ov city-peek" onClick={() => api.setPanelHidden(false)} aria-label="Mostrar el panel del laboratorio" title="Mostrar el panel del laboratorio">
      <Icon name="panel" />
      <span>Mostrar panel</span>
    </button>
  );
}

function ValleyList({ api }: { api: LabApi }) {
  return (
    <div className="city-ov city-valley2d">
      <p>Tu equipo no tiene WebGL2: el valle se muestra como lista y el laboratorio como mapa 2D con el mismo cálculo.</p>
      <ul>
        {Object.values(allScenarios()).map((s) => (
          <li key={s.id}>
            <button type="button" className="link" onClick={() => api.goSector(s.id)}>
              {s.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectorOverlays({ api, sc }: { api: LabApi; sc: Scenario }) {
  const { ctrl } = api;
  const { dispatch, state } = useStore();
  const sim = ctrl.displayed()!;
  const view = ctrl.viewMode();
  const rainNow = ctrl.status === 'corriendo' ? sim.rainAt(sim.t) : 0;
  const phase = ctrl.status === 'listo' ? 'Listo para llover' : ctrl.status === 'terminado' ? 'Terminado' : state.paused ? 'En pausa' : rainNow > 0 ? 'Lloviendo' : 'Escurriendo';
  const slow = ctrl.status === 'corriendo' && !state.paused && ctrl.achievedSpeed > 0 && ctrl.achievedSpeed < ctrl.speed * 0.8;
  return (
    <>
      <div className="city-ov city-crumb">
        <button type="button" className="link" onClick={() => void ctrl.showValley()}>
          ← Valle de Aburrá
        </button>
        <strong>{sc.shortTitle}</strong>
        <span className={`kind kind-${sc.provenance.kind}`}>{sc.provenance.badge ?? KIND_LABEL[sc.provenance.kind]}</span>
      </div>
      <div className="city-topright">
        {api.panelHidden && <PanelPeek api={api} />}
        <ViewBar api={api} />
      </div>
      <div className="city-ov city-simbar" role="group" aria-label="Control de la simulación">
        {ctrl.status !== 'corriendo' ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              ctrl.start();
              dispatch({ type: 'pause', value: false });
            }}
          >
            <Icon name="play" /> {ctrl.status === 'terminado' ? 'Repetir la lluvia' : 'Iniciar lluvia'}
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'pause' })} aria-pressed={state.paused}>
            <Icon name={state.paused ? 'play' : 'pause'} /> {state.paused ? 'Continuar' : 'Pausar'}
          </button>
        )}
        <button type="button" className="icon-btn labeled" onClick={() => ctrl.reset()} aria-label="Reiniciar: volver exactamente al estado inicial">
          <Icon name="replay" />
          <span>Reiniciar</span>
        </button>
        <div className="sim-clock" aria-live="off">
          <span className="phase">{phase}</span>
          <span>
            {fmtTime(sim.t)} / {fmtTime(sim.endT)} min
          </span>
          <span>{rainNow > 0 ? `${fmtNum(rainNow, 0)} mm/h` : 'sin lluvia'}</span>
        </div>
        <label className="speed">
          Velocidad
          <select
            value={ctrl.speed}
            onChange={(e) => {
              ctrl.setSpeed(Number(e.target.value));
              api.setSaved((s) => ({ ...s, speed: Number(e.target.value) }));
            }}
          >
            {[15, 30, 60, 120].map((v) => (
              <option key={v} value={v}>
                ×{v}
              </option>
            ))}
          </select>
        </label>
        {ctrl.pair && (
          <div className="ab-switch" role="radiogroup" aria-label="Corrida que muestra la maqueta">
            {(['A', 'B'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={ctrl.show === k} className={ctrl.show === k ? 'is-on' : ''} onClick={() => ctrl.setShow(k)}>
                {k}
              </button>
            ))}
          </div>
        )}
      </div>
      <Legend api={api} />
      {ctrl.selection && <SelectionCard api={api} />}
      {!api.saved.coach && ctrl.status === 'listo' && sim.t === 0 && <Coach api={api} />}
      <div className="city-banners">
        {ctrl.amplify() > 1 && (
          <p className="city-ov banner is-warn" role="status">
            Profundidad dibujada ×{ctrl.amplify()} para verla mejor. Los números no cambian.
          </p>
        )}
        {ctrl.pending && (
          <p className="city-ov banner" role="status">
            Cambios listos: se aplican al reiniciar.{' '}
            <button type="button" className="link" onClick={() => ctrl.reset()}>
              Reiniciar ahora
            </button>
          </p>
        )}
        {slow && (
          <p className="city-ov banner" role="status">
            Tu equipo alcanza ×{fmtNum(ctrl.achievedSpeed, 0)}: avanza más lento, con el mismo resultado.
          </p>
        )}
        {ctrl.cutOn() && (
          <p className="city-ov banner" role="status">
            {sim?.sewer
              ? 'Bajo la calle: red didáctica con criterios de EPM. El agua dentro de tuberías y cámaras es la calculada.'
              : 'Bajo la calle: tuberías esquemáticas. Su hidráulica no se calcula; su brillo indica el agua que captan los sumideros.'}
          </p>
        )}
        {view === 'resultados' && (
          <p className="city-ov banner" role="status">
            Vista de resultados: profundidad máxima alcanzada hasta ahora.
          </p>
        )}
        {view === 'peligro' && (
          <p className="city-ov banner" role="status">
            Vista de peligro: la clase más alta alcanzada hasta ahora según profundidad y velocidad calculadas. Referencia técnica australiana (AIDR 7-3): no es la zonificación oficial de amenaza de Medellín.
          </p>
        )}
      </div>
    </>
  );
}

function ViewBar({ api }: { api: LabApi }) {
  const { ctrl } = api;
  const v = ctrl.viewMode();
  const btn = (label: string, on: boolean, f: () => void, aria?: string): ReactNode => (
    <button type="button" className={`vb${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={aria} onClick={f}>
      {label}
    </button>
  );
  return (
    <details className="city-ov city-viewbar" open={typeof window !== 'undefined' && window.innerWidth > 1180}>
      <summary>
        <span className="vb-long">Vista y cámara</span>
        <span className="vb-short">Vista</span>
      </summary>
      <div className="vb-group" role="group" aria-label="Qué mostrar">
        {btn('Realista', v === 'realista', () => ctrl.setView('realista'))}
        {btn('Materiales', v === 'materiales', () => ctrl.setView('materiales'))}
        {btn('Resultados', v === 'resultados', () => ctrl.setView('resultados'))}
        {btn('Peligro', v === 'peligro', () => ctrl.setView('peligro'), 'Peligro del agua: clase máxima según profundidad y velocidad')}
      </div>
      <div className="vb-group" role="group" aria-label="Capas">
        {api.renderer === 'webgl' &&
          btn('Etiquetas', ctrl.labelsOn(), () => {
            const on = !ctrl.labelsOn();
            ctrl.setLabels(on);
            api.setSaved((s) => ({ ...s, labels: on ? undefined : false }));
          }, 'Etiquetas de la maqueta: lugares, medidores, daños y redes')}
        {btn('Flechas', ctrl.arrowsOn(), () => ctrl.setArrows(!ctrl.arrowsOn()), 'Flechas de dirección del flujo')}
        {btn('Bajo la calle', ctrl.cutOn(), () => ctrl.setCut(!ctrl.cutOn()), ctrl.displayed()?.sewer ? 'Ver bajo la calle: redes de aguas lluvias y de aguas residuales' : 'Ver bajo la calle: tuberías esquemáticas')}
        {api.renderer === 'webgl' && btn('Agua ×5', ctrl.amplify() > 1, () => ctrl.setAmplify(ctrl.amplify() > 1 ? 1 : 5), 'Dibujar el agua cinco veces más gruesa (solo el dibujo)')}
        {api.renderer === 'webgl' && v === 'realista' && btn('Agua en azul', ctrl.waterBlue(), () => ctrl.setWaterBlue(!ctrl.waterBlue()), 'Colorear el agua en azul según su profundidad, en vez de su color natural')}
      </div>
      {api.renderer === 'webgl' && <div className="vb-group" role="group" aria-label="Cámara">
        {btn('Calle', false, () => ctrl.camera('calle'), 'Vista a nivel de calle')}
        {btn('Valle', false, () => ctrl.camera('valle'), 'Mirar el valle desde la ladera, con el sector adelante')}
        {btn('Arriba', false, () => ctrl.camera('arriba'), 'Vista desde arriba')}
        {btn('⟲', false, () => ctrl.camera('izq'), 'Girar a la izquierda')}
        {btn('⟳', false, () => ctrl.camera('der'), 'Girar a la derecha')}
        {btn('+', false, () => ctrl.camera('acercar'), 'Acercar')}
        {btn('−', false, () => ctrl.camera('alejar'), 'Alejar')}
        {btn('Restablecer', false, () => ctrl.camera('general'), 'Restablecer la vista general')}
      </div>}
    </details>
  );
}

/** Guía de primeros pasos (se muestra una vez; se puede volver a abrir desde «Herramientas»). */
function Coach({ api }: { api: LabApi }) {
  const close = () => api.setSaved((s) => ({ ...s, coach: true }));
  return (
    <div className="city-ov city-coach" role="region" aria-label="Primeros pasos">
      <strong>Primeros pasos</strong>
      <ol>
        <li>
          Elige la lluvia en <em>Herramientas → Crear lluvia</em>.
        </li>
        <li>
          Pulsa <em>Iniciar lluvia</em> y mira hacia dónde corre el agua.
        </li>
        <li>Toca cualquier lugar de la maqueta para saber cuánta agua hay y hacia dónde va.</li>
        <li>
          Cambia algo del barrio y compáralo en <em>Comparar</em>, o haz una <em>Misión</em>.
        </li>
      </ol>
      <button type="button" className="btn small" onClick={close}>
        Entendido
      </button>
    </div>
  );
}

function Legend({ api }: { api: LabApi }) {
  const { ctrl } = api;
  const v = ctrl.viewMode();
  const sim = ctrl.displayed()!;
  if (v === 'materiales') {
    const present = new Set<number>();
    for (let k = 0; k < sim.c.cover.length; k++) present.add(sim.c.cover[k]);
    return (
      <div className="city-ov city-legend">
        <strong>Materiales</strong>
        <ul className="mat-legend">
          {[...present].map((i) => {
            const c = COVERS[COVER_LIST[i]];
            return (
              <li key={c.id}>
                <span className={`swatch pat-${c.pattern}`} style={{ background: c.matColor }} aria-hidden="true" />
                {c.name} {c.permeable ? '· permeable' : ''}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  if (v === 'peligro') {
    return (
      <div className="city-ov city-legend hazard-legend">
        <strong>Peligro del agua (máximo alcanzado)</strong>
        <ul className="haz-list">
          {HAZARD.slice(1).map((h) => (
            <li key={h.code}>
              <span className="haz-chip" style={{ background: h.color, color: h.id >= 4 ? '#fff' : '#1f2933' }}>{h.code}</span>
              {h.short}
            </li>
          ))}
        </ul>
        <small>Clase según profundidad, velocidad y su producto. Fuente: {HAZARD_SOURCE}.</small>
      </div>
    );
  }
  // agua natural (turbia) en la vista realista de la escena 3D, salvo que se pida el agua en azul
  const natural = api.renderer === 'webgl' && v === 'realista' && !ctrl.waterBlue();
  return (
    <div className="city-ov city-legend">
      <strong>{v === 'resultados' ? 'Profundidad máxima' : natural ? 'Profundidad del agua (color natural)' : 'Profundidad del agua'}</strong>
      <div className="depth-bar" style={{ background: cssDepthGradient(natural) }} aria-hidden="true" />
      <div className="depth-ticks">
        {DEPTH_STOPS.map((s) => (
          <span key={s.label}>{s.label}</span>
        ))}
      </div>
      <small>{ctrl.amplify() > 1 ? `Dibujo ×${ctrl.amplify()} (los valores no cambian)` : 'Profundidad a escala real'} · flechas y vetas: velocidad calculada</small>
      {ctrl.cutOn() && sim.sewer && (
        <ul className="mat-legend sewer-legend" aria-label="Bajo la calle">
          <li>
            <span className="swatch" style={{ background: SEWER_COLORS.lluvias.shell }} aria-hidden="true" />
            Aguas lluvias (agua: celeste)
          </li>
          <li>
            <span className="swatch" style={{ background: SEWER_COLORS.residuales.shell }} aria-hidden="true" />
            Aguas residuales (agua: ocre)
          </li>
          <li>
            <span className="swatch ring" style={{ borderColor: SEWER_COLORS.carga }} aria-hidden="true" />
            Anillos rojos: tramo en carga (lleno, a presión)
          </li>
          <li>
            <span className="swatch arrow" aria-hidden="true">➤</span>
            Flechas: sentido y velocidad del agua
          </li>
          {sim.c.sewer!.erradas.length > 0 && (
            <li>
              <span className="swatch" style={{ background: SEWER_COLORS.errada }} aria-hidden="true" />
              Conexión errada
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function SelectionCard({ api }: { api: LabApi }) {
  const { ctrl, sc } = api;
  const p = ctrl.selection!;
  const sim = ctrl.displayed()!;
  const c = sim.c;
  let title = '';
  const rows: [string, string][] = [];
  const actions: ReactNode[] = [];
  if (p.kind === 'drain') {
    const d = sc!.drains[p.index];
    const cd = c.drains[p.index];
    title = d.name;
    rows.push(['Tipo', 'Rejilla hipotética (no levantada)']);
    rows.push(['Obstrucción', `${fmtNum(cd.obstruction * 100, 0)} %`]);
    rows.push(['Capta ahora', `${fmtNum(sim.lastDt > 0 ? (sim.lastDrain[p.index] / sim.lastDt) * 1000 : 0, 1)} L/s`]);
    rows.push(['Total captado', `${fmtNum(sim.drainTotal[p.index], 2)} m³`]);
    rows.push(['Capacidad', `${d.capacityLps} L/s`]);
    rows.push(['Agua sobre la rejilla', fmtDepth(sim.h[cd.cell])]);
    const setObs = (o: number) => ctrl.update({ B: { ...ctrl.ivB, drains: { ...ctrl.ivB.drains, [d.id]: o } } });
    actions.push(
      <button key="l" type="button" className="btn-ghost small" onClick={() => setObs(0)}>
        Libre / restaurar
      </button>,
      <button key="o" type="button" className="btn-ghost small" onClick={() => setObs(0.9)}>
        Obstruir
      </button>,
    );
  } else if (p.kind === 'building') {
    const b = sc!.buildings[p.index];
    const cb = c.buildings[p.index];
    title = 'Edificio';
    rows.push(['Pisos', String(b.floors)]);
    rows.push(['Altura', `${fmtNum(b.heightM, 1)} m`]);
    rows.push(['Área de techo', `${fmtNum(cb.roofArea, 0)} m²`]);
    rows.push(['Su lluvia va a', cb.tank >= 0 ? 'un depósito' : 'la bajante (al andén)']);
    const mm = rainDepth(sim.hyeto.times, sim.hyeto.mmh, sim.t);
    rows.push(['Lluvia en el techo hasta ahora', `${fmtNum((mm / 1000) * cb.roofArea, 2)} m³`]);
    rows.push(['Origen del dato', b.kind === 'real' ? 'cartografía' : 'didáctico']);
    const ex = exposureOf(sim)[p.index];
    if (ex && ex.depth >= 0.01) {
      title = buildingName(b.id);
      rows.push(['Agua contra sus muros (máximo)', fmtDepth(ex.depth)]);
      rows.push(['Velocidad máxima junto a la casa', `${fmtNum(ex.speed, 1)} m/s`]);
      rows.push(['Peligro máximo junto a la casa', `${HAZARD[ex.hazard].code}: ${HAZARD[ex.hazard].text}`]);
    }
  } else {
    const k = p.k;
    const cov = COVERS[COVER_LIST[c.cover[k]]];
    const zone = c.zone[k] >= 0 ? sc!.zones[c.zone[k]].name : null;
    title = zone ? `${zone} · ${cov.name}` : cov.name;
    const [ux, uy] = sim.velocityAt(k);
    const sp = Math.hypot(ux, uy);
    rows.push(['Profundidad ahora', fmtDepth(sim.h[k])]);
    rows.push(['Máxima hasta ahora', fmtDepth(sim.hmaxField[k])]);
    rows.push(['Velocidad (modelo)', sim.h[k] >= H_WET ? `${fmtNum(sp, 2)} m/s` : '—']);
    rows.push(['El agua va hacia', sim.h[k] >= H_WET && sp > 0.005 ? dirText(ux, uy) : 'quieta o seca']);
    if (sim.hazMax[k] > 0) {
      const [cu, cv] = sim.velocityCapped(k);
      const now = hazardClassOf(sim.h[k], Math.hypot(cu, cv));
      rows.push(['Peligro (ahora · máximo)', `${HAZARD[now].code} · ${HAZARD[sim.hazMax[k]].code}: ${HAZARD[sim.hazMax[k]].short}`]);
    }
    rows.push(['Cota relativa', `${fmtNum(c.z[k], 2)} m`]);
    rows.push(['Infiltra', cov.permeable ? `${cov.ksMmH} mm/h · guardado ${fmtNum(sim.soil[k] * 1000, 0)} de ${fmtNum(c.smax[k] * 1000, 0)} mm` : 'no (impermeable)']);
    actions.push(
      <button key="m" type="button" className="btn-ghost small" onClick={() => ctrl.setProbe([p.x, p.y])}>
        Medir aquí
      </button>,
      <button key="t" type="button" className="btn-ghost small" onClick={() => ctrl.releaseTracers(p.x, p.y)}>
        Soltar gotas aquí
      </button>,
    );
  }
  return (
    <div className="city-ov city-card" role="region" aria-label={`Información: ${title}`}>
      <div className="card-head">
        <strong>{title}</strong>
        <button type="button" className="icon-btn" aria-label="Cerrar información" onClick={() => ctrl.select(null)}>
          <Icon name="close" />
        </button>
      </div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {actions.length > 0 && <div className="btn-row">{actions}</div>}
    </div>
  );
}

/** Explicación equivalente en texto de lo que muestra la maqueta (accesibilidad). */
function StateSummary({ api }: { api: LabApi }) {
  const { ctrl } = api;
  const sim = ctrl.displayed()!;
  const b = sim.bal;
  const probes = sim.c.probes.map((p, q) => ({ name: p.name, now: sim.h[p.cell], max: sim.probeMax[q].depth })).sort((x, y) => y.now - x.now);
  const [ux, uy] = (() => {
    let sx = 0, sy = 0;
    for (const p of sim.c.probes) {
      const [u, v] = sim.velocityAt(p.cell);
      sx += u;
      sy += v;
    }
    return [sx, sy];
  })();
  const wet = probes.filter((p) => p.now >= 0.001);
  return (
    <details className="city-summary">
      <summary>Qué está pasando (en texto)</summary>
      <p>
        Minuto {fmtTime(sim.t)}. Han caído {fmtNum(b.precipitation, 1)} m³ de lluvia. En la superficie hay {fmtNum(b.surface, 1)} m³; se infiltraron {fmtNum(b.infiltrated, 1)} m³; los sumideros captaron {fmtNum(b.drained, 1)} m³ y salieron por el borde bajo {fmtNum(b.boundaryOut, 1)} m³.
      </p>
      <p>
        {wet.length ? `Hay agua en ${wet.map((p) => `«${p.name}» (${fmtDepth(p.now)})`).join(', ')}.` : 'Los medidores fijos están secos.'}{' '}
        {Math.hypot(ux, uy) > 0.01 ? `En general, el agua corre hacia ${dirText(ux, uy)}.` : ''}
      </p>
    </details>
  );
}

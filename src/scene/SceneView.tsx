// Vista del paisaje: arte SVG, motor de partículas, cámara, etiquetas, lupas y superposiciones.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STEPS } from '../content/steps';
import { RESERVOIR_IDS } from '../content/elements';
import { UI } from '../content/ui';
import { setAmbient, startAmbient, stopAmbient } from '../lib/audio';
import type { SceneSpec } from '../state/spec';
import { useStore } from '../state/store';
import { Defs } from './art/Defs';
import { Forces, GroundwaterLines, LevelLine, ProcessArrows, RunoffFlow, RunoffLines, WindLines } from './art/Flows';
import { SectionBase, WaterTableLine, WellCasing, Wells, buildWaterTable } from './art/Section';
import { Cloud, CloudShadows, DriftCloud, FeaturedTree, Forest, Lake, Land, Mountains, Ocean, River, RiverBanks, RiverFlow, Sky, Streams, SurfaceClips, Town, buildSnowClip } from './art/Surface';
import { FogBanks } from './art/Highlands';
import { SedimentPlume, TreatmentPlant, WaterTank, WellHead } from './art/People';
import { contextFocus, fitCamera, makeMapper, panRect, useTweenRect } from './camera';
import { ParticleEngine } from './engine';
import { CLOUDS, FULL_VIEW, OVERVIEW_COMPACT, REGIONS, TRACER_NODES, TRACER_PATHS, type Rect } from './geometry';
import { hitTest } from './hitTest';
import { Labels } from './Labels';
import { LensConnectors, Lenses, lensPlacement } from './Lenses';
import type { Box } from './Labels';
import { CompareRace, Parcel, Spotlight, Tracer } from './Overlays';
import { Legend } from '../components/Legend';
import { DetailView, rememberOpener } from '../components/DetailView';
import { ScaleNav, Transport, type Scale } from '../components/StageControls';
import { StepCaption } from '../components/StepCaption';
import { InquiryPins, pinBoxes } from '../components/Inquiry';
import { DETAIL_BY_ID } from '../content/details';
import type { DetailId } from '../state/store';

const LENS_DETAIL: Partial<Record<string, DetailId>> = {
  stoma: 'planta',
  cloud: 'nube',
  drop: 'nube',
  soil: 'poros',
  aquifer: 'subterraneo',
};

export function SceneView({ spec, onCompare }: { spec: SceneSpec; onCompare?: (p: { runoff: number; ground: number }) => void }) {
  const { state, dispatch } = useStore();
  const reduced = state.prefs.reducedMotion;
  const paused = state.paused;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fringeRef = useRef<SVGPathElement>(null);
  const cloudARef = useRef<SVGGElement>(null);
  const snowClipRef = useRef<SVGPolygonElement>(null);
  const wetRef = useRef<SVGGElement>(null);
  const wtRef = useRef<SVGPathElement>(null);
  const satRef = useRef<SVGPathElement>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const snowlineRef = useRef(272);

  const [size, setSize] = useState({ w: 960, h: 600 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: Math.max(200, r.width), h: Math.max(160, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const compact = size.w < 760;
  const detailDef = state.detail ? DETAIL_BY_ID[state.detail.id] : null;
  const camKey = detailDef ? detailDef.region : spec.camera;
  const isAll = camKey === 'all' || camKey === 'storage';
  const region = (compact && REGIONS[`${camKey}C`]) || REGIONS[camKey] || FULL_VIEW;
  // La cámara sigue a la gota trazadora: encuadra el tramo que recorre o el lugar donde está.
  const tracerKey = state.tool === 'tracer' && state.tracer ? `${state.tracer.moving ?? ''}|${state.tracer.node}` : '';
  const tracerRect = useMemo<Rect | null>(() => {
    if (!tracerKey) return null;
    const [moving, node] = tracerKey.split('|');
    const pts = moving ? (TRACER_PATHS[moving] ?? []).flatMap((sg) => sg.points) : [TRACER_NODES[node]];
    if (!pts.length) return null;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }, [tracerKey]);
  let focus = FULL_VIEW;
  if (state.zoom !== 'out' || detailDef) {
    if (tracerRect) focus = compact ? contextFocus(tracerRect, 460, 400) : contextFocus(tracerRect, 900, 560);
    else if (!isAll) focus = compact ? contextFocus(region, 440, 380) : contextFocus(region, 980, 600);
    else if (compact) focus = OVERVIEW_COMPACT;
  }
  const zoomedIn = focus !== FULL_VIEW;
  const canZoomIn = !zoomedIn && (!isAll || compact || !!tracerRect);

  // Desplazamiento con arrastre (ratón o dedo)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null);
  useEffect(() => setPan({ x: 0, y: 0 }), [focus.x, focus.y, focus.w, focus.h, size.w, size.h]);

  const base = useMemo(
    () => fitCamera(focus, size.w, size.h, zoomedIn ? 0.03 : 0.01, focus === FULL_VIEW ? 0.72 : 0.5),
    [focus, size.w, size.h, zoomedIn],
  );
  const target = useMemo(() => panRect(base, pan.x, pan.y), [base, pan.x, pan.y]);
  const vb = useTweenRect(target, reduced || dragging);
  const mapper = useMemo(() => makeMapper(vb, size.w, size.h), [vb, size.w, size.h]);
  const viewBox = `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`;
  const canPan = base.w < 2100 && (zoomedIn || compact);

  // Motor de partículas
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new ParticleEngine(canvasRef.current, {});
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setHooks({
      cloudA: cloudARef.current,
      snowClip: snowClipRef.current,
      soilWet: wetRef.current,
      waterTable: wtRef.current,
      fringe: fringeRef.current,
      saturated: satRef.current,
      buildSnowClip,
      buildWaterTable,
      onSnowline: (y) => {
        snowlineRef.current = y;
      },
    });
  });

  // con una vista de detalle abierta, el paisaje de fondo se detiene: ahorra trabajo y no distrae
  const running = !paused && !reduced && !state.detail;
  useEffect(() => {
    engineRef.current?.setParams({
      conditions: spec.conditions,
      model: spec.model,
      focus: spec.layers,
      isolate: spec.isolate,
      wideRain: spec.wideRain,
      longRain: spec.knobs.longRain,
      condensationStep: spec.stepId === 'condensacion',
      running,
      pumping: spec.conditions.pumping ?? 0,
      stormRain: spec.stormRain,
    });
  });

  useEffect(() => {
    engineRef.current?.setCamera(vb, size.w, size.h);
  }, [vb, size.w, size.h]);

  useEffect(() => {
    engineRef.current?.setSpeed(state.speed);
  }, [state.speed]);
  useEffect(() => {
    engineRef.current?.setQuality(state.quality);
  }, [state.quality]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setVisible(!reduced);
    if (reduced) e.clear();
    else e.reset();
  }, [state.replay, reduced]);

  // Sonido ambiental opcional
  useEffect(() => {
    if (!state.prefs.sound) return;
    startAmbient();
    return () => stopAmbient();
  }, [state.prefs.sound]);
  useEffect(() => {
    if (!state.prefs.sound) return;
    setAmbient({
      wind: spec.conditions.wind / 2,
      rain: paused ? 0 : spec.stormRain ?? [0, 0.35, 0.65, 1][spec.conditions.rain],
      river: spec.model.idx.rio,
    });
  }, [state.prefs.sound, spec.conditions.wind, spec.conditions.rain, spec.model.idx.rio, spec.stormRain, paused]);

  // Exploración con ratón o tacto
  const interactive = state.mode === 'explore' || (state.mode === 'guided' && spec.stepId === 'reservorios');
  const select = useCallback(
    (clientX: number, clientY: number, el: Element) => {
      if (!interactive || state.tool) return;
      const rect = el.getBoundingClientRect();
      const [x, y] = mapper.toScene(clientX - rect.left, clientY - rect.top);
      const id = hitTest(x, y, snowlineRef.current);
      if (!id) return;
      if (state.mode === 'explore') dispatch({ type: 'select', id });
      else if (RESERVOIR_IDS.includes(id)) dispatch({ type: 'found', id });
    },
    [interactive, mapper, dispatch, state.mode, state.tool],
  );

  const onPointerDown = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (ev.button !== 0) return;
    drag.current = { sx: ev.clientX, sy: ev.clientY, px: pan.x, py: pan.y, moved: false };
  };
  const onPointerMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || !canPan) return;
    const dx = ev.clientX - d.sx;
    const dy = ev.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 7) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      ev.currentTarget.setPointerCapture?.(ev.pointerId);
    }
    setPan({ x: d.px - dx / mapper.scale, y: ev.pointerType === 'touch' ? d.py : d.py - dy / mapper.scale });
  };
  const onPointerUp = (ev: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (dragging) setDragging(false);
    if (d && !d.moved) select(ev.clientX, ev.clientY, ev.currentTarget);
  };
  const onPointerCancel = () => {
    drag.current = null;
    setDragging(false);
  };

  const c = spec.conditions;
  const pumping = c.pumping ?? 0;
  const stormOrRain = spec.stormRain ?? [0, 0.35, 0.65, 1][c.rain];
  const cloudTone = (stormOrRain === 0 ? 0 : stormOrRain > 0.9 ? 2 : 1) as 0 | 1 | 2;
  const fogFocus = spec.layers === 'all' || spec.layers.includes('fog');
  const windFocus = spec.layers === 'all' || spec.layers.includes('wind');
  const showWells = spec.callouts.includes('wells');
  const lensIds = spec.callouts.filter((x) => x !== 'wells' && x !== 'compare' && x !== 'parcel');
  const step = spec.stepId ? STEPS.find((s) => s.id === spec.stepId) : null;

  const sceneDescription = step ? step.staticDescription : STEPS[0].staticDescription;

  const scale: Scale = state.detail ? 'detalle' : zoomedIn && !(isAll && !tracerRect) ? 'proceso' : 'cuenca';
  const stacked = typeof window !== 'undefined' && window.innerWidth <= 900;
  // las lupas y los rótulos dejan libre el subtítulo de observación (escritorio) y la barra de reproducción
  const captionOnStage = state.mode === 'guided' && !state.tool && !state.detail && !stacked && !compact;
  const lensReserve = captionOnStage ? 152 : 66;
  // zonas que los rótulos deben evitar: barra de escalas, leyenda, reproducción y lupas
  const blocked: Box[] = [
    { x: 0, y: 0, w: compact ? 300 : 500, h: compact ? 52 : 60 },
    { x: size.w - (compact ? 60 : 150), y: 0, w: compact ? 60 : 150, h: compact ? 52 : 60 },
    { x: 0, y: size.h - (compact ? 58 : 62), w: compact ? 250 : 430, h: compact ? 58 : 62 },
    ...lensIds.map((id) => lensPlacement(id, mapper, compact, size.w, size.h, lensReserve)?.box).filter((b): b is Box => !!b),
  ];
  if (state.mode === 'guided' && !state.tool && !state.detail && !stacked)
    blocked.push(compact ? { x: 0, y: 48, w: size.w, h: 74 } : { x: size.w - Math.max(312, Math.min(452, size.w - 458)), y: size.h - 118, w: 452, h: 118 });
  // la indicación «Arrastra para recorrer el paisaje» (abajo, al centro) también es una zona ocupada mientras se ve
  const hintOn = canPan && compact && !dragging && pan.x === 0;
  if (hintOn) blocked.push({ x: size.w / 2 - 150, y: size.h - 66 - 36, w: 300, h: 40 });
  const showPins = !state.tool && !state.detail && ((state.mode === 'explore' && state.layersOn.preguntas) || (state.mode === 'guided' && spec.stepId === 'conexiones'));
  if (showPins) blocked.push(...pinBoxes(mapper.toScreen));
  const processLabel = detailDef ? detailDef.place : step && step.region !== 'all' ? step.title : null;
  function openDetail(id: DetailId) {
    if (!state.detail) rememberOpener();
    dispatch({ type: 'openDetail', detail: { id, at: DETAIL_BY_ID[id].subject } });
  }

  return (
    <div
      className={`scene${interactive && !state.tool ? ' is-explorable' : ''}${canPan ? ' can-pan' : ''}${dragging ? ' is-dragging' : ''}${paused || state.detail ? ' is-paused' : ''}${reduced ? ' is-reduced' : ''}`}
      ref={wrapRef}
    >
      {/* Capa 1: ilustración estática (no se vuelve a pintar en cada fotograma) */}
      <svg
        className="scene-svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${UI.scene.label}. ${sceneDescription}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <Defs />
        <SurfaceClips />
        <g id="scene-art">
        <Sky solar={c.solar} />
        <Mountains ref={snowClipRef} />
        <Ocean />
        <Land />
        <CloudShadows rain={stormOrRain} />
        <Lake />
        <Streams melt={[0.12, 0.5, 1][c.temperature] * (0.55 + 0.45 * [0.35, 0.65, 1][c.solar])} />
        <River level={spec.model.idx.rio} turbidity={spec.model.idx.turbidity} />
        <RiverBanks vegetation={c.vegetation} />
        <TreatmentPlant />
        <Town surface={c.surface} />
        <WellHead pumping={pumping} />
        <WaterTank />
        <Forest vegetation={c.vegetation} />
        <FeaturedTree vegetation={c.vegetation} />
        <Cloud def={CLOUDS[2]} tone={stormOrRain > 0 ? 1 : 0} />
        <Cloud def={CLOUDS[0]} tone={spec.wideRain && stormOrRain >= 0.5 ? 1 : 0} ref={cloudARef} className="cloud-a" />
        <Cloud def={CLOUDS[1]} tone={cloudTone} />
        <SectionBase surface={c.surface} vegetation={c.vegetation} pumping={pumping} satRef={satRef} wetRef={wetRef} />
        <GroundwaterLines />
        <WaterTableLine ref={wtRef} fringeRef={fringeRef} />
        <WellCasing pumping={pumping} />
        {showWells && <Wells />}
        <RunoffLines level={spec.model.idx.escorrentia} surface={c.surface} />
        {spec.levels.map((l) => (
          <LevelLine key={l} kind={l} />
        ))}
        <ProcessArrows strong={spec.arrows} faint={spec.arrowsFaint || reduced} />
        {spec.forces && <Forces />}
        </g>
      </svg>

      {/* Capa 2: trazos que se mueven (viento, corrientes, niebla, pluma de sedimentos) */}
      <svg className="scene-anim" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g className="fade" style={{ opacity: state.tool === 'tracer' ? 0.15 : windFocus ? 0.9 : 0.25 }}>
          <WindLines wind={c.wind} />
        </g>
        {!reduced && state.tool !== 'tracer' && windFocus && <DriftCloud wind={c.wind} />}
        {!reduced && <FogBanks wind={c.wind} visible={fogFocus ? 0.95 : 0.35} />}
        <SedimentPlume turbidity={spec.model.idx.turbidity} />
        <RiverFlow level={spec.model.idx.rio} />
        <RunoffFlow level={spec.model.idx.escorrentia} surface={c.surface} />
      </svg>

      {/* Capa 3: partículas en Canvas (mucho más eficiente para cientos de elementos) */}
      <canvas ref={canvasRef} className={`scene-canvas${reduced ? ' is-hidden' : ''}`} aria-hidden="true" />

      {/* Capa 4: interacción del paso, foco de atención, lupas y gota trazadora */}
      <svg className="scene-top" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {spec.stepId === 'condensacion' && !state.tool && <Parcel t={state.knobs.parcel} />}
        {spec.callouts.includes('compare') && (
          <CompareRace run={state.knobs.compareRun} paused={paused} reduced={reduced} onProgress={(p) => onCompare?.(p)} />
        )}
        <Spotlight regions={spec.highlight} />
        <LensConnectors callouts={lensIds} />
        {state.tool === 'tracer' && state.tracer && (
          <Tracer tracer={state.tracer} paused={paused} reduced={reduced} onArrive={() => dispatch({ type: 'tracerArrive' })} />
        )}
      </svg>

      <div className="scene-overlay">
        {spec.labelMode !== 'none' && spec.labels.length > 0 && (
          <Labels
            ids={spec.labels}
            mode={spec.labelMode === 'buttons' ? 'buttons' : 'info'}
            mapper={mapper}
            width={size.w}
            height={size.h}
            selected={state.mode === 'explore' ? state.selected : null}
            found={spec.stepId === 'reservorios' ? state.progress.found : undefined}
            compact={compact}
            blocked={blocked}
            primary={spec.labels[0] ?? null}
            onSelect={(id) => {
              if (state.mode === 'explore') dispatch({ type: 'select', id });
              else if (RESERVOIR_IDS.includes(id)) dispatch({ type: 'found', id });
            }}
          />
        )}
        {showPins && <InquiryPins toScreen={mapper.toScreen} width={size.w} height={size.h} compact={compact} />}
        {(
          <Lenses
            callouts={lensIds}
            mapper={mapper}
            conditions={c}
            knobs={state.knobs}
            compact={compact}
            width={size.w}
            height={size.h}
            detailFor={(id) => (id === 'aquifer' && spec.stepId === 'percolacion' ? 'zonas' : LENS_DETAIL[id] ?? null)}
            onDetail={openDetail}
            bottomReserve={lensReserve}
          />
        )}
      </div>

      <ScaleNav
        scale={scale}
        processLabel={processLabel}
        canProcess={canZoomIn || zoomedIn}
        compact={compact}
        onBasin={() => {
          if (state.detail) dispatch({ type: 'closeDetail' });
          dispatch({ type: 'zoom', zoom: 'out' });
        }}
        onProcess={() => {
          if (state.detail) dispatch({ type: 'closeDetail' });
          dispatch({ type: 'zoom', zoom: 'auto' });
        }}
        onDetail={(id) => openDetail(id)}
      />
      <div className="scene-tools">
        <button type="button" className="tool-btn" aria-label={UI.legendTitle} aria-expanded={state.legendOpen} onClick={() => dispatch({ type: 'legend', open: !state.legendOpen })}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="5" cy="5" r="2.4" fill="currentColor" />
            <circle cx="5" cy="10" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M5 13 v4" stroke="currentColor" strokeWidth="2" />
            <path d="M10 5 h7 M10 10 h7 M10 15 h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{UI.legendTitle}</span>
        </button>
      </div>
      {state.legendOpen && <Legend onClose={() => dispatch({ type: 'legend', open: false })} />}
      {hintOn && (
        <p className="scene-hint" key={`${focus.x}-${focus.y}`}>
          Arrastra para recorrer el paisaje
        </p>
      )}
      {state.mode === 'guided' && !state.tool && !state.detail && <StepCaption compact={compact} />}
      <div className="stage-bottom">
        <Transport compact={compact} />
        {!(state.mode === 'guided' && !state.tool && !compact) && <p className="scene-note">{compact ? 'Tiempos y tamaños simplificados' : UI.simplified}</p>}
      </div>
      {state.detail && (
        <DetailView
          key={state.detail.id}
          id={state.detail.id}
          origin={mapper.toScreen(state.detail.at[0], state.detail.at[1])}
          stage={size}
          compact={compact}
          fullscreen={stacked || size.h < 520}
        />
      )}
    </div>
  );
}

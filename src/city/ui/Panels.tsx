// Paneles del laboratorio de lluvia: herramientas, comparación, misiones, palabras clave y docente.

import { Fragment, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { COVERS, DURATION_RANGE, ENGINE, NUMERICS, RAIN_RANGE, type CoverId } from '../sim/constants';
import { baseInterventions, cloneInterventions, validateConfig, validateScenario, type Interventions, type Scenario } from '../sim/scenario';
import { change } from '../sim/compare';
import { runQuickTests, type QuickResult } from '../sim/quicktests';
import { allScenarios, registerScenario } from '../scenarios/index';
import type { Capabilities, CityController, RendererKind } from '../controller';
import type { CitySaved } from '../persist';
import { BUDGET, MISSIONS, budgetItems, type Mission } from '../content/missions';
import { fmtDepth, fmtDuration, fmtNum, fmtTime } from '../render/palette';
import { LineChart, type Series } from './Chart';
import { Disclosure, Segmented } from '../../components/ui';
import { GLOSSARY } from '../../content/glossary';
import { STEPS } from '../../content/steps';
import { useStore } from '../../state/store';
import { downloadText } from '../../lib/download';
import report from '../content/test-report.json';
import { RainBudget } from './RainBudget';
import { Range } from './Range';
import { CreekTool, SewerTeacher, SewerTool, culvertStateText } from './SewerPanel';
import { HAZARD_SOURCE } from '../sim/hazard';
import { TRACER_COLORS, TRACER_TRAIL_MOVING } from '../render/tracerColors';

export type ToolId = 'lluvia' | 'superficies' | 'jardin' | 'deposito' | 'sumideros' | 'quebrada' | 'trazadores' | 'medir';
export type TabId = 'misiones' | 'herramientas' | 'comparar' | 'palabras' | 'docente';

export interface MissionUi {
  id: string;
  step: 0 | 1 | 2 | 3;
  prediction: string | null;
  running: boolean;
}

export interface LabApi {
  ctrl: CityController;
  sc: Scenario | null;
  saved: CitySaved;
  setSaved: (f: (s: CitySaved) => CitySaved) => void;
  tool: ToolId;
  setTool: (t: ToolId) => void;
  caps: Capabilities | null;
  renderer: RendererKind;
  setRenderer: (r: RendererKind) => void;
  mission: MissionUi | null;
  setMission: (m: MissionUi | null) => void;
  runMission: (m: Mission, budgetSel: string[]) => void;
  goSector: (id: string) => void;
  /** Panel derecho contraído (la maqueta ocupa todo el ancho). */
  panelHidden: boolean;
  setPanelHidden: (hidden: boolean) => void;
  peekRef: RefObject<HTMLButtonElement | null>;
}

const COLOR_A = '#5b6470';
const COLOR_B = '#1f78b4';
const m3 = (v: number) => `${fmtNum(v, v < 10 ? 2 : 1)}\u00a0m³`;
const lps = (v: number) => `${fmtNum(v * 1000, 1)}\u00a0L/s`;

export const TOOL_LIST: { id: ToolId; label: string; hint: string }[] = [
  { id: 'lluvia', label: 'Crear lluvia', hint: 'Intensidad, duración y dónde llueve.' },
  { id: 'superficies', label: 'Superficies', hint: 'Cambia asfalto, concreto, grama…' },
  { id: 'jardin', label: 'Jardín de lluvia', hint: 'Guarda agua hasta llenarse.' },
  { id: 'deposito', label: 'Depósito', hint: 'Recoge la lluvia de un techo.' },
  { id: 'sumideros', label: 'Sumideros', hint: 'Libres, obstruidos o restaurados.' },
  { id: 'trazadores', label: 'Seguir el agua', hint: 'Suelta gotas trazadoras.' },
  { id: 'medir', label: 'Medir', hint: 'Profundidad en el tiempo.' },
];

/** Herramientas del sector: con red separada, «Sumideros» pasa a «Alcantarillado»; con quebrada, «Creciente». */
export function toolsFor(sc: Scenario | null): { id: ToolId; label: string; hint: string }[] {
  const list = TOOL_LIST.map((t) => (t.id === 'sumideros' && sc?.sewer ? { ...t, label: 'Alcantarillado', hint: 'Sumideros, cámaras y redes separadas.' } : t));
  if (sc?.creek) list.splice(list.findIndex((t) => t.id === 'sumideros') + 1, 0, { id: 'quebrada', label: 'Creciente', hint: 'La quebrada crece y se desborda.' });
  return list;
}

const coverName = (c: CoverId) => COVERS[c].name;

function Pending({ api }: { api: LabApi }) {
  if (!api.ctrl.pending) return null;
  return (
    <div className="city-note is-pending" role="status">
      <p>Hay cambios listos. Se aplican al reiniciar para que cada corrida empiece desde el mismo estado.</p>
      <button type="button" className="btn small" onClick={() => api.ctrl.reset()}>
        Reiniciar con los cambios
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ herramientas

export function ToolsTab({ api }: { api: LabApi }) {
  const { ctrl, sc } = api;
  if (!sc) return <p>Elige primero un sector en el valle.</p>;
  return (
    <div className="city-tools">
      <div className="tool-grid" role="radiogroup" aria-label="Herramientas">
        {toolsFor(sc).map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={api.tool === t.id} className={`tool-card${api.tool === t.id ? ' is-on' : ''}`} onClick={() => api.setTool(t.id)}>
            <strong>{t.label}</strong>
            <span>{t.hint}</span>
          </button>
        ))}
      </div>
      <Pending api={api} />
      {api.tool === 'lluvia' && <RainTool api={api} />}
      {api.tool === 'superficies' && <SurfaceTool api={api} />}
      {api.tool === 'jardin' && <GardenTool api={api} />}
      {api.tool === 'deposito' && <TankTool api={api} />}
      {api.tool === 'sumideros' && <DrainTool api={api} />}
      {api.tool === 'quebrada' && sc.creek && <CreekTool ctrl={ctrl} sc={sc} />}
      {api.tool === 'trazadores' && <TracerTool api={api} />}
      {api.tool === 'medir' && <MeasureTool api={api} />}
      <button type="button" className="link" onClick={() => api.setSaved((s) => ({ ...s, coach: false }))}>
        Ver de nuevo los primeros pasos
      </button>
      <p className="city-small">
        Los cambios se hacen en <strong>B, tu barrio</strong>. {ctrl.compare ? 'Estás comparando A y B.' : 'En la pestaña «Comparar» puedes correr A y B con la misma lluvia.'}
      </p>
    </div>
  );
}

function RainTool({ api }: { api: LabApi }) {
  const { ctrl, sc } = api;
  const r = ctrl.shared.rain;
  const depth = r.intensityMmH * (r.durationMin / 60);
  const area = sc!.extent.width * sc!.extent.height;
  const vol = (depth / 1000) * (r.spatial === 'uniforme' ? area : Math.min(area, Math.PI * r.radiusM * r.radiusM));
  const set = (patch: Partial<typeof r>) => {
    const rain = { ...r, ...patch };
    const sim = Math.max(ctrl.shared.simMinutes, rain.durationMin + 10);
    ctrl.update({ shared: { rain, simMinutes: Math.min(120, sim) } });
  };
  return (
    <section className="tool-body" aria-label="Crear lluvia">
      <h3>Crear lluvia</h3>
      <div className="chip-row" role="group" aria-label="Lluvias de ejemplo">
        {[
          ['Llovizna', 5],
          ['Moderada', 20],
          ['Fuerte', 60],
          ['Muy fuerte', 100],
        ].map(([l, v]) => (
          <button key={l} type="button" className={`chip${r.intensityMmH === v ? ' is-on' : ''}`} aria-pressed={r.intensityMmH === v} onClick={() => set({ intensityMmH: v as number })}>
            {l} · {v} mm/h
          </button>
        ))}
      </div>
      <Range label="Intensidad" value={r.intensityMmH} min={RAIN_RANGE.min} max={RAIN_RANGE.max} step={RAIN_RANGE.step} unit="mm/h" onChange={(v) => set({ intensityMmH: v })} />
      <Range label="Duración" value={r.durationMin} min={DURATION_RANGE.min} max={DURATION_RANGE.max} step={DURATION_RANGE.step} unit="min" onChange={(v) => set({ durationMin: v })} />
      <Range label="Tiempo simulado" value={ctrl.shared.simMinutes} min={Math.max(10, r.durationMin)} max={120} step={5} unit="min" onChange={(v) => ctrl.update({ shared: { simMinutes: v } })} help="Incluye el tiempo después de la lluvia, mientras el agua termina de escurrir." />
      <Segmented label="Forma de la lluvia" value={r.pattern} options={[{ value: 'constante', label: 'Constante' }, { value: 'pico', label: 'Con pico' }]} onChange={(v) => set({ pattern: v })} help={r.pattern === 'pico' ? 'Mismo total de agua, pero con un máximo de hasta el doble de la intensidad media al primer tercio.' : undefined} />
      <Segmented label="Dónde llueve" value={r.spatial} options={[{ value: 'uniforme', label: 'En todo el sector' }, { value: 'localizada', label: 'En un lugar' }]} onChange={(v) => set({ spatial: v })} />
      {r.spatial === 'localizada' && (
        <>
          <p className="city-small">Toca la maqueta para elegir el centro del aguacero.</p>
          <Range label="Radio" value={r.radiusM} min={10} max={60} step={5} unit="m" onChange={(v) => set({ radiusM: v })} />
        </>
      )}
      <Segmented label="Suelo al empezar" value={ctrl.shared.soilInitial} options={[{ value: 'seco', label: 'Seco' }, { value: 'humedo', label: 'Húmedo' }]} onChange={(v) => ctrl.update({ shared: { soilInitial: v } })} help="Un suelo húmedo ya tiene ocupada parte de su capacidad de guardar agua." />
      {sc!.inflows.length > 0 && <Range label={sc!.inflows[0].name} value={ctrl.shared.inflowLps} min={0} max={200} step={10} unit="L/s" onChange={(v) => ctrl.update({ shared: { inflowLps: v } })} help="Entrada externa al sector; se cuenta aparte en el balance." />}
      <p className="city-fact">
        Caerán <strong>{fmtNum(depth, 1)} mm</strong> de lluvia: {fmtNum(depth, 1)} litros por cada metro cuadrado, unos <strong>{fmtNum(vol, 1)} m³</strong> en {r.spatial === 'uniforme' ? 'todo el sector' : 'la zona del aguacero'}.
      </p>
      <p className="city-small">Rangos didácticos ({RAIN_RANGE.min}–{RAIN_RANGE.max} mm/h; {DURATION_RANGE.min}–{DURATION_RANGE.max} min). No son curvas de diseño de Medellín.</p>
    </section>
  );
}

function SurfaceTool({ api }: { api: LabApi }) {
  const { ctrl, sc } = api;
  return (
    <section className="tool-body" aria-label="Superficies">
      <h3>Cambiar superficies</h3>
      <p className="city-small">Cada superficie cambia cómo se ve y cómo se comporta: rugosidad, infiltración y capacidad de guardar agua.</p>
      <button type="button" className="btn-ghost small" onClick={() => ctrl.setView(ctrl.viewMode() === 'materiales' ? 'realista' : 'materiales')}>
        {ctrl.viewMode() === 'materiales' ? 'Volver a la vista realista' : 'Ver la maqueta por materiales'}
      </button>
      {sc!.zones.map((z) => (
        <fieldset key={z.id} className="city-fieldset">
          <legend>
            {z.name}{' '}
            <button type="button" className="link" onClick={() => ctrl.focus((z.polygon[0][0] + z.polygon[2][0]) / 2, (z.polygon[0][1] + z.polygon[2][1]) / 2)}>
              ver
            </button>
          </legend>
          {[z.cover, ...z.options.filter((o) => o !== z.cover)].map((o) => {
            const c = COVERS[o];
            const on = (ctrl.ivB.zones[z.id] ?? z.cover) === o;
            return (
              <label key={o} className={`cover-opt${on ? ' is-on' : ''}`}>
                <input type="radio" name={`zone-${z.id}`} checked={on} onChange={() => ctrl.update({ B: { ...ctrl.ivB, zones: { ...ctrl.ivB.zones, [z.id]: o } } })} />
                <span className={`swatch pat-${c.pattern}`} style={{ background: c.matColor }} aria-hidden="true" />
                <span>
                  <strong>{c.name}</strong>
                  {o === z.cover ? ' (actual)' : ''}
                  <small>{c.kid}</small>
                  <small className="params">
                    Infiltra {c.ksMmH} mm/h · guarda {fmtNum(c.storageM * 100, 0)} cm · rugosidad n = {c.manning}
                  </small>
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </section>
  );
}

function GardenTool({ api }: { api: LabApi }) {
  const { ctrl, sc } = api;
  const sim = ctrl.displayed();
  return (
    <section className="tool-body" aria-label="Jardín de lluvia">
      <h3>Jardín de lluvia</h3>
      <p className="city-small">{COVERS.jardin_lluvia.kid}</p>
      {sc!.gardens.map((g, gi) => {
        const on = !!ctrl.ivB.gardens[g.id];
        const w = Math.abs(g.polygon[2][0] - g.polygon[0][0]), h = Math.abs(g.polygon[2][1] - g.polygon[0][1]);
        const cap = w * h * (g.depthM + COVERS.jardin_lluvia.storageM * 0.8);
        return (
          <div key={g.id} className="city-item">
            <label className="check">
              <input type="checkbox" checked={on} onChange={(e) => ctrl.update({ B: { ...ctrl.ivB, gardens: { ...ctrl.ivB.gardens, [g.id]: e.target.checked } } })} />
              <span>
                <strong>{g.name}</strong>
                <small>
                  {fmtNum(w * h, 0)} m², {fmtNum(g.depthM * 100, 0)} cm más bajo que la cuneta. Puede guardar cerca de {fmtNum(cap, 1)} m³ entre su charco y su suelo; además infiltra {COVERS.jardin_lluvia.ksMmH} mm/h.
                </small>
              </span>
            </label>
            {sim && sim.c.garden.some((q) => q === gi) && (
              <p className="city-small">
                Ahora: entraron {m3(sim.gardenIn[gi] ?? 0)}, rebosaron {m3(sim.gardenOut[gi] ?? 0)}.
              </p>
            )}
            <button type="button" className="link" onClick={() => ctrl.focus((g.polygon[0][0] + g.polygon[2][0]) / 2, (g.polygon[0][1] + g.polygon[2][1]) / 2)}>
              Ver en la maqueta
            </button>
          </div>
        );
      })}
    </section>
  );
}

function TankTool({ api }: { api: LabApi }) {
  const { ctrl, sc } = api;
  const sim = ctrl.displayed();
  return (
    <section className="tool-body" aria-label="Depósito">
      <h3>Depósito de agua lluvia</h3>
      <p className="city-small">Recoge la lluvia del techo. Cuando se llena, el agua sale por la bajante a la calle.</p>
      {sc!.tanks.map((t) => {
        const v = ctrl.ivB.tanks[t.id] ?? { on: false, destination: 'red' as const };
        const ti = sim ? sim.c.tanks.findIndex((q) => q.id === t.id) : -1;
        return (
          <div key={t.id} className="city-item">
            <label className="check">
              <input type="checkbox" checked={v.on} onChange={(e) => ctrl.update({ B: { ...ctrl.ivB, tanks: { ...ctrl.ivB.tanks, [t.id]: { ...v, on: e.target.checked } } } })} />
              <span>
                <strong>{t.name}</strong>
                <small>
                  Capacidad {fmtNum(t.capacityM3, 0)} m³ ({fmtNum(t.capacityM3 * 1000, 0)} litros).
                </small>
              </span>
            </label>
            {v.on && (
              <Segmented
                label="¿Qué hace con el agua?"
                value={v.destination}
                options={[
                  { value: 'red', label: `La entrega despacio a la red (${fmtNum(t.releaseLps, 1)} L/s)` },
                  { value: 'retener', label: 'La guarda para usarla' },
                ]}
                onChange={(d) => ctrl.update({ B: { ...ctrl.ivB, tanks: { ...ctrl.ivB.tanks, [t.id]: { on: true, destination: d } } } })}
              />
            )}
            {sim && ti >= 0 && (
              <p className="city-small">
                Ahora guarda {m3(sim.tankVol[ti])} de {fmtNum(t.capacityM3, 0)} m³. Rebose acumulado: {m3(sim.bal.tankOverflow)}.
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

const OBS = [
  { value: 0, label: 'Libre' },
  { value: 0.6, label: 'Parcial (60 %)' },
  { value: 0.9, label: 'Obstruido (90 %)' },
];

function DrainTool({ api }: { api: LabApi }) {
  const { ctrl, sc } = api;
  const sim = ctrl.displayed();
  return (
    <>
    {sc!.sewer && <SewerTool ctrl={ctrl} sc={sc!} />}
    <section className="tool-body" aria-label="Sumideros">
      <h3>Gestionar sumideros</h3>
      {sc!.sewer ? (
        <p className="city-small">Sumideros hipotéticos (no son infraestructura levantada de Medellín), ubicados con los criterios de EPM: en los puntos bajos y antes de los cruces peatonales. Captan según el agua junto al bordillo, su tipo y su obstrucción, mientras su caja no esté llena; si la red entra en carga, el sumidero devuelve agua a la calle.</p>
      ) : (
        <p className="city-small">Sumideros hipotéticos de 0,6 × 0,9 m: no son infraestructura levantada de Medellín. Captan según el agua disponible sobre la rejilla, su obstrucción y su capacidad.</p>
      )}
      {sc!.drains.map((d, di) => {
        const v = ctrl.ivB.drains[d.id] ?? d.obstruction;
        const now = sim && sim.lastDt > 0 ? sim.lastDrain[di] / sim.lastDt : 0;
        return (
          <div key={d.id} className="city-item">
            <Segmented label={d.name} value={OBS.reduce((b, o) => (Math.abs(o.value - v) < Math.abs(b - v) ? o.value : b), 0)} options={OBS} onChange={(o) => ctrl.update({ B: { ...ctrl.ivB, drains: { ...ctrl.ivB.drains, [d.id]: o } } })} />
            {v > 0 && (
              <button type="button" className="btn-ghost small" onClick={() => ctrl.update({ B: { ...ctrl.ivB, drains: { ...ctrl.ivB.drains, [d.id]: 0 } } })}>
                Restaurar (limpiar la rejilla)
              </button>
            )}
            {sim && !sim.sewer && (
              <p className="city-small">
                Capta ahora {lps(now)} · total {m3(sim.drainTotal[di])} · máximo {lps(sim.drainPeak[di])} (capacidad {fmtNum(d.capacityLps, 0)} L/s).
              </p>
            )}
            {sim && sim.sewer && (() => {
              const k = sim.sewer.s.inlets[di]?.node ?? -1;
              const back = k >= 0 ? sim.sewer.overflowTotal[k] : 0;
              const backNow = k >= 0 && sim.lastDt > 0 ? sim.sewer.lastOverflow[k] / sim.lastDt : 0;
              return (
                <p className="city-small">
                  {{ rejilla: 'Rejilla en la cuneta', ventana: `Ventana en el bordillo de ${fmtNum(d.windowLengthM ?? 1.5, 1)} m`, mixto: `Mixto: rejilla y ventana de ${fmtNum(d.windowLengthM ?? 1.5, 1)} m` }[d.type ?? 'rejilla']}. Capta ahora {lps(now)} · total {m3(sim.drainTotal[di])} · máximo {lps(sim.drainPeak[di])}.
                  {back > 0 && <strong> Devolvió {m3(back)} a la calle{backNow > 2e-4 ? ` (ahora ${lps(backNow)})` : ''}.</strong>}
                </p>
              );
            })()}
            <button type="button" className="link" onClick={() => ctrl.focus(d.at[0], d.at[1])}>
              Ver en la maqueta
            </button>
          </div>
        );
      })}
      {!sc!.sewer && (
        <button type="button" className="btn-ghost small" onClick={() => ctrl.setCut(!ctrl.cutOn())}>
          {ctrl.cutOn() ? 'Ocultar lo que hay bajo la calle' : 'Ver bajo la calle (tuberías esquemáticas)'}
        </button>
      )}
    </section>
    </>
  );
}

function TracerTool({ api }: { api: LabApi }) {
  const { ctrl } = api;
  const n = ctrl.tracers?.counts();
  return (
    <section className="tool-body" aria-label="Seguir el agua">
      <h3>Seguir el agua</h3>
      <p>Toca la maqueta para soltar 24 gotas trazadoras. Se mueven con la velocidad que calcula el modelo; no cambian la cantidad de agua.</p>
      {n && (
        <ul className="tracer-count">
          {(
            [
              ['agua', 'En movimiento', TRACER_COLORS.agua, '#2a78d6'],
              ['sumidero', 'Entraron a un sumidero', TRACER_COLORS.sumidero, null],
              ['suelo', 'Se infiltraron', TRACER_COLORS.suelo, null],
              ['salida', 'Salieron del sector', TRACER_COLORS.salida, null],
              ['deposito', 'Llegaron a un depósito', TRACER_COLORS.deposito, null],
            ] as const
          ).map(([k, label, color, ring]) => (
            <li key={k}>
              <span className="dot" style={{ background: color, boxShadow: ring ? `inset 0 0 0 2px ${ring}` : undefined }} aria-hidden="true" /> {label}: <strong>{n[k]}</strong>
            </li>
          ))}
        </ul>
      )}
      {(() => {
        const j = ctrl.tracers?.journeys();
        if (!j) return null;
        const rows = (['sumidero', 'suelo', 'salida', 'deposito', 'agua'] as const).filter((k) => j[k].n > 0);
        if (!rows.length) return null;
        const name = { agua: 'Siguen en movimiento', sumidero: 'Llegaron a un sumidero', suelo: 'Se infiltraron', salida: 'Salieron del sector', deposito: 'Llegaron a un depósito' } as const;
        return (
          <div className="tracer-journeys">
            <h4>El viaje de las gotas</h4>
            <ul>
              {rows.map((k) => (
                <li key={k}>
                  <span className="dot" style={{ background: k === 'agua' ? TRACER_TRAIL_MOVING : TRACER_COLORS[k] }} aria-hidden="true" /> {name[k]}: en promedio <strong>{fmtNum(j[k].dist, 0)}&nbsp;m</strong> {k === 'agua' ? 'recorridos en' : 'en'} <strong>{fmtDuration(Math.round(j[k].time / 10) * 10)}</strong>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
      <p className="city-small">En cada tanda, una gota guía lleva una cinta más gruesa con pulsos que avanzan hacia ella y una etiqueta con lo que ha recorrido. Las demás muestran cómo se abre el grupo. Al llegar, cada gota deja una marca con ícono y el color de su destino, los mismos de «¿Adónde fue la lluvia?». El anillo punteado marca dónde soltaste las gotas.</p>
      <p className="city-small">Si una gota cae en un techo, baja por la bajante. Si el agua está casi quieta, la gota también. Lo que pasa detrás de un edificio se ve tenue.</p>
      <button type="button" className="btn-ghost small" onClick={() => ctrl.clearTracers()}>
        Borrar gotas
      </button>
    </section>
  );
}

function MeasureTool({ api }: { api: LabApi }) {
  const { ctrl } = api;
  const sim = ctrl.displayed();
  const series: Series[] = [];
  if (sim && ctrl.probe) series.push({ id: 'medidor', name: 'Tu medidor', color: COLOR_B, points: sim.samples.filter((s) => s.extra).map((s) => [s.t / 60, s.extra![0] * 100]) });
  const speed: Series[] = [];
  if (sim && ctrl.probe) speed.push({ id: 'vel', name: 'Velocidad', color: '#7a4fb3', points: sim.samples.filter((s) => s.extra).map((s) => [s.t / 60, s.extra![1]]) });
  return (
    <section className="tool-body" aria-label="Medir">
      <h3>Medir</h3>
      <p>Toca la maqueta para colocar tu medidor. Registra la profundidad cada 10 segundos de simulación desde que lo colocas.</p>
      {ctrl.probe ? (
        <>
          <LineChart title="Profundidad en tu medidor" series={series} fmtY={(v) => `${fmtNum(v, 1)} cm`} yUnit="centímetros" marker={{ x: ctrl.shared.rain.durationMin, label: 'fin de la lluvia' }} />
          <LineChart title="Velocidad del agua en tu medidor (calculada por el modelo)" series={speed} fmtY={(v) => `${fmtNum(v, 2)} m/s`} yUnit="metros por segundo" height={120} />
          <button type="button" className="btn-ghost small" onClick={() => ctrl.setProbe(null)}>
            Quitar medidor
          </button>
        </>
      ) : (
        <p className="city-small">Aún no hay medidor.</p>
      )}
      <h4>Medidores fijos</h4>
      <ul className="probe-list">
        {sim?.c.probes.map((p, q) => (
          <li key={p.id}>
            <button type="button" className="link" onClick={() => ctrl.focus(((p.cell % sim.c.nx) + 0.5) * sim.c.dx, (Math.floor(p.cell / sim.c.nx) + 0.5) * sim.c.dx)}>
              {p.name}
            </button>
            : ahora {fmtDepth(sim.h[p.cell])}, máximo {fmtDepth(sim.probeMax[q].depth)}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------------ comparación

function diffList(sc: Scenario, a: Interventions, b: Interventions): string[] {
  const out: string[] = [];
  for (const z of sc.zones) if ((a.zones[z.id] ?? z.cover) !== (b.zones[z.id] ?? z.cover)) out.push(`${z.name}: ${coverName(a.zones[z.id] ?? z.cover)} → ${coverName(b.zones[z.id] ?? z.cover)}`);
  for (const g of sc.gardens) if (!!a.gardens[g.id] !== !!b.gardens[g.id]) out.push(`${g.name}: ${b.gardens[g.id] ? 'construido en B' : 'solo en A'}`);
  for (const t of sc.tanks) {
    const ta = a.tanks[t.id], tb = b.tanks[t.id];
    if (JSON.stringify(ta) !== JSON.stringify(tb)) out.push(`${t.name}: ${tb?.on ? (tb.destination === 'red' ? 'entrega a la red' : 'guarda el agua') : 'sin depósito'} en B`);
  }
  for (const d of sc.drains) if ((a.drains[d.id] ?? 0) !== (b.drains[d.id] ?? 0)) out.push(`${d.name}: obstrucción ${fmtNum((a.drains[d.id] ?? 0) * 100, 0)} % → ${fmtNum((b.drains[d.id] ?? 0) * 100, 0)} %`);
  for (const cu of sc.culverts ?? []) {
    const ca = a.culverts?.[cu.id], cb = b.culverts?.[cu.id];
    if (JSON.stringify(ca) !== JSON.stringify(cb)) out.push(`${cu.name}: ${culvertStateText(ca)} → ${culvertStateText(cb)}`);
  }
  return out;
}


export function ResultTable({ api }: { api: LabApi }) {
  const { ctrl } = api;
  const ind = ctrl.indicators();
  if (!ind.A || !ind.B) return null;
  const a = ind.A, b = ind.B;
  const hasGarden = !!ctrl.pair && (ctrl.pair.ca.garden.some((g) => g >= 0) || ctrl.pair.cb.garden.some((g) => g >= 0));
  const row = (label: string, va: number, vb: number, f: (v: number) => string, eps: number) => {
    const ch = change(va, vb, eps);
    return (
      <tr key={label}>
        <th scope="row">{label}</th>
        <td>{f(va)}</td>
        <td>{f(vb)}</td>
        <td>{ch.pct === null ? ch.note : Math.abs(ch.pct) < 0.5 ? 'casi igual' : `${ch.pct > 0 ? '+' : '−'}${fmtNum(Math.abs(ch.pct), 0)} %`}</td>
      </tr>
    );
  };
  return (
    <table className="city-table">
      <caption>
        Resultados a los {fmtTime(Math.min(a.t, b.t))} min de simulación{ctrl.status === 'terminado' ? ' (final)' : ' (en curso)'}
      </caption>
      <thead>
        <tr>
          <th scope="col">Indicador</th>
          <th scope="col">A</th>
          <th scope="col">B</th>
          <th scope="col">Cambio de B</th>
        </tr>
      </thead>
      <tbody>
        {row('Lluvia caída', a.precipitation, b.precipitation, m3, 1e-3)}
        {row('Infiltrado', a.infiltrated, b.infiltrated, m3, 1e-3)}
        {row('Drenado (red)', a.drained, b.drained, m3, 1e-3)}
        {row('En depósitos', a.devices, b.devices, m3, 1e-3)}
        {row('En la superficie ahora', a.surfaceEnd, b.surfaceEnd, m3, 1e-3)}
        {row('Salida por el borde', a.boundaryOut, b.boundaryOut, m3, 1e-3)}
        {row('Caudal pico de salida', a.peakOutlet, b.peakOutlet, lps, 1e-5)}
        {row(`Área con ≥ ${fmtNum(a.threshold * 100, 0)} cm (máx.)`, a.maxAreaAbove, b.maxAreaAbove, (v) => `${fmtNum(v, 0)} m²`, 0.5)}
        {a.probeMax.map((p, q) => (p.id.startsWith('jardin') && !hasGarden ? null : row(`Máx. en «${p.name}»`, p.depth, b.probeMax[q].depth, fmtDepth, 0.0005)))}
        {a.culverts.map((cu, q) => (
          <Fragment key={cu.id}>
            {row(`${cu.name}: caudal máx. por los cajones`, cu.qMax, b.culverts[q].qMax, (v) => `${fmtNum(v, 1)} m³/s`, 0.05)}
            {row(`${cu.name}: caudal máx. sobre la vía`, cu.overMax, b.culverts[q].overMax, (v) => `${fmtNum(v, 1)} m³/s`, 0.05)}
            {row(`${cu.name}: agua que pasó sobre la vía`, cu.overVol, b.culverts[q].overVol, m3, 1)}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

export function CompareCharts({ api }: { api: LabApi }) {
  const { ctrl } = api;
  if (!ctrl.pair) return null;
  const { a, b } = ctrl.pair;
  const q: Series[] = [
    { id: 'A', name: 'A', color: COLOR_A, dash: true, points: a.samples.map((s) => [s.t / 60, s.outletQ * 1000]) },
    { id: 'B', name: 'B', color: COLOR_B, points: b.samples.map((s) => [s.t / 60, s.outletQ * 1000]) },
  ];
  const pi = Math.max(0, a.c.probes.findIndex((p) => p.id === 'esquina'));
  const d: Series[] = [
    { id: 'A', name: 'A', color: COLOR_A, dash: true, points: a.samples.map((s) => [s.t / 60, (s.probes[pi] ?? 0) * 100]) },
    { id: 'B', name: 'B', color: COLOR_B, points: b.samples.map((s) => [s.t / 60, (s.probes[pi] ?? 0) * 100]) },
  ];
  const marker = { x: ctrl.shared.rain.durationMin, label: 'fin de la lluvia' };
  return (
    <>
      <LineChart title="Caudal que sale por el borde bajo (hidrograma)" series={q} fmtY={(v) => `${fmtNum(v, 0)} L/s`} yUnit="litros por segundo" marker={marker} />
      <LineChart title={`Profundidad en «${a.c.probes[pi]?.name ?? ''}»`} series={d} fmtY={(v) => `${fmtNum(v, 1)} cm`} yUnit="centímetros" marker={marker} />
    </>
  );
}

export function CompareTab({ api }: { api: LabApi }) {
  const { ctrl, sc } = api;
  if (!sc) return <p>Elige primero un sector.</p>;
  const diffs = diffList(sc, ctrl.ivA, ctrl.ivB);
  const same = ctrl.pair?.sameConditions();
  return (
    <div className="city-compare">
      <p>
        Compara dos versiones del mismo barrio con <strong>exactamente la misma lluvia</strong>, el mismo estado inicial, el mismo tiempo y los mismos bordes. Solo cambia lo que hiciste en B.
      </p>
      <div className="ab-cards">
        <div className="ab-card">
          <h3>A · referencia</h3>
          <p className="city-small">{diffList(sc, baseInterventions(sc), ctrl.ivA).join('; ') || 'Barrio como está.'}</p>
          <button type="button" className="link" onClick={() => ctrl.update({ A: baseInterventions(sc) })}>
            Restablecer A
          </button>{' '}
          ·{' '}
          <button type="button" className="link" onClick={() => ctrl.update({ A: cloneInterventions(ctrl.ivB) })}>
            Copiar B en A
          </button>
        </div>
        <div className="ab-card is-b">
          <h3>B · tu barrio</h3>
          {diffs.length ? (
            <ul className="city-small">
              {diffs.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="city-small">Aún igual que A. Usa las herramientas para cambiar algo.</p>
          )}
        </div>
      </div>
      <p className="city-fact">
        Lluvia: {fmtNum(ctrl.shared.rain.intensityMmH, 0)} mm/h durante {ctrl.shared.rain.durationMin} min ({ctrl.shared.rain.spatial === 'uniforme' ? 'en todo el sector' : 'localizada'}); se simulan {ctrl.shared.simMinutes} min; celdas de {fmtNum(ctrl.shared.dx, 1)} m.
      </p>
      <Pending api={api} />
      <div className="btn-row">
        {!ctrl.compare ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              ctrl.setCompare(true);
              ctrl.start();
            }}
          >
            Comparar A y B
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => (ctrl.status === 'corriendo' ? ctrl.runToEnd(4000) : (ctrl.reset(), ctrl.start()))}>
              {ctrl.status === 'corriendo' ? 'Ver el resultado ya' : 'Repetir la comparación'}
            </button>
            <button type="button" className="btn-ghost small" onClick={() => ctrl.setCompare(false)}>
              Volver a una sola corrida
            </button>
          </>
        )}
      </div>
      {same && (
        <Disclosure title={same.ok ? 'Condiciones iguales en A y B: verificado' : 'Atención: las condiciones no son iguales'}>
          <ul className="check-list">
            {same.items.map((i) => (
              <li key={i.label} className={i.ok ? 'ok' : 'bad'}>
                {i.ok ? '✓' : '✗'} {i.label}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {ctrl.pair && (
        <>
          <Segmented label="La maqueta muestra" value={ctrl.show} options={[{ value: 'A', label: 'A · referencia' }, { value: 'B', label: 'B · tu barrio' }]} onChange={(v) => ctrl.setShow(v)} help="Mismo encuadre y misma escala de color en ambos." />
          <ResultTable api={api} />
          <div className="rb-pair">
            <RainBudget bal={ctrl.pair.a.bal} title="A · ¿adónde fue la lluvia?" />
            <RainBudget bal={ctrl.pair.b.bal} title="B · ¿adónde fue la lluvia?" />
          </div>
          <CompareCharts api={api} />
          <p className="city-small">Los porcentajes se calculan respecto de A. Cuando A es casi cero no se calcula porcentaje: se muestra la diferencia.</p>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ misiones

export function MissionsTab({ api }: { api: LabApi }) {
  const { mission } = api;
  if (mission) return <MissionView api={api} />;
  return (
    <div className="city-missions">
      <p>Misiones cortas: haz una pregunta, predice, cambia algo y explica lo que pasó. Los resultados salen del cálculo, no están escritos de antemano.</p>
      <ol className="mission-list">
        {MISSIONS.map((m) => {
          const p = api.saved.missions[m.id];
          const sc = allScenarios()[m.scenarioId];
          return (
            <li key={m.id}>
              <button type="button" className="mission-card" onClick={() => api.setMission({ id: m.id, step: 0, prediction: p?.prediction ?? null, running: false })}>
                <strong>{m.title}</strong>
                <span>{sc?.shortTitle}</span>
                {p?.done && <span className="badge">Hecha</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BudgetPicker({ api, sel, setSel }: { api: LabApi; sel: string[]; setSel: (s: string[]) => void }) {
  const sc = allScenarios()['ladera-quebrada'];
  const items = useMemo(() => budgetItems(sc), [sc]);
  const used = items.filter((i) => sel.includes(i.id)).reduce((s, i) => s + i.cost, 0);
  const toggle = (id: string) => {
    const it = items.find((i) => i.id === id)!;
    let next = sel.includes(id) ? sel.filter((q) => q !== id) : [...sel.filter((q) => !(it.kind === 'zona' && q.startsWith(`zona:${it.target}:`))), id];
    const cost = items.filter((i) => next.includes(i.id)).reduce((s, i) => s + i.cost, 0);
    if (cost > BUDGET) next = sel;
    setSel(next);
    api.setSaved((s) => ({ ...s, budget: { ...s.budget, presupuesto: next } }));
  };
  return (
    <div className="budget">
      <p className="budget-meter" role="status">
        Puntos usados: <strong>{used}</strong> de {BUDGET} (puntos del juego, no dinero).
      </p>
      <ul>
        {items.map((i) => {
          const on = sel.includes(i.id);
          const can = on || used + i.cost <= BUDGET;
          return (
            <li key={i.id}>
              <label className={`check${can ? '' : ' is-off'}`}>
                <input type="checkbox" checked={on} disabled={!can} onChange={() => toggle(i.id)} />
                <span>
                  {i.label} <small>{i.cost} puntos</small>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MissionView({ api }: { api: LabApi }) {
  const { mission, ctrl } = api;
  const { dispatch } = useStore();
  const m = MISSIONS.find((q) => q.id === mission!.id)!;
  const [sel, setSel] = useState<string[]>(api.saved.budget.presupuesto ?? []);
  const set = (patch: Partial<MissionUi>) => api.setMission({ ...mission!, ...patch });
  const inSector = ctrl.sc?.id === m.scenarioId;
  const ind = ctrl.indicators();
  const finished = mission!.step === 3 && ctrl.status === 'terminado' && ctrl.sc?.id === m.scenarioId;
  const result = finished ? m.evaluate(m.change.kind === 'ninguno' ? ind.B! : ind.A!, m.change.kind === 'ninguno' ? null : ind.B, ctrl.sc!) : null;
  const pred = m.options.find((o) => o.id === mission!.prediction);
  const outcome = result ? m.options.find((o) => o.id === result.outcome) : null;
  return (
    <article className="city-mission" aria-labelledby="mission-title">
      <button type="button" className="link" onClick={() => api.setMission(null)}>
        ← Todas las misiones
      </button>
      <h2 id="mission-title">{m.title}</h2>
      <ol className="mission-steps" aria-label="Pasos de la misión">
        {['Pregunta', 'Predicción', 'Cambio', 'Explicación'].map((s, i) => (
          <li key={s} className={i === mission!.step ? 'is-on' : i < mission!.step ? 'is-done' : ''} aria-current={i === mission!.step ? 'step' : undefined}>
            {s}
          </li>
        ))}
      </ol>
      {mission!.step === 0 && (
        <>
          <p className="mission-q">{m.question}</p>
          <p>{m.context}</p>
          {!inSector && (
            <button type="button" className="btn-ghost small" onClick={() => api.goSector(m.scenarioId)}>
              Ir al sector «{allScenarios()[m.scenarioId].shortTitle}»
            </button>
          )}
          <button type="button" className="btn" onClick={() => set({ step: 1 })}>
            Hacer mi predicción
          </button>
        </>
      )}
      {mission!.step === 1 && (
        <>
          <p className="mission-q">{m.question}</p>
          <fieldset className="city-fieldset">
            <legend>Mi predicción</legend>
            {m.options.map((o) => (
              <label key={o.id} className={`cover-opt${mission!.prediction === o.id ? ' is-on' : ''}`}>
                <input type="radio" name="pred" checked={mission!.prediction === o.id} onChange={() => set({ prediction: o.id })} />
                <span>{o.text}</span>
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="btn"
            disabled={!mission!.prediction}
            onClick={() => {
              api.setSaved((s) => ({ ...s, missions: { ...s.missions, [m.id]: { ...(s.missions[m.id] ?? { done: false }), prediction: mission!.prediction! } } }));
              dispatch({ type: 'log', entry: { id: `med-pred-${m.id}`, kind: 'prediccion', title: `Medellín · ${m.title}`, text: `${m.question} Mi predicción: ${m.options.find((o) => o.id === mission!.prediction)?.text}.` } });
              set({ step: 2 });
            }}
          >
            Guardar mi predicción
          </button>
        </>
      )}
      {mission!.step === 2 && (
        <>
          <p>{m.change.describe}</p>
          {m.change.kind === 'presupuesto' && <BudgetPicker api={api} sel={sel} setSel={setSel} />}
          <p className="city-small">
            {m.change.kind === 'ninguno'
              ? `Se simulará una lluvia de ${m.rain.intensityMmH} mm/h durante ${m.rain.durationMin} min.`
              : `A y B recibirán exactamente la misma lluvia: ${m.rain.intensityMmH} mm/h durante ${m.rain.durationMin} min, y se simulan ${m.simMinutes} min.`}
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              api.runMission(m, sel);
              set({ step: 3, running: true });
            }}
          >
            {m.change.kind === 'ninguno' ? 'Que llueva' : 'Hacer el cambio y comparar'}
          </button>
        </>
      )}
      {mission!.step === 3 && !finished && (
        <div role="status">
          <p>Calculando… mira la maqueta: {m.change.kind === 'ninguno' ? 'la lluvia está cayendo.' : 'puedes alternar entre A y B en la pestaña «Comparar».'}</p>
          <p className="city-small">Tiempo simulado: {fmtTime(ctrl.displayed()?.t ?? 0)} de {m.simMinutes}:00.</p>
          <button type="button" className="btn-ghost small" onClick={() => ctrl.runToEnd(6000)}>
            Ver el resultado ya
          </button>
        </div>
      )}
      {result && (
        <section className="city-mission-result" aria-live="polite">
          <h3>Lo que calculó el modelo</h3>
          <ul>
            {result.observed.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
          <p className={`verdict ${outcome && pred && outcome.id === pred.id ? 'is-match' : 'is-diff'}`}>
            {pred ? `Tu predicción: «${pred.text}». ` : ''}
            {outcome ? (pred && outcome.id === pred.id ? 'Coincide con lo calculado.' : `El modelo mostró: «${outcome.text}».`) : 'Ninguna opción describe exactamente el resultado.'}
          </p>
          {result.rows.length > 0 && (
            <table className="city-table">
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">A</th>
                  <th scope="col">B</th>
                  <th scope="col">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td>{r.a}</td>
                    <td>{r.b}</td>
                    <td>{r.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3>¿Por qué?</h3>
          <p>{m.explain}</p>
          {result.caveat && <p className="city-note">{result.caveat}</p>}
          <p className="city-small">Palabras clave: {m.terms.map((t) => GLOSSARY.find((g) => g.id === t)?.term ?? t).join(', ')}.</p>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                dispatch({ type: 'log', entry: { id: `med-res-${m.id}`, kind: 'explicacion', title: `Medellín · ${m.title}`, text: `${result.observed.join(' ')} ${m.explain}` } });
                if (pred) dispatch({ type: 'logOutcome', id: `med-pred-${m.id}`, outcome: outcome && outcome.id === pred.id ? 'coincide' : 'distinta' });
              }}
            >
              Guardar en mi bitácora
            </button>
            <button type="button" className="btn-ghost small" onClick={() => api.setMission(null)}>
              Otra misión
            </button>
          </div>
          <MissionDone api={api} id={m.id} outcome={result.outcome} />
        </section>
      )}
    </article>
  );
}

function MissionDone({ api, id, outcome }: { api: LabApi; id: string; outcome: string | null }) {
  const p = api.saved.missions[id];
  if (!p?.done || p.outcome !== outcome) {
    queueMicrotask(() => api.setSaved((s) => ({ ...s, missions: { ...s.missions, [id]: { ...(s.missions[id] ?? {}), done: true, outcome } } })));
  }
  return null;
}

// ------------------------------------------------------------------ palabras clave

const WORDS = ['escorrentia', 'infiltracion', 'caudal', 'rugosidad', 'almacenamiento-superficial', 'sumidero', 'lamina-de-agua', 'balance-hidrico', 'pavimento-permeable', 'jardin-de-lluvia', 'sistema-separado', 'alcantarillado-sanitario', 'camara-de-inspeccion', 'conexion-errada', 'sobrecarga', 'creciente', 'capacidad-hidraulica', 'retiro-de-quebrada', 'avenida-torrencial', 'peligro-de-inundacion', 'cobertura-de-quebrada', 'represamiento', 'cuenca', 'alerta-temprana'];
const STEP_FOR: Record<string, string> = { escorrentia: 'escorrentia', infiltracion: 'infiltracion', 'almacenamiento-superficial': 'almacenamiento', caudal: 'escorrentia' };

export function WordsTab() {
  const { dispatch } = useStore();
  return (
    <div className="city-words">
      <p>Palabras para explicar lo que ves en la maqueta. También están en el glosario del ciclo del agua.</p>
      <dl>
        {WORDS.map((id) => {
          const g = GLOSSARY.find((q) => q.id === id);
          if (!g) return null;
          const step = STEP_FOR[id] ? STEPS.findIndex((s) => s.id === STEP_FOR[id]) : -1;
          return (
            <div key={id} className="word">
              <dt>{g.term}</dt>
              <dd>
                {g.def}
                {step >= 0 && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      dispatch({ type: 'mode', mode: 'guided' });
                      dispatch({ type: 'step', index: step });
                    }}
                  >
                    Verlo en el recorrido del ciclo del agua
                  </button>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="city-small">Al abrir el recorrido sales del laboratorio; tu configuración queda guardada en este dispositivo.</p>
    </div>
  );
}

// ------------------------------------------------------------------ docente

function Sec({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <Disclosure title={title} defaultOpen={open}>
      {children}
    </Disclosure>
  );
}

export function TeacherTab({ api }: { api: LabApi }) {
  const { ctrl, sc, caps } = api;
  const [quick, setQuick] = useState<QuickResult[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const sim = ctrl.displayed();
  const b = sim?.bal;
  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data?.format === 'medellin-lluvia/escenario') {
        const v = validateScenario(data);
        if (!v.ok) return setMsg(`Escenario rechazado: ${v.errors.join(' ')}`);
        registerScenario(data);
        setMsg(`Escenario «${data.title}» cargado. Ábrelo desde el valle.`);
        return;
      }
      const v = validateConfig(data, allScenarios());
      if (!v.ok || !v.config) return setMsg(`Configuración rechazada: ${v.errors.join(' ')}`);
      api.goSector(v.config.shared.scenarioId);
      api.setSaved((s) => ({ ...s, configs: { ...s.configs, [v.config!.shared.scenarioId]: v.config! } }));
      setMsg('Configuración importada y validada.');
    } catch {
      setMsg('El archivo no es un JSON válido.');
    }
  };
  return (
    <div className="city-teacher">
      <p className="city-note">
        Laboratorio educativo. <strong>No es un pronóstico oficial de inundaciones</strong> y sus intervenciones <strong>no son diseños de ingeniería</strong>.
      </p>
      {sc && (
        <Sec title="Datos y procedencia del sector" open>
          <p>{sc.provenance.statement}</p>
          <ul className="prov">
            {sc.provenance.layers.map((l) => (
              <li key={l.layer}>
                <span className={`kind kind-${l.kind}`}>{{ real: 'dato real', estimado: 'parámetro estimado', didactico: 'elemento didáctico', hipotetico: 'infraestructura hipotética' }[l.kind]}</span> <strong>{l.layer}</strong>: {l.note}
              </li>
            ))}
          </ul>
          <p className="city-small">Sistema de referencia: {sc.extent.crs === 'LOCAL' ? 'coordenadas locales en metros (escenario sin georreferencia)' : `${sc.extent.crs}, origen ${sc.extent.origin.join(', ')}`}. Terreno: {sc.terrain.datum}.</p>
          <p className="city-small">
            Alrededor de la maqueta (solo dibujo, no entra en el cálculo): el Valle de Aburrá a escala real con cotas y trazados <strong>aproximados</strong> (río, metro, metrocables, cerros, quebradas y barrios). {sc.extent.lonLat ? 'El sector se ubica en su longitud y latitud.' : 'La ubicación del sector en el valle es ilustrativa.'} Fachadas, avisos de locales, postes, cables, motos y ropa tendida son ambientación: no son construcciones ni redes reales. Con la lluvia, la bruma, las nubes bajas, las luces encendidas, el velo de lluvia y el brillo de las superficies mojadas también son ambientación; el agua que cuenta es la que tiene color en la leyenda (color natural o, con «Agua en azul», la escala azul).
          </p>
        </Sec>
      )}
      {sim && b && (
        <Sec title="Balance de agua (volumen de control: todo el sector, incluidos techos)" open>
          <table className="city-table">
            <tbody>
              <tr><th scope="row">Precipitación (incluye techos)</th><td>{m3(b.precipitation)}</td></tr>
              <tr><th scope="row">Entrada externa</th><td>{m3(b.inflow)}</td></tr>
              <tr><th scope="row">Devuelto por la red</th><td>{m3(b.returned)}</td></tr>
              <tr><th scope="row">Δ almacenamiento superficial</th><td>{m3(b.surface - b.surface0)}</td></tr>
              <tr><th scope="row">Infiltrado</th><td>{m3(b.infiltrated)}</td></tr>
              <tr><th scope="row">Almacenado en depósitos</th><td>{m3(b.devices)}</td></tr>
              <tr><th scope="row">Drenado (aceptado por la red)</th><td>{m3(b.drained)}</td></tr>
              <tr><th scope="row">Salida por bordes</th><td>{m3(b.boundaryOut)}</td></tr>
              {b.sewer && (
                <>
                  <tr><th scope="row">Red: aguas residuales y aportes de aguas arriba</th><td>{m3(b.sewageIn)}</td></tr>
                  <tr><th scope="row">Red: salida por los colectores</th><td>{m3(b.netOut)}</td></tr>
                  <tr><th scope="row">Red: agua guardada en tuberías y cámaras</th><td>{m3(b.network)}</td></tr>
                  <tr><th scope="row">Residuo de la red</th><td>{b.netResidual.toExponential(2)} m³</td></tr>
                </>
              )}
              <tr><th scope="row">Residuo numérico</th><td>{b.residual.toExponential(2)} m³ ({b.precipitation > 0 ? `${(Math.abs(b.residual / b.precipitation) * 100).toExponential(1)} % de P` : '—'})</td></tr>
              <tr><th scope="row">Corrección de negativos por redondeo</th><td>{b.clipped.toExponential(2)} m³</td></tr>
            </tbody>
          </table>
          <p className="city-small">Residuo = P + entrada + devuelto − (ΔS + infiltrado + depósitos + drenado + salida). Se muestra tal como resulta, sin ajustes. Lluvia de techos: {m3(b.roofToSurface)} a bajantes, {m3(b.roofToTank)} a depósitos, {m3(b.tankOverflow)} de rebose.</p>
        </Sec>
      )}
      {sc?.sewer && sim && (
        <Sec title="Alcantarillado: criterios de la norma de EPM revisados">
          <SewerTeacher sc={sc} c={sim.c} />
        </Sec>
      )}
      <Sec title="Modelo y supuestos">
        <ul>
          <li>{ENGINE.method} No es la solución completa de Saint-Venant: se desprecia la advección de momento.</li>
          <li>Paso de tiempo adaptativo dt = {NUMERICS.alpha}·dx/(√(g·h) + |u|), máximo {NUMERICS.dtMax} s; ponderación θ = {NUMERICS.theta}; número de Froude limitado a {NUMERICS.froudeMax}.</li>
          <li>Limitador de positividad: ninguna celda entrega más agua de la que tiene. Profundidades &lt; 0,1 mm no fluyen (actúa como retención superficial mínima).</li>
          <li>Edificios: celdas sólidas que bloquean el flujo. La lluvia de techo va a su bajante (o depósito) en el mismo paso, sin almacenamiento en el techo.</li>
          <li>Infiltración: capacidad constante limitada por el agua disponible y por un almacenamiento máximo por cobertura (sin redistribución en el suelo durante el evento).</li>
          {sc?.sewer ? (
            <>
              <li>Sumideros por tipo (EPM GD-AS002, 8.5): rejilla en la cuneta como vertedero/orificio (HEC-22, C = 1,66 y 0,67); ventana en el bordillo Q = k·L·√g·y^1,5 en pendiente (k = 0,20 a 0,23) o Q = 1,65·L·y^1,5 en punto bajo; mixto = suma. La profundidad junto al bordillo se reconstruye con la pendiente transversal de la cuneta (2 %, hipotética). Captan mientras su caja no esté llena.</li>
              <li>Red separada (drenaje dual 1D–2D): tuberías circulares con la aproximación inercial local y fricción de Manning semi-implícita; cámaras y cajas con su área en planta más la mitad del espejo de las tuberías; sobrecarga a presión; el agua por encima de la tapa sale a la calle. Descarga a la quebrada con el nivel de la quebrada (remanso); descarga libre al colector fuera del sector.</li>
            </>
          ) : (
            <>
              <li>Sumideros: vertedero/orificio (HEC-22, C = 1,66 y 0,67), con profundidad junto al bordillo reconstruida con una pendiente transversal de cuneta del 2 % (hipotética), limitados por capacidad (40 L/s), obstrucción y agua disponible.</li>
              <li>Red de drenaje esquemática: colector con capacidad total de 250 L/s; no se resuelve la hidráulica de tuberías ni se simula sobrecarga. Interfaz lista para conectar SWMM.</li>
            </>
          )}
          {sc?.creek && <li>Creciente: hidrograma triangular (subida tp, bajada 1,67·tp; SCS) que entra por la quebrada sobre un caudal base; su volumen entra completo. Con lodo, el caudal de la mezcla es el del agua por 1/(1 − Cv) (Cv ≤ 30 %); la mezcla se mueve como agua: no se simula la reología del lodo, la erosión ni el golpe de piedras y troncos. La capacidad de la sección de control se calcula con la regla de caras del modelo (Manning limitado por Froude ≤ {NUMERICS.froudeMax}) hasta la orilla más baja.</li>}
          <li>Peligro: en cada paso y cada celda con 1 cm o más se clasifica la profundidad y la velocidad (la de la celda, limitada con el mismo Froude del cálculo) con las curvas H1–H6 de {HAZARD_SOURCE}; se guarda la clase máxima. Es una referencia técnica publicada para enseñar el concepto, no la zonificación oficial de amenaza de Medellín.</li>
          {sc?.creek?.basin && <li>Creciente desde la lluvia en la cuenca (opción de la herramienta «Creciente»): la misma lluvia del barrio cae en una cuenca didáctica de {fmtNum(sc.creek.basin.areaKm2, 0)} km² (longitud hidráulica {fmtNum(sc.creek.basin.lengthM / 1000, 1)} km, pendiente {fmtNum(sc.creek.basin.slopePct, 0)} %). Escorrentía por número de curva del NRCS (bosque 70, mixta 80, urbanizada 90; con suelo húmedo, condición III), retardo con la ecuación del NRCS e hidrograma unitario triangular (tp = Δt/2 + tL; qp = 0,208·A·Q/tp; base 2,67·tp) convolucionado minuto a minuto. La estación de nivel está {fmtNum(sc.creek.basin.gauge.distanceM / 1000, 1)} km aguas arriba: ve el mismo caudal {fmtNum(sc.creek.basin.gauge.distanceM / sc.creek.basin.gauge.celerityMs / 60, 0)} min antes (onda a {fmtNum(sc.creek.basin.gauge.celerityMs, 0)} m/s, sin atenuación). Umbrales didácticos: aviso por lluvia con 20 mm en 30 min; alertas con 40 %, 70 % y 100 % de la capacidad del cauce. El tiempo de aviso es el que pasa entre la alerta y el primer momento en que el agua llega a 10 cm junto a una edificación en el cálculo 2D.</li>}
          {(sc?.culverts?.length ?? 0) > 0 && <li>Cobertura bajo la carrera: enlace entre la celda de entrada y la de salida con las ecuaciones de alcantarillas de la guía HDS-5 de la FHWA (control de entrada de forma 1 para cajón con aletas de 30° a 75°; control de salida con el cañón lleno y h₀ = máx(nivel aguas abajo, (dc + D)/2)); pasa el menor de los dos. El enlace es implícito (el caudal se evalúa con los niveles del final del paso) y tiene la inercia del agua en los cajones; nunca cambia de sentido dentro de un paso. Los troncos se representan como una reducción del ancho útil; «se tapa con la creciente» empieza cuando el caudal pasa de la mitad de la capacidad libre y llega al 90 % en 3 minutos. El agua que no cabe sube y pasa por encima de la vía con el cálculo 2D. Simplificación: no se calcula el remanso dentro del cañón cuando va parcialmente lleno.</li>}
          {sc?.creek && <li>Daños: una edificación está afectada si junto a sus muros (las celdas vecinas) el agua llega a 10 cm o más; su peligro es el máximo de esas celdas. Las casas son sólidas en el cálculo: el agua no entra, de modo que la profundidad contra la fachada indica hasta dónde llegaría adentro si hubiera aberturas.</li>}
          {(sim?.c.exposed.length ?? 0) > 0 && <li>Vehículos: quietos mientras el peligro donde están sea menor que H2 (inseguro para vehículos pequeños); por encima, el agua los mueve con el 80 % de su velocidad; se detienen contra los edificios y donde el peligro vuelve a bajar. No alteran el flujo y su trayectoria es ilustrativa.</li>}
          {sc?.creek && <li>Dibujo de la creciente: troncos, ramas y basura flotantes son ilustrativos (entran con la creciente, se mueven con la velocidad calculada y quedan donde el agua se vuelve somera); la salpicadura contra los muros sube hasta la carga de velocidad v²/2g; la marca en las fachadas llega a la profundidad máxima calculada en la celda vecina; el puente peatonal no obstruye el agua en el cálculo y su rótulo compara el nivel calculado con su viga y su tablero; en la cobertura, la cantidad de troncos dibujados sigue la obstrucción calculada y flotan al nivel calculado en la entrada, y la baranda es abierta (no detiene el agua en el cálculo).</li>}
          <li>Salidas: condición de profundidad normal con la pendiente declarada, acotada por el caudal crítico. Demás bordes cerrados.</li>
          <li>Unidades: R [m/s] = mm/h ÷ 3 600 000. Volúmenes en m³, caudales en L/s.</li>
          <li>Partículas de lluvia y cabinas del cable son decorativas y no alteran el volumen. Las gotas trazadoras se mueven con la velocidad calculada.</li>
        </ul>
      </Sec>
      <Sec title="Parámetros por cobertura (estimados)">
        <table className="city-table small">
          <thead>
            <tr>
              <th scope="col">Cobertura</th>
              <th scope="col">n</th>
              <th scope="col">Infiltración</th>
              <th scope="col">Almacen.</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(COVERS).map((c) => (
              <tr key={c.id} title={c.basis}>
                <th scope="row">{c.name}</th>
                <td>{c.manning}</td>
                <td>{c.ksMmH} mm/h</td>
                <td>{fmtNum(c.storageM * 100, 0)} cm</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="city-small">
          {Object.values(COVERS).map((c) => (
            <li key={c.id}>
              <strong>{c.name}:</strong> {c.basis}
            </li>
          ))}
        </ul>
      </Sec>
      <Sec title={`Pruebas del modelo (${report.passed} de ${report.total} cumplen)`}>
        <p className="city-small">Ejecutadas con «npm run test:city» el {new Date(report.generatedAt).toLocaleString('es-CO')}. Tolerancias fijadas antes de ejecutar; las correcciones de diseño de las pruebas se publican.</p>
        <ul className="test-list">
          {report.results.map((r) => (
            <li key={r.id} className={r.pass ? 'ok' : 'bad'}>
              <strong>
                {r.pass ? '✓' : '✗'} {r.id}. {r.name}
              </strong>
              <small>Tolerancia: {r.tolerance}</small>
              <small>Medido: {r.measured}</small>
              {'note' in r && r.note && <small>Nota: {String(r.note)}</small>}
            </li>
          ))}
        </ul>
        <button type="button" className="btn-ghost small" onClick={() => setQuick(runQuickTests())}>
          Ejecutar pruebas rápidas en este navegador
        </button>
        {quick && (
          <ul className="test-list">
            {quick.map((q) => (
              <li key={q.name} className={q.pass ? 'ok' : 'bad'}>
                <strong>
                  {q.pass ? '✓' : '✗'} {q.name}
                </strong>
                <small>
                  {q.tolerance} · medido: {q.measured}
                </small>
              </li>
            ))}
          </ul>
        )}
      </Sec>
      <Sec title="Resolución y rendimiento">
        {sc && (
          <Segmented
            label="Tamaño de celda"
            value={ctrl.shared.dx}
            options={sc.resolutions.map((r) => ({ value: r, label: `${fmtNum(r, r < 1 ? 1 : 0)} m` }))}
            onChange={(v) => ctrl.update({ shared: { dx: v } })}
            help="Celdas más pequeñas resuelven mejor bordillos y cunetas, pero cuestan más. La captación de los sumideros es lo más sensible a este valor."
          />
        )}
        <ul className="city-small">
          <li>Dibujo: {api.renderer === 'webgl' ? 'WebGL2 (3D)' : 'mapa 2D (sin WebGL2)'} · WebGL2 {caps?.webgl2 ? 'disponible' : 'no disponible'} · WebGPU {caps?.webgpu ? 'disponible' : 'no disponible'} (no se requiere: el cálculo corre en la CPU).{caps?.glRenderer ? ` Procesador gráfico: ${caps.glRenderer}.` : ''}{caps?.softwareGL ? ' El navegador dibuja por software (sin GPU): en calidad automática se usa la ligera.' : ''}</li>
          <li>Costo medido del cálculo en este equipo: {caps ? fmtNum(caps.msPerSimSecond, 2) : '—'} ms por segundo simulado (ladera, 1 m). Resolución recomendada: {caps?.recommendedDx ?? '—'} m.</li>
          {(() => {
            const fx = ctrl.fxLevels();
            return fx ? (
              <li>
                Efectos ligados al cálculo: {fx.spouts} bajantes con chorro · {fx.drains} sumideros captando · {fx.outlets} caras de salida con caudal{fx.tanks ? ` · ${fx.tanks} depósito con nivel` : ''}. Gotas dibujadas: {fx.rainDrops.toLocaleString('es-CO')} (densidad {Math.round(fx.density * 100)}&nbsp;%; baja sola si el equipo dibuja lento).
              </li>
            ) : null;
          })()}
          {sim && (
            <li>
              Ahora: {sim.c.nx}×{sim.c.ny} celdas de {fmtNum(sim.c.dx, 1)} m · {sim.diag.steps} pasos · dt {sim.diag.steps ? `${fmtNum(sim.t / sim.diag.steps, 2)} s en promedio` : '—'} · {fmtNum(ctrl.fps, 0)} cuadros/s · cálculo {fmtNum(ctrl.simMsPerFrame, 1)} ms por cuadro · velocidad lograda ×{fmtNum(ctrl.achievedSpeed, 0)} (pedida ×{ctrl.speed}).
            </li>
          )}
          {sim && sim.diag.faceUpdates > 0 && <li>Caras con límite de Froude aplicado: {fmtNum((100 * sim.diag.froudeLimited) / sim.diag.faceUpdates, 1)} %.</li>}
        </ul>
        <button type="button" className="btn-ghost small" onClick={() => api.setRenderer(api.renderer === 'webgl' ? '2d' : 'webgl')} disabled={!caps?.webgl2 && api.renderer === '2d'}>
          {api.renderer === 'webgl' ? 'Usar el mapa 2D (equipos lentos)' : 'Volver a la maqueta 3D'}
        </button>
        <details className="city-small">
          <summary>Sensibilidad documentada</summary>
          <p>Resolución (calle de prueba): {report.sensitivity.map((s) => `${s.dx} m → salida ${fmtNum(s.B, 1)} m³, drenado ${fmtNum(s.D, 1)} m³, esquina ${fmtDepth(s.esq)}`).join('; ')}.</p>
          <p>Límite de Froude (ladera): {report.froude.map((f) => `Fr ≤ ${f.fr > 1e6 ? '∞' : f.fr} → drenado ${fmtNum(f.D, 1)} m³`).join('; ')}. En calles empinadas la captación de sumideros es incierta.</p>
        </details>
      </Sec>
      <Sec title="Configuración: exportar e importar">
        <p className="city-small">Guarda la lluvia, A y B en un archivo JSON (sin datos personales). Al importar, el archivo se valida antes de usarlo.</p>
        <div className="btn-row">
          <button
            type="button"
            className="btn-ghost small"
            disabled={!ctrl.config()}
            onClick={async () => {
              const cfg = ctrl.config();
              if (!cfg) return;
              const r = await downloadText(`lluvia-${cfg.shared.scenarioId}.json`, JSON.stringify(cfg, null, 2));
              setMsg(r === 'saved' ? 'Archivo listo.' : r === 'declined' ? 'Descarga cancelada.' : 'No se pudo descargar.');
            }}
          >
            Exportar configuración
          </button>
          <label className="btn-ghost small file-btn">
            Importar configuración o escenario
            <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
          </label>
        </div>
        {msg && (
          <p className="city-small" role="status">
            {msg}
          </p>
        )}
        <p className="city-small">Para usar datos reales de Medellín, el archivo de escenario se genera con tools/geo/medellin_pipeline.py (ver docs/medellin/DATOS_REALES.md).</p>
      </Sec>
      <Sec title="Fuentes">
        <ul className="city-small">
          <li>Bates, P. D., Horritt, M. S. y Fewtrell, T. J. (2010). A simple inertial formulation of the shallow water equations for efficient two-dimensional flood inundation modelling. Journal of Hydrology, 387, 33–45.</li>
          <li>de Almeida, G. A. M., Bates, P., Freer, J. E. y Souvignet, M. (2012). Improving the stability of a simple formulation of the shallow water equations for 2-D flood modeling. Water Resources Research, 48, W05528.</li>
          <li>Chow, V. T. (1959). Open-Channel Hydraulics. McGraw-Hill.</li>
          <li>USDA NRCS (1986). Urban Hydrology for Small Watersheds (TR-55).</li>
          <li>Rawls, W. J., Brakensiek, D. L. y Miller, N. (1983). Green-Ampt infiltration parameters from soils data. Journal of Hydraulic Engineering, 109(1), 62–70.</li>
          <li>FHWA (2009). Urban Drainage Design Manual, HEC-22, 3.ª ed.</li>
          <li>Rossman, L. A. y Huber, W. C. (2016). Storm Water Management Model Reference Manual, Vol. I – Hydrology. EPA/600/R-15/162A.</li>
        </ul>
      </Sec>
    </div>
  );
}

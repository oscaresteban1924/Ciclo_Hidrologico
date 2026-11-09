// Interacciones propias de cada paso del recorrido guiado.

import { RESERVOIR_IDS, ELEMENT_BY_ID } from '../content/elements';
import { PHASE_CHANGES, PHASE_NAMES, type Phase } from '../content/states';
import type { InteractionId } from '../content/types';
import { INPUT_NAMES, LEVEL_NAMES, RIVER_LEVEL_NAMES, type Level3 } from '../lab/model';
import { CONDENSATION_LEVEL } from '../scene/geometry';
import { lensCaption } from '../scene/Lenses';
import { parcelPosition } from '../scene/Overlays';
import type { SceneSpec } from '../state/spec';
import { useStore } from '../state/store';
import { Segmented, Toggle } from './ui';

export function LevelMeter({ label, level, names = LEVEL_NAMES }: { label: string; level: number; names?: string[] }) {
  return (
    <div className="meter" role="img" aria-label={`${label}: ${names[level]}`}>
      <span className="meter-label">{label}</span>
      <span className="meter-bar" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={level > i ? 'is-on' : ''} />
        ))}
      </span>
      <span className="meter-value">{names[level]}</span>
    </div>
  );
}

const solarOpts = INPUT_NAMES.solar.map((label, i) => ({ value: i as Level3, label }));

// Disposición lineal: sólido — líquido — gas; los cambios que "suben" de energía van por arriba.
const PHASE_X: Record<Phase, number> = { solido: 52, liquido: 170, gas: 288 };
const PHASE_ARCS: Record<string, { d: string; lx: number; ly: number }> = {
  fusion: { d: 'M90 86 Q111 58 132 86', lx: 111, ly: 64 },
  congelacion: { d: 'M132 114 Q111 142 90 114', lx: 111, ly: 136 },
  evaporacion: { d: 'M208 86 Q229 58 250 86', lx: 229, ly: 64 },
  condensacion: { d: 'M250 114 Q229 142 208 114', lx: 229, ly: 136 },
  sublimacion: { d: 'M52 84 Q170 -60 288 84', lx: 170, ly: 2 },
  deposicion: { d: 'M288 116 Q170 260 52 116', lx: 170, ly: 198 },
};

function PhaseDiagram() {
  const { state, dispatch } = useStore();
  const sel = state.knobs.phase;
  const toggle = (id: string, on: boolean) => dispatch({ type: 'knob', patch: { phase: on ? null : id } });
  return (
    <div className="phase">
      <svg viewBox="0 -14 340 228" role="group" aria-label="Diagrama de cambios de estado del agua">
        {PHASE_CHANGES.map((pc) => {
          const a = PHASE_ARCS[pc.id];
          const on = sel === pc.id;
          return (
            <g
              key={pc.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${pc.name}: de ${PHASE_NAMES[pc.from]} a ${PHASE_NAMES[pc.to]}`}
              className={`phase-arrow${on ? ' is-on' : ''}`}
              onClick={() => toggle(pc.id, on)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(pc.id, on);
                }
              }}
            >
              <path d={a.d} className="phase-hit" />
              <rect x={a.lx - 48} y={a.ly - 12} width="96" height="24" rx="6" fill="transparent" />
              <path d={a.d} className="phase-line" markerEnd="url(#m-small)" />
              <text x={a.lx} y={a.ly} textAnchor="middle" dominantBaseline="middle">
                {pc.name}
              </text>
            </g>
          );
        })}
        {(Object.keys(PHASE_X) as Phase[]).map((k) => (
          <g key={k} transform={`translate(${PHASE_X[k]} 100)`}>
            <rect x="-40" y="-16" width="80" height="32" rx="6" className={`phase-node phase-${k}`} />
            <text textAnchor="middle" dominantBaseline="middle" className="phase-node-text">
              {k === 'solido' ? 'Sólido' : k === 'liquido' ? 'Líquido' : 'Vapor'}
            </text>
          </g>
        ))}
      </svg>
      <p className="phase-where" aria-live="polite">
        {sel ? (
          <>
            <strong>{PHASE_CHANGES.find((p) => p.id === sel)?.name}:</strong> {PHASE_CHANGES.find((p) => p.id === sel)?.where}
          </>
        ) : (
          'Pulsa una flecha del diagrama para ver dónde ocurre ese cambio en el paisaje.'
        )}
      </p>
    </div>
  );
}

export function StepInteraction({
  id,
  spec,
  compare,
}: {
  id: InteractionId;
  spec: SceneSpec;
  compare: { runoff: number; ground: number } | null;
}) {
  const { state, dispatch } = useStore();
  const c = spec.conditions;
  const m = spec.model;
  const k = state.knobs;
  const set = (patch: Partial<typeof c>) => dispatch({ type: 'override', patch });
  const knob = (patch: Partial<typeof k>) => dispatch({ type: 'knob', patch });

  switch (id) {
    case 'intro':
      return <Toggle label="Ver todos los procesos" checked={k.showAll} onChange={(v) => knob({ showAll: v })} help="Muestra las flechas de todos los procesos que ocurren a la vez." />;

    case 'reservoirs': {
      const found = state.progress.found.filter((f) => RESERVOIR_IDS.includes(f));
      return (
        <>
          <p className="counter" aria-live="polite">
            Encontrados: <strong>{found.length}</strong> de {RESERVOIR_IDS.length}
            {found.length === RESERVOIR_IDS.length && <span className="celebrate"> Los encontraste todos. Observa que cada uno intercambia agua con los demás.</span>}
          </p>
          <div className="chip-grid">
            {RESERVOIR_IDS.map((r) => (
              <button key={r} type="button" className={`chip${found.includes(r) ? ' is-found' : ''}`} aria-pressed={found.includes(r)} onClick={() => dispatch({ type: 'found', id: r })}>
                {ELEMENT_BY_ID[r].name}
              </button>
            ))}
          </div>
          <Toggle label="Mostrar las fuerzas" checked={k.showForces} onChange={(v) => knob({ showForces: v })} help="Rayos de energía solar y flechas de gravedad sobre el paisaje." />
        </>
      );
    }

    case 'evaporation':
      return (
        <>
          <Segmented label="Energía solar" options={solarOpts} value={c.solar} onChange={(v) => set({ solar: v })} />
          <LevelMeter label="Evaporación" level={m.levels.evaporacion} />
        </>
      );

    case 'transpiration':
      return (
        <>
          <Toggle label="Lupa del estoma" checked={k.showStoma} onChange={(v) => knob({ showStoma: v })} />
          <Segmented
            label="Humedad del suelo"
            options={[
              { value: 0 as Level3, label: 'Seco' },
              { value: 1 as Level3, label: 'Húmedo' },
            ]}
            value={c.soilMoisture === 0 ? 0 : 1}
            onChange={(v) => set({ soilMoisture: v })}
          />
          <Segmented label="Energía solar" options={solarOpts} value={c.solar} onChange={(v) => set({ solar: v })} />
          <LevelMeter label="Transpiración" level={m.levels.transpiracion} />
          <p className="readout">{lensCaption('stoma', c, k)}</p>
        </>
      );

    case 'condensation': {
      const pos = parcelPosition(k.parcel);
      const above = pos.y <= CONDENSATION_LEVEL;
      const temp = pos.y > 400 ? 'cálida' : pos.y > CONDENSATION_LEVEL ? 'más fría' : 'fría';
      return (
        <>
          <label className="range">
            <span>Altura de la masa de aire</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(k.parcel * 100)}
              onChange={(e) => knob({ parcel: Number(e.target.value) / 100 })}
              aria-valuetext={above ? 'Por encima del nivel de condensación' : 'Por debajo del nivel de condensación'}
            />
          </label>
          <p className="readout" aria-live="polite">
            Temperatura del aire: <strong>{temp}</strong>.{' '}
            {above
              ? 'Superó el nivel de condensación: el vapor se condensa en pequeñas gotas y se forma una nube.'
              : 'Está por debajo del nivel de condensación: su vapor sigue siendo invisible.'}
          </p>
          <Toggle label="Lupa de la nube" checked={k.showCloudLens} onChange={(v) => knob({ showCloudLens: v })} />
        </>
      );
    }

    case 'transport':
      return (
        <>
          <Segmented label="Viento" options={INPUT_NAMES.wind.map((label, i) => ({ value: i as Level3, label }))} value={c.wind} onChange={(v) => set({ wind: v })} />
          <p className="readout">Con más viento, el vapor y las nubes se desplazan más rápido hacia la montaña.</p>
        </>
      );

    case 'precipitation':
      return (
        <>
          <label className="range">
            <span>Tamaño de la gota (crece por coalescencia)</span>
            <input type="range" min={1} max={5} step={1} value={k.dropSize} onChange={(e) => knob({ dropSize: Number(e.target.value) })} aria-valuetext={`Tamaño ${k.dropSize} de 5`} />
          </label>
          <Segmented
            label="Corriente ascendente"
            options={[
              { value: 0 as 0 | 1, label: 'Débil' },
              { value: 1 as 0 | 1, label: 'Fuerte' },
            ]}
            value={k.updraft}
            onChange={(v) => knob({ updraft: v })}
          />
          <p className="readout" aria-live="polite">{lensCaption('drop', c, k)}</p>
        </>
      );

    case 'interception':
      return (
        <>
          <Segmented
            label="Lluvia"
            options={[
              { value: 2 as const, label: 'Llueve' },
              { value: 0 as const, label: 'Se detiene' },
            ]}
            value={c.rain === 0 ? 0 : 2}
            onChange={(v) => set({ rain: v })}
          />
          <Segmented label="Energía solar" options={solarOpts} value={c.solar} onChange={(v) => set({ solar: v })} />
          <p className="readout">
            {c.rain === 0
              ? 'Sin lluvia, las gotas del dosel se evaporan o gotean. Con más sol, más gotas vuelven al aire.'
              : 'Mientras llueve, la copa se cubre de gotas. Cuando ya no puede retener más, el agua gotea al suelo.'}
          </p>
        </>
      );

    case 'infiltration':
      return (
        <>
          <Segmented label="Humedad inicial del suelo" options={INPUT_NAMES.soilMoisture.map((label, i) => ({ value: i as Level3, label }))} value={c.soilMoisture} onChange={(v) => set({ soilMoisture: v })} />
          <LevelMeter label="Infiltración" level={m.levels.infiltracion} />
          <LevelMeter label="Escorrentía" level={m.levels.escorrentia} />
          <p className="readout">{lensCaption('soil', c, k)}</p>
        </>
      );

    case 'percolation':
      return (
        <>
          <Toggle label="Lluvia prolongada" checked={k.longRain} onChange={(v) => knob({ longRain: v })} help="Lluvia fuerte durante más tiempo." />
          <Segmented label="Humedad inicial del suelo" options={INPUT_NAMES.soilMoisture.map((label, i) => ({ value: i as Level3, label }))} value={c.soilMoisture} onChange={(v) => set({ soilMoisture: v })} />
          <LevelMeter label="Infiltración" level={m.levels.infiltracion} />
          <LevelMeter label="Recarga" level={m.levels.recarga} />
          <p className="readout">
            {m.percolation === 0
              ? 'El suelo retiene toda el agua infiltrada: por ahora no hay recarga.'
              : m.soilChange > 0
                ? 'El suelo retiene una parte; el resto continúa hacia el nivel freático.'
                : 'El suelo ya no retiene más agua: lo que se infiltra sigue bajando y recarga el acuífero.'}
          </p>
        </>
      );

    case 'runoff':
      return (
        <>
          <Segmented label="Superficie de la ciudad" options={INPUT_NAMES.surface.map((label, i) => ({ value: i as Level3, label }))} value={c.surface} onChange={(v) => set({ surface: v })} />
          <Segmented
            label="Intensidad de la lluvia"
            options={[1, 2, 3].map((v) => ({ value: v as 1 | 2 | 3, label: INPUT_NAMES.rain[v] }))}
            value={(c.rain === 0 ? 1 : c.rain) as 1 | 2 | 3}
            onChange={(v) => set({ rain: v })}
          />
          <LevelMeter label="Escorrentía" level={m.levels.escorrentia} />
          <LevelMeter label="Infiltración" level={m.levels.infiltracion} />
        </>
      );

    case 'groundwater': {
      const status = !compare
        ? 'Dos gotas trazadoras salen del mismo lugar: una por la superficie y otra por el acuífero.'
        : compare.ground >= 1
          ? 'Las dos llegaron al río. La subterránea tardó mucho más, ¡y en la realidad tardaría muchísimo más todavía!'
          : compare.runoff >= 1
            ? 'La gota de escorrentía ya llegó al río. La subterránea sigue avanzando lentamente entre los poros.'
            : 'Observa cuál avanza más rápido.';
      return (
        <>
          <button type="button" className="btn" onClick={() => knob({ compareRun: k.compareRun + 1 })}>
            {k.compareRun > 0 ? 'Comparar otra vez' : 'Comparar velocidades'}
          </button>
          <p className="readout" aria-live="polite">{status}</p>
          <Toggle label="Pozos de observación" checked={k.showWells} onChange={(v) => knob({ showWells: v })} help="El agua dentro de cada pozo marca la carga hidráulica: más alta bajo la colina, más baja cerca del río." />
        </>
      );
    }

    case 'storage':
      return (
        <>
          <Segmented label="Temperatura" options={INPUT_NAMES.temperature.map((label, i) => ({ value: i as Level3, label }))} value={c.temperature} onChange={(v) => set({ temperature: v })} />
          <p className="readout">
            {c.temperature === 0
              ? 'Hace frío: la nieve se acumula y el deshielo es mínimo.'
              : c.temperature === 1
                ? 'Temperatura templada: parte de la nieve se funde y alimenta los arroyos.'
                : 'Hace calor: la nieve se funde rápido, el borde de la nieve sube y los arroyos crecen.'}
          </p>
          <PhaseDiagram />
        </>
      );

    case 'people': {
      const pump = (c.pumping ?? 0) as Level3;
      return (
        <>
          <Segmented label="Bombeo del pozo" options={INPUT_NAMES.pumping.map((label, i) => ({ value: i as Level3, label }))} value={pump} onChange={(v) => set({ pumping: v })} />
          <Segmented label="Superficie de la ciudad" options={INPUT_NAMES.surface.map((label, i) => ({ value: i as Level3, label }))} value={c.surface} onChange={(v) => set({ surface: v })} />
          <LevelMeter label="Escorrentía" level={m.levels.escorrentia} />
          <LevelMeter label="Caudal del río" level={m.levels.rio} names={RIVER_LEVEL_NAMES} />
          <p className="readout" aria-live="polite">
            {pump === 0
              ? 'Sin bombeo, el nivel freático junto al río queda más alto que el cauce: el acuífero alimenta al río.'
              : pump === 1
                ? 'El bombeo forma un cono de depresión alrededor del pozo: llega menos agua subterránea al río.'
                : 'Con bombeo intenso, el cono es más profundo y amplio: el río recibe mucho menos flujo base y, cerca de la costa, el agua salada puede avanzar.'}
          </p>
        </>
      );
    }

    case 'final':
      return (
        <div className="final-actions">
          <button type="button" className="btn" onClick={() => dispatch({ type: 'tool', tool: 'tracer' })}>
            Seguir una gota trazadora
          </button>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'mode', mode: 'lab' })}>
            Ir al laboratorio del agua
          </button>
          <button type="button" className="btn" onClick={() => dispatch({ type: 'tool', tool: 'challenges' })}>
            Resolver retos
          </button>
        </div>
      );
    default:
      return null;
  }
}

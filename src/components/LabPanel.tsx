// Experimentos del ciclo del agua: explorar condiciones (modelo cualitativo con balance) y comparar escenarios A/B.

import { useRef, useState } from 'react';
import {
  INPUT_NAMES,
  LEVEL_NAMES,
  RIVER_LEVEL_NAMES,
  RULES_TEXT,
  type Level3,
  type Level4,
  type ModelResult,
  type QualKey,
} from '../lab/model';
import type { SceneSpec } from '../state/spec';
import { useStore } from '../state/store';
import { LevelMeter } from './StepInteraction';
import { CompareLab, useCompareLoop } from './CompareLab';
import { Disclosure, Segmented } from './ui';
import type { LabTab } from '../state/store';

const LAB_TABS: { id: LabTab; label: string }[] = [
  { id: 'reparto', label: 'Explorar condiciones' },
  { id: 'comparar', label: 'Comparar escenarios A/B' },
];

const QUAL: { key: QualKey; label: string }[] = [
  { key: 'evaporacion', label: 'Evaporación' },
  { key: 'transpiracion', label: 'Transpiración' },
  { key: 'intercepcion', label: 'Intercepción' },
  { key: 'infiltracion', label: 'Infiltración' },
  { key: 'escorrentia', label: 'Escorrentía' },
  { key: 'recarga', label: 'Recarga' },
  { key: 'rio', label: 'Caudal del río' },
];

const EFFECT_TEXT = { sube: 'aumenta', baja: 'reduce', neutro: 'influye poco' } as const;

function describeSplit(m: ModelResult): string {
  if (m.rain === 0) return 'No llueve: no hay agua que repartir. Aun así, el río sigue corriendo gracias al flujo base del acuífero.';
  const parts = [
    { name: 'se infiltra', v: m.infiltration },
    { name: 'escurre por la superficie', v: m.runoff },
    { name: 'queda en las hojas', v: m.interception },
  ].sort((a, b) => b.v - a.v);
  const first = parts[0];
  const rest = parts.slice(1).filter((p) => p.v > 0.05);
  return `Según las reglas del modelo, la mayor parte de la lluvia ${first.name}${rest.length ? `; el resto ${rest.map((r) => r.name).join(' o ')}` : ''}.`;
}

export function RainSplit({ m }: { m: ModelResult }) {
  const R = m.rain;
  const pct = (v: number) => `${R > 0 ? (v / R) * 100 : 0}%`;
  const inf = m.infiltration;
  const pctI = (v: number) => `${inf > 0 ? (v / inf) * 100 : 0}%`;
  return (
    <section className="split" aria-labelledby="split-title">
      <h3 id="split-title">¿A dónde va la lluvia?</h3>
      {R > 0 ? (
        <>
          <div className="split-bar" role="img" aria-label={describeSplit(m)}>
            <span className="seg seg-int" style={{ width: pct(m.interception) }} />
            <span className="seg seg-inf" style={{ width: pct(m.infiltration) }} />
            <span className="seg seg-run" style={{ width: pct(m.runoff) }} />
          </div>
          <ul className="split-legend">
            <li><span className="sw seg-int" aria-hidden="true" />Intercepción</li>
            <li><span className="sw seg-inf" aria-hidden="true" />Infiltración</li>
            <li><span className="sw seg-run" aria-hidden="true" />Escorrentía</li>
          </ul>
          {inf > 0 && (
            <>
              <p className="split-sub">El agua infiltrada se reparte así:</p>
              <div className="split-bar is-thin" role="img" aria-label={`Del agua infiltrada: ${m.soilChange > 0 ? 'una parte queda en el suelo' : 'nada queda en el suelo'}${m.percolation > 0 ? ', otra parte percola y recarga el acuífero' : ''}`}>
                <span className="seg seg-soil" style={{ width: pctI(m.soilChange) }} />
                <span className="seg seg-rch" style={{ width: pctI(m.percolation) }} />
              </div>
              <ul className="split-legend">
                <li><span className="sw seg-soil" aria-hidden="true" />Queda en el suelo</li>
                <li><span className="sw seg-rch" aria-hidden="true" />Percola y recarga el acuífero</li>
              </ul>
            </>
          )}
        </>
      ) : null}
      <p className="split-text">{describeSplit(m)}</p>
      <p className="balance" aria-live="polite">
        Balance del modelo: lluvia = intercepción + infiltración + escorrentía; infiltración = agua retenida en el suelo + percolación. {m.balanceOk ? 'Se cumple.' : ''}
      </p>
    </section>
  );
}

function LabControls({ withRain, locked }: { withRain: boolean; locked: boolean }) {
  const { state, dispatch } = useStore();
  const lab = state.lab;
  const setLab = (patch: Partial<typeof lab>) => dispatch({ type: 'lab', patch });
  return (
    <section className="controls" aria-labelledby="ctl-title">
      <h3 id="ctl-title">Condiciones</h3>
      <Segmented label="Energía solar" disabled={locked} options={INPUT_NAMES.solar.map((label, i) => ({ value: i as Level3, label }))} value={lab.solar} onChange={(v) => setLab({ solar: v })} />
      {withRain && (
        <Segmented label="Intensidad de la lluvia" disabled={locked} options={INPUT_NAMES.rain.map((label, i) => ({ value: i as Level4, label }))} value={lab.rain} onChange={(v) => setLab({ rain: v })} />
      )}
      <Segmented label="Humedad inicial del suelo" disabled={locked} options={INPUT_NAMES.soilMoisture.map((label, i) => ({ value: i as Level3, label }))} value={lab.soilMoisture} onChange={(v) => setLab({ soilMoisture: v })} />
      <Segmented label="Cobertura vegetal" disabled={locked} options={INPUT_NAMES.vegetation.map((label, i) => ({ value: i as Level3, label }))} value={lab.vegetation} onChange={(v) => setLab({ vegetation: v })} />
      <Segmented label="Superficie" disabled={locked} options={INPUT_NAMES.surface.map((label, i) => ({ value: i as Level3, label }))} value={lab.surface} onChange={(v) => setLab({ surface: v })} />
      <Segmented
        label="Bombeo del pozo"
        disabled={locked}
        options={INPUT_NAMES.pumping.map((label, i) => ({ value: i as Level3, label }))}
        value={(lab.pumping ?? 0) as Level3}
        onChange={(v) => {
          setLab({ pumping: v });
          if (v > 0) dispatch({ type: 'discover', ids: ['bombeo'] });
        }}
        help="Extraer agua subterránea baja el nivel freático alrededor del pozo."
      />
    </section>
  );
}

export function LabPanel({ spec }: { spec: SceneSpec }) {
  const { state, dispatch } = useStore();
  useCompareLoop();
  const m = spec.model;
  const tab = state.labTab;
  const [factorKey, setFactorKey] = useState<QualKey>('escorrentia');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectTab = (t: LabTab) => dispatch({ type: 'labTab', tab: t });
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = LAB_TABS.length;
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % n;
    if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = n - 1;
    if (j >= 0) {
      e.preventDefault();
      selectTab(LAB_TABS[j].id);
      tabRefs.current[j]?.focus();
    }
  };

  return (
    <div className="lab">
      <header>
        <h2 className="term">Experimentos</h2>
        <p className="lead">{tab === 'reparto' ? 'Cambia las condiciones y observa el paisaje.' : 'Compara dos escenarios que solo se diferencian en una condición.'}</p>
        <p className="disclaimer">
          {tab === 'reparto'
            ? 'Modelo educativo cualitativo con reglas explícitas: muestra tendencias coherentes, no cantidades reales. Los resultados casi siempre dependen de varias condiciones a la vez.'
            : 'Cuenca imaginaria con reglas explícitas y valores ilustrativos en milímetros (mm) y horas (h). El balance de agua se conserva en cada paso.'}
        </p>
      </header>

      <div className="lab-tabs" role="tablist" aria-label="Secciones de Experimentos">
        {LAB_TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`labtab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`labpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={tab === t.id ? 'is-on' : ''}
            onClick={() => selectTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`labpanel-${tab}`} aria-labelledby={`labtab-${tab}`} className="lab-tabpanel">
        {tab === 'comparar' && <CompareLab />}

        {tab === 'reparto' && (
          <>
            <LabControls withRain locked={false} />
            <RainSplit m={m} />

            <section className="results" aria-labelledby="res-title">
              <h3 id="res-title">Lo que observas</h3>
              <p className="hint-inline">Pulsa un flujo para ver de qué condiciones depende.</p>
              <div className="meters">
                {QUAL.map((q) => (
                  <button key={q.key} type="button" className={`meter-btn${factorKey === q.key ? ' is-on' : ''}`} aria-pressed={factorKey === q.key} onClick={() => setFactorKey(q.key)}>
                    <LevelMeter label={q.label} level={m.levels[q.key]} names={q.key === 'rio' ? RIVER_LEVEL_NAMES : LEVEL_NAMES} />
                  </button>
                ))}
              </div>
              <div className="factors" aria-live="polite">
                <p>
                  <strong>{QUAL.find((q) => q.key === factorKey)?.label}</strong> depende de:
                </p>
                <ul>
                  {m.factors[factorKey].map((f, i) => (
                    <li key={i} className={`effect-${f.effect}`}>
                      <span className="effect-mark" aria-hidden="true">{f.effect === 'sube' ? '▲' : f.effect === 'baja' ? '▼' : '●'}</span>
                      {f.label}: {EFFECT_TEXT[f.effect]}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <Disclosure title="Reglas del modelo">
              <ol className="rules">
                {RULES_TEXT.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </Disclosure>
          </>
        )}
      </div>
    </div>
  );
}

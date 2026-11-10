// Herramienta «Planificar»: elegir obras con un presupuesto de puntos y probarlas con una tormenta de diseño
// (A: el barrio como está; B: con el plan). Al terminar, una tabla compara los indicadores calculados.

import { useState } from 'react';
import { useStore } from '../../state/store';
import { PLAN_BUDGET, applyPlan, planCost, planItems, planRows } from '../content/planner';
import type { CityController } from '../controller';
import { fmtNum } from '../render/palette';
import { rainDepthMm } from '../sim/engine';
import { SIM_MAX_MIN } from '../sim/constants';
import { baseInterventions, cloneInterventions, type Scenario, type Shared } from '../sim/scenario';
import { WARMING_LEVELS, WARMING_NOW } from '../sim/storms';
import { basinMinutes } from './BasinPanel';
import type { CitySaved } from '../persist';

const RETURNS = [2, 10, 25, 100] as const;
const DURATIONS = [30, 60, 120] as const;

export function PlanTool({ ctrl, sc, saved, setSaved }: { ctrl: CityController; sc: Scenario; saved: CitySaved; setSaved: (f: (s: CitySaved) => CitySaved) => void }) {
  const { dispatch } = useStore();
  const key = `plan:${sc.id}`;
  const items = planItems(sc);
  const [sel, setSelState] = useState<string[]>(() => (saved.budget[key] ?? []).filter((id) => items.some((i) => i.id === id)));
  const [T, setT] = useState<number>(10);
  const [D, setD] = useState<number>(60);
  const [w, setW] = useState<number>(WARMING_NOW);
  const [ran, setRan] = useState<{ T: number; D: number; w: number; sel: string[] } | null>(null);
  const used = planCost(sc, sel);
  const setSel = (next: string[]) => {
    setSelState(next);
    setSaved((s) => ({ ...s, budget: { ...s.budget, [key]: next } }));
  };
  const toggle = (id: string) => {
    const it = items.find((i) => i.id === id)!;
    const next = sel.includes(id) ? sel.filter((q) => q !== id) : [...sel.filter((q) => !it.group || items.find((i) => i.id === q)?.group !== it.group), id];
    if (planCost(sc, next) <= PLAN_BUDGET) setSel(next);
  };
  const rain: Shared['rain'] = { ...sc.defaults.rain, pattern: 'diseno', returnYears: T, durationMin: D, warmingC: w === WARMING_NOW ? undefined : w, spatial: 'uniforme', intensityMmH: 0 };
  rain.intensityMmH = Math.round((rainDepthMm({ ...rain, warmingC: undefined }) / (D / 60)) * 10) / 10;
  const run = () => {
    const A = baseInterventions(sc);
    const B = cloneInterventions(A);
    applyPlan(sc, B, sel);
    const dx = sc.resolutions.includes(2) ? 2 : sc.defaultResolution;
    let simMinutes = Math.min(SIM_MAX_MIN, D + 30);
    let creek: Shared['creek'] = null;
    if (sc.creek?.basin) {
      creek = { source: 'cuenca', peakM3s: 0, timeToPeakMin: 6, startMin: 0, sedimentCv: 0 };
      // que alcance a pasar el pico de la quebrada con la cuenca de A y con la de B
      simMinutes = Math.max(basinMinutes(sc, rain, A.basinCover ?? 'mixta', 'seco', simMinutes), basinMinutes(sc, rain, B.basinCover ?? 'mixta', 'seco', simMinutes));
    }
    ctrl.update({ shared: { ...sc.defaults, dx, rain, simMinutes, soilInitial: 'seco', creek }, A, B });
    ctrl.setCompare(true);
    ctrl.start();
    dispatch({ type: 'pause', value: false });
    setRan({ T, D, w, sel: [...sel] });
  };
  const ind = ctrl.indicators();
  const done = ran && ctrl.pair && ctrl.status === 'terminado' && ind.A && ind.B;
  const rows = done ? planRows(ind.A!, ind.B!) : [];
  const better = rows.filter((r) => (r.lower ? r.b < r.a * 0.98 : r.b > r.a * 1.02)).length;
  return (
    <section className="tool-body plan-tool" aria-label="Planificar">
      <h3>Planificar el barrio</h3>
      <p className="city-small">
        Elige obras con {PLAN_BUDGET} puntos y pruébalas con una tormenta de diseño de Medellín. A es el barrio como está; B, con tu plan. Los puntos no son pesos: la relación entre costos sigue la calificación cualitativa de la Guía técnica de SUDS de Bogotá (2016), y no reemplaza un diseño de ingeniería.
      </p>
      <p className="budget-meter" role="status">
        Puntos usados: <strong>{used}</strong> de {PLAN_BUDGET}
      </p>
      <ul className="plan-items">
        {items.map((i) => {
          const on = sel.includes(i.id);
          const swap = i.group ? sel.find((q) => items.find((x) => x.id === q)?.group === i.group) : undefined;
          const can = on || used - (swap ? items.find((x) => x.id === swap)!.cost : 0) + i.cost <= PLAN_BUDGET;
          return (
            <li key={i.id}>
              <label className={`check${can ? '' : ' is-off'}`}>
                <input type="checkbox" checked={on} disabled={!can} onChange={() => toggle(i.id)} />
                <span>
                  <b>{i.label}</b> <small>{i.cost} puntos</small>
                  <em>{i.detail}</em>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="plan-label">Tormenta para probar el plan</p>
      <div className="chip-row" role="radiogroup" aria-label="Periodo de retorno">
        {RETURNS.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={T === v} className={`chip${T === v ? ' is-on' : ''}`} onClick={() => setT(v)}>
            {v} años
          </button>
        ))}
      </div>
      <div className="chip-row" role="radiogroup" aria-label="Duración">
        {DURATIONS.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={D === v} className={`chip${D === v ? ' is-on' : ''}`} onClick={() => setD(v)}>
            {v < 60 ? `${v} min` : `${v / 60} h`}
          </button>
        ))}
      </div>
      <div className="chip-row" role="radiogroup" aria-label="Clima">
        {WARMING_LEVELS.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={w === v} className={`chip${w === v ? ' is-on' : ''}`} onClick={() => setW(v)}>
            {v === WARMING_NOW ? 'Clima de hoy' : `+${fmtNum(v, v % 1 ? 1 : 0)} °C`}
          </button>
        ))}
      </div>
      <p className="city-small">
        {fmtNum(rainDepthMm(rain), 0)} mm en {D < 60 ? `${D} min` : `${D / 60} h`} (curva IDF de Olaya Herrera){sc.creek?.basin ? '; la quebrada crece con la misma lluvia cayendo en su cuenca' : ''}. Se calcula con celdas de {sc.resolutions.includes(2) ? 2 : sc.defaultResolution} m.
      </p>
      <button type="button" className="btn" onClick={run} disabled={sel.length === 0}>
        Probar el plan
      </button>
      {sel.length === 0 && <p className="city-small">Elige al menos una obra.</p>}
      {ran && !done && ctrl.pair && <p className="city-small" role="status">Calculando A y B con la misma tormenta…</p>}
      {done && (
        <div className="plan-result" role="region" aria-label="Resultado del plan">
          <h4>
            Resultado: {better} de {rows.length} indicadores mejoran con el plan
          </h4>
          <table className="city-table">
            <thead>
              <tr>
                <th scope="col">Indicador</th>
                <th scope="col">A, sin plan</th>
                <th scope="col">B, con plan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const good = r.lower ? r.b < r.a * 0.98 : r.b > r.a * 1.02;
                const bad = r.lower ? r.b > r.a * 1.02 : r.b < r.a * 0.98;
                return (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td>{r.fmt(r.a)}</td>
                    <td className={good ? 'is-good' : bad ? 'is-bad' : ''}>
                      {r.fmt(r.b)} {good || bad ? `${r.b > r.a ? '▲' : '▼'} ${good ? 'mejor' : 'peor'}` : '≈ igual'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="city-small">
            Tormenta de {ran.T} años y {ran.D < 60 ? `${ran.D} min` : `${ran.D / 60} h`}
            {ran.w > WARMING_NOW ? ` con +${fmtNum(ran.w, ran.w % 1 ? 1 : 0)} °C` : ''}; plan de {planCost(sc, ran.sel)} puntos. Para comparar planes, cambia las obras y vuelve a probar. Mira la pestaña «Comparar» para las gráficas.
          </p>
        </div>
      )}
    </section>
  );
}

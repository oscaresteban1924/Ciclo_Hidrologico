// «¿Adónde fue la lluvia?»: barra apilada en vivo con el reparto calculado del agua que entró al sector.
// Cada parte lleva rótulo con su valor (no se depende del color) y se puede leer con el puntero o el teclado.

import { useState } from 'react';
import type { Balance } from '../sim/engine';
import { fmtNum } from '../render/palette';

/** Orden fijo de las categorías y sus colores (paleta categórica validada). */
export const BUDGET_PARTS = [
  { id: 'superficie', label: 'Sigue sobre el suelo', color: '#2a78d6', kid: 'charcos, láminas y agua que aún corre' },
  { id: 'salida', label: 'Salió del sector', color: '#eb6834', kid: 'siguió calle o quebrada abajo' },
  { id: 'suelo', label: 'Entró al suelo', color: '#1baf7a', kid: 'infiltración en zonas verdes, jardines y pavimento permeable' },
  { id: 'red', label: 'Entró a los sumideros', color: '#eda100', kid: 'va por la red de drenaje' },
  { id: 'deposito', label: 'Guardada en depósitos', color: '#e87ba4', kid: 'lluvia de techos recogida' },
] as const;

export function budgetValues(b: Balance): Record<(typeof BUDGET_PARTS)[number]['id'], number> {
  return {
    superficie: Math.max(0, b.surface - b.surface0),
    salida: b.boundaryOut,
    suelo: b.infiltrated,
    red: b.drained,
    deposito: b.devices,
  };
}

export function RainBudget({ bal, title = '¿Adónde fue la lluvia?' }: { bal: Balance; title?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const v = budgetValues(bal);
  const total = bal.precipitation + bal.inflow;
  const m3 = (x: number) => `${fmtNum(x, x < 10 ? 2 : 1)} m³`;
  const pct = (x: number) => (total > 1e-9 ? (x / total) * 100 : 0);
  const shown = BUDGET_PARTS.filter((p) => v[p.id] > 1e-6);
  const focus = BUDGET_PARTS.find((p) => p.id === hover);
  return (
    <section className="rain-budget" aria-labelledby="rb-title">
      <h3 id="rb-title">{title}</h3>
      {total < 1e-6 ? (
        <p className="city-small">Todavía no ha llovido. Cuando empiece la lluvia, aquí verás qué parte corre, entra al suelo, se guarda o sale.</p>
      ) : (
        <>
          <p className="city-small">
            Han entrado <strong>{m3(total)}</strong> de agua{bal.inflow > 0 ? ` (lluvia ${m3(bal.precipitation)} y agua de arriba ${m3(bal.inflow)})` : ' de lluvia'}. Así se repartieron:
          </p>
          <div className="rb-bar" role="img" aria-label={`Reparto del agua: ${BUDGET_PARTS.map((p) => `${p.label} ${fmtNum(pct(v[p.id]), 0)} %`).join(', ')}.`}>
            {shown.map((p) => (
              <span
                key={p.id}
                className={`rb-seg${hover === p.id ? ' is-on' : ''}`}
                style={{ flexGrow: Math.max(v[p.id], total * 0.004), background: p.color }}
                onPointerEnter={() => setHover(p.id)}
                onPointerLeave={() => setHover(null)}
              />
            ))}
          </div>
          <p className="rb-read" aria-live="polite">
            {focus ? `${focus.label}: ${m3(v[focus.id])} (${fmtNum(pct(v[focus.id]), 0)} %), ${focus.kid}.` : 'Pasa el puntero por la barra o por la lista para leer cada parte.'}
          </p>
          <ul className="rb-legend">
            {BUDGET_PARTS.map((p) => (
              <li key={p.id}>
                <button type="button" className={hover === p.id ? 'is-on' : ''} onFocus={() => setHover(p.id)} onBlur={() => setHover(null)} onPointerEnter={() => setHover(p.id)} onPointerLeave={() => setHover(null)}>
                  <span className="rb-swatch" style={{ background: p.color }} aria-hidden="true" />
                  <span className="rb-name">{p.label}</span>
                  <span className="rb-val">
                    {m3(v[p.id])} · {fmtNum(pct(v[p.id]), 0)}&nbsp;%
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="city-small rb-check">
            {Math.abs(bal.residual) < 0.0005
              ? 'La cuenta cierra: lo que entró es igual a la suma de las partes (diferencia menor que medio litro).'
              : `Diferencia entre lo que entró y la suma de las partes: ${m3(Math.abs(bal.residual))}. El panel docente muestra el balance completo.`}
          </p>
        </>
      )}
    </section>
  );
}

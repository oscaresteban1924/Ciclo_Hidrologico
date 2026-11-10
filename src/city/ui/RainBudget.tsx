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
  { id: 'red', label: 'Va por el alcantarillado', color: '#eda100', kid: 'sigue dentro de la red o salió del sector por ella (lo que la red devolvió a la calle o a la quebrada se cuenta donde quedó)' },
  { id: 'deposito', label: 'Guardada en depósitos', color: '#e87ba4', kid: 'lluvia de techos recogida' },
] as const;

/**
 * Reparto del agua. Con red separada se suman dos balances que cierran por separado:
 *   superficie: lluvia + entrada + devuelto por la red = Δsuperficie + infiltrado + depósitos + drenado + salida
 *   red:        drenado + aportes externos = guardado en la red + salido por la red + devuelto
 * de modo que lluvia + entrada + aportes externos = Δsuperficie + infiltrado + depósitos + salida + (guardado +
 * salido por la red). Así ninguna parte es negativa: el agua que la red entregó a la quebrada o a la calle
 * se cuenta donde quedó (sobre el suelo o saliendo del sector).
 */
export function budgetValues(b: Balance): Record<(typeof BUDGET_PARTS)[number]['id'], number> {
  return {
    superficie: Math.max(0, b.surface - b.surface0),
    salida: b.boundaryOut,
    suelo: b.infiltrated,
    red: b.sewer ? b.network + b.netOut : b.drained - b.returned,
    deposito: b.devices,
  };
}

/** Agua que entró al reparto: lluvia, agua de arriba y lo que llega por las tuberías desde fuera del sector. */
export function budgetTotal(b: Balance): number {
  return b.precipitation + b.inflow + (b.sewer ? b.sewageIn : 0);
}

export function RainBudget({ bal, title = '¿Adónde fue la lluvia?' }: { bal: Balance; title?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const v = budgetValues(bal);
  const total = budgetTotal(bal);
  const sewage = bal.sewer ? bal.sewageIn : 0;
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
            Han entrado <strong>{m3(total)}</strong> de agua{bal.inflow > 0 || sewage > 0 ? ` (lluvia ${m3(bal.precipitation)}${bal.creekIn > 0 ? `, creciente de la quebrada ${m3(bal.creekIn)}` : ''}${bal.runonIn > 0 ? `, agua de las laderas vecinas ${m3(bal.runonIn)}` : ''}${bal.inflow - bal.creekIn - bal.runonIn > 1e-6 ? `, agua de arriba ${m3(bal.inflow - bal.creekIn - bal.runonIn)}` : ''}${sewage > 0 ? `, agua que llega por las tuberías desde fuera del sector ${m3(sewage)}: aguas residuales y escorrentía de calles de arriba` : ''})` : ' de lluvia'}. Así se repartieron:
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
          {bal.sewer && bal.drained > 1e-6 && (
            <p className="city-small">
              Pasaron por los sumideros {m3(bal.sewer.fromSector[0])}
              {bal.sewer.toCreek[0] > 1e-6 ? `; la red de aguas lluvias entregó ${m3(bal.sewer.toCreek[0])} a la quebrada` : ''}
              {bal.sewer.overflow[0] > 1e-6 ? `; la red de aguas lluvias devolvió ${m3(bal.sewer.overflow[0])} a la calle por cámaras y sumideros` : ''}
              {bal.sewer.overflow[1] > 1e-6 ? `; la de aguas residuales rebosó ${m3(bal.sewer.overflow[1])} a la calle` : ''}
              {bal.sewer.fromCreek[0] > 1e-6 ? `; la quebrada crecida metió ${m3(bal.sewer.fromCreek[0])} a la red` : ''}
              {bal.roofToSewer > 1e-6 ? `; ${m3(bal.roofToSewer)} de lluvia de techos entraron por conexiones erradas a las aguas residuales` : ''}.
            </p>
          )}
          <p className="city-small rb-check">
            {Math.abs(bal.residual) + Math.abs(bal.sewer ? bal.netResidual : 0) < 0.0005
              ? 'La cuenta cierra: lo que entró es igual a la suma de las partes (diferencia menor que medio litro).'
              : `Diferencia entre lo que entró y la suma de las partes: ${m3(Math.abs(bal.residual) + Math.abs(bal.sewer ? bal.netResidual : 0))}. El panel docente muestra el balance completo.`}
          </p>
        </>
      )}
    </section>
  );
}

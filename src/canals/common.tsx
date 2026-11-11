// Piezas de interfaz comunes a las cuatro partes de la hidráulica de canales.

import type { ReactNode } from 'react';
import { DockRange } from '../quality/shell';

export const es = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');

/** Pendiente en escala logarítmica para el control: k de 0 a 100 entre `lo` y `hi`. */
export function SlopeRange({ value, lo, hi, onChange, label = 'Pendiente del fondo' }: { value: number; lo: number; hi: number; onChange: (S: number) => void; label?: string }) {
  const k = Math.round((100 * Math.log(value / lo)) / Math.log(hi / lo));
  return (
    <DockRange
      label={label}
      value={k}
      min={0}
      max={100}
      step={1}
      show={`${es(value * 100, value < 0.01 ? 2 : 1)} % (${es(value * 1000, value < 0.01 ? 1 : 0)} m por km)`}
      onChange={(v) => {
        const S = lo * Math.pow(hi / lo, v / 100);
        const d = S < 0.001 ? 5 : S < 0.01 ? 4 : 3;
        onChange(Number(S.toFixed(d)));
      }}
    />
  );
}

/** Fila de la tabla de datos. */
export function Row({ name, value, note }: { name: string; value: ReactNode; note?: string }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td>{value}</td>
      <td className="q3-small">{note ?? ''}</td>
    </tr>
  );
}

/** Escena plana (sin WebGL): el esquema en grande con la pregunta encima. */
export function FlatStage({ children }: { children: ReactNode }) {
  return <div className="hc-flat">{children}</div>;
}

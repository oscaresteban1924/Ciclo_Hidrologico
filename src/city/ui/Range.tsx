// Control deslizante con su valor visible y ayuda opcional.

import { fmtNum } from '../render/palette';

export function Range({ label, value, min, max, step, unit, onChange, help }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; help?: string }) {
  const id = `r-${label.replace(/\s/g, '')}`;
  return (
    <div className="city-range">
      <label htmlFor={id}>
        {label} <output htmlFor={id}>{`${fmtNum(value, step < 1 ? 1 : 0)} ${unit}`}</output>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {help && <p className="city-small">{help}</p>}
    </div>
  );
}

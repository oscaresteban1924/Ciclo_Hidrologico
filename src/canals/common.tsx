// Piezas de interfaz comunes a las seis partes de la hidráulica de canales.

import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/**
 * Hidrograma adimensional de forma gamma (Haan, 1970), usado por el Servicio de Conservación de Suelos de EE. UU.:
 * q/qp = (t/tp · e^(1 − t/tp))^m con m = 3,7. Devuelve la fracción del pico (0 a 1) en el tiempo t.
 */
export function gammaHydrograph(t: number, tp: number, m = 3.7): number {
  if (t <= 0) return 0;
  const r = t / tp;
  return Math.pow(r * Math.exp(1 - r), m);
}

/**
 * Simula una creciente: el caudal sube del valor actual a un pico y vuelve, con la forma del hidrograma gamma, en
 * tiempo comprimido (unos 30 s en pantalla). Cada paso recalcula la escena. Al terminar, deja el caudal de antes.
 */
export function FloodPlayer({ q, qMax, onQ, unit = 'm³/s', digits = 1 }: { q: number; qMax: number; onQ: (v: number) => void; unit?: string; digits?: number }) {
  const [run, setRun] = useState<{ base: number; peak: number; t0: number } | null>(null);
  const [t, setT] = useState(0);
  const onQRef = useRef(onQ);
  onQRef.current = onQ;
  const TP = 8;
  const END = TP * 3.6;
  useEffect(() => {
    if (!run) return;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      const s = (now - run.t0) / 1000;
      if (s >= END) {
        onQRef.current(run.base);
        setRun(null);
        setT(0);
        return;
      }
      if (now - last > 110) {
        last = now;
        setT(s);
        const v = run.base + (run.peak - run.base) * gammaHydrograph(s, TP);
        onQRef.current(Number(v.toFixed(digits)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, END, digits]);
  const start = () => {
    const peak = Math.min(qMax, Math.max(q * 2.2, q + 0.35 * (qMax - q)));
    setRun({ base: q, peak, t0: performance.now() });
  };
  const stop = () => {
    if (run) onQRef.current(run.base);
    setRun(null);
    setT(0);
  };
  const W = 150, H = 40;
  const path = Array.from({ length: 61 }, (_, k) => {
    const s = (k / 60) * END;
    return `${k ? 'L' : 'M'}${((s / END) * W).toFixed(1)},${(H - 4 - gammaHydrograph(s, TP) * (H - 10)).toFixed(1)}`;
  }).join(' ');
  return (
    <div className="hc-flood">
      {run ? (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Creciente en curso: ${es(q, digits)} ${unit}`}>
            <path d={`${path} L${W},${H - 4} L0,${H - 4} Z`} fill="#dceefa" />
            <path d={path} fill="none" stroke="#2f7fb0" strokeWidth="1.6" />
            <circle cx={(t / END) * W} cy={H - 4 - gammaHydrograph(t, TP) * (H - 10)} r="3.4" fill="#c0392b" />
          </svg>
          <span className="hc-flood-q">{es(q, digits)} {unit}</span>
          <button type="button" onClick={stop}>Detener</button>
        </>
      ) : (
        <button type="button" onClick={start} title="El caudal sube hasta un pico y vuelve, en tiempo comprimido">
          Simular una creciente
        </button>
      )}
    </div>
  );
}

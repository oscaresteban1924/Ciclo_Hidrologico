// Gráficas en vivo de la sala «Cuencas»: el aguacero y el hidrograma (con el instante de la animación), y los
// caudales máximos en papel de Gumbel. Cada una con su eje (sin ejes dobles) y su leyenda.

import { es } from '../canals/common';
import { gumbelQ } from './hydrology';

export interface Series {
  name: string;
  q: number[];
  color: string;
  dash?: string;
}

/** Hietograma (barras: total y efectiva) y debajo los hidrogramas, con el mismo eje de tiempo. */
export function StormChart({ dt, rain, eff, series, tNow, peakLine, W = 560, H = 210 }: { dt: number; rain: number[]; eff: number[]; series: Series[]; tNow: number | null; peakLine?: { q: number; label: string }; W?: number; H?: number }) {
  const L = 44, R = 10, top = 16, split = 66, B = 22;
  const n = Math.max(rain.length, ...series.map((s) => s.q.length));
  const tMax = n * dt;
  const X = (t: number) => L + (t / tMax) * (W - L - R);
  const iMax = Math.max(1, ...rain.map((r) => (r / dt) * 60));
  const Yr = (i: number) => top + (i / iMax) * (split - top - 6);
  const qMax = Math.max(0.01, ...series.flatMap((s) => s.q), peakLine?.q ?? 0) * 1.12;
  const Yq = (q: number) => H - B - (q / qMax) * (H - B - split - 6);
  const step = [5, 10, 15, 20, 30, 60, 120][[5, 10, 15, 20, 30, 60, 120].findIndex((s) => tMax / s <= 8)] ?? 240;
  const ticks: number[] = [];
  for (let t = 0; t < tMax - 0.9 * step; t += step) ticks.push(t);
  ticks.push(tMax);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-hud-svg" role="img" aria-label="Aguacero e hidrograma de la cuenca">
      <rect x={L} y={top} width={W - L - R} height={split - top - 6} fill="#f7fafc" />
      <rect x={L} y={split} width={W - L - R} height={H - B - split} fill="#f7fafc" />
      {rain.map((r, k) => {
        const i = (r / dt) * 60, ie = ((eff[k] ?? 0) / dt) * 60;
        const x0 = X(k * dt) + 0.5, w = Math.max(1, X((k + 1) * dt) - X(k * dt) - 1);
        return (
          <g key={k}>
            <rect x={x0} y={top} width={w} height={Yr(i) - top} fill="#9fc6e3" />
            <rect x={x0} y={top} width={w} height={Yr(ie) - top} fill="#1f78b4" />
          </g>
        );
      })}
      {series.map((s) => (
        <polyline key={s.name} points={s.q.map((q, k) => `${X((k + 0.5) * dt).toFixed(1)},${Yq(q).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="1.9" strokeDasharray={s.dash} />
      ))}
      {peakLine && (
        <g>
          <line x1={L} x2={W - R} y1={Yq(peakLine.q)} y2={Yq(peakLine.q)} stroke="#c0632b" strokeDasharray="5 3" />
          <text x={W - R - 3} y={Yq(peakLine.q) - 3} className="hc-hud-t" textAnchor="end" fill="#9b4a1c">{peakLine.label}</text>
        </g>
      )}
      {tNow !== null && <line x1={X(tNow)} x2={X(tNow)} y1={top} y2={H - B} stroke="#c0392b" strokeWidth="1.4" />}
      {ticks.map((t, k) => (
        <text key={t} x={X(t)} y={H - 7} className="hc-hud-t" textAnchor={k === ticks.length - 1 ? 'end' : 'middle'} fill="#5b6b78">
          {k === ticks.length - 1 ? `${es(t, 0)} min` : t}
        </text>
      ))}
      <text x={L - 4} y={top + 8} className="hc-hud-t" textAnchor="end" fill="#5b6b78">{es(iMax, 0)}</text>
      <text x={4} y={11} className="hc-hud-t" fill="#5b6b78">lluvia (mm/h)</text>
      <text x={L - 4} y={Yq(qMax / 1.12) + 3} className="hc-hud-t" textAnchor="end" fill="#5b6b78">{es(qMax / 1.12, qMax < 10 ? 1 : 0)}</text>
      <text x={L - 4} y={H - B + 3} className="hc-hud-t" textAnchor="end" fill="#5b6b78">0</text>
      <text x={4} y={split + 10} className="hc-hud-t" fill="#5b6b78">m³/s</text>
      <g transform={`translate(${L + 90} 9)`}>
        <rect x={0} y={-6} width={10} height={8} fill="#9fc6e3" />
        <text x={13} y={2} className="hc-hud-t" fill="#3c4b57">total</text>
        <rect x={46} y={-6} width={10} height={8} fill="#1f78b4" />
        <text x={59} y={2} className="hc-hud-t" fill="#3c4b57">escurre</text>
        {series.map((s, k) => (
          <g key={s.name} transform={`translate(${110 + k * 98} 0)`}>
            <line x1={0} x2={12} y1={-2} y2={-2} stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
            <text x={15} y={2} className="hc-hud-t" fill="#3c4b57">{s.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

const red = (T: number) => -Math.log(-Math.log(1 - 1 / T));

/** Caudales máximos anuales en papel de Gumbel: registros, ajuste con la serie y la distribución «verdadera». */
export function GumbelChart({ pts, fit, truth, T, W = 360, H = 200 }: { pts: { x: number; T: number }[]; fit: { mu: number; sg: number }; truth: { mu: number; sg: number }; T: number; W?: number; H?: number }) {
  const L = 40, R = 10, top = 22, B = 30;
  const Ts = [1.05, 1.5, 2, 5, 10, 25, 50, 100, 200, 500];
  const yMin = red(1.05), yMax = red(500);
  const qs = [...pts.map((p) => p.x), ...Ts.map((t) => gumbelQ(fit.mu, fit.sg, t)), ...Ts.map((t) => gumbelQ(truth.mu, truth.sg, t))];
  const q0 = Math.max(0, Math.min(...qs) * 0.9), q1 = Math.max(...qs) * 1.05;
  const X = (y: number) => L + ((y - yMin) / (yMax - yMin)) * (W - L - R);
  const Y = (q: number) => H - B - ((q - q0) / (q1 - q0)) * (H - B - top);
  const line = (m: { mu: number; sg: number }) => Ts.map((t) => `${X(red(t)).toFixed(1)},${Y(gumbelQ(m.mu, m.sg, t)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-hud-svg" role="img" aria-label="Caudales máximos anuales en papel de Gumbel">
      <rect x={L} y={top} width={W - L - R} height={H - B - top} fill="#f7fafc" />
      {[2, 10, 50, 100].map((t) => (
        <g key={t}>
          <line x1={X(red(t))} x2={X(red(t))} y1={top} y2={H - B} stroke="#e3eaef" />
          <text x={X(red(t))} y={H - B + 11} className="hc-hud-t" textAnchor="middle" fill="#5b6b78">{t}</text>
        </g>
      ))}
      <polyline points={line(truth)} fill="none" stroke="#8a96a0" strokeWidth="1.3" strokeDasharray="5 3" />
      <polyline points={line(fit)} fill="none" stroke="#1f78b4" strokeWidth="1.9" />
      {pts.map((p, k) => (
        <circle key={k} cx={X(red(Math.min(499, p.T)))} cy={Y(p.x)} r="2.6" fill="#c0632b" />
      ))}
      <line x1={X(red(T))} x2={X(red(T))} y1={top} y2={H - B} stroke="#c0392b" strokeWidth="1.3" />
      <text x={W - R} y={H - 6} className="hc-hud-t" textAnchor="end" fill="#5b6b78">período de retorno (años)</text>
      <text x={L - 4} y={Y(q1 / 1.05) + 3} className="hc-hud-t" textAnchor="end" fill="#5b6b78">{es(q1 / 1.05, 0)}</text>
      <text x={L - 4} y={Y(q0 / 0.9 || q0) + 3} className="hc-hud-t" textAnchor="end" fill="#5b6b78">{es(q0 / 0.9 || q0, 0)}</text>
      <text x={4} y={13} className="hc-hud-t" fill="#5b6b78">m³/s</text>
      <g transform={`translate(${L + 24} 10)`}>
        <circle cx={4} cy={-2} r="2.6" fill="#c0632b" />
        <text x={10} y={1} className="hc-hud-t" fill="#3c4b57">años de registro</text>
        <line x1={92} x2={104} y1={-2} y2={-2} stroke="#1f78b4" strokeWidth="2" />
        <text x={107} y={1} className="hc-hud-t" fill="#3c4b57">ajuste</text>
        <line x1={146} x2={158} y1={-2} y2={-2} stroke="#8a96a0" strokeDasharray="5 3" />
        <text x={161} y={1} className="hc-hud-t" fill="#3c4b57">el río «de verdad»</text>
      </g>
    </svg>
  );
}

/** La convolución, bloque por bloque: la respuesta de cada bloque de lluvia efectiva (líneas finas) y su suma. */
export function ConvolutionChart({ dt, eff, uh, W = 480, H = 190 }: { dt: number; eff: number[]; uh: number[]; W?: number; H?: number }) {
  const L = 44, R = 10, top = 22, B = 24;
  const n = eff.length + uh.length - 1;
  const parts = eff.map((e, i) => ({ i, q: uh.map((u) => e * u) })).filter((p) => p.q.some((x) => x > 1e-6));
  const total = new Array<number>(n).fill(0);
  parts.forEach((p) => p.q.forEach((x, j) => (total[p.i + j] += x)));
  const qMax = Math.max(1e-6, ...total) * 1.1;
  const X = (k: number) => L + ((k + 0.5) / n) * (W - L - R);
  const Y = (q: number) => H - B - (q / qMax) * (H - B - top);
  const tMax = n * dt;
  const step = [5, 10, 15, 20, 30, 60][[5, 10, 15, 20, 30, 60].findIndex((s) => tMax / s <= 8)] ?? 120;
  const ticks: number[] = [];
  for (let t = 0; t < tMax - 0.9 * step; t += step) ticks.push(t);
  ticks.push(tMax);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-exp-svg cu-svg" role="img" aria-label={`Convolución: ${parts.length} bloques de lluvia efectiva, cada uno con su hidrograma; la suma da el pico de ${es(Math.max(...total), 2)} m³/s.`}>
      <rect x={L} y={top} width={W - L - R} height={H - B - top} fill="#f7fafc" />
      {parts.map((p) => (
        <polyline key={p.i} points={p.q.map((x, j) => `${X(p.i + j).toFixed(1)},${Y(x).toFixed(1)}`).join(' ')} fill="none" stroke="#9fc6e3" strokeWidth="1.1" />
      ))}
      <polyline points={total.map((x, k) => `${X(k).toFixed(1)},${Y(x).toFixed(1)}`).join(' ')} fill="none" stroke="#1f78b4" strokeWidth="2.2" />
      {ticks.map((t, k) => (
        <text key={t} x={L + (t / tMax) * (W - L - R)} y={H - 7} className="hc-hud-t" textAnchor={k === ticks.length - 1 ? 'end' : 'middle'} fill="#5b6b78">
          {k === ticks.length - 1 ? `${es(t, 0)} min` : t}
        </text>
      ))}
      <text x={L - 4} y={Y(qMax / 1.1) + 3} className="hc-hud-t" textAnchor="end" fill="#5b6b78">{es(qMax / 1.1, 1)}</text>
      <text x={L - 4} y={H - B + 3} className="hc-hud-t" textAnchor="end" fill="#5b6b78">0</text>
      <text x={4} y={12} className="hc-hud-t" fill="#5b6b78">m³/s</text>
      <g transform={`translate(${L + 40} 12)`}>
        <line x1={0} x2={12} y1={-3} y2={-3} stroke="#9fc6e3" strokeWidth="1.4" />
        <text x={15} y={1} className="hc-hud-t" fill="#3c4b57">respuesta de cada bloque</text>
        <line x1={150} x2={162} y1={-3} y2={-3} stroke="#1f78b4" strokeWidth="2.2" />
        <text x={165} y={1} className="hc-hud-t" fill="#3c4b57">suma: el hidrograma</text>
      </g>
    </svg>
  );
}

/** Las partes de un hidrograma, con los datos de la cuenca: rama ascendente, pico, recesión, retardo y volumen. */
export function HydroAnatomy({ dt, rain, eff, q, W = 480, H = 270 }: { dt: number; rain: number[]; eff: number[]; q: number[]; W?: number; H?: number }) {
  const L = 40, R = 14, top = 14, split = 84, B = 26;
  const n = Math.max(rain.length, q.length);
  const tMax = n * dt;
  const X = (t: number) => L + (t / tMax) * (W - L - R);
  const iMax = Math.max(1, ...rain.map((r) => (r / dt) * 60));
  const Yr = (i: number) => top + (i / iMax) * (split - top - 10);
  const qMax = Math.max(1e-6, ...q) * 1.25;
  const Yq = (v: number) => H - B - (v / qMax) * (H - B - split - 8);
  const kp = q.indexOf(Math.max(...q));
  const tp = (kp + 0.5) * dt;
  const effSum = eff.reduce((a, x) => a + x, 0);
  const tc = effSum > 0 ? eff.reduce((a, x, k) => a + x * (k + 0.5) * dt, 0) / effSum : 0;
  const pts = q.map((v, k) => `${X((k + 0.5) * dt).toFixed(1)},${Yq(v).toFixed(1)}`);
  const area = `M${X(0)},${Yq(0)} L${pts.join(' L')} L${X(q.length * dt)},${Yq(0)} Z`;
  const kRise = Math.max(0, Math.floor(kp * 0.6)), kFall = Math.min(q.length - 1, kp + Math.max(2, Math.round((q.length - kp) * 0.35)));
  const arrowY = Yq(Math.max(...q)) - 14;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-exp-svg cu-svg" role="img" aria-label={`Partes del hidrograma: pico de ${es(Math.max(...q), 2)} m³/s al minuto ${es(tp, 0)}, ${es(tp - tc, 0)} minutos después del centro de la lluvia efectiva.`}>
      {rain.map((r, k) => {
        const x0 = X(k * dt) + 0.5, w = Math.max(1, X((k + 1) * dt) - X(k * dt) - 1);
        return (
          <g key={k}>
            <rect x={x0} y={top} width={w} height={Yr((r / dt) * 60) - top} fill="#9fc6e3" />
            <rect x={x0} y={top} width={w} height={Yr(((eff[k] ?? 0) / dt) * 60) - top} fill="#1f78b4" />
          </g>
        );
      })}
      <text x={W - R} y={top + 10} className="lz-s" textAnchor="end" fill="#3c4b57">lluvia (en azul oscuro, la que escurre)</text>
      <path d={area} fill="#dceefa" />
      <polyline points={pts.join(' ')} fill="none" stroke="#1f78b4" strokeWidth="2.4" />
      <line x1={X(tc)} x2={X(tc)} y1={top} y2={H - B} stroke="#5b6b78" strokeDasharray="4 3" />
      <line x1={X(tp)} x2={X(tp)} y1={arrowY - 4} y2={H - B} stroke="#5b6b78" strokeDasharray="4 3" />
      <line x1={X(tc)} x2={X(tp)} y1={arrowY} y2={arrowY} stroke="#17324d" strokeWidth="1.3" />
      <path d={`M${X(tc) + 6},${arrowY - 4} L${X(tc)},${arrowY} L${X(tc) + 6},${arrowY + 4} M${X(tp) - 6},${arrowY - 4} L${X(tp)},${arrowY} L${X(tp) - 6},${arrowY + 4}`} fill="none" stroke="#17324d" strokeWidth="1.3" />
      <text x={(X(tc) + X(tp)) / 2} y={arrowY - 6} className="lz-s" textAnchor="middle" fill="#17324d">retardo {es(tp - tc, 0)} min</text>
      <circle cx={X(tp)} cy={Yq(q[kp])} r="4" fill="#c0392b" />
      <text x={X(tp) + 8} y={Yq(q[kp]) + 4} className="lz-s" fill="#c0392b">pico {es(q[kp], 2)} m³/s</text>
      <text x={X((kRise + 0.5) * dt) - 6} y={Yq(q[kRise]) - 6} className="lz-s" textAnchor="end" fill="#17324d">sube</text>
      <text x={X((kFall + 0.5) * dt) + 6} y={Yq(q[kFall]) - 6} className="lz-s" fill="#17324d">recesión</text>
      <text x={X(tp)} y={Yq(q[kp] * 0.32)} className="lz-s" textAnchor="middle" fill="#1f5f8a">volumen = lo que escurre × área</text>
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="#17324d" />
      <text x={L} y={H - 8} className="lz-s" fill="#5b6b78">0</text>
      <text x={W - R} y={H - 8} className="lz-s" textAnchor="end" fill="#5b6b78">{es(tMax, 0)} min</text>
      <text x={X(tc)} y={H - 8} className="lz-s" textAnchor="middle" fill="#5b6b78">centro de la lluvia efectiva</text>
    </svg>
  );
}

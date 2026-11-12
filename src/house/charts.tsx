// Gráficas de la sala «El agua en casa»: el consumo de cada hora del día por uso, los usos de la casa, la factura y
// sus rangos, y el tanque de agua lluvia a lo largo del año. También sirven como vista plana sin 3D.

import { es } from '../canals/common';
import { BASIC_M3, COMPLEMENTARY_M3, MONTH_NAMES, RAIN_YEAR, USE_COLORS, USE_NAMES, type BillLine, type Use } from './house';

const T = { t: 'hc-hud-t' };
const ink = { soft: '#5b6b78', mid: '#3c4b57', strong: '#17324d' };
const pesos = (x: number) => `$ ${Math.round(x).toLocaleString('es-CO')}`;

/** Litros en cada hora del día, apilados por uso; `hour` marca la hora de ahora. */
export function DayChart({ hrs, hour = null, W = 560, H = 190, cls = 'hc-hud-svg' }: { hrs: Record<Use, number[]>; hour?: number | null; W?: number; H?: number; cls?: string }) {
  const L = 38, R = 10, Tp = 24, B = 24;
  const uses = Object.keys(hrs) as Use[];
  const tot = Array.from({ length: 24 }, (_, h) => uses.reduce((s, k) => s + hrs[k][h], 0));
  const top = Math.max(10, Math.ceil(Math.max(...tot) / 20) * 20);
  const bw = (W - L - R) / 24;
  const Y = (v: number) => H - B - (v / top) * (H - Tp - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Consumo de cada hora del día; la hora de más consumo usa ${es(Math.max(...tot), 0)} litros`}>
      <rect x={L} y={Tp} width={W - L - R} height={H - Tp - B} rx="4" fill="#f5f8fb" />
      {tot.map((_, h) => {
        let acc = 0;
        return (
          <g key={h} opacity={hour === null || h <= hour ? 1 : 0.35}>
            {uses.map((k) => {
              const v = hrs[k][h];
              const y0 = Y(acc), y1 = Y(acc + v);
              acc += v;
              return v > 0 ? <rect key={k} x={L + h * bw + 1.5} y={y1} width={bw - 3} height={Math.max(0, y0 - y1)} fill={USE_COLORS[k]} /> : null;
            })}
          </g>
        );
      })}
      {hour !== null && <rect x={L + hour * bw} y={Tp} width={bw} height={H - Tp - B} fill="none" stroke={ink.strong} strokeWidth="1.4" rx="2" />}
      {[0, 6, 12, 18, 24].map((h, j) => (
        <text key={h} x={L + h * bw} y={H - 8} className={T.t} textAnchor={j === 0 ? 'start' : j === 4 ? 'end' : 'middle'} fill={ink.soft}>
          {j === 4 ? '24 h' : `${h}:00`}
        </text>
      ))}
      {[0, top / 2, top].map((v) => (
        <text key={v} x={L - 4} y={Y(v) + 3} className={T.t} textAnchor="end" fill={ink.soft}>{es(v, 0)}</text>
      ))}
      <text x={4} y={12} className={T.t} fill={ink.soft}>L/h</text>
      <g transform={`translate(${L + 6} 12)`}>
        {uses.map((k, j) => (
          <g key={k} transform={`translate(${j * 72} 0)`}>
            <rect x={0} y={-5} width={9} height={9} rx="2" fill={USE_COLORS[k]} />
            <text x={12} y={3} className={T.t} fill={ink.mid}>{USE_NAMES[k].toLowerCase()}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Litros al día de cada uso, ordenados de mayor a menor. */
export function UseBars({ u, W = 560, H = 200, cls = 'hc-exp-svg cu-svg' }: { u: Record<Use, number>; W?: number; H?: number; cls?: string }) {
  const keys = (Object.keys(u) as Use[]).sort((a, b) => u[b] - u[a]);
  const L = 92, R = 70, Tp = 10, B = 10;
  const max = Math.max(1, ...keys.map((k) => u[k]));
  const bh = (H - Tp - B) / keys.length;
  const tot = keys.reduce((s, k) => s + u[k], 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Consumo por uso: ${keys.map((k) => `${USE_NAMES[k]} ${es(u[k], 0)} litros`).join(', ')}`}>
      {keys.map((k, j) => {
        const y = Tp + j * bh;
        return (
          <g key={k}>
            <text x={L - 6} y={y + bh / 2 + 3} className={T.t} textAnchor="end" fill={ink.mid}>{USE_NAMES[k]}</text>
            <rect x={L} y={y + 3} width={Math.max(1.5, ((W - L - R) * u[k]) / max)} height={bh - 6} rx="3" fill={USE_COLORS[k]} />
            <text x={L + ((W - L - R) * u[k]) / max + 5} y={y + bh / 2 + 3} className={T.t} fill={ink.strong}>
              {es(u[k], 0)} L · {es(tot > 0 ? (u[k] / tot) * 100 : 0, 0)} %
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** La factura del mes como un recibo, con la barra de los rangos de consumo. */
export function BillView({ m3, lines, total, stratum, W = 560, H = 230, cls = 'hc-exp-svg cu-svg' }: { m3: number; lines: BillLine[]; total: number; stratum: string; W?: number; H?: number; cls?: string }) {
  const max = Math.max(COMPLEMENTARY_M3 * 1.25, m3 * 1.1);
  const L = 20, R = 20, by = H - 44;
  const X = (v: number) => L + (v / max) * (W - L - R);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={`Factura de ${es(m3, 1)} metros cúbicos: ${pesos(total)}`}>
      <rect x={10} y={8} width={W - 20} height={H - 64} rx="6" fill="#fffdf8" stroke="#d7d2c4" />
      <text x={24} y={30} className="lz-s" fill={ink.strong} fontWeight="700">Acueducto y alcantarillado · {stratum}</text>
      <text x={W - 24} y={30} className="lz-s" textAnchor="end" fill={ink.soft}>tarifa ilustrativa</text>
      {lines.map((l, k) => (
        <g key={k}>
          <text x={24} y={56 + k * 22} className="lz-s" fill={ink.mid}>{l.label}{l.m3 !== undefined ? ` (${es(l.m3, 1)} m³)` : ''}</text>
          <text x={W - 24} y={56 + k * 22} className="lz-s" textAnchor="end" fill={l.factor < 1 ? '#2e7d32' : l.factor > 1 ? '#9b2c22' : ink.strong}>
            {pesos(l.value)}{l.factor !== 1 && l.base > 0 ? ` (${l.factor < 1 ? '−' : '+'}${es(Math.abs(l.factor - 1) * 100, 0)} %)` : ''}
          </text>
        </g>
      ))}
      <line x1={24} x2={W - 24} y1={56 + lines.length * 22 - 10} y2={56 + lines.length * 22 - 10} stroke="#d7d2c4" />
      <text x={24} y={56 + lines.length * 22 + 6} className="lz-s" fill={ink.strong} fontWeight="700">Total del mes</text>
      <text x={W - 24} y={56 + lines.length * 22 + 6} className="lz-s" textAnchor="end" fill={ink.strong} fontWeight="700">{pesos(total)}</text>
      <rect x={X(0)} y={by} width={X(BASIC_M3) - X(0)} height={12} fill="#a9d4b0" />
      <rect x={X(BASIC_M3)} y={by} width={X(COMPLEMENTARY_M3) - X(BASIC_M3)} height={12} fill="#f2d27a" />
      <rect x={X(COMPLEMENTARY_M3)} y={by} width={X(max) - X(COMPLEMENTARY_M3)} height={12} fill="#e9a79b" />
      <text x={(X(0) + X(BASIC_M3)) / 2} y={by + 26} className={T.t} textAnchor="middle" fill={ink.mid}>básico</text>
      <text x={(X(BASIC_M3) + X(COMPLEMENTARY_M3)) / 2} y={by + 26} className={T.t} textAnchor="middle" fill={ink.mid}>complementario</text>
      <text x={(X(COMPLEMENTARY_M3) + X(max)) / 2} y={by + 26} className={T.t} textAnchor="middle" fill={ink.mid}>suntuario</text>
      <path d={`M${X(m3)} ${by - 2} l-5 -8 h10z`} fill={ink.strong} />
      <text x={X(m3)} y={by - 13} className={T.t} textAnchor={m3 > max * 0.8 ? 'end' : 'middle'} fill={ink.strong} fontWeight="700">{es(m3, 1)} m³</text>
    </svg>
  );
}

/** El tanque a lo largo del año: lluvia diaria arriba, agua almacenada abajo y reboses; `day` marca el día. */
export function TankChart({ S, spill, V, day = null, W = 560, H = 200, cls = 'hc-hud-svg' }: { S: number[]; spill: number[]; V: number; day?: number | null; W?: number; H?: number; cls?: string }) {
  const L = 34, R = 10, Tp = 18, B = 22;
  const n = S.length;
  const split = Tp + (H - Tp - B) * 0.3;
  const X = (d: number) => L + (d / n) * (W - L - R);
  const Ys = (v: number) => H - B - (v / Math.max(1e-9, V)) * (H - B - split - 6);
  const pMax = Math.max(...RAIN_YEAR, 1);
  const Yp = (p: number) => Tp + (p / pMax) * (split - Tp - 4);
  const until = day === null ? n - 1 : day;
  const area = `${X(0)},${Ys(0)} ${S.slice(0, until + 1).map((s, d) => `${X(d + 0.5).toFixed(1)},${Ys(s).toFixed(1)}`).join(' ')} ${X(until + 0.5)},${Ys(0)}`;
  const starts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label="Lluvia del año y agua en el tanque">
      <rect x={L} y={Tp} width={W - L - R} height={H - Tp - B} rx="4" fill="#f5f8fb" />
      {RAIN_YEAR.map((p, d) => (p > 0.2 ? <line key={d} x1={X(d + 0.5)} x2={X(d + 0.5)} y1={Tp} y2={Yp(p)} stroke="#4fa3d8" strokeWidth="1.2" opacity={d <= until ? 0.9 : 0.25} /> : null))}
      <line x1={L} x2={W - R} y1={Ys(V)} y2={Ys(V)} stroke="#2e7d32" strokeDasharray="4 3" />
      <text x={W - R - 4} y={Ys(V) - 4} className={T.t} textAnchor="end" fill="#2e7d32">lleno ({es(V, 2)} m³)</text>
      <polygon points={area} fill="#2f7fb8" fillOpacity="0.35" stroke="#1f6fa5" strokeWidth="1.2" />
      {spill.map((s, d) => (s > 0 && d <= until ? <circle key={d} cx={X(d + 0.5)} cy={Ys(V) - 3} r="1.6" fill="#e0a526" /> : null))}
      {day !== null && <line x1={X(day + 0.5)} x2={X(day + 0.5)} y1={Tp} y2={H - B} stroke={ink.strong} />}
      {starts.map((s, m) => (
        <text key={m} x={X(s + 15)} y={H - 8} className={T.t} textAnchor="middle" fill={ink.soft}>{MONTH_NAMES[m]}</text>
      ))}
      <text x={4} y={12} className={T.t} fill={ink.soft}>lluvia de cada día · agua en el tanque · ● rebosa</text>
    </svg>
  );
}

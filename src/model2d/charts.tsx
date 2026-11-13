// Gráficas de la sala 2D: un trazador XY sencillo (un solo eje vertical, leyenda y rótulos directos) y las
// gráficas de cada parte: el corte del terreno, la capacidad del cauce según el píxel, la curva cota-volumen de una
// celda y la conducción de sus caras, Gumbel, los hidrogramas, la rotura de presa y la amenaza del barrio.

import { useId } from 'react';
import { es } from '../canals/common';
import { yc, type Raster } from './terrain';
import { cellVolume, faceProps, type Geometry } from './solver';
import { periodOfY, quantile, reducedY, plotting, type GumbelFit } from './hydrology';
import { HAZARD_TEXT } from './scene';
import { LAYER_RAMPS, type Layer } from './three/valleyWorld';

export type XY = [number, number];
export interface Series {
  name: string;
  pts: XY[];
  color: string;
  dash?: boolean;
  width?: number;
  dots?: boolean;
  area?: boolean;
}

const ink = { soft: '#5b6b78', mid: '#3c4b57', strong: '#17324d', grid: '#e3e9ef' };
/** Colores de series (las tres primeras de la paleta validada, más el gris de referencia). */
export const SER = { a: '#2a78d6', b: '#eb6834', c: '#1baf7a', ref: '#17324d', soft: '#8aa0b2' };

function nice(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => span / s <= n + 0.5) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export function XYChart({
  series,
  W = 560,
  H = 210,
  xLabel,
  yLabel,
  xRange,
  yRange,
  xTicks,
  xFmt = (v) => es(v, 0),
  yFmt = (v) => es(v, 1),
  vlines = [],
  hlines = [],
  cls = 'hc-hud-svg',
  label,
}: {
  series: Series[];
  W?: number;
  H?: number;
  xLabel: string;
  yLabel: string;
  xRange?: [number, number];
  yRange?: [number, number];
  xTicks?: { v: number; t: string }[];
  xFmt?: (v: number) => string;
  yFmt?: (v: number) => string;
  vlines?: { x: number; text: string }[];
  hlines?: { y: number; text: string }[];
  cls?: string;
  label: string;
}) {
  const uid = useId().replace(/:/g, '');
  const all = series.flatMap((s) => s.pts).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  let [x0, x1] = xRange ?? [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  let [y0, y1] = yRange ?? [Math.min(...all.map((p) => p[1]), ...hlines.map((h) => h.y)), Math.max(...all.map((p) => p[1]), ...hlines.map((h) => h.y))];
  if (!Number.isFinite(x0) || !Number.isFinite(x1)) [x0, x1] = [0, 1];
  if (!Number.isFinite(y0) || !Number.isFinite(y1)) [y0, y1] = [0, 1];
  if (x1 - x0 < 1e-9) x1 = x0 + 1;
  if (y1 - y0 < 1e-9) y1 = y0 + 1;
  if (!yRange) {
    const pad = (y1 - y0) * 0.08;
    y0 -= pad;
    y1 += pad;
  }
  // con puntos, un margen a los lados para que los extremos no queden sobre los bordes del eje
  if (!xRange && series.some((q) => q.dots)) {
    const pad = (x1 - x0) * 0.04;
    x0 -= pad;
    x1 += pad;
  }
  // con leyenda, la leyenda va en su propia franja bajo el rótulo del eje y (antes se montaban)
  const L = 46, R = 12, T = series.length > 1 ? 36 : 26, B = 30;
  const X = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v: number) => H - B - ((v - y0) / (y1 - y0)) * (H - T - B);
  const path = (pts: XY[]) => pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).map(([x, y], k) => `${k ? 'L' : 'M'}${X(x).toFixed(1)},${Y(Math.max(y0, Math.min(y1, y))).toFixed(1)}`).join('');
  const yt = nice(y0, y1, 4);
  const xt = xTicks ?? nice(x0, x1, 5).map((v) => ({ v, t: xFmt(v) }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cls} role="img" aria-label={label}>
      <defs>
        <clipPath id={`${uid}c`}>
          <rect x={L} y={T} width={W - L - R} height={H - T - B} />
        </clipPath>
      </defs>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} rx="4" fill="#f7f9fb" />
      {yt.map((v) => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={ink.grid} />
          <text x={L - 5} y={Y(v) + 3} textAnchor="end" className="hc-hud-t" fill={ink.soft}>
            {yFmt(v)}
          </text>
        </g>
      ))}
      {xt.map(({ v, t }) => (
        <text key={`x${v}`} x={X(v)} y={H - B + 13} textAnchor="middle" className="hc-hud-t" fill={ink.soft}>
          {t}
        </text>
      ))}
      <g clipPath={`url(#${uid}c)`}>
        {hlines.map((h) => (
          <line key={h.text} x1={L} x2={W - R} y1={Y(h.y)} y2={Y(h.y)} stroke={ink.mid} strokeDasharray="4 3" strokeWidth="1" />
        ))}
        {vlines.map((v) => (
          <line key={v.text} x1={X(v.x)} x2={X(v.x)} y1={T} y2={H - B} stroke={ink.strong} strokeWidth="1.2" />
        ))}
        {series.map((s) =>
          s.dots ? null : (
            <g key={s.name}>
              {s.area && s.pts.length > 1 && <path d={`${path(s.pts)}L${X(s.pts[s.pts.length - 1][0])},${H - B}L${X(s.pts[0][0])},${H - B}Z`} fill={s.color} fillOpacity="0.14" />}
              <path d={path(s.pts)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash ? '5 4' : undefined} strokeLinejoin="round" />
            </g>
          ),
        )}
      </g>
      {/* los puntos van fuera del recorte: uno en el borde del eje se ve entero */}
      {series.map((s) =>
        s.dots ? (
          <g key={`d${s.name}`}>
            {s.pts
              .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
              .map(([x, y], k) => (
                <circle key={k} cx={X(x)} cy={Y(y)} r="3.6" fill={s.color} stroke="#fff" strokeWidth="1.4" />
              ))}
          </g>
        ) : null,
      )}
      {hlines.map((h) => (
        <text key={`t${h.text}`} x={W - R - 4} y={Y(h.y) - 4} textAnchor="end" className="hc-hud-t" fill={ink.mid}>
          {h.text}
        </text>
      ))}
      {vlines.map((v) => (
        <text key={`t${v.text}`} x={Math.min(W - R - 4, X(v.x) + 4)} y={T + 11} textAnchor={X(v.x) > W - 90 ? 'end' : 'start'} className="hc-hud-t" fill={ink.strong}>
          {v.text}
        </text>
      ))}
      <text x={4} y={12} className="hc-hud-t" fill={ink.soft}>
        {yLabel}
      </text>
      <text x={W - R} y={H - 4} textAnchor="end" className="hc-hud-t" fill={ink.soft}>
        {xLabel}
      </text>
      {series.length > 1 && (
        <g transform={`translate(${L + 8} 29)`}>
          {series.map((s, k) => {
            const off = series.slice(0, k).reduce((a, q) => a + 26 + q.name.length * 5.2, 0);
            return (
              <g key={s.name} transform={`translate(${off} 0)`}>
                {s.dots ? <circle cx={6} cy={-3} r="3.4" fill={s.color} /> : <line x1={0} x2={14} y1={-3} y2={-3} stroke={s.color} strokeWidth="2.2" strokeDasharray={s.dash ? '4 3' : undefined} />}
                <text x={18} y={0} className="hc-hud-t" fill={ink.mid}>
                  {s.name}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ parte 1

/** Corte norte-sur del terreno: el verdadero (MDT), el MDS si hace falta y el que ve el modelo. */
export function SectionChart({ x, secTrue, secModel, secMds, bank, W = 560, H = 210, cls, showMds }: { x: number; secTrue: number[]; secModel: number[]; secMds?: number[]; bank: number; W?: number; H?: number; cls?: string; showMds?: boolean }) {
  const c = yc(x);
  const j0 = Math.max(0, Math.floor(c - 60)), j1 = Math.min(secTrue.length - 1, Math.ceil(c + 60));
  const pts = (arr: number[]) => {
    const out: XY[] = [];
    for (let j = j0; j <= j1; j++) out.push([j - c, arr[j]], [j + 1 - c, arr[j]]);
    return out;
  };
  const lo = Math.min(...secTrue.slice(j0, j1 + 1), ...secModel.slice(j0, j1 + 1));
  const series: Series[] = [{ name: 'terreno real (MDT)', pts: pts(secTrue), color: SER.ref, width: 1.6 }];
  if (showMds && secMds) series.push({ name: 'superficie (MDS)', pts: pts(secMds), color: SER.soft, width: 1.2, dash: true });
  series.push({ name: 'lo que ve el modelo', pts: pts(secModel), color: SER.a, width: 2.2 });
  return (
    <XYChart
      series={series}
      W={W}
      H={H}
      cls={cls}
      xLabel="distancia al eje del cauce (m; + = norte)"
      yLabel="cota (m s. n. m.)"
      yRange={[lo - 0.4, lo + 6.5]}
      hlines={[{ y: bank, text: 'orilla' }]}
      label={`Corte del terreno en x = ${es(x, 0)} m: el terreno real y el que ve el modelo.`}
    />
  );
}

/** Capacidad del cauce (en % de la real) según el tamaño del píxel, para cada método de remuestreo. */
export function CapacityChart({ table, p, W = 560, H = 200, cls }: { table: { method: string; name: string; caps: [number, number][] }[]; p: number; W?: number; H?: number; cls?: string }) {
  const colors = [SER.a, SER.b, SER.c, SER.soft];
  return (
    <XYChart
      series={table.map((t, k) => ({ name: t.name.toLowerCase(), pts: t.caps, color: colors[k % colors.length], dash: k === 3 }))}
      W={W}
      H={H}
      cls={cls}
      xLabel="tamaño del píxel (m)"
      yLabel="capacidad del cauce (% de la real)"
      xRange={[1, 30]}
      yFmt={(v) => es(v, 0)}
      hlines={[{ y: 100, text: 'real' }]}
      vlines={[{ x: p, text: `${p} m` }]}
      label="Capacidad del cauce según el tamaño del píxel y el método de remuestreo."
    />
  );
}

// ------------------------------------------------------------------ parte 4

/** Curva cota-volumen de una celda: con subgrid (cada píxel) y sin él (la celda como un plano a su cota media). */
export function VolumeChart({ g, gFlat, ci, eta, W = 560, H = 200, cls }: { g: Geometry; gFlat: Geometry; ci: number; eta: number; W?: number; H?: number; cls?: string }) {
  const lo = g.zmin[ci];
  const hi = lo + 5;
  const pts = (gg: Geometry): XY[] => Array.from({ length: 81 }, (_, k) => lo - 0.2 + ((hi - lo + 0.2) * k) / 80).map((e) => [e - lo, cellVolume(gg, ci, e)] as XY);
  return (
    <XYChart
      series={[
        { name: 'con subgrid (cada píxel de 1 m)', pts: pts(g), color: SER.a },
        { name: 'sin subgrid (celda plana)', pts: pts(gFlat), color: SER.b, dash: true },
      ]}
      W={W}
      H={H}
      cls={cls}
      xLabel="nivel sobre el punto más bajo de la celda (m)"
      yLabel="volumen guardado (m³)"
      xFmt={(v) => es(v, 1)}
      yFmt={(v) => es(v, 0)}
      vlines={[{ x: eta - lo, text: `${es(cellVolume(g, ci, eta), 0)} m³` }]}
      label="Curva cota-volumen de la celda elegida, con y sin subgrid."
    />
  );
}

/** Conducción de una cara según el nivel: con subgrid (por franjas de 1 m) y sin él. */
export function ConveyanceChart({ g, gFlat, f, eta, W = 560, H = 200, cls }: { g: Geometry; gFlat: Geometry; f: number; eta: number; W?: number; H?: number; cls?: string }) {
  const lo = Math.min(g.fzmin[f], gFlat.fzmin[f]);
  const pts = (gg: Geometry): XY[] => Array.from({ length: 61 }, (_, k) => lo + (5 * k) / 60).map((e) => [e - lo, faceProps(gg, f, e).K * Math.sqrt(0.005)] as XY);
  return (
    <XYChart
      series={[
        { name: 'con subgrid', pts: pts(g), color: SER.a },
        { name: 'sin subgrid', pts: pts(gFlat), color: SER.b, dash: true },
      ]}
      W={W}
      H={H}
      cls={cls}
      xLabel="nivel sobre el punto más bajo de la cara (m)"
      yLabel="caudal con S = 0,5 % (m³/s)"
      xFmt={(v) => es(v, 1)}
      yFmt={(v) => es(v, 0)}
      vlines={[{ x: eta - lo, text: 'nivel elegido' }]}
      label="Conducción de la cara este de la celda según el nivel, con y sin subgrid."
    />
  );
}

/** Rotura de presa: Ritter, aguas someras completas e inercia local. */
export function DamBreakChart({ x, ritter, swe, li, W = 560, H = 210, cls }: { x: number[]; ritter: number[]; swe: number[]; li: number[]; W?: number; H?: number; cls?: string }) {
  const pick = (arr: number[]) => x.map((v, i) => [v, arr[i]] as XY).filter((_, i) => i % 2 === 0);
  return (
    <XYChart
      series={[
        { name: 'Ritter (exacta)', pts: pick(ritter), color: SER.ref, dash: true, width: 1.8 },
        { name: 'aguas someras completas', pts: pick(swe), color: SER.a },
        { name: 'inercia local', pts: pick(li), color: SER.b },
      ]}
      W={W}
      H={H}
      cls={cls}
      xLabel="distancia a la presa (m)"
      yLabel="profundidad (m)"
      label="Rotura de presa sobre fondo seco: solución exacta de Ritter y dos esquemas."
    />
  );
}

// ------------------------------------------------------------------ parte 3

/** Papel de Gumbel: la serie con sus periodos de Weibull, la recta ajustada y el periodo elegido. */
export function GumbelChart({ Q, fit, T, W = 560, H = 210, cls }: { Q: number[]; fit: GumbelFit; T: number; W?: number; H?: number; cls?: string }) {
  const obs = plotting(Q).map((p) => [reducedY(p.T), p.Q] as XY);
  const ys = Array.from({ length: 30 }, (_, k) => -1.6 + (k / 29) * 8);
  const line = ys.map((y) => [y, quantile(fit, periodOfY(y))] as XY);
  const ticks = [1.25, 2, 5, 10, 25, 50, 100, 500].map((t) => ({ v: reducedY(t), t: es(t, t < 2 ? 2 : 0) }));
  return (
    <XYChart
      series={[
        { name: 'máximos anuales', pts: obs, color: SER.a, dots: true },
        { name: 'Gumbel (momentos)', pts: line, color: SER.ref, width: 1.8 },
      ]}
      W={W}
      H={H}
      cls={cls}
      xLabel="periodo de retorno (años, escala de Gumbel)"
      yLabel="caudal (m³/s)"
      xRange={[-1.6, 6.4]}
      xTicks={ticks}
      yFmt={(v) => es(v, 0)}
      vlines={[{ x: reducedY(T), text: `T = ${T}: ${es(quantile(fit, T), 1)} m³/s` }]}
      label={`Ajuste de Gumbel a la serie de máximos anuales; el caudal de ${T} años es ${es(quantile(fit, T), 1)} m³/s.`}
    />
  );
}

/** Hidrogramas: lo que entra, lo que pasa bajo el puente y lo que sale. */
export function HydroChart({ t, qin, qBridge, qout, now, W = 560, H = 200, cls }: { t: number[]; qin: number[]; qBridge: number[]; qout: number[]; now?: number | null; W?: number; H?: number; cls?: string }) {
  const s = (arr: number[]) => t.map((v, i) => [v / 60, arr[i]] as XY);
  return (
    <XYChart
      // sin puente (un terreno propio) la serie no existe y tampoco su rótulo
      series={[
        { name: 'entra', pts: s(qin), color: SER.ref, dash: true, width: 1.6 },
        { name: 'bajo el puente', pts: s(qBridge), color: SER.a },
        { name: 'sale', pts: s(qout), color: SER.b },
      ].filter((q) => q.pts.some(([, y]) => Number.isFinite(y)))}
      W={W}
      H={H}
      cls={cls}
      xLabel="tiempo (min)"
      yLabel="caudal (m³/s)"
      yFmt={(v) => es(v, 0)}
      vlines={now !== undefined && now !== null ? [{ x: now / 60, text: `${es(now / 60, 0)} min` }] : []}
      label={qBridge.some(Number.isFinite) ? 'Hidrogramas de entrada, bajo el puente y de salida.' : 'Hidrogramas de entrada y de salida.'}
    />
  );
}

/** Nivel del agua aguas arriba del puente en el tiempo. */
export function StageChart({ t, wse, ref, W = 560, H = 170, cls }: { t: number[]; wse: number[]; ref?: { y: number; text: string }; W?: number; H?: number; cls?: string }) {
  return (
    <XYChart
      series={[{ name: 'nivel', pts: t.map((v, i) => [v / 60, wse[i]] as XY), color: SER.a, area: false }]}
      W={W}
      H={H}
      cls={cls}
      xLabel="tiempo (min)"
      yLabel="cota del agua aguas arriba del puente (m)"
      yFmt={(v) => es(v, 2)}
      hlines={ref ? [ref] : []}
      label="Nivel del agua aguas arriba del puente durante la creciente."
    />
  );
}

/** Área del barrio por clase de amenaza (barras horizontales con su texto). */
export function HazardBars({ areas }: { areas: number[] }) {
  const tot = areas.slice(1).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...areas.slice(1));
  return (
    <div className="m2-haz" role="img" aria-label={`Barrio inundado por clase de amenaza: ${areas.slice(1).map((a, k) => `H${k + 1} ${a} m²`).join(', ')}`}>
      {areas.slice(1).map((a, k) => (
        <div key={k} className="m2-haz-row">
          <span className="m2-haz-k" style={{ background: LAYER_RAMPS.hazard[k + 1] }}>
            H{k + 1}
          </span>
          <span className="m2-haz-bar">
            <i style={{ width: `${(a / max) * 100}%`, background: LAYER_RAMPS.hazard[k + 1] }} />
          </span>
          <span className="m2-haz-v">{es(a, 0)} m²</span>
        </div>
      ))}
      <p className="q3-small">{tot > 0 ? `${es(tot, 0)} m² del barrio con agua. ${HAZARD_TEXT[1]}; …; ${HAZARD_TEXT[6]}.` : 'El barrio queda seco.'}</p>
    </div>
  );
}

/** Leyenda de la capa de resultados. */
export function LayerLegend({ layer, maxT, eq }: { layer: Layer; maxT?: number; eq?: string }) {
  if (layer === 'amenaza' || layer === 'zonas') {
    const list = layer === 'amenaza' ? LAYER_RAMPS.hazard.slice(1).map((c, k) => [c, `H${k + 1}`]) : LAYER_RAMPS.zones.slice(1).map((c, k) => [c, ['Baja', 'Media', 'Alta'][k]]);
    return (
      <div className="m2-legend">
        {list.map(([c, t]) => (
          <span key={t}>
            <i style={{ background: c }} />
            {t}
          </span>
        ))}
      </div>
    );
  }
  const map: Record<Exclude<Layer, 'amenaza' | 'zonas'>, [readonly string[], string, string]> = {
    profundidad: [LAYER_RAMPS.depth, '0', '2,5 m o más'],
    velocidad: [LAYER_RAMPS.vel, '0', '3 m/s o más'],
    cota: [LAYER_RAMPS.wse, 'más baja', 'más alta'],
    llegada: [LAYER_RAMPS.arrival, '0 min', `${es(maxT ?? 100, 0)} min`],
    courant: [LAYER_RAMPS.courant, '0', eq === 'difusiva' ? '5 o más' : '1,25 o más'],
    iteraciones: [LAYER_RAMPS.error, '0', '4 veces la tolerancia'],
    probabilidad: [LAYER_RAMPS.prob, '0 %', '100 %'],
  };
  const [stops, a, b] = map[layer];
  return (
    <div className="m2-legend is-ramp">
      <span>{a}</span>
      <i style={{ background: `linear-gradient(90deg, ${stops.join(',')})` }} />
      <span>{b}</span>
    </div>
  );
}

/** Lluvia y escorrentía acumuladas [mm] y el hietograma en bloques. */
export function RainChart({ blocks, t, rain, excess, W = 560, H = 190, cls }: { blocks: number[]; t?: number[]; rain?: number[]; excess?: number[]; W?: number; H?: number; cls?: string }) {
  const cum: XY[] = [[0, 0]];
  blocks.forEach((b, k) => cum.push([(k + 1) * 5, cum[k][1] + b]));
  const series: Series[] = [{ name: 'lluvia acumulada', pts: cum, color: SER.a, width: 2 }];
  if (t && excess && excess.length) series.push({ name: 'escorrentía (modelo)', pts: t.map((x, k) => [x / 60, excess[k]] as XY).filter(([x]) => x >= 0), color: SER.b, width: 2.4 });
  void rain;
  return <XYChart series={series} W={W} H={H} cls={cls} xLabel="tiempo (min)" yLabel="mm" label="Lluvia acumulada del hietograma de bloques alternos y la escorrentía que entra al modelo con el número de curva." />;
}

/** Perfil longitudinal por el eje del cauce: fondo, orillas, corona del jarillón y agua máxima. */
export function ProfileChart({ x, bed, bank, wse, crest, other, W = 560, H = 200, cls }: { x: number[]; bed: number[]; bank: number[]; wse: number[]; crest?: (number | null)[]; other?: { name: string; wse: number[] }; W?: number; H?: number; cls?: string }) {
  const series: Series[] = [
    { name: 'agua máxima', pts: x.map((v, k) => [v, wse[k]] as XY), color: SER.a, width: 2.4 },
    { name: 'orilla', pts: x.map((v, k) => [v, bank[k]] as XY), color: SER.soft, dash: true },
    { name: 'fondo', pts: x.map((v, k) => [v, bed[k]] as XY), color: SER.ref },
  ];
  if (crest) series.splice(1, 0, { name: 'corona del jarillón', pts: x.map((v, k) => [v, crest[k] ?? NaN] as XY).filter(([, y]) => Number.isFinite(y)), color: SER.b, dash: true });
  if (other) series.splice(1, 0, { name: other.name, pts: x.map((v, k) => [v, other.wse[k]] as XY), color: SER.c, width: 2 });
  return <XYChart series={series} W={W} H={H} cls={cls} xLabel="abscisa por el valle (m)" yLabel="cota (m)" yFmt={(v) => es(v, 1)} label="Perfil longitudinal por el eje del cauce: fondo, orillas, corona del jarillón y la cota máxima del agua." />;
}

export function rasterNote(r: Raster): string {
  return `${r.CX} × ${r.CY} píxeles de ${r.p} m`;
}

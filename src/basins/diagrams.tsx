// Esquemas planos de la sala «Cuencas»: la cuenca vista desde arriba (coberturas, red de drenaje, salida) y el corte
// del río con el nivel del agua y las casas de la llanura. Se ven en la pestaña Esquema y, sin WebGL, en lugar de la
// escena 3D. El corte del río dice su exageración vertical.

import { useId } from 'react';
import { es } from '../canals/common';
import type { BasinResult, Cover } from './hydrology';
import { RIVER, RIVER_HOUSES, groundAt } from './river';

const COLOR: Record<Cover, string> = { pavimento: '#8d8f91', barrio: '#cdb08f', cultivo: '#c9b860', pasto: '#93c06c', bosque: '#3f7a3a' };
const ORDER: Cover[] = ['pavimento', 'barrio', 'cultivo', 'pasto', 'bosque'];
const INK = '#17324d';

const SHORT: Record<Cover, string> = { pavimento: 'Vías', barrio: 'Barrio', cultivo: 'Cultivos', pasto: 'Pasto', bosque: 'Bosque' };

/** La cuenca desde arriba: las coberturas van de la salida (zonas duras) a la cabecera (bosque), como en la escena. */
export function BasinMap({ r, tNow }: { r: BasinResult; tNow?: number | null }) {
  const uid = useId().replace(/:/g, '');
  const W = 560, H = 290;
  // contorno de la cuenca: una gota alargada con la salida a la derecha
  const outline = 'M452,150 C430,96 360,34 250,26 C150,20 52,52 30,124 C14,178 60,250 170,266 C280,280 400,224 452,150 Z';
  const x0 = 22, x1 = 452;
  // franjas de coberturas desde la salida, con el ancho de su fracción
  let acc = 0;
  const shown = ORDER.filter((c) => r.inp.mix[c] > 0.001);
  const bands = shown.map((c) => {
    const a = acc, b = acc + r.inp.mix[c];
    acc = b;
    return { c, xa: x1 - a * (x1 - x0), xb: x1 - b * (x1 - x0) };
  });
  const main = 'M58,150 C110,118 160,176 220,150 S330,128 370,152 S430,152 452,150';
  const tribs = ['M118,52 C130,90 140,120 150,148', 'M250,262 C252,220 258,186 262,152', 'M352,40 C356,80 362,118 368,150'];
  const playing = tNow !== null && tNow !== undefined;
  const k = playing ? Math.floor((tNow as number) / r.dt) : -1;
  const Qnow = k >= 0 && k < r.hydro.length ? r.hydro[k] : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} className="hc-exp-svg cu-svg" role="img" aria-label={`Cuenca ilustrativa vista desde arriba: ${es(r.inp.A, 0)} ha, cauce principal de ${es(r.inp.L, 0)} m y tiempo de concentración de ${es(r.tc.used, 0)} minutos.`}>
      <defs>
        <clipPath id={`bm-${uid}`}>
          <path d={outline} />
        </clipPath>
      </defs>
      <g clipPath={`url(#bm-${uid})`}>
        {bands.map((b) => (
          <rect key={b.c} x={b.xb} y={0} width={b.xa - b.xb + 0.5} height={H} fill={COLOR[b.c]} />
        ))}
      </g>
      <path d={outline} fill="none" stroke="#5b4630" strokeWidth="2" strokeDasharray="6 4" />
      {tribs.map((d) => (
        <path key={d} d={d} fill="none" stroke="#2f84b5" strokeWidth="2.2" strokeLinecap="round" />
      ))}
      <path d={main} fill="none" stroke="#2f84b5" strokeWidth={3.4 + (playing ? 3 * Math.min(1, Qnow / Math.max(1e-6, r.Qpeak)) : 0)} strokeLinecap="round" />
      <circle cx={58} cy={150} r="5" fill="#fff" stroke={INK} strokeWidth="1.6" />
      <text x={44} y={176} className="lz-s" fill="#fff" stroke="#17324d" strokeWidth="3" paintOrder="stroke">
        el punto más lejano
      </text>
      <rect x={445} y={144} width={14} height={11} fill="#d9d4c7" stroke={INK} />
      <text x={466} y={140} className="lz-s" fill={INK}>salida y</text>
      <text x={466} y={154} className="lz-s" fill={INK}>estación</text>
      <text x={466} y={172} className="lz-m" fill="#1f5f8a">{es(playing ? Qnow : r.Qpeak, 2)} m³/s</text>
      <text x={466} y={186} className="lz-s" fill={INK}>{playing ? 'ahora' : 'en el pico'}</text>
      <text x={12} y={16} className="lz-s" fill={INK}>
        A = {es(r.inp.A, 0)} ha · cauce de {es(r.inp.L, 0)} m · tc = {es(r.tc.used, 0)} min (sin escala)
      </text>
      <g transform={`translate(14 ${H + 8})`}>
        {shown.map((c, i) => (
          <g key={c} transform={`translate(${(i % 3) * 170} ${Math.floor(i / 3) * 15})`}>
            <rect x={0} y={-9} width={11} height={11} fill={COLOR[c]} stroke="#0003" />
            <text x={16} y={0} className="lz-s" fill={INK}>
              {SHORT[c]} {es(r.inp.mix[c] * 100, 0)} %
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Corte del río con las llanuras: nivel del agua, niveles de los períodos de retorno y las casas. */
export function RiverSection({ y, marks, label }: { y: number; marks: { T: number; y: number }[]; label: string }) {
  const W = 480, H = 250, L = 34, R = 10, top = 30, B = 52;
  const zMax = 85, yMax = 5.5;
  const X = (z: number) => L + ((z + zMax) / (2 * zMax)) * (W - L - R);
  const Y = (h: number) => H - B - (h / yMax) * (H - B - top);
  const ex = ((2 * zMax) / (W - L - R)) / (yMax / (H - B - top));
  const zs: number[] = [];
  for (let z = -zMax; z <= zMax + 1e-9; z += 0.5) zs.push(z);
  const ground = `M${X(-zMax)},${H - B + 6} ` + zs.map((z) => `L${X(z).toFixed(1)},${Y(Math.min(yMax, groundAt(z))).toFixed(1)}`).join(' ') + ` L${X(zMax)},${H - B + 6} Z`;
  // agua: entre el terreno y el nivel, donde el terreno está más bajo
  const wet = zs.filter((z) => groundAt(z) < y);
  const zl = wet[0] ?? 0, zr = wet[wet.length - 1] ?? 0;
  const water = wet.length ? `M${X(zl)},${Y(y)} ` + wet.map((z) => `L${X(z).toFixed(1)},${Y(groundAt(z)).toFixed(1)}`).join(' ') + ` L${X(zr)},${Y(y)} Z` : '';
  const colors = ['#2e7d32', '#b58900', '#e67e22', '#c0392b'];
  // un nivel se dibuja solo donde queda sobre el terreno
  const span = (h: number) => {
    const w = zs.filter((z) => groundAt(z) < h);
    return w.length ? [w[0], w[w.length - 1]] : [0, 0];
  };
  const hs = RIVER_HOUSES.filter((h) => Math.abs(h.z) <= zMax).map((h) => ({ z: h.z, y: h.y, wet: Math.max(0, y - h.y) }));
  const nWet = RIVER_HOUSES.filter((h) => y - h.y > 0.05).length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-exp-svg cu-svg" role="img" aria-label={`Corte del río: el agua a ${es(y, 2)} m sobre el fondo; ${nWet} de ${RIVER_HOUSES.length} casas con agua adentro.`}>
      <text x={L} y={16} className="lz-m" fill={INK}>
        {label}: {es(y, 2)} m sobre el fondo · {nWet ? `${nWet} casas con agua` : 'casas secas'}
      </text>
      <path d={ground} fill="#c7b089" stroke="#7b6a52" strokeWidth="1.2" />
      {water && <path d={water} fill="#4f9fd2" fillOpacity="0.85" stroke="#2f7fb0" strokeWidth="1" />}
      {marks.map((m, k) => {
        const [a, b] = span(m.y);
        return <line key={m.T} x1={X(a)} x2={X(b)} y1={Y(m.y)} y2={Y(m.y)} stroke={colors[k % 4]} strokeWidth="1.4" strokeDasharray="5 3" />;
      })}
      {hs.map((h, k) => {
        const cx = X(h.z), by = Y(h.y);
        return <path key={k} d={`M${cx - 6},${by} V${by - 9} L${cx},${by - 15} L${cx + 6},${by - 9} V${by} Z`} fill={h.wet > 0.05 ? '#f6d4cc' : '#f4efe4'} stroke={h.wet > 0.05 ? '#c0392b' : INK} strokeWidth="1.3" />;
      })}
      <text x={L - 4} y={Y(0) + 4} className="lz-s" textAnchor="end" fill={INK}>0</text>
      <text x={L - 4} y={Y(RIVER.bank) + 4} className="lz-s" textAnchor="end" fill={INK}>{RIVER.bank}</text>
      <text x={L - 4} y={Y(5) + 4} className="lz-s" textAnchor="end" fill={INK}>5 m</text>
      <g transform={`translate(${L} ${H - B + 22})`}>
        {marks.map((m, k) => (
          <g key={m.T} transform={`translate(${k * 108} 0)`}>
            <line x1={0} x2={14} y1={-4} y2={-4} stroke={colors[k % 4]} strokeWidth="2" strokeDasharray="5 3" />
            <text x={18} y={0} className="lz-s" fill={INK}>
              {m.T} años {es(m.y, 2)} m
            </text>
          </g>
        ))}
      </g>
      <text x={L} y={H - 8} className="lz-s" fill="#5b6b78">casa en rojo: con agua adentro</text>
      <text x={W - R} y={H - 8} className="lz-s" textAnchor="end" fill="#5b6b78">
        {2 * zMax} m de ancho · escala vertical × {es(ex, 0)}
      </text>
    </svg>
  );
}

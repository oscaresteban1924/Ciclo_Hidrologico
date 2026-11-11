// Esquemas planos de la hidráulica de canales: la sección del canal con su perfil de velocidades, el perfil de la
// caída con la línea de energía y la curva de energía específica, el perfil del remanso con el corte del puente,
// y la estructura de aforo con su carga. Se ven en la pestaña Esquema y, sin WebGL, en lugar de la escena 3D.
// Cuando la escala vertical no es la horizontal, el dibujo lo dice.

import { useMemo } from 'react';
import { Arrow, INK, Lead, Lens, SH, Tag, useLensUid, useTime, wrap, type Chip } from '../quality/lensKit';
import { CREEK, DEBRIS, FLUME, G, MATERIALS, SHAPES, geom, type BridgeResult, type GaugeResult, type JumpResult, type UniformInput, type UniformResult } from './hydraulics';
import { bridgeSurface, jumpSurface } from './profiles';

export const es = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const WATER = '#4f9fd2';
const WATER_D = '#2f7fb0';
const CONC = '#c9c4ba';
const SOIL = '#8a6a48';

function exLabel(ex: number): string {
  return ex > 1.05 ? `escala vertical × ${es(ex, ex < 10 ? 1 : 0)}` : 'misma escala en los dos ejes';
}

// ------------------------------------------------------------------ 1. la sección

export function SectionDiagram({ inp, r }: { inp: UniformInput; r: UniformResult }) {
  const id = useLensUid();
  const t = useTime();
  const s = SHAPES[inp.shape];
  const pressure = Number.isNaN(r.yn);
  const y = pressure ? s.D : Math.min(r.yn, s.shape === 'circ' ? s.D : s.H + 0.4);
  const topW = s.shape === 'circ' ? s.D : geom(s, s.H).T;
  const sc = Math.min(230 / (topW + 1.2), 165 / (s.H + 0.5));
  const cx = 150, by = 210;
  const X = (z: number) => cx + z * sc, Y = (h: number) => by - h * sc;
  const lin = MATERIALS[inp.material];
  const linCol = inp.material === 'concreto' ? '#bdb8ae' : inp.material === 'piedra' ? '#8d8376' : inp.material === 'tierra' ? '#8a6747' : inp.material === 'pasto' ? '#5d8c3b' : '#8a7d68';
  const z = s.shape === 'trap' ? s.z : 0;
  const water =
    s.shape === 'circ'
      ? (() => {
          const R = s.D / 2, h = Math.min(y, s.D), a = Math.acos(Math.max(-1, Math.min(1, (R - h) / R)));
          const pts: string[] = [];
          for (let k = 0; k <= 40; k++) {
            const ang = -Math.PI / 2 - a + (2 * a * k) / 40;
            pts.push(`${X(R * Math.cos(ang))},${Y(R + R * Math.sin(ang))}`);
          }
          return pts.join(' ');
        })()
      : `${X(-s.b / 2)},${Y(0)} ${X(s.b / 2)},${Y(0)} ${X(s.b / 2 + z * y)},${Y(y)} ${X(-s.b / 2 - z * y)},${Y(y)}`;
  // perfil de velocidades (ley de potencia 1/7, forma típica), con la media a 0,6 de la profundidad desde la superficie
  const px = 345, pw = 110, py0 = 210, ph = 150;
  const prof = [...Array(13)].map((_, k) => {
    const f = k / 12;
    return `${px + pw * Math.pow(Math.max(0.001, f), 1 / 7)},${py0 - ph * f}`;
  });
  const c = Math.sqrt(G * Math.max(0.01, r.A / Math.max(0.01, r.T)));
  const upWave = c - r.V;
  const chips: Chip[] = pressure
    ? [
        { label: 'Caudal', value: `${es(inp.Q, 1)} m³/s` },
        { label: 'El tubo', value: 'a presión', tone: 'bad' },
        { label: 'Cabe con superficie libre', value: `${es(r.Qbrim, 2)} m³/s` },
      ]
    : [
        { label: 'Profundidad normal', value: `${es(r.yn)} m`, tone: r.freeboardOk ? 'ok' : 'bad' },
        { label: 'Velocidad media', value: `${es(r.V)} m/s`, tone: r.erosion || r.sediment ? 'bad' : 'info' },
        { label: 'Froude', value: es(r.F), tone: r.unstable ? 'bad' : r.F > 1 ? 'mid' : 'info' },
        { label: 'Esfuerzo en el fondo', value: `${es(r.tau, 0)} Pa` },
      ];
  return (
    <Lens uid={id} label={`Sección del canal ${inp.shape === 'circ' ? 'circular' : inp.shape === 'trap' ? 'trapecial' : 'rectangular'} de ${lin.name.toLowerCase()} con el agua a la profundidad normal, y la forma típica del perfil de velocidades.`} chips={chips}>
      {/* terreno y revestimiento */}
      {s.shape === 'circ' ? (
        <g>
          <rect x="0" y={Y(-0.25)} width="300" height={SH - Y(-0.25)} fill="#a5ba86" />
          <circle cx={X(0)} cy={Y(s.D / 2)} r={(s.D / 2) * sc + 7} fill="none" stroke="#a9a49a" strokeWidth="14" />
          <circle cx={X(0)} cy={Y(s.D / 2)} r={(s.D / 2) * sc} fill="#eef5f8" />
        </g>
      ) : (
        <g>
          <path d={`M0 ${Y(s.H)} H${X(-s.b / 2 - z * s.H - 0.2)} L${X(-s.b / 2 - 0.2)} ${Y(-0.2)} H${X(s.b / 2 + 0.2)} L${X(s.b / 2 + z * s.H + 0.2)} ${Y(s.H)} H300 V${SH} H0Z`} fill={SOIL} />
          <rect x="0" y={Y(s.H) - 6} width="300" height="6" fill="#6a9a48" />
          <path d={`M${X(-s.b / 2 - z * s.H - 0.2)} ${Y(s.H)} L${X(-s.b / 2 - 0.2)} ${Y(-0.2)} H${X(s.b / 2 + 0.2)} L${X(s.b / 2 + z * s.H + 0.2)} ${Y(s.H)} H${X(s.b / 2 + z * s.H)} L${X(s.b / 2)} ${Y(0)} H${X(-s.b / 2)} L${X(-s.b / 2 - z * s.H)} ${Y(s.H)}Z`} fill={linCol} stroke="#5e5a52" strokeWidth="1" />
          <path d={`M${X(-s.b / 2 - z * s.H)} ${Y(s.H)} L${X(-s.b / 2)} ${Y(0)} H${X(s.b / 2)} L${X(s.b / 2 + z * s.H)} ${Y(s.H)}`} fill="#eef5f8" />
        </g>
      )}
      <polygon points={water} fill={r.erosion ? '#a3865c' : r.sediment ? '#6aa395' : WATER} opacity="0.9" />
      {!pressure && <path d={`M${X(s.shape === 'circ' ? -r.T / 2 : -s.b / 2 - z * y)} ${Y(y)} q 6 ${-2 * Math.sin(t * 3)} 12 0 t 12 0 t 12 0`} fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.8" />}
      {/* cotas */}
      {!pressure && (
        <g>
          <Arrow d={`M${X(0) + 4} ${Y(0)} V${Y(y) + 2}`} kind="ink" w={1.4} />
          <Arrow d={`M${X(0) + 4} ${Y(y)} V${Y(0) - 2}`} kind="ink" w={1.4} />
          <Tag x={X(0) + 9} y={(Y(0) + Y(y)) / 2 + 4} size="s">
            {`y = ${es(r.yn)} m`}
          </Tag>
          {s.shape !== 'circ' && (
            <g>
              <line x1={X(s.b / 2 + z * s.H) + 14} y1={Y(Math.min(y, s.H))} x2={X(s.b / 2 + z * s.H) + 14} y2={Y(s.H)} stroke={r.freeboardOk ? '#2f8f55' : '#c0462a'} strokeWidth="3" />
              <Tag x={X(s.b / 2 + z * s.H) + 19} y={Y(s.H) + 12} size="s" color={r.freeboardOk ? '#2f8f55' : '#a3321d'}>
                {r.overflow ? 'se desborda' : `borde libre ${es(s.H - y)} m`}
              </Tag>
            </g>
          )}
        </g>
      )}
      <Tag x={8} y={16} size="s">
        {inp.shape === 'circ' ? `tubo de ${es(s.D, 1)} m` : inp.shape === 'trap' ? `fondo ${es(s.b, 1)} m · talud ${es(s.z, 1)}:1 · paredes ${es(s.H, 1)} m` : `ancho ${es(s.b, 1)} m · paredes ${es(s.H, 1)} m`}
      </Tag>
      {/* perfil de velocidades */}
      <line x1={px} y1={py0} x2={px} y2={py0 - ph} stroke={INK} strokeWidth="1.2" />
      <line x1={px} y1={py0} x2={px + pw + 6} y2={py0} stroke={INK} strokeWidth="1.2" />
      <polyline points={prof.join(' ')} fill="none" stroke={WATER_D} strokeWidth="2.4" />
      {[0.1, 0.3, 0.5, 0.7, 0.9].map((f) => {
        const len = pw * Math.pow(f, 1 / 7);
        const off = r.V > 0 && !pressure ? wrap(t * 30 * Math.min(3, r.V), 14) : 0;
        return <Arrow key={f} d={`M${px} ${py0 - ph * f} h${Math.max(4, len - 14 + off * 0)}`} kind="water" w={1.4} opacity={0.75} />;
      })}
      <line x1={px} y1={py0 - ph * 0.4} x2={px + pw * Math.pow(0.4, 1 / 7)} y2={py0 - ph * 0.4} stroke="#c0462a" strokeWidth="1.2" strokeDasharray="3 2" />
      <Tag x={px + 4} y={py0 - ph * 0.4 - 4} size="s" color="#a3321d">
        media, a 0,6 de la superficie
      </Tag>
      <Tag x={px} y={py0 - ph - 8} size="s">
        velocidad (forma típica)
      </Tag>
      <Tag x={px} y={py0 + 14} size="s">
        {pressure ? '' : `superficie ≈ ${es(r.V / 0.85, 2)} m/s`}
      </Tag>
      {/* ondas de una piedra */}
      {!pressure && (
        <g>
          <Tag x={px} y={py0 + 30} size="s" color={upWave > 0 ? '#2f8f55' : '#a3321d'}>
            {upWave > 0 ? `una onda sube a ${es(upWave, 1)} m/s` : 'las ondas no pueden subir'}
          </Tag>
        </g>
      )}
    </Lens>
  );
}

// ------------------------------------------------------------------ 2. la caída

export function JumpDiagram({ r }: { r: JumpResult }) {
  const id = useLensUid();
  const prof = useMemo(() => jumpSurface(r), [r]);
  const { drop, weir, basin } = r.inp;
  const L = r.chuteLen;
  const xa = -L - 8, xb = basin + 9;
  const sx = 300 / (xb - xa);
  const zTop = Math.max(drop + r.yc * 1.6, r.E0, r.ytw) + 0.6;
  const sy = Math.min(210 / (zTop + 0.6), sx * 6);
  const X = (x: number) => 10 + (x - xa) * sx, Y = (z: number) => 236 - z * sy;
  const pts = prof.pts.filter((p) => p.x >= xa && p.x <= xb);
  const surf = pts.map((p) => `${X(p.x)},${Y(p.bed + p.y)}`).join(' ');
  const bedL = pts.map((p) => `${X(p.x)},${Y(p.bed)}`).reverse().join(' ');
  const egl = prof.egl.filter((p) => p.x >= xa && p.x <= xb).map((p) => `${X(p.x)},${Y(p.e)}`).join(' ');
  const [j0, j1] = prof.jump;
  // curva de energía específica (por metro de ancho)
  const q = r.q;
  const E = (y: number) => y + (q * q) / (2 * G * y * y);
  const ys = [...Array(60)].map((_, k) => r.y1 * 0.7 + ((Math.max(r.y2, r.ytw) * 1.25 - r.y1 * 0.7) * k) / 59);
  const Emax = Math.max(...ys.map(E).filter((e) => e < E(r.y1) * 1.3)), ymax = ys[ys.length - 1];
  const ix = 330, iy = 14, iw = 140, ih = 110;
  const EX = (e: number) => ix + (Math.min(e, Emax) / Emax) * iw, EY = (y: number) => iy + ih - (y / ymax) * ih;
  const chips: Chip[] = [
    { label: 'Al pie de la rápida', value: `${es(r.y1)} m · F ${es(r.F1, 1)}` },
    { label: 'Conjugada / pozo', value: `${es(r.y2)} / ${es(r.ytw)} m`, tone: r.place === 'barrido' ? 'bad' : r.place === 'ahogado' ? 'mid' : 'ok' },
    { label: 'Energía disipada', value: `${es(r.dissipated * 100, 0)} %` },
  ];
  return (
    <Lens uid={id} label="Perfil de la caída: el canal de arriba, la rápida, el pozo con el resalto y el vertedero, con la línea de energía; al lado, la curva de energía específica." chips={chips}>
      <polygon points={`${surf} ${bedL}`} fill={WATER} opacity="0.85" />
      <polyline points={pts.map((p) => `${X(p.x)},${Y(p.bed)}`).join(' ')} fill="none" stroke="#7e786d" strokeWidth="3" />
      <rect x={X(basin)} y={Y(weir)} width={Math.max(2, sx)} height={Y(0) - Y(weir)} fill={CONC} stroke="#7e786d" />
      {pts
        .filter((p) => p.foam > 0.55)
        .map((p, k) => (
          <circle key={k} cx={X(p.x)} cy={Y(p.bed + p.y) + 2} r={1.6 + (k % 3)} fill="#ffffff" opacity="0.85" />
        ))}
      <polyline points={egl} fill="none" stroke="#d0342c" strokeWidth="1.4" strokeDasharray="5 3" />
      <Tag x={X(xa) + 2} y={Y(r.E0) - 5} size="s" color="#a3321d">
        línea de energía
      </Tag>
      <Lead x1={X(-L) - 6} y1={Y(drop + r.yc) - 18} x2={X(-L)} y2={Y(drop + r.yc)} />
      <Tag x={X(-L) - 8} y={Y(drop + r.yc) - 22} anchor="end" size="s">
        {`crítica ${es(r.yc)} m`}
      </Tag>
      <Lead x1={X(0) + 8} y1={Y(r.y1) - 26} x2={X(0) + 1} y2={Y(r.y1)} />
      <Tag x={X(0) + 10} y={Y(r.y1) - 30} size="s">
        {`y1 = ${es(r.y1)} m`}
      </Tag>
      <line x1={X(j0)} y1={Y(-0.3)} x2={X(j1)} y2={Y(-0.3)} stroke={r.contained ? '#2f8f55' : '#c0462a'} strokeWidth="2.5" />
      <Tag x={(X(j0) + X(j1)) / 2} y={Y(-0.3) + 13} anchor="middle" size="s" color={r.contained ? '#2f8f55' : '#a3321d'}>
        {r.place === 'barrido' ? 'resalto fuera del pozo' : `resalto: ${es(r.Lj, 1)} m`}
      </Tag>
      <line x1={X(0)} y1={Y(0) + 4} x2={X(basin)} y2={Y(0) + 4} stroke={INK} strokeWidth="1" />
      <Tag x={X(basin) - 2} y={Y(0) - 4} anchor="end" size="s">
        {`pozo ${es(basin, 0)} m`}
      </Tag>
      <Tag x={10} y={250} size="s" color="#5b6b78">
        {exLabel(sy / sx)}
      </Tag>
      {/* curva de energía específica */}
      <rect x={ix - 6} y={iy - 6} width={iw + 14} height={ih + 34} rx="6" fill="#ffffff" stroke="#c8d6df" />
      <polyline points={ys.filter((y) => E(y) <= Emax).map((y) => `${EX(E(y))},${EY(y)}`).join(' ')} fill="none" stroke={WATER_D} strokeWidth="2" />
      <line x1={ix} y1={iy + ih} x2={ix + iw} y2={iy + ih} stroke={INK} />
      <line x1={ix} y1={iy} x2={ix} y2={iy + ih} stroke={INK} />
      <line x1={ix} y1={EY(r.yc)} x2={EX(1.5 * r.yc)} y2={EY(r.yc)} stroke="#5b6b78" strokeDasharray="2 2" />
      <circle cx={EX(E(r.y1))} cy={EY(r.y1)} r="3.5" fill="#c0462a" />
      <circle cx={EX(E(r.y2))} cy={EY(r.y2)} r="3.5" fill="#2f8f55" />
      <Arrow d={`M${EX(E(r.y1)) - 3} ${EY(r.y1) - 4} L${EX(E(r.y2)) + 4} ${EY(r.y2) + 4}`} kind="warn" w={1.4} />
      <Tag x={ix + 2} y={iy + ih + 14} size="s">
        energía E = y + V²/2g
      </Tag>
      <Tag x={EX(E(r.y2)) + 6} y={EY(r.y2) + 4} size="s">
        y2
      </Tag>
      <Tag x={EX(E(r.y1)) - 18} y={EY(r.y1) + 4} anchor="end" size="s">
        y1
      </Tag>
      <Tag x={ix + 4} y={EY(r.yc) - 3} size="s" color="#5b6b78">
        crítica
      </Tag>
      <Tag x={ix + iw} y={iy + ih + 26} anchor="end" size="s" color="#a3321d">
        {`el resalto pierde ${es(r.dEjump)} m`}
      </Tag>
    </Lens>
  );
}

// ------------------------------------------------------------------ 3. el puente

export function BridgeDiagram({ r }: { r: BridgeResult }) {
  const id = useLensUid();
  const Ls = Math.min(4000, Math.max(80, r.backwater * 1.12));
  const pts = useMemo(() => bridgeSurface(r, -Ls, 40, 1), [r, Ls]);
  const deckTop = r.inp.soffit + CREEK.deck;
  const top = Math.max(r.yU, deckTop, CREEK.H) + 0.6;
  const x0 = 10, x1 = 320, y0 = 228;
  const sx = (x1 - x0) / (Ls + 40);
  const sy = 190 / top;
  const X = (x: number) => x0 + (x + Ls) * sx, Y = (d: number) => y0 - d * sy;
  const surf = pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ');
  const spill = pts.filter((p) => p.y > CREEK.H);
  // corte del puente
  const ix = 340, iw = 128, ib = 120, ih = 100;
  const cs = Math.min(iw / (CREEK.b + 1), ih / (top + 0.2));
  const CX = (z: number) => ix + iw / 2 + z * cs, CY = (d: number) => ib - d * cs;
  const half = r.inp.span / 2, blk = DEBRIS[r.inp.debris].block;
  const chips: Chip[] = [
    { label: 'Normal (sin puente)', value: `${es(r.yn)} m` },
    { label: 'En el puente', value: `${es(r.yU)} m`, tone: r.spill ? 'bad' : r.flow === 'libre' ? 'ok' : 'mid' },
    { label: 'Remanso', value: r.backwater > 1 ? `${Math.round(r.backwater).toLocaleString('es-CO')} m` : 'no hay', tone: r.backwater > 1 ? 'mid' : 'ok' },
  ];
  return (
    <Lens uid={id} label="Perfil de la quebrada aguas arriba del puente: profundidad del agua, profundidad normal y crítica, altura de las paredes y del puente; al lado, el corte del puente con lo que lo tapa." chips={chips}>
      <rect x={x0} y={Y(0)} width={x1 - x0} height="4" fill="#7e786d" />
      <polygon points={`${X(-Ls)},${Y(0)} ${surf} ${X(40)},${Y(0)}`} fill={WATER} opacity="0.85" />
      {spill.length > 1 && <polygon points={`${spill.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} ${X(spill[spill.length - 1].x)},${Y(CREEK.H)} ${X(spill[0].x)},${Y(CREEK.H)}`} fill="#c0462a" opacity="0.45" />}
      <line x1={x0} y1={Y(CREEK.H)} x2={x1} y2={Y(CREEK.H)} stroke="#8a6747" strokeWidth="2" />
      <Tag x={x0 + 2} y={Y(CREEK.H) - 4} size="s" color="#6b4f33">
        borde de las paredes (3 m)
      </Tag>
      <line x1={x0} y1={Y(r.yn)} x2={x1} y2={Y(r.yn)} stroke={INK} strokeDasharray="6 3" />
      <Tag x={x1 - 2} y={Y(r.yn) + 12} anchor="end" size="s">
        normal
      </Tag>
      <line x1={x0} y1={Y(r.yc)} x2={x1} y2={Y(r.yc)} stroke="#5b6b78" strokeDasharray="2 3" />
      <Tag x={x1 - 2} y={Y(r.yc) + 12} anchor="end" size="s" color="#5b6b78">
        crítica
      </Tag>
      <rect x={X(-3)} y={Y(deckTop)} width={Math.max(5, 6 * sx)} height={(r.inp.soffit < deckTop ? CREEK.deck : 0) * sy} fill={CONC} stroke="#7e786d" />
      <rect x={X(-3)} y={Y(r.inp.soffit)} width={Math.max(5, 6 * sx)} height={0} stroke="#7e786d" />
      <Tag x={X(0)} y={Y(deckTop) - 6} anchor="middle" size="s">
        puente
      </Tag>
      <Tag x={x0} y={250} size="s" color="#5b6b78">
        {`${Math.round(Ls).toLocaleString('es-CO')} m aguas arriba · profundidades × ${es((sy / sx), 0)} · el fondo se dibuja recto`}
      </Tag>
      {/* corte del puente */}
      <rect x={ix - 6} y={8} width={iw + 12} height={ib + 26} rx="6" fill="#ffffff" stroke="#c8d6df" />
      <rect x={CX(-CREEK.b / 2) - 4} y={CY(CREEK.H)} width="4" height={CREEK.H * cs} fill={CONC} />
      <rect x={CX(CREEK.b / 2)} y={CY(CREEK.H)} width="4" height={CREEK.H * cs} fill={CONC} />
      <rect x={CX(-CREEK.b / 2) - 4} y={ib} width={CREEK.b * cs + 8} height="4" fill={CONC} />
      <rect x={CX(-CREEK.b / 2)} y={CY(Math.min(r.yU, top))} width={CREEK.b * cs} height={Math.min(r.yU, top) * cs} fill={WATER} opacity="0.8" />
      {half < CREEK.b / 2 && <rect x={CX(-CREEK.b / 2)} y={CY(deckTop)} width={(CREEK.b / 2 - half) * cs} height={deckTop * cs} fill={CONC} stroke="#7e786d" />}
      {half < CREEK.b / 2 && <rect x={CX(half)} y={CY(deckTop)} width={(CREEK.b / 2 - half) * cs} height={deckTop * cs} fill={CONC} stroke="#7e786d" />}
      <rect x={CX(-CREEK.b / 2 - 0.4)} y={CY(deckTop)} width={(CREEK.b + 0.8) * cs} height={CREEK.deck * cs} fill={CONC} stroke="#7e786d" />
      {blk > 0 &&
        [-1, 1].map((sg) => (
          <rect key={sg} x={sg < 0 ? CX(-half) : CX(half - (half * blk))} y={CY(Math.min(r.yU, r.inp.soffit))} width={half * blk * cs} height={Math.min(r.yU, r.inp.soffit) * cs * 0.85} fill="#6b4a2b" opacity="0.85" />
        ))}
      <Tag x={ix + iw / 2} y={ib + 16} anchor="middle" size="s">
        {`luz ${es(r.inp.span, 1)} m · útil ${es(r.bEff, 1)} m`}
      </Tag>
    </Lens>
  );
}

// ------------------------------------------------------------------ 4. el aforo

export function GaugeDiagram({ r }: { r: GaugeResult }) {
  const id = useLensUid();
  const t = useTime();
  const sc = 180 / 0.5;
  const X = (x: number) => 30 + x * sc, Y = (y: number) => 222 - y * sc;
  const xd = 0.8;
  const yUp = Math.min(r.yUp, FLUME.H + 0.02);
  const crest = r.inp.device === 'rect' ? FLUME.P : r.inp.device === 'tri' ? FLUME.Ptri : r.inp.gate;
  const fallPts: string[] = [];
  if (r.inp.device !== 'gate') {
    const v0 = Math.sqrt(G * r.H);
    for (let k = 0; k <= 20; k++) {
      const tt = k * 0.015;
      const yy = crest + 0.12 * r.H - 0.5 * G * tt * tt;
      if (yy < 0) break;
      fallPts.push(`${X(xd + v0 * tt)},${Y(yy)}`);
    }
  }
  const name = r.inp.device === 'rect' ? 'vertedero rectangular' : r.inp.device === 'tri' ? 'vertedero triangular de 90°' : 'compuerta';
  const formula = r.inp.device === 'rect' ? 'Q = ⅔ · Cd · b · √(2g) · H^1,5' : r.inp.device === 'tri' ? 'Q = 8⁄15 · Cd · √(2g) · H^2,5' : 'Q = Cd · a · b · √(2g · y1)';
  const chips: Chip[] = [
    { label: 'Bomba', value: `${es(r.inp.Qls, 1)} L/s` },
    { label: r.inp.device === 'gate' ? 'Profundidad aguas arriba' : 'Carga H', value: `${es(r.H * 100, 1)} cm`, tone: r.thin ? 'bad' : 'info' },
    { label: r.inp.device === 'gate' ? 'Cd de la compuerta' : 'Fórmula', value: r.inp.device === 'gate' ? (r.gateFree ? 'no toca el agua' : es(r.Cd ?? 0, 3)) : formula },
  ];
  return (
    <Lens uid={id} label={`Corte del canal de laboratorio con el ${name}: la carga H se lee en la regla, aguas arriba.`} chips={chips}>
      <rect x={X(-0.05)} y={Y(0)} width={X(1.15) - X(-0.05)} height="6" fill="#59636b" />
      <rect x={X(-0.05)} y={Y(yUp)} width={X(xd) - X(-0.05)} height={(yUp) * sc} fill={WATER} opacity="0.85" />
      {r.inp.device === 'gate' ? (
        <g>
          <rect x={X(xd) - 3} y={Y(FLUME.H + 0.05)} width="6" height={(FLUME.H + 0.05 - r.inp.gate) * sc} fill="#9aa3aa" />
          <rect x={X(xd)} y={Y(r.yVena ?? r.yUp)} width={X(1.15) - X(xd)} height={(r.yVena ?? r.yUp) * sc} fill={WATER} opacity="0.85" />
          {!r.gateFree && (
            <g>
              <Arrow d={`M${X(xd) + 30} ${Y(r.inp.gate)} V${Y(0)}`} kind="ink" w={1} />
              <Tag x={X(xd) + 34} y={Y(r.inp.gate / 2) + 4} size="s">
                {`a = ${es(r.inp.gate * 100, 1)} cm`}
              </Tag>
            </g>
          )}
        </g>
      ) : (
        <g>
          <rect x={X(xd) - 3} y={Y(crest)} width="6" height={crest * sc} fill="#9aa3aa" />
          {r.inp.device === 'tri' && <path d={`M${X(xd) - 3} ${Y(crest)} l3 -4 l3 4`} fill="#9aa3aa" />}
          <polyline points={fallPts.join(' ')} fill="none" stroke={WATER} strokeWidth={Math.max(3, r.H * sc * 0.6)} strokeLinecap="round" opacity="0.85" />
          <line x1={X(xd) + 10} y1={Y(crest)} x2={X(xd) + 60} y2={Y(crest)} stroke="#5b6b78" strokeDasharray="3 2" />
          <Arrow d={`M${X(xd) - 40} ${Y(crest)} V${Y(yUp) + 2}`} kind="warn" w={1.4} />
          <Arrow d={`M${X(xd) - 40} ${Y(yUp)} V${Y(crest) - 2}`} kind="warn" w={1.4} />
          <Tag x={X(xd) - 46} y={Y((crest + yUp) / 2) + 4} anchor="end" size="s" color="#a3321d">
            {`H = ${es(r.H * 100, 1)} cm`}
          </Tag>
          <Tag x={X(xd) + 62} y={Y(crest) + 4} size="s" color="#5b6b78">
            {r.inp.device === 'tri' ? 'vértice' : 'cresta'}
          </Tag>
        </g>
      )}
      {/* regla aguas arriba */}
      <rect x={X(0.15)} y={Y(FLUME.H)} width="12" height={FLUME.H * sc} fill="#ffffff" stroke={INK} />
      {[...Array(10)].map((_, k) => (
        <g key={k}>
          <line x1={X(0.15)} y1={Y(k * 0.05)} x2={X(0.15) + 8} y2={Y(k * 0.05)} stroke={INK} />
          <text x={X(0.15) - 3} y={Y(k * 0.05) + 3} textAnchor="end" className="lz-s" fill={INK}>
            {k * 5}
          </text>
        </g>
      ))}
      <line x1={X(0.15) - 2} y1={Y(yUp)} x2={X(0.15) + 16} y2={Y(yUp)} stroke="#c0462a" strokeWidth="2" />
      <Tag x={X(0.15) + 18} y={Y(yUp) - 4} size="s" color="#a3321d">
        {`la regla marca ${es(r.yUp * 100, 1)} cm`}
      </Tag>
      {r.overflow && (
        <Tag x={240} y={20} anchor="middle" size="m" color="#a3321d">
          El agua rebosa el canal
        </Tag>
      )}
      {r.thin && (
        <Tag x={240} y={20} anchor="middle" size="s" color="#a3321d">
          Carga muy baja: la lámina se pega a la placa
        </Tag>
      )}
      <circle cx={X(-0.05) + wrap(t * 40 * Math.min(2, r.Vup * 6), X(xd) - X(-0.05) - 10)} cy={Y(yUp) - 3} r="3" fill="#f07a1a" />
      <Tag x={X(-0.05)} y={250} size="s" color="#5b6b78">
        {`misma escala en los dos ejes · canal de ${es(FLUME.b * 100, 0)} cm de ancho`}
      </Tag>
    </Lens>
  );
}


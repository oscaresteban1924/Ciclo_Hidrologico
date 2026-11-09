// Paneles de la red de alcantarillado separada y de la creciente de la quebrada.
// Todas las cifras salen del cálculo en curso (o del escenario compilado, para la capacidad y la norma).

import { useId, useMemo, useState } from 'react';
import { Segmented } from '../../components/ui';
import type { CityController } from '../controller';
import type { Compiled } from '../sim/compile';
import type { CitySim } from '../sim/engine';
import type { CreekFlood, Scenario } from '../sim/scenario';
import { epmChecks, designTable } from '../sim/sewerCheck';
import { fmtNum } from '../render/palette';
import { SEWER_COLORS, mainPath } from '../render/sewerColors';
import { LineChart, type Series } from './Chart';
import { Range } from './Range';

const lps = (v: number) => `${fmtNum(v * 1000, v * 1000 < 10 ? 1 : 0)} L/s`;
const m3 = (v: number) => `${fmtNum(v, v < 10 ? 2 : 1)} m³`;
const m3s = (v: number) => `${fmtNum(v, v < 10 ? 1 : 0)} m³/s`;
const SYS = ['Aguas lluvias', 'Aguas residuales'] as const;
const SYSKEY = ['lluvias', 'residuales'] as const;

interface ToolProps {
  ctrl: CityController;
  sc: Scenario;
}

/** Estado en vivo de un sistema de la red. */
function systemState(sim: CitySim, sys: 0 | 1) {
  const sw = sim.sewer!;
  const s = sw.s;
  const env = { h: sim.h, z: sim.c.z, area: sim.c.area, dx: sim.c.dx };
  let out = 0, toCreek = 0;
  s.pipes.forEach((p, k) => {
    if (p.system !== sys) return;
    const nb = s.nodes[p.b];
    if (nb.outfall === 1) out += Math.max(0, sw.flowOf(k));
    if (nb.outfall === 2) toCreek += sw.flowOf(k);
  });
  let worst = -1, wf = 0;
  s.pipes.forEach((p, k) => {
    if (p.system !== sys || p.role !== 'colector') return;
    const f = sw.fillOf(k, env);
    if (f > wf) {
      wf = f;
      worst = k;
    }
  });
  const dt = sim.lastDt > 0 ? sim.lastDt : 1;
  const overNow = s.nodes.map((n, k) => ({ n, q: sw.lastOverflow[k] / dt })).filter((o) => o.n.system === sys && o.q > 2e-4);
  const peak = Math.max(0, ...s.pipes.map((p, k) => (p.system === sys && p.role === 'colector' ? sw.peakFill[k] : 0)));
  return { out, toCreek, worst, wf, overNow, peak, storage: sw.storage(sys), overflow: sw.tot.overflow[sys], fromCreek: sw.tot.fromCreek[sys] };
}

const fillText = (f: number) => (f > 1.001 ? 'en carga (llena y a presión)' : `${fmtNum(Math.min(1, f) * 100, 0)} % lleno`);

export function SewerTool({ ctrl, sc }: ToolProps) {
  const sim = ctrl.displayed();
  const [sys, setSys] = useState<0 | 1>(0);
  const sw = sc.sewer!;
  const c = sim?.c;
  const erradas = !!ctrl.ivB.erradas;
  const counts = useMemo(() => {
    const n = sw.nodes;
    return {
      camL: n.filter((q) => q.system === 'lluvias' && (q.kind === 'camara' || q.kind === 'caida')).length,
      camR: n.filter((q) => q.system === 'residuales' && (q.kind === 'camara' || q.kind === 'caida')).length,
      caidas: n.filter((q) => q.kind === 'caida').length,
      techos: sw.erradas.buildingIds.length,
    };
  }, [sw]);
  return (
    <section className="tool-body" aria-label="Alcantarillado">
      <h3>Alcantarillado: dos redes separadas</h3>
      <p className="city-small">
        Red <strong>didáctica</strong> trazada con criterios de la norma de diseño de EPM (GD-AS002): no es la red real ni un diseño de ingeniería. La de <strong>aguas lluvias</strong> recoge los sumideros ({counts.camL} cámaras{counts.caidas ? `, ${counts.caidas} de caída` : ''}); la de <strong>aguas residuales</strong> recoge las casas ({counts.camR} cámaras) y va más profunda, por el otro costado de la vía. No se mezclan.
      </p>
      {sim && c?.sewer && (
        <div className="sewer-grid" role="group" aria-label="Estado de las redes ahora">
          {([0, 1] as const).map((k) => {
            const st = systemState(sim, k);
            return (
              <div key={k} className="sewer-col">
                <h4>
                  <span className="sw-swatch" style={{ background: SEWER_COLORS[SYSKEY[k]].shell }} aria-hidden="true" />
                  {SYS[k]}
                </h4>
                <dl>
                  {st.toCreek !== 0 && (
                    <>
                      <dt>{st.toCreek >= 0 ? 'Descarga a la quebrada' : 'Entra desde la quebrada'}</dt>
                      <dd>{lps(Math.abs(st.toCreek))}</dd>
                    </>
                  )}
                  {(k === 1 || st.out > 0 || st.toCreek === 0) && (
                    <>
                      <dt>{k === 0 ? 'Sale por el colector' : 'Sale hacia el interceptor'}</dt>
                      <dd>{lps(st.out)}</dd>
                    </>
                  )}
                  <dt>Tramo más cargado</dt>
                  <dd>{st.worst >= 0 ? `${c.sewer!.pipes[st.worst].id}: ${fillText(st.wf)}` : '—'}</dd>
                  <dt>Rebose a la calle</dt>
                  <dd>
                    {st.overNow.length ? <strong>ahora en {st.overNow.map((o) => o.n.id).join(', ')}</strong> : 'ahora no'} · total {m3(st.overflow)}
                  </dd>
                  {st.fromCreek > 0 && (
                    <>
                      <dt>Entró de la quebrada</dt>
                      <dd>{m3(st.fromCreek)}</dd>
                    </>
                  )}
                </dl>
              </div>
            );
          })}
        </div>
      )}
      <div className="city-item">
        <label className="check">
          <input type="checkbox" checked={erradas} onChange={(e) => ctrl.update({ B: { ...ctrl.ivB, erradas: e.target.checked } })} />
          <span>
            <strong>Conexiones erradas (hipotéticas)</strong>
            <small>
              {counts.techos} techos del sector y {fmtNum(sw.erradas.upstreamRoofM2, 0)} m² de techos aguas arriba conectados por error al alcantarillado de aguas residuales. Con lluvia, esa tubería se llena y rebosa en la calle: por eso las redes deben ir separadas.
            </small>
          </span>
        </label>
      </div>
      {sim && c?.sewer && (
        <>
          <Segmented label="Perfil de la red" value={String(sys)} options={[{ value: '0', label: 'Aguas lluvias' }, { value: '1', label: 'Aguas residuales' }]} onChange={(v) => setSys(Number(v) as 0 | 1)} />
          <ProfileChart sim={sim} system={sys} />
        </>
      )}
      <button type="button" className="btn-ghost small" onClick={() => ctrl.setCut(!ctrl.cutOn())}>
        {ctrl.cutOn() ? 'Ocultar lo que hay bajo la calle' : 'Ver bajo la calle (las dos redes)'}
      </button>
    </section>
  );
}

/** Perfil longitudinal del colector principal: terreno, tubería, cámaras y nivel del agua calculado. */
export function ProfileChart({ sim, system }: { sim: CitySim; system: 0 | 1 }) {
  const id = useId();
  const c = sim.c, s = c.sewer!, sw = sim.sewer!;
  const path = useMemo(() => mainPath(c, system), [c, system]);
  if (path.length < 2) return null;
  const env = { h: sim.h, z: c.z, area: c.area, dx: c.dx };
  // distancias acumuladas y tramos
  const xs: number[] = [0];
  const segs = [] as { p: number; x0: number; x1: number }[];
  for (let q = 1; q < path.length; q++) {
    const a = s.nodes[path[q - 1]], b = s.nodes[path[q]];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    xs.push(xs[q - 1] + L);
    const p = s.pipes.findIndex((pp) => pp.a === path[q - 1] && pp.b === path[q]);
    segs.push({ p, x0: xs[q - 1], x1: xs[q] });
  }
  // terreno a lo largo del trazado (celdas del cálculo)
  const ground: [number, number][] = [];
  for (let q = 1; q < path.length; q++) {
    const a = s.nodes[path[q - 1]], b = s.nodes[path[q]];
    const L = xs[q] - xs[q - 1];
    const n = Math.max(2, Math.ceil(L / c.dx));
    for (let t = 0; t <= n; t++) {
      const f = t / n;
      const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
      const i = Math.min(c.nx - 1, Math.max(0, Math.floor(x / c.dx))), j = Math.min(c.ny - 1, Math.max(0, Math.floor(y / c.dx)));
      ground.push([xs[q - 1] + L * f, c.z[j * c.nx + i]]);
    }
  }
  const heads = path.map((k) => sw.headAt(k, env));
  const zs = [...ground.map((g) => g[1]), ...path.map((k) => s.nodes[k].inv), ...heads];
  const zmin = Math.min(...zs) - 0.3, zmax = Math.max(...zs) + 0.4;
  const W = 340, H = 210, L0 = 42, R0 = 10, T0 = 12, B0 = 26;
  const X = (x: number) => L0 + (x / xs[xs.length - 1]) * (W - L0 - R0);
  const Y = (z: number) => T0 + (1 - (z - zmin) / (zmax - zmin)) * (H - T0 - B0);
  const colors = SEWER_COLORS[SYSKEY[system]];
  const dt = sim.lastDt > 0 ? sim.lastDt : 1;
  const surcharged = segs.filter(({ p }) => p >= 0 && sw.fillOf(p, env) > 1.001).length;
  const overflowing = path.filter((k) => sw.lastOverflow[k] / dt > 2e-4);
  const out = s.nodes[path[path.length - 1]];
  const desc = `Perfil de ${SYS[system].toLowerCase()} desde ${s.nodes[path[0]].id} hasta ${out.outfall === 2 ? 'la descarga a la quebrada' : 'la salida del sector'}: ${fmtNum(xs[xs.length - 1], 0)} m. ${surcharged ? `${surcharged} tramos en carga.` : 'Ningún tramo en carga.'} ${overflowing.length ? `Rebosa ${overflowing.map((k) => s.nodes[k].id).join(', ')}.` : ''}`;
  const ticksY = [zmin + 0.3, (zmin + zmax) / 2, zmax - 0.4];
  return (
    <figure className="city-chart">
      <figcaption id={`${id}-t`}>Perfil del colector principal (nivel del agua calculado)</figcaption>
      <ul className="chart-legend">
        <li>
          <svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#8a7f6d" strokeWidth="2" /></svg>Terreno
        </li>
        <li>
          <svg width="26" height="10" aria-hidden="true"><rect x="1" y="1" width="24" height="8" fill={colors.shell} opacity="0.35" stroke={colors.shell} /></svg>Tubería y cámaras
        </li>
        <li>
          <svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke={colors.water} strokeWidth="2.5" /></svg>Nivel del agua
        </li>
        <li>
          <svg width="26" height="10" aria-hidden="true"><rect x="1" y="1" width="24" height="8" fill={SEWER_COLORS.carga} opacity="0.6" /></svg>En carga
        </li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <desc id={`${id}-d`}>{desc}</desc>
        {ticksY.map((z, i) => (
          <g key={i}>
            <line x1={L0} x2={W - R0} y1={Y(z)} y2={Y(z)} className="grid" />
            <text x={L0 - 5} y={Y(z) + 4} textAnchor="end" className="tick">{fmtNum(Math.max(0, z - zmin - 0.3), 1)} m</text>
          </g>
        ))}
        <text x={L0} y={H - 8} className="tick">0 m</text>
        <text x={W - R0} y={H - 8} textAnchor="end" className="tick">{fmtNum(xs[xs.length - 1], 0)} m de recorrido</text>
        <polyline points={ground.map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join(' ')} fill="none" stroke="#8a7f6d" strokeWidth="2" />
        {segs.map(({ p, x0, x1 }, q) => {
          if (p < 0) return null;
          const pp = s.pipes[p];
          const load = sw.fillOf(p, env) > 1.001;
          const za = pp.zUp, zb = pp.zDn;
          // agua dentro del tramo: entre la batea y el nivel (sin pasar la corona), interpolado
          const ha = Math.min(heads[q], za + pp.D), hb = Math.min(heads[q + 1], zb + pp.D);
          return (
            <g key={pp.id}>
              <polygon points={`${X(x0)},${Y(za)} ${X(x1)},${Y(zb)} ${X(x1)},${Y(zb + pp.D)} ${X(x0)},${Y(za + pp.D)}`} fill={load ? SEWER_COLORS.carga : colors.shell} opacity={load ? 0.55 : 0.28} stroke={colors.shell} strokeWidth="1" />
              {(ha > za + 0.002 || hb > zb + 0.002) && <polygon points={`${X(x0)},${Y(za)} ${X(x1)},${Y(zb)} ${X(x1)},${Y(Math.max(zb, hb))} ${X(x0)},${Y(Math.max(za, ha))}`} fill={colors.water} opacity="0.85" />}
            </g>
          );
        })}
        {path.map((k, q) => {
          const n = s.nodes[k];
          if (n.outfall) return null;
          const w = 5;
          const over = sw.lastOverflow[k] / dt > 2e-4;
          return (
            <g key={n.id}>
              <rect x={X(xs[q]) - w / 2} y={Y(n.rim)} width={w} height={Math.max(1, Y(n.inv) - Y(n.rim))} fill={colors.shell} opacity="0.45" />
              {over && (
                <text x={X(xs[q])} y={Y(n.rim) - 4} textAnchor="middle" className="direct">rebosa</text>
              )}
            </g>
          );
        })}
        <polyline points={heads.map((h, q) => `${X(xs[q]).toFixed(1)},${Y(Math.max(h, s.nodes[path[q]].inv)).toFixed(1)}`).join(' ')} fill="none" stroke={colors.water} strokeWidth="2" strokeDasharray="1 0" />
        <text x={X(xs[0]) + 2} y={Y(s.nodes[path[0]].rim) - 4} className="tick">{s.nodes[path[0]].id}</text>
        <text x={X(xs[xs.length - 1]) - 2} y={Math.min(H - B0 - 2, Y(Math.min(heads[heads.length - 1], out.inv)) + 14)} textAnchor="end" className="tick">{out.outfall === 2 ? 'quebrada' : 'sigue'}</text>
      </svg>
      <p className="city-small">{desc}</p>
    </figure>
  );
}

const CREEK_PRESETS = [
  { f: 0, label: 'Sin creciente' },
  { f: 0.6, label: 'Cabe en el cauce (60 %)' },
  { f: 1, label: 'Llena el cauce (100 %)' },
  { f: 1.5, label: 'Se desborda (150 %)' },
  { f: 2, label: 'Avenida (200 %)' },
];

export function CreekTool({ ctrl, sc }: ToolProps) {
  const sim = ctrl.displayed();
  const c = sim?.c;
  const cr = c?.creek;
  const cf = ctrl.shared.creek ?? null;
  const cap = cr?.capacity ?? 0;
  const set = (f: CreekFlood | null) => {
    const need = f ? Math.ceil(f.startMin + 2.67 * f.timeToPeakMin + 8) : 0;
    ctrl.update({ shared: { creek: f, simMinutes: Math.min(120, Math.max(ctrl.shared.simMinutes, need)) } });
  };
  const preset = (frac: number) => set(frac === 0 ? null : { peakM3s: Math.round(frac * cap), timeToPeakMin: cf?.timeToPeakMin ?? 6, startMin: cf?.startMin ?? 2 });
  const now = sim && cr ? sim.creekSection() : null;
  const series: Series[] = useMemo(() => {
    if (!sim || !cr) return [];
    const pts = sim.samples.filter((q) => q.creek);
    return [
      { id: 'Entra', name: 'Caudal que entra (creciente)', color: '#5b6470', dash: true, points: pts.map((q) => [q.t / 60, q.creek!.qin] as [number, number]) },
      { id: 'Cauce', name: 'Pasa por el cauce en la sección', color: '#2a78d6', points: pts.map((q) => [q.t / 60, Math.max(0, q.creek!.qChannel)] as [number, number]) },
      { id: 'Fuera', name: 'Pasa por fuera del cauce (desborde)', color: '#eb6834', points: pts.map((q) => [q.t / 60, Math.max(0, q.creek!.qOutside)] as [number, number]) },
    ];
    // las muestras crecen con el cálculo: se recalcula con su número
  }, [sim, cr, sim?.samples.length]);
  if (!cr || !sc.creek) return null;
  const pick = CREEK_PRESETS.reduce((b, p) => (Math.abs((cf ? cf.peakM3s / cap : 0) - p.f) < Math.abs((cf ? cf.peakM3s / cap : 0) - b.f) ? p : b), CREEK_PRESETS[0]);
  const overNow = now ? Math.max(0, now.qOutside) : 0;
  return (
    <section className="tool-body" aria-label="Creciente de la quebrada">
      <h3>Creciente de la quebrada</h3>
      <p className="city-small">
        La {cr.name.toLowerCase()} (frente a la casa del retiro) lleva hasta <strong>{m3s(cap)}</strong> con el cauce lleno: la orilla más baja está a {fmtNum(cr.bankLevel - cr.zBed, 2)} m del fondo y la pendiente es de {fmtNum(cr.slope * 100, 1)} %. La capacidad se calcula con la misma regla de fricción del modelo. Si llega más agua, se sale del cauce hacia el retiro.
      </p>
      <div className="chip-row" role="group" aria-label="Crecientes de ejemplo">
        {CREEK_PRESETS.map((p) => (
          <button key={p.label} type="button" className={`chip${(cf ? pick === p : p.f === 0) ? ' is-on' : ''}`} aria-pressed={cf ? pick === p : p.f === 0} onClick={() => preset(p.f)}>
            {p.label}
            {p.f > 0 ? ` · ${fmtNum(p.f * cap, 0)} m³/s` : ''}
          </button>
        ))}
      </div>
      {cf && (
        <>
          <Range label="Caudal pico" value={cf.peakM3s} min={1} max={Math.round(2.5 * cap)} step={1} unit="m³/s" onChange={(v) => set({ ...cf, peakM3s: v })} help={`${fmtNum((cf.peakM3s / cap) * 100, 0)} % de la capacidad del cauce en la sección.`} />
          <Range label="Tiempo hasta el pico" value={cf.timeToPeakMin} min={2} max={15} step={1} unit="min" onChange={(v) => set({ ...cf, timeToPeakMin: v })} />
          <Range label="Empieza en el minuto" value={cf.startMin} min={0} max={20} step={1} unit="min" onChange={(v) => set({ ...cf, startMin: v })} />
          <p className="city-small">Hidrograma triangular: sube en {cf.timeToPeakMin} min y baja en {fmtNum(1.67 * cf.timeToPeakMin, 0)} min, sobre un caudal base de {fmtNum(cr.baseM3s, 1)} m³/s. Es un ejercicio: no es un caudal medido ni un pronóstico de inundación.</p>
        </>
      )}
      {now && sim && (
        <>
          <dl className="sewer-dl">
            <dt>Entra ahora</dt>
            <dd>{m3s(now.qin)}</dd>
            <dt>Pasa por el cauce</dt>
            <dd>{m3s(Math.max(0, now.qChannel))}</dd>
            <dt>Pasa por fuera (desborde)</dt>
            <dd>{overNow > 0.05 ? <strong>{m3s(overNow)}</strong> : 'nada'}</dd>
            <dt>Nivel en la sección</dt>
            <dd>
              {fmtNum(Math.max(0, now.level - cr.zBed), 2)} m sobre el fondo ({now.level > cr.bankLevel ? <strong>{fmtNum(now.level - cr.bankLevel, 2)} m por encima de la orilla</strong> : `${fmtNum(cr.bankLevel - now.level, 2)} m bajo la orilla`})
            </dd>
          </dl>
          <SectionChart sim={sim} />
          <LineChart title="Caudales en la sección de control" series={series} fmtY={(v) => `${fmtNum(v, 0)} m³/s`} yUnit="metros cúbicos por segundo" refY={{ y: cap, label: `capacidad ${fmtNum(cap, 0)} m³/s` }} height={160} />
        </>
      )}
      <button type="button" className="link" onClick={() => ctrl.focusCreekSection()}>
        Ver la sección en la maqueta
      </button>
    </section>
  );
}

/** Sección transversal de la quebrada en vivo: terreno, casas, agua calculada y cota de cauce lleno. */
export function SectionChart({ sim }: { sim: CitySim }) {
  const id = useId();
  const c: Compiled = sim.c;
  const cr = c.creek!;
  const { nx, dx } = c;
  const rows = [] as { y: number; z: number; h: number; solid: boolean }[];
  for (let j = cr.j0; j <= cr.j1; j++) {
    const k = j * nx + cr.i;
    rows.push({ y: (j + 0.5) * dx, z: c.z[k], h: sim.h[k], solid: !!c.solid[k] });
  }
  const zb = cr.zBed;
  const zTop = Math.max(...rows.map((r) => r.z + r.h), cr.bankLevel + 0.6);
  const W = 340, H = 170, L0 = 40, R0 = 10, T0 = 12, B0 = 26;
  const y0 = rows[0].y - dx / 2, y1 = rows[rows.length - 1].y + dx / 2;
  // el norte a la izquierda: se mira la sección desde aguas abajo
  const X = (y: number) => L0 + ((y1 - y) / (y1 - y0)) * (W - L0 - R0);
  const Y = (z: number) => T0 + (1 - (z - zb + 0.2) / (zTop - zb + 0.4)) * (H - T0 - B0);
  const base = Y(zb - 0.2);
  // de izquierda (norte) a derecha (sur), para que el polígono del terreno no se cruce
  const ground = [...rows].reverse().map((r) => `${X(r.y + dx / 2).toFixed(1)},${Y(r.z).toFixed(1)} ${X(r.y - dx / 2).toFixed(1)},${Y(r.z).toFixed(1)}`).join(' ');
  const wet = rows.filter((r) => r.h > 0.003 && !r.solid);
  const level = Math.max(...rows.map((r) => (r.h > 0.003 ? r.z + r.h : -Infinity)));
  const out = rows.filter((r, q) => (q + cr.j0 <= cr.jb0 || q + cr.j0 >= cr.jb1) && r.h > 0.02 && !r.solid);
  const desc = `Sección de control: fondo a cota relativa 0. Orilla (cauce lleno) a ${fmtNum(cr.bankLevel - zb, 2)} m. Agua ${Number.isFinite(level) ? `a ${fmtNum(level - zb, 2)} m` : 'seca'}${out.length ? `; hay agua fuera del cauce en ${out.length} m del retiro` : ''}.`;
  return (
    <figure className="city-chart">
      <figcaption id={`${id}-t`}>Sección transversal de la quebrada (calculada ahora)</figcaption>
      <ul className="chart-legend">
        <li><svg width="26" height="10" aria-hidden="true"><rect x="1" y="1" width="24" height="8" fill="#b9a98f" /></svg>Terreno</li>
        <li><svg width="26" height="10" aria-hidden="true"><rect x="1" y="1" width="24" height="8" fill="#4a90d9" opacity="0.8" /></svg>Agua (cálculo)</li>
        <li><svg width="26" height="10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#c92a2a" strokeWidth="2" strokeDasharray="5 3" /></svg>Cauce lleno</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <desc id={`${id}-d`}>{desc}</desc>
        {[0, 1, 2, 3].filter((v) => zb + v <= zTop + 0.2).map((v) => (
          <g key={v}>
            <line x1={L0} x2={W - R0} y1={Y(zb + v)} y2={Y(zb + v)} className="grid" />
            <text x={L0 - 5} y={Y(zb + v) + 4} textAnchor="end" className="tick">{v} m</text>
          </g>
        ))}
        {wet.map((r) => (
          <rect key={r.y} x={X(r.y + dx / 2)} y={Y(r.z + r.h)} width={Math.max(0.5, X(r.y - dx / 2) - X(r.y + dx / 2))} height={Math.max(0, Y(r.z) - Y(r.z + r.h))} fill="#4a90d9" opacity="0.8" />
        ))}
        <polygon points={`${X(y1)},${base} ${ground} ${X(y0)},${base}`} fill="#b9a98f" />
        {rows.filter((r) => r.solid).map((r) => (
          <rect key={`b${r.y}`} x={X(r.y + dx / 2)} y={Y(r.z + 2.5)} width={X(r.y - dx / 2) - X(r.y + dx / 2)} height={Y(r.z) - Y(r.z + 2.5)} fill="#7d6a5a" />
        ))}
        <line x1={X((cr.jb1 + 0.5) * dx)} x2={X((cr.jb0 + 0.5) * dx)} y1={Y(cr.bankLevel)} y2={Y(cr.bankLevel)} stroke="#c92a2a" strokeWidth="1.5" strokeDasharray="5 3" />
        <text x={X((cr.jb0 + 0.5) * dx) + 3} y={Y(cr.bankLevel) - 4} className="tick">cauce lleno</text>
        <text x={L0 + 2} y={H - 8} className="tick">norte</text>
        <text x={W - R0} y={H - 8} textAnchor="end" className="tick">sur</text>
        <text x={(L0 + W - R0) / 2} y={H - 8} textAnchor="middle" className="tick">{fmtNum(y1 - y0, 0)} m a través del valle</text>
      </svg>
      <p className="city-small">{desc}</p>
    </figure>
  );
}

/** Tablas para la pestaña Docente: criterios de EPM revisados y tramos con su caudal de diseño. */
export function SewerTeacher({ sc, c }: { sc: Scenario; c: Compiled }) {
  const checks = useMemo(() => epmChecks(sc, c), [sc, c]);
  const rows = useMemo(() => designTable(sc, c), [sc, c]);
  const sw = sc.sewer!;
  return (
    <>
      <p className="city-small">
        {sw.standard}. Lluvia de diseño supuesta: {sw.designIntensityMmH} mm/h (método racional, C = 0,85·I + 0,15; EPM 6.3). No es la curva IDF de EPM. Aguas residuales: {sw.sanitary.personsPerFloor} personas por piso, dotación neta supuesta de {sw.sanitary.dotacionLpd} L/hab·día, retorno {fmtNum(sw.sanitary.returnCoef, 2)} (EPM 5.2.3.1), mayoración {fmtNum(sw.sanitary.peakFactor, 1)} (mínimo de EPM, 5.2.6), infiltración {fmtNum(sw.sanitary.infiltrationLpsHa, 1)} L/s·ha (5.2.3.6).
      </p>
      <table className="city-table">
        <caption>Criterios de la norma revisados en esta red</caption>
        <thead>
          <tr><th scope="col">Criterio</th><th scope="col">Numeral</th><th scope="col">En esta red</th><th scope="col">Cumple</th></tr>
        </thead>
        <tbody>
          {checks.map((k) => (
            <tr key={k.id}><th scope="row">{k.criterio}</th><td>{k.referencia}</td><td>{k.medido}</td><td>{k.cumple ? 'Sí' : <strong>No</strong>}</td></tr>
          ))}
        </tbody>
      </table>
      <table className="city-table">
        <caption>Tramos: caudal de diseño y capacidad</caption>
        <thead>
          <tr><th scope="col">Tramo</th><th scope="col">Red</th><th scope="col">Ø y material</th><th scope="col">Pendiente</th><th scope="col">Q diseño</th><th scope="col">Q lleno</th><th scope="col">Lámina</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.id}</th>
              <td>{r.system}</td>
              <td>{Math.round(r.D * 1000)} mm {r.material}</td>
              <td>{fmtNum(r.slope * 100, 1)} %</td>
              <td>{lps(r.qDesign)}</td>
              <td>{lps(r.qFull)}</td>
              <td>{r.yD === null ? 'no cabe' : `${fmtNum(r.yD * 100, 0)} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}


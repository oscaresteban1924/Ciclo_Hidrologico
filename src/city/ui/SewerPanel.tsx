// Paneles de la red de alcantarillado separada y de la creciente de la quebrada.
// Todas las cifras salen del cálculo en curso (o del escenario compilado, para la capacidad y la norma).

import { useId, useMemo, type ReactNode } from 'react';
import { Segmented } from '../../components/ui';
import type { CityController } from '../controller';
import { compile, type Compiled } from '../sim/compile';
import { CULVERT_CLOG_S, type CitySim } from '../sim/engine';
import { AFFECTED_DEPTH_M, HAZARD, HAZARD_SOURCE, bulkingFactor, damageSummary, exposureOf, hazardClass } from '../sim/hazard';
import { baseInterventions, type CreekFlood, type CulvertState, type Scenario } from '../sim/scenario';
import { epmChecks, designTable } from '../sim/sewerCheck';
import { fmtDepth, fmtNum } from '../render/palette';
import { SEWER_COLORS, acometidas, mainPath, showsSystem, type NetFilter } from '../render/sewerColors';
import { buildingName } from '../render/floodNames';
import { LineChart, type Series } from './Chart';
import { Range } from './Range';

const lps = (v: number) => `${fmtNum(v * 1000, v * 1000 < 10 ? 1 : 0)} L/s`;
const m3 = (v: number) => `${fmtNum(v, v < 10 ? 2 : 1)} m³`;
const m3s = (v: number) => `${fmtNum(v, v < 10 ? 1 : 0)} m³/s`;
const SYS = ['Aguas lluvias', 'Aguas residuales'] as const;
const SYSKEY = ['lluvias', 'residuales'] as const;

interface ToolProps {
  ctrl: CityController;
  sc: Scenario;
}

/** Indicador: cifra grande con su rótulo y una línea de contexto. El tono marca el estado (con texto). */
function Stat({ label, value, sub, tone = 'neutral', accent }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'danger'; accent?: string }) {
  return (
    <div className={`stat tone-${tone}`} style={accent ? { borderTopColor: accent } : undefined}>
      <span className="stat-l">{label}</span>
      <span className="stat-v">{value}</span>
      {sub && <span className="stat-s">{sub}</span>}
    </div>
  );
}

/** Ficha de clase de peligro: código y color (el código siempre acompaña al color). */
export function HazChip({ h }: { h: number }) {
  const c = HAZARD[h];
  return (
    <span className="haz-chip" style={{ background: c.color, color: h >= 4 ? '#fff' : '#1f2933' }} title={c.text}>
      {h === 0 ? 'seco' : c.code}
    </span>
  );
}

// ================================================================ alcantarillado

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
  const loaded = s.pipes.filter((p, k) => p.system === sys && p.role === 'colector' && sw.fillOf(k, env) > 1.001).length;
  return { out, toCreek, worst, wf, overNow, loaded, overflow: sw.tot.overflow[sys], fromCreek: sw.tot.fromCreek[sys] };
}

export function SewerTool({ ctrl, sc }: ToolProps) {
  const sim = ctrl.displayed();
  const sw = sc.sewer!;
  const c = sim?.c;
  const erradas = !!ctrl.ivB.erradas;
  const filter = ctrl.netFilter();
  const counts = useMemo(() => {
    const n = sw.nodes;
    return {
      camL: n.filter((q) => q.system === 'lluvias' && (q.kind === 'camara' || q.kind === 'caida')).length,
      camR: n.filter((q) => q.system === 'residuales' && (q.kind === 'camara' || q.kind === 'caida')).length,
      caidas: n.filter((q) => q.kind === 'caida').length,
      techos: sw.erradas.buildingIds.length,
    };
  }, [sw]);
  const profileSys: 0 | 1 = filter === 'residuales' ? 1 : 0;
  return (
    <section className="tool-body" aria-label="Alcantarillado">
      <h3>Alcantarillado: dos redes separadas</h3>
      <p className="city-small">
        Red <strong>didáctica</strong> trazada con criterios de la norma de diseño de EPM (GD-AS002); no es la red real ni un diseño de ingeniería. La de <strong>aguas lluvias</strong> recoge los sumideros ({counts.camL} cámaras{counts.caidas ? `, ${counts.caidas} de caída` : ''}); la de <strong>aguas residuales</strong> recoge las casas ({counts.camR} cámaras), va más honda y por el otro costado de la vía. No se mezclan.
      </p>
      <div className="net-bar">
        <Segmented<NetFilter>
          label="Ver"
          value={filter}
          options={[
            { value: 'ambas', label: 'Las dos' },
            { value: 'lluvias', label: 'Aguas lluvias' },
            { value: 'residuales', label: 'Aguas residuales' },
          ]}
          onChange={(v) => ctrl.setNetFilter(v)}
        />
        <button type="button" className={`btn-ghost small${ctrl.cutOn() ? ' is-on' : ''}`} aria-pressed={ctrl.cutOn()} onClick={() => ctrl.setCut(!ctrl.cutOn())}>
          {ctrl.cutOn() ? 'Volver a la calle' : 'Ver bajo la calle'}
        </button>
      </div>
      {sim && c?.sewer && (
        <div className="net-cards" role="group" aria-label="Estado de las redes ahora">
          {([0, 1] as const)
            .filter((k) => showsSystem(filter, k))
            .map((k) => {
              const st = systemState(sim, k);
              const fillPct = Math.min(st.wf, 1.2);
              const load = st.wf > 1.001;
              const dest = k === 0 ? (st.toCreek !== 0 || c.sewer!.nodes.some((n) => n.system === 0 && n.outfall === 2) ? 'a la quebrada' : 'al colector') : 'al interceptor del río';
              return (
                <div key={k} className="net-card" style={{ borderTopColor: SEWER_COLORS[SYSKEY[k]].shell }}>
                  <div className="net-card-h">
                    <span className="sw-swatch" style={{ background: SEWER_COLORS[SYSKEY[k]].shell }} aria-hidden="true" />
                    <strong>{SYS[k]}</strong>
                    <span className="net-dest">→ {dest}</span>
                  </div>
                  <div className="meter" aria-hidden="true">
                    <span style={{ width: `${(fillPct / 1.2) * 100}%`, background: load ? SEWER_COLORS.carga : SEWER_COLORS[SYSKEY[k]].water }} />
                    <i style={{ left: `${(1 / 1.2) * 100}%` }} />
                  </div>
                  <p className="net-line">
                    Tramo más cargado: <strong>{st.worst >= 0 ? c.sewer!.pipes[st.worst].id : '—'}</strong> · {load ? <strong className="txt-danger">en carga (a presión)</strong> : `${fmtNum(Math.min(1, st.wf) * 100, 0)} % lleno`}
                    {st.loaded > 1 ? ` · ${st.loaded} tramos en carga` : ''}
                  </p>
                  <dl className="net-dl">
                    {st.toCreek !== 0 && (
                      <>
                        <dt>{st.toCreek >= 0 ? 'Descarga a la quebrada' : 'Entra desde la quebrada'}</dt>
                        <dd>{lps(Math.abs(st.toCreek))}</dd>
                      </>
                    )}
                    {(k === 1 || st.out > 0 || st.toCreek === 0) && (
                      <>
                        <dt>Sale del sector</dt>
                        <dd>{lps(st.out)}</dd>
                      </>
                    )}
                    <dt>Rebose a la calle</dt>
                    <dd>{st.overNow.length ? <strong className="txt-danger">ahora en {st.overNow.map((o) => o.n.id).join(', ')}</strong> : 'ahora no'} · total {m3(st.overflow)}</dd>
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
      {sim && c?.sewer && <StreetSection sim={sim} sc={sc} filter={filter} erradas={erradas} />}
      {sim && c?.sewer && <NetworkPlan sim={sim} sc={sc} filter={filter} erradas={erradas} />}
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
          {filter === 'ambas' && (
            <Segmented label="Perfil" value={String(profileSys)} options={[{ value: '0', label: 'Aguas lluvias' }, { value: '1', label: 'Aguas residuales' }]} onChange={(v) => ctrl.setNetFilter(v === '1' ? 'residuales' : 'lluvias')} />
          )}
          <ProfileChart sim={sim} system={profileSys} />
        </>
      )}
    </section>
  );
}

/** Tramo de colector paralelo a una calle (para el corte transversal). */
function parallelPipes(c: Compiled, sys: 0 | 1, axis: 'x' | 'y', center: number, band: number) {
  const s = c.sewer!;
  return s.pipes
    .map((p, k) => ({ p, k }))
    .filter(({ p }) => {
      if (p.system !== sys || p.role !== 'colector') return false;
      const a = s.nodes[p.a], b = s.nodes[p.b];
      const along = axis === 'x' ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
      const across0 = axis === 'x' ? a.y : a.x, across1 = axis === 'x' ? b.y : b.x;
      return along > 0.9 * Math.hypot(b.x - a.x, b.y - a.y) && Math.abs(across0 - center) <= band && Math.abs(across1 - center) <= band && !s.nodes[p.b].outfall;
    });
}

/**
 * Corte transversal de la calle: terreno, andenes y fachadas de la malla de cálculo, y las dos tuberías en
 * su posición y profundidad reales del trazado, con el agua que llevan ahora. Escala horizontal = vertical.
 */
export function StreetSection({ sim, sc, filter, erradas }: { sim: CitySim; sc: Scenario; filter: NetFilter; erradas: boolean }) {
  const id = useId();
  const c = sim.c, s = c.sewer!, sw = sim.sewer!;
  const st = sc.sewer?.streets?.[0];
  const geo = useMemo(() => {
    if (!st) return null;
    const band = st.halfWidth + 1.5;
    const ll = parallelPipes(c, 0, st.axis, st.center, band);
    const ar = parallelPipes(c, 1, st.axis, st.center, band);
    if (!ll.length || !ar.length) return null;
    const span = ({ p }: { p: (typeof s.pipes)[number] }) => {
      const a = s.nodes[p.a], b = s.nodes[p.b];
      const u0 = st.axis === 'x' ? a.x : a.y, u1 = st.axis === 'x' ? b.x : b.y;
      return [Math.min(u0, u1), Math.max(u0, u1)] as [number, number];
    };
    // estación: mitad del mayor traslapo entre un tramo de cada red
    let best: { u: number; L: number; l: (typeof ll)[number]; r: (typeof ar)[number] } | null = null;
    for (const l of ll) for (const r of ar) {
      const [a0, a1] = span(l), [b0, b1] = span(r);
      const o0 = Math.max(a0, b0), o1 = Math.min(a1, b1);
      if (o1 - o0 > (best?.L ?? 0)) best = { u: (o0 + o1) / 2, L: o1 - o0, l, r };
    }
    if (!best) return null;
    const at = (q: { p: (typeof s.pipes)[number]; k: number }) => {
      const a = s.nodes[q.p.a], b = s.nodes[q.p.b];
      const u0 = st.axis === 'x' ? a.x : a.y, u1 = st.axis === 'x' ? b.x : b.y;
      const t = (best!.u - u0) / (u1 - u0);
      const across = st.axis === 'x' ? a.y + t * (b.y - a.y) : a.x + t * (b.x - a.x);
      return { k: q.k, p: q.p, v: across, inv: q.p.zUp + t * (q.p.zDn - q.p.zUp) };
    };
    return { u: best.u, pipes: [at(best.l), at(best.r)] };
  }, [c, s, st]);
  if (!st || !geo) return null;
  const env = { h: sim.h, z: c.z, area: c.area, dx: c.dx };
  // perfil del terreno a través de la calle
  const half = st.halfWidth + 2.5;
  const v0 = st.center - half, v1 = st.center + half;
  const rows: { v: number; z: number; solid: boolean; h: number }[] = [];
  for (let v = v0 + c.dx / 2; v <= v1; v += c.dx) {
    const x = st.axis === 'x' ? geo.u : v, y = st.axis === 'x' ? v : geo.u;
    const i = Math.min(c.nx - 1, Math.max(0, Math.floor(x / c.dx))), j = Math.min(c.ny - 1, Math.max(0, Math.floor(y / c.dx)));
    const k = j * c.nx + i;
    rows.push({ v, z: c.solid[k] ? c.zGround[k] : c.z[k], solid: !!c.solid[k], h: sim.h[k] });
  }
  const zTop = Math.max(...rows.map((r) => r.z)) + 0.6;
  const zBot = Math.min(...geo.pipes.map((q) => q.inv)) - 0.5;
  const Wd = 340, L0 = 30, R0 = 8, T0 = 8;
  const scale = (Wd - L0 - R0) / (v1 - v0);
  const Hd = Math.round(T0 + (zTop - zBot) * scale + 30);
  // mirando en el sentido del eje: el lado de mayor coordenada transversal (norte o este) a la izquierda
  const X = (v: number) => L0 + (v1 - v) * scale;
  const Y = (z: number) => T0 + (zTop - z) * scale;
  // de izquierda a derecha (coordenada transversal decreciente) para que el polígono no se cruce
  const gpts = [...rows].reverse().map((r) => `${X(r.v + c.dx / 2).toFixed(1)},${Y(r.z).toFixed(1)} ${X(r.v - c.dx / 2).toFixed(1)},${Y(r.z).toFixed(1)}`).join(' ');
  const left = st.axis === 'x' ? 'norte' : 'oriente', right = st.axis === 'x' ? 'sur' : 'occidente';
  const pipeInfo = geo.pipes.map((q) => {
    const sys = q.p.system as 0 | 1;
    const fill = sw.fillOf(q.k, env);
    const groundZ = rows.reduce((b, r) => (Math.abs(r.v - q.v) < Math.abs(b.v - q.v) ? r : b)).z;
    return { ...q, sys, fill, cover: groundZ - (q.inv + q.p.D), depth: groundZ - q.inv, groundZ };
  });
  const sep = Math.abs(pipeInfo[0].inv - pipeInfo[1].inv);
  const desc = `Corte de la ${st.name.toLowerCase()} a ${fmtNum(geo.u, 0)} m: aguas lluvias Ø ${Math.round(pipeInfo[0].p.D * 1000)} mm con ${fmtNum(pipeInfo[0].cover, 1)} m de tierra encima, al ${pipeInfo[0].v > st.center ? left : right}; aguas residuales Ø ${Math.round(pipeInfo[1].p.D * 1000)} mm con ${fmtNum(pipeInfo[1].cover, 1)} m de tierra encima, al ${pipeInfo[1].v > st.center ? left : right}. Sus fondos difieren ${fmtNum(sep, 2)} m.`;
  // acometida de la casa más cercana a la estación (del costado de aguas residuales)
  const ac = acometidas(sc, c, erradas).filter((a) => Math.abs((st.axis === 'x' ? a.to[0] : a.to[1]) - geo.u) < 6 && a.pipe === pipeInfo[1].k);
  const acom = ac.length ? ac[0] : null;
  return (
    <figure className="city-chart street-sec">
      <figcaption id={`${id}-t`}>Corte de la calle: dónde va cada red</figcaption>
      <svg viewBox={`0 0 ${Wd} ${Hd}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <desc id={`${id}-d`}>{desc}</desc>
        <defs>
          <pattern id={`${id}-soil`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#e3d6bd" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#cdbb98" strokeWidth="1.2" />
          </pattern>
        </defs>
        <polygon points={`${X(v1)},${Y(zBot)} ${gpts} ${X(v0)},${Y(zBot)}`} fill={`url(#${id}-soil)`} />
        <polyline points={gpts} fill="none" stroke="#6b5a45" strokeWidth="1.6" />
        {rows.filter((r) => r.solid).map((r) => (
          <rect key={`b${r.v}`} x={X(r.v + c.dx / 2)} y={Y(r.z + 3)} width={c.dx * scale + 0.4} height={3 * scale} fill="#cfc8bd" />
        ))}
        {rows.filter((r) => !r.solid && r.h > 0.003).map((r) => (
          <rect key={`w${r.v}`} x={X(r.v + c.dx / 2)} y={Y(r.z + r.h) - 1} width={c.dx * scale + 0.4} height={Math.max(1.5, r.h * scale + 1)} fill="#4a90d9" opacity="0.8" />
        ))}
        {acom && showsSystem(filter, 1) && (
          <polyline
            points={`${X(st.axis === 'x' ? acom.from[1] : acom.from[0])},${Y(pipeInfo[1].groundZ - 0.3)} ${X(st.axis === 'x' ? acom.from[1] : acom.from[0])},${Y(acom.zTo + 0.4)} ${X(pipeInfo[1].v)},${Y(acom.zTo)}`}
            fill="none"
            stroke={acom.errada ? SEWER_COLORS.errada : SEWER_COLORS.residuales.shell}
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        )}
        {pipeInfo.map((q) => {
          if (!showsSystem(filter, q.sys)) return null;
          const cx = X(q.v), r = Math.max(3.5, (q.p.D / 2) * scale), cy = Y(q.inv + q.p.D / 2);
          const col = SEWER_COLORS[SYSKEY[q.sys]];
          const load = q.fill > 1.001;
          const y = Math.min(1, q.fill) * 2 * r;
          return (
            <g key={q.p.id}>
              <clipPath id={`${id}-c${q.sys}`}>
                <circle cx={cx} cy={cy} r={r} />
              </clipPath>
              <circle cx={cx} cy={cy} r={r} fill="#fff" />
              {y > 0.2 && <rect x={cx - r} y={cy + r - y} width={2 * r} height={y} fill={col.water} clipPath={`url(#${id}-c${q.sys})`} />}
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={load ? SEWER_COLORS.carga : col.shell} strokeWidth={load ? 2.5 : 1.6} />
              {/* profundidad: de la rasante a la clave del tubo */}
              <line x1={cx + r + 5} x2={cx + r + 5} y1={Y(q.groundZ)} y2={cy - r} stroke="var(--ink-3)" strokeWidth="0.8" markerEnd="" />
              <text x={cx + r + 8} y={(Y(q.groundZ) + cy - r) / 2 + 3} className="tick">{fmtNum(q.cover, 1)} m</text>
            </g>
          );
        })}
        {pipeInfo.map((q) =>
          showsSystem(filter, q.sys) ? (
            <text key={`t${q.p.id}`} x={X(q.v)} y={Y(q.inv) + 13} textAnchor="middle" className="direct small">
              {q.sys === 0 ? 'Lluvias' : 'Residuales'} Ø {Math.round(q.p.D * 1000)}
            </text>
          ) : null,
        )}
        <text x={L0} y={Hd - 4} className="tick">{left}</text>
        <text x={Wd - R0} y={Hd - 4} textAnchor="end" className="tick">{right}</text>
        <text x={(L0 + Wd - R0) / 2} y={Hd - 4} textAnchor="middle" className="tick">{fmtNum(v1 - v0, 0)} m · misma escala en vertical</text>
      </svg>
      <p className="city-small">
        La de aguas lluvias recibe los sumideros del bordillo; la de aguas residuales va {fmtNum(sep, 1)} m más honda para recibir las casas por debajo y cruzar la otra red sin tocarla (EPM pide al menos 0,5 m entre ellas en los cruces).
      </p>
    </figure>
  );
}

/** Esquema en planta de las dos redes: colectores con el sentido del flujo, cámaras y descargas. */
export function NetworkPlan({ sim, sc, filter, erradas }: { sim: CitySim; sc: Scenario; filter: NetFilter; erradas: boolean }) {
  const id = useId();
  const c = sim.c, s = c.sewer!, sw = sim.sewer!;
  const env = { h: sim.h, z: c.z, area: c.area, dx: c.dx };
  const Wm = sc.extent.width, Hm = sc.extent.height;
  const Wd = 340, Hd = Math.round((Wd * Hm) / Wm);
  const k = Wd / Wm;
  const P = (x: number, y: number) => `${(x * k).toFixed(1)},${((Hm - y) * k).toFixed(1)}`;
  const streets = sc.surfaces.filter((p) => p.cover === 'asfalto');
  const water = sc.surfaces.filter((p) => p.cover === 'cauce');
  const dt = sim.lastDt > 0 ? sim.lastDt : 1;
  const ac = useMemo(() => acometidas(sc, c, erradas), [sc, c, erradas]);
  let loaded = 0, over = 0;
  s.pipes.forEach((p, q) => {
    if (showsSystem(filter, p.system) && p.role === 'colector' && sw.fillOf(q, env) > 1.001) loaded++;
  });
  s.nodes.forEach((n, q) => {
    if (showsSystem(filter, n.system) && sw.lastOverflow[q] / dt > 2e-4) over++;
  });
  const desc = `Planta del sector con ${filter === 'ambas' ? 'las dos redes' : `la red de ${filter === 'lluvias' ? 'aguas lluvias' : 'aguas residuales'}`}. ${loaded ? `${loaded} tramos en carga.` : 'Ningún tramo en carga.'} ${over ? `${over} cámaras o sumideros rebosan ahora.` : ''}`;
  return (
    <figure className="city-chart net-plan">
      <figcaption id={`${id}-t`}>Las redes en planta (sentido del agua)</figcaption>
      <ul className="chart-legend">
        {showsSystem(filter, 0) && <li><span className="sw-swatch" style={{ background: SEWER_COLORS.lluvias.shell }} />Aguas lluvias</li>}
        {showsSystem(filter, 1) && <li><span className="sw-swatch" style={{ background: SEWER_COLORS.residuales.shell }} />Aguas residuales</li>}
        <li><span className="sw-swatch ring" style={{ borderColor: SEWER_COLORS.carga }} />En carga o rebosando</li>
      </ul>
      <svg viewBox={`0 0 ${Wd} ${Hd}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <desc id={`${id}-d`}>{desc}</desc>
        <rect x="0" y="0" width={Wd} height={Hd} fill="#f4f1ea" />
        {water.map((p) => <polygon key={p.id} points={p.polygon.map(([x, y]) => P(x, y)).join(' ')} fill="#cfe3ef" />)}
        {streets.map((p) => <polygon key={p.id} points={p.polygon.map(([x, y]) => P(x, y)).join(' ')} fill="#dcdcd8" />)}
        {sc.buildings.map((b) => <polygon key={b.id} points={b.polygon.map(([x, y]) => P(x, y)).join(' ')} fill="#fff" stroke="#d9d2c4" strokeWidth="0.6" />)}
        {showsSystem(filter, 1) &&
          ac.map((a) => <line key={`a${a.b}`} x1={a.from[0] * k} y1={(Hm - a.from[1]) * k} x2={a.to[0] * k} y2={(Hm - a.to[1]) * k} stroke={a.errada ? SEWER_COLORS.errada : SEWER_COLORS.residuales.shell} strokeWidth={a.errada ? 1.6 : 0.8} opacity={a.errada ? 1 : 0.55} />)}
        {s.pipes.map((p, q) => {
          if (!showsSystem(filter, p.system)) return null;
          const a = s.nodes[p.a], b = s.nodes[p.b];
          const col = SEWER_COLORS[SYSKEY[p.system as 0 | 1]].shell;
          const load = sw.fillOf(q, env) > 1.001;
          const x1 = a.x * k, y1 = (Hm - a.y) * k, x2 = b.x * k, y2 = (Hm - b.y) * k;
          const Lp = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / Lp, uy = (y2 - y1) / Lp;
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const w = p.role === 'colector' ? 1.6 + p.D * 5 : 1;
          return (
            <g key={p.id}>
              {load && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={SEWER_COLORS.carga} strokeWidth={w + 4} opacity="0.75" />}
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={w} strokeLinecap="round" />
              {p.role === 'colector' && Lp > 14 && <polygon points={`${mx + ux * 5},${my + uy * 5} ${mx - ux * 3 - uy * 4},${my - uy * 3 + ux * 4} ${mx - ux * 3 + uy * 4},${my - uy * 3 - ux * 4}`} fill={col} stroke="#fff" strokeWidth="0.6" />}
              <title>{`${p.id} · Ø ${Math.round(p.D * 1000)} mm · ${load ? 'en carga' : `${fmtNum(Math.min(1, sw.fillOf(q, env)) * 100, 0)} % lleno`}`}</title>
            </g>
          );
        })}
        {s.nodes.map((n, q) => {
          if (!showsSystem(filter, n.system)) return null;
          const col = SEWER_COLORS[SYSKEY[n.system as 0 | 1]].shell;
          const x = n.x * k, y = (Hm - n.y) * k;
          const ov = sw.lastOverflow[q] / dt > 2e-4;
          if (n.kind === 'caja-sumidero') return <rect key={n.id} x={x - 2} y={y - 2} width="4" height="4" fill="#22272b"><title>{n.name}</title></rect>;
          if (n.outfall)
            return (
              <g key={n.id}>
                <circle cx={x} cy={y} r="4.5" fill={col} />
                <text x={Math.min(Wd - 4, Math.max(4, x + (x > Wd / 2 ? -6 : 6)))} y={Math.min(Hd - 4, Math.max(10, y - 6))} textAnchor={x > Wd / 2 ? 'end' : 'start'} className="tick plan-out">
                  {n.outfall === 2 ? '→ quebrada' : n.system === 0 ? '→ colector' : '→ interceptor'}
                </text>
                <title>{n.name}</title>
              </g>
            );
          return (
            <g key={n.id}>
              {ov && <circle cx={x} cy={y} r="7" fill="none" stroke={SEWER_COLORS.carga} strokeWidth="2" />}
              {n.kind === 'caida' ? <rect x={x - 3.2} y={y - 3.2} width="6.4" height="6.4" fill="#fff" stroke={col} strokeWidth="1.6" /> : <circle cx={x} cy={y} r="3.2" fill="#fff" stroke={col} strokeWidth="1.6" />}
              {filter !== 'ambas' && <text x={x + 5} y={y - 4} className="tick plan-id">{n.id}</text>}
              <title>{`${n.name}${ov ? ' · rebosa ahora' : ''}`}</title>
            </g>
          );
        })}
      </svg>
      <p className="city-small">Círculos: cámaras de inspección (cuadro: cámara de caída). Cuadritos negros: sumideros. Líneas finas: acometidas de las casas{erradas ? '; en violeta, las conexiones erradas' : ''}. {desc}</p>
    </figure>
  );
}

/** Perfil longitudinal del colector principal: terreno, tubería, cámaras y nivel del agua calculado. */
export function ProfileChart({ sim, system }: { sim: CitySim; system: 0 | 1 }) {
  const id = useId();
  const c = sim.c, s = c.sewer!, sw = sim.sewer!;
  const path = useMemo(() => mainPath(c, system), [c, system]);
  if (path.length < 2) return null;
  const env = { h: sim.h, z: c.z, area: c.area, dx: c.dx };
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
  const W = 340, H = 220, L0 = 40, R0 = 10, T0 = 14, B0 = 34;
  const X = (x: number) => L0 + (x / xs[xs.length - 1]) * (W - L0 - R0);
  const Y = (z: number) => T0 + (1 - (z - zmin) / (zmax - zmin)) * (H - T0 - B0);
  const colors = SEWER_COLORS[SYSKEY[system]];
  const dt = sim.lastDt > 0 ? sim.lastDt : 1;
  const surcharged = segs.filter(({ p }) => p >= 0 && sw.fillOf(p, env) > 1.001).length;
  const overflowing = path.filter((k) => sw.lastOverflow[k] / dt > 2e-4);
  const out = s.nodes[path[path.length - 1]];
  const desc = `Perfil de ${SYS[system].toLowerCase()} desde ${s.nodes[path[0]].id} hasta ${out.outfall === 2 ? 'la descarga a la quebrada' : 'la salida del sector'}: ${fmtNum(xs[xs.length - 1], 0)} m. ${surcharged ? `${surcharged} tramos en carga.` : 'Ningún tramo en carga.'} ${overflowing.length ? `Rebosa ${overflowing.map((k) => s.nodes[k].id).join(', ')}.` : ''}`;
  // marcas verticales: profundidad bajo la rasante más alta del perfil, en metros enteros
  const zRef = Math.max(...ground.map((g) => g[1]));
  const ticks: number[] = [];
  for (let d = 0; zRef - d >= zmin; d += Math.max(1, Math.ceil((zRef - zmin) / 4))) ticks.push(d);
  return (
    <figure className="city-chart">
      <figcaption id={`${id}-t`}>Perfil del colector principal de {SYS[system].toLowerCase()}</figcaption>
      <ul className="chart-legend">
        <li><svg width="18" height="10" aria-hidden="true"><line x1="1" y1="5" x2="17" y2="5" stroke="#6b5a45" strokeWidth="2" /></svg>Terreno</li>
        <li><svg width="18" height="10" aria-hidden="true"><rect x="1" y="1" width="16" height="8" fill={colors.shell} opacity="0.3" stroke={colors.shell} /></svg>Tubería</li>
        <li><svg width="18" height="10" aria-hidden="true"><rect x="1" y="1" width="16" height="8" fill={colors.water} /></svg>Agua</li>
        <li><svg width="18" height="10" aria-hidden="true"><rect x="1" y="1" width="16" height="8" fill="none" stroke={SEWER_COLORS.carga} strokeWidth="2" /></svg>En carga</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <desc id={`${id}-d`}>{desc}</desc>
        {ticks.map((d) => (
          <g key={d}>
            <line x1={L0} x2={W - R0} y1={Y(zRef - d)} y2={Y(zRef - d)} className="grid" />
            <text x={L0 - 5} y={Y(zRef - d) + 4} textAnchor="end" className="tick">{d === 0 ? '0 m' : `−${d} m`}</text>
          </g>
        ))}
        <polygon points={`${X(0)},${Y(zmin)} ${ground.map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join(' ')} ${X(xs[xs.length - 1])},${Y(zmin)}`} fill="#efe7d6" />
        <polyline points={ground.map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join(' ')} fill="none" stroke="#6b5a45" strokeWidth="2" />
        {segs.map(({ p, x0, x1 }, q) => {
          if (p < 0) return null;
          const pp = s.pipes[p];
          const load = sw.fillOf(p, env) > 1.001;
          const za = pp.zUp, zb = pp.zDn;
          const ha = Math.min(heads[q], za + pp.D), hb = Math.min(heads[q + 1], zb + pp.D);
          return (
            <g key={pp.id}>
              <polygon points={`${X(x0)},${Y(za)} ${X(x1)},${Y(zb)} ${X(x1)},${Y(zb + pp.D)} ${X(x0)},${Y(za + pp.D)}`} fill="#fff" stroke={load ? SEWER_COLORS.carga : colors.shell} strokeWidth={load ? 2.4 : 1.2} />
              {(ha > za + 0.002 || hb > zb + 0.002) && <polygon points={`${X(x0)},${Y(za)} ${X(x1)},${Y(zb)} ${X(x1)},${Y(Math.max(zb, hb))} ${X(x0)},${Y(Math.max(za, ha))}`} fill={colors.water} opacity="0.95" />}
              <title>{`${pp.id} · Ø ${Math.round(pp.D * 1000)} mm · ${load ? 'en carga' : `${fmtNum(Math.min(1, sw.fillOf(p, env)) * 100, 0)} % lleno`}`}</title>
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
              <rect x={X(xs[q]) - w / 2} y={Y(n.rim)} width={w} height={Math.max(1, Y(n.inv) - Y(n.rim))} fill={colors.shell} opacity="0.4" />
              {over && <text x={X(xs[q])} y={Y(n.rim) - 4} textAnchor="middle" className="direct small txt-danger-fill">rebosa</text>}
              <text x={X(xs[q])} y={H - 18} textAnchor="middle" className="tick plan-id">{n.id}</text>
            </g>
          );
        })}
        {/* línea de energía piezométrica (nivel en las cámaras) */}
        <polyline points={heads.map((h, q) => `${X(xs[q]).toFixed(1)},${Y(Math.max(h, s.nodes[path[q]].inv)).toFixed(1)}`).join(' ')} fill="none" stroke={colors.shell} strokeWidth="1.2" strokeDasharray="3 2" />
        <text x={L0} y={H - 4} className="tick">0 m</text>
        <text x={W - R0} y={H - 4} textAnchor="end" className="tick">{fmtNum(xs[xs.length - 1], 0)} m · {out.outfall === 2 ? 'descarga a la quebrada' : 'sigue fuera del sector'}</text>
      </svg>
      <p className="city-small">{desc} Línea punteada: nivel del agua en las cámaras.</p>
    </figure>
  );
}

// ================================================================ creciente

const CREEK_PRESETS: { f: number; label: string; tp?: number; cv?: number; tone: 'ok' | 'warn' | 'danger' | 'neutral' }[] = [
  { f: 0, label: 'Sin creciente', tone: 'neutral' },
  { f: 0.6, label: 'Cabe en el cauce', tone: 'ok' },
  { f: 1, label: 'Cauce lleno', tone: 'ok' },
  { f: 1.5, label: 'Se desborda', tone: 'warn' },
  { f: 2.5, label: 'Inundación grave', tone: 'danger' },
  { f: 3.5, label: 'Avenida torrencial', tp: 3, cv: 0.3, tone: 'danger' },
];

export function CreekTool({ ctrl, sc }: ToolProps) {
  const sim = ctrl.displayed();
  const c = sim?.c;
  const cr = c?.creek;
  const cf = ctrl.shared.creek ?? null;
  const cap = cr?.capacity ?? 0;
  const set = (f: CreekFlood | null) => {
    const need = f ? Math.ceil(f.startMin + 2.67 * f.timeToPeakMin + 10) : 0;
    ctrl.update({ shared: { creek: f, simMinutes: Math.min(120, Math.max(ctrl.shared.simMinutes, need)) } });
  };
  const preset = (p: (typeof CREEK_PRESETS)[number]) =>
    set(p.f === 0 ? null : { peakM3s: Math.round(p.f * cap), timeToPeakMin: p.tp ?? 6, startMin: cf?.startMin ?? 2, sedimentCv: p.cv ?? 0 });
  const now = sim && cr ? sim.creekSection() : null;
  const nSamples = sim?.samples.length ?? 0;
  const series: Series[] = useMemo(() => {
    if (!sim || !cr) return [];
    const pts = sim.samples.filter((q) => q.creek);
    return [
      { id: 'Entra', label: 'Entra', name: 'Caudal que entra (creciente)', color: '#5b6470', dash: true, points: pts.map((q) => [q.t / 60, q.creek!.qin] as [number, number]) },
      { id: 'Cauce', label: 'Cauce', name: 'Pasa por el cauce', color: '#2a78d6', points: pts.map((q) => [q.t / 60, Math.max(0, q.creek!.qChannel)] as [number, number]) },
      { id: 'Fuera', label: 'Desborde', name: 'Pasa por fuera del cauce', color: '#c0462a', fill: true, points: pts.map((q) => [q.t / 60, Math.max(0, q.creek!.qOutside)] as [number, number]) },
    ];
    // las muestras crecen con el cálculo: se recalcula con su número
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, cr, nSamples]);
  const damage = useMemo(() => {
    if (!sim) return null;
    const ex = exposureOf(sim);
    return { ex: ex.filter((e) => e.depth >= AFFECTED_DEPTH_M).sort((a, b) => b.hazard - a.hazard || b.depth - a.depth), sum: damageSummary(ex) };
    // se recalcula con las muestras (cada 10 s simulados)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, nSamples]);
  if (!cr || !sc.creek) return null;
  const rel = cf ? cf.peakM3s / cap : 0;
  const pick = cf ? CREEK_PRESETS.reduce((b, p) => (Math.abs(rel - p.f) + Math.abs((cf.sedimentCv ?? 0) - (p.cv ?? 0)) < Math.abs(rel - b.f) + Math.abs((cf.sedimentCv ?? 0) - (b.cv ?? 0)) ? p : b), CREEK_PRESETS[1]) : CREEK_PRESETS[0];
  const overBank = now ? now.level - cr.bankLevel : 0;
  const moved = sim ? sim.drift.filter((o) => o.tMoved >= 0).length : 0;
  const cv = cf?.sedimentCv ?? 0;
  return (
    <section className="tool-body creek-tool" aria-label="Creciente de la quebrada">
      <h3>Creciente de la quebrada</h3>
      <p className="city-small">
        En la sección de control, frente a las casas de la orilla, el cauce lleva hasta <strong>{m3s(cap)}</strong>: la orilla está a {fmtNum(cr.bankLevel - cr.zBed, 2)} m del fondo y la pendiente es de {fmtNum(cr.slope * 100, 1)} %. Si llega más agua, se sale hacia el retiro y las casas construidas en él.
      </p>
      <div className="preset-grid" role="group" aria-label="Crecientes de ejemplo">
        {CREEK_PRESETS.map((p) => {
          const on = pick === p;
          return (
            <button key={p.label} type="button" className={`preset tone-${p.tone}${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => preset(p)}>
              <strong>{p.label}</strong>
              <span>{p.f === 0 ? 'solo el caudal base' : `${fmtNum(p.f * 100, 0)} % · ${fmtNum(p.f * cap * (p.cv ? bulkingFactor(p.cv) : 1), 0)} m³/s${p.cv ? ' con lodo' : ''}`}</span>
            </button>
          );
        })}
      </div>
      {cf && (
        <details className="city-summary creek-adjust">
          <summary>Ajustar la creciente</summary>
          <Range label="Caudal pico del agua" value={cf.peakM3s} min={1} max={Math.round(4 * cap)} step={1} unit="m³/s" onChange={(v) => set({ ...cf, peakM3s: v })} help={`${fmtNum(rel * 100, 0)} % de la capacidad del cauce en la sección.`} />
          <Range label="Tiempo hasta el pico" value={cf.timeToPeakMin} min={2} max={15} step={1} unit="min" onChange={(v) => set({ ...cf, timeToPeakMin: v })} />
          <Range label="Empieza en el minuto" value={cf.startMin} min={0} max={20} step={1} unit="min" onChange={(v) => set({ ...cf, startMin: v })} />
          <Segmented<number>
            label="Lodo y piedras que arrastra"
            value={Math.round(cv * 100)}
            options={[0, 10, 20, 30].map((v) => ({ value: v, label: v === 0 ? 'Agua' : `${v} %` }))}
            onChange={(v) => set({ ...cf, sedimentCv: v / 100 })}
            help={cv > 0 ? `La mezcla ocupa ${fmtNum(bulkingFactor(cv), 2)} veces el volumen del agua: pico de ${m3s(cf.peakM3s * bulkingFactor(cv))}. Desde ≈ 20 % ya es una inundación de lodo; el modelo la mueve como agua (no simula el lodo espeso ni el golpe de piedras).` : 'Solo agua.'}
          />
        </details>
      )}
      {cf && <p className="city-small">Hidrograma triangular: sube en {cf.timeToPeakMin} min y baja en {fmtNum(1.67 * cf.timeToPeakMin, 0)} min, sobre un caudal base de {fmtNum(cr.baseM3s, 1)} m³/s. Es un ejercicio: no es un caudal medido ni un pronóstico de inundación.</p>}
      {now && sim && (
        <>
          <div className="stat-row">
            <Stat label="Entra ahora" value={m3s(now.qin)} sub={`${fmtNum((now.qin / cap) * 100, 0)} % de la capacidad`} tone={now.qin > cap ? 'warn' : 'neutral'} />
            <Stat label="Nivel en la sección" value={`${overBank >= 0 ? '+' : '−'}${fmtNum(Math.abs(overBank), 2)} m`} sub={overBank >= 0 ? 'sobre la orilla' : 'bajo la orilla'} tone={overBank > 0.5 ? 'danger' : overBank > 0 ? 'warn' : 'ok'} />
            <Stat label="Casas con agua" value={damage ? String(damage.sum.affected) : '0'} sub={damage && damage.sum.severe ? `${damage.sum.severe} con peligro H5 o más` : 'ninguna con daño estructural posible'} tone={damage && damage.sum.severe ? 'danger' : damage && damage.sum.affected ? 'warn' : 'ok'} />
            <Stat label="Vehículos movidos" value={`${moved} de ${sim.drift.length}`} sub={sim.drift.some((o) => o.state === 'fuera') ? `${sim.drift.filter((o) => o.state === 'fuera').length} salieron del sector` : 'por el agua'} tone={moved ? 'danger' : 'ok'} />
          </div>
          <SectionChart sim={sim} sc={sc} />
          <LineChart title="Caudales en la sección de control" series={series} fmtY={(v) => `${fmtNum(v, 0)} m³/s`} yUnit="metros cúbicos por segundo" refY={{ y: cap, label: `capacidad del cauce: ${fmtNum(cap, 0)} m³/s` }} height={170} xMax={ctrl.shared.simMinutes} nowX={sim.t / 60} />
          {damage && damage.ex.length > 0 && (
            <table className="city-table dmg-table">
              <caption>Daños calculados hasta ahora (máximo junto a cada edificación)</caption>
              <thead>
                <tr><th scope="col">Edificación</th><th scope="col">Agua</th><th scope="col">Velocidad</th><th scope="col">Peligro</th></tr>
              </thead>
              <tbody>
                {damage.ex.slice(0, 8).map((e) => (
                  <tr key={e.id}>
                    <th scope="row">{buildingName(e.id)}</th>
                    <td>{fmtDepth(e.depth)}</td>
                    <td>{fmtNum(e.speed, 1)} m/s</td>
                    <td><HazChip h={e.hazard} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {damage && damage.ex.length > 8 && <p className="city-small">Y {damage.ex.length - 8} edificaciones más con agua contra sus muros.</p>}
          <p className="city-small">Peligro según profundidad y velocidad calculadas, con las clases H1–H6 de la guía australiana de riesgo de inundación ({HAZARD_SOURCE}). Es una referencia técnica para aprender: no es la zonificación oficial de amenaza de Medellín.</p>
        </>
      )}
      {sim && <CulvertSection ctrl={ctrl} sc={sc} sim={sim} />}
      <div className="btn-row">
        <button type="button" className="btn-ghost small" onClick={() => ctrl.focusCreekSection()}>
          Ver la sección en la maqueta
        </button>
        <button type="button" className={`btn-ghost small${ctrl.viewMode() === 'peligro' ? ' is-on' : ''}`} aria-pressed={ctrl.viewMode() === 'peligro'} onClick={() => ctrl.setView(ctrl.viewMode() === 'peligro' ? 'realista' : 'peligro')}>
          {ctrl.viewMode() === 'peligro' ? 'Volver a la vista realista' : 'Ver el mapa de peligro'}
        </button>
      </div>
    </section>
  );
}

/** Estado de una cobertura en palabras: libre, tapada un porcentaje fijo o tapándose con la creciente. */
export function culvertStateText(st: { obstruction: number; progressive: boolean } | undefined): string {
  if (!st || st.obstruction <= 0) return 'libre';
  return st.progressive ? `se tapa con la creciente (hasta ${fmtNum(st.obstruction * 100, 0)} %)` : `tapada ${fmtNum(st.obstruction * 100, 0)} %`;
}

type CulvertChoice = 'libre' | '50' | '90' | 'crece';
const CULVERT_CHOICES: { value: CulvertChoice; label: string; st: CulvertState }[] = [
  { value: 'libre', label: 'Libre', st: { obstruction: 0, progressive: false } },
  { value: '50', label: 'Tapada 50\u00a0%', st: { obstruction: 0.5, progressive: false } },
  { value: '90', label: 'Tapada 90\u00a0%', st: { obstruction: 0.9, progressive: false } },
  { value: 'crece', label: 'Se tapa con la creciente', st: { obstruction: 0.9, progressive: true } },
];
const choiceOf = (st: CulvertState | undefined): CulvertChoice =>
  !st || st.obstruction <= 0 ? 'libre' : st.progressive ? 'crece' : st.obstruction >= 0.7 ? '90' : '50';

/**
 * Cobertura bajo la carrera: estado de la entrada (libre o tapada por troncos), caudal calculado por los cajones
 * y por encima de la vía, nivel del agua en la entrada respecto de la vía y su evolución en el tiempo.
 */
export function CulvertSection({ ctrl, sc, sim }: { ctrl: CityController; sc: Scenario; sim: CitySim }) {
  const id = useId();
  const nSamples = sim.samples.length;
  const specs = sc.culverts ?? [];
  const series: Series[][] = useMemo(
    () =>
      specs.map((_, ci) => {
        const pts = sim.samples.filter((q) => q.culverts?.[ci]);
        return [
          { id: 'Entra', label: 'Llega', name: 'Caudal que trae la quebrada', color: '#5b6470', dash: true, points: sim.samples.filter((q) => q.creek).map((q) => [q.t / 60, q.creek!.qin] as [number, number]) },
          { id: 'Cajones', label: 'Cajones', name: 'Pasa por los cajones', color: '#2a78d6', points: pts.map((q) => [q.t / 60, Math.max(0, q.culverts![ci].q)] as [number, number]) },
          { id: 'Via', label: 'Sobre la vía', name: 'Pasa por encima de la vía', color: '#c0462a', fill: true, points: pts.map((q) => [q.t / 60, Math.max(0, q.culverts![ci].over)] as [number, number]) },
        ];
      }),
    // las muestras crecen con el cálculo: se recalcula con su número
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sim, nSamples, specs],
  );
  if (!specs.length) return null;
  return (
    <>
      {specs.map((cs, ci) => {
        const cu = sim.c.culverts[ci];
        const st = sim.culv[ci];
        if (!cu || !st) return null;
        const iv = ctrl.ivB.culverts?.[cs.id];
        const choice = choiceOf(iv);
        const head = st.up - cu.crestZ;
        const wet = st.up > cu.zIn + 0.01;
        return (
          <section key={cs.id} className="culvert-box" aria-labelledby={`${id}-${ci}`}>
            <h4 id={`${id}-${ci}`}>{cs.name}</h4>
            <p className="city-small">
              La carrera cruza la quebrada sobre un terraplén. El agua pasa por {cs.barrels} cajones de {fmtNum(cs.spanM / cs.barrels, 1)} × {fmtNum(cs.riseM, 1)} m; con el agua a la altura de la vía caben <strong>{m3s(cu.capacityFree)}</strong>. Si llega más agua, o si troncos y ramas tapan la entrada, el agua sube y pasa por encima de la vía.
            </p>
            <Segmented<CulvertChoice>
              label="Entrada de la cobertura"
              value={choice}
              options={CULVERT_CHOICES.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(v) => {
                const o = CULVERT_CHOICES.find((q) => q.value === v)!;
                ctrl.update({ B: { ...ctrl.ivB, culverts: { ...(ctrl.ivB.culverts ?? {}), [cs.id]: { ...o.st } } } });
              }}
              help={
                choice === 'crece'
                  ? `Empieza libre; cuando el caudal pasa de la mitad de la capacidad, los troncos se atascan y en ${fmtNum(CULVERT_CLOG_S / 60, 0)} minutos tapan el 90 % del ancho.`
                  : choice === 'libre'
                    ? 'Sin troncos: pasa todo el ancho de los cajones.'
                    : `Los troncos tapan el ${choice} % del ancho de los cajones desde el comienzo.`
              }
            />
            <div className="stat-row">
              <Stat label="Por los cajones" value={m3s(Math.max(0, st.q))} sub={st.control === 'entrada' ? 'manda la entrada' : st.control === 'salida' ? 'manda la salida' : 'sin caudal'} tone="neutral" accent="#2a78d6" />
              <Stat label="Sobre la vía" value={m3s(Math.max(0, st.over))} sub={st.overMax > 0.05 ? `máximo ${m3s(st.overMax)}` : 'la vía sigue seca'} tone={st.over > 0.05 ? 'danger' : st.overMax > 0.05 ? 'warn' : 'ok'} />
              <Stat label="Agua en la entrada" value={wet ? `${head >= 0 ? '+' : '−'}${fmtNum(Math.abs(head), 2)} m` : 'seca'} sub={wet ? (head >= 0 ? 'sobre la vía' : 'bajo la vía') : 'sin agua en la boca'} tone={head > 0 ? 'danger' : head > -0.5 ? 'warn' : 'ok'} />
              <Stat label="Tapada" value={`${fmtNum(st.obs * 100, 0)} %`} sub={st.obsMax > st.obs + 0.005 ? `máximo ${fmtNum(st.obsMax * 100, 0)} %` : 'del ancho de los cajones'} tone={st.obs >= 0.5 ? 'danger' : st.obs > 0 ? 'warn' : 'ok'} />
            </div>
            <LineChart title={`Caudales en la ${cs.name.toLowerCase()}`} series={series[ci]} fmtY={(v) => `${fmtNum(v, 0)} m³/s`} yUnit="metros cúbicos por segundo" refY={{ y: cu.capacityFree, label: `capacidad libre: ${fmtNum(cu.capacityFree, 0)} m³/s` }} height={160} xMax={ctrl.shared.simMinutes} nowX={sim.t / 60} />
            <p className="city-small">
              Hidráulica de alcantarillas de la guía HDS-5 de la FHWA: en cada momento pasa lo que permita el más restrictivo entre la entrada y el cajón completo. Los troncos reducen el ancho útil. Es un ejercicio: no es el diseño ni el estado de una obra real.
            </p>
            <button type="button" className="btn-ghost small" onClick={() => ctrl.focusCulvert(ci)}>
              Ver la cobertura en la maqueta
            </button>
          </section>
        );
      })}
    </>
  );
}

/**
 * Sección transversal de la quebrada en vivo, mirando aguas abajo: terreno y casas de la malla de cálculo,
 * agua calculada ahora, nivel máximo alcanzado, cauce lleno y una franja con la clase de peligro de cada
 * celda. Escala vertical fija (no se reajusta con la creciente) para que se vea cuánto sube el agua.
 */
export function SectionChart({ sim, sc }: { sim: CitySim; sc: Scenario }) {
  const id = useId();
  const c: Compiled = sim.c;
  const cr = c.creek!;
  const { nx, dx } = c;
  const rows = [] as { y: number; z: number; h: number; hm: number; solid: boolean; b: number; haz: number }[];
  for (let j = cr.j0; j <= cr.j1; j++) {
    const k = j * nx + cr.i;
    const [u, v] = sim.velocityCapped(k);
    rows.push({ y: (j + 0.5) * dx, z: c.solid[k] ? c.zGround[k] : c.z[k], h: sim.h[k], hm: sim.hmaxField[k], solid: !!c.solid[k], b: c.building[k], haz: c.solid[k] ? 0 : hazardClass(sim.h[k], Math.hypot(u, v)) });
  }
  const zb = cr.zBed;
  const zTop = zb + Math.max(5, ...rows.map((r) => r.z + r.hm - zb + 0.4));
  const W = 340, H = 230, L0 = 34, R0 = 10, T0 = 12, B0 = 40;
  const y0 = rows[0].y - dx / 2, y1 = rows[rows.length - 1].y + dx / 2;
  // mirando aguas abajo, el norte (margen izquierda) queda a la izquierda
  const X = (y: number) => L0 + ((y1 - y) / (y1 - y0)) * (W - L0 - R0);
  const Y = (z: number) => T0 + (1 - (z - zb + 0.3) / (zTop - zb + 0.3)) * (H - T0 - B0);
  const base = Y(zb - 0.3);
  const rev = [...rows].reverse();
  // terreno: centros de celda unidos (las casas se dibujan aparte)
  const gpts = rev.map((r) => `${X(r.y).toFixed(1)},${Y(r.z).toFixed(1)}`).join(' ');
  // agua: tramos contiguos de celdas mojadas, entre el terreno y la superficie
  const wetRuns: (typeof rows)[] = [];
  let run: typeof rows = [];
  for (const r of rev) {
    if (!r.solid && r.h > 0.005) run.push(r);
    else if (run.length) {
      wetRuns.push(run);
      run = [];
    }
  }
  if (run.length) wetRuns.push(run);
  const level = Math.max(...rows.map((r) => (r.h > 0.003 && !r.solid ? r.z + r.h : -Infinity)));
  const lmax = Math.max(...rows.map((r) => (r.hm > 0.003 && !r.solid ? r.z + r.hm : -Infinity)));
  const out = rows.filter((r, q) => (q + cr.j0 <= cr.jb0 || q + cr.j0 >= cr.jb1) && r.h > 0.02 && !r.solid);
  // casas en la sección (celdas sólidas contiguas del mismo edificio)
  const houses: { b: number; ya: number; yb: number; z: number }[] = [];
  for (const r of rows) {
    if (!r.solid || r.b < 0) continue;
    const last = houses[houses.length - 1];
    if (last && last.b === r.b && Math.abs(r.y - dx - last.yb) < 1e-6) last.yb = r.y;
    else houses.push({ b: r.b, ya: r.y, yb: r.y, z: r.z });
  }
  const jt = cr.jt - cr.j0;
  const talweg = rows[jt];
  const depthNow = Number.isFinite(level) ? level - zb : 0;
  const desc = `Sección de control, mirando aguas abajo: fondo a cota relativa 0; orilla (cauce lleno) a ${fmtNum(cr.bankLevel - zb, 2)} m. Agua ${Number.isFinite(level) ? `a ${fmtNum(level - zb, 2)} m` : 'seca'}${Number.isFinite(lmax) && lmax > level + 0.02 ? `; ya llegó a ${fmtNum(lmax - zb, 2)} m` : ''}${out.length ? `; hay agua fuera del cauce en ${fmtNum(out.length * dx, 0)} m del retiro` : ''}.`;
  const ticks = [0, 1, 2, 3, 4, 5, 6].filter((v) => zb + v <= zTop);
  return (
    <figure className="city-chart sec-chart">
      <figcaption id={`${id}-t`}>Sección transversal de la quebrada (calculada ahora)</figcaption>
      <ul className="chart-legend">
        <li><svg width="18" height="10" aria-hidden="true"><rect x="1" y="1" width="16" height="8" fill="#4a90d9" opacity="0.85" /></svg>Agua ahora</li>
        <li><svg width="18" height="10" aria-hidden="true"><line x1="1" y1="5" x2="17" y2="5" stroke="#1f3b57" strokeWidth="1.5" strokeDasharray="4 2" /></svg>Nivel máximo</li>
        <li><svg width="18" height="10" aria-hidden="true"><line x1="1" y1="5" x2="17" y2="5" stroke="#c92a2a" strokeWidth="1.5" strokeDasharray="2 2" /></svg>Cauce lleno</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <desc id={`${id}-d`}>{desc}</desc>
        <defs>
          <pattern id={`${id}-soil`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#e3d6bd" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#cdbb98" strokeWidth="1.2" />
          </pattern>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L0} x2={W - R0} y1={Y(zb + v)} y2={Y(zb + v)} className="grid" />
            <text x={L0 - 5} y={Y(zb + v) + 4} textAnchor="end" className="tick">{v} m</text>
          </g>
        ))}
        {wetRuns.map((rr, q) => {
          const top = rr.map((r) => `${X(r.y + dx / 2).toFixed(1)},${Y(r.z + r.h).toFixed(1)} ${X(r.y - dx / 2).toFixed(1)},${Y(r.z + r.h).toFixed(1)}`).join(' ');
          const bot = [...rr].reverse().map((r) => `${X(r.y - dx / 2).toFixed(1)},${Y(Math.min(r.z, zb) - 0.3).toFixed(1)} ${X(r.y + dx / 2).toFixed(1)},${Y(Math.min(r.z, zb) - 0.3).toFixed(1)}`).join(' ');
          return <polygon key={`w${q}`} points={`${top} ${bot}`} fill="#4a90d9" opacity="0.85" />;
        })}
        <polygon points={`${X(y1)},${base} ${gpts} ${X(y0)},${base}`} fill={`url(#${id}-soil)`} />
        <polyline points={gpts} fill="none" stroke="#6b5a45" strokeWidth="1.6" />
        {houses.map((hh) => {
          const bs = sc.buildings[hh.b];
          const hgt = Math.min(bs.heightM, zTop - hh.z - 0.2);
          const xa = X(hh.yb + dx / 2), xb = X(hh.ya - dx / 2);
          return (
            <g key={`h${hh.b}-${hh.ya}`}>
              <rect x={xa} y={Y(hh.z + hgt)} width={xb - xa} height={Y(hh.z) - Y(hh.z + hgt)} fill="#f3eee6" stroke="#8c7d68" strokeWidth="1" />
              <rect x={xa + (xb - xa) * 0.3} y={Y(hh.z + 1.1)} width={(xb - xa) * 0.4} height={Y(hh.z + 0.15) - Y(hh.z + 1.1)} fill="#b9c6cf" stroke="#8c7d68" strokeWidth="0.6" />
              <text x={(xa + xb) / 2} y={Y(hh.z + hgt) - 4} textAnchor="middle" className="tick">{buildingName(bs.id).replace('Casa de la orilla', 'Casa')}</text>
            </g>
          );
        })}
        {Number.isFinite(lmax) && <line x1={L0} x2={W - R0} y1={Y(lmax)} y2={Y(lmax)} stroke="#1f3b57" strokeWidth="1.2" strokeDasharray="4 2" />}
        <line x1={X((cr.jb1 + 0.5) * dx)} x2={X((cr.jb0 + 0.5) * dx)} y1={Y(cr.bankLevel)} y2={Y(cr.bankLevel)} stroke="#c92a2a" strokeWidth="1.5" strokeDasharray="2 2" />
        {/* profundidad en el talweg */}
        {depthNow > 0.05 && (
          <g>
            <line x1={X(talweg.y)} x2={X(talweg.y)} y1={Y(zb)} y2={Y(level)} stroke="#fff" strokeWidth="1.4" />
            <text x={X(talweg.y) + 4} y={(Y(zb) + Y(level)) / 2 + 4} className="direct small on-water">{fmtNum(depthNow, 2)} m</text>
          </g>
        )}
        {/* franja de peligro de cada celda ahora */}
        {rows.map((r) => (
          <rect key={`hz${r.y}`} x={X(r.y + dx / 2)} y={H - B0 + 6} width={Math.max(0.6, X(r.y - dx / 2) - X(r.y + dx / 2))} height="7" fill={r.solid ? '#cfc8bd' : HAZARD[r.haz].color} />
        ))}
        <text x={L0 - 4} y={H - B0 + 12} textAnchor="end" className="tick">peligro</text>
        <text x={L0} y={H - 8} className="tick">norte · casas</text>
        <text x={W - R0} y={H - 8} textAnchor="end" className="tick">sur · talud</text>
        <text x={(L0 + W - R0) / 2} y={H - 8} textAnchor="middle" className="tick">{fmtNum(y1 - y0, 0)} m, mirando aguas abajo</text>
      </svg>
      <p className="city-small">{desc}</p>
    </figure>
  );
}

// ================================================================ docente

/** Tablas para la pestaña Docente: criterios de EPM revisados y tramos con su caudal de diseño. */
export function SewerTeacher({ sc, c }: { sc: Scenario; c: Compiled }) {
  // el diseño de la red no depende de la malla del cálculo: se revisa siempre con la resolución de diseño
  const cd = useMemo(() => (c.dx === sc.defaultResolution ? c : compile(sc, { ...sc.defaults, dx: sc.defaultResolution }, baseInterventions(sc))), [sc, c]);
  const checks = useMemo(() => epmChecks(sc, cd), [sc, cd]);
  const rows = useMemo(() => designTable(sc, cd), [sc, cd]);
  const sw = sc.sewer!;
  return (
    <>
      <p className="city-small">
        {sw.standard}. Lluvia de diseño supuesta: {sw.designIntensityMmH} mm/h (método racional, C = 0,85·I + 0,15; EPM 6.3). No es la curva IDF de EPM. Aguas residuales: {sw.sanitary.personsPerFloor} personas por piso, dotación neta supuesta de {sw.sanitary.dotacionLpd} L/hab·día, retorno {fmtNum(sw.sanitary.returnCoef, 2)} (EPM 5.2.3.1), mayoración {fmtNum(sw.sanitary.peakFactor, 1)} (mínimo de EPM, 5.2.6), infiltración {fmtNum(sw.sanitary.infiltrationLpsHa, 1)} L/s·ha (5.2.3.6). Áreas aferentes y caudales de diseño con la malla de {fmtNum(cd.dx, 0)} m.
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

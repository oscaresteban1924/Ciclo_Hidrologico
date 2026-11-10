// Creciente desde la lluvia en la cuenca y aviso temprano (dentro de la herramienta «Creciente»).

import { useId, useMemo } from 'react';
import { Segmented } from '../../components/ui';
import type { CityController } from '../controller';
import type { CitySim } from '../sim/engine';
import { hydroAt, hyetograph } from '../sim/engine';
import { BASIN_COVERS, BASIN_COVER_LIST, WARNING, basinHydrograph, warningEvents, type BasinCover, type BasinResult, type WarningEvent } from '../sim/basin';
import type { Scenario, Shared } from '../sim/scenario';
import { buildingName } from '../render/floodNames';
import { fmtNum } from '../render/palette';
import { LineChart, type Series } from './Chart';

const m3s = (v: number) => `${fmtNum(v, v < 10 ? 1 : 0)} m³/s`;
const minTxt = (s: number) => `${fmtNum(s / 60, 0)} min`;

/** Aguaceros de una hora para la cuenca (la misma lluvia cae en el barrio). */
const STORMS = [
  { mmh: 60, label: 'Fuerte', sub: '60 mm en 1 hora' },
  { mmh: 80, label: 'Muy fuerte', sub: '80 mm en 1 hora' },
  { mmh: 100, label: 'Extrema', sub: '100 mm en 1 hora' },
];

/** Resultado de la cuenca: el de la corrida o, antes de correr, el que daría la configuración actual. */
function useBasin(ctrl: CityController, sim: CitySim | null): BasinResult | null {
  const sc = ctrl.sc;
  const basin = sc?.creek?.basin;
  const cover = ctrl.ivB.basinCover ?? 'mixta';
  const sh = ctrl.shared;
  return useMemo(() => {
    if (sim?.basin) return sim.basin;
    if (!basin || !sc?.creek) return null;
    return basinHydrograph(hyetograph(sh.rain), basin, cover, sh.soilInitial, sc.creek.baseM3s, sh.simMinutes * 60);
  }, [sim, basin, cover, sh.rain, sh.soilInitial, sh.simMinutes, sc]);
}

/**
 * Minutos de simulación para ver la creciente de la cuenca: hasta media hora después del pico en el barrio
 * (al menos 110 min, a lo sumo 240), sin acortar lo que ya estaba elegido.
 */
export function basinMinutes(sc: Scenario, rain: Shared['rain'], cover: BasinCover, soil: Shared['soilInitial'], current: number): number {
  const b = sc.creek?.basin;
  if (!b || !sc.creek) return current;
  const r = basinHydrograph(hyetograph(rain), b, cover, soil, sc.creek.baseM3s, 0);
  return Math.max(current, Math.min(240, Math.max(110, Math.ceil((r.tPeak / 60 + 30) / 10) * 10)));
}

/** Selector del origen de la creciente: hidrograma de ejemplo o lluvia en la cuenca. */
export function CreekSource({ ctrl, sc }: { ctrl: CityController; sc: Scenario }) {
  if (!sc.creek?.basin) return null;
  const cf = ctrl.shared.creek ?? null;
  const src = cf?.source === 'cuenca' ? 'cuenca' : 'ejemplo';
  return (
    <Segmented<'ejemplo' | 'cuenca'>
      label="Origen de la creciente"
      value={src}
      options={[
        { value: 'ejemplo', label: 'Creciente de ejemplo' },
        { value: 'cuenca', label: 'Lluvia en la cuenca' },
      ]}
      onChange={(v) => {
        if (v === 'cuenca') {
          const rain = ctrl.shared.rain.durationMin >= 45 ? ctrl.shared.rain : { ...ctrl.shared.rain, intensityMmH: 80, durationMin: 60, pattern: 'constante' as const };
          const simMinutes = basinMinutes(sc, rain, ctrl.ivB.basinCover ?? 'mixta', ctrl.shared.soilInitial, ctrl.shared.simMinutes);
          ctrl.update({ shared: { rain, creek: { source: 'cuenca', peakM3s: 0, timeToPeakMin: 6, startMin: 0, sedimentCv: cf?.sedimentCv ?? 0 }, simMinutes } });
        } else ctrl.update({ shared: { creek: null } });
      }}
      help={src === 'cuenca' ? 'La creciente sale de la misma lluvia del barrio cayendo en toda la cuenca, aguas arriba.' : 'Una creciente de ejemplo con el tamaño que elijas, sin relación con la lluvia.'}
    />
  );
}

/** Cuenca: cobertura, aguacero y creciente calculada. */
export function BasinSection({ ctrl, sc, sim }: { ctrl: CityController; sc: Scenario; sim: CitySim | null }) {
  const b = sc.creek?.basin;
  const res = useBasin(ctrl, sim);
  const cap = sim?.c.creek?.capacity ?? 0;
  if (!b || !res) return null;
  const cover = ctrl.ivB.basinCover ?? 'mixta';
  const rain = ctrl.shared.rain;
  const pct = res.rainMm > 0 ? (res.runoffMm / res.rainMm) * 100 : 0;
  return (
    <section className="basin-box" aria-label="Lluvia en la cuenca">
      <p className="city-small">
        Aguas arriba del barrio, la quebrada recoge la lluvia de una cuenca de <strong>{fmtNum(b.areaKm2, b.areaKm2 < 1 ? 2 : b.areaKm2 < 10 ? 1 : 0)} km²</strong> ({fmtNum(b.lengthM / 1000, 1)} km de largo, pendiente media de {fmtNum(b.slopePct, 0)} %). Una parte de la lluvia entra al suelo; el resto corre hasta la quebrada y llega al barrio un tiempo después.
      </p>
      <Segmented<BasinCover>
        label="Cómo está la cuenca"
        value={cover}
        options={BASIN_COVER_LIST.map((v) => ({ value: v, label: BASIN_COVERS[v].name }))}
        onChange={(v) => ctrl.update({ B: { ...ctrl.ivB, basinCover: v }, shared: { simMinutes: basinMinutes(sc, rain, v, ctrl.shared.soilInitial, ctrl.shared.simMinutes) } })}
        help={`${BASIN_COVERS[cover].name}: ${BASIN_COVERS[cover].note}. Número de curva ${fmtNum(res.cn, 0)}${ctrl.shared.soilInitial === 'humedo' ? ' (suelo ya húmedo)' : ''}.`}
      />
      <div className="preset-grid" role="group" aria-label="Aguaceros de una hora">
        {STORMS.map((s) => {
          const on = rain.intensityMmH === s.mmh && rain.durationMin === 60 && rain.pattern === 'constante' && rain.spatial === 'uniforme';
          return (
            <button key={s.mmh} type="button" className={`preset tone-${s.mmh >= 100 ? 'danger' : s.mmh >= 80 ? 'warn' : 'ok'}${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => {
              const r2 = { ...rain, intensityMmH: s.mmh, durationMin: 60, pattern: 'constante' as const, spatial: 'uniforme' as const };
              ctrl.update({ shared: { rain: r2, simMinutes: basinMinutes(sc, r2, cover, ctrl.shared.soilInitial, ctrl.shared.simMinutes) } });
            }}>
              <strong>{s.label}</strong>
              <span>{s.sub}</span>
            </button>
          );
        })}
      </div>
      <dl className="basin-facts">
        <div><dt>Lluvia en la cuenca</dt><dd>{fmtNum(res.rainMm, 0)} mm</dd></div>
        <div><dt>Corre hacia la quebrada</dt><dd>{fmtNum(res.runoffMm, 1)} mm ({fmtNum(pct, 0)} %)</dd></div>
        <div><dt>Retardo de la cuenca</dt><dd>{fmtNum(res.lagMin, 0)} min</dd></div>
        <div><dt>Pico en el barrio</dt><dd>{m3s(res.peak)}{cap > 0 ? ` (${fmtNum((res.peak / cap) * 100, 0)} % del cauce)` : ''}, minuto {fmtNum(res.tPeak / 60, 0)}</dd></div>
      </dl>
      <p className="city-small">
        Métodos del NRCS de EE. UU.: número de curva para la escorrentía, ecuación del retardo e hidrograma unitario triangular.{' '}
        {sc.provenance.kind === 'datos-reales'
          ? 'El área, la longitud y la pendiente de la cuenca salen del modelo de elevación (delineación automática); la cobertura, el suelo y la lluvia pareja en toda la cuenca son supuestos. El resultado no es un pronóstico.'
          : 'La cuenca es didáctica: no es la de una quebrada real de Medellín, y el resultado no es un pronóstico.'}
      </p>
    </section>
  );
}

/** Aviso temprano: estación de nivel aguas arriba, pluviómetro y tiempo de aviso calculado. */
export function WarningSection({ ctrl, sc, sim }: { ctrl: CityController; sc: Scenario; sim: CitySim }) {
  const id = useId();
  const b = sc.creek?.basin;
  const cr = sim.c.creek;
  const hg = sim.creekHydro;
  const travel = b ? b.gauge.distanceM / b.gauge.celerityMs : 0;
  const events: WarningEvent[] = useMemo(() => (hg && cr ? warningEvents(sim.hyeto, (t) => hydroAt(hg, t), travel, cr.capacity, sim.endT) : []), [sim, hg, cr, travel]);
  const nSamples = sim.samples.length;
  const wet = useMemo(() => {
    let tMin = -1, who = -1;
    sim.firstWet.forEach((t, k) => {
      if (t >= 0 && (tMin < 0 || t < tMin)) {
        tMin = t;
        who = k;
      }
    });
    return { t: tMin, name: who >= 0 ? buildingName(sim.c.buildings[who].id) : '' };
    // se recalcula con las muestras (cada 10 s simulados)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, nSamples]);
  const series: Series[] = useMemo(() => {
    if (!hg) return [];
    const pts = (f: (t: number) => number): [number, number][] => {
      const out: [number, number][] = [];
      for (let t = 0; t <= sim.endT + 1e-9; t += 60) out.push([t / 60, f(t)]);
      return out;
    };
    return [
      { id: 'Estacion', label: 'Estación', name: `Caudal en la estación (${fmtNum((b?.gauge.distanceM ?? 0) / 1000, 1)} km arriba)`, color: '#7a4fb4', dash: true, points: pts((t) => hydroAt(hg, t + travel)) },
      { id: 'Barrio', label: 'Barrio', name: 'Caudal que llega al barrio', color: '#2a78d6', points: pts((t) => hydroAt(hg, t)) },
    ];
  }, [hg, sim.endT, travel, b]);
  if (!b || !cr || !hg) return null;
  const nowQ = hydroAt(hg, sim.t + travel);
  const level = [...WARNING.levels].reverse().find((lv) => nowQ >= lv.frac * cr.capacity);
  const roja = events.find((e) => e.id === 'roja')!;
  const firstAlert = events.filter((e) => e.t >= 0).sort((x, y) => x.t - y.t)[0];
  const finished = sim.t >= sim.endT - 1e-6;
  const lead = (e: WarningEvent) => (e.t >= 0 && wet.t >= 0 ? wet.t - e.t : null);
  const items: { key: string; t: number; color?: string; name: string; text: string; future: boolean }[] = [
    ...events.filter((e) => e.t >= 0).map((e) => ({ key: e.id, t: e.t, color: e.color, name: e.name, text: e.text, future: e.t > sim.t })),
    ...(wet.t >= 0 ? [{ key: 'casa', t: wet.t, color: '#3b2a1b', name: 'El agua llega a una casa junto a la quebrada', text: `${wet.name}: 10 cm o más contra sus muros`, future: false }] : []),
  ].sort((x, y) => x.t - y.t);
  return (
    <section className="warn-box" aria-labelledby={`${id}-h`}>
      <h4 id={`${id}-h`}>Aviso temprano</h4>
      <p className="city-small">
        La {b.gauge.name.toLowerCase()} está a {fmtNum(b.gauge.distanceM / 1000, 1)} km por el cauce: la creciente pasa por ella unos <strong>{fmtNum(travel / 60, 0)} minutos</strong> antes de llegar al barrio. Hay tres alertas según el caudal en la estación (40 %, 70 % y 100 % de lo que cabe en el cauce del barrio) y un aviso por lluvia ({WARNING.rain30Mm} mm en 30 minutos). Los umbrales son didácticos.
      </p>
      <p className={`warn-now${level ? ` is-${level.id}` : ''}`} role="status">
        <span className="warn-dot" style={{ background: level?.color ?? '#7bb662' }} aria-hidden="true" />
        <span>
          Ahora en la estación: <strong>{m3s(nowQ)}</strong> · {level ? `${level.name}: ${level.text}` : 'sin alerta'}
        </span>
      </p>
      <ol className="warn-timeline" aria-label="Línea de tiempo del aviso">
        {items.map((it) => (
          <li key={it.key} className={it.future ? 'is-future' : ''}>
            <span className="warn-dot" style={{ background: it.color }} aria-hidden="true" />
            <span className="warn-t">min {fmtNum(it.t / 60, 0)}</span>
            <span><strong>{it.name}</strong> · {it.text}{it.future ? ' (todavía no)' : ''}</span>
          </li>
        ))}
        {!items.length && <li>Con esta lluvia no se activa ningún aviso.</li>}
      </ol>
      <p className="warn-result">
        {wet.t >= 0
          ? roja.t >= 0
            ? (lead(roja) ?? 0) >= 0
              ? <>Entre la alerta roja y el agua en la primera casa junto a la quebrada hubo <strong>{minTxt(lead(roja)!)}</strong> para avisar y salir{firstAlert && firstAlert.id !== 'roja' && (lead(firstAlert) ?? 0) > 0 ? <>; desde el primer aviso ({firstAlert.name.toLowerCase()}), {minTxt(lead(firstAlert)!)}</> : null}.</>
              : <>La alerta roja llegó <strong>{minTxt(-(lead(roja) ?? 0))} después</strong> de que el agua llegara a la primera casa junto a la quebrada: el aviso por nivel llegó tarde.</>
            : <>El agua llegó a una casa junto a la quebrada sin que la estación diera alerta roja{firstAlert ? <>; el primer aviso ({firstAlert.name.toLowerCase()}) fue {minTxt(lead(firstAlert) ?? 0)} antes</> : null}.</>
          : finished
            ? <>No llegó agua a las casas junto a la quebrada.{roja.t >= 0 ? ' Hubo alerta roja: la creciente llenó el cauce, pero el agua no alcanzó las casas.' : firstAlert ? ' Los avisos que se activaron no terminaron en inundación: en un sistema real se vigila y se ajustan los umbrales.' : ''}</>
            : <>El tiempo de aviso aparece cuando el agua llegue a una casa a {fmtNum(WARNING.nearCreekM, 0)} m o menos del cauce (si llega); las demás se pueden mojar por la lluvia del barrio sin que crezca la quebrada.</>}
      </p>
      <LineChart title="Caudal en la estación y en el barrio" series={series} fmtY={(v) => `${fmtNum(v, 0)} m³/s`} yUnit="metros cúbicos por segundo" refY={{ y: cr.capacity, label: `cauce lleno: ${fmtNum(cr.capacity, 0)} m³/s` }} height={170} xMax={ctrl.shared.simMinutes} nowX={sim.t / 60} marker={wet.t >= 0 ? { x: wet.t / 60, label: 'agua en una casa de la orilla' } : roja.t >= 0 ? { x: roja.t / 60, label: 'alerta roja' } : undefined} />
      <p className="city-small">En Medellín y el Valle de Aburrá funciona un sistema de alerta temprana real, con sus propias estaciones y umbrales; este ejercicio no usa sus datos.</p>
    </section>
  );
}

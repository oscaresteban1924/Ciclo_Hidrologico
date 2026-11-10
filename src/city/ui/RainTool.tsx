// Herramienta «Crear lluvia»: lluvia inventada (constante o con pico, hasta 6 h), tormenta de diseño de Medellín
// con la curva IDF del IDEAM (Olaya Herrera) o un aguacero reconstruido, más el clima (nivel de calentamiento
// global). Muestra el hietograma que recibirá el cálculo y, para docentes, la curva IDF.

import { DURATION_RANGE, RAIN_RANGE, SIM_MAX_MIN } from '../sim/constants';
import { hyetograph, rainDepthMm, rainPeakMmH } from '../sim/engine';
import type { RainConfig, RainPattern, Scenario } from '../sim/scenario';
import { CC_RATE, DESIGN_DURATIONS, DESIGN_RETURNS, IDF_OLAYA, STORM_EVENTS, WARMING_LEVELS, WARMING_NOW, climateFactor, eventById, idfDepth, idfIntensity } from '../sim/storms';
import type { CityController } from '../controller';
import { fmtNum } from '../render/palette';
import { Disclosure, Segmented } from '../../components/ui';
import { LineChart, type Series } from './Chart';
import { Range } from './Range';
import { basinMinutes } from './BasinPanel';

type Kind = 'inventada' | 'diseno' | 'evento';
const kindOf = (p: RainPattern): Kind => (p === 'diseno' ? 'diseno' : p === 'evento' ? 'evento' : 'inventada');

const durLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${fmtNum(m / 60, 1)} h` : `${m / 60} h`);
const RAIN_COLOR = '#2f78c4';

/** Descripción corta de la lluvia, para los resúmenes. */
export function describeRain(r: RainConfig): string {
  const clima = r.warmingC && r.warmingC > WARMING_NOW ? ` con un calentamiento global de ${fmtNum(r.warmingC, r.warmingC % 1 ? 1 : 0)} °C` : '';
  if (r.pattern === 'diseno') return `tormenta de diseño de ${r.returnYears} años y ${durLabel(r.durationMin)} (curva IDF de Olaya Herrera, ${fmtNum(rainDepthMm(r), 0)} mm)${clima}`;
  if (r.pattern === 'evento') return `${eventById(r.eventId)?.name.toLowerCase() ?? 'aguacero reconstruido'} (${fmtNum(rainDepthMm(r), 0)} mm en ${r.durationMin} min)${clima}`;
  return `${fmtNum(r.intensityMmH * climateFactor(r.warmingC), 0)} mm/h durante ${durLabel(r.durationMin)}${r.pattern === 'pico' ? ', con pico' : ''}${clima}`;
}

/** Intensidad media [mm/h] que se guarda en la configuración (para mostrar y comparar). */
function withMean(r: RainConfig): RainConfig {
  if (r.pattern === 'constante' || r.pattern === 'pico') return r;
  const depth = rainDepthMm({ ...r, warmingC: undefined });
  return { ...r, intensityMmH: Math.round((depth / (r.durationMin / 60)) * 10) / 10 };
}

export function RainTool({ ctrl, sc }: { ctrl: CityController; sc: Scenario }) {
  const r = ctrl.shared.rain;
  const kind = kindOf(r.pattern);
  const depth = rainDepthMm(r);
  const peak = rainPeakMmH(r);
  const area = sc.extent.width * sc.extent.height;
  const vol = (depth / 1000) * (r.spatial === 'uniforme' ? area : Math.min(area, Math.PI * r.radiusM * r.radiusM));
  const k = climateFactor(r.warmingC);
  const set = (patch: Partial<RainConfig>) => {
    const rain = withMean({ ...r, ...patch });
    const tail = rain.durationMin >= 120 ? 30 : 10;
    // si cambian el tipo o la duración, el tiempo simulado se ajusta a la nueva lluvia; si no, solo crece
    const fresh = rain.pattern !== r.pattern || rain.durationMin !== r.durationMin || rain.eventId !== r.eventId;
    let sim = Math.min(SIM_MAX_MIN, fresh ? rain.durationMin + tail : Math.max(ctrl.shared.simMinutes, rain.durationMin + tail));
    // con la creciente calculada desde la cuenca, el tiempo debe alcanzar para que pase el pico
    if (ctrl.shared.creek?.source === 'cuenca') sim = Math.min(SIM_MAX_MIN, basinMinutes(sc, rain, ctrl.ivB.basinCover ?? 'mixta', ctrl.shared.soilInitial, sim));
    ctrl.update({ shared: { rain, simMinutes: Math.max(10, sim) } });
  };
  const setKind = (kd: Kind) => {
    if (kd === kind) return;
    if (kd === 'inventada') set({ pattern: 'constante', intensityMmH: 60, durationMin: Math.min(60, r.durationMin), returnYears: undefined, eventId: undefined });
    else if (kd === 'diseno') set({ pattern: 'diseno', returnYears: r.returnYears ?? 10, durationMin: (DESIGN_DURATIONS as readonly number[]).includes(r.durationMin) ? r.durationMin : 60, eventId: undefined });
    else {
      const ev = STORM_EVENTS[0];
      set({ pattern: 'evento', eventId: ev.id, durationMin: ev.durationMin, returnYears: undefined });
    }
  };
  const ev = kind === 'evento' ? eventById(r.eventId) : undefined;
  const h = hyetograph(r);
  const steps: [number, number][] = [];
  h.mmh.forEach((v, i) => {
    steps.push([h.times[i] / 60, v], [h.times[i + 1] / 60, v]);
  });
  const long = r.durationMin > 120 && ctrl.shared.dx < 2 && sc.resolutions.includes(2);

  return (
    <section className="tool-body" aria-label="Crear lluvia">
      <h3>Crear lluvia</h3>
      <Segmented<Kind>
        label="¿Qué lluvia?"
        value={kind}
        options={[
          { value: 'inventada', label: 'Inventada' },
          { value: 'diseno', label: 'De diseño' },
          { value: 'evento', label: 'Aguacero real' },
        ]}
        onChange={setKind}
      />

      {kind === 'inventada' && (
        <>
          <div className="chip-row" role="group" aria-label="Lluvias de ejemplo">
            {[
              ['Llovizna', 5],
              ['Moderada', 20],
              ['Fuerte', 60],
              ['Muy fuerte', 100],
            ].map(([l, v]) => (
              <button key={l} type="button" className={`chip${r.intensityMmH === v ? ' is-on' : ''}`} aria-pressed={r.intensityMmH === v} onClick={() => set({ intensityMmH: v as number })}>
                {l} · {v} mm/h
              </button>
            ))}
          </div>
          <Range label="Intensidad" value={r.intensityMmH} min={RAIN_RANGE.min} max={RAIN_RANGE.max} step={RAIN_RANGE.step} unit="mm/h" onChange={(v) => set({ intensityMmH: v })} />
          <Range label="Duración" value={r.durationMin} min={DURATION_RANGE.min} max={DURATION_RANGE.max} step={DURATION_RANGE.step} unit="min" onChange={(v) => set({ durationMin: v })} help={r.durationMin > 60 ? `${durLabel(r.durationMin)} de lluvia: el suelo se va llenando y cada vez escurre más.` : undefined} />
          <Segmented label="Forma de la lluvia" value={r.pattern === 'pico' ? 'pico' : 'constante'} options={[{ value: 'constante', label: 'Constante' }, { value: 'pico', label: 'Con pico' }]} onChange={(v) => set({ pattern: v })} help={r.pattern === 'pico' ? 'Mismo total de agua, pero con un máximo de hasta el doble de la intensidad media al primer tercio.' : undefined} />
        </>
      )}

      {kind === 'diseno' && (
        <>
          <p className="city-small">
            Lluvias con la curva IDF del IDEAM para el aeropuerto Olaya Herrera (Medellín, 1971–2010). Es la lluvia con que se diseñan obras: el periodo de retorno dice cada cuánto llega, en promedio, una lluvia así o mayor.
          </p>
          <div className="chip-row" role="radiogroup" aria-label="Periodo de retorno">
            {DESIGN_RETURNS.map((T) => (
              <button key={T} type="button" role="radio" className={`chip${r.returnYears === T ? ' is-on' : ''}`} aria-checked={r.returnYears === T} onClick={() => set({ returnYears: T })}>
                {T} años
              </button>
            ))}
          </div>
          <div className="chip-row" role="radiogroup" aria-label="Duración de la tormenta">
            {DESIGN_DURATIONS.map((D) => (
              <button key={D} type="button" role="radio" className={`chip${r.durationMin === D ? ' is-on' : ''}`} aria-checked={r.durationMin === D} onClick={() => set({ durationMin: D })}>
                {durLabel(D)}
              </button>
            ))}
          </div>
          <p className="city-fact">
            Lluvia de <strong>{r.returnYears} años</strong>: en un año cualquiera hay una probabilidad de 1 en {r.returnYears} ({fmtNum(100 / (r.returnYears ?? 10), 0)} %) de que llegue una igual o mayor. Los bloques más fuertes van en el centro (método de los bloques alternos).
          </p>
        </>
      )}

      {kind === 'evento' && ev && (
        <div className="city-event">
          <strong>{ev.name}</strong>
          <p>
            {fmtNum(ev.totalMm, 0)} mm en {ev.durationMin} minutos en la {ev.place}, con un pico de {fmtNum(ev.peakMmH, 0)} mm/h. Es más agua que la lluvia de 100 años de la curva de Olaya Herrera para la misma duración ({fmtNum(idfDepth(100, ev.durationMin), 0)} mm), aunque esa estación está en otro lugar del valle.
          </p>
          <p className="city-small">
            {ev.note} Fuente: {ev.source}
          </p>
        </div>
      )}

      <div className="chip-row" role="radiogroup" aria-label="Clima: calentamiento global">
        {WARMING_LEVELS.map((w) => {
          const on = (r.warmingC ?? WARMING_NOW) === w;
          return (
            <button key={w} type="button" role="radio" className={`chip${on ? ' is-on' : ''}`} aria-checked={on} onClick={() => set({ warmingC: w === WARMING_NOW ? undefined : w })}>
              {w === WARMING_NOW ? 'Clima de hoy' : `+${fmtNum(w, w % 1 ? 1 : 0)} °C`}
            </button>
          );
        })}
      </div>
      <p className="city-small">
        Calentamiento global sobre la época preindustrial (hoy, cerca de {fmtNum(WARMING_NOW, 1)} °C). Por cada grado más, los aguaceros extremos llegan cerca de {Math.round(CC_RATE * 100)} % más fuertes (IPCC, 2021).{k > 1 ? ` Con este clima, la lluvia se multiplica por ${fmtNum(k, 2)}.` : ''} Es una aproximación global: en aguaceros cortos el aumento puede ser mayor.
      </p>

      <LineChart title="La lluvia que recibirá el cálculo" series={[{ id: 'lluvia', name: 'Lluvia', color: RAIN_COLOR, points: steps, fill: true }] as Series[]} fmtY={(v) => `${fmtNum(v, 0)} mm/h`} yUnit="milímetros por hora" height={130} />
      <p className="city-fact">
        Caerán <strong>{fmtNum(depth, 1)} mm</strong> en {durLabel(r.durationMin)}, con un máximo de <strong>{fmtNum(peak, 0)} mm/h</strong>: unos <strong>{fmtNum(vol, 0)} m³</strong> en {r.spatial === 'uniforme' ? 'todo el sector' : 'la zona del aguacero'}.
      </p>
      {long && (
        <p className="city-note">
          Lluvia larga con celdas de 1 m: el cálculo tarda bastante.{' '}
          <button type="button" className="link" onClick={() => ctrl.update({ shared: { dx: 2 } })}>
            Usar celdas de 2 m
          </button>{' '}
          (unas ocho veces más rápido) o subir la velocidad.
        </p>
      )}
      <Range label="Tiempo simulado" value={ctrl.shared.simMinutes} min={Math.max(10, r.durationMin)} max={SIM_MAX_MIN} step={5} unit="min" onChange={(v) => ctrl.update({ shared: { simMinutes: v } })} help="Incluye el tiempo después de la lluvia, mientras el agua termina de escurrir." />
      <Segmented label="Dónde llueve" value={r.spatial} options={[{ value: 'uniforme', label: 'En todo el sector' }, { value: 'localizada', label: 'En un lugar' }]} onChange={(v) => set({ spatial: v })} />
      {r.spatial === 'localizada' && (
        <>
          <p className="city-small">Toca la maqueta para elegir el centro del aguacero.</p>
          <Range label="Radio" value={r.radiusM} min={10} max={60} step={5} unit="m" onChange={(v) => set({ radiusM: v })} />
        </>
      )}
      <Segmented label="Suelo al empezar" value={ctrl.shared.soilInitial} options={[{ value: 'seco', label: 'Seco' }, { value: 'humedo', label: 'Húmedo' }]} onChange={(v) => ctrl.update({ shared: { soilInitial: v } })} help="Un suelo húmedo ya tiene ocupada parte de su capacidad de guardar agua." />
      {sc.inflows.length > 0 && <Range label={sc.inflows[0].name} value={ctrl.shared.inflowLps} min={0} max={200} step={10} unit="L/s" onChange={(v) => ctrl.update({ shared: { inflowLps: v } })} help="Entrada externa al sector; se cuenta aparte en el balance." />}
      <Disclosure title="La curva IDF de Medellín (para docentes)">
        <IdfChart />
        <p className="city-small">
          {IDF_OLAYA.source} Ecuación I = C1/(D + X0)<sup>C2</sup> hasta 1 h; de 1 a 6 h se sigue la forma de la tabla de la ficha, porque la ecuación deja de crecer en lámina para duraciones largas. La lluvia inventada usa rangos didácticos ({RAIN_RANGE.min}–{RAIN_RANGE.max} mm/h; {DURATION_RANGE.min}–{DURATION_RANGE.max} min).
        </p>
      </Disclosure>
    </section>
  );
}

/** Curvas IDF de Olaya Herrera para 2, 10 y 100 años (intensidad media contra duración). */
function IdfChart() {
  const Ts = [2, 10, 100];
  const colors = ['#5b8db8', '#2f78c4', '#173f73'];
  const series: Series[] = Ts.map((T, i) => ({
    id: `${T} años`,
    name: `${T} años`,
    label: `${T} a`,
    color: colors[i],
    points: [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360].map((D) => [D, idfIntensity(T, D)] as [number, number]),
  }));
  return <LineChart title="Intensidad media según la duración" series={series} fmtY={(v) => `${fmtNum(v, 0)} mm/h`} yUnit="milímetros por hora; eje horizontal: duración en minutos" height={150} />;
}

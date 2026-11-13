// «Crecientes, lluvia y bordes»: de una serie de máximos anuales a la creciente de diseño (Gumbel), el riesgo de
// verla en la vida útil, el hidrograma que entra por la línea de borde de aguas arriba y la profundidad normal de la
// salida; y la lluvia que cae sobre el valle (lluvia sobre la malla con las pérdidas del número de curva), que
// encharca el barrio detrás del jarillón. La pregunta: ¿qué inunda la creciente de T años, o el aguacero?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { GumbelChart, HydroChart, RainChart } from './charts';
import { MODEL2D_TOOLS, ROOM } from './design';
import { DEFAULT_RETURN, LIDAR_BURNED, SCEN_NAMES, returnRun, returnScene, type ReturnScene, type Summary } from './scene';
import { AMS, AMS_FIT, PERIODS, gumbelK, hydroVolume, plotting, quantile, risk } from './hydrology';
import { COVER_KEYS, COVERS, terrainFor } from './terrain';
import { CN_SOURCE, CN_TABLE, hyetograph, scsQ, scsS, type Soil } from './solver';
import { cachedSummary, useModelRun, useReference } from './runs';
import { PLACE, RunBadge, VIEWS_BASE, VexChoice, sg, useBatch, valleyState, vexNote, waterOf } from './common';
import { ValleyWorld } from './three/valleyWorld';

interface Ctx {
  s: ReturnScene;
  sum: Summary | null;
  prev: Summary | null;
  flat: Summary | null;
  risk: number;
}

const prevT = (T: number) => PERIODS[Math.max(0, PERIODS.indexOf(T) - 1)];

const RETOS: Reto<Ctx>[] = [
  {
    id: 'm2-riesgo',
    title: 'Una obra para 50 años',
    goal: 'Con una vida útil de 50 años o más, elige el periodo de retorno con el que la probabilidad de ver la creciente de diseño queda por debajo de 40 %.',
    hint: 'R = 1 − (1 − 1/T)^n: para 50 años, ni siquiera la de 100 años es «segura».',
    check: (c) => c.s.life >= 50 && c.risk < 0.4,
    progress: (c) => `T = ${c.s.T} años en ${c.s.life} años: ${es(c.risk * 100, 1)} %`,
  },
  {
    id: 'm2-umbral',
    title: 'El primer periodo que inunda el barrio',
    goal: 'Encuentra el menor periodo de retorno de la lista con el que el agua pasa sobre el jarillón (más de 400 m² del barrio con agua), habiendo corrido también el anterior.',
    hint: 'Ve subiendo el periodo de uno en uno: el reto compara con la corrida del periodo anterior.',
    check: (c) => !!c.sum && !!c.prev && c.s.T !== PERIODS[0] && c.sum.overtop && !c.prev.overtop,
    progress: (c) => (c.sum ? `T = ${c.s.T}: ${es(c.sum.townArea, 0)} m²; T = ${prevT(c.s.T)}: ${c.prev ? `${es(c.prev.townArea, 0)} m²` : 'sin correr'}` : 'esperando el cálculo'),
  },
  {
    id: 'm2-borde',
    title: 'El borde lejos de lo que importa',
    goal: 'Cambia la pendiente de la profundidad normal a la salida hasta mover el nivel junto al borde 40 cm o más, y mira que en el puente (200 m aguas arriba) cambia mucho menos.',
    hint: 'La condición de borde fija el nivel en el borde; su efecto se apaga aguas arriba. Por eso los bordes se ponen lejos de la zona de interés.',
    check: (c) => !!c.sum && !!c.flat && Math.abs(c.sum.outletWse - c.flat.outletWse) >= 0.4 && Math.abs(c.sum.wseBridge - c.flat.wseBridge) < 0.5 * Math.abs(c.sum.outletWse - c.flat.outletWse),
    progress: (c) => (c.sum && c.flat ? `salida ${sg(c.sum.outletWse - c.flat.outletWse)}, puente ${sg(c.sum.wseBridge - c.flat.wseBridge)}` : 'esperando el cálculo'),
  },
  {
    id: 'm2-atenuacion',
    title: 'El valle guarda agua',
    goal: 'Encuentra una creciente cuyo pico se atenúe 14 % o más entre la entrada y la salida del modelo.',
    hint: 'Una creciente corta y grande llena las llanuras y el barrio, que la devuelven más tarde.',
    check: (c) => !!c.sum && c.sum.ok && c.sum.attenuation >= 0.14,
    progress: (c) => (c.sum ? `atenuación del pico ${es(c.sum.attenuation * 100, 1)} %` : 'esperando el cálculo'),
  },
  {
    id: 'm2-encharca',
    title: 'El agua que no viene del río',
    goal: 'Con «Lluvia sobre el valle» (el río sin creciente), encuentra un aguacero que deje más de 2000 m² del barrio con agua.',
    hint: 'El jarillón detiene la quebrada pero también encierra el barrio: la lluvia que cae detrás no tiene por dónde salir. Suelos poco permeables (C o D) escurren más.',
    check: (c) => c.s.scen === 'lluvia' && !!c.sum && c.sum.ok && c.sum.townArea > 2000,
    progress: (c) => (c.s.scen !== 'lluvia' ? 'elige el escenario «Lluvia sobre el valle»' : c.sum ? `barrio con agua: ${es(c.sum.townArea, 0)} m²` : 'esperando el cálculo'),
  },
];

export function RetornoLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<ReturnScene>(DEFAULT_RETURN);
  const [vex, setVex] = useState(3);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const r = useMemo(() => returnScene(s), [s]);
  const opts = useMemo(() => returnRun(s), [s]);
  const run = useModelRun(opts);
  const flat = useReference(returnRun({ ...s, outSlope: DEFAULT_RETURN.outSlope, egSlope: DEFAULT_RETURN.egSlope }));
  const prev = run.sum ? cachedSummary(returnRun({ ...s, T: prevT(s.T) })) : null;
  const fine = useMemo(() => terrainFor(LIDAR_BURNED).fine, []);
  const sum = run.sum;
  const world = useRef<ValleyWorld | null>(null);
  const sync = useRef({ s, run, vex, sum, r });
  sync.current = { s, run, vex, sum, r };
  const toWorld = () => {
    const { s: x, run: rr, vex: v, sum: sm, r: rs } = sync.current;
    world.current?.set(
      valleyState({
        vex: v,
        fine,
        colorBy: 'natural',
        objects: 'si',
        bc: true,
        rain: x.scen !== 'creciente',
        water: waterOf(rr),
        labels: [
          PLACE.entrada('Entrada: hidrograma de caudal', x.scen === 'lluvia' ? `caudal base de 4 m³/s` : `pico de ${es(rs.Q, 1)} m³/s (T = ${x.T} años)`),
          PLACE.salida('Salida: profundidad normal', `pendiente de fricción ${es(x.outSlope * 100, 2)} %`),
          ...(sm ? [PLACE.barrio(sm.overtop ? 'El agua pasa el jarillón' : 'El barrio queda seco', sm.overtop ? `${es(sm.townArea, 0)} m² con agua` : undefined, sm.overtop ? 'alerta' : 'ok'), PLACE.puente(`Puente: ${es(sm.wseBridge, 2)} m`, undefined, 'dato')] : []),
        ],
      }),
    );
  };
  useEffect(() => {
    toWorld();
  }, [run.res, run.status, run.live, vex, sum, r]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, sum, prev, flat, risk: r.risk }), [s, sum, prev, flat, r.risk]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<ReturnScene>) => setS((x) => ({ ...x, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = !sum ? 'mid' : !sum.overtop ? 'ok' : sum.townArea < 15000 ? 'mid' : 'bad';
  const h = useMemo(() => hyetograph(s.P, s.D), [s.P, s.D]);
  const rainy = s.scen !== 'creciente';
  const vol = run.res?.vol;
  const exMm = run.res && run.res.series.excess.length ? run.res.series.excess[run.res.series.excess.length - 1] : NaN;
  const answer = s.scen === 'lluvia' ? (
    <>
      Un aguacero de <strong>{es(s.P, 0)} mm en {s.D} min</strong> sobre suelos del grupo {s.soil}: {Number.isFinite(exMm) ? `escurren ${es(exMm, 0)} mm en promedio y el resto se infiltra o se queda en el suelo.` : 'calculando cuánto escurre…'}{' '}
      {sum ? (sum.townArea > 400 ? `El barrio se encharca: ${es(sum.townArea, 0)} m² con más de 10 cm, aunque el río no se desborda; el jarillón no deja salir el agua.` : 'El barrio drena sin encharcarse.') : ''}
    </>
  ) : (
    <>
      La creciente de {s.T} años trae <strong>{es(r.Q, 1)} m³/s</strong>; la probabilidad de que se presente al menos una vez en {s.life} años es {es(r.risk * 100, 1)} %.{' '}
      {sum ? (sum.overtop ? `El agua pasa sobre el jarillón y deja ${es(sum.townArea, 0)} m² del barrio con agua.` : 'El jarillón la contiene: el barrio queda seco.') : 'El modelo 2D la está corriendo…'}
      {sum ? ` El pico se atenúa ${es(sum.attenuation * 100, 0)} % al cruzar el valle.` : ''}
      {rainy && Number.isFinite(exMm) ? ` Además llueven ${es(s.P, 0)} mm, de los que escurren ${es(exMm, 0)} mm.` : ''}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label={`Maqueta 3D del valle con las líneas de borde del modelo (azul la entrada, naranja la salida)${rainy ? ', la lluvia cayendo sobre la malla' : ''} y el agua máxima ${s.scen === 'lluvia' ? 'del aguacero' : `de la creciente de ${s.T} años`} coloreada por profundidad; ${vexNote(vex)}.`}
          viewNames={[...VIEWS_BASE, { id: 'entrada', label: 'La entrada' }]}
          make={(st) => new ValleyWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <GumbelChart Q={AMS.map((a) => a.Q)} fit={AMS_FIT} T={s.T} W={520} H={240} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q={s.scen === 'lluvia' ? '¿Qué encharca el aguacero?' : `¿Qué inunda la creciente de ${s.T} años${s.scen === 'ambas' ? ' con el aguacero' : ''}?`} answer={answer} tone={tone} />
      <RunBadge r={run} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      {rainy ? (
        <LiveHud
          head={[`${es(s.P, 0)} mm en ${s.D} min`, `suelo ${s.soil}`, sum ? `barrio ${es(sum.townArea, 0)} m²` : 'calculando']}
          chart={<RainChart blocks={h.blocks} t={run.res?.series.t} excess={run.res?.series.excess} />}
          traces={[
            { key: 'p', label: 'Lluvia sobre el valle', unit: 'mil m³', value: vol ? (vol.rain + vol.infil) / 1000 : NaN, digits: 1 },
            { key: 'e', label: 'Escorrentía que entra al modelo', unit: 'mil m³', value: vol ? vol.rain / 1000 : NaN, digits: 1 },
            { key: 'a', label: 'Barrio con agua', unit: 'm²', value: sum?.townArea ?? NaN, digits: 0 },
          ]}
        />
      ) : (
        <LiveHud
          head={[`T = ${s.T} años`, `Q = ${es(r.Q, 1)} m³/s`, `riesgo ${es(r.risk * 100, 0)} % en ${s.life} años`]}
          chart={<GumbelChart Q={AMS.map((a) => a.Q)} fit={AMS_FIT} T={s.T} />}
          traces={[
            { key: 'q', label: 'Caudal de diseño', unit: 'm³/s', value: r.Q, digits: 1 },
            { key: 'r', label: `Riesgo en ${s.life} años`, unit: '%', value: r.risk * 100, digits: 1 },
            { key: 'a', label: 'Barrio con agua', unit: 'm²', value: sum?.townArea ?? NaN, digits: 0 },
          ]}
        />
      )}
      <DockChoice label="Escenario" value={s.scen} options={(Object.keys(SCEN_NAMES) as ReturnScene['scen'][]).map((k) => ({ value: k, label: SCEN_NAMES[k] }))} onChange={(v) => set({ scen: v as ReturnScene['scen'] })} />
      {s.scen !== 'lluvia' && <DockChoice label="Periodo de retorno" value={String(s.T)} options={PERIODS.map((T) => ({ value: String(T), label: `${T} años` }))} onChange={(v) => set({ T: Number(v) })} />}
      {rainy && (
        <>
          <DockRange label="Lluvia total" value={s.P} min={20} max={160} step={10} show={`${s.P} mm`} onChange={(v) => set({ P: v })} />
          <DockChoice label="Duración del aguacero" value={String(s.D)} options={[30, 60, 120, 180].map((d) => ({ value: String(d), label: `${d} min` }))} onChange={(v) => set({ D: Number(v) })} />
          <DockChoice<Soil> label="Grupo hidrológico del suelo" value={s.soil} options={(['A', 'B', 'C', 'D'] as Soil[]).map((k) => ({ value: k, label: k }))} onChange={(v) => set({ soil: v })} />
        </>
      )}
      {s.scen !== 'lluvia' && (
        <>
          <DockRange label="Vida útil de la obra" value={s.life} min={10} max={100} step={5} show={`${s.life} años`} onChange={(v) => set({ life: v })} />
          <DockRange label="Tiempo al pico del hidrograma" value={s.tp} min={10} max={90} step={5} show={`${s.tp} min`} onChange={(v) => set({ tp: v })} />
        </>
      )}
      <DockChoice
        label="Salida: pendiente de fricción"
        value={String(s.outSlope)}
        options={[0.0005, 0.002, 0.005, 0.02].map((v) => ({ value: String(v), label: `${es(v * 100, 2)} %` }))}
        onChange={(v) => set({ outSlope: Number(v) })}
      />
      <DockChoice
        label="Entrada: pendiente de energía"
        value={String(s.egSlope)}
        options={[0.001, 0.005, 0.02].map((v) => ({ value: String(v), label: `${es(v * 100, 1)} %` }))}
        onChange={(v) => set({ egSlope: Number(v) })}
      />
      <VexChoice value={vex} onChange={setVex} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        {run.res && <HydroChart t={run.res.series.t} qin={run.res.series.qin} qBridge={run.res.series.qBridge} qout={run.res.series.qout} W={480} H={210} cls="hc-exp-svg cu-svg" />}
        <h3>Periodo de retorno y riesgo</h3>
        <p>
          La creciente de <strong>T años</strong> es la que en promedio se iguala o se supera una vez cada T años: cada año tiene probabilidad 1/T. En una vida útil de n años, la probabilidad de verla al menos una vez es <strong>R = 1 − (1 − 1/T)^n</strong>. Con T = 100 y n = 50, R = {es(risk(100, 50) * 100, 1)} %.
        </p>
        <h3>De la serie al caudal: Gumbel</h3>
        <p>
          Con los máximos de cada año se ajusta una distribución. Gumbel por momentos: Q_T = media + K_T·desviación, con K_T = −(√6/π)·(0,5772 + ln(ln(T/(T − 1)))). Para esta serie ({AMS.length} años): media {es(AMS_FIT.mean, 1)} m³/s, desviación {es(AMS_FIT.sd, 1)} m³/s, K₁₀₀ = {es(gumbelK(100), 3)}.
        </p>
        <h3>Las condiciones de borde</h3>
        <p>
          El modelo necesita saber qué pasa en sus bordes. Aguas arriba, una <strong>línea de borde con un hidrograma de caudal</strong>: HEC-RAS calcula la profundidad normal en esa línea con la pendiente de energía que se le da y reparte el caudal entre las celdas mojadas según su conducción. Aguas abajo, la <strong>profundidad normal</strong>: con la pendiente de fricción, cada nivel tiene su caudal de salida (una curva de gasto implícita). Antes del evento, un tiempo de <strong>condiciones iniciales</strong> con el caudal base moja el cauce.
        </p>
        <h3>La lluvia sobre la malla</h3>
        <p>
          En vez de traer el agua por un borde, se puede hacer llover sobre todas las celdas (en HEC-RAS, una condición de borde de precipitación sobre el área 2D). Una parte se infiltra o se queda en el suelo: con el <strong>número de curva</strong> del SCS, cada cobertura y cada grupo de suelo (A arenoso a D arcilloso) tiene un CN; la escorrentía acumulada es Q = (P − 0,2·S)²/(P + 0,8·S) con S = 25 400/CN − 254 mm. Cada celda suma lo que escurre en sus píxeles y el modelo lo lleva hacia lo bajo.
        </p>
        <p>
          El aguacero sigue un <strong>hietograma de bloques alternos</strong> de 5 min: el bloque más intenso en el centro y los demás alternando a cada lado, con una curva intensidad-duración ilustrativa (no es la curva IDF de una estación del IDEAM). Detrás del jarillón el agua de la lluvia no tiene salida al río: por eso los barrios protegidos necesitan drenaje y, a veces, bombeo.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el periodo de retorno, la vida útil, la forma del hidrograma, las condiciones de borde o el aguacero: el modelo 2D corre solo con cada cambio." />,
    experimentos: <ReturnExperiments s={s} />,
    diseno: <DesignTab part="retorno" set={MODEL2D_TOOLS.retorno} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>Números de curva (TR-55, humedad antecedente II)</caption>
          <thead>
            <tr>
              <th>Cobertura</th>
              <th>Tipo en la tabla</th>
              <th>A</th>
              <th>B</th>
              <th>C</th>
              <th>D</th>
              <th>Escorrentía con {es(s.P, 0)} mm (suelo {s.soil})</th>
            </tr>
          </thead>
          <tbody>
            {COVER_KEYS.map((c) => (
              <tr key={c}>
                <td>{COVERS[c].name}</td>
                <td>{CN_SOURCE[c]}</td>
                {(['A', 'B', 'C', 'D'] as Soil[]).map((g) => (
                  <td key={g}>{CN_TABLE[c][g]}</td>
                ))}
                <td>{es(scsQ(s.P, scsS(CN_TABLE[c][s.soil])), 1)} mm</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="q3-table">
          <caption>Serie ilustrativa de máximos anuales de la quebrada</caption>
          <thead>
            <tr>
              <th>Año</th>
              <th>Caudal máximo</th>
              <th>Orden</th>
              <th>T de Weibull</th>
            </tr>
          </thead>
          <tbody>
            {AMS.map((a) => {
              const p = plotting(AMS.map((x) => x.Q)).find((q) => q.Q === a.Q)!;
              return (
                <tr key={a.year}>
                  <td>{a.year}</td>
                  <td>{es(a.Q, 1)} m³/s</td>
                  <td>{p.m}</td>
                  <td>{es(p.T, 1)} años</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Serie de máximos anuales, posiciones de graficación, ajuste de Gumbel por momentos, periodo de retorno y riesgo; hidrograma de diseño; condiciones de borde de un modelo 2D (hidrograma de caudal con pendiente de energía, profundidad normal) y condiciones iniciales; atenuación por almacenamiento en las llanuras; lluvia sobre la malla con el número de curva y el encharcamiento detrás de un jarillón.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>Gumbel por momentos (Chow, Maidment y Mays, 1988); posiciones de Weibull; hidrograma con forma gamma (m = 3,7) como aproximación del hidrograma unitario adimensional del SCS. Reparto del caudal de entrada por conducción con la profundidad normal de la pendiente de energía, como lo hace HEC-RAS en las líneas de borde de flujo. Lluvia: números de curva del TR-55 (USDA-NRCS, 1986) por cobertura y grupo de suelo, abstracción inicial 0,2·S, escorrentía acumulada por celda. Pruebas M7, M8, M11 y M18.</p>
        <h3>Límites</h3>
        <p>La serie es inventada (no es de una estación del IDEAM) y con 30 años los periodos de 500 años son extrapolaciones con mucha incertidumbre. El hidrograma no sale de un modelo de lluvia-escorrentía. El aguacero y su curva intensidad-duración son ilustrativos; el número de curva no se calibró y no hay alcantarillado en el modelo. No es un pronóstico oficial de inundación.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

function ReturnExperiments({ s }: { s: ReturnScene }) {
  const list = useMemo(() => PERIODS.map((T) => returnRun({ ...s, scen: 'creciente', T })), [s]);
  const { rows, busy, done, go } = useBatch(list);
  return (
    <div className="q3-exps">
      <h3>Todas las crecientes con tus condiciones de borde (sin lluvia)</h3>
      <div className="hc-flood is-inline">
        {busy ? (
          <span className="hc-flood-q">Corriendo los periodos… {done} de {PERIODS.length}</span>
        ) : (
          <button type="button" onClick={go}>
            Correr los {PERIODS.length} periodos
          </button>
        )}
      </div>
      <table className="q3-table">
        <thead>
          <tr>
            <th>T</th>
            <th>Caudal</th>
            <th>K_T</th>
            <th>Riesgo en {s.life} años</th>
            <th>Volumen de la creciente</th>
            <th>Puente</th>
            <th>Barrio con agua</th>
            <th>Atenuación</th>
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((T, k) => {
            const r = rows[k];
            return (
              <tr key={T} className={T === s.T ? 'is-on' : ''}>
                <td>{T} años</td>
                <td>{es(quantile(AMS_FIT, T), 1)} m³/s</td>
                <td>{es(gumbelK(T), 3)}</td>
                <td>{es(risk(T, s.life) * 100, 1)} %</td>
                <td>{es(hydroVolume({ Qp: quantile(AMS_FIT, T), tp: s.tp, Qb: 4 }, 200) / 1000, 0)} mil m³</td>
                <td>{r ? `${es(r.wseBridge, 2)} m` : '—'}</td>
                <td>{r ? `${es(r.townArea, 0)} m²` : '—'}</td>
                <td>{r ? `${es(r.attenuation * 100, 1)} %` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="q3-small">Prueba de Gumbel: K₁₀₀ = {es(gumbelK(100), 4)} (la tabla clásica da 3,137). Los periodos de 2 a 10 años caben en el cauce; desde el de 25 años el agua empieza a pasar sobre el jarillón cerca del puente, donde el terraplén de la vía la remansa.</p>
    </div>
  );
}


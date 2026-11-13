// «Incertidumbre, amenaza y daños»: de una mancha a decisiones. Un ensamble de corridas con los caudales y los n
// posibles da un mapa de probabilidad de inundación; dos crecientes (30 y 100 años) dan una zonificación de la amenaza
// como ejercicio, con un criterio usado en estudios colombianos; y las curvas profundidad-daño de las casas dan el daño
// de cada creciente y el daño anual esperado. La pregunta: ¿qué tan seguro es el mapa y cuánto cuesta el agua?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { LayerLegend, SER, XYChart, type XY } from './charts';
import { MODEL2D_TOOLS, ROOM } from './design';
import { LIDAR_BURNED, summarize, townPixels } from './scene';
import { AMS_FIT, quantile } from './hydrology';
import { NX, POIS, terrainFor, truth } from './terrain';
import { cellAt, type RunResult } from './solver';
import { runMany, useModelRun } from './runs';
import { DAMAGE_CURVE, EAD_PERIODS, INTENSITY, buildingAreas, damageOf, ead, eadRun, gumbelSE, memberRun, members, probabilityMap, zoneAreas, zoneMap, type Damage } from './analysis';
import { PLACE, RunBadge, VIEWS_BASE, VexChoice, valleyState, vexNote, waterOf } from './common';
import { ValleyWorld } from './three/valleyWorld';

type Mode = 'ensamble' | 'zonas' | 'danos';
interface RiskScene {
  mode: Mode;
  n: number;
  sdN: number;
  T: number;
}
const DEFAULT_RISK: RiskScene = { mode: 'ensamble', n: 12, sdN: 0.15, T: 100 };

interface Ens {
  n: number;
  sdN: number;
  /** Caudal pico y multiplicador del n de cada miembro. */
  ms: { Qp: number; mult: number }[];
  /** Barrio con agua de cada miembro (en el orden de las corridas). */
  areas: number[];
  p: Float32Array;
  rs: RunResult[];
  town: number[];
  school: number;
}
interface Ctx {
  s: RiskScene;
  ens: Ens | null;
  zoneHigh: number;
  eadDone: boolean;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'm2-ensamble',
    title: 'Muchas corridas, un mapa',
    goal: 'Corre un ensamble de 16 miembros o más y mira el mapa de probabilidad de inundación.',
    hint: 'Cada miembro usa un caudal de 100 años y un n posibles; la probabilidad de cada celda es la fracción de miembros que la mojan.',
    check: (c) => !!c.ens && c.ens.n >= 16,
    progress: (c) => (c.ens ? `${c.ens.n} miembros corridos` : 'sin ensamble'),
  },
  {
    id: 'm2-zonas',
    title: 'La zona alta del barrio',
    goal: 'Haz la zonificación del ejercicio con las crecientes de 30 y 100 años y encuentra la parte del barrio que queda en amenaza alta.',
    hint: 'La zonificación junta la intensidad (profundidad, velocidad y su producto) con la frecuencia de la creciente.',
    check: (c) => c.s.mode === 'zonas' && c.zoneHigh > 0,
    progress: (c) => (c.s.mode !== 'zonas' ? 'elige la zonificación' : `amenaza alta en el barrio: ${es(c.zoneHigh, 0)} m²`),
  },
  {
    id: 'm2-dae',
    title: 'El daño de todos los años',
    goal: 'Corre las siete crecientes de la curva de daño y calcula el daño anual esperado.',
    hint: 'Las crecientes frecuentes no dañan casas; las raras dañan mucho pero casi nunca pasan: el daño anual esperado las pesa a todas.',
    check: (c) => c.eadDone,
    progress: (c) => (c.eadDone ? 'calculado' : 'corre las crecientes en «Daños»'),
  },
];

export function RiesgoLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<RiskScene>(DEFAULT_RISK);
  const [vex, setVex] = useState(2);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [ens, setEns] = useState<Ens | null>(null);
  const [busy, setBusy] = useState<{ what: string; done: number; total: number } | null>(null);
  const [dam, setDam] = useState<{ T: number; d: Damage; r: RunResult }[] | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);
  const fine = useMemo(() => terrainFor(LIDAR_BURNED).fine, []);
  // zonificación: las dos crecientes (corren solas al elegir el modo)
  const r30 = useModelRun(s.mode === 'zonas' ? eadRun(30) : null, true, 60);
  const r100 = useModelRun(s.mode === 'zonas' || s.mode === 'ensamble' ? eadRun(100) : null, true, 60);
  const zones = useMemo(() => (r30.res && r100.res ? zoneMap(r30.res, r100.res) : null), [r30.res, r100.res]);
  const zAreas = useMemo(() => (zones && r100.res ? zoneAreas(r100.res.geom, zones) : null), [zones, r100.res]);
  const damT = dam?.find((x) => x.T === s.T) ?? null;
  const eadV = useMemo(() => (dam ? ead(dam.map((x) => ({ T: x.T, D: x.d.total }))) : null), [dam]);
  const runEns = async () => {
    if (busy) return;
    const ms = members(s.n, 7, 100, s.sdN);
    setBusy({ what: 'ensamble', done: 0, total: ms.length });
    const rs = await runMany(ms.map((m) => memberRun(m)), (d, t) => alive.current && setBusy({ what: 'ensamble', done: d, total: t }), () => !alive.current);
    if (!alive.current) return;
    const p = probabilityMap(rs);
    const sc = cellAt(rs[0].geom, POIS.escuela.x, POIS.escuela.y);
    const zs = rs[0].geom.z[Math.floor(POIS.escuela.y) * NX + Math.floor(POIS.escuela.x)];
    const areas = rs.map((r) => summarize(r).townArea);
    setEns({ n: ms.length, sdN: s.sdN, ms: ms.map((m) => ({ Qp: m.Qp, mult: m.mult })), areas, p, rs, town: [...areas].sort((a, b) => a - b), school: rs.filter((r) => r.etaMax[sc] - zs > 0.1).length / rs.length });
    setMember(-1);
    setBusy(null);
  };
  const runDam = async () => {
    if (busy) return;
    setBusy({ what: 'daños', done: 0, total: EAD_PERIODS.length });
    const rs = await runMany(EAD_PERIODS.map(eadRun), (d, t) => alive.current && setBusy({ what: 'daños', done: d, total: t }), () => !alive.current);
    if (!alive.current) return;
    setDam(rs.map((r, k) => ({ T: EAD_PERIODS[k], d: damageOf(r), r })));
    setBusy(null);
  };
  // recorrer los miembros del ensamble, de la menor a la mayor inundación del barrio
  const [member, setMember] = useState(-1);
  const [flip, setFlip] = useState(false);
  const order = useMemo(() => (ens ? ens.areas.map((_, i) => i).sort((a, b) => ens.areas[a] - ens.areas[b]) : []), [ens]);
  useEffect(() => {
    if (!flip || !ens) return;
    const id = window.setInterval(() => setMember((m) => (m + 1 >= ens.n ? 0 : m + 1)), 900);
    return () => window.clearInterval(id);
  }, [flip, ens]);
  useEffect(() => {
    if (s.mode !== 'ensamble') setFlip(false);
  }, [s.mode]);
  const world = useRef<ValleyWorld | null>(null);
  const sync = useRef({ s, vex, ens, zones, r100, damT, member, order });
  sync.current = { s, vex, ens, zones, r100, damT, member, order };
  const toWorld = () => {
    const { s: x, vex: v, ens: e, zones: z, r100: rr, damT: dt, member: mb, order: od } = sync.current;
    const mi = e && mb >= 0 ? od[mb] : -1;
    const water =
      x.mode === 'ensamble'
        ? e
          ? mi >= 0
            ? { res: e.rs[mi], frame: null, layer: 'natural' as const }
            : { res: e.rs[0], frame: null, layer: 'probabilidad' as const, values: e.p }
          : waterOf(rr, 'natural')
        : x.mode === 'zonas'
          ? z && rr.res
            ? { res: rr.res, frame: null, layer: 'zonas' as const, zones: z }
            : waterOf(rr)
          : dt
            ? { res: dt.r, frame: null, layer: 'natural' as const }
            : null;
    world.current?.set(
      valleyState({
        vex: v,
        fine,
        colorBy: 'natural',
        objects: 'si',
        damage: x.mode === 'danos' && dt ? Float32Array.from(dt.d.fracs) : null,
        water,
        labels:
          x.mode === 'ensamble' && e && mi >= 0
            ? [PLACE.barrio(`Miembro ${mb + 1} de ${e.n}: ${es(e.areas[mi], 0)} m²`, `pico ${es(e.ms[mi].Qp, 0)} m³/s y n ×${es(e.ms[mi].mult, 2)}`, 'dato')]
            : x.mode === 'ensamble' && e
            ? [PLACE.barrio(`Barrio: de ${es(e.town[0], 0)} a ${es(e.town[e.town.length - 1], 0)} m²`, `con agua en los ${e.n} miembros`, 'dato'), PLACE.escuela('La escuela', `se moja en ${es(e.school * 100, 0)} % de los miembros`, e.school > 0.3 ? 'alerta' : 'ok')]
            : x.mode === 'danos' && dt
              ? [PLACE.barrio(`${dt.d.wet} casas con agua`, `daño de ${es(dt.d.total, 0)} m² de vivienda (T = ${dt.T} años)`, dt.d.wet ? 'alerta' : 'ok')]
              : [PLACE.barrio(), PLACE.escuela(), PLACE.puente()],
      }),
    );
  };
  useEffect(() => {
    toWorld();
  }, [s, vex, ens, zones, r100.res, r100.status, r100.live, damT, member, order]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, ens, zoneHigh: zAreas ? zAreas[3] : 0, eadDone: !!eadV }), [s, ens, zAreas, eadV]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<RiskScene>) => setS((x) => ({ ...x, ...p }));
  const Q = quantile(AMS_FIT, 100), se = gumbelSE(100);
  const mid = (a: number[]) => a[Math.floor(a.length / 2)];
  const answer =
    s.mode === 'ensamble' ? (
      ens ? (
        <>
          Con {ens.n} corridas (caudal de 100 años {es(Q, 0)} ± {es(se, 0)} m³/s y n ±{es(ens.sdN * 100, 0)} %), el área del barrio con agua va de <strong>{es(ens.town[0], 0)} a {es(ens.town[ens.town.length - 1], 0)} m²</strong> (mediana {es(mid(ens.town), 0)} m²) y la escuela se moja en {es(ens.school * 100, 0)} % de ellas. El mapa muestra la probabilidad de que cada celda tenga más de 10 cm de agua.
        </>
      ) : (
        <>Una sola corrida da una mancha; un ensamble de corridas con los caudales y los n posibles da la probabilidad de inundación de cada lugar. Elige cuántos miembros y córrelo.</>
      )
    ) : s.mode === 'zonas' ? (
      zAreas ? (
        <>
          En el ejercicio, el barrio queda con <strong>{es(zAreas[3], 0)} m² en amenaza alta</strong>, {es(zAreas[2], 0)} m² en media y {es(zAreas[1], 0)} m² en baja. Es una zonificación de práctica con un criterio usado en estudios colombianos, no la de un plan de ordenamiento.
        </>
      ) : (
        <>El modelo está corriendo las crecientes de 30 y 100 años para la zonificación…</>
      )
    ) : eadV && damT ? (
      <>
        Con la creciente de {s.T} años, {damT.d.wet} casas tienen agua y el daño equivale a <strong>{es(damT.d.total, 0)} m² de vivienda</strong>. Sumando todas las crecientes por su probabilidad, el daño anual esperado es de {es(eadV.total, 1)} m² por año.
      </>
    ) : (
      <>Corre las siete crecientes (de 2 a 500 años) para ver el daño de cada una en las casas y el daño anual esperado.</>
    );
  const tone: 'ok' | 'mid' | 'bad' = s.mode === 'zonas' && zAreas ? (zAreas[3] > 0 ? 'bad' : 'mid') : 'mid';

  const chart =
    s.mode === 'ensamble' && ens ? (
      <XYChart series={[{ name: 'barrio con agua', pts: ens.town.map((a, k) => [((k + 0.5) / ens.n) * 100, a] as XY), color: SER.a, dots: true }]} xLabel="miembros ordenados (%)" yLabel="m²" yFmt={(v) => es(v, 0)} label="Área del barrio con agua en cada miembro del ensamble, de menor a mayor." />
    ) : s.mode === 'danos' && dam ? (
      <XYChart
        series={[{ name: 'daño', pts: [...dam].sort((a, b) => b.T - a.T).map((x) => [100 / x.T, x.d.total] as XY), color: SER.b, area: true }]}
        vlines={[{ x: 100 / s.T, text: `${s.T} años` }]}
        xLabel="probabilidad anual de excedencia (%)"
        yLabel="m² de vivienda"
        yFmt={(v) => es(v, 0)}
        label="Daño de cada creciente según su probabilidad anual: el área bajo la curva es el daño anual esperado."
      />
    ) : s.mode === 'zonas' && zAreas ? (
      <XYChart series={[{ name: 'área del barrio', pts: [1, 2, 3].map((k) => [k, zAreas[k]] as XY), color: SER.b, dots: true }]} xTicks={[1, 2, 3].map((k) => ({ v: k, t: ['', 'baja', 'media', 'alta'][k] }))} xLabel="zona" yLabel="m²" yFmt={(v) => es(v, 0)} label="Área del barrio en cada zona de amenaza del ejercicio." />
    ) : undefined;

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label={`Maqueta 3D del valle con ${s.mode === 'ensamble' ? 'la probabilidad de inundación de cada celda (de azul claro a oscuro)' : s.mode === 'zonas' ? 'las zonas de amenaza del ejercicio (amarillo baja, naranja media, rojo alta)' : `el agua de la creciente de ${s.T} años y las casas coloreadas por su daño`}; ${vexNote(vex)}.`}
          viewNames={VIEWS_BASE}
          make={(st) => new ValleyWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>{chart}</FlatStage>
      )}
      <Question q={s.mode === 'ensamble' ? '¿Qué tan seguro es el mapa?' : s.mode === 'zonas' ? '¿Dónde es alta la amenaza?' : '¿Cuánto cuesta el agua?'} answer={answer} tone={tone} />
      {busy ? (
        <div className="hc-flood">
          <span className="hc-flood-q" aria-live="polite">
            Corriendo {busy.what}: {busy.done} de {busy.total}…
          </span>
        </div>
      ) : (
        s.mode === 'zonas' && <RunBadge r={r30.status === 'listo' ? r100 : r30} />
      )}
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={s.mode === 'ensamble' ? [`${s.n} miembros`, `Q₁₀₀ ${es(Q, 0)} ± ${es(se, 0)} m³/s`, `n ±${es(s.sdN * 100, 0)} %`] : s.mode === 'zonas' ? ['30 y 100 años', 'criterio de ejemplo', zAreas ? `alta ${es(zAreas[3], 0)} m²` : 'calculando'] : [`T = ${s.T} años`, damT ? `${damT.d.wet} casas con agua` : 'sin correr', eadV ? `DAE ${es(eadV.total, 1)} m²/año` : '']}
        chart={chart}
        traces={
          s.mode === 'ensamble'
            ? [
                { key: 'm', label: 'Barrio con agua (mediana)', unit: 'm²', value: ens ? mid(ens.town) : NaN, digits: 0 },
                { key: 's', label: 'Probabilidad de que se moje la escuela', unit: '%', value: ens ? ens.school * 100 : NaN, digits: 0 },
              ]
            : s.mode === 'zonas'
              ? [
                  { key: 'a', label: 'Barrio en amenaza alta', unit: 'm²', value: zAreas?.[3] ?? NaN, digits: 0 },
                  { key: 'b', label: 'Barrio en amenaza media', unit: 'm²', value: zAreas?.[2] ?? NaN, digits: 0 },
                ]
              : [
                  { key: 'd', label: `Daño con ${s.T} años`, unit: 'm²', value: damT?.d.total ?? NaN, digits: 0 },
                  { key: 'e', label: 'Daño anual esperado', unit: 'm²/año', value: eadV?.total ?? NaN, digits: 2 },
                ]
        }
      />
      <DockChoice
        label="Qué hacer"
        value={s.mode}
        options={[
          { value: 'ensamble', label: 'Ensamble de incertidumbre' },
          { value: 'zonas', label: 'Zonificación de la amenaza' },
          { value: 'danos', label: 'Daños y daño anual esperado' },
        ]}
        onChange={(v) => set({ mode: v as Mode })}
      />
      {s.mode === 'ensamble' && (
        <>
          <DockChoice label="Miembros del ensamble" value={String(s.n)} options={[8, 12, 16, 24].map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => set({ n: Number(v) })} />
          <DockChoice label="Incertidumbre del n" value={String(s.sdN)} options={[0.1, 0.15, 0.25].map((x) => ({ value: String(x), label: `±${es(x * 100, 0)} %` }))} onChange={(v) => set({ sdN: Number(v) })} />
          <div className="hc-flood is-inline">
            <button type="button" onClick={runEns} disabled={!!busy}>
              {ens ? 'Correr otro ensamble' : 'Correr el ensamble'}
            </button>
          </div>
          {ens && (
            <>
              <DockRange
                label="Ver"
                value={member}
                min={-1}
                max={ens.n - 1}
                step={1}
                show={member < 0 ? 'la probabilidad' : `el miembro ${member + 1} de ${ens.n}`}
                onChange={(v) => {
                  setFlip(false);
                  setMember(v);
                }}
              />
              <div className="hc-flood is-inline">
                <button type="button" onClick={() => (flip ? setFlip(false) : (setMember((m) => (m < 0 ? 0 : m)), setFlip(true)))}>
                  {flip ? 'Detener' : 'Pasar los miembros uno a uno'}
                </button>
                {member >= 0 && (
                  <button type="button" onClick={() => (setFlip(false), setMember(-1))}>
                    Volver a la probabilidad
                  </button>
                )}
              </div>
              <p className="q3-small">{member < 0 ? 'Los miembros van de la menor a la mayor inundación del barrio: pásalos para ver de dónde sale la probabilidad.' : `Miembro ${member + 1}: pico de ${es(ens.ms[order[member]].Qp, 0)} m³/s y n ×${es(ens.ms[order[member]].mult, 2)}; barrio con ${es(ens.areas[order[member]], 0)} m² de agua.`}</p>
              <LayerLegend layer={member < 0 ? 'probabilidad' : 'natural'} />
            </>
          )}
        </>
      )}
      {s.mode === 'zonas' && <LayerLegend layer="zonas" />}
      {s.mode === 'danos' && (
        <>
          <div className="hc-flood is-inline">
            <button type="button" onClick={runDam} disabled={!!busy}>
              {dam ? 'Correr de nuevo' : `Correr las ${EAD_PERIODS.length} crecientes`}
            </button>
          </div>
          <DockChoice label="Creciente que se muestra" value={String(s.T)} options={EAD_PERIODS.map((T) => ({ value: String(T), label: `${T} años` }))} onChange={(v) => set({ T: Number(v) })} />
        </>
      )}
      <VexChoice value={vex} onChange={setVex} />
    </>
  );

  const T0 = truth();
  const A = buildingAreas();
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps m2-math">
        <h3>Incertidumbre: un ensamble de corridas</h3>
        <p>
          El caudal de 100 años sale de 30 años de registro: tiene un error estándar de ±{es(se, 1)} m³/s (Gumbel por momentos). El n tampoco se conoce exacto. Un <strong>ensamble</strong> corre el modelo muchas veces con valores posibles (aquí, el caudal con su error estándar y el n con un error lognormal) y cuenta, en cada celda, la fracción de corridas que la mojan con más de 10 cm: un <strong>mapa de probabilidad</strong> en vez de una sola mancha. Así se comunica qué es seguro y qué no.
        </p>
        <h3>Zonificación de la amenaza (ejercicio)</h3>
        <p>
          En Colombia, el Decreto 1077 de 2015 (que recoge el 1807 de 2014) pide a los municipios <strong>estudios básicos</strong> con la zonificación de la amenaza por inundación en <strong>alta, media y baja</strong> para sus planes de ordenamiento; los criterios los fija cada estudio. Aquí se usa como ejemplo el de un estudio del corredor del río Cauca: intensidad baja si h ≤ {es(INTENSITY.baja.h, 1)} m, v ≤ {es(INTENSITY.baja.v, 1)} m/s y h·v ≤ {es(INTENSITY.baja.hv, 3)} m²/s; alta si h &gt; {es(INTENSITY.media.h, 1)} m, v &gt; {es(INTENSITY.media.v, 1)} m/s o h·v &gt; {es(INTENSITY.media.hv, 2)} m²/s; media entre ambas.
        </p>
        <p>
          Matriz del ejercicio con dos crecientes: intensidad media o alta con 30 años, o alta con 100 años → amenaza alta; baja con 30 años o media con 100 años → media; baja con 100 años → baja. Es una práctica: no es la zonificación de ningún plan de ordenamiento y no reemplaza un estudio básico o detallado.
        </p>
        <h3>Daños y daño anual esperado</h3>
        <p>
          Una <strong>curva profundidad-daño</strong> dice qué fracción del valor de una casa se pierde con cierta profundidad. Con la profundidad máxima en cada casa se suma el daño de cada creciente (aquí en metros cuadrados de vivienda equivalentes). Las crecientes frecuentes casi no dañan y las raras dañan mucho pero pasan poco: el <strong>daño anual esperado</strong> es el área bajo la curva daño–probabilidad y sirve para comparar alternativas (una obra vale lo que reduce ese daño frente a lo que cuesta).
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Corre un ensamble, mira la zonificación del ejercicio y calcula el daño anual esperado. Las corridas usan celdas de 20 m refinadas a 10 m en el cauce y el jarillón." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Curva profundidad-daño residencial</h3>
        <XYChart series={[{ name: 'fracción del valor', pts: DAMAGE_CURVE.d.map((d, k) => [d, DAMAGE_CURVE.f[k]] as XY), color: SER.b, width: 2.4 }]} xLabel="profundidad (m)" yLabel="fracción" yFmt={(v) => es(v, 1)} W={480} H={200} cls="hc-exp-svg cu-svg" label="Curva cóncava de daño residencial: la mitad del valor se pierde con medio metro de agua y casi todo con dos." />
        {dam && (
          <table className="q3-table">
            <thead>
              <tr>
                <th>Creciente</th>
                <th>Caudal</th>
                <th>Casas con agua</th>
                <th>Profundidad máxima en una casa</th>
                <th>Daño</th>
              </tr>
            </thead>
            <tbody>
              {dam.map((x) => (
                <tr key={x.T} className={x.T === s.T ? 'is-on' : ''}>
                  <td>{x.T} años</td>
                  <td>{es(quantile(AMS_FIT, x.T), 1)} m³/s</td>
                  <td>{x.d.wet}</td>
                  <td>{es(Math.max(0, ...x.d.depths), 2)} m</td>
                  <td>{es(x.d.total, 0)} m²</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {eadV && (
          <p className="q3-small">
            Daño anual esperado: {eadV.parts.map((p) => (Number.isFinite(p.to) ? `${p.from}–${p.to} años: ${es(p.area, 2)}` : `más de ${p.from} años: ${es(p.area, 2)}`)).join('; ')} → {es(eadV.total, 2)} m² de vivienda por año.
          </p>
        )}
        {ens && (
          <>
            <h3>El ensamble</h3>
            <table className="q3-table">
              <tbody>
                <Row name="Miembros" value={String(ens.n)} note={`n ±${es(ens.sdN * 100, 0)} %; caudal ${es(Q, 1)} ± ${es(se, 1)} m³/s`} />
                <Row name="Celdas que se mojan siempre" value={es(Array.from(ens.p).filter((v) => v === 1).length, 0)} />
                <Row name="Celdas inciertas (10 a 90 %)" value={es(Array.from(ens.p).filter((v) => v >= 0.1 && v <= 0.9).length, 0)} />
                <Row name="Barrio con probabilidad mayor que 50 %" value={`${es(townProb(ens), 0)} m²`} />
              </tbody>
            </table>
          </>
        )}
      </div>
    ),
    diseno: <DesignTab part="riesgo" set={MODEL2D_TOOLS.riesgo} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>Las casas del barrio y la finca</caption>
          <thead>
            <tr>
              <th>Casa</th>
              <th>Área</th>
              <th>Profundidad ({s.T} años)</th>
              <th>Daño</th>
            </tr>
          </thead>
          <tbody>
            {T0.buildings.map((b, k) => (
              <tr key={k}>
                <td>{b.name === 'escuela' ? 'La escuela' : `Casa ${k + 1}`}</td>
                <td>{es(A[k], 0)} m²</td>
                <td>{damT ? `${es(damT.d.depths[k], 2)} m` : '—'}</td>
                <td>{damT ? `${es(damT.d.fracs[k] * 100, 0)} %` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>La incertidumbre de un modelo (caudal de diseño y rugosidad) y su comunicación con un mapa de probabilidad; la zonificación de la amenaza por inundación en alta, media y baja como la piden los estudios básicos de los POT en Colombia; las curvas profundidad-daño y el daño anual esperado para comparar medidas.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Error estándar del cuantil de Gumbel por momentos (Kite). Ensamble con semilla fija. Decreto 1077 de 2015 (compila el 1807 de 2014) para la exigencia de zonificar alta, media y baja; umbrales de intensidad tomados como ejemplo de la ficha técnica de los mapas de amenaza del corredor del río Cauca (CVC, usados en el POT de Palmira). Curva de daño con la forma de las funciones globales del JRC para Suramérica (Huizinga, de Moel y Szewczyk, 2017); regla del trapecio para el daño anual esperado. Pruebas M22 a M25.
        </p>
        <h3>Límites</h3>
        <p>
          La matriz de zonificación es un ejercicio, no una norma; la curva de daño es ilustrativa y el daño se mide en metros cuadrados de vivienda, no en pesos; el ensamble no incluye el error del terreno ni del hidrograma. No es un estudio de amenaza, ni un mapa de un plan de ordenamiento, ni un pronóstico oficial de inundación.
        </p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

/** Área del barrio en celdas con probabilidad de inundación mayor que 50 % [m²]. */
function townProb(e: Ens): number {
  const g = e.rs[0].geom;
  let a = 0;
  for (const k of townPixels()) {
    const ci = g.pmap[k];
    if (ci >= 0 && e.p[ci] > 0.5) a += g.px * g.px;
  }
  return a;
}

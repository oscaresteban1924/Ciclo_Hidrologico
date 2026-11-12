// «El terreno: MDT, MDS y el píxel»: el modelo hidráulico no ve el valle, ve un ráster. Se cambia la superficie
// (terreno desnudo o con casas, árboles y el tablero del puente), el tamaño del píxel, el método de remuestreo, el
// error vertical de la fuente y si se inserta el cauce levantado; se mide cuánto cauce, cuánto jarillón y cuánta
// luz del puente quedan. La pregunta: ¿ve el modelo el cauce y el jarillón?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { CapacityChart, SectionChart } from './charts';
import { MODEL2D_TOOLS, ROOM } from './design';
import { DEFAULT_TERRAIN_SCENE, SOURCES, terrainScene, trueCapacity, type TerrainScene } from './scene';
import { COVER_KEYS, COVERS, DC, HALF_TOP, LEVEE, NX, NY, PIXELS, RESAMPLE_NAMES, ROAD, S0, coverShares, leveeLoss, meanCapacity, terrainFor, truth, verticalError, yc, type Resample, type Surface } from './terrain';
import { PLACE, VexChoice, sg, valleyState, vexNote } from './common';
import { ValleyWorld } from './three/valleyWorld';

type R = ReturnType<typeof terrainScene>;
interface Ctx {
  s: TerrainScene;
  r: R;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'm2-pixel',
    title: 'El cauce se borra',
    goal: 'Con el MDT, promedio y sin insertar el cauce, encuentra un tamaño de píxel con el que el cauce conserva menos del 30 % de su capacidad.',
    hint: 'Promediar un cauce de 11 m con la llanura dentro de un píxel grande lo vuelve una zanja ancha y poco honda.',
    check: (c) => c.s.surf === 'mdt' && c.s.method === 'promedio' && !c.s.burn && c.r.capRatio < 0.3,
    progress: (c) => `con ${c.s.p} m el cauce conserva el ${es(c.r.capRatio * 100, 0)} %`,
  },
  {
    id: 'm2-quemar',
    title: 'Devolverle el cauce',
    goal: 'Con píxeles de 10 m o más, deja la capacidad del cauce entre 80 % y 120 % de la real.',
    hint: 'En RAS Mapper se puede poner encima del terreno una capa con el cauce levantado a 1 m (una modificación del terreno).',
    check: (c) => c.s.p >= 10 && c.r.capRatio >= 0.8 && c.r.capRatio <= 1.2,
    progress: (c) => `con ${c.s.p} m: ${es(c.r.capRatio * 100, 0)} %`,
  },
  {
    id: 'm2-jarillon',
    title: 'La corona del jarillón',
    goal: 'Con el MDT y píxeles de 5 m o más, encuentra el remuestreo que deja la corona del jarillón a 10 cm o menos de la real. Mira qué le pasa al cauce.',
    hint: 'Un método se queda con lo más alto de cada píxel: conserva lo alto y borra lo bajo.',
    check: (c) => c.s.surf === 'mdt' && c.s.p >= 5 && Math.abs(c.r.levee) <= 0.1,
    progress: (c) => `corona ${sg(c.r.levee)}, cauce ${es(c.r.capRatio * 100, 0)} %`,
  },
  {
    id: 'm2-puente',
    title: 'El puente tapado',
    goal: 'Encuentra la superficie con la que la luz bajo el puente desaparece del terreno.',
    hint: 'Un modelo de superficie ve lo que tiene encima el suelo, también el tablero del puente.',
    check: (c) => c.r.bridge < 5 && c.r.bridgeTrue > 20,
    progress: (c) => `luz del puente ${es(c.r.bridge, 0)} m² de ${es(c.r.bridgeTrue, 0)} m²`,
  },
];

export function TerrenoLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<TerrainScene>(DEFAULT_TERRAIN_SCENE);
  const [vex, setVex] = useState(3);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const r = useMemo(() => terrainScene(s), [s]);
  const world = useRef<ValleyWorld | null>(null);
  const sync = useRef({ s, r, vex });
  sync.current = { s, r, vex };
  const toWorld = () => {
    const { s: x, r: y, vex: v } = sync.current;
    world.current?.set(
      valleyState({
        vex: v,
        fine: y.fine,
        raster: x.p >= 5 ? y.raster : null,
        objects: x.surf === 'mdt' ? 'fantasma' : 'no',
        section: x.x,
        labels: [
          { id: 'corte', text: `Corte en x = ${es(x.x, 0)} m`, sub: `el cauce lleva ${es(y.capX, 0)} de ${es(y.capXTrue, 0)} m³/s`, x: x.x, y: yc(x.x) + 40, up: 8, kind: 'dato', prio: 9 },
          PLACE.jarillon('El jarillón', Math.abs(y.levee) < 0.05 ? 'la corona se conserva' : `corona ${sg(y.levee)}`, Math.abs(y.levee) > 0.3 ? 'alerta' : 'lugar'),
          PLACE.puente('El puente', y.bridge < 5 ? 'el MDS tapa la luz' : `luz ${es(y.bridge, 0)} m²`, y.bridge < 5 ? 'alerta' : 'lugar'),
          PLACE.barrio(x.surf === 'mds' ? 'Techos y copas en el terreno' : 'Las casas no están en el MDT', x.surf === 'mds' ? `${es(y.raised * 100, 0)} % de las casas sobresale` : 'solo su contorno'),
        ],
      }),
    );
  };
  useEffect(() => {
    toWorld();
  }, [r, vex]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, r }), [s, r]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<TerrainScene>) => setS((x) => ({ ...x, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.capRatio >= 0.8 && r.capRatio <= 1.2 && Math.abs(r.levee) < 0.15 && r.bridge > 20 ? 'ok' : r.capRatio >= 0.5 && r.capRatio <= 1.6 && Math.abs(r.levee) < 0.5 ? 'mid' : 'bad';
  const answer = (
    <>
      Con {s.surf === 'mdt' ? 'el MDT' : 'el MDS'} en píxeles de {s.p} m ({RESAMPLE_NAMES[s.method].toLowerCase()}
      {s.sigma > 0 ? `, error de ${es(s.sigma, 1)} m` : ''}
      {s.burn ? ', con el cauce levantado' : ''}) el cauce conserva el <strong>{es(r.capRatio * 100, 0)} %</strong> de su capacidad ({es(r.cap, 0)} de {es(r.capTrue, 0)} m³/s) y la corona del jarillón queda {sg(r.levee)}.
      {r.bridge < 5 ? ' El tablero del puente tapa la luz: para el modelo, la vía es una presa.' : ''}
      {!s.burn && s.p <= 2 && s.surf === 'mdt' ? ' Aun a 1 m falta el cauce que el láser no ve bajo el agua.' : ''}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label={`Maqueta 3D del valle ilustrativo con su quebrada, el jarillón, el barrio y la vía con su puente, dibujado como lo ve el modelo: ${s.surf === 'mdt' ? 'terreno desnudo' : 'superficie con casas, árboles y el tablero del puente'}, en píxeles de ${s.p} m; ${vexNote(vex)}. Un plano blanco muestra el corte del terreno: la línea oscura es el terreno real y la azul, el que ve el modelo.`}
          viewNames={[
            { id: 'valle', label: 'El valle' },
            { id: 'corte', label: 'El corte' },
            { id: 'barrio', label: 'El jarillón' },
            { id: 'puente', label: 'El puente' },
          ]}
          make={(st) => new ValleyWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <SectionChart x={s.x} secTrue={r.secTrue} secModel={r.secModel} secMds={r.secMds} showMds={s.surf === 'mds'} bank={r.bank} W={520} H={240} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Ve el modelo el cauce y el jarillón?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`píxel ${s.p} m`, `cauce ${es(r.capRatio * 100, 0)} %`, `error ${es(r.rmse, 2)} m`, vexNote(vex)]}
        chart={<SectionChart x={s.x} secTrue={r.secTrue} secModel={r.secModel} secMds={r.secMds} showMds={s.surf === 'mds'} bank={r.bank} />}
        traces={[
          { key: 'q', label: 'Capacidad del cauce', unit: 'm³/s', value: r.cap, digits: 0, ref: { value: r.capTrue, label: 'real' } },
          { key: 'l', label: 'Corona del jarillón (frente a la real)', unit: 'm', value: r.levee, digits: 2 },
          { key: 'b', label: 'Luz bajo el puente', unit: 'm²', value: r.bridge, digits: 0, ref: { value: r.bridgeTrue, label: 'real' } },
        ]}
      />
      <DockChoice<Surface>
        label="Superficie"
        value={s.surf}
        options={[
          { value: 'mdt', label: 'MDT (terreno)' },
          { value: 'mds', label: 'MDS (superficie)' },
        ]}
        onChange={(v) => set({ surf: v })}
      />
      <DockChoice label="Tamaño del píxel" value={String(s.p)} options={PIXELS.map((p) => ({ value: String(p), label: `${p} m` }))} onChange={(v) => set({ p: Number(v) })} />
      <DockChoice<Resample> label="Remuestreo" value={s.method} options={(Object.keys(RESAMPLE_NAMES) as Resample[]).map((m) => ({ value: m, label: RESAMPLE_NAMES[m] }))} onChange={(v) => set({ method: v })} />
      <DockRange label="Error vertical de la fuente" value={s.sigma} min={0} max={3} step={0.1} show={`${es(s.sigma, 1)} m`} onChange={(v) => set({ sigma: v })} />
      <DockChoice
        label="Cauce levantado (batimetría)"
        value={s.burn ? 'si' : 'no'}
        options={[
          { value: 'no', label: 'No' },
          { value: 'si', label: 'Insertarlo' },
        ]}
        onChange={(v) => set({ burn: v === 'si' })}
      />
      <DockRange label="Corte en x" value={s.x} min={20} max={620} step={5} show={`${es(s.x, 0)} m`} onChange={(v) => set({ x: v })} />
      <VexChoice value={vex} onChange={setVex} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <SectionChart x={s.x} secTrue={r.secTrue} secModel={r.secModel} secMds={r.secMds} showMds={s.surf === 'mds'} bank={r.bank} W={480} H={220} cls="hc-exp-svg cu-svg" />
        <h3>MDT y MDS</h3>
        <p>
          Un <strong>modelo digital de elevación</strong> es una cuadrícula (ráster) donde cada píxel guarda una cota. Si guarda el suelo desnudo es un <strong>modelo digital del terreno (MDT)</strong>; si guarda lo primero que encuentra el sensor desde arriba (techos, copas, el tablero de un puente) es un <strong>modelo digital de superficie (MDS)</strong>. El agua corre por el suelo y rodea las casas, pero pasa bajo los árboles y bajo el puente: un modelo hidráulico necesita el MDT, y las casas se agregan con cuidado (como bloques o con un n alto).
        </p>
        <h3>El píxel y el remuestreo</h3>
        <p>
          Al pasar de 1 m a píxeles más grandes hay que decidir qué cota recibe cada píxel: el <strong>promedio</strong> conserva el volumen bajo un plano pero aplana el cauce y el jarillón; el <strong>mínimo</strong> exagera los fosos; el <strong>máximo</strong> conserva las coronas pero borra el cauce; el <strong>vecino más cercano</strong> toma un punto al azar del píxel. Ninguno conserva a la vez lo alto y lo bajo: por eso HEC-RAS combina terrenos (el cauce levantado encima del general) y usa líneas de quiebre en las coronas.
        </p>
        <h3>La capacidad del cauce</h3>
        <p>
          La conducción de una franja crece con la profundidad a la potencia 5/3. Si un cauce de {es(DC, 1)} m de hondo se reparte en un píxel de 30 m, la misma área queda en una zanja de pocos decímetros que conduce mucho menos: el modelo saca el agua del cauce antes de tiempo. Además, el láser y las fotos no ven bajo el agua: el cauce bajo la lámina se levanta en campo (batimetría) y se inserta en el terreno.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la superficie, el píxel, el remuestreo, el error y el cauce levantado. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: <TerrainExperiments active={tab === 'experimentos'} p={s.p} />,
    diseno: <DesignTab part="terreno" set={MODEL2D_TOOLS.terreno} room={ROOM} />,
    datos: <TerrainData />,
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Diferencia entre MDT y MDS; ráster, tamaño de píxel y métodos de remuestreo; error vertical de una fuente; por qué la conducción de un cauce depende de su forma y no solo de su área; el cauce bajo el agua que no ven los sensores; jarillones, vías y puentes en el terreno; fuentes de elevación gratuitas y su alcance.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Terreno ilustrativo a 1 m; remuestreo por bloques; capacidad a orilla llena por franjas de 1 m con Manning (n = 0,04, S = {es(S0 * 100, 1)} %) en 19 cortes. Calidad del LiDAR QL2 del programa 3DEP del USGS (RMSEz ≤ 10 cm, celda de 1 m); Copernicus GLO-30 (MDS, precisión absoluta &lt; 4 m LE90); el MDE de 12,5 m de los productos ALOS PALSAR RTC de la ASF es el SRTM de 30 m remuestreado fuera de EE. UU. Pruebas M1 a M3.
        </p>
        <h3>Límites</h3>
        <p>El valle, sus obras y sus fuentes son ilustrativos (no son un lugar de Medellín ni un levantamiento real); el error vertical se simula con un ruido sencillo; los productos reales tienen además errores de posición, vacíos y artefactos de la clasificación del suelo.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

function TerrainExperiments({ active, p }: { active: boolean; p: number }) {
  const data = useMemo(() => {
    if (!active) return null;
    const capT = trueCapacity();
    const table = (Object.keys(RESAMPLE_NAMES) as Resample[]).map((m) => ({ method: m, name: RESAMPLE_NAMES[m], caps: PIXELS.map((px) => [px, (meanCapacity(terrainFor({ surf: 'mdt', p: px, method: m, sigma: 0, burn: false }).fine) / capT) * 100] as [number, number]) }));
    const lev = PIXELS.map((px) => (Object.keys(RESAMPLE_NAMES) as Resample[]).map((m) => leveeLoss(terrainFor({ surf: 'mdt', p: px, method: m, sigma: 0, burn: false }).fine)));
    const src = SOURCES.map((sr) => {
      const z = terrainFor(sr.opts).fine;
      const zb = terrainFor({ ...sr.opts, burn: true }).fine;
      return { sr, cap: meanCapacity(z) / capT, capB: meanCapacity(zb) / capT, rmse: verticalError(z).rmse, lev: leveeLoss(z) };
    });
    return { table, lev, src };
  }, [active]);
  if (!data) return <div className="q3-exps" />;
  return (
    <div className="q3-exps">
      <h3>Capacidad del cauce según el píxel (MDT, sin insertar el cauce)</h3>
      <CapacityChart table={data.table} p={p} W={480} H={220} cls="hc-exp-svg cu-svg" />
      <table className="q3-table">
        <thead>
          <tr>
            <th>Píxel</th>
            {data.table.map((t) => (
              <th key={t.method}>{t.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PIXELS.map((px, k) => (
            <tr key={px} className={px === p ? 'is-on' : ''}>
              <td>{px} m</td>
              {data.table.map((t, m) => (
                <td key={t.method}>
                  {es(t.caps[k][1], 0)} % <small>(corona {sg(data.lev[k][m])})</small>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="q3-small">A 1 m la capacidad ya es menor que la real: el sensor ve la lámina de agua del caudal base y no el fondo. Con el máximo la corona del jarillón se conserva, pero el cauce desaparece.</p>
      <h3>Fuentes de elevación (simuladas sobre este valle)</h3>
      <table className="q3-table">
        <thead>
          <tr>
            <th>Fuente</th>
            <th>Píxel</th>
            <th>Superficie</th>
            <th>Precisión que declara</th>
            <th>Cauce (y levantado)</th>
            <th>Error frente al MDT</th>
          </tr>
        </thead>
        <tbody>
          {data.src.map(({ sr, cap, capB, rmse }) => (
            <tr key={sr.id}>
              <td>{sr.name}</td>
              <td>{sr.pixel}</td>
              <td>{sr.surface}</td>
              <td>{sr.accuracy}</td>
              <td>
                {es(cap * 100, 0)} % ({es(capB * 100, 0)} %)
              </td>
              <td>{es(rmse, 2)} m</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="q3-small">
        {SOURCES.map((sr) => (
          <li key={sr.id}>
            <strong>{sr.name}:</strong> {sr.note}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TerrainData() {
  const T = truth();
  const sh = coverShares();
  return (
    <div className="q3-data">
      <table className="q3-table">
        <caption>El valle (ilustrativo)</caption>
        <tbody>
          <Row name="Área" value={`${NX} × ${NY} m (${es((NX * NY) / 10000, 1)} ha)`} note="terreno verdadero a 1 m" />
          <Row name="Pendiente del valle" value={`${es(S0 * 100, 1)} %`} />
          <Row name="Quebrada" value={`meándrica, boca de ${es(HALF_TOP * 2, 0)} m y ${es(DC, 1)} m de hondo`} note="fondo de gravas y cantos" />
          <Row name="Jarillón" value={`${es(LEVEE.H, 1)} m sobre la llanura, a ${LEVEE.dn} m del eje`} note={`de x = ${LEVEE.x0} m al terraplén de la vía`} />
          <Row name="Vía" value={`terraplén de ${es(ROAD.H, 1)} m en x = ${ROAD.x} m`} note={`puente de unos ${ROAD.open * 2} m de luz`} />
          <Row name="Edificaciones" value={`${T.buildings.length}`} note="casas de 3 a 9 m, la escuela de 7 m y una finca" />
          <Row name="Árboles" value={`${T.crowns.length} copas`} note="en el bosque de las orillas y la ladera" />
          {COVER_KEYS.map((c) => (
            <Row key={c} name={COVERS[c].name} value={`${es(sh[c] * 100, 1)} % del área`} note={COVERS[c].desc} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

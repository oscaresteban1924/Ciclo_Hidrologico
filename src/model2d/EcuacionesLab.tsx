// «La malla y las ecuaciones»: qué resuelve un modelo 2D. Cada celda guarda una curva cota-volumen hecha con los
// píxeles del terreno (subgrid) y cada cara una tabla de área y conducción; la continuidad cuadra el volumen de
// cada celda y la cantidad de movimiento da el caudal de cada cara (onda difusiva o inercia local). El paso de
// tiempo, el número de Courant y el peso θ deciden si el cálculo es estable. La pregunta: ¿qué calcula cada celda?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { ConveyanceChart, DamBreakChart, VolumeChart } from './charts';
import { MODEL2D_TOOLS, ROOM } from './design';
import { DEFAULT_EQ, LIDAR_BURNED, eqMesh, eqReference, eqRun, summarize, type EqScene, type Summary } from './scene';
import { EQ_NAMES, TABLE_DH, TABLE_LEVELS, buildGeometry, cellAt, cellVolume, cellWetArea, faceProps, normalN, type Eq } from './solver';
import { damBreak } from './dambreak';
import { NX, NY, terrainFor } from './terrain';
import { cachedSummary, runNow, useModelRun, useReference } from './runs';
import { PLACE, RunBadge, VexChoice, sg, valleyState, vexNote } from './common';
import { ValleyWorld } from './three/valleyWorld';

interface Ctx {
  s: EqScene;
  sum: Summary | null;
  ref: Summary | null;
  unstable: boolean;
  courant: number;
  volErr: number;
}

const DTS = [0.5, 1, 2, 3, 5, 10, 20, 30, 60];

const RETOS: Reto<Ctx>[] = [
  {
    id: 'm2-courant',
    title: 'Más allá de Courant',
    goal: 'Con la inercia local (explícita) y un paso de tiempo fijo, haz que el cálculo se vuelva inestable.',
    hint: 'En un esquema explícito una onda no puede cruzar más de una celda en un paso: Δt ≤ 0,7·Δx/(V + √(g·h)).',
    check: (c) => c.s.eq === 'inercia' && c.s.dtMode === 'fijo' && c.unstable,
    progress: (c) => (c.s.eq === 'inercia' ? `Δt = ${es(c.s.dt, 1)} s ${c.s.dtMode === 'fijo' ? 'fijo' : 'ajustado'}: ${c.unstable ? 'inestable' : 'estable'}` : 'elige la inercia local'),
  },
  {
    id: 'm2-implicito',
    title: 'Pasos largos sin miedo',
    goal: 'Con la onda difusiva (implícita), corre con un Courant de 3 o más sin inestabilidad y con un error de volumen menor que 0,01 %.',
    hint: 'Un esquema implícito resuelve todas las celdas a la vez en cada paso: admite pasos mucho más largos.',
    check: (c) => c.s.eq === 'difusiva' && !c.unstable && !!c.sum && c.courant >= 3 && Math.abs(c.volErr) < 0.01,
    progress: (c) => (c.sum ? `Courant ${es(c.courant, 1)}, error de volumen ${es(Math.abs(c.volErr) < 5e-5 ? 0 : c.volErr, 4)} %` : 'esperando el cálculo'),
  },
  {
    id: 'm2-theta',
    title: 'θ menor, más riesgo',
    goal: 'Con la onda difusiva, un peso θ de 0,7 o menos y un paso largo, haz que el cálculo se vuelva inestable.',
    hint: 'Con θ = 1 todo se evalúa al final del paso (más estable); con θ = 0,6 se mezcla con el comienzo (más exacto, menos estable).',
    check: (c) => c.s.eq === 'difusiva' && c.s.theta <= 0.7 && c.unstable,
    progress: (c) => `θ = ${es(c.s.theta, 2)}, Δt = ${es(c.s.dt, 0)} s: ${c.unstable ? 'inestable' : 'estable'}`,
  },
  {
    id: 'm2-subgrid',
    title: 'Celdas grandes, terreno fino',
    goal: 'Con celdas de 40 m, deja el nivel máximo en el puente a 15 cm o menos de la referencia de celdas de 10 m.',
    hint: 'Las tablas de cada celda y de cada cara guardan el terreno de 1 m: el cauce no se pierde aunque la celda sea grande.',
    check: (c) => c.s.c === 40 && !!c.sum && !!c.ref && c.sum.ok && Math.abs(c.sum.wseBridge - c.ref.wseBridge) <= 0.15,
    progress: (c) => (c.sum && c.ref ? `celdas de ${c.s.c} m: ${sg(c.sum.wseBridge - c.ref.wseBridge)} frente a la referencia` : 'esperando el cálculo'),
  },
];

export function EcuacionesLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<EqScene>(DEFAULT_EQ);
  const [vex, setVex] = useState(3);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const opts = useMemo(() => eqRun(s), [s]);
  const run = useModelRun(opts);
  const ref = useReference(eqReference());
  const fine = useMemo(() => terrainFor(LIDAR_BURNED).fine, []);
  const rough = useMemo(() => ({ n: normalN(), mult: 1, buildings: 'n' as const }), []);
  const geom = useMemo(() => buildGeometry(LIDAR_BURNED, eqMesh(s), rough), [s.c, s.subgrid, s.breaklines]); // eslint-disable-line react-hooks/exhaustive-deps
  const flat = useMemo(() => buildGeometry(LIDAR_BURNED, { c: s.c, subgrid: false, breaklines: false }, rough), [s.c]); // eslint-disable-line react-hooks/exhaustive-deps
  const ci = cellAt(geom, s.cx, s.cy);
  const eta = geom.zmin[ci] + s.h;
  const I = ci % geom.MX, J = Math.floor(ci / geom.MX);
  const east = I < geom.MX - 1 ? J * (geom.MX - 1) + I : J * (geom.MX - 1) + I - 1;
  const V = cellVolume(geom, ci, eta), Aw = cellWetArea(geom, ci, eta), Vflat = cellVolume(flat, ci, eta);
  const fp = faceProps(geom, east, eta);
  const sum = run.sum;
  const unstable = run.status === 'inestable';
  const courant = run.res?.courantMax ?? 0;
  const volErr = run.res?.vol.errPct ?? 0;
  const world = useRef<ValleyWorld | null>(null);
  const sync = useRef({ s, run, vex, geom, ci, eta, sum });
  sync.current = { s, run, vex, geom, ci, eta, sum };
  const toWorld = () => {
    const { s: x, run: rr, vex: v, geom: g, ci: c, eta: e, sum: sm } = sync.current;
    world.current?.set(
      valleyState({
        vex: v,
        fine,
        objects: 'no',
        mesh: { c: x.c },
        breaklines: x.breaklines,
        cell: { c: x.c, ci: c, geom: g, eta: e },
        water: rr.res && rr.status === 'listo' ? { res: rr.res, frame: null, layer: 'profundidad' } : null,
        labels: [
          { id: 'celda', text: `Celda de ${x.c} m`, sub: `${es(cellVolume(g, c, e), 0)} m³ con ${es(x.h, 2)} m sobre su punto más bajo`, x: (c % g.MX) * x.c + x.c / 2, y: Math.floor(c / g.MX) * x.c + x.c, up: 6, kind: 'sonda', prio: 9 },
          ...(sm ? [PLACE.puente(`Puente: ${es(sm.wseBridge, 2)} m`, undefined, 'dato')] : []),
        ],
      }),
    );
  };
  useEffect(() => {
    toWorld();
  }, [run.res, run.status, vex, geom, ci, eta, sum, s.breaklines, s.c]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, sum, ref, unstable, courant, volErr }), [s, sum, ref, unstable, courant, volErr]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<EqScene>) => setS((x) => ({ ...x, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = unstable ? 'bad' : !sum || !ref ? 'mid' : Math.abs(sum.wseBridge - ref.wseBridge) <= 0.1 ? 'ok' : 'mid';
  const answer = (
    <>
      La celda elegida guarda <strong>{es(V, 0)} m³</strong> con el agua {es(s.h, 2)} m sobre su punto más bajo (mojados {es(Aw, 0)} de {es(s.c * s.c, 0)} m²; {s.subgrid ? `sin subgrid serían ${es(Vflat, 0)} m³` : 'sin subgrid la celda es un plano'}). Su cara este conduce {es(fp.K * Math.sqrt(0.005), 1)} m³/s con S = 0,5 %.{' '}
      {unstable ? `La corrida se volvió inestable: ${run.res?.unstable?.why}` : sum && ref ? `Con ${EQ_NAMES[s.eq].toLowerCase()} el nivel en el puente da ${es(sum.wseBridge, 2)} m (${sg(sum.wseBridge - ref.wseBridge)} frente a celdas de 10 m), Courant máximo ${es(courant, 1)}.` : ''}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label={`Maqueta 3D del valle con la malla de cálculo de celdas de ${s.c} m dibujada sobre el terreno${s.breaklines ? ', las líneas de quiebre en el jarillón y la vía' : ''} y una celda marcada en naranja con el agua por dentro: solo cubre los píxeles más bajos que el nivel; ${vexNote(vex)}.`}
          viewNames={[
            { id: 'malla', label: 'La malla' },
            { id: 'celda', label: 'La celda' },
            { id: 'valle', label: 'El valle' },
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
          <VolumeChart g={geom} gFlat={flat} ci={ci} eta={eta} W={520} H={240} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Qué calcula cada celda?" answer={answer} tone={tone} />
      <RunBadge r={run} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`${geom.NC.toLocaleString('es-CO')} celdas`, `${geom.NF.toLocaleString('es-CO')} caras`, EQ_NAMES[s.eq], run.res ? `${run.res.steps.toLocaleString('es-CO')} pasos` : '']}
        chart={<VolumeChart g={geom} gFlat={flat} ci={ci} eta={eta} />}
        traces={[
          { key: 'w', label: 'Puente frente a la referencia (10 m)', unit: 'm', value: sum && ref ? sum.wseBridge - ref.wseBridge : 0, digits: 2 },
          { key: 'c', label: 'Courant máximo', unit: '', value: courant, digits: 2 },
          { key: 'v', label: 'Error de volumen', unit: '%', value: volErr, digits: 4 },
        ]}
      />
      <DockChoice label="Celdas" value={String(s.c)} options={[5, 10, 20, 40].map((c) => ({ value: String(c), label: `${c} m` }))} onChange={(v) => set({ c: Number(v) })} />
      <DockChoice
        label="Tablas subgrid"
        value={s.subgrid ? 'si' : 'no'}
        options={[
          { value: 'si', label: 'Sí (como HEC-RAS)' },
          { value: 'no', label: 'No (celda plana)' },
        ]}
        onChange={(v) => set({ subgrid: v === 'si' })}
      />
      <DockChoice
        label="Líneas de quiebre"
        value={s.breaklines ? 'si' : 'no'}
        options={[
          { value: 'si', label: 'En el jarillón y la vía' },
          { value: 'no', label: 'No' },
        ]}
        onChange={(v) => set({ breaklines: v === 'si' })}
      />
      <DockChoice<Eq> label="Ecuaciones" value={s.eq} options={(Object.keys(EQ_NAMES) as Eq[]).map((k) => ({ value: k, label: EQ_NAMES[k] }))} onChange={(v) => set({ eq: v, dtMode: v === 'difusiva' ? 'fijo' : s.dtMode, dt: v === 'difusiva' && s.dt < 5 ? 10 : s.dt })} />
      <DockChoice
        label="Paso de tiempo"
        value={s.dtMode}
        options={[
          { value: 'courant', label: 'Ajustado por Courant' },
          { value: 'fijo', label: 'Fijo' },
        ]}
        onChange={(v) => set({ dtMode: v as EqScene['dtMode'] })}
      />
      <DockChoice label={s.dtMode === 'fijo' ? 'Δt' : 'Δt máximo'} value={String(s.dt)} options={DTS.map((d) => ({ value: String(d), label: `${es(d, d < 1 ? 1 : 0)} s` }))} onChange={(v) => set({ dt: Number(v) })} />
      {s.eq === 'difusiva' && <DockRange label="Peso implícito θ" value={s.theta} min={0.6} max={1} step={0.05} show={es(s.theta, 2)} onChange={(v) => set({ theta: v })} />}
      <DockRange label="Celda: x" value={s.cx} min={5} max={NX - 5} step={5} show={`${es(s.cx, 0)} m`} onChange={(v) => set({ cx: v })} />
      <DockRange label="Celda: y" value={s.cy} min={5} max={NY - 5} step={5} show={`${es(s.cy, 0)} m`} onChange={(v) => set({ cy: v })} />
      <DockRange label="Nivel en la celda (sobre su punto más bajo)" value={s.h} min={0} max={4} step={0.05} show={`${es(s.h, 2)} m`} onChange={(v) => set({ h: v })} />
      <VexChoice value={vex} onChange={setVex} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps m2-math">
        <ConveyanceChart g={geom} gFlat={flat} f={east} eta={eta} W={480} H={210} cls="hc-exp-svg cu-svg" />
        <h3>1. El área 2D y su malla</h3>
        <p>
          El área de flujo 2D se divide en <strong>celdas</strong> (aquí cuadradas de {s.c} m: {geom.NC.toLocaleString('es-CO')} celdas y {geom.NF.toLocaleString('es-CO')} caras). En cada celda se calcula una sola cota del agua η; en cada cara, un caudal Q. HEC-RAS admite mallas no estructuradas (celdas de 3 a 8 caras) y las <strong>líneas de quiebre</strong> obligan a que las caras sigan las coronas de jarillones y vías.
        </p>
        <h3>2. El preprocesador: tablas subgrid</h3>
        <p>
          Antes de calcular, cada celda recibe su <strong>curva cota-volumen</strong> V(η) = Σ (η − zᵢ)·aᵢ sobre sus píxeles mojados ({s.c * s.c} píxeles de 1 m), y cada cara sus tablas de <strong>área A(η)</strong> y <strong>conducción K(η) = Σ (1/nᵢ)·dᵢ^(5/3)·Δy</strong> (aquí cada {es(TABLE_DH, 1)} m, {TABLE_LEVELS} niveles). Así una celda de 40 m «sabe» que tiene un cauce de 11 m adentro: sin subgrid sería un plano a su cota media y el cauce desaparecería.
        </p>
        <h3>3. Continuidad (masa)</h3>
        <p className="m2-eq">V_i(η_i^(n+1)) − V_i(η_i^n) = Δt · [ Σ_caras Q_f + Q_borde ]</p>
        <p>El volumen de cada celda cambia con lo que entra y sale por sus caras. Con la curva cota-volumen se pasa del volumen al nivel exactamente.</p>
        <h3>4. Cantidad de movimiento</h3>
        <p className="m2-eq">∂V/∂t + (V·∇)V = −g∇η + ν_t∇²V − g·n²|V|V/R^(4/3) + f·k×V</p>
        <p>
          Aceleración local, advección, gradiente del nivel, viscosidad turbulenta, fricción y Coriolis: son las <strong>ecuaciones de aguas someras</strong> promediadas en la vertical. HEC-RAS las resuelve completas (métodos Euleriano-Lagrangiano y Euleriano), sin advección ni difusión (<strong>inercia local</strong>) o reducidas a <strong>onda difusiva</strong>, donde solo quedan el gradiente del nivel y la fricción:
        </p>
        <p className="m2-eq">onda difusiva: Q_f = −sign(∂η/∂n) · K_f(η) · |∂η/∂n|^(1/2)</p>
        <p className="m2-eq">inercia local: Q_f^(n+1) = [Q_f^n − g·A_f·Δt·∂η/∂n] / [1 + g·A_f·Δt·|Q_f^n| / K_f²]</p>
        <h3>5. El tiempo: explícito o implícito</h3>
        <p>
          Un esquema <strong>explícito</strong> calcula cada cara con los niveles del paso anterior: es sencillo, pero se vuelve inestable si una onda cruza más de una celda en un paso (Δt ≤ 0,7·Δx/(V + √(g·h))). Uno <strong>implícito</strong>, como el de HEC-RAS, plantea un sistema con todas las celdas a la vez y lo resuelve en cada paso; admite números de Courant de 3 (ecuaciones completas) o 5 (onda difusiva). El peso <strong>θ</strong> mezcla el comienzo y el final del paso: θ = 1 es lo más estable; θ cercano a 0,6, más exacto pero más delicado.
        </p>
        <h3>6. Iteraciones y tolerancias</h3>
        <p>
          Como K(η) y V(η) dependen del nivel que se busca, cada paso se itera: se linealiza, se resuelve el sistema (aquí por gradiente conjugado con Cholesky incompleto) y se repite hasta que el nivel cambia menos que la tolerancia (por omisión 0,01 pie ≈ 3 mm en HEC-RAS) o se llega al máximo de iteraciones (20). Al final, el balance de volumen dice si el modelo perdió o inventó agua.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la malla, las tablas, las ecuaciones, el paso de tiempo y θ: el modelo corre solo con cada cambio (creciente de 100 años). Las celdas de 5 m tardan más." />,
    experimentos: <EqExperiments active={tab === 'experimentos'} />,
    diseno: <DesignTab part="ecuaciones" set={MODEL2D_TOOLS.ecuaciones} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La malla y la celda elegida</caption>
          <tbody>
            <Row name="Celdas y caras" value={`${geom.NC.toLocaleString('es-CO')} y ${geom.NF.toLocaleString('es-CO')}`} note={`${geom.MX} × ${geom.MY}`} />
            <Row name="Preprocesador" value={`${es(geom.ms, 0)} ms`} note="tablas de todas las celdas y caras" />
            <Row name="Celda elegida" value={`columna ${I + 1}, fila ${J + 1}`} note={`punto más bajo ${es(geom.zmin[ci], 2)} m`} />
            <Row name="Volumen con el nivel elegido" value={`${es(V, 1)} m³`} note={`sin subgrid: ${es(Vflat, 1)} m³`} />
            <Row name="Área mojada" value={`${es(Aw, 0)} m²`} note={`de ${es(s.c * s.c, 0)} m²`} />
            <Row name="Cara este" value={`A = ${es(fp.A, 2)} m², K = ${es(fp.K, 1)} m³/s`} note="conducción por franjas de 1 m" />
          </tbody>
        </table>
        {run.res && (
          <table className="q3-table">
            <caption>Registro de la corrida</caption>
            <tbody>
              {run.res.log.map((l, k) => (
                <tr key={k}>
                  <td>{l}</td>
                </tr>
              ))}
              {s.eq === 'difusiva' && run.res.iters.total > 0 && (
                <tr>
                  <td>
                    Iteraciones: {run.res.iters.total.toLocaleString('es-CO')} en total, hasta {run.res.iters.max} por paso; {run.res.iters.nonconv} pasos sin converger.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Volúmenes finitos (celdas y caras); tablas subgrid de volumen y de conducción; continuidad; ecuaciones de aguas someras y sus simplificaciones (inercia local, onda difusiva); esquemas explícitos e implícitos; número de Courant; peso θ; iteraciones, tolerancias y balance de volumen; validación con una solución exacta (Ritter).</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Ecuaciones y opciones de cálculo según la documentación de HEC-RAS 2D (Hydrologic Engineering Center; Brunner): cuatro juegos de ecuaciones, esquema implícito de volúmenes finitos, θ por omisión 1, tolerancia del nivel 0,01 pie, 20 iteraciones, Courant de 1 a 3 (completas) y hasta 5 (onda difusiva). Subgrid como en Casulli (2009). Inercia local de Bates et al. (2010) y de Almeida et al. (2012). Rotura de presa de Ritter (1892). Pruebas M4 a M12.
        </p>
        <h3>Límites</h3>
        <p>La malla de la sala es cuadrada; la inercia local de la sala es explícita (la de HEC-RAS va dentro de su esquema implícito); no hay viscosidad turbulenta ni Coriolis; las ecuaciones completas solo se resuelven en la prueba 1D. Los resultados no son de HEC-RAS: se construyen con sus mismas ideas.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

const MESHES: { name: string; c: number; subgrid: boolean }[] = [
  { name: '10 m con subgrid (referencia)', c: 10, subgrid: true },
  { name: '20 m con subgrid', c: 20, subgrid: true },
  { name: '20 m sin subgrid', c: 20, subgrid: false },
  { name: '40 m con subgrid', c: 40, subgrid: true },
  { name: '40 m sin subgrid', c: 40, subgrid: false },
];

function EqExperiments({ active }: { active: boolean }) {
  const [h0, setH0] = useState(2);
  const [t, setT] = useState(20);
  const db = useMemo(() => (active ? damBreak(h0, t) : null), [active, h0, t]);
  const make = (m: (typeof MESHES)[number]) => eqRun({ ...DEFAULT_EQ, c: m.c, subgrid: m.subgrid });
  const [rows, setRows] = useState<(Summary | null)[]>(() => MESHES.map((m) => cachedSummary(make(m))));
  const [busy, setBusy] = useState(false);
  const go = () => {
    setBusy(true);
    let k = 0;
    const next = () => {
      if (k >= MESHES.length) {
        setBusy(false);
        return;
      }
      const sm = summarize(runNow(make(MESHES[k])));
      const i = k;
      setRows((r) => r.map((x, j) => (j === i ? sm : x)));
      k++;
      window.setTimeout(next, 0);
    };
    window.setTimeout(next, 0);
  };
  const ref = rows[0];
  return (
    <div className="q3-exps">
      <h3>Prueba con una solución exacta: rotura de presa (Ritter)</h3>
      {db && <DamBreakChart x={db.x} ritter={db.ritter} swe={db.swe} li={db.li} W={480} H={220} cls="hc-exp-svg cu-svg" />}
      <div className="m2-inline">
        <label>
          Embalse h0 <input type="range" min={0.5} max={5} step={0.5} value={h0} onChange={(e) => setH0(Number(e.target.value))} /> <output>{es(h0, 1)} m</output>
        </label>
        <label>
          Tiempo <input type="range" min={5} max={40} step={5} value={t} onChange={(e) => setT(Number(e.target.value))} /> <output>{t} s</output>
        </label>
      </div>
      {db && (
        <table className="q3-table">
          <thead>
            <tr>
              <th>Esquema</th>
              <th>Error medio frente a Ritter</th>
              <th>Frente (1 % de h0)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ritter (exacta)</td>
              <td>—</td>
              <td>{es(db.frontRitter, 0)} m</td>
            </tr>
            <tr>
              <td>Aguas someras completas (HLL)</td>
              <td>{es(db.errSWE * 100, 1)} %</td>
              <td>{es(db.frontSWE, 0)} m</td>
            </tr>
            <tr>
              <td>Inercia local</td>
              <td>{es(db.errLI * 100, 1)} %</td>
              <td>{es(db.frontLI, 0)} m</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="q3-small">Sin el término de advección, la inercia local no reproduce un flujo rápido (supercrítico) como el de una rotura de presa: para flujos muy dinámicos se usan las ecuaciones completas, y la onda difusiva o la inercia local para crecientes lentas en llanuras.</p>
      <h3>La malla y el subgrid (creciente de 100 años, inercia local)</h3>
      <div className="hc-flood is-inline">
        {busy ? (
          <span className="hc-flood-q">Corriendo las mallas…</span>
        ) : (
          <button type="button" onClick={go}>
            Correr las {MESHES.length} mallas
          </button>
        )}
      </div>
      <table className="q3-table">
        <thead>
          <tr>
            <th>Malla</th>
            <th>Puente</th>
            <th>Barrio con agua</th>
            <th>Tiempo de cálculo</th>
          </tr>
        </thead>
        <tbody>
          {MESHES.map((m, k) => {
            const r = rows[k];
            return (
              <tr key={m.name}>
                <td>{m.name}</td>
                <td>{r ? `${es(r.wseBridge, 2)} m${ref && k ? ` (${sg(r.wseBridge - ref.wseBridge)})` : ''}` : '—'}</td>
                <td>{r ? `${es(r.townArea, 0)} m²` : '—'}</td>
                <td>{r ? `${es(r.ms / 1000, 2)} s` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="q3-small">Sin subgrid, las celdas gruesas pierden el cauce: el agua sale a la llanura antes de tiempo y el barrio se inunda de más. Con subgrid, aun las celdas de 40 m quedan cerca de la referencia en el puente, aunque el reparto en el barrio cambia.</p>
    </div>
  );
}

// «La tubería»: una conducción por gravedad desde el tanque de la loma hasta la válvula del barrio, en una maqueta
// cortada a lo largo del tubo. El estudiante abre la válvula, cambia el nivel del tanque, el diámetro, el material y la
// fórmula, y lee los piezómetros. La pregunta: ¿cuánta agua llega al barrio y con qué presión?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { MoodyChart, PipeProfileChart } from './charts';
import { SUPPLY_TOOLS, ROOM } from './design';
import { G, PIPE_MATS, PVC_DIAMETERS, gateK, nuWater, pipeline, type PipeMat, type PipelineResult } from './pipes';
import { DEFAULT_PIPE, PIPE_FITTINGS, pipeInput, type PipeScene } from './scene';
import { PIEZO_X, PipeWorld } from './three/pipeWorld';

interface Ctx {
  s: PipeScene;
  r: PipelineResult;
  other: PipelineResult;
  fMeas: number | null;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'ac-negativa',
    title: 'Presión negativa en la loma',
    goal: 'Abre la válvula hasta que en algún punto del tubo la presión sea negativa (la línea piezométrica pasa por debajo del tubo).',
    hint: 'Mira el piezómetro E, sobre la loma pequeña. Con más caudal, más pérdida, y la línea piezométrica baja.',
    check: (c) => c.r.pMin < 0,
    progress: (c) => `Presión mínima: ${es(c.r.pMin, 2)} m`,
  },
  {
    id: 'ac-entrega',
    title: 'Agua suficiente y con fuerza',
    goal: 'Entrega 20 L/s o más con al menos 15 m de presión en la válvula y sin presión negativa en ningún punto.',
    hint: 'Con un tubo más grueso se pierde menos por fricción. Después, regula con la válvula.',
    check: (c) => c.r.Q * 1000 >= 20 && c.r.pEnd >= 15 && c.r.pMin >= 0,
    progress: (c) => `${es(c.r.Q * 1000, 1)} L/s con ${es(c.r.pEnd, 1)} m al final`,
  },
  {
    id: 'ac-friccion',
    title: 'Mide la fricción',
    goal: 'Con las lecturas de los piezómetros B y C, calcula el factor de fricción en Experimentos: debe quedar a menos de 5 % del de Colebrook.',
    hint: 'La pérdida entre B y C es la diferencia de sus cotas piezométricas (cota del tubo + presión). La distancia y las cotas están en Datos.',
    check: (c) => c.fMeas !== null && Math.abs(c.fMeas - c.r.f) / c.r.f < 0.05,
    progress: (c) => (c.fMeas === null ? 'Escribe tus lecturas en Experimentos.' : `Tu f = ${es(c.fMeas, 4)}; Colebrook ${es(c.r.f, 4)}`),
  },
  {
    id: 'ac-formulas',
    title: 'Dos fórmulas, dos respuestas',
    goal: 'Encuentra un material y un diámetro con los que Hazen-Williams y Darcy-Weisbach den caudales que difieran más de 5 %.',
    hint: 'Hazen-Williams usa un C fijo; Darcy-Weisbach cambia con el diámetro, la rugosidad y la velocidad. Prueba tubos rugosos y abre la válvula.',
    check: (c) => Math.abs(c.other.Q - c.r.Q) / Math.max(1e-9, c.r.Q) > 0.05,
    progress: (c) => `Diferencia: ${es((Math.abs(c.other.Q - c.r.Q) / Math.max(1e-9, c.r.Q)) * 100, 1)} %`,
  },
];

const MATS: PipeMat[] = ['pvc', 'acero', 'galv', 'concreto'];

export function TuberiaLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<PipeScene>(DEFAULT_PIPE);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [fMeas, setFMeas] = useState<number | null>(null);
  const r = useMemo(() => pipeline(pipeInput(s)), [s]);
  const other = useMemo(() => pipeline(pipeInput({ ...s, method: s.method === 'darcy' ? 'hw' : 'darcy' })), [s]);
  const dw = s.method === 'darcy' ? r : other;
  const world = useRef<PipeWorld | null>(null);
  const sync = useRef(r);
  sync.current = r;
  useEffect(() => world.current?.set(sync.current), [r]);
  const ctx = useMemo<Ctx>(() => ({ s, r: dw, other: s.method === 'darcy' ? other : r, fMeas }), [s, r, other, dw, fMeas]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<PipeScene>) => setS((x) => ({ ...x, ...p }));
  const zAt = (x: number) => {
    const p = r.inp.profile;
    for (let k = 1; k < p.length; k++) if (x <= p[k].x) return p[k - 1].z + ((x - p[k - 1].x) / (p[k].x - p[k - 1].x)) * (p[k].z - p[k - 1].z);
    return p[p.length - 1].z;
  };
  const at = (x: number) => {
    const pts = r.pts;
    for (let k = 1; k < pts.length; k++) if (x <= pts[k].x) {
      const t = (x - pts[k - 1].x) / Math.max(1e-9, pts[k].x - pts[k - 1].x);
      return { s: pts[k - 1].s + t * (pts[k].s - pts[k - 1].s), hgl: pts[k - 1].hgl + t * (pts[k].hgl - pts[k - 1].hgl) };
    }
    const l = pts[pts.length - 1];
    return { s: l.s, hgl: l.hgl };
  };
  const piezos = PIEZO_X.map((x, k) => ({ name: String.fromCharCode(65 + k), x, z: zAt(x), ...at(x) }));
  const low = r.pts.reduce((a, p) => (p.p < a.p ? p : a));
  const tone: 'ok' | 'mid' | 'bad' = r.pMin < 0 ? 'bad' : r.pEnd < 15 ? 'mid' : 'ok';
  const answer = (
    <>
      Llegan <strong>{es(r.Q * 1000, 1)} L/s</strong> a {es(r.V, 2)} m/s, con {es(r.pEnd, 1)} m de presión antes de la válvula. De los {es(r.inp.H0 - 6, 1)} m de desnivel, la fricción se lleva {es(r.hfTot, 1)} m, los accesorios {es(r.hmTot, 1)} m y la válvula {es(r.hValve, 1)} m.{' '}
      {r.pMin < 0 ? `En la loma (a ${es(low.x, 0)} m) la presión es negativa (${es(r.pMin, 1)} m): el tubo puede chupar aire o agua sucia por una fisura.` : `La presión más baja es ${es(r.pMin, 1)} m, a ${es(low.x, 0)} m del tanque.`}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una ladera cortada a lo largo de una tubería: el tanque en la loma, el tubo enterrado que baja, pasa una loma pequeña y llega a la válvula del barrio. Seis piezómetros de vidrio muestran la presión como una columna de agua, y la línea piezométrica une sus niveles."
          viewNames={[
            { id: 'general', label: 'La conducción' },
            { id: 'tanque', label: 'El tanque' },
            { id: 'loma', label: 'La loma' },
            { id: 'valvula', label: 'La válvula' },
          ]}
          make={(st) => new PipeWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <PipeProfileChart r={r} piezoX={PIEZO_X} />
        </FlatStage>
      )}
      <Question q="¿Cuánta agua llega al barrio y con qué presión?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`Q = ${es(r.Q * 1000, 1)} L/s`, `V = ${es(r.V, 2)} m/s`, `presión mínima ${es(r.pMin, 1)} m`]}
        chart={<PipeProfileChart r={r} piezoX={PIEZO_X} />}
        traces={[
          { key: 'q', label: 'Caudal', unit: 'L/s', value: r.Q * 1000, digits: 1 },
          { key: 'p', label: 'Presión antes de la válvula', unit: 'm', value: r.pEnd, digits: 1, ref: { value: 15, label: '15 m: mínima de una red (Art. 61)' } },
          { key: 'm', label: 'Presión mínima del tubo', unit: 'm', value: r.pMin, digits: 2, ref: { value: 0, label: 'atmosférica' } },
        ]}
      />
      <DockRange label="Apertura de la válvula" value={Math.round(s.open * 100)} min={10} max={100} step={5} show={`${es(s.open * 100, 0)} %`} onChange={(v) => set({ open: v / 100 })} />
      <DockRange label="Agua en el tanque" value={s.H0} min={47} max={60} step={0.5} show={`${es(s.H0, 1)} m`} onChange={(v) => set({ H0: v })} />
      <DockChoice<string> label="Diámetro" value={String(s.dIdx)} options={[0, 1, 2, 3].map((k) => ({ value: String(k), label: PVC_DIAMETERS[k].name }))} onChange={(v) => set({ dIdx: Number(v) })} />
      <DockChoice<PipeMat> label="Material" value={s.mat} options={MATS.map((m) => ({ value: m, label: PIPE_MATS[m].name.split(' ')[0] }))} onChange={(v) => set({ mat: v })} />
      <DockChoice<'darcy' | 'hw'> label="Fórmula" value={s.method} options={[{ value: 'darcy', label: 'Darcy-Weisbach' }, { value: 'hw', label: 'Hazen-Williams' }]} onChange={(v) => set({ method: v })} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <PipeProfileChart r={r} piezoX={PIEZO_X} W={480} H={220} />
        <h3>La energía del agua se gasta en el camino</h3>
        <p>
          En el tanque, el agua tiene toda su energía como altura. Al bajar por el tubo, una parte se vuelve presión y otra velocidad, y otra se pierde por el roce con la pared (fricción) y en los codos y la válvula. La <strong>línea piezométrica</strong> marca hasta dónde subiría el agua en un tubito vertical en cada punto: la distancia entre ella y el tubo es la presión. La <strong>línea de energía</strong> va encima, a V²/2g.
        </p>
        <h3>La válvula reparte la carga</h3>
        <p>Con la válvula casi cerrada, pasa poca agua: casi no hay pérdidas y la presión es casi la estática. Al abrirla pasa más agua, las pérdidas crecen con el cuadrado de la velocidad y la presión baja en todo el tubo. Si la línea piezométrica pasa por debajo del tubo, ahí la presión es negativa.</p>
        <p className="q3-small">El tubo se dibuja más grueso que el real para verlo; las cotas, las presiones y las columnas de agua de los piezómetros van a escala.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Abre la válvula, cambia el tubo y lee los piezómetros. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Mide el factor de fricción</h3>
        {s.method === 'darcy' ? (
          <FrictionReading r={dw} piezos={piezos} onResult={setFMeas} key={`${s.dIdx}-${s.mat}-${s.open}-${s.H0}`} />
        ) : (
          <p className="q3-small">Este experimento compara con Colebrook-White: cambia la fórmula a Darcy-Weisbach al pie de la escena.</p>
        )}
        <MoodyChart Re={dw.Re} rr={PIPE_MATS[s.mat].eps / PVC_DIAMETERS[s.dIdx].D} f={dw.f} measured={fMeas} />
        <h3>Las dos fórmulas</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th />
              <th>Darcy-Weisbach</th>
              <th>Hazen-Williams</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Caudal', (x: PipelineResult) => `${es(x.Q * 1000, 2)} L/s`],
              ['Pérdida por fricción', (x: PipelineResult) => `${es(x.hfTot, 2)} m`],
              ['Presión al final', (x: PipelineResult) => `${es(x.pEnd, 2)} m`],
            ].map(([name, fn]) => (
              <tr key={name as string}>
                <th>{name as string}</th>
                <td>{(fn as (x: PipelineResult) => string)(s.method === 'darcy' ? r : other)}</td>
                <td>{(fn as (x: PipelineResult) => string)(s.method === 'darcy' ? other : r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="q3-small">Hazen-Williams usa un coeficiente C fijo para cada material ({PIPE_MATS[s.mat].C} aquí) y vale para agua a temperatura normal; Darcy-Weisbach con Colebrook tiene en cuenta el diámetro, la rugosidad y el número de Reynolds.</p>
      </div>
    ),
    diseno: <DesignTab part="tuberia" set={SUPPLY_TOOLS.tuberia} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>Piezómetros</caption>
          <thead>
            <tr>
              <th />
              <th>Distancia sobre el tubo</th>
              <th>Cota del tubo</th>
              <th>Presión</th>
              <th>Cota piezométrica</th>
            </tr>
          </thead>
          <tbody>
            {piezos.map((p) => (
              <tr key={p.name}>
                <th>{p.name}</th>
                <td>{es(p.s, 2)} m</td>
                <td>{es(p.z, 2)} m</td>
                <td>{es(p.hgl - p.z, 2)} m</td>
                <td>{es(p.hgl, 2)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="q3-table">
          <caption>La conducción (ilustrativa)</caption>
          <tbody>
            <Row name="Tubo" value={`${PIPE_MATS[s.mat].name}, ${PVC_DIAMETERS[s.dIdx].name} (interno ${es(PVC_DIAMETERS[s.dIdx].D * 1000, 1)} mm)`} note={`ε = ${es(PIPE_MATS[s.mat].eps * 1000, 4)} mm; C = ${PIPE_MATS[s.mat].C}`} />
            <Row name="Largo del tubo" value={`${es(r.pts[r.pts.length - 1].s, 1)} m`} note="de la cota 44 m a la 6 m" />
            <Row name="Agua a 20 °C" value={`ν = ${es(nuWater(20) * 1e6, 3)}e-6 m²/s`} />
            <Row name="Caudal y velocidad" value={`${es(r.Q * 1000, 2)} L/s · ${es(r.V, 3)} m/s`} />
            <Row name="Reynolds y factor de fricción" value={`${es(dw.Re, 0)} · f = ${es(dw.f, 5)}`} note="Colebrook-White" />
            <Row name="Carga de velocidad" value={`${es(r.hv, 3)} m`} />
            <Row name="Pérdidas" value={`fricción ${es(r.hfTot, 2)} m, entrada y codos ${es(r.hmTot, 2)} m, válvula ${es(r.hValve, 2)} m`} note={`${PIPE_FITTINGS.length} codos de K = 0,4; entrada 0,5; válvula K = ${es(gateK(s.open), 2)}`} />
            <Row name="Cierre de la ecuación de energía" value={`${r.closure.toExponential(1)} m`} />
            <Row name="Presión estática más alta" value={`${es(r.pStatic, 1)} m`} note="con la válvula cerrada" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>La ecuación de energía en una tubería; las líneas de energía y piezométrica; pérdidas por fricción y en accesorios; cómo una válvula controla el caudal y la presión; por qué una loma puede quedar con presión negativa; el diagrama de Moody y la diferencia entre Darcy-Weisbach y Hazen-Williams.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Darcy-Weisbach con el factor de Colebrook-White (resuelto por iteración) y Swamee-Jain (1976) para comparar; Hazen-Williams en el SI; viscosidad del agua de tablas (White, *Fluid Mechanics*). Rugosidades y coeficientes C típicos de Saldarriaga (2007), *Hidráulica de tuberías*. K de accesorios y de la válvula de compuerta según su apertura: valores típicos (Crane, TP-410). El caudal resuelve la ecuación de energía entre el tanque y la descarga a la atmósfera; las pruebas A1 a A4 verifican el cierre de la energía (menos de 1e-9 m).
        </p>
        <h3>Límites</h3>
        <p>La conducción es ilustrativa. No se calculan la entrada de aire ni el vaciado cuando la presión es negativa (se avisa). La temperatura del agua es 20 °C. Los K de la válvula son típicos: cada fabricante publica los suyos.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

function FrictionReading({ r, piezos, onResult }: { r: PipelineResult; piezos: { name: string; s: number; z: number; hgl: number }[]; onResult: (f: number) => void }) {
  const [pb, setPb] = useState('');
  const [pc, setPc] = useState('');
  const [res, setRes] = useState<{ f: number; hf: number } | null>(null);
  const B = piezos[1], C = piezos[2];
  const D = r.inp.D;
  const calc = () => {
    const b = Number(pb.replace(',', '.')), c = Number(pc.replace(',', '.'));
    if (!Number.isFinite(b) || !Number.isFinite(c) || r.V <= 0) return;
    const hf = B.z + b - (C.z + c);
    const f = (hf * D * 2 * G) / ((C.s - B.s) * r.V * r.V);
    setRes({ f, hf });
    onResult(f);
  };
  return (
    <div className="q3-exp">
      <p className="q3-small">
        Entre B y C el tubo es recto y no hay accesorios: lo que baja la línea piezométrica es solo fricción. Lee las presiones de B y C en la escena (o en Datos) y escríbelas. Con su diferencia de cotas piezométricas, la distancia ({es(C.s - B.s, 2)} m) y la velocidad ({es(r.V, 3)} m/s) se despeja f = hf·D·2g/(L·V²).
      </p>
      <div className="hc-read">
        <label htmlFor="ac-pb">Presión en B (m)</label>
        <input id="ac-pb" inputMode="decimal" value={pb} onChange={(e) => setPb(e.target.value)} />
        <label htmlFor="ac-pc">Presión en C (m)</label>
        <input id="ac-pc" inputMode="decimal" value={pc} onChange={(e) => setPc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && calc()} />
        <button type="button" className="btn btn-primary" onClick={calc}>
          Calcular
        </button>
      </div>
      {res && (
        <p className={Math.abs(res.f - r.f) / r.f < 0.05 ? 'q3-progress is-ok' : 'q3-progress'}>
          Pérdida entre B y C: {es(res.hf, 3)} m; tu f = {es(res.f, 4)}; Colebrook da {es(r.f, 4)} ({es((Math.abs(res.f - r.f) / r.f) * 100, 1)} % de diferencia).
        </p>
      )}
    </div>
  );
}

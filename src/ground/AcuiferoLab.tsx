// «El acuífero»: un acuífero libre entre una loma y un río, en un corte. El estudiante cambia el material y el desnivel
// del agua; el nivel freático sigue la parábola de Dupuit y unas partículas viajan a la velocidad del agua en los poros.
// La pregunta: ¿cuánta agua lleva el acuífero al río, y cuánto tarda en llegar?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { DupuitChart } from './charts';
import { GROUND_TOOLS, ROOM } from './design';
import { SOILS, type Soil } from './aquifer';
import { AQ, PERM, aquifer, permArea, permFlow, type AquiferScene, type AquiferResult } from './scene';
import { AquiferWorld } from './three/groundWorlds';

interface Ctx {
  s: AquiferScene;
  r: AquiferResult;
  Kmeas: { soil: Soil; K: number } | null;
}

const when = (d: number) => (d < 730 ? `${es(d, 0)} días` : `${es(d / 365, d > 36500 ? 0 : 1)} años`);

const RETOS: Reto<Ctx>[] = [
  {
    id: 'as-rapido',
    title: 'Un acuífero rápido',
    goal: 'Haz que el agua tarde menos de 100 días en ir de la loma al río.',
    hint: 'La velocidad es K·i/ne: los materiales gruesos dejan pasar el agua mucho más rápido.',
    check: (c) => c.r.travel < 100,
    progress: (c) => `Tiempo de viaje: ${when(c.r.travel)}`,
  },
  {
    id: 'as-lento',
    title: 'Agua de otro siglo',
    goal: 'Haz que el agua tarde más de 100 años en llegar al río.',
    hint: 'En los limos y las arcillas los poros son tan finos que el agua casi no se mueve.',
    check: (c) => c.r.travel > 36500,
    progress: (c) => `Tiempo de viaje: ${when(c.r.travel)}`,
  },
  {
    id: 'as-perm',
    title: 'Mide la conductividad',
    goal: 'Con el permeámetro de Experimentos, calcula la conductividad del material elegido con menos de 5 % de diferencia con la de la tabla.',
    hint: 'K = Q·L/(A·Δh). Pasa el caudal de mL/s a m³/s y el resultado de m/s a m/día (× 86 400).',
    check: (c) => !!c.Kmeas && Math.abs(c.Kmeas.K - SOILS[c.Kmeas.soil].K) / SOILS[c.Kmeas.soil].K < 0.05,
    progress: (c) => (c.Kmeas ? `Tu K = ${es(c.Kmeas.K, 3)} m/día` : 'Escribe tu cálculo en Experimentos.'),
  },
  {
    id: 'as-caudal',
    title: 'Un río bien alimentado',
    goal: 'Con arena gruesa, logra que el acuífero entregue al río 10 000 m³ por día o más por cada kilómetro.',
    hint: 'Según Dupuit, el caudal crece con la diferencia de los cuadrados de los niveles: sube el agua en la loma.',
    check: (c) => c.s.soil === 'arena' && c.r.Q >= 10000,
    progress: (c) => `${es(c.r.Q, 0)} m³/día por km`,
  },
];

export function AcuiferoLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<AquiferScene>({ soil: 'arena', dh: 6 });
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [Kmeas, setKmeas] = useState<Ctx['Kmeas']>(null);
  const r = useMemo(() => aquifer(s), [s]);
  const world = useRef<AquiferWorld | null>(null);
  const sync = useRef(r);
  sync.current = r;
  useEffect(() => world.current?.set(sync.current), [r]);
  const ctx = useMemo<Ctx>(() => ({ s, r, Kmeas }), [s, r, Kmeas]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<AquiferScene>) => setS((x) => ({ ...x, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.travel > 36500 ? 'mid' : 'ok';
  const answer = (
    <>
      En {SOILS[s.soil].name.toLowerCase()} (K = {es(r.K, r.K < 1 ? 4 : 0)} m/día), el acuífero entrega al río <strong>{es(r.Q, r.Q < 10 ? 2 : 0)} m³ por día</strong> por cada kilómetro de orilla. El agua que se infiltra junto a la loma tarda <strong>{when(r.travel)}</strong> en llegar al río: va a {es(r.v(AQ.L / 2), r.v(AQ.L / 2) < 0.01 ? 5 : 3)} m/día por los poros, más rápido cerca del río, donde el acuífero es más delgado.
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de un valle cortado: a la izquierda una loma, a la derecha un río. En el corte se ven el material del acuífero, la zona saturada en azul bajo el nivel freático, tres pozos de observación con su nivel de agua y partículas que viajan hacia el río a la velocidad del agua en los poros, en cámara rápida."
          viewNames={[
            { id: 'general', label: 'El valle' },
            { id: 'pozos', label: 'Los pozos' },
            { id: 'rio', label: 'El río' },
          ]}
          make={(st) => new AquiferWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <DupuitChart r={r} W={520} H={240} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Cuánta agua lleva el acuífero al río, y cuánto tarda en llegar?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`K = ${es(r.K, r.K < 1 ? 4 : 0)} m/día`, `${es(r.Q, r.Q < 10 ? 2 : 0)} m³/día por km`, `viaje ${when(r.travel)}`]}
        chart={<DupuitChart r={r} />}
        traces={[
          { key: 'q', label: 'Al río, por km', unit: 'm³/día', value: r.Q, digits: r.Q < 10 ? 3 : 0 },
          { key: 'v', label: 'Velocidad en los poros (mitad)', unit: 'm/día', value: r.v(AQ.L / 2), digits: r.v(AQ.L / 2) < 0.01 ? 6 : 3 },
        ]}
      />
      <DockChoice<Soil> label="Material del acuífero" value={s.soil} options={(Object.keys(SOILS) as Soil[]).map((k) => ({ value: k, label: SOILS[k].name }))} onChange={(v) => set({ soil: v })} />
      <DockRange label="Agua en la loma sobre el río" value={s.dh} min={2} max={15} step={0.5} show={`${es(s.dh, 1)} m`} onChange={(v) => set({ dh: v })} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <DupuitChart r={r} W={480} H={220} cls="hc-exp-svg cu-svg" />
        <h3>El agua subterránea también corre</h3>
        <p>
          Bajo el nivel freático, los poros de la arena o la grava están llenos de agua. Esa agua se mueve muy despacio desde donde el nivel está alto (la loma, donde se infiltra la lluvia) hacia donde está bajo (el río). La <strong>ley de Darcy</strong> dice que el caudal es proporcional a la conductividad del material K y a la pendiente del nivel: q = K·i.
        </p>
        <h3>La velocidad en los poros</h3>
        <p>El agua solo pasa por los poros conectados (la porosidad eficaz), así que va más rápido que q: v = q/ne. Aun así, en arena recorre centímetros a metros por día; en arcilla, milímetros por siglo. Por eso el agua de un acuífero puede tener décadas o milenios.</p>
        <p className="q3-small">El corte va a escala. Las partículas se mueven en cámara rápida (el rótulo dice cuántos días pasan por segundo).</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el material y el desnivel, y mide. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>El permeámetro de carga constante</h3>
        <Permeameter soil={s.soil} onResult={(K) => setKmeas({ soil: s.soil, K })} key={s.soil} />
      </div>
    ),
    diseno: <DesignTab part="acuifero" set={GROUND_TOOLS.acuifero} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El acuífero (ilustrativo)</caption>
          <tbody>
            <Row name="Material" value={SOILS[s.soil].name} note={`K = ${es(r.K, r.K < 1 ? 4 : 0)} m/día; ne = ${es(r.ne, 2)}`} />
            <Row name="Largo de la loma al río" value={`${AQ.L} m`} />
            <Row name="Nivel en la loma y en el río" value={`${es(r.h1, 1)} m y ${AQ.h2} m`} note="sobre la base impermeable" />
            <Row name="Gradiente medio" value={es(r.i, 4)} />
            <Row name="Caudal por metro de orilla" value={`${es(r.qx, 4)} m²/día`} note="Dupuit: K·(h1² − h2²)/(2L)" />
            <Row name="Caudal por kilómetro" value={`${es(r.Q, 2)} m³/día`} />
            <Row name="Velocidad en los poros" value={`${es(r.v(0), 5)} → ${es(r.v(AQ.L), 5)} m/día`} note="de la loma al río" />
            <Row name="Tiempo de viaje" value={when(r.travel)} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>La ley de Darcy; conductividad hidráulica y porosidad eficaz; descarga específica contra velocidad real; el nivel freático y la zona saturada; el flujo en un acuífero libre (Dupuit); los tiempos de residencia del agua subterránea; el permeámetro.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Darcy (1856); suposición de Dupuit-Forchheimer para el acuífero libre con base horizontal: q = K·(h1² − h2²)/(2L), h(x) = √(h1² − (h1² − h2²)·x/L); velocidad media en los poros v = q/(ne·h) y tiempo de viaje integrado por tramos. Conductividades y porosidades típicas de Freeze y Cherry (1979) y Fetter (2001). Pruebas S4, S5 y S8.
        </p>
        <h3>Límites</h3>
        <p>El acuífero es homogéneo e ilustrativo; no hay recarga a lo largo del tramo ni flujo vertical. Las partículas siguen la proporción de la altura saturada, una aproximación de las líneas de corriente de Dupuit.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

function Permeameter({ soil, onResult }: { soil: Soil; onResult: (K: number) => void }) {
  const [dh, setDh] = useState(0.5);
  const [txt, setTxt] = useState('');
  const [res, setRes] = useState<number | null>(null);
  const flow = permFlow(soil, dh);
  // lectura: volumen en una probeta durante un tiempo que deja leer al menos 50 mL
  const secs = flow > 0 ? Math.min(86400, Math.max(60, Math.ceil(50 / flow / 60) * 60)) : 60;
  const vol = Math.round(flow * secs * 10) / 10;
  const calc = () => {
    const v = Number(txt.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return;
    setRes(v);
    onResult(v);
  };
  return (
    <div className="q3-exp">
      <p className="q3-small">
        Columna de {es(PERM.L * 100, 0)} cm de {SOILS[soil].name.toLowerCase()} y {es(PERM.D * 100, 0)} cm de diámetro (A = {es(permArea() * 1e4, 2)} cm²), con una diferencia de carga Δh que se mantiene fija. En {secs >= 3600 ? `${es(secs / 3600, 1)} horas` : `${es(secs / 60, 0)} minutos`} la probeta recoge <strong>{es(vol, 1)} mL</strong>. Calcula K en m/día y escríbela.
      </p>
      <div className="hc-read">
        <label htmlFor="as-dh">Δh (m)</label>
        <input id="as-dh" type="range" min={0.1} max={1} step={0.05} value={dh} onChange={(e) => setDh(Number(e.target.value))} />
        <span>{es(dh, 2)} m</span>
      </div>
      <div className="hc-read">
        <label htmlFor="as-k">Tu K (m/día)</label>
        <input id="as-k" inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && calc()} />
        <button type="button" className="btn btn-primary" onClick={calc}>
          Comparar
        </button>
      </div>
      {res !== null && (
        <p className={Math.abs(res - SOILS[soil].K) / SOILS[soil].K < 0.05 ? 'q3-progress is-ok' : 'q3-progress'}>
          Tu K: {es(res, 4)} m/día; la de la tabla: {es(SOILS[soil].K, 4)} m/día ({es((Math.abs(res - SOILS[soil].K) / SOILS[soil].K) * 100, 1)} % de diferencia).
        </p>
      )}
      {soil === 'arcilla' || soil === 'limo' ? <p className="q3-small">En suelos finos el caudal es tan pequeño que se usa el permeámetro de carga variable (está en la pestaña Diseño, para universitarios).</p> : null}
    </div>
  );
}

// «La ladera pierde suelo»: una ladera de cultivo con su cobertura y sus prácticas. Cuando llueve, el agua arrastra
// tierra ladera abajo y la quebrada del pie se enturbia (RUSLE). La pregunta: ¿cuánto suelo se lleva la lluvia cada
// año, y cómo se protege la ladera?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { CoverChart } from './charts';
import { ROOM, SLOPE_TOOLS } from './design';
import { COVERS, PRACTICES, lsExponent, lsFactor, practiceP, sFactor, type Cover, type Practice } from './slope';
import { DEFAULT_EROSION, K_SOILS, R_FACTOR, T_TOL, erosionScene, type ErosionScene } from './scene';
import { ErosionWorld } from './three/slopeWorlds';

type R = ReturnType<typeof erosionScene>;
interface Ctx {
  s: ErosionScene;
  r: R;
  /** La misma ladera sin prácticas. */
  bare: R;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'la-tolerable',
    title: 'Empinada pero protegida',
    goal: `En una ladera de 40 % o más, deja la pérdida de suelo en la tolerable (${T_TOL} t/(ha·año)) o menos.`,
    hint: 'La cobertura pesa más que todo: lo que cubre el suelo frena las gotas y el agua que corre.',
    check: (c) => c.s.slopePct >= 40 && c.r.A <= T_TOL,
    progress: (c) => `${es(c.s.slopePct, 0)} %, ${es(c.r.A, 1)} t/(ha·año)`,
  },
  {
    id: 'la-pelada',
    title: 'La ladera pelada',
    goal: 'Encuentra una ladera de suelo desnudo que pierda 1 cm de suelo por año o más.',
    hint: 'Un centímetro por año parece poco, pero la capa fértil tarda siglos en formarse.',
    check: (c) => c.s.cover === 'desnudo' && c.r.mmYear >= 10,
    progress: (c) => `${es(c.r.mmYear, 1)} mm por año`,
  },
  {
    id: 'la-barreras',
    title: 'La mitad con prácticas',
    goal: 'En una ladera con cultivo limpio, usa una práctica de conservación que baje la pérdida a la mitad o menos.',
    hint: 'Sembrar en curvas de nivel ayuda poco en lo muy empinado; las barreras vivas y las terrazas cortan el agua que corre.',
    check: (c) => c.s.cover === 'cultivo' && c.s.practice !== 'ninguna' && c.r.A <= 0.5 * c.bare.A,
    progress: (c) => `sin prácticas ${es(c.bare.A, 0)}, ahora ${es(c.r.A, 0)} t/(ha·año)`,
  },
  {
    id: 'la-cultivo',
    title: 'Cultivar sin perder la tierra',
    goal: 'Con cultivo limpio, encuentra una ladera que pierda menos de 50 t/(ha·año).',
    hint: 'Menos pendiente, una ladera más corta y una buena práctica se multiplican entre sí.',
    check: (c) => c.s.cover === 'cultivo' && c.r.A < 50,
    progress: (c) => `${es(c.r.A, 0)} t/(ha·año)`,
  },
];

export function ErosionLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<ErosionScene>(DEFAULT_EROSION);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [rain, setRain] = useState(false);
  const r = useMemo(() => erosionScene(s), [s]);
  const bare = useMemo(() => erosionScene({ ...s, practice: 'ninguna' }), [s]);
  const world = useRef<ErosionWorld | null>(null);
  const sync = useRef({ s, r });
  sync.current = { s, r };
  const toWorld = () => world.current?.set({ slopePct: sync.current.s.slopePct, lambda: sync.current.s.lambda, cover: sync.current.s.cover, practice: sync.current.s.practice, A: sync.current.r.A, ok: sync.current.r.ok });
  useEffect(() => {
    toWorld();
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    world.current?.raining(rain ? 0.8 : 0);
    if (!rain) return;
    const id = window.setTimeout(() => setRain(false), 14000);
    return () => window.clearTimeout(id);
  }, [rain]);
  const ctx = useMemo<Ctx>(() => ({ s, r, bare }), [s, r, bare]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<ErosionScene>) => setS((x) => ({ ...x, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.A <= T_TOL ? 'ok' : r.A <= 5 * T_TOL ? 'mid' : 'bad';
  const answer = (
    <>
      La lluvia se lleva <strong>{es(r.A, r.A < 10 ? 1 : 0)} toneladas de suelo por hectárea al año</strong>, unos {es(r.mmYear, 2)} mm de la capa fértil.{' '}
      {r.ok ? 'Está dentro de lo tolerable: el suelo se forma más o menos igual de rápido.' : `Es ${es(r.A / T_TOL, 0)} veces lo tolerable (${T_TOL} t/(ha·año)).`} Lo que se pierde termina en la quebrada del pie.
    </>
  );
  const A0 = R_FACTOR * r.K * r.LS * r.P;

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una ladera de cultivo con su cobertura (suelo desnudo, maíz, café, pasto, rastrojo o bosque) y sus prácticas (surcos en curvas de nivel, barreras vivas o terrazas). Abajo corre una quebrada que se enturbia según la tierra que pierde la ladera; al llover, el lodo baja por la pendiente."
          viewNames={[
            { id: 'general', label: 'La ladera' },
            { id: 'surcos', label: 'El suelo' },
            { id: 'quebrada', label: 'La quebrada' },
          ]}
          make={(st) => new ErosionWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <CoverChart A0={A0} current={s.cover} T={T_TOL} W={520} H={240} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Cuánto suelo se lleva la lluvia cada año, y cómo se protege la ladera?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`${es(r.A, r.A < 10 ? 1 : 0)} t/(ha·año)`, `${es(r.mmYear, 2)} mm por año`, `LS ${es(r.LS, 2)}`]}
        chart={<CoverChart A0={A0} current={s.cover} T={T_TOL} />}
        traces={[
          { key: 'A', label: 'Pérdida de suelo', unit: 't/(ha·año)', value: r.A, digits: r.A < 10 ? 1 : 0, ref: { value: T_TOL, label: 'tolerable' } },
          { key: 'mm', label: 'Espesor perdido por año', unit: 'mm', value: r.mmYear, digits: 2 },
        ]}
      />
      <div className="hc-flood">
        {rain ? (
          <span className="hc-flood-q">lloviendo…</span>
        ) : (
          <button type="button" onClick={() => setRain(true)}>
            Que llueva
          </button>
        )}
      </div>
      <DockRange label="Pendiente" value={s.slopePct} min={5} max={80} step={1} show={`${es(s.slopePct, 0)} %`} onChange={(v) => set({ slopePct: v })} />
      <DockRange label="Largo de la ladera" value={s.lambda} min={10} max={150} step={5} show={`${es(s.lambda, 0)} m`} onChange={(v) => set({ lambda: v })} />
      <DockChoice label="Cobertura" value={s.cover} options={(Object.keys(COVERS) as Cover[]).map((k) => ({ value: k, label: COVERS[k].name.split(' (')[0] }))} onChange={(v) => set({ cover: v })} />
      <DockChoice label="Práctica" value={s.practice} options={(Object.keys(PRACTICES) as Practice[]).map((k) => ({ value: k, label: k === 'curvas' ? 'Curvas de nivel' : PRACTICES[k] }))} onChange={(v) => set({ practice: v })} />
      <DockChoice label="Suelo" value={s.soil} options={(Object.keys(K_SOILS) as (keyof typeof K_SOILS)[]).map((k) => ({ value: k, label: K_SOILS[k].name }))} onChange={(v) => set({ soil: v })} />
    </>
  );

  const S = sFactor(s.slopePct), m = lsExponent(s.slopePct), L = Math.pow(s.lambda / 22.13, m);
  const lambdas = [20, 40, 60, 100, 150];
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <CoverChart A0={A0} current={s.cover} T={T_TOL} W={480} H={200} cls="hc-exp-svg cu-svg" />
        <h3>Gotas que golpean y agua que arrastra</h3>
        <p>
          Cada gota de un aguacero golpea el suelo y suelta granos; el agua que corre por la ladera los arrastra y, al juntarse, abre <strong>surcos</strong>. Por eso pierde más suelo una ladera más empinada y más larga, un suelo más suelto y una lluvia más fuerte, y mucho menos una ladera cubierta.
        </p>
        <h3>Cómo se protege</h3>
        <p>La <strong>cobertura</strong> (pasto, rastrojo, bosque, el sombrío del café) frena las gotas y el agua. Las <strong>prácticas</strong> cortan el agua que corre: surcos en curvas de nivel, <strong>barreras vivas</strong> de plantas a lo ancho de la ladera o <strong>terrazas</strong>.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la ladera, la cobertura y las prácticas. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>El cálculo, factor por factor</h3>
        <p className="q3-small">A = R·K·LS·C·P. La parcela de referencia (22,13 m y 9 %) tiene LS ≈ 1: aquí da {es(lsFactor(22.13, 9), 3)}.</p>
        <table className="q3-table">
          <tbody>
            <Row name="Erosividad de la lluvia R" value={es(R_FACTOR, 0)} note="ilustrativa" />
            <Row name="Erodabilidad del suelo K" value={es(r.K, 3)} />
            <Row name="Pendiente S" value={es(S, 3)} />
            <Row name="Largo L = (λ/22,13)^m" value={`${es(L, 3)} (m = ${es(m, 3)})`} />
            <Row name="Cobertura C" value={es(r.C, 3)} />
            <Row name="Práctica P" value={es(r.P, 2)} />
            <Row name="Producto" value={`${es(R_FACTOR * r.K * S * L * r.C * r.P, 2)} t/(ha·año)`} note={`directo ${es(r.A, 2)}`} />
          </tbody>
        </table>
        <h3>¿Más larga, más pérdida?</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Largo</th>
              <th>LS</th>
              <th>Pérdida</th>
            </tr>
          </thead>
          <tbody>
            {lambdas.map((l) => {
              const x = erosionScene({ ...s, lambda: l });
              return (
                <tr key={l} className={l === s.lambda ? 'is-on' : ''}>
                  <td>{l} m</td>
                  <td>{es(x.LS, 2)}</td>
                  <td>{es(x.A, x.A < 10 ? 1 : 0)} t/(ha·año)</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h3>Las prácticas en esta pendiente</h3>
        <table className="q3-table">
          <tbody>
            {(Object.keys(PRACTICES) as Practice[]).map((p) => (
              <Row key={p} name={PRACTICES[p]} value={`P = ${es(practiceP(p, s.slopePct), 2)}`} note={`${es(erosionScene({ ...s, practice: p }).A, 0)} t/(ha·año)`} />
            ))}
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="erosion" set={SLOPE_TOOLS.erosion} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La ladera (ilustrativa; valores típicos)</caption>
          <tbody>
            <Row name="Erosividad de la lluvia R" value={`${es(R_FACTOR, 0)} MJ·mm/(ha·h·año)`} note="de una ladera andina, ilustrativa" />
            <Row name="Suelo" value={K_SOILS[s.soil].name} note={`K = ${K_SOILS[s.soil].K}`} />
            <Row name="Cobertura" value={COVERS[s.cover].name} note={`C = ${COVERS[s.cover].C}`} />
            <Row name="Pérdida tolerable usual" value={`${T_TOL} t/(ha·año)`} />
            <Row name="Densidad aparente del suelo" value="1,3 t/m³" note="para pasar de toneladas a milímetros" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Erosión por salpicadura, laminar y en surcos; el papel de la pendiente, el largo, el suelo, la cobertura y las prácticas; la pérdida tolerable; el sedimento que llega a las quebradas.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>Ecuación universal de pérdida de suelo revisada (RUSLE; Renard y otros, 1997) con los factores de pendiente y largo de McCool y otros (1987, 1989); factores C y P típicos (Wischmeier y Smith, 1978). Prueba L7.</p>
        <h3>Límites</h3>
        <p>Es un promedio anual de largo plazo, no lo que pasa en una tormenta; no calcula cuánto sedimento llega de verdad a la quebrada (parte queda en el camino) ni los movimientos en masa. Los valores de R, K, C y P son típicos e ilustrativos: un estudio real los mide o los toma de la región.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

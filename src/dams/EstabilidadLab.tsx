// «La presa»: una presa de gravedad de concreto resiste el empuje del agua con su propio peso. El estudiante sube el
// embalse, cambia el talud, la fricción con la roca y los drenes; las fuerzas, la resultante y los esfuerzos de la base
// se ven en la maqueta. La pregunta: ¿aguanta la presa sin volcarse ni deslizar?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { tiny } from './fmt';
import { StabilityDiagram } from './charts';
import { DAM_TOOLS, FS_MIN, ROOM } from './design';
import { stability, type GravityDam, type StabilityResult } from './dam';
import { DEFAULT_DAM } from './scene';
import { GravityWorld } from './three/damWorlds';

/** Subpresión que queda en el talón con la galería de drenes (fracción de γ·hw). */
const DRAINED = 0.33;

interface Ctx {
  d: GravityDam;
  r: StabilityResult;
  drains: boolean;
  /** El mismo caso sin drenes. */
  r0: StabilityResult;
}

const ok = (r: StabilityResult) => r.FSo >= FS_MIN && r.FSs >= FS_MIN && r.inThird;

/** Nivel del embalse (m) con el que el factor de deslizamiento baja a `fs` (bisección; null si nunca baja). */
function levelFor(d: GravityDam, fs: number): number | null {
  const f = (hw: number) => stability({ ...d, hw }).FSs - fs;
  if (f(d.H) > 0) return null;
  let lo = 0.5, hi = d.H;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'pe-lleno',
    title: 'El embalse lleno',
    goal: `Con el agua hasta la corona, logra los tres criterios (volcamiento y deslizamiento de ${es(FS_MIN, 1)} o más, resultante en el tercio medio) con un talud de 0,70 o menos.`,
    hint: 'Un talud más esbelto pesa menos. Lo que le quita la subpresión se puede recuperar.',
    check: (c) => c.d.hw >= c.d.H - 0.01 && c.d.m <= 0.7 + 1e-9 && ok(c.r),
    progress: (c) => `Agua ${es(c.d.hw, 1)} m, talud ${es(c.d.m, 2)}; volcamiento ${es(c.r.FSo, 2)}, deslizamiento ${es(c.r.FSs, 2)}`,
  },
  {
    id: 'pe-drenes',
    title: 'Lo que hacen los drenes',
    goal: `Encuentra un caso en el que, sin drenes, la presa no llega a ${es(FS_MIN, 1)} al deslizamiento y, con drenes, sí.`,
    hint: 'Los drenes dejan salir el agua que se filtra bajo la presa: la subpresión baja y la presa «pesa» más sobre la roca.',
    check: (c) => c.drains && c.r.FSs >= FS_MIN && c.r0.FSs < FS_MIN,
    progress: (c) => `Sin drenes ${es(c.r0.FSs, 2)}; con drenes ${es(stability({ ...c.d, uplift: DRAINED }).FSs, 2)}`,
  },
  {
    id: 'pe-traccion',
    title: 'Tracción en el talón',
    goal: 'Haz que la resultante salga del tercio medio: el talón (aguas arriba) queda en tracción.',
    hint: 'El concreto casi no resiste tracción: se abriría una grieta en el talón, el agua entraría y la subpresión crecería.',
    check: (c) => !c.r.inThird && c.r.sHeel < 0,
    progress: (c) => `Esfuerzo en el talón ${es(c.r.sHeel, 0)} kPa`,
  },
  {
    id: 'pe-desliza',
    title: 'La presa desliza',
    goal: 'Encuentra un caso en el que el agua empuje más de lo que la fricción con la roca resiste (deslizamiento menor de 1).',
    hint: 'La fricción depende del peso que queda sobre la roca: menos concreto, más subpresión o una roca más lisa.',
    check: (c) => c.r.FSs < 1,
    progress: (c) => `Deslizamiento ${es(c.r.FSs, 2)}`,
  },
];

export function EstabilidadLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [d, setD] = useState<GravityDam>(DEFAULT_DAM);
  const [drains, setDrains] = useState(false);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const dd = useMemo(() => ({ ...d, uplift: drains ? DRAINED : 1 }), [d, drains]);
  const r = useMemo(() => stability(dd), [dd]);
  const r0 = useMemo(() => stability({ ...dd, uplift: 1 }), [dd]);
  const world = useRef<GravityWorld | null>(null);
  const sync = useRef({ dd, r, drains });
  sync.current = { dd, r, drains };
  useEffect(() => {
    world.current?.set(dd, r, drains);
  }, [dd, r, drains]);
  const ctx = useMemo<Ctx>(() => ({ d: dd, r, drains, r0 }), [dd, r, drains, r0]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<GravityDam>) => setD((x) => ({ ...x, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.FSs < 1 || r.FSo < 1 ? 'bad' : ok(r) ? 'ok' : 'mid';
  const answer = (
    <>
      Contra el volcamiento, la presa tiene un factor de <strong>{es(r.FSo, 2)}</strong>; contra el deslizamiento, <strong>{es(r.FSs, 2)}</strong> (se pide {es(FS_MIN, 1)} o más). La resultante cae a {es(r.xR, 1)} m del talón,{' '}
      {r.inThird ? 'dentro del tercio medio: toda la base está en compresión.' : 'fuera del tercio medio: el talón queda en tracción.'}{' '}
      {r.FSs < 1 ? 'La fricción no alcanza: la presa deslizaría.' : ok(r) ? 'Cumple los tres criterios.' : 'No cumple todos los criterios.'}
    </>
  );
  const fs15 = useMemo(() => levelFor(dd, FS_MIN), [dd]);
  const fs1 = useMemo(() => levelFor(dd, 1), [dd]);
  const levels = [10, 15, 20, 25, 30].filter((h) => h <= d.H).map((hw) => ({ hw, r: stability({ ...dd, hw }) }));
  const sumV = r.forces.reduce((a, f) => a + f.Fy, 0);
  const sumBase = ((r.sHeel + r.sToe) / 2) * r.B;

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una presa de gravedad de concreto sobre roca, con el embalse a un lado. Flechas muestran el peso, el empuje del agua y la subpresión; bajo la base se ven los esfuerzos y el tercio medio."
          viewNames={[
            { id: 'general', label: 'La presa' },
            { id: 'base', label: 'La base' },
            { id: 'frente', label: 'De frente' },
          ]}
          make={(st) => new GravityWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current.dd, sync.current.r, sync.current.drains);
          }}
        />
      ) : (
        <FlatStage>
          <StabilityDiagram d={dd} r={r} W={520} H={280} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Aguanta la presa el empuje del agua sin volcarse ni deslizar?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`volcamiento ${es(r.FSo, 2)}`, `deslizamiento ${es(r.FSs, 2)}`, r.inThird ? 'en el tercio medio' : 'fuera del tercio']}
        chart={<StabilityDiagram d={dd} r={r} />}
        traces={[
          { key: 'o', label: 'Factor contra el volcamiento', unit: '', value: r.FSo, digits: 2, ref: { value: FS_MIN, label: 'mínimo' } },
          { key: 's', label: 'Factor contra el deslizamiento', unit: '', value: r.FSs, digits: 2, ref: { value: FS_MIN, label: 'mínimo' } },
        ]}
      />
      <DockRange label="Agua en el embalse" value={d.hw} min={0} max={d.H} step={0.5} show={`${es(d.hw, 1)} m`} onChange={(v) => set({ hw: v })} />
      <DockRange label="Talud aguas abajo (H:V)" value={d.m} min={0.5} max={1} step={0.05} show={`${es(d.m, 2)}:1`} onChange={(v) => set({ m: v })} />
      <DockRange label="Fricción concreto-roca" value={d.mu} min={0.5} max={0.8} step={0.05} show={es(d.mu, 2)} onChange={(v) => set({ mu: v })} />
      <DockRange label="Agua aguas abajo" value={d.tail} min={0} max={8} step={0.5} show={`${es(d.tail, 1)} m`} onChange={(v) => set({ tail: v })} />
      <DockChoice
        label="Galería de drenes"
        value={drains ? 'si' : 'no'}
        options={[
          { value: 'no', label: 'Sin drenes' },
          { value: 'si', label: 'Con drenes' },
        ]}
        onChange={(v) => setDrains(v === 'si')}
      />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <StabilityDiagram d={dd} r={r} W={480} H={250} cls="hc-exp-svg cu-svg" />
        <h3>Peso contra empuje</h3>
        <p>
          El agua empuja la cara de aguas arriba con una fuerza que crece con el cuadrado de su altura (γ·h²/2). La presa resiste con su <strong>peso</strong>: contra el <strong>volcamiento</strong> alrededor de la punta, y contra el <strong>deslizamiento</strong> por la fricción con la roca. El agua que se filtra bajo la base empuja hacia arriba (<strong>subpresión</strong>) y le quita peso efectivo.
        </p>
        <h3>El tercio medio</h3>
        <p>Si la resultante de todas las fuerzas cae en el tercio central de la base, toda la base queda comprimida. Si se sale hacia aguas abajo, el talón queda en tracción, y el concreto casi no la resiste.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Sube el agua, cambia la sección y los drenes. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Las fuerzas, una por una</h3>
        <p className="q3-small">Por metro de presa. Momentos respecto a la punta (pie aguas abajo); positivos los que resisten.</p>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Fuerza</th>
              <th>Horizontal</th>
              <th>Vertical</th>
              <th>Momento</th>
            </tr>
          </thead>
          <tbody>
            {r.forces.map((f) => (
              <tr key={f.name}>
                <td>{f.name}</td>
                <td>{f.Fx ? `${es(f.Fx, 0)} kN` : '—'}</td>
                <td>{f.Fy ? `${es(f.Fy, 0)} kN` : '—'}</td>
                <td>{es(f.Fy * (r.B - f.x) - f.Fx * f.y, 0)} kN·m</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Comprobación del equilibrio</h3>
        <table className="q3-table">
          <tbody>
            <Row name="Suma de las fuerzas verticales" value={`${es(sumV, 0)} kN`} />
            <Row name="Lo que la base empuja de vuelta, (σtalón + σpunta)/2·B" value={`${es(sumBase, 0)} kN`} note={`diferencia ${tiny(Math.abs(sumV - sumBase) / Math.max(1, sumV))}`} />
            <Row name="Excentricidad e y límite B/6" value={`${es(r.e, 2)} m y ${es(r.B / 6, 2)} m`} />
            <Row name={`Agua con la que el deslizamiento baja a ${es(FS_MIN, 1)}`} value={fs15 === null ? `nunca, ni llena` : `${es(fs15, 2)} m`} />
            <Row name="Agua con la que la presa deslizaría" value={fs1 === null ? 'nunca, ni llena' : `${es(fs1, 2)} m`} />
          </tbody>
        </table>
        <h3>A medida que sube el agua</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Agua</th>
              <th>Volcamiento</th>
              <th>Deslizamiento</th>
              <th>Talón</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.hw} className={Math.abs(l.hw - d.hw) < 0.25 ? 'is-on' : ''}>
                <td>{l.hw} m</td>
                <td>{es(l.r.FSo, 2)}</td>
                <td>{es(l.r.FSs, 2)}</td>
                <td>{es(l.r.sHeel, 0)} kPa</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="estabilidad" set={DAM_TOOLS.estabilidad} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La presa (ilustrativa)</caption>
          <tbody>
            <Row name="Altura" value={`${d.H} m`} />
            <Row name="Corona" value={`${d.crest} m`} />
            <Row name="Base" value={`${es(r.B, 2)} m`} note="corona + talud × altura" />
            <Row name="Peso específico del concreto" value="23,5 kN/m³" />
            <Row name="Peso específico del agua" value="9,81 kN/m³" />
            <Row name="Subpresión en el talón" value={drains ? `${DRAINED * 100} % de γ·h (con drenes)` : '100 % de γ·h (sin drenes)'} note="lineal hasta el agua de abajo" />
            <Row name="Cohesión" value="0 (solo fricción)" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Equilibrio de un cuerpo rígido; el empuje hidrostático y su punto de aplicación; la subpresión y el efecto de los drenes; factores de seguridad al volcamiento y al deslizamiento; la regla del tercio medio y la distribución lineal de esfuerzos σ = V/B·(1 ± 6e/B).</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>Método clásico de la presa de gravedad por metro de longitud, con momentos respecto a la punta (USBR, Design of Small Dams; Novak y otros, Hydraulic Structures). Verificado a mano con una sección triangular y con la suma de fuerzas y esfuerzos (pruebas D4 y D5).</p>
        <h3>Límites</h3>
        <p>
          Sección 2D, sin sismo, sin sedimentos, sin presión del hielo y sin cohesión. Si el talón queda en tracción, la distribución lineal deja de valer (se abriría una grieta y la subpresión crecería): aquí solo se señala. El agua no supera la corona. Los factores mínimos son criterios usuales de enseñanza, no los de una norma; la presa es ilustrativa.
        </p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

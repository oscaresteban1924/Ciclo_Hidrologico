// «El canal y su caudal»: flujo uniforme con la ecuación de Manning. Se escogen la forma, el material, la pendiente
// y el caudal; la escena muestra el agua a la profundidad normal, la velocidad con un flotador y lo que pasa si el
// canal se desborda, se erosiona, se llena de arena o hace olas. La pregunta: ¿cabe el agua y el canal aguanta?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { useTime } from '../quality/lensKit';
import { DesignTab } from './design';
import { FlatStage, Row, SlopeRange, es } from './common';
import { SectionDiagram } from './diagrams';
import { DEFAULT_UNIFORM, FREEBOARD_FRAC, G, MATERIALS, NEAR_CRITICAL, PIPE_FILL, SHAPES, VMIN, geom, manningQ, uniformModel, type Material, type Shape, type UniformInput, type UniformResult } from './hydraulics';
import { UniformWorld } from './three/uniformWorld';

interface Ctx {
  inp: UniformInput;
  r: UniformResult;
  sawErosion: boolean;
  bestShape: boolean;
  stone: boolean;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'hc-cabe',
    title: 'Que quepa y aguante',
    goal: 'Con 4 m³/s o más, logra un canal donde el agua quepa con su borde libre, no erosione el fondo, no deje arena y no haga olas.',
    hint: 'Si se desborda, dale más pendiente o un material más liso. Si va muy rápido, el Froude se acerca a 1 y hace olas: a veces conviene ir despacio y profundo.',
    check: (c) => c.inp.Q >= 4 && c.r.ok,
    progress: (c) => (c.inp.Q < 4 ? `Sube el caudal a 4 m³/s (ahora ${es(c.inp.Q, 1)}).` : c.r.ok ? 'Listo.' : 'Mira la pregunta de la escena: dice qué falta.'),
  },
  {
    id: 'hc-rapido',
    title: 'Más rápido que sus ondas',
    goal: 'Haz que el agua corra con Froude mayor que 1,2 sin desbordarse, y tira una piedra en el experimento para ver que las ondas ya no pueden subir.',
    hint: 'El Froude compara la velocidad del agua con la de las ondas (√(g·D)). Con más pendiente y concreto, el agua va rápida y poco profunda.',
    check: (c) => c.r.F > NEAR_CRITICAL[1] && !c.r.overflow && c.stone,
    progress: (c) => `Froude ${es(c.r.F)}${c.stone ? '' : ' · falta tirar la piedra (Experimentos)'}`,
  },
  {
    id: 'hc-tierra',
    title: 'Un canal de tierra que no se lava',
    goal: 'Mira cómo el agua arranca el fondo de un canal de tierra. Después, con tierra y 1,5 m³/s o más, logra que todo quede bien.',
    hint: 'La tierra aguanta hasta unos 0,76 m/s (Fortier y Scobey), pero por debajo de 0,6 m/s se deposita arena: hay que quedar en medio. La pendiente manda.',
    check: (c) => c.sawErosion && c.inp.material === 'tierra' && c.inp.Q >= 1.5 && c.r.ok,
    progress: (c) => (c.sawErosion ? `Velocidad ${es(c.r.V)} m/s (entre 0,60 y 0,76)` : 'Pon el canal de tierra con mucha pendiente.'),
  },
  {
    id: 'hc-tubo',
    title: 'El tubo casi lleno lleva más',
    goal: 'En el tubo, haz pasar más agua que la que llevaría completamente lleno, sin que entre en presión.',
    hint: 'Cerca del techo, el perímetro mojado crece más rápido que el área: el tubo lleva su máximo con el agua al 94 % del diámetro.',
    check: (c) => c.inp.shape === 'circ' && !Number.isNaN(c.r.yn) && c.inp.Q > c.r.Qfull,
    progress: (c) => (c.inp.shape === 'circ' ? `Lleno llevaría ${es(c.r.Qfull, 2)} m³/s; con superficie libre, hasta ${es(c.r.Qbrim, 2)}` : 'Escoge el tubo.'),
  },
  {
    id: 'hc-forma',
    title: 'La mejor forma',
    goal: 'En el experimento «La mejor forma», encuentra el ancho que lleva más agua con la misma área.',
    hint: 'Lleva más el que roza menos: el que tiene menos perímetro mojado para la misma área.',
    check: (c) => c.bestShape,
  },
];

const LO = 0.0002, HI = 0.08;

export function UniformLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const { state } = useStore();
  const [inp, setInp] = useState<UniformInput>(DEFAULT_UNIFORM);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [sawErosion, setSawErosion] = useState(false);
  const [bestShape, setBestShape] = useState(false);
  const [stone, setStone] = useState(false);
  const r = useMemo(() => uniformModel(inp), [inp]);
  const world = useRef<UniformWorld | null>(null);
  const sync = useRef({ inp, r });
  sync.current = { inp, r };
  useEffect(() => world.current?.set(sync.current), [inp, r]);
  useEffect(() => {
    if (inp.material === 'tierra' && r.erosion) setSawErosion(true);
  }, [inp, r]);
  const ctx = useMemo<Ctx>(() => ({ inp, r, sawErosion, bestShape, stone }), [inp, r, sawErosion, bestShape, stone]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<UniformInput>) => setInp((s) => ({ ...s, ...p, ...(p.shape === 'circ' ? { material: 'concreto' as Material } : {}) }));
  const s = SHAPES[inp.shape];
  const pressure = Number.isNaN(r.yn);
  const problems: string[] = [];
  if (pressure) problems.push('el tubo no alcanza: trabajaría lleno, a presión');
  else if (r.overflow) problems.push('se desborda');
  else if (!r.freeboardOk) problems.push(s.shape === 'circ' ? `el agua pasa del ${Math.round(PIPE_FILL * 100)} % del tubo` : 'queda muy poco borde libre');
  if (r.erosion) problems.push(`el agua va a ${es(r.V)} m/s y arranca el fondo de ${MATERIALS[inp.material].name.toLowerCase()}`);
  if (r.sediment) problems.push(`va a solo ${es(r.V)} m/s: se deposita arena`);
  if (r.unstable) problems.push(`el Froude (${es(r.F)}) está cerca de 1: la superficie hace olas`);
  const tone: 'ok' | 'mid' | 'bad' = r.ok ? 'ok' : pressure || r.overflow ? 'bad' : 'mid';
  const answer = r.ok
    ? `Sí: el agua va a ${es(r.yn)} m de profundidad y ${es(r.V)} m/s (${r.F < 1 ? 'flujo lento, subcrítico' : 'flujo rápido, supercrítico'}), con borde libre y sin dañar el canal.`
    : `Todavía no: ${problems.join('; ')}.`;

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Canal recto en 3D, cortado al frente para ver su sección: el agua va a la profundidad normal calculada con la ecuación de Manning. Un flotador naranja corre con la superficie."
          viewNames={[
            { id: 'general', label: 'El canal' },
            { id: 'corte', label: 'La sección' },
            { id: 'arriba', label: 'Desde arriba' },
          ]}
          make={(st) => new UniformWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <SectionDiagram inp={inp} r={r} />
        </FlatStage>
      )}
      <Question q="¿Cabe el agua sin desbordarse y el canal aguanta?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <DockChoice<Shape>
        label="Forma"
        value={inp.shape}
        options={[
          { value: 'rect', label: 'Rectangular' },
          { value: 'trap', label: 'Trapecial' },
          { value: 'circ', label: 'Tubo' },
        ]}
        onChange={(v) => set({ shape: v })}
      />
      {inp.shape !== 'circ' && (
        <DockChoice<Material>
          label="Material"
          value={inp.material}
          options={(Object.keys(MATERIALS) as Material[]).map((m) => ({ value: m, label: MATERIALS[m].name }))}
          onChange={(v) => set({ material: v })}
        />
      )}
      <SlopeRange value={inp.S} lo={LO} hi={HI} onChange={(S) => set({ S })} />
      <DockRange label="Caudal" value={inp.Q} min={0.1} max={20} step={0.1} show={`${es(inp.Q, 1)} m³/s`} onChange={(v) => set({ Q: Math.round(v * 10) / 10 })} />
    </>
  );

  const g = pressure ? null : geom(s, r.yn);
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <SectionDiagram inp={inp} r={r} />
        <h3>La profundidad normal</h3>
        <p>
          En un canal largo y recto, el agua acelera hasta que el roce con las paredes y el fondo frena justo lo que la pendiente la empuja. Desde ahí corre siempre a la misma profundidad: la <strong>profundidad normal</strong>. La ecuación de Manning la relaciona con el caudal: Q = A · R<sup>2/3</sup> · S<sup>1/2</sup> / n, con A el área mojada, R el radio hidráulico (área sobre perímetro mojado), S la pendiente y n la rugosidad del material ({MATERIALS[inp.material].name.toLowerCase()}: n = {es(MATERIALS[inp.material].n, 3)}).
        </p>
        <h3>Lento o rápido: el número de Froude</h3>
        <p>
          F = V / √(g·D) compara la velocidad del agua con la de una onda pequeña (D es la profundidad hidráulica, área sobre ancho de la superficie). Con F menor que 1 (subcrítico) las ondas pueden subir contra la corriente; con F mayor que 1 (supercrítico) el agua las arrastra. Cerca de 1 la superficie se vuelve inestable y hace olas.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Mueve los controles de abajo y mira el agua del canal. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Tira una piedra</h3>
        <StoneWaves r={r} reduced={state.prefs.reducedMotion} onThrow={() => setStone(true)} />
        <h3>La mejor forma</h3>
        <BestShape inp={inp} onBest={() => setBestShape(true)} />
      </div>
    ),
    diseno: <DesignTab part="canal" />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El canal con el agua a la profundidad normal</caption>
          <tbody>
            <Row name="Caudal" value={`${es(inp.Q, 2)} m³/s`} />
            <Row name="Pendiente" value={`${es(inp.S * 100, 3)} %`} />
            <Row name="Rugosidad n" value={es(r.n, 3)} note={MATERIALS[inp.material].note} />
            <Row name="Profundidad normal" value={pressure ? 'no hay (a presión)' : `${es(r.yn, 3)} m`} />
            <Row name="Profundidad crítica" value={`${es(r.yc, 3)} m`} note="con ella, Froude = 1" />
            <Row name="Área mojada" value={g ? `${es(g.A, 3)} m²` : '—'} />
            <Row name="Perímetro mojado" value={g ? `${es(g.P, 3)} m` : '—'} />
            <Row name="Radio hidráulico" value={g ? `${es(g.R, 3)} m` : '—'} />
            <Row name="Ancho de la superficie" value={g ? `${es(g.T, 3)} m` : '—'} />
            <Row name="Velocidad media" value={`${es(r.V, 2)} m/s`} note={MATERIALS[inp.material].vmax ? `máxima sin erosión: ${es(MATERIALS[inp.material].vmax!, 2)} m/s; mínima sin arena: ${es(VMIN, 1)}` : `mínima sin arena: ${es(VMIN, 1)} m/s`} />
            <Row name="Número de Froude" value={es(r.F, 2)} note={r.regime === 'subcritico' ? 'subcrítico (lento)' : r.regime === 'supercritico' ? 'supercrítico (rápido)' : 'crítico'} />
            <Row name="Esfuerzo cortante en el fondo" value={`${es(r.tau, 1)} Pa`} note="γ · R · S" />
            <Row name="Caudal que cabe con borde libre" value={`${es(r.Qcap, 2)} m³/s`} note={s.shape === 'circ' ? `agua hasta ${Math.round(PIPE_FILL * 100)} % del diámetro` : `borde libre de ${Math.round(FREEBOARD_FRAC * 100)} % de la profundidad`} />
            <Row name={s.shape === 'circ' ? 'Máximo con superficie libre' : 'Caudal hasta el borde'} value={`${es(r.Qbrim, 2)} m³/s`} />
            {s.shape === 'circ' && <Row name="Tubo completamente lleno" value={`${es(r.Qfull, 2)} m³/s`} />}
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>
          Flujo uniforme: la profundidad normal sale de igualar la fuerza de la pendiente con la fricción (Manning). Con la forma, el material, la pendiente y el caudal se ven las ideas de radio hidráulico, rugosidad, régimen subcrítico y supercrítico (número de Froude), velocidad que erosiona o que deja sedimentos, borde libre y el máximo de un tubo parcialmente lleno.
        </p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Geometría exacta de las secciones; profundidad normal y crítica por bisección (pruebas H1 a H4). Coeficientes n «normales» de la tabla de Chow (1959): concreto con acabado de llana 0,013; mampostería de piedra con mortero 0,025; tierra recta y limpia 0,022; con pasto corto 0,027; grava gruesa y cantos 0,040. Velocidades máximas con agua limpia de Fortier y Scobey (1926), citadas por Chow: tierra firme (franco) 0,76 m/s; cantos 1,52 m/s; pasto (bermuda, suelo resistente, pendiente de 0 a 5 %, Servicio de Conservación de Suelos de EE. UU.) 1,8 m/s. Para el concreto y la piedra pegada el juego no revisa erosión. Velocidad mínima para no dejar sedimentos: 0,6 m/s (Chow: 0,6 a 0,9 m/s con poco limo).
        </p>
        <h3>Reglas del juego</h3>
        <p>
          Borde libre: al menos el {Math.round(FREEBOARD_FRAC * 100)} % de la profundidad y 0,1 m (Chow cita entre 5 y 30 %). Tubo: el agua hasta el {Math.round(PIPE_FILL * 100)} % del diámetro. Flujo inestable con Froude entre {es(NEAR_CRITICAL[0], 1)} y {es(NEAR_CRITICAL[1], 1)}. El perfil de velocidades del esquema es la forma típica (ley de potencia 1/7), no un cálculo de este canal; la velocidad media suele estar a 0,6 de la profundidad medida desde la superficie y la de la superficie es cerca de 1/0,85 de la media. Si el canal se desborda, la escena solo indica que el agua sale: el cálculo no la sigue afuera.
        </p>
        <h3>Para conversar</h3>
        <p>
          ¿Por qué un canal de tierra necesita tan poca pendiente? ¿Por qué un tubo casi lleno lleva más agua que lleno? ¿Qué pasa con el Froude cuando el canal se vuelve más empinado? En Medellín muchas quebradas pasan por canales revestidos: ¿qué ventajas y qué problemas trae revestirlas?
        </p>
        <p className="q3-small">Los canales de esta parte son ilustrativos: no son diseños de ingeniería ni representan un canal de Medellín.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

/** Ondas de una piedra: se abren a √(g·D) y la corriente las arrastra a V (vista desde arriba). */
function StoneWaves({ r, reduced, onThrow }: { r: UniformResult; reduced: boolean; onThrow: () => void }) {
  const t = useTime();
  const [t0, setT0] = useState<number | null>(null);
  const c = Math.sqrt(G * Math.max(0.01, r.A / Math.max(0.01, r.T)));
  const V = r.V;
  const k = 22; // px por m
  const dt = t0 === null ? (reduced ? 2 : 0) : reduced ? 2 : Math.min(3, t - t0);
  const show = t0 !== null || reduced;
  const x0 = 260;
  return (
    <div className="q3-exp">
      <svg viewBox="0 0 480 150" className="hc-exp-svg" role="img" aria-label={`Vista desde arriba: ondas de una piedra en agua que corre a ${es(V)} m/s; las ondas se abren a ${es(c)} m/s.`}>
        <rect x="0" y="20" width="480" height="110" fill="#bfe0f0" />
        <rect x="0" y="10" width="480" height="10" fill="#9a958b" />
        <rect x="0" y="130" width="480" height="10" fill="#9a958b" />
        {[...Array(6)].map((_, i) => (
          <path key={i} d={`M${((i * 90 + t * 40 * Math.min(4, V)) % 520) - 40} ${40 + (i % 3) * 30} h26 l-6 -4 m6 4 l-6 4`} fill="none" stroke="#2f7fb0" strokeWidth="1.5" opacity="0.6" />
        ))}
        {show &&
          [0, 0.4, 0.8].map((d) => {
            const tt = Math.max(0, dt - d);
            if (tt <= 0) return null;
            const R = c * tt * k;
            const cx = x0 + V * tt * k;
            return <ellipse key={d} cx={cx} cy="75" rx={R} ry={Math.min(R, 52)} fill="none" stroke="#17324d" strokeWidth="1.6" opacity={Math.max(0.15, 1 - tt / 3)} />;
          })}
        <circle cx={x0} cy="75" r="4" fill="#5b4a3a" />
        <text x="8" y="146" className="lz-s" fill="#17324d">
          corriente →
        </text>
      </svg>
      <p className="q3-small">
        La onda se abre a √(g·D) = {es(c)} m/s y la corriente la lleva a {es(V)} m/s.{' '}
        {c > V ? `Aguas arriba avanza a ${es(c - V)} m/s: el flujo es subcrítico (F = ${es(r.F)}).` : `Aguas arriba no avanza: el flujo es supercrítico (F = ${es(r.F)}) y todo se va hacia abajo.`}
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          setT0(t);
          onThrow();
        }}
      >
        Tirar una piedra
      </button>
    </div>
  );
}

/** Canal rectangular con la misma área: ¿qué ancho lleva más agua? (sección hidráulica óptima: b = 2y). */
function BestShape({ inp, onBest }: { inp: UniformInput; onBest: () => void }) {
  const A = 2;
  const [b, setB] = useState(4);
  const y = A / b;
  const n = MATERIALS[inp.shape === 'circ' ? 'concreto' : inp.material].n;
  const sec = { shape: 'rect' as const, b, z: 0, D: 0, H: 99 };
  const Q = manningQ(sec, n, inp.S, y);
  const Qbest = manningQ({ ...sec, b: 2 }, n, inp.S, 1);
  const best = Math.abs(b - 2 * y) / b <= 0.05;
  useEffect(() => {
    if (best) onBest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best]);
  const k = 32;
  return (
    <div className="q3-exp">
      <svg viewBox="0 0 480 150" className="hc-exp-svg" role="img" aria-label={`Canal rectangular de ${es(b)} m de ancho con 2 m² de agua: lleva ${es(Q)} m³/s.`}>
        <rect x={240 - (b * k) / 2 - 6} y={130 - Math.min(4, y) * k - 6} width={b * k + 12} height={Math.min(4, y) * k + 12} fill="#bdb8ae" />
        <rect x={240 - (b * k) / 2} y={130 - Math.min(4, y) * k} width={b * k} height={Math.min(4, y) * k} fill="#4f9fd2" />
        <rect x="20" y="138" width={(Q / Qbest) * 200} height="8" fill={best ? '#2f8f55' : '#2f7fb0'} />
        <text x="20" y="132" className="lz-s" fill="#17324d">{`lleva ${es(Q)} m³/s (${Math.round((Q / Qbest) * 100)} % del mejor)`}</text>
      </svg>
      <div className="q3-range">
        <label htmlFor="hc-best-b">
          <span className="q3-dlabel">Ancho del canal</span>
          <output htmlFor="hc-best-b">{`${es(b)} m · profundidad ${es(y)} m`}</output>
        </label>
        <input id="hc-best-b" type="range" min={0.5} max={6} step={0.05} value={b} onChange={(e) => setB(Number(e.target.value))} />
      </div>
      <p className="q3-small">Siempre 2 m² de agua, con la pendiente y el material de arriba. {best ? 'Este es el mejor: el ancho es el doble de la profundidad (medio cuadrado). Así el perímetro que roza es el más corto.' : 'Prueba otros anchos.'}</p>
    </div>
  );
}

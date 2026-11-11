// «La caída y el resalto»: el agua baja por una rápida, llega muy rápida al pozo y allí da un salto (el resalto
// hidráulico) en el que pierde gran parte de su energía. El vertedero al final del pozo fija la profundidad del
// pozo: si es muy bajo, el resalto se sale y erosiona el canal de abajo; si es muy alto, se ahoga. La pregunta:
// ¿el pozo atrapa el resalto?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from './design';
import { FlatStage, FloodPlayer, Row, es } from './common';
import { JumpDiagram } from './diagrams';
import { CHUTE, DEFAULT_JUMP, G, JUMP_NAME, jumpModel, type JumpInput, type JumpKind, type JumpResult } from './hydraulics';
import { JumpWorld } from './three/jumpWorld';

interface Ctx {
  inp: JumpInput;
  r: JumpResult;
  sawBarrido: boolean;
  critical: boolean;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'hc-atrapa',
    title: 'Atrapa el resalto',
    goal: 'Con 10 m³/s o más, logra un resalto estable (Froude de llegada entre 4,5 y 9) que quepa entero dentro del pozo.',
    hint: 'El vertedero del final sube el agua del pozo y empuja el resalto hacia la rápida. Si no cabe, alarga el pozo.',
    check: (c) => c.inp.Q >= 10 && c.r.contained && c.r.kind === 'estable',
    progress: (c) => `Resalto ${JUMP_NAME[c.r.kind]}, ${c.r.contained ? 'dentro del pozo' : 'no cabe en el pozo'} (caudal ${es(c.inp.Q, 0)} m³/s)`,
  },
  {
    id: 'hc-barrido',
    title: 'El resalto que se escapa',
    goal: 'Baja el vertedero hasta que el resalto se salga del pozo. Después, sin cambiar el caudal, haz que vuelva a quedar dentro.',
    hint: 'Sin suficiente agua en el pozo, la conjugada no se alcanza y el agua sigue rápida. Sube el vertedero o alarga el pozo.',
    check: (c) => c.sawBarrido && c.r.contained,
    progress: (c) => (c.sawBarrido ? (c.r.contained ? 'Listo.' : 'Ya se escapó; ahora atrápalo.') : 'Baja el vertedero.'),
  },
  {
    id: 'hc-ahogado',
    title: 'Un resalto ahogado',
    goal: 'Sube tanto el vertedero que el agua del pozo cubra el pie de la rápida y el resalto se ahogue.',
    hint: 'Cuando el pozo es más profundo que la conjugada, el agua represada sube por la rápida.',
    check: (c) => c.r.place === 'ahogado',
    progress: (c) => `Pozo ${es(c.r.ytw)} m · conjugada ${es(c.r.y2)} m`,
  },
  {
    id: 'hc-disipa',
    title: 'Que se gaste la energía',
    goal: 'Con el resalto dentro del pozo, logra que la estructura disipe el 60 % o más de la energía con que llega el agua.',
    hint: 'Una caída más alta trae más energía, y un resalto más fuerte la gasta. Mira la línea roja de energía en el esquema.',
    check: (c) => c.r.contained && c.r.dissipated >= 0.6,
    progress: (c) => `Disipa ${es(c.r.dissipated * 100, 0)} %`,
  },
  {
    id: 'hc-critica',
    title: 'La energía mínima',
    goal: 'En el experimento de la energía específica, encuentra la profundidad con la que el agua pasa con la menor energía.',
    hint: 'A esa profundidad el Froude vale 1: es la profundidad crítica.',
    check: (c) => c.critical,
  },
];

const KIND_TXT: Record<JumpKind, string> = {
  ondular: 'Ondular (F de 1 a 1,7): la superficie solo se ondula.',
  debil: 'Débil (1,7 a 2,5): remolinos pequeños; pierde poca energía.',
  oscilante: 'Oscilante (2,5 a 4,5): chorro que sube y baja; hace olas que viajan lejos.',
  estable: 'Estable (4,5 a 9): bien formado y quieto en su sitio; pierde de 45 a 70 % de la energía.',
  fuerte: 'Fuerte (más de 9): violento, con mucha espuma y golpes contra el fondo.',
};

export function JumpLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [inp, setInp] = useState<JumpInput>(DEFAULT_JUMP);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [sawBarrido, setSawBarrido] = useState(false);
  const [critical, setCritical] = useState(false);
  const r = useMemo(() => jumpModel(inp), [inp]);
  const world = useRef<JumpWorld | null>(null);
  const sync = useRef(r);
  sync.current = r;
  useEffect(() => world.current?.set(sync.current), [r]);
  useEffect(() => {
    if (r.place === 'barrido') setSawBarrido(true);
  }, [r]);
  const ctx = useMemo<Ctx>(() => ({ inp, r, sawBarrido, critical }), [inp, r, sawBarrido, critical]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<JumpInput>) => setInp((s) => ({ ...s, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.contained ? (r.place === 'ahogado' ? 'mid' : 'ok') : 'bad';
  const answer =
    r.place === 'barrido'
      ? `No: el pozo tiene ${es(r.ytw)} m de agua y el resalto necesita ${es(r.y2)} m; el agua sigue rápida, se sale del pozo y erosiona el canal de abajo.`
      : !r.contained
        ? `No del todo: el resalto empieza en el pozo, pero mide ${es(r.Lj, 1)} m y no cabe en ${es(inp.basin, 0)} m.`
        : r.place === 'ahogado'
          ? `Sí, pero ahogado: el pozo (${es(r.ytw)} m) supera la conjugada (${es(r.y2)} m) y el agua sube por la rápida; gasta menos energía.`
          : `Sí: un resalto ${JUMP_NAME[r.kind]} de ${es(r.Lj, 1)} m ${r.xJump > 0.05 ? `a ${es(r.xJump, 1)} m del pie` : 'al pie de la rápida'}; la estructura disipa el ${es(r.dissipated * 100, 0)} % de la energía.`;

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Caída en 3D con pared de vidrio: canal de arriba, rápida de concreto, pozo de amortiguación con el resalto hidráulico y vertedero de salida; la línea roja rayada es la línea de energía."
          viewNames={[
            { id: 'general', label: 'Toda la caída' },
            { id: 'resalto', label: 'El resalto' },
            { id: 'rapida', label: 'La rápida' },
          ]}
          make={(st) => new JumpWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <JumpDiagram r={r} />
        </FlatStage>
      )}
      <Question q="¿El pozo atrapa el resalto?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <DockRange label="Caudal" value={inp.Q} min={2} max={30} step={1} show={`${es(inp.Q, 0)} m³/s`} onChange={(v) => set({ Q: v })} />
      <FloodPlayer q={inp.Q} qMax={30} digits={1} onQ={(v) => set({ Q: v })} />
      <DockRange label="Altura de la caída" value={inp.drop} min={2} max={12} step={0.5} show={`${es(inp.drop, 1)} m`} onChange={(v) => set({ drop: v })} />
      <DockRange label="Vertedero del pozo" value={inp.weir} min={0} max={4} step={0.1} show={`${es(inp.weir, 1)} m`} onChange={(v) => set({ weir: Math.round(v * 10) / 10 })} />
      <DockRange label="Largo del pozo" value={inp.basin} min={6} max={40} step={1} show={`${es(inp.basin, 0)} m`} onChange={(v) => set({ basin: v })} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <JumpDiagram r={r} />
        <h3>De lento a rápido y de rápido a lento</h3>
        <p>
          En la cresta, el agua pasa por la <strong>profundidad crítica</strong> ({es(r.yc)} m): la de menor energía para ese caudal. Al bajar por la rápida gana velocidad y se adelgaza; al pie va a {es(r.V1, 1)} m/s con {es(r.y1)} m (Froude {es(r.F1, 1)}). El agua del pozo, en cambio, es lenta y profunda. El paso de rápido a lento no es suave: es un salto con remolino, el <strong>resalto hidráulico</strong>.
        </p>
        <h3>¿Dónde salta?</h3>
        <p>
          En el resalto se conserva la fuerza específica (empuje del agua más su cantidad de movimiento). Con eso, cada profundidad rápida tiene su <strong>conjugada</strong> lenta: y2 = (y1/2)·(√(1 + 8·F1²) − 1) = {es(r.y2)} m (Bélanger). El resalto se para donde la conjugada iguala la profundidad del pozo, que la fija el vertedero del final ({es(r.ytw)} m).
        </p>
        <p className="q3-small">{KIND_TXT[r.kind]}</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Mueve los controles de abajo y mira dónde salta el agua. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>La curva de energía específica</h3>
        <EnergyCurve q={r.q} onCritical={() => setCritical(true)} />
        <h3>Los cinco resaltos</h3>
        <ul className="hc-kinds">
          {(Object.keys(KIND_TXT) as JumpKind[]).map((k) => (
            <li key={k} className={r.kind === k ? 'is-on' : ''}>
              {KIND_TXT[k]}
            </li>
          ))}
        </ul>
        <p className="q3-small">Clasificación del Buró de Reclamación de EE. UU. (USBR), citada por Chow (1959), según el Froude con que llega el agua.</p>
      </div>
    ),
    diseno: <DesignTab part="resalto" />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La caída, el pozo y el resalto</caption>
          <tbody>
            <Row name="Caudal por metro de ancho" value={`${es(r.q, 2)} m²/s`} note={`rápida y pozo de ${es(CHUTE.b, 0)} m de ancho`} />
            <Row name="Profundidad crítica (cresta)" value={`${es(r.yc, 3)} m`} note="(q²/g)^(1/3)" />
            <Row name="Energía en la cresta (sobre el pozo)" value={`${es(r.E0, 2)} m`} note="caída + 1,5 · yc" />
            <Row name="Rápida" value={`${es(r.chuteLen, 1)} m de largo`} note={`pendiente ${es(CHUTE.S * 100, 0)} %, concreto n = ${es(CHUTE.n, 3)}`} />
            <Row name="Al pie: profundidad" value={`${es(r.y1, 3)} m`} />
            <Row name="Al pie: velocidad" value={`${es(r.V1, 2)} m/s`} />
            <Row name="Al pie: Froude" value={es(r.F1, 2)} />
            <Row name="Conjugada (Bélanger)" value={`${es(r.y2, 3)} m`} />
            <Row name="Agua en el pozo" value={`${es(r.ytw, 3)} m`} note={`vertedero ${es(inp.weir, 1)} m + carga ${es(r.Hw, 2)} m`} />
            <Row name="Inicio del resalto" value={r.place === 'barrido' ? 'fuera del pozo' : `${es(r.xJump, 1)} m del pie`} />
            <Row name="Largo del resalto" value={`${es(r.Lj, 1)} m`} note="6,9 · (y2 − y1)" />
            <Row name="Tipo" value={JUMP_NAME[r.kind]} note={`Froude de llegada ${es(r.FA, 1)}`} />
            <Row name="Energía perdida en el resalto" value={`${es(r.dEjump, 2)} m`} />
            <Row name="Energía disipada en la estructura" value={`${es(r.dissipated * 100, 0)} %`} note="de la que trae el agua en la cresta" />
            <Row name="Velocidad que sigue aguas abajo" value={`${es(r.Vout, 2)} m/s`} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>
          Energía específica y flujo crítico; cambio de régimen de supercrítico a subcrítico en un resalto hidráulico; conservación de la fuerza específica (ecuación de Bélanger) y pérdida de energía; cómo una estructura de control aguas abajo (el vertedero) decide dónde se forma el resalto, y por qué los pozos de amortiguación protegen el cauce de abajo.
        </p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Cresta con profundidad crítica (control); perfil S2 en la rápida por el método del paso directo con Manning (n = {es(CHUTE.n, 3)}), con la aproximación de pendiente pequeña (con 25 % de pendiente, el coseno es 0,97); perfil H3 sobre el piso horizontal del pozo cuando el resalto no empieza al pie. Conjugada de Bélanger y pérdida (y2 − y1)³/(4·y1·y2) (pruebas H5 y H9). Profundidad del pozo con el vertedero de cresta ancha: Q = 1,70 · b · H^1,5. Largo del resalto 6,9·(y2 − y1) (Smetana, en French 1985). Tipos de resalto según el Froude (USBR, en Chow 1959). El resalto se considera ahogado si el pozo supera la conjugada en más de 10 %.
        </p>
        <h3>Límites</h3>
        <p>
          Es un cálculo unidimensional. No incluye bloques, dientes ni umbrales del pozo (que acortan el resalto), aire atrapado, ni la presión del agua sobre las paredes. El resalto «fuera del pozo» se dibuja solo para mostrar que se escapa: allí el cálculo no sigue. No es un diseño de una estructura real.
        </p>
        <h3>Para conversar</h3>
        <p>¿Por qué el agua no puede pasar suavemente de rápida a lenta? ¿A dónde va la energía que se pierde en el resalto? ¿Qué le pasaría al cauce si el resalto se sale del pozo?</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

/** Curva E(y) = y + q²/(2g y²) para el caudal de la caída: mover la profundidad y ver la energía y su alterna. */
function EnergyCurve({ q, onCritical }: { q: number; onCritical: () => void }) {
  const yc = Math.cbrt((q * q) / G);
  const [y, setY] = useState(yc * 2);
  const E = (v: number) => v + (q * q) / (2 * G * v * v);
  const lo = yc * 0.35, hi = yc * 3.2;
  const Emax = E(hi) * 1.05;
  const X = (e: number) => 40 + (Math.min(e, Emax) / Emax) * 420, Y = (v: number) => 140 - ((v - 0) / hi) * 128;
  const pts = [...Array(80)].map((_, k) => lo + ((hi - lo) * k) / 79).filter((v) => E(v) <= Emax);
  // profundidad alterna (la otra con la misma energía)
  const Ey = E(y);
  let a = NaN;
  if (Ey > E(yc) * 1.0001) {
    let l = y < yc ? yc : 1e-4, h = y < yc ? hi * 6 : yc;
    for (let k = 0; k < 80; k++) {
      const m = (l + h) / 2;
      if ((E(m) - Ey) * (E(l) - Ey) > 0) l = m;
      else h = m;
    }
    a = (l + h) / 2;
  }
  const atCrit = Math.abs(y - yc) / yc < 0.03;
  useEffect(() => {
    if (atCrit) onCritical();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atCrit]);
  return (
    <div className="q3-exp">
      <svg viewBox="0 0 480 160" className="hc-exp-svg" role="img" aria-label={`Curva de energía específica: con ${es(y)} m de profundidad la energía es ${es(Ey)} m.`}>
        <line x1="40" y1="140" x2="470" y2="140" stroke="#17324d" />
        <line x1="40" y1="8" x2="40" y2="140" stroke="#17324d" />
        <line x1="40" y1="140" x2={X(hi)} y2={Y(hi)} stroke="#9fb3c0" strokeDasharray="3 3" />
        <polyline points={pts.map((v) => `${X(E(v))},${Y(v)}`).join(' ')} fill="none" stroke="#2f7fb0" strokeWidth="2.4" />
        <line x1="40" y1={Y(yc)} x2={X(E(yc))} y2={Y(yc)} stroke="#5b6b78" strokeDasharray="2 2" />
        <circle cx={X(Ey)} cy={Y(y)} r="5" fill={atCrit ? '#2f8f55' : '#c0462a'} />
        {Number.isFinite(a) && E(a) <= Emax && <circle cx={X(E(a))} cy={Y(a)} r="4" fill="none" stroke="#c0462a" strokeWidth="2" />}
        <text x="44" y="16" className="lz-s" fill="#17324d">profundidad y</text>
        <text x="466" y="154" textAnchor="end" className="lz-s" fill="#17324d">energía E = y + V²/2g</text>
        <text x="44" y={Y(yc) - 4} className="lz-s" fill="#5b6b78">{`crítica ${es(yc)} m`}</text>
        <text x="44" y="154" className="lz-s" fill="#5b6b78">la línea gris: E = y (agua quieta)</text>
      </svg>
      <div className="q3-range">
        <label htmlFor="hc-ey">
          <span className="q3-dlabel">Profundidad</span>
          <output htmlFor="hc-ey">{`${es(y)} m · energía ${es(Ey)} m · ${y < yc ? 'rápida' : 'lenta'}`}</output>
        </label>
        <input id="hc-ey" type="range" min={lo} max={hi} step={yc / 200} value={y} onChange={(e) => setY(Number(e.target.value))} />
      </div>
      <p className="q3-small">
        Con {es(q)} m²/s por metro de ancho. {atCrit ? 'Esta es la profundidad crítica: la energía es la mínima posible y solo hay una profundidad.' : Number.isFinite(a) ? `Con la misma energía, el agua también podría ir a ${es(a)} m (${a < yc ? 'rápida' : 'lenta'}): son las profundidades alternas.` : ''}
      </p>
    </div>
  );
}

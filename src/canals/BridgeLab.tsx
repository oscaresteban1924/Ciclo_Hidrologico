// «El puente y el remanso»: una quebrada canalizada pasa bajo un puente. Si la abertura es angosta o se tapa con
// palos y basura, al agua no le alcanza la energía para pasar y se represa: sube en el puente y el remanso se
// extiende aguas arriba. Si toca el tablero pasa a presión, y si sube más, por encima. La pregunta: ¿hasta dónde
// sube el agua y se sale del canal?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from './design';
import { FlatStage, FloodPlayer, Row, SlopeRange, es } from './common';
import { BridgeDiagram } from './diagrams';
import { CD_PRESSURE, CREEK, CW_DECK, DEBRIS, DEFAULT_BRIDGE, PIER_A, PIER_K, bridgeModel, type BridgeInput, type BridgeResult, type Debris } from './hydraulics';
import { BridgeWorld } from './three/bridgeWorld';
import { LiveHud, type LiveProfileData } from './live';
import { bridgeSurface } from './profiles';

interface Ctx {
  inp: BridgeInput;
  r: BridgeResult;
  sawSpillDebris: boolean;
  compared: boolean;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'hc-limpio',
    title: 'Un puente que deja pasar',
    goal: 'Con una creciente de 40 m³/s o más y el puente limpio, logra que el agua no salga del canal.',
    hint: 'Una abertura más ancha o un tablero más alto dejan pasar el agua sin represarla.',
    check: (c) => c.inp.Q >= 40 && c.inp.debris === 'limpio' && !c.r.spill,
    progress: (c) => `${es(c.inp.Q, 0)} m³/s · ${c.r.spill ? 'se sale' : 'cabe'} · ${DEBRIS[c.inp.debris].name.toLowerCase()}`,
  },
  {
    id: 'hc-tapon',
    title: 'Palos y basura',
    goal: 'Con 40 m³/s o más, tapa mucho el puente y mira cómo el agua se sale. Después, con el puente «con palos», cambia el puente para que el agua no salga.',
    hint: 'El agua se represa hasta tener la energía para pasar por lo que queda libre. Cuanto más ancha y alta la abertura, menos sube.',
    check: (c) => c.sawSpillDebris && c.inp.debris === 'palos' && c.inp.Q >= 40 && !c.r.spill,
    progress: (c) => (c.sawSpillDebris ? (c.r.spill ? 'Todavía se sale.' : c.inp.debris !== 'palos' ? 'Pon el puente «con palos».' : 'Sube el caudal a 40 m³/s o más.') : 'Pon «muy tapado» con 40 m³/s o más.'),
  },
  {
    id: 'hc-presion',
    title: 'Agua contra el tablero',
    goal: 'Haz que el agua toque el tablero y pase a presión por debajo del puente.',
    hint: 'Baja el puente o sube el caudal.',
    check: (c) => c.r.flow === 'presion' || c.r.flow === 'encima',
    progress: (c) => `Agua en el puente ${es(c.r.yU)} m · bajo del tablero ${es(c.inp.soffit, 1)} m`,
  },
  {
    id: 'hc-remanso',
    title: 'Un remanso de medio kilómetro',
    goal: 'Logra un remanso de 500 m o más sin que el agua salga del canal.',
    hint: 'Con poca pendiente el agua represada tarda mucho en volver a su profundidad normal.',
    check: (c) => c.r.backwater >= 500 && !c.r.spill,
    progress: (c) => `Remanso ${Math.round(c.r.backwater).toLocaleString('es-CO')} m${c.r.spill ? ' (pero se sale)' : ''}`,
  },
  {
    id: 'hc-compara',
    title: 'Compara puentes',
    goal: 'En el experimento, compara los cuatro puentes con la creciente de 60 m³/s o más.',
    hint: 'Sube el caudal y abre «Compara puentes».',
    check: (c) => c.compared,
  },
];

const DESIGNS: { name: string; span: number; soffit: number }[] = [
  { name: 'Angosto y bajo', span: 4, soffit: 1.8 },
  { name: 'El de ahora', span: DEFAULT_BRIDGE.span, soffit: DEFAULT_BRIDGE.soffit },
  { name: 'Ancho', span: 8, soffit: 2.6 },
  { name: 'Ancho y alto', span: 8, soffit: 3.6 },
];

export function BridgeLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [inp, setInp] = useState<BridgeInput>(DEFAULT_BRIDGE);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [sawSpillDebris, setSawSpillDebris] = useState(false);
  const [compared, setCompared] = useState(false);
  const r = useMemo(() => bridgeModel(inp), [inp]);
  const world = useRef<BridgeWorld | null>(null);
  const sync = useRef(r);
  sync.current = r;
  useEffect(() => world.current?.set(sync.current), [r]);
  useEffect(() => {
    if (inp.debris === 'tapado' && inp.Q >= 40 && r.spill) setSawSpillDebris(true);
  }, [inp, r]);
  const ctx = useMemo<Ctx>(() => ({ inp, r, sawSpillDebris, compared }), [inp, r, sawSpillDebris, compared]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<BridgeInput>) => setInp((s) => ({ ...s, ...p }));
  const flowTxt: Record<BridgeResult['flow'], string> = {
    libre: 'pasa libre bajo el puente',
    estrangulado: 'el puente estrangula el paso y el agua se represa',
    presion: 'toca el tablero y pasa a presión por debajo',
    encima: 'pasa a presión por debajo y también por encima del puente',
  };
  const tone: 'ok' | 'mid' | 'bad' = r.spill ? 'bad' : r.flow === 'libre' ? 'ok' : 'mid';
  const answer = r.spill
    ? `Se sale: en el puente llega a ${es(r.yU)} m (las paredes tienen ${es(CREEK.H, 0)} m) y desborda desde unos ${Math.round(-r.spill[0]).toLocaleString('es-CO')} m aguas arriba; ${flowTxt[r.flow]}.`
    : r.rise > 0.02
      ? `No se sale, pero sube ${es(r.rise)} m en el puente (${flowTxt[r.flow]}) y el remanso llega a unos ${Math.round(r.backwater).toLocaleString('es-CO')} m aguas arriba.`
      : `Casi no sube: ${flowTxt[r.flow]}; el agua va a su profundidad normal (${es(r.yn)} m).`;

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Quebrada canalizada en 3D con pared de vidrio al frente: el agua pasa bajo un puente vehicular; la línea rayada marca la profundidad normal y el agua por encima de ella es el remanso que causa el puente. Las casas de la orilla de atrás muestran hasta dónde llega el agua si se sale."
          viewNames={[
            { id: 'general', label: 'La quebrada' },
            { id: 'puente', label: 'El puente' },
            { id: 'remanso', label: 'El remanso' },
          ]}
          make={(st) => new BridgeWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <BridgeDiagram r={r} />
        </FlatStage>
      )}
      <Question q="¿Hasta dónde sube el agua? ¿Se sale del canal?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const bridgeProfile = useMemo<LiveProfileData>(() => {
    const x0 = -Math.min(400, Math.max(80, r.backwater * 1.15)), x1 = 40;
    const sf = bridgeSurface(r, x0, x1, 1);
    const S = inp.S;
    const bedAt = (x: number) => -S * x;
    const dw = 1.2; // ancho del tablero en el dibujo (m)
    return {
      pts: sf.map((p) => {
        const V = inp.Q / (CREEK.b * Math.max(0.02, p.y));
        return { x: p.x, zb: p.bed, z: p.bed + p.y, E: p.bed + p.y + (V * V) / (2 * 9.81) };
      }),
      normal: [x0, x1].map((x) => ({ x, z: bedAt(x) + r.yn })),
      crit: [x0, x1].map((x) => ({ x, z: bedAt(x) + r.yc })),
      top: [x0, x1].map((x) => ({ x, z: bedAt(x) + CREEK.H })),
      blocks: [{ pts: [[-dw / 2, inp.soffit], [dw / 2, inp.soffit], [dw / 2, inp.soffit + CREEK.deck], [-dw / 2, inp.soffit + CREEK.deck]], fill: '#8f969c' }],
      marks: [{ x: 0, label: 'puente' }],
    };
  }, [r, inp]);
  const flowName: Record<BridgeResult['flow'], string> = { libre: 'paso libre', estrangulado: 'estrangulado', presion: 'a presión', encima: 'pasa por encima' };

  const dock = (
    <>
      <LiveHud
        head={[`Q = ${es(inp.Q, 0)} m³/s`, flowName[r.flow], `sube ${es(r.rise, 2)} m`, `remanso ${es(r.backwater, 0)} m`]}
        profile={bridgeProfile}
        profileLabel="Perfil de la quebrada hacia aguas arriba del puente: agua, energía, profundidad normal y crítica, borde del cauce y tablero"
        traces={[
          { key: 'yu', label: 'Agua justo arriba del puente', unit: 'm', value: r.yU, digits: 2, ref: { value: inp.soffit, label: 'bajo del puente' } },
          { key: 'rise', label: 'Cuánto sube sobre la normal', unit: 'm', value: r.rise, digits: 2 },
        ]}
      />
      <DockRange label="Caudal de la creciente" value={inp.Q} min={5} max={90} step={1} show={`${es(inp.Q, 0)} m³/s`} onChange={(v) => set({ Q: v })} />
      <FloodPlayer q={inp.Q} qMax={90} digits={0} onQ={(v) => set({ Q: v })} />
      <SlopeRange value={inp.S} lo={0.001} hi={0.02} onChange={(S) => set({ S })} label="Pendiente de la quebrada" />
      <DockRange label="Luz del puente" value={inp.span} min={3} max={CREEK.b} step={0.5} show={`${es(inp.span, 1)} m`} onChange={(v) => set({ span: v })} />
      <DockRange label="Altura del bajo del puente" value={inp.soffit} min={1.2} max={4} step={0.1} show={`${es(inp.soffit, 1)} m`} onChange={(v) => set({ soffit: Math.round(v * 10) / 10 })} />
      <DockChoice<Debris> label="Palos y basura" value={inp.debris} options={(Object.keys(DEBRIS) as Debris[]).map((d) => ({ value: d, label: DEBRIS[d].name }))} onChange={(v) => set({ debris: v })} />
      <DockChoice<'0' | '1' | '2'> label="Pilas en el cauce" value={String(inp.piers ?? 0) as '0' | '1' | '2'} options={[{ value: '0', label: 'Ninguna' }, { value: '1', label: 'Una' }, { value: '2', label: 'Dos' }]} onChange={(v) => set({ piers: Number(v) })} />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <BridgeDiagram r={r} />
        <h3>Al agua no le alcanza la energía</h3>
        <p>
          Para pasar por una abertura, el agua necesita al menos la energía crítica de esa abertura. Sin puente, la quebrada corre a su profundidad normal ({es(r.yn)} m) con {es(r.yn + (inp.Q / (CREEK.b * r.yn)) ** 2 / 19.62)} m de energía; la abertura útil de {es(r.bEff, 1)} m pide {es(r.Ecp)} m. {r.flow === 'libre' ? 'Le alcanza: pasa sin represarse.' : 'No le alcanza: el agua se represa hasta tener esa energía. Eso es un estrangulamiento.'}
        </p>
        <h3>El remanso</h3>
        <p>
          El agua represada no vuelve de golpe a su profundidad normal: forma una curva (en los canales de poca pendiente se llama M1) que se va acercando a la normal aguas arriba. Se calcula tramo por tramo con la energía y la fricción (método del paso directo). {r.steep ? 'En esta quebrada empinada el agua llega rápida: choca con el agua represada en un resalto.' : ''}
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Mueve los controles de abajo y mira hasta dónde llega el agua. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Compara puentes</h3>
        <p className="q3-small">Los cuatro puentes con la misma creciente ({es(inp.Q, 0)} m³/s), la misma pendiente y {DEBRIS[inp.debris].name.toLowerCase()}.</p>
        <CompareBridges inp={inp} onCompare={() => inp.Q >= 60 && setCompared(true)} onUse={(d) => set({ span: d.span, soffit: d.soffit })} />
      </div>
    ),
    diseno: <DesignTab part="puente" />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La quebrada y el puente</caption>
          <tbody>
            <Row name="Canal" value={`${es(CREEK.b, 0)} m de ancho, paredes de ${es(CREEK.H, 0)} m`} note={`concreto, n = ${es(CREEK.n, 3)}`} />
            <Row name="Pilas" value={(inp.piers ?? 0) > 0 ? `${inp.piers} de ${es(PIER_A, 1)} m, punta y cola semicirculares` : 'ninguna'} note={(inp.piers ?? 0) > 0 ? `Yarnell, K = ${PIER_K}; abertura útil ${es(r.bEff, 2)} m` : undefined} />
            <Row name="Capacidad del canal sin puente" value={`${es(r.Qcanal, 1)} m³/s`} note="lleno hasta el borde" />
            <Row name="Profundidad normal" value={`${es(r.yn, 3)} m`} note={`Froude ${es(r.Fn, 2)} (${r.steep ? 'rápido' : 'lento'})`} />
            <Row name="Profundidad crítica" value={`${es(r.yc, 3)} m`} />
            <Row name="Abertura útil" value={`${es(r.bEff, 2)} m`} note={`luz ${es(inp.span, 1)} m, ${Math.round(DEBRIS[inp.debris].block * 100)} % tapada`} />
            <Row name="Energía crítica en la abertura" value={`${es(r.Ecp, 3)} m`} note="1,5 · (q²/g)^(1/3)" />
            <Row name="Agua justo antes del puente" value={`${es(r.yU, 3)} m`} />
            <Row name="Cuánto sube" value={`${es(r.rise, 3)} m`} />
            <Row name="Paso por el puente" value={flowTxt[r.flow]} />
            {r.Qover > 0 && <Row name="Por encima del tablero" value={`${es(r.Qover, 1)} m³/s`} />}
            <Row name="Remanso (hasta 1 % sobre la normal)" value={r.backwater > 1 ? `${Math.round(r.backwater).toLocaleString('es-CO')} m` : 'no hay'} />
            <Row name="Se sale del canal" value={r.spill ? `desde ${Math.round(-r.spill[0]).toLocaleString('es-CO')} m antes del puente` : 'no'} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>
          Energía específica y estrangulamiento en una contracción; paso a presión bajo un tablero y sobre él; flujo gradualmente variado aguas arriba (perfil de remanso M1 en pendiente suave, S1 con resalto en pendiente fuerte). Por qué un puente angosto o tapado con palos y basura puede sacar el agua de un canal que, sin el puente, tendría capacidad de sobra.
        </p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Profundidad normal con Manning; estrangulamiento cuando la energía de la quebrada es menor que la crítica de la abertura útil (Henderson 1966): el agua se represa hasta la profundidad subcrítica con esa energía, sin pérdidas locales. Si el agua llega al tablero, paso a presión con Q = Cd · a · b · √(2g · (y − a/2)) con Cd = {es(CD_PRESSURE, 1)}, y sobre el tablero, vertedero con C = {es(CW_DECK, 1)} (orden de magnitud de FHWA HDS-7). Perfil aguas arriba por el paso directo (prueba H7: coincide con Runge-Kutta en 0,1 %). Lo tapado reduce el ancho útil en 30 % («con palos») o 60 % («muy tapado»).
        </p>
        <h3>Límites</h3>
        <p>
          Modelo unidimensional de un canal rectangular sin pérdidas locales en la contracción (el agua subiría algo más). El agua que sale a la orilla se dibuja al nivel del canal, sin calcular cómo se reparte por la calle. No es un pronóstico de inundación ni el diseño de un puente; la quebrada y las casas son ilustrativas.
        </p>
        <h3>Para conversar</h3>
        <p>¿Por qué importa no botar basura ni escombros a las quebradas? ¿Qué es más útil: un puente más ancho o uno más alto? ¿Por qué el agua sube tan lejos del puente cuando la quebrada tiene poca pendiente?</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

function CompareBridges({ inp, onCompare, onUse }: { inp: BridgeInput; onCompare: () => void; onUse: (d: { span: number; soffit: number }) => void }) {
  const rows = DESIGNS.map((d) => ({ d, r: bridgeModel({ ...inp, span: d.span, soffit: d.soffit }) }));
  const top = Math.max(CREEK.H + 0.5, ...rows.map((x) => x.r.yU));
  useEffect(() => {
    onCompare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inp.Q]);
  return (
    <div className="q3-exp">
      <svg viewBox="0 0 480 170" className="hc-exp-svg" role="img" aria-label="Barras: altura del agua en el puente para cuatro puentes distintos, con la línea del borde de las paredes.">
        {rows.map(({ d, r }, k) => {
          const x = 30 + k * 112, h = (r.yU / top) * 120;
          return (
            <g key={d.name}>
              <rect x={x} y={140 - h} width="70" height={h} fill={r.spill ? '#c0462a' : '#4f9fd2'} />
              <text x={x + 35} y={136 - h} textAnchor="middle" className="lz-s" fill="#17324d">{`${es(r.yU)} m`}</text>
              <text x={x + 35} y="156" textAnchor="middle" className="lz-s" fill="#17324d">{d.name}</text>
              <text x={x + 35} y="168" textAnchor="middle" className="lz-s" fill="#5b6b78">{`${es(d.span, 0)} m × ${es(d.soffit, 1)} m`}</text>
            </g>
          );
        })}
        <line x1="20" y1={140 - (CREEK.H / top) * 120} x2="470" y2={140 - (CREEK.H / top) * 120} stroke="#8a6747" strokeWidth="2" strokeDasharray="5 3" />
        <text x="22" y={136 - (CREEK.H / top) * 120} className="lz-s" fill="#6b4f33">borde de las paredes</text>
      </svg>
      <div className="hc-use">
        {DESIGNS.map((d) => (
          <button key={d.name} type="button" className="link" onClick={() => onUse(d)}>
            Probar «{d.name.toLowerCase()}»
          </button>
        ))}
      </div>
    </div>
  );
}

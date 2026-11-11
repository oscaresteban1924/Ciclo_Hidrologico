// «Las alcantarillas»: la quebrada pasa bajo una vía en terraplén por tubos de concreto. El agua se represa a la
// entrada hasta el nivel que exige la entrada o el que exige el tubo con la fricción y el nivel de abajo (el mayor de
// los dos). La pregunta: ¿la alcantarilla deja pasar la creciente sin que el agua llegue a la vía?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { INK, Lens, Tag, useLensUid, type Chip } from '../quality/lensKit';
import { FlatStage, Row, SlopeRange, es } from './common';
import { CR_ROAD, CULVERT_RULES, DEFAULT_CULVERT, INLETS, KU, N_PIPE, ROAD_LEN, culvertModel, ratingCurve, type CulvertInput, type CulvertResult, type Inlet } from './culvert';
import { CulvertWorld } from './three/culvertWorld';
import { DesignTab } from './design';

interface Ctx {
  inp: CulvertInput;
  r: CulvertResult;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'hc-alc-cumple',
    title: 'Una alcantarilla que cumple',
    goal: `Con 8 m³/s o más, logra que el agua a la entrada no pase de ${CULVERT_RULES.hwd} veces el diámetro, quede al menos ${es(CULVERT_RULES.free, 1)} m bajo la vía y salga a ${es(CULVERT_RULES.vout, 1)} m/s o menos.`,
    hint: 'Un tubo más grande o un segundo tubo bajan el nivel. Si el agua sale muy rápida, menos pendiente.',
    check: (c) => c.inp.Q >= 8 && c.r.ok,
    progress: (c) => c.r.checks.map((x) => `${x.ok ? '✓' : '✗'} ${x.value}`).join(' · '),
  },
  {
    id: 'hc-alc-encima',
    title: 'El agua sobre la vía',
    goal: 'Sube la creciente hasta que el agua pase por encima de la vía.',
    hint: 'Cuando la alcantarilla no alcanza, el terraplén funciona como un vertedero.',
    check: (c) => c.r.overtop,
  },
  {
    id: 'hc-alc-salida',
    title: 'Manda la salida',
    goal: 'Logra que la alcantarilla quede con control a la salida: que el nivel lo fije el tubo y el agua de abajo, no la entrada.',
    hint: 'Sube el nivel aguas abajo, alarga el tubo o quítale pendiente.',
    check: (c) => c.r.control === 'salida' && c.r.hwOutlet > c.r.hwInlet + 0.05,
    progress: (c) => `Entrada ${es(c.r.hwInlet)} m · salida ${es(c.r.hwOutlet)} m`,
  },
  {
    id: 'hc-alc-campana',
    title: 'Una entrada mejor',
    goal: 'Con 8 m³/s o más y control a la entrada, usa la entrada de campana y logra que la alcantarilla cumpla con un solo tubo.',
    hint: 'La campana guía el agua al entrar y pierde menos energía que el borde recto.',
    check: (c) => c.inp.Q >= 8 && c.inp.inlet === 'campana' && c.inp.barrels === 1 && c.r.control === 'entrada' && c.r.ok,
  },
];

export function CulvertLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [inp, setInp] = useState<CulvertInput>(DEFAULT_CULVERT);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const r = useMemo(() => culvertModel(inp), [inp]);
  const world = useRef<CulvertWorld | null>(null);
  const sync = useRef(r);
  sync.current = r;
  useEffect(() => world.current?.set(sync.current), [r]);
  const ctx = useMemo<Ctx>(() => ({ inp, r }), [inp, r]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<CulvertInput>) => setInp((s) => ({ ...s, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.overtop ? 'bad' : r.ok ? 'ok' : 'mid';
  const fails = r.checks.filter((c) => !c.ok).map((c) => c.name.toLowerCase());
  const answer = r.overtop
    ? `No: el agua sube a ${es(r.hw)} m y pasa por encima de la vía (${es(r.Qover, 1)} de ${es(inp.Q, 1)} m³/s).`
    : r.ok
      ? `Sí: el agua se represa a ${es(r.hw)} m (${es(r.ratio)} D, control a la ${r.control}) y sale a ${es(r.Vout, 1)} m/s.`
      : `Pasa, pero no cumple: ${fails.join('; ')} (agua a ${es(r.hw)} m, control a la ${r.control}).`;

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Alcantarilla en 3D: la quebrada cruza bajo una vía en terraplén por tubos de concreto; el terraplén está cortado por el eje del primer tubo para ver el agua adentro. Aguas arriba el agua se represa hasta el nivel calculado."
          viewNames={[
            { id: 'general', label: 'La vía' },
            { id: 'corte', label: 'El tubo por dentro' },
            { id: 'entrada', label: 'La entrada' },
          ]}
          make={(st) => new CulvertWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <CulvertDiagram r={r} />
        </FlatStage>
      )}
      <Question q="¿La alcantarilla deja pasar la creciente sin que el agua llegue a la vía?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <DockRange label="Caudal de la creciente" value={inp.Q} min={0.5} max={40} step={0.5} show={`${es(inp.Q, 1)} m³/s`} onChange={(v) => set({ Q: v })} />
      <DockRange label="Diámetro del tubo" value={inp.D} min={0.6} max={3} step={0.1} show={`${es(inp.D, 1)} m`} onChange={(v) => set({ D: Math.round(v * 10) / 10 })} />
      <DockRange label="Tubos" value={inp.barrels} min={1} max={3} step={1} show={`${inp.barrels}`} onChange={(v) => set({ barrels: v })} />
      <SlopeRange value={Math.max(0.0005, inp.S)} lo={0.0005} hi={0.06} onChange={(S) => set({ S })} label="Pendiente del tubo" />
      <DockRange label="Nivel aguas abajo" value={inp.tw} min={0} max={3} step={0.1} show={`${es(inp.tw, 1)} m`} onChange={(v) => set({ tw: Math.round(v * 10) / 10 })} />
      <DockChoice<Inlet> label="Entrada" value={inp.inlet} options={[{ value: 'muro', label: 'Borde recto' }, { value: 'campana', label: 'Campana' }, { value: 'saliente', label: 'Saliente' }]} onChange={(v) => set({ inlet: v })} />
    </>
  );

  const curve = useMemo(() => ratingCurve(inp, Math.max(inp.Q * 1.6, 4)), [inp]);
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <CulvertDiagram r={r} />
        <h3>¿Qué manda: la entrada o la salida?</h3>
        <p>
          Con <strong>control a la entrada</strong>, el agua no alcanza a llenar el tubo: lo que limita es lo que cabe por la boca, como en un embudo. Con <strong>control a la salida</strong>, el tubo va lleno o casi, y el nivel lo fijan la fricción a lo largo del tubo, la pérdida al entrar y salir, y el agua de abajo. Se calculan los dos y manda el mayor: ahora, la {r.control} ({es(r.hwInlet)} m contra {es(r.hwOutlet)} m).
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Mueve los controles de abajo y mira el agua represada antes de la vía. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>La curva de funcionamiento</h3>
        <svg viewBox="0 0 480 190" className="hc-exp-svg" role="img" aria-label="Nivel del agua a la entrada contra el caudal, con control a la entrada y a la salida, y la altura de la vía.">
          {(() => {
            const Qm = curve[curve.length - 1].Q;
            const Hm = Math.max(inp.road * 1.25, ...curve.map((c) => Math.max(c.inlet, c.outlet)).slice(0, -1).map((v) => Math.min(v, inp.road * 1.6)));
            const X = (q: number) => 44 + (q / Qm) * 420, Y = (h: number) => 170 - (Math.min(h, Hm) / Hm) * 158;
            return (
              <g>
                <line x1="44" y1="170" x2="470" y2="170" stroke={INK} />
                <line x1="44" y1="8" x2="44" y2="170" stroke={INK} />
                <polyline points={curve.map((c) => `${X(c.Q)},${Y(c.inlet)}`).join(' ')} fill="none" stroke="#2f7fb0" strokeWidth="2.2" />
                <polyline points={curve.map((c) => `${X(c.Q)},${Y(c.outlet)}`).join(' ')} fill="none" stroke="#c0462a" strokeWidth="2.2" strokeDasharray="5 3" />
                <line x1="44" y1={Y(inp.road)} x2="470" y2={Y(inp.road)} stroke="#6b4f33" strokeWidth="2" />
                <line x1="44" y1={Y(CULVERT_RULES.hwd * inp.D)} x2="470" y2={Y(CULVERT_RULES.hwd * inp.D)} stroke="#2f8f55" strokeDasharray="2 3" />
                <circle cx={X(inp.Q)} cy={Y(Math.max(r.hwInlet, r.hwOutlet))} r="5" fill={INK} />
                <text x="48" y={Y(inp.road) - 4} className="lz-s" fill="#6b4f33">vía</text>
                <text x="48" y={Y(CULVERT_RULES.hwd * inp.D) - 4} className="lz-s" fill="#2f8f55">{`${CULVERT_RULES.hwd} D`}</text>
                <text x="466" y="186" textAnchor="end" className="lz-s" fill={INK}>caudal (m³/s)</text>
                <text x="48" y="16" className="lz-s" fill={INK}>nivel a la entrada (m)</text>
                <text x="300" y="16" className="lz-s" fill="#2f7fb0">— control a la entrada</text>
                <text x="300" y="30" className="lz-s" fill="#c0462a">- - control a la salida</text>
              </g>
            );
          })()}
        </svg>
        <p className="q3-small">Para cada caudal manda la curva más alta. Donde se cruzan, la alcantarilla cambia de control. Con los controles de abajo la curva cambia: compara entradas, diámetros y niveles aguas abajo.</p>
      </div>
    ),
    diseno: <DesignTab part="alcantarilla" />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La alcantarilla</caption>
          <tbody>
            <Row name="Tubos" value={`${inp.barrels} de ${es(inp.D, 2)} m, ${es(inp.L, 0)} m de largo`} note={`concreto, n = ${es(N_PIPE, 3)}`} />
            <Row name="Caudal por tubo" value={`${es(r.q, 2)} m³/s`} />
            <Row name="Entrada" value={INLETS[inp.inlet].name} note={`HDS-5: K ${INLETS[inp.inlet].K}, M ${INLETS[inp.inlet].M}, c ${INLETS[inp.inlet].c}, Y ${INLETS[inp.inlet].Y}; ke ${INLETS[inp.inlet].ke}`} />
            <Row name="Nivel por control a la entrada" value={`${es(r.hwInlet, 2)} m`} note={`boca ${r.regime === 'libre' ? 'sin ahogar' : r.regime === 'sumergida' ? 'ahogada' : 'en transición'}`} />
            <Row name="Nivel por control a la salida" value={`${es(r.hwOutlet, 2)} m`} />
            <Row name="Nivel a la entrada" value={`${es(r.hw, 2)} m (${es(r.ratio, 2)} D)`} note={`control a la ${r.control}`} />
            <Row name="Profundidad crítica en el tubo" value={`${es(r.yc, 2)} m`} />
            <Row name="Profundidad normal en el tubo" value={Number.isNaN(r.yn) ? 'va lleno' : `${es(r.yn, 2)} m`} />
            <Row name="Velocidad a la salida" value={`${es(r.Vout, 2)} m/s`} />
            <Row name="Por encima de la vía" value={r.overtop ? `${es(r.Qover, 2)} m³/s` : 'nada'} note={`vertedero de ${ROAD_LEN} m, C = ${es(CR_ROAD, 2)}`} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>El funcionamiento de una alcantarilla: control a la entrada y a la salida, el efecto de la forma de la entrada, del diámetro, del número de tubos, de la pendiente y del nivel aguas abajo; la curva de funcionamiento y el paso del agua por encima de la vía.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          FHWA HDS-5, Hydraulic Design of Highway Culverts (3.ª ed., 2012), en el SI (Ku = {es(KU, 3)}). Control a la entrada, tubo circular de concreto (tabla A.1): sin ahogar, HW/D = Hc/D + K·(Ku·Q/(A·D^0,5))^M − 0,5·S; ahogada, HW/D = c·(Ku·Q/(A·D^0,5))² + Y − 0,5·S; entre 3,5 y 4,0 se interpola (prueba H13). Control a la salida: HW = H + ho − L·S, con H = [1 + ke + 2·g·n²·L/R^(4/3)]·V²/2g y ho el mayor entre el nivel de abajo y (dc + D)/2. Sobre la vía, vertedero con C = {es(CR_ROAD, 2)} (3,0 en unidades inglesas) a lo largo de {ROAD_LEN} m, repartiendo el caudal hasta igualar el nivel.
        </p>
        <h3>Reglas del juego y límites</h3>
        <p>Para «cumple»: agua a la entrada de {CULVERT_RULES.hwd} D o menos, al menos {es(CULVERT_RULES.free, 1)} m bajo la vía y salida a {es(CULVERT_RULES.vout, 1)} m/s o menos (criterios comunes de diseño, no una norma citada). No incluye arrastre de palos y sedimentos, ni tubos parcialmente tapados. El perfil del agua dentro del tubo en la escena es esquemático.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

export function CulvertDiagram({ r }: { r: CulvertResult }) {
  const id = useLensUid();
  const { D, L, S, road, tw } = r.inp;
  const top = Math.max(4, L - 4 * road);
  const xa = -L / 2 - 14, xb = L / 2 + 10;
  const zTop = Math.max(road, r.hw) + 1;
  const zBot = -S * L - 0.6;
  const sx = 440 / (xb - xa), sy = Math.min(200 / (zTop - zBot), sx * 4);
  const X = (x: number) => 20 + (x - xa) * sx, Y = (z: number) => 222 - (z - zBot) * sy;
  const chips: Chip[] = [
    { label: 'Agua a la entrada', value: `${es(r.hw)} m · ${es(r.ratio)} D`, tone: r.ratio <= CULVERT_RULES.hwd ? 'ok' : 'bad' },
    { label: 'Control', value: `a la ${r.control}` },
    { label: 'Salida', value: `${es(r.Vout, 1)} m/s`, tone: r.Vout <= CULVERT_RULES.vout ? 'ok' : 'bad' },
  ];
  return (
    <Lens uid={id} label="Corte longitudinal de la alcantarilla: el terraplén con la vía, el tubo, el agua represada a la entrada y el nivel aguas abajo." chips={chips}>
      <polygon points={`${X(-L / 2)},${Y(0)} ${X(L / 2)},${Y(-S * L)} ${X(top / 2)},${Y(road)} ${X(-top / 2)},${Y(road)}`} fill="#a58b66" stroke="#7d6a4f" />
      <rect x={X(-top / 2)} y={Y(road) - 3} width={(top) * sx} height="3" fill="#3d4247" />
      <polygon points={`${X(-L / 2)},${Y(0)} ${X(L / 2)},${Y(-S * L)} ${X(L / 2)},${Y(-S * L + D)} ${X(-L / 2)},${Y(D)}`} fill="#eef5f8" stroke="#8d8a82" strokeWidth="2" />
      <polygon points={`${X(xa)},${Y(Math.max(r.hw, 0.02))} ${X(-L / 2)},${Y(Math.max(r.hw, 0.02))} ${X(-L / 2)},${Y(0)} ${X(xa)},${Y(0)}`} fill="#4f9fd2" opacity="0.85" />
      <polygon points={`${X(-L / 2)},${Y(Math.min(D, r.control === 'salida' ? D : Math.max(r.yc, r.yOut)))} ${X(L / 2)},${Y(-S * L + r.yOut)} ${X(L / 2)},${Y(-S * L)} ${X(-L / 2)},${Y(0)}`} fill="#4f9fd2" opacity="0.85" />
      <polygon points={`${X(L / 2)},${Y(-S * L + Math.max(tw, 0.02))} ${X(xb)},${Y(-S * L + Math.max(tw, 0.02))} ${X(xb)},${Y(-S * L)} ${X(L / 2)},${Y(-S * L)}`} fill="#4f9fd2" opacity="0.85" />
      {r.overtop && <rect x={X(-top / 2)} y={Y(r.hw)} width={top * sx} height={Math.max(2, (r.hw - road) * sy)} fill="#4f9fd2" opacity="0.7" />}
      <line x1={X(xa)} y1={Y(CULVERT_RULES.hwd * D)} x2={X(-L / 2)} y2={Y(CULVERT_RULES.hwd * D)} stroke="#2f8f55" strokeDasharray="3 2" />
      <Tag x={X(xa) + 2} y={Y(r.hw) - 5} size="s">
        {`HW = ${es(r.hw)} m`}
      </Tag>
      <Tag x={X(xa) + 2} y={Y(CULVERT_RULES.hwd * D) + 12} size="s" color="#2f8f55">
        {`${CULVERT_RULES.hwd} D`}
      </Tag>
      <Tag x={X(0)} y={Y(road) - 8} anchor="middle" size="s">
        vía
      </Tag>
      <Tag x={X(xb) - 2} y={Y(-S * L + tw) - 5} anchor="end" size="s">
        {`aguas abajo ${es(tw, 1)} m`}
      </Tag>
      <Tag x={20} y={250} size="s" color="#5b6b78">
        {sy / sx > 1.05 ? `escala vertical × ${es(sy / sx, 1)} · perfil en el tubo esquemático` : 'misma escala · perfil en el tubo esquemático'}
      </Tag>
    </Lens>
  );
}

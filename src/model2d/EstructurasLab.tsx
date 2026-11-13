// «Estructuras: el puente y la rotura del jarillón»: las obras que el terreno solo no representa bien. El puente
// como estructura (flujo libre por la luz con pérdidas de contracción y expansión, a presión cuando el agua toca el
// tablero y vertedero sobre el tablero y la vía), con la luz tapada por troncos; y la rotura progresiva del jarillón
// con los datos que pide HEC-RAS (ancho, fondo, taludes, tiempo de formación y disparo). La pregunta: ¿qué le hace la
// obra a la creciente?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { HydroChart, LayerLegend, SER, StageChart, XYChart, type XY } from './charts';
import { MODEL2D_TOOLS, ROOM } from './design';
import { BREACH_SITES, DEFAULT_STRUCT, LIDAR_BURNED, leveeAt, structBase, structRun, type StructScene, type Summary } from './scene';
import { BRIDGE_DEFAULT, BRIDGE_LINE, LOW_CHORD } from './solver';
import { PERIODS, quantile, AMS_FIT } from './hydrology';
import { NX, ROAD, ROAD_Z, terrainFor, truth, yc } from './terrain';
import { useModelRun, useReference } from './runs';
import { FlowTools, PLACE, RunBadge, TimeBar, VIEWS_BASE, VexChoice, WaterChoice, seriesAt, sg, useBatch, usePlayback, valleyState, vexNote, waterOf } from './common';
import { PARTICLE_SPEED, ValleyWorld, type ClickTool, type Layer } from './three/valleyWorld';

interface Ctx {
  s: StructScene;
  sum: Summary | null;
  base: Summary | null;
  qBreach: number;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'm2-troncos',
    title: 'Troncos en el puente',
    goal: 'Con el puente como estructura, tapa la luz hasta que el agua aguas arriba suba 30 cm o más sobre la corrida con el puente en el terreno.',
    hint: 'Una luz más angosta obliga al agua a correr más rápido por ella: las pérdidas de contracción y expansión crecen con el cuadrado de la velocidad.',
    check: (c) => c.s.kind === 'puente' && c.s.bridgeMode === 'estructura' && c.s.block > 0 && !!c.sum && !!c.base && c.sum.ok && c.sum.wseBridge - c.base.wseBridge >= 0.3,
    progress: (c) => (c.s.kind !== 'puente' ? 'elige el puente' : c.sum && c.base ? `${sg(c.sum.wseBridge - c.base.wseBridge)} frente al puente en el terreno` : 'esperando el cálculo'),
  },
  {
    id: 'm2-presion',
    title: 'El agua empuja el tablero',
    goal: 'Encuentra una cara inferior del tablero y una luz tapada con las que el agua aguas arriba pasa la cara inferior del tablero (flujo a presión).',
    hint: 'Un puente más bajo o una luz tapada hacen que el agua llegue al tablero: entonces la luz trabaja como una compuerta o un orificio.',
    check: (c) => c.s.kind === 'puente' && c.s.bridgeMode === 'estructura' && !!c.sum && c.sum.ok && c.sum.wseBridge > c.s.low,
    progress: (c) => (c.s.kind !== 'puente' ? 'elige el puente' : c.sum ? `agua ${es(c.sum.wseBridge, 2)} m; tablero ${es(c.s.low, 2)} m` : 'esperando el cálculo'),
  },
  {
    id: 'm2-rotura',
    title: 'Cuando el jarillón se rompe',
    goal: 'Encuentra una rotura (lugar, ancho, formación o creciente) con la que el área inundada del barrio crece 25 % o más sobre la corrida sin rotura y por ella pasan más de 3 m³/s.',
    hint: 'Aguas arriba el río va más alto respecto al barrio; una rotura ancha deja pasar más; una creciente más rara empuja más.',
    check: (c) => c.s.kind === 'rotura' && !!c.sum && !!c.base && c.sum.ok && c.sum.townArea >= 1.25 * c.base.townArea && c.qBreach > 3,
    progress: (c) => (c.s.kind !== 'rotura' ? 'elige la rotura del jarillón' : c.sum && c.base ? `barrio ${es(c.sum.townArea, 0)} frente a ${es(c.base.townArea, 0)} m²; rotura ${es(c.qBreach, 1)} m³/s` : 'esperando el cálculo'),
  },
];

export function EstructurasLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<StructScene>(DEFAULT_STRUCT);
  const [vex, setVex] = useState(3);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [particles, setParticles] = useState(true);
  const opts = useMemo(() => structRun(s), [s]);
  const run = useModelRun(opts);
  const base = useReference(structBase(s));
  const terr = useMemo(() => terrainFor(LIDAR_BURNED).fine, []);
  const sum = run.sum;
  const res = run.status === 'listo' || run.status === 'inestable' ? run.res : null;
  const qBreach = res && s.kind === 'rotura' ? Math.max(0, ...res.series.qBreach) : 0;
  const lv = useMemo(() => leveeAt(s.bx), [s.bx]);
  const fine = s.kind === 'rotura' && res?.breach?.t0 !== null && res ? res.geom.z : terr;
  const [layer, setLayer] = useState<Layer>('natural');
  const [tool, setTool] = useState<ClickTool>('sonda');
  const [notice, setNotice] = useState('');
  const world = useRef<ValleyWorld | null>(null);
  const play = usePlayback(run.status === 'listo' ? run.res : null, (f) => world.current?.setFrame(f));
  const sync = useRef({ s, run, vex, sum, fine, particles, qBreach, layer, tool, t: play.t });
  sync.current = { s, run, vex, sum, fine, particles, qBreach, layer, tool, t: play.t };
  const toWorld = () => {
    const { s: x, run: rr, vex: v, sum: sm, fine: f, particles: pt, qBreach: qb, layer: ly, tool: tl, t: tNow } = sync.current;
    const r = rr.res;
    if (world.current) world.current.onNotice = setNotice;
    const broke = x.kind === 'rotura' && !!r?.breach && r.breach.t0 !== null;
    // durante la reproducción, los rótulos dicen lo que pasa en ese instante
    const tm = tNow !== null && r ? tNow : null;
    const nowBreach =
      tm !== null && r && broke
        ? tm < (r.breach!.t0 as number)
          ? { text: `t = ${es(tm / 60, 0)} min: el jarillón resiste`, sub: `se rompe a los ${es((r.breach!.t0 as number) / 60, 0)} min` }
          : { text: `t = ${es(tm / 60, 0)} min: ${r.breach!.full !== null && tm < r.breach!.full ? 'la rotura se abre' : 'rotura abierta'}`, sub: `pasan ${es(Math.max(0, seriesAt(r.series.t, r.series.qBreach, tm)), 1)} m³/s` }
        : null;
    const nowBridge = tm !== null && r && x.kind === 'puente' ? { text: `t = ${es(tm / 60, 0)} min: ${es(seriesAt(r.series.t, r.series.wseBridge, tm), 2)} m`, sub: `pasan ${es(seriesAt(r.series.t, r.series.qBridge, tm), 1)} m³/s bajo el puente` } : null;
    world.current?.set(
      valleyState({
        vex: v,
        fine: f,
        colorBy: 'natural',
        objects: 'si',
        breaklines: false,
        bridge: x.kind === 'puente' && x.bridgeMode === 'estructura' ? { low: x.low, block: x.block } : null,
        water: waterOf(rr, ly, play.ref.current, { particles: pt }),
        breach: broke ? { before: terr } : null,
        tool: tl,
        labels:
          x.kind === 'puente'
            ? [
                nowBridge ? PLACE.puente(nowBridge.text, nowBridge.sub, 'dato') : PLACE.puente(sm ? `Puente: ${es(sm.wseBridge, 2)} m` : 'El puente', x.bridgeMode === 'estructura' ? `tablero a ${es(x.low, 2)} m${x.block ? `, luz tapada ${es(x.block * 100, 0)} %` : ''}` : 'en el terreno (sin estructura)', sm && sm.wseBridge > x.low && x.bridgeMode === 'estructura' ? 'alerta' : 'dato'),
                ...(sm ? [PLACE.barrio(`Barrio: ${es(sm.townArea, 0)} m² con agua`, undefined, sm.townArea > 400 ? 'alerta' : 'ok')] : []),
              ]
            : [
                nowBreach ? PLACE.rotura(x.bx, nowBreach.text, nowBreach.sub) : PLACE.rotura(x.bx, r?.breach?.t0 !== null && r?.breach ? `Rotura a los ${es((r.breach.t0 as number) / 60, 0)} min` : 'Aquí se rompe el jarillón', r?.breach?.t0 !== null && r ? `por ella pasan hasta ${es(qb, 1)} m³/s` : `ancho final ${x.width} m`),
                ...(sm ? [PLACE.barrio(`Barrio: ${es(sm.townArea, 0)} m² con agua`, undefined, sm.townArea > 400 ? 'alerta' : 'ok'), PLACE.escuela('La escuela', sm.school > 0.05 ? `${es(sm.school, 2)} m de agua` : 'seca', sm.school > 0.05 ? 'alerta' : 'ok')] : []),
              ],
      }),
    );
  };
  useEffect(() => {
    toWorld();
  }, [run.res, run.status, run.live, vex, sum, fine, particles, s.kind, s.low, s.block, s.bx, s.bridgeMode, qBreach, layer, tool, play.t]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, sum, base, qBreach }), [s, sum, base, qBreach]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<StructScene>) => setS((x) => ({ ...x, ...p }));
  const Q = quantile(AMS_FIT, s.T);
  const dW = sum && base ? sum.wseBridge - base.wseBridge : NaN;
  const tone: 'ok' | 'mid' | 'bad' = !sum ? 'mid' : s.kind === 'puente' ? (sum.wseBridge > s.low && s.bridgeMode === 'estructura' ? 'bad' : Number.isFinite(dW) && dW > 0.25 ? 'mid' : 'ok') : base && sum.townArea > 1.25 * base.townArea ? 'bad' : 'mid';
  const answer =
    s.kind === 'puente' ? (
      sum ? (
        <>
          Con la creciente de {s.T} años ({es(Q, 1)} m³/s) y el puente {s.bridgeMode === 'estructura' ? `como estructura (tablero a ${es(s.low, 2)} m${s.block ? `, ${es(s.block * 100, 0)} % de la luz tapada` : ''})` : 'en el terreno'}, el agua aguas arriba sube a <strong>{es(sum.wseBridge, 2)} m</strong>
          {Number.isFinite(dW) && s.bridgeMode === 'estructura' ? ` (${sg(dW)} frente al puente en el terreno)` : ''}.{' '}
          {s.bridgeMode === 'estructura' ? (sum.wseBridge > s.low ? 'El agua toca el tablero: la luz trabaja a presión.' : `Pasa libre bajo el tablero, ${es(s.low - sum.wseBridge, 2)} m por debajo.`) : 'El MDT no tiene tablero ni sabe de pérdidas en la luz: solo ve el hueco del cauce entre los terraplenes.'} El barrio queda con {es(sum.townArea, 0)} m² de agua.
        </>
      ) : (
        <>El modelo 2D está corriendo la creciente de {s.T} años con el puente…</>
      )
    ) : sum && res ? (
      res.breach?.t0 !== null && res.breach ? (
        <>
          El jarillón se rompe en x = {s.bx} m a los <strong>{es((res.breach.t0 as number) / 60, 0)} min</strong> y la rotura se completa a los {es(((res.breach.full ?? NaN) as number) / 60, 0)} min. Por ella pasan hasta {es(qBreach, 1)} m³/s y el barrio queda con {es(sum.townArea, 0)} m² de agua{base ? ` (sin la rotura: ${es(base.townArea, 0)} m²)` : ''}.
        </>
      ) : (
        <>La rotura no se disparó: el agua del lado del río no llegó a {es(lv.toe + s.trigH, 2)} m. Sube el disparo, cambia el lugar o usa una creciente mayor.</>
      )
    ) : (
      <>El modelo 2D está corriendo la creciente con el jarillón y su rotura…</>
    );

  const hudChart =
    res && s.kind === 'rotura' ? (
      <XYChart
        series={[
          { name: 'por la rotura', pts: res.series.t.map((t, k) => [t / 60, res.series.qBreach[k]] as XY), color: SER.b, width: 2.4 },
          { name: 'bajo el puente / 20', pts: res.series.t.map((t, k) => [t / 60, res.series.qBridge[k] / 20] as XY), color: SER.soft, dash: true },
        ]}
        vlines={[...(res.breach?.t0 !== null && res.breach ? [{ x: (res.breach.t0 as number) / 60, text: 'empieza' }] : []), ...(play.t !== null ? [{ x: play.t / 60, text: 'ahora' }] : [])]}
        onScrub={play.seekMin}
        tipFmt={(v) => `${es(v, 0)} min`}
        xLabel="tiempo (min)"
        yLabel="caudal (m³/s)"
        label="Caudal que entra al barrio por la rotura del jarillón, con el caudal bajo el puente dividido por 20 para ver la creciente."
      />
    ) : res ? (
      <StageChart t={res.series.t} wse={res.series.wseBridge} ref={s.bridgeMode === 'estructura' ? { y: s.low, text: 'cara inferior del tablero' } : { y: ROAD_Z, text: 'rasante de la vía' }} now={play.t} onScrub={play.seekMin} />
    ) : undefined;

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label={
            s.kind === 'puente'
              ? `Maqueta 3D del valle con el puente${s.bridgeMode === 'estructura' ? ` (tablero desde ${es(s.low, 2)} m${s.block ? ` y troncos tapando ${es(s.block * 100, 0)} % de la luz` : ''})` : ''} y el agua de la creciente de ${s.T} años${particles ? `, con partículas que siguen la velocidad (${PARTICLE_SPEED} veces más rápido)` : ''}; ${vexNote(vex)}.`
              : `Maqueta 3D del valle con el jarillón y su rotura en x = ${s.bx} m (el terreno se abre en el lugar de la rotura cuando se dispara) y el agua de la creciente de ${s.T} años${particles ? `, con partículas que siguen la velocidad (${PARTICLE_SPEED} veces más rápido)` : ''}; ${vexNote(vex)}.`
          }
          viewNames={s.kind === 'puente' ? [{ id: 'puente', label: 'El puente' }, ...VIEWS_BASE.filter((v) => v.id !== 'puente')] : [{ id: 'rotura', label: 'La rotura' }, ...VIEWS_BASE]}
          make={(st) => new ValleyWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>{res ? hudChart : null}</FlatStage>
      )}
      <Question q={s.kind === 'puente' ? '¿Qué le hace el puente a la creciente?' : '¿Qué pasa si el jarillón se rompe?'} answer={answer} tone={tone} />
      <RunBadge r={run} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={s.kind === 'puente' ? [`T = ${s.T} años`, s.bridgeMode === 'estructura' ? `tablero ${es(s.low, 2)} m` : 'en el terreno', sum ? `agua ${es(sum.wseBridge, 2)} m` : 'calculando'] : [`T = ${s.T} años`, `rotura en x = ${s.bx} m`, res?.breach?.t0 !== null && res?.breach ? `a los ${es((res.breach.t0 as number) / 60, 0)} min` : 'sin disparar']}
        chart={hudChart ?? (res ? <HydroChart t={res.series.t} qin={res.series.qin} qBridge={res.series.qBridge} qout={res.series.qout} /> : undefined)}
        traces={
          s.kind === 'puente'
            ? [
                { key: 'w', label: 'Agua aguas arriba frente al puente en el terreno', unit: 'm', value: Number.isFinite(dW) ? dW : NaN, digits: 2 },
                { key: 'q', label: 'Caudal pico bajo el puente', unit: 'm³/s', value: sum?.qBridge ?? NaN, digits: 1 },
                { key: 'a', label: 'Barrio con agua', unit: 'm²', value: sum?.townArea ?? NaN, digits: 0, ref: base ? { value: base.townArea, label: 'en el terreno' } : undefined },
              ]
            : [
                { key: 'b', label: 'Caudal máximo por la rotura', unit: 'm³/s', value: qBreach, digits: 2 },
                { key: 'a', label: 'Barrio con agua', unit: 'm²', value: sum?.townArea ?? NaN, digits: 0, ref: base ? { value: base.townArea, label: 'sin rotura' } : undefined },
                { key: 'e', label: 'Agua en la escuela', unit: 'm', value: sum?.school ?? NaN, digits: 2 },
              ]
        }
      />
      <TimeBar pb={play} res={run.status === 'listo' ? run.res : null} note={s.kind === 'rotura' ? 'Al reproducir, el jarillón se abre cuando lo abrió el modelo.' : undefined} />
      <DockChoice
        label="La obra"
        value={s.kind}
        options={[
          { value: 'puente', label: 'El puente' },
          { value: 'rotura', label: 'La rotura del jarillón' },
        ]}
        onChange={(v) => set({ kind: v as StructScene['kind'] })}
      />
      <DockChoice label="Creciente (periodo de retorno)" value={String(s.T)} options={PERIODS.filter((T) => T >= 10).map((T) => ({ value: String(T), label: `${T} años` }))} onChange={(v) => set({ T: Number(v) })} />
      {s.kind === 'puente' ? (
        <>
          <DockChoice
            label="El puente en el modelo"
            value={s.bridgeMode}
            options={[
              { value: 'estructura', label: 'Como estructura' },
              { value: 'terreno', label: 'Solo el terreno (MDT)' },
            ]}
            onChange={(v) => set({ bridgeMode: v as StructScene['bridgeMode'] })}
          />
          {s.bridgeMode === 'estructura' && (
            <>
              <DockRange label="Cara inferior del tablero" value={s.low} min={1478} max={LOW_CHORD} step={0.1} show={`${es(s.low, 2)} m`} onChange={(v) => set({ low: Math.round(v * 100) / 100 })} />
              <DockRange label="Luz tapada por troncos y basura" value={s.block} min={0} max={0.8} step={0.1} show={`${es(s.block * 100, 0)} %`} onChange={(v) => set({ block: Math.round(v * 10) / 10 })} />
            </>
          )}
        </>
      ) : (
        <>
          <DockChoice label="Lugar de la rotura" value={String(s.bx)} options={BREACH_SITES.map((x) => ({ value: String(x), label: `x = ${x} m` }))} onChange={(v) => set({ bx: Number(v) })} />
          <DockRange label="Ancho final del fondo" value={s.width} min={10} max={60} step={5} show={`${s.width} m`} onChange={(v) => set({ width: v })} />
          <DockRange label="Tiempo de formación" value={s.tForm} min={2} max={60} step={2} show={`${s.tForm} min`} onChange={(v) => set({ tForm: v })} />
          <DockChoice
            label="Se dispara por"
            value={s.trigger}
            options={[
              { value: 'nivel', label: 'Nivel del río' },
              { value: 'tiempo', label: 'Tiempo' },
            ]}
            onChange={(v) => set({ trigger: v as StructScene['trigger'] })}
          />
          {s.trigger === 'nivel' ? (
            <DockRange label="Agua sobre el pie del jarillón (lado del río)" value={s.trigH} min={0} max={1.2} step={0.05} show={`${es(s.trigH, 2)} m → ${es(lv.toe + s.trigH, 2)} m`} onChange={(v) => set({ trigH: Math.round(v * 100) / 100 })} />
          ) : (
            <DockRange label="Minuto de la creciente" value={s.tTrig} min={0} max={60} step={5} show={`${s.tTrig} min`} onChange={(v) => set({ tTrig: v })} />
          )}
        </>
      )}
      <WaterChoice value={layer} onChange={setLayer} />
      <LayerLegend layer={layer} />
      <FlowTools particles={particles} setParticles={setParticles} tool={tool} setTool={setTool} probeLabel="Solo mirar" notice={notice} />
      <VexChoice value={vex} onChange={setVex} />
    </>
  );

  const T0 = truth();
  const deckRows = useMemo(() => {
    let w = 0, floor = Infinity;
    for (let j = 0; j < 400; j++) {
      const k = j * NX + Math.floor(ROAD.x);
      if (Math.abs(T0.dist[k]) <= ROAD.open + 2) {
        w++;
        floor = Math.min(floor, terr[k]);
      }
    }
    return { w, floor };
  }, [T0, terr]);

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps m2-math">
        <h3>Por qué el terreno no basta</h3>
        <p>
          Un MDT ve el terraplén de la vía y el hueco del cauce, pero no el tablero del puente (el láser lo atraviesa o se clasifica como estructura) ni sabe qué pasa cuando el agua lo toca; un MDS, al revés, ve el tablero como si fuera tierra y tapa la luz. En HEC-RAS 2D, el puente se pone como una <strong>estructura</strong> sobre una línea de la malla (una conexión): sus caras usan las ecuaciones del puente y no las del terreno.
        </p>
        <h3>El puente como estructura</h3>
        <p>
          Aquí la estructura está en la línea de caras de x = {BRIDGE_LINE} m (aguas arriba del eje de la vía) y el terraplén se quita del terreno: lo representan sus ecuaciones. Por cada metro de la línea:
        </p>
        <p className="m2-eq">flujo libre: g·A·∂η/∂x + fricción + (Cc + Ce)·(1 − (A_luz/A_sin vía)²)·Q|Q|/(2·A²·Δx)</p>
        <p className="m2-eq">compuerta: Q = Cd·A·√(2g·(Hu − Z/2)) · orificio: Q = C·A·√(2g·ΔH)</p>
        <p className="m2-eq">vertedero: Q = Cw·L·H^1,5 · (1 − (Hd/Hu)^1,5)^0,385</p>
        <p>
          Con coeficientes típicos de HEC-RAS: contracción {es(BRIDGE_DEFAULT.cc, 1)} y expansión {es(BRIDGE_DEFAULT.ce, 1)}, compuerta {es(BRIDGE_DEFAULT.cSluice, 1)}, orificio {es(BRIDGE_DEFAULT.cOrifice, 1)} y vertedero {es(BRIDGE_DEFAULT.cwRoad, 2)} sobre la vía y {es(BRIDGE_DEFAULT.cwDeck, 2)} sobre el tablero (unidades SI). La luz tapada por troncos y basura achica el área útil: es una de las causas más comunes de inundaciones junto a los puentes en las quebradas.
        </p>
        <h3>La rotura del jarillón</h3>
        <p>
          HEC-RAS pide los datos de la rotura: el lugar, el <strong>ancho final del fondo</strong>, la <strong>cota final del fondo</strong> (aquí, el terreno natural al pie), los <strong>taludes</strong> (aquí 1H:1V), el <strong>tiempo de formación</strong> y el <strong>disparo</strong> (cuando el agua pasa una cota o a una hora). La rotura crece como un cuadrado hacia abajo y a los lados hasta llegar al fondo, y luego se ensancha hasta el ancho final. En la sala el terreno se rebaja en la rotura paso a paso y se rehacen las tablas de las celdas y caras que la tocan, conservando el agua de cada celda.
        </p>
        <p>
          El ancho, el fondo y el tiempo de formación no salen del modelo hidráulico: se estiman con ecuaciones empíricas de roturas observadas o con modelos de erosión, y se prueban varios. Este ejercicio no evalúa el jarillón real de ningún lugar.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el puente (tablero, luz tapada) o la rotura (lugar, ancho, formación, disparo): el modelo 2D corre solo con cada cambio (celdas de 10 m, inercia local)." />,
    experimentos: <StructExperiments s={s} />,
    diseno: <DesignTab part="estructuras" set={MODEL2D_TOOLS.estructuras} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El puente</caption>
          <tbody>
            <Row name="Rasante de la vía" value={`${es(ROAD_Z, 2)} m`} note="corona del terraplén y del tablero" />
            <Row name="Cara inferior del tablero" value={`${es(s.low, 2)} m`} note={`la del valle: ${es(LOW_CHORD, 2)} m (tablero de 0,6 m)`} />
            <Row name="Luz bajo el tablero" value={`${deckRows.w} m de ancho`} note={`fondo a ${es(deckRows.floor, 2)} m; gálibo ${es(s.low - deckRows.floor, 2)} m`} />
            <Row name="Línea de la estructura" value={`x = ${BRIDGE_LINE} m`} note={`eje de la vía en x = ${ROAD.x} m`} />
          </tbody>
        </table>
        <table className="q3-table">
          <caption>El jarillón en el lugar de la rotura</caption>
          <tbody>
            <Row name="Lugar" value={`x = ${s.bx} m`} note={`frente al eje del cauce en y = ${es(yc(s.bx), 0)} m`} />
            <Row name="Corona" value={`${es(lv.crest, 2)} m`} />
            <Row name="Pie (terreno natural)" value={`${es(lv.toe, 2)} m`} note={`altura ${es(lv.crest - lv.toe, 2)} m`} />
            <Row name="Disparo" value={s.trigger === 'nivel' ? `agua del lado del río a ${es(lv.toe + s.trigH, 2)} m` : `a los ${s.tTrig} min`} />
          </tbody>
        </table>
        {res && (
          <table className="q3-table">
            <caption>Registro de la corrida</caption>
            <tbody>
              {res.log.map((l, k) => (
                <tr key={k}>
                  <td>{l}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Por qué un puente y un jarillón se representan como estructuras en un modelo 2D; flujo libre con pérdidas de contracción y expansión, flujo a presión (compuerta y orificio) y vertedero con sumergencia; el efecto de la obstrucción de la luz; la rotura progresiva de un jarillón y los parámetros que la definen; la sensibilidad a esos parámetros.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Ecuaciones de puentes de HEC-RAS para flujo alto (presión y vertedero; coeficientes típicos 1,44 y 1,66 SI para tablero y vía) y sumergencia de Villemonte; pérdidas de contracción y expansión de 0,3 y 0,5. Datos de rotura de HEC-RAS (ancho y cota final del fondo, taludes, tiempo de formación, disparo por nivel o por tiempo, crecimiento lineal). Pruebas M19 y M20.
        </p>
        <h3>Límites</h3>
        <p>La estructura del puente va en una línea de caras de la malla cuadrada, a 6 m del eje real de la vía; el flujo libre por la luz usa la fórmula de las caras con las pérdidas locales, no los métodos de energía, momento o Yarnell de HEC-RAS. La rotura no calcula la erosión: sigue los parámetros que se le dan. Ilustrativo: no es una evaluación del jarillón ni del puente de ningún lugar, ni un diseño de ingeniería.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

const BRIDGE_VARS: { name: string; s: Partial<StructScene> }[] = [
  { name: 'Puente en el terreno (MDT)', s: { bridgeMode: 'terreno' } },
  { name: 'Estructura, luz libre', s: {} },
  { name: 'Estructura, 30 % tapada', s: { block: 0.3 } },
  { name: 'Estructura, 50 % tapada', s: { block: 0.5 } },
  { name: 'Tablero a 1478,30 m', s: { low: 1478.3 } },
  { name: 'Tablero a 1478,30 m y 30 % tapada', s: { low: 1478.3, block: 0.3 } },
];
const BREACH_VARS: { name: string; s: Partial<StructScene> }[] = BREACH_SITES.map((x) => ({ name: `Rotura en x = ${x} m`, s: { kind: 'rotura' as const, bx: x } }));

function StructExperiments({ s }: { s: StructScene }) {
  const bl = useMemo(() => BRIDGE_VARS.map((v) => structRun({ ...DEFAULT_STRUCT, T: s.T, ...v.s })), [s.T]);
  const br = useMemo(() => [structBase({ ...DEFAULT_STRUCT, T: s.T }), ...BREACH_VARS.map((v) => structRun({ ...DEFAULT_STRUCT, T: s.T, ...v.s }))], [s.T]);
  const b = useBatch(bl);
  const r = useBatch(br);
  return (
    <div className="q3-exps">
      <h3>El puente (creciente de {s.T} años)</h3>
      <div className="hc-flood is-inline">
        {b.busy ? (
          <span className="hc-flood-q">Corriendo… {b.done} de {bl.length}</span>
        ) : (
          <button type="button" onClick={b.go}>
            Correr las {bl.length} variantes
          </button>
        )}
      </div>
      <table className="q3-table">
        <thead>
          <tr>
            <th>Variante</th>
            <th>Agua aguas arriba</th>
            <th>Caudal pico bajo el puente</th>
            <th>Barrio con agua</th>
          </tr>
        </thead>
        <tbody>
          {BRIDGE_VARS.map((v, k) => {
            const x = b.rows[k];
            return (
              <tr key={v.name}>
                <td>{v.name}</td>
                <td>{x ? `${es(x.wseBridge, 2)} m${k && b.rows[0] ? ` (${sg(x.wseBridge - b.rows[0].wseBridge)})` : ''}` : '—'}</td>
                <td>{x ? `${es(x.qBridge, 1)} m³/s` : '—'}</td>
                <td>{x ? `${es(x.townArea, 0)} m²` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="q3-small">Aun con la luz libre, la estructura sube el agua unos centímetros por las pérdidas de contracción y expansión que el terreno solo no tiene. Tapar la luz y bajar el tablero suben el agua aguas arriba y mandan más agua sobre el jarillón hacia el barrio.</p>
      <h3>La rotura del jarillón (creciente de {s.T} años)</h3>
      <div className="hc-flood is-inline">
        {r.busy ? (
          <span className="hc-flood-q">Corriendo… {r.done} de {br.length}</span>
        ) : (
          <button type="button" onClick={r.go}>
            Correr las {br.length} corridas
          </button>
        )}
      </div>
      <table className="q3-table">
        <thead>
          <tr>
            <th>Corrida</th>
            <th>Empieza</th>
            <th>Caudal por la rotura</th>
            <th>Barrio con agua</th>
          </tr>
        </thead>
        <tbody>
          {['Sin rotura', ...BREACH_VARS.map((v) => v.name)].map((name, k) => {
            const x = r.rows[k], rr = r.res[k];
            return (
              <tr key={name}>
                <td>{name}</td>
                <td>{k === 0 ? '—' : rr ? (rr.breach?.t0 !== null && rr.breach ? `${es((rr.breach.t0 as number) / 60, 0)} min` : 'no se dispara') : '—'}</td>
                <td>{k === 0 ? '—' : rr ? `${es(Math.max(0, ...rr.series.qBreach), 1)} m³/s` : '—'}</td>
                <td>{x ? `${es(x.townArea, 0)} m²${k && r.rows[0] ? ` (+${es(((x.townArea - r.rows[0].townArea) / Math.max(1, r.rows[0].townArea)) * 100, 0)} %)` : ''}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="q3-small">Disparo por nivel: el agua del lado del río a {es(DEFAULT_STRUCT.trigH, 2)} m sobre el pie del jarillón. Aguas arriba el río va más alto sobre el barrio, que baja hacia la vía: el agua que entra por una rotura corre por las calles.</p>
    </div>
  );
}

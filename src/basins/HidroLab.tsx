// «El hidrograma»: la misma cuenca ilustrativa de 60 ha. El estudiante urbaniza, cambia el aguacero y el suelo, y
// compara el hidrograma con el de la cuenca sin urbanizar. Puede poner un tanque de retención junto a la salida (con la
// salida limitada al pico de antes) y ver si alcanza o rebosa. La pregunta: ¿cuánto crece la quebrada al urbanizar, y
// cuánta agua hay que guardar para dejarla como antes?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { ConvolutionChart, HydroAnatomy, StormChart } from './charts';
import { BasinMap } from './diagrams';
import { BASIN_TOOLS, IDF_NOTE, ROOM } from './design';
import { scsUnitHydrograph, type BasinResult, type Soil } from './hydrology';
import { DEFAULT_SCENE, detention, resample, sceneModel, volumeAbove, volumeOf, type Detention } from './scene';
import { StormButton, useStorm } from './storm';
import { BasinWorld } from './three/basinWorld';

interface HInput {
  u: number;
  dur: number;
  T: number;
  soil: Soil;
  /** Volumen del tanque (m³); 0 = sin tanque. */
  V: number;
}

interface TankRun {
  V: number;
  Vreq: number;
  overflow: number;
}

interface Ctx {
  inp: HInput;
  r: BasinResult;
  r0: BasinResult;
  Vreq: number;
  det: Detention | null;
  tankRuns: TankRun[];
}

const DEFAULT_H: HInput = { u: 0.25, dur: 60, T: 10, soil: 'C', V: 0 };
const T_OPTS = [2, 5, 10, 25, 50, 100];

const RETOS: Reto<Ctx>[] = [
  {
    id: 'cu-pico2',
    title: 'El doble de creciente',
    goal: 'Con 60 % o más de la cuenca urbanizada, logra que el pico sea al menos el doble del de la cuenca sin urbanizar.',
    hint: 'Compara la línea gris (sin urbanizar) con la azul. Los aguaceros pequeños se notan más: casi todo se infiltra en el bosque y casi nada en los techos.',
    check: (c) => c.inp.u >= 0.6 - 1e-9 && c.r.Qpeak >= 2 * c.r0.Qpeak,
    progress: (c) => `El pico es ${es(c.r.Qpeak / Math.max(1e-9, c.r0.Qpeak), 2)} veces el de antes`,
  },
  {
    id: 'cu-tanque',
    title: 'Un tanque justo',
    goal: 'Con 50 % o más urbanizado, pon un tanque que deje salir como mucho el pico de antes, sin pasarte en más de 15 % del volumen necesario.',
    hint: 'El volumen necesario es la parte del hidrograma de después que queda por encima del pico de antes. Lo ves en Experimentos.',
    check: (c) => c.inp.u >= 0.5 - 1e-9 && !!c.det && c.det.peakOut <= c.r0.Qpeak * 1.01 && c.inp.V <= 1.15 * c.Vreq,
    progress: (c) => (c.det ? `Tanque de ${es(c.inp.V, 0)} m³ para ${es(c.Vreq, 0)} m³ necesarios; sale hasta ${es(c.det.peakOut, 2)} m³/s` : 'Todavía no hay tanque.'),
  },
  {
    id: 'cu-rebosa',
    title: 'Un tanque que se queda corto',
    goal: 'Lanza un aguacero completo con un tanque más pequeño que el necesario y míralo rebosar.',
    hint: 'Pon un tanque de menos de la mitad del volumen necesario y lanza el aguacero.',
    check: (c) => c.tankRuns.some((x) => x.V > 0 && x.overflow > 1),
  },
  {
    id: 'cu-suelo',
    title: 'Un suelo que se traga el agua',
    goal: 'Sin urbanizar y con un aguacero de 10 años o menos, logra que escurra menos del 5 % de la lluvia.',
    hint: 'El suelo B (franco) infiltra mucho más que el arcilloso. El bosque ayuda.',
    check: (c) => c.inp.u < 1e-9 && c.inp.T <= 10 && c.r.Q / c.r.P < 0.05,
    progress: (c) => `Escurre ${es((c.r.Q / Math.max(1e-9, c.r.P)) * 100, 1)} %`,
  },
];

export function HidroLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [inp, setInp] = useState<HInput>(DEFAULT_H);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [tankRuns, setTankRuns] = useState<TankRun[]>([]);
  const base = { ...DEFAULT_SCENE, dur: inp.dur, T: inp.T, soil: inp.soil };
  const r = useMemo(() => sceneModel({ ...base, u: inp.u }), [inp.u, inp.dur, inp.T, inp.soil]); // eslint-disable-line react-hooks/exhaustive-deps
  const r0 = useMemo(() => sceneModel({ ...base, u: 0 }), [inp.dur, inp.T, inp.soil]); // eslint-disable-line react-hooks/exhaustive-deps
  const rMax = useMemo(() => sceneModel({ ...base, u: 0.9 }), [inp.dur, inp.T, inp.soil]); // eslint-disable-line react-hooks/exhaustive-deps
  const Qlim = r0.Qpeak;
  const Vreq = useMemo(() => volumeAbove(r.hydro, r.dt, Qlim), [r, Qlim]);
  const Vmax = Math.max(1000, Math.ceil((1.5 * volumeAbove(rMax.hydro, rMax.dt, Qlim)) / 500) * 500);
  const Vstep = Math.max(50, Math.round(Vmax / 100 / 50) * 50);
  const V = Math.min(inp.V, Vmax);
  const det = useMemo(() => (V > 0 ? detention(r.hydro, r.dt, Qlim, V) : null), [r, Qlim, V]);
  const before = useMemo(() => resample(r0.hydro, r0.dt, r.dt), [r0, r]);
  const world = useRef<BasinWorld | null>(null);
  const sync = useRef({ r, det });
  sync.current = { r, det };
  useEffect(() => {
    world.current?.set(sync.current.r);
    world.current?.setTank(sync.current.det ? sync.current.det.fill : null);
  }, [r, det]);
  const storm = useStorm(r, gl, world);
  // cada aguacero completo con el tanque de ese momento
  const seen = useRef(0);
  useEffect(() => {
    if (storm.runs.length === seen.current) return;
    seen.current = storm.runs.length;
    setTankRuns((x) => [...x, { V, Vreq, overflow: det?.overflow ?? 0 }].slice(-12));
  }, [storm.runs.length, V, Vreq, det]);
  const ctx = useMemo<Ctx>(() => ({ inp: { ...inp, V }, r, r0, Vreq, det, tankRuns }), [inp, V, r, r0, Vreq, det, tankRuns]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<HInput>) => setInp((s) => ({ ...s, ...p }));
  const total = r.hydro.length * r.dt;
  const k = storm.tNow === null ? -1 : Math.floor(storm.tNow / r.dt);
  const qIn = k >= 0 && k < r.hydro.length ? r.hydro[k] : 0;
  const fillNow = det && k >= 0 ? det.fill[Math.min(det.fill.length - 1, k)] : 0;
  const ratio = r.Qpeak / Math.max(1e-9, Qlim);
  const ok = !!det && det.peakOut <= Qlim * 1.01;
  const tone: 'ok' | 'mid' | 'bad' = det ? (ok ? 'ok' : 'bad') : ratio > 1.5 ? 'mid' : 'ok';
  const answer = (
    <>
      Sin urbanizar, el pico sería {es(Qlim, 2)} m³/s. Con {es(inp.u * 100, 0)} % urbanizado llega a <strong>{es(r.Qpeak, 2)} m³/s</strong> ({es(ratio, 1)} veces) y escurren {es(r.Q, 1)} mm en vez de {es(r0.Q, 1)} mm. Para no pasar del pico de antes hay que guardar <strong>{es(Vreq, 0)} m³</strong>.{' '}
      {det
        ? ok
          ? `Con el tanque de ${es(V, 0)} m³ sale como máximo ${es(det.peakOut, 2)} m³/s: la quebrada queda como antes.`
          : `El tanque de ${es(V, 0)} m³ se queda corto: rebosan ${es(det.overflow, 0)} m³ y salen hasta ${es(det.peakOut, 2)} m³/s.`
        : 'Prueba con el control del tanque.'}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="La misma cuenca ilustrativa en 3D, con un tanque de retención junto a la salida cuando se le da un volumen. Al lanzar el aguacero, el tanque se llena con lo que supera el caudal que se deja salir."
          viewNames={[
            { id: 'salida', label: 'La salida y el tanque' },
            { id: 'general', label: 'La cuenca' },
            { id: 'arriba', label: 'Desde arriba' },
          ]}
          make={(st) => new BasinWorld(st)}
          onReady={(w, st) => {
            world.current = w;
            w.set(sync.current.r);
            w.setTank(sync.current.det ? sync.current.det.fill : null);
            st.view(w.views.salida, false);
          }}
        />
      ) : (
        <FlatStage>
          <BasinMap r={r} tNow={storm.tNow} />
        </FlatStage>
      )}
      <Question q="¿Cuánto crece la quebrada al urbanizar, y cuánta agua hay que guardar para dejarla como antes?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const series = [
    { name: 'urbanizada', q: r.hydro, color: '#1f78b4' },
    { name: 'sin urbanizar', q: before, color: '#8a96a0', dash: '5 3' },
    ...(det ? [{ name: 'sale del tanque', q: det.out, color: '#2e7d32' }] : []),
  ];
  const dock = (
    <>
      <LiveHud
        head={[`pico ${es(r.Qpeak, 2)} m³/s`, `antes ${es(Qlim, 2)} m³/s`, det ? `sale ${es(det.peakOut, 2)} m³/s` : `guardar ${es(Vreq, 0)} m³`]}
        chart={<StormChart dt={r.dt} rain={r.rain} eff={r.eff} series={series} tNow={storm.tNow} peakLine={{ q: Qlim, label: 'pico de antes' }} />}
        traces={[
          { key: 'q', label: 'Llega a la salida', unit: 'm³/s', value: qIn, digits: 2, ref: { value: Qlim, label: 'pico de antes' } },
          det ? { key: 'f', label: 'Tanque', unit: '% lleno', value: fillNow * 100, digits: 0, ref: { value: 100, label: 'lleno' } } : { key: 'i', label: 'Lluvia', unit: 'mm/h', value: k >= 0 && k < r.rain.length ? (r.rain[k] / r.dt) * 60 : 0, digits: 0 },
        ]}
      />
      <StormButton playing={storm.playing} tNow={storm.tNow} total={total} start={storm.start} stop={storm.stop} />
      <DockRange label="Urbanizado (techos y vías)" value={Math.round(inp.u * 100)} min={0} max={90} step={5} show={`${es(inp.u * 100, 0)} %`} onChange={(v) => set({ u: v / 100 })} />
      <DockRange label="Duración del aguacero" value={inp.dur} min={15} max={180} step={15} show={`${es(inp.dur, 0)} min`} onChange={(v) => set({ dur: v })} />
      <DockRange label="Tanque de retención" value={V} min={0} max={Vmax} step={Vstep} show={V > 0 ? `${es(V, 0)} m³` : 'sin tanque'} onChange={(v) => set({ V: v })} />
      <DockChoice<Soil> label="Suelo" value={inp.soil} options={(['B', 'C', 'D'] as Soil[]).map((s) => ({ value: s, label: s }))} onChange={(v) => set({ soil: v })} />
      <DockChoice<string> label="Período de retorno (años)" value={String(inp.T)} options={T_OPTS.map((t) => ({ value: String(t), label: String(t) }))} onChange={(v) => set({ T: Number(v) })} />
    </>
  );

  const uh = useMemo(() => scsUnitHydrograph(r.inp.A / 100, r.tc.used / 60, r.dt / 60).uh, [r]);
  const vin = volumeOf(r.hydro, r.dt);
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <HydroAnatomy dt={r.dt} rain={r.rain} eff={r.eff} q={r.hydro} />
        <h3>El hidrograma: el caudal minuto a minuto</h3>
        <p>
          Arriba, la lluvia de cada intervalo (en azul oscuro la parte que escurre). Abajo, el caudal en la salida. El agua no llega toda de una vez: la de cerca sale primero y la de lejos después, por eso el hidrograma sube, llega a un pico y baja despacio. El área bajo la curva es el volumen que escurrió.
        </p>
        <h3>Urbanizar cambia las dos cosas</h3>
        <p>Los techos y las vías no dejan infiltrar (más volumen) y el agua corre más rápido por canales y cunetas (el pico llega antes). Un tanque o un jardín de lluvia guarda el exceso y lo suelta despacio.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Urbaniza, cambia el aguacero y prueba tanques. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>El tanque, en números</h3>
        <p className="q3-small">La teoría: el volumen necesario es el área del hidrograma de después que queda por encima del pico de antes. La simulación: el tanque se llena con lo que supera la salida limitada y se vacía después.</p>
        <table className="q3-table">
          <caption>Tanque con la salida limitada a {es(Qlim, 2)} m³/s</caption>
          <tbody>
            <Row name="Volumen necesario (teoría)" value={`${es(Vreq, 0)} m³`} />
            <Row name="Tanque elegido" value={V > 0 ? `${es(V, 0)} m³` : 'sin tanque'} />
            {det && <Row name="Máximo guardado (simulación)" value={`${es(det.maxStored, 0)} m³`} note={V >= Vreq ? `diferencia con la teoría ${es(Math.abs(det.maxStored - Vreq), 1)} m³` : 'el tanque se llenó'} />}
            {det && <Row name="Rebosó" value={`${es(det.overflow, 0)} m³`} />}
            {det && <Row name="Pico que sale" value={`${es(det.peakOut, 3)} m³/s`} note={ok ? 'no supera el de antes' : 'supera el de antes'} />}
            {det && <Row name="Balance: entra − sale" value={`${es(vin - volumeOf(det.out, r.dt), 1)} m³`} note={`de ${es(vin, 0)} m³ que entran`} />}
          </tbody>
        </table>
        <h3>La convolución, bloque por bloque</h3>
        <p className="q3-small">Cada bloque de lluvia efectiva produce su propio hidrograma, igual al unitario multiplicado por los milímetros del bloque y corrido en el tiempo. El hidrograma de la cuenca es la suma.</p>
        <ConvolutionChart dt={r.dt} eff={r.eff} uh={uh} />
        <h3>Aguaceros con el tanque</h3>
        {tankRuns.length ? (
          <ul className="q3-small">
            {tankRuns.slice(-5).map((x, i) => (
              <li key={i}>{x.V > 0 ? `Tanque de ${es(x.V, 0)} m³ para ${es(x.Vreq, 0)} m³ necesarios: ${x.overflow > 1 ? `rebosaron ${es(x.overflow, 0)} m³` : 'no rebosó'}.` : 'Sin tanque.'}</li>
            ))}
          </ul>
        ) : (
          <p className="q3-small">Lanza el aguacero para ver el tanque llenarse.</p>
        )}
      </div>
    ),
    diseno: <DesignTab part="hidrograma" set={BASIN_TOOLS.hidrograma} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>Antes y después de urbanizar (cuenca de 60 ha, ilustrativa)</caption>
          <thead>
            <tr>
              <th />
              <th>Sin urbanizar</th>
              <th>Con {es(inp.u * 100, 0)} %</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Tiempo de concentración</th>
              <td>{es(r0.tc.used, 1)} min</td>
              <td>{es(r.tc.used, 1)} min</td>
            </tr>
            <tr>
              <th>Lluvia / escorrentía</th>
              <td>
                {es(r0.P, 1)} / {es(r0.Q, 1)} mm
              </td>
              <td>
                {es(r.P, 1)} / {es(r.Q, 1)} mm
              </td>
            </tr>
            <tr>
              <th>CN equivalente</th>
              <td>{es(r0.CNeq, 1)}</td>
              <td>{es(r.CNeq, 1)}</td>
            </tr>
            <tr>
              <th>Pico</th>
              <td>{es(r0.Qpeak, 2)} m³/s</td>
              <td>{es(r.Qpeak, 2)} m³/s</td>
            </tr>
            <tr>
              <th>Hora del pico</th>
              <td>minuto {es(r0.tPeak, 0)}</td>
              <td>minuto {es(r.tPeak, 0)}</td>
            </tr>
            <tr>
              <th>Volumen</th>
              <td>{es(r0.vol, 0)} m³</td>
              <td>{es(r.vol, 0)} m³</td>
            </tr>
          </tbody>
        </table>
        <p className="q3-small">
          Aguacero de {inp.T} años y {inp.dur} min por bloques alternos de {r.dt} min; suelo {inp.soil}. {IDF_NOTE}
        </p>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>El hidrograma como respuesta de la cuenca; la lluvia efectiva y las pérdidas; la convolución con el hidrograma unitario; el efecto de urbanizar en el volumen, el pico y la hora del pico; el almacenamiento de aguas lluvias para no aumentar el pico aguas abajo, y por qué un tanque pequeño rebosa.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Número de curva del NRCS (TR-55, 1986) con Ia = 0,2·S para cada cobertura y su suelo, sobre la lluvia acumulada; hidrograma unitario triangular del SCS y convolución (Chow, Maidment y Mays, 1988, cap. 7 y 15). El tanque deja salir como mucho el pico de antes (como un regulador de caudal): lo que excede se guarda; si se llena, rebosa; después se vacía. El volumen necesario es el área del hidrograma por encima de ese caudal. Todo conserva la masa (pruebas C10 y C11).
        </p>
        <h3>Límites</h3>
        <p>No es el tránsito de un tanque real con la curva de descarga de su orificio y su vertedero: es el primer tanteo del volumen. La cuenca es ilustrativa, de 60 ha y pendiente de 12 %; el hidrograma no incluye caudal base.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

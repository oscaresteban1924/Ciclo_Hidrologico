// «Agua lluvia para la casa»: el techo recoge la lluvia, la canoa y el bajante la llevan a un tanque (después de
// botar el primer lavado) y el tanque abastece los sanitarios. Con un año de lluvia del valle de Aburrá, día por día,
// se ve cuándo se llena, cuándo rebosa y cuándo se vacía. La pregunta: ¿cuánta agua del acueducto se ahorra?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { TankChart } from './charts';
import { HOUSE_TOOLS, ROOM } from './design';
import { MONTHLY_MM, MONTH_NAMES, RAIN_YEAR, TARIFF, monthOfDay, tankYear } from './house';
import { DEFAULT_TANK, tankScene, type TankScene } from './scene';
import { HouseWorld } from './three/houseWorld';

const PLAY = 30;
const IDLE_DAY = 125;
const pesos = (x: number) => `$ ${Math.round(x).toLocaleString('es-CO')}`;
type R = ReturnType<typeof tankScene>;
interface Ctx {
  s: TankScene;
  r: R;
}

const ROOFS: { value: string; label: string; C: number }[] = [
  { value: '0.9', label: 'Lámina', C: 0.9 },
  { value: '0.8', label: 'Teja de barro', C: 0.8 },
  { value: '0.7', label: 'Losa', C: 0.7 },
];

const RETOS: Reto<Ctx>[] = [
  {
    id: 'ca-sanitarios',
    title: 'Los sanitarios con lluvia',
    goal: 'Atiende el 90 % o más de una demanda de 150 L/día o más con agua lluvia.',
    hint: 'Hacen falta techo suficiente para captar el agua del año y tanque suficiente para guardar la de los días lluviosos.',
    check: (c) => c.s.D >= 150 && c.r.share >= 0.9,
    progress: (c) => `${es(c.s.D, 0)} L/día, atendido ${es(c.r.share * 100, 0)} %`,
  },
  {
    id: 'ca-rebose',
    title: 'Que rebose poco',
    goal: 'Con una demanda de 150 L/día o más, logra que rebose el 10 % o menos de lo que capta el techo.',
    hint: 'Rebosa cuando el tanque ya está lleno y sigue lloviendo: más tanque, menos techo o más demanda.',
    check: (c) => c.s.D >= 150 && c.r.spillShare <= 0.1,
    progress: (c) => `rebosa el ${es(c.r.spillShare * 100, 0)} % con ${es(c.s.D, 0)} L/día`,
  },
  {
    id: 'ca-sequia',
    title: 'Ni un día vacío',
    goal: 'Con un tanque de 3 m³ o menos, pasa el año sin un solo día con el tanque vacío.',
    hint: 'En diciembre, enero y julio llueve menos. El tanque debe aguantar las rachas secas.',
    check: (c) => c.s.V <= 3 && c.r.emptyDays === 0,
    progress: (c) => `${es(c.s.V, 2)} m³, ${c.r.emptyDays} días vacío`,
  },
  {
    id: 'ca-justo',
    title: 'El tanque justo',
    goal: 'Con un tanque de 1 m³ o menos, atiende el 80 % o más de la demanda.',
    hint: 'Un tanque pequeño se llena y rebosa pronto: necesita lluvias frecuentes y suficiente techo.',
    check: (c) => c.s.V <= 1 && c.r.share >= 0.8,
    progress: (c) => `${es(c.s.V, 2)} m³ atiende el ${es(c.r.share * 100, 0)} %`,
  },
];

export function TanqueLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<TankScene>(DEFAULT_TANK);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [day, setDay] = useState<number | null>(null);
  const r = useMemo(() => tankScene(s), [s]);
  const world = useRef<HouseWorld | null>(null);
  const sync = useRef({ s, r, day });
  sync.current = { s, r, day };
  const toWorld = () => {
    const { s: x, r: y, day: d0 } = sync.current;
    const d = d0 ?? IDLE_DAY;
    const m = monthOfDay(d);
    const dom = d - [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][m] + 1;
    world.current?.set({ mode: 'lluvia', hour: 14, hrs: null, reading: 0, leak: 0, people: 4, tank: { V: x.V, S: y.S[d], rain: RAIN_YEAR[d], spill: y.spill[d] > 0, A: x.A, D: x.D, day: d, label: `${dom} de ${MONTH_NAMES[m]}` } });
  };
  useEffect(() => {
    toWorld();
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const playing = day !== null;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const d = Math.min(364, Math.max(0, Math.floor(((now - t0) / (PLAY * 1000)) * 365)));
      sync.current.day = d;
      toWorld();
      setDay(d);
      if (d >= 364) {
        setDay(null);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // el año empieza al pulsar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  useEffect(() => {
    if (day === null) toWorld();
  }, [day]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, r }), [s, r]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<TankScene>) => setS((x) => ({ ...x, ...p }));
  const d = day ?? IDLE_DAY;
  const money = r.served * (TARIFF.m3Aq + TARIFF.m3Sew);
  const tone: 'ok' | 'mid' | 'bad' = r.share >= 0.9 ? 'ok' : r.share >= 0.6 ? 'mid' : 'bad';
  const answer = (
    <>
      En el año el techo recibe {es(r.rainVol, 1)} m³ de lluvia y el tanque entrega <strong>{es(r.served, 1)} m³</strong> a los sanitarios: el <strong>{es(r.share * 100, 0)} %</strong> de lo que necesitan. Eso ahorra unos {pesos(money)} al año de acueducto y alcantarillado (tarifa ilustrativa). El tanque pasa {r.emptyDays} días vacío y rebosan {es(r.spilled, 1)} m³.
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una casa con techo de teja, canoa, bajante con separador del primer lavado y un tanque azul translúcido donde se ve el nivel del agua. Al reproducir un año, llueve en los días lluviosos, el tanque sube y baja y rebosa cuando se llena; un tubo verde lleva el agua lluvia al sanitario."
          viewNames={[
            { id: 'tanque', label: 'El tanque' },
            { id: 'fachada', label: 'La casa' },
          ]}
          make={(st) => new HouseWorld(st, 'lluvia')}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <TankChart S={r.S} spill={r.spill} V={s.V} day={day} W={520} H={240} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Cuánta agua del acueducto se ahorra con la lluvia?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`atiende ${es(r.share * 100, 0)} %`, `${es(r.served, 1)} m³ al año`, `${r.emptyDays} días vacío`]}
        chart={<TankChart S={r.S} spill={r.spill} V={s.V} day={day} />}
        traces={[
          { key: 's', label: 'En el tanque', unit: 'L', value: r.S[d] * 1000, digits: 0, ref: { value: s.V * 1000, label: 'lleno' } },
          { key: 'p', label: 'Lluvia del día', unit: 'mm', value: RAIN_YEAR[d], digits: 1 },
        ]}
      />
      <div className="hc-flood">
        {playing ? (
          <span className="hc-flood-q">
            {MONTH_NAMES[monthOfDay(day as number)]} · día {(day as number) + 1}
          </span>
        ) : (
          <button type="button" onClick={() => setDay(0)} title={`Un año de lluvia en ${PLAY} s`}>
            Un año de lluvia
          </button>
        )}
      </div>
      <DockRange label="Techo que drena al tanque" value={s.A} min={20} max={200} step={5} show={`${es(s.A, 0)} m²`} onChange={(v) => set({ A: v })} />
      <DockRange label="Tanque" value={s.V} min={0.25} max={10} step={0.25} show={`${es(s.V * 1000, 0)} L`} onChange={(v) => set({ V: v })} />
      <DockRange label="Demanda (sanitarios)" value={s.D} min={50} max={400} step={10} show={`${es(s.D, 0)} L/día`} onChange={(v) => set({ D: v })} />
      <DockChoice label="Techo" value={String(s.C)} options={ROOFS.map((x) => ({ value: x.value, label: x.label }))} onChange={(v) => set({ C: Number(v) })} />
      <DockChoice
        label="Primer lavado"
        value={String(s.ff)}
        options={[
          { value: '0', label: 'No se bota' },
          { value: '1', label: '1 mm' },
          { value: '2', label: '2 mm' },
        ]}
        onChange={(v) => set({ ff: Number(v) })}
      />
    </>
  );

  const Vs = [0.5, 1, 2, 3, 5, 8];
  const months = Array.from({ length: 12 }, (_, m) => {
    const days = r.S.map((_, k) => k).filter((k) => monthOfDay(k) === m);
    const served = days.reduce((a, k) => a + r.supplied[k], 0), dem = (days.length * s.D) / 1000;
    return { m, served, dem, spill: days.reduce((a, k) => a + r.spill[k], 0) };
  });
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <TankChart S={r.S} spill={r.spill} V={s.V} day={null} W={480} H={210} cls="hc-exp-svg cu-svg" />
        <h3>Del techo al tanque</h3>
        <p>
          Cada milímetro de lluvia sobre un metro cuadrado de techo es un litro. El techo no entrega todo (se moja, salpica): por eso se multiplica por un <strong>coeficiente</strong>. Los primeros milímetros de cada lluvia lavan el polvo y las hojas del techo; un <strong>separador del primer lavado</strong> los bota antes de que lleguen al tanque.
        </p>
        <h3>El balance de cada día</h3>
        <p>
          Cada día entra la lluvia captada y sale lo que usan los sanitarios. Si el tanque se llena, el resto <strong>rebosa</strong>; si se vacía, los sanitarios toman agua del acueducto. En el valle de Aburrá llueve en dos temporadas (marzo a mayo y septiembre a noviembre), con meses más secos entre ellas.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el techo, el tanque, la demanda y el primer lavado. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>El tanque según su tamaño</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Tanque</th>
              <th>Atiende</th>
              <th>Días vacío</th>
              <th>Rebosa</th>
            </tr>
          </thead>
          <tbody>
            {Vs.map((V) => {
              const x = tankYear({ ...s, V });
              return (
                <tr key={V} className={Math.abs(V - s.V) < 1e-9 ? 'is-on' : ''}>
                  <td>{es(V * 1000, 0)} L</td>
                  <td>{es(x.share * 100, 0)} %</td>
                  <td>{x.emptyDays}</td>
                  <td>{es(x.spilled, 1)} m³</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="q3-small">Después de cierto tamaño, más tanque casi no ayuda: lo que falta es lluvia en los meses secos.</p>
        <h3>Mes por mes</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Lluvia</th>
              <th>Atendido</th>
              <th>Rebosa</th>
            </tr>
          </thead>
          <tbody>
            {months.map((x) => (
              <tr key={x.m} className={monthOfDay(d) === x.m ? 'is-on' : ''}>
                <td>{MONTH_NAMES[x.m]}</td>
                <td>{MONTHLY_MM[x.m]} mm</td>
                <td>{es((x.served / Math.max(1e-9, x.dem)) * 100, 0)} %</td>
                <td>{es(x.spill, 2)} m³</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="lluvia" set={HOUSE_TOOLS.lluvia} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La casa y la lluvia (ilustrativas)</caption>
          <tbody>
            <Row name="Lluvia del año" value={`${es(r.annual, 0)} mm`} note="régimen bimodal del valle de Aburrá, serie ilustrativa" />
            <Row name="Días con lluvia" value={String(RAIN_YEAR.filter((p) => p > 0).length)} />
            <Row name="Techo" value={`${es(s.A, 0)} m², C = ${es(s.C, 1)}`} note={`primer lavado de ${es(s.ff, 0)} mm`} />
            <Row name="Agua captada" value={`${es(r.captured, 1)} m³ al año`} note={`de ${es(r.rainVol, 1)} m³ que caen sobre el techo`} />
            <Row name="Demanda" value={`${es(s.D, 0)} L/día`} note="sanitarios (agua no potable)" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Lluvia como lámina (1 mm sobre 1 m² = 1 L); área de captación y coeficiente; primer lavado; balance de masa diario de un tanque; confiabilidad, días de falla y rebose; por qué el tamaño del tanque tiene un límite útil; régimen de lluvias bimodal.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Balance diario «primero se llena, después se usa», como en los métodos de comportamiento de los manuales de captación de agua lluvia; coeficientes de escorrentía típicos de techos. La serie de lluvia es ilustrativa: 365 días al azar que suman la lluvia media de cada mes con el régimen bimodal del valle de Aburrá. Pruebas H5 y H6.
        </p>
        <h3>Límites</h3>
        <p>Un solo año ilustrativo: un año seco (El Niño) atiende menos. Sin evaporación ni pérdidas en el tanque. El agua lluvia sin tratamiento no es para beber ni cocinar; la red de agua lluvia nunca se conecta con la del acueducto.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

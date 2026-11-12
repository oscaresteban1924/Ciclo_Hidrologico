// «El agua hierve en la bomba»: en la entrada de la bomba la presión baja. Si baja hasta la presión de vapor, el agua
// hierve aunque esté fría: nacen burbujas que revientan contra el rodete y lo pican (cavitación). La pregunta: ¿le
// alcanza la presión al agua para entrar a la bomba sin hervir?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { CavSection, NpshChart } from './charts';
import { PUMP_TOOLS, ROOM, maxSuctionLift } from './design';
import { NPSH_MARGIN, PUMP, npsha, npshr, patm, pvap } from './pump';
import { DEFAULT_CAV, PLACES, SUCTION, cavScene, type CavScene } from './scene';
import { CavitationWorld } from './three/pumpWorlds';

type R = ReturnType<typeof cavScene>;
interface Ctx {
  s: CavScene;
  r: R;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'bo-caliente',
    title: 'Agua caliente',
    goal: 'Sin cambiar el nivel del agua (3 m bajo la bomba) ni el caudal (55 L/s), haz que el agua hierva en la bomba.',
    hint: 'Mientras más caliente el agua, más fácil hierve: su presión de vapor sube.',
    check: (c) => c.s.zs === -3 && c.s.Q === 55 && c.r.state === 'cavita',
    progress: (c) => `${es(c.s.T, 0)} °C, margen ${es(c.r.margin, 2)} m`,
  },
  {
    id: 'bo-bogota',
    title: 'En la sabana',
    goal: 'En Bogotá, con agua a 25 °C o menos, bombea 55 L/s o más sin cavitar y con margen de 0,5 m.',
    hint: 'Arriba hay menos aire empujando el agua. Baja la bomba (o sube el agua) para recuperar presión.',
    check: (c) => c.s.place === 2 && c.s.T <= 25 && c.s.Q >= 55 && c.r.state === 'ok',
    progress: (c) => `${PLACES[c.s.place].name.split(' (')[0]}, ${es(c.s.T, 0)} °C, ${es(c.s.Q, 0)} L/s, margen ${es(c.r.margin, 2)} m`,
  },
  {
    id: 'bo-ahogada',
    title: 'Agua muy caliente',
    goal: 'Bombea 40 L/s o más de agua a 80 °C o más sin cavitar y con margen.',
    hint: 'Si el agua queda por encima de la bomba («bomba ahogada»), su peso suma presión en la entrada.',
    check: (c) => c.s.T >= 80 && c.s.Q >= 40 && c.r.state === 'ok',
    progress: (c) => `${es(c.s.T, 0)} °C, ${es(c.s.Q, 0)} L/s, margen ${es(c.r.margin, 2)} m`,
  },
  {
    id: 'bo-limite',
    title: 'Al límite',
    goal: 'Ajusta el caudal hasta quedar a 2 L/s o menos del máximo sin cavitar, sin pasarlo.',
    hint: 'En la gráfica, la línea verde marca el caudal máximo con margen.',
    check: (c) => c.r.Qmax > 0 && c.s.Q <= c.r.Qmax && c.s.Q >= c.r.Qmax - 2,
    progress: (c) => `${es(c.s.Q, 0)} L/s; máximo ${es(c.r.Qmax, 1)} L/s`,
  },
];

export function CavitacionLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<CavScene>(DEFAULT_CAV);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const r = useMemo(() => cavScene(s), [s]);
  const world = useRef<CavitationWorld | null>(null);
  const sync = useRef({ s, r });
  sync.current = { s, r };
  const toWorld = () => {
    const { s: x, r: y } = sync.current;
    world.current?.set({ zs: x.zs, T: x.T, Q: x.Q, NPSHa: y.NPSHa, NPSHr: y.NPSHr, margin: y.margin, cav: y.cav, state: y.state, patm: y.patm, pv: y.pv, pIn: y.pIn, place: PLACES[x.place].name.split(' (')[0], z: PLACES[x.place].z, hfs: y.hfs });
  };
  useEffect(() => {
    toWorld();
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, r }), [s, r]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<CavScene>) => setS((x) => ({ ...x, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.state === 'cavita' ? 'bad' : r.state === 'justo' ? 'mid' : 'ok';
  const answer = (
    <>
      Al agua le quedan <strong>{es(r.NPSHa, 2)} m</strong> de presión sobre la de hervir (NPSH disponible) y la bomba pide {es(r.NPSHr, 2)} m:{' '}
      {r.state === 'cavita'
        ? `le faltan ${es(-r.margin, 2)} m. El agua hierve en el ojo del rodete y las burbujas revientan contra los álabes: ruido, vibración y metal picado.`
        : r.state === 'justo'
          ? `sobran solo ${es(r.margin, 2)} m, menos que el margen usual de ${es(NPSH_MARGIN, 1)} m.`
          : `sobran ${es(r.margin, 2)} m. Con esta instalación se pueden bombear hasta ${es(r.Qmax, 0)} L/s con margen.`}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Corte 3D de una estación de bombeo: el pozo de agua con frente de vidrio, la tubería de succión transparente con el agua coloreada por su presión (azul con presión de sobra, roja cerca de hervir) y una bomba de vidrio con su rodete. Unas flechas moradas muestran la atmósfera que empuja el agua. Cuando falta presión aparecen burbujas que revientan en el rodete."
          viewNames={[
            { id: 'general', label: 'El corte' },
            { id: 'bomba', label: 'El rodete' },
            { id: 'pozo', label: 'El pozo' },
          ]}
          make={(st) => new CavitationWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <CavSection zs={s.zs} margin={r.margin} />
        </FlatStage>
      )}
      <Question q="¿Le alcanza la presión al agua para entrar a la bomba sin hervir?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`disponible ${es(r.NPSHa, 2)} m`, `requerido ${es(r.NPSHr, 2)} m`, r.state === 'cavita' ? 'cavita' : `margen ${es(r.margin, 2)} m`]}
        chart={<NpshChart inp={r.inp} Q={s.Q} Qmax={r.Qmax} />}
        traces={[
          { key: 'm', label: 'Margen de NPSH', unit: 'm', value: r.margin, digits: 2, ref: { value: 0, label: 'hierve' } },
          { key: 'p', label: 'Presión en la entrada', unit: 'kPa', value: Math.max(0, r.pIn), digits: 1, ref: { value: r.pv, label: 'vapor' } },
        ]}
      />
      <DockChoice label="Lugar" value={String(s.place)} options={PLACES.map((p, k) => ({ value: String(k), label: p.name }))} onChange={(v) => set({ place: Number(v) })} />
      <DockRange label="Temperatura del agua" value={s.T} min={5} max={95} step={1} show={`${es(s.T, 0)} °C`} onChange={(v) => set({ T: v })} />
      <DockRange label="Nivel del agua respecto a la bomba" value={s.zs} min={-7} max={3} step={0.5} show={s.zs >= 0 ? `${es(s.zs, 1)} m arriba` : `${es(-s.zs, 1)} m abajo`} onChange={(v) => set({ zs: v })} />
      <DockRange label="Caudal" value={s.Q} min={10} max={90} step={1} show={`${es(s.Q, 0)} L/s`} onChange={(v) => set({ Q: v })} />
    </>
  );

  const temps = [10, 20, 40, 60, 80];
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <CavSection zs={s.zs} margin={r.margin} W={480} H={220} />
        <h3>¿Por qué hierve el agua fría?</h3>
        <p>
          El agua hierve cuando su presión baja hasta la <strong>presión de vapor</strong>: a 100 °C eso pasa con la presión del aire al nivel del mar, pero a 20 °C basta con que la presión baje a unos 2,3 kPa. En la entrada de una bomba la presión baja mucho: la atmósfera empuja el agua, pero tiene que subirla, vencer la fricción y acelerarla hasta el rodete.
        </p>
        <h3>NPSH: la presión que sobra</h3>
        <p>
          El <strong>NPSH disponible</strong> es lo que le queda al agua sobre la presión de vapor al llegar a la bomba. El fabricante dice cuánto <strong>necesita</strong> la bomba (NPSH requerido), y crece con el caudal. Si lo disponible es menor, la bomba cavita: las burbujas nacen en el ojo del rodete y revientan al llegar a la zona de alta presión.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el lugar, la temperatura, el nivel del agua y el caudal. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>De dónde sale el NPSH disponible</h3>
        <table className="q3-table">
          <tbody>
            <Row name="Atmósfera" value={`+ ${es(r.atm, 2)} m`} note={`${es(r.patm, 1)} kPa en ${PLACES[s.place].name.split(' (')[0]}`} />
            <Row name="Presión de vapor" value={`− ${es(r.vap, 2)} m`} note={`${es(r.pv, 2)} kPa a ${es(s.T, 0)} °C`} />
            <Row name="Nivel del agua sobre el eje" value={`${s.zs >= 0 ? '+' : '−'} ${es(Math.abs(s.zs), 2)} m`} />
            <Row name="Pérdidas en la succión" value={`− ${es(r.hfs, 2)} m`} note={`${es(r.V, 2)} m/s en 8"`} />
            <Row name="NPSH disponible" value={`${es(r.NPSHa, 2)} m`} />
            <Row name="NPSH requerido por la bomba" value={`${es(r.NPSHr, 2)} m`} note={`con ${es(s.Q, 0)} L/s`} />
          </tbody>
        </table>
        <h3>Caudal máximo sin cavitar (con 0,5 m de margen)</h3>
        <p className="q3-small">Con el agua {s.zs >= 0 ? `${es(s.zs, 1)} m sobre` : `${es(-s.zs, 1)} m bajo`} el eje de la bomba.</p>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Agua</th>
              {PLACES.map((p) => (
                <th key={p.name}>{p.name.split(' (')[0]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {temps.map((T) => (
              <tr key={T} className={T === s.T ? 'is-on' : ''}>
                <td>{T} °C</td>
                {PLACES.map((p, k) => {
                  const q = cavScene({ ...s, T, place: k }).Qmax;
                  return <td key={p.name}>{q <= 0 ? 'cavita' : q >= 99 ? 'más de 99' : `${es(q, 0)} L/s`}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Hasta qué altura sobre el agua puede ir la bomba</h3>
        <p className="q3-small">Con {es(s.Q, 0)} L/s y agua a {es(s.T, 0)} °C. Negativo: la bomba debe quedar bajo el agua.</p>
        <table className="q3-table">
          <tbody>
            {PLACES.map((p) => {
              const hfs = npsha({ ...r.inp, zs: 0 }, s.Q).hfs;
              const lift = maxSuctionLift(p.z, s.T, hfs, npshr(PUMP, s.Q));
              return <Row key={p.name} name={p.name} value={`${es(lift, 2)} m`} note={`atmósfera ${es(patm(p.z), 1)} kPa`} />;
            })}
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="cavitacion" set={PUMP_TOOLS.cavitacion} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La succión (ilustrativa)</caption>
          <tbody>
            <Row name="Tubería de succión" value={`acero 8", ${SUCTION.Ls} m`} note={`K = ${es(SUCTION.Ks, 1)} (válvula de pie y codo)`} />
            <Row name="NPSH requerido" value={`${es(PUMP.NPSHr0, 1)} m + ${es(PUMP.b, 4)}·Q²`} note="Q en L/s; curva típica de catálogo" />
            <Row name="Presión de vapor" value={`${es(pvap(s.T), 2)} kPa`} note={`a ${es(s.T, 0)} °C`} />
            <Row name="Lugar" value={PLACES[s.place].name} note={`atmósfera estándar: ${es(r.patm, 1)} kPa`} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Presión absoluta y atmosférica; presión de vapor y ebullición; energía en la succión; NPSH disponible y requerido; por qué las bombas en ciudades altas y con agua caliente se instalan más abajo; daño por cavitación.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Atmósfera estándar de 1976; presión de vapor con la fórmula de Tetens; densidad del agua con un ajuste usual. NPSHa = (patm − pv)/(ρg) + zs − pérdidas (Karassik y otros, 2008; Mays, 2010). Margen usual de 0,5 m. Pruebas B4 y B5.
        </p>
        <h3>Límites</h3>
        <p>La curva de NPSH requerido es ilustrativa; la de una bomba real la da el fabricante, a menudo con un criterio de 3 % de caída de altura. Sin gases disueltos ni vórtices en la toma. Las burbujas de la maqueta son una representación: el tamaño real es de fracciones de milímetro.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

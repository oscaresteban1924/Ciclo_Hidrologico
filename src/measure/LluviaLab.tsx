// «Medir la lluvia»: un pluviómetro de balancín cuenta vuelcos de 0,2 mm; mientras se vuelca y cuando hay viento,
// se le escapa agua. Un radar mide la reflectividad de las gotas y la convierte en lluvia con una relación Z-R que
// depende del tipo de lluvia. La pregunta: ¿cuánto llovió de verdad?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { DbzScale, StormChart } from './charts';
import { MEASURE_TOOLS, ROOM } from './design';
import { ORIFICE_CM2, TIP_MM, TIP_S, ZR, catchRatio, dbz, gaugeIntensity, rainFromDbz, type ZRKey } from './measure';
import { DEFAULT_RAIN, rainScene, type RainScene } from './scene';
import { RainWorld } from './three/measureWorlds';

const PLAY = 20;
type R = ReturnType<typeof rainScene>;
interface Ctx {
  s: RainScene;
  r: R;
  played: boolean;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'me-balancin',
    title: 'El balancín se queda corto',
    goal: 'Sin viento, encuentra una lluvia con la que el balancín registra 8 % menos o más.',
    hint: 'Mientras el cubo se vuelca (medio segundo) el agua que cae se pierde. Con más lluvia, más vuelcos por hora.',
    check: (c) => c.s.u === 0 && c.r.errGauge <= -0.08,
    progress: (c) => `viento ${es(c.s.u, 1)} m/s, registra ${es(c.r.errGauge * 100, 1)} %`,
  },
  {
    id: 'me-viento',
    title: 'El viento se lleva la lluvia',
    goal: 'Con una lluvia de 20 mm/h o menos, encuentra un viento con el que el pluviómetro pierde 8 % o más.',
    hint: 'El aire se acelera sobre la boca del pluviómetro y desvía las gotas: más viento, más pérdida.',
    check: (c) => c.s.I <= 20 && c.r.errGauge <= -0.08,
    progress: (c) => `${es(c.s.I, 0)} mm/h con ${es(c.s.u, 1)} m/s: ${es(c.r.errGauge * 100, 1)} %`,
  },
  {
    id: 'me-zr',
    title: 'La relación correcta',
    goal: 'Con una lluvia tropical de 50 mm/h o más, elige la relación Z-R con la que el radar acierta (5 % o menos de error).',
    hint: 'La lluvia tropical tiene muchas gotas pequeñas: la misma reflectividad trae más agua que en una lluvia estratiforme.',
    check: (c) => c.s.type === 'trop' && c.s.I >= 50 && Math.abs(c.r.errRadar) <= 0.05,
    progress: (c) => `lluvia ${ZR[c.s.type].short.toLowerCase()}, radar con ${ZR[c.s.algo].short.toLowerCase()}: ${es(c.r.errRadar * 100, 0)} %`,
  },
  {
    id: 'me-tormenta',
    title: 'Un aguacero completo',
    goal: 'Mira un aguacero entero («Que llueva») con el que el balancín registra el total con 3 % de error o menos.',
    hint: 'Los vuelcos se cuentan enteros: el último pedazo de cubo no se registra. Con menos viento se pierde menos.',
    check: (c) => c.played && Math.abs(c.r.errStorm) <= 0.03,
    progress: (c) => (c.played ? `registró ${es(c.r.storm.totalM, 1)} de ${es(c.r.storm.total, 1)} mm (${es(c.r.errStorm * 100, 1)} %)` : 'todavía no has visto un aguacero completo'),
  },
];

export function LluviaLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<RainScene>(DEFAULT_RAIN);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [k, setK] = useState<number | null>(null);
  const [played, setPlayed] = useState(false);
  const r = useMemo(() => rainScene(s), [s]);
  const world = useRef<RainWorld | null>(null);
  const sync = useRef({ s, r, k });
  sync.current = { s, r, k };
  const toWorld = () => {
    const { s: x, r: y, k: kk } = sync.current;
    const live = kk === null;
    const I = live ? x.I : y.storm.I[kk];
    const Im = gaugeIntensity(I, x.u);
    const Z = dbz(Math.max(0.01, I), x.type);
    world.current?.set({ I, Im, u: x.u, dbz: Z, Rr: rainFromDbz(Z, x.algo), tips: live ? 0 : y.storm.tips[kk], P: live ? 0 : y.storm.P[kk], Pm: live ? 0 : y.storm.tips[kk] * TIP_MM, algo: ZR[x.algo].short.toLowerCase(), live });
  };
  useEffect(() => {
    toWorld();
    setK(null);
    setPlayed(false);
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const playing = k !== null;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const t0 = performance.now();
    const n = r.storm.t.length - 1;
    const loop = (now: number) => {
      const kk = Math.min(n, Math.max(0, Math.floor(((now - t0) / (PLAY * 1000)) * n)));
      sync.current.k = kk;
      toWorld();
      setK(kk);
      if (kk >= n) {
        setK(null);
        setPlayed(true);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // el bucle empieza al pulsar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);
  useEffect(() => {
    if (k === null) toWorld();
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, r, played }), [s, r, played]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<RainScene>) => setS((x) => ({ ...x, ...p }));
  const i = k ?? r.storm.t.length - 1;
  const tone: 'ok' | 'mid' | 'bad' = Math.abs(r.errGauge) <= 0.03 && Math.abs(r.errRadar) <= 0.1 ? 'ok' : Math.abs(r.errGauge) <= 0.08 ? 'mid' : 'bad';
  const answer = (
    <>
      Llueven <strong>{es(s.I, 1)} mm/h</strong>. El pluviómetro registra {es(r.Im, 1)} mm/h ({es(r.errGauge * 100, 1)} %): el viento le quita {es(-r.errWind * 100, 1)} % y el tiempo de vuelco el resto. El radar ve {es(r.Z, 1)} dBZ y, con la relación {ZR[s.algo].short.toLowerCase()}, estima {es(r.Rr, 1)} mm/h ({r.errRadar >= 0 ? '+' : ''}
      {es(r.errRadar * 100, 0)} %){s.algo === s.type ? ': la relación es la de esta lluvia.' : '. La relación no es la de esta lluvia: los radares se ajustan con pluviómetros.'}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una estación meteorológica en una pradera: un pluviómetro de balancín con camisa de vidrio donde se ve el cubo que se vuelca, un anemómetro, un registrador con pantalla y, a lo lejos, un radar en una loma cuyo haz barre el aguacero y pinta su reflectividad sobre el terreno."
          viewNames={[
            { id: 'estacion', label: 'La estación' },
            { id: 'pluviometro', label: 'El balancín' },
            { id: 'radar', label: 'El radar' },
          ]}
          make={(st) => new RainWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <StormChart s={r.storm} k={k} W={520} H={240} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Cuánto llovió de verdad?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`real ${es(s.I, 1)} mm/h`, `pluviómetro ${es(r.Im, 1)} mm/h`, `radar ${es(r.Rr, 1)} mm/h`]}
        chart={
          <>
            <StormChart s={r.storm} k={k} />
            <DbzScale dbz={r.Z} />
          </>
        }
        traces={[
          { key: 'P', label: 'Lluvia real acumulada', unit: 'mm', value: r.storm.P[i], digits: 1 },
          { key: 'Pm', label: 'Registrada (vuelcos)', unit: 'mm', value: r.storm.tips[i] * TIP_MM, digits: 1 },
        ]}
      />
      <div className="hc-flood">
        {playing ? (
          <span className="hc-flood-q">minuto {es(r.storm.t[k as number] * 60, 0)}</span>
        ) : (
          <button type="button" onClick={() => setK(0)} title={`Un aguacero de una hora en ${PLAY} s`}>
            Que llueva
          </button>
        )}
      </div>
      <DockRange label="Lluvia (pico del aguacero)" value={s.I} min={2} max={150} step={1} show={`${es(s.I, 0)} mm/h`} onChange={(v) => set({ I: v })} />
      <DockRange label="Viento en la boca" value={s.u} min={0} max={10} step={0.5} show={`${es(s.u, 1)} m/s`} onChange={(v) => set({ u: v })} />
      <DockChoice label="Tipo de lluvia" value={s.type} options={(Object.keys(ZR) as ZRKey[]).map((x) => ({ value: x, label: ZR[x].short }))} onChange={(v) => set({ type: v })} />
      <DockChoice label="Relación Z-R del radar" value={s.algo} options={(Object.keys(ZR) as ZRKey[]).map((x) => ({ value: x, label: ZR[x].short }))} onChange={(v) => set({ algo: v })} />
    </>
  );

  const Is = [10, 40, 80, 120, 150];
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <StormChart s={r.storm} k={null} W={480} H={200} cls="hc-exp-svg cu-svg" />
        <h3>El balancín</h3>
        <p>
          La lluvia entra por una boca de {ORIFICE_CM2} cm² y un embudo la lleva a un <strong>balancín</strong> con dos cubos. Cuando un cubo junta el agua de {es(TIP_MM, 1)} mm de lluvia, se vuelca, se vacía y pone el otro debajo; cada vuelco cierra un contacto que el registrador cuenta. Mientras se vuelca, el agua que cae se pierde; y el viento desvía gotas sobre la boca.
        </p>
        <h3>El radar</h3>
        <p>
          El radar manda pulsos y mide cuánta energía le devuelven las gotas: la <strong>reflectividad</strong> Z (en dBZ). Las gotas grandes devuelven muchísimo más que las pequeñas, así que la misma lluvia puede dar reflectividades distintas. Para convertir Z en lluvia se usa una relación Z = a·R^b que depende del tipo de lluvia.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la lluvia, el viento, el tipo de lluvia y la relación del radar. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Lo que pierde el balancín</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Lluvia</th>
              <th>Vuelcos por hora</th>
              <th>Sin viento</th>
              <th>Con {es(s.u, 1)} m/s</th>
            </tr>
          </thead>
          <tbody>
            {Is.map((I) => (
              <tr key={I}>
                <td>{I} mm/h</td>
                <td>{es(gaugeIntensity(I, s.u) / TIP_MM, 0)}</td>
                <td>{es((gaugeIntensity(I, 0) / I - 1) * 100, 1)} %</td>
                <td>{es((gaugeIntensity(I, s.u) / I - 1) * 100, 1)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="q3-small">El tiempo de vuelco ({TIP_S} s) pesa más con lluvias fuertes; el viento ({es((1 - catchRatio(s.u)) * 100, 1)} % con {es(s.u, 1)} m/s) pesa igual con cualquier lluvia.</p>
        <h3>El radar con cada relación</h3>
        <p className="q3-small">Lo que estima el radar con {es(s.I, 0)} mm/h reales, según el tipo de lluvia (filas) y la relación que usa (columnas).</p>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Lluvia</th>
              {(Object.keys(ZR) as ZRKey[]).map((a) => (
                <th key={a}>{ZR[a].short}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(ZR) as ZRKey[]).map((t) => (
              <tr key={t} className={t === s.type ? 'is-on' : ''}>
                <td>{ZR[t].short} ({es(dbz(s.I, t), 1)} dBZ)</td>
                {(Object.keys(ZR) as ZRKey[]).map((a) => (
                  <td key={a} className={a === s.algo && t === s.type ? 'is-on' : ''}>{es(rainFromDbz(dbz(s.I, t), a), 1)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <h3>El aguacero de una hora</h3>
        <table className="q3-table">
          <tbody>
            <Row name="Lluvia real" value={`${es(r.storm.total, 2)} mm`} note={`pico de ${es(s.I, 0)} mm/h a la media hora`} />
            <Row name="Registrada" value={`${es(r.storm.totalM, 2)} mm`} note={`${r.storm.tips[r.storm.tips.length - 1]} vuelcos de ${es(TIP_MM, 1)} mm`} />
            <Row name="Diferencia" value={`${es(r.errStorm * 100, 1)} %`} />
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="lluvia" set={MEASURE_TOOLS.lluvia} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La estación (ilustrativa)</caption>
          <tbody>
            <Row name="Pluviómetro" value={`balancín de ${es(TIP_MM, 1)} mm`} note={`boca de ${ORIFICE_CM2} cm², vuelco de ${TIP_S} s`} />
            <Row name="Pérdida por viento" value={`${es((1 - catchRatio(s.u)) * 100, 1)} %`} note="aproximación ilustrativa; la OMM reporta 2 % a 10 % para lluvia" />
            <Row name="Relación del radar" value={`Z = ${ZR[s.algo].a}·R^${es(ZR[s.algo].b, 1)}`} note={ZR[s.algo].src} />
            <Row name="Relación de esta lluvia" value={`Z = ${ZR[s.type].a}·R^${es(ZR[s.type].b, 1)}`} note={ZR[s.type].src} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Cómo funciona un pluviómetro de balancín; errores sistemáticos (tiempo de vuelco y viento) y su corrección; intensidad y lámina acumulada; qué mide un radar meteorológico; reflectividad, dBZ y relaciones Z-R; por qué el radar se calibra con pluviómetros; densidad de una red de pluviómetros.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Relaciones Z-R de Marshall y Palmer (1948), del radar WSR-88D para lluvia convectiva (Fulton y otros, 1998) y tropical (Rosenfeld, Wolff y Atlas, 1993). El tiempo de vuelco se modela con un ciclo de llenado y vuelco; la pérdida por viento, con una aproximación ilustrativa dentro del rango de la OMM (Guía de instrumentos, OMM-n.º 8). Densidades mínimas de la OMM-n.º 168. Pruebas M1 a M3.
        </p>
        <h3>Límites</h3>
        <p>La celda de lluvia del radar es ideal (una campana centrada en la estación) y el radar no tiene atenuación, bloqueo por montañas ni banda brillante. El pluviómetro y la estación son ilustrativos: no son de la red del IDEAM ni de un sistema de alerta.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

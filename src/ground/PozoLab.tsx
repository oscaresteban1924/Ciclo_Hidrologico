// «El pozo»: un pozo que bombea de un acuífero confinado, en un corte que pasa por el pozo. El estudiante cambia el
// material, el caudal y el tiempo de bombeo; el cono de abatimiento crece en el tiempo (Theis) y tres pozos de
// observación lo miden. La pregunta: ¿cuánto baja el agua alrededor del pozo, y hasta dónde llega el efecto?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { DrawdownChart } from './charts';
import { GROUND_TOOLS, ROOM } from './design';
import { SOILS, cooperJacob, fitCooperJacob, radiusOfInfluence, theis, type Soil } from './aquifer';
import { WELL, pumpingTest, wellT, type WellScene } from './scene';
import { WellWorld } from './three/groundWorlds';

const SOILS_W: Soil[] = ['grava', 'arena', 'arenafina'];
const R_OBS = 50;
/** Margen entre el nivel estático y el techo del acuífero (m). */
const MARGIN = 4;

interface Ctx {
  s: WellScene;
  sw: number;
  R: number;
  Test: number | null;
}

const cjErr = (s: WellScene, r: number) => {
  const T = wellT(s.soil), Q = s.Qls * 86.4;
  const th = theis(Q, T, WELL.S, r, s.t);
  return Math.abs(cooperJacob(Q, T, WELL.S, r, s.t) - th) / Math.max(1e-9, th);
};

const RETOS: Reto<Ctx>[] = [
  {
    id: 'as-confinado',
    title: 'Más abajo del techo',
    goal: `Bombea tanto que el nivel en el pozo baje más de ${MARGIN} m: queda por debajo del techo del acuífero y deja de ser confinado (Theis ya no vale).`,
    hint: 'Un material menos permeable o más caudal hacen el cono más hondo.',
    check: (c) => c.sw > MARGIN,
    progress: (c) => `El pozo baja ${es(c.sw, 2)} m`,
  },
  {
    id: 'as-prueba',
    title: 'La prueba de bombeo',
    goal: 'En Experimentos, lee la recta de Cooper-Jacob y calcula la transmisividad con menos de 10 % de diferencia con la del acuífero.',
    hint: 'T = 2,30·Q/(4π·Δs), con Δs el abatimiento que crece en un ciclo logarítmico (de 0,1 a 1 día, por ejemplo). Q en m³/día.',
    check: (c) => c.Test !== null && Math.abs(c.Test - wellT(c.s.soil)) / wellT(c.s.soil) < 0.1,
    progress: (c) => (c.Test === null ? 'Escribe tu lectura en Experimentos.' : `Tu T = ${es(c.Test, 0)} m²/día`),
  },
  {
    id: 'as-radio',
    title: 'Hasta dónde llega',
    goal: 'Logra que el radio de influencia pase de 3 km.',
    hint: 'El cono sigue creciendo mientras se bombea: R = √(2,25·T·t/S). Con más tiempo o más transmisividad llega más lejos.',
    check: (c) => c.R > 3000,
    progress: (c) => `Radio de influencia: ${es(c.R, 0)} m`,
  },
  {
    id: 'as-jacob',
    title: 'Cuando Cooper-Jacob falla',
    goal: 'En el pozo de observación de 200 m, encuentra un tiempo de bombeo con el que Cooper-Jacob se equivoque más de 10 % respecto a Theis.',
    hint: 'La recta de Cooper-Jacob solo vale cuando u = r²S/(4Tt) es pequeño: lejos del pozo y al principio del bombeo, u es grande.',
    check: (c) => cjErr(c.s, 200) > 0.1,
    progress: (c) => `Diferencia a 200 m: ${es(cjErr(c.s, 200) * 100, 1)} %`,
  },
];

export function PozoLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<WellScene>({ soil: 'arena', Qls: 10, t: 1 });
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [Test, setTest] = useState<number | null>(null);
  const [tNow, setTNow] = useState<number | null>(null);
  const world = useRef<WellWorld | null>(null);
  const sync = useRef(s);
  sync.current = s;
  useEffect(() => world.current?.set(sync.current), [s]);
  useEffect(() => setTNow(null), [s]);
  // bombeo en tiempo logarítmico: de 1,4 minutos al tiempo elegido en 16 s
  useEffect(() => {
    if (tNow === null) return;
    let raf = 0;
    const t0 = performance.now(), a = Math.log10(0.001), b = Math.log10(sync.current.t);
    const loop = (now: number) => {
      const k = Math.min(1, (now - t0) / 16000);
      const t = Math.pow(10, a + k * (b - a));
      world.current?.at(t);
      if (k >= 1) {
        setTNow(null);
        world.current?.at(sync.current.t);
        return;
      }
      setTNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // el bucle empieza al pulsar y sigue solo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tNow === null]);
  const T = wellT(s.soil), Q = s.Qls * 86.4;
  const tShow = tNow ?? s.t;
  const sw = theis(Q, T, WELL.S, WELL.rw, tShow), s50 = theis(Q, T, WELL.S, R_OBS, tShow);
  const R = radiusOfInfluence(T, WELL.S, s.t);
  const pts = useMemo(() => pumpingTest(s, R_OBS), [s]);
  const ctx = useMemo<Ctx>(() => ({ s, sw: theis(Q, T, WELL.S, WELL.rw, s.t), R, Test }), [s, Q, T, R, Test]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<WellScene>) => setS((x) => ({ ...x, ...p }));
  const tLabel = (t: number) => (t < 1 / 24 ? `${es(t * 1440, 0)} min` : t < 1 ? `${es(t * 24, 1)} horas` : `${es(t, 1)} días`);
  const tone: 'ok' | 'mid' | 'bad' = ctx.sw > MARGIN ? 'bad' : ctx.sw > MARGIN / 2 ? 'mid' : 'ok';
  const answer = (
    <>
      Bombeando {es(s.Qls, 1)} L/s durante {tLabel(s.t)} de un acuífero de {SOILS[s.soil].name.toLowerCase()} (T = {es(T, 0)} m²/día), el nivel baja <strong>{es(ctx.sw, 2)} m</strong> en el pozo y {es(theis(Q, T, WELL.S, R_OBS, s.t), 2)} m a {R_OBS} m. El cono sigue creciendo mientras se bombea: ya se siente hasta unos <strong>{es(R / 1000, 1)} km</strong>.{' '}
      {ctx.sw > MARGIN ? 'El nivel bajó del techo del acuífero: deja de ser confinado y Theis ya no vale.' : ''}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una llanura cortada por un pozo que bombea de un acuífero de arena bajo una capa de arcilla. La superficie azul translúcida es el nivel piezométrico, que forma un cono alrededor del pozo; tres pozos de observación muestran el nivel a 10, 50 y 200 m. El cono se dibuja con la escala vertical exagerada y el rótulo lo dice."
          viewNames={[
            { id: 'general', label: 'La llanura' },
            { id: 'pozo', label: 'El pozo' },
            { id: 'arriba', label: 'Desde arriba' },
          ]}
          make={(st) => new WellWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <DrawdownChart s={s} r={R_OBS} pts={pts} tNow={tNow} W={520} H={260} cls="hc-exp-svg cu-svg" />
        </FlatStage>
      )}
      <Question q="¿Cuánto baja el agua alrededor del pozo, y hasta dónde llega el efecto?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`T = ${es(T, 0)} m²/día`, `pozo −${es(sw, 2)} m`, `R ≈ ${es(R / 1000, 1)} km`]}
        chart={<DrawdownChart s={s} r={R_OBS} pts={pts} tNow={tNow} />}
        traces={[
          { key: 'w', label: 'Abatimiento en el pozo', unit: 'm', value: sw, digits: 2, ref: { value: MARGIN, label: 'techo del acuífero' } },
          { key: 'o', label: `Abatimiento a ${R_OBS} m`, unit: 'm', value: s50, digits: 3 },
        ]}
      />
      <div className="hc-flood">
        {tNow !== null ? (
          <span className="hc-flood-q">{tLabel(tNow)}</span>
        ) : (
          <button type="button" onClick={() => setTNow(0.001)} title="El cono crece desde el primer minuto hasta el tiempo elegido">
            Bombear
          </button>
        )}
      </div>
      <DockChoice<Soil> label="Acuífero" value={s.soil} options={SOILS_W.map((k) => ({ value: k, label: SOILS[k].name }))} onChange={(v) => set({ soil: v })} />
      <DockRange label="Caudal de bombeo" value={s.Qls} min={1} max={20} step={0.5} show={`${es(s.Qls, 1)} L/s`} onChange={(v) => set({ Qls: v })} />
      <DockRange label="Tiempo de bombeo" value={Math.log10(s.t)} min={-2} max={1.5} step={0.05} show={tLabel(s.t)} onChange={(v) => set({ t: Math.round(Math.pow(10, v) * 1000) / 1000 })} />
    </>
  );

  const fit = fitCooperJacob(pts, Q, R_OBS);
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <DrawdownChart s={s} r={R_OBS} pts={pts} tNow={null} W={480} H={230} cls="hc-exp-svg cu-svg" />
        <h3>El cono de abatimiento</h3>
        <p>
          Al bombear, el pozo saca agua guardada a su alrededor y el nivel baja formando un cono. En un acuífero confinado, el agua sale de la compresión del agua y del esqueleto del suelo (el coeficiente de almacenamiento S), así que el cono se extiende rápido y lejos. <strong>Theis</strong> calcula cuánto baja el nivel a cada distancia y en cada momento.
        </p>
        <h3>La recta de Cooper-Jacob</h3>
        <p>Después de un tiempo, el abatimiento crece lo mismo en cada ciclo logarítmico del tiempo: en papel semilogarítmico las lecturas forman una recta. De su pendiente sale la transmisividad T y de dónde corta el cero, el coeficiente de almacenamiento. Así se mide un acuífero real con una prueba de bombeo.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el acuífero, el caudal y el tiempo, bombea y analiza la prueba. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Analiza la prueba de bombeo</h3>
        <p className="q3-small">
          Lecturas en el pozo de observación a {R_OBS} m con {es(s.Qls, 1)} L/s ({es(Q, 1)} m³/día), con ±1 cm de error de lectura. Mira cuánto crece el abatimiento en un ciclo logarítmico (Δs) en la parte recta de la gráfica.
        </p>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Tiempo (días)</th>
              <th>Abatimiento (m)</th>
            </tr>
          </thead>
          <tbody>
            {pts.filter((_, k) => k % 2 === 1 || k === pts.length - 1).map((p) => (
              <tr key={p.t}>
                <td>{p.t < 0.01 ? p.t.toExponential(2) : es(p.t, 3)}</td>
                <td>{es(p.s, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <TReading Q={Q} onResult={setTest} key={`${s.soil}-${s.Qls}-${s.t}`} />
        {fit && <p className="q3-small">Ajuste automático por mínimos cuadrados con la mitad final de las lecturas: Δs = {es(fit.ds, 3)} m por ciclo, T = {es(fit.T, 0)} m²/día y S = {fit.S.toExponential(2)} (el acuífero tiene T = {es(T, 0)} y S = {WELL.S.toExponential(0)}).</p>}
      </div>
    ),
    diseno: <DesignTab part="pozo" set={GROUND_TOOLS.pozo} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El acuífero y el pozo (ilustrativos)</caption>
          <tbody>
            <Row name="Acuífero" value={`${SOILS[s.soil].name}, ${WELL.b} m de espesor`} note={`K = ${SOILS[s.soil].K} m/día`} />
            <Row name="Transmisividad T = K·b" value={`${es(T, 0)} m²/día`} />
            <Row name="Coeficiente de almacenamiento" value={WELL.S.toExponential(0)} />
            <Row name="Nivel estático" value={`${MARGIN} m sobre el techo del acuífero`} note="bajo una capa de arcilla" />
            <Row name="Caudal" value={`${es(s.Qls, 1)} L/s = ${es(Q, 1)} m³/día`} />
            {WELL.rObs.map((r) => (
              <Row key={r} name={`Abatimiento a ${r} m`} value={`${es(theis(Q, T, WELL.S, r, s.t), 3)} m`} note={`u = ${((r * r * WELL.S) / (4 * T * s.t)).toExponential(2)}`} />
            ))}
            <Row name="En la pared del pozo" value={`${es(ctx.sw, 3)} m`} note={`radio ${WELL.rw} m, sin pérdidas del pozo`} />
            <Row name="Radio de influencia" value={`${es(R, 0)} m`} note="√(2,25·T·t/S)" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Acuíferos confinados; transmisividad y almacenamiento; el cono de abatimiento y su crecimiento en el tiempo; Theis, Cooper-Jacob y sus límites (u pequeño); cómo se interpreta una prueba de bombeo; la interferencia entre pozos.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Theis (1935): s = Q/(4πT)·W(u), u = r²S/(4Tt), con W(u) = E1(u) por serie y fracción continua; Cooper y Jacob (1946); Thiem (1906). Las lecturas de la prueba son Theis con ±1 cm de error (semilla fija) y el ajuste es por mínimos cuadrados. Pruebas S1 a S3.
        </p>
        <h3>Límites</h3>
        <p>Acuífero confinado, homogéneo, infinito y sin recarga; pozo que penetra todo el espesor y sin pérdidas propias. El cono se dibuja con la escala vertical exagerada (el rótulo de la escena dice cuánto).</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

function TReading({ Q, onResult }: { Q: number; onResult: (T: number) => void }) {
  const [txt, setTxt] = useState('');
  const [res, setRes] = useState<number | null>(null);
  const calc = () => {
    const ds = Number(txt.replace(',', '.'));
    if (!Number.isFinite(ds) || ds <= 0) return;
    const T = (2.302585 * Q) / (4 * Math.PI * ds);
    setRes(T);
    onResult(T);
  };
  return (
    <div className="q3-exp">
      <div className="hc-read">
        <label htmlFor="as-ds">Δs por ciclo (m)</label>
        <input id="as-ds" inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && calc()} />
        <button type="button" className="btn btn-primary" onClick={calc}>
          Calcular T
        </button>
      </div>
      {res !== null && <p className="q3-progress">Con tu lectura: T = 2,30·{es(Q, 1)}/(4π·Δs) = {es(res, 0)} m²/día.</p>}
    </div>
  );
}

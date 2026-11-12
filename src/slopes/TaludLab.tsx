// «La ladera y el agua»: una capa de suelo sobre la roca en una ladera empinada, con casas al pie. La lluvia
// sostenida sube el nivel del agua dentro del suelo, la presión del agua le quita fricción y, si el factor de
// seguridad baja de 1, la capa se desliza. La pregunta: ¿aguanta la ladera, y qué la ayuda a aguantar?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { DesignTab } from '../canals/design';
import { FlatStage, Row, es } from '../canals/common';
import { LiveHud } from '../canals/live';
import { FsChart, SlopeSection } from './charts';
import { FS_TARGET, ROOM, SLOPE_TOOLS } from './design';
import { A_OVER_B, DEFAULT_SLOPE, DRAIN_FACTOR, SLOPE_SOILS, VEG, slopeScene, type SlopeScene, type Soil, type Veg } from './scene';
import { SlopeWorld } from './three/slopeWorlds';

type R = ReturnType<typeof slopeScene>;
interface Ctx {
  s: SlopeScene;
  r: R;
  /** El mismo caso con pasto y sin drenes (para comparar). */
  pasto: R;
  noDrains: R;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'la-seca',
    title: 'Se cae aun sin agua',
    goal: 'Sin lluvia, encuentra una pendiente con la que la ladera se desliza.',
    hint: 'Sin agua, solo la fricción y la cohesión sostienen el suelo. Más pendiente, más empuje.',
    check: (c) => c.s.q === 0 && c.r.FS < 1,
    progress: (c) => `lluvia ${es(c.s.q, 0)} mm/día, pendiente ${es(c.s.beta, 0)}°, factor ${es(c.r.FS, 2)}`,
  },
  {
    id: 'la-raices',
    title: 'Las raíces sostienen',
    goal: 'Encuentra una lluvia y una pendiente con las que la ladera con pasto se desliza y con bosque aguanta.',
    hint: 'Las raíces de los árboles amarran el suelo: suman cohesión, sobre todo cuando la capa es delgada.',
    check: (c) => c.s.veg === 'bosque' && c.r.FS >= 1 && c.pasto.FS < 1,
    progress: (c) => `con pasto ${es(c.pasto.FS, 2)}, con ${VEG[c.s.veg].name.toLowerCase()} ${es(c.r.FS, 2)}`,
  },
  {
    id: 'la-drenes',
    title: 'Drenes contra el aguacero',
    goal: 'Con 50 mm/día o más de lluvia sostenida en una ladera de 30° o más, logra un factor de 1,25 o más gracias a los drenes.',
    hint: 'Los drenes sacan el agua del suelo: el nivel baja y la presión del agua ya no le quita tanta fricción.',
    check: (c) => c.s.drains && c.s.q >= 50 && c.s.beta >= 30 && c.r.FS >= 1.25 && c.noDrains.FS < 1.25,
    progress: (c) => `sin drenes ${es(c.noDrains.FS, 2)}, ${c.s.drains ? `con drenes ${es(c.r.FS, 2)}` : 'drenes apagados'}`,
  },
  {
    id: 'la-borde',
    title: 'Al borde',
    goal: 'Ajusta la lluvia hasta que la ladera quede justo al borde: un factor entre 1,00 y 1,05.',
    hint: 'En el panel «Experimentos» está la lluvia crítica que calcula el modelo.',
    check: (c) => c.r.FS >= 1 && c.r.FS <= 1.05,
    progress: (c) => `factor ${es(c.r.FS, 3)}`,
  },
];

export function TaludLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [s, setS] = useState<SlopeScene>(DEFAULT_SLOPE);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const r = useMemo(() => slopeScene(s), [s]);
  const pasto = useMemo(() => slopeScene({ ...s, veg: 'pasto' }), [s]);
  const noDrains = useMemo(() => slopeScene({ ...s, drains: false }), [s]);
  const world = useRef<SlopeWorld | null>(null);
  const sync = useRef({ s, r });
  sync.current = { s, r };
  const toWorld = () => world.current?.set({ beta: sync.current.s.beta, z: sync.current.s.z, m: sync.current.r.m, FS: sync.current.r.FS, veg: sync.current.s.veg, drains: sync.current.s.drains, q: sync.current.s.q });
  useEffect(() => {
    toWorld();
  }, [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo<Ctx>(() => ({ s, r, pasto, noDrains }), [s, r, pasto, noDrains]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<SlopeScene>) => setS((x) => ({ ...x, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.FS < 1 ? 'bad' : r.FS < FS_TARGET ? 'mid' : 'ok';
  const answer = (
    <>
      El factor de seguridad es <strong>{es(r.FS, 2)}</strong>: {r.FS < 1 ? 'el empuje del suelo supera su resistencia y la capa se desliza hacia las casas.' : r.FS < FS_TARGET ? 'la ladera aguanta, pero con menos margen del usual (1,5).' : 'la ladera aguanta con margen.'} La lluvia tiene saturado el {es(r.m * 100, 0)} % del suelo{s.drains ? ' (con los drenes)' : ''}; seca, el factor sería {es(r.dry.FS, 2)}.{' '}
      {r.qc === null ? (r.mc <= 0 ? 'Esta ladera falla aun sin agua.' : 'Con estas raíces y este suelo no falla ni saturada.') : `Falla con una lluvia sostenida de unos ${es(r.qc, 0)} mm/día${s.drains ? ' sin drenes' : ''}.`}
    </>
  );

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Maqueta 3D de una ladera empinada con una capa de suelo sobre roca, con vegetación y casas al pie. En el corte del frente se ve el nivel del agua dentro del suelo; si el factor de seguridad baja de 1, la capa de suelo se desliza ladera abajo hacia las casas."
          viewNames={[
            { id: 'general', label: 'La ladera' },
            { id: 'corte', label: 'El corte' },
            { id: 'pie', label: 'Las casas' },
          ]}
          make={(st) => new SlopeWorld(st)}
          onReady={(w) => {
            world.current = w;
            toWorld();
          }}
        />
      ) : (
        <FlatStage>
          <SlopeSection beta={s.beta} z={s.z} m={r.m} FS={r.FS} />
        </FlatStage>
      )}
      <Question q="¿Aguanta la ladera, y qué la ayuda a aguantar?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <LiveHud
        head={[`factor ${es(r.FS, 2)}`, `agua ${es(r.m * 100, 0)} % del suelo`, r.qc === null ? (r.mc <= 0 ? 'falla seca' : 'no falla ni saturada') : `lluvia crítica ${es(r.qc, 0)} mm/día`]}
        chart={<FsChart inp={r.inp} m={r.m} />}
        traces={[
          { key: 'fs', label: 'Factor de seguridad', unit: '', value: r.FS, digits: 2, ref: { value: 1, label: 'falla' } },
          { key: 'm', label: 'Suelo saturado', unit: '%', value: r.m * 100, digits: 0 },
        ]}
      />
      <DockRange label="Pendiente" value={s.beta} min={15} max={50} step={1} show={`${es(s.beta, 0)}°`} onChange={(v) => set({ beta: v })} />
      <DockRange label="Espesor del suelo" value={s.z} min={0.5} max={4} step={0.1} show={`${es(s.z, 1)} m`} onChange={(v) => set({ z: v })} />
      <DockRange label="Lluvia sostenida" value={s.q} min={0} max={120} step={2} show={`${es(s.q, 0)} mm/día`} onChange={(v) => set({ q: v })} />
      <DockChoice label="Suelo" value={s.soil} options={(Object.keys(SLOPE_SOILS) as Soil[]).map((k) => ({ value: k, label: SLOPE_SOILS[k].name.split(' (')[0] }))} onChange={(v) => set({ soil: v })} />
      <DockChoice label="Vegetación" value={s.veg} options={(Object.keys(VEG) as Veg[]).map((k) => ({ value: k, label: VEG[k].name }))} onChange={(v) => set({ veg: v })} />
      <DockChoice
        label="Drenes horizontales"
        value={s.drains ? 'si' : 'no'}
        options={[
          { value: 'no', label: 'Sin drenes' },
          { value: 'si', label: 'Con drenes' },
        ]}
        onChange={(v) => set({ drains: v === 'si' })}
      />
    </>
  );

  const qs = [0, 10, 20, 40, 80];
  const sum = r.cohesionTerm + r.frictionTerm;
  const atQc = r.qc === null ? null : slopeScene({ ...s, q: r.qc, drains: false }).FS;
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <SlopeSection beta={s.beta} z={s.z} m={r.m} FS={r.FS} W={480} H={230} />
        <h3>Lo que empuja y lo que sostiene</h3>
        <p>
          El peso de la capa de suelo tiene una parte que la empuja ladera abajo y otra que la aprieta contra la roca. Lo que la sostiene es la <strong>fricción</strong> (proporcional a lo que la aprieta) más la <strong>cohesión</strong> del suelo y de las raíces. El <strong>factor de seguridad</strong> divide lo que sostiene entre lo que empuja: por debajo de 1, se desliza.
        </p>
        <h3>Por qué la lluvia la tumba</h3>
        <p>Una lluvia larga sube el nivel del agua dentro del suelo. El agua empuja los granos hacia afuera (presión de poros) y les quita fricción: con el mismo peso, el suelo resiste menos. Por eso los drenes, que sacan el agua, ayudan tanto.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia la pendiente, el suelo, la vegetación y la lluvia. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Las fuerzas sobre el plano de falla</h3>
        <p className="q3-small">Por metro cuadrado del plano paralelo a la ladera, a {es(s.z, 1)} m de profundidad.</p>
        <table className="q3-table">
          <tbody>
            <Row name="Lo aprieta contra la roca (normal)" value={`${es(r.sigma, 2)} kPa`} />
            <Row name="Lo empuja ladera abajo (cortante)" value={`${es(r.tau, 2)} kPa`} />
            <Row name="Presión del agua" value={`${es(r.u, 2)} kPa`} />
            <Row name="Lo sostiene (resistencia)" value={`${es(r.strength, 2)} kPa`} />
            <Row name="Factor = cohesión + fricción" value={`${es(r.cohesionTerm, 3)} + ${es(r.frictionTerm, 3)} = ${es(sum, 3)}`} note={`directo ${es(r.FS, 3)}`} />
          </tbody>
        </table>
        <h3>La lluvia crítica</h3>
        <p className="q3-small">Con el modelo de flujo estable de SHALSTAB, la lluvia sostenida con la que el agua satura justo la fracción que hace fallar la ladera.</p>
        <table className="q3-table">
          <tbody>
            <Row name="Fracción saturada que hace fallar" value={r.mc <= 0 ? 'falla seca' : r.mc > 1 ? 'no falla ni saturada' : `${es(r.mc * 100, 1)} %`} />
            <Row name="Lluvia crítica (sin drenes)" value={r.qc === null ? '—' : `${es(r.qc, 1)} mm/día`} />
            <Row name="Factor con esa lluvia" value={atQc === null ? '—' : es(atQc, 4)} note="debe dar 1" />
          </tbody>
        </table>
        <h3>Lluvia y vegetación</h3>
        <table className="q3-table">
          <thead>
            <tr>
              <th>Lluvia</th>
              {(Object.keys(VEG) as Veg[]).map((v) => (
                <th key={v}>{VEG[v].name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {qs.map((q) => (
              <tr key={q} className={q === s.q ? 'is-on' : ''}>
                <td>{q} mm/día</td>
                {(Object.keys(VEG) as Veg[]).map((v) => {
                  const fs = slopeScene({ ...s, q, veg: v }).FS;
                  return <td key={v}>{es(fs, 2)}{fs < 1 ? ' ✕' : ''}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
    diseno: <DesignTab part="talud" set={SLOPE_TOOLS.talud} room={ROOM} />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>La ladera (ilustrativa; valores típicos)</caption>
          <tbody>
            <Row name="Suelo" value={SLOPE_SOILS[s.soil].name} note={`c = ${SLOPE_SOILS[s.soil].c} kPa, φ = ${SLOPE_SOILS[s.soil].phi}°, γ = ${SLOPE_SOILS[s.soil].gamma} kN/m³`} />
            <Row name="Cohesión de las raíces" value={`${VEG[s.veg].cr} kPa`} note={VEG[s.veg].name} />
            <Row name="Conductividad del suelo" value={`${SLOPE_SOILS[s.soil].K} m/día`} note={`transmisividad ${es(r.T, 2)} m²/día`} />
            <Row name="Área que le llega por metro" value={`${A_OVER_B} m`} note="la ladera recibe el agua de arriba" />
            <Row name="Drenes" value={s.drains ? `bajan el nivel al ${DRAIN_FACTOR * 100} %` : 'no hay'} />
            <Row name="Largo de la ladera" value="40 m" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Esfuerzo normal y cortante; fricción y cohesión; presión de poros y esfuerzo efectivo; factor de seguridad; por qué las lluvias largas detonan deslizamientos; el papel de las raíces y de los drenes.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Talud infinito con flujo paralelo a la ladera (Skempton y DeLory, 1957; Duncan, Wright y Brandon, 2014). La fracción saturada sale del modelo de flujo estable de SHALSTAB (Montgomery y Dietrich, 1994). La cohesión de las raíces, de valores típicos (Sidle y Ochiai, 2006). Pruebas L5 y L6.
        </p>
        <h3>Límites</h3>
        <p>
          Capa de espesor constante y plano de falla paralelo a la ladera (deslizamientos poco profundos); lluvia sostenida en flujo estable, no una tormenta que varía; sin sismo. Los drenes se representan bajando el nivel a una fracción fija. La ladera y las casas son ilustrativas: esto no es un mapa de amenaza ni un estudio de estabilidad.
        </p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

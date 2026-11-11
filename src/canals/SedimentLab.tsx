// «El transporte de sedimentos»: el agua empuja los granos del fondo. Si el empuje (el número de Shields) pasa el
// umbral del grano, se mueven: los gruesos ruedan y saltan por el fondo; los finos suben y van suspendidos. La
// pregunta: ¿se mueve el fondo y cuánto se lleva el agua?

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { INK, Lens, Tag, useLensUid, type Chip } from '../quality/lensKit';
import { FlatStage, Row, SlopeRange, es } from './common';
import { DesignTab } from './design';
import { BED_W, DEFAULT_SEDIMENT, GRAINS, MODE_NAME, RIPRAP, dStar, sedimentModel, shieldsCrit, type SedimentInput, type SedimentResult } from './sediment';
import { SedimentWorld } from './three/sedimentWorld';

interface Ctx {
  inp: SedimentInput;
  r: SedimentResult;
}

const RETOS: Reto<Ctx>[] = [
  {
    id: 'hc-sed-quieto',
    title: 'Un fondo que aguanta',
    goal: 'Con una creciente de 50 m³/s o más y 0,5 % de pendiente o más, escoge un grano que no se mueva.',
    hint: 'El empuje del agua es el mismo; lo que cambia es cuánto pesa el grano. Mira el número de Shields: debe quedar por debajo del umbral.',
    check: (c) => c.inp.Q >= 50 && c.inp.S >= 0.005 && c.r.mode === 'quieto',
    progress: (c) => `θ/θcr = ${es(c.r.mobility)}`,
  },
  {
    id: 'hc-sed-umbral',
    title: 'Justo en el umbral',
    goal: 'Encuentra el caudal con el que un fondo de grava (de 1 a 5 cm) apenas empieza a moverse: θ/θcr entre 0,95 y 1,05.',
    hint: 'Pon grava y sube el caudal despacio.',
    check: (c) => c.inp.d >= 0.01 && c.inp.d <= 0.05 && c.r.mobility >= 0.95 && c.r.mobility <= 1.05,
    progress: (c) => `grano ${es(c.inp.d * 1000, 1)} mm · θ/θcr ${es(c.r.mobility)}`,
  },
  {
    id: 'hc-sed-suspendido',
    title: 'Arena en el agua',
    goal: 'Haz que una arena (0,5 mm o menos) vaya suspendida, sin asentarse en el fondo.',
    hint: 'Va suspendida cuando la turbulencia (la velocidad de corte) vence la velocidad con que cae el grano: número de Rouse menor que 1,2.',
    check: (c) => c.inp.d <= 0.0005 && c.inp.d >= 0.0001 && (c.r.mode === 'suspension' || c.r.mode === 'lavado'),
    progress: (c) => `Rouse ${es(c.r.rouse)}`,
  },
  {
    id: 'hc-sed-arrastre',
    title: 'Mil toneladas',
    goal: 'Con grava (1 cm o más), logra que el agua arrastre por el fondo 1 000 toneladas o más al día.',
    hint: 'El arrastre crece con el exceso de empuje sobre el umbral, a la potencia 1,5.',
    check: (c) => c.inp.d >= 0.01 && c.r.tDay >= 1000,
    progress: (c) => `${Math.round(c.r.tDay).toLocaleString('es-CO')} t/día`,
  },
];

const DLO = 0.00002, DHI = 1;

export function SedimentLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [inp, setInp] = useState<SedimentInput>(DEFAULT_SEDIMENT);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const r = useMemo(() => sedimentModel(inp), [inp]);
  const world = useRef<SedimentWorld | null>(null);
  const sync = useRef(r);
  sync.current = r;
  useEffect(() => world.current?.set(sync.current), [r]);
  const ctx = useMemo<Ctx>(() => ({ inp, r }), [inp, r]);
  const { done, fresh, clearFresh } = useRetos(RETOS, ctx);
  const set = (p: Partial<SedimentInput>) => setInp((s) => ({ ...s, ...p }));
  const tone: 'ok' | 'mid' | 'bad' = r.mode === 'quieto' ? 'ok' : r.mode === 'fondo' ? 'mid' : 'bad';
  const answer =
    r.mode === 'quieto'
      ? `No: el agua empuja con θ = ${es(r.theta, 3)} y este grano necesita ${es(r.thetaCr, 3)} para moverse (${es(r.mobility * 100, 0)} % del umbral).`
      : r.mode === 'fondo'
        ? `Sí: el grano ${MODE_NAME.fondo}; el agua se lleva unas ${Math.round(r.tDay).toLocaleString('es-CO')} t al día.`
        : `Sí: el grano ${MODE_NAME[r.mode]} (número de Rouse ${es(r.rouse)}); por el fondo, unas ${Math.round(r.tDay).toLocaleString('es-CO')} t al día.`;
  const k = Math.round((100 * Math.log(inp.d / DLO)) / Math.log(DHI / DLO));

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Tramo de cauce en 3D con pared de vidrio: el lecho del grano escogido y el agua a la profundidad calculada. Los granos se quedan quietos, ruedan por el fondo o van suspendidos."
          viewNames={[
            { id: 'general', label: 'El cauce' },
            { id: 'fondo', label: 'El fondo' },
            { id: 'arriba', label: 'Desde arriba' },
          ]}
          make={(st) => new SedimentWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.set(sync.current);
          }}
        />
      ) : (
        <FlatStage>
          <ShieldsDiagram r={r} />
        </FlatStage>
      )}
      <Question q="¿Se mueve el fondo? ¿Cuánto se lleva el agua?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const dock = (
    <>
      <DockRange label="Caudal" value={inp.Q} min={0.5} max={200} step={0.5} show={`${es(inp.Q, 1)} m³/s`} onChange={(v) => set({ Q: v })} />
      <SlopeRange value={inp.S} lo={0.0002} hi={0.05} onChange={(S) => set({ S })} label="Pendiente del cauce" />
      <DockRange
        label="Tamaño del grano"
        value={k}
        min={0}
        max={100}
        step={1}
        show={`${inp.d < 0.001 ? `${es(inp.d * 1000, 2)} mm` : inp.d < 0.1 ? `${es(inp.d * 1000, 1)} mm` : `${es(inp.d * 100, 0)} cm`} · ${nameOf(inp.d)}`}
        onChange={(v) => set({ d: Number((DLO * Math.pow(DHI / DLO, v / 100)).toPrecision(3)) })}
      />
    </>
  );

  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <ShieldsDiagram r={r} />
        <h3>El empuje del agua y el peso del grano</h3>
        <p>
          El agua arrastra el fondo con un esfuerzo τ = ρ·g·R·S ({es(r.tau, 1)} Pa). El grano se resiste con su peso dentro del agua. El cociente es el <strong>número de Shields</strong>: θ = τ / ((ρs − ρ)·g·d) = {es(r.theta, 3)}. Si pasa el umbral de ese grano (θcr = {es(r.thetaCr, 3)}, de la curva de Shields), el fondo se mueve.
        </p>
        <h3>¿Por el fondo o suspendido?</h3>
        <p>
          La turbulencia sube los granos con una velocidad parecida a la velocidad de corte u* = √(τ/ρ) = {es(r.ustar, 3)} m/s, y el grano cae con su velocidad de caída w = {es(r.w, 4)} m/s. El <strong>número de Rouse</strong> P = w / (0,4·u*) = {es(r.rouse)} decide: más de 2,5, por el fondo; entre 1,2 y 2,5, mitad y mitad; entre 0,8 y 1,2, suspendido; menos de 0,8, no se asienta.
        </p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={ctx} done={done} intro="Cambia el caudal, la pendiente y el grano, y mira el fondo. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Compara los granos</h3>
        <p className="q3-small">Con el mismo cauce: {es(inp.Q, 1)} m³/s y {es(inp.S * 100, 2)} % de pendiente.</p>
        <table className="q3-table">
          <thead>
            <tr>
              <th scope="col">Grano</th>
              <th scope="col">θ / θcr</th>
              <th scope="col">Qué hace</th>
              <th scope="col">Por el fondo (t/día)</th>
            </tr>
          </thead>
          <tbody>
            {GRAINS.map((g) => {
              const x = sedimentModel({ ...inp, d: g.d });
              return (
                <tr key={g.id} className={Math.abs(Math.log(g.d / inp.d)) < 0.2 ? 'is-on' : ''}>
                  <th scope="row">
                    <button type="button" className="link" onClick={() => set({ d: g.d })}>
                      {g.name} ({g.d < 0.001 ? `${es(g.d * 1000, 2)} mm` : g.d < 0.1 ? `${es(g.d * 1000, 0)} mm` : `${es(g.d * 100, 0)} cm`})
                    </button>
                  </th>
                  <td>{es(x.mobility)}</td>
                  <td>{MODE_NAME[x.mode]}</td>
                  <td>{Math.round(x.tDay).toLocaleString('es-CO')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="q3-small">El mismo empuje mueve la arena y deja quietos los cantos. Lo muy fino (limo) va suspendido y se ve como agua turbia.</p>
      </div>
    ),
    diseno: <DesignTab part="sedimentos" />,
    datos: (
      <div className="q3-data">
        <table className="q3-table">
          <caption>El cauce y su fondo</caption>
          <tbody>
            <Row name="Cauce" value={`${BED_W} m de ancho`} note={`n = ${es(r.n, 3)} (Strickler, al menos 0,020)`} />
            <Row name="Profundidad normal" value={`${es(r.h, 3)} m`} />
            <Row name="Velocidad media" value={`${es(r.V, 2)} m/s`} />
            <Row name="Esfuerzo en el fondo" value={`${es(r.tau, 2)} Pa`} note="ρ·g·R·S" />
            <Row name="Velocidad de corte" value={`${es(r.ustar, 4)} m/s`} />
            <Row name="Diámetro adimensional D*" value={es(r.Dstar, 1)} />
            <Row name="Número de Shields θ" value={es(r.theta, 4)} />
            <Row name="Umbral θcr" value={es(r.thetaCr, 4)} note="Soulsby y Whitehouse (1997)" />
            <Row name="Velocidad de caída" value={`${es(r.w, 5)} m/s`} note="Ferguson y Church (2004)" />
            <Row name="Número de Rouse" value={es(r.rouse, 2)} />
            <Row name="Arrastre de fondo q*" value={es(r.qStar, 4)} note="3,97·(θ − θcr)^1,5" />
            <Row name="Arrastre por metro" value={`${(r.qb * 1000).toLocaleString('es-CO', { maximumSignificantDigits: 3 })} L/s·m`} note="de grano sólido" />
            <Row name="Arrastre del cauce" value={`${Math.round(r.volDay).toLocaleString('es-CO')} m³/día · ${Math.round(r.tDay).toLocaleString('es-CO')} t/día`} />
            <Row name="Piedra que aguanta este fondo" value={`${es(r.dRiprap * 100, 1)} cm`} note={`enrocado con θ = ${RIPRAP.theta} y factor ${es(RIPRAP.fs, 1)}`} />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-teacher">
        <h3>Qué enseña</h3>
        <p>Inicio del movimiento (Shields), modos de transporte (fondo y suspensión, número de Rouse), cuánto arrastra el agua y cómo se escoge una piedra que aguante la corriente. Sirve para conversar sobre la erosión aguas abajo de una alcantarilla, la socavación de puentes y la sedimentación de los canales.</p>
        <h3>El cálculo y sus fuentes</h3>
        <p>
          Cauce ancho rectangular de {BED_W} m con profundidad normal de Manning y n de Strickler (d^(1/6)/21,1, al menos 0,020 por las formas del fondo). Umbral de Shields con la curva de Soulsby y Whitehouse (1997); arrastre de fondo de Meyer-Peter y Müller (1948) en la forma de Wong y Parker (2006), q* = 3,97·(θ − θcr)^1,5, aquí con el umbral de la curva; velocidad de caída de Ferguson y Church (2004) para granos naturales; rangos del número de Rouse según García (ASCE Manual 110, 2008). Enrocado: d = 1,5·τ/((ρs − ρ)·g·0,047). Prueba H14.
        </p>
        <h3>Límites</h3>
        <p>Un solo tamaño de grano (sin mezclas ni acorazamiento), cauce recto y flujo uniforme. La carga suspendida no se cuantifica, solo se clasifica. En la escena, los granos pequeños se dibujan aumentados y lo dice un rótulo.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}

function nameOf(d: number): string {
  if (d < 0.0000625) return 'limo';
  if (d < 0.0005) return 'arena fina';
  if (d < 0.002) return 'arena gruesa';
  if (d < 0.008) return 'gravilla';
  if (d < 0.064) return 'grava';
  if (d < 0.256) return 'cantos';
  return 'bloques';
}

export function ShieldsDiagram({ r }: { r: SedimentResult }) {
  const id = useLensUid();
  const lx = (v: number) => Math.log10(v);
  const x0 = lx(0.1), x1 = lx(1e5), y0 = lx(0.005), y1 = lx(50);
  const X = (D: number) => 50 + ((lx(D) - x0) / (x1 - x0)) * 400, Y = (th: number) => 222 - ((lx(Math.min(50, Math.max(0.005, th))) - y0) / (y1 - y0)) * 200;
  const curve = [...Array(80)].map((_, k) => {
    const D = Math.pow(10, x0 + ((x1 - x0) * k) / 79);
    const d = D / dStar(1);
    return `${X(D)},${Y(shieldsCrit(d))}`;
  });
  const chips: Chip[] = [
    { label: 'Shields θ', value: es(r.theta, 3) },
    { label: 'Umbral θcr', value: es(r.thetaCr, 3) },
    { label: 'Rouse', value: es(r.rouse, 2) },
    { label: 'Qué hace el grano', value: r.mode === 'quieto' ? 'quieto' : r.mode === 'fondo' ? 'por el fondo' : 'suspendido', tone: r.mode === 'quieto' ? 'ok' : r.mode === 'fondo' ? 'mid' : 'bad' },
  ];
  return (
    <Lens uid={id} label="Diagrama de Shields: el umbral de movimiento según el tamaño del grano, y el punto de este cauce." chips={chips}>
      <rect x="50" y="22" width="400" height="200" fill="#ffffff" stroke="#c8d6df" />
      <polygon points={`${curve.join(' ')} 450,22 50,22`} fill="#fbe9e5" />
      <polyline points={curve.join(' ')} fill="none" stroke={INK} strokeWidth="2.2" />
      {[0.01, 0.1, 1, 10].map((v) => (
        <g key={v}>
          <line x1="46" y1={Y(v)} x2="450" y2={Y(v)} stroke="#e3ebf0" />
          <text x="44" y={Y(v) + 3} textAnchor="end" className="lz-s" fill="#5b6b78">{v.toString().replace('.', ',')}</text>
        </g>
      ))}
      {[1, 10, 100, 1000, 10000].map((v) => (
        <text key={v} x={X(v)} y="236" textAnchor="middle" className="lz-s" fill="#5b6b78">{v.toLocaleString('es-CO')}</text>
      ))}
      <circle cx={X(r.Dstar)} cy={Y(r.theta)} r="6" fill={r.theta > r.thetaCr ? '#c0462a' : '#2f8f55'} stroke="#ffffff" strokeWidth="1.5" />
      <Tag x={60} y={36} size="s" color="#a3321d">
        se mueve
      </Tag>
      <Tag x={440} y={214} anchor="end" size="s" color="#2f8f55">
        quieto
      </Tag>
      <Tag x={8} y={16} size="s">
        número de Shields θ (escala logarítmica)
      </Tag>
      <Tag x={450} y={250} anchor="end" size="s">
        tamaño del grano adimensional D*
      </Tag>
    </Lens>
  );
}

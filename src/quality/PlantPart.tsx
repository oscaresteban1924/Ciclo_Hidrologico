// Parte 2: «Del río a la llave». Planta de potabilización con prueba de jarras, filtros y cloro; resultado
// comparado con la Resolución 2115 de 2007 (IRCA). Al final, qué pasa con el agua después de usarla.

import { useMemo, useState, type ReactNode } from 'react';
import { Disclosure, Segmented } from '../components/ui';
import { PTAR_STAGES, RAW_WATER, settledTurbidity, treatPlant, type RawCase } from './model';
import { QLayout, QRange, fmt } from './ui';

const JARS = [0, 10, 20, 30, 45, 65];

/** Color del agua según su turbiedad (café → transparente). */
function turbColor(t: number): string {
  const f = Math.min(1, Math.log10(1 + t) / Math.log10(401));
  const clear = [180, 216, 236], brown = [150, 112, 70];
  return `rgb(${clear.map((c, i) => Math.round(c + (brown[i] - c) * f)).join(',')})`;
}

export function PlantPart({ head }: { head: ReactNode }) {
  const [raw, setRaw] = useState<RawCase>('lluvia');
  const [dose, setDose] = useState(10);
  const [chlorine, setChlorine] = useState(1);
  const [jars, setJars] = useState<{ raw: RawCase; done: boolean }>({ raw: 'lluvia', done: false });
  const [stage, setStage] = useState(0);
  const res = useMemo(() => treatPlant({ raw, dose, chlorine }), [raw, dose, chlorine]);
  const rw = RAW_WATER[raw];
  const jarsDone = jars.done && jars.raw === raw;
  const okAll = res.checks.every((c) => c.ok);
  const steps = [
    { id: 'rio', name: 'Río o embalse', t: rw.turbidity, x: 40 },
    { id: 'mezcla', name: 'Mezcla rápida', t: rw.turbidity, x: 150 },
    { id: 'floc', name: 'Floculadores', t: (rw.turbidity + res.settled) / 2, x: 265 },
    { id: 'sed', name: 'Sedimentador', t: res.settled, x: 390 },
    { id: 'filtro', name: 'Filtros de arena', t: res.filtered, x: 530 },
    { id: 'cloro', name: 'Tanque de cloro', t: res.filtered, x: 660 },
    { id: 'red', name: 'Red y tanques', t: res.filtered, x: 790 },
  ];
  const bad = (id: string) => (id === 'filtro' && res.clogged) || (id === 'cloro' && (res.clExit > 2 || res.clExit < 0.3));
  const dboIn = 300;
  return (
    <QLayout
      head={head}
      stage={
        <div className="q-stage-plant">
          <svg viewBox="0 0 1000 520" className="q-scene" role="img" aria-label={`Planta de potabilización con agua cruda de ${fmt(rw.turbidity, 0)} UNT. Después de los filtros sale con ${fmt(res.filtered, 2)} UNT y ${fmt(res.clExit, 2)} mg/L de cloro libre.`}>
            <rect width="1000" height="520" fill="#eef4f3" />
            <path d="M0 330 H1000" stroke="#b9cbcc" strokeWidth="2" />
            <text x="500" y="38" textAnchor="middle" className="q-svg-title">Del río a la llave</text>
            {/* tubería de conexión */}
            <path d="M80 250 H930" stroke="#7d8d99" strokeWidth="10" strokeLinecap="round" />
            {steps.map((s, k) => {
              const w = 96;
              return (
                <g key={s.id} className={bad(s.id) ? 'q-bad' : ''}>
                  {s.id === 'rio' ? (
                    <path d={`M${s.x - 20} 300 q30 -24 60 0 q30 24 60 0 v40 h-120z`} fill={turbColor(s.t)} stroke="#5b7183" />
                  ) : (
                    <g>
                      <rect x={s.x} y={200} width={w} height={110} rx="8" fill="#fbfdfc" stroke={bad(s.id) ? '#c0462a' : '#5b7183'} strokeWidth={bad(s.id) ? 3 : 1.5} />
                      <rect x={s.x + 6} y={s.id === 'filtro' ? 214 : 226} width={w - 12} height={s.id === 'filtro' ? 40 : 78} rx="4" fill={turbColor(s.t)} />
                      {s.id === 'mezcla' && <path d={`M${s.x + 48} 186 v40 M${s.x + 38} 186 h20`} stroke="#8a4e0c" strokeWidth="3" />}
                      {s.id === 'floc' && [0, 1, 2].map((p) => <path key={p} d={`M${s.x + 22 + p * 26} 232 v60 M${s.x + 14 + p * 26} 262 h16`} stroke="#46596b" strokeWidth="2" />)}
                      {s.id === 'floc' && Array.from({ length: Math.round(Math.min(18, (rw.turbidity - res.settled) / 6)) }, (_, p) => <circle key={`f${p}`} cx={s.x + 12 + ((p * 23) % 72)} cy={240 + ((p * 17) % 56)} r={2 + (p % 3)} fill="#7a5f3e" opacity="0.8" />)}
                      {s.id === 'sed' && <path d={`M${s.x + 6} 304 l${w - 12} -14 v14z`} fill="#7a5f3e" opacity={Math.min(0.9, 0.2 + (rw.turbidity - res.settled) / 300)} />}
                      {s.id === 'filtro' && (
                        <g>
                          <rect x={s.x + 6} y={254} width={w - 12} height={30} fill="#d9c79f" />
                          <rect x={s.x + 6} y={284} width={w - 12} height={20} fill="#9c9486" />
                          {res.clogged && <rect x={s.x + 6} y={250} width={w - 12} height={8} fill="#7a5f3e" />}
                        </g>
                      )}
                      {s.id === 'cloro' && <path d={`M${s.x + 48} 186 v40 M${s.x + 38} 186 h20`} stroke="#3a9b5c" strokeWidth="3" />}
                      {s.id === 'red' && <path d={`M${s.x + 10} 300 h76 M${s.x + 30} 300 v-30 M${s.x + 60} 300 v-50`} stroke="#5b7183" strokeWidth="4" fill="none" />}
                    </g>
                  )}
                  <text x={s.x + (s.id === 'rio' ? 40 : w / 2)} y={s.id === 'rio' ? 370 : 334} textAnchor="middle" className="q-svg-label">{s.name}</text>
                  <text x={s.x + (s.id === 'rio' ? 40 : w / 2)} y={s.id === 'rio' ? 388 : 352} textAnchor="middle" className="q-svg-value">{`${fmt(s.t, s.t < 10 ? 1 : 0)} UNT`}</text>
                  {k > 0 && <path d={`M${s.x - 18} 250 l10 -6 v12z`} fill="#46596b" />}
                </g>
              );
            })}
            {/* casa y llave */}
            <g>
              <path d="M915 180 l45 -34 l45 34 v100 h-90z" fill="#efe7d6" stroke="#7d6a58" transform="translate(-40 0)" />
              <path d="M902 238 h26 v10 h-10 v8" fill="none" stroke="#46596b" strokeWidth="4" />
              <path d="M918 260 q3 10 0 16" stroke={turbColor(res.filtered)} strokeWidth="4" />
              <text x="920" y="372" textAnchor="middle" className="q-svg-label">La llave</text>
              <text x="920" y="390" textAnchor="middle" className="q-svg-value">{`cloro ${fmt(res.clTap, 2)} mg/L`}</text>
            </g>
            {/* sellos de cumplimiento */}
            <g transform="translate(22 420)">
              {res.checks.map((c, k) => (
                <g key={c.id} transform={`translate(${k * 192} 0)`}>
                  <rect width="180" height="56" rx="10" fill={c.ok ? '#e8f3e3' : '#fbe9e4'} stroke={c.ok ? '#3d7a3a' : '#c0462a'} />
                  <text x="12" y="22" className="q-svg-label" fill={c.ok ? '#2c5d2a' : '#9b2f1b'}>{`${c.ok ? '✓' : '✗'} ${c.name}`}</text>
                  <text x="12" y="42" className="q-svg-small">{c.id === 'cloro' ? `${fmt(res.clExit, 2)} → ${fmt(res.clTap, 2)} mg/L` : c.value}</text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      }
      panel={
        <div className="q-part">
          <p className="q-lead">
            El agua de un río no se puede tomar así: trae tierra y microbios. En la planta se le quita la turbiedad y se desinfecta. Encuentra la dosis de coagulante y de cloro para que el agua de la llave cumpla la norma colombiana.
          </p>
          <section className="q-box" aria-label="Agua que llega a la planta">
            <h3>El agua que llega</h3>
            <Segmented<RawCase>
              label="¿Cómo viene el río?"
              value={raw}
              options={[
                { value: 'verano', label: 'Tiempo seco' },
                { value: 'lluvia', label: 'Tras la lluvia' },
                { value: 'creciente', label: 'Creciente' },
              ]}
              onChange={setRaw}
              help={`${rw.note} Turbiedad ${fmt(rw.turbidity, 0)} UNT; coliformes totales ${rw.coliTotal.toLocaleString('es-CO')} y E. coli ${rw.eColi.toLocaleString('es-CO')} por 100 mL.`}
            />
          </section>

          <section className="q-box" aria-label="Prueba de jarras">
            <h3>1. La prueba de jarras</h3>
            <p className="q-help">Seis jarras con la misma agua y distinta dosis de coagulante (sulfato de aluminio). Se mezclan, se dejan quietas y se mira cuál quedó más clara.</p>
            <ul className="q-jars" aria-live="polite">
              {JARS.map((d) => {
                const t = jarsDone ? settledTurbidity(rw.turbidity, d) : rw.turbidity;
                const best = jarsDone && Math.min(...JARS.map((x) => settledTurbidity(rw.turbidity, x))) === t;
                return (
                  <li key={d} className={best ? 'is-best' : ''}>
                    <svg viewBox="0 0 40 60" aria-hidden="true">
                      <path d="M6 6 h28 l-2 50 h-24z" fill="#ffffff" stroke="#46596b" />
                      <path d="M8 16 h24 l-1.6 38 h-20.8z" fill={turbColor(t)} style={{ transition: 'fill 1.2s ease' }} />
                      {jarsDone && d > 0 && <path d="M9 50 h22 l-0.3 4 h-21.4z" fill="#7a5f3e" opacity={Math.min(0.9, (rw.turbidity - t) / rw.turbidity)} />}
                    </svg>
                    <span>{d} mg/L</span>
                    <span className="q-help">{jarsDone ? `${fmt(t, t < 10 ? 1 : 0)} UNT` : '—'}</span>
                    <button type="button" className="btn-ghost q-btn-xs" onClick={() => setDose(d)} disabled={!jarsDone} aria-label={`Usar ${d} mg/L en la planta`}>
                      Usar
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn btn-primary q-btn-s" onClick={() => setJars({ raw, done: true })} disabled={jarsDone}>
              {jarsDone ? 'Prueba hecha' : 'Hacer la prueba de jarras'}
            </button>
          </section>

          <section className="q-box" aria-label="Dosis en la planta">
            <h3>2. Las dosis de la planta</h3>
            <QRange label="Coagulante" value={dose} min={0} max={80} step={1} unit="mg/L" onChange={setDose} help={res.clogged ? 'Llega demasiada turbiedad a los filtros: se tapan y dejan pasar partículas.' : `Después de sedimentar quedan ${fmt(res.settled, res.settled < 10 ? 1 : 0)} UNT; los filtros dejan ${fmt(res.filtered, 2)} UNT.`} />
            <QRange label="Cloro" value={chlorine} min={0} max={4} step={0.1} unit="mg/L" onChange={setChlorine} help={`El agua gasta ${fmt(res.demand, 2)} mg/L de cloro en reaccionar; quedan ${fmt(res.clExit, 2)} mg/L libres al salir y ${fmt(res.clTap, 2)} mg/L en la llave, 12 horas después.`} />
          </section>

          <section className="q-box" aria-label="Agua en la llave">
            <h3>3. ¿El agua de la llave cumple?</h3>
            <ul className="q-checks">
              {res.checks.map((c) => (
                <li key={c.id} className={c.ok ? 'is-ok' : 'is-bad'}>
                  <span aria-hidden="true">{c.ok ? '✓' : '✗'}</span>
                  <div>
                    <strong>{c.name}</strong>: {c.value}
                    <span className="q-help">Resolución 2115 de 2007: {c.limit}. Puntaje de riesgo {fmt(c.score, c.score % 1 ? 1 : 0)}.</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className={`q-irca ${res.irca <= 5 ? 'is-ok' : res.irca <= 35 ? 'is-mid' : 'is-bad'}`}>
              <div className="q-irca-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(2, res.irca)}%` }} />
              </div>
              <p>
                IRCA = <strong>{fmt(res.irca, 1)} %</strong> · {res.risk}
              </p>
            </div>
            <p className={`q-verdict ${okAll ? 'is-ok' : 'is-bad'}`} role="status">
              {okAll
                ? 'El agua cumple las cinco características que mide este juego. ¡Se puede tomar!'
                : res.clogged
                  ? 'Sin la dosis justa de coagulante el agua sigue turbia, los filtros se tapan y el cloro no alcanza a los microbios escondidos en las partículas.'
                  : res.clExit > 2
                    ? 'Demasiado cloro: el agua sabe y huele mal y pasa del máximo permitido.'
                    : res.clTap < 0.3
                      ? 'El cloro no alcanza: se gasta en la red y el agua llega a la llave sin protección.'
                      : 'Todavía no cumple: revisa la turbiedad y los microbios.'}
            </p>
          </section>

          <section className="q-box" aria-label="Después de usar el agua">
            <h3>¿Y después de usarla?</h3>
            <p>
              El agua del baño y la cocina se va por el alcantarillado de aguas residuales hasta una planta de tratamiento (PTAR). Allí se le quita la mayor parte de la materia orgánica antes de devolverla al río.
            </p>
            <ol className="q-ptar">
              {PTAR_STAGES.map((s, k) => (
                <li key={s.id} className={k <= stage ? 'is-on' : ''}>
                  <button type="button" onClick={() => setStage(k)} aria-pressed={k === stage}>
                    <strong>{s.name}</strong>
                    <span className="q-help">{s.what}</span>
                  </button>
                  <span className="q-ptar-bar" aria-label={`queda ${Math.round(s.remain * 100)} % de la materia orgánica`}>
                    <i style={{ width: `${s.remain * 100}%` }} />
                    <em>{fmt(dboIn * s.remain, 0)} mg/L</em>
                  </span>
                </li>
              ))}
            </ol>
            <p className="q-help">Entra con unos {dboIn} mg/L de DBO5 y sale con cerca de {fmt(dboIn * PTAR_STAGES[PTAR_STAGES.length - 1].remain, 0)} mg/L (valores típicos de un tratamiento secundario; cada planta es distinta).</p>
            <p>
              En el valle de Aburrá, EPM opera dos plantas grandes: <strong>San Fernando</strong> (Itagüí, desde el año 2000, con capacidad de 1,8 m³/s) y <strong>Aguas Claras</strong> (Bello, desde 2018, con capacidad de unos 5 m³/s). Según EPM, en 2025 trataban cerca del 93 % de las aguas residuales del valle.
            </p>
          </section>

          <Disclosure title="Para docentes: el modelo y sus fuentes">
            <div className="q-teacher">
              <p>
                <strong>Norma.</strong> Resolución 2115 de 2007 (Ministerio de la Protección Social y Ministerio de Ambiente): turbiedad máxima 2 UNT, pH entre 6,5 y 9,0, cloro residual libre entre 0,3 y 2,0 mg/L en cualquier punto de la red, coliformes totales y E. coli 0 UFC/100 cm³. IRCA = suma de los puntajes de riesgo de lo que no cumple / suma de los puntajes de lo analizado × 100, con los puntajes del cuadro 6 (turbiedad 15, pH 1,5, cloro 15, coliformes totales 15, E. coli 25) y los rangos del cuadro 7 (0–5 sin riesgo, 5,1–14 bajo, 14,1–35 medio, 35,1–80 alto, 80,1–100 inviable sanitariamente). Aquí se calcula con las cinco características que mide el juego (71,5 puntos); el color aparente no se simula.
              </p>
              <p>
                <strong>Reglas didácticas.</strong> Dosis óptima de coagulante 6·T<sup>0,35</sup> mg/L (T, turbiedad cruda en UNT); remoción en forma de campana alrededor de esa dosis (poca dosis no forma flocs y demasiada los vuelve a dispersar), con al menos 25 % por sedimentación simple. Los filtros quitan 90 % si llegan 10 UNT o menos y 70 % si llega más (se tapan). Demanda de cloro 0,4 mg/L + 0,15 por UNT filtrada (+0,2 tras la lluvia, +0,4 en creciente); en la red el cloro decae 5 % por hora durante 12 h. La inactivación de los microbios crece con el producto concentración × tiempo de contacto (30 min) y baja con la turbiedad, que los protege. Los números muestran la forma de cada proceso; la dosis real se encuentra con la prueba de jarras de cada día.
              </p>
              <p>
                <strong>Medellín.</strong> El 96 % de los usuarios de EPM en el valle recibe agua de los embalses La Fe, Riogrande II y Piedras Blancas, potabilizada en plantas como La Ayurá (9,2 m³/s) y Manantiales (6,0 m³/s). San Fernando trata el sur del valle desde 2000 (1,8 m³/s nominales) y Aguas Claras, el norte desde 2018 (unos 5 m³/s). Fuentes: EPM y Superservicios, citadas en docs/calidad/MODELO_CALIDAD.md.
              </p>
            </div>
          </Disclosure>
        </div>
      }
    />
  );
}

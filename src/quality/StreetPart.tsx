// Parte 3: «La ciudad y la lluvia». La mugre que se acumula en la calle entre lluvias y el primer lavado, la
// basura que llega a los sumideros y las conexiones erradas que llevan agua sucia a la quebrada.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Disclosure, Segmented, Toggle } from '../components/ui';
import { setCityIntent } from '../city/intent';
import { useStore } from '../state/store';
import { STREET, buildup, washoff, type StreetInput } from './model';
import { ProfileChart, QLayout, QRange, fmt } from './ui';

export function StreetPart({ head }: { head: ReactNode }) {
  const { state, dispatch } = useStore();
  const [inp, setInp] = useState<StreetInput>({ dryDays: 7, sweeping: false, litter: 'mucha', rainMmH: 30, durationMin: 30, wrongHouses: 3 });
  const set = (p: Partial<StreetInput>) => {
    setInp((s) => ({ ...s, ...p }));
    setPlay(-1);
  };
  const w = useMemo(() => washoff(inp), [inp]);
  // animación de la lluvia: minuto mostrado (-1: aún no llueve)
  const [play, setPlay] = useState(-1);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const rain = () => {
    cancelAnimationFrame(raf.current);
    if (state.prefs.reducedMotion) {
      setPlay(inp.durationMin);
      return;
    }
    const t0 = performance.now();
    const tick = () => {
      const m = Math.min(inp.durationMin, ((performance.now() - t0) / 6000) * inp.durationMin);
      setPlay(m);
      if (m < inp.durationMin) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const minute = Math.max(0, Math.floor(play));
  const washedKg = play < 0 ? 0 : minute === 0 ? 0 : w.massKg[Math.min(w.massKg.length - 1, minute - 1)];
  const totalKg = (buildup(inp.dryDays, inp.sweeping) * STREET.area) / 1000;
  const left = Math.max(0, totalKg - washedKg);
  const raining = play >= 0 && play < inp.durationMin;
  const dots = Math.round(Math.min(160, left * 5));
  const trash = Math.min(28, w.trashItems);
  const wrongDrawn = Math.min(5, Math.ceil((inp.wrongHouses / STREET.houses) * 5));
  const goLab = (missionId: string) => {
    setCityIntent({ missionId });
    dispatch({ type: 'mode', mode: 'city' });
  };
  const rainMm = (inp.rainMmH * inp.durationMin) / 60;
  return (
    <QLayout
      head={head}
      stage={
        <div className="q-stage-street">
          <svg viewBox="0 0 1000 520" className="q-scene" role="img" aria-label={`Corte de una calle con ${STREET.houses} casas, ${inp.dryDays} días sin llover y ${inp.wrongHouses} casas con el desagüe conectado por error al tubo de aguas lluvias.`}>
            <defs>
              <linearGradient id="q-sky2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={raining ? '#aab8c1' : '#d6ebf5'} />
                <stop offset="1" stopColor={raining ? '#d5dcdf' : '#f1f7f3'} />
              </linearGradient>
            </defs>
            <rect width="1000" height="250" fill="url(#q-sky2)" />
            <rect y="250" width="1000" height="270" fill="#cdbb98" />
            {/* casas */}
            {Array.from({ length: 5 }, (_, k) => {
              const x = 40 + k * 128;
              const wrong = k >= 5 - wrongDrawn;
              return (
                <g key={k}>
                  <rect x={x} y={120} width="104" height="110" fill={['#efe2cf', '#e2c6ad', '#f1ebdf', '#d8b39a', '#e9dccb'][k]} stroke="#7d6a58" />
                  <path d={`M${x - 6} 120 l58 -40 l58 40z`} fill="#b25b3c" />
                  <rect x={x + 16} y={146} width="22" height="22" fill="#b9c6cf" stroke="#7d6a58" />
                  <rect x={x + 62} y={186} width="22" height="44" fill="#8a6a4f" />
                  {/* bajante del techo hasta la calle */}
                  <path d={`M${x + 100} 122 v108 h10`} fill="none" stroke="#7d8d99" strokeWidth="4" />
                  {/* desagüe de la casa: a la red de aguas residuales (bien) o a la de aguas lluvias (errada) */}
                  <path d={wrong ? `M${x + 30} 252 V300` : `M${x + 30} 252 V422`} fill="none" stroke="#7a5f3e" strokeWidth="4" strokeDasharray={wrong ? '7 4' : undefined} />
                  {wrong && (
                    <g>
                      <circle cx={x + 30} cy={300} r="6" fill="none" stroke="#c0462a" strokeWidth="2" />
                      <text x={x + 40} y={290} className="q-svg-small" fill="#9b2f1b">conexión errada</text>
                    </g>
                  )}
                </g>
              );
            })}
            {/* calle y sumidero */}
            <rect x="0" y="230" width="1000" height="22" fill="#5f6368" />
            <rect x="0" y="228" width="1000" height="4" fill="#9a9a96" />
            {Array.from({ length: dots }, (_, k) => <circle key={k} cx={(k * 61) % 700 + 20} cy={236 + ((k * 7) % 12)} r={1.6 + (k % 3) * 0.6} fill="#8b7b62" />)}
            <rect x="712" y="232" width="56" height="12" fill="#2b2f33" />
            {[0, 1, 2, 3, 4, 5].map((k) => <rect key={k} x={716 + k * 8.6} y="234" width="3" height="8" fill="#6b7075" />)}
            {Array.from({ length: trash }, (_, k) => <rect key={k} x={690 + ((k * 13) % 90)} y={222 - ((k * 5) % 10)} width="7" height="5" rx="1" fill={['#e1e4e8', '#d5503c', '#f2c94c', '#5aa0d8'][k % 4]} transform={`rotate(${(k * 37) % 60 - 30} ${694 + ((k * 13) % 90)} ${224})`} />)}
            {/* tubos bajo la calle */}
            <path d="M740 244 v64" stroke="#2f6fb3" strokeWidth="10" />
            <path d="M0 308 H1000" stroke="#2f6fb3" strokeWidth="18" opacity="0.9" />
            <path d="M0 430 H1000" stroke="#8a5a2b" strokeWidth="16" opacity="0.9" />
            <text x="20" y="300" className="q-svg-label" fill="#1d4f86">Tubo de aguas lluvias → quebrada</text>
            <text x="20" y="460" className="q-svg-label" fill="#6b3f17">Tubo de aguas residuales → planta de tratamiento</text>
            {/* lo que lleva el tubo de aguas lluvias */}
            {(raining || inp.wrongHouses > 0) && (
              <path d="M0 308 H1000" stroke={raining ? '#8b7b62' : '#7a5f3e'} strokeWidth="6" strokeDasharray="14 10" className="q-flow" opacity="0.85" />
            )}
            <path d="M0 430 H1000" stroke="#c9a77a" strokeWidth="4" strokeDasharray="12 10" className="q-flow" opacity="0.8" />
            {/* quebrada a la derecha */}
            <path d="M900 330 q40 10 100 0 v80 q-60 10 -100 0z" fill={raining ? '#8f7a55' : inp.wrongHouses > 0 ? '#6d8a83' : '#4a90c2'} opacity="0.9" />
            <text x="950" y="400" textAnchor="middle" className="q-svg-label" fill="#fff">quebrada</text>
            {/* lluvia */}
            {raining && Array.from({ length: 90 }, (_, k) => <line key={k} x1={(k * 37) % 1000} y1={(k * 23) % 230} x2={((k * 37) % 1000) - 7} y2={((k * 23) % 230) + 18} stroke="#5d7f96" strokeWidth="1.3" opacity="0.55" />)}
            <text x="985" y="505" textAnchor="end" className="q-svg-note">Esquema de una cuadra (no a escala).</text>
          </svg>
          <div className="q-probe-bar">
            <button type="button" className="btn btn-primary" onClick={rain}>
              {play < 0 ? `Que llueva (${fmt(rainMm, 0)} mm)` : raining ? `Lloviendo… minuto ${minute}` : 'Volver a llover'}
            </button>
            <p className="q-help" aria-live="polite">
              {play < 0 ? `En la calle hay ${fmt(totalKg, 1)} kg de tierra, polvo, hojas y residuos acumulados en ${inp.dryDays} días sin llover.` : `La lluvia ha arrastrado ${fmt(washedKg, 1)} kg hacia el sumidero; quedan ${fmt(left, 1)} kg en la calle.`}
            </p>
          </div>
        </div>
      }
      panel={
        <div className="q-part">
          <p className="q-lead">
            Lo que cae en la calle no se queda ahí: cuando llueve, el agua lo arrastra al sumidero y el tubo de aguas lluvias lo lleva a la quebrada, sin pasar por ninguna planta.
          </p>
          <section className="q-box" aria-label="La calle">
            <h3>La calle</h3>
            <QRange label="Días sin llover" value={inp.dryDays} min={1} max={30} step={1} unit="días" onChange={(v) => set({ dryDays: v })} />
            <Toggle label="Barrido de la calle" checked={inp.sweeping} onChange={(v) => set({ sweeping: v })} help="El barrido frecuente recoge cerca de la mitad de la mugre antes de que llueva." />
            <Segmented<'poca' | 'mucha'> label="Basura en la calle" value={inp.litter} options={[{ value: 'poca', label: 'Poca' }, { value: 'mucha', label: 'Mucha' }]} onChange={(v) => set({ litter: v })} />
            <Segmented<number> label="Aguacero de 30 minutos" value={inp.rainMmH} options={[{ value: 10, label: 'Suave · 10 mm/h' }, { value: 30, label: 'Fuerte · 30 mm/h' }, { value: 60, label: 'Muy fuerte · 60 mm/h' }]} onChange={(v) => set({ rainMmH: v })} />
            <QRange label="Casas con conexión errada" value={inp.wrongHouses} min={0} max={STREET.houses} step={1} unit={`de ${STREET.houses}`} onChange={(v) => set({ wrongHouses: v })} help="Su baño o su cocina están conectados, por error, al tubo de aguas lluvias." />
          </section>

          <section className="q-box" aria-label="Lo que llega a la quebrada">
            <h3>Lo que llega a la quebrada</h3>
            <dl className="q-readings">
              <div>
                <dt>Arrastrado por el aguacero</dt>
                <dd>{fmt(w.totalKg, 1)} kg de sólidos</dd>
              </div>
              <div>
                <dt>En los primeros 10 mm</dt>
                <dd>{fmt(w.firstFlushPct, 0)} % de lo arrastrado</dd>
              </div>
              <div>
                <dt>Basura en el sumidero</dt>
                <dd>unos {w.trashItems} objetos</dd>
              </div>
              <div>
                <dt>Agua sucia por conexiones erradas</dt>
                <dd>{fmt(w.sewageM3, 1)} m³ cada día, llueva o no</dd>
              </div>
            </dl>
            <ProfileChart
              title="Concentración de sólidos en el agua que entra al sumidero"
              yUnit="mg/L"
              fmtY={(v) => fmt(v, 0)}
              xLabel="minutos de lluvia"
              xUnit="min"
              lines={[{ label: 'sólidos', color: '#8a5a2b', points: w.t.map((t, i) => [t, w.conc[i]]) }]}
              marks={play >= 0 ? [{ x: Math.max(1, Math.min(inp.durationMin, play)), label: 'ahora', strong: true }] : []}
            />
            <p className="q-help">
              Esto es el <strong>primer lavado</strong>: al empezar el aguacero el agua sale muy sucia y después se va aclarando, porque ya no queda tanta mugre que arrastrar.
            </p>
            {w.trashItems > 12 && <p className="q-verdict is-bad">Tanta basura puede tapar el sumidero: el agua ya no entra y se queda en la calle.</p>}
            {inp.wrongHouses > 0 && (
              <p className="q-verdict is-bad">
                Con {inp.wrongHouses} {inp.wrongHouses === 1 ? 'casa mal conectada llegan' : 'casas mal conectadas llegan'} a la quebrada cada día unos {w.coliformsGiga >= 1000 ? `${fmt(w.coliformsGiga / 1000, 1)} billones` : `${fmt(w.coliformsGiga, 0)} mil millones`} de coliformes fecales, aunque no llueva.
              </p>
            )}
          </section>

          <section className="q-box" aria-label="Probar en el laboratorio de lluvia">
            <h3>Pruébalo en el laboratorio de lluvia</h3>
            <p>En la maqueta de Medellín el agua se calcula celda por celda. Dos misiones van con este tema:</p>
            <div className="q-actions">
              <button type="button" className="btn-ghost small" onClick={() => goLab('sumidero-obstruido')}>
                Misión: sumidero obstruido
              </button>
              <button type="button" className="btn-ghost small" onClick={() => goLab('conexiones-erradas')}>
                Misión: conexiones erradas
              </button>
            </div>
            <p className="q-help">La misión de conexiones erradas muestra el error contrario: techos conectados a la red de aguas residuales, que se llena y rebosa cuando llueve.</p>
          </section>

          <section className="q-box" aria-label="Qué podemos hacer">
            <h3>¿Qué podemos hacer?</h3>
            <ul className="q-list">
              <li>Barrer y recoger la basura antes de que llueva; nunca barrerla hacia el sumidero.</li>
              <li>Revisar que el baño, la cocina y el lavadero vayan a la red de aguas residuales, y los techos a la de aguas lluvias.</li>
              <li>Recoger los excrementos de las mascotas: la lluvia también los lleva a la quebrada.</li>
            </ul>
          </section>

          <Disclosure title="Para docentes: el modelo y sus fuentes">
            <div className="q-teacher">
              <p>
                <strong>Acumulación.</strong> B = B<sub>máx</sub>·(1 − e<sup>−k·días</sup>) con B<sub>máx</sub> = 25 g/m² y k = 0,4/día, la forma exponencial que usa el modelo SWMM de la EPA; el barrido la reduce a la mitad. Calle y andenes de {fmt(STREET.area, 0)} m².
              </p>
              <p>
                <strong>Lavado.</strong> Sartor y Boyd (1972): la fracción arrastrada es 1 − e<sup>−0,18·R</sup>, con R la lluvia acumulada en mm (con 13 mm se va cerca del 90 %). La concentración del minuto es la masa arrastrada sobre el agua que escurre (coeficiente 0,9).
              </p>
              <p>
                <strong>Conexiones erradas.</strong> 4 personas por casa y 102 L de agua usada por persona al día con 10⁷ coliformes fecales por 100 mL (orden de magnitud del agua residual doméstica cruda). Las cantidades de mugre y de basura son ilustrativas: muestran la forma del proceso, no medidas de una calle de Medellín.
              </p>
            </div>
          </Disclosure>
        </div>
      }
    />
  );
}

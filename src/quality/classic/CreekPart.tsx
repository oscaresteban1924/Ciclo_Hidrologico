// Parte 1: «La quebrada y su salud». Una quebrada de montaña recibe el agua usada de un grupo de casas; la
// sonda mide en cualquier punto, se pueden tomar muestras para el laboratorio y levantar una piedra para ver
// los bichos que viven debajo.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Disclosure, Segmented, Toggle } from '../../components/ui';
import { useStore } from '../../state/store';
import { CritterGlyph } from '../Glyphs';
import { BMWP_CLASSES, DEFAULT_CREEK, PERSONS_PER_HOUSE, SWIM, TREATMENTS, bmwp, canSwim, creekModel, doSat, stoneSample, type CreekInput, type Reading, type Season, type Slope, type Treatment } from '../model';
import { ProfileChart, QLayout, QRange, fmt, fmtBig } from '../ui';

const X_MIN = -400, X_MAX = 3000, OUT_SX = 250;
/** Posición en el dibujo (0–1000) para una distancia a lo largo de la quebrada [m]. */
const sxOf = (x: number) => (x < 0 ? 30 + ((x - X_MIN) / -X_MIN) * (OUT_SX - 30) : OUT_SX + (x / X_MAX) * (975 - OUT_SX));
const xOfSx = (sx: number) => (sx < OUT_SX ? X_MIN + ((sx - 30) / (OUT_SX - 30)) * -X_MIN : ((sx - OUT_SX) / (975 - OUT_SX)) * X_MAX);
const yOf = (sx: number) => 178 + (sx - 30) * 0.24 + 26 * Math.sin((sx - 30) / 105);

const STATIONS = [
  { id: 'A', x: -200, name: 'A · arriba del tubo' },
  { id: 'B', x: 50, name: 'B · junto al tubo' },
  { id: 'C', x: 600, name: 'C · 600 m abajo' },
  { id: 'D', x: 2500, name: 'D · 2,5 km abajo' },
] as const;

type Param = 'oxigeno' | 'coliformes' | 'turbiedad' | 'dbo';

/** Color del agua dibujada: azul claro, café con la turbiedad y verde grisáceo con la materia orgánica. */
function waterColor(r: Reading): string {
  const tb = Math.min(1, r.turbidity / 120), org = Math.min(1, r.dbo / 18);
  const blue = [74, 144, 194], brown = [138, 112, 74], murky = [104, 112, 86];
  const c = blue.map((b, i) => b + (brown[i] - b) * tb);
  const d = c.map((v, i) => v + (murky[i] - v) * org * 0.85);
  return `rgb(${d.map((v) => Math.round(v)).join(',')})`;
}

function chip(level: 'ok' | 'mid' | 'bad', text: string) {
  return <span className={`q-chip is-${level}`}>{text}</span>;
}

function readingRows(r: Reading) {
  const o2 = r.dissolvedO2 >= 6 ? chip('ok', 'bien') : r.dissolvedO2 >= 4 ? chip('mid', 'bajo') : chip('bad', 'muy bajo');
  const tb = r.turbidity < 10 ? chip('ok', 'clara') : r.turbidity < 50 ? chip('mid', 'turbia') : chip('bad', 'muy turbia');
  const ce = r.conductivity < 150 ? chip('ok', 'normal') : r.conductivity < 400 ? chip('mid', 'alta') : chip('bad', 'muy alta');
  const ph = r.pH >= 6.5 && r.pH <= 8.5 ? chip('ok', 'normal') : chip('mid', 'fuera de lo normal');
  return [
    { k: 'Temperatura', v: `${fmt(r.T, 1)} °C`, c: null },
    { k: 'Oxígeno disuelto', v: `${fmt(r.dissolvedO2, 1)} mg/L · ${fmt(r.satPct, 0)} %`, c: o2 },
    { k: 'pH', v: fmt(r.pH, 1), c: ph },
    { k: 'Conductividad', v: `${fmt(r.conductivity, 0)} µS/cm`, c: ce },
    { k: 'Turbiedad', v: `${fmt(r.turbidity, r.turbidity < 10 ? 1 : 0)} UNT`, c: tb },
  ];
}

export function CreekPart({ head, goStreet }: { head: ReactNode; goStreet: () => void }) {
  const { dispatch } = useStore();
  const [inp, setInp] = useState<CreekInput>({ ...DEFAULT_CREEK, houses: 300 });
  const [probe, setProbe] = useState(350);
  const [samples, setSamples] = useState<{ id: number; x: number; inp: CreekInput; r: Reading }[]>([]);
  const [stone, setStone] = useState(false);
  const [param, setParam] = useState<Param>('coliformes');
  const nextId = useRef(1);
  const set = (p: Partial<CreekInput>) => setInp((s) => ({ ...s, ...p }));
  const m = useMemo(() => creekModel(inp), [inp]);
  // los bichos muestran cómo ha estado el agua durante semanas: se calculan con el tiempo seco
  const mDry = useMemo(() => creekModel({ ...inp, afterRain: false }), [inp]);
  const r = m.at(probe);
  const swim = canSwim(r);
  const sample = useMemo(() => stoneSample(mDry.at(probe)), [mDry, probe]);
  const score = bmwp(sample);
  const pts = useMemo(() => {
    const xs: number[] = [];
    for (let x = X_MIN; x <= X_MAX; x += 25) xs.push(x);
    return xs.map((x) => m.at(x));
  }, [m]);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // en teléfonos el dibujo se desplaza de lado: se mantiene la sonda a la vista
  const panScrolls = () => !!panRef.current && panRef.current.scrollWidth > panRef.current.clientWidth + 2;
  useEffect(() => {
    const el = panRef.current;
    if (!el || !panScrolls()) return;
    const target = (sxOf(probe) / 1000) * el.scrollWidth - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [probe]);
  const moveProbe = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    const sx = ((clientX - b.left) / b.width) * 1000;
    const x = Math.max(X_MIN, Math.min(X_MAX, xOfSx(Math.max(30, Math.min(975, sx)))));
    setProbe(Math.round(x / 10) * 10);
  };
  const houseIcons = Math.min(28, Math.ceil(inp.houses / 36));
  const tr = TREATMENTS[inp.treatment];
  const people = inp.houses * PERSONS_PER_HOUSE;
  const where = probe < 0 ? `${fmt(-probe, 0)} m arriba del tubo` : probe === 0 ? 'en el tubo' : `${fmt(probe, 0)} m abajo del tubo`;
  const psx = sxOf(probe), psy = yOf(psx);
  const paramDef: Record<Param, { title: string; unit: string; get: (q: Reading) => number; log?: boolean; refs?: { y: number; label: string; color: string }[]; fmtY: (v: number) => string }> = {
    oxigeno: { title: 'Oxígeno disuelto a lo largo de la quebrada', unit: 'mg/L', get: (q) => q.dissolvedO2, refs: [{ y: 4, label: 'muy bajo para los bichos sensibles (4 mg/L)', color: '#c0462a' }], fmtY: (v) => fmt(v, 1) },
    coliformes: { title: 'Coliformes fecales a lo largo de la quebrada', unit: 'NMP/100 mL', get: (q) => q.coliforms, log: true, refs: [{ y: SWIM.coliformsFecal, label: 'máximo para nadar (200)', color: '#c0462a' }], fmtY: (v) => (v >= 1e4 ? `10${String(Math.round(Math.log10(v))).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d])}` : fmtBig(v)) },
    turbiedad: { title: 'Turbiedad a lo largo de la quebrada', unit: 'UNT', get: (q) => q.turbidity, fmtY: (v) => fmt(v, 0) },
    dbo: { title: 'Materia orgánica (DBO5) a lo largo de la quebrada', unit: 'mg/L', get: (q) => q.dbo, fmtY: (v) => fmt(v, 1) },
  };
  const pd = paramDef[param];
  const takeSample = () => {
    const id = nextId.current++;
    setSamples((s) => [...s.slice(-5), { id, x: probe, inp, r }]);
  };
  const saveLog = () => {
    const rows = samples.map((s) => `${s.x < 0 ? `${-s.x} m arriba` : `${s.x} m abajo`}: coliformes ${fmtBig(s.r.coliforms)} NMP/100 mL, DBO5 ${fmt(s.r.dbo, 1)} mg/L, oxígeno ${fmt(s.r.dissolvedO2, 1)} mg/L`).join('; ');
    dispatch({ type: 'log', entry: { kind: 'observacion', title: 'Muestras de la quebrada', text: `${inp.houses} casas (${TREATMENTS[inp.treatment].name.toLowerCase()}), ${inp.season === 'verano' ? 'verano' : inp.season === 'lluvioso' ? 'temporada de lluvias' : 'caudal normal'}. ${rows}.` } });
  };
  // qué cambia más al conectar las casas
  const fixed = useMemo(() => creekModel({ ...inp, treatment: 'alcantarillado' }).at(probe), [inp, probe]);

  return (
    <QLayout
      head={head}
      stage={
      <div className="q-stage-creek">
        <div className="q-pan" ref={panRef}>
        <svg
          ref={svgRef}
          viewBox="0 0 1000 520"
          className="q-scene"
          role="img"
          aria-label={`Quebrada de montaña con ${inp.houses} casas que vierten su agua usada (${tr.name.toLowerCase()}). La sonda está ${where}.`}
          onPointerDown={(e) => {
            // con el dedo, si el dibujo se desplaza de lado, el gesto mueve el dibujo y no la sonda
            if (e.pointerType === 'touch' && panScrolls()) return;
            dragging.current = true;
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            moveProbe(e.clientX);
          }}
          onPointerMove={(e) => dragging.current && moveProbe(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
        >
          <defs>
            <linearGradient id="q-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={inp.afterRain ? '#b7c4cc' : '#cfe6f3'} />
              <stop offset="1" stopColor={inp.afterRain ? '#dfe5e6' : '#eef6ef'} />
            </linearGradient>
            <linearGradient id="q-water" gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="975" y2="0">
              {pts.filter((_, i) => i % 3 === 0).map((q) => (
                <stop key={q.x} offset={(sxOf(q.x) - 30) / 945} stopColor={waterColor(q)} />
              ))}
            </linearGradient>
          </defs>
          <rect width="1000" height="520" fill="url(#q-sky)" />
          <path d="M0 210 L120 90 L230 160 L360 60 L500 170 L640 80 L790 180 L900 110 L1000 170 V520 H0Z" fill="#a9c1b2" />
          <path d="M0 260 Q180 170 360 230 T720 220 T1000 250 V520 H0Z" fill="#8fb48c" />
          <path d="M0 330 Q260 280 520 330 T1000 340 V520 H0Z" fill="#7aa774" />
          {/* árboles de la orilla */}
          {inp.trees &&
            Array.from({ length: 34 }, (_, k) => {
              const sx = 40 + k * 28 + ((k * 37) % 11);
              if (sx > 160 && sx < 345) return null;
              const side = k % 2 ? -1 : 1;
              const y = yOf(sx) + side * (28 + ((k * 13) % 9));
              return (
                <g key={k}>
                  <rect x={sx - 1.5} y={y - 4} width="3" height="10" fill="#6b4a32" />
                  <circle cx={sx} cy={y - 10} r={11 + ((k * 7) % 5)} fill={k % 5 === 0 ? '#5f8f45' : '#4f7f3c'} />
                </g>
              );
            })}
          {/* casas */}
          {Array.from({ length: houseIcons }, (_, k) => {
            const col = k % 7, row = Math.floor(k / 7);
            const hx = 168 + col * 24 + (row % 2) * 10, hy = yOf(hx) - 70 - row * 22;
            return (
              <g key={k}>
                <rect x={hx} y={hy} width="18" height="15" fill={['#e9dccb', '#d9b9a0', '#efe7d6', '#cfa58a'][k % 4]} stroke="#7d6a58" strokeWidth="0.8" />
                <path d={`M${hx - 2} ${hy} l11 -8 l11 8z`} fill="#b25b3c" />
                <rect x={hx + 6} y={hy + 7} width="5" height="8" fill="#7d6a58" />
              </g>
            );
          })}
          {/* tubo, tanque o planta */}
          {inp.houses > 0 && inp.treatment !== 'alcantarillado' && (
            <g>
              <path d={`M${OUT_SX - 20} ${yOf(OUT_SX) - 58} L${OUT_SX - 2} ${yOf(OUT_SX) - 58} L${OUT_SX - 2} ${yOf(OUT_SX) - 12}`} fill="none" stroke="#5b4a3a" strokeWidth="7" strokeLinecap="round" />
              {inp.treatment === 'septico' && <rect x={OUT_SX - 44} y={yOf(OUT_SX) - 70} width="26" height="20" rx="3" fill="#8a8f93" stroke="#4a4f52" />}
              {inp.treatment === 'ptar' && (
                <g>
                  <rect x={OUT_SX - 62} y={yOf(OUT_SX) - 76} width="44" height="26" rx="4" fill="#9bb7c9" stroke="#3f5a6b" />
                  <circle cx={OUT_SX - 48} cy={yOf(OUT_SX) - 63} r="7" fill="#d8eaf3" stroke="#3f5a6b" />
                  <circle cx={OUT_SX - 31} cy={yOf(OUT_SX) - 63} r="7" fill="#d8eaf3" stroke="#3f5a6b" />
                </g>
              )}
              <path d={`M${OUT_SX - 2} ${yOf(OUT_SX) - 12} q4 8 0 14`} fill="none" stroke={inp.treatment === 'ptar' ? '#9fb6a8' : '#7a5f3e'} strokeWidth="5" opacity="0.9" />
            </g>
          )}
          {inp.houses > 0 && inp.treatment === 'alcantarillado' && (
            <g>
              <path d={`M${OUT_SX - 20} ${yOf(OUT_SX) - 58} H${OUT_SX + 120} L${OUT_SX + 160} ${yOf(OUT_SX + 160) - 40}`} fill="none" stroke="#5b4a3a" strokeWidth="5" strokeDasharray="10 5" />
              <text x={OUT_SX + 60} y={yOf(OUT_SX) - 64} className="q-svg-label">colector → planta de tratamiento</text>
            </g>
          )}
          {/* quebrada */}
          <polyline points={Array.from({ length: 96 }, (_, k) => `${30 + k * 9.85},${yOf(30 + k * 9.85).toFixed(1)}`).join(' ')} fill="none" stroke="#5e4b37" strokeWidth="30" strokeLinecap="round" opacity="0.35" />
          <polyline points={Array.from({ length: 96 }, (_, k) => `${30 + k * 9.85},${yOf(30 + k * 9.85).toFixed(1)}`).join(' ')} fill="none" stroke="url(#q-water)" strokeWidth="22" strokeLinecap="round" />
          {/* piedras y peces donde hay oxígeno y poca materia orgánica */}
          {pts.filter((_, i) => i % 9 === 4).map((q) => {
            const sx = sxOf(q.x), y = yOf(sx);
            const fish = q.dissolvedO2 >= 5.5 && q.dbo < 6;
            return (
              <g key={q.x}>
                <ellipse cx={sx - 6} cy={y + 4} rx="5" ry="3" fill="#8d8a80" opacity="0.8" />
                {fish && <path d={`M${sx + 2} ${y - 2} q6 -4 12 0 q-6 4 -12 0 l-4 -3 v6z`} fill="#e8c766" stroke="#7a6630" strokeWidth="0.6" />}
              </g>
            );
          })}
          {/* lluvia */}
          {inp.afterRain && Array.from({ length: 60 }, (_, k) => <line key={k} x1={(k * 53) % 1000} y1={(k * 37) % 300} x2={((k * 53) % 1000) - 6} y2={((k * 37) % 300) + 16} stroke="#5d7f96" strokeWidth="1.2" opacity="0.45" />)}
          {/* estaciones */}
          {STATIONS.map((s) => {
            const sx = sxOf(s.x), y = yOf(sx);
            return (
              <g key={s.id} className="q-station" onPointerDown={(e) => { e.stopPropagation(); setProbe(s.x); }}>
                <line x1={sx} x2={sx} y1={y - 16} y2={y - 52} stroke="#17324d" strokeWidth="1.6" />
                <path d={`M${sx} ${y - 52} h20 l-6 7 l6 7 h-20z`} fill="#fbfdfc" stroke="#17324d" />
                <text x={sx + 7} y={y - 41} className="q-svg-flag">{s.id}</text>
              </g>
            );
          })}
          {/* sonda */}
          <g className="q-probe" aria-hidden="true">
            <line x1={psx} x2={psx} y1={psy - 70} y2={psy + 2} stroke="#c8246f" strokeWidth="2.4" />
            <rect x={psx - 22} y={psy - 104} width="44" height="34" rx="6" fill="#17324d" />
            <rect x={psx - 17} y={psy - 99} width="34" height="16" rx="2" fill="#bfe6d4" />
            <text x={psx} y={psy - 87} textAnchor="middle" className="q-svg-probe">{fmt(r.dissolvedO2, 1)}</text>
            <circle cx={psx} cy={psy + 2} r="4" fill="#c8246f" />
          </g>
          <text x="985" y="505" textAnchor="end" className="q-svg-note">Dibujo esquemático; la distancia no está a escala antes del tubo.</text>
        </svg>
        </div>
        <p className="q-pan-hint">Desliza el dibujo de lado; la sonda se mueve con el control de abajo.</p>
        <div className="q-probe-bar">
          <QRange label="Posición de la sonda" value={probe} min={X_MIN} max={X_MAX} step={10} unit="m" onChange={setProbe} help={`La sonda está ${where}. Arrástrala sobre la quebrada o toca una estación.`} />
          <div className="q-stations" role="group" aria-label="Estaciones de muestreo">
            {STATIONS.map((s) => (
              <button key={s.id} type="button" className={probe === s.x ? 'is-on' : ''} onClick={() => setProbe(s.x)}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      }
      panel={
      <div className="q-part">
        <p className="q-lead">
          Arriba, la quebrada baja limpia desde la montaña. Más abajo, un tubo trae el agua usada de <strong>{fmt(inp.houses, 0)} casas</strong> (unas {fmt(people, 0)} personas). Mueve la sonda, toma muestras y levanta una piedra.
        </p>
        <section className="q-box" aria-label="El barrio y la quebrada">
          <h3>El barrio y la quebrada</h3>
          <QRange label="Casas que vierten al tubo" value={inp.houses} min={0} max={1000} step={10} unit="casas" onChange={(v) => set({ houses: v })} help={`${fmt(m.Qw * 1000, 2)} L/s de agua usada frente a ${fmt(m.Qr * 1000, 0)} L/s de la quebrada.`} />
          <Segmented<Treatment>
            label="¿A dónde va el agua de las casas?"
            value={inp.treatment}
            options={[
              { value: 'ninguno', label: 'Directo' },
              { value: 'septico', label: 'Tanque séptico' },
              { value: 'ptar', label: 'Planta pequeña' },
              { value: 'alcantarillado', label: 'Alcantarillado' },
            ]}
            onChange={(v) => set({ treatment: v })}
            help={tr.note}
          />
          <Segmented<Season> label="Temporada" value={inp.season} options={[{ value: 'verano', label: 'Verano' }, { value: 'normal', label: 'Normal' }, { value: 'lluvioso', label: 'Lluvias' }]} onChange={(v) => set({ season: v })} help="En verano la quebrada lleva menos agua para diluir lo que le llega." />
          <Segmented<Slope> label="Cauce" value={inp.slope} options={[{ value: 'montana', label: 'De montaña (4 %)' }, { value: 'plana', label: 'Lento y plano (0,5 %)' }]} onChange={(v) => set({ slope: v })} help="El agua que salta entre piedras toma oxígeno del aire mucho más rápido." />
          <Toggle label="Árboles en la orilla" checked={inp.trees} onChange={(v) => set({ trees: v })} help="Dan sombra (el agua fresca guarda más oxígeno) y sujetan la tierra cuando llueve." />
          <Toggle label="Acaba de llover" checked={inp.afterRain} onChange={(v) => set({ afterRain: v })} help="La lluvia lava calles y laderas: llega tierra y microbios, aunque la quebrada lleve más agua." />
        </section>

        <section className="q-box q-meter" aria-label="Lo que mide la sonda">
          <h3>La sonda, {where}</h3>
          <dl className="q-readings">
            {readingRows(r).map((row) => (
              <div key={row.k}>
                <dt>{row.k}</dt>
                <dd>
                  {row.v} {row.c}
                </dd>
              </div>
            ))}
          </dl>
          <p className="q-help">El oxígeno que cabe en el agua a {fmt(r.T, 1)} °C en Medellín es {fmt(doSat(r.T, 1495), 1)} mg/L. La sonda mide en el sitio; los microbios y la DBO se miden en el laboratorio.</p>
          <div className="q-actions">
            <button type="button" className="btn btn-primary q-btn-s" onClick={takeSample}>
              Tomar muestra para el laboratorio
            </button>
            <button type="button" className="btn-ghost small" aria-expanded={stone} onClick={() => setStone((v) => !v)}>
              {stone ? 'Volver a poner la piedra' : 'Levantar una piedra'}
            </button>
          </div>
          <p className={`q-verdict ${swim.ok ? 'is-ok' : 'is-bad'}`} role="status">
            {swim.ok ? '¿Se puede nadar aquí? Sí: cumple los criterios para contacto directo con el agua.' : `¿Se puede nadar aquí? No: ${swim.reasons.join('; ')}.`}
          </p>
        </section>

        {samples.length > 0 && (
          <section className="q-box" aria-label="Resultados del laboratorio">
            <h3>Resultados del laboratorio</h3>
            <div className="q-table-wrap">
              <table className="q-table">
                <thead>
                  <tr>
                    <th scope="col">Dónde</th>
                    <th scope="col">Coliformes fecales (NMP/100 mL)</th>
                    <th scope="col">DBO5 (mg/L)</th>
                    <th scope="col">¿Nadar?</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((s) => (
                    <tr key={s.id}>
                      <th scope="row">{s.x < 0 ? `${fmt(-s.x, 0)} m arriba` : `${fmt(s.x, 0)} m abajo`}{s.inp.afterRain ? ' · tras la lluvia' : ''}</th>
                      <td>{fmtBig(s.r.coliforms)}</td>
                      <td>{fmt(s.r.dbo, 1)}</td>
                      <td>{canSwim(s.r).ok ? 'sí' : 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="q-help">La DBO5 tarda 5 días en el laboratorio; aquí se muestra de una vez. Cada muestra guarda las condiciones del momento en que se tomó.</p>
            <div className="q-actions">
              <button type="button" className="btn-ghost small" onClick={saveLog}>Guardar en la bitácora</button>
              <button type="button" className="btn-ghost small" onClick={() => setSamples([])}>Borrar las muestras</button>
            </div>
          </section>
        )}

        {stone && (
          <section className="q-box" aria-label="Bichos debajo de la piedra">
            <h3>Debajo de la piedra</h3>
            <div className="q-bmwp" style={{ borderColor: score.cls.color }}>
              <strong style={{ background: score.cls.color }}>Clase {score.cls.cls}</strong>
              <span>
                BMWP/Col = <b>{score.total}</b> · {score.cls.name}: {score.cls.meaning.toLowerCase()}
              </span>
            </div>
            {sample.length === 0 ? (
              <p>No apareció ningún bicho.</p>
            ) : (
              <ul className="q-critters">
                {sample.map((f) => (
                  <li key={f.id}>
                    <CritterGlyph glyph={f.glyph} color={f.color} />
                    <div>
                      <strong>{f.common}</strong>
                      <span className="q-fam">{f.family} · {f.count} {f.count === 1 ? 'individuo' : 'individuos'}</span>
                      <span className="q-help">{f.note}</span>
                    </div>
                    <span className="q-score" aria-label={`puntaje ${f.score}`}>{f.score}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="q-help">
              Cada familia suma su puntaje: 10 las que solo viven en agua muy limpia y 1 las que aguantan agua muy sucia. Los bichos muestran cómo ha estado el agua durante semanas (aquí, con tiempo seco), no solo hoy. La presencia de cada familia sigue una regla didáctica según su tolerancia.
            </p>
            <ul className="q-scale" aria-label="Clases del índice BMWP/Col">
              {BMWP_CLASSES.map((c) => (
                <li key={c.cls} className={c.cls === score.cls.cls ? 'is-on' : ''}>
                  <i style={{ background: c.color }} aria-hidden="true" />
                  {c.cls} · {c.name} ({c.min === 101 ? 'más de 100' : c.min === 0 ? '15 o menos' : `${c.min} a ${BMWP_CLASSES[BMWP_CLASSES.indexOf(c) - 1].min - 1}`})
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="q-box" aria-label="Perfil de la quebrada">
          <Segmented<Param> label="Ver a lo largo de la quebrada" value={param} options={[{ value: 'coliformes', label: 'Coliformes' }, { value: 'oxigeno', label: 'Oxígeno' }, { value: 'turbiedad', label: 'Turbiedad' }, { value: 'dbo', label: 'DBO5' }]} onChange={setParam} />
          <ProfileChart
            title={pd.title}
            yUnit={pd.unit}
            log={pd.log}
            refs={pd.refs}
            fmtY={pd.fmtY}
            lines={[{ label: pd.title, color: '#1f78b4', points: pts.map((q) => [q.x, pd.get(q)]) }]}
            marks={[...STATIONS.map((s) => ({ x: s.x, label: s.id })), { x: 0, label: 'tubo' }, { x: probe, label: 'sonda', strong: true }]}
          />
        </section>

        <section className="q-box" aria-label="Qué podemos hacer">
          <h3>¿Qué podemos hacer?</h3>
          {inp.treatment === 'alcantarillado' || inp.houses === 0 ? (
            <p>El agua usada no llega a la quebrada: aquí la quebrada está como arriba. Así funciona la mayor parte de Medellín, con el alcantarillado de aguas residuales hasta una planta de tratamiento.</p>
          ) : (
            <p>
              Si estas casas se conectan al alcantarillado de aguas residuales, en este punto los coliformes bajan de {fmtBig(r.coliforms)} a {fmtBig(fixed.coliforms)} NMP/100 mL y la DBO5 de {fmt(r.dbo, 1)} a {fmt(fixed.dbo, 1)} mg/L.
            </p>
          )}
          <ul className="q-list">
            <li>Conectar cada casa a la red de aguas residuales, y no a la de aguas lluvias ni a la quebrada.</li>
            <li>Sembrar y cuidar los árboles de la orilla.</li>
            <li>No botar basura ni escombros: tapan los sumideros y ensucian la quebrada.</li>
          </ul>
          <button type="button" className="q-link" onClick={goStreet}>Ver qué arrastra la lluvia de las calles →</button>
        </section>

        <Disclosure title="Para docentes: el modelo y sus fuentes">
          <div className="q-teacher">
            <p>
              <strong>Mezcla.</strong> En el tubo, balance de masa con mezcla completa: C = (Q<sub>r</sub>·C<sub>r</sub> + Q<sub>w</sub>·C<sub>w</sub>)/(Q<sub>r</sub> + Q<sub>w</sub>). El agua usada es 102 L por persona al día (120 L de consumo con 85 % de retorno), con valores típicos de agua residual doméstica cruda: DBO5 300 mg/L, coliformes fecales 10⁷ NMP/100 mL (orden de magnitud), conductividad 900 µS/cm, turbiedad 150 UNT.
            </p>
            <p>
              <strong>Aguas abajo.</strong> La DBO se descompone con k<sub>d</sub> = 0,3·(H/2,4)^−0,434 por día a 20 °C (Hydroscience, en Chapra); el oxígeno sigue la ecuación de Streeter y Phelps con reaireación de Tsivoglou y Neal (k<sub>a</sub> = 31 183·S·U por día) y demanda del lodo del fondo de 4 g O₂/m²·día en los primeros 800 m si el agua llega sin tratar; los coliformes mueren con k<sub>b</sub> = 0,8 por día a 20 °C (Mancini); las constantes se corrigen por temperatura (θ = 1,047, 1,024, 1,065 y 1,07). El oxígeno de saturación es el de Standard Methods (APHA 4500-O) corregido por la presión a 1 495 m (16 % menos que al nivel del mar).
            </p>
            <p>
              <strong>Ahora:</strong> H = {fmt(m.H * 100, 1)} cm de profundidad, U = {fmt(m.U, 2)} m/s, k<sub>a</sub> = {fmt(m.ka, 0)}/día, k<sub>d</sub> = {fmt(m.kd, 2)}/día, k<sub>b</sub> = {fmt(m.kb, 2)}/día. En una quebrada de montaña la reaireación es tan rápida que el oxígeno casi no baja; los microbios, en cambio, viajan kilómetros.
            </p>
            <p>
              <strong>Nadar.</strong> Criterios para contacto primario del Decreto 1076 de 2015 (art. 2.2.3.3.9.7, que recoge el art. 42 del Decreto 1594 de 1984): coliformes fecales hasta 200 NMP/100 mL, oxígeno al menos 70 % de saturación y pH entre 5 y 9.
            </p>
            <p>
              <strong>Bichos.</strong> Puntajes BMWP/Col de Roldán (2003), según la tabla reproducida por Roldán-Pérez (2016, Rev. Acad. Colomb. Cienc. 40(155)); clases I (más de 100), II (61–100), III (36–60), IV (16–35) y V (15 o menos). La regla de presencia es didáctica: oxígeno mínimo y DBO máxima según el puntaje de la familia.
            </p>
            <p>Los valores son típicos de la literatura y del orden correcto; no corresponden a un monitoreo de una quebrada real de Medellín.</p>
          </div>
        </Disclosure>
      </div>
      }
    />
  );
}

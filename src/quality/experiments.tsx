// Experimentos animados del módulo de calidad: levantar una piedra con la lupa, mirar una gota con el
// microscopio y la prueba de jarras en tiempo real. Los resultados salen del modelo (model.ts); las animaciones
// solo los muestran.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { CritterGlyph } from './Glyphs';
import { bmwp, settledTurbidity, type SampleFamily } from './model';
import { fmt, fmtBig } from './ui';
import { rng, rodsFor } from './three/kit';

function useReduced(): boolean {
  const { state } = useStore();
  return state.prefs.reducedMotion;
}

/** Bucle de animación con tiempo [s] desde `startKey` (se reinicia cuando cambia). */
function useClock(running: boolean, startKey: unknown): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    setT(0);
    if (!running) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      setT((now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, startKey]);
  return t;
}

// ------------------------------------------------------------------ la piedra y la lupa

export function StoneLens({ sample, where, onLook }: { sample: SampleFamily[]; where: string; onLook?: () => void }) {
  const reduced = useReduced();
  const [up, setUp] = useState(false);
  useEffect(() => setUp(false), [where]);
  const score = bmwp(sample);
  const t = useClock(up && !reduced, where);
  // bichos dibujados dentro de la lupa: hasta tres por familia, en lugares fijos (deterministas)
  const bugs = useMemo(() => {
    const R = rng(where.length * 97 + sample.length * 13 + 5);
    const out: { f: SampleFamily; x: number; y: number; a: number; s: number; ph: number }[] = [];
    for (const f of sample) {
      const n = Math.min(3, Math.max(1, Math.round(f.count / 4)));
      for (let k = 0; k < n; k++) {
        const r = 30 + R() * 70, a = R() * Math.PI * 2;
        out.push({ f, x: 120 + Math.cos(a) * r, y: 120 + Math.sin(a) * r * 0.8, a: R() * 360, s: 0.55 + R() * 0.3, ph: R() * 6 });
      }
    }
    return out.slice(0, 26);
  }, [sample, where]);
  return (
    <div className="q3-exp">
      <p className="q3-exp-lead">
        Debajo de las piedras viven larvas de insectos, caracoles y gusanos. Unos solo aguantan agua limpia; otros viven aunque esté sucia. Por eso los bichos cuentan cómo ha estado el agua durante semanas.
      </p>
      <div className="q3-lens-box">
        <svg viewBox="0 0 240 240" className="q3-lens" role="img" aria-label={up ? `Lupa: ${sample.length} familias de bichos en ${where}` : `Piedra en ${where}, sin levantar`}>
          <defs>
            <radialGradient id="lensBg" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#d9cfb8" />
              <stop offset="100%" stopColor="#a99c80" />
            </radialGradient>
            <clipPath id="lensClip">
              <circle cx="120" cy="120" r="104" />
            </clipPath>
          </defs>
          <circle cx="120" cy="120" r="108" fill="url(#lensBg)" stroke="#33414d" strokeWidth="8" />
          <g clipPath="url(#lensClip)">
            {[...Array(14)].map((_, k) => (
              <circle key={k} cx={20 + ((k * 53) % 200)} cy={30 + ((k * 89) % 190)} r={6 + (k % 4) * 3} fill="#9b8d71" opacity="0.5" />
            ))}
            {up &&
              bugs.map((b, i) => {
                const wob = reduced ? 0 : Math.sin(t * 2 + b.ph) * 6;
                return (
                  <g key={i} transform={`translate(${b.x + wob * 0.6} ${b.y + Math.cos(t * 1.6 + b.ph) * 3}) rotate(${b.a + wob}) scale(${b.s})`}>
                    <g transform="translate(-28 -18)">
                      <CritterGlyph glyph={b.f.glyph} color={b.f.color} size={56} />
                    </g>
                  </g>
                );
              })}
            {!up && (
              <g>
                <ellipse cx="120" cy="128" rx="82" ry="58" fill="#7f786c" stroke="#4d4840" strokeWidth="3" />
                <ellipse cx="104" cy="110" rx="34" ry="14" fill="#958e81" opacity="0.7" />
              </g>
            )}
          </g>
          <path d="M196 196 L228 228" stroke="#33414d" strokeWidth="14" strokeLinecap="round" />
        </svg>
        <div className="q3-lens-side">
          <p>
            Estación: <strong>{where}</strong>
          </p>
          {!up ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setUp(true);
                onLook?.();
              }}
            >
              Levantar la piedra
            </button>
          ) : (
            <>
              <p className="q3-big" style={{ color: score.cls.color }}>
                BMWP {score.total}: clase {score.cls.cls}, {score.cls.name.toLowerCase()}
              </p>
              <p className="q3-small">{score.cls.meaning}. Se suman los puntos de cada familia encontrada (índice BMWP/Col).</p>
              <button type="button" className="btn small" onClick={() => setUp(false)}>
                Bajar la piedra
              </button>
            </>
          )}
        </div>
      </div>
      {up && (
        <ul className="q3-critters">
          {sample.length === 0 && <li>No apareció ningún bicho: el agua no tiene oxígeno suficiente.</li>}
          {sample.map((f) => (
            <li key={f.id}>
              <CritterGlyph glyph={f.glyph} color={f.color} size={44} />
              <span>
                <strong>{f.common}</strong> · {f.score} puntos
                <small>{f.note}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ microscopio


export function Microscope({ count, unit, what, onLook }: { count: number; unit: string; what: string; onLook?: (n: number) => void }) {
  const reduced = useReduced();
  const ref = useRef<HTMLCanvasElement>(null);
  const n = count < 0.5 ? 0 : rodsFor(count);
  useEffect(() => {
    onLook?.(n);
    // se avisa una vez por muestra
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [what, n]);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const R = rng(n * 31 + 7);
    const rods = [...Array(n)].map(() => ({ x: 30 + R() * 200, y: 30 + R() * 200, a: R() * Math.PI, vx: (R() - 0.5) * 12, vy: (R() - 0.5) * 12, l: 9 + R() * 6 }));
    const dust = [...Array(18)].map(() => ({ x: R() * 260, y: R() * 260, r: 1 + R() * 3 }));
    let raf = 0, last = performance.now();
    const draw = (now: number) => {
      const dt = reduced ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, 260, 260);
      ctx.save();
      ctx.beginPath();
      ctx.arc(130, 130, 122, 0, Math.PI * 2);
      ctx.clip();
      const g = ctx.createRadialGradient(130, 120, 10, 130, 130, 130);
      g.addColorStop(0, '#fbfaf2');
      g.addColorStop(1, '#d9dccd');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 260, 260);
      ctx.fillStyle = 'rgba(150,140,110,0.35)';
      for (const d of dust) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const r of rods) {
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.a += dt * 0.6 * Math.sign(r.vx);
        if (r.x < 20 || r.x > 240) r.vx *= -1;
        if (r.y < 20 || r.y > 240) r.vy *= -1;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.a);
        ctx.fillStyle = '#7a3fa0';
        ctx.beginPath();
        ctx.roundRect(-r.l / 2, -2.6, r.l, 5.2, 2.6);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#2f3b46';
      ctx.beginPath();
      ctx.arc(130, 130, 124, 0, Math.PI * 2);
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [n, reduced]);
  return (
    <div className="q3-exp q3-micro">
      <canvas ref={ref} width={260} height={260} role="img" aria-label={n ? `Microscopio: ${n} bastoncitos que representan ${fmtBig(count)} ${unit}` : 'Microscopio: no se ve ninguna bacteria indicadora'} />
      <div>
        <p>
          Muestra: <strong>{what}</strong>
        </p>
        <p className="q3-big">{count < 0.5 ? 'Ninguna bacteria indicadora' : `${fmtBig(count)} ${unit}`}</p>
        <p className="q3-small">
          Las bacterias coliformes viven en el intestino de las personas y los animales: si aparecen en el agua, llegó agua de alcantarilla. Cada bastoncito del dibujo representa muchas; su número crece con el logaritmo del conteo (10 → 6, mil → 18, un millón → 36).
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ prueba de jarras

export const JARS = [0, 10, 20, 30, 45, 65];
const PHASES = [
  { id: 'mezcla', name: 'Mezcla rápida', dur: 2.5 },
  { id: 'flocs', name: 'Se forman los flocs', dur: 4 },
  { id: 'reposo', name: 'Reposo: los flocs caen', dur: 5.5 },
] as const;

function jarColor(t: number): string {
  const clear = [214, 232, 240], brown = [150, 112, 70];
  const f = Math.min(1, t / 120);
  return `rgb(${clear.map((c, i) => Math.round(c + (brown[i] - c) * Math.sqrt(f))).join(',')})`;
}

export function JarTest({ raw, onResult }: { raw: number; onResult: (dose: number, best: boolean) => void }) {
  const reduced = useReduced();
  const [run, setRun] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const total = PHASES.reduce((a, p) => a + p.dur, 0);
  const t = useClock(run > 0 && !reduced, run);
  const tt = reduced && run > 0 ? total : t;
  const done = run > 0 && tt >= total;
  useEffect(() => setPicked(null), [raw]);
  const results = JARS.map((d) => settledTurbidity(raw, d));
  const best = results.indexOf(Math.min(...results));
  let phase = -1, pt = 0;
  {
    let acc = 0;
    for (let k = 0; k < PHASES.length; k++) {
      if (tt < acc + PHASES[k].dur) {
        phase = k;
        pt = (tt - acc) / PHASES[k].dur;
        break;
      }
      acc += PHASES[k].dur;
    }
    if (run > 0 && phase < 0) {
      phase = PHASES.length;
      pt = 1;
    }
  }
  const parts = useMemo(() => {
    const R = rng(raw * 7 + 3);
    return [...Array(26)].map(() => ({ x: R(), y: R(), c: Math.floor(R() * 4), ph: R() * 6.28 }));
  }, [raw]);
  return (
    <div className="q3-exp">
      <p className="q3-exp-lead">
        Seis jarras con el mismo agua del río ({fmt(raw, 0)} UNT) y distinta dosis de coagulante (sulfato de aluminio). El coagulante junta las partículas en grumos (flocs) que pesan y se van al fondo. ¿Cuál queda más clara?
      </p>
      <div className="q3-jars" role="img" aria-label={done ? `Resultado: la jarra más clara es la de ${JARS[best]} mg/L` : 'Seis jarras con agua turbia'}>
        {JARS.map((d, j) => {
          const fin = results[j];
          const eff = 1 - fin / raw;
          const show = phase < 2 ? raw : phase === 2 ? raw + (fin - raw) * pt : fin;
          return (
            <div key={d} className={`q3-jar${picked === j ? ' is-picked' : ''}`}>
              <svg viewBox="0 0 60 92" aria-hidden="true">
                <path d="M6 4 h48 v80 q0 6 -6 6 h-36 q-6 0 -6 -6 z" fill={jarColor(show)} stroke="#55636e" strokeWidth="2" />
                {run > 0 &&
                  parts.map((p, i) => {
                    // mezcla: giran; flocs: se agrupan según la eficiencia; reposo: los grumos caen
                    let x = 10 + p.x * 40, y = 12 + p.y * 68;
                    const swirl = phase === 0 ? pt : 1;
                    x = 30 + (x - 30) * Math.cos(swirl * 6 + p.ph) * (phase === 0 ? 1 : 0.9);
                    const cx = 16 + p.c * 9.5, cy = 30 + (p.c % 2) * 18;
                    const g = phase >= 1 ? eff * (phase === 1 ? pt : 1) : 0;
                    x += (cx - x) * g;
                    y += (cy - y) * g;
                    const fall = phase >= 2 ? eff * (phase === 2 ? pt : 1) : 0;
                    y += (84 - y) * fall;
                    const r = 1.1 + 1.6 * g;
                    return <circle key={i} cx={Math.max(9, Math.min(51, x))} cy={Math.max(8, Math.min(86, y))} r={r} fill="#6d5236" opacity={0.85} />;
                  })}
                <rect x="27" y="0" width="6" height={phase === 0 ? 40 : 6} fill="#8a949b" />
              </svg>
              <span className="q3-jar-dose">{d} mg/L</span>
              {done && <span className="q3-jar-res">{fmt(fin, fin < 10 ? 1 : 0)} UNT</span>}
              {done && (
                <button
                  type="button"
                  className={`btn small${picked === j ? ' btn-primary' : ''}`}
                  aria-pressed={picked === j}
                  onClick={() => {
                    setPicked(j);
                    onResult(d, j === best);
                  }}
                >
                  Usar
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="q3-jar-bar">
        <button type="button" className="btn btn-primary" onClick={() => setRun((r) => r + 1)}>
          {run ? 'Repetir la prueba' : 'Empezar la prueba'}
        </button>
        <span aria-live="polite">{run === 0 ? 'Las jarras esperan.' : phase < PHASES.length ? `${PHASES[phase].name}…` : picked === null ? 'Listo: elige la jarra más clara y usa su dosis en la planta.' : picked === best ? '¡Esa es la más clara! La planta usará esa dosis.' : 'Hay otra jarra más clara: mira los números.'}</span>
      </div>
      {done && (
        <p className="q3-small">
          Con poco coagulante no se forman grumos; con la dosis justa se forman y caen; con demasiado, las partículas se vuelven a dispersar. Por eso las plantas hacen esta prueba cada vez que cambia el río.
        </p>
      )}
    </div>
  );
}

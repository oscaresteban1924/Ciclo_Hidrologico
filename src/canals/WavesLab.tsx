// «Ondas y crecientes»: flujo no permanente calculado en tiempo real con las ecuaciones de Saint-Venant. Se rompe
// una presa, se cierra de golpe una compuerta o se lanza una creciente, y se mide lo que pasa con los instrumentos
// (perfil del agua, línea de energía e hidrogramas en dos estaciones). La pregunta: ¿qué tan rápido viaja la onda y
// qué tan alta llega?

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DockChoice, DockRange, MedalToast, Q3Layout, Question, RetosList, Scene3D, useRetos, type PanelTab, type Reto } from '../quality/shell';
import { FlatStage, Row, SlopeRange, es } from './common';
import { DesignTab } from './design';
import { ritter, stokerProfile } from './unsteady';
import { DEFAULT_WAVE, WAVE, WaveSim, ratingAt, type RatingPoint, type WaveInput, type WaveSample, type WaveScenario } from './waves';
import { WavesWorld } from './three/wavesWorld';

interface Snap {
  inp: WaveInput;
  t: number;
  te: number | null;
  broken: boolean;
  closed: boolean;
  floodOn: boolean;
  xf: number | null;
  vf: number | null;
  th: { front: number | null; h2: number | null; label: string };
  hA: number;
  hB: number;
  QA: number;
  QB: number;
  Qin: number;
  hAmax: number;
  before: { hA: number; VA: number };
  peaks: ReturnType<WaveSim['peaks']>;
  pts: { x: number; zb: number; z: number; E: number }[];
  /** Huella del nivel máximo desde el último evento (cota, cada 2 celdas). */
  env: number[];
  /** Curva de gasto permanente en A (solo en la creciente). */
  rating: RatingPoint[] | null;
  /** Profundidad y caudal en A desde que empezó la creciente. */
  loop: { h: number; Q: number }[];
  hist: WaveSample[];
  vol: number;
  vIn: number;
  vOut: number;
  vol0: number;
}

function snapOf(sim: WaveSim, vol0: number): Snap {
  const sv = sim.sv;
  const [a, b] = WAVE.gauges;
  const all = sv.points();
  const pts = all.filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x, zb: p.zb, z: p.z, E: p.h > 0.004 ? p.E : p.zb }));
  const te = sim.t0 !== null ? sv.t - sim.t0 : null;
  const hAmax = sim.t0 !== null ? sim.history.filter((s) => s.t >= (sim.t0 ?? 0)).reduce((m, s) => Math.max(m, s.hA), 0) : 0;
  return {
    inp: sim.inp,
    t: sv.t,
    te,
    broken: sim.broken,
    closed: sim.inp.scenario === 'compuerta' && (sv.gate?.a ?? 1) === 0 && sim.t0 !== null,
    floodOn: sim.floodOn,
    xf: sim.frontX(),
    vf: sim.frontSpeed(),
    th: sim.theory(),
    hA: sv.depthAt(a),
    hB: sv.depthAt(b),
    QA: sv.flowAt(a),
    QB: sv.flowAt(b),
    Qin: sim.qIn(sv.t),
    hAmax,
    before: sim.before,
    peaks: sim.peaks(),
    pts,
    env: Array.from(sim.zmax).filter((_, i) => i % 2 === 0),
    rating: sim.inp.scenario === 'creciente' ? sim.rating() : null,
    loop: sim.floodOn && sim.t0 !== null ? sim.history.filter((p) => p.t >= (sim.t0 ?? 0)).map((p) => ({ h: p.hA, Q: p.QA })) : [],
    hist: sim.history.slice(-300),
    vol: sv.volume(),
    vIn: sv.vIn,
    vOut: sv.vOut,
    vol0,
  };
}

const RETOS: Reto<Snap>[] = [
  {
    id: 'hc-ond-ritter',
    title: 'Más rápido que un carro',
    goal: 'Rompe la presa sobre el canal seco y mide el frente: su velocidad debe quedar a menos de 10 % de la de Ritter, 2·√(g·h0).',
    hint: 'Con el canal seco (agua abajo = 0), rompe la presa y espera a que el frente pase la mitad del canal.',
    check: (c) => c.inp.scenario === 'presa' && c.inp.h1 === 0 && c.broken && c.xf !== null && c.xf > 170 && c.vf !== null && c.th.front !== null && Math.abs(c.vf - c.th.front) / c.th.front < 0.1,
    progress: (c) => (c.vf !== null && c.th.front ? `medida ${es(c.vf, 1)} m/s · Ritter ${es(c.th.front, 1)} m/s` : 'sin frente todavía'),
  },
  {
    id: 'hc-ond-stoker',
    title: 'Un muro de agua',
    goal: 'Con agua aguas abajo (0,2 m o más), rompe la presa y deja que el resalto que avanza llegue a la estación B.',
    hint: 'Sobre agua quieta, el frente no es una lengua delgada: es un resalto que se mueve (Stoker).',
    check: (c) => c.inp.scenario === 'presa' && c.inp.h1 >= 0.2 && c.broken && c.xf !== null && c.xf >= WAVE.gauges[1],
    progress: (c) => (c.xf !== null ? `frente en ${es(c.xf, 0)} m` : 'rompe la presa'),
  },
  {
    id: 'hc-ond-favre',
    title: 'El golpe de la compuerta',
    goal: 'Con 6 m³/s o más, cierra de golpe la compuerta y mide la onda en la estación A: su altura debe quedar a menos de 5 % de la de Favre.',
    hint: 'La onda sube por el canal contra la corriente. Mira el hidrograma de la estación A: el agua sube de golpe.',
    check: (c) => c.inp.scenario === 'compuerta' && c.inp.Q >= 6 && c.closed && c.th.h2 !== null && c.hAmax > 0 && Math.abs(c.hAmax - c.th.h2) / c.th.h2 < 0.05,
    progress: (c) => (c.closed && c.th.h2 ? `estación A: ${es(c.hAmax)} m · Favre ${es(c.th.h2)} m` : 'cierra la compuerta'),
  },
  {
    id: 'hc-ond-viaje',
    title: 'La creciente viaja',
    goal: 'Lanza una creciente con un pico de 30 m³/s o más y espera a que el pico pase por la estación B: ¿cuánto tardó entre A y B?',
    hint: 'Compara los picos de los dos hidrogramas: el de B llega después.',
    check: (c) => c.inp.scenario === 'creciente' && c.inp.peak >= 30 && !!c.peaks && c.peaks.B[0] > c.peaks.A[0] && c.t > c.peaks.B[0] + 5,
    progress: (c) => (c.peaks ? `pico en A a los ${es(c.peaks.A[0] - (c.te !== null ? c.t - c.te : 0), 0)} s; en B a los ${es(c.peaks.B[0] - (c.te !== null ? c.t - c.te : 0), 0)} s` : 'lanza la creciente'),
  },
];

/** Perfil longitudinal en vivo: fondo, agua, línea de energía, estructuras y estaciones. */
function ProfileChart({ s, W = 560, H = 150, exact }: { s: Snap; W?: number; H?: number; exact?: boolean }) {
  const pts = s.pts;
  const zmin = Math.min(...pts.map((p) => p.zb)) - 0.2;
  const zmax = Math.max(WAVE.wall + pts[0].zb, ...pts.map((p) => Math.min(p.E, p.z + 2))) + 0.2;
  const L = 40, R = 10, T = 14, B = 22;
  const X = (x: number) => L + (x / WAVE.L) * (W - L - R);
  const Y = (z: number) => H - B - ((z - zmin) / (zmax - zmin)) * (H - T - B);
  const water = `${pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.z).toFixed(1)}`).join(' ')} ${pts
    .slice()
    .reverse()
    .map((p) => `${X(p.x).toFixed(1)},${Y(p.zb).toFixed(1)}`)
    .join(' ')}`;
  const bed = pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.zb).toFixed(1)}`).join(' ');
  const egl = pts.map((p) => `${X(p.x).toFixed(1)},${Y(Math.min(p.E, zmax)).toFixed(1)}`).join(' ');
  // huella: solo donde quedó por encima del agua de ahora (si no, se confunde con la superficie)
  const showEnv = s.env.some((z, i) => pts[i] && z > pts[i].z + 0.02);
  const env = showEnv ? s.env.map((z, i) => (pts[i] ? `${X(pts[i].x).toFixed(1)},${Y(Math.min(z, zmax)).toFixed(1)}` : '')).filter(Boolean).join(' ') : '';
  let ex = '';
  if (exact && s.inp.scenario === 'presa' && s.broken && s.te !== null && s.inp.S <= 0.0005) {
    ex = pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.zb + (s.inp.h1 > 0 ? stokerProfile(p.x, s.te!, WAVE.xDam, s.inp.h0, s.inp.h1) : ritter(p.x, s.te!, WAVE.xDam, s.inp.h0))).toFixed(1)}`).join(' ');
  }
  const ticks = [0, 50, 100, 150, 200, 250, 300];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-hud-svg" role="img" aria-label={`Perfil del agua a los ${es(s.t, 0)} s`}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#f7fafc" />
      <polygon points={water} fill="#9ccbe6" stroke="#1f78b4" strokeWidth="1.2" />
      <polyline points={bed} fill="none" stroke="#6d5a3e" strokeWidth="1.6" />
      <polyline points={egl} fill="none" stroke="#c0392b" strokeWidth="1" strokeDasharray="5 3" />
      {env && <polyline points={env} fill="none" stroke="#d98a00" strokeWidth="1.4" />}
      {ex && <polyline points={ex} fill="none" stroke="#17324d" strokeWidth="1.2" strokeDasharray="2 2" />}
      {s.inp.scenario === 'presa' && !s.broken && <line x1={X(WAVE.xDam)} x2={X(WAVE.xDam)} y1={Y(pts[0].zb)} y2={Y(s.inp.h0 + 0.4)} stroke="#5b6670" strokeWidth="3" />}
      {s.inp.scenario === 'compuerta' && <line x1={X(WAVE.xGate)} x2={X(WAVE.xGate)} y1={Y(-s.inp.S * WAVE.xGate + (s.closed ? 0 : s.inp.gate))} y2={T} stroke="#5b6670" strokeWidth="3" />}
      {WAVE.gauges.map((g, k) => (
        <g key={g}>
          <line x1={X(g)} x2={X(g)} y1={T} y2={H - B} stroke="#7b5ea7" strokeDasharray="2 3" />
          <text x={X(g) + 3} y={T + 9} className="hc-hud-t" fill="#7b5ea7">{k ? 'B' : 'A'}</text>
        </g>
      ))}
      {s.xf !== null && <circle cx={X(s.xf)} cy={Y(-s.inp.S * s.xf) - 4} r="3.5" fill="#c0392b" />}
      {ticks.map((t) => (
        <text key={t} x={X(t)} y={H - 7} className="hc-hud-t" textAnchor={t === 300 ? 'end' : 'middle'} fill="#5b6b78">{t === 300 ? '300 m' : t}</text>
      ))}
      <text x={4} y={T + 8} className="hc-hud-t" fill="#5b6b78">cota (m)</text>
      <g transform={`translate(${W - R - (env ? 168 : 84)} 8)`}>
        <line x1={0} x2={12} y1={0} y2={0} stroke="#c0392b" strokeDasharray="5 3" />
        <text x={15} y={3} className="hc-hud-t" fill="#3c4b57">energía</text>
        {env && (
          <>
            <line x1={66} x2={78} y1={0} y2={0} stroke="#d98a00" strokeWidth="1.4" />
            <text x={81} y={3} className="hc-hud-t" fill="#3c4b57">nivel máximo</text>
          </>
        )}
      </g>
    </svg>
  );
}

/** El pico ya pasó por la estación: fue hace más de 2 s y el caudal ya bajó al menos 3 % de él. */
function passed(s: Snap, k: 'A' | 'B'): boolean {
  if (!s.peaks) return false;
  const [tp, qp] = s.peaks[k];
  const now = k === 'A' ? s.QA : s.QB;
  return s.t > tp + 2 && now < qp - 0.03 * Math.max(1, qp - s.inp.Q);
}

/** Ancho del lazo: caudal a la misma profundidad (80 % de la subida) al subir y al bajar, cuando ya bajó. */
function loopGap(lp: { h: number; Q: number }[]): { h: number; up: number; down: number } | null {
  if (lp.length < 10) return null;
  const pk = lp.reduce((a, p, i) => (p.h > lp[a].h ? i : a), 0);
  if (pk < 3 || pk > lp.length - 4) return null;
  const href = lp[0].h + 0.8 * (lp[pk].h - lp[0].h);
  const up = lp.slice(0, pk + 1).find((p) => p.h >= href);
  const down = lp.slice(pk).find((p) => p.h <= href);
  return up && down ? { h: href, up: up.Q, down: down.Q } : null;
}

/**
 * Curva de gasto en A: la permanente (cada profundidad con un solo caudal) y la medida durante la creciente, que hace
 * un lazo: con la misma profundidad pasa más agua cuando el nivel sube que cuando baja.
 */
function LoopChart({ s, W = 360, H = 170 }: { s: Snap; W?: number; H?: number }) {
  const r = s.rating;
  if (!r) return null;
  const L = 40, R = 10, T = 22, B = 24;
  const lp = s.loop;
  const qTop = Math.max(s.inp.peak * 1.1, ...lp.map((p) => p.Q * 1.05));
  // desde la mitad del caudal de base: lo de más abajo no aporta y aplasta el lazo
  const qLo = Math.max(0.2, 0.5 * Math.min(s.inp.Q, ...lp.map((p) => p.Q)));
  const rr = r.filter((p) => p.Q >= qLo && p.Q <= qTop);
  const hTop = Math.max(...rr.map((p) => p.h), ...lp.map((p) => p.h)) * 1.06;
  const hBot = Math.min(...rr.map((p) => p.h), ...lp.map((p) => p.h)) * 0.94;
  const X = (q: number) => L + (Math.max(0, q) / qTop) * (W - L - R);
  const Y = (h: number) => H - B - ((h - hBot) / (hTop - hBot)) * (H - T - B);
  const steady = rr.map((p) => `${X(p.Q).toFixed(1)},${Y(p.h).toFixed(1)}`).join(' ');
  // subida (hasta el pico de profundidad) y bajada, en dos tramos
  const pk = lp.reduce((a, p, i) => (p.h > lp[a].h ? i : a), 0);
  const seg = (a: typeof lp) => a.map((p) => `${X(p.Q).toFixed(1)},${Y(p.h).toFixed(1)}`).join(' ');
  const gap = loopGap(lp);
  const hs = ratingAt(r, gap?.h ?? -1);
  const ticksQ = [0, 0.5, 1].map((f) => Math.round((qTop * f) / 5) * 5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-hud-svg" role="img" aria-label="Curva de gasto en la estación A: permanente y en lazo durante la creciente">
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#f7fafc" />
      <polyline points={steady} fill="none" stroke="#8a96a0" strokeWidth="1.3" strokeDasharray="5 3" />
      {pk > 0 && <polyline points={seg(lp.slice(0, pk + 1))} fill="none" stroke="#2f7fb0" strokeWidth="1.9" />}
      {pk < lp.length - 1 && <polyline points={seg(lp.slice(pk))} fill="none" stroke="#c0632b" strokeWidth="1.9" />}
      {gap && (
        <g>
          <line x1={X(gap.down)} x2={X(gap.up)} y1={Y(gap.h)} y2={Y(gap.h)} stroke="#17324d" strokeWidth="1" />
          <circle cx={X(gap.up)} cy={Y(gap.h)} r="2.6" fill="#2f7fb0" />
          <circle cx={X(gap.down)} cy={Y(gap.h)} r="2.6" fill="#c0632b" />
          {hs && <circle cx={X(hs.Q)} cy={Y(gap.h)} r="2.6" fill="#fff" stroke="#8a96a0" />}
        </g>
      )}
      {ticksQ.map((q) => (
        <text key={q} x={X(q)} y={H - 9} className="hc-hud-t" textAnchor={q === ticksQ[2] ? 'end' : 'middle'} fill="#5b6b78">{q === ticksQ[2] ? `${q} m³/s` : q}</text>
      ))}
      {[hBot, (hBot + hTop) / 2, hTop].map((h, k) => (
        <text key={k} x={L - 4} y={Y(h) + 3} className="hc-hud-t" textAnchor="end" fill="#5b6b78">{es(h, 2)}</text>
      ))}
      <text x={4} y={13} className="hc-hud-t" fill="#5b6b78">h en A (m)</text>
      {lp.length < 2 && (
        <text x={(L + W - R) / 2} y={(T + H - B) / 2} className="hc-hud-t" textAnchor="middle" fill="#3c4b57">Lanza la creciente: aquí se dibuja el lazo</text>
      )}
      <g transform={`translate(${L + 80} 10)`}>
        <line x1={0} x2={12} y1={0} y2={0} stroke="#8a96a0" strokeDasharray="5 3" />
        <text x={15} y={3} className="hc-hud-t" fill="#3c4b57">permanente</text>
        <line x1={78} x2={90} y1={0} y2={0} stroke="#2f7fb0" strokeWidth="2" />
        <text x={93} y={3} className="hc-hud-t" fill="#3c4b57">sube</text>
        <line x1={124} x2={136} y1={0} y2={0} stroke="#c0632b" strokeWidth="2" />
        <text x={139} y={3} className="hc-hud-t" fill="#3c4b57">baja</text>
      </g>
    </svg>
  );
}

/** Hidrogramas en vivo: caudal en la entrada y en las estaciones A y B (últimos 60 s). */
function HydroChart({ s, W = 360, H = 150 }: { s: Snap; W?: number; H?: number }) {
  const hist = s.hist.filter((p) => p.t >= s.t - 60);
  const L = 34, R = 8, T = 22, B = 22;
  const qmax = Math.max(1, ...hist.map((p) => Math.max(p.QA, p.QB, p.Qin))) * 1.1;
  const t0 = s.t - 60;
  // con caudales pequeños, un decimal para que las marcas no se repitan (0 · 0,5 · 1,0 en vez de 0 · 1 · 1)
  const dq = qmax / 1.1 < 10 ? 1 : 0;
  const X = (t: number) => L + ((t - t0) / 60) * (W - L - R);
  const Y = (q: number) => H - B - (Math.max(0, q) / qmax) * (H - T - B);
  const line = (k: 'Qin' | 'QA' | 'QB') => hist.map((p) => `${X(p.t).toFixed(1)},${Y(p[k]).toFixed(1)}`).join(' ');
  const series: [('Qin' | 'QA' | 'QB'), string, string][] = s.inp.scenario === 'presa' ? [['QA', '#2f7fb0', 'A'], ['QB', '#c0632b', 'B']] : [['Qin', '#8a96a0', 'entrada'], ['QA', '#2f7fb0', 'A'], ['QB', '#c0632b', 'B']];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hc-hud-svg" role="img" aria-label="Hidrogramas de los últimos 60 segundos">
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#f7fafc" />
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={Y(qmax * f / 1.1)} y2={Y(qmax * f / 1.1)} stroke="#e3eaef" />
          <text x={L - 4} y={Y(qmax * f / 1.1) + 3} className="hc-hud-t" textAnchor="end" fill="#5b6b78">{f === 0 ? '0' : es(qmax * f / 1.1, dq)}</text>
        </g>
      ))}
      {series.map(([k, c]) => hist.length > 1 && <polyline key={k} points={line(k)} fill="none" stroke={c} strokeWidth={k === 'Qin' ? 1.2 : 1.8} strokeDasharray={k === 'Qin' ? '4 3' : undefined} />)}
      {series.map(([k, c, n], i) => (
        <g key={`l${k}`}>
          <line x1={L + 4 + i * 74} x2={L + 18 + i * 74} y1={10} y2={10} stroke={c} strokeWidth="2" strokeDasharray={k === 'Qin' ? '4 3' : undefined} />
          <text x={L + 22 + i * 74} y={13} className="hc-hud-t" fill="#3c4b57">{n}</text>
        </g>
      ))}
      <text x={W - R} y={H - 7} className="hc-hud-t" textAnchor="end" fill="#5b6b78">últimos 60 s</text>
      <text x={4} y={H - 7} className="hc-hud-t" fill="#5b6b78">m³/s</text>
    </svg>
  );
}

export function WavesLab({ head, gl }: { head: ReactNode; gl: boolean }) {
  const [inp, setInp] = useState<WaveInput>(DEFAULT_WAVE);
  const [tab, setTab] = useState<PanelTab>('esquema');
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(false);
  const simRef = useRef<WaveSim | null>(null);
  if (!simRef.current) simRef.current = new WaveSim(DEFAULT_WAVE);
  const sim = simRef.current;
  const vol0 = useRef(sim.sv.volume());
  const world = useRef<WavesWorld | null>(null);
  const [snap, setSnap] = useState<Snap>(() => snapOf(sim, vol0.current));
  useEffect(() => {
    sim.set(inp);
    vol0.current = sim.sv.volume() - (sim.sv.vIn - sim.sv.vOut);
    world.current?.set(sim);
  }, [inp, sim]);
  useEffect(() => {
    if (world.current) {
      world.current.speed = speed;
      world.current.paused = paused;
      world.current.follow = follow;
    }
  }, [speed, paused, follow]);
  // sin WebGL, el modelo avanza aquí; con WebGL lo avanza la escena en cada cuadro
  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      if (!gl && !paused) sim.tick(Math.min(0.5, ((now - last) / 1000) * speed));
      last = now;
      setSnap(snapOf(sim, vol0.current));
    }, 150);
    return () => window.clearInterval(id);
  }, [gl, paused, speed, sim]);
  const { done, fresh, clearFresh } = useRetos(RETOS, snap);
  const set = (p: Partial<WaveInput>) => setInp((s) => ({ ...s, ...p }));
  const restart = () => {
    sim.reset();
    vol0.current = sim.sv.volume();
    setSnap(snapOf(sim, vol0.current));
  };

  const s = snap;
  const th = s.th;
  let answer: string, tone: 'ok' | 'mid' | 'bad' = 'mid';
  if (inp.scenario === 'presa') {
    if (!s.broken) answer = `El embalse tiene ${es(inp.h0, 1)} m de agua. Rompe la presa: la teoría dice que el frente avanzará a ${th.front ? es(th.front, 1) : '—'} m/s${inp.h1 > 0 ? ` y llegará un muro de agua de ${th.h2 ? es(th.h2, 2) : '—'} m` : ''}.`;
    else if (s.vf !== null) {
      answer = `El frente avanza a ${es(s.vf, 1)} m/s (${inp.h1 > 0 ? 'Stoker' : 'Ritter'}: ${th.front ? es(th.front, 1) : '—'} m/s; la fricción del concreto lo frena un poco)${s.xf !== null ? `; va en ${es(s.xf, 0)} m` : ''}.`;
      tone = 'bad';
    } else answer = 'La presa se abrió: el agua sale.';
  } else if (inp.scenario === 'compuerta') {
    if (!s.closed) answer = `Pasan ${es(inp.Q, 1)} m³/s bajo la compuerta abierta ${es(inp.gate, 2)} m. Ciérrala de golpe: según Favre, el agua subirá a ${th.h2 ? es(th.h2, 2) : '—'} m y la onda subirá por el canal a ${th.front ? es(Math.abs(th.front), 1) : '—'} m/s.`;
    else {
      answer = `Compuerta cerrada: la onda sube por el canal${s.vf !== null ? ` a ${es(Math.abs(s.vf), 1)} m/s` : ''} y en la estación A el agua llegó a ${es(s.hAmax, 2)} m (Favre: ${th.h2 ? es(th.h2, 2) : '—'} m).`;
      tone = 'bad';
    }
  } else if (!s.floodOn) answer = `Corren ${es(inp.Q, 1)} m³/s. Lanza la creciente: el caudal subirá a ${es(inp.peak, 0)} m³/s en ${es(inp.tp, 0)} s y la onda viajará por el canal.`;
  else if (s.peaks && s.peaks.B[1] > inp.Q * 1.05) {
    answer = `Pico en A: ${es(s.peaks.A[1], 1)} m³/s; en B: ${es(s.peaks.B[1], 1)} m³/s, ${es(s.peaks.B[0] - s.peaks.A[0], 1)} s después.`;
    tone = 'ok';
  } else answer = 'La creciente entra al canal.';

  const stage = (
    <>
      {gl ? (
        <Scene3D
          label="Canal de concreto de 300 m en 3D con pared de vidrio. El agua se mueve en el tiempo según las ecuaciones de Saint-Venant: rotura de presa, cierre de compuerta o creciente."
          viewNames={[
            { id: 'general', label: 'Todo el canal' },
            { id: 'presa', label: 'La presa' },
            { id: 'compuerta', label: 'La compuerta' },
          ]}
          make={(st) => new WavesWorld(st)}
          onReady={(w) => {
            world.current = w;
            w.speed = speed;
            w.paused = paused;
            w.follow = follow;
            w.set(sim);
          }}
        />
      ) : (
        <FlatStage>
          <ProfileChart s={s} W={640} H={240} />
        </FlatStage>
      )}
      <Question q="¿Qué tan rápido viaja la onda y qué tan alta llega?" answer={answer} tone={tone} />
      {fresh && <MedalToast title={fresh.title} onClose={clearFresh} />}
    </>
  );

  const action =
    inp.scenario === 'presa' ? (
      <button type="button" className="hc-act is-hot" onClick={() => sim.breakDam()}>
        {s.broken ? 'Volver a romper' : 'Romper la presa'}
      </button>
    ) : inp.scenario === 'compuerta' ? (
      <button type="button" className={`hc-act${s.closed ? '' : ' is-hot'}`} onClick={() => sim.slam(!s.closed)}>
        {s.closed ? 'Abrir la compuerta' : 'Cerrar de golpe'}
      </button>
    ) : (
      <button type="button" className="hc-act is-hot" onClick={() => sim.startFlood()}>
        {s.floodOn ? 'Lanzar otra creciente' : 'Lanzar la creciente'}
      </button>
    );

  const dock = (
    <>
      <div className="hc-hud" aria-live="off">
        <div className="hc-hud-head">
          <b>Instrumentos</b>
          <span>t = {es(s.te ?? s.t, 1)} s</span>
          {s.vf !== null && <span>frente: {es(Math.abs(s.vf), 2)} m/s</span>}
          {th.front !== null && (s.broken || s.closed) && <span>teoría: {es(Math.abs(th.front), 2)} m/s</span>}
          <span>A: {es(s.hA)} m · {es(s.QA, 1)} m³/s</span>
          <span>B: {es(s.hB)} m · {es(s.QB, 1)} m³/s</span>
        </div>
        <div className="hc-hud-row">
          <ProfileChart s={s} />
          <HydroChart s={s} />
          {inp.scenario === 'creciente' && <LoopChart s={s} />}
        </div>
      </div>
      <DockChoice<WaveScenario>
        label="Situación"
        value={inp.scenario}
        options={[
          { value: 'presa', label: 'Rotura de presa' },
          { value: 'compuerta', label: 'Compuerta' },
          { value: 'creciente', label: 'Creciente' },
        ]}
        onChange={(v) => set({ scenario: v })}
      />
      <div className="hc-acts">
        {action}
        <button type="button" className="hc-act" onClick={restart}>Reiniciar</button>
        <button type="button" className="hc-act" onClick={() => setPaused((p) => !p)}>{paused ? 'Seguir' : 'Pausa'}</button>
        {inp.scenario !== 'creciente' && gl && (
          <button type="button" className={`hc-act${follow ? ' is-on' : ''}`} aria-pressed={follow} onClick={() => setFollow((f) => !f)}>
            Cámara con el frente
          </button>
        )}
      </div>
      {inp.scenario === 'presa' && (
        <>
          <DockRange label="Agua en el embalse" value={inp.h0} min={0.5} max={3} step={0.1} show={`${es(inp.h0, 1)} m`} onChange={(v) => set({ h0: Math.round(v * 10) / 10 })} />
          <DockRange label="Agua aguas abajo" value={inp.h1} min={0} max={1} step={0.05} show={inp.h1 > 0 ? `${es(inp.h1, 2)} m` : 'seco'} onChange={(v) => set({ h1: Math.round(v * 20) / 20 })} />
        </>
      )}
      {inp.scenario === 'compuerta' && (
        <>
          <DockRange label="Caudal" value={inp.Q} min={1} max={14} step={0.5} show={`${es(inp.Q, 1)} m³/s`} onChange={(v) => set({ Q: v })} />
          <DockRange label="Abertura de la compuerta" value={inp.gate} min={0.1} max={2.5} step={0.05} show={`${es(inp.gate, 2)} m`} onChange={(v) => set({ gate: Math.round(v * 20) / 20 })} />
        </>
      )}
      {inp.scenario === 'creciente' && (
        <>
          <DockRange label="Caudal de base" value={inp.Q} min={0.5} max={10} step={0.5} show={`${es(inp.Q, 1)} m³/s`} onChange={(v) => set({ Q: v })} />
          <DockRange label="Pico de la creciente" value={inp.peak} min={5} max={40} step={1} show={`${es(inp.peak, 0)} m³/s`} onChange={(v) => set({ peak: v })} />
          <DockRange label="Tiempo al pico" value={inp.tp} min={10} max={120} step={5} show={`${es(inp.tp, 0)} s`} onChange={(v) => set({ tp: v })} />
        </>
      )}
      <SlopeRange value={Math.max(0.0002, inp.S)} lo={0.0002} hi={0.01} onChange={(S) => set({ S })} label="Pendiente del canal" />
      <DockChoice<'0.5' | '1' | '2' | '4'> label="Velocidad" value={String(speed) as '0.5' | '1' | '2' | '4'} options={[{ value: '0.5', label: '×½' }, { value: '1', label: '×1' }, { value: '2', label: '×2' }, { value: '4', label: '×4' }]} onChange={(v) => setSpeed(Number(v))} />
    </>
  );

  const balance = s.vol - s.vol0 - (s.vIn - s.vOut);
  const panels: Partial<Record<PanelTab, ReactNode>> = {
    esquema: (
      <div className="q3-exps">
        <ProfileChart s={s} W={460} H={170} exact />
        <h3>El agua que cambia en el tiempo</h3>
        <p>
          Hasta ahora el agua corría igual todo el tiempo (flujo permanente). Aquí cambia: una presa se rompe, una compuerta se cierra, llega una creciente. El modelo resuelve las <strong>ecuaciones de Saint-Venant</strong>: la conservación del agua (∂h/∂t + ∂q/∂x = 0) y de la cantidad de movimiento (el peso del agua en la pendiente, la presión y la fricción del fondo empujan o frenan), en 300 celdas de 1 m, varias veces por cuadro.
        </p>
        <h3>Tres ondas</h3>
        <p>
          <strong>Rotura de presa:</strong> sobre fondo seco, el frente avanza a 2·√(g·h0) (Ritter); sobre agua, llega como un resalto que se mueve (Stoker). <strong>Cierre de compuerta:</strong> el agua que venía se frena de golpe y sube; ese escalón viaja contra la corriente (Favre). <strong>Creciente:</strong> una onda larga que avanza más rápido que el agua (unas 5/3 de su velocidad) y se aplana al viajar.
        </p>
        <p className="q3-small">Con la pendiente al mínimo, la línea punteada oscura del perfil es la solución exacta (sin fricción, con el canal horizontal); la roja rayada es la línea de energía.</p>
      </div>
    ),
    retos: <RetosList retos={RETOS} ctx={s} done={done} intro="Rompe, cierra y lanza, y mide con los instrumentos. Cada reto cumplido gana una medalla (se guarda en este equipo)." />,
    experimentos: (
      <div className="q3-exps">
        <h3>Modelo frente a teoría</h3>
        {inp.scenario === 'presa' && (
          <>
            <p className="q3-small">Pon la pendiente al mínimo y rompe la presa: el perfil calculado (azul) y el exacto (punteado) casi coinciden; la fricción del concreto frena un poco la punta del frente.</p>
            <ProfileChart s={s} W={460} H={170} exact />
            <table className="q3-table">
              <tbody>
                <tr><th scope="row">Velocidad del frente medida</th><td>{s.vf !== null ? `${es(s.vf, 2)} m/s` : '—'}</td></tr>
                <tr><th scope="row">{inp.h1 > 0 ? 'Stoker' : 'Ritter'}</th><td>{th.front !== null ? `${es(th.front, 2)} m/s` : '—'}</td></tr>
                <tr><th scope="row">{inp.h1 > 0 ? 'Meseta h2 (Stoker)' : 'En la presa: 4/9·h0'}</th><td>{th.h2 !== null ? `${es(th.h2, 3)} m` : '—'}</td></tr>
              </tbody>
            </table>
          </>
        )}
        {inp.scenario === 'compuerta' && (
          <table className="q3-table">
            <tbody>
              <tr><th scope="row">Antes del cierre en A</th><td>{s.closed ? `${es(s.before.hA, 3)} m a ${es(s.before.VA, 2)} m/s` : '—'}</td></tr>
              <tr><th scope="row">Altura de la onda en A (modelo)</th><td>{s.closed ? `${es(s.hAmax, 3)} m` : '—'}</td></tr>
              <tr><th scope="row">Favre</th><td>{th.h2 !== null ? `${es(th.h2, 3)} m` : '—'}</td></tr>
              <tr><th scope="row">Velocidad de la onda (modelo / Favre)</th><td>{s.vf !== null ? `${es(Math.abs(s.vf), 2)} / ${th.front !== null ? es(Math.abs(th.front), 2) : '—'} m/s` : '—'}</td></tr>
            </tbody>
          </table>
        )}
        {inp.scenario === 'creciente' && (
          <table className="q3-table">
            <tbody>
              <tr><th scope="row">Pico a la entrada</th><td>{s.peaks ? `${es(s.peaks.inn[1], 1)} m³/s` : '—'}</td></tr>
              <tr><th scope="row">Pico en A (60 m)</th><td>{s.peaks ? (passed(s, 'A') ? `${es(s.peaks.A[1], 1)} m³/s` : 'todavía sube') : '—'}</td></tr>
              <tr><th scope="row">Pico en B (240 m)</th><td>{s.peaks ? (passed(s, 'B') && s.peaks.B[0] > s.peaks.A[0] ? `${es(s.peaks.B[1], 1)} m³/s, ${es(s.peaks.B[0] - s.peaks.A[0], 1)} s después de A` : 'todavía no pasa') : '—'}</td></tr>
              <tr><th scope="row">Celeridad medida entre A y B</th><td>{s.peaks && passed(s, 'B') && s.peaks.B[0] > s.peaks.A[0] ? `${es(180 / (s.peaks.B[0] - s.peaks.A[0]), 2)} m/s` : '—'}</td></tr>
              {(() => {
                const g = loopGap(s.loop);
                const st = g && s.rating ? ratingAt(s.rating, g.h) : null;
                return (
                  <tr>
                    <th scope="row">Lazo en A: caudal con la misma profundidad</th>
                    <td>{g ? `h = ${es(g.h, 2)} m: ${es(g.up, 1)} m³/s al subir y ${es(g.down, 1)} m³/s al bajar${st ? `; permanente ${es(st.Q, 1)} m³/s` : ''}` : 'cuando la creciente haya pasado'}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        )}
        {inp.scenario === 'creciente' && (
          <p className="q3-small">
            En flujo permanente, cada profundidad tiene un solo caudal (la curva de gasto, calculada aquí con el perfil del canal hasta la caída). En la creciente, la superficie se inclina más al frente de la onda: con la misma profundidad pasa más agua al subir que al bajar, y la curva hace un lazo. Por eso un aforo hecho solo con la profundidad se equivoca en una creciente rápida.
          </p>
        )}
      </div>
    ),
    diseno: <DesignTab part="ondas" />,
    datos: (
      <div className="q3-exps">
        <table className="q3-table">
          <tbody>
            <Row name="Canal" value={`${WAVE.L} m de largo, ${WAVE.b} m de ancho, rectangular`} note={`concreto, n = ${es(WAVE.n, 3)}; pendiente ${es(inp.S * 100, 2)} %`} />
            <Row name="Malla" value={`${WAVE.N} celdas de ${es(WAVE.L / WAVE.N, 1)} m`} note="volúmenes finitos, flujo HLL, reconstrucción hidrostática, fricción semi-implícita, Courant 0,45" />
            <Row name="Tiempo simulado" value={`${es(s.t, 1)} s`} />
            <Row name="Agua en el canal" value={`${es(s.vol, 1)} m³`} note={`entró ${es(s.vIn, 1)} m³, salió ${es(s.vOut, 1)} m³`} />
            <Row name="Balance de agua" value={`${es(balance, 6)} m³`} note="volumen − inicial − entrado + salido (debe ser casi cero)" />
            <Row name="Estaciones" value={`A en ${WAVE.gauges[0]} m, B en ${WAVE.gauges[1]} m`} />
            <Row name="Compuerta" value={`en ${WAVE.xGate} m`} note="orificio con Cc = 0,61, libre o ahogado; cerrada es una pared" />
          </tbody>
        </table>
      </div>
    ),
    docente: (
      <div className="q3-exps">
        <h3>Para el docente</h3>
        <p>Es el único modo del módulo con flujo no permanente. El cálculo se valida contra soluciones exactas (Ritter, Stoker, Favre), contra el flujo uniforme de Manning y con el balance de agua (pruebas H24 a H28). Las profundidades se dibujan a escala.</p>
        <p>Preguntas: ¿por qué el frente sobre fondo seco es más rápido que sobre agua? ¿Qué pasa aguas abajo de la compuerta al cerrarla? ¿Por qué el pico de la creciente llega a B con casi el mismo caudal en un canal tan corto?</p>
        <p className="q3-small">Límites: canal rectangular y recto, una dimensión (sin olas a lo ancho), primer orden (los frentes se suavizan en unas pocas celdas), sin aire ni sedimento. No es un modelo de inundación ni un pronóstico.</p>
      </div>
    ),
  };
  return <Q3Layout head={head} stage={stage} dock={dock} panels={panels} tab={tab} setTab={setTab} tabs={['esquema', 'retos', 'experimentos', 'diseno', 'datos', 'docente']} />;
}


// «Con lupa»: lo que pasa dentro de cada proceso de la planta, a escala de las partículas. Son animaciones SVG
// ilustrativas; donde dependen del juego (dosis, turbiedad, cloro), usan los valores calculados.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';
import type { PlantInput, PlantResult } from './model';
import type { ProcessId } from './processes';
import { rng } from './three/kit';

/** Reloj de las animaciones «con lupa» [s] (quieto con «movimiento reducido»). */
export function useTime(): number {
  const { state } = useStore();
  const reduced = state.prefs.reducedMotion;
  const [t, setT] = useState(reduced ? 6 : 0);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      setT((now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return t;
}

const W = 240, H = 150;
const CLAY = '#8a6a44', SAND = '#d8b878', FLOC = '#6b5134', BUG = '#8c3fb3', CL = '#3fa565', WATER = '#d9edf5';

/** Marco de una animación «con lupa» (240 × 150). */
export function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="q3-lens2" role="img" aria-label={label}>
      <rect x="0" y="0" width={W} height={H} rx="10" fill={WATER} />
      {children}
    </svg>
  );
}

export function ProcessLens({ id, r, inp, washing = false }: { id: ProcessId; r: PlantResult; inp: PlantInput; washing?: boolean }) {
  const t = useTime();
  const R = useMemo(() => {
    const g = rng(97);
    return [...Array(60)].map(() => ({ a: g(), b: g(), c: g(), d: g() }));
  }, []);
  const eff = Math.max(0, Math.min(1, 1 - r.settled / r.raw.turbidity));
  const wrap = (v: number, m: number) => ((v % m) + m) % m;

  switch (id) {
    case 'rio':
      return (
        <Frame label="Rejilla: el agua y la arena pasan entre las barras; ramas y hojas se quedan">
          {[...Array(7)].map((_, k) => (
            <rect key={k} x={150} y={10 + k * 19} width={7} height={12} fill="#5c6670" rx="2" />
          ))}
          {R.slice(0, 22).map((p, k) => {
            const x = wrap(p.a * 240 + t * 40, 260) - 10;
            return <circle key={k} cx={x} cy={12 + p.b * 126} r={1.6} fill={CLAY} />;
          })}
          {R.slice(22, 28).map((p, k) => {
            const x = Math.min(142, wrap(p.a * 160 + t * 26, 200) - 30);
            return <path key={k} d={`M${x - 8} ${20 + p.b * 110} q8 -6 16 0 q-8 6 -16 0z`} fill="#4f8a3a" />;
          })}
          {R.slice(28, 31).map((p, k) => {
            const x = Math.min(138, wrap(p.c * 140 + t * 20, 180) - 40);
            return <rect key={k} x={x - 14} y={30 + k * 38} width={28} height={4} rx="2" fill="#6b4a32" transform={`rotate(${p.d * 30 - 15} ${x} ${32 + k * 38})`} />;
          })}
          <text x="200" y="142" className="q3-lens-t">rejilla</text>
        </Frame>
      );
    case 'desarenador':
      return (
        <Frame label="Desarenador: la arena cae al fondo; la arcilla fina sigue con el agua">
          <rect x="0" y="128" width={W} height={22} fill={SAND} opacity="0.7" />
          {R.slice(0, 24).map((p, k) => {
            const x = wrap(p.a * 240 + t * 34, 260) - 10;
            return <circle key={k} cx={x} cy={14 + p.b * 100} r={1.3} fill={CLAY} />;
          })}
          {R.slice(24, 40).map((p, k) => {
            const ph = wrap(t * 0.35 + p.a, 1);
            const x = 10 + p.b * 60 + ph * 140;
            const y = 14 + p.c * 40 + ph * ph * 120;
            return <circle key={k} cx={x} cy={Math.min(126, y)} r={3.2} fill="#b8955a" stroke="#8c6d3a" strokeWidth="0.6" />;
          })}
          <text x="8" y="144" className="q3-lens-t">arena en el fondo</text>
          <text x="150" y="20" className="q3-lens-t">arcilla: sigue</text>
        </Frame>
      );
    case 'mezcla': {
      // fracción de partículas neutralizadas: crece con la dosis hasta la dosis justa; con más del doble, se cargan al revés
      const k0 = inp.dose > 0 ? Math.min(1, wrap(t, 8) / 3) * Math.min(1, inp.dose / r.optimum) : 0;
      const over = inp.dose > 2 * r.optimum;
      const note = inp.dose <= 0 ? 'sin coagulante: siguen cargadas y se repelen' : over ? 'demasiado: quedan positivas y se repelen otra vez' : inp.dose < 0.6 * r.optimum ? 'poco coagulante: muchas siguen cargadas' : 'Al³⁺ (+) neutraliza la arcilla (−)';
      return (
        <Frame label="Coagulación: el aluminio positivo neutraliza las cargas negativas de la arcilla">
          {R.slice(0, 14).map((p, k) => {
            const x = 20 + p.a * 200 + 6 * Math.sin(t * 2 + p.c * 6);
            const y = 20 + p.b * 110 + 6 * Math.cos(t * 1.7 + p.d * 6);
            const charged = k0 < p.d;
            return (
              <g key={k}>
                <circle cx={x} cy={y} r={7} fill={CLAY} />
                <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
                  {charged ? '−' : over ? '+' : ''}
                </text>
              </g>
            );
          })}
          {inp.dose > 0 &&
            R.slice(14, 14 + Math.min(30, Math.round(inp.dose / 2.5))).map((p, k) => {
              const x = wrap(p.a * 240 + t * 70, 240);
              const y = 10 + p.b * 130;
              return (
                <text key={k} x={x} y={y} fontSize="9" fontWeight="800" fill="#2f6fa8">
                  +
                </text>
              );
            })}
          <text x="8" y="144" className="q3-lens-t">{note}</text>
        </Frame>
      );
    }
    case 'floc':
      return (
        <Frame label="Floculación: tres zonas, cada una más suave; los flocs crecen">
          {[0, 1, 2].map((z) => (
            <g key={z}>
              <rect x={z * 80 + 2} y="2" width="76" height={H - 4} rx="6" fill="none" stroke="#9fb3c0" strokeDasharray="3 3" />
              <text x={z * 80 + 40} y="16" textAnchor="middle" className="q3-lens-t">
                G ≈ {[70, 40, 10][z]} s⁻¹
              </text>
              {R.slice(z * 12, z * 12 + 12).map((p, k) => {
                const sp = [1.6, 0.9, 0.35][z];
                const cx = z * 80 + 40, cy = 80;
                const rad = 12 + p.a * 22;
                const ang = t * sp + p.b * 6.28;
                const size = (1.4 + z * 2.2 * eff) * (0.8 + p.c * 0.5);
                return <circle key={k} cx={cx + Math.cos(ang) * rad} cy={cy + Math.sin(ang) * rad * 1.3} r={size} fill={FLOC} opacity={0.9} />;
              })}
            </g>
          ))}
          <text x="8" y="144" className="q3-lens-t">los flocs crecen →</text>
        </Frame>
      );
    case 'sedim':
      return (
        <Frame label="Sedimentación: los flocs caen sobre placas inclinadas y resbalan al fondo">
          <rect x="0" y="132" width={W} height="18" fill={FLOC} opacity="0.75" />
          {[...Array(6)].map((_, k) => (
            <line key={k} x1={30 + k * 34} y1="120" x2={70 + k * 34} y2="30" stroke="#8fa3b1" strokeWidth="3" />
          ))}
          {R.slice(0, 18).map((p, k) => {
            const ph = wrap(t * 0.22 + p.a, 1);
            const x = 34 + p.b * 180 - ph * 30;
            const y = 24 + ph * 106;
            return <circle key={k} cx={x} cy={y} r={2.2 + 1.6 * eff} fill={FLOC} opacity={ph < 0.95 ? 0.9 : 0.4} />;
          })}
          <path d="M220 60 v-44 m-6 8 l6 -8 l6 8" stroke="#2f78c4" strokeWidth="2.5" fill="none" />
          <text x="150" y="12" className="q3-lens-t">agua clara ↑</text>
          <text x="8" y="146" className="q3-lens-t" fill="#fff">lodo</text>
        </Frame>
      );
    case 'filtro': {
      // ciclo ilustrativo: 10 s filtrando y 4 s de retrolavado (o retrolavado mientras se lavan los filtros de la escena)
      const wash = washing || wrap(t, 14) > 10;
      const ex = washing ? 10 * (0.75 + 0.25 * Math.sin(t * 3)) : wash ? 10 * Math.sin(((wrap(t, 14) - 10) / 4) * Math.PI) : 0;
      return (
        <Frame label={wash ? 'Retrolavado: el agua sube y el lecho se expande' : 'Filtración: las partículas quedan atrapadas entre los granos'}>
          {[...Array(4)].map((_, row) =>
            [...Array(9)].map((_, col) => (
              <circle key={`a${row}-${col}`} cx={14 + col * 26 + (row % 2) * 13} cy={42 + row * 14 - ex * (1 - row / 4)} r="6.5" fill="#3a3a3a" />
            )),
          )}
          {[...Array(3)].map((_, row) =>
            [...Array(15)].map((_, col) => (
              <circle key={`s${row}-${col}`} cx={8 + col * 16 + (row % 2) * 8} cy={100 + row * 9 - ex * 0.4} r="4" fill={SAND} />
            )),
          )}
          <rect x="0" y="128" width={W} height="22" fill="#8e8a83" />
          {R.slice(0, 16).map((p, k) => {
            const ph = wrash(t, p.a);
            const x = 12 + p.b * 216;
            const y = wash ? 120 - ph * 115 : 8 + Math.min(1, ph) * (40 + p.c * 50);
            return <circle key={k} cx={x} cy={y} r={2} fill={CLAY} />;
          })}
          <text x="8" y="14" className="q3-lens-t">{wash ? 'retrolavado: sube el agua' : 'antracita'}</text>
          <text x="8" y="146" className="q3-lens-t" fill="#fff">grava</text>
        </Frame>
      );
    }
    case 'cloro': {
      const kill = r.clExit >= 0.05;
      const hidden = r.filtered > 1;
      return (
        <Frame label={kill ? 'El cloro elimina las bacterias' : 'Sin cloro libre, las bacterias sobreviven'}>
          {R.slice(0, 10).map((p, k) => {
            const x = 24 + p.a * 190, y = 24 + p.b * 100;
            const life = kill ? Math.max(0, 1 - wrap(t * 0.3 + p.c, 1.6)) : 1;
            const shield = hidden && k < 2;
            const alive = shield || life > 0.25;
            return (
              <g key={k} transform={`rotate(${p.d * 180} ${x} ${y})`}>
                <rect x={x - 9} y={y - 4} width="18" height="8" rx="4" fill={alive ? BUG : '#9aa2a8'} opacity={alive ? 1 : 0.5} />
                {shield && <circle cx={x + 10} cy={y} r="9" fill={CLAY} opacity="0.85" />}
              </g>
            );
          })}
          {kill &&
            R.slice(10, 36).map((p, k) => (
              <circle key={k} cx={wrap(p.a * 240 + t * 30 * (p.c - 0.5) * 2, 240)} cy={wrap(p.b * 150 + t * 18 * (p.d - 0.5), 150)} r="2" fill={CL} />
            ))}
          <text x="8" y="144" className="q3-lens-t">
            {kill ? (hidden ? 'cloro (verde); una partícula esconde bacterias' : 'cloro (verde) contra las bacterias') : 'no queda cloro libre'}
          </text>
        </Frame>
      );
    }
    case 'ph': {
      const x = (v: number) => 14 + (v / 14) * 212;
      return (
        <Frame label={`Escala de pH: el agua tratada queda en ${r.pH.toFixed(1)}`}>
          <defs>
            <linearGradient id="phg" x1="0" x2="1">
              <stop offset="0" stopColor="#d64c3b" />
              <stop offset="0.5" stopColor="#3fa565" />
              <stop offset="1" stopColor="#3a5fd5" />
            </linearGradient>
          </defs>
          <rect x="14" y="60" width="212" height="18" rx="9" fill="url(#phg)" />
          <rect x={x(6.5)} y="54" width={x(9) - x(6.5)} height="30" fill="none" stroke="#17324d" strokeWidth="2" strokeDasharray="4 3" />
          {[0, 7, 14].map((v) => (
            <text key={v} x={x(v)} y="100" textAnchor="middle" className="q3-lens-t">
              {v}
            </text>
          ))}
          <path d={`M${x(r.pH)} 52 l-6 -10 h12 z`} fill="#17324d" transform={`translate(0 ${2 * Math.sin(t * 3)})`} />
          <text x={x(r.pH)} y="36" textAnchor="middle" className="q3-lens-t">
            pH {r.pH.toFixed(1).replace('.', ',')}
          </text>
          <text x="8" y="130" className="q3-lens-t">ácido: corroe</text>
          <text x="232" y="130" textAnchor="end" className="q3-lens-t">básico: costras</text>
          <text x={x(7.75)} y="118" textAnchor="middle" className="q3-lens-t">norma: 6,5 a 9</text>
        </Frame>
      );
    }
    case 'tanque': {
      const hour = wrap(t * 1.2, 24);
      const use = 0.5 + 0.35 * Math.exp(-((hour - 7) ** 2) / 4) + 0.3 * Math.exp(-((hour - 19) ** 2) / 5) - 0.25 * Math.exp(-((hour - 2) ** 2) / 8);
      const level = 0.55 + 0.3 * Math.cos(((hour - 4) / 24) * 2 * Math.PI);
      return (
        <Frame label="Almacenamiento: el nivel baja cuando la ciudad consume más">
          <rect x="30" y="20" width="90" height="110" rx="6" fill="#fff" stroke="#8fa3b1" strokeWidth="2" />
          <rect x="32" y={22 + 106 * (1 - level)} width="86" height={106 * level} fill="#88c1d6" />
          <text x="75" y="144" textAnchor="middle" className="q3-lens-t">nivel del tanque</text>
          <polyline
            points={[...Array(25)].map((_, h) => `${140 + h * 3.8},${120 - 60 * (0.5 + 0.35 * Math.exp(-((h - 7) ** 2) / 4) + 0.3 * Math.exp(-((h - 19) ** 2) / 5) - 0.25 * Math.exp(-((h - 2) ** 2) / 8))}`).join(' ')}
            fill="none"
            stroke="#c0462a"
            strokeWidth="2"
          />
          <circle cx={140 + hour * 3.8} cy={120 - 60 * use} r="4" fill="#c0462a" />
          <text x="186" y="144" textAnchor="middle" className="q3-lens-t">consumo en el día</text>
          <text x="186" y="16" textAnchor="middle" className="q3-lens-t">{`${Math.floor(hour)}:00`}</text>
        </Frame>
      );
    }
    case 'llave': {
      const n = Math.round(Math.min(10, r.clExit * 6));
      return (
        <Frame label="La red: el cloro se va gastando en el camino hasta la llave">
          <rect x="6" y="62" width="200" height="22" rx="11" fill="#4f6d86" />
          {[...Array(n)].map((_, k) => {
            const x = wrap(k * 22 + t * 30, 200);
            const fade = Math.exp(-0.05 * 12 * (x / 200));
            return <circle key={k} cx={10 + x} cy="73" r="3.5" fill={CL} opacity={fade} />;
          })}
          <path d="M206 66 h18 v18" stroke="#7e8a92" strokeWidth="8" fill="none" />
          <rect x="212" y="100" width="22" height="30" rx="3" fill="#a8d8e8" stroke="#55636e" />
          <text x="8" y="50" className="q3-lens-t">planta</text>
          <text x="232" y="144" textAnchor="end" className="q3-lens-t">llave: {r.clTap.toFixed(2).replace('.', ',')} mg/L</text>
        </Frame>
      );
    }
    case 'lodos':
      return (
        <Frame label="Lodos: se espesan en el fondo y luego se secan">
          <rect x="10" y="20" width="100" height="110" rx="6" fill="#fff" stroke="#8fa3b1" />
          {R.slice(0, 30).map((p, k) => {
            const ph = Math.min(1, wrap(t * 0.15 + p.a, 1.3));
            return <circle key={k} cx={18 + p.b * 84} cy={30 + ph * 92} r="2.3" fill={FLOC} />;
          })}
          <text x="60" y="144" textAnchor="middle" className="q3-lens-t">espesador</text>
          <rect x="130" y="96" width="100" height="30" fill="#7a5a35" />
          {[...Array(6)].map((_, k) => (
            <path key={k} d={`M${136 + k * 16} 98 l4 12 l-3 12`} stroke="#4a331d" strokeWidth="1.5" fill="none" />
          ))}
          <text x="180" y="144" textAnchor="middle" className="q3-lens-t">lecho de secado</text>
        </Frame>
      );
  }
}

/** Fase de una partícula del filtro (0 → 1 y vuelve a empezar). */
function wrash(t: number, a: number): number {
  return ((t * 0.18 + a) % 1.2) / 1.2;
}

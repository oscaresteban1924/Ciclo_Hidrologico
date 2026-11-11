// Piezas comunes de las animaciones «con lupa» de las dos plantas: un marco de 480 × 300 con su cielo, sus
// texturas (concreto, tierra, arena, grava) y sus flechas; el corte de un tanque con el agua del color que le da
// el cálculo y su superficie en movimiento; una lupa redonda que amplía un punto del corte; rótulos con halo;
// una fila de datos del juego al pie; y las partículas (arcilla, arena, flocs, bacterias, burbujas, basura).
// Las trayectorias son funciones del tiempo (sin estado), así que el dibujo es igual en cada cuadro para el mismo
// instante y se detiene con «movimiento reducido».

import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { useStore } from '../state/store';

export const LW = 480;
export const LH = 300;
/** Alto de la escena (debajo van los datos del juego). */
export const SH = 254;
export const INK = '#17324d';

/** Reloj de las animaciones «con lupa» [s] (quieto con «movimiento reducido»). */
export function useTime(): number {
  const { state } = useStore();
  const reduced = state.prefs.reducedMotion;
  const [t, setT] = useState(reduced ? 6 : 0);
  useEffect(() => {
    if (reduced) {
      setT(6);
      return;
    }
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

// ------------------------------------------------------------------ números y colores

export const wrap = (v: number, m: number) => ((v % m) + m) % m;
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Fase 0 → 1 de un ciclo de período p con desfase a. */
export const phase = (t: number, p: number, a = 0) => wrap(t / p + a, 1);
/** Generador pseudoaleatorio determinista. */
export function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
/** Lista fija de números al azar para las partículas de un dibujo. */
export function bag(seed: number, n: number): { a: number; b: number; c: number; d: number }[] {
  const g = seeded(seed);
  return [...Array(n)].map(() => ({ a: g(), b: g(), c: g(), d: g() }));
}

const hex = (c: string) => {
  const h = c.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
/** Mezcla de dos colores (f = 0 → a, f = 1 → b). */
export function mix(a: string, b: string, f: number): string {
  const A = hex(a), B = hex(b), k = clamp01(f);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}
/** Color del agua según su turbiedad [UNT] (agua de la planta de potabilización). */
export const turbColor = (ntu: number) => mix('#a9d8ea', '#a37a4c', Math.sqrt(clamp01(ntu / 400)));
/** Color del agua según sus sólidos suspendidos [mg/L] (planta de aguas residuales). */
export const sstColor = (mg: number) => mix('#a9d8ea', '#8f7a5a', Math.sqrt(clamp01(mg / 260)));

// ------------------------------------------------------------------ marco

const IdCtx = createContext('lz');
/** Prefijo único de los ids de este dibujo (gradientes, recortes, flechas). */
export const useLensId = () => useContext(IdCtx);
/** Prefijo único para un dibujo nuevo: la escena lo crea y se lo pasa a <Lens uid>, así puede usar los patrones. */
export const useLensUid = () => `lz${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

export interface Chip {
  label: string;
  value: string;
  tone?: 'ok' | 'bad' | 'mid' | 'info';
}

/** Marco de una animación «con lupa» (480 × 300): cielo, texturas, flechas y datos del juego al pie. */
export function Lens({ label, chips, children, ground, uid }: { label: string; chips?: Chip[]; children: ReactNode; ground?: boolean; uid?: string }) {
  const own = useLensUid();
  const id = uid ?? own;
  return (
    <svg viewBox={`0 0 ${LW} ${LH}`} className="q3-lens2" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef6fa" />
          <stop offset="1" stopColor="#d9e9f1" />
        </linearGradient>
        <pattern id={`${id}-conc`} width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#c8c3b8" />
          <circle cx="3" cy="4" r="0.9" fill="#a9a397" />
          <circle cx="10" cy="9" r="1.1" fill="#b3ada1" />
          <circle cx="7" cy="12" r="0.6" fill="#ddd8cf" />
          <circle cx="12" cy="2" r="0.7" fill="#9c968a" />
        </pattern>
        <pattern id={`${id}-soil`} width="18" height="18" patternUnits="userSpaceOnUse">
          <rect width="18" height="18" fill="#8a6a49" />
          <circle cx="4" cy="5" r="1.4" fill="#755a3d" />
          <circle cx="13" cy="11" r="1.8" fill="#9b7a56" />
          <circle cx="8" cy="15" r="1" fill="#6b5137" />
        </pattern>
        <pattern id={`${id}-sand`} width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#dcc08a" />
          <circle cx="2" cy="3" r="1" fill="#c9a96c" />
          <circle cx="7" cy="7" r="1.1" fill="#e8d3a6" />
          <circle cx="8" cy="2" r="0.7" fill="#b8955a" />
        </pattern>
        <pattern id={`${id}-grav`} width="16" height="12" patternUnits="userSpaceOnUse">
          <rect width="16" height="12" fill="#9b968c" />
          <ellipse cx="4" cy="4" rx="3.4" ry="2.6" fill="#b7b2a8" stroke="#7d786f" strokeWidth="0.6" />
          <ellipse cx="12" cy="8" rx="3" ry="2.4" fill="#aaa59b" stroke="#7d786f" strokeWidth="0.6" />
        </pattern>
        <pattern id={`${id}-sludge`} width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#5e4329" />
          <circle cx="3" cy="3" r="1.4" fill="#6f5233" />
          <circle cx="9" cy="8" r="1.7" fill="#4f3822" />
        </pattern>
        <radialGradient id={`${id}-bub`} cx="0.35" cy="0.35" r="0.65">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.6" stopColor="#e6f4fb" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.15" />
        </radialGradient>
        <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7dde1" />
          <stop offset="0.5" stopColor="#9aa4ab" />
          <stop offset="1" stopColor="#6f7a82" />
        </linearGradient>
        {(['ink', 'water', 'sludge', 'air', 'warn'] as const).map((k) => (
          <marker key={k} id={`${id}-a-${k}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={ARROW[k]} />
          </marker>
        ))}
        <filter id={`${id}-sh`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#0b1f30" floodOpacity="0.3" />
        </filter>
      </defs>
      <rect width={LW} height={LH} rx="14" fill={`url(#${id}-sky)`} />
      {ground && <rect y={SH - 34} width={LW} height={34} fill={`url(#${id}-soil)`} opacity="0.85" />}
      <IdCtx.Provider value={id}>
        {children}
        {chips && chips.length > 0 && <Chips items={chips} />}
      </IdCtx.Provider>
      <rect x="0.5" y="0.5" width={LW - 1} height={LH - 1} rx="14" fill="none" stroke="#b9cbd6" />
    </svg>
  );
}

export const ARROW = { ink: INK, water: '#2f78c4', sludge: '#6b4a2b', air: '#7f99ad', warn: '#c0462a' } as const;

/** Datos del juego al pie del dibujo. */
function Chips({ items }: { items: Chip[] }) {
  const tone = { ok: ['#e5f3e7', '#2b6e3a'], bad: ['#fbe7e3', '#a3321d'], mid: ['#fdf1d9', '#8a5a0a'], info: ['#e4f0f7', '#155a8a'] } as const;
  const w = items.map((c) => Math.max(c.label.length * 5.6, c.value.length * 7.6) + 18);
  const total = w.reduce((s, v) => s + v, 0) + (items.length - 1) * 6;
  const k = total > LW - 20 ? (LW - 20) / total : 1;
  let x = 10;
  return (
    <g>
      <rect x="0" y={SH} width={LW} height={LH - SH} fill="#f7fafc" />
      <line x1="0" y1={SH} x2={LW} y2={SH} stroke="#cfdbe3" />
      {items.map((c, i) => {
        const [bg, fg] = tone[c.tone ?? 'info'];
        const ww = w[i] * k;
        const g = (
          <g key={c.label} transform={`translate(${x} ${SH + 6})`}>
            <rect width={ww} height="34" rx="8" fill={bg} />
            <text x="9" y="13" className="lz-s" fill={fg} opacity="0.85">
              {c.label}
            </text>
            <text x="9" y="28" className="lz-v" fill={fg}>
              {c.value}
            </text>
          </g>
        );
        x += ww + 6;
        return g;
      })}
    </g>
  );
}

// ------------------------------------------------------------------ rótulos y flechas

/** Texto con halo blanco (se lee sobre agua, lodo o concreto). */
export function Tag({ x, y, children, anchor = 'start', size = 'm', color = INK, halo = true }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: 's' | 'm' | 'l'; color?: string; halo?: boolean }) {
  return (
    <text x={x} y={y} textAnchor={anchor} className={`lz-${size}${halo ? ' lz-halo' : ''}`} fill={color}>
      {children}
    </text>
  );
}

/** Línea guía de un rótulo hasta un punto. */
export function Lead({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth="1" strokeDasharray="3 2" opacity="0.7" />
      <circle cx={x2} cy={y2} r="2.4" fill={INK} />
    </g>
  );
}

/** Flecha (trazo con punta). */
export function Arrow({ d, kind = 'ink', w = 2.4, dash, opacity = 1 }: { d: string; kind?: keyof typeof ARROW; w?: number; dash?: string; opacity?: number }) {
  const id = useLensId();
  return <path d={d} fill="none" stroke={ARROW[kind]} strokeWidth={w} strokeDasharray={dash} strokeLinecap="round" markerEnd={`url(#${id}-a-${kind})`} opacity={opacity} />;
}

/** Flechas del flujo que avanzan (líneas punteadas en movimiento). */
export function Stream({ d, t, kind = 'water', speed = 30, w = 2 }: { d: string; t: number; kind?: keyof typeof ARROW; speed?: number; w?: number }) {
  return <path d={d} fill="none" stroke={ARROW[kind]} strokeWidth={w} strokeDasharray="10 9" strokeDashoffset={-t * speed} strokeLinecap="round" opacity="0.55" />;
}

// ------------------------------------------------------------------ agua y tanques

/** Superficie del agua con ondas: puntos de x0 a x1 alrededor de y. */
export function wave(x0: number, x1: number, y: number, t: number, amp = 1.6, k = 0.06, speed = 2.2): string {
  const n = Math.max(2, Math.ceil((x1 - x0) / 8));
  let d = '';
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const yy = y + amp * Math.sin(k * x - t * speed) + amp * 0.5 * Math.sin(k * 2.3 * x + t * speed * 0.7);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)}`;
  }
  return d;
}

/**
 * Corte de un tanque: muros y fondo de concreto, agua con degradado del color dado (más claro arriba), superficie
 * en movimiento y lo que pase adentro recortado al agua.
 */
export function Tank({
  x,
  y,
  w,
  h,
  level = 0.86,
  color,
  t,
  amp = 1.4,
  wall = 9,
  floor = 9,
  open = 'none',
  children,
  over,
  name,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  level?: number;
  color: string;
  t: number;
  amp?: number;
  wall?: number;
  floor?: number;
  /** Lado sin muro (por donde entra o sale el agua). */
  open?: 'none' | 'left' | 'right' | 'both';
  children?: ReactNode;
  /** Lo que se dibuja encima del agua (puentes, tubos). */
  over?: ReactNode;
  name: string;
}) {
  const id = useLensId();
  const gid = `${id}-w-${name}`, cid = `${id}-c-${name}`;
  const top = y + h * (1 - level);
  return (
    <g>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(color, '#ffffff', 0.28)} />
          <stop offset="1" stopColor={mix(color, '#0d2233', 0.22)} />
        </linearGradient>
        <clipPath id={cid}>
          <path d={`${wave(x, x + w, top, t, amp)} L${x + w} ${y + h} L${x} ${y + h} Z`} />
        </clipPath>
      </defs>
      <path d={`${wave(x, x + w, top, t, amp)} L${x + w} ${y + h} L${x} ${y + h} Z`} fill={`url(#${gid})`} />
      <g clipPath={`url(#${cid})`}>{children}</g>
      <path d={wave(x, x + w, top, t, amp)} fill="none" stroke="#ffffff" strokeWidth="1.6" opacity="0.75" />
      {open !== 'left' && open !== 'both' && <rect x={x - wall} y={y - 6} width={wall} height={h + 6 + floor} fill={`url(#${id}-conc)`} stroke="#8f897d" strokeWidth="0.8" />}
      {open !== 'right' && open !== 'both' && <rect x={x + w} y={y - 6} width={wall} height={h + 6 + floor} fill={`url(#${id}-conc)`} stroke="#8f897d" strokeWidth="0.8" />}
      <rect x={x - wall} y={y + h} width={w + 2 * wall} height={floor} fill={`url(#${id}-conc)`} stroke="#8f897d" strokeWidth="0.8" />
      {over}
    </g>
  );
}

// ------------------------------------------------------------------ lupa

/** Lupa: amplía lo que pasa en el punto (fx, fy) del corte. */
export function Lupa({ cx, cy, r, fx, fy, label, bg = '#eaf6fb', children, labelAt = 'below' }: { cx: number; cy: number; r: number; fx: number; fy: number; label?: string; bg?: string; children: ReactNode; labelAt?: 'below' | 'above' }) {
  const id = useLensId();
  const cid = `${id}-l${Math.round(cx)}-${Math.round(cy)}`;
  const ang = Math.atan2(fy - cy, fx - cx);
  const ex = cx + Math.cos(ang) * r, ey = cy + Math.sin(ang) * r;
  return (
    <g>
      <line x1={fx} y1={fy} x2={ex} y2={ey} stroke={INK} strokeWidth="1.2" strokeDasharray="4 3" opacity="0.75" />
      <circle cx={fx} cy={fy} r="7" fill="none" stroke={INK} strokeWidth="1.6" opacity="0.85" />
      <defs>
        <clipPath id={cid}>
          <circle cx={cx} cy={cy} r={r} />
        </clipPath>
      </defs>
      <g filter={`url(#${id}-sh)`}>
        <circle cx={cx} cy={cy} r={r + 3} fill="#ffffff" />
      </g>
      <circle cx={cx} cy={cy} r={r} fill={bg} />
      <g clipPath={`url(#${cid})`}>{children}</g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a3a47" strokeWidth="5" />
      <path d={`M${cx - r * 0.62} ${cy - r * 0.46} A${r * 0.8} ${r * 0.8} 0 0 1 ${cx - r * 0.1} ${cy - r * 0.78}`} fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      <line x1={cx + r * 0.72} y1={cy + r * 0.72} x2={cx + r * 0.72 + 12} y2={cy + r * 0.72 + 12} stroke="#2a3a47" strokeWidth="7" strokeLinecap="round" />
      {label && (
        <Tag x={Math.min(LW - 6 - label.length * 3.25, Math.max(6 + label.length * 3.25, cx))} y={labelAt === 'below' ? cy + r + 17 : cy - r - 9} anchor="middle" size="s">
          {label}
        </Tag>
      )}
    </g>
  );
}

// ------------------------------------------------------------------ partículas

/** Partícula de arcilla (con su carga si se pide). */
export function Clay({ x, y, r = 5, charge }: { x: number; y: number; r?: number; charge?: '−' | '+' | '' }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#8a6a44" />
      <circle cx={x - r * 0.3} cy={y - r * 0.35} r={r * 0.35} fill="#a98a62" />
      {charge && (
        <text x={x} y={y + r * 0.42} textAnchor="middle" fontSize={r * 1.25} fontWeight="800" fill="#ffffff">
          {charge}
        </text>
      )}
    </g>
  );
}

/** Grano de arena (polígono irregular). */
export function Grain({ x, y, r = 4, seed = 1, fill = '#c9a96c' }: { x: number; y: number; r?: number; seed?: number; fill?: string }) {
  const g = seeded(seed * 7919 + 13);
  const pts = [...Array(6)].map((_, i) => {
    const a = (i / 6) * Math.PI * 2, rr = r * (0.75 + 0.35 * g());
    return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`;
  });
  return <polygon points={pts.join(' ')} fill={fill} stroke={mix(fill, '#000000', 0.35)} strokeWidth="0.7" />;
}

/** Floc: racimo de partículas pegadas (más grande con r). */
export function Floc({ x, y, r, seed = 1, color = '#6b5134' }: { x: number; y: number; r: number; seed?: number; color?: string }) {
  const g = seeded(seed * 104729 + 7);
  const n = Math.max(3, Math.min(9, Math.round(r / 2.2) + 2));
  return (
    <g>
      {[...Array(n)].map((_, i) => {
        const a = g() * Math.PI * 2, d = i === 0 ? 0 : r * (0.35 + 0.45 * g());
        const rr = r * (0.32 + 0.22 * g());
        return <circle key={i} cx={x + Math.cos(a) * d} cy={y + Math.sin(a) * d} r={rr} fill={i % 3 === 0 ? mix(color, '#ffffff', 0.15) : color} />;
      })}
    </g>
  );
}

/** Bacteria (bastón con flagelo); muerta: gris y tachada. */
export function Bug({ x, y, a = 0, len = 16, color = '#7b3fb0', dead = false, t = 0 }: { x: number; y: number; a?: number; len?: number; color?: string; dead?: boolean; t?: number }) {
  const w = len * 0.42;
  const wig = dead ? 0 : Math.sin(t * 9 + x) * 2.5;
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)})`}>
      <path d={`M${-len / 2} 0 q-6 ${-3 - wig} -11 ${wig} t-9 ${-wig}`} fill="none" stroke={dead ? '#9aa3ab' : mix(color, '#000000', 0.2)} strokeWidth="1" />
      <rect x={-len / 2} y={-w / 2} width={len} height={w} rx={w / 2} fill={dead ? '#b7bec4' : color} stroke={dead ? '#8b949b' : mix(color, '#000000', 0.3)} strokeWidth="0.8" />
      {!dead && <ellipse cx={len * 0.1} cy={-w * 0.12} rx={len * 0.25} ry={w * 0.18} fill="#ffffff" opacity="0.35" />}
      {dead && <path d={`M${-w} ${-w} L${w} ${w} M${w} ${-w} L${-w} ${w}`} stroke="#c0392b" strokeWidth="1.8" strokeLinecap="round" />}
    </g>
  );
}

/** Burbuja de aire con brillo. */
export function Bubble({ x, y, r }: { x: number; y: number; r: number }) {
  const id = useLensId();
  return <circle cx={x} cy={y} r={r} fill={`url(#${id}-bub)`} stroke="#ffffff" strokeWidth="0.8" opacity="0.95" />;
}

/** Basura: hoja, rama, botella, toallita o bolsa. */
export function Trash({ x, y, kind, a = 0, s = 1 }: { x: number; y: number; kind: 'hoja' | 'rama' | 'botella' | 'toallita' | 'bolsa'; a?: number; s?: number }) {
  const body =
    kind === 'hoja' ? (
      <g>
        <path d="M-11 0 Q0 -9 11 0 Q0 9 -11 0z" fill="#4f8a3a" />
        <path d="M-11 0 H10" stroke="#2f5a22" strokeWidth="0.9" />
      </g>
    ) : kind === 'rama' ? (
      <g>
        <rect x="-18" y="-2.2" width="36" height="4.4" rx="2.2" fill="#6b4a32" />
        <path d="M2 -1 l8 -7" stroke="#6b4a32" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    ) : kind === 'botella' ? (
      <g>
        <rect x="-12" y="-5" width="20" height="10" rx="4" fill="#9ccfe6" stroke="#4f86a6" strokeWidth="0.9" opacity="0.95" />
        <rect x="8" y="-2.6" width="6" height="5.2" rx="1.2" fill="#2f6fa8" />
      </g>
    ) : kind === 'toallita' ? (
      <g>
        <path d="M-11 -7 Q0 -10 11 -6 L10 7 Q0 10 -11 7z" fill="#f4f1e8" stroke="#b9b3a5" strokeWidth="0.9" />
        <path d="M-7 -2 Q0 1 7 -1" stroke="#d8d2c4" strokeWidth="0.9" fill="none" />
      </g>
    ) : (
      <path d="M-12 -6 Q-2 -12 10 -5 Q14 4 4 8 Q-8 10 -12 2z" fill="#e8e3d6" stroke="#a9a293" strokeWidth="0.9" opacity="0.92" />
    );
  return <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)}) scale(${s})`}>{body}</g>;
}

/** Gota de grasa (amarilla, flota). */
export function Fat({ x, y, r = 5 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y} rx={r * 1.25} ry={r * 0.8} fill="#e4c457" stroke="#b8952e" strokeWidth="0.7" />
      <ellipse cx={x - r * 0.4} cy={y - r * 0.25} rx={r * 0.35} ry={r * 0.2} fill="#fff4c4" opacity="0.8" />
    </g>
  );
}

/** Molécula pequeña con su nombre (cloro, ion, oxígeno…). */
export function Mol({ x, y, text, color, r = 7 }: { x: number; y: number; text: string; color: string; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={color} stroke={mix(color, '#000000', 0.3)} strokeWidth="0.8" />
      <text x={x} y={y + r * 0.38} textAnchor="middle" fontSize={r * 1.05} fontWeight="800" fill="#ffffff">
        {text}
      </text>
    </g>
  );
}

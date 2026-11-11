// «Con lupa» en la planta de potabilización: un corte de cada proceso con el agua del color que le da el cálculo,
// lo que pasa adentro en movimiento (arena que cae, flocs que crecen, placas, lecho filtrante, cloro contra las
// bacterias) y una lupa que amplía la escala de las partículas. Al pie, los valores del juego. Son dibujos
// ilustrativos; donde dependen del juego (turbiedad, dosis, cloro, pH, horas en la red) usan los valores
// calculados en model.ts.

import { useMemo } from 'react';
import type { PlantInput, PlantResult } from './model';
import type { ProcessId } from './processes';
import { Arrow, Bug, Clay, Floc, Grain, INK, Lead, Lens, Lupa, Mol, Stream, Tag, Tank, Trash, bag, clamp01, mix, phase, turbColor, useLensUid, useTime, wave, wrap, type Chip } from './lensKit';

export { useTime } from './lensKit';

const es = (v: number, d = 1) => v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const ntu = (v: number) => `${es(v, v < 10 ? 1 : 0)} UNT`;
const FLOC = '#6b5134';

export function ProcessLens({ id, r, inp, washing = false }: { id: ProcessId; r: PlantResult; inp: PlantInput; washing?: boolean }) {
  const t = useTime();
  const P = useMemo(() => bag(97, 80), []);
  const eff = clamp01(1 - r.settled / r.raw.turbidity);
  const rawC = turbColor(r.raw.turbidity);
  switch (id) {
    case 'rio':
      return <Intake t={t} r={r} P={P} rawC={rawC} />;
    case 'desarenador':
      return <GritChannel t={t} r={r} P={P} rawC={rawC} />;
    case 'mezcla':
      return <RapidMix t={t} r={r} inp={inp} P={P} rawC={rawC} />;
    case 'floc':
      return <Flocculator t={t} r={r} P={P} eff={eff} rawC={rawC} />;
    case 'sedim':
      return <Settler t={t} r={r} P={P} eff={eff} rawC={rawC} />;
    case 'filtro':
      return <Filter t={t} r={r} P={P} washing={washing} />;
    case 'cloro':
      return <Contact t={t} r={r} P={P} />;
    case 'ph':
      return <Ph t={t} r={r} />;
    case 'tanque':
      return <Storage t={t} r={r} />;
    case 'llave':
      return <Network t={t} r={r} inp={inp} P={P} />;
    case 'lodos':
      return <Sludge t={t} r={r} P={P} />;
  }
}

type Pts = { a: number; b: number; c: number; d: number }[];

// ------------------------------------------------------------------ 1. captación y rejilla

function Intake({ t, r, P, rawC }: { t: number; r: PlantResult; P: Pts; rawC: string }) {
  const id = useLensUid();
  const nDebris = r.raw.turbidity >= 300 ? 10 : r.raw.turbidity >= 50 ? 6 : 3;
  const kinds = ['hoja', 'rama', 'hoja', 'botella', 'hoja', 'rama', 'bolsa', 'hoja', 'rama', 'hoja'] as const;
  const chips: Chip[] = [
    { label: 'Agua del río', value: r.raw.name },
    { label: 'Turbiedad', value: ntu(r.raw.turbidity), tone: r.raw.turbidity > 50 ? 'mid' : 'info' },
    { label: 'E. coli (NMP/100 mL)', value: r.raw.eColi.toLocaleString('es-CO'), tone: 'mid' },
  ];
  const bed = (x: number) => 228 - Math.max(0, 250 - x) * 0.08;
  return (
    <Lens uid={id} label={`Bocatoma con rejilla: el agua del río (${ntu(r.raw.turbidity)}) pasa entre las barras; ramas, hojas y basura se quedan afuera.`} chips={chips}>
      {/* río */}
      <path d={`${wave(0, 250, 104, t, 2, 0.05, 2.6)} L250 ${bed(250)} L0 ${bed(0)} Z`} fill={rawC} opacity="0.92" />
      <path d={`M0 ${bed(0)} L250 ${bed(250)} L250 254 L0 254 Z`} fill={`url(#${id}-grav)`} />
      <Stream d="M8 150 H236" t={t} speed={40} />
      <Stream d="M8 190 H236" t={t} speed={34} />
      {/* muro de la bocatoma con la ventana de la rejilla */}
      <rect x="250" y="40" width="16" height="96" fill={`url(#${id}-conc)`} stroke="#8f897d" />
      <rect x="250" y="222" width="16" height="32" fill={`url(#${id}-conc)`} stroke="#8f897d" />
      {/* canal de captación */}
      <path d={`${wave(266, 480, 116, t, 1.2, 0.05, 2)} L480 222 L266 222 Z`} fill={rawC} opacity="0.92" />
      <rect x="266" y="222" width="214" height="32" fill={`url(#${id}-conc)`} stroke="#8f897d" />
      <Stream d="M272 170 H470" t={t} speed={30} />
      {[...Array(11)].map((_, k) => (
        <rect key={k} x={251 + (k % 2) * 6} y={136 + k * 8} width="6" height="5" fill="none" />
      ))}
      {[...Array(6)].map((_, k) => (
        <rect key={`b${k}`} x="252" y={136} width="3.2" height="86" fill="#3f4a53" transform={`translate(${k * 2.6} 0)`} opacity={0.85} />
      ))}
      {/* partículas finas: pasan */}
      {P.slice(0, 26).map((p, k) => {
        const x = wrap(p.a * 520 + t * (38 + p.c * 14), 520) - 20;
        const y = 120 + p.b * 96;
        return <circle key={k} cx={x} cy={y} r={1.5 + p.d} fill="#7a5a36" opacity="0.8" />;
      })}
      {/* basura: llega flotando y se queda en la rejilla */}
      {P.slice(26, 26 + nDebris).map((p, k) => {
        const x = Math.min(240 - (k % 3) * 9, wrap(p.a * 260 + t * (22 + p.b * 10), 300) - 40);
        const y = 112 + ((k * 37) % 90) + 3 * Math.sin(t * 1.5 + k);
        return <Trash key={k} x={x} y={y} kind={kinds[k]} a={x > 225 ? 80 + p.c * 20 : p.d * 40 - 20} s={0.9} />;
      })}
      <Arrow d="M430 150 H470" kind="water" />
      <Tag x={10} y={92} size="m">
        río
      </Tag>
      <Tag x={474} y={208} anchor="end" size="s">
        a la planta →
      </Tag>
      <Lead x1={226} y1={36} x2={256} y2={60} />
      <Tag x={224} y={34} anchor="end" size="s">
        muro de la bocatoma
      </Tag>
      <Lupa cx={392} cy={74} r={56} fx={258} fy={176} label="entre las barras">
        <rect x="336" y="18" width="112" height="112" fill={mix(rawC, '#ffffff', 0.15)} />
        {[0, 1, 2].map((k) => (
          <rect key={k} x={352 + k * 34} y="18" width="12" height="112" fill={`url(#${id}-steel)`} stroke="#4f5961" />
        ))}
        {P.slice(40, 52).map((p, k) => {
          const x = wrap(p.a * 140 + t * 26, 140) + 330;
          const y = 30 + p.b * 90;
          const big = k % 3 === 0;
          return big ? <Grain key={k} x={x} y={y} r={3.4} seed={k} /> : <circle key={k} cx={x} cy={y} r="1.6" fill="#7a5a36" />;
        })}
        <Trash x={350} y={76} kind="hoja" a={90} s={1.6} />
        <Trash x={384} y={56} kind="rama" a={86} s={0.9} />
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 2. desarenador

function GritChannel({ t, r, P, rawC }: { t: number; r: PlantResult; P: Pts; rawC: string }) {
  const id = useLensUid();
  const x0 = 20, x1 = 400, top = 70, bot = 222;
  const u = 70; // px/s
  const chips: Chip[] = [
    { label: 'Turbiedad que entra y sale', value: ntu(r.raw.turbidity) },
    { label: 'Arena (0,2 mm o más)', value: 'cae al fondo', tone: 'ok' },
    { label: 'Arcilla (micras)', value: 'sigue con el agua', tone: 'mid' },
  ];
  return (
    <Lens uid={id} label="Desarenador: el agua va despacio; la arena cae al fondo y la arcilla, muy fina, sigue con el agua." chips={chips}>
      <Tank x={x0} y={top} w={x1 - x0} h={bot - top} level={0.9} color={rawC} t={t} name="des" open="right">
        <path d={`M${x0} ${bot} L${x0} ${bot - 10} Q${x0 + 120} ${bot - 22} ${x0 + 250} ${bot - 6} L${x0 + 330} ${bot} Z`} fill={`url(#${id}-sand)`} />
        <Stream d={`M${x0 + 8} 110 H${x1 - 8}`} t={t} speed={u * 0.6} />
        <Stream d={`M${x0 + 8} 170 H${x1 - 8}`} t={t} speed={u * 0.6} />
        {/* arena: avanza y cae (trayectoria recta inclinada) */}
        {P.slice(0, 18).map((p, k) => {
          const life = 3.4;
          const ph = phase(t, life, p.a);
          const y0 = 90 + p.b * 50, vs = 28 + p.c * 16;
          const x = x0 + 6 + ph * life * u * 0.55;
          const y = Math.min(bot - 14 - (x - x0) * 0.04, y0 + ph * life * vs);
          return <Grain key={k} x={x} y={y} r={3 + p.d * 1.6} seed={k} />;
        })}
        {/* trayectorias de muestra */}
        <path d={`M${x0 + 6} 96 L${x0 + 170} 206`} stroke="#b8955a" strokeWidth="1.2" strokeDasharray="4 3" fill="none" />
        <path d={`M${x0 + 6} 96 L${x1} 102`} stroke="#7a5a36" strokeWidth="1.2" strokeDasharray="4 3" fill="none" />
        {/* arcilla: casi no baja */}
        {P.slice(18, 50).map((p, k) => {
          const x = wrap(p.a * (x1 - x0) + t * u * 0.6, x1 - x0 + 30) + x0 - 10;
          return <circle key={k} cx={x} cy={84 + p.b * 128 + 2 * Math.sin(t + k)} r="1.4" fill="#6d4f2e" opacity="0.85" />;
        })}
      </Tank>
      <rect x={x1} y={top + 10} width="10" height={bot - top - 2} fill={`url(#${id}-conc)`} stroke="#8f897d" />
      <path d={`M${x1 + 10} ${top + 14} q14 0 18 18 v100`} fill="none" stroke={rawC} strokeWidth="7" opacity="0.9" />
      <Arrow d="M2 120 H26" kind="water" />
      <Tag x={x0 + 160} y={bot - 30} size="s">
        arena acumulada
      </Tag>
      <Tag x={x0 + 186} y={92} size="s">
        arcilla: sigue
      </Tag>
      <Tag x={x0 + 70} y={186} size="s">
        arena: cae
      </Tag>
      <Lupa cx={424} cy={60} r={48} fx={x0 + 120} fy={150} label="la arena cae; la arcilla no">
        <rect x="376" y="12" width="96" height="96" fill={mix(rawC, '#ffffff', 0.2)} />
        <Grain x={402} y={34 + phase(t, 2.2) * 54} r={9} seed={3} />
        <Arrow d="M402 52 v26" kind="sludge" w={2} />
        <circle cx={444} cy={56} r="2.2" fill="#6d4f2e" />
        <Arrow d="M450 56 h14" kind="ink" w={1.6} />
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 3. mezcla rápida (coagulación)

function RapidMix({ t, r, inp, P, rawC }: { t: number; r: PlantResult; inp: PlantInput; P: Pts; rawC: string }) {
  const id = useLensUid();
  const ratio = inp.dose / Math.max(1e-6, r.optimum);
  const over = ratio > 2;
  const k0 = inp.dose > 0 ? Math.min(1, phase(t, 9) * 3) * Math.min(1, ratio) : 0;
  const state = inp.dose <= 0 ? 'sin coagulante' : over ? 'demasiado' : ratio < 0.6 ? 'poco' : 'dosis justa';
  const note = inp.dose <= 0 ? 'Sin coagulante: la arcilla sigue cargada (−) y las partículas se repelen.' : over ? 'Demasiado: quedan cargadas (+) y se repelen otra vez.' : ratio < 0.6 ? 'Poco coagulante: muchas partículas siguen cargadas.' : 'El aluminio (+) neutraliza la carga (−) de la arcilla.';
  const chips: Chip[] = [
    { label: 'Dosis', value: `${es(inp.dose, 0)} mg/L` },
    { label: 'Dosis justa (jarras)', value: `${es(r.optimum, 0)} mg/L` },
    { label: 'Así queda', value: state, tone: state === 'dosis justa' ? 'ok' : state === 'poco' ? 'mid' : 'bad' },
  ];
  const ang = t * 7;
  return (
    <Lens uid={id} label={`Mezcla rápida: ${note}`} chips={chips}>
      <Tank x={34} y={86} w={180} h={140} color={rawC} t={t} amp={3} name="mix">
        {[0, 1, 2].map((k) => (
          <path key={k} d={`M${124 + 52 * Math.cos(ang * 0.6 + k * 2.1)} ${156 + 40 * Math.sin(ang * 0.6 + k * 2.1)} A52 40 0 0 1 ${124 + 52 * Math.cos(ang * 0.6 + k * 2.1 + 1.4)} ${156 + 40 * Math.sin(ang * 0.6 + k * 2.1 + 1.4)}`} fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.55" />
        ))}
        {inp.dose > 0 &&
          P.slice(0, 30).map((p, k) => {
            const a = ang * 0.6 + p.a * 6.28, rr = 14 + p.b * 60 * clamp01(phase(t, 3, p.c) * 2);
            return <circle key={k} cx={124 + Math.cos(a) * rr} cy={150 + Math.sin(a) * rr * 0.7} r="1.8" fill="#eaf4ff" />;
          })}
      </Tank>
      {/* motor, eje y turbina */}
      <rect x="104" y="44" width="40" height="26" rx="4" fill={`url(#${id}-steel)`} stroke="#4f5961" />
      <rect x="121" y="70" width="6" height="98" fill="#55616a" />
      {[0, 1].map((k) => {
        const w = 26 * Math.abs(Math.cos(ang + k * Math.PI / 2));
        return <rect key={k} x={124 - w} y={160 + k * 6} width={2 * w} height="5" rx="2" fill="#2f6fa8" />;
      })}
      {/* dosificación de coagulante */}
      <path d="M30 56 H86 V92" fill="none" stroke="#b9c0c6" strokeWidth="6" />
      {inp.dose > 0 &&
        [0, 1, 2].map((k) => {
          const ph = phase(t, 0.9, k / 3);
          return <path key={k} d={`M86 ${96 + ph * 22} q-3 5 0 7 q3 -2 0 -7z`} fill="#eaf4ff" stroke="#2f6fa8" strokeWidth="0.8" opacity={1 - ph * 0.6} />;
        })}
      <Tag x={30} y={50} size="s">
        sulfato de aluminio
      </Tag>
      <Arrow d="M2 196 H30" kind="water" />
      <Arrow d="M222 196 H246" kind="water" />
      <Lupa cx={360} cy={122} r={98} fx={170} fy={150}>
        <rect x="262" y="24" width="196" height="196" fill={mix(rawC, '#ffffff', 0.35)} />
        {P.slice(30, 44).map((p, k) => {
          const charged = k0 < p.d;
          // las neutras se juntan de a dos; las cargadas se separan
          const pair = Math.floor(k / 2), side = k % 2 ? 1 : -1;
          const cx0 = 296 + (pair % 4) * 42, cy0 = 58 + Math.floor(pair / 4) * 66;
          const gap = charged ? 16 + 4 * Math.sin(t * 2 + k) : 7.5;
          const x = cx0 + side * gap + 3 * Math.sin(t * 1.3 + p.a * 6);
          const y = cy0 + 3 * Math.cos(t * 1.1 + p.b * 6);
          return <Clay key={k} x={x} y={y} r={7.5} charge={charged ? '−' : over ? '+' : ''} />;
        })}
        {inp.dose > 0 &&
          P.slice(44, 44 + Math.min(16, Math.round(inp.dose / 3) + 2)).map((p, k) => {
            const x = wrap(p.a * 200 + t * 38, 200) + 262;
            const y = 30 + p.b * 180;
            return <Mol key={k} x={x} y={y} text="+" color="#2f6fa8" r={5} />;
          })}
      </Lupa>
      <Tag x={474} y={248} anchor="end" size="s">
        {note}
      </Tag>
    </Lens>
  );
}

// ------------------------------------------------------------------ 4. floculación

function Flocculator({ t, r, P, eff, rawC }: { t: number; r: PlantResult; P: Pts; eff: number; rawC: string }) {
  const id = useLensUid();
  const G = [70, 40, 10];
  const sp = [2.2, 1.2, 0.45];
  const chips: Chip[] = [
    { label: 'Tamaño de los flocs al salir', value: eff > 0.85 ? 'grandes' : eff > 0.5 ? 'medianos' : 'pequeños', tone: eff > 0.85 ? 'ok' : eff > 0.5 ? 'mid' : 'bad' },
    { label: 'Turbiedad después de sedimentar', value: ntu(r.settled), tone: r.settled <= 5 ? 'ok' : r.settled <= 20 ? 'mid' : 'bad' },
  ];
  const zw = 140, x0 = 22, top = 104, bot = 230;
  return (
    <Lens uid={id} label="Floculación: tres cámaras con paletas que giran cada vez más despacio; las partículas chocan y forman flocs cada vez más grandes." chips={chips}>
      <Tank x={x0} y={top} w={zw * 3 + 16} h={bot - top} color={mix(rawC, '#a9d8ea', 0.15)} t={t} amp={1.2} name="floc">
        {[0, 1, 2].map((z) => {
          const cx = x0 + zw * z + zw / 2 + z * 8, cy = (top + bot) / 2 + 6;
          return (
            <g key={z}>
              {P.slice(z * 14, z * 14 + 14).map((p, k) => {
                const a = t * sp[z] * (0.6 + p.c * 0.5) + p.a * 6.28;
                const rr = 18 + p.b * 38;
                const size = (2 + z * 3.3 * eff) * (0.8 + p.d * 0.5);
                return <Floc key={k} x={cx + Math.cos(a) * rr} y={cy + Math.sin(a) * rr * 0.8} r={size} seed={z * 20 + k} color={FLOC} />;
              })}
              {/* paleta */}
              {[0, 1, 2, 3].map((j) => {
                const a = t * sp[z] + (j * Math.PI) / 2;
                return <line key={j} x1={cx} y1={cy} x2={cx + Math.cos(a) * 44} y2={cy + Math.sin(a) * 44} stroke="#2f6fa8" strokeWidth="5" strokeLinecap="round" opacity="0.85" />;
              })}
              <circle cx={cx} cy={cy} r="5" fill="#55616a" />
            </g>
          );
        })}
      </Tank>
      {/* tabiques: el agua pasa por abajo y por arriba */}
      <rect x={x0 + zw + 2} y={top - 6} width="8" height={bot - top - 18} fill={`url(#${id}-conc)`} stroke="#8f897d" />
      <rect x={x0 + 2 * zw + 10} y={top + 22} width="8" height={bot - top - 22} fill={`url(#${id}-conc)`} stroke="#8f897d" />
      <Arrow d={`M${x0 + zw - 10} ${bot - 6} h26`} kind="water" w={2} />
      <Arrow d={`M${x0 + 2 * zw - 2} ${top + 10} h26`} kind="water" w={2} />
      {[0, 1, 2].map((z) => (
        <Tag key={z} x={x0 + zw * z + zw / 2 + z * 8} y={top + 30} anchor="middle" size="s">
          {`G ≈ ${G[z]} s⁻¹`}
        </Tag>
      ))}
      <Tag x={x0 + 4} y={top - 30} size="s">
        cada cámara revuelve más suave →
      </Tag>
      <Lupa cx={404} cy={50} r={44} fx={x0 + zw / 2} fy={(top + bot) / 2} label="dos flocs se pegan">
        <rect x="358" y="4" width="92" height="92" fill={mix(rawC, '#ffffff', 0.3)} />
        {(() => {
          const ph = phase(t, 3.2);
          const d = ph < 0.6 ? 26 * (1 - ph / 0.6) : 0;
          return ph < 0.6 ? (
            <g>
              <Floc x={404 - 6 - d} y={50} r={10} seed={5} />
              <Floc x={404 + 6 + d} y={50} r={8} seed={6} />
            </g>
          ) : (
            <Floc x={404} y={50} r={13 + (ph - 0.6) * 4} seed={7} />
          );
        })()}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 5. sedimentación de alta tasa

function Settler({ t, r, P, eff, rawC }: { t: number; r: PlantResult; P: Pts; eff: number; rawC: string }) {
  const id = useLensUid();
  const top = 46, bot = 206, x0 = 26, x1 = 320;
  const clearC = turbColor(r.settled);
  const sludgeH = 8 + 18 * clamp01(r.raw.turbidity / 400);
  const chips: Chip[] = [
    { label: 'Llega (turbiedad del río)', value: ntu(r.raw.turbidity) },
    { label: 'Sale (agua sedimentada)', value: ntu(r.settled), tone: r.settled <= 5 ? 'ok' : r.settled <= 20 ? 'mid' : 'bad' },
    { label: 'Flocs que caen', value: `${Math.round(eff * 100)} %`, tone: eff > 0.85 ? 'ok' : 'mid' },
  ];
  const plate = (k: number) => ({ x1: 70 + k * 30, y1: 176, x2: 120 + k * 30, y2: 92 });
  return (
    <Lens uid={id} label={`Sedimentación de alta tasa: el agua sube despacio entre placas inclinadas; los flocs caen sobre ellas y resbalan al fondo. Sale con ${ntu(r.settled)}.`} chips={chips}>
      <Tank x={x0} y={top} w={x1 - x0} h={bot - top} color={clearC} t={t} amp={0.8} name="sed">
        <defs>
          <linearGradient id={`${id}-turb`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={rawC} stopOpacity="0.95" />
            <stop offset="0.55" stopColor={rawC} stopOpacity="0.35" />
            <stop offset="1" stopColor={rawC} stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x={x0} y={top} width={x1 - x0} height={bot - top} fill={`url(#${id}-turb)`} />
        {/* placas */}
        {[...Array(8)].map((_, k) => {
          const p = plate(k);
          return <line key={k} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="#8fa3b1" strokeWidth="4" strokeLinecap="round" />;
        })}
        {/* flocs: caen, tocan una placa y resbalan */}
        {P.slice(0, 22).map((p, k) => {
          const k2 = k % 8;
          const pl = plate(k2);
          const ph = phase(t, 4.2, p.a);
          const along = ph < 0.5 ? 0 : (ph - 0.5) / 0.5;
          const sx = pl.x2 - (pl.x2 - pl.x1) * (0.2 + p.b * 0.3);
          const sy = pl.y2 + (pl.y1 - pl.y2) * (0.2 + p.b * 0.3);
          const x = ph < 0.5 ? sx + 8 : sx + (pl.x1 - sx) * along;
          const y = ph < 0.5 ? sy - 30 + (ph / 0.5) * 28 : sy + (pl.y1 - sy) * along + Math.max(0, along - 0.95) * 200;
          return <Floc key={k} x={x} y={Math.min(bot - 4, y)} r={2.5 + 2.5 * eff} seed={k + 40} />;
        })}
        {/* agua que sube */}
        {[0, 1, 2].map((k) => (
          <Stream key={k} d={`M${110 + k * 60} ${bot - 20} L${150 + k * 60} ${top + 30}`} t={t} kind="water" speed={18} w={1.6} />
        ))}
        <rect x={x0} y={bot - sludgeH} width={x1 - x0} height={sludgeH} fill={`url(#${id}-sludge)`} />
      </Tank>
      {/* canaletas de agua clara */}
      {[0, 1, 2, 3].map((k) => (
        <rect key={k} x={86 + k * 60} y={top + 8} width="26" height="12" rx="2" fill="#b9c0c6" stroke="#6f7a82" />
      ))}
      <Arrow d={`M${x1 + 8} ${top + 14} h40`} kind="water" />
      <Arrow d={`M2 ${bot - 22} h28`} kind="water" />
      <Tag x={x1 + 6} y={top + 2} size="s">
        agua clara
      </Tag>
      <Tag x={x0 + 8} y={bot - sludgeH - 6} size="s" color="#ffffff" halo={false}>
        lodo
      </Tag>
      <Lupa cx={410} cy={146} r={60} fx={170} fy={130} label="un floc resbala por la placa">
        <rect x="346" y="82" width="128" height="128" fill={mix(clearC, '#ffffff', 0.2)} />
        <line x1="356" y1="196" x2="466" y2="96" stroke="#8fa3b1" strokeWidth="12" strokeLinecap="round" />
        {(() => {
          const ph = phase(t, 3);
          const x = 446 - ph * 82, y = 104 + ph * 76;
          return <Floc x={x} y={y - 10} r={8 + 4 * eff} seed={11} />;
        })()}
        <Arrow d="M380 160 l30 -40" kind="water" w={1.8} />
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 6. filtración rápida

function Filter({ t, r, P, washing }: { t: number; r: PlantResult; P: Pts; washing: boolean }) {
  const id = useLensUid();
  const cyc = wrap(t, 16);
  const wash = washing || cyc > 11;
  const ex = washing ? 14 * (0.8 + 0.2 * Math.sin(t * 3)) : wash ? 16 * Math.sin(((cyc - 11) / 5) * Math.PI) : 0;
  const clog = clamp01(r.clogged ? 1 : (cyc / 11) * (0.3 + 0.7 * clamp01(r.settled / 20)));
  const x0 = 34, x1 = 300;
  const chips: Chip[] = [
    { label: 'Agua filtrada', value: ntu(r.filtered), tone: r.filtered <= 2 ? 'ok' : 'bad' },
    { label: 'Ahora', value: wash ? 'retrolavado' : 'filtrando', tone: wash ? 'info' : 'ok' },
    { label: 'Filtro', value: r.clogged ? 'colmatado' : 'trabaja bien', tone: r.clogged ? 'bad' : 'ok' },
  ];
  const settledC = turbColor(r.settled);
  return (
    <Lens uid={id} label={wash ? 'Retrolavado: el agua sube por el filtro, el lecho se expande y suelta la suciedad hacia la canaleta.' : `Filtración: el agua baja por antracita, arena y grava; las partículas quedan atrapadas. Sale con ${ntu(r.filtered)}.`} chips={chips}>
      <rect x={x0 - 10} y="22" width={x1 - x0 + 20} height="222" fill={`url(#${id}-conc)`} stroke="#8f897d" />
      <rect x={x0} y="30" width={x1 - x0} height="206" fill={mix(settledC, '#ffffff', 0.1)} />
      {/* capas (se elevan en el retrolavado) */}
      <rect x={x0} y={104 - ex} width={x1 - x0} height="44" fill="#2f2f33" opacity="0.9" />
      {[...Array(3)].map((_, row) =>
        [...Array(11)].map((_, col) => <circle key={`a${row}-${col}`} cx={x0 + 10 + col * 24 + (row % 2) * 12} cy={112 + row * 14 - ex * (1 - row * 0.2) + (wash ? 2 * Math.sin(t * 6 + col + row) : 0)} r="7" fill="#3c3c41" stroke="#1f1f22" />),
      )}
      <rect x={x0} y={148 - ex * 0.5} width={x1 - x0} height="40" fill={`url(#${id}-sand)`} />
      <rect x={x0} y="188" width={x1 - x0} height="30" fill={`url(#${id}-grav)`} />
      <rect x={x0} y="218" width={x1 - x0} height="18" fill="#7f8890" />
      {[...Array(8)].map((_, k) => (
        <rect key={k} x={x0 + 14 + k * 32} y="214" width="8" height="6" fill="#4f5961" />
      ))}
      {/* partículas */}
      {P.slice(0, 26).map((p, k) => {
        const x = x0 + 8 + p.b * (x1 - x0 - 16);
        if (wash) {
          const ph = phase(t, 2.2, p.a);
          return <circle key={k} cx={x + 6 * Math.sin(t * 3 + k)} cy={150 - ph * 120} r="2" fill="#7a5a36" />;
        }
        const stop = 110 + p.c * 40 + (p.d < clog ? -12 : 0);
        const ph = phase(t, 5, p.a);
        return <circle key={k} cx={x} cy={Math.min(stop, 36 + ph * 150)} r="2" fill="#7a5a36" />;
      })}
      {/* canaleta de lavado */}
      <rect x={x0 + 80} y="54" width="100" height="16" rx="3" fill="#b9c0c6" stroke="#6f7a82" />
      {wash ? <Arrow d={`M${x0 + 130} 230 V196`} kind="water" w={3} /> : <Arrow d={`M${x0 + 130} 40 V66`} kind="water" w={2} />}
      {wash ? <Arrow d={`M${x0 + 180} 62 H${x1 + 30}`} kind="warn" /> : <Arrow d={`M${x1 - 20} 228 H${x1 + 30}`} kind="water" />}
      <Tag x={wash ? x1 + 34 : x1 - 22} y={wash ? 58 : 244} size="s">
        {wash ? 'agua de lavado' : 'agua filtrada'}
      </Tag>
      <Tag x={x0 + 4} y={124 - ex} size="s" color="#ffffff" halo={false}>
        antracita
      </Tag>
      <Tag x={x0 + 4} y={170 - ex * 0.5} size="s">
        arena
      </Tag>
      <Tag x={x0 + 4} y={206} size="s">
        grava
      </Tag>
      {/* piezómetro: la pérdida de carga crece cuando el filtro se ensucia */}
      <rect x={x1 + 14} y="72" width="14" height="120" rx="7" fill="#ffffff" stroke="#6f7a82" />
      <rect x={x1 + 16} y={74 + 100 * (wash ? 0.1 : clog)} width="10" height={116 - 100 * (wash ? 0.1 : clog)} rx="5" fill="#88c1d6" />
      <Tag x={x1 + 34} y={90} size="s">
        pérdida de carga
      </Tag>
      <Lupa cx={412} cy={156} r={56} fx={x0 + 150} fy={124 - ex} label={wash ? 'los granos se separan' : 'partículas entre granos'}>
        <rect x="352" y="96" width="120" height="120" fill={mix(settledC, '#ffffff', 0.2)} />
        {[
          [382, 130],
          [432, 124],
          [404, 168],
          [452, 178],
          [366, 186],
        ].map(([x, y], k) => (
          <Grain key={k} x={x + (wash ? (k - 2) * 4 * Math.sin(t * 4) : 0)} y={y - (wash ? 6 : 0)} r={20} seed={k + 3} fill="#d8bc85" />
        ))}
        {[
          [406, 140],
          [418, 152],
          [388, 160],
          [432, 196],
        ].map(([x, y], k) => (
          <circle key={k} cx={x} cy={wash ? y - phase(t, 1.6, k / 4) * 70 : y} r="3.2" fill="#7a5a36" />
        ))}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 7. desinfección con cloro

function Contact({ t, r, P }: { t: number; r: PlantResult; P: Pts }) {
  const kill = r.clExit >= 0.05;
  const hidden = r.filtered > 1;
  const frac = kill ? 1 - Math.pow(10, -Math.min(6, r.logKill)) : 0;
  // tanque en zigzag visto desde arriba: el camino se recorre de izquierda a derecha
  const x0 = 26, x1 = 300, y0 = 34, y1 = 226, n = 6;
  const lane = (x1 - x0) / n;
  const along = (s: number) => {
    const L = s * n;
    const i = Math.min(n - 1, Math.floor(L));
    const f = L - i;
    const x = x0 + lane * (i + 0.5);
    const y = i % 2 === 0 ? y0 + 14 + f * (y1 - y0 - 28) : y1 - 14 - f * (y1 - y0 - 28);
    return [x, y] as const;
  };
  const chips: Chip[] = [
    { label: 'Cloro a la salida', value: `${es(r.clExit, 2)} mg/L`, tone: r.clExit >= 0.3 && r.clExit <= 2 ? 'ok' : 'bad' },
    { label: 'Bacterias inactivadas', value: kill ? `${es(Math.min(99.9999, frac * 100), frac > 0.999 ? 3 : 1)} %` : '0 %', tone: kill ? 'ok' : 'bad' },
    { label: 'Agua filtrada', value: ntu(r.filtered), tone: hidden ? 'mid' : 'ok' },
  ];
  return (
    <Lens label={kill ? `Desinfección: el agua recorre un tanque en zigzag con cloro; las bacterias se inactivan por el camino (${es(r.clExit, 2)} mg/L a la salida).` : 'Sin cloro libre: las bacterias recorren el tanque y salen vivas.'} chips={chips}>
      <rect x={x0 - 8} y={y0 - 8} width={x1 - x0 + 16} height={y1 - y0 + 16} rx="6" fill="#b9b4aa" />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={mix('#9fd0e3', turbColor(r.filtered), 0.85)} />
      {[...Array(n - 1)].map((_, k) => (
        <rect key={k} x={x0 + lane * (k + 1) - 3} y={k % 2 === 0 ? y0 : y0 + 26} width="6" height={y1 - y0 - 26} fill="#b9b4aa" />
      ))}
      <path d={[...Array(61)].map((_, k) => `${k ? 'L' : 'M'}${along(k / 60).join(' ')}`).join('')} fill="none" stroke="#2f78c4" strokeWidth="2" strokeDasharray="10 9" strokeDashoffset={-t * 30} opacity="0.6" />
      {kill &&
        P.slice(0, 34).map((p, k) => {
          const s = phase(t, 9, p.a);
          const [x, y] = along(s);
          return <circle key={k} cx={x + (p.b - 0.5) * lane * 0.7} cy={y + (p.c - 0.5) * 18} r="2.4" fill="#3fa565" opacity={Math.max(0.15, 1 - s * 0.5)} />;
        })}
      {P.slice(34, 50).map((p, k) => {
        const s = phase(t, 9, p.a);
        const [x, y] = along(s);
        const shield = hidden && k < 3;
        const dead = kill && !shield && p.d < frac * Math.min(1, s * 1.6);
        return <Bug key={k} x={x + (p.b - 0.5) * lane * 0.5} y={y} a={p.c * 180} len={13} dead={dead} t={t} />;
      })}
      <Mol x={x0 + 18} y={y0 + 10} text="Cl" color="#3fa565" r={8} />
      <Arrow d={`M${x1 + 6} ${y1 - 14} h34`} kind="water" />
      <Tag x={x0} y={y1 + 22} size="s">
        tanque de contacto (visto desde arriba)
      </Tag>
      <Lupa cx={404} cy={110} r={66} fx={x0 + lane * 2.5} fy={(y0 + y1) / 2} label={hidden ? 'una partícula esconde bacterias' : 'el cloro ataca la bacteria'}>
        <rect x="338" y="44" width="132" height="132" fill="#cfe9f3" />
        {(() => {
          const ph = phase(t, 4);
          const dead = kill && ph > 0.55;
          return (
            <g>
              <Bug x={404} y={110} a={-20} len={46} dead={dead} t={t} />
              {kill &&
                [0, 1, 2, 3, 4].map((k) => {
                  const a = (k / 5) * 6.28 + 0.4;
                  const d = 56 - Math.min(1, ph / 0.55) * 30;
                  return <Mol key={k} x={404 + Math.cos(a) * d} y={110 + Math.sin(a) * d} text="Cl" color="#3fa565" r={8} />;
                })}
              {hidden && (
                <g>
                  <Clay x={372} y={150} r={18} />
                  <Bug x={384} y={156} a={30} len={18} t={t} />
                </g>
              )}
            </g>
          );
        })()}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 8. estabilización del pH

function Ph({ t, r }: { t: number; r: PlantResult }) {
  const id = useLensUid();
  const X = (v: number) => 40 + (v / 14) * 400;
  const ok = r.pH >= 6.5 && r.pH <= 9;
  const state = r.pH < 6.5 ? 'corroe' : r.pH > 9 ? 'deja costras' : 'protege el tubo';
  const chips: Chip[] = [
    { label: 'pH del agua tratada', value: es(r.pH, 1), tone: ok ? 'ok' : 'bad' },
    { label: 'Norma (Res. 2115)', value: '6,5 a 9,0' },
    { label: 'En los tubos', value: state, tone: ok ? 'ok' : 'bad' },
  ];
  return (
    <Lens uid={id} label={`pH ${es(r.pH, 1)}: ${ok ? 'dentro de la norma, el agua no corroe los tubos ni deja costras' : 'fuera de la norma'}.`} chips={chips}>
      <defs>
        <linearGradient id={`${id}-ph`} x1="0" x2="1">
          <stop offset="0" stopColor="#d64c3b" />
          <stop offset="0.3" stopColor="#f0a33a" />
          <stop offset="0.5" stopColor="#3fa565" />
          <stop offset="0.72" stopColor="#2f78c4" />
          <stop offset="1" stopColor="#5b3fb6" />
        </linearGradient>
      </defs>
      {/* dosificador de cal y canal */}
      <rect x="40" y="18" width="46" height="46" rx="6" fill="#e9e6df" stroke="#9c968a" />
      <path d="M52 64 L74 64 L63 78 Z" fill="#e9e6df" stroke="#9c968a" />
      {[0, 1, 2, 3].map((k) => {
        const ph = phase(t, 1.2, k / 4);
        return <circle key={k} cx={63 + (k - 1.5) * 3} cy={80 + ph * 22} r="1.8" fill="#ffffff" stroke="#bdb7aa" strokeWidth="0.5" />;
      })}
      <Tag x={92} y={34} size="s">
        cal (si hace falta)
      </Tag>
      <Tank x={30} y={92} w={240} h={50} color={mix('#9fd0e3', turbColor(r.filtered), 0.85)} t={t} name="ph" open="both" />
      <Arrow d="M36 126 H264" kind="water" />
      {/* medidor de pH */}
      <rect x="300" y="24" width="140" height="66" rx="10" fill="#22313d" />
      <rect x="310" y="34" width="120" height="34" rx="5" fill="#cfe9d8" />
      <text x="370" y="59" textAnchor="middle" fontSize="22" fontWeight="800" fill="#17324d" fontFamily="monospace">
        {`pH ${es(r.pH + 0.02 * Math.sin(t * 2), 2)}`}
      </text>
      <path d="M370 90 V112 L330 112 L280 108" fill="none" stroke="#22313d" strokeWidth="3" />
      <rect x="272" y="100" width="10" height="34" rx="4" fill="#9aa4ab" />
      {/* escala */}
      <rect x="40" y="170" width="400" height="20" rx="10" fill={`url(#${id}-ph)`} />
      <rect x={X(6.5)} y="164" width={X(9) - X(6.5)} height="32" rx="6" fill="none" stroke={INK} strokeWidth="2" strokeDasharray="5 3" />
      {[0, 2, 4, 6, 7, 8, 10, 12, 14].map((v) => (
        <Tag key={v} x={X(v)} y={210} anchor="middle" size="s">
          {String(v)}
        </Tag>
      ))}
      <path d={`M${X(r.pH)} 166 l-8 -13 h16 z`} fill={INK} transform={`translate(0 ${1.5 * Math.sin(t * 3)})`} />
      <Tag x={X(7.75)} y={160} anchor="middle" size="s">
        norma
      </Tag>
      <Tag x={40} y={232} size="s" color="#a3321d">
        ácido: corroe los tubos
      </Tag>
      <Tag x={440} y={232} anchor="end" size="s" color="#3a2a8a">
        básico: deja costras
      </Tag>
    </Lens>
  );
}

// ------------------------------------------------------------------ 9. almacenamiento

const useCurve = (h: number) => 0.5 + 0.35 * Math.exp(-((h - 7) ** 2) / 4) + 0.3 * Math.exp(-((h - 19) ** 2) / 5) - 0.25 * Math.exp(-((h - 2) ** 2) / 8);

function Storage({ t, r }: { t: number; r: PlantResult }) {
  const hour = wrap(t * 1.4, 24);
  const use = useCurve(hour);
  const level = 0.55 + 0.3 * Math.cos(((hour - 4) / 24) * 2 * Math.PI);
  const cx = 300, cy = 200, cw = 160, ch = 120;
  const chips: Chip[] = [
    { label: 'Hora', value: `${String(Math.floor(hour)).padStart(2, '0')}:00` },
    { label: 'Consumo de la ciudad', value: use > 0.7 ? 'alto' : use < 0.4 ? 'bajo' : 'medio', tone: use > 0.7 ? 'mid' : 'info' },
    { label: 'Nivel del tanque', value: `${Math.round(level * 100)} %` },
    { label: 'Cloro que entra', value: `${es(r.clExit, 2)} mg/L` },
  ];
  return (
    <Lens label="Almacenamiento: entra agua tratada parejo todo el día y sale más en las horas de mayor consumo; el nivel del tanque sube de noche y baja de día." chips={chips}>
      {/* tanque enterrado a medias, con su techo */}
      <rect x="24" y="184" width="240" height="70" fill="#8a6a49" opacity="0.6" />
      <Tank x={40} y={70} w={200} h={160} level={level} color={mix('#9fd0e3', turbColor(r.filtered), 0.85)} t={t} amp={0.9} name="tq" />
      <path d="M30 64 L140 40 L250 64 Z" fill="#b9b4aa" stroke="#8f897d" />
      <Arrow d="M2 90 H36" kind="water" />
      <Arrow d={`M244 214 H${244 + 12 + use * 26}`} kind="water" w={2 + use * 5} />
      <Tag x={4} y={80} size="s">
        de la planta
      </Tag>
      <Tag x={250} y={244} size="s">
        a la ciudad
      </Tag>
      {/* curva de consumo del día */}
      <rect x={cx - 14} y={cy - ch - 22} width={cw + 26} height={ch + 50} rx="8" fill="#ffffff" stroke="#cfdbe3" />
      <path
        d={`M${cx} ${cy} ${[...Array(25)].map((_, h) => `L${cx + (h / 24) * cw} ${cy - ch * useCurve(h) * 0.95}`).join(' ')} L${cx + cw} ${cy} Z`}
        fill="#f4c6b9"
        opacity="0.6"
      />
      <path d={[...Array(25)].map((_, h) => `${h ? 'L' : 'M'}${cx + (h / 24) * cw} ${cy - ch * useCurve(h) * 0.95}`).join(' ')} fill="none" stroke="#c0462a" strokeWidth="2" />
      <line x1={cx + (hour / 24) * cw} y1={cy - ch} x2={cx + (hour / 24) * cw} y2={cy} stroke={INK} strokeDasharray="3 2" />
      <circle cx={cx + (hour / 24) * cw} cy={cy - ch * use * 0.95} r="5" fill="#c0462a" stroke="#ffffff" strokeWidth="1.5" />
      {[0, 6, 12, 18, 24].map((h) => (
        <Tag key={h} x={cx + (h / 24) * cw} y={cy + 14} anchor="middle" size="s" halo={false}>
          {`${h} h`}
        </Tag>
      ))}
      <Tag x={cx - 6} y={cy - ch - 6} size="s" halo={false}>
        consumo en el día
      </Tag>
    </Lens>
  );
}

// ------------------------------------------------------------------ 10. red y llave

function Network({ t, r, inp, P }: { t: number; r: PlantResult; inp: PlantInput; P: Pts }) {
  const id = useLensUid();
  const net = inp.networkH ?? 12;
  const ok = r.clTap >= 0.3;
  const n = Math.round(Math.min(26, r.clExit * 12));
  const chips: Chip[] = [
    { label: 'Cloro en la planta', value: `${es(r.clExit, 2)} mg/L` },
    { label: 'Horas en la red', value: `${es(net, 0)} h` },
    { label: 'Cloro en la llave', value: `${es(r.clTap, 2)} mg/L`, tone: ok ? 'ok' : 'bad' },
  ];
  const py = 196;
  return (
    <Lens uid={id} label={`La red: el cloro se gasta en el camino; llega a la llave con ${es(r.clTap, 2)} mg/L (${ok ? 'suficiente' : 'menos de 0,3 mg/L'}).`} chips={chips} ground>
      {/* tanque de la planta */}
      <rect x="14" y="104" width="64" height="70" rx="4" fill="#cfd6db" stroke="#8f9aa2" />
      <Tag x={46} y={98} anchor="middle" size="s">
        planta
      </Tag>
      {/* tubo enterrado */}
      <rect x="70" y={py - 11} width="300" height="22" rx="11" fill={`url(#${id}-steel)`} stroke="#4f5961" />
      <rect x="74" y={py - 7} width="292" height="14" rx="7" fill={turbColor(r.filtered)} />
      {[...Array(n)].map((_, k) => {
        const x = wrap(k * (292 / Math.max(1, n)) + t * 30, 292);
        const life = Math.exp(-0.05 * net * (x / 292));
        return <circle key={k} cx={74 + x} cy={py + 3 * Math.sin(k + t)} r="3.6" fill="#3fa565" opacity={0.15 + 0.85 * life} />;
      })}
      <Tag x={76} y={py + 30} size="s">
        0 h
      </Tag>
      <Tag x={366} y={py + 30} anchor="end" size="s">
        {`${es(net, 0)} h`}
      </Tag>
      {/* casa y llave */}
      <path d="M380 150 L420 118 L460 150 V196 H380 Z" fill="#efe0c0" stroke="#9c8a66" />
      <rect x="404" y="164" width="16" height="32" fill="#7a5a3a" />
      <path d={`M370 ${py} H392 V140 H436`} fill="none" stroke="#7e8a92" strokeWidth="5" />
      <path d="M436 134 h10 v14" fill="none" stroke="#5c6670" strokeWidth="5" strokeLinecap="round" />
      {[0, 1, 2].map((k) => {
        const ph = phase(t, 0.7, k / 3);
        return <path key={k} d={`M446 ${152 + ph * 20} q-2.5 4 0 6 q2.5 -2 0 -6z`} fill="#a9d8ea" stroke="#2f78c4" strokeWidth="0.6" />;
      })}
      <Lupa cx={150} cy={74} r={56} fx={446} fy={160} label={ok ? 'en el vaso todavía hay cloro' : 'en el vaso casi no queda cloro'}>
        <rect x="90" y="14" width="120" height="120" fill="#e9f6fb" />
        <path d="M118 36 L182 36 L174 124 L126 124 Z" fill={mix('#cfeaf5', turbColor(r.filtered), 0.7)} stroke="#6f8fa3" strokeWidth="2" />
        {P.slice(0, Math.round(Math.min(14, r.clTap * 10))).map((p, k) => (
          <Mol key={k} x={130 + p.a * 40} y={56 + p.b * 60 + 2 * Math.sin(t * 2 + k)} text="Cl" color="#3fa565" r={6} />
        ))}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 11. tratamiento de lodos

function Sludge({ t, r, P }: { t: number; r: PlantResult; P: Pts }) {
  const id = useLensUid();
  const much = r.raw.turbidity >= 300 ? 'mucho' : r.raw.turbidity >= 50 ? 'medio' : 'poco';
  const dry = phase(t, 14);
  const chips: Chip[] = [
    { label: 'Lodo del día', value: much, tone: much === 'mucho' ? 'mid' : 'info' },
    { label: 'Agua de lavado de filtros', value: 'se recupera', tone: 'ok' },
    { label: 'Lecho de secado', value: dry < 0.5 ? 'lodo húmedo' : 'lodo seco', tone: 'info' },
  ];
  const sl = mix('#5e4329', '#b39a74', dry);
  return (
    <Lens uid={id} label="Lodos: el lodo del sedimentador se espesa en el fondo de un tanque; el agua que suelta vuelve a la planta y el lodo espeso se seca al sol." chips={chips}>
      <Tank x={30} y={60} w={160} h={160} color="#b9d7e2" t={t} amp={0.8} name="esp">
        <rect x="30" y={160} width="160" height="60" fill={`url(#${id}-sludge)`} />
        {P.slice(0, 26).map((p, k) => {
          const ph = phase(t, 5, p.a);
          return <circle key={k} cx={38 + p.b * 144} cy={80 + ph * 82} r={2 + p.c} fill="#5e4329" opacity={ph > 0.95 ? 0.2 : 0.9} />;
        })}
        {[0, 1, 2].map((k) => (
          <Stream key={k} d={`M${60 + k * 50} 156 V84`} t={t} kind="water" speed={14} w={1.4} />
        ))}
      </Tank>
      <rect x="104" y="50" width="12" height="160" fill="#55616a" />
      {[0, 1, 2, 3].map((k) => {
        const x = 46 + wrap(k * 34 + t * 10, 136);
        return <rect key={k} x={x} y="168" width="3" height="44" fill="#4f5961" />;
      })}
      <Arrow d="M192 74 H230" kind="water" />
      <Tag x={196} y={66} size="s">
        el agua vuelve al inicio
      </Tag>
      <path d="M110 222 V236 H260 V214" fill="none" stroke="#6b4a2b" strokeWidth="6" />
      {/* lecho de secado */}
      <rect x="250" y="160" width="210" height="60" fill={`url(#${id}-sand)`} />
      <rect x="250" y={186 - 10 * (1 - dry)} width="210" height={22 + 10 * (1 - dry)} fill={sl} />
      {dry > 0.4 &&
        [...Array(9)].map((_, k) => (
          <path key={k} d={`M${262 + k * 22} ${178 + 8 * (1 - dry)} l${4 - (k % 3) * 3} 10 l-3 10`} stroke="#5a4129" strokeWidth={1 + dry} fill="none" opacity={(dry - 0.4) / 0.6} />
        ))}
      <circle cx="430" cy="44" r="18" fill="#f7c948" />
      {[...Array(8)].map((_, k) => {
        const a = (k / 8) * 6.28 + t * 0.2;
        return <line key={k} x1={430 + Math.cos(a) * 24} y1={44 + Math.sin(a) * 24} x2={430 + Math.cos(a) * 32} y2={44 + Math.sin(a) * 32} stroke="#f7c948" strokeWidth="3" strokeLinecap="round" />;
      })}
      {dry < 0.7 &&
        [0, 1, 2].map((k) => {
          const ph = phase(t, 2.4, k / 3);
          return <path key={k} d={`M${300 + k * 50} ${170 - ph * 50} q6 -8 0 -16 q-6 -8 0 -16`} fill="none" stroke="#8fb9cc" strokeWidth="2" opacity={1 - ph} />;
        })}
      <Tag x={250} y={244} size="s">
        lecho de secado
      </Tag>
      <Tag x={30} y={244} size="s">
        espesador
      </Tag>
    </Lens>
  );
}

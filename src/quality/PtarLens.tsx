// «Con lupa» en la planta de aguas residuales: un corte de cada parte con el agua del color que le dan sus
// sólidos, lo que pasa adentro en movimiento (lluvia y aliviadero, basura en las rejas, arena y grasa, flocs que
// caen, burbujas y bacterias, luz UV, gradas y peces, lodo que se espesa, biogás, centrífuga) y una lupa con la
// escala de las partículas y los microbios. Al pie, los valores del juego (ptar.ts). Dibujos ilustrativos.

import { useMemo } from 'react';
import { RIVER_FISH_DO, type PtarInput, type PtarResult } from './ptar';
import type { PtarUnitId } from './ptarUnits';
import { Arrow, Bubble, Bug, Fat, Floc, Grain, INK, Lead, Lens, Lupa, Mol, Stream, Tag, Tank, Trash, bag, clamp01, mix, phase, sstColor, useLensUid, useTime, wave, wrap, type Chip } from './lensKit';

const es = (v: number, d = 0) => v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const mg = (v: number) => `${es(v, v < 10 ? 1 : 0)} mg/L`;
const ls = (m3d: number) => `${Math.round((m3d * 1000) / 86400).toLocaleString('es-CO')} L/s`;
const big = (v: number) => (v < 0.5 ? '0' : v < 1e6 ? Math.round(v).toLocaleString('es-CO') : `${es(v / 1e6, v < 1e7 ? 1 : 0)} millones`);
const LIQUOR = '#7a5634', DEAD = '#9b9481', FLOC = '#6b4a2b';
const lg = (v: number, per: number, max: number) => Math.round(Math.min(max, Math.max(0, per * Math.log10(v + 1))));

type Pts = { a: number; b: number; c: number; d: number }[];

export function PtarLens({ id, r, inp }: { id: PtarUnitId; r: PtarResult; inp: PtarInput }) {
  const t = useTime();
  const P = useMemo(() => bag(211, 90), []);
  switch (id) {
    case 'llegada':
      return <Arrival t={t} r={r} inp={inp} P={P} />;
    case 'rejas':
      return <Screens t={t} r={r} P={P} />;
    case 'desarenador':
      return <Grit t={t} r={r} P={P} />;
    case 'primario':
      return <Primary t={t} r={r} inp={inp} P={P} />;
    case 'reactor':
      return <Reactor t={t} r={r} inp={inp} P={P} />;
    case 'secundario':
      return <Secondary t={t} r={r} inp={inp} P={P} />;
    case 'uv':
      return <Uv t={t} r={r} inp={inp} P={P} />;
    case 'descarga':
      return <Outfall t={t} r={r} P={P} />;
    case 'espesador':
      return <Thickener t={t} r={r} P={P} />;
    case 'digestor':
      return <Digester t={t} r={r} P={P} />;
    case 'deshidratacion':
      return <Dewater t={t} r={r} P={P} />;
  }
}

// ------------------------------------------------------------------ 1. llegada y aliviadero

function Arrival({ t, r, inp, P }: { t: number; r: PtarResult; inp: PtarInput; P: Pts }) {
  const id = useLensUid();
  const fill = Math.min(1.18, r.Qin / r.Qcap);
  const x0 = 70, x1 = 300, top = 70, bot = 222;
  const crest = top + 40; // cresta del vertedero
  const lvl = bot - (bot - crest) * fill;
  const over = r.Qbypass > 0;
  const rain = inp.weather !== 'seco';
  const col = sstColor(r.raw.sst);
  const chips: Chip[] = [
    { label: 'Llega', value: ls(r.Qin) },
    { label: 'Cabe en la planta', value: ls(r.Qcap) },
    { label: 'Sin tratar al río', value: over ? `${es(r.bypassPct)} %` : 'nada', tone: over ? 'bad' : 'ok' },
  ];
  return (
    <Lens uid={id} label={over ? `Llegada: con ${inp.weather === 'aguacero' ? 'el aguacero' : 'la lluvia'} llega más agua de la que cabe; el ${es(r.bypassPct)} % pasa por encima del muro del aliviadero y se va al río sin tratar.` : 'Llegada: el agua no alcanza el muro del aliviadero y entra toda a la planta.'} chips={chips}>
      {rain && (
        <g>
          <ellipse cx="120" cy="22" rx="70" ry="18" fill="#9aa7b2" />
          <ellipse cx="190" cy="18" rx="60" ry="16" fill="#8794a0" />
          {P.slice(0, inp.weather === 'aguacero' ? 40 : 20).map((p, k) => {
            const ph = phase(t, 0.7, p.a);
            const x = 40 + p.b * 230;
            return <line key={k} x1={x} y1={32 + ph * 200} x2={x - 2} y2={42 + ph * 200} stroke="#5f86a8" strokeWidth="1.4" opacity="0.7" />;
          })}
        </g>
      )}
      {/* colector que llega */}
      <rect x="0" y={bot - 70} width={x0} height="54" fill={`url(#${id}-steel)`} stroke="#4f5961" />
      <rect x="0" y={bot - 64} width={x0} height="42" fill={col} />
      <Stream d={`M4 ${bot - 44} H${x0}`} t={t} speed={50} />
      <Tank x={x0} y={top} w={x1 - x0} h={bot - top} level={(bot - lvl) / (bot - top)} color={col} t={t} amp={over ? 2.4 : 1.4} name="lleg" open="right">
        {P.slice(40, 62).map((p, k) => {
          const x = wrap(p.a * 240 + t * 40, 240) + x0;
          return <circle key={k} cx={x} cy={lvl + 8 + p.b * (bot - lvl - 14)} r={1.6 + p.c} fill="#6a5034" opacity="0.8" />;
        })}
      </Tank>
      {/* salida a la planta (abajo) y muro del aliviadero (a la derecha) */}
      <rect x={x1} y={crest} width="12" height={bot - crest + 9} fill={`url(#${id}-conc)`} stroke="#8f897d" />
      <rect x={x1} y={bot - 34} width="70" height="26" fill={`url(#${id}-steel)`} stroke="#4f5961" />
      <rect x={x1 - 2} y={bot - 30} width="72" height="18" fill={col} />
      <Arrow d={`M${x1 + 30} ${bot - 21} h44`} kind="water" />
      <Tag x={x1 + 20} y={bot - 40} size="s">
        a la planta
      </Tag>
      {/* canal del aliviadero hacia el río */}
      <path d={`M${x1 + 12} ${crest} H${x1 + 90} L${x1 + 150} 200 H480`} fill="none" stroke="#b9b4aa" strokeWidth="10" />
      {over && (
        <g>
          <path d={`M${x1 + 4} ${lvl} Q${x1 + 24} ${lvl - 2} ${x1 + 30} ${crest + 6} L${x1 + 90} ${crest + 6} L${x1 + 150} 196 H480`} fill="none" stroke={col} strokeWidth={4 + 6 * clamp01(r.bypassPct / 40)} opacity="0.95" />
          <Stream d={`M${x1 + 30} ${crest + 2} H${x1 + 90} L${x1 + 150} 192 H476`} t={t} speed={60} kind="warn" />
          {P.slice(62, 70).map((p, k) => {
            const s = phase(t, 3, p.a);
            const x = x1 + 30 + s * 160;
            const y = x < x1 + 90 ? crest + 2 : Math.min(192, crest + 2 + (x - x1 - 90) * 1.4);
            return <Trash key={k} x={x} y={y} kind={k % 2 ? 'toallita' : 'bolsa'} a={p.c * 60} s={0.6} />;
          })}
        </g>
      )}
      <Tag x={476} y={224} anchor="end" size="s" color={over ? '#a3321d' : INK}>
        al río →
      </Tag>
      <Lead x1={330} y1={58} x2={x1 + 6} y2={crest} />
      <Tag x={332} y={54} size="s">
        muro del aliviadero
      </Tag>
      <Tag x={x0 + 8} y={top - 8} size="s">
        cámara de llegada
      </Tag>
      <Lupa cx={420} cy={106} r={46} fx={x1 + 6} fy={crest} label={over ? 'rebosa' : 'no alcanza el muro'}>
        <rect x="374" y="60" width="92" height="92" fill="#e8f1f5" />
        <rect x="414" y="104" width="12" height="48" fill="#b9b4aa" />
        <rect x="374" y={over ? 92 : 122} width="40" height={over ? 60 : 30} fill={col} />
        {over && <path d="M414 92 Q432 92 436 118 L446 152 H430 L424 120 Q420 104 414 104z" fill={col} />}
        {over && <Trash x={438 + 4 * Math.sin(t * 2)} y={120 + phase(t, 1.6) * 26} kind="toallita" a={40} s={0.7} />}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 2. rejas

function Screens({ t, r, P }: { t: number; r: PtarResult; P: Pts }) {
  const id = useLensUid();
  const n = lg(r.trashLD, 4, 14);
  const col = sstColor(r.raw.sst);
  const kinds = ['toallita', 'bolsa', 'botella', 'rama', 'toallita', 'hoja'] as const;
  const chips: Chip[] = [
    { label: 'Basura retenida', value: `${Math.round(r.trashLD).toLocaleString('es-CO')} L/día`, tone: r.trashLD > 200 ? 'mid' : 'info' },
    { label: 'Agua que pasa', value: ls(r.Qtreat) },
    { label: 'Abertura de la reja fina', value: 'menos de 6 mm' },
  ];
  // reja inclinada: del fondo (x 250, y 226) hacia arriba y atrás
  const bx = (y: number) => 250 + (226 - y) * 0.35;
  const rake = phase(t, 5);
  const ry = 226 - (rake < 0.6 ? rake / 0.6 : 1 - (rake - 0.6) / 0.4) * 190;
  return (
    <Lens uid={id} label="Rejas: el agua pasa entre las barras; las toallitas, los plásticos y los palos se quedan y un rastrillo los sube a un contenedor." chips={chips}>
      <Tank x={10} y={110} w={460} h={116} color={col} t={t} name="rej" open="both">
        <Stream d="M14 150 H240" t={t} speed={40} />
        <Stream d="M300 190 H466" t={t} speed={40} />
        {P.slice(0, 26).map((p, k) => (
          <circle key={k} cx={wrap(p.a * 480 + t * 44, 490) - 5} cy={120 + p.b * 100} r={1.5 + p.c} fill="#6a5034" opacity="0.8" />
        ))}
      </Tank>
      {/* barras */}
      {[...Array(5)].map((_, k) => (
        <line key={k} x1={250 + k * 1.6} y1={226} x2={bx(20) + k * 1.6} y2={20} stroke="#3f4a53" strokeWidth="2.6" />
      ))}
      {/* basura llegando y atajada */}
      {P.slice(26, 26 + n).map((p, k) => {
        const yStick = 130 + ((k * 23) % 90);
        const x = Math.min(bx(yStick) - 10, wrap(p.a * 300 + t * (24 + p.b * 10), 340) - 60);
        return <Trash key={k} x={x} y={yStick + 2 * Math.sin(t + k)} kind={kinds[k % kinds.length]} a={x > bx(yStick) - 22 ? 60 : p.c * 50} s={0.95} />;
      })}
      {/* rastrillo y banda */}
      <rect x={bx(ry) - 22} y={ry - 3} width="24" height="6" rx="3" fill="#e2b13c" stroke="#a37a10" strokeWidth="0.8" />
      {rake > 0.5 && rake < 0.62 && <Trash x={bx(ry) - 4} y={ry - 8} kind="toallita" a={-20} s={0.8} />}
      <rect x={bx(20) - 6} y="12" width="96" height="10" rx="4" fill="#3a3d40" />
      <rect x={bx(20) + 70} y="24" width="60" height="38" rx="3" fill="#3f7a4a" />
      <Tag x={bx(20) + 100} y={76} anchor="middle" size="s">
        contenedor
      </Tag>
      <Tag x={14} y={100} size="s">
        llega del colector
      </Tag>
      <Lupa cx={180} cy={56} r={44} fx={bx(160)} fy={160} label="la toallita no pasa">
        <rect x="136" y="12" width="88" height="88" fill={mix(col, '#ffffff', 0.25)} />
        {[0, 1, 2].map((k) => (
          <rect key={k} x={150 + k * 28} y="12" width="10" height="88" fill={`url(#${id}-steel)`} stroke="#4f5961" />
        ))}
        <Trash x={160} y={56} kind="toallita" a={90} s={2.2} />
        {P.slice(50, 58).map((p, k) => (
          <circle key={k} cx={wrap(p.a * 100 + t * 22, 100) + 130} cy={20 + p.b * 76} r="1.8" fill="#6a5034" />
        ))}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 3. desarenador y desengrasador

function Grit({ t, r, P }: { t: number; r: PtarResult; P: Pts }) {
  const id = useLensUid();
  const col = sstColor(r.raw.sst);
  const chips: Chip[] = [
    { label: 'Arena retirada', value: `${Math.round(r.sandLD).toLocaleString('es-CO')} L/día` },
    { label: 'Grasas y aceites', value: `${mg(r.raw.gya)} → ${mg(r.pre.gya)}` },
    { label: 'Grasa retirada', value: `${es(r.fogKgD)} kg/día` },
  ];
  // corte transversal: aire por el lado izquierdo, el agua gira; arena a la tolva, grasa a la zona tranquila
  const x0 = 30, x1 = 300, top = 50, bot = 210;
  const cx = 140, cy = 140;
  return (
    <Lens uid={id} label="Desarenador aireado y desengrasador: el aire hace girar el agua; la arena cae a la tolva y la grasa sube a la zona tranquila, de donde se retira." chips={chips}>
      <Tank x={x0} y={top} w={x1 - x0} h={bot - top} color={col} t={t} amp={2.2} name="des">
        {[0, 1].map((k) => (
          <ellipse key={k} cx={cx} cy={cy} rx={70 - k * 26} ry={52 - k * 20} fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="12 10" strokeDashoffset={t * 26} opacity="0.5" />
        ))}
        {P.slice(0, 18).map((p, k) => {
          const ph = phase(t, 1.8, p.a);
          return <Bubble key={k} x={x0 + 18 + p.b * 22 + 4 * Math.sin(t * 4 + k)} y={bot - 16 - ph * (bot - top - 30)} r={2 + ph * 2.5} />;
        })}
        {P.slice(18, 34).map((p, k) => {
          const ph = phase(t, 3.4, p.a);
          const a = p.b * 6.28 + ph * 4;
          const rr = (1 - ph) * 60;
          return <Grain key={k} x={cx + Math.cos(a) * rr - ph * 40} y={cy + Math.sin(a) * rr * 0.75 + ph * 50} r={3.2} seed={k} />;
        })}
        {P.slice(34, 46).map((p, k) => {
          const a = t * 1.2 + p.a * 6.28, rr = 30 + p.b * 40;
          return <circle key={k} cx={cx + Math.cos(a) * rr} cy={cy + Math.sin(a) * rr * 0.75} r="2" fill="#6a5034" />;
        })}
        {P.slice(46, 56).map((p, k) => {
          const ph = phase(t, 4, p.a);
          return <Fat key={k} x={x1 - 40 + p.b * 30} y={Math.max(top + 14, bot - 20 - ph * (bot - top))} r={4 + p.c * 2} />;
        })}
        <path d={`M${x0} ${bot} L${x0} ${bot - 30} L${x0 + 50} ${bot} Z`} fill={`url(#${id}-sand)`} />
      </Tank>
      <rect x={x1 - 58} y={top - 4} width="6" height={bot - top - 50} fill={`url(#${id}-conc)`} stroke="#8f897d" />
      <rect x={x0 + 14} y={bot - 10} width="34" height="6" rx="3" fill="#3a3d40" />
      <rect x={x1 - 52} y={top + 6} width="52" height="6" fill="#e4c457" opacity="0.9" />
      <Tag x={x0 + 54} y={bot - 2} size="s">
        tolva de arena
      </Tag>
      <Tag x={x1 - 4} y={top - 10} anchor="end" size="s">
        grasa →
      </Tag>
      <Tag x={x0} y={top - 10} size="s">
        aire
      </Tag>
      <Lupa cx={404} cy={124} r={64} fx={cx - 30} fy={cy + 30} label="la arena pesa; la hojuela no">
        <rect x="340" y="60" width="128" height="128" fill={mix(col, '#ffffff', 0.2)} />
        <Grain x={386} y={84 + phase(t, 2) * 80} r={13} seed={4} />
        <Arrow d="M386 110 v24" kind="sludge" w={2} />
        <path d={`M424 ${120 + 14 * Math.sin(t * 2)} q8 -6 18 0 q-6 6 -18 0z`} fill="#7a5a3a" />
        <Arrow d={`M450 ${122 + 14 * Math.sin(t * 2)} h14`} kind="ink" w={1.6} />
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 4. sedimentador primario

function Primary({ t, r, inp, P }: { t: number; r: PtarResult; inp: PtarInput; P: Pts }) {
  const id = useLensUid();
  const on = inp.primary;
  const f = r.primary.rSst;
  const col = sstColor(on ? r.prim.sst : r.pre.sst);
  const x0 = 24, x1 = 330, top = 54, bot = 212;
  const blanket = on ? 10 + 22 * clamp01(r.sludge.primaryKgD / Math.max(1, r.inp.lines) / 1400) : 0;
  const scr = x0 + 30 + wrap(t * 22, x1 - x0 - 60);
  const chips: Chip[] = on
    ? [
        { label: 'Tiempo del agua', value: `${es(r.primary.hrtH, 1)} h` },
        { label: 'Sólidos', value: `${mg(r.pre.sst)} → ${mg(r.prim.sst)}` },
        { label: 'DBO5', value: `${mg(r.pre.dbo)} → ${mg(r.prim.dbo)}` },
      ]
    : [{ label: 'Sedimentador primario', value: 'fuera de servicio', tone: 'mid' }];
  return (
    <Lens uid={id} label={on ? `Sedimentador primario (corte desde el centro hasta el borde): el agua avanza despacio y cerca del ${Math.round(f * 100)} % de los sólidos cae al fondo; el barredor lleva el lodo al centro.` : 'Sedimentador primario fuera de servicio: el agua pasa directo al reactor.'} chips={chips}>
      <Tank x={x0} y={top} w={x1 - x0} h={bot - top} color={col} t={t} amp={0.9} name="pri" open="right">
        {on && <path d={`M${x0} ${bot} L${x0} ${bot - blanket - 14} Q${x0 + 80} ${bot - blanket} ${x1} ${bot - blanket * 0.4} L${x1} ${bot} Z`} fill={`url(#${id}-sludge)`} />}
        {on && <Stream d={`M${x0 + 30} 100 H${x1 - 10}`} t={t} speed={14} />}
        {P.slice(0, 34).map((p, k) => {
          const sinks = on && p.d < f;
          const ph = phase(t, 6, p.a);
          const x = x0 + 26 + ph * (x1 - x0 - 30);
          const y0 = top + 30 + p.b * 60;
          const y = sinks ? Math.min(bot - blanket * (1 - (x - x0) / (x1 - x0)) - 6, y0 + ph * 160 * (0.6 + p.c)) : y0 + 4 * Math.sin(t + k);
          return <circle key={k} cx={x} cy={y} r={sinks ? 2.8 : 1.6} fill="#5d4329" opacity={sinks ? 0.95 : 0.7} />;
        })}
      </Tank>
      <rect x={x0 - 2} y={top - 10} width="24" height="70" fill={`url(#${id}-steel)`} stroke="#4f5961" opacity="0.9" />
      <rect x={x1} y={top + 12} width="12" height={bot - top - 3} fill={`url(#${id}-conc)`} stroke="#8f897d" />
      <rect x={x1 - 14} y={top + 4} width="26" height="10" fill="#b9c0c6" stroke="#6f7a82" />
      <Arrow d={`M${x1 + 14} ${top + 10} h40`} kind="water" />
      <Tag x={x1 + 16} y={top + 2} size="s">
        sale
      </Tag>
      {on && <rect x={scr} y={bot - 8} width="22" height="5" fill="#e2b13c" />}
      {on && <rect x={scr + 10} y={top - 14} width="2.5" height={bot - top + 8} fill="#6f7a82" />}
      <Tag x={x0 + 2} y={top - 16} size="s">
        centro (entra)
      </Tag>
      {on && (
        <Tag x={x0 + 40} y={bot - blanket - 18} size="s" color="#ffffff" halo={false}>
          lodo primario
        </Tag>
      )}
      {!on && (
        <Tag x={(x0 + x1) / 2} y={(top + bot) / 2} anchor="middle" size="l" color="#8a5a0a">
          fuera de servicio
        </Tag>
      )}
      <Lupa cx={412} cy={140} r={56} fx={x0 + 150} fy={bot - blanket - 4} label="lo que pesa, cae">
        <rect x="352" y="80" width="120" height="120" fill={mix(col, '#ffffff', 0.2)} />
        {on && <rect x="352" y="176" width="120" height="30" fill="#5e4329" />}
        {P.slice(60, 70).map((p, k) => {
          const ph = phase(t, 2.6, p.a);
          const heavy = on && p.b < Math.max(0.2, f);
          return heavy ? <Floc key={k} x={362 + p.c * 100} y={90 + ph * 86} r={4 + p.d * 3} seed={k} color="#5d4329" /> : <circle key={k} cx={362 + p.c * 100 + ph * 20} cy={110 + p.d * 50} r="1.8" fill="#6a5034" />;
        })}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 5. reactor de lodos activados

function Reactor({ t, r, inp, P }: { t: number; r: PtarResult; inp: PtarInput; P: Pts }) {
  const R = r.reactor;
  const nb = Math.round(Math.min(40, inp.air * 10));
  const col = R.washout ? mix(DEAD, '#a9d8ea', 0.2) : LIQUOR;
  const nitr = r.prim.nh4 > 0 ? clamp01(1 - r.sec.nh4 / r.prim.nh4) : 0;
  const eaten = R.washout ? 0 : clamp01(1 - R.S / Math.max(1, r.prim.dbo));
  const chips: Chip[] = R.washout
    ? [
        { label: 'Bacterias', value: 'se lavaron', tone: 'bad' },
        { label: 'Oxígeno', value: inp.air > 0 ? `${es(inp.air, 1)} mg/L` : 'sin aire', tone: inp.air > 0 ? 'info' : 'bad' },
        { label: 'Recirculación', value: inp.recirc ? 'encendida' : 'apagada', tone: inp.recirc ? 'info' : 'bad' },
      ]
    : [
        { label: 'Oxígeno', value: `${es(inp.air, 1)} mg/L`, tone: inp.air < 1 ? 'mid' : 'info' },
        { label: 'Lodo (licor mixto)', value: `${Math.round(R.mlss).toLocaleString('es-CO')} mg/L` },
        { label: 'Edad del lodo', value: `${es(R.srtD, R.srtD < 2 ? 1 : 0)} días` },
        { label: 'Amonio que sale', value: mg(r.sec.nh4), tone: r.sec.nh4 < 2 ? 'ok' : 'bad' },
      ];
  const x0 = 20, x1 = 230, top = 60, bot = 222;
  return (
    <Lens label={R.washout ? 'Reactor: no quedan bacterias (se lavaron); la materia orgánica sigue en el agua.' : `Reactor: los difusores soplan aire y los flóculos de bacterias se comen la materia orgánica${R.nitrify ? ' y pasan el amonio a nitrato' : ''}${R.bulking ? '; con poco oxígeno crecen bacterias en hilos' : ''}.`} chips={chips}>
      <Tank x={x0} y={top} w={x1 - x0} h={bot - top} color={col} t={t} amp={nb > 10 ? 2.8 : 1.4} name="rea">
        {P.slice(0, nb).map((p, k) => {
          const ph = phase(t, 1.4 + p.c * 0.6, p.a);
          return <Bubble key={k} x={x0 + 20 + (k % 6) * 34 + 4 * Math.sin(t * 5 + k)} y={bot - 12 - ph * (bot - top - 20)} r={1.6 + ph * 3} />;
        })}
        {!R.washout &&
          P.slice(40, 58).map((p, k) => {
            const a = t * 0.8 + p.a * 6.28, rr = 20 + p.b * 60;
            return <Floc key={k} x={(x0 + x1) / 2 + Math.cos(a) * rr} y={(top + bot) / 2 + 10 + Math.sin(a) * rr * 0.6} r={4 + p.c * 3} seed={k} color={FLOC} />;
          })}
        {inp.air <= 0 &&
          P.slice(58, 66).map((p, k) => {
            const ph = phase(t, 4, p.a);
            return <circle key={k} cx={x0 + 20 + p.b * 170} cy={bot - 10 - ph * 140} r="3" fill="#8c8a6e" opacity="0.7" />;
          })}
      </Tank>
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <rect key={k} x={x0 + 12 + k * 34} y={bot - 8} width="20" height="5" rx="2.5" fill="#3a3d40" />
      ))}
      <path d={`M${x0 + 4} ${top - 22} H${x1 - 4} M${x0 + 12} ${top - 22} V${bot - 6}`} fill="none" stroke="#2f6fa8" strokeWidth="4" />
      <Tag x={x0 + 18} y={top - 28} size="s">
        aire de los sopladores
      </Tag>
      {inp.recirc && <Arrow d={`M${x1 + 34} ${bot - 4} H${x1 + 4}`} kind="sludge" w={3} />}
      {inp.recirc && (
        <Tag x={x1 + 4} y={bot + 14} size="s">
          lodo de retorno
        </Tag>
      )}
      <Lupa cx={360} cy={120} r={100} fx={(x0 + x1) / 2} fy={(top + bot) / 2 + 10} label={R.washout ? 'agua sin bacterias' : 'un flóculo'} labelAt="above">
        <rect x="260" y="20" width="200" height="200" fill={R.washout ? mix(DEAD, '#ffffff', 0.55) : '#e8d9c4'} />
        {!R.washout && (
          <g>
            {R.bulking &&
              [0, 1, 2, 3, 4, 5].map((j) => (
                <path key={j} d={`M360 120 q${30 * Math.cos(j)} ${30 * Math.sin(j)} ${80 * Math.cos(j + 0.3)} ${80 * Math.sin(j + 0.3)}`} fill="none" stroke="#6b4a2b" strokeWidth="2" />
              ))}
            <Floc x={360} y={120} r={36} seed={9} color="#8a6a44" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => {
              const a = (j / 8) * 6.28 + t * 0.15;
              return <Bug key={j} x={360 + Math.cos(a) * 30} y={120 + Math.sin(a) * 26} a={(a * 180) / Math.PI + 90} len={14} color="#3f7f5a" t={t} />;
            })}
          </g>
        )}
        {P.slice(66, 80).map((p, k) => {
          const ph = phase(t, 3.2, p.a);
          const a = p.b * 6.28;
          const d = 95 - ph * 70;
          const gone = !R.washout && p.c < eaten && ph > 0.8;
          return gone ? null : <circle key={k} cx={360 + Math.cos(a) * d} cy={120 + Math.sin(a) * d} r="3.6" fill="#a37a4c" stroke="#7a5a36" strokeWidth="0.6" />;
        })}
        {P.slice(80, 88).map((p, k) => {
          const a = (k / 8) * 6.28 + 0.4 + 0.3 * p.a + t * 0.05, d = 62 + p.b * 22;
          const x = 360 + Math.cos(a) * d, y = 120 + Math.sin(a) * d;
          return p.c < nitr ? <Mol key={k} x={x} y={y} text="NO₃" color="#3fa565" r={9} /> : <Mol key={k} x={x} y={y} text="NH₄" color="#3b6fb6" r={9} />;
        })}
        {inp.air > 0 && <Mol x={276 + 10 * Math.sin(t)} y={58} text="O₂" color="#7f99ad" r={9} />}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 6. sedimentador secundario

function Secondary({ t, r, inp, P }: { t: number; r: PtarResult; inp: PtarInput; P: Pts }) {
  const id = useLensUid();
  const R = r.reactor;
  const col = sstColor(r.sec.sst);
  const x0 = 24, x1 = 330, top = 54, bot = 214;
  const blanket = R.washout ? 4 : Math.min(110, 16 + R.sv30 / 9 + (R.bulking ? 30 : 0));
  const chips: Chip[] = [
    { label: 'Carga superficial', value: `${es(r.secondary.sor)} m³/m²·día`, tone: r.secondary.sor > 40 ? 'mid' : 'info' },
    { label: 'Sólidos que se escapan', value: mg(r.sec.sst), tone: r.sec.sst > 70 ? 'bad' : r.sec.sst > 30 ? 'mid' : 'ok' },
    { label: 'IVL (probeta)', value: R.washout ? '—' : `${Math.round(R.svi)} mL/g`, tone: R.bulking ? 'bad' : 'ok' },
  ];
  return (
    <Lens uid={id} label={R.bulking ? 'Sedimentador secundario: el lodo con bacterias en hilos casi no baja y se escapa por el borde.' : 'Sedimentador secundario: los flóculos caen, el agua clara sale por el borde y el lodo vuelve al reactor o se purga.'} chips={chips}>
      <Tank x={x0} y={top} w={x1 - x0} h={bot - top} color={col} t={t} amp={0.7} name="sec" open="right">
        {!R.washout && <rect x={x0} y={bot - blanket} width={x1 - x0} height={blanket} fill={LIQUOR} opacity="0.85" />}
        {!R.washout &&
          P.slice(0, 26).map((p, k) => {
            const ph = phase(t, R.bulking ? 9 : 4.5, p.a);
            const yTop = top + 20 + p.b * 30;
            const float = R.bulking && p.c < 0.4;
            const y = float ? yTop + 6 * Math.sin(t + k) : Math.min(bot - blanket - 2, yTop + ph * (bot - blanket - yTop));
            const x = x0 + 30 + p.d * 270;
            return (
              <g key={k}>
                {R.bulking && <path d={`M${x} ${y} l14 -6 M${x} ${y} l-12 8`} stroke="#6b4a2b" strokeWidth="1" />}
                <Floc x={x} y={y} r={4 + p.c * 2} seed={k} color={FLOC} />
              </g>
            );
          })}
        <Stream d={`M${x0 + 40} ${top + 24} H${x1 - 6}`} t={t} speed={12} />
      </Tank>
      <rect x={x1} y={top + 12} width="12" height={bot - top - 3} fill={`url(#${id}-conc)`} stroke="#8f897d" />
      <rect x={x1 - 14} y={top + 4} width="26" height="10" fill="#b9c0c6" stroke="#6f7a82" />
      <Arrow d={`M${x1 + 14} ${top + 10} h44`} kind="water" />
      <Tag x={x1 + 16} y={top + 2} size="s">
        agua clara
      </Tag>
      <path d={`M${x0 + 4} ${bot + 4} V${bot + 26} H${x0 + 140}`} fill="none" stroke="#6b4a2b" strokeWidth="5" />
      {inp.recirc && <Arrow d={`M${x0 + 140} ${bot + 26} H${x0 + 180}`} kind="sludge" w={3} />}
      <Tag x={x0 + 186} y={bot + 30} size="s">
        {inp.recirc ? 'retorno al reactor y purga' : 'solo purga (sin retorno)'}
      </Tag>
      {!R.washout && (
        <Tag x={x0 + 8} y={bot - blanket + 14} size="s" color="#ffffff" halo={false}>
          manto de lodo
        </Tag>
      )}
      <Lupa cx={412} cy={128} r={56} fx={x0 + 160} fy={top + 70} label={R.washout ? 'no hay flóculos' : R.bulking ? 'hilos que no dejan bajar' : 'flóculo compacto'}>
        <rect x="352" y="68" width="120" height="120" fill={mix(col, '#ffffff', 0.2)} />
        {R.bulking &&
          [0, 1, 2, 3, 4].map((j) => (
            <path key={j} d={`M412 128 q${26 * Math.cos(j * 1.3)} ${26 * Math.sin(j * 1.3)} ${54 * Math.cos(j * 1.3 + 0.4)} ${54 * Math.sin(j * 1.3 + 0.4)}`} fill="none" stroke="#6b4a2b" strokeWidth="2" />
          ))}
        {!R.washout && <Floc x={412} y={R.bulking ? 128 : 100 + phase(t, 3) * 60} r={18} seed={21} color={FLOC} />}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 7. desinfección ultravioleta

function Uv({ t, r, inp, P }: { t: number; r: PtarResult; inp: PtarInput; P: Pts }) {
  const killed = inp.uv ? 1 - Math.pow(10, -r.logs.uv) : 0;
  const shade = clamp01(r.sec.sst / 80);
  const col = sstColor(r.sec.sst);
  const chips: Chip[] = [
    { label: 'Lámparas', value: inp.uv ? 'encendidas' : 'apagadas', tone: inp.uv ? 'ok' : 'bad' },
    { label: 'Coliformes (NMP/100 mL)', value: `${big(r.sec.coli)} → ${big(r.eff.coli)}` },
    { label: 'Inactivadas con la luz', value: inp.uv ? `${es(killed * 100, killed > 0.999 ? 2 : 1)} %` : '0 %', tone: inp.uv ? 'ok' : 'bad' },
  ];
  const lamps = [110, 190, 270];
  return (
    <Lens label={inp.uv ? 'Luz ultravioleta: daña el material genético de las bacterias y ya no se reproducen; los sólidos las esconden de la luz.' : 'Lámparas UV apagadas: las bacterias pasan vivas.'} chips={chips}>
      <Tank x={14} y={70} w={330} h={150} color={col} t={t} name="uv" open="both">
        {lamps.map((x) => (
          <g key={x}>
            {inp.uv && <rect x={x - 22} y="76" width="44" height="144" rx="20" fill="#c9a8ff" opacity={0.3 + 0.08 * Math.sin(t * 7 + x)} />}
            {inp.uv &&
              [...Array(6)].map((_, k) => {
                const a = (k / 6) * 6.28 + t * 0.4;
                return <path key={k} d={`M${x + Math.cos(a) * 10} ${148 + Math.sin(a) * 40} l${Math.cos(a) * 8} ${Math.sin(a) * 6} l${Math.cos(a + 0.6) * 4} ${Math.sin(a + 0.6) * 4} l${Math.cos(a) * 8} ${Math.sin(a) * 6}`} fill="none" stroke="#9b6bff" strokeWidth="1.4" opacity="0.8" />;
              })}
          </g>
        ))}
        {P.slice(0, 22).map((p, k) => {
          const x = wrap(p.a * 360 + t * 32, 370) + 4;
          const passed = lamps.filter((lx) => x > lx).length / lamps.length;
          const shielded = p.c < shade * 0.5;
          const dead = inp.uv && !shielded && p.d < killed * passed;
          return (
            <g key={k}>
              {shielded && <circle cx={x + 7} cy={86 + p.b * 126} r="9" fill="#7a5a36" opacity="0.85" />}
              <Bug x={x} y={86 + p.b * 126} a={p.c * 180} len={14} color="#7b3fb0" dead={dead} t={t} />
            </g>
          );
        })}
      </Tank>
      {lamps.map((x) => (
        <g key={x}>
          <rect x={x - 6} y="40" width="12" height="176" rx="6" fill={inp.uv ? '#d8c4ff' : '#9aa3ab'} stroke={inp.uv ? '#9b6bff' : '#6f7a82'} />
          <rect x={x - 14} y="30" width="28" height="12" rx="3" fill="#7e8a92" />
        </g>
      ))}
      <Arrow d="M2 150 H16" kind="water" />
      <Arrow d="M346 150 H362" kind="water" />
      <Tag x={110} y={24} anchor="middle" size="s">
        lámparas en tubos de cuarzo
      </Tag>
      <Lupa cx={418} cy={112} r={54} fx={190} fy={150} label="la luz daña el ADN">
        <rect x="364" y="58" width="108" height="108" fill="#efe8ff" />
        {[...Array(9)].map((_, k) => {
          const y = 76 + k * 8;
          const hit = inp.uv && k === 4 && phase(t, 2.5) > 0.4;
          return (
            <g key={k}>
              <path d={`M${400 + 10 * Math.sin(k * 0.8)} ${y} L${436 - 10 * Math.sin(k * 0.8)} ${y}`} stroke={hit ? '#c0392b' : '#3b6fb6'} strokeWidth="2.4" />
              <circle cx={400 + 10 * Math.sin(k * 0.8)} cy={y} r="2.6" fill="#7b3fb0" />
              <circle cx={436 - 10 * Math.sin(k * 0.8)} cy={y} r="2.6" fill="#3fa565" />
            </g>
          );
        })}
        {inp.uv && <path d={`M370 ${70 + phase(t, 2.5) * 40} l14 6 l-6 4 l14 6`} fill="none" stroke="#9b6bff" strokeWidth="2.4" />}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 8. descarga al río

function Outfall({ t, r, P }: { t: number; r: PtarResult; P: Pts }) {
  const id = useLensUid();
  const ok = r.river.fishOk;
  const effC = sstColor(r.eff.sst);
  const riverC = ok ? '#7fb3c8' : mix('#7fb3c8', '#8f8a6c', 0.7);
  const dox = Math.max(0, Math.min(9, r.river.minDO));
  const chips: Chip[] = [
    { label: 'Norma de vertimientos', value: r.complies ? 'cumple' : 'no cumple', tone: r.complies ? 'ok' : 'bad' },
    { label: 'Oxígeno más bajo del río', value: `${es(r.river.minDO, 1)} mg/L a ${es(r.river.xMinKm, 1)} km`, tone: r.river.minDO >= RIVER_FISH_DO ? 'ok' : 'bad' },
    { label: 'Peces', value: ok ? 'sí' : 'no', tone: ok ? 'ok' : 'bad' },
  ];
  return (
    <Lens uid={id} label={ok ? 'Descarga: el agua tratada toma aire en las gradas y el río conserva el oxígeno para sus peces.' : `Descarga: ${r.river.fishWhy.join(' y ')}; los peces no aguantan.`} chips={chips}>
      {[0, 1, 2, 3, 4].map((k) => (
        <rect key={k} x={20 + k * 40} y={70 + k * 24} width="44" height={184 - (70 + k * 24)} fill={`url(#${id}-conc)`} stroke="#8f897d" />
      ))}
      {[0, 1, 2, 3, 4].map((k) => (
        <path key={`w${k}`} d={`M${20 + k * 40} ${68 + k * 24} h40 q6 2 6 12`} fill="none" stroke={effC} strokeWidth="6" opacity="0.95" />
      ))}
      {P.slice(0, 24).map((p, k) => {
        const s = phase(t, 2.6, p.a);
        const step = Math.floor(s * 5), f = s * 5 - step;
        return <Bubble key={k} x={24 + step * 40 + f * 44} y={64 + step * 24 + (f > 0.85 ? (f - 0.85) * 120 : 0) - 4 * p.b} r={1.6 + p.c * 1.8} />;
      })}
      <path d={`${wave(180, 480, 186, t, 1.6, 0.05, 1.8)} L480 254 L180 254 Z`} fill={riverC} />
      <path d={`M220 190 Q300 ${196 + 4 * Math.sin(t)} 470 200`} fill="none" stroke={effC} strokeWidth="10" opacity="0.35" />
      {ok
        ? [0, 1, 2, 3].map((k) => {
            const x = 220 + wrap(k * 70 + t * 18, 250);
            const y = 214 + (k % 2) * 16;
            return <path key={k} d={`M${x} ${y} q9 -6 18 0 q-9 6 -18 0z M${x} ${y} l-6 -5 v10z`} fill="#4b6577" />;
          })
        : [0, 1].map((k) => <path key={k} d={`M${300 + k * 90} 190 q9 -4 18 0 q-9 4 -18 0z M${300 + k * 90} 190 l-6 -4 v8z`} fill="#ece6d4" stroke="#7d7860" strokeWidth="0.8" transform={`rotate(180 ${309 + k * 90} 190)`} />)}
      <Tag x={190} y={176} size="s">
        el río
      </Tag>
      <Tag x={20} y={58} size="s">
        agua tratada
      </Tag>
      <rect x="408" y="22" width="30" height="130" rx="8" fill="#ffffff" stroke="#9fb3c0" />
      <rect x="412" y={26 + 122 * (1 - dox / 9)} width="22" height={122 * (dox / 9)} rx="6" fill={r.river.minDO >= RIVER_FISH_DO ? '#3fa565' : '#c0462a'} />
      <line x1="402" y1={26 + 122 * (1 - RIVER_FISH_DO / 9)} x2="444" y2={26 + 122 * (1 - RIVER_FISH_DO / 9)} stroke="#c0462a" strokeWidth="1.6" strokeDasharray="4 2" />
      <Tag x={398} y={30 + 122 * (1 - RIVER_FISH_DO / 9)} anchor="end" size="s" color="#a3321d">
        {`peces: ${RIVER_FISH_DO}`}
      </Tag>
      <Tag x={423} y={168} anchor="middle" size="s">
        O₂ mín.
      </Tag>
      <Lupa cx={300} cy={74} r={50} fx={300} fy={214} label="oxígeno en el agua del río">
        <rect x="250" y="24" width="100" height="100" fill={riverC} />
        {P.slice(30, 30 + Math.round(dox * 1.6)).map((p, k) => (
          <Mol key={k} x={260 + p.a * 80} y={36 + p.b * 76 + 3 * Math.sin(t * 2 + k)} text="O₂" color="#5f86a8" r={7} />
        ))}
        {r.river.mix.nh3 > 0.025 && <Mol x={330} y={100} text="NH₃" color="#c0462a" r={10} />}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 9. espesador

function Thickener({ t, r, P }: { t: number; r: PtarResult; P: Pts }) {
  const id = useLensUid();
  const x0 = 30, x1 = 300, top = 60, bot = 214;
  // cuánto lodo llega (sin lodo, el espesador casi solo tiene agua)
  const load = clamp01((r.sludge.primaryKgD + r.sludge.wasKgD) / 1200);
  const chips: Chip[] = [
    { label: 'Lodo primario', value: `${es(r.sludge.primaryKgD)} kg/día` },
    { label: 'Lodo biológico', value: `${es(r.sludge.wasKgD)} kg/día` },
    { label: 'Al espesarse', value: 'ocupa menos', tone: 'ok' },
  ];
  return (
    <Lens uid={id} label="Espesador: el lodo se asienta despacio, unas varillas que giran le ayudan a soltar el agua y el agua clara vuelve al inicio de la planta." chips={chips}>
      <defs>
        <linearGradient id={`${id}-thk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9a787" stopOpacity="0.2" />
          <stop offset="0.45" stopColor="#7a5a36" stopOpacity="0.75" />
          <stop offset="1" stopColor="#3f2c1a" />
        </linearGradient>
      </defs>
      <Tank x={x0} y={top} w={x1 - x0} h={bot - top} color="#c9bfa8" t={t} amp={0.6} name="thk">
        <rect x={x0} y={top + 30 + (1 - load) * 90} width={x1 - x0} height={bot - top - 30 - (1 - load) * 90} fill={`url(#${id}-thk)`} opacity={0.25 + 0.75 * load} />
        {P.slice(0, Math.round(28 * load)).map((p, k) => {
          const ph = phase(t, 6, p.a);
          return <circle key={k} cx={x0 + 10 + p.b * (x1 - x0 - 20)} cy={top + 30 + ph * (bot - top - 40)} r={2 + p.c * 1.5} fill="#4f3822" />;
        })}
        {P.slice(28, 40).map((p, k) => {
          const ph = phase(t, 3, p.a);
          return <circle key={k} cx={x0 + 10 + p.b * (x1 - x0 - 20)} cy={bot - 10 - ph * (bot - top - 20)} r="1.8" fill="#e8f1f5" opacity={0.9 - ph * 0.5} />;
        })}
        {[0, 1, 2, 3, 4, 5].map((k) => {
          const x = x0 + wrap(k * 46 + t * 14, x1 - x0);
          return <rect key={k} x={x} y={top + 70} width="3" height={bot - top - 74} fill="#4f5961" />;
        })}
      </Tank>
      <Arrow d={`M${x1 + 4} ${top + 10} h44`} kind="water" />
      <Tag x={x1 + 6} y={top + 2} size="s">
        agua: vuelve al inicio
      </Tag>
      <Arrow d={`M${x1 - 30} ${bot + 4} h70`} kind="sludge" w={3} />
      <Tag x={x1 + 44} y={bot + 8} size="s">
        al digestor
      </Tag>
      <Lupa cx={404} cy={148} r={50} fx={x0 + 150} fy={bot - 30} label="el lodo se aprieta" labelAt="above">
        <rect x="350" y="94" width="108" height="108" fill="#d9ccb3" />
        {[...Array(12)].map((_, k) => {
          const squeeze = 0.5 + 0.5 * Math.sin(t * 1.2);
          const col = k % 4, row = Math.floor(k / 4);
          return <circle key={k} cx={372 + col * 20} cy={170 - row * (16 + 6 * squeeze)} r="8" fill="#5e4329" />;
        })}
        {[0, 1, 2].map((k) => {
          const ph = phase(t, 1.8, k / 3);
          return <circle key={k} cx={386 + k * 20} cy={160 - ph * 60} r="2.5" fill="#cfeaf5" />;
        })}
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 10. digestor y biogás

function Digester({ t, r, P }: { t: number; r: PtarResult; P: Pts }) {
  const id = useLensUid();
  const ng = lg(r.sludge.biogasM3D, 7, 26);
  const holder = 0.4 + 0.6 * clamp01(r.sludge.biogasM3D / 1200);
  const chips: Chip[] = [
    { label: 'Biogás', value: `${Math.round(r.sludge.biogasM3D).toLocaleString('es-CO')} m³/día` },
    { label: 'Electricidad', value: `${Math.round(r.sludge.kwhD).toLocaleString('es-CO')} kWh/día` },
    { label: 'Energía de la planta que cubre', value: `${es(r.energy.coverPct)} %`, tone: 'ok' },
  ];
  return (
    <Lens uid={id} label="Digestor: sin aire y a unos 35 °C, otras bacterias se comen parte del lodo y producen biogás (metano y gas carbónico) que mueve un motor-generador." chips={chips}>
      <path d="M40 236 L40 92 Q130 30 220 92 L220 236 Z" fill="#e9e4d8" stroke="#9c968a" strokeWidth="2" />
      <path d="M50 230 L50 100 Q130 46 210 100 L210 230 Z" fill="#6b5640" />
      <path d="M50 108 Q130 58 210 108 L210 118 Q130 70 50 118 Z" fill="#c9bfa8" opacity="0.6" />
      <path d={`M60 210 ${[...Array(8)].map((_, k) => `q10 ${k % 2 ? 10 : -10} 20 0`).join(' ')}`} fill="none" stroke="#e0623a" strokeWidth="2.4" opacity="0.9" />
      {P.slice(0, ng).map((p, k) => {
        const ph = phase(t, 2.6, p.a);
        return <Bubble key={k} x={70 + p.b * 120 + 4 * Math.sin(t * 3 + k)} y={220 - ph * 110} r={2 + ph * 2.6} />;
      })}
      <Tag x={130} y={150} anchor="middle" size="s" color="#ffffff" halo={false}>
        lodo a 35 °C, sin aire
      </Tag>
      <path d="M130 62 V40 H300 V80" fill="none" stroke="#d6b13a" strokeWidth="5" />
      <Stream d="M130 58 V40 H300 V78" t={t} kind="warn" speed={26} />
      <path d={`M250 ${150 - 60 * holder} Q300 ${150 - 90 * holder} 350 ${150 - 60 * holder} L350 150 L250 150 Z`} fill="#e7ecd9" stroke="#9aa37f" />
      <rect x="244" y="150" width="112" height="14" fill={`url(#${id}-conc)`} />
      <Tag x={300} y={180} anchor="middle" size="s">
        gasómetro
      </Tag>
      <path d="M356 138 H392" fill="none" stroke="#d6b13a" strokeWidth="5" />
      <rect x="392" y="112" width="70" height="56" rx="6" fill="#dfe3e6" stroke="#8f9aa2" />
      <g transform={`rotate(${t * 120} 412 140)`}>
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <rect key={k} x="409" y="124" width="6" height="8" fill="#55616a" transform={`rotate(${k * 60} 412 140)`} />
        ))}
        <circle cx="412" cy="140" r="9" fill="#7e8a92" />
      </g>
      <path d="M440 124 l-8 16 h8 l-6 16 l14 -20 h-8 l6 -12z" fill="#f2c230" stroke="#a37a10" strokeWidth="0.8" />
      <Tag x={427} y={184} anchor="middle" size="s">
        motor-generador
      </Tag>
      <rect x="330" y="10" width="6" height="30" fill="#8f969b" />
      <path d={`M333 ${10 - 8 * (0.8 + 0.2 * Math.sin(t * 11))} q-6 6 0 10 q6 -4 0 -10z`} fill="#ff8a2a" />
      <Tag x={342} y={20} size="s">
        tea
      </Tag>
      <Lupa cx={436} cy={50} r={36} fx={196} fy={176} label="arqueas: lodo → metano">
        <rect x="400" y="14" width="72" height="72" fill="#d9ccb3" />
        {[0, 1, 2, 3].map((k) => (
          <circle key={k} cx={418 + (k % 2) * 14} cy={42 + Math.floor(k / 2) * 14} r="6" fill="#c96f3a" stroke="#8a4a22" />
        ))}
        <Mol x={454 + 2 * Math.sin(t * 2)} y={36 - phase(t, 2) * 14} text="CH₄" color="#d6b13a" r={9} />
        <Mol x={452} y={70} text="CO₂" color="#8f969b" r={8} />
      </Lupa>
    </Lens>
  );
}

// ------------------------------------------------------------------ 11. deshidratación

function Dewater({ t, r, P }: { t: number; r: PtarResult; P: Pts }) {
  const id = useLensUid();
  const fill = clamp01(phase(t, 12) * 1.1);
  const chips: Chip[] = [
    { label: 'Biosólido', value: `${es(r.sludge.cakeTD, 1)} t/día` },
    { label: 'Sólidos de la torta', value: '22 %' },
    { label: 'El agua que sale', value: 'vuelve a la planta', tone: 'ok' },
  ];
  return (
    <Lens uid={id} label="Centrífuga: gira muy rápido; el lodo se pega a la pared y un tornillo lo saca como torta; el agua sale por el otro lado y vuelve a la planta." chips={chips}>
      <rect x="40" y="20" width="40" height="40" rx="5" fill="#e9e6df" stroke="#9c968a" />
      <Tag x={86} y={34} size="s">
        polímero
      </Tag>
      {[0, 1, 2].map((k) => {
        const ph = phase(t, 0.9, k / 3);
        return <path key={k} d={`M60 ${62 + ph * 18} q-2.5 4 0 6 q2.5 -2 0 -6z`} fill="#cfe9f3" stroke="#6f8fa3" strokeWidth="0.6" />;
      })}
      <path d="M40 92 L380 104 L380 168 L40 180 Z" fill={`url(#${id}-steel)`} stroke="#4f5961" strokeWidth="2" />
      <path d="M52 100 L368 110 L368 162 L52 172 Z" fill="#cfe9f3" />
      <path d="M52 100 L368 110 L368 120 L52 114 Z" fill="#5e4329" />
      <path d="M52 172 L368 162 L368 152 L52 158 Z" fill="#5e4329" />
      {[...Array(10)].map((_, k) => {
        const x = 70 + wrap(k * 30 - t * 40, 300);
        return <path key={k} d={`M${x} 118 q10 18 0 36`} fill="none" stroke="#3a3d40" strokeWidth="3" />;
      })}
      <line x1="52" y1="136" x2="368" y2="136" stroke="#3a3d40" strokeWidth="4" />
      <Arrow d="M40 136 H8" kind="sludge" w={3} />
      <Arrow d="M380 136 H420" kind="water" />
      <Tag x={424} y={140} size="s">
        agua
      </Tag>
      <Tag x={4} y={124} size="s">
        torta
      </Tag>
      {P.slice(0, 5).map((p, k) => {
        const ph = phase(t, 2.2, p.a);
        return <rect key={k} x={10 + ph * 6} y={150 + ph * 50} width="12" height="8" rx="3" fill="#4a3624" />;
      })}
      <rect x="0" y="206" width="120" height="8" rx="4" fill="#3a3d40" />
      <path d="M130 196 H250 L262 214 H130 Z" fill="#c9a23a" stroke="#8a6f22" />
      <rect x="132" y={214 - 18 * fill} width="118" height={18 * fill} fill="#4a3624" opacity="0.95" />
      <rect x="250" y="190" width="40" height="30" rx="4" fill="#c9a23a" stroke="#8a6f22" />
      {[150, 230, 272].map((x) => (
        <circle key={x} cx={x} cy="226" r="9" fill="#2f3337" />
      ))}
      <Tag x={190} y={186} anchor="middle" size="s">
        biosólido
      </Tag>
      <Lupa cx={418} cy={60} r={50} fx={200} fy={112} label="el polímero junta el lodo">
        <rect x="368" y="10" width="100" height="100" fill="#d9ccb3" />
        {[0, 1, 2, 3, 4].map((k) => (
          <circle key={k} cx={392 + (k % 3) * 22} cy={44 + Math.floor(k / 3) * 26} r="9" fill="#5e4329" />
        ))}
        <path d="M384 44 Q404 30 414 44 T446 44 M392 70 Q412 58 426 70" fill="none" stroke="#2f6fa8" strokeWidth="2" />
        {[0, 1].map((k) => (
          <circle key={k} cx={440 + k * 8} cy={86 - phase(t, 1.5, k / 2) * 40} r="2.6" fill="#cfeaf5" stroke="#6f8fa3" strokeWidth="0.5" />
        ))}
      </Lupa>
    </Lens>
  );
}

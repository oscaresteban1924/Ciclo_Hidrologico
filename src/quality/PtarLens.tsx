// «Con lupa» en la planta de aguas residuales: lo que pasa dentro de cada parte, a escala de las partículas y
// las bacterias. Dibujos animados ilustrativos; donde dependen del juego (aliviadero, basura, remociones, aire,
// lavado de las bacterias, abultamiento, luz UV, peces, biogás), usan los valores calculados.

import { useMemo } from 'react';
import { Frame, useTime } from './ProcessLens';
import type { PtarInput, PtarResult } from './ptar';
import type { PtarUnitId } from './ptarUnits';
import { rng } from './three/kit';

const W = 240;
const ORG = '#7a5a3a', FLOC = '#6b4a2b', BUG = '#3f7f5a', NH4 = '#3b6fb6', NO3 = '#3fa565', FAT = '#e2c25a', SAND = '#d8b878', SEW = '#c9c2ae';
const wrap = (v: number, m: number) => ((v % m) + m) % m;
const lg = (v: number, per: number, max: number) => Math.round(Math.min(max, Math.max(0, per * Math.log10(v + 1))));

export function PtarLens({ id, r, inp }: { id: PtarUnitId; r: PtarResult; inp: PtarInput }) {
  const t = useTime();
  const R = useMemo(() => {
    const g = rng(211);
    return [...Array(70)].map(() => ({ a: g(), b: g(), c: g(), d: g() }));
  }, []);
  const R0 = r.reactor;

  switch (id) {
    case 'llegada': {
      // nivel del agua frente al vertedero del aliviadero: lo supera cuando llega más de lo que cabe
      const fill = Math.min(1.25, r.Qin / r.Qcap);
      const y = 128 - fill * 70;
      const over = r.Qbypass > 0;
      return (
        <Frame label={over ? 'Llegada: el agua supera el muro del aliviadero y una parte se va al río sin tratar' : 'Llegada: el agua no alcanza el muro del aliviadero y entra toda a la planta'}>
          <rect x="0" y={y} width="150" height={150 - y} fill={SEW} />
          <rect x="150" y="58" width="10" height="92" fill="#8f8a80" />
          <text x="104" y="30" className="q3-lens-t">muro del aliviadero</text>
          <path d="M155 34 v18" stroke="#17324d" strokeWidth="1" />
          {over && <path d={`M150 ${y} q14 2 22 26 l0 72 l-8 0 l0 -66 q-4 -20 -14 -24z`} fill={SEW} opacity="0.9" />}
          {over && <text x="176" y="140" className="q3-lens-t">al río</text>}
          <path d={`M0 ${y + 18} l40 0`} stroke="#fff" strokeWidth="2" opacity="0.6" />
          {R.slice(0, 14).map((p, k) => (
            <circle key={k} cx={wrap(p.a * 150 + t * 30, 150)} cy={y + 8 + p.b * (138 - y)} r={1.8} fill={ORG} />
          ))}
          <path d="M20 140 l84 0 l-6 -4 m6 4 l-6 4" stroke="#17324d" strokeWidth="1.4" fill="none" />
          <text x="20" y="134" className="q3-lens-t">a la planta</text>
          <text x="10" y="20" className="q3-lens-t">llega: {Math.round((r.Qin * 1000) / 86400)} L/s · cabe: {Math.round((r.Qcap * 1000) / 86400)} L/s</text>
        </Frame>
      );
    }
    case 'rejas': {
      const n = lg(r.trashLD, 5, 16);
      return (
        <Frame label="Rejas: el agua pasa entre las barras; toallitas, plásticos y palos se quedan">
          <rect x="0" y="30" width={W} height="120" fill={SEW} opacity="0.75" />
          {[...Array(9)].map((_, k) => (
            <rect key={k} x={150} y={24 + k * 14} width={6} height={9} fill="#5c6670" rx="2" />
          ))}
          {R.slice(0, 16).map((p, k) => (
            <circle key={k} cx={wrap(p.a * 260 + t * 40, 260) - 10} cy={36 + p.b * 108} r={1.5} fill={ORG} />
          ))}
          {R.slice(16, 16 + n).map((p, k) => {
            const x = Math.min(140 - p.d * 10, wrap(p.a * 170 + t * 22, 200) - 40);
            const kind = k % 3;
            return kind === 0 ? (
              <rect key={k} x={x - 9} y={34 + p.b * 100} width={18} height={11} rx="2" fill="#f2efe6" stroke="#b7b2a6" strokeWidth="0.6" transform={`rotate(${p.c * 40 - 20} ${x} ${40 + p.b * 100})`} />
            ) : kind === 1 ? (
              <path key={k} d={`M${x - 10} ${40 + p.b * 100} q10 -8 20 0 q-10 6 -20 0z`} fill="#4f86c6" opacity="0.8" />
            ) : (
              <rect key={k} x={x - 12} y={40 + p.b * 100} width={24} height={3.4} rx="1.5" fill="#6b4a32" transform={`rotate(${p.c * 30 - 15} ${x} ${40 + p.b * 100})`} />
            );
          })}
          <text x="168" y="20" className="q3-lens-t">reja</text>
          <text x="8" y="20" className="q3-lens-t">{Math.round(r.trashLD).toLocaleString('es-CO')} L de basura al día</text>
        </Frame>
      );
    }
    case 'desarenador':
      return (
        <Frame label="Desarenador y desengrasador: la arena cae al fondo, la grasa sube y la materia orgánica sigue con el agua">
          <rect x="0" y="0" width={W} height="150" fill={SEW} opacity="0.6" />
          <rect x="0" y="130" width={W} height="20" fill={SAND} />
          {R.slice(0, 16).map((p, k) => {
            const ph = wrap(t * 0.3 + p.a, 1);
            return <circle key={k} cx={10 + p.b * 60 + ph * 150} cy={Math.min(128, 30 + p.c * 30 + ph * ph * 100)} r={2.8} fill="#b8955a" stroke="#8c6d3a" strokeWidth="0.5" />;
          })}
          {R.slice(16, 26).map((p, k) => {
            const ph = wrap(t * 0.25 + p.a, 1);
            return <ellipse key={k} cx={10 + p.b * 80 + ph * 140} cy={Math.max(10, 110 - p.c * 40 - ph * 110)} rx={5} ry={3} fill={FAT} opacity="0.9" />;
          })}
          {R.slice(26, 44).map((p, k) => (
            <circle key={k} cx={wrap(p.a * 260 + t * 36, 260) - 10} cy={30 + p.b * 90} r={1.4} fill={ORG} />
          ))}
          <text x="8" y="146" className="q3-lens-t">arena</text>
          <text x="170" y="14" className="q3-lens-t">grasa arriba</text>
        </Frame>
      );
    case 'primario': {
      const f = r.primary.rSst;
      return (
        <Frame label={inp.primary ? `Sedimentador primario: cae al fondo cerca del ${Math.round(f * 100)} % de los sólidos` : 'Sedimentador primario fuera de servicio'}>
          <rect x="0" y="0" width={W} height="150" fill={SEW} opacity={inp.primary ? 0.35 : 0.7} />
          <path d={`M0 ${150 - 22 * f} Q120 ${140 - 22 * f} 240 ${150 - 22 * f} L240 150 L0 150z`} fill={FLOC} opacity="0.85" />
          {R.slice(0, 40).map((p, k) => {
            const sinks = p.d < f;
            const ph = wrap(t * 0.12 + p.a, 1);
            const x = 8 + p.b * 224;
            const y = sinks ? 12 + ph * (130 - 22 * f) : 14 + p.c * 110 + 4 * Math.sin(t + k);
            return <circle key={k} cx={x} cy={y} r={sinks ? 2.6 : 1.4} fill={ORG} />;
          })}
          <text x="8" y="14" className="q3-lens-t">{inp.primary ? `${Math.round(r.primary.hrtH * 10) / 10} h quieta` : 'fuera de servicio'}</text>
          <text x="8" y="146" className="q3-lens-t" fill="#fff">lodo primario</text>
        </Frame>
      );
    }
    case 'reactor': {
      const nb = Math.round(Math.min(26, inp.air * 7));
      const flocs = R0.washout ? 0 : 6;
      const eaten = R0.washout ? 0 : Math.min(1, 1 - R0.S / Math.max(1, r.prim.dbo));
      const nitr = r.prim.nh4 > 0 ? Math.max(0, 1 - r.sec.nh4 / r.prim.nh4) : 0;
      return (
        <Frame label={R0.washout ? 'Reactor: no quedan bacterias; la materia orgánica sigue en el agua' : `Reactor: los flóculos de bacterias se comen la materia orgánica${R0.nitrify ? ' y pasan el amonio a nitrato' : ''}${R0.bulking ? '; con poco aire crecen bacterias en hilos' : ''}`}>
          <rect x="0" y="0" width={W} height="150" fill={R0.washout ? SEW : '#b79a76'} opacity={R0.washout ? 0.7 : 0.55} />
          {[...Array(nb)].map((_, k) => {
            const ph = wrap(t * 0.5 + k / Math.max(1, nb), 1);
            return <circle key={`b${k}`} cx={14 + ((k * 53) % 212)} cy={146 - ph * 140} r={2.6} fill="#fff" opacity="0.75" />;
          })}
          {[...Array(flocs)].map((_, k) => {
            const cx = 30 + k * 36 + 6 * Math.sin(t * 0.5 + k), cy = 50 + (k % 2) * 46 + 5 * Math.cos(t * 0.4 + k);
            return (
              <g key={`f${k}`}>
                {R0.bulking && [0, 1, 2, 3].map((j) => <path key={j} d={`M${cx} ${cy} l${22 * Math.cos(j * 1.6 + k)} ${22 * Math.sin(j * 1.6 + k)}`} stroke={FLOC} strokeWidth="1.2" />)}
                <circle cx={cx} cy={cy} r={11} fill={FLOC} opacity="0.85" />
                {[0, 1, 2, 3, 4].map((j) => (
                  <ellipse key={j} cx={cx + 6 * Math.cos(j * 1.3)} cy={cy + 6 * Math.sin(j * 1.3)} rx={2.6} ry={1.3} fill={BUG} transform={`rotate(${j * 40} ${cx + 6 * Math.cos(j * 1.3)} ${cy + 6 * Math.sin(j * 1.3)})`} />
                ))}
              </g>
            );
          })}
          {R.slice(0, 26).map((p, k) => (p.d < 1 - eaten * 0.95 ? <circle key={`o${k}`} cx={8 + p.a * 224} cy={10 + p.b * 130} r={2} fill={ORG} /> : null))}
          {R.slice(26, 40).map((p, k) => (
            <text key={`n${k}`} x={8 + p.a * 214} y={14 + p.b * 128} fontSize="7" fontWeight="700" fill={p.d < nitr ? NO3 : NH4}>
              {p.d < nitr ? 'NO₃' : 'NH₄'}
            </text>
          ))}
          <text x="8" y="146" className="q3-lens-t">{inp.air > 0 ? `aire: ${inp.air.toLocaleString('es-CO', { maximumFractionDigits: 1 })} mg/L de oxígeno` : 'sin aire'}</text>
        </Frame>
      );
    }
    case 'secundario': {
      const turb = Math.min(1, Math.sqrt(r.sec.sst / 120));
      const blanket = R0.washout ? 4 : Math.min(70, 10 + R0.sv30 / 14);
      return (
        <Frame label={R0.bulking ? 'Sedimentador secundario: el lodo con hilos no se asienta y se escapa' : 'Sedimentador secundario: los flóculos caen y el agua clara sale por arriba'}>
          <rect x="0" y="0" width={W} height="150" fill="#d9edf5" />
          <rect x="0" y="0" width={W} height={150 - blanket} fill={SEW} opacity={0.15 + 0.6 * turb} />
          <rect x="0" y={150 - blanket} width={W} height={blanket} fill={FLOC} opacity="0.8" />
          {R.slice(0, 22).map((p, k) => {
            const ph = wrap(t * (R0.bulking ? 0.04 : 0.16) + p.a, 1);
            const y = 10 + ph * (140 - blanket);
            return <circle key={k} cx={10 + p.b * 220} cy={R0.bulking && p.d < 0.4 ? 20 + p.c * 30 : y} r={3.5} fill={FLOC} />;
          })}
          <path d="M200 6 l30 0" stroke="#3d6e8f" strokeWidth="2" />
          <text x="150" y="16" className="q3-lens-t">agua clara</text>
          <text x="8" y={146} className="q3-lens-t" fill="#fff">manto de lodo → recirculación y purga</text>
        </Frame>
      );
    }
    case 'uv': {
      const killed = inp.uv ? 1 - Math.pow(10, -r.logs.uv) : 0;
      const shade = Math.min(1, r.sec.sst / 80);
      return (
        <Frame label={inp.uv ? 'Luz ultravioleta: daña el material genético de las bacterias; los sólidos las esconden de la luz' : 'Lámparas UV apagadas: las bacterias pasan vivas'}>
          <rect x="0" y="0" width={W} height="150" fill="#d9edf5" />
          {[40, 110, 180].map((x) => (
            <g key={x}>
              <rect x={x - 5} y="10" width="10" height="130" rx="5" fill={inp.uv ? '#b98cff' : '#7d8794'} opacity={inp.uv ? 0.95 : 0.6} />
              {inp.uv && <rect x={x - 14} y="10" width="28" height="130" rx="12" fill="#c9a8ff" opacity={0.25 + 0.1 * Math.sin(t * 6)} />}
            </g>
          ))}
          {R.slice(0, 24).map((p, k) => {
            const x = wrap(p.a * 260 + t * 26, 260) - 10;
            const dead = p.d < killed && x > 60;
            return (
              <g key={k} transform={`translate(${x} ${14 + p.b * 122}) rotate(${p.c * 180})`}>
                <rect x="-5" y="-2.2" width="10" height="4.4" rx="2.2" fill={dead ? '#9aa3ab' : '#7a3fa0'} />
                {dead && <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke="#c9372c" strokeWidth="1.2" />}
              </g>
            );
          })}
          {R.slice(40, 40 + Math.round(shade * 16)).map((p, k) => (
            <circle key={`s${k}`} cx={wrap(p.a * 260 + t * 26, 260) - 10} cy={14 + p.b * 122} r={4} fill={FLOC} opacity="0.7" />
          ))}
          <text x="8" y="146" className="q3-lens-t">{inp.uv ? `${(killed * 100).toLocaleString('es-CO', { maximumFractionDigits: killed > 0.999 ? 2 : 1 })} % inactivadas` : 'lámparas apagadas'}</text>
        </Frame>
      );
    }
    case 'descarga': {
      const fish = r.river.fishOk ? 5 : 0;
      return (
        <Frame label={r.river.fishOk ? 'Descarga: el agua toma aire en las gradas y el río conserva sus peces' : `Descarga: ${r.river.fishWhy.join(' y ')}: los peces no aguantan`}>
          <rect x="0" y="0" width={W} height="150" fill="#e8f1f5" />
          {[0, 1, 2, 3].map((k) => (
            <rect key={k} x={10 + k * 24} y={40 + k * 18} width="26" height="110" fill="#bdb8ad" />
          ))}
          {R.slice(0, 18).map((p, k) => {
            const ph = wrap(t * 0.6 + p.a, 1);
            return <circle key={k} cx={20 + ph * 96} cy={36 + ph * 74 + 3 * Math.sin(t * 8 + k)} r={1.8} fill="#fff" stroke="#8fb9cc" strokeWidth="0.6" />;
          })}
          <rect x="0" y="118" width={W} height="32" fill={r.river.fishOk ? '#7fb3c8' : '#8f8a6c'} />
          {[...Array(fish)].map((_, k) => {
            const x = wrap(140 + k * 30 + t * 14, 130) + 110;
            return <path key={k} d={`M${x} ${130 + (k % 2) * 8} q8 -5 16 0 q-8 5 -16 0z M${x} ${130 + (k % 2) * 8} l-5 -4 l0 8z`} fill="#4b6577" />;
          })}
          <text x="130" y="112" className="q3-lens-t">río: oxígeno mínimo {r.river.minDO.toLocaleString('es-CO', { maximumFractionDigits: 1 })} mg/L</text>
        </Frame>
      );
    }
    case 'espesador':
      return (
        <Frame label="Espesador: el lodo se asienta despacio y el agua que suelta sale por arriba">
          <rect x="0" y="0" width={W} height="150" fill="#cfc4ae" />
          <rect x="0" y="70" width={W} height="80" fill={FLOC} opacity="0.85" />
          {[0, 1, 2, 3, 4, 5].map((k) => {
            const x = wrap(k * 40 + t * 12, 240);
            return <rect key={k} x={x} y="76" width="3" height="70" fill="#5c6670" />;
          })}
          {R.slice(0, 14).map((p, k) => {
            const ph = wrap(t * 0.35 + p.a, 1);
            return <circle key={k} cx={10 + p.b * 220} cy={140 - ph * 128} r={1.8} fill="#e8f1f5" />;
          })}
          <text x="8" y="14" className="q3-lens-t">el agua sube y vuelve a la planta</text>
          <text x="8" y="146" className="q3-lens-t" fill="#fff">lodo espeso</text>
        </Frame>
      );
    case 'digestor': {
      const ng = lg(r.sludge.biogasM3D, 4, 16);
      return (
        <Frame label="Digestor: sin aire, otras bacterias se comen el lodo y sueltan biogás">
          <path d="M20 150 L20 46 Q120 -6 220 46 L220 150z" fill="#6b5640" />
          <path d="M20 46 Q120 -6 220 46 L220 58 Q120 8 20 58z" fill="#9a8a72" />
          {R.slice(0, ng).map((p, k) => {
            const ph = wrap(t * 0.4 + p.a, 1);
            return <circle key={k} cx={40 + p.b * 160} cy={140 - ph * 86} r={2.5 + ph * 2} fill="#f3e9d2" opacity={0.85 - ph * 0.4} />;
          })}
          {R.slice(20, 34).map((p, k) => (
            <ellipse key={`a${k}`} cx={34 + p.a * 172} cy={70 + p.b * 70} rx={3.2} ry={1.4} fill="#c96f3a" transform={`rotate(${p.c * 180 + t * 20} ${34 + p.a * 172} ${70 + p.b * 70})`} />
          ))}
          <text x="76" y="40" className="q3-lens-t" fill="#fff">metano + gas carbónico</text>
          <text x="30" y="146" className="q3-lens-t" fill="#fff">35 °C · sin aire · unas 3 semanas</text>
        </Frame>
      );
    }
    case 'deshidratacion':
      return (
        <Frame label="Centrífuga: gira muy rápido; el lodo se pega a la pared y sale como torta, el agua sale por el otro lado">
          <rect x="0" y="0" width={W} height="150" fill="#ece8df" />
          <g transform="translate(120 62)">
            <ellipse cx="0" cy="0" rx="92" ry="34" fill="#9aa3ab" />
            <ellipse cx="0" cy="0" rx="84" ry="27" fill={FLOC} />
            <ellipse cx="0" cy="0" rx="62" ry="15" fill="#d9edf5" />
            {[0, 1, 2, 3, 4, 5].map((k) => {
              const a = t * 8 + k;
              return <circle key={k} cx={74 * Math.cos(a)} cy={22 * Math.sin(a)} r="3" fill="#4a3624" />;
            })}
          </g>
          {R.slice(0, 6).map((p, k) => {
            const ph = wrap(t * 0.5 + p.a, 1);
            return <rect key={k} x={36 + p.b * 20} y={100 + ph * 40} width="9" height="6" rx="2" fill="#5a4129" />;
          })}
          <text x="10" y="146" className="q3-lens-t">torta (biosólido)</text>
          <text x="170" y="146" className="q3-lens-t">agua</text>
        </Frame>
      );
  }
}

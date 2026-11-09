// Vista de detalle «dentro de una nube»: el aire húmedo sube y se enfría, el vapor se condensa
// sobre núcleos diminutos, las gotitas crecen al chocar (o crecen cristales de hielo) y caen.

import { BigArrow, Drop, INK, Ice, Vapor, ease, lerp, ramp, seeded } from './common';

const BASE = 262;
const TOP = 54;
const GROUND = 372;
const THERMO_X = 34;

interface Droplet {
  x: number;
  y: number;
  r: number;
  born: number;
  /** Momento en que se une a otra gota (coalescencia), si ocurre. */
  merge: number;
  big: boolean;
}

const DROPLETS: Droplet[] = (() => {
  const r = seeded(29);
  const out: Droplet[] = [];
  let tries = 0;
  // dentro del cuerpo de la nube (una elipse aproximada)
  while (out.length < 60 && tries++ < 3000) {
    const x = 120 + r() * 440;
    const y = 128 + r() * 124;
    if (((x - 340) / 225) ** 2 + ((y - 196) / 64) ** 2 > 1) continue;
    out.push({ x, y, r: 2.6 + r() * 1.6, born: 4.8 + r() * 4.5, merge: 10.5 + r() * 4.5, big: out.length % 9 === 0 });
  }
  return out;
})();

const NUCLEI: [number, number][] = (() => {
  const r = seeded(31);
  return Array.from({ length: 26 }, () => [110 + r() * 470, BASE + 20 + r() * (GROUND - BASE - 40)] as [number, number]);
})();

export function CloudArt({ t, clock, variant }: { t: number; clock: number; variant: string }) {
  const cold = variant === 'fria';
  const cloud = ease(ramp(t, 4.6, 9.5));
  const grow = ease(ramp(t, 10, 15));
  const fall = ramp(t, 15.6, 16.4);
  const freezeY = 170;
  return (
    <>
      {/* cielo: más frío arriba */}
      <defs>
        <linearGradient id="cl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9dcec" />
          <stop offset="1" stopColor="#eef5f9" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="640" height={GROUND} fill="url(#cl-sky)" />
      <rect x="0" y={GROUND} width="640" height={400 - GROUND} fill="#7fa65a" />

      {/* termómetro: la temperatura baja con la altura */}
      <g>
        <rect x={THERMO_X - 7} y={TOP - 4} width="14" height={GROUND - TOP - 10} rx="7" fill="#fff" stroke={INK} strokeWidth="1.6" />
        <rect x={THERMO_X - 3.5} y={lerp(GROUND - 30, TOP + 30, 0.25)} width="7" height={GROUND - 26 - lerp(GROUND - 30, TOP + 30, 0.25)} rx="3.5" fill="#d8504a" />
        <circle cx={THERMO_X} cy={GROUND - 12} r="11" fill="#d8504a" stroke={INK} strokeWidth="1.6" />
        <text x={THERMO_X + 16} y={TOP + 10} className="d-label">
          más frío
        </text>
        <text x={THERMO_X + 16} y={GROUND - 30} className="d-label">
          más cálido
        </text>
      </g>

      {/* cuerpo de la nube: aparece a medida que hay gotitas */}
      <g opacity={0.25 + cloud * 0.55}>
        <path d={`M90 ${BASE} C80 200 120 150 170 150 C190 96 260 80 300 110 C330 60 420 58 450 104 C500 90 560 120 560 170 C610 180 620 240 590 ${BASE} Z`} fill="#ffffff" opacity={cloud} />
      </g>

      {/* nivel de condensación (base de la nube) */}
      <path d={`M70 ${BASE} H630`} stroke={INK} strokeWidth="1.5" strokeDasharray="8 6" opacity="0.7" />
      <text x="120" y={BASE - 8} className="d-label" opacity="0.85">
        punto de rocío: empieza la condensación
      </text>
      {cold && (
        <>
          <path d={`M70 ${freezeY} H630`} stroke="#5b8fc0" strokeWidth="1.5" strokeDasharray="3 5" />
          <text x="120" y={freezeY - 8} className="d-label" fill="#2f5f8f">
            0 °C: arriba se forma hielo
          </text>
        </>
      )}
      {/* núcleos de condensación y vapor que sube con el aire */}
      {NUCLEI.map(([x, y], i) => {
        const k = (clock * 0.08 + i * 0.037) % 1;
        const yy = lerp(y, BASE + 4, k);
        return <circle key={i} cx={x} cy={yy} r="1.6" fill="#5f5a54" opacity={0.8 * (1 - cloud * 0.4)} />;
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const k = (clock * 0.12 + i / 12) % 1;
        const x = 120 + ((i * 97) % 440);
        const y = lerp(GROUND - 16, BASE + 8, k);
        return <Vapor key={i} x={x + Math.sin(k * 6 + i) * 6} y={y} s={0.75} opacity={(1 - k * 0.5) * (1 - fall * 0.4)} />;
      })}
      <BigArrow d={`M96 ${GROUND - 20} V${BASE + 30}`} color={INK} width={3} opacity={t < 10 ? 1 : 0.4} />
      <text x="104" y={GROUND - 54} className="d-label" opacity={t < 10 ? 1 : 0.4}>
        aire húmedo que sube
      </text>

      {/* gotitas de nube: se forman sobre núcleos y crecen al chocar */}
      {DROPLETS.map((d, i) => {
        const born = ramp(t, d.born, d.born + 0.6);
        if (born <= 0) return null;
        const iced = cold && d.y < freezeY + 24 && i % 3 === 0;
        const shrink = cold && !iced && d.y < freezeY + 30 ? 1 - grow * 0.7 : 1;
        const merged = !d.big && !iced && i % 3 === 1 && t > d.merge ? ramp(t, d.merge, d.merge + 0.5) : 0;
        if (merged >= 1) return null;
        const jitter = Math.sin(clock * 1.3 + i) * 2;
        if (iced) return <Ice key={i} x={d.x + jitter} y={d.y} s={0.5 + grow * 0.7} opacity={born} rot={(clock * 20 + i * 30) % 360} />;
        const rr = d.big ? d.r + grow * 5 : d.r * shrink;
        return (
          <g key={i} opacity={born * (1 - merged)}>
            <circle cx={d.x + jitter} cy={d.y} r={rr + 1.2} fill="#fff" stroke="#6f8fae" strokeWidth="1.2" />
            <circle cx={d.x + jitter} cy={d.y} r={Math.min(1.4, rr * 0.35)} fill="#5f5a54" />
          </g>
        );
      })}

      {/* precipitación: gotas grandes (o copos que se derriten) que el aire ya no sostiene */}
      {fall > 0 &&
        Array.from({ length: 9 }, (_, i) => {
          const k = (clock * 0.45 + i / 9) % 1;
          const x = 150 + ((i * 53) % 400);
          const y = lerp(BASE - 30, GROUND - 6, k);
          if (cold && y < BASE + 40) return <Ice key={i} x={x} y={y} s={0.7} opacity={fall} rot={k * 200} />;
          return <Drop key={i} x={x} y={y} s={1.15} opacity={fall} />;
        })}

      {/* comparación de tamaños */}
      <g transform="translate(446 14)" opacity={t >= 10 ? 1 : 0}>
        <rect x="0" y="0" width="188" height="86" rx="10" fill="#fff" stroke={INK} strokeWidth="1.4" />
        <circle cx="44" cy="30" r="22" fill="#2a86d0" stroke="#fff" strokeWidth="1.2" />
        <circle cx="138" cy="30" r="0.5" fill="#1f5f9a" />
        <circle cx="138" cy="30" r="7" fill="none" stroke={INK} strokeWidth="1" strokeDasharray="2 2" />
        <text x="44" y="66" textAnchor="middle" className="d-small">gota de lluvia</text>
        <text x="44" y="79" textAnchor="middle" className="d-small">unos 2 mm</text>
        <text x="138" y="66" textAnchor="middle" className="d-small">gotita de nube</text>
        <text x="138" y="79" textAnchor="middle" className="d-small">unos 0,02 mm</text>
      </g>
    </>
  );
}

// Vista de detalle «poros del suelo»: aire y agua entre los granos durante y después de la lluvia.
// La geometría es estática (memorizada); en cada fotograma solo cambian unos pocos recortes.

import { memo } from 'react';
import { AIR, Callout, Drop, INK, Rain, WATER, ease, lerp, ramp, seeded } from './common';

const W = 640;
const TOP = 70;
const BOTTOM = 400;

interface Grain {
  x: number;
  y: number;
  r: number;
  d: string;
  fill: string;
}

/** Contorno cerrado suave a partir de puntos (Catmull-Rom a Bézier). */
function blob(cx: number, cy: number, r: number, rnd: () => number): string {
  const n = 8;
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const rr = r * (0.86 + rnd() * 0.24);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

const SAND: Grain[] = (() => {
  const rnd = seeded(41);
  const out: Grain[] = [];
  const fills = ['#dcbd8c', '#cfac78', '#e5cda3', '#c9a46f', '#d8b682'];
  let tries = 0;
  while (out.length < 150 && tries++ < 9000) {
    const r = 13 + rnd() * 12;
    const x = -10 + rnd() * (W + 20);
    const y = TOP + 4 + rnd() * (BOTTOM - TOP + 10);
    if (y - r < TOP + 2) continue;
    if (out.some((g) => Math.hypot(g.x - x, g.y - y) < g.r + r + 7)) continue;
    out.push({ x, y, r, d: blob(x, y, r, rnd), fill: fills[out.length % fills.length] });
  }
  return out;
})();

function nearest(x: number, y: number): Grain {
  return SAND.reduce((b, g) => (Math.hypot(g.x - x, g.y - y) < Math.hypot(b.x - x, b.y - y) ? g : b), SAND[0]);
}
const G_LABEL = nearest(120, 150);
const G_FILM = nearest(470, 140);

/** Granos de arena con sus películas de agua (fina y gruesa) y su brillo de luz superior izquierda. */
const SandLayers = memo(function SandLayers() {
  return (
    <>
      <defs>
        <g id="sand-grains">
          {SAND.map((g, i) => (
            <path key={i} d={g.d} fill={g.fill} stroke="#9c7b4c" strokeWidth="1.1" />
          ))}
        </g>
        <g id="sand-shapes">
          {SAND.map((g, i) => (
            <path key={i} d={g.d} />
          ))}
        </g>
      </defs>
    </>
  );
});

function SandGrainsTop() {
  return (
    <>
      <use href="#sand-grains" />
      <g fill="none" stroke="#fff6e2" strokeWidth="2" strokeLinecap="round" opacity="0.7">
        {SAND.map((g, i) => (
          <path key={i} d={`M${(g.x - g.r * 0.62).toFixed(1)} ${(g.y - g.r * 0.18).toFixed(1)} A${(g.r * 0.62).toFixed(1)} ${(g.r * 0.62).toFixed(1)} 0 0 1 ${(g.x - g.r * 0.08).toFixed(1)} ${(g.y - g.r * 0.6).toFixed(1)}`} />
        ))}
      </g>
    </>
  );
}

/** Arcilla: láminas diminutas muy juntas (patrón), con poros muy finos. */
function ClayDefs() {
  const rnd = seeded(9);
  const plates: { x: number; y: number; rx: number; ry: number; a: number }[] = [];
  let tries = 0;
  while (plates.length < 34 && tries++ < 3000) {
    const rx = 7 + rnd() * 5;
    const ry = 2.6 + rnd() * 1.4;
    const x = rnd() * 120;
    const y = rnd() * 84;
    if (plates.some((p) => Math.hypot(p.x - x, (p.y - y) * 2.2) < p.rx + rx + 1)) continue;
    plates.push({ x, y, rx, ry, a: (rnd() - 0.5) * 50 });
  }
  const draw = (extra: number, fill: string, stroke?: string) =>
    plates.flatMap((p, i) =>
      [-120, 0, 120].flatMap((dx) =>
        [-84, 0, 84].map((dy) => (
          <ellipse
            key={`${i}-${dx}-${dy}`}
            cx={p.x + dx}
            cy={p.y + dy}
            rx={p.rx + extra}
            ry={p.ry + extra}
            transform={`rotate(${p.a.toFixed(0)} ${(p.x + dx).toFixed(1)} ${(p.y + dy).toFixed(1)})`}
            fill={fill}
            stroke={stroke}
            strokeWidth={stroke ? 0.8 : 0}
          />
        )),
      ),
    );
  return (
    <defs>
      <pattern id="clay-thin" width="120" height="84" patternUnits="userSpaceOnUse">
        {draw(1.4, WATER)}
      </pattern>
      <pattern id="clay-thick" width="120" height="84" patternUnits="userSpaceOnUse">
        <rect width="120" height="84" fill={AIR} />
        {draw(3.6, WATER)}
      </pattern>
      <pattern id="clay-grains" width="120" height="84" patternUnits="userSpaceOnUse">
        {draw(0, '#a87f5c', '#7c5a3d')}
      </pattern>
    </defs>
  );
}

interface Timeline {
  rain: number;
  front: number;
  satTop: number;
  satBottom: number;
  pond: number;
  runoff: number;
  drips: number;
}

function timeline(t: number, clay: boolean): Timeline {
  const rain = ramp(t, 4, 4.5) * (1 - ramp(t, 9.6, 10.2));
  if (!clay) {
    const front = TOP + (BOTTOM - TOP) * ease(ramp(t, 4.3, 13.5));
    const satTop = TOP + (BOTTOM - TOP + 8) * ease(ramp(t, 10, 14.5));
    return { rain, front, satTop, satBottom: Math.max(satTop, front - 8), pond: 0, runoff: 0, drips: ramp(t, 12.6, 13.2) * (1 - ramp(t, 16.5, 17.5)) };
  }
  const front = TOP + 112 * ease(ramp(t, 4.6, 16));
  const satTop = TOP + 58 * ease(ramp(t, 10, 16.5));
  const pond = 9 * ramp(t, 5.2, 7) * (1 - ramp(t, 10.2, 13.5));
  return { rain, front, satTop, satBottom: Math.max(satTop, front - 5), pond, runoff: ramp(t, 6, 7) * (1 - ramp(t, 11.5, 13)), drips: 0 };
}

export function SoilPoresArt({ t, clock, variant }: { t: number; clock: number; variant: string }) {
  const clay = variant === 'arcilla';
  const tl = timeline(t, clay);
  const intro = 1 - ramp(t, 3.4, 4.2);
  const result = ramp(t, 14.5, 15.3);
  const bubbles = ramp(t, 4.6, 5.2) * (1 - ramp(t, 10, 11));
  const rndB = seeded(77);
  return (
    <>
      {clay ? <ClayDefs /> : <SandLayers />}
      <clipPath id="d-soil-clip">
        <rect x="0" y={TOP} width={W} height={BOTTOM - TOP} />
      </clipPath>
      <clipPath id="d-wet-clip">
        <rect x="0" y={TOP} width={W} height={Math.max(0, tl.front - TOP)} />
      </clipPath>

      {/* cielo y superficie */}
      <rect x="0" y="0" width={W} height={TOP} fill="#dfeef6" />
      <Rain clock={clock} x0={20} x1={W - 20} y0={-10} y1={TOP - 6} n={16} opacity={tl.rain} />

      <g clipPath="url(#d-soil-clip)">
        {/* poros con aire (fondo) */}
        <rect x="0" y={TOP} width={W} height={BOTTOM - TOP} fill={AIR} />
        {/* agua retenida: películas gruesas y meniscos entre granos, solo donde ya pasó el frente */}
        <g clipPath="url(#d-wet-clip)">
          {clay ? (
            <rect x="0" y={TOP} width={W} height={BOTTOM - TOP} fill="url(#clay-thick)" />
          ) : (
            <use href="#sand-shapes" fill={WATER} stroke={WATER} strokeWidth="15" strokeLinejoin="round" />
          )}
        </g>
        {/* agua en todos los poros (gravitacional): mientras llueve y mientras drena */}
        {tl.satBottom - tl.satTop > 0.5 && <rect x="0" y={tl.satTop} width={W} height={tl.satBottom - tl.satTop} fill="url(#d-ripple)" />}
        {/* película fina que siempre rodea los granos */}
        {clay ? (
          <rect x="0" y={TOP} width={W} height={BOTTOM - TOP} fill="url(#clay-thin)" />
        ) : (
          <use href="#sand-shapes" fill="none" stroke={WATER} strokeWidth="4.5" />
        )}
        {/* granos */}
        {clay ? <rect x="0" y={TOP} width={W} height={BOTTOM - TOP} fill="url(#clay-grains)" /> : <SandGrainsTop />}

        {/* burbujas de aire que salen cuando entra el agua */}
        {bubbles > 0.01 &&
          Array.from({ length: 12 }, (_, i) => {
            const x = 30 + rndB() * (W - 60);
            const ph = rndB();
            const k = (clock * 0.45 + ph) % 1;
            const y = lerp(tl.satBottom - 4, tl.satTop + 6, k);
            if (tl.satBottom - tl.satTop < 18) return null;
            return <circle key={i} cx={x + Math.sin((k + i) * 6) * 3} cy={y} r={3 + (i % 3)} fill="#ffffff" stroke="#7b8f99" strokeWidth="1.2" opacity={bubbles * (1 - k * 0.3)} />;
          })}

        {/* frente de humedecimiento */}
        {tl.front > TOP + 6 && tl.front < BOTTOM - 4 && (
          <path d={`M0 ${tl.front.toFixed(1)} H${W}`} stroke={INK} strokeWidth="1.6" strokeDasharray="7 6" opacity="0.8" />
        )}
      </g>

      {/* hojarasca y superficie */}
      <path d={`M0 ${TOP - 3} H${W} V${TOP + 3} H0Z`} fill={clay ? '#7a5a3f' : '#6e5434'} />
      <g stroke="#5f8a45" strokeWidth="1.6" strokeLinecap="round">
        {Array.from({ length: 34 }, (_, i) => {
          const x = 8 + i * 19 + (i % 3) * 3;
          return <path key={i} d={`M${x} ${TOP - 2} l${(i % 2 ? 2 : -2)} -${7 + (i % 4)}`} />;
        })}
      </g>

      {/* encharcamiento y escorrentía en la arcilla */}
      {tl.pond > 0.3 && <rect x="0" y={TOP - 3 - tl.pond} width={W} height={tl.pond} fill="url(#d-ripple)" opacity="0.9" />}
      {tl.runoff > 0.02 && (
        <g opacity={tl.runoff}>
          <path d={`M${W - 190} ${TOP - 20} H${W - 40}`} stroke="#1f6fae" strokeWidth="4" markerEnd="url(#d-arrow-water)" />
          <text x={W - 115} y={TOP - 30} textAnchor="middle" className="d-label">
            el agua que no entra escurre
          </text>
        </g>
      )}

      {/* goteo hacia abajo: percolación */}
      {tl.drips > 0.02 && (
        <g opacity={tl.drips}>
          {[110, 260, 420, 540].map((x, i) => {
            const k = (clock * 0.9 + i * 0.27) % 1;
            return <Drop key={i} x={x} y={BOTTOM - 26 + k * 30} s={0.9} opacity={1 - k * 0.6} />;
          })}
        </g>
      )}

      {/* rótulos según la fase */}
      {!clay && (
        <>
          <Callout x={G_LABEL.x} y={G_LABEL.y} tx={G_LABEL.x + 54} ty={G_LABEL.y - 46} opacity={intro}>
            Grano de arena
          </Callout>
          <Callout x={G_LABEL.x + G_LABEL.r + 6} y={G_LABEL.y + G_LABEL.r * 0.7} tx={G_LABEL.x + 92} ty={G_LABEL.y + 62} opacity={intro}>
            Poro con aire
          </Callout>
          <Callout x={G_FILM.x + G_FILM.r + 1} y={G_FILM.y} tx={G_FILM.x + 40} ty={G_FILM.y - 50} opacity={intro}>
            Película de agua
          </Callout>
          <Callout x={G_FILM.x + G_FILM.r + 4} y={G_FILM.y + 4} tx={G_FILM.x + 30} ty={G_FILM.y - 50} opacity={result}>
            Agua retenida en el suelo
          </Callout>
          <Callout x={G_LABEL.x + G_LABEL.r + 6} y={G_LABEL.y + G_LABEL.r * 0.7} tx={G_LABEL.x + 92} ty={G_LABEL.y + 62} opacity={result}>
            El aire volvió al poro
          </Callout>
        </>
      )}
      {clay && (
        <>
          <Callout x={160} y={150} tx={190} ty={110} opacity={intro}>
            Partículas de arcilla
          </Callout>
          <Callout x={420} y={250} tx={440} ty={300} opacity={intro}>
            Poros muy finos
          </Callout>
          <Callout x={300} y={120} tx={330} ty={250} opacity={result}>
            Mucha agua retenida
          </Callout>
        </>
      )}
      {tl.front > TOP + 30 && tl.front < BOTTOM - 20 && t < 14.5 && (
        <g>
          <rect x="12" y={tl.front + 8} width="236" height="28" rx="14" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <text x="130" y={tl.front + 27} textAnchor="middle" className="d-label">
            ↓ frente de humedecimiento
          </text>
        </g>
      )}
      {tl.drips > 0.3 && (
        <g>
          <rect x={W - 272} y={BOTTOM - 64} width="262" height="28" rx="14" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <text x={W - 141} y={BOTTOM - 45} textAnchor="middle" className="d-label">
            ↓ sigue bajando: percolación
          </text>
        </g>
      )}
    </>
  );
}

const RESULTS: Record<string, { label: string; value: number; word: string }[]> = {
  arena: [
    { label: 'Entró al suelo', value: 0.95, word: 'casi toda' },
    { label: 'Escurrió', value: 0.05, word: 'casi nada' },
    { label: 'Quedó en el suelo', value: 0.35, word: 'una parte' },
    { label: 'Siguió bajando', value: 0.6, word: 'la mayor parte' },
  ],
  arcilla: [
    { label: 'Entró al suelo', value: 0.55, word: 'una parte' },
    { label: 'Escurrió', value: 0.45, word: 'otra parte' },
    { label: 'Quedó en el suelo', value: 0.5, word: 'casi toda la que entró' },
    { label: 'Siguió bajando', value: 0.05, word: 'muy poca, por ahora' },
  ],
};

export function SoilPoresResult({ variant }: { variant: string }) {
  const rows = RESULTS[variant] ?? RESULTS.arena;
  return (
    <div className="d-result">
      <p className="d-result-title">¿Qué pasó con la lluvia? (tendencias, no medidas)</p>
      <dl>
        {rows.map((r) => (
          <div key={r.label} className="d-row">
            <dt>{r.label}</dt>
            <dd>
              <span className="d-bar" aria-hidden="true">
                <span style={{ width: `${r.value * 100}%` }} />
              </span>
              {r.word}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

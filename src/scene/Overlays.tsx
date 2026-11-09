// Superposiciones animadas: masa de aire que asciende, comparación de velocidades,
// gota trazadora y foco de atención.

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ROUTE_NODES } from '../content/routes';
import { makeSampler, smoothPath, type PathSampler } from '../lib/paths';
import type { TracerState } from '../state/store';
import {
  BOUNDS,
  COMPARE_GROUND,
  COMPARE_RUNOFF,
  CONDENSATION_LEVEL,
  PARCEL_PATH,
  REGIONS,
  TRACER_NODES,
  TRACER_PATHS,
  type TracePace,
  type TraceSegment,
  type TraceState,
} from './geometry';

/* ------------------------------------------------------------------ */
/* Masa de aire (condensación)                                          */
/* ------------------------------------------------------------------ */

const parcelSampler = makeSampler(PARCEL_PATH);

export function parcelPosition(t: number) {
  return parcelSampler.at(t * parcelSampler.length);
}

export const Parcel = memo(function Parcel({ t }: { t: number }) {
  const pos = parcelPosition(t);
  const above = CONDENSATION_LEVEL - pos.y;
  const condensed = above > 0;
  const n = condensed ? Math.min(14, 4 + Math.floor(above / 8)) : 0;
  const temp = Math.max(0, Math.min(1, (pos.y - 200) / 260));
  const dots = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const a = i * 2.4;
        const r = 8 + ((i * 7) % 18);
        return [Math.cos(a) * r, Math.sin(a) * r * 0.8] as [number, number];
      }),
    [],
  );
  return (
    <g aria-hidden="true">
      <path d={smoothPath(PARCEL_PATH)} stroke="#ffffff" strokeWidth="2" strokeDasharray="2 7" fill="none" opacity="0.9" />
      <g transform={`translate(${pos.x} ${pos.y})`}>
        <ellipse rx="38" ry="32" fill={condensed ? '#ffffff' : '#ffffff'} fillOpacity={condensed ? 0.55 + Math.min(0.35, above / 200) : 0.12} stroke="#17324d" strokeWidth="2" strokeDasharray="6 4" />
        {!condensed && [-14, 6, -2, 16].map((dx, i) => <use key={i} href="#p-vap" transform={`translate(${dx} ${[-8, -12, 10, 6][i]}) scale(1.2)`} />)}
        {condensed &&
          dots.slice(0, n).map(([dx, dy], i) => <use key={i} href="#p-cld" transform={`translate(${dx} ${dy}) scale(1.8)`} />)}
        {/* termómetro */}
        <g transform="translate(50 -26)">
          <rect x="-5" y="0" width="10" height="44" rx="5" fill="#ffffff" stroke="#17324d" strokeWidth="1.6" />
          <rect x="-2.5" y={4 + (1 - temp) * 34} width="5" height={4 + temp * 34} rx="2.5" fill={temp > 0.5 ? '#d2542c' : '#3c7fc0'} />
          <circle cx="0" cy="50" r="8" fill={temp > 0.5 ? '#d2542c' : '#3c7fc0'} stroke="#17324d" strokeWidth="1.6" />
        </g>
      </g>
    </g>
  );
});

/* ------------------------------------------------------------------ */
/* Comparación: escorrentía frente a flujo subterráneo                  */
/* ------------------------------------------------------------------ */

const runoffSampler = makeSampler(COMPARE_RUNOFF);
const groundSampler = makeSampler(COMPARE_GROUND);
const RUNOFF_SPEED = 130;
const GROUND_SPEED = 18;

export function CompareRace({
  run,
  paused,
  reduced,
  onProgress,
}: {
  run: number;
  paused: boolean;
  reduced: boolean;
  onProgress: (p: { runoff: number; ground: number }) => void;
}) {
  const [d, setD] = useState({ a: 0, b: 0 });
  const dRef = useRef(d);
  dRef.current = d;
  const report = useRef(onProgress);
  report.current = onProgress;

  useEffect(() => {
    setD({ a: 0, b: 0 });
    dRef.current = { a: 0, b: 0 };
  }, [run]);

  useEffect(() => {
    if (reduced) {
      const fin = { a: runoffSampler.length, b: groundSampler.length * 0.18 };
      setD(fin);
      report.current({ runoff: 1, ground: 0.18 });
      return;
    }
    if (paused) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const cur = dRef.current;
      const next = {
        a: Math.min(runoffSampler.length, cur.a + RUNOFF_SPEED * dt),
        b: Math.min(groundSampler.length, cur.b + GROUND_SPEED * dt),
      };
      dRef.current = next;
      setD(next);
      acc += dt;
      if (acc > 0.25) {
        acc = 0;
        report.current({ runoff: next.a / runoffSampler.length, ground: next.b / groundSampler.length });
      }
      if (next.b < groundSampler.length) raf = requestAnimationFrame(tick);
      else report.current({ runoff: 1, ground: 1 });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, paused, reduced]);

  const a = runoffSampler.at(d.a);
  const b = groundSampler.at(d.b);
  return (
    <g aria-hidden="true">
      <path d={smoothPath(COMPARE_RUNOFF)} stroke="#c8246f" strokeWidth="2" strokeDasharray="2 5" fill="none" opacity="0.7" />
      <path d={smoothPath(COMPARE_GROUND)} stroke="#c8246f" strokeWidth="2" strokeDasharray="2 5" fill="none" opacity="0.7" />
      <TracerMarker x={a.x} y={a.y} state="liquid" />
      <TracerMarker x={b.x} y={b.y} state="liquid" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Gota trazadora                                                       */
/* ------------------------------------------------------------------ */

const PACE: Record<TracePace, number> = {
  air: 120,
  cloud: 80,
  fall: 240,
  snow: 70,
  surface: 140,
  soil: 32,
  ground: 34,
};

export function TracerMarker({ x, y, state }: { x: number; y: number; state: TraceState }) {
  return (
    <g transform={`translate(${x} ${y})`} className="tracer-marker">
      <circle r="24" fill="#c8246f" opacity="0.18" className="tracer-pulse" />
      <g transform="scale(1.3)">
      <circle r="11" fill="#ffffff" stroke="#c8246f" strokeWidth="2.6" />
      {state === 'liquid' && <path d="M0 -7.5 C3.6 -2.6 5 0 5 2.2 A5 5 0 0 1 -5 2.2 C-5 0 -3.6 -2.6 0 -7.5Z" fill="#c8246f" />}
      {state === 'vapor' && <circle r="5" fill="none" stroke="#c8246f" strokeWidth="2" strokeDasharray="3 2" />}
      {state === 'cloud' && (
        <g fill="#c8246f">
          <circle cx="-3" cy="-2" r="2" />
          <circle cx="3" cy="-2.5" r="1.6" />
          <circle cx="0" cy="3" r="2.2" />
        </g>
      )}
      {state === 'ice' && (
        <path d="M0 -6 V6 M-5.2 -3 L5.2 3 M-5.2 3 L5.2 -3" stroke="#c8246f" strokeWidth="2.2" strokeLinecap="round" />
      )}
      </g>
    </g>
  );
}

interface Run {
  segs: { seg: TraceSegment; sampler: PathSampler }[];
}

export function Tracer({
  tracer,
  paused,
  reduced,
  onArrive,
}: {
  tracer: TracerState;
  paused: boolean;
  reduced: boolean;
  onArrive: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; state: TraceState; trail: string }>(() => {
    const p = TRACER_NODES[tracer.node];
    return { x: p[0], y: p[1], state: ROUTE_NODES[tracer.node].state, trail: '' };
  });
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  const progress = useRef({ seg: 0, dist: 0, edge: '' });

  const run: Run | null = useMemo(() => {
    if (!tracer.moving) return null;
    const segs = (TRACER_PATHS[tracer.moving] ?? []).map((seg) => ({ seg, sampler: makeSampler(seg.points) }));
    return { segs };
  }, [tracer.moving]);

  // posición en reposo
  useEffect(() => {
    if (tracer.moving) return;
    const p = TRACER_NODES[tracer.node];
    setPos((prev) => ({ ...prev, x: p[0], y: p[1], state: ROUTE_NODES[tracer.node].state }));
  }, [tracer.node, tracer.moving, tracer.run]);

  useEffect(() => {
    if (!run || !tracer.moving) return;
    if (progress.current.edge !== tracer.moving) progress.current = { seg: 0, dist: 0, edge: tracer.moving };
    const fullTrail = run.segs.map((s) => smoothPath(s.seg.points)).join(' ');
    if (reduced) {
      const last = run.segs[run.segs.length - 1];
      const end = last.seg.points[last.seg.points.length - 1];
      setPos({ x: end[0], y: end[1], state: last.seg.state, trail: fullTrail });
      const id = window.setTimeout(() => arrive.current(), 400);
      return () => window.clearTimeout(id);
    }
    if (paused) return;
    let raf = 0;
    let lastT = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      const pr = progress.current;
      const cur = run.segs[pr.seg];
      pr.dist += PACE[cur.seg.pace] * dt;
      if (pr.dist >= cur.sampler.length) {
        if (pr.seg < run.segs.length - 1) {
          pr.seg += 1;
          pr.dist = 0;
        } else {
          const end = cur.sampler.at(cur.sampler.length);
          setPos({ x: end.x, y: end.y, state: cur.seg.state, trail: fullTrail });
          arrive.current();
          return;
        }
      }
      const s = run.segs[pr.seg];
      const p = s.sampler.at(pr.dist);
      const done = run.segs.slice(0, pr.seg).map((x) => smoothPath(x.seg.points)).join(' ');
      const partial = s.sampler.points.filter((_, i, arr) => i <= Math.ceil((pr.dist / s.sampler.length) * (arr.length - 1)));
      const partialD = partial.length > 1 ? 'M' + partial.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') : '';
      setPos({ x: p.x, y: p.y, state: s.seg.state, trail: `${done} ${partialD}` });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, tracer.moving, paused, reduced]);

  const history = tracer.history.slice(0, tracer.moving ? -1 : undefined);
  return (
    <g aria-hidden="true">
      {history.map((e, i) => (
        <path key={`${e}-${i}`} d={(TRACER_PATHS[e] ?? []).map((s) => smoothPath(s.points)).join(' ')} stroke="#c8246f" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" fill="none" opacity="0.6" />
      ))}
      {tracer.moving && pos.trail && (
        <>
          <path d={pos.trail} stroke="#ffffff" strokeWidth="7" strokeLinecap="round" fill="none" opacity="0.55" />
          <path d={pos.trail} stroke="#c8246f" strokeWidth="4" strokeDasharray="1 8" strokeLinecap="round" fill="none" />
        </>
      )}
      <TracerMarker x={pos.x} y={pos.y} state={pos.state} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Foco de atención: atenúa el resto sin ocultarlo                       */
/* ------------------------------------------------------------------ */

export const Spotlight = memo(function Spotlight({ regions }: { regions: string[] }) {
  const rects = regions.map((r) => REGIONS[r]).filter(Boolean);
  if (!rects.length) return null;
  return (
    <g aria-hidden="true" className="spotlight">
      <defs>
        <filter id="f-spot" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <mask id="m-spot" maskUnits="userSpaceOnUse" x={BOUNDS.x} y={BOUNDS.y} width={BOUNDS.w} height={BOUNDS.h}>
          <rect x={BOUNDS.x} y={BOUNDS.y} width={BOUNDS.w} height={BOUNDS.h} fill="#fff" />
          <g filter="url(#f-spot)">
            {rects.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx="44" fill="#000" />
            ))}
          </g>
        </mask>
      </defs>
      <rect x={BOUNDS.x} y={BOUNDS.y} width={BOUNDS.w} height={BOUNDS.h} fill="#0f2233" opacity="0.3" mask="url(#m-spot)" />
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx="40" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeDasharray="10 8" opacity="0.9" />
      ))}
    </g>
  );
});

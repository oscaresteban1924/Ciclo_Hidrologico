// Reloj del aguacero de la sala «Cuencas»: con WebGL lo lleva la escena (que avisa el minuto del modelo en cada cuadro);
// sin WebGL, un reloj propio con la misma escala (unos 24 s). Mientras corre, la estación de la salida «mide»: suma el
// caudal de cada cuadro por el tiempo del cuadro. Al terminar, ese volumen medido se compara con la lluvia que escurre
// por el área (balance de masa). Si cambian los datos durante el aguacero, se detiene.

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { es } from '../canals/common';
import type { BasinResult } from './hydrology';
import type { BasinWorld } from './three/basinWorld';

/** Duración de la reproducción en segundos (la misma que usa la escena). */
export const PLAY_SECONDS = 24;

export interface StormRun {
  /** Volumen que pasó por la estación, sumado cuadro a cuadro (m³). */
  measured: number;
  /** Lámina que escurre por el área (m³). */
  theory: number;
  /** Datos con los que se corrió (para comparar escenarios). */
  r: BasinResult;
}

export function useStorm(r: BasinResult, gl: boolean, world: MutableRefObject<BasinWorld | null>) {
  const [tNow, setTNow] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [runs, setRuns] = useState<StormRun[]>([]);
  const rRef = useRef(r);
  rRef.current = r;
  const acc = useRef({ prev: 0, vol: 0, lastSet: -1 });
  const playingRef = useRef(false);
  const stopping = useRef(false);

  const tick = useRef((tm: number | null) => {
    const rr = rRef.current;
    const total = rr.hydro.length * rr.dt;
    const a = acc.current;
    if (tm === null) {
      const natural = !stopping.current && playingRef.current;
      stopping.current = false;
      if (natural) {
        const k = Math.floor(a.prev / rr.dt);
        a.vol += (rr.hydro[k] ?? 0) * Math.max(0, total - a.prev) * 60;
        const run: StormRun = { measured: a.vol, theory: rr.Q * rr.inp.A * 10, r: rr };
        setRuns((x) => [...x, run].slice(-12));
      }
      playingRef.current = false;
      setPlaying(false);
      setTNow(null);
      return;
    }
    if (!playingRef.current) return;
    const k = Math.floor(a.prev / rr.dt);
    a.vol += (rr.hydro[k] ?? 0) * Math.max(0, tm - a.prev) * 60;
    a.prev = tm;
    if (tm - a.lastSet > total / 240) {
      a.lastSet = tm;
      setTNow(tm);
    }
  });

  // la escena avisa el minuto del modelo
  useEffect(() => {
    const w = world.current;
    if (w) w.onTime = (tm) => tick.current(tm);
  });

  // sin WebGL: reloj propio
  useEffect(() => {
    if (!playing || gl) return;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const rr = rRef.current;
      const total = rr.hydro.length * rr.dt;
      const tm = (Math.max(0, now - t0) / 1000) * (total / PLAY_SECONDS);
      if (tm >= total) {
        tick.current(null);
        return;
      }
      tick.current(tm);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, gl]);

  const start = () => {
    acc.current = { prev: 0, vol: 0, lastSet: -1 };
    stopping.current = false;
    playingRef.current = true;
    setPlaying(true);
    setTNow(0);
    if (gl) world.current?.play(true);
  };
  const stop = () => {
    if (!playingRef.current) return;
    stopping.current = true;
    if (gl && world.current) world.current.play(false);
    else tick.current(null);
  };

  // si cambian los datos, el aguacero en curso ya no corresponde: se detiene
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    if (playingRef.current) stopRef.current();
  }, [r]);
  useEffect(() => () => {
    if (playingRef.current) {
      stopping.current = true;
      world.current?.play(false);
    }
  }, [world]);

  return { tNow, playing, runs, start, stop };
}

/** Botón del pie de la escena: lanza o detiene el aguacero y muestra el minuto. */
export function StormButton({ playing, tNow, total, start, stop }: { playing: boolean; tNow: number | null; total: number; start: () => void; stop: () => void }) {
  return (
    <div className="hc-flood">
      {playing ? (
        <>
          <span className="hc-flood-q">
            minuto {es(tNow ?? 0, 0)} de {es(total, 0)}
          </span>
          <button type="button" onClick={stop}>
            Detener
          </button>
        </>
      ) : (
        <button type="button" onClick={start} title={`Reproduce el aguacero y la creciente en unos ${PLAY_SECONDS} s`}>
          Lanzar el aguacero
        </button>
      )}
    </div>
  );
}

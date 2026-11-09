// Reloj de una secuencia explicativa: avanza con la velocidad de reproducción, se detiene con la
// pausa global y conserva el resultado al final. Cambiar la velocidad solo cambia el ritmo de la
// reproducción: la secuencia es una función del tiempo, así que el resultado es siempre el mismo.

import { useCallback, useEffect, useRef, useState } from 'react';

export function useSequenceClock(duration: number, playing: boolean, speed: number, resetKey: unknown) {
  const [state, setState] = useState({ t: 0, clock: 0 });
  const ref = useRef({ t: 0, clock: 0 });

  useEffect(() => {
    ref.current = { t: 0, clock: 0 };
    setState({ t: 0, clock: 0 });
  }, [resetKey]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const r = ref.current;
      r.t = Math.min(duration, r.t + dt * speed);
      r.clock += dt * speed;
      acc += dt;
      // ~30 actualizaciones por segundo bastan para estas ilustraciones
      if (acc >= 1 / 30) {
        acc = 0;
        setState({ t: r.t, clock: r.clock });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);

  const seek = useCallback((t: number) => {
    ref.current.t = Math.max(0, Math.min(duration, t));
    setState({ t: ref.current.t, clock: ref.current.clock });
  }, [duration]);

  return { t: state.t, clock: state.clock, seek, ended: state.t >= duration - 1e-6 };
}

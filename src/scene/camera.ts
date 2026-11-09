// Cámara: calcula el encuadre (viewBox) según la región de interés y el tamaño del contenedor,
// y convierte coordenadas de escena a píxeles de pantalla.

import { useEffect, useRef, useState } from 'react';
import { BOUNDS, type Rect } from './geometry';

export function fitCamera(focus: Rect, w: number, h: number, pad = 0.06, biasY = 0.5): Rect {
  const aspect = w / Math.max(1, h);
  let fw = focus.w * (1 + pad * 2);
  let fh = focus.h * (1 + pad * 2);
  const baseH = fh;
  if (fw / fh > aspect) fh = fw / aspect;
  else fw = fh * aspect;
  // no salir del arte disponible
  if (fw > BOUNDS.w) {
    fw = BOUNDS.w;
    fh = fw / aspect;
  }
  if (fh > BOUNDS.h) {
    fh = BOUNDS.h;
    fw = fh * aspect;
  }
  const cx = focus.x + focus.w / 2;
  const cy = focus.y + focus.h / 2;
  let x = cx - fw / 2;
  // el espacio vertical sobrante se reparte según biasY (más cielo que roca)
  let y = focus.y - focus.h * pad - (fh - baseH) * biasY;
  if (biasY === 0.5) y = cy - fh / 2;
  x = Math.max(BOUNDS.x, Math.min(BOUNDS.x + BOUNDS.w - fw, x));
  y = Math.max(BOUNDS.y, Math.min(BOUNDS.y + BOUNDS.h - fh, y));
  return { x, y, w: fw, h: fh };
}

/** Amplía una región hasta un tamaño mínimo para conservar el contexto alrededor. */
export function contextFocus(region: Rect, minW: number, minH: number): Rect {
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  const w = Math.max(region.w, minW);
  const h = Math.max(region.h, minH);
  const x = Math.max(-60, Math.min(1660 - w, cx - w / 2));
  const y = Math.max(-40, Math.min(1010 - h, cy - h / 2));
  return { x, y, w, h };
}

/** Desplaza un encuadre sin salir del arte disponible. */
export function panRect(r: Rect, dx: number, dy: number): Rect {
  const x = Math.max(BOUNDS.x, Math.min(BOUNDS.x + BOUNDS.w - r.w, r.x + dx));
  const y = Math.max(-200, Math.min(1200 - r.h, r.y + dy));
  return { ...r, x, y };
}

export interface Mapper {
  scale: number;
  toScreen(x: number, y: number): [number, number];
  toScene(px: number, py: number): [number, number];
}

export function makeMapper(vb: Rect, w: number, h: number): Mapper {
  const scale = Math.min(w / vb.w, h / vb.h);
  const ox = (w - vb.w * scale) / 2;
  const oy = (h - vb.h * scale) / 2;
  return {
    scale,
    toScreen: (x, y) => [(x - vb.x) * scale + ox, (y - vb.y) * scale + oy],
    toScene: (px, py) => [(px - ox) / scale + vb.x, (py - oy) / scale + vb.y],
  };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Interpola suavemente el encuadre cuando cambia (instantáneo con movimiento reducido). */
export function useTweenRect(target: Rect, instant: boolean, duration = 700): Rect {
  const [rect, setRect] = useState(target);
  const fromRef = useRef(target);
  const rectRef = useRef(target);
  rectRef.current = rect;

  useEffect(() => {
    const cur = rectRef.current;
    if (instant || (Math.abs(cur.x - target.x) < 0.5 && Math.abs(cur.w - target.w) < 0.5 && Math.abs(cur.y - target.y) < 0.5 && Math.abs(cur.h - target.h) < 0.5)) {
      setRect(target);
      return;
    }
    fromRef.current = cur;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = ease(Math.min(1, (t - start) / duration));
      const f = fromRef.current;
      setRect({
        x: f.x + (target.x - f.x) * k,
        y: f.y + (target.y - f.y) * k,
        w: f.w + (target.w - f.w) * k,
        h: f.h + (target.h - f.h) * k,
      });
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target.x, target.y, target.w, target.h, instant, duration]);

  return rect;
}

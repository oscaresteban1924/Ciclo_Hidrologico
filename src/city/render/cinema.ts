// Modo «Cine»: una secuencia de tomas de cámara que recorre la tormenta calculada (sobrevuelo, calle, donde más
// agua hay, grúa y valle). Solo mueve la cámara: no cambia el cálculo. Se detiene en cuanto la persona toca la
// maqueta, y no se ofrece con movimiento reducido.

import * as THREE from 'three';

export interface Pose {
  p: THREE.Vector3;
  t: THREE.Vector3;
}

export interface Shot {
  id: 'sobrevuelo' | 'calle' | 'agua' | 'grua' | 'valle';
  /** Rótulo corto de la toma (se muestra en la maqueta y en el video). */
  label: string;
  /** Duración [s]. */
  dur: number;
  pose: (u: number) => Pose;
}

/** Lo que el director necesita saber del sector (coordenadas del modelo: x este, y norte, z cota). */
export interface Stage {
  W: number;
  H: number;
  /** Altura del plano del sector en su centro (mundo). */
  fitA: number;
  street: { eye: [number, number]; look: [number, number] };
  groundAt: (x: number, y: number) => number;
  roofAt: (x: number, y: number) => number;
  w: (x: number, y: number, z: number) => THREE.Vector3;
  /** Celda con más agua ahora mismo (calculada): [x, y, profundidad m], o null si no hay agua apreciable. */
  deepest: () => [number, number, number] | null;
  valle: Pose;
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

/** Altura de cámara libre de techos alrededor de (x, y) en el radio r [m]. */
function clearZ(st: Stage, x: number, y: number, r: number): number {
  let z = -Infinity;
  for (let a = 0; a < 8; a++) {
    for (const rr of [0, r * 0.5, r]) {
      const px = Math.min(st.W - 0.5, Math.max(0.5, x + Math.cos((a * Math.PI) / 4) * rr));
      const py = Math.min(st.H - 0.5, Math.max(0.5, y + Math.sin((a * Math.PI) / 4) * rr));
      z = Math.max(z, st.groundAt(px, py), st.roofAt(px, py));
    }
  }
  return z;
}

export function buildShots(st: Stage): Shot[] {
  const span = Math.max(st.W, st.H);
  const c = new THREE.Vector3(0, st.fitA, 0);
  const shots: Shot[] = [];
  // 1. sobrevuelo: órbita lenta alrededor del sector
  const r1 = span * 1.05, h1 = st.fitA + span * 0.42, a0 = Math.atan2(0.6, 0.86);
  shots.push({
    id: 'sobrevuelo',
    label: 'Sobre el barrio',
    dur: 11,
    pose: (u) => {
      const a = a0 + ease(u) * (Math.PI / 4.5);
      return { p: new THREE.Vector3(Math.cos(a) * r1, h1, Math.sin(a) * r1), t: c.clone() };
    },
  });
  // 2. calle: la cámara avanza despacio por la calle, a la altura de los ojos
  const [ex, ey] = st.street.eye, [lx, ly] = st.street.look;
  shots.push({
    id: 'calle',
    label: 'En la calle',
    dur: 9,
    pose: (u) => {
      const k = 0.35 * ease(u);
      const x = ex + (lx - ex) * k, y = ey + (ly - ey) * k;
      return { p: st.w(x, y, st.groundAt(x, y) + 1.6), t: st.w(lx, ly, st.groundAt(lx, ly) + 1.2) };
    },
  });
  // 3. donde más agua hay (según el cálculo de ese momento): arco bajo alrededor del punto
  shots.push({
    id: 'agua',
    label: 'Donde más agua hay',
    dur: 9,
    pose: (() => {
      let cached: { x: number; y: number; z: number; zc: number } | null = null;
      return (u: number) => {
        if (!cached || u === 0) {
          const d = st.deepest();
          const x = d ? d[0] : st.W / 2, y = d ? d[1] : st.H / 2;
          const z = st.groundAt(x, y);
          cached = { x, y, z, zc: Math.max(z + 7, clearZ(st, x, y, 24) + 5) };
        }
        const { x, y, z, zc } = cached;
        const a = -0.6 + ease(u) * 1.1;
        const ox = Math.min(st.W - 1, Math.max(1, x + Math.cos(a) * 24)), oy = Math.min(st.H - 1, Math.max(1, y + Math.sin(a) * 24));
        return { p: st.w(ox, oy, zc), t: st.w(x, y, z + 0.5) };
      };
    })(),
  });
  // 4. grúa: sube en vertical desde la calle (sin atravesar casas) y termina mirando el sector completo
  shots.push({
    id: 'grua',
    label: 'Subiendo',
    dur: 10,
    pose: (u) => {
      const e = ease(u);
      const z0 = st.groundAt(ex, ey) + 1.6;
      const p = st.w(ex, ey, z0);
      p.y += e * span * 0.75;
      const t0 = st.w(lx, ly, st.groundAt(lx, ly) + 1.2);
      return { p, t: t0.lerp(c, e) };
    },
  });
  // 5. el valle desde la ladera, acercándose
  shots.push({
    id: 'valle',
    label: 'El valle',
    dur: 10,
    pose: (u) => {
      const e = ease(u);
      const p = st.valle.p.clone().lerp(st.valle.t, 0.22 * e);
      return { p, t: st.valle.t.clone() };
    },
  });
  return shots;
}

/** Duración total de la secuencia [s]. */
export function sequenceLength(shots: Shot[]): number {
  return shots.reduce((s, q) => s + q.dur, 0);
}

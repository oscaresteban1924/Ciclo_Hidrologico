// Prueba de los esquemas con una solución exacta: la rotura de una presa sobre un fondo seco y sin fricción tiene
// la solución analítica de Ritter (1892). Se resuelve en 1D con las ecuaciones completas de aguas someras (volúmenes
// finitos con el flujo HLL) y con la inercia local (sin el término de advección), para ver qué se pierde al
// simplificar la cantidad de movimiento.

const G = 9.81;

export interface DamBreak {
  x: number[];
  ritter: number[];
  swe: number[];
  li: number[];
  /** Errores medios relativos frente a Ritter (en altura) y posición del frente de cada uno [m]. */
  errSWE: number;
  errLI: number;
  frontRitter: number;
  frontSWE: number;
  frontLI: number;
}

/** Altura de Ritter a la distancia x de la presa en el tiempo t (fondo seco, sin fricción). */
export function ritterH(h0: number, x: number, t: number): number {
  if (t <= 0) return x < 0 ? h0 : 0;
  const c0 = Math.sqrt(G * h0);
  if (x <= -c0 * t) return h0;
  if (x >= 2 * c0 * t) return 0;
  const v = 2 * c0 - x / t;
  return (v * v) / (9 * G);
}

/**
 * Rotura de presa en un canal de 2·Lh metros con celdas de dx: la presa está en x = 0 con h0 aguas arriba y el
 * cauce seco aguas abajo; n es el coeficiente de Manning (0 para comparar con Ritter).
 */
export function damBreak(h0: number, t: number, n = 0, dx = 2, Lh = 600): DamBreak {
  const N = Math.round((2 * Lh) / dx);
  const xc = Array.from({ length: N }, (_, i) => -Lh + (i + 0.5) * dx);
  const c0 = Math.sqrt(G * h0);
  // ---- aguas someras completas, HLL de primer orden
  const h = xc.map((x) => (x < 0 ? h0 : 0));
  const hu = new Array(N).fill(0);
  let tt = 0;
  const DRY = 1e-6;
  while (tt < t - 1e-9) {
    let smax = 1e-6;
    for (let i = 0; i < N; i++) if (h[i] > DRY) smax = Math.max(smax, Math.abs(hu[i] / h[i]) + Math.sqrt(G * h[i]));
    const dt = Math.min(t - tt, (0.9 * dx) / smax);
    const F1 = new Array(N + 1).fill(0), F2 = new Array(N + 1).fill(0);
    for (let f = 1; f < N; f++) {
      const hL = h[f - 1], hR = h[f];
      const uL = hL > DRY ? hu[f - 1] / hL : 0, uR = hR > DRY ? hu[f] / hR : 0;
      const cL = Math.sqrt(G * hL), cR = Math.sqrt(G * hR);
      let sL: number, sR: number;
      if (hL <= DRY) {
        sL = uR - 2 * cR;
        sR = uR + cR;
      } else if (hR <= DRY) {
        sL = uL - cL;
        sR = uL + 2 * cL;
      } else {
        sL = Math.min(uL - cL, uR - cR);
        sR = Math.max(uL + cL, uR + cR);
      }
      const fL1 = hL * uL, fL2 = hL * uL * uL + 0.5 * G * hL * hL;
      const fR1 = hR * uR, fR2 = hR * uR * uR + 0.5 * G * hR * hR;
      if (sL >= 0) {
        F1[f] = fL1;
        F2[f] = fL2;
      } else if (sR <= 0) {
        F1[f] = fR1;
        F2[f] = fR2;
      } else {
        F1[f] = (sR * fL1 - sL * fR1 + sL * sR * (hR - hL)) / (sR - sL);
        F2[f] = (sR * fL2 - sL * fR2 + sL * sR * (hR * uR - hL * uL)) / (sR - sL);
      }
    }
    // paredes reflejantes en los extremos (el dominio es más largo que lo que alcanza la onda)
    F2[0] = 0.5 * G * h[0] * h[0];
    F2[N] = 0.5 * G * h[N - 1] * h[N - 1];
    for (let i = 0; i < N; i++) {
      h[i] -= (dt / dx) * (F1[i + 1] - F1[i]);
      hu[i] -= (dt / dx) * (F2[i + 1] - F2[i]);
      if (h[i] < DRY) {
        h[i] = Math.max(0, h[i]);
        hu[i] = 0;
      } else if (n > 0) {
        // fricción semi-implícita
        const u = hu[i] / h[i];
        hu[i] /= 1 + (dt * G * n * n * Math.abs(u)) / Math.pow(h[i], 4 / 3);
      }
    }
    tt += dt;
  }
  // ---- inercia local (Bates et al., 2010; de Almeida et al., 2012): caudal en las caras, sin advección
  const hl = xc.map((x) => (x < 0 ? h0 : 0));
  const q = new Array(N + 1).fill(0);
  tt = 0;
  while (tt < t - 1e-9) {
    let hm = 0;
    for (const v of hl) hm = Math.max(hm, v);
    const dt = Math.min(t - tt, (0.7 * dx) / Math.sqrt(G * Math.max(hm, 0.01)));
    for (let f = 1; f < N; f++) {
      const hf = Math.max(hl[f - 1], hl[f]);
      if (hf <= DRY) {
        q[f] = 0;
        continue;
      }
      const num = q[f] - G * hf * dt * ((hl[f] - hl[f - 1]) / dx);
      q[f] = n > 0 ? num / (1 + (G * dt * n * n * Math.abs(q[f])) / Math.pow(hf, 7 / 3)) : num;
    }
    // ninguna celda entrega más agua de la que tiene
    for (let i = 0; i < N; i++) {
      const out = (Math.max(0, q[i + 1]) + Math.max(0, -q[i])) * dt;
      const avail = hl[i] * dx;
      if (out > avail && out > 0) {
        const s = avail / out;
        if (q[i + 1] > 0) q[i + 1] *= s;
        if (q[i] < 0) q[i] *= s;
      }
    }
    for (let i = 0; i < N; i++) hl[i] = Math.max(0, hl[i] - (dt / dx) * (q[i + 1] - q[i]));
    tt += dt;
  }
  const rit = xc.map((x) => ritterH(h0, x, t));
  // errores en la zona que se mueve (de la cabeza de la onda negativa al frente)
  let e1 = 0, e2 = 0, s = 0;
  for (let i = 0; i < N; i++) {
    if (xc[i] < -c0 * t * 1.2 || xc[i] > 2 * c0 * t * 1.2) continue;
    e1 += Math.abs(h[i] - rit[i]);
    e2 += Math.abs(hl[i] - rit[i]);
    s += Math.max(rit[i], 0.05 * h0);
  }
  const front = (arr: number[]) => {
    for (let i = N - 1; i >= 0; i--) if (arr[i] > 0.01 * h0) return xc[i];
    return -Lh;
  };
  return { x: xc, ritter: rit, swe: h, li: hl, errSWE: e1 / s, errLI: e2 / s, frontRitter: 2 * c0 * t, frontSWE: front(h), frontLI: front(hl) };
}

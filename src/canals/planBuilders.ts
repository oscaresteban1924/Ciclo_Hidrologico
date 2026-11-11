// Constructores de los planos acotados de los prediseños (cortes y perfiles a escala). Funciones puras: reciben
// las medidas ya calculadas y devuelven la descripción vectorial que dibuja `plan.ts`.

import type { Plan, PlanItem, XY } from './plan';

const m = (v: number, d = 2) => `${v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d })} m`;

/** Corte de un canal rectangular o trapecial (z = 0 es rectangular), revestido (t > 0) o en tierra. */
export function channelPlan(o: { title: string; b: number; z: number; y: number; H: number; t?: number; earth?: boolean }): Plan {
  const { b, z, y, H } = o;
  const t = o.t ?? 0;
  const hb = b / 2, k = Math.sqrt(1 + z * z);
  const inner: XY[] = [[-hb - z * H, H], [-hb, 0], [hb, 0], [hb + z * H, H]];
  const items: PlanItem[] = [];
  const top = H + Math.max(0.1, t);
  const side = Math.max(1, 0.3 * (b + 2 * z * H));
  const L = -hb - z * H - side, R = hb + z * H + side;
  // terreno alrededor
  const groundBottom = -Math.max(0.6, t + 0.4);
  items.push({ k: 'shape', fill: 'tierra', pts: [[L, top], [L, groundBottom], [R, groundBottom], [R, top], [hb + z * H + t * k, top], [hb + z * H + t * k, H], ...[...inner].reverse().map(([a, c]) => [a, c] as XY), [-hb - z * H - t * k, H], [-hb - z * H - t * k, top]] });
  if (t > 0) {
    const outer: XY[] = [[hb + z * H + t * k, H], [hb + t * (k - z), -t], [-hb - t * (k - z), -t], [-hb - z * H - t * k, H]];
    items.push({ k: 'shape', fill: 'concreto', pts: [...inner, ...outer] });
  }
  items.push({ k: 'shape', fill: 'agua', pts: [[-hb, 0], [hb, 0], [hb + z * y, y], [-hb - z * y, y]] });
  items.push({ k: 'line', style: 'agua', pts: [[-hb - z * y, y], [hb + z * y, y]] });
  items.push({ k: 'dim', a: [-hb, 0], b: [hb, 0], text: `b = ${m(b)}`, off: -(0.35 + t + 0.15 * H) });
  items.push({ k: 'dim', a: [-hb - z * H, H], b: [hb + z * H, H], text: `T = ${m(b + 2 * z * H)}`, off: 0.25 + 0.12 * H });
  items.push({ k: 'dim', a: [hb + z * H + side * 0.45, 0], b: [hb + z * H + side * 0.45, y], text: `y = ${m(y)}`, off: 0 });
  items.push({ k: 'dim', a: [-hb - z * H - side * 0.45, 0], b: [-hb - z * H - side * 0.45, H], text: `H = ${m(H)}`, off: 0 });
  if (z > 0) items.push({ k: 'label', at: [hb + (z * H) / 2 + 0.25 + t, H / 2], text: `${z.toLocaleString('es-CO')} : 1`, anchor: 'start', small: true });
  if (t > 0) items.push({ k: 'label', at: [0, -t - 0.22], text: `revestimiento de ${m(t, 2)}`, small: true });
  items.push({ k: 'label', at: [0, (y + H) / 2 + 0.02], text: `borde libre ${m(H - y)}`, small: true });
  return { title: o.title, view: 'Corte transversal', items };
}

/** Corte de un tubo con el agua a la profundidad y. */
export function pipePlan(o: { title: string; D: number; y: number; t?: number }): Plan {
  const r = o.D / 2, t = o.t ?? Math.max(0.08, o.D / 12);
  const ring = (rad: number, n = 48): XY[] => Array.from({ length: n }, (_, k) => [rad * Math.cos((2 * Math.PI * k) / n), r + rad * Math.sin((2 * Math.PI * k) / n)] as XY);
  const items: PlanItem[] = [{ k: 'shape', fill: 'tierra', pts: [[-r - 1, -t - 0.4], [r + 1, -t - 0.4], [r + 1, o.D + t + 0.6], [-r - 1, o.D + t + 0.6]] }];
  items.push({ k: 'shape', fill: 'concreto', pts: ring(r + t) });
  items.push({ k: 'shape', fill: 'vacio', pts: ring(r) });
  const h = Math.min(o.y, o.D * 0.999);
  const a = Math.acos((r - h) / r);
  const water: XY[] = [];
  for (let k = 0; k <= 32; k++) {
    const ang = -Math.PI / 2 - a + (2 * a * k) / 32;
    water.push([r * Math.cos(ang), r + r * Math.sin(ang)]);
  }
  items.push({ k: 'shape', fill: 'agua', pts: water });
  items.push({ k: 'line', style: 'agua', pts: [water[0], water[water.length - 1]] });
  items.push({ k: 'dim', a: [-r, -t - 0.15], b: [r, -t - 0.15], text: `D = ${m(o.D)}`, off: -0.1 });
  items.push({ k: 'dim', a: [r + t + 0.45, 0], b: [r + t + 0.45, h], text: `y = ${m(h)}`, off: 0 });
  return { title: o.title, view: 'Corte transversal', items };
}

/** Perfil de un pozo amortiguador: rápida, piso, dados, bloques, umbral y agua. */
export function basinPlan(o: { title: string; drop: number; L: number; y1: number; y2: number; tw: number; chute: { h: number; w: number } | null; baffle: { h: number; x: number } | null; sill: number; type: string }): Plan {
  const { drop, L } = o;
  const run = drop * 1.5;
  const t = 0.5;
  const items: PlanItem[] = [];
  // rápida y piso (concreto)
  items.push({ k: 'shape', fill: 'concreto', pts: [[-run - 2, drop], [-run, drop], [0, 0], [L + 0.6, 0], [L + 0.6, -t], [-0.3, -t], [-run - 0.3, drop - t], [-run - 2, drop - t]] });
  // relleno bajo la rápida
  items.push({ k: 'shape', fill: 'relleno', pts: [[-run - 0.3, drop - t], [-0.3, -t], [-run - 0.3, -t]] });
  if (o.chute) items.push({ k: 'shape', fill: 'concreto', pts: [[0.05, 0], [0.05 + o.chute.w, 0], [0.05 + o.chute.w, o.chute.h], [0.05, o.chute.h]] });
  if (o.baffle) {
    const bx = o.baffle.x, h3 = o.baffle.h;
    items.push({ k: 'shape', fill: 'concreto', pts: [[bx, 0], [bx + 1.2 * h3, 0], [bx + 0.2 * h3, h3], [bx, h3]] });
    items.push({ k: 'label', at: [bx + 0.6 * h3, h3 + 0.9], text: `bloques ${m(h3)}`, small: true });
  }
  if (o.sill > 0) items.push({ k: 'shape', fill: 'concreto', pts: [[L - 2 * o.sill, 0], [L + 0.6, 0], [L + 0.6, o.sill], [L, o.sill]] });
  // agua: llega delgada por la rápida, salta en el resalto y queda con la profundidad de abajo
  const xj = Math.min(L * 0.55, 6.9 * (o.y2 - o.y1) * 0.5);
  const water: XY[] = [[-run, drop], [-run * 0.5, drop * 0.5 + o.y1 * 1.4], [0, o.y1], [xj * 0.15, o.y1], [xj, o.tw * 0.92], [L, o.tw], [L + 0.6, o.tw], [L + 0.6, 0], [0, 0]];
  items.push({ k: 'shape', fill: 'agua', pts: water });
  items.push({ k: 'line', style: 'agua', pts: [[xj, o.tw * 0.92], [L, o.tw]] });
  items.push({ k: 'dim', a: [0, -t - 1.2], b: [L, -t - 1.2], text: `L = ${m(L, 1)}`, off: -0.2 });
  items.push({ k: 'dim', a: [-run - 1.2, 0], b: [-run - 1.2, drop], text: `caída ${m(drop, 1)}`, off: 0 });
  items.push({ k: 'dim', a: [L + 1.3, 0], b: [L + 1.3, o.tw], text: `agua ${m(o.tw)}`, off: 0 });
  if (o.sill > 0) items.push({ k: 'label', at: [L - 0.2, Math.max(o.sill + 0.35, o.tw * 0.45)], text: `umbral ${m(o.sill)}`, anchor: 'end', small: true });
  return { title: o.title, view: 'Perfil longitudinal', items };
}

/** Corte de la quebrada en el puente: paredes, estribos, abertura, tablero y nivel del agua. */
export function bridgePlan(o: { title: string; B: number; H: number; span: number; soffit: number; deck: number; yU: number }): Plan {
  const hb = o.B / 2, hs = o.span / 2, w = 0.3;
  const items: PlanItem[] = [];
  const top = Math.max(o.H, o.soffit + o.deck) + 0.3;
  items.push({ k: 'shape', fill: 'tierra', pts: [[-hb - w - 3, top], [-hb - w - 3, -0.8], [hb + w + 3, -0.8], [hb + w + 3, top], [hb + w, top], [hb + w, -0.3], [-hb - w, -0.3], [-hb - w, top]] });
  items.push({ k: 'shape', fill: 'concreto', pts: [[-hb - w, -0.3], [hb + w, -0.3], [hb + w, o.H], [hb, o.H], [hb, 0], [-hb, 0], [-hb, o.H], [-hb - w, o.H]] });
  if (hs < hb - 0.01) {
    items.push({ k: 'shape', fill: 'concreto', pts: [[-hb, 0], [-hs, 0], [-hs, o.soffit], [-hb, o.soffit]] });
    items.push({ k: 'shape', fill: 'concreto', pts: [[hs, 0], [hb, 0], [hb, o.soffit], [hs, o.soffit]] });
  }
  items.push({ k: 'shape', fill: 'concreto', pts: [[-hb - w - 1.5, o.soffit], [hb + w + 1.5, o.soffit], [hb + w + 1.5, o.soffit + o.deck], [-hb - w - 1.5, o.soffit + o.deck]] });
  const yw = Math.min(o.yU, o.soffit);
  items.push({ k: 'shape', fill: 'agua', pts: [[-hs, 0], [hs, 0], [hs, yw], [-hs, yw]] });
  items.push({ k: 'line', style: 'agua', pts: [[-hs, yw], [hs, yw]] });
  items.push({ k: 'dim', a: [-hs, 0], b: [hs, 0], text: `luz ${m(o.span, 1)}`, off: -0.5 });
  items.push({ k: 'dim', a: [hb + w + 0.8, 0], b: [hb + w + 0.8, o.soffit], text: `bajo ${m(o.soffit, 1)}`, off: 0 });
  items.push({ k: 'dim', a: [-hs + 0.4, 0], b: [-hs + 0.4, yw], text: `agua ${m(yw)}`, off: 0 });
  if (o.soffit - yw > 0.05) items.push({ k: 'label', at: [hs * 0.3, (yw + o.soffit) / 2], text: `gálibo ${m(o.soffit - yw)}`, small: true, anchor: 'start' });
  return { title: o.title, view: 'Corte transversal (mirando aguas abajo)', items };
}

/** Corte de la alcantarilla por la entrada: terraplén, conductos, vía y nivel del agua a la entrada. */
export function culvertPlan(o: { title: string; box: boolean; D: number; B: number; nb: number; road: number; hw: number }): Plan {
  const span = o.box ? o.B : o.D, gap = Math.max(0.6, span * 0.4), t = o.box ? 0.2 : Math.max(0.08, o.D / 12);
  const total = o.nb * span + (o.nb - 1) * gap;
  const crest = Math.max(4, total + 2), foot = crest / 2 + 1.5 * o.road;
  const items: PlanItem[] = [];
  items.push({ k: 'shape', fill: 'tierra', pts: [[-foot - 2, 0], [foot + 2, 0], [foot + 2, -0.8], [-foot - 2, -0.8]] });
  items.push({ k: 'shape', fill: 'relleno', pts: [[-foot, 0], [foot, 0], [crest / 2, o.road], [-crest / 2, o.road]] });
  items.push({ k: 'shape', fill: 'acero', pts: [[-crest / 2, o.road], [crest / 2, o.road], [crest / 2, o.road + 0.12], [-crest / 2, o.road + 0.12]] });
  const yw = Math.min(o.hw, o.road + 0.3);
  items.push({ k: 'line', style: 'agua', pts: [[-foot - 1.5, yw], [foot + 1.5, yw]] });
  for (let k = 0; k < o.nb; k++) {
    const cx = -total / 2 + span / 2 + k * (span + gap);
    if (o.box) {
      items.push({ k: 'shape', fill: 'concreto', pts: [[cx - span / 2 - t, -t], [cx + span / 2 + t, -t], [cx + span / 2 + t, o.D + t], [cx - span / 2 - t, o.D + t]] });
      items.push({ k: 'shape', fill: 'agua', pts: [[cx - span / 2, 0], [cx + span / 2, 0], [cx + span / 2, Math.min(o.D, yw)], [cx - span / 2, Math.min(o.D, yw)]] });
    } else {
      const ring = (rad: number): XY[] => Array.from({ length: 40 }, (_, j) => [cx + rad * Math.cos((2 * Math.PI * j) / 40), o.D / 2 + rad * Math.sin((2 * Math.PI * j) / 40)] as XY);
      items.push({ k: 'shape', fill: 'concreto', pts: ring(o.D / 2 + t) });
      items.push({ k: 'shape', fill: 'agua', pts: ring(o.D / 2) });
    }
  }
  const c0 = -total / 2 + span / 2;
  items.push({ k: 'dim', a: [c0 - span / 2, -0.35], b: [c0 + span / 2, -0.35], text: o.box ? `${m(o.B, 1)} × ${m(o.D, 1)}` : `D = ${m(o.D, 1)}`, off: -0.3 });
  items.push({ k: 'dim', a: [foot + 0.9, 0], b: [foot + 0.9, yw], text: `HW ${m(o.hw)}`, off: 0 });
  items.push({ k: 'dim', a: [-foot - 0.9, 0], b: [-foot - 0.9, o.road], text: `vía ${m(o.road, 1)}`, off: 0 });
  if (o.road - yw > 0.05) items.push({ k: 'label', at: [0, (yw + o.road) / 2 + 0.05], text: `${m(o.road - yw)} bajo la vía`, small: true });
  return { title: o.title, view: 'Corte por la entrada (mirando aguas abajo)', items };
}

/** Corte de un cauce trapecial con enrocado en el fondo y los taludes. */
export function riprapPlan(o: { title: string; b: number; h: number; d50: number; z?: number }): Plan {
  const z = o.z ?? 1.5, t = 2 * o.d50, hb = o.b / 2, H = o.h * 1.3 + 0.3, k = Math.sqrt(1 + z * z);
  const items: PlanItem[] = [];
  const side = 2;
  items.push({ k: 'shape', fill: 'tierra', pts: [[-hb - z * H - side, H], [-hb - z * H - side, -t - 0.7], [hb + z * H + side, -t - 0.7], [hb + z * H + side, H], [hb + z * H + t * k, H], [hb + t * (k - z), -t], [-hb - t * (k - z), -t], [-hb - z * H - t * k, H]] });
  items.push({ k: 'shape', fill: 'roca', pts: [[-hb - z * H, H], [-hb, 0], [hb, 0], [hb + z * H, H], [hb + z * H + t * k, H], [hb + t * (k - z), -t], [-hb - t * (k - z), -t], [-hb - z * H - t * k, H]] });
  items.push({ k: 'shape', fill: 'agua', pts: [[-hb, 0], [hb, 0], [hb + z * o.h, o.h], [-hb - z * o.h, o.h]] });
  items.push({ k: 'line', style: 'agua', pts: [[-hb - z * o.h, o.h], [hb + z * o.h, o.h]] });
  items.push({ k: 'dim', a: [-hb, -t], b: [hb, -t], text: `b = ${m(o.b, 1)}`, off: -0.5 });
  items.push({ k: 'dim', a: [hb + z * H + side * 0.5, 0], b: [hb + z * H + side * 0.5, o.h], text: `h = ${m(o.h)}`, off: 0 });
  items.push({ k: 'label', at: [0, -t - 1.15], text: `piedra d50 = ${m(o.d50)} · capa de ${m(t)} (2·d50)`, small: true });
  return { title: o.title, view: 'Corte transversal', items };
}

/** Alzado de un vertedero en el canal de aforo, con los niveles del agua del caudal mínimo y del máximo. */
export function weirPlan(o: { title: string; kind: 'rect' | 'tri'; b: number; Hc: number; P: number; h1: number; h2: number }): Plan {
  const hb = o.b / 2, w = 0.02;
  const items: PlanItem[] = [];
  items.push({ k: 'shape', fill: 'acero', pts: [[-hb - w, -w], [hb + w, -w], [hb + w, o.Hc], [hb, o.Hc], [hb, 0], [-hb, 0], [-hb, o.Hc], [-hb - w, o.Hc]] });
  if (o.kind === 'rect') items.push({ k: 'shape', fill: 'acero', pts: [[-hb, 0], [hb, 0], [hb, o.P], [-hb, o.P]] });
  else {
    const half = Math.min(hb, o.Hc - o.P);
    items.push({ k: 'shape', fill: 'acero', pts: [[-hb, 0], [hb, 0], [hb, o.Hc], [half, o.Hc], [0, o.P], [-half, o.Hc], [-hb, o.Hc]] });
  }
  items.push({ k: 'line', style: 'agua', pts: [[-hb, o.P + o.h1], [hb, o.P + o.h1]] });
  items.push({ k: 'line', style: 'agua', pts: [[-hb, o.P + o.h2], [hb, o.P + o.h2]] });
  items.push({ k: 'dim', a: [-hb, -0.03], b: [hb, -0.03], text: `${m(o.b, 2)}`, off: -0.02 });
  items.push({ k: 'dim', a: [hb + 0.06, 0], b: [hb + 0.06, o.P], text: o.kind === 'rect' ? `cresta ${m(o.P, 2)}` : `vértice ${m(o.P, 2)}`, off: 0 });
  items.push({ k: 'dim', a: [-hb - 0.06, o.P], b: [-hb - 0.06, o.P + o.h2], text: `H máx ${m(o.h2, 3)}`, off: 0 });
  items.push({ k: 'label', at: [0, o.P + o.h1 - 0.012], text: `H mín ${m(o.h1, 3)}`, small: true });
  return { title: o.title, view: 'Alzado aguas abajo', items };
}

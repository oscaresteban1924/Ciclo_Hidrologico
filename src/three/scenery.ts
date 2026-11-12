// Paisaje común de las maquetas: árboles de varias especies (copas redondeadas con sombra propia, cipreses y
// guayacanes en flor), con viento en las copas, y una pradera que ondula lejos de donde ocurre el experimento.
// Todo se arma con geometría y color por vértice, sin texturas descargadas.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lookMaterial } from './look';

function hash(x: number, y: number, z: number, s: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 13.3) * 43758.5453;
  return h - Math.floor(h);
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Sombreado propio de la copa en el color del vértice: más oscura abajo y adentro, más clara arriba y afuera
 * (las hojas de arriba reciben más cielo). Así la copa tiene volumen aun a la sombra.
 */
function shadeCrown(g: THREE.BufferGeometry, cy: number, top: number, bottom: number): void {
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  const N = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i);
    const k = THREE.MathUtils.clamp((y - bottom) / (top - bottom), 0, 1);
    const up = N.getY(i);
    const v = 0.6 + 0.38 * Math.pow(k, 0.8) + 0.1 * Math.max(0, up) - 0.06 * (y < cy ? 1 : 0);
    col.set([v, v, v * 0.97], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function bumpy(g0: THREE.BufferGeometry, seed: number, amp: number, squash = 0.92): THREE.BufferGeometry {
  // vértices soldados: la copa queda lisa (sin facetas) al recalcular las normales
  g0.deleteAttribute('normal');
  g0.deleteAttribute('uv');
  const g = mergeVertices(g0, 1e-4);
  g0.dispose();
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const k = 1 + amp * (hash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50), seed) - 0.5);
    P.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Copa de árbol frondoso: lóbulos redondeados, con radio total ≈ 1. */
function broadleaf(seed: number, flat = 1): THREE.BufferGeometry {
  const R = rng(seed);
  const lobes: [number, number, number, number][] = [[0, 0.05, 0, 0.78]];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + R() * 0.6;
    const rr = 0.42 + R() * 0.16;
    lobes.push([Math.cos(a) * rr, -0.12 + R() * 0.42, Math.sin(a) * rr, 0.42 + R() * 0.16]);
  }
  const parts = lobes.map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.translate(x, y, z);
    return g;
  });
  const g0 = mergeGeometries(parts) as THREE.BufferGeometry;
  parts.forEach((q) => q.dispose());
  g0.scale(1, 0.86 * flat, 1);
  const g = bumpy(g0, seed, 0.14, 1);
  shadeCrown(g, 0, 0.75 * flat, -0.55 * flat);
  return g;
}

/** Ciprés o pino: conos apilados, alto y angosto (radio ≈ 0,5, alto ≈ 2,4). */
function conifer(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const r = 0.62 - k * 0.12, h = 0.95 - k * 0.1;
    const c = new THREE.ConeGeometry(r, h, 10, 2);
    c.translate(0, -0.7 + k * 0.48 + h / 2, 0);
    parts.push(c);
  }
  const g0 = mergeGeometries(parts.map((q) => q.toNonIndexed())) as THREE.BufferGeometry;
  parts.forEach((q) => q.dispose());
  const g = bumpy(g0, seed, 0.1, 1);
  shadeCrown(g, 0.2, 1.5, -0.7);
  return g;
}

function trunkGeometry(): THREE.BufferGeometry {
  const t = new THREE.CylinderGeometry(0.09, 0.17, 1, 7, 1);
  t.translate(0, 0.5, 0);
  // dos ramas cortas que salen hacia la copa
  const b1 = new THREE.CylinderGeometry(0.035, 0.06, 0.55, 5);
  b1.rotateZ(0.7);
  b1.translate(0.16, 0.86, 0);
  const b2 = new THREE.CylinderGeometry(0.035, 0.06, 0.5, 5);
  b2.rotateZ(-0.6);
  b2.rotateY(1.9);
  b2.translate(-0.08, 0.82, 0.12);
  const g = mergeGeometries([t.toNonIndexed(), b1.toNonIndexed(), b2.toNonIndexed()]) as THREE.BufferGeometry;
  [t, b1, b2].forEach((q) => q.dispose());
  g.computeVertexNormals();
  return g;
}

let cache: { broad: THREE.BufferGeometry[]; cone: THREE.BufferGeometry; trunk: THREE.BufferGeometry; guaya: THREE.BufferGeometry } | null = null;
function geoms() {
  if (!cache) cache = { broad: [broadleaf(3), broadleaf(11), broadleaf(29)], cone: conifer(5), trunk: trunkGeometry(), guaya: broadleaf(41, 0.72) };
  return cache;
}

let crownMat: THREE.MeshStandardMaterial | null = null;
let trunkMat: THREE.MeshStandardMaterial | null = null;
function mats() {
  if (!crownMat) {
    crownMat = lookMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.82 }), { sway: 0.045, detail: 0.1 });
    trunkMat = lookMaterial(new THREE.MeshStandardMaterial({ color: '#6f4f37', roughness: 0.95 }), { detail: 0.18, scale: 3 });
  }
  return { crown: crownMat!, trunk: trunkMat! };
}

export interface TreeSpot {
  x: number;
  y: number;
  z: number;
  /** Radio de la copa. */
  r: number;
  color?: string;
}

const GREENS = ['#4c8a3a', '#5a9a43', '#3f7c35', '#68a54c', '#467f38', '#5e9140', '#7aa84f'];
const CONIFER = ['#2f6236', '#376e3b', '#2b5a33'];
const GUAYACAN = ['#e9c232', '#e7b62a', '#e58db8', '#d977a8'];

/**
 * Árboles con instancias: 3 formas de copa frondosa, cipreses y algunos guayacanes en flor (amarillos y
 * rosados, como en las vías de Medellín). Si el lugar trae color, se respeta.
 */
export function trees(spots: TreeSpot[], seed = 3): THREE.Group {
  const g = new THREE.Group();
  if (!spots.length) return g;
  const R = rng(seed * 7 + 1);
  const G = geoms();
  const M = mats();
  type Kind = 'b0' | 'b1' | 'b2' | 'cone' | 'guaya';
  const kinds: Kind[] = spots.map((s) => {
    if (s.color) return (['b0', 'b1', 'b2'] as Kind[])[Math.floor(R() * 3)];
    const u = R();
    return u < 0.13 ? 'cone' : u < 0.21 ? 'guaya' : (['b0', 'b1', 'b2'] as Kind[])[Math.floor(R() * 3)];
  });
  const geo: Record<Kind, THREE.BufferGeometry> = { b0: G.broad[0], b1: G.broad[1], b2: G.broad[2], cone: G.cone, guaya: G.guaya };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const Y = new THREE.Vector3(0, 1, 0);
  for (const kind of ['b0', 'b1', 'b2', 'cone', 'guaya'] as Kind[]) {
    const idx = spots.map((_, i) => i).filter((i) => kinds[i] === kind);
    if (!idx.length) continue;
    const im = new THREE.InstancedMesh(geo[kind], M.crown, idx.length);
    idx.forEach((i, n) => {
      const t = spots[i];
      const cone = kind === 'cone';
      const th = cone ? 0.5 + t.r * 0.3 : 1.1 + t.r * 0.55;
      q.setFromAxisAngle(Y, R() * Math.PI * 2);
      const sy = cone ? t.r * 1.15 : t.r * (0.88 + R() * 0.26);
      const cy = cone ? t.y + th + 0.7 * sy : t.y + th + t.r * 0.55;
      im.setMatrixAt(n, m.compose(p.set(t.x, cy, t.z), q, s.set(cone ? t.r * 0.95 : t.r, sy, cone ? t.r * 0.95 : t.r)));
      const pal = kind === 'cone' ? CONIFER : kind === 'guaya' ? GUAYACAN : GREENS;
      c.set(t.color ?? pal[Math.floor(R() * pal.length)]).multiplyScalar(0.92 + R() * 0.16);
      im.setColorAt(n, c);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  }
  const tm = new THREE.InstancedMesh(G.trunk, M.trunk, spots.length);
  spots.forEach((t, i) => {
    const cone = kinds[i] === 'cone';
    const th = cone ? 0.5 + t.r * 0.3 : 1.1 + t.r * 0.55;
    q.setFromAxisAngle(Y, R() * Math.PI * 2);
    const w = 0.8 + t.r * 0.22;
    tm.setMatrixAt(i, m.compose(p.set(t.x, t.y - 0.25, t.z), q, s.set(w, th + t.r * 0.45 + 0.25, w)));
  });
  tm.castShadow = true;
  g.add(tm);
  return g;
}

// ------------------------------------------------------------------ pradera

export interface MeadowOptions {
  /** Rectángulo [x0, x1, z0, z1] del mundo donde el suelo queda plano a la cota y0 (donde ocurre el experimento). */
  keep: [number, number, number, number];
  /** Extensión total [x0, x1, z0, z1]. */
  extent: [number, number, number, number];
  y0: number;
  /** Altura de las lomas lejanas (unidades). */
  hills?: number;
  /** Ancho de la transición desde el rectángulo plano (unidades). */
  ramp?: number;
  /** Tamaño de celda de la malla. */
  cell?: number;
  seed?: number;
  /** Excavaciones: la pradera baja a esta cota dentro de estos rectángulos [x0, x1, z0, z1, y]. */
  cuts?: [number, number, number, number, number][];
}

function vnoise(x: number, y: number, seed: number): number {
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, 0, seed), b = hash(i + 1, j, 0, seed), c = hash(i, j + 1, 0, seed), d = hash(i + 1, j + 1, 0, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number): number {
  return vnoise(x, y, seed) * 0.6 + vnoise(x * 2.1 + 5, y * 2.1 + 3, seed) * 0.28 + vnoise(x * 4.3 + 1, y * 4.3 + 9, seed) * 0.12;
}

/**
 * Pradera: plana donde ocurre el experimento y con lomas suaves que crecen hacia afuera; colores de pasto que
 * cambian por manchas (más seco en las lomas, más verde en lo bajo). Devuelve la malla y la función de altura.
 */
export function meadow(o: MeadowOptions): { mesh: THREE.Mesh; height: (x: number, z: number) => number } {
  const [x0, x1, z0, z1] = o.extent;
  const cell = o.cell ?? Math.max(1, (x1 - x0) / 160);
  const nx = Math.max(2, Math.round((x1 - x0) / cell)), nz = Math.max(2, Math.round((z1 - z0) / cell));
  const hills = o.hills ?? 8, ramp = o.ramp ?? 30, seed = o.seed ?? 1;
  const [k0, k1, k2, k3] = o.keep;
  const height = (x: number, z: number) => {
    const dx = Math.max(k0 - x, 0, x - k1), dz = Math.max(k2 - z, 0, z - k3);
    const d = Math.hypot(dx, dz);
    const w = THREE.MathUtils.smoothstep(d, 0, ramp);
    let y = o.y0 + w * hills * (fbm(x / 90, z / 90, seed) * 1.2 - 0.1);
    for (const [c0, c1, c2, c3, cy] of o.cuts ?? []) if (x >= c0 && x <= c1 && z >= c2 && z <= c3) y = Math.min(y, cy);
    return y;
  };
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(P.count * 3);
  const lush = new THREE.Color('#79b457'), dry = new THREE.Color('#b8bb70'), deep = new THREE.Color('#62a04a'), cc = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i);
    const y = height(x, z);
    P.setY(i, y);
    const n = fbm(x / 26 + 3, z / 26 - 2, seed + 4);
    const hk = THREE.MathUtils.clamp((y - o.y0) / Math.max(1, hills), 0, 1);
    cc.copy(lush).lerp(deep, THREE.MathUtils.smoothstep(n, 0.35, 0.1)).lerp(dry, THREE.MathUtils.smoothstep(n, 0.55, 0.85) * 0.7 + hk * 0.25);
    col.set([cc.r, cc.g, cc.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = lookMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.97 }), { detail: 0.08, patches: 0.05, clouds: [0.16, Math.max(30, (x1 - x0) / 5)] });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  return { mesh, height };
}

// ------------------------------------------------------------------ maqueta de terreno

/** Color del piso de estudio bajo las maquetas (el mismo del suelo del cielo, para que no se vea el borde). */
export const STUDIO_FLOOR = '#dfe5e1';

/** Capas del suelo en los cortes de la maqueta: de la capa vegetal a la roca, con bordes ondulados. */
const STRATA: [number, string][] = [
  [0, '#5d4630'],
  [0.7, '#7a5a3b'],
  [2.4, '#a07a4f'],
  [5.5, '#b58b5c'],
  [9, '#9b6f4a'],
  [14, '#8a8378'],
  [22, '#6f6a63'],
];

function strataColor(depth: number, x: number, z: number, out: THREE.Color): THREE.Color {
  const wob = (vnoise(x * 0.05 + z * 0.05, 0.5, 9) - 0.5) * 1.6;
  const d = depth + wob;
  let k = 0;
  while (k < STRATA.length - 1 && d > STRATA[k + 1][0]) k++;
  out.set(STRATA[k][1]);
  // grano dentro de cada capa
  out.multiplyScalar(0.9 + 0.18 * vnoise(x * 0.4 + d * 0.8, z * 0.4 - d, 3));
  return out;
}

/**
 * Piso de estudio bajo una maqueta: del mismo color que el suelo del cielo (sin borde visible) y una capa aparte
 * que recibe las sombras.
 */
export function studioFloor(cx: number, cz: number, R0: number, y: number, floorColor = STUDIO_FLOOR): THREE.Group {
  const g = new THREE.Group();
  const fg = new THREE.CircleGeometry(R0 * 5, 72);
  fg.rotateX(-Math.PI / 2);
  const fp = fg.attributes.position as THREE.BufferAttribute;
  const fcol = new Float32Array(fp.count * 3);
  const fc0 = new THREE.Color(floorColor).multiplyScalar(0.97), fc1 = new THREE.Color(floorColor), c = new THREE.Color();
  for (let k = 0; k < fp.count; k++) {
    const r = Math.hypot(fp.getX(k), fp.getZ(k)) / R0;
    c.copy(fc0).lerp(fc1, THREE.MathUtils.smoothstep(r, 0.6, 1.2));
    fcol.set([c.r, c.g, c.b], 3 * k);
  }
  fg.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3));
  const floor = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  floor.material.userData.noLook = true;
  floor.position.set(cx, y - 0.06, cz);
  const shade = new THREE.Mesh(new THREE.CircleGeometry(R0 * 2.2, 48), new THREE.ShadowMaterial({ opacity: 0.18 }));
  shade.rotateX(-Math.PI / 2);
  shade.position.set(cx, y - 0.04, cz);
  shade.receiveShadow = true;
  g.add(floor, shade);
  return g;
}

/**
 * Pared de corte del terreno a lo largo de una polilínea [x, z], desde la superficie `top(x, z)` hasta `base`, con
 * las capas del suelo. Se ve por los dos lados.
 */
export function strataWall(edge: [number, number][], top: (x: number, z: number) => number, base: number): THREE.Mesh {
  const rows = 14;
  const p: number[] = [], cc: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  edge.forEach(([x, z], k) => {
    const y = top(x, z);
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      // más filas cerca de la superficie, donde las capas son delgadas
      const yy = y - (y - base) * Math.pow(t, 1.6);
      p.push(x, yy, z);
      strataColor(y - yy, x, z, c);
      cc.push(c.r, c.g, c.b);
    }
    if (k < edge.length - 1) {
      const a = (rows + 1) * k, b = (rows + 1) * (k + 1);
      for (let r = 0; r < rows; r++) idx.push(a + r, a + r + 1, b + r, b + r, a + r + 1, b + r + 1);
    }
  });
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
  wg.setIndex(idx);
  wg.computeVertexNormals();
  const walls = new THREE.Mesh(wg, lookMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), { detail: 0.2, scale: 1.5 }));
  walls.receiveShadow = true;
  return walls;
}

/**
 * Maqueta de terreno con superficie lisa, color según la pendiente (roca y tierra en lo empinado), lo cóncavo
 * (más verde y oscuro en los bajos) y lo convexo (más seco en las lomas); paredes de corte con capas de suelo y
 * un piso que se funde con el fondo. `color` da el color de base (pasto, calles, potreros).
 */
export function terrainBlock(h: (x: number, z: number) => number, x0: number, x1: number, z0: number, z1: number, nx: number, nz: number, color: (x: number, z: number, y: number) => THREE.Color, base: number, floorColor = STUDIO_FLOOR): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < pos.count; k++) pos.setY(k, h(pos.getX(k), pos.getZ(k)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const dx = (x1 - x0) / nx, dz = (z1 - z0) / nz, d = 2 * Math.max(dx, dz);
  const col = new Float32Array(pos.count * 3);
  const rock = new THREE.Color('#8a7f70'), earth = new THREE.Color('#8f7350'), c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k), y = pos.getY(k);
    c.copy(color(x, z, y));
    const slope = 1 - nrm.getY(k);
    const cav = y - (h(x + d, z) + h(x - d, z) + h(x, z + d) + h(x, z - d)) / 4;
    c.lerp(earth, THREE.MathUtils.smoothstep(slope, 0.12, 0.3) * 0.45).lerp(rock, THREE.MathUtils.smoothstep(slope, 0.3, 0.55) * 0.75);
    c.multiplyScalar(1 + THREE.MathUtils.clamp(cav / Math.max(0.5, d * 0.15), -1, 1) * 0.08);
    col.set([c.r, c.g, c.b], 3 * k);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const topMat = lookMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { detail: 0.15, patches: 0.12, clouds: [0.15, Math.max(30, Math.max(x1 - x0, z1 - z0) / 4)] });
  const top = new THREE.Mesh(geo, topMat);
  top.receiveShadow = true;
  top.castShadow = true;
  // paredes del corte: capas de suelo desde la superficie hasta la base
  const edge: [number, number][] = [];
  for (let i = 0; i <= nx; i++) edge.push([x0 + ((x1 - x0) * i) / nx, z1]);
  for (let j = nz - 1; j >= 0; j--) edge.push([x1, z0 + ((z1 - z0) * j) / nz]);
  for (let i = nx - 1; i >= 0; i--) edge.push([x0 + ((x1 - x0) * i) / nx, z0]);
  for (let j = 1; j <= nz; j++) edge.push([x0, z0 + ((z1 - z0) * j) / nz]);
  const walls = strataWall(edge, h, base);
  const floor = studioFloor((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) * 0.5, base, floorColor);
  g.add(top, walls, floor);
  return g;
}

// ------------------------------------------------------------------ aves

/** Bandada de aves que planean en círculos sobre la maqueta (alas que aletean de vez en cuando). */
export class Birds {
  readonly group = new THREE.Group();
  private birds: { body: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; a0: number; rr: number; h: number; sp: number; ph: number }[] = [];
  constructor(
    private center: THREE.Vector3,
    radius: number,
    height: number,
    n = 7,
    size = 1,
  ) {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.18, 0, 0, 0.18, 1, 0.04, 0.05], 3));
    wing.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#2f3a44', roughness: 0.8, side: THREE.DoubleSide });
    mat.userData.noLook = true;
    const R = rng(77);
    for (let k = 0; k < n; k++) {
      const body = new THREE.Group();
      const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
      r.scale.x = -1;
      body.add(l, r);
      body.scale.setScalar(size * (0.8 + R() * 0.4));
      this.group.add(body);
      this.birds.push({ body, l, r, a0: R() * Math.PI * 2, rr: radius * (0.55 + R() * 0.45), h: height * (0.85 + R() * 0.3), sp: (0.08 + R() * 0.06) * (R() < 0.5 ? 1 : -1), ph: R() * 10 });
    }
  }
  update(t: number): void {
    for (const b of this.birds) {
      const a = b.a0 + t * b.sp;
      const x = this.center.x + Math.cos(a) * b.rr, z = this.center.z + Math.sin(a) * b.rr;
      b.body.position.set(x, this.center.y + b.h + Math.sin(t * 0.5 + b.ph) * b.h * 0.05, z);
      // mira en la dirección del vuelo y se inclina hacia adentro del círculo
      b.body.rotation.set(0, -a + (b.sp > 0 ? 0 : Math.PI), (b.sp > 0 ? 1 : -1) * 0.25);
      // aleteo en ráfagas, planeo el resto del tiempo
      const burst = Math.max(0, Math.sin(t * 0.7 + b.ph));
      const flap = Math.sin(t * 11 + b.ph) * 0.55 * burst + 0.12;
      b.l.rotation.z = flap;
      b.r.rotation.z = -flap;
    }
  }
}

// ------------------------------------------------------------------ lluvia

/**
 * Lluvia en trazos: cada gota es un segmento corto que cae (largo según la velocidad, inclinado por el viento),
 * con anillos de salpicadura donde llega al suelo. `intensity` (0..1) decide cuántas gotas se ven.
 */
export class RainStreaks {
  readonly group = new THREE.Group();
  private lines: THREE.LineSegments;
  private v: Float32Array;
  private xz: Float32Array;
  private y: Float32Array;
  private splash: THREE.InstancedMesh;
  private sAge: Float32Array;
  private sNext = 0;
  private n: number;
  intensity = 0;
  constructor(
    private box: { x0: number; x1: number; z0: number; z1: number; top: number },
    private ground: (x: number, z: number) => number,
    n = 2400,
    private speed = 70,
    private len = 2.2,
    private wind: [number, number] = [0.12, 0.04],
    splashSize = 0.6,
  ) {
    this.n = n;
    const R = rng(31);
    const pos = new Float32Array(n * 6);
    this.v = new Float32Array(n);
    this.xz = new Float32Array(n * 2);
    this.y = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      this.xz[2 * k] = box.x0 + R() * (box.x1 - box.x0);
      this.xz[2 * k + 1] = box.z0 + R() * (box.z1 - box.z0);
      this.y[k] = ground(this.xz[2 * k], this.xz[2 * k + 1]) + R() * (box.top - ground(this.xz[2 * k], this.xz[2 * k + 1]));
      this.v[k] = speed * (0.85 + R() * 0.3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const col = new Float32Array(n * 6);
    for (let k = 0; k < n; k++) col.set([0.62, 0.74, 0.84, 0.92, 0.96, 1], k * 6);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }));
    this.lines.frustumCulled = false;
    const ring = new THREE.RingGeometry(0.55, 0.7, 16);
    ring.rotateX(-Math.PI / 2);
    this.splash = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: '#e7f3fb', transparent: true, opacity: 0.55, depthWrite: false }), 260);
    this.splash.frustumCulled = false;
    this.splash.userData.size = splashSize;
    this.sAge = new Float32Array(260).fill(9);
    for (let k = 0; k < 260; k++) this.splash.setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0));
    this.group.add(this.lines, this.splash);
    this.group.visible = false;
  }
  private m = new THREE.Matrix4();
  update(dt: number): void {
    const on = this.intensity > 0.001;
    this.group.visible = on;
    if (!on) return;
    const count = Math.max(1, Math.round(this.n * Math.min(1, this.intensity)));
    const P = this.lines.geometry.attributes.position as THREE.BufferAttribute;
    const a = P.array as Float32Array;
    const [wx, wz] = this.wind;
    const size = this.splash.userData.size as number;
    for (let k = 0; k < count; k++) {
      let x = this.xz[2 * k], z = this.xz[2 * k + 1];
      let y = this.y[k] - this.v[k] * dt;
      x += wx * this.v[k] * dt;
      z += wz * this.v[k] * dt;
      const gy = this.ground(x, z);
      if (y <= gy) {
        // salpicadura (una de cada pocas gotas, para no llenar el suelo)
        if ((k & 3) === 0) {
          const i = this.sNext++ % this.sAge.length;
          this.sAge[i] = 0;
          this.splash.setMatrixAt(i, this.m.makeTranslation(x, gy + 0.05, z));
        }
        x = this.box.x0 + Math.random() * (this.box.x1 - this.box.x0);
        z = this.box.z0 + Math.random() * (this.box.z1 - this.box.z0);
        y = this.box.top - Math.random() * 6;
      }
      if (x > this.box.x1) x -= this.box.x1 - this.box.x0;
      if (z > this.box.z1) z -= this.box.z1 - this.box.z0;
      this.xz[2 * k] = x;
      this.xz[2 * k + 1] = z;
      this.y[k] = y;
      const L = this.len * (this.v[k] / this.speed);
      a.set([x, y, z, x - wx * L, y + L, z - wz * L], k * 6);
    }
    P.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, count * 2);
    // anillos que crecen y se borran
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < this.sAge.length; i++) {
      if (this.sAge[i] > 0.5) continue;
      this.sAge[i] += dt;
      this.splash.getMatrixAt(i, this.m);
      this.m.decompose(pos, q, sc);
      const s = this.sAge[i] > 0.5 ? 0 : size * (0.3 + this.sAge[i] * 2.4);
      this.splash.setMatrixAt(i, this.m.compose(pos, q, sc.set(s, s, s)));
    }
    this.splash.instanceMatrix.needsUpdate = true;
  }
}

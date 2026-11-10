// Entorno del sector: el Valle de Aburrá de referencia (aburra.ts) alrededor de la maqueta, a escala 1:1.
// Es solo dibujo: no interviene en el cálculo. La maqueta se ubica en su punto del esquema del valle
// (ilustrativo en los escenarios didácticos; su lon/lat si viene de datos reales) y desde ella se ven,
// a su distancia y altura aproximadas:
//  · el relieve del valle (cotas y trazados APROXIMADOS, no un modelo digital de elevación);
//  · el río canalizado con su parque lineal y las autopistas a lado y lado;
//  · el metro elevado (líneas A y B) con estaciones y trenes, el tranvía y los metrocables;
//  · los cerros tutelares, las quebradas con árboles en sus retiros y el bosque de las partes altas;
//  · los barrios: cuadras con casas pegadas en lo plano, casas escalonadas en las laderas, torres en el
//    Centro y en El Poblado, y las montañas que cierran el valle.
// Nada de esto se presenta como infraestructura levantada ni como la posición real de los sectores.

import * as THREE from 'three';
import { prng } from '../scenarios/primitives';
import { CABLES, EXTENT, Fabric, HILLS, METRO_A, METRO_B, PLACES, ROADS, TRANVIA, creeks, cross, fabricAt, forestAt, outerZ, riverAt, type Line } from './aburra';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CARPET_GLSL } from './carpet';

/** Cómo está el sector: el entorno continúa su terreno sin escalones (no queda «flotando»). */
export interface SectorFit {
  /** Medio ancho (x) y medio largo (z) del sector en el mundo [m]. */
  hw: number;
  hh: number;
  /** Plano que mejor ajusta el terreno del sector: y = a + gx·x + gz·z (mundo). */
  plane: { a: number; gx: number; gz: number };
  /** Altura exacta del borde del sector en el punto (x, z) del borde (mundo). */
  edgeY(x: number, z: number): number;
  /** Color de la superficie del sector en el borde (mismos valores que la maqueta). */
  edgeRgb(x: number, z: number): [number, number, number];
  /** Paso de la franja de unión [m] (el de las celdas del sector). */
  cell: number;
}

export interface BackdropOpts {
  baseY: number;
  /** Medio ancho y medio largo de la zona libre alrededor de la maqueta [m]. */
  clearX: number;
  clearZ: number;
  quality: 'alta' | 'ligera';
  sector: SectorFit;
  /** Punto del esquema del valle donde se ubica el sector [km] (x este, y norte). */
  spot: [number, number];
  /**
   * Estilo maqueta (sectores con datos reales): el entorno, que es solo dibujo, se vuelve volúmenes blancos y
   * relieve claro con curvas de nivel, y queda un poco más bajo que el sector, que se lee como un bloque de
   * terreno recortado. Así lo real (el sector) no compite con lo ilustrativo (el valle).
   */
  maqueta?: boolean;
}

/** Desnivel entre el borde del sector y el entorno en el estilo maqueta [m]. */
export const MAQUETA_DROP = 2.6;

/** Lugar lejano que se puede rotular para orientarse. */
export interface Landmark {
  id: string;
  text: string;
  at: THREE.Vector3;
  priority: number;
}

export interface Backdrop {
  group: THREE.Group;
  /** Altura del suelo dibujado del entorno en (x, z) del mundo (franja de unión incluida). */
  groundY(x: number, z: number): number;
  /** Rehace la franja de unión con el borde actual del sector (al cambiar la resolución). */
  refreshApron(): void;
  /** Avanza los elementos móviles (metro y cabinas), la luz de las ventanas y el tono de la tormenta. */
  /** Avanza trenes y cabinas; oscurece y moja con la tormenta; muestra las nubes bajas (lejos de la cámara). */
  update(dt: number, storm: number, cam?: THREE.Vector3): void;
  /** Lugares para rotular (río, metro, metrocables, cerros, Centro…). */
  landmarks: Landmark[];
  /** Texturas propias (se liberan al salir). */
  textures: THREE.Texture[];
  /** Nivel de detalle: 2 = todo; 1 = sin volúmenes lejanos ni nubes (el relieve sigue mostrando la ciudad). */
  setDetail(level: 1 | 2): void;
  detail: 1 | 2;
}

function smooth(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Copa de árbol con varios lóbulos y caras planas (se lee como follaje y no como una esfera). Radio ≈ 1,
 * centrada en el origen. También la usan los árboles de la maqueta.
 */
export function crownGeometry(detail = 0, seed = 7, nLobes = 6): THREE.BufferGeometry {
  const lobes: [number, number, number, number][] = [[0, 0.1, 0, 0.8], [0.5, -0.1, 0.22, 0.6], [-0.46, -0.06, -0.24, 0.62], [0.08, 0.44, -0.3, 0.55], [-0.22, 0.32, 0.44, 0.52], [0.3, -0.25, -0.45, 0.48]];
  const parts = lobes.slice(0, nLobes).map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    g.translate(x, y, z);
    return g;
  });
  const g = mergeGeometries(parts) as THREE.BufferGeometry;
  parts.forEach((q) => q.dispose());
  // irregularidad: cada vértice se mueve según su posición (los vértices repetidos se mueven igual)
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed) * 43758.5453;
    const k = 1 + 0.16 * (h - Math.floor(h) - 0.5);
    P.setXYZ(i, x * k, y * k * 0.92, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Reparte instancias en mallas por sector de dirección (y cerca/lejos) para que la cámara descarte las que
 * quedan detrás de ella: con miles de casas y árboles, dibujar solo lo que se ve ahorra mucho trabajo.
 */
function bucketed<T extends { x: number; z: number }>(items: T[], near: number, make: (geo: THREE.BufferGeometry, n: number) => THREE.InstancedMesh, geo: THREE.BufferGeometry, fill: (mesh: THREE.InstancedMesh, item: T, i: number) => void, after?: (mesh: THREE.InstancedMesh, list: T[]) => void): THREE.InstancedMesh[] {
  const groups = new Map<number, T[]>();
  for (const it of items) {
    const a = Math.floor(((Math.atan2(it.z, it.x) + Math.PI) / (2 * Math.PI)) * 8) % 8;
    const key = a + (Math.hypot(it.x, it.z) > near ? 8 : 0);
    const arr = groups.get(key);
    if (arr) arr.push(it);
    else groups.set(key, [it]);
  }
  const out: THREE.InstancedMesh[] = [];
  for (const [key, list] of groups) {
    const mesh = make(geo.clone(), list.length);
    mesh.userData.far = key >= 8;
    list.forEach((it, i) => fill(mesh, it, i));
    after?.(mesh, list);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.frustumCulled = true;
    out.push(mesh);
  }
  return out;
}

/** Primer índice i con arr[i] ≥ v (arr creciente). */
function lowerBound(arr: number[], v: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

// ---------------------------------------------------------------- material de edificios (ventanas y techos)
export function buildingMaterial(night: { value: number }, opts: { windows?: boolean; light?: boolean; maqueta?: boolean } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  m.defines = {};
  if (opts.windows === false || opts.maqueta) m.defines.NO_WINDOWS = '';
  if (opts.maqueta) m.defines.MAQUETA = '';
  // calidad ligera: sin hiladas, rejas, marcos ni balcones (cada píxel cuesta menos)
  if (opts.light) m.defines.LIGERA = '';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aHouse; // tipo de techo, base enterrada [m], semilla
        varying vec3 vLoc; varying vec3 vScl; varying vec3 vNObj; varying vec3 vHouse;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLoc = position; vNObj = normal; vHouse = aHouse;
        vScl = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uNight;
        varying vec3 vLoc; varying vec3 vScl; varying vec3 vNObj; varying vec3 vHouse;
        float hh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float lit = 0.0;
        if (vNObj.y > 0.5) {
          // azotea de concreto, teja de barro o zinc
          float rt = mod(vHouse.x, 10.0);
          vec3 roof = rt < 0.5 ? vec3(0.4, 0.39, 0.37) * (0.85 + 0.3 * vHouse.z) : rt < 1.5 ? vec3(0.6, 0.26, 0.15) * (0.85 + 0.25 * vHouse.z) : rt < 2.5 ? vec3(0.47, 0.5, 0.53) : diffuseColor.rgb * 0.7;
          diffuseColor.rgb = roof;
        }
        #ifndef NO_WINDOWS
        else if (vNObj.y > -0.5) {
          float hc = (abs(vNObj.x) > 0.5 ? vLoc.z * vScl.z : vLoc.x * vScl.x) + 50.0;
          float vc = vLoc.y * vScl.y - vHouse.y;
          float rt = mod(vHouse.x, 10.0);
          float tower = step(2.5, rt) * step(rt, 3.5);
          if (vc > 0.0) {
            float isBrick = step(diffuseColor.g * 2.0, diffuseColor.r) * step(diffuseColor.b, diffuseColor.g * 1.2);
            float isGray = step(abs(diffuseColor.r - diffuseColor.g), 0.05) * step(abs(diffuseColor.g - diffuseColor.b), 0.06) * step(diffuseColor.r, 0.62);
            // culatas (paredes de los lados, pegadas a la casa vecina): ladrillo a la vista y sin ventanas,
            // aunque el frente esté pañetado y pintado (rasgo muy de Medellín)
            float culata = step(0.5, abs(vNObj.x)) * (1.0 - tower);
            vec3 brickC = vec3(0.64, 0.33, 0.22) * (0.88 + 0.22 * vHouse.z);
            diffuseColor.rgb = mix(diffuseColor.rgb, brickC, culata * (1.0 - isBrick) * (1.0 - isGray));
            isBrick = max(isBrick, culata * (1.0 - isGray));
            float front = step(0.5, vNObj.z) * (1.0 - tower);
            #ifndef LIGERA
            // ladrillo a la vista: hiladas finas que se desvanecen con la distancia (sin parpadeo)
            float fw = fwidth(vc / 0.3);
            float course = (1.0 - smoothstep(0.08, 0.2, abs(fract(vc / 0.3) - 0.5) - 0.38)) * (1.0 - smoothstep(0.15, 0.45, fw));
            diffuseColor.rgb *= 1.0 - 0.12 * course * isBrick;
            // mural de colores en algunas fachadas de los barrios de ladera
            if (vHouse.x > 9.5 && front > 0.5) {
              vec2 mp = vec2(hc, vc) * 0.32 + vHouse.z * 13.0;
              float m1 = sin(mp.x * 1.3 + sin(mp.y * 0.9) * 2.2) + sin(mp.y * 1.7 - mp.x * 0.6);
              vec3 mc = m1 > 1.0 ? vec3(0.95, 0.75, 0.15) : m1 > 0.3 ? vec3(0.15, 0.62, 0.7) : m1 > -0.4 ? vec3(0.9, 0.35, 0.45) : m1 > -1.1 ? vec3(0.35, 0.7, 0.3) : vec3(0.3, 0.3, 0.75);
              diffuseColor.rgb = mix(diffuseColor.rgb, mc, 0.85);
            }
            #endif
            float fx = fract(hc / 2.8), fy = fract(vc / 2.9);
            vec2 cellId = vec2(floor(hc / 2.8), floor(vc / 2.9)) + vHouse.z * 97.0;
            float top = vScl.y - vHouse.y - 0.6;
            // ventanas angostas; en la parte de atrás, menos; en las culatas, casi ninguna
            float ww = 0.17 + 0.06 * hh(vec2(vHouse.z * 31.0, 1.0));
            float inWin = step(0.5 - ww, fx) * step(fx, 0.5 + ww) * step(0.36, fy) * step(fy, 0.8);
            float keep = mix(mix(step(0.45, hh(cellId + 3.0)), 1.0, max(front, tower)), step(0.93, hh(cellId + 5.0)) * 0.6, culata);
            float win = inWin * keep * step(2.6, vc) * step(vc, top);
            // primer piso del frente: puertas y persianas metálicas de local o garaje (rasgo de los barrios)
            float g1 = front * step(vc, 2.6);
            float shutter = g1 * step(0.55, hh(cellId + 7.0)) * step(0.1, fx) * step(fx, 0.9) * step(0.05, vc) * step(vc, 2.45);
            float door = g1 * (1.0 - step(0.55, hh(cellId + 7.0))) * step(0.36, fx) * step(fx, 0.64) * step(vc, 2.2);
            float slats = 0.85 + 0.15 * step(0.5, fract(vc * 6.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.64, 0.66) * slats, shutter);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.22, 0.16), door);
            win *= 1.0 - shutter;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.16, 0.2), win * 0.85);
            lit = win * step(0.82, hh(cellId));
            float slab = step(fract(vc / 2.9), 0.07) * step(1.0, vc);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.61, 0.58), slab * 0.6);
            #ifndef LIGERA
            // reja de la ventana (barrotes verticales) y marco claro, solo de cerca
            float near = 1.0 - smoothstep(0.08, 0.25, fwidth(fx * 2.8));
            float bars = win * step(0.62, fract(fx * 2.8 / 0.14)) * front * step(0.4, hh(cellId + 11.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.9, 0.88), bars * 0.75 * near);
            float frame = step(0.47 - ww, fx) * step(fx, 0.53 + ww) * step(0.33, fy) * step(fy, 0.83) * (1.0 - inWin) * keep * step(2.6, vc) * step(vc, top);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.85, 0.82), frame * 0.7 * near);
            // en algunos frentes, balcón con baranda
            float balcony = front * step(2.6, vc) * step(0.7, hh(cellId + 13.0)) * step(0.07, fy) * step(fy, 0.3) * step(0.18, fx) * step(fx, 0.82) * step(0.5, fract(fx * 2.8 / 0.18));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.21, 0.22), balcony * 0.8 * near);
            #endif
          } else {
            diffuseColor.rgb *= 0.7;
          }
        }
        #endif
        #ifdef MAQUETA
        // volumen blanco de maqueta: techos un poco más claros que los muros
        diffuseColor.rgb = vec3(0.9, 0.89, 0.86) * (0.95 + 0.08 * vHouse.z) * (vNObj.y > 0.5 ? 1.04 : 1.0);
        #endif`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * lit * uNight * 0.9;');
  };
  return m;
}

// ---------------------------------------------------------------- construcción
export function buildBackdrop(opts: BackdropOpts): Backdrop {
  const alta = opts.quality === 'alta';
  const rnd = prng(1675); // año de fundación de la villa: semilla fija
  const group = new THREE.Group();
  const night = { value: 0 };
  const wet = { value: 0 };
  const textures: THREE.Texture[] = [];
  const sec = opts.sector;
  const baseY = opts.baseY;
  const MQ = !!opts.maqueta;
  const drop = MQ ? MAQUETA_DROP : 0;
  const [sx, sy] = opts.spot;
  const zSpot = outerZ(sx, sy);
  // altura del plano del sector en su centro, sobre el nivel base: el valle se cuelga de ese punto
  const Y0 = sec.plane.a - baseY;
  /** Mundo (x este, z sur) [m] → esquema del valle [km]. */
  const kmOf = (x: number, z: number): [number, number] => [sx + x / 1000, sy - z / 1000];
  /** Esquema [km] → mundo [m]. */
  const wOf = (xk: number, yk: number): [number, number] => [(xk - sx) * 1000, (sy - yk) * 1000];
  const inClear = (x: number, z: number, m: number) => Math.abs(x) < opts.clearX + m && Math.abs(z) < opts.clearZ + m;

  // ---- relieve: el del valle de referencia a escala 1:1; junto al sector sigue el plano de su pendiente
  // y se funde con el valle a ≈ 230 m, así la maqueta continúa afuera sin escalones.
  const blendPlane = (x: number, z: number, y: number) => {
    const dR = Math.max(Math.abs(x) - sec.hw, Math.abs(z) - sec.hh, 0);
    const wP = 1 - smooth(18, 230, dR);
    if (wP <= 0) return y;
    const pl = sec.plane.a + sec.plane.gx * x + sec.plane.gz * z - baseY;
    return y * (1 - wP) + pl * wP;
  };

  // Malla con paso fino cerca del sector y creciente hacia el horizonte (hasta 30 km)
  const st = alta ? 20 : 40, K = alta ? 60 : 22, grow = alta ? 1.13 : 1.18;
  const lines: number[] = [];
  for (let k = -K; k <= K; k++) lines.push(k * st);
  for (let s = st, x = K * st; x < 30000; ) {
    s *= grow;
    x += s;
    lines.push(x);
    lines.unshift(-x);
  }
  const n = lines.length, I0 = lines.indexOf(0);
  const N = n * n;
  // Hueco de la malla alrededor del sector (alineado a la malla): lo cubre la franja de unión
  const M = 12;
  const kx0 = Math.floor((-sec.hw - M) / st), kx1 = Math.ceil((sec.hw + M) / st);
  const kz0 = Math.floor((-sec.hh - M) / st), kz1 = Math.ceil((sec.hh + M) / st);
  const hx0 = kx0 * st, hx1 = kx1 * st, hz0 = kz0 * st, hz1 = kz1 * st;
  const inHole = (x: number, z: number) => x > hx0 && x < hx1 && z > hz0 && z < hz1;

  const Yg = new Float32Array(N); // altura dibujada sobre el nivel base
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), urb = new Float32Array(N * 2), veg = new Float32Array(N), ubc = new Float32Array(N * 3);
  const cv = new THREE.Color();
  const pasture = new THREE.Color('#84ad5c'), forest = new THREE.Color('#3f6c34'), high = new THREE.Color('#5f8546'), park = new THREE.Color('#6d9a4c');
  const urbBase: Record<number, THREE.Color> = {
    [Fabric.Ladera]: new THREE.Color('#a05a3d'),
    [Fabric.Plano]: new THREE.Color('#7f7a62'),
    [Fabric.Centro]: new THREE.Color('#8e8780'),
    [Fabric.Poblado]: new THREE.Color('#6f7457'),
    [Fabric.Industria]: new THREE.Color('#9b9a96'),
    [Fabric.Municipio]: new THREE.Color('#946651'),
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = lines[i], z = lines[j], o = j * n + i;
    const [xk, yk] = kmOf(x, z);
    const zr = outerZ(xk, yk);
    const y = blendPlane(x, z, zr - zSpot + Y0);
    Yg[o] = y;
    pos[o * 3] = x;
    pos[o * 3 + 1] = baseY + y;
    pos[o * 3 + 2] = z;
    const h = Math.min(1, Math.max(0, (zr - 1700) / 1200));
    cv.copy(pasture).lerp(high, h * 0.7);
    if (cross(xk, yk).d < 0.09) cv.copy(park);
    col[o * 3] = cv.r;
    col[o * 3 + 1] = cv.g;
    col[o * 3 + 2] = cv.b;
    const fab = fabricAt(xk, yk, zr);
    urb[o * 2] = fab.f;
    urb[o * 2 + 1] = fab.k;
    veg[o] = Math.min(1, forestAt(xk, yk));
    const b = urbBase[fab.f] ?? forest;
    ubc[o * 3] = b.r;
    ubc[o * 3 + 1] = b.g;
    ubc[o * 3 + 2] = b.b;
  }
  // Quebradas en el mundo (cada ≈ 30 m), con un índice espacial para consultar su distancia
  const creekPts: [number, number][] = [];
  for (const c of creeks()) {
    for (let q = 1; q < c.pts.length; q++) {
      const [ax, az] = wOf(...c.pts[q - 1]), [bx, bz] = wOf(...c.pts[q]);
      const L = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(L / 30));
      for (let k = 0; k < m; k++) creekPts.push([ax + ((bx - ax) * k) / m, az + ((bz - az) * k) / m]);
    }
  }
  const CB = 100, cbuck = new Map<string, [number, number][]>();
  for (const p of creekPts) {
    const key = `${Math.floor(p[0] / CB)},${Math.floor(p[1] / CB)}`;
    const arr = cbuck.get(key);
    if (arr) arr.push(p);
    else cbuck.set(key, [p]);
  }
  /** Distancia a la quebrada más cercana [m] (hasta 200 m; más lejos devuelve 1e9). */
  const creekD = (x: number, z: number) => {
    let best = 1e9;
    const bi = Math.floor(x / CB), bj = Math.floor(z / CB);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const arr = cbuck.get(`${bi + di},${bj + dj}`);
      if (arr) for (const [px, pz] of arr) best = Math.min(best, Math.hypot(px - x, pz - z));
    }
    return best;
  };
  // Retiros de las quebradas: franjas de bosque que bajan entre los barrios
  for (const [px, pz] of creekPts) {
    const sg = 34;
    const i0 = Math.max(0, lowerBound(lines, px - 3 * sg) - 1), i1 = Math.min(n - 1, lowerBound(lines, px + 3 * sg));
    const j0 = Math.max(0, lowerBound(lines, pz - 3 * sg) - 1), j1 = Math.min(n - 1, lowerBound(lines, pz + 3 * sg));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const o = j * n + i;
      const d2 = (lines[i] - px) ** 2 + (lines[j] - pz) ** 2;
      const f = Math.exp(-d2 / (2 * sg * sg));
      veg[o] = Math.max(veg[o], 0.95 * f);
      urb[o * 2 + 1] *= 1 - 0.8 * f;
    }
  }
  const idx: number[] = [];
  const hi0 = I0 + kx0, hi1 = I0 + kx1, hj0 = I0 + kz0, hj1 = I0 + kz1;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    if (i >= hi0 && i < hi1 && j >= hj0 && j < hj1) continue; // hueco: lo cubre la franja de unión
    const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  /** Altura de la malla dibujada (interpolación exacta en sus triángulos). */
  const meshY = (x: number, z: number) => {
    const i = Math.min(n - 2, Math.max(0, lowerBound(lines, x) - 1)), j = Math.min(n - 2, Math.max(0, lowerBound(lines, z) - 1));
    const u = Math.min(1, Math.max(0, (x - lines[i]) / (lines[i + 1] - lines[i]))), v = Math.min(1, Math.max(0, (z - lines[j]) / (lines[j + 1] - lines[j])));
    const a = Yg[j * n + i], b = Yg[j * n + i + 1], d = Yg[(j + 1) * n + i], e = Yg[(j + 1) * n + i + 1];
    return u + v <= 1 ? a + (b - a) * u + (d - a) * v : e + (d - e) * (1 - u) + (b - e) * (1 - v);
  };
  // Franja de unión: en el borde del sector tiene su altura exacta; en el borde del hueco, la de la malla;
  // entre ambos, una transición suave. Así no hay escalón ni el sector queda flotando.
  const apronS = (x: number, z: number) => {
    const dR = Math.max(Math.abs(x) - sec.hw, Math.abs(z) - sec.hh, 0);
    const dH = Math.max(0, Math.min(hx1 - x, x - hx0, hz1 - z, z - hz0));
    return dR / Math.max(1e-6, dR + dH);
  };
  const apronY = (x: number, z: number) => {
    const cx = Math.min(sec.hw, Math.max(-sec.hw, x)), cz = Math.min(sec.hh, Math.max(-sec.hh, z));
    const yR = sec.edgeY(cx, cz);
    const t = apronS(x, z);
    const e = t * t * t * (t * (t * 6 - 15) + 10);
    return yR + (baseY + meshY(x, z) - yR) * e;
  };
  /** Altura del suelo dibujado (mundo), con la franja de unión cerca del sector. */
  const gy = (x: number, z: number) => (inHole(x, z) ? apronY(x, z) : baseY + meshY(x, z));
  /** Cota aproximada [m s. n. m.] del suelo dibujado (para el tejido urbano). */
  const zAbs = (x: number, z: number) => gy(x, z) - baseY - Y0 + zSpot;
  const fabricW = (x: number, z: number) => {
    const [xk, yk] = kmOf(x, z);
    return fabricAt(xk, yk, zAbs(x, z));
  };

  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.setAttribute('aUrb', new THREE.BufferAttribute(urb, 2));
  tg.setAttribute('aVeg', new THREE.BufferAttribute(veg, 1));
  tg.setAttribute('aUB', new THREE.BufferAttribute(ubc, 3));
  tg.setIndex(idx);
  tg.computeVertexNormals();

  // Cerca del sector las casas son objetos: el suelo muestra cuadras con calles, andenes y patios en lo
  // plano y suelo de barrio en las laderas. Lejos, el tapete urbano compartido con la vista del valle.
  const PX = 58, PZ = 74, ST = 11, GX0 = 720, GZ0 = 1560; // paso de manzanas, ancho de calle y origen [m]
  const Rn = alta ? 650 : 340; // radio del barrio con casas
  const Rm = alta ? 5000 : 2400; // radio de la ciudad con volúmenes
  const floorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  floorMat.defines = {};
  if (!alta) floorMat.defines.LIGERA = '';
  if (MQ) floorMat.defines.MAQUETA = '';
  floorMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = wet;
    sh.uniforms.uClear = { value: new THREE.Vector2(opts.clearX, opts.clearZ) };
    sh.uniforms.uRn = { value: Rn };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUrb;\nattribute float aVeg;\nattribute vec3 aUB;\nvarying vec2 vUrb;\nvarying float vVeg;\nvarying vec3 vUB;\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUrb = aUrb;\nvVeg = aVeg;\nvUB = aUB;\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWet;
uniform vec2 uClear;
uniform float uRn;
varying vec2 vUrb;
varying float vVeg;
varying vec3 vUB;
varying vec3 vWP;
${CARPET_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p10 = vWP.xz / 10.0;
        float fw = max(fwidth(p10.x), fwidth(p10.y));
        // vegetación: potreros y bosques en manchas
        float nz = vn(p10 * 0.07);
        vec3 green = diffuseColor.rgb * (0.86 + 0.28 * nz);
        green = mix(green, vec3(0.17, 0.32, 0.15), smoothstep(0.35, 0.75, vVeg + 0.3 * (nz - 0.5)) * 0.9);
        float fab = floor(vUrb.x + 0.5);
        // lejos, los barrios se ven de lado: techos moteados (sin retícula de calles, que de lado parece una malla)
        vec3 farCol = green;
        if (vUrb.y > 0.01) {
          vec2 cell = floor(p10 / 1.2);
          vec3 roof = roofColor(fab, h21(cell), h21(cell + 17.3));
          float detail = 1.0 - smoothstep(0.35, 1.3, fw);
          // manchas de techos de ladrillo, de concreto y zinc, y casas pintadas de claro (a escala de cuadra)
          float n1 = vn(p10 * 0.45);
          vec3 mott = mix(vec3(0.6, 0.31, 0.2), vec3(0.55, 0.54, 0.51), smoothstep(0.55, 0.8, n1) * 0.8);
          #ifndef LIGERA
          mott = mix(mott, vec3(0.78, 0.75, 0.7), smoothstep(0.6, 0.85, vn(p10 * 1.3 + 7.0)) * 0.6);
          #else
          mott = mix(mott, vec3(0.78, 0.75, 0.7), step(0.8, h21(floor(p10 * 1.1))) * 0.55);
          #endif
          mott = mix(mott, vUB, 0.3) * (0.84 + 0.3 * h21(floor(p10 * 0.9)));
          vec3 urbanF = mix(mott, roof, detail * 0.7);
          float edge = smoothstep(0.0, 0.6, vUrb.y + 0.35 * (nz - 0.5));
          farCol = mix(green, urbanF, edge);
        }
        float nearW = 1.0 - smoothstep(uRn * 0.78, uRn, length(vWP.xz));
        vec3 outCol = farCol;
        float urbW = 0.0;
        if (nearW > 0.0) {
          // retícula de cuadras (mismo paso que las manzanas), andenes y patios
          float fx = mod(vWP.x + ${GX0.toFixed(1)}, ${PX.toFixed(1)}), fz = mod(vWP.z + ${GZ0.toFixed(1)}, ${PZ.toFixed(1)});
          float hs = ${(ST / 2).toFixed(2)};
          float street = max(step(fx, hs - 1.7) + step(${PX.toFixed(1)} - hs + 1.7, fx), step(fz, hs - 1.7) + step(${PZ.toFixed(1)} - hs + 1.7, fz));
          float walk = max(step(fx, hs) + step(${PX.toFixed(1)} - hs, fx), step(fz, hs) + step(${PZ.toFixed(1)} - hs, fz));
          float plano = smoothstep(1.3, 1.75, vUrb.x);
          street *= plano;
          walk *= plano;
          // calle alrededor de la maqueta
          vec2 ad = abs(vWP.xz) - uClear;
          float ring = step(max(ad.x, ad.y), 7.6);
          float ringWalk = step(max(ad.x, ad.y), 9.5);
          street = clamp(max(street, ring), 0.0, 1.0);
          walk = clamp(max(walk, ringWalk), 0.0, 1.0);
          // asfalto en la retícula; la calle alrededor del sector es de concreto (como muchas vías de ladera)
          vec3 asphalt = mix(vec3(0.24, 0.245, 0.255), vec3(0.5, 0.49, 0.47), ring) * (1.0 - 0.3 * uWet);
          vec3 sidewalk = vec3(0.6, 0.58, 0.55) * (1.0 - 0.25 * uWet);
          vec3 patio = mix(vec3(0.46, 0.38, 0.3), vec3(0.33, 0.42, 0.26), step(0.6, h21(floor(vWP.xz / 9.0))));
          // en las laderas: suelo de barrio (placas de concreto, tierra y algo de pasto entre las casas)
          float lr = h21(floor(vWP.xz / 7.0));
          vec3 lad = mix(vec3(0.5, 0.43, 0.35), vec3(0.6, 0.58, 0.54), step(0.5, lr));
          lad = mix(lad, vec3(0.36, 0.45, 0.27), step(0.82, lr));
          vec3 urbanCol = mix(mix(lad, patio, plano), sidewalk, walk);
          urbanCol = mix(urbanCol, asphalt, street);
          // línea central discontinua
          float cx = min(fx, ${PX.toFixed(1)} - fx), cz = min(fz, ${PZ.toFixed(1)} - fz);
          float dash = step(0.5, fract(vWP.z / 6.0)) * step(cx, 0.12) + step(0.5, fract(vWP.x / 6.0)) * step(cz, 0.12);
          urbanCol = mix(urbanCol, vec3(0.86, 0.78, 0.3), clamp(dash, 0.0, 1.0) * street * plano * (1.0 - ring));
          urbW = smoothstep(0.12, 0.45, vUrb.y);
          outCol = mix(farCol, mix(green, urbanCol, urbW), nearW);
          urbW *= nearW;
        }
        #ifdef MAQUETA
        // relieve de maqueta: claro, con el verde apenas insinuado donde hay bosque y curvas de nivel cada 10 m
        float lumM = dot(outCol, vec3(0.3, 0.59, 0.11));
        vec3 mq = mix(vec3(0.88, 0.87, 0.84), vec3(0.77, 0.81, 0.72), clamp(vVeg * 1.15, 0.0, 1.0) * 0.85);
        mq *= 0.95 + 0.1 * (lumM - 0.35);
        float hC = vWP.y / 10.0;
        float lineC = 1.0 - smoothstep(0.0, 1.4 * fwidth(hC), abs(fract(hC + 0.5) - 0.5));
        mq *= 1.0 - 0.08 * lineC * (1.0 - smoothstep(0.35, 0.9, fwidth(hC)));
        diffuseColor.rgb = mq;
        urbW = 0.0;
        #else
        diffuseColor.rgb = outCol;
        #endif`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.45, uWet * urbW * 0.8);');
  };
  const terrain = new THREE.Mesh(tg, floorMat);
  terrain.receiveShadow = true;
  // el suelo se dibuja después de casas y árboles: lo que ellos tapan no se colorea (ahorra mucho trabajo)
  terrain.renderOrder = 1;
  group.add(terrain);

  // ---- franja de unión entre el sector y el entorno (malla fina; se rehace si cambia la resolución)
  const apron = new THREE.Mesh(new THREE.BufferGeometry(), floorMat);
  apron.receiveShadow = true;
  apron.renderOrder = 1;
  group.add(apron);
  const cFloor = new THREE.Color('#7a7772');
  const buildApron = () => {
    const g0 = Math.max(sec.cell, alta ? 1 : 2);
    const axis = (h: number, lo: number, hi: number) => {
      const v: number[] = [];
      for (let x = -h; x >= lo + 0.3 * g0; x -= g0) v.unshift(x);
      v.unshift(lo);
      for (let x = -h + g0; x < h - 1e-6; x += g0) v.push(x);
      for (let x = h; x <= hi - 0.3 * g0; x += g0) v.push(x);
      v.push(hi);
      return v;
    };
    const xs = axis(sec.hw, hx0, hx1), zs = axis(sec.hh, hz0, hz1);
    const nxA = xs.length, nzA = zs.length;
    const P = new Float32Array(nxA * nzA * 3), C = new Float32Array(nxA * nzA * 3), U = new Float32Array(nxA * nzA * 2), V = new Float32Array(nxA * nzA), B = new Float32Array(nxA * nzA * 3);
    const cc = new THREE.Color();
    for (let j = 0; j < nzA; j++) for (let i = 0; i < nxA; i++) {
      const x = xs[i], z = zs[j], o = j * nxA + i;
      const inside = Math.abs(x) < sec.hw - 1e-6 && Math.abs(z) < sec.hh - 1e-6;
      P[o * 3] = x;
      P[o * 3 + 1] = inside ? -1e3 : apronY(x, z);
      P[o * 3 + 2] = z;
      const t = inside ? 0 : apronS(x, z);
      // la superficie del borde (calle, andén, prado, cauce) continúa hacia afuera y se funde con el barrio
      const [r, gg, b] = sec.edgeRgb(Math.min(sec.hw, Math.max(-sec.hw, x)), Math.min(sec.hh, Math.max(-sec.hh, z)));
      cc.setRGB(r, gg, b).lerp(cFloor, smooth(0.35, 0.95, t) * 0.6);
      C[o * 3] = cc.r;
      C[o * 3 + 1] = cc.g;
      C[o * 3 + 2] = cc.b;
      const fb = inside ? { f: 0, k: 0 } : fabricW(x, z);
      U[o * 2] = fb.f || Fabric.Plano;
      U[o * 2 + 1] = smooth(0.3, 0.85, t) * Math.max(0.6, fb.k);
      const ub = urbBase[fb.f] ?? urbBase[Fabric.Plano];
      B[o * 3] = ub.r;
      B[o * 3 + 1] = ub.g;
      B[o * 3 + 2] = ub.b;
    }
    const I: number[] = [];
    for (let j = 0; j < nzA - 1; j++) for (let i = 0; i < nxA - 1; i++) {
      const inR = xs[i] >= -sec.hw - 1e-6 && xs[i + 1] <= sec.hw + 1e-6 && zs[j] >= -sec.hh - 1e-6 && zs[j + 1] <= sec.hh + 1e-6;
      if (inR) continue;
      const a = j * nxA + i, b = a + 1, d = a + nxA, e = d + 1;
      I.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setAttribute('aUrb', new THREE.BufferAttribute(U, 2));
    g.setAttribute('aVeg', new THREE.BufferAttribute(V, 1));
    g.setAttribute('aUB', new THREE.BufferAttribute(B, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    apron.geometry.dispose();
    apron.geometry = g;
  };
  buildApron();

  // ---- cintas apoyadas en el relieve (río, parques, autopistas, vías y tranvía)
  const resampleKm = (pts: [number, number][], stepM: number): [number, number][] => {
    if (pts.length < 2) return pts;
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(...wOf(x, y), 0)), false, 'centripetal');
    const m = Math.max(2, Math.ceil(curve.getLength() / stepM));
    return curve.getSpacedPoints(m).map((v) => [v.x, v.y] as [number, number]);
  };
  /** Cinta a lo largo de una polilínea del mundo [m]; se levanta un poco más lejos del sector. */
  const ribbon = (pts: [number, number][], width: number, offset: number, color: string, lift: number, rough = 0.95, emissive?: string) => {
    const P: number[] = [], I: number[] = [];
    let k = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const L = Math.hypot(tx, tz) || 1;
      tx /= L;
      tz /= L;
      const keep = !inClear(pts[i][0], pts[i][1], 20);
      for (const s of [-0.5, 0.5]) {
        const x = pts[i][0] - tz * (offset + s * width), z = pts[i][1] + tx * (offset + s * width);
        P.push(x, gy(x, z) + lift + Math.hypot(x, z) * 0.0012, z);
      }
      if (i > 0 && keep) I.push(k - 2, k, k - 1, k - 1, k, k + 1);
      k += 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: rough, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (emissive) {
      mat.emissive = new THREE.Color(emissive);
      mat.emissiveIntensity = 0.25;
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.userData.ribbon = color;
    group.add(mesh);
  };
  const river: [number, number][] = [];
  for (let y = EXTENT.y0 - 2; y <= EXTENT.y1 + 6; y += 0.05) river.push(wOf(riverAt(y).x, y));
  // río canalizado: agua, taludes de concreto, parque lineal y autopistas (Regional y Norte/Sur)
  ribbon(river, 46, 0, '#6b7a62', 0.5, 0.3, '#14281e');
  ribbon(river, 8, -27, '#a19e95', 0.55);
  ribbon(river, 8, 27, '#a19e95', 0.55);
  ribbon(river, 26, -44, '#5f8f45', 0.4);
  ribbon(river, 26, 44, '#5f8f45', 0.4);
  ribbon(river, 24, -69, '#4c4d51', 0.45);
  ribbon(river, 24, 69, '#4c4d51', 0.45);
  for (const r of ROADS) ribbon(resampleKm(r.pts, 40), r.w * 1000, 0, '#55585c', 0.45);
  ribbon(resampleKm(TRANVIA.pts, 30), 9, 0, '#7a8a6e', 0.5);

  // ---- edificios: casas del barrio cercano, ciudad media y torres lejanas (una sola malla con instancias)
  interface B { x: number; z: number; y: number; w: number; dz: number; h: number; rot: number; color: THREE.Color; roof: number; base: number }
  const bs: B[] = [];
  const tanks: THREE.Vector3[] = [];
  const brick = ['#a4553a', '#9c4f36', '#b0613f', '#a85c3d', '#94503a'];
  const paint = ['#e9d8a6', '#d6e2e9', '#f2c6a0', '#c9e4c5', '#efe6d8', '#e7b8b1', '#f4e3a1', '#bcd4e6'];
  const light = ['#e9e6df', '#d9d6cf', '#f1efe9', '#cfd4d8', '#e4dccd'];
  const vivid = ['#e2a94a', '#5e9e98', '#d27a5c', '#d996a2', '#7ea3c4', '#a3bf78', '#e8cf7a', '#b9a3c4', '#f1eee6', '#e9e2cf'];
  const towerC = ['#a85f40', '#b86f4c', '#9e5638', '#e1ddd5', '#c7ced4', '#b0623f'];
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const obra = new THREE.Color('#8e8a83'); // bloque de concreto sin pañetar («obra gris»)
  const rebar: { x: number; z: number; y: number; w: number; dz: number; rot: number }[] = [];
  const cars: { x: number; z: number; y: number; rot: number; bus: boolean; color: THREE.Color }[] = [];
  const carColors = ['#f2c500', '#f2c500', '#f2c500', '#e9ecef', '#b9bec4', '#2f3a48', '#8c1d24', '#1f4e8c', '#e9ecef'];
  // lugares sin edificios genéricos: hitos, aeropuerto, estadio, cerros
  const keepOut: { x: number; z: number; r: number }[] = [];
  const addKeep = (xk: number, yk: number, r: number) => {
    const [x, z] = wOf(xk, yk);
    keepOut.push({ x, z, r });
  };
  {
    const [ax, ay] = PLACES.runwayS, [bx, by] = PLACES.runwayN;
    for (let t = 0; t <= 1; t += 0.05) addKeep(ax + (bx - ax) * t, ay + (by - ay) * t, 160);
    addKeep(...PLACES.estadio, 190);
    addKeep(...PLACES.coltejer, 50);
    addKeep(...PLACES.bibliotecaEspana, 70);
  }
  const blocked = (x: number, z: number) => keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r);
  const downhill = (x: number, z: number) => Math.atan2(gy(x + 2, z) - gy(x - 2, z), gy(x, z + 2) - gy(x, z - 2));

  // (1) Cuadras en lo plano, cerca de la maqueta: casas angostas pegadas alrededor de cada manzana
  const row = (x0: number, z0: number, x1: number, z1: number, inward: THREE.Vector2) => {
    const Lb = Math.hypot(x1 - x0, z1 - z0);
    const ux = (x1 - x0) / Lb, uz = (z1 - z0) / Lb;
    const rot = Math.atan2(ux, uz) + Math.PI / 2;
    let a = 0;
    while (a < Lb - 4) {
      const wf = Math.min(Lb - a, 6.5 + rnd() * 4);
      const depth = 13 + rnd() * 6;
      const cx = x0 + ux * (a + wf / 2) + inward.x * depth / 2, cz = z0 + uz * (a + wf / 2) + inward.y * depth / 2;
      a += wf;
      if (inClear(cx, cz, 8 + Math.max(wf, depth) / 2) || rnd() < 0.04) continue;
      const near = Math.hypot(cx, cz) < 320;
      const floors = 2 + Math.floor(rnd() * rnd() * 4.5);
      const painted = rnd() < (near ? 0.36 : 0.3);
      const h = floors * 2.9 + 0.8;
      const y = gy(cx, cz);
      const roof = rnd() < 0.66 ? 0 : rnd() < 0.75 ? 1 : 2;
      const color = painted ? (near && rnd() < 0.6 ? pick(vivid) : pick(paint)) : pick(brick);
      bs.push({ x: cx, z: cz, y, w: wf - 0.15, dz: depth, h, rot, color: new THREE.Color(color), roof, base: 0.8 });
      let topY = y + h - 0.8;
      // piso en obra gris sobre la placa (muy común en los barrios): más pequeño y sin pañetar
      if (roof === 0 && rnd() < 0.2) {
        bs.push({ x: cx + inward.x * depth * 0.12, z: cz + inward.y * depth * 0.12, y: topY, w: (wf - 0.15) * 0.92, dz: depth * 0.7, h: 2.7, rot, color: obra.clone(), roof: 0, base: 0 });
        rebar.push({ x: cx + inward.x * depth * 0.12, z: cz + inward.y * depth * 0.12, y: topY + 2.7, w: (wf - 0.15) * 0.92, dz: depth * 0.7, rot });
        topY += 2.7;
      }
      if (roof === 0 && rnd() < (near ? 0.55 : 0.2)) tanks.push(new THREE.Vector3(cx + (rnd() - 0.5) * 2, topY, cz + (rnd() - 0.5) * 3));
      // carro, taxi o moto parqueados junto al andén (frente a la casa)
      if (near && rnd() < 0.3) {
        const bus = rnd() < 0.08;
        const off = depth / 2 + 2.6;
        const qx = cx - inward.x * off, qz = cz - inward.y * off;
        if (!inClear(qx, qz, 3)) cars.push({ x: qx, z: qz, y: gy(qx, qz), rot: rot + Math.PI / 2, bus, color: new THREE.Color(bus ? '#f4f4ee' : pick(carColors)) });
      }
    }
  };
  const bz0 = -GZ0 + Math.floor((-Rn + GZ0) / PZ) * PZ, bx0 = -GX0 + Math.floor((-Rn + GX0) / PX) * PX;
  for (let bz = bz0; bz < Rn; bz += PZ) for (let bx = bx0; bx < Rn; bx += PX) {
    const cx = bx + PX / 2, cz = bz + PZ / 2;
    if (Math.hypot(cx, cz) > Rn) continue;
    if (Math.abs(cx) < opts.clearX - PX / 2 && Math.abs(cz) < opts.clearZ - PZ / 2) continue; // manzana entera bajo la maqueta
    const fb = fabricW(cx, cz);
    if (fb.f < Fabric.Plano || fb.k < 0.45 || creekD(cx, cz) < 45 || blocked(cx, cz)) continue;
    const x0 = bx + ST / 2, x1 = bx + PX - ST / 2, z0 = bz + ST / 2, z1 = bz + PZ - ST / 2;
    row(x0, z0, x1, z0, new THREE.Vector2(0, 1));
    row(x1, z1, x0, z1, new THREE.Vector2(0, -1));
    row(x0, z1 - 16, x0, z0 + 16, new THREE.Vector2(1, 0));
    row(x1, z0 + 16, x1, z1 - 16, new THREE.Vector2(-1, 0));
    // casas del interior de la manzana (lotes de atrás), con algún patio libre
    if (alta || Math.hypot(cx, cz) < 260) for (let ix = x0 + 19; ix < x1 - 19 - 4; ix += 8.5) for (let iz = z0 + 19; iz < z1 - 19 - 4; iz += 10) {
      const lx = ix + 4.25, lz = iz + 5;
      if (rnd() < 0.22 || inClear(lx, lz, 12)) continue;
      const floors = 1 + Math.floor(rnd() * 3);
      const yy = gy(lx, lz);
      bs.push({ x: lx, z: lz, y: yy, w: 7.6 + rnd(), dz: 9 + rnd(), h: floors * 2.9 + 0.8, rot: 0, color: new THREE.Color(rnd() < 0.25 ? pick(paint) : pick(brick)), roof: rnd() < 0.6 ? 0 : 1, base: 0.8 });
      if (rnd() < 0.3) tanks.push(new THREE.Vector3(lx, yy + floors * 2.9, lz));
    }
  }
  // (2) Barrio de ladera (como las comunas de las laderas de Medellín): casas angostas muy juntas,
  // escalonadas con la pendiente, de ladrillo y algunas pintadas de colores vivos; se ralean montaña arriba.
  const nBarrio = alta ? 11000 : 1900;
  for (let t = 0, placed = 0; t < nBarrio * 6 && placed < nBarrio; t++) {
    const x = (rnd() * 2 - 1) * Rn, z = (rnd() * 2 - 1) * Rn;
    if (Math.hypot(x, z) > Rn || inClear(x, z, 9)) continue;
    const fb = fabricW(x, z);
    if (fb.f !== Fabric.Ladera || rnd() > fb.k * 0.97) continue;
    if (creekD(x, z) < 28 || blocked(x, z)) continue;
    const yH = gy(x, z);
    const rot = downhill(x, z) + Math.PI + (rnd() - 0.5) * 0.25; // frente (+z) hacia abajo de la ladera
    const floors = 1 + Math.floor(rnd() * rnd() * 4.6);
    const near = Math.hypot(x, z) < 280;
    const painted = rnd() < (near ? 0.36 : 0.28);
    const roof = rnd() < 0.62 ? 0 : rnd() < 0.7 ? 1 : 2;
    const w = 5.5 + rnd() * 3.2, dz = 7 + rnd() * 4;
    const mural = near && painted && rnd() < 0.25;
    bs.push({ x, z, y: yH, w, dz, h: floors * 2.9 + 0.8, rot, color: new THREE.Color(painted ? pick(vivid) : pick(brick)), roof: roof + (mural ? 10 : 0), base: 0.8 });
    if (roof === 0 && rnd() < 0.18) {
      bs.push({ x, z, y: yH + floors * 2.9, w: w * 0.9, dz: dz * 0.7, h: 2.6, rot, color: obra.clone(), roof: 0, base: 0 });
      rebar.push({ x, z, y: yH + floors * 2.9 + 2.6, w: w * 0.9, dz: dz * 0.7, rot });
    } else if (roof === 0 && rnd() < (near ? 0.5 : 0.2)) tanks.push(new THREE.Vector3(x, yH + floors * 2.9, z));
    placed++;
  }
  // (3) Ciudad media (de Rn a Rm): volúmenes por tejido; el muestreo se abre con la distancia
  const nMid = alta ? 20000 : 2800;
  let midCount = 0;
  const midStep = (d: number) => (alta ? 26 : 34) * Math.pow(Math.max(1, d / Rn), 0.62);
  for (let z = -Rm; z < Rm && midCount < nMid; ) {
    const sz = midStep(Math.abs(z));
    for (let x = -Rm; x < Rm && midCount < nMid; ) {
      const d = Math.hypot(x, z);
      const s0 = midStep(d);
      x += s0;
      if (d < Rn * 0.95 || d > Rm) continue;
      const px = x + (rnd() - 0.5) * s0 * 0.9, pz = z + (rnd() - 0.5) * sz * 0.9;
      const fb = fabricW(px, pz);
      if (fb.f === Fabric.None || blocked(px, pz)) continue;
      const dens = [0, 0.92, 0.6, 0.9, 0.55, 0.45, 0.72][fb.f] * Math.min(1, fb.k * 1.15);
      if (rnd() > dens || creekD(px, pz) < 30) continue;
      const k = s0 / 30; // los volúmenes lejanos agrupan varias casas
      let h: number, fw: number, fd: number, color: string, roof = 0;
      const r = rnd();
      switch (fb.f) {
        case Fabric.Ladera:
          h = 5 + rnd() * 8;
          fw = (9 + rnd() * 7) * k;
          fd = (8 + rnd() * 7) * k;
          color = r < 0.74 ? pick(brick) : pick(vivid);
          roof = rnd() < 0.6 ? 0 : rnd() < 0.7 ? 1 : 2;
          break;
        case Fabric.Plano:
          h = r < 0.08 ? 20 + rnd() * 25 : 6 + rnd() * 7;
          fw = (12 + rnd() * 8) * k;
          fd = (12 + rnd() * 8) * k;
          color = rnd() < 0.45 ? pick(brick) : pick(light);
          roof = h > 18 ? 3 : 0;
          break;
        case Fabric.Centro:
          h = r < 0.45 ? 22 + Math.pow(rnd(), 1.8) * 75 : 9 + rnd() * 12;
          fw = (16 + rnd() * 12) * Math.min(k, 1.6);
          fd = (16 + rnd() * 12) * Math.min(k, 1.6);
          color = rnd() < 0.25 ? pick(brick) : pick(light);
          roof = 3;
          break;
        case Fabric.Poblado:
          h = r < 0.42 ? 30 + Math.pow(rnd(), 1.5) * 60 : 7 + rnd() * 6;
          fw = (h > 25 ? 20 + rnd() * 10 : 14 + rnd() * 8) * Math.min(k, 1.4);
          fd = (h > 25 ? 18 + rnd() * 10 : 14 + rnd() * 8) * Math.min(k, 1.4);
          color = h > 25 ? pick(towerC) : rnd() < 0.5 ? pick(brick) : pick(light);
          roof = 3;
          break;
        case Fabric.Industria:
          h = 8 + rnd() * 7;
          fw = (30 + rnd() * 25) * Math.min(k, 1.5);
          fd = (24 + rnd() * 20) * Math.min(k, 1.5);
          color = rnd() < 0.3 ? pick(brick) : rnd() < 0.6 ? pick(light) : '#b9bec2';
          roof = 2;
          break;
        default:
          h = r < 0.08 ? 28 + rnd() * 35 : 7 + rnd() * 9;
          fw = (12 + rnd() * 8) * k;
          fd = (11 + rnd() * 8) * k;
          color = rnd() < 0.55 ? pick(brick) : pick(light);
      }
      const rot = fb.f === Fabric.Ladera ? downhill(px, pz) + Math.PI + (rnd() - 0.5) * 0.6 : (rnd() - 0.5) * 0.12;
      bs.push({ x: px, z: pz, y: gy(px, pz), w: fw, dz: fd, h, rot, color: new THREE.Color(color), roof, base: 1 });
      midCount++;
    }
    z += sz;
  }
  // (4) Torres lejanas (Centro, El Poblado y edificios altos sueltos): se ven desde muy lejos
  for (let yk = EXTENT.y0 + 0.5; yk < EXTENT.y1 - 0.3; yk += 0.09) for (let xk = EXTENT.x0 + 0.4; xk < EXTENT.x1 - 0.4; xk += 0.09) {
    const [x, z] = wOf(xk + (rnd() - 0.5) * 0.08, yk + (rnd() - 0.5) * 0.08);
    if (Math.hypot(x, z) < Rm) continue;
    const fb = fabricW(x, z);
    const pT = fb.f === Fabric.Centro ? 0.4 : fb.f === Fabric.Poblado ? 0.36 : fb.f === Fabric.Plano || fb.f === Fabric.Municipio ? 0.05 : 0;
    if (rnd() > pT * fb.k || blocked(x, z)) continue;
    const h = fb.f === Fabric.Centro ? 25 + Math.pow(rnd(), 1.8) * 75 : fb.f === Fabric.Poblado ? 30 + Math.pow(rnd(), 1.5) * 60 : 22 + rnd() * 25;
    bs.push({ x, z, y: gy(x, z), w: 22 + rnd() * 12, dz: 20 + rnd() * 12, h, rot: (rnd() - 0.5) * 0.4, color: new THREE.Color(fb.f === Fabric.Poblado ? pick(towerC) : pick(light)), roof: 3, base: 2 });
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const bMat = buildingMaterial(night, { light: !alta, maqueta: MQ });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const b of bs) {
    if (b.base > 0) {
      // en pendiente, la base baja hasta la esquina más baja (no queda flotando)
      const cr = Math.cos(b.rot), sr = Math.sin(b.rot), hx = b.w / 2, hz = b.dz / 2;
      let low = b.y;
      for (const [u, v] of [[hx, hz], [-hx, hz], [hx, -hz], [-hx, -hz]]) low = Math.min(low, gy(b.x + u * cr + v * sr, b.z - u * sr + v * cr));
      const extra = Math.max(0, b.y - low);
      b.base += extra;
      b.h += extra;
    }
  }
  const houseMeshes = bucketed(
    bs,
    Rn,
    (geo, nn) => new THREE.InstancedMesh(geo, bMat, nn),
    box,
    (mesh, b, i) => {
      q.setFromAxisAngle(up, b.rot);
      mesh.setMatrixAt(i, m4.compose(p.set(b.x, b.y - b.base, b.z), q, s.set(b.w, b.h, b.dz)));
      mesh.setColorAt(i, b.color.multiplyScalar(0.92 + rnd() * 0.12));
    },
    (mesh, list) => {
      const aHouse = new Float32Array(list.length * 3);
      list.forEach((b, i) => {
        aHouse[i * 3] = b.roof;
        aHouse[i * 3 + 1] = b.base;
        aHouse[i * 3 + 2] = rnd();
      });
      mesh.geometry.setAttribute('aHouse', new THREE.InstancedBufferAttribute(aHouse, 3));
    },
  );
  group.add(...houseMeshes);
  box.dispose();
  // tanques de agua sobre las azoteas (negros y algunos azules: rasgo muy común en los barrios)
  // (en la maqueta no van: tanques, carros y varillas serían detalle inventado que distrae)
  if (tanks.length && !MQ) {
    const tg2 = new THREE.CylinderGeometry(0.6, 0.65, 1.1, alta ? 12 : 8);
    tg2.translate(0, 0.55, 0);
    const tm = new THREE.InstancedMesh(tg2, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 }), tanks.length);
    tanks.forEach((t, i) => {
      tm.setMatrixAt(i, m4.compose(t, q.identity(), s.set(1, 1, 1)));
      tm.setColorAt(i, new THREE.Color(rnd() < 0.8 ? '#33373b' : '#2f6fa8'));
    });
    group.add(tm);
  }
  if (cars.length && !MQ) {
    const cgeo = new THREE.BoxGeometry(1, 1, 1);
    cgeo.translate(0, 0.5, 0);
    const cm = new THREE.InstancedMesh(cgeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.25 }), cars.length);
    const top = new THREE.InstancedMesh(cgeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, metalness: 0.3 }), cars.length);
    cars.forEach((c, i) => {
      q.setFromAxisAngle(up, c.rot);
      cm.setMatrixAt(i, m4.compose(p.set(c.x, c.y, c.z), q, c.bus ? s.set(2.4, 2.9, 9.5) : s.set(1.75, 1.45, 4.2)));
      cm.setColorAt(i, c.color);
      // franja verde de las busetas y vidrios oscuros de los carros (una caja delgada encima)
      if (c.bus) top.setMatrixAt(i, m4.compose(p.set(c.x, c.y + 1.0, c.z), q, s.set(2.45, 0.45, 9.55)));
      else top.setMatrixAt(i, m4.compose(p.set(c.x, c.y + 1.4, c.z), q, s.set(1.5, 0.55, 2.2)));
      top.setColorAt(i, new THREE.Color(c.bus ? '#1f8f4e' : '#1d2630'));
    });
    group.add(cm, top);
  }
  if (rebar.length && !MQ) {
    const rg = new THREE.BoxGeometry(0.07, 1.1, 0.07);
    rg.translate(0, 0.55, 0);
    const rm = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: '#4a3b33', roughness: 0.7, metalness: 0.4 }), rebar.length * 4);
    let k = 0;
    for (const r of rebar) {
      const cr = Math.cos(r.rot), sr = Math.sin(r.rot), hx = r.w / 2 - 0.15, hz = r.dz / 2 - 0.15;
      for (const [u, v] of [[hx, hz], [-hx, hz], [hx, -hz], [-hx, -hz]]) rm.setMatrixAt(k++, m4.compose(p.set(r.x + u * cr + v * sr, r.y, r.z - u * sr + v * cr), q.identity(), s.set(1, 1, 1)));
    }
    group.add(rm);
  }

  // ---- hitos: Edificio Coltejer, Biblioteca España, estadio y aeropuerto Olaya Herrera
  const landmarks: Landmark[] = [];
  const atKm = (xk: number, yk: number, lift = 0) => {
    const [x, z] = wOf(xk, yk);
    return new THREE.Vector3(x, gy(x, z) + lift, z);
  };
  {
    const cm = new THREE.MeshStandardMaterial({ color: '#d2d5d8', roughness: 0.55, metalness: 0.15 });
    const cp = atKm(...PLACES.coltejer);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(30, 150, 30), cm);
    shaft.position.set(cp.x, cp.y + 73, cp.z);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(22, 32, 4), cm);
    crown.rotation.y = Math.PI / 4;
    crown.position.set(cp.x, cp.y + 148 + 16, cp.z);
    group.add(shaft, crown);
    // Biblioteca España (Santo Domingo Savio): tres volúmenes oscuros como rocas sobre la ladera
    const bp = atKm(...PLACES.bibliotecaEspana);
    const rock = new THREE.MeshStandardMaterial({ color: '#2f2d2b', roughness: 0.7 });
    [[-22, 0, 0.35], [4, 16, -0.2], [24, -6, 0.5]].forEach(([dx, dz, r], i) => {
      const bx = new THREE.Mesh(new THREE.BoxGeometry(24, 30 + i * 5, 20), rock);
      bx.position.set(bp.x + dx, gy(bp.x + dx, bp.z + dz) + 10 + i * 2, bp.z + dz);
      bx.rotation.set(0.12 * (i - 1), r, 0.1);
      group.add(bx);
    });
    // estadio Atanasio Girardot
    const ep = atKm(...PLACES.estadio);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(95, 26, 6, 40), new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.8 }));
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1, 1.3, 0.6);
    ring.position.set(ep.x, ep.y + 8, ep.z);
    const field = new THREE.Mesh(new THREE.CircleGeometry(75, 32), new THREE.MeshStandardMaterial({ color: '#4f9a3f', roughness: 0.9 }));
    field.rotation.x = -Math.PI / 2;
    field.scale.set(1, 1.3, 1);
    field.position.set(ep.x, ep.y + 1.2, ep.z);
    group.add(ring, field);
    // aeropuerto: pista
    const a = atKm(...PLACES.runwayS), b = atKm(...PLACES.runwayN);
    const runway = new THREE.Mesh(new THREE.BoxGeometry(45, 2, a.distanceTo(b)), new THREE.MeshStandardMaterial({ color: '#5b5f64', roughness: 0.85 }));
    runway.position.copy(a).lerp(b, 0.5).add(new THREE.Vector3(0, 1.5, 0));
    runway.lookAt(b.x, runway.position.y, b.z);
    group.add(runway);
  }

  // ---- árboles: retiros de quebradas, cerros, parques del río, calles cercanas y bosque de montaña
  const trees: { x: number; z: number; r: number; c: string; near: boolean }[] = [];
  const greens = ['#3f7a34', '#4c8a3c', '#356b2d', '#5a9443', '#2f5f2a'];
  const nTrees = alta ? 12000 : 2000;
  const hills = HILLS.filter((h) => h.id !== 'padre-amaya').map((h) => ({ ...h, w: wOf(h.x, h.y), rm: h.r * 1000 * 0.62 }));
  const tryTree = (x: number, z: number, near: boolean) => {
    if (inClear(x, z, 8) || blocked(x, z)) return;
    const [xk, yk] = kmOf(x, z);
    const fb = fabricW(x, z);
    const cd = creekD(x, z);
    const rd = cross(xk, yk).d * 1000;
    let pr: number;
    if (hills.some((h) => Math.hypot(x - h.w[0], z - h.w[1]) < h.rm)) pr = 0.9;
    else if (cd < 30) pr = 0.85;
    else if (rd > 32 && rd < 58) pr = 0.5;
    else if (fb.f === Fabric.None) pr = rd < 90 ? 0.1 : 0.7 * forestAt(xk, yk) + 0.04;
    else if (near && fb.f !== Fabric.Ladera) {
      // en lo plano: árboles del andén, pegados a la línea de las casas
      const fx = (((x + GX0) % PX) + PX) % PX, fz = (((z + GZ0) % PZ) + PZ) % PZ;
      const onWalk = (fx > 4.2 && fx < 5.3) || (fx > 52.7 && fx < 53.8) || (fz > 4.2 && fz < 5.3) || (fz > 68.7 && fz < 69.8);
      pr = onWalk ? 0.55 : 0.01;
    } else pr = fb.f === Fabric.Ladera ? 0.1 : fb.f === Fabric.Poblado ? 0.4 : 0.06;
    if (rnd() > pr) return;
    const urban = fb.f !== Fabric.None && cd >= 30;
    const r = urban ? 2.2 + rnd() * 1.8 : 2.8 + rnd() * 3.2;
    // guayacanes florecidos (amarillos y rosados), muy de Medellín, en calles y parques
    const c = urban && rnd() < 0.14 ? (rnd() < 0.6 ? '#e3b52a' : '#dc8bb0') : pick(greens);
    trees.push({ x, z, r, c, near });
  };
  for (let t = 0; t < nTrees * 6 && trees.length < nTrees * 0.36; t++) tryTree((rnd() * 2 - 1) * Rn * 1.05, (rnd() * 2 - 1) * Rn * 1.05, true);
  for (let t = 0; t < nTrees * 10 && trees.length < nTrees; t++) {
    const a = rnd() * Math.PI * 2, rr = Rn + Math.pow(rnd(), 1.6) * (Rm * 0.8 - Rn);
    tryTree(Math.cos(a) * rr, Math.sin(a) * rr, false);
  }
  // cerca: copas de varios lóbulos con tronco; lejos, copas simples (cuestan menos)
  const nearT = trees.filter((t) => t.near), farT = trees.filter((t) => !t.near);
  const leafM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
  const trunkM = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 1 });
  const crownG = crownGeometry(0, 7, alta ? 6 : 3);
  const trunkG = new THREE.CylinderGeometry(0.1, 0.17, 1, 5);
  trunkG.translate(0, 0.5, 0);
  const placeT = nearT.map((t) => ({ ...t, y: gy(t.x, t.z), th: 1.6 + t.r * 0.45, yaw: rnd() * 6.28, sy: 0.85 + rnd() * 0.3, k: 0.9 + rnd() * 0.2 }));
  group.add(
    ...bucketed(placeT, Rn, (geo, nn) => new THREE.InstancedMesh(geo, leafM, nn), crownG, (mesh, t, i) => {
      q.setFromAxisAngle(up, t.yaw);
      mesh.setMatrixAt(i, m4.compose(p.set(t.x, t.y + t.th + t.r * 0.62, t.z), q, s.set(t.r, t.r * t.sy, t.r)));
      mesh.setColorAt(i, new THREE.Color(t.c).multiplyScalar(t.k));
    }),
    ...bucketed(placeT, Rn, (geo, nn) => new THREE.InstancedMesh(geo, trunkM, nn), trunkG, (mesh, t, i) => {
      mesh.setMatrixAt(i, m4.compose(p.set(t.x, t.y - 0.2, t.z), q.identity(), s.set(1 + t.r * 0.15, t.th + t.r * 0.4, 1 + t.r * 0.15)));
    }),
    ...bucketed(farT, Rn, (geo, nn) => new THREE.InstancedMesh(geo, leafM, nn), new THREE.IcosahedronGeometry(1, 0), (mesh, t, i) => {
      mesh.setMatrixAt(i, m4.compose(p.set(t.x, gy(t.x, t.z) + t.r * 0.95, t.z), q.identity(), s.set(t.r, t.r * 1.05, t.r)));
      mesh.setColorAt(i, new THREE.Color(t.c).multiplyScalar(0.9 + rnd() * 0.2));
    }),
  );
  crownG.dispose();
  trunkG.dispose();

  // ---- metro elevado (líneas A y B): viga, columnas, estaciones y trenes
  interface Mover { mesh: THREE.InstancedMesh; path: THREE.Vector3[]; len: number[]; total: number; cars: number; gap: number; heads: number[]; speed: number; loop: boolean; lift: number }
  const movers: Mover[] = [];
  const mkPath = (path: THREE.Vector3[]) => {
    const len = [0];
    for (let i = 1; i < path.length; i++) len.push(len[i - 1] + path[i].distanceTo(path[i - 1]));
    return len;
  };
  const along = (mv: Mover, d: number, out: THREE.Vector3, dir: THREE.Vector3) => {
    const L = mv.total;
    const s2 = mv.loop ? ((d % L) + L) % L : Math.min(L, Math.max(0, d));
    let i = Math.max(1, lowerBound(mv.len, s2));
    if (i >= mv.path.length) i = mv.path.length - 1;
    const a = mv.path[i - 1], b = mv.path[i];
    const f = (s2 - mv.len[i - 1]) / Math.max(1e-6, mv.len[i] - mv.len[i - 1]);
    out.copy(a).lerp(b, f);
    dir.copy(b).sub(a).normalize();
    return out;
  };
  const metroM = new THREE.MeshStandardMaterial({ color: '#d9dbdc', roughness: 0.7 });
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const viaduct = (line: Line, trains: number) => {
    const pts = resampleKm(line.pts, 45);
    const hs = pts.map(([x, z]) => gy(x, z));
    const top = hs.map((_, i) => {
      let m = -Infinity;
      for (let k = Math.max(0, i - 3); k <= Math.min(hs.length - 1, i + 3); k++) m = Math.max(m, hs[k]);
      return m + 12;
    });
    const path = pts.map(([x, z], i) => new THREE.Vector3(x, top[i], z));
    const beams = new THREE.InstancedMesh(unit, metroM, path.length - 1);
    const cols: THREE.Matrix4[] = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dir = b.clone().sub(a);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
      beams.setMatrixAt(i - 1, m4.compose(a.clone().lerp(b, 0.5), q, s.set(8.5, 1.8, dir.length() + 0.3)));
      const g = hs[i - 1];
      if (Math.hypot(a.x, a.z) < 4000 || i % 3 === 0) cols.push(new THREE.Matrix4().compose(new THREE.Vector3(a.x, (g + a.y) / 2 - 0.5, a.z), new THREE.Quaternion(), new THREE.Vector3(1.8, a.y - g - 0.8, 1.8)));
    }
    const colM = new THREE.InstancedMesh(unit, metroM, cols.length);
    cols.forEach((c, i) => colM.setMatrixAt(i, c));
    group.add(beams, colM);
    // estaciones: andén techado de ≈ 110 m sobre la viga
    const stM = new THREE.MeshStandardMaterial({ color: '#f1f2f3', roughness: 0.5 });
    const stations = new THREE.InstancedMesh(new THREE.BoxGeometry(24, 8, 110), stM, line.stations.length);
    line.stations.forEach(([xk, yk], si) => {
      const [x, z] = wOf(xk, yk);
      let bi = 0, bd = Infinity;
      pts.forEach(([px, pz], i) => {
        const d = Math.hypot(px - x, pz - z);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      const a = path[Math.max(0, bi - 1)], b = path[Math.min(path.length - 1, bi + 1)];
      q.setFromAxisAngle(up, Math.atan2(b.x - a.x, b.z - a.z));
      stations.setMatrixAt(si, m4.compose(path[bi].clone().add(new THREE.Vector3(0, 4.5, 0)), q, s.set(1, 1, 1)));
    });
    group.add(stations);
    // trenes de tres vagones (decorativos): van y vuelven
    const tm = new THREE.InstancedMesh(new THREE.BoxGeometry(3.1, 3.7, 20), new THREE.MeshStandardMaterial({ color: '#e8ecee', roughness: 0.4, metalness: 0.2 }), trains * 3);
    const len = mkPath(path);
    tm.frustumCulled = false; // se mueven: su esfera envolvente cambia
    movers.push({ mesh: tm, path, len, total: len[len.length - 1], cars: 3, gap: 21, heads: Array.from({ length: trains }, (_, k) => (k / trains) * 2 * len[len.length - 1]), speed: 14, loop: false, lift: 2.8 });
    group.add(tm);
  };
  viaduct(METRO_A, 4);
  viaduct(METRO_B, 2);

  // ---- metrocables: torres, cables, estaciones y cabinas
  const cableLines: number[] = [];
  const towerMs: THREE.Matrix4[] = [];
  const stationMs: THREE.Matrix4[] = [];
  const cabCount = (L: number) => Math.max(4, Math.round(L / 75));
  for (const c of CABLES) {
    const tops: THREE.Vector3[] = [];
    for (let i = 1; i < c.pts.length; i++) {
      const [ax, az] = wOf(...c.pts[i - 1]), [bx, bz] = wOf(...c.pts[i]);
      const L = Math.hypot(bx - ax, bz - az);
      const m = Math.max(1, Math.round(L / 170));
      for (let k = i === 1 ? 0 : 1; k <= m; k++) {
        const t = k / m, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const g = gy(x, z);
        const isStation = k === 0 || k === m;
        const hgt = isStation ? 12 : 24;
        tops.push(new THREE.Vector3(x, g + hgt, z));
        if (inClear(x, z, 10)) continue; // ninguna torre dentro del sector
        const ang = Math.atan2(bx - ax, bz - az);
        if (isStation) stationMs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, g + 5, z), new THREE.Quaternion().setFromAxisAngle(up, ang), new THREE.Vector3(1, 1, 1)));
        else towerMs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, g - 1, z), new THREE.Quaternion(), new THREE.Vector3(1, hgt + 1, 1)));
      }
    }
    // dos cables (subida y bajada), con algo de comba entre torres
    const path: THREE.Vector3[] = [];
    for (let i = 1; i < tops.length; i++) for (let k = 0; k < 8; k++) {
      const t = k / 8;
      const pt = tops[i - 1].clone().lerp(tops[i], t);
      pt.y -= Math.sin(Math.PI * t) * Math.min(6, tops[i - 1].distanceTo(tops[i]) * 0.02);
      path.push(pt);
    }
    path.push(tops[tops.length - 1].clone());
    for (const sg of [-3, 3]) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const dx2 = b.x - a.x, dz2 = b.z - a.z, L2 = Math.hypot(dx2, dz2) || 1;
      const ox = (-dz2 / L2) * sg, oz = (dx2 / L2) * sg;
      cableLines.push(a.x + ox, a.y, a.z + oz, b.x + ox, b.y, b.z + oz);
    }
    const len = mkPath(path);
    const total = len[len.length - 1];
    const nc = cabCount(total);
    const cabs = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 2.3, 2.4), new THREE.MeshStandardMaterial({ color: '#eef1f3', roughness: 0.4, emissive: new THREE.Color('#2a3a48'), emissiveIntensity: 0.15 }), nc * 2);
    cabs.frustumCulled = false;
    movers.push({ mesh: cabs, path, len, total, cars: 1, gap: 0, heads: Array.from({ length: nc * 2 }, (_, k) => (k / (nc * 2)) * 2 * total), speed: 5, loop: false, lift: -2.6 });
    group.add(cabs);
  }
  if (cableLines.length) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(cableLines, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#3a3f44' })));
  }
  {
    const towerG = new THREE.CylinderGeometry(0.6, 1.3, 1, 6);
    towerG.translate(0, 0.5, 0);
    const tw = new THREE.InstancedMesh(towerG, new THREE.MeshStandardMaterial({ color: '#7d858c', roughness: 0.6, metalness: 0.3 }), towerMs.length);
    towerMs.forEach((mm, i) => tw.setMatrixAt(i, mm));
    const sm = new THREE.InstancedMesh(new THREE.BoxGeometry(22, 10, 34), new THREE.MeshStandardMaterial({ color: '#e9ebec', roughness: 0.6 }), stationMs.length);
    stationMs.forEach((mm, i) => sm.setMatrixAt(i, mm));
    group.add(tw, sm);
  }
  const vA = new THREE.Vector3(), vD = new THREE.Vector3();
  const placeMovers = () => {
    for (const mv of movers) {
      let k = 0;
      for (const h of mv.heads) {
        // ida y vuelta: la cabeza recorre 2·L; en la vuelta va por el otro lado
        const L = mv.total, hh = ((h % (2 * L)) + 2 * L) % (2 * L);
        const back = hh > L;
        for (let c = 0; c < mv.cars; c++) {
          const d = back ? 2 * L - hh + c * mv.gap : hh - c * mv.gap;
          along(mv, d, vA, vD);
          const side = mv.cars > 1 ? (back ? -2.2 : 2.2) : back ? -3 : 3;
          vA.x += -vD.z * side;
          vA.z += vD.x * side;
          vA.y += mv.lift;
          q.setFromAxisAngle(up, Math.atan2(vD.x, vD.z));
          mv.mesh.setMatrixAt(k++, m4.compose(vA, q, s.set(1, 1, 1)));
        }
      }
      mv.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  placeMovers();

  // ---- nubes recostadas en las cuchillas (sprites suaves que se desvanecen cerca de la cámara)
  const clouds: THREE.Sprite[] = [];
  const lowClouds: THREE.Sprite[] = [];
  if (typeof document !== 'undefined') {
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 128;
    const g2 = cvs.getContext('2d');
    if (g2) {
      for (let k = 0; k < 9; k++) {
        const x = 30 + rnd() * 68, y = 44 + rnd() * 40, r = 18 + rnd() * 26;
        const grd = g2.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(255,255,255,0.55)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g2.fillStyle = grd;
        g2.fillRect(0, 0, 128, 128);
      }
      const tex = new THREE.CanvasTexture(cvs);
      tex.colorSpace = THREE.SRGBColorSpace;
      textures.push(tex);
      for (let k = 0; k < (alta ? 20 : 7); k++) {
        const side = k % 2 ? 1 : -1;
        const yk = sy - 9 + rnd() * 20;
        const c = cross(riverAt(yk).x + side, yk);
        const xk = riverAt(yk).x + side * c.crestD * (0.7 + rnd() * 0.4);
        const [x, z] = wOf(xk, yk);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85, fog: true }));
        sp.position.set(x, baseY + c.crestH - zSpot + Y0 + 80 + rnd() * 380, z);
        const sc = 700 + rnd() * 1100;
        sp.scale.set(sc, sc * 0.42, 1);
        clouds.push(sp);
        group.add(sp);
      }
      // Nubes bajas de tormenta: jirones grises que se arrastran por las laderas, a cientos de metros del
      // sector. Solo aparecen con lluvia y se desvanecen cerca de la cámara para no tapar lo que se calcula.
      for (let k = 0; k < (alta ? 26 : 10); k++) {
        const ang = rnd() * Math.PI * 2, d = 850 + rnd() * 2600;
        const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#8d969d', transparent: true, depthWrite: false, opacity: 0, fog: true }));
        sp.position.set(x, gy(x, z) + 45 + rnd() * 190, z);
        const sc = 320 + rnd() * 520;
        sp.scale.set(sc, sc * (0.3 + rnd() * 0.12), 1);
        sp.visible = false;
        sp.userData.drift = 3 + rnd() * 5;
        sp.userData.lift = sp.position.y - gy(x, z);
        lowClouds.push(sp);
        group.add(sp);
      }
    }
  }

  // ---- lugares para orientarse (rótulos de baja prioridad)
  {
    const near = (pts: [number, number][]) => {
      let best = pts[0], bd = Infinity;
      for (const pt of pts) {
        const [x, z] = wOf(...pt);
        const d = Math.hypot(x, z);
        if (d < bd) {
          bd = d;
          best = pt;
        }
      }
      return { pt: best, d: bd };
    };
    const ry = sy;
    landmarks.push({ id: 'rio', text: 'Río Medellín', at: atKm(riverAt(ry).x, ry, 12), priority: 2 });
    const ma = near(resampleKm(METRO_A.pts, 60).map(([x, z]) => kmOf(x, z)));
    landmarks.push({ id: 'metro', text: 'Metro (línea A)', at: atKm(...ma.pt, 26), priority: 2 });
    for (const c of CABLES) {
      const cn = near(c.pts.length > 1 ? resampleKm(c.pts, 80).map(([x, z]) => kmOf(x, z)) : c.pts);
      if (cn.d < 3500) landmarks.push({ id: `cable-${c.id}`, text: c.name, at: atKm(...cn.pt, 34), priority: 1 });
    }
    landmarks.push({ id: 'biblioteca', text: 'Biblioteca España', at: atKm(...PLACES.bibliotecaEspana, 50), priority: 1 });
    landmarks.push({ id: 'centro', text: 'Centro (Edificio Coltejer)', at: atKm(...PLACES.coltejer, 190), priority: 1 });
    for (const h of HILLS) {
      if (h.id === 'padre-amaya') continue;
      const [x, z] = wOf(h.x, h.y);
      if (Math.hypot(x, z) < 6000) landmarks.push({ id: `cerro-${h.id}`, text: h.name, at: atKm(h.x, h.y, 40), priority: 1 });
    }
  }

  if (MQ) {
    // Maqueta: todo el entorno en tonos claros y sin brillo; el agua del río, azul grisáceo; la vegetación, salvia.
    // El grupo baja `drop` metros: el borde del sector queda como un corte de terreno a la vista.
    const white = new THREE.Color(0.9, 0.89, 0.86), sage = new THREE.Color(0.72, 0.79, 0.66), hsl = { h: 0, s: 0, l: 0 };
    const tone = (c: THREE.Color) => {
      c.getHSL(hsl);
      const veg = hsl.h > 0.17 && hsl.h < 0.47 && hsl.s > 0.2;
      return c.copy(veg ? sage : white).multiplyScalar(0.93 + 0.12 * hsl.l);
    };
    const ribbonTone: Record<string, string> = { '#6b7a62': '#a9bccb', '#a19e95': '#d8d6d0', '#5f8f45': '#c3cdb8', '#4c4d51': '#cfcecb', '#55585c': '#d3d2ce', '#7a8a6e': '#cbd0c4' };
    group.traverse((o) => {
      if (o === terrain || o === apron || (o as THREE.Sprite).isSprite) return;
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | THREE.LineBasicMaterial | undefined;
      if (!mat || mat === bMat) return;
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh && im.instanceColor) {
        const c = new THREE.Color();
        for (let i = 0; i < im.count; i++) {
          im.getColorAt(i, c);
          im.setColorAt(i, tone(c));
        }
        im.instanceColor.needsUpdate = true;
      }
      if (o.userData.ribbon) (mat as THREE.MeshStandardMaterial).color.set(ribbonTone[o.userData.ribbon] ?? '#d3d2ce');
      else if ((mat as THREE.LineBasicMaterial).isLineBasicMaterial) (mat as THREE.LineBasicMaterial).color.set('#9aa0a6');
      else if (!(im.isInstancedMesh && im.instanceColor) && (mat as THREE.MeshStandardMaterial).color) tone((mat as THREE.MeshStandardMaterial).color);
      const sm = mat as THREE.MeshStandardMaterial;
      if (sm.isMeshStandardMaterial) {
        sm.metalness = 0;
        sm.roughness = Math.max(sm.roughness, 0.85);
        if (sm.emissive) sm.emissive.setRGB(0, 0, 0);
      }
    });
    trunkM.color.set('#b8b0a4');
    group.position.y = -drop;
  }

  const farObjs: THREE.Object3D[] = [...group.children.filter((o) => o.userData.far), ...clouds];
  let detail: 1 | 2 = 2;
  return {
    group,
    groundY: (x: number, z: number) => gy(x, z) - drop,
    refreshApron: buildApron,
    landmarks,
    textures,
    get detail() {
      return detail;
    },
    setDetail(level: 1 | 2) {
      detail = level;
      for (const o of farObjs) o.visible = level === 2;
    },
    update(dt: number, storm: number, cam?: THREE.Vector3) {
      night.value = storm;
      wet.value = storm;
      for (const c of clouds) (c.material as THREE.SpriteMaterial).color.setScalar(1 - 0.45 * storm);
      const low = detail === 2 ? THREE.MathUtils.smoothstep(storm, 0.3, 0.8) : 0;
      for (const c of lowClouds) {
        if (dt > 0 && low > 0) {
          // el viento las arrastra hacia el occidente; al salir del anillo reaparecen del otro lado
          c.position.x -= dt * c.userData.drift;
          if (c.position.x < -3600) c.position.x += 7200;
          c.position.y = gy(c.position.x, c.position.z) + c.userData.lift;
        }
        // nunca sobre el sector (al derivar pueden pasarle cerca) ni pegadas a la cámara
        const away = THREE.MathUtils.smoothstep(Math.hypot(c.position.x, c.position.z), 550, 900);
        const near = away * (cam ? THREE.MathUtils.smoothstep(c.position.distanceTo(cam), 260, 700) : 1);
        const m = c.material as THREE.SpriteMaterial;
        m.opacity = 0.78 * low * near;
        c.visible = m.opacity > 0.01;
      }
      if (dt <= 0) return;
      for (const mv of movers) for (let k = 0; k < mv.heads.length; k++) mv.heads[k] += dt * mv.speed;
      placeMovers();
    },
  };
}

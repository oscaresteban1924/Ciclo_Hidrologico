// Casas de barrio con acabado: muros con fachada pintada en el sombreador (zócalo, cornisa, ventanas por piso con
// marco, rejas en el primer piso, puerta al frente; la escuela con ventanales y zócalo azul) y techos de teja de dos
// aguas o planchas de concreto con su tanque de agua. Las medidas de la fachada van en metros reales aunque la
// escena esté a otra escala o con el relieve exagerado. Sin imágenes descargadas.

import * as THREE from 'three';
import { lookMaterial } from './look';

const HNOISE = /* glsl */ `
float hH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hH(i), hH(i + vec2(1.0, 0.0)), u.x), mix(hH(i + vec2(0.0, 1.0)), hH(i + vec2(1.0, 1.0)), u.x), u.y); }
float hF(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 3; k++) { s += a * hN(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
vec3 hsr(vec3 c) { return pow(c, vec3(2.2)); }
`;


export interface HouseSpec {
  /** Centro de la base en el mundo, ancho (x) y fondo (z) en unidades del mundo. */
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  /** Altura real [m] y altura en el mundo (con la exageración). */
  h: number;
  hw: number;
  wall: string;
  /** Lado de la puerta: normal del frente en el plano del objeto (x, z). */
  front: [number, number];
  roof: 'teja' | 'plancha' | 'none';
  roofColor: string;
  school?: boolean;
  /** Giro alrededor del eje vertical [rad] (el frente y el techo giran con la casa). */
  rot?: number;
}

export interface HouseOptions {
  /** Lo que el muro se hunde en el terreno [unidades del mundo] para no quedar flotando en pendientes. */
  sink?: number;
}


/** Prisma de techo de dos aguas: base de 1 × 1 (x a lo largo de la cumbrera, z de lado a lado) y altura 1. */
function gableGeometry(): THREE.BufferGeometry {
  const p: number[] = [], n: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => {
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const nn = ab.cross(ac).normalize();
    p.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) n.push(nn.x, nn.y, nn.z);
  };
  const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5], E = [-0.5, 1, 0], F = [0.5, 1, 0];
  // aguas
  tri(A, E, F);
  tri(A, F, B);
  tri(D, C, F);
  tri(D, F, E);
  // culatas
  tri(A, D, E);
  tri(B, F, C);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  return g;
}

/**
 * Casas de barrio: muros con fachada pintada (sombreador con ventanas por piso, marcos, rejas en el primer piso,
 * puerta al frente, zócalo y cornisa; la escuela con ventanales y zócalo azul), techos de teja o planchas con su
 * tanque. `sc` es unidades del mundo por metro en planta y `vz` en altura (con la exageración).
 */
export function facadeHouses(list: HouseSpec[], sc: number, vz: number, o: HouseOptions = {}): { walls: THREE.InstancedMesh; roofs: THREE.Object3D[] } {
  const SINK = o.sink ?? 0.3;
  const n = Math.max(1, list.length);
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const info = new Float32Array(n * 4);
  list.forEach((h, i) => info.set([h.h, h.front[0], h.front[1], h.school ? 1 : 0], i * 4));
  box.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  const wm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  wm.userData.noLook = true;
  wm.onBeforeCompile = (sh) => {
    sh.uniforms.uSc = { value: sc };
    sh.uniforms.uVz = { value: vz };
    sh.uniforms.uSink = { value: SINK };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nvarying vec4 vInfo;\nvarying vec3 vHL;\nvarying vec3 vHS;\nvarying vec3 vHN;\nvarying float vSeed;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfo = aInfo; vHL = position; vHN = normal; vSeed = float(gl_InstanceID);\nvHS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uSc;\nuniform float uVz;\nuniform float uSink;\nvarying vec4 vInfo;\nvarying vec3 vHL;\nvarying vec3 vHS;\nvarying vec3 vHN;\nvarying float vSeed;\nfloat m2Glass = 0.0;\n${HNOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vHN.y > 0.5) {
          // azotea de concreto (casas sin techo aparte y edificios)
          diffuseColor.rgb = hsr(vec3(0.68, 0.66, 0.62)) * (0.9 + 0.12 * hN(vec2(vHL.x * vHS.x, vHL.z * vHS.z) / uSc * 0.8 + vSeed));
        } else if (abs(vHN.y) < 0.5) {
          bool sideX = abs(vHN.x) > 0.5;
          float span = (sideX ? vHS.z : vHS.x) / uSc;
          float u = (sideX ? vHL.z * vHS.z : vHL.x * vHS.x) / uSc + span * 0.5;
          float v = (vHL.y * vHS.y - uSink) / uVz;
          float H = vInfo.x;
          bool school = vInfo.w > 0.5;
          float nf = max(1.0, floor(H / 2.8 + 0.5));
          float fh = H / nf;
          float f = floor(v / fh), fy = v - f * fh;
          float mwT = school ? 3.6 : 3.0;
          float nMod = max(1.0, floor(span / mwT + 0.5));
          float mw = span / nMod;
          float mi = floor(u / mw), fx = u - mi * mw;
          float wW = school ? 2.2 : 1.15, wH = school ? 1.5 : 1.25, sill = school ? 0.8 : 0.95;
          bool front = dot(vec2(vHN.x, vHN.z), vInfo.yz) > 0.5;
          float doorMod = floor(nMod * 0.5);
          bool doorHere = front && f < 0.5 && abs(mi - doorMod) < 0.5;
          // anchos de una línea en metros (para suavizar de lejos)
          float aa = max(fwidth(u), fwidth(v));
          float far = smoothstep(0.12, 0.45, aa);
          vec3 wall = diffuseColor.rgb;
          vec3 col = wall;
          // pañete con manchas leves de humedad abajo
          col *= 0.94 + 0.08 * hN(vec2(u, v) * 1.3 + vSeed * 3.1);
          col *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 1.4, v));
          // zócalo
          vec3 zoc = school ? hsr(vec3(0.24, 0.42, 0.62)) : wall * 0.62;
          col = mix(col, zoc, 1.0 - smoothstep(0.52, 0.58, v));
          // cornisa (franja clara arriba)
          col = mix(col, mix(wall, vec3(1.0), 0.55), smoothstep(H - 0.32, H - 0.26, v));
          // ventana o puerta del módulo
          float cx = abs(fx - mw * 0.5);
          float inWin = (1.0 - smoothstep(wW * 0.5 - 0.02, wW * 0.5 + 0.02, cx)) * smoothstep(sill - 0.02, sill + 0.02, fy) * (1.0 - smoothstep(sill + wH - 0.02, sill + wH + 0.02, fy));
          float inDoor = doorHere ? (1.0 - smoothstep(0.48, 0.52, cx)) * (1.0 - smoothstep(2.08, 2.14, fy)) : 0.0;
          if (doorHere) inWin = 0.0;
          float frameW = 0.08;
          float inGlass = (1.0 - smoothstep(wW * 0.5 - frameW - 0.02, wW * 0.5 - frameW + 0.02, cx)) * smoothstep(sill + frameW - 0.02, sill + frameW + 0.02, fy) * (1.0 - smoothstep(sill + wH - frameW - 0.02, sill + wH - frameW + 0.02, fy));
          vec3 frameC = hsr(vec3(0.93, 0.91, 0.86));
          vec3 glass = mix(hsr(vec3(0.16, 0.21, 0.26)), hsr(vec3(0.42, 0.52, 0.6)), smoothstep(sill, sill + wH, fy) * 0.7);
          // rejas en el primer piso (barrotes verticales)
          float bd = abs(fract(fx / 0.12) - 0.5) * 0.12;
          float bars = (f < 0.5 && !school) ? (1.0 - smoothstep(0.012, 0.02, bd)) * (1.0 - smoothstep(0.02, 0.06, aa)) : 0.0;
          glass = mix(glass, hsr(vec3(0.12, 0.12, 0.12)), bars * 0.85);
          vec3 winC = mix(frameC, glass, inGlass);
          vec3 doorC = mod(vSeed, 3.0) < 1.0 ? hsr(vec3(0.36, 0.23, 0.15)) : mod(vSeed, 3.0) < 2.0 ? hsr(vec3(0.22, 0.3, 0.36)) : hsr(vec3(0.5, 0.18, 0.14));
          vec3 detail = mix(col, winC, inWin);
          detail = mix(detail, doorC, inDoor);
          // de lejos: el promedio (sin parpadeo)
          vec3 avg = mix(col, mix(col, glass, 0.35), step(1.0, nf) * 0.55);
          col = mix(detail, avg, far);
          m2Glass = inGlass * inWin * (1.0 - far);
          diffuseColor.rgb = col;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.18, m2Glass);');
  };
  wm.customProgramCacheKey = () => 'housesFacade1';
  const walls = new THREE.InstancedMesh(box, wm, n);
  walls.count = list.length;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
  const Q2 = new THREE.Quaternion(), off = new THREE.Vector3();
  list.forEach((h, i) => {
    Q.setFromAxisAngle(Y, h.rot ?? 0);
    walls.setMatrixAt(i, M.compose(P.set(h.x, h.y - SINK, h.z), Q, S.set(h.w, h.hw + SINK, h.d)));
    walls.setColorAt(i, C.set(h.wall));
  });
  walls.castShadow = walls.receiveShadow = true;
  const roofs: THREE.Object3D[] = [];
  // techos de teja de dos aguas (la cumbrera a lo largo del lado mayor; pendiente de unos 27°)
  const tejas = list.filter((h) => h.roof === 'teja');
  if (tejas.length) {
    const rm = lookMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78 }), { detail: 0.14, scale: 2 });
    const tm = new THREE.InstancedMesh(gableGeometry(), rm, tejas.length);
    tm.userData.house = tejas.map((h) => list.indexOf(h));
    tejas.forEach((h, i) => {
      const along = h.w >= h.d;
      const span = (along ? h.d : h.w) / sc;
      const rise = span * 0.5 * 0.5 * vz;
      Q.setFromAxisAngle(Y, (h.rot ?? 0) + (along ? 0 : Math.PI / 2));
      tm.setMatrixAt(i, M.compose(P.set(h.x, h.y + h.hw - 0.02, h.z), Q, S.set((along ? h.w : h.d) * 1.08, rise, (along ? h.d : h.w) * 1.14)));
      tm.setColorAt(i, C.set(h.roofColor));
    });
    tm.castShadow = tm.receiveShadow = true;
    roofs.push(tm);
  }
  // planchas: losa con borde y tanque de agua
  const planchas = list.filter((h) => h.roof === 'plancha');
  if (planchas.length) {
    const slabMat = lookMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 }), { detail: 0.12, scale: 2 });
    const slabGeo = new THREE.BoxGeometry(1, 1, 1);
    slabGeo.translate(0, 0.5, 0);
    const slabs = new THREE.InstancedMesh(slabGeo, slabMat, planchas.length);
    const tankGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    tankGeo.translate(0, 0.5, 0);
    const tanks = new THREE.InstancedMesh(tankGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 }), planchas.length);
    slabs.userData.house = tanks.userData.house = planchas.map((h) => list.indexOf(h));
    planchas.forEach((h, i) => {
      Q.setFromAxisAngle(Y, h.rot ?? 0);
      slabs.setMatrixAt(i, M.compose(P.set(h.x, h.y + h.hw - 0.01, h.z), Q, S.set(h.w * 1.04, 0.22 * vz, h.d * 1.04)));
      slabs.setColorAt(i, C.set(h.roofColor));
      const r = Math.min(1.1 * sc, Math.min(h.w, h.d) * 0.16);
      off.set((h.w / 2 - r * 1.6) * (i % 2 ? 1 : -1), 0, (h.d / 2 - r * 1.6) * (i % 3 ? -1 : 1)).applyQuaternion(Q);
      tanks.setMatrixAt(i, M.compose(P.set(h.x + off.x, h.y + h.hw + 0.2 * vz, h.z + off.z), Q2.identity(), S.set(r, 1.2 * vz, r)));
      tanks.setColorAt(i, C.set(i % 3 ? '#26313b' : '#3d6e9e'));
    });
    slabs.castShadow = slabs.receiveShadow = tanks.castShadow = true;
    roofs.push(slabs, tanks);
  }
  return { walls, roofs };
}

/** Las casas en un grupo (muros y techos), como las usa la sala 2D. */
export function facadeGroup(list: HouseSpec[], sc: number, vz: number, o: HouseOptions = {}): THREE.Group {
  const g = new THREE.Group();
  if (!list.length) return g;
  const { walls, roofs } = facadeHouses(list, sc, vz, o);
  g.add(walls, ...roofs);
  return g;
}

/** Colores de techo de teja de barro y de planchas de concreto. */
export const ROOF_TILE = ['#a6503a', '#9a4a34', '#b25d40', '#8c4632', '#b8613f'];
export const ROOF_SLAB = ['#bdb6aa', '#a9a49b', '#c6beb0'];

/**
 * Muestra solo las primeras `n` casas (los muros y sus techos): para barrios que crecen o se reducen sin rehacer la
 * geometría.
 */
export function showHouses(walls: THREE.InstancedMesh, n: number): void {
  walls.count = Math.min(n, walls.instanceMatrix.count);
  for (const r of walls.children) {
    const im = r as THREE.InstancedMesh, idx = im.userData.house as number[] | undefined;
    if (!im.isInstancedMesh || !idx) continue;
    if (!im.userData.base) im.userData.base = Float32Array.from(im.instanceMatrix.array);
    const base = im.userData.base as Float32Array, arr = im.instanceMatrix.array as Float32Array;
    idx.forEach((h, i) => {
      if (h < n) arr.set(base.subarray(i * 16, i * 16 + 16), i * 16);
      else arr.fill(0, i * 16, i * 16 + 16);
    });
    im.instanceMatrix.needsUpdate = true;
  }
}

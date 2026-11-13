// Acabado de la maqueta del valle: el suelo con la textura de cada cobertura (pasto con manchas, cultivos en hileras
// por lotes con su orientación, rastrojo moteado, grava y arena en el cauce, patios, taludes de tierra), casas de
// barrio antioqueño (fachada pintada con zócalo, ventanas por piso con marco y reja, puerta hacia la calle, cornisa;
// techo de teja de dos aguas o plancha con tanque) y matorrales. Todo se dibuja con sombreadores y geometría por
// instancias, sin imágenes descargadas. Las alturas de las casas siguen la exageración del relieve, como el agua.

import * as THREE from 'three';
import { lookMaterial } from '../../three/look';

const NOISE = /* glsl */ `
float gH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gH(i), gH(i + vec2(1.0, 0.0)), u.x), mix(gH(i + vec2(0.0, 1.0)), gH(i + vec2(1.0, 1.0)), u.x), u.y); }
float gF(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 3; k++) { s += a * gN(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
vec3 sr(vec3 c) { return pow(c, vec3(2.2)); }
`;

/**
 * Suelo «natural» del valle: el color sale de la mezcla de coberturas de cada vértice (atributo `aMix`: pasto,
 * cultivos, rastrojo o bosque, cauce; el resto es patio o vía) con su textura en metros del plano; el color de los
 * vértices trae solo el sombreado del relieve. Lejos (más de un metro por píxel) las texturas finas se apagan.
 */
export function groundMaterial(uSc: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.96, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGSc = uSc;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aMix;\nvarying vec4 vMix;\nvarying vec3 vGW;\nvarying vec3 vGN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMix = aMix;\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uGSc;\nvarying vec4 vMix;\nvarying vec3 vGW;\nvarying vec3 vGN;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 P0 = vec2(vGW.x, -vGW.z) / uGSc;
          // en las caras empinadas (orillas, terraplenes) la textura va sobre la cara, a lo largo del talud y en
          // altura, para que no se estire
          vec3 nG = normalize(vGN);
          float slope = 1.0 - clamp(nG.y, 0.0, 1.0);
          vec2 along = normalize(vec2(-nG.z, nG.x) + vec2(1e-4, 0.0));
          vec2 PT = vec2(dot(vGW.xz, along), vGW.y) / uGSc;
          // (el pasto y los demás dibujos usan el plano; solo la tierra de los taludes va sobre la cara: cambiar de
          // proyección según la pendiente deja costuras donde la pendiente ronda el umbral)
          vec2 P = P0;
          float fw = length(fwidth(P0));
          float nearF = 1.0 - smoothstep(0.5, 2.2, fw);
          // pasto: manchas grandes de verde más y menos vivo, grano fino de cerca
          float g1 = gF(P0 * 0.028), g2 = gN(P * 0.7);
          vec3 grass = mix(sr(vec3(0.40, 0.56, 0.24)), sr(vec3(0.58, 0.68, 0.33)), smoothstep(0.25, 0.75, g1));
          grass *= 0.9 + 0.2 * mix(0.5, g2, nearF);
          grass = mix(grass, sr(vec3(0.62, 0.62, 0.36)), smoothstep(0.66, 0.8, gF(P0 * 0.05 + 7.0)) * 0.35);
          // a escala de potrero: zonas más secas (amarillentas) y más frescas (verde azulado)
          float g0 = gF(P0 * 0.0065 + 3.0);
          grass *= mix(vec3(0.9, 0.97, 1.02), vec3(1.1, 1.02, 0.78), smoothstep(0.3, 0.75, g0));
          // cultivos: lotes de unos 40 m, cada uno con su orientación y su estado (sembrado, maduro, arado)
          vec2 cell = floor(P0 / 40.0 + vec2(0.31, 0.17));
          float hA = gH(cell), hB = gH(cell + 7.3);
          float ang = (hA < 0.5 ? 0.0 : 1.5708) + (hB - 0.5) * 0.4;
          float rowc = dot(P0, vec2(cos(ang), sin(ang))) / 1.4;
          float rowAA = 1.0 - smoothstep(0.18, 0.5, fwidth(rowc));
          float row = mix(0.55, smoothstep(0.15, 0.85, 0.5 + 0.5 * cos(rowc * 6.2832)), rowAA * nearF);
          vec3 soil = sr(vec3(0.55, 0.43, 0.29));
          vec3 cropC = hB < 0.34 ? sr(vec3(0.36, 0.56, 0.21)) : hB < 0.67 ? sr(vec3(0.69, 0.66, 0.31)) : sr(vec3(0.47, 0.6, 0.25));
          float sown = hA > 0.82 ? 0.25 : 0.82;
          vec3 crop = mix(soil, cropC, row * sown + (1.0 - sown) * 0.15);
          vec2 fc = fract(P0 / 40.0 + vec2(0.31, 0.17));
          float edge = min(min(fc.x, 1.0 - fc.x), min(fc.y, 1.0 - fc.y)) * 40.0;
          crop = mix(sr(vec3(0.45, 0.55, 0.28)), crop, smoothstep(0.6, 1.6, edge));
          // rastrojo y bosque: moteado de matas oscuras, claros y tierra
          float s1 = gF(P0 * 0.11), s2 = gN(P * 0.9);
          vec3 shrub = mix(sr(vec3(0.27, 0.42, 0.19)), sr(vec3(0.47, 0.56, 0.27)), smoothstep(0.35, 0.72, s1));
          shrub = mix(shrub, sr(vec3(0.5, 0.43, 0.29)), smoothstep(0.72, 0.86, s2) * 0.45 * nearF);
          // cauce: grava y arena (los cantos se ven de cerca)
          float p1 = gN(P * 1.9), p2 = gF(P0 * 0.18);
          vec3 grav = mix(sr(vec3(0.55, 0.54, 0.5)), sr(vec3(0.66, 0.64, 0.58)), smoothstep(0.2, 0.8, p2));
          grav *= 0.9 + 0.18 * mix(0.5, smoothstep(0.3, 0.7, p1), nearF);
          // patios y vías
          vec3 paved = sr(vec3(0.66, 0.63, 0.57)) * (0.92 + 0.14 * gN(P * 0.8));
          // bordes entre coberturas: la mezcla suave de los vértices se vuelve un borde irregular, como en el campo
          // (cada cobertura con su ruido; de lejos el borde se ablanda para no titilar)
          float wPaved = max(0.0, 1.0 - vMix.x - vMix.y - vMix.z - vMix.w);
          // en los taludes no hay hileras de cultivo: el lote se vuelve pasto
          vec4 mixS = vMix;
          float onSlope = smoothstep(0.1, 0.22, slope);
          mixS.x += mixS.y * onSlope;
          mixS.y *= 1.0 - onSlope;
          float kS = mix(3.0, 14.0, nearF);
          vec4 sN = vec4(gN(P0 * 0.22 + 1.3), gN(P0 * 0.22 + 11.7), gN(P0 * 0.22 + 23.1), gN(P0 * 0.22 + 37.9)) + 0.35 * vec4(gN(P * 0.9 + 3.1), gN(P * 0.9 + 5.7), gN(P * 0.9 + 8.3), gN(P * 0.9 + 2.9)) - 0.675;
          vec4 eW = exp(kS * (mixS + 0.45 * sN)) * step(0.002, mixS);
          float eP = exp(kS * (wPaved + 0.45 * (gN(P0 * 0.22 + 51.3) - 0.5))) * step(0.002, wPaved);
          float eSum = max(1e-4, eW.x + eW.y + eW.z + eW.w + eP);
          eW /= eSum;
          eP /= eSum;
          vec3 base = grass * eW.x + crop * eW.y + shrub * eW.z + grav * eW.w + paved * eP;
          // taludes empinados (orillas del cauce, costados del jarillón y de la vía): tierra con pasto ralo
          float bare = smoothstep(0.22, 0.55, slope + (gN(P0 * 0.4) - 0.5) * 0.16);
          float cliff = smoothstep(0.45, 0.75, slope);
          vec3 soilC = mix(sr(vec3(0.6, 0.52, 0.41)), sr(vec3(0.5, 0.42, 0.32)), smoothstep(0.3, 0.7, gF(PT * vec2(0.25, 0.9))));
          soilC *= 0.88 + 0.22 * gN(PT * 1.6);
          // la tierra sale en parches con borde (pasto ralo), no como un velo: de lejos, el promedio
          float bareAmt = max(bare * 0.55, cliff * 0.92) * (1.0 - eW.w * 0.6);
          float nb = gN(PT * 0.35) * 0.6 + gN(PT * 1.1) * 0.4;
          float soilMask = mix(bareAmt, smoothstep(0.42, 0.58, bareAmt + (nb - 0.5) * 0.7), nearF);
          base = mix(base, soilC, soilMask);
          diffuseColor.rgb *= base;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'm2ground1';
  // sombras de nubes que pasan (el grano ya lo pone el suelo)
  return lookMaterial(m, { detail: 0.04, patches: 0, clouds: [0.13, 95] });
}

// ------------------------------------------------------------------ casas

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
  roof: 'teja' | 'plancha';
  roofColor: string;
  school?: boolean;
}

/** Lo que la casa se hunde en el terreno [unidades del mundo] para que no quede flotando en las pendientes. */
const SINK = 0.3;

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
export function valleyHouses(list: HouseSpec[], sc: number, vz: number): THREE.Group {
  const g = new THREE.Group();
  const n = list.length;
  if (!n) return g;
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
      .replace('#include <common>', `#include <common>\nuniform float uSc;\nuniform float uVz;\nuniform float uSink;\nvarying vec4 vInfo;\nvarying vec3 vHL;\nvarying vec3 vHS;\nvarying vec3 vHN;\nvarying float vSeed;\nfloat m2Glass = 0.0;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (abs(vHN.y) < 0.5) {
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
          col *= 0.94 + 0.08 * gN(vec2(u, v) * 1.3 + vSeed * 3.1);
          col *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 1.4, v));
          // zócalo
          vec3 zoc = school ? sr(vec3(0.24, 0.42, 0.62)) : wall * 0.62;
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
          vec3 frameC = sr(vec3(0.93, 0.91, 0.86));
          vec3 glass = mix(sr(vec3(0.16, 0.21, 0.26)), sr(vec3(0.42, 0.52, 0.6)), smoothstep(sill, sill + wH, fy) * 0.7);
          // rejas en el primer piso (barrotes verticales)
          float bd = abs(fract(fx / 0.12) - 0.5) * 0.12;
          float bars = (f < 0.5 && !school) ? (1.0 - smoothstep(0.012, 0.02, bd)) * (1.0 - smoothstep(0.02, 0.06, aa)) : 0.0;
          glass = mix(glass, sr(vec3(0.12, 0.12, 0.12)), bars * 0.85);
          vec3 winC = mix(frameC, glass, inGlass);
          vec3 doorC = mod(vSeed, 3.0) < 1.0 ? sr(vec3(0.36, 0.23, 0.15)) : mod(vSeed, 3.0) < 2.0 ? sr(vec3(0.22, 0.3, 0.36)) : sr(vec3(0.5, 0.18, 0.14));
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
  wm.customProgramCacheKey = () => 'm2houses1';
  const walls = new THREE.InstancedMesh(box, wm, n);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
  list.forEach((h, i) => {
    walls.setMatrixAt(i, M.compose(P.set(h.x, h.y - SINK, h.z), Q.identity(), S.set(h.w, h.hw + SINK, h.d)));
    walls.setColorAt(i, C.set(h.wall));
  });
  walls.castShadow = walls.receiveShadow = true;
  g.add(walls);
  // techos de teja de dos aguas (la cumbrera a lo largo del lado mayor; pendiente de unos 27°)
  const tejas = list.filter((h) => h.roof === 'teja');
  if (tejas.length) {
    const rm = lookMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78 }), { detail: 0.14, scale: 2 });
    const roofs = new THREE.InstancedMesh(gableGeometry(), rm, tejas.length);
    const Y = new THREE.Vector3(0, 1, 0);
    tejas.forEach((h, i) => {
      const along = h.w >= h.d;
      const span = (along ? h.d : h.w) / sc;
      const rise = span * 0.5 * 0.5 * vz;
      Q.setFromAxisAngle(Y, along ? 0 : Math.PI / 2);
      roofs.setMatrixAt(i, M.compose(P.set(h.x, h.y + h.hw - 0.02, h.z), Q, S.set((along ? h.w : h.d) * 1.08, rise, (along ? h.d : h.w) * 1.14)));
      roofs.setColorAt(i, C.set(h.roofColor));
    });
    roofs.castShadow = roofs.receiveShadow = true;
    g.add(roofs);
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
    planchas.forEach((h, i) => {
      slabs.setMatrixAt(i, M.compose(P.set(h.x, h.y + h.hw - 0.01, h.z), Q.identity(), S.set(h.w * 1.04, 0.22 * vz, h.d * 1.04)));
      slabs.setColorAt(i, C.set(h.roofColor));
      const r = 1.1 * sc;
      const dx = (h.w / 2 - r * 1.6) * (i % 2 ? 1 : -1), dz = (h.d / 2 - r * 1.6) * (i % 3 ? -1 : 1);
      tanks.setMatrixAt(i, M.compose(P.set(h.x + dx, h.y + h.hw + 0.2 * vz, h.z + dz), Q.identity(), S.set(r, 1.2 * vz, r)));
      tanks.setColorAt(i, C.set(i % 3 ? '#26313b' : '#3d6e9e'));
    });
    slabs.castShadow = slabs.receiveShadow = tanks.castShadow = true;
    g.add(slabs, tanks);
  }
  return g;
}

// ------------------------------------------------------------------ matorrales

export interface BushSpot {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** Matas bajas del rastrojo (por instancias), con el viento en las puntas. */
export function bushes(spots: BushSpot[], seed = 5): THREE.InstancedMesh | null {
  if (!spots.length) return null;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // forma irregular y base plana
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const w = 1 + 0.18 * Math.sin(x * 5.1 + z * 3.7) * Math.cos(y * 4.3);
    pos.setXYZ(k, x * w, Math.max(-0.2, y) * w, z * w);
  }
  geo.computeVertexNormals();
  const m = lookMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), { sway: 0.03, detail: 0.12 });
  const im = new THREE.InstancedMesh(geo, m, spots.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
  const greens = ['#4f7a35', '#5d8a3c', '#6b8f43', '#47703a', '#7a9447', '#6f7f3a'];
  let s = seed * 9301 + 49297;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  spots.forEach((b, i) => {
    Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
    im.setMatrixAt(i, M.compose(P.set(b.x, b.y + b.r * 0.15, b.z), Q, S.set(b.r * (0.9 + R() * 0.3), b.r * (0.55 + R() * 0.25), b.r * (0.9 + R() * 0.3))));
    im.setColorAt(i, C.set(greens[Math.floor(R() * greens.length)]).multiplyScalar(0.9 + R() * 0.2));
  });
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

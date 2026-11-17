// Suelo natural dibujado por cobertura (pasto con manchas de potrero, cultivos en lotes con hileras, rastrojo
// moteado, grava, patios y vías; bordes irregulares entre coberturas y parches de tierra en los taludes). La mezcla de
// coberturas llega por vértice en el atributo aMix (pasto, cultivo, rastrojo o bosque, grava; el resto es patio o
// vía); el color del vértice solo sombrea. Escala en unidades del mundo por metro. Sin imágenes descargadas.

import * as THREE from 'three';
import { lookMaterial } from './look';

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
export function groundMaterial(uSc: { value: number }, clouds: [number, number] = [0.13, 95]): THREE.MeshStandardMaterial {
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
  return lookMaterial(m, { detail: 0.04, patches: 0, clouds });
}


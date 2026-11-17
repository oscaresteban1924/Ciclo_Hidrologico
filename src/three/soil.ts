// Material de corte de suelo: el grano se dibuja en el sombreador según el tamaño de partícula (grava con cantos,
// arena con granos, limo fino, arcilla lisa con grietas), en metros del mundo y con un escalado para ver el grano en
// maquetas grandes. Donde el suelo está saturado (bajo `uWater` en la cota y) se oscurece y brilla un poco; encima, una
// franja capilar húmeda. Sin imágenes descargadas.

import * as THREE from 'three';

export type Grain = 'grava' | 'arena' | 'arenafina' | 'limo' | 'arcilla';

/** Tamaño de dibujo del grano [unidades del mundo] y contraste, por tipo de suelo. */
const GRAIN: Record<Grain, { size: number; amp: number; cracks: number }> = {
  grava: { size: 1.6, amp: 0.38, cracks: 0 },
  arena: { size: 0.55, amp: 0.26, cracks: 0 },
  arenafina: { size: 0.3, amp: 0.18, cracks: 0 },
  limo: { size: 0.18, amp: 0.1, cracks: 0.25 },
  arcilla: { size: 0.12, amp: 0.06, cracks: 0.7 },
};

export interface SoilUniforms {
  uGrain: { value: THREE.Vector3 };
  /** Cota del agua por x: textura de 1 × N (R = cota, normalizada con uWaterRange) o un valor fijo si uWaterTex = 0. */
  uWaterTex: { value: THREE.DataTexture | null };
  uWaterRange: { value: THREE.Vector3 };
  uWet: { value: number };
}

/**
 * Material de corte: `color` es el color seco del suelo; `scale` agranda el grano para que se vea en maquetas de
 * cientos de metros. El nivel del agua se pasa con `setWaterLine` (cota por x en el mundo).
 */
export function soilCutMaterial(color: string, grain: Grain, scale = 1): THREE.MeshStandardMaterial & { soil: SoilUniforms; setGrain: (g: Grain, color?: string) => void; setWaterLine: (x0: number, x1: number, y: number[] | null) => void } {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1 }) as THREE.MeshStandardMaterial & { soil: SoilUniforms; setGrain: (g: Grain, color?: string) => void; setWaterLine: (x0: number, x1: number, y: number[] | null) => void };
  m.userData.noLook = true;
  const g0 = GRAIN[grain];
  const tex = new THREE.DataTexture(new Float32Array(256 * 4), 256, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const u: SoilUniforms = {
    uGrain: { value: new THREE.Vector3(g0.size * scale, g0.amp, g0.cracks) },
    uWaterTex: { value: tex },
    uWaterRange: { value: new THREE.Vector3(0, 1, 0) },
    uWet: { value: 0 },
  };
  m.soil = u;
  m.setGrain = (g, c) => {
    const q = GRAIN[g];
    u.uGrain.value.set(q.size * scale, q.amp, q.cracks);
    if (c) m.color.set(c);
  };
  m.setWaterLine = (x0, x1, ys) => {
    if (!ys || !ys.length) {
      u.uWet.value = 0;
      return;
    }
    const d = tex.image.data as Float32Array;
    for (let i = 0; i < 256; i++) {
      const f = (i / 255) * (ys.length - 1), k = Math.min(ys.length - 2, Math.floor(f)), t = f - k;
      d[i * 4] = ys.length > 1 ? ys[k] * (1 - t) + ys[k + 1] * t : ys[0];
    }
    tex.needsUpdate = true;
    u.uWaterRange.value.set(x0, x1, 0);
    u.uWet.value = 1;
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW;\nvarying vec3 vSN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSW;
        varying vec3 vSN;
        uniform vec3 uGrain;
        uniform sampler2D uWaterTex;
        uniform vec3 uWaterRange;
        uniform float uWet;
        float sH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float sN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(sH(i), sH(i + vec2(1.0, 0.0)), u.x), mix(sH(i + vec2(0.0, 1.0)), sH(i + vec2(1.0, 1.0)), u.x), u.y); }
        // granos: celdas de Voronoi (distancia al centro más cercano y al segundo)
        vec2 sV(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y));
            vec2 o = vec2(sH(i + g), sH(i + g + 17.3)); float d = length(g + o - f);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
          return vec2(d1, d2); }
        float m2SoilWet = 0.0;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // la cara del corte: x a lo largo y y en altura (o z si la cara mira de lado)
          vec2 P = (abs(vSN.x) > 0.7 ? vSW.zy : vSW.xy) / uGrain.x;
          float fw = length(fwidth(P));
          float near = 1.0 - smoothstep(0.35, 1.2, fw);
          vec2 v = sV(P);
          float edge = smoothstep(0.0, 0.18, v.y - v.x);
          float id = sH(floor(P + 0.5) + 3.1);
          float grain = mix(0.5, (0.65 + 0.35 * id) * mix(0.55, 1.0, edge), near);
          float tone = sN(P * 0.15 + 7.0);
          vec3 c = diffuseColor.rgb * (1.0 + (grain - 0.5) * 2.0 * uGrain.y) * (0.92 + 0.16 * tone);
          // grietas de la arcilla y el limo
          if (uGrain.z > 0.0) {
            vec2 cv = sV(P * 0.07 + 2.0);
            float crack = 1.0 - smoothstep(0.0, 0.04 + 0.02 * (1.0 - near), cv.y - cv.x);
            c *= 1.0 - crack * 0.45 * uGrain.z;
          }
          // capas: bandas suaves de depósito
          c *= 0.95 + 0.1 * sN(vec2(vSW.x * 0.02, vSW.y * 0.6));
          if (uWet > 0.5) {
            float fx = clamp((vSW.x - uWaterRange.x) / max(1e-3, uWaterRange.y - uWaterRange.x), 0.0, 1.0);
            float wl = texture2D(uWaterTex, vec2(fx, 0.5)).r;
            float below = wl - vSW.y;
            float sat = smoothstep(-0.02, 0.05, below);
            float fringe = (1.0 - smoothstep(0.0, 1.4, -below)) * (1.0 - sat);
            c = mix(c, c * vec3(0.72, 0.76, 0.83), sat);
            c = mix(c, c * vec3(0.82, 0.84, 0.88), fringe * 0.7);
            // la línea del nivel freático
            c = mix(c, vec3(0.12, 0.42, 0.72), (1.0 - smoothstep(0.0, max(0.06, fwidth(below) * 1.5), abs(below))) * 0.85);
            m2SoilWet = sat;
          }
          diffuseColor.rgb = c;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.45, m2SoilWet);');
  };
  m.customProgramCacheKey = () => 'soilCut1';
  return m;
}

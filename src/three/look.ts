// Acabado visual común de las escenas 3D: cielo con sol y nubes que pasan, textura sutil en las superficies
// (en coordenadas del mundo, sin imágenes descargadas), agua con ondas que se mueven con la corriente y brillos del
// sol, viento en las copas de los árboles y un paso final con oclusión ambiental (N8AO) y suavizado (SMAA). La
// calidad se ajusta sola: en equipos lentos o con render por software se apaga la oclusión.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { N8AOPass } from 'n8ao';

/** Reloj de los sombreadores (ondas, nubes, viento). Lo avanza la escena que dibuja. */
export const LOOK_TIME = { value: 0 };

const NOISE = /* glsl */ `
float lkH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float lkN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lkH(i), lkH(i + vec2(1.0, 0.0)), u.x), mix(lkH(i + vec2(0.0, 1.0)), lkH(i + vec2(1.0, 1.0)), u.x), u.y); }
float lkF(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++) { s += a * lkN(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
`;

export interface LookOptions {
  /** Grano fino de la superficie (0 nada, 0,2 marcado). */
  detail?: number;
  /** Manchas grandes en las superficies horizontales (pasto, tierra, concreto lavado). */
  patches?: number;
  /** Escala del grano (1 = metros). */
  scale?: number;
  /** Agua: ondas que avanzan con la corriente [unidades/s] y fuerza de las ondas. */
  water?: { flow?: [number, number]; strength?: number };
  /** Viento en copas (desplazamiento máximo en la punta, en unidades del objeto). */
  sway?: number;
}

/**
 * Agrega el acabado a un material estándar, de Lambert o de Phong, encadenado con el onBeforeCompile que ya
 * tenga (las vetas del agua o las ventanas de las casas siguen funcionando). Cada combinación tiene su propio
 * programa: la clave de caché incluye la del material original.
 */
export function lookMaterial<M extends THREE.Material>(mat: M, o: LookOptions): M {
  if (mat.userData.look) return mat;
  mat.userData.look = o;
  const prev = mat.onBeforeCompile;
  const key0 = mat.customProgramCacheKey();
  const water = !!o.water;
  const sway = !!o.sway;
  const uD = { value: new THREE.Vector3(o.detail ?? 0, o.patches ?? 0, o.scale ?? 1) };
  const uW = { value: new THREE.Vector4(o.water?.flow?.[0] ?? 0.35, o.water?.flow?.[1] ?? 0.12, o.water?.strength ?? 0.6, water ? 1 : 0) };
  const uS = { value: o.sway ?? 0 };
  mat.userData.lookUniforms = { detail: uD, water: uW, sway: uS };
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uLkD = uD;
    sh.uniforms.uLkW = uW;
    sh.uniforms.uLkS = uS;
    sh.uniforms.uLkT = LOOK_TIME;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLkW;\nvarying vec3 vLkN;\nuniform float uLkS;\nuniform float uLkT;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
      #ifdef USE_INSTANCING
        mat4 lkM = modelMatrix * instanceMatrix;
      #else
        mat4 lkM = modelMatrix;
      #endif
      ${
        sway
          ? `vec3 lkO = (lkM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float lkP = lkO.x * 0.21 + lkO.z * 0.17;
        float lkY = max(0.0, position.y);
        transformed.xz += vec2(sin(uLkT * 1.6 + lkP) + 0.4 * sin(uLkT * 3.7 + lkP * 2.0), cos(uLkT * 1.3 + lkP * 1.3)) * uLkS * lkY;`
          : ''
      }
        vLkW = (lkM * vec4(transformed, 1.0)).xyz;
        vLkN = normalize(mat3(lkM) * objectNormal);
      }`,
    );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLkW;\nvarying vec3 vLkN;\nuniform vec3 uLkD;\nuniform vec4 uLkW;\nuniform float uLkT;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (uLkD.x + uLkD.y > 0.0) {
          vec3 lkA = pow(abs(normalize(vLkN)), vec3(4.0));
          lkA /= (lkA.x + lkA.y + lkA.z + 1e-5);
          vec3 lkP = vLkW * uLkD.z;
          float lkFw = length(fwidth(lkP));
          float lkG1 = lkN(lkP.zy * 1.7) * lkA.x + lkN(lkP.xz * 1.7) * lkA.y + lkN(lkP.xy * 1.7) * lkA.z;
          float lkG2 = lkN(lkP.zy * 0.33 + 3.7) * lkA.x + lkN(lkP.xz * 0.33 + 3.7) * lkA.y + lkN(lkP.xy * 0.33 + 3.7) * lkA.z;
          float lkG3 = lkF(lkP.xz * 0.045);
          float lkV = (lkG1 - 0.5) * uLkD.x * (1.0 - smoothstep(0.25, 0.7, lkFw * 1.7))
                    + (lkG2 - 0.5) * uLkD.x * 0.9 * (1.0 - smoothstep(0.4, 1.2, lkFw * 0.33))
                    + (lkG3 - 0.5) * uLkD.y * 1.6 * lkA.y;
          diffuseColor.rgb *= 1.0 + lkV;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uLkW.w > 0.5) {
          vec2 lkQ = vLkW.xz;
          vec2 lkV = uLkW.xy * uLkT;
          float lkE = 0.12;
          float lkFw = length(fwidth(vLkW));
          float lkK = uLkW.z * (1.0 - smoothstep(0.6, 2.4, lkFw * 2.4)) * smoothstep(0.25, 0.75, abs(normalize(vLkN).y));
          #define LKH(p) (lkN((p) * 0.9 - lkV * 0.9) * 0.62 + lkN((p) * 2.4 - lkV * 1.9 + 4.1) * 0.38)
          float lkH0 = LKH(lkQ), lkHx = LKH(lkQ + vec2(lkE, 0.0)), lkHz = LKH(lkQ + vec2(0.0, lkE));
          vec3 lkWn = normalize(vec3(-(lkHx - lkH0) / lkE * lkK, 1.0, -(lkHz - lkH0) / lkE * lkK));
          normal = normalize(mix(normal, normalize((viewMatrix * vec4(lkWn, 0.0)).xyz), 0.9 * step(0.001, lkK)));
          #undef LKH
        }`,
      );
  };
  mat.customProgramCacheKey = () => `${key0}|look${water ? 'W' : ''}${sway ? 'S' : ''}`;
  mat.needsUpdate = true;
  return mat;
}

/** Agua con ondas y brillos: más lisa (reflejos del sol y del cielo) y con las ondas encadenadas. */
export function lookWater<M extends THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>(mat: M, flow: [number, number] = [0.35, 0.12], strength = 0.6): M {
  mat.roughness = Math.min(mat.roughness, 0.1);
  mat.envMapIntensity = Math.max(mat.envMapIntensity ?? 1, 1.25);
  lookMaterial(mat, { water: { flow, strength } });
  return mat;
}

const DEFAULT_LOOK: LookOptions = { detail: 0.1, patches: 0.1 };

/** Recorre la escena y da el acabado por omisión a los materiales opacos que aún no lo tienen. */
export function lookScene(root: THREE.Object3D, seen: WeakSet<THREE.Material>): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.material) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      if (mat.userData.look || mat.userData.noLook) continue;
      const isLit = (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial || (mat as THREE.MeshLambertMaterial).isMeshLambertMaterial || (mat as THREE.MeshPhongMaterial).isMeshPhongMaterial;
      if (!isLit) continue;
      if (mat.transparent && mat.opacity < 0.97) continue;
      if (((mat as THREE.MeshStandardMaterial).metalness ?? 0) > 0.5) continue;
      lookMaterial(mat, DEFAULT_LOOK);
    }
  });
}

// ------------------------------------------------------------------ cielo

export interface SkyOptions {
  top?: string;
  horizon?: string;
  ground?: string;
  /** Cantidad de nubes (0 despejado, 1 cubierto). */
  clouds?: number;
  radius?: number;
}

/** Cúpula de cielo que sigue a la cámara: degradé, sol con halo, bruma en el horizonte y nubes que pasan. */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  private u: Record<string, THREE.IUniform>;
  private base: { top: THREE.Color; horizon: THREE.Color; ground: THREE.Color };

  constructor(o: SkyOptions = {}) {
    this.base = { top: new THREE.Color(o.top ?? '#5f9fd6'), horizon: new THREE.Color(o.horizon ?? '#e3edf2'), ground: new THREE.Color(o.ground ?? '#dfe5e1') };
    this.u = {
      uTop: { value: this.base.top.clone() },
      uHor: { value: this.base.horizon.clone() },
      uGround: { value: this.base.ground.clone() },
      uSun: { value: new THREE.Vector3(-0.45, 0.62, 0.55).normalize() },
      uSunCol: { value: new THREE.Color('#fff2d6') },
      uCloud: { value: o.clouds ?? 0.45 },
      uStorm: { value: 0 },
      uTime: LOOK_TIME,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHor, uGround, uSun, uSunCol;
        uniform float uCloud, uStorm, uTime;
        varying vec3 vDir;
        ${NOISE}
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
          col = mix(col, uGround, smoothstep(0.015, -0.03, h));
          float sd = max(dot(d, normalize(uSun)), 0.0);
          float clear = 1.0 - uStorm;
          col += uSunCol * (pow(sd, 900.0) * 3.0 + pow(sd, 24.0) * 0.22 + pow(sd, 4.0) * 0.07) * clear;
          if (h > 0.0) {
            vec2 p = d.xz / (h + 0.18) * 1.15 + vec2(uTime * 0.012, uTime * 0.004);
            float c = lkF(p) * 0.7 + lkF(p * 2.7 + 5.0) * 0.3;
            float cover = mix(0.62 - uCloud * 0.22, 0.38, uStorm);
            float m = smoothstep(cover, cover + 0.22, c) * smoothstep(0.0, 0.12, h);
            vec3 cl = mix(vec3(1.0, 0.99, 0.97), vec3(0.47, 0.5, 0.55), uStorm);
            cl *= 0.82 + 0.18 * smoothstep(0.3, 0.9, c) + 0.12 * pow(sd, 6.0) * clear;
            col = mix(col, cl, m * mix(0.78, 0.95, uStorm));
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(o.radius ?? 1000, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.userData.noLook = true;
  }

  /** Dirección hacia el sol (para el halo y el brillo de las nubes). */
  setSun(dir: THREE.Vector3): void {
    (this.u.uSun.value as THREE.Vector3).copy(dir).normalize();
  }

  /** 0 despejado, 1 aguacero: cielo gris, sin sol, nubes cerradas. Devuelve el color del horizonte (para la niebla). */
  storm(k: number): THREE.Color {
    this.u.uStorm.value = k;
    (this.u.uTop.value as THREE.Color).copy(this.base.top).lerp(new THREE.Color('#6d7883'), 0.85 * k);
    (this.u.uHor.value as THREE.Color).copy(this.base.horizon).lerp(new THREE.Color('#9aa3aa'), 0.8 * k);
    (this.u.uGround.value as THREE.Color).copy(this.base.ground).lerp(new THREE.Color('#858c8f'), 0.7 * k);
    return this.u.uHor.value as THREE.Color;
  }

  get horizon(): THREE.Color {
    return this.u.uHor.value as THREE.Color;
  }

  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }
}

// ------------------------------------------------------------------ paso final

export type LookQuality = 'alta' | 'normal' | 'auto';

function urlQuality(): LookQuality {
  try {
    const q = new URLSearchParams(window.location.search).get('calidad');
    return q === 'alta' || q === 'normal' ? q : 'auto';
  } catch {
    return 'auto';
  }
}

function softwareRenderer(r: THREE.WebGLRenderer): boolean {
  try {
    const gl = r.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

/**
 * Oclusión ambiental y suavizado. Si el equipo no da (más de 40 ms por cuadro en promedio al empezar) o el
 * render es por software, se apaga y la escena se dibuja directo, con el suavizado del navegador.
 */
export class Finisher {
  private composer: EffectComposer | null = null;
  private ao: N8AOPass | null = null;
  private smaa: SMAAPass | null = null;
  private times: number[] = [];
  private lastAt = 0;
  private mode: LookQuality;
  on: boolean;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    this.mode = urlQuality();
    this.on = this.mode === 'alta' || (this.mode === 'auto' && !softwareRenderer(renderer) && !!renderer.capabilities.isWebGL2);
    if (this.on) this.build();
  }

  private build(): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, rt);
    this.ao = new N8AOPass(this.scene, this.camera, size.x, size.y);
    const c = this.ao.configuration;
    c.aoRadius = 4;
    c.distanceFalloff = 1;
    c.intensity = 2.6;
    c.gammaCorrection = false;
    c.aoSamples = 12;
    c.denoiseSamples = 6;
    this.ao.autosetGamma = false;
    this.composer.addPass(this.ao);
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
  }

  /** Radio de la oclusión según el tamaño de lo que se mira [unidades del mundo]. */
  setScale(worldWidth: number): void {
    if (this.ao) this.ao.configuration.aoRadius = Math.max(0.6, Math.min(28, worldWidth * 0.022));
  }

  setSize(w: number, h: number): void {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(): void {
    if (this.on && this.composer) {
      const now = performance.now();
      if (this.mode === 'auto' && this.times.length < 40) {
        if (this.lastAt) this.times.push(now - this.lastAt);
        if (this.times.length === 40) {
          const s = [...this.times].sort((a, b) => a - b);
          if (s[20] > 40) this.off();
        }
      }
      this.lastAt = now;
      if (this.on) {
        this.composer.render();
        return;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Vuelve a medir (después de cambiar de escena o si la ventana estuvo oculta). */
  remeasure(): void {
    this.times = [];
    this.lastAt = 0;
  }

  private off(): void {
    this.on = false;
    this.disposePasses();
  }

  private disposePasses(): void {
    this.ao?.dispose?.();
    this.smaa?.dispose?.();
    this.composer?.dispose();
    this.composer = null;
    this.ao = null;
    this.smaa = null;
  }

  dispose(): void {
    this.disposePasses();
  }
}

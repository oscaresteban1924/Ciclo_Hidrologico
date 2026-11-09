// Efectos de tormenta del sector: lluvia, salpicaduras, cortina, cielo y los efectos ligados al cálculo
// (chorros de bajantes, remolinos de sumideros, cascadas de salida y depósitos con nivel).
//
// Qué sale del cálculo y qué es decorativo está documentado en docs/medellin/MODELO.md («Cómo se
// dibujan la lluvia y el agua»). Resumen:
//  · Calculado: dónde llueve y con qué intensidad; profundidad y velocidad del agua (campo por celda);
//    caudal por bajante, captado por sumidero, de salida por cara y llenado/rebose de depósitos.
//  · Decorativo (escalado con lo calculado): posición de cada gota, salpicaduras, cortina, cielo.
// Las gotas caen a ≈9 m/s y las vetas del agua avanzan a la velocidad calculada, en tiempo real:
// la velocidad de simulación (×30) no acelera estos movimientos.

import * as THREE from 'three';
import type { Compiled } from '../sim/compile';
import type { CitySim } from '../sim/engine';
import type { Scenario } from '../sim/scenario';
import { prng } from '../scenarios/primitives';
import { depthColor } from './palette';
import { HAZARD } from '../sim/hazard';
import { FIELD_CHANNELS, drainFlows, flowLevel, outletFlows, packField, spoutFlows, tankFx } from './fxData';

export interface FxHost {
  scene: THREE.Scene;
  w(x: number, y: number, z: number, out?: THREE.Vector3): THREE.Vector3;
  zRef: number;
  W: number;
  H: number;
  c: Compiled;
  sc: Scenario;
  cornerZ: Float32Array;
  blockDepth: number;
  quality: 'alta' | 'ligera';
  reducedMotion: boolean;
  /** Altura del suelo del entorno fuera del sector (mundo); null si no hay entorno. */
  outsideY: ((xw: number, zw: number) => number) | null;
}

/** Uniformes compartidos con los materiales del agua y del terreno. */
export interface FxUniforms {
  uField: { value: THREE.DataTexture | null };
  uRamp: { value: THREE.DataTexture | null };
  /** Rampa natural (agua turbia) y si se usa en la vista realista (1) o la azul (0). */
  uRampN: { value: THREE.DataTexture | null };
  uNat: { value: number };
  uNoise: { value: THREE.DataTexture | null };
  uHalf: { value: THREE.Vector2 };
  uTime: { value: number };
  uFlowT: { value: number };
  uRainAmt: { value: number };
  uRainGeo: { value: THREE.Vector4 };
  uMode: { value: number };
  uWet: { value: number };
  uWetTrail: { value: number };
  uAmp: { value: number };
  /** Lodo de la creciente [0–1] (tiñe el agua honda de la quebrada) y colores de las clases de peligro. */
  uMud: { value: number };
  uHaz: { value: THREE.Color[] };
}

export const FLOW_CYCLE = 1.6; // s: periodo de reinicio de las vetas (técnica de dos fases)

/** Rampa de color de la profundidad: la misma escala de la leyenda, en una textura de 256×1. */
export function depthRampTexture(natural = false): THREE.DataTexture {
  const n = 256;
  const data = new Uint8Array(n * 4);
  const tmp = new Float32Array(4);
  for (let i = 0; i < n; i++) {
    const h = 0.001 * Math.pow(300, i / (n - 1));
    depthColor(h, tmp, 0, natural);
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(tmp[c] * 255);
    // la lámina de pocos milímetros se dibuja más transparente para que se vea el suelo mojado debajo;
    // desde 1 cm la opacidad es la de la leyenda
    const thin = natural ? 1 : 0.5 + 0.5 * Math.min(1, Math.log(h / 0.001) / Math.log(10));
    data[i * 4 + 3] = Math.round(tmp[3] * thin * 255);
  }
  const t = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** Ruido de valor suave y periódico (128×128) para vetas, cortina y chorros. */
export function noiseTexture(): THREE.DataTexture {
  const n = 128;
  const rnd = prng(2024);
  const grid = 16;
  const g = new Float32Array(grid * grid).map(() => rnd());
  const g2 = new Float32Array(32 * 32).map(() => rnd());
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sample = (arr: Float32Array, G: number, x: number, y: number) => {
    const fx = (x / n) * G, fy = (y / n) * G;
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    const ax = smooth(fx - i0), ay = smooth(fy - j0);
    const v = (i: number, j: number) => arr[((j + G) % G) * G + ((i + G) % G)];
    return (v(i0, j0) * (1 - ax) + v(i0 + 1, j0) * ax) * (1 - ay) + (v(i0, j0 + 1) * (1 - ax) + v(i0 + 1, j0 + 1) * ax) * ay;
  };
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 0.65 * sample(g, grid, x, y) + 0.35 * sample(g2, 32, x, y);
    const o = (y * n + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = Math.round(v * 255);
    data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- sombreadores

const RAIN_VS = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uSpeed, uLen, uWidth, uPix, uBaseY, uHeight, uExt;
uniform vec3 uCenter;
uniform vec4 uRainGeo;
varying vec2 vUv;
varying float vA;
void main() {
  float span = 2.0 * uExt;
  vec2 o = uCenter.xz - uExt;
  vec2 xz = mod(aSeed.xy * span - o, span) + o; // anclada al mundo: no se desliza al mover la cámara
  float f = fract(aSeed.z - uTime * uSpeed / uHeight);
  vec3 p = vec3(xz.x, uBaseY + f * uHeight, xz.y);
  float m = 1.0;
  if (uRainGeo.w > 0.5) m = 1.0 - smoothstep(uRainGeo.z - 1.0, uRainGeo.z + 0.5, distance(xz, uRainGeo.xy));
  vec2 rel = abs(xz - uCenter.xz) / uExt;
  m *= 1.0 - smoothstep(0.82, 1.0, max(rel.x, rel.y));
  m *= smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.9, 1.0, f));
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1e-5, 0.0, 1e-5));
  float sz = 0.75 + aSeed.w * 0.5;
  float wWorld = uWidth * sz;
  float wMin = 1.6 * dist * uPix;
  float w = max(wWorld, wMin);
  vA = m * clamp(wWorld / wMin, 0.45, 1.0) * smoothstep(2.0, 4.0, dist);
  vec3 pos = p + side * (position.x * w) + vec3(0.0, position.y * uLen * sz, 0.0);
  vUv = vec2(position.x + 0.5, position.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  if (m < 0.01) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}`;

const RAIN_FS = /* glsl */ `
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;
varying float vA;
void main() {
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float along = pow(1.0 - vUv.y, 1.4);
  float a = uOpacity * vA * across * (0.25 + 0.75 * along);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

const SPLASH_VS = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aSeed;
uniform float uTime, uPix, uSize, uAmp, uDx;
uniform vec4 uRainGeo;
uniform vec2 uHalf;
uniform sampler2D uField;
varying vec2 vUv;
varying float vLife;
varying float vWater;
varying float vSquash;
varying float vPx;
varying float vFar;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float period = 0.55 + aSeed.z * 0.5;
  float cyc = uTime / period + aSeed.y;
  float id = floor(cyc);
  float life = fract(cyc) / 0.34;
  vec2 j = vec2(hash(id * 1.7 + aSeed.x * 31.0), hash(id * 3.1 + aSeed.x * 17.0));
  vec3 p = vec3(aPos.x + (0.15 + 0.7 * j.x) * uDx, aPos.y, aPos.z - (0.15 + 0.7 * j.y) * uDx);
  vec2 fuv = vec2((p.x + uHalf.x) / (2.0 * uHalf.x), (uHalf.y - p.z) / (2.0 * uHalf.y));
  float hs = aSeed.w > 0.5 ? 0.0 : texture2D(uField, fuv).r;
  p.y += hs * uAmp + 0.012;
  float m = 1.0;
  if (uRainGeo.w > 0.5) m = step(distance(p.xz, uRainGeo.xy), uRainGeo.z);
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float s = max(uSize, 6.0 * dist * uPix);
  vFar = 1.0 - 0.85 * smoothstep(30.0, 85.0, dist);
  vec3 pos = p + right * position.x * s + up * position.y * s;
  vUv = position.xy;
  vLife = life;
  vWater = step(0.0015, hs);
  vSquash = clamp(abs(toCam.y / dist), 0.18, 1.0);
  vPx = s / (dist * uPix);
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
  if (life > 1.0 || m < 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}`;

const SPLASH_FS = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
varying float vLife;
varying float vWater;
varying float vSquash;
varying float vPx;
varying float vFar;
void main() {
  float t = vLife;
  float th = max(0.04, 1.4 / vPx);
  vec2 e = vec2(vUv.x, vUv.y / vSquash);
  float r = length(e);
  float a = 0.0;
  if (vWater > 0.5) {
    float R = mix(0.03, 0.46, t);
    a += smoothstep(th, 0.0, abs(r - R)) * (1.0 - t) * 0.95;
    a += smoothstep(th * 0.8, 0.0, abs(r - R * 0.55)) * (1.0 - t) * 0.6;
  } else {
    float R = mix(0.03, 0.26, t);
    a += smoothstep(th, 0.0, abs(r - R)) * (1.0 - t) * 0.55;
    float lift = sqrt(max(0.0, 1.0 - vSquash * vSquash));
    for (int i = 0; i < 6; i++) {
      float ang = float(i) * 1.0472 + 0.4;
      vec2 c = vec2(cos(ang), sin(ang) * vSquash) * (0.3 * t) + vec2(0.0, (1.7 * t - 1.7 * t * t) * 0.42 * lift);
      a += smoothstep(max(0.04, th), max(0.014, th * 0.4), length(vUv - c)) * (1.0 - 0.6 * t);
    }
  }
  a *= uOpacity * vFar;
  if (a < 0.01) discard;
  gl_FragColor = vec4(0.9, 0.95, 1.0, min(a, 1.0));
}`;

const CURTAIN_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const CURTAIN_FS = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime, uOpacity, uCirc, uHgt;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float n = texture2D(uNoise, vec2(vUv.x * uCirc * 0.35, vUv.y * uHgt * 0.012 + uTime * 0.55)).r;
  float n2 = texture2D(uNoise, vec2(vUv.x * uCirc * 0.11 + 0.3, vUv.y * uHgt * 0.004 + uTime * 0.2)).r;
  float a = uOpacity * (0.35 + 0.65 * smoothstep(0.35, 0.8, n)) * (0.55 + 0.45 * n2);
  a *= smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

// Velo de lluvia en pantalla: trazos finos que caen y una bruma tenue arriba (donde queda lo lejano).
// Es solo ambientación; abajo, donde suele estar el sector, apenas se nota, y se apaga al mirar hacia
// abajo, en la vista de resultados y con movimiento reducido.
const WHITE = new THREE.Color('#ffffff');

const VEIL_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const VEIL_FS = /* glsl */ `
uniform float uTime, uOpacity, uHaze, uAspect;
uniform vec3 uColor;
varying vec2 vUv;
float vh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float streaks(vec2 uv, float cols, float speed, float seed) {
  float px = (uv.x + uv.y * 0.07) * uAspect * cols;
  float c = floor(px);
  float r1 = vh(vec2(c, seed)), r2 = vh(vec2(seed, c + 7.0));
  float core = smoothstep(0.1, 0.0, abs(fract(px) - (0.2 + 0.6 * r1)));
  float y = fract(uv.y * (1.1 + r2) + uTime * speed * (0.7 + 0.6 * r2) + r1 * 5.0);
  float seg = smoothstep(0.0, 0.06, y) * smoothstep(0.3, 0.1, y);
  return core * seg * step(0.4, r2);
}
void main() {
  float s = streaks(vUv, 70.0, 1.7, 1.0) * 0.6 + streaks(vUv, 30.0, 1.15, 2.0);
  float a = uOpacity * s * (0.35 + 0.65 * vUv.y) + uHaze * smoothstep(0.3, 1.0, vUv.y);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, min(a, 0.5));
  #include <colorspace_fragment>
}`;

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SKY_FS = /* glsl */ `
uniform vec3 uTop, uHor, uLow;
varying vec3 vDir;
void main() {
  float y = vDir.y;
  vec3 c = y > 0.0 ? mix(uHor, uTop, pow(y, 0.55)) : mix(uHor, uLow, smoothstep(0.0, 0.3, -y));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const VORTEX_VS = /* glsl */ `
attribute float aQ;
varying vec2 vUv;
varying float vQ;
void main() { vUv = uv; vQ = aQ; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`;

const VORTEX_FS = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vQ;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0 || vQ < 0.01) discard;
  float th = atan(p.y, p.x);
  float sp = 3.0 * th + 7.0 * log(max(r, 0.03)) + uTime * (2.5 + 5.0 * vQ);
  float arms = smoothstep(0.15, 0.95, 0.5 + 0.5 * sin(sp));
  float a = vQ * arms * smoothstep(1.0, 0.5, r) * smoothstep(0.05, 0.25, r);
  float core = vQ * smoothstep(0.32, 0.0, r);
  vec3 col = mix(vec3(0.93, 0.97, 1.0), vec3(0.05, 0.16, 0.3), clamp(core * 1.3, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(a * 0.9 + core * 0.75, 0.0, 0.95));
}`;

const JET_VS = /* glsl */ `
attribute vec3 aCenter;
attribute float aQ;
attribute float aS;
varying vec2 vUv;
varying float vQ;
varying float vS;
void main() {
  float sc = 0.35 + 0.65 * aQ;
  vec3 p = aCenter + (position - aCenter) * sc;
  vUv = uv; vQ = aQ; vS = aS;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const JET_FS = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
varying vec2 vUv;
varying float vQ;
varying float vS;
void main() {
  if (vQ < 0.01) discard;
  float n = texture2D(uNoise, vec2(vUv.y * 0.6, vS * 2.2 - uTime * (2.0 + 2.0 * vQ))).r;
  float a = (0.55 + 0.4 * smoothstep(0.35, 0.75, n)) * (0.5 + 0.5 * vQ);
  vec3 col = mix(vec3(0.55, 0.75, 0.92), vec3(0.95, 0.98, 1.0), smoothstep(0.45, 0.8, n));
  gl_FragColor = vec4(col, a);
}`;

const RIPPLE_FS = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vQ;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0 || vQ < 0.01) discard;
  float w = 0.5 + 0.5 * sin(r * 22.0 - uTime * 9.0);
  float a = vQ * smoothstep(1.0, 0.3, r) * (0.25 + 0.75 * smoothstep(0.55, 1.0, w));
  gl_FragColor = vec4(0.93, 0.97, 1.0, a * 0.85);
}`;

const CASCADE_VS = /* glsl */ `
attribute float aQ;
attribute float aT;
varying vec2 vUv;
varying float vQ;
varying float vT;
void main() { vUv = uv; vQ = aQ; vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const CASCADE_FS = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime;
varying vec2 vUv;
varying float vQ;
varying float vT;
void main() {
  if (vQ < 0.01) discard;
  // vetas que se alejan del borde (≈1 m/s) y se desvanecen calle abajo
  float n = texture2D(uNoise, vec2(vUv.x * 1.6, vUv.y * 0.22 - uTime * 0.5)).r;
  float n2 = texture2D(uNoise, vec2(vUv.x * 3.4 + 0.4, vUv.y * 0.5 - uTime * 0.9)).r;
  float body = 0.45 + 0.55 * smoothstep(0.3, 0.75, n * 0.6 + n2 * 0.4);
  float edgeX = smoothstep(0.0, 0.25, fract(vUv.x)) * smoothstep(1.0, 0.75, fract(vUv.x));
  float a = vQ * body * (0.55 + 0.45 * vQ) * (1.0 - smoothstep(0.35, 1.0, vT)) * mix(0.75, 1.0, edgeX);
  vec3 col = mix(vec3(0.24, 0.52, 0.82), vec3(0.92, 0.97, 1.0), smoothstep(0.55, 0.85, n2) * 0.8);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
}`;

// ---------------------------------------------------------------- clase principal

interface RainLayer {
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  mat: THREE.ShaderMaterial;
  n: number;
}

export class StormFx {
  readonly u: FxUniforms;
  private host: FxHost;
  private textures: THREE.Texture[] = [];
  private fieldData = new Float32Array(0);
  private fieldHalf = new Uint16Array(0);
  private field: THREE.DataTexture | null = null;
  private noise: THREE.DataTexture;
  private rainFar: RainLayer;
  private rainNear: RainLayer;
  private splash: RainLayer;
  private curtain: THREE.Mesh;
  private curtainMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private veil: THREE.Mesh;
  private veilMat: THREE.ShaderMaterial;
  private group = new THREE.Group(); // efectos que dependen del sector compilado
  private vortex: THREE.InstancedMesh | null = null;
  private vortexQ: THREE.InstancedBufferAttribute | null = null;
  private jets: THREE.Mesh | null = null;
  private jetQ: THREE.BufferAttribute | null = null;
  private jetOwner = new Int32Array(0);
  private landings: THREE.InstancedMesh | null = null;
  private landingQ: THREE.InstancedBufferAttribute | null = null;
  private cascades: THREE.Mesh | null = null;
  private cascadeQ: THREE.BufferAttribute | null = null;
  private cascadeOwner = new Int32Array(0);
  private tankWater: THREE.Mesh[] = [];
  private spoutQ = new Float64Array(0);
  private drainQ = new Float64Array(0);
  private outQ = new Float64Array(0);
  private storm = 0;
  private tmpDir = new THREE.Vector3();
  private lastFieldT = -1;
  private lastFieldMax = false;
  private lastFieldHaz = false;
  readonly fxTimeMat: THREE.ShaderMaterial[] = [];
  /** Últimos niveles mostrados (para el panel docente y las pruebas en el navegador). */
  readonly levels = { spouts: 0, drains: 0, outlets: 0, tanks: 0, rainDrops: 0, splashes: 0, density: 1 };
  /**
   * Densidad adaptativa de gotas y salpicaduras [0,3–1]: baja sola si el equipo dibuja a menos de
   * ≈22 cuadros/s y vuelve a subir cuando hay margen. Solo afecta efectos decorativos.
   */
  private density = 1;
  private frameMs = 16;
  private lastFrame = 0;
  private adaptT = 0;

  constructor(host: FxHost) {
    this.host = host;
    const ramp = depthRampTexture();
    const rampN = depthRampTexture(true);
    this.noise = noiseTexture();
    this.textures.push(ramp, rampN, this.noise);
    this.u = {
      uField: { value: null },
      uRamp: { value: ramp },
      uRampN: { value: rampN },
      uNat: { value: 1 },
      uNoise: { value: this.noise },
      uHalf: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uFlowT: { value: 0 },
      uRainAmt: { value: 0 },
      uRainGeo: { value: new THREE.Vector4(0, 0, 0, 0) },
      uMode: { value: 0 },
      uWet: { value: 0 },
      uWetTrail: { value: 1 },
      uAmp: { value: 1 },
      uMud: { value: 0 },
      uHaz: { value: HAZARD.map((c) => new THREE.Color(c.color)) },
    };
    const alta = host.quality === 'alta';
    this.rainFar = this.makeRain(alta ? 7000 : 2600, { len: 1.3, width: 0.032 });
    this.rainNear = this.makeRain(alta ? 1400 : 500, { len: 0.5, width: 0.008 });
    this.splash = this.makeSplash(alta ? 2600 : 900);
    // Cortina de lluvia (borde de la tormenta localizada, o velo lejano si la lluvia es uniforme)
    this.curtainMat = new THREE.ShaderMaterial({
      vertexShader: CURTAIN_VS,
      fragmentShader: CURTAIN_FS,
      uniforms: { uNoise: this.u.uNoise, uTime: this.u.uTime, uOpacity: { value: 0 }, uCirc: { value: 100 }, uHgt: { value: 60 }, uColor: { value: new THREE.Color('#c3cdd6') } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.curtain = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true), this.curtainMat);
    this.curtain.visible = false;
    this.curtain.renderOrder = 3;
    this.curtain.frustumCulled = false;
    // Cielo con degradado: se oscurece con la intensidad de la lluvia
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uLow: { value: new THREE.Color() } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.veilMat = new THREE.ShaderMaterial({
      vertexShader: VEIL_VS,
      fragmentShader: VEIL_FS,
      uniforms: { uTime: this.u.uTime, uOpacity: { value: 0 }, uHaze: { value: 0 }, uAspect: { value: 1.6 }, uColor: { value: new THREE.Color('#d3dbe2') } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.veil = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.veilMat);
    this.veil.frustumCulled = false;
    this.veil.renderOrder = 1000;
    this.veil.visible = false;
    host.scene.add(this.sky, this.rainFar.mesh, this.rainNear.mesh, this.splash.mesh, this.curtain, this.group, this.veil);
    this.setSky(0);
  }

  private makeRain(n: number, o: { len: number; width: number }): RainLayer {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const rnd = prng(n * 7 + 3);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = rnd();
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VS,
      fragmentShader: RAIN_FS,
      uniforms: {
        uTime: this.u.uTime,
        uSpeed: { value: 9 },
        uLen: { value: o.len },
        uWidth: { value: o.width },
        uPix: { value: 0.001 },
        uBaseY: { value: -2 },
        uHeight: { value: 50 },
        uExt: { value: 80 },
        uCenter: { value: new THREE.Vector3() },
        uRainGeo: this.u.uRainGeo,
        uOpacity: { value: 0.6 },
        uColor: { value: new THREE.Color('#e3eaf1') },
      },
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 7;
    mesh.visible = false;
    return { mesh, geo, mat, n };
  }

  private makeSplash(n: number): RainLayer {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    const rnd = prng(n + 11);
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      seed[i * 4] = rnd();
      seed[i * 4 + 1] = rnd();
      seed[i * 4 + 2] = rnd();
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: SPLASH_VS,
      fragmentShader: SPLASH_FS,
      uniforms: {
        uTime: this.u.uTime,
        uPix: { value: 0.001 },
        uSize: { value: 0.5 },
        uAmp: this.u.uAmp,
        uDx: { value: 1 },
        uRainGeo: this.u.uRainGeo,
        uHalf: this.u.uHalf,
        uField: this.u.uField,
        uOpacity: { value: 0.8 },
      },
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    mesh.visible = false;
    return { mesh, geo, mat, n };
  }

  // ------------------------------------------------------------ reconstrucción por sector compilado
  rebuild(): void {
    const h = this.host, c = h.c;
    this.u.uHalf.value.set(h.W / 2, h.H / 2);
    // Campo por celda (textura de media precisión, filtrable)
    const N = c.nx * c.ny;
    if (!this.field || this.field.image.width !== c.nx || this.field.image.height !== c.ny) {
      this.field?.dispose();
      this.fieldData = new Float32Array(N * FIELD_CHANNELS);
      this.fieldHalf = new Uint16Array(N * FIELD_CHANNELS);
      const t = new THREE.DataTexture(this.fieldHalf, c.nx, c.ny, THREE.RGBAFormat, THREE.HalfFloatType);
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
      this.field = t;
      this.u.uField.value = t;
    }
    this.lastFieldT = -1;
    // Salpicaduras: puntos sobre techos y suelo (celda de origen y cota)
    const rnd = prng(h.sc.seed + 404);
    const sp = this.splash.geo.getAttribute('aPos') as THREE.InstancedBufferAttribute;
    const seed = this.splash.geo.getAttribute('aSeed') as THREE.InstancedBufferAttribute;
    const v = new THREE.Vector3();
    for (let q = 0; q < this.splash.n; q++) {
      const i = Math.floor(rnd() * c.nx), j = Math.floor(rnd() * c.ny);
      const k = j * c.nx + i;
      const bi = c.building[k];
      const roof = c.solid[k] && bi >= 0;
      const z = roof ? c.buildings[bi].baseZ + h.sc.buildings[bi].heightM : c.z[k];
      h.w(i * c.dx, j * c.dx, z, v);
      sp.setXYZ(q, v.x, v.y, v.z);
      seed.setW(q, roof ? 1 : 0);
    }
    sp.needsUpdate = true;
    seed.needsUpdate = true;
    this.splash.mat.uniforms.uDx.value = c.dx;
    // Volumen de la lluvia sobre el sector
    let top = 0;
    h.sc.buildings.forEach((b, bi) => {
      if (c.buildings[bi]) top = Math.max(top, c.buildings[bi].baseZ + b.heightM - h.zRef);
    });
    const ext = Math.max(h.W, h.H) / 2 + 30;
    const fu = this.rainFar.mat.uniforms;
    fu.uExt.value = ext;
    fu.uBaseY.value = -1.5;
    fu.uHeight.value = Math.max(40, top + 18);
    // Efectos ligados al cálculo
    this.disposeGroup();
    this.buildVortices();
    this.buildJets();
    this.buildCascades();
    this.spoutQ = new Float64Array(c.buildings.length);
    this.drainQ = new Float64Array(c.drains.length);
    this.outQ = new Float64Array(c.outlets.length);
  }

  private disposeGroup(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((q) => q.dispose());
      else mat?.dispose();
    });
    this.group.clear();
    this.vortex = null;
    this.jets = null;
    this.landings = null;
    this.cascades = null;
    this.tankWater = [];
  }

  private cellCenter(k: number): [number, number] {
    const c = this.host.c;
    return [((k % c.nx) + 0.5) * c.dx, (Math.floor(k / c.nx) + 0.5) * c.dx];
  }

  /** Remolinos sobre los sumideros: giran e intensifican con el caudal captado. */
  private buildVortices(): void {
    const c = this.host.c;
    if (!c.drains.length) return;
    const g = new THREE.CircleGeometry(0.8, 40);
    g.rotateX(-Math.PI / 2);
    this.vortexQ = new THREE.InstancedBufferAttribute(new Float32Array(c.drains.length), 1);
    this.vortexQ.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aQ', this.vortexQ);
    const mat = new THREE.ShaderMaterial({ vertexShader: VORTEX_VS, fragmentShader: VORTEX_FS, uniforms: { uTime: this.u.uTime }, transparent: true, depthWrite: false });
    const im = new THREE.InstancedMesh(g, mat, c.drains.length);
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
    c.drains.forEach((d, i) => {
      const [x, y] = this.cellCenter(d.cell);
      this.host.w(x, y, c.z[d.cell] + 0.05, v);
      im.setMatrixAt(i, m4.makeTranslation(v.x, v.y, v.z));
    });
    im.renderOrder = 5;
    im.frustumCulled = false;
    this.vortex = im;
    this.group.add(im);
  }

  /** Bajantes en la pared, chorro al pie (proporcional al caudal del techo) y depósitos con nivel. */
  private buildJets(): void {
    const h = this.host, c = h.c, sc = h.sc;
    const pipePos: number[] = [];
    const pipeIdx: number[] = [];
    const jetPos: number[] = [], jetCen: number[] = [], jetUv: number[] = [], jetS: number[] = [], jetOwner: number[] = [], jetIdx: number[] = [];
    const landing: { at: THREE.Vector3; owner: number }[] = [];
    const nb = c.buildings.length;
    const addPipe = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 6, 1, false);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = b.clone().sub(a).normalize();
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      g.translate(mid.x, mid.y, mid.z);
      const base = pipePos.length / 3;
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) pipePos.push(p.getX(i), p.getY(i), p.getZ(i));
      const ix = g.getIndex()!;
      for (let i = 0; i < ix.count; i++) pipeIdx.push(base + ix.getX(i));
      g.dispose();
    };
    const addJet = (from: THREE.Vector3, dirXZ: THREE.Vector2, v0: number, owner: number, r0: number, drop: number) => {
      const segs = 10, sides = 7;
      const g0 = 9.81;
      const tLand = Math.sqrt((2 * Math.max(0.05, drop)) / g0);
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= segs; s++) {
        const t = (s / segs) * tLand;
        pts.push(new THREE.Vector3(from.x + dirXZ.x * v0 * t, from.y - 0.5 * g0 * t * t, from.z + dirXZ.y * v0 * t));
      }
      const base = jetPos.length / 3;
      for (let s = 0; s <= segs; s++) {
        const p = pts[s];
        const tan = (s < segs ? pts[s + 1].clone().sub(p) : p.clone().sub(pts[s - 1])).normalize();
        const n1 = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0));
        if (n1.lengthSq() < 1e-6) n1.set(1, 0, 0);
        n1.normalize();
        const n2 = new THREE.Vector3().crossVectors(tan, n1).normalize();
        const r = r0 * (1 + 0.5 * (s / segs));
        for (let a = 0; a <= sides; a++) {
          const th = (a / sides) * Math.PI * 2;
          const q = p.clone().addScaledVector(n1, Math.cos(th) * r).addScaledVector(n2, Math.sin(th) * r);
          jetPos.push(q.x, q.y, q.z);
          jetCen.push(p.x, p.y, p.z);
          jetUv.push(s / segs, a / sides);
          jetS.push(s / segs);
          jetOwner.push(owner);
        }
      }
      for (let s = 0; s < segs; s++) for (let a = 0; a < sides; a++) {
        const i0 = base + s * (sides + 1) + a, i1 = i0 + 1, i2 = i0 + sides + 1, i3 = i2 + 1;
        jetIdx.push(i0, i2, i1, i1, i2, i3);
      }
      landing.push({ at: pts[segs].clone(), owner });
    };
    const tankOfBuilding = new Map<number, number>();
    c.tanks.forEach((t) => t.buildings.forEach((bi) => tankOfBuilding.set(bi, t.index)));
    const tankSpot = new Map<number, THREE.Vector3>();
    sc.buildings.forEach((bs, bi) => {
      const cb = c.buildings[bi];
      if (!cb || cb.cells === 0 || cb.downCell < 0) return;
      // punto de la pared más cercano a la bajante declarada
      const [dx0, dy0] = bs.downspout;
      let best: [number, number, number, number] = [dx0, dy0, 1, 0], bd = Infinity;
      for (let e = 0; e < bs.polygon.length; e++) {
        const [ax, ay] = bs.polygon[e], [bx, by] = bs.polygon[(e + 1) % bs.polygon.length];
        const L2 = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = L2 > 0 ? Math.max(0, Math.min(1, ((dx0 - ax) * (bx - ax) + (dy0 - ay) * (by - ay)) / L2)) : 0;
        const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        const d = (px - dx0) ** 2 + (py - dy0) ** 2;
        if (d < bd) {
          bd = d;
          const L = Math.sqrt(L2) || 1;
          best = [px, py, (by - ay) / L, -(bx - ax) / L];
        }
      }
      const [dcx, dcy] = this.cellCenter(cb.downCell);
      let [px, py, nx, ny] = best;
      // la normal debe apuntar hacia la celda de descarga (afuera)
      if ((dcx - px) * nx + (dcy - py) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      px += nx * 0.12;
      py += ny * 0.12;
      const ground = c.z[cb.downCell];
      const roofZ = cb.baseZ + bs.heightM;
      const tk = tankOfBuilding.get(bi);
      const top = h.w(px, py, roofZ + 0.1), foot = h.w(px, py, ground + 0.4);
      if (tk === undefined) {
        addPipe(top, foot, 0.07);
        // chorro desde el codo hacia la celda de descarga
        const dir = new THREE.Vector2(dcx - px, -(dcy - py));
        if (dir.lengthSq() < 1e-6) dir.set(nx, -ny);
        dir.normalize();
        addJet(foot, dir, 1.8, bi, 0.065, 0.38);
      } else if (!tankSpot.has(tk)) {
        // depósito junto a la primera bajante conectada
        const tx = px + nx * 1.0, ty = py + ny * 1.0;
        tankSpot.set(tk, h.w(tx, ty, ground));
        const mid = h.w(px, py, ground + 2.15);
        addPipe(top, mid, 0.07);
        addPipe(mid, h.w(tx, ty, ground + 2.15), 0.07);
      } else {
        addPipe(top, foot, 0.07);
      }
    });
    // Depósitos: casco translúcido y agua con el nivel calculado; rebose desde el borde superior
    c.tanks.forEach((t) => {
      const at = tankSpot.get(t.index);
      if (!at) return;
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.9, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#dfe8ee', transparent: true, opacity: 0.35, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false }));
      shell.position.set(at.x, at.y + 0.95, at.z);
      shell.renderOrder = 3;
      const lid = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 28), new THREE.MeshStandardMaterial({ color: '#7d8a94', roughness: 0.5 }));
      lid.rotation.x = Math.PI / 2;
      lid.position.set(at.x, at.y + 1.9, at.z);
      const wg = new THREE.CylinderGeometry(0.8, 0.8, 1, 28);
      wg.translate(0, 0.5, 0);
      const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: '#2a78c4', transparent: true, opacity: 0.85, roughness: 0.15 }));
      water.position.set(at.x, at.y + 0.02, at.z);
      water.scale.y = 0.001;
      water.renderOrder = 2;
      this.tankWater[t.index] = water;
      this.group.add(shell, lid, water);
      const [ox, oy] = this.cellCenter(t.overflowCell);
      const dir = new THREE.Vector2(ox - (at.x + h.W / 2), -(oy - (h.H / 2 - at.z)));
      if (dir.lengthSq() < 1e-6) dir.set(1, 0);
      dir.normalize();
      addJet(new THREE.Vector3(at.x + dir.x * 0.86, at.y + 1.85, at.z + dir.y * 0.86), dir, 0.9, nb + t.index, 0.06, 1.83);
    });
    if (pipePos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pipePos, 3));
      g.setIndex(pipeIdx);
      g.computeVertexNormals();
      const pipes = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.6, metalness: 0.3 }));
      pipes.castShadow = true;
      pipes.userData.cutHide = true; // bajantes de las fachadas: estorban en la vista bajo la calle
      this.group.add(pipes);
    }
    if (jetPos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(jetPos, 3));
      g.setAttribute('aCenter', new THREE.Float32BufferAttribute(jetCen, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(jetUv, 2));
      g.setAttribute('aS', new THREE.Float32BufferAttribute(jetS, 1));
      this.jetQ = new THREE.Float32BufferAttribute(new Float32Array(jetOwner.length), 1);
      this.jetQ.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aQ', this.jetQ);
      g.setIndex(jetIdx);
      this.jetOwner = Int32Array.from(jetOwner);
      const mat = new THREE.ShaderMaterial({ vertexShader: JET_VS, fragmentShader: JET_FS, uniforms: { uNoise: this.u.uNoise, uTime: this.u.uTime }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      this.jets = new THREE.Mesh(g, mat);
      this.jets.renderOrder = 5;
      this.jets.frustumCulled = false;
      this.jets.userData.cutHide = true;
      this.group.add(this.jets);
      // espuma donde cae el chorro
      const lg = new THREE.CircleGeometry(0.55, 28);
      lg.rotateX(-Math.PI / 2);
      this.landingQ = new THREE.InstancedBufferAttribute(new Float32Array(landing.length), 1);
      this.landingQ.setUsage(THREE.DynamicDrawUsage);
      lg.setAttribute('aQ', this.landingQ);
      const lm = new THREE.ShaderMaterial({ vertexShader: VORTEX_VS, fragmentShader: RIPPLE_FS, uniforms: { uTime: this.u.uTime }, transparent: true, depthWrite: false });
      const im = new THREE.InstancedMesh(lg, lm, landing.length);
      const m4 = new THREE.Matrix4();
      landing.forEach((l, i) => im.setMatrixAt(i, m4.makeTranslation(l.at.x, l.at.y + 0.02, l.at.z)));
      im.userData.owner = Int32Array.from(landing.map((l) => l.owner));
      im.renderOrder = 5;
      im.frustumCulled = false;
      im.userData.cutHide = true;
      this.landings = im;
      this.group.add(im);
    }
    this.applyCut();
  }

  private cutMode = false;
  /** En la vista bajo la calle se ocultan las bajantes y sus chorros (no son parte de las redes). */
  setCut(on: boolean): void {
    this.cutMode = on;
    this.applyCut();
  }
  private applyCut(): void {
    for (const o of this.group.children) if (o.userData.cutHide) o.visible = !this.cutMode;
  }

  /**
   * Escurrimiento de salida: en cada cara de salida del borde, una lámina que sigue por la calle vecina
   * (la franja de unión del entorno) y se desvanece. Su intensidad es el caudal que el balance cuenta
   * como «salió del sector». Es solo dibujo: más allá del borde no se calcula nada.
   */
  private buildCascades(): void {
    const h = this.host, c = h.c;
    if (!c.outlets.length) return;
    const pos: number[] = [], uv: number[] = [], tt: number[] = [], owner: number[] = [], idx: number[] = [];
    const cz = h.cornerZ;
    const RUN = 7, SEG = 6; // largo [m] y tramos de la lámina
    const tmp = new THREE.Vector3();
    c.outlets.forEach((o, oi) => {
      const k = o.cell;
      const i = k % c.nx, j = Math.floor(k / c.nx);
      let a: [number, number], b: [number, number], qa: number, qb: number, nx = 0, ny = 0;
      if (o.axis === 'x') {
        const fi = o.face % (c.nx + 1);
        if (fi !== 0 && fi !== c.nx) return;
        const x = fi * c.dx;
        a = [x, j * c.dx];
        b = [x, (j + 1) * c.dx];
        [qa, qb] = fi === 0 ? [0, 3] : [1, 2];
        nx = fi === 0 ? -1 : 1;
      } else {
        const fj = Math.floor(o.face / c.nx);
        if (fj !== 0 && fj !== c.ny) return;
        const y = fj * c.dx;
        a = [i * c.dx, y];
        b = [(i + 1) * c.dx, y];
        [qa, qb] = fj === 0 ? [0, 1] : [3, 2];
        ny = fj === 0 ? -1 : 1;
      }
      const za = cz[k * 4 + qa], zb = cz[k * 4 + qb];
      const base = pos.length / 3;
      const u0 = (o.axis === 'x' ? j : i) * c.dx, u1 = u0 + c.dx;
      for (let sgi = 0; sgi <= SEG; sgi++) {
        const d = (sgi / SEG) * RUN;
        const spread = 1 + 0.35 * (sgi / SEG); // la lámina se abre un poco al salir
        for (const [p, zEdge, side] of [[a, za, -1], [b, zb, 1]] as const) {
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          const px = mx + (p[0] - mx) * spread + nx * d, py = my + (p[1] - my) * spread + ny * d;
          h.w(px, py, 0, tmp);
          const yOut = h.outsideY ? h.outsideY(tmp.x, tmp.z) : zEdge - h.zRef;
          const y = (sgi === 0 ? zEdge - h.zRef : yOut) + 0.05;
          pos.push(tmp.x, y, tmp.z);
          uv.push(side < 0 ? u0 : u1, d);
          tt.push(sgi / SEG);
          owner.push(oi);
        }
        if (sgi > 0) {
          const q = base + (sgi - 1) * 2;
          idx.push(q, q + 1, q + 3, q, q + 3, q + 2);
        }
      }
    });
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
    this.cascadeQ = new THREE.Float32BufferAttribute(new Float32Array(owner.length), 1);
    this.cascadeQ.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aQ', this.cascadeQ);
    g.setIndex(idx);
    this.cascadeOwner = Int32Array.from(owner);
    const mat = new THREE.ShaderMaterial({ vertexShader: CASCADE_VS, fragmentShader: CASCADE_FS, uniforms: { uNoise: this.u.uNoise, uTime: this.u.uTime }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.cascades = new THREE.Mesh(g, mat);
    this.cascades.renderOrder = 4;
    this.cascades.frustumCulled = false;
    this.group.add(this.cascades);
  }

  // ------------------------------------------------------------ actualización
  private setSky(s: number): void {
    const lerp = (a: string, b: string, out: THREE.Color) => out.set(a).lerp(new THREE.Color(b), s);
    lerp('#8fbbe0', '#4b5662', this.skyMat.uniforms.uTop.value);
    lerp('#d3e3ef', '#9aa5ae', this.skyMat.uniforms.uHor.value);
    lerp('#b9c7d1', '#6f7a83', this.skyMat.uniforms.uLow.value);
  }

  /** Oculta lluvia y efectos pasajeros mientras se captura el entorno para los reflejos (queda el cielo). */
  setCaptureMode(on: boolean): void {
    for (const o of [this.rainFar.mesh, this.rainNear.mesh, this.splash.mesh, this.curtain, this.group, this.veil]) {
      if (on) {
        o.userData.capVis = o.visible;
        o.visible = false;
      } else if (o.userData.capVis !== undefined) {
        o.visible = o.userData.capVis;
        delete o.userData.capVis;
      }
    }
  }

  /** Color del horizonte (para la niebla y el fondo de reserva). */
  horizon(out: THREE.Color): THREE.Color {
    return out.copy(this.skyMat.uniforms.uHor.value);
  }

  /** Nivel de tormenta suavizado [0–1] (para luces y materiales). */
  get stormLevel(): number {
    return this.storm;
  }

  updateField(sim: CitySim, useMax: boolean, hazard = false): void {
    if (!this.field || (sim.t === this.lastFieldT && useMax === this.lastFieldMax && hazard === this.lastFieldHaz)) return;
    packField(sim, useMax, this.fieldData, hazard);
    this.lastFieldHaz = hazard;
    const f = this.fieldData, hf = this.fieldHalf;
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let i = 0; i < f.length; i++) hf[i] = toHalf(f[i]);
    this.field.needsUpdate = true;
    this.lastFieldT = sim.t;
    this.lastFieldMax = useMax;
  }

  /**
   * @param opts.mmh intensidad de lluvia que el controlador aplica ahora (0 si no corre la simulación)
   * @param opts.flowing hay agua en movimiento (simulación iniciada y no terminada)
   */
  update(sim: CitySim, camera: THREE.PerspectiveCamera, viewportH: number, dt: number, opts: { mmh: number; flowing: boolean; view: number; amplify: number }): void {
    const h = this.host;
    const mmh = opts.mmh;
    this.adapt();
    const raining = mmh > 0;
    const anim = h.reducedMotion ? 0 : dt;
    this.u.uTime.value += anim;
    this.u.uFlowT.value = (this.u.uFlowT.value + anim / FLOW_CYCLE) % 1;
    this.u.uMode.value = opts.view;
    this.u.uAmp.value = opts.amplify;
    // nivel de tormenta suavizado (cielo, luces, mojado)
    const target = raining ? Math.min(1, 0.35 + mmh / 110) : 0;
    this.storm += (target - this.storm) * Math.min(1, dt * 1.2 + (h.reducedMotion ? 1 : 0));
    this.setSky(this.storm);
    this.sky.position.copy(camera.position);
    // dónde llueve (misma regla que el motor)
    const r = sim.shared.rain;
    const geo = this.u.uRainGeo.value;
    if (r.spatial === 'localizada') geo.set(r.center[0] - h.W / 2, h.H / 2 - r.center[1], r.radiusM, 1);
    else geo.set(0, 0, 0, 0);
    this.u.uRainAmt.value += ((raining && !h.reducedMotion ? Math.min(1, 0.35 + mmh / 100) : 0) - this.u.uRainAmt.value) * Math.min(1, dt * 2);
    const wetTarget = raining ? Math.min(1, 0.4 + mmh / 80) : sim.t > 0 ? 0.3 : 0;
    this.u.uWet.value += (wetTarget - this.u.uWet.value) * Math.min(1, dt * 1.5 + (h.reducedMotion ? 1 : 0));
    // gotas
    const pix = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, viewportH);
    const dens = raining ? Math.min(1, 0.12 + mmh / 110) : 0;
    const op = raining ? 0.5 + Math.min(0.4, mmh / 200) : 0;
    const groundY = 0;
    const camAbove = camera.position.y - groundY;
    const far = this.rainFar, near = this.rainNear;
    far.mesh.visible = raining && opts.view < 2;
    far.geo.instanceCount = Math.round(far.n * dens * this.density);
    far.mat.uniforms.uPix.value = pix;
    far.mat.uniforms.uOpacity.value = op * (h.reducedMotion ? 0.6 : 1);
    near.mesh.visible = raining && opts.view < 2 && camAbove < 45;
    near.geo.instanceCount = Math.round(near.n * dens * this.density);
    near.mat.uniforms.uPix.value = pix;
    near.mat.uniforms.uOpacity.value = op * 0.9 * (1 - THREE.MathUtils.smoothstep(camAbove, 14, 45)) * (h.reducedMotion ? 0.6 : 1);
    near.mat.uniforms.uCenter.value.set(camera.position.x, 0, camera.position.z);
    near.mat.uniforms.uExt.value = 10;
    near.mat.uniforms.uBaseY.value = camera.position.y - 7;
    near.mat.uniforms.uHeight.value = 14;
    this.levels.rainDrops = far.mesh.visible ? far.geo.instanceCount : 0;
    // salpicaduras (no con movimiento reducido: serían destellos fijos)
    const sp = this.splash;
    sp.mesh.visible = raining && !h.reducedMotion && opts.view === 0 && this.density >= 0.5;
    sp.geo.instanceCount = Math.round(sp.n * dens * this.density);
    sp.mat.uniforms.uPix.value = pix;
    sp.mat.uniforms.uOpacity.value = 0.55 + Math.min(0.35, mmh / 250);
    this.levels.splashes = sp.mesh.visible ? sp.geo.instanceCount : 0;
    // cortina
    const cur = this.curtain;
    // solo con lluvia localizada: marca el borde de la tormenta (con lluvia uniforme la bruma la da la niebla)
    cur.visible = this.storm > 0.02 && opts.view !== 2 && r.spatial === 'localizada';
    if (cur.visible) {
      const R = r.spatial === 'localizada' ? r.radiusM : Math.max(h.W, h.H) * 0.5 + 210;
      const Hc = r.spatial === 'localizada' ? 60 : 460;
      cur.scale.set(R, Hc, R);
      cur.position.set(geo.w > 0.5 ? geo.x : 0, Hc / 2 - 3, geo.w > 0.5 ? geo.y : 0);
      this.curtainMat.uniforms.uCirc.value = 2 * Math.PI * R;
      this.curtainMat.uniforms.uHgt.value = Hc;
      this.curtainMat.uniforms.uOpacity.value = (r.spatial === 'localizada' ? 0.32 : 0.42) * this.storm;
    }
    // velo en pantalla: más denso con la tormenta, nulo al mirar hacia abajo (la vista cenital lee el agua)
    const look = camera.getWorldDirection(this.tmpDir).y;
    const vk = raining && !h.reducedMotion && opts.view === 0 ? this.storm * (1 - THREE.MathUtils.smoothstep(-look, 0.5, 0.85)) : 0;
    this.veil.visible = vk > 0.01;
    this.veilMat.uniforms.uOpacity.value = 0.12 * vk;
    this.veilMat.uniforms.uHaze.value = 0.1 * vk;
    this.veilMat.uniforms.uAspect.value = camera.aspect;
    this.horizon(this.veilMat.uniforms.uColor.value).lerp(WHITE, 0.25);
    // efectos ligados al cálculo
    this.updateLinked(sim, opts.flowing);
  }

  /** Mide el tiempo real entre cuadros y ajusta la densidad de los efectos decorativos. */
  private adapt(): void {
    const now = performance.now();
    if (this.lastFrame > 0) {
      const ms = Math.min(1000, now - this.lastFrame);
      this.frameMs += (ms - this.frameMs) * 0.08;
      this.adaptT += ms;
      if (this.adaptT > 1500) {
        this.adaptT = 0;
        if (this.frameMs > 100 && this.density > 0.3) this.density = Math.max(0.3, this.density * 0.5);
        else if (this.frameMs > 45 && this.density > 0.3) this.density = Math.max(0.3, this.density * 0.7);
        else if (this.frameMs < 24 && this.density < 1) this.density = Math.min(1, this.density * 1.15);
      }
    }
    this.lastFrame = now;
    this.levels.density = this.density;
  }

  private updateLinked(sim: CitySim, running: boolean): void {
    const c = this.host.c;
    // sumideros
    if (this.vortex && this.vortexQ) {
      drainFlows(sim, this.drainQ);
      let on = 0;
      for (let d = 0; d < this.drainQ.length; d++) {
        const lv = running ? flowLevel(this.drainQ[d], 0.0002, 0.03) : 0;
        this.vortexQ.setX(d, lv);
        if (lv > 0) on++;
      }
      this.vortexQ.needsUpdate = true;
      this.levels.drains = on;
    }
    // bajantes y depósitos
    if (this.jets && this.jetQ) {
      spoutFlows(sim, this.spoutQ);
      const tanks = tankFx(sim);
      const nb = c.buildings.length;
      const lvOf = (owner: number) => {
        if (!running) return 0;
        if (owner < nb) return flowLevel(this.spoutQ[owner], 0.00005, 0.012);
        const t = tanks[owner - nb];
        return t ? flowLevel(t.overflow, 0.00005, 0.012) : 0;
      };
      const cache = new Map<number, number>();
      const lv = (o: number) => {
        let v = cache.get(o);
        if (v === undefined) {
          v = lvOf(o);
          cache.set(o, v);
        }
        return v;
      };
      for (let i = 0; i < this.jetOwner.length; i++) this.jetQ.setX(i, lv(this.jetOwner[i]));
      this.jetQ.needsUpdate = true;
      if (this.landings && this.landingQ) {
        const own = this.landings.userData.owner as Int32Array;
        for (let i = 0; i < own.length; i++) this.landingQ.setX(i, lv(own[i]));
        this.landingQ.needsUpdate = true;
      }
      let on = 0;
      cache.forEach((v) => {
        if (v > 0) on++;
      });
      this.levels.spouts = on;
      tanks.forEach((t, i) => {
        const w = this.tankWater[i];
        if (w) w.scale.y = Math.max(0.001, t.fill * 1.86);
      });
      this.levels.tanks = tanks.length;
    }
    // salidas
    if (this.cascades && this.cascadeQ) {
      outletFlows(sim, this.outQ);
      let on = 0;
      const seen = new Set<number>();
      for (let i = 0; i < this.cascadeOwner.length; i++) {
        const o = this.cascadeOwner[i];
        const v = flowLevel(this.outQ[o], 0.00003, 0.01);
        this.cascadeQ.setX(i, v);
        if (v > 0 && !seen.has(o)) {
          seen.add(o);
          on++;
        }
      }
      this.cascadeQ.needsUpdate = true;
      this.levels.outlets = on;
    }
  }

  dispose(): void {
    this.textures.forEach((t) => t.dispose());
    this.field?.dispose();
  }
}

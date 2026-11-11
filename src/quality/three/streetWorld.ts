// La cuadra en 3D: veinte casas de barrio pegadas (ladrillo a la vista o frente pintado, ventanas con reja, balcones,
// azoteas con tanque o techos de teja), la calle con su cuneta, el bordillo y el sumidero, y debajo, en un corte con
// vidrio al frente, los dos tubos: el de aguas lluvias (va a la quebrada sin tratar) y el de aguas residuales (va a la
// planta de tratamiento), con sus pozos de inspección, las cajas de inspección de cada casa y la cama de grava. Cuando
// llueve, el agua lava la calle (Sartor y Boyd) y lleva la mugre y la basura al sumidero y a la quebrada, donde la
// descarga deja una pluma que se diluye aguas abajo. Con la prueba del colorante se descubren las casas que tienen el
// desagüe conectado por error al tubo de aguas lluvias. Es una cuadra ilustrativa: no es el levantamiento de una
// calle de Medellín.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { facadeAtlas, type FacadeAtlas, type TileId } from '../../city/render/textures';
import type { StreetInput } from '../model';
import { STREET, buildup, washoff } from '../model';
import { concreteMaterial, houses, noise2, rng, trees, waterMaterial, WALLS, type HouseSpot, type TreeSpot } from './kit';
import type { QStage, StageLabel, StageView } from './stage';

const N = STREET.houses;
const HX = (i: number) => -42 + i * 4.42;
const DRAIN_X = 40;
const STORM = { z: 5.7, y: -1.9, r: 0.45 };
const SEWER = { z: 1.6, y: -3.7, r: 0.42 };
const CREEK_X = 60;
/** Nivel del agua de la quebrada. */
const CREEK_Y = -7;
const LOW = -6.6;
/** Frente de la cuadra (donde va el vidrio del corte) y fondo. */
const FRONT = 7.5;
const BACK = -15;
const HOUSE = { z0: -14.75, z1: -6.25, w: 4.42, floor: 2.8 };
/** Tubo de aguas lluvias: bajo la calle, enterrado por la ladera y hasta el cabezote de descarga en la quebrada. */
const STORM_PTS: [number, number][] = [
  [-47, STORM.y],
  [46, STORM.y],
  [50, -2.95],
  [52, -4.25],
  [53.6, -5.6],
  [55.6, -6.3],
];
const SEWER_PTS: [number, number, number][] = [
  [-47, SEWER.y, SEWER.z],
  [46.5, SEWER.y, SEWER.z],
  [48.5, SEWER.y, SEWER.z - 4],
  [49.5, SEWER.y, -40],
];
/** Pozos de inspección (entre los desagües de las casas para no taparlos). */
const SEWER_MH = [-27.13, -0.61, 25.9];
const STORM_MH = [-13.87, 12.65];

/**
 * Suelo dibujado: la cuadra es un bloque (como una maqueta) con la tierra en corte al frente; delante y a la
 * derecha el terreno está más bajo, y la quebrada corre encajonada al pie de la ladera.
 */
function groundAt(x: number, z: number): number {
  let y: number;
  if (x < 47) y = z < BACK ? 0 : LOW;
  else y = Math.max(LOW, z < 7.6 ? -(x - 47) * 0.75 : LOW);
  if (x > CREEK_X + 4) y = Math.min(0, LOW + (x - CREEK_X - 4) * 0.45);
  // cauce: lecho bajo el agua y orillas empinadas
  const dc = Math.abs(x - CREEK_X);
  const bed = dc < 3.5 ? CREEK_Y - 0.8 + 0.5 * (dc / 3.5) ** 2 : CREEK_Y - 0.3 + (dc - 3.5) * 1.2;
  return Math.min(y, bed);
}

/** Casas con conexión errada: las primeras k de un orden fijo (el mismo en cada visita). */
export function wrongSet(k: number): Set<number> {
  const R = rng(2024);
  const order = [...Array(N).keys()];
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return new Set(order.slice(0, Math.max(0, Math.min(N, k))));
}

export interface StreetView {
  inp: StreetInput;
  wash: ReturnType<typeof washoff>;
  wrong: Set<number>;
  tested: Map<number, boolean>;
  picked: number | null;
}

interface Flow {
  path: THREE.Vector3[];
  len: number[];
  total: number;
  t0: number;
  dur: number;
  wrong: boolean;
  house: number;
}

// ---------------------------------------------------------------------------------------- materiales

const NOISE = `
float qh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float qn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(qh(i), qh(i + vec2(1, 0)), u.x), mix(qh(i + vec2(0, 1)), qh(i + vec2(1, 1)), u.x), u.y); }`;

/**
 * Material estándar con un sombreado propio en coordenadas del mundo (vQW, vQN): asfalto, andén, ladrillo, teja,
 * estratos del suelo y tubos. Cada sombreado tiene su clave de programa (three.js compartiría el programa si solo
 * se comparara la función onBeforeCompile).
 */
function shaded(params: THREE.MeshStandardMaterialParameters, o: { key: string; uniforms?: Record<string, THREE.IUniform>; decl?: string; color: string; rough?: string; uv?: boolean }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, o.uniforms ?? {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vQW;\nvarying vec3 vQN;${o.uv ? '\nvarying vec2 vQU;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvQW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvQN = normalize(mat3(modelMatrix) * objectNormal);${o.uv ? '\nvQU = uv;' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vQW;\nvarying vec3 vQN;${o.uv ? '\nvarying vec2 vQU;' : ''}\n${o.decl ?? ''}\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${o.color}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${o.rough ?? ''}`);
  };
  m.customProgramCacheKey = () => `street-${o.key}`;
  return m;
}

/** Asfalto con grano, parches y charcos que brillan cuando está mojado. */
function asphaltMaterial(wet: THREE.IUniform): THREE.MeshStandardMaterial {
  return shaded(
    { color: '#4b4e52', roughness: 0.9 },
    {
      key: 'asfalto',
      uniforms: { uWet: wet },
      decl: 'uniform float uWet;',
      color: `vec2 q = vQW.xz;
        float n = qn(q * 0.55) * 0.6 + qn(q * 2.6) * 0.4;
        float sp = qh(floor(q * 16.0));
        float pat = smoothstep(0.72, 0.76, qn(q * 0.18 + 11.0));
        diffuseColor.rgb *= 0.84 + 0.2 * n + 0.1 * step(0.94, sp) - 0.08 * pat;
        float puddle = smoothstep(0.6, 0.7, qn(q * 0.32 + 3.1)) * smoothstep(0.4, 0.9, uWet);
        diffuseColor.rgb *= mix(1.0, 0.6, uWet);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.23, 0.26), puddle * 0.5);`,
      rough: 'roughnessFactor = mix(mix(roughnessFactor, 0.32, uWet), 0.05, puddle);',
    },
  );
}

/** Andén de losetas de concreto (cuadrícula de 0,5 m) con color por loseta. */
function sidewalkMaterial(wet: THREE.IUniform): THREE.MeshStandardMaterial {
  return shaded(
    { color: '#d2cdc2', roughness: 0.88 },
    {
      key: 'anden',
      uniforms: { uWet: wet },
      decl: 'uniform float uWet;',
      color: `vec2 q = vQW.xz / 0.5;
        vec2 f = fract(q);
        float joint = step(0.5, abs(vQN.y)) * (1.0 - step(0.05, f.x) * step(f.x, 0.95) * step(0.05, f.y) * step(f.y, 0.95));
        float tile = qh(floor(q));
        diffuseColor.rgb *= 0.9 + 0.12 * tile + 0.06 * qn(vQW.xz * 3.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.43, 0.4), joint * 0.6);
        diffuseColor.rgb *= mix(1.0, 0.72, uWet);`,
      rough: 'roughnessFactor = mix(roughnessFactor, 0.45, uWet);',
    },
  );
}

/** Ladrillo a la vista (aparejo trabado) para culatas, cuartos útiles y gabletes. */
function brickMaterial(wet: THREE.IUniform): THREE.MeshStandardMaterial {
  return shaded(
    { color: '#ffffff', roughness: 0.92 },
    {
      key: 'ladrillo',
      uniforms: { uWet: wet },
      decl: 'uniform float uWet;',
      color: `vec2 q = abs(vQN.x) > 0.5 ? vQW.zy : (abs(vQN.z) > 0.5 ? vQW.xy : vQW.xz);
        float course = floor(q.y / 0.2);
        float off = mod(course, 2.0) * 0.2;
        float bi = floor((q.x + off) / 0.4);
        float bx = fract((q.x + off) / 0.4), by = fract(q.y / 0.2);
        float mortar = max(step(bx, 0.05), step(by, 0.1));
        vec3 brick = vec3(0.62, 0.27, 0.16) * (0.82 + 0.3 * qh(vec2(bi, course)));
        diffuseColor.rgb = mix(brick, vec3(0.62, 0.58, 0.52), mortar);
        diffuseColor.rgb *= mix(1.0, 0.72, uWet);`,
    },
  );
}

/** Teja de barro (o lámina ondulada si el color de vértice es gris). */
function roofTileMaterial(): THREE.MeshStandardMaterial {
  return shaded(
    { color: '#ffffff', roughness: 0.82, vertexColors: true, flatShading: false },
    {
      key: 'teja',
      color: `float wave = 0.5 + 0.5 * sin(vQW.x * 34.0);
        float course = smoothstep(0.82, 1.0, fract(vQW.y / 0.28));
        diffuseColor.rgb *= 0.78 + 0.26 * wave - 0.18 * course + 0.08 * qn(vQW.xz * 1.3);`,
    },
  );
}

/** Estratos del suelo en el corte: relleno, capa orgánica, arcilla y saprolito con cantos. */
function strataMaterial(opts: { opacity?: number } = {}): THREE.MeshStandardMaterial {
  const tr = (opts.opacity ?? 1) < 1;
  return shaded(
    { color: '#ffffff', roughness: 1, side: THREE.DoubleSide, transparent: tr, opacity: opts.opacity ?? 1, depthWrite: !tr },
    {
      key: tr ? 'estratos-vidrio' : 'estratos',
      color: `float s = abs(vQN.x) > 0.5 ? vQW.z : vQW.x;
        float y = vQW.y;
        float w1 = (qn(vec2(s * 0.22, 1.0)) - 0.5) * 0.7, w2 = (qn(vec2(s * 0.17, 5.0)) - 0.5) * 0.9;
        vec3 c = vec3(0.49, 0.45, 0.4);
        c = mix(c, vec3(0.36, 0.26, 0.17), step(y, -0.55));
        c = mix(c, vec3(0.6, 0.37, 0.2), step(y, -2.1 + w1));
        c = mix(c, vec3(0.72, 0.55, 0.33), step(y, -4.3 + w2));
        float edge = (1.0 - smoothstep(0.0, 0.06, abs(y + 2.1 - w1))) + (1.0 - smoothstep(0.0, 0.06, abs(y + 4.3 - w2)));
        vec2 g = vec2(s, y) * 3.2;
        float pebble = step(0.86, qh(floor(g))) * step(length(fract(g) - 0.5), 0.32) * step(y, -2.1 + w1);
        c *= 0.88 + 0.2 * qn(vec2(s, y) * 1.7);
        c = mix(c, vec3(0.86, 0.82, 0.74), pebble * 0.7);
        c *= 1.0 - 0.25 * edge;
        diffuseColor.rgb = c;`,
    },
  );
}

/** Grava de la cama de los tubos y de la base granular del pavimento. */
function gravelMaterial(): THREE.MeshStandardMaterial {
  return shaded(
    { color: '#ffffff', roughness: 1 },
    {
      key: 'grava',
      color: `vec2 q = abs(vQN.x) > 0.5 ? vQW.zy : (abs(vQN.z) > 0.5 ? vQW.xy : vQW.xz);
        vec2 g = q * 9.0;
        float st = qh(floor(g));
        float r = length(fract(g) - 0.5);
        diffuseColor.rgb = mix(vec3(0.42, 0.4, 0.37), vec3(0.66 + 0.2 * st, 0.63 + 0.18 * st, 0.58 + 0.15 * st), step(r, 0.42));`,
    },
  );
}

/** Tubo con anillos de unión y flechas que avanzan con el agua (uFlow: 0 quieto, 1 corriendo). */
function pipeMaterial(color: string, len: number, flow: THREE.IUniform, time: THREE.IUniform): THREE.MeshStandardMaterial {
  return shaded(
    { color, roughness: 0.42, metalness: 0.05 },
    {
      key: 'tubo',
      uv: true,
      uniforms: { uFlow: flow, uTime: time, uLen: { value: len } },
      decl: 'uniform float uFlow, uTime, uLen;',
      color: `float a = vQU.x * uLen;
        float joint = smoothstep(0.88, 0.94, fract(a / 4.6)) * (1.0 - smoothstep(0.96, 1.0, fract(a / 4.6)));
        float chev = fract((a - uTime * 2.2) / 1.6 - abs(vQU.y - 0.5) * 0.8);
        float arrow = smoothstep(0.0, 0.04, chev) * (1.0 - smoothstep(0.08, 0.13, chev)) * uFlow;
        diffuseColor.rgb *= 1.0 - 0.32 * joint;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.97, 0.98), arrow * 0.4);`,
    },
  );
}

// ---------------------------------------------------------------------------------------- geometría

/** Deja una geometría lista para fundirse con otras: sin índice, con o sin uv y con color por vértice. */
function prep(g: THREE.BufferGeometry, o: { uv?: boolean; color?: THREE.Color } = {}): THREE.BufferGeometry {
  const q = g.index ? g.toNonIndexed() : g;
  if (!o.uv) q.deleteAttribute('uv');
  if (o.color) {
    const n = q.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) a.set([o.color.r, o.color.g, o.color.b], k * 3);
    q.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return q;
}

function box(sx: number, sy: number, sz: number, x: number, y: number, z: number, color?: THREE.Color, rotY = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return prep(g, { color });
}

function cyl(r: number, h: number, x: number, y: number, z: number, color?: THREE.Color, seg = 12, axis: 'y' | 'x' | 'z' = 'y'): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return prep(g, { color });
}

/** Rectángulo vertical u horizontal con su rectángulo del atlas. */
function quad(w: number, h: number, at: THREE.Vector3, face: '+z' | '-z' | '+x' | '-x' | '+y', uv: [number, number, number, number] | null, color?: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  if (uv) {
    const a = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < a.count; k++) a.setXY(k, uv[0] + a.getX(k) * (uv[2] - uv[0]), uv[1] + a.getY(k) * (uv[3] - uv[1]));
  }
  if (face === '-z') g.rotateY(Math.PI);
  if (face === '+x') g.rotateY(Math.PI / 2);
  if (face === '-x') g.rotateY(-Math.PI / 2);
  if (face === '+y') g.rotateX(-Math.PI / 2);
  g.translate(at.x, at.y, at.z);
  return prep(g, { uv: !!uv, color });
}

function merged(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list, false);
  for (const q of list) q.dispose();
  return g ?? new THREE.BufferGeometry();
}

let ATLAS: FacadeAtlas | null = null;

/** Fachadas de barrio: el atlas trae los módulos y la máscara dice qué parte es muro (se tiñe con el color). */
function facadeMaterial(wet: THREE.IUniform, lit: THREE.IUniform): THREE.MeshStandardMaterial {
  ATLAS ??= facadeAtlas();
  const atlas = ATLAS;
  const m = new THREE.MeshStandardMaterial({ map: atlas.map, vertexColors: true, roughness: 0.86 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: atlas.mask };
    sh.uniforms.uWet = wet;
    sh.uniforms.uLit = lit;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uMask;\nuniform float uWet, uLit;\nvarying vec3 vFW;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `float wallM = 1.0;
        #if defined( USE_COLOR )
          wallM = texture2D(uMask, vMapUv).r;
          diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, wallM);
        #endif
        float lumT = dot(sampledDiffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        float glassM = (1.0 - wallM) * step(lumT, 0.34) * step(sampledDiffuseColor.r, sampledDiffuseColor.b + 0.03);
        diffuseColor.rgb *= mix(1.0, 0.74, uWet * wallM) * (0.94 + 0.08 * qn(vFW.xy * 0.7));`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.5, uWet * wallM), 0.12, glassM);')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float onW = step(0.6, qh(vec2(floor(vFW.x / 1.5), floor(vFW.y / 2.8) + 3.0)));
        totalEmissiveRadiance += vec3(1.0, 0.76, 0.46) * glassM * onW * uLit * 0.8;`,
      );
  };
  m.customProgramCacheKey = () => 'street-fachada';
  return m;
}

// ---------------------------------------------------------------------------------------- la cuadra

export class StreetWorld {
  private stage: QStage;
  private time = { value: 0 };
  private wet = { value: 0 };
  private lit = { value: 0 };
  private stormFlow = { value: 0 };
  private sewerFlow = { value: 1 };
  private v: StreetView | null = null;
  private laterals: THREE.Mesh[] = [];
  private latMat = new THREE.MeshStandardMaterial({ color: '#efe9da', roughness: 0.5 });
  private rainPts: THREE.LineSegments;
  private gutter: THREE.Mesh;
  private gutterCol: Float32Array;
  private litter: THREE.InstancedMesh;
  private dirt: THREE.InstancedMesh;
  private items: { x: number; z: number; kind: 'l' | 'd'; leave: number; rot: number }[] = [];
  private plume: THREE.Mesh;
  private plumeA: Float32Array;
  private plumeUV: Float32Array;
  private dyeDots: THREE.InstancedMesh;
  private lamps: THREE.MeshStandardMaterial;
  private flow: Flow | null = null;
  private dyePlume = 0;
  private rain: { t0: number; min: number } | null = null;
  private lastMin = -1;
  private sky = 0;
  private marks: THREE.Group = new THREE.Group();
  private tops: number[] = [];
  private stormPath: THREE.Vector3[];
  private cb: { onHouse: (i: number) => void; onRainMinute: (m: number) => void; onRainEnd: () => void; onDyeEnd: (i: number, wrong: boolean) => void };
  /** Segundos de animación por minuto de lluvia. */
  static readonly SEC_PER_MIN = 0.4;
  readonly views: Record<'general' | 'calle' | 'tubos' | 'quebrada', StageView> = {
    general: { eye: [-6, 9.5, 47], target: [5, -1.6, -3] },
    calle: { eye: [-24, 4.2, 9.5], target: [10, 1.2, -4] },
    // la cuadra en sección por el costado izquierdo: casa, caja de inspección, desagüe y los dos tubos
    tubos: { eye: [-61, 0.4, 2.5], target: [-37, -3.3, -2.5], fit: 26 },
    quebrada: { eye: [43, 3.5, 25], target: [58.5, -6.8, 6] },
  };

  constructor(stage: QStage, cb: StreetWorld['cb']) {
    this.stage = stage;
    this.cb = cb;
    const sc = stage.scene;
    stage.setShadowSpan(70);
    stage.controls.minDistance = 4;
    const R = rng(9);
    const C = (hex: string) => new THREE.Color(hex);

    // ---------------------------------------------------------------- terreno
    const gg = new THREE.PlaneGeometry(260, 200, 130, 100);
    gg.rotateX(-Math.PI / 2);
    const gp = gg.getAttribute('position') as THREE.BufferAttribute;
    // filas y columnas de la malla justo en los bordes del bloque: los cortes quedan verticales
    const snapZ: [number, number][] = [
      [-16, BACK - 0.05],
      [-14, BACK + 0.05],
      [6, FRONT - 0.05],
      [8, FRONT + 0.05],
    ];
    const snapX: [number, number][] = [
      [46, 46.95],
      [48, 47.05],
    ];
    const gcol = new Float32Array(gp.count * 3);
    const grass = C('#5d8f3c'), grassL = C('#7aa64b'), grassD = C('#47772f'), dry = C('#7c9446'), bed = C('#5f5a4c'), mud = C('#7a6647'), deep = C('#94704a');
    const tmp = new THREE.Color();
    for (let k = 0; k < gp.count; k++) {
      let x = gp.getX(k), z = gp.getZ(k);
      for (const [a, b] of snapZ) if (Math.abs(z - a) < 0.01) z = b;
      for (const [a, b] of snapX) if (Math.abs(x - a) < 0.01 && z < FRONT && z > BACK) x = b;
      gp.setX(k, x);
      gp.setZ(k, z);
      const y = groundAt(x, z);
      gp.setY(k, y - 0.05);
      const dc = Math.abs(x - CREEK_X);
      const n1 = noise2(x * 0.08, z * 0.08), n2 = noise2(x * 0.45 + 7, z * 0.45);
      if (x > -47 && x < 47 && z > BACK && z < FRONT) tmp.copy(deep).multiplyScalar(0.9 + 0.2 * n2);
      else if (dc < 3.8) tmp.copy(bed).multiplyScalar(0.85 + 0.3 * n2);
      else if (dc < 5.2 && y < LOW + 0.05) tmp.copy(mud).lerp(grass, (dc - 3.8) / 1.4).multiplyScalar(0.9 + 0.2 * n2);
      else {
        tmp.copy(grass).lerp(n1 > 0.5 ? grassL : grassD, Math.abs(n1 - 0.5) * 1.4).multiplyScalar(0.92 + 0.16 * n2);
        if (x > 47 && x < 56 && z < FRONT) tmp.lerp(dry, 0.45);
      }
      gcol.set([tmp.r, tmp.g, tmp.b], k * 3);
    }
    gg.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
    gg.computeVertexNormals();
    const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    ground.receiveShadow = true;
    sc.add(ground);

    // ---------------------------------------------------------------- pavimento por capas (se ven en el corte)
    const asphalt = asphaltMaterial(this.wet), walk = sidewalkMaterial(this.wet), conc = concreteMaterial('#c4bfb4'), gravel = gravelMaterial();
    const layer = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, mat: THREE.Material, rec = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.receiveShadow = rec;
      sc.add(m);
      return m;
    };
    layer(-47, 47, -3.4, 3.4, -0.1, 0, asphalt);
    layer(-47, 47, -3.4, 3.4, -0.55, -0.1, gravel);
    // cunetas (un poco más bajas que la vía) y bordillos
    layer(-47, 47, 3.4, 4.0, -0.4, -0.02, conc);
    layer(-47, 47, -4.0, -3.4, -0.4, -0.02, conc);
    layer(-47, 47, 4.0, 4.2, -0.45, 0.15, concreteMaterial('#b7b2a8'));
    layer(-47, 47, -4.2, -4.0, -0.45, 0.15, concreteMaterial('#b7b2a8'));
    // andenes
    layer(-47, 47, 4.2, FRONT, 0.03, 0.15, walk);
    layer(-47, 47, -6.25, -4.2, 0.03, 0.15, walk);
    layer(-47, 47, 4.2, FRONT, -0.45, 0.03, gravel);
    layer(-47, 47, -6.25, -4.2, -0.45, 0.03, gravel);
    // lote de las casas (placa de piso)
    layer(-47, 47, BACK, -6.25, -0.35, 0, concreteMaterial('#a9a49a'));
    // demarcación: líneas de borde blancas, eje amarillo a trazos y cebra al final de la cuadra
    const paint: THREE.BufferGeometry[] = [], yellow: THREE.BufferGeometry[] = [];
    for (const z of [-3.15, 3.15]) paint.push(quad(94, 0.12, new THREE.Vector3(0, 0.006, z), '+y', null));
    for (let x = -45; x < 45; x += 6) yellow.push(quad(3, 0.14, new THREE.Vector3(x, 0.006, 0), '+y', null));
    for (let z = -2.75; z <= 2.8; z += 1.1) paint.push(quad(3.2, 0.55, new THREE.Vector3(-44, 0.007, z), '+y', null));
    const paintM = new THREE.Mesh(merged(paint), new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.7 }));
    const yellowM = new THREE.Mesh(merged(yellow), new THREE.MeshStandardMaterial({ color: '#e9c43c', roughness: 0.7 }));
    paintM.receiveShadow = yellowM.receiveShadow = true;
    sc.add(paintM, yellowM);

    // ---------------------------------------------------------------- corte del suelo: vidrio al frente y estratos
    const strata = strataMaterial();
    const cut = (geo: THREE.BufferGeometry) => {
      const m = new THREE.Mesh(geo, strata);
      sc.add(m);
      return m;
    };
    // fondo (bajo las casas), costado izquierdo y costado derecho del bloque
    cut(quad(94, -LOW - 0.35, new THREE.Vector3(0, (LOW - 0.35) / 2, BACK + 0.07), '+z', null));
    cut(quad(FRONT - BACK, -LOW - 0.45, new THREE.Vector3(46.97, (LOW - 0.45) / 2, (FRONT + BACK) / 2), '-x', null));
    // corte de la ladera a la derecha del bloque (frente)
    const sh = new THREE.Shape();
    sh.moveTo(47, LOW);
    sh.lineTo(47, -0.45);
    for (let x = 47.4; x <= 55.8; x += 0.4) sh.lineTo(x, Math.max(LOW, -(x - 47) * 0.75) - 0.05);
    sh.lineTo(55.8, LOW);
    const slopeCut = new THREE.ShapeGeometry(sh);
    slopeCut.translate(0, 0, FRONT + 0.06);
    cut(slopeCut);
    // vidrio: deja ver los tubos a través de la tierra (un tinte de los mismos estratos)
    // (al frente y en el costado izquierdo: por el costado se ve la cuadra en sección, con los desagües de perfil)
    const glassM = strataMaterial({ opacity: 0.2 });
    const glass = new THREE.Mesh(
      merged([quad(94, -LOW - 0.45, new THREE.Vector3(0, (LOW - 0.45) / 2, FRONT + 0.02), '+z', null), quad(FRONT - BACK, -LOW - 0.56, new THREE.Vector3(-47.02, (LOW - 0.56) / 2, (FRONT + BACK) / 2), '-x', null)]),
      glassM,
    );
    glass.renderOrder = 7;
    sc.add(glass);
    // marco del vidrio y reflejos
    const frameM = new THREE.MeshStandardMaterial({ color: '#2e3338', roughness: 0.5, metalness: 0.5 });
    const frame = new THREE.Mesh(
      merged([
        box(94.3, 0.16, 0.16, 0, LOW + 0.05, FRONT + 0.06),
        box(94.3, 0.12, 0.12, 0, -0.47, FRONT + 0.06),
        box(0.16, -LOW, 0.16, -47.05, LOW / 2, FRONT + 0.06),
        box(0.16, -LOW, 0.16, 47.05, LOW / 2, FRONT + 0.06),
        box(0.16, 0.16, FRONT - BACK, -47.06, LOW + 0.05, (FRONT + BACK) / 2),
        box(0.12, 0.12, FRONT - BACK, -47.06, -0.58, (FRONT + BACK) / 2),
        box(0.16, -LOW, 0.16, -47.06, LOW / 2, BACK),
      ]),
      frameM,
    );
    sc.add(frame);
    const glare = new THREE.Mesh(
      merged(
        [-30, -6, 21, 38].map((x, k) => {
          const g = new THREE.PlaneGeometry(k % 2 ? 0.35 : 0.6, 5.2);
          g.rotateZ(0.42);
          g.translate(x, -3.6, FRONT + 0.09);
          return prep(g);
        }),
      ),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, depthWrite: false }),
    );
    glare.renderOrder = 8;
    sc.add(glare);

    // ---------------------------------------------------------------- tubos, cama de grava, pozos y sumidero
    const stormCurve = new THREE.CatmullRomCurve3(
      STORM_PTS.map(([x, y]) => new THREE.Vector3(x, y, STORM.z)),
      false,
      'centripetal',
    );
    this.stormPath = STORM_PTS.map(([x, y]) => new THREE.Vector3(x, y, STORM.z));
    const sewerCurve = new THREE.CatmullRomCurve3(
      SEWER_PTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'centripetal',
    );
    const stormTube = new THREE.Mesh(new THREE.TubeGeometry(stormCurve, 220, STORM.r, 18, false), pipeMaterial('#2f78c4', stormCurve.getLength(), this.stormFlow, this.time));
    const sewerTube = new THREE.Mesh(new THREE.TubeGeometry(sewerCurve, 220, SEWER.r, 18, false), pipeMaterial('#8a5a2b', sewerCurve.getLength(), this.sewerFlow, this.time));
    stormTube.castShadow = sewerTube.castShadow = true;
    sc.add(stormTube, sewerTube);
    // cama de grava bajo cada tubo (hasta media caña)
    const bedding = new THREE.Mesh(
      merged([box(93, 0.55, 1.5, -0.5, STORM.y - STORM.r - 0.1, STORM.z), box(93.5, 0.55, 1.45, -0.25, SEWER.y - SEWER.r - 0.1, SEWER.z)]),
      gravel,
    );
    sc.add(bedding);
    // pozos de inspección (cilindro de concreto hasta la superficie, con su tapa de hierro)
    const shafts: THREE.BufferGeometry[] = [], lids: THREE.BufferGeometry[] = [];
    for (const x of SEWER_MH) {
      const top = -0.1, bot = SEWER.y + SEWER.r * 0.6;
      shafts.push(cyl(0.62, top - bot, x, (top + bot) / 2, SEWER.z, undefined, 18));
      shafts.push(cyl(0.85, 0.35, x, SEWER.y - SEWER.r - 0.05, SEWER.z, undefined, 18));
      lids.push(cyl(0.46, 0.04, x, 0.012, SEWER.z, undefined, 22));
    }
    for (const x of STORM_MH) {
      const top = 0.05, bot = STORM.y + STORM.r * 0.6;
      shafts.push(cyl(0.6, top - bot, x, (top + bot) / 2, STORM.z, undefined, 18));
      shafts.push(cyl(0.82, 0.35, x, STORM.y - STORM.r - 0.05, STORM.z, undefined, 18));
      lids.push(cyl(0.44, 0.04, x, 0.162, STORM.z, undefined, 22));
    }
    // sumidero: rejilla en la cuneta, boca en el bordillo, cámara y bajante al tubo de aguas lluvias
    shafts.push(box(1.5, 1.0, 1.0, DRAIN_X, -0.55, 3.7));
    const drainDown = cyl(0.28, -STORM.y - 1.05, DRAIN_X, (STORM.y - 1.05) / 2, 3.7, undefined, 12);
    const drainLink = cyl(0.28, STORM.z - 3.7, DRAIN_X, STORM.y, (STORM.z + 3.7) / 2, undefined, 12, 'z');
    const pozoM = new THREE.Mesh(merged(shafts), concreteMaterial('#b3ada2'));
    pozoM.castShadow = true;
    // tapas de hierro con relieve de rombos
    const ironM = shaded(
      { color: '#5a5e62', roughness: 0.5, metalness: 0.55 },
      {
        key: 'tapa',
        color: `vec2 d = vec2(vQW.x + vQW.z, vQW.x - vQW.z) * 5.0;
          float ridge = max(step(0.82, fract(d.x)), step(0.82, fract(d.y)));
          diffuseColor.rgb *= (0.78 + 0.3 * ridge) * step(0.5, vQN.y) + 0.7 * (1.0 - step(0.5, vQN.y));`,
      },
    );
    const lidM = new THREE.Mesh(merged(lids), ironM);
    lidM.receiveShadow = true;
    const stormM2 = new THREE.MeshStandardMaterial({ color: '#2f78c4', roughness: 0.45 });
    const drainPipe = new THREE.Mesh(merged([drainDown, drainLink]), stormM2);
    const grate = new THREE.Mesh(
      merged([box(1.3, 0.04, 0.56, DRAIN_X, 0.0, 3.7), ...[...Array(7)].map((_, k) => box(0.05, 0.05, 0.56, DRAIN_X - 0.54 + k * 0.18, 0.03, 3.7)), box(1.4, 0.1, 0.03, DRAIN_X, 0.06, 4.0)]),
      new THREE.MeshStandardMaterial({ color: '#1f2124', roughness: 0.6, metalness: 0.5 }),
    );
    sc.add(pozoM, lidM, drainPipe, grate);

    // ---------------------------------------------------------------- casas de barrio
    ATLAS ??= facadeAtlas();
    const atlas = ATLAS;
    const fac: THREE.BufferGeometry[] = [], bricks: THREE.BufferGeometry[] = [], roofs: THREE.BufferGeometry[] = [], slabs: THREE.BufferGeometry[] = [], colored: THREE.BufferGeometry[] = [], pipes: THREE.BufferGeometry[] = [];
    const tanks: { x: number; y: number; z: number; blue: boolean }[] = [];
    const paints = ['#efe3c2', '#f2d27a', '#cfe3d4', '#bcd7e8', '#f0c2a8', '#e9b9c2', '#d9e6a8', '#f4efe4', '#9fd0c9', '#f3b56b', '#c7b6dc'];
    const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
    const zc = (HOUSE.z0 + HOUSE.z1) / 2, D = HOUSE.z1 - HOUSE.z0, FH = HOUSE.floor;
    const pickBoxes: HouseSpot[] = [];
    for (let i = 0; i < N; i++) {
      const x = HX(i), w = HOUSE.w;
      const u = R();
      const floors = u < 0.14 ? 1 : u < 0.52 ? 2 : u < 0.88 ? 3 : 4;
      const h = floors * FH;
      const brickF = R() < 0.45;
      const paintC = C(pick(paints));
      const tv = 0.9 + R() * 0.16;
      const brickT = new THREE.Color(tv, tv * 0.98, tv * 0.96);
      const teja = floors === 1 ? R() < 0.75 : floors === 2 && R() < 0.22;
      const obra = brickF && floors >= 2 && !teja && R() < 0.28;
      const pre = brickF ? 'b' : 'p';
      // fachada piso por piso
      for (let k = 0; k < floors; k++) {
        let tile: TileId;
        if (k === 0) tile = (pre + pick(['Door', 'Door', 'Door', 'Garage', 'WinLow', i === 6 ? 'ShopA' : i === 13 ? 'ShutB' : 'Door'])) as TileId;
        else if (obra && k === floors - 1) tile = 'gWin';
        else tile = (brickF ? pick(['bWinReja', 'bWinAlu', 'bBalcon', 'bSmall', 'bWinReja']) : pick(['pWinReja', 'pWinAlu', 'pBalcon', 'pSmall', 'pPlants', 'pWinReja2'])) as TileId;
        const tint = tile.startsWith('p') ? paintC : brickT;
        fac.push(quad(w, FH, new THREE.Vector3(x, k * FH + FH / 2, HOUSE.z1), '+z', atlas.uv(tile), tint));
        // losa del balcón y baranda delante de la fachada
        if (tile.endsWith('Balcon')) {
          const rail = C(brickF ? '#2a2a2a' : '#f1f1ec');
          const bw = w * 0.6, y0 = k * FH + 0.06;
          colored.push(box(bw, 0.12, 0.85, x, y0, HOUSE.z1 + 0.42, C('#bdb8ae')));
          colored.push(box(bw, 0.05, 0.05, x, y0 + 1.0, HOUSE.z1 + 0.82, rail));
          colored.push(box(0.05, 1.0, 0.85, x - bw / 2 + 0.03, y0 + 0.5, HOUSE.z1 + 0.42, rail));
          colored.push(box(0.05, 1.0, 0.85, x + bw / 2 - 0.03, y0 + 0.5, HOUSE.z1 + 0.42, rail));
          for (let b = 1; b < 12; b++) colored.push(box(0.03, 0.94, 0.03, x - bw / 2 + (b * bw) / 12, y0 + 0.5, HOUSE.z1 + 0.82, rail));
        }
      }
      // culatas y espalda de ladrillo
      const hw = teja ? h : h + 0.6;
      bricks.push(quad(D, hw, new THREE.Vector3(x - w / 2, hw / 2, zc), '-x', null));
      bricks.push(quad(D, hw, new THREE.Vector3(x + w / 2, hw / 2, zc), '+x', null));
      bricks.push(quad(w, hw, new THREE.Vector3(x, hw / 2, HOUSE.z0), '-z', null));
      if (teja) {
        // techo a dos aguas de teja de barro, con alero
        const rise = 1.5, run = D / 2 + 0.4, L = Math.hypot(run, rise), th = Math.atan2(rise, run);
        const tc = C(pick(['#b5562f', '#a84c2a', '#bf6338', '#9c4a2c']));
        // el alero baja un poco: el techo toca el muro justo en la línea de la fachada
        const dy = (rise * 0.4) / run;
        const f = new THREE.PlaneGeometry(w + 0.25, L);
        f.rotateX(-(Math.PI / 2 - th));
        f.translate(x, h + rise / 2 - dy, zc + run / 2);
        const b = new THREE.PlaneGeometry(w + 0.25, L);
        b.rotateX(-(Math.PI / 2 + th));
        b.translate(x, h + rise / 2 - dy, zc - run / 2);
        roofs.push(prep(f, { color: tc }), prep(b, { color: tc }));
        // gabletes de ladrillo
        for (const s of [-1, 1]) {
          const xs = x + (s * w) / 2;
          const tri = new THREE.BufferGeometry();
          const pts = s > 0 ? [xs, h, HOUSE.z1, xs, h, HOUSE.z0, xs, h + rise * (D / 2 / run), zc] : [xs, h, HOUSE.z0, xs, h, HOUSE.z1, xs, h + rise * (D / 2 / run), zc];
          tri.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          tri.computeVertexNormals();
          bricks.push(tri);
        }
        // canal del alero
        pipes.push(cyl(0.07, w + 0.2, x, h - 0.02, HOUSE.z1 + 0.42, undefined, 8, 'x'));
      } else {
        // azotea: placa, pretil, tanque de agua y, en algunas, un cuarto útil con teja ondulada
        slabs.push(box(w - 0.02, 0.14, D - 0.02, x, h + 0.05, zc));
        fac.push(quad(w, 0.62, new THREE.Vector3(x, h + 0.31, HOUSE.z1), '+z', ((uv) => [uv[0], uv[1] + (uv[3] - uv[1]) * 0.35, uv[2], uv[1] + (uv[3] - uv[1]) * 0.55] as [number, number, number, number])(atlas.uv(brickF ? 'bBlank' : 'pBlank')), brickF ? brickT : paintC));
        slabs.push(box(w, 0.08, 0.16, x, h + 0.66, HOUSE.z1 - 0.08), box(w, 0.6, 0.14, x, h + 0.3, HOUSE.z1 - 0.1));
        slabs.push(box(0.14, 0.6, D - 0.3, x - w / 2 + 0.09, h + 0.3, zc), box(0.14, 0.6, D - 0.3, x + w / 2 - 0.09, h + 0.3, zc), box(w - 0.3, 0.6, 0.14, x, h + 0.3, HOUSE.z0 + 0.09));
        if (R() < 0.72) tanks.push({ x: x + (R() - 0.5) * 1.8, y: h + 0.12, z: -11.6 + R() * 2.2, blue: R() < 0.3 });
        if (R() < 0.32) {
          bricks.push(box(1.9, 2.1, 2.3, x + (R() < 0.5 ? -0.9 : 0.9), h + 1.17, HOUSE.z0 + 1.4));
          roofs.push(prep(new THREE.BoxGeometry(2.2, 0.06, 2.6).translate(x + 0.0, h + 2.27, HOUSE.z0 + 1.4), { color: C('#a9aca8') }));
        }
      }
      // bajante del techo a la calle
      pipes.push(cyl(0.065, h + (teja ? 0 : 0.5), x + w / 2 - 0.25, (h + (teja ? 0 : 0.5)) / 2 + 0.1, HOUSE.z1 + 0.09, undefined, 8));
      this.tops.push(h + (teja ? 1.7 : 1.4));
      pickBoxes.push({ x, y: 0, z: zc, w, d: D, h: h + (teja ? 1.5 : 0.7), rot: 0, wall: '#ffffff' });
    }
    // cuartos útiles: las cajas de ladrillo no llevan uv
    const brickM = new THREE.Mesh(merged(bricks.map((g) => (g.getAttribute('uv') ? (g.deleteAttribute('uv'), g) : g))), brickMaterial(this.wet));
    const facM = new THREE.Mesh(merged(fac), facadeMaterial(this.wet, this.lit));
    const roofM = new THREE.Mesh(merged(roofs), roofTileMaterial());
    const slabM = new THREE.Mesh(merged(slabs), concreteMaterial('#a7a399'));
    const colM = new THREE.Mesh(merged(colored), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    const pipeM = new THREE.Mesh(merged(pipes), new THREE.MeshStandardMaterial({ color: '#8d969c', roughness: 0.6 }));
    for (const m of [brickM, facM, roofM, slabM, colM, pipeM]) {
      m.castShadow = true;
      m.receiveShadow = true;
      sc.add(m);
    }
    roofM.material.side = THREE.DoubleSide;
    // tanques de agua de las azoteas (negros y algunos azules)
    const tg = new THREE.CylinderGeometry(0.52, 0.6, 1.05, 18);
    tg.translate(0, 0.52, 0);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 }), Math.max(1, tanks.length));
    tanks.forEach((t, k) => {
      tm.setMatrixAt(k, new THREE.Matrix4().makeTranslation(t.x, t.y, t.z));
      tm.setColorAt(k, C(t.blue ? '#2f5f9e' : '#26282b'));
    });
    tm.count = tanks.length;
    tm.castShadow = true;
    sc.add(tm);
    // cajas para tocar las casas (invisibles): una por casa, con su número de instancia
    const hm = houses(pickBoxes);
    hm.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    hm.castShadow = hm.receiveShadow = false;
    sc.add(hm);
    stage.addPick(
      hm,
      (_p, hit) => {
        if (hit.instanceId !== undefined) cb.onHouse(hit.instanceId);
      },
      'Toca una casa para echar colorante en su desagüe',
    );
    // desagües (laterales) con su caja de inspección bajo el andén
    const boxes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < N; i++) {
      const lat = new THREE.Mesh(new THREE.BufferGeometry(), this.latMat);
      lat.castShadow = true;
      this.laterals.push(lat);
      sc.add(lat);
      boxes.push(box(0.75, 0.7, 0.75, HX(i) - 0.6, -0.82, -5.6));
    }
    sc.add(new THREE.Mesh(merged(boxes), concreteMaterial('#bab4a8')));
    sc.add(this.marks);

    // ---------------------------------------------------------------- calle: árboles, postes de luz y carros
    const streetTrees: TreeSpot[] = [-40, -27, -2.5, 7, 22, 31].map((x) => ({ x, y: 0.15, z: 6.5, r: 1.3 + R() * 0.5 }));
    const pits = streetTrees.map((t) => box(1.2, 0.03, 1.2, t.x, 0.16, t.z, C('#4a3b2c')));
    sc.add(new THREE.Mesh(merged(pits), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
    const lampsG: THREE.BufferGeometry[] = [], heads: THREE.BufferGeometry[] = [];
    for (let i = 1; i < N; i += 4) {
      const x = HX(i) + 2.21;
      lampsG.push(cyl(0.08, 7.4, x, 3.85, -4.55, undefined, 8), box(0.08, 0.08, 1.9, x, 7.45, -3.65), cyl(0.16, 0.5, x, 0.4, -4.55, undefined, 8));
      heads.push(box(0.32, 0.12, 0.7, x, 7.36, -2.75));
    }
    const lampPost = new THREE.Mesh(merged(lampsG), new THREE.MeshStandardMaterial({ color: '#6f777e', roughness: 0.45, metalness: 0.5 }));
    lampPost.castShadow = true;
    this.lamps = new THREE.MeshStandardMaterial({ color: '#e9e4d2', emissive: '#ffd58a', emissiveIntensity: 0, roughness: 0.4 });
    sc.add(lampPost, new THREE.Mesh(merged(heads), this.lamps));
    // carros parqueados en el carril norte
    const bodies: THREE.BufferGeometry[] = [], glassG: THREE.BufferGeometry[] = [], wheels: THREE.BufferGeometry[] = [], lights: THREE.BufferGeometry[] = [];
    const carCols = ['#b8322a', '#eeeae2', '#2e5e8c', '#5c6b73', '#d9a933'];
    [-35.5, -18.4, 3.6, 21.8, 34.2].forEach((x, k) => {
      const z = -2.25, col = C(carCols[k % carCols.length]);
      bodies.push(box(4.0, 0.62, 1.74, x, 0.62, z, col), box(1.95, 0.07, 1.5, x - 0.25, 1.53, z, col));
      glassG.push(box(2.05, 0.52, 1.56, x - 0.25, 1.2, z));
      for (const [dx, dz] of [
        [-1.3, -0.82],
        [1.3, -0.82],
        [-1.3, 0.82],
        [1.3, 0.82],
      ])
        wheels.push(cyl(0.33, 0.24, x + dx, 0.33, z + dz, undefined, 14, 'z'));
      lights.push(box(0.05, 0.14, 0.3, x + 2.0, 0.72, z - 0.6, C('#fff6d6')), box(0.05, 0.14, 0.3, x + 2.0, 0.72, z + 0.6, C('#fff6d6')), box(0.05, 0.14, 0.32, x - 2.0, 0.74, z - 0.6, C('#c0261d')), box(0.05, 0.14, 0.32, x - 2.0, 0.74, z + 0.6, C('#c0261d')));
    });
    const carBody = new THREE.Mesh(merged(bodies), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35 }));
    const carGlass = new THREE.Mesh(merged(glassG), new THREE.MeshStandardMaterial({ color: '#1d2a33', roughness: 0.12, metalness: 0.3 }));
    const carWheel = new THREE.Mesh(merged(wheels), new THREE.MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.85 }));
    const carLight = new THREE.Mesh(merged(lights), new THREE.MeshBasicMaterial({ vertexColors: true }));
    for (const m of [carBody, carGlass, carWheel]) m.castShadow = true;
    sc.add(carBody, carGlass, carWheel, carLight);

    // ---------------------------------------------------------------- barrio detrás y árboles
    const back: HouseSpot[] = [];
    for (const z of [-24, -35, -47]) {
      for (let x = -66; x < 45; x += 5 + R() * 2.5) {
        const fl = 1 + Math.floor(R() * 4);
        back.push({ x, y: 0, z: z + (R() - 0.5) * 2, w: 4.6 + R() * 1.5, d: 8, h: fl * 2.8, rot: (R() - 0.5) * 0.06, wall: WALLS[Math.floor(R() * WALLS.length)] });
      }
    }
    const backHouses = houses(back);
    sc.add(backHouses);
    const ts: TreeSpot[] = [...streetTrees];
    for (let k = 0; k < 80; k++) {
      const x = CREEK_X - 12 + R() * 28, z = -90 + R() * 180;
      if (Math.abs(x - CREEK_X) < 6 || (x < 50 && z > -16 && z < 10) || (x < 58 && z > -4 && z < 32)) continue;
      ts.push({ x, y: groundAt(x, z), z, r: 1.6 + R() * 1.4 });
    }
    for (let k = 0; k < 30; k++) ts.push({ x: -120 + R() * 160, y: 0, z: -56 - R() * 30, r: 1.8 + R() * 1.6 });
    for (let k = 0; k < 40; k++) {
      const x = -110 + R() * 150, z = 24 + R() * 60;
      ts.push({ x, y: groundAt(x, z), z, r: 1.8 + R() * 1.6 });
    }
    sc.add(trees(ts, 12));

    // ---------------------------------------------------------------- quebrada: cauce, piedras, cabezote de descarga
    const cg = new THREE.PlaneGeometry(7.6, 200, 1, 100);
    cg.rotateX(-Math.PI / 2);
    const cpos = cg.getAttribute('position') as THREE.BufferAttribute;
    const flowA = new Float32Array(cpos.count * 2);
    const foam = new Float32Array(cpos.count);
    const ccol = new Float32Array(cpos.count * 3);
    for (let k = 0; k < cpos.count; k++) {
      flowA[k * 2] = -cpos.getZ(k);
      flowA[k * 2 + 1] = cpos.getX(k) / 3.8;
      foam[k] = Math.abs(cpos.getZ(k) - STORM.z - 0.6) < 2 && cpos.getX(k) < 0 ? 0.6 : 0.08;
      ccol.set([0.11, 0.33, 0.37], k * 3);
    }
    cg.setAttribute('aFlow', new THREE.BufferAttribute(flowA, 2));
    cg.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
    cg.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
    const creek = new THREE.Mesh(cg, waterMaterial(this.time, { opacity: 0.86, speed: -0.8 }));
    creek.position.set(CREEK_X, CREEK_Y, 0);
    creek.renderOrder = 3;
    sc.add(creek);
    // piedras en las orillas y en el lecho, y enrocado al pie de la descarga
    const rocks: { x: number; y: number; z: number; s: number; c: number }[] = [];
    for (let z = -95; z < 95; z += 1.2 + R() * 1.6) {
      for (const sgn of [-1, 1]) {
        const x = CREEK_X + sgn * (3.4 + R() * 1.2);
        rocks.push({ x, y: groundAt(x, z) + 0.05, z, s: 0.25 + R() * 0.45, c: R() });
      }
      if (R() < 0.35) {
        const x = CREEK_X + (R() - 0.5) * 5;
        rocks.push({ x, y: groundAt(x, z) + 0.2, z, s: 0.3 + R() * 0.4, c: R() });
      }
    }
    for (let k = 0; k < 26; k++) {
      const x = 55.6 + R() * 1.6, z = STORM.z - 1.8 + R() * 3.6;
      rocks.push({ x, y: groundAt(x, z) + 0.1, z, s: 0.3 + R() * 0.3, c: R() });
    }
    const rg = new THREE.IcosahedronGeometry(1, 0);
    rg.scale(1, 0.62, 0.9);
    const rm = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, flatShading: true }), rocks.length);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3();
    const rockA = C('#8d8a82'), rockB = C('#6f6a5f');
    rocks.forEach((r, k) => {
      q4.setFromEuler(new THREE.Euler(R() * 0.5, R() * 6.28, R() * 0.5));
      rm.setMatrixAt(k, m4.compose(p4.set(r.x, r.y, r.z), q4, s4.setScalar(r.s)));
      rm.setColorAt(k, rockA.clone().lerp(rockB, r.c));
    });
    rm.castShadow = true;
    rm.receiveShadow = true;
    sc.add(rm);
    // cabezote de concreto con aletas y la boca del tubo
    const hwM = concreteMaterial('#bdb7ab');
    const head = new THREE.Mesh(
      merged([
        box(1.6, 1.75, 3.2, 54.8, LOW + 0.85, STORM.z),
        box(1.3, 1.2, 0.3, 56.0, LOW + 0.5, STORM.z - 1.75, undefined, 0.35),
        box(1.3, 1.2, 0.3, 56.0, LOW + 0.5, STORM.z + 1.75, undefined, -0.35),
      ]),
      hwM,
    );
    head.castShadow = head.receiveShadow = true;
    const mouth = new THREE.Mesh(
      merged([cyl(STORM.r + 0.08, 0.12, 55.63, -6.3, STORM.z, undefined, 18, 'x')]),
      new THREE.MeshStandardMaterial({ color: '#2f78c4', roughness: 0.4 }),
    );
    const hole = new THREE.Mesh(new THREE.CircleGeometry(STORM.r - 0.04, 18), new THREE.MeshBasicMaterial({ color: '#0e1418' }));
    hole.rotation.y = Math.PI / 2;
    hole.position.set(55.7, -6.3, STORM.z);
    sc.add(head, mouth, hole);

    // ---------------------------------------------------------------- cuneta con agua (se llena cuando llueve)
    const gt = new THREE.PlaneGeometry(DRAIN_X + 46, 0.9, 60, 1);
    gt.rotateX(-Math.PI / 2);
    const gn = gt.getAttribute('position').count;
    const gf = new Float32Array(gn * 2);
    for (let k = 0; k < gn; k++) {
      gf[k * 2] = (gt.getAttribute('position') as THREE.BufferAttribute).getX(k);
      gf[k * 2 + 1] = 0;
    }
    gt.setAttribute('aFlow', new THREE.BufferAttribute(gf, 2));
    gt.setAttribute('aFoam', new THREE.BufferAttribute(new Float32Array(gn), 1));
    this.gutterCol = new Float32Array(gn * 3);
    gt.setAttribute('color', new THREE.BufferAttribute(this.gutterCol, 3));
    this.gutter = new THREE.Mesh(gt, waterMaterial(this.time, { opacity: 0.8, speed: 1.6 }));
    this.gutter.position.set((DRAIN_X - 46) / 2, 0.01, 3.62);
    this.gutter.renderOrder = 3;
    this.gutter.visible = false;
    sc.add(this.gutter);

    // ---------------------------------------------------------------- lluvia: rayitas verticales
    const nr = 2600, rp = new Float32Array(nr * 6);
    for (let k = 0; k < nr; k++) {
      const x = -50 + R() * 116, y = -7 + R() * 37, z = -18 + R() * 46;
      rp.set([x, y, z, x + 0.05, y - 0.9, z + 0.05], k * 6);
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rainPts = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: '#dbe8f3', transparent: true, opacity: 0.7, depthWrite: false }));
    this.rainPts.visible = false;
    this.rainPts.frustumCulled = false;
    sc.add(this.rainPts);

    // ---------------------------------------------------------------- basura, mugre y colorante
    this.litter = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.08, 0.25), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), 90);
    this.dirt = new THREE.InstancedMesh(new THREE.CircleGeometry(0.45, 7), new THREE.MeshStandardMaterial({ color: '#5b4630', roughness: 1, transparent: true, opacity: 0.5, depthWrite: false }), 110);
    this.dirt.geometry.rotateX(-Math.PI / 2);
    const lc = ['#e9e4d8', '#d64c3b', '#3a7bd5', '#f2c230', '#5aa361', '#ffffff', '#b06bc9'];
    for (let k = 0; k < 90; k++) this.litter.setColorAt(k, C(lc[k % lc.length]));
    this.dyeDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: '#e0218a' }), 40);
    for (const m of [this.litter, this.dirt, this.dyeDots]) {
      m.frustumCulled = false;
      m.renderOrder = 8;
      sc.add(m);
    }

    // ---------------------------------------------------------------- pluma en la quebrada: una cinta que se abre y se diluye
    const NS = 64, NV = 8;
    const pg = new THREE.BufferGeometry();
    const ppos = new Float32Array((NS + 1) * (NV + 1) * 3);
    this.plumeA = new Float32Array((NS + 1) * (NV + 1) * 4);
    this.plumeUV = new Float32Array((NS + 1) * (NV + 1) * 2);
    const idx: number[] = [];
    for (let i = 0; i <= NS; i++) {
      const s = i / NS;
      const cx = 56.6 + 3.2 * Math.pow(s, 0.6);
      const half = Math.min(3.6, 0.35 + 3.0 * Math.pow(s, 0.55));
      const z = STORM.z + 0.1 + 42 * s;
      for (let j = 0; j <= NV; j++) {
        const v = (j / NV) * 2 - 1;
        const k = i * (NV + 1) + j;
        ppos.set([Math.max(56.45, Math.min(63.55, cx + v * half)), CREEK_Y + 0.03, z], k * 3);
        this.plumeUV.set([s, v], k * 2);
        this.plumeA.set([1, 1, 1, 0], k * 4);
        if (i < NS && j < NV) idx.push(k, k + NV + 1, k + 1, k + 1, k + NV + 1, k + NV + 2);
      }
    }
    pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(this.plumeA, 4));
    pg.setIndex(idx);
    pg.computeVertexNormals();
    this.plume = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: '#7a5a34', vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.plume.renderOrder = 4;
    this.plume.frustumCulled = false;
    sc.add(this.plume);
    stage.view(this.views.general, false);
  }

  private lateralPath(i: number, wrong: boolean): THREE.Vector3[] {
    const x = HX(i) - 0.6;
    const to = wrong ? STORM : SEWER;
    return [new THREE.Vector3(x, -0.62, -7.6), new THREE.Vector3(x, -0.66, -5.6), new THREE.Vector3(x, -1.35, -5.6), new THREE.Vector3(x, to.y + 0.6, to.z - (wrong ? 1.2 : 0.8)), new THREE.Vector3(x, to.y, to.z)];
  }

  set(v: StreetView): void {
    const prev = this.v;
    this.v = v;
    // laterales: cada casa conectada a su tubo (errada → aguas lluvias)
    if (!prev || prev.wrong !== v.wrong) {
      for (let i = 0; i < N; i++) {
        const curve = new THREE.CatmullRomCurve3(this.lateralPath(i, v.wrong.has(i)), false, 'catmullrom', 0.1);
        this.laterals[i].geometry.dispose();
        this.laterals[i].geometry = new THREE.TubeGeometry(curve, 24, 0.16, 10, false);
      }
      // basura y mugre: posiciones fijas en el carril libre; salen al sumidero según la masa lavada
      const R = rng(55);
      this.items = [];
      const nl = Math.min(90, v.wash.trashItems);
      // manchas de mugre: proporcionales a lo acumulado en la calle (hasta 25 g/m² sin barrido)
      const nd = Math.min(110, Math.round(4 * buildup(v.inp.dryDays, v.inp.sweeping)));
      for (let k = 0; k < nl; k++) this.items.push({ x: -44 + R() * 82, z: -1.2 + R() * 4.5, kind: 'l', leave: 0, rot: R() * 6 });
      for (let k = 0; k < nd; k++) this.items.push({ x: -44 + R() * 82, z: -1.3 + R() * 4.6, kind: 'd', leave: 0, rot: R() * 6 });
    }
    // momento en que cada cosa sale de la calle: cuando la fracción lavada (del total acumulado) alcanza su
    // turno; lo que la lluvia no alcanza a lavar se queda en la calle
    const B0 = Math.max(1e-9, (buildup(v.inp.dryDays, v.inp.sweeping) * STREET.area) / 1000);
    let li = 0, di = 0;
    const nl = this.items.filter((it) => it.kind === 'l').length, nd = this.items.length - nl;
    for (const it of this.items) {
      const rank = it.kind === 'l' ? (li++ + 0.5) / Math.max(1, nl) : (di++ + 0.5) / Math.max(1, nd);
      const m = v.wash.massKg.findIndex((kg) => kg / B0 >= rank);
      it.leave = m < 0 ? Infinity : m + 1;
    }
    // marcas sobre las casas probadas
    for (const c of this.marks.children) {
      (c as THREE.Mesh).geometry.dispose();
      ((c as THREE.Mesh).material as THREE.Material).dispose();
    }
    this.marks.clear();
    for (const [i, wrong] of v.tested) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshStandardMaterial({ color: wrong ? '#d0342c' : '#2f8f55', emissive: new THREE.Color(wrong ? '#501010' : '#0f3a20') }));
      m.position.set(HX(i), this.tops[i] + 0.5, -8);
      m.userData.y0 = this.tops[i] + 0.5;
      this.marks.add(m);
    }
    this.stage.setLabels(this.labels());
  }

  private labels(): StageLabel[] {
    const v = this.v!;
    const out: StageLabel[] = [
      { id: 'sumidero', text: 'Sumidero', at: new THREE.Vector3(DRAIN_X, 1.2, 3.7), kind: 'dato', prio: 4 },
      { id: 'lluvias', text: 'Tubo de aguas lluvias', sub: 'va a la quebrada sin tratar', at: new THREE.Vector3(-30, STORM.y + 0.8, STORM.z + 1.8), kind: 'lugar', prio: 5 },
      { id: 'residuales', text: 'Tubo de aguas residuales', sub: 'va a la planta de tratamiento', at: new THREE.Vector3(-12, SEWER.y + 0.7, SEWER.z + 5.5), kind: 'lugar', prio: 5 },
      { id: 'quebrada', text: 'Quebrada', at: new THREE.Vector3(CREEK_X + 1, CREEK_Y + 2, 16), kind: 'lugar', prio: 3 },
      { id: 'descarga', text: 'Descarga de aguas lluvias', at: new THREE.Vector3(55.2, -4.6, STORM.z), kind: 'dato', prio: 2 },
      { id: 'pozo', text: 'Pozo de inspección', at: new THREE.Vector3(SEWER_MH[2], -1.2, SEWER.z + 1.2), kind: 'dato', prio: 1 },
      { id: 'caja', text: 'Caja de inspección', sub: 'recibe el desagüe de la casa', at: new THREE.Vector3(HX(1) - 0.6, -1.25, -5.6), kind: 'dato', prio: 1 },
    ];
    for (const [i, wrong] of v.tested) out.push({ id: `h-${i}`, text: wrong ? 'Conexión errada' : 'Bien conectada', at: new THREE.Vector3(HX(i), this.tops[i] + 1.9, -8), kind: wrong ? 'alerta' : 'ok', prio: 6 });
    return out;
  }

  /** Empieza el aguacero (la animación dura la duración de la lluvia × SEC_PER_MIN). */
  startRain(): void {
    if (this.stage.reducedMotion && this.v) {
      // sin animación: el resultado de una vez
      this.lastMin = this.v.inp.durationMin;
      this.cb.onRainMinute(this.v.inp.durationMin);
      this.cb.onRainEnd();
      return;
    }
    this.rain = { t0: this.stage.t, min: 0 };
    this.lastMin = -1;
  }

  /** Colorante por el desagüe de la casa i: viaja por su lateral y por el tubo al que está conectada. */
  dye(i: number, wrong: boolean): void {
    const lat = this.lateralPath(i, wrong);
    const x = HX(i) - 0.6;
    const main = wrong
      ? [new THREE.Vector3(x, STORM.y, STORM.z), ...this.stormPath.slice(1)]
      : [new THREE.Vector3(x, SEWER.y, SEWER.z), ...SEWER_PTS.slice(1, 3).map(([a, b, c]) => new THREE.Vector3(a, b, c)), new THREE.Vector3(49.3, SEWER.y, -30)];
    const path = [...lat, ...main.slice(1)];
    const len = [0];
    for (let k = 1; k < path.length; k++) len.push(len[k - 1] + path[k].distanceTo(path[k - 1]));
    this.flow = { path, len, total: len[len.length - 1], t0: this.stage.t, dur: Math.max(2.5, len[len.length - 1] / 26), wrong, house: i };
  }

  private along(f: Flow, s: number, out: THREE.Vector3): THREE.Vector3 {
    const d = Math.max(0, Math.min(f.total, s * f.total));
    let k = 1;
    while (k < f.len.length - 1 && f.len[k] < d) k++;
    const a = f.path[k - 1], b = f.path[k];
    const t = (d - f.len[k - 1]) / Math.max(1e-6, f.len[k] - f.len[k - 1]);
    return out.copy(a).lerp(b, t);
  }

  /** Minuto de lluvia mostrado (o −1 si no llueve). */
  rainMinute(): number {
    return this.rain ? this.rain.min : -1;
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    const v = this.v;
    if (!v) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    // ---- lluvia: minuto simulado
    let minute = Infinity, raining = false;
    if (this.rain) {
      const el = (t - this.rain.t0) / StreetWorld.SEC_PER_MIN;
      minute = Math.floor(el);
      raining = el < v.inp.durationMin;
      this.rain.min = Math.min(v.inp.durationMin, minute);
      if (this.rain.min !== this.lastMin) {
        this.lastMin = this.rain.min;
        this.cb.onRainMinute(this.rain.min);
      }
      if (!raining && el > v.inp.durationMin + 4) {
        this.rain = null;
        this.cb.onRainEnd();
      }
    }
    this.rainPts.visible = raining;
    // cielo de aguacero: gris mientras llueve, se aclara al terminar; las calles se mojan y se secan despacio
    const k = Math.min(1, dt * 1.5 || 0);
    this.sky += ((raining ? 1 : 0) - this.sky) * k;
    this.stage.weather(this.sky);
    this.lit.value = Math.max(0, (this.sky - 0.35) / 0.65);
    this.lamps.emissiveIntensity = 1.6 * this.lit.value;
    const mi = Math.max(0, Math.min(v.wash.t.length - 1, (this.rain ? this.rain.min : 0) - 1));
    const flowing = raining || (this.rain !== null && minute < v.inp.durationMin + 3);
    this.wet.value += ((flowing ? 1 : 0) - this.wet.value) * Math.min(1, dt * (flowing ? 1.2 : 0.18) || 0);
    if (this.stage.reducedMotion) this.wet.value = flowing ? 1 : 0;
    // flechas en los tubos: el de aguas residuales siempre lleva agua; el de aguas lluvias, cuando llueve o
    // cuando hay casas conectadas por error
    this.stormFlow.value = flowing ? 1 : v.wrong.size > 0 ? 0.45 : 0;
    if (this.rain && dt > 0 && raining) {
      const P = this.rainPts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const fall = dt * (16 + v.inp.rainMmH * 0.3);
      for (let j = 0; j < P.count; j += 2) {
        let y = P.getY(j) - fall;
        if (y < -7) y += 37;
        P.setY(j, y);
        P.setY(j + 1, y - 0.9);
      }
      P.needsUpdate = true;
    }
    const q0 = v.wash.flowLs.length ? v.wash.flowLs[mi] : 0;
    this.gutter.visible = flowing;
    if (flowing) {
      const c = new THREE.Color();
      const conc = v.wash.conc[mi] ?? 0;
      c.setRGB(0.36, 0.52, 0.6).lerp(new THREE.Color(0.5, 0.4, 0.27), Math.min(1, conc / 600));
      for (let j = 0; j < this.gutterCol.length; j += 3) this.gutterCol.set([c.r, c.g, c.b], j);
      (this.gutter.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      this.gutter.scale.z = 0.5 + Math.min(0.6, q0 / 25);
    }
    // ---- basura y mugre: se quedan hasta su minuto; luego corren por la cuneta al sumidero
    let il = 0, id = 0;
    for (const it of this.items) {
      const mesh = it.kind === 'l' ? this.litter : this.dirt;
      const idx = it.kind === 'l' ? il++ : id++;
      let x = it.x, z = it.z, y = it.kind === 'l' ? 0.05 : 0.012;
      if (this.rain && minute >= it.leave) {
        const tt = (t - this.rain.t0 - it.leave * StreetWorld.SEC_PER_MIN) * 1.2;
        const toCurb = Math.min(1, tt / 0.8);
        z = it.z + (3.65 - it.z) * toCurb;
        const along = Math.max(0, tt - 0.8) * 9;
        x = Math.min(DRAIN_X, it.x + along);
        if (x >= DRAIN_X) {
          mesh.setMatrixAt(idx, zero);
          continue;
        }
        y = 0.06;
      } else if (!this.rain && this.lastMin >= 0 && it.leave <= v.inp.durationMin) {
        // ya llovió: lo que se lavó no vuelve hasta que se reinicie la cuadra
        mesh.setMatrixAt(idx, zero);
        continue;
      }
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
      mesh.setMatrixAt(idx, m4.compose(p.set(x, y, z), q, s.setScalar(it.kind === 'd' ? 1 + (it.rot % 1) : 1)));
    }
    for (; il < this.litter.count; il++) this.litter.setMatrixAt(il, zero);
    for (; id < this.dirt.count; id++) this.dirt.setMatrixAt(id, zero);
    this.litter.instanceMatrix.needsUpdate = true;
    this.dirt.instanceMatrix.needsUpdate = true;
    // ---- pluma en la quebrada: lavado de la calle (lluvia), agua usada (conexiones erradas) o colorante
    const pm = this.plume.material as THREE.MeshBasicMaterial;
    const conc = flowing ? v.wash.conc[mi] ?? 0 : 0;
    const sewage = v.wrong.size > 0 ? 0.5 + 0.4 * Math.min(1, v.wrong.size / 8) : 0;
    let strength = Math.max(flowing ? Math.min(1, 0.3 + conc / 400) : 0, sewage);
    let col = flowing && conc > 30 ? '#a57b45' : '#9a875e';
    if (this.dyePlume > 0) {
      strength = Math.min(1, this.dyePlume);
      col = '#e0218a';
      this.dyePlume -= dt * 0.18;
    }
    pm.color.set(col);
    this.plume.visible = strength > 0.02;
    if (this.plume.visible) {
      const A = this.plumeA, U = this.plumeUV;
      for (let j = 0; j < A.length / 4; j++) {
        const sl = U[j * 2], vv = U[j * 2 + 1];
        const puff = 0.72 + 0.28 * noise2(sl * 9 - t * 0.9, vv * 1.6 + 3);
        A[j * 4 + 3] = 0.95 * strength * Math.pow(1 - sl, 1.4) * Math.pow(Math.max(0, 1 - vv * vv), 1.3) * puff * Math.min(1, sl * 30 + 0.3);
      }
      (this.plume.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }
    // ---- colorante
    const f = this.flow;
    if (f) {
      const el = (t - f.t0) / f.dur;
      for (let j = 0; j < this.dyeDots.count; j++) {
        const sk = el - j * 0.012;
        if (sk < 0 || sk > 1) {
          this.dyeDots.setMatrixAt(j, zero);
          continue;
        }
        this.dyeDots.setMatrixAt(j, m4.compose(this.along(f, sk, p), q.identity(), s.setScalar(1)));
      }
      this.dyeDots.instanceMatrix.needsUpdate = true;
      if (el > 1 + this.dyeDots.count * 0.012) {
        if (f.wrong) this.dyePlume = 1.2;
        this.flow = null;
        this.cb.onDyeEnd(f.house, f.wrong);
        for (let j = 0; j < this.dyeDots.count; j++) this.dyeDots.setMatrixAt(j, zero);
        this.dyeDots.instanceMatrix.needsUpdate = true;
      }
      // con «movimiento reducido» el tiempo no avanza: se termina de una vez
      if (this.stage.reducedMotion) {
        this.flow = null;
        if (f.wrong) this.dyePlume = 1.2;
        this.cb.onDyeEnd(f.house, f.wrong);
      }
    }
    for (const mk of this.marks.children) mk.position.y = (mk.userData.y0 as number) + 0.25 * Math.sin(t * 2 + mk.position.x);
  }

  /** Para la lluvia y vuelve a poner la basura y la mugre en la calle. */
  resetStreet(): void {
    this.rain = null;
    this.lastMin = -1;
    if (this.v) this.set({ ...this.v });
  }
}

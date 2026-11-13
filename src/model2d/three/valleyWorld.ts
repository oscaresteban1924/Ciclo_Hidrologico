// El valle en 3D para la sala «Modelación hidráulica 2D»: el terreno como lo ve el modelo (liso o en píxeles cuando
// son gruesos), con el aspecto de cada cobertura (ver valleyLook.ts) o coloreado por altura, por cobertura o por n,
// sobre un zócalo con las capas del suelo; las casas de barrio con sus fachadas y techos, los árboles y las matas, las
// calles con andenes y la vía con su puente; el corte del terreno; la malla de cálculo (también la refinada) con las líneas de quiebre y las
// condiciones de borde; la celda que se inspecciona con su agua por dentro (subgrid) y el caudal de sus caras; y el
// agua de los resultados.
//
// El agua se dibuja con su aspecto (turbia, con ondas que avanzan con la corriente, espuma donde el flujo es rápido y
// en la orilla, reflejos del cielo) o coloreada por profundidad, velocidad, cota, amenaza, llegada, Courant, error de
// iteración, probabilidad o zonas. En el tiempo, el agua pasa de un mapa guardado al siguiente sin saltos, deja barro
// donde ya bajó y manchas en los muros de las casas; la lluvia sigue el hietograma y la rotura del jarillón se abre
// cuando la abrió el modelo. Las partículas dejan estela y un clic puede soltar tinta que sigue la corriente. Al pasar
// el puntero, una lectura dice el suelo, el agua y la velocidad del punto. Sirve también para un terreno propio. El
// relieve se puede exagerar y la escena lo dice: el agua y el terreno se estiran lo mismo (las ondas y la espuma son
// solo de la superficie: no cambian la profundidad).

import * as THREE from 'three';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { RainStreaks, strataWall, studioFloor, trees, type TreeSpot } from '../../three/scenery';
import { paint } from '../../three/machines';
import { bushes, groundMaterial, valleyHouses, type BushSpot, type HouseSpec } from './valleyLook';
import { LOOK_TIME, lookMaterial } from '../../three/look';
import { BASE_WATER, COVER_KEYS, COVERS, LEVEE, NX as VNX, NY as VNY, ROAD, ROAD_Z, S0, Z0, bedZ, truth, yc, type Raster } from '../terrain';
import { LOW_CHORD, cellFaces, hyetograph, type BcLine, type Geometry, type RunResult } from '../solver';
import { hazardClass } from '../scene';

export type ColorBy = 'altura' | 'natural' | 'cobertura' | 'n';
export type Layer = 'natural' | 'profundidad' | 'velocidad' | 'cota' | 'amenaza' | 'llegada' | 'courant' | 'iteraciones' | 'probabilidad' | 'zonas';
/** Qué hace un clic en la escena: poner la sonda (o elegir la celda) o soltar tinta. */
export type ClickTool = 'sonda' | 'tinta';

export interface PlanLabel {
  id: string;
  text: string;
  sub?: string;
  x: number;
  y: number;
  /** Altura sobre el terreno [m]. */
  up?: number;
  kind?: StageLabel['kind'];
  prio?: number;
}

/** Un terreno propio: cotas por píxel (NaN sin dato) y tamaño del píxel. */
export interface SiteView {
  id: string;
  NX: number;
  NY: number;
  px: number;
  z: Float32Array;
}

export interface WaterState {
  res: RunResult | null;
  /** Mapa que se muestra: índice de los mapas guardados (con decimales: entre dos mapas) o null para los máximos. */
  frame: number | null;
  layer: Layer;
  /** Mientras calcula: el último mapa de niveles y su geometría. */
  live?: { frame: Float32Array; geom: Geometry } | null;
  /** Valores por celda (probabilidad de inundación entre 0 y 1). */
  values?: Float32Array | null;
  /** Clase de zona por celda (0 sin, 1 baja, 2 media, 3 alta). */
  zones?: Uint8Array | null;
  particles?: boolean;
}

/** Una marca de agua (calibración): cota observada y la del modelo [m]. */
export interface MarkPost {
  id: string;
  x: number;
  y: number;
  obs: number;
  model: number | null;
}

export interface ValleyState {
  /** Exageración vertical del relieve. */
  vex: number;
  /** Terreno que se dibuja (por píxel) y, si es grueso, su ráster para dibujarlo en píxeles. */
  fine: Float32Array;
  raster: Raster | null;
  colorBy: ColorBy;
  /** n por píxel (para colorear por n). */
  n?: Float32Array | null;
  /** Casas y árboles como objetos (sobre el MDT); 'fantasma' = solo su contorno. */
  objects: 'si' | 'no' | 'fantasma';
  section: number | null;
  /** Malla: lado de base o la geometría (también refinada). */
  mesh: { c: number; geom?: Geometry | null } | null;
  breaklines: boolean;
  bc: boolean;
  bcLines?: BcLine[] | null;
  cell: { c: number; ci: number; geom: Geometry; eta: number } | null;
  /** Caudal por las caras de la celda marcada (flechas), con los mapas de la corrida que se ve. */
  cellFlux?: boolean;
  water: WaterState | null;
  labels: PlanLabel[];
  /** Terreno propio (si no, el valle). */
  site?: SiteView | null;
  /** El puente como estructura: cara inferior del tablero y fracción de la luz tapada. */
  bridge?: { low: number; block: number } | null;
  /** Daño de cada casa (0 a 1) para colorearlas. */
  damage?: Float32Array | null;
  /** Sonda: un punto marcado en el plano. */
  probe?: { x: number; y: number } | null;
  /** Líneas para medir caudal (en metros). */
  lines?: { x0: number; y0: number; x1: number; y1: number; color: string }[] | null;
  /** Lluvia sin corrida (por ejemplo antes de calcular): se ve caer. Con una corrida, la lluvia sigue su hietograma. */
  rain?: boolean;
  /** El jarillón roto: terreno antes de la rotura (`fine` es el de después); la escena lo baja al reproducir. */
  breach?: { before: Float32Array } | null;
  /** Marcas de agua de la calibración. */
  marks?: MarkPost[] | null;
  /** Qué hace un clic. */
  tool?: ClickTool;
}

const COLORS = {
  natural: ['#a27746', '#8a6439', '#71502d', '#563c22'],
  depth: ['#d6ecf8', '#7fbbe2', '#2f7fb8', '#0f4c86', '#062a52'],
  vel: ['#efe6f7', '#c5a6e3', '#9168c8', '#5f3a9e', '#331e5e'],
  wse: ['#cfe7f2', '#6fb0d4', '#2a78b0', '#174d80'],
  arrival: ['#0f4c5c', '#2a8090', '#6fb6bf', '#c9e7ea'],
  hazard: ['#d6ecf8', '#fff1b8', '#fdd27a', '#f6a54b', '#e3702f', '#c0412b', '#7d1f24'],
  courant: ['#e6f2e8', '#a9d3a0', '#f2d36b', '#e88b3a', '#b8322a'],
  error: ['#eef1f5', '#c3cfdc', '#f0c36a', '#d9682e', '#8f2420'],
  prob: ['#e9f1f8', '#a8cbe6', '#5a9bd0', '#2a63a8', '#1a3570'],
  zones: ['#d6ecf8', '#f3e19a', '#eea055', '#c0412b'],
  damage: ['#efe7da', '#f3d38a', '#e98b4a', '#b8322a'],
};
/** Agua del caudal base: verdosa y clara. */
const BASE_COLOR = new THREE.Color('#5f8a84');
const MUD = new THREE.Color('#7d6748');
function ramp(stops: string[], t: number, out: THREE.Color): THREE.Color {
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(u));
  return out.set(stops[k]).lerp(TMP.set(stops[k + 1]), u - k);
}
const TMP = new THREE.Color();
export const LAYER_RAMPS = COLORS;

const own = <M extends THREE.Material>(m: M): M => {
  m.userData.own = true;
  return m;
};
function clear(g: THREE.Object3D): void {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mt of mats) if (mt.userData.own) mt.dispose();
    });
  }
}
const fmt = (v: number, d = 2) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Color del relieve del valle: la cota sobre el plano del fondo del valle (el cauce oscuro, la llanura verde, las
 * obras y las laderas claras), así se lee el relieve aunque el valle baje 3 m de punta a punta. */
function heightColor(z: number, x: number, out: THREE.Color): THREE.Color {
  const r = z - (Z0 - S0 * x);
  const t = (r + 2.6) / 18;
  return ramp(['#4f6e74', '#6f8f6a', '#86a65b', '#9db760', '#c9be84', '#d2b98a', '#b79f78', '#a08e74'], Math.pow(Math.max(0, t), 0.6), out);
}
const HYPSO = ['#4f6e74', '#6f8f6a', '#9db760', '#c9be84', '#b79f78', '#a08e74', '#d8d2c6'];
const COVER_COLORS = COVER_KEYS.map((c) => new THREE.Color(COVERS[c].color));
/** Colores naturales (para las partes que no colorean datos). */
const NATURAL = COVER_KEYS.map((c) => new THREE.Color(({ cauce: '#7d7461', pasto: '#8db35e', cultivo: '#b9b56a', rastrojo: '#7f9c56', bosque: '#5f8a4a', via: '#9a9894', edificio: '#b8a99a' } as Record<string, string>)[c]));
function nColor(n: number, out: THREE.Color): THREE.Color {
  const t = (Math.log(n) - Math.log(0.013)) / (Math.log(0.25) - Math.log(0.013));
  return ramp(['#f3f1e6', '#d9e2b6', '#9fbf7a', '#5f8f4c', '#2f5a2c'], t, out);
}
/** Muros de las casas: los colores de un barrio antioqueño (crema, terracota, verde agua, mostaza, rosa viejo,
 * azul cielo, blanco, verde claro); la escuela, blanca con zócalo azul. */
const WALLS = ['#e9d8b4', '#d98c5f', '#7fb3a6', '#e6b655', '#c96f6a', '#9ec1d9', '#f1efe8', '#b5c98f', '#e8c9a0', '#d7a86e'];
const ROOF_TILE = ['#a6503a', '#9a4a34', '#b25d40', '#8c4632', '#b8613f'];
const ROOF_SLAB = ['#bdb6aa', '#a9a49b', '#c6beb0'];
const markOwn = (o: THREE.Object3D) =>
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material;
    if (m) for (const mt of Array.isArray(m) ? m : [m]) mt.userData.own = true;
  });

/** Factor de las partículas: van este número de veces más rápido que el agua. */
export const PARTICLE_SPEED = 6;
/** Partículas que siguen la corriente y puntos de estela de cada una (un punto cada `TRAIL_DT` s). */
const NP = 700;
const TRAIL = 7;
const TRAIL_DT = 0.07;
/** Tinta: partículas, puntos de estela y vida máxima [s]. */
const ND = 720;
const DTRAIL = 14;
const DLIFE = 50;

// ------------------------------------------------------------------ sombreador del agua

const NOISE = /* glsl */ `
float m2H(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float m2N(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(m2H(i), m2H(i + vec2(1.0, 0.0)), u.x), mix(m2H(i + vec2(0.0, 1.0)), m2H(i + vec2(1.0, 1.0)), u.x), u.y); }
float m2F(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 3; k++) { s += a * m2N(p); p = p * 2.07 + vec2(17.1, 9.2); a *= 0.5; } return s; }
`;

/**
 * Agua de creciente: las ondas avanzan con la velocidad de cada punto (mapa de flujo en dos fases, alargado en la
 * dirección de la corriente), la espuma aparece donde el flujo es rápido (número de Froude alto) y en la orilla, y el
 * cielo se refleja más en ángulo rasante. `uDetail` baja todo eso cuando el agua muestra un dato (profundidad,
 * amenaza…), para que el color se lea. Solo cambia el color y las normales: la superficie queda a su cota.
 */
interface WaterUniforms {
  uDetail: { value: number };
  uSc: { value: number };
  /** Colores del cielo que se refleja: en el horizonte (ángulo rasante) y arriba (mirando de frente). */
  uSky: { value: THREE.Color };
  uSkyTop: { value: THREE.Color };
  /** Reflejo de frente, reflejo rasante y contraste de las vetas de la corriente (w sin uso). */
  uTune: { value: THREE.Vector4 };
}

function floodWaterMaterial(u: WaterUniforms): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.16, metalness: 0, envMapIntensity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  m.userData.noLook = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = LOOK_TIME;
    sh.uniforms.uDetail = u.uDetail;
    sh.uniforms.uSc = u.uSc;
    sh.uniforms.uSky = u.uSky;
    sh.uniforms.uSkyTop = u.uSkyTop;
    sh.uniforms.uTune = u.uTune;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFlow;\nattribute float aDepth;\nattribute float aFoam;\nvarying vec2 vFlow;\nvarying float vDepth;\nvarying float vFoam;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = aFlow; vDepth = aDepth; vFoam = aFoam;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uDetail;\nuniform float uSc;\nuniform vec3 uSky;\nuniform vec3 uSkyTop;\nuniform vec4 uTune;\nvarying vec2 vFlow;\nvarying float vDepth;\nvarying float vFoam;\nvarying vec3 vWPos;\nfloat m2Foam = 0.0;\nfloat m2H0 = 0.0, m2Hx = 0.0, m2Hz = 0.0, m2K = 0.0;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // posición en metros y velocidad en el plano del mundo (x hacia el este, z hacia el sur)
          vec2 P = vWPos.xz / uSc;
          vec2 fl = vec2(vFlow.x, -vFlow.y);
          float sp = length(fl);
          vec2 dir = sp > 0.02 ? fl / sp : vec2(0.8, 0.6);
          // la corriente visible (las ondas se mueven con el agua, a su velocidad real)
          float T = 2.2;
          float t0 = fract(uTime / T), t1 = fract(uTime / T + 0.5);
          float w0 = 1.0 - abs(1.0 - 2.0 * t0), w1 = 1.0 - w0;
          vec2 drift = vec2(0.05, 0.03) * uTime;
          vec2 o0 = fl * t0 * T + drift, o1 = fl * t1 * T + drift;
          mat2 R = mat2(dir.x, -dir.y, dir.y, dir.x);
          vec2 st = vec2(0.32, 0.85) / (1.0 + 0.25 * min(sp, 4.0));
          vec2 e = vec2(0.18, 0.0);
          #define M2W(p) (m2F(R * ((p) - o0) * st) * w0 + m2F(R * ((p) - o1) * st + 3.7) * w1)
          m2H0 = M2W(P);
          m2Hx = M2W(P + e.xy);
          m2Hz = M2W(P + e.yx);
          #undef M2W
          // lejos (más de un metro por píxel) el dibujo fino se apaga: no se ve como ruido
          float m2Near = 1.0 - smoothstep(0.35, 1.3, length(fwidth(P)));
          m2K = uDetail * (0.25 + 0.75 * clamp(sp / 1.4, 0.0, 1.0)) * m2Near;
          // orilla: espuma fina donde el agua es muy poca; corriente rápida: crestas blancas
          // la línea de la orilla: unos pocos píxeles desde donde la profundidad es cero (en una charca plana toda la
          // lámina es delgada: la espuma no la cubre entera, solo marca el borde)
          float dpx = vDepth / max(fwidth(vDepth), 1e-5);
          float shore = (1.0 - smoothstep(1.0, 3.5, dpx)) * smoothstep(0.0, 0.004, vDepth) * (1.0 - smoothstep(0.06, 0.12, vDepth));
          float fn = m2F(P * 0.9 - fl * t0 * T * 1.1 + 5.1) * w0 + m2F(P * 0.9 - fl * t1 * T * 1.1 + 9.4) * w1;
          float flowFoam = clamp(vFoam, 0.0, 1.0) * smoothstep(0.46, 0.82, fn * 0.55 + m2H0 * 0.55) * 0.6;
          // de lejos, la espuma de la corriente es un velo parejo donde el flujo es rápido
          flowFoam = mix(clamp(vFoam, 0.0, 1.0) * 0.14, flowFoam, m2Near);
          m2Foam = max(shore * (0.45 + 0.55 * smoothstep(0.45, 0.66, fn)) * 0.55, flowFoam) * uDetail;
          // el agua poca deja ver el fondo; la honda es más opaca
          // el agua turbia de una creciente casi no deja ver el fondo: solo la lámina muy delgada es transparente
          float deep = 1.0 - exp(-max(vDepth, 0.0) / 0.25);
          diffuseColor.a *= mix(mix(1.0, 0.9, uDetail), 1.0, deep) * smoothstep(-0.002, 0.006, vDepth);
          diffuseColor.rgb *= 1.0 + (m2H0 - 0.5) * uTune.z * m2K;
          // vetas grandes de sedimento que la corriente arrastra (se ven también de lejos)
          float plume = m2F((P - o0) * 0.035 + 1.7) * w0 + m2F((P - o1) * 0.035 + 5.3) * w1;
          diffuseColor.rgb *= 1.0 + (plume - 0.5) * 0.24 * uDetail * step(0.999, uDetail);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.72, 0.6), m2Foam * 0.8);
          diffuseColor.a = mix(diffuseColor.a, 0.96, m2Foam * 0.8);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 m2P = vec3(-(m2Hx - m2H0), 0.0, -(m2Hz - m2H0)) / 0.18 * m2K * 0.55;
          normal = normalize(normal + (viewMatrix * vec4(m2P, 0.0)).xyz);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // reflejo del cielo: un poco siempre (la lámina es lisa) y más en ángulo rasante; destellos del sol en las ondas
          vec3 m2V = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(abs(dot(normal, m2V)), 0.0, 1.0), 3.0);
          // el cielo reflejado: azul arriba y claro hacia el horizonte (lo lejano y lo rasante se ve más claro)
          vec3 m2R = (vec4(reflect(-m2V, normal), 0.0) * viewMatrix).xyz;
          vec3 skyR = mix(uSky, uSkyTop, pow(clamp(m2R.y, 0.0, 1.0), 0.7));
          outgoingLight = mix(outgoingLight, skyR * (0.9 + 0.25 * m2H0 * m2K), (uTune.x + fr * uTune.y) * uDetail * (1.0 - m2Foam));
          outgoingLight += vec3(1.0, 0.97, 0.9) * pow(max(0.0, m2H0 - 0.55) * 2.2, 6.0) * 0.35 * m2K;
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'm2flood2';
  return m;
}

// ------------------------------------------------------------------ el mundo

/** Para cada vértice de la grilla de dibujo: su celda, las cuatro celdas vecinas con sus pesos y la cota del píxel. */
interface Sampler {
  key: string;
  own: Int32Array;
  nb: Int32Array;
  w: Float32Array;
  zm: Float32Array;
}

/** Una casa: su planta [m], la cota del suelo y las celdas bajo ella. */
interface House {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  zb: number;
  cells: number[];
}

/** Tiempos por vértice de una corrida con mapas: primer mapa con agua (barro) y llegada de 10 cm [s]. */
interface Timing {
  key: string;
  firstWet: Float32Array;
  arrival: Float32Array;
}

export class ValleyWorld {
  private stage: QStage;
  private st: ValleyState | null = null;
  private terrainG = new THREE.Group();
  /** Zócalo de la maqueta (corte con estratos) y piso de estudio: fuera de lo que se toca. */
  private plinthG = new THREE.Group();
  private objectsG = new THREE.Group();
  private ghostG = new THREE.Group();
  private sectionG = new THREE.Group();
  private meshG = new THREE.Group();
  private bcG = new THREE.Group();
  private cellG = new THREE.Group();
  private bridgeG = new THREE.Group();
  private markG = new THREE.Group();
  private postG = new THREE.Group();
  private stainG = new THREE.Group();
  private arrowG = new THREE.Group();
  private breachG = new THREE.Group();
  private water!: THREE.Mesh;
  private waterPos!: Float32Array;
  private waterCol!: Float32Array;
  private waterFlow!: Float32Array;
  private waterDepth!: Float32Array;
  private waterFoam!: Float32Array;
  private waterU: WaterUniforms = {
    uDetail: { value: 1 },
    uSc: { value: 0.5 },
    uSky: { value: new THREE.Color('#c9dbe6') },
    uSkyTop: { value: new THREE.Color('#7ea7cc') },
    uTune: { value: new THREE.Vector4(0.0, 0.28, 0.28, 1) },
  };
  private terrainMat: THREE.MeshStandardMaterial;
  private terrainFlat: THREE.MeshStandardMaterial;
  /** Suelo con la textura de cada cobertura (vista natural del valle). */
  private groundMat: THREE.MeshStandardMaterial;
  private groundSc = { value: 0.5 };
  // el dominio: píxeles, tamaño del píxel, paso de la grilla de dibujo y escala
  private NX = VNX;
  private NY = VNY;
  private px = 1;
  private step = 2;
  private GX = VNX / 2 + 1;
  private GY = VNY / 2 + 1;
  private sc = 0.5;
  private zref = 1472;
  private zlo = 0;
  private zhi = 1;
  private siteId = 'valle';
  /** Alturas del terreno dibujado en la grilla (sin exagerar). */
  private gz = new Float32Array(this.GX * this.GY);
  private keys: Record<string, string> = {};
  private sampler: Sampler | null = null;
  private timing: Timing | null = null;
  readonly views: Record<string, StageView> = {};
  private framed = false;
  private sectionX = 250;
  // mapas interpolados en el tiempo
  private etaI = new Float32Array(0);
  private uI = new Float32Array(0);
  private vI = new Float32Array(0);
  private qI = new Float32Array(0);
  // partículas con estela, tinta y lluvia
  private parts: THREE.LineSegments;
  private pp = new Float32Array(NP * TRAIL * 3);
  private pAge = new Float32Array(NP);
  private pClock = 0;
  private dye: THREE.LineSegments;
  private dyeHeads: THREE.Points;
  private dp = new Float32Array(ND * DTRAIL * 3);
  private dAge = new Float32Array(ND).fill(-1);
  private dNext = 0;
  private dClock = 0;
  private rain: RainStreaks;
  private weatherK = 0;
  private weatherShown = 0;
  /** Último estado del agua dibujado (para las partículas y la lectura). */
  private flow: { geom: Geometry; eta: ArrayLike<number>; u: ArrayLike<number>; v: ArrayLike<number> } | null = null;
  /** Tiempo [s] del mapa que se ve (null = máximos). */
  private tNow: number | null = null;
  // casas: manchas de barro en los muros
  private houses: House[] = [];
  private stains: { body: THREE.Mesh; line: THREE.Mesh }[] = [];
  private houseLevel: { key: string; lv: Float32Array[]; max: Float32Array } | null = null;
  // rotura que se abre en el tiempo
  private breachMesh: THREE.Mesh | null = null;
  private breachData: { v: Int32Array; before: Float32Array; after: Float32Array; pos: Float32Array; col: Float32Array; base: Float32Array; ground: boolean } | null = null;
  // lectura al pasar el puntero
  private ray = new THREE.Raycaster();
  private hoverAt = 0;
  /** Clic en el terreno o el agua (con la herramienta «sonda»): punto del plano [m]. */
  onProbe: ((x: number, y: number) => void) | null = null;
  /** Aviso de lo que hizo un clic (por ejemplo, que no hay corriente para la tinta). */
  onNotice: ((text: string) => void) | null = null;
  /** Encuadres en el plano: punto mirado (x, y en m) y desplazamiento del ojo en unidades del mundo. */
  private static FRAMES: Record<string, { at: [number, number]; eye: [number, number, number]; fit: number; portrait?: [number, number, number] }> = {
    valle: { at: [320, 205], eye: [70, 150, 215], fit: 330, portrait: [40, 260, 300] },
    barrio: { at: [300, 262], eye: [30, 62, 80], fit: 150 },
    puente: { at: [ROAD.x - 10, 0], eye: [58, 34, 72], fit: 95 },
    malla: { at: [250, 222], eye: [10, 78, 62], fit: 110 },
    entrada: { at: [8, 205], eye: [-48, 42, 62], fit: 110 },
    rotura: { at: [300, 0], eye: [-20, 46, 70], fit: 100 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(190);
    stage.controls.minDistance = 4;
    stage.controls.maxDistance = 520;
    // el relieve con grano fino, manchas y sombras de nubes que pasan; colores de categorías (coberturas, n) sin ellos
    this.terrainMat = lookMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), { detail: 0.08, patches: 0.1, clouds: [0.13, 95] });
    this.terrainFlat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.terrainFlat.userData.noLook = true;
    this.groundMat = groundMaterial(this.groundSc);
    this.makeWater();
    // partículas con estela (segmentos con transparencia que se desvanece) y tinta
    const mkTrails = (n: number, k: number, color: THREE.Color) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * (k - 1) * 6), 3));
      const col = new Float32Array(n * (k - 1) * 8);
      for (let p = 0; p < n; p++)
        for (let q = 0; q < k - 1; q++) {
          const a0 = 1 - q / (k - 1), a1 = 1 - (q + 1) / (k - 1);
          col.set([color.r, color.g, color.b, a0 * a0, color.r, color.g, color.b, a1 * a1], (p * (k - 1) + q) * 8);
        }
      g.setAttribute('color', new THREE.BufferAttribute(col, 4));
      const m = own(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      m.userData.noLook = true;
      const l = new THREE.LineSegments(g, m);
      l.frustumCulled = false;
      l.visible = false;
      return l;
    };
    // partículas: estelas claras y discretas (marcan la corriente sin parecer pintura de vía)
    this.parts = mkTrails(NP, TRAIL, new THREE.Color('#fbf6ea'));
    (this.parts.material as THREE.LineBasicMaterial).opacity = 0.42;
    this.parts.renderOrder = 6;
    this.dye = mkTrails(ND, DTRAIL, new THREE.Color('#ff6a2b'));
    this.dye.renderOrder = 7;
    (this.dye.material as THREE.LineBasicMaterial).depthTest = false;
    // la cabeza de cada gota de tinta (se ve apenas se suelta, antes de que la corriente dibuje la estela)
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ND * 3).fill(-9999), 3));
    const hm = own(new THREE.PointsMaterial({ color: '#ff6a2b', size: 4, sizeAttenuation: false, transparent: true, opacity: 0.9, depthTest: false }));
    hm.userData.noLook = true;
    this.dyeHeads = new THREE.Points(hg, hm);
    this.dyeHeads.frustumCulled = false;
    this.dyeHeads.renderOrder = 8;
    this.dye.add(this.dyeHeads);
    this.pAge.fill(-1);
    // lluvia con salpicaduras (sigue al dominio: la caja se ajusta al cambiar de terreno)
    this.rain = this.makeRain();
    sc.add(this.terrainG, this.plinthG, this.objectsG, this.ghostG, this.sectionG, this.meshG, this.bcG, this.cellG, this.bridgeG, this.markG, this.postG, this.stainG, this.arrowG, this.breachG, this.water, this.parts, this.dye, this.rain.group);
    const pick = (pt: THREE.Vector3) => this.click(this.px0(pt.x), this.py0(pt.z));
    stage.addPick(this.terrainG, pick, 'Toca para poner una sonda');
    stage.addPick(this.water, pick, 'Toca para poner una sonda');
    this.makeReadout();
    this.updateViews();
    stage.view(this.views.valle, false);
  }

  private get W() {
    return this.NX * this.px;
  }
  private get H() {
    return this.NY * this.px;
  }
  /** Del plano [m] al mundo y de vuelta. */
  wx(x: number) {
    return (x - this.W / 2) * this.sc;
  }
  wz(y: number) {
    return -(y - this.H / 2) * this.sc;
  }
  private px0(X: number) {
    return X / this.sc + this.W / 2;
  }
  private py0(Z: number) {
    return -Z / this.sc + this.H / 2;
  }

  private makeRain(): RainStreaks {
    const box = { x0: this.wx(0), x1: this.wx(this.W), z0: this.wz(this.H), z1: this.wz(0), top: this.Y(this.zref) + 75 * this.sc * 2 };
    const r = new RainStreaks(box, (X, Z) => this.Y(this.zAt(this.px0(X), this.py0(Z))), 2600, 62, 2.6, [0.1, 0.03], 0.55);
    r.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.userData.noLook = true;
    });
    return r;
  }

  private makeWater(): void {
    if (this.water) {
      this.stage.scene.remove(this.water);
      this.water.geometry.dispose();
    }
    const { GX, GY } = this;
    const wg = new THREE.BufferGeometry();
    this.waterPos = new Float32Array(GX * GY * 3);
    this.waterCol = new Float32Array(GX * GY * 4);
    this.waterFlow = new Float32Array(GX * GY * 2);
    this.waterDepth = new Float32Array(GX * GY);
    this.waterFoam = new Float32Array(GX * GY);
    const nor = new Float32Array(GX * GY * 3);
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        const v = j * GX + i;
        this.waterPos[v * 3] = this.wx(Math.min(this.W, i * this.step));
        this.waterPos[v * 3 + 2] = this.wz(Math.min(this.H, j * this.step));
        nor[v * 3 + 1] = 1;
      }
    wg.setAttribute('position', new THREE.BufferAttribute(this.waterPos, 3));
    // la superficie es casi plana: normales hacia arriba (las ondas las pone el sombreador)
    wg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    wg.setAttribute('color', new THREE.BufferAttribute(this.waterCol, 4));
    wg.setAttribute('aFlow', new THREE.BufferAttribute(this.waterFlow, 2));
    wg.setAttribute('aDepth', new THREE.BufferAttribute(this.waterDepth, 1));
    wg.setAttribute('aFoam', new THREE.BufferAttribute(this.waterFoam, 1));
    wg.index = gridIndex(GX, GY);
    this.waterU.uSc.value = this.sc;
    if (this.water) {
      this.water.geometry = wg;
      this.stage.scene.add(this.water);
    } else {
      this.water = new THREE.Mesh(wg, floodWaterMaterial(this.waterU));
      this.water.renderOrder = 3;
      this.water.visible = false;
    }
  }

  /** Cambia de dominio (el valle o un terreno propio): escala, grilla y encuadres. */
  private setDomain(site: SiteView | null | undefined): boolean {
    const id = site ? `${site.id}|${site.NX}|${site.NY}|${site.px}` : 'valle';
    if (id === this.siteId) return false;
    this.siteId = id;
    if (site) {
      this.NX = site.NX;
      this.NY = site.NY;
      this.px = site.px;
      const L = Math.max(this.W, this.H);
      this.step = site.px * Math.max(1, Math.ceil(L / (320 * site.px)));
      this.sc = 320 / L;
      let lo = Infinity, hi = -Infinity;
      for (const v of site.z)
        if (!Number.isNaN(v)) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      this.zlo = lo;
      this.zhi = Math.max(lo + 1, hi);
      this.zref = lo - 2;
    } else {
      this.NX = VNX;
      this.NY = VNY;
      this.px = 1;
      this.step = 2;
      this.sc = 0.5;
      this.zref = 1472;
    }
    this.GX = Math.floor(this.W / this.step) + 1 + (this.W % this.step ? 1 : 0);
    this.GY = Math.floor(this.H / this.step) + 1 + (this.H % this.step ? 1 : 0);
    this.gz = new Float32Array(this.GX * this.GY);
    this.makeWater();
    this.stage.scene.remove(this.rain.group);
    this.rain = this.makeRain();
    this.stage.scene.add(this.rain.group);
    this.framed = false;
    this.sampler = null;
    this.timing = null;
    this.clearDye();
    return true;
  }

  /** Recalcula los encuadres con el relieve dibujado (cambian con la exageración vertical). */
  private updateViews(): void {
    const look = (x: number, y: number, eye: [number, number, number], fit: number, portrait?: [number, number, number]): StageView => {
      const ty = this.Y(this.zAt(x, y)) + 1;
      const t: [number, number, number] = [this.wx(x), ty, this.wz(y)];
      const v: StageView = { eye: [t[0] + eye[0], ty + eye[1], t[2] + eye[2]], target: t, fit };
      if (portrait) v.portrait = { eye: [t[0] + portrait[0], ty + portrait[1], t[2] + portrait[2]], target: t };
      return v;
    };
    if (this.siteId !== 'valle') {
      const W = this.W, H = this.H;
      const ar = (this.H * this.sc) / 200;
      this.views.valle = look(W / 2, H / 2, [70, 150 * Math.max(0.8, ar), 215 * Math.max(0.8, ar)], 330, [40, 260, 300]);
      this.views.cerca = look(W / 2, H / 2, [30, 70, 95], 160);
      return;
    }
    for (const [id, f] of Object.entries(ValleyWorld.FRAMES)) this.views[id] = look(f.at[0], id === 'puente' ? yc(ROAD.x) : id === 'rotura' ? yc(300) + LEVEE.dn : f.at[1], f.eye, f.fit, f.portrait);
    this.views.corte = look(this.sectionX, yc(this.sectionX), [78, 20, 10], 85);
    if (!this.views.celda) this.views.celda = look(250, 220, [12, 26, 30], 40);
  }

  private Y(z: number): number {
    return (z - this.zref) * this.sc * (this.st?.vex ?? 1);
  }

  /** Altura del terreno dibujado en un punto del plano [m s. n. m.]. */
  private zAt(x: number, y: number): number {
    const i = Math.max(0, Math.min(this.GX - 1, Math.round(x / this.step))), j = Math.max(0, Math.min(this.GY - 1, Math.round(y / this.step)));
    return this.gz[j * this.GX + i];
  }

  set(s: ValleyState): void {
    const prev = this.st;
    this.st = s;
    const domCh = this.setDomain(s.site);
    const k = (name: string, v: string) => {
      const ch = this.keys[name] !== v;
      this.keys[name] = v;
      return ch;
    };
    const vexCh = !prev || prev.vex !== s.vex || domCh;
    const terrainKey = `${s.raster ? s.raster.p : 0}|${s.colorBy}|${s.vex}|${this.siteId}`;
    const fineCh = !prev || prev.fine !== s.fine || prev.n !== s.n || domCh;
    if (s.section !== null) this.sectionX = s.section;
    if (k('terrain', terrainKey) || fineCh) {
      this.buildTerrain(s);
      this.updateViews();
      if (!this.framed) {
        this.framed = true;
        this.stage.view(this.views.valle, false);
      }
      this.keys.breach = '';
    } else if (prev && prev.section !== s.section) this.updateViews();
    const dmg = s.damage ? Array.from(s.damage, (v) => v.toFixed(2)).join(',') : '';
    if (k('objects', `${s.objects}|${s.vex}|${this.siteId}|${dmg}`) || vexCh) this.buildObjects(s);
    if (k('bridge', `${s.bridge?.low}|${s.bridge?.block}|${s.objects}|${s.vex}|${this.siteId}`) || vexCh) this.buildBridge(s);
    if (k('section', `${s.section}|${s.vex}`) || fineCh) this.buildSection(s);
    if (k('mesh', `${s.mesh?.c}|${s.mesh?.geom?.key ?? ''}|${s.breaklines}|${s.bc}|${JSON.stringify(s.bcLines ?? null)}|${s.vex}`) || fineCh) this.buildMesh(s);
    if (k('marks', `${JSON.stringify(s.probe ?? null)}|${JSON.stringify(s.lines ?? null)}|${s.vex}`) || fineCh) this.buildMarks(s);
    if (k('posts', `${JSON.stringify(s.marks ?? null)}|${s.vex}`) || fineCh) this.buildPosts(s);
    if (k('breach', `${s.breach ? 1 : 0}|${s.water?.res?.geom.key ?? ''}|${s.vex}`) || fineCh) this.buildBreach(s);
    this.buildCell(s);
    this.updateWater(s);
    this.labels(s);
  }

  /** Cambia solo el instante del agua (para reproducir sin rehacer el resto de la escena). */
  setFrame(frame: number | null): void {
    const s = this.st;
    if (!s?.water?.res) return;
    if (s.water.frame === frame) return;
    s.water = { ...s.water, frame };
    this.updateWater(s);
    if (s.cellFlux) this.labels(s);
  }

  // ---------------------------------------------------------------- terreno

  private buildTerrain(s: ValleyState): void {
    clear(this.terrainG);
    const valley = this.siteId === 'valle';
    const T = valley ? truth() : null;
    const { GX, GY, NX, NY, step, px } = this;
    const f = s.fine;
    // alturas en la grilla (promedio de los píxeles que tocan el vértice; sin dato, la cota más baja)
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        let a = 0, n = 0;
        const x = Math.min(this.W, i * step), y = Math.min(this.H, j * step);
        for (const dj of [-1, 0])
          for (const di of [-1, 0]) {
            const pi = Math.round(x / px) + di, pj = Math.round(y / px) + dj;
            if (pi < 0 || pj < 0 || pi >= NX || pj >= NY) continue;
            const v = f[pj * NX + pi];
            if (Number.isNaN(v)) continue;
            a += v;
            n++;
          }
        this.gz[j * GX + i] = n ? a / n : valley ? Z0 : this.zlo;
      }
    const col = new THREE.Color();
    const tmp = new THREE.Color();
    const colorAt = (k: number, z: number) => {
      if (!T) return Number.isNaN(f[k]) ? col.set('#b9b4aa') : ramp(HYPSO, Math.pow((z - this.zlo) / (this.zhi - this.zlo), 0.8), col);
      const x = (k % NX) + 0.5;
      if (s.colorBy === 'cobertura') return col.copy(COVER_COLORS[T.cover[k]]);
      if (s.colorBy === 'n' && s.n) return nColor(s.n[k], col);
      if (s.colorBy === 'natural') return heightColor(z, x, tmp) && col.copy(NATURAL[T.cover[k]]).lerp(tmp, 0.35);
      return heightColor(z, x, col);
    };
    const flat = s.colorBy === 'cobertura' || s.colorBy === 'n';
    const blocky = valley && !!s.raster && s.raster.p >= 5;
    // la vista natural del valle liso: el suelo con la textura de cada cobertura; los colores de vértice, solo el
    // sombreado del relieve
    const ground = !!T && s.colorBy === 'natural' && !blocky;
    const mat = flat ? this.terrainFlat : ground ? this.groundMat : this.terrainMat;
    this.groundSc.value = this.sc;
    if (blocky) this.terrainG.add(this.blocky(s.raster!, colorAt, mat));
    else {
      const g = new THREE.PlaneGeometry(1, 1, GX - 1, GY - 1);
      const pos = new Float32Array(GX * GY * 3), cl = new Float32Array(GX * GY * 3);
      const mix = ground ? new Float32Array(GX * GY * 4) : null;
      for (let j = 0; j < GY; j++)
        for (let i = 0; i < GX; i++) {
          const v = j * GX + i, z = this.gz[v];
          const x = Math.min(this.W, i * step), y = Math.min(this.H, j * step);
          pos[v * 3] = this.wx(x);
          pos[v * 3 + 1] = this.Y(z);
          pos[v * 3 + 2] = this.wz(y);
          const kk = Math.min(NY - 1, Math.floor(y / px)) * NX + Math.min(NX - 1, Math.floor(x / px));
          if (mix && T) {
            // mezcla de coberturas de los 4 × 4 píxeles alrededor del vértice (bordes suaves entre lotes)
            let a = 0, b = 0, c = 0, d = 0, n = 0;
            for (let dj = -2; dj <= 1; dj++)
              for (let di = -2; di <= 1; di++) {
                const pi = Math.round(x / px) + di, pj = Math.round(y / px) + dj;
                if (pi < 0 || pj < 0 || pi >= NX || pj >= NY) continue;
                const q = pj * NX + pi, cv = COVER_KEYS[T.cover[q]];
                n++;
                if (T.ridge[q] === 1) {
                  // la corona del jarillón: camino de grava con pasto a los lados
                  d += 0.6;
                  a += 0.4;
                } else if (cv === 'pasto' || (cv === 'via' && Math.abs(pi + 0.5 - ROAD.x) > ROAD.half + 0.5 && Math.abs(pi + 0.5 - ROAD.x) < ROAD.half + ROAD.side * 1.6)) a++;
                // (los costados del terraplén de la vía van empradizados; la corona la cubre el asfalto)
                else if (cv === 'cultivo') b++;
                else if (cv === 'rastrojo' || cv === 'bosque') c++;
                else if (cv === 'cauce') d++;
              }
            n = Math.max(1, n);
            mix.set([a / n, b / n, c / n, d / n], v * 4);
            col.setRGB(1, 1, 1);
          } else colorAt(kk, z);
          if (!flat) {
            // sombreado del relieve (luz del noroeste), como un mapa de sombras de un SIG
            const zx = (this.gz[j * GX + Math.min(GX - 1, i + 1)] - this.gz[j * GX + Math.max(0, i - 1)]) / (2 * step);
            const zy = (this.gz[Math.min(GY - 1, j + 1) * GX + i] - this.gz[Math.max(0, j - 1) * GX + i]) / (2 * step);
            const sh = Math.max(0.62, Math.min(1.25, 1 + 2.2 * (-zx * 0.6 + zy * 0.8) * (valley ? 1 : 3)));
            col.multiplyScalar(sh);
          }
          cl[v * 3] = col.r;
          cl[v * 3 + 1] = col.g;
          cl[v * 3 + 2] = col.b;
        }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
      if (mix) g.setAttribute('aMix', new THREE.BufferAttribute(mix, 4));
      g.index = gridIndex(GX, GY);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.terrainG.add(m);
    }
    // el zócalo de la maqueta: corte con las capas del suelo y el piso de estudio
    clear(this.plinthG);
    this.plinthG.add(this.plinth());
  }

  /** El ráster grueso como bloques: cada píxel una losa a su cota, con paredes entre vecinos. */
  private blocky(r: Raster, colorAt: (k: number, z: number) => THREE.Color, mat: THREE.MeshStandardMaterial): THREE.Mesh {
    const pos: number[] = [], cl: number[] = [], nor: number[] = [];
    const { NX, NY } = this;
    const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], color: THREE.Color) => {
      for (const p of [a, b, c, a, c, d]) {
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
        cl.push(color.r, color.g, color.b);
      }
    };
    const side = new THREE.Color();
    const X = (x: number) => this.wx(x), Z = (y: number) => this.wz(y);
    for (let cj = 0; cj < r.CY; cj++)
      for (let ci = 0; ci < r.CX; ci++) {
        const z = r.z[cj * r.CX + ci];
        const x0 = ci * r.p, x1 = Math.min(NX, (ci + 1) * r.p), y0 = cj * r.p, y1 = Math.min(NY, (cj + 1) * r.p);
        const kk = Math.min(NY - 1, Math.floor((y0 + y1) / 2)) * NX + Math.min(NX - 1, Math.floor((x0 + x1) / 2));
        const c = colorAt(kk, z).clone();
        const Yz = this.Y(z);
        quad([X(x0), Yz, Z(y0)], [X(x1), Yz, Z(y0)], [X(x1), Yz, Z(y1)], [X(x0), Yz, Z(y1)], [0, 1, 0], c);
        side.copy(c).multiplyScalar(0.72);
        if (ci + 1 < r.CX) {
          const z2 = r.z[cj * r.CX + ci + 1];
          if (Math.abs(z2 - z) > 1e-3) {
            const Y2 = this.Y(z2);
            quad([X(x1), Math.min(Yz, Y2), Z(y0)], [X(x1), Math.min(Yz, Y2), Z(y1)], [X(x1), Math.max(Yz, Y2), Z(y1)], [X(x1), Math.max(Yz, Y2), Z(y0)], [z > z2 ? 1 : -1, 0, 0], side);
          }
        }
        if (cj + 1 < r.CY) {
          const z2 = r.z[(cj + 1) * r.CX + ci];
          if (Math.abs(z2 - z) > 1e-3) {
            const Y2 = this.Y(z2);
            quad([X(x0), Math.min(Yz, Y2), Z(y1)], [X(x1), Math.min(Yz, Y2), Z(y1)], [X(x1), Math.max(Yz, Y2), Z(y1)], [X(x0), Math.max(Yz, Y2), Z(y1)], [0, 0, z > z2 ? -1 : 1], side);
          }
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    mat.side = THREE.DoubleSide;
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.castShadow = true;
    return m;
  }

  /** Zócalo de la maqueta: el corte del terreno por los cuatro costados con las capas del suelo (de la capa vegetal
   * a la roca) y, debajo, el piso de estudio que recibe la sombra. */
  private plinth(): THREE.Group {
    const g = new THREE.Group();
    const depth = Math.max(4, 0.04 * Math.max(this.W, this.H) * this.sc);
    let zmin = Infinity;
    for (const z of this.gz) if (z < zmin) zmin = z;
    const base = this.Y(Math.min(zmin, this.zref)) - depth;
    const xs = Array.from({ length: this.GX }, (_, i) => Math.min(this.W, i * this.step)), ys = Array.from({ length: this.GY }, (_, j) => Math.min(this.H, j * this.step));
    const edge: [number, number][] = [
      ...xs.map((x) => [x, 0] as [number, number]),
      ...ys.slice(1).map((y) => [this.W, y] as [number, number]),
      ...xs.slice(0, -1).reverse().map((x) => [x, this.H] as [number, number]),
      ...ys.slice(0, -1).reverse().map((y) => [0, y] as [number, number]),
    ].map(([x, y]) => [this.wx(x), this.wz(y)]);
    const wall = strataWall(edge, (X, Z) => this.Y(this.zAt(this.px0(X), this.py0(Z))) - 0.02, base);
    // la arista de arriba del corte, un poco más oscura (la capa vegetal húmeda)
    wall.castShadow = true;
    g.add(wall, studioFloor(0, 0, Math.hypot(this.W * this.sc, this.H * this.sc) / 2, base));
    markOwn(g);
    return g;
  }

  // ---------------------------------------------------------------- casas, árboles, calles y el puente

  private buildObjects(s: ValleyState): void {
    clear(this.objectsG);
    clear(this.ghostG);
    clear(this.stainG);
    this.stains = [];
    this.houses = [];
    this.houseLevel = null;
    if (s.objects === 'no' || this.siteId !== 'valle') return;
    const T = truth();
    const NX = VNX, NY = VNY;
    const wx = (x: number) => this.wx(x), wz = (y: number) => this.wz(y), SC = this.sc;
    const zg = (x: number, y: number) => T.mdt[Math.max(0, Math.min(NY - 1, Math.floor(y))) * NX + Math.max(0, Math.min(NX - 1, Math.floor(x)))];
    if (s.objects === 'fantasma') {
      // contornos de las casas: lo que el MDT no tiene
      const pts: number[] = [];
      for (const b of T.buildings) {
        const z0 = this.Y(zg((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)), z1 = this.Y(zg((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) + b.h);
        const c = [
          [b.x0, b.y0],
          [b.x1, b.y0],
          [b.x1, b.y1],
          [b.x0, b.y1],
        ];
        for (let k = 0; k < 4; k++) {
          const [xa, ya] = c[k], [xb, yb] = c[(k + 1) % 4];
          pts.push(wx(xa), z1, wz(ya), wx(xb), z1, wz(yb), wx(xa), z0, wz(ya), wx(xa), z1, wz(ya));
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.ghostG.add(new THREE.LineSegments(g, own(new THREE.LineBasicMaterial({ color: '#7a4a3a', transparent: true, opacity: 0.45 }))));
      return;
    }
    // casas de barrio: fachada pintada con ventanas, rejas y puerta hacia la calle; techo de teja de dos aguas o
    // plancha con tanque; con daño, el muro toma el color del daño
    const tint = new THREE.Color();
    const inStreet = (x: number, y: number) => T.streets.some(([a, b, c, d]) => x >= a && x < b && y >= c && y < d);
    const vex = s.vex;
    const specs: HouseSpec[] = T.buildings.map((b, bi) => {
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const zb = zg(cx, cy);
      const dm = s.damage ? s.damage[bi] : -1;
      const school = b.name === 'escuela';
      // el frente: el costado con la calle más cerca (en el plano; el eje y del plano va hacia −z en el mundo)
      let front: [number, number] = [0, -1], best = Infinity;
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [1, 0],
        [-1, 0],
      ] as const) {
        const hx = (b.x1 - b.x0) / 2, hy = (b.y1 - b.y0) / 2;
        for (let d = 0.5; d < 12 && d < best; d += 0.5)
          if (inStreet(cx + dx * (hx + d), cy + dy * (hy + d))) {
            best = d;
            front = [dx, -dy];
          }
      }
      const hash = ((bi * 2654435761) >>> 0) / 4294967296;
      const teja = !school && (b.h < 4 || hash < 0.55);
      return {
        x: wx(cx),
        y: this.Y(zb),
        z: wz(cy),
        w: (b.x1 - b.x0) * SC,
        d: (b.y1 - b.y0) * SC,
        h: b.h,
        hw: this.Y(zb + b.h) - this.Y(zb),
        wall: dm >= 0 ? '#' + ramp(COLORS.damage, dm, tint).getHexString() : school ? '#f2f0ea' : WALLS[(bi * 7) % WALLS.length],
        front,
        roof: teja ? 'teja' : 'plancha',
        roofColor: teja ? ROOF_TILE[(bi * 3) % ROOF_TILE.length] : ROOF_SLAB[bi % ROOF_SLAB.length],
        school,
      };
    });
    const hg = valleyHouses(specs, SC, SC * vex);
    markOwn(hg);
    this.objectsG.add(hg);
    // manchas de barro de cada casa (se ajustan al tiempo en updateWater)
    const stainMat = own(new THREE.MeshStandardMaterial({ color: '#6b5639', transparent: true, opacity: 0.42, roughness: 1, depthWrite: false }));
    const lineMat = own(new THREE.MeshStandardMaterial({ color: '#3f3122', transparent: true, opacity: 0.85, roughness: 1, depthWrite: false }));
    stainMat.userData.noLook = lineMat.userData.noLook = true;
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    T.buildings.forEach((b) => {
      const zb = zg((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      this.houses.push({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, zb, cells: [] });
      const body = new THREE.Mesh(box, stainMat);
      const line = new THREE.Mesh(box, lineMat);
      body.position.set(wx((b.x0 + b.x1) / 2), this.Y(zb), wz((b.y0 + b.y1) / 2));
      line.position.copy(body.position);
      body.scale.set((b.x1 - b.x0) * SC * 1.025, 0.001, (b.y1 - b.y0) * SC * 1.025);
      line.scale.set((b.x1 - b.x0) * SC * 1.035, 0.08, (b.y1 - b.y0) * SC * 1.035);
      body.visible = line.visible = false;
      body.renderOrder = line.renderOrder = 4;
      this.stainG.add(body, line);
      this.stains.push({ body, line });
    });
    // el asfalto: la corona de la vía y las calles del barrio, con sus líneas
    const asph = paint('#6f7378', 0.9, 0);
    const ribbon = (x0: number, x1: number, y0: number, y1: number, mat: THREE.Material = asph, lift = 0.06) => {
      const nx = Math.max(1, Math.round((x1 - x0) / 2)), ny = Math.max(1, Math.round((y1 - y0) / 2));
      const g = new THREE.PlaneGeometry(1, 1, nx, ny);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const u = pos.getX(v) + 0.5, w = pos.getY(v) + 0.5;
        const x = x0 + u * (x1 - x0), y = y0 + w * (y1 - y0);
        pos.setXYZ(v, wx(x), this.Y(zg(x, y)) + lift, wz(y));
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      return m;
    };
    // calles del barrio: andenes de concreto a los lados y el asfalto en el medio
    const curb = paint('#c9c3b6', 0.92, 0);
    for (const [a, b, c, d] of T.streets) {
      const ew = b - a > d - c;
      this.objectsG.add(ribbon(a, b, c, d, curb, 0.05));
      this.objectsG.add(ew ? ribbon(a, b, c + 1.2, d - 1.2, asph, 0.07) : ribbon(a + 1.2, b - 1.2, c, d, asph, 0.07));
    }
    const yb = yc(ROAD.x);
    const ySouth = yb - ROAD.open - 2, yNorth = yb + ROAD.open + 2;
    this.objectsG.add(ribbon(ROAD.x - ROAD.half, ROAD.x + ROAD.half, 0, ySouth), ribbon(ROAD.x - ROAD.half, ROAD.x + ROAD.half, yNorth, NY));
    // líneas de la vía: bordes blancos y eje amarillo a trazos
    const white = paint('#eceae4', 0.7, 0), yellow = paint('#e8b93a', 0.6, 0);
    white.userData.noLook = yellow.userData.noLook = true;
    for (const [y0, y1] of [
      [0, ySouth],
      [yNorth, NY],
    ] as [number, number][]) {
      this.objectsG.add(ribbon(ROAD.x - ROAD.half + 0.3, ROAD.x - ROAD.half + 0.5, y0, y1, white, 0.09), ribbon(ROAD.x + ROAD.half - 0.5, ROAD.x + ROAD.half - 0.3, y0, y1, white, 0.09));
      for (let y = y0 + 1; y + 3 < y1; y += 7) this.objectsG.add(ribbon(ROAD.x - 0.12, ROAD.x + 0.12, y, y + 3, yellow, 0.1));
    }
    // árboles (las copas del MDS)
    const tspots: TreeSpot[] = T.crowns.map((c) => ({ x: wx(c.x), y: this.Y(zg(c.x, c.y)), z: wz(c.y), r: c.r * SC * 0.9 }));
    this.objectsG.add(trees(tspots, 5));
    // matas bajas del rastrojo (entre los árboles, en una grilla con azar)
    const bs: BushSpot[] = [];
    let seed = 77;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const iR = COVER_KEYS.indexOf('rastrojo');
    for (let y = 3; y < NY - 3; y += 6.5)
      for (let x = 3; x < NX - 3; x += 6.5) {
        const px = x + (R() - 0.5) * 5, py = y + (R() - 0.5) * 5;
        const k = Math.floor(py) * NX + Math.floor(px);
        if (T.cover[k] !== iR || R() < 0.25) continue;
        bs.push({ x: wx(px), y: this.Y(zg(px, py)), z: wz(py), r: (0.9 + R() * 0.9) * SC });
        if (bs.length >= 1400) break;
      }
    const bush = bushes(bs, 3);
    if (bush) {
      markOwn(bush);
      this.objectsG.add(bush);
    }
  }

  /** El puente: tablero con vigas de borde y barandas (de su cara inferior a la rasante) y, si la luz está tapada,
   * troncos y basura atravesados aguas arriba. */
  private buildBridge(s: ValleyState): void {
    clear(this.bridgeG);
    if (this.siteId !== 'valle' || s.objects === 'no') return;
    const low = s.bridge?.low ?? LOW_CHORD;
    const SC = this.sc;
    const th = Math.max(0.3, ROAD_Z - low);
    const yb = yc(ROAD.x), L = 26;
    const concrete = paint('#bdb8ae', 0.85, 0);
    const deckH = this.Y(ROAD_Z) - this.Y(ROAD_Z - th);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(7 * SC, deckH, L * SC), concrete);
    deck.position.set(this.wx(ROAD.x), (this.Y(ROAD_Z) + this.Y(ROAD_Z - th)) / 2, this.wz(yb));
    deck.castShadow = deck.receiveShadow = true;
    this.bridgeG.add(deck);
    // vigas de borde y el asfalto del tablero con su eje
    const beam = paint('#a9a49a', 0.8, 0);
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5 * SC, deckH * 1.15, L * SC), beam);
      b.position.set(this.wx(ROAD.x + sx * 3.6), deck.position.y - deckH * 0.07, this.wz(yb));
      b.castShadow = true;
      this.bridgeG.add(b);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(6 * SC, 0.04, L * SC), paint('#6f7378', 0.9, 0));
    top.position.set(this.wx(ROAD.x), this.Y(ROAD_Z) + 0.03, this.wz(yb));
    const axis = new THREE.Mesh(new THREE.BoxGeometry(0.24 * SC, 0.05, L * SC * 0.9), paint('#e8b93a', 0.6, 0));
    axis.position.set(this.wx(ROAD.x), this.Y(ROAD_Z) + 0.06, this.wz(yb));
    this.bridgeG.add(top, axis);
    // barandas: postes cada 2 m y dos pasamanos
    const rail = paint('#d9dcdf', 0.45, 0.4);
    const postH = Math.max(0.6, this.Y(ROAD_Z + 1.1) - this.Y(ROAD_Z));
    const postGeo = new THREE.BoxGeometry(0.2 * SC, postH, 0.2 * SC);
    for (const sx of [-1, 1]) {
      for (let y = -L / 2 + 0.5; y <= L / 2 - 0.5; y += 2) {
        const p = new THREE.Mesh(postGeo, rail);
        p.position.set(this.wx(ROAD.x + sx * 3.55), this.Y(ROAD_Z) + postH / 2, this.wz(yb + y));
        p.castShadow = true;
        this.bridgeG.add(p);
      }
      for (const fy of [0.55, 0.95]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.12 * SC, 0.12 * SC, (L - 1) * SC), rail);
        r.position.set(this.wx(ROAD.x + sx * 3.55), this.Y(ROAD_Z) + postH * fy, this.wz(yb));
        this.bridgeG.add(r);
      }
    }
    const block = s.bridge?.block ?? 0;
    if (block > 0.01) {
      // troncos atravesados aguas arriba del puente, en proporción a la luz tapada, y ramas menudas
      const wood = paint('#6b4a2f', 0.9, 0), twig = paint('#7d6a4b', 0.95, 0);
      const n = Math.round(5 + block * 18);
      const T = truth();
      for (let k = 0; k < n; k++) {
        const y = yb - 9 + ((k * 7.3) % 18);
        const x = ROAD.x - 4.2 - (k % 3) * 0.8;
        const zb = T.mdt[Math.floor(y) * VNX + Math.floor(x)];
        const topZ = Math.min(low, zb + 0.3 + block * (low - zb) * ((k % 4) / 4 + 0.25));
        const r = (0.18 + (k % 3) * 0.05) * SC * 2;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, (3 + (k % 4)) * SC, 7), k % 5 === 4 ? twig : wood);
        log.rotation.set(Math.PI / 2, (k * 0.9) % Math.PI, (k * 0.37) % 0.6);
        log.position.set(this.wx(x), this.Y(topZ), this.wz(y));
        log.castShadow = true;
        this.bridgeG.add(log);
      }
    }
  }

  // ---------------------------------------------------------------- corte

  private buildSection(s: ValleyState): void {
    clear(this.sectionG);
    if (s.section === null || this.siteId !== 'valle') return;
    const T = truth();
    const NX = VNX, NY = VNY;
    const x = s.section;
    const i = Math.max(0, Math.min(NX - 1, Math.floor(x)));
    const c = yc(x);
    const y0 = Math.max(0, Math.floor(c - 75)), y1 = Math.min(NY - 1, Math.ceil(c + 75));
    let lo = Infinity, hi = -Infinity;
    for (let j = y0; j <= y1; j++) {
      lo = Math.min(lo, T.mdt[j * NX + i], s.fine[j * NX + i]);
      hi = Math.max(hi, T.mdt[j * NX + i], s.fine[j * NX + i]);
    }
    hi = Math.min(hi, lo + 14);
    // un plano translúcido y las dos líneas: el terreno verdadero (oscuro) y el del modelo (azul, escalonado)
    const plane = new THREE.Mesh(new THREE.PlaneGeometry((y1 - y0) * this.sc, this.Y(hi + 2) - this.Y(lo - 1)), own(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })));
    plane.rotation.y = Math.PI / 2;
    plane.position.set(this.wx(x) + 0.05, (this.Y(hi + 2) + this.Y(lo - 1)) / 2, this.wz((y0 + y1) / 2));
    plane.renderOrder = 4;
    const line = (zf: (j: number) => number, color: string, lift: number) => {
      const pts: THREE.Vector3[] = [];
      for (let j = y0; j <= y1; j++) {
        const z = zf(j);
        pts.push(new THREE.Vector3(this.wx(x) + lift, this.Y(z), this.wz(j)), new THREE.Vector3(this.wx(x) + lift, this.Y(z), this.wz(j + 1)));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const l = new THREE.Line(g, own(new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true })));
      l.renderOrder = 6;
      return l;
    };
    this.sectionG.add(plane, line((j) => T.mdt[j * NX + i], '#17324d', 0.12), line((j) => s.fine[j * NX + i], '#2a78d6', 0.18));
  }

  // ---------------------------------------------------------------- malla, líneas de quiebre y bordes

  private tube(pts: [number, number][], color: string, r: number, up = 0.4): THREE.Mesh {
    const v = pts.map(([x, y]) => new THREE.Vector3(this.wx(x), this.Y(this.zAt(x, y)) + up, this.wz(y)));
    const curve = new THREE.CatmullRomCurve3(v);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), r, 6, false), own(new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 })));
    m.userData.noLook = true;
    return m;
  }

  private buildMesh(s: ValleyState): void {
    clear(this.meshG);
    clear(this.bcG);
    const lift = 0.25;
    const st = this.step;
    const seg = (pts: number[], xa: number, ya: number, xb: number, yb: number) => {
      const L = Math.hypot(xb - xa, yb - ya), n = Math.max(1, Math.round(L / st));
      for (let q = 0; q < n; q++) {
        const x0 = xa + ((xb - xa) * q) / n, y0 = ya + ((yb - ya) * q) / n, x1 = xa + ((xb - xa) * (q + 1)) / n, y1 = ya + ((yb - ya) * (q + 1)) / n;
        const Y = this.Y(Math.max(this.zAt(x0, y0), this.zAt(x1, y1))) + lift;
        pts.push(this.wx(x0), Y, this.wz(y0), this.wx(x1), Y, this.wz(y1));
      }
    };
    if (s.mesh) {
      const pts: number[] = [];
      const g = s.mesh.geom;
      if (g) {
        // cada celda: su borde norte y este (y los de los bordes del dominio)
        for (let ci = 0; ci < g.NC; ci++) {
          const x0 = g.cx0[ci] * g.px, y0 = g.cy0[ci] * g.px, w = g.cs[ci] * g.px;
          const x1 = Math.min(this.W, x0 + w), y1 = Math.min(this.H, y0 + w);
          seg(pts, x0, y1, x1, y1);
          seg(pts, x1, y0, x1, y1);
          if (y0 === 0) seg(pts, x0, 0, x1, 0);
          if (x0 === 0) seg(pts, 0, y0, 0, y1);
        }
      } else {
        const c = s.mesh.c;
        for (let x = 0; x <= this.W; x += c) seg(pts, x, 0, x, this.H);
        for (let y = 0; y <= this.H; y += c) seg(pts, 0, y, this.W, y);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const cmin = g ? g.cmin : s.mesh.c;
      this.meshG.add(new THREE.LineSegments(geo, own(new THREE.LineBasicMaterial({ color: '#1d2b36', transparent: true, opacity: cmin <= 5 ? 0.22 : 0.4 }))));
    }
    if (s.breaklines && this.siteId === 'valle') {
      const lev: [number, number][] = [];
      for (let x = LEVEE.x0 + 8; x <= LEVEE.x1 - 4; x += 4) {
        const sl = ((30 * 2 * Math.PI) / 320) * Math.cos((2 * Math.PI * x) / 320);
        lev.push([x, yc(x) + LEVEE.dn * Math.sqrt(1 + sl * sl)]);
      }
      this.bcG.add(this.tube(lev, '#e0a526', 0.55));
      if (!s.bridge) {
        const road1: [number, number][] = [], road2: [number, number][] = [];
        for (let y = 2; y < VNY - 2; y += 6) {
          if (Math.abs(y - yc(ROAD.x)) < ROAD.open + 4) continue;
          (y < yc(ROAD.x) ? road1 : road2).push([ROAD.x, y]);
        }
        if (road1.length > 1) this.bcG.add(this.tube(road1, '#e0a526', 0.55));
        if (road2.length > 1) this.bcG.add(this.tube(road2, '#e0a526', 0.55));
      }
    }
    if (s.bc) {
      const lines = s.bcLines ?? (this.siteId === 'valle' ? [{ side: 'O', from: 0, to: VNY, kind: 'caudal', slope: 0 } as BcLine, { side: 'E', from: 0, to: VNY, kind: 'normal', slope: 0 } as BcLine] : []);
      for (const l of lines) {
        const pts: [number, number][] = [];
        const n = Math.max(2, Math.round((l.to - l.from) / 6));
        for (let k = 0; k <= n; k++) {
          const u = l.from + ((l.to - l.from) * k) / n;
          const e = Math.max(1, this.step / 2);
          pts.push(l.side === 'O' ? [e, u] : l.side === 'E' ? [this.W - e, u] : l.side === 'S' ? [u, e] : [u, this.H - e]);
        }
        this.bcG.add(this.tube(pts, l.kind === 'caudal' ? '#1f6fa5' : '#c0632b', 0.9 * Math.max(1, this.step / 2), 0.9));
      }
    }
  }

  /** La sonda y las líneas para medir caudal. */
  private buildMarks(s: ValleyState): void {
    clear(this.markG);
    if (s.probe) {
      const { x, y } = s.probe;
      const z = this.zAt(x, y);
      const h = 14 * this.sc * 2;
      const mat = own(new THREE.MeshStandardMaterial({ color: '#c0632b', emissive: '#c0632b', emissiveIntensity: 0.3 }));
      mat.userData.noLook = true;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, h, 8), mat);
      pole.position.set(this.wx(x), this.Y(z) + h / 2, this.wz(y));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), mat);
      ball.position.set(this.wx(x), this.Y(z) + h, this.wz(y));
      // un anillo en el suelo
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 32), own(new THREE.MeshBasicMaterial({ color: '#c0632b', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(this.wx(x), this.Y(z) + 0.15, this.wz(y));
      ring.renderOrder = 8;
      this.markG.add(pole, ball, ring);
    }
    for (const l of s.lines ?? []) {
      const n = Math.max(2, Math.round(Math.hypot(l.x1 - l.x0, l.y1 - l.y0) / 6));
      const pts: [number, number][] = [];
      for (let k = 0; k <= n; k++) pts.push([l.x0 + ((l.x1 - l.x0) * k) / n, l.y0 + ((l.y1 - l.y0) * k) / n]);
      this.markG.add(this.tube(pts, l.color, 0.5, 0.8));
    }
  }

  /** Postes de las marcas de agua: una franja roja a la cota observada y un anillo azul a la del modelo. */
  private buildPosts(s: ValleyState): void {
    clear(this.postG);
    if (!s.marks?.length || this.siteId !== 'valle') return;
    const T = truth();
    const wood = paint('#8a6a45', 0.9, 0);
    const red = own(new THREE.MeshStandardMaterial({ color: '#c0412b', emissive: '#c0412b', emissiveIntensity: 0.25, roughness: 0.6 }));
    const blue = own(new THREE.MeshStandardMaterial({ color: '#1f6fa5', emissive: '#1f6fa5', emissiveIntensity: 0.35, roughness: 0.4 }));
    red.userData.noLook = blue.userData.noLook = true;
    for (const m of s.marks) {
      const zg = T.mdt[Math.floor(m.y) * VNX + Math.floor(m.x)];
      const topZ = Math.max(m.obs, m.model ?? m.obs) + 0.8;
      const h = this.Y(topZ) - this.Y(zg);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, h, 8), wood);
      pole.position.set(this.wx(m.x), this.Y(zg) + h / 2, this.wz(m.y));
      pole.castShadow = true;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, Math.max(0.18, this.Y(zg + 0.08) - this.Y(zg)), 12), red);
      band.position.set(this.wx(m.x), this.Y(m.obs), this.wz(m.y));
      this.postG.add(pole, band);
      if (m.model !== null && Number.isFinite(m.model)) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.09, 8, 20), blue);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(this.wx(m.x), this.Y(m.model), this.wz(m.y));
        this.postG.add(ring);
      }
    }
  }

  // ---------------------------------------------------------------- la rotura del jarillón, en el tiempo

  private buildBreach(s: ValleyState): void {
    clear(this.breachG);
    this.breachMesh = null;
    this.breachData = null;
    if (!s.breach || this.siteId !== 'valle') return;
    const before = s.breach.before, after = s.fine;
    const { GX, GY, step } = this;
    // vértices donde el terreno bajó (con un borde de una celda de la grilla para cerrar los triángulos)
    const inB = new Uint8Array(GX * GY);
    let any = false;
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        const x = Math.min(VNX - 1, i * step), y = Math.min(VNY - 1, j * step);
        const k = Math.floor(y) * VNX + Math.floor(x);
        if (before[k] - after[k] > 0.03) {
          inB[j * GX + i] = 1;
          any = true;
        }
      }
    if (!any) return;
    const verts: number[] = [];
    const vid = new Int32Array(GX * GY).fill(-1);
    const idx: number[] = [];
    for (let j = 0; j < GY - 1; j++)
      for (let i = 0; i < GX - 1; i++) {
        const a = j * GX + i, b = a + 1, c = a + GX, d = c + 1;
        if (!(inB[a] || inB[b] || inB[c] || inB[d])) continue;
        for (const v of [a, b, c, d])
          if (vid[v] < 0) {
            vid[v] = verts.length;
            verts.push(v);
          }
        idx.push(vid[a], vid[b], vid[c], vid[b], vid[d], vid[c]);
      }
    const n = verts.length;
    const bz = new Float32Array(n), az = new Float32Array(n);
    for (let q = 0; q < n; q++) {
      const v = verts[q], i = v % GX, j = Math.floor(v / GX);
      const x = Math.min(VNX - 1, i * step), y = Math.min(VNY - 1, j * step);
      const k = Math.floor(y) * VNX + Math.floor(x);
      bz[q] = inB[v] ? before[k] : this.gz[v];
      az[q] = inB[v] ? after[k] : this.gz[v];
    }
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), base = new Float32Array(n * 3);
    // el color del terreno de alrededor (para que el jarillón entero no se note como un parche)
    const tm = this.terrainG.children[0] as THREE.Mesh | undefined;
    const tc = tm?.geometry.attributes.color as THREE.BufferAttribute | undefined;
    const smooth = !!tc && tc.count === GX * GY;
    // con el suelo texturado, el parche lleva la misma mezcla de coberturas (y el talud de la rotura sale en tierra)
    const tmix = smooth ? (tm!.geometry.attributes.aMix as THREE.BufferAttribute | undefined) : undefined;
    const mix = tmix ? new Float32Array(n * 4) : null;
    for (let q = 0; q < n; q++) {
      const v = verts[q];
      pos[q * 3] = this.wx(Math.min(this.W, (v % GX) * step));
      pos[q * 3 + 2] = this.wz(Math.min(this.H, Math.floor(v / GX) * step));
      if (smooth) base.set([tc!.getX(v), tc!.getY(v), tc!.getZ(v)], q * 3);
      else base.set([0.5, 0.62, 0.33], q * 3);
      if (mix && tmix) mix.set([tmix.getX(v), tmix.getY(v), tmix.getZ(v), tmix.getW(v)], q * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (mix) g.setAttribute('aMix', new THREE.BufferAttribute(mix, 4));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mix ? this.groundMat : own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
    m.receiveShadow = m.castShadow = true;
    this.breachG.add(m);
    this.breachMesh = m;
    this.breachData = { v: Int32Array.from(verts), before: bz, after: az, pos, col, base, ground: !!mix };
  }

  /** Lleva la rotura al avance p (0: jarillón entero, 1: abierta del todo como en el terreno de después). */
  private setBreach(p: number): void {
    const d = this.breachData, m = this.breachMesh;
    if (!d || !m) return;
    m.visible = p < 0.999;
    if (!m.visible) return;
    const earth = new THREE.Color('#7a5a3a'), c = new THREE.Color(), e = new THREE.Color();
    for (let q = 0; q < d.v.length; q++) {
      const drop = d.before[q] - d.after[q];
      const z = d.after[q] + (1 - p) * drop;
      d.pos[q * 3 + 1] = this.Y(z) + 0.02;
      // la tierra que queda al descubierto, más oscura y húmeda a medida que se abre (con el suelo texturado, el
      // color del vértice tiñe la textura: tierra mojada sobre la mezcla)
      c.setRGB(d.base[q * 3], d.base[q * 3 + 1], d.base[q * 3 + 2]);
      if (d.ground) e.setRGB(c.r * 0.95, c.g * 0.72, c.b * 0.5);
      else e.copy(earth);
      c.lerp(e, drop > 0.05 ? Math.min(1, p * 1.8) : 0);
      d.col.set([c.r, c.g, c.b], q * 3);
    }
    const g = m.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  // ---------------------------------------------------------------- la celda que se inspecciona

  private buildCell(s: ValleyState): void {
    const key = s.cell ? `${s.cell.c}|${s.cell.ci}|${s.cell.eta.toFixed(3)}|${s.cell.geom.key}|${s.vex}` : '';
    if (this.keys.cell === key) return;
    this.keys.cell = key;
    clear(this.cellG);
    if (!s.cell) return;
    const { ci, geom, eta } = s.cell;
    const c = geom.cs[ci] * geom.px;
    const x0 = geom.cx0[ci] * geom.px, y0 = geom.cy0[ci] * geom.px;
    // el marco de la celda
    const zTop = Math.max(...Array.from({ length: c + 1 }, (_, k) => Math.max(this.zAt(x0 + k, y0), this.zAt(x0 + k, y0 + c), this.zAt(x0, y0 + k), this.zAt(x0 + c, y0 + k))));
    const top = this.Y(Math.max(zTop, eta) + 0.5);
    const frame: number[] = [];
    const corners = [
      [x0, y0],
      [x0 + c, y0],
      [x0 + c, y0 + c],
      [x0, y0 + c],
    ];
    for (let k = 0; k < 4; k++) {
      const [xa, ya] = corners[k], [xb, yb] = corners[(k + 1) % 4];
      frame.push(this.wx(xa), top, this.wz(ya), this.wx(xb), top, this.wz(yb), this.wx(xa), top, this.wz(ya), this.wx(xa), this.Y(this.zAt(xa, ya)), this.wz(ya));
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(frame, 3));
    const fl = new THREE.LineSegments(fg, own(new THREE.LineBasicMaterial({ color: '#c0632b', depthTest: false, transparent: true })));
    fl.renderOrder = 7;
    this.cellG.add(fl);
    // el agua dentro de la celda, píxel por píxel: solo cubre los que están por debajo del nivel
    const pos: number[] = [];
    const p = geom.px;
    for (let j = geom.cy0[ci]; j < geom.cy0[ci] + geom.cs[ci]; j++)
      for (let i = geom.cx0[ci]; i < geom.cx0[ci] + geom.cs[ci]; i++) {
        const z = geom.z[j * geom.NX + i];
        if (!(z < eta)) continue;
        const Ye = this.Y(eta);
        const xa = this.wx(i * p), xb = this.wx((i + 1) * p), za = this.wz(j * p), zb = this.wz((j + 1) * p);
        pos.push(xa, Ye, za, xb, Ye, za, xb, Ye, zb, xa, Ye, za, xb, Ye, zb, xa, Ye, zb);
      }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, own(new THREE.MeshStandardMaterial({ color: '#2f7fb8', transparent: true, opacity: 0.82, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false })));
      (m.material as THREE.Material).userData.noLook = true;
      m.renderOrder = 5;
      this.cellG.add(m);
    }
    const cx = this.wx(x0 + c / 2), cz = this.wz(y0 + c / 2), d = Math.max(14, c * this.sc * 1.6);
    this.views.celda = { eye: [cx + d * 0.55, this.Y(eta) + d * 0.75, cz + d * 1.05], target: [cx, this.Y(eta) - 0.5, cz], fit: Math.max(16, c * this.sc * 2.2) };
  }

  /** Flechas del caudal por las caras de la celda marcada (azules las que entran, naranjas las que salen). */
  private flux: { side: string; q: number; x: number; y: number; dx: number; dy: number }[] = [];
  private arrowMats = [new THREE.MeshStandardMaterial({ color: '#1f6fa5', emissive: '#1f6fa5', emissiveIntensity: 0.35, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#d0652a', emissive: '#d0652a', emissiveIntensity: 0.35, roughness: 0.4 })].map((m) => {
    m.userData.noLook = true;
    return m;
  });
  private updateArrows(s: ValleyState, r: RunResult | null, qf: ArrayLike<number> | null): void {
    this.flux = [];
    clear(this.arrowG);
    if (!s.cellFlux || !s.cell || !r || !qf) return;
    const g = r.geom, ci = s.cell.ci, cg = s.cell.geom;
    // la celda marcada tiene que ser la misma en la malla de la corrida
    if (ci >= g.NC || g.cx0[ci] !== cg.cx0[ci] || g.cy0[ci] !== cg.cy0[ci] || g.cs[ci] !== cg.cs[ci] || g.px !== cg.px) return;
    const [blue, orange] = this.arrowMats;
    let qmax = 0;
    const faces = cellFaces(g, ci).filter((q) => g.fb[q.f] >= 0);
    for (const { f } of faces) qmax = Math.max(qmax, Math.abs(qf[f]));
    const eta = this.flow ? this.flow.eta[ci] : s.cell.eta;
    for (const { f, side } of faces) {
      const q = qf[f];
      if (Math.abs(q) < 0.01) continue;
      // posición del centro de la cara y dirección del flujo (+x o +y si q > 0)
      const along0 = g.fstart[f] * g.px, len = g.flen[f] * g.px, at = g.fpos[f] * g.px;
      const [x, y] = g.fo[f] === 0 ? [at, along0 + len / 2] : [along0 + len / 2, at];
      const [dx, dy] = g.fo[f] === 0 ? [Math.sign(q), 0] : [0, Math.sign(q)];
      const out = (side === 'E' || side === 'N') === q > 0;
      const L = Math.max(1.5, (Math.sqrt(Math.abs(q) / Math.max(1e-6, qmax)) * g.cs[ci] * g.px) / 2) * this.sc;
      const r0 = Math.max(0.12, L * 0.07);
      const Yl = this.Y(Math.max(eta, this.zAt(x, y))) + 0.35;
      const dir = new THREE.Vector3(dx, 0, -dy);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, L * 0.72, 10), out ? orange : blue);
      const head = new THREE.Mesh(new THREE.ConeGeometry(r0 * 2.6, L * 0.28, 14), out ? orange : blue);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const base = new THREE.Vector3(this.wx(x), Yl, this.wz(y)).addScaledVector(dir, -L * 0.5);
      shaft.quaternion.copy(quat);
      head.quaternion.copy(quat);
      shaft.position.copy(base).addScaledVector(dir, L * 0.36);
      head.position.copy(base).addScaledVector(dir, L * 0.86);
      shaft.renderOrder = head.renderOrder = 8;
      this.arrowG.add(shaft, head);
      this.flux.push({ side, q, x, y, dx, dy });
    }
  }

  // ---------------------------------------------------------------- el agua

  /** Tabla de interpolación de la grilla de dibujo sobre la malla (una vez por geometría). */
  private samplerFor(g: Geometry): Sampler {
    const key = `${g.key}|${this.GX}|${this.GY}|${this.step}`;
    if (this.sampler?.key === key) return this.sampler;
    const { GX, GY, step } = this;
    const N = GX * GY;
    const ownC = new Int32Array(N), nb = new Int32Array(N * 4).fill(-1), w = new Float32Array(N * 4), zm = new Float32Array(N);
    const Wm = g.NX * g.px, Hm = g.NY * g.px;
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        const v = j * GX + i;
        const x = Math.min(this.W - 0.5 * this.px, Math.max(0.5 * this.px, i * step)), y = Math.min(this.H - 0.5 * this.px, Math.max(0.5 * this.px, j * step));
        const k = Math.min(g.NY - 1, Math.floor(y / g.px)) * g.NX + Math.min(g.NX - 1, Math.floor(x / g.px));
        const oc = g.pmap[k];
        ownC[v] = oc;
        zm[v] = g.z[k];
        if (oc < 0) continue;
        const s = g.cs[oc] * g.px;
        const fx = x / s - 0.5, fy = y / s - 0.5;
        const I0 = Math.floor(fx), J0 = Math.floor(fy);
        let q = 0;
        for (let dj = 0; dj <= 1; dj++)
          for (let di = 0; di <= 1; di++) {
            const cxm = Math.min(Wm - 0.1, Math.max(0.1, (I0 + di + 0.5) * s)), cym = Math.min(Hm - 0.1, Math.max(0.1, (J0 + dj + 0.5) * s));
            nb[v * 4 + q] = g.pmap[Math.floor(cym / g.px) * g.NX + Math.floor(cxm / g.px)];
            w[v * 4 + q] = (di ? fx - I0 : 1 - (fx - I0)) * (dj ? fy - J0 : 1 - (fy - J0));
            q++;
          }
      }
    this.sampler = { key, own: ownC, nb, w, zm };
    return this.sampler;
  }

  /** Mapas de la corrida en el instante pedido (entre dos mapas guardados, interpolados). */
  private mapsAt(r: RunResult, frame: number | null): { eta: ArrayLike<number>; u: ArrayLike<number> | null; v: ArrayLike<number> | null; q: ArrayLike<number> | null; t: number | null } {
    const nf = r.frames.length;
    if (frame === null || !nf) {
      // con el mapa de máximos, las velocidades del instante del pico bajo el puente (o del último)
      let u: ArrayLike<number> | null = null, v: ArrayLike<number> | null = null, q: ArrayLike<number> | null = null;
      if (r.uFrames.length) {
        const s2 = r.series.qBridge.length && r.series.qBridge.some((x) => x !== 0) ? r.series.qBridge : r.series.qout;
        const fi = Math.max(0, Math.min(r.uFrames.length - 1, s2.reduce((b, x, k) => (x > s2[b] ? k : b), 0)));
        u = r.uFrames[fi];
        v = r.vFrames[fi];
        q = r.qFrames[fi] ?? null;
      }
      return { eta: r.etaMax, u, v, q, t: null };
    }
    const f = Math.max(0, Math.min(nf - 1, frame));
    const k = Math.min(nf - 2, Math.floor(f)), a = nf > 1 ? f - k : 0;
    const NC = r.geom.NC;
    if (this.etaI.length !== NC) {
      this.etaI = new Float32Array(NC);
      this.uI = new Float32Array(NC);
      this.vI = new Float32Array(NC);
    }
    const lerp = (A: Float32Array[], out: Float32Array) => {
      const x0 = A[Math.max(0, k)], x1 = A[Math.min(A.length - 1, k + 1)];
      for (let i = 0; i < out.length; i++) out[i] = x0[i] + a * (x1[i] - x0[i]);
      return out;
    };
    if (nf === 1) return { eta: r.frames[0], u: r.uFrames[0] ?? null, v: r.vFrames[0] ?? null, q: r.qFrames[0] ?? null, t: r.frameT[0] };
    lerp(r.frames, this.etaI);
    let q: Float32Array | null = null;
    if (r.uFrames.length === nf) {
      lerp(r.uFrames, this.uI);
      lerp(r.vFrames, this.vI);
    }
    if (r.qFrames.length === nf) {
      if (this.qI.length !== r.geom.NF) this.qI = new Float32Array(r.geom.NF);
      q = lerp(r.qFrames, this.qI);
    }
    const t = r.frameT[k] + a * (r.frameT[Math.min(nf - 1, k + 1)] - r.frameT[k]);
    return { eta: this.etaI, u: r.uFrames.length === nf ? this.uI : null, v: r.uFrames.length === nf ? this.vI : null, q, t };
  }

  /** Por vértice: primer mapa con agua (para el barro) y llegada de 10 cm (con la celda propia). */
  private timingFor(r: RunResult): Timing {
    const key = `${r.geom.key}|${r.frames.length}|${r.opts.hydro.Qp}|${r.opts.eq}|${r.opts.rough.mult}|${this.GX}|${JSON.stringify(r.opts.breach ?? null)}|${JSON.stringify(r.opts.rain ?? null)}`;
    if (this.timing?.key === key) return this.timing;
    const sp = this.samplerFor(r.geom);
    const N = this.GX * this.GY;
    const firstWet = new Float32Array(N).fill(Infinity), arrival = new Float32Array(N).fill(NaN);
    for (let v = 0; v < N; v++) {
      const ci = sp.own[v];
      if (ci < 0) continue;
      const zm = sp.zm[v];
      for (let f = 0; f < r.frames.length; f++) {
        const d = r.frames[f][ci] - zm;
        if (d >= 0.03 && firstWet[v] === Infinity) firstWet[v] = f;
        if (d >= 0.1) {
          arrival[v] = r.frameT[f];
          break;
        }
      }
    }
    this.timing = { key, firstWet, arrival };
    return this.timing;
  }

  /** Nivel de cada casa en cada mapa (el más alto de las celdas bajo ella) y el máximo de la corrida. */
  private houseLevels(r: RunResult): { lv: Float32Array[]; max: Float32Array } | null {
    if (!this.houses.length || this.siteId !== 'valle') return null;
    const key = `${r.geom.key}|${r.frames.length}|${r.opts.hydro.Qp}|${r.opts.eq}|${r.opts.rough.mult}|${JSON.stringify(r.opts.breach ?? null)}|${JSON.stringify(r.opts.rain ?? null)}|${r.etaMax[0]}`;
    if (this.houseLevel?.key === key) return this.houseLevel;
    const g = r.geom;
    for (const h of this.houses) {
      const set = new Set<number>();
      for (let y = Math.floor(h.y0); y <= Math.ceil(h.y1); y += 1)
        for (let x = Math.floor(h.x0); x <= Math.ceil(h.x1); x += 1) {
          const c = g.pmap[Math.min(g.NY - 1, Math.max(0, Math.floor(y / g.px))) * g.NX + Math.min(g.NX - 1, Math.max(0, Math.floor(x / g.px)))];
          if (c >= 0) set.add(c);
        }
      h.cells = [...set];
    }
    const level = (eta: ArrayLike<number>, h: House) => {
      let m = -Infinity;
      for (const c of h.cells) if (eta[c] - g.zmin[c] > 0.02) m = Math.max(m, eta[c]);
      return m;
    };
    const lv = r.frames.map((F) => Float32Array.from(this.houses, (h) => level(F, h)));
    // máximo acumulado en el tiempo (la mancha no baja cuando el agua baja)
    for (let f = 1; f < lv.length; f++) for (let b = 0; b < this.houses.length; b++) lv[f][b] = Math.max(lv[f][b], lv[f - 1][b]);
    const max = Float32Array.from(this.houses, (h) => level(r.etaMax, h));
    this.houseLevel = { key, lv, max };
    return this.houseLevel;
  }

  private updateStains(r: RunResult | null, frame: number | null, eta: ArrayLike<number> | null): void {
    if (!this.stains.length) return;
    const hl = r ? this.houseLevels(r) : null;
    this.houses.forEach((h, b) => {
      const st = this.stains[b];
      let lv = -Infinity;
      if (hl && r) {
        if (frame === null || !hl.lv.length) lv = hl.max[b];
        else {
          const f = Math.max(0, Math.min(hl.lv.length - 1, frame));
          lv = hl.lv[Math.floor(f)][b];
          if (eta) for (const c of h.cells) if (eta[c] - r.geom.zmin[c] > 0.02) lv = Math.max(lv, eta[c]);
        }
      }
      const d = lv - h.zb;
      const show = Number.isFinite(lv) && d > 0.04;
      st.body.visible = st.line.visible = show;
      if (!show) return;
      const hh = this.Y(lv) - this.Y(h.zb);
      st.body.scale.y = hh;
      st.line.position.y = this.Y(lv) - 0.04;
    });
  }

  private updateWater(s: ValleyState): void {
    const w = s.water;
    const r = w?.res ?? null;
    const live = !r && w?.live ? w.live : null;
    this.updateRain(s, r, w?.frame ?? null);
    if (!w || (!r && !live)) {
      this.flow = null;
      this.tNow = null;
      this.parts.visible = false;
      this.updateStains(null, null, null);
      this.updateArrows(s, null, null);
      this.setBreach(1);
      this.baseFlow();
      return;
    }
    const g = r ? r.geom : live!.geom;
    if (g.NX !== this.NX || g.NY !== this.NY) {
      this.water.visible = false;
      return;
    }
    const maps = r ? this.mapsAt(r, w.frame) : { eta: live!.frame, u: null, v: null, q: null, t: null };
    const eta = maps.eta;
    this.tNow = maps.t;
    const sp = this.samplerFor(g);
    const pos = this.waterPos, col = this.waterCol, fl = this.waterFlow, dep = this.waterDepth, foam = this.waterFoam;
    const c = new THREE.Color();
    const layer: Layer = live ? (w.layer === 'natural' ? 'natural' : 'profundidad') : w.layer;
    this.waterU.uDetail.value = layer === 'natural' ? 1 : layer === 'profundidad' || layer === 'velocidad' || layer === 'cota' ? 0.55 : 0.28;
    const tim = r && r.frames.length && (layer === 'llegada' || w.frame !== null) ? this.timingFor(r) : null;
    let maxEta = -Infinity, minEta = Infinity;
    if (layer === 'cota')
      for (let i = 0; i < g.NC; i++)
        if (eta[i] - g.zmin[i] > 0.02) {
          maxEta = Math.max(maxEta, eta[i]);
          minEta = Math.min(minEta, eta[i]);
        }
    const { GX, GY } = this;
    const tolW = r ? r.opts.tolWS : 0.003;
    const U = maps.u, V = maps.v;
    const fNow = w.frame;
    for (let v = 0; v < GX * GY; v++) {
      const ci0 = sp.own[v];
      let level = NaN, sw = 0, se = 0, su = 0, svv = 0;
      if (ci0 >= 0) {
        for (let q = 0; q < 4; q++) {
          const cn = sp.nb[v * 4 + q], wt = sp.w[v * 4 + q];
          if (cn < 0 || wt <= 0 || !(eta[cn] - g.zmin[cn] > 0.005)) continue;
          sw += wt;
          se += wt * eta[cn];
          if (U && V) {
            su += wt * U[cn];
            svv += wt * V[cn];
          }
        }
        level = sw > 0 ? se / sw : eta[ci0];
      }
      const zm = sp.zm[v];
      const depth = level - zm;
      const wet = ci0 >= 0 && depth > 0.02 && eta[ci0] - g.zmin[ci0] > 0.005;
      const showProb = layer === 'probabilidad' && w.values && ci0 >= 0 && w.values[ci0] > 0.02;
      const showZone = layer === 'zonas' && w.zones && ci0 >= 0 && w.zones[ci0] > 0;
      // barro: seco ahora, pero ya pasó el agua por aquí
      // vértice seco junto al agua: la lámina sigue plana hasta él y el terreno la corta en la orilla (así la orilla
      // queda donde la cota del agua toca el suelo, no en la grilla de dibujo)
      const shoreV = !wet && !showProb && !showZone && ci0 >= 0 && sw > 0 && depth > -1.5;
      const mud = !wet && !shoreV && !showProb && !showZone && tim !== null && fNow !== null && tim.firstWet[v] <= fNow;
      const drawn = wet || shoreV || showProb || showZone || mud;
      pos[v * 3 + 1] = drawn ? (wet || shoreV ? this.Y(level) + 0.04 : this.Y(this.gz[v]) + (mud ? 0.05 : 0.12)) : this.Y(this.gz[v]) - 0.3;
      if (!drawn) {
        col[v * 4 + 3] = 0;
        dep[v] = 0;
        foam[v] = 0;
        fl[v * 2] = fl[v * 2 + 1] = 0;
        continue;
      }
      const ux = sw > 0 ? su / sw : 0, uy = sw > 0 ? svv / sw : 0;
      const speed = Math.hypot(ux, uy);
      fl[v * 2] = ux;
      fl[v * 2 + 1] = uy;
      // profundidad para el sombreador: negativa en la orilla (se corta en cero), 0,5 donde no es agua (barro, capas)
      // (si la celda del vértice está seca en el modelo, ahí no se dibuja agua aunque el suelo esté más bajo)
      const ownWet = ci0 >= 0 && eta[ci0] - g.zmin[ci0] > 0.005;
      dep[v] = wet ? depth : shoreV ? Math.max(-0.5, ownWet ? depth : Math.min(depth, -0.01)) : 0.5;
      const Fr = wet ? speed / Math.sqrt(9.81 * Math.max(0.05, depth)) : 0;
      // espuma donde el flujo es rápido de verdad (cerca del crítico y por encima): no en todo el cauce
      foam[v] = wet ? Math.max(0, Math.min(1, (Fr - 1.05) / 0.8)) * Math.min(1, speed / 2) : 0;
      if (mud) {
        c.copy(MUD);
        col[v * 4] = c.r;
        col[v * 4 + 1] = c.g;
        col[v * 4 + 2] = c.b;
        col[v * 4 + 3] = 0.34;
        continue;
      }
      const dd = Math.max(0, depth);
      let alpha = Math.min(0.92, 0.48 + dd * 1.1);
      switch (layer) {
        case 'natural':
          ramp(COLORS.natural, Math.sqrt(dd / 3), c);
          alpha = Math.min(0.97, 0.86 + dd * 0.4);
          break;
        case 'velocidad':
          ramp(COLORS.vel, (r ? (fNow === null ? r.vMax[ci0] : speed) : speed) / 3, c);
          break;
        case 'cota':
          ramp(COLORS.wse, (level - minEta) / Math.max(0.5, maxEta - minEta), c);
          break;
        case 'amenaza': {
          const vv = fNow === null ? r!.vMax[ci0] : speed;
          const DV = fNow === null ? Math.max(0, r!.etaDV[ci0] - zm) * r!.vDV[ci0] : dd * speed;
          c.set(COLORS.hazard[hazardClass(dd, vv, DV)]);
          break;
        }
        case 'llegada': {
          const ta = tim ? tim.arrival[v] : NaN;
          if (!Number.isFinite(ta)) c.set('#9fb6c4');
          else ramp(COLORS.arrival, ta / Math.max(1, r!.opts.duration * 60), c);
          break;
        }
        case 'courant':
          ramp(COLORS.courant, r!.courantCell[ci0] / (r!.opts.eq === 'difusiva' ? 5 : 1.25), c);
          alpha = 0.85;
          break;
        case 'iteraciones':
          ramp(COLORS.error, r!.iterErr[ci0] / Math.max(1e-4, 4 * tolW), c);
          alpha = 0.85;
          break;
        case 'probabilidad':
          ramp(COLORS.prob, w.values ? w.values[ci0] : 0, c);
          alpha = 0.88;
          break;
        case 'zonas':
          c.set(COLORS.zones[w.zones ? w.zones[ci0] : 0]);
          alpha = 0.9;
          break;
        default:
          ramp(COLORS.depth, dd / 2.5, c);
      }
      col[v * 4] = c.r;
      col[v * 4 + 1] = c.g;
      col[v * 4 + 2] = c.b;
      col[v * 4 + 3] = alpha;
    }
    const geo = this.water.geometry;
    for (const a of ['position', 'color', 'aFlow', 'aDepth', 'aFoam']) (geo.attributes[a] as THREE.BufferAttribute).needsUpdate = true;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    this.water.visible = true;
    // velocidades del mapa que se ve (para las partículas, la tinta y la lectura)
    this.flow = U && V ? { geom: g, eta, u: U, v: V } : null;
    this.parts.visible = !!this.flow && !!w.particles;
    this.updateStains(r, w.frame, r && w.frame !== null ? eta : null);
    this.updateArrows(s, r, maps.q);
    // la rotura se abre cuando la abrió el modelo
    if (r?.breach && this.breachData) {
      const t = maps.t;
      const t0 = r.breach.t0, t1 = r.breach.full;
      const p = t === null ? 1 : t0 === null ? 0 : t1 === null ? Math.min(1, Math.max(0, (t - t0) / Math.max(60, (r.opts.breach?.tForm ?? 10) * 60))) : Math.min(1, Math.max(0, (t - t0) / Math.max(1, t1 - t0)));
      this.setBreach(p);
    } else this.setBreach(1);
  }

  /** El río con su caudal base cuando no hay corrida (el valle nunca se ve con el cauce seco). */
  private baseFlow(): void {
    if (this.siteId !== 'valle') {
      this.water.visible = false;
      return;
    }
    const T = truth();
    const pos = this.waterPos, col = this.waterCol, fl = this.waterFlow, dep = this.waterDepth, foam = this.waterFoam;
    const { GX, GY, step } = this;
    let any = false;
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        const v = j * GX + i;
        const x = Math.min(VNX - 1, i * step), y = Math.min(VNY - 1, j * step);
        const k = Math.floor(y) * VNX + Math.floor(x);
        const lev = bedZ(x) + BASE_WATER;
        const inCh = T.cover[k] === 0 || Math.abs(T.dist[k]) < 9;
        // mojado según el cauce verdadero; si el terreno dibujado no tiene el cauce (el sensor vio la lámina), el agua
        // se dibuja apenas sobre él
        const d = lev - T.mdt[k];
        const wet = inCh && d > 0.02;
        pos[v * 3 + 1] = wet ? this.Y(Math.max(lev, this.gz[v] + 0.02)) + 0.03 : this.Y(this.gz[v]) - 0.3;
        if (!wet) {
          col[v * 4 + 3] = 0;
          dep[v] = foam[v] = 0;
          continue;
        }
        any = true;
        // corriente a lo largo del eje del cauce (~0,8 m/s): solo mueve las ondas
        const sl = ((30 * 2 * Math.PI) / 320) * Math.cos((2 * Math.PI * x) / 320);
        const n = Math.hypot(1, sl);
        fl[v * 2] = 0.8 / n;
        fl[v * 2 + 1] = (0.8 * sl) / n;
        dep[v] = d;
        foam[v] = 0;
        col[v * 4] = BASE_COLOR.r;
        col[v * 4 + 1] = BASE_COLOR.g;
        col[v * 4 + 2] = BASE_COLOR.b;
        col[v * 4 + 3] = Math.min(0.9, 0.55 + d);
      }
    const geo = this.water.geometry;
    for (const a of ['position', 'color', 'aFlow', 'aDepth', 'aFoam']) (geo.attributes[a] as THREE.BufferAttribute).needsUpdate = true;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    this.waterU.uDetail.value = 0.8;
    this.water.visible = any;
  }

  /** Lluvia: sigue el hietograma de la corrida en el tiempo que se ve; con los máximos, una lluvia moderada. */
  private updateRain(s: ValleyState, r: RunResult | null, frame: number | null): void {
    let k = 0;
    const rain = r?.opts.rain;
    if (r && rain) {
      if (frame === null || !r.frames.length) k = 0.4;
      else {
        const h = hyetograph(rain.P, rain.D);
        const nf = r.frames.length;
        const f = Math.max(0, Math.min(nf - 1, frame));
        const k0 = Math.min(nf - 2, Math.floor(f));
        const t = (nf > 1 ? r.frameT[k0] + (f - k0) * (r.frameT[Math.min(nf - 1, k0 + 1)] - r.frameT[k0]) : r.frameT[0]) / 60;
        const b = Math.floor(t / 5);
        const mx = Math.max(...h.blocks);
        k = t < 0 || b >= h.blocks.length ? 0 : h.blocks[b] / Math.max(1e-9, mx);
      }
    } else if (s.rain) k = 0.55;
    this.rain.intensity = k;
    this.weatherK = k;
  }

  // ---------------------------------------------------------------- rótulos

  private labels(s: ValleyState): void {
    const L: StageLabel[] = s.labels.map((l) => ({
      id: l.id,
      text: l.text,
      sub: l.sub,
      at: new THREE.Vector3(this.wx(l.x), this.Y(this.zAt(l.x, l.y) + (l.up ?? 4)), this.wz(l.y)),
      kind: l.kind ?? 'lugar',
      prio: l.prio ?? 5,
    }));
    // el caudal de las caras de la celda marcada
    if (s.cellFlux)
      for (const f of this.flux)
        L.push({
          id: `cara-${f.side}`,
          text: `${fmt(Math.abs(f.q), Math.abs(f.q) < 10 ? 2 : 1)} m³/s`,
          sub: (f.side === 'E' || f.side === 'N') === f.q > 0 ? `sale por el ${SIDE_LONG[f.side]}` : `entra por el ${SIDE_LONG[f.side]}`,
          at: new THREE.Vector3(this.wx(f.x), this.Y(this.zAt(f.x, f.y)) + 3, this.wz(f.y)),
          kind: 'dato',
          prio: 9,
        });
    this.stage.setLabels(L);
  }

  // ---------------------------------------------------------------- clic, tinta y lectura

  private click(x: number, y: number): void {
    if (this.st?.tool === 'tinta') {
      const f = this.flow;
      if (!f) {
        this.onNotice?.('La tinta necesita una corrida con velocidades: calcula primero.');
        return;
      }
      const ci = this.cellOf(f, x, y);
      if (ci < 0 || f.eta[ci] - f.geom.zmin[ci] < 0.02) {
        this.onNotice?.('Ahí no hay agua en el instante que se ve: toca el agua.');
        return;
      }
      this.onNotice?.('');
      this.releaseDye(x, y);
      return;
    }
    this.onProbe?.(x, y);
  }

  /** Suelta una mancha de tinta en (x, y): la corriente la lleva. */
  releaseDye(x: number, y: number): void {
    const n = 120;
    for (let q = 0; q < n; q++) {
      const k = this.dNext;
      this.dNext = (this.dNext + 1) % ND;
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 5;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      const Yl = this.levelY(px, py);
      for (let h = 0; h < DTRAIL; h++) this.dp.set([px, py, Yl], (k * DTRAIL + h) * 3);
      this.dAge[k] = 0;
    }
    this.dye.visible = true;
  }

  clearDye(): void {
    this.dAge.fill(-1);
    if (this.dye) {
      (this.dye.geometry.attributes.position as THREE.BufferAttribute).array.fill(0);
      (this.dye.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      if (this.dyeHeads) {
        (this.dyeHeads.geometry.attributes.position as THREE.BufferAttribute).array.fill(-9999);
        (this.dyeHeads.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
      this.dye.visible = false;
    }
  }

  /** Altura (en el mundo) de la superficie del agua en un punto, o del suelo si está seco. */
  private levelY(x: number, y: number): number {
    const f = this.flow;
    if (!f) return this.Y(this.zAt(x, y)) + 0.2;
    const g = f.geom;
    const ci = x >= 0 && y >= 0 && x < this.W && y < this.H ? g.pmap[Math.floor(y / g.px) * g.NX + Math.floor(x / g.px)] : -1;
    if (ci < 0) return this.Y(this.zAt(x, y)) + 0.2;
    return this.Y(Math.max(f.eta[ci], this.zAt(x, y))) + 0.16;
  }

  private makeReadout(): void {
    const cv = this.stage.renderer.domElement;
    const host = cv.parentElement;
    if (!host) return;
    // una escena anterior en el mismo contenedor (el montaje doble del modo estricto) deja la suya: se quita
    for (const old of host.querySelectorAll('.m2-readout')) old.remove();
    const el = document.createElement('div');
    el.className = 'q3-hover m2-readout';
    el.setAttribute('aria-hidden', 'true');
    el.style.display = 'none';
    host.appendChild(el);
    const hide = () => (el.style.display = 'none');
    cv.addEventListener('pointerleave', hide);
    cv.addEventListener('pointerdown', hide);
    cv.addEventListener('wheel', hide, { passive: true });
    cv.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType === 'touch') return hide();
      const now = performance.now();
      if (now - this.hoverAt < 45) return;
      this.hoverAt = now;
      const r = cv.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(ndc, this.stage.camera);
      const objs: THREE.Object3D[] = [this.terrainG];
      if (this.water.visible) objs.push(this.water);
      const hit = this.ray.intersectObjects(objs, true)[0];
      if (!hit) return hide();
      const x = this.px0(hit.point.x), y = this.py0(hit.point.z);
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) return hide();
      const html = this.readAt(x, y);
      if (!html) return hide();
      el.innerHTML = html;
      el.style.display = 'grid';
      const hr = host.getBoundingClientRect();
      const ew = el.offsetWidth, eh = el.offsetHeight;
      let lx = e.clientX - hr.left + 16, ly = e.clientY - hr.top + 16;
      if (lx + ew > hr.width - 6) lx = e.clientX - hr.left - ew - 14;
      if (ly + eh > hr.height - 6) ly = e.clientY - hr.top - eh - 14;
      el.style.transform = `translate(${Math.round(Math.max(4, lx))}px, ${Math.round(Math.max(4, ly))}px)`;
    });
  }

  /** Lo que se lee en un punto del plano: el suelo, la cobertura y, con una corrida, el agua del instante. */
  private readAt(x: number, y: number): string {
    const s = this.st;
    if (!s) return '';
    const lines: string[] = [];
    const valley = this.siteId === 'valle';
    const k = Math.min(this.NY - 1, Math.floor(y / this.px)) * this.NX + Math.min(this.NX - 1, Math.floor(x / this.px));
    const zModel = s.fine[k];
    if (Number.isNaN(zModel)) return '<b>Sin dato</b><span>el modelo lo trata como pared</span>';
    if (valley) {
      const T = truth();
      const cov = COVERS[COVER_KEYS[T.cover[k]]];
      lines.push(`<b>${cov.name}${s.n ? ` · n ${fmt(s.n[k], 3)}` : ''}</b>`);
      const zt = T.mdt[k];
      lines.push(`<span>Suelo ${fmt(zt, 2)} m${Math.abs(zModel - zt) > 0.05 ? ` · el modelo ve ${fmt(zModel, 2)} m` : ''}</span>`);
    } else {
      lines.push(`<b>Tu terreno</b>`);
      lines.push(`<span>Suelo ${fmt(zModel, 2)} m</span>`);
    }
    const w = s.water, r = w?.res ?? null, f = this.flow;
    if (w && r && r.geom.NX === this.NX) {
      const g = r.geom, ci = g.pmap[Math.floor(y / g.px) * g.NX + Math.floor(x / g.px)];
      const when = this.tNow === null ? 'máximo de la corrida' : `a los ${fmt(this.tNow / 60, 0)} min`;
      if (ci >= 0) {
        const eta = f ? f.eta[ci] : r.etaMax[ci];
        const zg = g.z[Math.floor(y / g.px) * g.NX + Math.floor(x / g.px)];
        const d = eta - zg;
        if (w.layer === 'probabilidad' && w.values) lines.push(`<span>Se moja en el ${fmt(w.values[ci] * 100, 0)} % de las corridas</span>`);
        else if (w.layer === 'zonas' && w.zones) lines.push(`<span>${['Sin amenaza en el ejercicio', 'Amenaza baja', 'Amenaza media', 'Amenaza alta'][w.zones[ci]]}</span>`);
        else if (d > 0.02 && eta - g.zmin[ci] > 0.005) {
          const sp = this.tNow === null ? r.vMax[ci] : f ? Math.hypot(f.u[ci], f.v[ci]) : r.vMax[ci];
          lines.push(`<span class="is-water">Agua ${fmt(d, 2)} m · ${fmt(sp, 2)} m/s</span>`);
          lines.push(`<span>Nivel ${fmt(eta, 2)} m · ${when}</span>`);
          if (w.layer === 'amenaza') {
            const DV = this.tNow === null ? Math.max(0, r.etaDV[ci] - zg) * r.vDV[ci] : d * sp;
            lines.push(`<span>Amenaza H${hazardClass(d, sp, DV)} (AIDR)</span>`);
          } else if (w.layer === 'llegada' && this.timing) {
            const i = Math.round(x / this.step), j = Math.round(y / this.step);
            const ta = this.timing.arrival[Math.min(this.GY - 1, j) * this.GX + Math.min(this.GX - 1, i)];
            lines.push(`<span>${Number.isFinite(ta) ? `Llegan 10 cm a los ${fmt(ta / 60, 0)} min` : 'No llegan 10 cm'}</span>`);
          } else if (w.layer === 'courant') lines.push(`<span>Courant ${fmt(r.courantCell[ci], 2)}</span>`);
          else if (w.layer === 'iteraciones') lines.push(`<span>Error de la última iteración ${fmt(r.iterErr[ci] * 1000, 1)} mm</span>`);
        } else lines.push(`<span>Seco · ${when}</span>`);
      }
    }
    return lines.join('');
  }

  // ---------------------------------------------------------------- animación: partículas, tinta y lluvia

  update(dt: number, _t: number): void {
    const d = Math.min(0.05, dt);
    // cielo de aguacero que llega y se va suave
    const nk = this.weatherShown + (this.weatherK * 0.6 - this.weatherShown) * Math.min(1, d * 2);
    if (Math.abs(nk - this.weatherShown) > 1e-4) {
      this.weatherShown = nk;
      this.stage.weather(nk);
    }
    this.rain.update(d);
    const f = this.flow;
    if (f && this.parts.visible) this.stepParticles(d, f);
    if (this.dye.visible) this.stepDye(d, f);
  }

  private cellOf(f: NonNullable<ValleyWorld['flow']>, x: number, y: number): number {
    const g = f.geom;
    return x >= 0 && y >= 0 && x < this.W && y < this.H ? g.pmap[Math.floor(y / g.px) * g.NX + Math.floor(x / g.px)] : -1;
  }

  private stepParticles(d: number, f: NonNullable<ValleyWorld['flow']>): void {
    const { geom: g, eta, u, v } = f;
    const pos = (this.parts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const W = this.W, H = this.H, pp = this.pp;
    this.pClock += d;
    const shift = this.pClock >= TRAIL_DT;
    if (shift) this.pClock = 0;
    for (let k = 0; k < NP; k++) {
      const b = k * TRAIL * 3;
      if (this.pAge[k] < 0 || this.pAge[k] > 5) {
        // nace en una celda mojada al azar (con más probabilidad donde el agua corre)
        let ok = false;
        for (let tries = 0; tries < 14 && !ok; tries++) {
          const x = Math.random() * W, y = Math.random() * H;
          const ci = this.cellOf(f, x, y);
          if (ci < 0 || eta[ci] - g.zmin[ci] < 0.05) continue;
          const s = Math.hypot(u[ci], v[ci]);
          if (s < 0.05 || (tries < 10 && Math.random() > Math.min(1, 0.25 + s / 1.2))) continue;
          const Yl = this.Y(eta[ci]) + 0.16;
          for (let h = 0; h < TRAIL; h++) pp.set([x, y, Yl], b + h * 3);
          this.pAge[k] = Math.random() * 2;
          ok = true;
        }
        if (!ok) {
          this.pAge[k] = 99;
          pos.fill(0, k * (TRAIL - 1) * 6, (k + 1) * (TRAIL - 1) * 6);
          continue;
        }
      }
      const x = pp[b], y = pp[b + 1];
      const ci = this.cellOf(f, x, y);
      if (ci < 0 || eta[ci] - g.zmin[ci] < 0.03) {
        this.pAge[k] = -1;
        continue;
      }
      if (shift) pp.copyWithin(b + 3, b, b + (TRAIL - 1) * 3);
      pp[b] = x + u[ci] * PARTICLE_SPEED * d;
      pp[b + 1] = y + v[ci] * PARTICLE_SPEED * d;
      pp[b + 2] = this.Y(eta[ci]) + 0.16;
      this.pAge[k] += d;
      // el primer punto de la estela sigue a la cabeza; la estela se desvanece
      for (let h = 0; h < TRAIL - 1; h++) {
        const o = (k * (TRAIL - 1) + h) * 6, a = b + h * 3, c = b + (h + 1) * 3;
        pos[o] = this.wx(pp[a]);
        pos[o + 1] = pp[a + 2];
        pos[o + 2] = this.wz(pp[a + 1]);
        pos[o + 3] = this.wx(pp[c]);
        pos[o + 4] = pp[c + 2];
        pos[o + 5] = this.wz(pp[c + 1]);
      }
    }
    (this.parts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private stepDye(d: number, f: ValleyWorld['flow']): void {
    const pos = (this.dye.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const heads = (this.dyeHeads.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const dp = this.dp;
    this.dClock += d;
    const shift = this.dClock >= 0.09;
    if (shift) this.dClock = 0;
    let alive = 0;
    for (let k = 0; k < ND; k++) {
      const b = k * DTRAIL * 3;
      const base = k * (DTRAIL - 1) * 6;
      if (this.dAge[k] < 0) {
        pos.fill(0, base, base + (DTRAIL - 1) * 6);
        heads[k * 3 + 1] = -9999;
        continue;
      }
      this.dAge[k] += d;
      if (this.dAge[k] > DLIFE) {
        this.dAge[k] = -1;
        pos.fill(0, base, base + (DTRAIL - 1) * 6);
        heads[k * 3 + 1] = -9999;
        continue;
      }
      alive++;
      const x = dp[b], y = dp[b + 1];
      const ci = f ? this.cellOf(f, x, y) : -1;
      if (shift) dp.copyWithin(b + 3, b, b + (DTRAIL - 1) * 3);
      if (f && ci >= 0 && f.eta[ci] - f.geom.zmin[ci] > 0.02) {
        // un poco de difusión: la mancha se abre mientras avanza
        dp[b] = x + (f.u[ci] * PARTICLE_SPEED + (Math.random() - 0.5) * 1.6) * d;
        dp[b + 1] = y + (f.v[ci] * PARTICLE_SPEED + (Math.random() - 0.5) * 1.6) * d;
        dp[b + 2] = this.Y(f.eta[ci]) + 0.2;
      }
      heads[k * 3] = this.wx(dp[b]);
      heads[k * 3 + 1] = dp[b + 2];
      heads[k * 3 + 2] = this.wz(dp[b + 1]);
      for (let h = 0; h < DTRAIL - 1; h++) {
        const o = base + h * 6, a = b + h * 3, c = b + (h + 1) * 3;
        pos[o] = this.wx(dp[a]);
        pos[o + 1] = dp[a + 2];
        pos[o + 2] = this.wz(dp[a + 1]);
        pos[o + 3] = this.wx(dp[c]);
        pos[o + 4] = dp[c + 2];
        pos[o + 5] = this.wz(dp[c + 1]);
      }
    }
    (this.dye.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.dyeHeads.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (!alive) this.dye.visible = false;
  }
}

const SIDE_LONG: Record<string, string> = { O: 'oeste', E: 'este', S: 'sur', N: 'norte' };

function gridIndex(nx: number, ny: number): THREE.BufferAttribute {
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let q = 0;
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[q++] = a;
      idx[q++] = b;
      idx[q++] = c;
      idx[q++] = b;
      idx[q++] = d;
      idx[q++] = c;
    }
  return new THREE.BufferAttribute(idx, 1);
}

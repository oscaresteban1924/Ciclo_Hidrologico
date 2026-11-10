// Escala de ciudad: vista 3D del Valle de Aburrá para orientarse y elegir un sector.
// Relieve, río, quebradas, metro, tranvía, metrocables, Metroplús, vías principales y límites municipales
// salen de capas oficiales (Alcaldía de Medellín y AMVA, ver aburra.ts). Los edificios son ilustrativos: se
// reparten donde los datos dicen que hay ciudad. Relieve y edificios exagerados ×1,5 en altura, avisado en
// pantalla. Las líneas de transporte y de agua se dibujan además con un trazo de ancho fijo en pantalla
// (simbología de mapa) para que se lean desde lejos. No se usa para calcular: el cálculo ocurre solo en los sectores.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { prng } from '../scenarios/primitives';
import { LabelLayer, type LabelItem } from './labels';
import { VALLEY_COLORS, VALLEY_EXAGGERATION } from './palette';
import { CARPET_GLSL } from './carpet';
import { franjas, GRUPOS_PISOS, zona } from './edificios';
import {
  CABLES,
  COMUNAS,
  CREEK_LABELS,
  ESTADIO_R,
  EXTENT,
  Fabric,
  HILLS,
  METRO_A,
  METRO_B,
  METROPLUS,
  PLACES,
  RIVER_PATH,
  ROADS,
  RUNWAY_W,
  TRANVIA,
  boundaries,
  creeks,
  cross,
  fabricAt,
  forestAt,
  isFilled,
  outerZ,
  riverAt,
  valleyZ,
  type Line,
} from './aburra';

export { valleyZ } from './aburra';

const U = 100; // unidades de escena por km
const E = VALLEY_EXAGGERATION;
/** Metros de altura → unidades de escena (con la exageración vertical). */
const mz = (m: number) => (m / 1000) * U * E;

export interface SectorPin {
  id: string;
  label: string;
  sub: string;
  /** Posición [km] (x este, y norte, origen ≈ La Alpujarra). Ilustrativa para los sectores didácticos. */
  km: [number, number];
}

const TERRAIN_VS_COMMON = `#include <common>
attribute vec2 aUrb;
attribute float aVeg;
varying vec3 vWP;
varying vec2 vUrb;
varying float vVeg;`;

const TERRAIN_FS_COMMON = `#include <common>
varying vec3 vWP;
varying vec2 vUrb;
varying float vVeg;
${CARPET_GLSL}
// Suelo de la ciudad entre los edificios (los edificios se dibujan aparte, sobre la red vial): pavimento y
// andenes grises, algún parque; de lejos, el color medio del tejido. base = verde; ub = color del tejido.
vec3 urbanGround(vec2 p, float fw, vec3 base, vec3 ub, float fab, float k) {
  float edge = smoothstep(0.0, 0.6, k + 0.35 * (vn(p * 0.08) - 0.5));
  float n = vn(p * 0.35);
  vec3 pav = vec3(0.4, 0.39, 0.38) * (0.9 + 0.2 * n);
  // jardines y antejardines entre los edificios: mucho en El Poblado, algo en lo plano, poco en el centro;
  // en las laderas, tierra y concreto
  float gw = fab > 3.5 && fab < 4.5 ? 0.62 : fab > 1.5 && fab < 2.5 ? 0.38 : fab > 5.5 ? 0.3 : fab < 1.5 ? 0.12 : 0.1;
  vec3 garden = base * (0.78 + 0.2 * vn(p * 0.9));
  vec3 g = mix(pav, garden, gw * smoothstep(0.25, 0.75, vn(p * 0.22 + 3.0)) * 1.4);
  if (fab < 1.5) g = mix(g, vec3(0.45, 0.37, 0.3), 0.35 * vn(p * 0.5 + 11.0));
  g = mix(g, ub, smoothstep(1.5, 6.0, fw) * 0.55);
  return mix(base, g, edge);
}`;

const TERRAIN_FS_COLOR = `#include <color_fragment>
{
  vec2 p = vWP.xz; // unidades de escena (1 = 10 m)
  float fw = max(fwidth(p.x), fwidth(p.y)); // unidades por píxel
  // vegetación: potreros y bosques en manchas, sin repetir
  float n = vn(p * 0.045) * 0.6 + vn(p * 0.17) * 0.4;
  vec3 green = diffuseColor.rgb * (0.86 + 0.28 * n);
  green = mix(green, vec3(0.17, 0.32, 0.15), smoothstep(0.35, 0.75, vVeg + 0.3 * (n - 0.5)) * 0.9);
  diffuseColor.rgb = green;
  if (vUrb.y > 0.01) diffuseColor.rgb = urbanGround(p, fw, green, vUrbBase, floor(vUrb.x + 0.5), vUrb.y);
}`;

// Fachadas y techos de los edificios del valle (todo con ruido por lote, sin texturas). aB = (tipo + 4 × techo,
// semilla, lotes, pisos); tipo 0 casas en hilera · 1 apartamentos y torres · 2 bodegas · 3 casas rurales;
// techo 0 losa de concreto · 1 teja de barro · 2 zinc o fibrocemento · 3 claro. Los detalles (ventanas,
// medianeras, tanques de agua) aparecen solo cuando un piso mide varios píxeles: de lejos, su color medio.
const BUILDING_FS = `#include <color_fragment>
{
  float kp = vB.x;
  float roofT = floor(kp / 4.0 + 0.01);
  float kind = kp - 4.0 * roofT;
  float seed = vB.y, lots = max(1.0, vB.z), floors = max(1.0, vB.w);
  float W = vBS.x, H = vBS.y, Dp = vBS.z;
  float lotIdx = floor(clamp(vBL.x + 0.5, 0.0, 0.9999) * lots);
  float lr = bh(vec2(seed * 97.0 + lotIdx, seed * 13.0 + 3.0));
  if (vBN.y > 0.5) {
    float rt = roofT;
    if (kind < 0.5 && lr < 0.22) rt = mod(rt + 1.0 + floor(lr * 9.0), 4.0); // lotes vecinos con otro techo
    vec3 roof = rt < 0.5 ? vec3(0.56, 0.55, 0.53) : rt < 1.5 ? vec3(0.63, 0.31, 0.2) : rt < 2.5 ? vec3(0.57, 0.61, 0.64) : vec3(0.8, 0.79, 0.76);
    roof *= 0.84 + 0.28 * lr;
    vec2 rp = vec2((vBL.x + 0.5) * W, (vBL.z + 0.5) * Dp);
    float pr = fwidth(rp.x);
    float detR = 1.0 - smoothstep(0.012, 0.04, pr);
    // pretil más claro en el borde de cada lote
    float lw = W / lots;
    float lx = mod(rp.x, lw);
    float e = min(min(lx, lw - lx), min(rp.y, Dp - rp.y));
    roof = mix(roof, roof * 1.2, (1.0 - smoothstep(0.0, 0.07, e)) * detR);
    // tanque de agua negro en algunas terrazas (casas y apartamentos)
    if (kind < 1.5 && rt < 0.5) {
      vec2 tc = vec2(lotIdx * lw + lw * (0.3 + 0.4 * bh(vec2(lr, 5.0))), Dp * (0.25 + 0.5 * bh(vec2(lr, 9.0))));
      float tk = 1.0 - smoothstep(0.06, 0.09, length(rp - tc));
      roof = mix(roof, vec3(0.09, 0.1, 0.11), tk * detR * step(0.45, bh(vec2(lr, 2.0))));
    }
    // bodegas: cubierta acanalada
    if (kind > 1.5 && kind < 2.5) roof *= 0.94 + 0.06 * step(0.5, fract(rp.y * 2.5)) * detR;
    diffuseColor.rgb = roof;
  } else {
    bool side = abs(vBN.x) > 0.5;
    float along = side ? (vBL.z + 0.5) * Dp : (vBL.x + 0.5) * W;
    float yy = vBL.y * H;
    float fh = H / floors;
    float pxs = max(fwidth(along), fwidth(yy));
    // dos niveles de detalle: franjas de ventanas por piso (si un piso mide ≥ 4 px) y ventanas sueltas (≥ 12 px)
    float detB = 1.0 - smoothstep(0.12, 0.3, pxs / fh);
    float det = 1.0 - smoothstep(0.05, 0.1, pxs / fh);
    vec3 col = diffuseColor.rgb;
    if (kind < 0.5 && !side) {
      col *= 0.8 + 0.4 * lr; // cada casa de la hilera con su tono
      if (lr > 0.86) col = mix(col, vec3(0.86, 0.84, 0.78), 0.7); // alguna pintada de claro
    }
    float cw = kind > 0.5 && kind < 1.5 ? 0.31 : 0.4; // módulo de ventana [10 m]
    vec2 cell = vec2(along / cw, yy / fh);
    vec2 f = fract(cell);
    float band = step(0.34, f.y) * step(f.y, 0.78);
    float win = band * step(0.22, f.x) * step(f.x, 0.78);
    if (kind > 1.5 && kind < 2.5) { band = step(0.78, yy / H) * step(yy / H, 0.92); win = band * step(0.1, f.x) * step(f.x, 0.9); }
    if (yy < fh * 0.3 || yy > H - fh * 0.15) { band = 0.0; win = 0.0; }
    float wr = bh(floor(cell) + vec2(seed * 7.0, lotIdx));
    vec3 glass = mix(vec3(0.17, 0.21, 0.26), vec3(0.56, 0.65, 0.74), step(0.7, wr) * 0.8);
    float cover = kind > 0.5 && kind < 1.5 ? 0.42 : kind > 1.5 && kind < 2.5 ? 0.1 : 0.26;
    vec3 far = mix(col, glass, cover * 0.5);
    vec3 mid = mix(col, mix(col, glass, 0.62), band);
    vec3 near = mix(col, glass, win * 0.92);
    col = mix(mix(far, mid, detB), near, det);
    // medianeras entre las casas de una hilera
    if (kind < 0.5 && lots > 1.0 && !side) {
      float lf = fract((vBL.x + 0.5) * lots);
      col *= 1.0 - 0.28 * (1.0 - smoothstep(0.0, 0.035, min(lf, 1.0 - lf))) * det;
    }
    // sombra al pie (oclusión) y cornisa clara arriba
    col *= 0.68 + 0.32 * smoothstep(0.0, 0.45, yy);
    col *= 1.0 + 0.14 * (1.0 - smoothstep(0.0, 0.07, H - yy));
    diffuseColor.rgb = col;
  }
}`;

/** Probabilidad de un árbol cada 11–17 m de andén según el tejido. */
function row0Trees(f: Fabric): number {
  return f === Fabric.Poblado ? 0.75 : f === Fabric.Plano ? 0.55 : f === Fabric.Municipio ? 0.35 : f === Fabric.Centro ? 0.25 : f === Fabric.Ladera ? 0.08 : 0;
}

/** Ruido de valor suave en [0, 1] (para agrupar torres y parques). */
function vnoise2(x: number, y: number): number {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (h(i, j) * (1 - su) + h(i + 1, j) * su) * (1 - sv) + (h(i, j + 1) * (1 - su) + h(i + 1, j + 1) * su) * sv;
}

/** Disco blanco con aro de color (marca de estación, de tamaño fijo en pantalla). */
function stationTexture(color: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.beginPath();
  g.arc(32, 32, 27, 0, Math.PI * 2);
  g.fillStyle = '#ffffff';
  g.fill();
  g.lineWidth = 9;
  g.strokeStyle = color;
  g.stroke();
  g.beginPath();
  g.arc(32, 32, 31, 0, Math.PI * 2);
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(20,30,40,0.55)';
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ValleyScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly labels: LabelLayer;
  private container: HTMLElement;
  private reducedMotion: boolean;
  private quality: 'alta' | 'ligera';
  private anchors: { id: string; at: THREE.Vector3 }[] = [];
  private pinMeshes: THREE.Mesh[] = [];
  private pins: SectorPin[];
  private tween: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; start: number; dur: number; done?: () => void } | null = null;
  private disposed = false;
  private time = 0;
  /** Cuántos edificios se dibujaron (para la verificación y el rendimiento). */
  cityStats: { edificios: number; torres: number; lotesPorEdificio: number; franjas: number; cupo: number; generados: number; arbolesAnden: number } | null = null;
  private movers: { mesh: THREE.Object3D; path: THREE.Vector3[]; len: number[]; total: number; phase: number; speed: number; loop: boolean }[] = [];
  private textures: THREE.Texture[] = [];
  private clouds: THREE.Sprite[] = [];
  private lineMats: LineMaterial[] = [];
  // malla del relieve (para apoyar objetos exactamente sobre lo dibujado)
  private gx0 = 0;
  private gy0 = 0;
  private gst = 0.1;
  private gnx = 0;
  private gny = 0;
  private gz: Float32Array = new Float32Array(0);

  constructor(container: HTMLElement, pins: SectorPin[], opts: { reducedMotion: boolean; quality: 'alta' | 'ligera' }) {
    this.container = container;
    this.pins = pins;
    this.reducedMotion = opts.reducedMotion;
    this.quality = opts.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.quality === 'alta', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'alta' ? 2 : 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.className = 'city-canvas';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Vista 3D del Valle de Aburrá con datos oficiales: el relieve, el río Medellín de sur a norte con sus quebradas, el metro, el tranvía, los metrocables y el Metroplús con sus estaciones, los municipios y los barrios que suben por las laderas. Elige un sector en el panel o tocando su marcador.',
    );
    container.appendChild(this.renderer.domElement);
    this.labels = new LabelLayer(container);
    this.camera = new THREE.PerspectiveCamera(40, 1, 5, 20000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !opts.reducedMotion;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 120;
    this.controls.maxDistance = 3600;
    this.controls.listenToKeyEvents(this.renderer.domElement);
    this.controls.keyPanSpeed = 30;
    // cielo de Medellín: azul claro con bruma; las montañas lejanas se aclaran
    this.scene.background = new THREE.Color('#c9dbe8');
    this.scene.fog = new THREE.Fog('#c9dbe8', 2400, 6200);
    this.scene.add(new THREE.HemisphereLight('#eef6ff', '#5a4c3c', 1.1));
    const sun = new THREE.DirectionalLight('#fff0d6', 2.2);
    sun.position.set(-700, 900, 300); // sol de la tarde desde el occidente
    this.scene.add(sun);
    this.build();
    this.home();
    this.resize();
  }

  /** km → mundo (x este, y norte); z en m sobre 1400 con exageración. */
  w(x: number, y: number, z?: number): THREE.Vector3 {
    const zz = z ?? this.groundZ(x, y);
    return new THREE.Vector3(x * U, mz(zz - 1400), -y * U);
  }

  /** Cota [m] de la malla dibujada en (x, y) [km] (bilineal): los objetos se apoyan en lo que se ve. */
  groundZ(x: number, y: number): number {
    if (!this.gz.length) return valleyZ(x, y);
    const fi = Math.min(this.gnx - 1.001, Math.max(0, (x - this.gx0) / this.gst));
    const fj = Math.min(this.gny - 1.001, Math.max(0, (y - this.gy0) / this.gst));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, n = this.gnx;
    const a = this.gz[j * n + i], b = this.gz[j * n + i + 1], c = this.gz[(j + 1) * n + i], d = this.gz[(j + 1) * n + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  private build(): void {
    const alta = this.quality === 'alta';
    const rnd = prng(2026);
    this.buildTerrain(alta);
    this.buildRiverAndRoads();
    this.buildCreeks();
    this.buildBoundaries();
    const keepOut = this.buildLandmarks();
    const streetTrees = this.buildCity(alta, keepOut);
    this.buildTrees(alta, rnd, streetTrees);
    this.buildTransit();
    this.buildClouds(rnd);
    this.buildPins();
    this.buildLabels();
  }

  // ------------------------------------------------------------ relieve con tapiz urbano
  private buildTerrain(alta: boolean): void {
    const st = alta ? 0.1 : 0.15;
    const { x0, x1, y0, y1 } = EXTENT;
    const nx = Math.floor((x1 - x0) / st + 1e-6) + 1, ny = Math.floor((y1 - y0) / st + 1e-6) + 1;
    this.gx0 = x0;
    this.gy0 = y0;
    this.gst = st;
    this.gnx = nx;
    this.gny = ny;
    this.gz = new Float32Array(nx * ny);
    const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3), urb = new Float32Array(nx * ny * 2), veg = new Float32Array(nx * ny);
    const c = new THREE.Color();
    const pasture = new THREE.Color('#84ad5c'), forest = new THREE.Color('#3f6c34'), high = new THREE.Color('#5f8546'), haze = new THREE.Color('#9fae8f');
    const urbBase: Record<number, THREE.Color> = {
      // tonos algo apagados: a la escala del valle el ladrillo saturado se vuelve una mancha roja
      [Fabric.Ladera]: new THREE.Color('#9a6550'),
      [Fabric.Plano]: new THREE.Color('#857f6a'),
      [Fabric.Centro]: new THREE.Color('#8e8984'),
      [Fabric.Poblado]: new THREE.Color('#727760'),
      [Fabric.Industria]: new THREE.Color('#9b9a96'),
      [Fabric.Municipio]: new THREE.Color('#93705e'),
    };
    const ub = new Float32Array(nx * ny * 3);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * st, y = y0 + j * st;
      const z = valleyZ(x, y);
      const o = j * nx + i;
      this.gz[o] = z;
      pos[o * 3] = x * U;
      pos[o * 3 + 1] = mz(z - 1400);
      pos[o * 3 + 2] = -y * U;
      const cr = cross(x, y);
      // verde: potreros abajo, bosque en las cañadas y en el altiplano de Santa Elena (Arví)
      const h = Math.min(1, Math.max(0, (z - 1700) / 1200));
      c.copy(pasture).lerp(high, h * 0.7);
      const v = forestAt(x, y);
      const fab = fabricAt(x, y, z);
      urb[o * 2] = fab.f;
      urb[o * 2 + 1] = fab.k;
      veg[o] = Math.min(1, v);
      const base = urbBase[fab.f] ?? forest;
      ub[o * 3] = base.r;
      ub[o * 3 + 1] = base.g;
      ub[o * 3 + 2] = base.b;
      // cauce y retiro del río: parque lineal
      if (cr.d < 0.07) c.set('#6d9a4c');
      // fuera del área con datos del AMVA el relieve es un relleno: se tiñe con la bruma y sin bosque
      if (isFilled(x, y)) {
        c.lerp(haze, 0.55);
        veg[o] *= 0.3;
      }
      col[o * 3] = c.r;
      col[o * 3 + 1] = c.g;
      col[o * 3 + 2] = c.b;
    }
    // bosque en los retiros de las quebradas (franjas verdes oscuras que bajan entre los barrios)
    for (const cr of creeks()) {
      const rad = cr.order >= 3 ? 2 : 1;
      for (const [px, py] of cr.pts) {
        const ci = Math.round((px - x0) / st), cj = Math.round((py - y0) / st);
        for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
          const ii = ci + di, jj = cj + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const o = jj * nx + ii;
          const f = Math.exp(-(di * di + dj * dj) / 1.6);
          veg[o] = Math.max(veg[o], 0.9 * f);
          urb[o * 2 + 1] *= 1 - 0.5 * f;
        }
      }
    }
    const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
    let q = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx[q++] = a;
      idx[q++] = b;
      idx[q++] = d;
      idx[q++] = b;
      idx[q++] = e;
      idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aUrb', new THREE.BufferAttribute(urb, 2));
    g.setAttribute('aVeg', new THREE.BufferAttribute(veg, 1));
    g.setAttribute('aUrbBase', new THREE.BufferAttribute(ub, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', TERRAIN_VS_COMMON + '\nattribute vec3 aUrbBase;\nvarying vec3 vUrbBase;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;\nvUrb = aUrb;\nvVeg = aVeg;\nvUrbBase = aUrbBase;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', TERRAIN_FS_COMMON + '\nvarying vec3 vUrbBase;').replace('#include <color_fragment>', TERRAIN_FS_COLOR);
    };
    this.scene.add(new THREE.Mesh(g, m));
    this.buildSkirt(x0, x1, y0, y1);
  }

  /** Montañas que rodean el esquema hasta el horizonte (MDE del AMVA a 800 m y relleno suave fuera de él). */
  private buildSkirt(x0: number, x1: number, y0: number, y1: number): void {
    const st = 0.8, X0 = -45, X1 = 45, Y0 = -50, Y1 = 45;
    const nx = Math.round((X1 - X0) / st) + 1, ny = Math.round((Y1 - Y0) / st) + 1;
    const P = new Float32Array(nx * ny * 3), C = new Float32Array(nx * ny * 3);
    const col = new THREE.Color(), pasture = new THREE.Color('#77a057'), forest = new THREE.Color('#3f6c34'), haze = new THREE.Color('#9fae8f');
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = X0 + i * st, y = Y0 + j * st, o = j * nx + i;
      const z = outerZ(x, y);
      const inside = x > x0 && x < x1 && y > y0 && y < y1;
      P[o * 3] = x * U;
      P[o * 3 + 1] = mz(z - 1400) - (inside ? 4 : 0);
      P[o * 3 + 2] = -y * U;
      col.copy(pasture).lerp(forest, forestAt(x, y) * 0.8).lerp(haze, 0.35);
      C[o * 3] = col.r;
      C[o * 3 + 1] = col.g;
      C[o * 3 + 2] = col.b;
    }
    const I: number[] = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const xa = X0 + i * st, ya = Y0 + j * st;
      if (xa >= x0 && xa + st <= x1 && ya >= y0 && ya + st <= y1) continue; // lo cubre el relieve detallado
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      I.push(a, b, d, b, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    this.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  }

  /** Cinta apoyada en el relieve a lo largo de una polilínea [km]. */
  private ribbon(pts: [number, number][], widthKm: number, offsetKm: number, color: string, lift: number, opts: { emissive?: string; rough?: number } = {}): THREE.Mesh {
    const P: number[] = [], I: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const L = Math.hypot(tx, ty) || 1;
      tx /= L;
      ty /= L;
      const nx = ty, ny = -tx; // a la derecha del avance
      for (const s of [-0.5, 0.5]) {
        const x = pts[i][0] + nx * (offsetKm + s * widthKm), y = pts[i][1] + ny * (offsetKm + s * widthKm);
        const v = this.w(x, y);
        P.push(v.x, v.y + lift, v.z);
      }
      if (i > 0) {
        const q = (i - 1) * 2;
        I.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (opts.emissive) {
      mat.emissive = new THREE.Color(opts.emissive);
      mat.emissiveIntensity = 0.35;
    }
    const mesh = new THREE.Mesh(g, mat);
    this.scene.add(mesh);
    return mesh;
  }

  /** Remuestrea una polilínea cada `step` km con una curva suave. */
  private resample(pts: [number, number][], step: number): [number, number][] {
    if (pts.length < 2) return pts;
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
    const n = Math.max(2, Math.ceil(curve.getLength() / step));
    return curve.getSpacedPoints(n).map((v) => [v.x, v.y] as [number, number]);
  }

  /** Material de línea con ancho fijo en pantalla [px] (se actualiza su resolución al cambiar el tamaño). */
  private lineMat(color: string, px: number, opts: { opacity?: number; dashed?: boolean; dash?: number; gap?: number } = {}): LineMaterial {
    const m = new LineMaterial({
      color: new THREE.Color(color).getHex(),
      linewidth: px,
      worldUnits: false,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
      dashed: !!opts.dashed,
      dashSize: opts.dash ?? 30,
      gapSize: opts.gap ?? 20,
      fog: true,
    });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -4;
    m.polygonOffsetUnits = -4;
    this.lineMats.push(m);
    return m;
  }

  /** Polilínea [km] apoyada sobre el terreno, levantada `liftM` metros. */
  private draped(pts: [number, number][], stepKm: number, liftM: number): number[] {
    const out: number[] = [];
    for (const [x, y] of this.resample(pts, stepKm)) {
      const v = this.w(x, y, this.groundZ(x, y) + liftM);
      out.push(v.x, v.y, v.z);
    }
    return out;
  }

  /** Línea de ancho fijo en pantalla con un borde más ancho debajo (para que se lea sobre cualquier fondo). */
  private screenLine(flat: number[], color: string, px: number, casing: string | null, order: number, opts: { opacity?: number; dashed?: boolean } = {}): void {
    if (flat.length < 6) return;
    if (casing) {
      // borde opaco y sin escribir profundidad: el trazo de color, dibujado después, queda siempre encima
      // (con el borde transparente se dibujaba al final y tapaba la línea)
      const gc = new LineGeometry();
      gc.setPositions(flat);
      const mc = this.lineMat(casing, px + 3);
      mc.depthWrite = false;
      const lc = new Line2(gc, mc);
      lc.renderOrder = order;
      this.scene.add(lc);
    }
    const g = new LineGeometry();
    g.setPositions(flat);
    const l = new Line2(g, this.lineMat(color, px, opts));
    if (opts.dashed) l.computeLineDistances();
    l.renderOrder = order + 1;
    this.scene.add(l);
  }

  /** Muchas polilíneas en una sola malla de segmentos de ancho fijo en pantalla. */
  private screenSegments(lines: [number, number][][], stepKm: number, liftM: number, color: string, px: number, order: number, opts: { opacity?: number; dashed?: boolean; dash?: number; gap?: number } = {}): void {
    const seg: number[] = [];
    for (const pts of lines) {
      const f = this.draped(pts, stepKm, liftM);
      for (let i = 3; i < f.length; i += 3) seg.push(f[i - 3], f[i - 2], f[i - 1], f[i], f[i + 1], f[i + 2]);
    }
    if (!seg.length) return;
    const g = new LineSegmentsGeometry();
    g.setPositions(seg);
    const l = new LineSegments2(g, this.lineMat(color, px, opts));
    if (opts.dashed) l.computeLineDistances();
    l.renderOrder = order;
    this.scene.add(l);
  }

  private buildRiverAndRoads(): void {
    const river = this.resample(RIVER_PATH, 0.06);
    // río canalizado con su parque lineal (las autopistas son las de la red vial oficial)
    this.ribbon(river, 0.07, 0.1, '#6c9a4f', 0.25);
    this.ribbon(river, 0.07, -0.1, '#6c9a4f', 0.25);
    this.ribbon(river, 0.06, 0, '#5d8fa6', 0.45, { emissive: '#163a52', rough: 0.25 });
    // vías principales: cintas de su ancho real (se ven de cerca) y un trazo fino de pantalla (de lejos)
    for (const r of ROADS) if (r.cls === 1) this.ribbon(this.resample(r.pts, 0.06), 0.03, 0, '#55585c', 0.35);
    this.screenSegments(ROADS.filter((r) => r.cls === 1).map((r) => r.pts), 0.1, 6, VALLEY_COLORS.via, 1.6, 2, { opacity: 0.9 });
    this.screenSegments(ROADS.filter((r) => r.cls === 2).map((r) => r.pts), 0.12, 6, '#6c7076', 1, 2, { opacity: 0.55 });
    // trazo del río (se lee a cualquier distancia)
    this.screenLine(this.draped(RIVER_PATH, 0.08, 10), VALLEY_COLORS.rio, 4, '#e8f3ff', 6);
  }

  private buildCreeks(): void {
    // ancho según el orden de Strahler: las cabeceras finas, los cauces mayores más gruesos
    const by = new Map<number, [number, number][][]>();
    for (const c of creeks()) {
      const o = Math.min(4, c.order);
      const arr = by.get(o);
      if (arr) arr.push(c.pts);
      else by.set(o, [c.pts]);
    }
    for (const [o, lines] of by) this.screenSegments(lines, 0.08, 8, VALLEY_COLORS.quebrada, 0.9 + 0.55 * o, 4, { opacity: o === 1 ? 0.8 : 1 });
  }

  private buildBoundaries(): void {
    this.screenSegments(boundaries(), 0.1, 12, VALLEY_COLORS.limite, 1.4, 3, { opacity: 0.75, dashed: true, dash: 22, gap: 14 });
  }

  /** Aeropuerto, unidad deportiva, Coltejer, Biblioteca España. Devuelve zonas sin edificios genéricos. */
  private buildLandmarks(): { x: number; y: number; r: number }[] {
    const out: { x: number; y: number; r: number }[] = [];
    // Aeropuerto Olaya Herrera: pista (polígono oficial) y terminal
    const [sx, sy] = PLACES.runwayS, [nx, ny] = PLACES.runwayN;
    const a = this.w(sx, sy), b = this.w(nx, ny);
    const len = a.distanceTo(b);
    const runway = new THREE.Mesh(new THREE.BoxGeometry(Math.max(3, RUNWAY_W * U), 0.5, len), new THREE.MeshStandardMaterial({ color: '#5b5f64', roughness: 0.85 }));
    runway.position.copy(a).lerp(b, 0.5).add(new THREE.Vector3(0, 0.6, 0));
    runway.lookAt(b.x, runway.position.y, b.z);
    this.scene.add(runway);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.52, len * 0.9), new THREE.MeshStandardMaterial({ color: '#e9ecef' }));
    mark.position.copy(runway.position).add(new THREE.Vector3(0, 0.02, 0));
    mark.quaternion.copy(runway.quaternion);
    this.scene.add(mark);
    const terminal = new THREE.Mesh(new THREE.BoxGeometry(9, mz(12), 4), new THREE.MeshStandardMaterial({ color: '#e7e2d6', roughness: 0.8 }));
    const tp = this.w(...PLACES.aeropuerto);
    terminal.position.set(tp.x, tp.y + mz(6), tp.z);
    terminal.lookAt(tp.x + (b.x - a.x), terminal.position.y, tp.z + (b.z - a.z));
    this.scene.add(terminal);
    for (let t = 0; t <= 1; t += 0.1) out.push({ x: sx + (nx - sx) * t, y: sy + (ny - sy) * t, r: 0.12 });
    // Unidad Deportiva Atanasio Girardot: estadio
    const ep = this.w(...PLACES.estadio);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 2.4, 6, 32), new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.8 }));
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1, 1.3, 1);
    ring.position.set(ep.x, ep.y + 1.5, ep.z);
    const field = new THREE.Mesh(new THREE.CircleGeometry(7.2, 32), new THREE.MeshStandardMaterial({ color: '#4f9a3f', roughness: 0.9 }));
    field.rotation.x = -Math.PI / 2;
    field.scale.set(1, 1.3, 1);
    field.position.set(ep.x, ep.y + 0.8, ep.z);
    this.scene.add(ring, field);
    out.push({ x: PLACES.estadio[0], y: PLACES.estadio[1], r: Math.max(0.15, ESTADIO_R * 0.8) });
    // Edificio Coltejer: torre con su remate en aguja (≈ 175 m)
    const cp = this.w(...PLACES.coltejer);
    const cm = new THREE.MeshStandardMaterial({ color: '#d2d5d8', roughness: 0.55, metalness: 0.15 });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(3.2, mz(150), 3.2), cm);
    shaft.position.set(cp.x, cp.y + mz(75), cp.z);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.3, mz(30), 4), cm);
    crown.rotation.y = Math.PI / 4;
    crown.position.set(cp.x, cp.y + mz(150) + mz(15), cp.z);
    this.scene.add(shaft, crown);
    out.push({ x: PLACES.coltejer[0], y: PLACES.coltejer[1], r: 0.07 });
    // Parque Biblioteca España (Santo Domingo Savio): tres volúmenes oscuros como rocas
    const bp = this.w(...PLACES.bibliotecaEspana);
    const rock = new THREE.MeshStandardMaterial({ color: '#2f2d2b', roughness: 0.7 });
    [[-2.2, 0, 0.35], [0.4, 1.6, -0.2], [2.4, -0.6, 0.5]].forEach(([dx, dz, r], i) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, mz(28 + i * 4), 2.2), rock);
      box.position.set(bp.x + dx, bp.y + mz(12 + i * 2), bp.z + dz);
      box.rotation.set(0.12 * (i - 1), r, 0.1);
      this.scene.add(box);
    });
    out.push({ x: PLACES.bibliotecaEspana[0], y: PLACES.bibliotecaEspana[1], r: 0.06 });
    // cerros tutelares sin barrios encima (bosque)
    for (const h of HILLS) if (h.tutelar) out.push({ x: h.x, y: h.y, r: h.r * 0.55 });
    return out;
  }

  // ------------------------------------------------------------ edificios
  /**
   * Edificios a lo largo de las franjas edificables de la red vial oficial (edificios.ts). En cada franja, con un
   * azar fijo, se alternan lotes: casas en hilera, apartamentos y torres según la distribución de pisos de su
   * barrio (catastro de Medellín) o de su municipio (ilustrativa), bodegas en el tejido industrial y casas
   * sueltas en lo rural. Se devuelven los puntos de los árboles de las calles (en los andenes).
   */
  private buildCity(alta: boolean, keepOut: { x: number; y: number; r: number }[]): THREE.Vector3[] {
    const runs = franjas();
    const budget = alta ? 115000 : 60000;
    const lotRange = (f: Fabric): [number, number] => (f === Fabric.Ladera ? [6, 9] : f === Fabric.Centro ? [10, 16] : f === Fabric.Industria ? [12, 18] : [8, 12]);
    const fabs = new Uint8Array(runs.length), ks = new Float32Array(runs.length);
    runs.forEach((r, i) => {
      const fb = fabricAt(r.x + ((Math.cos(r.a) * r.L) / 2 - (Math.sin(r.a) * r.d) / 2) / 1000, r.y + ((Math.sin(r.a) * r.L) / 2 + (Math.cos(r.a) * r.d) / 2) / 1000);
      fabs[i] = fb.f;
      ks[i] = fb.k;
    });
    const brick = [0xa85a3c, 0xb4643f, 0x9c4f33, 0xb86a45, 0xa35c40, 0xad6a4a];
    const painted = [0xe2b64e, 0x4fa3a1, 0xd77f72, 0x7fb069, 0xd8a0b5, 0x6f9fd8, 0xe58e4f];
    const light = [0xe6e1d6, 0xd8d2c6, 0xcfd5da, 0xece7dc, 0xc9c2b6, 0xe3dccb];
    const gray = [0xa7a6a1, 0x9a9893, 0xb3b1aa];
    const glassy = [0x8fa3b3, 0x7d93a6, 0xa9b8c2];
    const pick = (a: number[], r: number) => a[Math.min(a.length - 1, Math.floor(r * a.length))];
    const FIELDS = 11; // cx, cy, a, w, d, pisos, tipo, techo, lotes, color, semilla

    /** Reparte los edificios de todas las franjas con `merge` lotes por casa en hilera. */
    const generate = (merge: number) => {
      const B: number[] = [];
      let rows = 0; // edificios en hilera (los que se agrupan)
      const trees: [number, number][] = [];
      const put = (rnd: () => number, cx: number, cy: number, a: number, w: number, d: number, floors: number, kind: number, roof: number, lots: number, color: number) => {
        if (keepOut.some((k) => Math.hypot(cx - k.x, cy - k.y) < k.r)) return;
        B.push(cx, cy, a, w, d, floors, kind, roof, lots, color, Math.floor(rnd() * 997));
      };
      for (let i = 0; i < runs.length; i++) {
        const r = runs[i];
        const rnd = prng(1000003 + i * 7919);
        const f = fabs[i] as Fabric, k = ks[i];
        const z = zona(r.z);
        const ca = Math.cos(r.a), sa = Math.sin(r.a);
        const nx = -sa, ny = ca; // los edificios quedan a la izquierda del sentido de la franja
        const at = (s: number, off: number): [number, number] => [r.x + (ca * s + nx * off) / 1000, r.y + (sa * s + ny * off) / 1000];
        // las torres se agrupan: un ruido espacial de ≈ 400 m sube o baja su probabilidad (en promedio el barrio se conserva)
        const tn = 0.25 + 1.5 * vnoise2(r.x * 2.5, r.y * 2.5);
        const hist = z.h.map((v, b) => (GRUPOS_PISOS[b][0] >= 6 ? v * tn : v));
        // la tabla es de huella: un grupo de edificios más anchos sale menos veces por lote para la misma huella
        const widthOf = (b: number) => (GRUPOS_PISOS[b][0] >= 9 ? 22 : GRUPOS_PISOS[b][0] >= 6 ? 16 : 10 * merge);
        const wts = hist.map((v, b) => v / widthOf(b));
        const tot = wts.reduce((a, b) => a + b, 0) || 1;
        const sampleFloors = (): number => {
          let u = rnd() * tot, b = 0;
          while (b < wts.length - 1 && u > wts[b]) u -= wts[b++];
          const [lo, hi] = GRUPOS_PISOS[b];
          return lo + Math.floor(rnd() * (hi - lo + 1));
        };
        const [l0, l1] = lotRange(f);
        if (f === Fabric.None) {
          // rural: casas sueltas de uno o dos pisos, casi todas con teja de barro
          let s = 4 + rnd() * 25;
          while (s < r.L - 8) {
            if (rnd() < 0.35) {
              const w = 7 + rnd() * 5, d = Math.min(r.d, 6 + rnd() * 4);
              const [cx, cy] = at(s + w / 2, 1.5 + d / 2);
              put(rnd, cx, cy, r.a, w, d, rnd() < 0.75 ? 1 : 2, 3, rnd() < 0.7 ? 1 : 2, 1, rnd() < 0.6 ? pick(light, rnd()) : pick(painted, rnd()));
            }
            s += 18 + rnd() * 30;
          }
          continue;
        }
        const rowDepth = f === Fabric.Ladera ? 9 + rnd() * 3 : 11 + rnd() * 5;
        const twoRows = r.d >= rowDepth * 2 + 2 && f !== Fabric.Industria;
        for (const row of twoRows ? [0, 1] : [0]) {
          let s = row === 0 ? 0 : (l0 / 2) * rnd();
          const off0 = row === 0 ? 0 : rowDepth + 1.5;
          const dAvail = row === 0 ? (twoRows ? rowDepth : r.d) : r.d - rowDepth - 1.5;
          while (s < r.L - 3) {
            let floors = sampleFloors();
            if (f === Fabric.Industria && floors <= 3 && rnd() < 0.8) {
              // bodega: todo el fondo de la franja
              const w = Math.min(r.L - s, 22 + rnd() * 38);
              if (w < 8) break;
              if (rnd() < z.fill) {
                const [cx, cy] = at(s + w / 2, off0 + dAvail / 2);
                put(rnd, cx, cy, r.a, w, dAvail * (0.85 + 0.15 * rnd()), floors, 2, rnd() < 0.7 ? 3 : 2, 1, rnd() < 0.7 ? pick(light, rnd()) : pick(gray, rnd()));
              }
              s += w + 2 + rnd() * 6;
              continue;
            }
            if (floors >= 6 && (dAvail < 12 || row === 1)) floors = 3 + Math.floor(rnd() * 3);
            if (floors >= 6) {
              // apartamentos y torres: volumen suelto, retirado del andén, con aire entre uno y otro
              const big = floors >= 9;
              const w = Math.min(r.L - s, (big ? (f === Fabric.Poblado ? 18 : 16) : 13) + rnd() * (big ? 10 : 8));
              if (w >= 10) {
                const d = Math.max(10, Math.min(dAvail - 1, w * (0.75 + 0.5 * rnd())));
                const setback = Math.min(dAvail - d, 1 + rnd() * 5);
                if (rnd() < z.fill) {
                  const [cx, cy] = at(s + w / 2, off0 + setback + d / 2);
                  const c = f === Fabric.Poblado ? (rnd() < 0.55 ? pick(brick, rnd()) : rnd() < 0.7 ? pick(light, rnd()) : pick(glassy, rnd())) : rnd() < 0.4 ? pick(brick, rnd()) : rnd() < 0.85 ? pick(light, rnd()) : pick(glassy, rnd());
                  put(rnd, cx, cy, r.a, w, d, floors, 1, rnd() < 0.8 ? 3 : 0, 1, c);
                }
                s += w + (big ? 5 + rnd() * 9 : 2 + rnd() * 5);
                continue;
              }
              floors = 3 + Math.floor(rnd() * 2);
            }
            // casas en hilera: `merge` lotes por edificio, fachada continua sobre el andén
            let w = 0;
            for (let l = 0; l < merge; l++) w += l0 + rnd() * (l1 - l0);
            w = Math.min(w, r.L - s);
            if (w < 4) break;
            if (rnd() < z.fill) {
              const d = dAvail * (f === Fabric.Ladera ? 0.8 + 0.2 * rnd() : 0.85 + 0.15 * rnd());
              const [cx, cy] = at(s + w / 2, off0 + d / 2);
              let c: number, roof: number;
              if (f === Fabric.Ladera) {
                const u = rnd();
                c = u < 0.62 ? pick(brick, rnd()) : u < 0.86 ? pick(painted, rnd()) : u < 0.94 ? pick(gray, rnd()) : pick(light, rnd());
                roof = rnd() < 0.62 ? 0 : rnd() < 0.7 ? 2 : 1;
              } else if (f === Fabric.Centro) {
                c = rnd() < 0.5 ? pick(light, rnd()) : rnd() < 0.6 ? pick(gray, rnd()) : pick(brick, rnd());
                roof = rnd() < 0.8 ? 0 : 3;
              } else {
                const u = rnd();
                c = u < 0.52 ? pick(brick, rnd()) : u < 0.88 ? pick(light, rnd()) : pick(painted, rnd());
                roof = rnd() < 0.6 ? 0 : rnd() < 0.75 ? 1 : 2;
              }
              put(rnd, cx, cy, r.a, w, d, Math.max(1, floors), 0, roof, Math.max(1, Math.round(w / ((l0 + l1) / 2))), c);
              rows++;
            }
            s += w + (f === Fabric.Ladera && rnd() < 0.25 ? 1 + rnd() * 2 : 0);
          }
        }
        // árboles en el andén (más en las zonas planas y en El Poblado)
        if (row0Trees(f) > 0 && i % (alta ? 1 : 3) === 0) {
          const pr = row0Trees(f) * Math.min(1, k * 1.3);
          for (let s = 6; s < r.L - 4; s += 11 + rnd() * 6) if (rnd() < pr) trees.push(at(s, -1.2));
        }
      }
      return { B, trees, rows };
    };
    // primero lote por lote; si pasa del cupo, cada casa en hilera agrupa más lotes (los edificios altos no se
    // agrupan): se estima cuántos lotes por edificio hacen falta y se ajusta una o dos veces
    let merge = 1, gen = generate(merge);
    while (gen.B.length / FIELDS > budget && merge < 8) {
      const other = gen.B.length / FIELDS - gen.rows;
      const need = gen.rows * merge / Math.max(1, budget - other);
      merge = Math.min(8, Math.max(merge + 1, Math.ceil(need)));
      gen = generate(merge);
    }
    // si aún sobran (calidad ligera), se ralea por igual en todo el valle: nunca se corta una zona entera
    let B = gen.B;
    const total = B.length / FIELDS;
    if (total > budget) {
      const keep = budget / total, kept: number[] = [];
      for (let o = 0; o < B.length; o += FIELDS) if (((B[o + 10] * 0.7548776662 + o * 0.5698402909) % 1) < keep) for (let f = 0; f < FIELDS; f++) kept.push(B[o + f]);
      B = kept;
    }
    const N = Math.min(budget + 2000, B.length / FIELDS);

    // caja sin cara de abajo (no se ve nunca): 10 triángulos por edificio
    const full = new THREE.BoxGeometry(1, 1, 1);
    full.translate(0, 0.5, 0);
    const bottom = full.groups[3];
    const idx = Array.from(full.index!.array);
    idx.splice(bottom.start, bottom.count);
    const box = full;
    box.setIndex(idx);
    box.clearGroups();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aB;\nvarying vec4 vB;\nvarying vec3 vBL;\nvarying vec3 vBS;\nvarying vec3 vBN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvB = aB; vBL = position; vBN = normal;\nvBS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec4 vB;\nvarying vec3 vBL;\nvarying vec3 vBS;\nvarying vec3 vBN;\nfloat bh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
        )
        .replace('#include <color_fragment>', BUILDING_FS);
    };
    const city = new THREE.InstancedMesh(box, mat, N);
    const attr = new Float32Array(N * 4);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const towers: { p: THREE.Vector3; a: number; w: number; d: number }[] = [];
    for (let n = 0; n < N; n++) {
      const o = n * FIELDS;
      const cx = B[o], cy = B[o + 1], a = B[o + 2], w = B[o + 3], d = B[o + 4], floors = B[o + 5], kind = B[o + 6], seed = B[o + 10];
      // en pendiente, la base baja hasta la esquina más baja del lote (no queda flotando)
      const z = this.groundZ(cx, cy);
      const ca = Math.cos(a), sa = Math.sin(a), hw = w / 2000, hd = d / 2000;
      let low = z;
      for (const [u, v] of [[hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]]) low = Math.min(low, this.groundZ(cx + u * ca - v * sa, cy + u * sa + v * ca));
      const sink = z - low + 1.5;
      const hm = kind === 2 ? 7 + floors * 2 : floors * 2.9 + (floors >= 6 ? 1.5 : 0.6);
      p.copy(this.w(cx, cy, z - sink));
      q.setFromAxisAngle(yAxis, a);
      sc.set(w / 10, mz(hm + sink), d / 10);
      city.setMatrixAt(n, m4.compose(p, q, sc));
      city.setColorAt(n, col.setHex(B[o + 9]).multiplyScalar(0.9 + ((seed * 0.6180339) % 1) * 0.18));
      attr[n * 4] = kind + 4 * B[o + 7];
      attr[n * 4 + 1] = seed;
      attr[n * 4 + 2] = B[o + 8];
      attr[n * 4 + 3] = kind === 2 ? 1 : floors;
      if (floors >= 9 && kind === 1) towers.push({ p: p.clone().add(new THREE.Vector3(0, mz(hm + sink), 0)), a, w, d });
    }
    box.setAttribute('aB', new THREE.InstancedBufferAttribute(attr, 4));
    this.scene.add(city);
    // cuartos de máquinas sobre las torres
    if (towers.length) {
      const top = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#cfccc5', roughness: 0.9 }), towers.length);
      towers.forEach((t, i) => {
        q.setFromAxisAngle(yAxis, t.a);
        top.setMatrixAt(i, m4.compose(t.p, q, sc.set((t.w * 0.32) / 10, mz(3.2), (t.d * 0.3) / 10)));
      });
      this.scene.add(top);
    }
    this.cityStats = { edificios: N, torres: towers.length, lotesPorEdificio: merge, franjas: runs.length, cupo: budget, generados: total, arbolesAnden: gen.trees.length };
    return gen.trees.map(([x, y]) => this.w(x, y));
  }

  // ------------------------------------------------------------ árboles
  private buildTrees(alta: boolean, rnd: () => number, streetTrees: THREE.Vector3[]): void {
    const N = alta ? 16000 : 5000;
    const pts: { p: THREE.Vector3; r: number; c: string }[] = [];
    const greens = ['#3f7a34', '#4c8a3c', '#467f38', '#5a9443', '#3a6f31'];
    const { x0, x1, y0, y1 } = EXTENT;
    const tut = HILLS.filter((h) => h.tutelar);
    for (let t = 0; t < N * 10 && pts.length < N; t++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      if (isFilled(x, y)) continue;
      const z = this.groundZ(x, y);
      const fab = fabricAt(x, y, z);
      const cr = cross(x, y);
      let pr = 0;
      const hill = tut.some((h) => Math.hypot(x - h.x, y - h.y) < h.r * 0.6);
      // en la ciudad los árboles van en los andenes (buildCity): aquí solo cerros, bosques y potreros
      if (hill) pr = 0.95;
      else if (fab.f === Fabric.None && cr.d > 0.12) pr = 0.75 * forestAt(x, y);
      else pr = fab.f === Fabric.None ? 0.03 : 0;
      if (rnd() > pr) continue;
      const guayacan = (fab.f === Fabric.Plano || fab.f === Fabric.Poblado) && rnd() < 0.12;
      const r = fab.f === Fabric.None && !hill ? 1.3 + rnd() * 1.1 : 0.7 + rnd() * 0.5;
      pts.push({ p: this.w(x, y, z), r, c: guayacan ? (rnd() < 0.6 ? '#e8b923' : '#e48aae') : greens[Math.floor(rnd() * greens.length)] });
    }
    // cerros tutelares: bosque denso
    for (const h of tut) {
      const n = Math.round(h.r * h.r * (alta ? 900 : 380));
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * h.r * 0.62;
        const x = h.x + Math.cos(a) * rr, y = h.y + Math.sin(a) * rr;
        pts.push({ p: this.w(x, y), r: 0.8 + rnd() * 0.6, c: greens[Math.floor(rnd() * greens.length)] });
      }
    }
    // retiros de las quebradas: franjas de árboles que bajan entre los barrios (cauces urbanos)
    for (const c of creeks()) {
      if (c.order < 2) continue;
      for (const [x, y] of this.resample(c.pts, alta ? 0.06 : 0.1)) {
        if (fabricAt(x, y).f === Fabric.None) continue;
        const tx = x + (rnd() - 0.5) * 0.024, ty = y + (rnd() - 0.5) * 0.024;
        pts.push({ p: this.w(tx, ty), r: 0.7 + rnd() * 0.6, c: greens[Math.floor(rnd() * greens.length)] });
      }
    }
    // árboles de los andenes: copas medianas; algunos guayacanes amarillos o rosados
    for (const t of streetTrees) {
      const u = rnd();
      pts.push({ p: t, r: 0.55 + rnd() * 0.35, c: u < 0.08 ? '#e8b923' : u < 0.13 ? '#e48aae' : greens[Math.floor(rnd() * greens.length)] });
    }
    // en calidad ligera, copas de 8 caras en lugar de 20
    const crown = alta ? new THREE.IcosahedronGeometry(1, 0) : new THREE.OctahedronGeometry(1.15, 0);
    const tm = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), pts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    pts.forEach((t, i) => {
      tm.setMatrixAt(i, m4.compose(t.p.clone().add(new THREE.Vector3(0, t.r * 0.9, 0)), q, s.set(t.r, t.r * 1.15, t.r)));
      tm.setColorAt(i, new THREE.Color(t.c));
    });
    this.scene.add(tm);
  }

  // ------------------------------------------------------------ metro, tranvía, metrocables y Metroplús
  private addMover(mesh: THREE.Object3D, path: THREE.Vector3[], phase: number, speed: number, loop: boolean): void {
    const len = [0];
    for (let i = 1; i < path.length; i++) len.push(len[i - 1] + path[i].distanceTo(path[i - 1]));
    this.movers.push({ mesh, path, len, total: len[len.length - 1], phase, speed, loop });
    this.scene.add(mesh);
  }

  private stationMarks(points: THREE.Vector3[], color: string, px: number): void {
    if (!points.length) return;
    const tex = stationTexture(color);
    if (tex) this.textures.push(tex);
    const g = new THREE.BufferGeometry().setFromPoints(points);
    const m = new THREE.PointsMaterial({ size: px, sizeAttenuation: false, map: tex ?? undefined, color: tex ? '#ffffff' : color, transparent: true, alphaTest: 0.35, depthWrite: false, fog: true });
    const pts = new THREE.Points(g, m);
    pts.renderOrder = 9;
    this.scene.add(pts);
  }

  /** Viaducto del metro: viga, columnas, estaciones y trenes; devuelve la trayectoria de la viga. */
  private viaduct(line: Line, trains: number): THREE.Vector3[] {
    const pts = this.resample(line.pts, 0.06);
    const deck = 2.6; // ≈ 17 m sobre el terreno, con la exageración (perfil vertical ilustrativo)
    const hs = pts.map(([x, y]) => this.groundZ(x, y));
    const smoothH = hs.map((_, i) => {
      let m = -Infinity;
      for (let k = Math.max(0, i - 4); k <= Math.min(hs.length - 1, i + 4); k++) m = Math.max(m, hs[k]);
      return m;
    });
    const path = pts.map(([x, y], i) => this.w(x, y, smoothH[i]).add(new THREE.Vector3(0, deck, 0)));
    const beamM = new THREE.MeshStandardMaterial({ color: '#e3e5e8', roughness: 0.6 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const beams = new THREE.InstancedMesh(unit, beamM, path.length - 1);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const dir = b.clone().sub(a);
      q.setFromUnitVectors(up, dir.clone().normalize());
      beams.setMatrixAt(i - 1, m4.compose(a.clone().lerp(b, 0.5), q, s.set(1.3, 0.55, dir.length())));
    }
    this.scene.add(beams);
    // columnas cada ≈ 300 m
    const cols: { top: THREE.Vector3; at: [number, number] }[] = [];
    for (let i = 0; i < path.length; i += 5) cols.push({ top: path[i], at: pts[i] });
    const colM = new THREE.InstancedMesh(unit, beamM, cols.length);
    cols.forEach((c, i) => {
      const g = this.w(c.at[0], c.at[1]);
      const hgt = c.top.y - g.y;
      colM.setMatrixAt(i, m4.compose(new THREE.Vector3(c.top.x, g.y + hgt / 2, c.top.z), q.identity(), s.set(0.55, hgt, 0.55)));
    });
    this.scene.add(colM);
    // estaciones (posición oficial, sobre la viga): techo claro
    const stM = new THREE.MeshStandardMaterial({ color: '#f4f5f6', roughness: 0.45 });
    for (const [x, y] of line.stations) {
      let bi = 0, bd = Infinity;
      pts.forEach(([px, py], i) => {
        const d = Math.hypot(px - x, py - y);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      const a = path[Math.max(0, bi - 1)], b = path[Math.min(path.length - 1, bi + 1)];
      const st = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.1, 11), stM);
      st.position.copy(path[bi]).add(new THREE.Vector3(0, 0.6, 0));
      st.lookAt(st.position.x + (b.x - a.x), st.position.y, st.position.z + (b.z - a.z));
      this.scene.add(st);
    }
    // trenes
    const trainM = new THREE.MeshStandardMaterial({ color: '#f1f3f4', roughness: 0.35, metalness: 0.2, emissive: new THREE.Color('#1d3a24'), emissiveIntensity: 0.2 });
    for (let k = 0; k < trains; k++) this.addMover(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 7), trainM), path.map((v) => v.clone().add(new THREE.Vector3(0, 0.62, 0))), k / trains, 0.012, false);
    return path;
  }

  private buildTransit(): void {
    const C = VALLEY_COLORS;
    // metro: viaducto 3D y trazo de mapa encima de la viga
    for (const [line, trains] of [[METRO_A, 3], [METRO_B, 1]] as [Line, number][]) {
      const path = this.viaduct(line, trains);
      const flat: number[] = [];
      for (const v of path) flat.push(v.x, v.y + 1.2, v.z);
      this.screenLine(flat, C.metro, 5, '#ffffff', 10);
      this.stationMarks(line.stations.map(([x, y]) => this.w(x, y, this.groundZ(x, y)).setY(path[0] ? this.nearestY(path, x, y) + 2.4 : 0)), C.metro, 13);
    }
    // tranvía y Metroplús: van por la calle
    this.ribbon(this.resample(TRANVIA.pts, 0.05), 0.02, 0, '#7a8a6e', 0.5);
    this.screenLine(this.draped(TRANVIA.pts, 0.05, 12), C.tranvia, 3.5, '#ffffff', 10);
    this.stationMarks(TRANVIA.stations.map(([x, y]) => this.w(x, y, this.groundZ(x, y) + 20)), C.tranvia, 10);
    for (const l of METROPLUS) {
      for (const part of l.parts) this.screenLine(this.draped(part, 0.06, 12), C.metroplus, 2.6, '#ffffff', 8);
      this.stationMarks(l.stations.map(([x, y]) => this.w(x, y, this.groundZ(x, y) + 20)), C.metroplus, 8);
    }
    // metrocables: torres, cable, estaciones, cabinas y trazo de mapa
    const towerM = new THREE.MeshStandardMaterial({ color: '#5c6670', roughness: 0.6, metalness: 0.4 });
    const stM = new THREE.MeshStandardMaterial({ color: '#f0f2f3', roughness: 0.5 });
    const towerList: { p: THREE.Vector3; h: number }[] = [];
    const stationList: THREE.Vector3[] = [];
    const cabM = new THREE.MeshStandardMaterial({ color: '#eef1f3', roughness: 0.4, emissive: new THREE.Color('#2a3a48'), emissiveIntensity: 0.25 });
    for (const c of CABLES) {
      // torres cada ≈ 250 m y estaciones en los vértices del trazado (las estaciones oficiales)
      const tops: THREE.Vector3[] = [];
      for (let i = 1; i < c.pts.length; i++) {
        const [ax, ay] = c.pts[i - 1], [bx, by] = c.pts[i];
        const L = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.round(L / 0.25));
        for (let k = i === 1 ? 0 : 1; k <= n; k++) {
          const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
          const g = this.w(x, y);
          const isStation = k === 0 || k === n;
          const hgt = isStation ? 2.2 : 4.2;
          tops.push(g.clone().add(new THREE.Vector3(0, hgt, 0)));
          if (isStation) stationList.push(g.clone().add(new THREE.Vector3(0, 1.1, 0)));
          else towerList.push({ p: g.clone().add(new THREE.Vector3(0, hgt / 2, 0)), h: hgt });
        }
      }
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(tops), new THREE.LineBasicMaterial({ color: '#2a2f35' })));
      const flat: number[] = [];
      for (const v of tops) flat.push(v.x, v.y + 0.6, v.z);
      this.screenLine(flat, C.cable, 3, '#ffffff', 10);
      this.stationMarks(c.stations.map(([x, y]) => this.w(x, y, this.groundZ(x, y) + 22)), C.cable, 9);
      const ncab = Math.max(2, Math.round(tops.length / 3));
      for (let k = 0; k < ncab; k++) this.addMover(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), cabM), tops.map((v) => v.clone().add(new THREE.Vector3(0, -0.7, 0))), k / ncab, 0.02, true);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const tw = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 5), towerM, towerList.length);
    towerList.forEach((t, i) => tw.setMatrixAt(i, m4.compose(t.p, q, sc.set(1, t.h, 1))));
    const stn = new THREE.InstancedMesh(new THREE.BoxGeometry(4.5, 2.2, 4.5), stM, stationList.length);
    stationList.forEach((p, i) => stn.setMatrixAt(i, m4.compose(p, q, sc.set(1, 1, 1))));
    this.scene.add(tw, stn);
  }

  /** Altura de una trayectoria 3D en el punto más cercano a (x, y) [km]. */
  private nearestY(path: THREE.Vector3[], x: number, y: number): number {
    let best = path[0].y, bd = Infinity;
    for (const v of path) {
      const d = Math.hypot(v.x / U - x, -v.z / U - y);
      if (d < bd) {
        bd = d;
        best = v.y;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ nubes en las cuchillas
  private buildClouds(rnd: () => number): void {
    if (typeof document === 'undefined') return;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    if (!g) return;
    for (let k = 0; k < 9; k++) {
      const x = 30 + rnd() * 68, y = 44 + rnd() * 40, r = 18 + rnd() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(tex);
    for (let k = 0; k < 18; k++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9, fog: true });
      const side = k % 2 ? 1 : -1;
      const y = EXTENT.y0 + 1 + rnd() * (EXTENT.y1 - EXTENT.y0 - 2);
      const c = cross(riverAt(y).x + side, y);
      const x = riverAt(y).x + side * c.crestD * (0.8 + rnd() * 0.3);
      const sp = new THREE.Sprite(mat);
      sp.position.copy(this.w(x, y, c.crestH + 160 + rnd() * 380));
      const sc = 90 + rnd() * 150;
      sp.scale.set(sc, sc * 0.45, 1);
      this.clouds.push(sp);
      this.scene.add(sp);
    }
  }

  // ------------------------------------------------------------ sectores y rótulos
  private buildPins(): void {
    for (const pin of this.pins) {
      const base = this.w(pin.km[0], pin.km[1]);
      const m = new THREE.Mesh(new THREE.ConeGeometry(7, 20, 16), new THREE.MeshStandardMaterial({ color: '#ffb000', emissive: new THREE.Color('#5a3900'), emissiveIntensity: 0.5 }));
      m.rotation.x = Math.PI;
      m.position.copy(base).add(new THREE.Vector3(0, 24, 0));
      m.userData.pin = pin.id;
      this.pinMeshes.push(m);
      this.scene.add(m);
      const ring = new THREE.Mesh(new THREE.RingGeometry(10, 14, 32), new THREE.MeshBasicMaterial({ color: '#ffb000', transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(base).add(new THREE.Vector3(0, 2.5, 0));
      this.scene.add(ring);
      this.anchors.push({ id: `pin-${pin.id}`, at: base.clone().add(new THREE.Vector3(0, 40, 0)) });
    }
  }

  private buildLabels(): void {
    const L = (id: string, [x, y]: [number, number], dz = 60) => this.anchors.push({ id, at: this.w(x, y, this.groundZ(x, y) + dz) });
    const items: LabelItem[] = [];
    const add = (id: string, at: [number, number], dz: number, it: Omit<LabelItem, 'id'>) => {
      L(id, at, dz);
      items.push({ id, ...it });
    };
    // municipios
    const mun: [string, [number, number], number][] = [
      ['Medellín', PLACES.medellin, 9],
      ['Bello', PLACES.bello, 8],
      ['Itagüí', PLACES.itagui, 8],
      ['Envigado', PLACES.envigado, 8],
      ['Sabaneta', PLACES.sabaneta, 7],
      ['La Estrella', PLACES.laEstrella, 7],
      ['Caldas', PLACES.caldas, 7],
      ['Copacabana', PLACES.copacabana, 7],
    ];
    for (const [nm, at, pr] of mun) add(`mun-${nm}`, at, 160, { text: nm, priority: pr, kind: 'municipio' });
    // comunas y corregimientos de Medellín (los más conocidos)
    const zonas: Record<string, [string, number]> = {
      '10': ['La Candelaria (Centro)', 5],
      '14': ['El Poblado', 5],
      '11': ['Laureles–Estadio', 4],
      '16': ['Belén', 4],
      '13': ['San Javier (comuna 13)', 4],
      '07': ['Robledo', 3],
      '03': ['Manrique', 3],
      '01': ['Popular', 3],
      '05': ['Castilla', 3],
      '15': ['Guayabal', 3],
      '08': ['Villa Hermosa', 2],
      '09': ['Buenos Aires', 2],
      '04': ['Aranjuez', 2],
      '12': ['La América', 2],
      '06': ['Doce de Octubre', 2],
      '02': ['Santa Cruz', 1],
      '90': ['Santa Elena', 3],
      '60': ['San Cristóbal', 3],
      '80': ['San Antonio de Prado', 3],
      '70': ['Altavista', 2],
      '50': ['Palmitas', 2],
    };
    for (const c of COMUNAS) {
      const z = zonas[c.code];
      if (z) add(`com-${c.code}`, c.at, 90, { text: z[0], priority: z[1], kind: 'zona' });
    }
    // cerros (cota de la cima según el MDE del AMVA)
    for (const h of HILLS) add(`cerro-${h.id}`, [h.x, h.y], h.tutelar ? 70 : 140, { text: h.name, sub: `${h.peak.toLocaleString('es-CO')} m`, priority: h.tutelar ? 4 : 3, kind: 'cerro' });
    // agua
    add('rio-sur', [riverAt(-7.5).x, -7.5], 25, { text: 'Río Medellín', priority: 7, kind: 'agua' });
    add('rio-norte', [riverAt(8.5).x, 8.5], 25, { text: 'Río Medellín', priority: 6, kind: 'agua' });
    CREEK_LABELS.slice(0, 12).forEach((q, i) => add(`q-${i}`, [q.x, q.y], 25, { text: q.name, priority: i < 4 ? 2 : 1, kind: 'agua' }));
    // transporte
    const mid = (l: Line) => l.stations[Math.floor(l.stations.length / 2)] ?? l.pts[Math.floor(l.pts.length / 2)];
    const C = VALLEY_COLORS;
    add('metro-a', METRO_A.stations[Math.round(METRO_A.stations.length * 0.62)] ?? mid(METRO_A), 90, { text: 'Metro línea A', priority: 8, kind: 'linea', color: C.metro });
    add('metro-b', mid(METRO_B), 90, { text: 'Metro línea B', priority: 7, kind: 'linea', color: C.metro });
    add('tranvia', mid(TRANVIA), 90, { text: 'Tranvía T-A', priority: 6, kind: 'linea', color: C.tranvia });
    for (const c of CABLES) add(`cable-${c.code}`, c.pts[c.pts.length - 1], 110, { text: c.code === 'La Aldea' ? 'Cable La Aldea' : `Metrocable ${c.code}`, priority: 5, kind: 'linea', color: C.cable });
    for (const l of METROPLUS) add(`mp-${l.code}`, l.stations[0] ?? l.pts[0], 80, { text: `Metroplús ${l.code}`, priority: 4, kind: 'linea', color: C.metroplus });
    // referentes
    add('aeropuerto', PLACES.aeropuerto, 50, { text: 'Aeropuerto Olaya Herrera', priority: 4 });
    add('estadio', PLACES.estadio, 70, { text: 'Unidad Deportiva Atanasio Girardot', priority: 2 });
    add('coltejer', PLACES.coltejer, 260, { text: 'Edificio Coltejer', priority: 3 });
    add('biblioteca', PLACES.bibliotecaEspana, 90, { text: 'Parque Biblioteca España', priority: 1 });
    add('arvi', PLACES.arvi, 120, { text: 'Parque Arví', priority: 3 });
    add('norte', [riverAt(11).x, 11.4], 500, { text: 'Norte ↑', priority: 2, kind: 'aviso' });
    for (const p of this.pins) items.push({ id: `pin-${p.id}`, text: p.label, sub: p.sub, priority: 10, kind: 'sector' });
    this.labels.set(items);
  }

  home(animate = false): void {
    // desde el sur, sobre La Estrella, mirando hacia el norte a lo largo del valle
    const p = this.w(-5.6, -20.5, 5600), t = this.w(0.2, 1.2, 1450);
    if (!animate || this.reducedMotion) {
      this.camera.position.copy(p);
      this.controls.target.copy(t);
      this.controls.update();
    } else this.tween = { from: [this.camera.position.clone(), this.controls.target.clone()], to: [p, t], start: performance.now(), dur: 1200 };
  }

  /** Vuela hacia un sector y llama a done al terminar (inmediato con movimiento reducido). */
  flyTo(id: string, done: () => void): void {
    const pin = this.pins.find((p) => p.id === id);
    if (!pin) return done();
    const t = this.w(pin.km[0], pin.km[1]);
    // llega desde el oriente (el valle), mirando ladera arriba, como la vista general del sector
    const p = t.clone().add(new THREE.Vector3(150, 110, 70));
    if (this.reducedMotion) return done();
    this.tween = { from: [this.camera.position.clone(), this.controls.target.clone()], to: [p, t], start: performance.now(), dur: 1300, done };
  }

  pick(clientX: number, clientY: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const h = ray.intersectObjects(this.pinMeshes, false);
    return h.length ? (h[0].object.userData.pin as string) : null;
  }

  resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const m of this.lineMats) m.resolution.set(w, h);
  }

  render(dt: number, reserved: DOMRect[] = []): void {
    if (this.disposed) return;
    this.time += dt;
    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.start) / this.tween.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.camera.position.lerpVectors(this.tween.from[0], this.tween.to[0], e);
      this.controls.target.lerpVectors(this.tween.from[1], this.tween.to[1], e);
      if (k >= 1) {
        const d = this.tween.done;
        this.tween = null;
        d?.();
      }
    }
    // trenes y cabinas (quietos con movimiento reducido)
    for (const mv of this.movers) {
      let u = mv.phase + (this.reducedMotion ? 0 : this.time * mv.speed);
      u = mv.loop ? u % 1 : 1 - Math.abs((u % 2) - 1); // los trenes van y vuelven
      const d = u * mv.total;
      let i = 1;
      while (i < mv.len.length - 1 && mv.len[i] < d) i++;
      const a = mv.path[i - 1], b = mv.path[i];
      const f = (d - mv.len[i - 1]) / Math.max(1e-6, mv.len[i] - mv.len[i - 1]);
      mv.mesh.position.copy(a).lerp(b, Math.min(1, Math.max(0, f)));
      mv.mesh.lookAt(b.x, mv.mesh.position.y, b.z);
    }
    if (!this.reducedMotion) for (const m of this.pinMeshes) m.position.y += Math.sin(this.time * 2.2) * 0.08;
    // nubes: se desvanecen cuando la cámara está cerca o dentro de ellas, y cuando se mira desde arriba
    // (desde lo alto parecerían manchas blancas sobre el suelo)
    for (const c of this.clouds) {
      const d = c.position.distanceTo(this.camera.position);
      const above = Math.min(1, Math.max(0, 1 - (this.camera.position.y - c.position.y - 60) / 260));
      (c.material as THREE.SpriteMaterial).opacity = 0.85 * above * Math.min(1, Math.max(0, (d - c.scale.x * 0.6) / (c.scale.x * 1.4)));
    }
    // la bruma empieza más lejos cuando la cámara se aleja (desde lo alto el valle no queda lavado)
    const fog = this.scene.fog as THREE.Fog;
    const dist = this.camera.position.distanceTo(this.controls.target);
    fog.near = Math.max(2000, dist * 1.05);
    fog.far = Math.max(5600, dist * 2.8);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const pos = new Map<string, { x: number; y: number; visible: boolean }>();
    const v = new THREE.Vector3();
    for (const a of this.anchors) {
      v.copy(a.at).project(this.camera);
      pos.set(a.id, { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && v.z > -1 });
    }
    const cr = this.container.getBoundingClientRect();
    this.labels.layout(pos, w, h, reserved.map((r) => new DOMRect(r.left - cr.left, r.top - cr.top, r.width, r.height)));
  }

  dispose(): void {
    this.disposed = true;
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((q) => q.dispose());
      else mat?.dispose();
    });
    this.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.dispose();
  }
}

// Escala de ciudad: vista 3D del Valle de Aburrá para orientarse y elegir un sector.
// Se construye con la geografía de referencia de aburra.ts (coordenadas y cotas APROXIMADAS de lugares
// públicos conocidos): no es un modelo de elevación ni un levantamiento. Relieve y edificios exagerados
// ×1,5 en altura, avisado en pantalla. No se usa para calcular: el cálculo ocurre solo en los sectores.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { prng } from '../scenarios/primitives';
import { LabelLayer, type LabelItem } from './labels';
import { VALLEY_EXAGGERATION } from './palette';
import { CARPET_GLSL } from './carpet';
import {
  CABLES,
  EXTENT,
  Fabric,
  HILLS,
  METRO_A,
  METRO_B,
  PLACES,
  ROADS,
  TRANVIA,
  creeks,
  cross,
  fabricAt,
  forestAt,
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
${CARPET_GLSL}`;

const TERRAIN_FS_COLOR = `#include <color_fragment>
{
  vec2 p = vWP.xz; // unidades de escena (1 = 10 m)
  float fw = max(fwidth(p.x), fwidth(p.y)); // unidades por píxel
  // vegetación: potreros y bosques en manchas, sin repetir
  float n = vn(p * 0.045) * 0.6 + vn(p * 0.17) * 0.4;
  vec3 green = diffuseColor.rgb * (0.86 + 0.28 * n);
  green = mix(green, vec3(0.17, 0.32, 0.15), smoothstep(0.35, 0.75, vVeg + 0.3 * (n - 0.5)) * 0.9);
  diffuseColor.rgb = green;
  if (vUrb.y > 0.01) diffuseColor.rgb = carpet(p, fw, green, vUrbBase, floor(vUrb.x + 0.5), vUrb.y);
}`;

const BUILDING_FS = `#include <color_fragment>
{
  // fachadas de torres: franjas de pisos que se desvanecen con la distancia; techos según el tipo
  float kind = vBKind.x;
  if (vBN.y > 0.5) {
    float r = vBKind.y;
    vec3 roof = kind > 0.5 ? diffuseColor.rgb * 0.82 : r < 0.6 ? vec3(0.55, 0.54, 0.51) : r < 0.82 ? vec3(0.62, 0.33, 0.22) : vec3(0.62, 0.65, 0.68);
    diffuseColor.rgb = roof;
  } else if (kind > 0.5) {
    float yy = vBL.y * vBS.y;
    float fw = fwidth(yy);
    float band = smoothstep(0.62, 0.7, fract(yy / 0.45)) * (1.0 - smoothstep(0.08, 0.25, fw));
    diffuseColor.rgb *= 1.0 - 0.28 * band;
  }
}`;

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
  private movers: { mesh: THREE.Object3D; path: THREE.Vector3[]; len: number[]; total: number; phase: number; speed: number; loop: boolean }[] = [];
  private textures: THREE.Texture[] = [];
  private clouds: THREE.Sprite[] = [];
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
      'Vista 3D aproximada del Valle de Aburrá: el río Medellín de sur a norte, el metro, los metrocables, los cerros y los barrios que suben por las laderas. Elige un sector en el panel o tocando su marcador.',
    );
    container.appendChild(this.renderer.domElement);
    this.labels = new LabelLayer(container);
    this.camera = new THREE.PerspectiveCamera(40, 1, 5, 20000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !opts.reducedMotion;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 120;
    this.controls.maxDistance = 3400;
    this.controls.listenToKeyEvents(this.renderer.domElement);
    this.controls.keyPanSpeed = 30;
    // cielo de Medellín: azul claro con bruma; las montañas lejanas se aclaran
    this.scene.background = new THREE.Color('#c9dbe8');
    this.scene.fog = new THREE.Fog('#c9dbe8', 1900, 5200);
    this.scene.add(new THREE.HemisphereLight('#eef6ff', '#5a4c3c', 1.1));
    const sun = new THREE.DirectionalLight('#fff0d6', 2.1);
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
    const keepOut = this.buildLandmarks();
    this.buildCity(alta, rnd, keepOut);
    this.buildTrees(alta, rnd);
    this.buildTransit();
    this.buildClouds(rnd);
    this.buildPins();
    this.buildLabels();
  }

  // ------------------------------------------------------------ relieve con tapiz urbano
  private buildTerrain(alta: boolean): void {
    const st = alta ? 0.1 : 0.15;
    const { x0, x1, y0, y1 } = EXTENT;
    const nx = Math.round((x1 - x0) / st) + 1, ny = Math.round((y1 - y0) / st) + 1;
    this.gx0 = x0;
    this.gy0 = y0;
    this.gst = st;
    this.gnx = nx;
    this.gny = ny;
    this.gz = new Float32Array(nx * ny);
    const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3), urb = new Float32Array(nx * ny * 2), veg = new Float32Array(nx * ny);
    const c = new THREE.Color();
    const pasture = new THREE.Color('#84ad5c'), forest = new THREE.Color('#3f6c34'), high = new THREE.Color('#5f8546');
    const urbBase: Record<number, THREE.Color> = {
      [Fabric.Ladera]: new THREE.Color('#a05a3d'),
      [Fabric.Plano]: new THREE.Color('#7f7a62'),
      [Fabric.Centro]: new THREE.Color('#8e8780'),
      [Fabric.Poblado]: new THREE.Color('#6f7457'),
      [Fabric.Industria]: new THREE.Color('#9b9a96'),
      [Fabric.Municipio]: new THREE.Color('#946651'),
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
      const v = forestAt(x, y); // potreros y manchas de bosque (más en Arví y en las partes altas)
      const fab = fabricAt(x, y, z);
      urb[o * 2] = fab.f;
      urb[o * 2 + 1] = fab.k;
      veg[o] = Math.min(1, v);
      const base = urbBase[fab.f] ?? forest;
      ub[o * 3] = base.r;
      ub[o * 3 + 1] = base.g;
      ub[o * 3 + 2] = base.b;
      // cauce y retiro del río: parque lineal
      if (cr.d < 0.09) c.set('#6d9a4c');
      col[o * 3] = c.r;
      col[o * 3 + 1] = c.g;
      col[o * 3 + 2] = c.b;
    }
    // bosque en los retiros de las quebradas (franjas verdes oscuras que bajan entre los barrios)
    for (const cr of creeks()) {
      for (const [px, py] of cr.pts) {
        const ci = Math.round((px - x0) / st), cj = Math.round((py - y0) / st);
        const rad = 2;
        for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
          const ii = ci + di, jj = cj + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const o = jj * nx + ii;
          const f = Math.exp(-(di * di + dj * dj) / 2.2);
          veg[o] = Math.max(veg[o], 0.95 * f);
          urb[o * 2 + 1] *= 1 - 0.75 * f;
        }
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aUrb', new THREE.BufferAttribute(urb, 2));
    g.setAttribute('aVeg', new THREE.BufferAttribute(veg, 1));
    g.setAttribute('aUrbBase', new THREE.BufferAttribute(ub, 3));
    g.setIndex(idx);
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

  /** Montañas que rodean el esquema hasta el horizonte (malla gruesa, sin ciudad): no se ve el borde. */
  private buildSkirt(x0: number, x1: number, y0: number, y1: number): void {
    const st = 0.8, X0 = -45, X1 = 45, Y0 = -50, Y1 = 45;
    const nx = Math.round((X1 - X0) / st) + 1, ny = Math.round((Y1 - Y0) / st) + 1;
    const P = new Float32Array(nx * ny * 3), C = new Float32Array(nx * ny * 3);
    const col = new THREE.Color(), pasture = new THREE.Color('#77a057'), forest = new THREE.Color('#3f6c34');
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = X0 + i * st, y = Y0 + j * st, o = j * nx + i;
      // más allá de la cuchilla: montañas de 2 300 a 2 900 m (oriente antioqueño y occidente)
      const z = outerZ(x, y);
      const inside = x > x0 && x < x1 && y > y0 && y < y1;
      P[o * 3] = x * U;
      P[o * 3 + 1] = mz(z - 1400) - (inside ? 4 : 0);
      P[o * 3 + 2] = -y * U;
      col.copy(pasture).lerp(forest, forestAt(x, y) * 0.8);
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

  private buildRiverAndRoads(): void {
    const river: [number, number][] = [];
    for (let y = EXTENT.y0; y <= EXTENT.y1; y += 0.08) river.push([riverAt(y).x, y]);
    // río canalizado, parque lineal y autopistas Norte/Sur y Regional a lado y lado
    this.ribbon(river, 0.085, 0.13, '#6c9a4f', 0.25);
    this.ribbon(river, 0.085, -0.13, '#6c9a4f', 0.25);
    this.ribbon(river, 0.055, 0.205, '#55585c', 0.35);
    this.ribbon(river, 0.055, -0.205, '#55585c', 0.35);
    this.ribbon(river, 0.06, 0, '#5d8fa6', 0.45, { emissive: '#163a52', rough: 0.25 });
    for (const r of ROADS) this.ribbon(this.resample(r.pts, 0.08), r.w * 1.6, 0, '#55585c', 0.35);
  }

  private buildCreeks(): void {
    const mat = new THREE.MeshStandardMaterial({ color: '#4d93c8', roughness: 0.3, emissive: new THREE.Color('#123a5c'), emissiveIntensity: 0.25 });
    for (const c of creeks()) {
      const pts = this.resample(c.pts, 0.1).map(([x, y]) => this.w(x, y, this.groundZ(x, y) + 6));
      if (pts.length > 3) this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.7, 4, false), mat));
    }
  }

  /** Aeropuerto, estadio, Coltejer, Biblioteca España. Devuelve zonas sin edificios genéricos. */
  private buildLandmarks(): { x: number; y: number; r: number }[] {
    const out: { x: number; y: number; r: number }[] = [];
    // Aeropuerto Olaya Herrera: pista y terminal
    const [sx, sy] = PLACES.runwayS, [nx, ny] = PLACES.runwayN;
    const a = this.w(sx, sy), b = this.w(nx, ny);
    const len = a.distanceTo(b);
    const runway = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, len), new THREE.MeshStandardMaterial({ color: '#5b5f64', roughness: 0.85 }));
    runway.position.copy(a).lerp(b, 0.5).add(new THREE.Vector3(0, 0.6, 0));
    runway.lookAt(b.x, runway.position.y, b.z);
    this.scene.add(runway);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.52, len * 0.9), new THREE.MeshStandardMaterial({ color: '#e9ecef' }));
    mark.position.copy(runway.position).add(new THREE.Vector3(0, 0.02, 0));
    mark.quaternion.copy(runway.quaternion);
    this.scene.add(mark);
    const terminal = new THREE.Mesh(new THREE.BoxGeometry(9, mz(12), 4), new THREE.MeshStandardMaterial({ color: '#e7e2d6', roughness: 0.8 }));
    const tp = this.w(PLACES.aeropuerto[0] + 0.32, PLACES.aeropuerto[1]);
    terminal.position.set(tp.x, tp.y + mz(6), tp.z);
    terminal.lookAt(tp.x + (b.x - a.x), terminal.position.y, tp.z + (b.z - a.z));
    this.scene.add(terminal);
    for (let t = 0; t <= 1; t += 0.1) out.push({ x: sx + (nx - sx) * t, y: sy + (ny - sy) * t, r: 0.22 });
    // Estadio Atanasio Girardot
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
    out.push({ x: PLACES.estadio[0], y: PLACES.estadio[1], r: 0.2 });
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
    // Biblioteca España (Santo Domingo Savio): tres volúmenes oscuros como rocas
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
    for (const h of HILLS) if (h.id !== 'padre-amaya') out.push({ x: h.x, y: h.y, r: h.r * 0.55 });
    return out;
  }

  // ------------------------------------------------------------ edificios
  private buildCity(alta: boolean, rnd: () => number, keepOut: { x: number; y: number; r: number }[]): void {
    const N = alta ? 42000 : 13000;
    const step = alta ? 0.047 : 0.075; // separación de la rejilla de muestreo [km]
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aBKind;\nvarying vec2 vBKind;\nvarying vec3 vBL;\nvarying vec3 vBS;\nvarying vec3 vBN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBKind = aBKind; vBL = position; vBN = normal;\nvBS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vBKind;\nvarying vec3 vBL;\nvarying vec3 vBS;\nvarying vec3 vBN;')
        .replace('#include <color_fragment>', BUILDING_FS);
    };
    const city = new THREE.InstancedMesh(box, mat, N);
    const kind = new Float32Array(N * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const brick = ['#a85a3c', '#b4643f', '#9c4f33', '#b86a45', '#a35c40'];
    const painted = ['#e2b64e', '#4fa3a1', '#d77f72', '#e9e4d6', '#7fb069', '#d8a0b5'];
    const light = ['#e6e1d6', '#d8d2c6', '#cfd5da', '#ece7dc', '#c9c2b6'];
    const tower = ['#a85f40', '#b86f4c', '#9e5638', '#e1ddd5', '#c7ced4', '#b0623f'];
    let n = 0;
    const { x0, x1, y0, y1 } = EXTENT;
    for (let y = y0 + 0.4; y < y1 - 0.3 && n < N; y += step) {
      for (let x = x0 + 0.4; x < x1 - 0.4 && n < N; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.9, py = y + (rnd() - 0.5) * step * 0.9;
        const z = this.groundZ(px, py);
        const fab = fabricAt(px, py, z);
        if (fab.f === Fabric.None) continue;
        if (keepOut.some((k) => Math.hypot(px - k.x, py - k.y) < k.r)) continue;
        const dens = [0, 0.9, 0.55, 0.9, 0.55, 0.45, 0.72][fab.f] * Math.min(1, fab.k * 1.15);
        if (rnd() > dens) continue;
        let hgt: number, fw: number, fd: number, color: string, isTower = false;
        const r = rnd();
        switch (fab.f) {
          case Fabric.Ladera:
            hgt = 6 + rnd() * 8;
            fw = 16 + rnd() * 12;
            fd = 14 + rnd() * 12;
            color = r < 0.74 ? brick[Math.floor(rnd() * brick.length)] : painted[Math.floor(rnd() * painted.length)];
            break;
          case Fabric.Plano:
            isTower = r < 0.1;
            hgt = isTower ? 20 + rnd() * 25 : 6 + rnd() * 7;
            fw = 18 + rnd() * 12;
            fd = 18 + rnd() * 10;
            color = rnd() < 0.4 ? brick[Math.floor(rnd() * brick.length)] : light[Math.floor(rnd() * light.length)];
            break;
          case Fabric.Centro:
            isTower = r < 0.45;
            hgt = isTower ? 22 + Math.pow(rnd(), 1.8) * 75 : 9 + rnd() * 12;
            fw = 22 + rnd() * 18;
            fd = 20 + rnd() * 18;
            color = rnd() < 0.25 ? brick[Math.floor(rnd() * brick.length)] : light[Math.floor(rnd() * light.length)];
            break;
          case Fabric.Poblado:
            isTower = r < 0.42;
            hgt = isTower ? 30 + Math.pow(rnd(), 1.5) * 60 : 7 + rnd() * 6;
            fw = isTower ? 22 + rnd() * 12 : 20 + rnd() * 10;
            fd = isTower ? 20 + rnd() * 12 : 20 + rnd() * 10;
            color = isTower ? tower[Math.floor(rnd() * tower.length)] : rnd() < 0.5 ? brick[Math.floor(rnd() * brick.length)] : light[Math.floor(rnd() * light.length)];
            break;
          case Fabric.Industria:
            hgt = 8 + rnd() * 7;
            fw = 40 + rnd() * 35;
            fd = 30 + rnd() * 30;
            color = rnd() < 0.3 ? brick[Math.floor(rnd() * brick.length)] : rnd() < 0.6 ? light[Math.floor(rnd() * light.length)] : '#b9bec2';
            break;
          default:
            isTower = r < 0.08;
            hgt = isTower ? 28 + rnd() * 35 : 7 + rnd() * 9;
            fw = 18 + rnd() * 12;
            fd = 16 + rnd() * 12;
            color = rnd() < 0.55 ? brick[Math.floor(rnd() * brick.length)] : light[Math.floor(rnd() * light.length)];
        }
        // en pendiente, la base baja hasta la esquina más baja (no queda flotando)
        const hx = fw / 2000, hy = fd / 2000;
        let low = z;
        for (const [ax, ay] of [[hx, hy], [-hx, hy], [hx, -hy], [-hx, -hy]]) low = Math.min(low, this.groundZ(px + ax, py + ay));
        const sink = z - low + 2;
        p.copy(this.w(px, py, z - sink));
        const rot = fab.f === Fabric.Ladera ? (rnd() - 0.5) * 1.4 : (rnd() - 0.5) * 0.12;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        s.set(fw / 10, mz(hgt + sink), fd / 10);
        city.setMatrixAt(n, m4.compose(p, q, s));
        city.setColorAt(n, new THREE.Color(color).multiplyScalar(0.86 + rnd() * 0.22));
        kind[n * 2] = isTower ? 1 : 0;
        kind[n * 2 + 1] = rnd();
        n++;
      }
    }
    city.count = n;
    box.setAttribute('aBKind', new THREE.InstancedBufferAttribute(kind, 2));
    this.scene.add(city);
  }

  // ------------------------------------------------------------ árboles
  private buildTrees(alta: boolean, rnd: () => number): void {
    const N = alta ? 16000 : 5000;
    const pts: { p: THREE.Vector3; r: number; c: string }[] = [];
    const greens = ['#3f7a34', '#4c8a3c', '#467f38', '#5a9443', '#3a6f31'];
    const { x0, x1, y0, y1 } = EXTENT;
    for (let t = 0; t < N * 10 && pts.length < N; t++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      const z = this.groundZ(x, y);
      const fab = fabricAt(x, y, z);
      const cr = cross(x, y);
      let pr = 0;
      const hill = HILLS.some((h) => h.id !== 'padre-amaya' && Math.hypot(x - h.x, y - h.y) < h.r * 0.6);
      if (hill) pr = 0.95;
      else if (fab.f === Fabric.Plano || fab.f === Fabric.Poblado) pr = 0.45 * fab.k;
      else if (fab.f === Fabric.None && cr.d > 0.12) pr = 0.75 * forestAt(x, y);
      else pr = 0.03;
      if (rnd() > pr) continue;
      const guayacan = (fab.f === Fabric.Plano || fab.f === Fabric.Poblado) && rnd() < 0.12;
      const r = fab.f === Fabric.None && !hill ? 1.3 + rnd() * 1.1 : 0.7 + rnd() * 0.5;
      pts.push({ p: this.w(x, y, z), r, c: guayacan ? (rnd() < 0.6 ? '#e8b923' : '#e48aae') : greens[Math.floor(rnd() * greens.length)] });
    }
    // cerros tutelares: bosque denso
    for (const h of HILLS) {
      if (h.id === 'padre-amaya') continue;
      const n = Math.round(h.r * h.r * (alta ? 900 : 380));
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * h.r * 0.62;
        const x = h.x + Math.cos(a) * rr, y = h.y + Math.sin(a) * rr;
        pts.push({ p: this.w(x, y), r: 0.8 + rnd() * 0.6, c: greens[Math.floor(rnd() * greens.length)] });
      }
    }
    // retiros de las quebradas: franjas de árboles que bajan entre los barrios
    for (const c of creeks()) {
      for (const [x, y] of this.resample(c.pts, alta ? 0.05 : 0.09)) {
        for (let k = 0; k < 2; k++) {
          const tx = x + (rnd() - 0.5) * 0.09, ty = y + (rnd() - 0.5) * 0.09;
          pts.push({ p: this.w(tx, ty), r: 0.7 + rnd() * 0.6, c: greens[Math.floor(rnd() * greens.length)] });
        }
      }
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

  // ------------------------------------------------------------ metro, tranvía y metrocables
  private addMover(mesh: THREE.Object3D, path: THREE.Vector3[], phase: number, speed: number, loop: boolean): void {
    const len = [0];
    for (let i = 1; i < path.length; i++) len.push(len[i - 1] + path[i].distanceTo(path[i - 1]));
    this.movers.push({ mesh, path, len, total: len[len.length - 1], phase, speed, loop });
    this.scene.add(mesh);
  }

  private viaduct(line: Line, trains: number): void {
    const pts = this.resample(line.pts, 0.06);
    const deck = 2.6; // ≈ 17 m sobre el terreno, con la exageración
    // la viga sigue un perfil suave por encima del terreno
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
    const cols: THREE.Vector3[] = [];
    for (let i = 0; i < path.length; i += 5) cols.push(path[i]);
    const colM = new THREE.InstancedMesh(unit, beamM, cols.length);
    cols.forEach((c, i) => {
      const g = this.w(pts[i * 5][0], pts[i * 5][1]);
      const hgt = c.y - g.y;
      colM.setMatrixAt(i, m4.compose(new THREE.Vector3(c.x, g.y + hgt / 2, c.z), q.identity(), s.set(0.55, hgt, 0.55)));
    });
    this.scene.add(colM);
    // estaciones: techo blanco curvo (caja con techo claro)
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
  }

  private buildTransit(): void {
    this.viaduct(METRO_A, 3);
    this.viaduct(METRO_B, 1);
    this.ribbon(this.resample(TRANVIA.pts, 0.05), 0.02, 0, '#7a8a6e', 0.5);
    const towerM = new THREE.MeshStandardMaterial({ color: '#5c6670', roughness: 0.6, metalness: 0.4 });
    const stM = new THREE.MeshStandardMaterial({ color: '#f0f2f3', roughness: 0.5 });
    const towerList: { p: THREE.Vector3; h: number }[] = [];
    const stationList: THREE.Vector3[] = [];
    const cabM = new THREE.MeshStandardMaterial({ color: '#eef1f3', roughness: 0.4, emissive: new THREE.Color('#2a3a48'), emissiveIntensity: 0.25 });
    for (const c of CABLES) {
      // torres cada ≈ 250 m y estaciones en los quiebres del trazado
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

  // ------------------------------------------------------------ nubes en las cuchillas
  private buildClouds(rnd: () => number): void {
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
    for (let k = 0; k < 30; k++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9, fog: true });
      const side = k % 2 ? 1 : -1;
      const y = EXTENT.y0 + 1 + rnd() * (EXTENT.y1 - EXTENT.y0 - 2);
      const c = cross(riverAt(y).x + side, y);
      const x = riverAt(y).x + side * c.crestD * (0.75 + rnd() * 0.35);
      const sp = new THREE.Sprite(mat);
      sp.position.copy(this.w(x, y, c.crestH + 120 + rnd() * 380));
      const sc = 90 + rnd() * 160;
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
    const hill = (id: string) => HILLS.find((h) => h.id === id)!;
    L('rio', [riverAt(-6.5).x, -6.5], 40);
    L('centro', PLACES.centro, 260);
    L('poblado', PLACES.poblado, 320);
    L('laureles', PLACES.laureles, 120);
    L('comuna13', PLACES.comuna13, 120);
    L('nororiente', PLACES.nororiente, 140);
    L('robledo', PLACES.robledo, 120);
    for (const id of ['nutibara', 'volador', 'asomadera', 'pan-de-azucar', 'tres-cruces', 'padre-amaya']) L(id, [hill(id).x, hill(id).y], id === 'padre-amaya' ? 200 : 110);
    L('aeropuerto', PLACES.aeropuerto, 50);
    L('estadio', PLACES.estadio, 70);
    L('coltejer', PLACES.coltejer, 260);
    L('biblioteca', PLACES.bibliotecaEspana, 90);
    L('arvi', PLACES.arvi, 120);
    L('santa-elena', PLACES.santaElena, 140);
    L('bello', PLACES.bello, 140);
    L('copacabana', PLACES.copacabana, 140);
    L('envigado', PLACES.envigado, 140);
    L('itagui', PLACES.itagui, 140);
    L('sabaneta', PLACES.sabaneta, 140);
    L('la-estrella', PLACES.laEstrella, 140);
    L('caldas', PLACES.caldas, 140);
    const [ax, ay] = METRO_A.pts[17];
    L('metro', [ax, ay], 70);
    L('metrocable', CABLES[0].pts[2], 120);
    L('norte', [riverAt(11).x, 11.2], 500);
    const items: LabelItem[] = [
      { id: 'rio', text: 'Río Medellín', priority: 6 },
      { id: 'centro', text: 'Centro', priority: 6 },
      { id: 'poblado', text: 'El Poblado', priority: 5 },
      { id: 'laureles', text: 'Laureles', priority: 3 },
      { id: 'comuna13', text: 'San Javier (comuna 13)', priority: 3 },
      { id: 'nororiente', text: 'Nororiente (comunas 1 a 4)', priority: 3 },
      { id: 'robledo', text: 'Robledo', priority: 1 },
      { id: 'nutibara', text: 'Cerro Nutibara', priority: 3 },
      { id: 'volador', text: 'Cerro El Volador', priority: 3 },
      { id: 'asomadera', text: 'Cerro La Asomadera', priority: 1 },
      { id: 'pan-de-azucar', text: 'Cerro Pan de Azúcar', priority: 1 },
      { id: 'tres-cruces', text: 'Cerro de las Tres Cruces', priority: 1 },
      { id: 'padre-amaya', text: 'Cerro El Padre Amaya', priority: 2 },
      { id: 'aeropuerto', text: 'Aeropuerto Olaya Herrera', priority: 3 },
      { id: 'estadio', text: 'Estadio', priority: 1 },
      { id: 'coltejer', text: 'Edificio Coltejer', priority: 2 },
      { id: 'biblioteca', text: 'Biblioteca España', priority: 1 },
      { id: 'arvi', text: 'Parque Arví', priority: 2 },
      { id: 'santa-elena', text: 'Santa Elena', priority: 1 },
      { id: 'bello', text: 'Bello', priority: 4 },
      { id: 'copacabana', text: 'Copacabana', priority: 1 },
      { id: 'envigado', text: 'Envigado', priority: 4 },
      { id: 'itagui', text: 'Itagüí', priority: 4 },
      { id: 'sabaneta', text: 'Sabaneta', priority: 2 },
      { id: 'la-estrella', text: 'La Estrella', priority: 1 },
      { id: 'caldas', text: 'Caldas', priority: 2 },
      { id: 'metro', text: 'Metro (línea A)', priority: 3 },
      { id: 'metrocable', text: 'Metrocable K', priority: 2 },
      { id: 'norte', text: 'Norte ↑', priority: 2, kind: 'aviso' },
      ...this.pins.map((p) => ({ id: `pin-${p.id}`, text: p.label, sub: p.sub, priority: 10, kind: 'sector' as const })),
    ];
    this.labels.set(items);
  }

  home(animate = false): void {
    // desde el sur, sobre Itagüí, mirando hacia el norte a lo largo del valle
    const p = this.w(-4.0, -15.2, 4300), t = this.w(0.2, -0.6, 1450);
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
    // nubes: se desvanecen cuando la cámara está cerca o dentro de ellas
    for (const c of this.clouds) {
      const d = c.position.distanceTo(this.camera.position);
      (c.material as THREE.SpriteMaterial).opacity = 0.9 * Math.min(1, Math.max(0, (d - c.scale.x * 0.6) / (c.scale.x * 1.4)));
    }
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

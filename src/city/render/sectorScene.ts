// Escena 3D del sector de laboratorio (maqueta científica). Dibuja exactamente la malla que se calcula:
// cada celda del terreno, cada edificio rasterizado y el agua de cada celda. La profundidad se dibuja a
// escala 1:1; solo si el usuario activa la amplificación se multiplica, y la interfaz lo avisa.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { COVERS, COVER_LIST } from '../sim/constants';
import type { Compiled } from '../sim/compile';
import type { CitySim } from '../sim/engine';
import { flowArrows } from '../sim/fields';
import type { Pt, Scenario } from '../sim/scenario';
import type { TracerSet } from '../sim/tracers';
import { prng } from '../scenarios/primitives';
import { LabelLayer, type LabelItem } from './labels';
import { depthColor, fmtDepth, hexToRgb } from './palette';
import { buildBackdrop, crownGeometry, type Backdrop, type SectorFit } from './backdrop';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SECTOR_SPOTS, toKm } from './aburra';
import { FLOW_CYCLE, StormFx } from './stormFx';
import { TracerFx } from './tracerFx';
import { facadeAtlas, glassTexture, glowTexture, plasterTexture, roofTexture, type FacadeAtlas, type TileId } from './textures';
import { SewerView } from './sewerView';
import type { NetFilter } from './sewerColors';
import { FloodView } from './floodView';

export type ViewMode = 'realista' | 'materiales' | 'resultados' | 'peligro';
export type Pick =
  | { kind: 'cell'; k: number; x: number; y: number }
  | { kind: 'building'; index: number; x: number; y: number }
  | { kind: 'drain'; index: number; x: number; y: number };

const PATTERN_ID: Record<string, number> = { liso: 0, puntos: 1, rayas: 2, cuadros: 3, ondas: 4 };
const BLOCK_DEPTH = 4;
const VIEW_CODE: Record<ViewMode, number> = { realista: 0, materiales: 1, resultados: 2, peligro: 3 };

interface Tween {
  from: { p: THREE.Vector3; t: THREE.Vector3 };
  to: { p: THREE.Vector3; t: THREE.Vector3 };
  start: number;
  dur: number;
}

function hash(k: number): number {
  let x = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export class SectorScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly labels: LabelLayer;
  private container: HTMLElement;
  private sc: Scenario;
  private c!: Compiled;
  private W = 0;
  private H = 0;
  private zRef = 0;
  private reducedMotion: boolean;

  private terrain!: THREE.Mesh;
  private terrainMat: THREE.MeshStandardMaterial;
  private terrainColors = { real: new Float32Array(0), mat: new Float32Array(0) };
  /**
   * Ortofoto del sector (sectores reales): se pinta sobre el terreno y los techos en la vista realista. `orthoOn`
   * es la preferencia de la persona (botón «Foto aérea»); los uniformes los comparten el terreno y los techos.
   */
  private orthoTex: THREE.Texture | null = null;
  /** Árboles del dibujo (instancias) y sus matrices originales, para el corte de vista. */
  private treeInst: { trunks: THREE.InstancedMesh; crowns: THREE.InstancedMesh; xy: [number, number][]; mT: Float32Array; mC: Float32Array } | null = null;
  private orthoOn = true;
  private orthoU = { uOrtho: { value: null as THREE.Texture | null }, uOrthoOn: { value: 0 }, uOrthoBox: { value: new THREE.Vector4(0, 0, 1, 1) } };
  private terrainUniforms = { uPat: { value: 0 } };
  private water!: THREE.Mesh;
  private waterCells = new Int32Array(0);
  private buildingsGroup = new THREE.Group();
  private decorGroup = new THREE.Group();
  private drainGroup = new THREE.Group();
  private pipeGroup = new THREE.Group();
  /** Red de alcantarillado separada y sección de la quebrada (si el escenario las trae). */
  private sewerView: SewerView | null = null;
  private floodView: FloodView | null = null;
  private floodGroup = new THREE.Group();
  netFilter: NetFilter = 'ambas';
  private sewerOver = new THREE.Group();
  private cutOnly = new Set<string>();
  private gardenGroup = new THREE.Group();
  private arrows: THREE.InstancedMesh;
  readonly fx: StormFx;
  private tracerFx = new TracerFx();
  private highlight: THREE.Mesh;
  private probeGroup = new THREE.Group();
  private cabins: THREE.Mesh[] = [];
  private cablePath: THREE.Vector3[] = [];
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private buildingMats: THREE.Material[] = [];
  private atlas: FacadeAtlas | null = null;
  /** Tanques, ropa tendida, cubiertas y varillas de las azoteas (se ocultan en la vista bajo la calle). */
  private roofExtras = new THREE.Group();
  private lampMat: THREE.MeshStandardMaterial | null = null;
  private glowTex: THREE.DataTexture | null = null;
  /** Nivel de tormenta con que se capturaron los reflejos, y el del cuadro anterior. */
  private envStorm = 0;
  private prevStorm = 0;
  private lampGlowMat: THREE.PointsMaterial | null = null;
  private lampPoolMat: THREE.MeshBasicMaterial | null = null;
  /** Mojado de las fachadas y ventanas encendidas (según la lluvia y la tormenta). */
  private facadeU = { uWetF: { value: 0 }, uLit: { value: 0 } };
  /** Tiempo por cuadro suavizado [s] y tiempo acumulado en el estado actual, para el detalle del entorno. */
  private frameEma = 0;
  private lodClock = 0;
  private lastNow = 0;
  private pipeMat: THREE.MeshStandardMaterial;
  private drainLeafMeshes: THREE.Mesh[] = [];
  private envMap: THREE.Texture | null = null;
  /** Entorno capturado de la propia escena (calles, fachadas y cielo) para los reflejos del agua y del suelo mojado. */
  private sceneEnv: THREE.Texture | null = null;
  /** Cuadros que faltan para capturarlo (se hace después de mostrar la escena, una sola vez). */
  private envPending = 0;
  /** Agua en la escala azul (analítica) en vez de la natural. */
  private blueWater = false;
  private cornerNb = new Int32Array(0);
  private cornerZ = new Float32Array(0);
  private backdrop: Backdrop | null = null;
  private quality: 'alta' | 'ligera';
  /** Altura del plano del sector en su centro (mundo), para encuadrar las cámaras. */
  private fitA = 0;

  view: ViewMode = 'realista';
  cut = false;
  showArrows = true;
  amplify = 1;
  private rainMmh = 0;
  private lastArrowT = -1;
  private lastWaterT = -1;
  private lastAmp = 1;
  private lastResultsT = -1;
  private tween: Tween | null = null;
  private time = 0;
  private home!: { p: THREE.Vector3; t: THREE.Vector3 };
  private disposed = false;
  private textures: THREE.Texture[] = [];
  private labelItems: (LabelItem & { at: THREE.Vector3 })[] = [];
  private pinned: { id: string; at: Pt; text: string } | null = null;
  onSelectProbe: ((p: Pick) => void) | null = null;

  constructor(container: HTMLElement, sc: Scenario, c: Compiled, opts: { reducedMotion: boolean; quality: 'alta' | 'ligera' }) {
    this.container = container;
    this.sc = sc;
    this.reducedMotion = opts.reducedMotion;
    this.quality = opts.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.quality === 'alta', powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'alta' ? 2 : 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = opts.quality === 'alta';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'city-canvas';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', `Maqueta 3D del sector: ${sc.title}. Usa los botones de vista o las flechas del teclado para mover la cámara.`);
    container.appendChild(this.renderer.domElement);
    this.labels = new LabelLayer(container);

    // el entorno llega hasta las montañas que cierran el valle (≈ 30 km): plano cercano a 1 m para la precisión
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 34000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !opts.reducedMotion;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 420;
    this.controls.listenToKeyEvents(this.renderer.domElement);
    this.controls.keyPanSpeed = 14;

    this.scene.background = new THREE.Color('#c9dcea');
    // Entorno difuso para reflejos suaves del agua y los vidrios
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    this.textures.push(env);
    this.envMap = env;
    this.scene.fog = new THREE.Fog('#c9dcea', 700, 17000);
    this.hemi = new THREE.HemisphereLight('#e8f2ff', '#6b5a48', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3df', 2.1);
    this.sun.position.set(-90, 140, 70);
    this.sun.castShadow = opts.quality === 'alta';
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);

    // Efectos de tormenta (lluvia, cielo, chorros, remolinos, cascadas): leen el estado calculado
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scene3 = this;
    this.fx = new StormFx({
      scene: this.scene,
      w: (x, y, z, out) => scene3.w(x, y, z, out),
      get zRef() { return scene3.zRef; },
      get W() { return scene3.W; },
      get H() { return scene3.H; },
      get c() { return scene3.c; },
      get sc() { return scene3.sc; },
      get cornerZ() { return scene3.cornerZ; },
      blockDepth: BLOCK_DEPTH,
      quality: opts.quality,
      reducedMotion: opts.reducedMotion,
      get outsideY() {
        const b = scene3.backdrop;
        return b ? (x: number, z: number) => b.groundY(x, z) : null;
      },
    });

    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
    this.terrainMat.onBeforeCompile = (sh) => {
      sh.uniforms.uPat = this.terrainUniforms.uPat;
      sh.uniforms.uWet = this.fx.u.uWet;
      sh.uniforms.uWetTrail = this.fx.u.uWetTrail;
      sh.uniforms.uField = this.fx.u.uField;
      sh.uniforms.uHalf = this.fx.u.uHalf;
      sh.uniforms.uRainGeo = this.fx.u.uRainGeo;
      sh.uniforms.uOrtho = this.orthoU.uOrtho;
      sh.uniforms.uOrthoOn = this.orthoU.uOrthoOn;
      sh.uniforms.uOrthoBox = this.orthoU.uOrthoBox;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPat;\nattribute float aTop;\nvarying float vPat;\nvarying float vTop;\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPat = aPat;\nvTop = aTop;\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uPat;\nuniform float uWet;\nuniform float uWetTrail;\nuniform sampler2D uField;\nuniform vec2 uHalf;\nuniform vec4 uRainGeo;\nuniform sampler2D uOrtho;\nuniform float uOrthoOn;\nuniform vec4 uOrthoBox;\nvarying float vPat;\nvarying float vTop;\nvarying vec3 vWPos;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // ortofoto sobre el terreno (vista realista de un sector real): cara superior con su color; escalones
          // interiores, más oscuros; el corte del borde de la maqueta conserva el color del suelo
          if (uOrthoOn > 0.5 && vTop > 0.25) {
            vec2 ouv = (vec2(vWPos.x + uHalf.x, uHalf.y - vWPos.z) - uOrthoBox.xy) / (uOrthoBox.zw - uOrthoBox.xy);
            if (ouv.x >= 0.0 && ouv.x <= 1.0 && ouv.y >= 0.0 && ouv.y <= 1.0) diffuseColor.rgb = texture2D(uOrtho, ouv).rgb * (vTop > 0.75 ? 1.0 : 0.7);
          }
          if (uPat > 0.5) {
            vec2 p = vWPos.xz;
            float f = 1.0;
            if (vPat > 0.5 && vPat < 1.5) { f = length(fract(p * 1.4) - 0.5) < 0.17 ? 0.62 : 1.0; }
            else if (vPat > 1.5 && vPat < 2.5) { f = fract((p.x + p.y) * 0.9) < 0.28 ? 0.7 : 1.0; }
            else if (vPat > 2.5 && vPat < 3.5) { f = mod(floor(p.x * 1.2) + floor(p.y * 1.2), 2.0) < 0.5 ? 0.78 : 1.0; }
            else if (vPat > 3.5) { f = sin(p.x * 3.5 + sin(p.y * 2.2) * 1.6) > 0.55 ? 0.7 : 1.0; }
            diffuseColor.rgb *= f;
          }
          // mojado: donde llueve (misma regla que el motor) y huella de la profundidad máxima calculada
          vec2 fuvT = vec2((vWPos.x + uHalf.x) / (2.0 * uHalf.x), (uHalf.y - vWPos.z) / (2.0 * uHalf.y));
          float trailT = texture2D(uField, clamp(fuvT, 0.0, 1.0)).a;
          float rainHereT = uRainGeo.w > 0.5 ? 1.0 - smoothstep(uRainGeo.z - 1.0, uRainGeo.z + 1.0, distance(vWPos.xz, uRainGeo.xy)) : 1.0;
          float wetT = clamp(max(uWet * rainHereT, trailT * uWetTrail * 0.9), 0.0, 1.0);
          diffuseColor.rgb *= mix(1.0, 0.64, wetT);`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.24, wetT);')
        // los escalones verticales del terreno, vistos casi de canto desde arriba, reflejaban el cielo (Fresnel) y
        // se veían como rayas claras: en ellos se apaga casi todo el reflejo especular del entorno
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectSpecular *= mix(0.12, 1.0, step(0.75, vTop));');
    };
    // Vista «bajo la calle»: las tuberías esquemáticas se dibujan por encima del terreno translúcido (rayos X)
    this.pipeMat = new THREE.MeshStandardMaterial({ color: '#25405c', roughness: 0.45, metalness: 0.2, emissive: new THREE.Color('#2b6cb0'), emissiveIntensity: 0, transparent: true, opacity: 0.92, depthTest: false });

    // Flechas de flujo (instancias planas sobre el agua)
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.07);
    shape.lineTo(0.18, -0.07);
    shape.lineTo(0.18, -0.2);
    shape.lineTo(0.5, 0);
    shape.lineTo(0.18, 0.2);
    shape.lineTo(0.18, 0.07);
    shape.lineTo(-0.5, 0.07);
    const ag = new THREE.ShapeGeometry(shape);
    ag.rotateX(-Math.PI / 2);
    this.arrows = new THREE.InstancedMesh(ag, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92, depthWrite: false }), 900);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    this.arrows.renderOrder = 4;
    this.scene.add(this.arrows);

    // Trazadores (estelas, gotas y marcas de destino)
    this.scene.add(this.tracerFx.group);

    // Resaltado de selección
    const hl = new THREE.RingGeometry(0.55, 0.8, 32);
    hl.rotateX(-Math.PI / 2);
    this.highlight = new THREE.Mesh(hl, new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.95, depthTest: false }));
    this.highlight.visible = false;
    this.highlight.renderOrder = 10;
    this.scene.add(this.highlight);

    this.scene.add(this.buildingsGroup, this.decorGroup, this.drainGroup, this.pipeGroup, this.probeGroup, this.gardenGroup, this.sewerOver, this.floodGroup);
    this.setCompiled(c);
    this.goto('general', false);
    this.resize();
  }

  // ------------------------------------------------------------ coordenadas
  /** Punto del modelo (x este, y norte, z cota) → mundo 3D. */
  w(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(x - this.W / 2, z - this.zRef, this.H / 2 - y);
  }

  /** Punto del esquema del valle donde se dibuja el sector [km]: ilustrativo en los escenarios didácticos. */
  private spot(): [number, number] {
    const known = SECTOR_SPOTS[this.sc.id];
    if (known) return known;
    const ll = this.sc.extent.lonLat;
    return ll ? toKm(ll[0], ll[1]) : SECTOR_SPOTS['calle-de-prueba'];
  }

  groundAt(x: number, y: number): number {
    const { nx, ny, dx } = this.c;
    const i = Math.min(nx - 1, Math.max(0, Math.floor(x / dx)));
    const j = Math.min(ny - 1, Math.max(0, Math.floor(y / dx)));
    const k = j * nx + i;
    return this.c.solid[k] ? this.c.zGround[k] : this.c.z[k];
  }

  /** Cota del techo de la construcción en (x, y), o −∞ si no hay construcción. */
  roofAt(x: number, y: number): number {
    const { nx, ny, dx } = this.c;
    const i = Math.min(nx - 1, Math.max(0, Math.floor(x / dx)));
    const j = Math.min(ny - 1, Math.max(0, Math.floor(y / dx)));
    const b = this.c.building[j * nx + i];
    if (b < 0) return -Infinity;
    const cb = this.c.buildings[b];
    return cb.baseZ + cb.heightM;
  }

  // ------------------------------------------------------------ construcción
  setCompiled(c: Compiled): void {
    const first = !this.c;
    this.c = c;
    this.W = c.nx * c.dx;
    this.H = c.ny * c.dx;
    let zmin = Infinity;
    for (let k = 0; k < c.zGround.length; k++) zmin = Math.min(zmin, c.zGround[k], c.z[k]);
    if (first) this.zRef = zmin;
    this.buildTerrain();
    this.buildWater();
    this.buildBuildings();
    this.buildDrainsAndPipes();
    if (first) {
      // Entorno que evoca el Valle de Aburrá (solo dibujo). Continúa el terreno del sector: el plano de
      // su pendiente cerca y una franja de unión con la altura exacta de su borde, sin escalón.
      const fit = this.sectorFit();
      this.fitA = fit.sector.plane.a;
      this.backdrop = buildBackdrop({ baseY: fit.baseY, clearX: this.W / 2 + 4, clearZ: this.H / 2 + 4, quality: this.quality, sector: fit.sector, spot: this.spot() });
      this.scene.add(this.backdrop.group);
      this.textures.push(...this.backdrop.textures);
    } else this.backdrop?.refreshApron();
    this.fx.rebuild();
    if (first) this.buildDecor();
    this.buildProbes();
    this.buildLabelAnchors();
    const s = Math.max(this.W, this.H);
    const cam = this.sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -s * 0.75;
    cam.right = s * 0.75;
    cam.top = s * 0.75;
    cam.bottom = -s * 0.75;
    cam.near = 1;
    cam.far = 500;
    cam.updateProjectionMatrix();
    this.lastWaterT = -1;
    this.lastResultsT = -1;
    this.applyView();
    if (first) this.envPending = 3;
  }

  /** Agua dibujada con la escala azul (analítica) o la natural (agua turbia, por defecto). */
  get waterBlue(): boolean {
    return this.blueWater;
  }

  set waterBlue(v: boolean) {
    this.blueWater = v;
    this.fx.u.uNat.value = v ? 0 : 1;
  }

  /**
   * Captura la escena desde el centro del sector (sin agua, lluvia ni flechas) y la usa como entorno de
   * reflejo: los charcos y el pavimento mojado espejan las fachadas y el cielo reales de la escena.
   */
  private captureEnv(): void {
    if (this.disposed) return;
    const res = this.quality === 'alta' ? 256 : 96;
    const rt = new THREE.WebGLCubeRenderTarget(res, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(1, 9000, rt);
    cc.position.set(0, this.fitA + 2.5, 0);
    const hide: THREE.Object3D[] = [this.water, this.arrows, this.tracerFx.group, this.highlight, this.pipeGroup];
    const was = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    this.fx.setCaptureMode(true);
    this.scene.add(cc);
    cc.update(this.renderer, this.scene);
    this.scene.remove(cc);
    this.fx.setCaptureMode(false);
    hide.forEach((o, i) => (o.visible = was[i]));
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = pm.fromCubemap(rt.texture).texture;
    pm.dispose();
    rt.dispose();
    if (this.sceneEnv) {
      this.sceneEnv.dispose();
      this.textures = this.textures.filter((t) => t !== this.sceneEnv);
    }
    this.sceneEnv = env;
    this.textures.push(env);
    const mats: THREE.MeshStandardMaterial[] = [this.water.material as THREE.MeshStandardMaterial, this.terrainMat, ...(this.buildingMats as THREE.MeshStandardMaterial[])];
    for (const m of mats) {
      // cambiar un mapa por otro igual no exige recompilar el sombreador
      if (!m.envMap) m.needsUpdate = true;
      m.envMap = env;
    }
    this.envStorm = this.fx.stormLevel;
  }

  private disposeGroup(g: THREE.Group): void {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    g.clear();
  }

  /**
   * Alturas de las esquinas de cada celda: el terreno se dibuja interpolando las cotas de las celdas
   * vecinas «conectadas» (mismo desnivel propio y sin muro), y conserva como escalones los bordillos,
   * lotes y muros. Así una ladera se ve continua sin inventar desniveles.
   */
  private computeCorners(): void {
    const c = this.c;
    const { nx, ny } = c;
    const N = nx * ny;
    const off = new Float64Array(N);
    for (let k = 0; k < N; k++) off[k] = c.z[k] - c.zGround[k];
    const wallTol = 0.35 * Math.max(1, c.dx);
    const conn = (k: number, n: number) => !c.solid[n] && Math.abs(c.zGround[k] - c.zGround[n]) < wallTol && Math.abs(off[k] - off[n]) < 0.02 && (c.garden[k] >= 0) === (c.garden[n] >= 0);
    // esquinas: 0 = (x0,y0), 1 = (x1,y0), 2 = (x1,y1), 3 = (x0,y1)
    const nb = new Int32Array(N * 16).fill(-1);
    const cz = new Float32Array(N * 4);
    const D = [
      [[-1, 0], [0, -1], [-1, -1]],
      [[1, 0], [0, -1], [1, -1]],
      [[1, 0], [0, 1], [1, 1]],
      [[-1, 0], [0, 1], [-1, 1]],
    ];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      for (let q = 0; q < 4; q++) {
        let sz = c.zGround[k], cnt = 1, m = 0;
        nb[k * 16 + q * 4 + m++] = k;
        for (const [di, dj] of D[q]) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const n = jj * nx + ii;
          if (c.solid[k] || !conn(k, n)) continue;
          sz += c.zGround[n];
          cnt++;
          nb[k * 16 + q * 4 + m++] = n;
        }
        cz[k * 4 + q] = sz / cnt + off[k];
      }
    }
    this.cornerNb = nb;
    this.cornerZ = cz;
  }

  private buildTerrain(): void {
    this.computeCorners();
    const c = this.c;
    const { nx, ny, dx } = c;
    const cz = this.cornerZ;
    const pos: number[] = [];
    const col: number[] = [];
    const mat: number[] = [];
    const pat: number[] = [];
    const top: number[] = [];
    const idx: number[] = [];
    const coverRgb = COVER_LIST.map((id) => hexToRgb(COVERS[id].color));
    const matRgb = COVER_LIST.map((id) => hexToRgb(COVERS[id].matColor));
    const patOf = COVER_LIST.map((id) => PATTERN_ID[COVERS[id].pattern]);
    const quad = (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3, d: THREE.Vector3, rgb: number[], mrgb: number[], p: number, shade: number, bottomShade = shade, isTop = 0) => {
      const base = pos.length / 3;
      for (const q of [a, b, cc, d]) pos.push(q.x, q.y, q.z);
      for (let q = 0; q < 4; q++) {
        const sh = q < 2 ? shade : bottomShade;
        col.push(rgb[0] * sh, rgb[1] * sh, rgb[2] * sh);
        mat.push(mrgb[0] * sh, mrgb[1] * sh, mrgb[2] * sh);
        pat.push(p);
        top.push(isTop); // 1 cara superior · 0,5 escalón interior · 0 corte del borde
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const soil = [0.42, 0.31, 0.22];
    const bottomZ = this.zRef - BLOCK_DEPTH;
    // aristas: [esquina a, esquina b] de cada lado, vecino (di,dj) y esquinas del vecino en ese lado
    const EDGES: [number, number, number, number, number, number][] = [
      [1, 2, 1, 0, 0, 3], // este
      [3, 0, -1, 0, 2, 1], // oeste
      [2, 3, 0, 1, 1, 0], // norte
      [0, 1, 0, -1, 3, 2], // sur
    ];
    const cxy = (i: number, j: number, q: number): [number, number] => [(i + (q === 1 || q === 2 ? 1 : 0)) * dx, (j + (q >= 2 ? 1 : 0)) * dx];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (c.solid[k]) continue;
        const cv = c.cover[k];
        const n = 0.92 + hash(k) * 0.12;
        const rgb = coverRgb[cv], mrgb = matRgb[cv], p = patOf[cv];
        const P = [0, 1, 2, 3].map((q) => {
          const [x, y] = cxy(i, j, q);
          return this.w(x, y, cz[k * 4 + q]);
        });
        quad(P[0], P[1], P[2], P[3], rgb, mrgb, p, n, n, 1);
        for (const [qa, qb, di, dj, na, nbq] of EDGES) {
          const ii = i + di, jj = j + dj;
          const edge = ii < 0 || jj < 0 || ii >= nx || jj >= ny;
          let za: number, zb: number;
          if (edge) {
            za = bottomZ;
            zb = bottomZ;
          } else {
            const nn = jj * nx + ii;
            if (c.solid[nn]) continue;
            za = cz[nn * 4 + na];
            zb = cz[nn * 4 + nbq];
            if (cz[k * 4 + qa] <= za + 0.005 && cz[k * 4 + qb] <= zb + 0.005) continue;
            za = Math.min(za, cz[k * 4 + qa]);
            zb = Math.min(zb, cz[k * 4 + qb]);
          }
          const [ax, ay] = cxy(i, j, qa), [bx, by] = cxy(i, j, qb);
          const wrgb = edge ? soil : rgb;
          // escalón interior: cara hacia la celda vecina más baja (orden antihorario visto desde afuera; antes
          // quedaba al revés y se descartaba, y por el hueco se veía el cielo); el corte del borde de la maqueta
          // conserva su orden
          if (edge) quad(P[qa], P[qb], this.w(bx, by, zb), this.w(ax, ay, za), wrgb, soil, 0, 0.95, 0.45, 0);
          else quad(P[qb], P[qa], this.w(ax, ay, za), this.w(bx, by, zb), wrgb, mrgb, 0, 0.78, 0.7, 0.5);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const colors = new Float32Array(col);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aPat', new THREE.Float32BufferAttribute(pat, 1));
    g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.terrainColors = { real: Float32Array.from(colors), mat: new Float32Array(mat) };
    if (this.terrain) {
      this.terrain.geometry.dispose();
      this.terrain.geometry = g;
    } else {
      this.terrain = new THREE.Mesh(g, this.terrainMat);
      this.terrain.receiveShadow = true;
      this.scene.add(this.terrain);
    }
  }

  private buildWater(): void {
    const c = this.c;
    const { nx, ny, dx } = c;
    const cells: number[] = [];
    for (let k = 0; k < nx * ny; k++) if (!c.solid[k]) cells.push(k);
    this.waterCells = Int32Array.from(cells);
    const n = cells.length;
    const pos = new Float32Array(n * 12);
    const col = new Float32Array(n * 16);
    const idx = new Uint32Array(n * 6);
    const v = new THREE.Vector3();
    cells.forEach((k, q) => {
      const i = k % nx, j = (k - i) / nx;
      const x0 = i * dx, x1 = x0 + dx, y0 = j * dx, y1 = y0 + dx;
      const corners = [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ];
      corners.forEach(([x, y], m) => {
        this.w(x, y, this.cornerZ[k * 4 + m] - 0.05, v);
        pos.set([v.x, v.y, v.z], q * 12 + m * 3);
      });
      const b = q * 4;
      idx.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    const nrm = new Float32Array(n * 12);
    for (let q = 1; q < nrm.length; q += 3) nrm[q] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.hypot(this.W, this.H));
    if (this.water) {
      this.water.geometry.dispose();
      this.water.geometry = g;
    } else {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.16, metalness: 0.02, depthWrite: false, envMap: this.envMap, envMapIntensity: 0.4 });
      // Agua: el color sale de la profundidad calculada (misma escala de la leyenda, interpolada entre
      // celdas); las vetas avanzan a la velocidad calculada en tiempo real; la espuma marca el agua rápida
      // (número de Froude alto); los anillos de gotas solo aparecen donde llueve. La altura de la lámina
      // no cambia: solo cambian el color y la normal.
      m.onBeforeCompile = (sh) => {
        const u = this.fx.u;
        Object.assign(sh.uniforms, { uField: u.uField, uRamp: u.uRamp, uRampN: u.uRampN, uNat: u.uNat, uNoise: u.uNoise, uHalf: u.uHalf, uTime: u.uTime, uFlowT: u.uFlowT, uRainAmt: u.uRainAmt, uRainGeo: u.uRainGeo, uMode: u.uMode, uMud: u.uMud, uHaz: u.uHaz });
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
            uniform sampler2D uField, uRamp, uRampN, uNoise;
            uniform vec2 uHalf;
            uniform float uTime, uFlowT, uRainAmt, uMode, uNat, uMud;
            uniform vec3 uHaz[7];
            uniform vec4 uRainGeo;
            varying vec3 vWPos;`,
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            vec2 fuv = vec2((vWPos.x + uHalf.x) / (2.0 * uHalf.x), (uHalf.y - vWPos.z) / (2.0 * uHalf.y));
            vec4 F = texture2D(uField, fuv);
            float hs = max(F.r, 0.0);
            if (vColor.a < 0.001 || hs < 0.0005) discard;
            float sDepth = clamp(log(hs / 0.001) / log(300.0), 0.0, 1.0);
            // vista realista: agua turbia (escala natural de la leyenda); si no, la escala azul
            float nat = (uNat > 0.5 && uMode < 0.5) ? 1.0 : 0.0;
            vec2 rampUv = vec2(sDepth * (255.0 / 256.0) + 0.5 / 256.0, 0.5);
            vec4 rc = nat > 0.5 ? texture2D(uRampN, rampUv) : texture2D(uRamp, rampUv);
            diffuseColor = vec4(rc.rgb, rc.a);
            if (uMode > 1.5) diffuseColor.a = max(diffuseColor.a, 0.9);
            // vista de peligro: color de la clase máxima calculada (G del campo)
            if (uMode > 2.5) {
              int hc = int(F.g + 0.5);
              vec3 hcol = uHaz[0];
              for (int m = 1; m < 7; m++) if (m == hc) hcol = uHaz[m];
              diffuseColor = vec4(hcol, hc == 0 ? 0.35 : 0.93);
            }
            // agua de la creciente con lodo: el agua honda se vuelve café espeso (solo el color)
            if (uMode < 0.5 && nat > 0.5 && uMud > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.31, 0.2), uMud * 0.75 * smoothstep(0.25, 1.0, hs));
            vec2 vel = uMode > 2.5 ? vec2(0.0) : F.gb;
            float spd = length(vel);
            float streak = 0.0, foam = 0.0, nflow = 0.5, kflow = 0.0, rough = 0.0, chop = 0.5;
            vec2 fdir = vec2(1.0, 0.0);
            if (uMode < 0.5 && spd > 0.015) {
              fdir = vel / spd;
              vec2 pm = vec2(vWPos.x, -vWPos.z);
              vec2 perp = vec2(-fdir.y, fdir.x);
              float al = dot(pm, fdir), ac = dot(pm, perp);
              float p0 = uFlowT, p1 = fract(uFlowT + 0.5);
              float n0 = texture2D(uNoise, vec2((al - spd * p0 * ${FLOW_CYCLE.toFixed(3)}) * 0.3, ac * 1.3)).r;
              float n1 = texture2D(uNoise, vec2((al - spd * p1 * ${FLOW_CYCLE.toFixed(3)}) * 0.3 + 0.37, ac * 1.3 + 0.21)).r;
              float w0 = 1.0 - abs(2.0 * p0 - 1.0);
              nflow = mix(n1, n0, w0);
              kflow = smoothstep(0.05, 0.5, spd) * smoothstep(0.001, 0.005, hs);
              streak = smoothstep(0.55, 0.8, nflow) * kflow;
              float fr = spd / sqrt(9.81 * max(hs, 0.001));
              foam = smoothstep(0.85, 1.35, fr) * smoothstep(0.45, 0.72, nflow) * smoothstep(0.005, 0.015, hs);
              // agua honda y rápida (creciente): oleaje picado y espuma que avanzan con la corriente calculada
              rough = smoothstep(1.2, 4.0, spd) * smoothstep(0.15, 0.8, hs);
              if (rough > 0.001) {
                chop = texture2D(uNoise, vec2((al - spd * uTime * 0.7) * 0.75, ac * 0.55 + 0.13)).r;
                float c2 = texture2D(uNoise, vec2((al - spd * uTime * 1.1) * 1.7 + 0.5, ac * 1.4)).r;
                foam = max(foam, rough * smoothstep(0.5, 0.82, 0.6 * chop + 0.4 * c2));
              }
            }
            float wmix = clamp(streak * 0.38 + foam * 0.65, 0.0, 0.85);
            // vetas: en el agua turbia, crestas más claras del mismo café; espuma casi blanca
            vec3 streakC = nat > 0.5 ? mix(vec3(0.8, 0.74, 0.62), vec3(0.94, 0.93, 0.9), foam) : vec3(0.9, 0.95, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, streakC, wmix);
            diffuseColor.a = clamp(max(diffuseColor.a, wmix), 0.0, 0.97) * opacity;`,
          )
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            vec2 wp = vWPos.xz;
            vec3 pert = vec3(sin(wp.x * 2.7 + uTime * 1.9) + sin(wp.y * 1.9 - uTime * 1.3), 0.0, cos(wp.y * 3.1 + uTime * 1.6) + cos(wp.x * 2.2 - uTime * 2.1)) * 0.04;
            pert += vec3(fdir.x, 0.0, -fdir.y) * (nflow - 0.5) * 0.6 * kflow;
            pert += vec3(fdir.x + 0.6 * fdir.y, 0.0, -fdir.y + 0.6 * fdir.x) * (chop - 0.5) * 1.6 * rough;
            float rainHere = uRainGeo.w > 0.5 ? step(distance(wp, uRainGeo.xy), uRainGeo.z) : 1.0;
            float ripAmt = uRainAmt * rainHere * (uMode < 0.5 ? 1.0 : 0.0);
            if (ripAmt > 0.001) {
              vec2 rg = vec2(0.0);
              float rip = 0.0;
              for (int li = 0; li < 2; li++) {
                float sc = li == 0 ? 1.1 : 1.9;
                vec2 q = wp * sc + float(li) * 7.3;
                vec2 cell = floor(q);
                float seed = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
                float ph = fract(uTime * (0.9 + 0.3 * seed) + seed);
                vec2 ctr = cell + 0.5 + (vec2(seed, fract(seed * 7.13)) - 0.5) * 0.5;
                vec2 d = q - ctr;
                float r = length(d);
                float ring = smoothstep(0.07, 0.0, abs(r - ph * 0.48)) * (1.0 - ph);
                rg += (r > 1e-4 ? d / r : vec2(0.0)) * ring;
                rip += ring;
              }
              pert += vec3(rg.x, 0.0, rg.y) * 0.9 * ripAmt;
              diffuseColor.rgb += vec3(0.1, 0.12, 0.14) * rip * ripAmt;
            }
            normal = normalize(normal + (viewMatrix * vec4(pert, 0.0)).xyz);`,
          )
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.05, nat);')
          .replace(
            '#include <opaque_fragment>',
            `#include <opaque_fragment>
            // agua natural: refleja más cuanto más rasante se mira (Fresnel); la película fina se ve como
            // suelo mojado que espeja la calle, el agua honda como agua turbia
            if (nat > 0.5) {
              float fres = pow(1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0), 5.0);
              gl_FragColor.a = max(gl_FragColor.a, min(0.9, (0.1 + fres * 1.15) * smoothstep(0.0005, 0.002, hs)));
            }`,
          );
      };
      this.water = new THREE.Mesh(g, m);
      this.water.renderOrder = 2;
      this.scene.add(this.water);
    }
  }

  private buildBuildings(): void {
    this.disposeGroup(this.buildingsGroup);
    this.roofExtras = new THREE.Group();
    const c = this.c, sc = this.sc;
    if (!this.buildingMats.length) {
      const plaster = plasterTexture(), glass = glassTexture(), roof = roofTexture();
      const atlas = facadeAtlas();
      this.atlas = atlas;
      this.textures.push(plaster, glass, roof, atlas.map, atlas.mask);
      // fachadas de barrio: el atlas trae los módulos; la máscara dice qué parte del módulo es muro y se
      // tiñe con el color de la casa (ladrillo con su variación, o la pintura del frente)
      const fm = new THREE.MeshStandardMaterial({ map: atlas.map, vertexColors: true, roughness: 0.88 });
      fm.onBeforeCompile = (sh) => {
        sh.uniforms.uMask = { value: atlas.mask };
        sh.uniforms.uWetF = this.facadeU.uWetF;
        sh.uniforms.uLit = this.facadeU.uLit;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFW = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D uMask;\nuniform float uWetF, uLit;\nvarying vec3 vFW;\nfloat fh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }')
          .replace(
            '#include <color_fragment>',
            `float wallM = 1.0;
            #if defined( USE_COLOR )
              wallM = texture2D(uMask, vMapUv).r;
              diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, wallM);
            #endif
            // vidrio de las ventanas (oscuro y azulado en el atlas): refleja el entorno y se enciende de noche
            float lumT = dot(sampledDiffuseColor.rgb, vec3(0.3, 0.59, 0.11));
            float glassM = (1.0 - wallM) * step(lumT, 0.34) * step(sampledDiffuseColor.r, sampledDiffuseColor.b + 0.03);
            // mojado: el muro se oscurece, con chorreaduras verticales bajo pretiles y ventanas
            float colId = floor((vFW.x + vFW.z) * 2.6);
            float sr = fh(vec2(colId, floor(vFW.y / 2.9)));
            float fy = fract(vFW.y / 2.9);
            float streak = step(0.62, sr) * smoothstep(0.15 + 0.5 * fh(vec2(colId, 7.0)), 1.0, fy);
            float wetW = uWetF * wallM;
            diffuseColor.rgb *= mix(1.0, 0.7, wetW) * (1.0 - 0.22 * streak * wetW);`,
          )
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.5, wetW), 0.12, glassM);')
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            // con el cielo oscuro de la tormenta se encienden algunas ventanas (luz cálida de las casas)
            float onW = step(0.58, fh(vec2(floor((vFW.x + vFW.z) / 1.4), floor(vFW.y / 2.9) + 3.0)));
            totalEmissiveRadiance += vec3(1.0, 0.76, 0.46) * glassM * onW * uLit * 0.85;`,
          );
      };
      fm.side = THREE.DoubleSide;
      this.buildingMats = [
        fm,
        new THREE.MeshStandardMaterial({ map: plaster, vertexColors: true, roughness: 0.85 }),
        new THREE.MeshStandardMaterial({ map: glass, roughness: 0.35, metalness: 0.1 }),
        new THREE.MeshStandardMaterial({ map: roof, vertexColors: true, roughness: 0.95 }),
      ];
      // techos: en la vista realista de un sector real, el color de la ortofoto en ese punto
      this.buildingMats[3].onBeforeCompile = (sh) => {
        sh.uniforms.uOrtho = this.orthoU.uOrtho;
        sh.uniforms.uOrthoOn = this.orthoU.uOrthoOn;
        sh.uniforms.uOrthoBox = this.orthoU.uOrthoBox;
        sh.uniforms.uHalf = this.fx.u.uHalf;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vRW;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = (modelMatrix * vec4(position, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D uOrtho;\nuniform float uOrthoOn;\nuniform vec4 uOrthoBox;\nuniform vec2 uHalf;\nvarying vec3 vRW;')
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            if (uOrthoOn > 0.5) {
              vec2 ouv = (vec2(vRW.x + uHalf.x, uHalf.y - vRW.z) - uOrthoBox.xy) / (uOrthoBox.zw - uOrthoBox.xy);
              if (ouv.x >= 0.0 && ouv.x <= 1.0 && ouv.y >= 0.0 && ouv.y <= 1.0) diffuseColor.rgb = texture2D(uOrtho, ouv).rgb;
            }`,
          );
      };
    }
    const atlas = this.atlas!;
    type Geo = { pos: number[]; uv: number[]; col: number[]; nrm: number[]; idx: number[] };
    const geo = (): Geo => ({ pos: [], uv: [], col: [], nrm: [], idx: [] });
    const walls: Geo[] = [geo(), geo(), geo()]; // 0 fachadas de barrio · 1 pañete (institucional) · 2 vidrio (torres)
    const roofs = geo();
    const tankSpots: { p: THREE.Vector3; blue: boolean }[] = [];
    const rebar: number[] = [];
    const laundryLines: number[] = [];
    const clothes = geo();
    const sheds = geo();
    const rnd = prng(this.sc.seed + 5);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const quad = (g: Geo, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, uv: [number, number, number, number], col: number[], n: [number, number, number]) => {
      const k = g.pos.length / 3;
      g.pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
      const [u0, v0, u1, v1] = uv;
      g.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      for (let q = 0; q < 4; q++) {
        g.col.push(col[0], col[1], col[2]);
        g.nrm.push(n[0], n[1], n[2]);
      }
      g.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    };
    // celda del sector en (x, y) del modelo (null fuera)
    const cellAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) return -1;
      return Math.floor(y / c.dx) * c.nx + Math.floor(x / c.dx);
    };
    const streetCover = new Set(['asfalto', 'anden', 'adoquin_permeable', 'concreto'].map((id) => COVER_LIST.indexOf(id as (typeof COVER_LIST)[number])));
    const roadCover = new Set(['asfalto', 'anden'].map((id) => COVER_LIST.indexOf(id as (typeof COVER_LIST)[number])));
    // pinturas de fachada frecuentes en los barrios de Medellín (pasteles y tonos vivos gastados)
    const paints = ['#efe3c2', '#f2d27a', '#cfe3d4', '#bcd7e8', '#f0c2a8', '#e9b9c2', '#d9e6a8', '#f4efe4', '#9fd0c9', '#f3b56b', '#c7b6dc'];
    const sub = (u: [number, number, number, number], f0: number, f1: number): [number, number, number, number] => [u[0], u[1] + (u[3] - u[1]) * f0, u[2], u[1] + (u[3] - u[1]) * f1];
    sc.buildings.forEach((bs, bi) => {
      const cb = c.buildings[bi];
      if (!cb || cb.cells === 0) return;
      const base = cb.baseZ - 0.3;
      const topZ = cb.baseZ + bs.heightM;
      const floors = Math.max(1, bs.floors);
      const floorH = bs.heightM / floors;
      const barrio = bs.style === 'ladrillo' || bs.style === 'revoque';
      const kind = barrio ? 0 : bs.style === 'comercial' ? 1 : 2;
      const tgt = walls[kind];
      // Orientación antihoraria (vista desde arriba) para que las caras miren hacia afuera
      let area2 = 0;
      for (let e = 0; e < bs.polygon.length; e++) {
        const [xa, ya] = bs.polygon[e], [xb, yb] = bs.polygon[(e + 1) % bs.polygon.length];
        area2 += xa * yb - xb * ya;
      }
      const poly = area2 >= 0 ? bs.polygon : [...bs.polygon].reverse();
      const cx = poly.reduce((s2, p) => s2 + p[0], 0) / poly.length, cy = poly.reduce((s2, p) => s2 + p[1], 0) / poly.length;
      const par = bs.style === 'torre' || bs.style === 'comercial' ? 0.9 : 0.5;
      // casas de barrio: frente pañetado y pintado (o ladrillo a la vista), culatas de ladrillo y, en
      // algunas, el último piso en obra gris con las varillas esperando el siguiente
      const paint = bs.color ? hexToRgb(bs.color) : hexToRgb(paints[Math.floor(rnd() * paints.length)]);
      const frontPainted = bs.style === 'revoque' || (bs.color ? true : rnd() < 0.38);
      const obra = bs.style === 'ladrillo' && floors >= 2 && rnd() < 0.32;
      const tv = 0.9 + hash(bi * 7 + 3) * 0.16;
      const brickTint = [tv, tv * 0.98, tv * 0.96];
      const white = [1, 1, 1];
      if (!barrio) {
        const tint = bs.color ? hexToRgb(bs.color) : [tv, tv, tv];
        let acc = 0;
        for (let e = 0; e < poly.length; e++) {
          const p0 = poly[e], p1 = poly[(e + 1) % poly.length];
          const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          if (L < 1e-6) continue;
          const n: [number, number, number] = [(p1[1] - p0[1]) / L, 0, (p1[0] - p0[0]) / L];
          const u0 = acc / 3, u1 = (acc + L) / 3;
          quad(tgt, this.w(p0[0], p0[1], base, a), this.w(p1[0], p1[1], base, b), this.w(p1[0], p1[1], topZ), this.w(p0[0], p0[1], topZ), [u0, -(cb.baseZ - base) / floorH, u1, bs.heightM / floorH], tint, n);
          quad(tgt, this.w(p0[0], p0[1], topZ), this.w(p1[0], p1[1], topZ), this.w(p1[0], p1[1], topZ + par), this.w(p0[0], p0[1], topZ + par), [u0, 0.005, u1, 0.05], tint, n);
          quad(tgt, this.w(p1[0], p1[1], topZ), this.w(p0[0], p0[1], topZ), this.w(p0[0], p0[1], topZ + par), this.w(p1[0], p1[1], topZ + par), [u1, 0.005, u0, 0.05], tint.map((v) => v * 0.8), [-n[0], 0, -n[2]]);
          acc += L;
        }
      } else {
        // tipo de cada cara según lo que tiene enfrente: calle (frente), casa vecina (culata) o patio/lado
        let doorPlaced = false;
        const edges = poly.map((p0, e) => {
          const p1 = poly[(e + 1) % poly.length];
          const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          const nx = (p1[1] - p0[1]) / (L || 1), ny = -(p1[0] - p0[0]) / (L || 1); // normal exterior (modelo)
          const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
          const k0 = cellAt(mx + nx * 0.8, my + ny * 0.8);
          const shared = k0 >= 0 && c.building[k0] >= 0 && c.building[k0] !== bi;
          let road = false, open = k0 < 0;
          for (const d of [0.8, 2, 3.5, 5, 7, 9]) {
            const k = cellAt(mx + nx * d, my + ny * d);
            if (k < 0) {
              open = true;
              break;
            }
            if (c.building[k] >= 0 && c.building[k] !== bi) break;
            if (roadCover.has(c.cover[k])) road = true;
            if (streetCover.has(c.cover[k])) open = true;
          }
          return { p0, p1, L, nx, ny, type: shared ? 'culata' : road ? 'frente' : open ? 'lado' : 'culata' };
        });
        if (!edges.some((e) => e.type === 'frente')) {
          // sin calle al frente: la cara más larga que da afuera hace de frente
          const cand = edges.filter((e) => e.type === 'lado').sort((x, y) => y.L - x.L)[0];
          if (cand) cand.type = 'frente';
        }
        for (const ed of edges) {
          const { p0, p1, L } = ed;
          if (L < 1e-6) continue;
          const n: [number, number, number] = [(p1[1] - p0[1]) / L, 0, (p1[0] - p0[0]) / L]; // normal exterior en el mundo
          const painted = ed.type === 'frente' ? frontPainted : bs.style === 'revoque' && ed.type === 'lado' && rnd() < 0.45;
          const P = painted ? 'p' : 'b';
          const col = painted ? paint : brickTint;
          const nm = Math.max(1, Math.round(L / 3));
          const doorAt = ed.type === 'frente' && !doorPlaced ? Math.floor(rnd() * nm) : -1;
          if (doorAt >= 0) doorPlaced = true;
          for (let m = 0; m < nm; m++) {
            const t0 = m / nm, t1 = (m + 1) / nm;
            const xa = p0[0] + (p1[0] - p0[0]) * t0, ya = p0[1] + (p1[1] - p0[1]) * t0;
            const xb = p0[0] + (p1[0] - p0[0]) * t1, yb = p0[1] + (p1[1] - p0[1]) * t1;
            // zócalo bajo el nivel del primer piso (lo que queda en contacto con el terreno)
            quad(tgt, this.w(xa, ya, base, a), this.w(xb, yb, base, b), this.w(xb, yb, cb.baseZ), this.w(xa, ya, cb.baseZ), sub(atlas.uv('zocalo'), 0, 0.1), white, n);
            for (let f = 0; f < floors; f++) {
              const z0 = cb.baseZ + f * floorH, z1 = z0 + floorH;
              const top = f === floors - 1;
              let id: TileId;
              const r = rnd();
              if (obra && top) id = ed.type === 'culata' || r < 0.4 ? 'gBlank' : 'gWin';
              else if (ed.type === 'culata') id = `${P}Blank` as TileId;
              else if (ed.type === 'lado') {
                if (f === 0) id = r < 0.6 ? `${P}Blank` as TileId : `${P}WinLow` as TileId;
                else id = r < 0.45 ? `${P}Blank` as TileId : r < 0.72 ? `${P}Small` as TileId : r < 0.84 && P === 'b' ? 'bCalado' : `${P}WinReja` as TileId;
              } else if (f === 0) {
                if (m === doorAt) id = `${P}Door` as TileId;
                else {
                  const opts: TileId[] = P === 'b' ? ['bShopA', 'bShopB', 'bShutA', 'bShutB', 'bGarage', 'bWinLow', 'bDoor'] : ['pShopA', 'pShopB', 'pShopC', 'pShutA', 'pShutB', 'pGarage', 'pWinLow', 'pDoor'];
                  id = opts[Math.floor(rnd() * opts.length)];
                }
              } else {
                const opts: TileId[] = P === 'b' ? ['bWinReja', 'bWinReja', 'bWinAlu', 'bBalcon', 'bSmall'] : ['pWinReja', 'pWinReja2', 'pWinAlu', 'pBalcon', 'pPlants', 'pSmall'];
                id = opts[Math.floor(rnd() * opts.length)];
              }
              const tileCol = id.startsWith('g') ? white : col;
              quad(tgt, this.w(xa, ya, z0, a), this.w(xb, yb, z0, b), this.w(xb, yb, z1), this.w(xa, ya, z1), atlas.uv(id), tileCol, n);
            }
            if (!obra) {
              // pretil sobre la azotea (cara exterior e interior)
              const pu = sub(atlas.uv(`${P}Blank` as TileId), 0.7, 0.86);
              quad(tgt, this.w(xa, ya, topZ, a), this.w(xb, yb, topZ, b), this.w(xb, yb, topZ + par), this.w(xa, ya, topZ + par), pu, col, n);
              quad(tgt, this.w(xb, yb, topZ, a), this.w(xa, ya, topZ, b), this.w(xa, ya, topZ + par), this.w(xb, yb, topZ + par), sub(atlas.uv('bBlank'), 0.7, 0.86), brickTint.map((v) => v * 0.85), [-n[0], 0, -n[2]]);
            }
          }
        }
      }
      // Techo plano (placa de concreto)
      const contour = poly.map(([x, y]) => new THREE.Vector2(x, y));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const r0 = roofs.pos.length / 3;
      const roofTint = bs.style === 'ladrillo' ? [0.86, 0.8, 0.74] : bs.style === 'revoque' ? [0.95, 0.93, 0.9] : [0.8, 0.82, 0.85];
      for (const [x, y] of poly) {
        const p = this.w(x, y, topZ);
        roofs.pos.push(p.x, p.y, p.z);
        roofs.uv.push(x / 6, y / 6);
        roofs.col.push(roofTint[0], roofTint[1], roofTint[2]);
        roofs.nrm.push(0, 1, 0);
      }
      for (const t of tris) {
        const [a0, a1, a2] = t;
        const cr = (poly[a1][0] - poly[a0][0]) * (poly[a2][1] - poly[a0][1]) - (poly[a1][1] - poly[a0][1]) * (poly[a2][0] - poly[a0][0]);
        if (cr >= 0) roofs.idx.push(r0 + a0, r0 + a1, r0 + a2);
        else roofs.idx.push(r0 + a0, r0 + a2, r0 + a1);
      }
      if (!barrio && bs.style === 'torre') return;
      // Azotea de barrio: tanques (negros y azules), varillas en espera, ropa tendida y tejas de fibrocemento
      const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const inside = (x: number, y: number) => {
        let ins = false;
        for (let e = 0, f = poly.length - 1; e < poly.length; f = e++) {
          const [xi, yi] = poly[e], [xj, yj] = poly[f];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
        }
        return ins;
      };
      const inner = (fx: number, fy: number): [number, number] => [minX + 1 + (maxX - minX - 2) * fx, minY + 1 + (maxY - minY - 2) * fy];
      const nTanks = rnd() < 0.75 ? 1 + (rnd() < 0.3 ? 1 : 0) : 0;
      for (let k = 0; k < nTanks; k++) {
        const [tx, ty] = inner(0.15 + rnd() * 0.7, 0.15 + rnd() * 0.7);
        if (inside(tx, ty)) tankSpots.push({ p: this.w(tx, ty, topZ), blue: rnd() < 0.3 });
      }
      if (obra) {
        // varillas en las esquinas y cada ≈ 3 m en el borde
        for (let e = 0; e < poly.length; e++) {
          const p0 = poly[e], p1 = poly[(e + 1) % poly.length];
          const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          const m = Math.max(1, Math.round(L / 3));
          for (let k = 0; k < m; k++) {
            const t = k / m;
            const x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t;
            const ix = x + (cx - x) * 0.04, iy = y + (cy - y) * 0.04;
            for (const [dx2, dy2] of [[0, 0], [0.12, 0.05], [-0.06, 0.12]]) {
              const p = this.w(ix + dx2, iy + dy2, topZ), q2 = this.w(ix + dx2 + 0.05, iy + dy2, topZ + 0.9 + rnd() * 0.5);
              rebar.push(p.x, p.y, p.z, q2.x, q2.y, q2.z);
            }
          }
        }
      } else if (rnd() < 0.45 && maxX - minX > 4 && maxY - minY > 4) {
        // ropa tendida: dos o tres cuerdas con prendas de colores
        const alongX = maxX - minX > maxY - minY;
        const nl = 2 + (rnd() < 0.5 ? 1 : 0);
        for (let l = 0; l < nl; l++) {
          const f = 0.3 + (l / Math.max(1, nl - 1)) * 0.4;
          const [x0, y0] = alongX ? inner(0.1, f) : inner(f, 0.1);
          const [x1, y1] = alongX ? inner(0.9, f) : inner(f, 0.9);
          const h = topZ + 1.55;
          const pa = this.w(x0, y0, h), pb = this.w(x1, y1, h);
          laundryLines.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
          const pa0 = this.w(x0, y0, topZ), pb0 = this.w(x1, y1, topZ);
          laundryLines.push(pa0.x, pa0.y, pa0.z, pa.x, pa.y, pa.z, pb0.x, pb0.y, pb0.z, pb.x, pb.y, pb.z);
          const L = Math.hypot(x1 - x0, y1 - y0);
          for (let s2 = 0.4; s2 < L - 0.5; s2 += 0.55 + rnd() * 0.5) {
            if (rnd() < 0.25) continue;
            const t = s2 / L, wv = 0.35 + rnd() * 0.35, hv = 0.45 + rnd() * 0.5;
            const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
            const ux = ((x1 - x0) / L) * wv, uy = ((y1 - y0) / L) * wv;
            const hue = new THREE.Color().setHSL(rnd(), 0.35 + rnd() * 0.45, 0.45 + rnd() * 0.35);
            const roofT = atlas.uv('zocalo');
            quad(clothes, this.w(x, y, h - hv, a), this.w(x + ux, y + uy, h - hv, b), this.w(x + ux, y + uy, h), this.w(x, y, h), [roofT[0], roofT[1], roofT[0] + 0.001, roofT[1] + 0.001], [Math.min(1, hue.r * 1.5), Math.min(1, hue.g * 1.5), Math.min(1, hue.b * 1.5)], [0, 0, 1]);
          }
        }
      } else if (rnd() < 0.4 && maxX - minX > 4 && maxY - minY > 4) {
        // cubierta liviana de teja ondulada sobre parte de la azotea (cuarto útil o terraza cubierta)
        const [x0, y0] = inner(0.05, 0.05), [x1, y1] = inner(0.95, 0.45 + rnd() * 0.25);
        const hA = topZ + 2.5, hB = topZ + 2.1;
        quad(sheds, this.w(x0, y0, hB, a), this.w(x1, y0, hB, b), this.w(x1, y1, hA), this.w(x0, y1, hA), atlas.uv('roofSheet'), white, [0, 1, 0]);
        for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
          const pz = py === y0 ? hB : hA;
          const p = this.w(px, py, topZ), q2 = this.w(px, py, pz);
          rebar.push(p.x, p.y, p.z, q2.x, q2.y, q2.z);
        }
      }
    });
    const mkMesh = (g: Geo, mat: THREE.Material, pick: boolean) => {
      if (!g.pos.length) return null;
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      bg.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      bg.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
      bg.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
      bg.setIndex(g.idx);
      const mesh = new THREE.Mesh(bg, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (pick) mesh.userData.pickBuilding = true;
      return mesh;
    };
    walls.forEach((wg, m) => {
      const mesh = mkMesh(wg, this.buildingMats[m], true);
      if (mesh) this.buildingsGroup.add(mesh);
    });
    const roofMesh = mkMesh(roofs, this.buildingMats[3], true);
    if (roofMesh) this.buildingsGroup.add(roofMesh);
    const shedMesh = mkMesh(sheds, this.buildingMats[0], false);
    if (shedMesh) this.roofExtras.add(shedMesh);
    if (clothes.pos.length) {
      const cm = mkMesh(clothes, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), false)!;
      cm.castShadow = false;
      this.roofExtras.add(cm);
    }
    if (tankSpots.length) {
      const tg = new THREE.CylinderGeometry(0.55, 0.62, 1.15, 14);
      tg.translate(0, 0.58, 0);
      const im = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), tankSpots.length);
      const lid = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12);
      lid.translate(0, 1.2, 0);
      const lids = new THREE.InstancedMesh(lid, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), tankSpots.length);
      const m = new THREE.Matrix4();
      tankSpots.forEach((t, q) => {
        im.setMatrixAt(q, m.makeTranslation(t.p.x, t.p.y, t.p.z));
        lids.setMatrixAt(q, m.makeTranslation(t.p.x, t.p.y, t.p.z));
        im.setColorAt(q, new THREE.Color(t.blue ? '#2f6fa8' : '#3a3e42'));
        lids.setColorAt(q, new THREE.Color(t.blue ? '#245a8a' : '#55595e'));
      });
      im.castShadow = true;
      this.roofExtras.add(im, lids);
    }
    if (rebar.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(rebar, 3));
      this.roofExtras.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#5a3b2a' })));
    }
    if (laundryLines.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(laundryLines, 3));
      this.roofExtras.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#d8d8d2' })));
    }
    this.buildingsGroup.add(this.roofExtras);
    this.syncRoofExtras();
  }

  private buildDrainsAndPipes(): void {
    this.disposeGroup(this.drainGroup);
    this.disposeGroup(this.pipeGroup);
    this.disposeGroup(this.gardenGroup);
    this.drainLeafMeshes = [];
    const c = this.c, sc = this.sc;
    const grate = new THREE.BoxGeometry(0.9, 0.05, 0.6);
    const gm = new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.5, metalness: 0.6 });
    const leafG = new THREE.CircleGeometry(0.16, 6);
    leafG.rotateX(-Math.PI / 2);
    const leafM = new THREE.MeshStandardMaterial({ color: '#7a5a2e', roughness: 1 });
    sc.drains.forEach((_d, di) => {
      const cd = c.drains[di];
      const k = cd.cell;
      const x = ((k % c.nx) + 0.5) * c.dx, y = (Math.floor(k / c.nx) + 0.5) * c.dx;
      const z = c.z[k];
      const m = new THREE.Mesh(grate, gm);
      this.w(x, y, z + 0.01, m.position);
      m.userData.drain = di;
      this.drainGroup.add(m);
      // Hojas y basura según el nivel de obstrucción
      const nLeaves = Math.round(cd.obstruction * 14);
      if (nLeaves > 0) {
        const im = new THREE.InstancedMesh(leafG, leafM, nLeaves);
        const r = prng(di + 99);
        const mm = new THREE.Matrix4();
        for (let q = 0; q < nLeaves; q++) {
          const p = this.w(x + (r() - 0.5) * 0.85, y + (r() - 0.5) * 0.6, z + 0.045 + q * 0.002);
          im.setMatrixAt(q, mm.makeRotationY(r() * 6).setPosition(p));
        }
        im.userData.drain = di;
        this.drainGroup.add(im);
        this.drainLeafMeshes.push(im);
      }
    });
    // Red de alcantarillado separada (calculada) y sección de la quebrada
    if (this.sewerView) {
      this.sewerView.dispose();
      this.sewerOver.clear();
      this.sewerView = null;
    }
    if (c.sewer || c.creek) {
      this.sewerView = new SewerView(sc, c, (x, y, z, out) => this.w(x, y, z, out), (x, y) => this.groundAt(x, y), !!c.sewer && c.sewer.erradas.length > 0);
      this.sewerView.setFilter(this.netFilter);
      this.pipeGroup.add(this.sewerView.under);
      this.sewerOver.add(this.sewerView.over);
    }
    // Creciente: puente, vehículos, material flotante, salpicadura y marcas de nivel en las fachadas
    if (this.floodView) {
      this.floodView.dispose();
      this.floodGroup.clear();
      this.floodView = null;
    }
    if (c.creek || c.exposed.length) {
      this.floodView = new FloodView(sc, c, (x, y, z, out) => this.w(x, y, z, out));
      this.floodGroup.add(this.floodView.group);
    }
    // Tuberías esquemáticas de escenarios sin red (solo dibujo; visibles en la vista bajo la calle)
    for (const p of sc.pipes) {
      const path = new THREE.CurvePath<THREE.Vector3>();
      const pts = p.path.map(([x, y]) => this.w(x, y, this.groundAt(x, y) - 1.1));
      for (let q = 0; q < pts.length - 1; q++) path.add(new THREE.LineCurve3(pts[q], pts[q + 1]));
      const tube = new THREE.TubeGeometry(path, Math.max(8, pts.length * 12), 0.4, 10, false);
      const tm = new THREE.Mesh(tube, this.pipeMat);
      tm.renderOrder = 8;
      this.pipeGroup.add(tm);
      // bajante del sumidero a la tubería
      const [x0, y0] = p.path[0];
      const top = this.w(x0, y0, this.groundAt(x0, y0));
      const vg = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 8);
      const vm = new THREE.Mesh(vg, this.pipeMat);
      vm.renderOrder = 8;
      vm.position.set(top.x, top.y - 0.55, top.z);
      this.pipeGroup.add(vm);
    }
    this.pipeGroup.visible = this.cut;
    // Borde de los jardines de lluvia activos
    const garden = new Set<number>();
    for (let k = 0; k < c.garden.length; k++) if (c.garden[k] >= 0) garden.add(k);
    if (garden.size) {
      const pts: number[] = [];
      for (const k of garden) {
        const i = k % c.nx, j = Math.floor(k / c.nx);
        const nb = [
          [i + 1, j, (i + 1) * c.dx, (j + 1) * c.dx, (i + 1) * c.dx, j * c.dx],
          [i - 1, j, i * c.dx, j * c.dx, i * c.dx, (j + 1) * c.dx],
          [i, j + 1, i * c.dx, (j + 1) * c.dx, (i + 1) * c.dx, (j + 1) * c.dx],
          [i, j - 1, (i + 1) * c.dx, j * c.dx, i * c.dx, j * c.dx],
        ];
        for (const [ii, jj, ax, ay, bx, by] of nb) {
          if (ii < 0 || jj < 0 || ii >= c.nx || jj >= c.ny || garden.has(jj * c.nx + ii)) continue;
          const z = c.z[k] + 0.17;
          const p = this.w(ax, ay, z), q = this.w(bx, by, z);
          pts.push(p.x, p.y, p.z, q.x, q.y, q.z);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.gardenGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#2f6b2a' })));
      // Plantas del jardín
      const r = prng(41);
      const plants = [...garden].filter(() => r() < 0.35);
      const pg = new THREE.ConeGeometry(0.28, 0.7, 6);
      pg.translate(0, 0.35, 0);
      const im = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: '#3f7f34', roughness: 0.9 }), Math.max(1, plants.length));
      const mm = new THREE.Matrix4();
      plants.forEach((k, q) => {
        const x = ((k % c.nx) + 0.2 + r() * 0.6) * c.dx, y = (Math.floor(k / c.nx) + 0.2 + r() * 0.6) * c.dx;
        im.setMatrixAt(q, mm.makeTranslation(this.w(x, y, c.z[k])));
      });
      im.count = plants.length;
      this.gardenGroup.add(im);
    }
  }

  private buildProbes(): void {
    this.disposeGroup(this.probeGroup);
    const pg = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6);
    pg.translate(0, 1.1, 0);
    const hg = new THREE.SphereGeometry(0.24, 12, 8);
    hg.translate(0, 2.3, 0);
    const m = new THREE.MeshStandardMaterial({ color: '#17324d', roughness: 0.5 });
    const mh = new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.4, emissive: new THREE.Color('#5a4500') });
    for (const p of this.visibleProbes()) {
      const k = p.cell;
      const x = ((k % this.c.nx) + 0.5) * this.c.dx, y = (Math.floor(k / this.c.nx) + 0.5) * this.c.dx;
      const at = this.w(x, y, this.c.z[k]);
      const a = new THREE.Mesh(pg, m), b = new THREE.Mesh(hg, mh);
      a.position.copy(at);
      b.position.copy(at);
      this.probeGroup.add(a, b);
    }
  }

  /** Las sondas de jardín solo se muestran si hay un jardín construido. */
  private visibleProbes(): Compiled['probes'] {
    const hasGarden = this.c.garden.some((g) => g >= 0);
    return this.c.probes.filter((p) => hasGarden || !p.id.startsWith('jardin'));
  }

  private buildDecor(): void {
    const d = this.sc.decor;
    if (!d) return;
    const white = new THREE.MeshBasicMaterial({ color: '#f2f2ee' });
    const mk: THREE.BufferGeometry[] = [];
    const strip = (ax: number, ay: number, bx: number, by: number, w: number) => {
      const L = Math.hypot(bx - ax, by - ay);
      const g = new THREE.PlaneGeometry(L, w);
      g.rotateX(-Math.PI / 2);
      const ang = Math.atan2(by - ay, bx - ax);
      g.rotateY(ang);
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const p = this.w(mx, my, this.groundAt(mx, my) + 0.012);
      g.translate(p.x, p.y, p.z);
      mk.push(g);
    };
    for (const m of d.markings) {
      const [ax, ay] = m.a, [bx, by] = m.b;
      const L = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / L, uy = (by - ay) / L;
      if (m.kind === 'dash') for (let s = 0; s < L - 1.5; s += 6) strip(ax + ux * s, ay + uy * s, ax + ux * (s + 3), ay + uy * (s + 3), m.width);
      else if (m.kind === 'zebra') for (let s = 0.4; s < L; s += 1.0) {
        const cx = ax + ux * s, cy = ay + uy * s;
        strip(cx - uy * (m.width / 2), cy + ux * (m.width / 2), cx + uy * (m.width / 2), cy - ux * (m.width / 2), 0.45);
      }
      else strip(ax, ay, bx, by, m.width);
    }
    for (const g of mk) {
      const m = new THREE.Mesh(g, white);
      m.userData.keepInCut = true; // las marcas viales orientan también en la vista bajo la calle
      this.decorGroup.add(m);
    }
    // Quebrada cubierta o no visible en el terreno: su eje de referencia, a trazos azules sobre el suelo y los
    // techos (solo dibujo; no se simula)
    if (d.creekRef && d.creekRef.length > 1) {
      const blue = new THREE.MeshBasicMaterial({ color: '#2f8fd8', transparent: true, opacity: 0.85, depthWrite: false });
      const ref: THREE.BufferGeometry[] = [];
      const pts = d.creekRef;
      let acc = 0;
      for (let q = 1; q < pts.length; q++) {
        const [ax, ay] = pts[q - 1], [bx, by] = pts[q];
        const L = Math.hypot(bx - ax, by - ay);
        if (L < 1e-6) continue;
        const ux = (bx - ax) / L, uy = (by - ay) / L;
        for (let t = acc; t < L; t += 3) {
          const t1 = Math.min(L, t + 1.8);
          const mx = ax + ux * (t + t1) / 2, my = ay + uy * (t + t1) / 2;
          const g = new THREE.PlaneGeometry(t1 - t, 0.6);
          g.rotateX(-Math.PI / 2);
          g.rotateY(Math.atan2(by - ay, bx - ax));
          // sobre el techo si el eje pasa bajo una construcción
          const top = Math.max(this.groundAt(mx, my), this.roofAt(mx, my));
          const p = this.w(mx, my, top + 0.05);
          g.translate(p.x, p.y, p.z);
          ref.push(g);
        }
        acc = ((acc - L) % 3 + 3) % 3;
      }
      for (const g of ref) {
        const m = new THREE.Mesh(g, blue);
        m.renderOrder = 3;
        this.decorGroup.add(m);
      }
    }
    // Árboles: copas de varios lóbulos con tronco; algunos guayacanes florecidos (amarillos y rosados)
    const rnd = prng(this.sc.seed + 1);
    const trunkG = new THREE.CylinderGeometry(0.12, 0.2, 1, 6);
    trunkG.translate(0, 0.5, 0);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 1 }), d.trees.length);
    const crowns = new THREE.InstancedMesh(crownGeometry(1, this.sc.seed), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), d.trees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), col = new THREE.Color();
    d.trees.forEach(([x, y], n) => {
      const sc = 0.75 + rnd() * 0.6;
      const p = this.w(x, y, this.groundAt(x, y));
      q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0));
      trunks.setMatrixAt(n, m4.compose(p, q, s.set(sc, 2.6 * sc, sc)));
      const cr = 1.7 * sc;
      crowns.setMatrixAt(n, m4.compose(p.clone().add(new THREE.Vector3(0, 2.4 * sc + cr * 0.75, 0)), q, s.set(cr, cr * (0.85 + rnd() * 0.25), cr)));
      const r = rnd();
      if (r < 0.1) col.set('#e3b52a');
      else if (r < 0.16) col.set('#dc8bb0');
      else col.setHSL(0.27 + rnd() * 0.07, 0.42 + rnd() * 0.2, 0.28 + rnd() * 0.1);
      crowns.setColorAt(n, col);
    });
    trunks.castShadow = crowns.castShadow = true;
    this.decorGroup.add(trunks, crowns);
    this.treeInst = { trunks, crowns, xy: d.trees.map(([x, y]) => [x, y] as [number, number]), mT: Float32Array.from(trunks.instanceMatrix.array as Float32Array), mC: Float32Array.from(crowns.instanceMatrix.array as Float32Array) };
    // Postes de concreto con cruceta, luminaria y cableado aéreo (rasgo muy visible de las calles de
    // Medellín). Son decorativos: no son la red eléctrica ni el alumbrado reales.
    const c = this.c;
    const cellCover = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) return -1;
      return c.cover[Math.floor(y / c.dx) * c.nx + Math.floor(x / c.dx)];
    };
    const asphalt = COVER_LIST.indexOf('asfalto');
    const poleM = new THREE.MeshStandardMaterial({ color: '#b3b0a8', roughness: 0.9 });
    const poleG = new THREE.CylinderGeometry(0.13, 0.2, 10, 6);
    poleG.translate(0, 5, 0);
    const armG = new THREE.BoxGeometry(0.08, 0.08, 1.6);
    armG.translate(0, 0, 0.8);
    const headG = new THREE.BoxGeometry(0.32, 0.12, 0.6);
    const crossG = new THREE.BoxGeometry(1.7, 0.12, 0.12);
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#f4f1e8', emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.15, roughness: 0.5 });
    const poles = new THREE.InstancedMesh(poleG, poleM, d.lamps.length);
    const arms = new THREE.InstancedMesh(armG, poleM, d.lamps.length);
    const heads = new THREE.InstancedMesh(headG, this.lampMat, d.lamps.length);
    const crosses = new THREE.InstancedMesh(crossG, poleM, d.lamps.length);
    const tops: THREE.Vector3[] = [];
    const headPos: THREE.Vector3[] = [];
    const wires: number[] = [];
    d.lamps.forEach(([x, y], n) => {
      const g0 = this.groundAt(x, y);
      // el brazo de la luminaria apunta hacia la calzada más cercana
      let best = 0, bd = Infinity;
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        for (let r = 1; r < 9; r += 1) if (cellCover(x + Math.cos(ang) * r, y + Math.sin(ang) * r) === asphalt && r < bd) {
          bd = r;
          best = ang;
        }
      }
      const base = this.w(x, y, g0);
      poles.setMatrixAt(n, m4.makeTranslation(base.x, base.y, base.z));
      const yaw = Math.atan2(Math.cos(best), -Math.sin(best)); // de (dx, dy) del modelo al mundo (x, −z)
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      arms.setMatrixAt(n, m4.compose(new THREE.Vector3(base.x, base.y + 8.2, base.z), q, s.set(1, 1, 1)));
      const hp = new THREE.Vector3(Math.cos(best) * 1.6, 8.12, -Math.sin(best) * 1.6).add(base);
      heads.setMatrixAt(n, m4.compose(hp, q, s.set(1, 1, 1)));
      headPos.push(hp.clone());
      crosses.setMatrixAt(n, m4.compose(new THREE.Vector3(base.x, base.y + 9.4, base.z), q, s.set(1, 1, 1)));
      tops.push(new THREE.Vector3(base.x, base.y + 9.5, base.z));
    });
    this.decorGroup.add(poles, arms, heads, crosses);
    // Con la tormenta las luminarias encienden: halo alrededor de cada una y su luz sobre el suelo mojado.
    // Es ambientación (la intensidad sigue a la lluvia, no a un alumbrado real) y solo en la vista realista.
    if (headPos.length) {
      if (!this.glowTex) {
        this.glowTex = glowTexture();
        this.textures.push(this.glowTex);
      }
      this.lampGlowMat = new THREE.PointsMaterial({ map: this.glowTex, color: '#ffd59a', size: 11, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const glow = new THREE.Points(new THREE.BufferGeometry().setFromPoints(headPos.map((p) => p.clone().setY(p.y - 0.2))), this.lampGlowMat);
      glow.renderOrder = 6;
      this.lampPoolMat = new THREE.MeshBasicMaterial({ map: this.glowTex, color: '#ffcf8c', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const pools = headPos.map((hp) => {
        // disco de 14 m que sigue el relieve (en ladera no queda flotando ni enterrado)
        const g = new THREE.PlaneGeometry(14, 14, 6, 6);
        g.rotateX(-Math.PI / 2);
        g.translate(hp.x, 0, hp.z);
        const pa = g.getAttribute('position') as THREE.BufferAttribute;
        for (let v = 0; v < pa.count; v++) {
          const mx = pa.getX(v) + this.W / 2, my = this.H / 2 - pa.getZ(v);
          pa.setY(v, this.w(mx, my, this.groundAt(Math.min(this.W - 0.01, Math.max(0, mx)), Math.min(this.H - 0.01, Math.max(0, my))) + 0.04).y);
        }
        return g;
      });
      const pool = new THREE.Mesh(mergeGeometries(pools), this.lampPoolMat);
      pools.forEach((g) => g.dispose());
      pool.renderOrder = 2;
      glow.visible = pool.visible = false;
      glow.userData.lampFx = pool.userData.lampFx = true;
      this.decorGroup.add(glow, pool);
    }
    // cables entre postes cercanos (con comba) y hacia afuera del sector, por las calles del barrio
    const sag = (a: THREE.Vector3, b: THREE.Vector3, dy: number, off: number) => {
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const ox = (-(b.z - a.z) / L) * off, oz = ((b.x - a.x) / L) * off;
      let prev: THREE.Vector3 | null = null;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const pt = a.clone().lerp(b, t);
        pt.x += ox;
        pt.z += oz;
        pt.y += dy - Math.sin(Math.PI * t) * Math.min(1.6, L * 0.035);
        if (prev) wires.push(prev.x, prev.y, prev.z, pt.x, pt.y, pt.z);
        prev = pt;
      }
    };
    const linked = new Set<string>();
    tops.forEach((a, i) => {
      const near = tops.map((b, j) => ({ j, d: a.distanceTo(b) })).filter((o) => o.j !== i && o.d < 42).sort((u, v) => u.d - v.d).slice(0, 2);
      for (const { j } of near) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (linked.has(key)) continue;
        linked.add(key);
        for (const [dy, off] of [[0, -0.7], [0, 0.7], [-0.6, 0], [-1.3, 0.3]]) sag(a, tops[j], dy, off);
      }
      // hacia afuera del sector: el cable sigue por la calle hasta el próximo poste del barrio
      const [mx, my] = [a.x + this.W / 2, this.H / 2 - a.z];
      const dists: [number, number, number][] = [[mx, -1, 0], [this.W - mx, 1, 0], [my, 0, -1], [this.H - my, 0, 1]];
      const [dm, ex, ey] = dists.sort((u, v) => u[0] - v[0])[0];
      if (dm < 16) {
        const out = new THREE.Vector3(a.x + ex * (dm + 22), a.y + (this.backdrop ? 0 : 0), a.z - ey * (dm + 22));
        const gOut = this.backdrop ? this.backdrop.groundY(out.x, out.z) + 9.5 : a.y;
        out.y = gOut;
        for (const [dy, off] of [[0, -0.7], [0, 0.7], [-0.6, 0]]) sag(a, out, dy, off);
      }
    });
    // acometidas: de cada poste a las fachadas más cercanas
    for (const a of tops) {
      let k = 0;
      for (const bs of this.sc.buildings) {
        if (k >= 3) break;
        const cx = bs.polygon.reduce((s2, p) => s2 + p[0], 0) / bs.polygon.length, cy = bs.polygon.reduce((s2, p) => s2 + p[1], 0) / bs.polygon.length;
        // punto de la fachada más cercano al poste, a ≈ 5 m de altura
        let bx = cx, by = cy, bd = Infinity;
        for (let e = 0; e < bs.polygon.length; e++) {
          const [x0, y0] = bs.polygon[e], [x1, y1] = bs.polygon[(e + 1) % bs.polygon.length];
          const px = a.x + this.W / 2, py = this.H / 2 - a.z;
          const vx = x1 - x0, vy = y1 - y0, L2 = vx * vx + vy * vy || 1;
          const t = Math.max(0, Math.min(1, ((px - x0) * vx + (py - y0) * vy) / L2));
          const qx = x0 + vx * t, qy = y0 + vy * t, dd = Math.hypot(qx - px, qy - py);
          if (dd < bd) {
            bd = dd;
            bx = qx;
            by = qy;
          }
        }
        if (bd > 14) continue;
        const end = this.w(bx, by, this.groundAt(bx, by) + Math.min(bs.heightM - 0.5, 5.2));
        sag(a.clone().add(new THREE.Vector3(0, -1.6, 0)), end, 0, 0);
        k++;
      }
    }
    if (wires.length) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
      this.decorGroup.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#202224' })));
    }
    // Motos parqueadas en el andén, frente a las casas (lejos de sondas y sumideros)
    {
      const anden = COVER_LIST.indexOf('anden');
      const avoid: [number, number][] = [...c.probes.map((p) => [((p.cell % c.nx) + 0.5) * c.dx, (Math.floor(p.cell / c.nx) + 0.5) * c.dx] as [number, number]), ...c.drains.map((dd) => [((dd.cell % c.nx) + 0.5) * c.dx, (Math.floor(dd.cell / c.nx) + 0.5) * c.dx] as [number, number])];
      const spots: { x: number; y: number; yaw: number }[] = [];
      const rm = prng(this.sc.seed + 9);
      for (const bs of this.sc.buildings) {
        if (bs.style === 'torre') continue;
        for (let e = 0; e < bs.polygon.length; e++) {
          const [x0, y0] = bs.polygon[e], [x1, y1] = bs.polygon[(e + 1) % bs.polygon.length];
          const L = Math.hypot(x1 - x0, y1 - y0);
          if (L < 4) continue;
          for (const side of [1, -1]) {
            const nx = (side * (y1 - y0)) / L, ny = (-side * (x1 - x0)) / L;
            for (let t = 1.5; t < L - 1; t += 0.9) {
              if (rm() > 0.16) continue;
              const x = x0 + ((x1 - x0) * t) / L + nx * 1.6, y = y0 + ((y1 - y0) * t) / L + ny * 1.6;
              if (cellCover(x, y) !== anden || cellCover(x + nx * 1.2, y + ny * 1.2) !== anden) continue;
              if (avoid.some(([ax, ay]) => Math.hypot(ax - x, ay - y) < 5)) continue;
              if (spots.some((o) => Math.hypot(o.x - x, o.y - y) < 0.8)) continue;
              spots.push({ x, y, yaw: Math.atan2(nx, ny) + (rm() - 0.5) * 0.3 });
            }
          }
        }
      }
      if (spots.length) {
        const body = mergeGeometries([
          new THREE.BoxGeometry(0.3, 0.42, 1.25).translate(0, 0.62, 0),
          new THREE.BoxGeometry(0.28, 0.12, 0.6).translate(0, 0.88, -0.2),
          new THREE.BoxGeometry(0.7, 0.05, 0.05).translate(0, 1.05, 0.55),
          new THREE.BoxGeometry(0.06, 0.45, 0.06).translate(0, 0.82, 0.55),
        ]) as THREE.BufferGeometry;
        const wheel = mergeGeometries([new THREE.CylinderGeometry(0.29, 0.29, 0.1, 10).rotateZ(Math.PI / 2).translate(0, 0.29, 0.58), new THREE.CylinderGeometry(0.29, 0.29, 0.1, 10).rotateZ(Math.PI / 2).translate(0, 0.29, -0.55)]) as THREE.BufferGeometry;
        const bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.3 }), spots.length);
        const wheels = new THREE.InstancedMesh(wheel, new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.8 }), spots.length);
        const motoCols = ['#1d1f22', '#b3262a', '#1f4f8f', '#e8e8e4', '#1d1f22', '#2f6e3f'];
        spots.forEach((o, n) => {
          const pp = this.w(o.x, o.y, this.groundAt(o.x, o.y));
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.yaw);
          m4.compose(pp, q, s.set(1, 1, 1));
          bodies.setMatrixAt(n, m4);
          wheels.setMatrixAt(n, m4);
          bodies.setColorAt(n, new THREE.Color(motoCols[Math.floor(rm() * motoCols.length)]));
        });
        bodies.castShadow = wheels.castShadow = true;
        this.decorGroup.add(bodies, wheels);
      }
    }
    // Escaleras peatonales
    for (const st of d.stairs ?? []) {
      const [ax, ay] = st.a, [bx, by] = st.b;
      const n = Math.max(4, Math.round(Math.hypot(bx - ax, by - ay) / 0.6));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        const g = new THREE.BoxGeometry(st.width, 0.16, 0.3);
        const p = this.w(x, y, this.groundAt(x, y) + 0.08);
        g.translate(p.x, p.y, p.z);
        this.decorGroup.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#b8b0a2' })));
      }
      // pasamanos pintados a lado y lado (como en las escalas de los barrios de ladera)
      const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
      const rail: number[] = [];
      for (const sd of [-1, 1]) {
        const ox = -uy * (st.width / 2 + 0.1) * sd, oy = ux * (st.width / 2 + 0.1) * sd;
        let prev: THREE.Vector3 | null = null;
        for (let k = 0; k <= n; k++) {
          const x = ax + (bx - ax) * (k / n) + ox, y = ay + (by - ay) * (k / n) + oy;
          const top = this.w(x, y, this.groundAt(x, y) + 0.95);
          if (prev) rail.push(prev.x, prev.y, prev.z, top.x, top.y, top.z);
          if (k % 3 === 0) {
            const foot = this.w(x, y, this.groundAt(x, y));
            rail.push(foot.x, foot.y, foot.z, top.x, top.y, top.z);
          }
          prev = top;
        }
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rail, 3));
      this.decorGroup.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#d9a917' })));
    }
    // Cable aéreo decorativo con cabinas
    if (d.cable) {
      const tg = new THREE.BoxGeometry(0.8, 26, 0.8);
      tg.translate(0, 13, 0);
      const tm = new THREE.MeshStandardMaterial({ color: '#d7dbe0', metalness: 0.4, roughness: 0.5 });
      const tops: THREE.Vector3[] = [];
      for (const [x, y] of d.cable.towers) {
        const base = this.w(x, y, this.groundAt(x, y));
        const t = new THREE.Mesh(tg, tm);
        t.position.copy(base);
        t.castShadow = true;
        this.decorGroup.add(t);
        tops.push(base.clone().add(new THREE.Vector3(0, 25.5, 0)));
      }
      const pts: THREE.Vector3[] = [];
      for (let q2 = 0; q2 < tops.length - 1; q2++) {
        for (let k = 0; k <= 30; k++) {
          const t = k / 30;
          const p = tops[q2].clone().lerp(tops[q2 + 1], t);
          p.y -= Math.sin(t * Math.PI) * 2.2;
          pts.push(p);
        }
      }
      this.cablePath = pts;
      const lg = new THREE.BufferGeometry().setFromPoints(pts);
      this.decorGroup.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#2d3236' })));
      const cg = new THREE.BoxGeometry(1.8, 1.6, 1.6);
      cg.translate(0, -1.2, 0);
      const cm = new THREE.MeshStandardMaterial({ color: '#e9eef2', roughness: 0.4, emissive: new THREE.Color('#1a2a3a'), emissiveIntensity: 0.2 });
      for (let k = 0; k < 3; k++) {
        const cab = new THREE.Mesh(cg, cm);
        cab.userData.phase = k / 3;
        this.cabins.push(cab);
        this.decorGroup.add(cab);
      }
    }
  }

  /**
   * Ajuste del sector para el entorno: plano de su pendiente (mínimos cuadrados sobre las celdas sin
   * edificio), altura exacta de su borde y color de la superficie en el borde. El nivel base del entorno
   * queda un metro por debajo de la esquina más baja del plano.
   */
  private sectorFit(): { baseY: number; sector: SectorFit } {
    const c = this.c;
    const { nx, ny, dx } = c;
    const W = this.W, H = this.H;
    const S = [0, 0, 0, 0, 0, 0, 0, 0, 0], R = [0, 0, 0];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (c.solid[k]) continue;
      const v = [1, (i + 0.5) * dx - W / 2, H / 2 - (j + 0.5) * dx]; // mundo: x, z
      const y = c.zGround[k] - this.zRef;
      for (let p = 0; p < 3; p++) {
        R[p] += v[p] * y;
        for (let q = 0; q < 3; q++) S[p * 3 + q] += v[p] * v[q];
      }
    }
    const det = (m: number[]) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    const D = det(S) || 1;
    const [a, gx, gz] = [0, 1, 2].map((col) => {
      const m = [...S];
      for (let r = 0; r < 3; r++) m[r * 3 + col] = R[r];
      return det(m) / D;
    });
    let low = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) low = Math.min(low, a + gx * (sx * W) / 2 + gz * (sz * H) / 2);
    const coverRgb = COVER_LIST.map((id) => hexToRgb(COVERS[id].color));
    const walk: [number, number, number] = [0.6, 0.58, 0.55];
    // celda del borde (del sector compilado vigente: cambia si cambia la resolución)
    const edgeCell = (xw: number, zw: number) => {
      const cc = this.c;
      const x = Math.min(W, Math.max(0, xw + W / 2)), y = Math.min(H, Math.max(0, H / 2 - zw));
      const i = Math.min(cc.nx - 1, Math.floor(x / cc.dx)), j = Math.min(cc.ny - 1, Math.floor(y / cc.dx));
      return { x, y, i, j, k: j * cc.nx + i, d: cc.dx };
    };
    const scene3 = this;
    const sector: SectorFit = {
      hw: W / 2,
      hh: H / 2,
      plane: { a, gx, gz },
      get cell() {
        return scene3.c.dx;
      },
      edgeY: (xw, zw) => {
        const { x, y, i, j, k, d } = edgeCell(xw, zw);
        const cz = this.cornerZ;
        const fx = x / d - i, fy = y / d - j;
        // bilineal con las esquinas de la celda del borde (en el borde coincide con la arista dibujada)
        const z = (cz[k * 4] * (1 - fx) + cz[k * 4 + 1] * fx) * (1 - fy) + (cz[k * 4 + 3] * (1 - fx) + cz[k * 4 + 2] * fx) * fy;
        return z - this.zRef;
      },
      edgeRgb: (xw, zw) => {
        const { k } = edgeCell(xw, zw);
        if (this.c.solid[k]) return walk;
        const rgb = coverRgb[this.c.cover[k]];
        return [rgb[0] * 0.95, rgb[1] * 0.95, rgb[2] * 0.95];
      },
    };
    return { baseY: low - 1, sector };
  }

  private buildLabelAnchors(): void {
    this.labelItems = this.sc.labels.map((l) => ({ id: `l-${l.id}`, text: l.text, priority: l.priority, kind: 'lugar' as const, at: this.w(l.at[0], l.at[1], this.groundAt(l.at[0], l.at[1]) + 1.2) }));
    for (const p of this.visibleProbes()) {
      const x = ((p.cell % this.c.nx) + 0.5) * this.c.dx, y = (Math.floor(p.cell / this.c.nx) + 0.5) * this.c.dx;
      this.labelItems.push({ id: `p-${p.id}`, text: p.name, priority: 6, kind: 'sonda', sub: 'seco', at: this.w(x, y, this.c.z[p.cell] + 2.7) });
    }
    // lugares lejanos para orientarse (río, metro, metrocables, cerros, Centro): prioridad baja
    for (const l of this.backdrop?.landmarks ?? []) this.labelItems.push({ id: `e-${l.id}`, text: l.text, priority: l.priority - 1, kind: 'lejano', at: l.at });
    if (this.sc.decor?.cable) {
      const [x, y] = this.sc.decor.cable.towers[1];
      this.labelItems.push({ id: 'cable', text: this.sc.decor.cable.label, priority: 0, kind: 'aviso', at: this.w(x, y, this.groundAt(x, y) + 27) });
    }
    this.cutOnly.clear();
    for (const a of this.sewerView?.anchors ?? []) {
      this.labelItems.push({ id: a.id, text: a.text, sub: a.sub, priority: a.priority, kind: a.kind, color: a.color, at: a.at });
      if (a.cutOnly) this.cutOnly.add(a.id);
    }
    this.syncLabels();
  }

  private syncLabels(): void {
    // bajo la calle solo quedan los rótulos de las redes (filtrados por la red que se ve) y las calles
    const sewerIds = new Set((this.sewerView?.visibleAnchors(this.cut) ?? []).map((a) => a.id));
    const isSewer = (id: string) => id.startsWith('sw-') || id === 'creek-sec';
    const items: LabelItem[] = this.labelItems
      .filter((l) => (this.cut || l.id !== 'pipes') && (!isSewer(l.id) || sewerIds.has(l.id)))
      .filter((l) => !this.cut || isSewer(l.id) || l.id === 'pipes' || (l.kind === 'lugar' && l.priority >= 2))
      .map(({ at: _at, ...rest }) => rest);
    if (this.cut && !this.c.sewer && this.sc.pipes.length) items.push({ id: 'pipes', text: 'Tubería esquemática: no se calcula su hidráulica', priority: 5, kind: 'aviso' });
    if (this.pinned) items.push({ id: 'pin', text: this.pinned.text, priority: 9, kind: 'sonda' });
    for (const l of this.tracerFx.labels) items.push({ id: l.id, text: l.text, sub: l.sub, priority: 7, kind: 'gotas', color: l.color });
    if (!this.cut) for (const l of this.floodView?.labels ?? []) items.push({ id: l.id, text: l.text, sub: l.sub, priority: l.priority, kind: l.kind, color: l.color });
    this.labels.set(items);
  }

  setPinned(p: { id: string; at: Pt; text: string } | null): void {
    this.pinned = p;
    this.syncLabels();
  }

  // ------------------------------------------------------------ vistas
  setView(v: ViewMode): void {
    this.view = v;
    this.lastResultsT = -1;
    this.applyView();
  }

  /**
   * Vista bajo la calle: el terreno y los edificios se vuelven transparentes y se ocultan árboles, postes,
   * cables, vehículos y la capa de la creciente, para que las dos redes se lean sin estorbos.
   */
  setCut(on: boolean): void {
    this.cut = on;
    this.pipeGroup.visible = on;
    this.syncRoofExtras();
    for (const o of this.decorGroup.children) o.visible = !on || o.userData.keepInCut === true;
    this.floodGroup.visible = !on;
    this.probeGroup.visible = !on;
    this.fx.setCut(on);
    for (const m of this.buildingMats) {
      m.transparent = on;
      (m as THREE.MeshStandardMaterial).opacity = on ? 0.1 : 1;
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
    this.terrainMat.transparent = on;
    this.terrainMat.opacity = on ? 0.3 : 1;
    this.terrainMat.depthWrite = !on;
    this.terrainMat.needsUpdate = true;
    this.syncLabels();
  }

  /** Qué red se ve bajo la calle (y sus rótulos). */
  setNetFilter(f: NetFilter): void {
    this.netFilter = f;
    this.sewerView?.setFilter(f);
    this.syncLabels();
  }

  /**
   * Corte de árboles para una vista: se ocultan los que quedan a menos de `r` metros del tramo entre la cámara y
   * el punto mirado (en planta), para que no tapen la sección de la quebrada. `null` los vuelve a mostrar.
   */
  setTreeCutaway(seg: [[number, number], [number, number]] | null, r = 7): void {
    const ti = this.treeInst;
    if (!ti) return;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0).elements;
    const aT = ti.trunks.instanceMatrix.array as Float32Array, aC = ti.crowns.instanceMatrix.array as Float32Array;
    aT.set(ti.mT);
    aC.set(ti.mC);
    let hidden = 0;
    if (seg) {
      const [[ax, ay], [bx, by]] = seg;
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
      ti.xy.forEach(([x, y], n) => {
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
        if (Math.hypot(ax + t * vx - x, ay + t * vy - y) < r) {
          aT.set(zero, n * 16);
          aC.set(zero, n * 16);
          hidden++;
        }
      });
    }
    ti.trunks.instanceMatrix.needsUpdate = true;
    ti.crowns.instanceMatrix.needsUpdate = true;
    this.treesCut = hidden;
  }
  /** Árboles ocultos por el corte de la vista actual. */
  treesCut = 0;

  /** Hay ortofoto del sector (sectores reales). */
  get hasOrtho(): boolean {
    return !!this.sc.imagery;
  }
  /** Ortofoto activa (preferencia de la persona). */
  get orthoEnabled(): boolean {
    return this.orthoOn;
  }
  setOrtho(on: boolean): void {
    this.orthoOn = on;
    this.applyView();
  }

  /** Carga la ortofoto la primera vez que se necesita (imagen incrustada en el escenario; sin red). */
  private ensureOrtho(): THREE.Texture | null {
    const im = this.sc.imagery;
    if (!im) return null;
    if (!this.orthoTex) {
      const tex = new THREE.TextureLoader().load(im.href, () => {
        this.orthoU.uOrtho.value = tex;
        if (this.terrain) this.applyView();
        this.envPending = Math.max(this.envPending, 1);
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      this.orthoTex = tex;
      this.textures.push(tex);
      this.orthoU.uOrthoBox.value.set(im.x0, im.y0, im.x1, im.y1);
    }
    return this.orthoTex;
  }

  /** Accesorios inventados de los techos (tanques, ropa, rejas): ocultos bajo la calle y sobre la ortofoto. */
  private syncRoofExtras(): void {
    this.roofExtras.visible = !this.cut && this.orthoU.uOrthoOn.value < 0.5;
  }

  private applyView(): void {
    // se activa cuando la imagen ya está cargada (antes, el terreno conserva sus colores)
    const ortho = this.view === 'realista' && this.orthoOn && this.ensureOrtho() !== null && this.orthoU.uOrtho.value !== null;
    this.orthoU.uOrthoOn.value = ortho ? 1 : 0;
    this.syncRoofExtras();
    const colAttr = this.terrain.geometry.getAttribute('color') as THREE.BufferAttribute;
    if (this.view === 'materiales') {
      (colAttr.array as Float32Array).set(this.terrainColors.mat);
      this.terrainUniforms.uPat.value = 1;
    } else {
      (colAttr.array as Float32Array).set(this.terrainColors.real);
      this.terrainUniforms.uPat.value = 0;
    }
    colAttr.needsUpdate = true;
    this.water.visible = true;
    this.lastWaterT = -1;
  }

  setRain(mmh: number): void {
    this.rainMmh = mmh;
  }

  // ------------------------------------------------------------ actualización por cuadro
  update(sim: CitySim, tracers: TracerSet | null, dtReal: number): void {
    this.time += dtReal;
    // Tormenta: lluvia, cielo, mojado y efectos ligados al cálculo
    this.fx.update(sim, this.camera, this.container.clientHeight || 600, dtReal, { mmh: this.rainMmh, flowing: sim.t > 0 && !sim.finished, view: VIEW_CODE[this.view], amplify: this.amplify });
    const storm = this.fx.stormLevel;
    // Los reflejos se vuelven a capturar cuando el cielo cambió mucho y ya se asentó (una vez al
    // empezar la tormenta y otra al terminar): el agua y el pavimento espejan el cielo gris, no el soleado.
    if (this.sceneEnv && this.envPending === 0 && Math.abs(storm - this.envStorm) > 0.2 && Math.abs(storm - this.prevStorm) < 0.0015) this.envPending = 1;
    this.prevStorm = storm;
    const bg = this.scene.background as THREE.Color;
    this.fx.horizon(bg);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(bg);
    // Bruma del valle. Con lluvia fuerte la visibilidad cae a un kilómetro o poco más, pero la niebla
    // empieza justo antes del punto que se mira: el sector (y el cálculo) queda nítido y lo de atrás se pierde.
    const camD = this.camera.position.distanceTo(this.controls.target);
    const nearS = Math.max(60, camD * 0.95);
    fog.near = 700 + (nearS - 700) * storm;
    fog.far = 17000 + (nearS + 1150 - 17000) * Math.pow(storm, 0.8);
    this.backdrop?.update(this.reducedMotion ? 0 : dtReal, storm, this.camera.position);
    // Detalle del entorno según lo que aguanta el equipo: si cada cuadro tarda mucho (equipos sin
    // tarjeta gráfica), se ocultan los volúmenes lejanos y las nubes; el relieve sigue mostrando la ciudad.
    const now = performance.now();
    const wall = this.lastNow ? (now - this.lastNow) / 1000 : 0;
    this.lastNow = now;
    if (this.backdrop && wall > 0 && wall < 5 && dtReal > 0) {
      this.frameEma = this.frameEma ? this.frameEma * 0.85 + wall * 0.15 : wall;
      const d = this.backdrop.detail;
      const want = d === 2 ? this.frameEma > 0.2 : this.frameEma < 0.06;
      this.lodClock = want ? this.lodClock + wall : 0;
      if (want && this.lodClock > (d === 2 ? 3 : 8)) {
        this.backdrop.setDetail(d === 2 ? 1 : 2);
        this.lodClock = 0;
      }
    }
    this.sun.intensity = 2.1 * (1 - storm * 0.8);
    if (this.lampMat) this.lampMat.emissiveIntensity = 0.15 + storm * 0.9;
    if (this.lampGlowMat && this.lampPoolMat) {
      const lit = this.view === 'realista' ? Math.max(0, storm - 0.2) / 0.8 : 0;
      this.lampGlowMat.opacity = 0.55 * lit;
      this.lampPoolMat.opacity = 0.3 * lit * (0.4 + 0.6 * this.fx.u.uWet.value);
      for (const o of this.decorGroup.children) if (o.userData.lampFx) o.visible = lit > 0.01;
    }
    this.hemi.intensity = 1.1 * (1 - storm * 0.28);
    this.hemi.color.set('#e8f2ff').lerp(new THREE.Color('#a9b6c3'), storm);
    // fachadas y techos se oscurecen al mojarse (lo hacen sus sombreadores con el mojado de la lluvia);
    // la luz cae con la tormenta
    const wet = this.fx.u.uWet.value;
    this.facadeU.uWetF.value = wet;
    this.facadeU.uLit.value = Math.max(0, storm - 0.25) / 0.75;
    for (let i = 1; i < 4 && i < this.buildingMats.length; i++) (this.buildingMats[i] as THREE.MeshStandardMaterial).color.setScalar(1 - 0.22 * wet);
    const roofM = this.buildingMats[3] as THREE.MeshStandardMaterial | undefined;
    if (roofM) roofM.roughness = 0.95 - 0.5 * wet;
    // reflejos del entorno capturado: el agua natural espeja calles y cielo; el pavimento mojado también
    if (this.sceneEnv) {
      const natural = this.fx.u.uNat.value > 0.5 && this.view === 'realista';
      (this.water.material as THREE.MeshStandardMaterial).envMapIntensity = natural ? 1.6 - 0.6 * storm : 0.4;
      this.terrainMat.envMapIntensity = wet * (0.95 - 0.35 * storm);
      for (let i = 0; i < 4 && i < this.buildingMats.length; i++) (this.buildingMats[i] as THREE.MeshStandardMaterial).envMapIntensity = 0.25 + 0.5 * wet;
    }
    this.renderer.toneMappingExposure = 1.05 * (1 - 0.16 * storm);

    if (sim.t !== this.lastWaterT || this.amplify !== this.lastAmp) {
      this.updateWater(sim);
      this.lastWaterT = sim.t;
      this.lastAmp = this.amplify;
    }
    if (this.showArrows && (Math.abs(sim.t - this.lastArrowT) > 2 || this.lastArrowT < 0 || sim.t < this.lastArrowT)) {
      this.updateArrows(sim);
      this.lastArrowT = sim.t;
    }
    this.arrows.visible = this.showArrows && this.view !== 'resultados' && this.view !== 'peligro';
    if ((this.view === 'resultados' || this.view === 'peligro') && (this.lastResultsT < 0 || Math.abs(sim.t - this.lastResultsT) > 5)) {
      this.updateResults(sim);
      this.lastResultsT = sim.t;
    }
    const lk = this.tracerFx.labelsKey;
    this.tracerFx.update(
      tracers,
      this.reducedMotion ? 0 : dtReal,
      { w: this.container.clientWidth || 800, h: this.container.clientHeight || 600, fov: this.camera.fov, camDist: this.camera.position.distanceTo(this.controls.target) },
      (x, y) => this.surfaceAt(tracers?.sim ?? sim, x, y),
      (x, y, z, out) => this.w(x, y, z, out),
      (k) => [((k % this.c.nx) + 0.5) * this.c.dx, (Math.floor(k / this.c.nx) + 0.5) * this.c.dx],
    );
    if (this.tracerFx.labelsKey !== lk) this.syncLabels();
    this.sewerView?.update(sim, this.time, this.reducedMotion, this.cut);
    this.fx.u.uMud.value = sim.creekHydro ? Math.min(1, (sim.shared.creek?.sedimentCv ?? 0) / 0.3) : 0;
    if (this.floodView) {
      const fk = this.floodView.labelsKey;
      this.floodView.update(sim, this.time, this.reducedMotion ? 0 : dtReal, this.reducedMotion);
      if (this.floodView.labelsKey !== fk) this.syncLabels();
      else for (const l of this.floodView.labels) this.labels.setSub(l.id, l.sub ?? '');
    }
    let flow = 0;
    if (sim.lastDt > 0) for (let q = 0; q < sim.lastDrain.length; q++) flow += sim.lastDrain[q] / sim.lastDt;
    // brillo proporcional al caudal captado (calculado), tenue para no confundirlo con agua en superficie
    this.pipeMat.emissiveIntensity = Math.min(0.9, flow * 12);
    // Cabinas del cable (decorativas)
    if (this.cablePath.length > 1 && !this.reducedMotion) {
      for (const cab of this.cabins) {
        const t = (cab.userData.phase + this.time * 0.01) % 1;
        const f = t * (this.cablePath.length - 1);
        const i0 = Math.floor(f);
        cab.position.copy(this.cablePath[i0]).lerp(this.cablePath[Math.min(i0 + 1, this.cablePath.length - 1)], f - i0);
      }
    } else if (this.cablePath.length > 1) {
      this.cabins.forEach((cab) => cab.position.copy(this.cablePath[Math.floor(cab.userData.phase * (this.cablePath.length - 1))]));
    }
    // Profundidad en las sondas
    sim.c.probes.forEach((p) => this.labels.setSub(`p-${p.id}`, fmtDepth(sim.h[p.cell])));
  }

  private updateWater(sim: CitySim): void {
    const pos = this.water.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.water.geometry.getAttribute('color') as THREE.BufferAttribute;
    const P = pos.array as Float32Array, C = col.array as Float32Array;
    const amp = this.amplify;
    const zr = this.zRef;
    const tmp = new Float32Array(4);
    const H = this.view === 'resultados' || this.view === 'peligro' ? sim.hmaxField : sim.h;
    const cells = this.waterCells;
    const nb = this.cornerNb, cz = this.cornerZ;
    this.fx.updateField(sim, H === sim.hmaxField, this.view === 'peligro');
    for (let q = 0; q < cells.length; q++) {
      const k = cells[q];
      const h = H[k];
      const o = q * 12;
      if (h < 0.0005) {
        for (let m = 0; m < 4; m++) {
          P[o + m * 3 + 1] = cz[k * 4 + m] - zr - 0.05;
          C[q * 16 + m * 4 + 3] = 0;
        }
        continue;
      }
      depthColor(h, tmp, 0);
      if (H === sim.hmaxField) tmp[3] = Math.max(tmp[3], 0.9);
      for (let m = 0; m < 4; m++) {
        // lámina en la esquina: promedio de la profundidad de las celdas conectadas que la comparten
        let sh = 0, cnt = 0;
        for (let t = 0; t < 4; t++) {
          const n = nb[k * 16 + m * 4 + t];
          if (n < 0) break;
          sh += H[n];
          cnt++;
        }
        const hc = Math.max(sh / cnt, h * 0.35);
        P[o + m * 3 + 1] = cz[k * 4 + m] - zr + hc * amp + 0.008;
        C.set(tmp, q * 16 + m * 4);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private updateResults(sim: CitySim): void {
    // En la vista de resultados el terreno se agrisa y el agua muestra el máximo alcanzado
    const colAttr = this.terrain.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = colAttr.array as Float32Array;
    const src = this.terrainColors.real;
    for (let q = 0; q < arr.length; q += 3) {
      const g = (src[q] * 0.3 + src[q + 1] * 0.59 + src[q + 2] * 0.11) * 0.9 + 0.08;
      arr[q] = arr[q + 1] = arr[q + 2] = g;
    }
    colAttr.needsUpdate = true;
    this.updateWater(sim);
  }

  private updateArrows(sim: CitySim): void {
    const stride = Math.max(2, Math.round(2.5 / sim.c.dx));
    const arrows = flowArrows(sim, stride, 0.003, 0.03);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const a of arrows) {
      if (n >= 900) break;
      const k = Math.floor(a.y / sim.c.dx) * sim.c.nx + Math.floor(a.x / sim.c.dx);
      this.w(a.x, a.y, sim.c.z[k] + a.depth * this.amplify + 0.03, p);
      // en el mundo, +y del modelo es −z
      q.setFromAxisAngle(up, Math.atan2(a.uy, a.ux));
      const L = Math.min(1.9, 0.55 + a.speed * 1.1) * Math.min(1, stride * sim.c.dx / 2.2);
      s.set(L, 1, L * 0.9);
      m4.compose(p, q, s);
      this.arrows.setMatrixAt(n++, m4);
    }
    this.arrows.count = n;
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  /**
   * Altura de dibujo de una gota trazadora: terreno suavizado (interpolación de las esquinas), más la
   * lámina calculada (con la amplificación del dibujo, si está activa) y un pequeño margen. En un techo,
   * la azotea.
   */
  private surfaceAt(sim: CitySim, x: number, y: number): number {
    const c = this.c;
    const fx = Math.min(c.nx - 1e-6, Math.max(0, x / c.dx)), fy = Math.min(c.ny - 1e-6, Math.max(0, y / c.dx));
    const i = Math.floor(fx), j = Math.floor(fy);
    const k = j * c.nx + i;
    const bi = c.building[k];
    if (c.solid[k] && bi >= 0) return c.buildings[bi].baseZ + this.sc.buildings[bi].heightM + 0.15;
    const u = fx - i, v = fy - j, cz = this.cornerZ;
    const z = (cz[k * 4] * (1 - u) + cz[k * 4 + 1] * u) * (1 - v) + (cz[k * 4 + 3] * (1 - u) + cz[k * 4 + 2] * u) * v;
    return z + sim.h[k] * this.amplify + 0.08;
  }

  // ------------------------------------------------------------ cámara
  goto(where: 'general' | 'calle' | 'arriba' | 'valle', animate = true): void {
    const span = Math.max(this.W, this.H);
    let to: { p: THREE.Vector3; t: THREE.Vector3 };
    if (where === 'calle') {
      const [ex, ey] = this.sc.streetView.eye, [lx, ly] = this.sc.streetView.look;
      to = { p: this.w(ex, ey, this.groundAt(ex, ey) + 1.6), t: this.w(lx, ly, this.groundAt(lx, ly) + 1.2) };
    } else if (where === 'valle') {
      // desde la ladera, detrás y por encima del sector, mirando al valle: la maqueta adelante y, al
      // fondo, el río, el metro, los metrocables y los barrios que suben por la otra ladera
      to = { p: new THREE.Vector3(-span * 1.75, this.fitA + span * 0.78, span * 0.38), t: new THREE.Vector3(span * 1.6, this.fitA + span * 0.18, -span * 0.35) };
    } else if (where === 'arriba') {
      to = { p: new THREE.Vector3(0, span * 1.15, 0.01), t: new THREE.Vector3(0, 0, 0) };
    } else {
      // desde el oriente (ladera abajo), mirando hacia la montaña: se ven el sector completo y el barrio
      // que sube detrás, como se ven las laderas de Medellín desde el valle
      // la cámara mira poco inclinada: arriba se ven la ladera que sube detrás y las montañas del valle
      to = { p: new THREE.Vector3(span * 1.25, this.fitA + span * 0.42, span * 0.68), t: new THREE.Vector3(-span * 0.12, this.fitA + span * 0.08, -span * 0.05) };
    }
    if (!this.home) this.home = { p: to.p.clone(), t: to.t.clone() };
    if (!animate || this.reducedMotion) {
      this.camera.position.copy(to.p);
      this.controls.target.copy(to.t);
      this.controls.update();
      this.tween = null;
      return;
    }
    this.tween = { from: { p: this.camera.position.clone(), t: this.controls.target.clone() }, to, start: performance.now(), dur: 1100 };
  }

  focusOn(x: number, y: number): void {
    const t = this.w(x, y, this.groundAt(x, y));
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const p = t.clone().add(dir.multiplyScalar(38));
    if (this.reducedMotion) {
      this.camera.position.copy(p);
      this.controls.target.copy(t);
      this.controls.update();
    } else this.tween = { from: { p: this.camera.position.clone(), t: this.controls.target.clone() }, to: { p, t }, start: performance.now(), dur: 900 };
  }

  /** Lleva la cámara a un punto de vista (coordenadas del modelo: x, y en planta y cota z). */
  lookFrom(eye: [number, number, number], target: [number, number, number]): void {
    const p = this.w(eye[0], eye[1], eye[2]);
    const t = this.w(target[0], target[1], target[2]);
    if (this.reducedMotion) {
      this.camera.position.copy(p);
      this.controls.target.copy(t);
      this.controls.update();
    } else this.tween = { from: { p: this.camera.position.clone(), t: this.controls.target.clone() }, to: { p, t }, start: performance.now(), dur: 900 };
  }

  orbit(deg: number): void {
    const off = this.camera.position.clone().sub(this.controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);
    this.camera.position.copy(this.controls.target).add(off);
    this.controls.update();
  }

  zoom(f: number): void {
    const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f);
    const d = off.length();
    if (d < this.controls.minDistance || d > this.controls.maxDistance) return;
    this.camera.position.copy(this.controls.target).add(off);
    this.controls.update();
  }

  // ------------------------------------------------------------ selección
  pick(clientX: number, clientY: number): Pick | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const targets: THREE.Object3D[] = [...this.drainGroup.children];
    if (!this.cut) targets.push(...this.buildingsGroup.children.filter((o) => o.userData.pickBuilding));
    targets.push(this.terrain);
    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) return null;
    const h = hits[0];
    if (h.object.userData.drain !== undefined) {
      const di = h.object.userData.drain as number;
      const k = this.c.drains[di].cell;
      return { kind: 'drain', index: di, x: ((k % this.c.nx) + 0.5) * this.c.dx, y: (Math.floor(k / this.c.nx) + 0.5) * this.c.dx };
    }
    const p = h.point.clone().add(ray.ray.direction.clone().multiplyScalar(0.05));
    const x = p.x + this.W / 2, y = this.H / 2 - p.z;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return null;
    const k = Math.floor(y / this.c.dx) * this.c.nx + Math.floor(x / this.c.dx);
    if (this.c.building[k] >= 0) return { kind: 'building', index: this.c.building[k], x, y };
    return { kind: 'cell', k, x, y };
  }

  showHighlight(x: number | null, y = 0): void {
    if (x === null) {
      this.highlight.visible = false;
      return;
    }
    this.highlight.visible = true;
    this.w(x, y, this.groundAt(x, y) + 0.05, this.highlight.position);
  }

  // ------------------------------------------------------------ dibujo
  resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(reserved: DOMRect[] = []): void {
    if (this.disposed) return;
    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.start) / this.tween.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.camera.position.lerpVectors(this.tween.from.p, this.tween.to.p, e);
      this.controls.target.lerpVectors(this.tween.from.t, this.tween.to.t, e);
      if (k >= 1) this.tween = null;
    }
    this.controls.update();
    if (this.envPending > 0 && --this.envPending === 0) this.captureEnv();
    this.renderer.render(this.scene, this.camera);
    // etiquetas
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const pos = new Map<string, { x: number; y: number; visible: boolean }>();
    const v = new THREE.Vector3();
    const project = (id: string, at: THREE.Vector3) => {
      v.copy(at).project(this.camera);
      pos.set(id, { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && v.z > -1 });
    };
    // los rótulos lejanos (río, metro, cerros…) solo en las vistas altas: a nivel de calle quedarían
    // dibujados sobre las fachadas
    // y, con la tormenta, tampoco los que quedaron perdidos en la niebla (no se rotula lo que no se ve)
    const high = this.camera.position.y - this.fitA > 22;
    const fogFar = (this.scene.fog as THREE.Fog).far * 0.8;
    for (const l of this.labelItems) {
      project(l.id, l.at);
      if (l.kind === 'lejano' && (!high || l.at.distanceTo(this.camera.position) > fogFar)) pos.set(l.id, { x: 0, y: 0, visible: false });
    }
    for (const l of this.tracerFx.labels) project(l.id, l.at);
    if (!this.cut) for (const l of this.floodView?.labels ?? []) project(l.id, l.at);
    if (this.cut && this.sc.pipes.length) {
      // etiqueta en la mitad del tramo más largo
      let best: [number, number] = [0, 0], bl = -1;
      for (const pp of this.sc.pipes) for (let q = 0; q < pp.path.length - 1; q++) {
        const [ax, ay] = pp.path[q], [bx, by] = pp.path[q + 1];
        const L = Math.hypot(bx - ax, by - ay);
        if (L > bl) {
          bl = L;
          best = [(ax + bx) / 2, (ay + by) / 2];
        }
      }
      project('pipes', this.w(best[0], best[1], this.groundAt(best[0], best[1]) - 1));
    }
    if (this.pinned) project('pin', this.w(this.pinned.at[0], this.pinned.at[1], this.groundAt(this.pinned.at[0], this.pinned.at[1]) + 1.5));
    const cr = this.container.getBoundingClientRect();
    const res = reserved.map((r) => new DOMRect(r.left - cr.left, r.top - cr.top, r.width, r.height));
    this.labels.layout(pos, w, h, res);
  }

  /** Información de memoria para verificar que todo se libera al salir. */
  info(): { geometries: number; textures: number; calls: number; triangles: number } {
    const i = this.renderer.info;
    return { geometries: i.memory.geometries, textures: i.memory.textures, calls: i.render.calls, triangles: i.render.triangles };
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
    this.fx.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.dispose();
  }
}

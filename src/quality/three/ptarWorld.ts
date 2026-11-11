// Planta de tratamiento de aguas residuales en 3D (escena ilustrativa): el colector que baja de los barrios, el
// aliviadero, las rejas, el desarenador y desengrasador, el sedimentador primario redondo con su puente, el
// reactor aireado, el sedimentador secundario con la recirculación, el canal de luz ultravioleta y las gradas de
// la descarga al río; detrás, la línea de lodos: espesador, digestores con su gasómetro y su tea, motor-generador
// y la centrífuga. Una segunda línea de tratamiento aparece cuando se pone en servicio. El color del agua, el
// lodo en los tanques, las burbujas, la basura, la pluma en el río y los peces siguen el cálculo de ptar.ts.

import * as THREE from 'three';
import { WEATHER, type PtarInput, type PtarResult } from '../ptar';
import { PTAR_UNITS, type PtarUnitId } from '../ptarUnits';
import { concreteMaterial, fishGeometry, houses, noise2, rng, tank, trees, waterMaterial, type HouseSpot, type TreeSpot } from './kit';
import type { QStage, StageLabel, StageView } from './stage';

/** Centro de cada parte (línea 1 en z = 0; la línea de lodos detrás). */
export const PT: Record<PtarUnitId, { x: number; z: number }> = {
  llegada: { x: -100, z: 0 },
  rejas: { x: -88, z: 0 },
  desarenador: { x: -72, z: 0 },
  primario: { x: -50, z: 0 },
  reactor: { x: -20, z: 0 },
  secundario: { x: 12, z: 0 },
  uv: { x: 34, z: 0 },
  descarga: { x: 44, z: 15 },
  espesador: { x: -50, z: -58 },
  digestor: { x: -21, z: -58 },
  deshidratacion: { x: 34, z: -58 },
};
/** Desplazamiento de la segunda línea (detrás de la primera). */
const LZ2 = -26;
const RIVER_Z = 34;
const R_PRIM = 8, R_SEC = 9.5, R_THICK = 5;
const H_ROUND = 3.2, H_REACT = 4.6, H_DES = 3;
const LABEL_LIFT = 10;

const CLEAR = new THREE.Color(0.36, 0.56, 0.62);
const SEWAGE = new THREE.Color(0.46, 0.42, 0.34);
const LIQUOR = new THREE.Color(0.43, 0.31, 0.18);
const DEAD = new THREE.Color(0.55, 0.53, 0.46);
const RIVER_OK = new THREE.Color(0.32, 0.5, 0.5);
const SLUDGE_C = new THREE.Color('#5d4329');
const WHITE = new THREE.Color(1, 1, 1);
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** Color del agua según sus sólidos suspendidos [mg/L]. */
function waterCol(sst: number, out = new THREE.Color()): THREE.Color {
  return out.copy(CLEAR).lerp(SEWAGE, Math.min(1, Math.sqrt(Math.max(0, sst) / 250)));
}
/** Relieve ilustrativo: lomas detrás de la planta, al otro lado del río y a la izquierda, donde están los barrios. */
function hillH(x: number, z: number): number {
  const back = Math.max(0, -z - 84), front = Math.max(0, z - 62), left = Math.max(0, -x - 128), right = Math.max(0, x - 96);
  const d = Math.hypot(Math.max(back, front), Math.max(left, right));
  const n = noise2(x / 80, z / 80) * 0.65 + noise2(x / 27 + 5, z / 27) * 0.35;
  const h = smooth(0, 120, d) * (22 + 70 * n);
  // el río corre por el fondo del valle
  return h * smooth(10, 40, Math.abs(z - RIVER_Z));
}

export interface PtarView {
  inp: PtarInput;
  r: PtarResult;
  unit: PtarUnitId | null;
}

interface Seg {
  a: THREE.Vector3;
  b: THREE.Vector3;
  kind: 'agua' | 'lodo' | 'gas' | 'aliviadero';
  /** De qué punto de la planta sale el agua (para su color). */
  from: 'raw' | 'pre' | 'prim' | 'liquor' | 'sec' | 'eff';
  line2?: boolean;
}

interface Round {
  x: number;
  z: number;
  r: number;
  water: THREE.Mesh;
  surf: THREE.Mesh;
  blanket: THREE.Mesh;
  bridge: THREE.Group;
  line2: boolean;
  parts: THREE.Object3D[];
}

export class PtarWorld {
  private stage: QStage;
  private v: PtarView | null = null;
  private waterTime = { value: 0 };
  private rounds: Round[] = [];
  private reactors: { water: THREE.Mesh; surf: THREE.Mesh; line2: boolean; parts: THREE.Object3D[] }[] = [];
  private line2: THREE.Object3D[] = [];
  private segs: Seg[] = [];
  private chev!: THREE.InstancedMesh;
  private chevSlots: { seg: number; k: number; n: number }[] = [];
  private bubbles: THREE.InstancedMesh;
  private bubbleSlots: { x: number; z: number; ph: number; line2: boolean }[] = [];
  private trash: THREE.InstancedMesh;
  private rake = new THREE.Group();
  private desWater: THREE.Mesh;
  private desSurf: THREE.Mesh;
  private sand: THREE.Mesh;
  private grease: THREE.Mesh;
  private chamberSurf: THREE.Mesh;
  private channelSurfs: { mesh: THREE.Mesh; from: Seg['from'] }[] = [];
  private bypassSheet: THREE.Mesh;
  private uvLamps: THREE.MeshStandardMaterial;
  private uvGlow: THREE.Mesh;
  private uvSurf: THREE.Mesh;
  private cascade: THREE.Mesh[] = [];
  private river: THREE.Mesh;
  private riverBase: Float32Array;
  private fish: THREE.InstancedMesh;
  private floaters: THREE.InstancedMesh;
  private pickets = new THREE.Group();
  private thickBlanket!: THREE.Mesh;
  private gasDome!: THREE.Mesh;
  private flame!: THREE.Mesh;
  private drum = new THREE.Group();
  private cake!: THREE.Mesh;
  private rain: THREE.LineSegments;
  private rainK = 0;
  private ring: THREE.Mesh;
  readonly views: Record<string, StageView>;

  constructor(stage: QStage, cb: { onUnit: (id: PtarUnitId) => void }) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(120);
    this.views = {
      general: { eye: [-26, 66, 104], target: [-26, 0, -20], fit: 196, portrait: { eye: [-190, 140, 60], target: [-30, 0, -18] } },
      entrada: { eye: [-80, 22, 38], target: [-86, 1, 2] },
      biologico: { eye: [-18, 34, 54], target: [-18, 1, -6] },
      salida: { eye: [74, 24, 74], target: [30, 0, 18] },
      lodos: { eye: [-6, 50, 6], target: [-6, 0, -58], fit: 104 },
    };
    for (const u of PTAR_UNITS) {
      const p = PT[u.id];
      this.views[`u-${u.id}`] =
        u.id === 'descarga'
          ? { eye: [p.x + 16, 14, p.z + 34], target: [p.x, 0.5, p.z + 6] }
          : p.z < -40
            ? { eye: [p.x + 6, 18, p.z + 30], target: [p.x, 2, p.z] }
            : u.id === 'primario' || u.id === 'secundario' || u.id === 'reactor'
              ? { eye: [p.x + 6, 18, p.z + 32], target: [p.x, 1.5, p.z] }
              : { eye: [p.x + 5, 11, p.z + 22], target: [p.x, 1.4, p.z] };
    }
    const pick = (o: THREE.Object3D, id: PtarUnitId) => stage.addPick(o, () => cb.onUnit(id), `${PTAR_UNITS.find((u) => u.id === id)!.name}: toca para ver qué pasa aquí`);

    // ---- suelo, patio y barrios de donde baja el colector
    sc.add(this.terrain());
    this.buildGrounds();
    this.buildNeighborhood();

    // ---- río (con la pluma de la descarga y la del aliviadero), orillas y piedras
    const rg = new THREE.PlaneGeometry(460, 16, 230, 8);
    rg.rotateX(-Math.PI / 2);
    {
      const pos = rg.attributes.position as THREE.BufferAttribute;
      const n = pos.count;
      const flow = new Float32Array(n * 2), foam = new Float32Array(n), col = new Float32Array(n * 3).fill(1);
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        flow[i * 2] = x;
        flow[i * 2 + 1] = z;
        foam[i] = Math.max(0, (Math.abs(z) - 6) / 2) * 0.5;
      }
      rg.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
      rg.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
      rg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.riverBase = new Float32Array(foam);
    }
    this.river = new THREE.Mesh(rg, waterMaterial(this.waterTime, { opacity: 0.94, speed: 1.2 }));
    this.river.position.set(-20, 0.05, RIVER_Z);
    this.river.receiveShadow = true;
    // un poco más mate que los tanques: con el sol de frente, el reflejo no tapa el color del agua
    (this.river.material as THREE.MeshStandardMaterial).roughness = 0.34;
    sc.add(this.river);
    const bankM = new THREE.MeshStandardMaterial({ color: '#7d6a52', roughness: 1 });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(460, 0.9, 1.2), bankM);
      b.position.set(-20, 0.2, RIVER_Z + s * 8.4);
      sc.add(b);
    }
    {
      const Rr = rng(19);
      const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 1, flatShading: true }), 160);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
      for (let k = 0; k < 160; k++) {
        const side = k % 2 ? 1 : -1, x = -240 + Rr() * 440, sz = 0.35 + Rr() * 0.9;
        q.setFromEuler(new THREE.Euler(Rr() * 3, Rr() * 3, Rr() * 3));
        rocks.setMatrixAt(k, m4.compose(pv.set(x, 0.1, RIVER_Z + side * (7.4 + Rr() * 2.4)), q, sv.set(sz * (1 + Rr()), sz * 0.6, sz)));
      }
      rocks.castShadow = true;
      sc.add(rocks);
    }
    stage.addPick(this.river, () => cb.onUnit('descarga'), 'El río: toca para ver qué le llega');
    this.fish = new THREE.InstancedMesh(fishGeometry(), new THREE.MeshStandardMaterial({ color: '#4b6577', roughness: 0.6 }), 24);
    this.fish.frustumCulled = false;
    this.fish.renderOrder = 7;
    sc.add(this.fish);
    this.floaters = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.08, 0.35), new THREE.MeshStandardMaterial({ color: '#e9e5da', roughness: 0.8 }), 40);
    this.floaters.frustumCulled = false;
    this.floaters.renderOrder = 7;
    sc.add(this.floaters);

    // ---- llegada: cámara del colector y aliviadero hacia el río
    const L = PT.llegada;
    const chamber = tank(7, 3.4, 7, { color: '#bdb9b0' });
    chamber.position.set(L.x, 0, L.z);
    this.shadows(chamber);
    sc.add(chamber);
    this.chamberSurf = this.flatWater(6.2, 6.2, 1.1, { speed: 1.4, foam: (x) => Math.max(0, 1 - (x + 3.1) / 2) * 0.7 });
    this.chamberSurf.position.set(L.x, 2.95, L.z);
    sc.add(this.chamberSurf);
    // muro del aliviadero (vertedero) y canal hasta el río
    const weir = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.42), new THREE.MeshStandardMaterial({ color: '#3e4a52', roughness: 0.8 }));
    weir.position.set(L.x, 2.95, L.z + 3.35);
    sc.add(weir);
    this.channel(L.x, L.z + 3.6, L.x, RIVER_Z - 8.4, 2.2, 2.2, 0.15);
    this.bypassSheet = this.slopedWater(L.x, L.z + 3.8, RIVER_Z - 8.6, 1.8, 0.25, 2.3);
    sc.add(this.bypassSheet);
    pick(chamber, 'llegada');
    // colector que baja de los barrios (tubo grande) con sus pozos de inspección
    this.pipePath([new THREE.Vector3(-150, 1.4, -30), new THREE.Vector3(-118, 1.4, -30), new THREE.Vector3(-118, 1.4, 0), new THREE.Vector3(L.x - 3.5, 1.4, 0)], 0.9, new THREE.MeshStandardMaterial({ color: '#7f7a70', roughness: 0.8 }));
    for (const [x, z] of [[-140, -30], [-126, -30], [-118, -16], [-110, 0]]) {
      const mh = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.6, 18), concreteMaterial('#a8a49b'));
      mh.position.set(x, 1.3, z);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 18), new THREE.MeshStandardMaterial({ color: '#3a3d40', metalness: 0.5, roughness: 0.6 }));
      lid.position.set(x, 2.64, z);
      sc.add(mh, lid);
    }

    // ---- rejas: canal con barras inclinadas, rastrillo, banda y contenedor
    const Rj = PT.rejas;
    const cx0 = L.x + 3.5, cx1 = PT.desarenador.x - 7;
    this.channel(cx0, Rj.z, cx1, Rj.z, 2.6, 3.1, 0, true);
    this.channelSurfs.push({ mesh: this.flatWater(cx1 - cx0, 2.2, 1.4, { speed: 1.4, foam: (x) => (Math.abs(x + (cx1 - cx0) / 2 - (Rj.x - cx0)) < 1.2 ? 0.45 : 0.1) }), from: 'raw' });
    this.channelSurfs[0].mesh.position.set((cx0 + cx1) / 2, 2.75, Rj.z);
    sc.add(this.channelSurfs[0].mesh);
    const barM = new THREE.MeshStandardMaterial({ color: '#4d565e', metalness: 0.4, roughness: 0.5 });
    const bars = new THREE.Group();
    for (let k = 0; k < 11; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.2, 0.08), barM);
      bar.position.set(0, 1.5, -1.0 + k * 0.2);
      bars.add(bar);
    }
    bars.rotation.z = 0.45;
    bars.position.set(Rj.x, 0.2, Rj.z);
    sc.add(bars);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.6, 3), new THREE.MeshStandardMaterial({ color: '#2f6fa8', roughness: 0.5 }));
    frame.position.set(Rj.x - 0.9, 2.6, Rj.z);
    frame.rotation.z = 0.45;
    frame.castShadow = true;
    sc.add(frame);
    const rakeBar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 2.4), new THREE.MeshStandardMaterial({ color: '#e2b13c' }));
    this.rake.add(rakeBar);
    sc.add(this.rake);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(1, 0.15, 4.6), new THREE.MeshStandardMaterial({ color: '#3a3d40' }));
    belt.position.set(Rj.x - 1.8, 3.6, Rj.z - 3.2);
    belt.rotation.x = -0.25;
    const bin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 2.2), new THREE.MeshStandardMaterial({ color: '#3f7a4a', roughness: 0.7 }));
    bin.position.set(Rj.x - 1.8, 0.8, Rj.z - 6.2);
    bin.castShadow = true;
    sc.add(belt, bin);
    this.trash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.06, 0.3), new THREE.MeshStandardMaterial({ color: '#f0ece2', roughness: 0.8 }), 48);
    this.trash.frustumCulled = false;
    sc.add(this.trash);
    for (const o of [bars, frame, bin]) pick(o, 'rejas');

    // ---- desarenador y desengrasador (frente de vidrio)
    const D = PT.desarenador;
    const des = tank(14, H_DES, 5.4, { glassFront: true });
    des.position.set(D.x, 0, D.z);
    this.shadows(des);
    sc.add(des);
    this.desWater = new THREE.Mesh(new THREE.BoxGeometry(13.2, H_DES - 0.75, 4.6), this.volMat());
    this.desWater.position.set(D.x, 0.36 + (H_DES - 0.75) / 2, D.z);
    this.desWater.renderOrder = 5;
    sc.add(this.desWater);
    this.desSurf = this.flatWater(13.2, 4.6, 0.7, { speed: 0.8, foam: (_x, z) => (z < -1.2 ? 0.25 : 0.12) });
    this.desSurf.position.set(D.x, H_DES - 0.37, D.z);
    sc.add(this.desSurf);
    this.sand = new THREE.Mesh(new THREE.BoxGeometry(13, 1, 4.4), new THREE.MeshStandardMaterial({ color: '#d2b47c', roughness: 1 }));
    sc.add(this.sand);
    this.grease = new THREE.Mesh(new THREE.BoxGeometry(13, 0.06, 1.1), new THREE.MeshStandardMaterial({ color: '#d9bd55', roughness: 0.4, transparent: true, opacity: 0.9 }));
    this.grease.position.set(D.x, H_DES - 0.34, D.z - 1.7);
    this.grease.renderOrder = 7;
    sc.add(this.grease);
    const divider = new THREE.Mesh(new THREE.BoxGeometry(13, 1.2, 0.12), new THREE.MeshStandardMaterial({ color: '#c9c6bf', transparent: true, opacity: 0.6, depthWrite: false }));
    divider.position.set(D.x, H_DES - 0.9, D.z - 1.1);
    sc.add(divider);
    const classifier = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4.2, 12), new THREE.MeshStandardMaterial({ color: '#2f6fa8' }));
    classifier.rotation.z = 0.9;
    classifier.position.set(D.x + 5, 2.6, D.z - 4.6);
    sc.add(classifier);
    pick(des, 'desarenador');

    // ---- primario, reactor y secundario (línea 1 y línea 2)
    for (const line2 of [false, true]) {
      const dz = line2 ? LZ2 : 0;
      this.rounds.push(this.roundTank(PT.primario.x, dz, R_PRIM, line2, 'primario', pick));
      this.buildReactor(dz, line2, pick);
      this.rounds.push(this.roundTank(PT.secundario.x, dz, R_SEC, line2, 'secundario', pick));
    }
    // losa reservada para la ampliación: se ve cuando la segunda línea no está en servicio
    const pad = new THREE.Mesh(new THREE.BoxGeometry(84, 0.12, 24), concreteMaterial('#b3afa6'));
    pad.position.set(-19, 0.06, LZ2);
    pad.receiveShadow = true;
    sc.add(pad);
    this.padSign = this.signBoard('Espacio para la segunda línea', '', 7, 1.6, '#6b7280');
    this.padSign.position.set(-19, 1.6, LZ2 + 11.5);
    sc.add(this.padSign);
    // casa de sopladores entre las dos líneas
    const blow = houses([{ x: PT.reactor.x, y: 0, z: -14.6, w: 11, d: 3.4, h: 3.6, rot: 0, wall: '#dfe3e6' }]);
    sc.add(blow);
    const bs = this.signBoard('Sopladores', '', 3.2, 0.7, '#1f5f8b');
    bs.position.set(PT.reactor.x, 2.6, -12.85);
    sc.add(bs);
    pick(blow, 'reactor');
    const airM = new THREE.MeshStandardMaterial({ color: '#2f6fa8', roughness: 0.4, metalness: 0.3 });
    this.pipePath([new THREE.Vector3(PT.reactor.x - 4, 3.2, -12.9), new THREE.Vector3(PT.reactor.x - 4, 5.2, -12.9), new THREE.Vector3(PT.reactor.x - 4, 5.2, -6.6)], 0.22, airM);

    // ---- canal de luz ultravioleta
    const U = PT.uv;
    this.channel(U.x - 5.5, U.z, U.x + 5.5, U.z, 3.2, 1.8, 0, true);
    this.uvSurf = this.flatWater(11, 3, 0.62, { speed: 1.1, foam: () => 0.06 });
    this.uvSurf.position.set(U.x, 1.4, U.z);
    sc.add(this.uvSurf);
    this.uvLamps = new THREE.MeshStandardMaterial({ color: '#c9b3ff', emissive: new THREE.Color('#9b6bff'), emissiveIntensity: 1.4, roughness: 0.3 });
    const rackM = new THREE.MeshStandardMaterial({ color: '#c3c9ce', metalness: 0.5, roughness: 0.35 });
    for (const dx of [-3, 0, 3]) {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.3), rackM);
      rack.position.set(U.x + dx, 2.3, U.z);
      sc.add(rack);
      for (let k = 0; k < 6; k++) {
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8), this.uvLamps);
        lamp.rotation.z = Math.PI / 2;
        lamp.position.set(U.x + dx, 0.7 + (k % 2) * 0.5, U.z - 1.1 + Math.floor(k / 2) * 1.1);
        sc.add(lamp);
      }
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.4, 0.15), rackM);
      post.position.set(U.x + dx, 1.6, U.z - 1.4);
      sc.add(post);
    }
    this.uvGlow = new THREE.Mesh(new THREE.BoxGeometry(10.6, 1.3, 2.9), new THREE.MeshBasicMaterial({ color: '#b28cff', transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.uvGlow.position.set(U.x, 0.85, U.z);
    this.uvGlow.renderOrder = 8;
    sc.add(this.uvGlow);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 1), new THREE.MeshStandardMaterial({ color: '#d9dde0' }));
    cab.position.set(U.x, 1, U.z - 3.2);
    cab.castShadow = true;
    sc.add(cab);
    pick(cab, 'uv');
    const uvPick = new THREE.Mesh(new THREE.BoxGeometry(11, 2, 3.2), new THREE.MeshBasicMaterial({ visible: false }));
    uvPick.position.set(U.x, 1, U.z);
    sc.add(uvPick);
    pick(uvPick, 'uv');

    // ---- descarga: canal y gradas hasta el río
    this.channel(U.x + 5.5, U.z, PT.descarga.x + 1.5, U.z, 2.2, 1.6, 0, true);
    this.buildCascade(pick);

    // ---- línea de lodos
    this.buildSludgeLine(pick);

    // ---- tuberías y canales entre las partes, con las flechas del flujo
    this.buildPipes();
    this.buildChevrons();

    // ---- burbujas del reactor, lluvia, laboratorio, letrero, árboles
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 6, 4), new THREE.MeshStandardMaterial({ color: '#f4f7f8', transparent: true, opacity: 0.85 }), 320);
    this.bubbles.frustumCulled = false;
    this.bubbles.renderOrder = 7;
    sc.add(this.bubbles);
    const Rb = rng(5);
    for (let k = 0; k < 320; k++) this.bubbleSlots.push({ x: PT.reactor.x + (Rb() - 0.5) * 23, z: (Rb() - 0.5) * 10.6 + (k % 2 ? LZ2 : 0), ph: Rb(), line2: k % 2 === 1 });
    const rgeo = new THREE.BufferGeometry();
    const rp = new Float32Array(900 * 6);
    const Rr2 = rng(8);
    for (let k = 0; k < 900; k++) {
      const x = -130 + Rr2() * 200, y = Rr2() * 60, z = -80 + Rr2() * 130;
      rp.set([x, y, z, x + 0.15, y - 1.6, z], k * 6);
    }
    rgeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: '#dbe8f3', transparent: true, opacity: 0.6, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    sc.add(this.rain);
    this.buildSite();
    const R = rng(41);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 230; k++) {
      const x = -210 + R() * 380, z = -150 + R() * 260;
      if (z > -80 && z < 22 && x > -124 && x < 64) continue;
      if (Math.abs(z - RIVER_Z) < 11) continue;
      if (x < -124 && z > -70 && z < 30) continue; // barrios
      if (Math.abs(x - 76) < 6 && z < -52) continue; // vía de acceso
      ts.push({ x, y: hillH(x, z), z, r: 1.6 + R() * 1.8 });
    }
    sc.add(trees(ts, 9));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(8.6, 9.3, 48), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthTest: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.1;
    this.ring.renderOrder = 9;
    this.ring.visible = false;
    sc.add(this.ring);
    stage.view(this.views.general, false);
  }
  private padSign: THREE.Mesh;

  // ------------------------------------------------------------------ piezas

  private shadows(o: THREE.Object3D): void {
    o.traverse((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
    });
  }

  private volMat(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: '#88b9c9', transparent: true, opacity: 0.6, roughness: 0.2, depthWrite: false });
  }

  /** Superficie de agua plana (rectángulo) con vetas que avanzan en +x y espuma según la función dada. */
  private flatWater(w: number, d: number, opacity: number, o: { speed: number; foam: (x: number, z: number) => number }): THREE.Mesh {
    const g = new THREE.PlaneGeometry(w, d, Math.max(4, Math.round(w * 1.2)), Math.max(2, Math.round(d)));
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    const flow = new Float32Array(n * 2), foam = new Float32Array(n), col = new Float32Array(n * 3).fill(1);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      flow[i * 2] = x;
      flow[i * 2 + 1] = z;
      foam[i] = o.foam(x, z);
    }
    g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
    g.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, waterMaterial(this.waterTime, { opacity: Math.min(0.95, opacity), speed: o.speed }));
    m.renderOrder = 6;
    return m;
  }

  /** Lámina de agua que baja por un canal a lo largo de z, de la altura y0 a y1. */
  private slopedWater(x: number, z0: number, z1: number, w: number, y1: number, y0: number): THREE.Mesh {
    const Lz = z1 - z0;
    const g = new THREE.PlaneGeometry(w, Math.abs(Lz), 3, Math.max(4, Math.round(Math.abs(Lz) * 1.5)));
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    const flow = new Float32Array(n * 2), foam = new Float32Array(n), col = new Float32Array(n * 3).fill(1);
    for (let i = 0; i < n; i++) {
      const lz = pos.getZ(i), k = (lz + Math.abs(Lz) / 2) / Math.abs(Lz);
      pos.setY(i, y0 + (y1 - y0) * k);
      flow[i * 2] = lz + z0;
      flow[i * 2 + 1] = pos.getX(i);
      foam[i] = 0.25 + 0.4 * k;
    }
    g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
    g.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, waterMaterial(this.waterTime, { opacity: 0.92, speed: 2.2 }));
    m.position.set(x, 0, (z0 + z1) / 2);
    m.renderOrder = 6;
    return m;
  }

  /** Canal de concreto abierto (fondo y dos muros) entre dos puntos alineados con x o con z. */
  private channel(x0: number, z0: number, x1: number, z1: number, W: number, H: number, floorDrop: number, alongX = false): void {
    const sc = this.stage.scene;
    const conc = concreteMaterial('#c4c1b9');
    const L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, t = 0.18;
    const part = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), conc);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      sc.add(m);
    };
    if (alongX) {
      part(L, 0.2, W + 2 * t, cx, 0.1, cz);
      for (const s of [-1, 1]) part(L, H, t, cx, H / 2, cz + s * (W / 2 + t / 2));
    } else {
      part(W + 2 * t, 0.2, L, cx, 0.1 - floorDrop, cz);
      for (const s of [-1, 1]) part(t, H, L, cx + s * (W / 2 + t / 2), H / 2, cz);
    }
  }

  /** Tubería recta por tramos (cilindros entre puntos). */
  private pipePath(pts: THREE.Vector3[], r: number, mat: THREE.Material, into?: THREE.Object3D[]): void {
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const L = a.distanceTo(b);
      if (L < 1e-3) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L + r * 0.6, 10), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
      m.castShadow = true;
      this.stage.scene.add(m);
      into?.push(m);
    }
  }

  /** Letrero con texto en una textura de lienzo. */
  private signBoard(title: string, sub: string, w: number, h: number, bg: string): THREE.Mesh {
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const mat = new THREE.MeshStandardMaterial({ color: bg, roughness: 0.6 });
    if (cv) {
      cv.width = 512;
      cv.height = Math.round((512 * h) / w);
      const g = cv.getContext('2d');
      if (g) {
        g.fillStyle = bg;
        g.fillRect(0, 0, cv.width, cv.height);
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        const big = Math.min(46, cv.height * (sub ? 0.36 : 0.5));
        g.font = `700 ${big}px system-ui, sans-serif`;
        g.fillText(title, 256, sub ? cv.height * 0.45 : cv.height * 0.5 + big * 0.35);
        if (sub) {
          g.font = `400 ${Math.round(big * 0.6)}px system-ui, sans-serif`;
          g.fillText(sub, 256, cv.height * 0.78);
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        mat.map = tex;
        mat.color.set('#ffffff');
      }
    }
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  }

  /** Tanque redondo con frente de vidrio (se ve el lodo en el fondo), superficie del agua y puente que gira. */
  private roundTank(x: number, z: number, r: number, line2: boolean, id: 'primario' | 'secundario', pick: (o: THREE.Object3D, id: PtarUnitId) => void): Round {
    const sc = this.stage.scene;
    const parts: THREE.Object3D[] = [];
    const add = (o: THREE.Object3D) => {
      sc.add(o);
      parts.push(o);
      return o;
    };
    const arc = 1.5;
    const conc = concreteMaterial('#c9c6bf');
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.3, r + 0.3, H_ROUND, 56, 1, true, arc / 2, Math.PI * 2 - arc), conc);
    (wall.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    wall.position.set(x, H_ROUND / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    add(wall);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.3, r + 0.3, H_ROUND, 16, 1, true, -arc / 2, arc), new THREE.MeshStandardMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.18, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.set(x, H_ROUND / 2, z);
    glass.renderOrder = 6;
    add(glass);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.3, 0.2, 6, 64), conc);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, H_ROUND, z);
    add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r + 0.3, 48), conc);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(x, 0.04, z);
    floor.receiveShadow = true;
    add(floor);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H_ROUND - 0.6, 48), this.volMat());
    water.position.set(x, 0.1 + (H_ROUND - 0.6) / 2, z);
    water.renderOrder = 5;
    add(water);
    const blanket = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.05, r - 0.05, 1, 48), new THREE.MeshStandardMaterial({ color: SLUDGE_C, roughness: 1 }));
    blanket.position.set(x, 0.6, z);
    add(blanket);
    // superficie: anillo con vetas que corren del centro al borde
    const g = new THREE.RingGeometry(1.6, r, 48, 4);
    g.rotateX(-Math.PI / 2);
    {
      const pos = g.attributes.position as THREE.BufferAttribute;
      const n = pos.count;
      const flow = new Float32Array(n * 2), foam = new Float32Array(n), col = new Float32Array(n * 3).fill(1);
      for (let i = 0; i < n; i++) {
        const px = pos.getX(i), pz = pos.getZ(i);
        const rr = Math.hypot(px, pz);
        flow[i * 2] = rr * 0.6;
        flow[i * 2 + 1] = Math.atan2(pz, px) * 3;
        foam[i] = rr > r - 0.6 ? 0.4 : 0.02;
      }
      g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
      g.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const surf = new THREE.Mesh(g, waterMaterial(this.waterTime, { opacity: 0.93, speed: 0.12 }));
    surf.position.set(x, H_ROUND - 0.48, z);
    surf.renderOrder = 6;
    add(surf);
    // campana central de entrada y canaleta perimetral de salida
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.6, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#8f969b', side: THREE.DoubleSide, metalness: 0.3 }));
    well.position.set(x, H_ROUND - 0.6, z);
    add(well);
    const gutter = new THREE.Mesh(new THREE.TorusGeometry(r - 0.45, 0.14, 4, 64), new THREE.MeshStandardMaterial({ color: '#9da3a6' }));
    gutter.rotation.x = Math.PI / 2;
    gutter.position.set(x, H_ROUND - 0.42, z);
    add(gutter);
    // puente giratorio con su baranda y el brazo barredor
    const bridge = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.6 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(r + 0.4, 0.25, 1.1), steel);
    deck.position.set((r + 0.4) / 2, H_ROUND + 0.55, 0);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(r + 0.4, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: '#e2b13c' }));
    rail.position.set((r + 0.4) / 2, H_ROUND + 1.5, 0.5);
    const rail2 = rail.clone();
    rail2.position.z = -0.5;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(r - 1.4, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: '#6b7177' }));
    arm.position.set(r / 2 + 0.6, 0.5, 0);
    const drop = new THREE.Mesh(new THREE.BoxGeometry(0.12, H_ROUND, 0.12), new THREE.MeshStandardMaterial({ color: '#6b7177' }));
    drop.position.set(r - 0.6, H_ROUND / 2 + 0.3, 0);
    const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: '#2f6fa8' }));
    wheel.position.set(r + 0.3, H_ROUND + 0.3, 0);
    bridge.add(deck, rail, rail2, arm, drop, wheel);
    for (let k = 0; k <= 4; k++)
      for (const zz of [-0.5, 0.5]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.06), rail.material);
        post.position.set(((r + 0.4) * k) / 4, H_ROUND + 1.02, zz);
        bridge.add(post);
      }
    bridge.traverse((o) => (o.castShadow = true));
    bridge.position.set(x, 0, z);
    add(bridge);
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, H_ROUND + 0.6, 12), conc);
    pier.position.set(x, (H_ROUND + 0.6) / 2, z);
    add(pier);
    pick(wall, id);
    pick(glass, id);
    pick(surf, id);
    if (line2) this.line2.push(...parts);
    return { x, z, r, water, surf, blanket, bridge, line2, parts };
  }

  /** Reactor rectangular con frente de vidrio, difusores en el fondo y superficie agitada. */
  private buildReactor(dz: number, line2: boolean, pick: (o: THREE.Object3D, id: PtarUnitId) => void): void {
    const sc = this.stage.scene;
    const parts: THREE.Object3D[] = [];
    const x = PT.reactor.x;
    const g = tank(24, H_REACT, 12, { glassFront: true });
    g.position.set(x, 0, dz);
    this.shadows(g);
    sc.add(g);
    parts.push(g);
    const water = new THREE.Mesh(new THREE.BoxGeometry(23.2, H_REACT - 0.75, 11.2), this.volMat());
    water.position.set(x, 0.36 + (H_REACT - 0.75) / 2, dz);
    water.renderOrder = 5;
    sc.add(water);
    parts.push(water);
    const surf = this.flatWater(23.2, 11.2, 0.92, { speed: 0.9, foam: () => 0.35 });
    surf.position.set(x, H_REACT - 0.37, dz);
    sc.add(surf);
    parts.push(surf);
    // parrilla de difusores en el fondo
    const dm = new THREE.MeshStandardMaterial({ color: '#3a3d40' });
    for (let k = 0; k < 6; k++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 22, 6), dm);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(x, 0.5, dz - 4.5 + k * 1.8);
      sc.add(pipe);
      parts.push(pipe);
    }
    // pasarela sobre el reactor
    const walk = new THREE.Mesh(new THREE.BoxGeometry(24.6, 0.18, 1.4), new THREE.MeshStandardMaterial({ color: '#9aa0a3', metalness: 0.3 }));
    walk.position.set(x, H_REACT + 0.1, dz - 6.7);
    sc.add(walk);
    parts.push(walk);
    pick(g, 'reactor');
    pick(surf, 'reactor');
    this.reactors.push({ water, surf, line2, parts });
    if (line2) this.line2.push(...parts);
  }

  /** Gradas de la descarga: el agua cae de escalón en escalón y toma aire antes de llegar al río. */
  private buildCascade(pick: (o: THREE.Object3D, id: PtarUnitId) => void): void {
    const sc = this.stage.scene;
    const x = PT.descarga.x;
    const z0 = 1.2, z1 = RIVER_Z - 8.4, n = 5;
    const step = (z1 - z0) / n;
    const conc = concreteMaterial('#bdb9b0');
    for (let k = 0; k < n; k++) {
      const y = 1.1 - (k + 1) * 0.2;
      const block = new THREE.Mesh(new THREE.BoxGeometry(3.4, Math.max(0.2, y), step), conc);
      block.position.set(x, Math.max(0.1, y / 2), z0 + step * (k + 0.5));
      block.receiveShadow = true;
      sc.add(block);
      pick(block, 'descarga');
      const sheet = this.flatWater(step, 2.6, 0.92, { speed: 2.4, foam: (lx) => 0.3 + 0.6 * Math.max(0, (lx + step / 2) / step - 0.6) });
      sheet.rotation.y = -Math.PI / 2;
      sheet.position.set(x, y + 0.08, z0 + step * (k + 0.5));
      sc.add(sheet);
      this.cascade.push(sheet);
    }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 0.6), conc);
    wall.position.set(x, 0.5, z1 + 0.3);
    sc.add(wall);
  }

  /** Espesador, digestores con gasómetro, tea y motor-generador, y la centrífuga bajo cubierta. */
  private buildSludgeLine(pick: (o: THREE.Object3D, id: PtarUnitId) => void): void {
    const sc = this.stage.scene;
    const conc = concreteMaterial('#c9c6bf');
    // espesador: tanque redondo bajo con varillas que giran
    const T = PT.espesador;
    const th = new THREE.Mesh(new THREE.CylinderGeometry(R_THICK, R_THICK, 3, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#c9c6bf', side: THREE.DoubleSide, roughness: 0.9 }));
    th.position.set(T.x, 1.5, T.z);
    th.castShadow = true;
    sc.add(th);
    const thW = new THREE.Mesh(new THREE.CircleGeometry(R_THICK - 0.1, 40), new THREE.MeshStandardMaterial({ color: '#7d6f57', roughness: 0.4 }));
    thW.rotation.x = -Math.PI / 2;
    thW.position.set(T.x, 2.7, T.z);
    sc.add(thW);
    this.thickBlanket = new THREE.Mesh(new THREE.CylinderGeometry(R_THICK - 0.1, R_THICK - 0.1, 1, 40), new THREE.MeshStandardMaterial({ color: SLUDGE_C, roughness: 1 }));
    this.thickBlanket.position.set(T.x, 0.8, T.z);
    sc.add(this.thickBlanket);
    const pk = new THREE.Mesh(new THREE.BoxGeometry(R_THICK * 2 - 0.6, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: '#d9d6cf' }));
    pk.position.y = 3.3;
    this.pickets.add(pk);
    for (let k = -3; k <= 3; k++) {
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.08), new THREE.MeshStandardMaterial({ color: '#6b7177' }));
      rod.position.set(k * 0.6, 1.6, 0);
      this.pickets.add(rod);
    }
    this.pickets.position.set(T.x, 0, T.z);
    sc.add(this.pickets);
    pick(th, 'espesador');
    // digestores: dos tanques altos con cúpula
    const G = PT.digestor;
    const dm = new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 0.7 });
    const roofM = new THREE.MeshStandardMaterial({ color: '#a9b3a3', roughness: 0.6 });
    for (const dx of [-7, 7]) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 9, 36), dm);
      body.position.set(G.x + dx, 4.5, G.z);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(5.2, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2), roofM);
      dome.scale.y = 0.35;
      dome.position.set(G.x + dx, 9, G.z);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(5.25, 5.25, 0.5, 36), new THREE.MeshStandardMaterial({ color: '#2f6fa8' }));
      band.position.set(G.x + dx, 7.6, G.z);
      for (const o of [body, dome]) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
      sc.add(body, dome, band);
      pick(body, 'digestor');
      pick(dome, 'digestor');
    }
    const gallery = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 4), conc);
    gallery.position.set(G.x, 1.7, G.z);
    sc.add(gallery);
    // gasómetro de membrana: su cúpula se infla con el biogás del día
    const gx = G.x + 19;
    const gb = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 1, 32), conc);
    gb.position.set(gx, 0.5, G.z);
    this.gasDome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e7ecd9', roughness: 0.5 }));
    this.gasDome.position.set(gx, 1, G.z);
    this.gasDome.castShadow = true;
    sc.add(gb, this.gasDome);
    pick(this.gasDome, 'digestor');
    // motor-generador y tea
    const gen = houses([{ x: gx + 11, y: 0, z: G.z, w: 6, d: 4.4, h: 3.4, rot: 0, wall: '#dfe3e6' }]);
    sc.add(gen);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3), new THREE.MeshStandardMaterial({ color: '#6b7177' }));
    stack.position.set(gx + 12.5, 4.6, G.z - 1);
    sc.add(stack);
    const gs = this.signBoard('Biogás → electricidad', '', 4, 0.7, '#3f7a4a');
    gs.position.set(gx + 11, 2.5, G.z + 2.25);
    sc.add(gs);
    pick(gen, 'digestor');
    const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 8, 10), new THREE.MeshStandardMaterial({ color: '#8f969b', metalness: 0.4 }));
    flare.position.set(gx + 5, 4, G.z - 6.5);
    sc.add(flare);
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ff7a1f', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.9, 10), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.y = -0.3;
    this.flame.add(core);
    this.flame.position.set(gx + 5, 8.75, G.z - 6.5);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.4, 10), new THREE.MeshStandardMaterial({ color: '#4a4f54' }));
    tip.position.set(gx + 5, 8.1, G.z - 6.5);
    sc.add(this.flame, tip);
    // deshidratación: cubierta abierta con la centrífuga y el contenedor de biosólido
    const W = PT.deshidratacion;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 9), concreteMaterial('#a8aaa6'));
    roof.position.set(W.x, 5.6, W.z);
    roof.castShadow = true;
    sc.add(roof);
    for (const [dx, dz2] of [[-6.6, -4.2], [6.6, -4.2], [-6.6, 4.2], [6.6, 4.2]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.6, 0.4), conc);
      post.position.set(W.x + dx, 2.8, W.z + dz2);
      sc.add(post);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.4, 1.8), new THREE.MeshStandardMaterial({ color: '#2f6fa8' }));
    base.position.set(W.x - 2, 0.7, W.z - 1);
    sc.add(base);
    const drumM = new THREE.MeshStandardMaterial({ color: '#b9c0c6', metalness: 0.6, roughness: 0.35 });
    const drumBody = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 5, 18), drumM);
    drumBody.rotation.z = Math.PI / 2;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: '#3a3d40' }));
    stripe.position.y = 0.72;
    this.drum.add(drumBody, stripe);
    this.drum.position.set(W.x - 2, 2.2, W.z - 1);
    sc.add(this.drum);
    const chute = new THREE.Mesh(new THREE.BoxGeometry(1, 0.15, 2.6), new THREE.MeshStandardMaterial({ color: '#7e8a92' }));
    chute.position.set(W.x + 1.4, 1.6, W.z + 0.6);
    chute.rotation.x = 0.5;
    sc.add(chute);
    const bin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.8, 2.6), new THREE.MeshStandardMaterial({ color: '#8a5a3a', roughness: 0.8 }));
    bin.position.set(W.x + 2.6, 0.9, W.z + 2.4);
    sc.add(bin);
    this.cake = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1, 2.2), new THREE.MeshStandardMaterial({ color: '#4a3624', roughness: 1 }));
    this.cake.position.set(W.x + 2.6, 1.2, W.z + 2.4);
    sc.add(this.cake);
    for (const o of [roof, base, bin, drumBody]) pick(o, 'deshidratacion');
  }

  /** Tuberías entre las partes (agua en azul, lodo en café, biogás en amarillo). */
  private buildPipes(): void {
    const water = new THREE.MeshStandardMaterial({ color: '#4f6d86', roughness: 0.5 });
    const sludge = new THREE.MeshStandardMaterial({ color: '#6b5134', roughness: 0.6 });
    const gas = new THREE.MeshStandardMaterial({ color: '#d6b13a', roughness: 0.5 });
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const D = PT.desarenador, P = PT.primario, Rx = PT.reactor, S = PT.secundario, U = PT.uv;
    for (const line2 of [false, true]) {
      const dz = line2 ? LZ2 : 0;
      const into = line2 ? this.line2 : undefined;
      const w = (pts: THREE.Vector3[]) => this.pipePath(pts, 0.35, water, into);
      if (!line2) w([V(D.x + 7, 1.2, 0), V(P.x - R_PRIM - 0.3, 1.2, 0)]);
      else w([V(D.x + 8.5, 1.2, 0), V(D.x + 8.5, 1.2, dz), V(P.x - R_PRIM - 0.3, 1.2, dz)]);
      w([V(P.x + R_PRIM + 0.3, 1.2, dz), V(Rx.x - 12, 1.2, dz)]);
      w([V(Rx.x + 12, 1.2, dz), V(S.x - R_SEC - 0.3, 1.2, dz)]);
      if (!line2) w([V(S.x + R_SEC + 0.3, 1.2, 0), V(U.x - 5.5, 1.2, 0)]);
      else w([V(S.x + R_SEC + 0.3, 1.2, dz), V(S.x + R_SEC + 4.5, 1.2, dz), V(S.x + R_SEC + 4.5, 1.2, -1.2)]);
      // recirculación del lodo (del secundario al reactor) y lodo primario al espesador
      const s = (pts: THREE.Vector3[]) => this.pipePath(pts, 0.25, sludge, into);
      s([V(S.x, 0.5, dz - R_SEC - 1), V(Rx.x - 10, 0.5, dz - R_SEC - 1), V(Rx.x - 10, 0.5, dz - 6.2)]);
      s([V(P.x - R_PRIM - 0.3, 0.4, dz - 2), V(P.x - R_PRIM - 2.6, 0.4, dz - 2)]);
      s([V(S.x + R_SEC + 0.3, 0.4, dz - 2), V(S.x + R_SEC + 2.2, 0.4, dz - 2)]);
    }
    const s = (pts: THREE.Vector3[]) => this.pipePath(pts, 0.25, sludge);
    const T = PT.espesador, G = PT.digestor, W = PT.deshidratacion;
    s([V(P.x - R_PRIM - 2.6, 0.4, -2), V(P.x - R_PRIM - 2.6, 0.4, T.z), V(T.x - R_THICK, 0.4, T.z)]);
    s([V(S.x + R_SEC + 2.2, 0.4, -2), V(S.x + R_SEC + 2.2, 0.4, -47), V(T.x, 0.4, -47), V(T.x, 0.4, T.z + R_THICK)]);
    s([V(T.x + R_THICK, 0.4, T.z), V(G.x - 12.2, 0.4, T.z)]);
    s([V(G.x + 7, 0.4, G.z + 5.2), V(G.x + 7, 0.4, G.z + 6.4), V(W.x - 6, 0.4, G.z + 6.4), V(W.x - 4, 0.4, W.z)]);
    this.pipePath([V(G.x + 7, 9.6, G.z), V(G.x + 7, 10.4, G.z), V(G.x + 19, 10.4, G.z), V(G.x + 19, 4.6, G.z)], 0.2, gas);
    this.pipePath([V(G.x - 7, 9.6, G.z), V(G.x - 7, 10.4, G.z), V(G.x + 7, 10.4, G.z)], 0.2, gas);
    this.pipePath([V(G.x + 23, 1.6, G.z), V(G.x + 27.9, 1.6, G.z)], 0.2, gas);
  }

  /** Recorridos de las flechas: agua (color de la etapa), lodo, biogás y aliviadero. */
  private buildChevrons(): void {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const D = PT.desarenador, P = PT.primario, Rx = PT.reactor, S = PT.secundario, U = PT.uv, L = PT.llegada;
    const add = (pts: THREE.Vector3[], kind: Seg['kind'], from: Seg['from'], line2 = false) => {
      for (let i = 0; i < pts.length - 1; i++) this.segs.push({ a: pts[i], b: pts[i + 1], kind, from, line2 });
    };
    add([V(L.x + 3.5, 3.2, 0), V(D.x - 7, 3.2, 0)], 'agua', 'raw');
    add([V(D.x + 7, 1.95, 0), V(P.x - R_PRIM - 0.3, 1.95, 0)], 'agua', 'pre');
    add([V(P.x + R_PRIM + 0.3, 1.95, 0), V(Rx.x - 12, 1.95, 0)], 'agua', 'prim');
    add([V(Rx.x + 12, 1.95, 0), V(S.x - R_SEC - 0.3, 1.95, 0)], 'agua', 'liquor');
    add([V(S.x + R_SEC + 0.3, 1.95, 0), V(U.x - 5.5, 1.95, 0)], 'agua', 'sec');
    add([V(D.x + 8.5, 1.95, -1), V(D.x + 8.5, 1.95, LZ2), V(P.x - R_PRIM - 0.3, 1.95, LZ2)], 'agua', 'pre', true);
    add([V(P.x + R_PRIM + 0.3, 1.95, LZ2), V(Rx.x - 12, 1.95, LZ2)], 'agua', 'prim', true);
    add([V(Rx.x + 12, 1.95, LZ2), V(S.x - R_SEC - 0.3, 1.95, LZ2)], 'agua', 'liquor', true);
    add([V(S.x + R_SEC + 0.3, 1.95, LZ2), V(S.x + R_SEC + 4.5, 1.95, LZ2), V(S.x + R_SEC + 4.5, 1.95, -1.2)], 'agua', 'sec', true);
    add([V(L.x, 2.8, 4), V(L.x, 0.7, RIVER_Z - 8.6)], 'aliviadero', 'raw');
    add([V(U.x - 5.5, 1.85, 0), V(PT.descarga.x, 1.85, 0)], 'agua', 'eff');
    add([V(PT.descarga.x, 1.4, 1.4), V(PT.descarga.x, 0.5, RIVER_Z - 8.6)], 'agua', 'eff');
    for (const line2 of [false, true]) {
      const dz = line2 ? LZ2 : 0;
      add([V(S.x, 1.05, dz - R_SEC - 1), V(Rx.x - 10, 1.05, dz - R_SEC - 1), V(Rx.x - 10, 1.05, dz - 6.2)], 'lodo', 'liquor', line2);
    }
    const T = PT.espesador, G = PT.digestor, W = PT.deshidratacion;
    add([V(P.x - R_PRIM - 2.6, 0.95, -2), V(P.x - R_PRIM - 2.6, 0.95, T.z), V(T.x - R_THICK, 0.95, T.z)], 'lodo', 'liquor');
    add([V(S.x + R_SEC + 2.2, 0.95, -2), V(S.x + R_SEC + 2.2, 0.95, -47), V(T.x, 0.95, -47), V(T.x, 0.95, T.z + R_THICK)], 'lodo', 'liquor');
    add([V(T.x + R_THICK, 0.95, T.z), V(G.x - 12.2, 0.95, T.z)], 'lodo', 'liquor');
    add([V(G.x + 7, 0.95, G.z + 6.4), V(W.x - 6, 0.95, G.z + 6.4)], 'lodo', 'liquor');
    add([V(G.x - 7, 10.95, G.z), V(G.x + 19, 10.95, G.z)], 'gas', 'liquor');
    const shape = new THREE.Shape();
    shape.moveTo(0.55, 0);
    shape.lineTo(-0.36, 0.4);
    shape.lineTo(-0.14, 0);
    shape.lineTo(-0.36, -0.4);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    this.segs.forEach((sg, s) => {
      const n = Math.max(1, Math.floor(sg.a.distanceTo(sg.b) / 2.6));
      for (let k = 0; k < n; k++) this.chevSlots.push({ seg: s, k, n });
    });
    this.chev = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.18 }), this.chevSlots.length);
    this.chev.frustumCulled = false;
    this.chev.renderOrder = 4;
    this.stage.scene.add(this.chev);
  }

  /** Barrios en la loma de la izquierda, de donde baja el colector. */
  private buildNeighborhood(): void {
    const R = rng(77);
    const spots: HouseSpot[] = [];
    const walls = ['#efe0c0', '#f0c9a2', '#cfe1d4', '#bcd6e6', '#f2d27a', '#e9b9c2', '#b4603f', '#c06c48'];
    for (let k = 0; k < 70; k++) {
      const x = -136 - R() * 70, z = -66 + R() * 90;
      if (Math.abs(z + 30) < 3 && x > -152) continue;
      spots.push({ x, y: hillH(x, z) - 0.3, z, w: 4 + R() * 3, d: 4 + R() * 3, h: 3 + R() * 4, rot: (R() - 0.5) * 0.5, wall: walls[k % walls.length] });
    }
    const hs = houses(spots);
    hs.castShadow = true;
    this.stage.scene.add(hs);
  }

  /** Losas de concreto bajo cada grupo de tanques, vías internas y externas, andén, postes de luz y arbustos. */
  private buildGrounds(): void {
    const sc = this.stage.scene;
    const pad = (cx: number, cz: number, w: number, d: number, color = '#c6c2b8') => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), concreteMaterial(color));
      m.position.set(cx, 0.05, cz);
      m.receiveShadow = true;
      sc.add(m);
    };
    pad(-84, -1, 44, 18);
    pad(-21, -1.5, 86, 25);
    pad(37, 0, 20, 8);
    pad(-8, -58, 112, 22);
    pad(36, -25, 18, 12);
    pad(-23, 13, 134, 2.4, '#d8d4ca'); // andén frente a los tanques
    const asphalt = new THREE.MeshStandardMaterial({ color: '#5d5f63', roughness: 0.95 });
    const road = (cx: number, cz: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), asphalt);
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, 0.04, cz);
      m.receiveShadow = true;
      sc.add(m);
    };
    road(-3, -43.5, 118, 5);
    road(56, -32, 6, 80);
    road(66, -60, 26, 6);
    road(76, -100, 6, 86);
    // postes de luz a lo largo de las vías
    const poleM = new THREE.MeshStandardMaterial({ color: '#7d858c', metalness: 0.4, roughness: 0.5 });
    const headM = new THREE.MeshStandardMaterial({ color: '#f4f1e6', emissive: new THREE.Color('#fff2c4'), emissiveIntensity: 0.25 });
    const spots: [number, number][] = [];
    for (let x = -56; x <= 48; x += 20) spots.push([x, -40.6]);
    for (let z = -66; z <= 6; z += 18) spots.push([59.4, z]);
    for (const [x, z] of spots) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), poleM);
      pole.position.set(x, 3, z);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.35), headM);
      head.position.set(x, 6, z);
      pole.castShadow = true;
      sc.add(pole, head);
    }
    // arbustos dentro de la cerca
    const R = rng(23);
    const ts: TreeSpot[] = [];
    for (let x = -108; x <= 54; x += 7) ts.push({ x: x + R() * 2, y: 0, z: -70 + R() * 0.8, r: 1 + R() * 0.6 });
    for (let z = -64; z <= 10; z += 7) ts.push({ x: -111 + R() * 0.8, y: 0, z: z + R() * 2, r: 1 + R() * 0.6 });
    sc.add(trees(ts, 31));
  }

  /** Laboratorio y oficinas, letrero de la escena y cerca del predio. */
  private buildSite(): void {
    const sc = this.stage.scene;
    const lab = houses([{ x: 36, y: 0, z: -25, w: 13, d: 7, h: 5, rot: 0, wall: '#ebe5d6' }]);
    sc.add(lab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.35, 7.8), concreteMaterial('#a8aaa6'));
    roof.position.set(36, 5.3, -25);
    roof.castShadow = true;
    sc.add(roof);
    const board = this.signBoard('Planta de aguas residuales', 'escena ilustrativa · no es una planta real', 10, 2.8, '#1f5f8b');
    const sign = new THREE.Group();
    board.position.set(0, 3.6, 0.1);
    sign.add(board);
    const postM = new THREE.MeshStandardMaterial({ color: '#5a6168' });
    for (const dx of [-4.2, 4.2]) {
      const pst = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6), postM);
      pst.position.set(dx, 2.3, 0);
      sign.add(pst);
    }
    sign.position.set(-120, 0, 14);
    sign.rotation.y = 0.45;
    sc.add(sign);
    const posts: THREE.Vector3[] = [];
    const wires: THREE.Matrix4[] = [];
    const run = (x0: number, z0: number, x1: number, z1: number) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 3));
      for (let k = 0; k <= n; k++) posts.push(new THREE.Vector3(x0 + ((x1 - x0) * k) / n, 0.9, z0 + ((z1 - z0) * k) / n));
      const ang = Math.atan2(x1 - x0, z1 - z0);
      for (const y of [0.55, 1.15, 1.7]) wires.push(new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, y, (z0 + z1) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(0.03, 0.03, L)));
    };
    run(-114, -72, 62, -72);
    run(-114, -72, -114, 20);
    run(62, -72, 62, -64);
    run(62, -56, 62, 20);
    const fm = new THREE.MeshStandardMaterial({ color: '#7d858c', metalness: 0.4, roughness: 0.5 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const pim = new THREE.InstancedMesh(unit, fm, posts.length);
    posts.forEach((pp, i) => pim.setMatrixAt(i, new THREE.Matrix4().compose(pp, new THREE.Quaternion(), new THREE.Vector3(0.1, 1.8, 0.1))));
    const wim = new THREE.InstancedMesh(unit, fm, wires.length);
    wires.forEach((mm, i) => wim.setMatrixAt(i, mm));
    sc.add(pim, wim);
  }

  private terrain(): THREE.Mesh {
    const g = new THREE.PlaneGeometry(820, 640, 164, 128);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const grass = new THREE.Color('#5e8f3c'), forest = new THREE.Color('#3b6a30'), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = hillH(x, z);
      pos.setY(i, h > 0.01 ? h : -0.05);
      c.copy(grass).lerp(forest, smooth(2, 18, h) * (0.5 + 0.5 * noise2(x / 40, z / 40)));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    m.receiveShadow = true;
    return m;
  }

  private paint(mesh: THREE.Mesh, color: THREE.Color): void {
    const a = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) a.setXYZ(i, color.r, color.g, color.b);
    a.needsUpdate = true;
  }

  private setFoam(mesh: THREE.Mesh, f: number): void {
    const a = mesh.geometry.getAttribute('aFoam') as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) a.setX(i, f);
    a.needsUpdate = true;
  }

  // ------------------------------------------------------------------ estado

  private colorOf(from: Seg['from'], out: THREE.Color): THREE.Color {
    const r = this.v!.r;
    switch (from) {
      case 'raw':
        return waterCol(r.raw.sst, out);
      case 'pre':
        return waterCol(r.pre.sst, out);
      case 'prim':
        return waterCol(r.prim.sst, out);
      case 'liquor':
        return r.reactor.washout ? out.copy(DEAD) : out.copy(LIQUOR);
      case 'sec':
        return waterCol(r.sec.sst, out);
      case 'eff':
        return waterCol(r.eff.sst, out);
    }
  }

  set(v: PtarView): void {
    this.v = v;
    const { r, inp } = v;
    const c = new THREE.Color();
    const two = inp.lines === 2;
    for (const o of this.line2) o.visible = two;
    this.padSign.visible = !two;
    // agua en cada parte
    this.paint(this.chamberSurf, waterCol(r.raw.sst, c).multiplyScalar(0.55));
    for (const ch of this.channelSurfs) this.paint(ch.mesh, this.colorOf(ch.from, c).multiplyScalar(0.55));
    this.paint(this.desSurf, waterCol(r.pre.sst, c).multiplyScalar(0.55));
    (this.desWater.material as THREE.MeshStandardMaterial).color.copy(waterCol(r.pre.sst, c));
    this.paint(this.uvSurf, waterCol(r.sec.sst, c).multiplyScalar(0.55));
    for (const s of this.cascade) this.paint(s, waterCol(r.eff.sst, c).multiplyScalar(0.6));
    this.bypassSheet.visible = r.Qbypass > 0;
    this.paint(this.bypassSheet, waterCol(r.raw.sst, c).multiplyScalar(0.6));
    // arena y grasa del desarenador
    const sandH = { seco: 0.25, lluvia: 0.5, aguacero: 0.9 }[inp.weather];
    this.sand.scale.y = sandH;
    this.sand.position.set(PT.desarenador.x, 0.35 + sandH / 2, 0);
    this.grease.scale.z = 0.4 + 0.6 * Math.min(1, r.fogKgD / 250);
    // primario y secundario: color del agua, lodo en el fondo y si está en servicio
    for (const rd of this.rounds) {
      const prim = rd.r === R_PRIM;
      const sst = prim ? (inp.primary ? r.prim.sst : r.pre.sst) : r.sec.sst;
      this.paint(rd.surf, waterCol(sst, c).multiplyScalar(0.42));
      const vm = rd.water.material as THREE.MeshStandardMaterial;
      vm.color.copy(waterCol(sst, c)).multiplyScalar(0.85);
      vm.opacity = 0.62 + 0.25 * Math.min(1, Math.sqrt(sst / 250));
      let bh: number;
      if (prim) bh = inp.primary ? 0.25 + Math.min(0.9, r.sludge.primaryKgD / Math.max(1, inp.lines) / 1500) : 0.05;
      else bh = r.reactor.washout ? 0.05 : Math.min(H_ROUND - 1.2, 0.3 + (r.reactor.sv30 / 1000) * 1.6 + (r.reactor.bulking ? 0.6 : 0));
      rd.blanket.scale.y = bh;
      rd.blanket.position.y = 0.1 + bh / 2;
      (rd.blanket.material as THREE.MeshStandardMaterial).color.copy(prim ? SLUDGE_C : r.reactor.washout ? DEAD : LIQUOR);
    }
    // reactor: licor mixto (café si hay bacterias; gris si se lavaron) y espuma según el aire
    for (const rc of this.reactors) {
      const col = r.reactor.washout ? DEAD : LIQUOR;
      this.paint(rc.surf, c.copy(col).multiplyScalar(0.7));
      const vm = rc.water.material as THREE.MeshStandardMaterial;
      vm.color.copy(col);
      vm.opacity = r.reactor.washout ? 0.55 : 0.78;
      this.setFoam(rc.surf, inp.air <= 0 ? 0.02 : Math.min(0.75, 0.18 + inp.air * 0.1 + (r.reactor.bulking ? 0.3 : 0)));
    }
    // luz ultravioleta
    this.uvLamps.emissiveIntensity = inp.uv ? 1.4 : 0;
    this.uvLamps.color.set(inp.uv ? '#c9b3ff' : '#7d8794');
    this.uvGlow.visible = inp.uv;
    // lodos: espesador, gasómetro, tea y biosólido
    const tk = 0.3 + Math.min(1.6, (r.sludge.primaryKgD + r.sludge.wasKgD) / 3000);
    this.thickBlanket.scale.y = tk;
    this.thickBlanket.position.y = 0.2 + tk / 2;
    this.gasDome.scale.y = 0.35 + Math.min(0.65, r.sludge.biogasM3D / 1500);
    const ck = 0.15 + Math.min(1.4, r.sludge.cakeTD / 8);
    this.cake.scale.y = ck;
    this.cake.position.y = 0.1 + ck / 2;
    // lluvia
    this.rainK = { seco: 0, lluvia: 0.55, aguacero: 1 }[inp.weather];
    this.rain.visible = this.rainK > 0;
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.3 + 0.4 * this.rainK;
    this.stage.weather(this.rainK);
    // río: pluma de la descarga y del aliviadero
    this.paintRiver();
    // flechas: color de la etapa
    for (let i = 0; i < this.chevSlots.length; i++) {
      const sg = this.segs[this.chevSlots[i].seg];
      if (sg.kind === 'lodo') c.set('#a07a4c');
      else if (sg.kind === 'gas') c.set('#f0d060');
      else this.colorOf(sg.from, c).lerp(WHITE, 0.35);
      this.chev.setColorAt(i, c);
    }
    if (this.chev.instanceColor) this.chev.instanceColor.needsUpdate = true;
    if (v.unit) {
      const p = PT[v.unit];
      const big = v.unit === 'reactor' ? 14 : v.unit === 'secundario' ? 10.5 : v.unit === 'primario' ? 9 : 7.5;
      this.ring.scale.setScalar(big / 9);
      this.ring.position.set(p.x, 0.1, p.z);
      this.ring.visible = true;
    } else this.ring.visible = false;
    this.stage.setLabels(this.labels());
  }

  /** Color del río: limpio aguas arriba; aguas abajo de cada vertimiento, una pluma pegada a la orilla que se
   *  abre y se diluye con la distancia (ilustrativa, con el color del agua que le llega). */
  private paintRiver(): void {
    const r = this.v!.r;
    const g = this.river.geometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const col = g.getAttribute('color') as THREE.BufferAttribute;
    const foam = g.getAttribute('aFoam') as THREE.BufferAttribute;
    const effC = waterCol(r.eff.sst + (r.reactor.washout ? 120 : 0)), byC = waterCol(r.raw.sst + 60);
    const base = RIVER_OK.clone().lerp(SEWAGE, Math.min(0.5, WEATHER[r.inp.weather].river.sst / 500));
    const strengthE = Math.min(1, (r.Qtreat / 86400 / Math.max(0.05, r.river.Q)) * 4) * (r.reactor.washout ? 1 : 0.55);
    const strengthB = Math.min(1, (r.Qbypass / 86400 / Math.max(0.05, r.river.Q)) * 5);
    const c = new THREE.Color();
    const ox = this.river.position.x;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + ox, z = pos.getZ(i);
      c.copy(base);
      const plume = (x0: number, k: number, src: THREE.Color) => {
        const dx = x - x0;
        if (dx < 0 || k <= 0) return;
        const sig = 1.2 + dx * 0.05;
        const w = Math.exp(-((z + 7.2) ** 2) / (2 * sig * sig)) * Math.exp(-dx / 220) * Math.min(1, dx / 2 + 0.3) * k;
        c.lerp(src, Math.min(0.85, w));
      };
      plume(PT.descarga.x, strengthE, effC);
      plume(PT.llegada.x, strengthB, byC);
      c.multiplyScalar(0.62);
      col.setXYZ(i, c.r, c.g, c.b);
      // espuma en las orillas y donde caen las gradas y el aliviadero
      const near = (x0: number) => Math.exp(-((x - x0) ** 2) / 8) * Math.exp(-((z + 7) ** 2) / 4);
      foam.setX(i, this.riverBase[i] + 0.7 * near(PT.descarga.x) + (r.Qbypass > 0 ? 0.8 * near(PT.llegada.x) : 0));
    }
    col.needsUpdate = true;
    foam.needsUpdate = true;
  }

  private labels(): StageLabel[] {
    const { r, inp, unit } = this.v!;
    const es = (v: number, d = 0) => v.toLocaleString('es-CO', { maximumFractionDigits: d });
    const sub: Record<PtarUnitId, { s: string; k: StageLabel['kind'] }> = {
      llegada: r.Qbypass > 0 ? { s: `¡rebosa! ${es(r.bypassPct)} % sin tratar`, k: 'alerta' } : { s: `${es((r.Qin * 1000) / 86400)} L/s`, k: 'dato' },
      rejas: { s: `${es(r.trashLD)} L de basura/día`, k: 'dato' },
      desarenador: { s: 'arena y grasa', k: 'dato' },
      primario: inp.primary ? { s: `sólidos ${es(r.prim.sst)} mg/L`, k: 'dato' } : { s: 'fuera de servicio', k: 'alerta' },
      reactor: r.reactor.washout
        ? { s: '¡sin bacterias!', k: 'alerta' }
        : r.reactor.bulking
          ? { s: 'lodo con hilos', k: 'alerta' }
          : { s: `aire ${es(inp.air, 1)} mg/L`, k: 'dato' },
      secundario: { s: `sólidos ${es(r.sec.sst)} mg/L`, k: r.sec.sst > 70 ? 'alerta' : 'dato' },
      uv: inp.uv ? { s: 'encendida', k: 'dato' } : { s: 'apagada', k: 'alerta' },
      descarga: r.complies ? { s: 'cumple la norma', k: 'ok' } : { s: 'no cumple la norma', k: 'alerta' },
      espesador: { s: `${es(r.sludge.primaryKgD + r.sludge.wasKgD)} kg/día`, k: 'dato' },
      digestor: { s: `${es(r.sludge.biogasM3D)} m³ de biogás/día`, k: 'dato' },
      deshidratacion: { s: `${es(r.sludge.cakeTD, 1)} t/día`, k: 'dato' },
    };
    const H: Partial<Record<PtarUnitId, number>> = { llegada: 4.6, rejas: 6, desarenador: 5, primario: 6, reactor: 7.5, secundario: 6, uv: 4.6, descarga: 3.4, espesador: 5.4, digestor: 13.5, deshidratacion: 8 };
    const out: StageLabel[] = PTAR_UNITS.map((u, i) => {
      const p = PT[u.id];
      const y = (H[u.id] ?? 5) + (i % 2 && unit !== u.id ? LABEL_LIFT : 0);
      return { id: u.id, text: `${u.n}. ${u.tag}`, sub: sub[u.id].s, at: new THREE.Vector3(p.x, y, p.z), kind: sub[u.id].k, prio: unit === u.id ? 9 : u.id === 'descarga' ? 8 : 4 };
    });
    out.push({
      id: 'rio',
      text: 'El río',
      sub: r.river.fishOk ? `peces: sí · oxígeno mín. ${es(r.river.minDO, 1)} mg/L` : `peces: no · oxígeno mín. ${es(r.river.minDO, 1)} mg/L`,
      at: new THREE.Vector3(PT.descarga.x + 30, 2.4, RIVER_Z),
      kind: r.river.fishOk ? 'ok' : 'alerta',
      prio: 6,
    });
    return out;
  }

  update(dt: number, t: number): void {
    const v = this.v;
    if (!v) return;
    const { r, inp } = v;
    this.waterTime.value = t;
    // puentes de los sedimentadores (una vuelta en unos minutos de verdad; aquí, más rápido), varillas del
    // espesador, rastrillo de las rejas y tambor de la centrífuga
    for (const rd of this.rounds) rd.bridge.rotation.y = t * (rd.r === R_PRIM ? 0.06 : 0.045) + (rd.line2 ? 1.7 : 0);
    this.pickets.rotation.y = t * 0.08;
    this.drum.rotation.x = t * 9;
    const Rj = PT.rejas;
    const ph = (t * 0.18) % 1;
    const rk = ph < 0.5 ? ph * 2 : 2 - ph * 2;
    this.rake.position.set(Rj.x - 0.4 - rk * 1.6, 0.6 + rk * 3.2, Rj.z);
    // tea: una llama piloto que titila
    const fl = 0.85 + 0.15 * Math.sin(t * 13) + 0.08 * Math.sin(t * 29);
    this.flame.scale.set(fl, fl * (0.8 + Math.min(0.6, r.sludge.biogasM3D / 2000)), fl);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    // flechas
    const up = new THREE.Vector3(0, 1, 0);
    this.chevSlots.forEach((sl, i) => {
      const sg = this.segs[sl.seg];
      const off = (sg.line2 && inp.lines !== 2) || (sg.kind === 'aliviadero' && r.Qbypass <= 0);
      if (off) {
        this.chev.setMatrixAt(i, zero);
        return;
      }
      const L = sg.a.distanceTo(sg.b);
      const speed = sg.kind === 'lodo' ? 0.9 : sg.kind === 'gas' ? 1.6 : 2.4;
      const u = (sl.k / sl.n + (t * speed) / L) % 1;
      p.copy(sg.a).lerp(sg.b, u);
      const d = sg.b.clone().sub(sg.a);
      q.setFromAxisAngle(up, Math.atan2(-d.z, d.x));
      this.chev.setMatrixAt(i, m4.compose(p, q, s));
    });
    this.chev.instanceMatrix.needsUpdate = true;
    // burbujas del reactor: más con más aire
    const nb = Math.round(Math.min(160, inp.air * 40));
    let k1 = 0, k2 = 0;
    this.bubbleSlots.forEach((b, i) => {
      const n = b.line2 ? k2++ : k1++;
      if (n >= nb || (b.line2 && inp.lines !== 2)) {
        this.bubbles.setMatrixAt(i, zero);
        return;
      }
      const ph2 = (t * 0.45 + b.ph) % 1;
      this.bubbles.setMatrixAt(i, m4.compose(p.set(b.x + 0.2 * Math.sin(t * 2 + i), 0.6 + ph2 * (H_REACT - 1.1), b.z), q.identity(), s.setScalar(0.6 + ph2 * 0.8)));
    });
    this.bubbles.instanceMatrix.needsUpdate = true;
    s.set(1, 1, 1);
    // basura atajada en las rejas y en el contenedor
    const nT = Math.round(Math.min(48, 7 * Math.log10(r.trashLD + 1)));
    const Rt = rng(13);
    for (let k = 0; k < 48; k++) {
      const a = Rt(), b = Rt(), c = Rt();
      if (k >= nT) {
        this.trash.setMatrixAt(k, zero);
        continue;
      }
      if (k % 3 === 2) p.set(Rj.x - 1.8 + (a - 0.5) * 2.4, 1.65 + b * 0.25, Rj.z - 6.2 + (c - 0.5) * 1.8);
      else {
        const hh = 0.5 + b * 1.6;
        p.set(Rj.x - 0.25 - hh * 0.48, 0.3 + hh, Rj.z - 1 + a * 2);
      }
      q.setFromEuler(new THREE.Euler(a * 3, b * 3, c * 3));
      this.trash.setMatrixAt(k, m4.compose(p, q, s));
    }
    this.trash.instanceMatrix.needsUpdate = true;
    // peces del río: aguas arriba siempre; frente a la planta y aguas abajo solo si el río los aguanta
    for (let k = 0; k < this.fish.count; k++) {
      const down = k >= 8;
      if (down && !r.river.fishOk) {
        this.fish.setMatrixAt(k, zero);
        continue;
      }
      const x0 = down ? -60 + (k - 8) * 9 : -200 + k * 9;
      const x = x0 + ((t * (0.6 + (k % 3) * 0.2) + k * 3) % 14) - 7;
      const z = RIVER_Z - 4 + ((k * 37) % 9);
      q.setFromAxisAngle(up, 0.15 * Math.sin(t * 2 + k));
      this.fish.setMatrixAt(k, m4.compose(p.set(x, -0.25, z), q, s.set(1.1, 1.1, 1.1)));
    }
    this.fish.instanceMatrix.needsUpdate = true;
    // basura que el aliviadero manda al río, flotando aguas abajo
    const nf = r.Qbypass > 0 ? Math.round(Math.min(40, 10 + r.bypassPct * 0.6)) : 0;
    for (let k = 0; k < 40; k++) {
      if (k >= nf) {
        this.floaters.setMatrixAt(k, zero);
        continue;
      }
      const x = PT.llegada.x + ((t * 1.3 + k * 11.7) % 150);
      const z = RIVER_Z - 7 + ((k * 53) % 70) / 10 + 0.4 * Math.sin(t + k);
      q.setFromEuler(new THREE.Euler(0, k + t * 0.3, 0));
      this.floaters.setMatrixAt(k, m4.compose(p.set(x, 0.12, z), q, s.set(1, 1, 1)));
    }
    this.floaters.instanceMatrix.needsUpdate = true;
    // lluvia
    if (this.rainK > 0 && dt > 0) {
      const a = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      const fall = dt * 38;
      for (let i = 0; i < a.count; i += 2) {
        let y = a.getY(i) - fall;
        if (y < 0) y += 60;
        a.setY(i, y);
        a.setY(i + 1, y - 1.6);
      }
      a.needsUpdate = true;
    }
    if (dt > 0) this.ring.rotation.z += dt * 0.5;
  }
}

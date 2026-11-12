// «La red del barrio» en 3D: un barrio ilustrativo de nueve esquinas en una ladera que baja hacia el oriente, con el
// tanque en una loma al occidente. Los tubos van por las calles (dibujados más gruesos que los reales), con su color
// según la velocidad y flechas que avanzan en el sentido del agua. En cada esquina, una columna de vidrio muestra la
// presión como altura de agua a escala.

import * as THREE from 'three';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { houses, noise2, trees, type HouseSpot, type TreeSpot } from '../../quality/three/kit';
import type { Network, NetSolution } from '../network';
import { StorageTank, diorama } from './supplyKit';

const DX = -30, DZ = -110;
/** Cota del terreno en coordenadas de la red (x hacia el oriente, y hacia el sur). */
export function netGround(x: number, y: number): number {
  // la misma pendiente y el mismo ajuste por calle que las cotas de los nudos, más la loma del tanque
  const row = y <= 0 ? 0 : y <= 110 ? -y / 110 : y <= 220 ? -1 + (2 * (y - 110)) / 110 : 1;
  return 22 - 0.0385 * x + row + 9.5 * Math.exp(-((x + 200) ** 2) / 7200 - ((y - 110) ** 2) / 12800) + noise2(x * 0.02, y * 0.02) * 0.3;
}

interface PipeView {
  id: string;
  a: THREE.Vector3;
  b: THREE.Vector3;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
}

export class NetWorld {
  private stage: QStage;
  private tankObj: StorageTank;
  private pipes: PipeView[] = [];
  private cols = new Map<string, { col: THREE.Mesh; base: number; mat: THREE.MeshStandardMaterial; level: number; target: number; x: number; z: number }>();
  private arrows: THREE.InstancedMesh;
  private arrowS: Float32Array;
  private arrowPipe: Int32Array;
  private net: Network | null = null;
  private sol: NetSolution | null = null;
  private pmin = 15;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private labelT = 0;
  readonly views: Record<'general' | 'tanque' | 'arriba', StageView> = {
    general: { eye: [-40, 150, 300], target: [10, 14, 0], fit: 420, portrait: { eye: [-40, 260, 480], target: [10, 14, 0] } },
    tanque: { eye: [-170, 75, 95], target: [-232, 45, 0], fit: 80 },
    arriba: { eye: [10, 360, 30], target: [10, 0, 0] },
  };

  constructor(stage: QStage, net: Network) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(260);
    const green = new THREE.Color('#93bf6c'), street = new THREE.Color('#8f9499');
    const onStreet = (x: number, y: number) => [0, 130, 260].some((c) => Math.abs(x - c) < 5 && y > -6 && y < 226) || [0, 110, 220].some((r) => Math.abs(y - r) < 5 && x > -6 && x < 266) || (Math.abs(y - 110) < 4 && x < 0 && x > -200);
    const terr = diorama((x, z) => netGround(x - DX, z - DZ), -260, 320, -150, 150, 116, 60, (x, z) => (onStreet(x - DX, z - DZ) ? street.clone() : green.clone().multiplyScalar(0.92 + 0.1 * noise2(x * 0.1, z * 0.1))), -4);
    sc.add(terr);
    // casas en las manzanas y árboles alrededor
    const R = (() => {
      let s = 9;
      return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    })();
    const hs: HouseSpot[] = [];
    for (const bx of [0, 130]) for (const by of [0, 110]) for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      const x = bx + 14 + i * 19 + R() * 3, y = by + 14 + j * 22 + R() * 3;
      hs.push({ x: x + DX, y: netGround(x, y), z: y + DZ, w: 9 + R() * 4, d: 9 + R() * 4, h: 4 + R() * 6, rot: (R() - 0.5) * 0.2, wall: ['#e8d9c0', '#c06c48', '#f0c9a2', '#bcd6e6', '#f2d27a', '#efe0c0'][Math.floor(R() * 6)] });
    }
    sc.add(houses(hs));
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 160; k++) {
      const x = -250 + R() * 560, y = -140 + R() * 280 - DZ;
      const inBarrio = x - DX > -10 && x - DX < 270 && y > -10 && y < 230;
      if (inBarrio || onStreet(x - DX, y)) continue;
      ts.push({ x, y: netGround(x - DX, y), z: y + DZ, r: 2 + R() * 2 });
    }
    sc.add(trees(ts, 7));
    // tanque en la loma
    const tn = net.nodes.find((n) => n.id === net.source) as Network['nodes'][number];
    this.tankObj = new StorageTank(9, netGround(tn.x, tn.y) - 0.5, 78);
    this.tankObj.group.position.set(tn.x + DX - 14, 0, tn.y + DZ);
    sc.add(this.tankObj.group);
    // tubos
    const nodeAt = (id: string) => {
      const n = net.nodes.find((m) => m.id === id) as Network['nodes'][number];
      return new THREE.Vector3(n.x + DX, netGround(n.x, n.y) + 0.6, n.y + DZ);
    };
    for (const p of net.pipes) {
      const a = nodeAt(p.a), b = nodeAt(p.b);
      const mat = new THREE.MeshStandardMaterial({ color: '#2f84b5', roughness: 0.4 });
      const len = a.distanceTo(b);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5 + 3 * p.D, 0.5 + 3 * p.D, len, 10), mat);
      mesh.position.copy(a).lerp(b, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      mesh.castShadow = true;
      sc.add(mesh);
      this.pipes.push({ id: p.id, a, b, mesh, mat });
    }
    // columnas de presión en las esquinas
    for (const n of net.nodes) {
      if (n.id === net.source) continue;
      const base = netGround(n.x, n.y) + 0.6;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 62, 14, 1, true), new THREE.MeshStandardMaterial({ color: '#cfe8f2', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
      glass.position.set(n.x + DX, base + 31, n.y + DZ);
      const mat = new THREE.MeshStandardMaterial({ color: '#2f84b5', emissive: '#12466a', emissiveIntensity: 0.3, roughness: 0.25 });
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1, 14), mat);
      col.position.set(n.x + DX, base, n.y + DZ);
      sc.add(glass, col);
      this.cols.set(n.id, { col, base, mat, level: 0, target: 0, x: n.x + DX, z: n.y + DZ });
    }
    // flechas que viajan por los tubos
    const cone = new THREE.ConeGeometry(1.1, 3, 8);
    cone.rotateX(Math.PI / 2);
    this.arrows = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#9fd6ff', emissiveIntensity: 0.6 }), net.pipes.length * 4);
    this.arrows.frustumCulled = false;
    this.arrowS = new Float32Array(net.pipes.length * 4).map((_, k) => (k % 4) / 4);
    this.arrowPipe = new Int32Array(net.pipes.length * 4).map((_, k) => Math.floor(k / 4));
    sc.add(this.arrows);
    stage.view(this.views.general, false);
  }

  set(net: Network, sol: NetSolution, pmin: number): void {
    this.net = net;
    this.sol = sol;
    this.pmin = pmin;
    this.tankObj.setLevel(net.H0);
    const vmax = 2;
    for (const p of this.pipes) {
      const pp = net.pipes.find((x) => x.id === p.id);
      const closed = !!pp?.closed;
      const v = Math.min(1, (sol.V[p.id] ?? 0) / vmax);
      p.mat.color.set(closed ? '#9aa3aa' : new THREE.Color('#a9d4ef').lerp(new THREE.Color('#0d3d66'), v));
      p.mat.emissive.set(closed ? '#5a1d14' : '#000000');
      p.mat.emissiveIntensity = closed ? 0.4 : 0;
    }
    for (const n of net.nodes) {
      const c = this.cols.get(n.id);
      if (!c) continue;
      const pr = sol.p[n.id];
      c.target = Number.isFinite(pr) ? Math.max(0, pr) : 0;
      const stat = net.H0 - n.z;
      c.mat.color.set(!Number.isFinite(pr) ? '#9aa3aa' : pr < pmin ? '#c0392b' : stat > 50 ? '#e67e22' : '#2f84b5');
      if (this.stage.reducedMotion) c.level = c.target;
    }
    this.labels();
  }

  private labels(): void {
    const net = this.net, sol = this.sol;
    if (!net || !sol) return;
    const es = (x: number, d = 0) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const out: StageLabel[] = [];
    const tn = net.nodes.find((n) => n.id === net.source) as Network['nodes'][number];
    const totalQ = net.pipes.filter((p) => p.a === net.source || p.b === net.source).reduce((a, p) => a + Math.abs(sol.Q[p.id]), 0);
    out.push({ id: 'tanque', text: 'Tanque', sub: `agua a ${es(net.H0)} m · salen ${es(totalQ, 1)} L/s`, at: new THREE.Vector3(tn.x + DX - 14, 82, tn.y + DZ), kind: 'lugar', prio: 6 });
    for (const n of net.nodes) {
      const c = this.cols.get(n.id);
      if (!c) continue;
      const pr = sol.p[n.id];
      const ok = Number.isFinite(pr);
      out.push({ id: n.id, text: ok ? `${es(c.level, 0)} m` : 'sin agua', sub: n.id, at: new THREE.Vector3(c.x, c.base + Math.max(4, c.level) + 3, c.z), kind: !ok || pr < this.pmin ? 'alerta' : net.H0 - n.z > 50 ? 'alerta' : 'dato', prio: ok && pr >= this.pmin ? 2 : 4 });
    }
    this.stage.setLabels(out);
  }

  update(dt: number): void {
    const sol = this.sol, net = this.net;
    if (!sol || !net) return;
    const h = Math.min(0.1, Math.max(0, dt));
    let moving = false;
    for (const c of this.cols.values()) {
      if (Math.abs(c.target - c.level) > 1e-3) {
        c.level += (c.target - c.level) * Math.min(1, h * 3);
        moving = true;
      }
      const hh = Math.max(0.05, c.level);
      c.col.scale.y = hh;
      c.col.position.y = c.base + hh / 2;
    }
    this.labelT += h;
    if (moving && this.labelT > 0.3) {
      this.labelT = 0;
      this.labels();
    }
    // flechas: avanzan con la velocidad del agua en su tubo, en el sentido del caudal
    for (let k = 0; k < this.arrowS.length; k++) {
      const p = this.pipes[this.arrowPipe[k]];
      const q = sol.Q[p.id] ?? 0, V = sol.V[p.id] ?? 0;
      const L = p.a.distanceTo(p.b);
      if (Math.abs(q) < 1e-4 || this.stage.reducedMotion) {
        this.arrows.setMatrixAt(k, this.m4.makeScale(0, 0, 0));
        continue;
      }
      this.arrowS[k] = (this.arrowS[k] + (V * 6 * h) / L) % 1;
      const from = q > 0 ? p.a : p.b, to = q > 0 ? p.b : p.a;
      const pos = from.clone().lerp(to, this.arrowS[k]);
      pos.y += 1.6;
      this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().sub(from).normalize());
      this.arrows.setMatrixAt(k, this.m4.compose(pos, this.q, new THREE.Vector3(1, 1, 1)));
    }
    this.arrows.instanceMatrix.needsUpdate = true;
  }
}

// Dibujo de la red de alcantarillado separada y de la sección de control de la quebrada.
//
// Todo lo que cambia lee el estado calculado: la lámina de agua en cada tubería y cámara sale de los
// niveles del modelo; el rebose de una cámara o sumidero, del volumen que la red devolvió a la calle en el
// último paso; la mira de la quebrada muestra el nivel calculado en la sección. La red es didáctica: se
// rotula como tal.

import * as THREE from 'three';
import type { CitySim } from '../sim/engine';
import type { Compiled } from '../sim/compile';
import type { Scenario } from '../sim/scenario';
import { circ, type SewerStepEnv } from '../sim/sewer';
import { SEWER_COLORS } from './sewerColors';

export { SEWER_COLORS, mainPath } from './sewerColors';

type W = (x: number, y: number, z: number, out?: THREE.Vector3) => THREE.Vector3;

interface PipeVis {
  shell: THREE.Mesh;
  water: THREE.Mesh;
  a: THREE.Vector3;
  d: THREE.Vector3;
  up: THREE.Vector3;
  side: THREE.Vector3;
  L: number;
}

export class SewerView {
  /** Bajo la calle (solo con la vista de corte). */
  readonly under = new THREE.Group();
  /** En la superficie (siempre): tapas, ventanas de sumidero, rebose y mira de la quebrada. */
  readonly over = new THREE.Group();
  private pipes: PipeVis[] = [];
  private nodeWater: (THREE.Mesh | null)[] = [];
  private surges: (THREE.Mesh | null)[] = [];
  private lids: (THREE.Mesh | null)[] = [];
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private shellMat: THREE.MeshStandardMaterial[] = [];
  private loadMat: THREE.MeshStandardMaterial;
  private loadWater: THREE.MeshStandardMaterial;
  private waterMat: THREE.MeshStandardMaterial[] = [];
  private surgeMat: THREE.MeshStandardMaterial;
  private m4 = new THREE.Matrix4();
  private v = new THREE.Vector3();
  /** Puntos para rótulos (vista de corte) y de la sección de la quebrada. */
  readonly anchors: { id: string; text: string; at: THREE.Vector3; cutOnly: boolean; priority: number }[] = [];

  constructor(
    private readonly sc: Scenario,
    private readonly c: Compiled,
    private readonly w: W,
    private readonly groundAt: (x: number, y: number) => number,
    erradasOn: boolean,
  ) {
    const s = c.sewer;
    const unitCyl = this.geo(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true));
    const unitCylClosed = this.geo(new THREE.CylinderGeometry(1, 1, 1, 14));
    const unitBox = this.geo(new THREE.BoxGeometry(1, 1, 1));
    this.loadMat = this.mat(new THREE.MeshStandardMaterial({ color: SEWER_COLORS.carga, emissive: new THREE.Color(SEWER_COLORS.carga), emissiveIntensity: 0.5, transparent: true, opacity: 0.55, depthTest: false, side: THREE.DoubleSide }));
    this.loadWater = this.mat(new THREE.MeshStandardMaterial({ color: SEWER_COLORS.carga, emissive: new THREE.Color(SEWER_COLORS.carga), emissiveIntensity: 0.45, transparent: true, opacity: 0.85, depthTest: false }));
    this.surgeMat = this.mat(new THREE.MeshStandardMaterial({ color: '#9c8d6c', roughness: 0.15, transparent: true, opacity: 0.75, depthWrite: false }));
    if (s) {
      const shell = (hex: string) => this.mat(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.38, depthTest: false, side: THREE.DoubleSide }));
      const water = (hex: string) => this.mat(new THREE.MeshStandardMaterial({ color: hex, emissive: new THREE.Color(hex), emissiveIntensity: 0.35, transparent: true, opacity: 0.9, depthTest: false }));
      this.shellMat = [shell(SEWER_COLORS.lluvias.shell), shell(SEWER_COLORS.residuales.shell)];
      const waterMat = [water(SEWER_COLORS.lluvias.water), water(SEWER_COLORS.residuales.water)];
      this.waterMat = waterMat;
      // Tuberías: cáscara cilíndrica y lámina de agua (caja con el ancho del espejo y la altura de la lámina)
      for (const p of s.pipes) {
        const na = s.nodes[p.a], nb = s.nodes[p.b];
        const A = this.w(na.x, na.y, p.zUp + p.D / 2), B = this.w(nb.x, nb.y, p.zDn + p.D / 2);
        const d = B.clone().sub(A);
        const L = d.length();
        d.normalize();
        const up = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize();
        const side = new THREE.Vector3().crossVectors(d, up).normalize();
        const r = Math.max(p.D / 2, 0.09);
        const sh = new THREE.Mesh(unitCyl, this.shellMat[p.system]);
        sh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        sh.scale.set(r, L, r);
        sh.position.copy(A).addScaledVector(d, L / 2);
        sh.renderOrder = 8;
        const wm = new THREE.Mesh(unitBox, waterMat[p.system]);
        wm.renderOrder = 9;
        wm.visible = false;
        this.under.add(sh, wm);
        this.pipes.push({ shell: sh, water: wm, a: this.w(na.x, na.y, p.zUp), d, up, side, L });
      }
      // Cámaras y cajas: pozo, agua dentro y tapa en la calle
      const lidG = this.geo(new THREE.CircleGeometry(0.3, 24).rotateX(-Math.PI / 2));
      const ringG = this.geo(new THREE.RingGeometry(0.2, 0.3, 24).rotateX(-Math.PI / 2));
      const lidMat = [this.mat(new THREE.MeshStandardMaterial({ color: '#3a4046', roughness: 0.55, metalness: 0.7 })), this.mat(new THREE.MeshStandardMaterial({ color: '#463c34', roughness: 0.55, metalness: 0.7 }))];
      const ringMat = this.mat(new THREE.MeshStandardMaterial({ color: '#5b6168', roughness: 0.4, metalness: 0.8 }));
      s.nodes.forEach((n, k) => {
        this.nodeWater.push(null);
        this.surges.push(null);
        this.lids.push(null);
        if (n.outfall) {
          // descarga: cabezal en la orilla o flecha de continuidad
          const top = this.w(n.x, n.y, n.inv + 0.5);
          if (n.outfall === 2) {
            const hw = new THREE.Mesh(unitBox, this.shellMat[n.system]);
            hw.scale.set(1.4, 1.0, 0.5);
            hw.position.copy(top);
            hw.renderOrder = 8;
            this.under.add(hw);
            // el cabezal se ve también en la orilla, sin corte
            const head = new THREE.Mesh(unitBox, this.mat(new THREE.MeshStandardMaterial({ color: '#8d8a82', roughness: 0.9 })));
            head.scale.set(1.6, 0.9, 0.35);
            head.position.copy(this.w(n.x, n.y + 0.4, n.inv + 0.45));
            this.over.add(head);
            this.anchors.push({ id: `sw-out-${n.id}`, text: 'Descarga de aguas lluvias a la quebrada', at: this.w(n.x, n.y + 1, n.inv + 2.2), cutOnly: false, priority: 2 });
          } else {
            this.anchors.push({ id: `sw-out-${n.id}`, text: n.system === 0 ? 'Aguas lluvias: sigue al colector' : 'Aguas residuales: sigue al interceptor', at: this.w(n.x - 3, n.y, n.inv + 1), cutOnly: true, priority: 4 });
          }
          return;
        }
        const box = n.kind === 'caja-sumidero';
        const R = box ? Math.sqrt(n.area0) / 2 : Math.sqrt(n.area0 / Math.PI);
        const H = n.rim - n.inv;
        const well = new THREE.Mesh(box ? unitBox : unitCyl, this.shellMat[n.system]);
        well.scale.set(box ? 2 * R : R, H, box ? 2 * R : R);
        well.position.copy(this.w(n.x, n.y, n.inv + H / 2));
        well.renderOrder = 8;
        const wc = new THREE.Mesh(box ? unitBox : unitCylClosed, waterMat[n.system]);
        wc.visible = false;
        wc.renderOrder = 9;
        this.under.add(well, wc);
        this.nodeWater[k] = wc;
        if (n.kind === 'caida') {
          // bajante exterior de la cámara de caída (EPM 8.4.2: a 45° hacia la cámara)
          const ins = s.pipes.filter((p) => p.b === k && p.zDn - n.inv > 0.7);
          for (const p of ins) {
            const na = s.nodes[p.a];
            const dir = new THREE.Vector2(na.x - n.x, na.y - n.y).normalize();
            const top = this.w(n.x + dir.x * (R + 0.4), n.y + dir.y * (R + 0.4), p.zDn + p.D / 2);
            const bot = this.w(n.x + dir.x * R, n.y + dir.y * R, n.inv + 0.15);
            const dd = bot.clone().sub(top);
            const drop = new THREE.Mesh(unitCyl, this.shellMat[n.system]);
            drop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dd.clone().normalize());
            drop.scale.set(p.D / 2, dd.length(), p.D / 2);
            drop.position.copy(top).addScaledVector(dd, 0.5);
            drop.renderOrder = 8;
            this.under.add(drop);
          }
          this.anchors.push({ id: `sw-caida-${n.id}`, text: `${n.id}: cámara de caída (desnivel > 0,7 m)`, at: this.w(n.x, n.y, n.rim + 1.4), cutOnly: true, priority: 3 });
        }
        if (!box) {
          const lid = new THREE.Mesh(lidG, lidMat[n.system]);
          lid.position.copy(this.w(n.x, n.y, n.rim + 0.014));
          const ring = new THREE.Mesh(ringG, ringMat);
          ring.position.copy(this.w(n.x, n.y, n.rim + 0.016));
          this.over.add(lid, ring);
          this.lids[k] = lid;
        }
        // rebose: columna de agua sobre la tapa o la rejilla (altura según el caudal devuelto)
        const surge = new THREE.Mesh(unitCylClosed, this.surgeMat);
        surge.visible = false;
        surge.position.copy(this.w(n.x, n.y, n.rim));
        surge.userData.r = box ? 0.32 : 0.28;
        this.over.add(surge);
        this.surges[k] = surge;
      });
      // rótulos de sistema (solo en la vista de corte), en la cámara más alta de cada red
      for (const sys of [0, 1] as const) {
        const cams = s.nodes.filter((n) => n.system === sys && (n.kind === 'camara' || n.kind === 'caida'));
        if (!cams.length) continue;
        const top = cams.reduce((a, b) => (b.rim > a.rim ? b : a));
        this.anchors.push({ id: `sw-sys-${sys}`, text: sys === 0 ? 'Red de aguas lluvias (didáctica, criterios EPM)' : 'Red de aguas residuales (didáctica, criterios EPM)', at: this.w(top.x, top.y, top.inv - 0.6), cutOnly: true, priority: 6 });
      }
      // Acometidas domiciliarias de aguas residuales (y conexiones erradas, si están activas)
      const acom = this.mat(new THREE.MeshStandardMaterial({ color: SEWER_COLORS.residuales.shell, transparent: true, opacity: 0.6, depthTest: false }));
      const errMat = this.mat(new THREE.MeshStandardMaterial({ color: SEWER_COLORS.errada, emissive: new THREE.Color(SEWER_COLORS.errada), emissiveIntensity: 0.4, transparent: true, opacity: 0.9, depthTest: false }));
      const erradas = new Set(erradasOn ? (sc.sewer?.erradas.buildingIds ?? []) : []);
      sc.buildings.forEach((b) => {
        const nid = sc.sewer?.sanitary.buildingNode[b.id];
        const k = s.nodes.findIndex((n) => n.id === nid);
        if (k < 0) return;
        const n = s.nodes[k];
        const [dx, dy] = b.downspout;
        const from = this.w(dx, dy, this.groundAt(dx, dy) - 0.9);
        const to = this.w(n.x, n.y, n.inv + 0.6);
        const dd = to.clone().sub(from);
        const err = erradas.has(b.id);
        const cyl = new THREE.Mesh(unitCyl, err ? errMat : acom);
        cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dd.clone().normalize());
        cyl.scale.set(err ? 0.07 : 0.045, dd.length(), err ? 0.07 : 0.045);
        cyl.position.copy(from).addScaledVector(dd, 0.5);
        cyl.renderOrder = 7;
        this.under.add(cyl);
        if (err) this.anchors.push({ id: `sw-err-${b.id}`, text: 'Conexión errada: el techo va a aguas residuales', at: this.w(dx, dy, this.groundAt(dx, dy) + 0.3), cutOnly: true, priority: 5 });
      });
      // Ventanas de los sumideros de ventana y mixtos (abertura oscura en el bordillo)
      const slotMat = this.mat(new THREE.MeshStandardMaterial({ color: '#1d2023', roughness: 0.9 }));
      sc.drains.forEach((d, di) => {
        if (d.type !== 'ventana' && d.type !== 'mixto') return;
        const st = (sc.sewer?.streets ?? []).find((q) => (q.axis === 'x' ? Math.abs(d.at[1] - q.center) <= q.halfWidth + 0.5 : Math.abs(d.at[0] - q.center) <= q.halfWidth + 0.5));
        if (!st) return;
        const along = st.axis === 'x';
        const off = (along ? d.at[1] : d.at[0]) - st.center;
        const curb = st.center + Math.sign(off) * st.halfWidth;
        const cx = along ? d.at[0] : curb, cy = along ? curb : d.at[1];
        const zc = this.c.z[c.drains[di].cell];
        const slot = new THREE.Mesh(unitBox, slotMat);
        const L = d.windowLengthM ?? 1.5;
        slot.scale.set(along ? L : 0.06, 0.11, along ? 0.06 : L);
        slot.position.copy(this.w(cx, cy, zc + 0.07));
        this.over.add(slot);
      });
    }
    this.buildCreek();
  }

  /** Mira limnimétrica y línea de la sección de control de la quebrada (el agua que la cubre es la calculada). */
  private buildCreek(): void {
    const cr = this.c.creek, ck = this.sc.creek;
    if (!cr || !ck) return;
    const { dx } = this.c;
    const x = (cr.i + 0.5) * dx;
    const yt = ck.section.at[1];
    const yPost = yt + ck.section.bankHalfWidthM + 1.2;
    const g0 = cr.zBed;
    const top = cr.bankLevel + 1.6;
    const post = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.14, top - g0, 0.06)), this.mat(new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.6 })));
    post.position.copy(this.w(x, yPost, (top + g0) / 2));
    this.over.add(post);
    // marcas cada 0,5 m desde el fondo y banda en la cota de cauce lleno
    const markG = this.geo(new THREE.BoxGeometry(0.2, 0.035, 0.07));
    const markM = this.mat(new THREE.MeshStandardMaterial({ color: '#1f2933', roughness: 0.7 }));
    for (let h = 0.5; g0 + h < top; h += 0.5) {
      const m = new THREE.Mesh(markG, markM);
      m.position.copy(this.w(x, yPost, g0 + h));
      this.over.add(m);
    }
    const band = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.24, 0.07, 0.08)), this.mat(new THREE.MeshStandardMaterial({ color: '#c92a2a', emissive: new THREE.Color('#c92a2a'), emissiveIntensity: 0.25 })));
    band.position.copy(this.w(x, yPost, cr.bankLevel));
    this.over.add(band);
    // línea discontinua de la sección sobre el terreno
    const dashG = this.geo(new THREE.PlaneGeometry(0.12, 0.6).rotateX(-Math.PI / 2));
    const dashM = this.mat(new THREE.MeshBasicMaterial({ color: '#f2f0ea', transparent: true, opacity: 0.8 }));
    for (let j = cr.j0; j <= cr.j1; j++) {
      const y = (j + 0.5) * dx;
      if (j % 2) continue;
      const m = new THREE.Mesh(dashG, dashM);
      m.position.copy(this.w(x, y, this.groundAt(x, y) + 0.025));
      this.over.add(m);
    }
    this.anchors.push({ id: 'creek-sec', text: `${ck.section.name}: mira con la cota de cauce lleno`, at: this.w(x, yPost, top + 0.6), cutOnly: false, priority: 4 });
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }
  private mat<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  /** Actualiza láminas, tuberías en carga y rebose a partir del estado calculado. */
  update(sim: CitySim | null, time: number, reducedMotion: boolean, cut: boolean): void {
    const sw = sim?.sewer;
    const s = this.c.sewer;
    if (!s) return;
    const env: SewerStepEnv | undefined = sim ? { h: sim.h, z: this.c.z, area: this.c.area, dx: this.c.dx } : undefined;
    if (cut) {
      s.pipes.forEach((p, k) => {
        const pv = this.pipes[k];
        const fill = sw ? sw.fillOf(k, env) : 0;
        const y = Math.min(p.D, fill * p.D);
        const load = fill > 1.001;
        pv.shell.material = load ? this.loadMat : this.shellMat[p.system];
        pv.water.material = load ? this.loadWater : this.waterMat[p.system];
        if (y < 0.004) {
          pv.water.visible = false;
          return;
        }
        const T = y >= p.D ? p.D * 0.9 : Math.max(circ(p.D, y).T, 0.25 * p.D);
        const basis = this.m4.makeBasis(pv.side, pv.up, pv.d);
        pv.water.quaternion.setFromRotationMatrix(basis);
        pv.water.scale.set(T, y, pv.L);
        pv.water.position.copy(pv.a).addScaledVector(pv.up, y / 2).addScaledVector(pv.d, pv.L / 2);
        // la base de la caja sigue la batea a lo largo del tramo (pv.a es la batea aguas arriba)
        pv.water.visible = true;
      });
      s.nodes.forEach((n, k) => {
        const wc = this.nodeWater[k];
        if (!wc) return;
        const hd = sw ? sw.headAt(k, env) : n.inv;
        const y = Math.min(n.rim - n.inv, hd - n.inv);
        if (y < 0.004) {
          wc.visible = false;
          return;
        }
        const box = n.kind === 'caja-sumidero';
        const R = (box ? Math.sqrt(n.area0) / 2 : Math.sqrt(n.area0 / Math.PI)) * 0.92;
        wc.scale.set(box ? 2 * R : R, y, box ? 2 * R : R);
        wc.position.copy(this.w(n.x, n.y, n.inv + y / 2, this.v));
        wc.visible = true;
      });
    }
    // rebose: altura de la columna según el caudal devuelto a la calle en el último paso
    const dt = sim && sim.lastDt > 0 ? sim.lastDt : 0;
    s.nodes.forEach((n, k) => {
      const sg = this.surges[k];
      if (!sg) return;
      const q = sw && dt > 0 ? sw.lastOverflow[k] / dt : 0;
      if (q < 2e-4) {
        sg.visible = false;
        if (this.lids[k]) this.lids[k]!.position.y = this.w(n.x, n.y, n.rim + 0.014, this.v).y;
        return;
      }
      const hgt = Math.min(1.3, 0.12 + 2.2 * Math.sqrt(q));
      const wob = reducedMotion ? 1 : 1 + 0.08 * Math.sin(time * 9 + k);
      const r = sg.userData.r as number;
      sg.scale.set(r * wob, hgt, r * wob);
      sg.position.copy(this.w(n.x, n.y, n.rim + hgt / 2, this.v));
      sg.visible = true;
      // la tapa de la cámara se levanta con el rebose (como ocurre en las calles cuando la red entra en carga)
      const lid = this.lids[k];
      if (lid) lid.position.y = this.w(n.x, n.y, n.rim + 0.014 + Math.min(0.12, hgt * 0.1), this.v).y;
    });
  }

  dispose(): void {
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    this.under.clear();
    this.over.clear();
  }
}


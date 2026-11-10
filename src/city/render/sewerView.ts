// Dibujo de la red de alcantarillado separada y de la sección de control de la quebrada.
//
// Todo lo que cambia lee el estado calculado: la lámina de agua en cada tubería y cámara sale de los
// niveles del modelo; las flechas avanzan con la velocidad calculada (Q/A) en tiempo real y en el sentido
// del caudal; los anillos rojos marcan los tramos en carga; el rebose de una cámara o sumidero, del volumen
// que la red devolvió a la calle en el último paso; la mira de la quebrada muestra el nivel calculado. La
// red es didáctica: se rotula como tal.
//
// Para que se lea: cada red conserva su color siempre (azul aguas lluvias, café aguas residuales); se puede
// ver una sola red; las acometidas van de la casa al colector como en la calle (perpendiculares a él).

import * as THREE from 'three';
import type { CitySim } from '../sim/engine';
import { creekCell, creekPoint, type Compiled } from '../sim/compile';
import type { Scenario } from '../sim/scenario';
import { circ, type SewerStepEnv } from '../sim/sewer';
import { SEWER_COLORS, acometidas, showsSystem, type NetFilter } from './sewerColors';

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
  /** Fase de las flechas a lo largo del tramo [0–1). */
  phase: number;
}

export interface SewerAnchor {
  id: string;
  text: string;
  sub?: string;
  at: THREE.Vector3;
  cutOnly: boolean;
  priority: number;
  kind: 'aviso' | 'red';
  color?: string;
  /** Sistema al que pertenece (para el filtro), o −1 si es general. */
  sys: -1 | 0 | 1;
  /** Solo cuando se ve una red sola (códigos de cámaras). */
  single?: boolean;
}

const MAX_ARROWS = 400;

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
  private waterMat: THREE.MeshStandardMaterial[] = [];
  private surgeMat: THREE.MeshStandardMaterial;
  private arrows: THREE.InstancedMesh[] = [];
  private rings: THREE.InstancedMesh | null = null;
  private ringMat: THREE.MeshBasicMaterial | null = null;
  private m4 = new THREE.Matrix4();
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private sc3 = new THREE.Vector3();
  private filter: NetFilter = 'ambas';
  private lastT = -1;
  /** Puntos para rótulos (vista de corte) y de la sección de la quebrada. */
  readonly anchors: SewerAnchor[] = [];

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
    this.surgeMat = this.mat(new THREE.MeshStandardMaterial({ color: '#9c8d6c', roughness: 0.15, transparent: true, opacity: 0.75, depthWrite: false }));
    if (s) {
      const shell = (hex: string) => this.mat(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      const water = (hex: string) => this.mat(new THREE.MeshStandardMaterial({ color: hex, emissive: new THREE.Color(hex), emissiveIntensity: 0.35, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false }));
      this.shellMat = [shell(SEWER_COLORS.lluvias.shell), shell(SEWER_COLORS.residuales.shell)];
      this.waterMat = [water(SEWER_COLORS.lluvias.water), water(SEWER_COLORS.residuales.water)];
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
        sh.userData.sys = p.system;
        const wm = new THREE.Mesh(unitBox, this.waterMat[p.system]);
        wm.renderOrder = 9;
        wm.visible = false;
        wm.userData.sys = p.system;
        this.under.add(sh, wm);
        this.pipes.push({ shell: sh, water: wm, a: this.w(na.x, na.y, p.zUp), d, up, side, L, phase: 0 });
      }
      // Flechas de flujo (una malla por sistema) y anillos de carga
      const cone = this.geo(new THREE.ConeGeometry(0.5, 1, 3).rotateX(Math.PI / 2));
      for (const sys of [0, 1] as const) {
        const col = sys === 0 ? '#d7ecff' : '#ffe4c2';
        const im = new THREE.InstancedMesh(cone, this.mat(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })), MAX_ARROWS);
        im.count = 0;
        im.renderOrder = 10;
        im.frustumCulled = false;
        im.userData.sys = sys;
        this.arrows.push(im);
        this.under.add(im);
      }
      this.ringMat = this.mat(new THREE.MeshBasicMaterial({ color: SEWER_COLORS.carga, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
      this.rings = new THREE.InstancedMesh(this.geo(new THREE.TorusGeometry(1, 0.16, 6, 22)), this.ringMat, s.pipes.length * 3);
      this.rings.count = 0;
      this.rings.renderOrder = 11;
      this.rings.frustumCulled = false;
      this.under.add(this.rings);
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
          // descarga: cabezal en la orilla o rótulo de continuidad
          const top = this.w(n.x, n.y, n.inv + 0.5);
          if (n.outfall === 2) {
            const hw = new THREE.Mesh(unitBox, this.shellMat[n.system]);
            hw.scale.set(1.4, 1.0, 0.5);
            hw.position.copy(top);
            hw.renderOrder = 8;
            hw.userData.sys = n.system;
            this.under.add(hw);
            // el cabezal se ve también en la orilla, sin corte
            const head = new THREE.Mesh(unitBox, this.mat(new THREE.MeshStandardMaterial({ color: '#8d8a82', roughness: 0.9 })));
            head.scale.set(1.6, 0.9, 0.35);
            head.position.copy(this.w(n.x, n.y + 0.4, n.inv + 0.45));
            this.over.add(head);
            this.anchors.push({ id: `sw-out-${n.id}`, text: 'Descarga de aguas lluvias', sub: 'a la quebrada', at: this.w(n.x, n.y + 1, n.inv + 2.2), cutOnly: false, priority: 2, kind: 'red', color: SEWER_COLORS.lluvias.shell, sys: 0 });
          } else {
            this.anchors.push({ id: `sw-out-${n.id}`, text: n.system === 0 ? 'Aguas lluvias' : 'Aguas residuales', sub: n.system === 0 ? 'sigue al colector →' : 'sigue al interceptor →', at: this.w(n.x - 3, n.y, n.inv + 1), cutOnly: true, priority: 4, kind: 'red', color: SEWER_COLORS[n.system === 0 ? 'lluvias' : 'residuales'].shell, sys: n.system });
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
        well.userData.sys = n.system;
        const wc = new THREE.Mesh(box ? unitBox : unitCylClosed, this.waterMat[n.system]);
        wc.visible = false;
        wc.renderOrder = 9;
        wc.userData.sys = n.system;
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
            drop.userData.sys = n.system;
            this.under.add(drop);
          }
          this.anchors.push({ id: `sw-caida-${n.id}`, text: `${n.id}: cámara de caída`, sub: 'desnivel > 0,7 m', at: this.w(n.x, n.y, n.rim + 1.4), cutOnly: true, priority: 3, kind: 'red', color: SEWER_COLORS[n.system === 0 ? 'lluvias' : 'residuales'].shell, sys: n.system });
        } else if (!box) {
          // código de la cámara: solo cuando se ve una red sola (para no llenar la vista de rótulos)
          this.anchors.push({ id: `sw-cam-${n.id}`, text: n.id, at: this.w(n.x, n.y, n.rim + 0.9), cutOnly: true, priority: 1, kind: 'red', color: SEWER_COLORS[n.system === 0 ? 'lluvias' : 'residuales'].shell, sys: n.system, single: true });
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
      // rótulo de cada red en la mitad del colector más cercano al centro del sector (solo en la vista de corte;
      // en el centro queda a la vista con cualquier cámara)
      const cx0 = (c.nx * c.dx) / 2, cy0 = (c.ny * c.dx) / 2;
      for (const sys of [0, 1] as const) {
        const cols = s.pipes.filter((p) => p.system === sys && p.role === 'colector' && p.L > 4);
        if (!cols.length) continue;
        const dist = (p: (typeof cols)[number]) => Math.hypot((s.nodes[p.a].x + s.nodes[p.b].x) / 2 - cx0, (s.nodes[p.a].y + s.nodes[p.b].y) / 2 - cy0);
        const p = cols.reduce((a, b) => (dist(b) < dist(a) ? b : a));
        const na = s.nodes[p.a], nb = s.nodes[p.b];
        const outs = s.nodes.filter((n) => n.system === sys && n.outfall);
        const dest = sys === 0 ? (outs.some((n) => n.outfall === 2) ? 'descarga a la quebrada' : 'va al colector') : 'va al interceptor del río';
        this.anchors.push({
          id: `sw-sys-${sys}`,
          text: sys === 0 ? 'Red de aguas lluvias' : 'Red de aguas residuales',
          sub: `${dest} · didáctica`,
          // a distinta altura del tramo para que los rótulos de las dos redes no se tapen entre sí
          at: this.w(na.x + (nb.x - na.x) * (sys === 0 ? 0.3 : 0.7), na.y + (nb.y - na.y) * (sys === 0 ? 0.3 : 0.7), p.zUp + (p.zDn - p.zUp) * (sys === 0 ? 0.3 : 0.7) - (sys === 0 ? 0.6 : 1.4)),
          cutOnly: true,
          priority: 8,
          kind: 'red',
          color: SEWER_COLORS[sys === 0 ? 'lluvias' : 'residuales'].shell,
          sys,
        });
      }
      // Acometidas domiciliarias de aguas residuales: bajan junto a la casa y van al colector, en el punto
      // del tramo más cercano (y las conexiones erradas, si están activas, en violeta)
      const acom = this.mat(new THREE.MeshStandardMaterial({ color: SEWER_COLORS.residuales.shell, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false }));
      const errMat = this.mat(new THREE.MeshStandardMaterial({ color: SEWER_COLORS.errada, emissive: new THREE.Color(SEWER_COLORS.errada), emissiveIntensity: 0.4, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false }));
      const seg = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) => {
        const dd = b.clone().sub(a);
        const cyl = new THREE.Mesh(unitCyl, m);
        cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dd.clone().normalize());
        cyl.scale.set(r, dd.length(), r);
        cyl.position.copy(a).addScaledVector(dd, 0.5);
        cyl.renderOrder = 7;
        cyl.userData.sys = 1;
        this.under.add(cyl);
      };
      const ac = acometidas(sc, c, erradasOn);
      for (const a of ac) {
        const [dx, dy] = a.from;
        const g = this.groundAt(dx, dy);
        const r = a.errada ? 0.07 : 0.045;
        const m = a.errada ? errMat : acom;
        // tramo vertical junto a la casa y tramo inclinado hasta la clave del colector
        const zTurn = Math.min(g - 0.6, a.zTo + 0.25 + 0.02 * Math.hypot(a.to[0] - dx, a.to[1] - dy));
        seg(this.w(dx, dy, g - 0.25), this.w(dx, dy, zTurn), r, m);
        seg(this.w(dx, dy, zTurn), this.w(a.to[0], a.to[1], a.zTo), r, m);
      }
      const err = ac.filter((a) => a.errada);
      if (err.length) {
        const mx = err.reduce((t, a) => t + a.from[0], 0) / err.length, my = err.reduce((t, a) => t + a.from[1], 0) / err.length;
        this.anchors.push({ id: 'sw-err', text: `Conexiones erradas: ${err.length} techos`, sub: 'su lluvia va a aguas residuales', at: this.w(mx, my, this.groundAt(mx, my) + 0.6), cutOnly: true, priority: 7, kind: 'red', color: SEWER_COLORS.errada, sys: 1 });
      }
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
    const { dx, nx } = this.c;
    // la mira va en la orilla de índice transversal menor, fuera del cauce; si allí hay una construcción, en la otra
    const along = (cr.i + 0.5) * dx;
    const sCross = cr.flow === 'x' ? ck.section.at[1] : ck.section.at[0];
    let cPost = ck.section.bankDepthM != null ? (cr.jb0 + 0.5) * dx - 1.0 : sCross - ck.section.bankHalfWidthM / cr.cosT - 1.2;
    const jPost = Math.floor(cPost / dx);
    if (ck.section.bankDepthM != null && (jPost < 0 || this.c.solid[creekCell(cr, nx, Math.max(0, jPost))])) cPost = (cr.jb1 + 0.5) * dx + 1.0;
    const [x, yPost] = cr.flow === 'x' ? [along, cPost] : [cPost, along];
    const g0 = cr.zBed;
    const top = cr.bankLevel + 2.6;
    const post = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.16, top - g0, 0.06)), this.mat(new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.6 })));
    post.position.copy(this.w(x, yPost, (top + g0) / 2));
    this.over.add(post);
    // marcas cada 0,5 m desde el fondo y banda en la cota de cauce lleno
    const markG = this.geo(new THREE.BoxGeometry(0.22, 0.035, 0.07));
    const markM = this.mat(new THREE.MeshStandardMaterial({ color: '#1f2933', roughness: 0.7 }));
    for (let h = 0.5; g0 + h < top; h += 0.5) {
      const m = new THREE.Mesh(markG, markM);
      m.position.copy(this.w(x, yPost, g0 + h));
      this.over.add(m);
    }
    const band = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.26, 0.07, 0.08)), this.mat(new THREE.MeshStandardMaterial({ color: '#c92a2a', emissive: new THREE.Color('#c92a2a'), emissiveIntensity: 0.25 })));
    band.position.copy(this.w(x, yPost, cr.bankLevel));
    this.over.add(band);
    // línea discontinua de la sección sobre el terreno
    const dashG = this.geo(new THREE.PlaneGeometry(0.12, 0.6).rotateX(-Math.PI / 2));
    const dashM = this.mat(new THREE.MeshBasicMaterial({ color: '#f2f0ea', transparent: true, opacity: 0.8 }));
    for (let j = cr.j0; j <= cr.j1; j++) {
      if (j % 2) continue;
      const k = creekCell(cr, nx, j);
      if (this.c.solid[k]) continue;
      const [px, py] = creekPoint(cr, dx, j);
      const m = new THREE.Mesh(dashG, dashM);
      if (cr.flow === 'y') m.rotation.y = Math.PI / 2;
      m.position.copy(this.w(px, py, this.groundAt(px, py) + 0.025));
      this.over.add(m);
    }
    this.anchors.push({ id: 'creek-sec', text: `${ck.section.name}`, sub: 'mira con la cota de cauce lleno', at: this.w(x, yPost, top + 0.6), cutOnly: false, priority: 4, kind: 'aviso', sys: -1 });
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }
  private mat<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }

  /** Muestra las dos redes o una sola (las piezas de la otra se ocultan bajo la calle). */
  setFilter(f: NetFilter): void {
    this.filter = f;
    this.under.traverse((o) => {
      const sys = o.userData.sys as 0 | 1 | undefined;
      if (sys === 0 || sys === 1) o.visible = showsSystem(f, sys) && (o.userData.hidden !== true);
    });
  }

  /** Rótulos visibles con el filtro actual. */
  visibleAnchors(cut: boolean): SewerAnchor[] {
    return this.anchors.filter((a) => (cut || !a.cutOnly) && (a.sys === -1 || !cut || showsSystem(this.filter, a.sys)) && (!a.single || (cut && this.filter !== 'ambas')));
  }

  /** Actualiza láminas, flechas, tramos en carga y rebose a partir del estado calculado. */
  update(sim: CitySim | null, time: number, reducedMotion: boolean, cut: boolean): void {
    const sw = sim?.sewer;
    const s = this.c.sewer;
    if (!s) return;
    const env: SewerStepEnv | undefined = sim ? { h: sim.h, z: this.c.z, area: this.c.area, dx: this.c.dx } : undefined;
    const dtReal = this.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, time - this.lastT));
    this.lastT = time;
    if (cut) {
      const nA = [0, 0];
      let nR = 0;
      const pulse = reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(time * 6);
      s.pipes.forEach((p, k) => {
        const pv = this.pipes[k];
        const shown = showsSystem(this.filter, p.system);
        const fill = sw ? sw.fillOf(k, env) : 0;
        const y = Math.min(p.D, fill * p.D);
        const load = fill > 1.001;
        if (y < 0.004 || !shown) {
          pv.water.visible = false;
        } else {
          const T = y >= p.D ? p.D * 0.9 : Math.max(circ(p.D, y).T, 0.25 * p.D);
          const basis = this.m4.makeBasis(pv.side, pv.up, pv.d);
          pv.water.quaternion.setFromRotationMatrix(basis);
          pv.water.scale.set(T, y, pv.L);
          // la base de la caja sigue la batea a lo largo del tramo (pv.a es la batea aguas arriba)
          pv.water.position.copy(pv.a).addScaledVector(pv.up, y / 2).addScaledVector(pv.d, pv.L / 2);
          pv.water.visible = true;
        }
        if (!shown || !sw) return;
        // anillos rojos en los tramos en carga (la tubería conserva el color de su red)
        if (load && this.rings) {
          const r = Math.max(p.D * 0.75, 0.24);
          this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pv.d);
          for (const f of [0.2, 0.5, 0.8]) {
            this.v.copy(pv.a).addScaledVector(pv.up, p.D / 2).addScaledVector(pv.d, pv.L * f);
            this.sc3.set(r * pulse, r * pulse, r * pulse);
            this.rings.setMatrixAt(nR++, this.m4.compose(this.v, this.q, this.sc3));
          }
        }
        // flechas: sentido del caudal y avance con la velocidad media Q/A (en tiempo real)
        const Q = sw.flowOf(k);
        if (Math.abs(Q) < 2e-5 || y < 0.004) return;
        const A = y >= p.D ? (Math.PI * p.D * p.D) / 4 : circ(p.D, y).A;
        const vel = Math.abs(Q) / Math.max(A, 1e-6);
        if (!reducedMotion) pv.phase = (pv.phase + (dtReal * Math.min(vel, 4)) / Math.max(pv.L, 0.5)) % 1;
        const n = Math.max(1, Math.min(8, Math.floor(pv.L / 3)));
        const sgn = Q >= 0 ? 1 : -1;
        const size = Math.max(0.16, Math.min(0.42, p.D * 0.7));
        this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.v.copy(pv.d).multiplyScalar(sgn));
        const im = this.arrows[p.system];
        for (let i = 0; i < n; i++) {
          let f = (i + pv.phase) / n;
          if (sgn < 0) f = 1 - f;
          const ai = nA[p.system];
          if (ai >= MAX_ARROWS) break;
          this.v.copy(pv.a).addScaledVector(pv.up, Math.min(y, p.D) * 0.55 + 0.02).addScaledVector(pv.d, pv.L * f);
          this.sc3.set(size * 0.8, size * 0.8, size);
          im.setMatrixAt(ai, this.m4.compose(this.v, this.q, this.sc3));
          nA[p.system] = ai + 1;
        }
      });
      for (const sys of [0, 1] as const) {
        this.arrows[sys].count = showsSystem(this.filter, sys) ? nA[sys] : 0;
        this.arrows[sys].instanceMatrix.needsUpdate = true;
      }
      if (this.rings) {
        this.rings.count = nR;
        this.rings.instanceMatrix.needsUpdate = true;
      }
      s.nodes.forEach((n, k) => {
        const wc = this.nodeWater[k];
        if (!wc) return;
        const hd = sw ? sw.headAt(k, env) : n.inv;
        const y = Math.min(n.rim - n.inv, hd - n.inv);
        if (y < 0.004 || !showsSystem(this.filter, n.system)) {
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

// «La caída y el resalto» en 3D: el canal de arriba llega a una cresta, baja por una rápida de concreto al pozo
// de amortiguación y sale por un vertedero al canal de abajo. La pared del frente es de vidrio para ver el perfil
// calculado: la profundidad crítica en la cresta, el agua que se adelgaza y acelera en la rápida, el resalto (con
// su remolino) donde la profundidad conjugada iguala a la del pozo, y la línea de energía (rayada, roja) que cae
// de golpe en el resalto. Todo a escala real.

import * as THREE from 'three';
import { CHUTE, type JumpResult } from '../hydraulics';
import { JUMP_DOWN as DOWN, JUMP_UP as UP, jumpSurface } from '../profiles';
import { concreteMaterial, rng, trees, type TreeSpot } from '../../quality/three/kit';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { Tracers, WATER, WaterBody, glassMaterial, polyline, setPolyline, slab, stationField, type Station } from './canalKit';

const B = CHUTE.b;

export class JumpWorld {
  private stage: QStage;
  private time = { value: 0 };
  private dyn = new THREE.Group();
  private water: WaterBody;
  private egl: THREE.Line;
  private spray: THREE.InstancedMesh;
  private scour: THREE.Mesh;
  private tracers: Tracers;
  private r: JumpResult | null = null;
  private jumpSpan: [number, number, number, number] = [0, 0, 0, 0];
  views: Record<'general' | 'resalto' | 'rapida', StageView> = {
    general: { eye: [0, 12, 70], target: [0, 2, 0], fit: 120 },
    resalto: { eye: [8, 4, 22], target: [8, 1.5, 0], fit: 30 },
    rapida: { eye: [-60, 16, 14], target: [-10, 2, 0], fit: 60 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(80);
    stage.controls.minDistance = 3;
    const R = rng(31);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(500, 300), new THREE.MeshStandardMaterial({ color: '#6c9a4a', roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    far.position.y = -0.6;
    far.receiveShadow = true;
    sc.add(far);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 70; k++) ts.push({ x: -160 + R() * 280, y: -0.6, z: (R() < 0.5 ? -1 : 1) * (12 + R() * 60), r: 1.6 + R() * 1.8 });
    sc.add(trees(ts, 6));
    sc.add(this.dyn);
    this.water = new WaterBody(this.time);
    this.water.setColor(WATER.clear);
    sc.add(this.water.group);
    this.egl = polyline('#d0342c');
    sc.add(this.egl);
    this.spray = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ color: '#f6fbff', roughness: 0.3, transparent: true, opacity: 0.7, depthWrite: false }), 260);
    this.spray.frustumCulled = false;
    sc.add(this.spray);
    // trazadores junto al vidrio: muestran la velocidad y el remolino del resalto
    this.tracers = new Tracers(460, 0.07);
    sc.add(this.tracers.mesh);
    this.scour = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshStandardMaterial({ color: '#6e5536', roughness: 1 }));
    this.scour.rotation.x = -Math.PI / 2;
    sc.add(this.scour);
  }

  private build(r: JumpResult): void {
    for (const c of [...this.dyn.children]) {
      this.dyn.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const conc = concreteMaterial('#c2bdb3');
    const wallC = concreteMaterial('#b3ada2');
    const glass = glassMaterial(0.13);
    const { drop, weir, basin } = r.inp;
    const L = r.chuteLen;
    const top = Math.max(r.ytw, r.y2, r.yc * 2) + 1.2;
    const yUpWall = r.yc * 1.6 + 1;
    // canal de arriba
    this.dyn.add(slab(conc, -L - UP, -L, drop - 0.6, drop, -B / 2 - 0.3, B / 2 + 0.3));
    this.dyn.add(slab(wallC, -L - UP, -L, drop - 0.6, drop + yUpWall, -B / 2 - 0.3, -B / 2));
    this.dyn.add(slab(glass, -L - UP, -L, drop, drop + yUpWall, B / 2, B / 2 + 0.04, false));
    // terraplén bajo el canal de arriba y la rápida
    this.dyn.add(slab(new THREE.MeshStandardMaterial({ color: '#7d6a4f', roughness: 1 }), -L - UP, -L, -0.6, drop - 0.6, -B / 2 - 6, B / 2 + 6));
    // rápida: losa inclinada
    const len = Math.hypot(L, drop);
    const ang = Math.atan2(drop, L);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(len, 0.6, B + 0.6), conc);
    ch.position.set(-L / 2, drop / 2 - 0.3 / Math.cos(ang), 0);
    ch.rotation.z = -ang;
    ch.castShadow = ch.receiveShadow = true;
    this.dyn.add(ch);
    // relleno bajo la rápida (cuña)
    const wedge = new THREE.Shape([new THREE.Vector2(-L, -0.6), new THREE.Vector2(0, -0.6), new THREE.Vector2(-L, drop - 0.6)]);
    const wg = new THREE.ExtrudeGeometry(wedge, { depth: B + 12, bevelEnabled: false });
    wg.translate(0, 0, -(B + 12) / 2);
    this.dyn.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: '#7d6a4f', roughness: 1 })));
    // paredes de la rápida: la de atrás de concreto, la del frente de vidrio (trapecios)
    const wallShape = (h: number) => new THREE.Shape([new THREE.Vector2(-L, drop - 0.6), new THREE.Vector2(0, -0.6), new THREE.Vector2(0, h), new THREE.Vector2(-L, drop + h)]);
    const back = new THREE.Mesh(new THREE.ExtrudeGeometry(wallShape(2.2), { depth: 0.3, bevelEnabled: false }), wallC);
    back.position.z = -B / 2 - 0.3;
    back.castShadow = true;
    const front = new THREE.Mesh(new THREE.ExtrudeGeometry(wallShape(2.2), { depth: 0.04, bevelEnabled: false }), glass);
    front.position.z = B / 2;
    this.dyn.add(back, front);
    // pozo de amortiguación
    this.dyn.add(slab(conc, 0, basin, -0.6, 0, -B / 2 - 0.3, B / 2 + 0.3));
    this.dyn.add(slab(wallC, 0, basin + 1, -0.6, top, -B / 2 - 0.3, -B / 2));
    this.dyn.add(slab(glass, 0, basin + 1, 0, top, B / 2, B / 2 + 0.04, false));
    // vertedero de cresta ancha al final del pozo
    if (weir > 0.01) this.dyn.add(slab(conc, basin, basin + 1, 0, weir, -B / 2, B / 2));
    // canal de abajo, al nivel de la cresta
    this.dyn.add(slab(conc, basin + 1, basin + 1 + DOWN, Math.max(-0.6, weir - 0.6), weir, -B / 2 - 0.3, B / 2 + 0.3));
    this.dyn.add(slab(wallC, basin + 1, basin + 1 + DOWN, weir - 0.6, weir + 2, -B / 2 - 0.3, -B / 2));
    this.dyn.add(slab(glass, basin + 1, basin + 1 + DOWN, weir, weir + 2, B / 2, B / 2 + 0.04, false));
    if (weir > 0.6) this.dyn.add(slab(new THREE.MeshStandardMaterial({ color: '#7d6a4f', roughness: 1 }), basin + 1, basin + 1 + DOWN, -0.6, weir - 0.6, -B / 2 - 6, B / 2 + 6));
  }

  set(r: JumpResult): void {
    const first = !this.r;
    this.r = r;
    this.build(r);
    const { drop, weir, basin } = r.inp;
    const L = r.chuteLen;
    const prof = jumpSurface(r);
    const hw = B / 2 - 0.02;
    const q = r.inp.Q / B;
    const st: Station[] = prof.pts.map((p) => ({ x: p.x, bed: p.bed, depth: p.y, halfW: hw, foam: p.foam, vel: q / Math.max(0.02, p.y) }));
    const egl = prof.egl.map((p) => new THREE.Vector3(p.x, p.e, B / 2 + 0.1));
    this.jumpSpan = prof.jump;
    this.water.update(st);
    this.tracers.set(stationField(st), st[0].x, st[st.length - 1].x, [B / 2 - 0.75, B / 2 - 0.06], [this.jumpSpan[0], this.jumpSpan[1]], first);
    setPolyline(this.egl, egl, [0.9, 0.5]);
    this.scour.visible = r.place === 'barrido';
    this.scour.scale.set(4.5, 3, 1);
    this.scour.position.set(basin + 8, weir + 0.01, 0);
    const mid = (-L - UP + basin + DOWN) / 2;
    const span = L + UP + basin + DOWN;
    this.views = {
      general: { eye: [mid, drop * 0.6 + 8, span * 0.55], target: [mid, drop * 0.35, 0], fit: span * 0.95, portrait: { eye: [mid + 10, drop + 18, span * 0.75], target: [mid, drop * 0.4, 0], fit: span * 0.7 } },
      resalto: { eye: [this.jumpSpan[0] + 4, Math.max(r.ytw, 2) + 3, 20], target: [this.jumpSpan[0] + 4, r.ytw * 0.5, 0], fit: 26 },
      rapida: { eye: [-L - UP * 0.6, drop + 8, 14], target: [-L / 2, drop / 2, 0], fit: Math.max(40, L * 1.2) },
    };
    if (first) this.stage.view(this.views.general, false);
    this.stage.setLabels(this.labels());
  }

  private labels(): StageLabel[] {
    const r = this.r!;
    const es = (x: number, d = 2) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const L = r.chuteLen;
    const out: StageLabel[] = [
      { id: 'cresta', text: 'Cresta: profundidad crítica', sub: `${es(r.yc)} m`, at: new THREE.Vector3(-L, r.inp.drop + r.yc + 1.2, 0), kind: 'dato', prio: 3 },
      { id: 'pie', text: `Al pie: ${es(r.y1)} m a ${es(r.V1, 1)} m/s`, sub: `Froude ${es(r.F1, 1)}`, at: new THREE.Vector3(0, r.y1 + 1.6, 0), kind: 'dato', prio: 4 },
      { id: 'egl', text: 'Línea de energía', at: new THREE.Vector3(-L - 14, r.E0 + 0.6, 0), kind: 'dato', prio: 2 },
    ];
    const [x0, x1, , yB] = this.jumpSpan;
    const name = r.place === 'barrido' ? 'El resalto se sale del pozo' : r.place === 'ahogado' ? 'Resalto ahogado' : `Resalto ${r.kind === 'debil' ? 'débil' : r.kind}`;
    out.push({ id: 'resalto', text: name, sub: r.place === 'barrido' ? 'el agua rápida erosiona el canal de abajo' : `de ${es(r.yA)} a ${es(Math.min(yB, r.ytw))} m · ${es(r.Lj, 1)} m de largo`, at: new THREE.Vector3((x0 + x1) / 2, yB + 1.3 + (r.place === 'barrido' ? r.inp.weir : 0), 0), kind: r.contained ? 'ok' : 'alerta', prio: 6 });
    out.push({ id: 'vert', text: 'Vertedero', sub: `${es(r.inp.weir, 1)} m de alto`, at: new THREE.Vector3(r.inp.basin + 0.5, r.inp.weir + r.Hw + 1, 0), kind: 'lugar', prio: 2 });
    return out;
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    const r = this.r;
    if (!r) return;
    this.tracers.update(dt, this.stage.reducedMotion);
    const [x0, x1, yA, yB] = this.jumpSpan;
    const bed = r.place === 'barrido' ? r.inp.weir : 0;
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sv = new THREE.Vector3(1, 1, 1);
    const R = rng(5);
    const amp = Math.min(1.5, 0.15 + 0.08 * r.FA * r.FA * 0.1 + (yB - yA) * 0.25);
    for (let k = 0; k < this.spray.count; k++) {
      const a = R(), b = R(), c = R();
      if (this.stage.reducedMotion && k > 40) {
        this.spray.setMatrixAt(k, m4.makeScale(0, 0, 0));
        continue;
      }
      const ph = (t * (0.7 + c) + a * 10) % 1;
      const x = x0 + (x1 - x0) * (0.15 + 0.6 * a) + ph * 1.5;
      const yS = yA + (yB - yA) * Math.min(1, (x - x0) / Math.max(0.1, x1 - x0) * 1.4);
      const y = bed + yS + Math.sin(ph * Math.PI) * amp * (0.4 + c);
      p.set(x, y, (b - 0.5) * (B - 0.4));
      sv.setScalar((0.5 + c) * (1 - 0.6 * ph));
      this.spray.setMatrixAt(k, m4.compose(p, q, sv));
    }
    this.spray.instanceMatrix.needsUpdate = true;
  }
}

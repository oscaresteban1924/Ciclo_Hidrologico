// Las alcantarillas en 3D: una quebrada cruza bajo una vía en terraplén por uno o varios tubos de concreto. El
// terraplén está cortado por el eje del primer tubo para ver adentro: el tubo partido a lo largo y el agua que
// lleva. Aguas arriba, el agua se represa hasta el nivel calculado (HW); aguas abajo corre con su nivel. Si el
// nivel supera la vía, el agua pasa por encima. El perfil dentro del tubo es esquemático; los niveles a la entrada
// y a la salida son los calculados.

import * as THREE from 'three';
import type { CulvertResult } from '../culvert';
import { concreteMaterial, rng, trees, type TreeSpot } from '../../quality/three/kit';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { Tracers, WaterBody, glassMaterial, slab, stationField, type Station } from './canalKit';
import { geom } from '../hydraulics';

const SIDE = 2; // talud del terraplén (horizontal por vertical)
const REACH = 45;
/** Fondo del modelo detrás del corte (m). */
const DEPTH = 60;
/** Media anchura del fondo de la quebrada junto al corte (m) y talud de las orillas (horizontal por vertical). */
const CREEK = 3;
const BANK = 4;
const BANK_H = 6;

/** Altura de las orillas sobre el fondo de la quebrada a una distancia -z del corte. */
function bankAt(z: number): number {
  return Math.max(0, Math.min(BANK_H, (-CREEK - z) / BANK));
}
/** Cota del fondo de la quebrada: plana aguas arriba, baja con el tubo y sigue plana aguas abajo. */
function baseAt(x: number, L: number, yOut: number): number {
  if (x <= -L / 2) return 0;
  if (x >= L / 2) return yOut;
  return (yOut * (x + L / 2)) / L;
}
/** Media anchura de una lámina de agua de profundidad h en el valle (llega hasta donde la orilla alcanza su nivel). */
function poolHalf(h: number): number {
  return (CREEK + BANK * Math.min(BANK_H, Math.max(0, h))) / 2;
}

export class CulvertWorld {
  private stage: QStage;
  private time = { value: 0 };
  private dyn = new THREE.Group();
  private pond: WaterBody;
  private down: WaterBody;
  private inner: WaterBody;
  private over: WaterBody;
  private tracers: Tracers;
  private tracersOn = false;
  private r: CulvertResult | null = null;
  private built = '';
  views: Record<'general' | 'corte' | 'entrada', StageView> = {
    general: { eye: [-51, 17, 15], target: [2, 2, -10], fit: 60 },
    corte: { eye: [0, 1.8, 13.5], target: [0, 0.75, -1.5], fit: 34 },
    entrada: { eye: [-31, 6, 9], target: [-14, 1.25, -5], fit: 24 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(60);
    stage.controls.minDistance = 2;
    sc.add(this.dyn);
    this.pond = new WaterBody(this.time, { opacity: 0.8 });
    this.down = new WaterBody(this.time, { opacity: 0.8 });
    this.inner = new WaterBody(this.time);
    this.over = new WaterBody(this.time, { side: false });
    this.tracers = new Tracers(220, 0.04);
    sc.add(this.tracers.mesh);
    for (const w of [this.pond, this.down, this.inner, this.over]) {
      w.setColor('#4c8fb0');
      sc.add(w.group);
    }
    stage.view(this.views.general, false);
  }

  private build(r: CulvertResult): void {
    for (const c of [...this.dyn.children]) {
      this.dyn.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const { D, L, S, road, barrels, inlet } = r.inp;
    const R = rng(13);
    const yOut = -S * L;
    const soil = new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 1, side: THREE.DoubleSide });
    const grass = new THREE.MeshStandardMaterial({ color: '#6a9a48', roughness: 1 });
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const conc = concreteMaterial('#c2bdb3');
    // valle: fondo de la quebrada (que baja con la pendiente del tubo bajo el terraplén) y orillas que suben
    const X = L / 2 + REACH + 40;
    const nx = 140, nz = 48;
    const vg = new THREE.PlaneGeometry(2 * X, DEPTH, nx, nz);
    vg.rotateX(-Math.PI / 2);
    vg.translate(0, 0, -DEPTH / 2);
    const vp = vg.attributes.position as THREE.BufferAttribute;
    const vc: number[] = [];
    const bedC = new THREE.Color('#8f8064'), grassC = new THREE.Color('#6a9a48');
    for (let k = 0; k < vp.count; k++) {
      const x = vp.getX(k), z = vp.getZ(k);
      const b = bankAt(z);
      vp.setY(k, baseAt(x, L, yOut) + b);
      const c = b < 0.05 ? bedC : grassC.clone().lerp(new THREE.Color('#5d8c3f'), Math.min(1, b / 6));
      vc.push(c.r, c.g, c.b);
    }
    vg.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
    vg.computeVertexNormals();
    const valley = new THREE.Mesh(vg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    valley.receiveShadow = true;
    this.dyn.add(valley);
    // la cara del corte del terreno (z = 0) y la base de la maqueta delante del corte
    const B = Math.min(0, yOut) - 2;
    const cut = new THREE.Shape([new THREE.Vector2(-X, B), new THREE.Vector2(X, B), new THREE.Vector2(X, yOut), new THREE.Vector2(L / 2, yOut), new THREE.Vector2(-L / 2, 0), new THREE.Vector2(-X, 0)]);
    this.dyn.add(new THREE.Mesh(new THREE.ShapeGeometry(cut), soil));
    const base = new THREE.Mesh(new THREE.PlaneGeometry(2 * X, 160), new THREE.MeshStandardMaterial({ color: '#c6c0b2', roughness: 1 }));
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, B, 80);
    base.receiveShadow = true;
    this.dyn.add(base);
    // terraplén: trapecio de largo L en la base; sin tapas (la del corte se dibuja aparte, con el hueco del tubo)
    const top = Math.max(4, L - 2 * SIDE * road);
    const sh = new THREE.Shape([new THREE.Vector2(-L / 2, 0), new THREE.Vector2(L / 2, yOut), new THREE.Vector2(top / 2, road), new THREE.Vector2(-top / 2, road)]);
    const eg = new THREE.ExtrudeGeometry(sh, { depth: DEPTH, bevelEnabled: false });
    eg.translate(0, 0, -DEPTH);
    const emb = new THREE.Mesh(eg, [hidden, grass]);
    emb.receiveShadow = emb.castShadow = true;
    this.dyn.add(emb);
    // cara del corte del terraplén: por encima de la corona del tubo partido
    const box = r.inp.shape === 'cajon';
    const Dout = D + (box ? 0.18 : 0.12);
    const t = Dout / (road - (yOut * (L - top)) / (2 * L));
    const u = (road - Dout - (yOut * (top + L)) / (2 * L)) / (road - yOut + (yOut * (L - top)) / (2 * L));
    if (t > 0 && t < 1 && u > 0 && u < 1) {
      const xl = -L / 2 + (t * (L - top)) / 2, xr = top / 2 + (u * (L - top)) / 2;
      const crown = (x: number) => Dout + (yOut / L) * (x + L / 2);
      const face = new THREE.Shape([new THREE.Vector2(xl, crown(xl)), new THREE.Vector2(xr, crown(xr)), new THREE.Vector2(top / 2, road), new THREE.Vector2(-top / 2, road)]);
      const fm = new THREE.Mesh(new THREE.ShapeGeometry(face), soil);
      fm.position.z = 0.001;
      this.dyn.add(fm);
    }
    // vía y barandas
    this.dyn.add(slab(new THREE.MeshStandardMaterial({ color: '#3d4247', roughness: 0.9 }), -top / 2, top / 2, road, road + 0.06, -DEPTH, 0, false));
    this.dyn.add(slab(new THREE.MeshStandardMaterial({ color: '#f2c230' }), -0.08, 0.08, road + 0.061, road + 0.065, -DEPTH, 0, false));
    for (const sg of [-1, 1]) this.dyn.add(slab(new THREE.MeshStandardMaterial({ color: '#9aa3aa', metalness: 0.5, roughness: 0.4 }), sg * (top / 2) - 0.1, sg * (top / 2) + 0.1, road, road + 0.8, -DEPTH, 0));
    // los tubos: el primero partido por el eje (z ≤ 0), los otros detrás
    const tilt = Math.atan2(-yOut, L);
    const span = box ? (r.inp.B ?? D) : D;
    for (let k = 0; k < barrels; k++) {
      const z = -k * (span + 0.8);
      const half = k === 0;
      if (box) {
        // cajón: losa de fondo, losa de techo y paredes (el primero, partido por el eje: solo la mitad de atrás)
        const g = new THREE.Group();
        g.rotation.z = -Math.atan2(-yOut, L);
        g.position.set(0, yOut / 2, z);
        const t = 0.18, hb = span / 2;
        const zf = half ? 0 : hb + t;
        g.add(slab(conc, -L / 2, L / 2, -t, 0, -hb - t, zf));
        g.add(slab(conc, -L / 2, L / 2, D, D + t, -hb - t, zf));
        g.add(slab(conc, -L / 2, L / 2, 0, D, -hb - t, -hb));
        if (!half) g.add(slab(conc, -L / 2, L / 2, 0, D, hb, hb + t));
        this.dyn.add(g);
        const wing = (x0: number, x1: number, y0: number, y1: number) => this.dyn.add(slab(conc, x0, x1, y0, y1, z - hb - 1.2, z + (half ? 0 : hb + 1.2)));
        wing(-L / 2 - 0.35, -L / 2, -0.4, D + 0.8);
        wing(L / 2, L / 2 + 0.35, yOut - 0.4, yOut + D + 0.6);
        // aletas de entrada (dibujadas según el tipo: abiertas, a 90° o paralelas)
        const ang = inlet === 'aletas3075' ? Math.PI / 4 : inlet === 'aletas90' ? Math.PI / 2 : 0;
        const wl = 2.4;
        const fin = new THREE.Mesh(new THREE.BoxGeometry(wl, D + 0.6, 0.25), conc);
        fin.position.set(-L / 2 - 0.35 - (wl / 2) * Math.cos(ang), (D + 0.6) / 2 - 0.4, z - hb - 0.12 - (wl / 2) * Math.sin(ang));
        fin.rotation.y = ang;
        fin.castShadow = true;
        this.dyn.add(fin);
        continue;
      }
      const outer = new THREE.Mesh(new THREE.CylinderGeometry(D / 2 + 0.12, D / 2 + 0.12, L, 32, 1, true, half ? Math.PI / 2 : 0, half ? Math.PI : Math.PI * 2), conc);
      const innerM = new THREE.Mesh(new THREE.CylinderGeometry(D / 2, D / 2, L, 32, 1, true, half ? Math.PI / 2 : 0, half ? Math.PI : Math.PI * 2), new THREE.MeshStandardMaterial({ color: '#a9a49a', roughness: 0.9, side: THREE.BackSide }));
      for (const m of [outer, innerM]) {
        m.rotation.z = Math.PI / 2 + tilt;
        m.position.set(0, yOut / 2 + D / 2, z);
        this.dyn.add(m);
      }
      // entrada: muro (con o sin campana) o tubo saliente
      if (inlet !== 'saliente') {
        const wall = slab(conc, -L / 2 - 0.35, -L / 2, -0.4, D + 0.8, z - D / 2 - 1.2, z + (half ? 0 : D / 2 + 1.2));
        this.dyn.add(wall);
        if (inlet === 'campana') {
          const bg = new THREE.TorusGeometry(D / 2 + 0.1, 0.12, 8, 24, half ? Math.PI : Math.PI * 2);
          if (half) bg.rotateZ(-Math.PI / 2);
          bg.rotateY(Math.PI / 2);
          const bell = new THREE.Mesh(bg, conc);
          bell.position.set(-L / 2 - 0.36, D / 2, z);
          this.dyn.add(bell);
        }
      }
      // salida: muro con aletas
      this.dyn.add(slab(conc, L / 2, L / 2 + 0.35, yOut - 0.4, yOut + D + 0.6, z - D / 2 - 1.2, z + (half ? 0 : D / 2 + 1.2)));
    }
    // vidrio en el corte, sobre el primer tubo, para que se vea que es un corte
    this.dyn.add(slab(glassMaterial(0.08), -L / 2, L / 2, Math.min(0, yOut) - 0.2, road, -0.02, 0.0, false));
    // enrocado a la salida y árboles
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#8d8a82', roughness: 0.9, flatShading: true }), 60);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3();
    for (let k = 0; k < 60; k++) {
      q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3));
      const s = 0.18 + R() * 0.25;
      rocks.setMatrixAt(k, m4.compose(p.set(L / 2 + 0.6 + R() * 5, yOut + s * 0.3, -2.5 - (barrels - 1) * (span + 0.8) + R() * (2.4 + (barrels - 1) * (span + 0.8))), q, sv.set(s, s * 0.6, s)));
    }
    this.dyn.add(rocks);
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 70; k++) {
      const x = (R() - 0.5) * 2 * (L / 2 + REACH + 30);
      const z = -8 - 3 * Math.min(6, 2 + 6 * R()) - R() * 20;
      if (Math.abs(x) < L / 2 + 4 || z < -DEPTH + 2) continue;
      ts.push({ x, y: baseAt(x, L, yOut) + bankAt(z), z, r: 1.4 + R() * 1.6 });
    }
    this.dyn.add(trees(ts, 4));
  }

  set(r: CulvertResult): void {
    this.r = r;
    const { D, L, S, road, barrels, inlet } = r.inp;
    const key = `${D}-${L}-${S}-${road}-${barrels}-${inlet}-${r.inp.shape}-${r.inp.B}`;
    if (key !== this.built) {
      this.build(r);
      this.built = key;
    }
    const yOut = -S * L;
    const hw = r.hw;
    // charco aguas arriba (plano a la altura HW) y agua aguas abajo
    // el charco llega hasta donde el talud del terraplén alcanza su nivel (por dentro del corte queda oculto)
    const top = Math.max(4, L - 2 * SIDE * road);
    const xMeet = Math.min(-top / 2, -L / 2 + (Math.min(hw, road) / road) * ((L - top) / 2));
    const ph = poolHalf(hw);
    const pond: Station[] = [];
    for (let k = 0; k <= 12; k++) pond.push({ x: -L / 2 - REACH + ((xMeet + L / 2 + REACH) * k) / 12, bed: 0, depth: Math.max(0.05, hw), halfW: ph, z0: -ph });
    this.pond.update(pond);
    this.pond.setSpeed(r.inp.Q / Math.max(0.5, 2 * ph * Math.max(0.1, hw)));
    const tw = Math.max(0.08, r.inp.tw);
    const dh = poolHalf(tw);
    this.down.update([
      { x: L / 2 + 0.36, bed: yOut, depth: tw, halfW: dh, z0: -dh },
      { x: L / 2 + REACH, bed: yOut, depth: tw, halfW: dh, z0: -dh },
    ]);
    this.down.setSpeed(Math.min(r.Vout, r.inp.Q / Math.max(0.3, 2 * dh * tw)));
    // dentro del primer tubo (corte): de la entrada a la salida
    const yIn = Math.min(D, r.control === 'salida' ? D : Math.max(r.yc, r.yOut));
    const st: Station[] = [];
    for (let k = 0; k <= 30; k++) {
      const f = k / 30, x = -L / 2 + L * f;
      const y = Math.max(0.02, yIn + (r.yOut - yIn) * f);
      const box = r.inp.shape === 'cajon', Bw = r.inp.B ?? D;
      // en el cajón el agua ocupa todo el ancho (se ve la mitad de atrás); en el tubo, el ancho de la superficie
      const T = box ? Bw : y >= D * 0.999 ? 0.02 : 2 * Math.sqrt(Math.max(0, y * (D - y)));
      const w = Math.max(0.02, T / 2);
      const A = box ? Bw * Math.min(D, y) : geom({ shape: 'circ', b: 0, z: 0, D, H: D }, Math.min(D, y)).A;
      st.push({ x, bed: -S * (x + L / 2), depth: y, halfW: w / 2, z0: -w / 2, foam: f < 0.1 ? 0.4 : 0.1, vel: r.q / Math.max(0.01, A) });
    }
    this.inner.update(st);
    // trazadores dentro del tubo partido, junto al corte
    this.tracers.set(stationField(st), -L / 2, L / 2, [-Math.min(0.3, D * 0.2), -0.03], null, !this.tracersOn);
    this.tracersOn = true;
    // sobre la vía
    this.over.group.visible = r.overtop;
    if (r.overtop) {
      const hw2 = poolHalf(hw) * 2;
      this.over.update([
        { x: -top / 2, bed: road + 0.06, depth: Math.max(0.03, hw - road), halfW: hw2 / 2, z0: -hw2 / 2 },
        { x: top / 2, bed: road + 0.06, depth: Math.max(0.03, (hw - road) * 0.6), halfW: hw2 / 2, z0: -hw2 / 2 },
      ]);
      this.over.setSpeed(r.Qover / Math.max(0.5, hw2 * Math.max(0.03, hw - road)));
    }
    this.views = {
      general: { eye: [-L / 2 - 36, road + 13, 15], target: [2, road / 2, -10], fit: L + 30 },
      corte: { eye: [0, D * 0.75 + 0.7, Math.max(9, L * 0.45)], target: [0, D / 2, -1.5], fit: L + 4 },
      entrada: { eye: [-L / 2 - 16, Math.max(4.5, hw + 3.5), 9], target: [-L / 2 + 1, Math.max(1, hw / 2), -5], fit: 24 },
    };
    this.stage.setLabels(this.labels());
  }

  private labels(): StageLabel[] {
    const r = this.r!;
    const es = (x: number, d = 2) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const { D, L, road } = r.inp;
    const out: StageLabel[] = [
      { id: 'hw', text: `Agua a la entrada: ${es(r.hw)} m`, sub: `${es(r.ratio)} veces el diámetro · control a la ${r.control}`, at: new THREE.Vector3(-L / 2 - 8, r.hw + 1.2, 2), kind: r.ok ? 'ok' : 'alerta', prio: 6 },
      { id: 'via', text: 'Vía', sub: `${es(road, 1)} m sobre el fondo del ${r.inp.shape === 'cajon' ? 'cajón' : 'tubo'}`, at: new THREE.Vector3(0, road + 1.4, -6), kind: 'lugar', prio: 3 },
      { id: 'sal', text: `Salida a ${es(r.Vout, 1)} m/s`, at: new THREE.Vector3(L / 2 + 4, -r.inp.S * L + r.inp.tw + 1.2, 1), kind: r.Vout > 4.5 ? 'alerta' : 'dato', prio: 4 },
    ];
    if (r.overtop) out.push({ id: 'encima', text: 'El agua pasa por encima de la vía', sub: `${es(r.Qover, 1)} m³/s`, at: new THREE.Vector3(0, road + 2.4, -10), kind: 'alerta', prio: 7 });
    const bx = r.inp.shape === 'cajon' ? `${es(r.inp.B ?? D, 1)} × ${es(D, 1)} m` : '';
    out.push({ id: 'tubo', text: r.inp.shape === 'cajon' ? (r.inp.barrels > 1 ? `${r.inp.barrels} cajones de ${bx}` : `Cajón de ${bx}`) : r.inp.barrels > 1 ? `${r.inp.barrels} tubos de ${es(D, 1)} m` : `Tubo de ${es(D, 1)} m`, at: new THREE.Vector3(L / 4, D + 0.6, 0.2), kind: 'lugar', prio: 2 });
    return out;
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    this.tracers.update(dt, this.stage.reducedMotion);
  }
}

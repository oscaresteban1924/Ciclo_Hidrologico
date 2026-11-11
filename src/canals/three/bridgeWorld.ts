// «El puente y el remanso» en 3D: una quebrada canalizada (rectangular de concreto, 8 m de ancho y paredes de 3 m)
// que pasa bajo un puente vehicular. La pared del frente es de vidrio y la orilla de ese lado está cortada para ver
// el perfil del agua calculado. La línea rayada marca la profundidad normal: lo que el agua quede por encima es el
// remanso que causa el puente. Si se tapa con palos y basura, el agua sube; si llega al tablero, pasa a presión, y
// si sube más, pasa por encima. Donde supera las paredes, sale a la orilla de enfrente, donde están las casas.
// Una quebrada y unas casas ilustrativas: no son un lugar de Medellín.

import * as THREE from 'three';
import { CREEK, DEBRIS, PIER_A, type BridgeResult } from '../hydraulics';
import { bridgeSurface } from '../profiles';
import { concreteMaterial, houses, rng, trees, WALLS, type HouseSpot, type TreeSpot } from '../../quality/three/kit';
import type { QStage, StageLabel, StageView } from '../../quality/three/stage';
import { Tracers, WaterBody, glassMaterial, polyline, setPolyline, slab, stationField, type Station } from './canalKit';

const X0 = -220;
const X1 = 80;
const HB = CREEK.b / 2;
const BRIDGE = 3;

export class BridgeWorld {
  private stage: QStage;
  private time = { value: 0 };
  private dyn = new THREE.Group();
  private water: WaterBody;
  private flood: WaterBody;
  private tracers: Tracers;
  private tracersOn = false;
  private normal: THREE.Line;
  private r: BridgeResult | null = null;
  private built = '';
  views: Record<'general' | 'puente' | 'remanso', StageView> = {
    general: { eye: [-55, 16, 62], target: [-45, 1, 0], fit: 150 },
    puente: { eye: [-26, 6, 26], target: [-2, 2, 0], fit: 40 },
    remanso: { eye: [30, 12, 30], target: [-80, 2, 0], fit: 120 },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(120);
    stage.controls.minDistance = 4;
    sc.add(this.dyn);
    this.water = new WaterBody(this.time);
    this.water.setColor('#5f8e8a');
    sc.add(this.water.group);
    // agua que sale a la orilla de atrás (la de las casas): se dibuja al nivel del agua del canal
    this.flood = new WaterBody(this.time, { side: false, opacity: 0.8 });
    this.flood.setColor('#6f8f86');
    this.flood.group.position.z = -HB - 30.3;
    sc.add(this.flood.group);
    this.tracers = new Tracers(420, 0.07);
    sc.add(this.tracers.mesh);
    this.normal = polyline('#17324d');
    sc.add(this.normal);
    stage.view(this.views.general, false);
  }

  private bed(x: number): number {
    return -(this.r?.inp.S ?? 0.003) * x;
  }

  private build(r: BridgeResult): void {
    for (const c of [...this.dyn.children]) {
      this.dyn.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const R = rng(17);
    const S = r.inp.S;
    const conc = concreteMaterial('#bdb8ae');
    const glass = glassMaterial(0.12);
    const grass = new THREE.MeshStandardMaterial({ color: '#6a9a48', roughness: 1 });
    const soil = new THREE.MeshStandardMaterial({ color: '#7a5a3c', roughness: 1 });
    // el canal va inclinado: se arma en un grupo girado con la pendiente
    const tilt = new THREE.Group();
    tilt.rotation.z = -Math.atan(S);
    const len = X1 - X0, cx = (X0 + X1) / 2;
    tilt.add(slab(conc, X0, X1, -0.5, 0, -HB - 0.3, HB + 0.3));
    tilt.add(slab(conc, X0, X1, -0.5, CREEK.H, -HB - 0.3, -HB));
    tilt.add(slab(glass, X0, X1, 0, CREEK.H, HB, HB + 0.04, false));
    // orilla de atrás (con casas) y el corte del frente
    tilt.add(slab(grass, X0, X1, -3, CREEK.H, -HB - 60, -HB - 0.3, false));
    tilt.add(slab(soil, X0, X1, -3, -0.5, -HB - 0.3, HB + 0.3, false));
    void len;
    void cx;
    this.dyn.add(tilt);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(600, 300), new THREE.MeshStandardMaterial({ color: '#6c9a4a', roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    far.position.set(-70, -3, 140);
    far.receiveShadow = true;
    this.dyn.add(far);
    // casas en la orilla de atrás y árboles
    const hs: HouseSpot[] = [];
    for (let x = X0 + 10; x < X1 - 8; x += 9 + R() * 5) {
      if (Math.abs(x) < 14) continue;
      const d = 7 + R() * 3;
      hs.push({ x, y: this.bed(x) + CREEK.H, z: -HB - 9 - d / 2 - R() * 4, w: 6 + R() * 2, d, h: 2.8 * (1 + Math.floor(R() * 3)), rot: (R() - 0.5) * 0.05, wall: WALLS[Math.floor(R() * WALLS.length)] });
    }
    this.dyn.add(houses(hs));
    const ts: TreeSpot[] = [];
    for (let k = 0; k < 40; k++) {
      const x = X0 + R() * (X1 - X0);
      ts.push({ x, y: this.bed(x) + CREEK.H, z: -HB - 3 - R() * 3, r: 1.2 + R() });
    }
    this.dyn.add(trees(ts, 9));
    // el puente: estribos que angostan la abertura, tablero, baranda y la vía que cruza
    const yb = this.bed(0);
    const half = r.inp.span / 2;
    const deckTop = r.inp.soffit + CREEK.deck;
    if (half < HB - 0.01) {
      for (const sg of [-1, 1]) this.dyn.add(slab(conc, -BRIDGE, BRIDGE, yb - 0.5, yb + deckTop, sg > 0 ? half : -HB - 0.3, sg > 0 ? HB + 0.3 : -half));
    }
    this.dyn.add(slab(conc, -BRIDGE, BRIDGE, yb + r.inp.soffit, yb + deckTop, -HB - 14, HB + 0.4));
    // pilas de punta y cola semicirculares bajo el tablero (dividen la abertura en partes iguales)
    const np = r.inp.piers ?? 0;
    for (let k = 0; k < np; k++) {
      const zc = -half + ((k + 1) * 2 * half) / (np + 1);
      const ra = PIER_A / 2, len = 2 * BRIDGE - 0.6;
      const sh = new THREE.Shape();
      sh.moveTo(-len / 2 + ra, -ra);
      sh.lineTo(len / 2 - ra, -ra);
      sh.absarc(len / 2 - ra, 0, ra, -Math.PI / 2, Math.PI / 2, false);
      sh.lineTo(-len / 2 + ra, ra);
      sh.absarc(-len / 2 + ra, 0, ra, Math.PI / 2, (3 * Math.PI) / 2, false);
      const g = new THREE.ExtrudeGeometry(sh, { depth: r.inp.soffit + 0.5, bevelEnabled: false, curveSegments: 10 });
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, conc);
      m.position.set(0, yb - 0.5, zc);
      m.castShadow = m.receiveShadow = true;
      this.dyn.add(m);
    }
    this.dyn.add(slab(new THREE.MeshStandardMaterial({ color: '#3d4247', roughness: 0.9 }), -BRIDGE + 0.2, BRIDGE - 0.2, yb + deckTop, yb + deckTop + 0.05, -HB - 14, HB + 0.4));
    for (const xs of [-BRIDGE + 0.15, BRIDGE - 0.15]) this.dyn.add(slab(new THREE.MeshStandardMaterial({ color: '#6f777e', metalness: 0.5, roughness: 0.4 }), xs - 0.06, xs + 0.06, yb + deckTop, yb + deckTop + 1, -HB - 14, HB + 0.4));
    // la vía sube a la orilla si el tablero está más alto que la pared
    if (deckTop > CREEK.H) this.dyn.add(slab(soil, -BRIDGE - 2, BRIDGE + 2, yb + CREEK.H, yb + deckTop, -HB - 30, -HB - 14, false));
    this.dyn.add(slab(new THREE.MeshStandardMaterial({ color: '#3d4247', roughness: 0.9 }), -BRIDGE, BRIDGE, yb + Math.max(CREEK.H, deckTop) + 0.01, yb + Math.max(CREEK.H, deckTop) + 0.05, -HB - 60, -HB - 14));
    // palos y basura contra la cara de aguas arriba del puente
    const block = DEBRIS[r.inp.debris].block;
    if (block > 0) {
      const n = Math.round(block * 60);
      const logs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.15, 1, 7), new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 1 }), n);
      const trash = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }), n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3();
      const cols = ['#e9e4d8', '#3a7bd5', '#d64c3b', '#f2c230', '#5aa361', '#26282b'];
      const yTop = Math.min(r.yU, r.inp.soffit) ;
      for (let k = 0; k < n; k++) {
        // se acumulan desde los estribos hacia el centro, a la altura del agua
        const side = k % 2 ? 1 : -1;
        const zc = side * (half - R() * half * block * 1.6);
        const y = yb + Math.max(0.2, yTop - 0.3 - R() * Math.min(1.6, yTop * 0.7));
        q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, Math.PI / 2 + (R() - 0.5)));
        logs.setMatrixAt(k, m4.compose(p.set(-BRIDGE - 0.4 - R() * 1.2, y, zc), q, sv.set(1, 1.5 + R() * 2.5, 1)));
        trash.setMatrixAt(k, m4.compose(p.set(-BRIDGE - 0.3 - R() * 1.5, y + 0.2, side * (half - R() * half * block * 1.5)), q, sv.setScalar(0.6 + R() * 0.7)));
        trash.setColorAt(k, new THREE.Color(cols[k % cols.length]));
      }
      logs.castShadow = true;
      this.dyn.add(logs, trash);
    }
  }

  set(r: BridgeResult): void {
    this.r = r;
    const key = `${r.inp.S}-${r.inp.span}-${r.inp.soffit}-${r.inp.debris}-${r.inp.piers ?? 0}-${Math.round(Math.min(r.yU, r.inp.soffit) * 10)}`;
    if (key !== this.built) {
      this.build(r);
      this.built = key;
    }
    const st: Station[] = [], fl: Station[] = [];
    for (const p of bridgeSurface(r, X0, X1)) {
      st.push({ x: p.x, bed: p.bed, depth: p.y, halfW: HB - 0.02, foam: p.foam, vel: r.inp.Q / (CREEK.b * Math.max(0.05, p.y)) });
      fl.push({ x: p.x, bed: p.bed + CREEK.H, depth: p.y > CREEK.H ? p.y - CREEK.H : -0.08, halfW: 30, foam: 0.05 });
    }
    this.water.update(st);
    this.flood.group.visible = !!r.spill;
    if (r.spill) {
      this.flood.update(fl);
      this.flood.setSpeed(0.4);
    }
    // trazadores cerca del puente: se frenan en el remanso y se aceleran al pasar
    this.tracers.set(stationField(st), Math.max(X0, -60), Math.min(X1, 40), [HB - 0.8, HB - 0.06], null, !this.tracersOn);
    this.tracersOn = true;
    setPolyline(
      this.normal,
      [new THREE.Vector3(X0, this.bed(X0) + r.yn, HB + 0.08), new THREE.Vector3(X1, this.bed(X1) + r.yn, HB + 0.08)],
      [1.2, 0.8],
    );
    this.stage.setLabels(this.labels());
  }

  private labels(): StageLabel[] {
    const r = this.r!;
    const es = (x: number, d = 2) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const flowTxt: Record<BridgeResult['flow'], string> = { libre: 'pasa libre', estrangulado: 'el puente estrangula el paso', presion: 'pasa a presión bajo el tablero', encima: 'el agua pasa por encima del puente' };
    const out: StageLabel[] = [
      { id: 'puente', text: 'Puente', sub: flowTxt[r.flow], at: new THREE.Vector3(0, this.bed(0) + r.inp.soffit + CREEK.deck + 2.2, 0), kind: r.flow === 'libre' ? 'lugar' : 'alerta', prio: 6 },
      { id: 'normal', text: 'Profundidad normal', sub: `${es(r.yn)} m (sin puente)`, at: new THREE.Vector3(40, this.bed(40) + r.yn + 0.9, HB), kind: 'dato', prio: 3 },
    ];
    if (r.rise > 0.02) out.push({ id: 'sube', text: `El agua sube ${es(r.rise)} m en el puente`, sub: r.backwater > 1 ? `remanso de unos ${Math.round(r.backwater).toLocaleString('es-CO')} m aguas arriba` : undefined, at: new THREE.Vector3(-14, this.bed(-14) + r.yU + 1.6, 0), kind: 'dato', prio: 5 });
    if (r.spill) out.push({ id: 'sale', text: 'Se sale del canal', sub: `desde ${Math.round(-r.spill[0]).toLocaleString('es-CO')} m antes del puente`, at: new THREE.Vector3(Math.max(-200, r.spill[0] / 2), this.bed(r.spill[0] / 2) + CREEK.H + 1.4, -HB - 6), kind: 'alerta', prio: 5 });
    if (r.jumpX !== null) out.push({ id: 'resalto', text: 'Resalto', sub: 'el agua rápida choca con la represada', at: new THREE.Vector3(r.jumpX, this.bed(r.jumpX) + r.yU + 1, 0), kind: 'dato', prio: 4 });
    if (r.backwater > -X0) out.push({ id: 'lejos', text: 'El remanso sigue más arriba', sub: `hasta unos ${Math.round(r.backwater).toLocaleString('es-CO')} m del puente`, at: new THREE.Vector3(X0 + 10, this.bed(X0) + r.yn + 2, 0), kind: 'dato', prio: 2 });
    return out;
  }

  update(dt: number, t: number): void {
    this.time.value = t;
    this.tracers.update(dt, this.stage.reducedMotion);
  }
}


// Piezas de máquinas para las maquetas 3D: tuberías con el flujo pintado en movimiento, bridas, manómetros con su
// aguja, válvulas de compuerta con volante, bombas centrífugas (con la carcasa opaca o de vidrio para ver el
// rodete), motores con aletas, rodetes de turbinas (Pelton, Francis, Kaplan y Michell-Banki), postes de energía y
// casas con ventanas que se encienden. Todo en metros.

import * as THREE from 'three';
import { lookMaterial } from './look';

// ------------------------------------------------------------------ materiales

const cache = new Map<string, THREE.MeshStandardMaterial>();
/** Metal pintado (esmalte industrial): un poco brillante, con el grano del acabado. */
export function paint(color: string, rough = 0.42, metal = 0.25): THREE.MeshStandardMaterial {
  const k = `p|${color}|${rough}|${metal}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const m = lookMaterial(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }), { detail: 0.05, scale: 6 });
  cache.set(k, m);
  return m;
}
/** Acero o hierro sin pintar. */
export function steel(color = '#a7b0b8', rough = 0.32): THREE.MeshStandardMaterial {
  const k = `s|${color}|${rough}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.85 });
  cache.set(k, m);
  return m;
}
/** Vidrio o acrílico transparente. */
export function glass(opacity = 0.16, color = '#d8eef8'): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, metalness: 0, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.1 });
  m.userData.noLook = true;
  return m;
}

export const PAINT = { pump: '#2d6ea6', motor: '#35618a', guard: '#e3a51c', pipe: '#6c7a86', valve: '#b8342a', base: '#3b4148', gauge: '#2b2f33' };

// ------------------------------------------------------------------ tuberías

/** Recorrido de tubería por puntos con codos redondeados de radio `bend` (sin quiebres en las esquinas). */
export function roundedPath(points: THREE.Vector3[], bend: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let from = points[0].clone();
  for (let k = 1; k < points.length - 1; k++) {
    const a = points[k - 1], b = points[k], c = points[k + 1];
    const da = a.distanceTo(b), dc = c.distanceTo(b);
    const r = Math.min(bend, da * 0.45, dc * 0.45);
    const p0 = b.clone().add(a.clone().sub(b).setLength(r));
    const p1 = b.clone().add(c.clone().sub(b).setLength(r));
    if (from.distanceTo(p0) > 1e-4) path.add(new THREE.LineCurve3(from, p0));
    path.add(new THREE.QuadraticBezierCurve3(p0, b.clone(), p1));
    from = p1;
  }
  path.add(new THREE.LineCurve3(from, points[points.length - 1].clone()));
  return path;
}

/**
 * Tubería con el flujo pintado: flechas claras que avanzan por la superficie a la velocidad del agua (o a una
 * escala declarada). `setFlow(v)` fija la velocidad [m/s]; `tick(dt)` avanza las flechas.
 */
export class FlowPipe {
  readonly mesh: THREE.Mesh;
  readonly length: number;
  private u = { uPhase: { value: 0 }, uOn: { value: 0 }, uLen: { value: 1 }, uSpace: { value: 1 }, uGain: { value: 0.5 }, uTint: { value: new THREE.Color('#3f9fe6') } };
  private speed = 0;
  private on = 0;
  constructor(curve: THREE.Curve<THREE.Vector3>, radius: number, color = PAINT.pipe, opts: { radial?: number; spacing?: number; tint?: string; metal?: number; rough?: number; gain?: number } = {}) {
    this.length = curve.getLength();
    const seg = Math.max(16, Math.min(900, Math.round(this.length / Math.max(0.05, radius * 1.2))));
    const geo = new THREE.TubeGeometry(curve, seg, radius, opts.radial ?? 18, false);
    this.u.uLen.value = this.length;
    this.u.uSpace.value = opts.spacing ?? Math.max(0.5, radius * 12);
    if (opts.tint) this.u.uTint.value.set(opts.tint);
    if (opts.gain !== undefined) this.u.uGain.value = opts.gain;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.45, metalness: opts.metal ?? 0.3 });
    mat.userData.noLook = true;
    const u = this.u;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFU;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFU = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFU;\nuniform float uPhase, uOn, uLen, uSpace, uGain;\nuniform vec3 uTint;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // flechas en «V» que avanzan con el agua, en dos filas alrededor del tubo
            float s = vFU.x * uLen / uSpace - uPhase;
            float a = abs(fract(vFU.y * 2.0) - 0.5);
            float c = fract(s - a * 0.7);
            float arrow = smoothstep(0.0, 0.04, c) * (1.0 - smoothstep(0.1, 0.15, c)) * step(a, 0.36);
            diffuseColor.rgb = mix(diffuseColor.rgb, uTint, arrow * uOn * uGain);
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'flowpipe1';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }
  /** Velocidad de las flechas [m/s] (0 apaga las flechas poco a poco). */
  setFlow(v: number): void {
    this.speed = v;
  }
  tick(dt: number): void {
    this.u.uPhase.value += (dt * this.speed) / this.u.uSpace.value;
    this.on += ((this.speed > 1e-3 ? 1 : 0) - this.on) * Math.min(1, dt * 3);
    this.u.uOn.value = this.on;
  }
}

/** Brida con pernos en el punto `at`, perpendicular a la dirección `dir`. */
export function flange(r: number, at: THREE.Vector3, dir: THREE.Vector3, mat: THREE.Material = steel('#8d969e', 0.45)): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.55, r * 1.55, r * 0.32, 28), mat);
  g.add(disc);
  const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(r * 0.09, r * 0.09, r * 0.5, 6), steel('#5f666c', 0.4), 8);
  const M = new THREE.Matrix4();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    bolts.setMatrixAt(k, M.makeTranslation(Math.cos(a) * r * 1.3, 0, Math.sin(a) * r * 1.3));
  }
  g.add(bolts);
  g.position.copy(at);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

// ------------------------------------------------------------------ manómetro

/**
 * Manómetro de carátula: escala de `min` a `max` con su unidad, aguja que se mueve suave hacia el valor y zona
 * roja opcional. La cara mira hacia +z del grupo.
 */
export class Gauge {
  readonly group = new THREE.Group();
  private needle: THREE.Group;
  private target = 0;
  private now = 0;
  constructor(
    private min: number,
    private max: number,
    unit: string,
    opts: { r?: number; red?: [number, number]; title?: string; step?: number } = {},
  ) {
    const r = opts.r ?? 0.12;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#fbfaf6';
    c.beginPath();
    c.arc(128, 128, 126, 0, Math.PI * 2);
    c.fill();
    const ang = (v: number) => (-225 + ((v - min) / (max - min)) * 270) * (Math.PI / 180);
    if (opts.red) {
      c.strokeStyle = '#c0392b';
      c.lineWidth = 12;
      c.beginPath();
      c.arc(128, 128, 100, ang(opts.red[0]), ang(opts.red[1]));
      c.stroke();
    }
    const step = opts.step ?? niceStep((max - min) / 8);
    c.strokeStyle = '#1d242b';
    c.fillStyle = '#1d242b';
    c.font = 'bold 22px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let v = min, k = 0; v <= max + 1e-9; v += step / 5, k++) {
      const a = ang(v), major = k % 5 === 0;
      c.lineWidth = major ? 4 : 2;
      c.beginPath();
      c.moveTo(128 + Math.cos(a) * (major ? 86 : 96), 128 + Math.sin(a) * (major ? 86 : 96));
      c.lineTo(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110);
      c.stroke();
      if (major) c.fillText(String(Math.round(v * 10) / 10).replace('.', ','), 128 + Math.cos(a) * 66, 128 + Math.sin(a) * 66);
    }
    c.font = '600 20px system-ui, sans-serif';
    c.fillStyle = '#44505b';
    c.fillText(unit, 128, 178);
    if (opts.title) {
      c.font = '16px system-ui, sans-serif';
      c.fillText(opts.title, 128, 204);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    face.position.z = 0.012;
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.09, 10, 40), steel('#c4ccd3', 0.25));
    bezel.position.z = 0.016;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.03, 40), paint(PAINT.gauge, 0.5, 0.2));
    body.rotation.x = Math.PI / 2;
    const cover = new THREE.Mesh(new THREE.CircleGeometry(r, 40), glass(0.12, '#ffffff'));
    cover.position.z = 0.03;
    this.needle = new THREE.Group();
    const nd = new THREE.Mesh(new THREE.BoxGeometry(r * 0.82, r * 0.05, 0.004), new THREE.MeshBasicMaterial({ color: '#c0392b' }));
    nd.position.x = r * 0.33;
    const hub = new THREE.Mesh(new THREE.CircleGeometry(r * 0.08, 16), new THREE.MeshBasicMaterial({ color: '#1d242b' }));
    hub.position.z = 0.002;
    this.needle.add(nd, hub);
    this.needle.position.z = 0.02;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.12, r * 0.9, 10), steel('#b08d3b', 0.3));
    stem.position.y = -r * 1.4;
    this.group.add(body, face, bezel, cover, this.needle, stem);
    this.set(min);
    this.now = this.target;
    this.apply();
  }
  set(v: number): void {
    this.target = Math.max(this.min - (this.max - this.min) * 0.02, Math.min(this.max * 1.02, v));
  }
  private apply(): void {
    // la escala va de −225° a 45° en el sentido de la pantalla (y hacia abajo); en 3D, y hacia arriba
    const a = (-225 + ((this.now - this.min) / (this.max - this.min)) * 270) * (Math.PI / 180);
    this.needle.rotation.z = -a;
  }
  tick(dt: number, t = 0): void {
    this.now += (this.target - this.now) * Math.min(1, dt * 4);
    // un temblor pequeño, como en una bomba que trabaja
    const jitter = Math.sin(t * 37) * 0.003 * (this.max - this.min);
    const keep = this.now;
    this.now += jitter;
    this.apply();
    this.now = keep;
  }
}

function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

// ------------------------------------------------------------------ válvula de compuerta

/** Válvula de compuerta para una tubería horizontal de radio r a lo largo de x; el volante gira y el vástago sube. */
export class GateValve {
  readonly group = new THREE.Group();
  private wheel: THREE.Group;
  private stem: THREE.Mesh;
  private open = 1;
  private shown = 1;
  constructor(private r: number) {
    const body = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 20, 14), paint(PAINT.valve, 0.5, 0.2));
    body.scale.set(0.9, 1.15, 0.9);
    const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 1.2, r * 2.4, 16), paint(PAINT.valve, 0.5, 0.2));
    bonnet.position.y = r * 2.2;
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, r * 3, 8), steel('#d4dadf', 0.2));
    this.wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.5, r * 0.13, 8, 28), paint('#a32a22', 0.45, 0.3));
    rim.rotation.x = Math.PI / 2;
    this.wheel.add(rim);
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.08, r * 3, 6), paint('#a32a22', 0.45, 0.3));
      sp.rotation.z = Math.PI / 2;
      sp.rotation.y = (k / 3) * Math.PI;
      this.wheel.add(sp);
    }
    for (const fl of [-1, 1]) this.group.add(flange(r, new THREE.Vector3(fl * r * 1.6, 0, 0), new THREE.Vector3(1, 0, 0)));
    this.group.add(body, bonnet, this.stem, this.wheel);
    this.group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.apply();
  }
  setOpen(o: number): void {
    this.open = Math.max(0, Math.min(1, o));
  }
  private apply(): void {
    const r = this.r;
    this.wheel.position.y = r * 3.7;
    this.stem.position.y = r * 3.4 + this.shown * r * 1.4;
  }
  tick(dt: number): void {
    const d = this.open - this.shown;
    this.shown += d * Math.min(1, dt * 3);
    this.wheel.rotation.y += d * Math.min(1, dt * 3) * 18;
    this.apply();
  }
}

// ------------------------------------------------------------------ rodetes

/** Rodete de bomba centrífuga: disco, cubo y álabes curvados hacia atrás. Gira alrededor de su eje y local. */
export function impeller(r: number, h: number, blades = 6, color = '#c08a2b'): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.75 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h * 0.12, 40), mat);
  disc.position.y = -h / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.28, h, 20), mat);
  g.add(disc, hub);
  for (let k = 0; k < blades; k++) {
    // álabe: curva espiral de r·0,25 a r, hecha de una tira extruida
    const pts: THREE.Vector2[] = [];
    for (let j = 0; j <= 12; j++) {
      const u = j / 12, rr = r * (0.25 + 0.75 * u), a = -u * 1.1;
      pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
    }
    const shape = new THREE.Shape();
    shape.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) shape.lineTo(p.x, p.y);
    for (let j = pts.length - 1; j >= 0; j--) {
      const p = pts[j], n = new THREE.Vector2(-p.y, p.x).normalize().multiplyScalar(r * 0.035);
      shape.lineTo(p.x + n.x, p.y + n.y);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h * 0.88, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -h / 2 + h * 0.06, 0);
    const b = new THREE.Mesh(geo, mat);
    b.rotation.y = (k / blades) * Math.PI * 2;
    g.add(b);
  }
  return g;
}

/** Rueda Pelton: disco con cucharas dobles. Gira alrededor de su eje y local. */
export function peltonWheel(r: number, n = 18): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#b7bec5', roughness: 0.25, metalness: 0.85 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, r * 0.1, 40), mat);
  g.add(disc);
  const cup = new THREE.SphereGeometry(r * 0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(cup, mat);
      c.position.set(Math.cos(a) * r * 0.86, s * r * 0.07, Math.sin(a) * r * 0.86);
      c.rotation.set(0, -a, s * Math.PI * 0.5 + Math.PI / 2);
      g.add(c);
    }
  }
  return g;
}

/** Rodete Francis: corona, banda y álabes torcidos. Gira alrededor de su eje y local. */
export function francisRunner(r: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#c49a45', roughness: 0.28, metalness: 0.8 });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r, r * 0.18, 36), mat);
  crown.position.y = r * 0.35;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.7, r * 0.3, 36, 1, true), mat);
  band.position.y = -r * 0.1;
  (band.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  g.add(crown, band);
  for (let k = 0; k < 13; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 0.45, r * 0.03), mat);
    const a = (k / 13) * Math.PI * 2;
    b.position.set(Math.cos(a) * r * 0.62, r * 0.1, Math.sin(a) * r * 0.62);
    b.rotation.set(0.5, -a + 0.9, 0.3);
    g.add(b);
  }
  return g;
}

/** Hélice Kaplan: cubo y palas orientables. Gira alrededor de su eje y local. */
export function kaplanRunner(r: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#c0c6cc', roughness: 0.25, metalness: 0.85 });
  const hub = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 20, 14), mat);
  hub.scale.y = 1.4;
  g.add(hub);
  for (let k = 0; k < 5; k++) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -r * 0.12);
    shape.quadraticCurveTo(r * 0.7, -r * 0.35, r * 0.95, 0);
    shape.quadraticCurveTo(r * 0.7, r * 0.3, 0, r * 0.12);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: r * 0.03, bevelEnabled: false });
    const b = new THREE.Mesh(geo, mat);
    const a = (k / 5) * Math.PI * 2;
    b.rotation.set(Math.PI / 2 + 0.5, 0, 0);
    const holder = new THREE.Group();
    holder.add(b);
    holder.rotation.y = a;
    g.add(holder);
  }
  return g;
}

/** Tambor Michell-Banki: dos discos unidos por álabes curvos a lo largo del eje y. */
export function bankiRunner(r: number, len: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#aab3ba', roughness: 0.3, metalness: 0.8 });
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.08, 32), mat);
    d.position.y = (s * len) / 2;
    g.add(d);
  }
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, len, r * 0.03), mat);
    b.position.set(Math.cos(a) * r * 0.82, 0, Math.sin(a) * r * 0.82);
    b.rotation.y = -a + 0.7;
    g.add(b);
  }
  return g;
}

// ------------------------------------------------------------------ bomba centrífuga con su motor

/**
 * Bomba centrífuga de succión axial con su motor sobre una base. Eje de giro a lo largo de x; la succión entra por
 * −x, la descarga sale hacia arriba. `glass` deja ver el rodete por una carcasa transparente.
 * Puntos útiles en coordenadas del grupo: `suction` (boca de succión), `discharge` (boca de descarga).
 */
export class CentrifugalPump {
  readonly group = new THREE.Group();
  readonly suction: THREE.Vector3;
  readonly discharge: THREE.Vector3;
  readonly rotor: THREE.Group;
  private coupling: THREE.Group;
  private fan: THREE.Mesh;
  readonly casing: THREE.Mesh;
  constructor(opts: { R?: number; glass?: boolean; color?: string; motorLen?: number } = {}) {
    const R = opts.R ?? 0.32;
    const col = opts.color ?? PAINT.pump;
    const body = opts.glass ? glass(0.2, '#e6f4fb') : paint(col);
    const axisY = R * 1.9;
    // base
    const base = new THREE.Mesh(new THREE.BoxGeometry(R * 7.6, R * 0.35, R * 2.6), paint(PAINT.base, 0.6, 0.3));
    base.position.set(R * 2.1, R * 0.175, 0);
    base.receiveShadow = true;
    this.group.add(base);
    // carcasa en espiral: un cilindro y un abultamiento que crece hacia la descarga
    const volG = new THREE.Group();
    this.casing = new THREE.Mesh(new THREE.CylinderGeometry(R, R, R * 0.75, 40), body);
    this.casing.rotation.z = Math.PI / 2;
    volG.add(this.casing);
    const bulge = new THREE.Mesh(new THREE.TorusGeometry(R * 0.92, R * 0.3, 14, 40, Math.PI * 1.5), body);
    bulge.rotation.y = Math.PI / 2;
    bulge.rotation.x = Math.PI * 0.25;
    bulge.scale.set(1, 1, 1);
    volG.add(bulge);
    // boca de descarga tangente arriba y boca de succión axial
    const dis = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.36, R * 0.42, R * 1.1, 24), body);
    dis.position.set(0, R * 0.9, R * 0.62);
    volG.add(dis);
    const suc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.45, R * 0.5, R * 0.8, 24), body);
    suc.rotation.z = Math.PI / 2;
    suc.position.set(-R * 0.75, 0, 0);
    volG.add(suc);
    volG.position.set(0, axisY, 0);
    // pie de la carcasa
    const foot = new THREE.Mesh(new THREE.BoxGeometry(R * 0.6, axisY - R * 0.6, R * 1.2), paint(col));
    foot.position.set(R * 0.3, (axisY - R * 0.6) / 2 + R * 0.35, 0);
    this.group.add(volG, foot);
    this.group.add(flange(R * 0.42, new THREE.Vector3(-R * 1.18, axisY, 0), new THREE.Vector3(1, 0, 0)));
    this.group.add(flange(R * 0.36, new THREE.Vector3(0, axisY + R * 1.48, R * 0.62), new THREE.Vector3(0, 1, 0)));
    this.suction = new THREE.Vector3(-R * 1.25, axisY, 0);
    this.discharge = new THREE.Vector3(0, axisY + R * 1.55, R * 0.62);
    // rodete (visible si la carcasa es de vidrio)
    this.rotor = new THREE.Group();
    const imp = impeller(R * 0.8, R * 0.42, 6, '#c08a2b');
    imp.rotation.z = Math.PI / 2;
    this.rotor.add(imp);
    this.rotor.position.set(0, axisY, 0);
    this.rotor.visible = !!opts.glass;
    this.group.add(this.rotor);
    // soporte de rodamientos y acople con franjas (se ve girar)
    const brg = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.32, R * 0.4, R * 1.4, 20), paint(col));
    brg.rotation.z = Math.PI / 2;
    brg.position.set(R * 1.05, axisY, 0);
    const brgFoot = new THREE.Mesh(new THREE.BoxGeometry(R * 0.9, axisY - R * 0.35, R * 0.9), paint(col));
    brgFoot.position.set(R * 1.1, (axisY - R * 0.35) / 2 + R * 0.35, 0);
    this.group.add(brg, brgFoot);
    this.coupling = new THREE.Group();
    const stripeA = new THREE.MeshStandardMaterial({ color: '#2a2f35', roughness: 0.5, metalness: 0.6 });
    const stripeB = new THREE.MeshStandardMaterial({ color: '#f1c232', roughness: 0.45, metalness: 0.3 });
    for (let k = 0; k < 6; k++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.32, R * 0.32, R * 0.5, 8, 1, false, (k / 6) * Math.PI * 2, Math.PI / 3), k % 2 ? stripeA : stripeB);
      this.coupling.add(seg);
    }
    this.coupling.rotation.z = Math.PI / 2;
    this.coupling.position.set(R * 2.0, axisY, 0);
    this.group.add(this.coupling);
    // guarda abierta del acople (media caña)
    const guard = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, R * 0.5, R * 0.9, 20, 1, true, Math.PI * 0.15, Math.PI * 0.7), paint(PAINT.guard, 0.5, 0.2));
    (guard.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    guard.rotation.z = Math.PI / 2;
    guard.position.copy(this.coupling.position);
    this.group.add(guard);
    // motor con aletas de enfriamiento y tapa del ventilador
    const ml = opts.motorLen ?? R * 3.2;
    const mx = R * 2.45 + ml / 2;
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.75, R * 0.75, ml, 36), paint(PAINT.motor, 0.38, 0.3));
    motor.rotation.z = Math.PI / 2;
    motor.position.set(mx, axisY, 0);
    const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(ml * 0.9, R * 0.12, R * 0.035), paint(PAINT.motor, 0.38, 0.3), 24);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      Q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
      fins.setMatrixAt(k, M.compose(P.set(mx, axisY + Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8), Q, S));
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.8, R * 0.8, R * 0.5, 36), paint('#2c4d6e', 0.5, 0.3));
    cap.rotation.z = Math.PI / 2;
    cap.position.set(mx + ml / 2 + R * 0.25, axisY, 0);
    const grill = new THREE.CanvasTexture(grillCanvas());
    grill.colorSpace = THREE.SRGBColorSpace;
    this.fan = new THREE.Mesh(new THREE.CircleGeometry(R * 0.72, 32), new THREE.MeshStandardMaterial({ map: grill, roughness: 0.6, metalness: 0.4 }));
    this.fan.rotation.y = Math.PI / 2;
    this.fan.position.set(mx + ml / 2 + R * 0.51, axisY, 0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(R * 0.9, R * 0.5, R * 0.9), paint(PAINT.motor, 0.38, 0.3));
    box.position.set(mx - ml * 0.1, axisY + R * 0.95, 0);
    const motorFeet = new THREE.Mesh(new THREE.BoxGeometry(ml * 0.8, axisY - R * 0.6, R * 1.3), paint(PAINT.motor, 0.38, 0.3));
    motorFeet.position.set(mx, (axisY - R * 0.6) / 2 + R * 0.35, 0);
    this.group.add(motor, fins, cap, this.fan, box, motorFeet);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.material as THREE.Material).transparent) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }
  /** Gira el rotor a `w` rad/s (giro de presentación, no a las rpm reales). */
  spin(dt: number, w: number): void {
    this.coupling.rotation.x += w * dt;
    this.rotor.rotation.x += w * dt;
    this.fan.rotation.x += w * dt;
  }
}

function grillCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#2c4d6e';
  c.fillRect(0, 0, 128, 128);
  c.strokeStyle = '#162636';
  c.lineWidth = 4;
  for (let r = 14; r < 64; r += 9) {
    c.beginPath();
    c.arc(64, 64, r, 0, Math.PI * 2);
    c.stroke();
  }
  c.lineWidth = 6;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    c.beginPath();
    c.moveTo(64, 64);
    c.lineTo(64 + Math.cos(a) * 64, 64 + Math.sin(a) * 64);
    c.stroke();
  }
  return cv;
}

// ------------------------------------------------------------------ energía

/** Poste de energía de concreto con su cruceta, en `at`. Devuelve también los puntos de amarre de los cables. */
export function powerPole(at: THREE.Vector3, h = 11, rotY = 0): { group: THREE.Group; tips: THREE.Vector3[] } {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, h, 10), lookMaterial(new THREE.MeshStandardMaterial({ color: '#b9b5ac', roughness: 0.9 }), { detail: 0.12 }));
  pole.position.y = h / 2;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), lookMaterial(new THREE.MeshStandardMaterial({ color: '#a9a59c', roughness: 0.9 }), { detail: 0.12 }));
  arm.position.y = h - 0.5;
  g.add(pole, arm);
  const ins = new THREE.CylinderGeometry(0.05, 0.07, 0.22, 8);
  const insMat = new THREE.MeshStandardMaterial({ color: '#6c5a3f', roughness: 0.3, metalness: 0.1 });
  const tipsLocal = [-0.95, 0, 0.95].map((x) => new THREE.Vector3(x, h - 0.32, 0));
  for (const t of tipsLocal) {
    const i = new THREE.Mesh(ins, insMat);
    i.position.copy(t).add(new THREE.Vector3(0, -0.06, 0));
    g.add(i);
  }
  g.position.copy(at);
  g.rotation.y = rotY;
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  g.updateMatrixWorld(true);
  return { group: g, tips: tipsLocal.map((t) => t.clone().applyMatrix4(g.matrixWorld)) };
}

/** Cable entre dos puntos con su catenaria (flecha `sag`). */
export function wire(a: THREE.Vector3, b: THREE.Vector3, sag: number, mat: THREE.Material): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 20; k++) {
    const u = k / 20;
    pts.push(a.clone().lerp(b, u).add(new THREE.Vector3(0, -4 * sag * u * (1 - u), 0)));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.018, 5, false), mat);
}

// ------------------------------------------------------------------ casas con ventanas encendidas

export interface LitHouse {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  wall: string;
  /** Color del techo (si no, uno de la lista). */
  roof?: string;
}

/**
 * Casas con techo de dos aguas y ventanas que se encienden: `setLit(f)` enciende la fracción f de las casas
 * (cada una tiene su número al azar), con un brillo cálido que se nota aun de día.
 */
export class LitHouses {
  readonly group = new THREE.Group();
  private u = { uLit: { value: 0 }, uGlow: { value: 1 } };
  private lit = 0;
  private shown = 0;
  constructor(spots: LitHouse[], seed = 1) {
    const n = Math.max(1, spots.length);
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const rnd = new Float32Array(n);
    let x = seed * 9301 + 49297;
    for (let k = 0; k < n; k++) {
      x = (x * 16807) % 2147483647;
      rnd[k] = x / 2147483647;
    }
    box.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 1));
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    mat.userData.noLook = true;
    const u = this.u;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRnd;\nvarying float vRnd; varying vec3 vL; varying vec3 vS; varying vec3 vN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRnd = aRnd; vL = position; vN = normal; vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLit, uGlow;\nvarying float vRnd; varying vec3 vL; varying vec3 vS; varying vec3 vN;\nfloat litWin = 0.0;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          if (vN.y < 0.5 && vN.y > -0.5) {
            float hc = (abs(vN.x) > 0.5 ? vL.z * vS.z : vL.x * vS.x) + 20.0;
            float vc = vL.y * vS.y;
            float fx = fract(hc / 2.2), fy = fract(vc / 2.6);
            float win = step(0.3, fx) * step(fx, 0.7) * step(0.35, fy) * step(fy, 0.75) * step(0.4, vc) * step(vc, vS.y - 0.3);
            float on = step(vRnd, uLit);
            litWin = win * on;
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.15, 0.19, 0.24), vec3(1.0, 0.86, 0.55), on), win * 0.9);
            diffuseColor.rgb *= 0.92 + 0.08 * step(0.5, abs(vN.z));
          }`,
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.72, 0.32) * litWin * 1.6 * uGlow;');
    };
    mat.customProgramCacheKey = () => 'lithouses1';
    const walls = new THREE.InstancedMesh(box, mat, n);
    // techos de dos aguas
    const roofGeo = new THREE.CylinderGeometry(0.72, 0.72, 1, 3, 1);
    roofGeo.rotateZ(Math.PI / 2);
    roofGeo.rotateX(Math.PI / 6 + Math.PI / 2);
    roofGeo.translate(0, 0.36, 0);
    const roofs = new THREE.InstancedMesh(roofGeo, lookMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }), { detail: 0.1 }), n);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
    const ROOFS = ['#9c4a33', '#8f4430', '#a8553a', '#7d7f80'];
    spots.forEach((s, i) => {
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
      walls.setMatrixAt(i, M.compose(P.set(s.x, s.y - 0.4, s.z), Q, S.set(s.w, s.h + 0.4, s.d)));
      walls.setColorAt(i, C.set(s.wall));
      roofs.setMatrixAt(i, M.compose(P.set(s.x, s.y + s.h - 0.02, s.z), Q, S.set(s.w * 1.12, s.d * 0.62, s.d * 1.12)));
      roofs.setColorAt(i, C.set(s.roof ?? ROOFS[i % ROOFS.length]));
    });
    walls.count = roofs.count = spots.length;
    for (const m of [walls, roofs]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    this.group.add(walls, roofs);
  }
  /** Fracción de casas encendidas (0 a 1). */
  setLit(f: number): void {
    this.lit = Math.max(0, Math.min(1, f));
  }
  tick(dt: number, t: number): void {
    this.shown += (this.lit - this.shown) * Math.min(1, dt * 2.5);
    this.u.uLit.value = this.shown;
    this.u.uGlow.value = 0.92 + 0.08 * Math.sin(t * 2.3);
  }
}

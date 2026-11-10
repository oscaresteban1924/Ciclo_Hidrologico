// Tormenta viva: techo de nubes sobre el valle y rayos lejanos. Son ILUSTRATIVOS: el modelo no calcula la
// electricidad de la tormenta. Solo aparecen con aguaceros fuertes (la intensidad sí es la calculada): sin
// lluvia no hay rayos, y con más lluvia caen más seguido, con un máximo de 8 por minuto y nunca dos con menos de
// 4 s entre sí. Cada rayo es un solo destello suave (sin parpadeo), muy por debajo de los 3 destellos por segundo
// que las pautas de accesibilidad (WCAG 2.3.1) señalan como riesgo. Con movimiento reducido no hay destellos.

import * as THREE from 'three';

/** Separación mínima entre dos rayos [s]. */
export const MIN_GAP_S = 4;

export interface StrikeInfo {
  /** Distancia horizontal al centro del sector [m]. */
  distM: number;
}

/** Rayos por minuto (tiempo real) según la intensidad de lluvia [mm/h]. */
export function strikeRate(mmh: number): number {
  if (mmh < 35) return 0;
  return Math.min(8, (mmh - 35) / 12);
}

export class StormSky {
  readonly group = new THREE.Group();
  private deck: THREE.Mesh;
  private deckMat: THREE.MeshBasicMaterial;
  private bolts: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; age: number; life: number }[] = [];
  private timer = 6;
  private flashT = 99;
  private flashPeak = 0;
  private tex: THREE.CanvasTexture | null = null;
  /** Destello actual [0–1] (para la luz de la escena). */
  flash = 0;
  /** Rayos dibujados desde que se creó (para verificar). */
  strikes = 0;
  /** Último rayo (para el trueno). */
  onStrike: ((s: StrikeInfo) => void) | null = null;
  private rnd: () => number;

  constructor(
    private baseY: number,
    seed: number,
    private groundY: ((x: number, z: number) => number) | null,
  ) {
    let s = seed >>> 0 || 1;
    this.rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    this.deckMat = new THREE.MeshBasicMaterial({ color: '#59626b', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      if (g) {
        g.fillStyle = 'rgba(255,255,255,0)';
        g.fillRect(0, 0, 256, 256);
        for (let k = 0; k < 90; k++) {
          const x = this.rnd() * 256, y = this.rnd() * 256, r = 18 + this.rnd() * 46;
          for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
            const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
            grd.addColorStop(0, `rgba(255,255,255,${0.25 + this.rnd() * 0.3})`);
            grd.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grd;
            g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
          }
        }
        this.tex = new THREE.CanvasTexture(c);
        this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
        this.tex.repeat.set(7, 7);
        this.deckMat.alphaMap = this.tex;
      }
    }
    // techo de nubes: se desvanece hacia los bordes (sin una línea recta en el cielo) y entra en la bruma
    const geo = new THREE.PlaneGeometry(9000, 9000, 24, 24);
    const pa = geo.getAttribute('position') as THREE.BufferAttribute;
    const ca = new Float32Array(pa.count * 4);
    for (let i = 0; i < pa.count; i++) {
      const r = Math.hypot(pa.getX(i), pa.getY(i));
      ca.set([1, 1, 1, 1 - THREE.MathUtils.smoothstep(r, 2200, 4400)], i * 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(ca, 4));
    this.deck = new THREE.Mesh(geo, this.deckMat);
    this.deck.rotation.x = Math.PI / 2;
    this.deck.position.y = baseY + 650;
    this.deck.renderOrder = -1;
    this.deck.visible = false;
    this.group.add(this.deck);
  }

  private makeBolt(x: number, z: number, top: number, bottom: number): THREE.Mesh {
    const pts: THREE.Vector3[] = [];
    // trazo quebrado: pasos cortos con desvíos bruscos que vuelven hacia la vertical del punto de impacto
    const n = 24;
    let px = x, pz = z;
    for (let i = 0; i <= n; i++) {
      const y = top + ((bottom - top) * i) / n;
      pts.push(new THREE.Vector3(px, y, pz));
      px += (this.rnd() - 0.5) * 75 - (px - x) * 0.25;
      pz += (this.rnd() - 0.5) * 75 - (pz - z) * 0.25;
    }
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
    // una rama
    const geoms: THREE.BufferGeometry[] = [new THREE.TubeGeometry(path, 72, 2.6, 4, false)];
    const j = 5 + Math.floor(this.rnd() * 10);
    const bp = new THREE.CurvePath<THREE.Vector3>();
    let q = pts[j].clone();
    for (let k = 0; k < 5; k++) {
      const nq = q.clone().add(new THREE.Vector3((this.rnd() - 0.3) * 80, -(top - bottom) / 24, (this.rnd() - 0.5) * 80));
      bp.add(new THREE.LineCurve3(q, nq));
      q = nq;
    }
    geoms.push(new THREE.TubeGeometry(bp, 15, 1.6, 4, false));
    const mat = new THREE.MeshBasicMaterial({ color: '#e6edff', transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const mesh = new THREE.Mesh(geoms[0], mat);
    mesh.add(new THREE.Mesh(geoms[1], mat));
    return mesh;
  }

  /**
   * @param mmh lluvia calculada que se aplica ahora [mm/h]; @param storm nivel de tormenta [0–1];
   * @param dt tiempo real [s]; @param reduced movimiento reducido.
   */
  update(dt: number, mmh: number, storm: number, reduced: boolean): void {
    const dk = THREE.MathUtils.smoothstep(storm, 0.35, 0.9);
    this.deckMat.opacity = 0.82 * dk;
    this.deck.visible = dk > 0.01;
    if (this.tex && dt > 0) {
      this.tex.offset.x += dt * 0.0016;
      this.tex.offset.y += dt * 0.0007;
    }
    // rayos: proceso de Poisson en tiempo real
    const rate = reduced ? 0 : strikeRate(mmh) * dk;
    if (rate > 0 && dt > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const ang = this.rnd() * Math.PI * 2, d = 700 + this.rnd() * 3300;
        const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
        const gy = this.groundY ? this.groundY(x, z) : this.baseY;
        const mesh = this.makeBolt(x, z, this.baseY + 640, gy);
        this.group.add(mesh);
        this.bolts.push({ mesh, mat: mesh.material as THREE.MeshBasicMaterial, age: 0, life: 0.35 + this.rnd() * 0.2 });
        this.flashT = 0;
        this.flashPeak = Math.min(0.7, 1100 / d);
        this.strikes++;
        this.onStrike?.({ distM: d });
        this.timer = Math.max(MIN_GAP_S, -Math.log(1 - this.rnd() * 0.999) * (60 / rate));
      }
    } else if (rate === 0) this.timer = Math.max(this.timer, 4);
    for (const b of this.bolts) {
      b.age += dt;
      // un solo destello que se apaga (sin parpadeo)
      const ph = b.age / b.life;
      b.mat.opacity = ph < 0.35 ? 1 : Math.max(0, 1 - (ph - 0.35) / 0.65);
    }
    for (const b of this.bolts.filter((q) => q.age > q.life)) {
      this.group.remove(b.mesh);
      b.mesh.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      b.mat.dispose();
    }
    this.bolts = this.bolts.filter((q) => q.age <= q.life);
    this.flashT += dt;
    this.flash = this.flashT < 0.8 ? this.flashPeak * Math.exp(-this.flashT * 6) : 0;
    this.deckMat.color.set('#59626b').lerp(new THREE.Color('#c9d3e6'), this.flash * 0.8);
  }

  dispose(): void {
    for (const b of this.bolts) {
      b.mesh.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      b.mat.dispose();
    }
    this.bolts = [];
    this.deck.geometry.dispose();
    this.deckMat.dispose();
    this.tex?.dispose();
  }
}

// Escenario 3D común de las tres partes del módulo de calidad: renderizador, cámara con órbita, luces, cielo,
// selección con clic (sin confundirla con arrastrar), cursor sobre lo que se puede tocar y rótulos HTML que
// siguen a los objetos. Cada parte arma su mundo encima (creekWorld, plantWorld, streetWorld).

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface StageLabel {
  id: string;
  text: string;
  sub?: string;
  at: THREE.Vector3;
  kind?: 'lugar' | 'dato' | 'alerta' | 'ok' | 'sonda';
  /** Mayor = se dibuja primero y gana si dos rótulos se tapan. */
  prio?: number;
  onClick?: () => void;
}

export interface StageView {
  eye: [number, number, number];
  target: [number, number, number];
}

interface Pickable {
  obj: THREE.Object3D;
  onPick: (pt: THREE.Vector3, hit: THREE.Intersection) => void;
  hint?: string;
}

export function hasWebGL(): boolean {
  try {
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    (gl?.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    return !!gl;
  } catch {
    return false;
  }
}

/** Controles que flotan sobre la escena: los rótulos 3D los evitan. */
const OVERLAY_SEL = '.q3-question, .q3-views, .q3-cam, .q3-card, .q3-toast, .q3-tourbar, .q3-hover';

export class QStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly reducedMotion: boolean;
  private container: HTMLElement;
  private labelLayer: HTMLDivElement;
  private labelEls = new Map<string, HTMLElement>();
  private labels: StageLabel[] = [];
  private picks: Pickable[] = [];
  private ray = new THREE.Raycaster();
  private raf = 0;
  private last = 0;
  private time = 0;
  private update: ((dt: number, t: number) => void) | null = null;
  private tween: { from: StageView; to: StageView; t0: number; dur: number } | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private ro: ResizeObserver;
  private disposed = false;
  private hoverAt = 0;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  /** Se llama con el texto de ayuda del objeto bajo el puntero (o null). */
  onHover: ((hint: string | null) => void) | null = null;

  constructor(container: HTMLElement, opts: { reducedMotion: boolean; sky?: string; fog?: [number, number]; label: string }) {
    this.container = container;
    this.reducedMotion = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    const cv = this.renderer.domElement;
    cv.className = 'q3-canvas';
    cv.tabIndex = 0;
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', opts.label);
    container.appendChild(cv);
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'q3-labels';
    container.appendChild(this.labelLayer);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
    this.controls = new OrbitControls(this.camera, cv);
    this.controls.enableDamping = !opts.reducedMotion;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 420;
    this.controls.screenSpacePanning = false;
    this.controls.listenToKeyEvents(cv);
    this.controls.keyPanSpeed = 18;

    const sky = new THREE.Color(opts.sky ?? '#cfe3ee');
    this.scene.background = sky;
    const [fn, ff] = opts.fog ?? [260, 900];
    this.scene.fog = new THREE.Fog(sky, fn, ff);
    this.hemi = new THREE.HemisphereLight('#eef5ff', '#6f6450', 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1dc', 1.9);
    this.sun.position.set(-60, 120, 80);
    this.scene.add(this.sun, this.sun.target);
    // sombras del sol cerca de lo que se mira (el sol sigue al punto de mira para no perder resolución)
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.4;
    this.setShadowSpan(90);

    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerleave', () => {
      cv.style.cursor = '';
      this.onHover?.(null);
    });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  private skyClear: THREE.Color | null = null;
  /** Tiempo de aguacero (0 despejado, 1 lluvia): cielo y niebla más grises y menos sol. */
  weather(k: number): void {
    const bg = this.scene.background as THREE.Color;
    if (!this.skyClear) this.skyClear = bg.clone();
    bg.copy(this.skyClear).lerp(new THREE.Color('#8f9aa3'), 0.75 * k);
    (this.scene.fog as THREE.Fog).color.copy(bg);
    this.sun.intensity = 1.9 * (1 - 0.6 * k);
    this.hemi.intensity = 0.95 * (1 - 0.2 * k);
  }

  /** Medio lado del área con sombras alrededor del punto de mira [unidades del mundo]. */
  setShadowSpan(half: number): void {
    const c = this.sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -half;
    c.right = half;
    c.top = half;
    c.bottom = -half;
    c.near = 1;
    c.far = 600;
    c.updateProjectionMatrix();
  }

  /** Tiempo acumulado [s] (se detiene con «movimiento reducido»). */
  get t(): number {
    return this.time;
  }

  start(update: (dt: number, t: number) => void): void {
    this.update = update;
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      if (document.hidden) {
        this.last = now;
        return;
      }
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
      this.last = now;
      this.time += this.reducedMotion ? 0 : dt;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame(dt: number): void {
    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.t0) / this.tween.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const { from, to } = this.tween;
      this.camera.position.set(...(from.eye.map((v, i) => v + (to.eye[i] - v) * e) as [number, number, number]));
      this.controls.target.set(...(from.target.map((v, i) => v + (to.target[i] - v) * e) as [number, number, number]));
      if (k >= 1) this.tween = null;
    }
    this.controls.update();
    const tg = this.controls.target;
    this.sun.target.position.copy(tg);
    this.sun.position.set(tg.x - 60, tg.y + 120, tg.z + 80);
    this.update?.(this.reducedMotion ? 0 : dt, this.time);
    this.renderer.render(this.scene, this.camera);
    this.layoutLabels();
  }

  /** Dibuja un cuadro ya (para las capturas y cuando el mundo cambia con la animación detenida). */
  renderNow(): void {
    this.frame(0);
  }

  view(v: StageView, animate = true): void {
    if (!animate || this.reducedMotion) {
      this.camera.position.set(...v.eye);
      this.controls.target.set(...v.target);
      this.controls.update();
      this.tween = null;
      return;
    }
    const p = this.camera.position, t = this.controls.target;
    this.tween = { from: { eye: [p.x, p.y, p.z], target: [t.x, t.y, t.z] }, to: v, t0: performance.now(), dur: 1000 };
  }

  orbit(deg: number): void {
    const off = this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);
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
  addPick(obj: THREE.Object3D, onPick: Pickable['onPick'], hint?: string): void {
    this.picks.push({ obj, onPick, hint });
  }

  private hit(clientX: number, clientY: number): { p: Pickable; h: THREE.Intersection } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const objs = this.picks.filter((p) => p.obj.visible).map((p) => p.obj);
    const hits = this.ray.intersectObjects(objs, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const p = this.picks.find((q) => q.obj === o);
        if (p) return { p, h };
        o = o.parent;
      }
    }
    return null;
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 7 || performance.now() - d.t > 700) return;
    const r = this.hit(e.clientX, e.clientY);
    if (r) r.p.onPick(r.h.point.clone(), r.h);
  };

  private onMove = (e: PointerEvent) => {
    if (e.buttons || e.pointerType === 'touch') return;
    const now = performance.now();
    if (now - this.hoverAt < 60) return;
    this.hoverAt = now;
    const r = this.hit(e.clientX, e.clientY);
    this.renderer.domElement.style.cursor = r ? 'pointer' : '';
    this.onHover?.(r?.p.hint ?? null);
  };

  // ------------------------------------------------------------ rótulos
  setLabels(labels: StageLabel[]): void {
    this.labels = labels;
    const keep = new Set(labels.map((l) => l.id));
    for (const [id, el] of this.labelEls) {
      if (!keep.has(id)) {
        el.remove();
        this.labelEls.delete(id);
      }
    }
    for (const l of labels) {
      let el = this.labelEls.get(l.id);
      if (!el) {
        el = document.createElement(l.onClick ? 'button' : 'div');
        if (l.onClick) (el as HTMLButtonElement).type = 'button';
        this.labelLayer.appendChild(el);
        this.labelEls.set(l.id, el);
      }
      el.className = `q3-label is-${l.kind ?? 'lugar'}${l.onClick ? ' is-btn' : ''}`;
      const html = `<span>${esc(l.text)}</span>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}`;
      if (el.dataset.html !== html) {
        el.innerHTML = html;
        el.dataset.html = html;
        el.dataset.w = '';
      }
      el.onclick = l.onClick ? () => l.onClick?.() : null;
    }
  }

  private layoutLabels(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    // los rótulos no se ponen bajo los controles que flotan sobre la escena (pregunta, vistas, cámara, tarjetas)
    const placed: [number, number, number, number][] = [];
    const host = this.container.parentElement;
    if (host) {
      const cr = this.container.getBoundingClientRect();
      for (const o of host.querySelectorAll<HTMLElement>(OVERLAY_SEL)) {
        if (o.offsetParent === null) continue;
        const r = o.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) placed.push([r.left - cr.left - 4, r.top - cr.top - 4, r.right - cr.left + 4, r.bottom - cr.top + 4]);
      }
    }
    const sorted = [...this.labels].sort((a, b) => (b.prio ?? 0) - (a.prio ?? 0));
    for (const l of sorted) {
      const el = this.labelEls.get(l.id);
      if (!el) continue;
      v.copy(l.at).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      if (!el.dataset.w) {
        el.dataset.w = String(el.offsetWidth || 80);
        el.dataset.h = String(el.offsetHeight || 22);
      }
      const ew = Number(el.dataset.w), eh = Number(el.dataset.h);
      const box: [number, number, number, number] = [x - ew / 2, y - eh - 6, x + ew / 2, y - 6];
      const inView = v.z < 1 && v.z > -1 && x > -ew && x < w + ew && y > 0 && y < h + eh;
      const clash = placed.some((p) => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]));
      const show = inView && !clash;
      el.style.visibility = show ? 'visible' : 'hidden';
      if (show) {
        placed.push(box);
        el.style.transform = `translate(${Math.round(box[0])}px, ${Math.round(box[1])}px)`;
      }
    }
  }

  resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const el of this.labelEls.values()) el.dataset.w = '';
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((q) => q.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labelLayer.remove();
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

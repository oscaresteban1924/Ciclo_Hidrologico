// Piezas 3D comunes de la hidráulica de canales: el agua dibujada a partir de un perfil calculado (superficie con
// vetas que avanzan y la cara lateral que se ve por el vidrio), el vidrio de los cortes, la regla para leer la
// profundidad y la línea de energía. Las profundidades se dibujan a escala real (sin exagerar).

import * as THREE from 'three';
import { waterMaterial } from '../../quality/three/kit';

export interface Station {
  /** Posición a lo largo del canal (m). */
  x: number;
  /** Cota del fondo (m). */
  bed: number;
  /** Profundidad del agua (m). */
  depth: number;
  /** Mitad del ancho de la superficie (m). */
  halfW: number;
  /** Espuma de 0 a 1 (resalto, caída). */
  foam?: number;
  /** Centro de la franja en z (por defecto 0). */
  z0?: number;
}

/**
 * Agua de un tramo: superficie (vista de arriba) y cara del lado +z (vista por el vidrio del corte). Se rehace
 * cuando cambia el cálculo; las vetas avanzan con `speed` (unidades del dibujo por segundo).
 */
export class WaterBody {
  readonly group = new THREE.Group();
  private top: THREE.Mesh;
  private side: THREE.Mesh;
  private topMat: THREE.MeshStandardMaterial;
  private sideMat: THREE.MeshStandardMaterial;
  private color = new THREE.Color('#2f7fb0');
  private sideZ: number | null;

  constructor(time: { value: number }, opts: { side?: boolean; opacity?: number; sideOpacity?: number } = {}) {
    this.topMat = waterMaterial(time, { opacity: opts.opacity ?? 0.88, speed: 0.6 });
    this.sideMat = waterMaterial(time, { opacity: opts.sideOpacity ?? 0.62, speed: 0.6 });
    this.top = new THREE.Mesh(new THREE.BufferGeometry(), this.topMat);
    this.side = new THREE.Mesh(new THREE.BufferGeometry(), this.sideMat);
    this.top.renderOrder = 3;
    this.side.renderOrder = 2;
    this.top.frustumCulled = this.side.frustumCulled = false;
    this.sideZ = opts.side === false ? null : 0;
    this.side.visible = opts.side !== false;
    this.group.add(this.top, this.side);
  }

  setColor(c: THREE.ColorRepresentation): void {
    this.color.set(c);
  }

  /** Velocidad de las vetas, en m/s del agua (se dibuja proporcional). */
  setSpeed(v: number): void {
    const s = Math.max(0.05, Math.min(3, v * 0.35));
    (this.topMat.userData.speed as { value: number }).value = s;
    (this.sideMat.userData.speed as { value: number }).value = s;
  }

  update(st: Station[]): void {
    const n = st.length;
    if (n < 2) return;
    const pos: number[] = [], flow: number[] = [], foam: number[] = [], col: number[] = [], idx: number[] = [];
    const c = this.color;
    for (let k = 0; k < n; k++) {
      const s = st[k];
      const y = s.bed + s.depth;
      const zc = s.z0 ?? 0;
      pos.push(s.x, y, zc - s.halfW, s.x, y, zc + s.halfW);
      flow.push(s.x, -1, s.x, 1);
      const f = s.foam ?? 0;
      foam.push(f, f);
      const w = 1 + f * 0.25;
      col.push(c.r * w, c.g * w, c.b * w, c.r * w, c.g * w, c.b * w);
      if (k < n - 1) {
        const a = k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.top.geometry.dispose();
    this.top.geometry = g;
    if (this.sideZ === null) return;
    // cara lateral: del fondo a la superficie, en el borde +z
    const sp: number[] = [], sf: number[] = [], sfo: number[] = [], sc: number[] = [], si: number[] = [];
    const dark = c.clone().multiplyScalar(0.8);
    for (let k = 0; k < n; k++) {
      const s = st[k];
      const z = (s.z0 ?? 0) + s.halfW - 0.005;
      sp.push(s.x, s.bed, z, s.x, s.bed + s.depth, z);
      sf.push(s.x, 0.8, s.x, -0.2);
      const f = (s.foam ?? 0) * 0.8;
      sfo.push(f * 0.4, f);
      sc.push(dark.r, dark.g, dark.b, c.r, c.g, c.b);
      if (k < n - 1) {
        const a = k * 2;
        si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const h = new THREE.BufferGeometry();
    h.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    h.setAttribute('aFlow', new THREE.Float32BufferAttribute(sf, 2));
    h.setAttribute('aFoam', new THREE.Float32BufferAttribute(sfo, 1));
    h.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    h.setIndex(si);
    h.computeVertexNormals();
    this.side.geometry.dispose();
    this.side.geometry = h;
  }
}

/** Vidrio de un corte (el agua y el fondo se ven a través). */
export function glassMaterial(opacity = 0.14): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#cfe8f2', transparent: true, opacity, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
}

/**
 * Regla graduada para leer la profundidad: `height` en metros y marcas cada `step` (con números cada `label`).
 */
export function staffGauge(height: number, step: number, label: number, width = 0.12): THREE.Mesh {
  const px = 64, ph = 1024;
  const cv = document.createElement('canvas');
  cv.width = px;
  cv.height = ph;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, px, ph);
  g.fillStyle = '#17324d';
  const n = Math.round(height / step);
  for (let k = 0; k <= n; k++) {
    const y = ph - (k / n) * ph;
    const big = Math.abs((k * step) / label - Math.round((k * step) / label)) < 1e-6;
    g.fillRect(0, y - (big ? 3 : 1.5), big ? px * 0.6 : px * 0.35, big ? 6 : 3);
    if (big && k > 0 && k < n) {
      g.font = 'bold 22px sans-serif';
      const v = k * step;
      g.fillText(v < 1 ? `${Math.round(v * 100)}` : `${Math.round(v * 10) / 10}`.replace('.', ','), px * 0.62 - 4, y + 8);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  m.geometry.translate(0, height / 2, 0);
  return m;
}

/** Línea de energía (rayada) o cualquier polilínea. */
export function polyline(color: string, dashed = true): THREE.Line {
  const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.6, gapSize: 0.35, transparent: true, opacity: 0.95 }) : new THREE.LineBasicMaterial({ color });
  const l = new THREE.Line(new THREE.BufferGeometry(), mat);
  l.frustumCulled = false;
  l.renderOrder = 9;
  return l;
}

export function setPolyline(l: THREE.Line, pts: THREE.Vector3[], dash?: [number, number]): void {
  l.geometry.dispose();
  l.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  if (l.material instanceof THREE.LineDashedMaterial) {
    if (dash) {
      l.material.dashSize = dash[0];
      l.material.gapSize = dash[1];
    }
    l.computeLineDistances();
  }
}

/** Caja de concreto u otro material, con su posición de esquina inferior (x0, y0, z0) y tamaño. */
export function slab(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0)), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Colores del agua: limpia, turbia (erosión) y con limo (sedimentación). */
export const WATER = { clear: '#2f84b5', turbid: '#8a7350', silty: '#4f8a7a', lab: '#4fa3d8' };

// Piezas 3D de la sala «Acueducto»: maqueta de terreno con bordes de suelo, tanque de almacenamiento con su nivel,
// tubos y piezómetros de vidrio con la columna de agua a escala.

import * as THREE from 'three';
import { glassMaterial } from '../../canals/three/canalKit';

/**
 * Maqueta de terreno: superficie con alturas `h(x, z)` en el rectángulo dado y paredes de suelo hasta `base` en los
 * cuatro lados (el corte del frente deja ver lo que va enterrado).
 */
export function diorama(h: (x: number, z: number) => number, x0: number, x1: number, z0: number, z1: number, nx: number, nz: number, color: (x: number, z: number, y: number) => THREE.Color, base: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k), y = h(x, z);
    pos.setY(k, y);
    const c = color(x, z, y);
    col.set([c.r, c.g, c.b], 3 * k);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const top = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  top.receiveShadow = true;
  // paredes: el contorno del rectángulo, de la superficie a la base, con capas de suelo
  const edge: [number, number][] = [];
  for (let i = 0; i <= nx; i++) edge.push([x0 + ((x1 - x0) * i) / nx, z1]);
  for (let j = nz - 1; j >= 0; j--) edge.push([x1, z0 + ((z1 - z0) * j) / nz]);
  for (let i = nx - 1; i >= 0; i--) edge.push([x0 + ((x1 - x0) * i) / nx, z0]);
  for (let j = 1; j <= nz; j++) edge.push([x0, z0 + ((z1 - z0) * j) / nz]);
  const p: number[] = [], c: number[] = [], idx: number[] = [];
  const topC = new THREE.Color('#9a7752'), midC = new THREE.Color('#7f5f40'), botC = new THREE.Color('#5b4630');
  edge.forEach(([x, z], k) => {
    const y = h(x, z);
    const ym = Math.max(base, y - 2.2);
    p.push(x, y, z, x, ym, z, x, base, z);
    c.push(topC.r, topC.g, topC.b, midC.r, midC.g, midC.b, botC.r, botC.g, botC.b);
    if (k < edge.length - 1) {
      const a = 3 * k;
      idx.push(a, a + 1, a + 3, a + 3, a + 1, a + 4, a + 1, a + 2, a + 4, a + 4, a + 2, a + 5);
    }
  });
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  wg.setIndex(idx);
  wg.computeVertexNormals();
  const walls = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 80, z1 - z0 + 80), new THREE.MeshStandardMaterial({ color: '#cbd8d1', roughness: 1 }));
  floor.rotateX(-Math.PI / 2);
  floor.position.set((x0 + x1) / 2, base - 0.05, (z0 + z1) / 2);
  floor.receiveShadow = true;
  g.add(top, walls, floor);
  return g;
}

/** Tanque cilíndrico de concreto con el agua adentro (se ve por una ventana de vidrio al frente). */
export class StorageTank {
  readonly group = new THREE.Group();
  private water: THREE.Mesh;
  private base: number;
  private top: number;
  constructor(radius: number, base: number, top: number) {
    this.base = base;
    this.top = top;
    const h = top - base;
    const conc = new THREE.MeshStandardMaterial({ color: '#d4d0c6', roughness: 0.85, side: THREE.DoubleSide });
    // pared con una ventana abierta al frente (de -40° a 40°) para ver el agua
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 40, 1, true, Math.PI / 2 + 0.7, 2 * Math.PI - 1.4), conc);
    wall.position.y = base + h / 2;
    wall.castShadow = true;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, h, 16, 1, true, Math.PI / 2 - 0.7, 1.4), glassMaterial(0.16));
    glass.position.y = base + h / 2;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.4, radius + 0.4, 0.5, 40), conc);
    roof.position.y = top + 0.25;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.4, 40), conc);
    floor.position.y = base + 0.2;
    this.water = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.25, radius - 0.25, 1, 40), new THREE.MeshStandardMaterial({ color: '#2f84b5', roughness: 0.15, transparent: true, opacity: 0.88 }));
    this.group.add(wall, glass, roof, floor, this.water);
  }
  /** Cota del agua (m). */
  setLevel(y: number): void {
    const h = Math.max(0.05, Math.min(this.top, y) - this.base);
    this.water.scale.y = h;
    this.water.position.y = this.base + h / 2;
  }
}

/** Tubo que sigue una polilínea (radio de dibujo, no el real). */
export function pipeMesh(pts: THREE.Vector3[], radius: number, mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, pts.length * 12), radius, 12, false), mat);
  m.castShadow = true;
  return m;
}

/** Piezómetro: tubo de vidrio vertical con la columna de agua, de `y0` (eje del tubo) a la cota piezométrica. */
export class Piezometer {
  readonly group = new THREE.Group();
  private col: THREE.Mesh;
  private ring: THREE.Mesh;
  private y0: number;
  level: number;
  target: number;
  constructor(x: number, y0: number, z: number, top: number, r = 0.35) {
    this.y0 = y0;
    this.level = y0;
    this.target = y0;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, top - y0, 12, 1, true), glassMaterial(0.22));
    glass.position.set(x, (top + y0) / 2, z);
    this.col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, 1, 12), new THREE.MeshStandardMaterial({ color: '#2f84b5', emissive: '#12466a', emissiveIntensity: 0.25, roughness: 0.2 }));
    this.col.position.set(x, y0, z);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.6, r * 0.35, 8, 20), new THREE.MeshStandardMaterial({ color: '#c0392b', emissive: '#7a1f15', emissiveIntensity: 0.5 }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.set(x, y0, z);
    this.ring.visible = false;
    this.group.add(glass, this.col, this.ring);
  }
  /** Lleva la columna hacia su nivel; devuelve si todavía se mueve. */
  step(h: number, instant = false): boolean {
    this.level = instant ? this.target : this.level + (this.target - this.level) * Math.min(1, h * 3);
    const hh = Math.max(0, this.level - this.y0);
    this.col.visible = hh > 0.02;
    this.col.scale.y = Math.max(0.01, hh);
    this.col.position.y = this.y0 + hh / 2;
    this.ring.visible = this.target < this.y0;
    return Math.abs(this.target - this.level) > 1e-3;
  }
}

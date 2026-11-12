// Piezas 3D de la sala «Acueducto»: maqueta de terreno con bordes de suelo, tanque de almacenamiento con su nivel,
// tubos y piezómetros de vidrio con la columna de agua a escala.

import * as THREE from 'three';
import { lookWater } from '../../three/look';
import { glassMaterial } from '../../canals/three/canalKit';
import { terrainBlock } from '../../three/scenery';

/**
 * Maqueta de terreno: superficie con alturas `h(x, z)` en el rectángulo dado y paredes de suelo hasta `base` en los
 * cuatro lados (el corte del frente deja ver lo que va enterrado). El acabado está en src/three/scenery.ts.
 */
export function diorama(h: (x: number, z: number) => number, x0: number, x1: number, z0: number, z1: number, nx: number, nz: number, color: (x: number, z: number, y: number) => THREE.Color, base: number): THREE.Group {
  return terrainBlock(h, x0, x1, z0, z1, nx, nz, color, base);
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
    this.water = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.25, radius - 0.25, 1, 40), lookWater(new THREE.MeshStandardMaterial({ color: '#2f84b5', roughness: 0.1, transparent: true, opacity: 0.88 }), [0.04, 0.02], 0.3));
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

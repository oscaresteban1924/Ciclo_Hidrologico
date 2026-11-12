// Piezas comunes de los mundos 3D de calidad: ruido, árboles y casas con instancias, material del agua (con
// vetas que avanzan y espuma) y colores del agua según su calidad.

import * as THREE from 'three';
import { lookWater } from '../../three/look';
import { trees as sceneryTrees } from '../../three/scenery';

/** Ruido de valor 2D suave y determinista (0..1). */
export function noise2(x: number, y: number): number {
  const h = (i: number, j: number) => {
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Bastoncitos del microscopio para un conteo por 100 mL: crece con el logaritmo (10 → 6; 1 000 → 18; 1 millón → 36). */
export function rodsFor(count: number): number {
  return Math.round(Math.min(48, Math.max(0, 6 * Math.log10(count + 1))));
}

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export interface TreeSpot {
  x: number;
  y: number;
  z: number;
  r: number;
  color?: string;
}

/** Árboles de varias especies con viento en las copas (ver src/three/scenery.ts). */
export function trees(spots: TreeSpot[], seed = 3): THREE.Group {
  return sceneryTrees(spots, seed);
}

export interface HouseSpot {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  wall: string;
  roof?: string;
}

/** Casas de barrio: volumen con ventanas pintadas en el sombreador y techo plano o de zinc. */
export function houses(spots: HouseSpot[]): THREE.InstancedMesh {
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vL; varying vec3 vS; varying vec3 vN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = position; vN = normal; vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vL; varying vec3 vS; varying vec3 vN;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vN.y > 0.5) {
          diffuseColor.rgb = vec3(0.62, 0.6, 0.57);
        } else if (vN.y > -0.5) {
          float hc = (abs(vN.x) > 0.5 ? vL.z * vS.z : vL.x * vS.x) + 20.0;
          float vc = vL.y * vS.y;
          float fx = fract(hc / 2.4), fy = fract(vc / 2.7);
          float win = step(0.32, fx) * step(fx, 0.68) * step(0.38, fy) * step(fy, 0.78) * step(0.4, vc) * step(vc, vS.y - 0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.2, 0.25), win * 0.85);
          float slab = step(fract(vc / 2.7), 0.06) * step(1.0, vc);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.7, 0.66), slab * 0.6);
          diffuseColor.rgb *= 0.92 + 0.08 * step(0.5, abs(vN.z));
        }`,
      );
  };
  const im = new THREE.InstancedMesh(box, mat, Math.max(1, spots.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach((hs, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hs.rot);
    im.setMatrixAt(i, m.compose(p.set(hs.x, hs.y - 0.6, hs.z), q, s.set(hs.w, hs.h + 0.6, hs.d)));
    im.setColorAt(i, new THREE.Color(hs.wall));
  });
  im.count = spots.length;
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

/** Fachadas de Medellín: ladrillo a la vista y pañetes pintados. */
export const WALLS = ['#b4603f', '#a85a3c', '#c06c48', '#efe0c0', '#f0c9a2', '#cfe1d4', '#bcd6e6', '#f2d27a', '#e9b9c2', '#b4603f', '#a85a3c'];

/**
 * Material del agua: color por vértice (la calidad calculada en cada punto), vetas que avanzan con la corriente
 * (coordenada u a lo largo del cauce) y espuma donde el atributo aFoam lo indica.
 */
export function waterMaterial(time: { value: number }, opts: { opacity?: number; speed?: number } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: opts.opacity ?? 0.9, roughness: 0.18, metalness: 0.05, depthWrite: false });
  // la velocidad va en un uniform: three.js comparte un mismo programa entre materiales con el mismo
  // onBeforeCompile, así que una constante escrita en el código del shader quedaría igual para todos
  const speed = { value: opts.speed ?? 0.6 };
  // queda a mano para cambiar la velocidad de las vetas después (hidráulica de canales)
  m.userData.speed = speed;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uSpeed = speed;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFlow;\nattribute float aFoam;\nvarying vec2 vFlow;\nvarying float vFoam;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = aFlow;\nvFoam = aFoam;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uSpeed;
        varying vec2 vFlow;
        varying float vFoam;
        float wh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float wn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(wh(i), wh(i + vec2(1, 0)), u.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), u.x), u.y); }`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 fp = vec2(vFlow.x * 0.55 - uTime * uSpeed, vFlow.y * 2.2);
        float n1 = wn(fp * vec2(1.0, 1.0));
        float n2 = wn(fp * vec2(2.3, 1.7) + 7.1);
        float streak = smoothstep(0.62, 0.86, n1 * 0.65 + n2 * 0.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25 + 0.06, streak * 0.35);
        float foam = smoothstep(0.55, 0.8, wn(fp * 1.6 + 3.0)) * vFoam;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.86), clamp(foam, 0.0, 0.9));
        diffuseColor.a = max(diffuseColor.a, foam * 0.9);`,
      );
  };
  // ondas finas y brillos del sol encima de las vetas (src/three/look.ts)
  return lookWater(m, [0.18, 0.06], 0.45);
}

/** Color natural del agua de una quebrada según turbiedad [UNT] y materia orgánica (DBO5) [mg/L]. */
export function naturalWater(turbidity: number, dbo: number, out = new THREE.Color()): THREE.Color {
  const clear = new THREE.Color(0.16, 0.48, 0.6);
  const mud = new THREE.Color(0.52, 0.4, 0.24);
  const sew = new THREE.Color(0.36, 0.38, 0.27);
  const f = turbidity / (turbidity + 45);
  const g = dbo / (dbo + 18);
  return out.copy(clear).lerp(mud, f * 0.9).lerp(sew, g * 0.75);
}

/** Semáforo del oxígeno disuelto [mg/L] (los mismos cortes de la leyenda). */
export const DO_CLASSES = [
  { min: 7, color: '#2f78c4', label: 'Mucho (7 o más)' },
  { min: 5, color: '#3fa565', label: 'Suficiente para peces (5 a 7)' },
  { min: 3, color: '#e0c23a', label: 'Poco (3 a 5)' },
  { min: 1, color: '#e3832f', label: 'Muy poco (1 a 3)' },
  { min: 0, color: '#c9372c', label: 'Casi nada (menos de 1)' },
] as const;

export function doColor(dO: number, out = new THREE.Color()): THREE.Color {
  return out.set(DO_CLASSES.find((c) => dO >= c.min)!.color);
}

/** Pez sencillo (cuerpo y cola), mirando hacia +x. */
export function fishGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.5, 8, 6);
  body.scale(1, 0.42, 0.28);
  const tail = new THREE.ConeGeometry(0.22, 0.36, 4);
  tail.rotateZ(Math.PI / 2);
  tail.translate(-0.6, 0, 0);
  const pos = [...(body.toNonIndexed().getAttribute('position').array as Float32Array), ...(tail.toNonIndexed().getAttribute('position').array as Float32Array)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  body.dispose();
  tail.dispose();
  return g;
}

const concreteCache = new Map<string, THREE.MeshStandardMaterial>();
/**
 * Concreto: manchas suaves y vetas de encofrado (ruido en coordenadas del mundo, sin texturas) y el borde de
 * arriba un poco más claro, como el concreto lavado por la lluvia. Un material por color, compartido.
 */
export function concreteMaterial(color = '#c9c6bf'): THREE.MeshStandardMaterial {
  const hit = concreteCache.get(color);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCW;\nvarying vec3 vCN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCW = (modelMatrix * vec4(position, 1.0)).xyz;\nvCN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCW;
        varying vec3 vCN;
        float ch(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float cn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(ch(i), ch(i + vec2(1, 0)), u.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), u.x), u.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 q = abs(vCN.y) > 0.5 ? vCW.xz : (abs(vCN.x) > 0.5 ? vCW.zy : vCW.xy);
          float n = cn(q * 0.9) * 0.6 + cn(q * 3.1 + 5.0) * 0.4;
          float form = smoothstep(0.92, 0.98, fract(vCW.y / 1.2)) * (1.0 - step(0.5, abs(vCN.y)));
          diffuseColor.rgb *= 0.9 + 0.16 * n - 0.06 * form;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.85, 0.82), step(0.5, vCN.y) * 0.25);
        }`,
      );
  };
  concreteCache.set(color, m);
  return m;
}

/** Caja abierta (tanque) con paredes de concreto y frente de vidrio opcional. */
export function tank(w: number, h: number, d: number, opts: { glassFront?: boolean; wall?: number; color?: string } = {}): THREE.Group {
  const g = new THREE.Group();
  const t = opts.wall ?? 0.35;
  const conc = concreteMaterial(opts.color ?? '#c9c6bf');
  const glass = new THREE.MeshStandardMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.18, roughness: 0.1, metalness: 0, depthWrite: false });
  const add = (sx: number, sy: number, sz: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  add(w, t, d, 0, t / 2, 0, conc); // fondo
  add(t, h, d, -w / 2 + t / 2, h / 2, 0, conc);
  add(t, h, d, w / 2 - t / 2, h / 2, 0, conc);
  add(w, h, t, 0, h / 2, -d / 2 + t / 2, conc);
  const front = add(w, h, t * 0.4, 0, h / 2, d / 2 - t * 0.2, opts.glassFront ? glass : conc);
  if (opts.glassFront) {
    front.renderOrder = 6;
    // marco del vidrio
    add(w, 0.18, t, 0, h - 0.09, d / 2 - t / 2, conc);
  }
  return g;
}

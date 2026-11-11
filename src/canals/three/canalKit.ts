// Piezas 3D comunes de la hidráulica de canales: el agua dibujada a partir de un perfil calculado, el vidrio de
// los cortes, la regla para leer la profundidad, la línea de energía y los trazadores que muestran la velocidad.
// Las profundidades se dibujan a escala real (sin exagerar).
//
// El agua tiene su propio material: el color cambia con la profundidad (más claro donde es poco profunda), las
// ondas avanzan con la velocidad calculada en cada punto (mapa de flujo en dos fases, sin que el dibujo se
// estire), el reflejo del cielo crece al mirar de lado (Fresnel) y la espuma aparece donde hay turbulencia. En la
// cara que se ve por el vidrio, las vetas avanzan más rápido arriba que abajo (perfil de velocidad de potencia
// 1/7) y el agua con aire del resalto se ve blanca.

import * as THREE from 'three';

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
  /** Velocidad media en la sección (m/s); si falta, la de `setSpeed`. */
  vel?: number;
}

/** Escala del dibujo del agua: tamaño de las ondas y profundidad a la que toma su color pleno. */
export interface WaterLook {
  /** Metros por celda de las ondas: 1 en un canal, 0,08 en el canal de laboratorio. */
  scale?: number;
  /** Profundidad (m) a la que el agua toma su color pleno. */
  depthRef?: number;
}

const NOISE = `
  float hcH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float hcN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hcH(i), hcH(i + vec2(1.0, 0.0)), u.x), mix(hcH(i + vec2(0.0, 1.0)), hcH(i + vec2(1.0, 1.0)), u.x), u.y); }
  float hcF(vec2 p) { return hcN(p) * 0.62 + hcN(p * 2.27 + 11.3) * 0.28 + hcN(p * 4.9 + 3.7) * 0.10; }`;

/**
 * Material del agua. `top`: la superficie, con ondas que mueven la normal y el reflejo del cielo; si no, la cara
 * vista por el vidrio. Las velocidades llegan por vértice (aVel, m/s) y se dibujan a su valor real.
 */
function flowWaterMaterial(time: { value: number }, top: boolean, opacity: number, look: { scale: { value: number }; depthRef: { value: number } }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity, roughness: top ? 0.1 : 0.35, metalness: 0.02, depthWrite: false, side: top ? THREE.FrontSide : THREE.DoubleSide });
  if (top) m.defines = { HC_TOP: '' };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uScale = look.scale;
    sh.uniforms.uDepthRef = look.depthRef;
    sh.uniforms.uSky = { value: new THREE.Color('#d7e8f1') };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uScale;
        attribute vec2 aFlow;
        attribute float aFoam;
        attribute float aVel;
        attribute float aDepth;
        attribute float aRel;
        varying vec2 vFlow;
        varying float vFoam;
        varying float vVel;
        varying float vDepth;
        varying float vRel;
        varying vec3 vWPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFlow = aFlow; vFoam = aFoam; vVel = aVel; vDepth = aDepth; vRel = aRel;
        // oleaje: pequeño donde el agua es tranquila, picado donde hay espuma (proporcional a la profundidad)
        float ph = position.x / uScale;
        float chop = 0.006 * uScale + 0.07 * aFoam * aDepth;
        float wv = sin(ph * 2.1 + aFlow.y * 1.7 - uTime * (1.6 + min(aVel, 8.0) * 0.35))
                 + 0.55 * sin(ph * 4.7 - aFlow.y * 2.9 - uTime * 2.9) * (0.4 + aFoam)
                 + 0.35 * sin(ph * 9.3 + aFlow.y * 5.3 - uTime * 4.7) * aFoam;
        transformed.y += chop * wv * 0.5 * aRel;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uScale;
        uniform float uDepthRef;
        uniform vec3 uSky;
        varying vec2 vFlow;
        varying float vFoam;
        varying float vVel;
        varying float vDepth;
        varying float vRel;
        varying vec3 vWPos;
        ${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // mapa de flujo en dos fases: el dibujo avanza con la velocidad de cada punto y se renueva sin estirarse
        float hcT = 3.0;
        float hcT0 = fract(uTime / hcT), hcT1 = fract(uTime / hcT + 0.5);
        float hcW0 = 1.0 - abs(1.0 - 2.0 * hcT0), hcW1 = 1.0 - hcW0;
        float hcFoam = 0.0;
        float hcH0 = 0.0, hcHx = 0.0, hcHz = 0.0, hcSlope = 0.0;
        #ifdef HC_TOP
          vec2 P = vWPos.xz / uScale;
          float sp = min(vVel, 10.0) / uScale;
          float o0 = sp * hcT0 * hcT, o1 = sp * hcT1 * hcT;
          vec2 st = vec2(0.55 / (1.0 + 0.08 * sp), 1.7);
          vec2 e = vec2(0.07, 0.0);
          hcH0 = hcF((P - vec2(o0, 0.0)) * st) * hcW0 + hcF((P - vec2(o1, 0.0)) * st + 0.37) * hcW1;
          hcHx = hcF((P + e.xy - vec2(o0, 0.0)) * st) * hcW0 + hcF((P + e.xy - vec2(o1, 0.0)) * st + 0.37) * hcW1;
          hcHz = hcF((P + e.yx - vec2(o0, 0.0)) * st) * hcW0 + hcF((P + e.yx - vec2(o1, 0.0)) * st + 0.37) * hcW1;
          hcSlope = 0.22 + 0.5 * min(1.0, sp * 0.25) + vFoam * 0.9;
          // color: más claro y verdoso donde hay poca agua, el color pleno donde es profunda
          float deep = 1.0 - exp(-vDepth / uDepthRef);
          vec3 shallow = mix(diffuseColor.rgb, vec3(0.72, 0.84, 0.80), 0.5);
          diffuseColor.rgb = mix(shallow, diffuseColor.rgb * 0.88, deep);
          diffuseColor.rgb += smoothstep(0.6, 0.86, hcH0) * (0.05 + 0.06 * min(1.0, sp * 0.3));
          float fn = hcF((P - vec2(o0 * 1.15, 0.0)) * vec2(1.3, 2.4) + 5.1) * hcW0 + hcF((P - vec2(o1 * 1.15, 0.0)) * vec2(1.3, 2.4) + 9.4) * hcW1;
          hcFoam = clamp(smoothstep(0.42, 0.72, fn * 0.55 + vFoam * 0.62) * min(1.0, vFoam * 1.9), 0.0, 1.0);
          // crestas blancas en el flujo rápido
          hcFoam = max(hcFoam, smoothstep(0.8, 0.92, hcH0) * clamp((sp - 2.0) * 0.12, 0.0, 0.5));
        #else
          float rel = clamp(vRel, 0.0, 1.0);
          float uf = 1.143 * pow(max(rel, 0.03), 0.142857);
          float sp = min(vVel * uf, 10.0) / uScale;
          vec2 P = vWPos.xy / uScale;
          float o0 = sp * hcT0 * hcT, o1 = sp * hcT1 * hcT;
          vec2 st = vec2(0.8 / (1.0 + 0.06 * sp), 6.5);
          float s = hcF((P - vec2(o0, 0.0)) * st) * hcW0 + hcF((P - vec2(o1, 0.0)) * st + 0.37) * hcW1;
          diffuseColor.rgb *= mix(0.5, 1.02, rel);
          diffuseColor.rgb += smoothstep(0.6, 0.88, s) * 0.08;
          // luz que entra por la superficie (cáusticas suaves cerca de arriba)
          float c = hcN(vec2(P.x * 1.4 + uTime * 0.17, P.y * 1.1 - uTime * 0.11));
          diffuseColor.rgb += pow(1.0 - abs(c * 2.0 - 1.0), 5.0) * 0.08 * rel;
          // agua con aire (resalto, caída): blanca y moteada, avanza con el agua
          float b = hcF((P - vec2(o0 * 0.7, -uTime * 0.35)) * vec2(2.2, 2.6)) * hcW0 + hcF((P - vec2(o1 * 0.7, -uTime * 0.35)) * vec2(2.2, 2.6) + 4.2) * hcW1;
          hcFoam = clamp(vFoam * 1.5, 0.0, 1.0) * (0.35 + 0.65 * smoothstep(0.35, 0.75, b));
        #endif
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.96, 0.95), hcFoam * 0.9);
        diffuseColor.a = mix(diffuseColor.a, 1.0, hcFoam * 0.85);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        #ifdef HC_TOP
          vec3 hcP = vec3(-(hcHx - hcH0), 0.0, -(hcHz - hcH0)) / 0.07 * hcSlope * 0.09;
          normal = normalize(normal + (viewMatrix * vec4(hcP, 0.0)).xyz);
        #endif`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#ifdef HC_TOP
          float hcFr = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 4.0);
          outgoingLight = mix(outgoingLight, uSky, hcFr * 0.5 * (1.0 - hcFoam));
          diffuseColor.a = mix(diffuseColor.a, 1.0, hcFr * 0.55);
        #endif
        #include <opaque_fragment>`,
      );
  };
  return m;
}

/**
 * Agua de un tramo: superficie (vista de arriba, con `cols` columnas a lo ancho para el oleaje) y cara del lado
 * +z (vista por el vidrio del corte). Se rehace cuando cambia el cálculo.
 */
export class WaterBody {
  readonly group = new THREE.Group();
  private top: THREE.Mesh;
  private side: THREE.Mesh;
  private topMat: THREE.MeshStandardMaterial;
  private sideMat: THREE.MeshStandardMaterial;
  private color = new THREE.Color('#2f7fb0');
  private hasSide: boolean;
  private vel = 0.5;
  private cols: number;
  private look = { scale: { value: 1 }, depthRef: { value: 1.2 } };

  constructor(time: { value: number }, opts: { side?: boolean; opacity?: number; sideOpacity?: number; cols?: number } & WaterLook = {}) {
    if (opts.scale) this.look.scale.value = opts.scale;
    if (opts.depthRef) this.look.depthRef.value = opts.depthRef;
    this.topMat = flowWaterMaterial(time, true, opts.opacity ?? 0.86, this.look);
    this.sideMat = flowWaterMaterial(time, false, opts.sideOpacity ?? 0.6, this.look);
    this.cols = Math.max(1, opts.cols ?? 6);
    this.top = new THREE.Mesh(new THREE.BufferGeometry(), this.topMat);
    this.side = new THREE.Mesh(new THREE.BufferGeometry(), this.sideMat);
    this.top.renderOrder = 3;
    this.side.renderOrder = 2;
    this.top.frustumCulled = this.side.frustumCulled = false;
    this.hasSide = opts.side !== false;
    this.side.visible = this.hasSide;
    this.group.add(this.top, this.side);
  }

  setColor(c: THREE.ColorRepresentation): void {
    this.color.set(c);
  }

  /** Velocidad media (m/s) de las estaciones que no traen la suya. */
  setSpeed(v: number): void {
    this.vel = Math.max(0, v);
  }

  /** Reflejo del entorno (el cielo de la escena) en la superficie, con su intensidad. */
  setEnvironment(env: THREE.Texture | null, intensity = 0.9): void {
    this.topMat.envMap = env;
    this.topMat.envMapIntensity = intensity;
    this.topMat.needsUpdate = true;
  }

  /** Escala del dibujo (ver `WaterLook`). */
  setLook(l: WaterLook): void {
    if (l.scale) this.look.scale.value = l.scale;
    if (l.depthRef) this.look.depthRef.value = l.depthRef;
  }

  /**
   * Para escenas que cambian en cada cuadro (flujo no permanente): con el mismo número de estaciones, escribe en
   * los mismos búferes en lugar de rehacer la geometría.
   */
  updateFast(st: Station[]): void {
    const n = st.length, C = this.cols;
    const tg = this.top.geometry, sg = this.side.geometry;
    const tp = tg.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!tp || tp.count !== n * (C + 1) || (this.hasSide && (sg.getAttribute('position') as THREE.BufferAttribute | undefined)?.count !== n * 2)) {
      this.update(st);
      return;
    }
    const P = tp.array as Float32Array, F = (tg.getAttribute('aFoam') as THREE.BufferAttribute).array as Float32Array;
    const V = (tg.getAttribute('aVel') as THREE.BufferAttribute).array as Float32Array, D = (tg.getAttribute('aDepth') as THREE.BufferAttribute).array as Float32Array;
    const FL = (tg.getAttribute('aFlow') as THREE.BufferAttribute).array as Float32Array;
    for (let k = 0; k < n; k++) {
      const s = st[k], y = s.bed + s.depth, zc = s.z0 ?? 0, f = s.foam ?? 0, v = s.vel ?? this.vel;
      for (let j = 0; j <= C; j++) {
        const i = k * (C + 1) + j, lat = -1 + (2 * j) / C;
        P[3 * i] = s.x;
        P[3 * i + 1] = y;
        P[3 * i + 2] = zc + lat * s.halfW;
        FL[2 * i] = s.x;
        F[i] = f;
        V[i] = v;
        D[i] = Math.max(0, s.depth);
      }
    }
    for (const nm of ['position', 'aFoam', 'aVel', 'aDepth', 'aFlow']) tg.getAttribute(nm).needsUpdate = true;
    tg.computeVertexNormals();
    if (!this.hasSide) return;
    const SP = (sg.getAttribute('position') as THREE.BufferAttribute).array as Float32Array, SF = (sg.getAttribute('aFoam') as THREE.BufferAttribute).array as Float32Array;
    const SV = (sg.getAttribute('aVel') as THREE.BufferAttribute).array as Float32Array, SD = (sg.getAttribute('aDepth') as THREE.BufferAttribute).array as Float32Array;
    const SFL = (sg.getAttribute('aFlow') as THREE.BufferAttribute).array as Float32Array;
    for (let k = 0; k < n; k++) {
      const s = st[k], z = (s.z0 ?? 0) + s.halfW - 0.005, v = s.vel ?? this.vel, f = s.foam ?? 0, d = Math.max(0, s.depth);
      SP.set([s.x, s.bed, z, s.x, s.bed + s.depth, z], 6 * k);
      SFL[4 * k] = SFL[4 * k + 2] = s.x;
      SF[2 * k] = SF[2 * k + 1] = f;
      SV[2 * k] = SV[2 * k + 1] = v;
      SD[2 * k] = SD[2 * k + 1] = d;
    }
    for (const nm of ['position', 'aFoam', 'aVel', 'aDepth', 'aFlow']) sg.getAttribute(nm).needsUpdate = true;
  }

  update(st: Station[]): void {
    const n = st.length;
    if (n < 2) return;
    const C = this.cols;
    const pos: number[] = [], flow: number[] = [], foam: number[] = [], vel: number[] = [], dep: number[] = [], rel: number[] = [], col: number[] = [], idx: number[] = [];
    const c = this.color;
    for (let k = 0; k < n; k++) {
      const s = st[k];
      const y = s.bed + s.depth;
      const zc = s.z0 ?? 0;
      const f = s.foam ?? 0;
      const v = s.vel ?? this.vel;
      for (let j = 0; j <= C; j++) {
        const lat = -1 + (2 * j) / C;
        pos.push(s.x, y, zc + lat * s.halfW);
        flow.push(s.x, lat);
        foam.push(f);
        vel.push(v);
        dep.push(Math.max(0, s.depth));
        rel.push(1);
        col.push(c.r, c.g, c.b);
      }
      if (k < n - 1) {
        const a = k * (C + 1), b = (k + 1) * (C + 1);
        for (let j = 0; j < C; j++) idx.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
    g.setAttribute('aVel', new THREE.Float32BufferAttribute(vel, 1));
    g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
    g.setAttribute('aRel', new THREE.Float32BufferAttribute(rel, 1));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.top.geometry.dispose();
    this.top.geometry = g;
    if (!this.hasSide) return;
    // cara lateral: del fondo a la superficie, en el borde +z
    const sp: number[] = [], sf: number[] = [], sfo: number[] = [], sv: number[] = [], sd: number[] = [], sr: number[] = [], sc: number[] = [], si: number[] = [];
    for (let k = 0; k < n; k++) {
      const s = st[k];
      const z = (s.z0 ?? 0) + s.halfW - 0.005;
      const v = s.vel ?? this.vel;
      const f = s.foam ?? 0;
      sp.push(s.x, s.bed, z, s.x, s.bed + s.depth, z);
      sf.push(s.x, 1, s.x, 1);
      sfo.push(f, f);
      sv.push(v, v);
      sd.push(Math.max(0, s.depth), Math.max(0, s.depth));
      sr.push(0, 1);
      sc.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (k < n - 1) {
        const a = k * 2;
        si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const h = new THREE.BufferGeometry();
    h.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    h.setAttribute('aFlow', new THREE.Float32BufferAttribute(sf, 2));
    h.setAttribute('aFoam', new THREE.Float32BufferAttribute(sfo, 1));
    h.setAttribute('aVel', new THREE.Float32BufferAttribute(sv, 1));
    h.setAttribute('aDepth', new THREE.Float32BufferAttribute(sd, 1));
    h.setAttribute('aRel', new THREE.Float32BufferAttribute(sr, 1));
    h.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    h.setIndex(si);
    h.computeVertexNormals();
    this.side.geometry.dispose();
    this.side.geometry = h;
  }
}

/** Velocidad, fondo y profundidad del agua en una posición x (interpolados entre estaciones). */
export interface FlowSample {
  bed: number;
  depth: number;
  vel: number;
}

/** Campo del agua a partir de estaciones ordenadas por x; `vel` de cada estación o `fallback`. */
export function stationField(st: Station[], fallback = 0.5): (x: number) => FlowSample | null {
  const S = st.filter((s) => Number.isFinite(s.x)).slice().sort((a, b) => a.x - b.x);
  return (x: number) => {
    if (S.length < 2 || x < S[0].x || x > S[S.length - 1].x) return null;
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (S[mid].x <= x) lo = mid;
      else hi = mid;
    }
    const a = S[lo], b = S[hi];
    const t = b.x > a.x ? (x - a.x) / (b.x - a.x) : 0;
    const depth = a.depth + (b.depth - a.depth) * t;
    if (!(depth > 0.002)) return null;
    const va = a.vel ?? fallback, vb = b.vel ?? fallback;
    return { bed: a.bed + (b.bed - a.bed) * t, depth, vel: va + (vb - va) * t };
  };
}

/**
 * Trazadores: partículas que viajan dentro del agua junto al vidrio, cada una a la velocidad que le corresponde por
 * su altura (perfil de potencia 1/7: u = 1,143·V·(z/y)^(1/7), con media V en la vertical). Se estiran en la
 * dirección del movimiento. En el remolino del resalto (`roller`), las de arriba se devuelven, bajan junto al pie y
 * vuelven a subir aguas abajo: el ciclo del rodillo.
 */
export class Tracers {
  readonly mesh: THREE.InstancedMesh;
  private p: { x: number; rel: number; z: number; j: number }[] = [];
  private field: ((x: number) => FlowSample | null) | null = null;
  private x0 = 0;
  private x1 = 1;
  private z: [number, number] = [0, 0];
  private roller: [number, number] | null = null;
  private r: number;
  private rnd = 1;
  private clock = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private sv = new THREE.Vector3();
  private v3 = new THREE.Vector3();

  constructor(count: number, radius: number, color: THREE.ColorRepresentation = '#ffc93c') {
    this.r = radius;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: new THREE.Color(color), emissiveIntensity: 0.45 });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    for (let k = 0; k < count; k++) this.p.push({ x: 0, rel: 0.5, z: 0, j: this.rand() });
  }

  private rand(): number {
    this.rnd = (this.rnd * 16807) % 2147483647;
    return this.rnd / 2147483647;
  }

  /** Cambia el campo de velocidades; reparte las partículas a lo largo si `reseed` (la primera vez, siempre). */
  set(field: (x: number) => FlowSample | null, x0: number, x1: number, z: [number, number], roller: [number, number] | null = null, reseed = false): void {
    const first = !this.field;
    this.field = field;
    this.x0 = x0;
    this.x1 = x1;
    this.z = z;
    this.roller = roller && roller[1] > roller[0] + 0.05 ? roller : null;
    if (first || reseed) for (const p of this.p) this.spawn(p, x0 + this.rand() * (x1 - x0));
  }

  private spawn(p: { x: number; rel: number; z: number; j: number }, x: number): void {
    p.x = x;
    p.rel = 0.06 + this.rand() * 0.9;
    p.z = this.z[0] + this.rand() * (this.z[1] - this.z[0]);
    p.j = this.rand();
  }

  update(dt: number, reduced = false): void {
    const f = this.field;
    if (!f) return;
    const h = Math.min(0.05, Math.max(0, dt));
    if (!reduced) this.clock += h;
    const zero = this.m4.clone().makeScale(0, 0, 0);
    for (let k = 0; k < this.p.length; k++) {
      const p = this.p[k];
      let s = f(p.x);
      if (!s) {
        this.spawn(p, this.x0 + this.rand() * 0.03 * (this.x1 - this.x0));
        s = f(p.x);
        if (!s) {
          this.mesh.setMatrixAt(k, zero);
          continue;
        }
      }
      let u = s.vel * 1.143 * Math.pow(Math.max(0.03, p.rel), 1 / 7);
      // la turbulencia mezcla en la vertical (en fracción de la profundidad por segundo)
      let w = 0.12 * Math.sin(this.clock * (0.7 + p.j) + p.j * 40);
      const R = this.roller;
      if (R && p.x >= R[0] && p.x <= R[1]) {
        const t = (p.x - R[0]) / (R[1] - R[0]);
        if (p.rel > 0.55) {
          // arriba: se devuelve hacia el pie y, al llegar a él, el chorro la arrastra hacia abajo
          u = -0.32 * s.vel * ((p.rel - 0.55) / 0.45) * (1 - t * 0.5);
          w = t < 0.2 ? -1.3 : -0.05;
        } else {
          // abajo: el chorro avanza y sube hacia el final del remolino
          w = 0.25 + 0.9 * t;
        }
        w += Math.sin((p.j * 40 + this.clock * 2.3) * 1.7) * 0.3;
      }
      if (!reduced) {
        p.x += u * h;
        p.rel = Math.min(0.97, Math.max(0.04, p.rel + w * h));
      }
      if (p.x > this.x1 || p.x < this.x0) {
        this.spawn(p, this.x0 + this.rand() * 0.03 * (this.x1 - this.x0));
        continue;
      }
      const y = s.bed + p.rel * s.depth;
      const stretch = Math.min(4.5, 1 + (Math.abs(u) * 0.035) / this.r);
      this.sv.set(this.r * stretch, this.r, this.r);
      this.mesh.setMatrixAt(k, this.m4.compose(this.v3.set(p.x, y, p.z), this.q, this.sv));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
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

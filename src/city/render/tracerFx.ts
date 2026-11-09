// Dibujo del recorrido de las gotas trazadoras («Seguir el agua»).
//
// · Recorrido completo desde donde se soltó: cinta apoyada sobre la superficie (o la lámina de agua),
//   con ancho en metros y un mínimo en pantalla, borde oscuro y desvanecimiento suave hacia el origen.
//   Los puntos vienen del modelo cada 0,35 m recorridos (TracerSet), así que la cinta sigue la
//   trayectoria calculada sin cortar esquinas ni subirse a los techos.
// · En cada tanda, una gota «guía» se dibuja más gruesa y con pulsos que avanzan hacia ella; las
//   demás, más finas, muestran cómo se abre el grupo.
// · La gota en movimiento es brillante, con sombra y orientada en el sentido del avance. Al llegar a su
//   destino se encoge con un anillo y deja una marca con ícono: rejilla (sumidero), flecha hacia abajo
//   (suelo), flecha de salida o depósito. Las marcas cercanas del mismo destino se agrupan y una
//   etiqueta dice cuántas gotas llegaron allí.
// · Donde se soltó cada tanda queda un anillo punteado.
// Los colores de destino son los de «¿Adónde fue la lluvia?», en el mismo orden.

import * as THREE from 'three';
import type { TracerSet, TracerState } from '../sim/tracers';
import { fmtDuration } from './palette';
import { TRACER_COLORS, TRACER_MOVING_RING, TRACER_TRAIL_MOVING } from './tracerColors';

export interface TracerLabel {
  id: string;
  text: string;
  sub: string;
  color: string;
  at: THREE.Vector3;
}

const DEST_TEXT: Record<TracerState, string> = { agua: 'en movimiento', sumidero: 'al sumidero', suelo: 'al suelo', salida: 'salieron del sector', deposito: 'al depósito' };
const ICON: Record<TracerState, number> = { agua: 0, sumidero: 1, suelo: 2, salida: 3, deposito: 4 };

const SEG_VS = /* glsl */ `
attribute vec3 aA;
attribute vec3 aB;
attribute vec2 aS;
attribute vec2 aAge;
attribute vec4 aCol;
attribute vec2 aInfo; // x: 1 = en movimiento; y: 1 = gota guía de la tanda
uniform vec2 uRes;
uniform float uProj;
varying float vAcross;
varying float vAge;
varying vec4 vCol;
varying float vS;
varying vec2 vInfo;
varying float vPx;
void main() {
  vec4 ca = projectionMatrix * viewMatrix * vec4(aA, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(aB, 1.0);
  if (ca.w < 0.05 || cb.w < 0.05) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec2 sa = ca.xy / ca.w * uRes * 0.5, sb = cb.xy / cb.w * uRes * 0.5;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float endB = position.y;
  vec4 c = endB < 0.5 ? ca : cb;
  // ancho total: franja de color al centro, borde blanco y sombra suave
  float wWorld = aInfo.y > 0.5 ? 0.9 : 0.32;
  float minPx = aInfo.y > 0.5 ? 15.0 : 6.0;
  float px = max(minPx, wWorld * uProj / c.w);
  vec2 off = nrm * position.x * px * 0.5 + dir * (endB < 0.5 ? -1.0 : 1.0) * px * 0.3;
  c.xy += off / (uRes * 0.5) * c.w;
  gl_Position = c;
  vAcross = position.x;
  vAge = mix(aAge.x, aAge.y, endB);
  vCol = aCol;
  vS = mix(aS.x, aS.y, endB);
  vInfo = aInfo;
  vPx = px;
}`;

const SEG_FS = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
uniform float uSpacing;
varying float vAcross;
varying float vAge;
varying vec4 vCol;
varying float vS;
varying vec2 vInfo;
varying float vPx;
void main() {
  // estilo de ruta: franja de color, borde blanco y sombra oscura suave a los lados
  float e = abs(vAcross);
  float px1 = 2.0 / max(vPx, 1.0);
  float core = 1.0 - smoothstep(0.52 - px1, 0.52 + px1, e);
  float casing = 1.0 - smoothstep(0.74 - px1, 0.74 + px1, e);
  float shadow = (1.0 - smoothstep(0.74, 1.0, e)) * 0.28;
  vec3 col = vCol.rgb;
  // flechas (chevrones) que avanzan hacia la gota guía mientras se mueve
  if (vInfo.y > 0.5) {
    float u = fract((vS - uTime * uSpacing * (vInfo.x > 0.5 ? 0.9 : 0.0)) / uSpacing);
    float ac = vAcross / 0.52;
    float d = abs(u - 0.5 + abs(ac) * 0.28);
    float chev = (1.0 - smoothstep(0.07, 0.11, d)) * (1.0 - smoothstep(0.7, 0.85, abs(ac))) * core;
    col = mix(col, vec3(1.0), chev * 0.95);
  }
  col = mix(vec3(1.0), col, core);
  col = mix(vec3(0.03, 0.09, 0.18), col, casing);
  float fade = 0.45 + 0.55 * pow(1.0 - vAge, 0.7); // el recorrido entero queda visible; lo antiguo, más tenue
  float a = max(casing, shadow) * vCol.a * fade * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

const HEAD_VS = /* glsl */ `
attribute vec3 aP;
attribute vec3 aDir;
attribute vec4 aCol;
attribute vec4 aKind; // x: 0 gota, 1 marca de destino, 2 punto de suelta; y: tiempo desde el evento [s]; z: ícono; w: tamaño
uniform vec2 uRes;
uniform float uTime;
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vKind;
void main() {
  vec4 c = projectionMatrix * viewMatrix * vec4(aP, 1.0);
  if (c.w < 0.05) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec4 d = projectionMatrix * viewMatrix * vec4(aP + aDir, 1.0);
  vec2 sd = d.xy / d.w - c.xy / c.w;
  bool orient = aKind.x < 0.5 || (aKind.x < 1.5 && (aKind.y < 0.7 || aKind.z > 2.5 && aKind.z < 3.5));
  float ang = orient && length(sd * uRes) > 0.5 ? atan(sd.y * uRes.y, sd.x * uRes.x) : 0.0;
  float sz = aKind.w;
  if (aKind.x < 0.5) sz *= 1.0 + 0.06 * sin(uTime * 6.0 + aP.x * 3.1 + aP.z * 1.7);
  vec2 p = position.xy;
  vec2 r = vec2(cos(ang) * p.x - sin(ang) * p.y, sin(ang) * p.x + cos(ang) * p.y);
  c.xy += r * sz / (uRes * 0.5) * c.w;
  gl_Position = c;
  vUv = p;
  vCol = aCol;
  vKind = aKind;
}`;

const HEAD_FS = /* glsl */ `
uniform vec3 uRing;
uniform float uOpacity;
varying vec2 vUv;
varying vec4 vCol;
varying vec4 vKind;
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float box(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  vec2 p = vUv;
  vec3 dark = vec3(0.04, 0.12, 0.23);
  float kind = vKind.x, since = vKind.y, icon = vKind.z;
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (kind < 0.5 || (kind < 1.5 && since < 0.7)) {
    // gota brillante con cola hacia atrás (+x = sentido del avance); al llegar se encoge
    float k = kind < 0.5 ? 1.0 : 1.0 - since / 0.7;
    vec2 q = p / max(k, 0.06);
    vec2 c = vec2(0.2, 0.0);
    float R = 0.46, tip = -0.88;
    float dC = length(q - c) - R;
    float hw = R * clamp((q.x - tip) / (c.x - tip), 0.0, 1.0);
    float dT = (q.x < c.x && q.x > tip) ? abs(q.y) - hw : 1.0;
    float d = min(dC, dT);
    float body = smoothstep(0.035, -0.02, d) * step(0.001, k);
    float rim = smoothstep(-0.14, -0.07, d);
    vec2 l = q - c;
    float sph = clamp(1.0 - dot(l, l) / (R * R), 0.0, 1.0);
    vec3 base = mix(vec3(0.55, 0.78, 0.97), vec3(1.0), sph * 0.75);
    if (kind > 0.5) base = mix(base, vCol.rgb, 0.65);
    col = mix(base, kind > 0.5 ? dark : uRing, rim);
    col = mix(col, vec3(1.0), smoothstep(0.15, 0.02, length(q - vec2(0.32, 0.18))));
    a = body;
    // sombra suave debajo
    float shadow = smoothstep(0.8, 0.1, length((p - vec2(0.1, -0.3)) * vec2(1.0, 1.8))) * 0.32 * k;
    if (a < 0.5) { col = mix(vec3(0.0), col, a); a = max(a, shadow); }
    // anillo al llegar
    if (kind > 0.5) {
      float t = since / 0.7;
      float ring = smoothstep(0.08, 0.0, abs(length(p) - (0.25 + 0.7 * t))) * (1.0 - t);
      col = mix(col, vCol.rgb, ring * (1.0 - body));
      a = max(a, ring);
    }
  } else if (kind < 1.5) {
    // marca de destino: disco de color, borde blanco y oscuro, ícono
    float r = length(p);
    float disc = smoothstep(0.6, 0.54, r);
    float white = smoothstep(0.74, 0.68, r);
    float outer = smoothstep(0.86, 0.8, r);
    col = mix(dark, vec3(1.0), white);
    col = mix(col, vCol.rgb, disc);
    float ic = 0.0;
    if (icon < 1.5) {
      // sumidero: rejilla
      float b = step(box(p, vec2(0.3, 0.3)), 0.0);
      ic = b * step(0.5, fract(p.y * 4.2 + 0.5)) + smoothstep(0.06, 0.02, abs(box(p, vec2(0.3, 0.3))));
    } else if (icon < 2.5) {
      // suelo: flecha hacia abajo con tres puntos (infiltración)
      ic = smoothstep(0.075, 0.035, min(seg(p, vec2(-0.25, 0.14), vec2(0.0, -0.14)), seg(p, vec2(0.25, 0.14), vec2(0.0, -0.14))));
      ic = max(ic, smoothstep(0.075, 0.035, seg(p, vec2(0.0, 0.32), vec2(0.0, -0.1))));
    } else if (icon < 3.5) {
      // salida: flecha en el sentido en que salió
      ic = smoothstep(0.075, 0.035, min(min(seg(p, vec2(-0.3, 0.0), vec2(0.26, 0.0)), seg(p, vec2(0.04, 0.24), vec2(0.28, 0.0))), seg(p, vec2(0.04, -0.24), vec2(0.28, 0.0))));
    } else {
      // depósito: tanque
      float b = box(p - vec2(0.0, -0.04), vec2(0.22, 0.24));
      float top = length((p - vec2(0.0, 0.2)) * vec2(1.0, 3.0)) - 0.22;
      ic = smoothstep(0.03, 0.0, min(b, top));
    }
    col = mix(col, dark, ic * disc);
    a = outer;
  } else {
    // donde se soltó la tanda: anillo punteado con una gota pequeña al centro
    float r = length(p);
    float ang = atan(p.y, p.x);
    float dash = step(0.45, fract(ang / 6.2832 * 14.0));
    float ring = smoothstep(0.1, 0.03, abs(r - 0.72)) * dash;
    float halo = smoothstep(0.16, 0.0, abs(r - 0.72)) * 0.5 * dash;
    float t = clamp(since / 1.4, 0.0, 1.0);
    float pulse = smoothstep(0.08, 0.0, abs(r - (0.2 + 0.75 * t))) * (1.0 - t);
    vec2 q = p * 2.4 - vec2(0.0, -0.1);
    float drop = smoothstep(0.04, -0.02, min(length(q - vec2(0.0, -0.12)) - 0.42, (q.y > -0.12 ? abs(q.x) - 0.42 * (1.0 - (q.y + 0.12) / 0.9) : 1.0)));
    col = mix(dark, vec3(1.0), max(ring, drop));
    col = mix(col, vec3(0.49, 0.78, 1.0), drop * 0.6);
    a = max(max(ring, halo * 0.6), max(drop, pulse));
    col = mix(col, vec3(1.0), pulse * (1.0 - ring));
  }
  a *= uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

const MAX_SEG = 60000;
const MAX_HEADS = 2400;

export class TracerFx {
  private segGeo: THREE.InstancedBufferGeometry;
  private segA: THREE.InstancedBufferAttribute;
  private segB: THREE.InstancedBufferAttribute;
  private segS: THREE.InstancedBufferAttribute;
  private segAge: THREE.InstancedBufferAttribute;
  private segCol: THREE.InstancedBufferAttribute;
  private segInfo: THREE.InstancedBufferAttribute;
  private headGeo: THREE.InstancedBufferGeometry;
  private hP: THREE.InstancedBufferAttribute;
  private hDir: THREE.InstancedBufferAttribute;
  private hCol: THREE.InstancedBufferAttribute;
  private hKind: THREE.InstancedBufferAttribute;
  private mats: THREE.ShaderMaterial[] = [];
  private uRes = { value: new THREE.Vector2(1, 1) };
  private uProj = { value: 600 };
  private uTime = { value: 0 };
  /** Separación de las flechas sobre la ruta [m]: crece con la distancia de la cámara. */
  private uSpacing = { value: 3 };
  private ended = new Map<number, number>();
  private released = new Map<number, number>();
  private clock = 0;
  private lastKey = '';
  private colors: Record<TracerState, THREE.Color>;
  private moving = new THREE.Color(TRACER_TRAIL_MOVING);
  private route = new THREE.Color(TRACER_MOVING_RING);
  readonly group = new THREE.Group();
  /** Etiquetas «N gotas → destino» para la capa de etiquetas de la escena. */
  labels: TracerLabel[] = [];
  /** Cambia cuando cambian las etiquetas (para volver a armarlas solo entonces). */
  labelsKey = '';

  constructor() {
    this.colors = Object.fromEntries(Object.entries(TRACER_COLORS).map(([k, v]) => [k, new THREE.Color(v)])) as Record<TracerState, THREE.Color>;
    const dyn = (n: number, k: number) => new THREE.InstancedBufferAttribute(new Float32Array(n * k), k).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    // cintas del recorrido
    this.segGeo = new THREE.InstancedBufferGeometry();
    this.segGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    this.segGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.segA = dyn(MAX_SEG, 3);
    this.segB = dyn(MAX_SEG, 3);
    this.segS = dyn(MAX_SEG, 2);
    this.segAge = dyn(MAX_SEG, 2);
    this.segCol = dyn(MAX_SEG, 4);
    this.segInfo = dyn(MAX_SEG, 2);
    this.segGeo.setAttribute('aA', this.segA);
    this.segGeo.setAttribute('aB', this.segB);
    this.segGeo.setAttribute('aS', this.segS);
    this.segGeo.setAttribute('aAge', this.segAge);
    this.segGeo.setAttribute('aCol', this.segCol);
    this.segGeo.setAttribute('aInfo', this.segInfo);
    this.segGeo.instanceCount = 0;
    // dos pasadas: lo que queda detrás de un edificio se ve tenue; lo visible, completo
    for (const [ghost, order] of [[true, 5], [false, 6]] as const) {
      const m = new THREE.ShaderMaterial({ vertexShader: SEG_VS, fragmentShader: SEG_FS, uniforms: { uRes: this.uRes, uProj: this.uProj, uTime: this.uTime, uSpacing: this.uSpacing, uOpacity: { value: ghost ? 0.12 : 1 } }, transparent: true, depthWrite: false, depthTest: !ghost, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(this.segGeo, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      this.mats.push(m);
      this.group.add(mesh);
    }
    // gotas, marcas y puntos de suelta
    this.headGeo = new THREE.InstancedBufferGeometry();
    this.headGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.headGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.hP = dyn(MAX_HEADS, 3);
    this.hDir = dyn(MAX_HEADS, 3);
    this.hCol = dyn(MAX_HEADS, 4);
    this.hKind = dyn(MAX_HEADS, 4);
    this.headGeo.setAttribute('aP', this.hP);
    this.headGeo.setAttribute('aDir', this.hDir);
    this.headGeo.setAttribute('aCol', this.hCol);
    this.headGeo.setAttribute('aKind', this.hKind);
    this.headGeo.instanceCount = 0;
    for (const [ghost, order] of [[true, 8], [false, 9]] as const) {
      const m = new THREE.ShaderMaterial({ vertexShader: HEAD_VS, fragmentShader: HEAD_FS, uniforms: { uRes: this.uRes, uTime: this.uTime, uRing: { value: new THREE.Color(TRACER_MOVING_RING) }, uOpacity: { value: ghost ? 0.45 : 1 } }, transparent: true, depthWrite: false, depthTest: !ghost, side: THREE.DoubleSide });
      const heads = new THREE.Mesh(this.headGeo, m);
      heads.frustumCulled = false;
      heads.renderOrder = order;
      this.mats.push(m);
      this.group.add(heads);
    }
  }

  /**
   * @param surf altura del dibujo en (x, y) del modelo: superficie suavizada + lámina de agua
   * @param w conversión de coordenadas del modelo al mundo
   */
  update(
    tr: TracerSet | null,
    dtReal: number,
    viewport: { w: number; h: number; fov: number; camDist: number },
    surf: (x: number, y: number) => number,
    w: (x: number, y: number, z: number, out: THREE.Vector3) => THREE.Vector3,
    cellCenter: (k: number) => [number, number],
  ): void {
    this.clock += dtReal;
    this.uTime.value = this.clock;
    this.uRes.value.set(viewport.w, viewport.h);
    this.uProj.value = viewport.h / (2 * Math.tan((viewport.fov * Math.PI) / 360));
    this.uSpacing.value = Math.min(7, Math.max(1.4, viewport.camDist * 0.03));
    if (!tr || (!tr.tracers.length && !tr.releases.length)) {
      this.segGeo.instanceCount = 0;
      this.headGeo.instanceCount = 0;
      this.ended.clear();
      this.released.clear();
      if (this.labels.length) {
        this.labels = [];
        this.labelsKey = '';
      }
      this.lastKey = '';
      return;
    }
    // tiempos de los eventos (para las animaciones de llegada y de suelta)
    for (const t of tr.tracers) if (t.state !== 'agua' && !this.ended.has(t.id)) this.ended.set(t.id, this.clock);
    for (const r of tr.releases) if (!this.released.has(r.group)) this.released.set(r.group, this.clock);
    const key = `${tr.sim.t}|${tr.tracers.length}|${surf(0.5, 0.5)}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.buildTrails(tr, surf, w);
    }
    this.buildHeads(tr, surf, w, cellCenter);
  }

  private buildTrails(tr: TracerSet, surf: (x: number, y: number) => number, w: (x: number, y: number, z: number, out: THREE.Vector3) => THREE.Vector3): void {
    const A = this.segA.array as Float32Array, B = this.segB.array as Float32Array, S = this.segS.array as Float32Array, AG = this.segAge.array as Float32Array, C = this.segCol.array as Float32Array, I = this.segInfo.array as Float32Array;
    let ns = 0;
    const va = new THREE.Vector3(), vb = new THREE.Vector3();
    const guide = new Set<number>();
    const seen = new Set<number>();
    for (const t of tr.tracers) if (!seen.has(t.group)) {
      seen.add(t.group);
      guide.add(t.id);
    }
    const qx: number[] = [], qy: number[] = [], qz: number[] = [];
    // primero las finas y al final las guías (quedan encima)
    const order = [...tr.tracers].sort((a, b) => Number(guide.has(a.id)) - Number(guide.has(b.id)));
    for (const t of order) {
      const isGuide = guide.has(t.id);
      const col = t.state === 'agua' ? this.route : this.colors[t.state];
      const alpha = t.state === 'agua' ? (isGuide ? 1 : 0.55) : isGuide ? 0.9 : 0.42;
      qx.length = qy.length = qz.length = 0;
      const n = t.trail.length / 2;
      for (let i = 0; i < n; i++) {
        const x = t.trail[i * 2], y = t.trail[i * 2 + 1];
        const z = surf(x, y);
        // caída desde un techo (más de 2,5 m): baja junto a la pared, como por la bajante
        if (i > 0 && qz[qz.length - 1] - z > 2.5) {
          qx.push(x);
          qy.push(y);
          qz.push(qz[qz.length - 1]);
        }
        qx.push(x);
        qy.push(y);
        qz.push(z);
      }
      if (t.state === 'agua') {
        qx.push(t.x);
        qy.push(t.y);
        qz.push(surf(t.x, t.y));
      }
      const nq = qx.length;
      if (nq < 2) continue;
      // distancia acumulada (para los pulsos) y edad relativa (0 = punta, 1 = origen)
      let total = 0;
      for (let i = 1; i < nq; i++) total += Math.hypot(qx[i] - qx[i - 1], qy[i] - qy[i - 1], qz[i] - qz[i - 1]);
      let s = 0;
      w(qx[0], qy[0], qz[0], va);
      for (let i = 1; i < nq && ns < MAX_SEG; i++) {
        const L = Math.hypot(qx[i] - qx[i - 1], qy[i] - qy[i - 1], qz[i] - qz[i - 1]);
        if (L < 1e-4) continue;
        w(qx[i], qy[i], qz[i], vb);
        A[ns * 3] = va.x;
        A[ns * 3 + 1] = va.y;
        A[ns * 3 + 2] = va.z;
        B[ns * 3] = vb.x;
        B[ns * 3 + 1] = vb.y;
        B[ns * 3 + 2] = vb.z;
        S[ns * 2] = s;
        S[ns * 2 + 1] = s + L;
        AG[ns * 2] = total > 0 ? 1 - s / total : 0;
        AG[ns * 2 + 1] = total > 0 ? 1 - (s + L) / total : 0;
        C[ns * 4] = col.r;
        C[ns * 4 + 1] = col.g;
        C[ns * 4 + 2] = col.b;
        C[ns * 4 + 3] = alpha;
        I[ns * 2] = t.state === 'agua' ? 1 : 0;
        I[ns * 2 + 1] = isGuide ? 1 : 0;
        s += L;
        ns++;
        va.copy(vb);
      }
    }
    this.segGeo.instanceCount = ns;
    for (const a of [this.segA, this.segB, this.segS, this.segAge, this.segCol, this.segInfo]) a.needsUpdate = true;
  }

  private buildHeads(tr: TracerSet, surf: (x: number, y: number) => number, w: (x: number, y: number, z: number, out: THREE.Vector3) => THREE.Vector3, cellCenter: (k: number) => [number, number]): void {
    const HP = this.hP.array as Float32Array, HD = this.hDir.array as Float32Array, HC = this.hCol.array as Float32Array, HK = this.hKind.array as Float32Array;
    let nh = 0;
    const v = new THREE.Vector3();
    const put = (x: number, y: number, z: number, dx: number, dy: number, col: THREE.Color, alpha: number, kind: number, since: number, icon: number, size: number) => {
      if (nh >= MAX_HEADS) return;
      w(x, y, z, v);
      HP[nh * 3] = v.x;
      HP[nh * 3 + 1] = v.y;
      HP[nh * 3 + 2] = v.z;
      const L = Math.hypot(dx, dy) || 1;
      HD[nh * 3] = dx / L;
      HD[nh * 3 + 1] = 0;
      HD[nh * 3 + 2] = -dy / L;
      HC[nh * 4] = col.r;
      HC[nh * 4 + 1] = col.g;
      HC[nh * 4 + 2] = col.b;
      HC[nh * 4 + 3] = alpha;
      HK[nh * 4] = kind;
      HK[nh * 4 + 1] = since;
      HK[nh * 4 + 2] = icon;
      HK[nh * 4 + 3] = size;
      nh++;
    };
    // puntos de suelta
    for (const r of tr.releases) put(r.x, r.y, surf(r.x, r.y) + 0.05, 1, 0, this.moving, 1, 2, this.clock - (this.released.get(r.group) ?? this.clock), 0, 15);
    // destinos agrupados (misma clase y a menos de ≈2,5 m)
    interface Cluster { state: TracerState; x: number; y: number; n: number; dx: number; dy: number }
    const clusters: Cluster[] = [];
    const guideLabels: { t: (typeof tr.tracers)[number]; x: number; y: number }[] = [];
    const guide = new Set<number>();
    const seen = new Set<number>();
    for (const t of tr.tracers) if (!seen.has(t.group)) {
      seen.add(t.group);
      guide.add(t.id);
    }
    for (const t of tr.tracers) {
      const nT = t.trail.length;
      let ddx = 1, ddy = 0;
      if (nT >= 4) {
        ddx = t.trail[nT - 2] - t.trail[nT - 4];
        ddy = t.trail[nT - 1] - t.trail[nT - 3];
      }
      if (t.state === 'agua') {
        const lx = t.trail[nT - 2], ly = t.trail[nT - 1];
        if (Math.hypot(t.x - lx, t.y - ly) > 0.05) {
          ddx = t.x - lx;
          ddy = t.y - ly;
        }
        const isGuide = guide.has(t.id);
        put(t.x, t.y, surf(t.x, t.y), ddx, ddy, this.moving, 1, 0, 0, 0, isGuide ? 21 : 12);
        if (isGuide) guideLabels.push({ t, x: t.x, y: t.y });
        continue;
      }
      const since = this.clock - (this.ended.get(t.id) ?? this.clock);
      // dónde queda la marca: en el sumidero, en el borde de salida o donde se infiltró
      let ex = t.x, ey = t.y;
      if (t.state === 'sumidero' && t.endCell >= 0) [ex, ey] = cellCenter(t.endCell);
      if (since < 0.7) put(t.x + (ex - t.x) * (since / 0.7), t.y + (ey - t.y) * (since / 0.7), surf(t.x, t.y), ddx, ddy, this.colors[t.state], 1, 1, since, ICON[t.state], guide.has(t.id) ? 16 : 12);
      let cl = clusters.find((c) => c.state === t.state && Math.hypot(c.x / c.n - ex, c.y / c.n - ey) < 2.5);
      if (!cl) {
        cl = { state: t.state, x: 0, y: 0, n: 0, dx: 0, dy: 0 };
        clusters.push(cl);
      }
      cl.x += ex;
      cl.y += ey;
      cl.n++;
      cl.dx += ddx;
      cl.dy += ddy;
    }
    const labels: TracerLabel[] = [];
    // etiqueta junto a cada gota guía: cuánto ha recorrido y en cuánto tiempo (redondeado para no parpadear)
    for (const g of guideLabels) {
      const at = new THREE.Vector3();
      w(g.x, g.y, surf(g.x, g.y) + 1.6, at);
      const secs = Math.round((tr.sim.t - g.t.t0) / 10) * 10;
      labels.push({ id: `gg-${g.t.group}`, text: `${Math.round(g.t.dist)} m`, sub: fmtDuration(secs), color: TRACER_TRAIL_MOVING, at });
    }
    for (const c of clusters) {
      const x = c.x / c.n, y = c.y / c.n;
      put(x, y, surf(x, y) + 0.05, c.dx, c.dy, this.colors[c.state], 1, 1, 9, ICON[c.state], c.n >= 6 ? 13 : 11);
      if (c.n >= 2) {
        const at = new THREE.Vector3();
        w(x, y, surf(x, y) + 1.4, at);
        labels.push({ id: `g-${c.state}-${Math.round(x)}-${Math.round(y)}`, text: `${c.n} gotas`, sub: DEST_TEXT[c.state], color: TRACER_COLORS[c.state], at });
      }
    }
    this.headGeo.instanceCount = nh;
    for (const a of [this.hP, this.hDir, this.hCol, this.hKind]) a.needsUpdate = true;
    const lk = labels.map((l) => `${l.id}:${l.text}:${l.sub}`).join('|');
    if (lk !== this.labelsKey) {
      this.labelsKey = lk;
      this.labels = labels;
    } else {
      // mismas etiquetas: solo se actualiza su posición (la lámina de agua cambia de altura)
      labels.forEach((l, i) => this.labels[i]?.at.copy(l.at));
    }
  }

  dispose(): void {
    this.segGeo.dispose();
    this.headGeo.dispose();
    this.mats.forEach((m) => m.dispose());
  }
}

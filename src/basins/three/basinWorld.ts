// «Cuencas» en 3D: una cuenca de ladera ilustrativa (no es una quebrada real) con su red de drenaje, coberturas
// (bosque, pasto, cultivos, barrio y vías, de arriba hacia abajo según las fracciones), lluvia, pulsos que viajan por
// los cauces con el tiempo de concentración calculado y la estación de aforo en la salida. Al «lanzar el aguacero» se
// reproduce el hietograma y el hidrograma calculados en tiempo comprimido (unos 24 s).

import * as THREE from 'three';
import { Birds, RainStreaks, strataWall, studioFloor } from '../../three/scenery';
import { lookWater } from '../../three/look';
import { houses, noise2, rng, trees, type HouseSpot, type TreeSpot } from '../../quality/three/kit';
import type { ProbeInfo, QStage, StageLabel, StageView } from '../../quality/three/stage';
import { staffGauge } from '../../canals/three/canalKit';
import { COVERS, scsRunoff, type BasinResult, type Cover } from '../hydrology';
import { groundMaterial } from '../../three/ground';
import { fractionWithin } from '../../three/readings';
import { NRCS_K, manningV, travelTimes } from '../travel';

const X0 = -160, X1 = 160, Z0 = -110, Z1 = 110, NX = 128, NZ = 88;
const OUTLET = new THREE.Vector3(152, 0, 0);
const COVER_COLOR: Record<Cover, string> = { pavimento: '#8d8f91', barrio: '#cdb08f', cultivo: '#c9b860', pasto: '#93c06c', bosque: '#3f7a3a' };
const ORDER: Cover[] = ['pavimento', 'barrio', 'cultivo', 'pasto', 'bosque'];
/** Metros por unidad del mundo: el cauce principal de la cuenca de 60 ha (unos 1 400 m) mide unas 310 unidades. */
const M_PER_U = 4.5;
/** Bandas del mapa de tiempos de viaje. */
const BANDS = 6;

export type BasinLayer = 'aspecto' | 'viaje';

/** Cauce principal: línea central que serpentea hasta la salida. */
const mainZ = (x: number) => 16 * Math.sin(x * 0.019 + 0.6) * (1 - (x - X0) / (X1 - X0)) ;

function segDist(px: number, pz: number, a: THREE.Vector2, b: THREE.Vector2): number {
  const abx = b.x - a.x, abz = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.y) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(px - (a.x + t * abx), pz - (a.y + t * abz));
}

export class BasinWorld {
  private stage: QStage;
  private ground: THREE.Mesh;
  private heights = new Float32Array((NX + 1) * (NZ + 1));
  private paths: THREE.Vector3[][] = [];
  private pathLen: number[] = [];
  private streams: THREE.Mesh[] = [];
  private streamMat: THREE.MeshStandardMaterial;
  private rain: RainStreaks;
  private pulses: THREE.InstancedMesh;
  private pulseT: Float32Array;
  private veg = new THREE.Group();
  private r: BasinResult | null = null;
  private slope = 0.12;
  private builtKey = '';
  private m4 = new THREE.Matrix4();
  private playing = false;
  private tAnim = 0;
  private labelT = 0;
  /** Escala de la reproducción: minutos del modelo por segundo de animación. */
  private scale = 1;
  /** Llamado en cada cuadro durante el aguacero: minuto del modelo (o null al terminar). */
  onTime: ((tMin: number | null) => void) | null = null;
  readonly views: Record<'general' | 'salida' | 'arriba', StageView> = {
    general: { eye: [265, 250, 250], target: [-15, -6, -6], fit: 360, portrait: { eye: [300, 380, 360], target: [-10, 0, -10] } },
    salida: { eye: [196, 34, 66], target: [138, 2, 0], fit: 70 },
    arriba: { eye: [0, 380, 2], target: [0, 0, 0] },
  };

  constructor(stage: QStage) {
    this.stage = stage;
    const sc = stage.scene;
    stage.setShadowSpan(200);
    const g = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, NX, NZ);
    g.rotateX(-Math.PI / 2);
    g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    const nv = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(nv * 3).fill(1), 3));
    // coberturas dibujadas (pasto, cultivos en hileras, bosque, grava del cauce; barrio y vías en concreto)
    g.setAttribute('aMix', new THREE.Float32BufferAttribute(new Float32Array(nv * 4), 4));
    g.setAttribute('aTau', new THREE.Float32BufferAttribute(new Float32Array(nv), 1));
    this.ground = new THREE.Mesh(g, groundMaterial({ value: 1 / M_PER_U }, [0.15, 90]));
    this.ground.receiveShadow = true;
    // capa encima del suelo: mapa de tiempos de viaje y área que ya aporta a la salida durante el aguacero
    this.overlay = new THREE.Mesh(g, this.overlayMaterial());
    this.overlay.renderOrder = 2;
    this.overlay.visible = false;
    sc.add(this.ground, this.overlay, this.veg);
    this.streamMat = lookWater(new THREE.MeshStandardMaterial({ color: '#2f84b5', emissive: '#1f5f8a', emissiveIntensity: 0.15, roughness: 0.2, metalness: 0.05 }), [0.9, 0], 0.5);
    // lluvia en trazos con salpicaduras
    this.rain = new RainStreaks({ x0: X0, x1: X1, z0: Z0, z1: Z1, top: 130 }, (x, z) => this.h(x, z, this.slope), 2600, 70, 3.2, [0.1, 0.03], 1.2);
    sc.add(this.rain.group);
    const birds = new Birds(new THREE.Vector3(-20, 40, 0), 170, 50, 7, 2.2);
    sc.add(birds.group);
    stage.animate((t) => birds.update(t));
    // pulsos de agua por los cauces
    this.pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshStandardMaterial({ color: '#7fd0ff', emissive: '#2a8fd0', emissiveIntensity: 0.6 }), 60);
    this.pulses.frustumCulled = false;
    this.pulseT = new Float32Array(60).fill(-1);
    sc.add(this.pulses);
    // estación de aforo en la salida
    const st = new THREE.Group();
    const hut = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 4), new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.8 }));
    hut.position.set(0, 2, 0);
    hut.castShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.4, 4.6), new THREE.MeshStandardMaterial({ color: '#7d3b2b' }));
    roof.position.set(0, 4.2, 0);
    const gauge = staffGauge(4, 0.5, 1, 0.3);
    gauge.position.set(-4, 0, -6);
    st.add(hut, roof, gauge);
    st.position.set(OUTLET.x - 4, 0, OUTLET.z + 12);
    sc.add(st);
    this.station = st;
    // tanque de retención junto a la salida (solo en «El hidrograma», cuando se le da un volumen)
    const wall = new THREE.MeshStandardMaterial({ color: '#b9b4a8', roughness: 0.85 });
    const TW = 18, TD = 11, TH = 3.2;
    for (const [w, d, x, z] of [[TW + 0.8, 0.4, 0, -TD / 2], [TW + 0.8, 0.4, 0, TD / 2], [0.4, TD, -TW / 2, 0], [0.4, TD, TW / 2, 0]] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, TH + 4, d), wall);
      m.position.set(x, (TH - 4) / 2, z);
      m.castShadow = true;
      this.tank.add(m);
    }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(TW, 0.3, TD), wall);
    floor.position.y = 0.15;
    this.tankWater = new THREE.Mesh(new THREE.BoxGeometry(TW - 0.2, 1, TD - 0.2), lookWater(new THREE.MeshStandardMaterial({ color: '#3b8fc4', roughness: 0.1, transparent: true, opacity: 0.85 }), [0.05, 0.03], 0.35));
    this.tankWater.position.y = 0.3;
    this.tankWater.scale.y = 0.001;
    this.tankWater.userData.max = TH - 0.4;
    this.tank.add(floor, this.tankWater);
    this.tank.visible = false;
    sc.add(this.tank);
    // lecturas al pasar el puntero: la cobertura y lo que escurre en cada punto, y el tiempo que tarda en salir
    stage.addProbe(this.ground, (p) => this.probeGround(p));
    stage.view(this.views.general, false);
  }

  private overlay: THREE.Mesh;
  private overU = { uMode: { value: 0 }, uT: { value: -1 } };
  private cover: Cover[] = [];
  /** Fracciones del área ordenadas por tiempo de viaje (para el área que aporta). */
  private tauSorted: Float32Array = new Float32Array(0);
  private layer: BasinLayer = 'aspecto';

  private overlayMaterial(): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.userData.noLook = true;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uMode = this.overU.uMode;
      sh.uniforms.uT = this.overU.uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTau;\nvarying float vTau;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTau = aTau;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uMode;\nuniform float uT;\nvarying float vTau;`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec4 o = vec4(0.0);
            if (uMode > 0.5) {
              // bandas de igual tiempo de viaje (isócronas), de claro (cerca de la salida) a oscuro (lo más lejano)
              float b = floor(vTau * ${BANDS}.0) / ${(BANDS - 1).toFixed(1)};
              vec3 c = mix(vec3(0.62, 0.8, 0.9), vec3(0.004, 0.047, 0.147), clamp(b, 0.0, 1.0));
              float fr = fract(vTau * ${BANDS}.0);
              float w = fwidth(vTau * ${BANDS}.0);
              float line = 1.0 - smoothstep(0.0, 1.6 * w, min(fr, 1.0 - fr));
              o = vec4(mix(c, vec3(0.01, 0.03, 0.06), line * 0.7), 0.76);
            }
            if (uT >= 0.0) {
              // lo que ya aporta: el agua de esos puntos alcanzó a llegar a la salida
              float inA = 1.0 - smoothstep(uT - 0.004, uT + 0.004, vTau);
              float front = 1.0 - smoothstep(0.0, max(0.006, 2.0 * fwidth(vTau)), abs(vTau - uT));
              vec4 a = vec4(0.18, 0.55, 0.9, 0.34 * inA);
              o = vec4(mix(o.rgb, a.rgb, a.a / max(0.001, o.a + a.a)), max(o.a, a.a));
              o = mix(o, vec4(1.0, 1.0, 1.0, 0.95), front * step(uT, 0.999));
            }
            diffuseColor = o;
          }`,
        );
    };
    return m;
  }

  /** Mapa del suelo: su aspecto o el tiempo que tarda el agua de cada punto en llegar a la salida. */
  setLayer(l: BasinLayer): void {
    this.layer = l;
    this.overU.uMode.value = l === 'viaje' ? 1 : 0;
    this.overlay.visible = l === 'viaje' || this.overU.uT.value >= 0;
    this.stage.setLabels(this.labels(this.playing ? this.tAnim * this.scale : null));
  }

  /**
   * Tiempo de viaje de cada vértice hasta la salida con el método de velocidades del NRCS (src/basins/travel.ts):
   * por la ladera según la pendiente del terreno y la cobertura, y por el cauce con Manning. Se guarda como fracción
   * del más lento; la ficha y las bandas lo escalan al tiempo de concentración del panel.
   */
  private computeTau(): void {
    const pos = this.ground.geometry.attributes.position as THREE.BufferAttribute;
    const tau = this.ground.geometry.attributes.aTau as THREE.BufferAttribute;
    const nx = NX + 1, nz = NZ + 1;
    // distancia por el cauce desde cada punto de cada camino hasta la salida
    const rest = this.paths.map((p) => {
      const r = new Float32Array(p.length);
      for (let k = p.length - 2; k >= 0; k--) r[k] = r[k + 1] + Math.hypot(p[k + 1].x - p[k].x, p[k + 1].z - p[k].z);
      return r;
    });
    const z = new Float64Array(nx * nz), k = new Float64Array(nx * nz), ch = new Float64Array(nx * nz).fill(-1);
    for (let v = 0; v < pos.count && v < nx * nz; v++) {
      const x = pos.getX(v), zz = pos.getZ(v);
      z[v] = pos.getY(v) * M_PER_U;
      k[v] = NRCS_K[this.cover[v] ?? 'pasto'];
      let best = Infinity, d = -1;
      this.paths.forEach((p, i) => {
        for (let q = 0; q < p.length; q++) {
          const dd = Math.hypot(p[q].x - x, p[q].z - zz);
          if (dd < best) [best, d] = [dd, rest[i][q]];
        }
      });
      if (best < 3.2) ch[v] = d * M_PER_U;
    }
    // el cauce: Manning con n = 0,045 y radio hidráulico de 0,4 m, con la pendiente media del cauce principal
    const main = this.paths[0];
    const Sch = main && main.length > 1 ? Math.max(0.005, (main[0].y - main[main.length - 1].y) / Math.max(1, rest[0][0])) : 0.02;
    const t = travelTimes({ nx, nz, dx: ((X1 - X0) / NX) * M_PER_U, z, k, channel: ch, vch: manningV(0.045, 0.4, Sch) });
    let mx = 0;
    for (const v of t) if (v > mx) mx = v;
    for (let v = 0; v < pos.count; v++) tau.setX(v, (t[v] ?? 0) / Math.max(1e-6, mx));
    tau.needsUpdate = true;
    this.tauSorted = Float32Array.from(tau.array as Float32Array).sort();
  }

  /** Fracción del área de la cuenca cuya agua tarda menos que t (fracción del tiempo de concentración). */
  private areaWithin(t: number): number {
    return fractionWithin(this.tauSorted, t);
  }

  private probeGround(p: THREE.Vector3): ProbeInfo | null {
    const r = this.r;
    if (!r) return null;
    const pos = this.ground.geometry.attributes.position as THREE.BufferAttribute;
    const fx = (p.x - X0) / (X1 - X0), fz = (p.z - Z0) / (Z1 - Z0);
    if (fx < 0 || fx > 1 || fz < 0 || fz > 1) return null;
    const v = Math.round(fz * NZ) * (NX + 1) + Math.round(fx * NX);
    if (v < 0 || v >= pos.count) return null;
    const es = (x: number, d = 0) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const tau = (this.ground.geometry.attributes.aTau as THREE.BufferAttribute).getX(v);
    const inCh = Math.abs(p.z - mainZ(p.x)) < 3;
    if (inCh) {
      return {
        title: 'Cauce principal',
        rows: [
          ['Llega a la salida en', `unos ${es(tau * r.tc.used)} min`],
          ['Pico en la salida', `${es(r.Qpeak, 2)} m³/s al minuto ${es(r.tPeak)}`],
        ],
        strong: 0,
      };
    }
    const c = this.cover[v] ?? 'pasto';
    const CN = COVERS[c].CN[r.inp.soil];
    const q = scsRunoff(r.P, CN);
    return {
      title: COVERS[c].name,
      rows: [
        ['Número de curva', `${CN} (suelo ${r.inp.soil})`],
        ['De la lluvia', `${es(r.P)} mm`],
        ['Escurre aquí', `${es(q, 1)} mm (${es((q / Math.max(1e-6, r.P)) * 100)} %)`],
        ['Llega a la salida en', `unos ${es(tau * r.tc.used)} min`],
      ],
      strong: 2,
    };
  }

  private tank = new THREE.Group();
  private tankWater: THREE.Mesh;
  private tankFill: number[] | null = null;
  private tankNow = 0;

  /** Tanque de retención: fracción llena al final de cada intervalo Δt del hidrograma (o null: no hay tanque). */
  setTank(fill: number[] | null): void {
    this.tankFill = fill && fill.length ? fill : null;
    this.tank.visible = !!this.tankFill;
    if (!this.playing) this.setTankLevel(this.tankFill ? this.tankFill[this.tankFill.length - 1] : 0);
    this.stage.setLabels(this.labels(null));
  }

  private setTankLevel(f: number): void {
    this.tankNow = Math.max(0, Math.min(1, f));
    const max = this.tankWater.userData.max as number;
    this.tankWater.scale.y = Math.max(0.001, this.tankNow * max);
    this.tankWater.position.y = 0.3 + (this.tankNow * max) / 2;
  }

  private station: THREE.Group;

  private h(x: number, z: number, S: number): number {
    const u = (x - X0) / (X1 - X0);
    const along = Math.min(70, 420 * S) * Math.pow(1 - u, 1.15);
    const across = 40 * Math.pow(Math.abs(z) / 110, 1.7) * (0.55 + 0.45 * (1 - u));
    const rough = noise2(x * 0.025, z * 0.025) * 6 + noise2(x * 0.08 + 3, z * 0.08) * 1.8;
    // cauces: el principal y tres afluentes
    let carve = 0;
    const dz = z - mainZ(x);
    carve = Math.max(carve, 3.6 * Math.exp(-(dz * dz) / 50));
    for (const tr of this.tribs) {
      let d = Infinity;
      for (let k = 1; k < tr.length; k++) d = Math.min(d, segDist(x, z, tr[k - 1], tr[k]));
      carve = Math.max(carve, 2.4 * Math.exp(-(d * d) / 30));
    }
    return Math.max(0, along + across + rough * (0.4 + 0.6 * (1 - u)) - carve + 2);
  }

  /** Afluentes: curvas suaves desde la divisoria hasta su unión con el principal (puntos en planta). */
  private tribs: THREE.Vector2[][] = [
    curve(new THREE.Vector2(-96, -102), new THREE.Vector2(-86, -46), new THREE.Vector2(-40, mainZ(-40))),
    curve(new THREE.Vector2(-26, 102), new THREE.Vector2(-6, 50), new THREE.Vector2(30, mainZ(30))),
    curve(new THREE.Vector2(52, -102), new THREE.Vector2(92, -60), new THREE.Vector2(100, mainZ(100))),
  ];

  private skirt: THREE.Mesh | null = null;

  /** Borde de maqueta: paredes de suelo desde el contorno del terreno hasta la base, para que no se vea el vacío. */
  private buildSkirt(S: number): void {
    const BASE = -8;
    const edge: [number, number][] = [];
    for (let i = 0; i <= NX; i++) edge.push([X0 + ((X1 - X0) * i) / NX, Z0]);
    for (let j = 1; j <= NZ; j++) edge.push([X1, Z0 + ((Z1 - Z0) * j) / NZ]);
    for (let i = NX - 1; i >= 0; i--) edge.push([X0 + ((X1 - X0) * i) / NX, Z1]);
    for (let j = NZ - 1; j >= 0; j--) edge.push([X0, Z0 + ((Z1 - Z0) * j) / NZ]);
    // paredes del corte con las capas del suelo; piso de estudio la primera vez
    const wall = strataWall(edge, (x, z) => this.h(x, z, S), BASE);
    if (this.skirt) {
      this.stage.scene.remove(this.skirt);
      this.skirt.geometry.dispose();
    } else {
      this.stage.scene.add(studioFloor((X0 + X1) / 2, (Z0 + Z1) / 2, Math.hypot(X1 - X0, Z1 - Z0) / 2, BASE));
    }
    this.skirt = wall;
    this.stage.scene.add(wall);
  }

  private buildTerrain(S: number): void {
    const pos = this.ground.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const y = this.h(pos.getX(k), pos.getZ(k), S);
      pos.setY(k, y);
      this.heights[k] = y;
    }
    pos.needsUpdate = true;
    this.ground.geometry.computeVertexNormals();
    // cauces: el principal desde la cabecera y los afluentes hasta su unión
    for (const m of this.streams) {
      this.stage.scene.remove(m);
      m.geometry.dispose();
    }
    this.streams = [];
    this.paths = [];
    const main: THREE.Vector3[] = [];
    for (let x = X0 + 6; x <= OUTLET.x; x += 3) main.push(new THREE.Vector3(x, this.h(x, mainZ(x), S) + 0.35, mainZ(x)));
    this.paths.push(main);
    for (const tr of this.tribs) {
      const p: THREE.Vector3[] = tr.map((q) => new THREE.Vector3(q.x, this.h(q.x, q.y, S) + 0.3, q.y));
      // sigue por el principal hasta la salida
      const end = tr[tr.length - 1];
      for (const q of main) if (q.x > end.x) p.push(q.clone());
      this.paths.push(p);
    }
    this.buildSkirt(S);
    this.tank.position.set(OUTLET.x - 16, this.h(OUTLET.x - 16, OUTLET.z - 24, S), OUTLET.z - 24);
    this.pathLen = this.paths.map((p) => p.reduce((a, q, k) => a + (k ? q.distanceTo(p[k - 1]) : 0), 0));
    this.paths.forEach((p, k) => {
      const w = k === 0 ? 2.4 : 1.4;
      const geo = ribbon(k === 0 ? p : p.slice(0, Math.max(2, p.findIndex((q, j) => j > 0 && q.x > this.tribs[k - 1][this.tribs[k - 1].length - 1].x) + 1)), w);
      const m = new THREE.Mesh(geo, this.streamMat);
      this.streams.push(m);
      this.stage.scene.add(m);
    });
    this.station.position.y = this.h(this.station.position.x, this.station.position.z, S);
  }

  private paint(mix: Record<Cover, number>, seed: number): void {
    const pos = this.ground.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.ground.geometry.attributes.color as THREE.BufferAttribute;
    // de abajo hacia arriba: vías y barrio cerca de la salida, luego cultivos, pasto y bosque arriba
    const idx = Array.from({ length: pos.count }, (_, k) => k).sort((a, b) => this.heights[a] - this.heights[b]);
    const cuts: number[] = [];
    let acc = 0;
    for (const c of ORDER) {
      acc += mix[c];
      cuts.push(acc * pos.count);
    }
    const cover = new Array<Cover>(pos.count);
    idx.forEach((k, rank) => {
      let j = cuts.findIndex((v) => rank < v);
      if (j < 0) j = ORDER.length - 1;
      cover[k] = ORDER[j];
    });
    const mixA = this.ground.geometry.attributes.aMix as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const z = pos.getZ(k), x = pos.getX(k);
      const inCh = Math.abs(z - mainZ(x)) < 3.2;
      const cv = cover[k];
      // pasto, cultivo, bosque, grava; barrio y pavimento quedan en concreto (lo que falta para 1)
      mixA.setXYZW(k, !inCh && cv === 'pasto' ? 1 : 0, !inCh && cv === 'cultivo' ? 1 : 0, !inCh && cv === 'bosque' ? 1 : 0, inCh ? 1 : 0);
      // el barrio, con algo de pasto en patios y antejardines
      if (!inCh && cv === 'barrio') mixA.setX(k, 0.3);
      // las vías y parqueaderos, en asfalto (más oscuro que los patios del barrio)
      const v = (0.94 + 0.08 * noise2(x * 0.2, z * 0.2)) * (!inCh && cv === 'pavimento' ? 0.62 : 1);
      col.setXYZ(k, v, v, v);
    }
    mixA.needsUpdate = true;
    col.needsUpdate = true;
    this.cover = cover;
    // los tiempos de viaje dependen de la cobertura (rugosidad de la ladera): se recalculan con ella
    this.computeTau();
    void COVER_COLOR;
    // árboles en el bosque, casas en el barrio
    this.veg.clear();
    const R = rng(seed);
    const ts: TreeSpot[] = [], hs: HouseSpot[] = [];
    for (let k = 0; k < pos.count; k += 1) {
      const x = pos.getX(k), z = pos.getZ(k), y = pos.getY(k);
      if (Math.abs(z - mainZ(x)) < 6) continue;
      if (cover[k] === 'bosque' && R() < 0.35 && ts.length < 900) ts.push({ x: x + (R() - 0.5) * 2, y, z: z + (R() - 0.5) * 2, r: 1.6 + R() * 1.4 });
      if (cover[k] === 'barrio' && R() < 0.8 && hs.length < 520) hs.push({ x: x + (R() - 0.5), y, z: z + (R() - 0.5), w: 1.8 + R() * 1.1, d: 1.9 + R() * 1.0, h: 0.66 + R() * 1.3, rot: Math.round(R() * 4) * (Math.PI / 2) + (R() - 0.5) * 0.3, wall: ['#e9d8b4', '#d98c5f', '#7fb3a6', '#e6b655', '#c96f6a', '#9ec1d9', '#f1efe8'][Math.floor(R() * 7)] });
    }
    if (ts.length) this.veg.add(trees(ts, 4));
    if (hs.length) this.veg.add(houses(hs, { sc: 1 / M_PER_U }));
  }

  set(r: BasinResult): void {
    this.r = r;
    const key = `${r.inp.S.toFixed(3)}`;
    if (key !== this.builtKey) {
      this.slope = r.inp.S;
      this.buildTerrain(this.slope);
      this.builtKey = key;
      this.paintKey = '';
    }
    const pk = ORDER.map((c) => r.inp.mix[c].toFixed(3)).join(',');
    if (pk !== this.paintKey) {
      this.paint(r.inp.mix, 5);
      this.paintKey = pk;
    }
    const total = r.hydro.length * r.dt;
    this.scale = total / 24;
    this.stage.setLabels(this.labels(null));
  }

  private paintKey = '';

  /** Empieza el aguacero (o lo detiene si ya corre). */
  play(on: boolean): void {
    this.playing = on;
    this.tAnim = 0;
    this.overU.uT.value = on ? 0 : -1;
    this.overlay.visible = this.layer === 'viaje' || on;
    this.pulseT.fill(-1);
    if (on && this.tankFill) this.setTankLevel(0);
    if (!on) {
      this.rain.intensity = 0;
      this.rain.update(0);
      this.stage.weather(0);
      this.onTime?.(null);
    }
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private labels(tMin: number | null): StageLabel[] {
    const r = this.r;
    if (!r) return [];
    const es = (x: number, d = 1) => x.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
    const k = tMin === null ? -1 : Math.floor(tMin / r.dt);
    const Q = k >= 0 && k < r.hydro.length ? r.hydro[k] : 0;
    const head = this.paths[0]?.[0];
    const out: StageLabel[] = [
      { id: 'salida', text: 'Salida de la cuenca', sub: tMin === null ? `pico calculado ${es(r.Qpeak, 2)} m³/s` : `${es(Q, 2)} m³/s ahora`, at: new THREE.Vector3(OUTLET.x - 6, (this.paths[0]?.[this.paths[0].length - 1]?.y ?? 0) + 9, 4), kind: 'sonda', prio: 6 },
    ];
    if (this.tankFill) out.push({ id: 'tanque', text: 'Tanque de retención', sub: `${es(this.tankNow * 100, 0)} % lleno`, at: new THREE.Vector3(this.tank.position.x, this.tank.position.y + 6, this.tank.position.z), kind: this.tankNow > 0.99 ? 'alerta' : 'dato', prio: 5 });
    if (head) out.push({ id: 'lejos', text: 'El punto más lejano', sub: `el agua tarda unos ${es(r.tc.used, 0)} min en salir`, at: head.clone().add(new THREE.Vector3(0, 10, 0)), kind: 'lugar', prio: 4 });
    if (tMin !== null) {
      const fa = this.areaWithin(Math.min(1, tMin / Math.max(1e-6, r.tc.used)));
      out.push({ id: 'aporta', text: fa >= 0.999 ? 'Ya llega agua de toda la cuenca' : 'Ya alcanza a llegar a la salida', sub: fa >= 0.999 ? `desde el minuto ${es(r.tc.used, 0)} (tc)` : `el agua caída en el ${es(fa * 100, 0)} % del área`, at: new THREE.Vector3(OUTLET.x - 40, 30, -50), kind: 'dato', prio: 5 });
      const kr = Math.floor(tMin / r.dt);
      const i = kr < r.rain.length ? (r.rain[kr] / r.dt) * 60 : 0;
      out.push({ id: 'lluvia', text: i > 0 ? 'Llueve' : 'Ya no llueve', sub: i > 0 ? `${es(i, 0)} mm/h` : `minuto ${es(tMin, 0)}`, at: new THREE.Vector3(-40, 95, 0), kind: i > 0 ? 'alerta' : 'dato', prio: 5 });
    }
    return out;
  }

  update(dt: number, _t: number): void {
    const r = this.r;
    if (!r) return;
    const h = Math.min(0.05, Math.max(0, dt));
    if (!this.playing) return;
    // el reloj del aguacero sigue el tiempo real aunque el equipo dibuje pocos cuadros (hasta 0,25 s por cuadro)
    this.tAnim += Math.min(0.25, Math.max(0, dt));
    const tMin = this.tAnim * this.scale;
    const total = r.hydro.length * r.dt;
    if (tMin >= total) {
      this.play(false);
      this.stage.setLabels(this.labels(null));
      return;
    }
    this.onTime?.(tMin);
    // área que ya aporta: los puntos cuya agua alcanzó a llegar a la salida desde que empezó a llover
    this.overU.uT.value = Math.min(1, tMin / Math.max(1e-6, r.tc.used));
    if (this.tankFill) {
      const kt = Math.min(this.tankFill.length - 1, Math.floor(tMin / r.dt));
      this.setTankLevel(this.tankFill[kt]);
    }
    const kr = Math.floor(tMin / r.dt);
    const iNow = kr < r.rain.length ? (r.rain[kr] / r.dt) * 60 : 0;
    const iMax = Math.max(...r.rain) / r.dt * 60;
    // lluvia: más gotas con más intensidad
    this.rain.intensity = iNow > 0 && !this.stage.reducedMotion ? Math.max(0.08, Math.min(1, iNow / Math.max(1, iMax))) : 0;
    this.rain.update(h);
    this.stage.weather(Math.min(0.75, this.rain.intensity * 0.9));
    // cauces: más brillo y algo más anchos con más caudal
    const k = Math.floor(tMin / r.dt);
    const Q = k < r.hydro.length ? r.hydro[k] : 0;
    const f = Math.min(1, Q / Math.max(1e-6, r.Qpeak));
    this.streamMat.emissiveIntensity = 0.15 + 0.85 * f;
    for (const m of this.streams) m.scale.set(1, 1, 1);
    // pulsos: salen de las cabeceras mientras llueve y viajan hasta la salida en el tiempo de concentración
    const travelAnim = r.tc.used / this.scale;
    if (iNow > 0 && Math.random() < h * 6) {
      const free = this.pulseT.findIndex((v) => v < 0);
      if (free >= 0) {
        this.pulseT[free] = 0;
        this.pulsePath[free] = Math.floor(Math.random() * this.paths.length);
      }
    }
    for (let j = 0; j < this.pulseT.length; j++) {
      if (this.pulseT[j] < 0) {
        this.pulses.setMatrixAt(j, this.m4.makeScale(0, 0, 0));
        continue;
      }
      this.pulseT[j] += h;
      const path = this.paths[this.pulsePath[j]];
      // el camino del principal mide lo más largo: llega en tc; los afluentes, en proporción a su largo
      const s = this.pulseT[j] / travelAnim;
      const L = this.pathLen[this.pulsePath[j]] / this.pathLen[0];
      if (s >= L) {
        this.pulseT[j] = -1;
        continue;
      }
      const p = pointAt(path, (s / L) * this.pathLen[this.pulsePath[j]]);
      this.pulses.setMatrixAt(j, this.m4.makeTranslation(p.x, p.y + 0.8, p.z));
    }
    this.pulses.instanceMatrix.needsUpdate = true;
    this.labelT += h;
    if (this.labelT > 0.25) {
      this.labelT = 0;
      this.stage.setLabels(this.labels(tMin));
    }
  }

  private pulsePath = new Int32Array(60);
}

/** Curva cuadrática de a a b con el punto de control c, en 16 tramos. */
function curve(a: THREE.Vector2, c: THREE.Vector2, b: THREE.Vector2): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, u = 1 - t;
    out.push(new THREE.Vector2(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y));
  }
  return out;
}

function pointAt(path: THREE.Vector3[], d: number): THREE.Vector3 {
  let acc = 0;
  for (let k = 1; k < path.length; k++) {
    const seg = path[k].distanceTo(path[k - 1]);
    if (acc + seg >= d) return path[k - 1].clone().lerp(path[k], (d - acc) / seg);
    acc += seg;
  }
  return path[path.length - 1].clone();
}

/** Cinta plana que sigue una línea (el cauce). */
function ribbon(pts: THREE.Vector3[], w: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;
    const ww = w * (0.6 + 0.4 * (k / Math.max(1, pts.length - 1)));
    pos.push(pts[k].x + nx * ww, pts[k].y, pts[k].z + nz * ww, pts[k].x - nx * ww, pts[k].y, pts[k].z - nz * ww);
    if (k < pts.length - 1) {
      const i = 2 * k;
      idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const BASIN_COVERS = COVERS;

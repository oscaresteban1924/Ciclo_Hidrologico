// Acabado de la maqueta del valle: el suelo con la textura de cada cobertura (pasto con manchas, cultivos en hileras
// por lotes con su orientación, rastrojo moteado, grava y arena en el cauce, patios, taludes de tierra), casas de
// barrio antioqueño (fachada pintada con zócalo, ventanas por piso con marco y reja, puerta hacia la calle, cornisa;
// techo de teja de dos aguas o plancha con tanque) y matorrales. Todo se dibuja con sombreadores y geometría por
// instancias, sin imágenes descargadas. Las alturas de las casas siguen la exageración del relieve, como el agua.

import * as THREE from 'three';
import { lookMaterial } from '../../three/look';
import { groundMaterial } from '../../three/ground';

export { groundMaterial };
import { facadeGroup, type HouseSpec } from '../../three/houses';

// ------------------------------------------------------------------ casas (src/three/houses.ts)

export type { HouseSpec };
/** Casas de la sala 2D: las de src/three/houses.ts, con el relieve exagerado en `vz`. */
export const valleyHouses = (list: HouseSpec[], sc: number, vz: number) => facadeGroup(list, sc, vz);

// ------------------------------------------------------------------ matorrales

export interface BushSpot {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** Matas bajas del rastrojo (por instancias), con el viento en las puntas. */
export function bushes(spots: BushSpot[], seed = 5): THREE.InstancedMesh | null {
  if (!spots.length) return null;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // forma irregular y base plana
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const w = 1 + 0.18 * Math.sin(x * 5.1 + z * 3.7) * Math.cos(y * 4.3);
    pos.setXYZ(k, x * w, Math.max(-0.2, y) * w, z * w);
  }
  geo.computeVertexNormals();
  const m = lookMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), { sway: 0.03, detail: 0.12 });
  const im = new THREE.InstancedMesh(geo, m, spots.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
  const greens = ['#4f7a35', '#5d8a3c', '#6b8f43', '#47703a', '#7a9447', '#6f7f3a'];
  let s = seed * 9301 + 49297;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  spots.forEach((b, i) => {
    Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
    im.setMatrixAt(i, M.compose(P.set(b.x, b.y + b.r * 0.15, b.z), Q, S.set(b.r * (0.9 + R() * 0.3), b.r * (0.55 + R() * 0.25), b.r * (0.9 + R() * 0.3))));
    im.setColorAt(i, C.set(greens[Math.floor(R() * greens.length)]).multiplyScalar(0.9 + R() * 0.2));
  });
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

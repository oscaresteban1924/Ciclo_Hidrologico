// Pruebas de las fichas de lectura de las escenas (npm run test:readings). Informe en docs/LECTURAS_PRUEBAS.md.

import { finish, record, rel } from '../harness';
import { fractionWithin, froude, hydraulicDepthTrap, lerpSeries, specificEnergy, tapPressure } from '../../src/three/readings';
import { NRCS_K, manningV, travelTimes } from '../../src/basins/travel';
import { geom } from '../../src/canals/hydraulics';

const f = (v: number, d = 4) => v.toFixed(d);

// L1 — Froude y energía específica con valores de libro (y = 1 m, V = 3,132 m/s → Fr = 1; E = 1,5 m)
{
  const V = Math.sqrt(9.81);
  const Fr = froude(V, 1), E = specificEnergy(1, V);
  record({ id: 'L1', name: 'Froude = 1 y energía específica = 1,5 y en flujo crítico de 1 m', tolerance: 'error relativo < 1e-9', measured: `Fr = ${f(Fr, 9)}, E = ${f(E, 9)} m`, pass: rel(Fr, 1) < 1e-9 && rel(E, 1.5) < 1e-9 });
}

// L2 — profundidad hidráulica trapecial frente a la geometría del motor de canales
{
  let worst = 0;
  for (const [b, z, y] of [[2, 1.5, 0.8], [1, 2, 1.3], [3, 0, 0.6], [0.5, 1, 2]]) {
    const g = geom({ shape: z > 0 ? 'trap' : 'rect', b, z, D: 0, H: 5 }, y);
    worst = Math.max(worst, rel(hydraulicDepthTrap(y, b, z), g.A / g.T));
  }
  record({ id: 'L2', name: 'Profundidad hidráulica A/T de la ficha igual a la del motor de canales (cuatro secciones)', tolerance: 'error relativo < 1e-9', measured: `peor ${worst.toExponential(1)}`, pass: worst < 1e-9 });
}

// L3 — en la trapecial, el Froude con A/T es mayor que con la profundidad (por qué la ficha usa A/T)
{
  const y = 1, V = 2, D = hydraulicDepthTrap(y, 2, 1.5);
  const a = froude(V, D), b = froude(V, y);
  record({ id: 'L3', name: 'En una trapecial (b = 2 m, z = 1,5) el Froude con A/T supera al de la profundidad', tolerance: 'Fr(A/T) > Fr(y) y D < y', measured: `D = ${f(D, 3)} m; Fr = ${f(a, 3)} frente a ${f(b, 3)}`, pass: D < y && a > b });
}

// L4 — interpolación de series: exacta en los nodos, lineal entre ellos, extremos fuera del rango
{
  const xs = [0, 10, 25, 40], ys = [5, 3, 9, -1];
  const ok = lerpSeries(xs, ys, 10) === 3 && Math.abs(lerpSeries(xs, ys, 17.5) - 6) < 1e-12 && lerpSeries(xs, ys, -3) === 5 && lerpSeries(xs, ys, 99) === -1;
  record({ id: 'L4', name: 'Interpolación de series: nodos exactos, punto medio lineal y extremos', tolerance: 'exacta (1e-12)', measured: `f(17,5) = ${lerpSeries(xs, ys, 17.5)}`, pass: ok });
}

// L5 — fracción del área que ya aporta: cuenta exacta en una lista ordenada
{
  // valores exactos en precisión simple (como los guarda la escena)
  const a = Float32Array.from([0, 0.125, 0.125, 0.25, 0.5, 0.875, 1]);
  const ok = fractionWithin(a, -1) === 0 && fractionWithin(a, 0.125) === 3 / 7 && fractionWithin(a, 0.95) === 6 / 7 && fractionWithin(a, 1) === 1;
  record({ id: 'L5', name: 'Fracción del área con tiempo de viaje menor o igual que t', tolerance: 'exacta', measured: `0,125 → ${f(fractionWithin(a, 0.125), 3)}; 0,95 → ${f(fractionWithin(a, 0.95), 3)}`, pass: ok });
}

// L6 — presión en la llave: balance de energía estático
{
  const p = tapPressure(30, 1504, 1500);
  record({ id: 'L6', name: 'Presión en la llave: 30 m en la esquina, casa 4 m más alta, llave a 1,2 m', tolerance: '24,8 m exactos', measured: `${f(p, 3)} m`, pass: Math.abs(p - 24.8) < 1e-12 });
}

// Grilla sintética para los tiempos de viaje
function plane(nx: number, nz: number, dx: number, slope: number, cover: keyof typeof NRCS_K) {
  // ladera que baja hacia x = 0, donde está el cauce (columna 0), que corre hacia z = 0 (la salida)
  const N = nx * nz, z = new Float64Array(N), k = new Float64Array(N), ch = new Float64Array(N).fill(-1);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      z[v] = i * dx * slope + j * dx * 0.01;
      k[v] = NRCS_K[cover];
      if (i === 0) ch[v] = j * dx;
    }
  return { nx, nz, dx, z, k, channel: ch };
}

// L7 — ladera plana uniforme: el tiempo es la distancia a la ladera entre k·√S más el tramo del cauce
{
  const g = plane(40, 5, 10, 0.1, 'pasto');
  const vch = 1.5;
  const t = travelTimes({ ...g, vch });
  // nodo (i = 30, j = 0): 30 tramos de 10 m con la pendiente de mayor descenso
  const i = 30, j = 0, v = j * g.nx + i;
  // la mayor pendiente es en diagonal o recta según la pendiente lateral; aquí, recta en x (0,1 frente a 0,01)
  const expect = (i * 10) / (NRCS_K.pasto * Math.sqrt(0.1));
  record({ id: 'L7', name: 'Ladera de pasto con 10 % de pendiente: 300 m hasta el cauce con V = k·√S', tolerance: 'error relativo < 2 % (la ruta puede tomar diagonales)', measured: `${f(t[v], 1)} s frente a ${f(expect, 1)} s`, pass: rel(t[v], expect) < 0.02 });
}

// L8 — el bosque es más lento que el pasto y el pasto más que el pavimento, en el mismo terreno
{
  const tb = travelTimes({ ...plane(30, 4, 10, 0.08, 'bosque'), vch: 1.5 });
  const tp = travelTimes({ ...plane(30, 4, 10, 0.08, 'pasto'), vch: 1.5 });
  const tv = travelTimes({ ...plane(30, 4, 10, 0.08, 'pavimento'), vch: 1.5 });
  const v = 2 * 30 + 25;
  // el tramo por el cauce es igual en los tres: la proporción de los k se ve en el tramo por la ladera
  const tch = (2 * 10) / 1.5;
  const ratio = (tb[v] - tch) / (tv[v] - tch);
  record({ id: 'L8', name: 'Tiempos de viaje: bosque > pasto > pavimento; en la ladera, en la proporción de los coeficientes k', tolerance: 'orden estricto; (bosque − cauce)/(pavimento − cauce) = 6,19/0,76 ± 2 %', measured: `${f(tb[v], 0)} > ${f(tp[v], 0)} > ${f(tv[v], 0)} s; razón en la ladera ${f(ratio, 2)}`, pass: tb[v] > tp[v] && tp[v] > tv[v] && rel(ratio, 6.19 / 0.76) < 0.02 });
}

// L9 — un hoyo en la ladera no deja nodos sin tiempo ni tiempos negativos o infinitos
{
  const g = plane(20, 20, 10, 0.05, 'pasto');
  // hoyo de 3 m en el medio
  for (let j = 8; j <= 11; j++) for (let i = 8; i <= 11; i++) (g.z as Float64Array)[j * g.nx + i] -= 3;
  const t = travelTimes({ ...g, vch: 1.5 });
  const bad = Array.from(t).filter((x) => !Number.isFinite(x) || x < 0).length;
  const inPit = t[10 * g.nx + 10];
  record({ id: 'L9', name: 'Ladera con un hoyo: todos los nodos con tiempo finito y positivo; el agua del hoyo sigue al cauce', tolerance: '0 nodos malos; tiempo del hoyo mayor que el de su vecino río abajo', measured: `${bad} malos; hoyo ${f(inPit, 0)} s, vecino ${f(t[10 * g.nx + 7], 0)} s`, pass: bad === 0 && inPit > t[10 * g.nx + 7] });
}

// L10 — Manning: un cauce de n = 0,045, R = 0,4 m y S = 2 % lleva unos 1,7 m/s
{
  const V = manningV(0.045, 0.4, 0.02);
  const expect = (Math.pow(0.4, 2 / 3) * Math.sqrt(0.02)) / 0.045;
  record({ id: 'L10', name: 'Velocidad de Manning en el cauce (n = 0,045; R = 0,4 m; S = 2 %)', tolerance: 'error relativo < 1e-12', measured: `${f(V, 3)} m/s`, pass: rel(V, expect) < 1e-12 });
}

// L11 — los nodos del cauce tardan su distancia por el cauce entre la velocidad del cauce
{
  const g = plane(10, 30, 10, 0.1, 'pasto');
  const t = travelTimes({ ...g, vch: 2 });
  const v = 20 * g.nx;
  record({ id: 'L11', name: 'Nodo del cauce a 200 m de la salida con 2 m/s', tolerance: '100 s exactos', measured: `${f(t[v], 3)} s`, pass: Math.abs(t[v] - 100) < 1e-9 });
}

finish('docs/LECTURAS_PRUEBAS.md', 'Pruebas de las fichas de lectura', 'npm run test:readings');

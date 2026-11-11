// Pruebas del módulo «Hidráulica de canales» (se ejecutan con: npm run test:canals). Cada prueba declara su
// tolerancia antes de ejecutarse; el informe se escribe en docs/canales/PRUEBAS_CANALES.md.

import { writeFileSync, mkdirSync } from 'node:fs';
import {
  CHUTE,
  CREEK,
  DEBRIS,
  FLUME,
  G,
  MATERIALS,
  SHAPES,
  alternateDepths,
  belanger,
  bridgeModel,
  circMaxDepth,
  conjugateDepth,
  criticalDepth,
  directStep,
  froude,
  gaugeModel,
  geom,
  jumpModel,
  manningQ,
  momentum,
  normalDepth,
  powerFit,
  rectWeirQ,
  specificEnergy,
  triWeirQ,
  uniformModel,
  frictionSlope,
  type Debris,
  type Device,
  type Material,
  type Section,
  type Shape,
} from '../../src/canals/hydraulics';
import { calcAforo, calcAlcantarilla, calcCanal, calcPuente, calcResalto, calcSedimento, preAforador, preAlcantarilla, preCanal, preEnrocado, prePozo, prePuente } from '../../src/canals/designCalc';
import { CR_ROAD, INLETS, ROAD_LEN, culvertModel, inletHW, outletHW, type Inlet } from '../../src/canals/culvert';
import { BEDFORM_NAME, contractionScour, hortonN, laneK, midSection, parshallH, parshallQ, pierScour, transport, usbrBasin, yarnell, type Bedform } from '../../src/canals/advanced';
import { GRAINS, RIPRAP, RHO, RHO_S, bedloadStar, dStar, fallVelocity, sedimentModel, shieldsCrit, rouseProfile, type Mode } from '../../src/canals/sediment';

interface Result {
  id: string;
  name: string;
  tolerance: string;
  measured: string;
  pass: boolean;
}
const results: Result[] = [];
const record = (r: Result) => results.push(r);
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1e-12, Math.abs(b));
const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

const RECT: Section = { shape: 'rect', b: 3, z: 0, D: 0, H: 99 };
const TRAP: Section = { shape: 'trap', b: 2, z: 1.5, D: 0, H: 99 };
const CIRC: Section = { shape: 'circ', b: 0, z: 0, D: 1.2, H: 1.2 };

// H1) Geometría de las secciones
{
  const r = geom(RECT, 1.2), t = geom(TRAP, 1), c = geom(CIRC, 0.6);
  const errs = [
    rel(r.A, 3.6), rel(r.P, 5.4), rel(r.T, 3), rel(r.Ay, 3 * 1.2 * 0.6),
    rel(t.A, 3.5), rel(t.P, 2 + 2 * Math.sqrt(3.25)), rel(t.T, 5), rel(t.Ay, 2 * 0.5 + 1.5 / 3),
    rel(c.A, (Math.PI * 1.44) / 8), rel(c.P, (Math.PI * 1.2) / 2), rel(c.T, 1.2), rel(c.Ay, ((Math.PI * 1.44) / 8) * ((4 * 0.6) / (3 * Math.PI))),
  ];
  const worst = Math.max(...errs);
  record({
    id: 'H1',
    name: 'Geometría: área, perímetro, ancho de superficie y momento estático de las tres secciones',
    tolerance: 'error relativo menor que 1 × 10⁻⁹ frente a las fórmulas cerradas (rectangular, trapecial con talud 1,5 y tubo medio lleno, con el centroide del semicírculo a 4r/3π)',
    measured: `error máximo ${worst.toExponential(1)}`,
    pass: worst < 1e-9,
  });
}

// H2) Profundidad normal: Manning devuelve el caudal pedido
{
  let worst = 0, n = 0;
  for (const s of [RECT, TRAP, CIRC])
    for (const nm of [0.012, 0.025, 0.04])
      for (const S of [0.0005, 0.005, 0.05])
        for (const y of [0.1, 0.4, 0.9]) {
          const Q = manningQ(s, nm, S, y);
          const yn = normalDepth(s, nm, S, Q);
          worst = Math.max(worst, rel(yn, y));
          n++;
        }
  record({
    id: 'H2',
    name: 'Profundidad normal: con el caudal de Manning a una profundidad conocida, el cálculo recupera esa profundidad',
    tolerance: '81 casos (tres secciones, n de 0,012 a 0,04, pendiente de 0,05 % a 5 %, profundidad de 0,1 a 0,9 m); error relativo menor que 1 × 10⁻⁷',
    measured: `${n} casos; error máximo ${worst.toExponential(1)}`,
    pass: worst < 1e-7,
  });
}

// H3) Profundidad crítica: Froude 1 y energía mínima
{
  let worst = 0, eBad = 0, n = 0;
  for (const s of [RECT, TRAP, CIRC])
    for (const Q of [0.2, 1, 3]) {
      const yc = criticalDepth(s, Q);
      worst = Math.max(worst, Math.abs(froude(s, Q, yc) - 1));
      const E = specificEnergy(s, Q, yc);
      if (!(specificEnergy(s, Q, yc * 0.97) > E && specificEnergy(s, Q, yc * 1.03) > E)) eBad++;
      n++;
    }
  const q = 2 / 3;
  const ycR = criticalDepth(RECT, 2);
  const closed = rel(ycR, Math.cbrt((q * q) / G));
  record({
    id: 'H3',
    name: 'Profundidad crítica: Froude igual a 1, energía específica mínima y fórmula cerrada en el canal rectangular',
    tolerance: '|F − 1| menor que 1 × 10⁻⁶ en nueve casos; energía mayor 3 % por encima y por debajo; en el rectangular, error menor que 1 × 10⁻⁸ frente a yc = (q²/g)^(1/3)',
    measured: `|F − 1| máximo ${worst.toExponential(1)}; casos sin mínimo ${eBad}; rectangular ${closed.toExponential(1)}`,
    pass: worst < 1e-6 && eBad === 0 && closed < 1e-8,
  });
}

// H4) Tubo circular: el máximo de caudal no es con el tubo lleno
{
  const D = 1.5, ym = circMaxDepth(D);
  const s: Section = { shape: 'circ', b: 0, z: 0, D, H: D };
  const Qmax = manningQ(s, 0.013, 0.002, ym);
  const Qfull = ((Math.PI * D * D) / 4) * Math.pow(D / 4, 2 / 3) * Math.sqrt(0.002) / 0.013;
  const ratio = Qmax / Qfull;
  record({
    id: 'H4',
    name: 'Tubo circular: el caudal máximo con superficie libre es con el agua cerca de 0,94 D y supera al del tubo lleno',
    tolerance: 'y/D entre 0,936 y 0,940 y Qmáx/Qlleno entre 1,07 y 1,08 (valores de Chow 1959)',
    measured: `y/D = ${(ym / D).toFixed(4)}; Qmáx/Qlleno = ${ratio.toFixed(4)}`,
    pass: ym / D > 0.936 && ym / D < 0.94 && ratio > 1.07 && ratio < 1.08,
  });
}

// H5) Resalto: conservación de la fuerza específica y fórmula de Bélanger
{
  let worstB = 0, worstM = 0, worstL = 0, worstI = 0;
  for (const Q of [1, 5, 15])
    for (const y1 of [0.08, 0.2, 0.4]) {
      const s = RECT;
      if (y1 >= criticalDepth(s, Q)) continue;
      const F1 = froude(s, Q, y1);
      const y2 = conjugateDepth(s, Q, y1);
      worstB = Math.max(worstB, rel(y2, belanger(y1, F1)));
      worstM = Math.max(worstM, rel(momentum(s, Q, y2), momentum(s, Q, y1)));
      const dE = specificEnergy(s, Q, y1) - specificEnergy(s, Q, y2);
      worstL = Math.max(worstL, rel(dE, (y2 - y1) ** 3 / (4 * y1 * y2)));
      worstI = Math.max(worstI, rel(conjugateDepth(s, Q, y2), y1));
    }
  // también en el trapecial: la fuerza específica se conserva
  const yT = 0.15, QT = 6, y2T = conjugateDepth(TRAP, QT, yT);
  const mT = rel(momentum(TRAP, QT, y2T), momentum(TRAP, QT, yT));
  record({
    id: 'H5',
    name: 'Resalto: la fuerza específica se conserva, coincide con Bélanger y la pérdida es (y2 − y1)³ / (4 y1 y2)',
    tolerance: 'errores relativos menores que 1 × 10⁻⁶ (Bélanger, fuerza específica, pérdida y que la conjugada de la conjugada sea la profundidad de partida); en el trapecial, fuerza específica con error menor que 1 × 10⁻⁶',
    measured: `Bélanger ${worstB.toExponential(1)}; fuerza ${worstM.toExponential(1)}; pérdida ${worstL.toExponential(1)}; ida y vuelta ${worstI.toExponential(1)}; trapecial ${mT.toExponential(1)}`,
    pass: Math.max(worstB, worstM, worstL, worstI, mT) < 1e-6,
  });
}

// H6) Profundidades alternas
{
  let worst = 0, order = 0, n = 0;
  for (const s of [RECT, TRAP, CIRC])
    for (const Q of [0.3, 1.5]) {
      const yc = criticalDepth(s, Q);
      const E = specificEnergy(s, Q, yc) * 1.3;
      const a = alternateDepths(s, Q, E);
      if (!a) {
        order++;
        continue;
      }
      worst = Math.max(worst, rel(specificEnergy(s, Q, a.sub), E), rel(specificEnergy(s, Q, a.sup), E));
      if (!(a.sub > yc && a.sup < yc)) order++;
      n++;
    }
  const none = alternateDepths(RECT, 1, specificEnergy(RECT, 1, criticalDepth(RECT, 1)) * 0.9) === null;
  record({
    id: 'H6',
    name: 'Profundidades alternas: misma energía, una a cada lado de la crítica; por debajo de la energía crítica no hay ninguna',
    tolerance: 'energía con error relativo menor que 1 × 10⁻⁸; la lenta mayor y la rápida menor que la crítica; con 90 % de la energía crítica, ninguna',
    measured: `${n} casos; error máximo ${worst.toExponential(1)}; fuera de orden ${order}; sin solución bajo la crítica: ${none ? 'sí' : 'no'}`,
    pass: worst < 1e-8 && order === 0 && none,
  });
}

// H7) Paso directo frente a una integración fina de la ecuación del flujo gradualmente variado
{
  const s = TRAP, n = 0.025, S0 = 0.001, Q = 8;
  const yn = normalDepth(s, n, S0, Q);
  const yStart = yn + 1.2;
  const p = directStep(s, n, S0, Q, yStart, yn * 1.01, 200);
  const Ldirect = -p[p.length - 1].x;
  // integración de dy/dx = (S0 − Sf) / (1 − F²) con Runge-Kutta y paso pequeño, hacia aguas arriba
  const dydx = (y: number) => (S0 - frictionSlope(s, n, Q, y)) / (1 - froude(s, Q, y) ** 2);
  let y = yStart, x = 0;
  const h = -0.5;
  while (y > yn * 1.01) {
    const k1 = dydx(y), k2 = dydx(y + (h * k1) / 2), k3 = dydx(y + (h * k2) / 2), k4 = dydx(y + h * k3);
    const yNew = y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    if (yNew <= yn * 1.01) {
      x += (h * (y - yn * 1.01)) / (y - yNew);
      y = yn * 1.01;
      break;
    }
    y = yNew;
    x += h;
  }
  const Lrk = -x;
  const mono = p.every((pt, k) => k === 0 || (pt.x < p[k - 1].x && pt.y < p[k - 1].y));
  record({
    id: 'H7',
    name: 'Flujo gradualmente variado: el paso directo coincide con una integración fina (Runge-Kutta) del perfil M1',
    tolerance: 'canal trapecial, Q = 8 m³/s, n = 0,025, S0 = 0,1 %, desde 1,2 m sobre la normal hasta 1 % sobre ella; largos con diferencia menor que 1 %; el perfil baja de forma continua hacia aguas arriba',
    measured: `paso directo ${Ldirect.toFixed(0)} m; Runge-Kutta ${Lrk.toFixed(0)} m; diferencia ${(rel(Ldirect, Lrk) * 100).toFixed(2)} %; monótono: ${mono ? 'sí' : 'no'}`,
    pass: rel(Ldirect, Lrk) < 0.01 && mono,
  });
}

// H8) Parte 1: el canal y su caudal, en toda la malla
{
  let bad = 0, n = 0, okCase = false, erosion = false, overPipe = false, supercrit = false, sediment = false, unstable = false;
  for (const shape of Object.keys(SHAPES) as Shape[])
    for (const material of Object.keys(MATERIALS) as Material[])
      for (const S of [0.0005, 0.002, 0.01, 0.04])
        for (const Q of [0.2, 1, 3, 3.3, 6, 12]) {
          const r = uniformModel({ shape, material, S, Q });
          n++;
          if (!finite(r.yc, r.A, r.V, r.F, r.tau, r.Qcap, r.Qbrim, r.fill)) bad++;
          if (!Number.isNaN(r.yn) && rel(manningQ(r.sec, r.n, S, r.yn), Q) > 1e-6) bad++;
          if (r.overflow !== (Number.isNaN(r.yn) || (shape !== 'circ' && r.yn > r.sec.H))) bad++;
          if (r.ok && (r.overflow || r.erosion || r.sediment || r.unstable)) bad++;
          if (r.Qcap > r.Qbrim + 1e-9) bad++;
          if (r.ok && Q >= 4) okCase = true;
          if (material === 'tierra' && r.erosion) erosion = true;
          if (shape === 'circ' && !Number.isNaN(r.yn) && Q > r.Qfull && Q <= r.Qbrim) overPipe = true;
          if (r.F > 1.2 && !r.overflow) supercrit = true;
          if (r.sediment) sediment = true;
          if (r.unstable) unstable = true;
        }
  const reach = okCase && erosion && overPipe && supercrit && sediment && unstable;
  record({
    id: 'H8',
    name: 'El canal y su caudal: malla completa sin valores inválidos, banderas coherentes y retos alcanzables',
    tolerance: 'tres formas × cinco materiales × cuatro pendientes × seis caudales; ningún valor NaN o infinito (salvo la profundidad normal cuando el tubo trabajaría a presión); Manning devuelve el caudal; «desborda» si y solo si la normal supera la pared o el tubo no alcanza; «bien» nunca con desborde, erosión, sedimentación o flujo inestable; la capacidad con borde libre no supera la del borde; existen casos para cada reto',
    measured: `${n} casos; fallas ${bad}; retos alcanzables: ${reach ? 'sí' : 'no'}`,
    pass: bad === 0 && reach,
  });
}

// H9) Parte 2: la caída y el resalto
{
  let bad = 0, n = 0;
  const seen = new Set<string>();
  let goodStable = false, dissip60 = false;
  for (const Q of [3, 8, 15, 25])
    for (const drop of [2, 5, 9, 12])
      for (const weir of [0, 0.8, 1.6, 2.6, 4])
        for (const basin of [8, 16, 30]) {
          const r = jumpModel({ Q, drop, weir, basin });
          n++;
          if (!finite(r.yc, r.E0, r.y1, r.V1, r.F1, r.y2, r.ytw, r.xJump, r.Lj, r.dEjump, r.dissipated)) bad++;
          if (!(r.y1 < r.yc && r.yc < r.y2 && r.F1 > 1)) bad++;
          const E1 = r.y1 + (r.q * r.q) / (2 * G * r.y1 * r.y1);
          if (E1 > r.E0 + 1e-9) bad++;
          if (r.place === 'pie' || r.place === 'ahogado') {
            if (r.ytw < r.y2 - 1e-9 || r.xJump !== 0) bad++;
          } else if (Math.abs(belanger(r.yA, r.FA) - r.ytw) > 1e-6) bad++;
          if (r.contained && r.xJump + r.Lj > basin + 1e-9) bad++;
          if (r.place === 'barrido' && r.contained) bad++;
          seen.add(r.place);
          if (r.contained && r.kind === 'estable') goodStable = true;
          if (r.contained && r.dissipated >= 0.6) dissip60 = true;
        }
  const reach = seen.has('barrido') && seen.has('ahogado') && (seen.has('pie') || seen.has('pozo')) && goodStable && dissip60;
  record({
    id: 'H9',
    name: 'La caída y el resalto: malla completa, energía que no aumenta, resalto donde la conjugada iguala al pozo y retos alcanzables',
    tolerance: 'cuatro caudales × cuatro caídas × cinco vertederos × tres largos de pozo; sin valores inválidos; y1 < yc < y2 y F1 > 1; la energía al pie no supera la de la cresta; si el pozo alcanza la conjugada, el resalto está al pie; si no, su conjugada iguala la profundidad del pozo (error menor que 1 mm); «contenido» solo si cabe en el pozo; aparecen resalto barrido, ahogado y contenido estable, y alguno disipa 60 % o más',
    measured: `${n} casos; fallas ${bad}; lugares vistos: ${[...seen].join(', ')}; retos alcanzables: ${reach ? 'sí' : 'no'}`,
    pass: bad === 0 && reach,
  });
}

// H10) Parte 3: el puente y el remanso
{
  let bad = 0, n = 0, mono = 0;
  const flows = new Set<string>();
  let spillDebris = false, cleanNoSpill = false, fixable = false;
  for (const Q of [10, 25, 40, 60, 90])
    for (const S of [0.001, 0.003, 0.008, 0.02])
      for (const span of [4, 6, 8])
        for (const soffit of [1.6, 2.6, 3.6]) {
          let prev = -Infinity;
          for (const debris of Object.keys(DEBRIS) as Debris[]) {
            const r = bridgeModel({ Q, S, span, soffit, debris });
            n++;
            if (!finite(r.yn, r.yc, r.yU, r.Ecp, r.backwater, r.Qover)) bad++;
            if (!r.steep && r.yU < r.yn * (1 - 1e-9)) bad++;
            if (r.flow === 'estrangulado' && rel(specificEnergy(r.sec, Q, r.yU), r.Ecp) > 1e-6) bad++;
            if (r.yU < prev - 1e-6) mono++;
            prev = r.yU;
            flows.add(r.flow);
            if (!r.steep && r.profile.length > 2 && !r.profile.every((p, k) => k === 0 || (p.x < r.profile[k - 1].x && p.y <= r.profile[k - 1].y + 1e-9))) bad++;
            if (debris === 'tapado' && r.spill) spillDebris = true;
            if (debris === 'limpio' && !r.spill && Q >= 40) cleanNoSpill = true;
            if (debris === 'palos' && Q >= 40 && !r.spill) fixable = true;
          }
        }
  const reach = spillDebris && cleanNoSpill && fixable && flows.has('presion') && flows.has('estrangulado') && flows.has('libre') && flows.has('encima');
  record({
    id: 'H10',
    name: 'El puente y el remanso: malla completa, energía crítica en la abertura, remanso que crece con lo tapado y retos alcanzables',
    tolerance: 'cinco caudales × cuatro pendientes × tres luces × tres alturas × tres grados de obstrucción; sin valores inválidos; en canal suave el agua en el puente no baja de la normal; si el puente estrangula, la energía aguas arriba es la crítica de la abertura (error menor que 1 × 10⁻⁶); a más obstrucción, el agua nunca baja; el perfil de remanso baja de forma continua hacia aguas arriba; aparecen los cuatro tipos de paso y existen casos para cada reto',
    measured: `${n} casos; fallas ${bad}; casos donde tapar bajó el agua ${mono}; tipos vistos: ${[...flows].join(', ')}; retos alcanzables: ${reach ? 'sí' : 'no'}`,
    pass: bad === 0 && mono === 0 && reach,
  });
}

// H11) Parte 4: vertederos, compuerta y ajuste de la curva
{
  // vertedero triangular de 90°: con Cd = 0,58, Q = 1,370 H^2,5 (la fórmula USBR da 1,38 H^2,48 en SI)
  const tri = triWeirQ(0.1);
  const triRef = 1.37 * Math.pow(0.1, 2.5);
  // rectangular: Rehbock a mano para H = 0,1 m y P = 0,15 m
  const rect = rectWeirQ(0.1);
  const rectRef = (2 / 3) * (0.611 + (0.08 * 0.1) / 0.15) * 0.3 * Math.sqrt(2 * G) * Math.pow(0.1, 1.5);
  let worstInv = 0, cdBad = 0, eBad = 0, n = 0, bad = 0;
  for (const device of ['rect', 'tri', 'gate'] as Device[])
    for (const Qls of [1, 4, 10, 18, 25])
      for (const gate of [0.03, 0.06, 0.1]) {
        const r = gaugeModel({ device, Qls, gate });
        n++;
        if (!finite(r.Q, r.H, r.yUp, r.Vup)) bad++;
        if (device === 'rect') worstInv = Math.max(worstInv, rel(rectWeirQ(r.H), r.Q));
        if (device === 'tri') worstInv = Math.max(worstInv, rel(triWeirQ(r.H), r.Q));
        if (device === 'gate' && !r.gateFree) {
          const q = r.Q / FLUME.b;
          const Eu = r.yUp + (q * q) / (2 * G * r.yUp * r.yUp);
          const Ev = r.yVena! + (q * q) / (2 * G * r.yVena! * r.yVena!);
          if (rel(Eu, Ev) > 1e-6) eBad++;
          if (!(r.Cd! > 0.45 && r.Cd! < 0.61)) cdBad++;
        }
      }
  const pts = [0.05, 0.08, 0.12, 0.16].map((H) => ({ H, Q: triWeirQ(H) }));
  const fit = powerFit(pts);
  record({
    id: 'H11',
    name: 'Medir el caudal: vertederos y compuerta coherentes, y el ajuste de la curva recupera el exponente',
    tolerance: 'triangular de 90° a 1 % de 1,37 H^2,5; rectangular igual a Rehbock calculado a mano (error menor que 1 × 10⁻¹²); la carga calculada devuelve el caudal (error menor que 1 × 10⁻⁷); en la compuerta, misma energía antes y en la vena contraída y coeficiente de descarga entre 0,45 y 0,61 (diagrama de Henry); con datos exactos del triangular, el ajuste da 2,5 ± 0,001',
    measured: `triangular ${(rel(tri, triRef) * 100).toFixed(2)} %; rectangular ${rel(rect, rectRef).toExponential(1)}; inversión ${worstInv.toExponential(1)}; compuerta: energía ${eBad} fallas, Cd fuera de rango ${cdBad}; exponente ajustado ${fit ? fit.m.toFixed(4) : '—'}; ${n} casos, inválidos ${bad}`,
    pass: rel(tri, triRef) < 0.01 && rel(rect, rectRef) < 1e-12 && worstInv < 1e-7 && eBad === 0 && cdBad === 0 && !!fit && Math.abs(fit.m - 2.5) < 0.001 && bad === 0,
  });
}

// H12) Unidades y escalas de la escena: valores que se muestran en los rangos de los controles
{
  let bad = 0, n = 0;
  for (const Q of [2, 30]) {
    const r = jumpModel({ Q, drop: 12, weir: 4, basin: 40 });
    n++;
    if (r.ytw > 12) bad++;
  }
  const b = bridgeModel({ Q: 90, S: 0.001, span: 3, soffit: 1.2, debris: 'tapado' });
  n++;
  if (!(b.yU < 20 && b.backwater < 20000)) bad++;
  record({
    id: 'H12',
    name: 'Escalas: en los extremos de los controles, las profundidades y largos caben en las escenas',
    tolerance: `profundidad del pozo menor que 12 m con los controles al máximo; con la creciente mayor (90 m³/s), puente de 3 m de luz y 1,2 m de alto, muy tapado: agua menor que 20 m y remanso menor que 20 km (canal de ${CREEK.b} m, rápida de ${CHUTE.b} m)`,
    measured: `${n} casos; fallas ${bad}; puente extremo: ${b.yU.toFixed(1)} m de agua, remanso ${Math.round(b.backwater)} m`,
    pass: bad === 0,
  });
}


// H13) Alcantarillas (HDS-5): continuidad, energía, reparto con la vía y retos alcanzables
{
  let bad = 0, n = 0, jumpBad = 0, monoBad = 0;
  const seen = new Set<string>();
  let okCase = false, overCase = false;
  for (const inlet of Object.keys(INLETS) as Inlet[])
    for (const D of [0.6, 1.2, 2.4])
      for (const S of [0, 0.01, 0.04])
        for (const tw of [0, 1, 3]) {
          // continuidad en la transición (X = 3,5 a 4,0) y nivel que sube con el caudal
          const A = (Math.PI * D * D) / 4;
          let prev = 0;
          for (let k = 1; k <= 60; k++) {
            const q = ((k / 60) * 6 * A * Math.sqrt(D)) / 1.811;
            const hw = inletHW(q, D, S, inlet).hw;
            if (hw < prev - 1e-9) monoBad++;
            if (k > 1 && hw - prev > 0.25 * D) jumpBad++;
            prev = hw;
          }
          for (const Q of [1, 5, 15, 40]) {
            const r = culvertModel({ Q, D, S, tw, inlet, barrels: 1, L: 30, road: 4 });
            n++;
            if (![r.hw, r.q, r.Vout, r.yOut, r.yc].every(Number.isFinite)) bad++;
            if (Math.abs(r.q * r.inp.barrels + r.Qover - Q) > 1e-6) bad++;
            if (r.overtop) {
              const roadQ = CR_ROAD * ROAD_LEN * Math.pow(r.hw - r.inp.road, 1.5);
              if (Math.abs(roadQ - r.Qover) > 1e-3 * Q) bad++;
            }
            if (Math.abs(r.hw - Math.max(r.hwInlet, r.hwOutlet)) > 1e-9) bad++;
            seen.add(r.control);
            if (r.ok && Q >= 5) okCase = true;
            if (r.overtop) overCase = true;
          }
        }
  // energía a la salida a mano: D = 1,2 m, L = 30 m, q = 3 m³/s, borde recto, sin pendiente, nivel de abajo 1,5 m
  const o = outletHW(3, 1.2, 30, 0, 1.5, 'muro');
  const V = 3 / ((Math.PI * 1.44) / 4);
  const Hhand = (1 + 0.5 + (2 * G * 0.012 * 0.012 * 30) / Math.pow(0.3, 4 / 3)) * (V * V) / (2 * G);
  const reach = okCase && overCase && seen.has('entrada') && seen.has('salida');
  record({
    id: 'H13',
    name: 'Alcantarillas: control a la entrada continuo y creciente, energía a la salida, reparto con la vía y retos alcanzables',
    tolerance: 'tres entradas × tres diámetros × tres pendientes × tres niveles aguas abajo; el nivel a la entrada nunca baja al subir el caudal y no salta más de 0,25 D entre pasos (transición de HDS-5); sin valores inválidos; caudal por los tubos más el de encima de la vía igual al total (1 × 10⁻⁶) y el de la vía igual al vertedero (0,1 %); nivel = el mayor de los dos controles; pérdida a la salida igual al cálculo a mano (1 × 10⁻⁹); aparecen control a la entrada y a la salida, paso por encima de la vía y un caso que cumple con 5 m³/s o más',
    measured: `${n} casos; inválidos o desbalance ${bad}; bajadas ${monoBad}; saltos ${jumpBad}; salida a mano ${rel(o.H, Hhand).toExponential(1)}; controles vistos: ${[...seen].join(', ')}; retos alcanzables: ${reach ? 'sí' : 'no'}`,
    pass: bad === 0 && monoBad === 0 && jumpBad === 0 && rel(o.H, Hhand) < 1e-9 && reach,
  });
}

// H14) Sedimentos: Shields, velocidad de caída, arrastre y modos alcanzables
{
  const thMin = Math.min(...[...Array(200)].map((_, k) => shieldsCrit(0.00005 * Math.pow(1.05, k))));
  const thGravel = shieldsCrit(0.03);
  const wSand = fallVelocity(0.0002);
  const dSilt = 0.00002;
  const stokes = ((RHO_S / RHO - 1) * G * dSilt * dSilt) / (18 * 1e-6);
  const mpm = bedloadStar(0.1, 0.0495);
  let bad = 0, n = 0;
  const modes = new Set<Mode>();
  for (const g of GRAINS)
    for (const Q of [2, 20, 120])
      for (const S of [0.0005, 0.004, 0.03]) {
        const r = sedimentModel({ Q, S, d: g.d });
        n++;
        if (![r.h, r.V, r.tau, r.theta, r.thetaCr, r.w, r.rouse, r.qb, r.dRiprap].every(Number.isFinite)) bad++;
        if (r.theta <= r.thetaCr && r.qb > 0) bad++;
        const thetaR = r.tau / ((RHO_S - RHO) * G * r.dRiprap);
        if (Math.abs(thetaR - RIPRAP.theta / RIPRAP.fs) > 1e-9) bad++;
        modes.add(r.mode);
      }
  const prof = rouseProfile(1.5, 2, 1) < rouseProfile(1.5, 2, 0.3) && rouseProfile(0.5, 2, 1) > rouseProfile(2.5, 2, 1);
  const reach = ['quieto', 'fondo', 'mixto', 'suspension', 'lavado'].every((m) => modes.has(m as Mode));
  record({
    id: 'H14',
    name: 'Sedimentos: curva de Shields, velocidad de caída, arrastre de fondo, perfil de Rouse y los cinco modos de transporte',
    tolerance: `θcr mínimo de la curva entre 0,028 y 0,035 y de grava (3 cm) entre 0,05 y 0,06; caída de arena de 0,2 mm entre 0,02 y 0,03 m/s y de limo fino igual a Stokes (5 %); q* = 3,97·(0,1 − 0,0495)^1,5 = 0,0451 (0,5 %); en la malla (siete granos × tres caudales × tres pendientes) sin valores inválidos, sin arrastre bajo el umbral y con el enrocado en θ = 0,047/1,5; la concentración baja con la altura y sube cuanto menor el número de Rouse; aparecen los cinco modos`,
    measured: `θcr mínimo ${thMin.toFixed(4)}; grava ${thGravel.toFixed(4)}; D* de la grava ${dStar(0.03).toFixed(0)}; caída arena ${wSand.toFixed(4)} m/s; limo ${(rel(fallVelocity(dSilt), stokes) * 100).toFixed(1)} % de Stokes; q* ${mpm.toFixed(4)}; ${n} casos, fallas ${bad}; perfil ${prof ? 'bien' : 'mal'}; modos vistos: ${[...modes].join(', ')}`,
    pass: thMin > 0.028 && thMin < 0.035 && thGravel > 0.05 && thGravel < 0.06 && wSand > 0.02 && wSand < 0.03 && rel(fallVelocity(dSilt), stokes) < 0.05 && rel(mpm, 0.0451) < 0.005 && bad === 0 && prof && reach,
  });
}


// H15) Calculadoras y prediseñadores: sin valores inválidos y con propuestas que cumplen lo que dicen
{
  const R = (() => {
    let x = 7;
    return () => ((x = (x * 16807) % 2147483647) / 2147483647);
  })();
  const fns = { calcCanal, preCanal, calcResalto, prePozo, calcPuente, prePuente, calcAlcantarilla, preAlcantarilla, calcSedimento, preEnrocado, calcAforo, preAforador };
  let n = 0, bad = 0, thrown = 0;
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
  for (let k = 0; k < 400; k++) {
    const v: Record<string, number | string> = {
      forma: pick(['rect', 'trap', 'circ']), material: pick(['concreto', 'tierra', 'pasto', 'cantos', 'piedra', 'otro']), n: 0.012 + R() * 0.04, b: 0.5 + R() * 8, z: R() * 3, D: 0.4 + R() * 2.5,
      S: 0.02 + R() * 4, Q: 0.2 + R() * 60, y1: 0.05 + R() * 1, H: 1 + R() * 12, loss: R() * 30, fs: 1 + R() * 0.5, B: 3 + R() * 10, bp: 1 + R() * 3, Hc: 2 + R() * 3, blk: R() * 50, gal: R() * 1,
      L: 10 + R() * 60, tw: R() * 2, entrada: pick(['muro', 'campana', 'saliente']), road: 2 + R() * 6, hwd: 1.2 + R() * 0.5, free: 0.3 + R() * 0.5, vmax: 3 + R() * 3,
      d: 0.05 + R() * 300, h: 0.2 + R() * 4, tipo: pick(['rect', 'tri', 'gate']), ang: pick([60, 90]), a: 2 + R() * 8, qmin: 0.5 + R() * 3, qmax: 5 + R() * 40, P: 10 + R() * 10, fb: 10 + R() * 20,
    };
    for (const [name, fn] of Object.entries(fns)) {
      n++;
      try {
        const r = fn(v);
        if (!r.error && r.outs.some((o) => /NaN|undefined|Infinity/.test(o.value))) bad++;
        if (!r.error && r.steps.some((st) => /NaN|undefined|Infinity/.test(st))) bad++;
      } catch {
        thrown++;
        void name;
      }
    }
  }
  // lo que se propone, cumple
  const pa = preAlcantarilla({ Q: 8, L: 30, S: 1, tw: 0.5, road: 4, entrada: 'muro', hwd: 1.5, free: 0.5, vmax: 4.5 });
  const pc = preCanal({ Q: 4, material: 'concreto', S: 0.1, forma: 'trap', z: 1.5, fb: 20 });
  const pp = prePuente({ Q: 40, B: 8, Hc: 3, S: 0.3, n: 0.02, blk: 20, gal: 0.6 });
  const pz = prePozo({ Q: 12, b: 4, H: 6, loss: 10, fs: 1.1 });
  const pe = preEnrocado({ Q: 50, b: 10, S: 1, n: 0.035, fs: 1.5 });
  const pf = preAforador({ qmin: 3, qmax: 15, b: 30, Hc: 45, P: 15 });
  const okProps = !!pa.checks?.every((c) => c.ok) && !pa.error && !!pc.checks && !pc.error && !!pp.checks?.[0].ok && !!pz.checks && !pz.error && !!pe.checks?.[0].ok && !!pf.checks?.some((c) => c.ok);
  record({
    id: 'H15',
    name: 'Calculadoras y prediseñadores de las seis partes: sin errores ni valores inválidos, y propuestas que cumplen sus criterios',
    tolerance: '400 juegos de datos al azar en las doce herramientas (4 800 llamadas): ninguna excepción y ningún resultado o paso con NaN, indefinido o infinito (salvo los avisos de datos inválidos); con los datos de ejemplo, la alcantarilla propuesta cumple sus tres criterios, el puente no estrangula, el enrocado tiene clase y el aforador tiene una estructura válida',
    measured: `${n} llamadas; excepciones ${thrown}; con valores inválidos ${bad}; propuestas de ejemplo ${okProps ? 'cumplen' : 'NO cumplen'} (alcantarilla: ${pa.outs[0]?.value ?? pa.error})`,
    pass: thrown === 0 && bad === 0 && okProps,
  });
}

// H16) Canal en tierra (Lane) y rugosidad compuesta (Horton y Einstein)
{
  const K = laneK(2, 33);
  const Kref = Math.sqrt(1 - Math.sin(Math.atan(0.5)) ** 2 / Math.sin((33 * Math.PI) / 180) ** 2);
  const n = hortonN([{ P: 2, n: 0.013 }, { P: 4, n: 0.03 }]);
  const nSame = hortonN([{ P: 3, n: 0.02 }, { P: 5, n: 0.02 }]);
  const steep = laneK(1, 33);
  record({
    id: 'H16',
    name: 'Fuerza tractiva de Lane y rugosidad compuesta de Horton y Einstein',
    tolerance: 'K de Lane para talud 2:1 y reposo de 33° igual a √(1 − sen²θ/sen²φ) = 0,571 (error < 0,1 %); un talud más empinado que el reposo da K = 0; n compuesto de 2 m a 0,013 y 4 m a 0,030 igual a 0,0250 (error < 0,5 %) y con un solo material, ese mismo n',
    measured: `K = ${K.toFixed(4)} (referencia ${Kref.toFixed(4)}); talud 1:1 → K = ${steep}; n = ${n.toFixed(5)}; n con un solo material = ${nSame.toFixed(4)}`,
    pass: rel(K, 0.5708) < 1e-3 && rel(K, Kref) < 1e-9 && steep === 0 && rel(n, 0.02503) < 5e-3 && rel(nSame, 0.02) < 1e-9,
  });
}

// H17) Pozos USBR: selección del tipo y proporciones del tipo III
{
  const y1 = 0.3, V1 = 12, F1 = V1 / Math.sqrt(9.81 * y1), y2 = (y1 / 2) * (Math.sqrt(1 + 8 * F1 * F1) - 1);
  const b3 = usbrBasin(y1, V1, F1, y2, V1 * y1);
  const b2 = usbrBasin(y1, 20, 20 / Math.sqrt(9.81 * y1), y2, 6);
  const b4 = usbrBasin(0.5, 7.7, 3.5, 2.2, 3.85);
  const b1 = usbrBasin(0.8, 5.6, 2, 1.9, 4.5);
  const h3 = (y1 * (4 + F1)) / 6, h4 = (y1 * (18 + F1)) / 18;
  record({
    id: 'H17',
    name: 'Pozos amortiguadores USBR: tipo según F1, V1 y q, y proporciones del tipo III (Peterka)',
    tolerance: 'F1 = 7 con 12 m/s y q = 3,6 m²/s → tipo III, bloques de y1·(4 + F1)/6 y umbral de y1·(18 + F1)/18 (error < 0,1 %), a 0,8·y2 del pie y largo 2,7·y2; con 20 m/s → tipo II con umbral dentado de 0,2·y2; F1 = 3,5 → tipo IV; F1 = 2 → tipo I con el largo del resalto libre',
    measured: `tipos ${b3.type}, ${b2.type}, ${b4.type}, ${b1.type}; h3 = ${b3.baffle?.h.toFixed(3)} m (ref. ${h3.toFixed(3)}); h4 = ${b3.sill.h.toFixed(3)} m (ref. ${h4.toFixed(3)}); largo III ${b3.L.toFixed(2)} m frente a libre ${b3.Lfree.toFixed(2)} m`,
    pass: b3.type === 'III' && b2.type === 'II' && b4.type === 'IV' && b1.type === 'I' && rel(b3.baffle!.h, h3) < 1e-3 && rel(b3.sill.h, h4) < 1e-3 && rel(b3.baffle!.x, 0.8 * y2) < 1e-9 && rel(b3.L, 2.7 * y2) < 1e-9 && b2.sill.dentated && rel(b2.sill.h, 0.2 * y2) < 1e-9 && rel(b1.L, 6.9 * (1.9 - 0.8)) < 1e-9 && b3.L < b3.Lfree,
  });
}

// H18) Pilas: remanso de Yarnell y socavación local de HEC-18 (ejemplo publicado)
{
  const dy = yarnell(0.9, 2, 2, 0.1);
  const F2 = 4 / (9.81 * 2);
  const ref = 0.9 * F2 * (0.9 + 5 * F2 - 0.6) * (0.1 + 15 * 1e-4) * 2;
  // ejemplo de la calculadora HEC-18 de Ponce (SDSU): y1 = 5,334 m, V = 7,15 m/s, a = 4,52 m, cilindro, agua clara → 10,484 m
  const ex = pierScour(4.52, 5.334, 7.15, 1.0);
  const big = pierScour(1, 2, 3.5, 1.0);
  const sq = pierScour(1, 3, 1.5, 1.1), rd = pierScour(1, 3, 1.5, 1.0);
  record({
    id: 'H18',
    name: 'Pilas de puente: remanso de Yarnell y socavación local (HEC-18)',
    tolerance: 'Yarnell igual a la ecuación escrita a mano (error < 1e-9); socavación del ejemplo publicado (y1 = 5,334 m, V = 7,15 m/s, a = 4,52 m, cilindro, agua clara) igual a 10,484 m (error < 0,5 %); el tope de 2,4·a (Fr ≤ 0,8) o 3,0·a (Fr > 0,8) en pila redonda; la pila cuadrada socava 10 % más que la redonda',
    measured: `Δy = ${dy.toFixed(4)} m (ref. ${ref.toFixed(4)}); ys = ${ex.ys.toFixed(3)} m; pila de 1 m con Fr = ${big.Fr.toFixed(2)}: ${big.ys.toFixed(2)} m (tope ${big.capped ? 'sí' : 'no'}); cuadrada/redonda = ${(sq.ys / rd.ys).toFixed(3)}`,
    pass: rel(dy, ref) < 1e-9 && rel(ex.ys, 10.484) < 5e-3 && big.capped && rel(big.ys, big.Fr <= 0.8 ? 2.4 : 3.0) < 1e-9 && rel(sq.ys / rd.ys, 1.1) < 1e-9,
  });
}

// H19) Socavación por contracción (HEC-18): agua clara a mano y lecho vivo
{
  const cw = contractionScour(100, 30, 20, 3, 3, 0.05, 0.002);
  const Dm = 1.25 * 0.05;
  const y2 = Math.pow((0.025 * 100 * 100) / (Math.pow(Dm, 2 / 3) * 400), 3 / 7);
  const lb = contractionScour(100, 30, 20, 2, 2, 0.0005, 0.002);
  const lbWide = contractionScour(100, 30, 30, 2, 2, 0.0005, 0.002);
  record({
    id: 'H19',
    name: 'Socavación por contracción (HEC-18): agua clara y lecho vivo',
    tolerance: 'grava de 5 cm a 1,1 m/s (por debajo de la velocidad crítica) → agua clara con y2 = [0,025·Q²/(Dm^(2/3)·W²)]^(3/7) (error < 1e-9); arena de 0,5 mm → lecho vivo con k1 de la tabla; sin contracción (W2 = W1) no hay socavación por lecho vivo',
    measured: `agua clara: ${cw.live ? 'no' : 'sí'}, y2 = ${cw.y2.toFixed(3)} m (ref. ${y2.toFixed(3)}), ys = ${cw.ys.toFixed(3)} m; lecho vivo: ${lb.live ? 'sí' : 'no'}, k1 = ${lb.k1}, ys = ${lb.ys.toFixed(3)} m; sin contracción ys = ${lbWide.ys.toFixed(4)} m`,
    pass: !cw.live && rel(cw.y2, y2) < 1e-9 && lb.live && [0.59, 0.64, 0.69].includes(lb.k1) && lb.ys > 0 && lbWide.ys < 1e-9,
  });
}

// H20) Sedimentos: cuatro fórmulas y formas del lecho
{
  const sec = (d: number, V: number, h: number, S: number) => transport({ d, h, V, S, R: (10 * h) / (10 + 2 * h) });
  const still = sec(0.05, 0.5, 1, 0.0005);
  const gravel = sec(0.02, 2.5, 1.5, 0.006);
  const order: Bedform[] = ['plano-quieto', 'rizos', 'dunas', 'transicion', 'plano-alto', 'antidunas'];
  const forms: number[] = [];
  let mono = true, prev = -1;
  for (const V of [0.25, 0.4, 0.6, 0.9, 1.3, 1.8, 2.5]) {
    const r = sec(0.0003, V, 2, (V * 0.022) ** 2 / Math.pow(1.6, 4 / 3));
    const k = order.indexOf(r.bedform) === 5 ? 4 : order.indexOf(r.bedform);
    forms.push(order.indexOf(r.bedform));
    if (k < prev) mono = false;
    prev = k;
    if (r.mpm < 0 || r.vanRijn < 0 || r.engelundHansen < 0) mono = false;
  }
  // cada fórmula en su rango: en grava, MPM y Einstein-Brown; en arena, van Rijn, Einstein-Brown y Engelund-Hansen
  const spread = Math.max(gravel.mpm, gravel.einsteinBrown) / Math.min(gravel.mpm, gravel.einsteinBrown);
  const sand = sec(0.0005, 1.0, 2, 0.0004);
  const sv = [sand.vanRijn, sand.einsteinBrown, sand.engelundHansen];
  const spreadS = Math.max(...sv) / Math.min(...sv);
  record({
    id: 'H20',
    name: 'Transporte de sedimentos con cuatro fórmulas y formas del lecho (van Rijn)',
    tolerance: 'bajo el umbral, Meyer-Peter y Müller y van Rijn dan 0; cada fórmula en su rango de grano: en grava, Meyer-Peter y Müller y Einstein-Brown dentro de un factor de 3; en arena, van Rijn, Einstein-Brown y Engelund-Hansen dentro de un factor de 10; van Rijn fuera de rango en grava; en arena, al subir la velocidad, las formas del lecho siguen el orden quieto → rizos → dunas → transición → lecho plano o antidunas, sin retroceder',
    measured: `bajo el umbral: MPM ${still.mpm}, van Rijn ${still.vanRijn}; grava: MPM ${(gravel.mpm * 1e3).toFixed(3)}, Einstein-Brown ${(gravel.einsteinBrown * 1e3).toFixed(3)} L/s·m (factor ${spread.toFixed(1)}; van Rijn ${gravel.valid.vanRijn ? 'en rango' : 'fuera de rango'}); arena: van Rijn ${(sand.vanRijn * 1e3).toFixed(4)}, Einstein-Brown ${(sand.einsteinBrown * 1e3).toFixed(4)}, Engelund-Hansen ${(sand.engelundHansen * 1e3).toFixed(4)} L/s·m (factor ${spreadS.toFixed(1)}); formas: ${forms.map((k) => BEDFORM_NAME[order[k]].split(' ')[0]).join(' → ')}`,
    pass: still.mpm === 0 && still.vanRijn === 0 && spread < 3 && spreadS < 10 && !gravel.valid.vanRijn && sand.valid.vanRijn && mono && forms[0] <= 1 && forms[forms.length - 1] >= 3,
  });
}

// H21) Aforo: canaleta Parshall (tablas del USBR) y molinete por sección media
{
  const q6 = parshallQ('6in', 0.3048), q9 = parshallQ('9in', 0.3048);
  const back = parshallH('3in', parshallQ('3in', 0.12));
  const ms = midSection([
    { x: 0, d: 0, v: 0 },
    { x: 1, d: 1, v: 0.5 },
    { x: 2, d: 1.5, v: 0.8 },
    { x: 3, d: 1, v: 0.5 },
    { x: 4, d: 0, v: 0 },
  ]);
  record({
    id: 'H21',
    name: 'Aforo: canaleta Parshall y molinete por sección media (ISO 748)',
    tolerance: 'Parshall de 6 y 9 pulgadas con Ha = 1 pie igual a las tablas del USBR (2,06 y 3,07 pies³/s, error < 0,1 %); la carga inversa recupera la carga (error < 1e-9); sección media de un ejemplo a mano: Q = 2,2 m³/s y A = 3,5 m²',
    measured: `6 pulgadas: ${(q6 / 0.0283168).toFixed(3)} pies³/s; 9 pulgadas: ${(q9 / 0.0283168).toFixed(3)} pies³/s; carga inversa ${back.toFixed(4)} m; molinete Q = ${ms.Q.toFixed(3)} m³/s, A = ${ms.A.toFixed(3)} m²`,
    pass: rel(q6 / 0.0283168, 2.06) < 1e-3 && rel(q9 / 0.0283168, 3.07) < 1e-3 && rel(back, 0.12) < 1e-9 && rel(ms.Q, 2.2) < 1e-9 && rel(ms.A, 3.5) < 1e-9,
  });
}

// H22) Alcantarilla de cajón (HDS-5, aletas de 30° a 75°): control a la entrada a mano y modelo completo
{
  // cajón de 2,0 × 1,5 m, Q = 6 m³/s, S = 1 %: X = 1,811·6/(3·√1,5) = 2,957 < 3,5 → forma 1 sin ahogar
  const X = (1.811 * 6) / (3 * Math.sqrt(1.5));
  const dc = Math.cbrt((3 * 3) / 9.81);
  const ref = 1.5 * ((1.5 * dc) / 1.5 + 0.026 * X - 0.5 * 0.01);
  const i = inletHW(6, 1.5, 0.01, 'aletas3075', 2.0);
  const mBox = culvertModel({ Q: 6, D: 1.5, B: 2.0, barrels: 1, L: 30, S: 0.01, inlet: 'aletas3075', tw: 0.5, road: 4, shape: 'cajon' });
  const mPipe = culvertModel({ Q: 6, D: 1.5, barrels: 1, L: 30, S: 0.01, inlet: 'muro', tw: 0.5, road: 4, shape: 'circ' });
  const fixInlet = culvertModel({ Q: 6, D: 1.5, B: 2, shape: 'cajon', inlet: 'muro' });
  const o = outletHW(6, 1.5, 30, 0.01, 2.0, 'aletas3075', 2.0);
  const R = 3 / 7, V = 2;
  const Href = ((1 + 0.4 + (2 * 9.81 * 0.012 ** 2 * 30) / Math.pow(R, 4 / 3)) * (V * V)) / (2 * 9.81);
  record({
    id: 'H22',
    name: 'Alcantarilla de cajón: control a la entrada (HDS-5, forma 1) y a la salida, y modelo completo',
    tolerance: 'cajón de 2,0 × 1,5 m con 6 m³/s: HW a la entrada igual al cálculo a mano con Hc = 1,5·dc, K = 0,026 y M = 1 (error < 0,1 %); pérdida a la salida con R = A/P del cajón lleno y ke = 0,4 (error < 1e-9); el cajón (3 m²) deja el agua más baja que un tubo de 1,5 m (1,77 m²); una entrada de tubo pedida para un cajón se cambia por aletas de 30° a 75°',
    measured: `X = ${X.toFixed(3)}; HW = ${i.hw.toFixed(3)} m (a mano ${ref.toFixed(3)}); H = ${o.H.toFixed(4)} m (a mano ${Href.toFixed(4)}); cajón ${mBox.hw.toFixed(2)} m frente a tubo ${mPipe.hw.toFixed(2)} m; entrada corregida: ${fixInlet.inp.inlet}`,
    pass: i.regime === 'libre' && rel(i.hw, ref) < 1e-3 && rel(o.H, Href) < 1e-9 && mBox.hw < mPipe.hw && fixInlet.inp.inlet === 'aletas3075',
  });
}

const ok = results.filter((r) => r.pass).length;
for (const r of results) {
  console.log(`${r.pass ? 'PASA ' : 'FALLA'}  [${r.id}] ${r.name}`);
  console.log(`        tolerancia: ${r.tolerance}`);
  console.log(`        medido:     ${r.measured}`);
}
console.log(`\n${ok}/${results.length} cumplen.`);
mkdirSync('docs/canales', { recursive: true });
writeFileSync(
  'docs/canales/PRUEBAS_CANALES.md',
  `# Pruebas del módulo «Hidráulica de canales»\n\nSe ejecutan con \`npm run test:canals\`. Cada prueba declara su tolerancia antes de ejecutarse.\n\n**${ok} de ${results.length} cumplen.**\n\n` +
    results.map((r) => `## ${r.id}. ${r.name} — ${r.pass ? 'cumple' : 'NO cumple'}\n\n- Tolerancia: ${r.tolerance}\n- Medido: ${r.measured}\n`).join('\n'),
);
if (ok !== results.length) process.exit(1);

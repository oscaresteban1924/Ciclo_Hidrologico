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
import { SaintVenant, favreSurge, ritter, stoker, stokerProfile } from '../../src/canals/unsteady';
import { planFor } from '../../src/canals/designPlans';
import { chartSVG, planSVG } from '../../src/canals/plan';
import { memoriaHTML } from '../../src/canals/memoria';
import { calcCeleridad, calcContraccion, calcFormulas, calcMolinete, calcParshall, calcPilas, calcRotura, calcRugosidad, calcTransito, muskingumCunge, preCanalTierra, preMuroCompuerta, preParshall, prePozoUSBR } from '../../src/canals/designAdvanced';
import { WaveSim, steadyDepth } from '../../src/canals/waves';
import { RAS, RAS_SHORT, RAS_TABLA16, RAS_TABLA17, canalReturnPeriod } from '../../src/canals/norms';
import { gammaHydrograph } from '../../src/canals/common';
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
  const fns = { calcCanal, preCanal, calcResalto, prePozo, calcPuente, prePuente, calcAlcantarilla, preAlcantarilla, calcSedimento, preEnrocado, calcAforo, preAforador, calcRugosidad, preCanalTierra, prePozoUSBR, calcPilas, calcContraccion, calcFormulas, calcParshall, preParshall, calcMolinete, calcRotura, preMuroCompuerta, calcCeleridad, calcTransito };
  let n = 0, bad = 0, thrown = 0;
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
  for (let k = 0; k < 400; k++) {
    const v: Record<string, number | string> = {
      forma: pick(['rect', 'trap', 'circ', 'cajon']), material: pick(['concreto', 'tierra', 'pasto', 'cantos', 'piedra', 'otro']), n: 0.012 + R() * 0.04, b: 0.5 + R() * 8, z: R() * 3, D: 0.4 + R() * 2.5,
      S: 0.02 + R() * 4, Q: 0.2 + R() * 60, y1: 0.05 + R() * 1, H: 1 + R() * 12, loss: R() * 30, fs: 1 + R() * 0.5, B: 3 + R() * 10, bp: 1 + R() * 3, Hc: 2 + R() * 3, blk: R() * 50, gal: R() * 1,
      L: 10 + R() * 60, tw: R() * 2, entrada: pick(['muro', 'campana', 'saliente']), road: 2 + R() * 6, hwd: 1.2 + R() * 0.5, free: 0.3 + R() * 0.5, vmax: 3 + R() * 3,
      d: 0.05 + R() * 300, h: 0.2 + R() * 4, tipo: pick(['rect', 'tri', 'gate']), ang: pick([60, 90]), a: 2 + R() * 8, qmin: 0.5 + R() * 3, qmax: 5 + R() * 40, P: 10 + R() * 10, fb: 10 + R() * 20,
      forma2: pick(['circ', 'cajon']), entradaC: pick(['aletas3075', 'aletas90', 'aletas0', 'muro']), y: 0.1 + R() * 3, nb: 0.012 + R() * 0.05, nw: 0.011 + R() * 0.03, d75: 1 + R() * 120, phi: 25 + R() * 15, tw2: R() * 4, np: Math.floor(R() * 5), Lp: 1 + R() * 10, pila: pick(['semicircular', 'cuadrada', 'triangular', 'otra']), skew: R() * 30, K3: pick([1.1, 1.2, 1.3]), W1: 5 + R() * 60, W2: 3 + R() * 60, y0: 0.3 + R() * 4, d50: 0.1 + R() * 100, size: pick(['1in', '3in', '6in', '9in', '1ft', '3ft', 'x']), Ha: R() * 80, Hb: R() * 60, tabla: pick(['0 0 0\n1 0,5 0,4\n2 0 0', '0 0 0\n2 1 1\n4 1,5 1,2\n6 0 0', 'a b c', '0 0 0']),
      h0: 0.1 + R() * 20, h1: pick([0, R() * 3, R() * 25]), x: 1 + R() * 5000, keep: pick([0, R() * 100, 100]),
      Qb: 0.5 + R() * 20, Qp: 1 + R() * 300, tp: 0.2 + R() * 30,
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
  const pm = preMuroCompuerta({});
  const okProps = !!pa.checks?.every((c) => c.ok) && !pa.error && !!pc.checks && !pc.error && !!pp.checks?.[0].ok && !!pz.checks && !pz.error && !!pe.checks?.[0].ok && !!pf.checks?.some((c) => c.ok) && !!pm.checks?.every((c) => c.ok) && !pm.error;
  record({
    id: 'H15',
    name: 'Calculadoras y prediseñadores de las siete partes: sin errores ni valores inválidos, y propuestas que cumplen sus criterios',
    tolerance: '400 juegos de datos al azar en las veinticinco herramientas (10 000 llamadas): ninguna excepción y ningún resultado o paso con NaN, indefinido o infinito (salvo los avisos de datos inválidos); con los datos de ejemplo, la alcantarilla propuesta cumple sus tres criterios, el puente no estrangula, el enrocado tiene clase, el aforador tiene una estructura válida y los muros junto a la compuerta contienen la onda con su borde libre',
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

// H23) Planos, gráficas y memoria de cálculo: válidos con los datos de ejemplo y con datos al azar
{
  const R2 = (() => {
    let x = 11;
    return () => ((x = (x * 16807) % 2147483647) / 2147483647);
  })();
  const tools = { preCanal, preCanalTierra, prePozo, prePozoUSBR, prePuente, preAlcantarilla, preEnrocado, preAforador, preParshall, calcFormulas, calcRotura, preMuroCompuerta, calcTransito };
  let made = 0, plans = 0, charts = 0, bad = 0, thrown = 0;
  for (let k = 0; k < 120; k++) {
    const v: Record<string, number | string> =
      k === 0
        ? {}
        : { Q: 0.5 + R2() * 60, S: 0.05 + R2() * 2, b: 1 + R2() * 12, z: R2() * 2.5, forma: R2() < 0.5 ? 'trap' : 'rect', material: 'concreto', fb: 20, H: 2 + R2() * 8, loss: 10, tw: R2() * 4, fs: 1.1, B: 4 + R2() * 10, Hc: 3, n: 0.03, blk: R2() * 40, gal: 0.5, L: 30, road: 3 + R2() * 4, entrada: 'muro', hwd: 1.5, free: 0.5, vmax: 4.5, d75: 10 + R2() * 80, phi: 33, d: 0.3 + R2() * 30, qmin: 1 + R2() * 4, qmax: 8 + R2() * 100, P: 15, h0: 0.5 + R2() * 10, h1: R2() < 0.4 ? 0 : R2() * 0.5, x: 50 + R2() * 2000, keep: R2() * 60, L: 30, Qb: 1 + R2() * 10, Qp: 20 + R2() * 200, tp: 1 + R2() * 12 };
    for (const [name, fn] of Object.entries(tools)) {
      try {
        const res = fn(v);
        const ex = planFor(fn, res);
        const svg = [ex.plan ? planSVG(ex.plan, 420) : '', ex.chart ? chartSVG(ex.chart, 420, 250) : ''];
        if (ex.plan) plans++;
        if (ex.chart) charts++;
        const html = memoriaHTML({ title: name, intro: '', level: 'Universitarios', data: [], res, planSvg: svg[0] || undefined, chartSvg: svg[1] || undefined });
        made++;
        if (svg.some((x) => x && (!x.startsWith('<svg') || /NaN|undefined|Infinity/.test(x))) || /NaN|undefined/.test(html)) bad++;
      } catch {
        thrown++;
      }
    }
  }
  record({
    id: 'H23',
    name: 'Planos acotados, gráficas y memoria de cálculo imprimible de los prediseños',
    tolerance: '120 juegos de datos (el primero, los de ejemplo) en las trece herramientas con plano o gráfica: ninguna excepción; cada plano y gráfica es un SVG sin NaN, indefinido ni infinito, y la memoria HTML no contiene NaN ni «undefined»',
    measured: `${made} memorias; ${plans} planos y ${charts} gráficas; excepciones ${thrown}; con valores inválidos ${bad}`,
    pass: thrown === 0 && bad === 0 && plans > 0 && charts > 0,
  });
}

// H24) Flujo no permanente: rotura de presa sobre fondo seco (Ritter)
{
  const sv = new SaintVenant({ L: 100, N: 800, b: 1, n: 0, zb: () => 0, up: { kind: 'wall' }, down: { kind: 'free' } });
  sv.init((x) => ({ h: x < 50 ? 1 : 0 }));
  sv.advance(4, 100000);
  let e = 0, sum = 0;
  for (let i = 0; i < 800; i++) {
    const a = ritter(sv.x[i], sv.t, 50, 1);
    e += Math.abs(sv.h[i] - a);
    sum += a;
  }
  // dónde la exacta tiene 1 cm de agua: 2c0 − s = √(9·g·0,01)
  const xf = 50 + (2 * Math.sqrt(9.81) - Math.sqrt(9 * 9.81 * 0.01)) * sv.t;
  const nf = sv.front(0.01);
  record({
    id: 'H24',
    name: 'Saint-Venant: rotura de presa sobre fondo seco igual a la solución de Ritter',
    tolerance: 'presa de 1 m en la mitad de un canal de 100 m sin fricción, 800 celdas, a los 4 s: error medio relativo de la profundidad < 2 %; el punto con 1 cm de agua a menos de 2 m del exacto',
    measured: `error medio ${(100 * e / sum).toFixed(2)} %; frente de 1 cm en ${nf.toFixed(2)} m (exacto ${xf.toFixed(2)} m)`,
    pass: e / sum < 0.02 && Math.abs(nf - xf) < 2,
  });
}

// H25) Rotura de presa sobre fondo mojado (Stoker): la altura intermedia y la posición del frente
{
  const sv = new SaintVenant({ L: 100, N: 800, b: 1, n: 0, zb: () => 0, up: { kind: 'wall' }, down: { kind: 'free' } });
  sv.init((x) => ({ h: x < 50 ? 1 : 0.1 }));
  sv.advance(5, 100000);
  const st = stoker(1, 0.1);
  let e = 0, sum = 0;
  for (let i = 0; i < 800; i++) {
    const a = stokerProfile(sv.x[i], sv.t, 50, 1, 0.1);
    e += Math.abs(sv.h[i] - a);
    sum += a;
  }
  const xm = 50 + ((st.u2 - Math.sqrt(9.81 * st.h2) + st.S) / 2) * sv.t;
  let xs = 0;
  for (let i = 0; i < 800; i++) if (sv.x[i] > xm && sv.h[i] > (st.h2 + 0.1) / 2) xs = sv.x[i];
  const xsE = 50 + st.S * sv.t;
  record({
    id: 'H25',
    name: 'Saint-Venant: rotura de presa sobre fondo mojado igual a la solución de Stoker',
    tolerance: 'presa de 1 m sobre 0,1 m de agua, a los 5 s: error medio < 2 %; altura de la meseta a menos de 1 % de la exacta; frente (resalto móvil) a menos de 1 m',
    measured: `error medio ${(100 * e / sum).toFixed(2)} %; meseta ${sv.depthAt(xm).toFixed(4)} m (exacta ${st.h2.toFixed(4)} m); frente en ${xs.toFixed(2)} m (exacto ${xsE.toFixed(2)} m)`,
    pass: e / sum < 0.02 && rel(sv.depthAt(xm), st.h2) < 0.01 && Math.abs(xs - xsE) < 1,
  });
}

// H26) Saint-Venant llega al flujo uniforme de Manning y conserva el volumen
{
  const Q = 10, b = 5, n = 0.02, S = 0.002;
  const sv = new SaintVenant({ L: 2000, N: 200, b, n, zb: (x) => -S * x, up: { kind: 'Q', Q: () => Q }, down: { kind: 'fall' } });
  sv.init(() => ({ h: 0.5, q: 0 }));
  const v0 = sv.volume();
  sv.advance(6000, 400000);
  const yn = normalDepth({ shape: 'rect', b, z: 0, D: 0, H: 99 }, n, S, Q);
  const err = (sv.volume() - v0 - (sv.vIn - sv.vOut)) / sv.volume();
  const lake = new SaintVenant({ L: 100, N: 200, b: 2, n: 0.02, zb: (x) => 0.4 * Math.exp(-((x - 50) ** 2) / 50), up: { kind: 'wall' }, down: { kind: 'wall' } });
  lake.init((_, z) => ({ h: Math.max(0, 1 - z) }));
  lake.advance(100, 100000);
  let um = 0;
  for (let i = 0; i < 200; i++) um = Math.max(um, Math.abs(lake.q[i]));
  record({
    id: 'H26',
    name: 'Saint-Venant: flujo uniforme, conservación del volumen y lago en reposo sobre un fondo irregular',
    tolerance: 'canal de 2 km (S = 0,2 %, n = 0,02, 5 m, 10 m³/s): a mitad del canal, profundidad normal de Manning (error < 1 %) y caudal 10 m³/s (error < 0,5 %); volumen final = inicial + entrado − salido (error relativo < 1e-9); un lago sobre una loma queda quieto (caudal por metro < 1e-9 m²/s a los 100 s)',
    measured: `y = ${sv.depthAt(1000).toFixed(4)} m (Manning ${yn.toFixed(4)} m); Q = ${sv.flowAt(1000).toFixed(4)} m³/s; error de volumen ${err.toExponential(1)}; lago: ${um.toExponential(1)} m²/s`,
    pass: rel(sv.depthAt(1000), yn) < 0.01 && rel(sv.flowAt(1000), Q) < 0.005 && Math.abs(err) < 1e-9 && um < 1e-9,
  });
}

// H27) Compuerta interna: caudal de orificio y vena contraída aguas abajo
{
  const sv = new SaintVenant({ L: 60, N: 240, b: 2, n: 0, zb: () => 0, up: { kind: 'Q', Q: () => 2 }, down: { kind: 'free' } });
  sv.gate = { k: 120, a: 0.3 };
  sv.init((x) => ({ h: x < 30 ? 1.2 : 0.2 }));
  sv.advance(420, 400000);
  const q = 1, a = 0.3, Cc = 0.61;
  const h1 = (q / (Cc * a)) ** 2 / (2 * 9.81) + Cc * a;
  record({
    id: 'H27',
    name: 'Compuerta en el canal: el agua sube hasta la carga del orificio y sale por la vena contraída',
    tolerance: 'compuerta de 0,3 m con 1 m²/s: aguas arriba, la profundidad de la ecuación del orificio q = Cc·a·√(2g·(h1 − Cc·a)) (error < 1 %); aguas abajo, Cc·a = 0,183 m (error < 2 %); caudal que pasa igual al que entra (error < 0,5 %)',
    measured: `arriba ${sv.depthAt(20).toFixed(4)} m (ecuación ${h1.toFixed(4)} m); abajo ${sv.depthAt(45).toFixed(4)} m; Q ${sv.flowAt(45).toFixed(4)} m³/s`,
    pass: rel(sv.depthAt(20), h1) < 0.01 && rel(sv.depthAt(45), Cc * a) < 0.02 && rel(sv.flowAt(45), 2) < 0.005,
  });
}

// H28) Onda por cierre de compuerta: Saint-Venant frente a la teoría de Favre
{
  const y1 = 1.0, V1 = 1.0, b = 2;
  const sv = new SaintVenant({ L: 400, N: 800, b, n: 0, zb: () => 0, up: { kind: 'Q', Q: () => V1 * y1 * b }, down: { kind: 'free' } });
  sv.init(() => ({ h: y1, q: V1 * y1 }));
  sv.gate = { k: 600, a: 0 };
  sv.advance(30, 400000);
  const th = favreSurge(y1, V1, 0);
  // frente: el punto más aguas arriba con el agua a medio camino entre y1 e y2
  let xs = 300;
  for (let i = 599; i >= 0; i--) if (sv.h[i] > (y1 + th.y2) / 2) xs = sv.x[i];
  const xsE = 300 - th.Vw * sv.t;
  record({
    id: 'H28',
    name: 'Onda positiva por el cierre brusco de una compuerta (Favre)',
    tolerance: 'canal con 1 m de agua a 1 m/s y la compuerta cerrada de golpe, a los 30 s: altura detrás del frente a menos de 1 % de la de Favre (masa y cantidad de movimiento en el frente) y frente a menos de 2 m de la posición teórica',
    measured: `altura ${sv.depthAt(280).toFixed(4)} m (Favre ${th.y2.toFixed(4)} m); frente en ${xs.toFixed(2)} m (Favre ${xsE.toFixed(2)} m, a ${th.Vw.toFixed(3)} m/s)`,
    pass: rel(sv.depthAt(280), th.y2) < 0.01 && Math.abs(xs - xsE) < 2,
  });
}

// H29) El resalto calculado en el tiempo: desde el pozo lleno hasta la cresta, llega al mismo estado que el cálculo
// permanente (pozo que atrapa o resalto barrido) y a la misma profundidad en el pozo
{
  const cases = [
    { Q: 12, drop: 6, weir: 0.8, basin: 16 },
    { Q: 12, drop: 6, weir: 0.6, basin: 16 },
    { Q: 20, drop: 8, weir: 1.2, basin: 25 },
    { Q: 8, drop: 4, weir: 0.5, basin: 12 },
  ];
  const rows: string[] = [];
  let ok = true;
  for (const inp of cases) {
    const r = jumpModel(inp);
    const x1 = inp.basin + 31;
    const sv = new SaintVenant({ L: x1, N: Math.round(x1 / 0.1), b: 4, n: 0.014, zb: (x) => (x < inp.basin ? 0 : inp.weir), up: { kind: 'jet', h: r.y1, Q: () => inp.Q }, down: { kind: 'fall' } });
    sv.order = 2;
    sv.init((x) => ({ h: x < inp.basin ? inp.weir : 0, q: 0 }));
    sv.advance(200, 4e6);
    const pool = sv.depthAt(inp.basin - 0.5);
    const swept = pool < (r.y1 + r.y2) / 2;
    const steadySwept = r.place === 'barrido';
    let toe = NaN;
    for (let i = 0; i < sv.cfg.N; i++)
      if (sv.x[i] <= inp.basin && sv.h[i] > r.y1 + 0.1 * (r.y2 - r.y1)) {
        toe = sv.x[i];
        break;
      }
    const good = swept === steadySwept && (steadySwept || (rel(pool, r.ytw) < 0.04 && toe < inp.basin));
    if (!good) ok = false;
    rows.push(`${inp.Q} m³/s, vertedero ${inp.weir} m: ${steadySwept ? 'barrido' : 'atrapado'} / ${swept ? 'barrido' : `atrapado, pozo ${pool.toFixed(2)} m (permanente ${r.ytw.toFixed(2)}), resalto a ${toe.toFixed(1)} m (permanente ${r.xJump.toFixed(1)})`}`);
  }
  record({
    id: 'H29',
    name: 'El resalto calculado en el tiempo llega al estado del cálculo permanente',
    tolerance: 'cuatro pozos: con el chorro del pie de la rápida entrando al pozo lleno hasta la cresta, a los 200 s el modelo de Saint-Venant de segundo orden (celdas de 10 cm, como en la escena) da el mismo resultado que el cálculo permanente (resalto atrapado o barrido); si queda atrapado, la profundidad del pozo a menos de 4 % y el resalto dentro del pozo. La posición del resalto se informa pero no se exige: es muy sensible a la profundidad del pozo',
    measured: rows.join('; '),
    pass: ok,
  });
}

// H30) Saint-Venant de segundo orden: menos error con las mismas celdas, convergencia y propiedades conservadas
{
  const ritErr = (N: number, o: 1 | 2) => {
    const sv = new SaintVenant({ L: 100, N, b: 1, n: 0, zb: () => 0, up: { kind: 'wall' }, down: { kind: 'free' } });
    sv.order = o;
    sv.init((x) => ({ h: x < 50 ? 1 : 0 }));
    sv.advance(4, 1e6);
    let e = 0, sum = 0;
    for (let i = 0; i < N; i++) {
      const a = ritter(sv.x[i], sv.t, 50, 1);
      e += Math.abs(sv.h[i] - a);
      sum += a;
    }
    return e / sum;
  };
  const stoErr = (N: number, o: 1 | 2) => {
    const sv = new SaintVenant({ L: 100, N, b: 1, n: 0, zb: () => 0, up: { kind: 'wall' }, down: { kind: 'free' } });
    sv.order = o;
    sv.init((x) => ({ h: x < 50 ? 1 : 0.1 }));
    sv.advance(5, 1e6);
    let e = 0, sum = 0;
    for (let i = 0; i < N; i++) {
      const a = stokerProfile(sv.x[i], sv.t, 50, 1, 0.1);
      e += Math.abs(sv.h[i] - a);
      sum += a;
    }
    return e / sum;
  };
  const Ns = [100, 200, 400, 800];
  const r1 = Ns.map((N) => ritErr(N, 1)), r2 = Ns.map((N) => ritErr(N, 2)), s1 = Ns.map((N) => stoErr(N, 1)), s2 = Ns.map((N) => stoErr(N, 2));
  const rate = (e: number[]) => Math.log(e[0] / e[e.length - 1]) / Math.log(Ns[Ns.length - 1] / Ns[0]);
  // lago con una isla (orilla seca) y flujo uniforme con el volumen
  const lake = new SaintVenant({ L: 100, N: 200, b: 2, n: 0.02, zb: (x) => 1.4 * Math.exp(-((x - 50) ** 2) / 50), up: { kind: 'wall' }, down: { kind: 'wall' } });
  lake.order = 2;
  lake.init((_, z) => ({ h: Math.max(0, 1 - z) }));
  lake.advance(100, 1e5);
  let um = 0;
  for (let i = 0; i < 200; i++) um = Math.max(um, Math.abs(lake.q[i]));
  const Q = 10, b = 5, n = 0.02, S = 0.002;
  const un = new SaintVenant({ L: 2000, N: 200, b, n, zb: (x) => -S * x, up: { kind: 'Q', Q: () => Q }, down: { kind: 'fall' } });
  un.order = 2;
  un.init(() => ({ h: 0.5, q: 0 }));
  const v0 = un.volume();
  un.advance(6000, 400000);
  const yn = normalDepth({ shape: 'rect', b, z: 0, D: 0, H: 99 }, n, S, Q);
  const verr = (un.volume() - v0 - (un.vIn - un.vOut)) / un.volume();
  const better = r2.every((e, k) => e < r1[k] * 0.75) && s2.every((e, k) => e < s1[k] * 0.75);
  record({
    id: 'H30',
    name: 'Saint-Venant de segundo orden (minmod y Heun): menos error con las mismas celdas y las mismas propiedades',
    tolerance: 'Ritter y Stoker con 100, 200, 400 y 800 celdas: en cada malla el error de segundo orden es menor que 75 % del de primer orden; con 800 celdas < 0,3 %; el error baja al menos como 1/N (orden ≥ 0,9). Un lago con una isla (orilla seca) queda quieto (< 1e-9 m²/s); flujo uniforme a menos de 0,1 % de Manning y error de volumen < 1e-9',
    measured: `Ritter: ${r1.map((e) => (100 * e).toFixed(2)).join(' / ')} % (1.er orden) y ${r2.map((e) => (100 * e).toFixed(2)).join(' / ')} % (2.º), orden ${rate(r1).toFixed(2)} y ${rate(r2).toFixed(2)}; Stoker: ${s1.map((e) => (100 * e).toFixed(2)).join(' / ')} % y ${s2.map((e) => (100 * e).toFixed(2)).join(' / ')} %, orden ${rate(s1).toFixed(2)} y ${rate(s2).toFixed(2)}; lago con isla ${um.toExponential(1)} m²/s; uniforme ${un.depthAt(1000).toFixed(4)} m (Manning ${yn.toFixed(4)} m); volumen ${verr.toExponential(1)}`,
    pass: better && r2[3] < 0.003 && s2[3] < 0.003 && rate(r2) >= 0.9 && rate(s2) >= 0.9 && um < 1e-9 && rel(un.depthAt(1000), yn) < 0.001 && Math.abs(verr) < 1e-9,
  });
}

// H31) Curva de gasto en la estación A: la permanente coincide con el modelo y la creciente hace un lazo
{
  let worst = 0;
  const cases: string[] = [];
  for (const S of [0, 0.001, 0.005, 0.01])
    for (const Q of [2, 8, 15]) {
      const sim = new WaveSim({ scenario: 'creciente', Q, S });
      const e = rel(sim.sv.depthAt(60), steadyDepth(Q, S, 60));
      worst = Math.max(worst, e);
    }
  let loopOk = true;
  for (const S of [0.001, 0.005]) {
    const sim = new WaveSim({ scenario: 'creciente', Q: 4, peak: 24, tp: 30, S });
    sim.startFlood();
    for (let k = 0; k < 1500; k++) sim.tick(0.1);
    const H = sim.history;
    const pk = H.reduce((a, p, i) => (p.hA > H[a].hA ? i : a), 0);
    const href = H[0].hA + 0.8 * (H[pk].hA - H[0].hA);
    const up = H.slice(0, pk + 1).find((p) => p.hA >= href)!, down = H.slice(pk).find((p) => p.hA <= href)!;
    if (!(up && down && up.QA > down.QA * 1.05)) loopOk = false;
    cases.push(`S = ${(S * 100).toFixed(1)} %: con h = ${href.toFixed(3)} m pasan ${up?.QA.toFixed(2)} m³/s al subir y ${down?.QA.toFixed(2)} m³/s al bajar`);
  }
  record({
    id: 'H31',
    name: 'Curva de gasto en la estación A: permanente igual al modelo, y en lazo durante la creciente',
    tolerance: 'doce casos (pendiente 0 a 1 %, 2 a 15 m³/s, suave y fuerte): la profundidad de la curva permanente (perfil M2, H2 o S2 por Runge-Kutta desde la crítica) a menos de 0,5 % de la del modelo de Saint-Venant ya estable; en una creciente de 4 a 24 m³/s, con la misma profundidad pasa al menos 5 % más caudal al subir que al bajar',
    measured: `peor diferencia ${(100 * worst).toFixed(2)} %; ${cases.join('; ')}`,
    pass: worst < 0.005 && loopOk,
  });
}

// H32) Tránsito de crecientes: Muskingum-Cunge de parámetros variables frente a Saint-Venant
{
  const b = 10, n = 0.035, S = 0.001, Qb = 5, Qp = 60, tp = 6 * 3600;
  const qin = (t: number) => Qb + (Qp - Qb) * gammaHydrograph(t, tp);
  const y0 = normalDepth({ shape: 'rect', b, z: 0, D: 0, H: 99 }, n, S, Qb);
  const sv = new SaintVenant({ L: 20000, N: 400, b, n, zb: (x) => -S * x, up: { kind: 'Q', Q: qin }, down: { kind: 'free' } });
  sv.order = 2;
  sv.init(() => ({ h: y0, q: Qb / b }));
  const xs = [5000, 10000];
  const best = xs.map(() => [0, 0]);
  while (sv.t < 12 * 3600) {
    sv.step();
    xs.forEach((x, k) => {
      const q = sv.flowAt(x);
      if (q > best[k][1]) best[k] = [sv.t, q];
    });
  }
  const rows: string[] = [];
  let ok = true;
  xs.forEach((x, k) => {
    const m = muskingumCunge({ L: x, b, n, S, Qb, Qp, tp });
    const ePk = rel(m.peakOut, best[k][1]);
    const lagSV = best[k][0] - tp, lagMC = m.tPeakOut - tp;
    const eLag = Math.abs(lagMC - lagSV) / lagSV;
    if (!(ePk < 0.01 && eLag < 0.1 && Math.abs(m.volErr) < 0.01 && m.M > 15)) ok = false;
    rows.push(`${x / 1000} km: pico ${m.peakOut.toFixed(2)} / ${best[k][1].toFixed(2)} m³/s, retraso ${(lagMC / 3600).toFixed(3)} / ${(lagSV / 3600).toFixed(3)} h, volumen ${(100 * m.volErr).toFixed(2)} %, M = ${m.M.toFixed(0)}`);
  });
  record({
    id: 'H32',
    name: 'Tránsito de una creciente: Muskingum-Cunge de parámetros variables igual al modelo completo de Saint-Venant',
    tolerance: 'cauce de 10 m, n = 0,035, S0 = 0,1 %, creciente de 5 a 60 m³/s con pico a las 6 h (onda difusiva, M > 15): a 5 y 10 km, el pico de Muskingum-Cunge a menos de 1 % del de Saint-Venant (segundo orden, celdas de 50 m) y el retraso del pico a menos de 10 %; el volumen de la creciente se conserva (< 1 %)',
    measured: `Muskingum-Cunge / Saint-Venant: ${rows.join('; ')}`,
    pass: ok,
  });
}

// H33) Norma colombiana (Res. 0330 de 2017, RAS): valores leídos y verificaciones en las herramientas
{
  const ras = (r: { checks?: { name: string; ok: boolean }[] }, art: string) => r.checks?.find((c) => c.name.startsWith(RAS_SHORT) && c.name.includes(art));
  const values = RAS.pluvialDmin === 0.26 && RAS.pluvialTauMin === 2 && RAS.vmax === 5 && RAS.vmaxSpecial === 10 && RAS.fillMax === 0.93 && RAS.closedFill === 0.9 && RAS.concreteVmax === 5 && RAS.linedVmin === 0.75;
  const tables = RAS_TABLA16.map((r) => r.T).join(',') === '3,5,5,10,50,100,100' && RAS_TABLA17.map((r) => r.T).join(',') === '25,50,100' && canalReturnPeriod(500) === 50 && canalReturnPeriod(1500) === 100;
  // canal de concreto: muy pendiente (V > 5 m/s), normal y casi plano (V < 0,75 m/s)
  const fast = calcCanal({ forma: 'rect', b: 1, material: 'concreto', S: 8, Q: 6 });
  const mid = calcCanal({ forma: 'rect', b: 2, material: 'concreto', S: 0.2, Q: 3 });
  const slow = calcCanal({ forma: 'rect', b: 4, material: 'concreto', S: 0.002, Q: 0.5 });
  const earth = calcCanal({ forma: 'trap', b: 2, z: 1.5, material: 'tierra', S: 0.1, Q: 2 });
  // tubo pluvial: 200 mm (no cumple el Art. 148) y 600 mm casi plano (no cumple autolimpieza del Art. 149)
  const small = calcCanal({ forma: 'circ', D: 0.2, material: 'concreto', S: 1, Q: 0.01 });
  const flat = calcCanal({ forma: 'circ', D: 0.6, material: 'concreto', S: 0.02, Q: 0.05 });
  const good = calcCanal({ forma: 'circ', D: 0.6, material: 'concreto', S: 1, Q: 0.2 });
  const pc = preCanal({ Q: 4, material: 'concreto', S: 0.1, forma: 'trap', z: 1.5, fb: 20 });
  const pz = prePozo({ Q: 12, b: 4, H: 6, loss: 10, fs: 1.1 });
  const pu = prePozoUSBR({});
  const ok =
    values && tables &&
    ras(fast, 'num. 4')?.ok === false && ras(mid, 'num. 4')?.ok === true && ras(mid, 'num. 5')?.ok === true && ras(slow, 'num. 5')?.ok === false &&
    !ras(earth, 'num. 4') && !ras(earth, 'num. 5') && !!ras(earth, 'num. 1') &&
    ras(small, 'Art. 148')?.ok === false && ras(flat, 'Art. 149')?.ok === false && [148, 149, 150, 151].every((a) => ras(good, `Art. ${a}`)?.ok === true) &&
    !!ras(pc, 'num. 4') && ras(pz, 'Art. 159')?.ok === true && ras(pu, 'Art. 159')?.ok === true;
  record({
    id: 'H33',
    name: 'Norma colombiana: criterios de la Resolución 0330 de 2017 (RAS) con su artículo en las herramientas de diseño',
    tolerance: 'valores iguales a los leídos en el texto oficial (Arts. 135 y 138 con las Tablas 16 y 17; Arts. 148 a 152 y 159); un canal de concreto con más de 5 m/s no cumple el Art. 152 num. 4 y uno con menos de 0,75 m/s no cumple el num. 5; un canal en tierra no recibe esos dos (no es revestido); un tubo de 200 mm no cumple el Art. 148 y uno casi plano no cumple la autolimpieza del Art. 149; un tubo bien escogido cumple los Arts. 148 a 151; los pozos dejan el agua en régimen subcrítico (Art. 159)',
    measured: `concreto rápido ${(fast.checks?.find((c) => c.name.includes('num. 4'))?.value) ?? '—'}; lento ${(slow.checks?.find((c) => c.name.includes('num. 5'))?.value) ?? '—'}; tubo 200 mm ${ras(small, 'Art. 148')?.ok ? 'cumple' : 'no cumple'}; tubo casi plano ${(flat.checks?.find((c) => c.name.includes('Art. 149')) as { value?: string } | undefined)?.value ?? '—'}; tubo de 600 mm al 1 %: ${[148, 149, 150, 151].map((a) => (ras(good, `Art. ${a}`)?.ok ? 'cumple' : 'no')).join(', ')}; pozos ${ras(pz, 'Art. 159')?.ok && ras(pu, 'Art. 159')?.ok ? 'subcríticos' : 'NO'}`,
    pass: ok,
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

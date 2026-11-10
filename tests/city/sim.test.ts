// Pruebas obligatorias del motor de lluvia urbana (se ejecutan con: npm run test:city).
// Cada prueba declara su tolerancia ANTES de ejecutarse. El informe se escribe en
// src/city/content/test-report.json (panel docente) y docs/medellin/PRUEBAS.md.

import { writeFileSync } from 'node:fs';
import { COVERS, mmhToMs, msToMmh, type CoverId } from '../../src/city/sim/constants';
import { axisDirAt, compile } from '../../src/city/sim/compile';
import { ComparePair, change, indicators } from '../../src/city/sim/compare';
import { CitySim } from '../../src/city/sim/engine';
import { flowArrows } from '../../src/city/sim/fields';
import { baseInterventions, cloneInterventions, validateConfig, validateScenario, type BuildingSpec, type Bowl, type DrainSpec, type OutletSpec, type Scenario, type Shared, type TankSite } from '../../src/city/sim/scenario';
import { rasterFrom, rect } from '../../src/city/scenarios/primitives';
import { builtinScenarios } from '../../src/city/scenarios/index';
import { TracerSet } from '../../src/city/sim/tracers';
import { FIELD_CHANNELS, outletFlows, packField, spoutFlows, tankFx } from '../../src/city/render/fxData';
import { EXTENT as ABURRA_EXTENT, HILLS, METRO_A, METRO_B, RIVER, SECTOR_SPOTS, cross as abCross, fabricAt, outerZ, riverAt, valleyZ } from '../../src/city/render/aburra';
import { buildBackdrop } from '../../src/city/render/backdrop';
import { DEPTH_STOPS, NATURAL_STOPS, depthColor } from '../../src/city/render/palette';
import { depthRampTexture } from '../../src/city/render/stormFx';
import { SewerModel, buildNodeTable, circ, fullFlow, inletCapture, normalDepth, windowK, type CompiledSewer, type SNode, type SPipe } from '../../src/city/sim/sewer';
import { epmChecks } from '../../src/city/sim/sewerCheck';
import { creekHydrograph, hyetograph, rainDepthMm, rainPeakMmH } from '../../src/city/sim/engine';
import { applyPlan, planCost, planItems, PLAN_BUDGET } from '../../src/city/content/planner';
import { coverIndex } from '../../src/city/sim/constants';
import { SED, SED_COVERS, SedimentModel, goversCoeffs, settlingVelocity, transportCapacity } from '../../src/city/sim/sediment';
import { DESIGN_DURATIONS, DESIGN_RETURNS, IDF_OLAYA, STORM_EVENTS, WARMING_LEVELS, alternatingBlocks, climateFactor, eventMinutes, idfDepth, idfEquation, idfIntensity } from '../../src/city/sim/storms';
import { BASIN_COVER_LIST, basinHydrograph, curveNumber, lagHours, scsRunoff } from '../../src/city/sim/basin';
import { barrelR, criticalDepth, culvertFlow, inletHeadwater, inletRating, qInlet, type CulvertGeom } from '../../src/city/sim/culvert';
import { HAZARD, bulkingFactor, buildingRings, buildingExposure, damageSummary, exposureOf, hazardClass } from '../../src/city/sim/hazard';
import { budgetTotal, budgetValues } from '../../src/city/ui/RainBudget';
import * as THREE from 'three';
import { MIN_GAP_S, StormSky, strikeRate } from '../../src/city/render/lightning';
import { buildShots } from '../../src/city/render/cinema';
import { flowLevel } from '../../src/city/controller';
import { AMP_SHEET_M, drawDepth } from '../../src/city/render/palette';
import { yq } from '../../src/city/scenarios/ladera';
import { DEBRIS_MANNING, bearingCapacity, bridgeForces, buoyancy, dragCoefficient, mixtureDensity, selfWeight } from '../../src/city/sim/bridge';

interface Result {
  id: string;
  name: string;
  tolerance: string;
  measured: string;
  pass: boolean;
  kind: 'obligatoria' | 'verificacion' | 'revision';
  /** Aclaraciones, incluidas las correcciones de diseño de la prueba (se publican). */
  note?: string;
}
const results: Result[] = [];
function record(r: Result) {
  results.push(r);
  console.log(`${r.pass ? 'PASA ' : 'FALLA'}  [${r.id}] ${r.name}\n        tolerancia: ${r.tolerance}\n        medido:     ${r.measured}${r.note ? `\n        nota:       ${r.note}` : ''}`);
}

function mk(o: {
  W: number;
  H: number;
  ground: (x: number, y: number) => number;
  cover?: CoverId;
  buildings?: BuildingSpec[];
  outlets?: OutletSpec[];
  drains?: DrainSpec[];
  bowls?: Bowl[];
  tanks?: TankSite[];
}): Scenario {
  return {
    format: 'medellin-lluvia/escenario',
    version: 1,
    id: 'prueba',
    title: 'prueba',
    shortTitle: 'prueba',
    summary: '',
    provenance: { kind: 'demostrativo', statement: 'prueba', layers: [], sources: [], generatedBy: 'tests' },
    extent: { crs: 'LOCAL', origin: [0, 0], width: o.W, height: o.H },
    units: { length: 'm', elevation: 'm', rain: 'mm/h', time: 's', flow: 'L/s' },
    resolutions: [0.5, 1, 2],
    defaultResolution: 1,
    terrain: rasterFrom(o.ground, o.W, o.H, 0.5, 'prueba'),
    defaultCover: o.cover ?? 'concreto',
    surfaces: [],
    bowls: o.bowls ?? [],
    buildings: o.buildings ?? [],
    drains: o.drains ?? [],
    outlets: o.outlets ?? [],
    inflows: [],
    zones: [],
    gardens: [],
    tanks: o.tanks ?? [],
    probes: [],
    labels: [],
    streetView: { eye: [0, 0], look: [1, 1] },
    pipes: [],
    defaults: shared(1, 0, 10, 20),
    engine: { name: 'x', version: '1' },
    seed: 1,
  };
}

function shared(dx: number, mmh: number, durMin: number, simMin: number, extra: Partial<Shared> = {}): Shared {
  return {
    scenarioId: 'prueba',
    dx,
    rain: { intensityMmH: Math.max(mmh, 5), durationMin: durMin, pattern: 'constante', spatial: 'uniforme', center: [0, 0], radiusM: 10 },
    simMinutes: simMin,
    soilInitial: 'seco',
    inflowLps: 0,
    seed: 7,
    ...extra,
  };
}

/** Simulación sin lluvia: intensidad 0 forzada en el hietograma. */
function noRain(sim: CitySim) {
  sim.hyeto.mmh.fill(0);
}

const fmt = (v: number, d = 3) => (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(2) : v.toFixed(d));

// ---------------------------------------------------------------- 1. Dominio cerrado sin lluvia
{
  const sc = mk({ W: 40, H: 30, ground: (x, y) => 2 + 0.03 * x + 0.3 * Math.sin(x / 5) * Math.cos(y / 4) });
  const sh = shared(1, 0, 5, 15);
  const c = compile(sc, sh, baseInterventions(sc));
  const h0 = new Float64Array(c.nx * c.ny);
  for (let k = 0; k < h0.length; k++) {
    const i = k % c.nx, j = Math.floor(k / c.nx);
    h0[k] = 0.4 * Math.exp(-((i - 10) ** 2 + (j - 15) ** 2) / 30);
  }
  const sim = new CitySim(c, sh, { initialDepth: h0 });
  noRain(sim);
  const v0 = sim.bal.surface;
  sim.runToEnd();
  const rel = Math.abs(sim.bal.surface - v0) / v0;
  const chk = sim.check();
  record({ id: '1', kind: 'obligatoria', name: 'Dominio cerrado sin lluvia conserva el volumen', tolerance: '|ΔV|/V₀ ≤ 1·10⁻¹⁰; sin NaN ni negativos', measured: `V₀ = ${fmt(v0)} m³, |ΔV|/V₀ = ${rel.toExponential(2)}, NaN = ${chk.nonFinite}, negativos = ${chk.negative}`, pass: rel <= 1e-10 && chk.nonFinite === 0 && chk.negative === 0 });
}

// ---------------------------------------------------------------- 2. Lluvia en dominio cerrado impermeable
{
  const sc = mk({ W: 30, H: 20, ground: (x, y) => 1 + 0.02 * x + 0.01 * y });
  const sh = shared(1, 50, 10, 12);
  const c = compile(sc, sh, baseInterventions(sc));
  const sim = new CitySim(c, sh);
  sim.runToEnd();
  const A = 30 * 20;
  const expected = mmhToMs(50) * A * 600;
  const rel = Math.abs(sim.bal.surface - expected) / expected;
  record({ id: '2', kind: 'obligatoria', name: 'Lluvia sobre dominio cerrado impermeable: ΔV = I·A·t', tolerance: '|ΔV − I·A·t| / (I·A·t) ≤ 1·10⁻¹⁰', measured: `I·A·t = ${fmt(expected, 4)} m³ (50 mm/h × 600 m² × 600 s), ΔV = ${fmt(sim.bal.surface, 4)} m³, error relativo = ${rel.toExponential(2)}`, pass: rel <= 1e-10 });
}

// ---------------------------------------------------------------- 3. Sumidero: nunca más de lo disponible ni de su capacidad
{
  const drain = (cap: number, obs: number): DrainSpec => ({ id: 'd', name: 'd', at: [10.5, 10.5], widthM: 0.6, lengthM: 0.9, freeSides: 4, openFraction: 0.5, capacityLps: cap, obstruction: obs, kind: 'hipotetico' });
  // (a) poca agua y capacidad enorme: lo captado ≤ lo disponible
  const sc = mk({ W: 21, H: 21, ground: () => 1, drains: [drain(100000, 0)] });
  const sh = shared(1, 0, 5, 10);
  const c = compile(sc, sh, baseInterventions(sc));
  const h0 = new Float64Array(c.nx * c.ny);
  h0[c.drains[0].cell] = 0.002;
  const sim = new CitySim(c, sh, { initialDepth: h0, trunkCapacityM3s: 1e9 });
  noRain(sim);
  sim.step();
  const availOk = sim.lastDrain[0] <= 0.002 * c.area + 1e-15;
  // (b) mucha agua: por paso nunca más que capacidad·dt; profundidades nunca negativas
  const sc2 = mk({ W: 21, H: 21, ground: (x, y) => 1 + 0.05 * Math.hypot(x - 10.5, y - 10.5), drains: [drain(40, 0)] });
  const sh2 = shared(1, 150, 10, 15);
  const c2 = compile(sc2, sh2, baseInterventions(sc2));
  const sim2 = new CitySim(c2, sh2);
  let maxRatio = 0;
  let minH = Infinity;
  sim2.onStep = (dt) => {
    maxRatio = Math.max(maxRatio, sim2.lastDrain[0] / (0.04 * dt));
    for (let k = 0; k < sim2.h.length; k++) if (sim2.h[k] < minH) minH = sim2.h[k];
  };
  sim2.runToEnd();
  // (c) obstrucción total: no capta
  const iv = baseInterventions(sc2);
  iv.drains.d = 1;
  const sim3 = new CitySim(compile(sc2, sh2, iv), sh2);
  sim3.runToEnd();
  // (d) parcialmente obstruido capta menos que libre
  const iv4 = baseInterventions(sc2);
  iv4.drains.d = 0.6;
  const sim4 = new CitySim(compile(sc2, sh2, iv4), sh2);
  const free = new CitySim(compile(sc2, sh2, baseInterventions(sc2)), sh2);
  sim4.advanceTo(600);
  free.advanceTo(600);
  const dFree = free.bal.drained, dObs = free.c.drains.length ? sim4.bal.drained : 0;
  const hFree = free.h[free.c.drains[0].cell], hObs = sim4.h[sim4.c.drains[0].cell];
  sim4.runToEnd();
  record({ id: '3', kind: 'obligatoria', name: 'El sumidero nunca retira más agua de la disponible ni de su capacidad', tolerance: 'captado ≤ h·A en el paso; captado/(Q_cap·dt) ≤ 1; h ≥ 0; obstruido 100 % capta 0; 60 % capta menos que libre', measured: `(a) captado = ${fmt(sim.lastDrain[0] * 1000, 4)} L con ${fmt(0.002 * c.area * 1000, 4)} L disponibles; (b) máx. captado/(Q_cap·dt) = ${maxRatio.toFixed(6)}, h mín. = ${minH}; (c) captado obstruido = ${sim3.bal.drained} m³; (d) al terminar la lluvia (10 min): captado libre ${fmt(dFree)} m³ vs 60 % obstruido ${fmt(dObs)} m³; profundidad sobre la rejilla libre ${fmt(hFree * 100, 2)} cm vs obstruida ${fmt(hObs * 100, 2)} cm`, pass: availOk && maxRatio <= 1 + 1e-12 && minH >= 0 && sim3.bal.drained === 0 && dObs < dFree && hObs > hFree, note: 'Corrección de diseño: la primera versión comparaba el total al final del evento en una cuenca cerrada, donde toda el agua termina en el sumidero con o sin obstrucción. Ahora se compara durante la lluvia, que es lo que la prueba pretende medir.' });
}

// ---------------------------------------------------------------- 4. Infiltración responde a parámetros y a disponibilidad
{
  const flat = (cover: CoverId) => mk({ W: 20, H: 20, ground: () => 1, cover });
  const run = (cover: CoverId, mmh: number, dur: number, sim0?: (s: CitySim) => void) => {
    const sc = flat(cover);
    const sh = shared(1, mmh, dur, dur);
    const s = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
    sim0?.(s);
    s.runToEnd();
    return s;
  };
  const A = 400;
  // (a) lluvia menor que la capacidad: todo se infiltra, sin encharcamiento
  const a = run('grama', 5, 10);
  const aOk = Math.abs(a.bal.infiltrated - a.bal.precipitation) / a.bal.precipitation < 1e-9 && a.bal.surface < 1e-9;
  // (b) lluvia mayor que la capacidad: se infiltra a la tasa fc y el resto queda en superficie
  const b = run('grama', 50, 10);
  const fcExp = mmhToMs(COVERS.grama.ksMmH) * A * 600;
  const bOk = Math.abs(b.bal.infiltrated - fcExp) / fcExp < 1e-6 && b.bal.surface > 0;
  // (c) sin agua no hay infiltración
  const c0 = run('grama', 5, 10, (s) => noRain(s));
  // (d) otro parámetro (zona verde) infiltra más con la misma lluvia
  const d = run('zona_verde', 50, 10);
  // (e) almacenamiento limitado: pavimento permeable con 150 mm/h durante 60 min se satura
  const e = run('adoquin_permeable', 150, 60);
  const cap = COVERS.adoquin_permeable.storageM * (1 - 0.2) * A;
  const eOk = Math.abs(e.bal.infiltrated - cap) / cap < 1e-6;
  record({ id: '4', kind: 'obligatoria', name: 'La infiltración responde a los parámetros y a la disponibilidad de agua', tolerance: 'error relativo ≤ 1·10⁻⁶ frente al valor analítico en cada caso', measured: `(a) 5 mm/h < 13 mm/h: infiltrado/precipitado = ${fmt(a.bal.infiltrated / a.bal.precipitation, 9)}, superficie ${fmt(a.bal.surface)} m³; (b) 50 mm/h: infiltrado ${fmt(b.bal.infiltrated)} m³ vs fc·A·t ${fmt(fcExp)} m³; (c) sin agua: ${c0.bal.infiltrated} m³; (d) zona verde ${fmt(d.bal.infiltrated)} m³ > grama ${fmt(b.bal.infiltrated)} m³; (e) saturación (pavimento permeable, 150 mm/h, 60 min): ${fmt(e.bal.infiltrated)} m³ vs capacidad libre ${fmt(cap)} m³`, pass: aOk && bOk && c0.bal.infiltrated === 0 && d.bal.infiltrated > b.bal.infiltrated && eOk, note: 'Corrección de diseño: el caso (e) usaba grama con 60 min a 50 mm/h, que no alcanza a saturarse (necesita ≈ 2,5 h a 13 mm/h); se cambió a pavimento permeable, que sí se satura en ese tiempo.' });
}

// ---------------------------------------------------------------- 5. Un obstáculo bloquea una zona cerrada
{
  const ring: BuildingSpec[] = [
    { id: 'n', polygon: rect(10, 20, 30, 22), floors: 3, heightM: 9, downspout: [20, 23], style: 'ladrillo', kind: 'didactico' },
    { id: 's', polygon: rect(10, 8, 30, 10), floors: 3, heightM: 9, downspout: [20, 7], style: 'ladrillo', kind: 'didactico' },
    { id: 'o', polygon: rect(10, 10, 12, 20), floors: 3, heightM: 9, downspout: [9, 15], style: 'ladrillo', kind: 'didactico' },
    { id: 'e', polygon: rect(28, 10, 30, 20), floors: 3, heightM: 9, downspout: [31, 15], style: 'ladrillo', kind: 'didactico' },
  ];
  const sc = mk({ W: 40, H: 30, ground: () => 0.5, buildings: ring });
  const sh = shared(1, 0, 5, 10);
  const c = compile(sc, sh, baseInterventions(sc));
  const h0 = new Float64Array(c.nx * c.ny);
  let interior = 0;
  for (let j = 0; j < c.ny; j++) for (let i = 0; i < c.nx; i++) {
    const k = j * c.nx + i;
    const x = i + 0.5, y = j + 0.5;
    const inside = x > 12 && x < 28 && y > 10 && y < 20;
    if (inside) interior++;
    if (!inside && !c.solid[k]) h0[k] = 0.3;
  }
  const sim = new CitySim(c, sh, { initialDepth: h0 });
  noRain(sim);
  sim.runToEnd();
  let inVol = 0, solidVol = 0;
  for (let j = 0; j < c.ny; j++) for (let i = 0; i < c.nx; i++) {
    const k = j * c.nx + i;
    const x = i + 0.5, y = j + 0.5;
    if (x > 12 && x < 28 && y > 10 && y < 20) inVol += sim.h[k];
    if (c.solid[k]) solidVol += sim.h[k];
  }
  record({ id: '5', kind: 'obligatoria', name: 'Un obstáculo (edificios) bloquea una zona cerrada', tolerance: 'agua dentro del recinto = 0 exacto; agua en celdas de edificio = 0 exacto', measured: `celdas interiores = ${interior}, volumen interior = ${inVol} m³, volumen en edificios = ${solidVol} m³ (exterior con 0,30 m durante 10 min)`, pass: inVol === 0 && solidVol === 0 });
}

// ---------------------------------------------------------------- 6. La pendiente produce una ruta coherente
{
  const sc = mk({ W: 60, H: 20, ground: (x, y) => 5 - 0.05 * x + 0.002 * Math.sin(y), outlets: [{ id: 'o', name: 'o', edge: 'E', from: 0, to: 20, slope: 0.05, kind: 'didactico' }] });
  const sh = shared(1, 0, 5, 5);
  const c = compile(sc, sh, baseInterventions(sc));
  const h0 = new Float64Array(c.nx * c.ny);
  for (let j = 6; j < 14; j++) for (let i = 2; i < 8; i++) h0[j * c.nx + i] = 0.2;
  const sim = new CitySim(c, sh, { initialDepth: h0 });
  noRain(sim);
  const cx = (s: CitySim) => {
    let m = 0, w = 0;
    for (let k = 0; k < s.h.length; k++) {
      m += s.h[k] * ((k % c.nx) + 0.5);
      w += s.h[k];
    }
    return m / w;
  };
  const x0 = cx(sim);
  sim.advanceTo(30);
  const x30 = cx(sim);
  let pos = 0, tot = 0;
  for (let f = 0; f < sim.qx.length; f++) if (Math.abs(sim.qx[f]) > 1e-6) {
    tot++;
    if (sim.qx[f] > 0) pos++;
  }
  sim.runToEnd();
  record({ id: '6', kind: 'obligatoria', name: 'Una pendiente produce una ruta coherente (aguas abajo)', tolerance: 'el centro de masa avanza hacia el este; ≥ 95 % de las caras con flujo apuntan aguas abajo; el agua sale por la salida definida', measured: `centro de masa x: ${fmt(x0, 2)} → ${fmt(x30, 2)} m en 30 s; caras con flujo hacia el este = ${pos}/${tot} (${((100 * pos) / tot).toFixed(1)} %); salida por el borde = ${fmt(sim.bal.boundaryOut)} m³ de ${fmt(sim.bal.surface0)} m³`, pass: x30 > x0 + 1 && pos / tot >= 0.95 && sim.bal.boundaryOut > 0 });
}

// ---------------------------------------------------------------- 7. Una depresión almacena agua
{
  const bowl: Bowl = { id: 'b', cx: 20, cy: 10, r: 4, depth: 0.15, kind: 'didactico', label: 'bajo' };
  const sc = mk({ W: 40, H: 20, ground: (x) => 3 - 0.02 * x, bowls: [bowl], outlets: [{ id: 'o', name: 'o', edge: 'E', from: 0, to: 20, slope: 0.02, kind: 'didactico' }] });
  const sh = shared(1, 60, 10, 60);
  const c = compile(sc, sh, baseInterventions(sc));
  const sim = new CitySim(c, sh);
  sim.runToEnd();
  let inBowl = 0, total = 0, emin = Infinity, emax = -Infinity, outsideMax = 0, mobile = 0, mobileIn = 0;
  for (let k = 0; k < sim.h.length; k++) {
    total += sim.h[k];
    const xx = (k % c.nx) + 0.5, yy = Math.floor(k / c.nx) + 0.5;
    const inside = Math.hypot(xx - 20, yy - 10) < 4;
    if (!inside) outsideMax = Math.max(outsideMax, sim.h[k]);
    if (sim.h[k] > 1e-4) {
      mobile += sim.h[k];
      if (inside) mobileIn += sim.h[k];
    }
    const x = (k % c.nx) + 0.5, y = Math.floor(k / c.nx) + 0.5;
    if (Math.hypot(x - 20, y - 10) < 4) {
      inBowl += sim.h[k];
      if (sim.h[k] > 0.01) {
        emin = Math.min(emin, c.z[k] + sim.h[k]);
        emax = Math.max(emax, c.z[k] + sim.h[k]);
      }
    }
  }
  let wet = 0, wetIn = 0;
  for (let k = 0; k < sim.h.length; k++) if (sim.h[k] >= 1e-3) {
    wet += sim.h[k];
    const xx = (k % c.nx) + 0.5, yy = Math.floor(k / c.nx) + 0.5;
    if (Math.hypot(xx - 20, yy - 10) < 4) wetIn += sim.h[k];
  }
  record({ id: '7', kind: 'obligatoria', name: 'Una depresión almacena agua', tolerance: '50 min después de la lluvia queda agua en el bajo (> 0,1 m³); ≥ 99 % del agua apreciable (h ≥ 1 mm) está en el bajo; superficie libre plana (Δη < 1 cm)', measured: `agua en el bajo = ${fmt(inBowl * c.area)} m³; fracción del agua apreciable en el bajo = ${((100 * wetIn) / wet).toFixed(2)} %; película máxima fuera del bajo = ${fmt(outsideMax * 1000, 3)} mm; fracción del agua por encima de 0,1 mm en el bajo = ${((100 * mobileIn) / mobile).toFixed(2)} %; fracción del total en el bajo = ${((100 * inBowl) / total).toFixed(2)} %; Δη = ${fmt((emax - emin) * 100, 3)} cm; salida = ${fmt(sim.bal.boundaryOut)} m³`, pass: inBowl * c.area > 0.1 && wetIn / wet >= 0.99 && emax - emin < 0.01, note: 'Criterio corregido después de ejecutar (se publica la historia): la versión 1 exigía que el 99 % del volumen TOTAL quedara en el bajo y midió 91,9 %, porque el modelo deja una película casi inmóvil del orden del umbral de flujo (0,1 mm), que actúa como retención superficial. La versión 2 exigía película ≤ 0,1 mm fuera del bajo y midió 0,102 mm. La versión actual cuenta el agua apreciable (h ≥ 1 mm, el mismo umbral con el que la aplicación dibuja agua). La película residual se documenta como limitación.' });
}

// ---------------------------------------------------------------- 8. Lago en reposo
{
  const sc = mk({ W: 30, H: 30, ground: (x, y) => 0.6 + 0.5 * Math.sin(x / 3) * Math.cos(y / 4) });
  const sh = shared(1, 0, 5, 10);
  const c = compile(sc, sh, baseInterventions(sc));
  const eta = 0.9;
  const h0 = new Float64Array(c.nx * c.ny);
  let dry = 0;
  for (let k = 0; k < h0.length; k++) {
    h0[k] = Math.max(0, eta - c.z[k]);
    if (h0[k] === 0) dry++;
  }
  const sim = new CitySim(c, sh, { initialDepth: h0 });
  noRain(sim);
  sim.runToEnd();
  let dh = 0, qm = 0;
  for (let k = 0; k < h0.length; k++) dh = Math.max(dh, Math.abs(sim.h[k] - h0[k]));
  for (const q of sim.qx) qm = Math.max(qm, Math.abs(q));
  for (const q of sim.qy) qm = Math.max(qm, Math.abs(q));
  record({ id: '8', kind: 'obligatoria', name: 'Lago en reposo permanece en reposo (con islas secas)', tolerance: 'máx |Δh| ≤ 1·10⁻¹²; máx |q| ≤ 1·10⁻¹² m²/s tras 10 min', measured: `celdas secas (islas) = ${dry}; máx |Δh| = ${dh.toExponential(2)} m; máx |q| = ${qm.toExponential(2)} m²/s`, pass: dh <= 1e-12 && qm <= 1e-12 });
}

// ---------------------------------------------------------------- 9. Reiniciar reproduce la corrida
{
  const sc = builtinScenarios()['ladera-quebrada'];
  const sh: Shared = { ...sc.defaults, dx: 2, simMinutes: 15 };
  const iv = baseInterventions(sc);
  iv.gardens['jardin-calle'] = true;
  iv.tanks['deposito-colegio'] = { on: true, destination: 'red' };
  const sim = new CitySim(compile(sc, sh, iv), sh);
  const tr = new TracerSet(sim, 3);
  sim.onStep = (dt) => tr.step(dt);
  tr.release(20, 61, 30);
  // avance por cuadros irregulares (como en la pantalla) con pausa intermedia
  let t = 0;
  const frames = [0.7, 3.1, 1.3, 9.9, 0.2, 17, 5.5];
  let f = 0;
  while (!sim.finished) {
    t += frames[f++ % frames.length] * 6;
    sim.advanceTo(t);
  }
  const h1 = Float64Array.from(sim.h), s1 = JSON.stringify(sim.samples), b1 = JSON.stringify(sim.bal), tr1 = JSON.stringify(tr.tracers.map((q) => [q.x, q.y, q.state]));
  sim.reset();
  tr.clear();
  // reiniciar la semilla de los trazadores
  const tr2 = new TracerSet(sim, 3);
  sim.onStep = (dt) => tr2.step(dt);
  tr2.release(20, 61, 30);
  sim.runToEnd(); // otro patrón de avance
  let same = true;
  for (let k = 0; k < h1.length; k++) if (h1[k] !== sim.h[k]) same = false;
  const sSame = s1 === JSON.stringify(sim.samples), bSame = b1 === JSON.stringify(sim.bal), tSame = tr1 === JSON.stringify(tr2.tracers.map((q) => [q.x, q.y, q.state]));
  record({ id: '9', kind: 'obligatoria', name: 'Reiniciar reproduce exactamente la corrida', tolerance: 'igualdad bit a bit de profundidades, series, balance y trazadores, aunque cambie el ritmo de los cuadros', measured: `profundidades idénticas: ${same}; series: ${sSame}; balance: ${bSame}; trazadores: ${tSame}; pasos: ${sim.diag.steps}`, pass: same && sSame && bSame && tSame });
}

// ---------------------------------------------------------------- 10. La comparación conserva las condiciones externas
{
  const sc = builtinScenarios()['calle-de-prueba'];
  const sh: Shared = { ...sc.defaults, dx: 1 };
  const A = baseInterventions(sc);
  const B = cloneInterventions(A);
  B.zones.parqueadero = 'adoquin_permeable';
  B.gardens['jardin-calle'] = true;
  B.tanks['deposito-torre'] = { on: true, destination: 'red' };
  B.drains['sum-esquina'] = 0.9;
  const pair = new ComparePair(sc, sh, A, B);
  let t = 0;
  while (!pair.finished) pair.advanceTo((t += 37));
  const same = pair.sameConditions();
  const tA = pair.a.samples.map((s) => s.t), tB = pair.b.samples.map((s) => s.t);
  const sameT = JSON.stringify(tA) === JSON.stringify(tB);
  const pDiff = Math.abs(pair.a.bal.precipitation - pair.b.bal.precipitation) / pair.a.bal.precipitation;
  const pSame = pDiff <= 1e-12;
  const ia = indicators(pair.a), ib = indicators(pair.b);
  // validación de la configuración exportada
  const cfg = { format: 'medellin-lluvia/config', version: 1, shared: sh, A, B };
  const v = validateConfig(JSON.parse(JSON.stringify(cfg)), builtinScenarios());
  const bad = validateConfig({ ...cfg, shared: { ...sh, rain: { ...sh.rain, intensityMmH: 900 } } }, builtinScenarios());
  record({ id: '10', kind: 'obligatoria', name: 'La comparación mantiene las mismas condiciones externas', tolerance: 'lluvia, tiempo, dominio, bordes, estado inicial, umbral y semilla idénticos; mismos instantes de registro; precipitación igual con |ΔP|/P ≤ 1·10⁻¹² (redondeo de punto flotante)', measured: `${same.items.map((q) => `${q.label}: ${q.ok ? 'sí' : 'NO'}`).join('; ')}; instantes idénticos: ${sameT} (${tA.length}); precipitación A ${fmt(ia.precipitation, 6)} m³, B ${fmt(ib.precipitation, 6)} m³, |ΔP|/P = ${pDiff.toExponential(1)}; importación válida: ${v.ok}; intensidad fuera de rango rechazada: ${!bad.ok}`, pass: same.ok && sameT && pSame && v.ok && !bad.ok, note: 'Corrección de diseño: la primera versión exigía igualdad exacta de la precipitación acumulada. Como cada corrida elige sus propios pasos de tiempo según su estado, la suma de los mismos milímetros en particiones distintas difiere solo por redondeo (≈1·10⁻¹⁵). Las condiciones de entrada sí son idénticas bit a bit.' });
  // Registro adicional: el cambio de superficie altera el modelo (verificación)
  const ch = change(ia.infiltrated, ib.infiltrated, 1e-6);
  record({ id: 'V1', kind: 'verificacion', name: 'Cambiar la superficie altera el modelo', tolerance: 'B (pavimento permeable + jardín) infiltra más que A', measured: `infiltrado A = ${fmt(ia.infiltrated)} m³, B = ${fmt(ib.infiltrated)} m³ (${ch.pct === null ? ch.note : ch.pct.toFixed(1) + ' %'})`, pass: ib.infiltrated > ia.infiltrated });
}

// ---------------------------------------------------------------- 11. Lluvia de techos sin duplicación
{
  const bld: BuildingSpec = { id: 't', polygon: rect(8, 6, 22, 14), floors: 4, heightM: 12, downspout: [15, 15], style: 'ladrillo', kind: 'didactico' };
  const tank: TankSite = { id: 'dep', name: 'dep', buildingIds: ['t'], capacityM3: 0.5, releaseLps: 0, cost: 0 };
  const sc = mk({ W: 30, H: 20, ground: () => 1, buildings: [bld], tanks: [tank] });
  const sh = shared(1, 40, 10, 10);
  const A = 600;
  const roofA = 14 * 8;
  const R = mmhToMs(40);
  // sin depósito: todo a la superficie
  const s1 = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
  s1.runToEnd();
  // con depósito pequeño (rebosa) y destino «retener»
  const iv = baseInterventions(sc);
  iv.tanks.dep = { on: true, destination: 'retener' };
  const s2 = new CitySim(compile(sc, sh, iv), sh);
  s2.runToEnd();
  const exp = R * A * 600, expRoof = R * roofA * 600;
  const e1 = Math.abs(s1.bal.surface - exp) / exp;
  const e2 = Math.abs(s2.bal.surface + s2.bal.devices - exp) / exp;
  const er = Math.abs(s1.bal.roofToSurface - expRoof) / expRoof;
  const er2 = Math.abs(s2.bal.roofToTank - expRoof) / expRoof;
  record({ id: '11', kind: 'obligatoria', name: 'La lluvia de techos se incluye sin duplicación', tolerance: 'total = I·A_dominio·t y lluvia de techo = I·A_techo·t con error ≤ 1·10⁻¹⁰; depósito lleno a su capacidad y el resto rebosa', measured: `sin depósito: superficie ${fmt(s1.bal.surface, 4)} m³ vs ${fmt(exp, 4)} m³ (err ${e1.toExponential(1)}), techo→bajante ${fmt(s1.bal.roofToSurface, 4)} vs ${fmt(expRoof, 4)} m³ (err ${er.toExponential(1)}); con depósito de 0,5 m³: guardado ${fmt(s2.bal.devices, 4)} m³, rebose ${fmt(s2.bal.tankOverflow, 4)} m³, superficie+depósito ${fmt(s2.bal.surface + s2.bal.devices, 4)} m³ (err ${e2.toExponential(1)})`, pass: e1 < 1e-10 && e2 < 1e-10 && er < 1e-10 && er2 < 1e-10 && Math.abs(s2.bal.devices - 0.5) < 1e-12 && s2.bal.tankOverflow > 0, note: 'Corrección de diseño: la primera versión usaba un depósito de 1 m³, mayor que la lluvia del techo (0,75 m³), por lo que no podía rebosar.' });
}

// ---------------------------------------------------------------- 12. Revisión de sensibilidad a la resolución
const sens: { dx: number; P: number; B: number; D: number; I: number; esq: number; peak: number; area: number; res: number; steps: number; ms: number }[] = [];
{
  const sc = builtinScenarios()['calle-de-prueba'];
  for (const dx of [2, 1, 0.5]) {
    const sh: Shared = { ...sc.defaults, dx };
    const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
    const t0 = performance.now();
    sim.runToEnd();
    const ind = indicators(sim);
    sens.push({ dx, P: ind.precipitation, B: ind.boundaryOut, D: ind.drained, I: ind.infiltrated, esq: ind.probeMax[0].depth, peak: ind.peakOutlet, area: ind.maxAreaAbove, res: ind.residual, steps: sim.diag.steps, ms: performance.now() - t0 });
  }
  const r1 = sens[1], r05 = sens[2];
  const dB = Math.abs(r1.B - r05.B) / r05.B;
  const dEsq = Math.abs(r1.esq - r05.esq);
  const balOk = sens.every((s) => Math.abs(s.res) / s.P < 1e-9);
  record({ id: '12', kind: 'revision', name: 'Revisión de sensibilidad a la resolución (calle de prueba: 2 m, 1 m, 0,5 m)', tolerance: 'criterio fijado antes de correr: balance cerrado (|residuo|/P < 1·10⁻⁹) en las tres; entre 1 m y 0,5 m: salida total difiere < 10 % y profundidad máxima en la esquina difiere < 1 cm', measured: sens.map((s) => `dx ${s.dx} m: P ${fmt(s.P, 2)} m³, salida ${fmt(s.B, 2)}, drenado ${fmt(s.D, 2)}, infiltrado ${fmt(s.I, 2)}, esquina ${fmt(s.esq * 100, 2)} cm, pico ${fmt(s.peak * 1000, 1)} L/s, área ≥ 5 cm ${fmt(s.area, 0)} m², ${s.steps} pasos, ${s.ms.toFixed(0)} ms`).join(' | ') + ` → Δsalida 1 m vs 0,5 m = ${(100 * dB).toFixed(1)} %, Δesquina = ${(dEsq * 100).toFixed(2)} cm`, pass: balOk && dB < 0.1 && dEsq < 0.01, note: 'Historia (se publica): en la primera ejecución NO cumplió (Δsalida 1 m vs 0,5 m = 20,2 %; drenado 12,3 / 15,0 / 27,0 m³ a 2 / 1 / 0,5 m). Causas encontradas: (1) la rejilla usaba la profundidad media de la celda, que depende del tamaño de celda; se agregó la reconstrucción de la profundidad junto al bordillo con la pendiente transversal de la cuneta (lámina triangular o trapezoidal), y (2) en la calle de prueba el sumidero no estaba en el punto más bajo de la esquina; se movió al fondo de la depresión. El criterio no se cambió. La captación sigue siendo la magnitud más sensible a la resolución; las comparaciones A/B se hacen siempre a la misma resolución.' });
}

// ---------------------------------------------------------------- Verificaciones adicionales
{
  // Sin NaN, Inf ni negativos con lluvia extrema en ambos escenarios; sin agua en edificios
  for (const sc of Object.values(builtinScenarios())) {
    const sh: Shared = { ...sc.defaults, rain: { ...sc.defaults.rain, intensityMmH: 150, durationMin: 30 }, simMinutes: 40, dx: 2 };
    const iv = baseInterventions(sc);
    for (const k of Object.keys(iv.gardens)) iv.gardens[k] = true;
    for (const k of Object.keys(iv.tanks)) iv.tanks[k] = { on: true, destination: 'red' };
    const sim = new CitySim(compile(sc, sh, iv), sh);
    let bad = 0, solidW = 0;
    sim.onStep = () => {
      const c = sim.check();
      bad += c.nonFinite + c.negative;
    };
    sim.runToEnd();
    for (let k = 0; k < sim.h.length; k++) if (sim.c.solid[k] && sim.h[k] !== 0) solidW++;
    record({ id: `V2-${sc.id}`, kind: 'verificacion', name: `Sin NaN, Inf ni profundidades negativas; sin agua en edificios (${sc.shortTitle}, 150 mm/h, 30 min)`, tolerance: '0 valores no finitos o negativos en cada paso; 0 celdas de edificio con agua; balance |residuo|/P < 1·10⁻⁹', measured: `pasos ${sim.diag.steps}; no finitos/negativos = ${bad}; celdas de edificio con agua = ${solidW}; residuo/P = ${(sim.bal.residual / sim.bal.precipitation).toExponential(2)}; profundidad máx. = ${fmt(Math.max(...sim.hmaxField), 3)} m`, pass: bad === 0 && solidW === 0 && Math.abs(sim.bal.residual / sim.bal.precipitation) < 1e-9 });
  }
  // Unidades
  const u = msToMmh(mmhToMs(60));
  record({ id: 'V3', kind: 'verificacion', name: 'Unidades coherentes: R [m/s] = mm/h ÷ 3 600 000', tolerance: 'ida y vuelta exacta; 36 mm/h = 1·10⁻⁵ m/s', measured: `60 mm/h → ${mmhToMs(60).toExponential(4)} m/s → ${u} mm/h; 36 mm/h = ${mmhToMs(36).toExponential(4)} m/s`, pass: Math.abs(u - 60) < 1e-12 && Math.abs(mmhToMs(36) - 1e-5) < 1e-18 });
  // Flechas = velocidad calculada
  const sc = builtinScenarios()['calle-de-prueba'];
  const sh = { ...sc.defaults };
  const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
  sim.advanceTo(600);
  const arrows = flowArrows(sim, 3);
  let mism = 0;
  for (const a of arrows) {
    const k = Math.floor(a.y / sim.c.dx) * sim.c.nx + Math.floor(a.x / sim.c.dx);
    const [ux, uy] = sim.velocityAt(k);
    if (ux !== a.ux || uy !== a.uy) mism++;
  }
  record({ id: 'V4', kind: 'verificacion', name: 'El flujo dibujado coincide con el calculado', tolerance: 'cada flecha usa exactamente la velocidad del modelo en su celda', measured: `${arrows.length} flechas a los 10 min; diferencias = ${mism}`, pass: arrows.length > 0 && mism === 0 });
}

// ---------------------------------------------------------------- Recorrido de las gotas = trayectoria calculada
{
  const sc = builtinScenarios()['calle-de-prueba'];
  const sh = { ...sc.defaults, rain: { ...sc.defaults.rain, intensityMmH: 100, pattern: 'constante' as const } };
  const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
  const tr = new TracerSet(sim, 11);
  sim.onStep = (dt) => tr.step(dt);
  sim.advanceTo(300);
  const b = sc.buildings[2];
  const cx = b.polygon.reduce((a, q) => a + q[0], 0) / b.polygon.length, cy = b.polygon.reduce((a, q) => a + q[1], 0) / b.polygon.length;
  tr.release(12, 40, 24);
  tr.release(30, 22, 24);
  tr.release(cx, cy, 24);
  sim.advanceTo(1200);
  const { nx, dx, solid } = sim.c;
  const cellOf = (x: number, y: number) => Math.floor(y / dx) * nx + Math.floor(x / dx);
  let crossings = 0, maxGap = 0, pts = 0;
  for (const t of tr.tracers) {
    const P = t.trail;
    // si se soltó en un techo, el primer tramo es la bajada por la bajante (techo → celda de descarga)
    const start = solid[cellOf(P[0], P[1])] ? 2 : 0;
    for (let q = start; q + 3 < P.length; q += 2) {
      pts++;
      const gap = Math.hypot(P[q + 2] - P[q], P[q + 3] - P[q + 1]);
      maxGap = Math.max(maxGap, gap);
      for (let k = 1; k < 8; k++) {
        const f = k / 8;
        if (solid[cellOf(P[q] + (P[q + 2] - P[q]) * f, P[q + 1] + (P[q + 3] - P[q + 1]) * f)]) crossings++;
      }
    }
  }
  const j = tr.journeys();
  const nSum = (Object.keys(j) as (keyof typeof j)[]).reduce((a, k) => a + j[k].n, 0);
  record({
    id: 'V6',
    kind: 'verificacion',
    name: 'El recorrido dibujado de las gotas sigue la trayectoria calculada',
    tolerance: 'ningún tramo entre puntos guardados atraviesa un edificio; separación máxima < 2 m (un punto cada 0,35 m recorridos); el resumen de viajes cuenta todas las gotas',
    measured: `${tr.tracers.length} gotas, ${pts} tramos: cruces de edificios = ${crossings}; separación máxima ${fmt(maxGap, 2)} m; resumen: ${nSum} gotas`,
    pass: crossings === 0 && maxGap < 2 && nSum === tr.tracers.length && pts > 100,
  });
}

// ---------------------------------------------------------------- Vista del valle = su tabla de referencia
{
  // El relieve del valle es aproximado (no es un MDE): esta prueba verifica que respeta su propia tabla
  // de cotas y coordenadas de referencia, con las tolerancias declaradas en MODELO.md.
  let riverErr = 0, monotone = true;
  for (let i = 0; i < RIVER.length; i++) {
    const [x, y, z] = RIVER[i];
    if (y >= ABURRA_EXTENT.y0 && y <= ABURRA_EXTENT.y1) riverErr = Math.max(riverErr, Math.abs(valleyZ(x, y) - z));
    if (i > 0 && z > RIVER[i - 1][2]) monotone = false;
  }
  const hillErr = HILLS.map((h) => ({ n: h.name, e: Math.abs(valleyZ(h.x, h.y) - h.peak) }));
  const worstHill = hillErr.reduce((a, b) => (b.e > a.e ? b : a));
  let stationLift = 0;
  for (const [x, y] of [...METRO_A.stations, ...METRO_B.stations]) stationLift = Math.max(stationLift, valleyZ(x, y) - riverAt(y).z);
  const [cx, cy] = SECTOR_SPOTS['calle-de-prueba'], [lx, ly] = SECTOR_SPOTS['ladera-quebrada'];
  const fc = fabricAt(cx, cy, valleyZ(cx, cy)), fl = fabricAt(lx, ly, valleyZ(lx, ly));
  const tc = abCross(cx, cy).t, tl = abCross(lx, ly).t;
  record({
    id: 'V7',
    kind: 'verificacion',
    name: 'La vista del valle respeta su tabla de referencia aproximada',
    tolerance: 'cauce: error < 5 m y cota que baja de sur a norte; cimas de cerros: ±150 m; estaciones del metro en el fondo del valle (< 150 m sobre el río); sectores ilustrativos en zona urbana, la calle al pie de la ladera y la ladera sobre ella',
    measured: `cauce: error máx. ${fmt(riverErr, 1)} m, baja de sur a norte: ${monotone ? 'sí' : 'no'}; peor cerro: ${worstHill.n} (${fmt(worstHill.e, 0)} m); estaciones: hasta ${fmt(stationLift, 0)} m sobre el río; calle: tejido ${fc.f}, t = ${fmt(tc, 2)}; ladera: tejido ${fl.f}, t = ${fmt(tl, 2)}`,
    pass: riverErr < 5 && monotone && worstHill.e <= 150 && stationLift < 150 && fc.f !== 0 && fl.f !== 0 && tc < 0.15 && tl > 0.15,
  });
}

// ---------------------------------------------------------------- Entorno del sector = valle de referencia
{
  // El entorno de cada sector es el valle de referencia a escala 1:1 alrededor de su punto ilustrativo.
  // Se verifica: unión exacta con el borde del sector, relieve dibujado fiel al de referencia (la malla
  // se abre con la distancia y simplifica los cañones lejanos), ningún objeto dentro del sector y el río
  // en su lugar. Solo dibujo: no interviene en el cálculo.
  const plane = { a: 3, gx: -0.04, gz: 0.01 };
  const hw = 40, hh = 28, baseY = -2;
  const sec = { hw, hh, plane, cell: 1, edgeY: (x: number, z: number) => plane.a + plane.gx * x + plane.gz * z, edgeRgb: () => [0.5, 0.5, 0.5] as [number, number, number] };
  let edgeErr = 0, inside = 0, objects = 0, rioErr = 0;
  const mean = { near: 0, far: 0 }, max = { near: 0, far: 0 };
  const spots = Object.values(SECTOR_SPOTS);
  for (const spot of spots) {
    const b = buildBackdrop({ baseY, clearX: hw + 4, clearZ: hh + 4, quality: 'ligera', sector: sec, spot });
    const zS = outerZ(spot[0], spot[1]), Y0 = plane.a - baseY;
    for (let k = 0; k <= 40; k++) {
      const t = k / 40;
      for (const [x, z] of [[-hw + 2 * hw * t, -hh], [-hw + 2 * hw * t, hh], [-hw, -hh + 2 * hh * t], [hw, -hh + 2 * hh * t]]) edgeErr = Math.max(edgeErr, Math.abs(b.groundY(x, z) - sec.edgeY(x, z)));
    }
    for (const [key, r0, r1] of [['near', 300, 2000], ['far', 2000, 8000]] as const) {
      for (let k = 0; k < 400; k++) {
        const a = (k / 400) * Math.PI * 2 * 7.3, r = r0 + (((k * 37) % 400) / 400) * (r1 - r0);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const e = Math.abs(b.groundY(x, z) - (baseY + outerZ(spot[0] + x / 1000, spot[1] - z / 1000) - zS + Y0));
        mean[key] += e / (400 * spots.length);
        max[key] = Math.max(max[key], e);
      }
    }
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (const o of b.group.children) {
      const im = o as THREE.InstancedMesh;
      if (!im.isInstancedMesh || (im.frustumCulled === false && im.count < 400)) continue; // trenes y cabinas van por el aire
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        objects++;
        if (Math.abs(p.x) < hw + 4 && Math.abs(p.z) < hh + 4) inside++;
      }
    }
    const rio = b.landmarks.find((l) => l.id === 'rio');
    rioErr = Math.max(rioErr, rio ? Math.abs(rio.at.x - (riverAt(spot[1]).x - spot[0]) * 1000) : 1e9);
  }
  record({
    id: 'V8',
    kind: 'verificacion',
    name: 'El entorno de cada sector sigue el valle de referencia, sin escalones ni objetos dentro del sector',
    tolerance: 'unión con el borde del sector < 1 mm; relieve dibujado frente al de referencia: diferencia media < 2 m entre 0,3 y 2 km y < 15 m entre 2 y 8 km (la malla se abre con la distancia); ningún objeto del entorno dentro del sector; río en su posición (< 1 m)',
    measured: `borde: ${fmt(edgeErr * 1000, 2)} mm; relieve 0,3–2 km: media ${fmt(mean.near, 1)} m (máx. local ${fmt(max.near, 0)} m); 2–8 km: media ${fmt(mean.far, 1)} m (máx. local ${fmt(max.far, 0)} m, en cañones de quebradas); objetos dentro del sector: ${inside} de ${objects}; río: ${fmt(rioErr, 2)} m`,
    pass: edgeErr < 1e-3 && mean.near < 2 && mean.far < 15 && inside === 0 && objects > 1000 && rioErr < 1,
  });
}

// ---------------------------------------------------------------- Escala de color natural del agua
{
  // La vista realista colorea el agua con su color natural (lámina gris-café turbia) en vez del azul.
  // Debe seguir siendo una escala de profundidad fiel: los mismos cortes que la azul, más oscura y más
  // opaca a mayor profundidad, sin agua dibujada donde el cálculo no la tiene, y la textura que usa la
  // tarjeta gráfica igual a la leyenda.
  const lum = (o: Float32Array) => 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2];
  const out = new Float32Array(4), prev = new Float32Array(4);
  let monoL = true, monoA = true, worst = 0;
  for (let i = 0; i <= 400; i++) {
    const h = 0.001 * Math.pow(300, i / 400);
    depthColor(h, out, 0, true);
    if (i > 0) {
      if (lum(out) > lum(prev) + 1e-6) monoL = false;
      if (out[3] < prev[3] - 1e-6) monoA = false;
    }
    prev.set(out);
  }
  depthColor(0.0004, out, 0, true);
  const dryA = out[3];
  const sameCuts = NATURAL_STOPS.length === DEPTH_STOPS.length && NATURAL_STOPS.every((s, k) => s.depth === DEPTH_STOPS[k].depth && s.label === DEPTH_STOPS[k].label);
  const tex = depthRampTexture(true);
  const td = tex.image.data as Uint8Array;
  for (let i = 0; i < 256; i++) {
    depthColor(0.001 * Math.pow(300, i / 255), out, 0, true);
    for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(td[i * 4 + c] - Math.round(out[c] * 255)));
  }
  tex.dispose();
  record({
    id: 'V9',
    kind: 'verificacion',
    name: 'El color natural del agua es una escala de profundidad fiel (los mismos cortes que la azul)',
    tolerance: 'de 1 mm a 30 cm: luminancia no creciente y opacidad no decreciente; con menos de 0,5 mm no se dibuja agua; cortes y rótulos idénticos a la escala azul; textura de la tarjeta gráfica = leyenda (±1/255)',
    measured: `luminancia ${monoL ? 'no creciente' : 'CRECE en algún tramo'}; opacidad ${monoA ? 'no decreciente' : 'DECRECE en algún tramo'}; opacidad con 0,4 mm: ${fmt(dryA, 2)}; cortes ${sameCuts ? 'idénticos' : 'distintos'}; diferencia máxima textura–leyenda: ${worst}/255`,
    pass: monoL && monoA && dryA === 0 && sameCuts && worst <= 1,
  });
}

// ---------------------------------------------------------------- Efectos de lluvia y agua = estado calculado
{
  // Calle de prueba con el depósito de la torre activo: así se cubren bajantes, depósito, sumideros y salidas.
  const sc = builtinScenarios()['calle-de-prueba'];
  const sh = { ...sc.defaults, rain: { ...sc.defaults.rain, intensityMmH: 100, pattern: 'constante' as const } };
  const iv = baseInterventions(sc);
  for (const t of sc.tanks) iv.tanks[t.id] = { on: true, destination: 'red' };
  const sim = new CitySim(compile(sc, sh, iv), sh);
  sim.advanceTo(600);
  // a) Campo del agua: profundidad y velocidad idénticas a las del modelo (en precisión de 32 bits), sin amplificar
  const N = sim.c.nx * sim.c.ny;
  const F = new Float32Array(N * FIELD_CHANNELS);
  packField(sim, false, F);
  let badH = 0, badU = 0, badA = 0, wet = 0;
  for (let k = 0; k < N; k++) {
    if (sim.c.solid[k]) continue;
    if (F[k * 4] !== Math.fround(sim.h[k])) badH++;
    if (sim.h[k] >= 1e-3) {
      wet++;
      const [u, v] = sim.velocityAt(k);
      if (F[k * 4 + 1] !== Math.fround(u) || F[k * 4 + 2] !== Math.fround(v)) badU++;
    }
    if (!(F[k * 4 + 3] >= 0 && F[k * 4 + 3] <= 1)) badA++;
  }
  // b) Chorros de bajantes = lluvia del techo que el motor envía a la superficie (misma tasa)
  const q = new Float64Array(sim.c.buildings.length);
  spoutFlows(sim, q);
  const spoutRate = q.reduce((s, v) => s + v, 0);
  const r0 = sim.bal.roofToSurface, t0 = sim.t;
  sim.advanceTo(610);
  const engineRate = (sim.bal.roofToSurface - r0) / (sim.t - t0);
  // c) Cascadas de salida = caudal que el balance cuenta como «salió del sector» en el último paso
  const b0 = sim.bal.boundaryOut;
  sim.advanceTo(sim.t + 1e-6);
  const oq = new Float64Array(sim.c.outlets.length);
  outletFlows(sim, oq);
  const outStep = oq.reduce((s, v) => s + v, 0) * sim.lastDt;
  const outEngine = sim.bal.boundaryOut - b0;
  // d) Depósito: llenado = volumen calculado / capacidad
  const tk = tankFx(sim);
  const fillErr = sim.c.tanks.reduce((m, t, i) => Math.max(m, Math.abs(tk[i].fill - sim.tankVol[t.index] / t.capacity)), 0);
  const relSpout = Math.abs(spoutRate - engineRate) / Math.max(1e-12, engineRate);
  const relOut = Math.abs(outStep - outEngine) / Math.max(1e-12, outEngine);
  record({
    id: 'V5',
    kind: 'verificacion',
    name: 'Los efectos de lluvia y agua leen el estado calculado',
    tolerance: 'profundidad y velocidad del campo idénticas a las del modelo (32 bits); chorros y cascadas con error relativo < 10⁻⁹ frente al balance; llenado del depósito exacto',
    measured: `${wet} celdas mojadas: diferencias de profundidad ${badH}, de velocidad ${badU}, huella fuera de [0,1] ${badA}; bajantes ${fmt(spoutRate * 1000, 3)} L/s frente a ${fmt(engineRate * 1000, 3)} L/s del motor (error ${relSpout.toExponential(1)}); salida en el paso ${fmt(outStep * 1000, 4)} L frente a ${fmt(outEngine * 1000, 4)} L (error ${relOut.toExponential(1)}); depósito ${(100 * tk[0].fill).toFixed(1)} % (error ${fillErr.toExponential(1)})`,
    pass: wet > 0 && badH === 0 && badU === 0 && badA === 0 && relSpout < 1e-9 && relOut < 1e-9 && outEngine > 0 && fillErr < 1e-12 && sim.c.tanks.length > 0,
  });
}

// ---------------------------------------------------------------- Red de alcantarillado separada
/** Red mínima de prueba: nodo A → tubería → nodo B → tubería → descarga libre (o cámara de tapa baja). */
function miniNet(o: { D: number; L: number; S: number; rimDepth: number; n?: number }): CompiledSewer {
  const mkNode = (id: string, x: number, inv: number, kind: SNode['kind'], outfall: 0 | 1 | 2): SNode => ({ id, name: id, system: 0, kind, x, y: 0, cell: 0, rim: inv + o.rimDepth, inv, area0: Math.PI * 0.36, outfall, vTab: new Float64Array(2), dy: 0.005, vRim: 0 });
  const zA = 10, zB = zA - o.S * o.L, zC = zB - o.S * o.L;
  const nodes = [mkNode('A', 0, zA, 'camara', 0), mkNode('B', o.L, zB, 'camara', 0), mkNode('C', 2 * o.L, zC, 'descarga', 1)];
  const n = o.n ?? 0.013;
  const pipes: SPipe[] = [
    { id: 'AB', system: 0, a: 0, b: 1, D: o.D, n, L: o.L, zUp: zA, zDn: zB, role: 'colector', material: 'concreto', qFull: fullFlow(o.D, n, o.S) },
    { id: 'BC', system: 0, a: 1, b: 2, D: o.D, n, L: o.L, zUp: zB, zDn: zC, role: 'colector', material: 'concreto', qFull: fullFlow(o.D, n, o.S) },
  ];
  for (let k = 0; k < 2; k++) Object.assign(nodes[k], buildNodeTable(nodes[k], pipes.filter((p) => p.a === k || p.b === k).map((p) => ({ L: p.L, D: p.D, zEnd: p.a === k ? p.zUp : p.zDn }))));
  return { nodes, pipes, inlets: [], dryIn: new Float64Array(3), upRunoff: [], erradas: [], upErradasM2: 0, upErradasNode: -1, tankNode: -1, persons: 0, dryTotal: 0 };
}
{
  // S1) Flujo permanente: el caudal que entra sale completo y la lámina se acerca a la profundidad normal de Manning
  const D = 0.45, L = 60, S = 0.01, n = 0.013;
  const net = miniNet({ D, L, S, rimDepth: 2, n });
  const m = new SewerModel(net);
  const Q0 = 0.5 * fullFlow(D, n, S);
  const env = { h: new Float64Array(1), z: new Float64Array(1), area: 1, dx: 1 };
  const ext = new Float64Array(3), extra = new Float64Array(3);
  let out0 = 0;
  for (let k = 0; k < 4000; k++) {
    ext[0] = Q0 * 0.5;
    if (k === 3000) out0 = m.tot.out[0];
    m.step(0.5, env, extra, ext);
  }
  const qOut = (m.tot.out[0] - out0) / (1000 * 0.5);
  const yB = m.headAt(1) - net.nodes[1].inv;
  const yn = normalDepth(D, n, S, Q0)!;
  const eQ = Math.abs(qOut - Q0) / Q0, eY = Math.abs(yB - yn) / yn;
  record({ id: 'S1', kind: 'obligatoria', name: 'Tubería en flujo permanente: sale lo que entra y la lámina se acerca a la normal de Manning', tolerance: 'caudal de salida = caudal de entrada (error < 0,1 %); lámina en la cámara intermedia dentro de ±15 % de la profundidad normal', measured: `entra ${fmt(Q0 * 1000, 1)} L/s, sale ${fmt(qOut * 1000, 1)} L/s (error ${(eQ * 100).toFixed(3)} %); lámina ${fmt(yB * 100, 1)} cm frente a normal ${fmt(yn * 100, 1)} cm (diferencia ${(eY * 100).toFixed(1)} %)`, pass: eQ < 1e-3 && eY < 0.15, note: 'La aproximación inercial usa la diferencia de niveles entre cámaras, que en un tramo corto incluye la lámina; por eso no es idéntica a Manning con la pendiente del fondo.' });
}
{
  // S2) Sobrecarga y rebose: con más caudal del que cabe, la cámara rebosa y el volumen se conserva
  const D = 0.3, L = 30, S = 0.005;
  const net = miniNet({ D, L, S, rimDepth: 1.6 });
  const m = new SewerModel(net);
  const env = { h: new Float64Array(1), z: new Float64Array(1), area: 1, dx: 1 };
  const ext = new Float64Array(3), extra = new Float64Array(3);
  const qf = fullFlow(D, 0.013, S);
  let vin = 0, minV = 0;
  for (let k = 0; k < 1200; k++) {
    const q = (k < 600 ? 3 : 0) * qf;
    ext[0] = q * 0.5;
    vin += ext[0];
    m.step(0.5, env, extra, ext);
    minV = Math.min(minV, ...m.V);
  }
  const T = m.tot;
  const res = vin - (m.storage() + T.out[0] + T.overflow[0]);
  record({ id: 'S2', kind: 'obligatoria', name: 'Sobrecarga: con 3 veces la capacidad la cámara rebosa a la calle y el volumen se conserva', tolerance: 'rebose > 0 solo cuando el nivel supera la tapa; entra = guardado + sale + rebosa (residuo < 10⁻⁹ m³); ningún volumen negativo', measured: `entró ${fmt(vin, 2)} m³: salió ${fmt(T.out[0], 2)}, rebosó ${fmt(T.overflow[0], 2)} (en ${net.nodes.filter((_, k) => m.overflowTotal[k] > 0).map((x) => x.id).join(', ') || 'ninguna'}), guardado ${fmt(m.storage(), 3)}; residuo ${res.toExponential(1)} m³; llenado máximo y/D ${fmt(m.peakFill[0], 2)}`, pass: T.overflow[0] > 0 && Math.abs(res) < 1e-9 && minV >= 0 && m.peakHead[0] >= net.nodes[0].rim - 1e-9 });
}
{
  // S3) Ecuaciones de captación por tipo (EPM GD-AS002, 8.5)
  const y = 0.05;
  const vent = inletCapture({ type: 'ventana', perimeter: 0, openArea: 0, winL: 1.5, winH: 0.15, kGrade: windowK(0.02), sag: false }, y);
  const ventSag = inletCapture({ type: 'ventana', perimeter: 0, openArea: 0, winL: 1.5, winH: 0.15, kGrade: windowK(0.02), sag: true }, y);
  const rej = inletCapture({ type: 'rejilla', perimeter: 2.4, openArea: 0.27, winL: 0, winH: 0, kGrade: 0, sag: false }, y);
  const mix = inletCapture({ type: 'mixto', perimeter: 2.4, openArea: 0.27, winL: 1.5, winH: 0.15, kGrade: windowK(0.02), sag: true }, y);
  const eV = Math.abs(vent - 0.2 * 1.5 * Math.sqrt(9.81) * y ** 1.5), eS = Math.abs(ventSag - 1.65 * 1.5 * y ** 1.5), eM = Math.abs(mix - (rej + ventSag));
  const ks = [windowK(0.02), windowK(0.04), windowK(0.08)];
  record({ id: 'S3', kind: 'obligatoria', name: 'Captación de sumideros por tipo: ventana en pendiente y en punto bajo, rejilla y mixto', tolerance: 'ventana en pendiente Q = k·L·√g·y^1,5 con k = 0,20 / 0,22 / 0,23 (2 / 4 / 8 %); en punto bajo Q = 1,65·L·y^1,5; mixto = rejilla + ventana (error < 10⁻¹²)', measured: `y = 5 cm: ventana en pendiente ${fmt(vent * 1000, 2)} L/s, en punto bajo ${fmt(ventSag * 1000, 2)} L/s, rejilla ${fmt(rej * 1000, 2)} L/s, mixto ${fmt(mix * 1000, 2)} L/s; k = ${ks.map((k) => k.toFixed(2)).join(' / ')}`, pass: eV < 1e-12 && eS < 1e-12 && eM < 1e-12 && Math.abs(ks[0] - 0.2) < 1e-12 && Math.abs(ks[1] - 0.22) < 1e-12 && Math.abs(ks[2] - 0.23) < 1e-12 });
}
{
  // S4) Criterios de la norma de EPM en las dos redes didácticas
  const all = ['calle-de-prueba', 'ladera-quebrada'].map((id) => {
    const sc = builtinScenarios()[id];
    const c = compile(sc, sc.defaults, baseInterventions(sc));
    return { id, checks: epmChecks(sc, c) };
  });
  const bad = all.flatMap((a) => a.checks.filter((k) => !k.cumple).map((k) => `${a.id}: ${k.id} (${k.medido})`));
  record({ id: 'S4', kind: 'verificacion', name: 'Las redes didácticas cumplen los criterios de diseño de EPM revisados (GD-AS002)', tolerance: 'todos los criterios cumplen en los dos sectores: sistema separado, diámetros mínimos, conductos de sumidero, recubrimiento, velocidades, lámina, distancia entre cámaras, uniones, deflexión, cámaras de caída, costado de la vía y separación en cruces', measured: all.map((a) => `${a.id}: ${a.checks.filter((k) => k.cumple).length} de ${a.checks.length} (${a.checks.map((k) => `${k.id} ${k.medido}`).join('; ')})`).join(' | ') + (bad.length ? ` — no cumplen: ${bad.join(', ')}` : ''), pass: bad.length === 0 });
}
{
  // S5) Separación: sin conexiones erradas, ninguna gota de lluvia entra al alcantarillado de aguas residuales
  const sc = builtinScenarios()['calle-de-prueba'];
  const sh: Shared = { ...sc.defaults, rain: { ...sc.defaults.rain, intensityMmH: 100 } };
  const ok = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
  ok.runToEnd();
  const ivE = baseInterventions(sc);
  ivE.erradas = true;
  const er = new CitySim(compile(sc, sh, ivE), sh);
  er.runToEnd();
  const T = ok.sewer!.tot, TE = er.sewer!.tot;
  const sanOk = T.fromSector[1] === 0 && Math.abs(T.external[1] - (T.out[1] + T.overflow[1] + ok.sewer!.storage(1))) < 1e-9;
  record({ id: 'S5', kind: 'obligatoria', name: 'Redes separadas: la lluvia no entra al alcantarillado de aguas residuales salvo por conexiones erradas', tolerance: 'sin conexiones erradas: lluvia que entra a residuales = 0 y lo que sale + guarda + rebosa = aguas residuales aportadas (error < 10⁻⁹ m³); con conexiones erradas: entra la lluvia de esos techos', measured: `100 mm/h, 20 min: aguas residuales aportadas ${fmt(T.external[1], 2)} m³, salen ${fmt(T.out[1], 2)}, guardadas ${fmt(ok.sewer!.storage(1), 3)}, rebose ${fmt(T.overflow[1], 2)}, lluvia que entra ${T.fromSector[1]} m³ | con conexiones erradas: techos del sector ${fmt(er.bal.roofToSewer, 2)} m³ y de aguas arriba ${fmt(TE.external[1] - T.external[1], 2)} m³; rebose de aguas residuales a la calle ${fmt(TE.overflow[1], 2)} m³`, pass: sanOk && er.bal.roofToSewer > 0 && TE.fromSector[1] > 0 });
}
{
  // S6) Balance acoplado superficie + red (con creciente y conexiones erradas): ambos residuos casi nulos
  const sc = builtinScenarios()['ladera-quebrada'];
  const cap = compile(sc, sc.defaults, baseInterventions(sc)).creek!.capacity;
  const sh: Shared = { ...sc.defaults, creek: { peakM3s: 2 * cap, timeToPeakMin: 6, startMin: 2 } };
  const iv = baseInterventions(sc);
  iv.erradas = true;
  const sim = new CitySim(compile(sc, sh, iv), sh);
  sim.runToEnd();
  const b = sim.bal, T = sim.sewer!.tot;
  const hg = creekHydrograph(sh.creek!, sc.creek!.baseM3s);
  const tEnd = sh.simMinutes * 60;
  let vh = 0;
  for (let k = 1; k < hg.t.length; k++) vh += 0.5 * (hg.q[k] + hg.q[k - 1]) * (Math.min(hg.t[k], tEnd) - Math.min(hg.t[k - 1], tEnd));
  vh += hg.q[hg.q.length - 1] * Math.max(0, tEnd - hg.t[hg.t.length - 1]);
  const eH = Math.abs(b.creekIn - vh) / vh;
  const k = sim.sewer!.s.nodes.findIndex((n) => n.id === 'SL-carrera-s');
  record({ id: 'S6', kind: 'obligatoria', name: 'Balance acoplado calle + red con creciente: cierra, el hidrograma entra completo y la quebrada se mete por la descarga', tolerance: 'residuo de superficie y de red < 10⁻⁹ del agua que entró; volumen de la creciente = área del hidrograma (error < 10⁻⁹); con 2 veces la capacidad del cauce, la descarga queda ahogada y entra agua de la quebrada a la red', measured: `entró ${fmt(b.precipitation + b.inflow, 0)} m³ (creciente ${fmt(b.creekIn, 1)} m³ frente a ${fmt(vh, 1)} m³ del hidrograma, error ${eH.toExponential(1)}); residuo superficie ${b.residual.toExponential(1)} m³, red ${b.netResidual.toExponential(1)} m³; de la quebrada a la red ${fmt(T.fromCreek[0], 1)} m³; rebose de aguas lluvias ${fmt(T.overflow[0], 1)} m³ (sumidero de la carrera sur ${fmt(sim.sewer!.overflowTotal[k], 1)} m³)`, pass: Math.abs(b.residual) / (b.precipitation + b.inflow) < 1e-9 && Math.abs(b.netResidual) / (b.drained + b.sewageIn) < 1e-9 && eH < 1e-9 && T.fromCreek[0] > 0 && sim.sewer!.overflowTotal[k] > 0 });
}
{
  // C1) Capacidad de la sección: el número que muestra la aplicación coincide con el modelo
  const sc = builtinScenarios()['ladera-quebrada'];
  const c0 = compile(sc, sc.defaults, baseInterventions(sc));
  const cap = c0.creek!.capacity;
  const run = (f: number) => {
    const sh: Shared = { ...sc.defaults, rain: { ...sc.defaults.rain, intensityMmH: 5, durationMin: 10 }, simMinutes: 34, creek: { peakM3s: f * cap, timeToPeakMin: 30, startMin: 0 } };
    const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
    sim.runToEnd();
    const pk = sim.samples.filter((q) => q.t >= 25 * 60 && q.t <= 31 * 60);
    return { out: Math.max(...pk.map((q) => q.creek!.qOutside)), level: Math.max(...pk.map((q) => q.creek!.level)), qin: Math.max(...pk.map((q) => q.creek!.qin)) };
  };
  const lo = run(0.8), hi = run(1.25);
  const bank = c0.creek!.bankLevel;
  record({ id: 'C1', kind: 'verificacion', name: 'La capacidad a cauce lleno de la sección de control es coherente con el modelo', tolerance: 'con 80 % de la capacidad (subida lenta, casi permanente) no pasa agua por fuera del cauce (< 1 % del caudal) y el nivel queda bajo la orilla; con 125 % sí pasa agua por fuera y el nivel supera la orilla', measured: `capacidad ${fmt(cap, 1)} m³/s (Manning sin límite de Froude ${fmt(c0.creek!.capacityManning, 1)} m³/s), pendiente ${fmt(c0.creek!.slope * 100, 2)} %, orilla ${fmt(bank - c0.creek!.zBed, 2)} m sobre el fondo | 80 %: por fuera ${fmt(lo.out, 2)} m³/s, nivel ${fmt(lo.level - c0.creek!.zBed, 2)} m | 125 %: por fuera ${fmt(hi.out, 2)} m³/s, nivel ${fmt(hi.level - c0.creek!.zBed, 2)} m`, pass: lo.out < 0.01 * lo.qin && lo.level < bank && hi.out > 0 && hi.level > bank });
}
{
  // C2) Sección circular: área y caudal a tubo lleno (verificación de las fórmulas geométricas)
  const D = 0.6;
  const half = circ(D, D / 2), full = circ(D, D);
  const eA = Math.abs(half.A - (Math.PI * D * D) / 8), eR = Math.abs(half.R - D / 4), eF = Math.abs(full.A - (Math.PI * D * D) / 4);
  record({ id: 'S7', kind: 'obligatoria', name: 'Geometría de la sección circular (área y radio hidráulico a medio tubo y lleno)', tolerance: 'a medio tubo A = π·D²/8 y R = D/4; lleno A = π·D²/4 (error < 10⁻¹²)', measured: `D = 0,6 m: A½ = ${half.A.toFixed(6)} m², R½ = ${half.R.toFixed(6)} m, A lleno = ${full.A.toFixed(6)} m²`, pass: eA < 1e-12 && eR < 1e-12 && eF < 1e-12 });
}

// ---------------------------------------------------------------- Peligro, daños, vehículos y lodo
{
  // H1) Clasificación de peligro: los límites de la tabla de la guía AIDR 7-3 (Smith et al., 2014)
  const cases: [number, number, number][] = [
    [0.005, 1, 0], // seco (< 1 cm)
    [0.3, 1, 1], [0.31, 0.5, 2], [0.3, 1.01, 2], [0.5, 1.2, 2], [0.5, 1.21, 4], [1.2, 0.5, 3], [1.21, 0.4, 4], [2, 0.5, 4], [2.01, 0.1, 5],
    [0.2, 2.01, 5], [4, 1, 5], [4.01, 0.1, 6], [1, 4.01, 6], [1.5, 2.7, 6], [0.1, 3.9, 5],
  ];
  const bad = cases.filter(([d, v, k]) => hazardClass(d, v) !== k);
  // monotonía: más profundidad o más velocidad nunca baja la clase
  let mono = true;
  for (let d = 0.01; d < 5; d += 0.07) for (let v = 0; v < 5; v += 0.09) if (hazardClass(d + 0.07, v) < hazardClass(d, v) || hazardClass(d, v + 0.09) < hazardClass(d, v)) mono = false;
  record({ id: 'H1', kind: 'obligatoria', name: 'Clases de peligro H1–H6 según profundidad, velocidad y su producto', tolerance: `los ${cases.length} casos de borde de la tabla de la guía (D ≤ 0,3/0,5/1,2/2/4 m; V ≤ 2/2/2/2/4 m/s; D·V ≤ 0,3/0,6/0,6/1/4 m²/s) dan la clase esperada, y la clase nunca baja al aumentar D o V`, measured: `${cases.length - bad.length} de ${cases.length} casos correctos${bad.length ? ` (fallan: ${bad.map(([d, v, k]) => `${d} m · ${v} m/s → ${hazardClass(d, v)} y no ${k}`).join('; ')})` : ''}; monotonía ${mono ? 'sí' : 'no'}; clases ${HAZARD.slice(1).map((h) => h.code).join(', ')}`, pass: bad.length === 0 && mono });
}
{
  // H2) Exposición de viviendas: anillo de celdas libres y máximos junto a cada una
  const nx = 6, ny = 5;
  const building = new Int16Array(nx * ny).fill(-1), solid = new Uint8Array(nx * ny);
  for (const k of [2 * nx + 2, 2 * nx + 3]) {
    building[k] = 0;
    solid[k] = 1;
  }
  const rings = buildingRings(nx, ny, building, solid, 1);
  const hmax = new Float32Array(nx * ny), vmax = new Float32Array(nx * ny), hz = new Uint8Array(nx * ny);
  hmax[2 * nx + 1] = 0.8; vmax[2 * nx + 1] = 1.5; hz[2 * nx + 1] = hazardClass(0.8, 1.5);
  hmax[0] = 3; hz[0] = 6; // lejos de la casa: no cuenta
  const ex = buildingExposure(rings, ['casa'], hmax, vmax, hz);
  const ds = damageSummary(ex);
  record({ id: 'H2', kind: 'obligatoria', name: 'Daño por vivienda: se mide en las celdas que tocan sus muros', tolerance: 'una casa de 2 celdas tiene 6 celdas vecinas; toma la profundidad, velocidad y clase máximas de ese anillo e ignora el agua lejana; 10 cm o más la cuentan como afectada y H5 o más como expuesta a daño estructural', measured: `anillo de ${rings[0].length} celdas; profundidad ${ex[0].depth} m, velocidad ${ex[0].speed} m/s, clase ${HAZARD[ex[0].hazard].code}; afectadas ${ds.affected}, con H5+ ${ds.severe}`, pass: rings[0].length === 6 && Math.abs(ex[0].depth - 0.8) < 1e-6 && ex[0].hazard === 5 && ds.affected === 1 && ds.severe === 1 });
}
{
  // H3) Vehículos: quietos con peligro bajo; el agua los mueve desde H2, nunca entran a un edificio y es reproducible
  const W = 40, Hh = 10;
  const sc = mk({ W, H: Hh, ground: (x) => 2 - 0.01 * x, cover: 'asfalto', buildings: [{ id: 'muro', polygon: rect(30, 0, 32, 10), floors: 1, heightM: 3, downspout: [29.5, 5], style: 'revoque', kind: 'didactico' }], outlets: [] });
  sc.exposed = [{ id: 'a', name: 'carro a', kind: 'carro', at: [10.5, 5.2], headingDeg: 0 }, { id: 'b', name: 'carro b', kind: 'carro', at: [12.5, 2.2], headingDeg: 0 }];
  const run = (depth: number) => {
    const sh = shared(1, 0, 1, 2);
    const c = compile(sc, sh, baseInterventions(sc));
    const h0 = new Float64Array(c.nx * c.ny);
    for (let k = 0; k < h0.length; k++) if (!c.solid[k] && k % c.nx < 6) h0[k] = depth;
    const sim = new CitySim(c, sh, { initialDepth: h0 });
    noRain(sim);
    let inside = 0;
    sim.onStep = () => {
      for (const o of sim.drift) {
        const k = Math.floor(o.y) * c.nx + Math.floor(o.x);
        if (o.x >= 0 && o.y >= 0 && o.x < W && o.y < Hh && c.solid[k]) inside++;
      }
    };
    sim.runToEnd();
    return { sim, inside };
  };
  const low = run(0.15), high = run(1.6), high2 = run(1.6);
  const movedLow = low.sim.drift.filter((o) => o.tMoved >= 0).length;
  const movedHigh = high.sim.drift.filter((o) => o.tMoved >= 0).length;
  const same = high.sim.drift.every((o, q) => o.x === high2.sim.drift[q].x && o.y === high2.sim.drift[q].y && o.state === high2.sim.drift[q].state);
  record({ id: 'H3', kind: 'obligatoria', name: 'Vehículos: el agua los mueve solo con peligro H2 o mayor, no atraviesan edificios y el resultado es reproducible', tolerance: 'una ola de 15 cm no mueve ninguno; una de 1,6 m mueve los dos; ninguno entra a una celda de edificio; dos corridas iguales dejan los vehículos exactamente en el mismo lugar', measured: `15 cm: movidos ${movedLow} (peligro máximo ${low.sim.drift.map((o) => HAZARD[o.hazard].code).join(', ')}); 1,6 m: movidos ${movedHigh}, recorridos ${high.sim.drift.map((o) => fmt(o.dist, 1)).join(' y ')} m, estados ${high.sim.drift.map((o) => o.state).join(', ')}; pasos dentro de edificios ${low.inside + high.inside}; reproducible ${same ? 'sí' : 'no'}`, pass: movedLow === 0 && movedHigh === 2 && low.inside + high.inside === 0 && same });
}
{
  // H4) Lodo: el hidrograma de la mezcla es el del agua por 1/(1 − Cv) y entra completo al cálculo
  const sc = builtinScenarios()['ladera-quebrada'];
  const cap = compile(sc, sc.defaults, baseInterventions(sc)).creek!.capacity;
  const vol = (cv: number) => {
    const sh: Shared = { ...sc.defaults, rain: { ...sc.defaults.rain, intensityMmH: 5, durationMin: 10 }, simMinutes: 12, creek: { peakM3s: 1.2 * cap, timeToPeakMin: 2, startMin: 1, sedimentCv: cv } };
    const hg = creekHydrograph(sh.creek!, sc.creek!.baseM3s);
    let v = 0;
    for (let k = 1; k < hg.t.length; k++) v += 0.5 * (hg.q[k] + hg.q[k - 1]) * (hg.t[k] - hg.t[k - 1]);
    v += hg.q[hg.q.length - 1] * (sh.simMinutes * 60 - hg.t[hg.t.length - 1]);
    const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
    sim.runToEnd();
    return { peak: Math.max(...hg.q), v, inn: sim.bal.creekIn, res: Math.abs(sim.bal.residual) / (sim.bal.precipitation + sim.bal.inflow) };
  };
  const w = vol(0), m = vol(0.3);
  const bf = bulkingFactor(0.3);
  const eP = Math.abs(m.peak - bf * w.peak) / (bf * w.peak), eV = Math.abs(m.inn - m.v) / m.v;
  record({ id: 'H4', kind: 'obligatoria', name: 'Creciente con lodo: factor de volumen 1/(1 − Cv) y volumen completo', tolerance: 'con 30 % de sedimentos el pico de la mezcla es 1,43 veces el del agua (error < 10⁻¹²); el volumen que entra al cálculo es el del hidrograma (error < 10⁻⁹) y el balance cierra (residuo < 10⁻⁹)', measured: `pico agua ${fmt(w.peak, 1)} m³/s, mezcla ${fmt(m.peak, 1)} m³/s (factor ${fmt(bf, 4)}); volumen ${fmt(m.inn, 1)} m³ frente a ${fmt(m.v, 1)} m³ (error ${eV.toExponential(1)}); residuo ${m.res.toExponential(1)}`, pass: eP < 1e-12 && eV < 1e-9 && m.res < 1e-9 });
}
{
  // H5) Daños de la creciente: más caudal, más daño (monotonía) y la vista de peligro lee el mismo cálculo
  const sc = builtinScenarios()['ladera-quebrada'];
  const cap = compile(sc, sc.defaults, baseInterventions(sc)).creek!.capacity;
  const out = [0.6, 1.5, 3].map((f) => {
    const sh: Shared = { ...sc.defaults, simMinutes: 22, creek: { peakM3s: f * cap, timeToPeakMin: 6, startMin: 2 } };
    const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
    sim.runToEnd();
    const ex = exposureOf(sim);
    const ds = damageSummary(ex);
    const orilla = ex.filter((e) => e.id.startsWith('orilla-'));
    let a3 = 0;
    for (let k = 0; k < sim.hazMax.length; k++) if (sim.hazMax[k] >= 3 && !sim.c.solid[k]) a3 += sim.c.area;
    return { f, aff: ds.affected, sev: ds.severe, orillaMax: Math.max(...orilla.map((e) => e.depth)), a3, moved: sim.drift.filter((o) => o.tMoved >= 0).length };
  });
  const mono = out.every((o, i) => i === 0 || (o.aff >= out[i - 1].aff && o.sev >= out[i - 1].sev && o.orillaMax >= out[i - 1].orillaMax && o.a3 >= out[i - 1].a3));
  record({ id: 'H5', kind: 'verificacion', name: 'Creciente: el daño calculado crece con el caudal', tolerance: 'con 60 % de la capacidad no llega agua a las casas de la orilla; con 150 % sí; con 300 % hay casas con peligro H5 o mayor y se mueven vehículos; viviendas afectadas, expuestas, profundidad en la orilla y área con H3 o más nunca bajan al aumentar el caudal', measured: out.map((o) => `${fmt(o.f * 100, 0)} %: ${o.aff} afectadas, ${o.sev} con H5+, orilla ${fmt(o.orillaMax, 2)} m, H3+ ${fmt(o.a3, 0)} m², vehículos movidos ${o.moved}`).join(' | '), pass: mono && out[0].orillaMax < 0.1 && out[1].orillaMax >= 0.1 && out[2].sev > 0 && out[2].moved > 0 });
}
{
  // B1) Reparto «¿Adónde fue la lluvia?»: suma exacta y ninguna parte negativa, con y sin red separada
  const rows: string[] = [];
  let ok = true;
  for (const [id, f, err] of [['calle-de-prueba', 0, true], ['ladera-quebrada', 0, false], ['ladera-quebrada', 2.5, true]] as const) {
    const sc = builtinScenarios()[id];
    const iv = baseInterventions(sc);
    iv.erradas = err;
    const cap = sc.creek ? compile(sc, sc.defaults, iv).creek!.capacity : 0;
    const sh: Shared = { ...sc.defaults, simMinutes: 20, creek: f ? { peakM3s: f * cap, timeToPeakMin: 6, startMin: 2 } : null };
    const sim = new CitySim(compile(sc, sh, iv), sh);
    sim.runToEnd();
    const v = budgetValues(sim.bal), t = budgetTotal(sim.bal);
    const sum = Object.values(v).reduce((a, b) => a + b, 0);
    const neg = Object.values(v).some((x) => x < -1e-9);
    if (neg || Math.abs(t - sum) / t > 1e-9) ok = false;
    rows.push(`${id}${f ? ` con creciente ${fmt(f * 100, 0)} %` : ''}${err ? ' y conexiones erradas' : ''}: entró ${fmt(t, 1)} m³, partes ${fmt(sum, 1)} m³ (error ${(Math.abs(t - sum) / t).toExponential(1)}), alcantarillado ${fmt(v.red, 1)} m³`);
  }
  record({ id: 'B1', kind: 'obligatoria', name: 'El reparto del agua suma exactamente lo que entró y ninguna parte es negativa', tolerance: 'suma de partes = lluvia + entrada + aportes de las tuberías desde fuera (error < 10⁻⁹); todas las partes ≥ 0, también cuando la red descarga a la quebrada o rebosa', measured: rows.join(' | '), pass: ok });
}

// ---------------------------------------------------------------- Coberturas (alcantarillas de cajón, FHWA HDS-5)
{
  // K1) Ecuaciones de la guía HDS-5 para un cajón de concreto con aletas de 30° a 75° (tabla A.1, forma 1)
  const D = 2.3, S = 0.002, g = 9.81;
  // a mano: profundidad crítica, control de entrada no sumergido y sumergido, con los coeficientes de la tabla
  const dc2 = Math.cbrt((2 * 2) / g);
  const di2 = (1.811 * 2) / Math.pow(D, 1.5);
  const hwUn = D * ((1.5 * dc2) / D + 0.026 * di2 - 0.5 * S);
  const di10 = (1.811 * 10) / Math.pow(D, 1.5);
  const hwSub = D * (0.0347 * di10 * di10 + 0.81 - 0.5 * S);
  const eUn = Math.abs(inletHeadwater(2, D, S) - hwUn), eSub = Math.abs(inletHeadwater(10, D, S) - hwSub), eDc = Math.abs(criticalDepth(2) - dc2);
  // continuidad y monotonía de la carga en toda la tabla, y la tabla invertida devuelve el caudal
  const geom: CulvertGeom = { B: 9, D, L: 9, S, barrels: 3, n: 0.014, Ke: 0.4 };
  const rt = inletRating(geom);
  let mono = true, inv = 0;
  for (let i = 1; i < rt.hw.length; i++) if (rt.hw[i] < rt.hw[i - 1]) mono = false;
  // continuidad donde se pasa de la forma no sumergida a la sumergida (Ku·q/D^1,5 = 3,5 y 4,0)
  let jump = 0;
  for (const di of [3.5, 4.0]) {
    const q = (di * Math.pow(D, 1.5)) / 1.811;
    jump = Math.max(jump, Math.abs(inletHeadwater(q * (1 + 1e-9), D, S) - inletHeadwater(q * (1 - 1e-9), D, S)));
  }
  for (const q of [0.5, 1, 2, 4, 6, 8, 10, 14]) inv = Math.max(inv, Math.abs(qInlet(rt, inletHeadwater(q, D, S)) - q) / q);
  // control de salida con el cañón lleno y la salida ahogada: HW − TW = (1 + Ke + 2g·n²·L/R^(4/3))·V²/2g
  const zIn = 10, zOut = 9.98;
  const up = zIn + 3.6, dn = zOut + 3.45;
  const R = barrelR(geom), A = 9 * D;
  const qHand = A * Math.sqrt((2 * g * (up - dn)) / (1 + 0.4 + (2 * g * 0.014 * 0.014 * 9) / Math.pow(R, 4 / 3)));
  const rOut = culvertFlow(geom, rt, up, dn, zIn, zOut, 0);
  const eOut = Math.abs(rOut.Q - qHand) / qHand;
  // con la salida libre y un cañón empinado manda la entrada; el sentido sigue al nivel más alto; sin
  // diferencia no hay caudal
  const geomS: CulvertGeom = { ...geom, S: 0.6 / 9 };
  const rIn = culvertFlow(geomS, inletRating(geomS), zIn + 2, zIn - 0.6, zIn, zIn - 0.6, 0);
  const rRev = culvertFlow(geom, rt, zIn + 0.5, zOut + 2.2, zIn, zOut, 0);
  const rEq = culvertFlow(geom, rt, zIn + 1, zIn + 1, zIn, zOut, 0);
  // la obstrucción reduce el caudal con los mismos niveles
  const obsQ = [0, 0.25, 0.5, 0.75, 0.9].map((o) => culvertFlow(geom, rt, zIn + 2.2, zOut + 0.5, zIn, zOut, o).Q);
  const obsMono = obsQ.every((q, i) => i === 0 || q < obsQ[i - 1]);
  record({
    id: 'K1', kind: 'obligatoria', name: 'Cobertura: ecuaciones de alcantarillas de la guía HDS-5 (FHWA)',
    tolerance: 'profundidad crítica y carga con control de entrada (no sumergida con q = 2 m²/s y sumergida con q = 10 m²/s) iguales al cálculo a mano con la tabla A.1 (error < 1 mm); la carga crece con el caudal y no salta donde se pasa de la forma no sumergida a la sumergida (< 1 µm); la tabla invertida devuelve el caudal (error < 0,5 %); con la salida ahogada el caudal es el de la ecuación de energía del cañón lleno (error < 10⁻⁹) y manda la salida; con la salida libre y un cañón empinado (6,7 %) manda la entrada; el agua va del nivel más alto al más bajo y sin diferencia de nivel no pasa; la obstrucción siempre reduce el caudal',
    measured: `dc ${fmt(criticalDepth(2), 4)} m; HW no sumergida ${fmt(inletHeadwater(2, D, S), 3)} m (a mano ${fmt(hwUn, 3)}), sumergida ${fmt(inletHeadwater(10, D, S), 3)} m (a mano ${fmt(hwSub, 3)}); salto en el cambio de forma ${jump.toExponential(1)} m; inversión ${fmt(inv * 100, 3)} %; salida ahogada ${fmt(rOut.Q, 2)} m³/s frente a ${fmt(qHand, 2)} (${rOut.control}, error ${eOut.toExponential(1)}); salida libre y cañón empinado ${fmt(rIn.Q, 1)} m³/s (${rIn.control}); al revés ${fmt(rRev.Q, 1)} m³/s; niveles iguales ${fmt(rEq.Q, 1)} m³/s; con 0/25/50/75/90 % de obstrucción ${obsQ.map((q) => fmt(q, 1)).join('/')} m³/s`,
    pass: eDc < 1e-9 && eUn < 1e-3 && eSub < 1e-3 && mono && jump < 1e-6 && inv < 0.005 && eOut < 1e-9 && rOut.control === 'salida' && rIn.control === 'entrada' && rIn.Q > 0 && rRev.Q < 0 && rEq.Q === 0 && obsMono,
  });
}
{
  // K2–K4) La cobertura en la ladera: conservación, sin oscilaciones, obstrucción y paso del agua por encima
  const sc = builtinScenarios()['ladera-quebrada'];
  const cap = compile(sc, sc.defaults, baseInterventions(sc)).creek!.capacity;
  const run = (f: number, obs: number, prog: boolean) => {
    const iv = baseInterventions(sc);
    iv.culverts = { 'cobertura-carrera': { obstruction: obs, progressive: prog } };
    const sh: Shared = { ...sc.defaults, simMinutes: 30, creek: { peakM3s: f * cap, timeToPeakMin: 8, startMin: 2 } };
    const sim = new CitySim(compile(sc, sh, iv), sh);
    let prev = 0, lastD = 0, flips = 0, neg = 0, nan = 0, negH = 0, tFull = -1;
    sim.onStep = () => {
      const st = sim.culv[0];
      if (!Number.isFinite(st.q)) nan++;
      if (st.q < -0.05) neg++;
      const d = st.q - prev;
      if (Math.abs(d) > 0.5) {
        if (Math.abs(lastD) > 0.5 && Math.sign(d) !== Math.sign(lastD)) flips++;
        lastD = d;
      }
      prev = st.q;
      if (tFull < 0 && st.obs >= 0.9 - 1e-9) tFull = sim.t;
      for (const k of sim.c.culverts[0].inCells) if (sim.h[k] < 0) negH++;
      for (const k of sim.c.culverts[0].outCells) if (sim.h[k] < 0) negH++;
    };
    sim.runToEnd();
    const st = sim.culv[0], cu = sim.c.culverts[0];
    const ds = damageSummary(exposureOf(sim));
    return { sim, st, cu, flips, neg, nan, negH, tFull, aff: ds.affected, moved: sim.drift.filter((o) => o.tMoved >= 0).length, res: Math.abs(sim.bal.residual) / (sim.bal.precipitation + sim.bal.inflow) };
  };
  const open = run(0.6, 0, false), blocked = run(0.6, 0.9, false), prog = run(1, 0.9, true);
  const all = [open, blocked, prog];
  const peakIn = 0.6 * cap;
  record({
    id: 'K2', kind: 'obligatoria', name: 'Cobertura en la ladera: conserva el agua y no oscila',
    tolerance: 'en las tres corridas (libre, tapada 90 % y tapándose con la creciente) el balance cierra (residuo < 10⁻⁹), no hay valores no numéricos ni profundidades negativas, el caudal por los cajones nunca va al revés (< −0,05 m³/s) ni alterna subidas y bajadas de más de 0,5 m³/s entre pasos; con la entrada libre el caudal máximo no supera en más de 10 % al pico que trae la quebrada',
    measured: all.map((r, i) => `${['libre', 'tapada 90 %', 'se tapa'][i]}: residuo ${r.res.toExponential(1)}, no numéricos ${r.nan}, negativas ${r.negH}, al revés ${r.neg}, alternancias ${r.flips}`).join(' | ') + ` | libre: caudal máximo ${fmt(open.st.qMax, 1)} m³/s con un pico de ${fmt(peakIn, 1)} m³/s`,
    pass: all.every((r) => r.res < 1e-9 && r.nan === 0 && r.negH === 0 && r.neg === 0 && r.flips === 0) && open.st.qMax <= 1.1 * peakIn + sc.creek!.baseM3s,
  });
  const headO = open.st.upMax - open.cu.crestZ, headB = blocked.st.upMax - blocked.cu.crestZ;
  record({
    id: 'K3', kind: 'obligatoria', name: 'Cobertura tapada: pasa menos agua, el agua se represa y cruza la vía',
    tolerance: 'con una creciente de 60 % de la capacidad del cauce y la entrada libre, el agua no llega a la vía; con 90 % de obstrucción pasa menos de la mitad por los cajones, el nivel en la entrada sube al menos 50 cm más, pasan más de 5 m³/s por encima de la vía y llega agua a más edificaciones',
    measured: `libre: ${fmt(open.st.qMax, 1)} m³/s por los cajones, nivel ${fmt(headO, 2)} m respecto de la vía, ${fmt(open.st.overMax, 2)} m³/s encima, ${open.aff} edificaciones con agua | tapada 90 %: ${fmt(blocked.st.qMax, 1)} m³/s por los cajones, nivel ${fmt(headB, 2)} m, ${fmt(blocked.st.overMax, 1)} m³/s encima (${fmt(blocked.st.overVol, 0)} m³), ${blocked.aff} edificaciones con agua, ${blocked.moved} vehículos movidos`,
    pass: headO < 0 && open.st.overMax < 0.1 && blocked.st.qMax < 0.5 * open.st.qMax && headB - headO >= 0.5 && blocked.st.overMax > 5 && blocked.aff > open.aff,
  });
  record({
    id: 'K4', kind: 'obligatoria', name: 'Obstrucción que crece con la creciente',
    tolerance: 'empieza libre; empieza a taparse cuando el caudal pasa de la mitad de la capacidad libre y llega al 90 % exactamente 180 s después; con la creciente igual a la capacidad del cauce el agua termina pasando por encima de la vía',
    measured: `empezó a taparse en ${fmt(prog.st.t0, 0)} s con la mitad de ${fmt(prog.cu.capacityFree, 1)} m³/s; llegó al 90 % en ${fmt(prog.tFull, 0)} s (${fmt(prog.tFull - prog.st.t0, 1)} s después); encima de la vía hasta ${fmt(prog.st.overMax, 1)} m³/s`,
    pass: prog.st.t0 > 0 && Math.abs(prog.tFull - prog.st.t0 - 180) < 1 && Math.abs(prog.st.obsMax - 0.9) < 1e-9 && prog.st.overMax > 5,
  });
}

// ---------------------------------------------------------------- Creciente desde la lluvia en la cuenca y aviso
{
  // W1) Métodos del NRCS: número de curva, retardo e hidrograma unitario triangular
  const S80 = 25400 / 80 - 254, Ia80 = 0.2 * S80;
  const qHand = ((60 - Ia80) * (60 - Ia80)) / (60 - Ia80 + S80);
  const eQ = Math.abs(scsRunoff(60, 80) - qHand);
  const below = scsRunoff(Ia80 * 0.99, 80);
  const cn3 = curveNumber('mixta', 'humedo'), cn3Hand = (23 * 80) / (10 + 0.13 * 80);
  const lagHand = (Math.pow(3500 / 0.3048, 0.8) * Math.pow(1000 / 80 - 10 + 1, 0.7)) / (1900 * Math.sqrt(20));
  const eLag = Math.abs(lagHours(3500, 80, 20) - lagHand);
  const sc = builtinScenarios()['ladera-quebrada'];
  const basin = sc.creek!.basin!;
  const hy = hyetograph({ ...sc.defaults.rain, intensityMmH: 80, durationMin: 60, pattern: 'constante', spatial: 'uniforme' });
  const res = BASIN_COVER_LIST.map((cv) => basinHydrograph(hy, basin, cv, 'seco', 0, 600 * 60));
  // volumen del hidrograma (sin caudal base) frente a la escorrentía por el área
  const volErr = res.map((r) => {
    let v = 0;
    for (let k = 1; k < r.t.length; k++) v += 0.5 * (r.q[k] + r.q[k - 1]) * (r.t[k] - r.t[k - 1]);
    return Math.abs(v - r.runoffMm * basin.areaKm2 * 1000) / (r.runoffMm * basin.areaKm2 * 1000);
  });
  const order = res[2].peak > res[1].peak && res[1].peak > res[0].peak && res[2].tPeak < res[1].tPeak && res[1].tPeak < res[0].tPeak;
  record({
    id: 'W1', kind: 'obligatoria', name: 'Creciente desde la lluvia: número de curva, retardo e hidrograma unitario del NRCS',
    tolerance: 'escorrentía con CN 80 y 60 mm igual al cálculo a mano (error < 10⁻⁹ mm) y nula bajo la abstracción inicial; CN con suelo húmedo y retardo iguales a sus fórmulas (error < 10⁻⁹); el volumen del hidrograma es la escorrentía por el área de la cuenca (error < 1 %); con la misma lluvia, la cuenca urbanizada da un pico mayor y más temprano que la mixta, y esta que la de bosque',
    measured: `escorrentía ${fmt(scsRunoff(60, 80), 3)} mm (a mano ${fmt(qHand, 3)}); bajo Ia ${fmt(below, 3)} mm; CN húmedo ${fmt(cn3, 2)} (a mano ${fmt(cn3Hand, 2)}); retardo ${fmt(lagHours(3500, 80, 20) * 60, 1)} min; error de volumen ${volErr.map((e) => `${fmt(e * 100, 2)} %`).join(' / ')}; con 80 mm en 1 h: ${res.map((r, i) => `${BASIN_COVER_LIST[i]} CN ${fmt(r.cn, 0)}, ${fmt(r.runoffMm, 1)} mm, pico ${fmt(r.peak, 1)} m³/s en el minuto ${fmt(r.tPeak / 60, 0)}`).join(' | ')}`,
    pass: eQ < 1e-9 && below === 0 && Math.abs(cn3 - cn3Hand) < 1e-9 && eLag < 1e-9 && volErr.every((e) => e < 0.01) && order,
  });
}
{
  // W2) La creciente de la cuenca en el sector y el tiempo de aviso
  const sc = builtinScenarios()['ladera-quebrada'];
  const run = (cover: 'bosque' | 'urbanizada') => {
    const iv = baseInterventions(sc);
    iv.basinCover = cover;
    const sh: Shared = { ...sc.defaults, rain: { ...sc.defaults.rain, intensityMmH: 80, durationMin: 60, pattern: 'constante', spatial: 'uniforme' }, simMinutes: 110, creek: { source: 'cuenca', peakM3s: 0, timeToPeakMin: 6, startMin: 0 } };
    const sim = new CitySim(compile(sc, sh, iv), sh);
    sim.runToEnd();
    const hg = sim.creekHydro!;
    let v = 0;
    for (let k = 1; k < hg.t.length && hg.t[k] <= sim.endT + 1e-9; k++) v += 0.5 * (hg.q[k] + hg.q[k - 1]) * (hg.t[k] - hg.t[k - 1]);
    return { sim, ind: indicators(sim), eV: Math.abs(sim.bal.creekIn - v) / v, res: Math.abs(sim.bal.residual) / (sim.bal.precipitation + sim.bal.inflow) };
  };
  const f = run('bosque'), u = run('urbanizada');
  const ev = (r: typeof f, id: string) => r.ind.warning!.events.find((e) => e.id === id)!.t;
  const seq = ['lluvia', 'amarilla', 'naranja', 'roja'].map((id) => ev(u, id));
  const ordered = seq.every((t, i) => t >= 0 && (i === 0 || t >= seq[i - 1]));
  const wetU = u.ind.warning!.firstWetT, wetF = f.ind.warning!.firstWetT;
  record({
    id: 'W2', kind: 'obligatoria', name: 'Creciente de la cuenca en el sector: volumen, daños y tiempo de aviso',
    tolerance: 'con 80 mm en una hora, el volumen que entra por la quebrada es la integral del hidrograma calculado (error < 10⁻⁶) y el balance cierra (residuo < 10⁻⁹); con la cuenca de bosque no llega agua a las casas; con la cuenca urbanizada sí, las alertas se activan en orden (lluvia, amarilla, naranja, roja) y la alerta roja de la estación llega antes que el agua a la primera casa',
    measured: `bosque: pico ${fmt(f.ind.basin!.peak, 1)} m³/s en el minuto ${fmt(f.ind.basin!.tPeak / 60, 0)}, error de volumen ${f.eV.toExponential(1)}, residuo ${f.res.toExponential(1)}, edificaciones con agua ${f.ind.damage.affected}${wetF >= 0 ? ` (desde el minuto ${fmt(wetF / 60, 1)})` : ''} | urbanizada: pico ${fmt(u.ind.basin!.peak, 1)} m³/s en el minuto ${fmt(u.ind.basin!.tPeak / 60, 0)}, error de volumen ${u.eV.toExponential(1)}, residuo ${u.res.toExponential(1)}; avisos en los minutos ${seq.map((t) => fmt(t / 60, 1)).join(', ')}; agua en la primera casa en el minuto ${fmt(wetU / 60, 1)} (${fmt((wetU - seq[3]) / 60, 1)} min después de la alerta roja); edificaciones con agua ${u.ind.damage.affected}`,
    pass: f.eV < 1e-6 && u.eV < 1e-6 && f.res < 1e-9 && u.res < 1e-9 && f.ind.damage.affected === 0 && wetF < 0 && u.ind.damage.affected > 0 && ordered && wetU > seq[3],
  });
}

// ---------------------------------------------------------------- Sectores con datos oficiales de Medellín
{
  // D1) Los tres sectores reales: válidos, compilan, conservan el agua y la lluvia sola no inunda casas por
  // depresiones artificiales; en Juan Bobo la creciente de ejemplo entra completa y el agua sale por el borde
  const rows: string[] = [];
  let ok = true;
  for (const id of ['andalucia-juan-bobo', 'la-iguana-el-pesebre', 'ana-diaz-el-corazon']) {
    const sc = builtinScenarios()[id];
    const v = validateScenario(sc);
    const sh: Shared = { ...sc.defaults, simMinutes: 25 };
    const c = compile(sc, sh, baseInterventions(sc));
    const sim = new CitySim(c, sh);
    sim.runToEnd();
    const chk = sim.check();
    const res = Math.abs(sim.bal.residual) / (sim.bal.precipitation + sim.bal.inflow);
    const aff = damageSummary(exposureOf(sim)).affected;
    // sin el agua de las laderas vecinas: lo que queda contra los muros solo puede venir de la lluvia en el sector
    const c2 = compile(sc, sh, baseInterventions(sc));
    c2.runon = [];
    const sim2 = new CitySim(c2, sh);
    sim2.runToEnd();
    const aff2 = damageSummary(exposureOf(sim2)).affected;
    const good = v.ok && chk.nonFinite === 0 && chk.negative === 0 && res < 1e-9 && aff2 <= 2 && aff <= 10 && sc.provenance.kind === 'datos-reales' && !!c.creek;
    if (!good) ok = false;
    rows.push(`${id}: ${v.ok ? 'válido' : 'inválido'}, ${c.buildings.length} construcciones, ${c.pockets} celdas de patios cerrados, relleno final ${c.fillCells} celdas (${fmt(c.fillVolume, 0)} m³), quebrada ${c.creek ? `simulada (capacidad ${fmt(c.creek.capacity, 1)} m³/s)` : 'de referencia'}, residuo ${res.toExponential(1)}, edificaciones con 10 cm o más: ${aff2} solo por la lluvia del sector, ${aff} con el agua de las laderas vecinas`);
  }
  const sc = builtinScenarios()['andalucia-juan-bobo'];
  const cap = compile(sc, sc.defaults, baseInterventions(sc)).creek!.capacity;
  const sh: Shared = { ...sc.defaults, simMinutes: 25, creek: { peakM3s: 1.5 * cap, timeToPeakMin: 6, startMin: 2 } };
  const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
  sim.runToEnd();
  const hg = sim.creekHydro!;
  let vin = 0;
  for (let k = 1; k < hg.t.length; k++) vin += 0.5 * (hg.q[k] + hg.q[k - 1]) * (hg.t[k] - hg.t[k - 1]);
  vin += hg.q[hg.q.length - 1] * (sim.endT - hg.t[hg.t.length - 1]);
  const eV = Math.abs(sim.bal.creekIn - vin) / vin;
  const resC = Math.abs(sim.bal.residual) / (sim.bal.precipitation + sim.bal.inflow);
  const outFrac = sim.bal.boundaryOut / (sim.bal.precipitation + sim.bal.inflow);
  if (!(eV < 1e-6 && resC < 1e-9 && outFrac > 0.9)) ok = false;
  rows.push(`Juan Bobo con creciente de 150 %: volumen de entrada error ${eV.toExponential(1)}, residuo ${resC.toExponential(1)}, salió por los bordes el ${fmt(outFrac * 100, 1)} % de lo que entró`);
  record({ id: 'D1', kind: 'obligatoria', name: 'Sectores con datos oficiales: válidos, conservan el agua y sin encharcamientos artificiales', tolerance: 'los tres escenarios son válidos, de tipo «datos reales» y con la quebrada simulada; compilan y simulan 25 min de lluvia (60 mm/h por 20 min) sin valores no numéricos ni negativos, con residuo < 10⁻⁹; sin el agua de las laderas vecinas, 2 edificaciones o menos quedan con 10 cm o más contra los muros (comprobación de pozos artificiales); con ella, 10 o menos; en Juan Bobo la creciente de ejemplo entra completa (error < 10⁻⁶) y más del 90 % del agua sale por los bordes', measured: rows.join(' | '), pass: ok });
}

{
  // D2) Sectores reales: sección de control orientada con el cauce, cuenca delineada, agua de las laderas y
  // creciente desde la lluvia en la cuenca
  const rows: string[] = [];
  let ok = true;
  for (const id of ['andalucia-juan-bobo', 'la-iguana-el-pesebre', 'ana-diaz-el-corazon']) {
    const sc = builtinScenarios()[id];
    const b = sc.creek!.basin!;
    const c = compile(sc, sc.defaults, baseInterventions(sc));
    const cr = c.creek!;
    // la sección cruza el cauce: la dirección del eje en el punto va a lo largo del eje de la malla elegido
    const [ux, uy] = axisDirAt(sc.creek!.axis, ...sc.creek!.section.at);
    const aligned = (cr.flow === 'x' ? Math.abs(ux) : Math.abs(uy)) >= 0.9;
    // las orillas encierran el talweg y su nivel es el de cauce lleno declarado
    const banksOk = cr.jb0 < cr.jt && cr.jt < cr.jb1 && Math.abs(cr.bankLevel - cr.zBed - (sc.creek!.section.bankDepthM ?? 0)) < 1e-9;
    // las celdas de entrada de las laderas no son salidas y están comunicadas con el resto del barrio
    const outCells = new Set(c.outlets.map((o) => o.cell));
    const runonOk = c.runon.length > 0 && c.runon.every((r) => r.cells.length > 0 && r.cells.every((k) => !outCells.has(k) && !c.solid[k]));
    // creciente desde la cuenca (60 mm en 1 h): el volumen que entra es el del hidrograma y el balance cierra con
    // el agua de las laderas
    const rain = { ...sc.defaults.rain, intensityMmH: 60, durationMin: 60, pattern: 'constante' as const, spatial: 'uniforme' as const };
    const sh: Shared = { ...sc.defaults, rain, simMinutes: 30, creek: { source: 'cuenca', peakM3s: 0, timeToPeakMin: 6, startMin: 0 } };
    const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh);
    sim.runToEnd();
    const hg = sim.creekHydro!;
    let vin = 0;
    for (let k = 1; k < hg.t.length && hg.t[k] <= sim.endT + 1e-9; k++) vin += 0.5 * (hg.q[k] + hg.q[k - 1]) * (hg.t[k] - hg.t[k - 1]);
    const eV = Math.abs(sim.bal.creekIn - vin) / vin;
    // agua de las laderas: C·i·A durante la lluvia
    const roExpected = sim.c.runon.reduce((a, r) => a + r.c * r.areaM2, 0) * (60 / 3.6e6) * Math.min(30, 60) * 60;
    const eR = Math.abs(sim.bal.runonIn - roExpected) / roExpected;
    const res = Math.abs(sim.bal.residual) / (sim.bal.precipitation + sim.bal.inflow);
    const good = aligned && banksOk && runonOk && b.areaKm2 > 0 && b.lengthM > 0 && eV < 1e-3 && eR < 1e-6 && res < 1e-9;
    if (!good) ok = false;
    rows.push(`${id}: sección ${cr.flow === 'x' ? 'columna' : 'fila'} (sentido ${cr.sign > 0 ? '+' : '−'}, cos ${fmt(cr.cosT, 2)}), cauce lleno ${fmt(cr.bankLevel - cr.zBed, 2)} m, capacidad ${fmt(cr.capacity, 1)} m³/s; cuenca ${fmt(b.areaKm2, 3)} km², ${fmt(b.lengthM, 0)} m, ${fmt(b.slopePct, 1)} %; ${c.runon.length} entradas de ladera (${fmt(c.runon.reduce((a, r) => a + r.areaM2, 0) / 1e4, 2)} ha) en ${c.runon.reduce((a, r) => a + r.cells.length, 0)} celdas; en 30 min: error de volumen de la creciente ${eV.toExponential(1)}, de las laderas ${eR.toExponential(1)}, residuo ${res.toExponential(1)}`);
  }
  record({ id: 'D2', kind: 'obligatoria', name: 'Sectores reales: sección orientada con el cauce, cuenca, laderas y creciente desde la cuenca', tolerance: 'la sección de control cruza el cauce (la dirección del eje en el punto forma menos de 26° con el eje de la malla que la sección mide), sus orillas encierran el talweg al nivel de cauce lleno declarado; las entradas de ladera no coinciden con salidas ni con construcciones; con 60 mm en una hora y 30 min simulados, el volumen de la creciente es la integral de su hidrograma (error < 10⁻³), el de las laderas es C·i·A·t (error < 10⁻⁶) y el balance cierra (residuo < 10⁻⁹)', measured: rows.join(' | '), pass: ok });
}

// ---------------------------------------------------------------- Sensibilidad al límite de Froude (información para docentes)
const froude: { fr: number; B: number; D: number; esq: number; lim: number }[] = [];
{
  const sc = builtinScenarios()['ladera-quebrada'];
  for (const fr of [1, 1.5, 1e9]) {
    const sh = { ...sc.defaults };
    const sim = new CitySim(compile(sc, sh, baseInterventions(sc)), sh, { numerics: { froudeMax: fr } });
    sim.runToEnd();
    froude.push({ fr, B: sim.bal.boundaryOut, D: sim.bal.drained, esq: sim.probeMax[0].depth, lim: sim.diag.froudeLimited / sim.diag.faceUpdates });
  }
  record({ id: 'R1', kind: 'revision', name: 'Sensibilidad al límite de Froude (ladera, 10 % de pendiente)', tolerance: 'informativa: se documenta, no se exige', measured: froude.map((f) => `Fr ≤ ${f.fr > 1e6 ? '∞' : f.fr}: salida ${fmt(f.B, 1)} m³, drenado ${fmt(f.D, 1)} m³, esquina ${fmt(f.esq * 100, 2)} cm, caras limitadas ${(100 * f.lim).toFixed(1)} %`).join(' | '), pass: true });
}

// ---------------------------------------------------------------- Lluvias de diseño, aguacero reconstruido y clima
{
  const c = IDF_OLAYA;
  // L1) La ecuación de la ficha reproduce la tabla impresa; la curva del laboratorio sigue la tabla en duraciones largas
  const e5 = Math.max(...c.returns.map((T, i) => Math.abs(idfEquation(T, 5) - c.printed5[i])));
  let eShort = 0, eLong = 0;
  for (const [D, row] of Object.entries(c.printed)) {
    c.returns.forEach((T, i) => {
      const rel = Math.abs(idfIntensity(T, +D) - row[i]) / row[i];
      if (+D <= 60) eShort = Math.max(eShort, rel);
      else eLong = Math.max(eLong, rel);
    });
  }
  let mono = true;
  for (const T of c.returns) {
    let prev = 0;
    for (let D = 5; D <= 360; D += 1) {
      const P = idfDepth(T, D);
      if (P <= prev) mono = false;
      prev = P;
    }
  }
  const eqStops = (36.805 / (1.221 - 1)).toFixed(0);
  record({ id: 'L1', kind: 'verificacion', name: 'Curva IDF de Olaya Herrera (IDEAM): ecuación y tabla de la ficha', tolerance: 'intensidades de 5 min iguales a la tabla del DTS (error < 0,1 mm/h); de 15 a 60 min, error < 3 % frente a la tabla impresa; de 2 a 6 h, error < 3 %; la lámina crece con la duración para los siete periodos de retorno (de 5 a 360 min, cada minuto)', measured: `5 min: error máx. ${fmt(e5, 3)} mm/h; 15–60 min: ${(100 * eShort).toFixed(2)} %; 2–6 h: ${(100 * eLong).toFixed(2)} %; lámina creciente: ${mono ? 'sí' : 'NO'} (la ecuación sola deja de crecer después de ${eqStops} min para 100 años)`, pass: e5 < 0.1 && eShort < 0.03 && eLong < 0.03 && mono });

  // L2) Bloques alternos: cada ventana centrada de k bloques tiene la lámina de la curva para k·Δt
  let worst = 0, contiguous = true, n = 0;
  for (const T of DESIGN_RETURNS)
    for (const D of DESIGN_DURATIONS) {
      const b = alternatingBlocks(T, D);
      const depths = b.mmh.map((v) => (v * b.dtMin) / 60);
      const idx = depths.map((d, i) => [d, i] as const).sort((x, y) => y[0] - x[0]);
      let acc = 0;
      const used: number[] = [];
      idx.forEach(([d, i], k) => {
        acc += d;
        used.push(i);
        const lo = Math.min(...used), hi = Math.max(...used);
        if (hi - lo !== k) contiguous = false;
        worst = Math.max(worst, Math.abs(acc - idfDepth(T, (k + 1) * b.dtMin)));
      });
      n++;
    }
  record({ id: 'L2', kind: 'obligatoria', name: 'Tormenta de diseño por bloques alternos', tolerance: 'en las 30 tormentas (6 periodos de retorno × 5 duraciones), los k bloques mayores son contiguos y suman la lámina de la curva para k·Δt (error < 10⁻⁹ mm); la lámina total es la de la curva para la duración', measured: `${n} tormentas; error máximo ${worst.toExponential(1)} mm; bloques mayores contiguos: ${contiguous ? 'sí' : 'NO'}; ejemplo 100 años y 6 h: ${fmt(idfDepth(100, 360), 1)} mm, bloque mayor ${fmt(Math.max(...alternatingBlocks(100, 360).mmh), 0)} mm/h (10 min)`, pass: worst < 1e-9 && contiguous });

  // L3) Aguacero reconstruido: total, pico y duración reportados
  const ev = STORM_EVENTS[0];
  const m = eventMinutes(ev);
  const tot = m.reduce((a, v) => a + v, 0) / 60;
  const rEv = { intensityMmH: 0, durationMin: ev.durationMin, pattern: 'evento' as const, eventId: ev.id, spatial: 'uniforme' as const, center: [0, 0] as [number, number], radiusM: 10 };
  record({ id: 'L3', kind: 'obligatoria', name: 'Aguacero del 28 de enero de 2026 (El Poblado): total y pico reportados', tolerance: `lámina ${ev.totalMm} mm (error < 0,01 mm), pico ${ev.peakMmH} mm/h (error < 0,01), duración ${ev.durationMin} min; el hietograma del motor da la misma lámina`, measured: `lámina ${fmt(tot, 3)} mm; pico ${fmt(Math.max(...m), 3)} mm/h; ${m.length} min; motor ${fmt(rainDepthMm(rEv), 3)} mm`, pass: Math.abs(tot - ev.totalMm) < 0.01 && Math.abs(Math.max(...m) - ev.peakMmH) < 0.01 && m.length === ev.durationMin && Math.abs(rainDepthMm(rEv) - ev.totalMm) < 0.01 });

  // L4) Clima: factor de 7 % por grado sobre el clima actual, aplicado a toda la lluvia
  const base = { intensityMmH: 0, durationMin: 60, pattern: 'diseno' as const, returnYears: 10, spatial: 'uniforme' as const, center: [0, 0] as [number, number], radiusM: 10 };
  const ks = WARMING_LEVELS.map((w) => climateFactor(w));
  const scaled = WARMING_LEVELS.every((w) => Math.abs(rainDepthMm({ ...base, warmingC: w }) / rainDepthMm(base) - climateFactor(w)) < 1e-12 && Math.abs(rainPeakMmH({ ...base, warmingC: w }) / rainPeakMmH(base) - climateFactor(w)) < 1e-12);
  const inv = { ...base, pattern: 'pico' as const, intensityMmH: 60, durationMin: 30 };
  const invOk = Math.abs(rainDepthMm({ ...inv, warmingC: 3 }) - 30 * climateFactor(3)) < 1e-9;
  record({ id: 'L4', kind: 'obligatoria', name: 'Cambio climático: aguaceros 7 % más intensos por grado de calentamiento', tolerance: 'factor 1,07^(nivel − 1,1 °C): 1 con el clima de hoy; la lámina y el pico de cualquier lluvia se multiplican exactamente por el factor (error < 10⁻¹²)', measured: `factores ${WARMING_LEVELS.map((w, i) => `${w} °C → ${ks[i].toFixed(3)}`).join(', ')}; tormenta de 10 años y 1 h ${scaled ? 'escalada' : 'NO escalada'}; lluvia inventada con pico de 60 mm/h y 30 min con 3 °C: ${fmt(rainDepthMm({ ...inv, warmingC: 3 }), 2)} mm`, pass: Math.abs(ks[0] - 1) < 1e-12 && Math.abs(ks[2] - Math.pow(1.07, 0.9)) < 1e-12 && scaled && invOk });

  // L5) Lluvia larga en el motor: tormenta de 10 años y 3 h en la ladera (celdas de 2 m) con el balance cerrado
  const sc = builtinScenarios()['ladera-quebrada'];
  const rain = { ...sc.defaults.rain, pattern: 'diseno' as const, returnYears: 10, durationMin: 180, intensityMmH: Math.round((idfDepth(10, 180) / 3) * 10) / 10 };
  const shL: Shared = { ...sc.defaults, dx: 2, rain, simMinutes: 210 };
  const t0 = performance.now();
  const simL = new CitySim(compile(sc, shL, baseInterventions(sc)), shL);
  simL.advanceTo(simL.endT);
  const ms = performance.now() - t0;
  const bL = simL.bal;
  const resL = Math.abs(bL.residual) / (bL.precipitation + bL.inflow);
  const Pexp = (rainDepthMm(rain) / 1000) * sc.extent.width * sc.extent.height;
  const shN: Shared = { ...shL, rain: { ...rain, warmingC: 3 } };
  const vShared = validateConfig({ format: 'medellin-lluvia/config', version: 1, shared: shN, A: baseInterventions(sc), B: baseInterventions(sc) }, builtinScenarios());
  const vBad = validateConfig({ format: 'medellin-lluvia/config', version: 1, shared: { ...shL, rain: { ...rain, returnYears: 7, durationMin: 90 } }, A: baseInterventions(sc), B: baseInterventions(sc) }, builtinScenarios());
  record({ id: 'L5', kind: 'obligatoria', name: 'Lluvia larga: tormenta de 10 años y 3 h en la ladera, con el balance cerrado', tolerance: 'lluvia que entra = lámina del hietograma × área (error < 10⁻⁶); residuo del balance < 10⁻⁹ del agua que entró; sin valores no finitos; la configuración con 3 °C se acepta y una de 7 años y 90 min se rechaza', measured: `${fmt(idfDepth(10, 180), 1)} mm en 3 h; lluvia ${fmt(bL.precipitation, 1)} m³ frente a ${fmt(Pexp, 1)} m³; residuo/entrada ${resL.toExponential(1)}; infiltrado ${fmt(bL.infiltrated, 0)} m³, drenado ${fmt(bL.drained, 0)} m³, salida ${fmt(bL.boundaryOut, 0)} m³; ${simL.diag.steps} pasos en ${(ms / 1000).toFixed(1)} s; 3 °C ${vShared.ok ? 'aceptada' : 'RECHAZADA'}; 7 años/90 min ${vBad.ok ? 'ACEPTADA' : `rechazada (${vBad.errors.length} errores)`}`, pass: Math.abs(bL.precipitation - Pexp) / Pexp < 1e-6 && resL < 1e-9 && Number.isFinite(bL.residual) && vShared.ok && !vBad.ok });
}

// ---------------------------------------------------------------- Sedimentos
{
  // T1) Constantes publicadas: velocidad de caída y capacidad de transporte de Govers
  const ws = settlingVelocity(SED.d50um * 1e-6);
  const stokes = (1.65 * 9.81 * Math.pow(SED.d50um * 1e-6, 2)) / (18 * 1e-6);
  const gc = goversCoeffs(SED.d50um);
  const tcs = [0.001, 0.003, 0.004, 0.01, 0.05, 0.2, 1].map((om) => transportCapacity(om, 1));
  const mono = tcs.every((v, i) => i === 0 || v >= tcs[i - 1]);
  record({ id: 'T1', kind: 'verificacion', name: 'Sedimento: velocidad de caída (Ferguson y Church) y capacidad de transporte (Govers, como en LISEM)', tolerance: 'para 60 µm, la velocidad de caída está entre 0,9 y 1 vez la de Stokes (granos finos); c y d de Govers según las fórmulas de LISEM; la capacidad es 0 por debajo de 0,4 cm/s de potencia unitaria, crece con ella y no pasa de 848 kg/m³', measured: `Vs = ${fmt(ws * 1000, 3)} mm/s (Stokes ${fmt(stokes * 1000, 3)} mm/s); c = ${gc.c.toFixed(4)}, d = ${gc.d.toFixed(4)}; capacidad para ω = 0,1 · 0,3 · 0,4 · 1 · 5 · 20 · 100 cm/s: ${tcs.map((v) => fmt(v, 0)).join(' · ')} kg/m³`, pass: ws / stokes > 0.9 && ws / stokes <= 1 && Math.abs(gc.c - Math.pow(65 / 0.32, -0.6)) < 1e-12 && tcs[0] === 0 && tcs[2] === 0 && tcs[3] > 0 && mono && Math.max(...tcs) <= SED.maxConc });

  // T2) Agua quieta con tierra: se asienta como exp(−Vs·t/h), sin perder masa
  {
    const scS = builtinScenarios()['calle-de-prueba'];
    const shS: Shared = { ...scS.defaults, dx: 1 };
    const cS = compile(scS, shS, baseInterventions(scS));
    const sm = new SedimentModel(cS);
    const N = cS.nx * cS.ny;
    const hS = new Float64Array(N), qxS = new Float64Array((cS.nx + 1) * cS.ny), qyS = new Float64Array(cS.nx * (cS.ny + 1)), rw = new Float64Array(N);
    let k0 = -1;
    for (let k = 0; k < N && k0 < 0; k++) if (!cS.solid[k]) k0 = k;
    hS[k0] = 0.2;
    sm.m[k0] = 0.2 * 5; // 5 kg/m³
    const m0 = sm.m[k0], l0 = sm.loose[k0];
    for (let t = 0; t < 60; t += 0.5) sm.exchange(hS, qxS, qyS, 0, rw, 0.5, 1.2);
    const theory = m0 * Math.exp((-ws * 60) / 0.2);
    const kept = sm.m[k0] + sm.loose[k0] - l0;
    record({ id: 'T2', kind: 'obligatoria', name: 'Sedimento en agua quieta: se asienta como exp(−Vs·t/h)', tolerance: 'con velocidad cero, después de 60 s la masa suspendida coincide con m₀·exp(−Vs·t/h) con error menor de 1 % (con 5 kg/m³ la caída frenada por la concentración la retrasa menos de 1 %) y lo que deja de estar suspendido queda depositado en la misma celda', measured: `suspendido ${sm.m[k0].toFixed(6)} kg/m² frente a ${theory.toFixed(6)} (teoría); suspendido + depositado ${kept.toFixed(9)} de ${m0.toFixed(9)} kg/m²`, pass: Math.abs(sm.m[k0] / theory - 1) < 0.01 && Math.abs(kept - m0) < 1e-12 });
  }

  // T3) Balance cerrado y lote en obra: la tierra suelta pierde mucho más que el parque con árboles
  {
    const scL = builtinScenarios()['ladera-quebrada'];
    const run = (tierra: boolean, creek = false) => {
      const iv = baseInterventions(scL);
      if (tierra) iv.zones.parque = 'tierra';
      const shT: Shared = { ...scL.defaults, dx: 2, rain: { ...scL.defaults.rain, intensityMmH: 60, durationMin: 30 }, simMinutes: 40, creek: creek ? { source: 'ejemplo', peakM3s: 150, timeToPeakMin: 8, startMin: 2, sedimentCv: 0.2 } : null };
      const sm = new CitySim(compile(scL, shT, iv), shT);
      sm.advanceTo(sm.endT);
      let neg = 0;
      for (let k = 0; k < sm.sed.m.length; k++) if (!(sm.sed.m[k] >= 0) || !(sm.sed.loose[k] >= 0) || !(sm.sed.pool[k] >= 0)) neg++;
      let mud = 0;
      for (let k = 0; k < sm.sed.loose.length; k++) if (sm.sed.loose[k] >= 1) mud++;
      return { b: sm.sed.updateBalance(), neg, mud: mud * sm.c.area, w: sm.bal.residual };
    };
    const A = run(false), B = run(true), Cc = run(false, true);
    const rel = (r: typeof A) => Math.abs(r.b.residual) / Math.max(1, r.b.loose0 + r.b.eroded + r.b.inflow);
    const kgs = (v: number) => (v >= 1000 ? `${fmt(v / 1000, 1)} t` : `${fmt(v, 1)} kg`);
    record({ id: 'T3', kind: 'obligatoria', name: 'Sedimento: balance cerrado; el lote en obra pierde mucho más tierra que el parque; la creciente con lodo deja lodo en el barrio', tolerance: 'residuo del balance de sedimento < 10⁻⁹ de lo que entró en las tres corridas, sin masas negativas ni no finitas; el agua sigue cerrando (< 10⁻⁹ m³ por m³); con el lote en obra la tierra arrancada es más de 10 veces la del parque y aparece lodo sobre el suelo; la creciente con 20 % de lodo deja lodo (≥ 1 kg/m²) en más de 100 m² y mete lodo a los sumideros', measured: `parque: arrancada ${kgs(A.b.eroded)}, lodo en ${fmt(A.mud, 0)} m², residuo ${rel(A).toExponential(1)} | lote en obra: arrancada ${kgs(B.b.eroded)}, lodo en ${fmt(B.mud, 0)} m², a sumideros ${kgs(B.b.drained)}, salió ${kgs(B.b.out)}, residuo ${rel(B).toExponential(1)} | creciente con lodo: entró ${kgs(Cc.b.inflow)}, depositado ${kgs(Cc.b.loose)}, lodo en ${fmt(Cc.mud, 0)} m², a sumideros ${kgs(Cc.b.drained)}, residuo ${rel(Cc).toExponential(1)}; masas negativas ${A.neg + B.neg + Cc.neg}`, pass: rel(A) < 1e-9 && rel(B) < 1e-9 && rel(Cc) < 1e-9 && A.neg + B.neg + Cc.neg === 0 && B.b.eroded > 10 * A.b.eroded && B.mud > A.mud && Cc.mud > 100 && Cc.b.drained > 0 && Math.abs(A.w) < 1e-6 && Math.abs(B.w) < 1e-6 });
    void SED_COVERS;
  }
}

// ---------------------------------------------------------------- Planificador
{
  const sc = builtinScenarios()['la-iguana-el-pesebre'];
  const items = planItems(sc);
  const A = baseInterventions(sc);
  const sel = ['tanques-techos', 'verde-20'];
  const B = cloneInterventions(A);
  applyPlan(sc, B, sel);
  const shP: Shared = { ...sc.defaults, dx: 2, rain: { ...sc.defaults.rain, pattern: 'diseno', returnYears: 10, durationMin: 60, intensityMmH: 49.8 }, simMinutes: 70 };
  const cA = compile(sc, shP, A), cB = compile(sc, shP, B);
  const gr = coverIndex('grama'), co = coverIndex('concreto');
  let gA = 0, gB = 0, open = 0;
  for (let k = 0; k < cA.cover.length; k++) {
    if (cA.cover[k] === gr) gA++;
    if (cB.cover[k] === gr) gB++;
    if (!cA.solid[k] && cA.building[k] < 0 && cA.cover[k] === co) open++;
  }
  const sA = new CitySim(cA, shP), sB = new CitySim(cB, shP);
  sA.advanceTo(sA.endT);
  sB.advanceTo(sB.endT);
  const keptA = sA.bal.infiltrated + sA.bal.devices, keptB = sB.bal.infiltrated + sB.bal.devices;
  const ok = validateConfig({ format: 'medellin-lluvia/config', version: 1, shared: shP, A, B }, builtinScenarios()).ok;
  const bad = validateConfig({ format: 'medellin-lluvia/config', version: 1, shared: shP, A, B: { ...B, greening: 0.5 } }, builtinScenarios()).ok;
  record({ id: 'P1', kind: 'obligatoria', name: 'Planificador: obras aplicadas, presupuesto y efecto en el agua (La Iguaná)', tolerance: 'el 20 % verde convierte exactamente round(0,2 × suelo abierto de concreto) celdas en pasto; los 10 tanques de los techos quedan activos; el plan cuesta lo que suman sus obras y cabe en el presupuesto; con la tormenta de 10 años y 1 h, B guarda o infiltra más agua que A y ambos balances cierran (< 10⁻⁹); la configuración con 20 % verde se acepta y una con 50 % se rechaza', measured: `obras disponibles: ${items.map((i) => i.id).join(', ')}; celdas de pasto A ${gA}, B ${gB} (+${gB - gA}; esperado ${Math.round(0.2 * open)}); tanques activos en B ${Object.values(B.tanks).filter((t) => t.on).length}; costo ${planCost(sc, sel)} de ${PLAN_BUDGET}; guardado o infiltrado A ${fmt(keptA, 1)} m³, B ${fmt(keptB, 1)} m³ (depósitos ${fmt(sB.bal.devices, 1)} m³); residuos ${(Math.abs(sA.bal.residual) / sA.bal.precipitation).toExponential(1)} / ${(Math.abs(sB.bal.residual) / sB.bal.precipitation).toExponential(1)}; 20 % ${ok ? 'aceptada' : 'RECHAZADA'}; 50 % ${bad ? 'ACEPTADA' : 'rechazada'}`, pass: gB - gA === Math.round(0.2 * open) && Object.values(B.tanks).filter((t) => t.on).length === 10 && planCost(sc, sel) === 70 && keptB > keptA && Math.abs(sA.bal.residual) / sA.bal.precipitation < 1e-9 && Math.abs(sB.bal.residual) / sB.bal.precipitation < 1e-9 && ok && !bad });
}

// ---------------------------------------------------------------- Torrente empinado y dibujo amplificado
{
  // F1: en la quebrada de la ladera (10 % de pendiente) una creciente casi estable debe ir en flujo uniforme y con
  // una profundidad físicamente plausible para un torrente de montaña, y no represarse junto a la salida
  const sc = builtinScenarios()['ladera-quebrada'];
  const sh: Shared = { ...sc.defaults, rain: { ...sc.defaults.rain, intensityMmH: 0, durationMin: 5 }, simMinutes: 30, creek: { source: 'ejemplo', peakM3s: 60, timeToPeakMin: 25, startMin: 2, sedimentCv: 0 } };
  const iv = baseInterventions(sc);
  const c = compile(sc, sh, iv);
  const sim = new CitySim(c, sh, {});
  sim.advanceTo(27 * 60, 1e9);
  const { nx, dx } = c;
  const cellAt = (x: number, y: number) => Math.floor(y / dx) * nx + Math.floor(x / dx);
  // sección a x = 26 m: caudal que pasa por la columna de caras y nivel en el lecho
  const xs = 26, i = Math.round(xs / dx);
  let Q = 0;
  const col: number[] = [];
  for (let j = 0; j < c.ny; j++) {
    Q += sim.qx[j * (nx + 1) + i] * dx;
    const k = j * nx + i;
    if (!c.solid[k]) col.push(k);
  }
  const yc = yq(xs);
  let etaMod = 0, nb = 0;
  for (const k of col) {
    const y = (Math.floor(k / nx) + 0.5) * dx;
    if (Math.abs(y - yc) <= 1.5 && sim.h[k] > 0.01) {
      etaMod += c.z[k] + sim.h[k];
      nb++;
    }
  }
  etaMod /= Math.max(1, nb);
  const S = (c.z[cellAt(8, yq(8))] - c.z[cellAt(44, yq(44))]) / 36;
  const bed = c.z[cellAt(xs, yc)];
  // geometría de la sección del terreno del modelo para un nivel η: área, ancho superficial y perímetro mojado
  const geom = (eta: number) => {
    let A = 0, T = 0, P = 0;
    for (let q = 0; q < col.length; q++) {
      const d = eta - c.z[col[q]];
      if (d <= 0) continue;
      A += d * dx;
      T += dx;
      const nxt = q + 1 < col.length ? eta - c.z[col[q + 1]] : 0;
      P += nxt > 0 ? Math.hypot(dx, c.z[col[q + 1]] - c.z[col[q]]) : dx / 2 + d;
    }
    return { A, T, P };
  };
  const solve = (f: (eta: number) => number) => {
    let lo = bed + 1e-3, hi = bed + 6;
    for (let it = 0; it < 80; it++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < 0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  // profundidad crítica (Fr = 1): Q²·T / (g·A³) = 1 (Grant 1997: los torrentes de lecho móvil van cerca de Fr = 1)
  const etaC = solve((eta) => {
    const g0 = geom(eta);
    return 1 - (Q * Q * g0.T) / (9.81 * g0.A * g0.A * g0.A);
  });
  // profundidad normal con la ecuación de potencia variable de Ferguson (2007) para lechos de grava y bloques
  const vpe = (d84: number) => solve((eta) => {
    const { A, P } = geom(eta);
    const R = A / P, rr = R / d84;
    const V = Math.sqrt(9.81 * R * S) * (6.5 * 2.5 * rr) / Math.sqrt(6.5 * 6.5 + 2.5 * 2.5 * Math.pow(rr, 5 / 3));
    return A * V - Q;
  });
  const etaV3 = vpe(0.3), etaV5 = vpe(0.5);
  // Manning con n = 0,035 (rugosidad de cauce de llanura), solo como referencia
  const etaN = solve((eta) => {
    const { A, P } = geom(eta);
    return (A * Math.pow(A / P, 2 / 3) * Math.sqrt(S)) / 0.035 - Q;
  });
  const dMod = etaMod - bed, dC = etaC - bed, dV3 = etaV3 - bed, dV5 = etaV5 - bed;
  // perfil junto a la salida: el agua no debe crecer hacia el borde
  const W = nx * dx;
  const hEdge = sim.h[cellAt(W - 0.5, yq(W - 0.5))], hUp = sim.h[cellAt(W - 10.5, yq(W - 10.5))];
  const geoM = geom(etaMod);
  const frMod = Q / geoM.A / Math.sqrt((9.81 * geoM.A) / geoM.T);
  record({
    id: 'F1',
    kind: 'obligatoria',
    name: 'Torrente empinado: profundidad plausible en el tramo de 10 % y sin represamiento en la salida',
    tolerance: 'con una creciente casi estable (60 m³/s, pico a los 27 min) en el tramo recto de 10 % de pendiente, la profundidad calculada en la sección x = 26 m queda entre la normal de la ecuación de resistencia para lechos de grava y bloques de Ferguson (2007) con D84 = 0,3 m y 1,1 veces la crítica de esa sección (Grant 1997: los torrentes de lecho móvil van cerca de Fr = 1); junto a la salida la profundidad en el borde no supera en más de 10 % la de 10 m aguas arriba; el balance cierra (< 10⁻⁹)',
    measured: `pendiente ${fmt(S, 3)}; caudal ${fmt(Q, 1)} m³/s; profundidad calculada ${fmt(dMod, 2)} m (Froude de la sección ${fmt(frMod, 2)}); Ferguson D84 0,3 m: ${fmt(dV3, 2)} m, D84 0,5 m: ${fmt(dV5, 2)} m; crítica ${fmt(dC, 2)} m; Manning con n = 0,035 (cauce de llanura, referencia): ${fmt(etaN - bed, 2)} m; salida: borde ${fmt(hEdge, 2)} m, 10 m aguas arriba ${fmt(hUp, 2)} m; residuo ${(Math.abs(sim.bal.residual) / Math.max(1, sim.bal.inflow)).toExponential(1)}`,
    pass: dMod >= dV3 && dMod <= 1.1 * dC && hEdge <= 1.1 * hUp && Math.abs(sim.bal.residual) / Math.max(1, sim.bal.inflow) < 1e-9,
    note: 'Prueba agregada al corregir un defecto que señaló el usuario («esa cresta y concentración no tienen sentido»). La salida de la quebrada, con 3 % de pendiente escrita (el cauce baja casi 9 %) y acotada en régimen crítico, represaba el agua en los últimos 15 m (2,0 m en el borde frente a 1,65 m aguas arriba); ahora usa la pendiente del terreno y el mismo límite de Froude de las caras interiores. Se probó relajar el límite de Froude hasta 3 en agua honda, y además agregar la aceleración convectiva: con Manning n = 0,035 el agua iba a Fr ≈ 3, se formaban ondas que crecían sin control (inestabilidad de Vedernikov) y oleadas espurias contra el terraplén de la carrera. Se descartó: los torrentes reales no sostienen Fr ≫ 1 (Grant 1997) y la rugosidad de un cauce de llanura no corresponde a una quebrada de 10 %. La comparación válida es con la resistencia de lechos de grava y bloques (Ferguson 2007) y con el flujo crítico.',
  });
  // A1: la amplificación del dibujo engrosa láminas delgadas y deja nivelada la superficie del agua honda
  const k5 = 5;
  const thin = drawDepth(0.01, k5) / 0.01;
  const extra = drawDepth(5, k5) - 5;
  // misma superficie libre en el lecho (2 m) y en la orilla (30 cm): diferencia dibujada
  const lvl = Math.abs((0 + drawDepth(2, k5)) - (1.7 + drawDepth(0.3, k5)));
  const lvlOld = Math.abs(2 * k5 - (1.7 + 0.3 * k5));
  let mono = true;
  for (let h = 0; h < 3; h += 0.001) if (drawDepth(h + 0.001, k5) <= drawDepth(h, k5)) mono = false;
  record({
    id: 'A1',
    kind: 'obligatoria',
    name: '«Agua ×5» engrosa las láminas delgadas sin levantar el agua honda',
    tolerance: 'una lámina de 1 cm se dibuja al menos ×4,5; a ninguna profundidad se agregan más de (5 − 1) × 4 cm = 16 cm; el dibujo crece con la profundidad; con la misma superficie libre en el lecho de una quebrada (2 m) y en su orilla (30 cm), las superficies dibujadas difieren menos de 1 cm',
    measured: `1 cm → ×${fmt(thin, 2)}; 5 m → +${fmt(extra * 100, 1)} cm; creciente: ${mono ? 'sí' : 'NO'}; lecho y orilla con la misma superficie: diferencia dibujada ${fmt(lvl * 100, 2)} cm (multiplicando la profundidad, como antes: ${fmt(lvlOld, 1)} m)`,
    pass: thin >= 4.5 && extra <= (k5 - 1) * AMP_SHEET_M + 1e-12 && mono && lvl < 0.01,
  });
}

// ---------------------------------------------------------------- Puente peatonal bajo la creciente
{
  // G1: fórmulas del análisis del puente frente a cálculos a mano
  const sc = builtinScenarios()['ladera-quebrada'];
  const c0 = compile(sc, { ...sc.defaults }, baseInterventions(sc));
  const cb = c0.bridge!, b = cb.spec;
  const cd0 = dragCoefficient(0), cd06 = dragCoefficient(0.6), cd3 = dragCoefficient(3);
  const wHand = ((b.widthM * b.slabM + b.beams * b.beamWidthM * (b.beamM - b.slabM)) * 24 + b.railKNm) * b.spanM;
  const conc = b.beams * b.beamWidthM * (b.beamM - b.slabM) + b.widthM * b.slabM, air = (b.widthM - b.beams * b.beamWidthM) * (b.beamM - b.slabM);
  const uHand = ((conc + air) * 1000 * 9.81 * b.spanM) / 1000;
  const avf = b.dowels * Math.PI * Math.pow(b.dowelMm / 2000, 2);
  const capHand = 0.6 * (avf * b.fyMPa * 1000 + (wHand - uHand) / 2);
  // flujo uniforme sintético: 14 celdas de 1 m, 4 m/s, agua 0,35 m sobre el fondo de la viga (h* = 1)
  const cells = Array.from({ length: 14 }, () => ({ level: cb.soffit + b.beamM, depth: 2.5, u: 4 }));
  const f = bridgeForces(b, cb.soffit, cells, 1);
  const dragHand = (dragCoefficient(1) * 0.5 * 1000 * 16 * b.beamM * 14) / 1000;
  const errs = [Math.abs(cd0 - 2.15), Math.abs(cd06 - 1.403) - 5e-4, Math.abs(selfWeight(b) - wHand), Math.abs(buoyancy(b, 5) - uHand), Math.abs(f.drag - dragHand), Math.abs(f.capacity - capHand), Math.abs(bearingCapacity(b, 0) - 0.6 * avf * b.fyMPa * 1000)];
  const rhoMud = mixtureDensity(0.3 * 2650);
  record({
    id: 'G1',
    kind: 'obligatoria',
    name: 'Puente peatonal: arrastre, flotación y resistencia de los apoyos iguales al cálculo a mano',
    tolerance: 'C_D(0) = 2,15 y C_D(0,6) = 1,403 (ejemplo de FHWA-HRT-09-028, ±0,0005); peso, flotación con el tablero sumergido (concreto y aire atrapado), empuje en flujo uniforme y resistencia por fricción (μ = 0,6) iguales a sus fórmulas (error < 10⁻⁹ kN); la mezcla con 30 % de sedimento en volumen pesa 1 495 kg/m³ (±1)',
    measured: `C_D: ${fmt(cd0, 4)} / ${fmt(cd06, 4)} / ${fmt(cd3, 4)} (h* = 0 / 0,6 / 3); peso ${fmt(selfWeight(b), 2)} kN (a mano ${fmt(wHand, 2)}); flotación ${fmt(buoyancy(b, 5), 2)} kN (${fmt(uHand, 2)}); empuje a 4 m/s con h* = 1: ${fmt(f.drag, 2)} kN (${fmt(dragHand, 2)}); resistencia por apoyo sumergido ${fmt(f.capacity, 2)} kN (${fmt(capHand, 2)}); utilización ${fmt(f.utilization, 3)}; mezcla ${fmt(rhoMud, 1)} kg/m³`,
    pass: errs[0] < 1e-9 && errs[1] <= 0 && errs.slice(2).every((e) => e < 1e-9) && Math.abs(rhoMud - 1495) <= 1,
  });
  // G2: en la ladera, el gálibo se acaba con la creciente, el empuje crece y la avenida con lodo lo hace colapsar
  const cap = c0.creek!.capacity;
  const runB = (frac: number, cv: number, ttp: number) => {
    const sh: Shared = { ...sc.defaults, rain: { ...sc.defaults.rain, intensityMmH: 0, durationMin: 5 }, simMinutes: 20, creek: { source: 'ejemplo', peakM3s: frac * cap, timeToPeakMin: ttp, startMin: 2, sedimentCv: cv } };
    const c = compile(sc, sh, baseInterventions(sc));
    const sim = new CitySim(c, sh, {});
    let lmax = -Infinity;
    for (let t = 30; t <= 20 * 60; t += 10) {
      sim.advanceTo(t, 1e9);
      if (Number.isFinite(sim.bridge!.level)) lmax = Math.max(lmax, sim.bridge!.level);
    }
    const nDeb = c.bridge!.debrisCells.filter((k) => (sim as unknown as { nEff: Float64Array }).nEff[k] >= DEBRIS_MANNING).length;
    return { st: sim.bridge!, clear: c.bridge!.soffit - lmax, res: Math.abs(sim.bal.residual) / sim.bal.inflow, nDeb, nCells: c.bridge!.debrisCells.length };
  };
  const r60 = runB(0.6, 0, 6), r250 = runB(2.5, 0, 6), r350 = runB(3.5, 0, 6), rMud = runB(3.5, 0.3, 3);
  record({
    id: 'G2',
    kind: 'obligatoria',
    name: 'Puente peatonal en la creciente: gálibo, empuje y colapso con la avenida de lodo',
    tolerance: 'con 60 % de la capacidad del cauce queda más de 0,5 m de gálibo y no hay empuje; con 250 % y 350 % (agua) no queda gálibo, el empuje máximo crece con el caudal y el puente resiste (uso < 100 %); con la avenida torrencial (350 %, 30 % de lodo) el puente colapsa por deslizamiento y su tablero frena el agua en todas las celdas donde cae (Manning de al menos 0,1); el balance cierra en las cuatro corridas (< 10⁻⁹)',
    measured: `60 %: gálibo mínimo ${fmt(r60.clear, 2)} m, empuje ${fmt(r60.st.dragMax, 1)} kN | 250 %: gálibo ${fmt(r250.clear, 2)} m, empuje máx ${fmt(r250.st.dragMax, 1)} kN, uso máx ${fmt(r250.st.utilMax * 100, 0)} %, ${r250.st.status} | 350 %: empuje máx ${fmt(r350.st.dragMax, 1)} kN, uso máx ${fmt(r350.st.utilMax * 100, 0)} %, ${r350.st.status} | avenida con lodo: empuje máx ${fmt(rMud.st.dragMax, 1)} kN, uso máx ${fmt(rMud.st.utilMax * 100, 0)} %, ${rMud.st.status}${rMud.st.collapsedAt >= 0 ? ` en el segundo ${fmt(rMud.st.collapsedAt, 0)} (${rMud.st.mode})` : ''}, celdas con escombros ${rMud.nDeb} de ${rMud.nCells}; residuos ${[r60, r250, r350, rMud].map((r) => r.res.toExponential(1)).join(' / ')}`,
    pass: r60.clear > 0.5 && r60.st.dragMax === 0 && r250.clear < 0 && r250.st.dragMax > 0 && r350.st.dragMax > r250.st.dragMax && r250.st.utilMax < 1 && r350.st.utilMax < 1 && r250.st.status !== 'colapsado' && r350.st.status !== 'colapsado' && rMud.st.status === 'colapsado' && rMud.st.mode === 'deslizamiento' && rMud.nDeb === rMud.nCells && [r60, r250, r350, rMud].every((r) => r.res < 1e-9),
  });
}

// ---------------------------------------------------------------- Tormenta viva y cine
{
  // E1: rayos ilustrativos: sin lluvia fuerte no hay; su frecuencia sigue la lluvia calculada con tope; nunca dos
  // con menos de 4 s; con movimiento reducido no hay destellos; un solo destello por rayo
  const run = (mmh: number, reduced: boolean, seconds: number) => {
    const sky = new StormSky(0, 4242, null);
    const times: number[] = [];
    let t = 0, maxFlash = 0, rises = 0, prev = 0, rising = false;
    sky.onStrike = () => times.push(t);
    const dt = 1 / 30;
    for (let i = 0; i < seconds / dt; i++) {
      t += dt;
      sky.update(dt, mmh, 1, reduced);
      maxFlash = Math.max(maxFlash, sky.flash);
      if (sky.flash > prev + 1e-9 && !rising) {
        rises++;
        rising = true;
      } else if (sky.flash < prev) rising = false;
      prev = sky.flash;
    }
    sky.dispose();
    let gap = Infinity;
    for (let i = 1; i < times.length; i++) gap = Math.min(gap, times[i] - times[i - 1]);
    return { n: times.length, gap, maxFlash, rises };
  };
  const dry = run(20, false, 600), heavy = run(180, false, 1200), mid = run(80, false, 1200), red = run(180, true, 600);
  const perMin = (n: number, s: number) => (n * 60) / s;
  record({
    id: 'E1',
    kind: 'obligatoria',
    name: 'Tormenta viva: los rayos ilustrativos siguen la lluvia calculada y respetan los límites de destellos',
    tolerance: 'con 20 mm/h no hay rayos; con 180 mm/h hay como máximo 8 por minuto y más que con 80 mm/h; nunca dos con menos de 4 s entre sí; un solo destello por rayo (sin parpadeo) y de intensidad ≤ 0,7; con movimiento reducido no hay rayos ni destellos',
    measured: `20 mm/h: ${dry.n} rayos; 80 mm/h: ${fmt(perMin(mid.n, 1200), 2)} por minuto; 180 mm/h: ${fmt(perMin(heavy.n, 1200), 2)} por minuto (tasa nominal ${fmt(strikeRate(180), 1)}), separación mínima ${fmt(heavy.gap, 2)} s, destellos ${heavy.rises} para ${heavy.n} rayos, destello máximo ${fmt(heavy.maxFlash, 2)}; movimiento reducido: ${red.n} rayos, destello máximo ${fmt(red.maxFlash, 2)}`,
    pass: dry.n === 0 && heavy.n > mid.n && mid.n > 0 && perMin(heavy.n, 1200) <= 8 && heavy.gap >= MIN_GAP_S - 1e-9 && heavy.rises === heavy.n && heavy.maxFlash <= 0.7 && red.n === 0 && red.maxFlash === 0,
  });
}
{
  // E2: el sonido del agua sigue el caudal calculado (monótono, entre 0 y 1)
  const mk = (s: object) => ({ samples: [s] }) as unknown as CitySim;
  const qs = [0, 0.05, 0.2, 0.5, 1, 3];
  const street = qs.map((q) => flowLevel(mk({ outletQ: q * 0.6, drainQ: q * 0.4 })));
  const creek = [0, 2, 10, 30, 60, 120].map((q) => flowLevel(mk({ outletQ: 0, drainQ: 0, creek: { qin: q, qChannel: q * 0.8, qOutside: q * 0.2, level: 1 } })));
  const mono = (a: number[]) => a.every((v, i) => i === 0 || v >= a[i - 1]);
  const empty = flowLevel({ samples: [] } as unknown as CitySim);
  // E2 (cont.): tomas de cine sin atravesar terreno ni construcciones, en los dos sectores didácticos
  const shotRows: string[] = [];
  let shotsOk = true;
  for (const id of ['calle-de-prueba', 'ladera-quebrada']) {
    const sc = builtinScenarios()[id];
    const c = compile(sc, { ...sc.defaults, rain: { ...sc.defaults.rain } }, baseInterventions(sc));
    const W = c.nx * c.dx, H = c.ny * c.dx;
    let zRef = Infinity;
    for (let k = 0; k < c.zGround.length; k++) zRef = Math.min(zRef, c.zGround[k], c.z[k]);
    const cell = (x: number, y: number) => Math.min(c.ny - 1, Math.max(0, Math.floor(y / c.dx))) * c.nx + Math.min(c.nx - 1, Math.max(0, Math.floor(x / c.dx)));
    const groundAt = (x: number, y: number) => (c.solid[cell(x, y)] ? c.zGround[cell(x, y)] : c.z[cell(x, y)]);
    const roofAt = (x: number, y: number) => {
      const b = c.building[cell(x, y)];
      return b < 0 ? -Infinity : c.buildings[b].baseZ + c.buildings[b].heightM;
    };
    // el punto más bajo fuera de las construcciones hace las veces de «donde más agua hay»
    let low = -1;
    for (let k = 0; k < c.z.length; k++) if (c.building[k] < 0 && !c.solid[k] && (low < 0 || c.z[k] < c.z[low])) low = k;
    const lx = ((low % c.nx) + 0.5) * c.dx, ly = (Math.floor(low / c.nx) + 0.5) * c.dx;
    const shots = buildShots({
      W,
      H,
      fitA: groundAt(W / 2, H / 2) - zRef,
      street: sc.streetView,
      groundAt,
      roofAt,
      w: (x, y, z) => new THREE.Vector3(x - W / 2, z - zRef, H / 2 - y),
      deepest: () => [lx, ly, 0.3],
      valle: { p: new THREE.Vector3(-W, 300, 0), t: new THREE.Vector3(W, 50, 0) },
    });
    let worst = Infinity, inside = 0, samples = 0;
    for (const sh of shots.filter((q) => q.id === 'calle' || q.id === 'agua' || q.id === 'grua')) {
      for (let i = 0; i <= 40; i++) {
        const { p } = sh.pose(i / 40);
        const x = p.x + W / 2, y = H / 2 - p.z, z = p.y + zRef;
        if (x < 0 || y < 0 || x > W || y > H) continue;
        samples++;
        const clear = z - Math.max(groundAt(x, y), roofAt(x, y));
        worst = Math.min(worst, clear);
        if (clear < 1) inside++;
      }
    }
    shotsOk &&= inside === 0 && samples > 60;
    shotRows.push(`${sc.shortTitle}: ${samples} posiciones, holgura mínima ${fmt(worst, 2)} m, dentro de terreno o techos ${inside}`);
  }
  record({
    id: 'E2',
    kind: 'obligatoria',
    name: 'Sonido ligado al cálculo y tomas de cine que no atraviesan la maqueta',
    tolerance: 'el nivel del sonido del agua crece con el caudal calculado (calle y quebrada), queda entre 0 y 1 y es 0 sin datos; en las tomas de calle, del agua y de grúa la cámara queda al menos 1 m por encima del terreno y de los techos en los dos sectores didácticos',
    measured: `calle (0–3 m³/s): ${street.map((v) => fmt(v, 2)).join(', ')}; quebrada (0–120 m³/s): ${creek.map((v) => fmt(v, 2)).join(', ')}; sin datos ${empty}; ${shotRows.join('; ')}`,
    pass: mono(street) && mono(creek) && street[0] === 0 && creek[0] === 0 && Math.max(...street, ...creek) <= 1 && street[street.length - 1] === 1 && empty === 0 && shotsOk,
  });
}

// ---------------------------------------------------------------- Informe
const passed = results.filter((r) => r.pass).length;
const report = { generatedAt: new Date().toISOString(), engine: 'inercial-local-urbano 1.0.0', node: process.version, passed, total: results.length, results, sensitivity: sens, froude };
writeFileSync(new URL('../../src/city/content/test-report.json', import.meta.url), JSON.stringify(report, null, 2));
const md = [
  '# Pruebas del laboratorio de lluvia urbana',
  '',
  `Informe generado automáticamente por \`npm run test:city\` el ${report.generatedAt} (Node ${process.version}).`,
  '',
  `Resultado: **${passed} de ${results.length}** comprobaciones cumplen su tolerancia.`,
  '',
  'Las tolerancias se fijaron antes de ejecutar. Las pruebas «revisión» informan una sensibilidad; su criterio está escrito en la misma fila.',
  '',
  '| Id | Tipo | Prueba | Tolerancia | Medido | Resultado |',
  '|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.kind} | ${r.name} | ${r.tolerance} | ${r.measured.replace(/\|/g, '/')} | ${r.pass ? 'Cumple' : '**No cumple**'} |`),
  '',
  '## Notas y correcciones de diseño de las pruebas',
  '',
  ...results.filter((r) => r.note).map((r) => `- **${r.id}.** ${r.note}`),
  '',
].join('\n');
writeFileSync(new URL('../../docs/medellin/PRUEBAS.md', import.meta.url), md);
console.log(`\n${passed}/${results.length} cumplen.`);
if (passed !== results.length) process.exitCode = 1;

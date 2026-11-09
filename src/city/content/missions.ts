// Misiones cortas: pregunta → predicción → intervención → explicación.
// Los resultados se calculan SIEMPRE con la simulación: no hay mejoras predeterminadas y el texto se
// construye con los números obtenidos (si algo no mejora, se dice).

import type { Indicators } from '../sim/compare';
import type { Interventions, RainConfig, Scenario } from '../sim/scenario';
import { fmtDepth, fmtNum } from '../render/palette';

export interface MissionRow {
  label: string;
  a: string;
  b: string;
  change: string;
}

export interface MissionResult {
  /** Opción de predicción que coincide con lo calculado (o null si ninguna aplica). */
  outcome: string | null;
  /** Frases con los números calculados. */
  observed: string[];
  rows: MissionRow[];
  caveat?: string;
}

export interface Mission {
  id: string;
  title: string;
  scenarioId: string;
  question: string;
  context: string;
  options: { id: string; text: string }[];
  rain: Partial<RainConfig>;
  simMinutes: number;
  /** Configuración del escenario A (base) de la misión. */
  setupA?: (iv: Interventions) => void;
  /** Cambio que se propone en B. «presupuesto» deja que el estudiante elija. */
  change: { kind: 'auto'; describe: string; apply: (iv: Interventions) => void } | { kind: 'presupuesto'; describe: string } | { kind: 'ninguno'; describe: string };
  evaluate: (a: Indicators, b: Indicators | null, sc: Scenario) => MissionResult;
  explain: string;
  terms: string[];
}

export const BUDGET = 100;

const m3 = (v: number) => `${fmtNum(v, v < 10 ? 2 : 1)}\u00a0m³`;
const lps = (v: number) => `${fmtNum(v * 1000, 1)}\u00a0L/s`;
const probe = (ind: Indicators, id: string) => ind.probeMax.find((p) => p.id === id)?.depth ?? 0;

/** Cambio relativo en palabras, sin dividir por cero. */
export function changeText(a: number, b: number, eps: number, unit: (v: number) => string): string {
  const d = b - a;
  if (Math.abs(a) < eps) return Math.abs(b) < eps ? 'sin cambio (ambos ≈ 0)' : `${d > 0 ? '+' : '−'}${unit(Math.abs(d))} (A ≈ 0: sin %)`;
  const pct = (d / a) * 100;
  if (Math.abs(pct) < 0.5) return 'casi igual (< 0,5 %)';
  return `${d > 0 ? '+' : '−'}${unit(Math.abs(d))} (${pct > 0 ? '+' : '−'}${fmtNum(Math.abs(pct), 0)} %)`;
}

function baseRows(a: Indicators, b: Indicators): MissionRow[] {
  return [
    { label: 'Lluvia caída', a: m3(a.precipitation), b: m3(b.precipitation), change: 'igual en A y B' },
    { label: 'Se infiltró', a: m3(a.infiltrated), b: m3(b.infiltrated), change: changeText(a.infiltrated, b.infiltrated, 1e-3, m3) },
    { label: 'Entró a sumideros y red', a: m3(a.drained), b: m3(b.drained), change: changeText(a.drained, b.drained, 1e-3, m3) },
    { label: 'Guardada en depósitos', a: m3(a.devices), b: m3(b.devices), change: changeText(a.devices, b.devices, 1e-3, m3) },
    { label: 'Salió por el borde bajo', a: m3(a.boundaryOut), b: m3(b.boundaryOut), change: changeText(a.boundaryOut, b.boundaryOut, 1e-3, m3) },
    { label: 'Caudal pico de salida', a: lps(a.peakOutlet), b: lps(b.peakOutlet), change: changeText(a.peakOutlet, b.peakOutlet, 1e-5, lps) },
    { label: `Área con ≥ ${fmtNum(a.threshold * 100, 0)} cm de agua (máx.)`, a: `${fmtNum(a.maxAreaAbove, 0)} m²`, b: `${fmtNum(b.maxAreaAbove, 0)} m²`, change: changeText(a.maxAreaAbove, b.maxAreaAbove, 0.5, (v) => `${fmtNum(v, 0)} m²`) },
  ];
}

export const MISSIONS: Mission[] = [
  {
    id: 'charco-esquina',
    title: 'El charco de la esquina',
    scenarioId: 'calle-de-prueba',
    question: 'Va a caer un aguacero fuerte: 100 mm/h durante 20 minutos. ¿Dónde crees que el agua llegará a ser más profunda?',
    context: 'Mira la maqueta: la calle baja hacia el este y la intersección es casi plana. En la esquina hay un bajo con un sumidero.',
    options: [
      { id: 'esquina', text: 'En la esquina baja' },
      { id: 'mitad', text: 'En la mitad de la calle' },
      { id: 'salida', text: 'Cerca de la salida, al final de la calle' },
    ],
    rain: { intensityMmH: 100, durationMin: 20, pattern: 'constante', spatial: 'uniforme' },
    simMinutes: 35,
    change: { kind: 'ninguno', describe: 'En esta misión no cambias nada: solo observas dónde se junta el agua.' },
    evaluate: (a) => {
      const ids = ['esquina', 'mitad', 'salida'];
      const ranked = a.probeMax.filter((p) => ids.includes(p.id)).sort((x, y) => y.depth - x.depth);
      const top = ranked[0];
      return {
        outcome: top && top.depth > 0.0005 ? top.id : null,
        observed: [
          `La mayor profundidad calculada fue en «${top.name}»: ${fmtDepth(top.depth)} (minuto ${fmtNum(top.t / 60, 0)}).`,
          ...ranked.slice(1).map((p) => `En «${p.name}» llegó a ${fmtDepth(p.depth)}.`),
          `El sumidero no alcanzó a captar todo: entraron ${m3(a.drained)} a la red y ${m3(a.boundaryOut)} siguieron calle abajo.`,
        ],
        rows: [],
      };
    },
    explain: 'El agua siempre busca bajar. La calle tiene pendiente, el bordillo la mantiene en la cuneta y el bajo de la esquina la recoge. Cuando llega más agua de la que el sumidero puede captar, se forma un charco.',
    terms: ['escorrentia', 'almacenamiento-superficial', 'sumidero'],
  },
  {
    id: 'sumidero-obstruido',
    title: 'Sumidero obstruido',
    scenarioId: 'calle-de-prueba',
    question: 'Las hojas taparon el 90 % de la rejilla del sumidero de la esquina. Con la misma lluvia, ¿cómo será el charco?',
    context: 'A: el sumidero está libre. B: el mismo sumidero, obstruido al 90 %. Todo lo demás es igual.',
    options: [
      { id: 'mas', text: 'Más profundo' },
      { id: 'igual', text: 'Igual' },
      { id: 'menos', text: 'Menos profundo' },
    ],
    rain: { intensityMmH: 60, durationMin: 20, pattern: 'constante', spatial: 'uniforme' },
    simMinutes: 35,
    change: { kind: 'auto', describe: 'Obstruir al 90 % el sumidero de la esquina en B.', apply: (iv) => (iv.drains['sum-esquina'] = 0.9) },
    evaluate: (a, b) => {
      const da = probe(a, 'esquina'), db = probe(b!, 'esquina');
      const diff = db - da;
      return {
        outcome: Math.abs(diff) < 0.001 ? 'igual' : diff > 0 ? 'mas' : 'menos',
        observed: [
          `Profundidad máxima en la esquina: A ${fmtDepth(da)}, B ${fmtDepth(db)}.`,
          `El sumidero captó ${m3(a.drained)} en A y ${m3(b!.drained)} en B.`,
          `El agua que no entró al sumidero siguió calle abajo: salida ${m3(a.boundaryOut)} en A y ${m3(b!.boundaryOut)} en B.`,
        ],
        rows: [{ label: 'Profundidad máxima en la esquina', a: fmtDepth(da), b: fmtDepth(db), change: changeText(da, db, 0.0005, fmtDepth) }, ...baseRows(a, b!)],
      };
    },
    explain: 'Una rejilla tapada tiene menos espacio para que entre el agua. Lo que no entra se acumula en el bajo y luego sigue calle abajo. Por eso limpiar los sumideros antes de la temporada de lluvias ayuda.',
    terms: ['sumidero', 'caudal', 'escorrentia'],
  },
  {
    id: 'cambiar-pavimento',
    title: 'Cambiar el pavimento',
    scenarioId: 'calle-de-prueba',
    question: 'Cambiamos el asfalto del parqueadero por pavimento permeable. ¿Qué pasará con el agua que sale por el final de la calle?',
    context: 'El pavimento permeable deja pasar parte del agua a una capa de piedras. Pero ¿adónde iba antes el agua del parqueadero?',
    options: [
      { id: 'baja', text: 'Bajará mucho (más de 10 %)' },
      { id: 'poco', text: 'Cambiará poco (menos de 10 %)' },
      { id: 'sube', text: 'Subirá' },
    ],
    rain: { intensityMmH: 60, durationMin: 20, pattern: 'constante', spatial: 'uniforme' },
    simMinutes: 35,
    change: { kind: 'auto', describe: 'Cambiar el parqueadero a pavimento permeable en B.', apply: (iv) => (iv.zones.parqueadero = 'adoquin_permeable') },
    evaluate: (a, b) => {
      const pa = a.boundaryOut, pb = b!.boundaryOut;
      const pct = pa > 1e-3 ? ((pb - pa) / pa) * 100 : 0;
      return {
        outcome: pct <= -10 ? 'baja' : pct > 0.5 ? 'sube' : 'poco',
        observed: [
          `Se infiltraron ${m3(a.infiltrated)} en A y ${m3(b!.infiltrated)} en B.`,
          `Salida por el final de la calle: A ${m3(pa)}, B ${m3(pb)} (${pa > 1e-3 ? (Math.abs(pct) < 0.05 ? 'prácticamente igual' : `${pct > 0 ? '+' : '−'}${fmtNum(Math.abs(pct), 1)} %`) : 'A ≈ 0'}).`,
          `Agua que entró a los sumideros: A ${m3(a.drained)}, B ${m3(b!.drained)}.`,
        ],
        rows: baseRows(a, b!),
        caveat: 'Una medida puede cambiar mucho un indicador y casi nada otro: aquí importa por dónde viajaba el agua del parqueadero antes del cambio.',
      };
    },
    explain: 'El pavimento permeable guarda agua en su base y la deja entrar al suelo. El efecto se nota más en los lugares que recibían el agua del parqueadero. Si esa agua llegaba a un sumidero, el sumidero recibe menos; la salida de la calle puede cambiar poco.',
    terms: ['pavimento-permeable', 'infiltracion', 'escorrentia'],
  },
  {
    id: 'jardin-lleno',
    title: 'Jardín lleno',
    scenarioId: 'calle-de-prueba',
    question: 'Construimos un jardín de lluvia junto a la calle. Llueve 100 mm/h durante 30 minutos. ¿Guardará toda el agua que le llega?',
    context: 'El jardín está 15 cm más bajo que la cuneta y tiene una abertura en el bordillo. Su suelo infiltra 50 mm/h y puede guardar una cantidad limitada.',
    options: [
      { id: 'toda', text: 'Sí, la guarda toda' },
      { id: 'rebosa', text: 'Guarda una parte y luego rebosa' },
      { id: 'nada', text: 'No le llega agua' },
    ],
    rain: { intensityMmH: 100, durationMin: 30, pattern: 'constante', spatial: 'uniforme' },
    simMinutes: 45,
    change: { kind: 'auto', describe: 'Construir el jardín de lluvia en B.', apply: (iv) => (iv.gardens['jardin-calle'] = true) },
    evaluate: (a, b) => {
      const gIn = b!.gardenIn, gOut = b!.gardenOut;
      const kept = gIn - gOut;
      return {
        outcome: gIn < 0.05 ? 'nada' : gOut > 0.05 * gIn ? 'rebosa' : 'toda',
        observed: [
          `Al jardín entraron ${m3(gIn)} y rebosaron ${m3(gOut)}: se quedó con ${m3(Math.max(0, kept))} (en su charco y en su suelo).`,
          `En todo el sector se infiltraron ${m3(a.infiltrated)} en A y ${m3(b!.infiltrated)} en B.`,
          `Profundidad máxima en el jardín: ${fmtDepth(probe(b!, 'jardin'))}.`,
        ],
        rows: baseRows(a, b!),
        caveat: 'El jardín tiene capacidad limitada: guarda agua en su depresión y en su suelo; cuando se llena, el agua sale otra vez a la calle.',
      };
    },
    explain: 'Un jardín de lluvia funciona como una esponja con borde: recibe agua, la guarda un rato y la deja entrar al suelo poco a poco. Si llega más agua de la que puede infiltrar y guardar, se llena y rebosa.',
    terms: ['jardin-de-lluvia', 'infiltracion', 'almacenamiento-superficial'],
  },
  {
    id: 'lluvia-techos',
    title: 'Lluvia de techos',
    scenarioId: 'ladera-quebrada',
    question: 'Llueven 60 mm/h durante 20 minutos sobre el techo del colegio. ¿Cuánta agua cae solo en ese techo?',
    context: 'En A el agua del techo baja por la bajante al patio. En B se guarda en un depósito de 15 m³.',
    options: [
      { id: 'poca', text: 'Menos de 1 m³' },
      { id: 'media', text: 'Entre 1 y 10 m³' },
      { id: 'mucha', text: 'Más de 10 m³' },
    ],
    rain: { intensityMmH: 60, durationMin: 20, pattern: 'constante', spatial: 'uniforme' },
    simMinutes: 35,
    change: { kind: 'auto', describe: 'Conectar el techo del colegio a un depósito que retiene el agua (B).', apply: (iv) => (iv.tanks['deposito-colegio'] = { on: true, destination: 'retener' }) },
    evaluate: (a, b, sc) => {
      const roof = b!.roofToTank;
      const t = sc.tanks.find((q) => q.id === 'deposito-colegio');
      return {
        outcome: roof < 1 ? 'poca' : roof <= 10 ? 'media' : 'mucha',
        observed: [
          `Sobre el techo del colegio cayeron ${m3(roof)}: es la intensidad × el área del techo × el tiempo.`,
          `El depósito (capacidad ${fmtNum(t?.capacityM3 ?? 0, 0)} m³) guardó ${m3(b!.devices)} y rebosaron ${m3(b!.tankOverflow)}.`,
          `La lluvia total del sector fue la misma en A y B (${m3(a.precipitation)}): el techo se cuenta una sola vez.`,
        ],
        rows: [{ label: 'Lluvia de techos que llega a la calle', a: m3(a.roofToSurface), b: m3(b!.roofToSurface), change: changeText(a.roofToSurface, b!.roofToSurface, 1e-3, m3) }, ...baseRows(a, b!)],
      };
    },
    explain: 'Un techo no deja infiltrar: toda su lluvia baja por la bajante. Guardarla en un depósito evita que llegue de golpe a la calle y permite usarla después, pero solo hasta que el depósito se llena.',
    terms: ['milimetro-de-lluvia', 'escorrentia', 'balance-hidrico'],
  },
  {
    id: 'presupuesto',
    title: 'Presupuesto de puntos',
    scenarioId: 'ladera-quebrada',
    question: `Tienes ${BUDGET} puntos de juego para mejorar el barrio frente a un aguacero de 100 mm/h. ¿Qué combinación eliges?`,
    context: 'En A dos sumideros están parcialmente tapados. Elige cambios en B sin pasarte del presupuesto. Los puntos son del juego: no son pesos ni costos reales.',
    options: [
      { id: 'mejora-todo', text: 'Mejorarán todos los indicadores' },
      { id: 'mixto', text: 'Unos mejorarán y otros no' },
      { id: 'nada', text: 'Casi nada cambiará' },
    ],
    rain: { intensityMmH: 100, durationMin: 20, pattern: 'constante', spatial: 'uniforme' },
    simMinutes: 35,
    setupA: (iv) => {
      iv.drains['sum-esquina'] = 0.7;
      iv.drains['sum-carrera-s'] = 0.6;
    },
    change: { kind: 'presupuesto', describe: 'Elige tus cambios en la herramienta «Presupuesto».' },
    evaluate: (a, b) => {
      const checks = [
        probe(b!, 'esquina') - probe(a, 'esquina'),
        b!.maxAreaAbove - a.maxAreaAbove,
        b!.peakOutlet - a.peakOutlet,
        b!.boundaryOut - a.boundaryOut,
      ];
      const tol = [0.001, 1, 0.0005, 0.05];
      const better = checks.filter((d, i) => d < -tol[i]).length;
      const worse = checks.filter((d, i) => d > tol[i]).length;
      return {
        outcome: better === checks.length ? 'mejora-todo' : better === 0 && worse === 0 ? 'nada' : 'mixto',
        observed: [
          `De 4 indicadores (profundidad en la esquina, área con ≥ 5 cm, caudal pico y volumen de salida), mejoraron ${better} y empeoraron ${worse}.`,
          `Esquina baja: A ${fmtDepth(probe(a, 'esquina'))}, B ${fmtDepth(probe(b!, 'esquina'))}.`,
        ],
        rows: [{ label: 'Profundidad máxima en la esquina', a: fmtDepth(probe(a, 'esquina')), b: fmtDepth(probe(b!, 'esquina')), change: changeText(probe(a, 'esquina'), probe(b!, 'esquina'), 0.0005, fmtDepth) }, ...baseRows(a, b!)],
        caveat: 'Ninguna medida mejora todo en todas partes. Una medida puede aliviar la esquina y no cambiar la quebrada, o al revés.',
      };
    },
    explain: 'Cada medida actúa en un lugar: el jardín y el pavimento permeable retienen e infiltran donde están; limpiar un sumidero ayuda en su esquina; el depósito retiene la lluvia de un techo. Combinar medidas en los lugares por donde pasa el agua suele funcionar mejor.',
    terms: ['balance-hidrico', 'caudal-pico', 'infiltracion'],
  },
];

/** Costos del juego para la misión de presupuesto (puntos, no dinero). */
export function budgetItems(sc: Scenario): { id: string; label: string; cost: number; kind: 'zona' | 'jardin' | 'deposito' | 'sumidero'; target: string; value?: string }[] {
  const items: { id: string; label: string; cost: number; kind: 'zona' | 'jardin' | 'deposito' | 'sumidero'; target: string; value?: string }[] = [];
  for (const d of sc.drains) items.push({ id: `sum:${d.id}`, label: `Limpiar «${d.name}»`, cost: 10, kind: 'sumidero', target: d.id });
  for (const g of sc.gardens) items.push({ id: `jar:${g.id}`, label: g.name, cost: g.cost, kind: 'jardin', target: g.id });
  for (const t of sc.tanks) items.push({ id: `dep:${t.id}`, label: t.name, cost: t.cost, kind: 'deposito', target: t.id });
  for (const z of sc.zones) for (const o of z.options) if (o !== z.cover) items.push({ id: `zona:${z.id}:${o}`, label: `${z.name}: ${o === 'adoquin_permeable' ? 'pavimento permeable' : o === 'grama' ? 'grama' : 'zona verde'}`, cost: z.cost, kind: 'zona', target: z.id, value: o });
  return items;
}

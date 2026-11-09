// Misiones cortas: pregunta → predicción → intervención → explicación.
// Los resultados se calculan SIEMPRE con la simulación: no hay mejoras predeterminadas y el texto se
// construye con los números obtenidos (si algo no mejora, se dice).

import type { Indicators } from '../sim/compare';
import type { Interventions, RainConfig, Scenario } from '../sim/scenario';
import { fmtDepth, fmtNum } from '../render/palette';
import { HAZARD } from '../sim/hazard';

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
  /** Creciente de la quebrada como fracción de la capacidad de su sección de control (misiones de quebrada). */
  creek?: { fraction: number; timeToPeakMin: number; startMin: number; sedimentCv?: number; source?: 'ejemplo' | 'cuenca' };
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
          `El sumidero de la esquina captó ${m3(a.drainTotals['sum-esquina'] ?? 0)} en A y ${m3(b!.drainTotals['sum-esquina'] ?? 0)} en B; entre todos los sumideros, ${m3(a.drained)} en A y ${m3(b!.drained)} en B.`,
          `El agua que no entró al sumidero de la esquina se acumuló en el bajo o siguió calle abajo: salida ${m3(a.boundaryOut)} en A y ${m3(b!.boundaryOut)} en B.`,
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
  {
    id: 'conexiones-erradas',
    title: 'Conexiones erradas',
    scenarioId: 'calle-de-prueba',
    question: 'Algunas casas conectaron sus techos, por error, al alcantarillado de aguas residuales. ¿Qué le pasa a esa tubería cuando llueve fuerte?',
    context: 'A: las dos redes están bien separadas (la lluvia va solo a la red de aguas lluvias). B: cuatro casas del sector y techos de calles de arriba entregan su lluvia al alcantarillado de aguas residuales. Misma lluvia en A y B.',
    options: [
      { id: 'nada', text: 'Nada: esa tubería no recibe lluvia' },
      { id: 'llena', text: 'Se llena, pero aguanta' },
      { id: 'rebosa', text: 'Se llena y las aguas residuales salen a la calle' },
    ],
    rain: { intensityMmH: 60, durationMin: 20, pattern: 'constante', spatial: 'uniforme' },
    simMinutes: 35,
    change: { kind: 'auto', describe: 'Activar las conexiones erradas en B.', apply: (iv) => (iv.erradas = true) },
    evaluate: (a, b) => {
      const ov = b!.sewerOverflow[1], fill = b!.sewerPeakFill[1];
      return {
        outcome: ov > 0.01 ? 'rebosa' : fill > 0.85 ? 'llena' : 'nada',
        observed: [
          `Alcantarillado de aguas residuales: en A trabajó hasta el ${fmtNum(Math.min(1, a.sewerPeakFill[1]) * 100, 0)} % de su diámetro; en B ${b!.sewerPeakFill[1] > 1 ? 'se llenó y trabajó a presión' : `llegó al ${fmtNum(b!.sewerPeakFill[1] * 100, 0)} %`}.`,
          ov > 0.01 ? `En B rebosaron ${m3(ov)} de aguas residuales mezcladas con lluvia por las cámaras, a la calle.` : 'En B no rebosó.',
          `En A, la red de aguas residuales no recibió lluvia: llevó solo el agua usada de las casas (salieron ${m3(a.sewerOut[1])} hacia el interceptor).`,
        ],
        rows: [
          { label: 'Rebose de aguas residuales a la calle', a: m3(a.sewerOverflow[1]), b: m3(ov), change: changeText(a.sewerOverflow[1], ov, 1e-3, m3) },
          { label: 'Hacia el interceptor (aguas residuales)', a: m3(a.sewerOut[1]), b: m3(b!.sewerOut[1]), change: changeText(a.sewerOut[1], b!.sewerOut[1], 1e-3, m3) },
          ...baseRows(a, b!),
        ],
        caveat: 'Las conexiones erradas de este ejercicio son hipotéticas: cuatro techos del sector y 8 000 m² de techos aguas arriba.',
      };
    },
    explain: 'La red de aguas residuales se diseña para el agua usada de las casas, que es poca. Si le llega la lluvia de los techos, se llena, trabaja a presión y rebosa por las cámaras: el agua sucia sale a la calle y llega más agua a la planta de tratamiento. Por eso las dos redes deben ir separadas y cada bajante debe ir a la red de aguas lluvias.',
    terms: ['sistema-separado', 'conexion-errada', 'alcantarillado-sanitario', 'sobrecarga'],
  },
  {
    id: 'creciente-quebrada',
    title: 'La creciente de la quebrada',
    scenarioId: 'ladera-quebrada',
    question: 'Llega por la quebrada una creciente de una vez y media lo que cabe en su cauce. ¿Qué pasará con las casas construidas en la orilla?',
    context: 'Un solo escenario. La creciente entra por la quebrada mientras llueve sobre el barrio. Cuatro casas están construidas a ras de la orilla, dentro del retiro.',
    options: [
      { id: 'cabe', text: 'El agua cabe en el cauce y no llega a las casas' },
      { id: 'retiro', text: 'Se desborda y les llega agua, pero sin poner en riesgo su estructura' },
      { id: 'grave', text: 'Se desborda con tanta fuerza que las casas quedan expuestas a daño estructural' },
    ],
    rain: { intensityMmH: 60, durationMin: 20, pattern: 'constante', spatial: 'uniforme' },
    simMinutes: 35,
    creek: { fraction: 1.5, timeToPeakMin: 6, startMin: 2 },
    change: { kind: 'ninguno', describe: 'Sin intervención: se observa la creciente.' },
    evaluate: (a) => {
      const out = a.creekOutsideMax, over = a.creekOverBankMax, back = a.sewerOverflow[0];
      const orilla = a.damage.buildings.filter((b) => b.id.startsWith('orilla-'));
      const worst = orilla.reduce((m, b) => Math.max(m, b.depth), 0);
      const hz = orilla.reduce((m, b) => Math.max(m, b.hazard), 0);
      return {
        outcome: !orilla.length ? 'cabe' : hz >= 5 ? 'grave' : 'retiro',
        observed: [
          `Entró un caudal pico de ${fmtNum(a.creekPeakIn, 0)} m³/s por la quebrada.`,
          over > 0 ? `En la sección de control el agua subió ${fmtNum(over * 100, 0)} cm por encima de la orilla y pasaron hasta ${fmtNum(out, 1)} m³/s por fuera del cauce.` : 'En la sección de control el agua no pasó la orilla.',
          orilla.length
            ? `Llegó agua a ${orilla.length} de las 4 casas de la orilla: hasta ${fmtDepth(worst)} contra sus muros. Peligro máximo junto a ellas: ${HAZARD[hz].code} (${HAZARD[hz].text.replace(/\.$/, '').toLowerCase()}).`
            : 'No llegó agua a las casas de la orilla.',
          a.vehicles.moved > 0 ? `El agua movió ${a.vehicles.moved} de los ${a.vehicles.total} vehículos estacionados cerca de la quebrada.` : 'Ningún vehículo estacionado se movió.',
          back > 0.01 ? `La quebrada crecida ahogó la descarga de aguas lluvias: la red devolvió ${m3(back)} a la calle por cámaras y sumideros de la carrera sur.` : 'La red de aguas lluvias siguió descargando a la quebrada sin devolver agua a la calle.',
        ],
        rows: [],
        caveat: 'Creciente hipotética (hidrograma triangular). Peligro según la guía australiana AIDR 7-3: no es la zonificación oficial de amenaza de Medellín ni un pronóstico.',
      };
    },
    explain: 'Cada cauce tiene una capacidad: el caudal que cabe hasta la orilla. Cuando llega más, el agua se sale y ocupa el retiro de la quebrada. Las casas construidas a ras de la orilla son las primeras en inundarse, y el peligro no depende solo de la profundidad: también de la velocidad. Por eso el retiro se deja sin construir.',
    terms: ['creciente', 'capacidad-hidraulica', 'retiro-de-quebrada', 'caudal-pico', 'peligro-de-inundacion'],
  },
  {
    id: 'avenida-torrencial',
    title: 'La avenida torrencial',
    scenarioId: 'ladera-quebrada',
    question: 'Baja una avenida torrencial: tres veces y media lo que cabe en el cauce, cargada de lodo y piedras, y sube en solo 3 minutos. ¿Hasta dónde llega el daño?',
    context: 'Un solo escenario. La mezcla de agua y lodo (30 % de sedimentos) entra por la quebrada mientras llueve. El modelo la mueve como agua: muestra el volumen y la velocidad, no el comportamiento del lodo.',
    options: [
      { id: 'orilla', text: 'Solo afecta las casas de la orilla' },
      { id: 'barrio', text: 'Afecta también casas lejos de la quebrada, pero ninguna queda expuesta a colapsar' },
      { id: 'colapso', text: 'Afecta casas lejos de la quebrada y algunas quedan expuestas a colapsar (H6)' },
    ],
    rain: { intensityMmH: 60, durationMin: 20, pattern: 'constante', spatial: 'uniforme' },
    simMinutes: 30,
    creek: { fraction: 3.5, timeToPeakMin: 3, startMin: 2, sedimentCv: 0.3 },
    change: { kind: 'ninguno', describe: 'Sin intervención: se observa la avenida.' },
    evaluate: (a) => {
      const d = a.damage;
      const lejos = d.buildings.filter((b) => !b.id.startsWith('orilla-'));
      const area45 = a.hazardArea[4] + a.hazardArea[5] + a.hazardArea[6];
      return {
        outcome: !lejos.length ? 'orilla' : d.failure > 0 ? 'colapso' : 'barrio',
        observed: [
          `Entró un caudal pico de ${fmtNum(a.creekPeakIn, 0)} m³/s de agua con lodo.`,
          `Llegó agua (10 cm o más junto a la fachada) a ${d.affected} edificaciones: ${d.buildings.length - lejos.length} en la orilla y ${lejos.length} más lejos.`,
          d.severe > 0 ? `${d.severe} quedaron con peligro H5 o mayor (expuestas a daño estructural)${d.failure > 0 ? `, y ${d.failure} con H6 (cualquier edificación puede fallar)` : ''}.` : 'Ninguna quedó con peligro de daño estructural (H5).',
          `Zona donde el agua es peligrosa para cualquier persona (H4 o más): ${fmtNum(area45, 0)} m².`,
          a.vehicles.out > 0 ? `${a.vehicles.out} de los ${a.vehicles.total} vehículos fueron arrastrados fuera del sector.` : `${a.vehicles.moved} de los ${a.vehicles.total} vehículos se movieron.`,
        ],
        rows: [],
        caveat: 'Avenida hipotética. El modelo no simula el lodo como fluido viscoso ni el golpe de piedras y troncos, que en una avenida real aumentan el daño. Peligro según AIDR 7-3, no la zonificación oficial de Medellín.',
      };
    },
    explain: 'Una avenida torrencial sube en minutos y arrastra lodo, piedras y troncos: lleva más volumen que el agua sola y corre muy rápido en las quebradas de ladera. El peligro combina profundidad y velocidad: un metro de agua quieta no es lo mismo que un metro de agua a 3 m/s. Por eso los retiros y las zonas de alto riesgo se definen con estudios y no se construyen.',
    terms: ['avenida-torrencial', 'creciente', 'peligro-de-inundacion', 'retiro-de-quebrada', 'caudal-pico'],
  },
  {
    id: 'cobertura-tapada',
    title: 'La cobertura tapada',
    scenarioId: 'ladera-quebrada',
    question: 'Baja una creciente que cabe sin problema por la cobertura bajo la carrera. En B, troncos y ramas tapan el 90 % de su entrada. ¿Qué pasará?',
    context: 'A y B reciben la misma lluvia y la misma creciente: seis décimas de lo que cabe en el cauce. En A la entrada de la cobertura está libre; en B la tapan troncos desde el comienzo.',
    options: [
      { id: 'nada', text: 'Pasa igual: los cajones son grandes y la vía sigue seca' },
      { id: 'via', text: 'El agua se represa y pasa por encima de la vía, pero no llega a las casas ni mueve carros' },
      { id: 'casas', text: 'El agua se represa, pasa sobre la vía y llega a casas o mueve carros' },
    ],
    rain: { intensityMmH: 60, durationMin: 20, pattern: 'constante', spatial: 'uniforme' },
    simMinutes: 35,
    creek: { fraction: 0.6, timeToPeakMin: 8, startMin: 2 },
    change: {
      kind: 'auto',
      describe: 'En B, los troncos tapan el 90 % del ancho de los cajones de la cobertura desde el comienzo.',
      apply: (iv) => {
        iv.culverts = { ...(iv.culverts ?? {}), 'cobertura-carrera': { obstruction: 0.9, progressive: false } };
      },
    },
    evaluate: (a, b) => {
      const ca = a.culverts[0], cb = b!.culverts[0];
      const nuevas = b!.damage.affected - a.damage.affected;
      const movidos = b!.vehicles.moved - a.vehicles.moved;
      const m3s = (v: number) => `${fmtNum(v, v < 10 ? 1 : 0)} m³/s`;
      const head = (h: number) => (h >= 0 ? `${fmtNum(h * 100, 0)} cm sobre la vía` : `${fmtNum(-h * 100, 0)} cm bajo la vía`);
      return {
        outcome: cb.overMax < 0.1 ? 'nada' : nuevas > 0 || movidos > 0 ? 'casas' : 'via',
        observed: [
          `Llegó un caudal pico de ${m3s(a.creekPeakIn)} por la quebrada. Con la entrada libre caben ${m3s(ca.capacityFree)} antes de que el agua alcance la vía.`,
          `A (libre): pasaron hasta ${m3s(ca.qMax)} por los cajones; el agua llegó a ${head(ca.headOverRoad)}${ca.overMax >= 0.1 ? ` y pasaron hasta ${m3s(ca.overMax)} por encima` : ''}.`,
          `B (tapada 90 %): solo pasaron ${m3s(cb.qMax)} por los cajones; el agua subió a ${head(cb.headOverRoad)}${cb.overMax >= 0.1 ? ` y pasaron hasta ${m3s(cb.overMax)} por encima de la vía (${fmtNum(cb.overVol, 0)}\u00a0m³ en total)` : ''}.`,
          nuevas > 0 ? `En B llegó agua a ${nuevas} edificaciones más que en A${b!.damage.severe > a.damage.severe ? `; ${b!.damage.severe - a.damage.severe} más quedaron con peligro H5 o mayor` : ''}.` : 'En B no llegó agua a más edificaciones que en A.',
          movidos > 0 ? `El agua movió ${movidos} vehículos más en B que en A.` : 'En B el agua no movió más vehículos que en A.',
        ],
        rows: [
          { label: 'Caudal máximo por los cajones', a: m3s(ca.qMax), b: m3s(cb.qMax), change: changeText(ca.qMax, cb.qMax, 0.05, m3s) },
          { label: 'Caudal máximo sobre la vía', a: m3s(ca.overMax), b: m3s(cb.overMax), change: changeText(ca.overMax, cb.overMax, 0.05, m3s) },
          { label: 'Agua que pasó sobre la vía', a: `${fmtNum(ca.overVol, 0)}\u00a0m³`, b: `${fmtNum(cb.overVol, 0)}\u00a0m³`, change: changeText(ca.overVol, cb.overVol, 1, (v) => `${fmtNum(v, 0)}\u00a0m³`) },
          { label: 'Edificaciones con agua', a: String(a.damage.affected), b: String(b!.damage.affected), change: changeText(a.damage.affected, b!.damage.affected, 0.5, (v) => fmtNum(v, 0)) },
          { label: 'Vehículos movidos', a: String(a.vehicles.moved), b: String(b!.vehicles.moved), change: changeText(a.vehicles.moved, b!.vehicles.moved, 0.5, (v) => fmtNum(v, 0)) },
        ],
        caveat: 'Cobertura y obstrucción hipotéticas; hidráulica de alcantarillas según la guía HDS-5 de la FHWA. Los troncos se representan como una reducción del ancho útil de los cajones. No es el diseño ni el estado de una obra real, ni un pronóstico.',
      };
    },
    explain: 'Una cobertura deja pasar solo el agua que cabe por su boca. Si troncos, ramas o basura la tapan, cabe mucho menos: el agua se represa detrás del terraplén, sube hasta la vía y pasa por encima, con fuerza, hacia donde no debía ir. Por eso las bocas de las coberturas se limpian antes de las temporadas de lluvia y no se arrojan basuras ni escombros a las quebradas.',
    terms: ['cobertura-de-quebrada', 'represamiento', 'creciente', 'capacidad-hidraulica', 'peligro-de-inundacion'],
  },
  {
    id: 'cuenca-urbanizada',
    title: 'La cuenca urbanizada',
    scenarioId: 'ladera-quebrada',
    question: 'Cae un aguacero muy fuerte, 80 mm en una hora, sobre el barrio y sobre toda la cuenca de la quebrada. En A la cuenca tiene bosque; en B está urbanizada. ¿Qué cambia en el barrio?',
    context: 'A y B reciben exactamente la misma lluvia. La creciente se calcula con esa lluvia cayendo en una cuenca de 4 km² aguas arriba; una estación de nivel a 2,5 km da las alertas. Solo cambia cómo está la cuenca.',
    options: [
      { id: 'igual', text: 'Casi nada: la lluvia es la misma, así que la quebrada crece igual' },
      { id: 'mas', text: 'Llega más agua a la quebrada, pero no alcanza a llegar a las casas' },
      { id: 'menos-tiempo', text: 'Llega más agua y más rápido: la quebrada se desborda y hay menos tiempo para avisar' },
    ],
    rain: { intensityMmH: 80, durationMin: 60, pattern: 'constante', spatial: 'uniforme' },
    simMinutes: 110,
    creek: { fraction: 0, timeToPeakMin: 6, startMin: 0, source: 'cuenca' },
    setupA: (iv) => {
      iv.basinCover = 'bosque';
    },
    change: {
      kind: 'auto',
      describe: 'En B, la cuenca de la quebrada está urbanizada: techos, vías y barrios densos en vez de bosque.',
      apply: (iv) => {
        iv.basinCover = 'urbanizada';
      },
    },
    evaluate: (a, b) => {
      const ba = a.basin!, bb = b!.basin!;
      const wa = a.warning!, wb = b!.warning!;
      const m3s = (v: number) => `${fmtNum(v, v < 10 ? 1 : 0)}\u00a0m³/s`;
      const min = (t: number) => `minuto ${fmtNum(t / 60, 0)}`;
      const top = (w: typeof wa) => [...w.events].reverse().find((e) => e.id !== 'lluvia' && e.t >= 0);
      const roja = (w: typeof wa) => w.events.find((e) => e.id === 'roja')!;
      const casa = (w: typeof wa, name: string) => {
        if (w.firstWetT < 0) return `En ${name} no llegó agua a ninguna casa.`;
        const r = roja(w);
        const lead = r.t >= 0 ? w.firstWetT - r.t : null;
        return `En ${name} el agua llegó a la primera casa en el ${min(w.firstWetT)}${lead === null ? ', sin alerta roja antes' : lead >= 0 ? `: ${fmtNum(lead / 60, 0)} min después de la alerta roja` : `: ${fmtNum(-lead / 60, 0)} min antes de la alerta roja`}.`;
      };
      const flooded = b!.damage.affected > a.damage.affected || (wb.firstWetT >= 0 && wa.firstWetT < 0);
      const earlier = bb.tPeak < ba.tPeak - 60;
      return {
        outcome: bb.peak < 1.1 * ba.peak ? 'igual' : flooded ? 'menos-tiempo' : 'mas',
        observed: [
          `Cayeron ${fmtNum(ba.rainMm, 0)} mm. Con bosque corrieron hacia la quebrada ${fmtNum(ba.runoffMm, 0)} mm (${fmtNum((ba.runoffMm / ba.rainMm) * 100, 0)} %); con la cuenca urbanizada, ${fmtNum(bb.runoffMm, 0)} mm (${fmtNum((bb.runoffMm / bb.rainMm) * 100, 0)} %).`,
          `Pico en el barrio: A ${m3s(ba.peak)} en el ${min(ba.tPeak)}; B ${m3s(bb.peak)} en el ${min(bb.tPeak)}${earlier ? `, ${fmtNum((ba.tPeak - bb.tPeak) / 60, 0)} min antes` : ''}. La cuenca urbanizada responde en ${fmtNum(bb.lagMin, 0)} min; la de bosque, en ${fmtNum(ba.lagMin, 0)} min.`,
          `Alertas en la estación: A ${top(wa) ? `llegó a ${top(wa)!.name.toLowerCase()} (${min(top(wa)!.t)})` : 'sin alerta por nivel'}; B ${top(wb) ? `llegó a ${top(wb)!.name.toLowerCase()} (${min(top(wb)!.t)})` : 'sin alerta por nivel'}.`,
          casa(wa, 'A'),
          casa(wb, 'B'),
          `Edificaciones con agua: A ${a.damage.affected}, B ${b!.damage.affected}. Vehículos movidos: A ${a.vehicles.moved}, B ${b!.vehicles.moved}.`,
        ],
        rows: [
          { label: 'Escorrentía de la cuenca', a: `${fmtNum(ba.runoffMm, 0)}\u00a0mm`, b: `${fmtNum(bb.runoffMm, 0)}\u00a0mm`, change: changeText(ba.runoffMm, bb.runoffMm, 0.1, (v) => `${fmtNum(v, 0)}\u00a0mm`) },
          { label: 'Caudal pico en el barrio', a: m3s(ba.peak), b: m3s(bb.peak), change: changeText(ba.peak, bb.peak, 0.05, m3s) },
          { label: 'Minuto del pico', a: fmtNum(ba.tPeak / 60, 0), b: fmtNum(bb.tPeak / 60, 0), change: changeText(ba.tPeak / 60, bb.tPeak / 60, 0.5, (v) => `${fmtNum(v, 0)}\u00a0min`) },
          { label: 'Edificaciones con agua', a: String(a.damage.affected), b: String(b!.damage.affected), change: changeText(a.damage.affected, b!.damage.affected, 0.5, (v) => fmtNum(v, 0)) },
        ],
        caveat: 'Cuenca, estación y umbrales de aviso didácticos; métodos del NRCS (número de curva, retardo e hidrograma unitario). No es un pronóstico ni el sistema de alerta real del Valle de Aburrá.',
      };
    },
    explain: 'Con bosque, buena parte de la lluvia entra al suelo y el agua que corre tarda en llegar a la quebrada. Cuando la cuenca se llena de techos y vías, casi toda la lluvia corre y llega junta y rápido: la creciente es más grande y más temprana. Por eso importa cuidar los bosques de las cuencas y por eso existen las estaciones y las alertas: cada minuto de aviso sirve para salir de la orilla.',
    terms: ['cuenca', 'alerta-temprana', 'escorrentia', 'infiltracion', 'creciente', 'caudal-pico'],
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

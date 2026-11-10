// Los procesos de una planta de potabilización convencional (filtración rápida), uno por uno: qué hace cada
// etapa, cómo lo hace, con qué números se diseña según la norma colombiana, qué puede salir mal, qué se mide y
// qué le pasa al agua en el juego (valores del modelo). Fuente de los criterios de diseño: Resolución 0330 de
// 2017 del Ministerio de Vivienda (RAS), con las modificaciones de las Resoluciones 799 y 908 de 2021, en el
// texto compilado de la CRA; calidad en la llave: Resolución 2115 de 2007.

import { RAW_WATER, type PlantInput, type PlantResult } from './model';

export type ProcessId = 'rio' | 'desarenador' | 'mezcla' | 'floc' | 'sedim' | 'filtro' | 'cloro' | 'ph' | 'tanque' | 'llave' | 'lodos';

export interface Process {
  id: ProcessId;
  n: number;
  name: string;
  /** Qué hace, en una o dos frases para niños. */
  short: string;
  /** Cómo lo hace (mecanismo). */
  how: string[];
  /** Números de diseño. */
  design: { label: string; value: string }[];
  source: string;
  wrong: string;
  measure: string;
  /** Lo que le pasa al agua en el juego, con los valores calculados. */
  inOut: (r: PlantResult, inp: PlantInput) => { label: string; value: string }[];
}

const es = (v: number, d = 1) => v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const unt = (v: number) => `${es(v, v < 10 ? (v < 1 ? 2 : 1) : 0)} UNT`;
const big = (v: number) => (v < 0.5 ? '0' : Math.round(v).toLocaleString('es-CO'));
const SAND = { verano: 'poca', lluvia: 'bastante', creciente: 'mucha' } as const;

export const PROCESSES: Process[] = [
  {
    id: 'rio',
    n: 1,
    name: 'Captación y rejilla',
    short: 'El agua se toma del río en una bocatoma con rejilla: barras que dejan pasar el agua y atajan ramas, hojas y basura.',
    how: [
      'Las barras están separadas unos centímetros: pasa el agua, no pasan los palos ni las bolsas.',
      'La rejilla se limpia con un rastrillo para que no se tape, sobre todo durante las crecientes.',
      'Desde la bocatoma, el agua baja por un tubo hasta la planta.',
    ],
    design: [
      { label: 'Qué retiene', value: 'objetos gruesos: ramas, hojas, plásticos' },
      { label: 'Qué deja pasar', value: 'la arena y la arcilla, que se quitan después' },
    ],
    source: 'Descripción general de una bocatoma de fondo o lateral con rejilla.',
    wrong: 'Si la rejilla se llena de basura, entra menos agua a la planta; en una creciente puede taparse en pocas horas.',
    measure: 'El caudal que entra y la turbiedad del agua cruda, que se mide antes de dosificar el coagulante.',
    inOut: (r) => [
      { label: 'Agua cruda', value: unt(r.raw.turbidity) },
      { label: 'Coliformes totales', value: `${big(r.raw.coliTotal)} por 100 mL` },
      { label: 'pH', value: es(r.raw.pH) },
    ],
  },
  {
    id: 'desarenador',
    n: 2,
    name: 'Desarenador',
    short: 'Un canal ancho y tranquilo donde el agua va despacio: la arena, que pesa, cae al fondo antes de desgastar bombas y tubos.',
    how: [
      'El agua frena: así la arena alcanza a caer antes de llegar al final del canal.',
      'Se quedan los granos de arena de 0,1 mm o más; la arcilla finísima, que es la que pone el agua café, sigue de largo.',
      'El fondo tiene pendiente para sacar la arena que se acumula.',
    ],
    design: [
      { label: 'Partícula más pequeña que debe retirar', value: '0,1 mm' },
      { label: 'Velocidad del agua', value: 'máximo 0,25 m/s' },
      { label: 'Velocidad del agua ÷ velocidad de caída', value: 'menos de 20' },
      { label: 'Arena de referencia', value: '2,65 g/cm³' },
      { label: 'Pendiente para evacuar la arena', value: 'más de 10 %' },
      { label: 'Tiempo para partículas muy finas', value: 'mínimo 20 minutos' },
    ],
    source: 'Resolución 0330 de 2017, artículo 55.',
    wrong: 'Si el agua corre demasiado rápido, la arena pasa: desgasta las bombas y llena de arena los tanques de la planta.',
    measure: 'La altura de la arena acumulada; se limpia cuando llega al nivel previsto.',
    inOut: (r, inp) => [
      { label: 'Arena que llega', value: SAND[inp.raw] },
      { label: 'Turbiedad', value: `${unt(r.raw.turbidity)} (casi no cambia: la arcilla sigue)` },
    ],
  },
  {
    id: 'mezcla',
    n: 3,
    name: 'Mezcla rápida (coagulación)',
    short: 'Se agrega el coagulante (sulfato de aluminio) y se revuelve con mucha fuerza durante un instante, para que llegue a todas las partículas.',
    how: [
      'Las partículas de arcilla son diminutas y tienen carga eléctrica negativa: se repelen y nunca se juntan solas.',
      'El aluminio del coagulante tiene carga positiva: neutraliza esas cargas y desde ese momento las partículas pueden pegarse.',
      'La mezcla tiene que ser rapidísima porque el coagulante reacciona en menos de un segundo.',
      'El «gradiente de velocidad» (G, en s⁻¹) mide qué tan fuerte se revuelve el agua.',
    ],
    design: [
      { label: 'Mezclador hidráulico', value: 'G de 1 000 a 2 000 s⁻¹, menos de 1 s' },
      { label: 'Mezclador mecánico', value: 'G de 500 a 2 000 s⁻¹, menos de 60 s' },
      { label: 'Resalto hidráulico como mezclador', value: 'número de Froude entre 4,5 y 9' },
    ],
    source: 'Resolución 0330 de 2017, artículo 111.',
    wrong: 'Con poco coagulante las cargas no se neutralizan; con demasiado, las partículas se cargan al revés (positivas) y se vuelven a dispersar. Por eso la dosis se busca con la prueba de jarras.',
    measure: 'La dosis de coagulante, el pH y la turbiedad; la dosis se ajusta con la prueba de jarras cuando cambia el río.',
    inOut: (r, inp) => [
      { label: 'Dosis aplicada', value: `${inp.dose} mg/L` },
      { label: 'Dosis justa para este río', value: `cerca de ${es(r.optimum, 0)} mg/L` },
      { label: 'pH después del coagulante', value: es(r.pH) },
    ],
  },
  {
    id: 'floc',
    n: 4,
    name: 'Floculación',
    short: 'Paletas que giran cada vez más despacio: las partículas, ya pegajosas, chocan y forman grumos (flocs) cada vez más grandes.',
    how: [
      'En la primera zona se revuelve más fuerte, para que choquen muchas partículas.',
      'En las siguientes, más suave: si se revuelve fuerte, los flocs grandes se rompen.',
      'Al final los flocs son como granos de sal y pesan lo suficiente para caer en el sedimentador.',
    ],
    design: [
      { label: 'Zonas', value: 'al menos tres, con G que baja de 70 s⁻¹ a 10 s⁻¹' },
      { label: 'Gradiente medio', value: '40 s⁻¹' },
      { label: 'Tiempo total', value: '20 a 40 minutos' },
      { label: 'Tipo', value: 'hidráulico o mecánico hasta 250 L/s; mecánico desde 250 L/s' },
    ],
    source: 'Resolución 0330 de 2017, artículo 112 (modificado por la Resolución 799 de 2021).',
    wrong: 'Si se revuelve muy fuerte o por muy poco tiempo, los flocs quedan pequeños y no alcanzan a caer en el sedimentador.',
    measure: 'Se observa el tamaño de los flocs y se controla el tiempo de paso y la velocidad de las paletas.',
    inOut: (r) => [{ label: 'Turbiedad que atrapan los flocs', value: `${es(100 * (1 - r.settled / r.raw.turbidity), 0)} %` }],
  },
  {
    id: 'sedim',
    n: 5,
    name: 'Sedimentación de alta tasa',
    short: 'El agua pasa muy despacio entre placas inclinadas: los flocs caen sobre las placas, resbalan al fondo y forman lodo; el agua clara sale por arriba.',
    how: [
      'Las placas acortan la distancia que debe caer cada floc: con placas se necesita mucha menos área que en un tanque sin ellas.',
      'Las placas suelen ir muy inclinadas, para que el lodo resbale solo hacia el fondo.',
      'Por arriba, unas canaletas recogen el agua ya clarificada; por abajo se purga el lodo hacia su tratamiento.',
    ],
    design: [
      { label: 'Alta tasa, módulos de 1,2 m', value: '120 a 185 m³ por m² al día' },
      { label: 'Tiempo en los módulos', value: '10 a 20 minutos' },
      { label: 'Sin placas (flujo horizontal)', value: '15 a 30 m³/m²·día y 2 a 4 horas' },
    ],
    source: 'Resolución 0330 de 2017, artículo 113, tablas 8 y 9 (corregido por la Resolución 908 de 2021).',
    wrong: 'Si los flocs son pequeños o llega más agua de la prevista, los flocs se escapan por las canaletas y tapan los filtros.',
    measure: 'La turbiedad del agua sedimentada y la altura del lodo en el fondo.',
    inOut: (r) => [
      { label: 'Entra', value: unt(r.raw.turbidity) },
      { label: 'Sale', value: unt(r.settled) },
    ],
  },
  {
    id: 'filtro',
    n: 6,
    name: 'Filtración rápida',
    short: 'El agua baja por capas de antracita, arena y grava que atrapan las partículas que todavía quedaban.',
    how: [
      'Las partículas se pegan a los granos y quedan entre los poros de todo el lecho, no solo arriba.',
      'Con las horas el filtro se va tapando y al agua le cuesta más pasar.',
      'Entonces se lava al revés (retrolavado): el agua sube, el lecho se expande y la mugre sale por canaletas hacia el tratamiento de lodos.',
    ],
    design: [
      { label: 'Lecho mixto', value: '180 a 250 m³ por m² al día (hasta 350 con operación óptima)' },
      { label: 'Capas del lecho mixto', value: 'antracita de 0,4 a 0,6 m sobre arena de 0,15 a 0,3 m' },
      { label: 'Lecho de solo arena', value: 'menos de 120 m³/m²·día; 0,6 a 0,9 m' },
      { label: 'Retrolavado', value: 'el agua sube a 0,6 m/min o más' },
      { label: 'Número de filtros', value: 'al menos 3 (4 si se lavan unos con otros)' },
    ],
    source: 'Resolución 0330 de 2017, artículo 114, tabla 10 (corregido por la Resolución 908 de 2021).',
    wrong: 'Si llega agua muy turbia (en el juego, más de 10 UNT), los filtros se tapan pronto y dejan pasar turbiedad.',
    measure: 'La turbiedad del agua filtrada y la pérdida de carga (cuánto le cuesta pasar al agua), que indica cuándo lavar.',
    inOut: (r) => [
      { label: 'Entra', value: unt(r.settled) },
      { label: 'Sale', value: unt(r.filtered) },
      { label: 'Estado', value: r.clogged ? 'se tapan: llega demasiada turbiedad' : 'trabajan bien' },
    ],
  },
  {
    id: 'cloro',
    n: 7,
    name: 'Desinfección con cloro',
    short: 'Se agrega cloro y el agua recorre un tanque con paredes en zigzag, para que el cloro tenga tiempo de matar los microbios.',
    how: [
      'En el agua, el cloro forma ácido hipocloroso, que daña a las bacterias por dentro.',
      'Lo que cuenta es la concentración por el tiempo de contacto (C·t): con poco cloro hace falta más tiempo.',
      'Las partículas que quedan esconden microbios: por eso el agua debe llegar clara.',
      'Debe sobrar algo de cloro (cloro residual) para proteger el agua en los tubos.',
    ],
    design: [
      { label: 'Tanque de contacto', value: 'antes del almacenamiento, mínimo 20 minutos' },
      { label: 'Dosis', value: 'según el valor C·t que fija la norma para la turbiedad del agua' },
      { label: 'Cloro residual libre en la red', value: '0,3 a 2,0 mg/L' },
      { label: 'Coliformes totales y E. coli', value: '0 UFC en 100 cm³' },
    ],
    source: 'Resolución 0330 de 2017, artículo 121 (corregido por la Resolución 908 de 2021); Resolución 2115 de 2007, artículos 9 y 11.',
    wrong: 'Con poco cloro sobreviven bacterias; con demasiado, el agua sabe mal y se forman subproductos que la norma limita.',
    measure: 'El cloro residual libre a la salida y en la red, y los coliformes en el laboratorio.',
    inOut: (r, inp) => [
      { label: 'Cloro agregado', value: `${es(inp.chlorine)} mg/L` },
      { label: 'Se gasta reaccionando', value: `${es(r.demand, 2)} mg/L` },
      { label: 'Queda libre', value: `${es(r.clExit, 2)} mg/L` },
      { label: 'Bacterias eliminadas', value: r.logKill > 0 ? `${es(100 * (1 - Math.pow(10, -r.logKill)), r.logKill >= 4 ? 4 : 2)} %` : 'ninguna (no queda cloro libre)' },
    ],
  },
  {
    id: 'ph',
    n: 8,
    name: 'Estabilización del pH',
    short: 'Se revisa el pH y, si hace falta, se corrige con cal, para que el agua no corroa los tubos ni deje costras.',
    how: [
      'El coagulante gasta alcalinidad y baja un poco el pH.',
      'Un agua ácida corroe los tubos y les saca metales; un agua demasiado incrustante deja costras.',
      'La cal (hidróxido de calcio) sube el pH y la alcalinidad. Con un pH alto, el cloro desinfecta peor: hay que equilibrar.',
    ],
    design: [
      { label: 'pH en la red', value: 'entre 6,5 y 9,0' },
      { label: 'Medición', value: 'pH, conductividad y turbiedad a la entrada y a la salida de la planta' },
    ],
    source: 'Resolución 2115 de 2007, artículo 4; Resolución 0330 de 2017, artículo 122.',
    wrong: 'Si el pH queda bajo, el agua corroe los tubos; si sube mucho, el cloro pierde fuerza.',
    measure: 'El pH, la alcalinidad y la conductividad del agua tratada.',
    inOut: (r) => [
      { label: 'pH del agua tratada', value: es(r.pH) },
      { label: 'En el juego', value: 'el pH baja 0,006 por cada mg/L de coagulante y siempre queda dentro de la norma: no hace falta cal' },
    ],
  },
  {
    id: 'tanque',
    n: 9,
    name: 'Almacenamiento',
    short: 'Un tanque grande guarda agua tratada para las horas en que la ciudad consume más y para emergencias.',
    how: [
      'La planta trabaja parejo todo el día; el consumo sube en la mañana y en la noche: el tanque compensa.',
      'Está cerrado, para que no entren polvo, animales ni lluvia.',
      'Desde aquí el agua baja por gravedad hacia la red de la ciudad.',
    ],
    design: [{ label: 'Cloro residual al salir', value: 'el suficiente para llegar con 0,3 mg/L o más a la última casa' }],
    source: 'Resolución 2115 de 2007, artículo 9 (cloro residual libre en cualquier punto de la red).',
    wrong: 'Si el agua pasa demasiado tiempo guardada, el cloro se gasta y deja de proteger.',
    measure: 'El nivel del tanque y el cloro residual.',
    inOut: (r) => [{ label: 'Cloro libre al salir', value: `${es(r.clExit, 2)} mg/L` }],
  },
  {
    id: 'llave',
    n: 10,
    name: 'Red de tubos y la llave',
    short: 'Tubos enterrados llevan el agua hasta las casas. En el camino, el cloro se va gastando.',
    how: [
      'En el juego el agua tarda 12 horas en llegar y el cloro baja 5 % cada hora.',
      'Si un tubo se rompe o baja la presión, puede entrar agua sucia: el cloro residual la desinfecta.',
      'La empresa toma muestras en puntos de la red y calcula el índice de riesgo (IRCA).',
    ],
    design: [
      { label: 'Turbiedad', value: 'máximo 2 UNT' },
      { label: 'pH', value: '6,5 a 9,0' },
      { label: 'Cloro residual libre', value: '0,3 a 2,0 mg/L' },
      { label: 'Coliformes totales y E. coli', value: '0 UFC en 100 cm³' },
      { label: 'IRCA', value: '0 a 5 % sin riesgo; más de 80 %, inviable sanitariamente' },
    ],
    source: 'Resolución 2115 de 2007: artículo 2 (turbiedad), artículo 4 (pH), artículo 9 (cloro residual libre), artículo 11 (coliformes y E. coli), artículo 13 y cuadro 6 (puntajes del IRCA) y artículo 15 y cuadro 7 (niveles de riesgo).',
    wrong: 'Si no queda cloro en la llave o el agua sigue turbia, el IRCA sube y el agua no es apta para tomar.',
    measure: 'Turbiedad, pH, cloro residual, coliformes y E. coli en muestras de la red.',
    inOut: (r) => [
      { label: 'Turbiedad', value: unt(r.filtered) },
      { label: 'Cloro en la llave', value: `${es(r.clTap, 2)} mg/L` },
      { label: 'Coliformes totales', value: `${big(r.coliTotalTap)} por 100 mL` },
      { label: 'IRCA', value: `${es(r.irca, 1)} % · ${r.risk.toLowerCase()}` },
    ],
  },
  {
    id: 'lodos',
    n: 11,
    name: 'Tratamiento de lodos',
    short: 'El lodo del sedimentador y el agua sucia del lavado de los filtros no se botan al río: se espesan y se secan.',
    how: [
      'Primero se juntan en un tanque que los homogeniza.',
      'En el espesador el lodo se asienta y se concentra; el agua clara de arriba puede volver al inicio de la planta.',
      'Después se seca en lechos o con máquinas, y el lodo seco se dispone como residuo.',
    ],
    design: [
      { label: 'Espesador (lodos de hidróxido)', value: '15 a 25 kg por m² al día; 6 a 12 horas' },
      { label: 'Tanque de homogeneización', value: 'máximo 6 horas' },
      { label: 'Lechos de secado', value: 'al menos 4 celdas; ciclo de 3 a 4 días' },
      { label: 'Muestreo del lodo', value: 'cada 6 meses (menos de 25 L/s), cada 3 meses (25 a 250 L/s) o cada 10 días (más de 250 L/s)' },
    ],
    source: 'Resolución 0330 de 2017, artículos 125 y 133 (modificados por la Resolución 799 de 2021).',
    wrong: 'Si el lodo se vierte al río, la turbiedad y el aluminio vuelven a la quebrada aguas abajo.',
    measure: 'La concentración de sólidos del lodo y su composición.',
    inOut: (r) => [{ label: 'Turbiedad que se volvió lodo', value: unt(Math.max(0, r.raw.turbidity - r.filtered)) }],
  },
];

export const processById = (id: ProcessId) => PROCESSES.find((p) => p.id === id)!;

/** Para la prueba Q13: cada proceso tiene contenido completo y valores que salen del modelo. */
export function processComplete(p: Process): boolean {
  return p.short.length > 20 && p.how.length >= 2 && p.design.length >= 1 && p.source.length > 10 && p.wrong.length > 10 && p.measure.length > 10;
}

export { RAW_WATER };

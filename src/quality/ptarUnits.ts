// Las once partes de la planta de tratamiento de aguas residuales del juego, una por una: qué hace cada una,
// cómo lo hace, con qué rangos se diseña, qué puede salir mal, qué se mide y qué le pasa al agua en el juego
// (valores del modelo de ptar.ts). Los rangos de diseño son valores típicos de la literatura técnica (Metcalf y
// Eddy, Wastewater Engineering); la calidad de la descarga se compara con la Resolución 0631 de 2015.

import { PTAR_DESIGN, RES_0631, WEATHER, type PtarInput, type PtarResult } from './ptar';

export type PtarUnitId = 'llegada' | 'rejas' | 'desarenador' | 'primario' | 'reactor' | 'secundario' | 'uv' | 'descarga' | 'espesador' | 'digestor' | 'deshidratacion';

export interface PtarUnit {
  id: PtarUnitId;
  n: number;
  name: string;
  /** Nombre corto para la etiqueta de la escena. */
  tag: string;
  short: string;
  how: string[];
  design: { label: string; value: string }[];
  source: string;
  wrong: string;
  measure: string;
  inOut: (r: PtarResult, inp: PtarInput) => { label: string; value: string }[];
}

const es = (v: number, d = 1) => v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
const mg = (v: number) => `${es(v, v < 10 ? 1 : 0)} mg/L`;
const big = (v: number) => (v < 0.5 ? '0' : v < 1e6 ? Math.round(v).toLocaleString('es-CO') : `${es(v / 1e6, v < 1e7 ? 1 : 0)} millones`);
const m3 = (v: number) => `${Math.round(v).toLocaleString('es-CO')} m³/día`;
const ls = (v: number) => `${Math.round((v * 1000) / 86400).toLocaleString('es-CO')} L/s`;
const ME = 'Metcalf y Eddy, Wastewater Engineering: Treatment and Resource Recovery (5.ª ed., 2014), rangos típicos';

export const PTAR_UNITS: PtarUnit[] = [
  {
    id: 'llegada',
    n: 1,
    name: 'Llegada y aliviadero',
    tag: 'Llegada',
    short: 'Por el colector llega todo lo que se va por los desagües de las casas. Si llueve y el tubo trae más agua de la que cabe en la planta, el sobrante se va por el aliviadero directo al río, sin tratar.',
    how: [
      'El colector es un tubo grande que recoge las aguas residuales de muchos barrios y baja por gravedad hasta la planta.',
      'Muchas ciudades tienen tramos de alcantarillado combinado: por el mismo tubo bajan el agua usada y la lluvia.',
      'El aliviadero es un muro bajo (vertedero): mientras el agua no lo supera, todo entra a la planta; cuando lo supera, el exceso sale hacia el río.',
    ],
    design: [
      { label: 'Caudal de diseño de cada línea del juego', value: `${m3(PTAR_DESIGN.popPerLine * 0.102)} (50 000 habitantes)` },
      { label: 'Caudal máximo que entra a cada línea', value: `${es(PTAR_DESIGN.peak, 1)} veces el de diseño` },
      { label: 'Agua usada que vuelve al alcantarillado', value: '102 litros por persona al día' },
    ],
    source: 'Valores del juego; caudal por persona del modelo de la quebrada (120 L de consumo × 0,85 de retorno).',
    wrong: 'Con un aguacero, el aliviadero manda al río agua sucia mezclada con lluvia: basura, materia orgánica y microbios llegan al río sin pasar por la planta.',
    measure: 'El caudal que llega (con un canal de medición) y cuántas veces y cuánto tiempo rebosa el aliviadero.',
    inOut: (r) => [
      { label: 'Agua que llega', value: `${m3(r.Qin)} (${ls(r.Qin)})` },
      { label: 'Cabe en la planta', value: m3(r.Qcap) },
      { label: 'Sale por el aliviadero sin tratar', value: r.Qbypass > 0 ? `${m3(r.Qbypass)} (${es(r.bypassPct, 0)} %)` : 'nada' },
    ],
  },
  {
    id: 'rejas',
    n: 2,
    name: 'Rejas',
    tag: 'Rejas',
    short: 'Barras de metal atajan lo que nunca debió irse por el inodoro o el sifón: toallitas, plásticos, pelo, palos. Un rastrillo las limpia y la basura va a un contenedor.',
    how: [
      'Primero una reja gruesa, con barras separadas unos centímetros; después una fina, de pocos milímetros.',
      'Un rastrillo mecánico sube por las barras y deja caer lo atajado en una banda que lo lleva al contenedor.',
      'Lo retirado se escurre y se lleva al relleno sanitario: no se puede reciclar porque está contaminado.',
    ],
    design: [
      { label: 'Rejas gruesas', value: 'separación de 6 a 150 mm' },
      { label: 'Rejas finas', value: 'menos de 6 mm' },
      { label: 'Velocidad del agua entre las barras', value: 'de 0,6 a 1,0 m/s' },
      { label: 'Material retenido (rejas finas)', value: 'del orden de decenas de litros por cada 1 000 m³' },
    ],
    source: ME,
    wrong: 'Las toallitas «desechables» no se deshacen: tapan las rejas y enredan las bombas. Con la lluvia llega mucha más basura de golpe.',
    measure: 'Cuánta basura se saca por día y la diferencia de nivel del agua antes y después de la reja (si crece, se está tapando).',
    inOut: (r) => [
      { label: 'Basura retirada', value: `${Math.round(r.trashLD).toLocaleString('es-CO')} litros por día` },
      { label: 'Agua que pasa', value: m3(r.Qtreat) },
    ],
  },
  {
    id: 'desarenador',
    n: 3,
    name: 'Desarenador y desengrasador',
    tag: 'Desarenador',
    short: 'Un canal donde el agua frena: la arena cae al fondo y la grasa sube a la superficie, donde se recoge. Así no desgastan las bombas ni tapan los tanques.',
    how: [
      'Unas burbujas de aire hacen girar el agua: la arena, pesada, cae; la materia orgánica, liviana, sigue con el agua.',
      'La grasa flota y se acumula en una zona tranquila del canal, de donde la retira un barredor.',
      'Una bomba saca la arena del fondo y un clasificador la lava y la escurre.',
    ],
    design: [
      { label: 'Tiempo del agua en un desarenador aireado', value: 'de 2 a 5 minutos (caudal máximo)' },
      { label: 'Arena que se quiere retirar', value: 'granos de 0,2 mm o más' },
      { label: 'Grasas que se retiran en el juego', value: 'la mitad' },
    ],
    source: ME,
    wrong: 'Si la arena pasa, se acumula en el fondo del reactor y del digestor y les quita volumen. Si la grasa pasa, hace espuma y costras.',
    measure: 'La arena retirada por día y las grasas y aceites antes y después.',
    inOut: (r) => [
      { label: 'Arena retirada', value: `${Math.round(r.sandLD).toLocaleString('es-CO')} litros por día` },
      { label: 'Grasas y aceites', value: `${mg(r.raw.gya)} → ${mg(r.pre.gya)}` },
      { label: 'Grasas retiradas', value: `${es(r.fogKgD, 0)} kg por día` },
    ],
  },
  {
    id: 'primario',
    n: 4,
    name: 'Sedimentador primario',
    tag: 'Primario',
    short: 'Un tanque redondo y grande donde el agua se queda casi quieta un par de horas: lo que pesa cae al fondo como lodo y un puente que gira lo empuja al centro.',
    how: [
      'El agua entra por el centro y sale despacio por un canal alrededor del borde.',
      'Las partículas que pesan más que el agua caen; las grasas que quedan flotan y una barredora las recoge.',
      'Quita cerca de la mitad de los sólidos y un tercio de la materia orgánica sin gastar casi energía: lo que se quita aquí ya no hay que airearlo.',
    ],
    design: [
      { label: 'Tiempo de retención', value: 'de 1,5 a 2,5 horas' },
      { label: 'Carga superficial (caudal medio)', value: 'de 30 a 50 m³ por m² al día' },
      { label: 'Remoción típica', value: 'sólidos de 50 a 70 %; DBO de 25 a 40 %' },
      { label: 'Profundidad', value: 'de 3 a 5 m' },
    ],
    source: `${ME}; remoción según el tiempo de retención: Crites y Tchobanoglous (1998).`,
    wrong: 'Si llega más agua de la que cabe, el tiempo se acorta y el lodo no alcanza a caer. Si el lodo se deja mucho tiempo en el fondo, se pudre, suelta gas y sube a flote.',
    measure: 'Los sólidos y la DBO a la entrada y a la salida, y la altura del lodo en el fondo.',
    inOut: (r, inp) =>
      inp.primary
        ? [
            { label: 'Tiempo del agua en el tanque', value: `${es(r.primary.hrtH, 1)} h` },
            { label: 'Sólidos', value: `${mg(r.pre.sst)} → ${mg(r.prim.sst)} (quita ${es(r.primary.rSst * 100, 0)} %)` },
            { label: 'DBO5', value: `${mg(r.pre.dbo)} → ${mg(r.prim.dbo)} (quita ${es(r.primary.rDbo * 100, 0)} %)` },
            { label: 'Lodo primario', value: `${es(r.sludge.primaryKgD, 0)} kg de sólidos por día` },
          ]
        : [{ label: 'Sedimentador primario', value: 'fuera de servicio: el agua pasa directo al reactor' }],
  },
  {
    id: 'reactor',
    n: 5,
    name: 'Reactor biológico (lodos activados)',
    tag: 'Reactor',
    short: 'Aquí trabajan miles de millones de bacterias: se comen la materia orgánica disuelta y, con aire que soplan unos difusores, la convierten en gas carbónico, agua y más bacterias.',
    how: [
      'Los sopladores mandan aire por difusores en el fondo: las burbujas dan oxígeno y revuelven el agua.',
      'Las bacterias se pegan unas con otras en grumos (flóculos) junto con lo que comen: eso es el «lodo activado».',
      'Otras bacterias, más lentas (las nitrificantes), pasan el amonio, que es tóxico para los peces, a nitrato. Solo sobreviven si el lodo se queda varios días en la planta.',
      'La edad del lodo es cuántos días, en promedio, pasa una bacteria en la planta; se maneja con la purga.',
    ],
    design: [
      { label: 'Tiempo de retención (lodos activados convencionales)', value: 'de 3 a 8 horas' },
      { label: 'Edad del lodo', value: 'de 3 a 15 días (más larga para nitrificar en clima frío)' },
      { label: 'Sólidos del licor mixto', value: 'de 1 000 a 4 000 mg/L' },
      { label: 'Oxígeno disuelto', value: 'cerca de 2 mg/L' },
      { label: 'En el juego', value: `retención de ${PTAR_DESIGN.reactorHRTh} h; edad del lodo de ${PTAR_DESIGN.srt.poca}, ${PTAR_DESIGN.srt.normal} o ${es(PTAR_DESIGN.srt.mucha, 1)} días según la purga` },
    ],
    source: `${ME}; cinética de Monod con los coeficientes de las tablas 7-9 y 7-10 de la 4.ª edición.`,
    wrong: 'Sin aire, las bacterias que respiran oxígeno dejan de trabajar y el tanque huele a podrido. Con muy poco aire crecen bacterias en hilos y el lodo no se asienta. Sin recirculación o con demasiada purga, las bacterias se van con el agua más rápido de lo que crecen.',
    measure: 'Oxígeno disuelto (continuo), sólidos del licor mixto, la prueba de la probeta de 30 minutos y, al microscopio, los flóculos y los hilos.',
    inOut: (r) => {
      const R = r.reactor;
      if (R.washout)
        return [
          { label: 'Bacterias', value: 'se lavaron: no queda lodo activado' },
          { label: 'DBO5', value: `${mg(r.prim.dbo)} → casi igual` },
          { label: 'Edad del lodo', value: `${es(R.srtD, 2)} días (necesita más de ${Number.isFinite(R.srtMinD) ? es(R.srtMinD, 2) : '—'})` },
        ];
      return [
        { label: 'Sólidos del licor mixto', value: `${Math.round(R.mlss).toLocaleString('es-CO')} mg/L` },
        { label: 'DBO disuelta que queda', value: mg(R.S) },
        { label: 'Amonio', value: `${mg(r.prim.nh4)} → ${mg(r.sec.nh4)}${R.nitrify ? '' : ' (las nitrificantes no alcanzan a crecer)'}` },
        { label: 'Oxígeno que hay que darle', value: `${es(R.o2KgD, 0)} kg por día` },
        { label: 'Edad del lodo', value: `${es(R.srtD, 1)} días · retención ${es(R.hrtH, 1)} h` },
      ];
    },
  },
  {
    id: 'secundario',
    n: 6,
    name: 'Sedimentador secundario',
    tag: 'Secundario',
    short: 'Los grumos de bacterias caen al fondo y el agua clara sale por el borde. La mayor parte del lodo vuelve al reactor (recirculación); lo que sobra se purga.',
    how: [
      'Es otro tanque redondo, con un puente que barre el lodo hacia el centro.',
      'La recirculación devuelve el lodo al reactor para que las bacterias no se pierdan.',
      'La purga saca cada día el lodo que sobra: purgar más deja un lodo más joven; purgar menos, uno más viejo.',
    ],
    design: [
      { label: 'Carga superficial (caudal medio)', value: 'de 16 a 28 m³ por m² al día' },
      { label: 'Carga superficial (caudal máximo)', value: 'de 40 a 64 m³ por m² al día' },
      { label: 'Profundidad', value: 'de 3,5 a 6 m' },
      { label: 'Recirculación', value: 'del 25 al 100 % del caudal' },
    ],
    source: ME,
    wrong: 'Con mucha agua de lluvia, el agua sube tan rápido que arrastra los grumos. Si el lodo «se abulta» (bacterias en hilos), no cae y se escapa por el borde.',
    measure: 'La altura del manto de lodo, los sólidos del agua clarificada y la turbiedad.',
    inOut: (r) => [
      { label: 'Carga superficial', value: `${es(r.secondary.sor, 0)} m³ por m² al día` },
      { label: 'Sólidos que se escapan', value: mg(r.sec.sst) },
      { label: 'DBO5 del agua clarificada', value: mg(r.sec.dbo) },
      { label: 'Lodo que se purga', value: `${es(r.sludge.wasKgD, 0)} kg de sólidos por día` },
    ],
  },
  {
    id: 'uv',
    n: 7,
    name: 'Desinfección ultravioleta',
    tag: 'Luz UV',
    short: 'El agua pasa junto a lámparas de luz ultravioleta. La luz daña el material genético de las bacterias y los virus, y ya no se pueden reproducir. No se le agrega nada al agua.',
    how: [
      'Las lámparas van dentro de tubos de cuarzo, sumergidas en un canal.',
      'Lo que cuenta es la dosis: intensidad de la luz × tiempo de exposición.',
      'Los sólidos que se escaparon del sedimentador esconden a las bacterias de la luz: por eso la desinfección funciona mejor con agua clara.',
    ],
    design: [
      { label: 'Dosis para agua tratada secundaria', value: 'del orden de 30 a 100 mJ/cm²' },
      { label: 'En el juego', value: '3,5 unidades logarítmicas (99,97 %) con agua clara; menos cuando hay sólidos' },
    ],
    source: `${ME}; la relación con los sólidos es una regla didáctica.`,
    wrong: 'Las lámparas se ensucian y pierden fuerza; con el agua turbia de la lluvia la luz no llega a todas las bacterias.',
    measure: 'Coliformes termotolerantes a la salida y la intensidad de la luz de las lámparas.',
    inOut: (r, inp) => [
      { label: 'Lámparas', value: inp.uv ? 'encendidas' : 'apagadas' },
      { label: 'Coliformes (NMP/100 mL)', value: `${big(r.sec.coli)} → ${big(r.eff.coli)}` },
      { label: 'Remoción en toda la planta', value: `${es(r.logs.total, 1)} unidades logarítmicas` },
    ],
  },
  {
    id: 'descarga',
    n: 8,
    name: 'Descarga al río',
    tag: 'Descarga',
    short: 'El agua tratada baja por unas gradas, donde toma aire, y llega al río. Debe cumplir la norma de vertimientos y no dejar al río sin oxígeno para los peces.',
    how: [
      'La norma (Resolución 0631 de 2015) fija lo máximo que puede llevar el agua tratada: DQO, DBO5, sólidos, grasas y pH.',
      'Los límites dependen de cuánta materia orgánica recoge el alcantarillado: las ciudades más grandes tienen límites más estrictos.',
      'Aguas abajo, el río sigue limpiando lo que queda: sus bacterias gastan oxígeno y el aire se lo devuelve.',
    ],
    design: [
      { label: 'DBO5 (más de 3 000 kg/día)', value: `máximo ${RES_0631[3].dbo} mg/L` },
      { label: 'DBO5 (hasta 3 000 kg/día)', value: `máximo ${RES_0631[2].dbo} mg/L` },
      { label: 'Sólidos suspendidos', value: `máximo ${RES_0631[2].sst} o ${RES_0631[3].sst} mg/L` },
      { label: 'Oxígeno para los peces (aguas cálidas)', value: 'al menos 4 mg/L' },
    ],
    source: 'Resolución 0631 de 2015 (Ministerio de Ambiente), artículo 8; Decreto 1076 de 2015, artículo 2.2.3.3.9.10.',
    wrong: 'Si la planta falla o el aliviadero rebosa, el río recibe materia orgánica que le roba el oxígeno kilómetros más abajo, y amonio que intoxica a los peces.',
    measure: 'La autoridad ambiental pide caracterizar el vertimiento; aguas abajo se mide el oxígeno, la DBO y el amonio del río.',
    inOut: (r) => [
      { label: 'Agua tratada', value: `${m3(r.Qtreat)} · DBO5 ${mg(r.eff.dbo)}` },
      { label: 'Norma que aplica', value: RES_0631[r.cat].label },
      { label: 'Río', value: `${es(WEATHER[r.inp.weather].river.Q, 1)} m³/s antes de la descarga` },
      { label: 'Oxígeno más bajo aguas abajo', value: `${es(r.river.minDO, 1)} mg/L a ${es(r.river.xMinKm, 1)} km` },
    ],
  },
  {
    id: 'espesador',
    n: 9,
    name: 'Espesador de lodos',
    tag: 'Espesador',
    short: 'El lodo del primario y el que se purga del secundario llegan muy aguados. En el espesador se asientan despacio y se les saca agua, para que ocupen menos.',
    how: [
      'Es un tanque redondo con unas varillas que giran despacio y ayudan a que el agua se separe del lodo.',
      'El agua que sale por arriba vuelve al inicio de la planta.',
      'El lodo espesado pasa de cerca de 1 % de sólidos a varias veces eso.',
    ],
    design: [
      { label: 'Lodo primario espesado por gravedad', value: 'de 5 a 10 % de sólidos' },
      { label: 'Lodo biológico espesado', value: 'de 2 a 6 % de sólidos (mejor con espesadores mecánicos)' },
    ],
    source: ME,
    wrong: 'Si el lodo se queda mucho tiempo, se pudre y huele. El lodo biológico se espesa peor que el primario.',
    measure: 'La concentración de sólidos del lodo que entra y del que sale.',
    inOut: (r) => [
      { label: 'Lodo primario', value: `${es(r.sludge.primaryKgD, 0)} kg/día` },
      { label: 'Lodo purgado (biológico)', value: `${es(r.sludge.wasKgD, 0)} kg/día` },
    ],
  },
  {
    id: 'digestor',
    n: 10,
    name: 'Digestor y biogás',
    tag: 'Digestor',
    short: 'Un tanque cerrado y tibio, sin aire, donde otras bacterias se comen parte del lodo y producen biogás. Con el biogás se genera electricidad para la misma planta.',
    how: [
      'Sin oxígeno, las bacterias anaerobias convierten la materia orgánica del lodo en metano y gas carbónico.',
      'El lodo se calienta a unos 35 °C y se queda cerca de tres semanas.',
      'El biogás se guarda en un gasómetro y se quema en un motor que mueve un generador; lo que sobra se quema en una tea para no soltar metano al aire.',
    ],
    design: [
      { label: 'Temperatura (digestión mesofílica)', value: 'de 30 a 38 °C' },
      { label: 'Tiempo de retención', value: 'de 15 a 20 días' },
      { label: 'Sólidos volátiles que se destruyen', value: 'de 40 a 60 %' },
      { label: 'Biogás', value: 'de 0,75 a 1,12 m³ por kg de sólidos volátiles destruidos; de 60 a 70 % metano' },
    ],
    source: ME,
    wrong: 'Si llega lodo con algo tóxico o la temperatura baja, las bacterias del digestor se detienen y deja de salir gas.',
    measure: 'Temperatura, pH, ácidos volátiles, producción y composición del biogás.',
    inOut: (r) => [
      { label: 'Biogás', value: `${Math.round(r.sludge.biogasM3D).toLocaleString('es-CO')} m³ por día (${r.sludge.ch4Pct} % metano)` },
      { label: 'Electricidad', value: `${Math.round(r.sludge.kwhD).toLocaleString('es-CO')} kWh por día` },
      { label: 'Parte de la energía de la planta', value: `${es(r.energy.coverPct, 0)} %` },
    ],
  },
  {
    id: 'deshidratacion',
    n: 11,
    name: 'Deshidratación del lodo',
    tag: 'Deshidratación',
    short: 'Una centrífuga gira muy rápido y le saca más agua al lodo digerido: queda una «torta» húmeda, el biosólido, que se lleva en volquetas.',
    how: [
      'Se le agrega un polímero que junta las partículas y ayuda a soltar el agua.',
      'La centrífuga o un filtro de banda dejan el lodo con cerca de una cuarta parte de sólidos.',
      'El biosólido puede secarse más y usarse, según su calidad, para recuperar suelos; si no, va a un relleno.',
    ],
    design: [
      { label: 'Torta de una centrífuga', value: 'de 20 a 30 % de sólidos' },
      { label: 'En el juego', value: '22 % de sólidos' },
    ],
    source: ME,
    wrong: 'Si el polímero no es el adecuado, el agua que sale de la centrífuga va cargada de lodo y vuelve a la planta.',
    measure: 'Los sólidos de la torta y del agua que sale (clarificado).',
    inOut: (r) => [{ label: 'Biosólido', value: `${es(r.sludge.cakeTD, 1)} toneladas por día (con 22 % de sólidos)` }],
  },
];

export const ptarUnitById = (id: PtarUnitId) => PTAR_UNITS.find((u) => u.id === id)!;

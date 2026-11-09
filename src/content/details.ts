// Vistas de detalle: la tercera escala de exploración (cuenca → proceso → detalle).
// Cada vista es una secuencia con inicio, desarrollo y resultado, y una variable para investigar.
// Las ilustraciones son esquemas: no están a escala.

import type { DetailId } from '../state/store';

export interface DetailPhase {
  /** Segundo de la secuencia en que empieza la fase. */
  at: number;
  title: string;
  text: string;
  /** Texto distinto para alguna variante. */
  alt?: Record<string, string>;
}

export interface DetailDef {
  id: DetailId;
  title: string;
  /** Texto corto para botones: «Ver de cerca: …». */
  short: string;
  /** Lugar del paisaje que se amplía. */
  place: string;
  subject: [number, number];
  /** Región de cámara para la escala de proceso. */
  region: string;
  duration: number;
  phases: DetailPhase[];
  variantLabel: string;
  variants: { id: string; label: string }[];
  observe: string;
  scaleNote: string;
  deeper: string;
  /** Pregunta abierta al terminar la secuencia. */
  next: string;
  /** Invitación a explicar con sus palabras (se guarda en la bitácora). */
  explain: string;
  terms: string[];
}

export const DETAILS: DetailDef[] = [
  {
    id: 'poros',
    title: 'Agua y aire entre los granos del suelo',
    short: 'poros del suelo',
    place: 'Suelo bajo el bosque',
    subject: [1080, 636],
    region: 'infiltration',
    duration: 18,
    phases: [
      { at: 0, title: 'Antes de la lluvia', text: 'Entre los granos hay espacios llamados poros. En un suelo seco casi todos tienen aire; solo una película muy fina de agua rodea cada grano.' },
      { at: 4, title: 'Infiltración', text: 'Llueve. El agua entra por los poros y desplaza al aire, que sale hacia arriba. El borde húmedo avanza hacia abajo: es el frente de humedecimiento.' },
      { at: 10, title: 'Drenaje', text: 'Deja de llover. El agua de los poros más grandes sigue bajando por gravedad (percolación) y el aire vuelve a ocupar esos espacios.' },
      {
        at: 14.5,
        title: 'Resultado',
        text: 'Una parte del agua queda retenida en los poros pequeños y en películas alrededor de los granos: es la humedad del suelo que usan las plantas. Otra parte siguió bajando.',
        alt: { arcilla: 'La arcilla dejó entrar el agua muy despacio: una parte escurrió por encima. La que entró quedó casi toda retenida en sus poros diminutos y apenas sigue bajando.' },
      },
    ],
    variantLabel: 'Tipo de suelo',
    variants: [
      { id: 'arena', label: 'Arenoso' },
      { id: 'arcilla', label: 'Arcilloso' },
    ],
    observe: 'Observa qué ocupa los poros en cada momento: aire, agua o ambos. Luego cambia el tipo de suelo y compara la velocidad del frente y cuánta agua queda.',
    scaleNote: 'Esquema, no está a escala: un grano de arena mide entre 0,06 y 2 milímetros, y una partícula de arcilla es cientos de veces más pequeña.',
    deeper:
      'El agua queda retenida por adhesión (se pega a los granos) y por capilaridad (sube y se sostiene en los poros finos). Por eso un suelo arcilloso guarda más agua que uno arenoso, aunque las plantas no pueden aprovecharla toda: una parte queda unida con tanta fuerza que las raíces no logran extraerla.',
    next: '¿Y qué pasa con el agua que siguió bajando? Abre la vista de las zonas no saturada y saturada.',
    explain: '¿Por qué un suelo guarda agua después de la lluvia y otro la deja pasar casi toda?',
    terms: ['infiltracion', 'humedad-del-suelo', 'percolacion', 'zona-no-saturada'],
  },
  {
    id: 'zonas',
    title: 'Zona no saturada, nivel freático y zona saturada',
    short: 'zonas del subsuelo',
    place: 'Corte del terreno junto al pozo de observación',
    subject: [900, 690],
    region: 'percolation',
    duration: 18,
    phases: [
      { at: 0, title: 'Zona no saturada', text: 'Cerca de la superficie, los poros tienen agua y aire a la vez. El agua que baja por aquí aún no es agua subterránea.' },
      { at: 4.5, title: 'Franja capilar', text: 'Justo encima del nivel freático, el agua sube por los poros finos y los llena casi por completo, pero no fluye hacia un pozo.' },
      { at: 8.5, title: 'Nivel freático', text: 'Es la superficie superior de la zona saturada en este acuífero libre. En el pozo de observación, el agua se estabiliza a esa altura.' },
      {
        at: 12.5,
        title: 'Recarga',
        text: 'Cuando el agua que percola alcanza la zona saturada, se suma al agua subterránea: eso es la recarga. El nivel freático sube un poco.',
        alt: { sequia: 'En la temporada seca casi no llega recarga, pero el agua subterránea sigue saliendo hacia el río y los manantiales: el nivel freático baja, y el agua del pozo baja con él.' },
      },
    ],
    variantLabel: 'Qué ocurre',
    variants: [
      { id: 'recarga', label: 'Llega recarga' },
      { id: 'sequia', label: 'Temporada seca' },
    ],
    observe: 'Compara el nivel del agua dentro del pozo con el límite entre las dos zonas. Después elige «Temporada seca» y mira hacia dónde se mueve.',
    scaleNote: 'Esquema, no está a escala: la franja capilar puede medir desde unos centímetros en arena gruesa hasta más de un metro en materiales finos.',
    deeper:
      'Infiltración y recarga no son lo mismo. La infiltración es la entrada del agua al suelo; la recarga es la llegada de agua a la zona saturada. Entre una y otra, una parte del agua se queda en el suelo, otra la toman las raíces y otra se evapora. En la zona saturada, el agua está a una presión mayor que la del aire; por eso fluye hacia el pozo, mientras que el agua de la franja capilar no lo hace.',
    next: 'Ya en la zona saturada, ¿hacia dónde se mueve el agua? Abre la vista de poros y fracturas.',
    explain: '¿Qué diferencia hay entre el agua de la zona no saturada y el agua subterránea?',
    terms: ['nivel-freatico', 'zona-saturada', 'zona-no-saturada', 'franja-capilar', 'recarga'],
  },
  {
    id: 'planta',
    title: 'De la raíz a la hoja: la transpiración',
    short: 'raíz, tallo y hoja',
    place: 'Árbol del bosque',
    subject: [1010, 560],
    region: 'transpiration',
    duration: 18,
    phases: [
      { at: 0, title: 'Absorción', text: 'Los pelos absorbentes de la raíz toman agua de los poros del suelo que la rodean.' },
      { at: 4.5, title: 'Ascenso', text: 'El agua sube por el xilema, unos conductos muy finos que van de la raíz a las hojas. Las moléculas de agua se mantienen unidas como una cadena.' },
      { at: 9, title: 'Salida por los estomas', text: 'Dentro de la hoja, el agua se evapora. El vapor sale por los estomas, pequeñas aberturas que se abren y se cierran. Al salir, «tira» de la cadena de agua desde abajo.' },
      {
        at: 14,
        title: 'Resultado',
        text: 'La planta devuelve agua a la atmósfera como vapor, que es invisible. La mayor parte del agua que absorbe una planta sale así.',
        alt: {
          seco: 'Con el suelo seco, las células oclusivas casi cierran los estomas: la planta pierde menos agua, pero también absorbe menos dióxido de carbono.',
          noche: 'De noche, sin luz para la fotosíntesis, la mayoría de las plantas cierra sus estomas: la transpiración casi se detiene.',
        },
      },
    ],
    variantLabel: 'Condiciones',
    variants: [
      { id: 'dia', label: 'Día soleado' },
      { id: 'seco', label: 'Suelo seco' },
      { id: 'noche', label: 'Noche' },
    ],
    observe: 'Mira las dos células que rodean cada estoma y la cantidad de vapor que sale. Cambia las condiciones y compara.',
    scaleNote: 'Esquema, no está a escala: un estoma mide alrededor de una centésima de milímetro y no se ve a simple vista. El vapor es invisible; aquí se representa con círculos.',
    deeper:
      'Las células oclusivas abren el estoma cuando hay luz y agua disponible, y lo cierran de noche o cuando el suelo se seca. Así la planta equilibra dos necesidades: dejar entrar el dióxido de carbono que usa en la fotosíntesis y no perder demasiada agua.',
    next: '¿Qué le pasa a ese vapor cuando sube y se enfría? Abre la vista del interior de una nube.',
    explain: '¿Por qué la planta pierde menos agua de noche o cuando el suelo está seco?',
    terms: ['transpiracion', 'estomas', 'xilema', 'vapor-de-agua'],
  },
  {
    id: 'nube',
    title: 'Dentro de una nube: de gotitas a gotas de lluvia',
    short: 'interior de una nube',
    place: 'Nube sobre el valle',
    subject: [600, 236],
    region: 'condensation',
    duration: 20,
    phases: [
      { at: 0, title: 'Aire húmedo que se enfría', text: 'El aire con vapor invisible sube y, al subir, se expande y se enfría.' },
      { at: 4.5, title: 'Condensación', text: 'El vapor se condensa sobre partículas diminutas del aire (polvo, sal marina, humo), llamadas núcleos de condensación. Se forman gotitas de nube: tan livianas que el aire las sostiene.' },
      { at: 10, title: 'Crecimiento', text: 'Las gotitas chocan y se unen (coalescencia). En las nubes frías, además, crecen cristales de hielo. Las gotas grandes caen más rápido y atrapan a otras en su camino.' },
      {
        at: 15.5,
        title: 'Precipitación',
        text: 'Cuando la gota es tan pesada que el aire ya no la sostiene, cae. Se necesitan muchísimas gotitas de nube para formar una sola gota de lluvia.',
        alt: { fria: 'Los cristales de hielo crecieron tomando vapor y se volvieron pesados: caen como nieve y, al atravesar aire más cálido, se derriten y llegan como lluvia.' },
      },
    ],
    variantLabel: 'Tipo de nube',
    variants: [
      { id: 'calida', label: 'Nube cálida' },
      { id: 'fria', label: 'Nube fría (con hielo)' },
    ],
    observe: 'Sigue una gotita desde que se forma hasta que cae. Fíjate en que la nube está hecha de gotitas líquidas o cristales, no de vapor.',
    scaleNote: 'Esquema, no está a escala: una gotita de nube mide alrededor de 0,02 milímetros y una gota de lluvia, alrededor de 2 milímetros: cien veces más ancha.',
    deeper:
      'En las nubes frías conviven cristales de hielo y gotitas de agua muy fría que siguen líquidas. Los cristales crecen tomando vapor mientras las gotitas se evaporan, hasta que pesan lo suficiente para caer; si atraviesan aire más cálido, se derriten y llegan al suelo como lluvia.',
    next: 'Cuando esa lluvia llega al suelo, ¿cuánta entra y cuánta escurre? Abre la vista de los poros del suelo.',
    explain: '¿Por qué las gotitas de la nube no caen enseguida?',
    terms: ['condensacion', 'nube', 'nucleos-de-condensacion', 'precipitacion'],
  },
  {
    id: 'subterraneo',
    title: 'Poros, fracturas y carga hidráulica',
    short: 'flujo subterráneo',
    place: 'Acuífero bajo el valle',
    subject: [1010, 800],
    region: 'groundwater',
    duration: 20,
    phases: [
      { at: 0, title: 'Dos pozos, dos niveles', text: 'En los pozos de observación el agua se estabiliza a alturas distintas. Esa altura indica la carga hidráulica en cada lugar.' },
      { at: 4.5, title: 'De mayor a menor carga', text: 'El agua subterránea se mueve desde donde la carga es mayor hacia donde es menor, como si «bajara» una pendiente invisible.' },
      { at: 9.5, title: 'Caminos estrechos', text: 'En la arena y la grava el agua avanza rodeando los granos, por los poros conectados. En la roca solo puede circular por las fracturas.' },
      { at: 15, title: 'Resultado', text: 'Después de recorrer el acuífero lentamente, el agua sale en el manantial o alimenta el río. Por eso muchos ríos siguen corriendo cuando no llueve.' },
    ],
    variantLabel: 'Material',
    variants: [
      { id: 'grava', label: 'Grava' },
      { id: 'arena', label: 'Arena' },
      { id: 'arcilla', label: 'Arcilla' },
      { id: 'roca', label: 'Roca fracturada' },
    ],
    observe: 'Compara la diferencia de nivel entre los pozos con la dirección del movimiento. Cambia el material y observa cómo cambian la velocidad y el camino.',
    scaleNote: 'Esquema, no está a escala, y el movimiento está muy acelerado: en un acuífero real el agua puede avanzar desde unos centímetros hasta pocos metros por día; en la arcilla, muchísimo menos.',
    deeper:
      'La rapidez del flujo depende de dos cosas: cuánto cambia la carga hidráulica de un lugar a otro (el gradiente) y qué tan bien conecta el material sus poros (la conductividad hidráulica). La grava conduce muy bien; la arcilla tiene mucha agua, pero sus poros son tan finos que casi no la deja pasar: por eso actúa como acuitardo.',
    next: '¿Cuánto tiempo puede pasar una gota en el acuífero? Prueba la gota trazadora o revisa el paso «Almacenamiento y tiempos».',
    explain: '¿Qué hace que el agua subterránea se mueva hacia el río y no al revés?',
    terms: ['flujo-subterraneo', 'acuifero', 'carga-hidraulica', 'manantial', 'acuitardo'],
  },
];

export const DETAIL_BY_ID = Object.fromEntries(DETAILS.map((d) => [d.id, d])) as Record<DetailId, DetailDef>;

export function phaseAt(def: DetailDef, t: number): number {
  let i = 0;
  def.phases.forEach((p, k) => {
    if (t >= p.at) i = k;
  });
  return i;
}

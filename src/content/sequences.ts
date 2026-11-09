// Secuencias de observación de cada paso: inicio, desarrollo y resultado.
// Se muestran sobre el paisaje para responder qué se mueve, de dónde a dónde, por qué y qué mirar.
// También: nombre corto de cada paso (para el progreso) y vistas de detalle relacionadas.

import type { DetailId } from '../state/store';

export interface Beat {
  at: number;
  text: string;
}

export interface StepExtra {
  short: string;
  beats: Beat[];
  details?: DetailId[];
}

export const BEAT_NAMES = ['Inicio', 'Desarrollo', 'Resultado'];
export const SEQUENCE_LENGTH = 15;

export const STEP_EXTRA: Record<string, StepExtra> = {
  inicio: {
    short: 'Inicio',
    beats: [
      { at: 0, text: 'Mira el paisaje completo: el Sol calienta el océano, los lagos, los suelos y las hojas.' },
      { at: 4.5, text: 'El agua cambia de estado y se mueve por muchos caminos a la vez: sube como vapor, cae, se infiltra y escurre.' },
      { at: 9.5, text: 'No hay un único recorrido: cada porción de agua puede seguir caminos distintos y tardar tiempos muy diferentes.' },
    ],
  },
  reservorios: {
    short: 'Reservorios',
    beats: [
      { at: 0, text: 'Un reservorio es un lugar donde el agua se acumula: océano, glaciar, lago, suelo, acuífero, atmósfera, seres vivos.' },
      { at: 4.5, text: 'Los rótulos oscuros y rectangulares son reservorios; los redondeados son procesos, es decir, agua en movimiento.' },
      { at: 9.5, text: 'El océano guarda casi toda el agua del planeta. El agua dulce líquida que podemos usar es una parte muy pequeña.' },
    ],
  },
  evaporacion: {
    short: 'Evaporación',
    beats: [
      { at: 0, text: 'Observa la superficie del océano y del lago: allí llega la energía del Sol.' },
      { at: 4.5, text: 'Algunas moléculas de la superficie ganan energía y pasan al aire como vapor. Los círculos punteados son un símbolo: el vapor es invisible.' },
      { at: 9.5, text: 'El vapor sube y se mezcla con el aire. La sal del océano se queda atrás: el vapor es agua dulce.' },
    ],
  },
  transpiracion: {
    short: 'Transpiración',
    beats: [
      { at: 0, text: 'Observa el árbol grande: sus raíces toman agua de los poros del suelo.' },
      { at: 4.5, text: 'El agua sube por el tronco hasta las hojas y sale como vapor por los estomas, unas aberturas diminutas.' },
      { at: 9.5, text: 'Un bosque devuelve mucha agua a la atmósfera. Usa «Ver de cerca» para seguirla de la raíz a la hoja.' },
    ],
    details: ['planta'],
  },
  condensacion: {
    short: 'Condensación',
    beats: [
      { at: 0, text: 'Sigue la porción de aire húmedo: el viento la empuja ladera arriba.' },
      { at: 4.5, text: 'Al subir se expande y se enfría. Al llegar al punto de rocío, el vapor se condensa en gotitas sobre partículas diminutas.' },
      { at: 9.5, text: 'Aparece la nube: gotitas y cristales tan pequeños que el aire los sostiene. La nube no está hecha de vapor.' },
    ],
    details: ['nube'],
  },
  transporte: {
    short: 'Transporte',
    beats: [
      { at: 0, text: 'Observa las líneas de viento: llevan el aire húmedo de un lugar a otro.' },
      { at: 4.5, text: 'El agua que se evaporó sobre el océano puede formar nubes lejos de allí, sobre las montañas.' },
      { at: 9.5, text: 'En promedio, el agua permanece en la atmósfera algo más de una semana antes de volver a caer.' },
    ],
  },
  precipitacion: {
    short: 'Precipitación',
    beats: [
      { at: 0, text: 'Dentro de la nube, las gotitas chocan y se unen; en las nubes frías también crecen cristales de hielo.' },
      { at: 4.5, text: 'Cuando una gota o un cristal pesa más de lo que el aire puede sostener, cae como lluvia, nieve o granizo.' },
      { at: 9.5, text: 'En las cumbres frías la nieve se acumula. Más abajo, la lluvia llega al bosque, al suelo y a la ciudad.' },
    ],
    details: ['nube'],
  },
  intercepcion: {
    short: 'Intercepción',
    beats: [
      { at: 0, text: 'Observa las copas de los árboles cuando empieza a llover.' },
      { at: 4.5, text: 'Las hojas retienen parte de la lluvia; el resto gotea entre ellas o escurre por los troncos hasta el suelo.' },
      { at: 9.5, text: 'El agua que quedó en las hojas se evapora de nuevo: esa parte nunca llega al suelo.' },
    ],
  },
  infiltracion: {
    short: 'Infiltración',
    beats: [
      { at: 0, text: 'Observa la superficie del suelo bajo el bosque cuando empieza la lluvia.' },
      { at: 4.5, text: 'El agua entra por los poros y el suelo se oscurece poco a poco desde arriba: se está humedeciendo.' },
      { at: 9.5, text: 'El suelo guarda una parte del agua. Usa «Ver de cerca» para descubrir qué pasa entre los granos.' },
    ],
    details: ['poros'],
  },
  percolacion: {
    short: 'Percolación',
    beats: [
      { at: 0, text: 'Observa la zona no saturada, entre el suelo y la línea azul del nivel freático.' },
      { at: 4.5, text: 'El agua que el suelo ya no puede retener sigue bajando lentamente: eso es la percolación.' },
      { at: 9.5, text: 'Solo la parte que llega a la zona saturada es recarga. Mira cómo el nivel freático sube un poco.' },
    ],
    details: ['zonas', 'poros'],
  },
  escorrentia: {
    short: 'Escorrentía',
    beats: [
      { at: 0, text: 'Observa la ladera y la ciudad durante una lluvia fuerte.' },
      { at: 4.5, text: 'El agua que no entra al suelo corre siguiendo la pendiente y se junta en quebradas y alcantarillas.' },
      { at: 9.5, text: 'Todo llega al río, que crece y se vuelve más turbio por los sedimentos que arrastra.' },
    ],
  },
  'flujo-subterraneo': {
    short: 'Agua subterránea',
    beats: [
      { at: 0, text: 'Observa el acuífero: el agua llena los poros entre los granos de arena y grava.' },
      { at: 4.5, text: 'Se mueve despacio, desde donde la carga hidráulica es mayor hacia donde es menor.' },
      { at: 9.5, text: 'Sale en el manantial y alimenta al río incluso cuando no llueve: es el flujo base.' },
    ],
    details: ['subterraneo', 'zonas'],
  },
  almacenamiento: {
    short: 'Almacenamiento',
    beats: [
      { at: 0, text: 'Compara los reservorios: océano, glaciar, acuífero, lago, suelo, río y atmósfera.' },
      { at: 4.5, text: 'En cada uno el agua permanece tiempos muy distintos: días en la atmósfera, miles de años en un acuífero profundo.' },
      { at: 9.5, text: 'Desde cada reservorio el agua vuelve a moverse: por evaporación, por descarga o por fusión.' },
    ],
  },
  personas: {
    short: 'Las personas',
    beats: [
      { at: 0, text: 'Observa el pozo junto al río: su bomba extrae agua del acuífero.' },
      { at: 4.5, text: 'Alrededor del pozo, el nivel freático baja en forma de embudo: llega menos agua subterránea al río.' },
      { at: 9.5, text: 'Bajo la ciudad, las alcantarillas llevan la lluvia rápido al río; la planta de tratamiento limpia el agua usada antes de devolverla.' },
    ],
    details: ['subterraneo'],
  },
  conexiones: {
    short: 'Todo conectado',
    beats: [
      { at: 0, text: 'Activa «Ver todos los procesos» y busca los lugares donde un proceso alimenta a otro.' },
      { at: 4.5, text: 'El agua que hoy está en un lugar puede estar mañana en otro: lo que ocurre en la parte alta de la cuenca afecta a la baja.' },
      { at: 9.5, text: '¿Qué pregunta te quedó? Elige una en «Preguntas para investigar».' },
    ],
  },
};

export function beatAt(beats: Beat[], t: number): number {
  let i = 0;
  beats.forEach((b, k) => {
    if (t >= b.at) i = k;
  });
  return i;
}

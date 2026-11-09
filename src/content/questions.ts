// Preguntas para investigar: nacen en un lugar del paisaje y llevan a una observación,
// una vista de detalle, un experimento o la gota trazadora.

import type { DetailId } from '../state/store';
import { FACTS, type Fact } from './facts';

export type QuestionAction =
  | { kind: 'detail'; id: DetailId; label: string }
  | { kind: 'step'; id: string; label: string }
  | { kind: 'lab'; tab: 'reparto' | 'comparar'; preset?: string; label: string }
  | { kind: 'tracer'; label: string };

export interface Inquiry {
  id: string;
  question: string;
  /** Lugar del paisaje (coordenadas de escena) donde aparece la pregunta. */
  at: [number, number];
  observe: string;
  actions: QuestionAction[];
  deeper: string;
  fact?: Fact;
}

export const INQUIRIES: Inquiry[] = [
  {
    id: 'rio-sin-lluvia',
    question: '¿Por qué puede seguir corriendo un río cuando no llueve?',
    at: [560, 655],
    observe: 'Entre una lluvia y otra, el río del valle sigue llevando agua. Busca de dónde le llega: mira el corte del terreno junto al cauce.',
    actions: [
      { kind: 'lab', tab: 'comparar', preset: 'bombeo', label: 'Experimento: el flujo base y el bombeo' },
      { kind: 'detail', id: 'subterraneo', label: 'Ver de cerca: el agua que se mueve bajo tierra' },
      { kind: 'step', id: 'flujo-subterraneo', label: 'Paso del recorrido: agua subterránea' },
    ],
    deeper: 'El agua subterránea entra al cauce por el fondo y las orillas cuando el nivel freático está más alto que el río. Por eso, en temporada seca, casi toda el agua de muchos ríos viene del acuífero.',
    fact: FACTS.flujoBase,
  },
  {
    id: 'suelo-acuifero',
    question: '¿Toda el agua que entra al suelo llega al acuífero?',
    at: [880, 655],
    observe: 'Durante la lluvia, el suelo se oscurece desde arriba. Fíjate si el nivel freático sube enseguida o mucho después.',
    actions: [
      { kind: 'detail', id: 'zonas', label: 'Ver de cerca: zona no saturada y nivel freático' },
      { kind: 'detail', id: 'poros', label: 'Ver de cerca: agua y aire entre los granos' },
      { kind: 'step', id: 'percolacion', label: 'Paso del recorrido: percolación y recarga' },
    ],
    deeper: 'No. Una parte del agua infiltrada queda retenida en el suelo, otra la absorben las raíces y vuelve al aire por transpiración, y otra se evapora. Solo la que atraviesa la zona no saturada y llega a la zona saturada es recarga.',
    fact: FACTS.pozo,
  },
  {
    id: 'arbol-agua',
    question: '¿Cómo devuelve agua un árbol a la atmósfera?',
    at: [1010, 470],
    observe: 'Mira las copas del bosque en un día soleado. No verás el vapor que sale de las hojas: es invisible.',
    actions: [
      { kind: 'detail', id: 'planta', label: 'Ver de cerca: de la raíz a la hoja' },
      { kind: 'step', id: 'transpiracion', label: 'Paso del recorrido: transpiración' },
    ],
    deeper: 'El agua entra por las raíces, sube por el xilema y se evapora dentro de las hojas; el vapor sale por los estomas. Puedes comprobarlo atando una bolsa transparente alrededor de una rama: al rato aparecen gotitas por dentro.',
    fact: FACTS.hoja,
  },
  {
    id: 'granos-arena',
    question: '¿Qué hay entre los granos de arena?',
    at: [760, 700],
    observe: 'En el corte, la franja color arena es la zona no saturada. Parece sólida, pero está llena de espacios diminutos.',
    actions: [
      { kind: 'detail', id: 'poros', label: 'Ver de cerca: agua y aire entre los granos' },
      { kind: 'detail', id: 'subterraneo', label: 'Ver de cerca: poros y fracturas del acuífero' },
    ],
    deeper: 'Entre los granos hay poros. Encima del nivel freático contienen aire y agua; debajo, solo agua. El porcentaje del volumen ocupado por poros se llama porosidad; qué tan bien están conectados determina la permeabilidad.',
  },
  {
    id: 'tiempo-lugar',
    question: '¿Puede el agua quedarse mucho tiempo en un mismo lugar?',
    at: [1390, 300],
    observe: 'Compara el glaciar de la cumbre, el océano y el acuífero con las nubes y el río. ¿Dónde crees que el agua se queda más tiempo?',
    actions: [
      { kind: 'tracer', label: 'Seguir una porción de agua con la gota trazadora' },
      { kind: 'step', id: 'almacenamiento', label: 'Paso del recorrido: almacenamiento y tiempos' },
    ],
    deeper: 'Sí. El tiempo de permanencia cambia muchísimo de un reservorio a otro: días en la atmósfera, semanas o meses en el suelo y los ríos, siglos o miles de años en acuíferos profundos, el océano y los glaciares grandes. Son promedios: cada porción de agua puede seguir caminos distintos.',
    fact: FACTS.oceano,
  },
  {
    id: 'ciudad-lluvia',
    question: '¿Qué le pasa a la lluvia que cae sobre una ciudad?',
    at: [450, 600],
    observe: 'Mira los techos, las calles y las alcantarillas cuando llueve fuerte. ¿Hacia dónde va el agua?',
    actions: [
      { kind: 'lab', tab: 'comparar', preset: 'superficie', label: 'Experimento: permeable frente a pavimento' },
      { kind: 'step', id: 'escorrentia', label: 'Paso del recorrido: escorrentía' },
    ],
    deeper: 'El pavimento y los techos casi no dejan infiltrar el agua. Escurre rápido hacia las alcantarillas y llega pronto al río: el caudal sube más y antes. Parques, jardines y pavimentos permeables ayudan a que una parte se infiltre.',
    fact: FACTS.urbano,
  },
  {
    id: 'nube-flota',
    question: '¿Por qué las nubes no se caen?',
    at: [620, 210],
    observe: 'Las nubes parecen flotar quietas, pero están hechas de agua líquida o hielo. Observa qué pasa antes de que empiece a llover.',
    actions: [{ kind: 'detail', id: 'nube', label: 'Ver de cerca: dentro de una nube' }],
    deeper: 'Las gotitas de nube son tan pequeñas que caen muy despacio, y las corrientes de aire que suben las sostienen. Solo cuando crecen al chocar y unirse, o cuando se forman cristales de hielo, pesan lo suficiente para caer.',
    fact: FACTS.millon,
  },
];

export const INQUIRY_BY_ID = Object.fromEntries(INQUIRIES.map((q) => [q.id, q])) as Record<string, Inquiry>;

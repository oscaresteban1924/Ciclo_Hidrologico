// Retos: sin cronómetros, sin penalizaciones. Una respuesta incorrecta ofrece una pista
// y la posibilidad de volver a observar.

import type { LabInputs } from '../lab/model';
import type { LayerId } from './types';

export interface SpotRound {
  id: string;
  layers: LayerId[];
  region: string;
  conditions: Partial<LabInputs & { wind: 0 | 1 | 2; temperature: 0 | 1 | 2 }>;
  options: string[];
  correct: number;
  right: string;
  hint: string;
}

export const SPOT_ROUNDS: SpotRound[] = [
  {
    id: 'spot-evap',
    layers: ['evap'],
    region: 'evaporation',
    conditions: { rain: 0, solar: 2 },
    options: ['Evaporación', 'Precipitación', 'Infiltración'],
    correct: 0,
    right: 'Lo identificaste: círculos huecos que suben desde el agua representan vapor que se forma por evaporación.',
    hint: 'Fíjate en la forma: son círculos huecos (vapor) y van hacia arriba. ¿Qué proceso convierte agua líquida en vapor?',
  },
  {
    id: 'spot-gw',
    layers: ['gw'],
    region: 'groundwater',
    conditions: { rain: 0 },
    options: ['Escorrentía superficial', 'Flujo subterráneo', 'Transporte atmosférico'],
    correct: 1,
    right: 'Muy bien: es agua líquida que avanza despacio bajo el nivel freático, hacia el río, el manantial y el mar.',
    hint: 'Observa dónde ocurre: ¿encima o debajo de la superficie? ¿Es rápido o lento?',
  },
  {
    id: 'spot-runoff',
    layers: ['runoff'],
    region: 'runoff',
    conditions: { rain: 3, soilMoisture: 2, surface: 2 },
    options: ['Percolación', 'Escorrentía superficial', 'Transpiración'],
    correct: 1,
    right: 'Exacto: agua que corre sobre el terreno siguiendo la pendiente, hasta el río.',
    hint: 'El agua se mueve rápido y sobre la superficie, siempre cuesta abajo. ¿Cómo se llama ese flujo?',
  },
  {
    id: 'spot-transp',
    layers: ['transp'],
    region: 'transpiration',
    conditions: { rain: 0, solar: 2, vegetation: 2 },
    options: ['Condensación', 'Intercepción', 'Transpiración'],
    correct: 2,
    right: 'Excelente: el agua sube por el árbol y sale de las hojas como vapor.',
    hint: 'Sigue el recorrido: empieza en las raíces y termina en las hojas. ¿Qué sale de las hojas?',
  },
  {
    id: 'spot-perc',
    layers: ['perc'],
    region: 'percolation',
    conditions: { rain: 3, soilMoisture: 1, surface: 0 },
    options: ['Percolación', 'Descarga', 'Evaporación'],
    correct: 0,
    right: 'Correcto: el agua baja por la zona no saturada hacia el nivel freático.',
    hint: 'El movimiento ocurre bajo el suelo, por encima del nivel freático, y va hacia abajo.',
  },
];

export interface ClassifyItem {
  id: string;
  name: string;
  answer: 'reservorio' | 'proceso';
  why: string;
}

export const CLASSIFY_ITEMS: ClassifyItem[] = [
  { id: 'acuifero', name: 'Acuífero', answer: 'reservorio', why: 'Es un lugar: el material geológico donde se almacena el agua subterránea.' },
  { id: 'escorrentia', name: 'Escorrentía', answer: 'proceso', why: 'Es un movimiento: agua que fluye sobre el terreno.' },
  { id: 'atmosfera', name: 'Atmósfera', answer: 'reservorio', why: 'Es un lugar donde el agua se guarda, sobre todo como vapor.' },
  { id: 'infiltracion', name: 'Infiltración', answer: 'proceso', why: 'Es un movimiento: la entrada del agua al suelo.' },
  { id: 'oceano', name: 'Océano', answer: 'reservorio', why: 'Es el mayor almacén de agua del planeta.' },
  { id: 'transpiracion', name: 'Transpiración', answer: 'proceso', why: 'Es un movimiento con cambio de estado: el agua sale de la planta como vapor.' },
  { id: 'nieve', name: 'Nieve de la cumbre', answer: 'reservorio', why: 'Es agua sólida almacenada durante semanas o meses.' },
  { id: 'percolacion', name: 'Percolación', answer: 'proceso', why: 'Es un movimiento: el agua baja por la zona no saturada.' },
];

export interface PredictItem {
  id: string;
  scenario: string;
  inputs: LabInputs;
  compare: LabInputs;
  ask: 'infiltracion' | 'escorrentia';
  options: string[];
  correct: number;
  right: string;
  hint: string;
}

export const PREDICT_ITEMS: PredictItem[] = [
  {
    id: 'pred-pave',
    scenario: 'Llueve con intensidad moderada. Cambiamos la ciudad de suelo permeable a pavimento.',
    inputs: { solar: 1, rain: 2, soilMoisture: 1, vegetation: 1, surface: 0 },
    compare: { solar: 1, rain: 2, soilMoisture: 1, vegetation: 1, surface: 2 },
    ask: 'escorrentia',
    options: ['La escorrentía aumenta', 'La escorrentía disminuye', 'La escorrentía no cambia'],
    correct: 0,
    right: 'Tu razonamiento es correcto: el pavimento impide la infiltración y el agua escurre.',
    hint: 'Piensa en el corte bajo la ciudad: con pavimento, ¿puede entrar el agua al suelo?',
  },
  {
    id: 'pred-dry',
    scenario: 'Llueve con fuerza. Comparamos un suelo seco con un suelo saturado.',
    inputs: { solar: 1, rain: 3, soilMoisture: 0, vegetation: 1, surface: 0 },
    compare: { solar: 1, rain: 3, soilMoisture: 2, vegetation: 1, surface: 0 },
    ask: 'infiltracion',
    options: ['El suelo seco infiltra más', 'El suelo saturado infiltra más', 'Infiltran lo mismo'],
    correct: 0,
    right: 'Bien pensado: el suelo seco tiene poros con aire que el agua puede ocupar.',
    hint: '¿Cuál de los dos suelos tiene espacio libre entre sus partículas?',
  },
  {
    id: 'pred-veg',
    scenario: 'Llueve de forma moderada sobre suelo húmedo. Comparamos vegetación densa con vegetación escasa.',
    inputs: { solar: 1, rain: 2, soilMoisture: 1, vegetation: 2, surface: 0 },
    compare: { solar: 1, rain: 2, soilMoisture: 1, vegetation: 0, surface: 0 },
    ask: 'escorrentia',
    options: ['Con vegetación escasa hay más escorrentía', 'Con vegetación densa hay más escorrentía', 'No hay diferencia'],
    correct: 0,
    right: 'Muy bien: la vegetación densa intercepta lluvia y sus raíces abren poros que ayudan a infiltrar.',
    hint: 'Recuerda la intercepción y lo que hacen las raíces en el suelo.',
  },
];

export const CLOUD_QUESTION = {
  prompt: 'Explica con la ayuda de la lupa: ¿por qué decimos que una nube no está formada simplemente por vapor invisible?',
  options: [
    'Porque podemos verla: está hecha de pequeñas gotas y cristales que dispersan la luz; el vapor es invisible',
    'Porque las nubes son de algodón muy liviano',
    'Porque el vapor siempre es blanco y las nubes son grises',
  ],
  correct: 0,
  right: 'Excelente explicación. La nube es visible porque contiene agua líquida y hielo en partículas diminutas; el vapor que la rodea no se ve.',
  hint: 'Abre la lupa de la nube. ¿Qué hay dentro: gas invisible o partículas de agua y hielo?',
};

export const CHALLENGES = [
  { id: 'spot', title: 'Identifica el proceso', desc: 'Observa una animación y reconoce qué proceso ocurre.' },
  { id: 'classify', title: 'Reservorio o flujo', desc: 'Clasifica cada término: ¿es un lugar o un movimiento?' },
  { id: 'route', title: 'Construye una ruta', desc: 'Lleva el agua de un lugar a otro eligiendo procesos posibles.' },
  { id: 'predict', title: 'Predice y comprueba', desc: 'Anticipa cambios en la infiltración y la escorrentía y compruébalos.' },
  { id: 'cloud', title: '¿De qué está hecha una nube?', desc: 'Explica la diferencia entre vapor y nube.' },
] as const;

export type ChallengeId = (typeof CHALLENGES)[number]['id'];

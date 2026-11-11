// Pestaña «Diseño» de cada parte: una calculadora (datos libres, resultados con su fórmula y sus números) y un
// prediseñador (propone dimensiones con criterios, las revisa y entrega la memoria de cálculo). Dos niveles: Niños
// (pocos datos y una frase) y Universitarios (todos los datos, pasos y verificaciones). Prediseños académicos.

import { useEffect, useMemo, useState } from 'react';
import { MATERIALS, type Material } from './hydraulics';
import { INLETS, type Inlet } from './culvert';
import {
  calcAforo,
  calcAlcantarilla,
  calcCanal,
  calcPuente,
  calcResalto,
  calcSedimento,
  preAforador,
  preAlcantarilla,
  preCanal,
  preEnrocado,
  prePozo,
  prePuente,
  type Result,
  type Vals,
} from './designCalc';
import { MOLINETE_EJEMPLO, calcContraccion, calcFormulas, calcMolinete, calcParshall, calcPilas, calcRugosidad, preCanalTierra, preParshall, prePozoUSBR } from './designAdvanced';
import { PARSHALL, PIERS, type ParshallSize, type PierShape } from './advanced';

export type DesignPart = 'canal' | 'resalto' | 'puente' | 'alcantarilla' | 'sedimentos' | 'aforo';
type Level = 'ninos' | 'uni';

interface Field {
  id: string;
  label: string;
  unit?: string;
  def: number | string;
  kid?: boolean;
  options?: { value: string; label: string }[];
  /** Solo si otro campo tiene ese valor. */
  when?: [string, string[]];
  /** Texto de varias líneas (tabla). */
  text?: boolean;
}

interface Tool {
  title: string;
  intro: string;
  kidIntro: string;
  fields: Field[];
  run: (v: Vals) => Result;
}

const MAT_OPTS = (Object.keys(MATERIALS) as Material[]).map((m) => ({ value: m, label: `${MATERIALS[m].name} (n ${MATERIALS[m].n})` }));
const INLET_OPTS = (Object.keys(INLETS) as Inlet[]).filter((i) => INLETS[i].shape === 'circ').map((i) => ({ value: i, label: INLETS[i].name }));
const BOX_OPTS = (Object.keys(INLETS) as Inlet[]).filter((i) => INLETS[i].shape === 'cajon').map((i) => ({ value: i, label: INLETS[i].name }));
const SHAPE_FIELD: Field = { id: 'forma', label: 'Conducto', def: 'circ', kid: true, options: [{ value: 'circ', label: 'Tubo circular' }, { value: 'cajon', label: 'Cajón' }] };

const TOOLS: Record<DesignPart, { calc: Tool; pre: Tool }> = {
  canal: {
    calc: {
      title: 'Calculadora de flujo uniforme',
      intro: 'Profundidad normal, velocidad, Froude y energía de cualquier canal (Manning).',
      kidIntro: 'Escoge un canal y cuánta agua lleva: te dice qué tan hondo y qué tan rápido va el agua.',
      fields: [
        { id: 'forma', label: 'Forma', def: 'trap', kid: true, options: [{ value: 'rect', label: 'Rectangular' }, { value: 'trap', label: 'Trapecial' }, { value: 'circ', label: 'Tubo' }] },
        { id: 'b', label: 'Ancho del fondo', unit: 'm', def: 1.5, kid: true, when: ['forma', ['rect', 'trap']] },
        { id: 'z', label: 'Talud (horizontal : 1)', def: 1.5, when: ['forma', ['trap']] },
        { id: 'D', label: 'Diámetro', unit: 'm', def: 1.2, kid: true, when: ['forma', ['circ']] },
        { id: 'material', label: 'Material', def: 'concreto', kid: true, options: [...MAT_OPTS, { value: 'otro', label: 'Otro (escribir n)' }] },
        { id: 'n', label: 'n de Manning', def: 0.015, when: ['material', ['otro']] },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.1, kid: true },
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 3, kid: true },
      ],
      run: calcCanal,
    },
    pre: {
      title: 'Prediseño de un canal (sección de máxima eficiencia)',
      intro: 'Propone el ancho, la profundidad y la altura de las paredes de un canal que lleve el caudal de diseño, y revisa erosión, sedimentación, estabilidad y borde libre.',
      kidIntro: 'Dime cuánta agua debe llevar tu canal y de qué es: te propongo cómo hacerlo.',
      fields: [
        { id: 'Q', label: 'Caudal de diseño', unit: 'm³/s', def: 4, kid: true },
        { id: 'material', label: 'Material', def: 'concreto', kid: true, options: MAT_OPTS },
        { id: 'S', label: 'Pendiente del terreno', unit: '%', def: 0.1, kid: true },
        { id: 'forma', label: 'Forma', def: 'trap', options: [{ value: 'rect', label: 'Rectangular' }, { value: 'trap', label: 'Trapecial' }] },
        { id: 'z', label: 'Talud (horizontal : 1)', def: 1.5, when: ['forma', ['trap']] },
        { id: 'fb', label: 'Borde libre', unit: '% de la profundidad', def: 20 },
      ],
      run: preCanal,
    },
  },
  resalto: {
    calc: {
      title: 'Calculadora del resalto hidráulico',
      intro: 'Conjugada de Bélanger, pérdida de energía, longitud y tipo del resalto en un canal rectangular.',
      kidIntro: 'Si el agua llega rápida y delgada, ¿hasta dónde salta?',
      fields: [
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 12, kid: true },
        { id: 'b', label: 'Ancho', unit: 'm', def: 4, kid: true },
        { id: 'y1', label: 'Profundidad al llegar', unit: 'm', def: 0.3, kid: true },
      ],
      run: calcResalto,
    },
    pre: {
      title: 'Prediseño de un pozo de amortiguación',
      intro: 'Pozo horizontal al pie de una caída: profundidad al pie, conjugada, agua necesaria en el pozo, largo, vertedero de salida y paredes.',
      kidIntro: 'El agua baja por una caída: te propongo un pozo que atrape su salto.',
      fields: [
        { id: 'Q', label: 'Caudal de diseño', unit: 'm³/s', def: 12, kid: true },
        { id: 'b', label: 'Ancho del pozo', unit: 'm', def: 4, kid: true },
        { id: 'H', label: 'Altura de la caída', unit: 'm', def: 6, kid: true },
        { id: 'loss', label: 'Pérdida en la rápida', unit: '%', def: 10 },
        { id: 'fs', label: 'Factor sobre la conjugada', def: 1.1 },
      ],
      run: prePozo,
    },
  },
  puente: {
    calc: {
      title: 'Calculadora de estrangulamiento',
      intro: '¿La abertura de un puente estrangula el paso? Energía del cauce contra la energía crítica de la abertura.',
      kidIntro: 'Mira si un puente es muy angosto para la quebrada.',
      fields: [
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 30, kid: true },
        { id: 'B', label: 'Ancho del cauce', unit: 'm', def: 8, kid: true },
        { id: 'bp', label: 'Luz útil del puente', unit: 'm', def: 4, kid: true },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.3 },
        { id: 'n', label: 'n de Manning', def: 0.02 },
      ],
      run: calcPuente,
    },
    pre: {
      title: 'Prediseño hidráulico de un puente',
      intro: 'Luz mínima para no estrangular con lo tapado previsto y altura del bajo del puente con su gálibo.',
      kidIntro: 'Te digo qué tan ancho y qué tan alto debe ser un puente para que la creciente pase.',
      fields: [
        { id: 'Q', label: 'Creciente de diseño', unit: 'm³/s', def: 40, kid: true },
        { id: 'B', label: 'Ancho del cauce', unit: 'm', def: 8, kid: true },
        { id: 'Hc', label: 'Altura de las paredes', unit: 'm', def: 3 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.3 },
        { id: 'n', label: 'n de Manning', def: 0.02 },
        { id: 'blk', label: 'Parte tapada prevista', unit: '%', def: 20, kid: true },
        { id: 'gal', label: 'Gálibo bajo el tablero', unit: 'm', def: 0.6 },
      ],
      run: prePuente,
    },
  },
  alcantarilla: {
    calc: {
      title: 'Calculadora de alcantarilla (HDS-5)',
      intro: 'Nivel del agua a la entrada por control a la entrada y a la salida, para un tubo circular o un cajón de concreto.',
      kidIntro: '¿Hasta dónde sube el agua antes de entrar a la alcantarilla?',
      fields: [
        SHAPE_FIELD,
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 5, kid: true },
        { id: 'D', label: 'Diámetro o alto', unit: 'm', def: 1.2, kid: true },
        { id: 'B', label: 'Ancho del cajón', unit: 'm', def: 2, kid: true, when: ['forma', ['cajon']] },
        { id: 'L', label: 'Largo', unit: 'm', def: 30 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 1 },
        { id: 'tw', label: 'Nivel aguas abajo', unit: 'm', def: 0.5 },
        { id: 'entrada', label: 'Entrada', def: 'muro', options: INLET_OPTS, when: ['forma', ['circ']] },
        { id: 'entradaC', label: 'Entrada', def: 'aletas3075', options: BOX_OPTS, when: ['forma', ['cajon']] },
      ],
      run: calcAlcantarilla,
    },
    pre: {
      title: 'Prediseño de alcantarilla',
      intro: 'Prueba tubos comerciales de 0,6 a 3,0 m, o cajones de 1,0 a 4,0 m de ancho, con 1 a 3 conductos, y escoge el de menor área que cumple los criterios.',
      kidIntro: 'Dime cuánta agua pasa y qué tan alta es la vía: te digo qué alcantarilla poner.',
      fields: [
        SHAPE_FIELD,
        { id: 'Q', label: 'Creciente de diseño', unit: 'm³/s', def: 8, kid: true },
        { id: 'road', label: 'Altura de la vía', unit: 'm', def: 4, kid: true },
        { id: 'L', label: 'Largo', unit: 'm', def: 30 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 1 },
        { id: 'tw', label: 'Nivel aguas abajo', unit: 'm', def: 0.5 },
        { id: 'entrada', label: 'Entrada', def: 'muro', options: INLET_OPTS, when: ['forma', ['circ']] },
        { id: 'entradaC', label: 'Entrada', def: 'aletas3075', options: BOX_OPTS, when: ['forma', ['cajon']] },
        { id: 'hwd', label: 'HW máximo', unit: 'veces D', def: 1.5 },
        { id: 'free', label: 'Mínimo bajo la vía', unit: 'm', def: 0.5 },
        { id: 'vmax', label: 'Velocidad máxima a la salida', unit: 'm/s', def: 4.5 },
      ],
      run: preAlcantarilla,
    },
  },
  sedimentos: {
    calc: {
      title: 'Calculadora de transporte de sedimentos',
      intro: 'Shields, umbral, velocidad de caída, número de Rouse y arrastre de fondo para un grano y un flujo.',
      kidIntro: '¿El agua mueve las piedritas del fondo?',
      fields: [
        { id: 'd', label: 'Tamaño del grano', unit: 'mm', def: 10, kid: true },
        { id: 'h', label: 'Profundidad del agua', unit: 'm', def: 1, kid: true },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.4, kid: true },
        { id: 'b', label: 'Ancho del cauce', unit: 'm', def: 10 },
      ],
      run: calcSedimento,
    },
    pre: {
      title: 'Prediseño de enrocado de protección',
      intro: 'Tamaño de piedra (d50) que aguanta el esfuerzo de la creciente, con el criterio de Shields y un factor de seguridad.',
      kidIntro: '¿Qué tan grandes deben ser las piedras para que la creciente no se las lleve?',
      fields: [
        { id: 'Q', label: 'Creciente de diseño', unit: 'm³/s', def: 50, kid: true },
        { id: 'b', label: 'Ancho del cauce', unit: 'm', def: 10, kid: true },
        { id: 'S', label: 'Pendiente', unit: '%', def: 1, kid: true },
        { id: 'n', label: 'n de Manning del enrocado', def: 0.035 },
        { id: 'fs', label: 'Factor de seguridad', def: 1.5 },
      ],
      run: preEnrocado,
    },
  },
  aforo: {
    calc: {
      title: 'Calculadora de aforadores',
      intro: 'Caudal de un vertedero rectangular (Rehbock), triangular o de una compuerta con salida libre.',
      kidIntro: 'Mide la altura del agua sobre el vertedero y te digo cuánta agua pasa.',
      fields: [
        { id: 'tipo', label: 'Estructura', def: 'rect', kid: true, options: [{ value: 'rect', label: 'Vertedero rectangular' }, { value: 'tri', label: 'Vertedero triangular' }, { value: 'gate', label: 'Compuerta' }] },
        { id: 'H', label: 'Carga H', unit: 'cm', def: 10, kid: true, when: ['tipo', ['rect', 'tri']] },
        { id: 'b', label: 'Ancho', unit: 'cm', def: 30, when: ['tipo', ['rect', 'gate']] },
        { id: 'P', label: 'Altura de la cresta', unit: 'cm', def: 15, when: ['tipo', ['rect']] },
        { id: 'ang', label: 'Ángulo del triángulo', unit: '°', def: 90, when: ['tipo', ['tri']] },
        { id: 'a', label: 'Abertura', unit: 'cm', def: 5, kid: true, when: ['tipo', ['gate']] },
        { id: 'y1', label: 'Profundidad aguas arriba', unit: 'cm', def: 30, kid: true, when: ['tipo', ['gate']] },
      ],
      run: calcAforo,
    },
    pre: {
      title: 'Escoger un aforador',
      intro: 'Compara un vertedero rectangular y uno triangular de 90° para un rango de caudales en un canal, con sus límites de validez.',
      kidIntro: 'Dime entre cuánta y cuánta agua quieres medir: te digo qué vertedero usar.',
      fields: [
        { id: 'qmin', label: 'Caudal mínimo', unit: 'L/s', def: 3, kid: true },
        { id: 'qmax', label: 'Caudal máximo', unit: 'L/s', def: 15, kid: true },
        { id: 'b', label: 'Ancho del canal', unit: 'cm', def: 30 },
        { id: 'Hc', label: 'Alto del canal', unit: 'cm', def: 45 },
        { id: 'P', label: 'Cresta del rectangular', unit: 'cm', def: 15 },
      ],
      run: preAforador,
    },
  },
};

/** Herramientas avanzadas (nivel universitario). */
const PIER_OPTS = (Object.keys(PIERS) as PierShape[]).map((p) => ({ value: p, label: `${PIERS[p].name} (K ${PIERS[p].K})` }));
const PARSHALL_OPTS = (Object.keys(PARSHALL) as ParshallSize[]).map((p) => ({ value: p, label: PARSHALL[p].name }));
const EXTRA: Record<DesignPart, (Tool & { kind: 'calc' | 'pre' })[]> = {
  canal: [
    {
      kind: 'calc',
      title: 'Rugosidad compuesta (Horton y Einstein)',
      intro: 'Un canal con fondo de un material y paredes de otro: n equivalente y caudal.',
      kidIntro: 'Fondo de piedras y paredes de concreto: ¿cuánta agua lleva?',
      fields: [
        { id: 'forma', label: 'Forma', def: 'trap', options: [{ value: 'rect', label: 'Rectangular' }, { value: 'trap', label: 'Trapecial' }] },
        { id: 'b', label: 'Ancho del fondo', unit: 'm', def: 3 },
        { id: 'z', label: 'Talud (horizontal : 1)', def: 1.5, when: ['forma', ['trap']] },
        { id: 'y', label: 'Profundidad del agua', unit: 'm', def: 1 },
        { id: 'nb', label: 'n del fondo', def: 0.03 },
        { id: 'nw', label: 'n de las paredes', def: 0.014 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.1 },
      ],
      run: calcRugosidad,
    },
    {
      kind: 'pre',
      title: 'Prediseño de canal en tierra (fuerza tractiva de Lane)',
      intro: 'Canal trapecial sin revestir en material grueso: la mayor profundidad que no arrastra el fondo ni los taludes, y el ancho que lleva el caudal.',
      kidIntro: 'Un canal de tierra y piedras que el agua no se lleva.',
      fields: [
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 5 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.15 },
        { id: 'd75', label: 'd75 del material', unit: 'mm', def: 25 },
        { id: 'phi', label: 'Ángulo de reposo', unit: '°', def: 33 },
        { id: 'z', label: 'Talud (horizontal : 1)', def: 2 },
        { id: 'n', label: 'n de Manning', def: 0.025 },
        { id: 'fb', label: 'Borde libre', unit: '%', def: 20 },
      ],
      run: preCanalTierra,
    },
  ],
  resalto: [
    {
      kind: 'pre',
      title: 'Prediseño de pozo USBR (tipos II, III y IV)',
      intro: 'Escoge el tipo de pozo según F1, V1 y q, dimensiona dados, bloques y umbral (Peterka) y baja el piso si el agua de abajo no alcanza.',
      kidIntro: 'Un pozo con bloques en el piso para frenar el agua.',
      fields: [
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 12 },
        { id: 'b', label: 'Ancho del pozo', unit: 'm', def: 4 },
        { id: 'H', label: 'Caída hasta el piso', unit: 'm', def: 6 },
        { id: 'loss', label: 'Pérdida en la rápida', unit: '%', def: 10 },
        { id: 'tw', label: 'Agua disponible a la salida', unit: 'm', def: 2.2 },
      ],
      run: prePozoUSBR,
    },
  ],
  puente: [
    {
      kind: 'calc',
      title: 'Pilas: remanso (Yarnell) y socavación local (HEC-18)',
      intro: 'Cuánto suben el agua las pilas y qué tan hondo excava el agua junto a ellas.',
      kidIntro: 'Las patas del puente frenan el agua y el agua cava a su alrededor.',
      fields: [
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 60 },
        { id: 'B', label: 'Ancho del cauce', unit: 'm', def: 20 },
        { id: 'y3', label: 'Profundidad aguas abajo', unit: 'm', def: 2.5 },
        { id: 'np', label: 'Número de pilas', def: 2 },
        { id: 'a', label: 'Ancho de cada pila', unit: 'm', def: 1 },
        { id: 'Lp', label: 'Largo de la pila', unit: 'm', def: 6 },
        { id: 'pila', label: 'Forma', def: 'semicircular', options: PIER_OPTS },
        { id: 'skew', label: 'Ángulo del flujo', unit: '°', def: 0 },
        { id: 'K3', label: 'K3 del lecho', def: 1.1, options: [{ value: '1.1', label: 'Agua clara, lecho plano o dunas pequeñas (1,1)' }, { value: '1.2', label: 'Dunas medianas (1,2)' }, { value: '1.3', label: 'Dunas grandes (1,3)' }] },
      ],
      run: calcPilas,
    },
    {
      kind: 'calc',
      title: 'Socavación por contracción (HEC-18)',
      intro: 'Cuánto baja el fondo bajo el puente cuando el puente angosta el cauce: lecho vivo (Laursen) o agua clara.',
      kidIntro: 'Si el puente angosta el río, el agua cava el fondo.',
      fields: [
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 120 },
        { id: 'W1', label: 'Ancho aguas arriba', unit: 'm', def: 40 },
        { id: 'W2', label: 'Ancho bajo el puente', unit: 'm', def: 25 },
        { id: 'y1', label: 'Profundidad aguas arriba', unit: 'm', def: 2.5 },
        { id: 'y0', label: 'Profundidad bajo el puente (antes)', unit: 'm', def: 2.5 },
        { id: 'd50', label: 'D50 del lecho', unit: 'mm', def: 2 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.2 },
      ],
      run: calcContraccion,
    },
  ],
  alcantarilla: [],
  sedimentos: [
    {
      kind: 'calc',
      title: 'Cuatro fórmulas de transporte y formas del lecho',
      intro: 'Meyer-Peter y Müller, Einstein y Brown, van Rijn y Engelund y Hansen para el mismo cauce, con su rango de validez, y las formas del lecho de van Rijn.',
      kidIntro: '¿Cuánta arena se lleva el río? Cuatro fórmulas para comparar.',
      fields: [
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 30 },
        { id: 'b', label: 'Ancho del cauce', unit: 'm', def: 10 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.3 },
        { id: 'd', label: 'd50 del lecho', unit: 'mm', def: 2 },
        { id: 'n', label: 'n de Manning (0 = Strickler)', def: 0 },
      ],
      run: calcFormulas,
    },
  ],
  aforo: [
    {
      kind: 'calc',
      title: 'Canaleta Parshall',
      intro: 'Caudal en flujo libre con la carga Ha (tablas del USBR) y revisión de la sumergencia Hb/Ha.',
      kidIntro: 'Una canaleta que mide el agua de un canal.',
      fields: [
        { id: 'size', label: 'Tamaño de la garganta', def: '6in', options: PARSHALL_OPTS },
        { id: 'Ha', label: 'Carga Ha', unit: 'cm', def: 15 },
        { id: 'Hb', label: 'Carga Hb (0 si no se mide)', unit: 'cm', def: 0 },
      ],
      run: calcParshall,
    },
    {
      kind: 'pre',
      title: 'Escoger una canaleta Parshall',
      intro: 'El tamaño más pequeño cuyo rango de carga cubre los caudales mínimo y máximo.',
      kidIntro: '¿Qué canaleta sirve para medir mi canal?',
      fields: [
        { id: 'qmin', label: 'Caudal mínimo', unit: 'L/s', def: 5 },
        { id: 'qmax', label: 'Caudal máximo', unit: 'L/s', def: 120 },
      ],
      run: preParshall,
    },
    {
      kind: 'calc',
      title: 'Aforo con molinete (sección media)',
      intro: 'Caudal de una quebrada a partir de verticales medidas: distancia a la orilla, profundidad y velocidad media en cada una.',
      kidIntro: 'Medimos la velocidad en varios puntos y sumamos.',
      fields: [{ id: 'tabla', label: 'Verticales: distancia (m), profundidad (m), velocidad (m/s), una por línea', def: MOLINETE_EJEMPLO, text: true }],
      run: calcMolinete,
    },
  ],
};

const LEVEL_KEY = 'ciclo-hidrologico:canales-nivel';

function loadLevel(): Level {
  try {
    return window.localStorage.getItem(LEVEL_KEY) === 'ninos' ? 'ninos' : 'uni';
  } catch {
    return 'uni';
  }
}

export function DesignTab({ part }: { part: DesignPart }) {
  const [level, setLevel] = useState<Level>(loadLevel);
  useEffect(() => {
    try {
      window.localStorage.setItem(LEVEL_KEY, level);
    } catch {
      /* sin almacenamiento */
    }
  }, [level]);
  const t = TOOLS[part];
  const list: (Tool & { kind: 'calc' | 'pre' })[] = [{ ...t.calc, kind: 'calc' }, { ...t.pre, kind: 'pre' }, ...(level === 'uni' ? EXTRA[part] : [])];
  const [pick, setPick] = useState(0);
  const sel = list[Math.min(pick, list.length - 1)];
  return (
    <div className="q3-exps">
      <div className="hc-level" role="radiogroup" aria-label="Nivel">
        {(['ninos', 'uni'] as Level[]).map((l) => (
          <button key={l} type="button" role="radio" aria-checked={level === l} className={level === l ? 'is-on' : ''} onClick={() => setLevel(l)}>
            {l === 'ninos' ? 'Niños' : 'Universitarios'}
          </button>
        ))}
      </div>
      <div className="hc-picker" role="tablist" aria-label="Herramientas">
        {list.map((x, k) => (
          <button key={x.title} type="button" role="tab" aria-selected={x === sel} className={`${x === sel ? 'is-on ' : ''}is-${x.kind}`} onClick={() => setPick(k)}>
            <span>{x.kind === 'calc' ? 'Calculadora' : 'Prediseñador'}</span>
            {x.title.replace(/^Calculadora (de |del )?/, '').replace(/^Prediseño (de |del )?/, '').replace(/^./, (c) => c.toUpperCase())}
          </button>
        ))}
      </div>
      <ToolForm key={sel.title} tool={sel} level={level} kind={sel.kind} part={part} />
      <p className="hc-note">Prediseño académico para aprender: no es un diseño de ingeniería. Un diseño real necesita estudios de campo, hidrología, geotecnia, normas vigentes y la firma de un profesional.</p>
    </div>
  );
}

function ToolForm({ tool, level, kind, part }: { tool: Tool; level: Level; kind: 'calc' | 'pre'; part: DesignPart }) {
  const [vals, setVals] = useState<Vals>(() => Object.fromEntries(tool.fields.map((f) => [f.id, f.def])));
  const kid = level === 'ninos';
  const visible = tool.fields.filter((f) => (!kid || f.kid) && (!f.when || f.when[1].includes(String(vals[f.when[0]]))));
  const res = useMemo(() => tool.run(vals), [tool, vals]);
  const memo = () => {
    const lines = [
      `${tool.title} — Ciclo hidrológico, Hidráulica de canales`,
      `Fecha: ${new Date().toLocaleString('es-CO')}`,
      '',
      'DATOS',
      ...tool.fields.filter((f) => !f.when || f.when[1].includes(String(vals[f.when[0]]))).map((f) => `  ${f.label}: ${f.options ? f.options.find((o) => o.value === vals[f.id])?.label ?? vals[f.id] : vals[f.id]}${f.unit ? ` ${f.unit}` : ''}`),
      '',
      'CÁLCULO',
      ...res.steps.map((s, k) => `  ${k + 1}. ${s}`),
      '',
      'RESULTADOS',
      ...res.outs.map((o) => `  ${o.label}: ${o.value}`),
      ...(res.checks ? ['', 'VERIFICACIONES', ...res.checks.map((c) => `  [${c.ok ? 'cumple' : 'no cumple'}] ${c.name}: ${c.value}`)] : []),
      ...(res.error ? ['', `AVISO: ${res.error}`] : []),
      '',
      'Prediseño académico: no es un diseño de ingeniería.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind === 'pre' ? 'prediseno' : 'calculo'}-${part}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className={`hc-tool is-${kind}`} aria-label={tool.title}>
      <p className="hc-kicker">{kind === 'calc' ? 'Calculadora: revisa lo que tú propones' : 'Prediseñador: propone las medidas y las revisa'}</p>
      <h3>{tool.title}</h3>
      <p className="q3-small">{kid ? tool.kidIntro : tool.intro}</p>
      <div className="hc-form">
        {visible.map((f) => (
          <label key={f.id}>
            <span>
              {f.label} {f.unit && <span className="hc-unit">({f.unit})</span>}
            </span>
            {f.text ? (
              <textarea rows={8} value={String(vals[f.id])} onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value }))} spellCheck={false} />
            ) : f.options ? (
              <select value={String(vals[f.id])} onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value }))}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input inputMode="decimal" value={String(vals[f.id]).replace('.', ',')} onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value.replace(',', '.') }))} />
            )}
          </label>
        ))}
      </div>
      {res.error && <p className="q3-progress">{res.error}</p>}
      {kid ? (
        res.kid && <p className="q3-progress is-ok">{res.kid}</p>
      ) : null}
      {res.outs.length > 0 && (
        <div className="hc-result">
          {res.outs
            .filter((o) => !kid || o.kid)
            .map((o) => (
              <div key={o.label}>
                <span>{o.label}</span>
                <b>{o.value}</b>
              </div>
            ))}
        </div>
      )}
      {res.checks && (
        <ul className="hc-checks">
          {res.checks.map((c) => (
            <li key={c.name} className={c.ok ? 'is-ok' : 'is-bad'}>
              <span>{c.name}</span>
              <b>
                {c.ok ? 'cumple' : 'no cumple'} · {c.value}
              </b>
            </li>
          ))}
        </ul>
      )}
      {!kid && res.steps.length > 0 && (
        <details className="hc-details">
          <summary>Paso a paso</summary>
          <ol className="hc-steps">
            {res.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </details>
      )}
      {kind === 'pre' && (
        <button type="button" className="hc-memo" onClick={memo}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14v2.5h12V14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Descargar la memoria de cálculo (.txt)
        </button>
      )}
    </section>
  );
}

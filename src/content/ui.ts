// Textos de la interfaz.

export const UI = {
  appTitle: 'Laboratorio del agua',
  appSubtitle: 'Observa, pregunta y experimenta',
  modes: {
    guided: 'Recorrido guiado',
    explore: 'Exploración libre',
    lab: 'Experimentos',
    city: 'Medellín: laboratorio de lluvia',
    quality: 'Calidad del agua',
    canals: 'Hidráulica de canales',
  },
  tools: {
    tracer: 'Gota trazadora',
    challenges: 'Retos',
    glossary: 'Glosario',
    logbook: 'Bitácora',
  },
  modesShort: {
    guided: 'Recorrido',
    explore: 'Explorar',
    lab: 'Experimentos',
    city: 'Medellín',
    quality: 'Calidad',
    canals: 'Canales',
  },
  /** Salas de la portada: el ciclo del agua (con sus tres modos) y los tres laboratorios. */
  rooms: {
    ciclo: 'El ciclo del agua',
    city: 'Medellín: laboratorio de lluvia',
    quality: 'Calidad del agua',
    canals: 'Hidráulica de canales',
  },
  roomsShort: {
    ciclo: 'Ciclo del agua',
    city: 'Medellín',
    quality: 'Calidad',
    canals: 'Canales',
  },
  toolsShort: {
    tracer: 'Gota',
    challenges: 'Retos',
    glossary: 'Glosario',
    logbook: 'Bitácora',
  },
  nav: {
    prev: 'Anterior',
    next: 'Siguiente',
    pause: 'Pausar',
    resume: 'Reanudar',
    replay: 'Repetir',
    stepOf: (i: number, n: number) => `Paso ${i} de ${n}`,
  },
  sections: {
    what: 'Qué sucede',
    cause: 'Qué lo provoca',
    keyIdea: 'Idea clave',
    metaphorImage: 'Comparación',
    metaphorScience: 'Explicación científica',
    tryIt: 'Pruébalo',
    observe: 'Observa y responde',
    more: 'Quiero saber más',
    staticDesc: 'Descripción sin animación',
    listen: 'Escuchar en voz alta',
    stopListening: 'Detener lectura',
  },
  feedback: {
    tryAgain: 'Observar de nuevo',
    hintLead: 'Pista',
    rightLead: 'Bien razonado',
  },
  settings: {
    title: 'Ajustes',
    reducedMotion: 'Reducir movimiento',
    reducedMotionHelp: 'Detiene las partículas y muestra el paisaje con flechas estáticas y descripciones.',
    sound: 'Sonido ambiental',
    soundHelp: 'Viento y lluvia suaves generados en el navegador. Empieza desactivado.',
    narration: 'Botón de narración',
    narrationHelp: 'Muestra un botón para escuchar los textos. El texto siempre permanece visible.',
    labels: 'Etiquetas en el paisaje',
    arrows: 'Flechas de procesos',
    resetProgress: 'Borrar mi progreso guardado',
    privacy: 'Tu progreso, tu bitácora y tus preferencias se guardan solo en este navegador. No se envían datos a ningún servidor.',
    quality: 'Calidad visual',
    qualityHelp: '«Ligera» muestra menos partículas para equipos lentos. «Automática» se aligera sola si hace falta.',
  },
  legendTitle: 'Leyenda',
  simplified: 'Velocidades, tamaños y tiempos simplificados: el flujo subterráneo real es muchísimo más lento.',
  scene: {
    label: 'Paisaje del ciclo hidrológico con corte del terreno',
    zoomIn: 'Acercar a la zona',
    zoomOut: 'Ver paisaje completo',
  },
};

export interface LegendEntry {
  id: string;
  label: string;
  desc: string;
}

export const LEGEND: LegendEntry[] = [
  { id: 'liquid', label: 'Agua líquida', desc: 'Gota azul rellena.' },
  { id: 'vapor', label: 'Vapor de agua (representación)', desc: 'Círculo hueco. El vapor real es invisible.' },
  { id: 'cloud', label: 'Gotas de nube', desc: 'Puntos blancos muy pequeños.' },
  { id: 'ice', label: 'Hielo y nieve', desc: 'Cristal de seis puntas.' },
  { id: 'arrow-vapor', label: 'Flujo de vapor', desc: 'Flecha discontinua con punta hueca.' },
  { id: 'arrow-liquid', label: 'Flujo de agua en superficie', desc: 'Flecha continua con punta rellena.' },
  { id: 'arrow-subsurface', label: 'Flujo bajo tierra', desc: 'Flecha punteada.' },
  { id: 'arrow-ice', label: 'Caída de nieve', desc: 'Flecha blanca con borde azul.' },
  { id: 'reservoir', label: 'Reservorio', desc: 'Etiqueta rellena con esquina cuadrada.' },
  { id: 'process', label: 'Proceso', desc: 'Etiqueta con borde y flecha.' },
  { id: 'watertable', label: 'Nivel freático', desc: 'Línea discontinua con el símbolo ▽.' },
  { id: 'tracer', label: 'Gota trazadora', desc: 'Marcador rosado: sigue una pequeña porción de agua.' },
  { id: 'fog', label: 'Niebla', desc: 'Banda blanca difusa: gotitas que la vegetación atrapa (precipitación horizontal).' },
  { id: 'well', label: 'Pozo de bombeo', desc: 'Tubo vertical: al bombear, el nivel freático baja a su alrededor.' },
  { id: 'saltwedge', label: 'Cuña de agua salada', desc: 'Línea clara discontinua bajo la costa: límite entre agua dulce y salada.' },
  { id: 'detail', label: 'Ver de cerca', desc: 'Abre una vista de detalle de ese lugar (esquema, no a escala).' },
  { id: 'pin', label: 'Pregunta para investigar', desc: 'Marca rosada con «?» en la exploración libre.' },
];

/** Créditos del desarrollo y dedicatoria: se muestran al pie de Ayuda y de Ajustes. */
export const CREDITS = {
  author: 'Diseñado y desarrollado por Oscar Cossio.',
  dedicatedTo: 'Leidy Hernandez Acevedo',
  dedication: 'Porque tú lo inspiraste, y a través de él enseñas y transformas territorios y vidas.',
};

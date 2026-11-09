// Grafo de rutas posibles del agua. Lo usan la gota trazadora y el reto «Construye una ruta».
// Los trayectos dibujados están en scene/geometry.ts (TRACER_PATHS), con la misma clave "origen>destino".

export interface RouteNode {
  id: string;
  name: string;
  /** Estado en que se encuentra el agua en este lugar. */
  state: 'vapor' | 'cloud' | 'liquid' | 'ice';
  storage: string;
  time: string;
  region: string;
}

export interface RouteEdge {
  from: string;
  to: string;
  process: string;
  caption: string;
}

export const ROUTE_NODES: Record<string, RouteNode> = {
  oceano: { id: 'oceano', name: 'Océano', state: 'liquid', storage: 'Puede quedar almacenada en el océano.', time: 'Permanencia típica: cientos a miles de años.', region: 'ocean' },
  atmosfera: { id: 'atmosfera', name: 'Atmósfera (vapor)', state: 'vapor', storage: 'Viaja en el aire como vapor invisible.', time: 'Permanencia típica: días; en promedio, algo más de una semana.', region: 'atmosphere' },
  nube: { id: 'nube', name: 'Nube', state: 'cloud', storage: 'Forma parte de una gota de nube.', time: 'Permanencia típica: minutos u horas.', region: 'condensation' },
  dosel: { id: 'dosel', name: 'Hojas del dosel', state: 'liquid', storage: 'Queda sobre una hoja, interceptada.', time: 'Permanencia típica: minutos u horas.', region: 'canopy' },
  superficie: { id: 'superficie', name: 'Suelo del bosque (superficie)', state: 'liquid', storage: 'Llega a la superficie del terreno.', time: 'Permanencia típica: instantes u horas.', region: 'infiltration' },
  ciudad: { id: 'ciudad', name: 'Pavimento de la ciudad', state: 'liquid', storage: 'Cae sobre el pavimento: casi no puede infiltrarse.', time: 'Permanencia típica: instantes u horas (charcos).', region: 'town' },
  suelo: { id: 'suelo', name: 'Humedad del suelo', state: 'liquid', storage: 'Queda retenida entre las partículas del suelo.', time: 'Permanencia típica: días a meses.', region: 'soil' },
  planta: { id: 'planta', name: 'Interior de la planta', state: 'liquid', storage: 'Sube por el xilema del árbol.', time: 'Permanencia típica: horas a días.', region: 'transpiration' },
  acuifero: { id: 'acuifero', name: 'Acuífero', state: 'liquid', storage: 'Se suma al agua subterránea de la zona saturada.', time: 'Permanencia típica: meses, años o miles de años, según la profundidad.', region: 'aquifer' },
  rio: { id: 'rio', name: 'Río', state: 'liquid', storage: 'Avanza con la corriente del río.', time: 'Permanencia típica: días a semanas.', region: 'river' },
  lago: { id: 'lago', name: 'Lago', state: 'liquid', storage: 'Puede quedar almacenada en el lago.', time: 'Permanencia típica: meses a años.', region: 'lake' },
  nieve: { id: 'nieve', name: 'Nieve de la cumbre', state: 'ice', storage: 'Queda congelada en el manto de nieve.', time: 'Permanencia típica: semanas o meses; en glaciares, mucho más.', region: 'mountains' },
};

export const ROUTE_EDGES: RouteEdge[] = [
  { from: 'oceano', to: 'atmosfera', process: 'Evaporación', caption: 'La energía solar separa moléculas de la superficie del mar. Ahora es vapor invisible y el viento lo transporta.' },
  { from: 'lago', to: 'atmosfera', process: 'Evaporación', caption: 'Desde la superficie del lago, el agua pasa a vapor.' },
  { from: 'rio', to: 'atmosfera', process: 'Evaporación', caption: 'También los ríos pierden agua por evaporación.' },
  { from: 'atmosfera', to: 'nube', process: 'Condensación', caption: 'El aire sube y se enfría; el vapor se condensa sobre núcleos diminutos y forma una gota de nube.' },
  { from: 'nube', to: 'atmosfera', process: 'Evaporación de gotas de nube', caption: 'No todas las nubes producen lluvia: muchas gotas de nube se evaporan y la nube se disipa.' },
  { from: 'nube', to: 'dosel', process: 'Precipitación sobre el bosque', caption: 'La gota de nube creció al unirse con otras, su caída superó al aire que sube y cayó sobre una hoja.' },
  { from: 'nube', to: 'superficie', process: 'Precipitación sobre el suelo', caption: 'La gota cae entre los árboles y llega al suelo.' },
  { from: 'nube', to: 'ciudad', process: 'Precipitación sobre la ciudad', caption: 'El viento llevó la nube hacia la ciudad y la gota cayó sobre el pavimento.' },
  { from: 'nube', to: 'nieve', process: 'Precipitación en forma de nieve', caption: 'La nube llega a las cumbres, donde hace más frío: el agua forma cristales de hielo que caen como nieve.' },
  { from: 'nube', to: 'oceano', process: 'Precipitación sobre el océano', caption: 'Gran parte de la lluvia del planeta cae directamente sobre el mar.' },
  { from: 'dosel', to: 'atmosfera', process: 'Evaporación desde las hojas', caption: 'El agua interceptada vuelve al aire sin tocar el suelo.' },
  { from: 'dosel', to: 'superficie', process: 'Goteo (trascolación)', caption: 'La hoja ya no puede retener más agua y la gota cae al suelo.' },
  { from: 'superficie', to: 'suelo', process: 'Infiltración', caption: 'La gota entra al suelo por los espacios entre sus partículas.' },
  { from: 'superficie', to: 'rio', process: 'Escorrentía superficial', caption: 'El suelo no alcanza a recibirla: corre ladera abajo, siguiendo el relieve, hasta el río.' },
  { from: 'superficie', to: 'atmosfera', process: 'Evaporación', caption: 'Desde un charco o el suelo mojado, la gota se evapora.' },
  { from: 'ciudad', to: 'rio', process: 'Escorrentía superficial', caption: 'Corre por el pavimento hasta una alcantarilla que la lleva rápidamente al río.' },
  { from: 'ciudad', to: 'atmosfera', process: 'Evaporación', caption: 'Un charco sobre el pavimento se evapora con el sol.' },
  { from: 'suelo', to: 'planta', process: 'Absorción por las raíces', caption: 'Una raíz absorbe el agua y la conduce por el xilema hacia las hojas.' },
  { from: 'suelo', to: 'acuifero', process: 'Percolación y recarga', caption: 'Baja lentamente por la zona no saturada hasta alcanzar el nivel freático: es recarga.' },
  { from: 'suelo', to: 'atmosfera', process: 'Evaporación del suelo', caption: 'Cerca de la superficie, el agua del suelo se evapora.' },
  { from: 'planta', to: 'atmosfera', process: 'Transpiración', caption: 'En la hoja se evapora y sale como vapor por un estoma.' },
  { from: 'acuifero', to: 'rio', process: 'Flujo subterráneo y descarga al río', caption: 'Avanza muy despacio entre los poros, de mayor a menor carga, y sale por el lecho del río. (En la animación, este viaje está muy acelerado.)' },
  { from: 'acuifero', to: 'lago', process: 'Flujo subterráneo y manantial', caption: 'Sale a la superficie en el manantial y el arroyo la lleva al lago. (Viaje acelerado en la animación.)' },
  { from: 'acuifero', to: 'oceano', process: 'Descarga submarina', caption: 'Por una trayectoria profunda y lenta llega al fondo del mar, cerca de la costa. (Viaje acelerado en la animación.)' },
  { from: 'nieve', to: 'lago', process: 'Fusión y escorrentía', caption: 'Con más energía y temperatura, la nieve se funde y el arroyo de deshielo baja hasta el lago.' },
  { from: 'nieve', to: 'atmosfera', process: 'Sublimación', caption: 'En la cumbre fría y soleada, el hielo pasa directamente a vapor.' },
  { from: 'lago', to: 'rio', process: 'Salida del lago', caption: 'El agua sale del lago por el río que nace en él.' },
  { from: 'rio', to: 'oceano', process: 'Flujo del río', caption: 'El río desemboca en el océano.' },
];

export const edgeKey = (e: { from: string; to: string }) => `${e.from}>${e.to}`;

export const edgesFrom = (node: string) => ROUTE_EDGES.filter((e) => e.from === node);

/** Opciones que no son posibles desde cada lugar, con una pista (reto «Construye una ruta»). */
export const INVALID_OPTIONS: Record<string, { process: string; hint: string }[]> = {
  oceano: [{ process: 'Infiltración', hint: 'La infiltración ocurre cuando el agua entra al suelo. Desde el océano, ¿qué proceso lleva el agua al aire?' }],
  atmosfera: [{ process: 'Escorrentía superficial', hint: 'La escorrentía ocurre sobre el terreno. En el aire, el vapor debe cambiar de estado primero: ¿cuál es ese cambio?' }],
  nube: [{ process: 'Transpiración', hint: 'La transpiración ocurre en las plantas. Desde una nube, el agua puede caer o evaporarse.' }],
  dosel: [{ process: 'Recarga', hint: 'La recarga ocurre en el nivel freático, muy por debajo de las hojas. ¿Qué puede pasarle a una gota sobre una hoja?' }],
  superficie: [{ process: 'Condensación', hint: 'La condensación ocurre cuando el vapor se enfría en el aire. La gota ya es líquida y está en el suelo.' }],
  ciudad: [{ process: 'Infiltración profunda', hint: 'El pavimento casi no deja pasar el agua. Observa el corte bajo la ciudad: ¿por dónde se va?' }],
  suelo: [{ process: 'Condensación', hint: 'El agua del suelo ya es líquida. Puede bajar, ser absorbida por raíces o evaporarse.' }],
  planta: [{ process: 'Escorrentía superficial', hint: 'Dentro de la planta el agua sube por el xilema. ¿Por dónde sale de las hojas?' }],
  acuifero: [{ process: 'Precipitación', hint: 'La precipitación cae de las nubes. El agua subterránea se mueve lentamente hacia algún lugar de descarga.' }],
  rio: [{ process: 'Transpiración', hint: 'La transpiración ocurre en las plantas. El río fluye hacia lugares más bajos.' }],
  lago: [{ process: 'Percolación hacia la nube', hint: 'La percolación va hacia abajo, no hacia las nubes. ¿Cómo puede el agua del lago llegar al aire o salir por el río?' }],
  nieve: [{ process: 'Transpiración', hint: 'La nieve no transpira: eso lo hacen las plantas. La nieve puede fundirse o pasar directo a vapor.' }],
};

export const ROUTE_GOALS = [
  { id: 'nieve-oceano', from: 'nieve', to: 'oceano', label: 'De la nieve al océano' },
  { id: 'oceano-acuifero', from: 'oceano', to: 'acuifero', label: 'Del océano al acuífero' },
  { id: 'suelo-oceano', from: 'suelo', to: 'oceano', label: 'Del suelo al océano' },
];

export const TRACER_STARTS = ['oceano', 'nube', 'nieve', 'ciudad', 'lago'];

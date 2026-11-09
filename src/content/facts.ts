// «¿Sabías que…?»: datos verificados con fuentes institucionales o académicas.
// Las cifras son estimaciones o promedios: se redondean y se indica su origen.

export interface Source {
  id: string;
  org: string;
  title: string;
  url: string;
  note?: string;
}

export interface Fact {
  id: string;
  text: string;
  sources: string[];
}

export const SOURCES: Source[] = [
  {
    id: 'usgs-distribucion',
    org: 'Servicio Geológico de los Estados Unidos (USGS), Water Science School',
    title: 'How Much Water is There on Earth? (estimación de Shiklomanov, 1993)',
    url: 'https://www.usgs.gov/water-science-school/science/how-much-water-there-earth',
  },
  {
    id: 'usgs-et',
    org: 'USGS, Water Science School',
    title: 'Evapotranspiration and the Water Cycle',
    url: 'https://www.usgs.gov/water-science-school/science/evapotranspiration-and-water-cycle',
  },
  {
    id: 'usgs-et-archivo',
    org: 'USGS, Water Science School (versión archivada)',
    title: 'The Water Cycle: Evapotranspiration',
    url: 'https://webarchive.library.unt.edu/web/20130214225655/http:/ga.water.usgs.gov/edu/watercycleevapotranspiration.html',
  },
  {
    id: 'usgs-precipitacion',
    org: 'USGS, Water Science School',
    title: 'Precipitation and the Water Cycle',
    url: 'https://www.usgs.gov/water-science-school/science/precipitation-and-water-cycle',
  },
  {
    id: 'noaa-gotas',
    org: 'NOAA, Servicio Meteorológico Nacional (JetStream)',
    title: 'Fast Facts: gotas de nube y gotas de lluvia',
    url: 'https://www.noaa.gov/jetstream/ll-sweatin',
  },
  {
    id: 'uh-precipitacion',
    org: 'Universidad de Hawái en Mānoa (libro abierto de ciencias atmosféricas)',
    title: 'Chapter 7: Precipitation Processes',
    url: 'https://pressbooks-dev.oer.hawaii.edu/atmo/chapter/chapter-7-precipitation-processes/',
  },
  {
    id: 'hess-residencia',
    org: 'Hydrology and Earth System Sciences (revista científica)',
    title: 'van der Ent y Tuinenburg (2017): The residence time of water in the atmosphere revisited',
    url: 'https://hess.copernicus.org/articles/21/779/2017/',
  },
  {
    id: 'noaa-ciclo',
    org: 'NOAA, Servicio Meteorológico Nacional (JetStream)',
    title: 'The Hydrologic Cycle',
    url: 'https://www.noaa.gov/jetstream/max-what-cycle',
  },
  {
    id: 'earle-flujo',
    org: 'BCcampus Open Education (S. Earle, Physical Geology, 2.ª ed.)',
    title: '14.2 Groundwater Flow',
    url: 'https://opentextbc.ca/physicalgeology2ed/chapter/14-2-groundwater-flow/',
  },
  {
    id: 'usgs-flujo-base',
    org: 'USGS, Water Science School',
    title: 'Base Flow in Rivers',
    url: 'https://www.usgs.gov/water-science-school/science/base-flow-rivers',
  },
  {
    id: 'usgs-circ1139',
    org: 'USGS, Circular 1139 (Winter y otros, 1998)',
    title: 'Ground Water and Surface Water: A Single Resource — Concepts of Ground Water, Water Table, and Flow Systems',
    url: 'https://pubs.usgs.gov/circ/circ1139/htdocs/boxa.htm',
  },
  {
    id: 'usgs-urbano',
    org: 'USGS, Fact Sheet 2016-3023',
    title: 'Urbanización e hidrología: el hidrograma se vuelve más rápido y con picos más altos (a partir de Leopold, 1968)',
    url: 'https://pubs.usgs.gov/fs/2016/3023/fs20163023.pdf',
  },
  {
    id: 'usgs-salina',
    org: 'USGS, New York Water Science Center',
    title: 'Long Island Fresh and Saltwater Relations/Interactions',
    url: 'https://www.usgs.gov/centers/new-york-water-science-center/science/long-island-fresh-and-saltwater-relationsinteractions',
  },
  {
    id: 'humboldt-paramos',
    org: 'WWF Colombia, con datos del Instituto Humboldt (El gran libro de los páramos, 2011)',
    title: 'Infografía: 1, 2, 3 por los páramos',
    url: 'https://d2ouvy59p0dg6k.cloudfront.net/downloads/infografia_ajustada.pdf',
  },
  {
    id: 'ideam-glaciares',
    org: 'IDEAM, Grupo de monitoreo de ecosistemas de alta montaña',
    title: 'Glaciares de Colombia (presentación, 2025)',
    url: 'https://ipromolatinoamericano.condesan.org/wp-content/uploads/2025/11/PPT-Andres-Cruz_Glaciares-de-Colombia.pdf',
  },
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s])) as Record<string, Source>;

export const FACTS: Record<string, Fact> = {
  distribucion: {
    id: 'distribucion',
    text: 'Alrededor del 96,5 % del agua de la Tierra está en los océanos. Del agua dulce, más de dos tercios está congelada en glaciares y casquetes de hielo, y cerca de un 30 % es agua subterránea.',
    sources: ['usgs-distribucion'],
  },
  transpiracion10: {
    id: 'transpiracion10',
    text: 'Se estima que cerca del 10 % de la humedad de la atmósfera viene de la transpiración de las plantas; casi todo el resto proviene de la evaporación de océanos, lagos y ríos.',
    sources: ['usgs-et-archivo'],
  },
  hoja: {
    id: 'hoja',
    text: 'Durante la temporada de crecimiento, una hoja puede transpirar muchas veces su propio peso en agua. Un roble grande puede devolver a la atmósfera unos 150 000 litros en un año.',
    sources: ['usgs-et-archivo'],
  },
  millon: {
    id: 'millon',
    text: 'Hace falta el agua de alrededor de un millón de gotitas de nube para formar una sola gota de lluvia.',
    sources: ['noaa-gotas', 'usgs-precipitacion'],
  },
  tamano: {
    id: 'tamano',
    text: 'Una gota de lluvia típica mide unos 2 milímetros; una gotita de nube es unas cien veces más estrecha.',
    sources: ['uh-precipitacion'],
  },
  atmosfera: {
    id: 'atmosfera',
    text: 'En promedio, el agua permanece en la atmósfera entre 8 y 10 días antes de volver a caer como lluvia o nieve.',
    sources: ['hess-residencia'],
  },
  oceano: {
    id: 'oceano',
    text: 'Una molécula de agua puede pasar unos pocos miles de años en el océano, pero en la atmósfera solo se queda alrededor de nueve días.',
    sources: ['noaa-ciclo'],
  },
  velocidad: {
    id: 'velocidad',
    text: 'El agua subterránea se mueve de mayor a menor carga hidráulica. En arenas permeables puede avanzar unos centímetros por día; en otros materiales, apenas milímetros o centímetros por año.',
    sources: ['earle-flujo'],
  },
  flujoBase: {
    id: 'flujoBase',
    text: 'Muchos ríos no se secan en las sequías porque el agua subterránea sigue entrando a sus cauces: es el flujo base.',
    sources: ['usgs-flujo-base'],
  },
  pozo: {
    id: 'pozo',
    text: 'El agua de la zona no saturada no se puede bombear: los poros la retienen. Solo por debajo del nivel freático la presión del agua le permite entrar en un pozo.',
    sources: ['usgs-circ1139'],
  },
  urbano: {
    id: 'urbano',
    text: 'Cuando una cuenca se urbaniza, el pavimento y los drenajes hacen que el agua llegue antes al río: el tiempo de retardo se acorta y los picos de caudal son más altos.',
    sources: ['usgs-urbano'],
  },
  salina: {
    id: 'salina',
    text: 'Cerca de la costa, el agua dulce del acuífero flota sobre agua salada, más densa. Si el bombeo baja el nivel freático, el agua salada puede avanzar tierra adentro.',
    sources: ['usgs-salina'],
  },
  paramos: {
    id: 'paramos',
    text: 'Los páramos ocupan cerca del 1,7 % del territorio de Colombia, pero de ellos depende el agua de alrededor del 70 % de la población del país.',
    sources: ['humboldt-paramos'],
  },
  glaciares: {
    id: 'glaciares',
    text: 'Hacia 1850 Colombia tenía unos 349 km² de glaciares; en 2024 quedaban alrededor de 31 km², repartidos en seis glaciares.',
    sources: ['ideam-glaciares'],
  },
};

export const FACTS_BY_STEP: Record<string, Fact[]> = {
  reservorios: [FACTS.distribucion],
  transpiracion: [FACTS.transpiracion10, FACTS.hoja],
  condensacion: [FACTS.tamano],
  transporte: [FACTS.atmosfera],
  precipitacion: [FACTS.millon, FACTS.glaciares],
  percolacion: [FACTS.pozo],
  escorrentia: [FACTS.urbano],
  'flujo-subterraneo': [FACTS.velocidad, FACTS.flujoBase],
  almacenamiento: [FACTS.oceano],
  personas: [FACTS.salina, FACTS.paramos],
};

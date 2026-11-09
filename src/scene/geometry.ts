// Geometría del paisaje: todas las coordenadas viven aquí, separadas del contenido.
// Sistema de coordenadas de escena: 1600 × 1000 unidades (el arte se extiende más allá
// para que la cámara pueda encuadrar sin franjas vacías).

import { densify, type Pt, yAt } from '../lib/paths';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SCENE: Rect = { x: 0, y: 0, w: 1600, h: 1000 };
export const BOUNDS: Rect = { x: -320, y: -520, w: 2240, h: 1840 };
/** Encuadre que muestra el sistema completo. */
export const FULL_VIEW: Rect = { x: 0, y: 24, w: 1600, h: 946 };
/** Vista general en pantallas estrechas: el centro del paisaje; el resto se recorre deslizando. */
export const OVERVIEW_COMPACT: Rect = { x: 430, y: 150, w: 760, h: 850 };

export const HORIZON = 470;
export const SEA_LEVEL = 770;
export const RIVER_LEVEL = 768;
export const SOIL_DEPTH = 22;
export const CONDENSATION_LEVEL = 300;
export const FREEZING_LEVEL = 232;

/* ------------------------------------------------------------------ */
/* Corte del terreno (cara frontal del bloque)                          */
/* ------------------------------------------------------------------ */

/** Perfil de la superficie del terreno en el borde frontal (de la costa a la montaña). */
export const LAND_FRONT: Pt[] = [
  [290, 792], [310, 772], [335, 762], [358, 756], [372, 766], [386, 786], [426, 786], [440, 766],
  [456, 752], [500, 730], [560, 716], [640, 706], [720, 694], [800, 676], [880, 650], [950, 628],
  [1010, 618], [1060, 620], [1120, 630], [1180, 640], [1235, 646], [1262, 646], [1300, 640],
  [1340, 626], [1400, 590], [1460, 545], [1530, 490], [1600, 440], [1700, 380], [1800, 330], [1920, 290],
];

/** Fondo marino en el corte. */
export const SEAFLOOR: Pt[] = [
  [-320, 960], [-100, 945], [60, 925], [160, 890], [230, 840], [270, 810], [290, 792],
];

/** Nivel freático: límite superior de la zona saturada. Coincide con el río y aflora en el manantial. */
export const WATER_TABLE: Pt[] = [
  [300, 771], [360, 769.6], [406, 768], [456, 767], [540, 758], [640, 750], [740, 740], [840, 728],
  [940, 714], [1040, 700], [1140, 684], [1210, 666], [1262, 648], [1310, 640], [1360, 630],
  [1410, 614], [1470, 598], [1530, 580], [1600, 560], [1700, 535], [1800, 510], [1920, 480],
];

/** Contacto entre sedimentos y roca fracturada. */
export const BEDROCK: Pt[] = [
  [-320, 1000], [0, 975], [200, 945], [400, 925], [700, 915], [1000, 905], [1300, 890], [1600, 865], [1920, 840],
];

export const BLOCK_BOTTOM = 1320;

/** Versiones densificadas y suavizadas de los perfiles (las usan el dibujo y las partículas). */
export const LAND_FRONT_D: Pt[] = densify(LAND_FRONT, 6, true);
export const WATER_TABLE_D: Pt[] = densify(WATER_TABLE, 6, true);

export const yFront = (x: number) => yAt(LAND_FRONT_D, x);
export const yWaterTable = (x: number) => yAt(WATER_TABLE_D, x);
export const yBedrock = (x: number) => yAt(BEDROCK, x);

/** Fracturas de la roca (líneas irregulares). */
export const FRACTURES: Pt[][] = [
  // pocas fracturas, conectadas y continuas: el agua solo circula por ellas
  [[338, 942], [352, 975], [346, 1012], [372, 1060], [366, 1110]],
  [[352, 975], [392, 992], [430, 990]],
  [[700, 926], [720, 962], [714, 1004], [740, 1056], [734, 1110]],
  [[714, 1004], [668, 1026], [626, 1030]],
  [[1048, 910], [1074, 946], [1066, 990], [1092, 1040], [1086, 1100]],
  [[1066, 990], [1116, 1010], [1160, 1006]],
  [[1392, 886], [1414, 922], [1404, 964], [1432, 1012]],
]

/** Pozos de observación (piezómetros): el nivel del agua indica la carga hidráulica. */
export const WELLS = [
  { x: 700, top: 700, bottom: 800 },
  { x: 1100, top: 626, bottom: 790 },
];

export const SPRING: Pt = [1262, 646];

/* ------------------------------------------------------------------ */
/* Superficie (vista en perspectiva)                                    */
/* ------------------------------------------------------------------ */

/** Línea de costa sobre la superficie, desde el borde frontal hacia el horizonte. */
export const COASTLINE: Pt[] = [
  [312, 772], [322, 740], [340, 700], [372, 650], [420, 600], [480, 550], [540, 510], [600, 482], [660, 470],
];

/** Río: línea central desde la salida del lago hasta el borde del corte. */
export const RIVER: Pt[] = [
  [944, 516], [900, 528], [850, 540], [790, 552], [730, 566], [670, 585], [620, 606], [575, 630],
  [530, 656], [490, 684], [458, 712], [436, 738], [416, 758], [406, 768],
];

export const RIVER_MOUTH: Pt[] = [[406, 768], [380, 771], [340, 771], [300, 768]];

export const LAKE = { cx: 1030, cy: 512, rx: 92, ry: 19 };

/** Arroyo que nace en el manantial y llega al lago. */
export const CREEK: Pt[] = [
  [1262, 646], [1240, 620], [1205, 592], [1160, 566], [1110, 544], [1080, 530], [1066, 522],
];

/** Arroyos de deshielo. */
export const MELT_STREAMS: Pt[][] = [
  [[1262, 300], [1240, 340], [1210, 390], [1180, 440], [1150, 480], [1118, 508]],
  [[1400, 300], [1370, 350], [1330, 400], [1290, 440], [1240, 470], [1190, 492], [1122, 512]],
];

/** Silueta de las montañas. */
export const RIDGE: Pt[] = [
  [960, 484], [1040, 440], [1110, 390], [1170, 330], [1230, 250], [1290, 170], [1330, 215], [1370, 200],
  [1420, 150], [1470, 112], [1520, 170], [1570, 205], [1610, 185], [1680, 150], [1740, 200], [1820, 250],
  [1920, 280],
];

export const yRidge = (x: number) => yAt(RIDGE, x);

/** Caras en sombra de las montañas (luz desde el Sol, a la izquierda). */
export const SHADOW_FACES: Pt[][] = [
  [[1290, 170], [1330, 215], [1338, 300], [1318, 380], [1290, 450], [1268, 505], [1250, 470], [1264, 350], [1282, 240]],
  [[1470, 112], [1520, 170], [1570, 205], [1562, 300], [1522, 400], [1484, 470], [1452, 530], [1442, 420], [1456, 300], [1465, 190]],
  [[1680, 150], [1740, 200], [1820, 250], [1800, 330], [1740, 400], [1700, 340], [1688, 240]],
];

/** Crestas secundarias (detalle). */
export const SPURS: Pt[][] = [
  [[1420, 150], [1400, 230], [1360, 320]],
  [[1230, 250], [1215, 320], [1190, 380]],
  [[1610, 185], [1600, 260], [1575, 340]],
];

/** Pie de la montaña: donde la ladera se encuentra con la llanura. */
export const MOUNTAIN_FOOT: Pt[] = [
  [1040, 482], [1140, 492], [1220, 510], [1300, 540], [1370, 570], [1400, 590],
];

/** Colinas lejanas (perspectiva atmosférica). */
export const FAR_HILLS: Pt[] = [
  [560, 472], [620, 458], [690, 448], [760, 444], [840, 450], [910, 462], [980, 476],
];

/** Región para colocar árboles del bosque (superficie). */
export const FOREST_POLY: Pt[] = [
  [850, 560], [900, 545], [960, 538], [1060, 540], [1140, 548], [1220, 556], [1300, 580], [1340, 606],
  [1336, 618], [1300, 632], [1262, 638], [1200, 632], [1120, 622], [1060, 612], [1010, 610], [950, 620],
  [880, 642], [850, 648],
];

/** Ladera baja de la montaña con coníferas. */
export const FLANK_POLY: Pt[] = [
  [1070, 482], [1140, 466], [1200, 440], [1260, 412], [1330, 404], [1400, 424], [1460, 444],
  [1520, 432], [1600, 420], [1600, 436], [1530, 486], [1460, 540], [1402, 584], [1370, 566],
  [1300, 536], [1220, 508], [1140, 490],
];

/** Región agrícola detrás del río. */
export const FIELDS_POLY: Pt[] = [
  [600, 486], [700, 474], [800, 476], [900, 486], [940, 506], [900, 524], [790, 546], [700, 568], [640, 590], [560, 616], [470, 560], [540, 510],
];

/* ------------------------------------------------------------------ */
/* Ciudad                                                               */
/* ------------------------------------------------------------------ */

export const HOUSES: { x: number; y: number; w: number; hue: number }[] = [
  { x: 662, y: 610, w: 26, hue: 0 },
  { x: 720, y: 596, w: 24, hue: 2 },
  { x: 790, y: 578, w: 24, hue: 1 },
  { x: 615, y: 640, w: 28, hue: 1 },
  { x: 700, y: 628, w: 30, hue: 3 },
  { x: 770, y: 610, w: 28, hue: 0 },
  { x: 826, y: 596, w: 26, hue: 2 },
  { x: 580, y: 672, w: 30, hue: 2 },
  { x: 650, y: 664, w: 32, hue: 0 },
  { x: 740, y: 652, w: 30, hue: 1 },
  { x: 808, y: 634, w: 28, hue: 3 },
];

/** Calle principal (cinta) y calle transversal. */
export const STREETS: Pt[][] = [
  [[548, 700], [620, 678], [700, 654], [780, 630], [850, 612]],
  [[612, 652], [640, 670], [672, 694]],
  [[740, 584], [758, 612], [772, 640], [784, 668]],
];

/** Pavimento según el tipo de superficie: 0 permeable, 1 mixta, 2 pavimentada. */
export const PAVEMENT_PLAZAS: Pt[][] = [
  [[680, 640], [720, 628], [736, 646], [694, 658]],
  [[796, 616], [836, 604], [846, 622], [806, 634]],
];

export const PAVEMENT_FULL: Pt[] = [
  [548, 666], [600, 632], [680, 598], [760, 574], [846, 558], [852, 648], [760, 672], [680, 688],
  [600, 700], [552, 708],
];

/** Jardines (zonas permeables de la ciudad). */
export const GARDENS: Pt[][] = [
  [[560, 690], [600, 676], [612, 690], [574, 702]],
  [[690, 668], [730, 656], [742, 672], [702, 684]],
  [[800, 652], [840, 640], [848, 654], [810, 664]],
  [[640, 622], [676, 610], [686, 622], [650, 634]],
];

export const STORM_DRAIN: Pt = [556, 646];

/* ------------------------------------------------------------------ */
/* Árbol destacado (transpiración e intercepción)                       */
/* ------------------------------------------------------------------ */

export const FEATURED_TREE = {
  base: [1010, 618] as Pt,
  canopy: [
    [985, 527, 30], [1035, 524, 30], [1010, 500, 34], [975, 502, 22], [1046, 500, 22], [1010, 536, 24],
  ] as [number, number, number][],
  roots: [
    [[1009, 618], [996, 626], [978, 632], [954, 637]],
    [[1011, 618], [1026, 627], [1042, 632], [1056, 636]],
    [[1010, 619], [1009, 634], [1006, 652]],
    [[1004, 620], [990, 636], [976, 646]],
    [[1016, 620], [1030, 640], [1040, 650]],
  ] as Pt[][],
  xylem: [
    [[954, 637], [978, 632], [996, 626], [1007, 619], [1007, 590], [1008, 560], [1004, 534], [988, 514]],
    [[1056, 636], [1042, 632], [1026, 627], [1012, 619], [1010, 590], [1011, 560], [1016, 532], [1034, 512]],
    [[1006, 652], [1009, 634], [1009, 600], [1010, 560], [1010, 520], [1010, 494]],
  ] as Pt[][],
};

export function canopyTop(x: number): number | null {
  let best: number | null = null;
  for (const [cx, cy, r] of FEATURED_TREE.canopy) {
    const dx = x - cx;
    if (Math.abs(dx) < r) {
      const y = cy - Math.sqrt(r * r - dx * dx);
      if (best === null || y < best) best = y;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Atmósfera                                                            */
/* ------------------------------------------------------------------ */

export const SUN = { x: 170, y: 112, r: 50 };

export interface CloudDef {
  id: 'A' | 'B' | 'C';
  circles: [number, number, number][];
  base: number;
}

export const CLOUDS: CloudDef[] = [
  { id: 'A', base: 268, circles: [[500, 250, 30], [535, 232, 38], [580, 224, 42], [624, 240, 32], [560, 254, 32], [470, 260, 20]] },
  { id: 'B', base: 246, circles: [[950, 214, 36], [992, 188, 48], [1048, 176, 58], [1104, 190, 48], [1146, 212, 34], [1010, 224, 36], [1092, 226, 36]] },
  { id: 'C', base: 104, circles: [[1400, 84, 30], [1440, 64, 40], [1496, 52, 46], [1552, 62, 40], [1596, 82, 28], [1468, 88, 30], [1532, 90, 30]] },
];

/** Líneas de corriente del viento (de la costa hacia la montaña). */
export const WIND_LINES: Pt[][] = [
  [[-200, 400], [150, 392], [500, 372], [800, 336], [1020, 286], [1200, 222], [1380, 160]],
  [[-200, 320], [200, 306], [560, 282], [860, 246], [1100, 186], [1300, 120], [1500, 70]],
  [[-200, 230], [260, 214], [640, 188], [960, 150], [1240, 96], [1500, 40]],
];

/** Trayectoria de la masa de aire en el paso de condensación (ascenso orográfico). */
export const PARCEL_PATH: Pt[] = [[430, 452], [640, 418], [840, 368], [990, 318], [1120, 262], [1210, 214]];

/* ------------------------------------------------------------------ */
/* Flujo del agua                                                       */
/* ------------------------------------------------------------------ */

/** Líneas de flujo subterráneo (zona saturada): bajan y luego suben hacia la descarga. */
export const GW_LINES: { id: string; to: 'spring' | 'river' | 'sea'; points: Pt[] }[] = [
  { id: 'spring', to: 'spring', points: [[1580, 575], [1500, 610], [1420, 640], [1340, 652], [1290, 652], [1264, 648]] },
  { id: 'hill', to: 'river', points: [[1040, 706], [960, 730], [860, 748], [740, 762], [620, 772], [520, 778], [455, 782], [420, 784]] },
  { id: 'river', to: 'river', points: [[1520, 600], [1420, 680], [1260, 740], [1060, 775], [840, 795], [640, 805], [500, 800], [440, 794], [412, 788]] },
  { id: 'deep', to: 'sea', points: [[1600, 640], [1480, 760], [1300, 840], [1060, 878], [800, 888], [560, 880], [400, 860], [300, 832], [264, 818]] },
  { id: 'rock', to: 'sea', points: [[1700, 700], [1560, 820], [1380, 895], [1150, 930], [900, 945], [650, 940], [430, 922], [300, 890], [222, 852]] },
];

/** Escorrentía superficial: caminos que siguen el relieve. */
export const RUNOFF_PATHS: { id: string; zone: 'front' | 'town' | 'forest' | 'mountain' | 'fields'; points: Pt[] }[] = [
  { id: 'front', zone: 'front', points: [[1000, 617], [950, 625], [880, 647], [800, 673], [720, 691], [640, 703], [560, 713], [500, 727], [460, 747], [442, 761]] },
  { id: 'town1', zone: 'town', points: [[846, 612], [780, 628], [720, 644], [660, 652], [600, 652], [562, 646]] },
  { id: 'town2', zone: 'town', points: [[780, 668], [720, 676], [660, 680], [600, 674], [560, 656]] },
  { id: 'forest', zone: 'forest', points: [[1120, 612], [1136, 596], [1150, 582], [1160, 568]] },
  { id: 'forest2', zone: 'forest', points: [[1230, 628], [1222, 614], [1212, 600], [1205, 592]] },
  { id: 'mountain', zone: 'mountain', points: [[1430, 432], [1385, 452], [1335, 470], [1285, 488], [1235, 502], [1180, 512], [1130, 516]] },
  { id: 'fields', zone: 'fields', points: [[780, 505], [762, 524], [744, 544], [728, 564]] },
];

/* ------------------------------------------------------------------ */
/* Flechas estáticas de procesos                                        */
/* ------------------------------------------------------------------ */

export type ArrowStyle = 'vapor' | 'liquid' | 'subsurface' | 'ice';

export interface ArrowDef {
  id: string;
  process: string;
  style: ArrowStyle;
  points: Pt[];
}

export const ARROWS: ArrowDef[] = [
  { id: 'evap-ocean', process: 'evaporacion', style: 'vapor', points: [[120, 720], [124, 640], [138, 560], [158, 498]] },
  { id: 'evap-lake', process: 'evaporacion', style: 'vapor', points: [[992, 504], [986, 470], [976, 438]] },
  { id: 'transp', process: 'transpiracion', style: 'vapor', points: [[1060, 468], [1080, 426], [1096, 392]] },
  { id: 'sublim', process: 'sublimacion', style: 'vapor', points: [[1494, 196], [1516, 168], [1530, 140]] },
  { id: 'advect1', process: 'transporte', style: 'vapor', points: [[150, 392], [350, 380], [560, 352]] },
  { id: 'advect2', process: 'transporte', style: 'vapor', points: [[760, 316], [870, 286], [950, 262]] },
  { id: 'cond', process: 'condensacion', style: 'vapor', points: [[604, 336], [594, 306], [580, 282]] },
  { id: 'rain', process: 'precipitacion', style: 'liquid', points: [[1160, 258], [1160, 340], [1158, 420]] },
  { id: 'snow', process: 'nevada', style: 'ice', points: [[1604, 112], [1606, 150], [1600, 186]] },
  { id: 'intercept', process: 'intercepcion', style: 'liquid', points: [[940, 430], [956, 452], [966, 470]] },
  { id: 'drip', process: 'intercepcion', style: 'liquid', points: [[1050, 548], [1056, 576], [1060, 600]] },
  { id: 'infilt', process: 'infiltracion', style: 'subsurface', points: [[925, 618], [925, 636], [925, 654]] },
  { id: 'perc', process: 'percolacion', style: 'subsurface', points: [[925, 664], [923, 688], [921, 712]] },
  { id: 'runoff-front', process: 'escorrentia', style: 'liquid', points: [[968, 621], [905, 640], [846, 659], [796, 675]] },
  { id: 'runoff-town', process: 'escorrentia', style: 'liquid', points: [[770, 632], [710, 646], [650, 652], [596, 652]] },
  { id: 'gw', process: 'flujo-subterraneo', style: 'subsurface', points: [[1220, 756], [1020, 780], [820, 796], [640, 803]] },
  { id: 'dis-river', process: 'descarga', style: 'subsurface', points: [[520, 798], [466, 794], [430, 790], [414, 780]] },
  { id: 'dis-spring', process: 'descarga', style: 'subsurface', points: [[1360, 662], [1312, 658], [1274, 650]] },
  { id: 'dis-sea', process: 'descarga', style: 'subsurface', points: [[400, 862], [330, 840], [274, 822]] },
  { id: 'river', process: 'rio', style: 'liquid', points: [[800, 550], [730, 567], [668, 587]] },
  { id: 'melt', process: 'fusion', style: 'liquid', points: [[1384, 326], [1350, 374], [1306, 424]] },
];

/** Punto de recarga destacado sobre el nivel freático. */
export const RECHARGE_POINT: Pt = [921, 716];

/* ------------------------------------------------------------------ */
/* Regiones de enfoque y anclas de etiquetas                            */
/* ------------------------------------------------------------------ */

export const REGIONS: Record<string, Rect> = {
  all: FULL_VIEW,
  sun: { x: 40, y: 20, w: 300, h: 220 },
  sky: { x: 0, y: 20, w: 1600, h: 460 },
  ocean: { x: -20, y: 430, w: 520, h: 520 },
  evaporation: { x: -20, y: 300, w: 760, h: 500 },
  lake: { x: 900, y: 450, w: 260, h: 120 },
  river: { x: 360, y: 490, w: 640, h: 300 },
  transpiration: { x: 880, y: 360, w: 300, h: 320 },
  canopy: { x: 920, y: 420, w: 200, h: 200 },
  cloudA: { x: 400, y: 160, w: 300, h: 160 },
  condensation: { x: 380, y: 130, w: 900, h: 360 },
  wind: { x: -20, y: 30, w: 1640, h: 460 },
  precipitation: { x: 880, y: 30, w: 800, h: 610 },
  interception: { x: 900, y: 410, w: 230, h: 230 },
  infiltration: { x: 820, y: 560, w: 440, h: 200 },
  percolation: { x: 800, y: 580, w: 480, h: 250 },
  runoff: { x: 420, y: 480, w: 900, h: 320 },
  groundwater: { x: 200, y: 600, w: 1420, h: 380 },
  mountains: { x: 1150, y: 30, w: 560, h: 520 },
  town: { x: 500, y: 560, w: 380, h: 200 },
  section: { x: 280, y: 600, w: 1340, h: 390 },
  soil: { x: 460, y: 600, w: 820, h: 120 },
  unsaturated: { x: 820, y: 610, w: 420, h: 130 },
  watertable: { x: 300, y: 620, w: 1300, h: 200 },
  aquifer: { x: 250, y: 690, w: 1360, h: 270 },
  bedrock: { x: 200, y: 870, w: 1500, h: 130 },
  spring: { x: 1160, y: 560, w: 220, h: 150 },
  atmosphere: { x: 0, y: 20, w: 1600, h: 460 },
  storage: FULL_VIEW,
  // Encuadres alternativos para pantallas estrechas (regiones muy anchas)
  windC: { x: 120, y: 120, w: 820, h: 380 },
  condensationC: { x: 400, y: 150, w: 760, h: 330 },
  precipitationC: { x: 900, y: 60, w: 620, h: 560 },
  runoffC: { x: 440, y: 520, w: 700, h: 260 },
  groundwaterC: { x: 340, y: 600, w: 800, h: 300 },
  evaporationC: { x: 0, y: 330, w: 620, h: 460 },
  sectionC: { x: 380, y: 600, w: 760, h: 360 },
  aquiferC: { x: 380, y: 690, w: 820, h: 260 },
  watertableC: { x: 380, y: 620, w: 820, h: 200 },
  atmosphereC: { x: 0, y: 40, w: 900, h: 440 },
  skyC: { x: 0, y: 40, w: 900, h: 440 },
  bedrockC: { x: 400, y: 840, w: 760, h: 160 },
  paramo: { x: 1080, y: 300, w: 640, h: 200 },
  paramoC: { x: 1100, y: 300, w: 520, h: 200 },
  fog: { x: 1080, y: 360, w: 620, h: 160 },
  people: { x: 380, y: 560, w: 640, h: 330 },
  peopleC: { x: 400, y: 580, w: 560, h: 300 },
  well: { x: 470, y: 600, w: 300, h: 280 },
  pipe: { x: 420, y: 640, w: 420, h: 160 },
  ptar: { x: 380, y: 580, w: 200, h: 120 },
  saltwedge: { x: 160, y: 760, w: 420, h: 240 },
  clay: { x: 640, y: 800, w: 440, h: 100 },
  fringe: { x: 760, y: 640, w: 460, h: 120 },
  riparian: { x: 440, y: 500, w: 500, h: 220 },
};

/** Posición de la etiqueta de cada elemento del paisaje. */
export const ANCHORS: Record<string, Pt> = {
  sol: [170, 112],
  atmosfera: [330, 190],
  nube: [1050, 150],
  oceano: [150, 600],
  lago: [1030, 512],
  rio: [640, 597],
  nieve: [1452, 190],
  suelo: [760, 696],
  acuifero: [720, 840],
  vegetacion: [1010, 500],
  'zona-no-saturada': [990, 680],
  'nivel-freatico': [600, 754],
  'roca-fracturada': [980, 955],
  manantial: [1262, 646],
  ciudad: [720, 620],
  evaporacion: [150, 492],
  transpiracion: [1096, 392],
  condensacion: [580, 290],
  transporte: [400, 372],
  precipitacion: [1160, 336],
  nevada: [1604, 150],
  intercepcion: [944, 440],
  infiltracion: [925, 636],
  percolacion: [923, 688],
  recarga: [921, 716],
  escorrentia: [870, 652],
  'flujo-subterraneo': [920, 790],
  descarga: [466, 794],
  fusion: [1350, 374],
  sublimacion: [1520, 160],
  gravedad: [1240, 300],
  paramo: [1290, 372],
  niebla: [1470, 418],
  pozo: [600, 812],
  alcantarillado: [640, 740],
  ptar: [452, 620],
  'franja-capilar': [880, 716],
  acuitardo: [860, 848],
  'cuna-salina': [300, 900],
  ribera: [700, 572],
};

/** Desplazamiento de la etiqueta respecto a su ancla (en píxeles de pantalla). */
export const LABEL_OFFSETS: Record<string, [number, number]> = {
  sol: [0, 72],
  atmosfera: [0, 0],
  nube: [0, -6],
  oceano: [0, 0],
  lago: [0, 34],
  rio: [-30, -22],
  nieve: [-60, 22],
  suelo: [0, 0],
  acuifero: [0, 0],
  vegetacion: [-96, -38],
  'zona-no-saturada': [64, 0],
  'nivel-freatico': [0, -18],
  'roca-fracturada': [0, 0],
  manantial: [36, 28],
  ciudad: [0, -60],
  evaporacion: [0, -22],
  transpiracion: [40, -20],
  condensacion: [0, 22],
  transporte: [0, -24],
  precipitacion: [64, 0],
  nevada: [24, 30],
  intercepcion: [-56, -18],
  infiltracion: [-72, -6],
  percolacion: [-72, 0],
  recarga: [-64, 14],
  escorrentia: [-40, 26],
  'flujo-subterraneo': [0, 22],
  descarga: [0, 24],
  fusion: [-54, 0],
  sublimacion: [56, -8],
  gravedad: [0, 0],
  paramo: [0, -22],
  niebla: [40, -24],
  pozo: [-62, 10],
  alcantarillado: [0, 18],
  ptar: [-20, -30],
  'franja-capilar': [-40, -4],
  acuitardo: [0, 18],
  'cuna-salina': [0, 0],
  ribera: [-10, -24],
};

/* ------------------------------------------------------------------ */
/* Gota trazadora: posiciones de los nodos y trayectos de cada ruta     */
/* ------------------------------------------------------------------ */

export type TraceState = 'vapor' | 'cloud' | 'liquid' | 'ice';
export type TracePace = 'air' | 'fall' | 'snow' | 'surface' | 'soil' | 'ground' | 'cloud';

export interface TraceSegment {
  state: TraceState;
  pace: TracePace;
  points: Pt[];
}

export const TRACER_NODES: Record<string, Pt> = {
  oceano: [200, 700],
  atmosfera: [720, 330],
  nube: [1040, 212],
  dosel: [1012, 478],
  superficie: [1050, 606],
  ciudad: [690, 655],
  suelo: [1052, 634],
  planta: [1009, 565],
  acuifero: [880, 770],
  rio: [418, 756],
  lago: [1030, 514],
  nieve: [1452, 196],
};

const RIVER_TO_ANCHOR: Pt[] = [
  [1030, 514], [944, 516], [900, 528], [850, 540], [790, 552], [730, 566], [670, 585], [620, 606],
  [575, 630], [530, 656], [490, 684], [458, 712], [436, 738], [418, 756],
];

export const TRACER_PATHS: Record<string, TraceSegment[]> = {
  'oceano>atmosfera': [{ state: 'vapor', pace: 'air', points: [[200, 700], [215, 620], [240, 540], [300, 460], [420, 390], [580, 345], [720, 330]] }],
  'lago>atmosfera': [{ state: 'vapor', pace: 'air', points: [[1030, 514], [1010, 470], [960, 420], [860, 360], [720, 330]] }],
  'rio>atmosfera': [{ state: 'vapor', pace: 'air', points: [[418, 756], [430, 680], [480, 560], [580, 430], [720, 330]] }],
  'atmosfera>nube': [{ state: 'vapor', pace: 'air', points: [[720, 330], [820, 300], [920, 262], [990, 232], [1040, 212]] }],
  'nube>atmosfera': [{ state: 'vapor', pace: 'air', points: [[1040, 212], [980, 160], [880, 150], [790, 210], [720, 330]] }],
  'nube>dosel': [
    { state: 'cloud', pace: 'cloud', points: [[1040, 212], [1024, 228], [1012, 242]] },
    { state: 'liquid', pace: 'fall', points: [[1012, 242], [1012, 360], [1012, 478]] },
  ],
  'nube>superficie': [
    { state: 'cloud', pace: 'cloud', points: [[1040, 212], [1052, 228], [1060, 242]] },
    { state: 'liquid', pace: 'fall', points: [[1060, 242], [1056, 420], [1050, 606]] },
  ],
  'nube>ciudad': [
    { state: 'cloud', pace: 'cloud', points: [[1040, 212], [920, 216], [800, 236], [700, 250]] },
    { state: 'liquid', pace: 'fall', points: [[700, 250], [696, 450], [690, 655]] },
  ],
  'nube>nieve': [
    { state: 'cloud', pace: 'cloud', points: [[1040, 212], [1180, 180], [1320, 130], [1440, 100]] },
    { state: 'ice', pace: 'snow', points: [[1440, 100], [1450, 130], [1444, 160], [1452, 196]] },
  ],
  'nube>oceano': [
    { state: 'cloud', pace: 'cloud', points: [[1040, 212], [860, 210], [620, 222], [380, 240], [230, 262]] },
    { state: 'liquid', pace: 'fall', points: [[230, 262], [215, 480], [200, 700]] },
  ],
  'dosel>atmosfera': [{ state: 'vapor', pace: 'air', points: [[1012, 478], [1030, 430], [1000, 380], [880, 340], [720, 330]] }],
  'dosel>superficie': [{ state: 'liquid', pace: 'fall', points: [[1012, 478], [1022, 500], [1034, 540], [1046, 580], [1050, 606]] }],
  'superficie>suelo': [{ state: 'liquid', pace: 'soil', points: [[1050, 606], [1051, 620], [1052, 634]] }],
  'superficie>rio': [{ state: 'liquid', pace: 'surface', points: [[1050, 606], [1000, 614], [950, 624], [880, 646], [800, 671], [720, 688], [640, 698], [570, 700], [510, 698], [470, 712], [440, 736], [418, 756]] }],
  'superficie>atmosfera': [{ state: 'vapor', pace: 'air', points: [[1050, 606], [1070, 540], [1050, 470], [960, 400], [840, 350], [720, 330]] }],
  'ciudad>rio': [{ state: 'liquid', pace: 'surface', points: [[690, 655], [640, 650], [595, 650], [560, 646], [530, 662], [495, 686], [462, 712], [438, 738], [418, 756]] }],
  'ciudad>atmosfera': [{ state: 'vapor', pace: 'air', points: [[690, 655], [700, 580], [710, 470], [720, 330]] }],
  'suelo>planta': [{ state: 'liquid', pace: 'soil', points: [[1052, 634], [1036, 630], [1018, 624], [1010, 606], [1009, 585], [1009, 565]] }],
  'suelo>acuifero': [{ state: 'liquid', pace: 'soil', points: [[1052, 634], [1050, 652], [1047, 672], [1044, 690], [1040, 706], [1000, 728], [940, 752], [880, 770]] }],
  'suelo>atmosfera': [{ state: 'vapor', pace: 'air', points: [[1052, 634], [1060, 610], [1080, 540], [1040, 450], [900, 370], [720, 330]] }],
  'planta>atmosfera': [
    { state: 'liquid', pace: 'soil', points: [[1009, 565], [1009, 530], [1000, 505]] },
    { state: 'vapor', pace: 'air', points: [[1000, 505], [980, 460], [930, 400], [840, 350], [720, 330]] },
  ],
  'acuifero>rio': [
    { state: 'liquid', pace: 'ground', points: [[880, 770], [760, 782], [640, 790], [530, 790], [460, 788], [420, 786], [408, 776]] },
    { state: 'liquid', pace: 'surface', points: [[408, 776], [410, 766], [418, 756]] },
  ],
  'acuifero>lago': [
    { state: 'liquid', pace: 'ground', points: [[880, 770], [1000, 760], [1120, 730], [1200, 690], [1245, 662], [1262, 648]] },
    { state: 'liquid', pace: 'surface', points: [[1262, 648], [1240, 620], [1205, 592], [1160, 566], [1110, 544], [1060, 520], [1030, 514]] },
  ],
  'acuifero>oceano': [
    { state: 'liquid', pace: 'ground', points: [[880, 770], [720, 840], [540, 870], [400, 858], [300, 828], [262, 818]] },
    { state: 'liquid', pace: 'surface', points: [[262, 818], [240, 780], [220, 740], [200, 700]] },
  ],
  'nieve>lago': [{ state: 'liquid', pace: 'surface', points: [[1452, 196], [1440, 240], [1400, 300], [1370, 350], [1330, 400], [1290, 440], [1240, 470], [1190, 492], [1124, 512], [1080, 514], [1030, 514]] }],
  'nieve>atmosfera': [{ state: 'vapor', pace: 'air', points: [[1452, 196], [1440, 150], [1400, 120], [1300, 150], [1150, 220], [960, 280], [720, 330]] }],
  'lago>rio': [{ state: 'liquid', pace: 'surface', points: RIVER_TO_ANCHOR }],
  'rio>oceano': [{ state: 'liquid', pace: 'surface', points: [[418, 756], [406, 768], [370, 772], [320, 768], [260, 740], [200, 700]] }],
};

/** Trayectos para comparar velocidades (paso de flujo subterráneo). */
export const COMPARE_RUNOFF: Pt[] = [[1000, 617], [950, 625], [880, 647], [800, 673], [720, 691], [640, 703], [560, 713], [500, 727], [460, 747], [440, 764]];
export const COMPARE_GROUND: Pt[] = [[1000, 718], [900, 742], [780, 760], [660, 772], [560, 778], [480, 782], [430, 785]];

/** Polígono genérico: punto dentro. */
export function pointInPoly(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

/** Distancia mínima de un punto a una polilínea. */
export function distToPolyline(x: number, y: number, pts: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}

/** x de la costa para una profundidad y de la superficie. */
export function coastX(y: number): number {
  const pts = [...COASTLINE].sort((a, b) => a[1] - b[1]);
  return yAt(pts.map(([x, yy]) => [yy, x] as Pt), y);
}

/* ------------------------------------------------------------------ */
/* Versión 2: alta montaña andina, personas y geología detallada        */
/* ------------------------------------------------------------------ */

/** Cordilleras lejanas (perspectiva atmosférica). */
export const FAR_RANGE_1: Pt[] = [
  [880, 470], [960, 410], [1030, 372], [1090, 330], [1150, 300], [1210, 318], [1270, 286], [1340, 262],
  [1400, 284], [1470, 250], [1540, 276], [1600, 246], [1680, 268], [1760, 236], [1840, 262], [1920, 250],
];
export const FAR_RANGE_2: Pt[] = [
  [640, 470], [720, 440], [800, 412], [880, 392], [960, 372], [1040, 352], [1120, 346], [1200, 360],
  [1280, 330], [1360, 344], [1440, 316], [1520, 336], [1600, 306], [1700, 326], [1800, 300], [1920, 318],
];

/** Páramo: franja entre el bosque andino y las rocas y la nieve de las cumbres. */
export const PARAMO_POLY: Pt[] = [
  [1080, 474], [1120, 426], [1170, 388], [1230, 356], [1290, 336], [1350, 330], [1410, 340], [1470, 352],
  [1530, 348], [1600, 336], [1680, 324], [1760, 334], [1920, 346], [1920, 430], [1800, 418], [1700, 410],
  [1600, 424], [1520, 436], [1460, 446], [1400, 428], [1330, 408], [1260, 416], [1200, 442], [1140, 468],
];

/** Laguna de páramo. */
export const PARAMO_LAGOON = { cx: 1352, cy: 384, rx: 22, ry: 6 };

/** Bancos de niebla del bosque de niebla y el páramo. */
export const FOG_BANKS: { x: number; y: number; w: number; h: number; dur: number; delay: number }[] = [
  { x: 1120, y: 432, w: 210, h: 34, dur: 38, delay: 0 },
  { x: 1380, y: 410, w: 240, h: 36, dur: 46, delay: -12 },
  { x: 1240, y: 470, w: 180, h: 28, dur: 34, delay: -20 },
  { x: 1560, y: 402, w: 200, h: 30, dur: 42, delay: -6 },
];

/** Pozo de bombeo en la ciudad y tanque de almacenamiento. */
export const WELL = { x: 600, screenTop: 790, bottom: 862 };
export const WATER_TANK = { x: 862, y: 592 };
export const PUMP_LINES: { id: string; induced: boolean; points: Pt[] }[] = [
  { id: 'east', induced: false, points: [[980, 738], [860, 770], [740, 800], [640, 826], [608, 832]] },
  { id: 'west', induced: false, points: [[470, 806], [520, 818], [570, 830], [594, 834]] },
  { id: 'river', induced: true, points: [[414, 790], [450, 808], [510, 826], [570, 838], [594, 842]] },
];
export const PUMP_RISER: Pt[] = [[600, 836], [600, 790], [600, 740], [600, 704]];

/** Descenso del nivel freático alrededor del pozo (cono de depresión). */
export function drawdown(x: number, level: number): number {
  const l = Math.max(0, Math.min(2, level));
  const D = l <= 1 ? 20 * l : 20 + 22 * (l - 1);
  return D * Math.exp(-Math.abs(x - WELL.x) / 95);
}

/** Alcantarillado pluvial en el corte (tubo bajo la calle hasta el río). */
export const STORM_PIPE: Pt[] = [[812, 708], [740, 726], [660, 738], [580, 750], [520, 760], [470, 770], [446, 774]];

/** Planta de tratamiento de aguas residuales junto al río. */
export const PTAR = { x: 452, y: 628 };

/** Lente de arcilla (acuitardo) y lente de grava en la zona saturada. */
export const CLAY_LENS: Pt[] = [[690, 846], [760, 836], [860, 832], [960, 836], [1030, 846], [960, 858], [860, 862], [760, 860]];
export const GRAVEL_LENS: Pt[] = [[1080, 790], [1160, 770], [1260, 758], [1330, 762], [1260, 782], [1160, 796]];

/** Interfaz agua dulce y agua salada bajo la costa (cuña salina). */
export function saltWedge(pumping: number): Pt[] {
  const push = [0, 18, 46][Math.max(0, Math.min(2, Math.round(pumping)))];
  return [[236, 830], [280 + push * 0.4, 868], [330 + push, 910], [390 + push, 952], [460 + push, 1000]];
}

/** Vegetación de ribera a lo largo del río. */
export const RIPARIAN: Pt[] = [
  [900, 512], [872, 548], [840, 526], [812, 560], [776, 540], [742, 576], [712, 556], [688, 594],
  [652, 576], [628, 616], [596, 598], [560, 644], [540, 628], [506, 668], [490, 652], [470, 700],
];

/** Juncos del humedal en la desembocadura. */
export const REEDS: Pt[] = [[372, 742], [380, 722], [392, 704], [450, 726], [462, 744], [444, 708], [386, 690]];

/** Sombras de las nubes sobre el terreno. */
export const CLOUD_SHADOWS = [
  { cx: 1080, cy: 588, rx: 150, ry: 22, cloud: 'B' },
  { cx: 600, cy: 612, rx: 110, ry: 15, cloud: 'A' },
] as const;

/** Lugares donde la luz del sol brilla sobre el mar. */
export const SUN_GLINT = { x0: 110, x1: 250, y0: 478, y1: 760 };

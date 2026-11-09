// Determina qué elemento del paisaje hay bajo un punto (exploración libre con ratón o tacto).

import {
  CLAY_LENS,
  CLOUDS,
  FOG_BANKS,
  PARAMO_POLY,
  PTAR,
  STORM_PIPE,
  WELL,
  saltWedge,
  FEATURED_TREE,
  FOREST_POLY,
  FLANK_POLY,
  LAKE,
  PAVEMENT_FULL,
  RIVER,
  SEAFLOOR,
  SEA_LEVEL,
  SOIL_DEPTH,
  SPRING,
  SUN,
  coastX,
  distToPolyline,
  pointInPoly,
  yBedrock,
  yFront,
  yRidge,
  yWaterTable,
} from './geometry';
import { yAt } from '../lib/paths';

export function hitTest(x: number, y: number, snowline: number): string | null {
  if (Math.hypot(x - SUN.x, y - SUN.y) < SUN.r + 24) return 'sol';
  for (const c of CLOUDS) {
    if (c.circles.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) < r + 4)) return 'nube';
  }
  if (Math.hypot(x - SPRING[0], y - SPRING[1]) < 16) return 'manantial';
  // pozo de bombeo (cabezal y tubo) y planta de tratamiento
  if (Math.abs(x - WELL.x) < 16 && y > WELL.screenTop - 40 && y < WELL.bottom + 6) return 'pozo';
  if (Math.abs(x - PTAR.x) < 44 && Math.abs(y - PTAR.y) < 26) return 'ptar';
  if (FOG_BANKS.some((f) => ((x - f.x - f.w / 2) / (f.w / 2)) ** 2 + ((y - f.y - f.h / 2) / (f.h / 2 + 6)) ** 2 < 1)) return 'niebla';

  // Corte del terreno (cara frontal)
  if (x >= 300) {
    const front = yFront(x);
    if (y > front + 1) {
      if (x > 366 && x < 446 && y < 790) return 'rio';
      if (distToPolyline(x, y, STORM_PIPE) < 9) return 'alcantarillado';
      if (y < front + SOIL_DEPTH) return 'suelo';
      const wt = yWaterTable(x);
      if (Math.abs(y - wt) < 7) return 'nivel-freatico';
      if (y < wt && y > wt - 18) return 'franja-capilar';
      if (pointInPoly(x, y, CLAY_LENS)) return 'acuitardo';
      const wedge = saltWedge(0);
      if (x < wedge[wedge.length - 1][0] && y > yAt(wedge, x)) return 'cuna-salina';
      if (y < wt) return 'zona-no-saturada';
      if (y > yBedrock(x)) return 'roca-fracturada';
      return 'acuifero';
    }
  } else if (y >= SEA_LEVEL) {
    const floor = yAt(SEAFLOOR, x);
    if (y < floor) return 'oceano';
    return 'acuifero';
  }

  // Superficie
  if (FEATURED_TREE.canopy.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) < r)) return 'vegetacion';
  if (((x - LAKE.cx) / (LAKE.rx + 6)) ** 2 + ((y - LAKE.cy) / (LAKE.ry + 6)) ** 2 < 1) return 'lago';
  if (distToPolyline(x, y, RIVER) < 16) return 'rio';
  if (y > 470 && y < SEA_LEVEL && x < coastX(y)) return 'oceano';
  if (pointInPoly(x, y, PAVEMENT_FULL)) return 'ciudad';
  if (x > 1100 && y > yRidge(x) && y < snowline + 20) return 'nieve';
  if (pointInPoly(x, y, PARAMO_POLY)) return 'paramo';
  if (pointInPoly(x, y, FOREST_POLY) || pointInPoly(x, y, FLANK_POLY)) return 'vegetacion';
  if (y < 470) return 'atmosfera';
  return null;
}

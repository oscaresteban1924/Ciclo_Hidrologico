// Registro de las ilustraciones de cada vista de detalle.

import type { ComponentType } from 'react';
import type { DetailId } from '../../state/store';
import { SoilPoresArt, SoilPoresResult } from './SoilPores';
import { ZonesArt } from './Zones';
import { PlantArt, PlantResult } from './Plant';
import { CloudArt } from './Cloud';
import { GroundwaterArt, GroundwaterResult } from './Groundwater';

export interface DetailArtProps {
  t: number;
  clock: number;
  variant: string;
}

export interface DetailModule {
  Art: ComponentType<DetailArtProps>;
  Result?: ComponentType<{ variant: string }>;
}

export const DETAIL_ART: Partial<Record<DetailId, DetailModule>> = {
  poros: { Art: SoilPoresArt, Result: SoilPoresResult },
  zonas: { Art: ZonesArt },
  planta: { Art: PlantArt, Result: PlantResult },
  nube: { Art: CloudArt },
  subterraneo: { Art: GroundwaterArt, Result: GroundwaterResult },
};

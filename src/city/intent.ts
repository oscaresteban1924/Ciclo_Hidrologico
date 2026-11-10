// Encargo para el laboratorio de lluvia desde otro módulo: al abrirlo, entra directo a una misión o un sector.
// Se toma una sola vez (lo consume CityLab al crear su controlador).

let pending: { missionId?: string; scenarioId?: string } | null = null;

export function setCityIntent(i: { missionId?: string; scenarioId?: string }): void {
  pending = i;
}

export function takeCityIntent(): { missionId?: string; scenarioId?: string } | null {
  const p = pending;
  pending = null;
  return p;
}

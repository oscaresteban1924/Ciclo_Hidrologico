// Nombres legibles de las edificaciones para los rótulos de daño (sin Three.js: lo usa también la interfaz).

const ROWS: Record<string, string> = {
  cn: 'Casa de la calle, lado norte',
  cs: 'Casa de la calle, lado sur',
  kn: 'Casa de la carrera norte',
  ks: 'Casa de la carrera sur',
  ce: 'Casa de la calle de abajo, norte',
  se: 'Casa de la calle de abajo, sur',
  so: 'Casa de la manzana suroeste',
  no: 'Casa de la manzana noroeste',
  ne: 'Casa de la manzana noreste',
};

export function buildingName(id: string): string {
  if (id.startsWith('orilla-')) return `Casa de la orilla ${id.slice(7)}`;
  if (id === 'casa-retiro') return 'Casa del retiro';
  if (id === 'colegio') return 'Colegio';
  if (id === 'bloque-medio') return 'Bloque de apartamentos';
  const m = /^([a-z]+)-(\d+)$/.exec(id);
  if (m && ROWS[m[1]]) return `${ROWS[m[1]]} (${m[2]})`;
  return 'Edificación';
}

// Créditos y dedicatoria: al pie de la portada, de Ayuda y de Ajustes.

import { CREDITS } from '../content/ui';

export function Credits() {
  return (
    <div className="credits">
      <p>{CREDITS.author}</p>
      <p className="dedication">
        Dedicado a {CREDITS.dedicatedTo}: <q>{CREDITS.dedication}</q>
      </p>
    </div>
  );
}

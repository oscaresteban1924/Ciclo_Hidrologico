// Vista de desarrollo (no entra en la compilación): todas las lupas de calidad en una cuadrícula, para revisarlas
// con capturas. Parámetros: ?set=ptar|plant y ?s=<escenario>.
import { createRoot } from 'react-dom/client';
import '../../src/styles/fonts.css';
import '../../src/styles/app.css';
import '../../src/quality/quality.css';
import '../../src/quality/quality3d.css';
import { StoreProvider } from '../../src/state/store';
import { ProcessLens } from '../../src/quality/ProcessLens';
import { PtarLens } from '../../src/quality/PtarLens';
import { PROCESSES } from '../../src/quality/processes';
import { PTAR_UNITS } from '../../src/quality/ptarUnits';
import { ptarModel, DEFAULT_PTAR, sanitizePtar } from '../../src/quality/ptar';
import { treatPlant, sanitizePlant } from '../../src/quality/model';

const q = new URLSearchParams(location.search);
const set = q.get('set') ?? 'ptar';
const sc = q.get('s') ?? '';
const PT: Record<string, object> = {
  '': {},
  aguacero: { weather: 'aguacero', recirc: false, air: 0.5, uv: false, primary: false },
  lluvia: { weather: 'lluvia', air: 1 },
  grande: { pop: 140000, lines: 1 },
};
const PL: Record<string, object> = {
  '': { raw: 'verano', dose: 25, chlorine: 1.5 },
  creciente: { raw: 'creciente', dose: 0, chlorine: 0 },
  lluvia: { raw: 'lluvia', dose: 40, chlorine: 3 },
};

function App() {
  if (set === 'ptar') {
    const inp = sanitizePtar({ ...DEFAULT_PTAR, ...(PT[sc] ?? {}) });
    const r = ptarModel(inp);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 560px)', gap: 8, padding: 8 }}>
        {PTAR_UNITS.map((u) => (
          <figure key={u.id} className="q3-proc-lens" style={{ margin: 0 }}>
            <PtarLens id={u.id} r={r} inp={inp} />
          </figure>
        ))}
      </div>
    );
  }
  const inp = sanitizePlant(PL[sc] ?? {});
  const r = treatPlant(inp);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 560px)', gap: 8, padding: 8 }}>
      {PROCESSES.map((p) => (
        <figure key={p.id} className="q3-proc-lens" style={{ margin: 0 }}>
          <ProcessLens id={p.id} r={r} inp={inp} />
        </figure>
      ))}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);

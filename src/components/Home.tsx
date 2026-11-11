// Portada del Laboratorio del agua: qué es, las cuatro salas con lo que se hace en cada una, las herramientas que
// sirven en todas y los créditos. Las ilustraciones son dibujos propios, sin imágenes descargadas.

import type { ReactNode } from 'react';
import { UI } from '../content/ui';
import { useStore, type Mode, type Room } from '../state/store';
import { Credits } from './Credits';

interface RoomCard {
  room: Room;
  title: string;
  lead: string;
  items: string[];
  /** Entradas: el ciclo tiene tres modos; las demás salas, una. */
  enter: { mode: Mode; label: string }[];
  art: ReactNode;
  tone: string;
}

const ART = {
  ciclo: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#e4f0f7" />
      <circle cx="132" cy="18" r="9" fill="#f2c14e" />
      <path d="M22 30a10 10 0 0 1 19-4 8 8 0 0 1 13 6H22z" fill="#ffffff" />
      <path d="M30 36l-3 8M38 36l-3 8M46 36l-3 8" stroke="#1f78b4" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M0 70l26-26 18 16 22-30 30 40H0z" fill="#6e9e5d" />
      <path d="M96 70h64v26H96z" fill="#2f7fb0" />
      <path d="M0 70h96v26H0z" fill="#a98a63" />
      <path d="M8 84h80" stroke="#1f78b4" strokeWidth="2" strokeDasharray="4 4" />
      <path d="M112 62c4-14 10-24 22-30" fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="3 4" />
      <path d="M131 30l4 2-4 3" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  city: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#dbe7ee" />
      <path d="M0 60l30-34 26 22 24-30 30 28 22-18 28 32v38H0z" fill="#7aa36c" />
      <rect x="44" y="56" width="14" height="22" fill="#d9c7a6" />
      <rect x="60" y="48" width="12" height="30" fill="#c9a98a" />
      <rect x="74" y="58" width="16" height="20" fill="#e2d4bb" />
      <rect x="92" y="52" width="10" height="26" fill="#b98f73" />
      <path d="M0 78h160v18H0z" fill="#8c9aa3" />
      <path d="M0 86h160" stroke="#2f7fb0" strokeWidth="4" />
      {[18, 34, 50, 66, 82, 98, 114, 130, 146].map((x, i) => (
        <path key={x} d={`M${x} ${8 + (i % 3) * 6}l-4 10`} stroke="#1f78b4" strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  ),
  quality: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#e8f3e3" />
      <path d="M0 58c26-8 52 8 80 0s54-8 80 0v38H0z" fill="#3e8fbf" />
      <ellipse cx="34" cy="84" rx="14" ry="6" fill="#8a7a64" />
      <ellipse cx="122" cy="86" rx="18" ry="6" fill="#8a7a64" />
      <path d="M80 12c-10 16-18 26-18 36a18 18 0 0 0 36 0c0-10-8-20-18-36z" fill="#5fb0e6" />
      <circle cx="104" cy="44" r="13" fill="none" stroke="#17324d" strokeWidth="3.5" />
      <path d="M113 53l12 12" stroke="#17324d" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M72 46a8 8 0 0 0 8 8" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  ),
  canals: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#eef1f3" />
      <path d="M0 40h22l18 30h80l18-30h22v56H0z" fill="#b9bec3" />
      <path d="M29 52h102l-11 18H40z" fill="#2f7fb0" />
      <path d="M36 60h22M70 60h22M104 60h16" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <path d="M56 57l4 3-4 3M90 57l4 3-4 3" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <path d="M0 26h160" stroke="#17324d" strokeWidth="2" strokeDasharray="6 4" />
      <path d="M12 18h30M118 18h30" stroke="#c0392b" strokeWidth="2" strokeDasharray="4 3" />
    </svg>
  ),
};

const CARDS: RoomCard[] = [
  {
    room: 'ciclo',
    title: UI.rooms.ciclo,
    lead: 'Cómo viaja el agua entre el cielo, la tierra, el subsuelo y el mar, y por qué tarda tan distinto en cada camino.',
    items: ['Recorrido de quince pasos', 'Paisaje para explorar libremente', 'Experimentos con dos escenarios', 'Gota trazadora'],
    enter: [
      { mode: 'guided', label: 'Recorrido guiado' },
      { mode: 'explore', label: 'Exploración libre' },
      { mode: 'lab', label: 'Experimentos' },
    ],
    art: ART.ciclo,
    tone: 'water',
  },
  {
    room: 'city',
    title: UI.rooms.city,
    lead: 'Una maqueta 3D de un sector de la ciudad donde la lluvia se calcula: por dónde corre, dónde se acumula y qué cambia con un jardín de lluvia.',
    items: ['Sectores del valle de Aburrá', 'Lluvias y tormentas', 'Alcantarillado y quebrada', 'Comparar dos versiones'],
    enter: [{ mode: 'city', label: 'Entrar' }],
    art: ART.city,
    tone: 'moss',
  },
  {
    room: 'quality',
    title: UI.rooms.quality,
    lead: 'Cómo saber si el agua está sana: una quebrada con sonda y bichos, la planta que la potabiliza y la que limpia el agua de las casas.',
    items: ['Quebrada y bioindicadores', 'Planta de potabilización', 'Lo que arrastra la calle', 'Aguas residuales'],
    enter: [{ mode: 'quality', label: 'Entrar' }],
    art: ART.quality,
    tone: 'moss',
  },
  {
    room: 'canals',
    title: UI.rooms.canals,
    lead: 'Cómo se mueve el agua en canales, caídas, puentes y alcantarillas, con cálculos verificados y herramientas para prediseñar.',
    items: ['Siete partes en 3D', 'Instrumentos en vivo', 'Calculadoras y prediseñadores', 'Memoria de cálculo'],
    enter: [{ mode: 'canals', label: 'Entrar' }],
    art: ART.canals,
    tone: 'ink',
  },
];

export function Home() {
  const { dispatch } = useStore();
  return (
    <main className="home" id="panel" tabIndex={-1}>
      <section className="home-hero">
        <p className="home-kicker">{UI.appSubtitle}</p>
        <h2>{UI.appTitle}</h2>
        <p className="home-lead">
          Cuatro salas para entender el agua: cómo viaja por el planeta, qué hace la lluvia en una ciudad como Medellín, cómo saber si está sana y cómo se mueve en canales, puentes y alcantarillas.
        </p>
      </section>
      <ul className="home-rooms" aria-label="Salas">
        {CARDS.map((c) => (
          <li key={c.room} className={`room-card tone-${c.tone}`}>
            <div className="room-art">{c.art}</div>
            <div className="room-body">
              <h3>{c.title}</h3>
              <p>{c.lead}</p>
              <ul className="room-items">
                {c.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
              <div className="room-enter">
                {c.enter.map((e, k) => (
                  <button key={e.mode} type="button" className={k === 0 ? 'btn' : 'btn-ghost'} onClick={() => dispatch({ type: 'mode', mode: e.mode })} aria-label={c.enter.length > 1 ? `${c.title}: ${e.label}` : `Entrar a ${c.title}`}>
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <section className="home-tools" aria-label="Herramientas de todas las salas">
        <p>
          En todas las salas: <button type="button" className="link-btn" onClick={() => dispatch({ type: 'tool', tool: 'challenges' })}>Retos</button>, <button type="button" className="link-btn" onClick={() => dispatch({ type: 'tool', tool: 'logbook' })}>Bitácora</button> y{' '}
          <button type="button" className="link-btn" onClick={() => dispatch({ type: 'tool', tool: 'glossary' })}>Glosario</button>. Lo que guardas queda solo en este dispositivo.
        </p>
      </section>
      <footer className="home-foot">
        <Credits />
      </footer>
    </main>
  );
}

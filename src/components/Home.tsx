// Portada del Laboratorio del agua: qué es, las salas abiertas agrupadas (la naturaleza, la ciudad y las obras) con lo
// que se hace en cada una, las herramientas que sirven en todas y los créditos. Las ilustraciones son dibujos propios,
// sin imágenes descargadas.

import type { ReactNode } from 'react';
import { UI } from '../content/ui';
import { ROOM_GROUPS, roomOpen, useStore, type Mode, type Room } from '../state/store';
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
  basins: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#e6efe2" />
      <path d="M0 22c24-14 52-16 80-8s56 4 80-8v90H0z" fill="#3f7a3a" />
      <path d="M0 46c30-10 56-6 80 2s52 6 80-6v54H0z" fill="#93c06c" />
      <path d="M0 70c28-6 60-2 92 4s48 2 68-4v26H0z" fill="#cdb08f" />
      <path d="M14 30c18 10 30 22 46 28s34 10 52 12 34 2 48 0" fill="none" stroke="#2f84b5" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M40 16c6 14 10 26 16 40M98 22c-2 14-4 30-2 46" fill="none" stroke="#2f84b5" strokeWidth="2" strokeLinecap="round" />
      <rect x="118" y="8" width="38" height="26" rx="3" fill="#ffffff" />
      <path d="M122 30c4 0 6-17 10-17s7 12 20 15" fill="none" stroke="#1f78b4" strokeWidth="2" />
      <path d="M122 30h32" stroke="#17324d" strokeWidth="1" />
    </svg>
  ),
  ground: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#e8eff4" />
      <path d="M0 30c30-6 50 2 80 4s56-4 80 0v62H0z" fill="#8fbf6a" />
      <path d="M0 36c30-6 50 2 80 4s56-4 80 0v56H0z" fill="#d6bf86" />
      <path d="M0 56c40 4 90 10 160 14v26H0z" fill="#9fc6e3" opacity="0.85" />
      <path d="M0 56c40 4 90 10 160 14" fill="none" stroke="#1f78b4" strokeWidth="1.6" />
      <rect x="0" y="88" width="160" height="8" fill="#7f5f40" />
      <rect x="96" y="20" width="4" height="64" fill="#e8e2d2" stroke="#9fb3c2" strokeWidth="0.8" />
      <path d="M80 62c8 2 14 12 18 18 4-6 10-14 22-15" fill="none" stroke="#1f5f8a" strokeWidth="1.4" strokeDasharray="3 2" />
      {[20, 44, 68].map((x) => (
        <circle key={x} cx={x} cy={70 + x * 0.06} r="2.2" fill="#ffffff" />
      ))}
    </svg>
  ),
  supply: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#e8eff4" />
      <path d="M0 40c20-6 34-14 48-14v70H0z" fill="#8fbf6a" />
      <path d="M48 96V26c40 10 70 30 112 36v34z" fill="#b9d39a" />
      <rect x="14" y="12" width="20" height="22" rx="2" fill="#d4d0c6" />
      <rect x="16" y="18" width="16" height="14" fill="#2f84b5" />
      <path d="M24 34v10c0 6 6 10 14 12l100 18" fill="none" stroke="#e8e2d2" strokeWidth="5" strokeLinecap="round" />
      <path d="M24 34v10c0 6 6 10 14 12l100 18" fill="none" stroke="#7d6a52" strokeWidth="1.2" />
      {[60, 92, 124].map((x, i) => (
        <g key={x}>
          <rect x={x - 2} y={18 + i * 8} width="4" height={44 - i * 4} fill="#ffffff" stroke="#9fb3c2" strokeWidth="0.8" />
          <rect x={x - 1.4} y={26 + i * 10} width="2.8" height={36 - i * 6} fill="#2f84b5" />
        </g>
      ))}
      <path d="M20 22L140 40" stroke="#1f78b4" strokeWidth="1.6" strokeDasharray="4 3" />
    </svg>
  ),
  dams: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#e8eff4" />
      <path d="M0 24c16-8 30-10 44-6l20 78H0z" fill="#8fbf6a" />
      <path d="M0 40h66v56H0z" fill="#9fc6e3" />
      <path d="M0 40h66" stroke="#1f78b4" strokeWidth="1.6" />
      <path d="M62 30h10l34 66H62z" fill="#cfcac0" stroke="#7d7568" strokeWidth="1" />
      <path d="M72 34c8 2 14 18 22 40s10 22 22 22" fill="none" stroke="#2f84b5" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M106 88h54v8h-54z" fill="#9fc6e3" />
      <path d="M110 84c4-6 8-6 10 0s6 6 10 0" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <path d="M140 18c4 0 6 12 10 12M126 30c4 0 6-12 14-12" fill="none" stroke="#1f5f8a" strokeWidth="1.4" />
    </svg>
  ),
  slopes: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#e8eff4" />
      <path d="M0 30 L96 96 H0z" fill="#8a8378" />
      <path d="M0 18 L112 96 H96 L0 30z" fill="#a07a4f" />
      <path d="M0 18 L112 96" stroke="#5d9a43" strokeWidth="4" />
      <path d="M0 26 L104 96" fill="none" stroke="#4fa3d8" strokeWidth="2.4" strokeDasharray="5 4" />
      <path d="M112 96 h48 v-8 h-48z" fill="#8fbf6a" />
      <rect x="120" y="76" width="12" height="12" fill="#c06c48" />
      <rect x="138" y="72" width="14" height="16" fill="#efe0c0" />
      <path d="M118 76 l8 -6 8 6M136 72 l9 -7 9 7" fill="#7d3b2b" />
      <path d="M22 8v8M30 4v8M38 9v8M46 5v8" stroke="#4fa3d8" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="24" cy="24" r="5" fill="#4d8a3a" />
      <circle cx="40" cy="35" r="5" fill="#5a9a43" />
    </svg>
  ),
  pumps: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#e8eff4" />
      <path d="M0 96 L0 80 L70 80 L120 30 L160 30 L160 96z" fill="#8fbf6a" />
      <rect x="6" y="70" width="26" height="18" fill="#cfd8df" stroke="#7a8a97" strokeWidth="0.8" />
      <rect x="7" y="76" width="24" height="11" fill="#4f9bd0" />
      <circle cx="46" cy="72" r="7" fill="#2d6ea6" stroke="#17324d" strokeWidth="1" />
      <circle cx="46" cy="72" r="2.4" fill="#cfe6f5" />
      <rect x="53" y="68" width="12" height="8" rx="1.5" fill="#35618a" />
      <path d="M32 72h7M46 65v-5h22l50-48h20" fill="none" stroke="#6c7a86" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M58 60h8M86 36l5-5M104 20l4-4" stroke="#bfe9ff" strokeWidth="2" strokeLinecap="round" />
      <rect x="128" y="14" width="24" height="16" fill="#d9d6ce" stroke="#7a8a97" strokeWidth="0.8" />
      <rect x="129" y="20" width="22" height="9" fill="#4f9bd0" />
      <path d="M146 44l-6 10h6l-6 10" fill="none" stroke="#e0a526" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  measure: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#e8eff4" />
      <path d="M0 62 L40 58 L52 82 Q76 92 100 82 L112 58 L160 62 V96 H0z" fill="#8f8573" />
      <path d="M44 64 Q76 74 108 64 L104 76 Q76 88 48 76z" fill="#4f9bd0" />
      <path d="M28 20 L132 20" stroke="#3b4148" strokeWidth="1.2" />
      <path d="M28 20 L22 62 M28 20 L34 62 M132 20 L126 62 M132 20 L138 62" stroke="#8b949b" strokeWidth="2" />
      <path d="M86 20 V70" stroke="#2b2f33" strokeWidth="0.9" />
      <rect x="80" y="17" width="12" height="6" rx="1" fill="#e0a526" />
      <ellipse cx="86" cy="71" rx="5" ry="2.4" fill="#9aa3ab" />
      <rect x="40" y="40" width="4" height="26" fill="#ffffff" stroke="#9fb3c2" strokeWidth="0.6" />
      <path d="M40 44h3M40 50h3M40 56h3M40 62h3" stroke="#c0392b" strokeWidth="1.2" />
      <path d="M140 6v8M146 4v8M152 6v8" stroke="#4fa3d8" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="140" y="20" width="10" height="16" rx="2" fill="#d9dde0" stroke="#7a8a97" strokeWidth="0.8" />
    </svg>
  ),
  house: (
    <svg viewBox="0 0 160 96" aria-hidden="true">
      <rect width="160" height="96" fill="#e8eff4" />
      <path d="M0 80h160v16H0z" fill="#8fbf6a" />
      <path d="M22 44 L62 18 L102 44z" fill="#a8553a" />
      <rect x="28" y="44" width="68" height="36" fill="#f1e8d6" stroke="#c9bfa9" strokeWidth="0.8" />
      <rect x="38" y="52" width="14" height="12" fill="#bcd6e6" />
      <rect x="70" y="58" width="12" height="22" fill="#7b4a2e" />
      <path d="M22 45h82" stroke="#d9dde0" strokeWidth="2.4" />
      <path d="M103 45v12h8" fill="none" stroke="#d9dde0" strokeWidth="2.2" />
      <rect x="108" y="54" width="22" height="26" rx="3" fill="#2f6fa8" fillOpacity="0.45" stroke="#25588a" strokeWidth="1" />
      <rect x="109" y="66" width="20" height="13" fill="#3b83ad" />
      <rect x="24" y="84" width="10" height="6" fill="#b08d3b" />
      <circle cx="29" cy="87" r="2" fill="#fbfaf6" />
      <path d="M116 6v8M124 3v8M132 7v8" stroke="#4fa3d8" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M44 66c0 4 6 4 6 0" fill="none" stroke="#4fa3d8" strokeWidth="1.4" />
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
    room: 'basins',
    title: UI.rooms.basins,
    lead: 'Cómo una cuenca convierte un aguacero en el caudal de una quebrada, qué cambia al urbanizarla y qué tan seguido llega una creciente.',
    items: ['Tiempo de concentración', 'Hidrograma en vivo', 'Tanque de retención', 'Crecientes, período de retorno y riesgo'],
    enter: [{ mode: 'basins', label: 'Entrar' }],
    art: ART.basins,
    tone: 'moss',
  },
  {
    room: 'ground',
    title: UI.rooms.ground,
    lead: 'Cómo se mueve el agua bajo tierra, qué pasa alrededor de un pozo que bombea y cómo una fuga puede llegar años después al agua que tomamos.',
    items: ['Ley de Darcy y permeámetro', 'Cono de abatimiento y prueba de bombeo', 'Zona de captura de un pozo', 'Una mancha que viaja'],
    enter: [{ mode: 'ground', label: 'Entrar' }],
    art: ART.ground,
    tone: 'moss',
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
    room: 'supply',
    title: UI.rooms.supply,
    lead: 'Cómo llega el agua a presión desde el tanque hasta las casas: la energía que se gasta en el tubo, la red de un barrio a toda hora y el golpe de ariete.',
    items: ['Piezómetros y líneas de energía', 'Red con Hardy Cross y el método del gradiente', 'Presiones del RAS a lo largo del día', 'Golpe de ariete en cámara lenta'],
    enter: [{ mode: 'supply', label: 'Entrar' }],
    art: ART.supply,
    tone: 'water',
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
  {
    room: 'dams',
    title: UI.rooms.dams,
    lead: 'Cómo un embalse amortigua una creciente, cómo un vertedero y su pozo frenan el agua que cae y por qué una presa de gravedad no se vuelca ni desliza.',
    items: ['Tránsito de una creciente', 'Vertedero de cresta y resalto en el pozo', 'Fuerzas, drenes y tercio medio', 'Calculadoras y memoria de cálculo'],
    enter: [{ mode: 'dams', label: 'Entrar' }],
    art: ART.dams,
    tone: 'water',
  },
  {
    room: 'pumps',
    title: UI.rooms.pumps,
    lead: 'Cuánta agua sube una bomba por una tubería y cuánta energía gasta, por qué el agua puede hervir dentro de la bomba y cuánta luz da un río con una pequeña central.',
    items: ['Punto de operación y leyes de afinidad', 'NPSH y cavitación en una bomba de vidrio', 'Turbinas, curva de duración y energía del año', 'Calculadoras y memoria de cálculo'],
    enter: [{ mode: 'pumps', label: 'Entrar' }],
    art: ART.pumps,
    tone: 'ink',
  },
  {
    room: 'measure',
    title: UI.rooms.measure,
    lead: 'Cómo se mide el agua: cuánto llovió según un pluviómetro y un radar, cuánta agua lleva un río aforado con molinete, y cuánta pasa por una tubería con un Venturi o una placa de orificio.',
    items: ['Pluviómetro de balancín y radar Z-R', 'Aforo con molinete y curva de gasto', 'Venturi y placa con sus piezómetros', 'Calculadoras y memoria de cálculo'],
    enter: [{ mode: 'measure', label: 'Entrar' }],
    art: ART.measure,
    tone: 'water',
  },
  {
    room: 'house',
    title: UI.rooms.house,
    lead: 'Cuánta agua usa una casa y dónde se va, cómo se lee el medidor y se entiende la factura, y cuánto ahorra un tanque de agua lluvia para los sanitarios.',
    items: ['Aparatos, hábitos y fugas, hora por hora', 'Medidor, rangos de la CRA y estratos', 'Tanque de agua lluvia con un año de lluvia', 'Calculadoras y memoria de cálculo'],
    enter: [{ mode: 'house', label: 'Entrar' }],
    art: ART.house,
    tone: 'moss',
  },
  {
    room: 'slopes',
    title: UI.rooms.slopes,
    lead: 'Qué hace la lluvia con una ladera: cuánta entra al suelo, por qué una lluvia larga puede tumbar una ladera y cuánta tierra se lleva el agua de un cultivo.',
    items: ['Infiltración y encharcamiento', 'Factor de seguridad con agua y raíces', 'Pérdida de suelo y barreras vivas', 'Calculadoras y memoria de cálculo'],
    enter: [{ mode: 'slopes', label: 'Entrar' }],
    art: ART.slopes,
    tone: 'moss',
  },
];

/** Grupos de la portada, en el orden en que viaja el agua. */
const GROUPS = ROOM_GROUPS;
const NUM: Record<number, string> = { 4: 'Cuatro', 5: 'Cinco', 6: 'Seis', 7: 'Siete', 8: 'Ocho', 9: 'Nueve', 10: 'Diez', 11: 'Once', 12: 'Doce' };

function RoomItem({ c }: { c: RoomCard }) {
  const { dispatch } = useStore();
  return (
    <li className={`room-card tone-${c.tone}`}>
      <div className="room-art">{c.art}</div>
      <div className="room-body">
        <h4>{c.title}</h4>
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
  );
}

export function Home() {
  const { dispatch } = useStore();
  const open = CARDS.filter((c) => roomOpen(c.room));
  const groups = GROUPS.map((g) => ({ ...g, cards: g.rooms.map((r) => open.find((c) => c.room === r)).filter((c): c is RoomCard => !!c) })).filter((g) => g.cards.length);
  return (
    <main className="home" id="panel" tabIndex={-1}>
      <section className="home-hero">
        <p className="home-kicker">{UI.appSubtitle}</p>
        <h2>{UI.appTitle}</h2>
        <p className="home-lead">
          {NUM[open.length] ?? open.length} salas para entender el agua: cómo viaja por el planeta, por una cuenca, bajo tierra y por las laderas; qué hace en una ciudad como Medellín y en cada casa; y cómo la llevan, la guardan, la bombean y la miden las obras hidráulicas.
        </p>
      </section>
      {groups.map((g) => (
        <section key={g.id} className="home-group" aria-labelledby={`home-g-${g.id}`}>
          <h3 id={`home-g-${g.id}`} className="home-group-title">
            {g.title}
          </h3>
          <ul className="home-rooms">
            {g.cards.map((c) => (
              <RoomItem key={c.room} c={c} />
            ))}
          </ul>
        </section>
      ))}
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

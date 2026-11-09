// Definiciones SVG compartidas: degradados, texturas del subsuelo, símbolos de partículas y puntas de flecha.

import { memo } from 'react';

export const Defs = memo(function Defs() {
  return (
    <defs>
      {/* Cielo y atmósfera */}
      <linearGradient id="g-sky" x1="0" y1="-520" x2="0" y2="480" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#3f7fb3" />
        <stop offset="0.45" stopColor="#7fb6db" />
        <stop offset="0.8" stopColor="#c4e1ee" />
        <stop offset="1" stopColor="#e4f1f1" />
      </linearGradient>
      <linearGradient id="g-sky-warm" x1="0" y1="-520" x2="0" y2="480" gradientUnits="userSpaceOnUse">
        <stop offset="0.55" stopColor="#ffe7c2" stopOpacity="0" />
        <stop offset="1" stopColor="#ffe7c2" stopOpacity="0.38" />
      </linearGradient>
      <linearGradient id="g-beam" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff8dc" stopOpacity="0.9" />
        <stop offset="1" stopColor="#fff8dc" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="g-far1" x1="0" y1="240" x2="0" y2="480" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#97afc0" />
        <stop offset="1" stopColor="#b9cdd6" />
      </linearGradient>
      <linearGradient id="g-far2" x1="0" y1="300" x2="0" y2="480" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#b7cad6" />
        <stop offset="1" stopColor="#d2e1e5" />
      </linearGradient>
      <linearGradient id="g-haze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f1f7f4" stopOpacity="0" />
        <stop offset="0.6" stopColor="#f1f7f4" stopOpacity="0.75" />
        <stop offset="1" stopColor="#f1f7f4" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="g-glint" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff4cf" stopOpacity="0.75" />
        <stop offset="0.5" stopColor="#fff4cf" stopOpacity="0.28" />
        <stop offset="1" stopColor="#fff4cf" stopOpacity="0.05" />
      </linearGradient>
      <linearGradient id="g-sea-sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#dcedf4" stopOpacity="0.7" />
        <stop offset="1" stopColor="#dcedf4" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="g-paramo" x1="0" y1="320" x2="0" y2="470" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#a39a62" />
        <stop offset="0.55" stopColor="#8f9a5a" />
        <stop offset="1" stopColor="#6f8b52" />
      </linearGradient>
      <linearGradient id="g-andino" x1="0" y1="400" x2="0" y2="600" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#4f7a4d" />
        <stop offset="1" stopColor="#5f8d55" />
      </linearGradient>
      <radialGradient id="g-fog" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
        <stop offset="0.6" stopColor="#f4f8fa" stopOpacity="0.45" />
        <stop offset="1" stopColor="#f4f8fa" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="g-plume" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#9a7b4f" stopOpacity="0.75" />
        <stop offset="0.6" stopColor="#9a7b4f" stopOpacity="0.3" />
        <stop offset="1" stopColor="#9a7b4f" stopOpacity="0" />
      </radialGradient>
      <pattern id="pat-grass" width="18" height="10" patternUnits="userSpaceOnUse">
        <path d="M2 9 l1 -4 M5 9 l-1 -3 M11 8 l1 -4 M14 9 l2 -3" stroke="#5f8a45" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
      </pattern>
      <pattern id="pat-paramo" width="16" height="9" patternUnits="userSpaceOnUse">
        <path d="M2 8 l1.5 -5 M4 8 l-1 -4 M10 7 l1 -4 M12 8 l2 -4" stroke="#c4b36e" strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
      </pattern>
      <pattern id="pat-soil-b" width="22" height="14" patternUnits="userSpaceOnUse">
        <rect width="22" height="14" fill="#8f5f3c" />
        <circle cx="5" cy="4" r="1.5" fill="#a5744d" />
        <circle cx="15" cy="9" r="1.8" fill="#7a4f31" />
        <circle cx="10" cy="12" r="1" fill="#b4835a" />
      </pattern>
      <pattern id="pat-clay" width="30" height="8" patternUnits="userSpaceOnUse">
        <rect width="30" height="8" fill="#8f8577" />
        <path d="M0 2.5 h30 M0 6 h30" stroke="#7c7366" strokeWidth="0.9" />
        <path d="M6 2.5 v3.5 M20 6 v2" stroke="#7c7366" strokeWidth="0.6" />
      </pattern>
      <pattern id="pat-gravel" width="30" height="22" patternUnits="userSpaceOnUse">
        <rect width="30" height="22" fill="#5d97c2" />
        <ellipse cx="7" cy="6" rx="6" ry="4.5" fill="#b5a483" stroke="#8a7a5b" strokeWidth="0.8" />
        <ellipse cx="21" cy="8" rx="7" ry="5" fill="#a69472" stroke="#8a7a5b" strokeWidth="0.8" />
        <ellipse cx="13" cy="17" rx="6.5" ry="4.5" fill="#bfae8c" stroke="#8a7a5b" strokeWidth="0.8" />
        <ellipse cx="27" cy="19" rx="4" ry="3" fill="#ad9b78" stroke="#8a7a5b" strokeWidth="0.8" />
      </pattern>
      <linearGradient id="g-salt" x1="0" y1="800" x2="0" y2="1100" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#2f6f86" stopOpacity="0.55" />
        <stop offset="1" stopColor="#1d4f66" stopOpacity="0.7" />
      </linearGradient>
      <radialGradient id="g-sun-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#fff3c4" stopOpacity="0.95" />
        <stop offset="0.25" stopColor="#ffe08a" stopOpacity="0.55" />
        <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="g-sun" cx="0.42" cy="0.4" r="0.6">
        <stop offset="0" stopColor="#fffbe8" />
        <stop offset="0.7" stopColor="#ffe28f" />
        <stop offset="1" stopColor="#f7c75a" />
      </radialGradient>
      <linearGradient id="g-cloud" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.65" stopColor="#f1f5f8" />
        <stop offset="1" stopColor="#c9d5df" />
      </linearGradient>
      <linearGradient id="g-cloud-rain" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f3f6f8" />
        <stop offset="0.55" stopColor="#c9d3dc" />
        <stop offset="1" stopColor="#8b9bab" />
      </linearGradient>
      <linearGradient id="g-cloud-storm" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#dfe5ea" />
        <stop offset="0.5" stopColor="#9eacb9" />
        <stop offset="1" stopColor="#68798b" />
      </linearGradient>
      <filter id="f-soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
      <filter id="f-haze" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="3" />
      </filter>

      {/* Montañas */}
      <linearGradient id="g-rock" x1="0" y1="100" x2="0" y2="600" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#9a958c" />
        <stop offset="0.6" stopColor="#7f7b73" />
        <stop offset="1" stopColor="#6b6f5f" />
      </linearGradient>
      <linearGradient id="g-rock-shadow" x1="0" y1="100" x2="0" y2="600" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#6c6d72" />
        <stop offset="1" stopColor="#4f5752" />
      </linearGradient>
      <linearGradient id="g-snow" x1="0" y1="100" x2="0" y2="340" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#e7f0f8" />
      </linearGradient>
      <linearGradient id="g-far" x1="0" y1="430" x2="0" y2="480" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#9fbccb" />
        <stop offset="1" stopColor="#bcd3d6" />
      </linearGradient>

      {/* Superficie */}
      <linearGradient id="g-land" x1="0" y1="470" x2="0" y2="790" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#bccf9f" />
        <stop offset="0.35" stopColor="#a5c283" />
        <stop offset="1" stopColor="#80aa5e" />
      </linearGradient>
      <linearGradient id="g-flank" x1="0" y1="380" x2="0" y2="600" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#7f9a6a" />
        <stop offset="1" stopColor="#6f9658" />
      </linearGradient>
      <linearGradient id="g-ocean" x1="0" y1="470" x2="0" y2="775" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#8cbfd8" />
        <stop offset="0.3" stopColor="#4f97c1" />
        <stop offset="1" stopColor="#1f6a9b" />
      </linearGradient>
      <linearGradient id="g-lake" x1="0" y1="490" x2="0" y2="535" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#7fb8d8" />
        <stop offset="1" stopColor="#3a80b2" />
      </linearGradient>
      <pattern id="pat-field" width="14" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
        <rect width="14" height="6" fill="#bfcc86" />
        <rect width="14" height="2.2" fill="#aebf74" />
      </pattern>
      <pattern id="pat-field2" width="12" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
        <rect width="12" height="5" fill="#a9c47c" />
        <rect width="12" height="1.8" fill="#97b56a" />
      </pattern>

      {/* Subsuelo */}
      <pattern id="pat-soil" width="22" height="16" patternUnits="userSpaceOnUse">
        <rect width="22" height="16" fill="#6e4b33" />
        <circle cx="4" cy="4" r="1.6" fill="#5a3b27" />
        <circle cx="14" cy="9" r="1.9" fill="#7d5a3e" />
        <circle cx="9" cy="13" r="1.2" fill="#543522" />
        <circle cx="19" cy="3" r="1.1" fill="#8a6646" />
        <path d="M1 10 q3 -2 6 0" stroke="#4a2e1d" strokeWidth="0.8" fill="none" />
      </pattern>
      <pattern id="pat-soil-wet" width="22" height="16" patternUnits="userSpaceOnUse">
        <rect width="22" height="16" fill="#4a3022" />
        <circle cx="4" cy="4" r="1.6" fill="#3a2418" />
        <circle cx="14" cy="9" r="1.9" fill="#5b3d2a" />
        <circle cx="9" cy="13" r="1.2" fill="#2f1d13" />
        <circle cx="19" cy="3" r="1.1" fill="#61432d" />
      </pattern>
      <pattern id="pat-unsat" width="46" height="34" patternUnits="userSpaceOnUse">
        <rect width="46" height="34" fill="#e2cb9a" />
        <circle cx="6" cy="7" r="2.6" fill="#d8bf8b" />
        <circle cx="27" cy="5" r="2" fill="#dcc492" />
        <circle cx="38" cy="19" r="2.4" fill="#d5bb86" />
        <circle cx="15" cy="23" r="2.8" fill="#d9c08c" />
        <circle cx="31" cy="30" r="1.6" fill="#d3b984" />
      </pattern>
      <pattern id="pat-sat" width="46" height="34" patternUnits="userSpaceOnUse">
        <rect width="46" height="34" fill="#7fb1d2" />
        <circle cx="6" cy="7" r="2.6" fill="#93b8cb" />
        <circle cx="27" cy="5" r="2" fill="#97bacb" />
        <circle cx="38" cy="19" r="2.4" fill="#8fb4c8" />
        <circle cx="15" cy="23" r="2.8" fill="#95b9ca" />
        <circle cx="31" cy="30" r="1.6" fill="#8db3c7" />
      </pattern>
      <pattern id="pat-rock" width="90" height="48" patternUnits="userSpaceOnUse">
        <rect width="90" height="48" fill="#9c968d" />
        <path d="M0 24 h34 l8 -12 h48" stroke="#8f897f" strokeWidth="1" fill="none" />
        <circle cx="62" cy="34" r="1.3" fill="#aaa49a" />
      </pattern>
      <pattern id="pat-seabed" width="20" height="12" patternUnits="userSpaceOnUse">
        <rect width="20" height="12" fill="#a99572" />
        <circle cx="5" cy="4" r="2" fill="#94805f" />
        <circle cx="14" cy="8" r="2.4" fill="#b8a47f" />
      </pattern>
      <linearGradient id="g-sea-section" x1="0" y1="770" x2="0" y2="980" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#2b75a6" />
        <stop offset="1" stopColor="#123e62" />
      </linearGradient>
      <linearGradient id="g-sat-depth" x1="0" y1="700" x2="0" y2="1000" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#bfe0f2" stopOpacity="0.28" />
        <stop offset="1" stopColor="#1d5f8f" stopOpacity="0.22" />
      </linearGradient>
      <linearGradient id="g-depth" x1="0" y1="600" x2="0" y2="1200" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#0b1a26" stopOpacity="0.28" />
      </linearGradient>

      {/* Partículas: la forma distingue el estado, no solo el color */}
      <symbol id="p-liq" overflow="visible">
        <path d="M0 -5.2 C2.6 -1.8 3.6 0 3.6 1.6 A3.6 3.6 0 0 1 -3.6 1.6 C-3.6 0 -2.6 -1.8 0 -5.2Z" fill="#1f78c8" stroke="#ffffff" strokeWidth="0.9" />
      </symbol>
      <symbol id="p-gw" overflow="visible">
        <circle r="4.6" fill="#ffffff" />
        <path d="M0 -4.6 C2.3 -1.6 3.2 0 3.2 1.4 A3.2 3.2 0 0 1 -3.2 1.4 C-3.2 0 -2.3 -1.6 0 -4.6Z" fill="#0b4c8c" />
      </symbol>
      <symbol id="p-drop" overflow="visible">
        <path d="M0 -7 C1.8 -2.6 2.6 -0.6 2.6 1.2 A2.6 2.6 0 0 1 -2.6 1.2 C-2.6 -0.6 -1.8 -2.6 0 -7Z" fill="#2a86d0" stroke="#e9f4ff" strokeWidth="0.7" />
      </symbol>
      <symbol id="p-vap" overflow="visible">
        <circle r="4.4" fill="none" stroke="#ffffff" strokeWidth="2.6" opacity="0.9" />
        <circle r="4.4" fill="none" stroke="#5b5fc7" strokeWidth="1.3" />
      </symbol>
      <symbol id="p-cld" overflow="visible">
        <circle r="1.9" fill="#ffffff" stroke="#8aa0b6" strokeWidth="0.6" />
      </symbol>
      <symbol id="p-ice" overflow="visible">
        <g stroke="#2f6d9f" strokeWidth="2.6" strokeLinecap="round">
          <path d="M0 -5 V5 M-4.3 -2.5 L4.3 2.5 M-4.3 2.5 L4.3 -2.5" />
        </g>
        <g stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round">
          <path d="M0 -5 V5 M-4.3 -2.5 L4.3 2.5 M-4.3 2.5 L4.3 -2.5" />
        </g>
      </symbol>
      <symbol id="p-glint" overflow="visible">
        <ellipse rx="4" ry="1.3" fill="#e8f6ff" opacity="0.95" />
      </symbol>
      <symbol id="p-ripple" overflow="visible">
        <ellipse rx="4" ry="1.6" fill="none" stroke="#1f78c8" strokeWidth="1" />
      </symbol>

      {/* Puntas de flecha por tipo de flujo */}
      <marker id="m-vapor" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M1 1 L10 6 L1 11 Z" fill="#ffffff" stroke="#4f53b8" strokeWidth="1.6" strokeLinejoin="round" />
      </marker>
      <marker id="m-liquid" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M1 1 L11 6 L1 11 Z" fill="#1565b0" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
      </marker>
      <marker id="m-subsurface" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M1 1 L11 6 L1 11 Z" fill="#0d3f73" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
      </marker>
      <marker id="m-ice" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M1 1 L11 6 L1 11 Z" fill="#ffffff" stroke="#2f6d9f" strokeWidth="1.4" strokeLinejoin="round" />
      </marker>
      <marker id="m-force" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M1 1 L11 6 L1 11 Z" fill="#b5651d" stroke="#fff" strokeWidth="1" />
      </marker>
      <marker id="m-sunray" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M1 1 L11 6 L1 11 Z" fill="#f2b230" stroke="#fff" strokeWidth="1" />
      </marker>
      <marker id="m-small" viewBox="0 0 12 12" refX="7" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M1 1 L11 6 L1 11 Z" fill="#17324d" />
      </marker>

      {/* Lupas */}
      <clipPath id="clip-lens">
        <circle r="76" />
      </clipPath>
    </defs>
  );
});

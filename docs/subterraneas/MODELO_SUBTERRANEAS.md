# Sala «Aguas subterráneas»: modelo, supuestos y fuentes

Sala de la aplicación (`src/ground/`, enlace directo `#acuifero`). Tiene tres partes con la distribución de las salas con partes (`src/rooms/RoomLab.tsx`): escena 3D con una pregunta, instrumentos en vivo y controles al pie, y un panel con Esquema, Retos, Experimentos, Diseño, Datos y Docente. Sin WebGL, cada parte muestra su esquema plano con el mismo cálculo.

El cálculo está en módulos sin interfaz: `aquifer.ts` (Darcy, permeámetros, función de pozo, Theis, Cooper-Jacob, Thiem, Ogata-Banks, zona de captura y partículas), `scene.ts` (las escenas ilustrativas) y `design.ts` (herramientas de diseño y sus gráficas). Se prueba en `tests/ground/aquifer.test.ts` (`npm run test:ground`; informe en `PRUEBAS_SUBTERRANEAS.md`).

**Qué es y qué no es.** Laboratorio educativo de hidrogeología. El valle, el acuífero, el pozo y la fuga son **ilustrativos**: no representan los acuíferos del valle de Aburrá ni ningún pozo real, y los prediseños no son diseños de ingeniería. En esta sala no se citan artículos del RAS; un pozo real necesita concesión de aguas de la autoridad ambiental y estudios de campo.

**Escalas.** El corte del acuífero va a escala. El cono de abatimiento se dibuja con la escala vertical exagerada (×1 a ×50, un número redondo) y la escena lo dice en un rótulo. La mancha, que va bajo tierra, se dibuja sobre el suelo para verla, y las animaciones van en cámara rápida (los rótulos dicen cuánto).

## 1. El acuífero y la ley de Darcy

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Materiales | K (m/día) y porosidad eficaz: grava 300 y 0,25; arena gruesa 30 y 0,28; arena fina 3 y 0,25; limo 0,1 y 0,15; arcilla 0,0001 y 0,05 | Freeze y Cherry (1979), tabla 2.2; Fetter (2001) |
| Darcy | q = K·i; velocidad en los poros v = q/ne | Darcy (1856) |
| Acuífero libre | Dupuit-Forchheimer con base horizontal: q = K·(h1² − h2²)/(2L), h(x) = √(h1² − (h1² − h2²)·x/L) | Dupuit (1863) |
| Tiempo de viaje | integral de dx/v(x) con v = q/(ne·h), en 600 tramos | — |
| Permeámetros | carga constante K = Q·L/(A·Δh); carga variable K = (a·L/(A·t))·ln(h0/h1) | Normas de laboratorio de suelos |

**La escena.** Loma y río a 600 m, con el agua del río a 20 m sobre la base y la de la loma de 2 a 15 m más arriba. Tres pozos de observación y partículas que siguen la fracción de la altura saturada. **Experimento:** un permeámetro de 30 cm × 10 cm con carga fija; la probeta recoge al menos 50 mL y se lee al décimo de mililitro.

## 2. El pozo y su cono

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Función de pozo | W(u) = E1(u): serie para u ≤ 1 y fracción continua para u > 1 | Abramowitz y Stegun (1964), 5.1 |
| Theis | s = Q/(4πT)·W(u), u = r²S/(4Tt) | Theis (1935) |
| Cooper-Jacob | s = 2,30·Q/(4πT)·log10(2,25·T·t/(r²S)), con u pequeño | Cooper y Jacob (1946) |
| Thiem | s1 − s2 = Q·ln(r2/r1)/(2πT) | Thiem (1906) |
| Radio de influencia | R = √(2,25·T·t/S) | Cooper-Jacob |
| Prueba de bombeo | lecturas de Theis con ±1 cm de error (semilla fija); recta por mínimos cuadrados con la mitad final | — |

**La escena.** Acuífero confinado de 25 m bajo una capa de arcilla, S = 2 × 10⁻⁴, nivel estático 4 m sobre el techo del acuífero (si el pozo baja más, deja de ser confinado y se avisa). Pozos de observación a 10, 50 y 200 m. «Bombear» muestra el cono desde el primer minuto hasta el tiempo elegido, en escala logarítmica de tiempo.

## 3. La mancha y la zona de captura

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Campo de velocidades | flujo regional uniforme más un pozo que atrae el agua radialmente: v_r = Q/(2π·b·ne·r) | Superposición |
| Partículas | advección por Runge-Kutta de segundo orden y dispersión por caminata aleatoria √(2·α·v·Δt), con αT = αL/10 | Método estándar de partículas |
| Zona de captura | ancho Q/(b·q); estancamiento Q/(2π·b·q); borde x = \|y\|/tan(2π·\|y\|/ancho) | Todd (1980) |
| Una dimensión | Ogata y Banks (1961) con concentración fija en la entrada; van Genuchten y Alves (1982) con entrada de flujo | — |

**La escena.** Arena gruesa (K = 30 m/día), gradiente 0,002, espesor 20 m; la fuga queda 300 m aguas arriba del pozo y se simulan ocho años con 600 partículas. **Experimento:** una fila de 81 partículas sin dispersión mide el ancho de la zona de captura contra la teoría.

## 4. Herramientas de diseño

| Parte | Calculadora | Prediseñador | Avanzada (universitarios) |
|---|---|---|---|
| El acuífero | Darcy (caudal, velocidad, tiempo de viaje) | zona de protección de un pozo por tiempo de viaje | permeámetro de carga constante o variable |
| El pozo | Theis y Cooper-Jacob | caudal máximo de un pozo con pérdidas del pozo e interferencia | prueba de bombeo con Cooper-Jacob |
| La mancha | Ogata-Banks | zona de captura y una fuente | — |

## 5. Verificación

`npm run test:ground` ejecuta nueve pruebas (S1 a S9): W(u) contra las tablas de Theis, Theis contra Cooper-Jacob y Thiem, recuperación de T y S en una prueba con error de lectura, Darcy y permeámetros, continuidad de Dupuit, partículas contra la solución con entrada de flujo (diferencia 0,002), zona de captura contra trayectorias, orden de los suelos y robustez de las ocho herramientas.

## Fuentes

- Abramowitz, M. y Stegun, I. A. (1964). *Handbook of Mathematical Functions*. NBS.
- Cooper, H. H. y Jacob, C. E. (1946). A generalized graphical method for evaluating formation constants. *Transactions AGU*, 27(4), 526–534.
- Fetter, C. W. (2001). *Applied Hydrogeology* (4.ª ed.). Prentice Hall.
- Freeze, R. A. y Cherry, J. A. (1979). *Groundwater*. Prentice Hall.
- Ogata, A. y Banks, R. B. (1961). A solution of the differential equation of longitudinal dispersion in porous media. USGS Professional Paper 411-A.
- Theis, C. V. (1935). The relation between the lowering of the piezometric surface and the rate and duration of discharge of a well. *Transactions AGU*, 16, 519–524.
- Todd, D. K. (1980). *Groundwater Hydrology* (2.ª ed.). Wiley.
- van Genuchten, M. Th. y Alves, W. J. (1982). Analytical solutions of the one-dimensional convective-dispersive solute transport equation. USDA Technical Bulletin 1661.

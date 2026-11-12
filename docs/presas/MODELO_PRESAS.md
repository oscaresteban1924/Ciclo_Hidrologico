# Sala «Presas y embalses»: modelo, supuestos y fuentes

Sala de la aplicación (`src/dams/`, enlace directo `#presas`). Tiene tres partes con la distribución de las salas con partes (`src/rooms/RoomLab.tsx`): escena 3D con una pregunta, instrumentos en vivo y controles al pie, y un panel con Esquema, Retos, Experimentos, Diseño, Datos y Docente. Sin WebGL, cada parte muestra su esquema plano con el mismo cálculo.

El cálculo está en módulos sin interfaz: `dam.ts` (hidrograma gamma, tránsito de Puls, embalse lineal, perfil WES, pozo de disipación y estabilidad de una presa de gravedad), `scene.ts` (las escenas ilustrativas y el coeficiente de la cresta con otras cargas) y `design.ts` (herramientas de diseño y sus gráficas). Se prueba en `tests/dams/dam.test.ts` (`npm run test:dams`; informe en `PRUEBAS_PRESAS.md`).

**Qué es y qué no es.** Laboratorio educativo de obras hidráulicas. El embalse, el vertedero y la presa son **ilustrativos**: no representan ninguna presa de Antioquia ni de Colombia, la creciente no es un pronóstico y los prediseños no son diseños de ingeniería. En esta sala no se citan artículos del RAS: los factores de seguridad de 1,5, la resultante en el tercio medio y el límite de 1,33 veces la carga de diseño son criterios usuales de la práctica, para aprender. Una presa real se diseña con las normas de presas, estudios geológicos y sísmicos y la revisión de especialistas.

**Escalas.** Las tres maquetas van a escala, sin exageración vertical. Las flechas de fuerzas son proporcionales a su valor (la más grande mide 16 m en la maqueta) y el diagrama de esfuerzos bajo la base es proporcional al esfuerzo mayor. La creciente de 48 horas se reproduce en 24 s.

## 1. El embalse y la creciente

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Creciente de entrada | hidrograma de forma gamma: Q(t) = Qb + (Qp − Qb)·(t/tp)^m·e^(m·(1 − t/tp)), m = 3,7 | NRCS, National Engineering Handbook, parte 630, cap. 16 |
| Embalse | almacenamiento S(h) = A0·h + A1·h²/2 sobre la cresta (espejo de 150 ha que crece 15 ha por metro) | — |
| Vertedero libre | O(h) = C·L·h^1,5 con C = 2,18 (SI) | USBR, *Design of Small Dams* |
| Tránsito | Puls modificado (piscina nivelada): 2S/Δt + O en cada paso con la relación S-O invertida por bisección; Δt = 15 min | Chow, Maidment y Mays (1988), sec. 8.2 |
| Pico de salida | ocurre cuando la salida cruza la entrada (dS/dt = 0) | ibíd. |

**La escena.** Un valle con una presa de gravedad de 36 m (corona 6 m sobre la cresta del vertedero). Al llegar la creciente el lago sube, la lámina pasa por el vertedero y el río de aguas abajo crece (profundidad de Manning en cauce ancho, para que se vea). **Experimentos:** balance de masa del tránsito (entró, salió, quedó) y la misma creciente con vertederos de 10 a 80 m.

## 2. El vertedero y el pozo

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Perfil de la cresta | WES aguas abajo: x^1,85 = 2·Hd^0,85·y; empalme con la rápida donde dy/dx = 1/m | U.S. Army Corps of Engineers, Hydraulic Design Criteria |
| Caudal | Q = C·L·H^1,5; C(H/Hd) = 2,18·(H/Hd)^0,13 (ajuste potencial aproximado a la curva de coeficientes del USBR, entre 0,2 y 1,6) | USBR, *Design of Small Dams* |
| Al pie | energía conservada en la rápida (sin pérdidas, cota superior de la velocidad): y1 = q/√(2g·(P + D + H − y1)) | — |
| Resalto | Bélanger: y2 = y1/2·(√(1 + 8F1²) − 1); pérdida (y2 − y1)³/(4·y1·y2) | Chow (1959), cap. 15 |
| Pozo | USBR tipo I, largo ≈ 6·y2; el resalto queda dentro si el agua del río más la profundización alcanza y2 | Peterka (1978) |
| Río aguas abajo | Manning en cauce ancho: y = (q·n/√S)^0,6, n = 0,035, S = 0,002 | Chow (1959) |
| Criterio de la cresta | H/Hd ≤ 1,33 (criterio usual contra presiones negativas) | práctica usual |

**La escena.** Maqueta cortada por el eje para ver el perfil: embalse aguas arriba, cresta, rápida, pozo con su umbral y el río. Fuera del pozo, el chorro rápido sigue por el río y el resalto se forma más abajo, hasta el agua del río. La espuma se mueve en la zona del resalto. **Experimentos:** la fuerza específica igual antes y después del resalto, la pérdida de energía calculada de dos maneras, la potencia disipada y la profundidad del pozo para cargas de 1 a 8 m.

## 3. La presa de gravedad

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Sección | paramento aguas arriba vertical, corona de 5 m, talud aguas abajo m:1, altura 30 m; por metro de presa | USBR, *Design of Small Dams*; Novak y otros (2007) |
| Fuerzas | peso (γc = 23,5 kN/m³), empuje γw·h²/2 a h/3, agua de abajo, subpresión lineal de γw·hw·u en el talón a γw·tail en la punta (u = 1 sin drenes, 0,33 con drenes) | ibíd. |
| Volcamiento | FSo = ΣM resistentes / ΣM volcadores, respecto a la punta | ibíd. |
| Deslizamiento | FSs = μ·ΣV / ΣH (sin cohesión) | ibíd. |
| Esfuerzos en la base | σ = ΣV/B·(1 ± 6e/B); tercio medio |e| ≤ B/6 | ibíd. |

**La escena.** La presa sobre la roca, con el embalse, el agua de abajo y la galería de drenes cuando están. Flechas de cada fuerza y de la resultante (verde si cae en el tercio medio, roja si no), la barra del tercio medio y el diagrama de esfuerzos delante de la base (azul compresión, rojo tracción). **Experimentos:** tabla de fuerzas y momentos, la suma de fuerzas verticales contra la reacción de la base, el nivel con el que el deslizamiento baja a 1,5 y a 1 (bisección), y los factores a medida que sube el agua.

## 4. Herramientas de diseño

| Parte | Calculadora | Prediseñador |
|---|---|---|
| El embalse | tránsito de Puls (pico, atenuación, retraso, nivel máximo) | menor ancho del vertedero con el borde libre pedido |
| El vertedero | caudal y perfil WES con su empalme con la rápida | profundidad y largo del pozo (se itera: al hundirlo crece la caída) |
| La presa | fuerzas, factores de seguridad, resultante y esfuerzos | talud más empinado que cumple los tres criterios y la compresión en la base |

Cada herramienta tiene memoria de cálculo con su gráfica.

## 5. Verificación

`npm run test:dams` ejecuta ocho pruebas (D1 a D8): Puls contra el embalse lineal exacto; masa, atenuación, retraso y pico en el cruce en el embalse de la escena; perfil WES, tangencia, energía al pie y fuerza específica del resalto; una sección triangular calculada a mano; tercio medio, esfuerzos y efecto de los drenes; volumen y área del embalse; robustez de las seis herramientas con datos al azar; y el coeficiente de la cresta con otras cargas, el pozo justo y la pérdida del resalto.

## Límites

El embalse se supone horizontal (sin la cuña de la creciente que entra) y el coeficiente del vertedero libre es constante. En el vertedero no se modelan las pérdidas ni el aire en la rápida, los pozos con bloques (USBR II, III o IV) ni las presiones sobre la cresta. La presa es una sección 2D sin sismo, sedimentos ni cohesión; si el talón queda en tracción, la distribución lineal deja de valer (se abriría una grieta) y la sala solo lo señala. El agua no supera la corona.

## Fuentes

- Chow, V. T. (1959). *Open-Channel Hydraulics*. McGraw-Hill.
- Chow, V. T., Maidment, D. R. y Mays, L. W. (1988). *Applied Hydrology*. McGraw-Hill.
- Natural Resources Conservation Service (2007). *National Engineering Handbook*, parte 630, cap. 16 (Hydrographs).
- Novak, P., Moffat, A. I. B., Nalluri, C. y Narayanan, R. (2007). *Hydraulic Structures* (4.ª ed.). Taylor & Francis.
- Peterka, A. J. (1978). *Hydraulic Design of Stilling Basins and Energy Dissipators*. USBR, Engineering Monograph 25.
- U.S. Army Corps of Engineers. *Hydraulic Design Criteria* (perfiles WES de vertederos).
- U.S. Bureau of Reclamation (1987). *Design of Small Dams* (3.ª ed.).

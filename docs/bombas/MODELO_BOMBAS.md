# Sala «Bombas y energía del agua»: modelo, supuestos y fuentes

Sala de la aplicación (`src/pumps/`, enlace directo `#bombas`). Tiene tres partes con la distribución de las salas con partes (`src/rooms/RoomLab.tsx`): escena 3D con una pregunta, instrumentos en vivo y controles al pie, y un panel con Esquema, Retos, Experimentos, Diseño, Datos y Docente. Sin WebGL, cada parte muestra su gráfica o su corte plano con el mismo cálculo.

El cálculo está en módulos sin interfaz: `pump.ts` (curvas de bombas, sistema, punto de operación, NPSH, central y turbinas), `scene.ts` (las escenas ilustrativas) y `design.ts` (herramientas de diseño y sus gráficas). Reutiliza Darcy-Weisbach, los materiales y los accesorios de la sala de acueducto (`src/supply/pipes.ts`). Se prueba en `tests/pumps/pump.test.ts` (`npm run test:pumps`; informe en `PRUEBAS_BOMBAS.md`).

**Qué es y qué no es.** Laboratorio educativo. Las bombas, las tuberías, el río y la central son **ilustrativos**: la bomba tiene una curva típica de catálogo pero no es de un fabricante; el río y la central no son un proyecto ni un lugar de Colombia; el caudal que se deja en el río no es el caudal ambiental de ninguna autoridad. Los prediseños no son diseños de ingeniería. No se citan artículos de normas: la región preferida de operación (70 % a 120 % del mejor caudal), las velocidades de 0,6 a 2 m/s en impulsiones, el margen de NPSH de 0,5 m y las pérdidas de 5 % en la tubería de presión son criterios usuales de la práctica, dichos así.

**Escalas.** Las alturas van a escala: la loma de la estación mide lo que pide la altura estática y el valle de la central baja la caída elegida. La tubería de impulsión, que en el caso mide 450 m, se acorta en la maqueta y se dice en la escena. El ancho del agua del río crece con el caudal; su profundidad no se exagera. Las burbujas de cavitación de la maqueta son una representación: las reales son de fracciones de milímetro.

## 1. La bomba y la tubería

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Curva de la bomba | H = n²·H0 − a·Q² (H0 = 52 m, a = H0/Qmax², Qmax = 97 L/s a velocidad nominal) | curva típica de catálogo; Karassik y otros (2008) |
| Eficiencia | parábola alrededor del mejor punto (55 L/s, 78 %), evaluada en el punto homólogo Q/n | ibíd. |
| Leyes de afinidad | Q ∝ n, H ∝ n², P ∝ n³ en puntos homólogos | ibíd. |
| Dos bombas | en serie se suman las alturas con el mismo caudal; en paralelo, los caudales con la misma altura | ibíd. |
| Curva del sistema | Hs + f·(L/D)·V²/2g + K·V²/2g, con f de Swamee-Jain | Saldarriaga (2007); Swamee y Jain (1976) |
| Válvula de compuerta | K según la apertura (tabla típica interpolada en el logaritmo) | Crane (TP-410) |
| Punto de operación | bisección donde las dos curvas se igualan | — |
| Potencia y energía | P = ρ·g·Q·H/η; energía por metro cúbico = P/(Q·3 600) | — |

**La escena.** Un tanque de succión enterrado con su baranda, la casa de bombas con una bomba (o dos en serie o en paralelo) sobre su base, con el motor de aletas, el acople que gira, la válvula de retención, la válvula de compuerta con su volante y dos manómetros (descarga y succión) cuya aguja sigue el cálculo. Un tablero del variador muestra las rpm y los kW. La tubería sube por una franja de gravilla hasta un tanque abierto en lo alto de la loma, donde cae el chorro. Flechas pintadas avanzan por las tuberías a la velocidad del agua. **Experimentos:** la velocidad del motor de 70 % a 110 %, bajar el caudal con la válvula o con el variador (y el ahorro), y una tabla de arreglos por diámetro.

## 2. El agua hierve en la bomba

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Atmósfera | p = 101,325·(1 − 2,25577·10⁻⁵·z)^5,25588 kPa | atmósfera estándar de 1976 |
| Presión de vapor | 0,61078·exp(17,27·T/(T + 237,3)) kPa | Tetens (1930) |
| Densidad del agua | ajuste usual entre 0 y 100 °C | — |
| NPSH disponible | (patm − pv)/(ρg) + zs − pérdidas en la succión | Karassik y otros (2008); Mays (2010) |
| NPSH requerido | NPSHr0·n² + b·Q² (curva típica de catálogo) | ibíd. |
| Caudal máximo sin cavitar | bisección donde NPSHa = NPSHr + 0,5 m | criterio usual |

**La escena.** Un corte de estación: el pozo con frente de vidrio y marcas cada metro, el agua que sube y baja respecto al eje de la bomba, flechas de la atmósfera cuyo largo sigue la presión del lugar, un termómetro y vapor sobre el agua caliente. La tubería de succión es transparente y el agua dentro se colorea por su presión absoluta (azul con presión de sobra, roja cerca de la de vapor). La bomba es de vidrio: se ve el rodete y, si falta presión, nacen burbujas en su ojo que revientan al llegar a la zona de alta presión, con vibración. Un manómetro de presión absoluta marca en rojo la zona por debajo de la presión de vapor. **Experimentos:** de dónde sale el NPSH disponible, el caudal máximo sin cavitar por lugar y temperatura, y la altura máxima de la bomba sobre el agua en cada lugar.

## 3. La central hidroeléctrica

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Altura neta | Hn = Hg − (fricción de Darcy-Weisbach en acero + 10 % de locales) | ESHA (2004) |
| Potencia | P = ρ·g·Q·Hn·ηt·ηg (generador 95 %) | ibíd. |
| Turbinas | Pelton 60–1 000 m; Michell-Banki 3–150 m y caudales pequeños; Francis 15–400 m; Kaplan 2–35 m (envolventes aproximadas) | ESHA (2004); Penche (1998) |
| Carga parcial | eficiencias típicas por tipo; la turbina para por debajo de 10 % (Pelton), 20 % (Banki), 25 % (Kaplan) o 40 % (Francis) de su caudal de diseño | ibíd. |
| Curva de duración | logística alrededor de la mediana (ilustrativa) | — |
| Energía del año | potencia media sobre la curva × 8 760 h; factor de planta = media / diseño | — |

**La escena.** Un valle de montaña a escala: el río con su azud y la bocatoma, el canal de conducción por la ladera, la cámara de carga, la tubería de presión con sus bloques de anclaje, la casa de máquinas con frente de vidrio y la turbina a la vista (rueda Pelton con su chorro, tambor de Michell-Banki, o caja espiral con rodete Francis o hélice Kaplan y el generador encima), la descarga al río, la red con pulsos que viajan por los cables y un pueblo cuyas ventanas se encienden según la energía (cada casa representa 60 hogares). El tramo entre la bocatoma y la descarga lleva menos agua. **Experimentos:** la central en cada época del año, cada turbina con esta caída y este caudal, y las pérdidas según el diámetro de la tubería.

## 4. Herramientas de diseño

| Parte | Calculadora | Prediseño |
|---|---|---|
| Bombeo | punto de operación con la curva de catálogo, el arreglo y la velocidad | estación de bombeo: diámetro por velocidad, altura dinámica total, motor comercial (IEC, con 15 % de margen) y energía al año con una tarifa ilustrativa |
| Cavitación | NPSH disponible y margen | altura máxima de la bomba sobre el agua (o cuánto debe quedar por debajo) |
| Central | potencia, altura neta, energía al año y factor de planta | diámetro de la tubería de presión con pérdidas máximas y espesor orientativo de acero (Barlow con sobrepresión por golpe de ariete) |

## 5. Verificación

`npm run test:pumps` ejecuta once pruebas (B1 a B11): leyes de afinidad, el punto de operación en 300 sistemas al azar, serie contra paralelo según la fricción, atmósfera, presión de vapor y densidad contra tablas, NPSH y caudal máximo sin cavitar, potencia de la central contra un caso a mano, curva de duración y energía del año, elección de turbina, válvula contra variador, robustez de las seis herramientas con sus gráficas, y las escenas de partida.

## Límites

Curvas de bomba ilustrativas; las leyes de afinidad valen para cambios moderados de velocidad. Sin golpe de ariete, sin arranques y paradas, sin variación de los niveles de los tanques. La curva de NPSH requerido de un equipo real la da el fabricante (a menudo con el criterio de 3 % de caída de altura); sin gases disueltos ni vórtices en la toma. La central es de pasada, sin embalse; la curva de duración es ilustrativa; sin pérdidas en la red ni variación de la demanda en el día.

## Fuentes

- Crane Co. (2013). *Flow of Fluids Through Valves, Fittings, and Pipe* (TP-410).
- ESHA, European Small Hydropower Association (2004). *Guide on How to Develop a Small Hydropower Plant*.
- Karassik, I. J., Messina, J. P., Cooper, P. y Heald, C. C. (2008). *Pump Handbook* (4.ª ed.). McGraw-Hill.
- Mays, L. W. (2010). *Water Resources Engineering* (2.ª ed.). Wiley.
- Penche, C. (1998). *Layman's Guidebook on How to Develop a Small Hydro Site*. ESHA.
- Saldarriaga, J. (2007). *Hidráulica de tuberías*. Alfaomega.
- Swamee, P. K. y Jain, A. K. (1976). Explicit equations for pipe-flow problems. *Journal of the Hydraulics Division*, 102(5).
- Tetens, O. (1930). Über einige meteorologische Begriffe. *Zeitschrift für Geophysik*, 6.
- U.S. Standard Atmosphere (1976). NOAA, NASA y USAF.

# Sala «Modelación hidráulica 2D»: modelo, supuestos y fuentes

Sala de la aplicación (`src/model2d/`, enlace directo `#modelo2d`). Tiene ocho partes con la distribución de las salas con partes (`src/rooms/RoomLab.tsx`): escena 3D con una pregunta, instrumentos en vivo y controles al pie, y un panel con Esquema, Retos, Experimentos, Diseño, Datos y Docente. Sin WebGL, cada parte muestra su gráfica con el mismo cálculo.

| Parte | Pregunta | Qué se hace |
|---|---|---|
| Terreno | ¿Qué ve el modelo del terreno? | MDT y MDS, tamaño del píxel, remuestreo, fuentes y cauce levantado |
| Coberturas, n y calibración | ¿Cuánto cambia la inundación con el n? ¿Qué n reproduce las marcas? | sensibilidad al n y calibración con marcas de agua |
| Crecientes, lluvia y bordes | ¿Qué deja cada creciente? ¿Qué encharca el aguacero? | periodos de retorno, hidrograma, lluvia sobre la malla con el número de curva |
| La malla y las ecuaciones | ¿Qué calcula cada celda? | celdas, subgrid, refinamiento, tres juegos de ecuaciones, mapas de diagnóstico |
| Estructuras | ¿Qué le hace el puente a la creciente? ¿Qué pasa si el jarillón se rompe? | el puente como estructura y la rotura progresiva del jarillón |
| Riesgo | ¿Qué tan seguro es el mapa? ¿Dónde es alta la amenaza? ¿Cuánto cuesta el agua? | ensamble de incertidumbre, zonificación (ejercicio), daños y daño anual esperado |
| HEC-RAS 2D paso a paso | ¿Está listo el modelo? | los diez pasos de un modelo, resultados con sondas y líneas, y la exportación |
| Tu terreno | ¿Cómo se inunda tu terreno? | el mismo modelo sobre un GeoTIFF propio, leído en el navegador |

El cálculo está en módulos sin interfaz:

- `terrain.ts`: el valle verdadero a 1 m (MDT y MDS), coberturas, remuestreo, error de la fuente, cauce levantado, la vía sin su terraplén y medidas sobre un terreno.
- `solver.ts`: el preprocesador (malla de árbol cuaternario, tablas subgrid de celdas y caras) y el motor 2D (onda difusiva implícita, inercia local y aguas someras completas explícitas), las condiciones de borde, el puente, la rotura del jarillón, la lluvia y los resultados.
- `hydrology.ts`: la serie de máximos anuales, Gumbel, el riesgo y el hidrograma.
- `dambreak.ts`: la rotura de presa en 1D frente a Ritter.
- `analysis.ts`: calibración, ensamble, intensidad y zonificación, curva de daño y daño anual esperado.
- `exports.ts`: ZIP, GeoTIFF, shapefile y los paquetes que se descargan.
- `importDem.ts`: lectura de un GeoTIFF propio (geotiff.js) y el terreno de ejemplo.
- `scene.ts`: las escenas de cada parte, el resumen de una corrida y la amenaza H1–H6.
- `design.ts`: las herramientas de diseño y sus gráficas.
- `runs.ts` y `worker.ts`: las corridas en un hilo aparte (o a ratos en la página) y su caché.

Se prueba en `tests/model2d/model2d.test.ts` (`npm run test:model2d`; informe en `PRUEBAS.md`).

**Qué es y qué no es.** Laboratorio educativo. El modelo 2D de la sala se construye con las ideas de HEC-RAS 2D (volúmenes finitos, tablas subgrid, malla con refinamiento, onda difusiva implícita con θ, iteraciones y tolerancias, Courant, líneas de quiebre, estructuras en líneas de la malla, condiciones de borde por conducción y profundidad normal, lluvia sobre la malla), pero **no es HEC-RAS** ni da sus resultados. El valle, la quebrada, el jarillón, el barrio, la vía, el puente, las coberturas, la serie de caudales, las marcas de agua y los valores de las viviendas son **ilustrativos**: no son un lugar de Medellín ni un levantamiento real. Los mapas no son un estudio de amenaza, un pronóstico oficial de inundación ni diseños de ingeniería; la zonificación es un ejercicio con un criterio de ejemplo, no la de un plan de ordenamiento; la rotura y el puente no son diseños de obras. El paquete para HEC-RAS lleva coordenadas inventadas y lo declara en su LEAME.

**Escalas.** El valle mide 640 × 400 m (1 unidad de la escena = 2 m). El relieve se puede ver a escala real o exagerado ×3 o ×6; la escena lo dice y el agua, el terreno y las casas se estiran lo mismo (no se exagera la profundidad del agua sola). Las partículas que siguen la corriente y la tinta van 6 veces más rápido que el agua, y la escena lo dice; la reproducción en el tiempo va de 1 a 8 minutos de creciente por segundo.

## El valle

| Pieza | Valor | Nota |
|---|---|---|
| Valle | 640 × 400 m, pendiente 0,5 %, laderas a los lados | terreno verdadero a 1 m (256 000 píxeles) |
| Quebrada | meándrica (320 m de longitud de onda, 30 m de amplitud), boca de 11 m, fondo de 6 m, 2,4 m de hondo | n = 0,04 (gravas y cantos) |
| Orillas | terraza al sur; llanura baja al norte, donde está el barrio | — |
| Jarillón | 1,3 m sobre la llanura, corona de 3 m, a 14 m del eje por la orilla izquierda; arranca en la loma y muere en la vía | — |
| Vía | terraplén de 2,8 m en x = 446 m con un puente de unos 20 m de luz | el tablero solo está en el MDS |
| Barrio | 45 casas de 3 a 9 m y la escuela, en manzanas de 40 × 36 m con calles de 8 m; aguas abajo, una finca de tres edificaciones | — |
| Árboles | unas 550 copas en el bosque de orillas, la ladera y el rastrojo | solo en el MDS |
| Coberturas | cauce, pasto, cultivos, rastrojo, bosque, vías y edificaciones | n de Chow (1959) |

## 1. El terreno: MDT, MDS y el píxel

| Pieza | Valor | Fuente |
|---|---|---|
| MDT y MDS | el MDT es el suelo desnudo; el MDS, lo primero que ve el sensor (techos, copas, el tablero del puente) | — |
| Lámina de agua | el láser y las fotos no ven bajo el agua: el cauce bajo la lámina del caudal base (0,5 m) falta en todas las fuentes | — |
| Remuestreo | promedio, mínimo, máximo o vecino más cercano, por bloques de p × p píxeles | — |
| Error vertical | ruido con una parte suave y otra por píxel, de desviación típica σ | ilustrativo |
| Cauce levantado | el cauce de 1 m (batimetría) encima del terreno, como una modificación del terreno de RAS Mapper | — |
| Capacidad del cauce | caudal que cabe bajo la orilla verdadera por franjas de 1 m con Manning (n = 0,04, S = 0,5 %), promedio de 19 cortes | — |
| LiDAR QL2 | RMSEz ≤ 10 cm, celda de 1 m | USGS 3DEP, Lidar Base Specification |
| Copernicus GLO-30 | MDS de 30 m; absoluta < 4 m (LE90), relativa < 2 m en pendientes ≤ 20 % | Copernicus DEM |
| ALOS PALSAR RTC 12,5 m | fuera de EE. UU. el MDE es el SRTM de 30 m remuestreado | ASF, guía del producto RTC |

**La escena.** El terreno como lo ve el modelo: liso a 2 m cuando el píxel es fino, en bloques cuando es de 5 m o más, coloreado por la cota sobre el fondo del valle y sombreado como un mapa de sombras. En el MDT, las casas aparecen solo como contornos. Un plano blanco muestra el corte: la línea oscura es el terreno real y la azul, la que ve el modelo. **Experimentos:** la capacidad del cauce y la corona del jarillón para cada píxel y cada método, y las cuatro fuentes simuladas sobre este valle.

## 2. Coberturas, n y calibración

| Cobertura | n mín.–normal–máx. | Descripción de Chow (1959) |
|---|---|---|
| Cauce | 0,030–0,040–0,050 | corriente de montaña, gravas y cantos con pocos bloques |
| Pasto | 0,025–0,030–0,035 | pastos cortos sin matorral |
| Cultivos | 0,025–0,035–0,045 | cultivos en hileras, maduros |
| Rastrojo | 0,040–0,060–0,080 | matorral claro y árboles, en verano |
| Bosque | 0,080–0,100–0,120 | bosque denso, poco sotobosque, agua bajo las ramas |
| Vías | 0,013–0,016 | asfalto |
| Casas | 0,2 (de 0,1 a 1) | valor de calibración que representa el estorbo; también se pueden levantar como bloques o no representarlas |

**Sensibilidad.** El modelo corre la creciente de 100 años con celdas de 20 m con subgrid y la inercia local. **Experimentos:** siete variantes (mínimos, normales, máximos, ×0,7, ×1,3, casas como bloques, sin casas) con el nivel en el puente, el barrio con agua, la escuela y la velocidad máxima.

**Calibración con marcas de agua.** Una creciente pasada (pico de 66 m³/s a los 40 min) dejó ocho marcas en el valle: en árboles y muros de las dos orillas, en un poste frente al barrio y en el estribo del puente. Las marcas no son de un evento real: salen de una corrida escondida con los n normales ×1,18 y un error de medición de ±5 cm (como el de una marca de barro levantada con GPS). Se compara el modelo con las marcas por el error medio cuadrático (RMSE) y el sesgo (modelo − marca). La calibración automática busca el multiplicador del n con la búsqueda de sección dorada entre 0,7 y 1,6: recupera ×1,16 con un RMSE de 1,7 cm en unas diez corridas (con ×1: RMSE 14,7 cm, sesgo −14,6 cm). La escena pone cada marca con su cota observada y la del modelo.

## 3. Crecientes, lluvia y condiciones de borde

| Pieza | Valor | Fuente |
|---|---|---|
| Serie | 30 máximos anuales ilustrativos (1995–2024): media 32,7 m³/s, desviación 15,0 m³/s | inventada con la forma de Gumbel |
| Gumbel por momentos | Q_T = media + K_T·desviación; K_T = −(√6/π)·(0,5772 + ln(ln(T/(T − 1)))) | Chow, Maidment y Mays (1988) |
| Riesgo | R = 1 − (1 − 1/T)^n | — |
| Hidrograma | Q(t) = Qb + (Qp − Qb)·[(t/tp)·e^(1 − t/tp)]^3,7, Qb = 4 m³/s | forma gamma del hidrograma adimensional del SCS |
| Entrada | línea de borde con hidrograma: profundidad normal con la pendiente de energía y reparto por conducción entre las celdas mojadas | como HEC-RAS en las líneas de borde de flujo |
| Salida | profundidad normal: Q = K(η)·√S con la pendiente de fricción | — |
| Condiciones iniciales | 20 min con el caudal base desde el cauce seco | — |

Con esta serie: Q₂ = 30,2; Q₁₀ = 52,2; Q₂₅ = 63,2; Q₅₀ = 71,5; Q₁₀₀ = 79,6 y Q₅₀₀ = 98,4 m³/s. Los periodos de 2 a 10 años caben; desde el de 25 años el agua pasa el jarillón cerca del puente, donde el terraplén la remansa. **Experimentos:** los siete periodos con su riesgo, su volumen, el nivel en el puente, el barrio con agua y la atenuación del pico.

**Lluvia sobre la malla.** Un aguacero de lluvia total P (de 20 a 160 mm) y duración D (30, 60, 120 o 180 min) cae sobre cada píxel. El hietograma es de bloques alternos de 5 min con una curva intensidad-duración ilustrativa i = a/(t + 10)^0,75 (el bloque mayor en el centro). Las pérdidas siguen el número de curva del SCS (abstracción inicial 0,2·S, S = 25 400/CN − 254 mm) con la lluvia acumulada de cada celda, píxel a píxel según su cobertura y el grupo hidrológico del suelo:

| Cobertura | A | B | C | D | Descripción (USDA, TR-55) |
|---|---|---|---|---|---|
| Cauce | 100 | 100 | 100 | 100 | lámina de agua: toda la lluvia escurre |
| Pasto | 39 | 61 | 74 | 80 | pastos en buena condición |
| Cultivos | 67 | 78 | 85 | 89 | cultivos en hileras rectas, buena condición |
| Rastrojo | 43 | 65 | 76 | 82 | combinación bosque–pasto, condición regular |
| Bosque | 30 | 55 | 70 | 77 | bosque en buena condición |
| Vías y casas | 98 | 98 | 98 | 98 | superficies impermeables |

El balance cuenta la lluvia, lo que escurre y lo que se pierde. Con 80 mm en 60 min sobre suelos C escurren 35 mm y el barrio se encharca (8498 m² con más de 10 cm) aunque el río no se desborde: el jarillón no deja salir el agua. Se puede correr la creciente, la lluvia o las dos.

## 4. La malla y las ecuaciones

| Pieza | Cálculo |
|---|---|
| Malla | celdas cuadradas de 5, 10, 20 o 40 m; con refinamiento, un árbol cuaternario balanceado (celdas vecinas de a lo sumo el doble de tamaño) con regiones de celdas menores en el cauce, el jarillón, el barrio o el puente; caras generales entre celdas de distinto tamaño; caras de borde en las líneas de borde |
| Celdas (subgrid) | V(η) = a·(k·η − Σ de las k cotas más bajas), con las cotas de los píxeles ordenadas; la inversa η(V) es exacta |
| Caras (subgrid) | muestras del terreno cada metro sobre la cara (la cota mayor de los dos píxeles que la tocan) y su n; tablas cada 0,1 m durante 6,3 m de A(η) = Σ d y K(η) = Σ (1/n)·d^(5/3) |
| Sin subgrid | la celda es un plano a su cota media; la cara, la cota mayor de sus dos celdas con el n medio |
| Líneas de quiebre | las caras que cruzan la corona del jarillón o de la vía toman su cota (el efecto de alinear caras con la corona) |
| Continuidad | V^(n+1) = V^n + Δt·Σ Q de las caras, del borde y de la lluvia efectiva |
| Inercia local | Q^(n+1) = [Q^n − g·A·Δt·∂η/∂n] / [1 + g·A·Δt·\|Q^n\|/K²]; explícita, Δt ≤ C·Δx/(V + √(g·h)) o fijo |
| Aguas someras completas | la incógnita es la velocidad de la cara (Q = A·u); a la inercia local se suma la advección en la forma que conserva la cantidad de movimiento de Stelling y Duinmeijer (2003), con la velocidad del agua que entra a cada celda por todas sus caras; explícita |
| Onda difusiva | Q = β·(η_a − η_b), β = K/(Δx·√\|S\|) con \|S\| ≥ 10⁻⁵; implícita con peso θ; caras con menos de 1 cm de agua no conducen |
| Solución | sistema disperso (una fila por celda y una entrada por cara) resuelto por gradiente conjugado con Cholesky incompleto modificado, MIC(0); iteraciones hasta que el nivel cambie menos que la tolerancia (3 mm) o 20 veces |
| Balance | el volumen se actualiza con los caudales finales; ninguna celda entrega más de lo que tiene más lo que le llega. El caudal de salida de las series es el medio de cada intervalo de salida |
| Inestabilidad | se declara si los volúmenes oscilan con fuerza paso a paso en varias celdas o aparecen velocidades de más de 25 m/s |
| Rotura de presa | 1D: aguas someras completas (HLL) e inercia local frente a Ritter; 2D: las aguas someras de la sala dan 3,5 % de error y la inercia local 32,5 % |

Las opciones por omisión de HEC-RAS que se usan: θ = 1, tolerancia del nivel 0,01 pie (≈ 3 mm), 20 iteraciones y guía de Courant de 1 a 3 (completas) y hasta 5 (onda difusiva).

**En el valle**, con celdas de 10 m: onda difusiva 1478,051 m, inercia local 1478,042 m y aguas someras 1478,340 m en el puente. Las aguas someras suben el agua unos 30 cm porque cuentan las pérdidas por las curvas, la contracción y la expansión en el puente, que las otras dos no ven. La malla de 20 m refinada a 10 m en el cauce y el jarillón (949 celdas) da en el puente lo mismo que la de 10 m (2560 celdas) con un tercio de las celdas.

**Mapas de diagnóstico.** El Courant máximo de cada celda en la corrida y, con la onda difusiva, el error de la última iteración de cada celda y las celdas que no convergieron (como los mapas de errores de iteración de RAS Mapper).

**La escena.** La malla sobre el terreno (con sus celdas refinadas), las líneas de quiebre en amarillo y una celda marcada en naranja con el agua por dentro, que solo cubre sus píxeles más bajos. El agua se puede colorear por profundidad, velocidad, cota, amenaza, llegada, Courant o iteraciones, con partículas que siguen la corriente. **Experimentos:** la rotura de presa con sus errores; la referencia de 10 m frente a celdas de 20 y 40 m con y sin subgrid y la malla refinada; las tres ecuaciones en el valle.

## 5. Estructuras: el puente y la rotura del jarillón

**El puente.** En el terreno, el láser atraviesa el tablero o lo clasifica como estructura: un MDT ve el hueco del cauce y el terraplén, pero no el tablero. En el modelo, el puente se pone como una estructura sobre la línea de caras de x = 440 m (como una conexión 2D de HEC-RAS); el terraplén de la vía se quita del terreno bajo la estructura y sus caras usan las ecuaciones del puente:

| Régimen | Cálculo | Coeficientes |
|---|---|---|
| Flujo libre por la luz | la ecuación de la cara con una pérdida local k = (Cc + Ce)·(1 − (A_luz/A_sin obra)²) | contracción Cc = 0,3 y expansión Ce = 0,5 |
| A presión | compuerta (salida libre) u orificio (sumergido), mezclados ±5 cm alrededor de la cara inferior del tablero | Cd = 0,5 y 0,8 |
| Sobre la vía y el tablero | vertedero Q = C·L·H^1,5 con la sumersión de Villemonte (1947) | C = 1,66 en la vía y 1,44 en el tablero (unidades del SI) |

Se puede bajar la cara inferior del tablero y tapar parte de la luz con troncos y basura. Con la creciente de 100 años y celdas de 10 m: sin estructura 1478,04 m aguas arriba; con la luz libre 1478,21 m; con media luz tapada 1478,48 m; con el tablero a 1478,30 m y la luz tapada el agua pasa la cara inferior del tablero (flujo a presión) y llega a 1479,11 m.

**La rotura del jarillón.** El jarillón se rompe en una de cuatro abscisas (150, 225, 300 o 375 m) cuando el agua del lado del río pasa un nivel sobre su pie, o a una hora dada. La rotura se abre en un tiempo de formación: la brecha baja y se ensancha hasta el terreno natural con taludes laterales; en cada paso se recalculan las tablas de las celdas y caras afectadas y se conserva el volumen (el nivel se recalcula con el volumen guardado). El caudal por la rotura se mide en las caras entre el lado del río y el del barrio. En x = 300 m con la creciente de 100 años: empieza a los 24,9 min, se completa a los 34,9 min, pasan hasta 3,3 m³/s y el barrio queda con 12 749 m² de agua frente a 10 031 m² sin la rotura.

**Experimentos:** las variantes del puente (sin estructura, libre, tapado, tablero bajo) y de la rotura (abscisa, ancho, disparo y periodo).

## 6. Riesgo: incertidumbre, zonificación y daños

**Ensamble.** El caudal de 100 años sale de 30 años de registro: su error estándar por momentos es s/√n·√(1 + 1,1396·K + 1,1·K²) (Kite), ±10,7 m³/s. El n se toma con un error lognormal (±10, 15 o 25 %). El ensamble corre de 8 a 24 miembros con una semilla fija en una malla de 20 m refinada a 10 m en el cauce y el jarillón, y cada celda guarda la fracción de miembros que la mojan con más de 10 cm sobre su suelo (la mediana de sus píxeles): un mapa de probabilidad en vez de una mancha.

**Zonificación (ejercicio).** La intensidad de cada celda con la profundidad h, la velocidad v y su producto, con los umbrales de un estudio de amenaza del corredor del río Cauca (CVC) usados como ejemplo: baja si h ≤ 0,5 m, v ≤ 0,5 m/s y h·v ≤ 0,225 m²/s; media si h ≤ 1,0 m, v ≤ 0,8 m/s y h·v ≤ 0,45 m²/s; alta si pasa alguno de estos. La amenaza combina la intensidad con la creciente de 30 años (frecuente) y la de 100 años (rara): alta si con 30 años la intensidad es media o alta, o si con 100 años es alta; media si con 30 años es baja o con 100 años es media; baja si solo con 100 años es baja. Con este criterio el barrio queda con 500 m² en amenaza alta, 3461 m² en media y 7445 m² en baja. Cada estudio fija sus umbrales y su matriz; esto no es la zonificación de un plan de ordenamiento.

**Daños.** Una curva profundidad-daño residencial con la forma de las funciones globales del JRC para Suramérica (Huizinga y otros, 2017), ilustrativa: 0,49 del valor de la vivienda con 0,5 m de agua, 0,71 con 1 m y 1 desde 4 m. El daño de cada creciente se expresa en metros cuadrados de vivienda equivalentes (la profundidad en cada casa por su área y su fracción de daño). El daño anual esperado es el área bajo la curva daño–probabilidad anual de excedencia por la regla del trapecio, con siete periodos (2 a 500 años) y la cola del mayor. Con este valle: 308 m² con 100 años, 1697 m² con 500 años y 13,3 m² por año.

## 7. HEC-RAS 2D paso a paso

Diez pasos, cada uno con su sección de HEC-RAS:

1. Proyección (MAGNA-SIRGAS 2018 / Origen-Nacional, EPSG:9377; Resolución 370 de 2021 del IGAC).
2. Terreno.
3. Coberturas y n.
4. Área 2D, malla, líneas de quiebre y regiones de refinamiento.
5. Condiciones de borde.
6. Flujo no permanente.
7. Plan y opciones de cálculo (onda difusiva, inercia local o aguas someras completas).
8. Correr (preprocesador y cálculo, con su registro y el agua avanzando en la escena mientras calcula).
9. Resultados: profundidad, velocidad, cota, amenaza, llegada, Courant e iteraciones, con la reproducción en el tiempo, una sonda (tocar el agua: nivel, profundidad y velocidad en el tiempo), una línea de caudal norte-sur y el perfil longitudinal por el eje del cauce.
10. Comparar las corridas de la sesión y descargar.

Por omisión: LiDAR con el cauce levantado, n normales, celdas de 10 m con líneas de quiebre, creciente de 100 años, onda difusiva con Δt = 15 s, θ = 1, 3 mm y 20 iteraciones.

**Amenaza.** Clases H1 a H6 con los límites combinados de la guía 7-3 del Australian Institute for Disaster Resilience (2017):

| Clase | D·V | D | V |
|---|---|---|---|
| H1 | ≤ 0,3 | ≤ 0,3 | ≤ 2,0 |
| H2 | ≤ 0,6 | ≤ 0,5 | ≤ 2,0 |
| H3 | ≤ 0,6 | ≤ 1,2 | ≤ 2,0 |
| H4 | ≤ 1,0 | ≤ 2,0 | ≤ 2,0 |
| H5 | ≤ 4,0 | ≤ 4,0 | ≤ 4,0 |
| H6 | lo demás | — | — |

La profundidad de cada píxel es la cota del agua de su celda menos la cota del píxel (por eso el mapa es más fino que la malla). La velocidad es la de la celda, y D·V se toma en el instante del mayor producto de cada celda.

**Descargas.** Dos ZIP armados en el navegador:

- *Paquete para HEC-RAS*: el terreno a 1 m (GeoTIFF Float32), las coberturas (GeoTIFF de clases) con su tabla de n, el área 2D, las líneas de borde, las líneas de quiebre y, si las hay, las regiones de refinamiento (shapefiles con su .prj de EPSG:9377 y su .cpg), el hidrograma de entrada y las condiciones de borde (CSV) y un LEAME. **Las coordenadas son inventadas** (esquina suroeste en E 4 200 000, N 2 000 000 de EPSG:9377) para que se pueda armar el modelo en HEC-RAS; el valle no está en ningún lugar.
- *Resultados de la corrida*: la profundidad, la cota y la velocidad máximas (GeoTIFF) y las series de la corrida (CSV), con un LEAME.

## 8. Tu terreno

El mismo modelo sobre un terreno propio. Se carga un **GeoTIFF de una banda** (un MDT recortado a un sector pequeño, en un sistema proyectado en metros): lo lee el navegador con geotiff.js y **no sale del equipo**; no se piden cuentas ni claves. La sala toma el píxel, la esquina y el «sin dato» del archivo (los píxeles sin dato quedan como paredes); si tiene más de 360 000 píxeles los promedia por bloques, y si está en grados lo advierte. Se eligen las líneas de borde en los lados del rectángulo (la sala propone la salida en el lado con el punto más bajo y la entrada en el opuesto), el hidrograma, el n y el número de curva uniformes, la lluvia, el tamaño de las celdas y las ecuaciones, y se calcula con el botón. Hay una cañada de ejemplo inventada (360 × 240 m, píxel de 2 m) que se puede usar o descargar. Los resultados se descargan como el ZIP de resultados con la georreferencia del archivo cargado.

Límites: n y número de curva uniformes, líneas de borde solo en los lados, sin estructuras. Es una primera aproximación, no un estudio de amenaza.

## 9. La escena: el agua, el tiempo y las herramientas

Lo que se ve en las ocho partes sale de la misma escena (`three/valleyWorld.ts`).

**El agua.** Con la capa «Aspecto», el agua de los resultados se ve como una creciente: turbia (de ocre claro donde hay poca a café oscuro donde pasa de 3 m), con ondas que avanzan en la dirección y a la velocidad de cada punto, espuma donde el número de Froude pasa de 0,85 y en la orilla, y reflejo del cielo. Las otras capas colorean un dato (profundidad, velocidad, cota, amenaza H1–H6, llegada, Courant, error de iteración, probabilidad o zona) y bajan las ondas y la espuma para que el color se lea. Las ondas y la espuma cambian solo el color y la luz de la superficie: la lámina queda a la cota que calculó el modelo. Sin corrida, el cauce del valle lleva su caudal base (0,5 m sobre el fondo).

**El tiempo.** En las partes con una corrida guardada mapa a mapa (cada minuto), una barra de tiempo reproduce la creciente a 1, 3 u 8 minutos de creciente por segundo, lleva a cualquier instante o vuelve a los máximos. Entre dos mapas guardados el nivel, la velocidad y el caudal de las caras se interpolan, así el agua avanza sin saltos. Al reproducir:

- donde el agua ya pasó y bajó queda barro;
- los muros de las casas guardan la mancha del nivel más alto que alcanzó el agua hasta ese momento;
- la lluvia cae con la intensidad del hietograma en ese minuto y el cielo se oscurece con ella;
- el jarillón se abre en la rotura entre el minuto en que el modelo la disparó y el minuto en que la completó;
- los rótulos del puente y de la rotura dicen el nivel, el caudal y el estado de la obra en ese instante;
- en las gráficas del tiempo, una línea marca el instante y arrastrar sobre ellas lleva la reproducción a ese minuto.

**Las herramientas.** Al pasar el ratón por la escena, una lectura da la cobertura, la cota del suelo (y la que ve el modelo si es distinta) y, con una corrida, la profundidad, la velocidad y el nivel del agua en ese punto y en ese instante, más el dato de la capa (clase de amenaza, minuto de llegada, Courant, error de iteración, probabilidad o zona). Un clic pone la sonda (en «Paso a paso» y «Tu terreno»), elige la celda (en «La malla y las ecuaciones») o suelta tinta: 120 partículas que la corriente del instante lleva y dispersa durante 50 s. Las partículas que siguen la corriente dejan una estela que se desvanece; van 6 veces más rápido que el agua y la escena lo dice.

**Por parte.** En «La malla y las ecuaciones», flechas en las caras de la celda marcada dan el caudal que entra (azul) y sale (naranja) en el instante, con su valor. En la calibración, cada marca de agua es un poste con una franja roja a la cota observada y un anillo azul a la del modelo. En «Riesgo», los miembros del ensamble se pueden pasar uno a uno, de la menor a la mayor inundación del barrio, para ver de dónde sale la probabilidad. Las casas tienen ventanas y techos de teja (la escuela, de zinc); el puente, vigas de borde, barandas y el asfalto con su eje; la vía, sus líneas.

## 10. El cálculo en un hilo aparte

Las corridas se calculan en un Web Worker (hasta dos a la vez) para que la página siga respondiendo; mientras calcula, el hilo manda cada ~140 ms el mapa de niveles y la escena muestra el agua avanzando. El hilo se prueba apenas carga la sala; si el navegador no deja crearlo o no responde, las corridas se calculan a ratos en la página (y si el hilo responde después, las siguientes van al hilo). Las últimas corridas se guardan para no repetirlas al volver a una parte. El hilo va dentro del mismo archivo de la aplicación.

## 11. Herramientas de diseño

| Parte | Calculadora | Prediseño o adicional |
|---|---|---|
| Terreno | capacidad de un cauce trapecial visto con píxeles | resolución del terreno y de la malla, pasos de tiempo |
| Coberturas | n por el método de Cowan | n compuesto de una cara (por área, Horton-Einstein y por conducción); ajuste con marcas de agua |
| Crecientes | Gumbel por momentos con una serie | periodo de retorno según el riesgo; hidrograma de entrada; escorrentía con el número de curva |
| Ecuaciones | paso de tiempo por Courant | tamaño de la malla y trabajo; volumen de una celda con subgrid |
| Estructuras | vertedero sobre la vía (Villemonte) | el puente a presión; rotura del jarillón |
| Riesgo | daño anual esperado | zona de amenaza de un punto (ejercicio); incertidumbre del caudal de diseño |
| Modelo | balance de volumen de una corrida | lista de chequeo del modelo |
| Tu terreno | la malla de tu terreno | revisión del terreno |

## 12. Verificación

`npm run test:model2d` ejecuta veintiocho pruebas (M1 a M28):

- M1: la curva cota-volumen de las celdas y su inversa contra la suma píxel por píxel.
- M2: el promedio conserva la cota media y pierde capacidad del cauce.
- M3: el MDS tapa la luz del puente, el máximo conserva la corona y el cauce levantado devuelve la capacidad.
- M4: las tablas de las caras y K = b·h^(5/3)/n en una cara plana.
- M5: el lago en reposo con los dos esquemas.
- M6: la conservación del volumen.
- M7: Ritter.
- M8: Gumbel y riesgo.
- M9: la onda difusiva frente a la inercia local.
- M10: la inestabilidad del explícito y los pasos largos del implícito.
- M11: el flujo permanente.
- M12: el subgrid con celdas de 40 m y el terreno de 30 m.
- M13: las clases de amenaza.
- M14: la robustez de las herramientas.
- M15: las escenas y los retos (ninguno se cumple con los valores por omisión y todos tienen solución).
- M16: la malla refinada (lago en reposo, volumen, balance 2:1 y el puente frente a la malla fina).
- M17: la rotura de presa en 2D con las aguas someras completas.
- M18: la lluvia sobre la malla con el número de curva.
- M19: la rotura progresiva del jarillón.
- M20: el puente como estructura (libre, a presión y vertedero con Villemonte).
- M21: las tres ecuaciones en el mismo valle.
- M22: el ensamble y el mapa de probabilidad.
- M23: la calibración con marcas de agua.
- M24: la curva de daño y el daño anual esperado.
- M25: la intensidad y la zonificación.
- M26: el GeoTIFF, el shapefile y el ZIP para HEC-RAS.
- M27: un terreno propio leído, mallado y corrido.
- M28: los mapas de diagnóstico.

Además, `tools/verificacion/superposiciones.py` recorre las ocho partes en escritorio, portátil, tableta y teléfono y revisa que los elementos flotantes no se monten ni queden cortados.

## Fuentes

- Chow, V. T. (1959). *Open-Channel Hydraulics*. McGraw-Hill.
- Chow, V. T., Maidment, D. R. y Mays, L. W. (1988). *Applied Hydrology*. McGraw-Hill.
- U.S. Army Corps of Engineers, Hydrologic Engineering Center. *HEC-RAS 2D User's Manual* y *Hydraulic Reference Manual*.
- Bates, P. D., Horritt, M. S. y Fewtrell, T. J. (2010). A simple inertial formulation of the shallow water equations for efficient two-dimensional flood inundation modelling. *Journal of Hydrology*, 387.
- Stelling, G. S. y Duinmeijer, S. P. A. (2003). A staggered conservative scheme for every Froude number in rapidly varied shallow water flows. *International Journal for Numerical Methods in Fluids*, 43.
- Villemonte, J. R. (1947). Submerged-weir discharge studies. *Engineering News-Record*.
- USDA Natural Resources Conservation Service (1986). *Urban Hydrology for Small Watersheds* (TR-55).
- Huizinga, J., de Moel, H. y Szewczyk, W. (2017). *Global flood depth-damage functions*. JRC, Comisión Europea.
- Australian Institute for Disaster Resilience (2017). *Guideline 7-3: Flood Hazard*.
- IGAC, Resolución 370 de 2021 (MAGNA-SIRGAS 2018 / Origen-Nacional).

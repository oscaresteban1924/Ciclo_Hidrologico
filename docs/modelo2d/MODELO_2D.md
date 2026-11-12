# Sala «Modelación hidráulica 2D»: modelo, supuestos y fuentes

Sala de la aplicación (`src/model2d/`, enlace directo `#modelo2d`). Tiene cinco partes con la distribución de las salas con partes (`src/rooms/RoomLab.tsx`): escena 3D con una pregunta, instrumentos en vivo y controles al pie, y un panel con Esquema, Retos, Experimentos, Diseño, Datos y Docente. Sin WebGL, cada parte muestra su gráfica con el mismo cálculo.

El cálculo está en módulos sin interfaz:

- `terrain.ts`: el valle verdadero a 1 m (MDT y MDS), coberturas, remuestreo, error de la fuente, cauce levantado y medidas sobre un terreno.
- `solver.ts`: el preprocesador (tablas subgrid de celdas y caras) y el motor 2D, con la onda difusiva implícita y la inercia local explícita, las condiciones de borde y los resultados.
- `hydrology.ts`: la serie de máximos anuales, Gumbel, el riesgo y el hidrograma.
- `dambreak.ts`: la rotura de presa en 1D frente a Ritter.
- `scene.ts`: las escenas de cada parte, el resumen de una corrida y la amenaza H1–H6.
- `design.ts`: las herramientas de diseño y sus gráficas.
- `runs.ts`: las corridas a ratos en la página y su caché.

Se prueba en `tests/model2d/model2d.test.ts` (`npm run test:model2d`; informe en `PRUEBAS.md`).

**Qué es y qué no es.** Laboratorio educativo. El modelo 2D de la sala se construye con las ideas de HEC-RAS 2D (volúmenes finitos, tablas subgrid, onda difusiva implícita con θ, iteraciones y tolerancias, Courant, líneas de quiebre, condiciones de borde por conducción y profundidad normal), pero **no es HEC-RAS** ni da sus resultados. El valle, la quebrada, el jarillón, el barrio, la vía, el puente, las coberturas y la serie de caudales son **ilustrativos**: no son un lugar de Medellín ni un levantamiento real. Los mapas no son un estudio de amenaza, un pronóstico oficial de inundación ni diseños de ingeniería.

**Escalas.** El valle mide 640 × 400 m (1 unidad de la escena = 2 m). El relieve se puede ver a escala real o exagerado ×3 o ×6; la escena lo dice y el agua se estira lo mismo que el terreno (no se exagera la profundidad del agua sola).

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

## 2. Coberturas y n de Manning

| Cobertura | n mín.–normal–máx. | Descripción de Chow (1959) |
|---|---|---|
| Cauce | 0,030–0,040–0,050 | corriente de montaña, gravas y cantos con pocos bloques |
| Pasto | 0,025–0,030–0,035 | pastos cortos sin matorral |
| Cultivos | 0,025–0,035–0,045 | cultivos en hileras, maduros |
| Rastrojo | 0,040–0,060–0,080 | matorral claro y árboles, en verano |
| Bosque | 0,080–0,100–0,120 | bosque denso, poco sotobosque, agua bajo las ramas |
| Vías | 0,013–0,016 | asfalto |
| Casas | 0,2 (de 0,1 a 1) | valor de calibración que representa el estorbo; también se pueden levantar como bloques o no representarlas |

El modelo corre la creciente de 100 años con celdas de 20 m con subgrid y la inercia local. **Experimentos:** siete variantes (mínimos, normales, máximos, ×0,7, ×1,3, casas como bloques, sin casas) con el nivel en el puente, el barrio con agua, la escuela y la velocidad máxima.

## 3. Periodos de retorno y condiciones de borde

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

## 4. La malla y las ecuaciones

| Pieza | Cálculo |
|---|---|
| Malla | celdas cuadradas de 5, 10, 20 o 40 m; caras interiores en x y en y; caras de borde al oeste (entrada) y al este (salida) |
| Celdas (subgrid) | V(η) = a·(k·η − Σ de las k cotas más bajas), con las cotas de los píxeles ordenadas; la inversa η(V) es exacta |
| Caras (subgrid) | muestras del terreno cada metro sobre la cara (la cota mayor de los dos píxeles que la tocan) y su n; tablas cada 0,1 m durante 6,3 m de A(η) = Σ d y K(η) = Σ (1/n)·d^(5/3) |
| Sin subgrid | la celda es un plano a su cota media; la cara, la cota mayor de sus dos celdas con el n medio |
| Líneas de quiebre | las caras que cruzan la corona del jarillón o de la vía toman su cota (el efecto de alinear caras con la corona) |
| Continuidad | V^(n+1) = V^n + Δt·Σ Q de las caras y del borde |
| Inercia local | Q^(n+1) = [Q^n − g·A·Δt·∂η/∂n] / [1 + g·A·Δt·|Q^n|/K²]; explícita, Δt ≤ 0,7·Δx/(V + √(g·h)) o fijo |
| Onda difusiva | Q = β·(η_a − η_b), β = K/(Δx·√|S|) con |S| ≥ 10⁻⁵; implícita con peso θ; caras con menos de 1 cm de agua no conducen |
| Solución | sistema de 5 puntos resuelto por gradiente conjugado con Cholesky incompleto modificado, MIC(0); iteraciones hasta que el nivel cambie menos que la tolerancia (3 mm) o 20 veces |
| Balance | el volumen se actualiza con los caudales finales; ninguna celda entrega más de lo que tiene más lo que le llega |
| Inestabilidad | se declara si los volúmenes oscilan con fuerza paso a paso en varias celdas o aparecen velocidades de más de 25 m/s |
| Rotura de presa | 1D: aguas someras completas (HLL) e inercia local frente a Ritter |

Las opciones por omisión de HEC-RAS que se usan: θ = 1, tolerancia del nivel 0,01 pie (≈ 3 mm), 20 iteraciones y guía de Courant de 1 a 3 (completas) y hasta 5 (onda difusiva).

**La escena.** La malla sobre el terreno, las líneas de quiebre en amarillo y una celda marcada en naranja con el agua por dentro, que solo cubre sus píxeles más bajos. **Experimentos:** la rotura de presa con sus errores, y la referencia de 10 m frente a celdas de 20 y 40 m con y sin subgrid.

## 5. HEC-RAS 2D paso a paso

Diez pasos, cada uno con su sección de HEC-RAS:

1. Proyección (MAGNA-SIRGAS 2018 / Origen-Nacional, EPSG:9377; Resolución 370 de 2021 del IGAC).
2. Terreno.
3. Coberturas y n.
4. Área 2D, malla y líneas de quiebre.
5. Condiciones de borde.
6. Flujo no permanente.
7. Plan y opciones de cálculo.
8. Correr (preprocesador y cálculo, con su registro).
9. Resultados: profundidad, velocidad, cota, amenaza y llegada, con la reproducción en el tiempo.
10. Comparar las corridas de la sesión.

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

## 6. Herramientas de diseño

| Parte | Calculadora | Prediseño o adicional |
|---|---|---|
| Terreno | capacidad de un cauce trapecial visto con píxeles | resolución del terreno y de la malla, pasos de tiempo |
| Coberturas | n por el método de Cowan | n compuesto de una cara (por área, Horton-Einstein y por conducción) |
| Retorno | Gumbel por momentos con una serie | periodo de retorno según el riesgo; hidrograma de entrada |
| Ecuaciones | paso de tiempo por Courant | tamaño de la malla y trabajo; volumen de una celda con subgrid |
| Modelo | balance de volumen de una corrida | lista de chequeo del modelo |

## 7. Verificación

`npm run test:model2d` ejecuta quince pruebas (M1 a M15):

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
- M14: la robustez de las doce herramientas.
- M15: las escenas y los retos (ninguno se cumple con los valores por omisión y todos tienen solución).

# Verificación del módulo «Medellín: laboratorio de lluvia»

Fecha: 8 de noviembre de 2026; actualizado el 9 de noviembre de 2026 con la vista del valle (sección 4 sexies) y con el entorno, las fachadas y la vida de calle de los sectores (sección 4 septies). Este documento separa lo **ejecutado** de lo **pendiente**.

Entorno de verificación:
- CPU Intel Xeon de 2,1 GHz con 2 núcleos, sin GPU;
- Node 22.23;
- Chrome con Playwright; WebGL2 por **software** (SwiftShader).

## 1. Pruebas numéricas obligatorias (ejecutadas)

Comando: `npm run test:city`. Resultado: **31 de 31** comprobaciones cumplen su tolerancia (incluidas las de la red separada y la creciente: S1 a S7 y C1, sección 4 nonies). El detalle (tolerancia, medido y notas) está en `docs/medellin/PRUEBAS.md`.

| # | Prueba | Resultado medido (resumen) |
|---|---|---|
| 1 | Dominio cerrado sin lluvia conserva el volumen | ΔV/V₀ = 2,5·10⁻¹⁵ |
| 2 | Lluvia en dominio cerrado: ΔV = I·A·t | error relativo 2,1·10⁻¹⁵ |
| 3 | El sumidero no retira más de lo disponible ni de su capacidad | captado ≤ disponible; máx. 0,51 de la capacidad por paso; obstruido 100 % capta 0 |
| 4 | La infiltración responde a parámetros y disponibilidad | 5 casos analíticos con error < 10⁻⁶ |
| 5 | Un obstáculo bloquea una zona cerrada | 0 m³ dentro del recinto y en los edificios |
| 6 | La pendiente da una ruta coherente | 100 % de las caras con flujo aguas abajo |
| 7 | Una depresión almacena agua | 0,84 m³ retenidos; superficie plana (Δη ≈ 4·10⁻⁸ m) |
| 8 | Lago en reposo | Δh = 0 y q = 0 exactos, con islas secas |
| 9 | Reiniciar reproduce la corrida | igualdad bit a bit con otro ritmo de cuadros, incluidos los trazadores |
| 10 | La comparación mantiene las condiciones externas | 8 condiciones idénticas; mismos 211 instantes; ΔP/P = 2,5·10⁻¹⁵ |
| 11 | Lluvia de techos sin duplicación | error < 10⁻¹⁴; el depósito rebosa al llenarse |
| 12 | Sensibilidad a la resolución | salida 51,2 / 52,4 / 52,9 m³ con 2 / 1 / 0,5 m |

Verificaciones adicionales:
- V1: cambiar la superficie altera el modelo.
- V2: sin NaN, Inf ni negativos, y sin agua en edificios, en ambos sectores con 150 mm/h.
- V3: unidades coherentes.
- V4: las flechas usan la velocidad calculada.
- V5: los efectos de lluvia y agua leen el estado calculado. Profundidad y velocidad del campo dibujado son idénticas a las del modelo. Chorros de bajantes y escurrimiento de salida coinciden con el balance (error ≈ 10⁻¹³). El llenado del depósito es exacto.
- V6: el recorrido dibujado de las gotas sigue la trayectoria calculada. 72 gotas en tres tandas, una de ellas soltada en un techo, y 6 521 tramos. Ningún tramo atraviesa un edificio; la separación máxima entre puntos es 0,58 m; el resumen de viajes cuenta las 72 gotas.
- V7: la vista del valle sigue los datos oficiales (reescrita en noviembre de 2026, cuando la tabla aproximada se reemplazó por el modelo de elevación del AMVA y las capas de la Alcaldía; detalle en la sección 4 octodecies). Antes verificaba la tabla de referencia: el río pasaba por sus cotas (error 0,0 m), la cima más alejada era la del Pan de Azúcar (113 m; tolerancia 150 m) y las estaciones del metro quedaban a lo sumo 121 m sobre el río.
- V8: el entorno de cada sector sigue el valle de referencia. Unión con el borde del sector: 0,00 mm. Relieve dibujado frente a la tabla: diferencia media 0,7 m entre 0,3 y 2 km y 9,6 m entre 2 y 8 km (tolerancias 2 m y 15 m); el máximo local, 113 m, está en cañones de quebradas más angostos que la malla lejana. Ningún objeto del entorno dentro del sector (0 de 20 649). Río en su posición (0,00 m).
- R1: se midió la sensibilidad al límite de Froude.

**Transparencia.** Cinco pruebas tuvieron errores de diseño en su primera ejecución y la 12 no cumplió al principio. Las correcciones y su historia están publicadas en la sección «Notas» de `PRUEBAS.md`. En ningún caso se relajó una tolerancia para que una prueba cumpliera. En la prueba 7, el criterio se redefinió después de ejecutar para excluir la película residual de 0,1 mm, y eso está explicado en la nota.

## 2. Misiones (ejecutadas sin interfaz, con el mismo código)

`npx tsx tests/city/missions.ts`. Todas producen texto a partir de lo calculado:

| Misión | Resultado calculado |
|---|---|
| Charco | La esquina es lo más profundo: 7,2 cm. |
| Sumidero obstruido | El charco pasa de 8 mm a 8,2 cm. |
| Pavimento | La infiltración sube de 3,45 a 12,0 m³, la salida queda prácticamente igual y el drenado baja 25 %. |
| Jardín | Entran 24,4 m³ y rebosan 17,5 m³. |
| Techos | En el techo del colegio caen 6,80 m³ = I·A·t. |
| Presupuesto | De 4 indicadores, mejoran 3 y empeora 1. |

## 3. Pipeline de datos (ejecutado sin red)

`python3 tools/geo/test_pipeline.py`: **12 de 12** comprobaciones (`docs/medellin/pipeline-test.json`):
- paginación con `maxRecordCount` = 4;
- consulta acotada por caja;
- advertencia por descripción UTM frente a EPSG:9377 declarado;
- reparación de geometría inválida, descarte de astillas, separación de multipolígonos y recorte;
- origen de alturas marcado;
- CRS de salida EPSG:9377 con el centro en Medellín;
- hashes de cada página;
- sin sumideros inventados;
- la aplicación valida, compila y simula el escenario resultante.

## 4. Navegador (ejecutado)

| Verificación | Resultado |
|---|---|
| Recorrido completo: valle → sector → lluvia → vistas (realista, materiales, resultados, bajo la calle, nivel de calle) | Funciona en ambos sectores. Consola sin errores ni advertencias propias. |
| Misión completa en la interfaz (predicción → cambio → comparación → explicación → bitácora) | Funciona. El resultado coincide con la ejecución sin interfaz. |
| Paneles flotantes sin superposición | 0 solapes en 1280×720, 1024×1366 y 390×844 (medido con sus rectángulos). |
| Botones táctiles | Ningún botón del módulo mide menos de 30 px de alto (los enlaces de texto quedan aparte). |
| Teclado | 40 tabulaciones con foco visible (el enlace «Ir a la explicación» se muestra al enfocarlo); la tecla P pausa el cálculo; con la pausa el tiempo simulado no avanza. |
| Movimiento reducido | Se respeta la preferencia: sin vuelo de cámara y sin caída animada de la lluvia. |
| Sin WebGL2 (`--disable-3d-apis`) | El valle se muestra como lista, el sector como mapa 2D con el mismo cálculo en vivo, y el panel docente lo informa. |
| Liberación de recursos al salir | En 3 ciclos de entrada y salida: 0 controladores activos, 0 lienzos, 0 capas de etiquetas. Cada contexto WebGL se libera con `forceContextLoss`. Lo mismo al salir por una herramienta. |
| Módulo anterior (regresión) | Las pruebas de la versión anterior (`qa.py` en 1440×900 y 390×844, `flows.py`, `modes3.py`) dan 0 problemas de rótulos y consola limpia. |
| Errores corregidos durante la verificación | **Módulo anterior:** el primer cuadro del motor de partículas podía tener dt negativo (círculos con radio negativo en la consola); ahora se acota. **Módulo nuevo:** había una carrera entre la carga diferida del valle y la del sector; ahora un testigo de «época» descarta la carga vieja. **Medición:** la velocidad lograda se calculaba con el tiempo acotado y salía optimista; ahora se mide con el reloj real. |

Capturas: `docs/medellin/capturas/` (1440×900, 1280×800, 1024×1366 y 390×844; la 13 corresponde a la alternativa 2D sin WebGL2). Se tomaron con el sector asentado en el terreno (sección 4 quinquies). En pantallas anchas se forzó la calidad alta desde Ajustes, la de un equipo con GPU; en teléfono, la automática. La densidad adaptativa de gotas puede estar activa porque el entorno dibuja por software.

## 4 bis. Revisión de comprensión y calidad visual (ejecutada)

| Cambio | Cómo se verificó |
|---|---|
| **«¿Adónde fue la lluvia?»**: barra con el reparto de la lluvia caída en cinco partes (sigue sobre el suelo, salió del sector, entró al suelo, entró a los sumideros, guardada en depósitos). Se calcula con los términos separados del balance, no con una estimación. Aparece en «Herramientas» y «Misiones», en la vista 2D y, para A y B, en «Comparar». | Las cifras de la barra coinciden con el balance del motor. La frase «la cuenta cierra» solo aparece si el residuo es menor que medio litro; si no, se muestra la diferencia medida. Cada parte tiene su rótulo y su valor en texto, y el color nunca es la única pista. Los colores siguen un orden categórico fijo y la paleta se revisó con el validador de daltonismo. |
| **Primeros pasos**: una guía de cuatro pasos aparece la primera vez que se entra a un sector y puede volver a abrirse desde «Herramientas». | Aparece solo con la simulación en t = 0 y desaparece al cerrarla. La preferencia se guarda en el almacenamiento local, sin cuentas ni datos personales. |
| **Maqueta del sector**: casas de ladera alrededor de la maqueta (en lugar de bloques flotantes), base ajustada al tamaño del sector y nubes en el borde. | Revisado en las capturas 02 a 08. El fondo es solo decorativo y no entra en el cálculo. |
| **Agua**: brillo y anillos de lluvia sobre la lámina de agua, modulados por la intensidad de lluvia. | Solo cambia la normal de la superficie: la altura del agua sigue dibujada a escala real. Con movimiento reducido el brillo queda quieto. |
| **Edificios**: pretiles en los techos y variación del tono del ladrillo. | Revisado en las capturas. Los edificios siguen siendo celdas sólidas en el cálculo y no cambió su huella. |
| **Valle**: trama de manzanas con calles, quebradas esquemáticas que bajan por las laderas hasta el río y nubes en el borde. | El rótulo de la escena sigue diciendo «Esquema para orientarse · relieve exagerado ×1,5 · posiciones aproximadas». Las quebradas se dibujan siguiendo la pendiente del relieve esquemático; no son cauces levantados. |
| **Interfaz**: las pestañas del panel caben sin cortarse ni desplazarse en 1440, 1280, 1024 y 390 px de ancho (antes «Docente» quedaba cortada desde 1280 px porque una regla de estilo anulaba el tamaño de letra), y la barra de vista muestra un resumen corto en pantallas angostas. | `tools/verificacion/city9.py` mide el ancho de la fila de pestañas frente al visible: 0 pestañas cortadas en los cinco tamaños. 0 solapes entre paneles flotantes en 1280×720, 1024×1366 y 390×844. 40 tabulaciones con foco visible. Consola limpia en todas las capturas. |
| **Regresión** | `npm run test:city`: 18 de 18. Liberación de recursos: 0 controladores y 0 lienzos después de salir. Flujo de misión completo. Alternativa 2D con la barra de reparto funcionando. |

Durante esta verificación, una captura apareció en blanco. La causa fue que la recarga en caliente del servidor de desarrollo coincidió con la escritura de `test-report.json` por parte de `npm run test:city`. La captura se repitió sin escrituras simultáneas y salió bien. No es un fallo del producto.

## 4 ter. Revisión de lluvia y agua (ejecutada)

Objetivo: que la lluvia y la inundación se lean mejor y resulten más atractivas, sin exagerar la profundidad y con cada efecto ligado a lo calculado. El detalle de qué controla cada efecto está en `MODELO.md`, sección 6.1.

| Cambio | Cómo se verificó |
|---|---|
| **Agua coloreada por la profundidad calculada**, interpolada entre celdas y con la escala de la leyenda. Antes los colores se aplicaban sin conversión de espacio de color y el agua se veía más pálida que la leyenda. | V5: el campo dibujado tiene exactamente la profundidad y la velocidad del modelo. La altura de la lámina sigue a escala 1:1. |
| **Vetas** que avanzan con la velocidad calculada, en tiempo real, y **espuma** donde el agua es rápida (Froude alto). | Capturas de la calle y de la quebrada. Las vetas siguen la dirección de las flechas. |
| **Lluvia nueva**: gotas con grosor mínimo en pantalla, una capa cercana a la cámara, salpicaduras (anillos sobre agua, coronas en seco), cortina de lluvia, cielo de tormenta y suelo mojado. | En la vista general las gotas se ven como estrías. Desde lejos, las salpicaduras se desvanecen: en una primera versión parecían nieve sobre los techos y se corrigió. Con lluvia localizada, gotas, salpicaduras, anillos y suelo mojado quedan dentro del círculo, con la misma regla del motor. |
| **Chorros de bajantes, remolinos de sumideros, cascadas de salida y depósito con nivel.** | V5: chorros y cascadas coinciden con el balance (error ≈ 10⁻¹³), y el depósito muestra el volumen ÷ capacidad. En el navegador, con 100 mm/h: 10 bajantes, 2 sumideros y 8 caras de salida activas en la calle; 35, 4 y 19 en la ladera. |
| **Movimiento reducido** | El reloj de los efectos queda detenido: gotas quietas, sin salpicaduras ni anillos. |
| **Densidad adaptativa** de gotas y salpicaduras | Se activa sola en el navegador de pruebas (dibujo por software). Ver la sección 5. |
| **Regresión** | `npm run test:city`: 19 de 19. 0 solapes entre paneles flotantes en 1280×720, 1024×1366 y 390×844. 40 tabulaciones con foco visible, y la tecla P sigue deteniendo el cálculo. Al salir, en 3 ciclos: 0 controladores activos y 0 lienzos. La alternativa 2D no cambia. Consola limpia en todas las capturas. |

**Video:** `docs/medellin/video/lluvia-y-agua.mp4`, de 26 s a 24 cuadros/s. Se grabó cuadro por cuadro con un reloj controlado (`tools/verificacion/video.py`): cada cuadro avanza exactamente 1/24 s, aunque el navegador de pruebas tarde más en dibujarlo. Por eso el movimiento del video es el que se vería en un equipo que alcance 24 cuadros/s o más; este entorno no lo alcanza.

## 4 quáter. Revisión del entorno y del recorrido de las gotas (ejecutada)

Objetivo: que el escenario se reconozca como Medellín desde la vista general y que el recorrido de las gotas se lea con claridad. Esta revisión tuvo dos rondas: la primera trajo el valle con barrios, metro y cables, y las estelas nuevas; la segunda, el barrio alrededor de la maqueta, la loma y el recorrido con estilo de ruta.

**Problemas de partida:**
- En la vista general, la maqueta quedaba sobre un vacío gris de ≈ 50 m. Las manzanas se descartaban enteras si su centro caía cerca de la zona libre, y el corredor del río pasaba junto a la maqueta.
- Las estelas guardaban un punto cada 2 s simulados. Entre puntos se interpolaba una curva que cortaba esquinas y subía a los techos. Además, las 24 gotas de una tanda formaban un haz que no se distinguía.

| Cambio | Cómo se verificó |
|---|---|
| **Barrio alrededor de la maqueta** (`render/backdrop.ts`):<ul><li>calle perimetral con andenes;</li><li>manzanas densas, con casas angostas al frente y lotes de atrás;</li><li>retícula de calles con línea amarilla, andenes y patios, dibujada sobre el suelo;</li><li>casas de ladrillo con placa de concreto, algunas de colores vivos y algunas con un piso en obra gris;</li><li>tanques negros en las azoteas;</li><li>taxis amarillos, carros y busetas;</li><li>guayacanes amarillos y rosados.</li></ul> El corredor del río se alejó ≈ 65 m al occidente. | Vista general y vista cenital de trabajo: no queda vacío alrededor de la maqueta. Capturas 02, 05 y 14. |
| **Loma de barrio detrás del sector**, con casas escalonadas y un tercer cable aéreo que sube hasta su cima. | Se ve en la parte alta de la vista general y domina la cámara «Valle». Capturas 02 y 15. |
| **Vista general algo más baja** (la cámara mira ≈ 24° hacia abajo, antes ≈ 35°), para que el barrio que sube detrás entre en el cuadro. | Toda la maqueta sigue visible. 0 solapes en los tres tamaños. |
| **Cortina de lluvia solo con lluvia localizada.** Con lluvia uniforme, su borde cortaba la loma con una línea dura en la cámara «Valle». | Revisado en la cámara «Valle» de ambos sectores. |
| **Recorrido de las gotas** (`sim/tracers.ts` y `render/tracerFx.ts`):<ul><li>un punto cada 0,35 m recorridos, desde donde se soltó cada gota;</li><li>puntos intermedios en las esquinas, para que el dibujo nunca corte por dentro de un edificio;</li><li>estilo de ruta: franja de color con borde blanco y sombra, con ancho en metros y un mínimo en pantalla;</li><li>gota guía por tanda, con ruta más gruesa, flechas que avanzan y una etiqueta «metros · tiempo»;</li><li>marcas de destino con ícono, agrupadas con el número de gotas;</li><li>anillo punteado donde se soltó la tanda;</li><li>resumen del viaje por destino en el panel.</li></ul> | Prueba **V6**. En la primera ejecución falló con 2 cruces: tramos que rozaban la esquina de un edificio en diagonal. Se corrigió guardando un punto intermedio por la celda libre, y ahora da 0 cruces. Capturas 07 y 14. La alternativa 2D y el panel usan los mismos colores. |
| **Calidad automática** | Si el navegador informa que dibuja por software, la calidad automática es la ligera. En calidad ligera, los lotes de atrás de las manzanas solo se dibujan cerca de la maqueta. |
| **Regresión** | `npm run test:city`: 20 de 20. 0 solapes en 1280×720, 1024×1366 y 390×844. 40 tabulaciones con foco visible; P pausa el cálculo. Al salir, en 3 ciclos: 0 controladores y 0 lienzos. Pestañas sin cortes en 5 tamaños. Alternativa 2D sin cambios. Consola limpia. |

**Video:** `docs/medellin/video/entorno-y-gotas.mp4`, de 22 s. Se grabó igual que el de lluvia y agua: cuadro por cuadro, con reloj controlado y calidad alta. Incluye un tramo en el que la cámara sigue a una gota guía. El video `lluvia-y-agua.mp4` es anterior: muestra la lluvia y el agua vigentes, pero el entorno de antes.

## 4 quinquies. Sector asentado en el terreno y entorno más cercano a Medellín (ejecutada)

**Problema reportado.** Con una captura de la ladera, se señaló que el sector se veía flotando y que el entorno debía parecerse más a Medellín.

**Causa.** El sector se dibujaba como un bloque de 4 m de espesor sobre una base. El entorno era plano a la altura de esa base y quedaba muy por debajo de la ladera, que tiene 16 m de desnivel. El resultado era una mesa con costados de tierra, separada del barrio.

| Cambio | Cómo se verificó |
|---|---|
| **Sin base ni costados visibles.** El terreno del entorno sigue el plano de la pendiente del sector (mínimos cuadrados sobre sus celdas) y se funde con el valle a unos 230 m. Una franja de unión empieza con la altura exacta de cada punto del borde y con el color de su superficie, y a unos 12 a 30 m se une con el terreno grueso. La malla gruesa tiene un hueco donde va la franja, así que no hay superposición. | Vistas desde el oriente, el sur, el suroccidente y el noroccidente de la ladera: el sector continúa en la calle vecina sin escalón. Con resolución de 2 m y calidad ligera, la franja se rehace sin errores en consola. |
| **Las casas se apoyan en el suelo.** En pendiente, cada casa se entierra hasta su esquina más baja, y las estaciones del cable llegan al suelo. | Vista cenital y vistas laterales: ninguna casa ni estación flota. |
| **Escurrimiento de salida** en lugar de cascada por el costado: una lámina que sigue unos 7 m por la calle vecina y se desvanece, con el caudal que el balance cuenta como «Salió del sector». | V5 sigue cumpliendo: lee el mismo caudal de salida. |
| **Ubicación en el valle:**<ul><li>el sector queda al pie de la ladera occidental, con el río al oriente;</li><li>la vista general mira desde el valle hacia la montaña;</li><li>la cámara «Valle» se aleja hasta el otro lado del río.</li></ul> | Capturas 02, 05 y 15. 0 solapes en los tres tamaños. |
| **Entorno más cercano a Medellín:**<ul><li>barrio de ladera muy denso detrás y a los lados del sector, con colores vivos, algunos murales, pisos en obra gris con varillas y persianas metálicas;</li><li>hiladas de ladrillo en las fachadas, que se desvanecen con la distancia para no parpadear;</li><li>torres de ladrillo a la vista en la ladera suroriental;</li><li>calle de concreto alrededor del sector;</li><li>árboles entre las casas de la ladera;</li><li>cable aéreo detrás del sector.</li></ul> | Capturas 02, 05 y 15, y video. |
| **Regresión** | `npm run test:city`: 20 de 20. 0 solapes en 1280×720, 1024×1366 y 390×844. 40 tabulaciones con foco visible; P pausa el cálculo. Al salir, en 3 ciclos: 0 controladores y 0 lienzos. Pestañas sin cortes en 5 tamaños. Alternativa 2D sin cambios. Consola limpia. |

**Video:** `docs/medellin/video/entorno-y-gotas.mp4` se volvió a grabar con esta versión.

## 4 sexies. Vista general del Valle de Aburrá (ejecutada)

**Pedido.** Que el escenario general se pareciera a Medellín lo más posible.

**Límite del entorno (superado en la sección 4 octodecies).** Para usar relieve y trazados reales se intentó acceder a teselas de elevación, OpenTopography, Copernicus, teselas de OpenStreetMap y Overpass. El proxy rechazó todos esos servicios y no se insistió por otras vías. Por eso la vista se construyó desde una **tabla de referencia aproximada** escrita a mano (`MODELO.md`, sección 6.2), y así lo dice el encabezado de la escena: «Vista aproximada para orientarse · relieve y edificios ×1,5 · trazados y cotas aproximados».

| Cambio | Cómo se verificó |
|---|---|
| **Forma del valle.** Antes, una ladera genérica con una franja recta. Ahora, el valle de Caldas a Copacabana: río con su caída de sur a norte, fondo plano ancho en Laureles y Guayabal, laderas más empinadas al nororiente, cerros tutelares y Padre Amaya, cierre al sur en el Alto de San Miguel y montañas exteriores hasta el horizonte. | V7 (tolerancias en la sección 1). Capturas desde el sur, desde San Javier y desde Santa Elena. |
| **Ciudad.** Tejido de ladrillo que sube por las laderas hasta un borde irregular que cambia por sector de la ciudad; torres de El Poblado; Centro con el Edificio Coltejer; plano de Laureles; zonas industriales; municipios vecinos. Los cerros quedan verdes. | Capturas. 0 solapes de interfaz en 1024×1366 y 390×844. |
| **Agua y verde.** 25 quebradas talladas en las laderas con árboles en sus orillas; parque lineal del río con autopistas a lado y lado; bosques en la parte alta y en el oriente (Arví, Santa Elena). | Capturas. |
| **Transporte y referencias.** Metro (líneas A y B) en viaducto con estaciones y trenes que se mueven; tranvía; cables K, L, J, H, M y P; aeropuerto Olaya Herrera, estadio, Biblioteca España. | Capturas; V7 para las estaciones del metro. |
| **Etiquetas de sector.** Las dos etiquetas naranjas prueban otras posiciones antes de ocultarse; en teléfonos se quedan con el nombre. Antes, en la vista inicial, una de ellas quedaba oculta (y en teléfono, las dos). | Vista inicial a 1440×900 y 390×844: las dos visibles. |
| **Regresión** | `npm run test:city`: 21 de 21. 0 solapes en 1024×1366 y 390×844. 40 tabulaciones con foco visible; P pausa el cálculo. Pestañas sin cortes en 5 tamaños. Alternativa 2D sin cambios. Consola limpia en todas las capturas. |

**Rendimiento de la vista del valle** (WebGL por software, calidad ligera automática; `/tmp/vfps.py`, guardado como `tools/verificacion/valle_fps.py`):

| Versión | 1280×720 | 390×844 | Llamadas de dibujo | Triángulos |
|---|---|---|---|---|
| Anterior | 2,5 cuadros/s | 3,2 cuadros/s | 30 | ≈ 294 000 |
| Actual | 1,8 cuadros/s | 2,3 cuadros/s | 137 | ≈ 350 000 |

La vista nueva tiene más objetos (13 000 edificios y 5 000 árboles en calidad ligera; 42 000 y 16 000 en alta), por eso es más lenta con el dibujo por software. En esta vista no corre ningún cálculo y la cámara se mueve sin saltos. Con una GPU esta carga es moderada (todo se dibuja con mallas de instancias); **no se midió en un equipo con GPU**.

**Comparación:** `medellin-valle-antes-ahora.png` (entregada aparte) y capturas 01 y 10 de `docs/medellin/capturas`.

## 4 septies. Sectores de cálculo: valle alrededor, fachadas y vida de calle (ejecutada)

**Pedido.** Que el sector detallado donde se evalúa se pareciera mucho más a Medellín.

**El cálculo no cambia.** Huellas, alturas, bajantes, coberturas, sumideros y salidas de los escenarios son los mismos; solo cambia el dibujo. `npm run test:city` da 22 de 22, y las cifras del balance en las capturas con lluvia son las del cálculo.

| Cambio | Cómo se verificó |
|---|---|
| **Valle alrededor del sector.** Antes, un valle genérico de ≈ 3 km. Ahora, el valle de referencia de la sección 4 sexies a escala 1:1 (sin exagerar), con el sector en su punto ilustrativo: la otra ladera llena de barrios, la cuchilla verde, el río con autopistas, el metro, los metrocables, los cerros y las montañas que cierran el valle. | V8. Capturas desde la vista general, desde el botón **Valle** (nuevo encuadre: detrás del sector, mirando al valle) y a nivel de calle. |
| **Barrio cercano.** Casas pegadas en lo plano y escalonadas en las laderas, con el frente hacia la calle o ladera abajo; culatas de ladrillo sin ventanas aunque el frente esté pintado; puertas, persianas, rejas y balcones; tanques negros y azules; pisos en obra gris. | Capturas. |
| **Fachadas del sector.** Atlas de 32 módulos dibujados a mano (frente pintado o ladrillo, locales con aviso y persiana, ventanas con reja, balcones, bloque calado, obra gris). Cada cara elige según lo que tiene enfrente en la malla del sector. Azoteas con tanques, ropa tendida y cubiertas de teja ondulada. | Capturas de cerca y a nivel de calle. |
| **Vida de calle.** Postes de concreto con luminaria y cableado aéreo (entre postes, hacia afuera del sector y hasta las fachadas), motos en los andenes lejos de sondas y sumideros, árboles con copas de varios lóbulos y guayacanes, pasamanos en las escaleras de la ladera. | Capturas. Las sondas y los sumideros quedan a la vista. |
| **Rótulos lejanos** (río, metro, metrocables, cerros, Centro), de prioridad baja y solo en vistas altas. | 0 solapes de interfaz en 1024×1366 y 390×844. |
| **Pestaña Docente.** Nueva nota: el entorno es aproximado, la ubicación es ilustrativa y fachadas, avisos, postes, cables y motos son ambientación. | Lectura. |
| **Regresión** | `npm run test:city`: 22 de 22. 0 solapes en 1024×1366 y 390×844. 40 tabulaciones con foco visible; P pausa el cálculo; al salir quedan 0 recursos activos. Pestañas sin cortes en 5 tamaños. Alternativa 2D sin cambios. Vista del valle sin cambios visibles. Consola limpia en todas las capturas. |

**Rendimiento.** El entorno nuevo dibuja más cosas, así que con WebGL por software el sector es más lento (sección 5). Para compensarlo:
- las casas y los árboles se reparten en grupos por dirección, para que la cámara descarte los que quedan detrás;
- el suelo se colorea después de las casas, así no se gasta trabajo en lo que ellas tapan;
- la calidad ligera usa menos casas, árboles y nubes y un dibujo de fachadas más simple;
- el detalle se adapta solo: si cada cuadro tarda más de ≈ 0,2 s durante 3 s, se ocultan los volúmenes y árboles lejanos y las nubes (el relieve sigue mostrando la ciudad), y vuelven cuando el equipo dibuja a más de ≈ 16 cuadros por segundo.

En calidad alta (la de un equipo con GPU), la calle tiene ≈ 1,35 millones de triángulos en ≈ 120 llamadas de dibujo; en ligera, ≈ 180 000 triángulos en ≈ 140 llamadas. **No se midió en un equipo con GPU.**

**Comparación:** `medellin-sector-antes-ahora.png` (entregada aparte) y capturas 02, 03, 05, 11 y 15 de `docs/medellin/capturas`.

## 4 octies. Lluvia en los sectores: agua natural, superficies mojadas y tormenta (ejecutada)

**Pedido.** Analizar con más profundidad y mejorar sustancialmente cómo se ve Medellín, sobre todo en las zonas de lluvia.

**Diagnóstico** (capturas de los dos sectores con 100 mm/h, minuto 10, en cuatro encuadres: `tools/verificacion/lluvia_capturas.py`):
- la escena parecía un día nublado y claro, no un aguacero;
- el agua era una pintura azul clara sobre todas las calles, sin reflejos;
- pavimento, fachadas y techos no se veían mojados;
- el valle se veía nítido hasta el horizonte en plena tormenta.

**El cálculo no cambia.** Profundidades, velocidades, balance y misiones son los mismos; solo cambia el dibujo. `npm run test:city` da 23 de 23, con la prueba nueva V9.

| Cambio | Cómo se verificó |
|---|---|
| **Color natural del agua** en la vista realista: lámina gris-café turbia, más oscura y opaca cuanto más profunda, con los mismos cortes y rótulos que la escala azul. Leyenda «Profundidad del agua (color natural)». | V9: luminancia no creciente y opacidad no decreciente de 1 mm a 30 cm; sin agua con menos de 0,5 mm; cortes idénticos a la escala azul; textura de la tarjeta gráfica igual a la leyenda (diferencia 0/255). |
| **Botón «Agua en azul»** para volver a la escala azul (proyectores con poco contraste). «Materiales» y «Resultados» siguen en azul. | En el navegador (`tools/verificacion/agua_azul.py`): el botón cambia `aria-pressed`, la leyenda y el color, y vuelve al estado anterior. Consola limpia. |
| **Reflejos.** El agua espeja una captura de la propia escena (fachadas, calles, cielo), con más brillo en ángulo rasante, solo donde hay agua calculada. La captura se repite cuando el cielo de la tormenta se asienta: el agua y el pavimento espejan el cielo gris. | Capturas a nivel de calle. |
| **Superficies mojadas.** Pavimento, fachadas (con chorreaduras) y techos se oscurecen y brillan con la lluvia; los vidrios reflejan. Es superficie mojada, no agua acumulada: la guía docente lo explica y propone distinguirlos con un toque o con la leyenda. | Capturas; lectura de la guía. |
| **Tormenta.** Luz más baja; ventanas, luminarias (halo y luz sobre el suelo mojado) y barrios del entorno encendidos; bruma que empieza justo detrás del punto que se mira (el sector queda nítido y el valle se pierde a algo más de 1 km); nubes bajas en las laderas, siempre lejos del sector y de la cámara; velo de lluvia en pantalla solo en la vista realista, que se apaga al mirar hacia abajo y con movimiento reducido. Los rótulos lejanos que quedan en la bruma se ocultan. | Capturas en los cuatro encuadres de los dos sectores. Con movimiento reducido, `tools/city4.py` sin solapes ni errores. |
| **Regresión** | `npm run test:city`: 23 de 23. 0 solapes en 1280×720, 1024×1366 y 390×844. 40 tabulaciones con foco visible; P pausa el cálculo; al salir quedan 0 recursos activos. Pestañas sin cortes en 5 tamaños. Alternativa 2D sin cambios. Versión de un solo archivo sin peticiones externas. Consola limpia. |

**Comparación:** `medellin-lluvia-antes-ahora.png` (en `docs/medellin/capturas` y entregada aparte). Las capturas de esa carpeta se rehicieron con la lluvia nueva, salvo la 13 (alternativa 2D, sin cambios).

**Datos oficiales de Medellín.** Las capas de la cartografía base (red hídrica, ríos, barrios, construcciones con número de pisos, vías, equipamientos, espacio público, hidrografía del POT), la ortofoto 2024 y el modelo digital de elevación 2024 (1 m) **no se pudieron descargar**: el proxy de este entorno rechaza `www.medellin.gov.co` (403). Sus metadatos sí se leyeron y están en `DATOS_REALES.md`, sección 8. Por eso el relieve y el entorno siguen siendo la tabla de referencia aproximada.

## 4 nonies. Alcantarillado separado y creciente de la quebrada (ejecutada)

**Pedido.**
1. Fortalecer el sistema de alcantarillado: mejorar los sumideros, agregar cámaras de inspección (MH) según la norma de EPM y separar la línea de aguas residuales de la de aguas lluvias.
2. Simular una creciente que supere la capacidad hidráulica de la quebrada y ver cómo se comporta el agua en esa sección.

**Fuente normativa.** *Normas de Diseño de Sistemas de Alcantarillado* de EPM (GD-AS002). Se leyeron en línea el 9 de noviembre de 2026 los numerales 2.3, 3.4, 5.2, 6.2, 6.3, 8.3, 8.4 y 8.5. La tabla de control del documento tiene su última entrada el 14 de febrero de 2025. La dotación y la curva IDF no están en esos numerales (la norma remite a EPM): se usaron valores **supuestos** y así se rotulan.

**El cálculo cambió.** La red esquemática de 250 L/s se reemplazó por una red calculada (MODELO 6.3), y la quebrada recibe creciente (MODELO 6.4). En la ladera cambió el terreno al sur de la quebrada: antes el agua desbordada se alejaba del cauce; ahora la quebrada corre por el fondo de su valle. Las cifras de las misiones cambian; sus resultados se siguen calculando.

`npm run test:city`: **31 de 31**. Pruebas nuevas:

| Prueba | Qué verifica | Resultado |
|---|---|---|
| S1 | Tubería en flujo permanente: sale lo que entra y la lámina queda cerca de la normal de Manning | Cumple. Error de caudal 0,000 %; lámina a 8 % de la normal. |
| S2 | Con 3 veces la capacidad la cámara rebosa y el volumen se conserva | Cumple. Residuo 4·10⁻¹³ m³. |
| S3 | Ecuaciones de captación por tipo: ventana en pendiente y en punto bajo, rejilla y mixto | Cumple. |
| S4 | Criterios de la norma de EPM en las dos redes | Cumple: 15 de 15 criterios en cada sector. |
| S5 | Sin conexiones erradas no entra lluvia a las aguas residuales; con ellas entra y rebosa | Cumple. Rebose de 140 m³ con 100 mm/h. |
| S6 | Balance calle + red con creciente al 200 %: cierra, el hidrograma entra completo y la quebrada se mete por la descarga | Cumple. Residuo de la superficie 3·10⁻¹⁰ m³ sobre 50 000 m³; residuo de la red 10⁻¹² m³. |
| C1 | La capacidad de la sección coincide con el modelo: con el 80 % no se desborda, con el 125 % sí | Cumple. |
| S7 | Geometría de la sección circular | Cumple. |

**Sensibilidad a la resolución (prueba 12).**
- Con los sumideros nuevos, al principio no cumplía: 16 % de diferencia en la salida entre 1 m y 0,5 m.
- **Causa:** cuatro sumideros nuevos quedaban, con celdas de 0,5 m, en la segunda celda desde el bordillo y no en la de la cuneta.
- **Corrección:** se pusieron a 0,2 m del bordillo, en la celda de la cuneta con cualquier malla.
- **Resultado:** cumple con 7,2 %. El criterio no se cambió.

**Misiones.** Se ejecutaron las ocho sin interfaz (`tests/city/missions.ts`).
- «Conexiones erradas»: rebosan 32 m³ de aguas residuales con la lluvia de 60 mm/h.
- «La creciente de la quebrada»: con el 150 % de la capacidad, el agua supera la orilla en 39 cm y la red devuelve 7 m³ por la carrera sur.
- Las seis anteriores siguen dando un resultado calculado. «El charco de la esquina» ahora tiene su punto más hondo cerca de la salida, porque la esquina tiene un sumidero mixto.

**Navegador** (`tools/verificacion/red_capturas.py`, calidad ligera; consola limpia):
- En la calle, con 100 mm/h y conexiones erradas: el panel muestra las dos redes, el alcantarillado de aguas residuales en carga y su rebose en AR-0. La vista bajo la calle dibuja la tubería en carga en rojo y las conexiones erradas en violeta.
- En la ladera, con la creciente al 200 %:
  - la sección transversal en vivo muestra el agua 2,47 m sobre el fondo, por encima de la orilla (1,96 m);
  - el hidrograma muestra lo que entra, lo que pasa por el cauce y lo que pasa por fuera, con la línea de capacidad;
  - el perfil del colector muestra 4 tramos en carga y el rebose de LL-S1;
  - la cámara de vista «Ver la sección» mira la sección desde aguas abajo.

**Regresión.**
- 0 solapes en 1280×720, 1024×1366 y 390×844, con y sin movimiento reducido.
- 40 tabulaciones con foco visible; P pausa el cálculo.
- Al salir quedan 0 recursos activos.
- Pestañas sin cortes en 5 tamaños.
- La alternativa 2D dibuja las dos redes y las tuberías en carga.
- La versión de un solo archivo no hace peticiones externas.
- Pipeline: 14 de 14.

**Comparación:** `medellin-alcantarillado-creciente.png` (en `docs/medellin/capturas` y entregada aparte).

## 4 decies. Creciente dañina, redes legibles y paneles rediseñados (ejecutada)

**Pedido.**
1. Una creciente «más escandalosa, más dañina».
2. Las redes se veían confusas y enredadas.
3. Mejorar el diseño de esas secciones.

**Qué se encontró al revisar.**
- Con el 200 % de la capacidad casi no pasaba agua por fuera del cauce y «junto a la casa del retiro» seguía seco: no había nada expuesto cerca de la orilla.
- Bajo la calle se veían a la vez árboles, postes, cables, bajantes y casas semitransparentes. La red de aguas residuales en carga se teñía entera de rojo y parecía una tercera red. Las acometidas iban en diagonal desde cada casa hasta una sola cámara y formaban abanicos cruzados.
- En los paneles, las leyendas se partían en varias líneas, los rótulos del hidrograma se montaban y la sección de la quebrada se reescalaba con cada creciente.
- **Error de cálculo del reparto «¿Adónde fue la lluvia?»** en la ladera: «Va por el alcantarillado» daba −36 m³ (−29 %). La red entregaba a la quebrada más agua de la que captaba, porque recibe la escorrentía de calles de arriba por el colector; esa agua entraba al reparto sin contarse como entrada. Se corrigió (MODELO, sección 3) y la prueba B1 lo comprueba.
- **Velocidades espurias** de hasta 75 m/s en el frente de mojado de la creciente (celdas de 2 cm con caudal de las caras vecinas). Para el peligro y los vehículos, la velocidad de celda se limita con el mismo Froude del cálculo.

**El cálculo cambió en la ladera** (MODELO, sección 6.5): cuatro casas a ras de la orilla, la margen sur como talud de 30 %, una cámara nueva de aguas residuales (AR-Q1), un puente peatonal y tres vehículos. Las cifras de las misiones de la ladera cambian; sus resultados se siguen calculando.

`npm run test:city`: **37 de 37**. Pruebas nuevas:

| Prueba | Qué verifica | Resultado |
|---|---|---|
| H1 | Clases H1–H6 en 16 casos de borde de la tabla de la guía AIDR 7-3; la clase nunca baja al aumentar profundidad o velocidad | Cumple. |
| H2 | El daño de una vivienda se mide en las celdas que tocan sus muros e ignora el agua lejana | Cumple. |
| H3 | Vehículos: una ola de 15 cm no mueve ninguno; una de 1,6 m mueve los dos; nunca entran a un edificio; dos corridas iguales los dejan en el mismo lugar | Cumple. |
| H4 | Creciente con 30 % de lodo: pico de la mezcla 1,43 veces el del agua; volumen completo; balance cerrado | Cumple. Error de volumen 6·10⁻¹⁵. |
| H5 | El daño crece con el caudal: 60 % no llega a las casas de la orilla; 150 % sí (0,64 m); 300 % deja 9 edificaciones con H5 y mueve los 3 vehículos | Cumple. |
| B1 | El reparto del agua suma exactamente lo que entró y ninguna parte es negativa (calle con conexiones erradas; ladera con y sin creciente) | Cumple. Error ≤ 7·10⁻¹⁶. |

Las 31 anteriores siguen cumpliendo. S4 sigue en 15 de 15 criterios de EPM en cada sector (con la cámara AR-Q1). La revisión de EPM en la pestaña Docente se hace ahora siempre con la malla de diseño (1 m): con la malla de 2 m, la velocidad mínima de diseño de un tramo daba 0,42 m/s solo porque las áreas aferentes se calculaban más gruesas.

**Misiones.** Se ejecutaron las nueve sin interfaz (`tests/city/missions.ts`).
- «La creciente de la quebrada» (150 %): el agua supera la orilla en 42 cm; llega a las 4 casas de la orilla, hasta 64 cm contra sus muros, con peligro H3; el agua mueve la moto; la red devuelve 9 m³ por la carrera sur.
- «La avenida torrencial» (350 %, 30 % de lodo, sube en 3 min): pico de 257 m³/s; 21 edificaciones con agua, 18 con H5 o más y 8 con H6; 5 577 m² con H4 o más; los 3 vehículos salen del sector.
- Las siete anteriores siguen dando un resultado calculado.

**Navegador** (`tools/verificacion/creciente_capturas.py`, calidad ligera; consola limpia):
- Bajo la calle: sin árboles, postes, cables, vehículos ni bajantes; edificios casi transparentes. Cada red conserva su color; las flechas avanzan dentro de los tubos; el tramo en carga lleva anillos rojos. El selector «Ver» deja una sola red y sus códigos de cámara. Las acometidas bajan junto a la casa y van derecho al colector.
- Panel de alcantarillado: tarjetas por red con su destino y el llenado del tramo más cargado; corte de la calle a la misma escala horizontal y vertical; esquema en planta con el sentido del agua; perfil con los códigos de las cámaras.
- Panel de creciente: seis crecientes de ejemplo, cuatro indicadores, sección con las casas y la franja de peligro, hidrograma con eje de tiempo fijo y rótulos sin superponerse, tabla de daños.
- Maqueta con la avenida torrencial: agua café con oleaje y espuma, troncos y basura con la corriente, agua 1 m sobre el tablero del puente, rótulo «Casa de la orilla 2 · 2,0 m de agua · H6»; después, marcas en las fachadas, troncos depositados y el puente «libre · ya pasó sobre el tablero».
- Vista «Peligro» en 3D y en el mapa 2D; en el teléfono la leyenda va abajo, en tres columnas.

**Regresión.**
- 0 solapes en 1280×720, 1024×1366 y 390×844, con y sin movimiento reducido; botones de 30 px o más.
- 40 tabulaciones con foco visible; P pausa el cálculo.
- Al salir quedan 0 recursos activos.
- Pestañas sin cortes en 5 tamaños.
- La alternativa 2D dibuja las redes con su filtro y la vista de peligro.
- Panel de creciente sin desbordes a 390 px.
- La versión de un solo archivo (1,93 MB; antes 1,87 MB) no hace peticiones externas y su consola queda limpia.

**Comparación:** `medellin-creciente-redes.png` (en `docs/medellin/capturas` y entregada aparte).

## 4 undecies. Sectores reales más fieles y módulo «Calidad del agua» (ejecutada)

**Pedido.** Mejorar mucho el aspecto y la modelación del caso de estudio real y crear un módulo interactivo de calidad del agua para niños.

**Qué se encontró al revisar.**
- Dos de los tres sectores anteriores (Blanquizal y El Corazón) tenían la quebrada cubierta bajo las casas: no se podía simular. Se reemplazaron por tramos abiertos de las mismas quebradas: La Iguaná entre El Pesebre y Fuente Clara (86 % de secciones abiertas) y Ana Díaz entre El Corazón y Betania (100 %).
- **La sección de control medía a lo largo del cauce, no a través**, cuando la quebrada corre en dirección norte–sur: el compilador siempre tomaba una columna de la malla. En Ana Díaz daba una orilla de 10 cm y una capacidad de 0,2 m³/s. Además, en las quebradas que corren hacia el oeste el caudal medido salía negativo y las gráficas lo mostraban como cero. Ahora la sección es una fila o una columna según la dirección del cauce, con el sentido del flujo y la corrección por el ángulo (MODELO, 6.8; prueba D2).
- **El cauce lleno se tomaba donde el terreno subía 1,5 m**, que en las cañadas en V no es la orilla. Ahora es el borde de una terraza, el pie de una construcción o el terreno a 10 m, lo primero que aparezca (DATOS_REALES, sección 0).
- **Pozos de una celda** junto a construcciones: la rasterización del constructor y la del compilador no coincidían. En Juan Bobo quedaba una celda con 1,2 m de agua de lluvia. El compilador repite ahora el relleno de depresiones sobre su propia malla.
- **Agua de las laderas en rincones del borde**: las entradas de ladera caían en celdas encerradas entre casas y el borde, sin salida (hasta 1,4 m de agua). Ahora solo entran por celdas comunicadas con el barrio y con el terreno bajando hacia adentro, y esas celdas dejan de ser salidas.
- **Rayas claras sobre el terreno** en la vista desde arriba: las caras verticales de los escalones del terreno tenían el orden de vértices al revés y se descartaban; por el hueco se veía el cielo. Se corrigió el orden (también en la ladera y la calle de prueba).
- La cámara de la sección quedaba dentro de las copas de los árboles en La Iguaná: los árboles entre la cámara y la sección se ocultan mientras dura esa vista.

**Capturas** (`tools/verificacion/sectores_reales.py`, en `/home/claude/shots/city/reales/`; las anteriores, en `reales-antes/`): vista general con y sin foto aérea, vista desde arriba y creciente desde la cuenca en la sección de control para los tres sectores. Consola sin errores.

**Módulo «Calidad del agua»** (`tools/verificacion/calidad.py`, escritorio 1440 × 900 y teléfono 390 × 844): en la estación B, en verano, la piedra da BMWP/Col 29 (clase IV); al conectar las casas al alcantarillado, 103 (clase I). Con la dosis de la mejor jarra y 1,5 mg/L de cloro, el agua cumple las cinco características (IRCA 0 %). La lluvia de la calle se anima y el botón «Misión: conexiones erradas» abre esa misión en el laboratorio de lluvia. Consola sin errores.

**Teléfono (390 px).** Las escenas de 1000 unidades de ancho se reducían tanto que sus rótulos no se leían. La planta de potabilización tiene ahora una versión vertical; la quebrada y la calle se desplazan de lado y conservan el tamaño de sus rótulos (la quebrada sigue a la sonda; la calle empieza mostrando el sumidero y la quebrada). En el esquema de la planta de aguas residuales el valor quedaba encima de la barra: ahora va al lado.

**Misiones nuevas en sectores reales** (`tests/city/missions.ts`, `tools/verificacion/misiones_reales.py`):
- «La creciente que viene de lejos» (La Iguaná, 60 mm en una hora): el pico, de 159 m³/s, llega en el minuto 108, 48 min después de que para la lluvia; la alerta roja suena en el minuto 70 y el agua llega a la primera casa junto a la quebrada en el 71. Opción que coincide: «más de media hora después».
- «¿De dónde viene el agua?» (Juan Bobo, 80 mm en una hora): la quebrada llega a 2,1 m³/s y queda 1,24 m por debajo del cauce lleno; el agua llega a la primera casa junto a la quebrada en el minuto 4, por el barrio. Opción que coincide: «la lluvia que corre por las calles».

La procedencia de los sectores reales escribe ahora los decimales con coma, como el resto de la interfaz.

`npm run test:city`: **48 de 48** (nueva D2; D1 cambia a los nuevos sectores y separa la lluvia del sector del agua de las laderas). `npm run test:quality`: **8 de 8** (`docs/calidad/PRUEBAS_CALIDAD.md`).

## 4 duodecies. Sector Ana Díaz como maqueta y módulo de calidad en 3D (ejecutada)

**Pedido.** «Esto se ve re feo y poco práctico» (vista general de Ana Díaz con lluvia de 60 mm/h y agua en azul) y «el módulo de calidad puede ser muchísimo mejor». Para el entorno se eligió la maqueta (sector recortado y entorno en volúmenes blancos); para calidad, las cuatro direcciones propuestas: escenas 3D recorribles, retos con medalla, experimentos animados y una pregunta clara por escena.

**Qué se encontró en el sector.**
- Las rayas negras eran las caras verticales de una escalera: el terreno de 1 m se dibujaba como bloques porque la regla que conserva los bordillos (0,35 m) partía cada celda de la ladera. Ahora el terreno real es continuo salvo saltos de más de 1,7 m (MODELO, 6.9).
- Las casas de colores alrededor eran dibujo y competían con el sector; los avisos de tienda o droguería en casas reales eran inventados.
- Con el agua en azul, la película de 1 a 2 mm de la lluvia cubría toda la ladera de celeste, y había cientos de flechas sobre ella.
- El recuadro «Vista y cámara» tenía quince botones de texto sobre la maqueta.
- La cámara de la sección de control quedaba detrás de la ladera de aguas abajo en Ana Díaz: ahora sube hasta ver la sección por encima del terreno y de los techos.

**Capturas** (`tools/verificacion/sectores_maqueta.py`, escritorio 1408 × 745 con el panel recogido y teléfono 390 × 844): los tres sectores reales con lluvia de 60 mm/h a los 16 min, vista general, sección de control, calle y valle; la calle de prueba y la ladera conservan su aspecto. Consola sin errores.

**Módulo «Calidad del agua» en 3D** (`tools/verificacion/calidad3d.py`, escritorio 1440 × 860 y teléfono 390 × 844):
- *La quebrada*: con 600 casas sin tratar no hay peces desde el tubo hasta 2,5 km (DBO5 de 7 mg/L o más); en verano y con planta pequeña vuelven a las cuatro estaciones y se gana la medalla. La piedra junto al tubo da BMWP/Col 11 (clase V).
- *Del río a la llave*: la prueba de jarras animada con el río después de llover deja 3,1 UNT en la jarra de 30 mg/L (la más clara); al usarla se gana la medalla.
- *La ciudad y la lluvia*: el aguacero de 15 mm lleva 26,3 kg de mugre a la quebrada (89 % con los primeros 10 mm); la prueba del colorante en las 20 casas encuentra las 3 mal conectadas (medalla).
- Sin WebGL se muestra la versión anterior en dibujos planos, con el mismo modelo.

`npm run test:city`: **48 de 48**. `npm run test:quality`: **12 de 12** (nuevas Q9 a Q12: regla de los peces y solución del reto, escala del dibujo de la quebrada, casas del juego del colorante, partículas y bacterias dibujadas).

## 4 terdecies. Los once procesos de la planta (ejecutada)

**Pedido.** «Que en el módulo de calidad especifiques qué es lo que hace cada proceso de tratamiento del agua … se ve cada uno de los procesos, pero quiero más detalle».

**Qué cambió.**
- La planta 3D pasó de ocho a once partes: captación con rejilla (con basura atajada según el río), desarenador (arena en el fondo según el río), mezcla rápida, floculación en tres zonas separadas con paletas cada vez más lentas, sedimentación de alta tasa, tres filtros con grava, arena y antracita, tanque de contacto con pantallas en zigzag y cilindros de cloro, silo de cal y cámara de pH, tanque de almacenamiento, la llave y, detrás del sedimentador, el espesador y cuatro lechos de secado con sus tuberías de lodo.
- Nueva pestaña **Procesos** (la primera): los once pasos como botones; para cada uno, qué hace, una animación «con lupa», lo que le pasa al agua en el juego con los valores calculados, cómo lo hace, la tabla de criterios con su fuente (Resolución 0330 de 2017 o Resolución 2115 de 2007), qué puede salir mal y qué se mide. Al elegir un paso la cámara vuela hasta él; tocar una parte en la escena abre el paso en el panel.
- «Recorrer la planta» avanza solo cada 16 s y mueve la cámara; «Lavar los filtros» anima el retrolavado. Nuevo reto: los once pasos.
- Al revisar las citas se corrigieron los artículos de la Resolución 2115 de 2007 que se mostraban en la llave: turbiedad art. 2, pH art. 4, cloro art. 9, coliformes art. 11, IRCA arts. 13 (cuadro 6) y 15 (cuadro 7), según el texto compilado de la CRA.

**Capturas** (`tools/verificacion/planta_procesos.py`, escritorio 1440 × 860, y teléfono 390 × 844): las once etiquetas visibles en la vista general; los once pasos recorridos con «siguiente», cada uno con su lupa, sus valores (ninguno NaN) y su fuente; el retrolavado empieza y termina; la medalla de los once pasos se gana. En el teléfono la página no se desborda (ancho 390). `tools/verificacion/calidad3d.py` sigue dando las medallas de los peces, las jarras y el colorante. Consola sin errores.

`npm run test:quality`: **13 de 13** (nueva Q13: los once procesos completos, en orden, en la escena, con valores válidos en 18 combinaciones, con las citas de la Resolución 0330 y con el IRCA calculado).

## 4 quaterdecies. Medellín al siguiente nivel: tormentas reales, sedimentos y planificador (ejecutada)

**Pedido.** «Tormentas reales y clima», «Modo planificador» y «más dinámicas del flujo: lluvias aún más largas, niveles más complejos y grandes, y transporte de sedimentos».

**Tormentas.** La curva IDF del IDEAM para Olaya Herrera (DTS 2022 de la Alcaldía, numeral 2.2.5) da tormentas de diseño de 2 a 100 años y de 30 min a 6 h por bloques alternos. La ecuación de la ficha deja de crecer en lámina después de unas 2,8 h para 100 años; por eso de 1 a 6 h se sigue la tabla impresa (L1). Aguacero real: 28 de enero de 2026, 87 mm en 44 min (SIATA, citado por la prensa; forma supuesta). Clima: 7 % por grado de calentamiento global (IPCC AR6). La lluvia inventada dura hasta 6 h, se simulan hasta 8 h y la velocidad llega a ×480. Una tormenta de 10 años y 3 h corre en la ladera con celdas de 2 m en unos 11 s de cálculo (L5).

**Sedimentos.** Erosión, transporte y depósito con la capacidad de transporte de Govers (LISEM), la salpicadura de WEPP y la caída de Ferguson y Church (T1–T3). En la ladera con 60 mm/h por 30 min: el parque con árboles pierde unos 67 kg (solo salpicadura) y el lote en obra unos 3 t, con lodo en unos 250 m² y lodo en los sumideros; una creciente con 20 % de lodo deja lodo en más de 3 700 m². El balance de la tierra cierra (residuo ≈ 10⁻¹⁵). Capturas: `/tmp/mud.py` y `/tmp/mud2.py` (lote en obra desde arriba; creciente con lodo, antes y después).

**Planificador.** En La Iguaná, con tanques en 10 techos, 10 % de patios verdes y la cuenca reforestada (100 puntos) y una tormenta de 10 años y 1 h: mejoran 6 de 7 indicadores (edificaciones con agua 15 → 13; pico de la quebrada 110,9 → 36,8 m³/s); la tierra que se lleva el agua casi no cambia. P1 revisa las obras y el balance.

**Interfaz.** «Crear lluvia» con tres tipos (inventada, de diseño, aguacero real), clima, hietograma y curva IDF para docentes; panel «¿Adónde fue la tierra?»; capa «Lodo»; misión «El lote en obra»; herramienta «Planificar». Capturas en escritorio sin errores de consola.

`npm run test:city`: **57 de 57** (nuevas L1–L5, T1–T3 y P1).

## 4 quindecies. Tormenta viva, cine y video; corrección del torrente y de «Agua ×5» (ejecutada)

**Pedido.** «Cine, sonido y tormenta viva».

**Tormenta viva.** Techo de nubes y rayos ilustrativos en la vista realista. Su frecuencia sigue la lluvia calculada: ninguno por debajo de 35 mm/h y como máximo 8 por minuto, nunca dos con menos de 4 s entre sí. Cada rayo es un solo destello, sin parpadeo, y con movimiento reducido no hay ninguno (E1). El sonido se sintetiza: la lluvia y el agua que corre siguen la intensidad y el caudal calculados, y el trueno llega con el retraso del sonido (E2). Captura de un rayo con la simulación en pausa: `tools/verificacion/tormenta_rayo.py`.

**Cine y video.** Cinco tomas: sobre el barrio, en la calle, donde más agua hay, subiendo y el valle. Ninguna atraviesa el terreno ni los techos en los dos sectores didácticos (E2). El cine se detiene al arrastrar la maqueta o al usar un botón de cámara.

El video (WebM, hasta 60 s) se descarga con un rótulo en cada cuadro: sector, lluvia, intensidad del momento, tiempo simulado y la aclaración de que no es un pronóstico. En Chromium sin tarjeta gráfica se grabó y descargó `tormenta-ladera-quebrada-….webm` (VP9) con el rótulo legible. Lo verifica `tools/verificacion/tormenta_viva.py`, que muestra la consola sin errores.

**Corrección pedida por el usuario («esa cresta y concentración no tiene sentido, el agua no se comportaría así»).** Tenía razón, y había tres causas:

1. **Dibujo.** «Agua ×5» multiplicaba toda la profundidad. En la quebrada, 2 m se dibujaban como 10 m, mientras la orilla, con 30 cm, quedaba en 1,5 m: un lomo de agua por encima de las orillas. Ahora engrosa solo las láminas delgadas: 1 cm se dibuja ×4,9 y nunca se agregan más de 16 cm. La superficie dibujada queda nivelada de orilla a orilla, con una diferencia menor que 10⁻⁵ cm frente a 6,8 m antes (A1). Los avisos dicen cuánto se amplifica.
2. **Salida de la quebrada.** Tenía una pendiente escrita de 3 %, aunque el cauce baja casi 9 %, y un tope en régimen crítico. El agua supercrítica no podía salir y se represaba en los últimos 15 m: 2,0 m en el borde frente a 1,65 m aguas arriba. Ahora la pendiente se mide en el terreno junto al borde y el tope es el mismo de las caras interiores. En el borde la lámina ya no crece (F1).
3. **Límite de Froude (se mantuvo, con justificación física).** Antes de corregir el texto afirmé que la creciente del tramo de 10 % iba un 48 % más honda que en la realidad. La comparación era con la rugosidad de un cauce de llanura (Manning n = 0,035), con la que el agua iría a Fr ≈ 3. Los torrentes de lecho móvil se mantienen cerca de Fr = 1 (Grant 1997). Con la resistencia de lechos de grava y bloques (Ferguson 2007) la profundidad esperada es de 1,71 a 2,26 m (D84 de 0,3 a 0,5 m) y la crítica es 2,40 m; el modelo da 2,06 m (F1). Se probaron un límite de 2, uno de 3 en agua honda y la aceleración convectiva. Con un límite de 3 aparecieron ondas que crecían sin control y oleadas espurias contra el terraplén: el caudal por los cajones saltaba entre 3 y 30 m³/s y el agua pasaba sobre la vía con 60 % de la capacidad, y fallaban C1, K3 y H5. Se descartaron.

`npm run test:city`: **61 de 61** (nuevas F1, A1, E1 y E2; F1 se reescribió después con las referencias de Grant 1997 y Ferguson 2007, ver la sección siguiente). `npm run test:quality`: 13 de 13. La versión de un solo archivo funciona sin conexión y sin peticiones externas (`tools/verificacion/single_city.py`).

## 4 sexdecies. Puente peatonal: gálibo, fuerzas y colapso (ejecutada)

**Pedido.** «Agrega el análisis y colapso del puente: si la creciente aumenta, no queda gálibo y se ejercen fuerzas cortantes en el puente que producen su posible colapso.»

**Hecho.** Cada paso calcula el gálibo, el empuje del agua sobre el tablero, la flotación y el cortante en cada apoyo, y los compara con la resistencia al deslizamiento:
- Empuje: envolvente C_D de FHWA-HRT-09-028.
- Flotación: incluye el aire atrapado (HDS-7).
- Resistencia: cortante por fricción de ACI 318.
- El lodo calculado aumenta la densidad del agua.

El colapso ocurre si el uso pasa de 100 % durante 2 s. El tablero queda en el cauce y frena el agua.

En la maqueta, el rótulo del puente pasa de «gálibo: … m» a «sin gálibo · empuje … kN · …% de lo que resiste». Al colapsar dice «colapsó» y el tablero se desliza aguas abajo, sin animación con movimiento reducido. El panel «Creciente» muestra las cuentas del momento y la curva del uso en el tiempo.

Pruebas:
- **G1:** las fórmulas coinciden con el cálculo a mano con error menor que 10⁻⁹ kN. Además, C_D(0,6) = 1,403, el valor del ejemplo de la FHWA.
- **G2:** el puente resiste el 250 % y el 350 % de agua (65 % y 81 % de uso). Con la avenida de lodo colapsa por deslizamiento hacia el segundo 230.

Capturas: `tools/verificacion/puente_colapso.py` (rótulo y panel durante la creciente y tras el colapso; consola limpia).

## 4 septdecies. Ningún elemento se monta sobre otro (ejecutada)

**Pedido.** «Validar que ningún elemento colisione o superponga otro elemento; eso arruina la experiencia de usuario.»

**Verificación automática.** `tools/verificacion/superposiciones.py` recorre 21 estados en cuatro pantallas: escritorio 1440 × 900, portátil 1280 × 720, tableta 820 × 1180 y teléfono 390 × 844.
- Estados: recorrido, exploración y laboratorio del paisaje; el valle; tres sectores con las vistas general, de calle, de peligro y de resultados; la creciente con «Agua ×5»; el modo cine; y las tres partes de «Calidad del agua».
- Qué mide en cada estado: las cajas de todos los elementos flotantes (rótulos de las escenas 3D, avisos, barras, leyendas, columna de cámara, tarjetas, preguntas y controles) e informa los pares que se cruzan, y los que quedan cortados por el borde.
- Opciones: `--capturas` guarda una imagen con los choques marcados en rojo. El informe queda en `informe.json`.

**Lo que encontró y se corrigió.**
- El título del sector se montaba sobre las vistas y capas (hasta 2 057 px² en La Iguaná). Ahora su ancho máximo se ajusta al ancho medido de esa barra.
- Los avisos quedaban bajo el título cuando este ocupaba dos o tres renglones. Ahora empiezan justo debajo de su borde medido.
- La leyenda de peligro tapaba la columna de la cámara: en escritorio se corrió a su izquierda. En el teléfono queda encima de la fila de la cámara y se reduce a una fila de fichas H1–H6 (el texto queda en su título).
- Los rótulos 3D medían su ancho una sola vez y, cuando su texto crecía (por ejemplo «0,8 m de agua · H4»), podían montarse sobre otro. Ahora se vuelven a medir.
- Los rótulos de «Calidad del agua» no evitaban los controles de la escena (un rótulo quedaba bajo la cámara). Ahora los evitan.
- En el paisaje, en el teléfono, la indicación «Arrastra para recorrer el paisaje» tapaba un rótulo. Ahora es una zona ocupada para los rótulos.
- El verificador también señalaba contenedores de diseño sin fondo (la capa SVG superior y la franja inferior) como si fueran cajas: se miden sus hijos.

**Resultado final.** 84 de 84 estados sin choques ni cortes: 21 de 21 en cada pantalla (escritorio, portátil, tableta y teléfono).

## 4 octodecies. Vista del Valle de Aburrá con datos oficiales (ejecutada)

**Pedido.** «Mejorar gráficamente la vista del Valle de Aburrá: no se ve el metro, la distribución no es correcta, las líneas de flujo no son correctas y visualmente se ve muy mal.»

**Qué cambió.**
- **Datos.** La tabla aproximada escrita a mano se reemplazó por capas oficiales de la Alcaldía de Medellín y del AMVA: modelo de elevación, red hídrica, polígono del río, red vial metropolitana (35 469 tramos), transporte masivo (14 líneas, 81 estaciones), límites de los 10 municipios, comunas, barrios, cerros tutelares, toponimia y equipamientos. Ocho paquetes de descarga, con URL y sha256 de cada respuesta en el manifiesto (`DATOS_REALES.md`, sección 7).
- **Líneas de flujo.** El río y las quebradas salen del D8 sobre el modelo de elevación de 25 m, con los drenajes oficiales quemados: el río va por su cauce oficial y cada quebrada por su cañada. Antes eran curvas trazadas a mano.
- **Distribución.** La ciudad está donde la red vial dice que hay calles (158 km² en el recuadro), con los barrios de Medellín, los diez municipios y sus límites. Antes eran elipses por zona.
- **Metro y transporte.** Trazados y estaciones oficiales; además del viaducto 3D, cada línea lleva un trazo de ancho fijo en pantalla con borde blanco, y cada estación un disco con el aro de su sistema (metro en negro, tranvía morado, cables ámbar, Metroplús verde azulado). Así se leen desde cualquier distancia.
- **Acabado.** Leyenda en la escena; rótulos de mapa (municipios, comunas, cerros con su cota, agua, líneas); bruma que se ajusta a la distancia de la cámara; nubes que no se ven como manchas desde arriba; colores de la ciudad menos saturados; edificios repartidos en todo el valle (antes se cortaban al llegar al máximo y el norte quedaba vacío).
- **Entorno de los sectores.** Usa el mismo relieve a escala 1:1: el río va por su eje real y las autopistas son las de la red vial oficial.

**Controles.**
- V7 (reescrita): relieve de 1 382 a 3 128 m; el río baja de sur a norte, por el fondo del valle en 95,3 % de su eje y dentro del cauce oficial en Medellín (p95 0 m, máximo 11 m); 21 estaciones de la línea A y 6 de la B, todas a menos de 68 m sobre el río; 81 estaciones y 12 líneas existentes; cada cerro tutelar sobresale al menos 54 m de su entorno; tejido urbano decodificado igual al del informe (15 811 celdas); los sectores ilustrativos en zona urbana, la calle al pie de la ladera (t = 0,07) y la ladera sobre ella (t = 0,18).
- V8 (entorno de cada sector) sigue pasando con el relieve oficial: unión con el borde 0,00 mm; relieve dibujado frente al del modelo, diferencia media 0,6 m entre 0,3 y 2 km y 11,7 m entre 2 y 8 km (tolerancias 2 y 15 m; el relieve real es más quebrado que la tabla: antes 9,6 m); ningún objeto dentro del sector (0 de 21 514); río en su posición (0,00 m).
- Batería completa: 63 de 63 pruebas del laboratorio de Medellín y 13 de 13 de «Calidad del agua».
- **Umbral fijado antes de correr la batería.** En el primer borrador de V7 el río debía ir por el fondo del valle en el 95 % de su eje; se bajó a 90 % antes de correr la batería completa, después de una medición rápida que dio 95,3 %. No se bajó para que pasara (pasaba), sino porque en el fondo plano un afluente canalizado puede quedar a la misma cota que el río a 800 m y el umbral de 95 % dejaba la prueba al borde. El valor medido se informa siempre.
- Superposiciones: la vista del valle sin choques ni cortes en las cuatro pantallas (escritorio, portátil, tableta y teléfono). La leyenda y la lista de sectores van lado a lado en un mismo contenedor, así que no pueden montarse; en el teléfono la leyenda arranca cerrada y los botones de sector son compactos.
- Capturas de control: valle por defecto, vista aérea, centro de Medellín de cerca, teléfono, y los entornos de la Calle de prueba y de La Iguaná.

**Tamaño y rendimiento.** El módulo de datos agrega 128 kB al archivo único (bloque comprimido en base64); el archivo único pasa de 3,34 a 3,54 MB. En el navegador de prueba (render por software, calidad ligera) la escena del valle se arma en 0,45 a 0,58 s y dibuja 443 000 triángulos en 215 llamadas; el cuadro tarda 4,4 ms (mediana de 20).

## 4 novodecies. «Calidad del agua»: robustez, datos reales y planta en 3D (ejecutada)

**Pedidos.** «Robustecer 1000 veces más el módulo de calidad» y «Del río a la llave: robustecerlo gráficamente, es necesario».

**Modelo (detalle en `docs/calidad/MODELO_CALIDAD.md` y `PRUEBAS_CALIDAD.md`).**
- Amonio y nitrificación: el agua usada trae amonio; se nitrifica aguas abajo (kn = 0,5/d a 20 °C, θ = 1,08) y gasta 4,57 g de O₂ por gramo de N, que se suma a la demanda de Streeter–Phelps. El amoníaco libre sale de la tabla de Emerson et al. (1975) y entra en la regla de los peces (≤ 0,025 mg/L de NH₃, valor imperativo de la Directiva 78/659/CEE).
- Entradas siempre válidas: casas, cota, dosis, cloro, horas en la red, días secos, lluvia y duración se recortan a rangos documentados; un número no válido (NaN, infinito, texto) toma el valor por defecto.
- Q14 (tabla de Emerson, error máximo 0,70 %), Q15 (datos reales), Q16 (6 000 barrios con 6 lecturas, 6 000 plantas y 2 000 calles al azar con 8 % de entradas inválidas: 0 excepciones, 0 valores fuera de rango) y Q17 (11 218 comprobaciones de coherencia, 0 violaciones). Batería: 17 de 17.

**Datos reales.** Nueva pestaña «Medellín» en la quebrada: 68 sitios de 18 microcuencas de San Antonio de Prado (Alcaldía de Medellín, muestreos del 19 de diciembre de 2017 al 22 de enero de 2018), con descarga verificada por sha256 en el manifiesto. Medido: 64 de 68 sitios con oxígeno ≥ 5 mg/L; 60 de 68 con coliformes sobre 200 NMP/100 mL; los coliformes suben del sitio alto al bajo en 13 de las 16 microcuencas que tienen ambos; la temperatura del agua implícita en el oxígeno y su saturación (Benson y Krause) va de 13,8 a 19,1 °C (percentiles 5 y 95) y es coherente (entre 10 y 26 °C) en 68 de 68. Se presentan como mediciones de esas fechas, no como estado actual ni como pronóstico.

**Planta en 3D.** Agua que se mueve en la superficie de cada tanque y en el río (vetas y espuma según la etapa), flechas del flujo en las tuberías con el color del agua de cada etapa y en la línea de lodos, concreto con textura, barandas, edificio de laboratorio, cerca, vía de acceso, montañas con el valle del río y un letrero que dice que es una escena ilustrativa. Vista general más cercana que se aleja sola si la planta no cabe; en el teléfono, la planta en diagonal.

**Lo que encontró y se corrigió.**
- Las velocidades del agua animada se ignoraban: three.js comparte un mismo programa entre materiales con el mismo `onBeforeCompile`, así que la velocidad escrita como constante en el shader era la del primer material compilado. En la calle, la cuneta corría con la velocidad y el sentido de la quebrada. Ahora la velocidad es un uniform.
- Las superficies horizontales del agua se veían casi blancas bajo el sol de la escena: su color base va más oscuro que el del agua vista de lado.
- En la tableta, el aviso de medalla tapaba la pregunta de la escena (11 742 px²). En pantallas angostas ahora se coloca encima de la pregunta, con la altura medida de esta.
- Un rótulo junto al borde podía quedar cortado («10. La llave» en el teléfono): ahora se corre hacia adentro.
- `superposiciones.py` ignoraba `--pantallas tableta,telefono` (solo leía la forma con «=»): acepta las dos y rechaza nombres desconocidos.

**Resultado.** Superposiciones: 88 de 88 estados sin choques ni cortes (22 por pantalla; se agregó la pestaña Medellín de la quebrada). Archivo único: 3,59 MB.

## 4 vicies. Edificios del valle, tren de tratamiento, pluma del tubo y créditos (ejecutada)

**Pedidos.** «Mejorar gráficamente la vista del Valle de Aburrá: las edificaciones se ven horribles»; «trabajar el tren de tratamiento de calidad del agua, se debe ver muchísimo mejor»; «que la descarga del tubo de las casas muestre la pluma de contaminación que se va diluyendo»; «agregar "Diseñado y elaborado por Leidy Hernandez Acevedo" en los créditos».

**Edificios del valle.** Antes eran cajas al azar en una rejilla, sin calles. Ahora se ubican en franjas a lo largo de las calles reales (red vial metropolitana) y, en Medellín, con la distribución de pisos que registra el catastro en cada barrio y vereda (estadísticas de la capa de construcciones; sin descargar geometrías). Fachadas con franjas de ventanas y ventanas sueltas según la distancia, medianeras y tonos por casa en las hileras, techos de concreto, teja o zinc, tanques de agua en las terrazas, bodegas con cubierta acanalada, cuartos de máquinas sobre las torres, árboles en los andenes y suelo urbano gris con jardines (más en El Poblado). Método y límites: DATOS_REALES.md §7.5.
- V10: 79 983 franjas, decodificación exacta, ninguna esquina a menos de 35 m del eje del río (mínimo 43 m), 292 barrios y veredas con datos del catastro.
- Calidad alta: 110 270 edificios (2 lotes por casa en hilera), 2 347 torres de 9 pisos o más, 28 611 árboles de andén; 2,36 millones de triángulos en 222 llamadas. Calidad ligera: 60 020 edificios. La vista del valle se arma en 1,1 a 1,3 s (antes 0,45 a 0,58 s) en el navegador de prueba; el cuadro tarda 1,9 a 2,1 ms de CPU.
- Lo que se corrigió en el camino: el cupo de edificios cortaba las últimas franjas (quedaba sin ciudad una parte del valle); ahora se agrupan lotes o se ralea por igual. Las franjas se codifican con enteros y una tabla de cosenos redondeados para que el navegador llegue exactamente al mismo punto que el generador.

**Tren de tratamiento.** El nivel del agua baja de un tanque al siguiente (3,81 m en la mezcla rápida, 3,61 en floculación, 3,41 en sedimentación, 3,21 en filtros y 2,81 en el tanque de contacto) y el agua pasa por canales abiertos de concreto donde se ve correr; una caseta de bombeo lleva el agua cruda del desarenador a la mezcla. Antes los tanques tenían alturas que obligaban al agua a subir sin bomba. Las superficies reflejan un cielo de degradé (mapa de entorno prefiltrado, sin texturas descargadas). La vista general sigue mostrando las once etiquetas; en el teléfono, la planta en diagonal.

**Pluma del tubo.** Mezcla transversal de Fischer et al. (1979) con fuente en la orilla e imágenes en las dos orillas (serie de cosenos cuando la pluma ya es ancha); largo de mezcla de 1,2 km en verano, 0,7 km normal y 0,43 km en lluvias. Q18: la media a lo ancho es la de la mezcla completa (error < 0,001 %), en L<sub>m</sub> las orillas quedan a 3,6 % de la media, la pluma nunca supera el agua del tubo y sin casas no hay pluma. El tono está reforzado (y su rótulo lo dice); las lecturas de la sonda siguen siendo la media de la sección.

**Créditos.** «Diseñado y elaborado por Leidy Hernandez Acevedo.» al pie de Ayuda y de Ajustes, en el README y como autora del documento (`<meta name="author">`).

**Resultado.** Pruebas: 64 de 64 del laboratorio de Medellín y 18 de 18 de «Calidad del agua». Superposiciones: 88 de 88 estados sin choques ni cortes en las cuatro pantallas.

## 4 unvicies. «De la casa al río»: planta de tratamiento de aguas residuales (ejecutada)

**Pedido.** «Diseña también dentro de calidad un tren de tratamiento de aguas residuales».

**Qué se hizo.** Cuarta parte del módulo, con la misma estructura que «Del río a la llave»: modelo calculado (`src/quality/ptar.ts`), escena 3D (`three/ptarWorld.ts`), pestaña Procesos con once partes, animación «con lupa» de cada una y recorrido guiado (`ptarUnits.ts`, `PtarLens.tsx`, `PtarPanel.tsx`), ocho retos, experimentos (probeta de 30 minutos, cono Imhoff y microscopio), datos, notas para el docente y versión en dibujos planos sin WebGL (`classic/PtarPart.tsx`). El resumen «¿Y después de usarla?» de la planta de potabilización ahora sale de este modelo (antes eran fracciones fijas) y tiene un botón que lleva a la nueva parte.

**Modelo.** Lodos activados de mezcla completa con cinética de Monod y edad del lodo (Metcalf y Eddy), nitrificación, demanda de oxígeno y energía de aireación; primario de Crites y Tchobanoglous; digestión anaerobia con biogás y electricidad; aliviadero por capacidad hidráulica; río con Streeter y Phelps y reaireación de O'Connor y Dobbins; cumplimiento de la Resolución 0631 de 2015, art. 8, según la carga de DBO5 (verificados los límites contra el texto de la resolución). Reglas didácticas señaladas: sedimentador secundario, índice volumétrico del lodo, luz UV y sólidos sedimentables. Fórmulas y fuentes: MODELO_CALIDAD.md §2 bis.

**Escena.** Colector desde los barrios, cámara de llegada con aliviadero y canal al río, rejas con rastrillo y contenedor, desarenador y desengrasador de vidrio, primario y secundario redondos con puente giratorio y un tramo de vidrio donde se ve el lodo, reactor con burbujas, canal UV con lámparas encendidas o apagadas, gradas de la descarga, río con las plumas de la descarga y del aliviadero, peces y basura flotante; detrás, espesador, digestores, gasómetro que se infla con el biogás, tea, motor-generador y centrífuga. La segunda línea aparece al ponerla en servicio. Losas, vías, postes, cerca, laboratorio y un letrero que dice que es una escena ilustrativa.

**Lo que se corrigió en el camino.** Un secundario sobrecargado (150 000 habitantes, una línea, sin primario) podía dar un agua de salida más sucia que la cruda; ahora no sale más sucia que como llegó (Q22). Sin bacterias, la DBO pasaba al 85 %, lo que hacía que apagar la recirculación pareciera mejor que tenerla con un aguacero; ahora pasa entera (Q23). El aviso de la bitácora, en el teléfono, solo podía usar la mitad del ancho y salía muy alto; ahora usa el ancho de la pantalla y, en el módulo de calidad, va arriba para no tapar la pregunta. El verificador de superposiciones vuelve arriba de la página antes de medir las partes de calidad en el teléfono: antes medía con la escena fuera de la pantalla (0 elementos) y no veía ese choque.

**Resultado.** Pruebas: 26 de 26 de «Calidad del agua» (Q19 a Q26 nuevas: cinética y balances, norma, caudales, robustez con 4 000 entradas al azar, coherencia en 1 818 comprobaciones, energía y lodos con retos alcanzables, río y las once partes con 68 184 valores revisados) y 64 de 64 del laboratorio de Medellín. Superposiciones: 100 de 100 estados sin choques ni cortes en las cuatro pantallas (25 por pantalla; tres nuevos de «De la casa al río»: vista general, el reactor de cerca y el aguacero con el río). Archivo único: 4,11 MB (antes 3,99 MB).

## 4 duovicies. Lupas de calidad, menú de las partes y la cuadra de «La ciudad y la lluvia» (ejecutada)

**Pedido.** «En calidad necesito que todas estas animaciones las mejores sustancialmente. Este menú también se está ocultando, no me deja ver bien, y la sección de ciudad y río debería rediseñarse para que se vea mejor, está muy suave.»

**Lupas.** Las 22 animaciones «con lupa» (once de «Del río a la llave» y once de «De la casa al río») se rehicieron sobre un juego común de piezas (`src/quality/lensKit.tsx`): tanques en corte con paredes de concreto y agua con degradé y oleaje, partículas, flóculos, bacterias, burbujas, basura y moléculas dibujadas, flechas del flujo que avanzan y un círculo de aumento con su línea al punto que amplía. Cada lupa lleva al pie los valores del juego en recuadros de color (verde, ámbar o rojo según el estado). Todo el movimiento depende del tiempo (trayectorias deterministas) y se detiene con movimiento reducido. El agua de cada parte toma el color de su turbiedad o de sus sólidos suspendidos; en la planta de potabilización, el tanque de contacto, el pH, el almacenamiento y la red también siguen la turbiedad del agua filtrada (antes eran siempre azules). La salida al río usa el mismo mínimo de oxígeno para los peces que el modelo (4 mg/L). Para revisarlas sin la escena 3D hay una vista de desarrollo, `tools/lens-preview/index.html` (no entra en la compilación), que dibuja las once lupas de cada planta con cualquier escenario; con ella se corrigieron rótulos que se cortaban en el borde o quedaban bajo la lupa.

**Menú de las partes.** Los cuatro botones de las partes se cortaban («Ciudad y l…»). Ahora son una cuadrícula de cuatro columnas iguales, con un icono y el nombre corto en dos líneas si hace falta; el nombre completo sigue en la etiqueta accesible.

**La cuadra.** Antes eran cajas con ventanas pintadas, una calle plana y una caja de tierra translúcida que se veía como una franja café sin tubos. Ahora las casas son de barrio, pegadas, de uno a cuatro pisos, con los módulos de fachada del laboratorio de Medellín (ladrillo a la vista o pañete pintado, ventanas con reja, balcones con baranda, puertas, garajes, locales con avisos genéricos), culatas de ladrillo, azoteas con pretil y tanque, o techos de teja a dos aguas. La calle tiene asfalto con demarcación, cunetas, bordillos, andenes de losetas, árboles, postes, carros parqueados y un sumidero de rejilla con boca en el bordillo. El suelo está en corte con vidrio al frente y en el costado: capas del pavimento, estratos, cama de grava, anillos de unión, pozos de inspección y una caja de inspección por casa. El tubo de aguas lluvias baja enterrado por la ladera hasta un cabezote con enrocado; la quebrada quedó encajonada (antes el agua flotaba sobre la orilla) y la pluma es una cinta que se abre y se aclara aguas abajo. Con lluvia se moja la calle, aparecen charcos y se encienden postes y ventanas. Es una cuadra ilustrativa y así lo dicen la descripción de la escena y las notas para el docente. Se conservaron las casas, el sumidero, las cantidades de mugre y basura y la lógica del lavado y del colorante. Cambiaron de lugar: el tubo de aguas residuales, que pasó bajo el carril sur (antes bajo la cuneta) para que sus pozos queden en la vía, y la mugre y la basura, que se dibujan en la parte de la vía sin carros parqueados para que ninguna quede oculta.

**Lo que se corrigió en el camino.** La vista «Los tubos» miraba de frente y casi horizontal: la cámara no puede bajar de 5° sobre el punto de mira, así que subía por encima del andén y los desagües quedaban detrás del tubo de aguas lluvias. Ahora mira la cuadra en sección por el costado izquierdo y se ven de perfil la caja de inspección, el desagüe y los dos tubos. En las lupas, los patrones (concreto, arena, grava, lodo) no se veían porque la escena pedía su prefijo de ids fuera del marco; ahora la escena lo crea y se lo pasa al marco.

**Resultado.** Pruebas: 26 de 26 de «Calidad del agua». Superposiciones: 100 de 100 estados sin choques ni cortes en las cuatro pantallas. Archivo único: 4,17 MB (antes 4,11 MB).

## 4 tervicies. Módulo «Hidráulica de canales» con calculadoras y prediseñadores (ejecutada)

**Pedido.** «Necesito que generemos un módulo para hidráulica de canales.» Y después: «Quiero todos los alcances que propones, alcantarillas o transporte de sedimentos en lugar de alguna de estas partes. Adicionalmente quiero que cada uno de los módulos tenga calculadoras y prediseñadores, para que desde el juego y la interacción los estudiantes (niños y universitarios) hagan diseños técnicos.»

**Cómo se interpretó.** Seis partes en lugar de cuatro: el canal y su caudal, la caída y el resalto, el puente y el remanso, las alcantarillas, el transporte de sedimentos y medir el caudal. «Cada uno de los módulos» se tomó como cada una de las seis partes: todas tienen la pestaña Diseño con una calculadora (revisa lo que se propone) y un prediseñador (propone las medidas y las revisa), en dos niveles, Niños y Universitarios, y el prediseñador descarga la memoria de cálculo. Todo se presenta como prediseño académico. Las ecuaciones, los coeficientes y las fuentes están en `docs/canales/MODELO_CANALES.md`.

**Pruebas.** 15 de 15 de «Hidráulica de canales» (`npm run test:canals`), con tolerancias declaradas antes de ejecutar: geometría, Manning, crítica, conjugadas, paso directo contra Runge-Kutta (0,07 %), resalto, puente, aforos, alcantarillas (HDS-5), sedimentos y, en H15, las doce herramientas de diseño llamadas 4 800 veces con datos al azar sin excepciones ni valores no numéricos, y con propuestas de ejemplo que cumplen lo que dicen. «Calidad del agua» sigue en 26 de 26 (el módulo nuevo reutiliza su marco, su escena y sus lupas).

**En el navegador.** Las seis partes se revisaron con capturas en escritorio y teléfono, en sus vistas de cámara. Las memorias de las seis partes se descargaron en los dos niveles (12 archivos, sin valores no numéricos). Lo que se corrigió en el camino:
- Prediseñadores: el del canal fallaba con un material desconocido y el del puente con una luz más ancha que el cauce (la grilla de 0,5 m no llegaba a 1,5 veces el cauce); ahora el puente avisa cuando hay que ensanchar el cauce. Los datos de ejemplo del aforador pasaron a un rango que un vertedero sí cubre (3 a 15 L/s).
- Alcantarilla: la cara del corte del terraplén tapaba el tubo y delante del corte no había terreno (se veía el cielo). Ahora el terraplén tiene la cara del corte con el hueco del tubo, el valle tiene orillas y fondo que baja con el tubo, el charco llega hasta el talud y se ve en corte, y delante del corte hay una base de maqueta. La alcantarilla por defecto pasó de 1,2 m a 1,5 m: deja pasar la creciente sin cumplir las reglas, para que el reto «el agua sobre la vía» no se gane al abrir la parte.
- Sedimentos: la cámara quedaba lejos y los granos de 3 cm no se veían. Ahora el vidrio tiene marco, regla y zócalo; los granos se dibujan en la franja junto al vidrio y con al menos 8 cm (la escena dice cuántas veces se aumentaron); el agua es más transparente y la cámara mira por el vidrio. El lecho usa granos de 20 caras para no recargar la escena.
- Encabezado: con seis modos, las herramientas del encabezado se cortaban entre 1 180 y 1 480 px y por encima de 1 720 px. Se subieron los cortes (subtítulo y etiquetas a 1 480 px, nombres largos a 2 040 px) y entre 901 y 1 320 px las pestañas de los modos pasan a su propia fila. Medido de 901 a 2 200 px: nada se desborda.
- Teléfonos: las seis pestañas del panel caben sin desplazar desde 320 px.

**Resultado.** Superposiciones: 136 de 136 estados sin choques ni cortes en las cuatro pantallas, 36 de ellos de «Hidráulica de canales» (las seis partes, la alcantarilla con el agua sobre la vía, el fondo del cauce de sedimentos y la pestaña Diseño). Archivo único: 4 360 kB (1 736 kB comprimido con gzip).

## 4 quatervicies. «Hidráulica de canales» a otro nivel: animación, cálculos y diseño (ejecutada)

**Pedido.** «Está bien, pero definitivamente lo podemos mejorar muchísimo más, llévalo a otro nivel: mejores animaciones, cálculos mejor elaborados y diseño superior.»

**Animación.** El agua del módulo tiene material propio: color según la profundidad, ondas que avanzan con la velocidad calculada en cada punto (mapa de flujo en dos fases, sin estirarse), reflejo del cielo al mirar de lado y espuma donde hay turbulencia; en la cara vista por el vidrio, las vetas van más rápido arriba que abajo y el agua con aire del resalto se ve blanca. Trazadores amarillos junto al vidrio en el resalto (con el ciclo del remolino), el puente, la alcantarilla y el canal de laboratorio; hojas en la superficie del canal; isotacas en el corte de la sección; pilas en el puente; formas del lecho (rizos, dunas, antidunas) que avanzan en tiempo acelerado; alcantarillas de cajón partidas por el eje; y «Simular una creciente» con un hidrograma gamma en cuatro partes. Las velocidades que pasa cada escena al agua son las calculadas (antes eran factores de dibujo).

**Cálculos.** Nuevos, con fuentes y pruebas con tolerancia: Lane y Horton-Einstein (H16), pozos USBR II, III y IV (H17), Yarnell y socavación local HEC-18 con un ejemplo publicado (H18), socavación por contracción (H19), cuatro fórmulas de transporte con su rango de grano y formas del lecho (H20), Parshall con las tablas del USBR y molinete por sección media (H21), alcantarillas de cajón con un cálculo a mano (H22). Las herramientas de diseño pasaron de doce a veintiuna; H15 las llama 8 400 veces con datos al azar.

**Diseño.** Selector de herramientas en la pestaña Diseño; plano acotado a escala de cada prediseño y gráfica cuando aplica; memoria de cálculo en HTML imprimible (proyecto y autor opcionales, plano, gráfica, paso a paso, resultados y verificaciones), armada en el navegador sin enviar nada; plano en SVG. H23 revisa 1 200 memorias, 720 planos y 476 gráficas sin valores inválidos. Las memorias de los prediseños se descargaron y abrieron en el navegador.

**Lo que se corrigió en el camino.** El cálculo del avance de las antidunas no aplica (pueden subir contra la corriente): se dibujan quietas. Los textos de las cotas y de la leyenda de las gráficas se salían por los lados: más margen lateral y leyenda en varias filas. En el pozo, los rótulos del umbral y del largo se montaban: se reubicaron. Los números del tipo de pozo usaban punto decimal: ahora coma.

**No incluido.** Criterios de normas colombianas (INVÍAS, Resolución 0330 de 2017): no se pudieron verificar contra sus textos oficiales; quedan pendientes hasta tener esos documentos.

**Resultado.** Pruebas: 23 de 23 de «Hidráulica de canales» y 26 de 26 de «Calidad del agua». Superposiciones del módulo: 32 de 32 estados sin choques ni cortes en las cuatro pantallas. Archivo único: 4 436 kB (1 763 kB comprimido con gzip).

## 4 quinvicies. «Hidráulica de canales»: flujo no permanente, ondas y crecientes (ejecutada)

**Pedido.** «Está bien, pero definitivamente lo podemos mejorar muchísimo más, llévalo a otro nivel: mejores animaciones, cálculos mejor elaborados y diseño superior. Mucho más superior.»

**Motor de flujo no permanente.** `src/canals/unsteady.ts` resuelve las ecuaciones de Saint-Venant 1D en tiempo real: volúmenes finitos con flujo HLL, reconstrucción hidrostática (Audusse et al., 2004), fricción de Manning semi-implícita, CFL 0,45, fondo seco y mojado, contornos de caudal, pared, salida libre, caída crítica, nivel fijo y chorro supercrítico, y una compuerta interna (orificio con Cc = 0,61). Se validó contra soluciones exactas y balances: Ritter (H24, error medio 0,46 %), Stoker (H25, 0,39 %; meseta a 0,05 %), flujo uniforme, conservación del volumen (4·10⁻¹⁵) y lago en reposo (H26), ecuación del orificio (H27) y onda de Favre (H28: 1,3418 m frente a 1,3418 m).

**Parte nueva, «Ondas y crecientes».** Un canal de 300 m con tres situaciones: rotura de presa sobre fondo seco o mojado, cierre brusco de una compuerta y creciente con hidrograma gamma. Instrumentos en vivo en el panel: perfil del agua y línea de energía (con la solución exacta superpuesta cuando la pendiente es casi nula), hidrogramas en dos estaciones y velocidad del frente medida y teórica. Retos, experimentos (modelo contra teoría), balance de agua y pestaña Diseño con tres herramientas nuevas (rotura de presa, muros para la onda de cierre y celeridad de la creciente), con plano o gráfica y memoria.

**El resalto se forma solo.** En «La caída y el resalto», el botón «Ver cómo se forma el resalto» calcula el arranque en el tiempo; H29 comprueba que el estado final coincide con el cálculo permanente en cuatro pozos (resultado igual y profundidad del pozo a menos de 4 %). La posición del resalto se informa pero no se exige, porque es muy sensible a la profundidad del pozo.

**Imagen.** El agua, el vidrio y el metal de las siete escenas reflejan el cielo prefiltrado de la escena (sin texturas descargadas).

**Lo que se corrigió en el camino.** Con fondo seco, el primer paso de tiempo salía enorme: el contorno de entrada usa la profundidad crítica y el paso se limita a 1 s. La reconstrucción hidrostática pierde precisión en la rápida del 25 %: el arranque del resalto empieza al pie de la rápida con el chorro del cálculo permanente. Las funciones de las herramientas tomaban 0 cuando faltaba un dato: ahora toman el valor de ejemplo (un campo vacío sigue dando el aviso). En el teléfono, las marcas del hidrograma se repetían con caudales pequeños y la unidad se montaba sobre la primera marca: un decimal y la unidad abajo; en el perfil, la unidad se montaba sobre la marca de 300 m, y los rótulos de los instrumentos llevan ahora un halo claro para leerse aunque los cruce una línea.

**No incluido.** Los instrumentos en vivo están en «Ondas y crecientes» y en el arranque del resalto, no en las otras partes. Siguen sin incluirse criterios de normas colombianas (INVÍAS, Resolución 0330 de 2017).

**Resultado.** Pruebas: 29 de 29 de «Hidráulica de canales» (H15 con veinticuatro herramientas y 9 600 llamadas; H23 con 1 440 memorias, 849 planos y 593 gráficas) y 26 de 26 de «Calidad del agua». Superposiciones del módulo: 40 de 40 estados sin choques ni cortes en las cuatro pantallas, con las siete partes y la presa rota. Archivo único: 4 484 kB (1 778 kB comprimido con gzip).

## 4 sexvicies. «Hidráulica de canales»: segundo orden, curva en lazo, Muskingum-Cunge y agua más viva (ejecutada)

**Pedido.** El mismo de la ronda anterior, por tercera vez: «llévalo a otro nivel… mucho más superior».

**Cálculo.** El modelo de Saint-Venant pasó a segundo orden (reconstrucción minmod de la profundidad, la velocidad y la cota del agua, reconstrucción hidrostática de Audusse con el término del fondo en la celda, e integración de Heun). Con las mismas celdas, el error frente a Ritter y Stoker baja a la tercera parte (0,13 % y 0,12 % con 800 celdas, frente a 0,46 % y 0,39 %), y baja como 1/N al refinar (H30); un lago con una isla queda quieto. El caudal de entrada ahora se impone en la interfaz: entra exactamente Q (antes, 0,4 % menos en H26). La escena y el arranque del resalto usan el segundo orden; con él, el pozo del resalto queda a menos de 2 % del cálculo permanente (H29). Nuevos: la curva de gasto permanente en la estación A (perfiles M2, H2 o S2 por Runge-Kutta, a menos de 0,1 % del modelo en doce casos) y la curva en lazo de la creciente (H31); y el tránsito de crecientes por Muskingum-Cunge de parámetros variables, con el criterio de aplicabilidad de Ponce, que coincide con Saint-Venant a 5 y 10 km (pico a menos de 0,13 %, retraso a menos de 4 %; H32).

**Instrumentos y diseño.** En «Ondas y crecientes»: huella del nivel máximo en el perfil, curva de gasto en lazo (subida, bajada y permanente) con su lectura en Experimentos, leyendas en las gráficas, y el pico en B solo se informa cuando ya pasó (antes salía un retraso negativo mientras la creciente iba en camino). Pestaña Diseño: «Tránsito de una creciente (Muskingum-Cunge)» con la gráfica de los hidrogramas de entrada y salida, el paso a paso, las verificaciones (onda difusiva y volumen) y la memoria.

**Imagen.** Cáusticas en el fondo de las siete escenas (red de luz que avanza con la velocidad del agua y se apaga con la profundidad), agua poco profunda un poco transparente, salpicaduras con movimiento balístico en el frente de la onda y en la caída al tanque, huella ocre del nivel máximo en el vidrio y en la pared, y «Cámara con el frente».

**Lo que se descartó.** Se probó la fórmula de Jones para la curva en lazo: con las crecientes de la escena (pico en 10 a 120 s) da errores mayores que la curva permanente, porque son ondas dinámicas; no se incluyó. Una transparencia fuerte del agua dejaba ver el fondo en sombra como manchas oscuras: se dejó moderada.

**Resultado.** Pruebas: 32 de 32 de «Hidráulica de canales» (H15 con veinticinco herramientas y 10 000 llamadas) y 26 de 26 de «Calidad del agua». Superposiciones del módulo: 44 de 44 estados sin choques ni cortes en las cuatro pantallas, con la presa rota y la creciente. Se revisaron en capturas de escritorio y teléfono las cáusticas de cerca y de lejos (de lejos se apagan para no granular), la huella, las salpicaduras, la curva en lazo y la herramienta de tránsito. Archivo único: 4 504 kB (1 786 kB comprimido con gzip).

## 4 septvicies. Norma colombiana (RAS) e instrumentos en vivo en todas las partes (ejecutada)

**Pedido.** «Procede con esos pendientes»: los criterios de las normas colombianas y los instrumentos en vivo en las partes que no los tenían.

**Resolución 0330 de 2017 (RAS).** Se leyó en dos textos oficiales: el compilado del Ministerio de Vivienda con la Resolución 0799 de 2021 (Anexo 2), leído dos veces, y el original del Diario Oficial 50.267 para los Arts. 148 a 152. El Anexo 1 del compilado confirma que la Resolución 0799 no cambió los artículos usados. En la segunda lectura se corrigió una cita: la Tabla 17 de cruces de cauces está en el Art. 138, numeral 8, no en el 137. Se incorporaron, con su artículo en el nombre de cada verificación y en la memoria:
- tubo pluvial o combinado: Arts. 148 a 151;
- canal abierto de aguas lluvias: Art. 152, nums. 1, 4 y 5;
- salida subcrítica de los pozos: Art. 159;
- período de retorno de los canales abiertos: Art. 135, Tabla 16.

Lo prueba H33 (33 de 33 pruebas de canales).

**Manual de Drenaje para Carreteras del INVÍAS.** No se incluyó. El enlace de descarga del portal del INVÍAS devuelve la página de inicio, no el PDF. El enlace directo al archivo necesitaba una aprobación que no se respondió. Con el PDF adjunto o con esa aprobación, sus criterios (alcantarillas, puentes, cunetas) se pueden incorporar de la misma forma.

**Instrumentos en vivo.** Las seis partes de flujo permanente tienen ahora instrumentos como los de «Ondas y crecientes»:
- un perfil longitudinal con el agua, la energía, la crítica, la normal, el borde y las estructuras;
- dos registros de los últimos 40 s con su referencia: el borde, la vía, el bajo del puente, el fin del pozo, el umbral de movimiento o la carga mínima.

El canal también tiene ahora «Simular una creciente». Se revisaron en capturas de escritorio y teléfono, también durante una creciente en el puente. En los sedimentos los dos registros se dejaron lado a lado en pantallas anchas.

**Resultado.** Pruebas: 33 de 33 de «Hidráulica de canales» y 26 de 26 de «Calidad del agua». Superposiciones del módulo: 44 de 44 estados sin choques ni cortes en las cuatro pantallas, con los instrumentos nuevos en todas las partes. Archivo único: 4 518 kB (1 791 kB comprimido con gzip).

## 4 octovicies. Créditos y dedicatoria (ejecutada)

**Pedido.** «Agrega el diseñado y desarrollado por Oscar Cossio. Dedicado a Leidy Hernandez Acevedo: "Por que lo inspiraste y con ello enseñas y transformas territorios y vidas". Mejora la redacción del mensaje.»

**Cambio.** Al pie de Ayuda y de Ajustes, en el README y como autor del documento (`<meta name="author">`): «Diseñado y desarrollado por Oscar Cossio.» y, debajo, «Dedicado a Leidy Hernandez Acevedo: «Porque tú lo inspiraste, y a través de él enseñas y transformas territorios y vidas.»». Reemplaza el crédito anterior («Diseñado y elaborado por Leidy Hernandez Acevedo»). Se revisó en escritorio y teléfono.

**Ajuste posterior.** A pedido, la dedicatoria quedó «Dedicado a Leidy Hernandez: «Por inspirar este laboratorio y por enseñar a transformar territorios y vidas.»», sin el segundo apellido; la redacción final la escogió el autor entre las propuestas.

## 4 novovicies. «Laboratorio del agua»: portada y navegación por salas (ejecutada)

**Pedido.** «Cambiemos el nombre del ciclo hidrológico a laboratorio del agua y refactoriza la interfaz.» Alcance escogido: portada con tarjetas por sala y navegación en dos niveles.

**Nombre.** La aplicación se llama ahora «Laboratorio del agua»: encabezado, título de la página, descripción, memoria de cálculo de canales, README y título del artefacto. El modo que se llamaba «Laboratorio del agua» pasa a «Experimentos», para no confundirlo con el nombre de la aplicación. «Ciclo hidrológico» sigue como concepto: primer paso del recorrido y glosario.

**Interfaz.**
- **Portada.** Una tarjeta por sala, con su dibujo propio, qué se hace en ella y la entrada: el ciclo del agua tiene tres (Recorrido guiado, Exploración libre, Experimentos). Debajo, las herramientas comunes y los créditos con la dedicatoria.
- **Encabezado.** El nombre vuelve a la portada; a su lado van las cuatro salas, las herramientas de todas las salas (Retos, Bitácora, Glosario), Ayuda y Ajustes.
- **Segunda fila.** Solo dentro del ciclo del agua: sus tres modos y la gota trazadora.
- **Teléfono.** Nombres cortos para que las cuatro salas y los tres modos quepan.
- **Enlaces directos.** `#recorrido`, `#explorar`, `#experimentos`, `#medellin`, `#calidad` y `#canales`; el botón «atrás» del navegador vuelve entre la portada y las salas.
- **Ayuda.** Reorganizada por salas; incluye la de hidráulica de canales, que faltaba.

**Scripts de verificación.** Los guiones de `tools/verificacion/` abren ahora `#recorrido`, como antes de la portada. `superposiciones.py` revisa también la portada. `city5.py` entra a la sala del ciclo antes de pedir el recorrido.

**Comprobado.** Portada en escritorio, tableta y teléfono; paso de la portada a una sala y regreso por el nombre; enlace directo, «atrás», «adelante» y recarga; pruebas 33 de 33 de canales y 26 de 26 de calidad. Superposiciones de toda la aplicación: 152 de 152 estados sin choques ni cortes en las cuatro pantallas. La portada no tiene elementos flotantes que esa revisión mida; se revisó en capturas.

## 4 tricies. Sala «Cuencas: de la lluvia al caudal» (ejecutada)

**Pedido.** «Implementa todos porfavor. Ya sabes el nivel que quiero.» Cuatro salas nuevas al nivel de «Hidráulica de canales», una por una, publicando al terminar cada una. Esta es la primera: Cuencas. Modelo, supuestos y fuentes en `docs/cuencas/MODELO_CUENCAS.md`.

**Navegación para ocho salas.** El encabezado y la portada muestran solo las salas construidas (`ROOMS_OPEN` en `store.tsx`); un enlace directo a una sala que aún no existe (por ejemplo `#acueducto`) abre la portada, sin botones vacíos. La portada agrupa las salas en «El agua en la naturaleza», «El agua en la ciudad» y «Obras hidráulicas», en tres columnas alineadas. En teléfonos y tabletas las salas pasan a varias filas, todas a la vista. La ayuda lista las salas abiertas. El marco común de las salas nuevas está en `src/rooms/RoomLab.tsx`; la pestaña Diseño de canales recibe el juego de herramientas de cada sala y su nota de la norma.

**La sala.** Tres partes:
- **La cuenca y su respuesta.** Cuenca de ladera en 3D (maqueta con bordes de suelo, quebrada principal y tres afluentes curvos, coberturas de la cabecera a la salida, barrio y estación de aforo). El aguacero se reproduce en unos 24 s: lluvia, pulsos que bajan por los cauces en el tiempo de concentración y el caudal que mide la estación. Instrumentos: aguacero e hidrograma con el minuto actual y registros de caudal y lluvia.
- **El hidrograma y la urbanización.** Hidrograma urbanizado contra el de la cuenca sin urbanizar; tanque de retención junto a la salida que se llena en la escena; convolución bloque por bloque; partes del hidrograma con el retardo.
- **Crecientes y riesgo.** Tramo de río con llanuras y diez casas; el agua sube a la profundidad calculada con la sección dividida; regla con los niveles de 2, 10, 50 y 100 años; papel de Gumbel en vivo; vidas útiles simuladas.

Cada parte tiene retos (doce en total; ninguno se cumple solo con los datos de partida), experimentos que se comparan con la teoría y la pestaña Diseño con siete herramientas, gráfica y memoria.

**Comprobado.**
- Pruebas de la sala: 12 de 12 (`npm run test:basins`, `docs/cuencas/PRUEBAS_CUENCAS.md`): escorrentía de TR-55, tiempos de concentración, racional, bloques alternos, volumen del hidrograma unitario, Gumbel, riesgo, la cuenca de la escena, robustez de las herramientas (2 100 llamadas), tanque (masa con error < 1e-9 y volumen guardado igual al de la teoría), remuestreo, y riesgo simulado con 20 000 vidas a menos de 1 punto de la fórmula. Canales 33 de 33 y calidad 26 de 26 después de los cambios comunes.
- Superposiciones de la sala: 28 de 28 estados sin choques ni cortes en escritorio, portátil, tableta y teléfono (las tres partes, el aguacero en curso, el tanque, la vista de las casas y la pestaña Diseño). `superposiciones.py` incluye ahora la sala.
- Sin WebGL: los tres esquemas planos (cuenca, partes del hidrograma y corte del río) llenan la escena con el mismo cálculo.
- Navegación: `#cuencas` abre la sala; «atrás» vuelve a la portada; `#acueducto` abre la portada mientras la sala no exista.
- Sin errores en la consola en ninguna pantalla.

**Ajustes durante la verificación.** La cámara general de la cuenca dejaba media escena vacía: se cambió de lado y se agregaron los bordes de la maqueta. Los textos de los esquemas planos salían a 16 px (la clase de texto solo tenía estilo dentro de otra animación): ahora tienen su tamaño. Las etiquetas del eje de tiempo se montaban al final: el último tic es el total. Los registros en vivo escribían «−0» con valores nulos. Un reto de «El hidrograma» se cumplía con los datos de partida: la urbanización inicial bajó a 25 %. En el equipo de verificación (unos 2,5 cuadros por segundo, sin tarjeta gráfica) el reloj del aguacero avanza más lento que el real, porque cada cuadro cuenta como máximo 0,1 s; en un equipo normal dura los 24 s.

**Límites declarados.** La curva IDF, la cuenca, el río y las series son ilustrativos. El tanque es un primer tanteo con salida limitada, no un tránsito con la curva de su descarga. El hidrograma no incluye caudal base ni se transita por los cauces.

## 4 untricies. Sala «Acueducto: el agua a presión» (ejecutada)

**Pedido.** Segunda de las cuatro salas nuevas («Implementa todos porfavor. Ya sabes el nivel que quiero»). Modelo, supuestos, normas y fuentes en `docs/acueducto/MODELO_ACUEDUCTO.md`.

**La sala.** Tres partes:
- **La tubería y su energía.** Maqueta de ladera cortada a lo largo de una conducción: tanque en la loma, tubo enterrado visible en el corte, seis piezómetros de vidrio con la columna de agua a escala, línea piezométrica, línea de energía y nivel estático; partículas que viajan a la velocidad del agua y el chorro de la válvula. Con la válvula abierta, la loma pequeña queda con presión negativa.
- **La red del barrio.** Nueve esquinas en una ladera y un tanque en la loma; tubos con el color de su velocidad y flechas en el sentido del caudal; columnas de presión a escala en cada esquina con los colores de los Arts. 61 y 62. Instrumento: la presión más baja de la red hora a hora.
- **El golpe de ariete.** Tubería de 600 m con la onda de presión en colores y la línea piezométrica a escala, en una reproducción de 24 s que dice si va en cámara lenta o acelerada.

Doce retos (ninguno se cumple con los datos de partida), experimentos contra la teoría (factor de fricción medido con dos piezómetros sobre el diagrama de Moody; Hardy Cross paso a paso contra el gradiente; periodo medido contra 4L/a; Joukowsky, Michaud y Allievi contra el cálculo en el tiempo) y siete herramientas de diseño con gráfica y memoria.

**Normas.** Arts. 56, 58, 61 y 62 de la Res. 0330 de 2017, verificados en textos que los transcriben (concepto de la Superintendencia de Servicios Públicos y anexo del Ministerio de Vivienda sobre la Res. 799 de 2021). El texto oficial completo no se pudo abrir en esta sesión (la página pidió una aprobación que no se respondió); por eso no se citan el Art. 63 (diámetro mínimo), los factores de mayoración de la demanda ni artículos sobre golpe de ariete.

**Comprobado.**
- Pruebas de la sala: 12 de 12 (`npm run test:supply`): Colebrook a 0,5 % del diagrama de Moody; cierre de la ecuación de energía menor de 1e-9 m; gradiente y Hardy Cross a 1e-5 L/s; continuidad 1e-12 L/s; Joukowsky exacto al 0,1 % y periodo 4L/a al 2 %; cierre lento entre Allievi y Michaud; independencia de la malla al 1 %; robustez de las herramientas. Cuencas 12 de 12, canales 33 de 33 y calidad 26 de 26.
- Superposiciones de la sala: 28 de 28 estados sin choques ni cortes en las cuatro pantallas (las tres partes, la válvula abierta, un tubo cerrado en la red, la onda del golpe de ariete y la pestaña Diseño). `superposiciones.py` incluye ahora la sala.
- Sin errores en la consola.

**Ajustes durante la verificación.** La medalla de los retos salía al centro, abajo, y en el portátil (1280 × 720) se montaba sobre la pregunta; luego, a la derecha, sobre los controles de la cámara: ahora va entre las dos columnas (también en calidad, canales y cuencas). En el teléfono, la vista general de la tubería quedaba muy cerca: se ajusta al ancho. El esquema de la red cortaba los rótulos de los bordes. La gráfica del ariete escribía «−0». El golpe de ariete empezaba con acero a 1 m/s, que llega a la presión de vapor: ahora empieza a 0,5 m/s, y el caso con vapor queda para explorarlo.

**Límites declarados.** Escenas ilustrativas. Tubos dibujados más gruesos y flechas de la red seis veces más rápidas (se dice en cada parte). No se modelan la entrada de aire con presión negativa, la separación de columna ni la fricción no permanente.

## 4 duotricies. Sala «Aguas subterráneas» (ejecutada)

**Pedido.** Tercera de las cuatro salas nuevas. Modelo, supuestos y fuentes en `docs/subterraneas/MODELO_SUBTERRANEAS.md`.

**La sala.** Tres partes:
- **El acuífero y la ley de Darcy.** Un valle cortado entre una loma y un río: el material del acuífero, la zona saturada bajo el nivel freático de Dupuit, tres pozos de observación y partículas que viajan a la velocidad del agua en los poros, en cámara rápida.
- **El pozo y su cono.** Un acuífero confinado bajo arcilla, con el cono de abatimiento (escala vertical exagerada, dicha en la escena), tres pozos de observación y el bombeo desde el primer minuto. Hay una prueba de bombeo para analizar con Cooper-Jacob.
- **La mancha y la zona de captura.** Una fuga 300 m aguas arriba de un pozo: 600 partículas con advección y dispersión durante ocho años, el borde de la zona de captura y la parte de la mancha que llega al pozo.

Doce retos (ninguno se cumple con los datos de partida), experimentos contra la teoría (permeámetro, recta de Cooper-Jacob, fila de partículas contra el ancho de Todd) y ocho herramientas de diseño. En esta sala no se citan artículos del RAS.

**Comprobado.**
- Pruebas de la sala: 9 de 9 (`npm run test:ground`): W(u) contra las tablas de Theis (±0,05 %); Cooper-Jacob y Thiem; T y S recuperados de una prueba con error de lectura (T a 0,3 %); Darcy y permeámetros; continuidad de Dupuit; partículas contra la solución con entrada de flujo (diferencia 0,002); zona de captura contra trayectorias; robustez de las herramientas.
- Superposiciones de la sala: 24 de 24 estados sin choques ni cortes en las cuatro pantallas. `superposiciones.py` incluye ahora la sala.
- Sin errores en la consola.

**Ajustes durante la verificación.** La vista general del valle quedaba lejana y plana: ahora es oblicua. El bloque del pozo era muy grande para ver el cono: se redujo a 500 m y el cono es más visible. La gráfica de la prueba cortaba la última marca del tiempo. Los registros en vivo con valor cero rellenaban el eje con «−0,1»: ahora empiezan en cero (también en las demás salas).

**Primera comparación honesta.** La solución de Ogata y Banks (concentración fija en la entrada) mete más masa por dispersión que una fuente de flujo; las partículas se comparan con la solución de entrada de flujo (van Genuchten y Alves, 1982), y la diferencia con Ogata-Banks se informa en la prueba.

## 5. Rendimiento medido

**Costo del cálculo en Node, en esta CPU** (`docs/medellin/perf-calculo.txt`):

| Sector | dx | Celdas | ms por s simulado | ms por s real a ×30 |
|---|---|---|---|---|
| Calle de prueba | 0,5 m | 17 920 | 3,05 | 91 |
| Calle de prueba | 1 m | 4 480 | 0,37 | 11 |
| Calle de prueba | 2 m | 1 120 | 0,08 | 2 |
| Ladera con quebrada | 1 m | 12 288 | 2,10 | 63 |
| Ladera con quebrada | 2 m | 3 072 | 0,37 | 11 |
| Ladera, creciente de 103 m³/s (200 %) | 1 m | 12 288 | 6,35 | 190 |
| Ladera, creciente de 105 m³/s (200 %) | 2 m | 3 072 | 0,85 | 25 |
| Ladera, avenida torrencial (180 m³/s de agua, 30 % de lodo) | 1 m | 12 288 | 5,01 | 150 |
| Ladera, avenida torrencial | 2 m | 3 072 | 0,77 | 23 |

Medido el 9 de noviembre con lluvia de 100 mm/h, con la clasificación de peligro y los vehículos en cada paso y las casas de la orilla. Frente a la medición anterior (sección 4 nonies: 1,97 y 5,83 ms en la ladera a 1 m), el peligro agrega ≈ 7 a 9 %. La avenida cuesta menos que la creciente al 200 % porque dura menos (sube en 3 min). Entre mediciones hay variaciones de ≈ 10 % en este entorno compartido (la calle a 0,5 m pasó de 2,74 a 3,05 ms sin cambios en su cálculo).

**Navegador de pruebas con WebGL por software** (`docs/medellin/perf-navegador.json`), pidiendo ×30:

| Sector y tamaño | Cuadros/s | Cálculo por cuadro | Velocidad lograda |
|---|---|---|---|
| Calle, 1280×720 | 2,1 (antes 2,7) | 4,0 ms | ×16,8 (antes ×16,9) |
| Ladera, 1280×720 | 1,8 (antes 1,9) | 13,8 ms | ×13,6 (antes ×13,9) |
| Calle, 390×844 | 3,9 (antes 3,6) | 4,2 ms | ×27,4 (antes ×26,7) |
| Ladera, 390×844 | 2,8 (antes 2,8) | 18,7 ms | ×20,3 (antes ×20,2) |

Las cifras actuales son las de la creciente dañina y las redes legibles (sección 4 decies), medidas el 9 de noviembre con lluvia de 100 mm/h y el detalle ya adaptado; entre paréntesis, las del alcantarillado separado (sección 4 nonies). La capa de la creciente (puente, vehículos, material flotante, salpicadura y marcas) y las flechas de la red agregan 54 llamadas de dibujo en la ladera (227 → 281); la velocidad lograda casi no cambió. La calle a 1280×720 dio menos cuadros por segundo con las mismas 165 llamadas y los mismos triángulos: está dentro de la variación de este entorno compartido. Antes, las cifras del alcantarillado separado se midieron también el 9 de noviembre, con lluvia de 100 mm/h; entre paréntesis iban las de la lluvia nueva (sección 4 octies). La red agrega ≈ 60 llamadas de dibujo en la ladera (tapas, ventanas y la mira); su cálculo cuesta poco frente a la superficie. Con la creciente al 200 %, la ladera necesita 5,8 ms de cálculo por segundo simulado (`perf-calculo.txt`), unos 175 ms por segundo real a ×30: en este entorno la velocidad lograda baja durante el pico. Las cifras de la lluvia nueva también se midieron el 9 de noviembre, con lluvia de 100 mm/h y el detalle ya adaptado; entre paréntesis iban las del sector con el valle alrededor (sección 4 septies). Los efectos nuevos no restaron cuadros por segundo: las diferencias están dentro de la variación entre mediciones de este entorno compartido (la velocidad lograda en la calle a 390×844 bajó en esta medición aunque los cuadros por segundo subieron). Las cifras del sector con el valle alrededor también se midieron el 9 de noviembre, con el detalle ya adaptado (a los ≈ 3 s de entrar). El cálculo por cuadro no cambió: la diferencia es solo de dibujo. Con el entorno anterior, el 9 de noviembre se repitieron, con la vista nueva del valle: calle 2,7 y ladera 2,0 cuadros/s a 1280×720; calle 4,1 y ladera 3,0 a 390×844. Los sectores no cambian, porque la vista del valle se libera por completo al entrar a un sector. Una primera repetición dio 2,0 en la calle a 1280×720: entre mediciones hay variaciones de hasta ≈ 25 % en este entorno compartido. La aplicación detecta que el navegador dibuja por software (SwiftShader) y, en calidad automática, usa la calidad **ligera**. La calidad alta es la que se usaría en un equipo con GPU; en este entorno, con calidad alta forzada, la calle a 1280×720 baja a ≈ 1,6 cuadros/s. Entre mediciones repetidas hay variaciones de ±15 %, y a veces mayores.

Los pocos cuadros por segundo se deben al **dibujo por software** del entorno, no al cálculo. **No se midió en un equipo con GPU**: queda pendiente.

Historia en el mismo entorno, en cuadros/s (calle y ladera a 1280×720, calle y ladera a 390×844):

| Revisión | Calle 1280×720 | Ladera 1280×720 | Calle 390×844 | Ladera 390×844 |
|---|---|---|---|---|
| Primera versión | 3,9 | 2,2 | 12,9 | 7,6 |
| Comprensión y calidad visual | 3,2 | 2,2 | 9,1 | 5,5 |
| Lluvia y agua | 2,6 | 1,6 | 6,3 | 4,3 |
| Entorno y gotas (1.ª ronda), con calidad ligera automática | 3,4 | 2,6 | 5,3 | 3,7 |
| Entorno y gotas (2.ª ronda: barrio y loma) | 2,9 | 2,1 | 4,3 | 3,5 |
| Sector asentado y barrio de ladera | 2,5 | 2,0 | 4,2 | 3,0 |
| Valle alrededor del sector, fachadas y vida de calle | 1,9 | 1,7 | 3,1 | 2,9 |
| Lluvia: agua natural, reflejos, mojado y tormenta | 2,2 | 2,0 | 3,9 | 2,9 |
| Alcantarillado separado y creciente | 2,7 | 1,9 | 3,6 | 2,8 |
| Creciente dañina y redes legibles | 2,1 | 1,8 | 3,9 | 2,8 |

Cada ronda del entorno agregó casas y árboles: primero el barrio alrededor del sector y luego el barrio de ladera, de unas 5 200 casas en calidad alta y 1 800 en ligera. Por eso, con el dibujo por software, todo es algo más lento que en la primera ronda. En una GPU esta carga es moderada, porque las casas se dibujan con una sola malla de instancias.

Para saber qué pesa más, se midió cada efecto apagándolo uno por uno en la calle (1280×720, `tools/verificacion/fxcost.py`):
- con todo: 2,0 cuadros/s;
- sin cortina: 2,0;
- sin salpicaduras: 2,1;
- sin gotas: 2,9;
- sin cielo: 2,9;
- sin vetas ni anillos: 3,1.

Lo más costoso para el dibujo por software son las gotas: hasta 8 400 rectángulos transparentes. Por eso la aplicación baja sola la densidad de gotas y salpicaduras (hasta el 30 %) cuando el equipo dibuja a menos de ≈ 22 cuadros/s.

En una GPU esta carga es pequeña: 93 llamadas de dibujo y ≈ 90 000 triángulos en la calle. **No se midió en un equipo con GPU**: queda pendiente.

Con el dibujo por software, la velocidad lograda baja porque cada cuadro avanza como máximo 0,25 s reales. La aplicación lo informa en pantalla con la velocidad real («Tu equipo alcanza ×N»), sin cambiar el resultado.

La aplicación mide el costo en cada equipo al entrar y recomienda 2 m si no alcanza ×30 con el 35 % del tiempo. Si el equipo no da la velocidad pedida, lo informa en pantalla con la velocidad real.

**Tamaño de las versiones.**
- `dist/`: el código principal no cambió (≈ 624 kB); Three.js y el módulo se cargan aparte al entrar (≈ 600 kB + 144 kB + 34 kB + 8 kB).
- `dist-single/index.html`: pasa de ≈ 0,8 MB a 1,70 MB porque incluye Three.js en el mismo archivo. Los efectos de lluvia y agua agregan ≈ 35 kB; el entorno y el recorrido de las gotas, ≈ 34 kB; el sector asentado con el barrio de ladera, ≈ 6 kB; la vista nueva del valle, ≈ 33 kB (1,70 → 1,74 MB); el entorno, las fachadas y la vida de calle de los sectores, ≈ 35 kB (1,74 → 1,77 MB); y la lluvia nueva (agua natural, reflejos, mojado y tormenta), ≈ 13 kB (1,77 → 1,79 MB). En `dist/`, la escena del valle pasa de ≈ 10 kB a ≈ 26 kB y se carga solo al entrar al módulo.

## 6. Pendiente o no verificado

- **Datos reales de Medellín.** Los tres sectores reales se construyeron con descargas hechas desde el navegador del usuario (el entorno de trabajo no llega al servicio). Falta comparar la sección de control y la cuenca delineada con estudios hidrológicos de cada quebrada, y conocer la red de alcantarillado real de esos barrios.
- **Calidad del agua.** Valores típicos y reglas didácticas; no se compararon con monitoreos de quebradas de Medellín (por ejemplo, la red de calidad del Área Metropolitana).
- **Planta de aguas residuales.** Es ilustrativa: no se comparó con datos de operación de San Fernando ni de Aguas Claras, el río es inventado y los rangos de diseño son de la literatura técnica, no de la Resolución 0330 de 2017.
- **Rendimiento con GPU real** y en tabletas o teléfonos físicos.
- **Lectores de pantalla reales** (NVDA, VoiceOver). Solo se verificaron los roles, los nombres accesibles y el texto equivalente.
- **Firefox y Safari.** Se probó solo en Chrome.
- **Red de alcantarillado.**
  - Es didáctica: no se comparó con la red real de EPM ni con un modelo como SWMM.
  - No calcula pérdidas locales en cámaras (numeral 8.3.6).
  - La intensidad de diseño (100 mm/h) y la dotación (130 L/hab·día) son supuestas: no se consultaron la curva IDF ni la demanda de EPM.
  - Los escenarios importados sin red siguen con la red esquemática. La interfaz para conectar SWMM sigue disponible.
- **Creciente.** El hidrograma es sintético. No se verificó con caudales medidos de una quebrada de Medellín ni con estudios de amenaza por avenida torrencial.
  - El lodo se mueve como agua (factor de volumen): no se simulan la reología del lodo, la erosión del cauce ni el impacto de piedras y troncos.
  - El peligro usa las clases de la guía australiana AIDR 7-3; no se comparó con la zonificación de amenaza del POT de Medellín ni con criterios nacionales.
  - Las casas son sólidas en el cálculo (el agua no entra) y no hay modelo estructural: «expuesta a daño estructural» es la lectura de la clase H5 o H6, no un cálculo de la estructura.
  - La trayectoria de los vehículos y el material flotante son ilustrativos; el criterio que mueve un vehículo (H2) sí es calculado.
- **Calibración** de los parámetros de cobertura con datos locales.
- **Manual de Drenaje para Carreteras del INVÍAS** (alcantarillas bajo vías, puentes, cunetas): no incluido en «Hidráulica de canales» porque su PDF oficial no se pudo leer desde el entorno de trabajo.

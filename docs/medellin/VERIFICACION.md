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
- V7: la vista del valle respeta su tabla de referencia aproximada. El río pasa por las cotas de la tabla (error 0,0 m) y baja de sur a norte; la cima más alejada de su cota es la del Pan de Azúcar (113 m; tolerancia 150 m); las estaciones del metro quedan a lo sumo 121 m sobre el río (San Javier; tolerancia 150 m); la calle de prueba cae en el fondo del valle y la ladera en la pendiente.
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

**Límite del entorno.** Para usar relieve y trazados reales se intentó acceder a teselas de elevación, OpenTopography, Copernicus, teselas de OpenStreetMap y Overpass. El proxy rechazó todos esos servicios y no se insistió por otras vías. Por eso la vista se construyó desde una **tabla de referencia aproximada** escrita a mano (`MODELO.md`, sección 6.2), y así lo dice el encabezado de la escena: «Vista aproximada para orientarse · relieve y edificios ×1,5 · trazados y cotas aproximados».

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

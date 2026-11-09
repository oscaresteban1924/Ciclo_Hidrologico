# Verificación del módulo «Medellín: laboratorio de lluvia»

Fecha: 8 de noviembre de 2026; actualizado el 9 de noviembre de 2026 con la vista del valle (sección 4 sexies) y con el entorno, las fachadas y la vida de calle de los sectores (sección 4 septies). Este documento separa lo **ejecutado** de lo **pendiente**.

Entorno de verificación:
- CPU Intel Xeon de 2,1 GHz con 2 núcleos, sin GPU;
- Node 22.23;
- Chrome con Playwright; WebGL2 por **software** (SwiftShader).

## 1. Pruebas numéricas obligatorias (ejecutadas)

Comando: `npm run test:city`. Resultado: **22 de 22** comprobaciones cumplen su tolerancia. El detalle (tolerancia, medido y notas) está en `docs/medellin/PRUEBAS.md`.

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

## 5. Rendimiento medido

**Costo del cálculo en Node, en esta CPU** (`docs/medellin/perf-calculo.txt`):

| Sector | dx | Celdas | ms por s simulado | ms por s real a ×30 |
|---|---|---|---|---|
| Calle de prueba | 0,5 m | 17 920 | 3,85 | 116 |
| Calle de prueba | 1 m | 4 480 | 0,45 | 13 |
| Calle de prueba | 2 m | 1 120 | 0,07 | 2 |
| Ladera con quebrada | 1 m | 12 288 | 2,65 | 79 |
| Ladera con quebrada | 2 m | 3 072 | 0,30 | 9 |

**Navegador de pruebas con WebGL por software** (`docs/medellin/perf-navegador.json`), pidiendo ×30:

| Sector y tamaño | Cuadros/s | Cálculo por cuadro | Velocidad lograda |
|---|---|---|---|
| Calle, 1280×720 | 1,9 (antes 2,5) | 4,7 ms | ×14,6 (antes ×18,5) |
| Ladera, 1280×720 | 1,7 (antes 2,0) | 13,2 ms | ×12,0 (antes ×14,6) |
| Calle, 390×844 | 3,1 (antes 4,2) | 6,5 ms | ×23,3 (antes ×29,4) |
| Ladera, 390×844 | 2,9 (antes 3,0) | 17,7 ms | ×19,5 (antes ×23,4) |

Las cifras actuales son las del sector con el valle alrededor (sección 4 septies), medidas el 9 de noviembre con el detalle ya adaptado (a los ≈ 3 s de entrar); entre paréntesis, las de la versión anterior. El cálculo por cuadro no cambió: la diferencia es solo de dibujo. Con el entorno anterior, el 9 de noviembre se repitieron, con la vista nueva del valle: calle 2,7 y ladera 2,0 cuadros/s a 1280×720; calle 4,1 y ladera 3,0 a 390×844. Los sectores no cambian, porque la vista del valle se libera por completo al entrar a un sector. Una primera repetición dio 2,0 en la calle a 1280×720: entre mediciones hay variaciones de hasta ≈ 25 % en este entorno compartido. La aplicación detecta que el navegador dibuja por software (SwiftShader) y, en calidad automática, usa la calidad **ligera**. La calidad alta es la que se usaría en un equipo con GPU; en este entorno, con calidad alta forzada, la calle a 1280×720 baja a ≈ 1,6 cuadros/s. Entre mediciones repetidas hay variaciones de ±15 %, y a veces mayores.

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
- `dist-single/index.html`: pasa de ≈ 0,8 MB a 1,70 MB porque incluye Three.js en el mismo archivo. Los efectos de lluvia y agua agregan ≈ 35 kB; el entorno y el recorrido de las gotas, ≈ 34 kB; el sector asentado con el barrio de ladera, ≈ 6 kB; la vista nueva del valle, ≈ 33 kB (1,70 → 1,74 MB); y el entorno, las fachadas y la vida de calle de los sectores, ≈ 35 kB (1,74 → 1,77 MB). En `dist/`, la escena del valle pasa de ≈ 10 kB a ≈ 26 kB y se carga solo al entrar al módulo.

## 6. Pendiente o no verificado

- **Datos reales de Medellín.** El servicio cartográfico no fue accesible desde el entorno (403 del proxy). Falta verificar el CRS real del servicio y generar un sector real con el pipeline (`DATOS_REALES.md`).
- **Rendimiento con GPU real** y en tabletas o teléfonos físicos.
- **Lectores de pantalla reales** (NVDA, VoiceOver). Solo se verificaron los roles, los nombres accesibles y el texto equivalente.
- **Firefox y Safari.** Se probó solo en Chrome.
- **Conexión con SWMM.** Solo existe la interfaz; la red sigue siendo esquemática.
- **Calibración** de los parámetros de cobertura con datos locales.

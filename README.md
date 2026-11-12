# Laboratorio del agua

Aplicación educativa en trece salas: **El ciclo del agua**, **Cuencas: de la lluvia al caudal**, **Aguas subterráneas**, **Laderas**, **Medellín: laboratorio de lluvia**, **Calidad del agua**, **Acueducto: el agua a presión**, **El agua en casa**, **Hidráulica de canales**, **Presas y embalses**, **Bombas y energía del agua**, **Medir el agua** y **Modelación hidráulica 2D**. Se abre en una portada con las salas agrupadas (el agua en la naturaleza, en la ciudad y en las obras hidráulicas), o directo en una sala con un enlace que termine en `#recorrido`, `#explorar`, `#experimentos`, `#cuencas`, `#acuifero`, `#medellin`, `#laderas`, `#calidad`, `#acueducto`, `#casa`, `#canales`, `#presas`, `#bombas`, `#medir` o `#modelo2d` (el botón «atrás» del navegador vuelve entre la portada y las salas); arriba, el encabezado lleva las salas, las herramientas que sirven en todas (Retos, Bitácora, Glosario), Ayuda y Ajustes, y el nombre vuelve a la portada. Dentro del ciclo del agua, una segunda fila tiene sus tres modos y la gota trazadora.

La sala del ciclo del agua está pensada para niñas y niños de 8 a 12 años. Explica el ciclo hidrológico como un sistema: cómo se mueve, se almacena y cambia de estado el agua; qué energía lo impulsa; qué papel cumple la gravedad; y cómo se conectan la atmósfera, la vegetación, el suelo, los ríos, los acuíferos y el océano.

Todo el contenido está en español. No requiere cuentas, servicios de pago ni claves de API. No recolecta datos personales: el progreso, las preferencias y la bitácora se guardan solo en el navegador.

## Cómo ejecutarla

Requisitos: Node.js 18 o superior.

```bash
npm install          # instala las dependencias
npm run dev          # servidor de desarrollo en http://localhost:5173
npm run build        # versión de producción en dist/ (sitio estático)
npm run build:single # un único archivo autocontenido en dist-single/index.html
npm run preview      # sirve la versión de producción para revisarla
npm run typecheck    # verificación de tipos
npm run test:city    # pruebas del motor de lluvia urbana (escribe docs/medellin/PRUEBAS.md)
npm run test:quality # pruebas del modelo de calidad del agua (escribe docs/calidad/PRUEBAS_CALIDAD.md)
npm run test:canals  # pruebas de la hidráulica de canales y de sus calculadoras (escribe docs/canales/PRUEBAS_CANALES.md)
npm run test:basins  # pruebas de la sala de cuencas y de sus calculadoras (escribe docs/cuencas/PRUEBAS_CUENCAS.md)
npm run test:supply  # pruebas de la sala del acueducto y de sus calculadoras (escribe docs/acueducto/PRUEBAS_ACUEDUCTO.md)
npm run test:ground  # pruebas de la sala de aguas subterráneas (escribe docs/subterraneas/PRUEBAS_SUBTERRANEAS.md)
npm run test:dams    # pruebas de la sala de presas y embalses (escribe docs/presas/PRUEBAS_PRESAS.md)
npm run test:slopes  # pruebas de la sala de laderas (escribe docs/laderas/PRUEBAS_LADERAS.md)
npm run test:pumps   # pruebas de la sala de bombas (escribe docs/bombas/PRUEBAS_BOMBAS.md)
npm run test:measure # pruebas de la sala de medición (escribe docs/medir/PRUEBAS_MEDIR.md)
npm run test:house   # pruebas de la sala del agua en casa (escribe docs/casa/PRUEBAS_CASA.md)
npm run test:model2d # pruebas de la sala de modelación 2D (escribe docs/modelo2d/PRUEBAS.md)
python3 tools/verificacion/superposiciones.py --pantallas escritorio --sin-medellin   # superposiciones sin la ciudad (más rápido)
```

La versión `dist-single/index.html` incluye en un solo archivo el código, los estilos y las fuentes. Se abre directamente en el navegador, sin servidor y sin conexión a internet. La carpeta `dist/` puede publicarse en cualquier servidor web estático.

## Publicación en línea

Es un sitio estático: el cálculo y el dibujo 3D corren en el navegador de cada visitante, y el servidor solo entrega archivos (≈ 5,7 MB en total, ≈ 2,1 MB comprimidos). Al abrir se descargan ≈ 0,7 MB (≈ 0,2 MB comprimidos) más las fuentes; cada sala pesada (Cuencas, Aguas subterráneas, Laderas, Medellín, Calidad del agua, Acueducto, Hidráulica de canales, Presas y embalses, Bombas, Medir el agua, El agua en casa, Modelación hidráulica 2D) se descarga solo cuando se entra en ella. No necesita base de datos, funciones de servidor ni variables de entorno, y no hace peticiones a otros sitios.

- **Vercel u otro servicio estático:** preset «Vite», comando de compilación `npm run build`, carpeta de salida `dist`. No requiere `vercel.json`, porque la aplicación no usa rutas del lado del servidor.
- **Servidor propio (VPS):** basta 1 vCPU y 1 GB de RAM con Caddy o Nginx, HTTPS, compresión y caché larga para `assets/` (sin caché para `index.html`). Funciona también en una subcarpeta.
- La fluidez depende del equipo del visitante (navegador con WebGL2; con tarjeta gráfica, fluido). Sin WebGL2 se abre una vista alternativa en 2D.

## Experiencia

### Tres escalas conectadas

| Escala | Qué muestra |
| --- | --- |
| **Cuenca** | El paisaje completo: atmósfera, páramo y montañas, bosque, ciudad, río, costa, suelo, acuífero y océano. |
| **Proceso** | Un acercamiento breve y controlado a la zona que se estudia, con el resto del sistema atenuado pero visible. |
| **Detalle** | Cinco vistas que se abren desde su lugar en el paisaje, con una ubicación «Estás aquí» y el aviso «Esquema: no está a escala»: poros del suelo; zona no saturada, franja capilar, nivel freático y zona saturada; de la raíz a la hoja; interior de una nube; poros, fracturas y carga hidráulica. |

Cada vista de detalle es una secuencia con inicio, desarrollo y resultado. Tiene pausa, repetición, velocidad (½×, 1× y 2×) y una barra para revisarla. Incluye una variable para investigar: tipo de suelo, recarga o temporada seca, condiciones de la planta, tipo de nube o material del acuífero. Termina con el resultado, una invitación a explicar con palabras propias y una nueva pregunta.

### Salas, modos y herramientas

| Sala, modo o herramienta | Qué permite |
| --- | --- |
| **Recorrido guiado** | 15 pasos con nombres y progreso visible (introducción, reservorios, evaporación, transpiración, condensación, transporte, precipitación, intercepción, infiltración, percolación y recarga, escorrentía, agua subterránea, almacenamiento, las personas en el ciclo y cierre). Cada paso tiene una idea principal y una misión concreta, organizadas en **Observa**, **Investiga** y **Profundiza**. Sobre el paisaje, un subtítulo guía la mirada en tres momentos: inicio, desarrollo y resultado. El avance siempre lo controla el niño. |
| **Exploración libre** | Capas que se encienden a voluntad: reservorios, todos los procesos, elementos y preguntas. Cualquier punto del paisaje abre su ficha. Las marcas «?» plantean preguntas que llevan a una observación, una vista de detalle, un experimento o la gota trazadora. |
| **Experimentos** (antes «Laboratorio del agua») | *Explorar condiciones*: modelo cualitativo con reglas visibles y balance de la lluvia. *Comparar escenarios A/B*: dos cuencas imaginarias que difieren en una sola condición, simuladas a la vez. Sigue seis pasos: pregunta, predicción, cambio, ejecución, comparación y explicación. |
| **Gota trazadora** | Sigue una porción de agua por rutas ramificadas elegidas en cada bifurcación, con su estado y el tiempo de permanencia aproximado en cada reservorio. |
| **Retos** | Sin cronómetros ni penalizaciones: cada respuesta no esperada recibe una pista y la opción de observar de nuevo. |
| **Bitácora** | Registra observaciones (al completar vistas de detalle), predicciones e hipótesis, comparaciones y explicaciones escritas por el niño. Los niveles (Observación, Exploración, Investigación, Hidrología) premian observar, comparar y explicar, no hacer clics. Se puede descargar como texto. |
| **Calidad del agua** | Cuatro escenas 3D con una pregunta cada una, retos con medalla y experimentos animados: una quebrada con peces, sonda, lupa y microscopio (índice BMWP/Col); una planta de potabilización convencional con sus once procesos (pestaña Procesos con animación «con lupa», valores del juego y criterios de la Resolución 0330 de 2017, y recorrido por la planta), tanques de vidrio con el agua en movimiento y flechas del flujo en las tuberías, prueba de jarras en tiempo real, cloro y la Resolución 2115 de 2007 (IRCA); «De la casa al río», una planta de aguas residuales de lodos activados con sus once partes y su línea de lodos (aliviadero, primario, reactor con aire, secundario con recirculación, luz UV, digestores con biogás), el río que recibe la descarga con sus peces, la Resolución 0631 de 2015, la probeta de 30 minutos y el cono Imhoff; y una cuadra con el aguacero, el primer lavado y la prueba del colorante para hallar conexiones erradas. La pestaña Medellín de la quebrada compara el modelo con mediciones reales de 68 sitios en 18 quebradas de San Antonio de Prado (Alcaldía de Medellín, 2017–2018). Sin WebGL, versión en dibujos planos. Ver `docs/calidad/MODELO_CALIDAD.md`. |
| **Aguas subterráneas** | Tres escenas 3D con una pregunta cada una, retos con medalla, instrumentos en vivo y experimentos que se comparan con la teoría: el acuífero entre una loma y un río (ley de Darcy, nivel freático de Dupuit, tiempo de viaje y un permeámetro para medir la conductividad); el pozo y su cono de abatimiento (Theis, Cooper-Jacob, radio de influencia y una prueba de bombeo para analizar); y una fuga que viaja hacia un pozo de abastecimiento (advección, dispersión con partículas y zona de captura de Todd). La pestaña **Diseño** tiene ocho herramientas en dos niveles, con gráfica y memoria de cálculo. El valle, el pozo y la fuga son ilustrativos. Ver `docs/subterraneas/MODELO_SUBTERRANEAS.md`. |
| **Acueducto: el agua a presión** | Tres escenas 3D con una pregunta cada una, retos con medalla, instrumentos en vivo y experimentos que se comparan con la teoría: la tubería y su energía (conducción por gravedad desde un tanque con seis piezómetros a escala, líneas de energía y piezométrica, Darcy-Weisbach con Colebrook-White contra Hazen-Williams, presión negativa en una loma y medición del factor de fricción sobre el diagrama de Moody); la red del barrio (nueve esquinas con la curva de consumo del día, método del gradiente y Hardy Cross paso a paso, presiones de los Arts. 61 y 62 del RAS, válvulas que se cierran); y el golpe de ariete (celeridad de Korteweg, Joukowsky, método de las características en cámara lenta, cierre lento contra Michaud y Allievi, aviso de presión de vapor). La pestaña **Diseño** tiene siete herramientas en dos niveles, con gráfica y memoria de cálculo. La conducción, el barrio y la tubería son ilustrativos. Ver `docs/acueducto/MODELO_ACUEDUCTO.md`. |
| **Hidráulica de canales** | Siete escenas 3D con una pregunta cada una, retos con medalla y experimentos: el canal y su caudal (Manning, profundidad normal y crítica, erosión y sedimentación); la caída y el resalto (rápida, pozo amortiguador y tipos de resalto); el puente y el remanso (estrangulamiento, paso a presión, palos y basura, perfil M1); las alcantarillas (control a la entrada y a la salida con FHWA HDS-5, agua sobre la vía); el transporte de sedimentos (Shields, arrastre de fondo, número de Rouse, enrocado); medir el caudal (vertederos, compuerta, flotador y curva de calibración); y ondas y crecientes (rotura de presa, cierre brusco de una compuerta y creciente que viaja, calculadas en el tiempo con las ecuaciones de Saint-Venant en segundo orden y comparadas con Ritter, Stoker y Favre, con instrumentos en vivo: perfil del agua, línea de energía, huella del nivel máximo, hidrogramas en dos estaciones y curva de gasto en lazo). En el resalto se puede ver cómo se forma en el tiempo hasta llegar al cálculo permanente. El agua se dibuja con su velocidad calculada (ondas que avanzan, trazadores con el perfil de velocidad, el remolino del resalto, isotacas en el corte) y se puede simular una creciente con un hidrograma. Cada parte tiene la pestaña **Diseño** con calculadoras y prediseñadores en dos niveles, Niños y Universitarios (veinticinco herramientas: entre ellas canal en tierra por fuerza tractiva, pozos USBR, pilas y socavación HEC-18, alcantarillas de tubo o cajón, cuatro fórmulas de transporte, canaleta Parshall, molinete, rotura de presa, muros para la onda de cierre de una compuerta y celeridad de una creciente y tránsito por Muskingum-Cunge), que dibujan el plano acotado y una gráfica y entregan la memoria de cálculo imprimible (HTML para imprimir o guardar en PDF). Las herramientas revisan también los criterios de la Resolución 0330 de 2017 (RAS) que les aplican, con su artículo, y cada parte tiene instrumentos en vivo (perfil del agua y registros de los últimos 40 s). Son prediseños académicos, no diseños de ingeniería. Ver `docs/canales/MODELO_CANALES.md`. |
| **Cuencas: de la lluvia al caudal** | Tres escenas 3D con una pregunta cada una, retos con medalla, instrumentos en vivo y experimentos que se comparan con la teoría: la cuenca y su respuesta (tiempo de concentración de Kirpich, Témez y el SCS; método racional hasta 80 ha como pide el RAS; aguacero de diseño por bloques alternos con una curva IDF ilustrativa; número de curva por cobertura y suelo; hidrograma unitario del SCS; la estación de la salida mide el volumen y cierra el balance de masa); el hidrograma y la urbanización (antes y después, convolución bloque por bloque y un tanque de retención con salida limitada que alcanza o rebosa); y crecientes y riesgo (Gumbel por momentos sobre series sintéticas, papel de probabilidad, nivel del río con la sección dividida y casas que se mojan, y vidas útiles simuladas contra la fórmula del riesgo). La pestaña **Diseño** tiene siete herramientas en dos niveles (tiempo de concentración, caudal de diseño con la Tabla 16 del RAS, método racional, escorrentía e hidrograma del SCS, volumen de almacenamiento, Gumbel y período de retorno por riesgo), con gráfica y memoria de cálculo. La cuenca, el río y las series son ilustrativos. Ver `docs/cuencas/MODELO_CUENCAS.md`. |
| **Presas y embalses** | Tres escenas 3D con una pregunta cada una, retos con medalla, instrumentos en vivo y experimentos que se comparan con la teoría: el embalse que recibe una creciente (tránsito de Puls, atenuación, retraso y borde libre, con la creciente en 24 s); el vertedero de cresta y su pozo (perfil WES, coeficiente con otras cargas, resalto de Bélanger dentro o fuera del pozo y la energía que disipa); y la presa de gravedad (peso, empuje, subpresión con y sin drenes, factores de seguridad, tercio medio y esfuerzos en la base). La pestaña **Diseño** tiene seis herramientas con gráfica y memoria de cálculo. El embalse, el vertedero y la presa son ilustrativos. Ver `docs/presas/MODELO_PRESAS.md`. |
| **Laderas** | Tres escenas 3D con una pregunta cada una, retos con medalla, instrumentos en vivo y experimentos que se comparan con la teoría: la lluvia que entra al suelo (Green-Ampt con encharcamiento, frente de humedecimiento en el corte, charcos y escorrentía); la ladera y el agua (talud infinito con presión de poros, raíces y drenes, lluvia crítica de SHALSTAB y la capa que se desliza hacia las casas); y la ladera que pierde suelo (RUSLE con cobertura, barreras vivas y terrazas, y la quebrada que se enturbia). La pestaña **Diseño** tiene seis herramientas con gráfica y memoria de cálculo. Las parcelas y laderas son ilustrativas. Ver `docs/laderas/MODELO_LADERAS.md`. |
| **Bombas y energía del agua** | Tres escenas 3D con una pregunta cada una, retos con medalla, instrumentos en vivo y experimentos que se comparan con la teoría: la bomba y la tubería (curvas de la bomba y del sistema, punto de operación, leyes de afinidad con variador, válvula, dos bombas en serie o en paralelo, manómetros y flujo que avanza por la tubería); el agua que hierve en la bomba (NPSH con la altitud, la temperatura y el nivel del agua; bomba de vidrio con burbujas en el rodete); y la central hidroeléctrica (bocatoma, tubería de presión, cuatro turbinas, curva de duración del río y un pueblo que se ilumina). La pestaña **Diseño** tiene seis herramientas con gráfica y memoria de cálculo. Las bombas, el río y la central son ilustrativos. Ver `docs/bombas/MODELO_BOMBAS.md`. |
| **Medir el agua** | Tres escenas 3D con una pregunta cada una, retos con medalla, instrumentos en vivo y experimentos que se comparan con la teoría: medir la lluvia (pluviómetro de balancín que se vuelca con cada 0,2 mm, viento y tiempo de vuelco, radar con tres relaciones Z-R que pinta la reflectividad); aforar un río (molinete en una tarabita que recorre las verticales sobre el corte de velocidades, sección media según ISO 748 y curva de gasto con su h0); y el medidor en la tubería (Venturi y placa de orificio según ISO 5167, piezómetros, pérdidas y la garganta que puede hervir). La pestaña **Diseño** tiene siete herramientas con gráfica y memoria de cálculo. La estación, el río y el banco son ilustrativos. Ver `docs/medir/MODELO_MEDIR.md`. |
| **El agua en casa** | Tres escenas 3D con una pregunta cada una, retos con medalla, instrumentos en vivo y experimentos: cuánta agua usa la casa (aparatos, hábitos y fugas, con la casa cortada para ver qué aparato se usa a cada hora del día); el medidor y la factura (tambores, agujas y estrella, rangos de consumo de la Resolución CRA 750 de 2016, subsidios y contribuciones por estrato y la prueba de noche para encontrar fugas); y el agua lluvia para la casa (techo, canoa, primer lavado y un tanque con su balance diario de un año). La pestaña **Diseño** tiene seis herramientas con gráfica y memoria de cálculo. La casa, la tarifa y la lluvia son ilustrativas. Ver `docs/casa/MODELO_CASA.md`. |
| **Modelación hidráulica 2D** | Cinco escenas 3D sobre un valle ilustrativo (una quebrada meándrica, un jarillón, un barrio, una vía con su puente), con una pregunta cada una, retos con medalla, instrumentos en vivo y experimentos: el terreno como lo ve el modelo (MDT o MDS, píxeles de 1 a 30 m, cuatro métodos de remuestreo, error de la fuente y el cauce bajo el agua que el sensor no ve, con el corte del terreno y cuatro fuentes reales simuladas: LiDAR, dron, ALOS de 12,5 m y Copernicus); las coberturas y su n de Manning (tabla de Chow y casas como n alto o bloques); los periodos de retorno (Gumbel, riesgo, hidrograma) y las condiciones de borde (hidrograma repartido por conducción y profundidad normal); la malla y las ecuaciones (tablas subgrid de celdas y caras, continuidad, aguas someras, inercia local y onda difusiva, Courant, θ, iteraciones, una rotura de presa contra Ritter); y un modelo armado en diez pasos como en HEC-RAS 2D, que corre en el navegador (onda difusiva implícita o inercia local explícita) y dibuja profundidad, velocidad, cota, llegada y amenaza H1–H6. La pestaña **Diseño** tiene doce herramientas con gráfica y memoria de cálculo. No es HEC-RAS ni un estudio de amenaza. Ver `docs/modelo2d/MODELO_2D.md`. |
| **Glosario** | 114 términos con búsqueda; cada uno puede iluminar su lugar en el paisaje. |

Una sola **pausa** controla toda la experiencia: paisaje, subtítulos, vistas de detalle y laboratorio. La **velocidad** de reproducción cambia el ritmo de las animaciones, nunca las condiciones ni los resultados. El panel lateral puede **contraerse** para ampliar el paisaje. La ayuda («Cómo explorar») resume los controles.

## Dirección visual

Ilustración científica viva de una cuenca andina, con luz de mañana desde la izquierda y tres planos de profundidad: cordillera lejana con bruma, montaña con páramo y glaciar, y valle con bosque, ciudad y costa. El formato es un **bloque diagrama** con una cara frontal en corte.

- El subsuelo es un diagrama geológico sereno: horizontes del suelo, zona no saturada, franja capilar, nivel freático (▽), zona saturada con lentes de grava y arcilla, roca con pocas fracturas conectadas y la cuña de agua salada bajo la costa. La porosidad se muestra en detalle solo en las vistas ampliadas.
- El estado del agua se distingue por la **forma**: gota rellena (líquido), anillo punteado (vapor, que es invisible), punto blanco (gota de nube), cristal de seis puntas (hielo). Las flechas cambian de trazo: discontinua (vapor), continua (superficie), punteada (subsuelo).
- La densidad de partículas está controlada: el proceso principal se ve con claridad y los secundarios emiten mucho menos y se atenúan.
- Los rótulos tienen jerarquía: el proceso principal es más grande, los demás más discretos. Se colocan evitando chocar entre sí, con los controles y con las lupas, y usan una línea guía cuando se separan de su lugar.
- Tipografías incluidas (licencia SIL OFL): *Atkinson Hyperlegible* y *Bricolage Grotesque*. El rosa rodamina, el color del trazador fluorescente de los hidrólogos, marca la gota trazadora, las preguntas y el foco del teclado.

## Criterios científicos aplicados

- El ciclo no tiene un comienzo único: todos los procesos ocurren a la vez y la gota trazadora ofrece muchas rutas.
- El vapor es invisible y se representa con un símbolo identificado como tal. Las nubes están formadas por gotitas y cristales de hielo.
- La condensación se muestra como enfriamiento del aire húmedo que sube y formación de gotitas sobre núcleos de condensación. La precipitación ocurre cuando las gotas o los cristales crecen y el aire ya no los sostiene.
- Infiltración, percolación y recarga se distinguen. Parte del agua infiltrada queda en el suelo y solo la que llega a la zona saturada es recarga.
- El nivel freático es la superficie superior de la zona saturada en el acuífero libre mostrado. En un pozo de observación, el agua se estabiliza a esa altura; el agua de la franja capilar no entra al pozo.
- Un acuífero es un material que almacena y transmite agua en poros o fracturas, no una caverna. El flujo subterráneo va de mayor a menor carga hidráulica y es mucho más lento que la escorrentía.
- Los tiempos de los procesos no son equivalentes: se expresan como órdenes de magnitud aproximados y se advierte que las velocidades de la animación están simplificadas.
- Los datos de «¿Sabías que…?» citan su fuente (USGS, NOAA, IDEAM, Instituto Humboldt y literatura académica). La lista completa está en *Ajustes → Fuentes para docentes*.

## Modelos del laboratorio

**Explorar condiciones** (`src/lab/model.ts`): modelo cualitativo con reglas explícitas, visibles en la aplicación. Expresa tendencias por niveles y conserva el balance lluvia = intercepción + infiltración + escorrentía; infiltración = agua retenida en el suelo + percolación.

**Comparar escenarios** (`src/lab/storm.ts`): modelo de depósitos (hojas, suelo, flujo subsuperficial, acuífero y agua en camino) para una cuenca imaginaria, en milímetros de agua (mm) y horas (h). Conserva el balance en cada paso, con un error numérico menor de una milésima de milímetro: lluvia = lo que llega al río + lo que vuelve al aire + bombeo + cambio en lo almacenado. Los valores son ilustrativos y redondeados. Los experimentos predefinidos declaran qué se mantiene constante:

- suelo seco frente a húmedo;
- superficie permeable frente a pavimento;
- lluvia suave frente a intensa, con la misma duración o con el mismo volumen total;
- poca frente a mucha vegetación;
- sin bombeo frente a bombeo intenso.

También se puede diseñar un experimento libre que cambia una sola condición.

## Accesibilidad

- Navegación completa con teclado y foco visible. `←` y `→` cambian de paso, `P` pausa y `Esc` cierra ventanas. Los gráficos del laboratorio se recorren con las flechas e incluyen una vista de tabla.
- Etiquetas accesibles en botones y controles, anuncios para lectores de pantalla y regiones vivas para los resultados.
- «Reducir movimiento» (activado automáticamente si el sistema lo solicita) detiene las partículas. Muestra flechas estáticas y una descripción equivalente de cada paso. Las vistas de detalle se recorren fase por fase como cuadros estáticos.
- Nada depende solo del color, del sonido o del movimiento. El sonido ambiental y la narración son opcionales y empiezan desactivados.
- Controles táctiles amplios. En celular, el paisaje queda fijo arriba con sus controles y el subtítulo de observación pasa al panel.

## Módulo «Medellín: laboratorio de lluvia»

Cuarto modo de la aplicación. Tiene dos escalas conectadas:
- **El valle de Aburrá**: vista 3D con datos oficiales (relieve del AMVA, río y quebradas, metro, tranvía, cables y Metroplús con sus estaciones, municipios y comunas) para orientarse y elegir un sector. Los edificios siguen las calles de la red vial metropolitana y, en Medellín, tienen las alturas que registra el catastro en cada barrio (`docs/medellin/DATOS_REALES.md`, §7.5).
- **El laboratorio**: un sector pequeño en 3D donde la lluvia se calcula en vivo y se puede ver cómo corre, se infiltra, se guarda y sale el agua.

En el laboratorio, los estudiantes pueden:
- crear lluvia (uniforme o localizada);
- cambiar superficies;
- construir jardines de lluvia y depósitos;
- obstruir o restaurar sumideros;
- ver bajo la calle las **dos redes separadas** de alcantarillado: aguas lluvias y aguas residuales. Son didácticas y se trazaron con criterios de la norma de diseño de EPM. Muestran las cámaras de inspección y de caída, el sentido y la velocidad del agua, los tramos en carga y el rebose; se pueden ver juntas o una sola, en corte de calle, en planta y en perfil. Incluyen la intervención «conexiones erradas»;
- lanzar una **creciente** por la quebrada de la ladera, hasta una avenida torrencial con lodo, y ver en vivo la sección transversal, el hidrograma, el desborde sobre las casas de la orilla, los vehículos que arrastra, las marcas en las fachadas y los daños calculados por edificación;
- ver cómo la creciente le quita el **gálibo** al puente peatonal, lo empuja y le quita peso por flotación, y cuándo superaría la resistencia de sus apoyos (análisis didáctico con referencias de la FHWA y ACI 318);
- tapar con troncos la **cobertura** por donde la quebrada pasa bajo la carrera (libre, 50 %, 90 % o «se tapa con la creciente») y ver cómo el agua se represa y cruza la vía; su hidráulica sigue la guía HDS-5 de la FHWA;
- calcular la creciente **desde la lluvia en la cuenca** (bosque, mixta o urbanizada; métodos del NRCS) y seguir el **aviso temprano**: una estación aguas arriba con alertas amarilla, naranja y roja, y el tiempo que queda para avisar antes de que el agua llegue a las casas;
- ver el **peligro** de cada lugar (clases H1–H6 según profundidad y velocidad; referencia técnica, no el mapa oficial de amenaza);
- seguir el agua con gotas trazadoras y medir la profundidad en el tiempo;
- comparar A y B con exactamente la misma lluvia;
- elegir **tormentas de diseño** de 2 a 100 años y de 30 min a 6 h con la curva IDF de Olaya Herrera (IDEAM), un **aguacero real** reconstruido (28 de enero de 2026, El Poblado) y un clima más cálido (7 % más lluvia intensa por grado);
- ver el **transporte de sedimentos**: la tierra que suelta la lluvia, la que arrastra el agua, dónde se deposita como lodo y cuánta llega a los sumideros (panel «¿Adónde fue la tierra?» y capa «Lodo»);
- **planificar** el barrio con 100 puntos de presupuesto y probar el plan con la misma tormenta (A: como está; B: con el plan);
- vivir la **tormenta**: techo de nubes, rayos ilustrativos y sonido sintetizado que sigue la lluvia y el caudal calculados; modo **cine** (la cámara recorre la tormenta sola) y **video** de hasta un minuto que se guarda en el equipo con un rótulo que aclara que no es un pronóstico.

Además hay:
- una barra en vivo «¿Adónde fue la lluvia?», que muestra qué parte del agua sigue sobre el suelo, cuál salió, cuál entró al suelo, cuál tomaron los sumideros y cuál guardan los depósitos;
- una guía de primeros pasos;
- trece misiones (pregunta, predicción, cambio y explicación), dos de ellas en los sectores reales de La Iguaná y Juan Bobo;
- controles compactos sobre la maqueta: las cuatro vistas en una fila, las capas (etiquetas, foto aérea, flechas, agua en azul, agua ×5, bajo la calle) en una lista y la cámara en una columna de íconos; el panel derecho se puede contraer para que la maqueta ocupe todo el ancho (las preferencias se recuerdan en el dispositivo);
- los sectores con datos oficiales se ven como una **maqueta recortada**: terreno continuo con la foto aérea, corte con capas de suelo y el valle alrededor en volúmenes blancos que no compiten con lo real;
- un panel docente con supuestos, balance de agua, fuentes y pruebas.

Escenarios incluidos:
- **Calle de prueba**: escenario didáctico de verificación.
- **Ladera con quebrada**: sector demostrativo inspirado en barrios de ladera de Medellín.
- **Andalucía · Juan Bobo**, **La Iguaná · El Pesebre** y **Ana Díaz · El Corazón**: sectores con datos oficiales de la Alcaldía de Medellín sobre tramos abiertos de quebradas (modelo de elevación 2024 de 1 m, ortofoto 2024 sobre el terreno y los techos, construcciones, vías e hidrografía POT). Cada uno tiene su cuenca delineada con el modelo de elevación del AMVA (creciente desde la lluvia y aviso temprano), el agua de las laderas vecinas que entra por los bordes y una sección de control estimada del terreno. Ver `docs/medellin/DATOS_REALES.md`.

**Los dos primeros no son lugares reales.** Más datos reales se incorporan con el pipeline `tools/geo/medellin_pipeline.py`, como explica `docs/medellin/DATOS_REALES.md`.

Documentos del módulo:

| Documento | Contenido |
|---|---|
| `docs/medellin/DECISION_TECNICA.md` | Evaluación de candidatos, licencias y decisión |
| `docs/medellin/MODELO.md` | Ecuaciones, supuestos, balance, parámetros, sensibilidad y límites |
| `docs/medellin/PRUEBAS.md` | Pruebas obligatorias con tolerancias y resultados (generado) |
| `docs/medellin/VERIFICACION.md` | Qué se verificó en el navegador, rendimiento medido y pendientes |
| `docs/medellin/DATOS_REALES.md` | Cómo reemplazar el sector demostrativo por datos de Medellín |
| `docs/medellin/GUIA_DOCENTE.md` | Uso en clase, misiones, palabras clave y accesibilidad (incluye el módulo de calidad del agua) |
| `docs/calidad/MODELO_CALIDAD.md` | Módulo «Calidad del agua»: ecuaciones, reglas didácticas, normas y fuentes |
| `docs/calidad/PRUEBAS_CALIDAD.md` | Pruebas del módulo de calidad del agua (generado) |
| `docs/canales/MODELO_CANALES.md` | Módulo «Hidráulica de canales»: ecuaciones, reglas del juego, calculadoras, límites y fuentes |
| `docs/canales/PRUEBAS_CANALES.md` | Pruebas de la hidráulica de canales y de sus calculadoras (generado) |
| `docs/cuencas/MODELO_CUENCAS.md` | Sala «Cuencas»: lluvia de diseño, pérdidas, hidrograma, tanque, crecientes y riesgo, con fuentes y límites |
| `docs/cuencas/PRUEBAS_CUENCAS.md` | Pruebas de la sala de cuencas y de sus calculadoras (generado) |
| `docs/subterraneas/MODELO_SUBTERRANEAS.md` | Sala «Aguas subterráneas»: Darcy, Dupuit, Theis, transporte, zona de captura, límites y fuentes |
| `docs/subterraneas/PRUEBAS_SUBTERRANEAS.md` | Pruebas de la sala de aguas subterráneas (generado) |
| `docs/acueducto/MODELO_ACUEDUCTO.md` | Sala «Acueducto»: tuberías, redes, golpe de ariete, normas citadas, límites y fuentes |
| `docs/acueducto/PRUEBAS_ACUEDUCTO.md` | Pruebas de la sala del acueducto y de sus calculadoras (generado) |
| `docs/laderas/MODELO_LADERAS.md` | Sala «Laderas»: infiltración, estabilidad de laderas con agua y raíces, pérdida de suelo, límites y fuentes |
| `docs/laderas/PRUEBAS_LADERAS.md` | Pruebas de la sala de laderas y de sus calculadoras (generado) |
| `docs/bombas/MODELO_BOMBAS.md` | Sala «Bombas y energía del agua»: bombas y sistemas, NPSH y cavitación, pequeñas centrales, límites y fuentes |
| `docs/bombas/PRUEBAS_BOMBAS.md` | Pruebas de la sala de bombas y de sus calculadoras (generado) |
| `docs/medir/MODELO_MEDIR.md` | Sala «Medir el agua»: pluviómetro y radar, aforo y curva de gasto, Venturi y placa de orificio, límites y fuentes |
| `docs/medir/PRUEBAS_MEDIR.md` | Pruebas de la sala de medición y de sus calculadoras (generado) |
| `docs/casa/MODELO_CASA.md` | Sala «El agua en casa»: consumo, medidor y factura, agua lluvia, límites y fuentes |
| `docs/casa/PRUEBAS_CASA.md` | Pruebas de la sala del agua en casa y de sus calculadoras (generado) |
| `docs/modelo2d/MODELO_2D.md` | Sala «Modelación hidráulica 2D»: terreno y píxel, coberturas y n, periodos de retorno y bordes, malla, subgrid y ecuaciones, el modelo paso a paso, amenaza, límites y fuentes |
| `docs/modelo2d/PRUEBAS.md` | Pruebas del modelo 2D y de sus herramientas (generado) |
| `docs/presas/MODELO_PRESAS.md` | Sala «Presas y embalses»: tránsito de crecientes, vertedero y pozo, estabilidad de presas de gravedad, límites y fuentes |
| `docs/presas/PRUEBAS_PRESAS.md` | Pruebas de la sala de presas y embalses y de sus calculadoras (generado) |

Estructura del código del módulo:

```
src/city/
  sim/         Núcleo de cálculo puro (sin navegador): constantes y coberturas, formato de escenario y
               validación, compilador a malla, motor inercial local, red de drenaje, trazadores,
               comparación A/B, adaptador de campos para el dibujo, pruebas rápidas
  scenarios/   Calle de prueba y Ladera con quebrada (generadores deterministas)
  render/      Escena del valle y del sector (Three.js, carga diferida), mapa 2D sin WebGL2,
               etiquetas sin superposición, paleta y texturas procedimentales
  ui/          Paneles (herramientas, comparación, misiones, palabras, docente) y gráficas
  content/     Misiones e informe de pruebas
  controller.ts  Une cálculo, dibujo y tiempo real; libera todos los recursos al salir
  CityLab.tsx    Componente del modo
tests/city/    Pruebas obligatorias, rendimiento y verificación de escenarios externos
src/quality/   Módulo «Calidad del agua»: modelo puro (model.ts y ptar.ts), procesos de las plantas (processes.ts, ptarUnits.ts), escenas 3D (three/), retos y experimentos; classic/ sin WebGL
tests/quality/ Pruebas del modelo de calidad del agua
src/canals/    Módulo «Hidráulica de canales»: cálculo puro (hydraulics.ts, culvert.ts, sediment.ts, advanced.ts, profiles.ts) y flujo no permanente (unsteady.ts, waves.ts), calculadoras y prediseñadores (designCalc.ts, designAdvanced.ts, design.tsx), criterios del RAS (norms.ts), instrumentos en vivo (live.tsx), planos, gráficas y memoria (plan.ts, planBuilders.ts, designPlans.ts, memoria.ts), escenas 3D (three/), un laboratorio por parte (UniformLab, JumpLab, BridgeLab, CulvertLab, SedimentLab, GaugeLab, WavesLab) y dibujos planos cuando no hay WebGL
tests/canals/  Pruebas de la hidráulica de canales y de las calculadoras
src/rooms/     Marco común de las salas con partes (RoomLab.tsx)
src/basins/    Sala «Cuencas»: hidrología pura (hydrology.ts), cuenca de la escena, tanque y simulaciones (scene.ts), río con llanuras (river.ts), herramientas de diseño (design.ts), reloj del aguacero (storm.tsx), gráficas en vivo (charts.tsx), esquemas planos (diagrams.tsx), escenas 3D (three/) y un laboratorio por parte (CuencaLab, HidroLab, FrecuenciaLab)
tests/basins/  Pruebas de la sala de cuencas
src/supply/    Sala «Acueducto»: tuberías (pipes.ts), redes (network.ts), golpe de ariete (hammer.ts), escenas (scene.ts), herramientas de diseño (design.ts), gráficas (charts.tsx), esquemas planos (diagrams.tsx), escenas 3D (three/) y un laboratorio por parte (TuberiaLab, RedLab, ArieteLab)
tests/supply/  Pruebas de la sala del acueducto
src/ground/    Sala «Aguas subterráneas»: hidrogeología (aquifer.ts), escenas (scene.ts), herramientas de diseño (design.ts), gráficas y esquemas (charts.tsx), escenas 3D (three/) y un laboratorio por parte (AcuiferoLab, PozoLab, ManchaLab)
tests/ground/  Pruebas de la sala de aguas subterráneas
src/dams/      Sala «Presas y embalses»: tránsito, vertedero y estabilidad (dam.ts), escenas (scene.ts), herramientas de diseño (design.ts), gráficas (charts.tsx), escenas 3D (three/) y un laboratorio por parte (EmbalseLab, VertederoLab, EstabilidadLab)
tests/dams/    Pruebas de la sala de presas y embalses
src/slopes/    Sala «Laderas»: Green-Ampt, talud infinito, SHALSTAB y RUSLE (slope.ts), escenas (scene.ts), herramientas de diseño (design.ts), gráficas (charts.tsx), escenas 3D (three/) y un laboratorio por parte
tests/slopes/  Pruebas de la sala de laderas
src/pumps/     Sala «Bombas y energía del agua»: curvas, NPSH y centrales (pump.ts), escenas (scene.ts), herramientas de diseño (design.ts), gráficas (charts.tsx), escenas 3D (three/) y un laboratorio por parte
tests/pumps/   Pruebas de la sala de bombas
src/measure/   Sala «Medir el agua»: pluviómetro, radar, aforo, curva de gasto y medidores (measure.ts), escenas (scene.ts), herramientas de diseño (design.ts), gráficas (charts.tsx), escenas 3D (three/) y un laboratorio por parte
tests/measure/ Pruebas de la sala de medición
src/house/     Sala «El agua en casa»: consumo, factura y tanque de agua lluvia (house.ts), escenas (scene.ts), herramientas de diseño (design.ts), gráficas (charts.tsx), la casa en 3D (three/) y un laboratorio por parte
tests/house/   Pruebas de la sala del agua en casa
src/model2d/   Sala «Modelación hidráulica 2D»: terreno y fuentes (terrain.ts), preprocesador subgrid y motor 2D (solver.ts), hidrología (hydrology.ts), rotura de presa (dambreak.ts), escenas (scene.ts), corridas (runs.ts), herramientas de diseño (design.ts), gráficas (charts.tsx), el valle en 3D (three/) y un laboratorio por parte
tests/model2d/ Pruebas de la sala de modelación 2D
src/three/     Acabado común (look.ts), paisaje (scenery.ts) y piezas de máquinas (machines.ts: tuberías con flujo, manómetros, válvulas, bombas, turbinas, red y casas)
src/three/     Acabado visual común de las escenas 3D (look.ts) y paisaje (scenery.ts: árboles, pradera, maqueta de terreno, lluvia, aves)
tools/geo/     Pipeline de datos reales y su prueba sin red
```

## Estructura del proyecto

```
src/
  content/      Textos: pasos, secuencias, vistas de detalle, preguntas, datos con fuentes,
                elementos, glosario, rutas, retos, experimentos de comparación, interfaz
  lab/          Modelo cualitativo y modelo de tormenta (balance en mm)
  state/        Estado de la experiencia (store: portada, salas, modos y enlaces directos) y especificación de escena por modo
  scene/
    geometry.ts Coordenadas del paisaje, perfiles, trayectos y regiones
    art/        Ilustración SVG: cielo, montaña y páramo, superficie, corte, personas, flujos
    details/    Ilustraciones de las cinco vistas de detalle
    engine.ts   Motor de partículas en Canvas (un solo bucle, elementos reutilizados)
    SceneView   Cámara, capas, rótulos, lupas, preguntas y gota trazadora
  components/   Portada (Home), encabezado con salas (Header), créditos y paneles (recorrido, exploración, experimentos, bitácora, detalle)
  lib/          Utilidades: trayectos, reloj de secuencias, almacenamiento local, audio, narración
  styles/       Estilos y fuentes
```

El contenido educativo, el modelo de simulación, el estado de navegación y la representación gráfica están separados. Para revisar textos basta editar `src/content/`.

## Rendimiento y recursos

- Ilustración en capas: arte estático en SVG que no se vuelve a pintar en cada fotograma, trazos animados en otra capa y partículas en Canvas.
- Un único bucle de animación que se detiene con la pausa, con «Reducir movimiento» y cuando la pestaña no está visible.
- *Calidad visual* automática: si el equipo no alcanza unos 40 cuadros por segundo, reduce partículas y resolución. También puede fijarse en «Ligera» o «Alta».
- Los cambios de interfaz no reinician la escena. El motor, el audio, los temporizadores y los relojes de las secuencias se liberan al cerrar cada vista.

## Créditos

Diseñado y desarrollado por Oscar Cossio.

Dedicado a Leidy Hernandez: «Por inspirar este laboratorio y por enseñar a transformar territorios y vidas.»

## Licencias

Three.js 0.187.0 se distribuye bajo licencia MIT. Las fuentes Atkinson Hyperlegible y Bricolage Grotesque se distribuyen bajo la SIL Open Font License; sus licencias están en `src/assets/fonts/`.

# Ciclo hidrológico: exploración interactiva

Aplicación educativa para niñas y niños de 8 a 12 años. Explica el ciclo hidrológico como un sistema: cómo se mueve, se almacena y cambia de estado el agua; qué energía lo impulsa; qué papel cumple la gravedad; y cómo se conectan la atmósfera, la vegetación, el suelo, los ríos, los acuíferos y el océano.

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
```

La versión `dist-single/index.html` incluye en un solo archivo el código, los estilos y las fuentes. Se abre directamente en el navegador, sin servidor y sin conexión a internet. La carpeta `dist/` puede publicarse en cualquier servidor web estático.

## Publicación en línea

Es un sitio estático: el cálculo y el dibujo 3D corren en el navegador de cada visitante, y el servidor solo entrega archivos (≈ 1,7 MB; ≈ 0,5 MB comprimidos). No necesita base de datos, funciones de servidor ni variables de entorno, y no hace peticiones a otros sitios.

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

### Modos y herramientas

| Modo | Qué permite |
| --- | --- |
| **Recorrido guiado** | 15 pasos con nombres y progreso visible (introducción, reservorios, evaporación, transpiración, condensación, transporte, precipitación, intercepción, infiltración, percolación y recarga, escorrentía, agua subterránea, almacenamiento, las personas en el ciclo y cierre). Cada paso tiene una idea principal y una misión concreta, organizadas en **Observa**, **Investiga** y **Profundiza**. Sobre el paisaje, un subtítulo guía la mirada en tres momentos: inicio, desarrollo y resultado. El avance siempre lo controla el niño. |
| **Exploración libre** | Capas que se encienden a voluntad: reservorios, todos los procesos, elementos y preguntas. Cualquier punto del paisaje abre su ficha. Las marcas «?» plantean preguntas que llevan a una observación, una vista de detalle, un experimento o la gota trazadora. |
| **Laboratorio del agua** | *Explorar condiciones*: modelo cualitativo con reglas visibles y balance de la lluvia. *Comparar escenarios A/B*: dos cuencas imaginarias que difieren en una sola condición, simuladas a la vez. Sigue seis pasos: pregunta, predicción, cambio, ejecución, comparación y explicación. |
| **Gota trazadora** | Sigue una porción de agua por rutas ramificadas elegidas en cada bifurcación, con su estado y el tiempo de permanencia aproximado en cada reservorio. |
| **Retos** | Sin cronómetros ni penalizaciones: cada respuesta no esperada recibe una pista y la opción de observar de nuevo. |
| **Bitácora** | Registra observaciones (al completar vistas de detalle), predicciones e hipótesis, comparaciones y explicaciones escritas por el niño. Los niveles (Observación, Exploración, Investigación, Hidrología) premian observar, comparar y explicar, no hacer clics. Se puede descargar como texto. |
| **Calidad del agua** | Tres escenas 3D con una pregunta cada una, retos con medalla y experimentos animados: una quebrada con peces, sonda, lupa y microscopio (índice BMWP/Col); una planta de potabilización convencional con sus once procesos (pestaña Procesos con animación «con lupa», valores del juego y criterios de la Resolución 0330 de 2017, y recorrido por la planta), tanques de vidrio, prueba de jarras en tiempo real, cloro y la Resolución 2115 de 2007 (IRCA); y una cuadra con el aguacero, el primer lavado y la prueba del colorante para hallar conexiones erradas. Sin WebGL, versión en dibujos planos. Ver `docs/calidad/MODELO_CALIDAD.md`. |
| **Glosario** | 109 términos con búsqueda; cada uno puede iluminar su lugar en el paisaje. |

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
- **El valle de Aburrá**: un esquema 3D para orientarse y elegir un sector.
- **El laboratorio**: un sector pequeño en 3D donde la lluvia se calcula en vivo y se puede ver cómo corre, se infiltra, se guarda y sale el agua.

En el laboratorio, los estudiantes pueden:
- crear lluvia (uniforme o localizada);
- cambiar superficies;
- construir jardines de lluvia y depósitos;
- obstruir o restaurar sumideros;
- ver bajo la calle las **dos redes separadas** de alcantarillado: aguas lluvias y aguas residuales. Son didácticas y se trazaron con criterios de la norma de diseño de EPM. Muestran las cámaras de inspección y de caída, el sentido y la velocidad del agua, los tramos en carga y el rebose; se pueden ver juntas o una sola, en corte de calle, en planta y en perfil. Incluyen la intervención «conexiones erradas»;
- lanzar una **creciente** por la quebrada de la ladera, hasta una avenida torrencial con lodo, y ver en vivo la sección transversal, el hidrograma, el desborde sobre las casas de la orilla, los vehículos que arrastra, las marcas en las fachadas y los daños calculados por edificación;
- tapar con troncos la **cobertura** por donde la quebrada pasa bajo la carrera (libre, 50 %, 90 % o «se tapa con la creciente») y ver cómo el agua se represa y cruza la vía; su hidráulica sigue la guía HDS-5 de la FHWA;
- calcular la creciente **desde la lluvia en la cuenca** (bosque, mixta o urbanizada; métodos del NRCS) y seguir el **aviso temprano**: una estación aguas arriba con alertas amarilla, naranja y roja, y el tiempo que queda para avisar antes de que el agua llegue a las casas;
- ver el **peligro** de cada lugar (clases H1–H6 según profundidad y velocidad; referencia técnica, no el mapa oficial de amenaza);
- seguir el agua con gotas trazadoras y medir la profundidad en el tiempo;
- comparar A y B con exactamente la misma lluvia.

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
src/quality/   Módulo «Calidad del agua»: modelo puro (model.ts), procesos de la planta (processes.ts), escenas 3D (three/), retos y experimentos; classic/ sin WebGL
tests/quality/ Pruebas del modelo de calidad del agua
tools/geo/     Pipeline de datos reales y su prueba sin red
```

## Estructura del proyecto

```
src/
  content/      Textos: pasos, secuencias, vistas de detalle, preguntas, datos con fuentes,
                elementos, glosario, rutas, retos, experimentos de comparación, interfaz
  lab/          Modelo cualitativo y modelo de tormenta (balance en mm)
  state/        Estado de la experiencia (store) y especificación de escena por modo
  scene/
    geometry.ts Coordenadas del paisaje, perfiles, trayectos y regiones
    art/        Ilustración SVG: cielo, montaña y páramo, superficie, corte, personas, flujos
    details/    Ilustraciones de las cinco vistas de detalle
    engine.ts   Motor de partículas en Canvas (un solo bucle, elementos reutilizados)
    SceneView   Cámara, capas, rótulos, lupas, preguntas y gota trazadora
  components/   Paneles e interfaz (recorrido, exploración, laboratorio, bitácora, detalle)
  lib/          Utilidades: trayectos, reloj de secuencias, almacenamiento local, audio, narración
  styles/       Estilos y fuentes
```

El contenido educativo, el modelo de simulación, el estado de navegación y la representación gráfica están separados. Para revisar textos basta editar `src/content/`.

## Rendimiento y recursos

- Ilustración en capas: arte estático en SVG que no se vuelve a pintar en cada fotograma, trazos animados en otra capa y partículas en Canvas.
- Un único bucle de animación que se detiene con la pausa, con «Reducir movimiento» y cuando la pestaña no está visible.
- *Calidad visual* automática: si el equipo no alcanza unos 40 cuadros por segundo, reduce partículas y resolución. También puede fijarse en «Ligera» o «Alta».
- Los cambios de interfaz no reinician la escena. El motor, el audio, los temporizadores y los relojes de las secuencias se liberan al cerrar cada vista.

## Licencias

Three.js 0.187.0 se distribuye bajo licencia MIT. Las fuentes Atkinson Hyperlegible y Bricolage Grotesque se distribuyen bajo la SIL Open Font License; sus licencias están en `src/assets/fonts/`.

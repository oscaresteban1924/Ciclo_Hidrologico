# Modelo de escorrentía urbana — documentación técnica

Motor: `inercial-local-urbano` 1.0.0 (`src/city/sim/`). Este documento describe lo que el código **hace**, sus supuestos y sus límites.

> El modelo es educativo. **No es un pronóstico oficial de inundaciones** y sus intervenciones **no son diseños de ingeniería**.

## 1. Método

Malla regular de celdas cuadradas de lado `dx`, con malla escalonada:
- la profundidad `h` [m] se guarda en el centro de cada celda;
- el caudal unitario `q` [m²/s] se guarda en las caras.

La superficie libre es `η = z + h`.

**Momento.** Aproximación inercial local de las ecuaciones de aguas someras (Bates, Horritt y Fewtrell 2010), con la ponderación θ de de Almeida et al. (2012). La fricción de Manning se trata de forma semiimplícita:

```
h_f = max(η_i, η_j) − max(z_i, z_j)                       (profundidad de flujo en la cara)
q̃  = θ·q + (1 − θ)/2 · (q_izq + q_der)
q⁺ = (q̃ − g·h_f·dt·(η_j − η_i)/dx) / (1 + g·dt·n²·|q̃| / h_f^(7/3))
```

Si `h_f ≤ 0,1 mm`, el caudal de esa cara es 0.

**No es la solución completa de Saint-Venant.** Se desprecia la advección de momento, por eso el método es adecuado para flujo gradualmente variado y menos exacto en flujo rápido.

En pendientes fuertes se limita el número de Froude a `Fr ≤ 1,5`, como estabilización: `|q| ≤ 1,5·h_f·√(g·h_f)`. El efecto de este límite se cuantifica en la sección 9.

**Continuidad.** Se usa un balance de volúmenes finitos:

```
h⁺ = h + (dt/dx)·(q_oeste − q_este + q_sur − q_norte)
```

Antes de aplicarlo, un **limitador de positividad** escala los caudales que salen de cada celda para que no entregue más agua de la que tiene. Por eso nunca aparecen profundidades negativas. Si por redondeo apareciera un valor negativo, se lleva a cero y el agua añadida se registra en `clipped`; en todas las pruebas ese valor fue 0.

**Paso de tiempo.**
- `dt = α·dx / (√(g·h_max) + |u|_max)` con `α = 0,7`, y nunca mayor que 1 s.
- Los pasos se cortan **solo** en los cambios del hietograma y en los instantes de registro (cada 10 s simulados), nunca en los cuadros de la animación. Por eso una corrida es reproducible bit a bit, sin importar el ritmo de dibujo ni las pausas (prueba 9).

**Orden de cada paso.**
1. Lluvia y lluvia de techos.
2. Entrada externa.
3. Momento y salidas.
4. Limitador.
5. Continuidad.
6. Infiltración.
7. Sumideros y descarga de depósitos.
8. Balance.

## 2. Términos hidrológicos

| Término | Implementación |
|---|---|
| Lluvia | `R [m/s] = I [mm/h] / 3 600 000`. El hietograma puede ser constante o con pico (triangular discretizado por minuto, con el mismo volumen total). La lluvia puede caer en todo el sector o solo dentro de un círculo. |
| Techos | Las celdas de edificio son sólidas: ninguna de sus caras deja pasar agua. La lluvia sobre su huella va a la celda libre más cercana a la bajante, o a un depósito, en el mismo paso. El techo no almacena agua. Así la lluvia de techos se cuenta **una sola vez** (prueba 11). |
| Infiltración | Capacidad constante `fc` por cobertura, limitada por el agua disponible y por un almacenamiento máximo `S_max` del suelo o de la capa porosa. El almacenamiento inicial es 20 % de `S_max` con suelo seco y 70 % con suelo húmedo. No se redistribuye en el suelo durante el evento. |
| Almacenamiento superficial | Es el agua sobre la superficie (charcos, bajos, jardines). Además, las láminas de menos de 0,1 mm no fluyen y funcionan como una retención mínima. |
| Jardín de lluvia | Se forma una depresión de 0,15 m bajo la cuneta más baja, se abre el bordillo y se usa la cobertura «jardín de lluvia» (`fc` 50 mm/h, `S_max` 0,15 m). Se miden el agua que entra y el agua que rebosa. |
| Depósito | Recibe la lluvia del techo conectado. Tiene capacidad fija. Lo que sobra rebosa a la bajante. Su destino puede ser «entregar despacio a la red» (caudal fijo) o «retener». |
| Sumidero | Usa las ecuaciones de vertedero y orificio de la guía HEC-22: `Q = min(1,66·P·d^1,5; 0,67·A·√(2g·d); Q_cap)`. `P` y `A` se reducen según la obstrucción. La profundidad junto al bordillo `d` se reconstruye a partir de la profundidad media de la celda con la pendiente transversal de la cuneta (2 %, valor hipotético), suponiendo una lámina triangular o trapezoidal. La captación nunca supera el agua disponible en la celda (prueba 3). |
| Red de drenaje | Red esquemática con un colector de 250 L/s de capacidad total. No resuelve la hidráulica de tuberías y no devuelve agua a la calle: no se finge sobrecarga. La interfaz `DrainNetworkAdapter` deja preparada la conexión con SWMM, que podría aceptar y devolver agua. |
| Salidas | Caras de borde con condición de profundidad normal, `q = min(h^(5/3)·√S/n; √g·h^1,5)`, con la pendiente `S` declarada en el escenario. Los demás bordes son cerrados. |
| Entrada externa | Caudal constante, repartido en las celdas del borde indicado. Se registra como término propio. |

## 3. Balance de agua

El volumen de control es **todo el dominio del sector, incluidos los techos**. Términos acumulados [m³]:

```
P   precipitación (suelo + techos)        Qin  entrada externa        Ret  devuelto por la red (0 aquí)
ΔS  cambio del agua en superficie         I    infiltrado              Dev  guardado en depósitos
D   aceptado por la red                   B    salida por los bordes
residuo = P + Qin + Ret − (ΔS + I + Dev + D + B)
```

El residuo se muestra tal como sale, sin ajustarlo. En las pruebas queda entre 10⁻¹⁶ y 10⁻¹² de P (ver `PRUEBAS.md`). El panel docente muestra cada término en vivo.

## 4. Parámetros por cobertura (estimados)

| Cobertura | n de Manning | Infiltración | Almacenamiento | Base |
|---|---|---|---|---|
| Asfalto | 0,016 | 0 | 0 | Chow (1959); TR-55 |
| Concreto, andén | 0,015 | 0 | 0 | Chow (1959) |
| Cancha | 0,014 | 0 | 0 | Concreto pintado |
| Pavimento permeable | 0,018 | 100 mm/h | 0,10 m | Valor conservador; el pavimento nuevo infiltra más y la colmatación lo reduce |
| Grama | 0,15 | 13 mm/h | 0,04 m | Ks de suelo franco (Rawls et al. 1983); n para pasto corto (TR-55) |
| Zona verde con árboles | 0,24 | 22 mm/h | 0,06 m | Ks franco arenoso (Rawls et al. 1983); n para pasto denso (TR-55) |
| Jardín de lluvia | 0,10 | 50 mm/h | 0,15 m | Valores típicos de biorretención |
| Cauce de quebrada | 0,035 | 0 | 0 | Chow (1959); impermeable durante el evento |

**Ninguno de estos valores fue calibrado para Medellín.** La aplicación los marca como «parámetro estimado».

## 5. Unidades

El sistema interno usa metros, segundos y metros cúbicos. La interfaz muestra la lluvia en mm/h, los caudales en L/s, las profundidades en mm o cm y los volúmenes en m³. Prueba V3: `R = I/3 600 000`, y 36 mm/h = 1·10⁻⁵ m/s exacto.

## 6. Dibujo y cálculo

- El terreno se dibuja **interpolando** las cotas de celdas vecinas «conectadas». Los bordillos, los lotes, los muros de terraza y los bordes de jardín se conservan como escalones. Es solo un dibujo: el cálculo usa las cotas de celda.
- La lámina de agua de cada esquina es el promedio de la profundidad de las celdas conectadas que la comparten. Se dibuja **a escala 1:1**. Si se activa «Agua ×5», un aviso visible indica que el dibujo está amplificado y que los números no cambian.
- Las flechas usan exactamente la velocidad del modelo en su celda (prueba V4). Las gotas trazadoras se mueven con la velocidad interpolada de las caras (RK2). Su captura o infiltración es probabilística con semilla fija, en proporción a lo calculado, y nunca alteran el volumen.
- Ningún efecto visual interviene en el cálculo. La sección 6.1 detalla qué dato controla cada uno.

### 6.1 Cómo se dibujan la lluvia y el agua

Los efectos leen el estado calculado en cada cuadro (`src/city/render/fxData.ts`, sin Three.js, y `src/city/render/stormFx.ts`). La prueba **V5** comprueba que leen exactamente lo calculado.

| Efecto | Qué lo controla | Qué es solo dibujo |
|---|---|---|
| **Color del agua** | Profundidad calculada de cada celda, con la misma escala de la leyenda. Entre celdas se interpola el color, no la altura. En la vista realista la escala es **de color natural**: lámina gris-café turbia, más oscura y opaca cuanto más profunda, con los mismos cortes (1 mm a 30 cm) y rótulos de la escala azul (prueba V9). El botón «Agua en azul» vuelve a la escala azul; las vistas «Materiales» y «Resultados» usan siempre la azul. | Los tonos de la escala natural. En la escala azul, la lámina de pocos milímetros se dibuja más transparente, para que se vea el suelo mojado debajo; desde 1 cm, la opacidad es la de la leyenda. |
| **Reflejos del agua** | Solo dónde hay agua (profundidad calculada mayor que ≈ 1 mm). El brillo crece en ángulo rasante (Fresnel), como en un charco real. | El entorno que se espeja: una captura de la propia escena (fachadas, calles y cielo) que se repite cuando el cielo de la tormenta se asienta, para que el agua y el pavimento espejen el cielo gris y no el soleado. |
| **Altura de la lámina** | Profundidad calculada, a escala 1:1. | Solo «Agua ×5» la engrosa, y lo avisa en pantalla. Los efectos nuevos no cambian la altura: solo el color y la normal de la superficie. |
| **Vetas sobre el agua** | Velocidad calculada en la celda, la misma de las flechas. Avanzan en la dirección del flujo a esa velocidad, **en tiempo real**: la velocidad de simulación (×30) no las acelera. | El dibujo de la veta (ruido estirado) y su reinicio cada 1,6 s, que evita que se deformen. |
| **Espuma** | Agua rápida: número de Froude local (velocidad ÷ √(g·h)) mayor que ≈ 0,85, con al menos 5 mm de profundidad. | La forma de la espuma. |
| **Gotas de lluvia** | Intensidad aplicada en ese instante (cantidad y opacidad) y zona de lluvia: en la lluvia localizada solo caen dentro del círculo, con la misma regla del motor. | Posición de cada gota. Caen a ≈ 9 m/s, la velocidad típica de una gota de lluvia, también en tiempo real. |
| **Salpicaduras y anillos** | Solo donde llueve. Sobre agua de más de 1,5 mm (profundidad calculada) se dibujan anillos; sobre superficie seca, una corona de gotitas. | Posición y ritmo de cada salpicadura. Se desvanecen con la distancia. |
| **Cortina de lluvia** | Borde del círculo de lluvia localizada. Con lluvia uniforme no se dibuja: la bruma de la tormenta la da la niebla. | Su textura. |
| **Suelo mojado** | Donde llueve, y la huella de la profundidad máxima alcanzada (hasta 3 mm), que marca por dónde pasó el agua. | Cuánto se oscurece y cuánto brilla. Las fachadas, los techos y el entorno también se oscurecen y brillan con la lluvia, con chorreaduras en las paredes; esto no indica agua acumulada. |
| **Cielo y luz** | Intensidad de lluvia: el cielo se oscurece y la luz baja durante el aguacero. | Los colores. Con la tormenta se encienden ventanas, luminarias (halo y luz sobre el suelo mojado) y los barrios del entorno; es ambiente, no el alumbrado real. |
| **Bruma y nubes bajas** | Intensidad de lluvia. Con lluvia fuerte, la visibilidad cae a algo más de un kilómetro detrás del punto que se mira: el sector queda nítido y el valle se pierde en el aguacero. | Nubes bajas que se arrastran por las laderas, siempre lejos del sector y de la cámara. Los rótulos lejanos que quedan en la bruma se ocultan. |
| **Velo de lluvia en pantalla** | Intensidad de lluvia; solo en la vista realista. | Trazos finos que caen y una bruma tenue en la parte alta de la pantalla. Desaparece al mirar hacia abajo (la vista «Arriba» lee el agua sin velo). |
| **Chorro de cada bajante** | Caudal que el techo envía a la superficie: intensidad × área del techo donde llueve, si el techo no está conectado a un depósito. Es el mismo reparto del motor (V5). | Forma parabólica del chorro y grosor visual, que crece con la raíz del caudal. |
| **Remolino del sumidero** | Caudal captado por ese sumidero en el último paso. Un sumidero obstruido por completo no muestra remolino. | Dibujo del remolino. |
| **Escurrimiento de salida** | Caudal que sale por cada cara de salida del borde del sector: el que el balance cuenta como «Salió del sector» (V5). | Una lámina que sigue unos 7 m por la calle vecina y se desvanece. Fuera del sector no se calcula nada: la lámina solo señala dónde y cuánto sale. |
| **Recorrido de las gotas trazadoras** | Posiciones calculadas por el modelo (RK2 con la velocidad de las caras), guardadas cada 0,35 m recorridos desde donde se soltó cada gota, y su destino (sumidero, suelo, salida o depósito). Si un tramo recto entre dos puntos rozaría la esquina de un edificio, se guarda un punto intermedio por la celda libre: el dibujo nunca corta por dentro de un edificio (prueba V6). Distancia recorrida y tiempo de viaje de cada gota; el panel muestra el promedio por destino. | Estilo de ruta: franja de color con borde blanco y sombra suave, con ancho en metros y un mínimo en pantalla. Azul mientras la gota se mueve; al llegar, el color del destino (los de «¿Adónde fue la lluvia?», en el mismo orden). En cada tanda, una gota guía tiene una ruta más gruesa con flechas que avanzan hacia ella y una etiqueta con lo recorrido; las demás, más finas, muestran cómo se abre el grupo. Marcas de destino con ícono, agrupadas y con el número de gotas. Anillo punteado donde se soltó la tanda. Lo que queda detrás de un edificio se ve tenue. Si la gota cae desde un techo, la ruta baja junto a la pared, como por la bajante; en el modelo, ese paso es inmediato. |
| **Depósito** | Nivel = volumen almacenado ÷ capacidad. El rebose aparece cuando está lleno, con el caudal que entra menos el que se entrega a la red. | El dibujo esquemático del tanque, que no ocupa celdas del cálculo. |

Además, siguen siendo **decorativos**:
- las cabinas del cable aéreo;
- los árboles y las marcas viales;
- las nubes;
- el **entorno del sector**: el Valle de Aburrá de referencia de la sección 6.2, a escala 1:1, alrededor de la maqueta (`src/city/render/backdrop.ts`):
  - **Ubicación.** El sector se dibuja en su punto del esquema del valle (`SECTOR_SPOTS`; un escenario de datos reales usa su longitud y latitud). En los escenarios didácticos esa ubicación es **ilustrativa**: la calle queda al pie de la ladera noroccidental, a ≈ 1,4 km del río; la ladera, más arriba, a ≈ 2,9 km.
  - **El sector está asentado en el terreno, no sobre una base.**
    - Cerca del sector, el terreno sigue el plano de su pendiente, calculado por mínimos cuadrados sobre sus celdas. Ese plano se funde con el relieve del valle a unos 230 m.
    - Una franja de unión empieza con la altura exacta del borde del sector y con el color de su superficie (calle, andén, prado o cauce), sin escalón. A unos 12 a 30 m se une con el terreno del entorno.
    - Las casas cercanas se apoyan en ese suelo y, en pendiente, se entierran hasta su esquina más baja.
  - **Relieve.** El de la tabla de referencia, sin exagerar, con las montañas que cierran el valle (`outerZ`). La malla es fina cerca (20 m en calidad alta, 40 m en ligera) y se abre hacia el horizonte (hasta 30 km). Con lluvia fuerte la bruma baja la visibilidad a algo más de un kilómetro detrás del sector.
  - **Barrios, por tipo de tejido urbano** (el mismo de la vista del valle):
    - hasta ≈ 650 m (340 m en ligera): cuadras con casas pegadas en lo plano y casas escalonadas en las laderas, con el frente hacia la calle o ladera abajo; culatas de ladrillo sin ventanas aunque el frente esté pintado; puertas, persianas de locales, ventanas con reja y balcones; tanques negros y azules, pisos en obra gris con varillas y algunos murales; carros, taxis y busetas parqueados;
    - hasta ≈ 5 km (2,4 km en ligera): volúmenes por tejido (ladera, plano, Centro, El Poblado, industria, municipios);
    - más lejos: el tapete de techos moteados y, en todo el valle, las torres del Centro y de El Poblado.
  - **Agua y verde.** Quebradas con franjas de bosque en sus retiros, cerros tutelares arbolados, bosque y potreros montaña arriba, guayacanes amarillos y rosados.
  - **Transporte e hitos.** Río canalizado con taludes, parque lineal y autopistas; metro elevado (líneas A y B) con estaciones y trenes que van y vuelven; tranvía; los seis metrocables con torres, estaciones y cabinas; Edificio Coltejer, Biblioteca España, estadio y pista del aeropuerto.
  - **Rótulos lejanos** de baja prioridad (río, metro, metrocables cercanos, cerros, Centro, Biblioteca España), solo en las vistas altas.
  - **Detalle según el equipo.** Si cada cuadro tarda más de ≈ 0,2 s durante 3 s (equipos sin tarjeta gráfica), se ocultan los volúmenes y árboles lejanos y las nubes; el relieve sigue mostrando la ciudad. Vuelven si el equipo dibuja a más de ≈ 16 cuadros por segundo durante 8 s.

  Trazados y cotas son aproximados (no es un modelo digital de elevación) y no hay infraestructura levantada: casas, carros, murales y cables son ilustrativos y no intervienen en el cálculo. La prueba V8 verifica la unión con el borde, el relieve frente a la tabla de referencia, que ningún objeto quede dentro del sector y la posición del río. Las ventanas encendidas al oscurecer con la lluvia son solo ambiente.
- **las fachadas y la vida de calle del propio sector** (solo dibujo; las huellas, alturas y bajantes de los edificios no cambian):
  - cada fachada de casa de barrio se arma con módulos de 3 m por un piso de un atlas dibujado a mano (`facadeAtlas`, en `textures.ts`); cada cara mira lo que tiene enfrente en la malla del sector: calle o andén (frente), casa vecina (culata) o patio (lado);
  - frente: ladrillo a la vista o pañete pintado; en el primer piso, una puerta y locales con aviso y persiana metálica (abierta o cerrada) o garaje; arriba, ventanas con reja o con marco de aluminio, balcones con baranda y materas;
  - culatas y lados: ladrillo a la vista, con pocas ventanas o bloque calado; en algunas casas, el último piso en obra gris con varillas;
  - azoteas: tanques negros y azules, ropa tendida y cubiertas livianas de teja ondulada;
  - los avisos usan nombres genéricos de negocios de barrio (tienda, panadería, droguería, ferretería, miscelánea, papelería, cacharrería, variedades, minimercado), no marcas ni locales reales;
  - postes de concreto con cruceta y luminaria (en los puntos de alumbrado del escenario), cables entre postes y hacia afuera del sector, y acometidas hasta las fachadas; motos parqueadas en el andén, lejos de las sondas y de los sumideros; pasamanos en las escaleras de la ladera;
  - no son la red eléctrica, el alumbrado ni construcciones reales.

**Movimiento reducido.** Si el sistema operativo lo pide:
- las gotas quedan quietas y más tenues;
- no hay salpicaduras ni anillos;
- las vetas, el remolino y el escurrimiento de salida no se desplazan;
- no hay velo de lluvia en pantalla y las nubes bajas no se mueven.

Toda la información sigue disponible en colores, números y flechas.

**Densidad adaptativa.** Si el equipo dibuja a menos de ≈ 22 cuadros por segundo, la cantidad de gotas y salpicaduras baja sola hasta el 30 %, y vuelve a subir cuando hay margen. Solo afecta efectos decorativos.

**Relámpagos.** No se incluyen, a propósito: los destellos pueden afectar a personas sensibles a la luz intermitente (WCAG 2.3).

### 6.2 Vista general del Valle de Aburrá (orientación, aproximada)

La primera escena del módulo sirve para **orientarse**. No interviene en ningún cálculo. Se dibuja a partir de una tabla de referencia aproximada (`src/city/render/aburra.ts`), escrita a mano porque desde el entorno de trabajo **no hubo acceso** a un modelo digital de elevación ni a OpenStreetMap: el proxy rechazó esos servicios. Coordenadas: kilómetros desde lon −75,5736, lat 6,2442 (x al oriente, y al norte), de Caldas a Copacabana.

| Elemento | Cómo se construye | Tolerancia comprobada (V7) |
|---|---|---|
| Río Medellín | Polilínea con cotas, de ≈ 1 780 m en Caldas a ≈ 1 420 m al norte | El dibujo pasa por las cotas de la tabla (error 0,0 m) y baja siempre de sur a norte |
| Forma del valle | Perfil transversal: fondo casi plano, piedemonte o banco, escarpe y cresta. Ancho del fondo y altura de la cresta interpolados en 10 cortes de sur a norte, distintos al oriente y al occidente | Las estaciones de las líneas A y B del metro quedan a menos de 150 m sobre el río (San Javier, ≈ 120 m) |
| Cerros tutelares | Nutibara, El Volador, La Asomadera, Pan de Azúcar, Tres Cruces y Padre Amaya, con su cota de referencia | Error ≤ 150 m en la cima (el mayor: Pan de Azúcar, 113 m) |
| Quebradas | 25 cauces tallados en las laderas, con árboles en sus retiros | — |
| Ciudad | Tejido urbano por zonas (ladera, plano, Centro, El Poblado, industria, municipios vecinos) hasta un borde superior que cambia por sector de la ciudad; los cerros quedan verdes | Los dos sectores de laboratorio caen en zona urbana: la calle en el fondo del valle y la ladera en la pendiente |
| Transporte | Metro (líneas A y B) en viaducto, con estaciones y trenes; tranvía de Ayacucho; cables K, L, J, H, M y P con torres, estaciones y cabinas | Trazados aproximados, sin verificación cartográfica |
| Puntos de referencia | Aeropuerto Olaya Herrera, estadio, Edificio Coltejer, Biblioteca España, Parque Arví, municipios vecinos | Posiciones aproximadas |

**Escala.** Relieve y edificios exagerados ×1,5, como lo dice el encabezado de la escena. La misma tabla, **sin exagerar**, es el entorno de cada sector (sección 6.1). **Qué no es.** No es cartografía oficial ni un modelo digital de elevación: los trazados, las cotas y los límites entre zonas son aproximados, los edificios se colocan al azar dentro de cada zona y las posiciones de los sectores de laboratorio son ilustrativas. Si se dispone de un DEM y de capas oficiales, se pueden reemplazar como se explica en `DATOS_REALES.md`, sección 7.

## 7. Tiempo, pausa y reproducibilidad

- El tiempo de simulación es independiente del tiempo de dibujo.
- La pausa, que es la pausa global de la aplicación (tecla P), detiene el cálculo. También se activa sola al ocultar la pestaña.
- Reiniciar reconstruye el estado inicial desde el escenario.
- Los cambios de terreno, obstáculos, superficies, sumideros y lluvia se aplican **al reiniciar**. Mientras tanto, la aplicación muestra «Cambios listos».
- La comparación A/B usa la misma lluvia, el mismo estado inicial, el mismo tiempo simulado, el mismo dominio, los mismos bordes, el mismo umbral y la misma semilla. Las dos corridas avanzan a la vez y se registran en los mismos instantes. La aplicación verifica esas condiciones y lo muestra (prueba 10).

## 8. Formato de escenario (v1)

Lo define `src/city/sim/scenario.ts` (`format: 'medellin-lluvia/escenario'`, `version: 1`). Campos:
- identificación: `id`, `title`, `provenance` (con el tipo de cada capa: real, estimado, didáctico o hipotético), `extent` (CRS, origen, ancho, alto y `lonLat` opcional);
- unidades y resoluciones: `units`, `resolutions`;
- terreno y coberturas: `terrain` (ráster con datum y exactitud), `surfaces`, `bowls`;
- elementos: `buildings`, `drains`, `outlets`, `inflows`;
- intervenciones posibles: `zones`, `gardens`, `tanks`;
- apoyo: `probes`, `labels`, `pipes` (solo dibujo), `decor` (solo dibujo);
- ejecución: `defaults` (condiciones iniciales y de lluvia), `engine` (nombre y versión), `seed`.

La configuración del usuario (`medellin-lluvia/config`, v1) guarda las condiciones compartidas y las intervenciones de A y B. Siempre se valida al importarla.

## 9. Sensibilidad y límites conocidos

**Resolución (calle de prueba, 60 mm/h y 20 min).**

| dx | Salida | Drenado | Esquina |
|---|---|---|---|
| 2 m | 51,2 m³ | 33,6 m³ | 1,05 cm |
| 1 m | 52,4 m³ | 33,4 m³ | 0,76 cm |
| 0,5 m | 52,9 m³ | 33,0 m³ | 1,39 cm |

El criterio fijado de antemano se cumple: la salida difiere menos de 10 % y la profundidad en la esquina menos de 1 cm entre 1 m y 0,5 m. En la primera ejecución **no** se cumplía, y la historia está publicada en `PRUEBAS.md`.

**Límite de Froude (ladera con 10 % de pendiente).**

| Límite | Drenado |
|---|---|
| Fr ≤ 1 | 58,3 m³ |
| Fr ≤ 1,5 (por defecto) | 55,1 m³ |
| Sin límite | 51,8 m³ |

En calles empinadas, la captación de los sumideros tiene una incertidumbre del orden de ±6 % por el método.

**Límites.**
- El método no conserva el momento de forma completa, y por eso el flujo supercrítico es menos preciso.
- No hay redistribución en el suelo durante el evento.
- No hay evaporación durante el evento.
- La red no se resuelve hidráulicamente.
- Las bajantes no almacenan agua.
- No hay puentes ni túneles en los escenarios incluidos. Si un escenario con datos reales los tuviera, deben excluirse o tratarse aparte, y el pipeline no los genera.
- Los sectores son pequeños: hasta 600 m por lado.

## 10. Referencias

- Bates, P. D., Horritt, M. S., & Fewtrell, T. J. (2010). A simple inertial formulation of the shallow water equations for efficient two-dimensional flood inundation modelling. *Journal of Hydrology*, 387, 33–45.
- de Almeida, G. A. M., Bates, P., Freer, J. E., & Souvignet, M. (2012). Improving the stability of a simple formulation of the shallow water equations for 2-D flood modeling. *Water Resources Research*, 48, W05528.
- Chow, V. T. (1959). *Open-Channel Hydraulics*. McGraw-Hill.
- USDA NRCS (1986). *Urban Hydrology for Small Watersheds* (TR-55).
- Rawls, W. J., Brakensiek, D. L., & Miller, N. (1983). Green-Ampt infiltration parameters from soils data. *Journal of Hydraulic Engineering*, 109(1), 62–70.
- FHWA (2009). *Urban Drainage Design Manual*, HEC-22, 3.ª ed.
- Rossman, L. A., & Huber, W. C. (2016). *Storm Water Management Model Reference Manual, Vol. I – Hydrology*. EPA/600/R-15/162A.

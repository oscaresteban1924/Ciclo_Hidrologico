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

En pendientes fuertes se limita el número de Froude a `Fr ≤ 1,5`, como estabilización: `|q| ≤ 1,5·h_f·√(g·h_f)`. El efecto de este límite se cuantifica en la sección 9. En un cauce muy empinado tiene un costo: la creciente va más honda y más lenta que en la realidad. En el tramo de 10 % de la ladera, con 60 m³/s, el método da 2,06 m y la profundidad normal de Manning sin límite es 1,39 m, un 48 % más honda (prueba F1). Se probó relajar el límite hasta 3 en agua honda: la creciente llegaba a su profundidad normal, pero contra el terraplén de la carrera aparecían oleadas espurias, con un caudal por los cajones que saltaba entre 3 y 30 m³/s. Se descartó. El método inercial local no incluye la aceleración convectiva y por eso no representa bien el resalto de un torrente que choca con una obra.

**Continuidad.** Se usa un balance de volúmenes finitos:

```
h⁺ = h + (dt/dx)·(q_oeste − q_este + q_sur − q_norte)
```

Antes de aplicarlo, un **limitador de positividad** escala los caudales que salen de cada celda para que no entregue más agua de la que tiene. Por eso nunca aparecen profundidades negativas. Si por redondeo apareciera un valor negativo, se lleva a cero y el agua añadida se registra en `clipped`; en todas las pruebas ese valor fue 0.

**Paso de tiempo.**
- `dt = α·dx / (√(g·h_max) + |u|_max)` con `α = 0,7`, y nunca mayor que 1 s.
- Los pasos se cortan **solo** en los cambios del hietograma y en los instantes de registro (cada 10 s simulados), nunca en los cuadros de la animación. Por eso una corrida es reproducible bit a bit, sin importar el ritmo de dibujo ni las pausas (prueba 9).

**Orden de cada paso.**
1. Lluvia y lluvia de techos (con conexiones erradas activas, la de esos techos va al alcantarillado de aguas residuales).
2. Entrada externa y creciente de la quebrada; aportes a la red (aguas residuales, aguas arriba).
3. Momento y salidas.
4. Limitador.
5. Continuidad.
6. Infiltración.
7. Sumideros y red de alcantarillado (sección 6.3), o red esquemática en escenarios sin red.
8. Balance.

## 2. Términos hidrológicos

| Término | Implementación |
|---|---|
| Lluvia | `R [m/s] = I [mm/h] / 3 600 000`. El hietograma puede ser inventado (constante o con pico triangular discretizado por minuto, con el mismo volumen total; de 5 min a 6 h), una tormenta de diseño con la curva IDF de Olaya Herrera o un aguacero reconstruido, y se multiplica por el factor de clima (sección 6.10). La lluvia puede caer en todo el sector o solo dentro de un círculo. |
| Techos | Las celdas de edificio son sólidas: ninguna de sus caras deja pasar agua. La lluvia sobre su huella va a la celda libre más cercana a la bajante, o a un depósito, en el mismo paso. El techo no almacena agua. Así la lluvia de techos se cuenta **una sola vez** (prueba 11). |
| Infiltración | Capacidad constante `fc` por cobertura, limitada por el agua disponible y por un almacenamiento máximo `S_max` del suelo o de la capa porosa. El almacenamiento inicial es 20 % de `S_max` con suelo seco y 70 % con suelo húmedo. No se redistribuye en el suelo durante el evento. |
| Almacenamiento superficial | Es el agua sobre la superficie (charcos, bajos, jardines). Además, las láminas de menos de 0,1 mm no fluyen y funcionan como una retención mínima. |
| Jardín de lluvia | Se forma una depresión de 0,15 m bajo la cuneta más baja, se abre el bordillo y se usa la cobertura «jardín de lluvia» (`fc` 50 mm/h, `S_max` 0,15 m). Se miden el agua que entra y el agua que rebosa. |
| Depósito | Recibe la lluvia del techo conectado. Tiene capacidad fija. Lo que sobra rebosa a la bajante. Su destino puede ser «entregar despacio a la red» (caudal fijo) o «retener». |
| Sumidero | Por tipo (EPM GD-AS002, numeral 8.5). **Rejilla en la cuneta**: vertedero y orificio de la guía HEC-22, `Q = min(1,66·P·d^1,5; 0,67·A·√(2g·d))`. **Ventana en el bordillo**: en pendiente `Q = k·L·√g·d^1,5`, con `k` = 0,20, 0,22 y 0,23 para 2, 4 y 8 % de pendiente longitudinal; en punto bajo `Q = 1,65·L·d^1,5`, y como orificio cuando la lámina supera la altura de la ventana. **Mixto**: rejilla más ventana. `P`, `A` y `L` se reducen según la obstrucción. La profundidad junto al bordillo `d` se reconstruye a partir de la profundidad media de la celda con la pendiente transversal de la cuneta (2 %, valor hipotético), suponiendo una lámina triangular o trapezoidal. La captación nunca supera el agua disponible en la celda (prueba 3) y se detiene si la caja del sumidero está llena (sección 6.3). Prueba S3. |
| Red de drenaje | En los dos sectores: **red separada** de aguas lluvias y de aguas residuales, calculada (sección 6.3). En escenarios importados sin red: red esquemática con un colector de 250 L/s de capacidad total, que no resuelve la hidráulica de tuberías ni devuelve agua a la calle. |
| Creciente | Hidrograma triangular del SCS (sube en `tp`, baja en 1,67·`tp`) sobre un caudal base, repartido en las celdas de la entrada de la quebrada. El volumen de cada paso es la integral exacta del hidrograma (prueba S6). Sección 6.4. |
| Salidas | Caras de borde con condición de profundidad normal, `q = min(h^(5/3)·√S/n; Fr_máx(h)·h·√(g·h))`. La pendiente `S` es la del terreno junto al borde: se mide entre la celda del borde y la que está unos 6 m hacia adentro, porque el cauce o la calle siguen bajando fuera del sector. La pendiente declarada en el escenario solo se usa si el terreno no baja hacia el borde. El tope es el mismo límite de Froude de las caras interiores (Fr ≤ 1,5). Antes se usaba la pendiente declarada (3 % en la quebrada de la ladera, que baja casi 9 %) y un tope en régimen crítico. Por eso la creciente se represaba en los últimos 15 m: 2,0 m en el borde frente a 1,65 m aguas arriba (prueba F1). Los demás bordes son cerrados. |
| Entrada externa | Caudal constante, repartido en las celdas del borde indicado. Se registra como término propio. |

## 3. Balance de agua

El volumen de control es **todo el dominio del sector, incluidos los techos**. Términos acumulados [m³]:

```
P   precipitación (suelo + techos)        Qin  entrada externa y creciente     Ret  devuelto por la red a la calle o a la quebrada
ΔS  cambio del agua en superficie         I    infiltrado                       Dev  guardado en depósitos
D   entró a la red (sumideros, conexiones erradas, depósitos, remanso de la quebrada)
B   salida por los bordes
residuo = P + Qin + Ret − (ΔS + I + Dev + D + B)
```

La red tiene su propio balance:

```
E   aportes externos a la red (aguas residuales de las casas y de aguas arriba, infiltración,
    escorrentía y conexiones erradas de aguas arriba)
V   agua guardada en tuberías y cámaras     O   salida por los colectores fuera del sector
residuo de la red = D + E − (V + O + Ret)
```

El residuo se muestra tal como sale, sin ajustarlo. En las pruebas queda entre 10⁻¹⁶ y 10⁻¹² de P (ver `PRUEBAS.md`). El panel docente muestra cada término en vivo.

**Reparto «¿Adónde fue la lluvia?».** Al sumar los dos balances, `P + Qin + E = ΔS + I + Dev + B + (V + O)`. El panel reparte esa suma en cinco partes: sobre el suelo (ΔS), salió del sector (B), entró al suelo (I), depósitos (Dev) y alcantarillado (V + O: lo que sigue en la red o salió del sector por ella). El agua que la red devolvió a la calle o entregó a la quebrada se cuenta donde quedó. Así ninguna parte es negativa, aunque la red entregue a la quebrada más de lo que captó (porque recibe escorrentía de calles de arriba); antes se mostraba `D − Ret` y podía salir negativo. La prueba B1 lo comprueba.

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
- La lámina de agua de cada esquina es el promedio de la profundidad de las celdas conectadas que la comparten. Se dibuja **a escala 1:1**. «Agua ×5» engrosa solo las láminas delgadas: lámina dibujada = `h + (k − 1)·h₀·tanh(h/h₀)`, con `h₀ = 4 cm` (`drawDepth` en `palette.ts`). Una lámina de 1 cm se dibuja ×4,9, y a ninguna profundidad se agregan más de 16 cm. Así la superficie del agua honda sigue nivelada de orilla a orilla (prueba A1). Antes se multiplicaba toda la profundidad: una quebrada de 2 m se dibujaba con 10 m y su orilla, con 30 cm, con 1,5 m. Quedaba un lomo de agua por encima de las orillas, físicamente imposible. Un aviso visible indica que el dibujo está amplificado y cuánto, y que los números no cambian.
- Las flechas usan exactamente la velocidad del modelo en su celda (prueba V4). Las gotas trazadoras se mueven con la velocidad interpolada de las caras (RK2). Su captura o infiltración es probabilística con semilla fija, en proporción a lo calculado, y nunca alteran el volumen.
- Ningún efecto visual interviene en el cálculo. La sección 6.1 detalla qué dato controla cada uno.

### 6.1 Cómo se dibujan la lluvia y el agua

Los efectos leen el estado calculado en cada cuadro (`src/city/render/fxData.ts`, sin Three.js, y `src/city/render/stormFx.ts`). La prueba **V5** comprueba que leen exactamente lo calculado.

| Efecto | Qué lo controla | Qué es solo dibujo |
|---|---|---|
| **Color del agua** | Profundidad calculada de cada celda, con la misma escala de la leyenda. Entre celdas se interpola el color, no la altura. En la vista realista la escala es **de color natural**: lámina gris-café turbia, más oscura y opaca cuanto más profunda, con los mismos cortes (1 mm a 30 cm) y rótulos de la escala azul (prueba V9). El botón «Agua en azul» vuelve a la escala azul; las vistas «Materiales» y «Resultados» usan siempre la azul. | Los tonos de la escala natural. En la escala azul, la lámina de pocos milímetros se dibuja más transparente, para que se vea el suelo mojado debajo; desde 1 cm, la opacidad es la de la leyenda. |
| **Reflejos del agua** | Solo dónde hay agua (profundidad calculada mayor que ≈ 1 mm). El brillo crece en ángulo rasante (Fresnel), como en un charco real. | El entorno que se espeja: una captura de la propia escena (fachadas, calles y cielo) que se repite cuando el cielo de la tormenta se asienta, para que el agua y el pavimento espejen el cielo gris y no el soleado. |
| **Altura de la lámina** | Profundidad calculada, a escala 1:1. | Solo «Agua ×5» engrosa las láminas delgadas (máximo +16 cm, superficie nivelada), y lo avisa en pantalla. Los efectos nuevos no cambian la altura: solo el color y la normal de la superficie. |
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
| **Redes bajo la calle** | Lámina en cada tubería y nivel en cada cámara y caja, de los niveles calculados de la red. Una tubería en carga se dibuja en rojo. | Tamaño y aspecto de pozos y tubos (a escala real, con un mínimo visible), colores por sistema y acometidas. |
| **Rebose de cámaras y sumideros** | Volumen que la red devolvió a la calle en el último paso: la columna de agua crece con la raíz del caudal y la tapa se levanta. | Forma de la columna. |
| **Mira de la quebrada** | Nivel del agua calculado en la sección de control; la banda roja marca la cota de cauce lleno. | El poste y sus marcas. |
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

### 6.3 Red de alcantarillado separada (drenaje dual)

Los dos sectores tienen dos redes que no se tocan (`src/city/sim/sewer.ts`):
- **aguas lluvias**: sumidero → caja → conducto → cámaras → descarga a la quebrada (ladera) o al colector de aguas abajo (calle);
- **aguas residuales**: acometidas de las casas → cámaras → colector hacia el interceptor del río. Nunca descarga a la quebrada.

**Es una red didáctica.** Se trazó con criterios de la norma de diseño de EPM (*Normas de Diseño de Sistemas de Alcantarillado*, GD-AS002), pero no es la red de EPM ni un diseño de ingeniería. El trazado (`src/city/scenarios/sewerDesign.ts`) calcula las bateas de aguas arriba hacia aguas abajo y la prueba S4 revisa cada criterio:

| Criterio | Numeral de GD-AS002 | Cómo se aplica |
|---|---|---|
| Sistema separado | 2.3.1 | Ningún tramo une los dos sistemas; la compilación del escenario lo rechaza. |
| Ubicación en la vía | 3.4.2 | Aguas lluvias al norte y al oriente; aguas residuales al sur y al occidente, a un cuarto del ancho de la calzada desde el bordillo. |
| Separación vertical en cruces | 3.4.3 | ≥ 0,5 m libres. La red de aguas residuales va más profunda (2,42 m sobre la corona en la ladera, para cruzar bajo la descarga de aguas lluvias con 0,5 m libres). |
| Diámetro mínimo | 6.2.7 y 5.2.8 | ≥ 215 mm en aguas lluvias (se usan 300 a 525 mm); ≥ 170 mm en aguas residuales (se usan 200 mm). |
| Recubrimiento | 6.2.14 y 5.2.15 | ≥ 1,2 m sobre la corona en cámaras y cajas. |
| Velocidad máxima | 6.2.9 y 5.2.10 | ≤ 5 m/s en concreto y ≤ 10 m/s en PVC. Se diseñó a ≤ 4 m/s, el umbral sobre el cual la norma pide un análisis detallado. |
| Lámina y velocidad mínima con el caudal de diseño | 6.2.13, 6.2.8 y 5.2.14 | Aguas lluvias: ≤ 85 % del diámetro y ≥ 0,75 m/s. Aguas residuales: ≤ 70 %. |
| Cámaras de inspección | 8.3.1, 8.3.2 y 8.3.5 | En arranques, uniones y cambios de dirección. Máximo 4 tuberías y deflexión < 90° entre la entrada dominante y la salida (los giros se hacen con dos cámaras). Distancia ≤ 80 m con sumideros y ≤ 120 m sin ellos. Diámetro interno 1,2 m; tapa de 0,6 m. |
| Cámaras de caída | 8.4.1 | Donde la batea de entrada supera en más de 0,7 m a la de salida. Hay una en la ladera, en el arranque del colector de la calle. |
| Sumideros | 8.5.1 a 8.5.3 | Ubicados en puntos bajos (mixtos) y antes de los cruces peatonales. Rejillas en pendientes fuertes; la ventana pierde capacidad por encima de ≈ 3 %. Conductos de ≥ 250 mm, pendiente ≥ 2 % y longitud ≤ 15 m, hasta una cámara. |

**Caudales de diseño** (para el trazado, no para la simulación; `src/city/sim/sewerCheck.ts`):
- **Aguas lluvias.** Método racional `Q = C·i·A` con `C = 0,85·I + 0,15` (EPM 6.3). Se usa una intensidad de diseño **supuesta** de 100 mm/h: no es la curva IDF de EPM, que la norma pide para un periodo de retorno de 5 años en áreas menores de 10 ha. El área de cada sumidero se obtiene siguiendo la pendiente de la malla (D8), con los techos por su bajante.
- **Aguas residuales.** 3 personas por piso, dotación neta **supuesta** de 130 L/hab·día (la norma pide la demanda que entregue EPM), retorno 0,85 (5.2.3.1), mayoración 1,4 (el mínimo de 5.2.6), infiltración de 0,2 L/s·ha (5.2.3.6) y un mínimo de 1,5 L/s por tramo (5.2.7).
- **Escorrentía de aguas arriba.** El colector de aguas lluvias recibe la de 1,2 ha (calle) o 0,5 ha (ladera) de calles de arriba, con `C = 0,8` y sin retardo. Llega aguas residuales del barrio de arriba (2 L/s en la calle y 1,5 L/s en la ladera).

**Hidráulica de la red.**
- **Tuberías** circulares, con la aproximación inercial local y fricción de Manning semiimplícita. `n` = 0,013 en concreto y 0,010 en PVC.
  ```
  S  = (H_arriba − H_abajo) / L
  Q⁺ = (Q + g·A·dt·S) / (1 + g·dt·n²·|Q| / (A·R^(4/3)))
  ```
  `A` y `R` son los de la sección circular con la lámina en el extremo más alto. Llena, la tubería trabaja **a presión** con el área completa: está **en carga**.
- **Nodos.** Cámaras, cámaras de caída y cajas de sumidero guardan el agua. Su área es la del pozo más la mitad del espejo de agua de las tuberías que llegan; con eso se arma una tabla volumen–nivel.
- **Rebose.** Cuando el nivel de un nodo pasa la tapa (la rasante de su celda), el exceso sale a esa celda de la calle. En una caja de sumidero es el sumidero que **devuelve agua**.
- **Captación.** Un sumidero capta solo si su caja no está llena: así la red en carga no «traga» agua que de inmediato devuelve.
- **Descargas.** La libre (colector fuera del sector) entrega todo lo que llega. La descarga a la quebrada tiene el nivel del agua en su celda del cauce: si la quebrada sube por encima de la batea de salida, la descarga queda **ahogada** (remanso), la red no puede vaciarse y, si la quebrada está más alta que la red, entra agua de la quebrada.
- **Paso de tiempo.** La red avanza en sub-pasos dentro de cada paso de la superficie, limitados por la onda en cada tubería (`0,7·L/(√(g·A/T) + |V|)`) y por la oscilación nodo–tubería. Un limitador de positividad impide que un nodo entregue más agua de la que tiene.
- **Conexiones erradas** (intervención hipotética). Cuatro techos del sector (calle) o la hilera de casas del sur de la calle (ladera), más 8 000 m² (calle) o 3 500 m² (ladera) de techos aguas arriba, entregan su lluvia al alcantarillado de aguas residuales. Ese alcantarillado se llena, entra en carga y rebosa a la calle (prueba S5, misión «Conexiones erradas»).

**Lo que no hace.**
- No calcula pérdidas locales en las cámaras (numeral 8.3.6) ni la disipación en las caídas.
- La escorrentía de aguas arriba llega sin retardo.
- No hay tubería de acueducto ni otras redes.
- El rebose de aguas residuales se suma al agua de la calle sin seguir su calidad.

### 6.4 Creciente de la quebrada y capacidad de la sección

**El cauce.** La ladera tiene una quebrada en el fondo de su propio valle: la margen norte sube 3,5 % hacia el barrio y la sur, 3,5 % y luego 30 % (sección 6.5). El cauce mide 1,8 m de profundidad, con 3 m de fondo y orillas hasta 4,5 m del eje, y su retiro es una zona verde. Antes, el lado sur bajaba en dirección contraria a la quebrada y el agua desbordada se iba lejos del cauce; se corrigió para que la quebrada sea el punto más bajo.

**La sección de control** (x = 94 m, en el rellano, donde empiezan las casas de la orilla) se analiza en una columna de celdas del cálculo:
- **fondo:** la celda más baja;
- **orillas:** las primeras celdas fuera del cauce encajado;
- **cota de cauce lleno:** la orilla más baja;
- **capacidad:** la suma, celda por celda, del caudal unitario con la misma regla de las caras del modelo, `q = min(h^(5/3)·√S/n; 1,5·h·√(g·h))`, con la pendiente local del fondo.

Resultado: **51 m³/s**, a 1,96 m del fondo con 1,7 % de pendiente. La prueba C1 lo contrasta con el modelo en una subida lenta, casi permanente:
- con el 80 % de la capacidad no pasa agua por fuera del cauce y el nivel queda bajo la orilla;
- con el 125 % sí pasa agua por fuera y el nivel supera la orilla.

**Lo que se mide en la sección,** del estado calculado:
- el caudal que la cruza dentro del cauce y por fuera (desborde), promediado en cada intervalo de muestreo de 10 s (en un cauce empinado el caudal instantáneo de una sola fila de caras oscila de un paso al siguiente);
- el nivel en el talweg.

El panel dibuja la sección transversal en vivo y el hidrograma, con la línea de capacidad.

**Interacción con la red.** Con el doble de la capacidad, la quebrada sube por encima de la descarga de aguas lluvias. Entonces:
- la red queda en carga hasta la carrera sur;
- entra agua de la quebrada a la red;
- sale agua por la cámara LL-S1 y por el sumidero de la carrera sur (prueba S6).

**Lo que no es.**
- No es un caudal medido ni un pronóstico.
- El límite de Froude del modelo (sección 1) subestima la capacidad en tramos muy empinados (10 %): la creciente va más honda y lenta que en la realidad (prueba F1). En la sección de control, con 1,7 % de pendiente, el límite no actúa: la capacidad es la misma con o sin él.

### 6.5 Creciente dañina: casas en la orilla, lodo, peligro y daños

**Exposición (sector demostrativo).** Cuatro casas de 1 y 2 pisos están construidas a ras de la orilla norte, dentro del retiro, desde la sección de control hacia aguas abajo: su frente queda a 5,2 m del eje (0,7 m de la orilla) y a la misma cota de la orilla. La sección de control pasa por la primera. La margen sur es un talud boscoso: sube 3,5 % en los primeros 8 m y luego 30 %, de modo que el agua desbordada no se pierde contra el borde del dominio. Hay un puente peatonal aguas arriba y tres vehículos estacionados (un carro y una moto frente a las casas, un taxi al final de la carrera sur). Las casas tienen acometida a una cámara nueva (AR-Q1) del colector de aguas residuales paralelo a la quebrada; las dos redes siguen cumpliendo los 15 criterios revisados (prueba S4).

**Crecientes de ejemplo** (fracción de la capacidad de la sección, 50 m³/s): cabe en el cauce (60 %), cauce lleno (100 %), se desborda (150 %), inundación grave (250 %) y avenida torrencial (350 % que sube en 3 min, con 30 % de lodo). El pico se ajusta hasta 4 veces la capacidad.

**Lodo.** Con una concentración de sedimentos en volumen `Cv`, la mezcla ocupa `1/(1 − Cv)` veces el volumen del agua (factor de volumen): el hidrograma de la mezcla es el del agua multiplicado por ese factor y su volumen entra completo (prueba H4). Por debajo de ≈ 20 % es una creciente de agua con sedimentos; entre 20 % y 35 %, una inundación de lodo (O'Brien, 1986). El modelo **mueve la mezcla como agua**: no simula su viscosidad ni su resistencia, la erosión del cauce ni el golpe de piedras y troncos, que en una avenida real aumentan el daño. Por eso el control se limita a 30 %.

**Peligro (H1–H6).** En cada paso, para cada celda con 1 cm o más, se clasifica la profundidad `D` y la velocidad `V` con las curvas combinadas de vulnerabilidad de la guía técnica australiana (*Australian Disaster Resilience Guideline 7-3, Flood Hazard*, AIDR 2014; curvas de Smith et al., 2014) y se guarda la clase máxima:

| Clase | D máx. | V máx. | D·V máx. | Descripción de la guía |
|---|---|---|---|---|
| H1 | 0,3 m | 2 m/s | 0,3 m²/s | En general seguro para vehículos, personas y edificaciones. |
| H2 | 0,5 m | 2 m/s | 0,6 m²/s | Inseguro para vehículos pequeños. |
| H3 | 1,2 m | 2 m/s | 0,6 m²/s | Inseguro para vehículos, niños y personas mayores. |
| H4 | 2 m | 2 m/s | 1,0 m²/s | Inseguro para vehículos y personas. |
| H5 | 4 m | 4 m/s | 4,0 m²/s | Además, toda edificación expuesta a daño estructural; las menos robustas pueden fallar. |
| H6 | — | — | > 4,0 m²/s | Además, cualquier edificación puede fallar. |

La velocidad de celda es el promedio de los caudales de sus caras dividido por su profundidad, **limitado con el mismo número de Froude del cálculo** (1,5): en el frente de mojado la celda es muy somera y ese promedio daba velocidades espurias (hasta 75 m/s); con el límite, la velocidad máxima de una avenida en la ladera queda en 7 a 9 m/s. La clasificación es una **referencia técnica publicada para enseñar** cómo se combinan profundidad y velocidad; no es la zonificación oficial de amenaza de Medellín, que define el POT con estudios de detalle (prueba H1).

**Daños.** Una edificación está **afectada** si junto a sus muros (las celdas libres vecinas) el agua llega a 10 cm o más; su peligro es el máximo de esas celdas (prueba H2). Con H5 o más queda **expuesta a daño estructural**. Las casas son sólidas en el cálculo: el agua no entra, de modo que la profundidad contra la fachada indica hasta dónde llegaría adentro si hubiera aberturas. No hay modelo estructural.

**Vehículos.** Su posición se calcula en el motor (es reproducible). Quedan quietos mientras el peligro donde están sea menor que H2; desde H2 el agua los mueve con el 80 % de su velocidad; no entran a celdas de edificios y se detienen donde el peligro vuelve a bajar o salen del sector (prueba H3). No alteran el flujo y su trayectoria es ilustrativa: un vehículo real rueda, gira y se atasca de otras formas.

**Resultados en la ladera** (corridas de verificación con lluvia de 60 mm/h durante 20 min y 30 min simulados; la creciente sube en 6 min salvo la avenida; máximos hasta el final; con la cobertura de la carrera libre, sección 6.6):

| Creciente | Nivel en la sección | Edificaciones con agua | Con H5 o más | En la orilla | Vehículos movidos | Cobertura: por los cajones / sobre la vía |
|---|---|---|---|---|---|---|
| 60 % | bajo la orilla | 0 | 0 | sin agua | 0 | 30 / 0 m³/s |
| 150 % | +0,3 m | 6 | 2 | 0,65 a 0,87 m (H4 y H5) | 3 | 50 / 23 m³/s |
| 250 % | +0,8 m | 10 | 8 | 0,98 a 1,33 m (H5) | 3 | 51 / 63 m³/s |
| 350 % con 30 % de lodo, sube en 3 min | +1,5 m | 23 | 18 | 1,76 a 1,96 m (H5) | 3 | 52 / 135 m³/s |

Desde 150 % la creciente supera la capacidad de la cobertura: parte del agua cruza la carrera por encima de la vía antes de llegar a la sección y a las casas de la orilla.

**Cómo se dibuja** (`src/city/render/floodView.ts`), siempre a partir del cálculo:
- **marcas en las fachadas:** cada cara de muro se mancha desde el suelo hasta la profundidad máxima de la celda vecina, con una línea oscura en el borde (sin amplificar);
- **salpicadura contra los muros:** solo donde el agua corre hacia el muro a más de 1,2 m/s, y sube hasta la carga de velocidad `v²/2g`;
- **oleaje y espuma:** en el agua honda y rápida, la normal del agua se agita y aparece espuma que avanza con la velocidad calculada; la altura de la lámina no cambia;
- **color del lodo:** el agua honda se tiñe de café según la concentración de lodo;
- **vehículos:** forma y flotación visual sobre la posición calculada;
- **material flotante** (troncos, ramas y basura): **ilustrativo**; entra con la creciente, más cuanto mayor el caudal y el lodo, se mueve con la velocidad calculada y queda depositado donde el agua se vuelve somera o lenta o contra un muro;
- **puente peatonal:** en el cálculo no obstruye el agua; su rótulo compara el nivel calculado bajo el tablero con su viga y su tablero («libre», «el agua golpea la viga», «el agua pasa sobre el tablero»);
- **rótulos de daño:** hasta cinco edificaciones, las de mayor peligro y profundidad, con su clase y la profundidad contra la fachada;
- **vista «Peligro»:** colorea el agua máxima con la clase máxima de cada celda (la misma paleta del panel y de la leyenda).

### 6.6 Cobertura bajo la carrera (alcantarilla de cajón)

**Geometría (didáctica).** En la ladera, la carrera cruza la quebrada sobre un terraplén entre x = 84 y 91 m. El agua pasa por una cobertura de **triple cajón de 3,0 × 2,3 m** (9 m de luz hidráulica, tabiques de 0,3 m), con 0,25 m de relleno; la vía queda 2,55 m sobre el fondo. En los 2,5 m a cada lado del terraplén el fondo del cauce se ensancha hasta el ancho de los cajones (transiciones de entrada y salida). Concreto `n = 0,014`; aletas a 45°, `Ke = 0,4`. No es una obra real de Medellín.

**Hidráulica** (`src/city/sim/culvert.ts`), según la guía de alcantarillas de la FHWA (HDS-5, 3.ª ed., 2012, apéndice A):

| Control | Ecuación | Coeficientes (cajón de concreto, aletas de 30° a 75°) |
|---|---|---|
| Entrada, no sumergida (`Ku·Q/(A·D^0,5) ≤ 3,5`) | `HW/D = Hc/D + K·(Ku·Q/(A·D^0,5))^M + Ks·S`, con `Hc = 1,5·dc` | `K = 0,026`, `M = 1,0`, `Ks = −0,5`, `Ku = 1,811` (SI) |
| Entrada, sumergida (`≥ 4,0`) | `HW/D = c·(Ku·Q/(A·D^0,5))² + Y + Ks·S` | `c = 0,0347`, `Y = 0,81`; entre 3,5 y 4,0 se interpola |
| Salida (cañón lleno) | `HW = h₀ + (1 + Ke + 2g·n²·L/R^(4/3))·V²/2g`, `h₀ = máx(nivel aguas abajo, (dc + D)/2)` | `Ke = 0,4` |

Para los niveles de cada lado pasa el **menor** de los dos caudales. Con el agua a la cota de la vía caben **48,8 m³/s** (capacidad libre). Simplificación: cuando el cañón va parcialmente lleno no se calcula el remanso en su interior; se usa la aproximación `(dc + D)/2` de la misma guía.

**Acople con el cálculo 2D** (`stepCulverts` en `engine.ts`). La cobertura une 9 celdas de entrada (x = 83,5 m) con 9 de salida (x = 92,5 m). El nivel de cada lado es el de su celda más honda (el espejo del cauce). El enlace es **implícito**: el caudal se evalúa con los niveles que quedan al final del paso, por bisección. Además tiene la **inercia del agua en los cajones**, con constante `τ = 2L/((1 + Ke + kf)·V)`. Nunca cambia de sentido dentro de un paso ni sobrepasa el caudal que igualaría los dos niveles. Con un enlace explícito, celdas de poca área y un cajón de gran capacidad, el caudal oscilaba entre pasos e invertía el sentido. Con el enlace implícito y la inercia, en las corridas de prueba no hay inversiones ni alternancias (prueba K2). El volumen se saca de la entrada en proporción a la profundidad y se entrega llenando primero las celdas más bajas de la salida. Es una transferencia interna: el balance cierra con residuo menor que 10⁻¹³. El agua que no cabe sube y pasa **por encima de la vía** con el cálculo 2D; se mide en el borde aguas abajo del terraplén.

**Obstrucción.** Los troncos y ramas atascados en la entrada se representan como una reducción del ancho útil de los cajones. Hay cuatro opciones: libre, tapada 50 %, tapada 90 % y **se tapa con la creciente**. En la última, la entrada empieza libre. Cuando el caudal pasa de la mitad de la capacidad libre, la obstrucción crece linealmente hasta 90 % en 3 minutos (prueba K4). Es una intervención hipotética.

**Resultados en la ladera** (creciente que sube en 8 min sobre la lluvia del escenario; pruebas K2 y K3):

| Caso | Por los cajones (máx.) | Nivel en la entrada respecto de la vía | Sobre la vía (máx.) | Edificaciones con agua | Vehículos movidos |
|---|---|---|---|---|---|
| 60 % de la capacidad del cauce, entrada libre | 30,2 m³/s | −0,22 m | 0 | 0 | 0 |
| 60 %, tapada 90 % | 6,8 m³/s | +0,80 m | 22,5 m³/s (12 004 m³) | 6 (2 con H5 o más) | 2 |
| 100 %, se tapa con la creciente | 30,3 m³/s antes de taparse | +1,06 m | 39,6 m³/s | 7 (3 con H5 o más) | 2 |

**Cómo se dibuja** (`floodView.ts`): muros de cabecera con las tres bocas, tabiques, aletas a 45° y baranda abierta (en el cálculo no detiene el agua). Los troncos atascados en la entrada son tantos como pide la obstrucción calculada en cada momento. Con agua flotan a una profundidad fija bajo el nivel calculado en la entrada y, si el agua pasa sobre la vía, quedan contra la baranda. El rótulo muestra el caudal calculado por los cajones, el que pasa sobre la vía y el porcentaje tapado. En el mapa 2D, los cajones son líneas discontinuas bajo la vía y la obstrucción es una franja marrón en la entrada.

### 6.7 Creciente desde la lluvia en la cuenca y aviso temprano

En la herramienta «Creciente» se puede elegir el **origen de la creciente**: el hidrograma de ejemplo (secciones 6.4 y 6.5) o la **lluvia en la cuenca**. En el segundo caso, la misma lluvia configurada para el barrio cae sobre una cuenca didáctica aguas arriba del sector: 4 km², longitud hidráulica de 3,5 km y pendiente media de 20 %. El caudal que llega al sector se calcula con los métodos del NRCS (*National Engineering Handbook*, parte 630) en `src/city/sim/basin.ts`:

| Paso | Ecuación | Notas |
|---|---|---|
| Escorrentía (cap. 10) | `Q = (P − Ia)² / (P − Ia + S)` si `P > Ia`; `S = 25 400/CN − 254` mm; `Ia = 0,2·S` | CN: bosque 70, mixta 80, urbanizada 90 (TR-55, suelos del grupo C). Con suelo húmedo, `CN_III = 23·CN/(10 + 0,13·CN)` |
| Retardo (cap. 15) | `tL = ℓ^0,8·(S′ + 1)^0,7 / (1900·Y^0,5)` h | `ℓ` en pies, `S′ = 1000/CN − 10` pulgadas, `Y` en % |
| Hidrograma unitario (cap. 16) | `tp = Δt/2 + tL`; `qp = 0,208·A·Q/tp`; base `2,67·tp` | triangular; `Δt` = 1 min; convolución con la escorrentía de cada minuto |

El hidrograma se calcula cada minuto y entra completo por la quebrada (prueba W2); el lodo lo multiplica por `1/(1 − Cv)` como en el hidrograma de ejemplo. La cobertura de la cuenca es una intervención: A y B pueden tener cuencas distintas con la misma lluvia.

**Aviso temprano.** Una estación de nivel a 2,5 km aguas arriba ve el mismo hidrograma adelantado el tiempo de viaje de la onda (4 m/s: 10 min; sin atenuación). Los umbrales son **didácticos**: aviso por lluvia con 20 mm o más en 30 minutos; alerta amarilla, naranja y roja cuando el caudal en la estación llega a 40 %, 70 % y 100 % de la capacidad del cauce en el sector. El motor registra el primer momento en que el agua llega a 10 cm junto a cada edificación a 20 m o menos del eje de la quebrada (las demás se pueden mojar por la lluvia del barrio sin que crezca la quebrada); el **tiempo de aviso** es el que pasa entre una alerta y ese momento. Al elegir un aguacero, la simulación dura hasta media hora después del pico calculado en el barrio (entre 110 y 240 min). En el Valle de Aburrá funciona un sistema de alerta temprana real, con sus propias estaciones y umbrales; este ejercicio no usa sus datos.

**Resultados con 80 mm en una hora y suelo seco** (pruebas W1 y W2; 110 min simulados):

| Cuenca | CN | Escorrentía | Retardo | Pico en el barrio | Alertas (min) | Agua en la primera casa | Edificaciones con agua |
|---|---|---|---|---|---|---|---|
| Bosque | 70 | 20 mm (25 %) | 40 min | 21 m³/s en el minuto 90 | lluvia 15; amarilla 71 | no llega | 0 |
| Mixta | 80 | 35 mm (43 %) | 30 min | 42 m³/s en el minuto 77 | lluvia 15; amarilla 40; naranja 54 | no calculado | no calculado |
| Urbanizada | 90 | 54 mm (67 %) | 21 min | 72 m³/s en el minuto 65 | lluvia 15; amarilla 19; naranja 27; roja 35 | minuto 40 (5 min después de la alerta roja) | 6 |

La fila «Mixta» viene solo del hidrograma y de los umbrales; no se corrió en el sector, de modo que no tiene resultados de casas.

### 6.8 Sectores con datos oficiales: sección de control, cuenca y laderas

Los tres sectores reales (`docs/medellin/DATOS_REALES.md`) usan el mismo motor con cuatro piezas propias:

- **Sección de control orientada con el cauce.** Si el escenario no lo declara (`section.flowAxis`), el compilador toma la dirección del eje en el punto de la sección: si va más en x, la sección es una columna de la malla; si va más en y, una fila. Guarda el sentido del flujo (`sign`) y el coseno del ángulo entre el cauce y la malla (`cosT`; si el ángulo es menor de ≈ 6° se toma 1, porque la corrección sería menor de 0,5 %). El caudal medido es el de la cara de aguas abajo de cada celda, positivo en el sentido del cauce; la capacidad se multiplica por `cosT` (la línea de la malla es `1/cosT` más larga que el ancho del cauce) y la pendiente se mide sobre el eje.
- **Cauce lleno estimado.** Con `section.bankDepthM` el talweg es la celda más baja a ±2 celdas del punto, el cauce lleno queda a esa profundidad y las orillas son, a cada lado, la primera celda que alcanza ese nivel o una construcción. Así la capacidad corresponde al terreno de la malla de cálculo (prueba D2).
- **Laderas vecinas.** Cada entrada con `rainAreaM2` aporta `C·i·A` mientras llueve (i, la intensidad del momento). Sus celdas no son salidas, están comunicadas con el resto del barrio (componente libre de 200 m² o más) y el terreno baja hacia adentro; se cuentan aparte en el balance (`runonIn`) y como entrada.
- **Relleno final de depresiones** sobre la malla ya rasterizada, desde las salidas (sección 0 de DATOS_REALES.md).

**Aviso temprano en los sectores reales.** La cuenca es la delineada sobre el modelo de elevación; la estación queda a la mitad de la longitud hidráulica. En La Iguaná (42,7 km², retardo de 60 min) la creciente llega más de una hora después de la lluvia del barrio; en Juan Bobo (0,13 km², retardo de 8 min) la creciente es pequeña y lo que moja las casas es la lluvia del barrio.

### 6.9 Cómo se dibujan los sectores reales (maqueta)

El cálculo no cambia: estas reglas son solo del dibujo.

- **Terreno continuo.** El terreno se dibuja interpolando, en cada esquina de celda, las cotas de las celdas vecinas «conectadas». En los sectores didácticos se conectan las que difieren menos de 0,35 m (los bordillos, lotes y muros quedan como escalones). En los sectores reales, cuyo terreno viene de un modelo de elevación de 1 m sobre laderas empinadas, se conectan las que difieren menos de 1,7 m (2,5 m en diagonal, ≈ 60°): antes cada celda era un bloque y la ladera se veía como una escalera, con rayas oscuras en cada escalón. Los saltos mayores (muros y taludes cortados) quedan como caras verticales en tono de tierra y concreto, no con la foto aérea estirada. En los taludes muy empinados la foto se suaviza y se mezcla con tierra.
- **Lámina de agua.** Sigue la misma superficie: en cada esquina, terreno interpolado más el promedio de la profundidad calculada de las celdas conectadas. No se exagera: la amplificación ×5 sigue siendo opcional y avisada, y solo engrosa las láminas delgadas.
- **Maqueta.** El sector se dibuja como un bloque de terreno recortado: el corte muestra capas de suelo según la profundidad (capa vegetal, suelo, suelo residual rojizo y roca meteorizada; ilustrativas). El entorno (que es solo dibujo) se vuelve volúmenes blancos y relieve claro con curvas de nivel cada 10 m, sin tanques, carros, varillas ni colores de fachada, y queda 2,6 m más bajo, con una franja de 14 m sin casas alrededor del bloque. Así lo real (el sector) no compite con lo ilustrativo.
- **Sin negocios inventados.** En los sectores reales las fachadas no llevan locales con nombre (tienda, panadería, droguería…): solo puertas, garajes y ventanas.
- **Agua en azul por defecto.** Sobre la foto aérea el agua turbia casi no se distingue del suelo; los sectores reales empiezan con la escala azul (se cambia en «Capas»). En esa escala, la película de 1 a 5 mm que cubre la ladera durante la lluvia se tiñe apenas (opacidad 0,16 a 0,42) y el azul fuerte queda donde el agua se junta y corre.
- **Flechas.** Solo donde la lámina tiene 6 mm o más y la velocidad 0,1 m/s o más, cada ≈ 3 m, con un contorno oscuro que las hace legibles sobre agua clara, foto o concreto.
- **Controles.** Las cuatro vistas (realista, materiales, resultados, peligro) están en una fila arriba a la derecha; las capas (etiquetas, foto aérea, flechas, agua en azul, agua ×5, bajo la calle), en una lista que se abre con «Capas»; la cámara, en una columna de íconos en el borde derecho (en pantallas angostas, una fila abajo y las vistas en una lista desplegable).

### 6.10 Tormentas de diseño, aguaceros reales y clima

**Curva IDF.** IDEAM, estación A. Olaya Herrera (Medellín), datos de 1971 a 2010 (40 años), distribución de Gumbel con parámetros por L-momentos, actualizada en diciembre de 2016. Los parámetros y la tabla de intensidades se tomaron del *Documento Técnico de Soporte* DTS 2022 (versión 2) de la Alcaldía de Medellín, numeral 2.2.5, que reproduce la ficha del IDEAM (`src/city/sim/storms.ts`).

| T (años) | C1 | X0 | C2 |
|---|---|---|---|
| 2 | 4 084,019 | 25,519 | 1,068 |
| 3 | 5 374,593 | 27,721 | 1,099 |
| 5 | 7 004,684 | 29,802 | 1,127 |
| 10 | 9 316,661 | 31,987 | 1,157 |
| 25 | 12 611,921 | 34,232 | 1,187 |
| 50 | 15 294,065 | 35,616 | 1,205 |
| 100 | 18 132,770 | 36,805 | 1,221 |

`I = C1 / (D + X0)^C2` [mm/h], con D en minutos. La ecuación reproduce la tabla impresa de la ficha con error menor de 3 % hasta 1 h y las intensidades de 5 min exactamente (prueba L1). Como `C2 > 1`, la lámina de la ecuación deja de crecer en duraciones largas (para 100 años, después de unos 167 min), lo que no es físico; por eso, de 1 a 6 h el laboratorio sigue la forma de la tabla impresa (interpolación logarítmica entre 60, 120 y 360 min), unida a la ecuación en 60 min. Ejemplos: 10 años y 1 h, 49,8 mm; 100 años y 6 h, 83,7 mm.

**Hietograma de diseño.** Método de los bloques alternos (Chow, Maidment y Mays, 1988), con bloques de 5 min hasta 2 h y de 10 min para 3 y 6 h: el bloque mayor va en el centro y los siguientes alternan a la derecha y a la izquierda, de modo que cada ventana centrada de k bloques tiene la lámina de la curva para k·Δt (prueba L2). Periodos de retorno: 2, 5, 10, 25, 50 y 100 años; duraciones: 30 min, 1, 2, 3 y 6 h. Es la forma de lluvia con que se diseñan obras; no es un pronóstico.

**Aguacero reconstruido.** 28 de enero de 2026, ladera suroriental de Medellín (El Poblado): cerca de 87 mm en 44 minutos según el SIATA, citado por la prensa (El Colombiano, Minuto30, Pulzo), más que el promedio de todo enero (85 mm), y un pico que el alcalde describió como «más de 180 milímetros»; como el total fue 87 mm, se interpreta como una intensidad de 180 mm/h. La forma minuto a minuto es **supuesta** (subida rápida, pico al primer tercio y cola) y se ajusta para que el total y el pico sean los reportados (prueba L3). Ese total supera la lluvia de 100 años de la curva de Olaya Herrera para 44 min (62 mm), aunque la estación está en otro lugar del valle.

**Clima.** El nivel de calentamiento global se elige entre el de hoy (cerca de 1,1 °C sobre 1850–1900) y 1,5, 2, 3 y 4 °C. Toda la lluvia se multiplica por `1,07^(nivel − 1,1)`: el IPCC (AR6, Grupo I) estima que los aguaceros extremos diarios se intensifican cerca de 7 % por cada grado de calentamiento global (prueba L4). Es una aproximación global; para aguaceros de minutos el aumento puede ser mayor. En la cuenca del río Medellín, Grajales-Cardona y Carvajal-Serna (2019) encontraron que las curvas IDF estacionarias pueden subestimar los extremos hasta en 39 %.

**Lluvias largas.** La lluvia inventada dura hasta 6 h y se simulan hasta 8 h; la velocidad llega a ×480. Con celdas de 1 m una lluvia de 3 h tarda varios minutos de cálculo; el panel propone celdas de 2 m (unas ocho veces más rápido). La prueba L5 corre una tormenta de 10 años y 3 h en la ladera con celdas de 2 m: la lluvia que entra es la del hietograma y el balance cierra.

### 6.11 Transporte de sedimentos (tierra y lodo)

`src/city/sim/sediment.ts`. Una sola clase de grano (D50 = 60 µm, limo grueso; densidad 2 650 kg/m³). En cada celda se guardan la masa suspendida por área `m` [kg/m²] (concentración `C = m/h`), el material suelto sobre la superficie (mugre de calles y lodo depositado) y la tierra erosionable que queda.

| Pieza | Regla | Fuente |
|---|---|---|
| Transporte | La masa se mueve con los mismos caudales de cara del cálculo del agua, tomada aguas arriba con la lámina antes de la continuidad. Como el limitador de positividad ya acota el agua que sale de una celda, nunca sale más tierra de la que hay. Las caras de salida sacan lodo del sector; los sumideros se llevan la fracción del lodo igual a la fracción del agua que captan; las coberturas lo trasladan con el agua. | Esquema conservativo, aguas arriba |
| Capacidad de transporte | `TC = 2650·c·(100·V·S − 0,4)^d` [kg/m³], con `c = ((D50+5)/0,32)^−0,6` y `d = ((D50+5)/300)^0,25` (D50 en µm), V la velocidad de la celda y S el seno de la pendiente del terreno; máximo 848 kg/m³ (32 % en volumen). | Govers (1990), como en LISEM (De Roo, Wesseling y Jetten, 1996) |
| Arranque por el agua | Si `C < TC`: `Y·(TC − C)·Vs` [kg/m²·s], con `Y = 1/(0,89 + 0,56·Coh)` según la cohesión. El material suelto tiene `Y = 1`. Nunca supera lo que falta para llegar a TC. | Rauws y Govers (1988); LISEM |
| Depósito | Si `C > TC`: `(C − TC)·(1 − exp(−Δt·Vs·(1 − Cv)^4,65/h))·h` [kg/m²]. Con menos de 0,1 mm de agua, todo lo suspendido se deposita. | LISEM; Richardson y Zaki (1954) |
| Velocidad de caída | Ferguson y Church (2004): 2,97 mm/s para 60 µm. | Ferguson y Church (2004) |
| Salpicadura | `Di = Ki·I²·Sf·Ce`, `Sf = 1,05 − 0,85·exp(−4·sen θ)`, `Ki = 2·10⁶ kg·s/m⁴` (tierra suelta), con el factor `Ce` de la cobertura. | Forma de WEPP para entresurcos (Liebenow et al., 1990) |
| Coberturas | **Tierra suelta (obra)**: 15 kg/m² disponibles (≈ 1 cm), cohesión 8 kPa, `Ce` = 1. **Pasto** y **zona verde**: el agua que corre no arranca tierra (raíces y hojarasca, simplificación); salpicadura del 5 % y del 3 %. **Calles, andenes, concreto, cancha, pavimento permeable**: no se erosionan; tienen 20 g/m² de mugre suelta al empezar (Sartor y Boyd, 1972: decenas de g/m²). El cauce no se erosiona. | Estimados |
| Creciente con lodo | La creciente trae `Cv·2 650` kg/m³ (Cv de 0 a 30 %); donde el agua se sale y se frena, el lodo se deposita. | — |

**Balance.** Mugre inicial + tierra arrancada + lodo de la creciente = suspendido + suelto o depositado + lo que entró a los sumideros + lo que salió del sector (residuo del orden de 10⁻¹⁵ por kg; prueba T3).

**Dibujo.** El agua toma color café según la concentración calculada (desde unos 2 kg/m³; café espeso hacia 120 kg/m³). El lodo depositado cubre el suelo desde 0,3 kg/m² (≈ 0,2 mm) y se ve como una capa uniforme desde 15 kg/m² (≈ 1 cm). En la vista de resultados se dibujan la concentración y el depósito máximos. La capa «Lodo» los apaga. Los árboles de un lote convertido en tierra suelta se quitan del dibujo.

**Simplificaciones.** El lodo no cambia el volumen ni la fricción del agua ni la cota del terreno; el agua que vuelve de la red sale limpia; las laderas vecinas y la entrada externa aportan agua limpia; una sola clase de grano. Los valores no están calibrados para los suelos de Medellín: sirven para comparar (lote en obra frente a parque, creciente con o sin lodo), no para estimar cantidades reales.

### 6.12 Planificador con presupuesto

`src/city/content/planner.ts` y `src/city/ui/PlanTool.tsx`. El estudiante elige obras con 100 puntos y las prueba con una tormenta de diseño (curva IDF de Olaya Herrera; 2, 10, 25 o 100 años; 30 min, 1 h o 2 h; con el clima elegido). Se corren A (el barrio como está) y B (con el plan) con la misma lluvia, celdas de 2 m y, si el sector tiene cuenca, la creciente calculada desde la misma lluvia; el tiempo simulado alcanza para que pase el pico de la quebrada en A y en B.

| Obra | Dónde | Cómo entra al cálculo | Puntos |
|---|---|---|---|
| Limpiar los sumideros | sectores con sumideros | obstrucción 0 | 4 por sumidero (máximo 30) |
| Jardines, depósitos y zonas del sector | ladera y calle de prueba | los mismos de las herramientas | los del sector |
| Tanques de lluvia en 10 techos grandes | sectores reales | 10 tanques de 2 m³ que guardan la lluvia del techo (no están en los datos oficiales: son una intervención) | 30 |
| Patios y antejardines verdes (10 % o 20 %) | todos | esa fracción del suelo abierto de concreto (fuera de construcciones y zonas) pasa a pasto, en un orden fijo repartido por el sector | 20 o 40 |
| Reforestar la cuenca | sectores con cuenca | cuenca de bosque en vez de mixta | 50 |

**Puntos.** No son pesos. Su relación sigue, donde existe, la calificación cualitativa de costos de capital de la *Guía técnica de diseño y construcción de SUDS* de Bogotá (Secretaría Distrital de Ambiente y Universidad de los Andes, 2016): cunetas verdes, BAJO; tanques de almacenamiento y zonas de bioretención, MEDIO. No reemplazan un presupuesto de obra.

**Indicadores** (A y B): área con 5 cm de agua o más; área con peligro H3 o más; edificaciones con 10 cm o más; agua que entró al suelo o se guardó; caudal pico que sale; tierra que se llevó el agua; pico de la quebrada. Se marca «mejor» o «peor» si cambia más de 2 %. Prueba P1.

### 6.13 Tormenta viva: sonido, rayos, cine y video

Nada de esta sección cambia el cálculo; todo sigue al cálculo o es ilustrativo, y así se dice en la interfaz y en el video.

- **Sonido** (`src/city/audio.ts`, botón de la cámara o «Sonido» en Ajustes). Se sintetiza en el navegador, sin archivos. La lluvia suena según la intensidad que el modelo aplica en ese momento (volumen ∝ √(I/120 mm/h), con tope en 1). El agua que corre suena según el caudal calculado: el que pasa por la sección de la quebrada (tope en 60 m³/s) o, si no hay quebrada, el que sale por los bordes más el que captan los sumideros (tope en 1 m³/s), con nivel ∝ √(Q/Q_tope) (`flowLevel` en `controller.ts`). El trueno de cada rayo llega con el retraso del sonido, d/343 m/s.
- **Rayos y techo de nubes** (`src/city/render/lightning.ts`, solo en la vista realista). Son **ilustrativos**: el modelo no calcula la electricidad de la tormenta. Su frecuencia sigue la lluvia calculada: no hay rayos por debajo de 35 mm/h; arriba, (I − 35)/12 por minuto, con tope en 8 por minuto, y nunca dos con menos de 4 s entre sí. Caen a 0,7–4 km del sector. Cada rayo es un solo destello que se apaga (sin parpadeo), con un brillo de la escena de 0,7 como máximo; eso queda muy por debajo del límite de tres destellos por segundo de las pautas de accesibilidad (WCAG 2.3.1). Con «movimiento reducido» no hay rayos ni destellos. El techo de nubes aparece con el aguacero, a 650 m sobre el sector, y se pierde en la bruma; donde corta las montañas, las cumbres quedan dentro de la nube.
- **Cine** (`src/city/render/cinema.ts`). Cinco tomas que se repiten: sobre el barrio, en la calle, donde más agua hay (la celda con mayor profundidad calculada en ese momento, fuera de las construcciones), subiendo (grúa vertical desde la calle) y el valle. La cámara de calle va a 1,6 m del suelo y la grúa sube en vertical, de modo que ninguna toma atraviesa casas ni terreno (prueba E2). Se detiene en cuanto la persona mueve la cámara o usa un botón de cámara. No se ofrece con movimiento reducido.
- **Video** (`src/city/recorder.ts`). Si el navegador puede grabar (MediaRecorder y `captureStream`), el botón rojo graba hasta 60 s de la maqueta, con el sonido si está encendido. Cada cuadro lleva un rótulo fijo: sector, lluvia elegida, intensidad calculada en ese momento, tiempo simulado, toma del cine, la amplificación de la profundidad si está activa y la aclaración «cálculo hecho en el navegador, no es un pronóstico oficial · rayos y truenos ilustrativos». El video se descarga en el equipo (WebM o MP4, según el navegador); no se sube a ningún lado. Las etiquetas HTML de la maqueta no salen en el video; el rótulo las reemplaza.

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
- El método no conserva el momento de forma completa, y por eso el flujo supercrítico es menos preciso. En la quebrada de 10 % de la ladera, con el límite Fr ≤ 1,5, la creciente va ≈ 48 % más honda que su profundidad normal de Manning (prueba F1).
- No hay redistribución en el suelo durante el evento.
- No hay evaporación durante el evento.
- La red no se resuelve hidráulicamente.
- Las bajantes no almacenan agua.
- No hay puentes ni túneles en los escenarios incluidos. Si un escenario con datos reales los tuviera, deben excluirse o tratarse aparte, y el pipeline no los genera.
- Los sectores son pequeños: hasta 600 m por lado.

## 10. Referencias

- USDA NRCS (2004–2010). *National Engineering Handbook*, parte 630, *Hydrology*: capítulo 10 (escorrentía por número de curva), capítulo 15 (tiempo de concentración y ecuación del retardo) y capítulo 16 (hidrogramas). USDA NRCS (1986). *Urban Hydrology for Small Watersheds* (TR-55), tabla 2-2 (números de curva).
- Schall, J. D., Thompson, P. L., Zerges, S. M., Kilgore, R. T. y Morris, J. L. (2012). *Hydraulic Design of Highway Culverts*, Hydraulic Design Series No. 5 (HDS-5), 3.ª ed. FHWA-HIF-12-026. Federal Highway Administration. Apéndice A (ecuaciones de control de entrada y tabla de coeficientes) y capítulo 3 (control de salida).
- Australian Institute for Disaster Resilience (2014). *Technical flood risk management guideline: Flood hazard*, Australian Disaster Resilience Guideline 7-3 (2.ª ed.). Tablas 1 y 2: clases H1–H6 y sus límites.
- Smith, G. P., Davey, E. K. y Cox, R. J. (2014). *Flood hazard*. UNSW Water Research Laboratory, Technical Report 2014/07.
- O'Brien, J. S. (1986). Clasificación de flujos por concentración de sedimentos (creciente de agua, inundación de lodo, flujo de lodo); y O'Brien, J. S., Julien, P. Y. y Fullerton, W. T. (1993). Two-dimensional water flood and mudflow simulation. *Journal of Hydraulic Engineering*, 119(2), 244–261.

- Govers, G. (1990). Empirical relationships for the transporting capacity of overland flow. *IAHS Publication* 189, 45–63.
- De Roo, A. P. J., Wesseling, C. G. y Ritsema, C. J. (1996). LISEM: a single-event physically based hydrological and soil erosion model for drainage basins. *Hydrological Processes*, 10, 1107–1117; y la documentación de LISEM (Universidad de Twente): capacidad de transporte, arranque y depósito.
- Rauws, G. y Govers, G. (1988). Hydraulic and soil mechanical aspects of rill generation on agricultural soils. *Journal of Soil Science*, 39, 111–124.
- Ferguson, R. I. y Church, M. (2004). A simple universal equation for grain settling velocity. *Journal of Sedimentary Research*, 74(6), 933–937.
- Richardson, J. F. y Zaki, W. N. (1954). Sedimentation and fluidisation: Part I. *Transactions of the Institution of Chemical Engineers*, 32, 35–53.
- Liebenow, A. M., Elliot, W. J., Laflen, J. M. y Kohl, K. D. (1990). Interrill erodibility: collection and analysis of data from cropland soils. *Transactions of the ASAE*, 33(6), 1882–1888.
- Sartor, J. D. y Boyd, G. B. (1972). *Water Pollution Aspects of Street Surface Contaminants*. EPA-R2-72-081.
- IDEAM (2016). Curva intensidad-duración-frecuencia de la estación A. Olaya Herrera (Medellín), 1971–2010; reproducida en Alcaldía de Medellín, *Documento Técnico de Soporte* DTS 2022, versión 2, numeral 2.2.5.
- Chow, V. T., Maidment, D. R. y Mays, L. W. (1988). *Applied Hydrology*. McGraw-Hill. Sección 14.4 (método de los bloques alternos).
- IPCC (2021). *Climate Change 2021: The Physical Science Basis*. Contribución del Grupo de Trabajo I al Sexto Informe de Evaluación (intensificación de cerca de 7 % por grado de los aguaceros extremos diarios).
- Grajales-Cardona, D. y Carvajal-Serna, L. F. (2019). Curvas Intensidad-Duración-Frecuencia no estacionarias para la cuenca del río Medellín. *DYNA*, 86(208), 321–328.
- SIATA, citado por El Colombiano, Minuto30 y Pulzo (28 y 29 de enero de 2026): aguacero de unos 87 mm en 44 minutos en la ladera suroriental de Medellín.

- Bates, P. D., Horritt, M. S., & Fewtrell, T. J. (2010). A simple inertial formulation of the shallow water equations for efficient two-dimensional flood inundation modelling. *Journal of Hydrology*, 387, 33–45.
- de Almeida, G. A. M., Bates, P., Freer, J. E., & Souvignet, M. (2012). Improving the stability of a simple formulation of the shallow water equations for 2-D flood modeling. *Water Resources Research*, 48, W05528.
- Chow, V. T. (1959). *Open-Channel Hydraulics*. McGraw-Hill.
- USDA NRCS (1986). *Urban Hydrology for Small Watersheds* (TR-55).
- Rawls, W. J., Brakensiek, D. L., & Miller, N. (1983). Green-Ampt infiltration parameters from soils data. *Journal of Hydraulic Engineering*, 109(1), 62–70.
- FHWA (2009). *Urban Drainage Design Manual*, HEC-22, 3.ª ed.
- Rossman, L. A., & Huber, W. C. (2016). *Storm Water Management Model Reference Manual, Vol. I – Hydrology*. EPA/600/R-15/162A.
- W3C (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*, criterio 2.3.1 «Umbral de tres destellos o por debajo».

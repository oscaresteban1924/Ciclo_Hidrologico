# Módulo «Hidráulica de canales»: modelo, supuestos y fuentes

Sexto modo de la aplicación (`src/canals/`). Tiene seis partes con la misma distribución que «Calidad del agua»: una escena 3D con una pregunta a la izquierda y un panel a la derecha (una sola columna en teléfonos). Cada parte tiene las pestañas Esquema, Retos, Experimentos, Diseño, Datos y Docente. El cálculo está en módulos sin interfaz (`hydraulics.ts`, `culvert.ts`, `sediment.ts`, `advanced.ts`, `profiles.ts`, `designCalc.ts`, `designAdvanced.ts`, y los planos en `plan.ts`, `planBuilders.ts`, `designPlans.ts` y `memoria.ts`) y se prueba en `tests/canals/hydraulics.test.ts` (`npm run test:canals`; informe en `PRUEBAS_CANALES.md`).

**Qué es y qué no es.** Es un laboratorio educativo con las ecuaciones clásicas de la hidráulica de canales y coeficientes publicados. Las escenas son ilustrativas: ningún canal, puente, alcantarilla o quebrada representa uno de Medellín, y los resultados no son pronósticos. Las calculadoras y los prediseñadores dan **prediseños académicos**: no son diseños de ingeniería. Así lo dicen el aviso del módulo, la pestaña Diseño y la memoria de cálculo descargable.

**Profundidades a escala.** El agua se dibuja con su profundidad calculada, sin exagerarla. Su color cambia con la profundidad (más claro donde hay poca agua) y sus ondas avanzan con la velocidad calculada en cada punto (mapa de flujo en dos fases); en la cara que se ve por el vidrio, las vetas van más rápido arriba que abajo (perfil de potencia 1/7). Los trazadores amarillos junto al vidrio viajan a u = 1,143·V·(z/y)^(1/7). Donde un dibujo plano necesita exagerar la escala vertical (el esquema del puente y el de la alcantarilla), el dibujo lo dice. Los granos de sedimento menores de 8 cm se dibujan de 8 cm, y la escena dice cuántas veces se aumentaron.

## 1. El canal y su caudal (flujo uniforme)

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Geometría | rectángulo, trapecio (talud z:1) y tubo circular: área A, perímetro P, ancho superficial T, radio hidráulico R = A/P y momento estático del área respecto a la superficie | Chow (1959), cap. 2 |
| Manning | Q = (1/n)·A·R^(2/3)·S^(1/2) | Chow (1959), cap. 5 |
| Coeficientes n | concreto 0,013; piedra pegada 0,025; tierra 0,022; pasto 0,027; cantos 0,040 (valores «normales») | Chow (1959), tabla 5-6 |
| Profundidad normal y crítica | por bisección: Manning para la normal; Q²T/(gA³) = 1 para la crítica | Chow (1959) |
| Froude | F = V/√(g·A/T) | Chow (1959) |
| Velocidad máxima | tierra 0,76 m/s; cantos 1,52 m/s (Fortier y Scobey, agua limpia); pasto 1,8 m/s (SCS, pasto bermuda en suelo resistente) | Chow (1959), tablas 7-3 y 7-6 |
| Velocidad mínima | 0,6 m/s (por debajo se deposita arena) | Chow (1959): 0,6 a 0,9 m/s |
| Borde libre | 20 % de la profundidad y al menos 0,10 m (regla del juego; Chow cita 5 a 30 %) | Regla didáctica |
| Tubo | el agua no pasa de 85 % del diámetro; el caudal máximo de un tubo va a 0,938 D (1,0757 veces el caudal a tubo lleno) | Regla didáctica; Chow (1959) |
| Flujo inestable | Froude entre 0,8 y 1,2 | Criterio de Chow (1959) |

**Lo que muestra.** El caudal cabe o no cabe, el agua erosiona un canal de tierra si va rápida, deja arena si va lenta y se vuelve inestable cerca del crítico. El experimento de la sección óptima compara el perímetro mojado de varias formas con la misma área.

**Velocidades en la sección (isotacas).** La cara del corte se colorea con la velocidad: ley logarítmica con la distancia d a la pared o al fondo más cercano, u = (u*/κ)·ln(d/z0), z0 = ks/30 y ks de Strickler (n = ks^(1/6)/21,1), escalada para que la media en el área sea la velocidad media calculada. La rampa es de un solo tono (claro = lento) de 50 % a 100 % de la máxima, con isotacas cada 5 %. Es una aproximación: no dibuja el máximo bajo la superficie de los canales angostos. Las hojas de la superficie corren a u(z) = Vs·(1 − |2z/T|)^(1/7), más rápido en el centro.

**Canal en tierra (Lane, 1955; en Chow, 1959, cap. 7).** Razón de fuerza tractiva K = √(1 − sen²θ/sen²φ) (θ del talud, φ de reposo); esfuerzo permisible del material grueso τp = 0,754·d75 (Pa, d75 en mm; equivale a 0,4·d75 en lb/ft² y pulgadas), válido para d75 ≥ 6 mm; esfuerzos máximos 0,97·γ·y·S en el fondo y 0,75·γ·y·S en los taludes (b/y ≥ 4). La profundidad de diseño es la menor que respetan el fondo y los taludes; el ancho sale de Manning.

**Rugosidad compuesta (Horton y Einstein).** n = [Σ Pᵢ·nᵢ^1,5 / P]^(2/3).

## 2. La caída y el resalto

Una rápida de concreto (4 m de ancho, pendiente 25 %, n = 0,014) baja a un pozo con un vertedero de cresta ancha al final.

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Rápida | perfil S2 por el método de paso directo, desde la crítica en la cresta | Chow (1959), cap. 10 |
| Piso del pozo | perfil H3 hasta el resalto | Chow (1959) |
| Vertedero de salida | Q = C·b·H^1,5 con C = (2/3)^1,5·√g ≈ 1,70 | Cresta ancha (Henderson, 1966) |
| Resalto | conjugada con la fuerza específica (Bélanger en rectángulo): y2 = (y1/2)(√(1 + 8F1²) − 1) | Chow (1959), cap. 15 |
| Tipos | ondular, débil, oscilante, estable, fuerte, por el Froude de llegada | USBR (Peterka, 1958), en Chow |
| Longitud | L = 6,9 (y2 − y1) | Smetana, en French (1985) |
| Dónde queda | al pie, dentro del pozo, barrido fuera del pozo o ahogado contra la rápida | Comparación de fuerzas específicas |

**Verificación del paso directo.** Contra Runge-Kutta de cuarto orden, el perfil difiere menos de 0,07 % (prueba H7).

**Pozos del USBR (Peterka, 1958/1978; Design of Small Dams, 1987).** El tipo se escoge con F1, V1 y q:

| Tipo | Cuándo | Accesorios | Largo | Agua a la salida |
|---|---|---|---|---|
| III | F1 > 4,5, V1 ≤ 18 m/s, q ≤ 18,6 m²/s | dados de y1; bloques de h3 = y1·(4 + F1)/6, ancho y separación 0,75·h3, a 0,8·y2 del pie; umbral macizo h4 = y1·(18 + F1)/18 | ≈ 2,7·y2 | y2 |
| II | F1 > 4,5 con más velocidad o caudal | dados de y1; umbral dentado de 0,2·y2 | ≈ 4,3·y2 | 1,05·y2 |
| IV | 2,5 < F1 < 4,5 (oscilante) | deflectores de 2·y1, ancho y1, separación 2,5·y1; umbral opcional | ≈ 6·y2 | 1,1·y2 |
| I | F1 ≤ 2,5 | ninguno | 6,9·(y2 − y1) | y2 |

Los largos son aproximaciones de las curvas de Peterka para valores típicos de F1. Si el agua disponible no alcanza, el prediseñador baja el piso del pozo y recalcula y1 e y2 hasta que alcance.

**Remolino y oleaje.** En la escena, los trazadores del remolino siguen un ciclo ilustrativo (arriba se devuelven, bajan junto al pie y suben al final); la superficie se pica con una amplitud proporcional a la profundidad y a la espuma del resalto. No son un cálculo de turbulencia.

## 3. El puente y el remanso

Una quebrada rectangular de 8 m de ancho, 3 m de orillas y n = 0,020 pasa bajo un puente con tablero de 0,8 m.

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Estrangulamiento | si la energía del agua E es menor que la energía crítica de la abertura Ec = 1,5·(q²/g)^(1/3), el agua se represa hasta tener Ec (profundidad lenta con esa energía) | Henderson (1966) |
| Palos y basura | tapan 30 % («con palos») o 60 % («muy tapado») del ancho | Regla didáctica |
| Paso a presión | Q = Cd·b·a·√(2g(y − a/2)), Cd = 0,5 | FHWA HDS-7 (2012), orden de magnitud |
| Agua sobre el tablero | vertedero con Cw = 1,5 (SI) | FHWA HDS-7, orden de magnitud |
| Remanso | perfil M1 por paso directo hasta 1 % sobre la normal; en un cauce rápido, perfil S1 que termina en un resalto | Chow (1959) |
| Pilas en la escena | 0, 1 o 2 pilas de 0,6 m de punta y cola semicirculares; restan su ancho a la abertura y, sin estrangulamiento, suben el agua con Yarnell (K = 0,9) | Yarnell (1934); HEC-RAS |

**Pilas (calculadora).** Remanso de Yarnell para flujo lento sin estrangular (clase A): Δy = K·F3²·(K + 5·F3² − 0,6)·(α + 15·α⁴)·y3, con K = 0,90 (punta y cola semicirculares), 0,95 (dos cilindros con diafragma), 1,05 (dos cilindros sin diafragma o punta triangular de 90°) y 1,25 (cuadrada) (HEC-RAS Hydraulic Reference Manual). Socavación local (HEC-18, 5.ª ed., 2012): ys/y1 = 2,0·K1·K2·K3·(a/y1)^0,65·Fr1^0,43, con K1 = 1,1 (cuadrada), 1,0 (redonda o cilíndrica) o 0,9 (aguda), K2 = (cos θ + L/a·sen θ)^0,65 y K3 = 1,1 (agua clara, lecho plano o dunas pequeñas), 1,2 o 1,3 (dunas medianas o grandes); tope de 2,4·a (Fr ≤ 0,8) o 3,0·a (Fr > 0,8) para pilas redondas alineadas. La prueba H18 reproduce un ejemplo publicado (10,48 m).

**Socavación por contracción (HEC-18).** Velocidad crítica Vc = 6,19·y^(1/6)·D50^(1/3). Lecho vivo (Laursen modificada, todo el caudal pasa por el puente): y2 = y1·(W1/W2)^k1, con k1 = 0,59, 0,64 o 0,69 según u*/ω. Agua clara: y2 = [0,025·Q²/(Dm^(2/3)·W²)]^(3/7), Dm = 1,25·D50. ys = y2 − y0.

## 4. Las alcantarillas

Tubos circulares de concreto (n = 0,012) bajo un terraplén vial, con muro de borde recto, muro con campana o campana saliente. Métodos de FHWA HDS-5, *Hydraulic Design of Highway Culverts* (3.ª ed., 2012), en unidades del SI (Ku = 1,811).

| Entrada | K | M | c | Y | Ks | ke |
|---|---|---|---|---|---|---|
| Muro con borde recto | 0,0098 | 2,0 | 0,0398 | 0,67 | −0,5 | 0,5 |
| Muro con borde de campana | 0,0018 | 2,0 | 0,0292 | 0,74 | −0,5 | 0,2 |
| Campana saliente del terraplén | 0,0045 | 2,0 | 0,0317 | 0,69 | −0,5 | 0,2 |

| Pieza | Ecuación o valor |
|---|---|
| Control a la entrada | sin ahogar (forma 1) si X = Ku·Q/(A·D^0,5) ≤ 3,5; ahogada si X ≥ 4; interpolación lineal entre las dos |
| Control a la salida | H = [1 + ke + 2g·n²·L/R^(4/3)]·V²/2g; ho = máx(TW, (dc + D)/2); HW = H + ho − L·S |
| Nivel a la entrada | el mayor de los dos; el control es el que lo fija |
| Agua sobre la vía | vertedero de 40 m de largo con Cr = 1,66; el reparto entre tubo y vía se halla por bisección |
| Reglas del juego | HW ≤ 1,5 D; al menos 0,5 m entre el agua y la vía; velocidad a la salida ≤ 4,5 m/s |

**Cajones de concreto (HDS-5, tabla A.1, forma 1; ke de la tabla C.2).**

| Entrada | K | M | c | Y | ke |
|---|---|---|---|---|---|
| Aletas de 30° a 75° | 0,026 | 1,0 | 0,0347 | 0,81 | 0,4 |
| Aletas de 90° y 15° | 0,061 | 0,75 | 0,0400 | 0,80 | 0,5 |
| Aletas de 0° (paredes prolongadas) | 0,061 | 0,75 | 0,0423 | 0,82 | 0,7 |

En el cajón, D es la altura y B el ancho; A = B·D, R lleno = B·D/(2·(B + D)) y Hc = 1,5·dc con el caudal por metro de ancho. La prueba H22 compara con un cálculo a mano.

**La escena.** El terraplén y el valle están cortados por el eje del primer tubo, con un vidrio en el corte: se ve el tubo partido a lo largo con el agua que lleva, el charco que se forma aguas arriba hasta el nivel calculado y el agua de abajo. El perfil dentro del tubo es esquemático; los niveles a la entrada y a la salida son los calculados. Por defecto la alcantarilla deja pasar la creciente pero no cumple las reglas, para que el reto sea arreglarla.

## 5. El transporte de sedimentos

Un cauce ancho de lecho móvil (10 m) con siete tamaños de grano: limo (0,04 mm), arena fina, arena gruesa, gravilla, grava, cantos y bloques (0,5 m). Densidad del grano 2 650 kg/m³; agua a unos 20 °C.

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Rugosidad | n = d^(1/6)/21,1 (d en m), al menos 0,020 por las formas del fondo | Strickler |
| Esfuerzo en el fondo | τ = ρ·g·R·S; número de Shields θ = τ/((ρs − ρ)·g·d) | Shields (1936) |
| Umbral | θcr de la curva de Soulsby y Whitehouse con el diámetro adimensional D* | Soulsby y Whitehouse (1997) |
| Arrastre de fondo | q* = 3,97 (θ − θcr)^1,5 | Meyer-Peter y Müller (1948), forma de Wong y Parker (2006) |
| Velocidad de caída | Ferguson y Church con C1 = 18 y C2 = 1 | Ferguson y Church (2004) |
| Modo de transporte | número de Rouse P = ws/(κ·u*): más de 2,5 por el fondo; 1,2 a 2,5 mixto; 0,8 a 1,2 suspendido; menos de 0,8 carga de lavado | García, ASCE Manual 110 (2008) |
| Altura de los granos suspendidos | perfil de Rouse | Rouse (1937) |
| Enrocado | d50 = FS·τ/((ρs − ρ)·g·0,047), FS = 1,5; se escoge la clase comercial siguiente | Shields para piedra gruesa (regla del juego) |

**Cuatro fórmulas (calculadora).** q* = q/√((s − 1)·g·d³).
- Meyer-Peter y Müller (Wong y Parker, 2006): 3,97·(θ − θcr)^1,5; calibrada en grava (0,4 a 29 mm).
- Einstein y Brown (Brown, 1950): 40·K·θ³ si θ ≥ 0,18, o K·e^(−0,391/θ)/0,465, con K = √(2/3 + 36/D*³) − √(36/D*³).
- van Rijn (1984), fondo: 0,053·T^2,1/D*^0,3 (T < 3) o 0,1·T^1,5/D*^0,3, con u*' = √g·V/C', C' = 18·log10(12R/(3·d90)) y d90 ≈ 2·d50; calibrada en arena (0,2 a 2 mm).
- Engelund y Hansen (1967), carga total: 0,1·θ^2,5/f, f = 2·g·R·S/V²; para arena.

Las fórmulas pueden diferir varias veces entre sí; la calculadora marca las que están fuera de su rango de grano (prueba H20).

**Formas del lecho (van Rijn, 1984).** Etapa de transporte T = (u*'² − u*cr²)/u*cr². Rizos si D* < 10 y T < 3; dunas si T < 15; transición si T < 25; arriba, lecho plano o antidunas (Fr > 0,8). Dunas: alto Δ = 0,11·h·(d/h)^0,3·(1 − e^(−0,5T))·(25 − T) y largo 7,3·h; rizos: largo ≈ 1 000·d y alto ≈ largo/7; antidunas: largo 2π·V²/g (Kennedy, 1963). Avance (Exner, forma triangular): c = 2·qb/((1 − p)·Δ) con p = 0,4; las antidunas se dibujan quietas. En la escena, las dunas tienen la forma asimétrica (cara de aguas arriba tendida, de aguas abajo empinada) y avanzan en tiempo acelerado (una longitud cada 25 s); la escena lo dice y da el avance real por hora. En arena, el lecho se dibuja como superficie y solo se aumentan los granos que se mueven.

**La escena.** Los granos se dibujan en la franja de 1,6 m junto al vidrio, que es la que se ve; los que se mueven ruedan y saltan por el fondo o suben según el perfil de Rouse, y el agua se enturbia con lo que va suspendido.

## 6. Medir el caudal

Un canal de laboratorio de 0,30 m de ancho y 0,45 m de alto con una bomba de 0,5 a 25 L/s.

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Vertedero rectangular | Q = (2/3)·Cd·b·√(2g)·H^1,5, Cd = 0,611 + 0,08·H/P, P = 0,15 m | Rehbock (1929) |
| Vertedero triangular de 90° | Q = (8/15)·Cd·√(2g)·tan(θ/2)·H^2,5 con Cd = 0,58 (≈ 1,37 H^2,5) | Kindsvater y Shen (1959) |
| Compuerta | descarga libre con vena contraída 0,61·a y energía igual antes y en la vena | Henderson (1966) |
| Flotador | velocidad media = 0,85 × velocidad de la superficie | Valor de referencia |
| Curva de calibración | ajuste Q = k·H^m por mínimos cuadrados en logaritmos | — |
| Canaleta Parshall | Q = C·Ha^n en pies y pies³/s: 1 pulgada 0,338 y 1,55; 2 pulgadas 0,676 y 1,55; 3 pulgadas 0,992 y 1,55; 6 pulgadas 2,06 y 1,58; 9 pulgadas 3,07 y 1,53; 1 pie 3,95 y 1,55; 2 pies 8,00 y 1,55; 3 pies 12,0 y 1,57. Sumergencia límite Hb/Ha: 0,5 (1 a 3 pulgadas), 0,6 (6 y 9), 0,7 (1 a 8 pies) | USBR, Water Measurement Manual, tabla 8-6 |
| Molinete | sección media: qᵢ = vᵢ·dᵢ·(xᵢ₊₁ − xᵢ₋₁)/2; aviso si una franja lleva más del 10 % del caudal | ISO 748; Rantz et al. (1982), USGS |

## 7. La pestaña Diseño: calculadoras, prediseñadores, planos y memoria

Cada parte tiene un selector de herramientas, en dos niveles. **Niños**: la calculadora y el prediseñador básicos, con pocos datos y una frase con el resultado. **Universitarios**: además, las herramientas avanzadas, con todos los datos, los resultados, las verificaciones y el paso a paso con las fórmulas y los números. Las funciones están en `designCalc.ts` y `designAdvanced.ts`, sin interfaz.

| Parte | Herramientas |
|---|---|
| El canal | flujo uniforme; prediseño de canal revestido de máxima eficiencia (b = 2y o b = 2y(√(1 + z²) − z)); rugosidad compuesta (Horton y Einstein); prediseño de canal en tierra por fuerza tractiva (Lane) |
| El resalto | resalto hidráulico; pozo liso con vertedero de salida; pozo USBR tipos II, III y IV |
| El puente | estrangulamiento; prediseño de la luz y del bajo del puente (avisa si hay que ensanchar el cauce); pilas (Yarnell y socavación local HEC-18); socavación por contracción (HEC-18) |
| Las alcantarillas | calculadora HDS-5 de tubo o cajón; prediseño que prueba doce tubos (0,6 a 3,0 m) o treinta y cinco cajones (1,0 a 4,0 m de ancho por 1,0 a 3,0 m de alto) con 1 a 3 conductos y escoge el de menor área que cumple |
| Los sedimentos | Shields, umbral, Rouse y arrastre; cuatro fórmulas de transporte y formas del lecho; prediseño de enrocado |
| Medir el caudal | vertederos y compuerta; escoger vertedero; canaleta Parshall; escoger canaleta Parshall; aforo con molinete por sección media |

**Planos y gráficas.** Los prediseños dibujan su plano acotado (corte del canal con revestimiento y borde libre, perfil del pozo con dados, bloques y umbral, abertura del puente con su gálibo, corte de la alcantarilla por la entrada con la vía y el nivel del agua, enrocado con su capa, alzado del vertedero) a escala, en metros, y una gráfica cuando aplica (curva de descarga del canal, nivel a la entrada de la alcantarilla según el caudal con la vía y el HW máximo, transporte según el caudal con las cuatro fórmulas en escala logarítmica, curvas de calibración). El plano se puede bajar en SVG.

**Memoria de cálculo.** Cada herramienta arma una memoria en HTML imprimible (se abre en el navegador y se imprime o se guarda en PDF): proyecto y autor opcionales, fecha, nivel, datos, plano, gráfica, cálculo paso a paso, resultados, verificaciones y la advertencia de prediseño académico. Se arma en el navegador: no se envía a ningún servidor, no se guarda y no pide cuenta.

**Simular una creciente.** En el resalto, el puente, la alcantarilla y los sedimentos, el caudal sube a un pico y vuelve con la forma del hidrograma adimensional gamma (Haan, 1970): q/qp = (t/tp·e^(1 − t/tp))^3,7, en tiempo comprimido (unos 30 s); la escena se recalcula en cada paso.

**Entradas siempre válidas.** Las escenas sanean sus entradas (`sanitizeUniform`, `sanitizeJump`, `sanitizeBridge`, `sanitizeGauge`, `sanitizeCulvert`, `sanitizeSediment`): un número que no es finito toma el valor por defecto y uno fuera de rango se lleva al borde. Las herramientas revisan los datos y responden con un aviso cuando no sirven. La prueba H15 llama 8 400 veces las veintiuna herramientas con datos al azar y exige que no haya excepciones ni valores no numéricos; la H23 hace lo mismo con los planos, las gráficas y la memoria.

## 8. Límites

- Flujo permanente y unidimensional; sin pérdidas locales en contracciones salvo donde se dicen.
- Los coeficientes del puente (paso a presión y tablero) son del orden de magnitud de HDS-7, no los de un caso particular.
- El transporte de sedimentos supone un lecho uniforme de un solo tamaño, sin acorazamiento ni formas de fondo.
- Las reglas del juego (borde libre, llenado del tubo, criterios de la alcantarilla, factor de seguridad del enrocado) son didácticas; un diseño real sigue la norma vigente del lugar.
- No se incluyeron criterios de normas colombianas (Manual de Drenaje para Carreteras del INVÍAS, Resolución 0330 de 2017) porque no se pudieron verificar contra sus textos oficiales; se pueden agregar con esos documentos a la mano.
- Las proporciones de los pozos del USBR, los coeficientes de Yarnell y de HEC-18 y las tablas de Parshall son los publicados; los largos de los pozos son aproximaciones de curvas.

## Fuentes

- Chow, V. T. (1959). *Open-Channel Hydraulics*. McGraw-Hill.
- Henderson, F. M. (1966). *Open Channel Flow*. Macmillan.
- French, R. H. (1985). *Open-Channel Hydraulics*. McGraw-Hill.
- Peterka, A. J. (1958). *Hydraulic Design of Stilling Basins and Energy Dissipators*. USBR, Monografía 25.
- FHWA (2012). *Hydraulic Design of Highway Culverts*, HDS-5, 3.ª ed.
- FHWA (2012). *Hydraulic Design of Safe Bridges*, HDS-7.
- Soulsby, R. L. y Whitehouse, R. J. S. (1997). Threshold of sediment motion in coastal environments. *Pacific Coasts and Ports '97*.
- Wong, M. y Parker, G. (2006). Reanalysis and correction of bed-load relation of Meyer-Peter and Müller. *J. Hydraulic Engineering*, 132(11).
- Ferguson, R. I. y Church, M. (2004). A simple universal equation for grain settling velocity. *J. Sedimentary Research*, 74(6).
- García, M. H. (ed.) (2008). *Sedimentation Engineering*, ASCE Manual 110.
- Rehbock, T. (1929) y Kindsvater, C. E. y Shen, R. C. (1959), vertederos de pared delgada (coeficientes de descarga).
- Lane, E. W. (1955). Design of stable channels. *Transactions ASCE*, 120.
- Peterka, A. J. (1958/1978). *Hydraulic Design of Stilling Basins and Energy Dissipators*. USBR, Monografía 25; U.S. Bureau of Reclamation (1987). *Design of Small Dams*, 3.ª ed.
- Yarnell, D. L. (1934). *Bridge Piers as Channel Obstructions*. USDA, Technical Bulletin 442; U.S. Army Corps of Engineers, *HEC-RAS Hydraulic Reference Manual*.
- FHWA (2012). *Evaluating Scour at Bridges*, HEC-18, 5.ª ed.
- Brown, C. B. (1950), en Rouse, H. (ed.), *Engineering Hydraulics*; van Rijn, L. C. (1984). Sediment transport, parts I y III. *J. Hydraulic Engineering*, 110(10) y 110(12); Engelund, F. y Hansen, E. (1967). *A Monograph on Sediment Transport in Alluvial Streams*; Kennedy, J. F. (1963). *J. Fluid Mechanics*, 16.
- U.S. Bureau of Reclamation (2001). *Water Measurement Manual*, cap. 8 (canaletas Parshall); ISO 748, aforo con molinete; Rantz, S. E. et al. (1982). *Measurement and Computation of Streamflow*, USGS Water-Supply Paper 2175.
- Haan, C. T. (1970), forma gamma del hidrograma adimensional, citada en NRCS, *National Engineering Handbook*, parte 630, cap. 16.

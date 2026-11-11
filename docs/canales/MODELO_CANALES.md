# Módulo «Hidráulica de canales»: modelo, supuestos y fuentes

Sexto modo de la aplicación (`src/canals/`). Tiene seis partes con la misma distribución que «Calidad del agua»: una escena 3D con una pregunta a la izquierda y un panel a la derecha (una sola columna en teléfonos). Cada parte tiene las pestañas Esquema, Retos, Experimentos, Diseño, Datos y Docente. El cálculo está en módulos sin interfaz (`hydraulics.ts`, `culvert.ts`, `sediment.ts`, `profiles.ts` y `designCalc.ts`) y se prueba en `tests/canals/hydraulics.test.ts` (`npm run test:canals`; informe en `PRUEBAS_CANALES.md`).

**Qué es y qué no es.** Es un laboratorio educativo con las ecuaciones clásicas de la hidráulica de canales y coeficientes publicados. Las escenas son ilustrativas: ningún canal, puente, alcantarilla o quebrada representa uno de Medellín, y los resultados no son pronósticos. Las calculadoras y los prediseñadores dan **prediseños académicos**: no son diseños de ingeniería. Así lo dicen el aviso del módulo, la pestaña Diseño y la memoria de cálculo descargable.

**Profundidades a escala.** El agua se dibuja con su profundidad calculada, sin exagerarla. Donde un dibujo plano necesita exagerar la escala vertical (el esquema del puente y el de la alcantarilla), el dibujo lo dice. Los granos de sedimento menores de 8 cm se dibujan de 8 cm, y la escena dice cuántas veces se aumentaron.

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

## 3. El puente y el remanso

Una quebrada rectangular de 8 m de ancho, 3 m de orillas y n = 0,020 pasa bajo un puente con tablero de 0,8 m.

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Estrangulamiento | si la energía del agua E es menor que la energía crítica de la abertura Ec = 1,5·(q²/g)^(1/3), el agua se represa hasta tener Ec (profundidad lenta con esa energía) | Henderson (1966) |
| Palos y basura | tapan 30 % («con palos») o 60 % («muy tapado») del ancho | Regla didáctica |
| Paso a presión | Q = Cd·b·a·√(2g(y − a/2)), Cd = 0,5 | FHWA HDS-7 (2012), orden de magnitud |
| Agua sobre el tablero | vertedero con Cw = 1,5 (SI) | FHWA HDS-7, orden de magnitud |
| Remanso | perfil M1 por paso directo hasta 1 % sobre la normal; en un cauce rápido, perfil S1 que termina en un resalto | Chow (1959) |

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

## 7. La pestaña Diseño: calculadoras y prediseñadores

Cada parte tiene dos herramientas, en dos niveles. **Niños**: pocos datos y una frase con el resultado. **Universitarios**: todos los datos, los resultados, las verificaciones y el paso a paso con las fórmulas y los números. Todas las funciones están en `src/canals/designCalc.ts`, sin interfaz.

| Parte | Calculadora (revisa lo que se propone) | Prediseñador (propone las medidas y las revisa) |
|---|---|---|
| El canal | flujo uniforme: profundidad normal, crítica, velocidad, Froude, borde libre | sección de máxima eficiencia (b = 2y en el rectángulo; b = 2y(√(1 + z²) − z) en el trapecio), redondeada a 5 cm, con revisión de velocidades, Froude y borde libre; excavación y revestimiento por metro |
| El resalto | conjugada, tipo, energía perdida, longitud | pozo amortiguador: profundidad al pie con pérdida en la rápida, conjugada con factor de seguridad, largo, vertedero de salida y paredes; revisa que el resalto sea estable (F1 de 4,5 a 9) y evita el oscilante |
| El puente | estrangulamiento y cuánto sube el agua | luz mínima (de 0,5 en 0,5 m, hasta 1,5 veces el cauce) con lo tapado previsto y altura del bajo del puente con el gálibo; avisa si hay que ensanchar el cauce |
| Las alcantarillas | control a la entrada y a la salida (HDS-5) | prueba doce diámetros comerciales de 0,6 a 3,0 m con 1, 2 o 3 tubos y escoge el de menor área que cumple los tres criterios |
| Los sedimentos | Shields, umbral, arrastre de fondo, modo de transporte | enrocado: tamaño, clase comercial, peso de la piedra y espesor de la capa |
| Medir el caudal | caudal de un vertedero rectangular, uno triangular o una compuerta | aforador para un rango de caudales: revisa el rectangular y el triangular (carga mínima, H/P, que quepa en el canal y 5 cm de borde) y escoge el que sirve en todo el rango |

**Memoria de cálculo.** El prediseñador descarga un archivo de texto con la fecha, los datos, el cálculo paso a paso, los resultados, las verificaciones y la advertencia de que es un prediseño académico. Se arma en el navegador: no se envía nada a ningún servidor ni se pide cuenta.

**Entradas siempre válidas.** Las escenas sanean sus entradas (`sanitizeUniform`, `sanitizeJump`, `sanitizeBridge`, `sanitizeGauge`, `sanitizeCulvert`, `sanitizeSediment`): un número que no es finito toma el valor por defecto y uno fuera de rango se lleva al borde. Las herramientas de diseño revisan los datos y responden con un aviso cuando no sirven (por ejemplo, un resalto con el agua llegando lenta). La prueba H15 llama 4 800 veces las doce herramientas con datos al azar y exige que no haya excepciones ni resultados con valores no numéricos, y que las propuestas de ejemplo cumplan lo que dicen.

## 8. Límites

- Flujo permanente y unidimensional; sin pérdidas locales en contracciones salvo donde se dicen.
- Los coeficientes del puente (paso a presión y tablero) son del orden de magnitud de HDS-7, no los de un caso particular.
- El transporte de sedimentos supone un lecho uniforme de un solo tamaño, sin acorazamiento ni formas de fondo.
- Las reglas del juego (borde libre, llenado del tubo, criterios de la alcantarilla, factor de seguridad del enrocado) son didácticas; un diseño real sigue la norma vigente del lugar.

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

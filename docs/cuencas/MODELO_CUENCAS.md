# Sala «Cuencas: de la lluvia al caudal»: modelo, supuestos y fuentes

Sala de la aplicación (`src/basins/`, enlace directo `#cuencas`). Tiene tres partes con la misma distribución que «Hidráulica de canales»: escena 3D con una pregunta, instrumentos en vivo y controles al pie, y un panel con las pestañas Esquema, Retos, Experimentos, Diseño, Datos y Docente. Sin WebGL, cada parte muestra su esquema plano con el mismo cálculo. El marco común de las salas nuevas está en `src/rooms/RoomLab.tsx`.

El cálculo está en módulos sin interfaz: `hydrology.ts` (lluvia, pérdidas, tiempos de concentración, hidrograma unitario, Gumbel y riesgo), `scene.ts` (la cuenca de la escena, el tanque de retención y las simulaciones), `river.ts` (el tramo de río con llanuras y sus casas) y `design.ts` (las herramientas de diseño y sus gráficas). Se prueba en `tests/basins/hydrology.test.ts` (`npm run test:basins`; informe en `PRUEBAS_CUENCAS.md`).

**Qué es y qué no es.** Es un laboratorio educativo de hidrología con los métodos clásicos. La cuenca, el río, la curva IDF y las series de caudales son **ilustrativos**: no representan una quebrada de Medellín, no son pronósticos oficiales de crecientes ni mapas de amenaza, y los prediseños no son diseños de ingeniería. Lo dicen el aviso de la sala, la pregunta de cada parte, la pestaña Diseño y la memoria de cálculo descargable.

## 1. Lluvia de diseño

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Curva IDF | i = K·T^m/(t + c)^n con K = 812, m = 0,18, c = 10 min, n = 0,75 (mm/h, t en min). **Ilustrativa**: no es la de una estación real | Forma de Sherman; valores escogidos para dar intensidades del orden de las andinas |
| Aguacero de diseño | bloques alternos: el bloque más intenso en el centro, los demás alternando a cada lado | Chow, Maidment y Mays (1988), sec. 14.4 |
| Duración | en «La cuenca», al menos 60 min y al menos dos veces el tiempo de concentración; en «El hidrograma», la elige el estudiante (15 a 180 min) | Regla del juego |

El RAS pide la curva IDF de la estación más cercana (Res. 0330 de 2017, Art. 135, num. 2). Lo dicen la pestaña Datos, los pasos de cada herramienta y la memoria.

## 2. Pérdidas y escorrentía

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Número de curva | Q = (P − Ia)²/(P − Ia + S), S = 25 400/CN − 254 (mm), Ia = 0,2·S | NRCS, TR-55 (1986) |
| Coberturas | bosque, pasto, cultivos, barrio y vías, con CN para los suelos B, C y D (condición de humedad normal) | NRCS, TR-55, tablas 2-2a y 2-2c |
| Mezcla | la escorrentía de la cuenca es la suma de la de cada cobertura con su suelo (no un CN promedio); el CN equivalente es el que da la misma escorrentía | Regla del juego, consistente con TR-55 |
| Lluvia efectiva por bloque | diferencia de la escorrentía acumulada | Chow et al. (1988), sec. 5.5 |
| Coeficiente C | tabla de Chow et al. (1988), tabla 15.1.1, para T = 2 a 500 años; el barrio es 65 % de zonas duras y 35 % de pasto | Chow et al. (1988) |
| Urbanizado | una fracción u de la cuenca: 80 % barrio y 20 % vías; el resto, 60 % bosque y 40 % pasto | Regla del juego |

## 3. Tiempo de concentración, método racional e hidrograma

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Kirpich | tc = 0,0195·L^0,77·S^−0,385 (min, L en m) | Kirpich (1940) |
| Témez | tc = 0,3·(L/S^0,25)^0,76 (h, L en km) | Témez (1978) |
| Retardo del SCS | tL = L^0,8·(S' + 1)^0,7/(1900·Y^0,5) (h, L en pies, Y en %), tc = tL/0,6 | NRCS, NEH parte 630, cap. 15 |
| Tiempo usado | promedio de los tres, con mínimo de 10 min | El RAS (Art. 135, num. 4) pide simular tiempos mínimos de 3 a 10 min |
| Largo del cauce en la escena | L ≈ 1,8·√A (cuenca alargada; del orden de la ley de Hack) | Regla del juego |
| Método racional | Q = C·i·A/360 (m³/s, i en mm/h, A en ha), con la intensidad de duración tc | Chow et al. (1988), sec. 15.1 |
| Límite del racional | solo con áreas menores de 80 ha | RAS, Art. 135 |
| Hidrograma unitario | triangular del SCS: tp = Δt/2 + 0,6·tc, qp = 0,208·A/tp (m³/s por mm, A en km²), tb = 2,67·tp; ordenadas promediadas en cada intervalo y escaladas al volumen exacto | NRCS, NEH parte 630, cap. 16 |
| Convolución | Q(n) = Σ P_ef(m)·U(n − m + 1) | Chow et al. (1988), sec. 7.2 |

**Racional contra hidrograma.** Con la tabla de C y la intensidad de duración tc, el método racional suele dar picos mayores que el número de curva: supone que toda la cuenca aporta con el mismo C, mientras el número de curva descuenta primero la abstracción inicial. La pregunta de la parte lo dice; no se ajusta un método para que coincida con el otro.

**El hidrograma no incluye caudal base** ni se transita por los cauces: el hidrograma unitario resume la respuesta de toda la cuenca.

## 4. Tanque de retención

El tanque deja salir como mucho Qlim, el pico de la cuenca sin urbanizar (como un regulador de caudal). Mientras haya espacio, guarda lo que supera Qlim; si se llena, lo que sobra rebosa; después se vacía a Qlim. El volumen necesario (teoría) es el área del hidrograma de después por encima de Qlim; la simulación debe guardar exactamente ese volumen cuando el tanque alcanza (prueba C10). **No es el tránsito de un tanque real** con la curva de descarga de su orificio y su vertedero: es el primer tanteo del volumen, y así lo dicen la parte y la herramienta.

## 5. Crecientes, período de retorno y riesgo

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Gumbel por momentos | K_T = −(√6/π)·(0,5772 + ln(ln(T/(T − 1)))), Q_T = μ + K_T·σ | Chow et al. (1988), sec. 12.3 |
| Posiciones de graficación | Weibull, T = (n + 1)/m | Chow et al. (1988), sec. 12.1 |
| Riesgo en la vida útil | R = 1 − (1 − 1/T)^n | Chow et al. (1988), sec. 13.1 |
| Series sintéticas | máximos anuales de un Gumbel con μ = 70 m³/s y σ = 25 m³/s (el río «de verdad» del juego), con semilla | Regla del juego |
| Vidas simuladas | 500 vidas de 50 años por pulsación; la fracción con al menos una creciente mayor que la de T años se compara con R | Monte Carlo |
| Sección del río | cauce trapecial (fondo 14 m, taludes 1,5:1, orillas de 3 m, n = 0,035) y llanuras de 60 m a cada lado (pendiente transversal 2 %, n = 0,06); pendiente 0,002 | Ilustrativa |
| Nivel | sección dividida: Manning en el cauce y en cada llanura, sin fricción en las interfaces verticales | Chow (1959), sec. 6-6 |
| Casas | diez casas a 16, 24, 34, 46 y 60 m del eje a cada lado; una casa tiene agua adentro si el nivel supera su piso en más de 5 cm | Regla del juego |

**Escala.** El agua de la escena del río sube a la profundidad calculada, sin exagerarla. El corte plano exagera la escala vertical (unas 12 veces) y lo dice.

## 6. Herramientas de diseño (pestaña Diseño)

| Parte | Calculadora | Prediseñador | Avanzada (universitarios) |
|---|---|---|---|
| La cuenca | tiempo de concentración (tres fórmulas) | caudal de diseño: Tabla 16 del RAS, tc, IDF, racional (< 80 ha) o número de curva con hidrograma (≥ 80 ha) | método racional |
| El hidrograma | escorrentía e hidrograma del SCS | volumen de almacenamiento para no aumentar el pico | — |
| Crecientes | Gumbel con una serie escrita | período de retorno por riesgo, comparado con la Tabla 16 del RAS | — |

Cada herramienta da resultados, paso a paso, verificaciones (las del RAS citan su artículo), una gráfica registrada para la memoria y la memoria de cálculo descargable con el nombre de la sala. La nota de la norma de esta sala resume el Art. 135 y la Tabla 16 del RAS.

## 7. Instrumentos, retos y experimentos

| Parte | Instrumentos en vivo | Retos | Experimento que se compara con la teoría |
|---|---|---|---|
| La cuenca | aguacero (barras total y efectiva) e hidrograma con el minuto actual; caudal en la salida y lluvia en los últimos 40 s | cuenca rápida (tc < 15 min); balance de masa (< 2 %); urbanizar duplica el pico; más de 80 ha | la estación suma el caudal cuadro a cuadro y se compara con la lámina que escurre por el área |
| El hidrograma | hidrograma urbanizado, sin urbanizar y el que sale del tanque; caudal y llenado del tanque | el doble de creciente; un tanque justo; un tanque que rebosa; un suelo que se traga el agua | máximo guardado en la simulación contra el volumen necesario de la teoría; balance de masa del tanque; convolución bloque por bloque |
| Crecientes | papel de Gumbel (registros, ajuste y el río «de verdad»); nivel y creciente | la primera casa con agua; pocos años, mucho error; menos de 10 % en 50 años; la fórmula del riesgo, comprobada | vidas útiles simuladas contra R = 1 − (1 − 1/T)^n; frecuencia empírica en 10 000 años |

## 8. Verificación

`npm run test:basins` ejecuta doce pruebas con tolerancias declaradas (C1 a C12): escorrentía de TR-55, tiempos de concentración, racional y tabla de C, bloques alternos, volumen del hidrograma unitario, factor de Gumbel, riesgo, la cuenca de la escena, robustez de las siete herramientas, tanque de retención, remuestreo y simulación del riesgo con el río y sus casas.

## Fuentes

- Chow, V. T. (1959). *Open-Channel Hydraulics*. McGraw-Hill.
- Chow, V. T., Maidment, D. R. y Mays, L. W. (1988). *Applied Hydrology*. McGraw-Hill.
- Kirpich, Z. P. (1940). Time of concentration of small agricultural watersheds. *Civil Engineering*, 10(6), 362.
- Ministerio de Vivienda, Ciudad y Territorio (2017). Resolución 0330 de 2017, Reglamento Técnico del Sector de Agua Potable y Saneamiento Básico (RAS), Art. 135 y Tabla 16.
- NRCS (1986). *Urban Hydrology for Small Watersheds*, Technical Release 55.
- NRCS. *National Engineering Handbook*, parte 630, capítulos 15 y 16.
- Témez, J. R. (1978). *Cálculo hidrometeorológico de caudales máximos en pequeñas cuencas naturales*. MOPU, Madrid.

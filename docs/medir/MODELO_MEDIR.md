# Sala «Medir el agua»: modelo, supuestos y fuentes

Sala de la aplicación (`src/measure/`, enlace directo `#medir`). Tiene tres partes con la distribución de las salas con partes (`src/rooms/RoomLab.tsx`): escena 3D con una pregunta, instrumentos en vivo y controles al pie, y un panel con Esquema, Retos, Experimentos, Diseño, Datos y Docente. Sin WebGL, cada parte muestra su gráfica con el mismo cálculo.

El cálculo está en módulos sin interfaz: `measure.ts` (pluviómetro, radar, río, aforo, curva de gasto y medidores), `scene.ts` (las escenas ilustrativas) y `design.ts` (herramientas de diseño y sus gráficas). Se prueba en `tests/measure/measure.test.ts` (`npm run test:measure`; informe en `PRUEBAS_MEDIR.md`).

**Qué es y qué no es.** Laboratorio educativo. La estación meteorológica, el radar, el río, los aforos históricos y el banco de tuberías son **ilustrativos**: no son estaciones de la red del IDEAM ni de un sistema de alerta, y los cálculos no son mediciones oficiales. Se citan métodos de normas internacionales (ISO 748 para el aforo con molinete, ISO 5167 para los medidores de presión diferencial) y guías de la OMM como referencia para aprender.

**Escalas.** Las tres maquetas van a escala, sin exageración vertical. El pluviómetro mide 16 cm de diámetro (boca de 200 cm²). En la estación sin reproducción, el registrador cuenta en cámara rápida (×6); el aguacero de una hora se reproduce en 20 s. Las partículas del banco de tuberías avanzan a la décima parte de la velocidad real para que se vean.

## 1. Medir la lluvia

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Balancín | 0,2 mm por vuelco, boca de 200 cm², 0,5 s de vuelco | valores típicos |
| Tiempo de vuelco | registrada = Ic/(1 + Ic·τ/δ): mientras se vuelca, el agua que cae se pierde | ciclo de llenado y vuelco |
| Viento | entra la fracción 1 − 0,012·u (u en m/s), con un mínimo de 0,88 | aproximación ilustrativa dentro del rango de 2 % a 10 % que reporta la OMM para la lluvia (OMM-n.º 8) |
| Relaciones Z-R | Z = 200·R^1,6 (estratiforme), 300·R^1,4 (convectiva), 250·R^1,2 (tropical) | Marshall y Palmer (1948); Fulton y otros (1998); Rosenfeld, Wolff y Atlas (1993) |
| Red mínima | un pluviómetro cada 25 a 10 000 km² según la región (y registradores) | OMM-n.º 168, tabla I.2.1 |

**La escena.** Una estación cercada en una pradera: el pluviómetro con camisa de vidrio donde se ve el embudo y el balancín rojo que se vuelca, el anemómetro de cazoletas y la veleta, y un registrador cuya pantalla cuenta vuelcos y milímetros. En una loma, un radar en su torre barre la zona con un haz translúcido que pinta la reflectividad sobre el terreno con la escala de colores usual. La nube y la lluvia siguen la intensidad. **Experimentos:** lo que pierde el balancín según la lluvia y el viento, lo que estima el radar con cada relación para cada tipo de lluvia, y el balance del aguacero de una hora.

## 2. Aforar un río

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Sección | cauce pedregoso de 16 m y 2,4 m de hondo, con llanuras de inundación anchas y casi planas | ilustrativa |
| Velocidad media por vertical | Manning con la profundidad local (cauce n = 0,035; llanuras 0,06; S = 0,15 %) | Chow (1959) |
| Perfil de velocidades | u(y) = v̄·(7/6)·(y/d)^(1/6): la lectura a 0,6 de la profundidad da 1,0014·v̄ y el promedio a 0,2 y 0,8 da 1,0081·v̄ | Herschy (2009) |
| Sección media | q = v·d·(b(k+1) − b(k−1))/2; veinte verticales o más y ninguna con más de 10 % del caudal | ISO 748 (2007) |
| Curva de gasto | Q = a·(h − h0)^b por mínimos cuadrados en logaritmos; h0 buscado en pasos de 1 cm | OMM-n.º 1044 (2010) |
| Aforos históricos | diez, de 0,62 a 2,40 m, con ±5 % de error | ilustrativos |

**La escena.** La maqueta del río termina en la línea de aforo: la cara del corte muestra la sección con el agua coloreada por la velocidad (más oscuro, más rápido) y las verticales con sus puntos de medida. Una tarabita cruza el río entre dos torres; al aforar, el carro va de vertical en vertical y el molinete baja al punto de medida (alternando 0,2 y 0,8 si se usan dos puntos), con la hélice girando según la corriente. En la orilla, la regla limnimétrica y la caseta con su pozo. **Experimentos:** la tabla del aforo vertical por vertical, el error según el número de verticales y el método, y los aforos contra la curva elegida y la mejor.

## 3. El medidor en la tubería

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Caudal | Q = C/√(1 − β⁴)·(π·d²/4)·√(2·g·Δh) | ISO 5167-1 |
| Venturi clásico | C = 0,995 (convergente mecanizado), β de 0,4 a 0,75; pérdida permanente cercana al 10 % de Δh (de 5 % a 20 %) | ISO 5167-4 |
| Placa de orificio | C de Reader-Harris/Gallagher con tomas en las esquinas; pérdida permanente (√(1 − β⁴(1 − C²)) − C·β²)/(√(1 − β⁴(1 − C²)) + C·β²)·Δp | ISO 5167-2 |
| Lectura | regla al milímetro; incertidumbre del caudal = (0,25 mm)/Δh | — |
| Presión en la garganta | atmósfera de Medellín (8,62 m de agua) + presión de la tubería − Δh; hierve con 0,24 m absolutos (20 °C) | — |

**La escena.** Un banco de laboratorio: un tanque elevado de nivel constante sobre su torre alimenta una tubería de acrílico de 100 mm con un Venturi y una placa de orificio entre bridas. Seis piezómetros de vidrio frente a una regla graduada muestran cómo baja la presión en la garganta y tras el orificio y cuánto se recupera; si la presión baja de la del aire, el piezómetro chupa aire. Partículas blancas se aceleran en el estrechamiento. El agua sale por una válvula a un tanque de aforo volumétrico que se llena. **Experimentos:** lectura y pérdidas según el caudal, la lectura de hoy redondeada al milímetro y su incertidumbre, y los avisos de rango de la norma.

## 4. Herramientas de diseño

| Parte | Calculadora | Prediseño | Universitarios |
|---|---|---|---|
| Lluvia | corrección de un balancín (vuelco y viento) | red mínima de pluviómetros (OMM) | lluvia desde la reflectividad con tres relaciones Z-R |
| Aforo | aforo con molinete a 0,2 y 0,8 por sección media, con la ecuación del molinete | curva de gasto con h0 automático o elegido, y caudal para un nivel | — |
| Tubería | caudal desde la lectura de un Venturi o una placa | β para que el caudal máximo llene la escala, y si el mínimo se lee bien | — |

## 5. Verificación

`npm run test:measure` ejecuta diez pruebas (M1 a M10): relaciones Z-R con valores de tabla, la fórmula del balancín contra una simulación vuelco a vuelco, el aguacero, el perfil de velocidades y las reglas del molinete, el área de la sección y la convergencia del aforo, la curva de gasto con datos exactos y con los aforos de la escena, el Venturi contra Bernoulli, el coeficiente de la placa y las pérdidas, la robustez de las siete herramientas y las escenas de partida.

## Límites

La celda de lluvia es ideal (una campana centrada en la estación) y el radar no tiene atenuación, bloqueo por montañas ni banda brillante. El caudal «verdadero» del río viene del mismo modelo; un aforo real tiene además errores del molinete, del tiempo de medida y de la turbulencia; no hay lazo de crecientes ni cambios del fondo. El Venturi se usa también por debajo del Reynolds de su norma (se avisa); no hay efectos de instalación ni incertidumbre del coeficiente.

## Fuentes

- Chow, V. T. (1959). *Open-Channel Hydraulics*. McGraw-Hill.
- Fulton, R. A., Breidenbach, J. P., Seo, D.-J., Miller, D. A. y O'Bannon, T. (1998). The WSR-88D rainfall algorithm. *Weather and Forecasting*, 13(2).
- Herschy, R. W. (2009). *Streamflow Measurement* (3.ª ed.). Taylor & Francis.
- ISO 748 (2007). *Hydrometry — Measurement of liquid flow in open channels using current-meters or floats*.
- ISO 5167-1, 5167-2 y 5167-4 (2003). *Measurement of fluid flow by means of pressure differential devices*.
- Marshall, J. S. y Palmer, W. M. (1948). The distribution of raindrops with size. *Journal of Meteorology*, 5.
- OMM (2008). *Guía de prácticas hidrológicas*, OMM-n.º 168.
- OMM (2010). *Manual on Stream Gauging*, OMM-n.º 1044.
- OMM (2018). *Guía de instrumentos y métodos de observación*, OMM-n.º 8.
- Reader-Harris, M. J. y Sattary, J. A. (1990). The orifice plate discharge coefficient equation. *Flow Measurement and Instrumentation*, 1(2).
- Rosenfeld, D., Wolff, D. B. y Atlas, D. (1993). General probability-matched relations between radar reflectivity and rain rate. *Journal of Applied Meteorology*, 32(1).

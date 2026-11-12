# Sala «El agua en casa»: modelo, supuestos y fuentes

Sala de la aplicación (`src/house/`, enlace directo `#casa`). Tiene tres partes con la distribución de las salas con partes (`src/rooms/RoomLab.tsx`): escena 3D con una pregunta, instrumentos en vivo y controles al pie, y un panel con Esquema, Retos, Experimentos, Diseño, Datos y Docente. Sin WebGL, cada parte muestra su gráfica con el mismo cálculo.

El cálculo está en módulos sin interfaz: `house.ts` (consumo por uso y en el día, factura, medidor, año de lluvia y balance del tanque), `scene.ts` (las escenas ilustrativas) y `design.ts` (herramientas de diseño y sus gráficas). Se prueba en `tests/house/house.test.ts` (`npm run test:house`; informe en `PRUEBAS_CASA.md`).

**Qué es y qué no es.** Laboratorio educativo. La casa, la familia, los caudales de los aparatos, la tarifa, los factores por estrato y la serie de lluvia son **ilustrativos**: la tarifa no es la de una empresa y los cálculos no son una asesoría. Lo regulatorio que se usa está citado: los rangos de consumo de la Resolución CRA 750 de 2016 y los topes de subsidios y aportes del artículo 125 de la Ley 1450 de 2011.

**Escalas.** La casa (10 × 8 m, muros de 2,6 m) va a escala. En el modo de consumo, los muros se cortan a 1,3 m, como en un plano, para ver los aparatos desde arriba. Un día se reproduce en 24 s, la prueba de noche (una hora) en 10 s y un año de lluvia en 30 s.

## 1. ¿Cuánta agua usa la casa?

| Pieza | Valor | Fuente |
|---|---|---|
| Volumen | caudal × tiempo (ducha, lavamanos, lavaplatos, manguera); volumen por descarga o por lavada | — |
| Ducha | 9 L/min; ahorradora 6 L/min | valores típicos |
| Sanitario | 9 L por descarga; de bajo consumo 4,8 L; 4 descargas por persona al día | valores típicos |
| Lavamanos y lavaplatos | 6 y 8 L/min; con aireador 3 y 5 L/min | valores típicos |
| Lavadora | 100 L por lavada; eficiente 55 L | valores típicos |
| Llave que gotea | 21 L/día (una gota por segundo) | cuenta de la calculadora de goteo del USGS (15 140 gotas por galón) |
| Sanitario con fuga | 120 L/día | ilustrativo |
| Reparto en el día | formas típicas: duchas de madrugada y de noche, cocina a las comidas, lavadora en la mañana, fugas parejas | ilustrativo |
| Rangos de consumo | básico hasta 13 m³ y complementario hasta 26 m³ al mes por suscriptor en ciudades entre 1 000 y 2 000 m | Resolución CRA 750 de 2016 |

**La escena.** La casa sin techo y con los muros cortados: baño con ducha, sanitario y lavamanos, cocina, patio con lavadora y la llave de la manguera. La tubería llega del medidor de la calle a cada aparato; cuando un aparato se usa a esa hora, el agua avanza por su tubo, sale el chorro, el tanque del sanitario se vacía y se llena, y el tambor de la lavadora gira. **Experimentos:** uso por uso con y sin aparatos ahorradores y fugas, y el consumo según los minutos de ducha.

## 2. El medidor y la factura

| Pieza | Valor | Fuente |
|---|---|---|
| Medidor | cinco tambores de metros cúbicos y cuatro agujas (décimas a diezmilésimas); la estrella gira con cualquier paso de agua | — |
| Consumo | lectura final − lectura inicial | — |
| Factura | cargos fijos + consumo de acueducto y de alcantarillado por metro cúbico, repartido en básico, complementario y suntuario | estructura de la regulación de la CRA; valores ilustrativos |
| Subsidios y contribuciones | de ejemplo: −60 %, −35 % y −10 % (estratos 1 a 3), 0 (estrato 4), +50 % y +60 % (estratos 5 y 6); los subsidios solo cubren cargos fijos y consumo básico | topes del artículo 125 de la Ley 1450 de 2011 (70 %, 40 % y 15 % de subsidio; 50 % y 60 % de aporte mínimo); Ley 142 de 1994, art. 99; la Ley 2294 de 2023 permite otros topes con condiciones |
| Prueba de noche | con todas las llaves cerradas, el medidor no se debe mover; la fuga es la diferencia de lecturas entre el tiempo | — |

**La escena.** La casa desde la calle y el medidor en su caja del andén, con la carátula que se dibuja con la lectura (tambores, agujas negras y rojas, la estrella). En la prueba de noche, el reloj marca de las 0:00 a la 1:00 y, si hay una fuga, las agujas rojas avanzan y la estrella gira. **Experimentos:** la prueba de noche con sus dos lecturas, el mismo consumo en cada estrato y lo que suma cada metro cúbico.

## 3. Agua lluvia para la casa

| Pieza | Valor | Fuente |
|---|---|---|
| Lluvia | un año de 365 días al azar que suma la media de cada mes (unos 1 600 mm, con el régimen bimodal del valle de Aburrá) | serie ilustrativa |
| Captación | (P − primer lavado)·A·C, con C de 0,9 (lámina), 0,8 (teja de barro) o 0,7 (losa) | coeficientes típicos |
| Balance diario | el tanque se llena primero, rebosa lo que sobra y después entrega la demanda; un año de calentamiento antes del que se reporta | método de comportamiento |
| Indicadores | fracción de la demanda atendida, días con la demanda completa, días vacío, reboses | — |

**La escena.** La casa con su techo de teja, la canoa, el bajante con el separador del primer lavado y un tanque azul translúcido donde se ve el nivel; al reproducir el año, llueve en los días lluviosos, el tanque sube y baja, rebosa cuando se llena, y un tubo verde (aparte del acueducto) lleva el agua lluvia al sanitario. **Experimentos:** el tanque según su tamaño y el año mes por mes.

## 4. Herramientas de diseño

| Parte | Calculadora | Prediseño |
|---|---|---|
| Consumo | consumo de una casa (duchas, sanitarios, otros usos y fugas) frente al consumo básico | cambio a aparatos ahorradores: agua, dinero y meses para pagarlo |
| Factura | factura desde dos lecturas, con el estrato y una tarifa editable | prueba nocturna de fugas: litros por hora, metros cúbicos y costo al mes |
| Agua lluvia | balance de un año de un tanque | el tanque más pequeño (en pasos de 100 L) que atiende la fracción pedida |

## 5. Verificación

`npm run test:house` ejecuta ocho pruebas (H1 a H8): el consumo de cada uso contra la cuenta a mano y su reparto en el día, el goteo contra la cuenta del USGS, la factura (rangos, subsidio solo en el básico, contribución en todo y que siempre sube con el consumo), la lectura del medidor, el año de lluvia (meses exactos y régimen bimodal), el balance de masa del tanque, la robustez de las seis herramientas y las escenas de partida con los retos alcanzables.

## Límites

Caudales típicos: los de cada aparato varían con la presión y el modelo. La tarifa y los factores son de ejemplo; no incluye aseo, intereses ni las medidas para desincentivar el consumo excesivo en temporadas secas. Un solo año de lluvia ilustrativo: un año seco atiende menos. El agua lluvia sin tratamiento no es para beber ni cocinar, y su red nunca se conecta con la del acueducto.

## Fuentes

- Colombia. Ley 142 de 1994, régimen de los servicios públicos domiciliarios (art. 99).
- Colombia. Ley 1450 de 2011, Plan Nacional de Desarrollo 2010-2014 (art. 125); Ley 2294 de 2023 (parágrafo al art. 125).
- Comisión de Regulación de Agua Potable y Saneamiento Básico (2016). Resolución CRA 750, por la cual se modifica el rango de consumo básico.
- U.S. Geological Survey. *Drip calculator: how much water does a leaky faucet waste?*

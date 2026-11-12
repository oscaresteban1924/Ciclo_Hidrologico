# Pruebas de la sala «Bombas y energía del agua»

Se ejecutan con `npm run test:pumps`. Cada prueba declara su tolerancia antes de ejecutarse.

**11 de 11 cumplen.**

## B1. Leyes de afinidad: puntos homólogos con Q ∝ n, H ∝ n² y P ∝ n³ — cumple

- Tolerancia: error relativo de 1e-9 o menos en la altura y la potencia, y la misma eficiencia en los puntos homólogos (velocidades de 60 % a 120 %)
- Medido: altura 5.0e-16, eficiencia 0.0e+0, potencia 5.0e-16

## B2. Punto de operación: la altura de la bomba iguala la del sistema — cumple

- Tolerancia: diferencia de 1e-6 m o menos en 300 sistemas al azar (una, serie y paralelo); la energía por metro cúbico es g·H/(η·3 600) con error de 1e-9
- Medido: 223 casos con flujo; diferencia máxima 4.3e-14 m; energía 4.2e-16

## B3. Dos bombas: en paralelo rinden más en una tubería holgada y en serie en una tubería estrecha y larga — cumple

- Tolerancia: con poca fricción, paralelo > serie > una; con mucha fricción, serie > paralelo > una; y dos bombas nunca dan el doble de caudal
- Medido: holgada: una 63.0, serie 81.8, paralelo 124.4 L/s; estrecha: una 26.4, serie 37.8, paralelo 27.3 L/s

## B4. Presión de la atmósfera, presión de vapor y densidad del agua contra tablas — cumple

- Tolerancia: atmósfera estándar de 1976 a 1 500 y 3 000 m con 0,1 %; presión de vapor (IAPWS) de 20 a 100 °C con 1 %; densidad de 4 a 90 °C con 0,05 %
- Medido: atmósfera 0.018 %, vapor 0.78 %, densidad 0.014 %

## B5. NPSH disponible, caudal máximo sin cavitación, agua hirviendo y altura máxima de succión — cumple

- Tolerancia: NPSHa igual a la suma de sus partes (1e-9 m); en el caudal máximo el margen es 0,5 m (1e-6 m); con agua a 100 °C al nivel del mar y la bomba al ras, NPSHa + pérdidas está a 0,15 m o menos de cero; NPSHa baja con la altitud, la temperatura y el caudal; succión teórica al nivel del mar a 20 °C de 10,11 m ± 0,05 m (10,35 m de atmósfera menos 0,24 m de vapor)
- Medido: NPSHa 4.827 m (suma 4.827); caudal máximo 58.6 L/s, margen 8.9e-16; a 100 °C -0.094 m; baja true; succión 10.108 m

## B6. Potencia de una central: P = ρ·g·Q·Hn·ηt·ηg — cumple

- Tolerancia: con 1 m³/s, 100 m y pérdidas despreciables, 838,8 kW con 0,05 %; con una tubería real la potencia usa la altura neta (1e-9) y la altura neta es menor que la bruta
- Medido: 838.8 kW (referencia 838.8); con tubería de 0,6 m Hn = 97.10 m y P = 814.4 kW

## B7. Curva de duración de caudales, energía al año y factor de planta — cumple

- Tolerancia: la mediana es Q50 y la curva baja siempre; energía = potencia media × 8 760 h (1e-9); factor de planta entre 0 y 1; con un río enorme frente a la turbina el factor pasa de 0,99
- Medido: Q(50 %) = 1.200000; baja true; E = 5674.0 MWh (media 5674.0); factor 0.528; con río enorme 1.0000

## B8. Turbinas que sirven según la altura neta y el caudal (envolventes de las guías de pequeñas centrales) — cumple

- Tolerancia: Pelton para mucha altura, Kaplan para poca altura y mucho caudal, Michell-Banki para caudales pequeños, Francis en medio; exactamente los tipos esperados en cinco casos
- Medido: 300 m y 0.5 m³/s → francis,pelton; 600 m y 2 m³/s → pelton; 10 m y 5 m³/s → kaplan; 10 m y 1 m³/s → banki,kaplan; 40 m y 0.1 m³/s → banki

## B9. Para bajar el caudal, el variador de velocidad gasta menos que cerrar la válvula — cumple

- Tolerancia: las dos maneras dan el caudal pedido (40 L/s ± 0,01) y el variador ahorra 15 % o más de la potencia
- Medido: válvula abierta al 12.7 %: 40.00 L/s y 23.48 kW; velocidad 88.1 %: 40.00 L/s y 16.36 kW; ahorro 30.3 %

## B10. Herramientas de diseño: datos al azar, diámetro de la impulsión, altura de la bomba, tubería de presión y gráficas — cumple

- Tolerancia: sin excepciones ni valores raros en 1 800 llamadas; el diámetro elegido es el menor con la velocidad pedida; la altura de la bomba deja justo el margen; la tubería de presión es la menor (en pasos de 0,05 m) con 5 % de pérdidas; las seis gráficas se dibujan
- Medido: 1800 llamadas, 0 con valores raros, 0 excepciones; impulsión 0.1982 m true; succión true; tubería de presión 0.65 m true; gráficas true

## B11. Escenas de partida: la bomba sube agua cerca de su mejor punto, no cavita, y la central da energía con su turbina en rango — cumple

- Tolerancia: caudal con eficiencia entre 90 % y 98 % de la máxima (queda margen para el reto); margen de NPSH de 0,5 m o más; la turbina sirve, la central genera y las pérdidas no pasan de 5 %
- Medido: bomba 42.9 L/s al 95.1 % de su mejor eficiencia; margen 0.91 m; central 1227 kW, ahora 718 kW, pérdidas 1.7 %, en rango true

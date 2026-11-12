# Pruebas de la sala «Acueducto: el agua a presión»

Se ejecutan con `npm run test:supply`. Cada prueba declara su tolerancia antes de ejecutarse.

**12 de 12 cumplen.**

## A1. Factor de fricción: Colebrook-White, Swamee-Jain y flujo laminar — cumple

- Tolerancia: Colebrook con Re = 1e5 y ε/D = 1e-4 da 0,0185 (diagrama de Moody, ±0,5 %); la ecuación de Colebrook se cumple (residuo < 1e-10); Swamee-Jain queda a menos de 3 % de Colebrook en su rango (Re 5e3 a 1e7, ε/D 1e-6 a 1e-2); laminar f = 64/Re
- Medido: Colebrook 0.01851; residuo 9.8e-15; mayor diferencia de Swamee-Jain 2.83 %; laminar con Re 1000: 0.0640

## A2. Pérdidas por fricción: Darcy-Weisbach y Hazen-Williams — cumple

- Tolerancia: Hazen-Williams igual a la fórmula a mano (1e-12); en PVC de 6" con 20 L/s, Darcy-Weisbach y Hazen-Williams (C = 150) difieren menos de 15 %; viscosidad del agua a 20 °C 1,004e-6 m²/s y a 12,5 °C entre la de 10 y 15 °C
- Medido: Darcy 3.295 m, Hazen-Williams 3.408 m (diferencia 3.4 %); ν(20) = 1.004e-6, ν(12,5) = 1.223e-6

## A3. Conducción desde el tanque: la ecuación de energía se cierra y la válvula reparte la carga — cumple

- Tolerancia: en la salida, energía = cota + V²/2g + pérdida en la válvula (cierre < 1e-9 m) con cuatro aperturas; la suma de pérdidas y la carga de velocidad es la carga disponible (1e-6); abrir la válvula sube el caudal y baja la presión al final; el K de la válvula baja al abrirla; Hazen-Williams da otro caudal, del mismo orden (±20 %)
- Medido: cierre 2.6e-14 m; con 30 %: Q 14.70 L/s, pérdidas + V²/2g = 44.0000 de 44.0000 m; presión al final 23.1 / 7.7 / 1.5 / 0.1 m; Hazen-Williams Q 13.95 L/s

## A4. La línea piezométrica pasa bajo la loma cuando se abre la válvula — cumple

- Tolerancia: con la válvula abierta la presión mínima es negativa y está en la loma (x = 245 m); con 20 % de apertura toda la tubería queda con presión positiva; la presión estática máxima es la cota del tanque menos la del punto más bajo (1e-12)
- Medido: abierta: mínima -4.13 m en x = 245 m; con 20 %: mínima 5.24 m; estática 44.00 m

## A5. Red del barrio: el método del gradiente y Hardy Cross dan los mismos caudales — cumple

- Tolerancia: en tres horas del día, los caudales de los dos métodos difieren menos de 0,001 L/s; en cada nudo entra lo que sale más la demanda (< 1e-9 L/s); en cada tubo la diferencia de cotas es su pérdida (< 1e-5 m); el gradiente converge en menos de 15 iteraciones
- Medido: mayor diferencia 1.0e-5 L/s; continuidad 3.6e-12 L/s; energía 8.0e-6 m; iteraciones: gradiente 6, Hardy Cross 9

## A6. Mallas cerradas, nudos sin servicio y tubos en paralelo — cumple

- Tolerancia: 4 mallas fundamentales con suma de pérdidas nula (< 1e-5 m); al cerrar la matriz los nueve nudos quedan sin servicio; cerrar un tubo de la red baja la presión mínima; dos tubos en paralelo se reparten el caudal según (D^4,87/L)^(1/1,852) (1e-6)
- Medido: mallas 4, mayor suma 3.5e-6 m; sin servicio 9; presión mínima 28.70 → 19.61 m; reparto 3.30163 (esperado 3.30163)

## A7. Curva de consumo del día — cumple

- Tolerancia: promedio 1 (1e-12); pico entre 1,4 y 1,8 veces el promedio; mínimo de la madrugada menor de 0,5; la interpolación entre horas coincide en las horas enteras
- Medido: promedio 1.000000000000; pico 1.606; mínimo 0.381; f(7) = 1.6060 contra 1.6060

## A8. Celeridad de la onda de presión — cumple

- Tolerancia: igual a la fórmula de Korteweg a mano (1e-9); acero entre 1 000 y 1 300 m/s; PVC entre 300 y 500 m/s; en un tubo muy rígido tiende a √(K/ρ) ≈ 1 480 m/s (±1 %)
- Medido: acero D 0,5 m e 10 mm: 1198.0 m/s (a mano 1198.0); PVC RDE 21: 360.8 m/s; tubo rígido 1481.1 m/s

## A9. Cierre instantáneo: Joukowsky y el periodo 4L/a — cumple

- Tolerancia: sin fricción, la sobrepresión en la válvula es a·V/g (±0,1 %) y la depresión es la misma (±0,1 m); la presión cambia de signo cada 2L/a: el periodo es 4L/a (±2 %); no baja a la presión de vapor
- Medido: a = 1211.2 m/s; sobrepresión 61.731 m contra 61.731 m; mínimo -1.73 m (esperado -1.73); periodo 1.982 s contra 1.982 s; vapor no

## A10. Cierre lento entre Allievi y Michaud; la fricción amortigua; aviso de vapor — cumple

- Tolerancia: con cierres de 5, 10 y 20 veces 2L/a, la sobrepresión calculada queda por debajo de Michaud (2LV/(g·tc), que la sobrestima) y no más de 5 % por debajo de la columna rígida de Allievi; en 30 s, sin fricción la oscilación no cambia (±0,1 %) y con f = 0,02 baja a menos del 90 % de la primera (la fricción permanente amortigua menos que en un tubo real); con 1,5 m/s la depresión llega a la presión de vapor y se avisa
- Medido: 5·2L/a: 7.77 m (Allievi 6.67, Michaud 12.35); 10·2L/a: 3.68 m (Allievi 3.21, Michaud 6.17); 20·2L/a: 1.79 m (Allievi 1.57, Michaud 3.09); oscilación en 30 s: sin fricción 61.73 → 61.73 m, con fricción 62.23 → 52.09 m; vapor con 1,5 m/s: sí

## A11. El golpe de ariete no depende del número de tramos; la válvula cerrada no deja pasar agua — cumple

- Tolerancia: con 20 y con 80 tramos la mayor cota en la válvula difiere menos de 1 %; después del cierre el caudal en la válvula es 0 (1e-12); las clases de PVC convierten bien psi a metros (1 psi = 0,703 m)
- Medido: máximo con 20 tramos 96.21 m, con 80 96.24 m; caudal después del cierre 0; clases RDE 41: 70.3 m, RDE 32.5: 87.9 m, RDE 26: 112.5 m, RDE 21: 140.6 m

## A12. Herramientas de diseño de la sala: sin errores, con los artículos del RAS y sus gráficas — cumple

- Tolerancia: 60 juegos de datos al azar en las siete herramientas: ninguna excepción ni valores NaN, indefinidos o infinitos (salvo los avisos de datos inválidos); un sector de 25 m de desnivel cabe entre los Arts. 61 y 62 y uno de 45 m no; la red de ejemplo revisa el Art. 61; el cierre recomendado deja la presión dentro de la clase del tubo; las siete dibujan su gráfica sin valores inválidos
- Medido: 420 llamadas; excepciones 0; inválidos 0; sector de 25 m: entre 53,0 y 55,0 m; de 45 m: faltan 18,0 m; cierre: 3,3 s; gráficas 7, con errores 0

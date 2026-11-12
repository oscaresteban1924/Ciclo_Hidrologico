# Pruebas de la sala «Medir el agua»

Se ejecutan con `npm run test:measure`. Cada prueba declara su tolerancia antes de ejecutarse.

**10 de 10 cumplen.**

## M1. Relaciones Z-R: ida y vuelta, y Marshall-Palmer con 40 y 50 dBZ — cumple

- Tolerancia: la lluvia vuelve igual desde su reflectividad (1e-9); con Marshall-Palmer, 40 dBZ son 11,53 mm/h y 50 dBZ son 48,6 mm/h (valores de tabla) con 0,5 %
- Medido: ida y vuelta 7.1e-16; 40 dBZ → 11.53 mm/h; 50 dBZ → 48.62 mm/h

## M2. Balancín: la fórmula del tiempo de vuelco contra una simulación vuelco a vuelco, y su corrección — cumple

- Tolerancia: la intensidad de la fórmula y la simulada (pasos de 0,01 s durante una hora) difieren en dos vuelcos (0,4 mm/h) o menos; la corrección devuelve la lluvia real (1e-9)
- Medido: 20 mm/h: fórmula 19.73, simulada 19.60; 80 mm/h: fórmula 75.79, simulada 75.80; 150 mm/h: fórmula 135.85, simulada 135.80; corrección 2.8e-16

## M3. Aguacero triangular: lluvia total, vuelcos y lo que registra el balancín — cumple

- Tolerancia: lluvia total igual a Ip·T/2 = 30 mm (1e-9); los vuelcos nunca bajan; lo registrado es menor que lo real y queda dentro de un vuelco de la integral de la intensidad registrada
- Medido: real 30.000000 mm, registrado 28.00 mm (140 vuelcos), integral 28.168 mm

## M4. Perfil potencial 1/6: su promedio es la velocidad media; la regla de 0,6 y la de 0,2 y 0,8 — cumple

- Tolerancia: el promedio numérico del perfil iguala la media de la vertical con 1e-4; la lectura a 0,6 de la profundidad da 1,0014·v̄ y el promedio a 0,2 y 0,8 da 1,0081·v̄ (valores cerrados) con 1e-9
- Medido: promedio/v̄ = 1.000000; 0,6 → 1.00144; 0,2 y 0,8 → 1.00813

## M5. Área de la sección con el nivel de la orilla y aforo con muchas verticales — cumple

- Tolerancia: el área de las 2 000 franjas iguala la de los trapecios del fondo con 0,1 %; con 60 verticales la sección media se acerca al caudal verdadero con 1 %
- Medido: área 28.097 m² (trapecios 28.097); aforo de 60 verticales 7.883 m³/s, verdadero 7.872

## M6. Curva de gasto: recupera una ley potencial exacta y se ajusta a los aforos de la escena — cumple

- Tolerancia: con datos exactos recupera h0 con 0,01 m, b con 0,01 y a con 1 %; con los aforos de la escena, el mejor h0 queda a 0,1 m del cero real (0,35 m), su error típico es de 6 % o menos y es menor que con h0 = 0
- Medido: exactos: h0 0.30, b 2.2000, a 5.0000; escena: h0 0.41, error 5.4 % (con h0 = 0: 24.2 %)

## M7. Venturi contra Bernoulli y continuidad; ida y vuelta de los dos medidores — cumple

- Tolerancia: Δh = (V2² − V1²)/(2g·C²) con 1e-9; el caudal calculado desde la lectura vuelve al caudal con 1e-6 (en la placa, iterando C)
- Medido: Bernoulli 6.6e-16; ida y vuelta 2.3e-16

## M8. Coeficiente de la placa (ISO 5167-2) y pérdidas permanentes — cumple

- Tolerancia: con Reynolds muy alto C tiende a 0,5961 + 0,0261β² − 0,216β⁸ (1e-4); C baja al subir Re y queda entre 0,59 y 0,64; la pérdida de la placa es una fracción entre 0 y 1 de la lectura que baja con β; la del Venturi es el 10 %
- Medido: asíntota 8.6e-5; baja con Re true; rango true; pérdida de la placa 0.897, 0.732, 0.510; Venturi 0.100

## M9. Herramientas de diseño: datos al azar, medidor de la escena, β que llena la escala, molinete, curva de gasto y gráficas — cumple

- Tolerancia: sin excepciones ni valores raros en 2 100 llamadas; la lectura de ejemplo del Venturi da los 8 L/s de la escena (±0,02); el β elegido deja el caudal máximo dentro de la escala y 0,01 menos no; el molinete de ejemplo da el aforo de la escena con 2 % (vueltas redondeadas); la curva automática usa el mejor h0; las siete gráficas se dibujan
- Medido: 2100 llamadas, 0 con valores raros, 0 excepciones; Venturi 8.003 L/s; β 0.5 true; molinete 7.98 m³/s true; curva true; gráficas true

## M10. Escenas de partida: el pluviómetro marca un poco menos, el radar se equivoca de relación, el aforo es aceptable y los medidores no cavitan — cumple

- Tolerancia: el balancín marca entre 2 % y 8 % menos; el radar (relación estratiforme con lluvia convectiva) se equivoca 10 % o más; el aforo de 8 verticales queda a 5 % o menos; la curva con h0 = 0 tiene más error típico que la mejor; ni el Venturi ni la placa cavitan y las dos lecturas dan el caudal con 1 %
- Medido: balancín -5.0 %; radar -18.8 %; aforo -1.3 %; curva 24.2 % frente a 5.4 %; Venturi 8.003 y placa 8.002 L/s

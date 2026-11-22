# Pruebas del proyecto, el reporte y la comparación con HEC-RAS (sala 2D)

Se ejecutan con `npm run test:project`. Cada prueba declara su tolerancia antes de ejecutarse.

**9 de 9 cumplen.**

## P1. Proyecto guardado y vuelto a abrir — cumple

- Tolerancia: la escena leída es idéntica y no hay avisos
- Medido: 0 avisos; idéntica: sí

## P2. Proyecto con datos inválidos, faltantes y desconocidos — cumple

- Tolerancia: cada dato malo queda en el valor por omisión con su aviso (5 avisos) y no entra nada desconocido
- Medido: 5 avisos: «Tamaño de las celdas [m]» = 7 no es una | «Periodo de retorno [años]» = 37 no es u | Falta «Tiempo al pico [min]»: queda el v | «Peso implícito θ» = 2 está fuera del ra | Se ignoró el dato desconocido «secreto».

## P3. Archivos que no son proyectos de la sala — cumple

- Tolerancia: otro tipo, JSON roto y versión futura se rechazan con un mensaje
- Medido: El archivo no es un proyecto de «E… / El archivo no es un JSON válido.… / El proyecto es de una versión más …

## P4. Comparación con un GeoTIFF idéntico (la profundidad máxima de la propia corrida) — cumple

- Tolerancia: F = 100 %, sin falsas alarmas, sesgo y RMSE < 1 µm
- Medido: F 100.00 %, aciertos 100.0 %, falsas 0.0 %, sesgo 0.0000 m, RMSE 0.0000 m; 4.39 ha mojadas

## P5. Comparación con un GeoTIFF 10 cm más profundo en la zona mojada — cumple

- Tolerancia: misma área (F = 100 %), sesgo sala − HEC-RAS = −0,100 m y RMSE = 0,100 m (± 10 µm)
- Medido: F 100.00 %, aciertos 100.0 %, falsas 0.0 %, sesgo -0.1000 m, RMSE 0.1000 m

## P6. Índices de ajuste contra un conteo independiente — cumple

- Tolerancia: F, aciertos y falsas alarmas iguales al conteo píxel por píxel
- Medido: F 48.03 %, aciertos 85.6 %, falsas 47.8 %, sesgo 0.0000 m, RMSE 0.0000 m (esperado F 48.03 %, aciertos 85.6 %, falsas 47.8 %)

## P7. GeoTIFF a otra resolución y corrido 100 m: ubicación por la georreferencia — cumple

- Tolerancia: compara exactamente los píxeles de la sala que caen dentro del archivo
- Medido: 216000 píxeles comparados (esperados 216000); píxel del archivo 2 m

## P8. GeoTIFF que no se superpone con el valle y archivo dañado — cumple

- Tolerancia: los dos se rechazan con un mensaje claro
- Medido: El GeoTIFF no se superpone con el valle de la sala… / No se pudo leer el archivo como GeoTIFF.

## P9. Reporte HTML de la corrida — cumple

- Tolerancia: página completa con las 5 secciones, hidrograma dibujado, aviso de ejercicio educativo y sin NaN ni undefined
- Medido: 12.4 kB; secciones 5/5; textos rotos: no

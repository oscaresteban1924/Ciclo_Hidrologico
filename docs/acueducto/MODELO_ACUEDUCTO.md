# Sala «Acueducto: el agua a presión»: modelo, supuestos y fuentes

Sala de la aplicación (`src/supply/`, enlace directo `#acueducto`). Tiene tres partes con la distribución de las salas con partes (`src/rooms/RoomLab.tsx`): escena 3D con una pregunta, instrumentos en vivo y controles al pie, y un panel con Esquema, Retos, Experimentos, Diseño, Datos y Docente. Sin WebGL, cada parte muestra su esquema plano con el mismo cálculo.

El cálculo está en módulos sin interfaz: `pipes.ts` (agua, materiales, fricción, conducción por gravedad), `network.ts` (redes: método del gradiente y Hardy Cross), `hammer.ts` (golpe de ariete), `scene.ts` (las escenas ilustrativas) y `design.ts` (herramientas de diseño y sus gráficas). Se prueba en `tests/supply/supply.test.ts` (`npm run test:supply`; informe en `PRUEBAS_ACUEDUCTO.md`).

**Qué es y qué no es.** Es un laboratorio educativo de hidráulica de tuberías. La conducción, el barrio y la tubería del golpe de ariete son **ilustrativos**: no son redes de Medellín ni de ninguna empresa, y los prediseños no son diseños de ingeniería. Los tubos y las flechas se dibujan más gruesos y, en la red, las flechas van seis veces más rápido que el agua (lo dicen las partes); las cotas, las presiones y las columnas de agua van a escala.

## 1. La tubería y su energía

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Viscosidad del agua | tabla de 0 a 40 °C, interpolada (1,004e-6 m²/s a 20 °C) | White, *Fluid Mechanics*, tabla A.1 |
| Materiales | rugosidad ε y C de Hazen-Williams: PVC 0,0015 mm y 150; PEAD 0,007 mm y 150; hierro dúctil con mortero 0,03 mm y 140; acero 0,045 mm y 130; hierro galvanizado 0,15 mm y 120; concreto 0,3 mm y 120 | Saldarriaga (2007), *Hidráulica de tuberías* (valores típicos) |
| Fricción | Darcy-Weisbach hf = f·(L/D)·V²/2g; f de Colebrook-White por iteración; Swamee y Jain (1976) para comparar; laminar 64/Re; transición lineal entre 2 000 y 4 000 | Colebrook (1939); Swamee y Jain (1976) |
| Hazen-Williams | hf = 10,67·L·Q^1,852/(C^1,852·D^4,87) | Fórmula en el SI |
| Accesorios | entrada 0,5; codos de 45° 0,4; válvula de compuerta según su apertura (200 al 10 %, 24 al 25 %, 5,6 al 50 %, 1,15 al 75 %, 0,2 abierta; interpolada en el logaritmo) | Valores típicos (Crane, TP-410) |
| Conducción | el caudal resuelve H0 − z_salida = V²/2g·(1 + ΣK + K_válvula) + hf(Q) por bisección; luego se recorren las líneas de energía y piezométrica | Ecuación de energía |

**La escena.** Tubo de 3" (y otros tres diámetros) de unos 424 m desde un tanque con el agua a 47–60 m hasta una válvula en la cota 6 m, pasando una loma pequeña en x = 245 m. Seis piezómetros (A a F) muestran la presión. Con la válvula abierta, la línea piezométrica pasa por debajo de la loma: la presión es negativa (se avisa; no se calcula la entrada de aire).

**Experimento.** Con las lecturas de los piezómetros B y C (tramo recto, sin accesorios) se despeja f = hf·D·2g/(L·V²) y se compara con Colebrook-White sobre el diagrama de Moody.

## 2. La red del barrio

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Pérdidas | Hazen-Williams, C = 140 | — |
| Método del gradiente | Newton sobre caudales y cotas a la vez | Todini y Pilati (1988); el de EPANET (Rossman, 2000) |
| Hardy Cross | caudales iniciales que cumplen la continuidad (árbol de expansión desde el tanque, cuerdas en cero) y correcciones ΔQ = −Σh/(1,852·Σ\|h/Q\|) en cada malla fundamental | Cross (1936) |
| Curva de consumo | factor hora a hora, promedio 1, pico 1,61 a las 7 h, mínimo 0,38 en la madrugada | Ilustrativa |
| Presiones | dinámica mínima 15 m (10 m hasta 12 500 habitantes; Art. 61); estática máxima 50 m en sistemas nuevos u optimizados (Art. 62) | Res. 0330 de 2017 (RAS) |

**La escena.** Nueve esquinas en tres calles de 130 m y tres carreras de 110 m, en una ladera que baja de la cota 23 a la 11; tubos de 4" en las calles y de 3" en las carreras; una matriz de 8" de 230 m desde un tanque en la loma. Consumos de 2,4 a 4,2 L/s por esquina en promedio. El estudiante cambia la hora, el nivel del tanque, la población de diseño y cierra tubos.

**Experimento.** Hardy Cross iteración por iteración, con su convergencia en escala logarítmica, contra el método del gradiente.

## 3. El golpe de ariete

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Celeridad | a = √((K/ρ)/(1 + K·D/(E·e))), K = 2,19 GPa, ρ = 998 kg/m³ (pared delgada, juntas de expansión) | Korteweg; Chaudhry (2014) |
| Módulos E | acero 207 GPa, hierro dúctil 169 GPa, PVC 2,9 GPa, PEAD 0,9 GPa | Valores típicos |
| Joukowsky | ΔH = a·ΔV/g | Joukowsky (1898) |
| Método de las características | malla regular Δx = a·Δt; tanque de nivel fijo; válvula Q = τ·Q0·√(H/H0) con el área bajando en línea recta durante tc; fricción permanente de Darcy | Wylie y Streeter (1993); Chaudhry (2014) |
| Cierre lento | Michaud ΔH ≈ 2LV/(g·tc) (límite superior) y columna rígida de Allievi ΔH/H0 = (k/2)·(k + √(k² + 4)), k = LV/(gH0·tc) | Clásicas |
| Vapor | presión relativa de −10,1 m: se avisa la separación de columna, que no se modela | — |
| Clases de PVC | RDE 41: 100 psi (70,3 m); RDE 32,5: 125 psi (87,9 m); RDE 26: 160 psi (112,5 m); RDE 21: 200 psi (140,6 m), a 23 °C | Clases usuales por relación diámetro/espesor |

**La escena.** Tubo de 600 m y 300 mm entre un tanque con 60 m de carga y una válvula. La onda se ve como color en el tubo (rojo sube, azul baja, gris sin cambio) y la línea piezométrica, a escala, sobre él. La reproducción dura 24 s y dice si va en cámara lenta o acelerada.

**Experimentos.** Medir el periodo en la gráfica y compararlo con 4L/a; Joukowsky, Michaud y Allievi contra el cálculo en el tiempo.

**Límite conocido.** La fricción permanente amortigua la oscilación menos que en un tubo real (prueba A10: unos 16 % en 30 s con f = 0,02); la fricción no permanente no se modela.

## 4. Herramientas de diseño

| Parte | Calculadora | Prediseñador | Avanzada (universitarios) |
|---|---|---|---|
| La tubería | pérdidas con Darcy-Weisbach y Hazen-Williams, y accesorios | diámetro comercial de PVC de una conducción por gravedad | factor de fricción paso a paso (Colebrook-White) |
| La red | red escrita como texto, resuelta con el método del gradiente, con los Arts. 61 y 62 | cotas del agua del tanque que cumplen los Arts. 61 y 62, o sectorización | — |
| El golpe de ariete | celeridad, Joukowsky, tipo de cierre y el cálculo en el tiempo | menor tiempo de cierre para no pasar la clase del tubo | — |

**Normas citadas.** Resolución 0330 de 2017 (RAS): Art. 56 (velocidad mínima de 0,5 m/s en aducción y conducción, o la que dé un esfuerzo cortante de 1,5 Pa, según la modificación de la Res. 799 de 2021), Art. 58 (sectorización hidráulica), Art. 61 (presiones mínimas) y Art. 62 (presión estática máxima). Los artículos 61 y 62 se verificaron en un concepto de la Superintendencia de Servicios Públicos que los transcribe; los cambios del Art. 56, en el anexo del Ministerio de Vivienda que resume la Res. 799 de 2021. El límite de 3 m/s y las clases de los tubos son criterios usuales, no artículos del RAS. **No se incluyen**: el diámetro mínimo de la red (Art. 63), los factores de mayoración de la demanda ni los artículos sobre golpe de ariete, porque su texto no se pudo leer en esta sesión.

## 5. Verificación

`npm run test:supply` ejecuta doce pruebas (A1 a A12): fricción, pérdidas, cierre de la ecuación de energía, presión negativa en la loma, gradiente contra Hardy Cross, mallas y tubos en paralelo, curva de consumo, celeridad, Joukowsky y el periodo, cierre lento entre Allievi y Michaud con fricción y vapor, independencia de la malla de cálculo, y robustez de las siete herramientas.

## Fuentes

- Chaudhry, M. H. (2014). *Applied Hydraulic Transients* (3.ª ed.). Springer.
- Colebrook, C. F. (1939). Turbulent flow in pipes. *Journal of the ICE*, 11(4), 133–156.
- Cross, H. (1936). Analysis of flow in networks of conduits or conductors. University of Illinois, Bulletin 286.
- Ministerio de Vivienda, Ciudad y Territorio (2017). Resolución 0330 de 2017 (RAS), y Resolución 0799 de 2021.
- Rossman, L. A. (2000). *EPANET 2 Users Manual*. U.S. EPA.
- Saldarriaga, J. (2007). *Hidráulica de tuberías: abastecimiento de agua, redes, riegos*. Alfaomega.
- Swamee, P. K. y Jain, A. K. (1976). Explicit equations for pipe-flow problems. *Journal of the Hydraulics Division*, ASCE, 102(5), 657–664.
- Todini, E. y Pilati, S. (1988). A gradient algorithm for the analysis of pipe networks. En *Computer Applications in Water Supply*, vol. 1, 1–20.
- Wylie, E. B. y Streeter, V. L. (1993). *Fluid Transients in Systems*. Prentice Hall.

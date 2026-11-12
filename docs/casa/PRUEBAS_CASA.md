# Pruebas de la sala «El agua en casa»

Se ejecutan con `npm run test:house`. Cada prueba declara su tolerancia antes de ejecutarse.

**8 de 8 cumplen.**

## H1. Consumo de cada uso a mano, y su reparto en las 24 horas — cumple

- Tolerancia: cada uso igual a la cuenta a mano (1e-9 L); cada perfil horario suma 1 (1e-12); las horas suman el total del día (1e-9 L)
- Medido: diferencia máxima 0.0e+0 L; perfiles 5.6e-16; horas 0.0e+0 L

## H2. Una gota por segundo: la cuenta de la calculadora de goteo del USGS — cumple

- Tolerancia: 86 400 gotas al día, 15 140 gotas por galón y 3,785 L por galón dan unos 21,6 L/día; el valor de la sala queda a 3 % o menos
- Medido: cuenta 21.60 L/día; sala 21 L/día

## H3. Factura: rangos de la CRA (13 y 26 m³), subsidio solo en el básico y contribución en todo — cumple

- Tolerancia: básico + complementario + suntuario = consumo (1e-12); el estrato 4 paga cargo fijo más consumo por la tarifa (1e-6 $); lo que pasa del básico cuesta igual en estrato 1 y 4 (1e-6 $); el estrato 6 paga 1,6 veces el 4 (1e-6 $); la factura siempre sube con el consumo
- Medido: reparto 0.0e+0; estrato 4 0.0e+0 $; fuera del básico 0.0e+0 $; estrato 6 0.0e+0 $; sube true; básico 13, complementario hasta 26

## H4. Lectura del medidor: tambores de metros cúbicos y agujas de décimas a diezmilésimas — cumple

- Tolerancia: los tambores y la parte entera de cada aguja reconstruyen la lectura con 1e-4 m³
- Medido: diferencia máxima 0.0e+0 m³

## H5. Año de lluvia ilustrativo: 365 días que suman la media de cada mes, con dos temporadas de lluvia — cumple

- Tolerancia: cada mes suma su media con 1e-9 mm; 365 días, todos sin lluvia negativa; máximos en mayo y octubre, mínimos en enero y julio
- Medido: diferencia 5.7e-14 mm; 365 días, 253 con lluvia; total 1615 mm; bimodal true

## H6. Tanque de agua lluvia: balance de masa, más tanque nunca atiende menos, y casos límite — cumple

- Tolerancia: lo captado = lo usado + lo que rebosa + el cambio de almacenamiento (1e-9 m³); la fracción atendida no baja al crecer el tanque; con un tanque enorme y poca demanda se atiende todo; sin demanda la fracción es 0 sin valores raros
- Medido: balance 3.4e-13 m³; no baja true; tanque enorme 100.0 %; sin demanda 0

## H7. Herramientas de diseño: datos al azar, tanque mínimo, consumo desde lecturas, fuga nocturna y gráficas — cumple

- Tolerancia: sin excepciones ni valores raros en 480 llamadas; el tanque elegido llega al 80 % y 0,1 m³ menos no; el consumo es la resta de lecturas; la prueba de ejemplo da 12 L/h; las seis gráficas se dibujan
- Medido: 480 llamadas, 0 con valores raros, 0 excepciones; tanque 1.3 m³ true; lecturas true; fuga 12.00 L/h; gráficas true

## H8. Escenas de partida: la casa pasa del básico, la factura sin fuga, el tanque atiende parte; los retos se pueden cumplir — cumple

- Tolerancia: la casa de cuatro personas usa entre 13 y 26 m³ al mes y con aparatos ahorradores queda en el básico; la factura de partida no tiene fuga; el tanque atiende entre 60 % y 80 %; existe un tanque de 3 m³ o menos sin días vacíos
- Medido: casa 17.1 m³ (143 L/persona), con ahorradores 10.4 m³; factura 14.4 m³ con fuga de 0 m³; tanque 76.2 %; sin días vacíos true

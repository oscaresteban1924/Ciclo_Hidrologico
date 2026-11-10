# Cómo reemplazar el sector demostrativo por datos reales de Medellín

## 0. Sectores con datos oficiales incluidos (noviembre de 2026)

La aplicación trae tres sectores construidos con los servicios oficiales de mapas de la Alcaldía de Medellín, los tres sobre **tramos abiertos** de quebradas. El entorno de trabajo no tiene acceso a `www.medellin.gov.co`, así que los datos se consultaron con el navegador integrado del computador del usuario. Las respuestas sin modificar se trajeron al repositorio en `tools/geo/insumos/`, cada una con su SHA-256 verificado. El manifiesto (`tools/geo/insumos/manifiesto.json`) guarda la consulta exacta de cada archivo (tres paquetes de descarga).

| Insumo | Servicio | Uso |
|---|---|---|
| Terreno | `ServiciosImagen/Modelo_digital_de_elevacion_medellin_2024/ImageServer` (1 m, EPSG:9377, modelo de terreno: las construcciones no aparecen como relieve) | Malla de cálculo de 1 m, sin remuestrear |
| Ortofoto | `ServiciosImagen/Ortofoto_Medellin_2024/ImageServer` (0,25 m) | Se pinta sobre el terreno y los techos en la vista realista (botón «Foto aérea»); coberturas vegetales y árboles del dibujo |
| Cuenca | `ServiciosImagen/Modelo_digital_de_elevacion_AMVA/ImageServer` (10 m; 5 m en Juan Bobo) | Delineación de la cuenca hasta la entrada del sector |
| Construcciones | `ServiciosCiudad/CartografiaBase/MapServer/15` (Construccion) | Huellas; altura = número de pisos × 3 m (estimada) |
| Vías | `ServiciosCiudad/CartografiaBase/MapServer/14` (Vias Medellin) | Ejes; calzada estimada de 5 m (3 m en las de menor jerarquía) |
| Quebrada | `ServiciosCiudad/CartografiaBase/MapServer/27` (Hidrografia POT, escala 1:25 000) | Eje llevado al fondo del cauce del modelo de elevación |

El constructor `tools/geo/sector_real.py` genera los escenarios en `src/city/scenarios/reales/` (la delineación de la cuenca está en `tools/geo/cuenca.py`):

```bash
python3 -I tools/geo/sector_real.py --site la-iguana-el-pesebre --out src/city/scenarios/reales/la-iguana-el-pesebre.json
```

| Sector | Dominio (EPSG:9377, 150 × 120 m) | Cauce abierto | Cuenca hasta el sector | Sección de control |
|---|---|---|---|---|
| Andalucía · Juan Bobo (Santa Cruz, comuna 2) | 4717256–4717406 E, 2254459–2254579 N | 97 % de las secciones | 0,133 km², 840 m, pendiente 30 % | cauce lleno a 1,61 m (pie de una casa); capacidad 36,5 m³/s; pendiente 20 % |
| La Iguaná · El Pesebre (límite de las comunas 13 y 7) | 4712140–4712290 E, 2252060–2252180 N | 86 % | 42,7 km², 12,9 km, pendiente 41 % | cauce lleno a 2,16 m (terreno a 10 m del fondo); capacidad 150 m³/s; pendiente 6,4 % |
| Ana Díaz · El Corazón (San Javier, comuna 13) | 4709827–4709977 E, 2248823–2248943 N | 100 % | 7,21 km², 6,0 km, pendiente 54 % | cauce lleno a 0,50 m (la estimación dio 0,13 m por una casa a 2 m del fondo; se usa el mínimo de 0,5 m); capacidad 6,8 m³/s |

Se simula la quebrada si al menos el 80 % de las secciones, cada 5 m, tienen las dos orillas por lo menos 1 m sobre el fondo en 15 m. Los sectores anteriores de Blanquizal y El Corazón se reemplazaron: allí la quebrada pasa cubierta bajo las casas y no hay datos de esas coberturas.

**Acondicionamiento del terreno (queda registrado en la procedencia de cada escenario):**
- **Eje de la quebrada.** El eje POT se lleva al fondo del cauce: la cota mínima en ±8 m perpendiculares, suavizada (desplazamiento medio de 1,6 a 3,4 m).
- **Paso del agua por el cauce.** Donde el perfil del fondo sube aguas abajo, se rebaja el fondo a lo largo de 2 m de ancho para que el agua siga (vías sobre coberturas o puentes que el modelo de terreno no distingue). No se dibuja ninguna obra.
- **Depresiones sin salida.** Terrazas y patios cerrados entre construcciones (en la realidad se desaguan por tuberías) se rellenan con inundación por prioridad (Barnes et al., 2014), con las construcciones como muros: 424 a 796 celdas por sector. El compilador repite el relleno con la malla de cálculo ya rasterizada, desde las salidas, para quitar los pozos de una o dos celdas que deja la diferencia entre las dos rasterizaciones (4 a 90 celdas; `fillCells` y `fillVolume`).
- **Patios interiores cerrados.** Las celdas libres rodeadas por construcciones se tratan como parte de la construcción vecina; su lluvia sale por la bajante (`closePockets`).

**Sección de control.** Entre las estaciones de la mitad central del tramo donde el eje forma menos de 16° con una fila o columna de la malla (para que la sección del modelo cruce el cauce), se elige la de menor profundidad de cauce lleno (mediana móvil de 5 m): donde la quebrada se sale primero. En cada orilla, el cauce lleno llega hasta el borde de una terraza (después de un talud que sube más de 0,3 m por metro, los 3 m siguientes suben menos de 0,45 m), el pie de una construcción o el terreno a 10 m del fondo, lo primero que aparezca; manda la orilla más baja (entre 0,5 y 4 m). El escenario guarda `flowAxis` y `bankDepthM`; el compilador busca las orillas sobre la malla donde el terreno o una construcción alcanzan ese nivel y corrige la capacidad por el ángulo entre el cauce y la malla.

**Creciente de su cuenca.** La cuenca hasta la entrada del sector se delinea con D8 sobre el modelo de elevación del AMVA (con relleno de depresiones); su área, longitud hidráulica y pendiente alimentan el hidrograma del NRCS (MODELO.md, 6.7). La estación de nivel es didáctica, a mitad de la longitud hidráulica (al menos 300 m). En Juan Bobo la cuenca es muy pequeña: con 80 mm en una hora el pico es de 2 m³/s, el 6 % de la capacidad; el agua que llega a las casas viene de la lluvia en el barrio y de las laderas, no de la quebrada. En La Iguaná, con 60 mm en una hora el pico llega a unos 159 m³/s, por encima de la capacidad de la sección.

**Agua de las laderas vecinas.** La misma delineación da, para cada tramo de borde del sector, el área de fuera que drena hacia adentro. Las entradas de 200 m² o más se convierten en entradas de escorrentía con el método racional (C = 0,75): mientras llueve entra `C·i·A`. El compilador reparte cada entrada en las celdas de borde libres, comunicadas con el resto del barrio y con el terreno bajando hacia adentro (al menos una celda por cada 2000 m², entre 5 y 20), ampliando el tramo hasta 15 m a cada lado; esas celdas dejan de ser salidas. Juan Bobo recibe 1,61 ha; La Iguaná, 11,74 ha; Ana Díaz, 4,59 ha.

**Cómo se ve.** La ortofoto de 2024 (recortada al dominio, JPEG incrustado en el escenario) se pinta sobre el terreno y los techos en la vista realista; los accesorios inventados de los techos (tanques, ropa, rejas) se ocultan mientras está activa. Los árboles del dibujo salen de la ortofoto: celdas con índice de exceso de verde (2g − r − b) mayor de 0,1 y brillo bajo.

**Resultados de referencia** (60 mm/h durante 20 min, 25 min simulados; pruebas D1 y D2): sin el agua de las laderas, ninguna edificación queda con 10 cm o más contra los muros solo por la lluvia del sector; con ella, 1 en Juan Bobo, 6 en La Iguaná (una manzana donde entra la escorrentía de 1,4 ha de ladera) y 0 en Ana Díaz. El balance cierra con residuo menor de 10⁻¹⁴.

**Lo que no se incluye ni se inventa:** red de alcantarillado, sumideros, coberturas, puentes y bordillos. Las coberturas del suelo son estimadas (pasto y árboles desde la ortofoto, vías como asfalto, el resto concreto). La cobertura de la cuenca y la lluvia pareja en toda la cuenca son supuestos; el resultado no es un pronóstico.

## 1. Qué está listo

- `tools/geo/medellin_pipeline.py`: pipeline reproducible que produce un archivo de escenario (`medellin-lluvia/escenario` v1).
- `tools/geo/test_pipeline.py`: prueba sin red. Imita el MapServer, con paginación y geometrías defectuosas, y valida el resultado con el código de la aplicación. Último resultado: `docs/medellin/pipeline-test.json`.
- La aplicación: pestaña **Docente → Configuración → Importar configuración o escenario**. Valida el archivo y, si es válido, el sector aparece en el valle con posición aproximada (a partir de `lonLat`) y en la lista de sectores.

## 2. Qué no se pudo hacer en este entorno

El servicio `https://www.medellin.gov.co/servidormapas/rest/services/mapas_nacionales/VM_Cartografia_City_Urban_2022/MapServer/9` **no fue accesible** desde el entorno de trabajo: el proxy respondió 403. Por eso:
- no se verificaron sus metadatos reales (campos, CRS, `maxRecordCount`);
- no se descargó ningún dato.

La verificación del CRS queda **pendiente** y debe hacerla alguien con acceso. El pipeline ya la hace por su cuenta y se detiene si encuentra una inconsistencia que no se haya decidido de forma explícita.

## 3. Verificación del sistema de referencia

La descripción de la capa menciona WGS84/UTM 18N, pero la referencia publicada puede ser **EPSG:9377** (MAGNA-SIRGAS 2018 / Origen-Nacional: Mercator Transversal, lat₀ 4°, lon₀ −73°, k 0,9992, FE 5 000 000, FN 2 000 000). El pipeline hace estas comprobaciones:
1. Lee `spatialReference` (`latestWkid` o `wkid`, y si no hay, `wkt`) de `?f=pjson`.
2. Compara ese valor con la descripción y deja una advertencia si no coinciden.
3. Pide los datos con `outSR=9377`, para que el servidor entregue todo en el mismo sistema.
4. Convierte el centro del sector a longitud y latitud y comprueba que caiga dentro de Medellín. Si no cae, se detiene.

Para una verificación independiente, se recomienda comparar un vértice de una edificación conocida con un punto de control de la cartografía oficial.

## 4. Pasos

```bash
# 1) Entorno
pip install pyproj shapely          # y opcionalmente rasterio para DEM GeoTIFF

# 2) DEM del sector: recórtelo antes; anote su resolución, su datum vertical y su exactitud
#    (el pipeline lee GeoTIFF con rasterio, o ASCII Grid .asc en EPSG:9377 sin dependencias)

# 3) Ejecutar con una caja pequeña (≤ 600 m por lado)
python3 tools/geo/medellin_pipeline.py \
  --layer https://www.medellin.gov.co/servidormapas/rest/services/mapas_nacionales/VM_Cartografia_City_Urban_2022/MapServer/9 \
  --bbox -75.5795 6.2440 -75.5775 6.2458 --bbox-crs EPSG:4326 \
  --dem dem_sector.tif --dem-datum "…" --dem-vertical-accuracy "…" \
  --outlet E:20:40:0.03 \
  --id mi-sector --title "Mi sector" --out mi-sector.json

# 4) Probar el archivo con el motor de la aplicación
npx tsx tests/city/scenario-check.ts mi-sector.json

# 5) Importarlo en la aplicación: Docente → Configuración → Importar
```

## 5. Qué hace el pipeline, paso a paso

| Paso | Detalle | Trazabilidad |
|---|---|---|
| Consulta acotada | Pide solo la caja del sector (`esriGeometryEnvelope`), con `resultOffset` y `resultRecordCount` según `maxRecordCount`, en orden por OID. Se detiene si el sector supera el máximo de registros. | Guarda cada página en `cache-pipeline/` con su SHA-256 en `pipelinePages`. |
| Geometría | `make_valid`; separación de multipolígonos; descarte de astillas de menos de 4 m²; recorte a la caja; simplificación de 0,2 m. | Las cifras de cada operación quedan en `pipelineLog`. |
| Alturas | Usa `agl` si está entre 2 y 250 m. Si no, usa `n_pisos` × 3 m (estimado). Si tampoco hay, usa 6 m (sin dato). | Cada edificio guarda `attrs`, y el resumen de alturas queda en la procedencia. |
| Terreno | Remuestreo bilineal a la malla del sector. | Resolución, CRS, datum vertical y exactitud quedan en `terrain` y en la procedencia. |
| Apoyo en el terreno | La base de cada edificio es la cota mínima bajo su huella; la calcula la aplicación al compilar. | — |
| Coordenadas locales | Origen en la esquina suroeste del sector, en EPSG:9377 y en metros. | `extent.origin`, `extent.lonLat`. |
| OSM (opcional) | Vías (con ancho estimado) y zonas verdes, a partir de un GeoJSON local. | Atribución «© colaboradores de OpenStreetMap, ODbL». |
| Sumideros, bordillos y tuberías | **No se inventan.** Solo se agregan sumideros con `--hypothetical-inlets`, y quedan marcados como «hipotético». | Capa con `kind: 'hipotetico'`. |
| Salidas | Las define quien ejecuta el pipeline (`--outlet`). Son obligatorias. | `kind: 'estimado'`. |

## 6. Al usar el escenario en clase

La aplicación muestra la insignia «Datos reales con elementos estimados» y, en la pestaña Docente, el tipo de cada capa. Recuerde: aunque los edificios y el terreno sean reales, **los parámetros hidráulicos son estimados y la red de drenaje no está levantada**. El resultado sigue siendo educativo.

## 7. Reemplazar la vista general del valle por datos oficiales

La vista general del Valle de Aburrá se dibuja desde una tabla de referencia **aproximada** (`src/city/render/aburra.ts`; ver `MODELO.md`, sección 6.2). Se escribió a mano porque, desde el entorno de trabajo, el proxy rechazó los servicios de elevación (teselas de relieve, OpenTopography, Copernicus) y de OpenStreetMap (teselas y Overpass). No se descargó ningún dato.

Para reemplazarla, no hace falta descargar toda la ciudad. Basta con un DEM grueso del valle y unas pocas capas lineales:

| Insumo | Resolución o forma sugerida | Dónde se conecta |
|---|---|---|
| DEM del valle, de Caldas a Copacabana (≈ 22 × 29 km) | 30 m (por ejemplo, Copernicus GLO-30 o el DEM oficial del AMVA), remuestreado a 100 m: ≈ 64 000 valores | `valleyZ(x, y)`: reemplazar la función por una lectura bilineal del ráster, en las mismas coordenadas en km |
| Eje del río Medellín | Polilínea | `RIVER` (lon, lat y cota) |
| Líneas del metro, del tranvía y de los cables, con estaciones | Polilíneas y puntos | `METRO_A`, `METRO_B`, `TRANVIA`, `CABLES` |
| Quebradas principales | Polilíneas | `creeks()` |
| Perímetro urbano y comunas | Polígonos | `fabricAt(x, y, z)`: la zona de cada punto saldría del polígono que lo contiene |

La misma tabla dibuja, a escala 1:1, el entorno de cada sector: al reemplazarla, también el entorno pasa a usar los datos oficiales, y un escenario de datos reales con `extent.lonLat` se dibuja en su lugar del valle. Si se reemplaza la tabla, las pruebas V7 y V8 siguen sirviendo como control: el río debe bajar de sur a norte y las estaciones del metro deben quedar cerca de su cota. La atribución de cada fuente debe agregarse al encabezado de la vista y a la pestaña Docente.

## 8. Servicios oficiales de la Alcaldía de Medellín: lo que se revisó y lo que falta

Se pidió usar diez servicios del servidor de mapas de la Alcaldía para hacer más robusta la modelación. Sus **metadatos** se leyeron el 9 de noviembre de 2026 con el lector web. Los **datos** no se pudieron descargar: el proxy del entorno de trabajo rechaza `www.medellin.gov.co` (403, comprobado dos veces). Nada de lo que hoy dibuja o calcula la aplicación sale de estos servicios.

Todos usan **EPSG:9377** (MAGNA-SIRGAS 2018 / Origen-Nacional), el mismo sistema de salida del pipeline.

| Servicio (`…/rest/services/…`) | Qué es | Campos útiles | Uso previsto |
|---|---|---|---|
| `ServiciosCiudad/CartografiaBase/MapServer/15` | Construcciones (polígonos) | `numero_pisos`, `numero_sotanos`, `numero_mezanines`, `tipo_construccion`, `area_construida`, `cbml`, `id_construccion` | Huellas y alturas de un sector de datos reales (pipeline). Barrio alrededor de los sectores con sus edificios reales. |
| `…/MapServer/14` | Vías de Medellín (líneas) | `tipo_via`, `nombre_comun`, `jerarquia_via`, `importancia`, `comuna` | Calzadas del sector y calles del entorno. |
| `…/MapServer/13` | Vías urbanas y rurales (líneas) | `clasificacion_via`, `jerarquizacion_via`, `retiro`, `estado` | Complemento de la anterior fuera del área urbana. |
| `…/MapServer/25` | Red hídrica (líneas) | `JERARQUIA`, `NOMBRE` | Quebradas del valle y del entorno. |
| `…/MapServer/27` | Hidrografía del POT (líneas; Resolución DAP 126 de 2016) | `jerarquia`, `nombre` | Cauces y retiros cerca de cada sector. |
| `…/MapServer/6` | Ríos (polígonos) | `nombre` | Cauce del río Medellín. |
| `…/MapServer/9` | Barrios y veredas (polígonos) | `codigo`, `nombre`, `nombre_comuna_corregimiento` | Rótulos de barrio y comuna; tejido urbano. |
| `…/MapServer/18` | Equipamientos (polígonos) | `nombre`, `tipo`, `categoria`, `nom_barrio` | Colegios, centros de salud y otros hitos cercanos. |
| `…/MapServer/17` | Espacio público existente (polígonos) | `nombre`, `categoria`, `subcategoria` | Parques y zonas verdes (coberturas permeables). |
| `ServiciosImagen/Ortofoto_Medellin_2024/ImageServer` | Ortofoto 2024 | 0,08 m por píxel, 5 bandas de 8 bits; exportación de hasta 4 100 × 4 100 píxeles | Textura del suelo alrededor de cada sector. |
| `ServiciosImagen/Modelo_digital_de_elevacion_medellin_2024/ImageServer` | Modelo digital de elevación 2024 | 1 m por píxel, 1 banda de 32 bits en coma flotante, cotas de 1 143 a 3 141 m; exportación de hasta 15 000 × 4 100 píxeles | Relieve real del valle (reemplaza `valleyZ`) y del terreno de un sector de datos reales (`--dem` del pipeline). |

Las capas vectoriales entregan hasta 2 000 registros por consulta; el pipeline pide la caja del sector por páginas. Ninguna trae sumideros, tuberías ni bordillos: el pipeline no los inventa.

**Ya adaptado.** El pipeline lee el esquema de la capa de construcciones: altura = `numero_pisos` × 3 m, marcada como **estimada**; sin dato, 6 m, marcados como **supuestos**. Conserva `cbml`, `tipo_construccion` y los demás atributos en cada edificio. `tools/geo/test_pipeline.py` lo prueba con una capa simulada con ese esquema: 14 de 14 comprobaciones cumplen.

**Qué se descargaría, sin bajar toda la ciudad.**
- **Valle:** el DEM a 25 m (1 115 × 958 valores, una sola exportación) y, generalizadas, las capas de ríos, red hídrica y barrios.
- **Alrededor de cada sector:** una caja de unos 3 × 3 km con el DEM a 1 m, las construcciones, las vías y el espacio público, y la ortofoto a 0,5–1 m.

**Cómo seguir.**
1. Habilitar `www.medellin.gov.co` en el acceso a red del entorno de trabajo.
2. O descargar desde un navegador las dos exportaciones del DEM y adjuntarlas. Para la caja de los dos sectores de laboratorio:

```text
…/Modelo_digital_de_elevacion_medellin_2024/ImageServer/exportImage?bbox=4712700,2252570,4715700,2255740&bboxSR=9377&imageSR=9377&size=3000,3170&format=tiff&pixelType=F32&interpolation=RSP_BilinearInterpolation&f=image
```

Para el valle, la misma consulta con `bbox=4698974,2239446,4726835,2263390` y `size=1115,958`.

El DEM es del municipio de Medellín. Fuera de él (Bello, Itagüí, Envigado y los demás municipios del valle), el relieve seguiría siendo el de la tabla de referencia, fundido en el borde, y así se rotularía.

**Alcantarillado en escenarios de datos reales.** Los dos sectores didácticos tienen una red separada trazada con criterios de EPM, pero esa red es inventada para enseñar. Por eso el pipeline **no** genera una red para un sector real: un escenario importado usa la red esquemática, salvo que alguien agregue en el campo `sewer` una red levantada (catastro de redes de EPM), con su procedencia. El formato del escenario acepta esa red: nodos con cota de batea, tramos con diámetro, material y bateas, sumideros con su caja y aportes de aguas residuales. La aplicación la valida al compilar: rechaza tramos que unan los dos sistemas y bateas por debajo del fondo de su nodo.

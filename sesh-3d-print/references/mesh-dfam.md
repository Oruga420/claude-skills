# Inspección, reparación y diseño FDM

## Qué medir y cómo interpretar

| Comprobación | Evidencia necesaria | Límite de la conclusión |
| --- | --- | --- |
| Escala | Dimensión conocida y caja de la exportación en mm | STL no guarda unidades; una caja plausible no las confirma |
| Topología | Bordes abiertos, incidencia, winding, duplicados, degenerados y componentes | Bordes correctos no descartan autointersecciones ni vértices no manifold |
| Paredes y rasgos finos | Secciones/medidas de la geometría final y líneas de extrusión en capas | Un muestreo de rayos puede omitir mínimos; no confundir distancia a otra pieza con espesor |
| Encajes | Medidas de ambas superficies y cupón con mismo perfil/orientación | Medida CAD no prueba la holgura real impresa |
| Orientación | Contacto con placa, dirección de carga, detalle, altura y capas con voladizos | Menor área inclinada no garantiza menos soportes ni más resistencia |
| Volumen | Superficies cerradas, orientadas y sin intersecciones | Volumen de malla no equivale a consumo: infill, soportes y purgas lo cambian |

Ejecuta `stl_audit.py` con unidades confirmadas. Conecta vértices por igualdad exacta de coordenadas: no redondea ni suelda puntos próximos. Dos vértices muy cercanos pero distintos conservan su separación. Esto evita cerrar grietas y encajes por accidente, pero puede mostrar un borde abierto debido a ruido numérico. Compruébalo antes de decidir un umbral de soldadura.

El informe mantiene `not_checked` para las comprobaciones que faltan. El ajuste a `--bed-mm` es sólo una comparación X/Y/Z de la caja; excluye zonas prohibidas, brim, torre de purga, clips, secuencia y colisiones. El número de componentes usa adyacencia por bordes, no una prueba de sólidos independientes. No sumes volúmenes firmados como volumen físico cuando hay cavidades, piezas anidadas o intersecciones.

## Reparación dirigida

1. Localiza el defecto sobre una copia y determina la intención de la zona. Un conducto, borde de carcasa sin tapa o componente separado puede ser deliberado.
2. Quita sólo geometría sobrante identificada. Elimina caras duplicadas y elementos sin área cuando no tengan función. Selecciona vértices/bordes problemáticos antes de Merge by Distance; usa un umbral menor que la separación útil más pequeña y registra cuánto mueve o elimina.
3. Rellena únicamente aperturas accidentales con una superficie adecuada. Un n-gon no plano puede triangularse mal; revisa su triangulación y continuidad. No tapes agujeros para tornillos ni respiraderos por buscar un contador en cero.
4. Recalcula la orientación sobre superficies cuya intención interior/exterior sea conocida. Un componente cerrado con volumen negativo puede ser una cavidad; no lo inviertas automáticamente.
5. Para superficies que se cruzan, decide entre unión, separación o recorte. Remesh y Boolean pueden alterar dimensiones, aristas y detalles: conserva la fuente y compara cotas críticas.
6. Vuelve a exportar, auditar y revisar secciones. Informa defectos restantes y mediciones que no se pudieron hacer.

## Paredes, tolerancias y apoyos

No fijes un mínimo universal de pared o de holgura. Selecciona límites a partir del perfil/material/boquilla y de calibraciones reales del usuario. Expresa su procedencia. En una pared planificada para varias líneas, comprueba en el slicer cuántas líneas se generan y su ancho efectivo; la anchura de extrusión puede diferir del diámetro de la boquilla. Revisa paredes curvas, puntas, relieves, textos y cantos por separado.

Para un encaje, compara al menos dos holguras candidatas mediante un cupón pequeño que conserve material, dirección de capas y orientación de la pieza final. Define aceptación: entra libre, requiere presión o debe retener bajo una carga especificada. No compenses globalmente un STL para arreglar un agujero si eso cambia los centros o el tamaño exterior.

Compara orientaciones concretas por apoyo estable, carga respecto a capas, soportes y acceso para retirarlos, acabado de caras importantes, altura y huella total. Un ángulo «45 grados» sin convención es ambiguo: indica si se mide desde vertical o desde la placa. Los puentes entre apoyos no se comportan igual que voladizos. Verifica capas reales con el material/perfil elegido.

Si falta software para medir paredes o autointersecciones, registra «no medido» y utiliza secciones manuales locales donde sea posible. No presentes un render o un reporte de caja como sustituto. Un informe parcial es una entrega válida si el límite queda explícito y no se declara aptitud física.

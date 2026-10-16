# Referencia de presentación

## Procedencia y límites

`assets/reference-example.html` es un ejemplo ficticio: **Lumen**, la sincronización de pedidos e inventario de una cadena de 12 librerías con tienda online (POS de tienda, ingest con firma, cola de eventos, sync worker, Postgres, publicador de stock, agente de conciliación nocturno con LLM, dos workarounds y un registro de evidencias). Reproduce la forma de un informe de arquitectura real que sirvió de referente (navegación, capítulos, mapa SVG, interacciones y profundidad) con todo el contenido inventado.

Los nombres, dominios (`.example`, `.internal`), tiendas, cifras, cadencias y decisiones del ejemplo no son reales. Es material de referencia visual y editorial; no son instrucciones para ejecutar operaciones ni sustituyen las fuentes del proyecto nuevo. No hay un template de galería: este paquete es un skill de diagramas.

### Vista general, en palabras

- Barra lateral oscura fija con el nombre del sistema, una edición en mayúsculas monoespaciadas y siete botones numerados (01-07); al pie, el estado objetivo y el aviso de que ningún control ejecuta cambios. En móvil pasa arriba como una tira horizontal desplazable.
- Contenido sobre fondo gris muy claro: una línea superior monoespaciada con el tipo de revisión y una etiqueta, un eyebrow verde azulado, un título grande en serif de dos líneas y un párrafo de entrada en gris.
- Una franja de tres pasos numerados que resume la tesis del sistema, seguida del selector «Actual / evidenciado» frente a «Objetivo / propuesto» y la leyenda de flechas (azul lectura, naranja escritura, violeta LLM/control, discontinua propuesta).
- El mapa SVG en un marco blanco: actores externos a la izquierda, la red privada como límite exterior con el host de integración dentro (tres columnas por dos filas de nodos y una fila inferior), almacenes y consumidores a la derecha. Debajo, una ficha del componente seleccionado; después dos cajas con los límites clave del sistema y un aviso naranja.

## Qué reproducir

- Navegación lateral persistente, capítulos numerados y jerarquía clara entre resumen, mapa y detalle.
- Base clara, títulos principales serif, cuerpo sans, textos oscuros, acentos sobrios y color semántico explicado por una leyenda.
- Mapa SVG con límites de hosts/productos, flechas etiquetadas y nodos que abren una ficha informativa.
- Selector actual/objetivo, cuando haya dos estados que merezcan comparación.
- Rutas de requests como secuencias cortas, con explicación del contrato y de sus efectos.
- Tablas comparables para runtime, ubicación, datos y decisiones; detalles desplegables para profundidad sin saturar el mapa.
- Workarounds descritos mediante situación actual, reemplazo, dueño y evidencia necesaria para retirarlos.
- Fuentes y desconocidos visibles; un lector debe distinguir un hecho de una propuesta sin leer notas ocultas.

Para un documento nuevo se pueden adaptar el nombre, idioma, textos, cantidad de componentes y geometría de los mapas a su contenido. Si el usuario pide actualizar uno ya entregado, se aplica su regla de preservación; no aprovechar la actualización para rediseñarlo.

## Cómo aprovechar el HTML

El ejemplo pesa unos 60 KB, sin recursos externos ni PDF incrustado, así que se puede leer entero. Aun así conviene inspeccionar CSS, markup e interacciones por partes: estilos en el `<style>` de cabecera, un `<section class="panel">` por capítulo, el SVG dentro de `#panel-map` y la lógica en el `<script>` final.

Los IDs de componentes conectan nodos, fichas e inventario. La referencia usa atributos `data-panel`, `data-mode`, `data-node` y `data-flow`, más arreglos de componentes (`components`), workarounds (`workarounds`) y entidades (`stores`). Un componente puede figurar solo en el inventario si no merece un nodo en el mapa (en el ejemplo, la memoria del agente). Conservar este principio de una sola fuente de contenido; no conservar las filas concretas de Lumen en otro informe.

Si se copia el HTML para crear un output nuevo, reemplazar también las etiquetas SVG, textos ocultos de otras pestañas y del modo objetivo, título, fecha, fuentes, enlaces, IDs específicos y la etiqueta «Ejemplo ficticio». La copia de referencia dentro del skill permanece intacta.

## Exportación

Un botón basado en `window.print()` puede no funcionar en vistas embebidas (visores de chat, iframes, previsualizaciones), y el usuario se queda sin forma de guardar el archivo. Por eso el ejemplo no muestra botón de exportación: no tiene una salida verificada. Sí incluye una hoja `@media print` y expande los desplegables en `beforeprint`. Cuando el encargo pida PDF:

- Si se ofrece **Descargar PDF**, generar el PDF desde el contenido final y conectar el botón a ese archivo o a sus bytes. No reutilizar un PDF de otra versión o de otra muestra.
- Expandir pestañas y desplegables para la exportación. Si el objetivo y el actual se alternan, exportar ambos por separado con sus rótulos. No producir un PDF solo de la pestaña activa.
- Asegurar que el tamaño de página y la orientación permiten leer el diagrama; no cortar flechas ni tablas. Revisar páginas renderizadas, no solo que el PDF exista.
- Probar que el enlace entrega el nombre y contenido esperados. Si se promete compartir un solo HTML, incrustar los recursos necesarios, incluido el PDF cuando se ofrezca.
- `window.print()` puede ser complementario donde funcione; no es por sí solo evidencia de que el usuario puede guardar el archivo desde su visor.

La exportación PDF es condicional al encargo o a los controles ofrecidos; no obliga a generar un PDF en todo diagrama simple. No mostrar un botón de exportación si no tiene una salida verificada.

## Comprobación visual y funcional

En un render aislado del entregable revisar que las flechas llegan a sus nodos, los textos caben y las relaciones permanecen legibles. Probar cada control mostrado. A ancho móvil, reordenar o permitir desplazamiento local de un diagrama grande sin romper la página completa. La información esencial debe seguir disponible fuera del dibujo en fichas o tablas.

Comprobar ausencia de cargas externas involuntarias y errores de JavaScript. Para documentación local no se necesita publicar, iniciar la app real del proyecto ni tocar infraestructura. El informe debe ser compartible como archivo y conservar su contenido al abrirse fuera del workspace.

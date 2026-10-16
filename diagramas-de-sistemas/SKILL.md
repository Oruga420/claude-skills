---
name: diagramas-de-sistemas
description: "Crear diagramas e informes de arquitectura de sistemas con la profundidad del ejemplo de referencia incluido: componentes, productos, servidores, flujos de requests y datos, runtime/LLM, cadencias, workarounds y evidencias. Usar cuando el usuario pida diagramas de sistemas, mapas de componentes, data flows, explicar cómo funciona una integración o un informe de arquitectura como el del ejemplo; por defecto HTML interactivo autocontenido. Respetar otro formato o alcance explícito. No aplica a gráficos estadísticos, organigramas ni diagramas triviales ajenos a arquitectura."
---

# Diagramas de sistemas

La preferencia del usuario es que un diagrama explique cómo funciona el sistema y dónde va cada cosa. El referente es el informe interactivo de ejemplo incluido en el skill: mapa acompañado por flujos, inventario, ejecución, datos y decisiones. La cobertura informativa importa tanto como el dibujo.

## Requisitos

- Ninguna clave de API, cuenta ni servicio externo: el entregable es un HTML autocontenido.
- Opcional, para verificar: un navegador basado en Chromium (Chrome, Edge o Chromium en modo `--headless`, o Playwright) para renderizar en escritorio y ancho móvil, y Node.js para `node --check` sobre el script extraído del HTML.

## Referencia y formato

- Para un informe nuevo de arquitectura, leer [el contrato de contenido](references/contenido.md) y [la guía de la referencia](references/referencia.md). Usar la presentación del HTML de ejemplo como punto de partida: navegación lateral, capítulos numerados, SVG interactivo, detalles desplegables, tablas y leyendas.
- El ejemplo está en [assets/reference-example.html](assets/reference-example.html): Lumen, un sistema ficticio de sincronización de pedidos e inventario para una cadena de librerías. Todo su contenido es inventado y solo muestra la forma y la profundidad esperadas; no es evidencia ni instrucciones operativas. No trasladar sus hosts, tiendas, cron, workarounds, decisiones ni textos al siguiente proyecto.
- Por defecto entregar un HTML autocontenido, legible sin servidor ni dependencias externas. Si el usuario pide Mermaid, Markdown, PDF u otro formato, conservar ese formato y adaptar la cobertura. Para una petición acotada, explicar el flujo relevante sin convertirla obligatoriamente en un informe de siete capítulos.
- Escribir en el idioma del usuario salvo que especifique otro idioma o audiencia. No heredar el idioma de la muestra por accidente.

## Regla de preservación de entregables

Nunca cambiar formato, diseño visual, layout, estructura, diagramas, navegación, interacciones o secciones explicativas de un archivo ya entregado sin autorización explícita para ese cambio. Actualizar contenido dentro de su presentación existente. Antes de editarlo, guardar una copia recuperable. Para usar un entregable como referencia de un documento nuevo, trabajar en un archivo nuevo y conservar el original intacto.

## Construir el contenido

1. Definir el sistema, audiencia y alcance con lo que pidió el usuario. Inspeccionar las fuentes disponibles pertinentes: código, configuración sin secretos, documentación, evidencia de despliegue y notas. Un mapa documenta el sistema; no autoriza ejecutar merges, despliegues, migraciones, mensajes o cambios de acceso.
2. Registrar para las afirmaciones materiales su fuente, fecha y alcance: observado en runtime, inspeccionado en código/config, reportado, histórico, propuesto o por confirmar. Configuración no prueba ruta efectiva; servicio activo no prueba una operación correcta; nombre de host no prueba entorno; Git HEAD no prueba todo el código desplegado.
3. Modelar componentes y relaciones con IDs estables antes de dibujar. Reutilizar ese inventario para mapa, detalles, tablas y flujos; evitar contradicciones entre capítulos. Cada flecha debe decir qué transporta y en qué dirección, distinguiendo lectura, escritura y control.
4. Aplicar la cobertura del contrato: componentes/productos/servidores, requests, runtime y LLM, frecuencia, datos y ownership, excepciones/workarounds, evidencia y decisiones. Incluir destino y transición cuando formen parte del encargo. Si falta un dato, marcarlo por confirmar y decir qué fuente o responsable lo resuelve; no inventarlo para completar una tabla.
5. Mantener el mapa abstracto y comprensible, con detalles operativos accesibles en fichas y tablas. Explicar consecuencias y responsabilidades con lenguaje claro; no convertir la página en un árbol de archivos. Mostrar todo lo material al funcionamiento, no cada módulo interno sin relevancia.

## Presentación e interacciones

- En un informe completo, partir de los siete capítulos de la referencia: mapa; requests y LLM; runtime y cadencias; datos y ubicación; workarounds; transición; evidencias y decisiones. Adaptar títulos al proyecto. No inventar una migración si no aplica.
- Agrupar por límites reales: usuario, producto, host/entorno, servicio externo, almacenamiento. Separar producto, servidor, repositorio y entorno de datos.
- Cuando haya estado actual y objetivo, dar un selector con etiquetas visibles y distinguir propuesta de despliegue real. Si solo se conoce uno, mostrarlo sin fabricar el otro.
- Los nodos seleccionables deben mostrar función, ubicación, producto/responsable, trigger, efectos y evidencia. Usar controles accesibles por teclado; el color debe reforzar etiquetas, no ser la única distinción.
- Conservar los rasgos útiles de la muestra: leyenda, rutas de requests seleccionables, inventario buscable cuando sea extenso, workarounds desplegables, fuentes junto a afirmaciones y decisiones abiertas con responsable. Evitar controles decorativos sin función.

## Verificar y entregar

- Renderizar la copia de trabajo y revisar mapa, textos largos y capítulos relevantes en escritorio y ancho móvil. Verificar navegación, selector actual/objetivo, selección de nodos, búsqueda y desplegables que existan; sin errores de JavaScript, recortes ilegibles ni dependencias de red para abrir el archivo. Un Chromium headless puede imponer un ancho mínimo de ventana: para revisar móvil, cargar el HTML dentro de un iframe de 390 px o usar emulación de dispositivo.
- Si hay impresión/exportación, asegurar que incluye todas las secciones, detalles y variantes necesarias del mapa. No confiar solo en `window.print()` dentro de una vista embebida: cuando se ofrezca PDF, generar un archivo real del contenido actual y verificar el enlace de descarga. El ejemplo no trae PDF incrustado a propósito; si un HTML de partida trae uno, no reutilizarlo. Ver [la guía de exportación](references/referencia.md#exportación).
- Revisar coherencia entre inventario y diagramas, estado actual y propuesto, evidencia histórica y reciente. Mantener secretos y PII fuera del informe y de los metadatos; mostrar solo ubicación y mecanismo de protección necesarios.
- Entregar el archivo en el directorio de outputs de la tarea, con un enlace y una explicación breve de alcance y datos aún por confirmar. Abrirlo o publicarlo solo cuando corresponda al encargo. No afirmar que hubo implementación, validación live o migración por haber documentado el plan.

# Bambu Studio / OrcaSlicer, 3MF y AMS

## Perfil y formato

Identifica el slicer instalado y su versión. Usa el perfil real del usuario para impresora, boquilla, placa, material y proceso; no descargues ni instales perfiles sin necesidad/autorización. Si no existe un perfil verificable, entrega el modelo para revisión y explica lo que falta.

- **STL:** geometría triangular sin unidades declaradas ni color. Revisa mm al importar.
- **3MF de modelo:** puede incluir unidades, múltiples objetos y materiales; no implica que existan perfiles de impresión.
- **3MF de proyecto del slicer:** guarda la preparación, objetos/partes, asignaciones y ajustes. El contenido depende del programa y versión. Guarda desde el slicer y vuelve a abrirlo para comprobarlo.
- **Archivo laminado / G-code:** resultado específico de máquina, material y perfil. No es una fuente de diseño editable ni reutilizable automáticamente en otra impresora. Esta skill no lo transmite ni ejecuta.

No escribas un proyecto Bambu a mano con una plantilla fija de A1. No supongas que Blender ofrece exportador 3MF nativo en todas las versiones. Si sólo puedes exportar STL, importa esa geometría al slicer y guarda el proyecto 3MF allí. Si no puedes operar el slicer, describe los pasos pendientes y no anuncies un 3MF inexistente.

## Revisión local por capas

1. Importa como geometría o proyecto según corresponda. Si un proyecto trae ajustes de otra máquina, compara con los perfiles reales antes de aceptarlos. Confirma dimensiones, cuerpos y colocación, incluida base en la placa.
2. Elige orientación por función y acabado. Comprueba espacio para brim, soportes, torre de purga y exclusiones de la placa. La caja de `stl_audit.py` no verifica estas restricciones.
3. Selecciona paredes, relleno y capas según función y perfil validado. Revisa continuidad de paredes finas y capas superiores; más relleno no corrige una unión débil o mala orientación.
4. Configura soportes sólo donde se necesitan. Verifica acceso para retirarlos, interfaces y superficies que dejan marcas. Prueba soporte pintado o dividir la pieza cuando los automáticos atrapan material o dañan detalles.
5. Lamina y recorre primera capa, comienzos de islas, cambios de sección, agujeros, puentes, superficies superiores y última capa. Comprueba que no desaparecieron detalles y que soportes llegan a los lugares previstos.
6. Guarda un proyecto nuevo y vuelve a abrirlo. Registra versión, perfiles y cambios explícitos. Tiempo y consumo son estimaciones del slicer; si no se laminó, no los inventes.

Para CLI, consulta el `--help` del ejecutable instalado y documentación de esa versión; no reutilices flags de otro slicer. Las configuraciones heredadas pueden necesitar resolución completa. No generes G-code con valores inventados. Abre el resultado en la vista de capas antes de entregarlo. No incluyas comandos de red, conexión o envío.

## Color y AMS

Pregunta por el sistema AMS real, número de colores y materiales disponibles; no presupongas cuatro u ocho ranuras. No requiere consultar la impresora. Usa lo que el usuario indique.

Para regiones precisas, conserva las partes con un sistema de coordenadas común, impórtalas como un objeto con múltiples partes y asigna filamentos en el slicer. Para pintura de superficie, usa las herramientas que ofrezca esa versión. Texturas GLB/OBJ, colores de material y pintura por triángulo no se convierten automáticamente en filamentos en todos los programas.

Comprueba ojos, letras y zonas pequeñas en el laminado. Revisa cambios de material, purgas, torre, compatibilidad térmica y posibles interacciones de soportes; presenta consumo/tiempo y permite reducir colores. No recomiendes compras de filamento ni enlaces promocionales. Guarda el 3MF y verifica que al reabrir conserva asignaciones y geometría. Reparar o convertir una malla después de pintarla puede perder la pintura: arregla la fuente primero y repite la asignación.

La entrega acaba en el archivo local revisado. El usuario decide y realiza cualquier impresión en su aplicación.

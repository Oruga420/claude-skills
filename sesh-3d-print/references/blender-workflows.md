# Blender local: figuras y piezas

## Preparación y modificaciones reversibles

Comprueba la versión instalada y los operadores disponibles. El helper incluido se probó con Blender 5.2; no presupongas que nombres de operadores de otra versión existen. Prefiere `bpy.data` y `bmesh` a operadores dependientes de selección/contexto. En una sesión interactiva nunca uses `read_factory_settings` ni borres objetos ajenos al trabajo.

Conserva el original y crea un archivo de trabajo nuevo. Nombra objetos, modificadores y colecciones: `Original`, `Trabajo`, `Cortadores`, `Exportacion`. Mantén una referencia dimensional visible. Anota la equivalencia mm/unidad y verifica una medida conocida después de importar; cambiar la unidad mostrada no cambia mágicamente la geometría.

Antes de operaciones dependientes de distancias, resuelve la escala no uniforme sobre una copia y comprueba que las dimensiones mundiales se mantienen. No apliques transformaciones indiscriminadamente a rigs, instancias o ensambles. Verifica normales después de espejos o escala negativa.

## Figuras orgánicas

1. Bloquea la silueta a la altura final con primitivas, curvas o malla base. Revisa frente, perfil, espalda y base; define pose y centro de apoyo.
2. Separa masas principales de detalles. Decide si orejas, dedos, colas, armas decorativas y adornos se imprimen unidos o como piezas con uniones. Evita contactos sólo tangenciales: construye una unión con sección medible.
3. Conserva el bloque editable. Usa Boolean Union o remesh en una copia para formar un volumen continuo cuando corresponda. El tamaño de vóxel se deriva del detalle más pequeño que debe sobrevivir; prueba una zona antes de remallar toda la figura. Compara dimensiones y silueta antes/después.
4. Añade detalles secundarios y luego detalles finos mediante geometría real. El suavizado visual y los mapas de normales no engrosan una pared ni imprimen poros. La resolución útil depende de la boquilla, la orientación y la capa confirmadas.
5. Usa Multires en una base estable. Los cambios de topología/remesh posteriores pueden destruir niveles, atributos y grupos. En headless usa deformaciones/modificadores de objeto; evita simular pinceladas o entrar en Sculpt Mode sin contexto UI compatible.
6. Si divides para reducir soportes, ubica cortes donde la unión pueda alinearse, pegarse y ocultarse. Define espigas/llaves, holgura y posibilidad de montaje. No copies una tolerancia universal; valida con un cupón.
7. Comprueba base, partes finas, volúmenes internos y zonas donde retirar soportes podría romper detalles. Si huecas, modela el espesor y accesos deliberadamente; el infill del slicer no equivale a una carcasa CAD de espesor controlado.

## Piezas funcionales / hard-surface

- Parte de una lista de parámetros en mm: ancho, alto, espesor, centros de agujeros, diámetro de alojamiento, radio de esquinas y holguras. Usa CAD paramétrico local existente si la intención requiere cotas/historial sólidos; Blender sigue siendo válido para edición de malla, formas libres y exportación. No simules historial CAD sobre un STL.
- Usa Mirror, Boolean y Bevel como modificadores editables. Haz cortadores cerrados que atraviesen la superficie sin coplanaridad accidental. Evalúa el resultado, no sólo la malla base. Weighted Normal cambia el sombreado, no la forma fabricada.
- No bases segmentos de cilindros en su tamaño en pantalla. Para radio `r` y `n` lados, la desviación radial de la faceta es `r * (1 - cos(pi/n))`. Elige `n` con respecto a la tolerancia geométrica de exportación y confirma la medida del agujero real entre caras.
- Separa dimensión nominal, holgura diseñada, error de mallado y compensación del proceso. En un encaje cilíndrico, holgura diametral = diámetro de agujero − diámetro de espiga; la holgura por lado es la mitad. Documenta cuál se está usando.
- Ajusta chaflanes de entrada, radios y refuerzos según montaje, espacio y dirección de carga. No infieras resistencia a partir de infill o grosor visual. Considera la anisotropía entre capas al elegir orientación y valida físicamente cuando haya cargas relevantes.

## Exportación desde Blender

Guarda un `.blend` editable nuevo antes de preparar derivados. El helper exporta un único objeto MESH explícito a STL binario en mm, triangula la malla evaluada en memoria, aplica `matrix_world` y corrige el orden de vértices al reflejar la transformación. No modifica el archivo fuente ni aplica modificadores en él. No exporta instancias de Geometry Nodes sin realizar; conviértelas en una copia y vuelve a comprobar.

La malla evaluada usa el estado de viewport del archivo, incluidos fotograma y niveles de subdivisión. Ajusta ese estado en la copia que se pretende fabricar y compáralo con el resultado. Si necesitas varios cuerpos, expórtalos individualmente conservando su sistema de coordenadas y móntalos como partes en el slicer. No uses Join como sustituto de Boolean Union: Join no elimina intersecciones.

Reabre el STL, comprueba caja y medidas críticas, número de cuerpos e integridad de la forma. El STL pierde colores, unidades declaradas, nombres, jerarquía e historial. Para un proyecto multicolor, sigue el [flujo de slicer](slicer-handoff.md); no cambies la extensión de un STL a `.3mf`.

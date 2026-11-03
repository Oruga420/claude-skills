# Procedencia, licencias y limpieza

Revisión: 2026-11-03. Una skill combinada, redactada para trabajo local. No es un paquete que instale o ejecute las cuatro fuentes. La selección/adaptación conserva las licencias MIT originales en `licenses/`; las utilidades incluidas se escribieron para esta skill, sin copiar los runners de las fuentes.

| Fuente y revisión fijada | Material aprovechado | Excluido de este paquete |
| --- | --- | --- |
| [EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills/tree/fb92cfb4cc5a238c22113a6a230b09f535bd0656) — [MIT](../licenses/EL4CTEO-MIT.txt) | `blender-core`, `blender-sculpting`, `blender-hardsurface-modeling`, `blender-asset-qa`: escala, copia de exportación, modificadores, escultura progresiva, malla evaluada y evidencia visual | Instaladores, MCP, animación/rigging/baking para juegos y runners genéricos; no necesarios para este flujo de fabricación |
| [kajisho5/blender-skill](https://github.com/kajisho5/blender-skill/tree/dcafe818bf70dbc52b2a8ab7ec9d193c5fbfe1d8) — [MIT](../licenses/kajisho5-MIT.txt) | `SKILL.md`, secciones relevantes de `references/pitfalls.md`: inspeccionar antes de editar, originales intactos, comprobar exportación y limitaciones de formatos | Pipeline multi-formato, delegación, MCP, optimizadores/renderizadores y gestión de publicaciones |
| [heyixuan2/bambu-studio-ai](https://github.com/heyixuan2/bambu-studio-ai/tree/cdc26987d5bf1052a055d9403e3cb9630959dd08) — [MIT](../licenses/heyixuan2-MIT.txt) | `SKILL.md`, `references/multicolor.md`: preparar geometría, regiones de color, revisar paleta y reabrir proyecto | Proveedores de pago y subidas (`generation/providers`, `generate.py`), búsqueda/descargas, credenciales (`configure.py`), MQTT (`printer/client.py`), monitoreo, catálogos de compra y plantillas de máquina |
| [earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad/tree/244eecd6b675b75493fa3627292b168ffacf799d) — [MIT](../licenses/text-to-cad-MIT.txt) | `skills/dfam-check`, `skills/gcode`, `skills/bambu-labs`: hechos geométricos, límites parciales, perfil real y separación modelo/proyecto/laminado | Instalación de dependencias, servicios externos/CAD en nube, resolver perfiles ajenos, enlaces de envío Bambu Connect y ejecución de impresiones |

Las licencias MIT permiten adaptación y redistribución conservando sus avisos. Los cuatro avisos se incluyen íntegros; el [LICENSE de esta skill](../LICENSE) cubre sus aportes nuevos. Las licencias de modelos que aporte el usuario son independientes.

## Alcance real de la auditoría

Se leyeron las instrucciones y referencias identificadas, se inventariaron scripts y se buscaron puntos de red, procesos, credenciales e instalación. Se inspeccionaron, entre otros, el proveedor Meshy y el cliente de impresora de Bambu para confirmar que quedaban fuera. No se ejecutó ningún script de estas cuatro fuentes y no se afirma una auditoría exhaustiva de todos sus repositorios. Que una función se excluya no significa que sea maliciosa: simplemente no corresponde al encargo.

Se revisaron íntegramente los dos helpers nuevos y sus pruebas antes de ejecutarlos. No importan bibliotecas HTTP, sockets, APIs de impresora, gestores de paquetes ni módulos de credenciales. No hay descargas al importar, tareas persistentes, comandos shell, telemetría ni mecanismos de pago. Sólo leen el modelo indicado y escriben archivos nuevos expresamente nombrados. El exportador usa la API del Blender local con autoejecución de `.blend` deshabilitada; eso reduce ejecución de scripts incrustados, no convierte a Blender en un sandbox contra archivos maliciosos. No abras archivos de origen dudoso en una sesión sensible.

Los tests crean datos sintéticos y archivos temporales. `blender_regression.py` exige proceso de fondo con inicio de fábrica, crea un directorio nuevo y actúa únicamente sobre su escena de prueba. No instala herramientas ni actúa sobre una impresora. La documentación no encadena automáticamente otras skills o plugins de generación.

## Inventario de ejecutables conservados

| Archivo | Razón de conservarlo | Efectos |
| --- | --- | --- |
| `scripts/stl_audit.py` | Mediciones STL repetibles sin dependencias | Lee STL; JSON a stdout o archivo nuevo; no reparación |
| `scripts/blender_export_stl.py` | Exportación medida y no destructiva | Lee `.blend` con scripts deshabilitados; escribe un STL nuevo |
| `tests/test_stl_audit.py` | Regresiones de geometría, parser y archivos | Escribe fixtures sintéticos temporales y los elimina al terminar |
| `tests/blender_regression.py` | Integración real con malla orgánica y pieza perforada | Crea escena de prueba aislada y artefactos en directorio nuevo |

No se conservan binarios, instaladores, paquetes vendorizados, claves, datos de clientes ni archivos `.blend` del usuario.

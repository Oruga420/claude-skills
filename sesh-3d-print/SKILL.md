---
name: sesh-3d-print
description: Crea y modifica figuras orgánicas y piezas funcionales para impresión 3D FDM con Blender local; inspecciona y repara mallas STL, conserva originales y prepara STL o proyectos 3MF para revisar en Bambu Studio u OrcaSlicer. Úsala para escultura, hard-surface, ajustes dimensionales, tolerancias, orientación, soportes y color AMS. No controla impresoras.
license: MIT
metadata:
  author: Oruga420
  version: "1.0.0"
---

# sesh-3d-print

Convierte la intención del usuario en un modelo editable, una exportación medida y un informe honesto de lo que falta revisar antes de fabricar. Trabaja en español si el usuario habla español.

## Alcance y datos necesarios

- Usa Blender, Python y el slicer que ya estén disponibles. Comprueba versiones y capacidades locales; no instales aplicaciones, dependencias, extensiones ni MCP como parte de esta skill.
- Para modificar un archivo, identifica el original, el cambio solicitado y una dimensión real conocida. Para crear uno, define tamaño en mm, propósito decorativo o funcional y geometría de referencia.
- Pregunta por impresora exacta, boquilla, material, placa y perfil de proceso cuando afecten el diseño o el laminado. No supongas A1, PLA, boquilla de 0.4 mm, temperaturas, altura de capa ni volumen útil. Puedes avanzar con el concepto y la inspección dejando esos datos pendientes.
- Para encajes, solicita dimensiones de ambas piezas, tipo de ajuste, cargas y condiciones relevantes. Para varios colores, confirma colores/materiales disponibles y configuración AMS; no deduzcas compatibilidad por el nombre comercial.
- Esta skill termina en archivos locales y revisión. No conecta, consulta, inicia, pausa ni cancela una impresora. No necesita claves, cuentas, compras, telemetría, servicios de generación ni subidas de archivos. No incorpora scripts descargados con modelos. Si una petición necesita otro servicio, explica el límite sin activarlo automáticamente.

## Elige la ruta

| Trabajo | Recurso a leer |
| --- | --- |
| Figura, mascota, miniatura, escultura, pieza rígida o modificación de `.blend` | [Blender y modelado](references/blender-workflows.md) |
| STL roto, escala dudosa, paredes, encajes, orientación o exportación | [Malla y diseño para fabricación](references/mesh-dfam.md) |
| Bambu Studio, OrcaSlicer, soportes, color AMS, proyecto 3MF o G-code | [Preparación en el slicer](references/slicer-handoff.md) |
| Comprobar ejemplos y alcance de las pruebas | [Ejemplos y validación](references/validation.md) |
| Procedencia y limpieza de las cuatro fuentes | [Fuentes y auditoría](references/sources-and-audit.md) |

## Flujo de trabajo

1. **Inspecciona antes de editar.** Registra formato, unidades declaradas/confirmadas, dimensiones, objetos/cuerpos, transformaciones y defectos observados. Un STL no declara unidades. No lo reescales por intuición.
2. **Conserva una fuente editable.** Trabaja en una copia nueva; mantén modificadores y cortadores nombrados. Nunca sobrescribas el original ni reinicies la sesión abierta del usuario. Los comandos headless se ejecutan en un proceso separado con inicio de fábrica y autoejecución deshabilitada.
3. **Modela por intención.** Figura: silueta, volúmenes conectados, detalles a escala y un apoyo estable. Pieza: parámetros, superficies de referencia, agujeros y encajes medidos. Una textura o un normal map no crea relieve imprimible.
4. **Repara sólo defectos identificados.** Un agujero puede ser funcional; un cuerpo separado puede ser un ensamble. Explica qué cambia cada operación y vuelve a medir. No ejecutes una reparación global que tape conductos, borre detalles o cambie medidas críticas.
5. **Comprueba el archivo que entregarás.** Evalúa la malla con sus modificadores, exporta a un nombre nuevo y vuelve a abrir/medir la exportación. Compara dimensiones y cuerpos esperados; revisa imágenes de varios ángulos para forma y detalles. Separa inspección visual, medición geométrica y comportamiento físico.
6. **Revisa el laminado si hay perfil real disponible.** Abre en el slicer local, confirma dimensiones y perfil, inspecciona capas y guarda el proyecto 3MF. Si no hay slicer o falta perfil, entrega el STL y marca el laminado como pendiente.

## Utilidades incluidas

Sólo dos utilidades de producción, ambas locales. Revisa su código antes de la primera ejecución. Sustituye las rutas y los valores de ejemplo por los del trabajo.

```text
python scripts/stl_audit.py modelo.stl --mm-per-unit 1 --output informe.json
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/blender_export_stl.py -- --input modelo.blend --object Pieza --mm-per-unit 1 --output pieza.stl
```

`1` significa **un milímetro por unidad de coordenadas** y sólo corresponde si ya se confirmó esa convención. Una escena modelada en metros normalmente requiere `1000`. La etiqueta de unidades de Blender por sí sola no prueba el tamaño correcto.

- [stl_audit.py](scripts/stl_audit.py): lee STL ASCII/binario sin modificarlo; informa dimensiones, triángulos degenerados/duplicados, bordes abiertos, incidencia de bordes, orientación y componentes. `--bed-mm X Y Z` compara sólo la caja alineada con ejes. No comprueba paredes, autointersecciones, vértices no manifold, apoyos ni resistencia.
- [blender_export_stl.py](scripts/blender_export_stl.py): abre una copia en memoria de un `.blend`, exporta **un objeto MESH explícito** con transformaciones y modificadores evaluados a STL en mm y no guarda el `.blend`. Rechaza instancias procedurales sin realizar, escala singular y archivos de salida existentes. No fusiona objetos ni conserva materiales; los ensambles/colores requieren el flujo del slicer.
- Códigos de `stl_audit`: `0` informe sin los defectos de borde/triángulo comprobados; `2` hallazgos geométricos; `1` entrada o escritura fallida. **Ninguno certifica imprimibilidad.** Los volúmenes firmados de componentes sólo son interpretables con superficies cerradas y orientación consistente; una cavidad intencional puede tener signo negativo.

## Entrega

Incluye enlaces a la fuente editable y exportaciones realmente creadas, dimensiones en mm, cambios aplicados, evidencias y pendientes. Identifica cada comprobación como medida, visual, estimada o no realizada. Indica slicer/versión/perfiles sólo si se usaron; informa tiempo y material sólo como estimaciones del slicer. No declares «listo para imprimir» por un render, un conteo de polígonos o un informe de bordes sin errores. Ajustes, resistencia, acabado y adhesión requieren validación física apropiada.

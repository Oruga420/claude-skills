# Ejemplos y validación

## Ejemplo de figura orgánica

Petición: «Crea una figura de hongo de 50 mm de alto y prepárala para mi Bambu; aún no elegí material».

La skill permite avanzar con una forma editable a escala, apoyo y cuerpo continuo. No elige impresora ni material. La parte inferior del sombrero requiere revisar orientación/soportes en el slicer y el cuello debe comprobarse según el material y uso. Un buen render no resuelve esas decisiones. Entrega `.blend`, STL en mm y pendientes concretos.

Fixture reproducible: `tests/blender_regression.py` construye una superficie orgánica de revolución con base, tallo y sombrero. Resultado medido: **48 × 48 × 50 mm, 1.024 triángulos, un componente de borde, cero bordes abiertos y volumen firmado positivo**. Es geometría sintética para comprobar exportación, no una prueba de impresión o una figura terminada artísticamente.

## Ejemplo de pieza funcional

Petición: «Haz una placa de montaje de 40 × 24 × 4 mm con un agujero central nominal de 6 mm; quiero ajustar el agujero después».

La skill mantiene un cortador Boolean editable, confirma tamaño y centros, y conserva la fuente. La sección del agujero se aproxima con 64 lados; se distingue diámetro nominal de medida entre facetas. El diámetro definitivo para un tornillo o encaje depende de la pieza compañera y de calibración real. No se adopta una tolerancia universal ni se promete resistencia.

Fixture reproducible: **40 × 24 × 4 mm, 280 triángulos, un componente y cero bordes abiertos**. Se compara el volumen con el prisma menos el cilindro poligonal y se lanza un rayo por el centro para detectar si el agujero se tapó. El modificador permanece en la fuente. Una variante reflejada y con escala no uniforme mide **80 × 24 × 2 mm** y conserva orientación de caras hacia fuera.

## Pruebas realizadas

El 2026-11-03 en Windows, Python 3.12 y Blender **5.2.0 LTS**, build `fbe6228777e7`:

- **18 tests unittest**, todos correctos: ASCII/binario, cabecera binaria que empieza por `solid`, truncamiento y bytes sobrantes, estructuras inválidas, coordenadas no finitas, límites de recursos, bordes abiertos, caras invertidas/duplicadas/degeneradas, varios cuerpos, volumen, unidades, caja contra volumen disponible y ausencia de soldadura implícita.
- CLI de auditoría: JSON válido y códigos `0/1/2`; error si falta entrada; rechazo de salida existente y protección del original.
- Cobertura con `coverage.py`, ya disponible: **99% combinado de líneas/ramas de `scripts/stl_audit.py`** (162 sentencias, 68 ramas; falta la llamada de entrada `__main__` en la suite importada). No es cobertura del modelado, del slicer ni una garantía geométrica.
- Integración real en Blender: figura y placa anteriores, dimensiones de bytes STL frente a reporte del exportador, volumen analítico de placa, perforación abierta, orientación tras espejo, pila de modificadores conservada, `.blend` sin cambios mediante SHA-256, rechazo de salida existente, escala cero y transformación singular.
- CLI completa del exportador: reapertura del `.blend` sintético con autoejecución deshabilitada, exportación de `MountingPlate`, nueva auditoría del STL y SHA-256 del original sin cambios.
- Validación de frontmatter con `skill-creator/quick_validate.py`, sintaxis Python, metadatos de interfaz, capabilities, enlaces locales y revisión del diff.

La entrada nueva del catálogo se validó de forma aislada y el conteo coincide con sus entradas. El `SKILLS_INDEX.yaml` completo ya contiene sintaxis de ejemplos no aceptada por un parser YAML estricto (línea 45 tanto en la base como después del cambio); se conserva ese contenido ajeno. No afecta al frontmatter ni a los archivos YAML de esta skill.

## Reproducir offline

Desde la carpeta de la skill, con Python existente:

```text
python -m unittest discover -s tests -p test_stl_audit.py -v
```

Cobertura opcional **sólo si ya está disponible** (guarda el archivo fuera del repo):

```text
python -m coverage run --branch --source=stl_audit --data-file=/ruta/temporal/cobertura -m unittest discover -s tests -p test_stl_audit.py
python -m coverage report --data-file=/ruta/temporal/cobertura -m
```

Blender existente, proceso separado. Usa una ruta absoluta de salida nueva cuyo padre exista; nunca la carpeta de trabajo de una escena del usuario:

```text
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python tests/blender_regression.py -- --output-dir /ruta/temporal/prueba-nueva
```

Produce `fixtures.blend`, STL sintéticos y `results.json`. No instala dependencias, contacta servicios ni inicia una impresión. Para comprobar la CLI de exportación, usa `fixtures.blend`, objeto `MountingPlate`, escala confirmada de ejemplo `--mm-per-unit 1` y una salida STL nueva; compara el SHA-256 del `.blend` antes/después.

## No probado y límites

No se hicieron impresiones físicas, pruebas de carga/ajuste, laminado, roundtrip de 3MF, asignaciones AMS, conversiones de textura a filamento ni mediciones de pared/autointersecciones. No se probó compatibilidad con otras versiones de Blender u otros sistemas operativos. La cobertura numérica corresponde sólo al inspector STL; el exportador se comprobó por integración, sin porcentaje de cobertura.

La ausencia de hallazgos de borde no certifica que una malla sea un sólido fabricable. Tampoco se validó aquí resistencia, adhesión, soporte necesario ni resultado artístico. Para un encargo real, completa las mediciones y revisión de capas con el perfil del usuario.

# Contrato de contenido

Este contrato define la profundidad que el usuario busca en diagramas de sistemas. Aplicar las dimensiones pertinentes al alcance; no fabricar datos ni llenar capítulos con texto genérico. Una respuesta sobre un único flujo puede reunir varias dimensiones en el propio diagrama y sus notas.

## 1. Mapa del sistema y componentes

El lector debe poder seguir una operación de extremo a extremo y ubicar sus dependencias.

| Dimensión | Información que debe quedar clara |
|---|---|
| Función | Qué hace cada componente y qué responsabilidad no le corresponde cuando haya una confusión real |
| Producto | A qué app, plataforma, integración o proveedor pertenece |
| Ubicación | Browser, host, contenedor, servicio gestionado o proveedor externo; entorno efectivo y puertos relevantes si se conocen |
| Entradas/salidas | Requests, eventos, datos o comandos recibidos y resultado producido |
| Ejecución | Servicio permanente, proceso por request, job, webhook, acción manual o CI |
| Efectos | Lectura, escritura, control, generación de código o respuesta al usuario |
| Ownership | Equipo responsable o dueño por confirmar; ubicación de código si ayuda a actuar |
| Evidencia | Referencia y fecha para la ubicación y conducta mostradas |

Agrupar componentes dentro de los límites reales. Un nombre como `dev` o `sandbox` no garantiza ausencia de efectos reales. SSH/bastión es acceso administrativo; no dibujarlo como camino de datos del producto salvo evidencia. Un repo es fuente de código, no un servidor.

Separar cuando corresponda UI, ingress, autenticación, API/orquestador, workers, scheduler, adaptadores, proveedores, persistencia, memoria del agente, observabilidad y entrega de releases. No añadir componentes que no existan solo porque aparecen en el ejemplo de referencia.

## 2. Data flow y manejo de requests

Mostrar secuencias representativas. En el ejemplo Lumen son diferentes la venta en tienda que entra como evento, el job nocturno que consulta al LLM y el pedido web que reserva stock. En otro sistema elegir sus caminos reales.

Para cada ruta explicar:

- Quién la inicia y mediante qué trigger, protocolo o contrato.
- Dónde se autentica y cómo se resuelve el usuario, tenant, tienda o entidad.
- Qué servicios llama en orden, qué payload lógico transforma y dónde persiste.
- Dónde espera y cómo devuelve resultado: síncrono, streaming, callback o job asíncrono.
- Timeouts, paginación, cache/frescura, retries e idempotencia que sean materiales y estén respaldados por evidencia.
- Qué significa éxito, qué errores se propagan y qué ocurre si falla una dependencia. HTTP 200 o un proceso activo no equivalen automáticamente a datos correctos o escritura persistida.

Flechas rotuladas: lectura/request, escritura/efecto y control/inferencia. No convertir todas las relaciones en una línea de doble punta sin explicación.

## 3. Runtime, cadencia y LLM

Ofrecer una tabla con componente, motor, ubicación, trigger/frecuencia, zona horaria, uso de LLM y efectos. Distinguir una frecuencia programada de un timeout. Para jobs incluir cron literal y lectura humana si se verificaron; no deducir el cron de una nota de planificación.

Si hay LLM, explicar su runtime real:

- Qué lo invoca y si el proceso vive por turno, por sesión, por job o de forma permanente.
- Dónde corre el orquestador y dónde se hace la inferencia. Indicar modelo/proveedor solo si están verificados.
- Qué recibe: mensaje, instrucciones, contexto, documentos, memoria y resultados de herramientas.
- Ciclo de razonamiento/herramientas/observación, límites de herramientas y alcance de permisos efectivos.
- Sesión, persistencia de conversación, concurrencia, locks, finalización y streaming cuando apliquen.
- Qué operaciones normales son deterministas y qué fases realmente necesitan inferencia.

No presentar un agente como un LLM autónomo continuo sin prueba. No extender un guard, dry-run o lock a procesos que lo eluden. La memoria del agente no sustituye la base de datos de negocio.

## 4. Ubicación y tratamiento de datos

Separar una tabla de servidores/productos de otra de datos. Para cada familia de datos relevante registrar:

| Campo | Pregunta que resuelve |
|---|---|
| Fuente de verdad | ¿Quién define el dato correcto? |
| Identidad/contrato | ¿Qué IDs y mappings lo conectan entre sistemas? |
| Recorrido | ¿Quién lo lee, transforma, transporta o escribe? |
| Persistencia | ¿Dónde se guarda, en qué entorno y con qué responsable? |
| Naturaleza | ¿Es dato de negocio, configuración, secreto, cache, log o memoria? |
| Operación | ¿Cómo se controla frescura, duplicados, errores o reconciliación? |
| Recuperación | ¿Qué necesita backup, restore, invalidación o migración cuando aplique? |

Mostrar mecanismos para credenciales, PII y claves sin incluir sus valores. Clasificar cache reconstruible frente a estado autoritativo. Si hay múltiples raíces de estado, hacer visible qué guarda cada una. Retención, RPO/RTO y ventanas de historial desconocidas quedan por confirmar, no inventadas.

## 5. Workarounds y reemplazos

Para cada workaround material, incluir:

1. Comportamiento actual y problema que resuelve.
2. Límite o costo de mantenerlo: duplicación, pérdida de datos, cron paralelo, dependencia manual, etc.
3. Solución propuesta y producto/equipo que debe asumirla.
4. Dependencias para reemplazarlo.
5. Evidencia de paridad necesaria para retirarlo y condición de salida.

Distinguir los cambios que corresponden a otro producto, equipo o proveedor (en el ejemplo, el firmware del POS) de los cambios en el propio sistema y su infraestructura. Usar los límites reales de cada proyecto. No llamar fix desplegado a una propuesta. No retirar una protección o job antes de demostrar cobertura equivalente. Separar fallo externo reportado, restricción de acceso y defecto de código.

## 6. Estado objetivo y transición, cuando proceda

Poner objetivo, estado actual y decisiones pendientes lado a lado. Explicar el orden de dependencia entre etapas y los criterios para pasar de una a otra. El orden del ejemplo («primero la base, después el SFTP») es propio de ese caso; no es una receta universal ni autoriza ejecutar nada.

En migraciones con escritores o efectos externos, incluir inventario de entidades, identidad anterior/nueva, rutas, credenciales, estado, todos los triggers, ventana de observación, rollback y retiro del origen. Un lock local no evita que otro host escriba. Cambiar un DSN no prueba una migración completa.

Definir el final en términos observables: qué registros y operaciones funcionan en destino y qué deja de existir/correr en origen. No confundir plan con ejecución. Si una fase depende del repositorio de otro equipo, describir la revisión y el merge a cargo de ese equipo; el agente no fusiona repositorios ajenos.

## 7. Evidencia y decisiones

Asignar referencias cortas a fuentes con ruta/URL utilizable, fecha, versión y alcance. Distinguir:

- **Observado en runtime:** configuración efectiva, metadatos o operación medida, según lo que de verdad se observó.
- **Inspeccionado en código/config:** comportamiento o valor localizado, sin atribuirlo automáticamente al despliegue.
- **Reportado:** afirmación del usuario/equipo, con procedencia.
- **Histórico:** resultado válido en su fecha, sin certificar el presente.
- **Propuesto:** diseño o cambio deseado que aún no está implementado/verificado.
- **Por confirmar:** dato faltante con responsable/fuente que puede resolverlo.

Para cada decisión mostrar pregunta concreta, alternativa o dato requerido, responsable y trabajo que bloquea. Una IP, un remote configurado o un alias SSH no demuestra por sí mismo cuál es el repo canónico ni la rama aprobada.

## Revisión de suficiencia

El informe debe permitir responder: ¿qué existe?, ¿dónde corre?, ¿quién llama a quién?, ¿qué cambia?, ¿cuándo corre?, ¿qué hace el LLM?, ¿quién posee los datos?, ¿qué es temporal?, ¿cómo se llegaría al objetivo? y ¿qué falta verificar? Si el encargo no requiere alguna pregunta, explicarlo brevemente u omitirla; si la requiere pero falta evidencia, dejarla visible como pendiente.

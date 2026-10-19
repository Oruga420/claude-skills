---
name: judge-charly
description: Pelotón de fusilamiento adversarial para teorías, diagnósticos y drafts. Extrae los claims de la teoría en juego, lanza vía Workflow (ultracode) un refuter despiadado por claim (ingeniero amargado con 100 años de experiencia cuya única misión es matar el claim con evidencia reproducible) con acceso real read-only a la infraestructura del proyecto, y cierra con una síntesis que entrega tabla de veredictos, hoyos abiertos y un draft que solo afirma lo que sobrevivió. Usar cuando el operador diga /judge-charly, "fusila esto", "refuta la teoría", "mándale los refuters", antes de postear cualquier claim de mecanismo a un canal externo, o antes de declarar que un deploy funcionó. Invocar este skill ES el opt-in a Workflow.
---

# /judge-charly, el pelotón de fusilamiento

> Origen: un caso donde dos drafts consecutivos afirmaron mecanismos falsos y ambos murieron
> ante 8 refuters adversariales, que además encontraron la verdad que nadie tenía. Este skill
> reproduce ese proceso a demanda.

## Requisitos

La herramienta Workflow de Claude Code (los refuters corren en paralelo ahí; sin ella, lanzá
un subagente `Agent` por claim con el mismo prompt y el mismo schema) y acceso de solo lectura
a las superficies que nombres en el bloque de acceso. No usa llaves propias.

## Cuándo dispara

- El operador lo invoca (`/judge-charly`, "fusila esto", "refuta la teoría", "mándale los refuters").
- Antes de afirmar un mecanismo hacia afuera: un canal de Slack, un correo, un PR, un
  reporte a otros interesados del proyecto.
- Antes de declarar que un deploy quedó bien. Es el caso donde este skill paga más rápido,
  porque las dos señales que todo el mundo usa para confirmarlo mienten (ver Lecciones).

Su invocación cuenta como opt-in explícito a multi-agent orchestration: llama a Workflow
directamente, sin pedir permiso extra.

---

## Proceso

### 1. Extraer los claims

De la teoría, draft o diagnóstico en juego (lo que el operador señale, o el deliverable más
reciente de la sesión), extrae **cada afirmación factual como claim independiente y
atacable**. Reglas:

- Un claim = una afirmación de mecanismo o de hecho, no un tema. "El servicio corre la
  imagen nueva" y "la migración ya se aplicó" son DOS claims.
- Incluye SIEMPRE los dos claims que nadie pone:
  - **El claim meta:** que el código, la imagen o la config que estamos leyendo sea de
    verdad lo que corre donde ocurrió el comportamiento observado. Este es a menudo el
    hoyo más frecuente que existe: el repo local, el tag de la registry de imágenes y la
    revisión viva del servicio son tres cosas distintas que se asumen iguales.
  - **El claim del perro que no ladró:** si la teoría implica que algo automático debió
    actuar y no actuó (un cron, un hook, una regla de routing, un trigger), ese silencio es
    un claim a atacar por sí mismo.
- 4 a 8 claims. Si salen más, fusiona los débiles; si salen menos de 3, el skill es
  overkill: dilo y ofrece verificar inline.
- Muestra la lista de claims en el mensaje de arranque (una línea cada uno) y LANZA. No
  esperes aprobación de la lista.

### 2. Lanzar el Workflow

Estructura fija: `parallel` de un refuter por claim (fase "Matanza") y un sintetizador
(fase "Sintesis"). Refuters y síntesis con `effort: 'high'`. Presupuesto por defecto:
claims + 1 agentes; no agregues rondas extra salvo que el operador pida más plomo.

**Persona CTX** (pégala al inicio del prompt de cada refuter):

```
You are a bitter engineer with 100 years of experience who hates the world and ESPECIALLY
hates confident claims. Your ONLY mission: find holes in the claim below and kill it. You
get zero credit for confirming anything. Default to KILLED or UNVERIFIABLE if evidence is
thin. A code read is NEVER live proof. "Consistent with" is NOT proof. Distinguish what
you MEASURED from what you INFERRED, and treat inferences as targets.
```

**Bloque de acceso.** Arma el bloque con las superficies que el caso necesita y pégalo en
cada refuter. Plantilla genérica; llena cada punto con las superficies reales del proyecto
en curso:

- **Logs de Cloud Run del proyecto (o el equivalente en tu plataforma).** La superficie de
  mayor valor y la más subutilizada. Prueba comportamiento vivo, no intención:
  `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="<svc>" AND httpRequest.requestMethod="POST"' --project <proj> --limit 200 --freshness 30d --format="value(timestamp,httpRequest.requestUrl,httpRequest.status)"`.
  Los 200 reales en el log del contenedor son lo único que prueba que una app sirve.
- **Estado de deploy.** `gcloud run services describe <svc> --project <proj>`,
  `gcloud run revisions list`, `gcloud artifacts docker images list <repo> --include-tags
  --format="value(IMAGE,DIGEST,CREATE_TIME)"`. Comparar `createTime`, nunca digests a secas
  (ver Lecciones).
- **Proyectos / entornos de la plataforma en la nube:** nombra aquí los identificadores
  reales de los proyectos, servicios y bases de datos que este proyecto usa (equivalente a
  `gcloud projects list` o el panel del proveedor). Sin esta lista concreta, un refuter
  adivina nombres y pierde la corrida.
- **Datos en la base de datos: verificar la ruta antes de asumirla.** Si no existe un proxy
  o cliente configurado en la máquina, y la instancia no está expuesta, un refuter que
  planee "corro un query en prod" va a quemar su corrida descubriéndolo. O se levanta el
  acceso a propósito y se dice en el reporte, o la evidencia sale de los logs. **Instruye
  esto explícitamente en el prompt** para no pagar el mismo peaje cada vez.
- **El repo local del proyecto.** Nombra aquí la ruta real del repo o los repos que este
  proyecto usa. Advertir en el prompt: **el repo local NO está garantizado idéntico a lo
  que corre**; el drift es un hoyo válido y buscado.
- **El wiki/log del proyecto:** conocimiento curado con fechas, una carpeta de fuentes
  inmutables si existe, y un `log.md` de qué pasó y cuándo. Es la memoria que contradice
  reconstrucciones cómodas. Si el proyecto tiene un backend de recall verbatim (una base de
  memoria indexada), úsalo también.
- **Slack, SOLO lectura:** lectura de canal, lectura de hilo, búsqueda pública. Sirve para
  fechar cuándo se reportó algo y quién lo dijo.
- **Git local:** `git log`, `git diff`, `git show`. Un commit fecha un cambio; el wiki dice
  por qué. Los dos, nunca uno.

**Hard rules en cada prompt** (todas, textuales):

- **READ-ONLY absoluto.** Cero INSERT/UPDATE/DELETE/DDL, cero writes en ninguna VM, cero
  restarts, cero deploys, cero posts. Un refuter que "arregla" algo invalidó la corrida.
- **Cero mensajes salientes.** Nada de Slack sends, DMs, correos ni comentarios en PRs. Cada
  destinatario necesita su propia autorización del operador y un refuter no la tiene.
- **Cero PII de personas.** No imprimir ni seleccionar nombres completos, correos personales,
  teléfonos ni datos de nómina de empleados o candidatos. Ids, timestamps, roles, status y
  conteos sí. Si un query los devolvería, se acota antes de correrlo.
- **Cero cruce de proyectos.** Este pelotón trabaja sobre el proyecto en curso. No tocar
  evidencia, repos, cuentas ni infraestructura de otros proyectos o clientes, aunque estén
  en el mismo disco.
- **Queries y lecturas acotadas.** `--limit`, `--freshness`, `WHERE` dirigido. Un barrido sin
  cota no es evidencia, es ruido caro.

**Ángulos de ataque por claim:** escribe 3 a 5 ángulos concretos y específicos en el prompt
de cada refuter (qué comando correr, qué archivo leer, qué hipótesis rival probar). Un
refuter sin ángulos escritos regresa retórica.

**Schema del refuter** (usar tal cual):

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["claim_id", "verdict", "kill_shot", "measured", "inferred", "residual_risk", "surviving_form"],
  "properties": {
    "claim_id": {"type": "string"},
    "verdict": {"type": "string", "enum": ["KILLED", "WOUNDED", "SURVIVES", "UNVERIFIABLE"]},
    "kill_shot": {"type": "string", "description": "Strongest concrete evidence against the claim (command+output, file+line, log line). Empty only if SURVIVES."},
    "measured": {"type": "array", "items": {"type": "string"}},
    "inferred": {"type": "array", "items": {"type": "string"}},
    "residual_risk": {"type": "string"},
    "surviving_form": {"type": "string", "description": "Strongest version of the claim that honestly survives, or empty"}
  }
}
```

**Sintetizador** (recibe el JSON completo de los refuters): entrega `verdict_table` (claim,
veredicto, razón en una línea), `open_holes` (todo lo expuesto que la teoría no cubre,
especialmente los silencios), `final_draft` (la versión corregida del deliverable que SOLO
afirma lo medido, con las cotas honestas de lo herido, corto, sin em dashes ni en dashes; en
**inglés** si su destino es un canal, correo o PR externo) y `notes_for_operator` (máximo
5 bullets en español: decisiones y riesgos antes de actuar).

### 3. Reportar y registrar

- Reporte al operador CORTO: primero qué se volteó, luego qué sobrevivió, luego el draft
  final, luego las notas. Sin paredes de texto.
- Los claims del reporte se etiquetan por su veredicto; nada WOUNDED o KILLED se re-afirma
  sin su cota.
- Breakpoint obligatorio: veredictos al `wiki/` de la página afectada (bloque de conflicto
  con el run id) y episodio completo al backend de memoria del proyecto, si existe. Si un
  veredicto contradice una página del wiki, se escribe un bloque `> WARNING, CONFLICT
  (fecha):`, nunca una sobrescritura muda. Si el backend de memoria no está conectado en la
  sesión, dilo en el reporte en vez de saltártelo en silencio.
- Si el proyecto lleva un registro de cambios por archivo y la corrida reveló por qué un
  archivo es como es, esa razón va a ese registro. Es exactamente el contenido que ese tipo
  de registro existe para guardar.
- **No postear nada a ningún canal externo.** El draft final queda en manos del operador.

---

## Lecciones cableadas (inyéctalas en los prompts cuando apliquen)

**Verificación de deploy, tres trampas medidas (aplican en cualquier proyecto con
contenedores en la nube):**

- Un push multi-arquitectura escribe el índice **más** un manifest por arquitectura, así
  que el digest vivo del servicio nunca empata con el del tag. Se lee idéntico a "prod trae
  imagen vieja" y no lo es. **Comparar `createTime` antes de concluir.**
- `conditions.status=True` miente: dice que la revisión arrancó, no que la app sirve.
- Un 302 de un proxy de autenticación miente: solo prueba que el proxy está enfrente. Lo
  único que prueba que la app sirve son **200 reales en el log del contenedor**.
- Desplegar y migrar son pasos separados. Un deploy exitoso sobre una base sin migrar reporta
  éxito. Ese error se cometió tres veces seguidas en un mismo proyecto.

**Atribución y evidencia:**

- `updated_at` solo prueba al ÚLTIMO writer. `created ≈ updated` con delta de microsegundos
  es firma de un solo INSERT.
- "No hay fila hermana" no prueba nada si el código hace hard-deletes y los writes no dejan
  audit trail.
- Un histograma de inserts por día responde "¿existió antes?" mejor que cualquier flag.
- Atribuir un write pide varias señales juntas: IP del caller, cadencia (tick automático vs
  ritmo humano), fingerprint de timestamps y audit stamps. Nunca una sola.
- La ausencia de acción de un sistema automático es un hallazgo de primera clase, no ruido.
  Una tabla de configuración que nadie lee, un cron que no escribió, una regla que no
  disparó: eso ES el hallazgo.
- Las cotas de una observación (n=1, "no es SLA", "inferido, no medido") sobreviven a
  cualquier recorte de texto. Si no caben, se debilita el claim, no se quita el caveat.

**Guards que pasan de noche:**

- Un guard que valida el PATH de una ruta no valida los VALORES del query string. Una ruta
  perfectamente válida con un valor de enum muerto devuelve 400 y tira la pantalla completa.
- Una suite verde no prueba que el cliente pide las URLs que el servidor expone. Ese hoyo
  dejó el botón principal de un producto devolviendo 404 en producción durante semanas con
  219 tests pasando.
- Una fecha no se asume nunca: se corre `date`. Y un compromiso no existe si no está escrito
  donde se escriben los compromisos. Una junta en el calendario no es un deadline.

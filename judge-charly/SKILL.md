---
name: judge-charly
description: Pelotón de fusilamiento adversarial para teorías, diagnósticos y drafts. Extrae los claims de la teoría en juego, lanza vía Workflow (ultracode) un refuter despiadado por claim (ingeniero amargado con 100 años de experiencia cuya única misión es matar el claim con evidencia reproducible) con acceso real read-only a los entornos que declare el operador (código, host de staging, logs, DB de solo lectura) y a la evidencia capturada, y cierra con una síntesis que entrega tabla de veredictos, hoyos abiertos y un draft que solo afirma lo que sobrevivió. Usar cuando el operador diga /judge-charly, "fusila esto", "refuta la teoría", "mándale los refuters", o antes de postear cualquier claim de mecanismo a un canal externo. Invocar este skill ES el opt-in a Workflow.
---

# /judge-charly — el pelotón de fusilamiento

> Por qué existe: un draft que suena seguro puede afirmar un mecanismo falso, y el draft
> escrito para corregirlo puede repetir el error. Fusilarlos claim por claim con refuters
> adversariales no solo los mata: suele encontrar la verdad que nadie tenía (el primer
> evento real, una prueba en vivo en otro caso, un hoyo propio en el automatismo).
> Este skill reproduce ese proceso a demanda.

## Requisitos

- **Claude Code con el tool Workflow** (ultracode / orquestación multi-agente). Sin Workflow,
  fallback: lanzá los refuters como subagentes `Agent` en paralelo (uno por claim, mismo
  prompt y mismo schema) y un subagente sintetizador al final.
- **Los entornos que el operador declare para la corrida** (todos opcionales, todos read-only):
  - un checkout local del código;
  - un host de staging por SSH: un alias en `~/.ssh/config` con llave, no interactivo;
  - rutas de logs (locales o en ese host);
  - una DB de solo lectura: su URL en una variable de entorno (por defecto
    `JUDGE_CHARLY_DB_URL`, el operador puede nombrar otra) y el cliente CLI de esa DB
    (`psql`, `mysql`, `sqlite3`...). Ideal: un rol de DB que solo tenga `SELECT`;
  - una carpeta de evidencia capturada (`<evidence-dir>/<caso>/`).
- **Opcional:** un wiki del proyecto y MemPalace (github.com/mempalace/mempalace) para
  registrar los veredictos. Sin ellos, los veredictos van a `docs/reports/<slug>-verdicts.md`.

Sin ningún entorno declarado, los refuters trabajan solo con el código y la evidencia, y todo
claim sobre lo que corre en vivo sale como UNVERIFIABLE salvo que la evidencia lo pruebe.

## Cuándo dispara

- El operador lo invoca (`/judge-charly`, "fusila esto", "refuta la teoría").
- Su invocación cuenta como opt-in explícito a multi-agent orchestration: llama a Workflow
  directamente, sin pedir permiso extra.

## Proceso

### 1. Extraer los claims

De la teoría/draft/diagnóstico en juego (lo que el operador señale, o el deliverable más
reciente de la sesión), extrae **cada afirmación factual como claim independiente y
atacable**. Reglas:

- Un claim = una afirmación de mecanismo o de hecho, no un tema. "El re-download actualiza
  in place" y "el cron lo habría curado" son DOS claims.
- Incluye SIEMPRE los dos claims que nadie pone:
  - **El claim meta:** que el código/binario/config que estamos leyendo sea de verdad lo
    que corre donde ocurrió el comportamiento observado (drift de deploy = hoyo válido).
  - **El claim del perro que no ladró:** si la teoría implica que algo automático debió
    actuar y no actuó, ese silencio es un claim a atacar por sí mismo.
- 4 a 8 claims. Si salen más, fusiona los débiles; si salen menos de 3, el skill es
  overkill: dilo y ofrece verificar inline.
- Muestra la lista de claims en el mensaje de arranque (una línea cada uno) y LANZA. No
  esperes aprobación de la lista.

### 2. Lanzar el Workflow

Estructura fija: `parallel` de un refuter por claim (fase "Matanza") y un sintetizador
(fase "Sintesis"). Refuters y síntesis con `effort: 'high'`. Presupuesto por defecto:
claims + 1 agentes; no agregues rondas extra salvo que el operador pida más plomo.

**Persona CTX (pégala al inicio del prompt de cada refuter, adaptando la sección de
acceso al proyecto en juego):**

```
You are a bitter engineer with 100 years of experience who hates the world and ESPECIALLY
hates confident claims. Your ONLY mission: find holes in the claim below and kill it. You
get zero credit for confirming anything. Default to KILLED or UNVERIFIABLE if evidence is
thin. A code read is NEVER live proof. "Consistent with" is NOT proof. Distinguish what
you MEASURED from what you INFERRED, and treat inferences as targets.
```

**Bloque de acceso.** Se arma SOLO con los entornos que el operador nombró para esta corrida;
si no nombró ninguno, el bloque dice "código + evidencia, nada en vivo". Forma de cada uno:

- **Código:** `<ruta del checkout>`. Advertir en el prompt: NO garantizado byte-idéntico a lo
  que corre; el drift es un hoyo válido. Anotar rama y commit leídos.
- **Host de staging:** `ssh <alias-que-nombró-el-operador> "..."`, solo comandos de lectura
  (`cat`, `ls`, `grep`, `git log`, `journalctl` con y sin `sudo -n`, `systemctl status`,
  sqlite con `-readonly`). Repo y logs en las rutas que el operador indique.
- **DB de solo lectura:** `PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30s' psql "$JUDGE_CHARLY_DB_URL" <<'SQL' ... SQL`
  (o el equivalente de solo lectura del motor que sea). El prompt nombra la VARIABLE,
  nunca pega su valor. Si el esquema usa identificadores con mayúsculas (típico de un ORM),
  van entre comillas dobles. Timestamps SIEMPRE a precisión completa
  (`to_char(x,'YYYY-MM-DD HH24:MI:SS.US')`). Nunca filtrar soft-deleted salvo que el claim
  lo exija: las filas hermanas/borradas son evidencia.
- **Logs:** las rutas que el operador declare.
- **Evidencia capturada:** `<evidence-dir>/<caso>/`: instruir LEER los archivos, no
  confiar en resúmenes de ellos.

**Rieles de seguridad (hard rules en cada prompt, sin excepciones):**

- **READ-ONLY absoluto:** cero INSERT/UPDATE/DELETE/DDL/TRUNCATE, cero writes en hosts,
  cero restarts o reloads, cero deploys, cero posts a canales o tickets.
- **Solo lo declarado:** únicamente los hosts, DBs y rutas que el operador nombró para esta
  corrida. Nada de descubrir hosts nuevos ni saltar desde el host declarado a otro.
- **Producción nunca se escribe.** Por defecto ni se toca; si el operador declara
  explícitamente un recurso de producción, es solo lectura y con queries acotados.
- **CERO PII:** jamás SELECT/print de nombre, email, teléfono, dirección ni datos de pago;
  solo ids, timestamps, status, montos y conteos.
- **Queries acotados:** LIMIT + WHERE dirigido, con timeout.
- **Si un ángulo de ataque exige escribir algo para probarlo, el refuter NO lo hace:** el
  claim sale UNVERIFIABLE y el experimento propuesto va en `residual_risk`.

**Ángulos de ataque por claim:** escribe 3-5 ángulos concretos y específicos en el prompt
de cada refuter (qué query correr, qué archivo leer, qué hipótesis rival probar). Un
refuter sin ángulos escritos regresa retórica.

**Schema del refuter** (usar tal cual):

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["claim_id", "verdict", "kill_shot", "measured", "inferred", "residual_risk", "surviving_form"],
  "properties": {
    "claim_id": {"type": "string"},
    "verdict": {"type": "string", "enum": ["KILLED", "WOUNDED", "SURVIVES", "UNVERIFIABLE"]},
    "kill_shot": {"type": "string", "description": "Strongest concrete evidence against the claim (query+output, file+line, log line). Empty only if SURVIVES."},
    "measured": {"type": "array", "items": {"type": "string"}},
    "inferred": {"type": "array", "items": {"type": "string"}},
    "residual_risk": {"type": "string"},
    "surviving_form": {"type": "string", "description": "Strongest version of the claim that honestly survives, or empty"}
  }
}
```

**Sintetizador** (recibe el JSON completo de los refuters): entrega
`verdict_table` (claim, veredicto, razón en una línea), `open_holes` (todo lo expuesto que
la teoría no cubre, especialmente los silencios), `final_draft` (la versión corregida del
deliverable en juego que SOLO afirma lo medido, con las cotas honestas de lo herido, corto,
sin em dashes, y EN EL REGISTRO DEL LECTOR del deliverable: si el destino es soporte/cliente/
producto, resultado + qué hacer con CERO mecánica — nada de HTTP codes, caps, caches ni
forensia de logs, un solo "as of"; la mecánica va en verdict_table/open_holes para el
operador, no en el draft) y `notes_for_operator` (máximo 5 bullets en español: decisiones y
riesgos antes de actuar).

### 3. Reportar y registrar

- Reporte al operador CORTO: primero qué se volteó, luego qué sobrevivió, luego el draft
  final, luego las notas. Sin paredes de texto.
- Los claims del reporte se etiquetan por su veredicto; nada WOUNDED/KILLED se re-afirma
  sin su cota.
- Breakpoint obligatorio: veredictos al wiki de la página afectada (bloque ⚠️ con el run id)
  y episodio completo a MemPalace (`mempalace_add_drawer`, wing del proyecto), si el proyecto
  los tiene; si no, a `docs/reports/<slug>-verdicts.md`. Si un veredicto contradice una
  página del wiki, bloque CONFLICT, nunca sobrescritura muda.
- No postear nada a ningún canal externo; el draft final queda en manos del operador.

## Lecciones cableadas (inyéctalas en los prompts cuando apliquen)

- Un `updated_at` solo prueba al ÚLTIMO writer. `created≈updated` con delta de microsegundos
  es firma de un solo INSERT (el código leyó el reloj dos veces en la misma operación).
- "No hay fila hermana" no prueba nada si existen hard-deletes en el código y los writes
  no dejan audit trail.
- Un histograma de inserts por día responde "¿existió antes?" mejor que cualquier flag.
- Las cotas de una observación (n=1, "no es SLA") sobreviven a cualquier recorte de texto;
  si no caben, se debilita el claim, no se quita el caveat.
- La ausencia de acción de un sistema automático ("el cron no escribió nada") es un
  hallazgo de primera clase, no ruido.
- Atribuir un write: caller IP + cadencia (tick vs ritmo humano) + fingerprint de
  timestamps + audit stamps, nunca uno solo de esos.

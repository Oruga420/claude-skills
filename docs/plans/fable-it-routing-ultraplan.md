> **Last updated:** 2026-08-03
> **Tags:** ultraplan, fable-it, orchestrator, subagents, routing
> **Related:** `commands/fable-it.md`, `~/.claude/skills/ultraplan/SKILL.md`
> **Status:** PLAN ONLY — nada de esto está implementado. Corrida de prueba (mockup) de `/ultraplan`.

# Ultraplan — `/fable-it`: hacer que la routing table sea ejecutable

## 0. Nota de honestidad sobre esta corrida

Esto es una corrida de prueba pedida como mockup. Dos desviaciones del contrato de `/ultraplan`,
declaradas en lugar de escondidas:

1. **No se lanzaron los 3-5 agentes de exploración en paralelo.** El blanco es un archivo de 52 líneas
   más dos directorios; un fan-out de 5 agentes sobre eso habría sido teatro, no investigación. La
   exploración se hizo inline y cada hallazgo abajo trae su evidencia (archivo + línea, o el comando
   que se corrió).
2. **No hay artefacto HTML.** El skill `report-it` no existe en esta máquina
   (`find ~/.claude -iname "*report-it*"` → vacío; tampoco está en `Desktop/claude-code-skills/`).
   El contrato de `/ultraplan` §3g dice: si falta el renderer, markdown solo y decirlo. Esto es decirlo.

---

## 1. Resumen ejecutivo

`/fable-it` es un command file (prompt) que pone a la sesión principal en modo orquestador y le da una
routing table: exploración → `scout` (Haiku), implementación → `fast-worker` (Sonnet), arquitectura →
`deep-reasoner` (Opus). **Ninguno de esos tres agentes existe.** `~/.claude/agents/` no está creado, así
que los nombres de la tabla no resuelven a nada en el harness — funcionan sólo porque el modelo los
traduce a mano a los agent types que sí existen. La corrección es crear las tres definiciones de agente
que la tabla ya presupone, y ajustar el texto de la tabla para que apunte a ellas. Resultado esperado:
`/fable-it` deja de depender de que el orquestador adivine bien y el ruteo por modelo (el punto entero
del skill: Haiku para inventarios, Fable para juicio) queda como configuración, no como sugerencia.

---

## 2. Hallazgos que cambian el pedido

| # | Hallazgo | Evidencia |
|---|---|---|
| 1 | `~/.claude/agents/` **no existe** → `scout`, `fast-worker`, `deep-reasoner` no son agent types resolvibles | `test -d ~/.claude/agents` → `MISSING`; tampoco hay `agents/` en `~/.claude/plugins/` |
| 2 | Los agent types reales de esta sesión son otros | `claude`, `claude-code-guide`, `Explore`, `general-purpose`, `Plan`, `statusline-setup` |
| 3 | Corridas pasadas **mapearon a mano** los nombres de la tabla | `~/.claude/projects/.../subagents/agent-a0d0ea92e68bf2e1b.meta.json` → `{"agentType":"Explore","description":"Scout backend API surface"}` — la palabra "Scout" quedó en la descripción, el agentType real fue `Explore` |
| 4 | `fable-it.md` está **duplicado y byte-identical** en dos rutas | `diff ~/.claude/commands/fable-it.md Desktop/claude-code-skills/commands/fable-it.md` → `IDENTICAL`. Cualquier edición es edición doble o hay drift |
| 5 | La columna "Model" de la tabla no es configuración | `fable-it.md:24-30`. Un command file no puede fijar el modelo de un subagente; sólo el parámetro `model` de la llamada Agent puede. Hoy es prosa persuasiva |

**Asunción (sin verificar):** que `.meta.json` registre el `agentType` implica que se puede auditar el
ruteo después de una corrida. No confirmé que registre también el **modelo** efectivo — el archivo
inspeccionado no traía campo de modelo. El paso de verificación 3.2 depende de esto y puede necesitar
otro método.

---

## 3. Comparación de enfoques

| Criterio | A — Sólo prompt | B — Definir los 3 agentes | C — Convertir a Workflow |
|---|---|---|---|
| Qué se hace | Reescribir la tabla para nombrar agent types reales + params de modelo | Crear `~/.claude/agents/{scout,fast-worker,deep-reasoner}.md` con frontmatter `model`/`tools`; la tabla queda válida | Reescribir `/fable-it` como script de `Workflow` con phases, schemas y fan-out determinista |
| Complejidad | Baja | Baja-media | Alta |
| Riesgo | Medio — sigue dependiendo de que el modelo obedezca prosa | Bajo — el harness resuelve los nombres | Bajo en ejecución, alto en construcción |
| Esfuerzo | 1 archivo (×2 copias) | 3 archivos nuevos + 1 edición chica (×2) | 1 script nuevo + reescritura + pruebas |
| Reversibilidad | Fácil | Fácil (borrar 3 archivos) | Difícil |
| Reutilizable por otros commands | No | **Sí** — `/orchestrate`, `/multi-plan`, etc. pueden usar los mismos agentes | No |
| Requiere opt-in del usuario por corrida | No | No | **Sí** — `Workflow` exige opt-in explícito |

**Recomendado: B**, con el retoque de tabla de A como sub-paso. B hace que la tabla sea literalmente
cierta, deja intacta la prosa de juicio del skill (que es la parte buena), y las tres definiciones
quedan disponibles para los otros ~40 commands del repo. C se descarta para este alcance: el opt-in
obligatorio de `Workflow` rompe el uso casual de `/fable-it`.

---

## 4. Plan de ejecución (DAG)

```
Fase 1 (paralelo — nada depende de nada):
  ├── 1.1  Escribir ~/.claude/agents/scout.md          (model: haiku;  tools: Glob, Grep, Read, Bash)
  ├── 1.2  Escribir ~/.claude/agents/fast-worker.md    (model: sonnet; tools: *)
  ├── 1.3  Escribir ~/.claude/agents/deep-reasoner.md  (model: opus;   tools: all-except-write)
  └── 1.4  Escribir scripts/check-command-drift.sh     (diff ~/.claude/commands ↔ repo commands)

Fase 2 (depende de Fase 1):
  ├── 2.1  Parchar la routing table de fable-it.md:24-30
  │          - nombrar los agentes por su slug real
  │          - agregar línea: "los executors se resuelven vía ~/.claude/agents/"
  │          - marcar la columna Model como derivada del frontmatter, no del prompt
  └── 2.2  Sincronizar la copia de ~/.claude/commands/fable-it.md

Fase 3 (depende de Fase 2) — smoke test:
  ├── 3.1  Reiniciar Claude Code; confirmar que los 3 agentes aparecen en la lista de agent types
  ├── 3.2  Correr /fable-it con una tarea trivial; grepear
  │          ~/.claude/projects/<slug>/<session>/subagents/*.meta.json
  │          y confirmar agentType == scout | fast-worker | deep-reasoner (ya no "Explore")
  └── 3.3  Si .meta.json no registra el modelo → buscar otra vía (asunción del §2)

Fase 4 (paralelo con Fase 3):
  ├── 4.1  Documentar el patrón en el README del repo de skills
  └── 4.2  Enganchar check-command-drift al hook de SessionStart

Fase 5 (final):
  └── 5.1  Verificación contra el spec original de fable-it.md + commit en el repo de skills
```

Paralelismo real: 4 tareas en Fase 1 son independientes entre sí; Fase 4 no toca nada de lo que Fase 3
lee. Fases 2, 3 y 5 son estrictamente secuenciales — no las inflo en "sub-fases".

---

## 5. Matriz de riesgo

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Los slugs nuevos colisionan con agent types built-in y el harness prefiere el built-in | Baja | Medio | Verificar la lista de agent types en 3.1 antes de tocar `fable-it.md`; renombrar a `fable-scout` etc. si hay choque |
| Drift entre las dos copias de `fable-it.md` (ya son idénticas hoy, es cuestión de tiempo) | Alta | Bajo-Medio | 1.4 + 4.2: guard de drift automatizado |
| `deep-reasoner` fijado a Opus por frontmatter → se dispara en tareas triviales y quema tokens | Media | Medio | La regla de ruteo de `fable-it.md:32` va en la description del agente, no sólo en el command; el orquestador lee la description al elegir |
| No se puede auditar el modelo efectivo (asunción del §2) | Media | Bajo | El plan ya lo aisla en 3.3; si falla, la verificación se degrada a "agentType correcto" y se dice así |
| El skill asume sesión en Fable 5 (`fable-it.md:15`) y este plan no hace nada al respecto | Baja | Bajo | Fuera de alcance; se deja anotado, no se resuelve en silencio |

---

## 6. Archivos afectados

```
Creados:
  ~/.claude/agents/scout.md
  ~/.claude/agents/fast-worker.md
  ~/.claude/agents/deep-reasoner.md
  Desktop/claude-code-skills/scripts/check-command-drift.sh
  Desktop/claude-code-skills/docs/plans/fable-it-routing-ultraplan.md   ← este archivo

Modificados:
  Desktop/claude-code-skills/commands/fable-it.md   (líneas 24-32)
  ~/.claude/commands/fable-it.md                    (misma edición, copia espejo)
  Desktop/claude-code-skills/README.md              (sección del patrón)

Borrados:
  ninguno
```

---

## 7. Checklist de verificación

```
Pre-implementación:
  [ ] git -C Desktop/claude-code-skills status limpio (o branch nuevo)
  [ ] Guardar copia de fable-it.md antes de tocar (ya está versionado en el repo)
  [ ] Confirmar la lista actual de agent types para descartar colisión de slugs

Post-implementación:
  [ ] Reinicio de Claude Code y los 3 agentes aparecen en la lista de agent types
  [ ] /fable-it sobre tarea trivial despacha con agentType == scout (no Explore) — evidencia en .meta.json
  [ ] Las dos copias de fable-it.md siguen byte-identical (check-command-drift pasa)
  [ ] Ningún otro command del repo rompió por los agentes nuevos (grep de los 3 slugs)
  [ ] Revisar el diff antes de commitear
```

---

## Procedencia

Investigado inline por 1 sesión (0 agentes de exploración — ver §0), sobre `commands/fable-it.md`
(52 líneas), `~/.claude/agents/` (inexistente), `~/.claude/commands/`, `~/.claude/plugins/` y 1 registro
`subagents/*.meta.json` de una corrida previa. **Nada de este plan está implementado.** Todo hallazgo
sin archivo, línea o comando detrás está etiquetado como asunción en §2.

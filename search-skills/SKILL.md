---
name: search-skills
description: Busca skills relevantes en tu clon local del repo publico de skills (github.com/Oruga420/claude-skills, ruta en `SKILLS_REPO`, por defecto `~/claude-skills`) usando palabras clave o una descripcion de tarea. Lee su `SKILLS_INDEX.yaml` y devuelve los matches con nombre, activacion, categoria y cuando usarlos.
---

# Search Skills

Buscador del catalogo de skills en tu clon local del repo publico `github.com/Oruga420/claude-skills`.

## Requisitos

- `git` para clonar el repo una vez.
- Un clon local del repo. La ruta sale de la variable de entorno `SKILLS_REPO`; si no esta definida, se usa
  `~/claude-skills`. En adelante `$SKILLS_REPO` significa esa ruta ya resuelta.
- El archivo `$SKILLS_REPO/SKILLS_INDEX.yaml` (viene en el repo).
- Opcional: el skill `skill-shed` (viene en el mismo repo) como fallback remoto cuando la busqueda local no encuentra nada.
- Sin API keys ni cuentas.

## Cuando activar

- Usuario ejecuta `/search-skills <query>`
- Usuario pregunta "que skill hay para X?"
- Usuario pide un skill que no esta en el `skills.yaml` local del proyecto (si el proyecto usa uno)
- Otro skill (por ejemplo `/newproject`, si esta instalado) invoca este skill para sugerir skills segun una descripcion

## Workflow

### Paso 1: Resolver la ruta y validar que el repo existe

Resolver `SKILLS_REPO` (variable de entorno; si no existe, `~/claude-skills`) y verificar que exista
`$SKILLS_REPO/SKILLS_INDEX.yaml`.

Si no existe, responder:
```
El repo de skills no esta clonado. Clonalo con:
  git clone https://github.com/Oruga420/claude-skills.git ~/claude-skills
(o clonalo donde quieras y apunta SKILLS_REPO a esa carpeta)
```

### Paso 2: Leer el indice

Leer `$SKILLS_REPO/SKILLS_INDEX.yaml` completo. Cada entrada trae `name`, `folder`, `activation`, `triggers`,
`use_when`, `examples`, `category` y a veces `avoid_when`.

### Paso 3: Matchear la query

Dada una query del usuario (ej. "necesito tests para django" o "security audit"):

1. Tokenizar la query (lowercase, split por espacios)
2. Para cada skill en el yaml, calcular score:
   - +3 puntos si la query aparece en `name`
   - +2 puntos si aparece en `triggers`
   - +2 puntos si aparece en `examples`
   - +1 punto si aparece en `use_when`
   - +1 punto si aparece en `category`
3. Si la query aparece en `avoid_when` de un skill, bajarlo al final (o descartarlo)
4. Ordenar por score descendente
5. Devolver top 5 (o todos con score > 0 si son menos de 5)

### Paso 4: Presentar resultados

Formato:
```
Skills relevantes para "[query]":

1. [nombre] (activation: [slash o "ninguna"])
   Categoria: [categoria]
   Cuando usar: [use_when]
   Path: $SKILLS_REPO/[folder]

2. ...
```

Si hay 0 matches, sugerir:
- Revisar el repo directamente: `ls $SKILLS_REPO/`
- Proponer nombres similares si se puede (ej. pidio "testing" → sugerir `tdd-workflow`, `e2e-testing`, `eval-harness`)
- Usar `skill-shed` (si esta instalado) como fallback remoto para buscar mas skills fuera del clon local

### Paso 5: Ofrecer instalacion

Preguntar: "Quieres que instale alguno de estos en el proyecto actual?"

Si si:
1. Confirmar cual(es) con AskUserQuestion si no fue explicito
2. Verificar que el CWD tenga un `.claude/skills/` (si no, preguntar si crearlo)
3. Copiar con `cp -r "$SKILLS_REPO/<folder>" .claude/skills/`
4. Si el proyecto tiene un `skills.yaml` local, agregar la entrada (name, activation, category, triggers, use_when) del SKILLS_INDEX
5. Confirmar: "Skill [nombre] instalado." Si el proyecto tiene reglas de activacion propias (por ejemplo un `rules.md`
   que pide confirmacion antes de activar un skill), recordarlas.

## Tips

- La busqueda es contra el archivo yaml, no contra el contenido de cada SKILL.md (es mas rapido y el yaml esta curado)
- Si el usuario da una descripcion larga (ej. desde `/newproject`), extraer 3-5 keywords y matchear cada una
- Si el clon parece viejo (skills que el usuario menciona y no aparecen), sugerir `git -C "$SKILLS_REPO" pull`
- No copiar skills sin confirmacion — mostrar primero, preguntar despues

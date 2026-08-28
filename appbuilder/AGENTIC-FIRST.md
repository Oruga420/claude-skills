# AGENTIC-FIRST — Doctrina de la capa logica

Como se resuelve la logica en los proyectos que construye `/appbuilder`.
Sin em dashes en ningun output.

## Principio

La solucion por defecto es **un agente con un set de skills y tools creado para
resolver el problema**, no una implementacion imperativa del problema.

Lo programatico son las **tools** del agente. Lo agentico son las **skills**, y el
manejo de skills y workflows via `claude -p` con goals verificables.

Esto invierte el default de la ingenieria normal. La pregunta no es "como programo
esto", es "que agente resuelve esto, y que herramientas necesita".

## La escalera

De mas barato a mas caro. **Usa el escalon mas bajo que resuelva el problema.**

```
tool  ->  skill  ->  agente  ->  workflow
```

| Escalon | Cuando | Costo | Determinista |
|---|---|---|---|
| **tool** | la entrada y la salida son conocidas y la regla es fija | ~0 | si |
| **skill** | el procedimiento es conocido pero el criterio requiere juicio | 1 contexto | no |
| **agente** | hay que explorar, decidir el camino, e iterar | 1 contexto propio | no |
| **workflow** | hay fan out, fases con barrera, o verificacion adversarial | N contextos | no |

### El piso anti desperdicio

**No gastes un agente en lo que hace una funcion.** Sin este piso, "agentic-first"
degenera en spawnear un LLM para sumar dos numeros: mas lento, mas caro, y no
determinista donde no hacia falta.

Test para bajar de escalon: si puedes escribir el criterio de aceptacion como una
asercion (`assert f(x) == y`), es una tool. Si el criterio es "que quede bien" o
"que sea consistente con", es skill o agente.

Test para subir de escalon: si la tool necesitaria mas de tres ramas de `if` sobre
lenguaje natural o sobre contenido no estructurado, subela a skill.

## Como aterriza en el repo

```
<prefix><proyecto>/          prefijo work o personal, del perfil
  CLAUDE.md          contrato del proyecto y su goal
  wiki/              arise: index.md, log.md
  mempalace.yaml     wing propio del proyecto
  app/               azul   -> Next.js, solo presentacion
  agents/            morado -> un .md por agente (rol, goal, tools que puede usar)
  skills/            morado -> procedimientos que los agentes invocan
  tools/             negro  -> funciones puras, con unit test, sin LLM adentro
  goals/             check  -> criterios de aceptacion verificables
  harness/run.mjs           -> spawnea claude -p con el goal
  tests/e2e/                -> Playwright contra la app real
```

El color del boceto ya decide el folder. Ver `SKETCH-LANG.md`.

## Contratos por escalon

### Una tool debe

- Ser pura: misma entrada, misma salida, sin estado escondido.
- No contener LLM. Una tool que llama a un modelo es una skill mal clasificada.
- Tener unit test antes de considerarse hecha.
- Fallar ruidoso. Una tool que devuelve `null` en silencio corrompe al agente que
  la usa, y el agente va a alucinar alrededor del hueco.

Las tools son el **limite de confianza** del sistema. Todo lo determinista vive
aca, y es lo unico que se puede verificar sin correr un modelo.

### Una skill debe

- Declarar cuando se activa (el campo `description` es el router).
- Describir el procedimiento, no el resultado.
- Nombrar las tools que usa.

### Un agente debe

- Recibir un **goal**, no un procedimiento. El goal es el contrato; el camino lo
  elige el agente.
- Tener criterio de terminacion explicito y verificable.
- Tener acceso acotado: solo las tools que su rol necesita.

### Un goal debe ser verificable

Un goal que no se puede verificar no es un goal, es un deseo. Cada goal en
`goals/` se escribe como algo que una maquina puede comprobar:

| Mal | Bien |
|---|---|
| "que el dashboard se vea bien" | "GET / responde 200 y contiene un `<table>` con al menos 1 fila" |
| "que maneje errores" | "con la DB caida, la pagina responde 200 y muestra el texto de fallback" |
| "que sea rapido" | "el build termina y `/` pinta contenido en menos de 2s en Playwright" |

Regla heredada de `/appbuilder` Paso 3: **cada elemento visible del boceto se
convierte en un criterio verificable** antes de escribir codigo.

## Reglas duras

1. **Solo el negro se codea imperativo.** Si no es negro en el boceto, no lo
   escribas a mano.
2. **La capa web nunca contiene logica de negocio.** `app/` llama al harness y
   pinta el resultado. Si hay un `if` de negocio en un componente, esta mal puesto.
3. **Un agente por limite punteado del boceto.** No fusiones dos cajas punteadas
   en un agente "que hace las dos cosas".
4. **La verificacion la hace contexto fresco.** El agente que construyo no es el
   que juzga si cumplio. Heredado de `/appbuilder` Paso 4.
5. **Las decisiones van al wiki, no al chat.** `wiki/log.md` es el registro.

## Anti patrones

| Sintoma | Que pasa | Arreglo |
|---|---|---|
| Un agente que solo transforma datos | costo y no determinismo gratis | bajalo a tool |
| Una tool con un prompt adentro | mintio sobre ser determinista | subela a skill |
| Un goal sin asercion | nadie sabe si se cumplio | reescribelo como comprobable |
| Logica de negocio en `app/` | la UI se vuelve el sistema | mueve a `tools/` o `agents/` |
| El agente se autoevalua | pasa siempre | verificador de contexto fresco |
| Un agente con acceso a todo | radio de dano | acota sus tools a su rol |

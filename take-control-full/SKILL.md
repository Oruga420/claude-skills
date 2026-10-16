---
name: take-control-full
description: "La version que ademas construye. Corre el pipeline completo de /take-controlish — /ultraplan, fusilamiento con /judge-charly, calificacion 1-10 por un calificador de contexto fresco, gate en 9, contrato con /loop-builder y el mismo ciclo sobre el contrato — y cuando el contrato pasa con 9 NO para: arranca la construccion con /fable-it. El paquete (HTML del ultraplan, HTML del contrato y video narrado con una voz de ElevenLabs y musica) se entrega UNA sola vez, al final, ya con lo construido y verificado adentro. Usar cuando el operador diga /take-control-full, 'tomalo completo', 'planealo y construilo', o entregue una tarea que quiere ver terminada y no solo planeada. La version que para en el contrato para que el revise antes es /take-controlish."
---

# /take-control-full — hasta lo construido, en una sola entrega

Mismo pipeline que [`/take-controlish`](../take-controlish/SKILL.md), con una diferencia:
cuando el contrato pasa con 9, **no para a esperarte**. Arranca la construcción con `/fable-it`
y te entrega un solo paquete al final, con el plan, el contrato y lo que quedó construido.

Un solo momento de atención tuya, al final, en vez de dos.

## Requisitos

- **`/take-controlish` instalado al lado** (`../take-controlish/`): este skill sigue sus pasos
  1 a 8 y usa su `scripts/package.py` para el video. Todos sus requisitos aplican igual
  (ver su tabla): `/ultraplan`, `/judge-charly`, `/loop-builder`, `ELEVENLABS_API_KEY` +
  `ELEVENLABS_VOICE_ID`, ffmpeg/ffprobe, Python 3.9+, Node 18+ y npm.
- **`/fable-it`** para la construcción (paso 7).
- **Opcionales:** `/talk-to-me` (aviso por voz; sin él, el aviso va al chat), `/projectstatus`
  (status por breakpoint) y `TAKE_CONTROL_OPEN_CMD` (tu propio comando para abrir archivos).
- **Opcional, solo si se trabaja desde un ticket:** una CLI o integración autenticada de tu
  plataforma de tickets que pueda leer, comentar, adjuntar y transicionar.

## Cuándo dispara

- El operador escribe `/take-control-full`, "tomalo completo", "planealo y construilo".
- Una tarea que quiere ver terminada, no revisada a mitad de camino.
- Igual que su hermano, invocarlo es el opt-in explícito a orquestación multi-agente.

**Cuál de los dos:** si el operador quiere leer el contrato antes de que algo corra, es
`/take-controlish`. Si quiere el resultado, es este. Ante la duda, preguntá una vez.

## Trabajo desde plataformas de tickets

Aplicar este flujo **solo cuando el usuario encargue ejecutar un ticket** de Jira u otra plataforma. Una mencion de un ticket como contexto, una consulta de estado o una revision sin implementacion no lo activa. Sin ticket, conservar el flujo normal; no crear uno por iniciativa propia.

1. **Antes de empezar:** leer el ticket y su estado, pasarlo a `In Progress` o su equivalente real y verificar la transicion antes de investigar y construir. Si ya esta en progreso, no repetirla; si esta cerrado, no reabrirlo automaticamente. Usar el workflow existente, sin modificar el board ni otros tickets.
2. **Antes de construir:** completar ultraplan y contrato loop-builder, pasar ambos por judge-charly y el calificador independiente con nota minima 9/10 y los limites de rondas del pipeline. Conservar las versiones exactas aprobadas y sus dictamenes. Publicar en el ticket un comentario con la solucion decidida, alcance, dependencias, riesgos y pruebas previstas; adjuntar el plan, contrato, dictamenes y documentacion necesaria para entender y reproducir la solucion. Verificar comentario y attachments antes de comenzar el codigo. Las actualizaciones del ticket ocurren durante el trabajo aunque el paquete final del skill se entregue una sola vez.
3. **Durante la construccion:** actualizar el ticket en hitos reales, con avances verificables, resultados de pruebas, bloqueos y siguiente paso; no afirmar terminado lo que solo esta planeado. Mover subtareas cuando empiece o termine su trabajo real, sin arrastrar estados en bloque.
4. **Si cambia la solucion:** detener la construccion afectada, versionar el cambio y su motivo, actualizar ultraplan y contrato, y volver a pasar ambos por los ciclos de revision y aprobacion independientes, con el mismo minimo 9/10 y limite de rondas. Comentar la decision revisada y adjuntar las nuevas versiones aprobadas antes de reanudar. Conservar las anteriores e indicar cuales quedan sustituidas. Una correccion de codigo que cumple la solucion ya aprobada requiere sus pruebas y revision de codigo, pero no reinicia el plan salvo que cambie la solucion, alcance, dependencias, riesgos, estrategia de pruebas o criterios de aceptacion. No reiniciar contadores silenciosamente para eludir el limite de rondas.
5. **Al cerrar:** publicar evidencia real contra los criterios de aceptacion y adjuntar la documentacion final. Usar el estado que corresponda al workflow: construccion local, MR abierto, pruebas aprobadas, merge y deploy son hitos distintos. No marcar Done si falta un criterio requerido.

El encargo de ejecutar desde un ticket comprende estas actualizaciones del ticket dentro del alcance autorizado; no pedir permiso de nuevo si ya existe. No autoriza escribir a terceros fuera de ese ticket, ampliar alcance, hacer push, merge o deploy ni levantar freezes. Si faltan permisos, transicion valida o capacidad de adjuntar, registrar el bloqueo concreto y conservar los archivos localmente; no fingir el paso ni saltar el gate previo a construir. Preferir herramientas autenticadas disponibles. Verificar el resultado antes de reintentar una escritura incierta para evitar duplicados.

Los attachments deben ser accesibles al lector del ticket, sin secretos ni rutas locales como unica referencia. Cuando se citen archivos de soporte, incluirlos junto con planes y contratos en un ZIP con indice relativo y versiones o SHAs. Guardar IDs de comentarios, attachments y versiones aprobadas en State/Logs.

## El pipeline

```
tarea
  └─ 1-6. el pipeline completo de /take-controlish  ──► contrato con nota ≥ 9
       │      (ultraplan → judge-charly → calificador fresco → gate 9 → loop-builder
       │       → mismo ciclo sobre el contrato → gate 9)
       │      ...pero SIN empaquetar y SIN avisar todavia
       └─ 7. /fable-it construye contra el contrato
            └─ 8. verificacion contra los criterios de aceptacion
                 └─ 9. paquete unico: 2 HTML + video, ya con lo construido
                      └─ 10. aviso (/talk-to-me si esta instalado)
```

### 1-6. El pipeline de take-controlish

Leé `../take-controlish/SKILL.md` y **seguilo tal cual, pasos 1 a 6**: ultraplan, fusilamiento,
calificador de contexto fresco contra la rúbrica de 10 criterios, gate en 9 con techo de 5
rondas, contrato con `/loop-builder`, y el mismo ciclo sobre el contrato.

Las rúbricas, los techos y la regla de las 5 rondas son **las mismas**. No las relajes porque
este modo vaya a construir: al revés, acá el plan malo se convierte en código malo.

**Dos cosas cambian:**

- **No empaquetes al pasar el contrato.** El paso 7 de take-controlish (los tres artefactos) y
  el 8 (el aviso) se corren una sola vez, acá, al final.
- **Si el gate no llega a 9 en cinco rondas, no construís.** Parás igual que take-controlish:
  escribís qué criterios siguen caídos y llamás al operador (con `/talk-to-me` si está
  instalado; si no, en el chat). Construir sobre un contrato reprobado es exactamente lo que
  este skill existe para no hacer.

### 7. Construir con /fable-it

Con el contrato aprobado, corré `/fable-it` pasándole **el contrato**, no la tarea original:

```
/fable-it Construí lo que especifica loops/<name>/README.md. El contrato es la fuente de
verdad: sus criterios de aceptación son la definición de terminado, sus Boundaries son
límites duros, y su alcance negativo dice qué NO tocar.
```

`/fable-it` orquesta: vos juzgás, los subagentes escriben. Recordá su propia regla — nunca
escribas boilerplate a mano, y usá un verificador de contexto fresco separado.

**Los Boundaries del contrato mandan sobre la velocidad.** Si el contrato dice que algo escala
al operador, escala al operador aunque frene la construcción.

### 8. Verificar contra los criterios, uno por uno

Cada criterio de aceptación del contrato se corre y se anota con su salida real. No con "pasó":
con la salida.

- **Verde** = el comando corrió y devolvió exactamente lo que el criterio dice.
- **Rojo** = arreglás y volvés a correrlo.
- **No corrido** = no es verde. Si no lo podés correr (falta un acceso, hay un recurso
  congelado), es un **bloqueo**, se declara como bloqueo y va al video y al HTML como tal.

Un criterio rojo o bloqueado **no se esconde**: el paquete lo muestra. Reportar terminado con
un criterio sin verificar es el único error que este skill no perdona.

### 9. El paquete — una sola vez, con lo construido adentro

Igual que el paso 7 de take-controlish, con `"mode": "full"` en el spec. Eso cambia el acento
del video a ámbar y la insignia final de "esperando tu visto bueno" a **"construido"**.

El contenido del spec cambia de tiempo verbal:

| Campo | En take-controlish | Acá |
|---|---|---|
| `phases[].detail` | lo que se va a hacer | lo que se hizo, **con la evidencia** — "hecho: 14 tests verdes" |
| `contract.acceptance[].green` | la condición esperada | la condición, y si un criterio quedó rojo o bloqueado, decilo en el texto |
| `status.headline` | "el contrato está listo para tu revisión" | qué quedó construido |
| `status.detail` | cómo pasó el gate | la evidencia de verificación: cuántos criterios verdes de cuántos |
| `status.next` | qué revisar | qué tiene que **autorizar** (revisar el diff, dar el go para el push o el deploy) |

```bash
python ~/.claude/skills/take-controlish/scripts/package.py \
  --spec <scratchpad>/spec.json \
  --out  docs/reports/<slug>-take-control.mp4 \
  --bgm tech --open
```

El script vive en take-controlish y este skill lo usa desde ahí — un solo pipeline de video, no
dos copias que se desincronizan. Si alguna apertura falla (código de salida 5), el paquete no
está entregado: decilo y da las rutas.

**La narración sigue la misma regla:** el lector es el operador. Resultado primero, qué
autorizar después, cero mecánica. La escena `status` termina en la decisión que le toca a él.

### 10. El aviso

Con `/talk-to-me` si está instalado; si no, como último mensaje del chat:

> **&lt;nombre&gt;** quedó construido. El contrato pasó con **&lt;nota&gt;** y
> &lt;N&gt; de &lt;M&gt; criterios están verdes. Te dejé abiertos el plan, el contrato y el video.
> No pusheé ni desplegué nada: eso espera tu go.

Si algún criterio quedó rojo o bloqueado, **decilo en el aviso**, no solo en el HTML.

---

## Reglas duras

Todas las de `/take-controlish`, más:

- **Construir no es publicar.** Este skill escribe código, corre tests y deja ramas locales.
  **Ningún push a rama compartida, ningún merge, ningún deploy y ningún post a canal externo**
  sin permiso puntual del operador en el mismo intercambio. Abrir una rama propia y commitear
  ahí sí es autónomo.
- **Nada de squash.** Merge commits, salvo autorización explícita para esa MR.
- **Breakpoints:** ultraplan aprobado, contrato aprobado, build verificado y paquete entregado.
  En cada uno, `/projectstatus` (si está instalado) sin pedir permiso.
- **Rastro de lo que git no ve:** cualquier cambio que git no vea (deploy, VM, config remota)
  queda registrado (por ejemplo en `<tree-root>/.claude/bitacora.jsonl`) antes de contar como
  hecho.
- **Reporte honesto:** si un test falla, se dice con la salida. Si un paso se saltó, se dice.
  Lo verificado se afirma sin hedging; lo inferido se marca como inferido.

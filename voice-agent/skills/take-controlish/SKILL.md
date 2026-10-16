---
name: take-controlish
description: "Toma una tarea y la lleva sola hasta un contrato de loop aprobado, sin ejecutarla. Corre /ultraplan, fusila ese ultraplan con /judge-charly, lo hace calificar 1-10 por un calificador de contexto fresco contra una rubrica fija, y NO avanza mientras no saque 9. Con el ultraplan aprobado corre /loop-builder para escribir el contrato y repite el mismo ciclo de revision sobre el contrato. Entrega tres cosas abiertas en pantalla: el HTML del ultraplan, el HTML del contrato y un video con voz sintetizada y musica de fondo, y avisa por /talk-2-me. Usar cuando el operador diga /take-controlish, 'toma el control de esto', 'llevalo hasta el contrato', o entregue una tarea compleja que quiere revisar antes de dejar avanzar. La version que ademas construye es /take-control-full."
---

# /take-controlish, de la tarea al contrato aprobado, sin tocar nada

Toma una tarea, la planea a fondo, la somete a un pelotón de fusilamiento, la hace calificar
por alguien que no la escribió, y **para en seco antes de ejecutar**. Lo que te entrega es un
paquete que se revisa en tres minutos: dos páginas HTML abiertas y un video narrado.

La regla que define el skill: **nada avanza con menos de 9**. Ni el ultraplan, ni el contrato.

Hermano mayor: [`/take-control-full`](../take-control-full/SKILL.md), mismo pipeline, pero al
pasar el contrato arranca la construcción con `/fable-it` y te entrega el paquete al final,
ya con lo construido adentro.

## Requisitos

| Qué | Dónde | Si falta |
|---|---|---|
| `ELEVENLABS_API_KEY` | env, `<skill>/.env`, o el `.env` de talk-2-me (`~/.claude/talk2me/.env`) / talk-to-me (`~/.claude/talk-to-me/.env`) | `package.py` sale con código 3 |
| `ELEVENLABS_VOICE_ID` | env, `<skill>/.env`, o la voz ya configurada en talk-2-me / talk-to-me | `package.py` sale con código 3 (solo si no usás `--no-voice`) |
| ffmpeg / ffprobe | PATH | no se puede medir la voz; sale con 3 |
| Node 18+ + Remotion | `remotion/node_modules` (se instala solo en la primera corrida) | `package.py` corre `npm install` |
| `TAKE_CONTROL_OPENER` (opcional) | env: script que abre un archivo y confirma que quedó en pantalla | se abre con la app por defecto y se reporta "sin verificar" |
| Skills `/ultraplan`, `/judge-charly`, `/loop-builder`, `/projectstatus`, `/talk-2-me` | vienen en el mismo bundle (`node scripts/install.mjs --all`) | sin `/talk-2-me` (o `/talk-to-me`) el aviso del paso 8 va en texto |

Copiá `.env.example` a `.env` en la carpeta del skill para las llaves.

Para probar el video sin gastar API: `--no-voice` (silencioso, duraciones estimadas por largo
de texto) y `--bgm none`. Para ver el diseño sin render completo:
`cd remotion && npx remotion studio`.

## Cuándo dispara

- El operador escribe `/take-controlish`, "toma el control de esto", "llevalo hasta el contrato".
- Una tarea compleja donde él quiere leer el plan y el contrato **antes** de dejar que algo corra.
- Su invocación es el opt-in explícito a orquestación multi-agente: este skill llama a
  `/judge-charly` (que a su vez usa Workflow) y a subagentes calificadores sin pedir permiso extra.

## El pipeline

```
tarea
  └─ 1. /ultraplan ──────────────► plan md + plan HTML
       └─ 2. /judge-charly ─────► veredictos por claim
            └─ 3. calificador de contexto fresco ──► nota 1-10 vs rubrica
                 └─ < 9 ? corregir y volver a 2  (máx 5 rondas)
                 └─ ≥ 9 ─► 4. /loop-builder ────► loops/<name>/README.md
                            └─ 5. mismo ciclo 2-3 sobre el CONTRATO (máx 5 rondas)
                                 └─ ≥ 9 ─► 6. paquete: 2 HTML + video narrado
                                            └─ 7. /talk-2-me: "está listo para tu revisión"
```

Nada se ejecuta. El skill termina con el contrato esperando el visto bueno del operador.

---

### 1. Ultraplan

Corré `/ultraplan` sobre la tarea tal como llegó. No la reformules para que suene más grande.

**Si la tarea trae una cota del operador**, cualquier frase de la forma *"si no necesitamos X,
esto debería ser fácil"*, esa cota es la primera pregunta de investigación del ultraplan, no una
nota al pie. El plan tiene que **medir** si la cota se cumple, y si se cumple, ser corto y decirlo.
Un plan de doce fases para un problema de dos horas se rechaza por desproporcionado (criterio 2)
y arrastra el criterio 3 con él.

Guardá los dos artefactos donde `/ultraplan` los deja: `docs/reports/<slug>-ultraplan.md` y
`.html`. No abras el HTML todavía: se abre en el paso 6, junto con el resto del paquete.

### 2. Fusilar el ultraplan con judge-charly

Corré `/judge-charly` sobre **tu propio ultraplan**. Es el paso que más se hace mal: se corre por
trámite y todos los claims sobreviven.

- Extraé los claims del plan, no de la tarea. "Esta fase toma dos horas" es un claim. "El árbol
  vivo alcanza como fuente de verdad" es un claim. "Hay que consolidar el repo" es un tema.
- Incluí siempre los dos que nadie pone: el **claim meta** (que lo que estamos leyendo sea de
  verdad lo que corre donde ocurre el comportamiento) y el **perro que no ladró** (si el plan
  asume que algo automático actuó y no hay evidencia de que actuara).
- Guardá la tabla de veredictos íntegra. Va al HTML del contrato y al video.

**Después de los veredictos, corregí el plan.** Un claim KILLED que sigue en el plan tal cual es
un punto perdido garantizado. Un claim UNVERIFIABLE se queda solo si el plan lo marca como
inferencia, no como hecho.

### 3. La calificación, contexto fresco, rúbrica fija

**No te califiques a vos mismo.** Lanzá **un** subagente calificador con el `Agent` tool
(`subagent_type: "general-purpose"`, modelo opus) que llega frío: recibe el ultraplan corregido,
la tabla de veredictos y la rúbrica de abajo, y devuelve el desglose punto por punto.

Prompt del calificador, tal cual:

```
Sos un revisor que no escribió este plan y no le debe nada. Calificás contra la rúbrica de
abajo y nada más. Un punto por criterio, entero, sin medios puntos. Para cada criterio citás
la línea del plan que te lo da por bueno, o decís exactamente qué falta. No premies intención:
si el plan dice que va a medir algo pero no trae la medición, el criterio no está cumplido.
Devolvé: tabla criterio/punto/evidencia, los techos que apliquen, y el total.
```

**La rúbrica (10 criterios, 1 punto cada uno, el corte es 9):**

| # | Criterio | Se cumple cuando |
|---|---|---|
| 1 | **Medido vs inferido, marcado** | Cada afirmación dice cuál es. Una lectura de código no es prueba viva. |
| 2 | **Proporcionalidad** | El tamaño del plan corresponde al tamaño medido del problema, y si es fácil, lo dice. |
| 3 | **La cota del operador, medida** | Si el operador acotó el problema, hay una medición que responde la cota. |
| 4 | **Criterios de aceptación falsables** | Cada uno nombra el comando y la salida exacta que cuenta como verde. |
| 5 | **Alcance negativo explícito** | Está escrito qué NO se va a hacer. |
| 6 | **Bloqueos declarados como bloqueos** | Lo que necesita un acceso que la máquina no tiene aparece como bloqueo, no como paso. |
| 7 | **Gates del entorno nombrados** | Permisos, recursos congelados, ADRs, áreas de otras sesiones: nombrados en el plan. |
| 8 | **Riesgos separados, no fundidos** | Modos de falla distintos tratados aparte; borran cosas distintas. |
| 9 | **judge-charly aplicado, no decorativo** | Se ven los veredictos Y se ve que el plan cambió por ellos. |
| 10 | **Reversibilidad y orden** | Cada fase dice cómo se deshace y qué tiene que pasar antes. |

**Techos que pisan el total:**

- Criterio 3 sin medición → **el techo es 6**, sin importar el resto.
- Criterio 9 con todos los claims sobreviviendo intactos → **−2** (o no extrajiste claims
  atacables, o no los fusilaste en serio).
- El plan propone algo que requiere un acceso que esta máquina no tiene, y lo escribe como paso
  en vez de bloqueo → **criterio 6 perdido y techo 8**.

### 4. El gate, y el techo de 5 rondas

- **≥ 9** → seguís al paso 5.
- **< 9** → corregís **solo lo que perdió punto**, y volvés. Si lo que falló fue evidencia,
  volvés al paso 2 (hay que volver a fusilar lo que cambió). Si fue redacción o alcance, alcanza
  con re-calificar. Cada ronda re-corre el calificador **fresco**, nunca el mismo.
- **Cinco rondas sin llegar a 9** → parás. No hay ronda 6. Escribís qué criterios siguen caídos
  y por qué no los podés cerrar solo, y llamás al operador con `/talk-2-me`. Un plan que no converge
  en cinco rondas tiene un hoyo estructural que ninguna revisión más va a tapar.

Llevá la cuenta de rondas: va al video y al HTML.

### 5. El contrato, /loop-builder con el ultraplan

Con el ultraplan aprobado, corré `/loop-builder` **usando ese ultraplan como insumo**, no la
tarea original. El ultraplan ya tiene las fases, los riesgos y el alcance negativo: el contrato
los hereda en vez de re-preguntarlos.

Sale `loops/<name>/README.md` con sus cinco secciones (Goal, Boundaries, SOP, State, Logs).

**Después validá los criterios de aceptación uno por uno.** Un criterio es válido solo si
nombra el comando y la salida exacta. "Verificar que todo esté en git" no es criterio;
"`git status --porcelain` devuelve cero líneas para estas N rutas" sí.

### 6. El mismo ciclo, sobre el contrato

Repetí los pasos 2 y 3 con el contrato como objeto: `/judge-charly` sobre los claims del
contrato, y calificador fresco con la **rúbrica del contrato**:

| # | Criterio | Se cumple cuando |
|---|---|---|
| 1 | Goal medible, con o sin línea de meta declarada | |
| 2 | Boundaries con al menos una regla via-negativa ("nunca X") | |
| 3 | Está escrito qué escala al operador y qué no | |
| 4 | SOP numerado, y el último paso escribe State + Logs | |
| 5 | Todos los criterios de aceptación son falsables (comando + salida) | |
| 6 | El trigger elegido está justificado por costo, no por costumbre | |
| 7 | State chico a propósito, con cursores nombrados | |
| 8 | Logs append-only, una entrada por corrida | |
| 9 | Gates del entorno heredados del ultraplan, no perdidos | |
| 10 | Alcance negativo explícito del loop | |

Mismo corte de 9, mismo techo de 5 rondas.

### 7. El paquete

Tres cosas, y las tres se abren en la pantalla del operador.

**a. El HTML del ultraplan**, el que ya dejó `/ultraplan`.

**b. El HTML del contrato**, copiá `assets/contract-template.html` a
`docs/reports/<slug>-contract.html` y llená cada `{{PLACEHOLDER}}`. Los comentarios HTML del
template dicen qué forma tiene cada uno. No lo re-estilices: el punto es que las dos páginas se
lean como familia.

**c. El video narrado**, seis escenas, voz sintetizada, música de fondo, 90 a 150 segundos.

Escribí el spec en JSON y dejá que `scripts/package.py` lo resuelva:

```bash
python ~/.claude/skills/take-controlish/scripts/package.py \
  --spec <scratchpad>/spec.json \
  --out  docs/reports/<slug>-take-control.mp4 \
  --bgm tech --open
```

El script genera la voz por escena con ElevenLabs, **mide el mp3 real con ffprobe** para que
cada escena dure lo que dura su narración, mezcla la música con fade, renderiza con Remotion y
abre los tres archivos. Sin verificador los abre con la app por defecto y lo reporta como
"sin verificar": decilo así, nunca como "abierto en pantalla". Con `TAKE_CONTROL_OPENER`
configurado, solo `verdict:visible` cuenta como abierto; si sale `FAILED`, el paquete **no**
está entregado y hay que decirlo.

**Forma del spec** (las escenas van en este orden y solo llevan `kind` + `narration`; el script
calcula los frames):

```json
{
  "title": "…",  "subtitle": "…",  "date": "2026-09-09",
  "mode": "controlish",
  "objective": "…",
  "notScope": ["…"],
  "phases": [{"n": 1, "name": "…", "detail": "…"}],
  "judge": {
    "score": 9.2, "rounds": 2,
    "claims": [{"claim": "…", "verdict": "SURVIVED|KILLED|UNVERIFIABLE|FIXED"}],
    "changes": ["…"]
  },
  "contract": {"name": "…", "path": "loops/…/README.md",
               "acceptance": [{"check": "comando", "green": "salida exacta"}]},
  "status": {"headline": "…", "detail": "…", "next": "…"},
  "artifacts": [{"label": "Ultraplan", "path": "docs/reports/…-ultraplan.html"},
                {"label": "Contrato",  "path": "docs/reports/…-contract.html"}],
  "scenes": [
    {"kind": "title",     "narration": "…"},
    {"kind": "objective", "narration": "…"},
    {"kind": "phases",    "narration": "…"},
    {"kind": "judge",     "narration": "…"},
    {"kind": "contract",  "narration": "…"},
    {"kind": "status",    "narration": "…"}
  ]
}
```

**Cómo se escribe la narración.** El lector es el operador, no un ingeniero revisando la MR: resultado
primero, qué decidir después, cero mecánica. Sin códigos, sin nombres de función, sin HTTP.
Una a tres frases por escena. La escena `status` termina diciendo **qué tiene que decidir él**.
El video se ve en una pasada: si hay que pausarlo para entenderlo, está mal escrito.

Las pantallas recortan listas largas (6 fases, 5 claims, 5 criterios) y muestran "+N más en el
HTML". Eso es a propósito: el video orienta, el HTML detalla. No metas todo en el video.

### 8. El aviso

Cerrá con `/talk-2-me`:

> Listo: el contrato de **&lt;nombre&gt;** pasó con **&lt;nota&gt;** en &lt;N&gt; rondas.
> Te dejé abiertos el ultraplan, el contrato y el video. No arranqué nada: espera tu visto bueno.

Si la compuerta de cámara no lo ve, el aviso se encola solo, no lo repitas ni lo mandes por
otra vía.

---

## Reglas duras

- **No se ejecuta la tarea.** Este skill planea, fusila, califica y empaqueta. Escribir el
  ultraplan, el contrato, el HTML y el video no es ejecutar; correr el loop sí. Si querés que
  además construya, ese es `/take-control-full`.
- **Ningún merge, push a rama compartida, deploy o post a canal externo** sale de acá sin permiso
  puntual del operador en el mismo intercambio.
- **Breakpoints.** Ultraplan aprobado, contrato aprobado y paquete entregado son tres
  breakpoints: en cada uno corré `/projectstatus` del proyecto en curso, sin pedir permiso.
- **Bitácora.** Si algo de esto tocó un archivo que git no ve (deploy, servidor, config
  remota), la entrada en el log local del proyecto (append-only, fuera de git) va **antes** de
  considerar el paso hecho.
- **Nunca reportes "abierto en pantalla"** sin evidencia: con verificador, `verdict:visible`;
  sin verificador, decí "abierto sin verificar".

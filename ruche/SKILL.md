---
name: ruche
description: "Explica en video la conversacion que se esta teniendo en esta sesion de Claude Code. Claude resume el hilo en 5 a 8 escenas (contexto, que paso, decisiones, resultado, siguiente), escribe un spec JSON, y scripts/ruche.py lo convierte en un mp4 con Remotion: imagenes generadas con Krea 2 local en la GPU (gratis) o con gpt-image via Replicate cuando la imagen necesita texto legible, voice-over con ElevenLabs (voz Luna maria), musica de fondo y efectos de sonido de ElevenLabs solo si la escena lo pide. Tope de gasto 1 USD. Usar cuando Alejandro diga /ruche, 'explicame esta conversacion en video', 'hazme el ruche de esto', 'resume la sesion en video'."
---

# /ruche: la conversacion, explicada en video

Toma el hilo actual de la sesion y lo convierte en un video corto (60 a 150 s) que alguien
que no estuvo puede ver y entender: que se pidio, que se hizo, que se decidio, en que quedo.

Regla de oro: **el video explica la conversacion, no la adorna.** Cada escena sale de algo que
paso de verdad en el hilo. Nada de inventar avances ni de pulir resultados que no se
verificaron. Si algo fallo, hay una escena que lo dice.

## Flujo

### 1. Leer el hilo y decidir la historia (Claude, sin herramientas)

Resume la conversacion en 5 a 8 escenas con este orden fijo:

| kind | Que cuenta | Cuantas |
|---|---|---|
| `title` | Titulo del video, subtitulo con el tema, fecha | 1 |
| `context` | De donde venimos, que pidio Alejandro | 1 |
| `beat` | Que paso: pasos, hallazgos, obstaculos | 1 a 3 |
| `decision` | Decisiones tomadas y por que | 0 a 1 |
| `result` | Que quedo terminado y verificado (o que no) | 1 |
| `outro` | Siguiente paso o pregunta abierta | 1 |

Cada escena lleva:
- `heading`: una linea, maximo 8 palabras.
- `bullets`: 2 a 4 lineas cortas (se muestran en pantalla).
- `narration`: 1 a 3 oraciones en espanol, tono conversacional, primera persona plural
  ("Bajamos las dos skills del repo..."). La narracion marca la duracion de la escena.
- `image` (opcional): `{"prompt": "...", "text": false}`. Ver seccion de imagenes.
- `sfx` (opcional): un prompt corto de efecto de sonido, **solo si la escena lo pide** (un
  error que truena, una notificacion, un deploy que arranca). La mayoria de las escenas no
  llevan sfx. Nunca en `title` ni `outro`.

Y el spec lleva `music`: `"calm"` o `"tech"` usan la pista local (gratis, instantaneo);
un prompt de texto ("piano lo-fi suave sin bateria") genera la pista con ElevenLabs Music a la
medida del video. Default: `"calm"`. Pon `null` si el video no debe llevar musica.

### 2. Imagenes: Krea 2 local por default, Replicate solo si hay texto

- **Sin texto en la imagen** (el 90% de los casos): `text: false`. Se genera en la GPU local
  con Krea 2 Turbo via ComfyUI (:8188). Costo cero. El prompt describe una escena visual que
  represente la idea (una terminal iluminada, dos engranes encajando, un muelle al amanecer),
  nunca letras ni UI con texto. El script agrega el estilo cinematografico y "no text".
- **Con texto legible** (una etiqueta, un letrero, una pantalla con palabras): `text: true`.
  Krea 2 no sabe escribir; se enruta a **gpt-image via Replicate, calidad low**. Cada una
  cuesta centavos y cuenta contra el tope de 1 USD. Maximo 3 por video.
- Si ComfyUI no esta arriba, el script avisa y manda las locales a Replicate **solo si siguen
  dentro del tope**; si no, para con exit 6 y dice como arrancar ComfyUI
  (`Desktop/ComfyUI/start_comfyui.bat`, tarda ~2 min en responder).
- `title` y `outro` normalmente van sin imagen (fondo degradado). Escenas `beat`, `decision`
  y `result` se ven mucho mejor con una.
- **Nada real sin referencia visual.** Si la escena muestra un lugar, producto o persona real,
  aplica la regla de referencia visual actual (`~/.claude/rules/common/visual-reference-research.md`)
  o usa una imagen abstracta en su lugar. Un recap no justifica inventar un lugar real.

### 3. Escribir el spec y correr el script

Guarda el spec en el scratchpad de la sesion y corre:

```bash
python ~/.claude/skills/ruche/scripts/ruche.py \
  --spec <scratchpad>/ruche-spec.json \
  --out  ~/Videos/ruche/<fecha>-<slug>.mp4 \
  --open
```

El script: genera imagenes -> voz por escena (ElevenLabs, mide el mp3 real con ffprobe para
que cada escena dure lo que dura su narracion) -> sfx y musica -> render Remotion 1920x1080
-> abre el mp4. La primera corrida hace `npm install` dentro de `remotion/` (un par de
minutos, una sola vez).

### 4. Entregar

Responde con la ruta del mp4, la duracion, cuantas imagenes fueron locales y cuantas
Replicate, y el costo estimado. Si algo se degrado (sfx que fallo, musica que cayo al fallback,
imagenes que pasaron a Replicate) se dice. Nada mas: no ofrecer variantes ni backlog.

## Spec de ejemplo

```json
{
  "title": "Dos skills nuevas",
  "subtitle": "Instalacion de take-controlish y take-control-full",
  "date": "2026-09-09",
  "music": "calm",
  "scenes": [
    {"kind": "title", "heading": "Dos skills nuevas", "bullets": [],
     "narration": "Hoy instalamos dos skills nuevas desde el repo personal de GitHub."},
    {"kind": "context", "heading": "Lo que se pidio", 
     "bullets": ["Bajar las 2 skills mas recientes del repo", "Dejarlas disponibles en toda la laptop"],
     "narration": "La peticion fue simple: ir al repo personal, bajar las dos skills mas recientes y dejarlas globales.",
     "image": {"prompt": "a glowing laptop on a wooden desk at night, two small luminous cubes floating above the keyboard", "text": false}},
    {"kind": "result", "heading": "Quedaron instaladas",
     "bullets": ["take-controlish", "take-control-full", "Disponibles en sesiones nuevas"],
     "narration": "Las dos quedaron en la carpeta global de skills, listas para cualquier sesion nueva.",
     "image": {"prompt": "two sleek metal keys resting on a dark slate surface, soft rim light", "text": false},
     "sfx": "soft confirmation chime"},
    {"kind": "outro", "heading": "Siguiente", "bullets": ["Reiniciar las sesiones abiertas"],
     "narration": "Solo falta reiniciar las sesiones abiertas para que las vean."}
  ]
}
```

## Costos y topes

| Recurso | Costo | Tope |
|---|---|---|
| Krea 2 local (ComfyUI) | 0 USD, ~30 s por imagen | sin tope |
| gpt-image low via Replicate | ~0.03 USD por imagen (estimado, ver `RUCHE_TEXT_IMAGE_USD`) | `--max-usd 1.0` (env `RUCHE_MAX_USD`) |
| ElevenLabs voz, musica, sfx | creditos de la suscripcion, no USD | musica solo si el spec la pide generada |

El script calcula el estimado ANTES de gastar y para con exit 6 si se pasa del tope.

## Dependencias

| Que | Donde | Si falta |
|---|---|---|
| `ELEVENLABS_API_KEY` | env, `<skill>/.env`, `~/.claude/talk2me/.env` | exit 3 |
| `ELEVENLABS_VOICE_ID` | mismos lugares; sin el usa una voz stock de ElevenLabs | voz generica |
| `REPLICATE_API_TOKEN` | env, `<skill>/.env`, `~/.claude/skills/oruga-blender/.env` | exit 4 solo si hay escenas `text:true` |
| ComfyUI en :8188 con Krea 2 nvfp4 | `Desktop/ComfyUI` (memoria `project_comfyui_krea2`) | cae a Replicate dentro del tope, si no exit 6 |
| ffmpeg / ffprobe | PATH | exit 3 |
| Node + Remotion | `remotion/node_modules`, se instala solo | `npm install` automatico |

Modelo de texto en imagen: `openai/gpt-image-2` por default; override con
`RUCHE_TEXT_IMAGE_MODEL` si Replicate publica un slug mas nuevo. Si Replicate devuelve 422 el
cliente reintenta con menos campos antes de rendirse.

Para probar sin gastar: `--no-voice --no-images --no-music --no-sfx` (video mudo con fondos
degradados y duraciones estimadas). Para ver el diseno: `cd remotion && npx remotion studio`.

## Lo que NO hace

- No lee el transcript en disco: la historia la escribe Claude desde su propio contexto.
- No genera imagenes de personas o lugares reales sin referencia visual actual.
- No pasa de 1 USD sin que Alejandro suba el tope a mano.
- No rellena escenas con logros que no ocurrieron en el hilo.

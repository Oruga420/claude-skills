---
name: talk-to-me
description: Camera-gated voice notifications for any Claude Code session. When active, a finished task, blocker, or question is announced OUT LOUD through ElevenLabs (your own voice id, model eleven_v3, Spanish by default) — but ONLY if your webcam can actually see the operator. If nobody is there, the camera is missing, or the frame is black, the message is parked in a queue shared by every session on this machine and delivered as one combined announcement the next time the operator is seen. Use when the user says "/talk-to-me", "háblame", "activa la voz", "avísame con voz", "ponme la voz". Deactivate on "stop the voice", "para la voz", "cállate", "silencio", "ya no hables", "quita la voz".
---

# talk-to-me — camera-gated voice notifications

## Requirements

- **Windows 10/11.** Camera capture uses ffmpeg's DirectShow (`dshow`) input and playback uses
  `scripts/speak.ps1` (Windows PowerShell 5.1 or PowerShell 7, WPF MediaPlayer). It does not
  run on macOS or Linux as shipped.
- **A webcam.** Any one works. By default the first video device ffmpeg lists is used; pick
  another by name or index (see "Choosing the camera").
- **ffmpeg** on PATH (`winget install Gyan.FFmpeg`), or its path in `ffmpeg` in config.json /
  `TTM_FFMPEG`.
- **Python 3.8+** with `opencv-python` 4.5.4 or newer (`pip install opencv-python`; numpy
  comes with it). The YuNet face model is bundled in `models/`.
- **ElevenLabs:** an API key (`ELEVENLABS_API_KEY`) and a voice id from your account
  (`ELEVENLABS_VOICE_ID`). Copy `.env.example` to `.env` next to this file, or to
  `~/.claude/talk-to-me/.env`, or set them as environment variables.
- Optional: a `SessionStart` hook so new sessions learn about a waiting backlog (below).

First run: `python "$env:USERPROFILE\.claude\skills\talk-to-me\scripts\ttm.py" init` creates
the store and reports whether the key, the voice id, ffmpeg and the face model were found.

## The rule

**Never speak into an empty room.** Before any announcement, the configured webcam is checked.

| What the camera reports | What happens |
|---|---|
| Operator's face in frame | Speak the whole backlog as ONE message |
| No face, but the room is visible | Queue it, say nothing |
| Frame is black (lens covered / no signal) | Queue it, say nothing |
| Configured camera not connected | Queue it, say nothing |
| Camera busy or capture failed | Queue it, say nothing |

Nothing is ever lost — only deferred. The queue is **shared by every Claude Code session on
this machine**, so whichever session next finds the operator on camera delivers everyone's
backlog in a single voice message.

## Activation

Voice mode stays ON for the rest of the session once invoked, until the operator says a stop
phrase ("stop the voice", "para la voz", "cállate", "silencio", "ya no hables", "quita la
voz", `/talk-to-me stop`, or anything with that clear meaning). Then confirm in text
("Voz apagada.") and stop calling the engine.

On activation:

1. Confirm voice mode ON in text, one line.
2. Run one `notify` (below) with a short greeting so the operator learns the current state —
   if they are on camera they hear it, if not they see in the text that it was queued.
3. Apply "When to announce" for the rest of the session.

## How to announce — two commands, always

Everything goes through `ttm.py`. **Never call `speak.ps1` directly** — that bypasses the
camera gate and the shared queue.

**Step 1 — hand the message to the engine.** It queues the message, checks the camera, and
tells you what to do:

```powershell
$env:PYTHONUTF8=1; python "$env:USERPROFILE\.claude\skills\talk-to-me\scripts\ttm.py" notify `
  --text "Terminé la migración de pedidos y los tests pasaron" `
  --kind done --project acme-orders --session <session-id-if-known>
```

`--kind` is one of `done` `blocker` `question` `wrap` `info`. `--project` defaults to the
current folder's name.

The JSON reply carries an `action`:

- **`"queued"`** — nothing was said. `reason` says why: the operator is not there
  (`absent`, `black`, `no_camera`, `camera_busy`), or **`another_session_speaking`** — someone
  else is mid-announcement and your message rides along in their next batch. Say nothing, do
  not retry. Mention it in text only if the reason is a real fault (`no_ffmpeg`,
  `no_detector`, `enumerate_failed`, `engine_error`).
- **`"already_handled"`** — another session drained the queue while you were at the camera.
  Say nothing.
- **`"speak"`** — the operator is on camera. `items` holds the full backlog (yours plus any
  other session's), `language` the language to speak in, and `address_as` how to address the
  operator (null = neutral). Go to step 2 **promptly** — the claim is only good for 90
  seconds, because after that "they were there" is no longer a fact about now.

**Step 2 — compose ONE message for the whole backlog and speak it:**

```powershell
$env:PYTHONUTF8=1; python "$env:USERPROFILE\.claude\skills\talk-to-me\scripts\ttm.py" say `
  --claim <claim-id-from-step-1> --text "<un solo mensaje>"
```

On success the items are cleared. On anything else the items go **back** to the queue and the
command exits non-zero — report it in text and do not retry blindly:

- **`speak_failed`** — ElevenLabs or the audio device failed. Nothing was heard.
- **`speak_degraded`** — only the offline Windows SAPI voice was reachable. Those voices are
  often English only, so an announcement read in the wrong language is not a delivery; it
  stays queued.
- **`speak_deferred`** — you took too long to compose; presence has to be re-confirmed. Run
  `review` again.
- **`claim_vanished`** — the claim was reclaimed mid-speech. Say nothing more; the items are
  back in the queue.

### Other commands

- `review` — same camera gate, adds nothing new. Use to drain a backlog when you finish
  something but have no new message, when a session starts with messages waiting, or when the
  operator asks "¿tenías algo pendiente?". Costs nothing when the queue is empty: it returns
  `idle` without ever waking the camera.
- `check` — camera probe only, no queue changes.
- `cameras` — lists the video devices ffmpeg sees, with their index, and marks the one the
  current config selects. Never captures a frame.
- `status` — pending items, claims, last camera verdict, config, whether a key and a voice id
  were found.
- `backlog` — one human line if messages are waiting, silence otherwise. Meant for a
  `SessionStart` hook, so any new session is told a backlog exists.
- `abandon --claim <id>` — put a claim back in the queue (use if composing failed).
- `clear` — drop everything pending (maintenance only, ask first).
- `init` — create the store and `config.json`, and report what is missing.

Optional `SessionStart` hook in `~/.claude/settings.json` (adjust the path if your skills live
elsewhere):

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command",
        "command": "python \"$HOME/.claude/skills/talk-to-me/scripts/ttm.py\" backlog",
        "timeout": 15 } ] }
    ]
  }
}
```

### Only one voice at a time

The engine refuses to hand out a second claim while another session is still speaking, so two
sessions can never talk over each other. If you are told `another_session_speaking`, your
message is safe in the queue and will be included in the next batch.

## When to announce

Call `notify` at these moments — and only these. Voice is for notifications, not narration.

1. **Task finished** — a task, plan point, deploy, fix, or build completed and verified.
2. **Blocker / input needed** — work stopped waiting on the operator.
3. **Long-running work finished** — a background job, test suite, or agent came back.
4. **Session wrap-up** — the work is done.

Never for: intermediate steps, file edits, read-only exploration, or ordinary chat replies.
One `notify` per breakpoint, not per action.

## What the voice says

- **Spanish by default**, even when the session is in English. The spoken language is the
  `language` key in config.json (the `speak` reply echoes it); write the message in that
  language.
- **Address the operator** by `address_as` when the reply carries one (set `operator_name` in
  config.json or `TTM_OPERATOR_NAME`). When it is null, stay neutral: no name, no title.
- Plain speakable text: no markdown, no code, no URLs, no file paths (say "el archivo de
  configuración", never the path). Numbers and names said naturally.
- Model v3 supports audio tags like `[excited]` — at most one, only when the emotion fits.

**One item in the backlog** → one or two sentences: what finished, and the one thing that
matters next.

> "Listo, ya quedó el deploy de la tienda Lumen en producción. Todo verificado."

**Several items** → ONE message that covers them all. Lead with the count, group by project
when they come from different ones, and put blockers last so they are what the operator
remembers. Use each item's `age_human` when something has been waiting a while. Never read
them as a list of robotic bullet points — make it sound like a person catching them up.

> "Te debía tres cosas. En el servicio de pedidos de Acme terminé la migración y los tests
> pasaron. En la tienda Lumen quedó el deploy arriba desde hace media hora. Y ojo con una: la
> sesión del panel de reportes está trabada esperando que apruebes el acceso a la base de
> staging."

**Many items (six or more)** → do not enumerate everything. Summarise by project and count,
then name only the blockers in full.

## Where the state lives

Central, under your home directory, shared by every session (move it with `TTM_HOME`):

```
~/.claude/talk-to-me/
  queue.json     pending messages + in-flight claims  (edited in place, spoken items deleted)
  history.md     append-only log of every message and every announcement
  presence.json  last camera verdict (short-lived cache so sessions don't fight the camera)
  config.json    camera selection, thresholds, language, operator name, voice/model fallback
  .env           optional: ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID (never commit it)
  locks/         cross-session locks
```

`queue.json` is deliberately small and disposable — it holds only what has not been said yet.
`history.md` is the permanent record; nothing is ever removed from it.

Messages older than `max_age_hours` (default 12) are dropped as `expired` and logged rather
than read out as stale news.

## How presence is decided

`ffmpeg` lists the DirectShow cameras and picks the configured one. If it is not connected,
the answer is `no_camera` immediately — the camera is never woken for nothing. Otherwise
ffmpeg grabs 12 frames and the **last 4** are analysed (the first frames of a cold camera are
dark while exposure settles):

- flat and dark on every analysed frame → `black`
- a face found by OpenCV's YuNet detector above `face_conf` → `present`
- otherwise → `absent`

Frames are written to a temp folder, analysed locally, and deleted in a `finally` block.
Nothing is stored, logged, or uploaded — the only thing that leaves the machine is the text
sent to ElevenLabs.

## Choosing the camera

Run `ttm.py cameras` to see the device names and indexes, then set one of these in
`~/.claude/talk-to-me/config.json`:

- `camera_match` — part of the device name, case-insensitive (`"Logitech"`, `"Integrated"`).
  When set, it wins.
- `camera_index` — position in the list, used when `camera_match` is empty. Default `0`, the
  first webcam. If the first entry is a virtual camera (OBS, a background-blur app), point
  this at the physical one or use `camera_match`.

For one run only: `TTM_CAMERA_MATCH` or `TTM_CAMERA_INDEX`. A per-run override never writes
its verdict into the shared presence cache, so it cannot mislead other sessions.

`allow_camera_fallback` + `fallback_camera_match` (off by default) name a second camera to try
when the configured one is missing. Some virtual-camera apps lock the physical webcam while
they run; their virtual device carries the same image, so it makes a reasonable fallback.

## Config and troubleshooting

Edit `~/.claude/talk-to-me/config.json`. Useful keys: `camera_match`, `camera_index`,
`face_conf` (raise if it sees faces that are not there, lower if it misses the operator),
`black_mean` / `black_std`, `max_age_hours`, `language`, `operator_name`, `voice_id` /
`model_id` (fallbacks; `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL_ID` win),
`allow_camera_fallback` + `fallback_camera_match`.

- `TTM_TEST_FRAMES_DIR` points the detector at a folder of images instead of the camera, for
  testing without hardware. Results are stamped `test_mode` and can never satisfy a real check.
- ElevenLabs key and voice: environment variables first, then `<skill>/.env`, then
  `~/.claude/talk-to-me/.env`; the voice can also come from `voice_id` in config.json.
- `allow_sapi_fallback` is **off**: the offline Windows voices are often English only, so the
  fallback would read a Spanish announcement in English. Turn it on only if a robotic reading
  is better than silence (or if you installed a SAPI voice for your `language`).
- A message is only ever marked spoken when the audio actually played — the engine waits for
  the player to report a duration and for the transport clock to move. If the output device
  changed or vanished, you get `speak_failed` and the message stays queued instead of
  vanishing.
- Detector model: `~/.claude/skills/talk-to-me/models/face_detection_yunet_2023mar.onnx`.
  If it is missing the verdict is `no_detector` and everything queues — re-download it from
  the `opencv/opencv_zoo` repo.

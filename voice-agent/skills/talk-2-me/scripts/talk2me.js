#!/usr/bin/env node
/**
 * talk2me.js - Claude Code speaks through ElevenLabs when a turn ends.
 *
 * You should not have to stare at the screen to know whether Claude is done. This engine turns
 * the end of a turn into ONE spoken line, in first person, whose only job is to get you back to
 * the screen. It is not a screen reader: it is a doorbell with context.
 *
 * Voice is PER SESSION. It speaks only in the Claude Code sessions where you asked for
 * /talk-2-me; every other session stays silent even while the engine is enabled. State is
 * persistent (~/.claude/talk2me/state.json) and survives restarts.
 *
 * Commands:
 *   node talk2me.js on [--voice ID] [--model ID] [--name NAME] [--lang en|es]   voice on (this session)
 *   node talk2me.js off [--all]                    voice off (this session, or all)
 *   node talk2me.js status                         state, voice, characters spent
 *   node talk2me.js pending | presence | review | flush   the central notice queue and the camera gate
 *   node talk2me.js say "text"                     speak a line you already wrote
 *   node talk2me.js test                           end-to-end audio test
 *   node talk2me.js voices [filter]                list the voices in your ElevenLabs account
 *   node talk2me.js hook stop                      Stop hook handler
 *   node talk2me.js hook prompt                    UserPromptSubmit hook handler
 *
 * Configuration lives in ~/.claude/talk2me/state.json (hand-editable): `voice`, `model`,
 * `name` (who the line addresses), `lang` (en|es), `camera` (dshow device name, or false to
 * skip the presence gate; TALK2ME_CAMERA overrides it; unset = first device dshow lists),
 * `keepQueueOnPrompt`. The API key lives in ~/.claude/talk2me/.env
 * (ELEVENLABS_API_KEY) or in the environment, never in this file.
 *
 * Three things that matter more than they look:
 *
 *   - FAIL OPEN, ALWAYS. An error here can never break or slow down a Claude Code session.
 *     Every hook handler exits 0 no matter what.
 *
 *   - OFF COSTS NOTHING. With voice off the hook reads a tiny JSON and exits. No models, no
 *     network, no processes.
 *
 *   - NEVER TALK OVER YOU. When you type something new, the audio in progress is cut. A summary
 *     from two turns ago playing over your current question is worse than silence.
 *
 * Inline comments below are in Spanish: the engine was born in a Spanish-speaking setup and the
 * design notes were kept verbatim. User-facing strings, prompts and the CLI are in English.
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { spawn, spawnSync, execFileSync } = require('child_process')

const HOME = os.homedir()
/*
 * `--dir <path>` (or TALK2ME_DIR) moves the whole state directory. It exists so a second copy of
 * the engine can be exercised inside a live Claude Code session without touching the queue,
 * state or key of the installed one. Children spawned by the engine inherit it via dirArgs().
 */
const DIR_OVERRIDE = (() => {
  const i = process.argv.indexOf('--dir')
  return (i > -1 && process.argv[i + 1]) || process.env.TALK2ME_DIR || null
})()
const DIR = DIR_OVERRIDE ? path.resolve(DIR_OVERRIDE) : path.join(HOME, '.claude', 'talk2me')
const dirArgs = () => (DIR_OVERRIDE ? ['--dir', DIR] : [])
const STATE = path.join(DIR, 'state.json')
const ENVFILE = path.join(DIR, '.env')
const AUDIO = path.join(DIR, 'audio')
const PIDFILE = path.join(DIR, 'playing.json')
const QUEUE = path.join(DIR, 'queue.json')
const DRAINPID = path.join(DIR, 'drainer.pid')
const LOCK = path.join(DIR, '.lock')
const LOG = path.join(DIR, 'talk2me.log')

const DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL' // "Sarah", an ElevenLabs premade voice present in every account. Override: on --voice <id>
/*
 * multilingual_v2, no v3. Medido el 2026-08-26 sobre la misma voz y el mismo texto:
 * v3 deja la voz sonando hasta el ultimo sample (ratio de cola 0.32 a 0.71) practicamente
 * siempre, en textos cortos y largos por igual, o sea que se come el final del aviso.
 * multilingual_v2 cierra en silencio (0.02 a 0.09) en todas las corridas y devuelve bytes
 * identicos para el mismo texto. Un aviso que se corta a media frase no cumple su unico
 * trabajo, asi que la fiabilidad le gana a la expresividad de v3.
 */
const DEFAULT_MODEL = 'eleven_multilingual_v2'
const MAX_CHARS = 240 // per-line cap: the ElevenLabs starter plan gives ~49k chars/month and this stretches it

/*
 * Who the spoken line addresses and in which language. Both live in state.json (`name`, `lang`)
 * so each person sets them once with `on --name <name> --lang en|es` and never edits this file.
 */
const LANGS = { en: 'English', es: 'Spanish' }
const lang = (s) => (s && LANGS[s.lang] ? s.lang : 'en')
const langName = (s) => LANGS[lang(s)]
const greeting = (s) => {
  const who = s && s.name ? String(s.name).trim() : ''
  if (lang(s) === 'es') return who ? 'Oye ' + who + ',' : 'Oye,'
  return who ? 'Hey ' + who + ',' : 'Hey,'
}

/*
 * Conversation mode ("open line"). The brief: talk; when the instruction is over (0.8 s of
 * silence) stop listening and send it to Claude Code; speak the answer; listen again. Every
 * knob lives under `conversation` in state.json so a different mic or a noisier room never
 * needs a code change. Mode is PER SESSION, like the voice itself.
 */
const CONV = {
  silenceMs: 800,          // end of utterance: this much quiet after speech was heard
  speechAboveFloorDb: 8,   // speech = louder than the tracked room floor by this many dB (main knob)
  silenceDb: -50,          // absolute lower bound for the speech threshold, in RMS dBFS per 100 ms
  agcSettleMs: 800,        // laptop mic arrays ramp their gain up at start; the floor is read after this
  minSpeechMs: 300,        // shorter bursts (clicks, a cough) are ignored, never transcribed
  listenTimeoutMs: 45000,  // nobody spoke for this long: the line closes for this turn
  maxUtteranceMs: 60000,   // hard cap on a single utterance
  maxSpokenChars: 600,     // replies longer than this are condensed before being spoken
  maxTurns: 200,           // runaway guard for the block loop
}
const convCfg = (s) => Object.assign({}, CONV, (s && s.conversation) || {})
const sessionMode = (s, sid) =>
  (((s && s.sessions) || {})[sid] || {}).mode === 'conversation' ? 'conversation' : 'notify'

// ---------------------------------------------------------------------------
// infra
// ---------------------------------------------------------------------------
const ensureDirs = () => {
  for (const d of [DIR, AUDIO]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}

const log = (msg) => {
  try {
    ensureDirs()
    fs.appendFileSync(LOG, '[' + new Date().toISOString() + '] ' + msg + '\n')
    // El log es para diagnosticar, no para crecer sin fin.
    if (fs.statSync(LOG).size > 512 * 1024) {
      const keep = fs.readFileSync(LOG, 'utf8').split('\n').slice(-500).join('\n')
      fs.writeFileSync(LOG, keep)
    }
  } catch {}
}

const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'))
  } catch {
    return { enabled: false, voice: DEFAULT_VOICE, model: DEFAULT_MODEL, chars: 0, spoken: 0 }
  }
}

const writeState = (s) => {
  ensureDirs()
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2))
}

const sleepSync = (ms) => {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch {}
}

/**
 * Mutex entre PROCESOS, no entre hilos. Varias sesiones de Claude Code cierran turno al mismo
 * tiempo y cada una arranca su propio talk2me: sin esto, dos avisos se generan en paralelo y
 * suenan encimados. mkdir es atomico en Windows y en POSIX, que es justo lo que se necesita.
 */
const withLock = (fn) => {
  ensureDirs()
  for (let i = 0; i < 120; i++) {
    try {
      fs.mkdirSync(LOCK)
      try { return fn() } finally { try { fs.rmdirSync(LOCK) } catch {} }
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      // Un proceso que murio a medias no puede dejar la voz muerta para siempre.
      try {
        if (Date.now() - fs.statSync(LOCK).mtimeMs > 90000) { fs.rmdirSync(LOCK); continue }
      } catch {}
      sleepSync(250)
    }
  }
  log('lock ocupado 30s, sigo sin el')
  return fn()
}

/**
 * The key never lives in this file. Search order: ELEVENLABS_API_KEY in the environment, then
 * ~/.claude/talk2me/.env (mode 600, never committed).
 */
const apiKey = () => {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim()
  const candidates = [ENVFILE]
  for (const f of candidates) {
    try {
      const m = fs.readFileSync(f, 'utf8').match(/^\s*ELEVENLABS_API_KEY\s*=\s*(.+)\s*$/m)
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    } catch {}
  }
  return null
}

// ---------------------------------------------------------------------------
// audio
// ---------------------------------------------------------------------------
const WINGET_FF = path.join(
  HOME, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages',
  'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1-full_build', 'bin', 'ffplay.exe'
)

const findFfplay = () => {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['ffplay'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().split(/\r?\n/).filter(Boolean)[0]
    if (out && fs.existsSync(out)) return out
  } catch {}
  if (fs.existsSync(WINGET_FF)) return WINGET_FF
  return null
}

/**
 * Corta TODO lo que este sonando, no solo lo ultimo. Se guarda la lista completa de pids que
 * este motor lanzo: con un solo pid, dos avisos casi simultaneos dejaban uno huerfano sonando
 * encima del otro, que es exactamente el ruido que hace inutil el aviso.
 */
/*
 * `soloSesion` limita el corte a los avisos nacidos de ESA sesion. Sin ese filtro la bocina es
 * global y tecleando en un proyecto se mataba a media frase el aviso de otro proyecto, que es
 * exactamente el que no habia que cortar: si el usuario esta escribiendo en otro proyecto, el
 * aviso de este sigue siendo valido y es lo unico que se lo va a recordar.
 * Sin argumento corta todo, que es lo que quiere `off`.
 */
const stopPlayback = (soloSesion) => {
  let reg = []
  try { reg = JSON.parse(fs.readFileSync(PIDFILE, 'utf8')) } catch {}
  if (!Array.isArray(reg)) reg = []
  const conserva = soloSesion ? reg.filter((r) => r && r.sid && r.sid !== soloSesion) : []
  if (soloSesion) reg = reg.filter((r) => r && r.sid === soloSesion)
  /*
   * Solo se matan pids registrados hace poco. Windows recicla numeros de pid, y tras un
   * reinicio el 4844 que anotamos como "ffplay" puede ser cualquier proceso del usuario.
   * Matar a ciegas por un pid guardado en disco es la clase de bug que tira algo suyo sin
   * relacion. Ningun aviso dura mas de minuto y medio, asi que un registro viejo no es nuestro.
   */
  const FRESCO = 5 * 60 * 1000
  const pids = reg
    .map((r) => (typeof r === 'number' ? { pid: r, at: 0 } : r))
    .filter((r) => r && r.pid && Date.now() - (r.at || 0) < FRESCO)
    .map((r) => r.pid)
  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      } else {
        process.kill(pid, 'SIGKILL')
      }
    } catch {}
  }
  try { fs.writeFileSync(PIDFILE, JSON.stringify(conserva)) } catch {}
}

const registerPid = (pid, sid) => {
  let pids = []
  try { pids = JSON.parse(fs.readFileSync(PIDFILE, 'utf8')) } catch {}
  if (!Array.isArray(pids)) pids = []
  pids.push({ pid, at: Date.now(), sid: sid || null })
  try { fs.writeFileSync(PIDFILE, JSON.stringify(pids.slice(-8))) } catch {}
}

/*
 * Machine-wide "speaking" lock, deliberately OUTSIDE the state dir so every copy of the engine
 * on the machine shares it (--dir moves the state, not this). Two things respect it: playback
 * waits for it so two notices never overlap, and the conversation mic waits for it so it never
 * opens while a voice is coming out of the speakers. Without it, in a live test the mic heard
 * the notice of ANOTHER session and Claude took that summary as the user's instruction.
 */
const SPEAKING = path.join(HOME, '.claude', 'talk2me-speaking.lock')
const SPEAKING_FRESH = 90000 // a player never runs longer than this; older locks are corpses
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const speakingHeld = () => {
  try { return Date.now() - fs.statSync(SPEAKING).mtimeMs < SPEAKING_FRESH } catch { return false }
}
const holdSpeaking = () => { try { fs.writeFileSync(SPEAKING, String(process.pid)) } catch {} }
const releaseSpeaking = () => { try { fs.unlinkSync(SPEAKING) } catch {} }
const waitForSilence = async (maxMs) => {
  const t0 = Date.now()
  while (speakingHeld() && Date.now() - t0 < maxMs) await sleep(200)
}

/** Arranca un reproductor y RESUELVE CUANDO TERMINA. Esa espera es lo que hace posible la cola. */
const playAndWait = async (file, sid) => {
  await waitForSilence(30000)
  holdSpeaking()
  try { await playNow(file, sid) } finally { releaseSpeaking() }
}

const playNow = (file, sid) =>
  new Promise((resolve) => {
    const ff = findFfplay()
    let child
    if (ff) {
      child = spawn(ff, ['-nodisp', '-autoexit', '-loglevel', 'quiet', file], {
        stdio: 'ignore', windowsHide: true,
      })
    } else if (process.platform === 'win32') {
      // Fallback sin ffmpeg: Windows Media Player por COM. Menos fino pero no pide instalar nada.
      const safe = file.split("'").join("''")
      const ps = '$p=New-Object -ComObject WMPlayer.OCX;$p.URL=' + "'" + safe + "'" +
        ';$p.controls.play();Start-Sleep -Milliseconds 600;' +
        'while($p.playState -eq 3){Start-Sleep -Milliseconds 200}'
      child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
        stdio: 'ignore', windowsHide: true,
      })
    } else {
      child = spawn('afplay', [file], { stdio: 'ignore' })
    }
    registerPid(child.pid, sid)
    let done = false
    let guard
    const finish = () => { if (!done) { done = true; clearTimeout(guard); resolve() } }
    child.on('exit', finish)
    child.on('error', finish)
    // Un reproductor colgado no puede secuestrar la cola para siempre. The timer is cleared on
    // exit on purpose: left armed, it kept a synchronous Stop hook alive 90 s after playback.
    guard = setTimeout(() => { try { child.kill() } catch {}; finish() }, 90000)
  })

/**
 * El audio cierra en silencio, o se corto a media palabra?
 *
 * ElevenLabs devuelve 200 y un mp3 integro (bytes == content-length) que aun asi puede terminar
 * a mitad de una frase: el modelo `eleven_v3` es no determinista y al mismo texto le da
 * duraciones distintas cada vez, comiendose el final en una de cada dos o tres. Ningun codigo
 * de estado delata eso; hay que MIRAR la onda.
 *
 * Se comparan los ultimos 250 ms contra el nivel medio de todo el aviso. Un cierre normal decae
 * a silencio (ratio bajo); un corte deja la voz sonando fuerte hasta el ultimo sample.
 *
 * Devuelve true si no se puede medir: sin ffmpeg, mejor un aviso sin verificar que ninguno.
 */
const audioCompleto = (file) => {
  const ff = findFfplay()
  if (!ff) return true
  const ffmpeg = ff.replace(/ffplay(\.exe)?$/i, 'ffmpeg$1')
  if (!fs.existsSync(ffmpeg)) return true
  const SR = 8000
  const r = spawnSync(ffmpeg, ['-v', 'quiet', '-i', file, '-f', 's16le', '-acodec', 'pcm_s16le',
    '-ar', String(SR), '-ac', '1', '-'], { maxBuffer: 1e8, windowsHide: true })
  const b = r.stdout
  if (!b || b.length < SR) return true
  const n = b.length / 2
  const rms = (a, z) => {
    let s = 0, c = 0
    for (let i = a; i < z; i++) { const v = b.readInt16LE(i * 2); s += v * v; c++ }
    return Math.sqrt(s / Math.max(1, c))
  }
  const total = rms(0, n)
  if (!total) return true
  const ratio = rms(Math.max(0, n - Math.floor(SR * 0.25)), n) / total
  return ratio <= 0.35
}

// ---------------------------------------------------------------------------
// presencia: la camara decide si vale la pena hablar
// ---------------------------------------------------------------------------
/*
 * El orden esta INVERTIDO a proposito: primero se pregunta si el usuario esta frente a la
 * maquina, y solo entonces se escribe y se sintetiza el mensaje.
 *
 * Hablarle a un cuarto vacio no solo es inutil: cuesta un resumidor y una llamada de TTS por
 * cada turno que nadie escucha. Con la camara de por medio, un dia entero de trabajo sin el
 * enfrente gasta cero creditos de voz y cero tokens de resumen, y lo que se acumula es texto
 * en un JSON.
 */
/*
 * Orden de camaras: primero la elegida (`camera` en state.json, o TALK2ME_CAMERA), despues
 * todas las demas que dshow enumere, como respaldo. El respaldo importa por un gotcha real:
 * algunas apps de camara virtual (efectos de fondo, OBS), cuando corren, BLOQUEAN la camara
 * USB fisica. Sin respaldo la voz quedaba muda sin un solo error: la captura fallaba, se leia
 * como "no esta", y los avisos se apilaban con el usuario sentado enfrente. La camara virtual
 * expone ese mismo stream, asi que sirve justo cuando la fisica no se deja.
 */
/** Video capture devices as dshow reports them, in order. */
const listCams = () => {
  const bin = ffmpegBin()
  if (!bin) return []
  const r = spawnSync(bin, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 })
  const out = (r.stderr || '') + (r.stdout || '')
  return [...out.matchAll(/"([^"]+)"\s+\(video\)/g)].map((m) => m[1])
}
const PRESENCIA = path.join(DIR, 'presence.json')
const CAMDIR = path.join(DIR, 'cam')
const PRESENCIA_TTL = 25000 // varias sesiones cerrando turno a la vez comparten un solo vistazo

const ffmpegBin = () => {
  const ff = findFfplay()
  if (!ff) return null
  const bin = ff.replace(/ffplay(\.exe)?$/i, 'ffmpeg$1')
  return fs.existsSync(bin) ? bin : null
}

/** Un frame de la camara elegida, escalado a 640px: suficiente para ver si hay alguien, barato de subir. */
const capturarFrame = () => {
  const bin = ffmpegBin()
  if (!bin) return null
  if (!fs.existsSync(CAMDIR)) fs.mkdirSync(CAMDIR, { recursive: true })
  const file = path.join(CAMDIR, 'frame.jpg')
  /*
   * Dos intentos. Una camara USB puede tardar en soltarse despues de una captura anterior, y un
   * fallo pasajero se veia como "no esta disponible", lo que posponia un aviso con el usuario
   * sentado enfrente. Perder un aviso por una carrera de USB es peor que esperar medio segundo.
   */
  const stCam = readState()
  const preferida = process.env.TALK2ME_CAMERA ||
    (typeof stCam.camera === 'string' ? stCam.camera : stCam.camara)
  const CAMARAS = listCams()
  const lista = preferida ? [preferida].concat(CAMARAS.filter((c) => c !== preferida)) : CAMARAS
  if (!lista.length) { log('dshow no lista ninguna camara'); return null }
  for (const cam of lista) {
    for (let intento = 1; intento <= 2; intento++) {
      try { fs.unlinkSync(file) } catch {}
      const r = spawnSync(bin, [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'dshow', '-rtbufsize', '100M', '-i', 'video=' + cam,
        '-frames:v', '1', '-vf', 'scale=640:-1', '-q:v', '6', '-y', file,
      ], { timeout: 20000, windowsHide: true, encoding: 'utf8' })
      if (fs.existsSync(file) && fs.statSync(file).size >= 500) {
        if (cam !== lista[0]) log('la ' + lista[0] + ' no se dejo, use ' + cam)
        return file
      }
      log('sin frame de "' + cam + '" (intento ' + intento + '): ' +
        ((r.stderr || '').split('\n').filter(Boolean).pop() || 'sin detalle'))
      if (intento === 1) sleepSync(800)
    }
  }
  // Todas ocupadas o desconectadas: no es un error, es "no se".
  return null
}

/**
 * Frame negro = tapa puesta, camara dormida o cuarto a oscuras. Se mide en local y gratis, y
 * evita mandarle a un modelo una imagen en la que no hay nada que ver.
 */
const frameNegro = (file) => {
  const bin = ffmpegBin()
  if (!bin) return false
  const r = spawnSync(bin, ['-v', 'quiet', '-i', file, '-vf', 'scale=64:64,format=gray',
    '-f', 'rawvideo', '-'], { maxBuffer: 1e7, windowsHide: true })
  const b = r.stdout
  if (!b || !b.length) return false
  let suma = 0
  for (let i = 0; i < b.length; i++) suma += b[i]
  const media = suma / b.length
  log('brillo medio del frame: ' + media.toFixed(1) + '/255')
  return media < 12
}

/** Haiku mirando una foto de 640px. Es la parte cara del chequeo, y por eso va al final. */
const hayPersona = (file) => {
  const args = [
    '-p', 'Mira la imagen en ' + file.replace(/\\/g, '/') + ' con la herramienta Read. ' +
      'Responde EXACTAMENTE una palabra: PERSONA si hay un ser humano visible, o VACIO si no ' +
      'hay nadie (silla vacia, cuarto vacio, imagen negra o borrosa sin gente). Nada mas.',
    '--model', 'haiku',
    '--allowedTools', 'Read',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--setting-sources', '',
    '--permission-mode', 'dontAsk',
  ]
  try {
    const r = spawnSync('claude ' + args.map(quoteArg).join(' '), {
      encoding: 'utf8', timeout: 60000, windowsHide: true, shell: true, cwd: DIR,
      env: Object.assign({}, process.env, { TALK2ME_CHILD: '1' }),
    })
    const out = (r.stdout || '').trim().toUpperCase()
    if (out.includes('PERSONA')) return true
    if (out.includes('VACIO')) return false
    log('detector de persona respondio raro: ' + out.slice(0, 80))
  } catch (e) {
    log('detector de persona fallo: ' + e.message)
  }
  return false // ante la duda NO se habla: el mensaje espera, no se pierde
}

/**
 * Devuelve 'persona' | 'vacio' | 'negro' | 'sin-camara'.
 * Cachea el veredicto unos segundos porque varias sesiones cierran turno casi a la vez y no
 * tiene sentido encender la camara cinco veces para la misma respuesta.
 */
const checarPresencia = () => {
  // `camera: false` in state.json disables the presence gate: every notice is spoken right away.
  if (readState().camera === false) { log('presence gate off (camera: false)'); return 'persona' }
  try {
    const p = JSON.parse(fs.readFileSync(PRESENCIA, 'utf8'))
    if (Date.now() - p.at < PRESENCIA_TTL) { log('presencia en cache: ' + p.estado); return p.estado }
  } catch {}

  let estado
  const file = capturarFrame()
  if (!file) estado = 'sin-camara'
  else if (frameNegro(file)) estado = 'negro'
  else estado = hayPersona(file) ? 'persona' : 'vacio'

  try { fs.writeFileSync(PRESENCIA, JSON.stringify({ estado, at: Date.now() })) } catch {}
  log('presencia: ' + estado)
  return estado
}

// ---------------------------------------------------------------------------
// pendientes: el JSON central que sobrevive a que el usuario no este
// ---------------------------------------------------------------------------
/*
 * Vive a nivel global (~/.claude/talk2me/pending.json) y lo comparten TODAS las sesiones, pero
 * cada entrada recuerda de que sesion y proyecto salio. Es un JSON a proposito, editable a
 * mano: si algo se atora, se abre y se arregla, sin base de datos ni migraciones. Es temporal
 * por diseno (lo que ya sono se borra); el registro que se conserva es history.md.
 */
const PENDING = path.join(DIR, 'pending.json')
const HISTORY = path.join(DIR, 'history.md')

const readPending = () => {
  try {
    const j = JSON.parse(fs.readFileSync(PENDING, 'utf8'))
    return Array.isArray(j.pendientes) ? j.pendientes : []
  } catch { return [] }
}

const writePending = (lista) => {
  ensureDirs()
  try {
    fs.writeFileSync(PENDING, JSON.stringify({
      _comment: 'Notices waiting for someone to show up in front of the camera. Hand-editable on purpose.',
      actualizado: new Date().toISOString(),
      pendientes: lista,
    }, null, 2))
  } catch (e) { log('no pude escribir pending.json: ' + e.message) }
}

/** Append eterno. La cola se vacia; esto no, para poder reconstruir que se dijo y cuando. */
const historia = (evento, item, extra) => {
  try {
    ensureDirs()
    if (!fs.existsSync(HISTORY)) {
      fs.writeFileSync(HISTORY, '# talk-2-me - history\n\n' +
        'Append-only log of every notice: when it was queued, when it was spoken, and why it waited.\n' +
        'The live queue is `pending.json`; this is the record that is never erased.\n\n')
    }
    const t = new Date().toISOString()
    const proj = item && item.proyecto ? ' `' + item.proyecto + '`' : ''
    const sid = item && item.sid ? ' sesion `' + String(item.sid).slice(0, 8) + '`' : ''
    const txt = item && item.texto ? '\n  > ' + String(item.texto).replace(/\s+/g, ' ').slice(0, 300) : ''
    fs.appendFileSync(HISTORY, '- **' + t + '** ' + evento + proj + sid +
      (extra ? ' - ' + extra : '') + txt + '\n')
  } catch {}
}

// ---------------------------------------------------------------------------
// cola
// ---------------------------------------------------------------------------
/*
 * Por que una cola y no "gana el mas nuevo":
 *
 * Dos sesiones de Claude Code que cierran turno con segundos de diferencia producen dos avisos
 * sobre DOS proyectos distintos. Descartar el primero pierde informacion que el usuario nunca
 * va a recuperar (no hay pantalla que mire donde salga lo que no sono). Encimarlos los vuelve
 * ruido. La cola es la unica opcion que conserva los dos y deja entender los dos: suenan en
 * orden, uno despues del otro.
 */
const readQueue = () => {
  try {
    const q = JSON.parse(fs.readFileSync(QUEUE, 'utf8'))
    return Array.isArray(q) ? q : []
  } catch { return [] }
}

const writeQueue = (q) => {
  ensureDirs()
  try { fs.writeFileSync(QUEUE, JSON.stringify(q)) } catch {}
}

/** Cuenta lo pendiente sin sacarlo: para que `status` pueda decir si algo sigue en fila. */
const queueDepth = () => readQueue().length

const enqueue = (item) =>
  withLock(() => {
    const q = readQueue()
    q.push(item)
    // Techo duro. Si se acumularon 8 avisos sin escuchar, los mas viejos ya no sirven de nada.
    if (q.length > 8) { log('cola llena, tiro los ' + (q.length - 8) + ' mas viejos'); q.splice(0, q.length - 8) }
    writeQueue(q)
    return q.length
  })

/*
 * "Vivo" tiene que incluir "y es de esta epoca". Tras reiniciar la laptop, el pid guardado
 * puede pertenecer a un proceso nuevo de Windows, `process.kill(pid,0)` diria que si, y el
 * motor no volveria a arrancar un drenador NUNCA: la voz quedaria muda para siempre sin un
 * solo error en el log. Un drenador real vive segundos, no horas.
 */
const drainerAlive = () => {
  try {
    const raw = fs.readFileSync(DRAINPID, 'utf8').trim()
    let pid, at
    try { const j = JSON.parse(raw); pid = j.pid; at = j.at } catch { pid = parseInt(raw, 10); at = 0 }
    if (!pid) return false
    if (Date.now() - (at || 0) > 10 * 60 * 1000) { log('drainer.pid rancio, lo ignoro'); return false }
    process.kill(pid, 0) // no lo mata: solo pregunta si sigue vivo
    return true
  } catch { return false }
}

const writeDrainPid = (pid) => {
  try { fs.writeFileSync(DRAINPID, JSON.stringify({ pid, at: Date.now() })) } catch {}
}

/**
 * Un solo drenador a la vez, en su propio proceso. Va aparte del hook a proposito: el hook
 * tiene que devolver rapido, y la cola puede tardar medio minuto en vaciarse.
 */
const ensureDrainer = () =>
  withLock(() => {
    if (drainerAlive()) return false
    const child = spawn(process.execPath, [__filename, 'drain', ...dirArgs()], {
      detached: true, stdio: 'ignore', windowsHide: true,
    })
    writeDrainPid(child.pid)
    child.unref()
    return true
  })

const drain = async () => {
  writeDrainPid(process.pid)
  try {
    for (;;) {
      // El lock se toma solo para sacar el item, nunca mientras suena: si no, un aviso de 8
      // segundos bloquearia a cualquier sesion que quiera encolar el suyo.
      const item = withLock(() => {
        const q = readQueue()
        const it = q.shift() || null
        writeQueue(q)
        return it
      })
      if (!item) break
      if (!readState().enabled) { log('voz apagada, vacio la cola'); writeQueue([]); break }
      log('reproduciendo: ' + (item.text || item.file))
      await playAndWait(item.file, item.sid)
    }
  } finally {
    try { fs.unlinkSync(DRAINPID) } catch {}
  }
}

// ---------------------------------------------------------------------------
// mic: capture one utterance and transcribe it (conversation mode)
// ---------------------------------------------------------------------------
/** Audio capture devices as dshow reports them, in order. */
const listMics = () => {
  const bin = ffmpegBin()
  if (!bin) return []
  const r = spawnSync(bin, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 })
  const out = (r.stderr || '') + (r.stdout || '')
  return [...out.matchAll(/"([^"]+)"\s+\(audio\)/g)].map((m) => m[1])
}

/**
 * Levels of a few seconds from one device. Returns percentiles of the 100 ms windows and the
 * spread between them, or null when the device cannot be recorded.
 *
 * The useful number is `dyn` (p90 minus p10), NOT the mean. Every device has its own noise
 * floor, and they differ by 20 dB on the same machine: measured in a silent room, one mic sat
 * at -60 dBFS and another at -43, so ranking by absolute level just ranks the hiss. Speech is
 * dynamic, loud syllables with gaps between them, while steady noise is flat, so the spread
 * inside a single recording separates them and needs no baseline. The first 300 ms are dropped
 * because opening a capture device emits a click that dominates the peak.
 */
const measureMic = (mic, secs) => {
  const bin = ffmpegBin()
  if (!bin) return null
  if (!fs.existsSync(CAMDIR)) fs.mkdirSync(CAMDIR, { recursive: true })
  const file = path.join(CAMDIR, 'miccheck.wav')
  try { fs.unlinkSync(file) } catch {}
  spawnSync(bin, [
    '-hide_banner', '-loglevel', 'error', '-f', 'dshow', '-audio_buffer_size', '50',
    '-i', 'audio=' + mic, '-t', String(secs), '-ac', '1', '-ar', '16000', '-y', file,
  ], { timeout: (secs + 15) * 1000, windowsHide: true, encoding: 'utf8' })
  let pcm
  try { pcm = fs.readFileSync(file).subarray(44 + 16000 * 2 * 0.3) } catch { return null }
  if (pcm.length < 16000) return null
  const WIN = 1600
  const levels = []
  for (let o = 0; o + WIN <= pcm.length; o += WIN) levels.push(dbOf(pcm.subarray(o, o + WIN)))
  if (levels.length < 5) return null
  levels.sort((a, b) => a - b)
  const at = (q) => levels[Math.min(levels.length - 1, Math.floor(levels.length * q))]
  const p10 = at(0.1), p50 = at(0.5), p90 = at(0.9)
  // The wav stays on disk under a name of its own so the caller can transcribe it before the
  // next device overwrites the shared capture file.
  const keep = path.join(CAMDIR, 'miccheck-' + crypto.createHash('sha1').update(mic).digest('hex').slice(0, 8) + '.wav')
  try { fs.copyFileSync(file, keep) } catch { return null }
  return { p10, p50, p90, dyn: p90 - p10, file: keep }
}

/**
 * Records EVERY input at the same time: one ffmpeg with N dshow inputs mapped to N wavs.
 *
 * Recording devices one after another forces the speaker to keep talking through the whole
 * sweep, and each device still hears different words; whichever goes first also catches the
 * moment before they start and reads as broken. Capturing at once puts the same sentence on
 * every device and cuts the ask to a few seconds. Returns a Map of device to file, or null when
 * the combined capture fails, since a device can refuse to open while another one is active.
 */
const recordAllMics = (mics, secs) => {
  const bin = ffmpegBin()
  if (!bin) return null
  if (!fs.existsSync(CAMDIR)) fs.mkdirSync(CAMDIR, { recursive: true })
  const args = ['-hide_banner', '-loglevel', 'error']
  const files = new Map()
  /*
   * The four captures START together but END apart, and the fix is to trim, not to re-time.
   *
   * ffmpeg opens dshow devices one after another, about 0.8 s each, yet all of them begin
   * delivering samples once reading starts. Each one's own `-t` clock, however, began when IT
   * was opened, so the device opened first stops first. Measured across four inputs asked for
   * 5 s: 2.49, 3.20, 4.03 and 4.80 s, a staircase that left the first device with half a
   * sentence and a transcript of pure noise. Since they share a start, the opening seconds of
   * every file cover the same words: ask for enough extra time that even the first device
   * exceeds `secs`, then cut every file to the shortest one.
   */
  const grab = secs + mics.length
  mics.forEach((m) => args.push('-f', 'dshow', '-audio_buffer_size', '50', '-t', String(grab), '-i', 'audio=' + m))
  mics.forEach((m, i) => {
    const f = path.join(CAMDIR, 'miccheck-' + i + '.wav')
    try { fs.unlinkSync(f) } catch {}
    args.push('-map', i + ':a', '-ac', '1', '-ar', '16000', '-y', f)
    files.set(m, f)
  })
  const r = spawnSync(bin, args, { timeout: (grab + 30) * 1000, windowsHide: true, encoding: 'utf8' })

  const pcms = new Map()
  for (const [m, f] of files) {
    try { pcms.set(m, fs.readFileSync(f).subarray(44)) } catch { pcms.set(m, Buffer.alloc(0)) }
  }
  const shortest = Math.min(...[...pcms.values()].map((p) => p.length))
  if (shortest < 16000 * 2) {
    log('simultaneous capture failed: ' + ((r.stderr || '').split('\n').filter(Boolean).pop() || 'short files'))
    return null
  }
  for (const [m, p] of pcms) {
    try { fs.writeFileSync(files.get(m), wavFrom(p.subarray(0, shortest), 16000)) } catch { return null }
  }
  log('simultaneous capture: ' + mics.length + ' inputs trimmed to ' + (shortest / 32000).toFixed(2) + ' s each')
  return files
}

/** Level percentiles of an existing wav, the same measure measureMic reports. */
const levelsOf = (file) => {
  let pcm
  try { pcm = fs.readFileSync(file).subarray(44 + 16000 * 2 * 0.3) } catch { return null }
  if (pcm.length < 16000) return null
  const WIN = 1600
  const levels = []
  for (let o = 0; o + WIN <= pcm.length; o += WIN) levels.push(dbOf(pcm.subarray(o, o + WIN)))
  if (levels.length < 5) return null
  levels.sort((a, b) => a - b)
  const at = (q) => levels[Math.min(levels.length - 1, Math.floor(levels.length * q))]
  return { p10: at(0.1), p50: at(0.5), p90: at(0.9), dyn: at(0.9) - at(0.1), file }
}

/** `mic` in state.json wins; otherwise the first capture device ffmpeg lists. */
const micName = (s) => {
  if (s && typeof s.mic === 'string' && s.mic) return s.mic
  return micCandidates(s)[0] || null
}

/*
 * Built-in laptop arrays are the last resort, never the default. They are far-field, heavily
 * processed, and on the machine this was built for one measured 2.7 dB of voice above its own
 * hiss while the other inputs gave 28 to 42, and the transcriber turned that hiss into a
 * complete sentence nobody had said. In conversation mode an invented sentence does not just
 * look wrong, it reaches Claude as a spoken instruction.
 */
const BUILTIN_MIC = /microphone array|built-?in|internal mic|smart sound/i

/**
 * Inputs to try, best first. A single pinned device leaves the line deaf whenever another app
 * holds it, so this is a preference order and the recorder walks it: `mic` (a name, or a list),
 * then the ranking the last `mics --test` saved, then whatever else exists. `micDeny` (a list of
 * substrings) removes devices outright.
 */
const micCandidates = (s) => {
  const all = listMics()
  const deny = (s && Array.isArray(s.micDeny) ? s.micDeny : []).map((d) => String(d).toLowerCase())
  const pinned = s && typeof s.mic === 'string' ? [s.mic] : (s && Array.isArray(s.mic) ? s.mic : [])
  const ranked = s && Array.isArray(s.micRanking) ? s.micRanking : []
  const order = []
  for (const m of pinned.concat(ranked, all)) {
    if (all.includes(m) && !order.includes(m)) order.push(m)
  }
  const allowed = order.filter((m) => !deny.some((d) => m.toLowerCase().includes(d)))
  // Stable partition: everything else first, built-in arrays after, unless one was pinned.
  const explicit = new Set(pinned)
  return allowed.filter((m) => explicit.has(m) || !BUILTIN_MIC.test(m))
    .concat(allowed.filter((m) => !explicit.has(m) && BUILTIN_MIC.test(m)))
}

/** Minimal RIFF header around raw 16-bit mono PCM. Scribe wants a real wav, not a bare stream. */
const wavFrom = (pcm, rate) => {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

/**
 * Peak-normalize 16-bit PCM to -3 dBFS, gain capped at +30 dB. A shotgun mic at a normal
 * Windows input level gave speech peaks near -43 dBFS; Scribe misread the language and half a
 * sentence on that. Gain does not fix the signal-to-noise ratio, but it puts the audio where
 * the transcriber expects it. Returns a new buffer; the input is left alone.
 */
const normalizePcm = (pcm) => {
  const n = pcm.length >> 1
  let peak = 0
  for (let i = 0; i < n; i++) { const v = Math.abs(pcm.readInt16LE(i * 2)); if (v > peak) peak = v }
  if (!peak) return pcm
  const gain = Math.min(Math.pow(10, 30 / 20), (32767 * 0.708) / peak) // -3 dBFS target
  if (gain <= 1.05) return pcm
  const out = Buffer.alloc(pcm.length)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i * 2) * gain)))
    out.writeInt16LE(v, i * 2)
  }
  log('utterance normalized by +' + (20 * Math.log10(gain)).toFixed(1) + ' dB')
  return out
}

/** RMS level of a 16-bit PCM window in dBFS. */
const dbOf = (b) => {
  const n = b.length >> 1
  if (!n) return -120
  let sum = 0
  for (let i = 0; i < n; i++) { const v = b.readInt16LE(i * 2) / 32768; sum += v * v }
  return 20 * Math.log10(Math.sqrt(sum / n) + 1e-9)
}

/**
 * Records ONE utterance into a 16 kHz mono wav and resolves with the file, or null when nobody
 * spoke before the timeout. End of utterance = `silenceMs` of quiet AFTER speech was heard.
 *
 * The level is measured HERE, on raw PCM streamed by ffmpeg, not with ffmpeg's silencedetect:
 * that filter reports on stderr, and ffmpeg buffers stderr when it is a pipe, so its
 * `silence_start` lines arrived only when the process ended. Every listen ran to the 60 s cap.
 * Raw PCM with `-flush_packets 1` arrives within a few dozen milliseconds, and the wav is
 * written by us, so stopping ffmpeg any way we like never leaves a broken header.
 *
 * Threshold: the room floor plus `speechAboveFloorDb`, never below `silenceDb`. The floor is
 * read AFTER `agcSettleMs`, because laptop mic arrays (Intel Smart Sound, for one) ramp their
 * automatic gain during the first second: the same room reads -63 dBFS at 200 ms and -37 dBFS
 * at 1200 ms. A fixed threshold either swallows quiet syllables or never sees silence. After
 * settling the floor keeps tracking: fast to fall, slow to rise, frozen while speech is on.
 */
/*
 * TELL HIM WHEN IT IS LISTENING.
 *
 * The mic used to open in silence, so there was nothing to react to: he guessed, started late
 * and stopped early, and the log filled with utterances of 300 to 900 ms that transcribed to
 * nothing. Two short tones fix the timing: rising when the mic opens, falling when the
 * utterance is cut. They are generated once by ffmpeg and cached, so they cost nothing per
 * turn, and the open tone plays BEFORE the mic starts so it is never recorded into the audio.
 * `cues: false` in state.json turns them off.
 */
const CUES = { open: 'sine=frequency=660:duration=0.09,volume=0.25', close: 'sine=frequency=440:duration=0.07,volume=0.2' }

const cueFile = (kind) => {
  const bin = ffmpegBin()
  if (!bin) return null
  ensureDirs()
  const f = path.join(AUDIO, 'cue-' + kind + '.wav')
  if (fs.existsSync(f)) return f
  const r = spawnSync(bin, ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', CUES[kind], '-ar', '24000', '-ac', '1', f],
    { windowsHide: true, timeout: 15000, encoding: 'utf8' })
  if (fs.existsSync(f)) return f
  log('could not build the ' + kind + ' cue: ' + String(r.stderr || '').slice(0, 140))
  return null
}

const cue = async (kind) => {
  if (readState().cues === false) return
  const f = cueFile(kind)
  if (!f) return
  const ff = findFfplay()
  if (!ff) return
  // Fire and forget, and never through the queue: a cue that waits its turn is not a cue.
  try {
    const c = spawn(ff, ['-nodisp', '-autoexit', '-loglevel', 'quiet', f], { stdio: 'ignore', windowsHide: true })
    await new Promise((res) => { c.on('exit', res); c.on('error', res); setTimeout(res, 1500) })
  } catch {}
}

/** A device that would not open, as opposed to one that opened and heard nothing. */
const MIC_BUSY = Symbol('mic-busy')

const record = async (cfg, mic) => {
  // Never open the mic while any talk-2-me voice is still coming out of the speakers.
  if (speakingHeld()) { log('waiting for the speakers to go quiet before listening'); await waitForSilence(30000); await sleep(300) }
  const r = await recordNow(cfg, mic)
  return r === MIC_BUSY ? null : r
}

/**
 * Listens on the first input that will actually open, walking the preference order.
 *
 * A single pinned device leaves the line deaf whenever another app holds it, and on this setup
 * the good mics are exactly the ones that get taken: the speakerphone goes into meetings and
 * the shotgun is not always plugged in. Only a failure to OPEN moves on: a device that opened
 * and heard nothing means the room was quiet, and hopping mics on silence would swap ears
 * mid-conversation for no reason.
 */
const recordAuto = async (cfg, s) => {
  const candidates = micCandidates(s)
  if (!candidates.length) { log('no usable audio input'); return null }
  let cued = false
  for (const m of candidates) {
    if (speakingHeld()) { log('waiting for the speakers to go quiet before listening'); await waitForSilence(30000); await sleep(300) }
    // The cue goes here, after the speakers are quiet and before the mic opens, so it is heard
    // and never recorded. Once per listen, not once per device tried.
    if (!cued) { cued = true; await cue('open'); await sleep(120) }
    const r = await recordNow(cfg, m)
    if (r !== MIC_BUSY) {
      if (m !== candidates[0]) log('using fallback input: ' + m)
      return r
    }
    log('input busy or unavailable, trying the next: ' + m)
  }
  log('every input is busy: ' + candidates.join(', '))
  return null
}

const recordNow = (cfg, mic) =>
  new Promise((resolve) => {
    const bin = ffmpegBin()
    if (!bin || !mic) { log('no ffmpeg or no mic, cannot listen'); return resolve(null) }
    if (!fs.existsSync(CAMDIR)) fs.mkdirSync(CAMDIR, { recursive: true })
    const file = path.join(CAMDIR, 'utterance.wav')
    try { fs.unlinkSync(file) } catch {}
    const RATE = 16000
    const WIN = (RATE * 2) / 10 // 100 ms of s16 mono
    // `mic: "file:<path>"` plays an audio file into the detector at real-time pace. It exists for
    // tests and for debugging a room without touching a real microphone.
    const input = mic.startsWith('file:')
      ? ['-re', '-i', mic.slice(5)]
      : ['-f', 'dshow', '-audio_buffer_size', '50', '-i', 'audio=' + mic]
    const child = spawn(bin, [
      '-hide_banner', '-loglevel', 'error', '-nostats', ...input,
      '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-flush_packets', '1', 'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })

    const chunks = []
    let bytes = 0, done = false, err = '', pending = Buffer.alloc(0)
    let heardSpeech = false, quietMs = 0, audioMs = 0, peak = -120, loudRun = 0, speechMs = 0
    let floorDb = null
    let threshold = cfg.silenceDb
    const settleMs = cfg.agcSettleMs || 800
    const delta = cfg.speechAboveFloorDb || 8
    let listenT, capT
    const t0 = Date.now()

    const stop = (ok) => {
      if (done) return
      done = true
      clearTimeout(listenT); clearTimeout(capT)
      try { child.stdin.write('q'); child.stdin.end() } catch {}
      const killT = setTimeout(() => { try { child.kill() } catch {} }, 1500)
      child.once('exit', () => {
        clearTimeout(killT)
        if (!ok || bytes < RATE) { if (ok) log('utterance too short to transcribe'); return resolve(null) }
        try { fs.writeFileSync(file, wavFrom(normalizePcm(Buffer.concat(chunks)), RATE)) } catch (e) { log('wav write failed: ' + e.message); return resolve(null) }
        resolve(file)
      })
    }

    child.stdout.on('data', (c) => {
      chunks.push(c); bytes += c.length
      pending = pending.length ? Buffer.concat([pending, c]) : c
      while (pending.length >= WIN && !done) {
        const db = dbOf(pending.subarray(0, WIN))
        pending = pending.subarray(WIN)
        audioMs += 100
        if (process.env.TALK2ME_VADLOG) log('vad ' + audioMs + 'ms ' + db.toFixed(1) + ' dBFS thr ' + threshold.toFixed(1) + (heardSpeech ? ' SPEECH' : ''))
        if (audioMs <= settleMs) {
          // Gain still ramping: the loudest window of the settle period is the starting floor.
          floorDb = floorDb === null ? db : Math.max(floorDb, db)
          if (audioMs === settleMs) {
            threshold = Math.max(cfg.silenceDb, floorDb + delta)
            log('room floor ' + floorDb.toFixed(1) + ' dBFS, speech threshold ' + threshold.toFixed(1) + ' dBFS')
          }
          continue
        }
        if (db > peak) peak = db
        if (!heardSpeech && db <= threshold) {
          // Track the floor between utterances on QUIET windows only: drop at once, rise slowly,
          // so a fan turning on or the gain drifting does not read as someone talking. Loud
          // windows never lift it: they are the onset being confirmed, and letting them raise the
          // bar made the threshold run away from the voice it was about to detect.
          floorDb = db < floorDb ? db : floorDb + 0.1 * (db - floorDb)
          threshold = Math.max(cfg.silenceDb, floorDb + delta)
        }
        if (db > threshold) {
          loudRun += 100
          // Two loud windows in a row (200 ms) open an utterance; a single click does not.
          if (!heardSpeech && loudRun >= 200) { heardSpeech = true; speechMs = loudRun; log('speech at ' + audioMs + ' ms (' + db.toFixed(1) + ' dBFS)') }
          else if (heardSpeech) speechMs += 100
          quietMs = 0
        } else {
          loudRun = 0
          if (heardSpeech) {
            quietMs += 100
            if (quietMs >= cfg.silenceMs) {
              if (speechMs >= (cfg.minSpeechMs || 300)) {
                log('utterance ended at ' + audioMs + ' ms audio (' + speechMs + ' ms of speech), ' + (Date.now() - t0) + ' ms wall')
                stop(true)
              } else {
                // A burst too short to be words: forget it and keep listening.
                log('blip of ' + speechMs + ' ms ignored')
                heardSpeech = false; speechMs = 0; quietMs = 0
              }
            }
          }
        }
      }
    })
    child.stderr.on('data', (c) => { err = (err + c.toString()).slice(-4000) })
    child.on('error', (e) => { log('ffmpeg mic error: ' + e.message); stop(false) })
    child.on('exit', () => {
      // Exiting before a single window was measured means the device never opened: busy, or gone.
      if (!done) {
        done = true
        log('ffmpeg mic exited early on "' + mic + '": ' + (err.split('\n').filter(Boolean).pop() || ''))
        resolve(audioMs > 0 ? null : MIC_BUSY)
      }
    })
    listenT = setTimeout(() => {
      if (!heardSpeech) {
        log('nobody spoke in ' + cfg.listenTimeoutMs + ' ms (peak ' + peak.toFixed(1) + ' dBFS, floor ' + (floorDb === null ? '?' : floorDb.toFixed(1)) + ', threshold ' + threshold.toFixed(1) + ')')
        stop(false)
      }
    }, cfg.listenTimeoutMs)
    capT = setTimeout(() => { log('utterance hit the cap'); stop(heardSpeech) }, cfg.maxUtteranceMs)
  })

/** ElevenLabs Scribe. Returns the text, or '' when the audio held no speech. */
const transcribe = async (file, s) => {
  const key = apiKey()
  if (!key) { log('no ELEVENLABS_API_KEY, cannot transcribe'); return '' }
  const form = new FormData()
  // scribe_v1 was retired by ElevenLabs on 2026-07-09 (still answered as an alias in September).
  form.append('model_id', (s && s.sttModel) || 'scribe_v2')
  form.append('tag_audio_events', 'false')
  // The configured language is a hint, not a lock: a Spanish speaker with English tech words
  // still transcribes fine, while auto-detect on quiet audio picked English for Spanish.
  if (s && LANGS[s.lang]) form.append('language_code', s.lang)
  form.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/wav' }), 'utterance.wav')
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST', headers: { 'xi-api-key': key }, body: form,
    })
    if (!res.ok) { log('scribe ' + res.status + ': ' + (await res.text()).slice(0, 200)); return '' }
    const j = await res.json()
    const text = String(j.text || '').trim()
    /*
     * Noise alone makes Scribe emit bracketed event tags such as "[outro jingle]". Not speech.
     * Logging the empty case matters as much as logging the good one: a turn where three
     * utterances were captured and none transcribed left no trace at all, so the whole thing
     * looked dead from outside when it was actually hearing him and failing to read him.
     */
    if (!text || /^\s*(\[[^\]]*\]\s*)+$/.test(text)) {
      log('scribe returned nothing usable from ' + (j.audio_duration_secs || '?') + ' s: ' +
        (text ? JSON.stringify(text.slice(0, 60)) : '(empty)'))
      return ''
    }
    log('heard (' + (j.language_code || '?') + '): ' + text.slice(0, 160))
    return text
  } catch (e) {
    log('scribe failed: ' + e.message)
    return ''
  }
}

// ---------------------------------------------------------------------------
// tts
// ---------------------------------------------------------------------------
/**
 * Lo que se lee bien escrito no suena bien leido. Rutas, backticks, markdown y bloques de
 * codigo salen como ruido literal por la bocina, asi que no llegan al modelo de voz.
 */
const sanitize = (raw, max = MAX_CHARS) => {
  if (!raw) return ''
  const es = lang(readState()) === 'es'
  const FILE = es ? ' el archivo ' : ' the file '
  const LINK = es ? ' el link ' : ' the link '
  let t = String(raw)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*|__|\*|#+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[A-Za-z]:[\\/][^\s"']+/g, FILE)
    .replace(/(?:\.{0,2}\/)?[\w.-]+\/[\w./-]+\.\w{1,5}/g, FILE)
    .replace(/https?:\/\/\S+/g, LINK)
    .replace(/^\s*[-*>]\s+/gm, ' ')
    .replace(/[""'']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length > max) {
    const cut = t.slice(0, max)
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '))
    t = (stop > 60 ? cut.slice(0, stop) : cut).trim() + '.'
  }
  return t
}

const speak = async (text, sid, opts = {}) => {
  const key = apiKey()
  if (!key) { log('sin ELEVENLABS_API_KEY, no hablo'); return false }

  const clean = sanitize(text, opts.maxChars || MAX_CHARS)
  if (!clean) return false

  /*
   * Probar esto con la bocina viva le habla al usuario de verdad, y ya paso: una corrida de
   * verificacion le repitio el aviso de un proyecto como si el ciclo siguiera. TALK2ME_DRYRUN=1
   * ejerce todo el camino (gate, resumidor, sanitizado, cola) sin gastar credito ni sonar.
   */
  if (process.env.TALK2ME_DRYRUN) {
    log('DRYRUN, habria dicho: ' + clean)
    console.log('[dry-run] ' + clean)
    return true
  }

  const h = crypto.createHash('sha256').update(clean).digest('hex').slice(0, 16)

  // Nunca repetir la misma linea dos veces seguidas: suena a bug y gasta creditos.
  // (In a conversation a repeated reply is a legitimate answer, so inline speech skips this.)
  const nuevo = opts.inline ? true : withLock(() => {
    const st = readState()
    if (st.lastHash === h) return false
    st.lastHash = h
    writeState(st)
    return true
  })
  if (!nuevo) { log('linea repetida, no hablo: ' + clean); return false }

  const s = readState()
  const voice = s.voice || DEFAULT_VOICE
  const model = s.model || DEFAULT_MODEL
  const url = 'https://api.elevenlabs.io/v1/text-to-speech/' + voice + '?output_format=mp3_44100_128'

  ensureDirs()
  const file = path.join(AUDIO, h + '.mp3')

  /*
   * Hasta 3 intentos, y no por errores de red: un 200 con el mp3 entero puede venir cortado a
   * media palabra. Se pide, se MIDE la cola, y si quedo trunco se vuelve a pedir. Como el
   * modelo es no determinista, el segundo intento casi siempre sale bien. Al tercer fallo se
   * habla igual: un aviso al que le falta la ultima palabra sigue cumpliendo su trabajo, que es
   * levantarlo de la silla, y quedarse callado no lo cumple.
   */
  let ok = false
  for (let intento = 1; intento <= 3; intento++) {
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, model_id: model }),
      })
    } catch (e) {
      log('fetch fallo (intento ' + intento + '): ' + e.message)
      continue
    }
    if (!res.ok) {
      log('elevenlabs ' + res.status + ': ' + (await res.text()).slice(0, 300))
      return false
    }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    if (audioCompleto(file)) { ok = true; break }
    log('audio truncado por ' + model + ', reintento ' + intento + ' de 3')
  }
  if (!ok) log('sigue truncado tras 3 intentos, lo hablo asi')

  /*
   * NOPLAY ejerce el camino REAL (llamada a ElevenLabs, medicion de la onda, reintentos) pero
   * no encola nada. DRYRUN ni siquiera genera audio, asi que no sirve para verificar que el
   * modelo dejo de cortar: para eso hace falta el mp3 de verdad, sin hacerle ruido al usuario.
   */
  if (process.env.TALK2ME_NOPLAY) {
    log('NOPLAY, audio generado y verificado, no lo reproduzco: ' + clean)
    console.log('[no-play] ' + (ok ? 'COMPLETE' : 'TRUNCATED') + '  ' + file + '  ' + clean)
    return true
  }

  if (opts.inline) {
    // Conversation mode: the reply must FINISH playing before the mic opens, so no queue here.
    withLock(() => {
      const st = readState()
      st.lastText = clean
      st.lastAt = new Date().toISOString()
      st.chars = (st.chars || 0) + clean.length
      st.spoken = (st.spoken || 0) + 1
      writeState(st)
    })
    log('speaking inline: ' + clean)
    await playAndWait(file, sid)
    return true
  }

  // A la fila, no a la bocina. Si ya hay algo sonando, esto suena despues, no encima.
  const depth = enqueue({ file, text: clean, at: new Date().toISOString(), sid: sid || null })
  withLock(() => {
    const st = readState()
    st.lastText = clean
    st.lastAt = new Date().toISOString()
    st.chars = (st.chars || 0) + clean.length
    st.spoken = (st.spoken || 0) + 1
    writeState(st)
  })
  ensureDrainer()
  if (depth > 1) log('encolado detras de ' + (depth - 1) + ' aviso(s)')

  // El cache de audio no tiene por que crecer para siempre.
  try {
    const files = fs.readdirSync(AUDIO).map((f) => path.join(AUDIO, f))
    if (files.length > 40) {
      files.map((f) => ({ f, t: fs.statSync(f).mtimeMs }))
        .sort((a, b) => a.t - b.t).slice(0, files.length - 40)
        .forEach((x) => { try { fs.unlinkSync(x.f) } catch {} })
    }
  } catch {}

  log('hablado: ' + clean)
  return true
}

// ---------------------------------------------------------------------------
// transcript -> linea hablada
// ---------------------------------------------------------------------------
/** Nombre legible del proyecto. El cwd es la unica senal confiable en cualquier sesion. */
const projectName = (cwd) => {
  if (!cwd) return null
  const base = path.basename(cwd)
  // Home o raiz de disco no son un proyecto; mejor no inventar uno.
  if (!base) return null
  if (base.toLowerCase() === path.basename(HOME).toLowerCase()) return null
  if (/^[a-z]:[\\/]?$/i.test(cwd)) return null
  return base.replace(/[-_]/g, ' ').trim() || null
}

/** Ultimo texto que el agente PRINCIPAL le dijo al usuario. Los subagentes no cuentan. */
const lastAssistantText = (transcriptPath) => {
  let lines
  try {
    lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean)
  } catch {
    return ''
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    let e
    try { e = JSON.parse(lines[i]) } catch { continue }
    if (e.isSidechain) continue
    if (e.type !== 'assistant') continue
    const content = e.message && e.message.content
    if (!Array.isArray(content)) continue
    const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
    if (text) return text
  }
  return ''
}

const SUMMARIZER = () => {
  const s = readState()
  return [
    'You are the voice of Claude Code. Below is the last message I gave the user.',
    'Write ONE line in ' + langName(s) + ', at most 25 words, in FIRST PERSON (I finished, I left, I need).',
    'Start with "' + greeting(s) + '".',
    'If I give you a project name, mention it naturally, for example "in the api project".',
    'If the message asks the user questions, asks them to decide something, or waits for their OK,',
    'the line MUST say I need them to answer me. That overrides everything else.',
    'Otherwise, say in one sentence what got done.',
    'Do NOT read code, paths, commands, version numbers or technical details.',
    'The goal is to get them back to the screen, not to brief them by audio.',
    'Use plain punctuation, no dashes. Return ONLY the line, no quotes, no markdown, no explanation.',
  ].join(' ')
}

/**
 * El turno espera respuesta, o solo informa? Es la unica distincion que cambia lo que hay que
 * hacer al oir el aviso, asi que se calcula sobre el texto FUENTE y antes de gastar en el
 * resumidor: sirve para decidir el aviso y tambien para decidir si vale la pena darlo.
 */
const asksSomething = (text) =>
  /\?\s*$|\?\s*\n|necesito que|me confirmas|quieres que|te parece|cual prefieres|confirmas|te late|lo dejo asi|prefieres|need you to|let me know|should i\b|do you want|which (one|do you)|your call|waiting (on|for) (you|your)|please confirm|can you confirm/i.test(text)

/**
 * Red de seguridad cuando el resumidor no responde. Es tosco a proposito: mejor una linea
 * generica pero cierta que ninguna. Nunca afirma que algo quedo hecho si el turno pregunta.
 */
const fallbackLine = (text, proj) => {
  const asks = asksSomething(text)
  const s = readState()
  const es = lang(s) === 'es'
  const where = proj ? (es ? ' en ' : ' in ') + proj : ''
  if (asks) {
    return greeting(s) + (es ? ' necesito que me contestes algo' : ' I need you to answer something') +
      where + (es ? ' antes de seguir.' : ' before I continue.')
  }
  const first = sanitize(text.split(/\n\s*\n/)[0] || text).split(/(?<=\.)\s/)[0]
  return (greeting(s) + (es ? ' ya termine' : ' I am done') + where + '. ' + first).slice(0, MAX_CHARS)
}

/**
 * El resumen lo escribe un modelo, no una heuristica: distinguir "termine" de "necesito que
 * contestes" es justo el juicio que una regex no tiene. Haiku por costo, aislado para que no
 * cargue MCP ni herramientas, y con TALK2ME_CHILD para que el hijo no vuelva a disparar la voz.
 */
/**
 * Windows come los argumentos vacios cuando se pasa un array con shell:true, y
 * `--setting-sources ""` termina tragandose el flag siguiente ("Invalid setting source:
 * --permission-mode"). Por eso el comando se arma como UN string con el vacio citado a mano.
 */
/*
 * What `claude -p` prints is not always a summary. Logged out it prints "Not logged in · Please
 * run /login" on stdout with a non-zero exit, and speaking that aloud is worse than the fallback
 * line. Anything that fails this check falls back to the deterministic line.
 */
const BAD_SUMMARY = /not logged in|please run \/login|\/login\b|invalid api key|authentication|unauthorized|^error\b|rate limit/i

const quoteArg = (a) => {
  if (a === '') return '""'
  return /[\s{}"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a
}

const SUMMARIZER_MULTI = () => {
  const s = readState()
  return [
    'You are the voice of Claude Code. Below are SEVERAL updates that piled up while the user',
    'was away from the machine, each from a different project.',
    'Write ONE spoken message in ' + langName(s) + ', at most 45 words, in FIRST PERSON.',
    'Start with "' + greeting(s) + '".',
    'Cover ALL the projects in one flowing sentence, naming them. Do not make a list or enumerate.',
    'The updates marked QUESTION are the ones that matter: say explicitly in which ones I need them to answer me.',
    'For the ones marked DONE it is enough to say they are ready.',
    'Do NOT read code, paths, commands or technical details.',
    'The goal is that they know which screens to go to, not to hear everything by audio.',
    'Use plain punctuation, no dashes. Return ONLY the message, no quotes, no markdown, no explanation.',
  ].join(' ')
}

/**
 * Un solo mensaje para todo lo acumulado, no uno por aviso.
 *
 * Tres proyectos esperando son tres avisos que suenan uno tras otro durante veinte segundos, y
 * son tres llamadas de sintesis. Consolidar cuesta una sola llamada y se escucha como lo que
 * es: un resumen de lo que paso mientras no estaba.
 */
const summarizeMany = (items) => {
  if (items.length === 1) return summarize(items[0].texto, items[0].proyecto)
  const input = items.map((it, i) =>
    '--- update ' + (i + 1) + ' | project: ' + (it.proyecto || 'unnamed') +
    ' | ' + (it.kind === 'ask' ? 'QUESTION' : 'DONE') + ' ---\n' +
    String(it.texto || '').slice(0, 1500)
  ).join('\n\n')
  const args = [
    '-p', SUMMARIZER_MULTI(),
    '--model', 'haiku',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--setting-sources', '',
    '--permission-mode', 'dontAsk',
  ]
  try {
    const r = spawnSync('claude ' + args.map(quoteArg).join(' '), {
      input, encoding: 'utf8', timeout: 60000, windowsHide: true, shell: true, cwd: DIR,
      env: Object.assign({}, process.env, { TALK2ME_CHILD: '1' }),
    })
    const out = (r.stdout || '').trim()
    if (r.status === 0 && out && out.length > 5 && !BAD_SUMMARY.test(out)) return out.split('\n').filter(Boolean).pop().trim()
    log('resumidor multiple vacio o invalido (exit ' + r.status + '): ' + out.slice(0, 120))
  } catch (e) {
    log('resumidor multiple fallo: ' + e.message)
  }
  // Sin modelo, al menos nombrar los proyectos y no perder los que esperan respuesta.
  const asks = items.filter((i) => i.kind === 'ask').map((i) => i.proyecto).filter(Boolean)
  const proys = [...new Set(items.map((i) => i.proyecto).filter(Boolean))]
  const s = readState()
  if (lang(s) === 'es') {
    return greeting(s) + ' tengo ' + items.length + ' avisos: ' + proys.join(', ') +
      (asks.length ? '. Necesito que me contestes en ' + asks.join(' y ') + '.' : '.')
  }
  return greeting(s) + ' I have ' + items.length + ' updates: ' + proys.join(', ') +
    (asks.length ? '. I need you to answer me in ' + asks.join(' and ') + '.' : '.')
}

const summarize = (assistantText, proj) => {
  const header = proj ? 'Proyecto: ' + proj + '\n\n' : ''
  const input = header + assistantText.slice(0, 6000)
  const args = [
    '-p', SUMMARIZER(),
    '--model', 'haiku',
    '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}',
    '--setting-sources', '',
    '--permission-mode', 'dontAsk',
  ]
  try {
    const r = spawnSync('claude ' + args.map(quoteArg).join(' '), {
      input,
      encoding: 'utf8',
      timeout: 45000,
      windowsHide: true,
      shell: true,
      // Sin esto el resumidor hereda el cwd del proyecto y deja transcripts sueltos dentro de
      // cada proyecto. Su ruido no tiene por que vivir en las carpetas de trabajo.
      cwd: DIR,
      env: Object.assign({}, process.env, { TALK2ME_CHILD: '1' }),
    })
    const out = (r.stdout || '').trim()
    if (r.status === 0 && out && out.length > 5 && !BAD_SUMMARY.test(out)) return out.split('\n').filter(Boolean).pop().trim()
    log('resumidor vacio o invalido (exit ' + r.status + '): ' + (out.slice(0, 120) || (r.stderr || '').slice(0, 200) || 'sin stderr'))
  } catch (e) {
    log('resumidor fallo: ' + e.message)
  }
  return fallbackLine(assistantText, proj)
}

/**
 * Conversation mode speaks the reply itself, not a one-line notice. A long reply is condensed
 * to what one would say out loud; the screen keeps the detail. Falls back to a plain cut.
 */
const condenseForSpeech = (text, s) => {
  const prompt = [
    'You are the voice of Claude Code in a spoken conversation. Below is my full reply to the user.',
    'Rewrite it as what I would SAY out loud in ' + langName(s) + ': at most 60 words, first person,',
    'natural, keeping any question I asked. Do not read code, paths, commands or lists.',
    'Use plain punctuation, no dashes. Return ONLY the spoken text.',
  ].join(' ')
  const args = [
    '-p', prompt, '--model', 'haiku', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--setting-sources', '', '--permission-mode', 'dontAsk',
  ]
  try {
    const r = spawnSync('claude ' + args.map(quoteArg).join(' '), {
      input: text.slice(0, 6000), encoding: 'utf8', timeout: 45000, windowsHide: true, shell: true, cwd: DIR,
      env: Object.assign({}, process.env, { TALK2ME_CHILD: '1' }),
    })
    const out = (r.stdout || '').trim()
    if (r.status === 0 && out && out.length > 5 && !BAD_SUMMARY.test(out)) return out.split('\n').filter(Boolean).pop().trim()
    log('condenser empty or invalid (exit ' + r.status + ')')
  } catch (e) { log('condenser failed: ' + e.message) }
  return sanitize(text, convCfg(s).maxSpokenChars)
}

// ---------------------------------------------------------------------------
// hooks
// ---------------------------------------------------------------------------
const readStdin = () =>
  new Promise((resolve) => {
    /*
     * Synchronous first. On Windows the 'end' event of a piped stdin arrives late or never, so
     * the 3 s fallback timer below was firing on EVERY hook call and adding 3 s to each turn.
     * fs.readFileSync(0) returns as soon as the writer closes the pipe, which Claude Code does
     * right after writing the payload. The event path stays for odd stdin types (a TTY blocks
     * the sync read, so it is skipped there).
     */
    if (!process.stdin.isTTY) {
      try { return resolve(fs.readFileSync(0, 'utf8')) } catch {}
    }
    let d = ''
    let done = false
    const finish = () => { if (!done) { done = true; resolve(d) } }
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => { d += c })
    process.stdin.on('end', finish)
    process.stdin.on('error', finish)
    setTimeout(finish, 3000)
  })

// Typed or spoken phrases that open and close the line. ON wins over OFF in the same sentence.
/*
 * The skill's own name opens the line. Leaving it out cost a real session: typing
 * /talk-2-me matched nothing here, armed the older notice engine instead, and produced
 * a spoken summary at someone who was waiting to be listened to.
 */
const CONV_ON_RE = /(talk-?2-?me|talk to me|conversation mode|open (the )?line|let'?s talk|talk with me|modo conversaci[oó]n|l[ií]nea abierta|hablemos|platiquemos|modo pl[aá]tica)/i
/*
 * "pausa" is in here, "espera" and "un momento" deliberately are not: those are ordinary speech
 * inside a working conversation and would close the line every other sentence. The close word
 * has to be one nobody says by accident.
 */
const CONV_OFF_RE = /(that'?s all|that is all|end (the )?conversation|stop listening|close (the )?line|back to notif|notify mode|\bpausa(le)?\b|\bpause\b|ya estuvo|eso es todo|corta la l[ií]nea|cierra la l[ií]nea|deja de escuchar|modo avisos|termina la conversaci[oó]n|hasta luego|nos vemos|\bbye\b|adi[oó]s)/i

/**
 * Did they ASK for this, or just mention it?
 *
 * Matching a phrase anywhere in any message means talking about the feature switches it on. It
 * happened: "quiero que talk 2 me siga como estaba pero ahora linea abierta sea algo extra"
 * opened the line mid-sentence. A request is either short, or it leads the message. A mention
 * sits inside a longer sentence, and "el skill de linea abierta lo subimos ayer" must not open
 * anything, which is why a long message needs the phrase at the very front and not merely near
 * it.
 */
const asksFor = (prompt, re) => {
  const t = String(prompt || '').trim()
  const m = t.match(re)
  if (!m) return false
  /*
   * Either the phrase LEADS the message, or the message is barely more than the phrase.
   *
   * Allowing any short message was still too loose: "dice 2 veces lo de open line its listening
   * just talk" is 58 characters and opened the line while he was complaining about it. Length
   * was never the signal. What makes it a request is that the phrase IS the message, or starts
   * it; a mention sits inside a sentence about something else.
   */
  return m.index <= 1 || t.length <= m[0].length + 15
}

/**
 * Silences the OTHER talk-2-me install for one session while a line is open, and gives it back
 * exactly as it was when the line closes.
 *
 * Both engines answer for the same session, so without this a turn inside a conversation gets
 * spoken twice: once as the reply, once as the other engine's notice about that same reply.
 * `siblingState` in state.json points at the other engine's state file (defaults to the
 * original location); set it to false to leave the sibling alone entirely. Only the one
 * session's `voice` flag is ever touched, under that engine's own mkdir lock.
 */
const siblingStatePath = (s) => {
  if (s && s.siblingState === false) return null
  if (s && typeof s.siblingState === 'string') return s.siblingState
  const std = path.join(HOME, '.claude', 'talk2me', 'state.json')
  return path.resolve(std) === path.resolve(STATE) ? null : std
}

const withSiblingLock = (file, fn) => {
  const lock = path.join(path.dirname(file), '.lock')
  for (let i = 0; i < 40; i++) {
    try {
      fs.mkdirSync(lock)
      try { return fn() } finally { try { fs.rmdirSync(lock) } catch {} }
    } catch (e) {
      if (e.code !== 'EEXIST') return fn()
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 90000) { fs.rmdirSync(lock); continue } } catch {}
      sleepSync(100)
    }
  }
  return fn()
}

/** `quiet` true mutes the sibling for this session; false restores it if we had muted it. */
const hushSibling = (sid, quiet) => {
  const s = readState()
  const file = siblingStatePath(s)
  if (!file || !fs.existsSync(file)) return
  const mine = (s.sessions || {})[sid] || {}
  if (!quiet && !mine.hushedSibling) return // never restore a voice we did not mute
  try {
    const had = withSiblingLock(file, () => {
      const sib = JSON.parse(fs.readFileSync(file, 'utf8'))
      sib.sessions = sib.sessions || {}
      const prev = !!(sib.sessions[sid] && sib.sessions[sid].voice)
      if (quiet) {
        if (!prev) return false
        sib.sessions[sid] = Object.assign({}, sib.sessions[sid], { voice: false })
      } else {
        sib.sessions[sid] = Object.assign({}, sib.sessions[sid], { voice: true })
      }
      fs.writeFileSync(file, JSON.stringify(sib, null, 2))
      return true
    })
    withLock(() => {
      const st = readState()
      st.sessions = st.sessions || {}
      st.sessions[sid] = Object.assign({}, st.sessions[sid], { hushedSibling: quiet ? had : false })
      writeState(st)
    })
    if (had) log(quiet ? 'muted the notice engine for this session' : 'gave the notice engine its voice back')
  } catch (e) { log('could not reach the sibling engine: ' + e.message) }
}

/*
 * Sessions that no longer exist must not keep state here.
 *
 * Closing a terminal window kills the session without any goodbye, so nothing ever cleans up
 * after it. Most of what is left behind is harmless clutter, but one entry is not: a session
 * that died while holding `hushedSibling` leaves the notice engine muted for that session id
 * with nobody to unmute it. Claude Code keeps one file per live session in ~/.claude/sessions,
 * so anything registered here and missing there is gone.
 *
 * A session that started seconds ago may not have registered yet, so only entries older than
 * REAP_MIN_AGE are considered. Being wrong here means wiping a live session mid-turn.
 */
const SESSIONS_DIR = path.join(HOME, '.claude', 'sessions')
const REAP_MIN_AGE = 5 * 60 * 1000

const liveSessionIds = () => {
  const ids = new Set()
  let files = []
  try { files = fs.readdirSync(SESSIONS_DIR) } catch { return null } // no registry: reap nothing
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const j = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'))
      if (j && j.sessionId) ids.add(j.sessionId)
    } catch {}
  }
  return ids
}

const reapDeadSessions = () => {
  const live = liveSessionIds()
  if (!live || !live.size) return 0 // an empty registry is not evidence that everything died
  const now = Date.now()
  const doomed = []
  const s = readState()
  for (const [sid, v] of Object.entries(s.sessions || {})) {
    if (live.has(sid)) continue
    const stamp = Date.parse((v && (v.modeAt || v.armedAt || v.at)) || '') || 0
    if (stamp && now - stamp < REAP_MIN_AGE) continue
    doomed.push([sid, v])
  }
  if (!doomed.length) return 0
  // Undo anything this engine did TO ANOTHER engine on their behalf, before forgetting them.
  for (const [sid, v] of doomed) if (v && v.hushedSibling) hushSibling(sid, false)
  withLock(() => {
    const st = readState()
    for (const [sid] of doomed) delete (st.sessions || {})[sid]
    writeState(st)
  })
  log('reaped ' + doomed.length + ' session(s) that no longer exist')
  return doomed.length
}

const setMode = (sid, mode) => {
  withLock(() => {
    const st = readState()
    st.sessions = st.sessions || {}
    const extra = mode === 'conversation' ? { voice: true, armed: true, convTurns: 0 } : {}
    st.sessions[sid] = Object.assign({}, st.sessions[sid], extra, { mode, modeAt: new Date().toISOString() })
    if (mode === 'conversation') st.enabled = true
    writeState(st)
  })
  // One voice per session: the notice engine steps aside while the line is open.
  hushSibling(sid, mode === 'conversation')
}

/**
 * One turn of the open line: speak the reply, open the mic, transcribe, and hand the words back
 * to Claude Code as its next instruction (`decision: block`). Returning WITHOUT output lets the
 * session stop, which is how the line goes quiet when nobody speaks or the user says goodbye.
 * The camera gate does not apply here: someone talking to the machine is there.
 */
const conversationTurn = async (payload, s) => {
  const sid = payload.session_id || 'sin-sesion'
  const cfg = convCfg(s)
  const turns = (((s.sessions || {})[sid] || {}).convTurns || 0) + 1
  if (turns > cfg.maxTurns) { log('conversation cap reached, closing the line'); setMode(sid, 'notify'); return }
  withLock(() => {
    const st = readState()
    st.sessions[sid] = Object.assign({}, st.sessions[sid], { convTurns: turns })
    writeState(st)
  })

  const text = lastAssistantText(payload.transcript_path)
  /*
   * ONE REPLY, SPOKEN ONCE.
   *
   * Claude Code re-enters the Stop hook, and this branch runs before any re-entry check, so the
   * same reply was being spoken and the mic reopened a second time: measured in the log as the
   * identical sentence 17 seconds apart. `stop_hook_active` cannot be the guard, because after a
   * decision:block the next Stop legitimately carries it and the conversation must continue. The
   * guard has to be the text itself, and inline speech deliberately skips the engine's own
   * repeat check, so this is the only thing standing between him and hearing everything twice.
   */
  const textHash = text ? crypto.createHash('sha256').update(text).digest('hex').slice(0, 16) : ''
  if (textHash && (((s.sessions || {})[sid] || {}).convHash === textHash)) {
    log('same reply as the last turn, not speaking it again')
    return
  }
  withLock(() => {
    const st = readState()
    st.sessions = st.sessions || {}
    st.sessions[sid] = Object.assign({}, st.sessions[sid], { convHash: textHash })
    writeState(st)
  })
  if (text) {
    /*
     * An API error is not an answer. The engine spoke "API Error: Overloaded" out loud as if it
     * were the reply; same class of bug as the summarizer reading a login banner. Say something
     * true and short instead, so the turn is not silent either.
     */
    const broken = /^\s*(API Error|Overloaded|rate limit|Request timed out|Internal server error)/i.test(text)
    const spoken = broken
      ? (lang(s) === 'es' ? 'Se cayo la API un momento. Repiteme eso.' : 'The API dropped for a moment. Say that again.')
      : (text.length > cfg.maxSpokenChars ? condenseForSpeech(text, s) : text)
    if (broken) log('assistant text was an API error, said a short apology instead')
    await speak(spoken, sid, { inline: true, maxChars: cfg.maxSpokenChars })
  }

  const deadline = Date.now() + cfg.listenTimeoutMs
  let heard = ''
  let captured = 0 // utterances the mic DID cut, whether or not they transcribed
  while (!heard && Date.now() < deadline) {
    const file = await recordAuto(Object.assign({}, cfg, { listenTimeoutMs: Math.max(3000, deadline - Date.now()) }), s)
    if (!file) break
    captured += 1
    await cue('close') // it stopped listening: say so before the pause while it transcribes
    heard = await transcribe(file, s)
  }
  if (!heard) {
    /*
     * There are two ways to hear nothing, and they must not look the same.
     *
     * Nobody spoke: go quiet, that is correct, the line is just idle. But if the mic DID cut
     * utterances and none of them transcribed, he talked and the machine ignored him. Staying
     * silent there is indistinguishable from being broken, and that is exactly how it felt: he
     * spoke three times, every capture came back empty, and nothing ever happened.
     */
    if (captured) {
      log('captured ' + captured + ' utterance(s) and understood none of them, saying so')
      await speak(lang(s) === 'es'
        ? 'Te oi pero no te entendi. Acercate al microfono y repite.'
        : 'I heard you but could not make it out. Say that again, closer to the mic.',
      sid, { inline: true })
    }
    log('line idle, letting the session stop (conversation mode stays on for ' + sid.slice(0, 8) + ')')
    return
  }

  historia('voice', { sid, texto: heard, proyecto: projectName(payload.cwd) }, 'heard')
  if (OFF_RE.test(heard) || CONV_OFF_RE.test(heard)) {
    setMode(sid, 'notify')
    if (OFF_RE.test(heard)) {
      withLock(() => {
        const st = readState()
        st.sessions[sid] = Object.assign({}, st.sessions[sid], { voice: false })
        writeState(st)
      })
    }
    await speak(lang(s) === 'es' ? 'Va, cierro la linea.' : 'Okay, closing the line.', sid, { inline: true })
    return
  }
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: 'Voice message from the user (talk-2-me conversation mode). Answer the way you would out ' +
      'loud: 1 to 3 short sentences, first person, no code, paths or lists; everything you write ' +
      'will be spoken. The user said: "' + heard.replace(/"/g, "'") + '"',
  }))
}

/*
 * Entry point of the Stop hook. It must be SYNCHRONOUS in settings.json (no `async: true`),
 * because conversation mode answers Claude Code with `decision: block` and the output of an
 * async hook is never read. Notify mode keeps its old speed by handing the work to a detached
 * child and returning at once.
 */
const hookStop = async (payload) => {
  const s = readState()
  if (process.env.TALK2ME_CHILD) return        // el resumidor no se resume a si mismo
  const sid0 = payload.session_id || 'sin-sesion'
  if (sessionMode(s, sid0) === 'conversation') return conversationTurn(payload, s)
  // Side by side with another talk-2-me install: outside a conversation this engine is inert,
  // so the other one keeps owning spoken notices and the turn is never narrated twice.
  if (s.conversationOnly === true) return
  if (!s.enabled) return                       // interruptor maestro apagado
  if (process.env.TALK2ME_BG) return hookStopNotify(payload, s)
  const child = spawn(process.execPath, [__filename, 'hook', 'stop', ...dirArgs()], {
    detached: true, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true,
    env: Object.assign({}, process.env, { TALK2ME_BG: '1' }),
  })
  try { child.stdin.end(JSON.stringify(payload)) } catch {}
  child.unref()
}

const hookStopNotify = async (payload, s) => {
  if (payload.stop_hook_active) return         // Claude Code ya reentro por un hook; no encimar

  /*
   * LA VOZ ES POR SESION, no global. Solo habla donde el usuario pidio /talk-2-me.
   * El resto de sus sesiones (watchers, loops, trabajo en otros proyectos) siguen mudas aunque
   * el motor este prendido. Se sale antes de leer el transcript: una sesion sin voz no cuesta
   * ni una lectura de disco de mas.
   */
  const sidVoz = payload.session_id || 'sin-sesion'
  if (!(s.sessions && s.sessions[sidVoz] && s.sessions[sidVoz].voice)) return

  const text = lastAssistantText(payload.transcript_path)
  if (!text || text.length < 20) return        // un "ok" no merece audio

  /*
   * UN AVISO POR INTERVENCION DEL USUARIO, POR SESION.
   *
   * Deduplicar por el texto del aviso no alcanza, y costo ruido real: un agente con heartbeat
   * en un proyecto desperto cada 60 segundos durante media hora, y cada vez que su mensaje
   * cambiaba una palabra el resumidor producia otra forma de decir lo mismo ("termine el
   * proyecto sin dejar nada pendiente", "quedo todo hecho en el proyecto", "deje todo listo en
   * el proyecto"). Cuatro hashes distintos, un solo hecho.
   *
   * El evento que hace nuevo a un aviso no es que cambie su texto: es que el usuario haya vuelto
   * a hablarle a esa sesion. Sin intervencion suya de por medio, la sesion ya dijo lo que tenia
   * que decir. La unica excepcion es pasar de "termine" a "necesito que me contestes", porque
   * eso si es informacion nueva y accionable.
   *
   * El gate corre ANTES del resumidor, asi que un loop de mil heartbeats no gasta un centavo.
   */
  const srcHash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
  const sid = payload.session_id || 'sin-sesion'
  const kind = asksSomething(text) ? 'ask' : 'done'

  const verdict = withLock(() => {
    const st = readState()
    st.sessions = st.sessions || {}
    /*
     * Default DESARMADO. Una sesion que el usuario nunca toco no tiene por que hablarle: los
     * watchers y loops autonomos viven cerrando turnos por su cuenta, y al prender la voz
     * todos ellos avisarian de golpe. Solo `UserPromptSubmit` arma, y solo cuando escribio el.
     */
    const ses = st.sessions[sid] || { armed: false }

    if (ses.srcHash === srcHash) return 'mismo mensaje'
    // Excepcion al gate: si antes dije "termine" y ahora estoy trabado esperandolo, eso si es
    // informacion nueva y accionable, y suena aunque no haya escrito desde entonces.
    if (!ses.armed && !(ses.kind === 'done' && kind === 'ask')) {
      return 'sesion que no has tocado'
    }

    // Object.assign, NO reemplazo: escribir el objeto entero aqui borraba `voice`, y la sesion
    // hablaba una sola vez y se quedaba muda para siempre sin que nadie la apagara.
    st.sessions[sid] = Object.assign({}, ses, { armed: false, kind, srcHash, at: new Date().toISOString() })
    // No cargar para siempre con sesiones que ya no existen.
    const ids = Object.keys(st.sessions)
    if (ids.length > 50) {
      ids.map((k) => ({ k, at: st.sessions[k].at || '' })).sort((a, b) => a.at.localeCompare(b.at))
        .slice(0, ids.length - 50).forEach((x) => delete st.sessions[x.k])
    }
    writeState(st)
    return null
  })
  if (verdict) { log('callado (' + verdict + ') sesion ' + sid.slice(0, 8)); return }

  /*
   * ORDEN INVERTIDO. Antes: resumir, sintetizar, hablar. Ahora: guardar el texto crudo, MIRAR
   * por la camara, y solo si el usuario esta ahi gastar en resumidor y en voz.
   *
   * El aviso entra a pending.json pase lo que pase, asi que nunca se pierde uno por no estar.
   */
  const proj = projectName(payload.cwd)
  const item = {
    id: srcHash,
    sid,
    proyecto: proj,
    kind,
    at: new Date().toISOString(),
    texto: text.slice(0, 2000),
    checks: 0,
  }
  withLock(() => {
    const lista = readPending()
    if (lista.some((x) => x.id === srcHash)) return
    lista.push(item)
    // Techo: si se acumularon mas de 12 sin que aparezca, los mas viejos ya no le sirven.
    if (lista.length > 12) lista.splice(0, lista.length - 12)
    writePending(lista)
  })
  historia('queued', item, kind === 'ask' ? 'awaiting answer' : 'done')
  log('pendiente ' + kind + ' de sesion ' + sid.slice(0, 8) + (proj ? ' [' + proj + ']' : ''))

  await revisarYHablar()
}

/**
 * Mira por la camara y, si el usuario esta, vacia TODA la cola en un solo mensaje hablado.
 *
 * Se llama al cerrar cualquier turno de cualquier sesion, asi que el "siguiente review" que
 * pidio el usuario es simplemente el proximo turno que termine en cualquiera de sus ventanas: si
 * para entonces ya volvio, escucha de golpe todo lo que se junto mientras no estaba.
 */
const revisarYHablar = async () => {
  if (!readPending().length) return

  const estado = checarPresencia()
  if (estado !== 'persona') {
    withLock(() => {
      const lista = readPending()
      lista.forEach((x) => { x.checks = (x.checks || 0) + 1; x.ultimoCheck = new Date().toISOString() })
      writePending(lista)
    })
    log('no estas (' + estado + '), ' + readPending().length + ' aviso(s) esperan')
    return
  }

  // Se sacan de la cola ANTES de hablar y en un solo lock: si otra sesion cierra turno mientras
  // se sintetiza el audio, no puede llevarse los mismos avisos y decirlos dos veces.
  const tomados = withLock(() => {
    const lista = readPending()
    writePending([])
    return lista
  })
  if (!tomados.length) return

  const linea = summarizeMany(tomados)
  log('estas ahi, hablo ' + tomados.length + ' aviso(s) en un solo mensaje')
  const ok = await speak(linea, tomados[0].sid)

  if (ok) {
    tomados.forEach((it) => historia('spoken', it, 'together with ' + (tomados.length - 1) + ' more'))
    historia('message', { texto: linea }, 'consolidated from ' + tomados.length)
  } else {
    // Si no se pudo hablar, los avisos vuelven a la cola: no se pierden por un fallo de audio.
    withLock(() => writePending(tomados.concat(readPending())))
    log('no se pudo hablar, devuelvo ' + tomados.length + ' aviso(s) a la cola')
  }
}

/** Frases de apagado. Deterministas a proposito: apagar la voz no puede depender de que el modelo lo note. */
const OFF_RE = /(ya no (uses|use|hables|hable)s?\s*(la )?voz|apaga (la )?voz|quita (la )?voz|sin voz|c[aá]llate|shut ?up|stop talking|no me hables|deja de hablar|silencio|modo silencio|voice off\b|turn off (the )?voice|disable (the )?voice|mute (the )?voice|no more voice|stop the voice|be quiet)/i
const ON_RE = /(talk-?2-?me|habl[aá]me|prende (la )?voz|activa (la )?voz|talk to me|voice on\b|turn on (the )?voice|enable (the )?voice)/i

const hookPrompt = async (payload) => {
  const prompt = String(payload.prompt || '')
  const sid = payload.session_id || 'sin-sesion'
  // Cheapest place to notice a window someone closed: one readdir, once per message typed.
  try { reapDeadSessions() } catch (e) { log('reap failed: ' + e.message) }

  /*
   * Quien escribio: el usuario, o el harness?
   *
   * Esta pregunta va PRIMERO, antes de tocar nada, y eso no es cosmetico. Los loops autonomos y
   * los heartbeats entran por este mismo hook con pinta de prompt. Cortar la bocina antes de
   * distinguirlos hacia que el heartbeat de un proyecto, cada 60 segundos, colgara el audio a
   * media frase: los avisos empezaban y no terminaban nunca.
   */
  const AUTOMATICO = /^\s*\[?\s*(system|systema)\s*[:\]]|heartbeat|you have been awakened|autonomous-loop|routine (heartbeat|wakeup)|<<autonomous/i
  const fromUser = Boolean(prompt.trim()) && !AUTOMATICO.test(prompt)

  if (!fromUser) {
    // El harness no manda sobre la bocina: ni corta lo que suena, ni vacia la fila, ni rearma.
    if (prompt.trim()) log('prompt automatico en sesion ' + sid.slice(0, 8) + ', no toco la voz')
    return
  }

  /*
   * el usuario escribio, o sea que ya esta frente a la pantalla. Todo aviso pendiente existia
   * para traerlo aqui, y ya cumplio: se corta lo que suena y se vacia la fila. Ademas se rearma
   * ESTA sesion, porque lo que venga ahora si es trabajo nuevo y merece aviso.
   * `keepQueueOnPrompt: true` en el state conserva la fila si algun dia la prefiere.
   */
  stopPlayback(sid)
  const st0 = readState()
  if (!st0.keepQueueOnPrompt) {
    // Solo se tiran los avisos DE ESTA sesion. Los de otros proyectos siguen pendientes: el
    // que este mirando un proyecto no vuelve por si solo a otro.
    const q = withLock(() => {
      const antes = readQueue()
      const quedan = antes.filter((it) => it.sid && it.sid !== sid)
      writeQueue(quedan)
      return antes.length - quedan.length
    })
    if (q) log('el usuario escribio en ' + sid.slice(0, 8) + ', tiro ' + q + ' aviso(s) de esa sesion')
  }
  withLock(() => {
    const st = readState()
    st.sessions = st.sessions || {}
    st.sessions[sid] = Object.assign({}, st.sessions[sid], { armed: true })
    writeState(st)
  })

  /*
   * Prender y apagar viven aqui, no en el CLI, porque este hook es el unico punto del sistema
   * que sabe DE QUE SESION viene el mensaje. La voz es por sesion, asi que sin ese dato no se
   * puede encender la correcta. Ademas queda deterministico: no depende de que el modelo note
   * la frase ni de que acierte a pasar el id.
   */
  /*
   * `conversationOnly` in state.json keeps this engine out of the way of another talk-2-me
   * install: it then answers ONLY to the conversation phrases and never to the plain voice
   * on/off ones, so the other engine keeps owning spoken notices and nobody narrates twice.
   */
  const onlyConv = readState().conversationOnly === true
  const conversa = asksFor(prompt, CONV_ON_RE)
  const cierraLinea = asksFor(prompt, CONV_OFF_RE) && !conversa
  const enciende = (!onlyConv && asksFor(prompt, ON_RE)) || conversa
  const apaga = !onlyConv && asksFor(prompt, OFF_RE) && !enciende

  if (enciende || apaga || cierraLinea) {
    withLock(() => {
      const st = readState()
      st.sessions = st.sessions || {}
      const ses = Object.assign({}, st.sessions[sid], { armed: true, armedAt: new Date().toISOString() })
      if (enciende || apaga) ses.voice = enciende
      if (conversa) { ses.mode = 'conversation'; ses.convTurns = 0 }
      if (apaga || cierraLinea) ses.mode = 'notify'
      st.sessions[sid] = ses
      if (enciende) st.enabled = true // el maestro se enciende solo al pedir la primera voz
      writeState(st)
    })
    // One voice per session, both when the line opens and when it closes.
    if (conversa) hushSibling(sid, true)
    if (apaga || cierraLinea) hushSibling(sid, false)
    const what = conversa ? 'CONVERSATION ON' : apaga ? 'VOICE OFF' : cierraLinea ? 'CONVERSATION OFF' : 'VOICE ON'
    log(what + ' for session ' + sid.slice(0, 8) + ': ' + prompt.slice(0, 60))
    const ctx = conversa
      ? 'talk-2-me: CONVERSATION mode is ON for THIS session (open line). From now on, when you ' +
        'finish a turn the hook speaks your reply aloud, listens to the microphone, and hands the ' +
        "user's words back to you as the next instruction. Reply the way you would speak: 1 to 3 " +
        'short sentences, first person, no code, paths or lists in the reply. Confirm in one short ' +
        'sentence now. The line closes when the user says "that\'s all" or the mic hears nothing ' +
        'for a while; typing still works at any time.'
      : apaga
        ? 'talk-2-me: voice is now OFF for THIS session. Confirm it in one line and do not ' +
          'speak here again until the user asks for /talk-2-me.'
        : cierraLinea
          ? 'talk-2-me: conversation mode is OFF for THIS session; spoken notices stay on. ' +
            'Confirm it in one line.'
          : 'talk-2-me: voice is now ON for THIS session only. Confirm it to the user in one ' +
            'line. Nothing to run: the hook already enabled it.'
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: ctx },
    }))
  }

  // Se recuerda para que `on`/`off` sin --session sepan a cual referirse.
  withLock(() => {
    const st = readState()
    st.lastPromptSid = sid
    writeState(st)
  })
}

// ---------------------------------------------------------------------------
// cli
// ---------------------------------------------------------------------------
// `--dir <path>` is consumed at the top of the file; it must not reach the command parser.
const argv = (() => {
  const a = process.argv.slice(2)
  const i = a.indexOf('--dir')
  return i > -1 ? a.slice(0, i).concat(a.slice(i + 2)) : a
})()
const cmd = argv[0]
const flag = (name, def) => {
  const i = argv.indexOf(name)
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def
}

const main = async () => {
  switch (cmd) {
    case 'on': {
      const s = readState()
      /*
       * Sin --session se toma la ultima que le escribio a Claude, que es donde el usuario acaba
       * de teclear el /talk-2-me. En la practica el hook ya la encendio antes de llegar aqui;
       * esto es el respaldo para cuando lo pide con palabras que la regex no cubre.
       */
      const sid = flag('--session', s.lastPromptSid)
      if (!sid) {
        console.error('Cannot tell which session to turn on. Type "/talk-2-me" in the session you want')
        console.error('(the hook turns it on by itself) or pass --session <id>.')
        process.exitCode = 2
        break
      }
      s.enabled = true
      s.voice = flag('--voice', s.voice || DEFAULT_VOICE)
      s.model = flag('--model', s.model || DEFAULT_MODEL)
      s.name = flag('--name', s.name || '')
      s.lang = LANGS[flag('--lang', s.lang || 'en')] ? flag('--lang', s.lang || 'en') : 'en'
      s.sessions = s.sessions || {}
      s.sessions[sid] = Object.assign({}, s.sessions[sid], {
        voice: true, armed: true, armedAt: new Date().toISOString(),
      })
      if (flag('--mode', '') === 'conversation') s.sessions[sid] = Object.assign({}, s.sessions[sid], { mode: 'conversation', convTurns: 0 })
      if (flag('--mode', '') === 'notify') s.sessions[sid] = Object.assign({}, s.sessions[sid], { mode: 'notify' })
      delete s.lastHash
      writeState(s)
      console.log('talk-2-me ON for session ' + sid.slice(0, 8) + '  voice=' + s.voice + '  model=' + s.model +
        '  lang=' + s.lang + (s.name ? '  name=' + s.name : '') + '  mode=' + sessionMode(s, sid))
      console.log('ONLY this session speaks. The others stay silent until you ask /talk-2-me in each one.')
      break
    }
    case 'off': {
      const s = readState()
      const todas = argv.includes('--all')
      const sid = flag('--session', s.lastPromptSid)
      s.sessions = s.sessions || {}
      if (todas) {
        for (const k of Object.keys(s.sessions)) s.sessions[k].voice = false
        s.enabled = false
        writeState(s)
        stopPlayback()
        writeQueue([])
        console.log('talk-2-me OFF in ALL sessions.')
      } else if (sid) {
        s.sessions[sid] = Object.assign({}, s.sessions[sid], { voice: false })
        writeState(s)
        stopPlayback(sid)
        console.log('talk-2-me OFF for session ' + sid.slice(0, 8) + '. The others are unchanged.')
      } else {
        console.error('Cannot tell which session to turn off. Use --all or --session <id>.')
        process.exitCode = 2
      }
      break
    }
    case 'drain': {
      await drain()
      break
    }
    case 'pending': {
      const lista = readPending()
      if (!lista.length) { console.log('No pending notices.'); break }
      console.log(lista.length + ' notice(s) waiting for you to show up:\n')
      lista.forEach((it, i) => {
        console.log((i + 1) + '. [' + (it.kind === 'ask' ? 'QUESTION' : 'done') + '] ' +
          (it.proyecto || 'no project') + '  session ' + String(it.sid).slice(0, 8) +
          '  checks=' + (it.checks || 0))
        console.log('   ' + String(it.texto).replace(/\s+/g, ' ').slice(0, 140))
      })
      console.log('\nHand-editable: ' + PENDING)
      break
    }
    case 'presence': {
      // Fuerza un vistazo, saltandose el cache, para diagnosticar la camara.
      try { fs.unlinkSync(PRESENCIA) } catch {}
      console.log('presence: ' + checarPresencia())
      break
    }
    case 'flush': {
      // Vacia la cola SIN hablar. Para cuando se acumulo ruido viejo que ya no sirve.
      const n = readPending().length
      withLock(() => writePending([]))
      historia('descartado', null, n + ' aviso(s) tirados a mano')
      console.log('Dropped ' + n + ' pending notice(s) without speaking them.')
      break
    }
    case 'review': {
      // Lo que hace el hook al cerrar turno: mirar por la camara y hablar si estas.
      await revisarYHablar()
      break
    }
    case 'status': {
      const s = readState()
      const key = apiKey()
      const conVoz = Object.entries(s.sessions || {})
        .filter(([, v]) => v && v.voice)
        .map(([k]) => k.slice(0, 8))
      console.log(JSON.stringify({
        enabled: !!s.enabled,
        speakingSessions: conVoz.length ? conVoz : '(none: ask /talk-2-me in the session you want)',
        voice: s.voice || DEFAULT_VOICE,
        model: s.model || DEFAULT_MODEL,
        name: s.name || null,
        lang: lang(s),
        camera: s.camera === false ? 'gate off' : (s.camera || s.camara || 'default device list'),
        // The order recording will actually walk, not just whatever is pinned.
        micOrder: micCandidates(s),
        micDenied: s.micDeny || [],
        conversationSessions: Object.keys(s.sessions || {})
          .filter((k) => s.sessions[k] && s.sessions[k].mode === 'conversation').map((k) => k.slice(0, 8)),
        apiKey: key ? 'present' : 'MISSING',
        player: findFfplay() ? 'ffplay' : 'fallback WMP',
        queued: queueDepth(),
        pending: readPending().length,
        presence: (()=>{try{const j=JSON.parse(fs.readFileSync(PRESENCIA,"utf8"));return j.estado+" ("+Math.round((Date.now()-j.at)/1000)+"s ago)"}catch{return "not measured"}})(),
        drainer: drainerAlive() ? 'running' : 'idle',
        linesSpoken: s.spoken || 0,
        charactersSpent: s.chars || 0,
        last: s.lastText || null,
        lastAt: s.lastAt || null,
      }, null, 2))
      break
    }
    case 'say': {
      const t = argv.slice(1).filter((a) => !a.startsWith('--')).join(' ')
      if (!t) { console.error('usage: talk2me.js say "text"'); process.exitCode = 2; break }
      const s = readState()
      delete s.lastHash
      writeState(s)
      console.log((await speak(t)) ? 'spoken' : 'could not speak, see ' + LOG)
      break
    }
    case 'test': {
      const s = readState()
      delete s.lastHash
      writeState(s)
      const ok = await speak(lang(s) === 'es'
        ? greeting(s) + ' prueba de voz. Si escuchas esto, talk 2 me quedo listo.'
        : greeting(s) + ' voice test. If you can hear this, talk 2 me is ready.')
      console.log(ok ? 'audio sent, you should hear it' : 'failed, see ' + LOG)
      break
    }
    case 'voices': {
      const key = apiKey()
      if (!key) { console.error('missing ELEVENLABS_API_KEY'); process.exitCode = 2; break }
      const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } })
      const j = await r.json()
      const f = (argv[1] || '').toLowerCase()
      ;(j.voices || [])
        .filter((v) => !f || v.name.toLowerCase().includes(f))
        .forEach((v) => console.log(v.voice_id + '  ' + v.name))
      break
    }
    case 'mode': {
      const s = readState()
      const sid = flag('--session', s.lastPromptSid)
      const mode = argv[1] === 'conversation' ? 'conversation' : argv[1] === 'notify' ? 'notify' : null
      if (!mode || !sid) { console.error('usage: talk2me.js mode conversation|notify [--session <id>]'); process.exitCode = 2; break }
      setMode(sid, mode)
      console.log('talk-2-me mode=' + mode + ' for session ' + sid.slice(0, 8) +
        (mode === 'conversation' ? '  (open line: after each reply the mic opens)' : ''))
      break
    }
    case 'mics': {
      const s = readState()
      const mics = listMics()
      if (!mics.length) { console.log('No dshow audio devices found (is ffmpeg installed?).'); break }
      const cur = micName(s)
      if (!argv.includes('--test')) {
        mics.forEach((m) => console.log((m === cur ? '* ' : '  ') + m))
        console.log('\nSet "mic" in ' + STATE + ' to pick one. * = current.')
        console.log('Not sure which one hears you? Run: mics --test, and keep talking while it runs.')
        break
      }
      /*
       * Which input actually hears you? Names lie: a device called "shotgun Mic" measured 20 dB
       * below a webcam on the same voice, because it was muted at the hardware. Measuring every
       * device on the same speech is the only answer that settles it, and it has to be run by
       * the person talking: a recording started from somewhere else never lines up with them.
       */
      /*
       * All inputs are recorded AT THE SAME TIME by a single ffmpeg, so every device hears the
       * same words and none is penalised for going first. Recording them one after another
       * needed 16 s of continuous talking and still compared different moments of speech, which
       * is how a healthy mic once came back looking dead. --sequential forces the old sweep for
       * machines where a second capture cannot be opened while one is running.
       */
      const secs = Math.max(3, Number(flag('--secs', '5')) || 5)
      /*
       * THE VERDICT IS THE TRANSCRIPT, not a level.
       *
       * Two level metrics were tried and both gave confident wrong answers. Absolute mean just
       * ranks each device's own hiss: in a silent room these four sat between -60 and -43 dBFS.
       * Dynamic swing then rewarded whichever mic had the quietest floor, because one small
       * click looks enormous above it: a silence control gave 21 dB of swing with nobody
       * talking. The real question is whether a device captures intelligible speech, and the
       * transcriber answers it with no threshold to tune. Levels stay on screen as detail.
       */
      const stt = !argv.includes('--no-stt')
      /*
       * Transcript first, then signal to noise. Whether words came back is the pass or fail;
       * among the ones that passed, the winner is the mic whose speech sits furthest above its
       * own hiss, because that gap is exactly what the conversation detector keys on. Ranking
       * the passers by transcript length instead picked a mic 1.4 dB worse over a two-character
       * difference in wording.
       */
      const score = (heard, lv) => (heard ? 1000 : 0) + lv.dyn
      let together = null
      if (!argv.includes('--sequential')) {
        console.log('Recording all ' + mics.length + ' inputs AT ONCE for ' + secs + 's.')
        console.log('TALK NOW, without stopping, until the results print.\n')
        together = recordAllMics(mics, secs)
        if (!together) console.log('Could not open every input at once; measuring one at a time instead.\n')
      }
      let rows = []
      if (together) {
        for (const [m, f] of together) {
          process.stdout.write('  ' + m + ' ... ')
          const lv = levelsOf(f)
          if (!lv) { console.log('FAILED'); continue }
          const heard = stt ? await transcribe(f, s) : ''
          console.log('floor ' + lv.p10.toFixed(1) + ' dB, loud ' + lv.p90.toFixed(1) + ' dB' +
            (stt ? '  ->  ' + (heard ? '"' + heard.slice(0, 60) + '"' : 'nothing intelligible') : ''))
          rows.push(Object.assign({ mic: m, heard, score: score(heard, lv) }, lv))
        }
      } else {
        console.log('Two passes of ' + secs + 's over ' + mics.length + ' inputs, the second in reverse order.')
        console.log('KEEP TALKING for the whole ' + (secs * mics.length * 2) + 's.\n')
        const bestPer = new Map()
        for (const [n, pass] of [mics, [...mics].reverse()].entries()) {
          console.log('  pass ' + (n + 1) + ':')
          for (const m of pass) {
            process.stdout.write('    ' + m + ' ... ')
            const r = measureMic(m, secs)
            if (!r) { console.log('FAILED (busy or disconnected)'); continue }
            const heard = stt ? await transcribe(r.file, s) : ''
            console.log('floor ' + r.p10.toFixed(1) + ' dB, loud ' + r.p90.toFixed(1) + ' dB' +
              (stt ? '  ->  ' + (heard ? '"' + heard.slice(0, 60) + '"' : 'nothing intelligible') : ''))
            const prev = bestPer.get(m)
            const sc = score(heard, r)
            if (!prev || sc > prev.score) bestPer.set(m, Object.assign({ heard, score: sc }, r))
          }
        }
        rows = [...bestPer.entries()].map(([mic, r]) => Object.assign({ mic }, r))
      }
      if (!rows.length) { console.log('\nNo input could be recorded.'); break }
      rows.sort((a, b) => b.score - a.score)
      console.log('\nResults:')
      for (const r of rows) {
        console.log('  ' + (r.heard ? 'HEARD YOU ' : 'nothing   ') + ' voice ' + r.dyn.toFixed(1).padStart(5) +
          ' dB over its own noise   ' + r.mic + (r.heard ? '\n              "' + r.heard.slice(0, 70) + '"' : ''))
      }
      const best = rows[0]
      const anyHeard = rows.some((r) => r.heard)
      console.log('\n' + (anyHeard ? 'Hears you best: ' + best.mic : 'No input captured anything intelligible.'))
      if (!anyHeard) {
        console.log('Either nobody talked during the test, or no mic is picking you up: check the')
        console.log('mute button, the gain knob, and the Windows input level, then run it again.')
        break
      }
      /*
       * The ranking is saved, not one winner. The best inputs are exactly the ones that get
       * taken: a speakerphone goes into meetings, a shotgun is not always plugged in. Recording
       * walks this order and uses the first device that opens, so a busy mic costs a moment
       * instead of the whole conversation.
       */
      const ranking = rows.filter((r) => r.heard).map((r) => r.mic)
      withLock(() => {
        const st = readState()
        st.micRanking = ranking
        writeState(st)
      })
      console.log('Saved the order, and recording falls through it when one is busy:')
      console.log('  ' + ranking.join('  >  '))
      const mute = rows.filter((r) => !r.heard).map((r) => r.mic)
      if (mute.length) console.log('Not used: ' + mute.join(', ') + ' (nothing intelligible)')
      const builtins = ranking.filter((m) => BUILTIN_MIC.test(m))
      if (builtins.length) {
        console.log('Built-in laptop inputs stay last: ' + builtins.join(', '))
        console.log('To bar one completely, add part of its name to "micDeny" in ' + STATE)
      }
      if (typeof s.mic === 'string' && s.mic !== best.mic) {
        console.log('\nNote: "mic" is pinned to ' + s.mic + ', so that one still goes first.')
        console.log('Drop that line from ' + STATE + ' to follow this ranking instead.')
      }
      break
    }
    case 'listen': {
      // Records one utterance and prints the transcript. For calibrating mic and thresholds.
      const s = readState()
      const cfg = convCfg(s)
      const order = micCandidates(s)
      console.log('inputs in preference order: ' + (order.join(' | ') || '(none)'))
      console.log('speech = floor + ' + (cfg.speechAboveFloorDb || 8) + ' dB, cut after ' + cfg.silenceMs +
        ' ms of quiet, timeout ' + cfg.listenTimeoutMs + ' ms. Say something.')
      const file = await recordAuto(cfg, s)
      console.log(file ? 'HEARD: ' + ((await transcribe(file, s)) || '(no speech)') : 'heard nothing')
      // The level lines are the calibration data: floor, threshold, onset level, peak.
      try { console.log(fs.readFileSync(LOG, 'utf8').trim().split('\n').slice(-5).join('\n')) } catch {}
      break
    }
    case 'hook': {
      // Falla abierto sin excepcion: un bug aqui jamas frena una sesion de Claude Code.
      try {
        const payload = JSON.parse((await readStdin()) || '{}')
        if (argv[1] === 'prompt') await hookPrompt(payload)
        else await hookStop(payload)
      } catch (e) {
        log('hook error: ' + (e && e.message))
      }
      process.exitCode = 0
      break
    }
    default:
      console.log('usage: talk2me.js on [--voice ID] [--model ID] [--name NAME] [--lang en|es] [--mode conversation|notify] | off [--all] | mode conversation|notify | status | pending | presence | review | flush | say <text> | test | listen | mics | voices [filter] | drain | hook stop | hook prompt   (any command accepts --dir <state dir>)')
  }
}

main().catch((e) => { log('fatal: ' + e.message); process.exitCode = 0 })

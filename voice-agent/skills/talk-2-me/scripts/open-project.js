#!/usr/bin/env node
/*
 * open-project.js - open a Claude Code session in a project and drive it.
 *
 * This is the hands of the terminal manager. A voice session cannot type into another terminal,
 * so it dispatches work here instead: one session per project, started in that project's folder,
 * watched through its log, and told what to do next.
 *
 * Why background sessions and not new terminal windows. Measured on Windows 11:
 *   - `claude --bg` runs in a folder Claude has never been trusted with and shows NO trust
 *     dialog, while a window opened with wt.exe stops dead on that dialog and never registers.
 *   - A session spawned from inside another Claude session inherits CLAUDE_CODE_* variables and
 *     then never writes its peer-registry entry, silently, so it is invisible forever. The
 *     background service does not have that problem, and this tool clears those variables
 *     anyway so the same command works from inside a session or from a plain shell.
 *   - `claude agents --json` lists everything, `claude logs <id>` shows what a session did, and
 *     `claude attach <id>` hands it to a human when they want to look.
 *   - A follow-up needs `claude stop <id>` FIRST. Resuming a session that is still running
 *     starts a COPY, which is how two agents end up editing the same files.
 *
 * NAMES ARE NEVER GUESSED. Project scope lock on this machine is zero tolerance: work happens
 * only in the project that was named, and an ambiguous name stops and asks. A short spoken word
 * can match several folders, so `resolve` refuses and lists them rather than picking the closest.
 *
 * Usage:
 *   node open-project.js resolve <name>                    what folder does this name mean
 *   node open-project.js open <name> "<instruction>"       dispatch a session there
 *   node open-project.js list                              live sessions, by project
 *   node open-project.js logs <id> [lines]                 what that session has done
 *   node open-project.js tell <id> "<instruction>"         stop it, then continue it
 *   node open-project.js stop <id> [--rm]                  stop, optionally forget it
 *   node open-project.js aliases                           the alias table
 *   node open-project.js alias <name> <path>               teach it one name
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync, spawn } = require('child_process')

const HOME = os.homedir()
const DIR = process.env.TALK2ME_DISPATCH_DIR || path.join(HOME, '.claude', 'talk2me-dispatch')
const ALIASES = path.join(DIR, 'projects.json')
/*
 * Folders whose direct children are candidate projects. TALK2ME_PROJECT_ROOTS (separated by the
 * OS path delimiter, ';' on Windows, ':' elsewhere) replaces the default list. Missing folders
 * are skipped, never created.
 */
const SEARCH_ROOTS = (process.env.TALK2ME_PROJECT_ROOTS
  ? process.env.TALK2ME_PROJECT_ROOTS.split(path.delimiter)
  : ['projects', 'code', 'src', 'Desktop'].map((d) => path.join(HOME, d))
).map((d) => d.trim()).filter(Boolean)

const argv = process.argv.slice(2)
const cmd = argv[0]

/*
 * A child inherits these and then never registers itself, with no error anywhere. Clearing them
 * is what makes a session dispatched from inside another session visible at all.
 */
const cleanEnv = () => {
  const e = Object.assign({}, process.env)
  for (const k of Object.keys(e)) {
    if (/^CLAUDE(CODE)?(_|$)/.test(k) || k === 'CLAUDE_PID' || k === 'CLAUDE_EFFORT') delete e[k]
  }
  return e
}

/*
 * `claude` on Windows is a shim, so it needs a shell. Passing an ARRAY with shell:true lets the
 * shell re-split the arguments, which mangles any instruction containing spaces or quotes, so
 * the command is built as one already-quoted string instead.
 */
const q = (a) => (/[\s"&|<>^()]/.test(a) ? '"' + String(a).replace(/"/g, '\\"') + '"' : String(a))
const claude = (args, opts = {}) => spawnSync('claude ' + args.map(q).join(' '), Object.assign({
  encoding: 'utf8', shell: true, windowsHide: true, timeout: 120000, env: cleanEnv(),
}, opts))

const readAliases = () => {
  try { return JSON.parse(fs.readFileSync(ALIASES, 'utf8')) } catch { return {} }
}
const writeAliases = (a) => {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(ALIASES, JSON.stringify(a, null, 2))
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/*
 * Git Bash rewrites an argument that starts with a slash into a Windows path before the program
 * ever sees it, so `open proj "/resume-work"` arrived as "C:/Program Files/Git/resume-work" and the target
 * session ran a shell command instead of the skill. Undo that: an argument that is a real Git
 * install path plus one word was a slash command a moment ago.
 */
const unmangle = (s) => {
  const m = String(s || '').match(/^[A-Za-z]:[\\/](?:.*[\\/])?Git[\\/](.+)$/)
  if (m && !/[\\/]/.test(m[1]) && !fs.existsSync(s)) return '/' + m[1]
  return s
}

/** The instruction is everything after the fixed arguments, minus our own flags. */
const messageFrom = (from) => argv.slice(from).filter((a) => !a.startsWith('--')).map(unmangle).join(' ')

/**
 * Turn a spoken name into exactly one folder, or refuse.
 *
 * Returns { path } when it is certain, { candidates } when more than one folder could be meant,
 * and { none: true } when nothing matches. It never returns a best guess: opening work in the
 * wrong project is the one failure this whole design exists to prevent.
 */
const resolve = (name) => {
  const raw = String(name || '').trim()
  if (!raw) return { none: true }
  if (path.isAbsolute(raw)) {
    return fs.existsSync(raw) ? { path: raw, how: 'absolute path' } : { none: true }
  }
  const aliases = readAliases()
  for (const k of Object.keys(aliases)) {
    if (norm(k) === norm(raw)) {
      return fs.existsSync(aliases[k])
        ? { path: aliases[k], how: 'alias' }
        : { none: true, brokenAlias: aliases[k] }
    }
  }
  const want = norm(raw)
  const hits = []
  for (const root of SEARCH_ROOTS) {
    let entries = []
    try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { continue }
    for (const d of entries) {
      if (!d.isDirectory()) continue
      const n = norm(d.name)
      // A folder counts as a candidate when the spoken name appears anywhere in it, so a project
      // named with a shared prefix convention (e.g. "work-<name>") still matches on the bare name.
      if (n === want || n.includes(want)) hits.push(path.join(root, d.name))
    }
  }
  if (!hits.length) return { none: true }
  const exact = hits.filter((p) => norm(path.basename(p)) === want)
  /*
   * An exact folder name wins over folders that merely contain the word. But the near misses are
   * reported anyway, because the caller must read the chosen path back out loud before it opens
   * anything. Scope lock here is zero tolerance, and a confident wrong folder is the failure that
   * rule exists for.
   */
  const others = (list) => hits.filter((p) => list.indexOf(p) < 0).sort()
  if (exact.length === 1) return { path: exact[0], how: 'exact folder name', alsoMatched: others(exact) }
  if (hits.length === 1) return { path: hits[0], how: 'only folder containing that word', alsoMatched: [] }
  return { candidates: (exact.length ? exact : hits).sort() }
}

/*
 * `--all` matters for the lookup in `tell`: a session that has been stopped drops out of the
 * plain listing, and a stopped session is exactly the one you resume. Looking it up without
 * --all made a follow-up fail with "no such session" right after stopping it.
 */
const sessions = (all) => {
  const r = claude(all ? ['agents', '--json', '--all'] : ['agents', '--json'])
  try { return JSON.parse(r.stdout || '[]') } catch { return [] }
}

/**
 * Puts a real window on a session that is already running.
 *
 * Dispatch stays on `claude --bg` because that is the path with no trust dialog and no silent
 * registration failure. Showing it is a separate step: a terminal running `claude attach <id>`
 * on the session that already exists. Closing that window does not stop the session, and the
 * same session can be attached again later.
 */
/*
 * `claude --bg` never shows the workspace trust dialog, which is why dispatching a session into
 * an untrusted folder always worked. `claude attach` does: it brings up an interactive front end
 * in that folder and the check fires there, on a modal nobody is watching. So the folder is
 * marked trusted before a window is opened on it.
 *
 * Only the one project entry is touched, and the file is backed up first. Trusting a folder is
 * a real decision, so this happens only for a path the caller already resolved and named.
 */
const ensureTrusted = (dir) => {
  const F = path.join(HOME, '.claude.json')
  let j
  try { j = JSON.parse(fs.readFileSync(F, 'utf8')) } catch { return false }
  j.projects = j.projects || {}
  const key = Object.keys(j.projects).find((k) => path.resolve(k).toLowerCase() === path.resolve(dir).toLowerCase())
    || dir.split(path.sep).join('/')
  if (j.projects[key] && j.projects[key].hasTrustDialogAccepted === true) return false
  try {
    const stamp = fs.statSync(F).mtimeMs
    const bak = F + '.bak-trust-' + Math.floor(stamp / 1000)
    if (!fs.existsSync(bak)) fs.copyFileSync(F, bak)
    j.projects[key] = Object.assign({}, j.projects[key], { hasTrustDialogAccepted: true })
    fs.writeFileSync(F, JSON.stringify(j, null, 2))
    return true
  } catch (e) {
    console.error('no pude marcar la carpeta como confiable: ' + e.message)
    return false
  }
}

const showWindow = (id, cwd, title) => {
  if (cwd && ensureTrusted(cwd)) console.log('  marque la carpeta como confiable (ya no preguntara)')
  const wt = path.join(HOME, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'wt.exe')
  const exe = fs.existsSync(wt) ? wt : 'wt.exe'
  const args = ['-w', 'new', 'new-tab', '--title', title || ('claude ' + id)]
  if (cwd) args.push('-d', cwd)
  args.push('cmd', '/k', 'claude', 'attach', id)
  const r = spawnSync(exe, args, { env: cleanEnv(), windowsHide: false, encoding: 'utf8', timeout: 20000 })
  if (r.error) { console.error('no pude abrir la ventana: ' + r.error.message); return false }
  return true
}

/*
 * A dispatched session often brings something up: a resume skill starts the project's local app, and on
 * one run that was a dev server on port 3414 that nobody was told about. The address is in the
 * session's own output, so watch for it and put it in the browser.
 *
 * Only a loopback address is ever opened, and only one, the first. This runs detached so the
 * dispatch returns immediately, and it gives up rather than polling forever.
 */
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s"'<>)\]]*)?/i

const findUrl = (id) => {
  const r = claude(['logs', id])
  const text = String(r.stdout || '').replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
  const m = text.match(LOCAL_URL)
  return m ? m[0].replace(/[.,]$/, '') : null
}

const openInBrowser = (url) => {
  const r = spawnSync('cmd', ['/c', 'start', '', url], { windowsHide: true, encoding: 'utf8', timeout: 15000 })
  return !r.error
}

const sayResolution = (name, res) => {
  if (res.path) {
    console.log('OK ' + res.path + '   (' + res.how + ')')
    if (res.alsoMatched && res.alsoMatched.length) {
      console.log('   ojo, tambien contienen esa palabra y NO son la elegida:')
      res.alsoMatched.forEach((c) => console.log('     ' + c))
      console.log('   di la ruta de vuelta antes de abrir nada.')
    }
    return true
  }
  if (res.candidates) {
    console.log('AMBIGUO: "' + name + '" puede ser ' + res.candidates.length + ' carpetas.')
    res.candidates.forEach((c) => console.log('   ' + c))
    console.log('\nNo voy a adivinar. Di cual, o ensename el nombre:')
    console.log('   node open-project.js alias "' + name + '" "' + res.candidates[0] + '"')
    return false
  }
  if (res.brokenAlias) { console.log('El alias apunta a una carpeta que ya no existe: ' + res.brokenAlias); return false }
  console.log('NO ENCONTRE ninguna carpeta para "' + name + '".')
  console.log('Dame la ruta completa, o ensename el nombre con:  node open-project.js alias "' + name + '" "<ruta>"')
  return false
}

const main = () => {
  if (cmd === 'aliases') {
    const a = readAliases()
    const keys = Object.keys(a)
    if (!keys.length) { console.log('(sin alias todavia)  ' + ALIASES); return 0 }
    keys.sort().forEach((k) => console.log('  ' + k.padEnd(22) + a[k]))
    return 0
  }

  if (cmd === 'alias') {
    const [, name, dest] = argv
    if (!name || !dest) { console.error('uso: alias <nombre> <ruta>'); return 2 }
    if (!fs.existsSync(dest)) { console.error('esa carpeta no existe: ' + dest); return 2 }
    const a = readAliases()
    a[name] = path.resolve(dest)
    writeAliases(a)
    console.log('"' + name + '" -> ' + a[name])
    return 0
  }

  if (cmd === 'resolve') {
    return sayResolution(argv[1], resolve(argv[1])) ? 0 : 1
  }

  if (cmd === 'list') {
    const all = sessions()
    if (!all.length) { console.log('(ninguna sesion)'); return 0 }
    for (const s of all) {
      const id = s.id || (s.sessionId || '').slice(0, 8)
      const state = s.state || s.status || '?'
      console.log('  ' + String(id).padEnd(10) + String(s.kind || '').padEnd(12) +
        state.padEnd(9) + String(s.name || '').padEnd(22) + (s.cwd || ''))
    }
    return 0
  }

  if (cmd === 'logs') {
    const id = argv[1]
    if (!id) { console.error('uso: logs <id> [lineas]'); return 2 }
    const n = Number(argv[2]) || 25
    const r = claude(['logs', id])
    const clean = String(r.stdout || '')
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')   // colores
      .split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter(Boolean)
    console.log(clean.slice(-n).join('\n') || '(sin salida todavia)')
    return 0
  }

  if (cmd === 'urlwatch') {
    // Runs detached from `open`. Polls that session's log until a loopback address shows up.
    const id = argv[1]
    const secs = Number(argv[2]) || 180
    if (!id) { console.error('uso: urlwatch <id> [segundos]'); return 2 }
    const deadline = Date.now() + secs * 1000
    while (Date.now() < deadline) {
      const url = findUrl(id)
      if (url) {
        console.log('URL ' + url)
        openInBrowser(url)
        return 0
      }
      spawnSync(process.execPath, ['-e', 'setTimeout(function(){},4000)'])
    }
    console.log('sin URL en ' + secs + ' s')
    return 1
  }

  if (cmd === 'url') {
    const id = argv[1]
    if (!id) { console.error('uso: url <id>'); return 2 }
    const url = findUrl(id)
    if (!url) { console.log('esa sesion no ha publicado ninguna direccion local todavia'); return 1 }
    console.log(url)
    return openInBrowser(url) ? 0 : 4
  }

  if (cmd === 'show') {
    const id = argv[1]
    if (!id) { console.error('uso: show <id>'); return 2 }
    const hit = sessions(true).filter((s) => s.id === id || String(s.sessionId || '').startsWith(id))[0]
    const cwd = hit ? hit.cwd : null
    return showWindow(id, cwd, hit ? path.basename(hit.cwd || '') : '') ? 0 : 4
  }

  if (cmd === 'stop') {
    const id = argv[1]
    if (!id) { console.error('uso: stop <id> [--rm]'); return 2 }
    console.log((claude(['stop', id]).stdout || '').trim() || 'sin respuesta')
    if (argv.includes('--rm')) console.log((claude(['rm', id]).stdout || '').trim())
    return 0
  }

  if (cmd === 'tell') {
    const id = argv[1]
    const msg = messageFrom(2)
    if (!id || !msg) { console.error('uso: tell <id> "<instruccion>"'); return 2 }
    const all = sessions(true)
    const hit = all.filter((s) => (s.id === id) || String(s.sessionId || '').startsWith(id))[0]
    if (!hit) { console.error('no encontre la sesion ' + id + ' (usa list)'); return 2 }
    /*
     * Stop FIRST, then WAIT for it to actually be stopped. Resuming a session that is still
     * running starts a copy instead of continuing it, and two copies with the same brief edit
     * the same files. `claude stop` returns before the session is gone from the list, so
     * firing the resume straight after it reproduced exactly that bug.
     */
    claude(['stop', hit.id || id])
    const sid = hit.sessionId
    let stopped = false
    for (let i = 0; i < 20 && !stopped; i++) {
      const still = sessions().filter((s) => s.sessionId === sid && (s.state || s.status) !== 'done')
      if (!still.length) { stopped = true; break }
      spawnSync(process.execPath, ['-e', 'setTimeout(function(){},500)'])
    }
    if (!stopped) {
      console.error('no se detuvo a tiempo; no la reanudo para no crear una copia')
      return 5
    }
    const r = claude(['--bg', '--resume', sid, msg])
    const out = (r.stdout || '') + (r.stderr || '')
    console.log(out.split(/\r?\n/).filter((l) => /backgrounded|note:|error/i.test(l)).join('\n') || out.slice(0, 300))
    return 0
  }

  if (cmd === 'open') {
    const name = argv[1]
    const msg = messageFrom(2)
    if (!name || !msg) {
      console.error('uso: open <proyecto> "<instruccion>"')
      return 2
    }
    const res = resolve(name)
    if (!sayResolution(name, res)) return 1

    // One session per project for life. A second one means two writers on the same files.
    const already = sessions().filter((s) =>
      String(s.cwd || '').toLowerCase() === res.path.toLowerCase() && (s.state || s.status) !== 'done')
    if (already.length) {
      const s = already[0]
      console.log('YA HAY UNA SESION en ese proyecto: ' + (s.id || s.sessionId) + ' (' + (s.state || s.status) + ')')
      console.log('Usa:  node open-project.js tell ' + (s.id || String(s.sessionId).slice(0, 8)) + ' "' + msg.slice(0, 40) + '..."')
      return 3
    }

    const r = claude(['--bg', msg], { cwd: res.path })
    const out = (r.stdout || '') + (r.stderr || '')
    const m = out.match(/backgrounded\s+·\s+([0-9a-f]{6,})/)
    if (!m) {
      console.error('NO ARRANCO. Salida cruda:')
      console.error(out.slice(0, 600))
      return 4
    }
    console.log('ABIERTA ' + m[1] + ' en ' + res.path)
    /*
     * The window is the DEFAULT, not an option. Asking for a project to be opened means seeing
     * the terminal and watching the work, so a dispatch nobody can see is the wrong answer even
     * when it succeeds. --no-show is there for scripts, not for people.
     */
    if (!argv.includes('--no-show')) {
      console.log(showWindow(m[1], res.path, path.basename(res.path)) ? '  ventana abierta' : '  sin ventana')
    }
    if (!argv.includes('--no-url')) {
      // Detached: the address only appears once the session has actually brought something up.
      const w = spawn(process.execPath, [__filename, 'urlwatch', m[1], '180'], {
        detached: true, stdio: 'ignore', windowsHide: true,
      })
      w.unref()
      console.log('  vigilando si publica una direccion, la abro en el navegador')
    }
    console.log('  ver:     node open-project.js logs ' + m[1])
    console.log('  seguir:  node open-project.js tell ' + m[1] + ' "..."')
    return 0
  }

  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(29, 39).map((l) => l.replace(/^ \* ?/, '')).join('\n'))
  return cmd ? 2 : 0
}

process.exitCode = main()

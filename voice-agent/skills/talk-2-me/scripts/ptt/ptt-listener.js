#!/usr/bin/env node
/*
 * ptt-listener.js - turns key edges into a flag file the voice engine can read.
 *
 * Push to talk needs two processes that cannot be one. The key has to be watched continuously,
 * by something that outlives any single turn; the engine only wakes up when a turn ends and
 * must answer fast. So this resident supervisor owns the PowerShell listener and writes what it
 * hears into one small JSON file, and the engine just reads that file.
 *
 * The file is the entire contract:
 *
 *   { "seq": 41, "down": true, "at": 1789853261946, "hb": 1789853264001,
 *     "key": "0x52+0x1", "pid": 12345 }
 *
 *   seq   increments on EVERY edge, press and release alike. The engine remembers the seq it
 *         last saw, so "the key is still held from the previous turn" is distinguishable from
 *         "the key was pressed again just now". Without that, one long press would open the mic
 *         on every turn until the key was released.
 *   down  true between press and release.
 *   at    when that edge happened.
 *   hb    rewritten every few seconds even when nothing is pressed. THIS IS THE IMPORTANT ONE:
 *         it lets the engine tell a dead listener from a key nobody pressed. Without it a
 *         crashed listener would add the full key timeout of dead air to every single turn,
 *         forever, with no error anywhere.
 *   pid   this process, so a second copy can refuse to start.
 *
 * Usage:
 *   node ptt-listener.js --vk 0x52 --mods 0x1 --device "VID_XXXX&PID_YYYY" [--mode hold]
 *   node ptt-listener.js --from-state <path/to/state.json>     reads the ptt block from there
 *   node ptt-listener.js --status                              prints the flag file and exits
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const HOME = os.homedir()
const FLAG = process.env.TALK2ME_PTT_FILE || path.join(HOME, '.claude', 'talk2me-ptt.json')
const PS1 = path.join(__dirname, 'ptt-rawinput.ps1')
const HEARTBEAT_MS = 5000
const STALE_PID_MS = 30000 // a flag file whose heartbeat is older than this holds no live owner

const argv = process.argv.slice(2)
const flag = (name, def) => {
  const i = argv.indexOf('--' + name)
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def
}
const num = (v, def) => {
  if (v === undefined || v === null || v === '') return def
  const n = String(v).trim().toLowerCase().startsWith('0x') ? parseInt(v, 16) : Number(v)
  return Number.isFinite(n) ? n : def
}

const log = (msg) => process.stdout.write('[ptt-listener] ' + msg + '\n')

const readFlag = () => {
  try { return JSON.parse(fs.readFileSync(FLAG, 'utf8')) } catch { return null }
}

/** Atomic: write a temp file next to the target, then rename over it. A reader never sees half. */
const writeFlag = (obj) => {
  const tmp = FLAG + '.tmp'
  try {
    fs.writeFileSync(tmp, JSON.stringify(obj))
    fs.renameSync(tmp, FLAG)
  } catch (e) {
    log('could not write the flag file: ' + e.message)
  }
}

if (argv.includes('--status')) {
  const f = readFlag()
  if (!f) { console.log('no flag file at ' + FLAG); process.exit(1) }
  const age = Date.now() - (f.hb || 0)
  console.log(JSON.stringify(f, null, 2))
  console.log('\nheartbeat age: ' + age + ' ms  ->  ' + (age < STALE_PID_MS ? 'listener ALIVE' : 'listener DEAD'))
  process.exit(0)
}

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------
let cfg = { vk: num(flag('vk'), 0), mods: num(flag('mods'), 0), device: flag('device', ''), mode: flag('mode', 'hold') }
const fromState = flag('from-state', '')
if (fromState) {
  try {
    const st = JSON.parse(fs.readFileSync(fromState, 'utf8'))
    const p = st.ptt || {}
    cfg = {
      vk: num(p.vk, cfg.vk), mods: num(p.mods, cfg.mods),
      device: p.device || cfg.device, mode: p.mode || cfg.mode,
    }
  } catch (e) {
    log('could not read ' + fromState + ': ' + e.message)
  }
}
if (!cfg.vk) {
  console.error('usage: node ptt-listener.js --vk 0x52 [--mods 0x1] [--device "VID_XXXX&PID_YYYY"] [--mode hold|toggle]')
  console.error('       node ptt-listener.js --from-state <state.json>')
  console.error('\nRun pick-key.js first to find out what your key sends.')
  process.exit(2)
}

// ---------------------------------------------------------------------------
// single instance
// ---------------------------------------------------------------------------
/*
 * Two listeners on the same key both write this file and the engine sees interleaved seq
 * numbers, which looks like phantom presses. The owner is whoever holds a FRESH heartbeat;
 * a stale one means the previous owner died and its pid may already belong to something else,
 * which is why the heartbeat decides and not the pid.
 */
const existing = readFlag()
if (existing && existing.pid && existing.pid !== process.pid && Date.now() - (existing.hb || 0) < STALE_PID_MS) {
  console.error('another listener is already running (pid ' + existing.pid + ', heartbeat ' +
    (Date.now() - existing.hb) + ' ms ago). Stop it first.')
  process.exit(3)
}

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
const keyLabel = '0x' + cfg.vk.toString(16).toUpperCase() + (cfg.mods ? '+0x' + cfg.mods.toString(16) : '')
let seq = (existing && Number(existing.seq)) || 0 // keep counting up across restarts
let down = false
let lastAt = 0
let err = null

const publish = () => writeFlag({
  seq, down, at: lastAt, hb: Date.now(), key: keyLabel,
  device: cfg.device || null, mode: cfg.mode, pid: process.pid, err,
})

const edge = (isDown, at) => {
  seq += 1
  down = isDown
  lastAt = at || Date.now()
  publish()
  log((isDown ? 'DOWN' : 'UP  ') + ' seq=' + seq)
}

// ---------------------------------------------------------------------------
// the listener itself
// ---------------------------------------------------------------------------
const args = [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1,
  '-Vk', String(cfg.vk), '-Mods', String(cfg.mods),
  '-Mode', cfg.mode, '-ParentPid', String(process.pid),
]
if (cfg.device) args.push('-Device', cfg.device)

log('key ' + keyLabel + (cfg.device ? ' on ' + cfg.device : ' on any keyboard') + ', mode ' + cfg.mode)
log('flag file ' + FLAG)

const child = spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })

let buf = ''
child.stdout.on('data', (c) => {
  buf += c.toString()
  const lines = buf.split(/\r?\n/)
  buf = lines.pop()
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith('READY')) { log('listening'); publish(); continue }
    if (t.startsWith('DOWN')) { edge(true, Number(t.split(/\s+/)[1])); continue }
    if (t.startsWith('UP')) { edge(false, Number(t.split(/\s+/)[1])); continue }
    if (t.startsWith('ERR')) {
      // Loud, not a retry loop: a claimed hotkey or a missing device will not fix itself, and a
      // listener that looks alive while it hears nothing is the worst possible state.
      err = t
      publish()
      log('FAILED: ' + t)
      continue
    }
    log('unexpected: ' + t.slice(0, 120))
  }
})
child.stderr.on('data', (c) => log('powershell: ' + c.toString().trim().slice(0, 200)))
child.on('error', (e) => { err = 'spawn failed: ' + e.message; publish(); log(err); process.exit(4) })
child.on('exit', (code) => {
  log('listener exited (code ' + code + ')')
  // Clear the heartbeat so the engine sees a dead listener instead of a key nobody pressed.
  try { fs.unlinkSync(FLAG) } catch {}
  process.exit(code === 0 ? 0 : 5)
})

const beat = setInterval(publish, HEARTBEAT_MS)
publish()

const bye = () => {
  clearInterval(beat)
  try { child.kill() } catch {}
  try { fs.unlinkSync(FLAG) } catch {}
  process.exit(0)
}
process.on('SIGINT', bye)
process.on('SIGTERM', bye)

// Ask the person which pad key they want, by having them press it.
//
// It has to be run BY the person pressing: a capture started from somewhere else never lines
// up with when they actually press, and a run that catches an empty room looks identical to a
// dead device. So this waits for a keypress instead of for a clock, and says plainly when
// nothing arrived.
//
// Usage:  node pick-key.js [--device "VID_XXXX&PID_YYYY"] [--seconds 30]
const path = require('path')
const { spawn } = require('child_process')

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name)
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def
}
const DEVICE = arg('device', 'VID_XXXX&PID_YYYY')
const SECONDS = Number(arg('seconds', '30')) || 30
const PS1 = path.join(__dirname, 'ptt-rawinput.ps1')

const NAMES = {
  0x12: 'ALT', 0xA4: 'ALT izquierdo', 0xA5: 'ALT derecho', 0x11: 'CTRL', 0xA2: 'CTRL izquierdo',
  0xA3: 'CTRL derecho', 0x10: 'SHIFT', 0xA0: 'SHIFT izquierdo', 0xA1: 'SHIFT derecho', 0x5B: 'WINDOWS',
  0x52: 'R', 0x58: 'X', 0x53: 'S', 0x46: 'F', 0x4A: 'J', 0x69: 'Numpad 9', 0x68: 'Numpad 8',
  0x67: 'Numpad 7', 0x66: 'Numpad 6', 0x65: 'Numpad 5', 0x64: 'Numpad 4',
}
const MODS = [0x12, 0xA4, 0xA5, 0x11, 0xA2, 0xA3, 0x10, 0xA0, 0xA1, 0x5B]
const MODBIT = { 0x11: 2, 0xA2: 2, 0xA3: 2, 0x10: 4, 0xA0: 4, 0xA1: 4, 0x12: 1, 0xA4: 1, 0xA5: 1, 0x5B: 8 }
const nameOf = (vk) => NAMES[vk] || ('tecla 0x' + vk.toString(16).toUpperCase())

console.log('Aprieta UNA VEZ la tecla que quieres usar, y dejala apretada como un segundo.')
console.log('Tienes ' + SECONDS + ' segundos. (filtro: ' + DEVICE + ')\n')

const child = spawn('powershell.exe', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1,
  '-Watch', '-Seconds', String(SECONDS), '-Device', DEVICE,
], { windowsHide: true })

const events = []
let buf = ''
child.stdout.on('data', (c) => {
  buf += c.toString()
  const lines = buf.split(/\r?\n/)
  buf = lines.pop()
  for (const line of lines) {
    const m = line.match(/^RAW (\d+) dev=(\S+) vk=0x([0-9A-Fa-f]+) .* (UP|DOWN)/)
    if (!m) continue
    const e = { t: Number(m[1]), vk: parseInt(m[3], 16), up: m[4] === 'UP' }
    events.push(e)
    if (!e.up && MODS.indexOf(e.vk) < 0) process.stdout.write('  ...oi ' + nameOf(e.vk) + '\n')
  }
})

child.on('exit', () => {
  console.log('')
  if (!events.length) {
    console.log('NO LLEGO NADA del pad.')
    console.log('O no apretaste a tiempo, o el pad se desconecto, o esa tecla manda su senal')
    console.log('por otro canal. Corre el mismo comando con  --device ""  para ver TODOS los')
    console.log('teclados y saber cual es cual.')
    process.exit(1)
  }
  const main = events.filter((e) => MODS.indexOf(e.vk) < 0)
  if (!main.length) {
    console.log('Solo llegaron modificadores (Alt, Ctrl, Shift), ninguna tecla principal.')
    process.exit(1)
  }
  const vk = main[0].vk
  const down = main.find((e) => e.vk === vk && !e.up)
  const up = main.find((e) => e.vk === vk && e.up && (!down || e.t >= down.t))
  // Modifiers that were down when the key went down are the ones the pad sends with it.
  const heldMods = [...new Set(events
    .filter((e) => MODS.indexOf(e.vk) >= 0 && !e.up && (!down || Math.abs(e.t - down.t) < 200))
    .map((e) => MODBIT[e.vk] || 0))].filter(Boolean)
  const modsMask = heldMods.reduce((a, b) => a | b, 0)
  const repeats = main.filter((e) => e.vk === vk && !e.up).length

  console.log('TECLA ELEGIDA: ' + nameOf(vk))
  console.log('  vk   = 0x' + vk.toString(16).toUpperCase().padStart(2, '0'))
  console.log('  mods = 0x' + modsMask.toString(16) +
    (modsMask ? '  (' + [[1, 'Alt'], [2, 'Ctrl'], [4, 'Shift'], [8, 'Win']].filter((p) => modsMask & p[0]).map((p) => p[1]).join(' + ') + ')' : '  (ninguno)'))
  if (down && up) {
    console.log('  la tuviste apretada ' + (up.t - down.t) + ' ms, con bajada y subida limpias')
    console.log('  => se puede MANTENER APRETADO para hablar')
  } else {
    console.log('  ATENCION: no vi bajada y subida completas, solo ' + (down ? 'bajada' : 'subida'))
    console.log('  => esta tecla solo sirve para APRETAR UNA VEZ para abrir y otra para cerrar')
  }
  if (repeats > 1) console.log('  (se repitio ' + repeats + ' veces mientras la sostenias, normal, el motor lo ignora)')
  console.log('\nPara usarla:')
  console.log('  --Vk 0x' + vk.toString(16).toUpperCase() + ' --Mods 0x' + modsMask.toString(16) + ' --Device "' + DEVICE + '"')
})

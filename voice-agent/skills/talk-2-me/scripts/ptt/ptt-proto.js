// Proof of the ptt.json contract: baseline seq, press detection, stale press, dead listener.
const fs = require('fs')
const path = require('path')
const os = require('os')
const PTT = path.join(os.tmpdir(), 'ptt-proto.json')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const readPtt = () => {
  try {
    const j = JSON.parse(fs.readFileSync(PTT, 'utf8'))
    return { seq: Number(j.seq) || 0, down: !!j.down, at: Number(j.at) || 0, hb: Number(j.hb) || 0, key: j.key || '?' }
  } catch { return null }
}
const listenerAlive = (p, staleMs) => !!p && (Date.now() - Math.max(p.hb, p.at)) < staleMs

// returns 'pressed' | 'timeout' | 'no-listener'
const waitForKey = async (waitMs, staleMs = 15000, pollMs = 50) => {
  const base = readPtt()
  if (!listenerAlive(base, staleMs)) return 'no-listener'
  const baseSeq = base.seq
  if (base.down) console.log('  (key was already held at baseline seq=' + baseSeq + '; needs release+press)')
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    const p = readPtt()
    if (p && p.seq > baseSeq && p.down && (Date.now() - p.at) < staleMs) return 'pressed'
    await sleep(pollMs)
  }
  return 'timeout'
}
const write = (o) => fs.writeFileSync(PTT, JSON.stringify(o))

;(async () => {
  let seq = 10
  const beat = () => Date.now()

  // 1. listener alive, key pressed 120ms into the wait
  write({ seq, down: false, at: beat(), hb: beat(), key: 'F13' })
  setTimeout(() => write({ seq: ++seq, down: true, at: beat(), hb: beat(), key: 'F13' }), 120)
  console.log('1 normal press            ->', await waitForKey(2000))

  // 2. nobody presses
  write({ seq, down: false, at: beat(), hb: beat(), key: 'F13' })
  console.log('2 no press in 400ms       ->', await waitForKey(400))

  // 3. key STILL held from the previous turn (down:true, seq unchanged) must NOT count
  write({ seq, down: true, at: beat(), hb: beat(), key: 'F13' })
  console.log('3 still held, no new seq  ->', await waitForKey(400))

  // 4. ... until it is released and pressed again
  write({ seq, down: true, at: beat(), hb: beat(), key: 'F13' })
  setTimeout(() => write({ seq: ++seq, down: false, at: beat(), hb: beat(), key: 'F13' }), 80)
  setTimeout(() => write({ seq: ++seq, down: true,  at: beat(), hb: beat(), key: 'F13' }), 160)
  console.log('4 release then press      ->', await waitForKey(2000))

  // 5. stale press: seq bumped but the event is 30s old -> ignored, then times out
  write({ seq: ++seq, down: true, at: Date.now() - 30000, hb: beat(), key: 'F13' })
  console.log('5 press 30s old (stale)   ->', await waitForKey(400))

  // 6. listener dead (no heartbeat for 60s) -> short-circuit, do NOT burn the wait
  write({ seq, down: false, at: Date.now() - 60000, hb: Date.now() - 60000, key: 'F13' })
  const t = Date.now()
  const r = await waitForKey(5000)
  console.log('6 dead listener           ->', r, '(returned in ' + (Date.now() - t) + 'ms, not 5000)')

  // 7. file missing entirely -> fail open as no-listener, never throws
  try { fs.unlinkSync(PTT) } catch {}
  console.log('7 no file at all          ->', await waitForKey(300))
})()

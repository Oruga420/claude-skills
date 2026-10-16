const { spawn, execFileSync } = require('child_process');
const readline = require('readline');
const path = require('path');
const D = __dirname;
const ps = ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File'];
const L = spawn('powershell.exe', [...ps, path.join(D,'focus-latency-test.ps1'), '-Vk','135','-Seconds','14'],
  { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
let presses = [];
readline.createInterface({ input: L.stdout }).on('line', l => {
  console.log(l);
  if (l.startsWith('READY')) {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const out = execFileSync('powershell.exe', [...ps, path.join(D,'synth2.ps1'), '-Vk','135'],
          { windowsHide: true }).toString().trim();
        presses.push(parseInt(out.split('=')[1],10));
        console.log('  synth ' + out);
      }, 500 + i*1200);
    }
    setTimeout(() => L.kill(), 6000);
  }
  if (l.startsWith('HOTKEY')) {
    const fired = parseInt(l.match(/firedAtMs=(\d+)/)[1], 10);
    const p = presses[presses.length-1];
    if (p) console.log(`  >>> latency press->hotkey = ${fired - p} ms`);
  }
});
L.stderr.on('data', d => console.log('STDERR ' + d));
L.on('exit', c => console.log('listener exited code=' + c));

// Proves the whole architecture: plain Node, no native modules, spawns the PowerShell
// listener as a hidden background process, reads edges off stdout, kills it cleanly.
const { spawn, execFile } = require('child_process');
const readline = require('readline');
const path = require('path');

const DIR = __dirname;
const VK_F24 = 0x87;
const lines = [];
let t0 = Date.now();

const ptt = spawn('powershell.exe', [
  '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
  '-File', path.join(DIR, 'ptt.ps1'),
  '-Vk', String(VK_F24), '-Mode', 'hold', '-MaxSeconds', '25'
], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

readline.createInterface({ input: ptt.stdout }).on('line', (l) => {
  const dt = Date.now() - t0;
  lines.push(l);
  console.log(`[+${String(dt).padStart(5)}ms] node received: ${l}`);
  if (l.startsWith('READY')) {
    console.log('  -> listener is live with NO window of its own. Pressing the key from a separate process.');
    setTimeout(() => {
      execFile('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',
        path.join(DIR,'synth.ps1'), '-Vk', String(VK_F24), '-HoldMs', '700'],
        { windowsHide: true }, (e, so) => console.log('  -> ' + String(so).trim()));
    }, 400);
  }
  if (l.startsWith('UP')) {
    setTimeout(() => {
      console.log('\n  -> second press, shorter hold, to prove it re-arms');
      execFile('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',
        path.join(DIR,'synth.ps1'), '-Vk', String(VK_F24), '-HoldMs', '150'],
        { windowsHide: true }, () => {
          setTimeout(() => {
            console.log('\n  -> killing the listener from Node');
            ptt.kill();
          }, 900);
        });
    }, 300);
  }
});

ptt.stderr.on('data', d => console.log('STDERR: ' + d));
ptt.on('exit', (code, sig) => {
  console.log(`\nlistener exited code=${code} signal=${sig}`);
  const downs = lines.filter(l => l.startsWith('DOWN')).length;
  const ups   = lines.filter(l => l.startsWith('UP')).length;
  console.log(`RESULT: ${downs} DOWN edges, ${ups} UP edges, expected 2 and 2`);
  console.log(downs === 2 && ups === 2 ? 'PASS' : 'FAIL');
});

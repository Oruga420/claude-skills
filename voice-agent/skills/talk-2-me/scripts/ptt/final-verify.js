// Final check: correctness (2 clean DOWN/UP pairs), idle CPU, and the orphan guard.
const { spawn, execFileSync, execSync } = require('child_process');
const readline = require('readline'); const path = require('path');
const D = __dirname;
const ps = ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File'];
const L = spawn('powershell.exe', [...ps, path.join(D,'ptt-final.ps1'),
  '-Vk','135','-Mode','hold','-ParentPid', String(process.pid)],
  { windowsHide:true, stdio:['ignore','pipe','pipe'] });
const got = [];
let listenerPid = null;
readline.createInterface({ input: L.stdout }).on('line', async l => {
  console.log('node got: ' + l);
  got.push(l);
  if (l.startsWith('READY')) {
    listenerPid = parseInt(l.match(/pid=(\d+)/)[1],10);
    // idle CPU over 6 s
    setTimeout(() => {
      const cpu = (ms) => execSync(`powershell -NoProfile -Command "(Get-Process -Id ${listenerPid}).TotalProcessorTime.TotalMilliseconds"`).toString().trim();
      const a = parseFloat(cpu());
      setTimeout(() => {
        const b = parseFloat(cpu());
        console.log(`\nIDLE CPU: ${(b-a).toFixed(0)} ms over 6000 ms wall = ${((b-a)/6000*100).toFixed(2)}% of one core\n`);
        for (let i=0;i<2;i++) setTimeout(() => {
          execFileSync('powershell.exe', [...ps, path.join(D,'synth.ps1'), '-Vk','135','-HoldMs', String(400+i*300)], {windowsHide:true});
        }, 300 + i*1500);
        setTimeout(finish, 4200);
      }, 6000);
    }, 800);
  }
});
L.stderr.on('data', d => console.log('STDERR ' + d));

function finish() {
  const downs = got.filter(x=>x.startsWith('DOWN')).length;
  const ups   = got.filter(x=>x.startsWith('UP')).length;
  console.log(`\ncorrectness: ${downs} DOWN, ${ups} UP (expected 2/2) -> ${downs===2&&ups===2?'PASS':'FAIL'}`);
  // orphan guard: do NOT kill the child, just exit this Node process
  console.log(`orphan guard: exiting Node (pid ${process.pid}) WITHOUT killing listener pid ${listenerPid}`);
  console.log('check in 3 s whether the listener self-terminated...');
  const probe = `Start-Sleep -Seconds 3; $p = Get-Process -Id ${listenerPid} -ErrorAction SilentlyContinue; if ($p) { "ORPHAN STILL ALIVE - guard FAILED"; Stop-Process -Id ${listenerPid} -Force } else { "listener self-terminated - guard PASSED" }`;
  spawn('powershell.exe', ['-NoProfile','-Command', probe], { detached:true, stdio:'inherit' });
  L.unref();
  setTimeout(()=>process.exit(0), 200);
}

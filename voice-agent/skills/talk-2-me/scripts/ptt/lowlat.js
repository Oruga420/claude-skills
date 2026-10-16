const { spawn, execFileSync } = require('child_process');
const readline = require('readline'); const path = require('path');
const D = __dirname;
const ps = ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File'];
const L = spawn('powershell.exe', [...ps, path.join(D,'lowlat-test.ps1'), '-Vk','135','-Seconds','12'],
  { windowsHide:true, stdio:['ignore','pipe','pipe'] });
let presses = []; const lat = [];
readline.createInterface({ input: L.stdout }).on('line', l => {
  if (l.startsWith('READY')) {
    console.log(l);
    for (let i=0;i<5;i++) setTimeout(() => {
      const o = execFileSync('powershell.exe', [...ps, path.join(D,'synth2.ps1'), '-Vk','135'], {windowsHide:true}).toString().trim();
      presses.push(parseInt(o.split('=')[1],10));
    }, 500 + i*900);
    setTimeout(()=>L.kill(), 6200);
  }
  if (l.startsWith('HOTKEY')) {
    const f = parseInt(l.match(/firedAtMs=(\d+)/)[1],10);
    const p = presses[presses.length-1];
    if (p) { lat.push(f-p); console.log(`press->hotkey = ${f-p} ms`); }
  }
});
L.stderr.on('data', d=>console.log('STDERR '+d));
L.on('exit', () => {
  lat.sort((a,b)=>a-b);
  console.log(`\nblocking-wait latencies ms: [${lat.join(', ')}]  median=${lat[Math.floor(lat.length/2)]}`);
});

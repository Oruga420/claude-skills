// Optional existing-browser fallback. No downloads, installs, shell calls or profile access.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export async function launchBrowser({ allowBrowser = false } = {}) {
  if (!allowBrowser) throw new Error('Browser not permitted: use the authorized MCP first; fallback requires --allow-browser');
  let puppeteer;
  for (const root of [process.env.HALLMARK_PUPPETEER, process.cwd(), dirname(fileURLToPath(import.meta.url))].filter(Boolean)) {
    for (const name of ['puppeteer-core', 'puppeteer']) {
      let location;
      try { location = createRequire(join(root, 'hallmark-resolve.cjs')).resolve(name); } catch { continue; }
      // Once a package resolves, propagate load errors rather than silently loading another copy.
      puppeteer = (await import(pathToFileURL(location).href)).default;
      if (puppeteer) break;
    }
    if (puppeteer) break;
  }
  if (!puppeteer) throw new Error('Existing Puppeteer not found; render not run. Use available MCP or report the missing dependency.');
  const known = process.platform === 'win32' ? [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ] : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'];
  let executablePath = [process.env.CHROME_PATH, ...known].find(p => p && existsSync(p));
  if (!executablePath && typeof puppeteer.executablePath === 'function') {
    const bundled = puppeteer.executablePath();
    if (bundled && existsSync(bundled)) executablePath = bundled;
  }
  if (!executablePath) throw new Error('Existing browser executable not found; render not run.');
  return puppeteer.launch({ executablePath, headless: true, timeout: 30000 });
}

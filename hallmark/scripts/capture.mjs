#!/usr/bin/env node
// Explicit screenshot fallback only; the agent must inspect images and test interactions.
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from './browser.mjs';

export async function capture(target, out, { allowBrowser = false } = {}) {
  if (typeof target !== 'string' || !target.trim()) throw new Error('A URL or HTML path is required');
  let url;
  if (/^https?:\/\//i.test(target)) url = new URL(target).href;
  else {
    if (/^[a-z]+:\/\//i.test(target) || !/\.html?$/i.test(target) || !existsSync(resolve(target))) throw new Error('Expected an existing HTML file or HTTP(S) URL');
    url = pathToFileURL(resolve(target)).href;
  }
  const dir = resolve(out);
  if (existsSync(dir)) throw new Error('Capture destination already exists; choose a new evidence directory');
  const browser = await launchBrowser({ allowBrowser });
  const files = [];
  try {
    mkdirSync(dir, { recursive: true });
    for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        if (response && response.status() >= 400) throw new Error(`Navigation returned HTTP ${response.status()}`);
        const assets = await page.evaluate(async () => {
          await Promise.race([document.fonts.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('Fonts did not settle')), 10000))]);
          for (const image of document.images) image.loading = 'eager';
          await Promise.race([Promise.all([...document.images].map(image => image.decode().catch(() => {}))), new Promise((_, reject) => setTimeout(() => reject(new Error('Images did not settle')), 10000))]);
          return { brokenImages: [...document.images].filter(i => !i.naturalWidth).length, fonts: document.fonts.status };
        });
        if (assets.brokenImages) throw new Error(`${assets.brokenImages} images failed to load`);
        const file = join(dir, `${name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        files.push({ file, width, height });
      } finally { await page.close(); }
    }
    return { status: 'captured_not_reviewed', target: url, screenshots: files, interaction_tests: 'not run', next: 'Inspect both screenshots and test the actual click paths with the authorized browser tool.' };
  } finally { await browser.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const target = args[0];
    if (args.length !== 4 || args[1] !== '--allow-browser' || args[2] !== '--out' || !args[3]) throw new Error('usage: capture.mjs <url|file.html> --allow-browser --out <new-directory>');
    console.log(JSON.stringify(await capture(target, args[3], { allowBrowser: true }), null, 2));
  } catch (e) { console.error(JSON.stringify({ status: 'incomplete', error: e.message })); process.exitCode = 2; }
}

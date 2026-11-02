#!/usr/bin/env node
// MIT derivative of Hallmark. Offline theme selection and explicit token export.
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function catalogue(root = ROOT) {
  const value = JSON.parse(readFileSync(resolve(root, 'references/themes/index.json'), 'utf8'));
  if (!Array.isArray(value.themes)) throw new Error('Invalid theme catalogue');
  return value.themes;
}
function inside(root, path) {
  const target = realpathSync(resolve(root, path));
  const rel = relative(realpathSync(root), target);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Theme path escapes the skill');
  return target;
}
export function shortlist(prompt, count = 3, entries = catalogue()) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('A brief is required');
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('count must be 1..10');
  const words = new Set(prompt.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
  return entries.map(t => {
    const terms = [...(t.keywords || []), t.name, t.genre, t.posture].filter(Boolean);
    const matched = terms.filter(term => term.toLowerCase().split(/[^\p{L}\p{N}]+/u).some(w => words.has(w)));
    return { slug: t.slug, name: t.name, genre: t.genre, material: t.material,
      file: t.file, picture: t.picture, score: matched.length,
      reason: matched.length ? `Brief matches: ${matched.join(', ')}` : 'No lexical match; inspect manually, do not infer a fit' };
  }).sort((a, b) => b.score - a.score || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)).slice(0, count);
}
export function tokens(slug, root = ROOT) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug || '')) throw new Error('Invalid theme slug');
  const entry = catalogue(root).find(t => t.slug === slug);
  if (!entry) throw new Error(`Unknown theme: ${slug}`);
  const source = readFileSync(inside(root, entry.file), 'utf8').replace(/\r\n/g, '\n');
  const block = [...source.matchAll(/```css\s*\n([\s\S]*?)```/g)]
    .map(m => m[1]).find(s => /^:root\s*\{/m.test(s));
  if (!block) throw new Error(`No root token block: ${slug}`);
  return `/* Hallmark Oruga: ${slug}. Adapt to the brand; verify contrast and font availability. */\n${block.trim()}\n`;
}
export function writeTokens(slug, destination) {
  // Exclusive creation protects existing styles and does not create directories.
  writeFileSync(resolve(destination), tokens(slug), { encoding: 'utf8', flag: 'wx' });
}
function main(args) {
  const [command, value, option, out, ...rest] = args;
  if (command === 'list' && args.length === 1) {
    console.log(JSON.stringify(catalogue().map(({slug, name, genre, material, file, picture}) => ({slug, name, genre, material, file, picture})), null, 2));
  } else if (command === 'shortlist' && args.length === 2) {
    console.log(JSON.stringify(shortlist(value), null, 2));
  } else if (command === 'tokens' && args.length === 2) {
    process.stdout.write(tokens(value));
  } else if (command === 'tokens' && option === '--out' && out && rest.length === 0) {
    writeTokens(value, out);
    console.log(JSON.stringify({ written: resolve(out), note: 'Tokens only; no layout or QA has been completed.' }));
  } else throw new Error('usage: theme.mjs list | shortlist "<brief>" | tokens <slug> [--out <new-file.css>]');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 2; }
}

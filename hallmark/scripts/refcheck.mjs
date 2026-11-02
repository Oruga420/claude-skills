#!/usr/bin/env node
// Package integrity only: no subprocesses, browser, credentials or network.
import { readFileSync, readdirSync, lstatSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function inventory(root = ROOT) {
  const entries = {};
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const full = resolve(dir, name);
      const path = relative(root, full).split('\\').join('/');
      const st = lstatSync(full);
      if (st.isSymbolicLink()) throw new Error(`Symlink is not a portable payload: ${path}`);
      if (st.isDirectory()) walk(full);
      else if (!st.isFile()) throw new Error(`Unsupported file: ${path}`);
      else if (path !== 'MANIFEST.sha256.json') entries[path] = createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  }
  walk(resolve(root));
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
export function verifyManifest(root = ROOT) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'MANIFEST.sha256.json'), 'utf8'));
  if (manifest.schema_version !== 1 || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw new Error('Invalid manifest');
  const actual = inventory(root);
  const issues = [];
  for (const [file, hash] of Object.entries(manifest.files)) {
    if (!/^[a-f0-9]{64}$/.test(hash)) issues.push(`Invalid hash: ${file}`);
    else if (!(file in actual)) issues.push(`Missing: ${file}`);
    else if (actual[file] !== hash) issues.push(`Changed: ${file}`);
  }
  for (const file of Object.keys(actual)) if (!(file in manifest.files)) issues.push(`Unexpected: ${file}`);
  return issues;
}
export function checkLinks(root = ROOT) {
  const files = inventory(root);
  const issues = [];
  function validTarget(from, value) {
    const file = value.split('#')[0].split('?')[0];
    if (!file || /^(?:https?:|mailto:|data:)/i.test(file)) return;
    let decoded;
    try { decoded = decodeURIComponent(file); } catch { issues.push(`Invalid link in ${from}: ${file}`); return; }
    const target = resolve(dirname(resolve(root, from)), decoded);
    const rel = relative(resolve(root), target);
    if (isAbsolute(rel) || rel.startsWith('..') || !existsSync(target)) issues.push(`Broken/outside link in ${from}: ${file}`);
  }
  for (const file of Object.keys(files).filter(f => f.endsWith('.md'))) {
    const text = readFileSync(resolve(root, file), 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const match of text.matchAll(/\]\(([^\s)]+)\)/g)) validTarget(file, match[1]);
  }
  const index = JSON.parse(readFileSync(resolve(root, 'references/themes/index.json'), 'utf8'));
  const names = new Set();
  for (const theme of index.themes) {
    if (!/^[a-z0-9-]+$/.test(theme.slug) || names.has(theme.slug)) issues.push(`Invalid/duplicate theme: ${theme.slug}`);
    names.add(theme.slug);
    validTarget('SKILL.md', theme.file);
    validTarget('SKILL.md', theme.picture);
  }
  return issues;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--write-manifest')) throw new Error('usage: refcheck.mjs [--write-manifest]');
    const links = checkLinks();
    if (links.length) { console.log(JSON.stringify({ status: 'failed', issues: links }, null, 2)); process.exitCode = 1; }
    else {
      if (args[0] === '--write-manifest') writeFileSync(resolve(ROOT, 'MANIFEST.sha256.json'), JSON.stringify({ schema_version: 1, algorithm: 'SHA256', excluded: ['MANIFEST.sha256.json'], files: inventory() }, null, 2) + '\n', 'utf8');
      const issues = verifyManifest();
      console.log(JSON.stringify({ status: issues.length ? 'failed' : 'verified', files: Object.keys(inventory()).length, issues, scope: 'package links and bytes only; no UI or provider QA' }, null, 2));
      process.exitCode = issues.length ? 1 : 0;
    }
  } catch (e) { console.error(e.message); process.exitCode = 2; }
}

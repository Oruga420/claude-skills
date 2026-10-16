#!/usr/bin/env node
/**
 * inventory-clickables.mjs
 *
 * Enumerates every clickable / user-operable control found in a React/Next.js
 * (or plain HTML/JSX) source tree, so each one can be handed a voice tool.
 *
 * Usage:
 *   node inventory-clickables.mjs <srcDir> [--out inventory.md] [--json inventory.json] [--routes appDir] [--summary]
 *
 * No dependencies. Node 20+. ESM.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { srcDir: null, out: null, json: null, routes: null, summary: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') { args.out = argv[++i]; }
    else if (a === '--json') { args.json = argv[++i]; }
    else if (a === '--routes') { args.routes = argv[++i]; }
    else if (a === '--summary') { args.summary = true; }
    else { positional.push(a); }
  }
  args.srcDir = positional[0] || null;
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.srcDir) {
  console.error('Usage: node inventory-clickables.mjs <srcDir> [--out inventory.md] [--json inventory.json] [--routes appDir] [--summary]');
  process.exit(1);
}

const SRC_DIR = path.resolve(args.srcDir);
if (!existsSync(SRC_DIR)) {
  console.error(`srcDir does not exist: ${SRC_DIR}`);
  process.exit(1);
}
const ROUTES_DIR = args.routes ? path.resolve(args.routes) : null;

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', 'out', '.git', 'coverage',
  '__tests__', 'tests', 'test', '__mocks__', 'storybook', '.storybook',
  '.turbo', '.vercel', 'cypress', 'playwright-report', 'e2e',
]);

const CODE_EXT = new Set(['.tsx', '.jsx', '.ts', '.js', '.html', '.vue', '.svelte']);

function isTestFile(fileName) {
  return /\.(test|spec|stories)\.[jt]sx?$/i.test(fileName) || /\.stories\.[jt]sx?$/i.test(fileName);
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!CODE_EXT.has(ext)) continue;
      if (isTestFile(entry.name)) continue;
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = walk(SRC_DIR);

// ---------------------------------------------------------------------------
// Screen derivation
// ---------------------------------------------------------------------------

/**
 * Derive a "screen" name for a file.
 * - If it lives under an app-router dir (ROUTES_DIR, or a segment literally
 *   named "app"), turn the folder path into a route: app/history/page.tsx -> /history
 * - Otherwise use the parent component folder name: components/admin/Foo.tsx -> admin
 */
function deriveScreen(filePath) {
  const rel = path.relative(SRC_DIR, filePath).split(path.sep).join('/');

  const routesRoot = ROUTES_DIR ? path.relative(SRC_DIR, ROUTES_DIR).split(path.sep).join('/') : null;

  let underAppRouter = false;
  let afterRoot = null;

  if (routesRoot !== null && routesRoot !== '' && rel.startsWith(routesRoot + '/')) {
    underAppRouter = true;
    afterRoot = rel.slice(routesRoot.length + 1);
  } else {
    // fallback: any path segment literally called "app" (Next.js app router convention)
    const segs = rel.split('/');
    const appIdx = segs.indexOf('app');
    if (appIdx !== -1) {
      underAppRouter = true;
      afterRoot = segs.slice(appIdx + 1).join('/');
    }
  }

  if (underAppRouter && afterRoot) {
    let segs = afterRoot.split('/');
    // drop the filename (page.tsx, layout.tsx, etc.)
    segs = segs.slice(0, -1);
    // drop Next.js route groups (parenthesized) and dynamic markers stay as-is
    segs = segs.filter((s) => !(s.startsWith('(') && s.endsWith(')')));
    const route = '/' + segs.join('/');
    return route === '/' ? '/ (root)' : route;
  }

  // fallback: parent folder name, e.g. components/admin/Foo.tsx -> admin
  const segs = rel.split('/');
  segs.pop(); // filename
  if (segs.length === 0) return '(root)';
  return segs[segs.length - 1] || '(root)';
}

// ---------------------------------------------------------------------------
// Line-based scanning
// ---------------------------------------------------------------------------

/**
 * We scan with regexes tuned for JSX/TSX source text. This is deliberately
 * line-oriented and heuristic, not a real JSX parser: it is good enough to
 * build an inventory a human will review, not to compile the file.
 *
 * Each match record: { line, kind, label, action, raw }
 */

const CONTROLS = [];

function pushControl(filePath, screen, lineNo, kind, label, action, raw) {
  CONTROLS.push({
    file: path.relative(SRC_DIR, filePath).split(path.sep).join('/'),
    screen,
    line: lineNo,
    kind,
    label: (label || '').trim().slice(0, 120),
    action: (action || '').trim().slice(0, 160),
    voiceTool: '',
    Kind: '',
    'Role gate': '',
  });
}

// best-effort label extraction: children text on the same line, or nearby attrs
function extractLabel(tagText, contextLines, lineIdx) {
  // aria-label="..."
  let m = tagText.match(/aria-label\s*=\s*"([^"]*)"/) || tagText.match(/aria-label\s*=\s*'([^']*)'/);
  if (m) return m[1];
  // title="..."
  m = tagText.match(/title\s*=\s*"([^"]*)"/) || tagText.match(/title\s*=\s*'([^']*)'/);
  if (m) return m[1];
  // placeholder="..."
  m = tagText.match(/placeholder\s*=\s*"([^"]*)"/) || tagText.match(/placeholder\s*=\s*'([^']*)'/);
  if (m) return m[1];
  // children text on same line: >text<
  m = tagText.match(/>\s*([^<>{}\n]+?)\s*</);
  if (m && m[1].trim()) return m[1].trim();
  // look ahead up to 2 lines for inline text before a closing tag
  for (let i = lineIdx + 1; i <= lineIdx + 2 && i < contextLines.length; i++) {
    const line = contextLines[i];
    const mm = line.match(/^\s*([^<>{}\n]+?)\s*$/);
    if (mm && mm[1].trim() && !mm[1].includes('=')) return mm[1].trim();
    if (line.includes('<')) break;
  }
  return '';
}

function extractHandlerName(tagText, attr) {
  const re = new RegExp(attr + '\\s*=\\s*\\{?\\s*([A-Za-z0-9_$.]+)');
  const m = tagText.match(re);
  return m ? m[1] : '';
}

function extractApiFromNearby(lines, lineIdx, radius = 8) {
  const start = Math.max(0, lineIdx - radius);
  const end = Math.min(lines.length, lineIdx + radius);
  for (let i = start; i < end; i++) {
    const line = lines[i];
    const m = line.match(/(?:api|fetch)\(\s*['"`](\/api\/[^'"`]+)['"`]/);
    if (m) return m[1];
  }
  return '';
}

function scanFile(filePath) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  const screen = deriveScreen(filePath);

  // Multi-line tag reassembly: only start a scan window on the line where a
  // NEW tag actually opens ('<TagName', never '</TagName'). Continuation
  // lines that merely hold attributes (className="select", onChange={...})
  // do not start a new tag and are skipped here; their content is still
  // captured because the window built from the opening line reaches forward.
  // This is what keeps a single multi-line <select ...> from being counted
  // once per line it spans.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tagOpenMatch = line.match(/<([A-Za-z][A-Za-z0-9.]*)/);
    if (!tagOpenMatch) continue;

    const tagName = tagOpenMatch[1];

    // Build a window for multi-line tag attribute matching, anchored at the
    // tag-open line only, and truncate it at this tag's own closing '>' so
    // attributes belonging to a nested child element are never picked up as
    // if they belonged to the outer tag. Arrow functions ("=>") are masked
    // first so they are never mistaken for the tag's closing '>'.
    const windowEnd = Math.min(lines.length, i + 12);
    const windowText = lines.slice(i, windowEnd).join(' ');
    const masked = windowText.replace(/=>/g, '‣‣');
    const closeMatch = masked.match(/\/?>/);
    const tagText = closeMatch
      ? windowText.slice(0, closeMatch.index + closeMatch[0].length)
      : windowText;

    // --- <button ...>
    if (tagName === 'button') {
      const label = extractLabel(tagText, lines, i) || extractHandlerName(tagText, 'onClick');
      const handler = extractHandlerName(tagText, 'onClick');
      const api = extractApiFromNearby(lines, i);
      pushControl(filePath, screen, i + 1, 'button', label, handler ? `onClick=${handler}${api ? ' -> ' + api : ''}` : (api || ''), tagText);
    }

    // --- <a href=...>
    else if (tagName === 'a') {
      const m = tagText.match(/href\s*=\s*(?:\{`?|["'])([^"'}`]+)/);
      if (m) {
        const label = extractLabel(tagText, lines, i);
        pushControl(filePath, screen, i + 1, 'a', label, m[1], tagText);
      }
    }

    // --- <Link href=...>
    else if (tagName === 'Link') {
      const m = tagText.match(/href\s*=\s*(?:\{`?|["'])([^"'}`]+)/);
      if (m) {
        const label = extractLabel(tagText, lines, i);
        pushControl(filePath, screen, i + 1, 'Link', label, m[1], tagText);
      }
    }

    // --- <select ...>
    else if (tagName === 'select') {
      const label = extractLabel(tagText, lines, i) || extractHandlerName(tagText, 'onChange');
      const handler = extractHandlerName(tagText, 'onChange');
      pushControl(filePath, screen, i + 1, 'select', label, handler ? `onChange=${handler}` : '', tagText);
    }

    // --- <input ...>
    else if (tagName === 'input') {
      const typeMatch = tagText.match(/type\s*=\s*["']([^"']+)["']/);
      const inputType = typeMatch ? typeMatch[1] : 'text';
      const label = extractLabel(tagText, lines, i) || extractHandlerName(tagText, 'onChange');
      const handler = extractHandlerName(tagText, 'onChange') || extractHandlerName(tagText, 'onClick');
      pushControl(filePath, screen, i + 1, `input[${inputType}]`, label, handler ? `on*=${handler}` : '', tagText);
    }

    // --- <textarea ...>
    else if (tagName === 'textarea') {
      const label = extractLabel(tagText, lines, i) || extractHandlerName(tagText, 'onChange');
      const handler = extractHandlerName(tagText, 'onChange');
      pushControl(filePath, screen, i + 1, 'textarea', label, handler ? `onChange=${handler}` : '', tagText);
    }

    // --- <form ...>
    else if (tagName === 'form') {
      const handler = extractHandlerName(tagText, 'onSubmit');
      const api = extractApiFromNearby(lines, i);
      pushControl(filePath, screen, i + 1, 'form', handler || 'form', handler ? `onSubmit=${handler}${api ? ' -> ' + api : ''}` : (api || ''), tagText);
    }

    // --- everything else: generic element carrying onClick / onChange /
    //     onSubmit (e.g. <div onClick=...>, <CustomCard onClick=...>), a
    //     ARIA interactive role, a <summary>, or a standalone aria-label.
    else {
      let handled = false;

      const genericTag = tagText.match(/(onClick|onChange|onSubmit)\s*=\s*\{?\s*([A-Za-z0-9_$.]+)/);
      if (genericTag) {
        const eventName = genericTag[1];
        const handlerName = genericTag[2];
        const label = extractLabel(tagText, lines, i) || handlerName;
        const api = extractApiFromNearby(lines, i);
        pushControl(filePath, screen, i + 1, `${tagName}[${eventName}]`, label, `${eventName}=${handlerName}${api ? ' -> ' + api : ''}`, tagText);
        handled = true;
      }

      const roleMatch = tagText.match(/role\s*=\s*["'](tab|menuitem|switch|checkbox|radio|button|option|slider)["']/);
      if (roleMatch) {
        const label = extractLabel(tagText, lines, i);
        pushControl(filePath, screen, i + 1, `role=${roleMatch[1]}`, label, '', tagText);
        handled = true;
      }

      if (tagName === 'summary') {
        const label = extractLabel(tagText, lines, i);
        pushControl(filePath, screen, i + 1, 'summary', label, '', tagText);
        handled = true;
      }

      if (!handled) {
        const ariaOnly = tagText.match(/aria-label\s*=\s*["']([^"']+)["']/);
        if (ariaOnly) {
          pushControl(filePath, screen, i + 1, `${tagName}[aria-label]`, ariaOnly[1], '', tagText);
        }
      }
    }
  }
}

for (const f of files) {
  scanFile(f);
}

// de-duplicate exact (file, line, kind, action) collisions caused by window overlap
const seen = new Set();
const deduped = [];
for (const c of CONTROLS) {
  const key = `${c.file}:${c.line}:${c.kind}:${c.action}:${c.label}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(c);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

deduped.sort((a, b) => {
  if (a.screen !== b.screen) return a.screen < b.screen ? -1 : 1;
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return a.line - b.line;
});

if (args.summary) {
  const counts = new Map();
  for (const c of deduped) {
    counts.set(c.screen, (counts.get(c.screen) || 0) + 1);
  }
  const screens = [...counts.keys()].sort();
  for (const s of screens) {
    console.log(`${s}: ${counts.get(s)}`);
  }
  console.log(`\nTOTAL: ${deduped.length} controls across ${screens.length} screens`);
  process.exit(0);
}

function mdEscape(s) {
  return (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

const fileSet = new Set(deduped.map((c) => c.file));

let md = '';
md += '# Clickables Inventory\n\n';
md += `Source: \`${path.relative(process.cwd(), SRC_DIR).split(path.sep).join('/')}\`\n\n`;
md += '| Screen | File | Line | Element | Label | Handler/Href/Action | Kind | Role gate | Voice tool |\n';
md += '|---|---|---|---|---|---|---|---|---|\n';
for (const c of deduped) {
  md += `| ${mdEscape(c.screen)} | ${mdEscape(c.file)} | ${c.line} | ${mdEscape(c.kind)} | ${mdEscape(c.label)} | ${mdEscape(c.action)} | ${mdEscape(c.Kind)} | ${mdEscape(c['Role gate'])} | ${mdEscape(c.voiceTool)} |\n`;
}
md += `\n${deduped.length} controls in ${fileSet.size} files\n`;

const outPath = args.out ? path.resolve(args.out) : null;
if (outPath) {
  writeFileSync(outPath, md, 'utf8');
  console.log(`Wrote ${outPath}`);
} else {
  console.log(md);
}

if (args.json) {
  const jsonPath = path.resolve(args.json);
  const jsonOut = deduped.map((c) => ({
    screen: c.screen,
    file: c.file,
    line: c.line,
    element: c.kind,
    label: c.label,
    action: c.action,
    Kind: c.Kind,
    RoleGate: c['Role gate'],
    voiceTool: c.voiceTool,
  }));
  writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2), 'utf8');
  console.log(`Wrote ${jsonPath}`);
}

console.log(`\n${deduped.length} controls in ${fileSet.size} files`);

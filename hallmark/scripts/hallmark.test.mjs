import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { planMedia } from './media-plan.mjs';
import { catalogue, shortlist, tokens, writeTokens } from './theme.mjs';
import { inventory, verifyManifest, checkLinks } from './refcheck.mjs';
import { launchBrowser } from './browser.mjs';
import { normalizeFinding } from './profile.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = fileURLToPath(new URL('./sloplint.mjs', import.meta.url));
const TEMP = mkdtempSync(join(tmpdir(), 'hallmark-oruga-test-'));
// Small evidence fixtures are intentionally retained under the OS temp directory, no recursive delete.
const runLint = (args, cwd = TEMP) => {
  const result = spawnSync(process.execPath, [SCRIPT, ...args, '--json'], { cwd, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.error, undefined, result.error?.message);
  return { ...result, report: result.stdout.trim().startsWith('{') ? JSON.parse(result.stdout) : null };
};

test('prompt-only preserves full constraints and cannot become a generation handoff', () => {
  const result = planMedia({ kind: 'prompt', prompt: 'Keep this whole prompt.\nWith a second line.', constraints: ['No red', 'Exactly three subjects'], generation_authorized: true, provider: 'replicate' });
  assert.equal(result.execution, 'none');
  assert.equal(result.generation_requested, false);
  assert.equal(result.final_prompt, 'Keep this whole prompt.\nWith a second line.\n\nConstraints (preserve all):\n- No red\n- Exactly three subjects');
  assert.equal(result.handoff, undefined);
  assert.equal(result.video, undefined);
  assert.deepEqual(result.submitted_jobs, []);
});
test('image handoff preserves provider and references without inventing a model or image budget', () => {
  const result = planMedia({ kind: 'image', prompt: 'A specified image', provider: 'higgsfield', references: ['local/reference.png'], aspect_ratio: '3:2', count: 2 });
  assert.equal(result.requested_provider, 'higgsfield');
  assert.deepEqual(result.references, ['local/reference.png']);
  assert.equal(result.model, null);
  assert.equal(result.budget_usd, null);
  assert.equal(result.video, undefined);
  assert.equal(result.status, 'handoff_only');
});
test('video budget is aggregate, defaults to five, and respects explicit zero or larger limits', () => {
  assert.equal(planMedia({ kind: 'video', prompt: 'Code animation' }).budget_usd, 5);
  for (const budget_usd of [0, 2, 12]) assert.equal(planMedia({ kind: 'video', prompt: 'Code animation', budget_usd }).budget_usd, budget_usd);
  assert.match(planMedia({ kind: 'video', prompt: 'Code animation' }).budget_scope, /voice, music and render/);
});
test('malformed input and credential fields fail before a handoff', () => {
  for (const bad of [{ kind: 'sound' }, { count: 0 }, { budget_usd: -1 }, { budget_usd: NaN }, { generation_authorized: 'yes' }, { aspect_ratio: '0:2' }, { provider: 'together' }, { api_key: 'not-a-secret' }]) {
    assert.throws(() => planMedia({ kind: 'image', prompt: 'An image', ...bad }));
  }
});
test('theme selection is reproducible and all palettes are available offline', () => {
  assert.equal(catalogue().length, 50);
  assert.deepEqual(shortlist('ceramics gallery luxury'), shortlist('ceramics gallery luxury'));
  assert.ok(shortlist('ceramics gallery luxury').every(t => typeof t.reason === 'string'));
  for (const entry of catalogue()) assert.match(tokens(entry.slug), /:root\s*\{/);
});
test('theme token export never overwrites a stylesheet and rejects path traversal', () => {
  const target = join(TEMP, 'tokens.css');
  writeTokens('atelier', target);
  const original = readFileSync(target, 'utf8');
  assert.throws(() => writeTokens('cobalt', target), /EEXIST/);
  assert.equal(readFileSync(target, 'utf8'), original);
  assert.throws(() => tokens('../../SKILL'), /Invalid/);
});
test('technical linter finds motion defects without forcing stamps, heroes or stylistic bans', () => {
  const file = join(TEMP, 'motion.css');
  writeFileSync(file, ':root{--color-accent:purple} .card{transition:all .3s;animation:move 1s infinite} @keyframes move{to{transform:translateX(1px)}}');
  const result = runLint([file]);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.report.findings.some(f => f.gate === '10a'));
  assert.ok(result.report.findings.some(f => f.gate === '27'));
  assert.ok(!result.report.findings.some(f => ['20', '44b', '54', '67'].includes(f.gate)));
  assert.equal(result.report.summary.incomplete, false);
});
test('corrected motion clears those defects and the static tier never claims visual QA', () => {
  const file = join(TEMP, 'corrected.css');
  writeFileSync(file, '.card{transition:transform .2s} .card:hover{transform:translateY(-1px)} @media(prefers-reduced-motion:reduce){.card{transition:none;transform:none}}');
  const result = runLint([file]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.report.findings.some(f => ['10a', '27'].includes(f.gate)));
  assert.equal(result.report.summary.render, 'off');
  assert.equal(result.report.summary.visualReview, 'not performed by this script');
  assert.equal(result.report.summary.interactionTests, 'not performed by this script');
});
test('markup audit catches missing alt text and low contrast as technical findings', () => {
  const file = join(TEMP, 'accessibility.html');
  writeFileSync(file, '<!doctype html><html lang="en"><title>Test</title><style>p{color:#777;background:#888}</style><body><p>Readable content matters</p><img src="test.png"></body></html>');
  const result = runLint([file]);
  assert.equal(result.status, 1);
  assert.ok(result.report.findings.some(f => f.gate === 'a11y'));
  assert.ok(result.report.findings.some(f => f.gate === '40'));
});
test('retained Tailwind/framework parsing still catches unsafe motion utilities', () => {
  const result = runLint([join(ROOT, 'scripts/fixtures/tailwind-fail')]);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.report.findings.some(f => f.gate === '10a'));
  assert.ok(!result.report.findings.some(f => ['54', '64', '67'].includes(f.gate)));
});
test('render is refused before browser launch unless explicitly enabled', async () => {
  await assert.rejects(launchBrowser(), /requires --allow-browser/);
  const result = runLint([join(TEMP, 'corrected.css'), '--render']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--allow-browser/);
});
test('redesign comparison retains detection of lost links, fields and event wiring', () => {
  const dir = mkdtempSync(join(TEMP, 'redesign-'));
  const target = join(dir, 'index.html');
  copyFileSync(join(ROOT, 'scripts/fixtures/kept/before.html'), target);
  const before = runLint(['index.html', '--before'], dir);
  assert.equal(before.status, 0, before.stderr);
  copyFileSync(join(ROOT, 'scripts/fixtures/kept/after.html'), target);
  const after = runLint(['index.html', '--kept'], dir);
  const evidence = after.report.findings.filter(f => f.gate === 'kept').map(f => f.evidence).join('\n');
  for (const item of ['rooms.html', 'nights', 'book-button']) assert.ok(evidence.includes(item), item);
  assert.equal(after.status, 1);
});
test('profile preserves actual render failures and drops upstream aesthetic quotas', () => {
  assert.equal(normalizeFinding({ gate: '44b', grade: 'FAIL', evidence: 'hero not visible' }), null);
  assert.equal(normalizeFinding({ gate: 'render', grade: 'FAIL', evidence: 'script threw' }).grade, 'FAIL');
  assert.equal(normalizeFinding({ gate: '34', grade: 'FAIL', evidence: 'no global overflow clip' }), null);
  assert.equal(normalizeFinding({ gate: '34', grade: 'FAIL', evidence: '[375px] horizontal overflow' }).grade, 'FAIL');
  assert.equal(normalizeFinding({ gate: '40', grade: 'FAIL', evidence: '[375px] text contrast 1.1:1' }).grade, 'FAIL');
});
test('manifest detects content changes and unexpected files', () => {
  const dir = mkdtempSync(join(TEMP, 'integrity-'));
  writeFileSync(join(dir, 'payload.txt'), 'exact content\n');
  writeFileSync(join(dir, 'MANIFEST.sha256.json'), JSON.stringify({ schema_version: 1, files: inventory(dir) }));
  assert.deepEqual(verifyManifest(dir), []);
  writeFileSync(join(dir, 'payload.txt'), 'modified\n');
  writeFileSync(join(dir, 'extra.txt'), 'unexpected\n');
  assert.deepEqual(verifyManifest(dir), ['Changed: payload.txt', 'Unexpected: extra.txt']);
});
test('all package links and theme examples resolve', () => assert.deepEqual(checkLinks(ROOT), []));

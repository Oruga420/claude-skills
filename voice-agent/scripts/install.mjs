#!/usr/bin/env node
/**
 * Installs the bundled skills into ~/.claude/skills so the guide's phases can be invoked.
 *
 *   node scripts/install.mjs --all          copies every skill under ./skills
 *   node scripts/install.mjs ruche fable-it copies the named ones
 *   node scripts/install.mjs --list         shows what is bundled and what is already installed
 *
 * An existing skill folder is replaced only with --force; otherwise it is left alone and reported,
 * so a locally customised copy is never overwritten by accident.
 */
import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = resolve(here, '..', 'skills');
const target = process.env.CLAUDE_SKILLS_DIR || join(homedir(), '.claude', 'skills');

const args = process.argv.slice(2);
const force = args.includes('--force');
const wanted = args.filter((a) => !a.startsWith('--'));

if (!existsSync(bundle)) {
  console.error(`no skills folder at ${bundle}`);
  process.exit(2);
}

const available = readdirSync(bundle).filter((n) => statSync(join(bundle, n)).isDirectory());

if (args.includes('--list') || (wanted.length === 0 && !args.includes('--all'))) {
  for (const name of available) {
    const installed = existsSync(join(target, name)) ? 'installed' : 'not installed';
    console.log(`${name.padEnd(20)} ${installed}`);
  }
  if (wanted.length === 0 && !args.includes('--all')) {
    console.log('\nusage: node scripts/install.mjs --all | <skill...> [--force]');
  }
  process.exit(0);
}

const names = args.includes('--all') ? available : wanted;
const unknown = names.filter((n) => !available.includes(n));
if (unknown.length) {
  console.error(`not bundled: ${unknown.join(', ')}`);
  process.exit(2);
}

let copied = 0;
for (const name of names) {
  const dest = join(target, name);
  if (existsSync(dest)) {
    if (!force) {
      console.log(`${name}: already installed, skipped (use --force to replace)`);
      continue;
    }
    rmSync(dest, { recursive: true, force: true });
  }
  cpSync(join(bundle, name), dest, { recursive: true });
  console.log(`${name}: installed to ${dest}`);
  copied += 1;
}
console.log(`${copied} skill(s) installed. New Claude Code sessions will see them.`);

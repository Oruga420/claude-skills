// Discover selectors for a target form by launching Playwright codegen.
// Run: node scripts/discover-selectors.mjs <URL>
//
// The recorder opens a browser. Click each form field and the Save Draft
// button. Codegen prints stable selectors (getByLabel, getByRole, etc.) to
// stdout. Copy them into draft-fill.mjs.

import { spawn } from 'node:child_process';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/discover-selectors.mjs <URL>');
  process.exit(1);
}

const args = ['playwright', 'codegen', url];
if (process.argv.includes('--with-storage')) {
  args.push('--load-storage=storageState.json');
}

const child = spawn('npx', args, { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));

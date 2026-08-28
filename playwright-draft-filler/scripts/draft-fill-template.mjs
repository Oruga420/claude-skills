// Playwright Draft Filler — template script
// Copy to your project's scripts/ folder and edit the marked sections.
//
// Run:
//   node scripts/draft-fill.mjs --dry-run   # fill but DO NOT click save
//   node scripts/draft-fill.mjs             # fill and click save (draft only)
//
// Safety: this script will refuse to click any button whose label looks like
// Publish / Post / Send / Submit / Pay / Confirm / Schedule / Activate.

import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================
// EDIT THESE
// ============================================================
const TARGET_URL = 'https://CHANGE-ME.example.com/admin/posts/new';
const DATA_FILE = './data/data.json';
const STORAGE_STATE = './storageState.json'; // null if no auth needed
const SAVE_SELECTOR = "role=button[name=/^save( draft| as draft)?$/i]";
const SUCCESS_TOAST = 'text=/draft saved|guardado/i';
// ============================================================

const SAVE_LABEL_SAFELIST = /^(save|save draft|save as draft|save & continue|save and continue|save changes|save and exit|save for later|save progress|guardar|guardar borrador)$/i;
const PUBLISH_BLOCKLIST = /(publish|post|send|submit|pay|confirm|place order|make live|schedule|activate|publicar|enviar|pagar)/i;

const DRY_RUN = process.argv.includes('--dry-run');
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join('output', ts);
mkdirSync(outDir, { recursive: true });

const fillLog = [];

async function fillForm(page, data) {
  // ============================================================
  // EDIT: one block per field. Examples below — replace with your own.
  // ============================================================
  await safeFill(page, page.getByLabel('Title'), data.title, 'title');
  await safeFill(page, page.getByLabel('Description'), data.description, 'description');
  await safeFill(page, page.getByPlaceholder('Tags'), (data.tags ?? []).join(', '), 'tags');
  // await page.getByLabel('Category').selectOption(data.category);
  // await page.getByLabel('Featured').setChecked(!!data.featured);
}

async function safeFill(page, locator, value, name) {
  if (value === undefined || value === null) {
    fillLog.push({ name, status: 'skipped (no value)' });
    return;
  }
  await locator.fill(String(value));
  fillLog.push({ name, value: String(value).slice(0, 120), status: 'filled' });
}

async function assertSaveButton(button) {
  const label = (await button.innerText()).trim();
  if (PUBLISH_BLOCKLIST.test(label)) {
    throw new Error(`REFUSED: button label "${label}" matches publish/submit blocklist`);
  }
  if (!SAVE_LABEL_SAFELIST.test(label)) {
    throw new Error(`REFUSED: button label "${label}" not in save-draft safelist`);
  }
  console.log(`[OK] Save button verified: "${label}"`);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext({
    storageState: STORAGE_STATE && tryRead(STORAGE_STATE) ? STORAGE_STATE : undefined,
    recordHar: { path: join(outDir, 'network.har') },
  });
  const page = await context.newPage();

  try {
    const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));

    console.log(`[1/5] Navigating to ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: join(outDir, 'before-fill.png'), fullPage: true });

    console.log('[2/5] Filling form');
    await fillForm(page, data);
    await page.screenshot({ path: join(outDir, 'after-fill.png'), fullPage: true });

    if (DRY_RUN) {
      console.log('[DRY-RUN] Skipping save click. Review output/ and re-run without --dry-run.');
      writeFileSync(join(outDir, 'fill-log.json'), JSON.stringify(fillLog, null, 2));
      await context.close();
      await browser.close();
      return;
    }

    console.log('[3/5] Locating save button');
    const saveBtn = page.locator(SAVE_SELECTOR).first();
    await saveBtn.waitFor({ state: 'visible' });
    await assertSaveButton(saveBtn);

    console.log('[4/5] Clicking save (5s countdown — Ctrl+C to abort)');
    for (let i = 5; i > 0; i--) {
      process.stdout.write(`${i}... `);
      await page.waitForTimeout(1000);
    }
    console.log();
    await saveBtn.click();

    console.log('[5/5] Asserting success');
    await page.locator(SUCCESS_TOAST).waitFor({ timeout: 10_000 }).catch(() => {
      console.warn('No success toast matched — capturing state anyway.');
    });
    await page.screenshot({ path: join(outDir, 'after-save.png'), fullPage: true });

    writeFileSync(join(outDir, 'fill-log.json'), JSON.stringify(fillLog, null, 2));
    console.log(`Done. Artifacts in ${outDir}`);
  } catch (err) {
    console.error('FAILED:', err.message);
    await page.screenshot({ path: join(outDir, 'failure.png'), fullPage: true }).catch(() => {});
    writeFileSync(join(outDir, 'fill-log.json'), JSON.stringify({ fillLog, error: err.message }, null, 2));
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
})();

function tryRead(path) {
  try { readFileSync(path); return true; } catch { return false; }
}

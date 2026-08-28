---
name: playwright-draft-filler
description: Install Playwright and fill website forms with user-supplied data, saving the result as DRAFT or "Save" only — never publishing/submitting. Use when the user wants to auto-fill a form on a webpage (CMS, dashboard, listing portal, intake form, e-commerce admin, blog editor) and stop before any irreversible publish/post/send action. Triggers include "fill this form", "load my data into [site]", "save as draft", "auto-fill website", "browser automation to fill but not submit".
---

# Playwright Draft Filler

A guarded browser automation skill: install Playwright on demand, drive a real browser to fill the user's data into a target website, and stop at **Save / Save Draft** — never at Publish, Post, Submit final, Send, or Pay.

## When to use

User wants the browser to type their data into a website form (CMS post, marketplace listing, profile fields, intake form, admin panel, etc.) and leave it as a draft so they can review and publish manually. Common phrasings:

- "Fill this listing on X site with my data and save as draft"
- "Auto-fill my profile on Y but don't submit"
- "Load this product info into the admin and just save"
- "Pre-populate the form, I'll review before publishing"

## When NOT to use

- One-off scraping → use `WebFetch` or `webapp-testing`
- Real E2E test suites → use `e2e-testing` skill or `/e2e` command
- Anything where the goal is to publish/post/send/pay automatically — refuse and explain that this skill stops at save-draft by design

## Hard safety rules

1. **NEVER click Publish, Post, Send, Submit (final), Pay, Confirm Order, Place Order, Make Live, Schedule Post, Activate.**
2. **ONLY click**: Save, Save Draft, Save as Draft, Save & Continue, Save Changes, Save and Exit, Save for Later, Save Progress.
3. If a Save button is missing and the only option is Publish, **STOP** and ask the user. Do not auto-substitute.
4. **Run headed by default** (`headless: false`) so the user sees what's happening.
5. Always **pause before any Save click** with `await page.pause()` when running in `--ui`, OR print a 5-second countdown in headless-confirm mode.
6. Persist a screenshot before AND after Save into `./output/<timestamp>/` so the user has visual proof of state.
7. Never store credentials in the script. Use env vars or Playwright `storageState.json` from a manual login.

## Workflow

### Step 1 — Gather requirements (ask the user)

Before writing any code, ask in one message:

1. **Target URL** of the form/page (e.g. `https://admin.example.com/posts/new`)
2. **Login required?** If yes: do they want to log in manually once (recommended) and have us reuse `storageState.json`, or pass credentials via env vars?
3. **Data source**: inline JSON in the conversation, a `.json` / `.csv` / `.md` file path, or the user will fill `data.json` after we scaffold?
4. **Field map**: which data field maps to which form field? (We can also auto-discover by inspecting selectors first — offer this option.)
5. **Save button label** they expect to see (helps assert the right button — defaults to the safelist above).
6. **Headed or headless?** Default headed.

### Step 2 — Install (run once per project)

In the project directory:

```bash
# 1. Init if needed
[ -f package.json ] || npm init -y

# 2. Install Playwright
npm install -D @playwright/test playwright

# 3. Install browsers (Chromium only is enough for most forms)
npx playwright install chromium

# 4. Create scaffolding
mkdir -p scripts data output
```

### Step 3 — Manual login (if site requires auth)

Generate `storageState.json` once via the user's real login. This avoids ever storing passwords in code.

```bash
npx playwright codegen --save-storage=storageState.json <TARGET_URL>
```

User logs in normally in the spawned browser, then closes it. Playwright saves cookies/localStorage to `storageState.json`. Add it to `.gitignore`.

### Step 4 — Scaffold the filler script

Copy `scripts/draft-fill-template.mjs` from this skill into the project's `scripts/` and edit:

- `TARGET_URL`
- `DATA_FILE` path
- The `await fillForm(page, data)` body — one `await page.fill()` / `selectOption()` / `setChecked()` per field
- The `SAVE_SELECTOR` (must match a label from the safelist)

Always discover selectors with `npx playwright codegen <URL>` first — let the user click the actual save-draft button while recording, then copy the selector.

### Step 5 — Dry run

Run with the safety guard ON (default):

```bash
node scripts/draft-fill.mjs --dry-run
```

Dry-run fills every field but **does not click Save**. It only screenshots the filled form. User reviews `output/<ts>/before-save.png`, then re-runs without `--dry-run`.

### Step 6 — Real run

```bash
node scripts/draft-fill.mjs
```

Confirms button label matches safelist, clicks Save, screenshots after, asserts the success indicator (e.g. "Draft saved" toast), and exits.

## Selector strategy (in priority order)

1. `getByRole('textbox', { name: 'Title' })` — accessibility-first, most stable
2. `getByLabel('Description')` — works for any labeled input
3. `getByPlaceholder(...)` — fallback when labels are missing
4. `data-testid` — if the site exposes them
5. CSS / XPath — last resort, brittle

Avoid `:nth-child` and class-based selectors entirely — they break on the first redesign.

## Save-button safelist (regex used by the template)

```js
const SAVE_LABEL_SAFELIST = /^(save|save draft|save as draft|save & continue|save and continue|save changes|save and exit|save for later|save progress|guardar|guardar borrador)$/i;

const PUBLISH_BLOCKLIST = /(publish|post|send|submit|pay|confirm|place order|make live|schedule|activate|publicar|enviar|pagar)/i;
```

Before clicking, the script reads `await el.innerText()` and asserts it matches the safelist AND does NOT match the blocklist. If either check fails, throw and exit non-zero.

## Template files in this skill

- `scripts/draft-fill-template.mjs` — main filler
- `scripts/data.example.json` — example data file
- `scripts/discover-selectors.mjs` — opens codegen to help map fields

## Output structure

```
output/
  2026-04-28T19-30-00/
    before-fill.png        # blank form
    after-fill.png         # filled, before save click
    after-save.png         # post-save state with toast
    network.har            # full HAR for debugging
    fill-log.json          # per-field {selector, value, status}
```

## Failure modes & recovery

| Failure | Recovery |
|---------|----------|
| Selector not found | Re-run `discover-selectors.mjs`, update map |
| Save button label fails safelist | STOP, ask user — do not auto-click anything else |
| Auth expired | Re-run codegen step to refresh `storageState.json` |
| Validation error after fill | Screenshot `validation-error.png`, dump form state to `fill-log.json`, exit |
| Save click succeeds but no draft visible | Check post-save URL — many CMSes redirect to `/edit/<id>`. Assert URL changed |

## Reuse across runs

Once a target site has a working filler, save its config to `~/.claude/skills/playwright-draft-filler/recipes/<site>.mjs` so future runs on the same site skip the discovery phase. Recipe should export `{ url, fieldMap, saveSelector, successAssertion }`.

## Sister skills

- `e2e-testing` — full Playwright test suite patterns (different goal)
- `webapp-testing` — Playwright-driven app verification (read-only)
- `/e2e` command — generates regression tests, not data entry

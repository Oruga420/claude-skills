---
name: final-review
description: Run a complete code audit — bughunter + security-scan (AgentShield) + security-review — over a codebase, adversarially verify every finding against the real code, and emit one self-contained HTML report ranked by severity. Use when the user says /final-review, "audit this", "full security + bug review", or wants a shareable findings report.
---

# Final Review

One command that chains the three audit skills into a single verified, shareable report.
The point is not to run three tools and staple their output together — it is to run them,
then **adversarially verify each finding against the real code** so the HTML you hand over
contains defects that actually reproduce, not grep noise.

## When to activate

- User runs `/final-review` (optionally with a path or "the changes")
- "audit this", "run the full review", "bugs + security in one report"
- Before publishing a repo, shipping a risky patch, or handing code to someone else

## What it chains

| Stage | Skill | Covers |
|-------|-------|--------|
| 1 | `security-scan` | `.claude/` config via AgentShield — permissions, hooks, MCP, secrets in config |
| 2 | `bughunter` | 7 bug categories across the source (error handling, null-safety, concurrency, injection, logic, resource leaks, API) |
| 3 | `security-review` | the code-security checklist — secrets, input validation, authn/z, injection, sensitive data |
| 4 | *verification* | every candidate finding is re-checked against the real code by an adversarial pass |
| 5 | *report* | one self-contained HTML, severity-ranked, with a disputed/false-positive appendix |

If `bughunter` is not installed, fetch it first (it ships in the same skills repo):

```bash
mkdir -p ~/.claude/skills/bughunter
gh api repos/<owner>/claude-code-skills/contents/bughunter/SKILL.md --jq '.content' \
  | base64 -d > ~/.claude/skills/bughunter/SKILL.md
```

## Procedure

### Step 0 — Scope and inventory

Decide what "all the code" means and list it concretely; the fan-out needs a work-list.

```bash
# default scope: tracked source, excluding vendored dirs
git ls-files 2>/dev/null | grep -vE 'node_modules/|/dist/|/target/' || \
  find . -type f \( -name '*.mjs' -o -name '*.js' -o -name '*.ts' -o -name '*.sh' \
    -o -name '*.py' -o -name '*.go' -o -name '*.rs' \) -not -path '*/node_modules/*'
```

Identify the **highest-stakes file(s)** — the security boundary (an allowlist, an auth
check, a signer, a permission gate). That file deserves its own dedicated reviewer with a
bypass lens, separate from a correctness lens.

### Step 1 — security-scan (config)

Run AgentShield against each `.claude/` directory in scope and capture JSON:

```bash
npx -y ecc-agentshield@latest scan --path <dir>/.claude --format json > agentshield.json
```

Parse `findings[]` and the `score.grade`. These are config-hardening findings (missing deny
rules, no PreToolUse hook, secrets in `settings.json`), separate from the code findings.

### Step 2+3 — bughunter + security-review (code), fanned out

Follow the `bughunter` category checklist and the `security-review` checklist together, one
reviewer per file-group × lens. **Read the actual files** — bughunter's cardinal rule is
never to report from a grep pattern alone. Group by concern, not alphabetically:

- the security-boundary file → a **bypass** reviewer *and* a **correctness** reviewer
- secret-handling / signing code → a **leak + crypto** reviewer
- shell / infra scripts → an **injection + quoting** reviewer
- anything that publishes or sanitizes → a **does-the-redaction-hold** reviewer

For a large or high-stakes codebase, run this as a **Workflow** (ultracode): `pipeline` over
the groups so each group's findings verify the moment its review lands, no barrier. A saved,
working script lives at `references/review-workflow.mjs` in this skill — adapt its GROUPS.
For a small diff, do it inline.

Each reviewer returns structured findings: `title, file, line, severity, category,
description, failure_scenario (concrete input → wrong/unsafe outcome), fix`.

### Step 4 — adversarial verification (the part that matters)

Every candidate finding gets an independent skeptic that **opens the file, reads the real
code around the line and its callers**, and tries to *refute* it:

- security claim → produce the concrete exploit input, or show what blocks it
- bug claim → produce the concrete failing input, or show why it cannot occur
- default to FALSE_POSITIVE when the defect cannot be demonstrated reachable

Only findings that survive with verdict CONFIRMED go in the main report; the rest go in a
"disputed / false-positive" appendix (kept, not deleted — a future reader deserves to see
what was considered and why it was dropped).

### Step 5 — the HTML report

Load the `artifact-design` skill first, then write one **self-contained** HTML file (inline
CSS/JS, theme-aware, no external requests). Structure:

- header with the verdict at a glance: counts by severity, AgentShield grade
- the AgentShield config findings (their own section)
- the confirmed code findings, ranked critical → low, each with: location, what breaks
  (the failure scenario), the fix, and the verifier's confidence
- an appendix of disputed findings with the reason each was dropped
- footer noting scope, date, and that every finding was adversarially verified

Publish it as an Artifact and hand over the URL, or save it next to the code — the user's call.

## Notes

- **Never delete a finding silently.** Downgrade or dispute it in the open.
- Severity is judged against the *threat model of this codebase*, not in the abstract — a
  string-split bug in an allowlist that gates shell execution is critical; the same bug in a
  log formatter is low. State the threat model to every reviewer.
- The three source skills are the checklists; this skill is the orchestration + the
  verification gate + the report. Keep them installed and current.
- Faithful to the run that created this skill: `security-scan` was AgentShield on the
  `.claude/` config; `bughunter` + `security-review` were fanned out over the source with a
  per-finding adversarial verifier before anything reached the HTML.

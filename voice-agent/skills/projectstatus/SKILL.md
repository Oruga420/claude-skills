---
name: projectstatus
description: Create or update projectstatus.html, an executive status page for the current project (what is built, what is missing, tests passing, dev time, tokens consumed). Use when the operator says "/projectstatus", "status del proyecto", "executive status", or asks for a project status HTML.
---

# /projectstatus - Executive status page (create or update)

Generates or refreshes `projectstatus.html` at the ROOT of the target project. It is a LOCAL file: never deploy it, never publish it as an artifact, never push it anywhere. Everything on the page must be MEASURED, not estimated; every number needs a source.

## Phase 0 - Resolve the project

The target is the project the session is anchored to (an explicit project the session was resumed into wins). If the session has no clear project, ask which one. All commands run from the project root.

## Phase 1 - Gather the data (all measured)

1. **Git:** `git log --format='%ad' --date=short | sort | uniq -c` for active dev days and commit count; first and last commit for the calendar span; `git log -1` for HEAD hash and date; `git status --short` for uncommitted work.
2. **Tests:** run the project's real test command (jest, pytest, etc.) FRESH, never quote a stale number. Record suites, passed, failed, skipped. Note documented skips.
3. **What is built / missing:** read the project's wiki (`wiki/log.md`, `wiki/overview.md` if the project's memory harness has one), the risk register, and the phase or roadmap doc. Built = shipped and verified. Missing = phases not started, open risks, known debt. Report debt honestly, never hide it.
4. **Dev time:** find the Claude Code session JSONLs under `~/.claude/projects/<project-dir>/*.jsonl`. If the project has no own dir (sessions ran from HOME), scan `~/.claude/projects/<home-dir-encoded>/*.jsonl` for files mentioning the repo folder name and keep only sessions with HEAVY mention counts (real work), not incidental ones (memory recall noise). Active time = sum of gaps under 30 minutes between event timestamps per session.
5. **Tokens:** from those same core session JSONLs, sum `message.usage` fields: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. Report the four buckets plus the total. State the methodology and the wider upper bound (all sessions that mention the repo) in a footnote. NEVER let the model guess token counts from memory (LLMs cannot self-report usage).

## Phase 2 - Write the page

- File: `<project-root>/projectstatus.html`. If it exists, REGENERATE it fully with fresh numbers (same structure, updated data); do not append.
- Theme: the project's own visual theme if it has one. Otherwise clean neutral.
- Sections, in order: header (generated date, HEAD, commit count, branch), stat band (phases, tests, dev days, active hours, tokens, blockers), What is built, Verification (automated + reviews), What is missing (gated phases + known debt), Effort and consumption (time table + token table with methodology notes), Blockers and dates (owner + status pill + why it matters).
- House rules: English. NEVER em dashes or en dashes.

## Phase 3 - Close

- **Open it in the browser** as soon as the file is written and verified. Windows: `start "" "<project-root>/projectstatus.html"`. macOS: `open <path>`. Linux: `xdg-open <path>`. It is a local `file://` open, so it works even when the project's own server is off. Do this before committing so the operator sees it immediately.
- If the project is a git repo, commit the file (unless the project's rules gate commits; then leave it uncommitted and say so).
- If the project has a memory-harness wiki, append one line to `wiki/log.md` noting the status refresh.
- Tell the operator the file path and the headline numbers in a short summary.

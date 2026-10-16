---
name: projectstatus
description: Living per-project status snapshot, updated at every breakpoint. Records where a project stands right now — phase, health, what's done, what's next, what's blocked, decisions taken — as markdown plus an HTML page. Use when the user runs /projectstatus, asks "where does this project stand", "cómo va el proyecto", "estado del proyecto", "update the status", OR automatically at every breakpoint when your CLAUDE.md carries the breakpoint rule (plan point finished, feature verified, deploy succeeded, direction changed, blocker hit, session wrapping up). Works in any project, global like /ultraplan.
---

# /projectstatus — Living Project Status

One question, answered honestly, always current: **where does this project stand right now?**

Two artifacts, same as the `/ultraplan` rule: markdown (durable, diffable) and an HTML page
(what a human actually reads). The markdown is the source of truth; the HTML is rendered from it.

## Requirements

- Nothing to install: the fallback HTML template ships in `assets/`. No API keys, no accounts.
- Optional: a `report-it` skill (repo-local or global) if you have one; it is used first when present.
- Optional, for automatic updates: a breakpoint rule in your `~/.claude/CLAUDE.md` (or the project's
  `CLAUDE.md`), for example:

  ```markdown
  ## Breakpoints
  A breakpoint is a moment where real progress becomes worth saving: a plan point finished, a
  feature verified working, a deploy that succeeded, a change of direction, a blocker hit, or the
  session wrapping up. At every breakpoint, save the work and run `/projectstatus` without asking.
  ```

## When to activate

- The user runs `/projectstatus`, or asks how a project is going / to update the status.
- **Automatically at every breakpoint**, when the breakpoint rule above is in your `CLAUDE.md`.
  No permission needed, no waiting to be asked.

If the session is not inside a project (opened in the home directory or another folder with no
repo), there is no project status to write. Say so and use `/logit` instead, if installed.

## Where the files live

Resolve once per project, then stay consistent:

| Project shape | Markdown | HTML |
|---|---|---|
| Has a project wiki (`.claude/wiki/` exists) | `.claude/wiki/PROJECT_STATUS.md` | `docs/reports/project-status.html` |
| No wiki | `PROJECT_STATUS.md` (repo root) | `PROJECT_STATUS.html` (repo root) |

Create missing directories. If a `PROJECT_STATUS.md` already exists somewhere else in the
project, use that one instead of starting a second — one status file per project, ever.

In a wiki repo, carry the wiki's own frontmatter convention (`**Last updated:** / **Tags:** /
**Related:**`) at the top of the markdown so it lints clean with the rest of the wiki.

## The markdown format

Two zones, and the distinction is the whole point:

- **Snapshot** (`Where it stands` → `Decisions`) is **rewritten in place** every update. It
  always describes the present. Stale lines get deleted, not appended to.
- **Breakpoint log** is **append-only**. Never rewrite or delete a past entry.

```markdown
# Project status — <project name>

**Last updated:** YYYY-MM-DD HH:MM
**Phase:** <one line: what stage the project is actually in>
**Health:** green | yellow | red — <the reason, in a few words>

## Where it stands

<3-6 lines, plain language. What works, what doesn't, what a new session needs to know
before touching anything. No cryptic codes.>

## Done

- <shipped AND verified, newest first — how it was verified in parentheses>

## Next

- <the immediate next actions, in the order they should happen>

## Blocked

- <blocker> — waiting on <who or what>

## Decisions

| Date | Decision | Why |
|---|---|---|
| YYYY-MM-DD | <what was decided> | <the reason it beat the alternative> |

## Breakpoint log

### YYYY-MM-DD HH:MM — <title>
- What: <what moved>
- Files: <files touched>
- Verified: <the command/test/observation that proves it, or "not verified">
- Next: <the immediate next step from here>
```

Drop a snapshot section entirely if it is genuinely empty — an empty `Blocked` heading is
better deleted than filled with "none". Never invent entries to make the file look complete.

## The HTML page

Resolve the renderer in this order, first one found wins — same chain as `/ultraplan`:

1. **Repo-local report-it** — `.claude/skills/report-it/scripts/fill_shell.py` in this repo.
   Use it so status pages and plan pages read as one system.

   ```bash
   python .claude/skills/report-it/scripts/fill_shell.py \
     --spec <spec>.json --out docs/reports/project-status.html
   ```

2. **Global report-it** — same script under `~/.claude/skills/report-it/`, same usage.

3. **Fallback template** — `assets/status-template.html` next to this SKILL.md. Copy it to the
   HTML path and fill every `{{PLACEHOLDER}}`; the HTML comments say what goes where. Do not
   restyle it and do not hand-write status HTML from scratch — this template IS the fallback style.

   **Fill it with the Write tool, not with PowerShell.** Windows PowerShell 5.1 reads a UTF-8
   file with no BOM as ANSI, so a `Get-Content`/`Set-Content` round-trip turns every non-ASCII
   character into mojibake (`—` becomes `â€"`). The template is pure ASCII to survive that, but
   the *content you inject* usually isn't — accented Spanish, arrows, dashes. If you must fill
   it from PowerShell, do the IO explicitly:
   `[IO.File]::ReadAllText($p, [Text.UTF8Encoding]::new($false))` and
   `[IO.File]::WriteAllText($o, $s, [Text.UTF8Encoding]::new($false))`.

   Then verify before handing it over: grep the output for `Ã`, `â€`, and leftover `{{`. Any hit
   means the page is broken — fix it, don't ship it.

Option 3 always exists, so an HTML page always ships. "report-it not found" is never a reason
to skip the HTML.

Mapping onto report-it blocks, when that path is taken:

| Status part | Block type |
|---|---|
| Phase + health | `decision` (phase left, health verdict right) |
| Counts (done, next, blockers, breakpoints) | `tiles` |
| Where it stands | open `text` panel |
| Next | `stages` — `done` / `blocked` / `waiting` / `todo` |
| Done, Decisions | `table` |
| Blocked | `cards` with `priority` |
| Breakpoint log | `table`, newest row first |

## Opening it in the browser

The HTML is **rewritten on every breakpoint** so it is never stale, but the browser opens only:

- when the user invokes `/projectstatus` explicitly, or
- when the session is wrapping up (user says they're done, closing, "cierra", end of work).

Never auto-open on a routine mid-session breakpoint — a long session would fire eight tabs.

```bash
# Windows (PowerShell):  Start-Process "<abs-path>\project-status.html"
# Windows (Git Bash):    cmd.exe /c start "" "<abs-path>/project-status.html"
# macOS:                 open "<abs-path>/project-status.html"
# Linux:                 xdg-open "<abs-path>/project-status.html"
```

If the open command fails, say so and print the absolute path — never skip the attempt silently.

## Four rules that keep a status file honest

- **Verified or it isn't done.** An item moves to `Done` only with the command, test, or
  observation that proves it. Anything else stays in `Next`, or lands in `Done` with an
  explicit "not verified" note. A status file that reads green while the build is broken is
  worse than no status file.
- **Health is the operator's early warning.** `yellow`/`red` with a real reason beats a
  permanent optimistic `green`. If work is blocked, health is not green.
- **The snapshot is present tense.** If a line no longer describes reality, delete it. Growth
  belongs in the breakpoint log, not in the snapshot.
- **Plain names, no cryptic codes.** No `M3`, no `C1`. Describe the thing.

## Composing with the other rules

`/projectstatus` is the snapshot; `/logit` is the bitácora; `/ultraplan` is the forward plan.
At a breakpoint, update the status here, and let `/logit` (if installed) write its own entry if it is
active for the session. When an `/ultraplan` exists for the current work, link to it from
`Where it stands` rather than restating its phases.

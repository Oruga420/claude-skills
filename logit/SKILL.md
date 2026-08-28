---
name: logit
description: Work-session logger. Records every completed work task — and every completed plan point on complex tasks — to a daily markdown log at ~/.claude/logit/ AND to memory (Mempire for father/Desktop sessions, MemPalace for project sessions). Use when the user says /logit, "log it", "loggea esto", "loguealo", OR when a NEW work task starts in a session where logging hasn't been offered yet — ask once whether /logit should be active for the session. Only work stuff gets logged, never personal tasks.
---

# /logit — Work Logger

Log what got done, as it gets done. Two paths depending on task complexity, one entry format, two destinations.

## Rules contract (non-negotiable)

1. **Only work stuff.** Log work tasks only: client projects, dev/infra work, work research. Personal tasks are NEVER logged. If it's unclear whether a task is work, ask before logging.
2. **Ask once per session.** The first time a new work task shows up in a session where logging hasn't been offered yet, ask: "¿Activo /logit para esta sesión?"
   - **Yes** → logging is active for the rest of the session; follow the paths below for every work task.
   - **No** → don't log, don't ask again this session.
   - An explicit `/logit` from the user always activates it (and logs the current/last task immediately).

## Where entries go (both, always)

1. **Daily markdown log:** append to `~/.claude/logit/YYYY-MM-DD.md`. Create the folder and the day's file if missing. Entries are appended chronologically — never rewrite previous entries.
2. **Memory:**
   - **Project session** (cwd inside a project with MemPalace) → save the entry to that project's MemPalace (diary write or drawer in the project's wing).
   - **Father/Desktop session** → save to Mempire (`mempire_diary_write` or `mempire_capture_observation`).
   - If the memory MCP tools aren't available, still write the markdown entry — the file is the source of truth; note `memory: skipped` in the entry.

## Path 1 — Simple task

```
New task → work it → done? → /logit entry → done
```

Work the task normally. When it's done, write ONE entry (type `task`).

## Path 2 — Complex task (via /ultraplan)

```
New task → /ultraplan → /logit the plan → plan yes/no? → go
   → point done → /logit entry → go ahead (next point)
   → all points done → /logit closing entry
```

1. Task is complex enough for deep planning → run `/ultraplan`.
2. Log the resulting plan as one entry (type `plan`): goal + numbered points.
3. Ask the user **yes/no** on the plan.
4. On go: execute point by point. **Every point completed** gets its own entry (type `plan-point`) saved immediately, then go ahead to the next point.
5. When all points are done: closing entry (type `plan-complete`) with outcome + verification.

**Choosing paths:** Path 2 when the task warrants /ultraplan (multi-component, novel, risky). Path 1 for everything else.

## Entry format

```markdown
## [HH:MM] <task title>
- Type: task | plan | plan-point | plan-complete
- Project: <folder / repo name>
- What: <1–3 lines: what was asked and what was done>
- Files: <files touched, if any>
- Outcome: <result, verification, or pending>
```

The same content goes to memory as one entry per log entry. Keep titles plain and descriptive — no cryptic codes.

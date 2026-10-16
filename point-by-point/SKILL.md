---
name: point-by-point
description: "The 5-line rule. Use AUTOMATICALLY whenever what you have to tell or resolve with the user would take more than 5 lines: break it into points, save them in the project's 'our pendings' (a dated HTML in the project root + an optional project wiki page), and present ONE point at a time in 5 lines or fewer. When a point closes, strike it through as done and move to the next. A new dated file each day, only if there are open pendings (open ones carry over). Also triggers on /point-by-point, 'punto por punto', 'qué nos falta', 'pendientes'."
trigger: "/point-by-point"
---

# /point-by-point: one point at a time, never more than 5 lines

The rule: the user gives you about 5 lines of attention per message; anything longer will not be read. Long answers cause
real misunderstandings (a decision buried in paragraph four gets missed, and the wrong thing gets merged). This skill is
the escape valve: when something does not fit in 5 lines, it does not become a long message. It becomes a list of points
on disk, and the chat carries one point at a time.

## Requirements

- Python 3.8+ (standard library only). The CLI is bundled: `scripts/pbp.py` next to this SKILL.md.
- No API keys, accounts or network access.
- Optional: a project wiki folder (for example `.claude/wiki/` or `wiki/`) if you want the living `our-pendings.md`
  index page. Without one, only the dated HTML and its JSON are written.

## When it fires

- **Automatically**, before sending any reply that would run past 5 lines about things to resolve (findings, decisions, blockers,
  follow-ups). Write the points to disk first, then send only the first point.
- On `/point-by-point`, "punto por punto", "qué nos falta", "¿qué sigue?", "pendientes".
- **Not** for a direct order that fits in one line ("merge X", "close Y"). Do it, or say in ONE line why not plus the question.

## Where it lives (per project, the one the session is anchored to)

| What | Path |
|---|---|
| Source of truth (one per day) | `<root>/.claude/pendings/our-pendings-YYYY-MM-DD.json` |
| Physical HTML, dated, in the project ROOT | `<root>/our-pendings-YYYY-MM-DD.html` |
| Wiki page (optional), living, links every day | see "Wiki page location" below |

Everything is written by the CLI, never by hand. Point `PBP` at the bundled script wherever you installed this skill
(default install path shown):

```bash
PBP="python $HOME/.claude/skills/point-by-point/scripts/pbp.py"
$PBP add   --root <root> --title "..." --why "..." --blocks "..." --impact "..." --ask "..." [--owner <name>]
$PBP next  --root <root>            # prints the current open point, already in <=5 lines
$PBP done  --root <root> --id N [--note "how it closed"]
$PBP edit  --root <root> --id N [--title ...] [--ask ...] [--owner <name>]
$PBP list  --root <root>
$PBP render --root <root>           # re-writes the HTML + wiki page (add/done already render)
```

`--owner` is free text: whoever owns the ask (the user, a teammate's name or role, or `Claude`).

On Windows run it with `PYTHONUTF8=1`.

### Wiki page location

The living index `our-pendings.md` is written to the first match:

1. `--wiki <dir>` on the command (created if missing).
2. `PBP_WIKI_DIR` env var, absolute or relative to `--root` (created if missing).
3. `<root>/.claude/wiki/` if it already exists.
4. `<root>/wiki/` if it already exists (Karpathy-style layout).

None of those: no wiki page, just the HTML. `--no-wiki` or `PBP_WIKI_DIR=none` turns it off explicitly.

## The daily file

- First pending of the day: the CLI creates today's file and **carries over every open point** from the most recent previous day.
  (Their original date stays on the point.)
- No open pendings: no file for that day. A day with nothing open produces nothing.
- Done points stay in the file, struck through with DONE and the note, so the day reads as a record.

## How to write a point (the 5 lines)

Order points by **what blocks the most first** (report by blocker, one topic at a time). Each point, in chat, is:

1. **Title:** what it is, in plain words.
2. **Why we look at it.**
3. **What it blocks.**
4. **Impact and blast radius.**
5. **The ask:** the one decision or action needed from the user (or "I'll do X, OK?").

Then STOP and wait. No second point in the same message. After the user answers, act, run `done` if it closed, and send
`next` in the following message.

## Rules

- Never more than 5 lines in the chat reply, this skill's own messages included. Detail goes to the file, not the chat.
- A point is DONE only when it is actually resolved (merged, posted, decided, measured), not when it was mentioned.
- When a point turns out to be several, `add` the new ones and close or rewrite the original. Never pile two topics into one point.
- In a project with `/logit` or `/projectstatus` active (if installed), a closed point that is a breakpoint still triggers
  those as usual.
- Open the HTML only when the user asks for it, with the OS default opener:
  `Start-Process "<root>\our-pendings-YYYY-MM-DD.html"` (Windows), `open <file>` (macOS), `xdg-open <file>` (Linux).

---
name: livetrack
description: Live progress board for whatever is being worked on right now — a project, a Jira ticket, or a single task. Once started it stays active for the rest of the session: every task started, every task finished, every decision taken, every blocker hit or cleared, and everything that needs the operator's input gets written to a self-refreshing HTML board with a progress bar per task, the objective and summary of each one, blockers, unblocks and open questions. Use when the user runs /livetrack, says "trackea esto", "track this ticket", "quiero ver el avance en vivo", "hazme el board", or hands over a ticket/task and wants to watch it move while Claude works.
---

# /livetrack — Live progress board

`/projectstatus` answers *where does this project stand* at a breakpoint. `/livetrack` answers
**what is happening right now, this minute** — a board the operator leaves open in a browser tab
while Claude works, that updates itself without being asked.

Two files, one per track:

| File | Role |
|---|---|
| `<dir>/<slug>.json` | source of truth, structured, mutated only through the CLI |
| `<dir>/<slug>.html` | the board — self-contained, reloads itself from disk every 10s |

The HTML re-renders on **every** mutation, and the page reloads itself, so an open tab shows
progress live. That is the whole point of this skill: the operator never has to ask "how's it going".

## The one tool you use

```bash
python "$HOME/.claude/skills/livetrack/scripts/livetrack.py" --root "<abs project root>" <command>
```

PowerShell: same, with `$HOME` or the literal `C:\Users\<you>`. Always pass `--root` with an
absolute path — shell state does not survive between tool calls, so never rely on `cd` or on an
exported variable sticking around.

Never hand-edit the json and never hand-write the HTML. Every command below rewrites both
atomically and prints a one-line receipt (`ok | overall 42% | health yellow | 1 waiting on the operator`).
`--slug <name>` keeps parallel tracks apart; the default slug is `current`.

## Where the files live

| Session shape | Directory |
|---|---|
| Inside a project | `<project root>/.claude/livetrack/` |
| Father / Desktop session, no project | `~/.claude/livetrack/` |

If a track already exists for this work, **resume it** — run `show` and keep going. One track per
piece of work, ever. A second `init` on the same slug is refused unless `--force` is passed, which
throws the history away; prefer a new `--slug`.

## Starting a track

Do this as soon as the work is understood — after the plan exists, before the first edit.

```bash
livetrack.py --root "<root>" init \
  --title "Fix rate sync on the booking adapter" \
  --kind ticket --ref ABC-412 --ref-url "https://..." \
  --objective "Rates land in the pricing service with no lag" \
  --summary "Plain language: what this work is and why it exists." \
  --scope-out "other PMS adapters|scheduler refactor"
```

`--kind` is one of `project | ticket | task | feature | bug`. Then add every task you already know
about, in the order they should happen:

```bash
livetrack.py --root "<root>" task add \
  --title "Reproduce the failure" \
  --what "Run the adapter against the test account" \
  --objective "See the Cloudflare challenge in the logs" \
  --steps "read logs|run adapter|capture screenshot" \
  --start
```

`--what` is what the task *is*; `--objective` is **what done looks like**. Both show on the card —
fill them, that is the information the operator actually reads. `--steps` is a pipe-separated
checklist that drives the progress bar automatically. Tasks get ids `T1`, `T2`, … printed on the
receipt.

Then open the board **once**, and tell the operator to leave the tab open:

```bash
livetrack.py --root "<root>" open
```

## The update contract

This is the skill. Fire one command the moment the thing happens — never batch at the end of the
session, never "I'll update the board later". Each call is a couple hundred milliseconds.

| The moment | The command |
|---|---|
| Starting a task | `task start T2 --note "why now"` |
| A checklist step lands | `task step T2 1` (1-indexed; `--undo` to reopen) |
| Real movement, no checklist | `task progress T2 60 --note "test written, still red"` |
| Task finished **and verified** | `task done T2 --verified "pytest -k rate_sync passes"` |
| New work discovered mid-flight | `task add --title "..." --what "..." --objective "..."` |
| Task no longer makes sense | `task drop T3 --why "superseded by T5"` |
| **You took a call the operator did not** | `decision --what "..." --why "..." --instead-of "..." --task T2` |
| Hit something you cannot pass | `block --what "..." --owner operator --needs "exactly what clears it" --task T2` |
| It got cleared | `unblock B1 --how "the operator supplied the creds"` |
| Only the operator can answer this | `ask --question "..." --why "what it changes" --options "a\|b" --task T2 [--blocking]` |
| The operator answered | `answer A1 --answer "staging"` |
| Anything worth knowing but not a task | `note --text "..." [--task T2]` |
| Confidence changed | `health yellow --note "login still flaky"` |

Everything above also lands on the timeline automatically, so the timeline is a byproduct — never
log the same event twice.

### Decisions are not optional

Every judgment call Claude makes on its own — a library picked, an approach abandoned, a
"reasonable default" assumed, an interpretation of an ambiguous requirement — is a `decision` with
its `--why`. That is precisely the class of thing an operator discovers three days later and
wishes had been written down. If you caught yourself thinking "I'll just assume X", that is a
decision; if it could have gone either way, add `--instead-of`.

### The board never replaces talking

Filing an `ask` writes it to the board; it does **not** ask the operator. Always do both:

- **Blocking** (work stops until answered): file the ask, then use `AskUserQuestion` in chat.
- **Non-blocking** (you can proceed on a stated assumption): file the ask, also record the
  assumption as a `decision`, keep working, and raise it in your next message.

Same for blockers: `block` records it, your message says it out loud.

## Keeping it honest

The board is worth exactly as much as it is trustworthy, so:

- **`done` needs proof.** `--verified` takes the command, test, or observation that proves it. No
  proof, no `done` — leave it at `progress 90`. A card marked done with no verification renders a
  loud **not verified** on the board, which is the point.
- **Progress is evidence, not vibes.** Prefer `--steps` and tick them; a derived bar cannot be
  wishful. Only use `task progress` for work that has no clean checklist, and never move a bar
  because time passed.
- **Health is an early warning.** Open blocker or open blocking ask means health is not green.
  Left unset, health is derived automatically — set it explicitly the moment you know better than
  the derivation.
- **Plain names.** No `M3`, no `C1`. Task titles describe the thing.
- **No filler.** Skip `--what`/`--objective` rather than restating the title. Empty sections do not
  render at all, which is better than a section full of "none".

## Re-orienting (compaction, new session, "where were we")

```bash
livetrack.py --root "<root>" show
```

Prints the whole state as a few compact lines — tasks with status and percent, open blockers, open
asks. Cheap enough to run at the top of any session that touches this work, and the first thing to
run after a context compaction: it is the fastest possible recovery of what was in flight.

## Closing a track

When the work is finished: last `task done`, `health green --note "shipped"`, then a final
`open` so the operator sees the finished board. Leave the files in place — the json is the record
of how the work actually went, including every reversal.

## How this composes with the other rules

| Skill | Cadence | Answers |
|---|---|---|
| `/livetrack` | continuously, minutes | what is happening right now |
| `/projectstatus` | every breakpoint | where this project stands |
| `/logit` | each task or plan point done | what was done, and when |
| `/ultraplan` | before implementing | what the plan is |

`/livetrack` does **not** replace the breakpoint rule in `~/.claude/CLAUDE.md`. At a real
breakpoint, still run `/projectstatus` (and `/logit`, if active) — the live board is intra-session
and per-task, the status file is durable and per-project. When both exist, keep them consistent:
whatever the board says is `done` and verified is what `/projectstatus` may list under Done.

When an `/ultraplan` exists, seed the tracks from its phases (one task per plan point, plan point
steps as `--steps`) instead of inventing a second breakdown.

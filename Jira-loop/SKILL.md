---
name: Jira-loop
description: Watch one or more Jira tickets on a recurring loop via the Atlassian CLI (acli). Each pass reads the ticket status + comments, detects changes since the last pass, researches the open question, and writes a per-ticket Markdown answer file (title = ticket + question, body = question + proposed answer, plus a code-change implementation plan when one is needed). Use when the user runs /Jira-loop or asks to keep an eye on / monitor / babysit / watch Jira ticket(s).
origin: custom
invocation: /Jira-loop
---

# Jira Loop

Keep an eye on one or more Jira tickets. On every pass: pull the live status and
comments, figure out what changed, research the latest open question, and drop a
researched answer into a Markdown file (one file per ticket). The loop re-arms
itself so it keeps watching until the operator stops it.

This skill does NOT post anything to Jira. It only reads. Output is local
Markdown the operator reviews and sends themselves.

## When to Activate

- The operator runs `/Jira-loop`.
- "Keep an eye on PROJ-123", "watch these tickets", "monitor my Jira", "babysit ticket X".
- Any recurring Jira-status-checking request.

## Prerequisites (check once, fail loud)

1. `acli` must be on PATH and authenticated:
   ```bash
   acli jira auth status
   ```
   Expect `✓ Authenticated`. If not, tell the operator to run `acli jira auth login`
   and stop. Do not try to guess credentials.
2. The Atlassian CLI uses **work item** terminology: a Jira ticket is a `workitem`.
   - Read a ticket:    `acli jira workitem view KEY --json --fields "key,summary,status,assignee,priority,updated,description"`
   - List comments:    `acli jira workitem comment list --key KEY --json --paginate --order +created`

## Step 0 — Ask which tickets to watch

When the skill is invoked WITHOUT ticket keys, ask the operator first:

> Which ticket(s) should I keep an eye on? Give me the keys (e.g. `PROJ-42`,
> `PROJ-43`). I'll watch status + comments and write a researched answer file for
> each whenever something changes.

Also ask, if not already known, the **poll interval** (default: 10 minutes).
Accept a comma/space separated list of keys. Validate each key looks like
`[A-Z][A-Z0-9]+-\d+`. Store the watch list and interval for the run (the
re-arm step below carries them forward in the /loop prompt).

If invoked WITH keys (e.g. `/Jira-loop PROJ-42 PROJ-43`), skip the question and use them.

## Output location

All files go under the current project's `.claude/scratchpad/jira/`:
- Answer files:  `.claude/scratchpad/jira/<TICKET>-<slug>.md`
- Watch state:   `.claude/scratchpad/jira/.state/<TICKET>.json`

`<slug>` is a kebab-case slug of the question (first ~8 words, lowercased,
non-alphanumerics → `-`). Create the directories if missing.

If there is no `.claude/scratchpad/` in the cwd (skill run outside an Iris-style
project), fall back to `./jira-loop/` in the cwd and tell the operator where the
files landed.

## The loop — what one pass does

For EACH watched ticket key, run these steps. Do all the reads first (they're
independent — batch the `acli` calls in parallel), then process.

### 1. Pull live state

```bash
acli jira workitem view <KEY> --json --fields "key,summary,status,assignee,priority,updated,description"
acli jira workitem comment list --key <KEY> --json --paginate --order +created
```

Parse out:
- `summary`         ← `.fields.summary`
- `status`          ← `.fields.status.name` (e.g. "In Progress", "To test", "Done")
- `updated`         ← `.fields.updated`
- `description`     ← `.fields.description` is **ADF** (Atlassian Document Format).
  Walk `.content[]` recursively and concatenate every node where `.type == "text"`
  into plain text. `inlineCard` nodes carry a URL in `.attrs.url` — keep it.
- comments          ← `.comments[]`, each `{ id, author, body, visibility }`.
  `body` here is already plain text (not ADF). `isLast`/pagination is handled by
  `--paginate`.

### 2. Detect change vs last pass

Read `.claude/scratchpad/jira/.state/<KEY>.json` if it exists. Shape:
```json
{ "status": "In Progress", "last_comment_id": "55828", "seen_comment_ids": ["44869","..."], "answered_at": "<iso>" }
```

A ticket NEEDS WORK this pass when ANY of:
- No state file yet (first time we see it).
- `status` changed since last pass.
- There are comment ids not in `seen_comment_ids` (new comments).

If nothing changed, log one line (`PROJ-42: no change (In Progress, 0 new comments)`)
and move to the next ticket. Do not rewrite the MD.

### 3. Identify "the question"

The thing to answer is the most recent **inbound** request, i.e. the newest
comment that is NOT authored by the operator and
reads as a question or ask. If the newest activity is a status change with no
question, treat the question as: "Status moved to <X> — what's the next action / is
anything blocking?" If the newest comment IS from the operator, there's usually
nothing to answer; note that and skip writing unless status changed.

State the question in one sentence at the top of the MD.

### 4. Research

Investigate enough to answer well. Pull from whatever is relevant and available:
- The repo (Grep/Glob/Read) — specs, adapters, wiki under `.claude/wiki/`, prior
  session logs in `.claude/wiki/log.md`.
- MemPalace if the project has it: `mempalace_search "<ticket terms>"` for verbatim
  recall of what was tried before. (projects wired to a memory harness have this.)
- Earlier comments on the same ticket for context on what's already been said.
- Project DB skills (e.g. `<project>-db-staging` / `-prod` / `-dev`) only if the
  question genuinely needs a live data check, and follow each skill's read-only rules.

Keep it grounded — cite files as `path:line` and quote the comment you're answering.
Do not invent facts. If you can't answer confidently, say what's blocking and what
you'd need.

### 5. Write the answer file

Path: `.claude/scratchpad/jira/<KEY>-<slug>.md`. Overwrite if it exists (the file
always reflects the latest question). Use this structure:

```markdown
# <KEY> — <the question, trimmed to a title>

- **Ticket:** <KEY> — <summary>
- **Status:** <status>
- **Asked by:** <comment author>
- **Last updated (Jira):** <updated>
- **Generated:** <iso timestamp from the loop run>

## Question

<verbatim the comment / ask being answered>

## Proposed answer

<the researched answer, written in the operator's voice per the message-voice
rule when this is destined to be sent: short, human, lead with the point, no
restating their side, no flattery, no em dashes. Cite files as path:line.>

## Implementation plan (only if a code change is needed)

<Omit this whole section when no code change is required. When one is:
ordered steps, files to touch (path:line), the approach, tests to add, and any
risk / ADR to respect. This is a PLAN, not applied changes — never edit code
from inside this loop.>

## Sources

- <file path:line / mempalace drawer / comment id used>
```

Title rule (operator's spec): the MD title is the **ticket number + the
question**. Filename is `<TICKET>-<slug>`.

### 6. Update state

Write `.claude/scratchpad/jira/.state/<KEY>.json` with the current `status`,
the newest comment id as `last_comment_id`, the full `seen_comment_ids` list,
and `answered_at` = now. This is what makes the next pass detect change.

## End of pass — report and re-arm

After processing all watched tickets, print a compact summary:

```
Jira loop pass @ <time>
  PROJ-42  In Progress   1 new comment   → wrote PROJ-42-short-slug-of-the-question.md
  PROJ-43  To test       no change       → skipped
Next pass in <interval>.
```

Then re-arm the loop by calling **ScheduleWakeup** with:
- `delaySeconds` = the chosen interval in seconds (default 600; clamp 60–3600).
  For short intervals (≤ 4 min) stay under 270s to keep the cache warm; otherwise
  pick the interval the operator asked for.
- `prompt` = the literal `/Jira-loop <space-separated watch list>` so the next
  firing repeats with the same tickets (e.g. `/Jira-loop PROJ-42 PROJ-43`).
- `reason` = one line, e.g. "watching PROJ-42, PROJ-43 for status/comment changes".

If the operator said "stop" / "that's enough", do NOT call ScheduleWakeup — that
ends the loop.

## Guard rails

- **Read-only on Jira.** This skill never calls `acli jira workitem comment create`,
  `edit`, `transition`, or any mutation. It reads and writes local Markdown only.
- **No PII to git or logs.** Comment bodies may contain guest data; the MD files
  live under `.claude/scratchpad/` (gitignored / not pushed). Never echo emails or
  guest names into commit messages or wiki pages.
- **Never edit code from the loop.** Code changes are written as a *plan* in the MD.
  The operator applies them in a separate, deliberate session.
- **Stop means stop.** If the operator interrupts mid-loop, halt; the /loop
  "continue" hook is not the operator speaking.
```

# {loop-name} — contract

<!-- This file is the loop's constitution, memory and history in one place.
     The agent is woken up with this file as its prompt. The last thing every
     run does is update ## State and append to ## Logs. -->

## Goal

{One paragraph: what winning looks like. Name the ONE metric or observable
outcome. Say explicitly whether there is a finish line or this is a monitor.
Include the clean-stop clause, e.g.: "A run that finds nothing to do and only
refreshes statuses/reports the score is a successful run, not a wasted one."}

## Boundaries

<!-- The walk-away section. Every rule must be testable by a reviewer. -->

**Can ship alone:**
- {concrete tier, e.g. "docs-only PRs", "mechanical fixes confined to 1–2 files with green CI + verification evidence"}

**Must escalate to human (and how):**
- {e.g. "anything touching runtime behavior/UX, 3+ files, auth, billing, migrations → open PR and WAIT"}
- {e.g. "messages to segment X → draft + wait for approval"}

**Never (via negativa):**
- Never {rule 1 — e.g. "rewrite accurate work to look busy; nothing stale found = clean stop"}
- Never {rule 2 — e.g. "open a new PR while a previous one from this loop is still unmerged"}
- No PR/action without verification evidence: {what evidence counts — test output / screenshot / video / score}

## SOP

1. {Read the work source — use the cursor in ## State, never re-read the world}
2. {Find + prioritize the work}
3. {Execute — one agent, or spawn executor sub-agents in isolated worktrees for parallel/high-stakes work}
4. {Verify for real — run the commands, test the flow, capture evidence; never trust memory}
5. {Ship per Boundaries tier — self-merge / PR / draft for approval}
6. Write the run to State + Logs. If there was nothing to do: log the clean stop and end the session.

## State

<!-- Durable picture only. Keep small on purpose — prune during evolve runs. -->

- Cursor: {last commit sha / last email id / last scan score — REAL initial value, set today}
- Current hypothesis: {what the loop currently believes}
- Open / needs follow-up: {shipped but unverified, waiting on human, etc.}

## Logs

<!-- append-only: one dated entry per run — what happened, score, action, links -->

- {YYYY-MM-DD} · run #0 · loop created by /loop-builder; trigger = {type}; first run scheduled {when}

## Evolve

After every {5–10} runs, fire an evolve session with `templates/evolve-prompt.md`:
feed it this file + the raw run logs/conversations, and let it propose changes to
the CONTRACT (mostly new don'ts), prune State, turn repetitive SOP steps into
prestage scripts, and upgrade the trigger. Contract changes ship as {a PR for
human review / auto-apply}.

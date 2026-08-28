---
name: loop-builder
description: "Interview-driven builder for autonomous agent loops. Asks sharp questions to design a loop the way good loop engineers do — goal, boundaries, SOP, trigger type, verifier, evolve cadence — then scaffolds loops/<name>/README.md (the loop contract + state + logs) in the current project and wires the trigger. Use when the user says /loop-builder, 'build a loop', 'create an autonomous loop', 'set up a recurring agent', or wants an agent that wakes up on its own to do recurring work."
---

# Loop Builder

Build production-grade autonomous loops: agents that wake up on their own, find work, execute it, verify it, log it, and improve over time. Based on the loop-engineering system from Jason Zhou's "wtf is Loop Engineer & how to setup for real" (https://youtu.be/JQ_We_ztxrI) — the same structure his team runs their company on.

**The core idea:** anyone can bolt a cron onto an agent — that's the easy 5%. The real work is designing guardrails that let you *walk away*: a contract the agent obeys, state that compounds run over run, a trigger that only spends tokens on real work, a verifier that produces evidence a human can review in seconds, and an evolve pass that improves the loop itself.

## Visual references (in this skill folder)

- `assets/diagrams/` — the original diagrams captured from the video (anatomy, trigger types, combo trigger, evolve loop, doc-maintainer example)
- `assets/videos/` — Remotion-animated recreations showing how data flows through each part (loop anatomy, 4 trigger types, evolve loop, doc-maintainer example)
- `remotion/` — source for those videos (`npm i && npm run render:all` to re-render)

## Anatomy of a good loop

Every loop is one folder in the project:

```
loops/
  <loop-name>/
    README.md        # the living doc: LOOP CONTRACT + STATE + LOGS (one file is enough for most loops)
    scripts/         # optional: gate script, prestage script, helpers the agent can run
    artifacts/       # optional: outputs referenced from README.md
```

And the README.md always has five sections:

| Section | What lives there | Rule of thumb |
|---|---|---|
| `## Goal` | What winning looks like. Whether there's a finish line at all (a monitor has none — "a run that only refreshes statuses and reports the score is a successful run, not a wasted one"). | One paragraph. Measurable if possible. |
| `## Boundaries` | What the agent may ship **by itself** vs what **escalates to a human**. Pitfalls. At least one *via-negativa* rule (a "never do X"). | This is the section that lets you walk away. |
| `## SOP` | The numbered workflow the agent follows every run, ending with "write the run to State + Logs". | Steps the evolve pass can later turn into scripts. |
| `## State` | The durable picture: current hypothesis, open backlog, shipped-but-needs-follow-up, cursors (last commit seen, last email id). | Keep it **small on purpose**. Prune aggressively. |
| `## Logs` | Append-only, one dated entry per run: what happened, score, action taken, PR/links. | Never edited, only appended. Without it the loop rediscovers the same noise every morning. |

Contract = constitution. State = memory. Logs = history. The agent is woken up with this README as its prompt, and the last thing it does every run is update State + append to Logs — so the next round starts smarter.

## The 4 trigger types (pick per loop, this drives cost)

1. **Continuous for-loop** — `while (goal not satisfied && turns < max && budget left) work()`. This is `/goal`-style. Best for immediate-feedback tasks: bug fix, well-specced feature. Ends when done.
2. **Time-based cron** — wake the agent every N minutes/hours (`/loop` in-session, `/schedule` / Codex automations in the cloud). Best for periodic sweeps.
3. **Event-based** — reactive: new email, server incident. Claude Code/Codex don't support this natively; run a small local daemon exposing a URL and point webhooks (Render, Stripe, inbox) at it.
4. **Combo / workflow** ⭐ usually the best — a cron ticker runs a **cheap deterministic gate script** (fetch the data source, check programmatically if there's new work); wake the agent **only when there's real work**, with the work pre-batched. Dramatically more token-efficient: skips are free, runs arrive with context preloaded.

Types 1–2 are out-of-the-box; types 3–4 need a small script/daemon (see `templates/gate-script-example.js`).

## The agent side

Every run goes through three stages: **gather & prioritize → execute → verify**.

- Simple loop → ONE agent, start to finish ("no handoffs, no extra layers: the whole task fits in one head").
- Complex/high-stakes → **orchestrator** (reads contract, researches, dispatches) → **executor sub-agents**, each in an **isolated git worktree** so tasks run in parallel and never dirty the main checkout → each executor hands off to a **verifier** that actually tests the result and attaches evidence (screenshots, video, test output) to the PR.

**Verifier is the prerequisite** for any loop shipping high-stakes work (production code, messages to real customers). Rules that earn trust:
- *No PR without verification evidence* — every fix passes verification; evidence goes in the PR body (screenshot / video link + score) so humans review in seconds.
- *Merge tiers* — define what may self-merge (mechanical, 1–2 file, behavior-identical fixes with green CI) vs what must wait for human review (runtime behavior/UX, 3+ files, security-adjacent, auth, migrations).
- *Never stack a 2nd open PR while a previous one is still unmerged.*

## The evolve loop (the layer most people skip)

Your v1 loop will be mediocre — that's fine. After every 5–10 runs, trigger a dedicated **evolve session**: give the agent the loop's config, past run state + logs, and raw conversation histories, and ask it to improve **the loop, not the product**:

- `CONTRACT.md` diff — mostly new **don'ts** (via negativa), e.g. "never rewrite accurate docs to look busy" (agents default to doing *something* even when nothing is needed).
- `STATE` pruned — 12 scattered lessons → 4 durable rules; smaller state, sharper reads.
- **Prestage scripts** — repetitive SOP steps become `pull → filter → format` scripts that run BEFORE the agent wakes (deterministic = cheap + zero variance).
- **Trigger upgrades** — dumb cron → combo gate script (the video's support-inbox loop invented its own gate script during an evolve run).

Use `templates/evolve-prompt.md` verbatim.

---

## How this skill runs (the interview)

When invoked, DO NOT scaffold anything yet. Run a sharp interview first — one round at a time, using AskUserQuestion where options are enumerable. The questions below are the minimum; dig deeper wherever an answer is vague. A vague contract = a loop you can't walk away from.

### Round 1 — The job

1. **What recurring job should this loop own?** (one sentence, e.g. "keep docs matching shipped code", "triage support inbox", "fix one react-doctor issue per day")
2. **What does winning look like?** Is there a finish line, or is this a monitor that never ends? What's the ONE metric or observable outcome? Push back on unmeasurable goals.
3. **What's a successful zero-work run?** (Make the user say out loud that "nothing to do → clean stop" is a win, and encode it. This kills look-busy behavior.)

### Round 2 — The work source & trigger

4. **Where does work come from?** (git diff, inbox, error logs, ticket queue, DB query, scan tool…) **Can a script check it programmatically?**
   - Yes + periodic → recommend **combo trigger** (cron + gate script) and offer to write the gate script.
   - Needs instant reaction → **event trigger** (daemon + webhook); otherwise plain **cron**; finite goal → **for-loop**.
5. **How often should it check, and what's the token budget per day?** (cadence + batching decision)

### Round 3 — Boundaries (the walk-away section)

6. **What may it ship completely alone?** (be concrete: "docs-only PRs", "emails to segment X", "mechanical fixes ≤2 files with green CI")
7. **What must always escalate to you?** (and HOW: open PR and wait, draft message for approval, ping)
8. **What must it NEVER do?** (elicit at least 2 via-negativa rules; suggest from the classics: never rewrite accurate work to look busy, never stack a 2nd open PR, never touch auth/billing/migrations, never message the same person twice in 7 days)

### Round 4 — Verification & evidence

9. **If this loop screws up, what breaks?** (risk level → how heavy the verifier must be)
10. **What evidence would let you approve its work in under 30 seconds?** (test output, screenshot, video, before/after diff, score) — encode as "no PR/action without this evidence".
11. **One agent or orchestrator + executors (worktrees) + verifiers?** Default: one agent unless work is parallel or high-stakes.

### Round 5 — Memory & evolution

12. **What cursors does State need so runs never re-read the world?** (last commit sha, last email id, last scan score…)
13. **Evolve cadence:** after how many runs (default 5–10) should the evolve session fire? Who approves contract changes — auto-apply or PR for review?

### Then generate

1. Create `loops/<kebab-name>/README.md` from `templates/loop-contract-template.md`, filled with every interview answer — no placeholder slots left unfilled; if a section has nothing real to say, cut it.
2. If combo trigger: write `loops/<name>/scripts/gate.{js,ps1,sh}` adapted from `templates/gate-script-example.js` to their data source.
3. Wire the trigger the user's harness supports: `/loop <interval>` or ScheduleWakeup for in-session, `/schedule` or OS cron/Task Scheduler + `claude -p "$(cat loops/<name>/README.md)"` for headless, or daemon instructions for event triggers. (This user's standard: headless local `claude -p`.)
4. Append an `## Evolve` section to the README noting the cadence and pointing to `templates/evolve-prompt.md`.
5. Show the user the finished README and the exact command that fires run #1. Offer a dry run.

### Quality bar for the generated contract

- Every Boundary is testable ("would a reviewer instantly know if this was violated?").
- SOP's final step is always: *"Write the run to State + Logs. If nothing to do: log the clean stop and end the session."*
- State starts with real initial values (today's cursors), not empty headers.
- Logs starts with a `<!-- append-only: one dated entry per run -->` comment and run #0 = "loop created".

## Templates & examples in this folder

- `templates/loop-contract-template.md` — the README skeleton
- `templates/evolve-prompt.md` — paste-ready evolve session prompt
- `templates/gate-script-example.js` — combo-trigger gate script (Intercom-style "any real updates in last 30 min?")
- `templates/examples/doc-maintainer.md` — the video's starter loop, fully written
- `templates/examples/react-doctor-daily.md` — daily codebase-health fix loop (orchestrator + worktree executor + verifier, merge tiers)
- `templates/examples/crm-daily-run.md` — non-engineering loop (segments, outreach approval tiers, anti-double-send rules)

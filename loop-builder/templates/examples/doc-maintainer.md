# doc-drift-sweep — contract

<!-- The video's recommended starter loop. Small but mighty: keep the docs
     matching what the code actually ships. 1 layer, ONE agent start to finish,
     output: PR or nothing. -->

## Goal

The README, setup guides, examples and runbooks always match what the code
actually ships. Drift on its own goes down: found → a successful run, not a
wasted one; and **zero drift found is ALSO a successful run, not a wasted one**.
No finish line — this is a monitor.

## Boundaries

**Can ship alone:**
- Docs-only PRs: the smallest fix that removes the drift, in a fresh worktree,
  PR body explains the drift found.

**Must escalate:**
- If fixing the doc would require deciding how the *code* should behave → open
  an issue instead of guessing.

**Never:**
- Never rewrite accurate docs to look busy. (Agents default to doing
  *something* — this rule kills it.)
- Never stack a 2nd open PR — if last sweep's PR is still open, refresh its
  status, log, and stop.
- Never touch anything outside the docs, README, examples and runbooks.

## Trigger

Combo: CRON · MON 6AM → cheap gate script: `git log --oneline <cursor>..HEAD`
any new commits / merged PRs since the last sweep? **no → silent skip** (tokens
saved) · yes → the agent wakes.

## SOP

1. **Read the diff** — commits + PRs since the last sweep. The cursor lives in
   State; no re-reads.
2. **Compare** — README · setup guides · examples · runbooks vs what the code
   ships NOW.
3. **Verify for real** — run the commands, check the links, try the examples.
   Never trust memory.
4. **Drift found** → smallest fix, fresh worktree, one PR that explains the
   drift. **All accurate** → clean stop.
5. Both paths: write the run to State + Logs · sleep until next Monday.

## State

- last-sweep cursor: {commit sha — set on creation}
- open PR: {none}

## Logs

<!-- append-only: one dated line per run: drift count + PR link, zero included -->

- {YYYY-MM-DD} · run #0 · loop created; cursor initialized to {sha}

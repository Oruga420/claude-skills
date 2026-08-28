# react-doctor-daily — contract

<!-- The video's engineering loop: daily codebase-health fix using the
     react-doctor CLI. Orchestrator + executor worktree + verifier, with
     explicit merge tiers. -->

## Goal

The repo's React health score trends up over time. Every morning: scan with
React Doctor, pick the most severe issue, verify it, and propose it as ONE pull
request. Report the 0–100 health score every run so the trend is watchable. No
finish line: this is a monitor. A run that only refreshes PR statuses and
reports the score (if nothing severe is left) is a successful run, not a wasted
one.

## Boundaries

- **The orchestrator never edits code itself** — it MUST spawn an executor
  sub-agent to do the fix, and the executor works inside a fresh git worktree
  created off `origin/main`, OUTSIDE this loop folder and outside the user's
  main checkout:

  ```bash
  REPO=/path/to/repo
  WT=/path/to/worktrees/react-doctor-$(date +%Y-%m-%d)
  git -C "$REPO" fetch origin main
  git -C "$REPO" worktree add "$WT" -b react-doctor/fix-$(date +%Y-%m-%d) origin/main
  cd "$WT" && pnpm install
  # … executor works here …
  git -C "$REPO" worktree remove "$WT" --force   # always, even on failure
  ```

- **No PR without verification evidence.** Every fix must pass the `/verify`
  skill — drive the affected flow in the app, not just typecheck/lint — and any
  behavior-touching fix must additionally be tested in a sandbox. Evidence goes
  in the PR body: screenshot / video link + score before → after. A PR arrives
  as "here's it working", never "this should work".

- **Merge tiers:**
  - *May self-merge* (squash, only after CI green AND evidence attached):
    mechanical fixes confined to 1–2 files in `frontend/packages/*` —
    memoization, dependency-array fixes, dead code, cleanup-only effect fixes —
    where the re-scan + `/verify` prove identical behavior.
  - *Must wait for human review*: anything that changes runtime behavior or UX,
    touches 3+ files, or touches backend/proxy, state management, routing,
    auth, billing, migrations — or where the evidence is inconclusive.
    Soft-merge is the exception, not the rule.

- **Never open a new PR while a previous React Doctor PR is still open
  (unmerged).** On those days: refresh the open PRs' statuses, report the
  score, stop.
- **Never push to `main` directly** — branch + PR only; the only way changes
  land.

## SOP

1. Refresh statuses of any open react-doctor PRs (cards move columns by state).
2. Run the react-doctor scan; record the 0–100 score.
3. Open PR still unmerged → report score, log, clean stop.
4. Pick the single most severe issue; verify it's real (see known-noise rules
   in State) before fixing.
5. Spawn executor in a fresh worktree (commands above); smallest correct fix.
6. Verify with evidence (`/verify` + sandbox for behavior changes); attach to PR.
7. Merge per tier or leave for review. Remove the worktree — always.
8. Write score, action and PR link to State + Logs.

## State

- Baseline health score: {e.g. 38/100 across 197 flagged issues}
- Open React Doctor PR: {none}
- Known-noise rules (verify before fixing):
  - low-supply-chain-score warning lives in a legacy `package.json` — off-limits.
  - multi-package scans emit per-package-relative filePaths — verify the path
    maps to an active package before fixing.
  - `tsc --noEmit` on the frontend has pre-existing errors — error-count
    *parity* with/without the change, not a clean run, is the bar.

## Logs

<!-- append-only: one dated line per run: score, action taken, PR link if any -->

- {YYYY-MM-DD} · run #0 · loop created; baseline scan pending

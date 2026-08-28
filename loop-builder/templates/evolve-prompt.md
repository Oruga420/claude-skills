# Evolve session prompt

<!-- Fire this after every 5–10 runs of a loop. Give the agent everything:
     the contract, state, logs, trigger config, and (if available) the raw
     conversation transcripts of past runs. -->

You are running an EVOLVE session for the loop at `loops/{loop-name}/`.
Your output is changes to the LOOP, not the product. Read, in order:

1. `loops/{loop-name}/README.md` (contract + state + logs)
2. The trigger configuration / gate script in `loops/{loop-name}/scripts/`
3. The raw logs or conversation transcripts of the last {N} runs: {paths}

Then propose (as a diff or PR, per the loop's Boundaries):

1. **Contract diff** — new rules the history proves necessary. Prefer via
   negativa: new "never do X" lines beat new capabilities. Look especially for
   look-busy behavior (work done when a clean stop was correct), repeated
   mistakes, and boundary violations.
2. **State pruning** — collapse scattered lessons into few durable rules;
   delete stale entries; smaller state = sharper reads. (Logs stay append-only —
   never rewrite history.)
3. **Prestage scripts** — any SOP step the agent repeats mechanically every run
   (pull → filter → format) becomes a deterministic script that runs BEFORE the
   agent wakes. Deterministic = cheap + zero variance.
4. **Trigger upgrade** — if the loop wakes on a dumb cron and often finds
   nothing: write/update a gate script so the agent only wakes on real work,
   with the work pre-batched.
5. **Observability** — if the humans can't tell at a glance what the loop
   shipped and what needs their attention, propose the smallest
   dashboard/report improvement.

Rules for this session:
- Evidence over vibes: every proposed change must cite the run(s) that justify it.
- Do not expand the loop's scope or permissions — that's a human decision.
- End by appending an `evolve run` entry to ## Logs describing what you changed.

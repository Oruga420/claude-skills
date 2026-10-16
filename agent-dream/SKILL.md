---
name: agent-dream
description: Gated curation loop for self-evolving agents. Consolidates each agent's memory wing (room=learnings, in MemPalace or any memory store that can list an agent's learnings) into itemized delta proposals against its ~/.claude/agents/*.md definition, presents them one at a time for approval, applies + git-commits accepted deltas, and records the accept/reject history back into the wing as a selection signal. Use when the operator says "dream the agents", "evolve the agents", "curate agent memory", or on a schedule.
---

# Agent Dream — gated evolution curator

Consolidate agent wing memories into reviewable deltas against the agent
definition files. Design basis: memory updates are autonomous, definition
updates are GATED; itemized deltas only, never full rewrites (full rewrites
cause "context collapse", as described in the ACE paper); supersede rather
than delete; definition files are code (git).

## Requirements

- **Agent definitions** in `~/.claude/agents/*.md`, with that folder under
  git (`git init` once) so every dream lands as a commit.
- **A memory store with one wing (namespace) per agent** and a `learnings`
  room the agents write lessons into. The commands below use
  [MemPalace](https://github.com/mempalace/mempalace) via its MCP server
  (`mempalace_*` tools). Any other store works if it can: list an agent's
  learnings with timestamps, search them, and file a new entry. Map the calls
  in this file to your store's equivalents.
- Wing naming convention: `agent_<name>` (underscores), matching
  `~/.claude/agents/<name-with-dashes>.md`.
- No API keys beyond what your memory store needs.

## Inputs

- Optional arg: a single agent name (e.g. `db-tuner`). Default: every
  wing named `agent_*` (via `mempalace_list_wings`) that has a matching
  `~/.claude/agents/<name-with-dashes>.md` file.
- State file: `~/.claude/agents/.evolution-state.json` —
  `{ "<agent>": {"last_dream": ISO8601, "accepted": N, "rejected": N} }`.
  Create if missing (treat last_dream = wing genesis).

## Procedure (per agent)

1. **Gather.** `mempalace_search(wing="agent_<name>", room="learnings",
   query="<agent domain keywords>", limit=25)`, plus
   `mempalace_list_drawers(wing="agent_<name>", room="learnings")` to catch
   anything search ranks low. Keep entries with timestamp newer than
   `last_dream`. Fewer than 2 new lessons: report "nothing to dream" and
   stop — do not manufacture deltas.
2. **Consolidate** (in-context, no writes yet): dedupe near-identical
   lessons; discard restatements of what the .md already says; group the
   rest into candidate deltas, each exactly one of:
   - **ADD** — new bullet/row/paragraph in an existing section
   - **UPDATE** — change a specific value/claim; the delta text must name
     the old claim it supersedes
   - **REMOVE** — baseline claim contradicted by a VERIFIED lesson or dead
     (superseded tooling, retired hardware)
   Rules: [SPECULATIVE]-only support can propose ADDs (marked speculative in
   the text) but never UPDATE/REMOVE. Conflicting lessons: present the
   conflict itself as the finding, not a delta.
3. **Review — one delta at a time.** For each, show: the exact diff (old
   text -> new text), the supporting lesson(s) verbatim with provenance and
   freshness, and your confidence. Use AskUserQuestion (approve / reject /
   edit). Never batch. The operator's "edit" answers are the highest-value
   signal — record the edited version, not yours.
4. **Apply.** Accepted deltas via Edit (surgical, never rewrite the file).
   Bump the `knowledge as of` date in the agent's memory/protocol section
   (add one if the file has none). Sanity-check frontmatter still parses.
   One git commit per dream in `~/.claude/agents`:
   `dream(<agent>): <n> deltas applied, <m> rejected` with per-delta bullets.
5. **Record the selection signal.** Write one summary entry with
   `mempalace_add_drawer(wing="agent_<name>", room="curation", content=...)`:
   date, each proposed delta, verdict (accepted/rejected/edited), and the
   operator's stated reason if given. Future dreams MUST read the last 2-3
   curation entries first (`mempalace_list_drawers(wing="agent_<name>",
   room="curation")`) and stop proposing classes of change the operator has
   rejected.
6. **Update state file** (last_dream = now, counters).

## Hard rules

- The agent files' safety-critical sections (any "non-negotiable operating
  principles" block, any dead-man/rollback pattern) may gain content via
  approved ADDs but are never candidates for REMOVE.
- Anti-bloat is a goal equal to learning: every dream, actively look for
  baseline text the new lessons make redundant and propose REMOVEs. A
  definition that only ever grows is failing.
- No delta without a cited wing lesson. The curator adds no knowledge of
  its own.
- If the memory store is unreachable, stop; never dream from recollection.

## Maintenance (offer at end, do not auto-run)

- Wing hygiene: `mempalace_check_duplicate(content=...)` on suspected
  repeats in the wing. Superseded learnings: prefer demoting them (e.g.
  `mempalace_update_drawer(drawer_id=..., room="learnings-archive")`) over
  deleting them.
- Fleet inventory: from the state file plus `mempalace_list_wings` drawer
  counts — wired agents, lesson counts, last dream per agent.

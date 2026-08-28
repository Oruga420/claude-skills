---
name: kimi
description: Delegate build work to Kimi K3 through a sealed local tunnel, while your Claude Code session stays on Anthropic. Use when the operator says "/kimi", "que lo haga Kimi", "usa kimi para construir X", or wants Kimi to build/design an app or component. Opus stays the orchestrator; one or more kimiagent foremen drive Kimi K3 (great at design-forward frontend) and report back verified results with real cost.
origin: custom
---

# /kimi — Kimi K3 build tunnel

Lets you (Opus, this session) hand construction to **Kimi K3** without touching the
harness. Claude Code is the hands; Kimi is the brain. Your interactive session stays
100% on Anthropic — the Kimi provider env is set only inside an isolated subprocess.

## Architecture (so you don't re-derive it)

```
You (Opus, orchestrator)
  └─ dispatch kimiagent (foreman, Anthropic subagent)   ← Agent tool
       └─ node ~/.claude/kimi/kimi-run.mjs               ← Bash, the tunnel
            └─ claude -p  (env → Moonshot, config-dir isolated)  ← Kimi K3 builds
```

- Tunnel + runner live in `~/.claude/kimi/` (see its README). Key is in
  `~/.claude/kimi/.env` (gitignored), injected only into the child process.
- The worker runs against its own empty `CLAUDE_CONFIG_DIR`, so your hooks / skills /
  MCP / settings never leak in.
- Kimi K3: 1M context, always-on reasoning, **no prompt caching** → cost scales with
  turns. Favor complete, well-specified prompts over many corrective rounds.

## Preflight

1. Confirm the key: `test -s ~/.claude/kimi/.env && echo OK`. If missing, tell the operator
   to drop his Moonshot key into `~/.claude/kimi/.env` (copy `.env.example`) and stop.
2. Pick a **target dir** outside `~/.claude`. Default: `~/Desktop/Dev/<name>-kimi`.
   Confirm the name/path with the operator if ambiguous.

## Run

1. **Scope it.** Turn the request into a concrete spec + checkable acceptance
   criteria: stack, data model, feature list, design direction, file layout.
2. **Dispatch kimiagent(s).**
   - Single app → one `kimiagent` with the full spec + target dir + criteria.
   - Big/independent chunks (e.g. a full app where UI, data layer, and exports are
     separable) → dispatch **several kimiagent subagents in parallel** (one message,
     multiple Agent calls), each with its own sub-target and criteria. This is the
     "Kimi agent team" — real parallel Kimi builders.
3. **Collect + verify.** Each foreman already verified its own slice; you do the
   integration check: run/build the assembled app, confirm criteria end to end.
4. **Report to the operator**: what got built, verdict per criterion, how to run it, and the
   **total cost** (sum every foreman's `costUsd`), tokens, rounds, wall-clock.

## Notes & guardrails

- Kimi sees whatever you send it. Cork Board / OSS / personal side-projects are fine;
  **never send client or otherwise confidential code through the tunnel.**
- If Kimi stalls or loops (weaker tool-use fidelity than Claude on some tasks), the
  foreman falls back to hybrid: Kimi generates, Opus/Anthropic wires. That's expected.
- This skill adds NOTHING to your global config; it's all files + subprocesses.

## Canonical test exercise: rebuild Cork Board

The validation build for this tunnel. Web-only clone (skip Electron + MCP) of the
Cork Board app, with **superior design** as the bar. Scope:
- Stack: Vite + vanilla JS (or Kimi's choice), local-first via localStorage, SPA.
- Views: Board (pinned index cards in act columns), Outline, Arcs (character × scene grid).
- Card inspector (title, synopsis, paper color, INT/EXT, time, location, status,
  pages, due, characters, labels, per-character arc beats, checklist).
- Cast/Places/Labels/Insights drawer; drag-character-to-card tagging.
- Drag & drop: cards within/across columns and across board tabs; column reorder + tools.
- Multi-board + multi-project; find & filter; deadline coloring; status→pin color.
- Undo, autosave, checkpoints. Exports: Markdown outline + JSON + printable Share Wall.
- 3 surfaces (Cork / Paper / Midnight), S/M/L cards, Columns/Rows walls, remembered.
- Presets: blank + Three Acts + the worked AVA demo (the "wow" seed).
Design is won in the CSS: textured surfaces, index-card realism, pushpins, filmic
palette, Insights viz. Reference source: a locally cloned reference implementation.

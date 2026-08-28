---
name: arise-mempalace
description: Install, configure, and use MemPalace (github.com/mempalace/mempalace), the local-first AI memory system that mines projects and Claude Code conversations into a searchable verbatim palace (96.6% R@5, zero API calls). Use this skill as the step-by-step install and usage guide whenever you need to set up MemPalace, wire its Claude Code plugin and hooks, backfill past sessions, search memory, or troubleshoot. The /arise skill calls this as its Layer 2. Run standalone to add verbatim memory to any project or to repair an existing palace.
---

# /arise-mempalace - MemPalace Install and Usage Guide

**Repo (always the source of truth):** https://github.com/mempalace/mempalace
**Docs:** https://mempalaceofficial.com (concepts, hooks, MCP reference)
**License:** MIT. Local-first, no cloud, no API keys for core retrieval.

MemPalace mines your code and your Claude Code conversation transcripts into a structured, searchable memory. It stores content **verbatim** (never summarized) and retrieves with local semantic search. Benchmarks: 96.6% R@5 raw on LongMemEval, up to 99%+ with optional LLM reranking, all with zero API calls.

## Before You Start: Pull the Latest

MemPalace is at v3.3.x and moves fast. The commands below were accurate at write time, but **verify against the live repo and `--help` before trusting any flag.** Fast checks:

```bash
mempalace --help
mempalace <subcommand> --help
```

If something here disagrees with `--help`, trust `--help` and update this skill. For deeper detail, fetch the repo README:

```bash
gh api repos/mempalace/mempalace/contents/README.md -q .content | base64 -d | less
```

---

## The Mental Model: Palace / Wing / Room / Drawer

MemPalace organizes memory as a building, which is why scoped search beats flat-corpus RAG:

- **Wing** = an entity or project (a scoped container). One wing per project is the common pattern.
- **Room** = a topic or semantic domain inside a wing.
- **Drawer** = the finest unit: the original verbatim content.

Plus a **knowledge graph** (local SQLite, temporal entity-relationship with validity windows) and per-agent **diaries**. Retrieval backend defaults to ChromaDB (pluggable via `mempalace/backends/base.py`).

---

## Phase 1 - Preflight

Run these and report results:

1. **Python 3.9+:** `python --version` (Windows: `python` or `py`).
2. **Installer:** `uv --version` (preferred). Fallback: `pip --version`.
3. **Disk:** ~300 MB free for the embedding model.
4. **Shell for hooks:** the auto-save hooks are `.sh`. On Windows they run under Git Bash. Confirm Git Bash is available.
5. **Already installed?** `mempalace status` (succeeds if a palace exists) and check whether `mempalace-mcp` is on PATH.

---

## Phase 2 - Install the Package

```bash
uv tool install mempalace          # preferred
# fallback:
pip install mempalace
```

This installs the `mempalace` CLI and the `mempalace-mcp` MCP server binary. The first command that needs embeddings downloads the model (~300 MB).

**Embedding model choice:**
- `embedding-gemma-300m` - multilingual, 100+ languages. Best default for mixed EN/ES.
- `all-MiniLM-L6-v2` - English-only, ~30 MB, lighter.

The multilingual model is the right default for mixed EN/ES work.

---

## Phase 3 - Initialize a Palace

```bash
mempalace init .                   # init in current project (or pass an absolute path)
mempalace status                   # show wings / rooms / drawer counts
```

Create or confirm a **wing** for the project. Most workflows scope a wing per project so searches stay relevant.

---

## Phase 4 - Wire Claude Code (Plugin, Preferred)

The official plugin bundles the MCP tools, the auto-save hooks, and helper commands. Prefer it over hand-rolled hooks: it is maintained upstream and more robust on Windows/Git Bash.

In the Claude Code prompt (these are interactive, suggest the user run them with the `!` prefix or type them directly):

```
/plugin marketplace add mempalace/mempalace
/plugin install mempalace@mempalace
```

The plugin provides:
- **MCP server** `mempalace-mcp` (palace reads/writes, knowledge-graph ops, cross-wing navigation, drawer management, agent diaries, ~19 tools).
- **Hooks** `mempal-stop-hook.sh` and `mempal-precompact-hook.sh`.
- **Commands**: help, init, mine, search, status.

**Restart Claude Code once** after installing. Hooks load at session start.

### The Two Hooks (what they do)

| Hook | Event | When it fires | Effect |
|------|-------|---------------|--------|
| Save | `Stop` | Every 15 human messages | Auto-mines the transcript (including tool output: Bash results, search hits, build errors), then asks the AI to save topics/decisions/quotes |
| PreCompact | `PreCompact` | Right before context compaction | Auto-mines, then emergency save: forces EVERYTHING to be saved before context is lost |

Two-layer capture: hooks mine the JSONL transcript directly (raw, lossless) AND prompt the AI to save key context. Belt and suspenders.

### Manual Hook Fallback (only if plugin install is blocked)

From a local clone, in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "Stop": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/mempal-stop-hook.sh\"", "timeout": 30 }] }],
    "PreCompact": [{ "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/mempal-precompact-hook.sh\"", "timeout": 90 }] }]
  }
}
```

Make the scripts executable: `chmod +x hooks/mempal_save_hook.sh hooks/mempal_precompact_hook.sh`. Configurable knobs inside `mempal_save_hook.sh`: `SAVE_INTERVAL=15`, `STATE_DIR`, `MEMPAL_DIR` (extra project dir to also mine), `MEMPALACE_PYTHON` (interpreter with mempalace + chromadb).

To disable auto-save blocking without removing hooks: set `hooks.auto_save` to `false` in `~/.mempalace/config.json`, or `export MEMPALACE_HOOKS_AUTO_SAVE=false`.

---

## Phase 5 - Backfill (Do Not Start Empty)

Claude Code JSONL transcripts in `~/.claude/projects/` are not permanent. Backfill now.

```bash
# Optional read-only backup of existing transcripts first (from a repo clone):
tools/backup_claude_jsonls.sh

# Mine the project files (code, notes, docs):
mempalace mine . --mode projects --wing <project-name>

# Mine all past Claude Code sessions:
mempalace mine ~/.claude/projects/ --mode convos --wing <project-name>
```

`mempalace mine <dir>` with no `--mode` mines all files. `--mode convos` is conversation transcripts only; `--mode projects` is project files. Report drawer counts after.

---

## Phase 6 - Daily Usage

```bash
mempalace wake-up                       # load relevant context at the start of a new session
mempalace search "why did we switch to GraphQL"   # semantic search across the palace
mempalace status                        # wings / rooms / drawers + suggestions
mempalace sweep <transcript-dir>        # per-message verbatim drawer creation (verbose)
mempalace mine <dir> --mode convos      # manual save if hooks are not wired
```

**Session pattern that works:**
1. Start a session: `mempalace wake-up` to rehydrate context.
2. Work normally. Hooks auto-save every 15 messages and before any compaction.
3. Ask history anytime: `mempalace search "..."`.
4. The MCP tools (when the plugin is active) let the agent read/write the palace and the knowledge graph directly, no shell needed.

---

## Troubleshooting

- **`mempalace: command not found`** - the package is not on PATH. With `uv tool install`, ensure `~/.local/bin` (or uv's bin dir) is on PATH. Reinstall if needed.
- **Hooks never fire** - you did not restart Claude Code after installing the plugin. Hooks load at session start.
- **Hook errors on Windows** - the `.sh` scripts need Git Bash. Confirm `bash` resolves and `MEMPALACE_PYTHON` points at a Python with `mempalace` + `chromadb` installed.
- **Slow first run / big download** - the ~300 MB embedding model downloads on first embedding use. One time only.
- **Wrong / no results** - check you mined into the right `--wing`, and that `mempalace status` shows drawers. Search is scoped; an empty wing returns nothing.
- **Auth or cloud prompts** - core retrieval is local and needs no API keys. LLM reranking is the only optional, opt-in step that involves a model.

---

## When to Use MemPalace vs a Wiki

MemPalace is **verbatim recall**: exact quotes, command outputs, errors, full transcripts. It is automatic and lossless. It does not synthesize.

For **curated, synthesized, interlinked knowledge** (decisions, architecture, "why"), pair it with a Karpathy LLM Wiki via the `/arise-wiki` skill. The `/arise` skill installs both together as a two-layer memory harness. Use this skill (`/arise-mempalace`) alone when you only need the verbatim memory layer, or to install/repair/learn MemPalace on its own.

## Environment Notes (Windows)
- Windows 11 + Git Bash: hooks run under Git Bash; use Unix-style paths.
- Keep `embedding-gemma-300m` for EN/ES.
- Execute the installs and `mine`/`status`/`wake-up`/`search` yourself. Only the two `/plugin` commands and the Claude Code restart need the user (suggest with the `!` prefix).

---
name: awake
description: Point Claude Code at any project folder on disk and instantly resume it. /awake FIRST brings up that project's local app (a running localhost, like a project dashboard), then auto-detects which awakening profile fits the project's on-disk configuration and runs THAT one - either child-scoped anchoring (mode wiki + a single MemPalace wing, father Mempire kept out) or location-based resume (Karpathy root wiki, backend chosen by location, Mempire reachable). It reads the wiki + verbatim palace, replays the last log entries + git state, reconstructs what was being worked on last, and proposes concrete next steps. Read-only apart from launching the local app. Does NOT build or bootstrap structure - if the folder has no /arise harness yet, it says so and offers to run /arise. Use when the user says "/awake <path|name>", "wake up in <project>", "despierta en <proyecto>", "resume <project>", or gives a folder and asks what's next.
---

# /awake - Resume any project's ARISE harness (self-selecting)

`/arise` BUILDS the memory harness for a project. `/awake` USES it: you give it a project (path, folder name, or alias); it stands up the project's local app, then loads that project's existing ARISE memory and tells you exactly where you left off and what to do next.

**It is self-selecting.** Two awakening profiles exist because projects were set up two ways. `/awake` does NOT ask you which one; it inspects the target's configuration and runs whichever applies:

- **Profile A - child-scoped.** The project is a child under the Desktop/home Mempire father brain: it has its own MemPalace wing and a mode wiki (`.claude/wiki/`). `/awake` anchors the whole session into that child and uses ONLY its MemPalace wing, keeping the father Mempire out.
- **Profile B - location resume.** The project uses the Karpathy layout (root `wiki/` + `WIKI.md`) or an explicit backend override, or the target is the general root itself. `/awake` resumes by location, picks the backend by location (Mempire for the general root, MemPalace for a project), and keeps the Mempire general brain reachable for cross-project questions.

**What it is NOT:** it does not create wiki structure, does not init MemPalace/Mempire, does not ask project-type questions. That is `/arise`'s job. If the target has no harness, it stops at the gate and offers to run `/arise`.

---

## Phase 0 - Resolve the target

1. **Get the target** from the invocation argument (everything after `/awake`). It may be a path, a folder name, or an alias. If none was given and the conversation already names the project unambiguously, use it; otherwise ask ONE question: *"Which project folder do you want to wake up in?"* - do not guess.
2. **Resolve it to an absolute path:**
   - An existing path (Windows `C:\Users\<you>\Desktop\foo` or Unix `/c/Users/<you>/Desktop/foo`, `~` = the user's home) is used directly.
   - A name: try `~/Desktop/<name>` case-insensitively.
   - Still no hit: scan `~/Desktop/*` for folders with an ARISE footprint (root `wiki/index.md`, `mempalace.yaml`, or `.claude/wiki/`) whose name loosely matches the argument or a known alias (check auto-memory / MEMORY.md for alias hints). Never guess between two plausible matches - ask which one.
3. **Verify it exists** and is a directory. If not, list the closest matches under its parent and ask.
4. Set `TARGET` = the resolved absolute path and `PROJECT` = its final folder name. **Every command in this skill runs with `TARGET` as its working directory** (Bash tool: prefix with `cd "<TARGET>" &&`); the wiki and palace are all relative to that folder. On Windows use Unix-style paths in Bash commands and remember shell state does not persist between calls.

---

## Phase 0.5 - Bring up the LOCAL app FIRST (the one write action)

The very first thing `/awake` does, before reading any memory, is stand up the project's **local version** so it is running on a localhost while you resume, exactly like a project dashboard on its own port. This is the single exception to the read-only contract: this phase only *runs* the app, it never edits code.

1. **Find how this project runs locally**, in priority order:
   1. A project-specific launcher: if the `run` skill is available, defer to it (it already knows the per-project patterns). Otherwise scan `<TARGET>/.claude/skills/` and `<TARGET>/.claude/commands/` for a run/dev/start skill or a start script referenced in `<TARGET>/.claude/CLAUDE.md`.
   2. `<TARGET>/package.json` scripts: prefer `dev`, else `start`. Read the script (and any `.env`/config) to learn the port. If it is a production `start` that needs a prior build (e.g. Next `next start`), build first.
   3. Python: `uvicorn`/FastAPI, `flask run`, `manage.py runserver`, `streamlit run`, or a `main.py`/`app.py` entry. Check `pyproject.toml`/`requirements.txt` and any venv under `<TARGET>`.
   4. Static site (top-level `index.html`) then serve with a simple static server. Anything else compiled then note the build+run command.
2. **Pick the port.** Use the port the project pins. If that port is already LISTENING, assume the app is already up: report its URL and skip launching (never double-start, never kill whatever holds a port). If the pinned port is taken by something else, pick the next free port and remember it.
3. **Launch in the background** (Bash `run_in_background: true`) so the session stays free. Send output to `<TARGET>/.awake-local.log`.
4. **Verify it came up:** poll `http://localhost:<port>` until it responds (any HTTP status) or ~30s elapse.
5. **Report one line:**
   - up now: `Local app: http://localhost:<port> (started)`
   - already running: `Local app: http://localhost:<port> (already up)`
   - could not start: `Local app: could not auto-start (<reason>)`
   - nothing to run: `Local app: none (library/docs-only project)`

**A failed or absent launch NEVER blocks the resume.** Report the reason and continue. Do not spend more than ~1 minute here; if a build is slow, kick it off in the background, note "starting...", and move on with the awakening while it builds.

---

## Phase 1 - Detect the harness (gate) and SELECT THE PROFILE

Read these markers under `TARGET` in one parallel sweep:

- Karpathy layer: `<TARGET>/wiki/index.md`, `<TARGET>/wiki/log.md`, `<TARGET>/WIKI.md`
- Mode / config layer: `<TARGET>/.claude/CLAUDE.md`, `<TARGET>/.claude/wiki/index.md`
- Verbatim backend: `<TARGET>/.arise-memory` (contents `mempalace` or `mempire`), `<TARGET>/mempalace.yaml`, `<TARGET>/.mempalace/`

**Gate.** If NONE of the harness markers exist (no root `wiki/index.md`, no `.claude/CLAUDE.md` with an ARISE block, no `mempalace.yaml`, no `.claude/wiki/`) then STOP: *"`<TARGET>` has no ARISE harness yet. I can't resume what isn't set up."* Offer to run `/arise` there (Skill tool then `arise`, against `TARGET`). Do not fabricate structure.

**Select the profile** from what you found (first match wins):

1. `<TARGET>/.arise-memory` exists then **Profile B** (an explicit backend override means location-routed resume; the file's content picks the backend).
2. `<TARGET>/wiki/index.md` + `<TARGET>/WIKI.md` exist (Karpathy root layer) then **Profile B**.
3. `<TARGET>/.claude/wiki/index.md` and/or root `<TARGET>/mempalace.yaml` exist, and there is NO Karpathy root layer then **Profile A** (child-scoped: a project set up as a child of the Mempire father, with its own wing + mode wiki).
4. Target is the general root itself (`~` or `~/Desktop`) then **Profile B** with the Mempire general brain.

Report one line before running it: `Profile: A (child-scoped, wing <wing>)` or `Profile: B (location resume, backend MEMPALACE|MEMPIRE)`. Then execute ONLY that profile below.

---

## Profile A - Child-scoped awakening

Use the project's own memory only; keep the father Mempire out of the loop for the rest of the session.

**A.1 Anchor to the project.** From now until the user leaves it:
- Every shell command runs from `TARGET`. Every file you read/write lives inside `TARGET` (session scratchpad excepted).
- Do NOT call `mempire_*` (father) tools and do not file session knowledge into the father brain. The project's palace wing + wiki are the only memory surfaces.
- The project's own `CLAUDE.md` / `.claude/CLAUDE.md` / `.claude/rules/*` override any father-level habit for the session.

**A.2 Awakening protocol (in order):**
1. **Conventions + identity:** read `<TARGET>/CLAUDE.md` and, if present, `<TARGET>/.claude/CLAUDE.md`. If the project defines its own session-start reading order, FOLLOW THAT ORDER; it wins over this list.
2. **Wiki (curated):** read `<TARGET>/.claude/wiki/index.md` (or `overview.md`) and the last 5 entries of `<TARGET>/.claude/wiki/log.md`. If a root Karpathy `wiki/` also exists, read its `index.md` too.
3. **Palace (verbatim):** read `<TARGET>/mempalace.yaml` and note the `wing:` name. Wake it: `cd "<TARGET>" && mempalace wake-up` (on Windows prefix `PYTHONUTF8=1`). If the `mempalace` MCP server is loaded, `mempalace_wake_up` / `mempalace_status` are equivalent. Scope every later `mempalace search` to that wing.
4. **Rules:** read `<TARGET>/.claude/rules/arise.md` if present; its `/compact` checklist is mandatory while awake here.

Then produce the shared report (below) and stop, unless the user already gave a task.

---

## Profile B - Location resume

**B.1 Determine the backend.** Set `MEMORY_BACKEND`:
1. If `<TARGET>/.arise-memory` exists, its content (`mempire` or `mempalace`) wins.
2. Else by location: `TARGET` is the general root (`~` or `~/Desktop`) then `mempire`; `TARGET` is a project folder (has `.git`, `.claude/`, `wiki/`, `package.json`, or `pyproject.toml`) then `mempalace` (wing `PROJECT`).
Even with a project backend, keep the Mempire general brain (`mempire_*` tools) reachable for cross-project questions; it is not either/or.

**B.2 Load everything (parallel where possible):**
- **Curated:** read `<TARGET>/wiki/index.md` and `<TARGET>/wiki/overview.md` if present, plus the **last 10 entries** of `<TARGET>/wiki/log.md`. If a mode wiki exists (`<TARGET>/.claude/wiki/`), also read the current Personal week file or the open Laboral PRDs/action items. Read `<TARGET>/.claude/CLAUDE.md` and honor its rules for the session.
- **Verbatim** (verify flags with `--help` first; MemPalace moves fast):
  - `mempalace`: `cd "<TARGET>" && mempalace status` then `mempalace wake-up` (scope to `PROJECT` if a wing flag exists).
  - `mempire`: `"$HOME/Desktop/Mempire/.venv/Scripts/python.exe" -m mempire status` then `... wake-up`, or the `mempire_wake_up` / `mempire_status` MCP tools if the server is live.
- **Live repo state** (if a git repo): `git log --oneline -8`, `git status --short`, `git branch --show-current`.

**B.3 Locate "last worked on".** Triangulate: the most recent `wiki/log.md` entry; unfinished `- [ ]` tasks or open PRD action items; uncommitted files + last commit. Then a targeted verbatim pull on the last topic (`mempalace search "<topic>"` / `mempire_search`). Synthesize a short "Last session" statement: what was being done, where it stopped, what was left open.

**B.4 Suggest next steps.** Propose 2-4 concrete, ordered steps, each grounded in evidence and cited (`from wiki/log.md <date>`, `uncommitted: src/foo.ts`, `week file: unchecked task`). Rank by what unblocks the most / was most recently active. Then produce the shared report.

---

## Shared report

Output one compact block, then wait for the user to pick a thread (do not start work unless told):

```
Awake in <PROJECT>.  (<TARGET>)
Local app: http://localhost:<port> (started|already up) | none | could not auto-start (<reason>)
Profile: A (child-scoped, wing <wing>) | B (location resume)
Backend: MEMPALACE|MEMPIRE  ·  Wiki: N pages  ·  Palace: N drawers / N wings  ·  Mode: personal|laboral|harness
Last session: <DATE> - <one-line what-was-done>
Git: <branch>, <N> uncommitted, last commit "<subject>"

Open threads:
  - <thread 1>  (source)
  - <thread 2>  (source)

Suggested next steps:
  1. <step>  - <why / source>
  2. <step>  - <why / source>
```

For Profile A the one-line variant is acceptable if there is little to resume: `Awake in <PROJECT>. Local app: <url>. Profile A, wing <wing>. Wiki: N pages. Palace: N drawers. Last session: <date>.`

---

## Operating notes

- **Read-only by contract, with one exception.** `/awake` reads, reconnects, and recommends. It never writes to the wiki, never mines, never inits, never overwrites. The single exception is **Phase 0.5**, which *runs* (does not edit) the project's local app. The only other write path is if the user explicitly says "run /arise" at the gate.
- **The session anchors to `TARGET`.** The cwd does not move; prefix commands with `cd "<TARGET>" &&`. Honor the project's `.claude/CLAUDE.md` rules and file all recall/queries against its wing/backend for the rest of the session.
- **Backend routing (Profile B).** Project-specific recall then the project backend; cross-project / "have I ever..." then the Mempire general brain, even from inside a project.
- **Child isolation (Profile A).** While awake in a child, do not touch the father Mempire at all. An explicit "back to desktop" / "regresa al padre" ends the child scope.
- **Leaving / re-anchoring.** `/awake <other>` re-runs this whole skill against the new target (re-detects the profile, re-launches its local app).
- **Verify flags before trusting them.** `mempalace <cmd> --help` and `mempire ... --help` beat this doc if they disagree.
- **Windows:** Unix-style paths in Bash commands (`/c/Users/<you>/...`); any `/plugin` command or Claude Code restart goes through the user with the `!` prefix.
- **If the palace/wing is empty** but a wiki exists, say so plainly ("verbatim layer never mined for this wing") and lean on the wiki + git for the resume. Offer to run `/arise` to backfill.

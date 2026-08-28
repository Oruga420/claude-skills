---
name: arise
description: Awaken Claude Code for a project with a two-layer memory harness, then bootstrap the right project wiki on top. Foundation (ALL modes): runs the Karpathy LLM Wiki (via /arise-wiki) for curated knowledge, sets up MemPalace (via /arise-mempalace) for verbatim auto-captured recall, and wires an awakening protocol that runs at every session start. On top, choose a mode: Personal (weekly tasks with carry-over, goals, habits, chat-history mining), Laboral (PRDs, call transcripts, org hierarchy, positions, work projects), or Harness-only (just the memory foundation, no task layer). Both task modes are preserved and now sit on the memory harness. All modes wire /compact to auto-update.
---

# /arise - Awaken Claude Code (Memory Harness + Project Wiki)

`/arise` does two things, in order. First it builds a **two-layer memory harness** that wakes Claude Code up for the project: curated knowledge (Karpathy wiki) plus verbatim recall (MemPalace) plus an awakening protocol. Then it layers the **project wiki structure** for your chosen mode on top of that foundation.

The memory foundation is new and universal: every mode now gets it. The Personal and Laboral wiki structures are fully preserved and simply ride on top.

Three modes:
- **Personal** - weekly tasks with carry-over, personal goals, habits, linked to projects. Fed from your chat history automatically.
- **Laboral** - PRDs, call transcripts, org chart, positions, work projects. Structured for team/company context.
- **Harness-only** - just the memory foundation (wiki + palace + awakening). For software projects where you want long-term memory without a task/PRD layer.

> The original `.claude/wiki/` Personal/Laboral structure is unchanged. The memory foundation adds a root-level `wiki/` + `sources/` (Karpathy layer) and a MemPalace palace (verbatim layer). They coexist; nothing is removed.

---

## Phase 0 - Detect Project State

Check the following before anything else:

1. Does `.claude/wiki/index.md` exist?
2. Does `.claude/wiki/overview.md` exist?

**Decision:**
- Both exist → **EXISTING PROJECT** mode (go to Phase 2)
- Neither exists → **NEW PROJECT** mode (go to Phase 1)

---

## Phase 0.5 - Determine Project Type (ALWAYS run, new and existing)

Before gathering any other info, ask:

```
AskUserQuestion:
  question: "What kind of project is this?"
  header: "Project Type"
  options:
    - label: "Personal (Recommended)"
      description: "Personal goals, weekly tasks with carry-over, habits, side projects. Claude mines your chat history to keep it updated."
    - label: "Laboral"
      description: "Work project. Structures PRDs, call transcripts, org hierarchy, positions, decisions, and team projects."
    - label: "Harness-only"
      description: "Software project. Just the memory foundation (Karpathy wiki + MemPalace + awakening). No task or PRD layer."
```

Store the answer as `PROJECT_TYPE = personal | laboral | harness`. All subsequent phases branch on this value. Every type gets the memory foundation in Phase 0.6; only `personal` and `laboral` add a task/PRD structure on top.

---

## Phase 0.6 - Build the Memory Foundation (ALL modes)

This runs for every project type before any mode-specific structure. It is the new universal value: a two-layer memory harness that wakes Claude Code up. Skip nothing here; the Personal/Laboral structure in later phases sits on top of it.

### Layer 1 - Karpathy Wiki (curated knowledge)
Invoke the **arise-wiki** skill (Skill tool) and run its bootstrap: scaffold `sources/` (immutable), `wiki/` (LLM-owned), and `WIKI.md` (schema) at the project root, and write `.claude/rules/arise-wiki.md`. This is curated, interlinked, cited knowledge. If `/arise-wiki` is unavailable, read `~/.claude/skills/arise-wiki/SKILL.md` and execute it inline.

### Layer 2 - MemPalace (verbatim recall)
Invoke the **arise-mempalace** skill (Skill tool) and run its install path: `uv tool install mempalace` (fallback pip), `mempalace init .`, the official Claude Code plugin (`/plugin marketplace add mempalace/mempalace`; `/plugin install mempalace@mempalace`), then backfill with `mempalace mine . --mode projects --wing <project>` and `mempalace mine ~/.claude/projects/ --mode convos --wing <project>`. This is lossless, auto-captured, searchable history. If `/arise-mempalace` is unavailable, read `~/.claude/skills/arise-mempalace/SKILL.md` and execute it inline.

> The two `/plugin` commands and the Claude Code restart are interactive: suggest the user run them with the `!` prefix. Everything else (installs, init, mine) you execute directly.

### The complement (how the two layers work together)
- **Wiki** = synthesized understanding, decisions, "why". Slow, deliberate, cited.
- **Palace** = verbatim recall (96.6% R@5, zero API), captured automatically on Stop and PreCompact.
- Rule: decisions / syntheses / entities go to the wiki; raw evidence (exact quotes, logs, errors, transcripts) stays in the palace verbatim. The wiki points to the palace; the palace never overwrites the wiki.

The awakening protocol and compact wiring for this foundation are added in Phase 4 alongside the mode-specific rules.

---

## Phase 1 - New Project: Interactive Bootstrap

> **Harness-only mode:** the memory foundation built in Phase 0.6 is the whole deliverable. Run only Step 1.1 (so the wiki has a name, description, and goals), then skip the Personal/Laboral questions and Phase 3 structures, and go to Phase 4 to wire the awakening protocol.

### Step 1.1 - Common Questions (both modes)

Ask sequentially, one at a time:

1. **Project name**: "What is the name of this project?"
2. **Description**: "In 2-3 sentences, what does this project do and who is it for?"
3. **Goals**: "What does success look like in 3 months? List 2-4 concrete goals."

### Step 1.2 - Personal Mode Questions

Only if `PROJECT_TYPE = personal`:

4. **Active projects**: "Which projects are you currently working on? List them with a one-line description each. I'll link your tasks to these."
5. **Weekly rhythm**: "What day does your week start? (Monday / Sunday / Other)"
6. **Recurring habits/routines**: "Any recurring habits or routines you want to track? (e.g., 'exercise 3x/week', 'review finances every Friday') Type 'none' to skip."
7. **Carry-over rule**: "When a task isn't done by its due day, how should I handle it?"

```
AskUserQuestion:
  question: "When a task isn't completed on time, how should I handle it?"
  header: "Carry-over"
  options:
    - label: "Auto carry-over to next day (Recommended)"
      description: "Unfinished tasks silently move to tomorrow's list."
    - label: "Carry-over with warning"
      description: "Tasks move forward but are highlighted as overdue."
    - label: "Move to weekly backlog"
      description: "Overdue tasks go to a backlog file, not to tomorrow."
```

8. **Chat history mining**: "Should I mine your recent Claude chat history to pre-fill tasks and context? (yes / no)"

### Step 1.3 - Laboral Mode Questions

Only if `PROJECT_TYPE = laboral`:

4. **Company/team name**: "What is the company or team name?"
5. **Your role**: "What is your role or position?"
6. **Team roster**: "List the people you work with directly (name + role, e.g. 'Ana - Product Manager'). Type 'none' to skip."
7. **Agent harness** (if applicable):

```
AskUserQuestion:
  question: "Does this project use an agent harness?"
  header: "Harness"
  options:
    - label: "OpenClaw"
      description: "Open-source agent framework. Runs via WhatsApp, Telegram, Discord, Slack."
    - label: "NanoClaw"
      description: "Containerized Claude Agent SDK. Docker-isolated filesystem."
    - label: "NemoClaw (NVIDIA)"
      description: "Enterprise OpenClaw with NVIDIA NeMo + NIM guardrails."
    - label: "None / Not applicable"
      description: "No agent harness - this is a standard work wiki."
```

8. **Communication channels** (if harness selected):

```
AskUserQuestion:
  question: "Which channels does your agent operate through?"
  header: "Channels"
  multiSelect: true
  options:
    - label: "WhatsApp"
    - label: "Telegram"
    - label: "Discord"
    - label: "Slack"
```

9. **Existing sources**: "Any documents, PRDs, transcripts, or files to ingest now? List paths or URLs, or type 'none'."
10. **Risks / Constraints**: "Any known constraints? (e.g., 'no PII in wiki', 'all data on-prem')"

**Rule: Do not proceed to Phase 3 until all mode-specific questions are answered.** If the user says a field will stay blank, log it with `> ⚠️ INCOMPLETE:` and document the risk.

---

## Phase 2 - Existing Project: Scan and Sync

### Step 2.1 - Read Everything

Scan in order:
1. `.claude/wiki/overview.md` - current project state + PROJECT_TYPE
2. `.claude/wiki/index.md` - catalog of existing pages
3. `.claude/wiki/log.md` - last 10 entries
4. Mode-specific folders (personal/ or laboral/)
5. Root `README.md`, `package.json`, `pyproject.toml` if present
6. `.claude/CLAUDE.md` if present

### Step 2.2 - Gap Detection

Find every Required Field that is missing, `TBD`, `TODO`, or `unknown`. For each gap, ask the user. Do NOT proceed until every gap is resolved or the user explicitly confirms it stays incomplete with documented risk.

**Required Fields - Both Modes:**
- [ ] Project name and description
- [ ] At least 2 goals
- [ ] PROJECT_TYPE (personal or laboral)

**Required Fields - Personal:**
- [ ] At least 1 active project linked
- [ ] Week start day
- [ ] Carry-over rule
- [ ] Current week task file exists

**Required Fields - Laboral:**
- [ ] Company/team name
- [ ] Your role
- [ ] At least 1 team member (or explicit confirmation team is solo)
- [ ] At least 1 PRD or source ingested (or explicit confirmation none exist)

---

## Phase 3A - Build Wiki Structure: PERSONAL MODE

Create this structure. Never overwrite existing files - append or merge.

```
.claude/
├── CLAUDE.md
├── rules/
│   └── arise.md
├── agents/
│   └── arise-agent.md
└── wiki/
    ├── index.md
    ├── log.md
    ├── schema.md
    ├── overview.md
    ├── sources/
    │   └── _README.md
    └── personal/
        ├── tasks/
        │   ├── week-YYYY-WNN.md     ← current week (e.g. week-2026-W15.md)
        │   ├── backlog.md           ← tasks that were explicitly deferred
        │   └── _archive/            ← completed weeks auto-archived here
        ├── projects.md              ← all active personal projects + status
        ├── habits.md                ← recurring habits and tracking
        ├── goals.md                 ← short/medium/long term goals
        └── journal/
            └── _README.md           ← optional: one file per notable session
```

### Personal File Templates

#### `.claude/wiki/personal/tasks/week-YYYY-WNN.md`
```markdown
# Tasks - Week WNN (YYYY-MM-DD to YYYY-MM-DD)

**Last updated:** YYYY-MM-DD
**Week start:** [Monday/Sunday]
**Related:** [[personal/projects]], [[personal/goals]]

## Monday YYYY-MM-DD
- [ ] [Task] - [[projects/project-name]]
- [ ] [Task]

## Tuesday YYYY-MM-DD
- [ ] [Task]

## Wednesday YYYY-MM-DD
- [ ] [Task]

## Thursday YYYY-MM-DD
- [ ] [Task]

## Friday YYYY-MM-DD
- [ ] [Task]

## Weekend
- [ ] [Task]

---

## Carried Over From Last Week
> Tasks that weren't completed and were automatically moved here.

- [ ] ~~[Original due: Mon YYYY-MM-DD]~~ → [Task description] - [[projects/project-name]]

---

## Completed This Week
- [x] [Task] - completed YYYY-MM-DD
```

#### `.claude/wiki/personal/projects.md`
```markdown
# Active Personal Projects

**Last updated:** YYYY-MM-DD
**Tags:** projects, personal
**Related:** [[personal/goals]], [[personal/tasks/week-current]]

| Project | Description | Status | Last Activity | Notes |
|---------|-------------|--------|---------------|-------|
| [Name] | [1-line desc] | active/paused/done | YYYY-MM-DD | |
```

#### `.claude/wiki/personal/goals.md`
```markdown
# Personal Goals

**Last updated:** YYYY-MM-DD
**Tags:** goals, personal
**Related:** [[personal/projects]], [[personal/habits]]

## Short Term (this month)
1. [Goal] - linked to [[personal/projects/project-name]]

## Medium Term (3-6 months)
1. [Goal]

## Long Term (1+ year)
1. [Goal]
```

#### `.claude/wiki/personal/habits.md`
```markdown
# Habits & Routines

**Last updated:** YYYY-MM-DD
**Tags:** habits, routines, personal

| Habit | Frequency | Tracking | Notes |
|-------|-----------|----------|-------|
| [Habit] | [daily/3x week/etc] | [yes/no] | |
```

### Personal Mode - Carry-Over Logic

At every `/compact` (and at the start of each new week), Claude MUST:

1. **Find unfinished tasks** - scan the current week file for unchecked `- [ ]` items.
2. **Apply carry-over rule**:
   - *Auto carry-over*: Move unchecked tasks to tomorrow's section (or Monday if weekend). No warning.
   - *Carry-over with warning*: Move tasks and prepend `⚠️ OVERDUE (original: YYYY-MM-DD):`.
   - *Move to backlog*: Append to `personal/tasks/backlog.md` with original due date.
3. **New week detection**: If today's date is past the last day of the current week file, create a new `week-YYYY-WNN.md`. Carry over all unfinished tasks from the previous week into the "Carried Over" section.
4. **Archive old weeks**: Move completed week files to `personal/tasks/_archive/` after 4 weeks.

### Personal Mode - Chat History Mining

If the user answered "yes" to chat history mining in Phase 1:

Scan the current session context and recent conversation for:
- Mentioned tasks or to-dos ("I need to...", "don't forget to...", "this week I have to...")
- Project references (any project name from `personal/projects.md`)
- Completed items ("I finished...", "done with...", "shipped...")
- Goals or milestones mentioned

For each item found:
- If it's a task → add to today's slot in the current week file (unconfirmed items marked `- [ ] 💬 [from chat]`)
- If it's a completion → mark the relevant task `[x]` in the week file
- If it's a new project reference → add to `personal/projects.md`
- If it's a goal → add to `personal/goals.md`

Always show the user a summary of what was mined before writing it.

---

## Phase 3B - Build Wiki Structure: LABORAL MODE

```
.claude/
├── CLAUDE.md
├── rules/
│   └── arise.md
├── agents/
│   └── arise-agent.md
└── wiki/
    ├── index.md
    ├── log.md
    ├── schema.md
    ├── overview.md
    ├── sources/
    │   └── _README.md
    └── laboral/
        ├── org/
        │   ├── hierarchy.md         ← company org chart (text/tree format)
        │   ├── positions.md         ← all roles with descriptions + owners
        │   └── my-role.md           ← your specific role, responsibilities, KPIs
        ├── team/
        │   ├── roster.md            ← team members: name, role, contact, joined
        │   └── stakeholders.md      ← external stakeholders, clients, partners
        ├── projects/
        │   ├── _index.md            ← all work projects + status
        │   └── [project-name].md    ← one file per project
        ├── prd/
        │   ├── _index.md            ← catalog of all PRDs
        │   └── [YYYY-MM-DD]-[name].md  ← one file per PRD
        ├── transcripts/
        │   ├── _index.md            ← catalog of all calls/meetings
        │   └── [YYYY-MM-DD]-[topic].md ← one file per call/meeting
        ├── decisions/
        │   └── log.md               ← append-only decision log
        └── queries/
            └── _README.md
```

### Laboral File Templates

#### `.claude/wiki/laboral/org/hierarchy.md`
```markdown
# Company / Team Hierarchy

**Last updated:** YYYY-MM-DD
**Tags:** org, hierarchy, structure
**Related:** [[laboral/org/positions]], [[laboral/team/roster]]

## Organization Tree

[Company Name]
├── [C-Suite / Leadership]
│   ├── [Name] - [Title]
│   └── [Name] - [Title]
├── [Department]
│   ├── [Name] - [Title]
│   └── [Team]
│       ├── [Name] - [Title]  ← YOU
│       └── [Name] - [Title]
└── [Department]
    └── ...

## Reporting Lines
- **I report to:** [Name] - [Title]
- **Reports to me:** [Name] - [Title] / none
```

#### `.claude/wiki/laboral/org/positions.md`
```markdown
# Positions & Roles

**Last updated:** YYYY-MM-DD
**Tags:** positions, roles, org
**Related:** [[laboral/org/hierarchy]], [[laboral/team/roster]]

| Position | Department | Owner | Level | Key Responsibilities | Open? |
|----------|------------|-------|-------|----------------------|-------|
| [Title] | [Dept] | [Name] | [IC/Manager/Director] | [summary] | no |
```

#### `.claude/wiki/laboral/prd/[YYYY-MM-DD]-[name].md`
```markdown
# PRD: [Feature/Product Name]

**Date:** YYYY-MM-DD
**Author:** [Name]
**Status:** draft | review | approved | shipped | deprecated
**Last updated:** YYYY-MM-DD
**Tags:** prd, [feature-area]
**Related:** [[laboral/projects/project-name]]

## Problem Statement
[What problem does this solve? For whom?]

## Goals & Success Metrics
- Goal 1: [metric]
- Goal 2: [metric]

## Non-Goals
- [What this explicitly does NOT do]

## User Stories
- As a [user], I want to [action] so that [outcome].

## Requirements
### Functional
- [ ] [Requirement]

### Non-Functional
- [ ] [Performance / Security / Scale requirement]

## Open Questions
- [ ] [Question] - Owner: [Name] - Due: YYYY-MM-DD

## Decision Log
| Date | Decision | Rationale |
|------|----------|-----------|
| YYYY-MM-DD | [Decision] | [Why] |
```

#### `.claude/wiki/laboral/transcripts/[YYYY-MM-DD]-[topic].md`
```markdown
# [Meeting/Call Title]

**Date:** YYYY-MM-DD
**Time:** HH:MM - HH:MM [timezone]
**Type:** call | standup | review | 1:1 | all-hands | client-call | interview
**Participants:** [Name (Role), Name (Role)]
**Last updated:** YYYY-MM-DD
**Tags:** transcript, [topic-area]
**Related:** [[laboral/projects/project-name]]

## Summary
[2-4 sentence summary of what was discussed and decided]

## Key Points
- [Point 1]
- [Point 2]

## Decisions Made
- [Decision] - Owner: [Name]

## Action Items
- [ ] [Action] - Owner: [Name] - Due: YYYY-MM-DD

## Raw Notes / Transcript
[paste transcript or notes here]
```

#### `.claude/wiki/laboral/decisions/log.md`
```markdown
# Decision Log

Append-only. Most recent at top.
Format: `## [YYYY-MM-DD] [title] - [outcome]`

---

## [YYYY-MM-DD] [Decision Title] - [Approved / Rejected / Deferred]
**Context:** [Why this decision was needed]
**Options considered:** [list]
**Chosen:** [option]
**Rationale:** [why]
**Owner:** [Name]
**Related:** [[laboral/prd/...]] or [[laboral/projects/...]]
```

#### `.claude/wiki/laboral/projects/_index.md`
```markdown
# Work Projects

**Last updated:** YYYY-MM-DD
**Tags:** projects, laboral

| Project | Description | Status | My Role | PRD | Last Activity |
|---------|-------------|--------|---------|-----|---------------|
| [Name] | [1-line] | active/hold/done | [Role] | [[prd/...]] | YYYY-MM-DD |
```

---

## Phase 4 - Wire CLAUDE.md, rules/arise.md, agents/arise-agent.md

### `.claude/CLAUDE.md` - Append this block (create if missing):

```markdown
## ARISE Wiki System

**Mode:** [PERSONAL / LABORAL / HARNESS]

This project uses the ARISE memory harness (inspired by Karpathy's LLM Wiki) plus, for Personal/Laboral modes, a task/PRD wiki.
Mode wiki lives in `.claude/wiki/`. The memory foundation lives in root `wiki/` + `sources/` (Karpathy layer) and a MemPalace palace (verbatim layer). DO NOT delete or reorganize without running `/arise` first.

### AWAKENING PROTOCOL (run at session start, ALWAYS)
1. Read `wiki/index.md` and the last 5 entries of `wiki/log.md` (curated understanding).
2. Run `mempalace wake-up` (verbatim recall of recent and relevant context).
3. For Personal/Laboral: also read the mode wiki (current week tasks, or open PRDs/action items).
4. Report in one line: "Awake. Wiki: N pages. Palace: N drawers / N wings. Mode: X. Last session: DATE."

### Which Memory Layer to Use
- Synthesized knowledge, decisions, architecture, "why" → the **wiki** (read `wiki/`, cite pages).
- Exact recall of what was literally said, a command output, an error, a quote → `mempalace search "..."`.
- Durable insight worth keeping → file to the **wiki**. Raw evidence → the **palace** captures it verbatim automatically.

### How to Use
- Answer questions: read `wiki/index.md` first, then drill into relevant pages.
- Ingest sources: summarize to `wiki/sources/`, update related pages, append to `wiki/log.md`.
- File good answers: save to `wiki/queries/YYYY-MM-DD-topic.md`, link from index.

### PERSONAL MODE - Extra Rules
- Current week tasks: `wiki/personal/tasks/week-YYYY-WNN.md`
- Always check for unfinished tasks before starting work each session.
- Mine chat history for mentioned tasks and completions.
- Apply carry-over rule on every /compact.

### LABORAL MODE - Extra Rules
- PRDs live in `wiki/laboral/prd/` - always link to related project file.
- Transcripts go in `wiki/laboral/transcripts/` - extract action items immediately.
- Decisions go in `wiki/laboral/decisions/log.md` - never leave decisions in chat only.
- Org changes → update `wiki/laboral/org/hierarchy.md` and `positions.md`.

### HARNESS MODE - Extra Rules
- No task or PRD layer. The deliverable is the memory foundation itself.
- Pull understanding from `wiki/`, pull exact history from `mempalace search`.

### On Every /compact - MANDATORY
1. Run the wiki compact checklist in `.claude/rules/arise.md` (and `arise-wiki.md`) BEFORE compacting.
2. The MemPalace PreCompact hook fires automatically and force-saves verbatim context. Do not skip or block it.
```

### `.claude/rules/arise.md`

```markdown
# ARISE Wiki Rules

## Core Principle
The wiki is a persistent, compounding artifact. Every session makes it richer.
Never let knowledge evaporate into chat history.

## Mandatory Compact Checklist (ALL MODES)
Before /compact, Claude MUST:

1. **Log the session**
   Append to `wiki/log.md`:
   ```
   ## [YYYY-MM-DD HH:MM] compact | [topic]
   - [bullet 1 - what was done/learned]
   - [bullet 2]
   ```

2. **Update index** - add any new pages to `wiki/index.md` with one-line summary.

3. **Flag conflicts** - if new info contradicts existing pages, add `> ⚠️ CONFLICT:` blocks.

## Personal Mode - Compact Checklist
Additionally, before /compact:

4. **Task carry-over** - scan current week file for unchecked tasks.
   Apply carry-over rule (auto / warning / backlog) per `wiki/overview.md`.

5. **New week check** - if today is past the last day of the current week file,
   create `wiki/personal/tasks/week-YYYY-WNN.md` and carry over unfinished tasks.

6. **Chat mining** - scan session context for:
   - Mentioned to-dos → add to today's slot in current week file (marked `💬 from chat`)
   - Completed items → mark `[x]` in week file
   - New project refs → add to `personal/projects.md`
   Archive completed week files older than 4 weeks to `personal/tasks/_archive/`.

7. **Update projects.md** - update "Last Activity" for any project touched this session.

## Laboral Mode - Compact Checklist
Additionally, before /compact:

4. **Extract action items** - scan session for any new action items.
   Add unchecked items to the relevant transcript or project file.

5. **Update projects/_index.md** - update "Last Activity" for touched projects.

6. **File decisions** - if any decision was made this session,
   append to `wiki/laboral/decisions/log.md`.

7. **Link orphans** - any new PRD or transcript must be linked from its project file
   and from `wiki/index.md`.

## Integrity Rules (ALL MODES)
- NEVER delete wiki pages. Deprecate with `> ~~outdated~~` if superseded.
- ALWAYS update `wiki/log.md`. It is the source of truth for what happened.
- ALWAYS cross-link related pages. Isolated pages are half-useless.
- NEVER leave `TBD`/`TODO` without a linked owner and due date.
- Carry-over tasks NEVER get silently deleted - they accumulate until done or explicitly deferred.

## Gap Policy
If a Required Wiki Field is missing:
1. Ask the user.
2. If confirmed-incomplete, write `> ⚠️ INCOMPLETE: [reason]` in the relevant page.
3. Document the risk of continuing without it.
```

### `.claude/agents/arise-agent.md`

```markdown
# ARISE Agent

## Identity
ARISE is the persistent knowledge agent for this project.
Mode: **[PERSONAL / LABORAL]**

## Session Start (ALWAYS)
1. Read `wiki/index.md` and last 5 entries of `wiki/log.md`.
2. Check for `> ⚠️ INCOMPLETE:` blocks - report any found.
3. Report: "Wiki loaded. [N] pages. Mode: [personal/laboral]. Last updated [date]."

## Personal Mode Behaviors

### Task Management
- At session start: read current week file. Show today's tasks.
- When user mentions completing something: mark `[x]` in week file immediately.
- When user mentions a new task: add to today's slot in week file.
- At /compact: run carry-over logic per rules/arise.md.

### Project Linking
- Every task MUST link to a project in `[[personal/projects]]` if applicable.
- When user mentions a project: cross-reference with `personal/projects.md`.

### Chat Mining
- Mine every session for mentioned tasks, completions, project refs, and goals.
- Summarize mined items before writing. Never write without showing user first.

### Weekly Summary
On request ("how was my week?" / "weekly review"):
1. Read current week file.
2. Count: tasks done / tasks carried over / tasks in backlog.
3. Show progress per project.
4. Suggest priorities for next week based on incomplete goals.

## Laboral Mode Behaviors

### PRD Handling
User says "write a PRD" or "new PRD for [feature]":
1. Ask for: feature name, problem statement, success metrics, non-goals, user stories.
2. Write to `wiki/laboral/prd/YYYY-MM-DD-[kebab-name].md`.
3. Link from `wiki/laboral/projects/_index.md` and `wiki/index.md`.

### Transcript Handling
User says "log this call" or "ingest this transcript":
1. Ask for: date, participants, type.
2. Extract: summary, decisions, action items.
3. Write to `wiki/laboral/transcripts/YYYY-MM-DD-[topic].md`.
4. Move action items to relevant project file.
5. Append decisions to `wiki/laboral/decisions/log.md`.

### Org Updates
User says "update the org chart" or "new hire [Name] as [Role]":
1. Update `wiki/laboral/org/hierarchy.md`.
2. Add position to `wiki/laboral/org/positions.md`.
3. Add person to `wiki/laboral/team/roster.md`.

### Harness Integration (if harness configured)
- Users interact via configured channels (WhatsApp, Telegram, Discord, Slack).
- ARISE reads messages, retrieves wiki pages, responds in-channel.
- Long answers → file to `wiki/laboral/queries/` and send link.

## Unknown Knowledge Policy (ALL MODES)
If a question can't be answered from the wiki:
1. Say so: "I don't have this in the wiki yet."
2. If user provides the answer, ingest it immediately.
3. Never hallucinate facts not in the wiki.
```

---

## Phase 5 - Ingest Existing Sources

For each source provided by the user:
1. Read it fully.
2. Write summary to `wiki/sources/[kebab-name].md`.
3. **Personal**: link to relevant project in `personal/projects.md`, extract any tasks.
4. **Laboral**: determine type (PRD → `laboral/prd/`, transcript → `laboral/transcripts/`, other → `sources/`). Extract action items.
5. Update `wiki/index.md` and append to `wiki/log.md`.

---

## Phase 6 - Final Report

```
ARISE Wiki bootstrapped.

Project: [name]
Mode: [PERSONAL / LABORAL]

Wiki structure created:
  .claude/wiki/           - [N] pages
  .claude/wiki/personal/  - [tasks/, projects.md, goals.md, habits.md]  (personal only)
  .claude/wiki/laboral/   - [org/, team/, projects/, prd/, transcripts/, decisions/]  (laboral only)
  .claude/rules/arise.md  - compact checklist wired
  .claude/agents/arise-agent.md - agent persona configured
  .claude/CLAUDE.md       - arise section appended

[PERSONAL]
  Active projects: [N]
  Current week file: wiki/personal/tasks/week-YYYY-WNN.md
  Carry-over rule: [auto / warning / backlog]
  Chat mining: [enabled / disabled]

[LABORAL]
  Team members: [N]
  PRDs: [N]
  Transcripts ingested: [N]
  Harness: [name / none]

Open gaps: [N]
[list gaps with risks if any]

Next steps:
  1. /compact will auto-update the wiki and apply carry-over at every session end.
  2. Run /arise anytime to resync or fill gaps.
  3. Personal: start each day by asking "what are my tasks today?"
  4. Laboral: paste a transcript and say "log this call" to ingest it instantly.
```

---

## Ongoing Operations

### Personal - Daily Start
User opens Claude in a personal project:
→ ARISE reads today's tasks from current week file. Shows a clean daily view.

### Personal - Weekly Review
User says "weekly review" or "how was my week?":
→ ARISE reads current week, reports done/pending/carried-over, suggests next week priorities.

### Laboral - Log a Call
User says "log this call" + pastes transcript:
→ Follow Phase 5 transcript ingest path.

### Laboral - New PRD
User says "write a PRD for [feature]":
→ ARISE gathers requirements and writes a structured PRD to `wiki/laboral/prd/`.

### Ingest Any Source (Both Modes)
User says "add [doc] to the wiki":
→ Follow Phase 5 for that source only.

### Lint Pass (Both Modes)
User says "lint the wiki" or "health check":
→ Check: contradictions, orphan pages, missing cross-references, stale claims, unchecked action items older than 7 days, tasks carried over 3+ times.
→ Report findings. Fix what you can. Ask user about the rest.

### Re-Bootstrap (Both Modes)
User says "/arise" on an existing project:
→ Run Phase 0.5 (confirm type), Phase 2 (scan + gap detection), skip to Phase 6 report.
→ NEVER overwrite existing wiki pages - only append and update.

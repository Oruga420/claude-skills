---
name: ultraplan
description: Deep multi-agent exploration and planning for complex tasks. Goes beyond /plan by spawning parallel research agents before building a comprehensive execution plan with dependency graphs and risk assessment. Every plan ships as markdown + an HTML page that is auto-opened in the browser.
---

# Ultraplan

Deep, multi-agent planning for complex tasks. Spawns parallel exploration agents to research the codebase, then synthesizes findings into a comprehensive execution plan.

## When to Activate

- User runs `/ultraplan`
- User asks for "deep planning", "comprehensive plan", or "ultraplan"
- Task is clearly too complex for a simple /plan (multiple systems, large refactors, new architectures)

## How It Differs from /plan

| Aspect | /plan | /ultraplan |
|--------|-------|-----------|
| Research | Reads a few files | Spawns 3-5 parallel agents to explore deeply |
| Scope | Single feature | Cross-cutting concerns, system-wide impact |
| Risk | Basic list | Risk matrix with probability x impact scoring |
| Dependencies | Linear steps | DAG (directed acyclic graph) with parallelism |
| Alternatives | None | Compares 2-3 approaches with trade-offs |
| Artifacts | Chat only | Markdown **and** an HTML plan page, auto-opened in the browser |
| Time | ~2 min | ~5-10 min |
| Best for | Clear, scoped tasks | Ambiguous, complex, or risky changes |

## Workflow

### Phase 1: Task Decomposition (30 seconds)

Parse the user's request and decompose it into research questions:

1. **What** exactly needs to change? (functional requirements)
2. **Where** in the codebase? (affected systems/modules)
3. **Why** this approach? (constraints, trade-offs)
4. **What could go wrong?** (risks, edge cases)
5. **What exists already?** (reusable code, patterns, prior art)

Present the decomposition to the user:

```
===============================================
         ULTRAPLAN — Phase 1: Decomposition
===============================================

Task: {user's request}

Research Questions:
  1. {question about affected systems}
  2. {question about existing patterns}
  3. {question about edge cases}
  4. {question about dependencies}
  5. {question about testing strategy}

Launching {N} exploration agents...
```

### Phase 2: Parallel Exploration (2-5 minutes)

Launch 3-5 Agent subagents IN PARALLEL, each with a focused research mission:

**Agent 1 — Architecture Scout**
- Map the affected modules and their dependencies
- Identify integration points and contracts
- Find related tests and their coverage
- Tools: Glob, Grep, Read

**Agent 2 — Pattern Researcher**
- Find how similar problems were solved in the codebase
- Identify conventions, naming patterns, file organization
- Look for reusable utilities and helpers
- Tools: Grep, Read, Glob

**Agent 3 — Risk Analyst**
- Identify what could break (downstream dependencies)
- Find edge cases in existing code
- Check for concurrent access, race conditions
- Look for hardcoded assumptions that might break
- Tools: Grep, Read

**Agent 4 — Prior Art Scanner**
- Search git history for related changes
- Check if similar features were attempted before
- Look for relevant comments, TODOs, or known issues
- Tools: Bash(git log), Bash(git blame), Grep

**Agent 5 — Test Strategy Planner** (optional, for larger tasks)
- Map existing test coverage for affected areas
- Identify testing gaps
- Determine what new tests are needed
- Tools: Glob, Read, Bash(test runner)

IMPORTANT: Launch ALL agents in a SINGLE message using parallel Agent tool calls. Do NOT launch them sequentially.

### Phase 3: Synthesis (1-2 minutes)

Collect all agent findings and synthesize into a structured plan:

#### 3a. Executive Summary
One paragraph describing the task, approach, and expected outcome.

#### 3b. Approach Comparison
Compare 2-3 possible approaches:

```
+-------------------+--------------+--------------+--------------+
| Criteria          | Approach A   | Approach B   | Approach C   |
+-------------------+--------------+--------------+--------------+
| Complexity        | Low          | Medium       | High         |
| Risk              | Medium       | Low          | Low          |
| Effort            | 3 files      | 7 files      | 12 files     |
| Reversibility     | Easy         | Medium       | Hard         |
| Test Coverage     | Partial      | Full         | Full         |
+-------------------+--------------+--------------+--------------+

Recommended: Approach B — best balance of risk and completeness
```

#### 3c. Execution Plan (DAG)

Present the plan as a dependency graph showing what can run in parallel:

```
Phase 1 (parallel):
  +-- Task 1.1: {description} -> {file(s)}
  +-- Task 1.2: {description} -> {file(s)}
  +-- Task 1.3: {description} -> {file(s)}

Phase 2 (depends on Phase 1):
  +-- Task 2.1: {description} -> {file(s)}
  +-- Task 2.2: {description} -> {file(s)}

Phase 3 (depends on Phase 2):
  +-- Task 3.1: {description} -> {file(s)}

Phase 4 (parallel with Phase 3):
  +-- Task 4.1: Write tests for {X}
  +-- Task 4.2: Write tests for {Y}

Phase 5 (final):
  +-- Task 5.1: Integration test + verification
```

#### 3d. Risk Matrix

```
+--------------------------+-------------+------------+--------------+
| Risk                     | Probability | Impact     | Mitigation   |
+--------------------------+-------------+------------+--------------+
| {risk 1}                 | Medium      | High       | {mitigation} |
| {risk 2}                 | Low         | Critical   | {mitigation} |
| {risk 3}                 | High        | Low        | {mitigation} |
+--------------------------+-------------+------------+--------------+
```

#### 3e. Files Affected

List every file that will be created, modified, or deleted:

```
Modified:
  src/services/auth.ts (lines 45-80)
  src/utils/validation.ts (add new function)

Created:
  src/services/auth.test.ts
  src/types/auth.ts

Deleted:
  src/legacy/oldAuth.ts
```

#### 3f. Verification Checklist

```
Pre-implementation:
  [ ] Backup current state (git stash or branch)
  [ ] Verify test suite passes before changes

Post-implementation:
  [ ] All existing tests still pass
  [ ] New tests written and passing
  [ ] No TypeScript/lint errors
  [ ] Manual smoke test of affected flows
  [ ] Review diff before committing
```

#### 3g. Persist the plan — markdown AND html

Every ultraplan ships as **two** artifacts, both written before the approval gate. The markdown is the
durable, diffable record; the HTML is what the operator (and anyone they forward it to) actually reads.

**1. Markdown.** In a repo with a wiki convention, follow it — e.g.
`.claude/wiki/<area>/projects/<slug>-ultraplan.md` with the standard `**Last updated:** / **Tags:** /
**Related:**` frontmatter. Otherwise `docs/plans/<slug>-ultraplan.md`. Outside any repo, write both
artifacts side by side wherever the plan's subject lives.

**2. HTML — always, no exceptions.** Resolve the renderer in this order and use the FIRST one found:

1. **Repo-local report-it** — `.claude/skills/report-it/scripts/fill_shell.py` in the current repo.
   Use it so plans and reports read as one system: collapsible numbered panels, sticky TOC with
   scrollspy, one-line preview per collapsed section, print path that force-opens every panel.

   ```bash
   # Write the spec first. Block types + spec shape are documented in fill_shell.py's docstring.
   python .claude/skills/report-it/scripts/fill_shell.py \
     --spec <spec>.json --out docs/reports/<slug>-ultraplan.html
   ```

2. **Global report-it** — same script under `~/.claude/skills/report-it/`, same usage.

3. **Fallback template** — `assets/plan-template.html` that ships next to this SKILL.md. Copy it to
   `docs/reports/<slug>-ultraplan.html` and fill every `{{PLACEHOLDER}}`; the template's HTML comments
   say what goes where. Do not restyle it and do not hand-write plan HTML from scratch — the template
   IS the one fallback style.

Because option 3 always exists, an HTML page always ships. "Report-it not found" is never a reason
to skip the HTML.

**Map the plan onto the shell's components** (report-it path). Use these; do not invent markup:

| Plan part | Block type |
|---|---|
| Recommended approach + plan status | `decision` (headline left, verdict right) |
| The 3-5 findings that changed the ask | `signals`; use `cards` with `priority` when they are blockers |
| Scope numbers (phases, LOC, risks, open decisions) | `tiles` |
| The phases and their state | `stages` — `done` / `blocked` / `waiting` / `todo` |
| Approach comparison, constraints, prior art, risk matrix | `table` |
| The DAG and the verification checklist | a raw `<pre>` block |
| Open questions | `cards`, one per decision, each with a `kv` recommendation |

Four rules that keep a plan page honest (they apply to the fallback template too):

- **Every section carries a `preview`** — one line stating the *conclusion*, not a description of the
  contents. It is the only thing a reader sees while the panel is collapsed, so a vague preview wastes
  the whole mechanism.
- **Open only what must be read**: the summary and the open-questions section. Collapse the rest.
- **`hero_status` states the plan's own status** — e.g. *"Plan only · nothing implemented · awaiting
  approval on 3 decisions"*. A plan that looks like a progress report is a false green.
- **The footer carries provenance**: how many agents researched it, over what, and an explicit
  "nothing in this plan has been implemented" line. If a constraint has no file, line or measured
  command behind it, label it an assumption in the plan itself.

Before opening it for the operator, render a headless screenshot and LOOK at it — broken markup or an
empty panel found by the operator is a failed plan delivery:

```bash
"<chrome>" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=3000 \
  --user-data-dir="<throwaway-dir>" --window-size=1400,2200 \
  --screenshot="<tmp>/plan.png" "file:///<abs>/docs/reports/<slug>-ultraplan.html"
```

#### 3h. Open the plan in the browser — mandatory, every time

The last act of Phase 3, immediately before the approval gate: open the rendered HTML in the
operator's default browser. Do it yourself, without asking — the operator reviews the page, not the
terminal.

```bash
# Windows (PowerShell):  Start-Process "<abs-path>\<slug>-ultraplan.html"
# Windows (Git Bash):    cmd.exe /c start "" "<abs-path>/<slug>-ultraplan.html"
# macOS:                 open "<abs-path>/<slug>-ultraplan.html"
# Linux:                 xdg-open "<abs-path>/<slug>-ultraplan.html"
```

If the open command fails (headless box, no display), say so explicitly and print the absolute path —
never skip the attempt silently.

### Phase 4: Approval Gate

Present the complete plan and WAIT for user approval:

```
===============================================
         ULTRAPLAN — Ready for Execution
===============================================

{Executive summary}

Estimated scope: {N} files, {M} phases
Recommended approach: {approach name}
Key risk: {highest risk item}

Plan written to: {path}.md
            and: {path}.html   (opened in your browser — that is the reviewable version)

Proceed with execution? [y/n/modify]
```

- **y**: Begin execution following the DAG order
- **n**: Cancel and discard the plan
- **modify**: User provides feedback, return to Phase 3

DO NOT proceed with any code changes until the user explicitly approves.

## Important Notes

- This skill is for PLANNING ONLY — it does not execute code changes unless the user explicitly approves after Phase 4. Writing the two plan artifacts (§3g) and opening the HTML (§3h) are not code changes; do both before the gate.
- Always ship BOTH artifacts and always open the HTML in the browser. A plan nobody reads is a plan nobody approves, and the markdown alone has never been the thing people actually open.
- Always launch exploration agents in PARALLEL for speed
- Each agent should return a concise summary (not raw file dumps)
- If the task is simple enough for /plan, suggest using /plan instead
- The 2-3 approach comparison is critical — never skip it
- Always include the risk matrix — even if risks seem low
- The DAG should show genuine parallelism opportunities, not just sequential steps renamed as "phases"
- Keep the total planning time under 10 minutes

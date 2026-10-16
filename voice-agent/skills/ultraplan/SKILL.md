---
name: ultraplan
description: Deep multi-agent exploration and planning for complex tasks. Goes beyond /plan by spawning parallel research agents before building a comprehensive execution plan with dependency graphs and risk assessment.
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
         ULTRAPLAN, Phase 1: Decomposition
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

**Agent 1, Architecture Scout**
- Map the affected modules and their dependencies
- Identify integration points and contracts
- Find related tests and their coverage
- Tools: Glob, Grep, Read

**Agent 2, Pattern Researcher**
- Find how similar problems were solved in the codebase
- Identify conventions, naming patterns, file organization
- Look for reusable utilities and helpers
- Tools: Grep, Read, Glob

**Agent 3, Risk Analyst**
- Identify what could break (downstream dependencies)
- Find edge cases in existing code
- Check for concurrent access, race conditions
- Look for hardcoded assumptions that might break
- Tools: Grep, Read

**Agent 4, Prior Art Scanner**
- Search git history for related changes
- Check if similar features were attempted before
- Look for relevant comments, TODOs, or known issues
- Tools: Bash(git log), Bash(git blame), Grep

**Agent 5, Test Strategy Planner** (optional, for larger tasks)
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

Recommended: Approach B, best balance of risk and completeness
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

#### 3g. HTML plan page (MANDATORY, not optional)

Every ultraplan ALSO ships as a single-file HTML page so the operator can read it comfortably. The chat summary stays, but the HTML is the primary reading surface.

- **File:** `ultraplan.html` at the root of the target project (or inside the feature folder if the plan is scoped to one, e.g. `web-budget/ultraplan.html`). If a previous ultraplan HTML exists for a DIFFERENT plan, use `ultraplan-<slug>.html`; if it is the SAME plan being revised, regenerate the same file.
- **Look and feel:** use the project's own theme if it has one, otherwise a clean neutral theme. Barlow or a similar clean font from Google Fonts, sticky translucent topbar, uppercase eyebrow labels, clamp() hero title, white cards with 14-16px radius and subtle borders, tables with a dark header row, status pills. Vanilla HTML/CSS in one file, no frameworks, no CDN JS.
- **Sections, in order:** hero (plan title + date + scope line), stat band (key numbers from the research: files affected, phases, estimated effort, blockers), Executive summary, Approach comparison (table, recommended row highlighted), Execution plan (phases as cards or a table showing what runs in parallel), Risk matrix (table with probability/impact pills), Files affected, Approval checklist (pending/done pills).
- **House rules:** English content. NEVER em dashes or en dashes.
- **Every revision updates the HTML, no exceptions.** Whenever the operator asks for ANY change to an
  ultraplan (during the approval gate or later), the same HTML file gets regenerated with the change,
  a visible revision marker (rev 2, rev 2.1...) in the title/topbar, the change reflected in every
  affected section (summary, phases, risks, costs, checklist), and the file reopened in the browser.
  Answering the change only in chat without touching the HTML is a violation: the HTML is the primary
  reading surface, so a stale HTML is a wrong plan.
- **Open it in the browser immediately** after writing (Windows: `cmd //c start "" "<path>"`, macOS: `open`, Linux: `xdg-open`) so the operator sees it without asking.
- The HTML is a LOCAL planning artifact: never deploy it, never publish it, never push it without the operator's OK.
- Delegating the HTML build to a subagent (a fast implementation agent) while the main session continues is encouraged; give it the full plan content and the style reference.

### Phase 4: Approval Gate

Present the complete plan and WAIT for user approval:

```
===============================================
         ULTRAPLAN, Ready for Execution
===============================================

{Executive summary}

Estimated scope: {N} files, {M} phases
Recommended approach: {approach name}
Key risk: {highest risk item}

Proceed with execution? [y/n/modify]
```

- **y**: Begin execution following the DAG order
- **n**: Cancel and discard the plan
- **modify**: User provides feedback, return to Phase 3

DO NOT proceed with any code changes until the user explicitly approves.

## Important Notes

- This skill is for PLANNING ONLY, it does not execute code changes unless the user explicitly approves after Phase 4
- Always launch exploration agents in PARALLEL for speed
- Each agent should return a concise summary (not raw file dumps)
- If the task is simple enough for /plan, suggest using /plan instead
- The 2-3 approach comparison is critical, never skip it
- Always include the risk matrix, even if risks seem low
- The DAG should show genuine parallelism opportunities, not just sequential steps renamed as "phases"
- Keep the total planning time under 10 minutes

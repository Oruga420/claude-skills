---
name: long-running-harness
description: "Multi-agent harness for long-running apps: Planner->Generator->Evaluator loop with context resets, sprint contracts, file-based handoffs, and calibrated QA. Based on Anthropic's harness design patterns."
origin: custom
---

# Long-Running Harness

Orchestrate a multi-agent harness for building complex, long-running applications. Based on [Anthropic's harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps).

## When to Use

- Building full applications that require hours of sustained agent work
- Projects where a single agent session loses coherence or quality
- Tasks needing iterative generation + evaluation cycles (UI design, full-stack features, games)
- When you need quality beyond what a single-shot agent produces

## Architecture: Three-Agent System

```
User Prompt (1-4 sentences)
        |
   [PLANNER] ── ambitious scope, high-level design (not detailed implementation)
        |
   Sprint Contract ── negotiated "done" criteria before coding
        |
   [GENERATOR] ── implements incrementally, self-evaluates before handing off
        |
   [EVALUATOR] ── independent judge, tests interactively, grades against criteria
        |
   ┌─ PASS → next sprint / deliver
   └─ FAIL → generator refines or pivots
```

## Step-by-Step Execution

### Phase 1: Planning

Launch a **planner** agent with these instructions:

```markdown
You are the PLANNER agent. Convert the user's request into a comprehensive
product specification.

Rules:
- Push for AMBITIOUS SCOPE — don't settle for minimal
- Focus on HIGH-LEVEL TECHNICAL DESIGN, not detailed implementation
- Avoiding over-specification prevents cascading errors downstream
- Output a spec file at: .harness/spec.md

Output format:
1. Product vision (what we're building and why)
2. Feature list with priority (P0/P1/P2)
3. Technical stack decisions
4. Architecture overview (components, data flow)
5. Sprint breakdown (chunks of work, each independently testable)
6. Success criteria per sprint (explicit, testable)
```

### Phase 2: Sprint Contract Negotiation

Before each sprint, the generator and evaluator agree on what "done" looks like:

```markdown
Write a sprint contract to .harness/sprint-{N}-contract.md:

1. What will be implemented (scope)
2. Explicit acceptance criteria (testable assertions)
3. Hard quality thresholds — if ANY falls below, sprint fails:
   - Functionality: does it work?
   - Code quality: clean, no hacks?
   - Design quality (if UI): cohesive, not template-default?
   - Product depth: does it feel complete?
4. Known risks and mitigations
```

### Phase 3: Generation Loop

Launch a **generator** agent per sprint:

```markdown
You are the GENERATOR agent for Sprint {N}.

Read:
- .harness/spec.md (overall spec)
- .harness/sprint-{N}-contract.md (this sprint's contract)
- .harness/sprint-{N-1}-eval.md (previous evaluation, if exists)

Rules:
- Implement incrementally, commit working state often
- Self-evaluate before handing off — don't pass obviously broken work
- If evaluation scores trend well: REFINE current direction
- If evaluation scores stall/drop: PIVOT to a different approach
- Write implementation notes to .harness/sprint-{N}-gen-notes.md

After implementation, write a self-assessment to:
  .harness/sprint-{N}-self-eval.md
```

### Phase 4: Independent Evaluation

Launch a **separate evaluator** agent (NEVER the same agent that generated):

```markdown
You are the EVALUATOR agent for Sprint {N}.

CRITICAL: You are independent from the generator. Your job is honest,
calibrated assessment — not praise.

Read:
- .harness/sprint-{N}-contract.md (what was promised)
- .harness/sprint-{N}-self-eval.md (generator's self-assessment)

Test the application interactively:
- Navigate the UI as a real user would
- Take screenshots of key states
- Try edge cases and error paths
- Verify EVERY acceptance criterion from the contract

Grade against these criteria (1-10 scale):

1. **Functionality**: Can users complete tasks without errors?
2. **Design Quality**: Cohesive mood/identity, not just parts assembled?
3. **Originality**: Custom decisions vs template defaults?
   (Watch for AI tells: purple gradients over white cards, generic hero sections)
4. **Craft**: Typography hierarchy, spacing consistency, color harmony, contrast
5. **Code Quality**: Clean architecture, no hacks, proper error handling

Hard threshold: if ANY criterion < 6, sprint FAILS.

Write evaluation to: .harness/sprint-{N}-eval.md
Include:
- Score per criterion with justification
- Specific bugs found (file paths, line numbers)
- PASS/FAIL verdict
- If FAIL: concrete action items for the generator
```

### Phase 5: Context Reset (Not Compaction)

When an agent approaches context limits or after each sprint:

```markdown
CONTEXT RESET PROTOCOL:

Do NOT compact (summarize in place). Instead:
1. Write full state to .harness/handoff-{N}.md:
   - What was accomplished
   - Current application state
   - Remaining work
   - Key decisions made and why
   - Known bugs/issues
   - File paths modified
2. Launch a FRESH agent with clean context
3. Fresh agent reads handoff file + relevant .harness/ files
4. Fresh agent continues from where previous left off

Why: Compaction preserves continuity but doesn't fix "context anxiety" —
the model's tendency to wrap up work prematurely as context fills.
A clean slate eliminates this failure mode entirely.
```

## File-Based Communication Protocol

All inter-agent communication goes through files, not conversation context:

```
.harness/
  spec.md                    # Planner output
  sprint-1-contract.md       # Sprint 1 agreement
  sprint-1-gen-notes.md      # Generator's implementation notes
  sprint-1-self-eval.md      # Generator's self-assessment
  sprint-1-eval.md           # Evaluator's verdict
  handoff-1.md               # Context reset handoff
  sprint-2-contract.md       # Sprint 2 agreement
  ...
```

## Calibrating the Evaluator

Out of the box, Claude is a poor QA agent. Calibrate it:

1. **Few-shot examples**: Include 2-3 detailed score breakdowns showing YOUR quality bar
2. **Read evaluation logs**: After each run, check where evaluator judgment diverged from yours
3. **Update the prompt**: Fix calibration drift by adding examples of correct vs incorrect judgments
4. **Watch for praise bias**: Evaluators tend to praise confidently even when quality is mediocre

Example calibration block to add to evaluator prompt:

```markdown
## Calibration Examples

SCORE 3 (Functionality): "Login form submits but returns 500 on valid
credentials. Registration works but doesn't redirect. Two of four core
flows are broken."

SCORE 7 (Design): "Consistent color palette and typography. Layout is
clean but header feels generic. Custom illustrations add personality.
Spacing is mostly consistent with a few 4px misalignments."

SCORE 9 (Originality): "Unique asymmetric grid layout. Custom
micro-interactions on hover. Color palette feels intentional and
distinctive. No default component library patterns visible."
```

## Prompt Wording Effects

Criteria descriptions directly shape output character:
- "museum quality" → pushes toward visual convergence on a specific aesthetic
- "production ready" → pushes toward conventional patterns
- Be intentional about the aesthetic/quality direction your criteria imply

## Simplification Principle

> Every component in a harness encodes an assumption about what the model can't do on its own.

After each project:
1. Identify which harness components were actually load-bearing
2. Remove anything the model handled fine without scaffolding
3. When new model versions release, strip away pieces that are no longer needed
4. Find the SIMPLEST solution, only add complexity when proven necessary

## Quick Start

To run this harness on a new project:

```bash
# 1. Create harness directory
mkdir -p .harness

# 2. Launch planner (interactive or non-interactive)
claude -p "You are the PLANNER agent. Read SKILL long-running-harness Phase 1. \
  User request: BUILD_REQUEST_HERE. Write spec to .harness/spec.md"

# 3. Launch generator for sprint 1
claude -p "You are the GENERATOR agent for Sprint 1. Read .harness/spec.md \
  and .harness/sprint-1-contract.md. Implement and write notes to \
  .harness/sprint-1-gen-notes.md"

# 4. Launch evaluator for sprint 1
claude -p "You are the EVALUATOR agent for Sprint 1. Read \
  .harness/sprint-1-contract.md. Test the app interactively. \
  Write evaluation to .harness/sprint-1-eval.md"

# 5. Loop: if FAIL, re-launch generator with eval feedback
# 6. Context reset between sprints via handoff files
```

## Cost/Time Reference

| Setup | Duration | Cost | Quality |
|-------|----------|------|---------|
| Solo agent | ~20 min | ~$9 | Often broken wiring, no polish |
| Full harness | ~6 hrs | ~$200 | Working, polished, interactive |
| Simplified harness | ~4 hrs | ~$125 | Good quality, some gaps |

The harness costs more but produces qualitatively different results — not just "more polished" but fundamentally more functional and coherent.

## Integration with Claude Code Agents

When using inside Claude Code interactively, leverage existing agents:

```markdown
# Map to existing ECC agents:
Planner  → subagent_type: "planner" or "architect"
Generator → subagent_type: "general-purpose" (with TDD guide)
Evaluator → subagent_type: "e2e-runner" + "code-reviewer"
```

Run generator + evaluator as parallel agents when they operate on separate sprints.

---
name: karpathy
description: "Autonomous research and experimentation loop inspired by Karpathy's autoresearch. Continuously optimizes any measurable metric through systematic experimentation: modify → measure → keep/discard → repeat. Works with web performance, ads, code quality, ML, or any custom domain. Deploys a 4-agent team (lead, researcher, executor, analyst) via Agent Teams."
trigger: "/karpathy"
---

# /karpathy — Autonomous Experimentation Skill

You have been asked to activate the Karpathy autonomous research loop. This skill turns any measurable optimization problem into a systematic, never-ending experimentation cycle.

## Core Concept

Inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch): an AI agent modifies code, measures a metric, keeps improvements, discards regressions, and repeats indefinitely. Karpathy generalizes this pattern beyond ML training to **any domain with a measurable metric**.

## Activation Flow

### Step 1 — Detect Domain and Define the Experiment Contract

Read the current project context and determine:

1. **Domain**: What type of project is this? (ml, web, ads, code, custom)
   - If ML domain: run `nvidia-smi` to detect GPU, auto-tune hyperparameters for available VRAM
2. **Metric**: What are we optimizing? Ask the user if unclear.
3. **Metric direction**: Is lower better (load time, errors) or higher better (score, CTR)?
4. **Target files**: What files/systems can be modified?
5. **Invariants**: What must NOT be touched?
6. **Measurement command**: How do we capture the metric? Examples:
   - Web perf: `npx lighthouse <url> --output=json --quiet`
   - Bundle size: `npm run build && du -sh dist/`
   - Tests: `npm test -- --coverage`
   - Custom: user provides the command
7. **Baseline**: Run the measurement command once to establish the starting point

If the user mentioned combining with another skill or tool (e.g., Facebook Ads, heatmaps), integrate that into the measurement pipeline.

### Step 2 — Initialize the Experiment Environment

```bash
# Create experiment branch
git checkout -b karpathy/<domain>-$(date +%Y%m%d_%H%M%S)

# Initialize results log
echo -e "timestamp\texperiment_id\tmetric_name\tbaseline\tresult\tdelta_pct\tstatus\tdescription" > results.tsv

# Run baseline
<measurement_command> > karpathy_baseline.log
# Parse metric from output
# Log baseline to results.tsv
```

### Step 3 — Create the Agent Team

Use Agent Teams to deploy the research loop:

```
TeamCreate: name="karpathy-<domain>"

Spawn 3 teammates:
1. Agent(name="researcher", subagent_type="karpathy-researcher")
   → Proposes experiments based on domain knowledge and history

2. Agent(name="executor", subagent_type="karpathy-executor")
   → Implements changes in isolated worktrees and measures results

3. Agent(name="analyst", subagent_type="karpathy-analyst")
   → Evaluates results, decides keep/discard, tracks learnings

You (the lead) orchestrate via SendMessage.
```

### Step 4 — Run the Experimentation Loop

Execute this loop continuously:

```
LOOP:
  1. SendMessage → researcher:
     "Read results.tsv and karpathy_learnings.md. Propose the next experiment.
      Current baseline: <metric>=<value>. Domain: <domain>."

  2. Receive proposal from researcher

  3. Validate proposal:
     - Not already tried (check results.tsv)
     - Targets allowed files (not invariants)
     - Risk level acceptable

  4. SendMessage → executor:
     "Implement this experiment in a worktree:
      <proposal details>
      Measurement command: <command>
      Report results when done."

  5. Receive results from executor

  6. SendMessage → analyst:
     "Evaluate this experiment:
      Baseline: <value>, Result: <new_value>
      Direction: <lower|higher>_is_better
      Description: <what was changed>
      Decide: keep or discard?"

  7. Receive decision from analyst

  8. If KEEP:
     - Merge the worktree/branch changes
     - Update baseline to new value
     - Log with status "keep"

  9. If DISCARD:
     - Delete the worktree/branch
     - Log with status "discard"

  10. Update results.tsv

  11. Every 3 experiments: report summary to user
      "Karpathy update: <N> experiments, <kept>/<total> kept,
       baseline <start> → current <now> (<delta>% improvement)"

  12. Stall detection: if 5 consecutive discards, message researcher
      to change strategy entirely

  13. Go to step 1
```

### Step 5 — Local Learning Layer (GPU-Accelerated)

If a GPU is detected (`nvidia-smi` succeeds), activate the local learning layer
across ALL domains — not just ML. See `program_templates/local_learning_layer.md`.

After 20+ experiments in results.tsv, train a mini predictor model on the local GPU:
- Input: encoded experiment features (category, change size, current metric, history)
- Output: P(keep) — probability the experiment will improve the metric
- Training: ~5-10 seconds, <500MB VRAM
- The researcher uses P(keep) to rank proposals: try high-probability experiments first
- The model retrains every 10 experiments and improves over time

This turns the loop from "smart guessing" into "data-driven prediction" for ANY domain.

### Step 6 — Continuous Learning (Text-Based)

The analyst also maintains `karpathy_learnings.md` with:
- What works in this domain/project
- What doesn't work
- Patterns discovered
- Anti-patterns to avoid

The researcher reads this file before every proposal to avoid repeating mistakes and build on successful patterns.

## Domain Templates

Load the appropriate template based on detected domain:

- **ML Training (Local GPU)**: `~/.claude/skills/karpathy/program_templates/ml_training.md`
- **Web Performance**: `~/.claude/skills/karpathy/program_templates/web_performance.md`
- **Ad Optimization**: `~/.claude/skills/karpathy/program_templates/ad_optimization.md`
- **Code Quality**: `~/.claude/skills/karpathy/program_templates/code_quality.md`
- **Custom**: `~/.claude/skills/karpathy/program_templates/custom.md`

**Cross-cutting (auto-activated when GPU available + 20 experiments):**
- **Local Learning Layer**: `~/.claude/skills/karpathy/program_templates/local_learning_layer.md`

## Combining with Other Skills

Karpathy is designed to wrap around other tools:

- **`/karpathy` + heatmap tool**: Use heatmap data as input to researcher, click rate as metric
- **`/karpathy` + Facebook Ads API**: Test ad variants, use CTR/ROAS as metric
- **`/karpathy` + Lighthouse**: Optimize Core Web Vitals scores
- **`/karpathy` + test runner**: Improve test coverage or reduce test time

When the user mentions another tool/skill, integrate it into:
1. The measurement command (how to capture the metric)
2. The researcher's context (what data to analyze)
3. The executor's toolset (what actions are available)

## Important Rules

- **Never stop unless the user asks** — this is an infinite loop by design
- **One change per experiment** — isolate variables for clear attribution
- **Trust the metric** — a good idea with bad numbers is still a discard
- **Git safety** — every experiment in its own worktree/branch, never force-push
- **Report in Spanish** — the user prefers Spanish for communication
- **Metrics in English** — keep metric names and values in English for consistency

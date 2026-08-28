# Karpathy Program: Custom Domain

## Setup Checklist

Before starting the loop, define these with the user:

### 1. Metric Definition
- **Name**: (e.g., "response_time", "accuracy", "user_satisfaction")
- **Unit**: (e.g., ms, %, score, count)
- **Direction**: lower_is_better | higher_is_better
- **Threshold**: Minimum improvement to count as "keep" (default: 0.5%)

### 2. Measurement Command
```bash
# The command that produces the metric value
# Must output a parseable line like: metric_name: <value>
# Must be deterministic (same input → same output ± noise)
# Must complete in < 10 minutes
<user_provides_command>
```

### 3. Target Files
List the files/directories that experiments can modify:
```
<user_provides_list>
```

### 4. Invariants
List the files/systems that must NOT be touched:
```
<user_provides_list>
```

### 5. Constraints
- Max experiment duration: (default: 10 minutes)
- Resource limits: (e.g., max memory, max API calls)
- Acceptable tradeoffs: (e.g., "memory can increase 20% if metric improves 5%+")
- Off-limits approaches: (e.g., "don't add new dependencies")

## Experiment Strategy

Since this is a custom domain, the researcher should:

1. **Start by understanding**: Read all target files thoroughly
2. **Web research**: Search for best practices in this specific domain
3. **Incremental approach**: Small changes first, bigger experiments after patterns emerge
4. **Document everything**: The learning log is especially important for custom domains since there are no pre-built heuristics

## Adapting the Loop

For custom domains that don't fit the standard loop:

### Semi-Automated Metrics
If the metric can't be fully automated:
1. Executor implements the change
2. Lead asks user to measure (e.g., "please check the dashboard and report the new value")
3. Analyst evaluates based on user-reported metric

### Multi-Metric Optimization
If optimizing multiple metrics simultaneously:
1. Define a **composite score**: weighted average of normalized metrics
2. Or use **Pareto dominance**: keep only if ALL metrics improve or none worsen
3. Track each metric separately in results.tsv

### Long-Running Experiments
If experiments take > 10 minutes to measure:
1. Reduce experiment frequency
2. Run measurement in background
3. Queue multiple proposals while waiting for results
4. Use proxy metrics for quick screening, full metric for final decision

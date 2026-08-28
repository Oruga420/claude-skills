---
name: session-insights
description: Analyze your Claude Code session history to generate usage insights, friction analysis, and personalized suggestions.
---

# Session Insights

Analyze your Claude Code usage history to understand your patterns, friction points, and opportunities for improvement.

## When to Activate

- User runs `/session-insights`
- User asks "how am I using Claude Code?" or "analyze my sessions"
- User wants to understand their Claude Code usage patterns

## Workflow

### Step 1: Collect Session Data

Scan the session history directory for `.jsonl` files:

```bash
find ~/.claude/projects/ -name "*.jsonl" -type f 2>/dev/null | head -50
```

For each session file found, extract basic metadata:

```bash
# Count sessions and get date range
for f in $(find ~/.claude/projects/ -name "*.jsonl" -type f 2>/dev/null | head -50); do
  lines=$(wc -l < "$f")
  modified=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null)
  echo "$f|$lines|$modified"
done
```

### Step 2: Parse Session Logs

For each session file, read and analyze the JSONL content. Extract:

1. **Message counts**: Count lines with `"type":"user"` and `"type":"assistant"`
2. **Tool usage**: Extract tool names from `"type":"tool_use"` blocks, count each
3. **Languages**: Extract file extensions from `file_path` parameters in tool calls
4. **Git operations**: Count occurrences of `git commit` and `git push` in Bash commands
5. **Token usage**: Sum `input_tokens` and `output_tokens` from usage blocks
6. **Errors**: Count `"is_error":true` in tool results
7. **Timestamps**: Extract timestamps for duration and activity patterns

Use node one-liners to parse efficiently:

```bash
# Extract tool usage counts from a session
node -e "
const fs = require('fs');
const lines = fs.readFileSync(process.argv[1], 'utf8').split('\n').filter(Boolean);
const tools = {};
for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    if (obj.type === 'assistant' && obj.message?.content) {
      const content = Array.isArray(obj.message.content) ? obj.message.content : [];
      for (const block of content) {
        if (block.type === 'tool_use' && block.name) {
          tools[block.name] = (tools[block.name] || 0) + 1;
        }
      }
    }
  } catch {}
}
console.log(JSON.stringify(tools, null, 2));
" "$SESSION_FILE"
```

### Step 3: Aggregate Across Sessions

Combine data from all sessions into an aggregated report:

- **Total sessions, messages, duration**
- **Top tools** (sorted by usage count)
- **Top languages** (sorted by file count)
- **Git activity** (total commits, pushes)
- **Token consumption** (total input/output, estimated cost)
- **Error rate** (total errors / total tool calls)
- **Activity patterns** (most active hours, days)
- **Projects** (which directories were worked in most)

### Step 4: Analyze Patterns

With the aggregated data, generate narrative insights across these sections:

#### 4a. At a Glance
Quick summary dashboard:
- Sessions analyzed, date range, total hours
- Total messages, tokens used, estimated cost
- Lines added/removed, files modified
- Git commits and pushes

#### 4b. Project Areas
Identify 4-5 distinct project areas from the session data. For each:
- Name and session count
- Description of what was worked on

#### 4c. Interaction Style
Analyze HOW the user interacts with Claude:
- Do they iterate quickly or provide detailed specs upfront?
- Do they interrupt often or let Claude run?
- Do they use advanced features (agents, MCP, skills)?
- Average response time between messages

#### 4d. What Works Well
Identify 3 impressive workflows or approaches:
- Effective use of tools
- Good prompting patterns
- Successful multi-step tasks

#### 4e. Friction Analysis
Identify 3 friction categories with specific examples:
- Where Claude misunderstands requests
- Where wrong approaches are taken
- Where tool errors occur most

Categories to classify friction:
- `misunderstood_request`: Claude interpreted incorrectly
- `wrong_approach`: Right goal, wrong solution method
- `buggy_code`: Code didn't work correctly
- `user_rejected_action`: User said no/stop to a tool call
- `excessive_changes`: Over-engineered or changed too much
- `slow_or_verbose`: Slow or verbose responses
- `wrong_file_or_location`: Wrong file or location
- `tool_failed`: Tool failed unexpectedly

#### 4f. Suggestions
Provide actionable recommendations:

**CLAUDE.md Additions**: Instructions that appeared in multiple sessions (things the user keeps repeating — these should go in CLAUDE.md so they don't have to say them again). PRIORITIZE instructions that appear in 2+ sessions.

**Features to Try**: From this list, recommend 2-3 based on usage patterns:
1. **MCP Servers** — connect Claude to external tools/databases via `claude mcp add`
2. **Custom Skills** — reusable prompts as SKILL.md files invoked with `/command`
3. **Hooks** — auto-run shell commands on lifecycle events via settings.json
4. **Headless Mode** — run Claude from scripts/CI with `claude -p "prompt"`
5. **Task Agents** — spawn sub-agents for parallel work

**Usage Patterns**: 2-3 specific prompts the user can copy-paste to try.

#### 4g. On the Horizon
3 ambitious opportunities for autonomous workflows based on the user's work patterns. Think big: autonomous agents, parallel exploration, iterating against tests.

### Step 5: Format and Present

Present the report in a clean, readable format:

```
===============================================
         Claude Code — Session Insights
===============================================

AT A GLANCE
---------------------------------------------
Sessions: {N}  |  Date range: {start} to {end}
Total hours: {H}  |  Messages: {M}
Tokens: {input} in / {output} out  |  Est. cost: ${cost}
Lines: +{added} -{removed}  |  Files: {modified}
Git: {commits} commits, {pushes} pushes

PROJECT AREAS
---------------------------------------------
{areas with descriptions}

YOUR INTERACTION STYLE
---------------------------------------------
{narrative}

WHAT'S WORKING
---------------------------------------------
{impressive workflows}

FRICTION POINTS
---------------------------------------------
{friction categories with examples}

SUGGESTIONS
---------------------------------------------
{CLAUDE.md additions, features to try, usage patterns}

ON THE HORIZON
---------------------------------------------
{future opportunities}
```

## Session Facet Extraction

For deeper analysis, classify each session using this prompt pattern:

```
Analyze this Claude Code session and extract structured facets:

1. goal_categories: Count ONLY what the USER explicitly asked for
   - DO NOT count Claude's autonomous codebase exploration
   - ONLY count when user says "can you...", "please...", "I need..."

2. user_satisfaction_counts: Base ONLY on explicit user signals
   - "great!", "perfect!" -> happy
   - "thanks", "looks good" -> satisfied
   - "ok, now let's..." -> likely_satisfied
   - "that's not right" -> dissatisfied

3. friction_counts: Be specific about what went wrong
   - misunderstood_request, wrong_approach, buggy_code
   - user_rejected_action, excessive_changes

4. outcome: fully_achieved | mostly_achieved | partially_achieved | not_achieved

5. brief_summary: One sentence — what user wanted and whether they got it
```

## Cost Estimation

Use approximate token rates for cost estimation:
- **Opus**: $15/M input, $75/M output
- **Sonnet**: $3/M input, $15/M output
- **Haiku**: $0.25/M input, $1.25/M output

## Important Notes

- Only analyze the most recent 50 sessions to keep analysis manageable
- Skip very short sessions (< 3 messages) as they're likely warmups
- Use `node -e` for JSON parsing since bash can't handle complex JSONL
- Respect privacy: don't include full prompts or sensitive content in the report
- Focus on patterns and trends, not individual session details
- Multi-clauding detection: look for overlapping timestamps across sessions within 30-min windows (user working with multiple Claude sessions simultaneously)

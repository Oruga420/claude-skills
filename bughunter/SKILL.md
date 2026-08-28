---
name: bughunter
description: Systematically hunt for bugs in your codebase using static analysis patterns, common vulnerability checks, and contextual code review. Inspired by Anthropic's internal /bughunter command.
---

# Bug Hunter

Systematically scan your codebase for potential bugs, vulnerabilities, and code quality issues.

## When to Activate

- User runs `/bughunter`
- User asks to "find bugs", "hunt for bugs", or "scan for issues"
- User wants a comprehensive code quality audit

## Workflow

Execute ALL steps. Do not skip any. Report findings at each stage.

### Step 1: Scope the Hunt

Ask the user (or infer from context):

> **What should I scan?**
> - A specific file or directory?
> - The entire project?
> - Only recently changed files (git diff)?

If no specific scope given, default to scanning recently changed files:

```bash
git diff --name-only HEAD~5 2>/dev/null || git diff --name-only --cached 2>/dev/null || echo "NO_GIT"
```

If NO_GIT, scan the current working directory for source files.

Detect the primary language(s) in scope:
```bash
# Count files by extension
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" -o -name "*.go" -o -name "*.rs" -o -name "*.java" \) 2>/dev/null | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -5
```

### Step 2: Category Scan — Error Handling Issues

Search for common error handling anti-patterns:

**Empty catch blocks** (errors silently swallowed):
- Pattern: `catch` blocks with no logging, re-throw, or meaningful handling
- Grep for: `catch.*\{[\s]*\}`, `catch.*pass`, `except.*pass`

**Unchecked return values**:
- Functions that return errors/nulls but callers don't check
- Pattern: calls to functions known to return Result/Option/null without checking

**Missing error propagation**:
- Async functions without try/catch
- Promise chains without .catch()
- Pattern: `async function` without corresponding try/catch

For each file in scope, use Grep and Read to identify these patterns. Report findings with file path, line number, and severity.

### Step 3: Category Scan — Null/Undefined Safety

**Potential null pointer access**:
- Optional chaining missing where needed
- Pattern: accessing `.property` on potentially null values
- Look for: function parameters that could be undefined but are used without checks

**Array out of bounds**:
- Accessing array[0] without checking array.length
- Pattern: direct index access without bounds checking

**Type coercion bugs** (JavaScript/TypeScript):
- `==` instead of `===`
- Implicit boolean coercion of objects that could be 0 or empty string

### Step 4: Category Scan — Concurrency & Race Conditions

**State mutations in async code**:
- Shared mutable state accessed from async contexts
- Pattern: variables modified inside Promise.all callbacks

**Missing await**:
- Async functions called without await
- Pattern: async function calls without `await` keyword before them

**Race conditions in React/UI**:
- State updates after component unmount
- Pattern: setState calls inside async callbacks without cleanup

### Step 5: Category Scan — Security Vulnerabilities

**Injection risks**:
- String concatenation in SQL queries (SQL injection)
- Template literals in shell commands (command injection)
- Unsanitized HTML (XSS)
- Pattern: `exec(`, `eval(`, backtick interpolation in system commands

**Sensitive data exposure**:
- Hardcoded secrets, API keys, passwords
- Pattern: `password =`, `api_key =`, `secret =`, `token =` with string literals
- Grep for: `AKIA`, `sk-`, `ghp_`, `Bearer ` in source files

**Insecure configurations**:
- CORS set to `*`
- Disabled CSRF protection
- HTTP instead of HTTPS

### Step 6: Category Scan — Logic Bugs

**Off-by-one errors**:
- Loop boundaries: `<` vs `<=`, `i = 0` vs `i = 1`
- Array slicing: `.slice(0, n)` vs `.slice(0, n+1)`

**Incorrect boolean logic**:
- Complex conditions with mixed `&&` and `||` without parentheses
- Negation errors: `!a && !b` vs `!(a || b)`

**Dead code / unreachable paths**:
- Code after return/throw/break
- Conditions that are always true/false
- Unused variables and imports

**Resource leaks**:
- File handles, database connections, event listeners not cleaned up
- Pattern: `open`/`create` without corresponding `close`/`destroy`/`removeListener`

### Step 7: Category Scan — API & Integration Bugs

**Incorrect API usage**:
- Wrong HTTP methods (GET with body, POST without body)
- Missing error handling for network failures
- Hardcoded URLs that should be configurable

**Data validation gaps**:
- API endpoints accepting unvalidated input
- Missing schema validation on request/response bodies
- Type mismatches between frontend and backend

### Step 8: Compile Bug Report

After scanning all categories, compile findings into a structured report:

```
═══════════════════════════════════════════════
              BUG HUNTER REPORT
═══════════════════════════════════════════════

SCAN SUMMARY
─────────────────────────────────────────────
Files scanned: {N}
Languages: {languages}
Scope: {scope description}

CRITICAL ({count})
─────────────────────────────────────────────
{For each critical finding:}
  Location: {file}:{line}
  Bug: {description}
  Fix: {suggested fix}

HIGH ({count})
─────────────────────────────────────────────
{For each high finding:}
  Location: {file}:{line}
  Bug: {description}
  Fix: {suggested fix}

MEDIUM ({count})
─────────────────────────────────────────────
{...}

LOW ({count})
─────────────────────────────────────────────
{...}

RECOMMENDATIONS
─────────────────────────────────────────────
1. {Top priority fix}
2. {Second priority}
3. {Third priority}
```

### Severity Classification

| Severity | Criteria |
|----------|----------|
| **CRITICAL** | Security vulnerabilities, data loss risk, crash-causing bugs |
| **HIGH** | Logic errors that produce wrong results, unhandled errors in critical paths |
| **MEDIUM** | Code quality issues that could become bugs, missing validation |
| **LOW** | Style issues, minor anti-patterns, potential improvements |

## Important Notes

- ALWAYS read the actual code before reporting a bug — don't report based on grep pattern alone
- Verify each finding by reading surrounding context (at least 10 lines before and after)
- Don't report false positives — if unsure, mark as "potential issue" with lower severity
- Focus on bugs that could cause real problems, not style preferences
- If the codebase has tests, check if the potential bug is already tested
- Prioritize findings by impact: data loss > security > crashes > wrong results > quality
- For each finding, provide a concrete fix suggestion, not just the problem description

---
name: skill-shed
description: "Search the skill shed (GitHub repo backlog) for skills not installed locally. Fallback when local skills don't cover the user's domain. Activate with natural language like 'more skills', 'skill shed', 'find a skill for X', or 'check the shed'."
user_invocable: true
args: "[search query]"
---

# Skill Shed — Remote Skill Discovery & Install

Search the skill shed at `Oruga420/claude-code-skills` for skills beyond what's installed locally. Use this as a fallback when:
- A local skill doesn't fully satisfy the user's request
- The user asks for help in a domain not covered locally (e.g., Java, Swift, Go, Django, C++)
- The user explicitly says "more skills", "skill shed", "check the shed", or "find a skill for X"

## Activation Triggers

This skill activates on natural language matching:
- "more skills", "skill shed", "check the shed"
- "find a skill for [topic]", "is there a skill for [topic]"
- "I need [framework/language] patterns"
- After a local skill search yields no results or the user isn't satisfied

## Skill Shed Registry

The shed contains **77 skills** organized by category. Below is the full index with install commands.

### AI & Agent Patterns
| Skill | Description | Install |
|-------|-------------|---------|
| agent-harness-construction | Design AI agent action spaces and tool definitions | `cp -r ~/tmp/shed/agent-harness-construction ~/.claude/skills/` |
| agentic-engineering | Eval-first execution, decomposition, cost-aware routing | `cp -r ~/tmp/shed/agentic-engineering ~/.claude/skills/` |
| ai-first-engineering | Operating model for AI-heavy teams | `cp -r ~/tmp/shed/ai-first-engineering ~/.claude/skills/` |
| autonomous-loops | Sequential pipelines to multi-agent DAG systems | `cp -r ~/tmp/shed/autonomous-loops ~/.claude/skills/` |
| continuous-agent-loop | Autonomous loops with quality gates and recovery | `cp -r ~/tmp/shed/continuous-agent-loop ~/.claude/skills/` |
| continuous-learning | Extract patterns from sessions as learned skills | `cp -r ~/tmp/shed/continuous-learning ~/.claude/skills/` |
| continuous-learning-v2 | Instinct-based learning with confidence scoring | `cp -r ~/tmp/shed/continuous-learning-v2 ~/.claude/skills/` |
| cost-aware-llm-pipeline | Model routing, budget tracking, prompt caching | `cp -r ~/tmp/shed/cost-aware-llm-pipeline ~/.claude/skills/` |
| enterprise-agent-ops | Long-lived agent workloads with observability | `cp -r ~/tmp/shed/enterprise-agent-ops ~/.claude/skills/` |
| eval-harness | Eval-driven development framework | `cp -r ~/tmp/shed/eval-harness ~/.claude/skills/` |
| iterative-retrieval | Progressive context retrieval for subagents | `cp -r ~/tmp/shed/iterative-retrieval ~/.claude/skills/` |
| karpathy | 4-agent autonomous research loop | `cp -r ~/tmp/shed/karpathy ~/.claude/skills/` |
| long-running-harness | Planner→Generator→Evaluator with sprint contracts | `cp -r ~/tmp/shed/long-running-harness ~/.claude/skills/` |
| nanoclaw-repl | Zero-dependency session-aware REPL | `cp -r ~/tmp/shed/nanoclaw-repl ~/.claude/skills/` |
| ralphinho-rfc-pipeline | RFC-driven multi-agent DAG with merge queues | `cp -r ~/tmp/shed/ralphinho-rfc-pipeline ~/.claude/skills/` |

### Backend & Databases
| Skill | Description |
|-------|-------------|
| api-design | REST API patterns — naming, pagination, versioning, rate limiting |
| backend-patterns | Node.js, Express, Next.js backend architecture |
| clickhouse-io | ClickHouse query optimization and analytics |
| database-migrations | Schema changes, rollbacks, zero-downtime across ORMs |
| deployment-patterns | CI/CD, Docker, health checks, rollback strategies |
| docker-patterns | Compose, security, networking, volumes |
| postgres-patterns | PostgreSQL optimization, Supabase best practices |

### Java & Spring Boot
| Skill | Description |
|-------|-------------|
| java-coding-standards | Naming, immutability, Optional, streams, generics |
| jpa-patterns | Entity design, relationships, transactions, auditing |
| springboot-patterns | REST API, layered services, caching, async |
| springboot-security | Authn/authz, CSRF, rate limiting |
| springboot-tdd | JUnit 5, Mockito, Testcontainers, JaCoCo |
| springboot-verification | Build, analysis, tests, security scans |

### Django
| Skill | Description |
|-------|-------------|
| django-patterns | DRF, ORM, caching, signals, middleware |
| django-security | Auth, CSRF, SQL injection, XSS prevention |
| django-tdd | pytest-django, factory_boy, mocking |
| django-verification | Migrations, linting, tests, deployment readiness |

### Go
| Skill | Description |
|-------|-------------|
| golang-patterns | Idiomatic Go for robust applications |
| golang-testing | Table-driven tests, benchmarks, fuzzing |

### Python
| Skill | Description |
|-------|-------------|
| python-patterns | PEP 8, type hints, Pythonic best practices |
| python-testing | pytest, TDD, fixtures, parametrization |

### C++
| Skill | Description |
|-------|-------------|
| cpp-coding-standards | C++ Core Guidelines — modern, safe practices |
| cpp-testing | GoogleTest/CTest, coverage, sanitizers |

### TypeScript/JS & Frontend
| Skill | Description |
|-------|-------------|
| coding-standards | Universal TS/JS/React/Node standards |
| frontend-patterns | React, Next.js, state management, performance |
| frontend-slides | Animation-rich HTML presentations |

### Swift & iOS
| Skill | Description |
|-------|-------------|
| foundation-models-on-device | Apple FoundationModels, @Generable, iOS 26+ |
| liquid-glass-design | iOS 26 Liquid Glass material system |
| swift-actor-persistence | Thread-safe persistence with actors |
| swift-concurrency-6-2 | Swift 6.2 @concurrent, isolated conformances |
| swift-protocol-di-testing | Protocol-based DI for testable Swift |
| swiftui-patterns | @Observable, navigation, performance |

### Testing & Quality
| Skill | Description |
|-------|-------------|
| bughunter | Static analysis, vulnerability checks, code review |
| e2e-testing | Playwright, Page Object Model, CI/CD |
| tdd-workflow | 80%+ coverage — unit, integration, E2E |
| verification-loop | Comprehensive verification system |

### Security
| Skill | Description |
|-------|-------------|
| security-review | Auth, input, secrets, API endpoints, payments |
| security-scan | Scan .claude/ for vulnerabilities and injection risks |
| st3gg | Steganography — encode/decode hidden data in images |

### Content & Business
| Skill | Description |
|-------|-------------|
| article-writing | Long-form content in distinctive voice |
| content-engine | Multi-platform content for X, LinkedIn, TikTok, YouTube |
| investor-materials | Pitch decks, memos, financial models |
| investor-outreach | Cold emails, warm intros, investor comms |
| market-research | Competitive analysis, due diligence, intelligence |

### Claude Code Tooling
| Skill | Description |
|-------|-------------|
| configure-ecc | Interactive ECC installer |
| plankton-code-quality | Auto-format + lint on every edit via hooks |
| psmux | Terminal multiplexer for Agent Teams |
| search-first | Research-before-coding workflow |
| session-insights | Session history analysis and suggestions |
| skill-stocktake | Audit skills for quality |
| strategic-compact | Context compaction at logical intervals |
| ultraplan | Deep multi-agent exploration and planning |

### Design Patterns & Reference
| Skill | Description |
|-------|-------------|
| content-hash-cache-pattern | SHA-256 content hash caching |
| project-guidelines-example | Production skill template |
| regex-vs-llm-structured-text | Regex vs LLM decision framework |

### GCP & Google Workspace
| Skill | Description |
|-------|-------------|
| conectaesamamada | Step-by-step GCP connection |
| gws-installer | Google Workspace CLI setup |
| refresh-google-tokens | Refresh gcloud + ADC tokens |

### Operations & Documents
| Skill | Description |
|-------|-------------|
| nutrient-document-processing | PDF/DOCX processing via Nutrient API |
| onboard | Employee onboarding workflow |
| visa-doc-translate | Bilingual visa document translation |

## Workflow

When this skill is triggered, follow these steps:

### Step 1: Understand what the user needs
Parse the user's request to identify:
- Domain (e.g., "Spring Boot", "Go testing", "investor pitch")
- Task type (e.g., patterns, testing, security, content)

### Step 2: Check local skills first
```bash
ls ~/.claude/skills/
```
If a matching skill exists locally, use it. Only proceed to the shed if:
- No local match exists
- The user explicitly wants to browse the shed
- The local skill didn't satisfy the request

### Step 3: Search the shed
Match the user's need against the registry above. Present the top 1-3 matches with descriptions.

### Step 4: Offer to install
For each match, offer two options:

**Option A — Temporary load (this session only):**
Fetch the SKILL.md content directly and apply it in the current conversation:
```bash
gh api repos/Oruga420/claude-code-skills/contents/{skill-name}/SKILL.md \
  --jq '.content' | base64 -d
```

**Option B — Permanent install:**
Clone and copy the skill locally:
```bash
# If repo not cloned yet
git clone https://github.com/Oruga420/claude-code-skills.git ~/tmp/shed 2>/dev/null

# Copy specific skill
cp -r ~/tmp/shed/{skill-name} ~/.claude/skills/
```

### Step 5: Apply the skill
Once loaded or installed, immediately apply the skill's patterns to the user's current task.

## Example Interactions

**User:** "I need to set up a Spring Boot project with security"
**Response:** "No Spring Boot skills installed locally. The shed has: springboot-patterns, springboot-security, springboot-tdd. Want me to load them for this session or install permanently?"

**User:** "check the shed for Go stuff"
**Response:** "Found 2 Go skills: golang-patterns (idiomatic Go) and golang-testing (table-driven tests, benchmarks, fuzzing). Install both?"

**User:** "skill shed" (no specific query)
**Response:** Show the full categorized list and ask what domain they're interested in.

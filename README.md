# Claude Code Skills & Commands

A curated collection of **95 skills** and **44 slash commands** for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), the AI-powered CLI by Anthropic. Built on top of the [Everything Claude Code (ECC)](https://github.com/nicobailey/everything-claude-code) ecosystem.

Skills teach Claude domain-specific patterns, workflows, and best practices. Commands give you one-word shortcuts to trigger complex workflows.

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/Oruga420/claude-code-skills.git
cd claude-code-skills

# Install all skills + commands
cp -r */ ~/.claude/skills/ 2>/dev/null
cp commands/*.md ~/.claude/commands/ 2>/dev/null

# Or install a single skill
cp -r karpathy/ ~/.claude/skills/karpathy/

# Or symlink (stays in sync with repo)
ln -s "$(pwd)/karpathy" ~/.claude/skills/karpathy
```

Once installed, Claude Code auto-detects skills when relevant. You can also invoke them directly:
- *"use the karpathy skill to optimize my lighthouse score"*
- `/tdd` to start test-driven development
- `/plan` to create an implementation plan

---

## Skills

### 📚 LLM Wiki & Knowledge Systems

Persistent, compounding knowledge bases powered by LLMs. Inspired by [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — instead of re-deriving knowledge from scratch every session, these skills build a wiki that gets richer over time.

| Skill | Description |
|-------|-------------|
| [arise](./arise/) | Awaken Claude Code with a two-layer memory harness, then layer a project wiki on top. **Foundation (all modes)**: Karpathy LLM Wiki (curated, via arise-wiki) + MemPalace (verbatim recall, via arise-mempalace) + an awakening protocol at every session start. **Personal mode**: weekly tasks with carry-over, goals, habits, chat history mining. **Laboral mode**: PRDs, call transcripts, org hierarchy, positions, work projects. **Harness-only mode**: just the memory foundation. Wires `/compact` to auto-update every session |
| [arise-wiki](./arise-wiki/) | Pure Karpathy LLM Wiki over immutable sources: three layers (sources / wiki / schema) and three operations (Ingest, Query, Lint) with citations and conflict flagging. Layer 1 of /arise; runs standalone for research, book/paper companions, or competitive analysis |
| [arise-mempalace](./arise-mempalace/) | Install and usage guide for [MemPalace](https://github.com/mempalace/mempalace): local-first verbatim AI memory (96.6% R@5, zero API). Package install, palace init, official Claude Code plugin + auto-save hooks, backfill of past sessions, and search. Layer 2 of /arise; runs standalone |
| [karpathy](./karpathy/) | Autonomous research and experimentation loop inspired by Karpathy's autoresearch. Deploys a 4-agent team (Researcher, Executor, Analyst, Lead) to continuously optimize any measurable metric |

### AI & Agent Patterns

| Skill | Description |
|-------|-------------|
| [agent-harness-construction](./agent-harness-construction/) | Design and optimize AI agent action spaces, tool definitions, and observation formatting for higher completion rates |
| [agentic-engineering](./agentic-engineering/) | Operate as an agentic engineer using eval-first execution, decomposition, and cost-aware model routing |
| [ai-first-engineering](./ai-first-engineering/) | Engineering operating model for teams where AI agents generate a large share of implementation output |
| [autonomous-loops](./autonomous-loops/) | Patterns and architectures for autonomous Claude Code loops — from simple sequential pipelines to RFC-driven multi-agent DAG systems |
| [continuous-agent-loop](./continuous-agent-loop/) | Patterns for continuous autonomous agent loops with quality gates, evals, and recovery controls |
| [continuous-learning](./continuous-learning/) | Automatically extract reusable patterns from Claude Code sessions and save them as learned skills |
| [continuous-learning-v2](./continuous-learning-v2/) | Instinct-based learning system with confidence scoring that evolves instincts into skills/commands/agents. v2.1 adds project-scoped instincts |
| [cost-aware-llm-pipeline](./cost-aware-llm-pipeline/) | Cost optimization patterns for LLM API usage — model routing by task complexity, budget tracking, retry logic, and prompt caching |
| [enterprise-agent-ops](./enterprise-agent-ops/) | Operate long-lived agent workloads with observability, security boundaries, and lifecycle management |
| [eval-harness](./eval-harness/) | Formal evaluation framework for Claude Code sessions implementing eval-driven development (EDD) principles |
| [iterative-retrieval](./iterative-retrieval/) | Pattern for progressively refining context retrieval to solve the subagent context problem |
| [long-running-harness](./long-running-harness/) | Multi-agent harness for long-running apps: Planner->Generator->Evaluator loop with context resets and sprint contracts |
| [loop-builder](./loop-builder/) | Interview-driven builder for autonomous agent loops (`/loop-builder`). Sharp questions → `loops/<name>/README.md` loop contract (Goal / Boundaries / SOP / State / Logs), trigger selection (for-loop, cron, event, combo gate script), verifier evidence tiers, and evolve cadence. Ships the original loop-engineering diagrams plus Remotion-animated data-flow videos |
| [nanoclaw-repl](./nanoclaw-repl/) | Operate and extend NanoClaw v2, ECC's zero-dependency session-aware REPL built on `claude -p` |
| [ralphinho-rfc-pipeline](./ralphinho-rfc-pipeline/) | RFC-driven multi-agent DAG execution pattern with quality gates, merge queues, and work unit orchestration |

### Backend & Databases

| Skill | Description |
|-------|-------------|
| [api-design](./api-design/) | REST API design patterns including resource naming, status codes, pagination, filtering, error responses, versioning, and rate limiting |
| [backend-patterns](./backend-patterns/) | Backend architecture patterns, API design, database optimization, and server-side best practices for Node.js, Express, and Next.js |
| [clickhouse-io](./clickhouse-io/) | ClickHouse database patterns, query optimization, analytics, and data engineering best practices |
| [database-migrations](./database-migrations/) | Database migration best practices for schema changes, rollbacks, and zero-downtime deployments across PostgreSQL, MySQL, and common ORMs |
| [deployment-patterns](./deployment-patterns/) | Deployment workflows, CI/CD pipeline patterns, Docker containerization, health checks, and rollback strategies |
| [docker-patterns](./docker-patterns/) | Docker and Docker Compose patterns for local development, container security, networking, and volume strategies |
| [postgres-patterns](./postgres-patterns/) | PostgreSQL database patterns for query optimization, schema design, indexing, and security. Based on Supabase best practices |

### Java & Spring Boot

| Skill | Description |
|-------|-------------|
| [java-coding-standards](./java-coding-standards/) | Java coding standards for Spring Boot services: naming, immutability, Optional usage, streams, exceptions, generics, and project layout |
| [jpa-patterns](./jpa-patterns/) | JPA/Hibernate patterns for entity design, relationships, query optimization, transactions, auditing, indexing, and pagination |
| [springboot-patterns](./springboot-patterns/) | Spring Boot architecture patterns, REST API design, layered services, data access, caching, async processing, and logging |
| [springboot-security](./springboot-security/) | Spring Security best practices for authn/authz, validation, CSRF, secrets, headers, rate limiting, and dependency security |
| [springboot-tdd](./springboot-tdd/) | Test-driven development for Spring Boot using JUnit 5, Mockito, MockMvc, Testcontainers, and JaCoCo |
| [springboot-verification](./springboot-verification/) | Verification loop for Spring Boot projects: build, static analysis, tests with coverage, security scans, and diff review |

### Django

| Skill | Description |
|-------|-------------|
| [django-patterns](./django-patterns/) | Django architecture patterns, REST API design with DRF, ORM best practices, caching, signals, and middleware |
| [django-security](./django-security/) | Django security best practices, authentication, authorization, CSRF protection, SQL injection prevention, and XSS prevention |
| [django-tdd](./django-tdd/) | Django testing strategies with pytest-django, TDD methodology, factory_boy, mocking, and coverage |
| [django-verification](./django-verification/) | Verification loop for Django projects: migrations, linting, tests with coverage, security scans, and deployment readiness checks |

### Go

| Skill | Description |
|-------|-------------|
| [golang-patterns](./golang-patterns/) | Idiomatic Go patterns, best practices, and conventions for building robust, efficient, and maintainable Go applications |
| [golang-testing](./golang-testing/) | Go testing patterns including table-driven tests, subtests, benchmarks, fuzzing, and test coverage |

### Python

| Skill | Description |
|-------|-------------|
| [python-patterns](./python-patterns/) | Pythonic idioms, PEP 8 standards, type hints, and best practices for building robust Python applications |
| [python-testing](./python-testing/) | Python testing strategies using pytest, TDD methodology, fixtures, mocking, parametrization, and coverage requirements |

### C++

| Skill | Description |
|-------|-------------|
| [cpp-coding-standards](./cpp-coding-standards/) | C++ coding standards based on the C++ Core Guidelines. Modern, safe, and idiomatic practices |
| [cpp-testing](./cpp-testing/) | C++ testing with GoogleTest/CTest, diagnosing failing or flaky tests, adding coverage and sanitizers |

### TypeScript/JavaScript & Frontend

| Skill | Description |
|-------|-------------|
| [coding-standards](./coding-standards/) | Universal coding standards, best practices, and patterns for TypeScript, JavaScript, React, and Node.js development |
| [frontend-patterns](./frontend-patterns/) | Frontend development patterns for React, Next.js, state management, performance optimization, and UI best practices |
| [frontend-slides](./frontend-slides/) | Create animation-rich HTML presentations from scratch or by converting PowerPoint files |
| [huashu-design](./huashu-design/) | Hi-fi HTML prototyping, interactive demos, slides, animations, design-variant exploration, design-direction advisor, and expert 5-dimension design review. Includes anti-AI-slop checklist, starter components, Playwright verification, and HTML-animation → MP4/GIF export |

### Swift & iOS

| Skill | Description |
|-------|-------------|
| [foundation-models-on-device](./foundation-models-on-device/) | Apple FoundationModels framework for on-device LLM — text generation, guided generation with `@Generable`, tool calling, and streaming in iOS 26+ |
| [liquid-glass-design](./liquid-glass-design/) | iOS 26 Liquid Glass design system — dynamic glass material with blur, reflection, and interactive morphing |
| [swift-actor-persistence](./swift-actor-persistence/) | Thread-safe data persistence in Swift using actors — in-memory cache with file-backed storage |
| [swift-concurrency-6-2](./swift-concurrency-6-2/) | Swift 6.2 Approachable Concurrency — single-threaded by default, `@concurrent` for explicit background offloading |
| [swift-protocol-di-testing](./swift-protocol-di-testing/) | Protocol-based dependency injection for testable Swift code — mock file system, network, and external APIs |
| [swiftui-patterns](./swiftui-patterns/) | SwiftUI architecture patterns, state management with `@Observable`, view composition, navigation, and performance optimization |

### Testing & Quality

| Skill | Description |
|-------|-------------|
| [e2e-testing](./e2e-testing/) | Playwright E2E testing patterns, Page Object Model, configuration, CI/CD integration, and flaky test strategies |
| [playwright-draft-filler](./playwright-draft-filler/) | Install Playwright and auto-fill website forms with your data, saving as **DRAFT only**. Hard safelist/blocklist guards refuse any Publish/Post/Send/Submit click. Includes manual-login `storageState.json` flow, dry-run mode, before/after screenshots, and per-site recipes |
| [tdd-workflow](./tdd-workflow/) | Enforces test-driven development with 80%+ coverage including unit, integration, and E2E tests |
| [verification-loop](./verification-loop/) | A comprehensive verification system for Claude Code sessions |
| [bughunter](./bughunter/) | Systematically hunt for bugs using static analysis patterns, vulnerability checks, and contextual code review |
| [final-review](./final-review/) | Chain bughunter + security-scan + security-review, adversarially verify every finding, and emit one severity-ranked HTML report |
| [buzz-it](./buzz-it/) | Ask another laptop's Claude Code agent for something over the Buzz relay and bring back its reply |

### Security

| Skill | Description |
|-------|-------------|
| [security-review](./security-review/) | Comprehensive security checklist and patterns for authentication, user input, secrets, API endpoints, and payments |
| [security-scan](./security-scan/) | Scan your Claude Code `.claude/` directory for vulnerabilities, misconfigurations, and injection risks |
| [st3gg](./st3gg/) | Steganography toolkit — encode text/files into images, decode hidden data, and analyze images for steganographic content |

### Content & Business

| Skill | Description |
|-------|-------------|
| [article-writing](./article-writing/) | Write articles, guides, blog posts, and long-form content in a distinctive voice derived from supplied examples |
| [content-engine](./content-engine/) | Create platform-native content for X, LinkedIn, TikTok, YouTube, newsletters, and multi-platform campaigns |
| [investor-materials](./investor-materials/) | Create pitch decks, one-pagers, investor memos, accelerator applications, and financial models |
| [investor-outreach](./investor-outreach/) | Draft cold emails, warm intros, follow-ups, and investor communications for fundraising |
| [market-research](./market-research/) | Conduct market research, competitive analysis, investor due diligence, and industry intelligence |
| [suno-creator](./suno-creator/) | Generate Suno AI-ready song output — style prompt, lyrics, title, and production context from a song concept |
| [orugas-design-studio](./orugas-design-studio/) | Generate images with Gemini 3 (flash/pro) and Imagen — aspect ratios, references, img2img edits, search grounding, camera/lighting/style controls |

### Creative Media

| Skill | Description |
|-------|-------------|
| [seedance-animator](./seedance-animator/) | Interactive anime video pipeline via Replicate — Nano Banana 2 for character sheets/style/storyboard, Seedance 2 or Seedance 2 Lite for animation. Multi-agent orchestration with /arise + /karpathy + /ralphinho-rfc-pipeline improvement loops |
| [oruga-blender](./oruga-blender/) | Image-to-3D asset pipeline for Blender — Nano Banana 2 generates candidate images on Replicate, you pick one at a mandatory checkpoint, Hunyuan3D 3.1 turns it into a textured mesh, and the Blender MCP imports it. Versioned output per generation round |
| [ruche](./ruche/) | Explains the current Claude Code conversation as a narrated video: Remotion render, Krea 2 images on the local GPU (free) or gpt-image via Replicate when a plate needs readable text, ElevenLabs voice-over plus optional music and SFX, hard 1 USD budget cap |

### Claude Code Tooling

| Skill | Description |
|-------|-------------|
| [configure-ecc](./configure-ecc/) | Interactive installer for Everything Claude Code — select and install skills and rules to user or project directories |
| [plankton-code-quality](./plankton-code-quality/) | Write-time code quality enforcement — auto-formatting, linting, and Claude-powered fixes on every file edit via hooks |
| [psmux](./psmux/) | Toggle psmux (terminal multiplexer) for Claude Code Agent Teams |
| [session-insights](./session-insights/) | Analyze your Claude Code session history to generate usage insights, friction analysis, and personalized suggestions |
| [skill-stocktake](./skill-stocktake/) | Audit Claude skills and commands for quality. Supports Quick Scan and Full Stocktake modes |
| [strategic-compact](./strategic-compact/) | Suggests manual context compaction at logical intervals to preserve context through task phases |
| [ultraplan](./ultraplan/) | Deep multi-agent exploration and planning — spawns parallel research agents before building comprehensive execution plans |
| [livetrack](./livetrack/) | Live progress board (`/livetrack`) for a project, ticket or task — self-refreshing HTML backed by one JSON state file, updated the moment each task starts or finishes, each decision is taken, each blocker hits or clears. Progress bar per task, what done looks like, how it was verified, plus a "needs you" section |
| [search-first](./search-first/) | Research-before-coding workflow. Search for existing tools, libraries, and patterns before writing custom code |
| [skill-shed](./skill-shed/) | Search the GitHub skill backlog for skills not installed locally — fallback when local skills don't cover a domain |
| [watch](./watch/) | Give Claude a video input: downloads with yt-dlp, extracts scene-aware frames with ffmpeg, pulls the transcript from captions (or Whisper API fallback) so Claude can answer questions about any video URL or local file |

### Design Patterns & Reference

| Skill | Description |
|-------|-------------|
| [content-hash-cache-pattern](./content-hash-cache-pattern/) | Cache expensive file processing results using SHA-256 content hashes — path-independent, auto-invalidating |
| [regex-vs-llm-structured-text](./regex-vs-llm-structured-text/) | Decision framework for choosing between regex and LLM when parsing structured text |
| [project-guidelines-example](./project-guidelines-example/) | Example project-specific skill template based on a real production application |

### GCP & Google Workspace

| Skill | Description |
|-------|-------------|
| [conectaesamamada](./conectaesamamada/) | Connect to GCP — step-by-step, no fumbling |
| [gws-installer](./gws-installer/) | Interactive installer for Google Workspace CLI (`gws`) — installation, OAuth setup, and authentication |
| [refresh-google-tokens](./refresh-google-tokens/) | Refresh both Google Cloud CLI auth and ADC in one step. Fixes expired token errors |

### Operations & Documents

| Skill | Description |
|-------|-------------|
| [nutrient-document-processing](./nutrient-document-processing/) | Process, convert, OCR, extract, redact, sign, and fill documents using the Nutrient DWS API |
| [onboard](./onboard/) | Onboard a new employee — Google Workspace account, Slack provisioning, and welcome email |
| [sm-post](./sm-post/) | Publish to Twitter/X, LinkedIn, Facebook, Instagram, TikTok, YouTube, Threads, Bluesky, Pinterest, Reddit, Telegram, and Google Business via the Ayrshare API. Accepts inline text, a file path, or inferred content from the conversation |
| [visa-doc-translate](./visa-doc-translate/) | Translate visa application documents to English and create a bilingual PDF |
| [Jira-loop](./Jira-loop/) | Watch one or more Jira tickets on a recurring loop via the Atlassian CLI — detects status/comment changes, researches the open question, and writes a per-ticket Markdown answer file with a proposed answer and implementation plan |

---

## Commands

Slash commands live in [`commands/`](./commands/). Copy them to `~/.claude/commands/` to use.

### Development Workflow

| Command | Description |
|---------|-------------|
| `/plan` | Restate requirements, assess risks, and create step-by-step implementation plan |
| `/tdd` | Enforce test-driven development — scaffold interfaces, generate tests first, then implement |
| `/build-fix` | Fix build errors |
| `/code-review` | Run code quality review |
| `/refactor-clean` | Clean up dead code |
| `/verify` | Run verification loop |
| `/test-coverage` | Generate coverage report |
| `/checkpoint` | Save a checkpoint |
| `/eval` | Run eval framework |
| `/quality-gate` | Run quality gate checks |

### Language-Specific

| Command | Description |
|---------|-------------|
| `/go-test` | Go TDD workflow — table-driven tests first, 80%+ coverage with `go test -cover` |
| `/go-review` | Go code review for idiomatic patterns, concurrency safety, error handling, and security |
| `/go-build` | Fix Go build errors, `go vet` warnings, and linter issues incrementally |
| `/python-review` | Python code review for PEP 8, type hints, security, and Pythonic idioms |

### E2E Testing

| Command | Description |
|---------|-------------|
| `/e2e` | Generate and run Playwright E2E tests with screenshots, videos, and traces |

### Multi-Model Collaboration

| Command | Description |
|---------|-------------|
| `/multi-plan` | Multi-model collaborative planning |
| `/multi-execute` | Multi-model collaborative execution |
| `/multi-workflow` | Multi-model collaborative development |
| `/multi-backend` | Backend-focused multi-model development |
| `/multi-frontend` | Frontend-focused multi-model development |
| `/model-route` | Route tasks to optimal model |
| `/orchestrate` | Multi-agent orchestration |
| `/fable-it` | Fable 5 orchestrator mode: Fable plans and judges, subagents (scout, fast-worker, deep-reasoner) execute |

### Agent Loops & Learning

| Command | Description |
|---------|-------------|
| `/loop-start` | Start an agent loop |
| `/loop-status` | Check loop status |
| `/learn` | Extract reusable patterns from session |
| `/learn-eval` | Learn with self-evaluation before saving |
| `/instinct-status` | Show learned instincts with confidence scores |
| `/instinct-import` | Import instincts from file or URL |
| `/instinct-export` | Export instincts to file |
| `/evolve` | Analyze instincts and suggest evolved structures |
| `/promote` | Promote project-scoped instincts to global |
| `/projects` | List known projects and instinct stats |

### Tools & Utilities

| Command | Description |
|---------|-------------|
| `/claw` | Start NanoClaw v2 — persistent REPL with model routing, skill hot-load, branching, and metrics |
| `/psmux` | Toggle Agent Teams split panes |
| `/sessions` | Session management |
| `/harness-audit` | Audit harness configuration |
| `/hubspot-scan` | HubSpot on-demand activity feed |
| `/onboard` | Onboard a new employee |
| `/pm2` | Initialize PM2 |
| `/setup-pm` | Configure your preferred package manager |
| `/skill-create` | Analyze git history to extract coding patterns and generate SKILL.md files |
| `/update-codemaps` | Update codemaps |
| `/update-docs` | Update documentation |

---

## Creating Your Own Skills

Each skill is a folder with a `SKILL.md` file:

```yaml
---
name: my-skill
description: "One-line description of what the skill does."
---

# My Skill

Instructions, patterns, and examples that teach Claude
how to handle a specific domain or workflow.
```

See [project-guidelines-example](./project-guidelines-example/) for a real-world template.

## Testing

Skills that ship executable scripts (`*.sh`, `*.mjs`, `*.py`) should ship tests under `<skill>/tests/`. Tests use [bats-core](https://github.com/bats-core/bats-core); the runner discovers every `*.bats` file in the repo.

```bash
# Install once
brew install bats-core          # macOS
sudo apt install bats           # Debian/Ubuntu

# Run everything
./tests/run.sh

# Or a single skill
bats ./my-skill/tests/
```

See [`tests/README.md`](./tests/README.md) for conventions, shared helpers, and a copy-pasteable reference suite in [`tests/example/`](./tests/example/). CI runs the full suite on every PR via `.github/workflows/tests.yml`.

## License

MIT for the skills authored in this repo — see [`LICENSE`](./LICENSE).

Three directories are vendored from their original authors and are **not** covered by that
MIT grant. Check their terms before using them commercially or inside a team:

| Directory | Origin | Terms |
|---|---|---|
| [`huashu-design/`](./huashu-design/) | alchaincyf/huashu-design | **Personal Use License** — personal use only. Does not permit company/team integration or delivery to paying clients. |
| [`watch/`](./watch/) | Bradley Bonanno | MIT |
| [`awesome-design-md/`](./awesome-design-md/) | VoltAgent/awesome-design-md | MIT |

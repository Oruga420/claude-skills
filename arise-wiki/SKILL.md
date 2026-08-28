---
name: arise-wiki
description: Build and maintain a Karpathy-style LLM Wiki - a persistent, interlinked markdown knowledge base that sits between you and your raw sources. Faithful to Andrej Karpathy's LLM Wiki pattern (gist 442a6bf5). Three layers (immutable sources / LLM-written wiki / schema) and three operations (Ingest, Query, Lint). Use for research deep-dives, book/paper companions, competitive analysis, or any domain where knowledge should compound over time instead of being rediscovered each session. NOT a task manager - for weekly tasks/PRDs/org use /arise instead.
---

# /arise-wiki - Karpathy LLM Wiki

Inspired by Andrej Karpathy's LLM Wiki pattern (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

> Instead of RAG re-discovering the same facts from raw documents every time, the LLM **incrementally builds and maintains a persistent wiki** - a structured, interlinked collection of markdown files that sits between you and the raw sources. The tedious part (cross-references, contradictions, consistency) is exactly what an LLM is good at and a human never keeps up with.

**Relationship to `/arise`:** `/arise` is a project/task OS (weekly tasks, PRDs, org charts). `/arise-wiki` is the pure knowledge-base pattern over raw sources. They use **different directories** (`wiki/` + `sources/` at project root vs `.claude/wiki/`) and never touch each other's files. If the user wants task tracking, point them to `/arise`.

---

## The Three Layers (the whole mental model)

1. **Raw sources** - `sources/`. Immutable. Articles, papers, PDFs, transcripts, images, data, URLs you've saved. The LLM **reads but NEVER edits or deletes** these.
2. **The wiki** - `wiki/`. Entirely LLM-written. Summaries, entity pages, concept pages, an index, and a log. The LLM owns this layer completely.
3. **The schema** - `WIKI.md` at the project root. The contract: structure, conventions, workflows. This is what turns the model from a chatbot into a disciplined maintainer.

## The Three Operations

- **Ingest** - drop a source → read it, discuss takeaways, write a summary, update every affected page, update the index, append to the log.
- **Query** - ask a question → answer from the wiki with citations; if the answer is valuable, file it back as a page.
- **Lint** - periodic health check → find contradictions, stale claims, orphan pages, missing cross-references; fix what's safe, surface the rest.

---

## Phase 0 - Detect State

Check at project root:
1. Does `WIKI.md` exist?
2. Does `wiki/index.md` exist?

**Decision:**
- Both exist → **EXISTING WIKI** → go to Phase 4 (route to the right operation).
- Neither → **NEW WIKI** → go to Phase 1.

If the user invoked with an obvious intent ("ingest X", "what does the wiki say about Y", "lint the wiki"), skip straight to that operation once the wiki exists.

---

## Phase 1 - New Wiki: Scope It

Ask the user (one at a time, conversational - don't dump a form):

1. **Domain**: "What is this wiki *about*? (e.g. 'transformer interpretability papers', 'my company's competitors', 'the Dune novels', 'longevity research')"
2. **Purpose**: "What do you want to be able to *ask* it later? 2-3 example questions help me shape the structure."
3. **Initial sources**: "Any sources to ingest now? Paste paths, URLs, or text. Or 'none' and we'll start empty."
4. **Location** (default, only confirm if ambiguous): wiki at project root. Confirm if the project already has a `wiki/` used for something else.

Keep it light. The schema adapts to the domain - a paper wiki leans on `concepts/`, a competitor wiki leans on `entities/`. Note which folders matter most for this domain and say so.

---

## Phase 2 - Scaffold the Three Layers

Create at project root (never overwrite - merge/append if anything exists):

```
<project root>/
├── WIKI.md                    ← the schema / contract (see template)
├── sources/                   ← RAW, IMMUTABLE inputs (LLM reads, never edits)
│   └── _index.md              ← catalog of every raw source + its summary link
└── wiki/                      ← LLM-OWNED knowledge layer
    ├── index.md               ← the map: every page, one-line description, grouped
    ├── log.md                 ← append-only activity log (ingests, queries filed, lints)
    ├── summaries/             ← one file per source: summaries/<source-slug>.md
    ├── entities/              ← people, orgs, products, places, datasets
    ├── concepts/              ← ideas, methods, themes, recurring arguments
    └── queries/              ← answers worth keeping: queries/YYYY-MM-DD-<topic>.md
```

Folders are created on first use - don't pre-fill `entities/`/`concepts/` with placeholders. Empty wiki = `index.md` + `log.md` + `WIKI.md` only.

---

## Phase 3 - Write the Schema (`WIKI.md`)

This is the most important artifact. Write it at project root:

```markdown
# WIKI.md - LLM Wiki Schema

This project uses the Karpathy LLM Wiki pattern. You (the LLM) are the **maintainer**.

**Domain:** [what this wiki is about]
**Purpose:** [the kinds of questions it should answer]

## The Three Layers
- `sources/` - RAW inputs. READ-ONLY. Never edit, never delete, never reorganize.
- `wiki/`    - Your knowledge layer. You own it entirely.
- `WIKI.md`  - This file. The contract.

## Page Types (in wiki/)
- `summaries/<slug>.md`   - one per source. What it says, why it matters, links out.
- `entities/<slug>.md`    - a person/org/product/place/dataset. Facts + relations.
- `concepts/<slug>.md`    - an idea/method/theme. Definition, nuance, who says what.
- `queries/YYYY-MM-DD-<topic>.md` - a filed answer worth keeping.
- `index.md`              - the map of everything. Keep it current.
- `log.md`                - append-only. Every ingest/query/lint gets a line.

## Conventions
- Cross-link liberally with `[[wiki/concepts/slug]]` style wikilinks. Isolated pages are half-useless.
- Every page starts with frontmatter: `last_updated`, `tags`, `related` (list of wikilinks), and for summaries a `source:` pointer to the raw file.
- Cite sources inline as `(see summaries/<slug>)` or `[[wiki/summaries/slug]]`.
- When new info contradicts a page, do NOT silently overwrite. Add a `> ⚠️ CONFLICT (YYYY-MM-DD): ...` block and reconcile or flag.
- Never delete a page. Deprecate with `> ~~superseded by [[...]]~~`.
- Never invent facts. If the wiki doesn't know, say so.

## The Three Operations
- **Ingest** (`/arise-wiki ingest <source>`): read → discuss takeaways → write summary → update affected entity/concept pages → update index → append log.
- **Query** (`/arise-wiki <question>`): answer ONLY from the wiki, with citations. If the answer is reusable, file it to `queries/` and link from index.
- **Lint** (`/arise-wiki lint`): scan for contradictions, stale claims, orphan pages (in index but unlinked), missing cross-links, sources with no summary. Fix the safe ones, report the rest.

## On Every /compact - MANDATORY
Before compacting, run the compact checklist in `.claude/rules/arise-wiki.md`.
```

Then append a short pointer to `.claude/CLAUDE.md` (create if missing):

```markdown
## ARISE-Wiki
This project has an LLM Wiki (Karpathy pattern). Schema: `WIKI.md`. Knowledge: `wiki/`. Raw sources: `sources/` (READ-ONLY).
On every /compact, follow `.claude/rules/arise-wiki.md`. Answer questions from the wiki with citations; never invent facts.
```

And write `.claude/rules/arise-wiki.md`:

```markdown
# ARISE-Wiki Rules

## Core Principle
The wiki is a persistent, compounding artifact. Every session makes it richer.
Never let knowledge evaporate into chat history. Sources are immutable; the wiki is yours.

## Mandatory Compact Checklist
Before /compact, you MUST:
1. **Log it** - append to `wiki/log.md`:
   `## [YYYY-MM-DD HH:MM] <ingest|query|lint> - <topic>` + 1-3 bullets.
2. **File valuable answers** - any non-trivial answer produced this session → `wiki/queries/YYYY-MM-DD-<topic>.md`, linked from `wiki/index.md`.
3. **Update affected pages** - if facts changed, update the entity/concept pages and their `last_updated`.
4. **Update index** - every new page must appear in `wiki/index.md` with a one-line description.
5. **Flag conflicts** - new info that contradicts a page → `> ⚠️ CONFLICT:` block, never a silent overwrite.

## Integrity Rules
- NEVER edit or delete anything in `sources/`. Read-only, always.
- NEVER delete a wiki page. Deprecate with `> ~~superseded~~`.
- ALWAYS cross-link related pages.
- ALWAYS cite the source when stating a fact (`[[wiki/summaries/slug]]`).
- NEVER hallucinate. "Not in the wiki yet" is a valid, correct answer.
```

---

## Phase 4 - Operation Router (existing wiki)

Read `wiki/index.md` + last 5 lines of `wiki/log.md` first. Then route on intent:

- "ingest / add / read this source" → **Ingest** (below)
- a question / "what does the wiki say…" → **Query** (below)
- "lint / health check / audit the wiki" → **Lint** (below)
- bare `/arise-wiki` with no intent → report status (page count, last activity, open conflicts) and ask what they want to do.

---

### Operation: INGEST

For each source:
1. **Read it fully.** If a URL, fetch it. If a file, read it. Place/leave the raw artifact under `sources/` (copy text in, or record the path/URL in `sources/_index.md` if it stays external). Never modify the original content.
2. **Discuss takeaways** with the user - 3-5 bullets of what's actually important. This is the human-in-the-loop moment.
3. **Write the summary** → `wiki/summaries/<source-slug>.md`:
   ```markdown
   ---
   last_updated: YYYY-MM-DD
   source: sources/<file-or-url>
   tags: [domain, ...]
   related: [[wiki/concepts/...]], [[wiki/entities/...]]
   ---
   # Summary: <Source Title>

   **What it is:** [1 line]
   **Why it matters:** [1-2 lines for this wiki's purpose]

   ## Key points
   - ...

   ## Connections
   - Confirms / extends / contradicts [[wiki/...]] because ...
   ```
4. **Update affected pages** - for each entity/concept the source touches, create or update its page. New page → minimal stub with frontmatter + what we know + back-link to the summary.
5. **Reconcile** - if the source contradicts an existing page, add a `> ⚠️ CONFLICT:` block; resolve if clear, else flag for the user.
6. **Update `wiki/index.md`** and `sources/_index.md`.
7. **Append `wiki/log.md`.**

### Operation: QUERY

1. Read `wiki/index.md`, then drill into the relevant pages only.
2. Answer **from the wiki**, with inline citations (`[[wiki/summaries/...]]`).
3. If the wiki can't answer: say "I don't have this in the wiki yet." Offer to ingest a source that would.
4. If the answer is reusable/valuable, ask (or just do it for clearly-useful syntheses): file to `wiki/queries/YYYY-MM-DD-<topic>.md`, link from `index.md`, append `log.md`.

### Operation: LINT

Scan and report (fix the safe ones automatically):
- **Contradictions** - pages that disagree; surface both with their sources.
- **Stale claims** - `last_updated` old relative to newer contradicting sources.
- **Orphan pages** - listed in `index.md` but not linked from any other page.
- **Missing cross-links** - pages that mention an entity/concept that has its own page but don't link it.
- **Unsummarized sources** - anything in `sources/` with no `wiki/summaries/` page.
- **Broken wikilinks** - `[[...]]` pointing to non-existent pages.

Output a findings list grouped by severity. Fix link/index/orphan issues directly; ask before resolving substantive contradictions. Append a lint entry to `wiki/log.md`.

---

## Phase 5 - Final Report (after bootstrap or any operation)

```
ARISE-Wiki - <new wiki created | ingested N sources | answered + filed | lint complete>

Domain: <domain>
Layers:
  sources/   - <N> raw sources (immutable)
  wiki/      - <N> pages  (summaries: N, entities: N, concepts: N, queries: N)
  WIKI.md    - schema written
  .claude/rules/arise-wiki.md - compact checklist wired

Open conflicts: <N>  [list if any]
Orphans / gaps: <N>  [list if any]

Next:
  • Ingest:  /arise-wiki ingest <path-or-url>
  • Ask:     /arise-wiki <your question>
  • Audit:   /arise-wiki lint
  • /compact auto-logs the session and files valuable answers.
```

---

## Ongoing Behavior (every session in a wiki project)

- **Session start:** read `wiki/index.md` + last 5 lines of `wiki/log.md`. Report: "Wiki loaded. N pages. Last activity <date>." Surface any open `⚠️ CONFLICT` blocks.
- **Answering anything in-domain:** prefer the wiki, cite pages, never invent.
- **Learning anything new and durable:** offer to ingest/file it instead of letting it die in chat.
- **On /compact:** run the checklist in `.claude/rules/arise-wiki.md`.
- **Sources stay sacred:** read-only, forever.

---
name: notebook-research
description: Create, manage, and query NotebookLM notebooks — add sources, run research, generate audio podcasts, and chat with your knowledge base. Powered by notebooklm-mcp-cli.
origin: custom
invocation: /notebook-research
---

# NotebookLM Research

Research, organize, and synthesize knowledge using Google NotebookLM from Claude Code.

## STEP 0: Bootstrap (MANDATORY — run every time before anything else)

Execute these checks IN ORDER. Stop at the first failure and fix it before continuing.

### 0.1 Check if `nlm` CLI is installed

```bash
PYTHONIOENCODING=utf-8 nlm --version 2>&1
```

**If NOT found:**
1. Install from pip:
   ```bash
   pip install notebooklm-mcp-cli
   ```
2. Verify install:
   ```bash
   PYTHONIOENCODING=utf-8 nlm --version 2>&1
   ```
3. If pip fails, tell user to run manually: `! pip install notebooklm-mcp-cli`

### 0.2 Check if MCP server is registered in Claude Code

```bash
claude mcp list 2>&1 | grep -i notebooklm
```

**If NOT found:**
1. Find the binary path:
   ```bash
   which notebooklm-mcp 2>/dev/null || where notebooklm-mcp 2>/dev/null
   ```
2. Register it:
   ```bash
   claude mcp add notebooklm-mcp -- "<full_path_to_notebooklm-mcp.exe>"
   ```
3. Tell the user: "MCP registered. You'll need to restart this Claude Code session for tools to appear."

### 0.3 Check if authenticated

```bash
PYTHONIOENCODING=utf-8 nlm login --check 2>&1
```

**If auth is valid:** proceed to the user's request.

**If auth fails or no profile exists:**
1. Ask the user: **"Which Google account (email) do you want to use for NotebookLM?"**
2. Wait for their answer. Store the email in a variable, e.g. `user@example.com`
3. Derive a profile name from the email (e.g. `user@company.com` → `company`)
4. Tell the user to run this in their terminal (it opens a browser — Claude Code can't do interactive browser auth):
   ```
   ! $env:PYTHONIOENCODING="utf-8"; nlm login --profile <profile_name>
   ```
5. Tell them: **"Sign in with <their_email> in the browser that opens, then come back here and say 'done'."**
6. When user confirms, verify:
   ```bash
   PYTHONIOENCODING=utf-8 nlm login --check --profile <profile_name> 2>&1
   ```
7. Set as default:
   ```bash
   PYTHONIOENCODING=utf-8 nlm login switch <profile_name> 2>&1
   ```
8. Confirm: "Connected as <email>. You're ready to go."

### 0.4 Bootstrap complete

Once all 3 checks pass, proceed to the user's actual request.

---

## When to Use

- User wants to create a new NotebookLM notebook on a topic
- User wants to add sources (URLs, text, Google Drive files) to a notebook
- User wants to query/chat with notebook contents
- User wants to run web research and import discovered sources
- User wants to generate audio overviews (podcasts) from notebooks
- User wants to list, describe, or manage existing notebooks
- User says "notebook", "NotebookLM", "research notebook", "podcast from sources"

## Environment Note (Windows)

All `nlm` commands MUST be prefixed with `PYTHONIOENCODING=utf-8` to avoid Unicode rendering crashes on Windows cp1252 terminals.

## Available Commands Reference

### Notebook Management
```bash
nlm notebook list                          # List all notebooks (JSON)
nlm notebook create "Title"                # Create new notebook
nlm notebook get <id>                      # Get notebook details
nlm notebook describe <id>                 # AI-generated summary + suggested topics
nlm notebook rename <id> "New Title"       # Rename notebook
nlm notebook delete <id>                   # Delete permanently
nlm notebook query <id> "question"         # Chat with notebook sources
```

### Source Management
```bash
nlm source list <notebook_id>              # List sources in notebook
nlm source add <notebook_id> --url "URL"   # Add URL source
nlm source add <notebook_id> --text "text" # Add text source
nlm source add <notebook_id> --drive "ID"  # Add Google Drive file
nlm source get <notebook_id> <source_id>   # Get source details
nlm source describe <notebook_id> <source_id>  # AI summary of source
nlm source content <notebook_id> <source_id>   # Raw source content
nlm source delete <notebook_id> <source_id>    # Delete source
nlm source stale <notebook_id>             # List Drive sources needing sync
nlm source sync <notebook_id>              # Sync Drive sources
```

### Research (Web Discovery)
```bash
nlm research start <notebook_id> "query"   # Start web research task
nlm research status <notebook_id> <task_id> # Check research progress
nlm research import <notebook_id> <task_id> # Import discovered sources
```

### Audio & Studio
```bash
nlm audio create <notebook_id>             # Generate podcast from sources
nlm studio status <notebook_id>            # List studio artifacts + status
nlm download <notebook_id> <artifact_id>   # Download audio/video/etc.
```

### Cross-Notebook & Batch
```bash
nlm cross query "question"                 # Query across all notebooks
nlm batch <command> --all                  # Run command across notebooks
nlm tag add <notebook_id> "tag"            # Tag a notebook
nlm tag list                               # List all tags
```

### Pipelines
```bash
nlm pipeline list                          # List available pipelines
nlm pipeline run <notebook_id> <pipeline>  # Execute pipeline on notebook
nlm pipeline create <yaml_file>            # Create custom pipeline
```

### Utilities
```bash
nlm doctor                                 # Diagnose installation issues
nlm login --check                          # Verify auth status
nlm alias set <name> <id>                  # Create friendly alias for notebook ID
```

## Workflow: Deep Research on a Topic

When the user asks to research a topic end-to-end:

### Phase 1: Setup
1. Create a new notebook with a descriptive title
2. Save the notebook ID for subsequent commands

### Phase 2: Seed Sources
3. If the user provides URLs, add them as sources
4. If the user provides text/documents, add as text sources
5. If Drive files are relevant, add via Drive ID

### Phase 3: Web Research
6. Run `nlm research start <id> "research query"` to discover sources
7. Poll `nlm research status` until complete
8. Import the best discovered sources with `nlm research import`

### Phase 4: Synthesize
9. Use `nlm notebook query <id> "question"` to extract insights
10. Run multiple queries to build a comprehensive picture
11. Summarize findings for the user

### Phase 5: Outputs (Optional)
12. Generate audio podcast: `nlm audio create <id>`
13. Export to Google Docs: `nlm export <id>`
14. Create quiz/flashcards: `nlm quiz <id>` / `nlm flashcards <id>`

## Workflow: Quick Add & Query

For quick knowledge base interactions:

1. `nlm notebook list` — find the target notebook
2. `nlm source add <id> --url "..."` — add the source
3. Wait a moment for processing
4. `nlm notebook query <id> "question"` — ask questions

## Output Format

Always present results clearly:
- When listing notebooks, show a clean table with title, source count, and last updated
- When querying, present the NotebookLM response with any citations
- When adding sources, confirm success and show the source ID
- When research completes, summarize what was found before asking to import

## Error Handling

- If `nlm` returns auth errors → re-run Step 0.3 auth flow
- If a notebook ID is not found → run `nlm notebook list` to show available notebooks
- If research times out → check status again, it may still be processing
- If Unicode errors appear → ensure PYTHONIOENCODING=utf-8 prefix is used

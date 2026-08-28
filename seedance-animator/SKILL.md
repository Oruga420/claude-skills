---
name: seedance-animator
description: Research-first anime/animation video pipeline. Deep-researches the user's story, references, and visual inspirations (1:3 ratio — 1 part user input, 3 parts research-informed detail), then generates character sheets, environment refs, and a narrative storyboard via Nano Banana 2, and animates with Seedance 2.0 via Replicate. 6-agent pipeline with story-researcher as Agent 0. Saves to Story Teller project folders.
---

# Seedance Animator

Research-first pipeline that turns a verbal concept into a fully animated scene using **Replicate** (Nano Banana 2 for stills, Seedance 2.0 for video). The key differentiator is **Agent 0: story-researcher** — it deep-dives the source material, references, and visual inspirations BEFORE any image generation, ensuring the final video tells a real story instead of producing pretty but hollow transitions.

## Hard rules

- **Always** use Nano Banana 2 (`google/nano-banana-2`) for every image generation step.
- **Always** use Seedance 2.0 (`bytedance/seedance-2.0`) for animation. This is the only confirmed working slug — `seedance-2-lite` does NOT exist on Replicate as of 2026-04.
- **Save everything** to `~/Desktop/Story Teller/<project_name>/` with subfolders for each asset type (`characters/`, `style/`, `storyboard/`, `prompt/`, `video/`). Ask the user for a project name or derive one from the scene idea.
- Never invent model IDs. If the Replicate API returns 404 for a model, prompt the user for the exact slug they saw in the Replicate playground.
- `.env` holds `REPLICATE_API_TOKEN`. Never commit it. `.env.example` is the template.
- **Windows Python paths**: Always use `os.path.expanduser("~/.env")` and `os.path.expanduser("~/Desktop/...")` — never use Git Bash `/c/` prefix in Python code as it resolves incorrectly.
- **Content filter**: Seedance 2.0 rejects sexual or suggestive prompts. If one is blocked, rewrite the scene so it is within policy — do not reword it to slip past the filter.

## Conversation flow (MANDATORY — do this BEFORE any API call)

1. **Idea** — "¿Cuál es la idea/historia/escena? (personajes, acción, duración, mood)"
2. **Art style + inspirations** — "¿Qué estilo? Y si tienes referencias de películas, directores, anime, o arte, dímelas — las investigo a fondo para extraer su lenguaje visual." Examples: "estilo Moana", "como Villeneuve filma Dune", "Ghibli meets Orozco murals"
3. **Image references** — "¿Tienes imágenes de referencia? (sube paths o genero todo from scratch con Nano Banana 2)"

Only after the user answers all three, proceed.

**IMPORTANT — boceto grid size is no longer asked.** The pipeline always uses 1x1 (single panel = the money shot). See "Teaser-first principle" below.

## Teaser-first principle (CRITICAL — learned from Run 4, rating 4/10)

**10 seconds of Seedance video = ONE iconic moment, NOT a full story.**

Trying to compress a 6-beat narrative into 10s produces incoherent transitions. Instead:
1. The story-researcher identifies the full narrative arc BUT flags the **ONE money shot** — the single most cinematic, emotional, iconic moment.
2. The storyboard-composer generates a **single 1x1 keyframe** of that money shot (NOT a multi-panel grid).
3. The prompt-composer writes a prompt focused on animating THAT SINGLE MOMENT with maximum visual quality.
4. **USER CHECKPOINT**: Before generating the video, STOP and show the user:
   - The story bible summary (3-5 lines)
   - The proposed money shot description
   - The keyframe image
   - Ask: "This is what the 10s teaser will animate. Proceed, pick a different beat, or request multi-clip mode?"
5. Only after user approval, generate the video.

**Multi-clip mode** (user must explicitly request): For full stories, generate one 10s clip PER beat and concatenate with ffmpeg. This is expensive and slow — default is always single-teaser.

## Pipeline (7-agent, research-first, teaser-focused)

Each stage is a **separate agent invocation** via the `Agent` tool. The orchestrator is this skill itself.

| # | Agent | Role | Output |
|---|-------|------|--------|
| **0** | **`story-researcher`** | **Deep-research via /notebook-research deep search. Break into beats. Flag the ONE money shot.** | **`research/story_bible.md`, `research/refs_analysis.md`** |
| 1 | `character-designer` | Build character sheets informed by story bible's character insights | `characters/<name>_sheet.png` |
| 2 | `style-environment` | Lock art style + environment informed by story bible's visual language section | `style/style_ref.png`, `style/background.png` |
| 3 | `storyboard-composer` | Generate a **single 1x1 keyframe** of the money shot (NOT a multi-panel grid) | `storyboard/keyframe.png`, `storyboard/shotlist.md` |
| — | **USER CHECKPOINT** | **Show storyboard + money shot to user. WAIT for approval before continuing.** | User says "go" or picks different beat |
| 4 | `final-prompt-composer` | Assemble Seedance prompt for the SINGLE money shot moment | `prompt/seedance_prompt.md` |
| 5 | `seedance-runner` | Call Seedance 2.0 with sanitized prompt + refs | `video/scene.mp4` |

### Execution order
- **Agent 0** runs first (research only — uses /notebook-research deep search + WebSearch)
- **Agents 1 + 2** can run **in parallel** (both read from story bible but are independent)
- **Agent 3** runs after 1 + 2 (needs character sheets for proportion lock)
- **USER CHECKPOINT** — orchestrator STOPS and presents the teaser concept to the user
- **Agent 4** runs after user approval
- **Agent 5** runs last (needs final prompt + all refs)

### The 1:3 research ratio

This is the core principle. When the user says "la leyenda de Izta y Popo en estilo Moana":
- **1 part** = user's brief (the legend, Moana style)
- **3 parts** = story-researcher adds: full mythological arc with 5+ narrative beats, emotional spine, cultural symbols, reference film techniques, and most importantly: **which single moment best represents the entire story as a 10-second teaser**

Each agent prompt lives in `agents/*.md`. Every agent downstream of story-researcher receives the story bible as context.

## Continuous improvement (/arise + /karpathy + /ralphinho-rfc-pipeline)

After every successful run:

1. **`/arise`** — sync the project wiki: append this run's concept, style, model choice, and which shots scored best to `wiki/runs.md`. Carry over unresolved quality issues as next-run TODOs.
2. **`/karpathy`** — measurable metric = user's 1–10 rating of final video. Each run proposes ONE small experiment (e.g., "use longer prompt for close-ups", "split storyboard into two passes", "bias style-env agent toward ink-line-heavy refs"). Experiments that improve the rating are promoted into the agent prompts; regressions are discarded.
3. **`/ralphinho-rfc-pipeline`** — for non-trivial agent changes (new agent, schema change, new Replicate model), write an RFC in `rfcs/`, run the quality gate (lint + dry-run + smoke test of Replicate auth), merge via the skill's internal merge queue (see `scripts/rfc_gate.py`).

Each run's instincts land in `INSTINCTS.md` and feed the next run's agent prompts.

## Files

```
seedance-animator/
├── SKILL.md                  # this file
├── .env.example              # REPLICATE_API_TOKEN=
├── README.md                 # quick start for the user
├── agents/
│   ├── story-researcher.md   # Agent 0 — deep research + story bible (NEW)
│   ├── character-designer.md
│   ├── style-environment.md
│   ├── storyboard-composer.md
│   ├── final-prompt-composer.md
│   └── seedance-runner.md
├── scripts/
│   ├── replicate_client.py   # shared Replicate wrapper
│   ├── nano_banana.py        # Nano Banana 2 helper
│   ├── seedance.py           # Seedance 2 / Lite helper
│   ├── orchestrator.py       # sequential agent runner + run_state.json
│   └── rfc_gate.py           # /ralphinho-rfc-pipeline quality gate
├── rfcs/                     # RFCs written per run (created on first run)
├── wiki/                     # /arise wiki (created on first run)
└── INSTINCTS.md              # /karpathy learnings accumulated across runs
```

## How the orchestrator runs

```bash
# From the folder where the user wants outputs:
python <skill_path>/scripts/orchestrator.py
```

The orchestrator:
1. Loads `.env` from the skill folder (falls back to CWD `.env`).
2. Walks the 4-step conversation (idea, style+inspirations, boceto, image refs).
3. Creates `~/Desktop/Story Teller/<project_name>/` with asset subfolders including `research/`.
4. Spawns Agent 0 (story-researcher) first — this produces the story bible.
5. Spawns Agents 1 + 2 in parallel (both read story bible).
6. Spawns Agents 3 → 4 → 5 sequentially.
7. Writes `run_state.json` after every stage so a crash can resume.
8. On completion, runs `/arise` sync + logs a `/karpathy` experiment stub.

## Replicate model slugs (confirmed working 2026-04-14)

- Image: `google/nano-banana-2` — text-to-image + image-edit
- Video: `bytedance/seedance-2.0` — supports `reference_images` (up to 9) with `[Image1]`-`[Image9]` tokens in prompt, `duration` (seconds), `aspect_ratio`, `resolution`
- **DEAD slugs**: `bytedance/seedance-2` and `bytedance/seedance-2-lite` both return 404. Do NOT use them.

If a slug returns 404 at runtime, ask the user for the exact slug from their Replicate playground URL.

## Known issues & workarounds (from production runs)

1. **Content filter (E005)**: Seedance 2.0 rejects prompts with sexual or suggestive terms. Rewrite the scene to be within policy — do not reword a blocked prompt to bypass the filter.
2. **Nano Banana 2 rate limits (429/E003)**: Google API throttles during high demand. Implement exponential backoff with 5+ retries. First run in a session may take 6-7 attempts.
3. **Windows Python path resolution**: Git Bash `/c/Users/...` paths do NOT work inside Python. Always use `os.path.expanduser("~/...")` or `Path.home()`.
4. **Replicate auth on Windows**: `load_dotenv("/c/Users/<you>/.env")` fails silently. Use `load_dotenv(os.path.expanduser("~/.env"))` instead.

## One-liner behavior inside Claude Code

When the user invokes this skill:

1. Read this SKILL.md.
2. Run the 3 conversation questions inline (idea, style+inspirations, image refs).
3. Verify `REPLICATE_API_TOKEN` is set. If not, stop and tell the user to paste it into `.env`.
4. Create `~/Desktop/Story Teller/<project_name>/` with subfolders (`research/`, `characters/`, `style/`, `storyboard/`, `prompt/`, `video/`).
5. **Spawn Agent 0 (story-researcher)** — pass USER_IDEA, USER_ART_STYLE, and any film/director/art references. Wait for story bible. Story bible MUST include a "Money Shot" section identifying the ONE best moment for a 10s teaser.
6. **Spawn Agents 1 + 2 in parallel** — both receive the story bible as context.
7. **Spawn Agent 3** — generates a SINGLE keyframe of the money shot (1x1, not a grid).
8. **USER CHECKPOINT** — STOP. Show the user:
   - Story bible summary (3-5 lines)
   - The proposed money shot (description + keyframe image)
   - Ask: "Este es el teaser de 10s. ¿Le doy, elijo otro beat, o modo multi-clip?"
   - WAIT for user response before continuing.
9. **Spawn Agents 4 → 5** — prompt composer writes for the SINGLE moment, runner generates video.
10. After the video, show it and ask for a 1–10 rating.
11. Append the rating + what worked/didn't to `INSTINCTS.md` and propose one `/karpathy` experiment.

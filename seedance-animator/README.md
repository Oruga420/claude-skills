# Seedance Animator

Research-first anime video pipeline — deep story research, then Nano Banana 2 for stills, Seedance 2.0 for animation, all via Replicate.

## What makes this different

**Agent 0: story-researcher** runs BEFORE any image generation. It deep-dives the source material, researches film/art/director references the user mentions, and produces a story bible with narrative beats, emotional spine, cultural symbols, and visual language. Without this, the video is pretty transitions with no story (learned the hard way — Run #3 scored 3/10).

**1:3 ratio**: For every 1 part of user input, the researcher produces 3 parts of research-informed detail.

## Setup

```bash
# Create .env in your home directory with your Replicate token
echo "REPLICATE_API_TOKEN=r8_your_token_here" > ~/.env

# Install dependencies
pip install replicate python-dotenv requests pillow
```

## Run

```
/seedance-animator
```

## 6-Agent Pipeline

| # | Agent | What it does |
|---|-------|-------------|
| **0** | **story-researcher** | **Researches story + references -> story bible** |
| 1 | character-designer | Nano Banana 2 -> character sheets |
| 2 | style-environment | Nano Banana 2 -> art-style lock + background |
| 3 | storyboard-composer | Nano Banana 2 -> 2x2/3x3 storyboard from narrative beats |
| 4 | final-prompt-composer | Assembles Seedance prompt with refs + story bible |
| 5 | seedance-runner | Seedance 2.0 -> final MP4 |

Agents 1 + 2 run in parallel. Everything else is sequential.

## Output structure

```
Desktop/Story Teller/<project_name>/
├── research/      # Story bible + reference analysis (NEW)
├── characters/    # Character sheets + manifest.json
├── style/         # Style ref + background + manifest.json
├── storyboard/    # Storyboard grid + shotlist.md
├── prompt/        # Seedance prompt + refs.json
└── video/         # Final scene.mp4 + generation script
```

## Confirmed model slugs (2026-04-14)

- Image: `google/nano-banana-2`
- Video: `bytedance/seedance-2.0`
- **DEAD**: `bytedance/seedance-2` and `bytedance/seedance-2-lite` (404)

## Continuous improvement

- `/arise` keeps a wiki of every run.
- `/karpathy` proposes one tuning experiment per run, measured by your 1-10 rating.
- `/ralphinho-rfc-pipeline` gates any non-trivial agent change behind an RFC + smoke test.

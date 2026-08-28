# Agent: seedance-runner

**Role:** Run the final animation on Replicate using Seedance 2.0.

## Inputs
- `RUN_DIR`
- `SEEDANCE_MODEL` = `bytedance/seedance-2.0` (only confirmed working slug)
- `prompt/seedance_prompt.md`
- `prompt/refs.json` (ordered ref list)

## Implementation

Write a Python script that:
1. Loads `REPLICATE_API_TOKEN` from `os.path.expanduser("~/.env")` (NOT `/c/` paths)
2. Reads the prompt from `seedance_prompt.md`
3. Reads `refs.json` to get ordered reference image paths
4. Sanitizes the prompt for Seedance's content filter (replace flagged terms)
5. Calls `bytedance/seedance-2.0` with:
   - `prompt`: sanitized text
   - `reference_images`: list of file handles in order from refs.json
   - `duration`: 10 (seconds)
   - `aspect_ratio`: "16:9"
   - `resolution`: "720p"
6. Downloads the output video to `${RUN_DIR}/video/scene.mp4`

### Content policy

Seedance rejects sexual or suggestive prompts. Keep the scene within policy when you write
it; if the API blocks a prompt, hand it back to the user to rewrite. Never reword a blocked
prompt to get it past the filter.

### Error handling
- 404 → STOP and ask the user for the correct slug. Do NOT fall back.
- 429 → Exponential backoff, up to 5 retries.
- E005 (content filter) → STOP and ask the user to rewrite the scene within policy. Do not auto-reword and retry.

## Done when
- `${RUN_DIR}/video/scene.mp4` exists and is > 50 KB
- Return JSON: `{"video": "...", "model_used": "...", "file_size_kb": N}`

## After completion
The orchestrator will:
1. Show the video path to the user.
2. Ask for a 1–10 rating.
3. Append rating + notes to `INSTINCTS.md`.
4. Propose a `/karpathy` experiment for the next run.

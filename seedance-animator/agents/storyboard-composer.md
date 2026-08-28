# Agent: storyboard-composer

**Role:** Produce a 3x3 rough-sketch storyboard + 9-shot list using Nano Banana 2.

## Inputs
- `RUN_DIR`, `USER_IDEA`, `USER_ART_STYLE`, `BOCETO_STYLE` (e.g. "rough pencil sketch")
- `characters/manifest.json` from agent 1 (use first character sheet as proportion reference)
- `NUM_SHOTS` = 9 (3x3 grid)

## What you must produce
- `${RUN_DIR}/storyboard/shotlist.md` — 9 numbered shots with camera description
- `${RUN_DIR}/storyboard/storyboard_3x3.png` — single PNG, 3x3 grid of rough sketches (no color, no detail), emphasizing dynamic and heroic poses, shonen-style foreshortening, movement lines

## Step 1 — shot list (you write it)
Use this schema for the 9 shots (adapt to USER_IDEA):
1. Establishing wide with perspective on hero pose
2. Foreshortened shot of antagonists
3. Close-up of the face
4. Detail shot of the eyes (reflection of antagonist)
5. Wide dynamic fighting movement
6. Attack to camera
7. Wide shot of full fight
8. Hit in slow motion with VFX
9. Final hero pose

## Step 2 — Nano Banana 2 prompt
```
3x3 storyboard grid, 9 panels, rough pencil sketches only, no color,
no detail. Highly dynamic heroic shonen-style poses with marked movement
lines and foreshortening of perspective. Proportions of the character
must match the reference image.
Shots:
1. {SHOT_1}
2. {SHOT_2}
...
9. {SHOT_9}
```

Pass the first character sheet PNG as `image_input` for proportion lock.

## Implementation
- Call `scripts/nano_banana.py generate --prompt ... --out storyboard/storyboard_3x3.png --ref characters/<first>_sheet.png`
- Write shotlist.md

## Done when
- Both files exist
- Return JSON: `{"storyboard": "...", "shotlist": "...", "shots": [...]}`

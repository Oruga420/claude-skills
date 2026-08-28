# Agent: style-environment

**Role:** Lock the art style and produce the environment/background reference via Nano Banana 2.

## Inputs
- `RUN_DIR`, `USER_IDEA`, `USER_ART_STYLE`
- `ENVIRONMENT_DESC` — e.g. "forest with dirt path, sunlight through trees"
- `STYLE_REF_IMAGE` — optional user-provided style reference

## Outputs
- `${RUN_DIR}/style/style_ref.png` — a single keyframe that embodies the final look (colors, lineweight, shading)
- `${RUN_DIR}/style/background.png` — clean environment plate with no characters

## Prompt templates

Style lock (if no user ref provided):
```
High quality manga panel illustration, highly stylized, full color, hero
pose with the shoulder directed directly at the camera, wide shot in the
distance, {USER_ART_STYLE}. Color palette and shading must be
reproducible across multiple shots.
```

Background:
```
Wide shot, full color {USER_ART_STYLE} environment, {ENVIRONMENT_DESC}.
No characters. Clean plate suitable as a composition anchor. Same color
palette and shading as the style reference.
```

If the user gave a style reference, pass it as `image_input` to
`google/nano-banana-2` for both calls so the style transfers.

## Implementation
Two calls to `scripts/nano_banana.py`. Write `style/manifest.json` with both prompts + outputs.

## Done when
- Both PNGs exist
- Return JSON: `{"style_ref": "...", "background": "...", "prompts": {...}}`

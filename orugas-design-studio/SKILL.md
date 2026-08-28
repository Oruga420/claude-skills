---
name: orugas-design-studio
description: Generate images with Google Gemini 3 (flash-image / pro-image) and Imagen, mirroring the Orugas Design Studio app. Use when the user says "haz una imagen", "genera una imagen", "crea una imagen", "make/generate an image", "edit this image", or asks for image variations, references, aspect-ratio control, batch generation, search grounding, or camera/lighting/style tweaks.
---

# Orugas Design Studio — Image Generation Skill

Source: https://github.com/Oruga420/Orugas_Design_Studio — this skill exposes the same capabilities the app has, but from the CLI.

## When to activate

Trigger on any of:

- "haz una imagen", "genera / generá / generame una imagen", "crea / creame una imagen", "dibuja / diseña una imagen"
- "edita esta imagen", "modifica esta foto", "cambia esto de la imagen"
- "make / generate / create an image", "edit this image", "image variations"
- Any request where the user supplies a prompt + wants a raster image as output.

## Setup (once per machine)

```bash
cd ~/.claude/skills/orugas-design-studio
npm init -y >/dev/null
npm i @google/genai
export GEMINI_API_KEY="..."   # or put in ~/.bashrc
```

If `GEMINI_API_KEY` is missing, ask the user to export it before calling the script.

## Quick usage

```bash
node ~/.claude/skills/orugas-design-studio/generate.mjs \
  --prompt "a red caterpillar reading a book, watercolor" \
  --aspect 16:9 --size 2K --count 2 --out ./out
```

The script prints JSON with the saved file paths. Show them to the user.

## Full capability matrix (matches the app 1:1)

### Models (`--model`)

| Model | Use for |
|---|---|
| `gemini-3.1-flash-image-preview` (default) | Fast generation, edits, multi-reference |
| `gemini-3-pro-image-preview` | Higher-quality generation and edits |
| `imagen-4.0-generate-001` | Pure text-to-image, supports `--mode batch` |

### Aspect ratios (`--aspect`)
`1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `2:3`, `3:2`, `4:5`, `5:4`, `21:9`, `1:4`, `1:8`, `4:1`, `8:1`

### Resolution (`--size`)
`512`, `1K` (default), `2K`, `4K`

### Count / mode
- `--count N` — up to a reasonable number; each generated as a variation
- `--mode batch` — only with `imagen-*` models, returns N images in one call

### Reference images (style / subject conditioning)
Up to 14 references (same cap as the UI):
```bash
--ref ./style1.jpg --ref ./character.png --ref ./mood.webp
```

### Image editing (img2img)
```bash
--base ./original.png --prompt "make it nighttime, add neon signs"
```
`--base` puts the image first in the contents; clears automatically per call.

### Google Search grounding
- `--search` — enables `googleSearch` tool (web)
- `--search --image-search` — enables web + image search (for visual references from the web)

### Thinking
- `--thinking Minimal` (default) or `--thinking High`
- `--include-thoughts` — capture intermediate thought images to disk (tagged `thought_*`)

### Advanced technical fields (appended as "Technical details: ...")
- `--camera "Sony A7 IV, 50mm f/1.4"`
- `--angle  "low angle, tilted"`
- `--lighting "golden hour rim light"`
- `--filter "grainy film"`
- `--style  "Studio Ghibli"`

### Prompt helpers
- `--rewrite-json` — rewrite the free-text prompt into structured JSON (scene/subject/style/technical) before generating, just like the app's "Rewrite as JSON" button.
- `--suggest <field>` — ask Gemini to auto-fill one of `camera|angle|lighting|filter|style` based on the current prompt and other fields.

### Safety
All five `HarmCategory` thresholds are set to `BLOCK_ONLY_HIGH`. Loosen them only if you have a legitimate reason and your use complies with the provider's policies.

## Recommended defaults when the user is vague

- Model: `gemini-3.1-flash-image-preview`
- Aspect: `1:1` for portraits/avatars, `16:9` for scenes/wallpapers, `9:16` for phone/social
- Size: `2K` unless they ask for speed (then `1K`)
- Count: `1` unless they say "varias" / "multiple" / "options"
- Thinking: `Minimal`; raise to `High` only for complex compositional prompts

## Operating procedure for Claude

1. Parse the user's request. Extract: subject, style cues, aspect ratio, edits-vs-new, references.
2. If the user attached or pasted images, save them to `./refs/` and pass via `--ref` (or `--base` for edits).
3. If the prompt is short/lazy, enrich the `--camera/--lighting/--style` flags rather than inventing extra English narrative.
4. Run `generate.mjs`. Parse the JSON it prints. Report the saved paths to the user.
5. If the user asks for "más opciones" / "variations", rerun with `--count N` or change the seed-y advanced fields.
6. For iterative edits, chain runs by feeding the last output as `--base` next turn.

## Troubleshooting

- `Set GEMINI_API_KEY` → ask the user to export it.
- `Cannot find module '@google/genai'` → run setup block above.
- Empty output → the model refused; try `--thinking High`, rephrase, or drop inflammatory references.
- CORS/URL references → download the image locally first, then pass with `--ref path`.

## Files in this skill

- `SKILL.md` — this file
- `generate.mjs` — CLI that mirrors `src/services/gemini.ts` from the repo

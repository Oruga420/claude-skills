---
name: oruga-blender
description: Image-to-3D Blender asset pipeline. Generates candidate images with Nano Banana 2 on Replicate, shows them to the user for selection, then converts the chosen image into a textured 3D mesh with Hunyuan3D 3.1 and imports it into Blender via the Blender MCP. Versioned output under ~/Desktop/oruga-blender/assets/<asset>/v0.N. Use when the user asks to create a 3D asset, a Blender model, turn an image into 3D, or says "/oruga-blender", "hazme un asset de X", "modelo 3D de X para blender", "imagen a 3D".
---

# Oruga Blender - Image to 3D Asset Pipeline

Turns a verbal concept into a Blender-ready 3D asset in two gated steps:
**concept images first (the user picks one), 3D generation second.**

## Hard rules

- **Images**: always `google/nano-banana-2` on Replicate.
- **3D**: always Hunyuan3D via `tencent/hunyuan-3d-3.1` (override with `HUNYUAN_MODEL` in `.env`). Never invent slugs; on 404 ask the user for the exact slug from the Replicate playground.
- **USER CHECKPOINT is mandatory**: NEVER run the 3D step until the user has seen the candidate images and explicitly picked one. Showing images and waiting is the whole point of this skill.
- **Everything versioned** under `~/Desktop/oruga-blender/assets/<asset-name>/v0.1 ... v0.N`. One version folder per generation round. The scripts create folders automatically; never write assets anywhere else.
- `.env` in this skill folder holds `REPLICATE_API_TOKEN`. Never commit it.
- **Windows Python paths**: use `os.path.expanduser(...)`; never Git Bash `/c/` prefixes inside Python.
- Run scripts from the skill's `scripts/` dir (they import `replicate_client` from there): `cd ~/.claude/skills/oruga-blender/scripts && python gen_images.py ...`

## Flow

### 1. Intake
Derive a kebab-case `<asset-name>` from the user's request (e.g. "un robot vaquero" -> `robot-vaquero`). Only ask if genuinely ambiguous.

### 2. Generate candidate images (v0.N)
Build ONE image prompt optimized for image-to-3D reconstruction:
- single object, full object in frame, nothing cropped
- 3/4 view angle (shows front + side geometry)
- neutral seamless studio background, soft even lighting, no harsh shadows
- no text, no watermark, no extra props
- include the user's style/material notes verbatim

```bash
cd ~/.claude/skills/oruga-blender/scripts
python gen_images.py --asset <asset-name> --prompt "<prompt>" --count 4
```

The script creates the next `v0.N` folder and prints `VERSION_DIR=` and `IMAGE=` lines. Optional `--ref <path>` for an image the user supplies as reference.

### 3. USER CHECKPOINT - show and wait
Send the candidate images to the user with SendUserFile (display: render) and ask which one to convert (or none). **STOP and wait.**
- the user picks one -> step 4.
- the user wants changes -> adjust the prompt and re-run step 2. The script automatically creates the next version folder (v0.2, v0.3, ...).

### 4. Image -> 3D (Hunyuan3D 3.1)
```bash
cd ~/.claude/skills/oruga-blender/scripts
python gen_3d.py --image "<VERSION_DIR>/candidate_02.png"
```
Takes a few minutes. Output: `model.glb` (or whatever extension the model returns) in the same version folder, plus `generation.json` with the run metadata. Extra model params (polycount etc.) go via `--extra '{"...": ...}'` only if the user asks; defaults otherwise.

### 5. Import into Blender (offer, don't force)
Ask the user if he wants it in Blender now. If yes:
1. If the Blender MCP tools fail (Blender closed), start it headless-ish per the documented pattern: `Start-Process "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -ArgumentList @("--python", $script)` where the script enables the `blender_mcp` addon and runs `bpy.ops.blendermcp.start_server()` (socket 9876, ~2s).
2. Import via `mcp__blender__execute_blender_code`:
   ```python
   import bpy
   bpy.ops.import_scene.gltf(filepath=r"<VERSION_DIR>\model.glb")
   ```
3. Confirm with `get_viewport_screenshot` and show it to the user.

### 6. Report
Tell the user: version folder path, which candidate was used, output file, and (if imported) the viewport screenshot.

## Folder layout

```
~/Desktop/oruga-blender/
└── assets/
    └── <asset-name>/
        ├── v0.1/
        │   ├── prompt.json
        │   ├── candidate_01..04.png
        │   ├── model.glb          # only if a candidate was selected
        │   └── generation.json
        └── v0.2/ ...              # each retry round = new version
```

## Known gotchas

- Faces/characters: Hunyuan is the best generalist but fine facial detail still needs a sculpt pass in Blender. For realistic human heads suggest FaceBuilder instead.
- If the Hunyuan input schema rejects `image`, fetch https://replicate.com/tencent/hunyuan-3d-3.1 for the current schema before retrying.
- `gen_images.py` continues past single-image failures; only exits nonzero if ALL candidates fail.

# Agent: final-prompt-composer

**Role:** Assemble the Seedance prompt using the strict priority + role-separation template from the source workflow.

## Inputs
- `RUN_DIR`
- All manifests from agents 1–3 (characters, style, storyboard)
- `USER_IDEA`, `USER_ART_STYLE`

## Output
- `${RUN_DIR}/prompt/seedance_prompt.md` containing the final prompt ready to paste into `scripts/seedance.py`
- `${RUN_DIR}/prompt/refs.json` mapping reference tokens → file paths

## Prompt template (DO NOT DEVIATE)
```
Use the references with strict priority and role separation:

[REF_STORYBOARD] = "Image1" — primary guide for shot order, framing,
  timing, composition, and scene progression. Follow it strictly.
[REF_CHAR_1] = "Image2" — identity anchor for the main character.
[REF_CHAR_N] = "ImageN" — identity anchor for each additional character.
[REF_BACKGROUND] = "ImageLast" — environment and background anchor.

Create a {USER_ART_STYLE} action scene of {USER_IDEA}.

Absolute priority:
1. Follow the storyboard strictly for all shots and scene progression.
2. Keep each character design locked to its [REF_CHAR_*] image.
3. Keep the environment consistent with [REF_BACKGROUND].

The gist:
{SHORT_PARAGRAPH_FROM_USER_IDEA}

The environment:
{ENVIRONMENT_DESC}

Visual target:
{USER_ART_STYLE} with sharp lines, vivid colors, detailed lighting.
```

## Ref ordering rule
The storyboard PNG MUST be the first image in the Seedance `image_input` list. Characters in the order they appear. Background last.

## Done when
- `seedance_prompt.md` written
- `refs.json` written with ordered ref list
- Return JSON: `{"prompt_file": "...", "refs_ordered": [...]}`

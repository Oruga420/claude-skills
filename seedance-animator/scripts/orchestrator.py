"""Orchestrator — runs the 5 stages sequentially, one agent at a time.

This file is primarily a reference runner for when the skill is invoked
outside of Claude Code. Inside Claude Code the skill's SKILL.md tells
Claude to spawn each agent with the Agent tool, but this script can
drive the same pipeline headlessly by calling `nano_banana.py` and
`seedance.py` directly using the same prompts from agents/*.md.
"""
from __future__ import annotations
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from textwrap import dedent

HERE = Path(__file__).resolve().parent
SKILL_ROOT = HERE.parent


def ask(prompt: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    try:
        raw = input(f"{prompt}{suffix}: ").strip()
    except EOFError:
        raw = ""
    return raw or (default or "")


def slugify(s: str) -> str:
    return "".join(c.lower() if c.isalnum() else "_" for c in s).strip("_")[:40] or "char"


def run_py(script: Path, *args: str) -> str:
    cmd = [sys.executable, str(script), *args]
    print(f"$ {' '.join(cmd)}")
    out = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return out.stdout.strip()


def main() -> int:
    print("=== Seedance Animator ===")
    boceto = ask("1) ¿Cómo quieres el boceto? (rough_sketch/clean_lineart/full_color)", "rough_sketch")
    idea = ask("2) ¿Cuál es la idea de la escena?")
    style = ask("3) ¿Art style? (e.g. '90s shonen cel')", "90s shonen cel")
    model_choice = ask("4) ¿Seedance model? (2/lite)", "lite").lower()
    seedance_model = (
        os.environ.get("SEEDANCE_LITE_MODEL", "bytedance/seedance-2-lite")
        if model_choice.startswith("l")
        else os.environ.get("SEEDANCE_FULL_MODEL", "bytedance/seedance-2")
    )
    env_desc = ask("5a) ¿Environment? (e.g. 'forest with dirt path')", "forest")
    chars_raw = ask("5b) Characters (name:description; comma-separated)", "hero:teenage anime hero")
    refs_raw = ask("5c) Reference image paths (optional, comma-separated)", "")

    characters = []
    for token in chars_raw.split(","):
        if ":" not in token:
            continue
        name, desc = token.split(":", 1)
        characters.append({"slug": slugify(name), "desc": desc.strip()})

    user_refs = [Path(p.strip()) for p in refs_raw.split(",") if p.strip()]
    style_ref = user_refs[0] if user_refs else None

    ts = time.strftime("%Y%m%d_%H%M%S")
    run_dir = Path.cwd() / f"seedance_run_{ts}"
    for sub in ("characters", "style", "storyboard", "prompt", "video"):
        (run_dir / sub).mkdir(parents=True, exist_ok=True)

    state = {
        "run_dir": str(run_dir),
        "boceto": boceto,
        "idea": idea,
        "style": style,
        "seedance_model": seedance_model,
        "env_desc": env_desc,
        "characters": characters,
    }
    (run_dir / "run_state.json").write_text(json.dumps(state, indent=2))

    nb = HERE / "nano_banana.py"
    sd = HERE / "seedance.py"

    # Stage 1 — character sheets
    print("\n[1/5] character-designer")
    for c in characters:
        prompt = (
            f"Create a character sheet of {c['desc']}, highly stylized, full body "
            f"with frontal view, side view, back view and 4 close ups with expressions "
            f"neutral, happy, determination and anger, in white background. Maintain "
            f"100% artstyle and character traits. Style: {style}."
        )
        out = run_dir / "characters" / f"{c['slug']}_sheet.png"
        args = ["generate", "--prompt", prompt, "--out", str(out)]
        if style_ref:
            args += ["--ref", str(style_ref)]
        run_py(nb, *args)
        c["sheet"] = str(out)

    # Stage 2 — style + background
    print("\n[2/5] style-environment")
    style_prompt = (
        f"High quality manga panel illustration, highly stylized, full color, "
        f"hero pose with the shoulder directed directly at the camera, wide "
        f"shot in the distance, {style}. Color palette and shading must be "
        f"reproducible across multiple shots."
    )
    style_ref_out = run_dir / "style" / "style_ref.png"
    args = ["generate", "--prompt", style_prompt, "--out", str(style_ref_out)]
    if style_ref:
        args += ["--ref", str(style_ref)]
    run_py(nb, *args)

    bg_prompt = (
        f"Wide shot, full color {style} environment, {env_desc}. No characters. "
        f"Clean plate suitable as a composition anchor. Same color palette and "
        f"shading as the style reference."
    )
    bg_out = run_dir / "style" / "background.png"
    run_py(nb, "generate", "--prompt", bg_prompt, "--out", str(bg_out), "--ref", str(style_ref_out))

    # Stage 3 — storyboard
    print("\n[3/5] storyboard-composer")
    shots = [
        "establishing wide with perspective on hero pose",
        "foreshortened shot of antagonists",
        "close-up of the face",
        "detail shot of the eyes with reflection of antagonist",
        "wide dynamic fighting movement",
        "attack to camera",
        "wide shot of full fight",
        "hit in slow motion with VFX",
        "final hero pose",
    ]
    sb_prompt = (
        "3x3 storyboard grid, 9 panels, rough pencil sketches only, no color, "
        "no detail. Highly dynamic heroic shonen-style poses with marked "
        "movement lines and foreshortening of perspective. Proportions of the "
        "character must match the reference image.\nShots:\n"
        + "\n".join(f"{i+1}. {s}" for i, s in enumerate(shots))
    )
    sb_out = run_dir / "storyboard" / "storyboard_3x3.png"
    first_sheet = characters[0]["sheet"] if characters else str(style_ref_out)
    run_py(nb, "generate", "--prompt", sb_prompt, "--out", str(sb_out), "--ref", first_sheet)
    (run_dir / "storyboard" / "shotlist.md").write_text(
        "\n".join(f"{i+1}. {s}" for i, s in enumerate(shots))
    )

    # Stage 4 — final prompt composition
    print("\n[4/5] final-prompt-composer")
    ref_tokens = [f'[REF_STORYBOARD] = "Image1" — primary guide for shot order, framing, timing, composition, and scene progression. Follow it strictly.']
    refs_ordered = [str(sb_out)]
    for i, c in enumerate(characters, start=2):
        ref_tokens.append(f'[REF_CHAR_{c["slug"].upper()}] = "Image{i}" — identity anchor for {c["desc"]}.')
        refs_ordered.append(c["sheet"])
    ref_tokens.append(f'[REF_BACKGROUND] = "Image{len(refs_ordered)+1}" — environment and forest background anchor.')
    refs_ordered.append(str(bg_out))

    final_prompt = dedent(f"""
    Use the references with strict priority and role separation:

    {chr(10).join(ref_tokens)}

    Create a {style} action scene of {idea}.

    Absolute priority:
    1. Follow the storyboard strictly for all shots and scene progression.
    2. Keep each character design locked to its [REF_CHAR_*] image.
    3. Keep the environment consistent with [REF_BACKGROUND].

    The environment: {env_desc}

    Visual target: {style} with sharp lines, vivid colors, detailed lighting.
    """).strip()

    prompt_file = run_dir / "prompt" / "seedance_prompt.md"
    prompt_file.write_text(final_prompt, encoding="utf-8")
    refs_file = run_dir / "prompt" / "refs.json"
    refs_file.write_text(json.dumps({"refs_ordered": refs_ordered}, indent=2))

    # Stage 5 — Seedance
    print("\n[5/5] seedance-runner")
    video_out = run_dir / "video" / "scene.mp4"
    run_py(
        sd, "run",
        "--model", seedance_model,
        "--prompt-file", str(prompt_file),
        "--refs-file", str(refs_file),
        "--out", str(video_out),
    )

    print(f"\n✔ Done. Video: {video_out}")

    # Post-run: /arise wiki + /karpathy experiment stub
    wiki = SKILL_ROOT / "wiki" / "runs.md"
    wiki.parent.mkdir(exist_ok=True)
    with wiki.open("a", encoding="utf-8") as f:
        f.write(f"\n## {ts}\n- idea: {idea}\n- style: {style}\n- model: {seedance_model}\n- video: {video_out}\n")

    rating = ask("Rate this run 1-10 (Enter to skip)")
    instincts = SKILL_ROOT / "INSTINCTS.md"
    instincts.touch()
    with instincts.open("a", encoding="utf-8") as f:
        f.write(f"\n### {ts} — rating {rating or 'n/a'}\n- style: {style}\n- model: {seedance_model}\n- next-experiment: TODO (propose via /karpathy)\n")

    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    raise SystemExit(main())

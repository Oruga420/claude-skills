#!/usr/bin/env python3
"""
ruche.py - turns a /ruche spec (the conversation recap Claude wrote) into a narrated video:
  images (Krea 2 local on GPU, or Replicate gpt-image when the plate needs readable text)
  -> voice-over (ElevenLabs, Luna maria) -> optional music + sfx (ElevenLabs)
  -> Remotion render -> opened on screen.

Usage
-----
  python ruche.py --spec spec.json --out ~/Videos/ruche/<slug>.mp4 [--open]

Spec (short form)
-----------------
{
  "title": "...", "subtitle": "...", "date": "2026-09-09",
  "music": "calm lo-fi piano, soft, no drums",      (string prompt | "tech" | "calm" | null)
  "scenes": [
    {"kind": "title|context|beat|decision|result|outro",
     "heading": "...", "bullets": ["..."], "narration": "...",
     "image": {"prompt": "...", "text": false},     (optional; text:true routes to Replicate)
     "sfx": "soft whoosh"}                           (optional)
  ]
}

Flags: --no-voice --no-images --no-music --no-sfx --max-usd 1.0 --keep-assets --open
Exit codes: 0 ok, 2 bad spec, 3 audio failed, 4 images failed, 6 budget exceeded, 7 render failed.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comfy_krea2  # noqa: E402
import eleven  # noqa: E402
import replicate_image  # noqa: E402

SKILL = Path(__file__).resolve().parent.parent
REMOTION = SKILL / "remotion"
PUBLIC = REMOTION / "public"
FPS = 30
TAIL_FRAMES = 24
MIN_SCENE_FRAMES = 90
KINDS = ("title", "context", "beat", "decision", "result", "outro")
STYLE = ("cinematic wide shot, 16:9, soft volumetric light, deep teal and amber palette, "
         "photoreal, film grain, no text, no letters, no watermark")


def die(code: int, msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def load_spec(path: Path) -> dict:
    try:
        spec = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        die(2, f"spec is not readable json: {e}")
    for f in ("title", "scenes"):
        if not spec.get(f):
            die(2, f"spec is missing required field: {f}")
    for i, sc in enumerate(spec["scenes"]):
        if sc.get("kind") not in KINDS:
            die(2, f"scene {i}: kind must be one of {KINDS}, got {sc.get('kind')!r}")
        if not sc.get("heading") and sc["kind"] != "title":
            die(2, f"scene {i}: heading is required")
    spec.setdefault("subtitle", "")
    spec.setdefault("date", "")
    spec.setdefault("music", "calm")
    return spec


def ffprobe_seconds(path: Path) -> float:
    exe = shutil.which("ffprobe")
    if not exe:
        raise RuntimeError("ffprobe not on PATH")
    out = subprocess.run(
        [exe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def clean_public() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for f in PUBLIC.glob("ruche-*"):
        f.unlink()


# ------------------------------------------------------------------ images

def plan_images(spec: dict, enabled: bool) -> tuple[list, list]:
    local, remote = [], []
    if not enabled:
        return local, remote
    for i, sc in enumerate(spec["scenes"]):
        img = sc.get("image")
        if not img or not img.get("prompt"):
            continue
        (remote if img.get("text") else local).append((i, img))
    return local, remote


def make_images(local: list, remote: list, max_usd: float) -> dict:
    est = len(remote) * replicate_image.USD_PER_IMAGE
    print(f"  imagenes: {len(local)} locales (Krea 2, $0) + {len(remote)} Replicate (~${est:.2f})")
    if est > max_usd:
        die(6, f"presupuesto: {len(remote)} imagenes Replicate ~${est:.2f} > tope ${max_usd:.2f}. "
               "Baja las escenas con text:true o sube --max-usd.")
    done: dict = {}
    if local and not comfy_krea2.is_up():
        print("WARN: ComfyUI no responde en :8188; las imagenes Krea 2 pasan a Replicate", file=sys.stderr)
        est2 = est + len(local) * replicate_image.USD_PER_IMAGE
        if est2 > max_usd:
            die(6, f"sin ComfyUI el costo seria ~${est2:.2f} > tope ${max_usd:.2f}. "
                   "Arranca ComfyUI (Desktop/ComfyUI/start_comfyui.bat) o corre con --no-images.")
        remote = remote + local
        local = []
    for i, img in local:
        name = f"ruche-img-{i:02d}.png"
        print(f"  krea2 escena {i + 1}: {img['prompt'][:70]}...", flush=True)
        try:
            comfy_krea2.generate(f"{img['prompt']}, {STYLE}", PUBLIC / name)
        except Exception as e:
            die(4, f"escena {i} (krea2): {e}")
        done[i] = name
    if remote:
        tok = replicate_image.resolve_token()
        if not tok:
            die(4, "no REPLICATE_API_TOKEN (env, skill .env, oruga-blender .env)")
        for i, img in remote:
            name = f"ruche-img-{i:02d}.png"
            print(f"  replicate escena {i + 1}: {img['prompt'][:70]}...", flush=True)
            try:
                replicate_image.generate(img["prompt"], PUBLIC / name, tok)
            except Exception as e:
                die(4, f"escena {i} (replicate): {e}")
            done[i] = name
    return done


# ------------------------------------------------------------------ audio

def make_scenes(spec: dict, images: dict, key, voice: bool, sfx: bool) -> list:
    out = []
    n = len(spec["scenes"])
    for i, sc in enumerate(spec["scenes"]):
        narration = (sc.get("narration") or "").strip()
        audio = None
        if voice and narration:
            audio = f"ruche-vo-{i:02d}.mp3"
            print(f"  voz {i + 1}/{n} ({sc['kind']})", flush=True)
            try:
                eleven.tts(narration, PUBLIC / audio, key)
                frames = int(math.ceil(ffprobe_seconds(PUBLIC / audio) * FPS)) + TAIL_FRAMES
            except Exception as e:
                die(3, f"escena {i} voz: {e}")
        elif narration:
            frames = int(math.ceil(len(narration) / 14 * FPS)) + TAIL_FRAMES
        else:
            frames = MIN_SCENE_FRAMES * 2
        sfx_name = None
        if sfx and sc.get("sfx"):
            sfx_name = f"ruche-sfx-{i:02d}.mp3"
            print(f"  sfx {i + 1}: {sc['sfx']}", flush=True)
            try:
                eleven.sfx(sc["sfx"], PUBLIC / sfx_name, key)
            except Exception as e:
                print(f"WARN: sfx escena {i} fallo, sigo sin el: {e}", file=sys.stderr)
                sfx_name = None
        out.append({
            "kind": sc["kind"],
            "heading": sc.get("heading") or spec["title"],
            "bullets": list(sc.get("bullets") or [])[:5],
            "image": images.get(i),
            "audio": audio,
            "sfx": sfx_name,
            "frames": max(MIN_SCENE_FRAMES, frames),
        })
    return out


def make_music(spec: dict, total_seconds: float, key, enabled: bool):
    choice = spec.get("music")
    if not enabled or not choice:
        return None
    if choice in ("tech", "calm"):
        src = SKILL / "assets" / f"bgm-{choice}.mp3"
        shutil.copy2(src, PUBLIC / src.name)
        return src.name
    name = "ruche-bgm.mp3"
    print(f"  musica (ElevenLabs Music, {total_seconds:.0f}s): {choice[:70]}", flush=True)
    try:
        eleven.music(choice, total_seconds + 4, PUBLIC / name, key)
        return name
    except Exception as e:
        print(f"WARN: musica generada fallo, uso bgm-calm: {e}", file=sys.stderr)
        shutil.copy2(SKILL / "assets" / "bgm-calm.mp3", PUBLIC / "bgm-calm.mp3")
        return "bgm-calm.mp3"


# ------------------------------------------------------------------ render / open

def render(spec: dict, out: Path) -> None:
    if not (REMOTION / "node_modules").exists():
        print("  instalando dependencias de Remotion (primera corrida)...", flush=True)
        subprocess.run(["npm", "install", "--no-audit", "--no-fund"],
                       cwd=REMOTION, check=True, shell=os.name == "nt")
    props = REMOTION / "props.json"
    props.write_text(json.dumps({"spec": spec}, ensure_ascii=False), encoding="utf-8")
    out.parent.mkdir(parents=True, exist_ok=True)
    print("  renderizando...", flush=True)
    r = subprocess.run(
        ["npx", "remotion", "render", "src/index.ts", "Ruche", str(out), f"--props={props}"],
        cwd=REMOTION, shell=os.name == "nt",
    )
    if r.returncode != 0 or not out.exists():
        die(7, f"remotion render failed (exit {r.returncode})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-usd", type=float, default=float(os.environ.get("RUCHE_MAX_USD", "1.0")))
    ap.add_argument("--no-voice", action="store_true")
    ap.add_argument("--no-images", action="store_true")
    ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--no-sfx", action="store_true")
    ap.add_argument("--keep-assets", action="store_true")
    ap.add_argument("--open", action="store_true")
    a = ap.parse_args()

    spec = load_spec(Path(a.spec).resolve())
    out = Path(a.out).resolve()
    clean_public()

    generated_music = not a.no_music and spec.get("music") not in (None, "tech", "calm")
    need_eleven = not a.no_voice or not a.no_sfx or generated_music
    key = eleven.resolve_key() if need_eleven else None
    if need_eleven and not key:
        die(3, "no ELEVENLABS_API_KEY (env, skill .env, ~/.claude/talk2me/.env)")

    local, remote = plan_images(spec, not a.no_images)
    images = make_images(local, remote, a.max_usd)
    scenes = make_scenes(spec, images, key, not a.no_voice, not a.no_sfx)
    total = sum(s["frames"] for s in scenes) / FPS
    bgm = make_music(spec, total, key, not a.no_music)

    final = {"title": spec["title"], "subtitle": spec["subtitle"], "date": spec["date"],
             "fps": FPS, "bgm": bgm, "scenes": scenes}
    render(final, out)
    print(f"OK video: {out}  ({total:.1f}s, {len(scenes)} escenas, {len(images)} imagenes)")

    if a.open:
        os.startfile(str(out))  # type: ignore[attr-defined]
    if not a.keep_assets:
        for f in PUBLIC.glob("ruche-*"):
            f.unlink()


if __name__ == "__main__":
    main()

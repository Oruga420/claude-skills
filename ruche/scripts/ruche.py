#!/usr/bin/env python3
"""
ruche.py - turns a /ruche spec (the conversation recap Claude wrote) into a narrated video:
  images (Krea 2 local on GPU, or Replicate gpt-image when the plate needs readable text)
  -> voice-over (ElevenLabs) -> optional music + sfx (ElevenLabs)
  -> audio map (loudness, onsets, word timings) -> Remotion render -> opened on screen.

Two visual languages (spec "style"):
  papel  (default) paper-and-ink motion graphics: kinetic type timed to the spoken words,
         recurring motifs (the dot, the thread, the word as object), halftone prints,
         density and cuts driven by the audio structure.
  cine   the original look: full-bleed image with Ken Burns, heading and bullets on top.

Usage
-----
  python ruche.py --spec spec.json --out ~/Videos/ruche/<slug>.mp4 [--open]

Spec (short form)
-----------------
{
  "title": "...", "subtitle": "...", "date": "2026-09-09",
  "style": "papel",                                  ("papel" | "cine")
  "music": "calm lo-fi piano, soft, no drums",      (prompt | "tech" | "calm" | path to own audio | null)
  "music_volume": 0.12,                              (optional; own audio defaults to 0.3)
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
import audio_map  # noqa: E402
import comfy_krea2  # noqa: E402
import eleven  # noqa: E402
import replicate_image  # noqa: E402

SKILL = Path(__file__).resolve().parent.parent
REMOTION = SKILL / "remotion"
PUBLIC = REMOTION / "public"
FPS = 30
TAIL_FRAMES = 24
MIN_SCENE_FRAMES = 90
PAUSE_FRAMES = 9
KINDS = ("title", "context", "beat", "decision", "result", "outro")
STYLES = ("papel", "cine")
AUDIO_EXT = (".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac")
IMAGE_STYLE = {
    "cine": ("cinematic wide shot, 16:9, soft volumetric light, deep teal and amber palette, "
             "photoreal, film grain, no text, no letters, no watermark"),
    # papel prints the plate as a halftone duotone: it needs one strong silhouette, not mood.
    "papel": ("single bold subject, strong silhouette, high contrast black and white photograph, "
              "plain light background, hard light, graphic, no text, no letters, no watermark"),
}


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
    spec.setdefault("style", "papel")
    if spec["style"] not in STYLES:
        die(2, f"style must be one of {STYLES}, got {spec['style']!r}")
    return spec


def own_audio(choice) -> Path | None:
    """The spec's music can be the user's own track: an existing audio file path."""
    if not isinstance(choice, str) or not choice.lower().endswith(AUDIO_EXT):
        return None
    path = Path(choice).expanduser()
    if not path.exists():
        die(2, f"music file does not exist: {path}")
    return path.resolve()


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


def make_images(local: list, remote: list, max_usd: float, style: str) -> dict:
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
                   "Arranca ComfyUI en :8188 o corre con --no-images.")
        remote = remote + local
        local = []
    for i, img in local:
        name = f"ruche-img-{i:02d}.png"
        print(f"  krea2 escena {i + 1}: {img['prompt'][:70]}...", flush=True)
        try:
            comfy_krea2.generate(f"{img['prompt']}, {IMAGE_STYLE[style]}", PUBLIC / name)
        except Exception as e:
            die(4, f"escena {i} (krea2): {e}")
        done[i] = name
    if remote:
        tok = replicate_image.resolve_token()
        if not tok:
            die(4, "no REPLICATE_API_TOKEN (env o skill .env)")
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

def estimate_words(narration: str, frames: int) -> list[dict]:
    """Without a voice track, spread the words over the scene by their length."""
    tokens = narration.split()
    if not tokens:
        return []
    span = max(1, frames - TAIL_FRAMES - 6)
    weights = [len(t) + 1 for t in tokens]
    total, acc, out = sum(weights), 0, []
    for t, w in zip(tokens, weights):
        s = 6 + span * acc / total
        acc += w
        out.append({"w": t, "s": int(s), "e": int(6 + span * acc / total)})
    return out


def to_frames(words: list[dict]) -> list[dict]:
    return [{"w": w["w"], "s": int(round(w["s"] * FPS)), "e": int(round(w["e"] * FPS))}
            for w in words]


def pauses_of(words: list[dict], frames: int) -> list[list[int]]:
    """Gaps in the speech, plus the tail after the last word: the moments of visual silence."""
    out = []
    for a, b in zip(words, words[1:]):
        if b["s"] - a["e"] >= PAUSE_FRAMES:
            out.append([a["e"], b["s"]])
    if words and frames - words[-1]["e"] >= PAUSE_FRAMES:
        out.append([words[-1]["e"], frames])
    return out


def voice_scene(i: int, narration: str, key) -> tuple[str, int, list[dict]]:
    audio = f"ruche-vo-{i:02d}.mp3"
    try:
        words = to_frames(eleven.tts_timed(narration, PUBLIC / audio, key))
    except Exception as e:
        print(f"WARN: escena {i} sin tiempos por palabra ({e}); voz simple", file=sys.stderr)
        eleven.tts(narration, PUBLIC / audio, key)
        words = []
    frames = int(math.ceil(ffprobe_seconds(PUBLIC / audio) * FPS)) + TAIL_FRAMES
    return audio, frames, words or estimate_words(narration, frames)


def make_scenes(spec: dict, images: dict, key, voice: bool, sfx: bool) -> list:
    out = []
    n = len(spec["scenes"])
    start = 0
    beat = 0
    for i, sc in enumerate(spec["scenes"]):
        narration = (sc.get("narration") or "").strip()
        audio = None
        words: list[dict] = []
        if voice and narration:
            print(f"  voz {i + 1}/{n} ({sc['kind']})", flush=True)
            try:
                audio, frames, words = voice_scene(i, narration, key)
            except Exception as e:
                die(3, f"escena {i} voz: {e}")
        elif narration:
            frames = int(math.ceil(len(narration) / 14 * FPS)) + TAIL_FRAMES
            words = estimate_words(narration, frames)
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
        frames = max(MIN_SCENE_FRAMES, frames)
        beat = beat + 1 if sc["kind"] == "beat" else beat
        out.append({
            "kind": sc["kind"],
            "heading": sc.get("heading") or spec["title"],
            "bullets": list(sc.get("bullets") or [])[:5],
            "image": images.get(i),
            "audio": audio,
            "sfx": sfx_name,
            "frames": frames,
            "start": start,
            "index": i,
            "beat": beat if sc["kind"] == "beat" else 0,
            "words": words,
            "pauses": pauses_of(words, frames),
        })
        start += frames
    return out


def make_music(spec: dict, total_seconds: float, key, enabled: bool):
    choice = spec.get("music")
    if not enabled or not choice:
        return None
    mine = own_audio(choice)
    if mine:
        name = f"ruche-bgm{mine.suffix.lower()}"
        shutil.copy2(mine, PUBLIC / name)
        return name
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
    silent = out.with_name(f"{out.stem}.video{out.suffix}")
    print("  renderizando...", flush=True)
    r = subprocess.run(
        ["npx", "remotion", "render", "src/index.ts", "Ruche", str(silent), f"--props={props}",
         f"--concurrency={os.environ.get('RUCHE_CONCURRENCY', '1')}", "--muted"],
        cwd=REMOTION, shell=os.name == "nt",
    )
    if r.returncode != 0 or not silent.exists():
        die(7, f"remotion render failed (exit {r.returncode})")
    try:
        mix_audio(spec, silent, out)
    except Exception as e:
        die(7, f"audio mix failed: {e}")
    silent.unlink()


def mix_audio(spec: dict, video: Path, out: Path) -> None:
    """Lay the audio under the muted render with the system ffmpeg.

    Remotion's own audio stage asks for libfdk_aac, which many ffmpeg builds (and the one a
    locked-down Windows allows) do not carry; the stock `aac` encoder is everywhere.
    """
    total = sum(s["frames"] for s in spec["scenes"]) / FPS
    inputs: list[str] = ["-i", str(video)]
    chains: list[str] = []
    labels: list[str] = []

    def add(src: Path, chain: str, loop: bool = False) -> None:
        n = len(labels) + 1
        inputs.extend((["-stream_loop", "-1"] if loop else []) + ["-i", str(src)])
        chains.append(f"[{n}:a]{chain}[a{n}]")
        labels.append(f"[a{n}]")

    for sc in spec["scenes"]:
        ms = int(round(sc["start"] / FPS * 1000))
        if sc.get("audio"):
            add(PUBLIC / sc["audio"], f"adelay={ms}:all=1")
        if sc.get("sfx"):
            add(PUBLIC / sc["sfx"], f"adelay={ms}:all=1,volume=0.5")
    if spec.get("bgm"):
        vol = spec.get("musicVolume", 0.12)
        add(PUBLIC / spec["bgm"],
            f"atrim=0:{total:.3f},volume={vol},afade=t=in:d=1.5,"
            f"afade=t=out:st={max(0.0, total - 2):.3f}:d=2", loop=True)
    if not labels:
        shutil.copy2(video, out)
        return
    graph = ";".join(chains + [f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0,"
                               f"atrim=0:{total:.3f}[mix]"])
    subprocess.run(
        [shutil.which("ffmpeg") or "ffmpeg", "-y", "-v", "error", *inputs,
         "-filter_complex", graph, "-map", "0:v", "-map", "[mix]",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", str(out)],
        check=True,
    )


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

    generated_music = (not a.no_music and spec.get("music") not in (None, "tech", "calm")
                       and own_audio(spec.get("music")) is None)
    need_eleven = not a.no_voice or not a.no_sfx or generated_music
    key = eleven.resolve_key() if need_eleven else None
    if need_eleven and not key:
        die(3, "no ELEVENLABS_API_KEY (env o skill .env)")

    local, remote = plan_images(spec, not a.no_images)
    images = make_images(local, remote, a.max_usd, spec["style"])
    scenes = make_scenes(spec, images, key, not a.no_voice, not a.no_sfx)
    total = sum(s["frames"] for s in scenes) / FPS
    bgm = make_music(spec, total, key, not a.no_music)

    frames_total = sum(s["frames"] for s in scenes)
    amap = None
    if spec["style"] == "papel":
        try:
            amap = audio_map.build(scenes, PUBLIC, bgm, frames_total, FPS)
        except Exception as e:
            print(f"WARN: mapa de audio fallo, sigo solo con tiempos de palabra: {e}", file=sys.stderr)
        if amap is None:
            print("WARN: sin numpy/ffmpeg no hay mapa de audio; densidad por palabras", file=sys.stderr)
    default_vol = 0.3 if own_audio(spec.get("music")) else 0.12
    final = {"title": spec["title"], "subtitle": spec["subtitle"], "date": spec["date"],
             "style": spec["style"], "fps": FPS, "bgm": bgm,
             "musicVolume": float(spec.get("music_volume") or default_vol),
             "audioMap": amap, "scenes": scenes}
    render(final, out)
    print(f"OK video: {out}  ({total:.1f}s, {len(scenes)} escenas, {len(images)} imagenes)")

    if a.open:
        os.startfile(str(out))  # type: ignore[attr-defined]
    if not a.keep_assets:
        for f in PUBLIC.glob("ruche-*"):
            f.unlink()


if __name__ == "__main__":
    main()

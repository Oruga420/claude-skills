#!/usr/bin/env python3
"""
package.py - turns a take-control spec into the delivery package:
  voice-over (ElevenLabs, any voice you pick) -> Remotion render -> open.

Usage
-----
  python package.py --spec spec.json --out docs/reports/take-control.mp4 [--open] [--bgm tech]

The spec you write is the SHORT form: every scene carries a `narration` string and
nothing else. This script resolves it into the LONG form Remotion needs (per-scene
audio file + frame count measured from the real mp3) and passes it with --props.

Flags
-----
  --spec PATH     input spec json (required)
  --out PATH      output mp4 (required)
  --bgm NAME      tech | calm | none          (default: tech)
  --no-voice      skip ElevenLabs; silent video with length-derived timings
  --open          open ultraplan html, contract html and the video
  --keep-audio    do not delete the generated vo-*.mp3 from remotion/public/

Configuration (environment variables; each one may also live in <skill>/.env)
-----------------------------------------------------------------------------
  ELEVENLABS_API_KEY     required unless --no-voice
  ELEVENLABS_VOICE_ID    required unless --no-voice; any voice from your ElevenLabs library
  ELEVENLABS_MODEL_ID    optional, default eleven_v3
  TAKE_CONTROL_ENV_FILE  optional, one more .env file to read the keys above from
  TAKE_CONTROL_OPEN_CMD  optional, your own opener; it gets the file path as its last
                         argument and exit code 0 counts as opened. Without it the OS
                         default is used (start on Windows, open on macOS, xdg-open on Linux).

Lookup order for every key: process env -> <skill>/.env -> TAKE_CONTROL_ENV_FILE ->
~/.claude/skills/talk-to-me/.env (only if that skill is installed).

Exit codes: 0 ok, 2 bad spec, 3 tts failed, 4 render failed, 5 open failed.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shlex
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
REMOTION = SKILL / "remotion"
PUBLIC = REMOTION / "public"

DEFAULT_MODEL = "eleven_v3"
FPS = 30
TAIL_FRAMES = 20          # breathing room after each narration line
MIN_SCENE_FRAMES = 90     # 3s floor so a one-word scene still reads
SCENE_ORDER = ["title", "objective", "phases", "judge", "contract", "status"]


def die(code: int, msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


# ------------------------------------------------------------------ elevenlabs

def env_files() -> list[Path]:
    files = [SKILL / ".env"]
    extra = os.environ.get("TAKE_CONTROL_ENV_FILE")
    if extra:
        files.append(Path(extra).expanduser())
    files.append(Path.home() / ".claude" / "skills" / "talk-to-me" / ".env")
    return files


def setting(name: str) -> str | None:
    """Process env first, then the .env files in env_files() order."""
    value = os.environ.get(name)
    if value and value.strip():
        return value.strip()
    for env_file in env_files():
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line.startswith("export "):
                line = line[len("export "):].lstrip()
            if line.startswith(f"{name}="):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
                if value:
                    return value
    return None


def resolve_key() -> str | None:
    return setting("ELEVENLABS_API_KEY")


def resolve_voice() -> tuple[str | None, str]:
    return setting("ELEVENLABS_VOICE_ID"), setting("ELEVENLABS_MODEL_ID") or DEFAULT_MODEL


def tts(text: str, dest: Path, key: str, voice: str, model: str) -> None:
    body = json.dumps({"text": text, "model_id": model}).encode("utf-8")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128"
    req = urllib.request.Request(
        url, data=body, headers={"xi-api-key": key, "Content-Type": "application/json"}
    )
    timeout = 25 + len(text) / 12
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            dest.write_bytes(resp.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"ElevenLabs HTTP {e.code}: {detail}") from e
    if dest.stat().st_size < 1024:
        raise RuntimeError(f"ElevenLabs returned {dest.stat().st_size} bytes for {dest.name}")


# ------------------------------------------------------------------ duration

def ffprobe_seconds(path: Path) -> float:
    exe = shutil.which("ffprobe")
    if not exe:
        raise RuntimeError("ffprobe not on PATH; cannot measure the voice-over")
    out = subprocess.run(
        [exe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def silent_frames(text: str) -> int:
    """No-voice fallback: ~14 characters per second of reading."""
    return max(MIN_SCENE_FRAMES, int(math.ceil(len(text) / 14 * FPS)) + TAIL_FRAMES)


# ------------------------------------------------------------------ spec

def load_spec(path: Path) -> dict:
    try:
        spec = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        die(2, f"spec is not readable json: {e}")
    for field in ("title", "objective", "scenes"):
        if not spec.get(field):
            die(2, f"spec is missing required field: {field}")
    if not isinstance(spec["scenes"], list) or not spec["scenes"]:
        die(2, "spec.scenes must be a non-empty list")
    for i, sc in enumerate(spec["scenes"]):
        if sc.get("kind") not in SCENE_ORDER:
            die(2, f"scene {i}: kind must be one of {SCENE_ORDER}, got {sc.get('kind')!r}")
    spec.setdefault("subtitle", "")
    spec.setdefault("date", "")
    spec.setdefault("mode", "controlish")
    spec.setdefault("notScope", [])
    spec.setdefault("phases", [])
    spec.setdefault("judge", {"score": 0, "rounds": 0, "claims": [], "changes": []})
    spec.setdefault("contract", {"name": "", "path": "", "acceptance": []})
    spec.setdefault("status", {"headline": "", "detail": "", "next": ""})
    spec.setdefault("artifacts", [])
    spec.setdefault("theme", "dark")
    if spec["theme"] not in ("dark", "cutout"):
        die(2, f"spec.theme must be dark or cutout, got {spec['theme']!r}")
    spec["fps"] = FPS
    return spec


def install_plates(spec: dict) -> dict:
    """cutout theme: copy the per-scene video plates into remotion/public and measure them.

    spec.plates (short form) = {"title": "C:/.../plate-01-title.mp4", ...}
    long form handed to Remotion = {"title": {"file": "plate-title.mp4", "frames": 300}, ...}
    """
    plates = spec.get("plates") or {}
    if not plates:
        spec["plates"] = {}
        return spec
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for old in PUBLIC.glob("plate-*.mp4"):
        old.unlink()
    resolved = {}
    for kind, src in plates.items():
        if kind not in SCENE_ORDER:
            die(2, f"spec.plates: unknown scene kind {kind!r}")
        srcp = Path(src)
        if not srcp.exists():
            die(2, f"spec.plates.{kind}: file not found: {src}")
        name = f"plate-{kind}.mp4"
        shutil.copy2(srcp, PUBLIC / name)
        seconds = ffprobe_seconds(PUBLIC / name)
        resolved[kind] = {"file": name, "frames": max(1, int(math.floor(seconds * FPS)))}
        print(f"  plate {kind}: {seconds:.1f}s", flush=True)
    spec["plates"] = resolved
    return spec


def resolve_scenes(spec: dict, use_voice: bool, key: str | None) -> dict:
    voice, model = resolve_voice()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for old in PUBLIC.glob("vo-*.mp3"):
        old.unlink()
    resolved = []
    for i, sc in enumerate(spec["scenes"]):
        narration = (sc.get("narration") or "").strip()
        if use_voice and narration:
            name = f"vo-{i:02d}.mp3"
            dest = PUBLIC / name
            print(f"  voz {i + 1}/{len(spec['scenes'])} ({sc['kind']}) ...", flush=True)
            try:
                tts(narration, dest, key, voice, model)
                frames = int(math.ceil(ffprobe_seconds(dest) * FPS)) + TAIL_FRAMES
            except Exception as e:
                die(3, f"scene {i} ({sc['kind']}): {e}")
            frames = max(MIN_SCENE_FRAMES, frames)
            audio = name
        else:
            frames = silent_frames(narration) if narration else MIN_SCENE_FRAMES * 2
            audio = None
        resolved.append({"kind": sc["kind"], "frames": frames, "audio": audio})
    spec["scenes"] = resolved
    return spec


def install_bgm(spec: dict, choice: str) -> dict:
    if choice == "none":
        spec["bgm"] = None
        return spec
    src = SKILL / "assets" / f"bgm-{choice}.mp3"
    if not src.exists():
        print(f"WARN: {src.name} not found, continuing without background music", file=sys.stderr)
        spec["bgm"] = None
        return spec
    PUBLIC.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, PUBLIC / src.name)
    spec["bgm"] = src.name
    return spec


# ------------------------------------------------------------------ render

def render(spec: dict, out: Path) -> None:
    if not (REMOTION / "node_modules").exists():
        print("  instalando dependencias de Remotion (primera corrida)...", flush=True)
        subprocess.run(["npm", "install", "--no-audit", "--no-fund"],
                       cwd=REMOTION, check=True, shell=os.name == "nt")
    props = REMOTION / "props.json"
    props.write_text(json.dumps({"spec": spec}, ensure_ascii=False), encoding="utf-8")
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["npx", "remotion", "render", "src/index.ts", "TakeControl",
           str(out), f"--props={props}"]
    print("  renderizando...", flush=True)
    r = subprocess.run(cmd, cwd=REMOTION, shell=os.name == "nt")
    if r.returncode != 0 or not out.exists():
        die(4, f"remotion render failed (exit {r.returncode})")


# ------------------------------------------------------------------ open

def show(path: Path) -> bool:
    """Open a file for the operator. True only if the opener reported success.

    TAKE_CONTROL_OPEN_CMD (if set) is your own opener: it gets the path as its last
    argument and exit code 0 counts as opened. Otherwise the OS default handler is used.
    """
    custom = setting("TAKE_CONTROL_OPEN_CMD")
    try:
        if custom and os.name == "nt":
            # cmd.exe parses the user's command line as typed; the path goes last, quoted
            ok = subprocess.run(f'{custom} "{path}"', shell=True).returncode == 0
        elif custom:
            ok = subprocess.run(shlex.split(custom) + [str(path)]).returncode == 0
        elif os.name == "nt":
            os.startfile(str(path))  # type: ignore[attr-defined]
            ok = True
        elif sys.platform == "darwin":
            ok = subprocess.run(["open", str(path)]).returncode == 0
        else:
            opener = shutil.which("xdg-open")
            ok = bool(opener) and subprocess.run([opener, str(path)]).returncode == 0
    except Exception as e:
        print(f"WARN: could not open {path}: {e}", file=sys.stderr)
        ok = False
    print(f"  open {path.name}: {'ok' if ok else 'FAILED'}")
    return ok


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--bgm", default="tech", choices=["tech", "calm", "none"])
    ap.add_argument("--no-voice", action="store_true")
    ap.add_argument("--open", action="store_true")
    ap.add_argument("--keep-audio", action="store_true")
    args = ap.parse_args()

    spec_path = Path(args.spec).resolve()
    out = Path(args.out).resolve()
    spec = load_spec(spec_path)

    key = None
    use_voice = not args.no_voice
    if use_voice:
        key = resolve_key()
        if not key:
            die(3, "no ELEVENLABS_API_KEY (env, <skill>/.env, TAKE_CONTROL_ENV_FILE, talk-to-me .env); "
                   "set it or render with --no-voice")
        if not resolve_voice()[0]:
            die(3, "no ELEVENLABS_VOICE_ID: pick any voice id from your ElevenLabs library "
                   "and set it (env or <skill>/.env), or render with --no-voice")

    spec = resolve_scenes(spec, use_voice, key)
    spec = install_bgm(spec, args.bgm)
    spec = install_plates(spec)
    render(spec, out)

    total = sum(s["frames"] for s in spec["scenes"]) / FPS
    print(f"OK video: {out}  ({total:.1f}s, {len(spec['scenes'])} escenas)")

    failures = []
    if args.open:
        for art in spec.get("artifacts", []):
            p = Path(art["path"])
            if p.exists() and p.suffix.lower() in (".html", ".htm"):
                if not show(p):
                    failures.append(str(p))
        if not show(out):
            failures.append(str(out))

    if not args.keep_audio:
        for f in PUBLIC.glob("vo-*.mp3"):
            f.unlink()

    if failures:
        die(5, "no se pudo abrir: " + ", ".join(failures))


if __name__ == "__main__":
    main()

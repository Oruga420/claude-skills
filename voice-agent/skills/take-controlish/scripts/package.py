#!/usr/bin/env python3
"""
package.py - turns a take-control spec into the delivery package:
  voice-over (ElevenLabs) -> Remotion render -> verified open.

Usage
-----
  python package.py --spec spec.json --out C:\\path\\take-control.mp4 [--open] [--bgm tech]

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

Opening: without TAKE_CONTROL_OPENER the files open in the OS default app and are reported
as "opened (unverified)". Set TAKE_CONTROL_OPENER to a script that opens a file and checks
it is really on screen; it is called as `<opener> <path> <title>` (a .ps1 runs through
PowerShell) and must print a line containing "verdict":"visible" only when it is. With an
opener configured, anything else counts as a failed open.

Keys: ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID from the environment, <skill>/.env, or the
.env of talk-2-me (~/.claude/talk2me/.env) / talk-to-me (~/.claude/talk-to-me/.env).

Exit codes: 0 ok, 2 bad spec, 3 tts failed, 4 render failed, 5 open failed.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
REMOTION = SKILL / "remotion"
PUBLIC = REMOTION / "public"
OPENER = os.environ.get("TAKE_CONTROL_OPENER", "").strip()
ENV_FILES = (
    SKILL / ".env",
    Path.home() / ".claude" / "talk2me" / ".env",
    Path.home() / ".claude" / "talk-to-me" / ".env",
    Path.home() / ".claude" / "skills" / "talk-to-me" / ".env",
)

DEFAULT_MODEL = "eleven_v3"
FPS = 30
TAIL_FRAMES = 20          # breathing room after each narration line
MIN_SCENE_FRAMES = 90     # 3s floor so a one-word scene still reads
SCENE_ORDER = ["title", "objective", "phases", "judge", "contract", "screens", "status"]


def die(code: int, msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


# ------------------------------------------------------------------ elevenlabs

def _setting(name: str) -> str | None:
    """Environment first, then the .env files in ENV_FILES. Only names are ever printed."""
    val = os.environ.get(name)
    if val and val.strip():
        return val.strip()
    for env_file in ENV_FILES:
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith(f"{name}="):
                found = line.split("=", 1)[1].strip().strip('"').strip("'")
                if found:
                    return found
    return None


def _json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig")) if path.exists() else {}
    except Exception:
        return {}


def resolve_key() -> str | None:
    return _setting("ELEVENLABS_API_KEY")


def resolve_voice() -> tuple[str | None, str]:
    """ELEVENLABS_VOICE_ID wins; otherwise reuse the voice a voice skill is already set up with
    (talk-2-me state.json `voice`, talk-to-me config.json `voice_id`)."""
    t2m = _json(Path.home() / ".claude" / "talk2me" / "state.json")
    ttm = _json(Path.home() / ".claude" / "talk-to-me" / "config.json")
    voice = _setting("ELEVENLABS_VOICE_ID") or t2m.get("voice") or ttm.get("voice_id") or None
    model = _setting("ELEVENLABS_MODEL_ID") or ttm.get("model_id") or DEFAULT_MODEL
    return voice, model


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
    spec.setdefault("screens", [])
    for i, sh in enumerate(spec["screens"]):
        if not sh.get("file") or not Path(sh["file"]).expanduser().exists():
            die(2, f"screens[{i}].file does not exist: {sh.get('file')!r}")
        sh.setdefault("label", Path(sh["file"]).name)
        sh.setdefault("caption", "")
    spec["fps"] = FPS
    return spec


def install_screens(spec: dict) -> dict:
    """Copy each product mock into remotion/public/ and point the spec at the basename."""
    if not spec.get("screens"):
        return spec
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for old in PUBLIC.glob("screen-*.*"):
        old.unlink()
    staged = []
    for i, sh in enumerate(spec["screens"]):
        src = Path(sh["file"]).expanduser()
        name = f"screen-{i:02d}{src.suffix.lower()}"
        shutil.copy2(src, PUBLIC / name)
        staged.append({**sh, "file": name})
    spec["screens"] = staged
    return spec


def resolve_scenes(spec: dict, use_voice: bool, key: str | None) -> dict:
    voice, model = resolve_voice()
    if use_voice and not voice:
        die(3, "no ELEVENLABS_VOICE_ID set (env var, <skill>/.env, or a configured "
               "talk-2-me / talk-to-me voice)")
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

def open_default(path: Path) -> None:
    """Hand the file to the OS default app (browser for html, player for mp4)."""
    if os.name == "nt":
        os.startfile(str(path))  # type: ignore[attr-defined]
    else:
        subprocess.run(["open" if sys.platform == "darwin" else "xdg-open", str(path)])


def show(path: Path, title: str) -> bool:
    """Open a file for the operator. With TAKE_CONTROL_OPENER configured, only a
    verdict:visible line from it counts as opened; without it the open is unverified."""
    if not OPENER:
        open_default(path)
        print(f"  open {path.name}: opened (unverified, no TAKE_CONTROL_OPENER)")
        return True
    opener = Path(OPENER).expanduser()
    if not opener.exists():
        print(f"WARN: TAKE_CONTROL_OPENER {opener} missing; opening unverified", file=sys.stderr)
        open_default(path)
        return False
    if opener.suffix.lower() == ".ps1":
        cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(opener)]
    elif opener.suffix.lower() == ".py":
        cmd = [sys.executable, str(opener)]
    else:
        cmd = [str(opener)]
    r = subprocess.run(cmd + [str(path), title], capture_output=True, text=True)
    out = (r.stdout or "").strip()
    line = out.splitlines()[-1] if out else ""
    ok = '"verdict":"visible"' in line.replace(" ", "")
    print(f"  open {path.name}: {'visible' if ok else 'FAILED'} {line[:160]}")
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
            die(3, "no ELEVENLABS_API_KEY (env, skill .env, talk-2-me .env)")

    spec = resolve_scenes(spec, use_voice, key)
    spec = install_bgm(spec, args.bgm)
    spec = install_screens(spec)
    render(spec, out)

    total = sum(s["frames"] for s in spec["scenes"]) / FPS
    print(f"OK video: {out}  ({total:.1f}s, {len(spec['scenes'])} escenas)")

    failures = []
    if args.open:
        for art in spec.get("artifacts", []):
            p = Path(art["path"])
            if p.exists() and p.suffix.lower() in (".html", ".htm"):
                if not show(p, p.stem):
                    failures.append(str(p))
        if not show(out, out.stem):
            failures.append(str(out))

    if not args.keep_audio:
        for f in PUBLIC.glob("vo-*.mp3"):
            f.unlink()

    if failures:
        die(5, "no se pudo confirmar visible: " + ", ".join(failures))


if __name__ == "__main__":
    main()

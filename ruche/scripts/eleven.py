"""ElevenLabs helpers for /ruche: voice-over, background music, sound effects.

Key resolution order: ELEVENLABS_API_KEY env, then <skill>/.env.
Voice: ELEVENLABS_VOICE_ID (same places); defaults to an ElevenLabs stock voice.
Only the variable NAME is ever logged, never its value.
"""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs stock voice; override with ELEVENLABS_VOICE_ID
DEFAULT_MODEL = "eleven_multilingual_v2"  # v3 cuts audio short, see talk-2-me memory
BASE = "https://api.elevenlabs.io/v1"


ENV_FILES = (SKILL / ".env",)


def _from_env(name: str) -> str | None:
    val = os.environ.get(name)
    if val:
        return val.strip()
    for env_file in ENV_FILES:
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def resolve_key() -> str | None:
    return _from_env("ELEVENLABS_API_KEY")


def resolve_voice() -> str:
    return _from_env("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE


def _post(path: str, body: dict, key: str, timeout: float) -> bytes:
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"ElevenLabs {path} HTTP {e.code}: {detail}") from e


def _check(data: bytes, dest: Path, what: str) -> None:
    if len(data) < 1024:
        raise RuntimeError(f"ElevenLabs returned {len(data)} bytes for {what}")
    dest.write_bytes(data)


def tts(text: str, dest: Path, key: str, voice: str | None = None, model: str = DEFAULT_MODEL) -> None:
    voice = voice or resolve_voice()
    data = _post(
        f"/text-to-speech/{voice}?output_format=mp3_44100_128",
        {"text": text, "model_id": model},
        key,
        timeout=25 + len(text) / 12,
    )
    _check(data, dest, f"voice {dest.name}")


def tts_timed(text: str, dest: Path, key: str, voice: str | None = None,
              model: str = DEFAULT_MODEL) -> list[dict]:
    """Voice-over plus word timings: [{"w": "palabra,", "s": 0.10, "e": 0.52}] in seconds.

    Uses the /with-timestamps endpoint, which returns the mp3 as base64 and a per-character
    alignment. Words are the runs of non-space characters, punctuation kept for display.
    """
    voice = voice or resolve_voice()
    req = urllib.request.Request(
        f"{BASE}/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps({"text": text, "model_id": model}).encode("utf-8"),
        headers={"xi-api-key": key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=25 + len(text) / 12) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"ElevenLabs with-timestamps HTTP {e.code}: {detail}") from e
    _check(base64.b64decode(payload.get("audio_base64") or ""), dest, f"voice {dest.name}")
    al = payload.get("alignment") or {}
    chars = al.get("characters") or []
    starts = al.get("character_start_times_seconds") or []
    ends = al.get("character_end_times_seconds") or []
    words: list[dict] = []
    cur = None
    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace():
            cur = None
            continue
        if cur is None:
            cur = {"w": "", "s": float(s), "e": float(e)}
            words.append(cur)
        cur["w"] += ch
        cur["e"] = float(e)
    return words


def music(prompt: str, seconds: float, dest: Path, key: str) -> None:
    """Background music via the ElevenLabs Music API. Length is clamped to the API range."""
    ms = int(max(10, min(300, seconds)) * 1000)
    data = _post("/music", {"prompt": prompt, "music_length_ms": ms}, key, timeout=180)
    _check(data, dest, f"music {dest.name}")


def sfx(prompt: str, dest: Path, key: str, seconds: float = 2.0) -> None:
    """Short sound effect via the ElevenLabs Sound Generation API (0.5 to 22 s)."""
    secs = max(0.5, min(22.0, seconds))
    data = _post(
        "/sound-generation",
        {"text": prompt, "duration_seconds": secs, "prompt_influence": 0.4},
        key,
        timeout=90,
    )
    _check(data, dest, f"sfx {dest.name}")

"""audio_map.py - turns the rendered audio into structure the `papel` visual system can read.

It does not make things bounce. It hands Remotion three signals per video frame:
  voice   - loudness of the narration (0..1), placed at each scene's offset
  music   - loudness of the bed or of the user's own track (0..1), looped to the video length
  onsets  - frames where the music (or, without music, the phrasing) makes a clear new attack

The visual system integrates `voice`/`music` (accumulation, density) and uses `onsets` as
candidate cut points. Needs ffmpeg and numpy; without numpy the map is simply skipped.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

try:
    import numpy as np
except ImportError:  # the renderer degrades to word timings only
    np = None

SAMPLE_RATE = 11025


def available() -> bool:
    return np is not None and shutil.which("ffmpeg") is not None


def envelope(path: Path, fps: int):
    """RMS loudness per video frame, normalized to its own 95th percentile."""
    raw = subprocess.run(
        [shutil.which("ffmpeg"), "-v", "error", "-i", str(path), "-ac", "1",
         "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"],
        capture_output=True, check=True,
    ).stdout
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    hop = SAMPLE_RATE / fps
    n = int(len(x) / hop)
    if n < 2:
        return np.zeros(1)
    bounds = (np.arange(n + 1) * hop).astype(int)
    cs = np.concatenate([[0.0], np.cumsum(x * x)])
    widths = np.maximum(1, bounds[1:] - bounds[:-1])
    rms = np.sqrt((cs[bounds[1:]] - cs[bounds[:-1]]) / widths)
    ref = np.percentile(rms, 95) or 1.0
    return np.clip(rms / ref, 0.0, 1.0)


def onsets(env, fps: int, min_gap_s: float = 0.45) -> list[int]:
    """Frames where loudness jumps clearly above its recent past (local peaks of positive flux)."""
    if len(env) < 12:
        return []
    window = 8
    padded = np.concatenate([np.full(window, env[0]), env])
    past = np.convolve(padded, np.ones(window) / window, mode="valid")[:len(env)]
    flux = np.maximum(0.0, env - past)
    thr = flux.mean() + 1.5 * flux.std()
    gap = int(min_gap_s * fps)
    out: list[int] = []
    for t in range(1, len(flux) - 1):
        if flux[t] < thr or flux[t] < flux[t - 1] or flux[t] < flux[t + 1]:
            continue
        if out and t - out[-1] < gap:
            continue
        out.append(t)
    return out


def phrase_onsets(scenes: list[dict]) -> list[int]:
    """Without music, the first word after each pause is the natural attack."""
    out = []
    for sc in scenes:
        for i, w in enumerate(sc.get("words") or []):
            prev = sc["words"][i - 1] if i else None
            if prev is None or w["s"] - prev["e"] > 6:
                out.append(sc["start"] + w["s"])
    return out


def build(scenes: list[dict], public: Path, bgm: str | None, total_frames: int, fps: int):
    """Returns {voice, music, onsets} or None when analysis is not possible."""
    if not available():
        return None
    voice = np.zeros(total_frames)
    for sc in scenes:
        if not sc.get("audio"):
            continue
        env = envelope(public / sc["audio"], fps)
        a, b = sc["start"], min(total_frames, sc["start"] + len(env))
        voice[a:b] = env[: b - a]
    music = np.zeros(total_frames)
    hits: list[int] = []
    if bgm:
        env = envelope(public / bgm, fps)
        reps = int(np.ceil(total_frames / max(1, len(env))))
        music = np.tile(env, reps)[:total_frames]
        hits = onsets(music, fps)
    if len(hits) < 4:
        hits = sorted(set(hits) | set(phrase_onsets(scenes)))
    return {
        "voice": [round(float(v), 2) for v in voice],
        "music": [round(float(v), 2) for v in music],
        "onsets": [int(h) for h in hits],
    }

"""Text-heavy plates through Replicate (OpenAI gpt-image, quality low) for /ruche.

Krea 2 cannot spell. When a scene image must carry readable text (a label, a UI, a sign),
the orchestrator routes it here. Token resolution: REPLICATE_API_TOKEN env, <skill>/.env,
~/.claude/skills/oruga-blender/.env. Only the variable NAME is logged, never its value.
Model slug override: RUCHE_TEXT_IMAGE_MODEL (default openai/gpt-image-2).
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
DEFAULT_MODEL = "openai/gpt-image-2"
# Replicate list price for gpt-image low quality is around 2 cents per image; used only
# for the budget estimate. Override with RUCHE_TEXT_IMAGE_USD.
USD_PER_IMAGE = float(os.environ.get("RUCHE_TEXT_IMAGE_USD", "0.03"))


def resolve_token() -> str | None:
    tok = os.environ.get("REPLICATE_API_TOKEN")
    if tok:
        return tok.strip()
    for env_file in (SKILL / ".env", Path.home() / ".claude" / "skills" / "oruga-blender" / ".env"):
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("REPLICATE_API_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def _request(url: str, tok: str, body: dict | None = None, wait: bool = False) -> dict:
    headers = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    if wait:
        headers["Prefer"] = "wait=60"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Replicate HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:400]}") from e


def generate(prompt: str, dest: Path, tok: str, model: str | None = None) -> None:
    model = model or os.environ.get("RUCHE_TEXT_IMAGE_MODEL", DEFAULT_MODEL)
    url = f"https://api.replicate.com/v1/models/{model}/predictions"
    attempts = [
        {"prompt": prompt, "quality": "low", "aspect_ratio": "3:2", "output_format": "png"},
        {"prompt": prompt, "quality": "low"},
        {"prompt": prompt},
    ]
    pred = None
    last = None
    for inp in attempts:
        try:
            pred = _request(url, tok, {"input": inp}, wait=True)
            break
        except RuntimeError as e:
            last = e
            if "422" not in str(e):
                raise
    if pred is None:
        raise RuntimeError(f"Replicate rejected every input shape: {last}")

    deadline = time.time() + 180
    while pred.get("status") not in ("succeeded", "failed", "canceled"):
        if time.time() > deadline:
            raise RuntimeError("Replicate prediction timed out")
        time.sleep(3)
        pred = _request(pred["urls"]["get"], tok)
    if pred["status"] != "succeeded":
        raise RuntimeError(f"Replicate prediction {pred['status']}: {str(pred.get('error'))[:300]}")

    out = pred.get("output")
    file_url = out[0] if isinstance(out, list) else out
    if not isinstance(file_url, str):
        raise RuntimeError(f"unexpected Replicate output: {str(out)[:200]}")
    with urllib.request.urlopen(file_url, timeout=120) as r:
        data = r.read()
    if len(data) < 10_000:
        raise RuntimeError("Replicate returned an empty image")
    dest.write_bytes(data)

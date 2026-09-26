"""Local Krea 2 Turbo text-to-image through the ComfyUI HTTP API ($0 per image).

Graph, in ComfyUI API format:
UNETLoader(nvfp4) + CLIPLoader(krea2) + VAELoader -> CLIPTextEncode -> ConditioningZeroOut
as negative -> KSampler 8 steps CFG 1 euler simple -> VAEDecode -> SaveImage.
CFG 1 means negatives are ignored: steer style in the positive prompt only.
"""
from __future__ import annotations

import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
UNET = "krea2_turbo_nvfp4.safetensors"
CLIP = "qwen3vl_4b_fp8_scaled.safetensors"
VAE = "qwen_image_vae.safetensors"


def is_up(timeout: float = 3) -> bool:
    try:
        with urllib.request.urlopen(f"{COMFY}/system_stats", timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def _graph(prompt: str, width: int, height: int, seed: int) -> dict:
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "krea2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "7": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed, "steps": 8, "cfg": 1, "sampler_name": "euler", "scheduler": "simple",
                "denoise": 1, "model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0],
                "latent_image": ["6", 0],
            },
        },
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ruche/ruche", "images": ["8", 0]}},
    }


def generate(prompt: str, dest: Path, width: int = 1344, height: int = 768,
             timeout: float = float(os.environ.get("RUCHE_COMFY_TIMEOUT", "240"))) -> None:
    """Queue one image, wait for it, download it to dest (png)."""
    seed = random.randint(1, 2**31)
    body = json.dumps({"prompt": _graph(prompt, width, height, seed), "client_id": "ruche"}).encode()
    req = urllib.request.Request(f"{COMFY}/prompt", data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            pid = json.load(r)["prompt_id"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"ComfyUI /prompt HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}") from e

    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(2)
        with urllib.request.urlopen(f"{COMFY}/history/{pid}", timeout=15) as r:
            hist = json.load(r)
        entry = hist.get(pid)
        if not entry:
            continue
        status = entry.get("status", {})
        if status.get("status_str") == "error":
            raise RuntimeError(f"ComfyUI job failed: {json.dumps(status)[:300]}")
        images = [img for out in entry.get("outputs", {}).values() for img in out.get("images", [])]
        if images:
            img = images[0]
            q = urllib.parse.urlencode({"filename": img["filename"], "subfolder": img.get("subfolder", ""), "type": img.get("type", "output")})
            with urllib.request.urlopen(f"{COMFY}/view?{q}", timeout=60) as r:
                data = r.read()
            if len(data) < 10_000:
                raise RuntimeError("ComfyUI returned an empty image (repeated prompt cache?)")
            dest.write_bytes(data)
            return
    raise RuntimeError(f"ComfyUI timed out after {timeout}s waiting for prompt {pid}")



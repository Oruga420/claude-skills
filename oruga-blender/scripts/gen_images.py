"""Generate candidate images for a Blender asset via Nano Banana 2 on Replicate.

Creates the next version folder under ~/Desktop/oruga-blender/assets/<asset>/
(v0.1, v0.2, ... v0.N) and fills it with N candidate images.

Usage:
    python gen_images.py --asset robot-vaquero --prompt "..." [--count 4] [--ref path.png]

Prints the version folder path and every image path (one per line, prefixed).
"""
from __future__ import annotations
import argparse
import json
import os
import re
import sys
from pathlib import Path

from replicate_client import run, download

ASSETS_ROOT = Path(os.path.expanduser("~/Desktop/oruga-blender/assets"))
VERSION_RE = re.compile(r"^v0\.(\d+)$")


def next_version_dir(asset: str) -> Path:
    """Return the next unused vN folder for the asset (v0.1, v0.2, ...)."""
    asset_dir = ASSETS_ROOT / asset
    existing = []
    if asset_dir.is_dir():
        for child in asset_dir.iterdir():
            m = VERSION_RE.match(child.name)
            if child.is_dir() and m:
                existing.append(int(m.group(1)))
    n = max(existing, default=0) + 1
    vdir = asset_dir / f"v0.{n}"
    vdir.mkdir(parents=True, exist_ok=False)
    return vdir


def generate(prompt: str, out: Path, ref: Path | None = None) -> Path:
    model = os.environ.get("NANO_BANANA_MODEL", "google/nano-banana-2")
    payload: dict = {"prompt": prompt}
    if ref is not None:
        payload["image_input"] = [open(ref, "rb")]
    result = run(model, payload)
    first = result[0] if isinstance(result, list) else result
    return download(first, out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--asset", required=True, help="kebab-case asset name")
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--count", type=int, default=4)
    ap.add_argument("--ref", type=Path, default=None, help="optional reference image")
    args = ap.parse_args()

    vdir = next_version_dir(args.asset)
    print(f"VERSION_DIR={vdir}")

    (vdir / "prompt.json").write_text(
        json.dumps({"prompt": args.prompt, "count": args.count}, indent=2),
        encoding="utf-8",
    )

    failures = 0
    for i in range(1, args.count + 1):
        out = vdir / f"candidate_{i:02d}.png"
        try:
            generate(args.prompt, out, args.ref)
            print(f"IMAGE={out}")
        except SystemExit:
            raise
        except Exception as e:  # noqa: BLE001 - report and keep going
            failures += 1
            print(f"FAILED candidate_{i:02d}: {e}", file=sys.stderr)

    if failures == args.count:
        sys.exit(1)


if __name__ == "__main__":
    main()

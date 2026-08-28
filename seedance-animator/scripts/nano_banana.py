"""Nano Banana 2 helper. Always uses google/nano-banana-2 on Replicate."""
from __future__ import annotations
import argparse
import os
import sys
from pathlib import Path

from replicate_client import run, download


def generate(prompt: str, out: Path, ref: Path | None = None) -> Path:
    model = os.environ.get("NANO_BANANA_MODEL", "google/nano-banana-2")
    payload: dict = {"prompt": prompt}
    if ref is not None:
        payload["image_input"] = [open(ref, "rb")]
    result = run(model, payload)
    # nano-banana-2 returns a list of FileOutput-ish items or a single one
    first = result[0] if isinstance(result, list) else result
    return download(first, out)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("generate")
    g.add_argument("--prompt", required=True)
    g.add_argument("--out", required=True, type=Path)
    g.add_argument("--ref", type=Path, default=None)
    args = ap.parse_args()

    if args.cmd == "generate":
        path = generate(args.prompt, args.out, args.ref)
        print(str(path))
    else:
        sys.exit(f"unknown cmd {args.cmd}")


if __name__ == "__main__":
    # Allow running as script from any dir
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()

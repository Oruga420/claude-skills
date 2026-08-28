"""Seedance 2 / 2 Lite runner. Uses whichever model the user picked."""
from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path

from replicate_client import run, download


def run_seedance(model: str, prompt_file: Path, refs_file: Path, out: Path) -> Path:
    prompt = prompt_file.read_text(encoding="utf-8")
    refs = json.loads(refs_file.read_text(encoding="utf-8"))
    # refs = {"refs_ordered": ["path1", "path2", ...]}
    ref_paths = refs.get("refs_ordered") or refs.get("refs") or []
    payload: dict = {"prompt": prompt}
    if ref_paths:
        payload["image_input"] = [open(p, "rb") for p in ref_paths]

    result = run(model, payload)
    first = result[0] if isinstance(result, list) else result
    out.parent.mkdir(parents=True, exist_ok=True)
    return download(first, out)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--model", required=True, help="e.g. bytedance/seedance-2 or bytedance/seedance-2-lite")
    r.add_argument("--prompt-file", required=True, type=Path)
    r.add_argument("--refs-file", required=True, type=Path)
    r.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    if args.cmd == "run":
        path = run_seedance(args.model, args.prompt_file, args.refs_file, args.out)
        print(str(path))


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()

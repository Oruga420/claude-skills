"""Turn a selected candidate image into a 3D asset via Hunyuan3D on Replicate.

Usage:
    python gen_3d.py --image <path/to/candidate_02.png> [--out model.glb] [--extra '{"num_faces": 40000}']

Output lands next to the image (same version folder) unless --out is given.
Prints MODEL=<path> on success.
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path

from replicate_client import run, download, upload_image

DEFAULT_MODEL = "tencent/hunyuan-3d-3.1"
MESH_EXTS = (".glb", ".obj", ".fbx", ".ply", ".stl", ".gltf", ".usdz", ".zip")


def pick_mesh_output(result) -> object:
    """Hunyuan returns a dict, list, or single file. Find the mesh."""
    if isinstance(result, dict):
        for key in ("mesh", "model", "glb", "textured_mesh", "output"):
            if result.get(key):
                return result[key]
        for value in result.values():
            if value:
                return value
        raise SystemExit(f"No usable output in result dict: {list(result)}")
    if isinstance(result, list):
        for item in result:
            if str(item).lower().endswith(MESH_EXTS):
                return item
        return result[0]
    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--extra", default=None, help="JSON of extra model params")
    args = ap.parse_args()

    if not args.image.is_file():
        sys.exit(f"Image not found: {args.image}")

    model = os.environ.get("HUNYUAN_MODEL", DEFAULT_MODEL)
    payload: dict = {"image": upload_image(args.image)}
    if args.extra:
        payload.update(json.loads(args.extra))

    print(f"Running {model} on {args.image.name} (takes a few minutes)...")
    result = run(model, payload)
    mesh = pick_mesh_output(result)

    out = args.out or args.image.parent / "model.glb"
    suffix = Path(str(mesh).split("?")[0]).suffix.lower()
    if suffix in MESH_EXTS and out.suffix.lower() != suffix:
        out = out.with_suffix(suffix)

    download(mesh, out)
    (args.image.parent / "generation.json").write_text(
        json.dumps(
            {"model": model, "source_image": args.image.name, "output": out.name},
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"MODEL={out}")


if __name__ == "__main__":
    main()

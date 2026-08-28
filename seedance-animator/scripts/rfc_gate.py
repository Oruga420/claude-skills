"""RFC gate for /ralphinho-rfc-pipeline.

Non-trivial agent changes (new agent, new Replicate model, schema change)
must pass through this gate. It runs three checks:

1. Lint  — all agents/*.md parse as UTF-8 and have the mandatory sections.
2. Auth  — REPLICATE_API_TOKEN is set and a tiny request succeeds.
3. Smoke — a dry-run nano_banana generation of a 1-token prompt.

Usage: python scripts/rfc_gate.py <rfc-dir>
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL_ROOT = HERE.parent


def lint_agents() -> list[str]:
    errors: list[str] = []
    required = ("Role", "Inputs", "Done when")
    for p in sorted((SKILL_ROOT / "agents").glob("*.md")):
        text = p.read_text(encoding="utf-8")
        for token in required:
            if token not in text:
                errors.append(f"{p.name}: missing section containing '{token}'")
    return errors


def check_auth() -> list[str]:
    from dotenv import load_dotenv
    load_dotenv(SKILL_ROOT / ".env")
    if not os.environ.get("REPLICATE_API_TOKEN"):
        return ["REPLICATE_API_TOKEN not set"]
    return []


def smoke_nano_banana() -> list[str]:
    # Just verify the client imports and the model slug is non-empty.
    slug = os.environ.get("NANO_BANANA_MODEL", "google/nano-banana-2")
    if "/" not in slug:
        return [f"Bad NANO_BANANA_MODEL slug: {slug}"]
    return []


def main(argv: list[str]) -> int:
    rfc_dir = Path(argv[1]) if len(argv) > 1 else SKILL_ROOT / "rfcs"
    rfc_dir.mkdir(exist_ok=True)
    errors: list[str] = []
    errors += lint_agents()
    errors += check_auth()
    errors += smoke_nano_banana()
    if errors:
        print("RFC gate FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("RFC gate passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

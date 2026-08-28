"""Shared Replicate client. Loads .env and exposes a `run(model, input)` helper."""
from __future__ import annotations
import os
import sys
import time
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*a, **kw):
        return False

try:
    import replicate
except ImportError:
    print("ERROR: pip install replicate python-dotenv", file=sys.stderr)
    sys.exit(1)


def _load_env() -> None:
    """Load .env from the skill folder, then from CWD (CWD wins)."""
    here = Path(__file__).resolve().parent.parent
    load_dotenv(here / ".env")
    load_dotenv(Path.cwd() / ".env", override=True)
    if not os.environ.get("REPLICATE_API_TOKEN"):
        print(
            "ERROR: REPLICATE_API_TOKEN not set. Copy .env.example to .env "
            "and paste your token.",
            file=sys.stderr,
        )
        sys.exit(2)


def run(model: str, input_payload: dict, max_retries: int = 2):
    """Run a Replicate model with small retry on transient errors."""
    _load_env()
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            return replicate.run(model, input=input_payload)
        except Exception as e:  # noqa: BLE001 — surface all Replicate errors
            msg = str(e)
            last_err = e
            if "404" in msg or "not found" in msg.lower():
                raise SystemExit(
                    f"Replicate 404 for model '{model}'. Ask the user for the "
                    f"exact slug from the Replicate playground URL."
                )
            if attempt < max_retries:
                time.sleep(2 ** attempt)
                continue
            raise
    raise last_err  # pragma: no cover


def download(url_or_file, out_path: Path) -> Path:
    """Replicate returns either FileOutput objects or URL strings."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if hasattr(url_or_file, "read"):
        data = url_or_file.read()
        out_path.write_bytes(data)
        return out_path
    import requests
    r = requests.get(str(url_or_file), timeout=300)
    r.raise_for_status()
    out_path.write_bytes(r.content)
    return out_path

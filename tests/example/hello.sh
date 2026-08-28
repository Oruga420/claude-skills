#!/usr/bin/env bash
# tests/example/hello.sh
# Tiny script used as the reference subject for tests/example/hello.bats.
# Kept intentionally small so the corresponding test file is easy to read
# when copied as a template for a new skill.

set -euo pipefail

if [[ -z "${GREET_NAME:-}" ]]; then
  echo "ERROR: GREET_NAME is not set." >&2
  exit 1
fi

case "${1:-hello}" in
  hello) echo "hello, ${GREET_NAME}" ;;
  shout) echo "HELLO, ${GREET_NAME^^}" ;;
  *)
    echo "ERROR: unknown mode: $1" >&2
    exit 2
    ;;
esac

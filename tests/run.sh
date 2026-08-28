#!/usr/bin/env bash
# tests/run.sh — discover and run every *.bats file in the repo.
#
# Usage:
#   ./tests/run.sh                 # run all suites
#   ./tests/run.sh path/to/skill   # run one skill's suite
#   BATS_FORMATTER=tap ./tests/run.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v bats >/dev/null 2>&1; then
  cat >&2 <<EOF
ERROR: bats-core is not installed.

Install it:
  macOS:          brew install bats-core
  Debian/Ubuntu:  sudo apt install bats
  npm:            npm install -g bats

Or pin a version via git submodule — see tests/README.md.
EOF
  exit 127
fi

SEARCH_ROOT="${1:-.}"

# Collect every *.bats file under the search root, ignoring node_modules / .git.
mapfile -t suites < <(
  find "$SEARCH_ROOT" \
    -type d \( -name node_modules -o -name .git \) -prune -o \
    -type f -name '*.bats' -print | sort
)

if [[ "${#suites[@]}" -eq 0 ]]; then
  echo "No .bats files found under $SEARCH_ROOT — nothing to test."
  exit 0
fi

echo "Found ${#suites[@]} test file(s):"
printf '  %s\n' "${suites[@]}"
echo

# Default to the 'tap' formatter when TERM is unset (e.g. CI) or explicitly
# 'dumb', because 'pretty' calls tput and dies on a broken-pipe write. Callers
# can always override with BATS_FORMATTER.
if [[ -n "${BATS_FORMATTER:-}" ]]; then
  FORMATTER="$BATS_FORMATTER"
elif [[ -z "${TERM:-}" || "$TERM" == "dumb" ]]; then
  FORMATTER="tap"
else
  FORMATTER="pretty"
fi

bats --formatter "$FORMATTER" "${suites[@]}"

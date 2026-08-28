#!/usr/bin/env bash
# tests/lib/common.bash — shared bats helpers.
#
# Load in a .bats file with:
#   load '../../tests/lib/common.bash'

# ---- Assertions ------------------------------------------------------------

assert_exit_code() {
  local expected="$1"
  if [[ "$status" -ne "$expected" ]]; then
    echo "expected exit code $expected, got $status"
    echo "output was:"
    echo "$output"
    return 1
  fi
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "expected output to contain: $needle"
    echo "actual output:"
    echo "$haystack"
    return 1
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "expected output NOT to contain: $needle"
    echo "actual output:"
    echo "$haystack"
    return 1
  fi
}

# ---- Fakes / mocks ---------------------------------------------------------

# _ensure_test_tmpdir
#   Older bats (<1.5) doesn't populate BATS_TEST_TMPDIR. Create one on demand
#   so helpers that need a scratch dir work on every supported version.
_ensure_test_tmpdir() {
  if [[ -z "${BATS_TEST_TMPDIR:-}" ]]; then
    BATS_TEST_TMPDIR="$(mktemp -d -t bats.XXXXXXXX)"
    export BATS_TEST_TMPDIR
    _BATS_TEST_TMPDIR_SELF_MADE=1
  fi
}

# fake_home
#   Replaces $HOME with a fresh temp dir for the duration of the test.
#   Sets BATS_TEST_HOME so teardown() can clean up.
fake_home() {
  BATS_TEST_HOME="$(mktemp -d)"
  export HOME="$BATS_TEST_HOME"
  export BATS_TEST_HOME
}

cleanup_fake_home() {
  if [[ -n "${BATS_TEST_HOME:-}" && -d "$BATS_TEST_HOME" ]]; then
    rm -rf "$BATS_TEST_HOME"
  fi
}

# mock_curl <response_body> [exit_code]
#   Shadows `curl` in PATH for this test. The mock writes <response_body> to
#   stdout and exits with [exit_code] (default 0). The invocation (URL, flags,
#   data) is captured at "$BATS_TEST_TMPDIR/curl.invocation" for assertions.
mock_curl() {
  local body="$1"
  local code="${2:-0}"
  _ensure_test_tmpdir
  local bin_dir="$BATS_TEST_TMPDIR/mockbin"
  mkdir -p "$bin_dir"
  cat > "$bin_dir/curl" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$@" > "$BATS_TEST_TMPDIR/curl.invocation"
cat <<'BODY'
$body
BODY
exit $code
EOF
  chmod +x "$bin_dir/curl"
  export PATH="$bin_dir:$PATH"
}

# last_curl_invocation
#   Prints the captured argv from the most recent mocked curl call.
last_curl_invocation() {
  _ensure_test_tmpdir
  cat "$BATS_TEST_TMPDIR/curl.invocation" 2>/dev/null || true
}

# cleanup_test_tmpdir
#   Call from teardown() to remove a BATS_TEST_TMPDIR we created ourselves.
#   A no-op on bats >=1.5 (where bats manages the dir itself).
cleanup_test_tmpdir() {
  if [[ -n "${_BATS_TEST_TMPDIR_SELF_MADE:-}" && -d "${BATS_TEST_TMPDIR:-}" ]]; then
    rm -rf "$BATS_TEST_TMPDIR"
    unset BATS_TEST_TMPDIR _BATS_TEST_TMPDIR_SELF_MADE
  fi
}

# require_cmd <name>
#   Skip the test if the given binary is not available on the runner.
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || skip "$1 not installed"
}

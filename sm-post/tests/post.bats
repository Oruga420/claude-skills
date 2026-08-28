#!/usr/bin/env bats
# sm-post/tests/post.bats — tests for post.sh (Ayrshare API wrapper).

load '../../tests/lib/common.bash'

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/../post.sh"
  require_cmd jq
  unset AYRSHARE_API_KEY
  _ensure_test_tmpdir
}

teardown() {
  cleanup_fake_home 2>/dev/null || true
  cleanup_test_tmpdir 2>/dev/null || true
}

# ---- help / usage ----------------------------------------------------------

@test "--help prints usage and exits 0" {
  run "$SCRIPT" --help
  assert_exit_code 0
  assert_contains "$output" "Usage:"
  assert_contains "$output" "--text"
  assert_contains "$output" "--platforms"
}

# ---- credential handling ---------------------------------------------------

@test "fails with clear error when AYRSHARE_API_KEY is unset" {
  run "$SCRIPT" --text "hello"
  assert_exit_code 1
  assert_contains "$output" "AYRSHARE_API_KEY is not set"
}

# ---- argument validation ---------------------------------------------------

@test "fails when neither --text nor --file is provided" {
  export AYRSHARE_API_KEY="fake"
  mock_curl '{"status":"success"}'
  run "$SCRIPT"
  assert_exit_code 1
  assert_contains "$output" "no post content"
}

@test "rejects unknown flag with exit 2" {
  export AYRSHARE_API_KEY="fake"
  run "$SCRIPT" --not-a-real-flag foo
  assert_exit_code 2
  assert_contains "$output" "Unknown arg"
}

@test "fails when --file points at a missing path" {
  export AYRSHARE_API_KEY="fake"
  run "$SCRIPT" --file "/tmp/does-not-exist-$$"
  assert_exit_code 1
  assert_contains "$output" "cannot read file"
}

# ---- happy path ------------------------------------------------------------

@test "posts with --text: correct URL, bearer header, and JSON body" {
  export AYRSHARE_API_KEY="test-key-xyz"
  mock_curl '{"status":"success","postIds":[{"platform":"twitter","id":"1"}]}'

  run "$SCRIPT" --text "hello world"
  assert_exit_code 0
  assert_contains "$output" '"status": "success"'

  local invocation
  invocation="$(last_curl_invocation)"
  assert_contains "$invocation" "https://api.ayrshare.com/api/post"
  assert_contains "$invocation" "Authorization: Bearer test-key-xyz"
  assert_contains "$invocation" '"post": "hello world"'
  assert_not_contains "$invocation" '"platforms"'
  assert_not_contains "$invocation" '"mediaUrls"'
}

@test "--file: post body is read from the file" {
  export AYRSHARE_API_KEY="fake"
  local draft="$BATS_TEST_TMPDIR/draft.md"
  echo "body from disk" > "$draft"
  mock_curl '{"status":"success"}'

  run "$SCRIPT" --file "$draft"
  assert_exit_code 0
  assert_contains "$(last_curl_invocation)" '"post": "body from disk"'
}

@test "--platforms: payload includes the platforms array" {
  export AYRSHARE_API_KEY="fake"
  mock_curl '{"status":"success"}'

  run "$SCRIPT" --text "hi" --platforms twitter,linkedin
  assert_exit_code 0

  local invocation
  invocation="$(last_curl_invocation)"
  assert_contains "$invocation" '"platforms"'
  assert_contains "$invocation" '"twitter"'
  assert_contains "$invocation" '"linkedin"'
}

@test "--media: payload includes the mediaUrls array" {
  export AYRSHARE_API_KEY="fake"
  mock_curl '{"status":"success"}'

  run "$SCRIPT" --text "look" --media https://example.com/a.png,https://example.com/b.png
  assert_exit_code 0

  local invocation
  invocation="$(last_curl_invocation)"
  assert_contains "$invocation" '"mediaUrls"'
  assert_contains "$invocation" "https://example.com/a.png"
  assert_contains "$invocation" "https://example.com/b.png"
}

# ---- API failure -----------------------------------------------------------

@test "returns non-zero when Ayrshare responds with status != success" {
  export AYRSHARE_API_KEY="fake"
  mock_curl '{"status":"error","errors":[{"code":401,"message":"unauthorized"}]}'

  run "$SCRIPT" --text "hi"
  assert_exit_code 1
  assert_contains "$output" "unauthorized"
}

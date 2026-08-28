#!/usr/bin/env bats
# tests/example/hello.bats — reference bats suite.
# Copy this file into <your-skill>/tests/<your-script>.bats to start.

load '../lib/common.bash'

setup() {
  SCRIPT="$BATS_TEST_DIRNAME/hello.sh"
}

@test "fails with clear error when GREET_NAME is unset" {
  unset GREET_NAME
  run "$SCRIPT"
  assert_exit_code 1
  assert_contains "$output" "GREET_NAME is not set"
}

@test "greets by name in default mode" {
  export GREET_NAME="world"
  run "$SCRIPT"
  assert_exit_code 0
  assert_contains "$output" "hello, world"
}

@test "shouts in shout mode" {
  export GREET_NAME="world"
  run "$SCRIPT" shout
  assert_exit_code 0
  assert_contains "$output" "HELLO, WORLD"
}

@test "rejects unknown mode with exit code 2" {
  export GREET_NAME="world"
  run "$SCRIPT" badmode
  assert_exit_code 2
  assert_contains "$output" "unknown mode"
}

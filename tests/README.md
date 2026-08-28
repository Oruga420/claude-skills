# Testing

This repo uses [**bats-core**](https://github.com/bats-core/bats-core) for shell-script testing.

Most skills are pure markdown (SKILL.md + README) and have nothing to test. Skills that ship **executable scripts** (`*.sh`, `*.mjs`, `*.py`) should ship tests alongside them.

---

## Convention

Tests live **next to the skill they cover**, under a `tests/` subfolder:

```
my-skill/
├── SKILL.md
├── script.sh
└── tests/
    └── script.bats
```

The top-level `tests/` folder (this one) contains **shared infrastructure only**:

```
tests/
├── README.md          # you are here
├── run.sh             # local runner — discovers all *.bats files in the repo
├── lib/
│   └── common.bash    # shared bats helpers (mock_curl, fake_home, ...)
└── example/
    ├── hello.sh       # tiny reference script
    └── hello.bats     # reference test file — copy this to start a new suite
```

---

## Running tests locally

```bash
# Install bats-core once (macOS: brew install bats-core; Debian/Ubuntu: apt install bats)
bats --version

# Run every *.bats file in the repo
./tests/run.sh

# Run a single skill's suite
bats ./sm-post/tests/

# Run a single file
bats ./sm-post/tests/post.bats
```

The runner honors `BATS_FORMATTER` — set to `tap`, `junit`, `pretty`, etc.

---

## Writing a new test suite

1. Copy `tests/example/hello.bats` into `your-skill/tests/your-script.bats`.
2. Adjust the `setup()` block to point at your script.
3. Source the shared helpers: `load '../../tests/lib/common.bash'`.
4. Write tests. Each `@test "name" { ... }` block is isolated.

### Minimum coverage for a new script

Every shipped script should have tests for:

- [ ] Usage / `--help` output renders without error.
- [ ] Missing required env var → clear error + non-zero exit.
- [ ] Missing required arg → clear error + non-zero exit.
- [ ] Happy path with mocked external dependencies (curl, gh, etc.).
- [ ] At least one failure path (API 4xx, permission denied, file not found).

80%+ line coverage is the target. Use [`kcov`](https://github.com/SimonKagstrom/kcov) if you want a real coverage number; otherwise eyeball it against the script.

---

## Shared helpers

See `tests/lib/common.bash` for the current list. Highlights:

- `mock_curl <response_json>` — shadow `curl` in `PATH` to return a canned JSON body.
- `fake_home` — create a throwaway `$HOME` for the test; automatically cleaned up.
- `assert_contains "$output" "needle"` — fail if the last run's stdout/stderr doesn't contain `needle`.
- `assert_exit_code <expected>` — check `$status` from the last `run` call.

Extend the helpers file when you find yourself repeating a pattern across three or more tests.

---

## CI

`.github/workflows/tests.yml` runs `./tests/run.sh` on every push and PR against `master`. A failing test suite blocks merge.

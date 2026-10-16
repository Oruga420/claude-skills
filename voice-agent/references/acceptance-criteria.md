# Acceptance criteria template

Copy this table into the loop contract and replace `<...>`. Commands are literal and run from the
repo root. Green is the exact output named. Red is fixed and rerun. Not run is not green. The
fresh context verifier re-runs the whole table from these commands and pastes each output in the
run log.

Measure the baseline before the first line of code (A1, A2, A4, A9 on the base commit) and record
it in the contract: pre existing failures are recorded, never deleted, and green for the loop means
no new failure beyond them.

| # | Command | Green when |
|---|---|---|
| A1 | `npx tsc --noEmit; echo exit $?` | prints `exit 0` and nothing else |
| A2 | `npm run lint 2>&1 \| grep -E "[0-9]+ errors"; echo exit $?` | a line containing `(0 errors,` then `exit 0`, or no summary line at all with lint itself exiting 0 |
| A3 | `npx vitest run tests/voice-registry.test.ts tests/voice-token-route.test.ts tests/voice-confirm.test.ts tests/voice-routes-source.test.ts 2>&1 \| grep -E "Tests"` | one line `Tests  N passed (N)`, N at least `<30>`, no `failed` |
| A4 | `npx vitest run 2>&1 \| grep -e "Test Files" -e "Tests"` | passed count at least baseline plus the voice tests; failures only the recorded pre existing ones |
| A5 | `npx tsx scripts/sync-voice-agent.ts --dry-run --out dist-voice-registry.json && node -e "const r=require('./dist-voice-registry.json');console.log(r.tools.length)"` | prints `<N>`, the number of distinct tool names in the clickables inventory; the file lists them with a schema and `expects_response` each, plus the agent settings |
| A6 | `grep -c "X-App-Source" <every write route file>` | every file reports at least 1 |
| A7 | `grep -c "cmd.navigate" <VoiceProvider and the page clients>` | the provider reports at least 1; page clients do not push routes themselves |
| A8 | if a previous text assistant is being replaced: `grep -c "<its nav key>" <nav component>` then `curl -s -b cj.txt -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:<port>/<old route>` with a session cookie | `0`, then `307` to the home route (not to login) |
| A9 | `curl -s -D - -o /dev/null http://localhost:<port>/login \| grep -i -e "content-security-policy" -e "permissions-policy"` | CSP contains `https://api.elevenlabs.io`, `wss://*.elevenlabs.io`, `media-src 'self' blob:`; Permissions-Policy contains `microphone=(self)` |
| A10 | `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:<port>/api/voice/token` (no session); then the same with a session cookie and `ELEVENLABS_API_KEY` unset | `401`; then a body saying the agent is not configured and `503` |
| A11 | `python scripts/voice-walkthrough.py` (SDK mocked, dev server up) | prints `ok 6/6` and writes the six screenshots: launcher, call, proposal, countdown, result, close |
| A12 | after deploy: read the latest ready revision, then its container log | the new revision name; log shows the app ready and at least one `POST /api/voice/token` with status 200 from a real browser |
| A13 | `npx tsx scripts/sync-voice-agent.ts --probe` | prints `probe ok: 9/10` or better |
| A14 | `grep -c "<loop name>" wiki/log.md` (or the project's log) | equals the number of run entries in the contract's Logs |
| A15 | if a guided tour exists: `grep -c "<removed nav target>" <tour steps>` then the tour test | `0`, and the tour test passes; a tour whose last target vanished reopens on every visit |

Add one criterion per domain rule the inventory revealed (for example: every admin tool lists only
the admin role; the countdown starts after speech ends, asserted by the confirm store test; the
first message uses only allow listed variables, asserted by the sync script's guard).

## Deploy proof (A12 in detail)

Three read backs, none of them the deploy command's exit code:

1. Container log of the new revision shows the app ready (migrations applied, health probe ok).
2. The running image digest equals the pushed image. With a multi architecture push the service
   runs the architecture child, not the index: compare against the child digest
   (`docker buildx imagetools inspect <tag> --raw`, pick the `amd64` manifest).
3. The revision env lists both secret names.

Then a real call from the operator's browser after a hard reload of the tab.

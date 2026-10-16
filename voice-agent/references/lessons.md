# Lessons, measured on real calls

Each entry is an incident that happened on the reference build, the cause found in logs or
transcripts, and the fix that is now part of the templates. Keep the list; a new build repeats
whichever one it forgets.

| Symptom | Cause | Fix in the templates |
|---|---|---|
| The call dropped when the person changed page | The call component was mounted inside the page shell, which remounts on every client side navigation | `VoiceProvider` mounted once in the root layout, after children; it reads the session itself |
| No way to hang up | Only the vendor's end of call ended it | End call button, close button, Escape, idle timeout, hard cap |
| "Creating ticket in 3, 2..." cut the agent mid sentence | The countdown started when `confirm_action` returned | `startCountdown` is called when the agent's speaking flag flips off, with a safety timer |
| The person said stop and the write still happened | The stop window (3 s) was shorter than speech to text latency for one word | Recorded as the operator's decision (confirm model gate); the window length is a constant in the confirm store |
| Two calls failed before the first word, error 1008 "Missing required dynamic variables in first message" | The greeting referenced a variable the live token route did not send yet | The first message only uses allow listed variables; the sync script refuses others; the date stays in the prompt |
| Agent creation failed with 422 | `additionalProperties` in a schema | Stripped by the sync script |
| Agent creation failed with 400 "Must set one of: description" | An array items node without a description | The sync script adds descriptions recursively; the registry test requires them |
| "Too many voice sessions" during a normal test session | Rate limit of 5 per 10 minutes; a dropped WebRTC connection forces a re-call | 20 per 10 minutes, in a database table |
| "Take me to Admin": the agent said ok, the screen did not move | Only two pages subscribed to the navigate half of the view command; on any other page nobody listened | The provider performs navigation once; pages apply only their filters; filters travelling with a navigation are held until the target mounts |
| "Switch to the routing tab": the agent read the data, the tab did not change | The provider compared only the pathname, so `/admin` and `/admin?tab=routing` looked equal and the push was skipped | Compare pathname plus search |
| Filtering by voice only answered, the screen did not change | The tool read the data and spoke; nothing dispatched a view command | Act and answer rule in the persona, and view tools that always dispatch before they speak |
| The agent claimed it could not do something the person was allowed to do (or offered something it could not) | The prompt described capabilities in prose | `allowedRoles` per tool, `toolsForRole`, and the `canDo` variable built from it |
| The agent spelled its own name every greeting and used surnames | Prompt asked to spell once "if misheard", the model over applied it; the name variable carried the full name | First name only in the token route; greeting without spelling; spell only after a mishearing |
| The agent asked what day it was, or invented a year | No date in context | `today` and `localTime` variables, spoken form, in the prompt |
| "Nothing works" right after a deploy | The tab still ran the previous client bundle | Hard reload the tab after every deploy before testing; say so in the run log |
| Onboarding style requests with many typed fields stalled the call | The agent tried to take a full name and a date by voice | A view tool opens the prefilled form; the persona says the form is open and stays on the line |
| The key looked valid but every agent call answered `missing_permissions` | The API key lacked the ConvAI permissions | Ask for a key with Agents read and write; test with the sync script's `--dry-run` then `--push` |
| A test route export broke the framework's type check | A Next.js route file may only export HTTP handlers | The test seam (`setTokenFetcher`) lives in `tokenFetcher.ts` |
| The deploy "succeeded" but the running image looked old | Multi architecture push: the service digest is the architecture child, not the tag index | Compare against the child digest |
| Replacing the secret set on deploy dropped unrelated secrets | `--set-secrets` replaces the whole set | Always update, never set |

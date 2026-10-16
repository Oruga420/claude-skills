# Voice agent templates

Reusable pieces of a full-duplex ElevenLabs voice agent for a Next.js App Router app: a
confirm-before-write flow, a tool registry shared between the ElevenLabs client and WebMCP, a
call popover with an audio orb, and a full-page confirmation overlay for anything that writes
data. Extracted from a working implementation and generalized for reuse in a new project.

## Two kinds of file here

**Framework** files are real, working TypeScript/TSX. They know nothing about any particular
app's data model; drop them in as-is. **Example** files carry a header comment
(`EXAMPLE: ...`) and show the pattern for one app's domain (tickets with a code, a category, a
priority, and a status) so you can see a complete, compiling-shaped worked example before you
write your own. Two more domain files, an `admin.ts` and a `lifecycle.ts` in the tools
directory, were intentionally not copied: they are pure domain logic for the source app's
Admin page and onboarding/offboarding lifecycle, with nothing generic left to reuse. Add your
own equivalents next to `navigate.ts`/`read.ts`/`write.ts`/`tour.ts` and spread their exported
tool arrays into `VOICE_TOOLS` in `registry.ts`, the same way `WRITE_TOOLS` and `TOUR_TOOLS`
already are.

## File map

### Framework (real code, generic)

| File | What it is |
|---|---|
| `src/lib/voice/confirm.ts` | The confirm/countdown state machine behind every write. Framework free: the clock and the executor are injected, so it is unit testable with no DOM and no real time. |
| `src/lib/voice/callStore.ts` | The one shared confirm store the whole call UI uses (a module-level singleton, not React context; see its docstring for why). |
| `src/lib/voice/webmcp.ts` | Registers the tool registry on `document.modelContext` (native WebMCP, or the polyfill) as a secondary, best-effort discovery surface. Never drives the ElevenLabs conversation itself. |
| `src/lib/voice/tokenFetcher.ts` | The upstream ElevenLabs conversation-token fetch, pulled out of the route file so it has a test seam (a Next.js route may only export HTTP method handlers). |
| `src/lib/voice/dates.ts` | Turns spoken relative dates (last month, since September 1, ...) into ISO ranges plus a spoken description, as a pure function of an injected `today`. |
| `src/lib/voice/tools/types.ts` | The shape every voice tool has: `ToolKind`, `ToolResult`, `ToolContext`, `VoiceTool`, the two write headers, and the role type. |
| `src/lib/voice/tools/registry.ts` | The one list and the one door into it: role-gated dispatch (`runTool`), JSON Schema validation, and the pure-data export the sync script pushes to ElevenLabs. |
| `src/lib/voice/tools/control.ts` | The two control tools every role gets: `confirm_action` (arms a proposal) and `stop_action` (cancels one). |
| `src/components/voice/VoiceProvider.tsx` | Mounted once in the root layout, after `children`. Reads the session, renders the call popover and the overlay, and performs the `navigate` half of every view command (the one place that can, since it is never remounted by client-side routing). |
| `src/components/voice/VoiceCall.tsx` | The corner launcher and popover: wraps `@elevenlabs/react`'s `useConversation`, builds the ElevenLabs `clientTools` map from the registry, an idle timeout, a hard cap, and interruption/resume handling for the confirm store. |
| `src/components/voice/Orb.tsx` | The pulsing call-status disc, volume-driven while speaking via `getOutputVolume` polling, breathing via CSS while listening. |
| `src/components/voice/ActionOverlay.tsx` | The full veil that narrates a pending write, counts down the stop window, and holds the result up for one beat. Reads the one shared confirm store; takes no props. |
| `src/components/voice/voice.module.css` | Styles for all of the above. Reads color/shape tokens from your own global stylesheet; swap the custom property names for yours. |
| `src/app/api/voice/token/route.ts` | Mints a short-lived ElevenLabs conversation token server-side; the API key never reaches the client. Rate-limited via a database table, not in-memory, so it works across more than one server instance. |
| `src/lib/events.ts` | The window `CustomEvent` bus: data-changed, view-command (navigate/filters), tour-command, plus the two write-source headers and the function that reads them off an incoming request. |
| `scripts/sync-voice-agent.ts` | Generates the ElevenLabs agent's tool definitions and persona from the same registry the app registers on WebMCP, so the two cannot drift. `--dry-run --out <file>`, `--create`, `--push`, `--probe` (stubbed). |
| `scripts/voice-walkthrough.py` | Playwright script that captures screenshots of the launcher, popover, orb, overlay and transcript against a mocked token route, for a visual regression / demo record. |
| `tests/voice-confirm.test.ts` | Unit tests for the confirm store, on a fake injected clock. |
| `tests/voice-registry.test.ts` | Tests the registry contract (role gates, validation, permission mirror) against the reduced example tool set in this template; see its header comment for the exact counts. |
| `tests/voice-token-route.test.ts` | Tests the token route: auth, config, rate limiting, dynamic variables. Needs your own db test helpers and repo layer wired in; see its header comment. |
| `tests/voice-routes-source.test.ts` | Integration test proving the write-source headers reach a stored event row. Needs your own db/repo/routes wired in; see its header comment. |

### Example (domain-specific, rewrite these)

| File | What it shows |
|---|---|
| `src/lib/voice/persona.ts` | The system prompt and greeting. Replace the agent's name (`AGENT_NAME`) and the whole category list, marked with a `<<CATEGORIES>>` placeholder block, with your own. |
| `src/lib/voice/tools/navigate.ts` | Three view tools: `navigate`, `set_history_filters`/`set_home_filters`, `start_new_requirement`. Shows how a view tool dispatches through the event bus and never touches data. |
| `src/lib/voice/tools/read.ts` | Four read tools plus the shared resolution helpers (code parsing, category/priority/status matching). Shows how to condense a list into something worth saying out loud. |
| `src/lib/voice/tools/write.ts` | Seven consequential (`propose_*`) tools. Shows the propose-then-confirm shape: validate everything the route will check, build the exact request body, hand it to the confirm store, return at once. |
| `src/lib/voice/tools/tour.ts` | Seven view tools that step a guided tour / welcome card through the same event-bus pattern as `navigate.ts`. |

## Dependencies

From the source project's `package.json`:

```
"@elevenlabs/react": "^1.15.2"
"@mcp-b/webmcp-polyfill": "^5.1.0"
```

## Environment variables

| Variable | Used by |
|---|---|
| `ELEVENLABS_API_KEY` | `src/app/api/voice/token/route.ts` (server-side only, never sent to the client), `scripts/sync-voice-agent.ts` |
| `ELEVENLABS_AGENT_ID` | Same two files |
| `ELEVENLABS_LLM` (optional) | `scripts/sync-voice-agent.ts`, overrides the default model id the agent is pushed with |
| `TZ` (optional) | `src/app/api/voice/token/route.ts`, the zone the spoken `today` / `localTime` variables use; UTC when unset |

`.env.example` in this folder lists them with empty values; copy its lines into your app's own
env file or secret manager. The key is server side only and never belongs in a client bundle.

## Where each piece mounts

- **`VoiceProvider`**: mounted once in the root layout, after `children` (`<body>{children}<VoiceProvider /></body>` or equivalent). It must not live inside a per-page shell component that remounts on client-side navigation, or the call and any open write proposal die on every route change.
- **Token route**: `POST /api/voice/token`. `VoiceCall.tsx` calls it directly (not through a shared API helper) so it can tell a 503 (not configured) apart from a 401 or a 429.
- **Event bus**: `src/lib/events.ts`. `VoiceProvider` performs navigation; individual pages subscribe with `onViewCommand` to apply filters; `Tour.tsx`-equivalent components subscribe with `onTourCommand` while open.
- **Confirm store**: `src/lib/voice/callStore.ts`, a module-level singleton. `VoiceCall` supplies `ToolContext.confirm`; `ActionOverlay` reads and drives it directly; nothing else should construct a second store.
- **Registry**: `src/lib/voice/tools/registry.ts`. `VoiceCall` builds the ElevenLabs `clientTools` map from `toolsForRole(user.role)`; `webmcp.ts` registers the same array on `document.modelContext`; `scripts/sync-voice-agent.ts` exports it to JSON for the agent config.

## Wiring a write route to the confirmation headers

Any route a `propose_*` tool can reach should read the two headers `callStore.ts` sends on
confirmed writes (`VOICE_SOURCE_HEADER` / `VOICE_CONFIRMATION_HEADER` in `types.ts`, matching
`VOICE_SOURCE_HEADER` / `VOICE_CONFIRMATION_HEADER` in `events.ts`) with `readWriteSource()`
from `events.ts`, and store the result (`source`, `confirmation`) on whatever row the write
produces. `tests/voice-routes-source.test.ts` shows the pattern once your own routes exist.

## Judgment calls made while generalizing

- `registry.ts` originally spread an `ADMIN_TOOLS` and a `LIFECYCLE_TOOLS` array (from files
  not copied here) into `VOICE_TOOLS`. Those imports were removed and replaced with a comment
  showing where to add your own; the exported tool count dropped from 39 to 22 (24 with the 2
  control tools) as a result. `tests/voice-registry.test.ts` was rewritten to match the
  reduced example set rather than left asserting a count that would no longer be true.
- `tests/voice-routes-source.test.ts` and `tests/voice-token-route.test.ts` import a database
  test helper, a repo layer, and (for the routes test) three write route handlers that belong
  to the rest of the source application, not to the voice module. They were kept as worked
  examples of the pattern (build a request with the two headers, call the route, assert the
  stored row) with a header comment explaining what to rewire, rather than stripped out or
  faked into compiling against nothing.
- The agent's spoken name was generalized to a single `AGENT_NAME` constant (default
  `"Assistant"`) used throughout `persona.ts`, instead of picking a new invented brand name.
- Real category values (a specific ticketing taxonomy) were replaced with a
  `<<CATEGORIES>>`-delimited placeholder block and an instruction comment, rather than a
  generic placeholder list, so it is unambiguous that this whole block must be rewritten per app.
- The token route reads the spoken date and time in the zone given by `TZ` (set it on the
  deployment, for example `America/New_York`) and falls back to UTC when it is missing. The
  deployment platform mentions (Cloud Run) are illustrative; any platform with more than one
  instance needs the database-backed rate limit for the same reason.

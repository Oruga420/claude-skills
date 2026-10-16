# Architecture

One page. Read `templates/README.md` for the file map.

## Pieces

```
browser                                         server
┌──────────────────────────────────────┐        ┌──────────────────────────────┐
│ root layout                          │        │ POST /api/voice/token        │
│  ├─ page (Home, List, Admin, Item)   │        │   session? 401               │
│  │    subscribes onViewCommand       │        │   configured? 503            │
│  │    applies ONLY its own filters   │        │   over limit? 429 (db table) │
│  └─ VoiceProvider (mounted once)     │◄──────►│   vendor token + variables   │
│       ├─ VoiceCall (launcher, orb,   │  token  └──────────────────────────────┘
│       │   End call, Escape, timers)  │
│       │     └─ ConversationProvider  │◄──────► ElevenLabs Agents (WebRTC)
│       │         clientTools = runTool│  audio    private agent, enable_auth,
│       ├─ ActionOverlay (proposal,    │  + tool   no allowlist, backup LLM off,
│       │   countdown, result)         │  calls    interruption client event
│       └─ navigate (full location)    │
│                                      │        ┌──────────────────────────────┐
│ document.modelContext (WebMCP)  ◄────┤        │ write routes read            │
│   registers the same registry        │        │ X-App-Source: voice          │
└──────────────────────────────────────┘        │ X-App-Confirmation: <words>  │
                                                └──────────────────────────────┘
```

## Registry

`src/lib/voice/tools/registry.ts` exports one list, `VOICE_TOOLS`, plus `VOICE_CONTROL_TOOLS`.
Three consumers depend on it being the single source of truth:

- `webmcp.ts` registers every tool on `document.modelContext`.
- `scripts/sync-voice-agent.ts` calls `exportRegistry()` and generates the vendor agent
  definition, so a name or a schema cannot drift between the page and the agent.
- `runTool(name, input, ctx)` is the only call path the voice session has. It checks
  `allowedRoles` against the caller, validates the input against the schema, and returns a
  `ToolResult` whose `speak` field is always a finished sentence. A failure is a result, not an
  exception: a thrown error would leave the agent silent.

Each tool: `name`, `title`, `description` (says WHEN to call it), `kind`, `inputSchema`,
`expectsResponse`, `responseTimeoutSecs`, `allowedRoles`, `annotations.{readOnlyHint,
consequentialHint}`, `execute(input, ctx)`.

`toolsForRole(role)` is what the agent actually receives, and the token route builds the persona
variable `canDo` from the same function, so the agent is never told it can do something `runTool`
would refuse.

## Confirm store

`src/lib/voice/confirm.ts` is a small state machine, tested without rendering:

```
idle ──propose──► proposed ──confirm_action──► armed ──speech ends──► counting ──t=0──► executing
                     │                           │                        │                  │
                   stop                        stop                     stop            done | failed
                     ▼                           ▼                        ▼
                  cancelled                  cancelled               cancelled
```

- `propose(snapshot)` is what every consequential tool calls, then returns at once with a
  `speak` that reads the fields back and asks.
- `arm(confirmationWords)` is `confirm_action`. The words are kept, trimmed, and sent to the route
  as `X-App-Confirmation`.
- `startCountdown()` is called by the call UI when the agent's speech ends (the SDK's speaking
  flag flips), with a safety timer so a missed event still starts it. This is why the countdown
  never cuts the agent's sentence.
- `stop()` is `stop_action`; it wins until the executor fires.
- `execute()` runs the tool's real write with the source header, then `done` or `failed` with a
  spoken result. The overlay holds the result briefly and clears.
- Tokens are internal. The agent is never given a token to pass back; it only says confirm or stop.

## View command bus

`src/lib/events.ts`: `dispatchViewCommand({ navigate?, filters? })` and `onViewCommand`. Pages
subscribe in a mount effect and apply their own filters only. `VoiceProvider` performs `navigate`
once, because it is the only subscriber mounted on every page. It compares the full location
(pathname plus search) before pushing, and holds filters that travel with a navigation until the
target page mounts, then re-dispatches them.

## Call lifecycle

`VoiceCall` fetches the token, starts the session over WebRTC with the dynamic variables, wires
`clientTools` to `runTool`, and exposes End call, a close button and Escape. Idle timeout and a hard
cap (the vendor's `max_duration_seconds`) end the call. Because the provider is in the root layout,
routing never remounts it; the same conversation continues across pages and after a tool finishes.

## Persona

`persona.ts` holds the system prompt and the first message as data so the sync script pushes them
with the tools. It covers: identity (the agent's name), who the caller is (variables), what this
person can and cannot do, how to talk (first names only, no codes read as code, condense lists),
dates (the agent knows today; it never asks), the domain vocabulary block, what the agent can do,
and the propose / confirm / stop script word for word.

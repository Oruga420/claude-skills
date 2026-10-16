---
name: voice-agent
description: Implementation guide plus bundled toolkit for giving any web app a "Call the agent" voice orb (ElevenLabs Agents) that drives the app's own UI through WebMCP page tools, with a mandatory clickables inventory of the existing code, a propose / confirm / stop model for every write, and an end to end build orchestrated with the bundled /take-control-full, /ultraplan, /judge-charly, /loop-builder, /fable-it, /ruche, /projectstatus and /talk-2-me skills. Use when someone says "/voice-agent", "add a voice agent to this app", "make everything clickable work by voice", "call the agent orb", or wants an ElevenLabs conversational agent wired to a React or Next.js product.
---

# /voice-agent

A web app gets a corner launcher, "Call <agent name>". Clicking it opens a WebRTC call with an
ElevenLabs agent. The orb pulses while the agent speaks, the person can interrupt at any time, and
the agent drives the page: it navigates, applies filters, reads the data on screen and proposes
writes. A write never happens directly. The agent puts the exact fields on screen, reads them back,
waits for a spoken yes, then a short countdown runs after the agent finishes its sentence and the
person can still say stop. The call survives navigation because the provider lives in the root
layout, and everything the agent may do mirrors the permissions the server already enforces.

## Requirements

- **The target app:** React with the Next.js App Router (the templates assume it), a server
  side session, and a database for the token rate limit table. Node 20+ for the bundled
  scripts; `npm install @elevenlabs/react @mcp-b/webmcp-polyfill` in the app; `vitest` and
  `tsx` for the tests and the sync script.
- **ElevenLabs:** an account with the Agents product, an API key with ConvAI read and write
  permissions (`ELEVENLABS_API_KEY`), and the agent id the sync script prints on `--create`
  (`ELEVENLABS_AGENT_ID`). Optional: `ELEVENLABS_LLM` (agent model), `TZ` (zone of the spoken
  date). All listed in `templates/.env.example`; they live server side only.
- **Optional:** Python 3 with Playwright (`pip install playwright && playwright install
  chromium`) for `templates/scripts/voice-walkthrough.py`.
- **For the bundled orchestration skills** (only if you run the build through them): ffmpeg
  on PATH and an ElevenLabs voice id (`ELEVENLABS_VOICE_ID`) for the narrated videos; Node and
  Remotion install themselves on first render; optional `REPLICATE_API_TOKEN` and a local
  ComfyUI for `/ruche` images; `/talk-2-me` is Windows only as shipped. Each bundled skill
  lists its own requirements and ships a `.env.example` where it needs keys.

Everything needed to build that is inside this folder:

| Part | Where | What it is for |
|---|---|---|
| This guide | `SKILL.md` | The order of work and the rules that are not optional |
| Architecture | `references/architecture.md` | How the pieces fit, one page, with the data flow of a call |
| Clickables inventory | `references/clickables-inventory.md` + `scripts/inventory-clickables.mjs` | The indispensable first step: every control in the existing code, what it does, which tool it becomes |
| ElevenLabs setup | `references/elevenlabs-agent.md` | Agent creation, auth, token minting, the vendor schema quirks that cost real calls |
| Acceptance criteria | `references/acceptance-criteria.md` | The template table a stranger can run to say green or red |
| Lessons | `references/lessons.md` | Every incident measured on real calls, with the fix |
| Code templates | `templates/` | The framework files (registry, confirm store, WebMCP wrapper, provider, call UI, overlay, token route, sync script, tests) plus clearly marked example tools |
| Bundled skills | `skills/` + `scripts/install.mjs` | The orchestration skills the build runs on, portable copies |

## Rules that are not optional

1. **Inventory before tools.** No tool is written until `references/clickables-inventory.md` has
   been produced for the target app from its real code. The registry is derived from that table,
   never from memory of what the app "probably" does. The final registry count equals the number
   of inventory rows marked as voice tools, and an acceptance criterion asserts that count.
2. **The registry is the single source of truth.** WebMCP registers what is in it, the sync script
   generates the agent definition from it, and `runTool` is the only door the voice session has.
   A prompt that says "do not write without confirmation" is a suggestion; a registry where write
   tools cannot execute is a fact.
3. **Propose, confirm, stop.** Every consequential tool raises the overlay and returns at once. The
   agent reads the fields back and asks. On a spoken yes it calls `confirm_action`; the countdown
   starts when the agent stops speaking, not when the tool returns. `stop_action` cancels until the
   executor fires. Nothing is "done" until the tool result says so.
4. **Permission mirror.** Each tool declares `allowedRoles` equal to the gate its API route
   enforces, and the persona receives the list of what this person can do. The agent never offers
   an action the server would answer 403 to.
5. **Secrets stay server side.** The ElevenLabs API key never reaches the browser. A server route
   mints a short lived conversation token per call, rate limited in a database table (not process
   memory: more than one instance may serve).
6. **Provider in the root layout.** The call, the overlay and the pending proposal live above every
   page, so client side navigation cannot kill them.
7. **Nothing ships unverified.** Each acceptance criterion is a literal command and a literal
   expected output. Green is the output. Red is fixed and rerun. Not run is not green.

## How a build goes

The build is orchestrated, not typed. Install the bundled skills once
(`node scripts/install.mjs --all` copies `skills/*` into `~/.claude/skills`), then run the phases
below. Each phase names the skill that runs it.

### Phase 0. Inventory the clickables (`scripts/inventory-clickables.mjs`)

```bash
node ~/.claude/skills/voice-agent/scripts/inventory-clickables.mjs src --routes src/app --out docs/voice/clickables.md --json docs/voice/clickables.json
```

The script lists every button, link, form control, tab, switch and handler in the code, with
file and line, label, handler or API path, and the screen it belongs to. Then a person (or the
orchestrator with a scout subagent) fills the two blank columns per row:

- **Kind**: `view` (drives the page, touches no data), `read` (calls a GET and speaks the answer),
  `consequential` (writes; raises the overlay), `control` (never offered as a tool), or `skip`
  with a reason (a browser permission prompt, for example, cannot be clicked by a page tool).
- **Role gate**: the roles the corresponding route accepts.

Rows are then grouped into tools: one tool per distinct action, not per DOM node (six "Take it"
buttons are one `propose_take_ticket` tool with a code argument). The result is the tool list the
plan will build, and the number the sync script must export. Read `references/clickables-inventory.md`
for the method, the grouping rules and the measured gaps of the script.

### Phase 1. Plan and contract (`/take-control-full`)

Invoke `/take-control-full` with the task, pointing it at the inventory and at this folder:

> Build the voice agent for <app> as specified in ~/.claude/skills/voice-agent/SKILL.md. The tool
> list is docs/voice/clickables.md (N tools). Templates are in the skill's templates/ folder.

`/take-control-full` runs the pipeline by itself: `/ultraplan` writes the plan with an HTML page,
`/judge-charly` fires refuters at every claim in it, a fresh context grader scores it against the
ten criteria until it reaches 9, `/loop-builder` turns it into a loop contract
(`loops/<app>-voice-agent/README.md` with Goal, Boundaries, SOP, Acceptance criteria, State,
Logs), the same cycle runs over the contract, then `/fable-it` builds against the contract with
executor subagents, verifies each criterion, and packages the result: the plan HTML, the contract
HTML and a narrated video. `/ruche` is what makes the video explain the conversation; `/projectstatus`
refreshes the project's status page at each breakpoint; `/talk-2-me` says one line when the
operator's attention is needed.

Two gates belong to the operator and the contract records them as such, never as failures:

- **Gate: ElevenLabs agent and key.** Someone with the vendor account creates the Agents plan, a
  private agent with `enable_auth` on and no hostname allowlist, and stores the API key and the
  agent id as two secrets in the deploy target. The loop then syncs the rest of the configuration
  with the sync script. See `references/elevenlabs-agent.md`.
- **Gate: confirm model.** Default is spoken yes plus a stop window after the agent finishes
  speaking. The length of the window is the operator's decision; measured on real calls, a 3 second
  window can be shorter than speech to text latency for the word "stop".

### Phase 2. Implementation, in the order the contract fixes

The templates carry the implementation. Copy them into the target app, rename the event prefix
and header names if the app already has conventions, and add one domain tool file per group the
inventory found (for example `tools/tickets.ts`, `tools/admin.ts`). Build order that worked:

1. **Registry and types** (`templates/src/lib/voice/tools/types.ts`, `registry.ts`): the tool
   shape, `toolsForRole`, `runTool`, `exportRegistry`. Tests first: the registry test asserts the
   count, that every consequential tool has `consequentialHint`, that role filtering matches the
   routes, and that every schema node has a `description` (the vendor rejects nodes without one).
2. **Confirm store and control tools** (`confirm.ts`, `tools/control.ts`): propose, arm,
   `startCountdown` after speech ends with a safety timer, execute, stop, history. Pure state
   machine, tested without rendering.
3. **View command bus** (`src/lib/events.ts`): `dispatchViewCommand` / `onViewCommand`. Pages
   subscribe and apply only their own filters. The provider performs `navigate`, comparing the
   full location including the query string, so a same page tab switch (`/admin` to
   `/admin?tab=routing`) is not skipped.
4. **WebMCP wrapper** (`webmcp.ts`): registers the registry on `document.modelContext` through the
   polyfill, so any agent runtime that speaks WebMCP sees the same tools the voice session uses.
5. **Token route** (`app/api/voice/token/route.ts`, `tokenFetcher.ts`): 401 without a session,
   503 without configuration, 429 above the per user limit, 502 when the vendor fails, 200 with the
   conversation token and the dynamic variables (first name, role, spoken date and time, whether
   admin, the comma separated list of allowed tool titles, live counts).
6. **Persona** (`persona.ts`): identity, who the caller is, the act and answer rule (change the
   screen AND say what changed), the domain vocabulary block, the propose / confirm / stop script,
   first names only. The first message may only use variables every deployed route sends.
7. **Sync script** (`scripts/sync-voice-agent.ts`): `--dry-run --out` writes the generated agent
   config; `--create` mints the private agent; `--push` PATCHes it; `--probe` runs a text probe
   against the live agent. It strips `additionalProperties` and adds descriptions recursively,
   because the vendor schema validator rejects both omissions.
8. **Provider, call UI, orb, overlay** (`components/voice/*`): `VoiceProvider` mounted once after
   children in the root layout; `VoiceCall` with the launcher, End call, close and Escape, idle
   timeout and hard cap; `Orb` scaled by output volume; `ActionOverlay` showing the proposal, the
   countdown and the result.
9. **Headers**: CSP allows `https://api.elevenlabs.io` and `wss://*.elevenlabs.io`, `media-src
   'self' blob:`; Permissions-Policy grants `microphone=(self)`. Measure the current headers first
   and keep the diff in the contract.
10. **Source header on write routes**: the executor sends `X-App-Source: voice` and the person's
    confirmation words (trimmed) so a voice write is distinguishable in the data.
11. **Walkthrough**: a Playwright script with the SDK mocked that captures the launcher, the call,
    a proposal, the countdown, the result and the close, so the flow is verifiable without a paid
    call.

### Phase 3. Verify (`references/acceptance-criteria.md`)

Copy the template table into the contract, replace the placeholders (route paths, tool count,
test file names), and run it. The fresh context verifier subagent of `/take-control-full` re-runs
the whole table from the raw commands and its report goes in the run log verbatim.

### Phase 4. Deploy and prove

Deploy with the two secrets mounted as `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` (update the
existing secret set; never replace it wholesale, or unrelated secrets vanish). Proof is three
things read back, not the deploy command's exit code: the container log shows the app ready, the
running image digest equals the pushed image (with multi arch pushes, compare against the
architecture child of the tag, not the index), and the env lists both secret names. Then one real
call from the operator's browser, with the tab hard reloaded first: the old client stays in memory
after a deploy and produces "the agent said ok and nothing happened" reports that are not bugs.

### Phase 5. Explain (`/ruche`, `/projectstatus`)

`/ruche` renders the conversation as a short narrated video; `/projectstatus` regenerates the
project's status page from measured numbers. If the project publishes an explainer page, it lists
the tool inventory grouped by screen and states the confirm model in one paragraph.

## What the agent can do, by kind

| Kind | Examples from a ticketing app | Executes |
|---|---|---|
| view | navigate, set filters on a list, open the new item form prefilled | immediately, then the agent says what is on screen |
| read | list items, get one item, my counts, stats | immediately, spoken as one condensed sentence |
| consequential | create, take, assign, change status, cancel, comment, add subtask, admin writes | only after confirm_action and the countdown |
| control | confirm_action, stop_action | internal, never offered as a capability |

## Bundled skills

`skills/` holds portable copies. They are scrubbed of any person or company and depend only on
each other and on the tools named in their own requirements sections (ElevenLabs for narration,
ffmpeg, Node and Remotion for video). Install with `node scripts/install.mjs --all` or one at a
time with `node scripts/install.mjs ruche`.

| Skill | Role in this build |
|---|---|
| take-control-full | The whole pipeline in one command: plan, judge, contract, build, verify, package |
| take-controlish | Same pipeline stopping at the approved contract, when the operator wants to read before anything runs |
| ultraplan | Deep multi agent planning with an HTML plan page |
| judge-charly | Adversarial refuters that try to kill every claim in a plan or a diagnosis |
| loop-builder | Turns the plan into a loop contract with state and logs |
| fable-it | Orchestrator mode: plan and judge in the main session, executors build |
| ruche | Explains the conversation as a narrated video |
| projectstatus | Measured status page for the project |
| talk-2-me | One spoken line when the operator's attention is needed |

## House rules for everything authored here

English in user facing copy unless the app says otherwise. No em dashes or en dashes anywhere.
Never paste a key value into a file or a chat; name the variable. Report red as red.

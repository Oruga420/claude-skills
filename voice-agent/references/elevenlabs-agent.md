# ElevenLabs Agents setup

What the operator does once, what the sync script does every time, and the vendor behaviours that
cost real calls before they were understood.

## Account and agent (operator, once)

1. An ElevenLabs account with the Agents product (formerly Conversational AI). The API key used
   by the app must have the ConvAI read and write permissions; a key without them answers
   `missing_permissions` on every agent call even though text to speech works with it.
2. The app's key is the organisation's key, never a personal one. Keys are read from a file or a
   secret manager; a key value is never pasted in chat, in a commit or in a log.
3. Create the agent with the sync script rather than the console, so the definition is code:

```bash
npx tsx scripts/sync-voice-agent.ts --create      # prints the agent id, once
```

   The generated agent is private: `enable_auth` on, no hostname allowlist (the app's own token
   route is the gate), backup LLM disabled, `max_duration_seconds` set to the app's hard cap,
   `interruption` in the client events, voice recording off.
4. Store two secrets in the deploy target: the API key and the agent id, exposed to the container
   as `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID`.

## Sync (every change to tools, persona or settings)

```bash
npx tsx scripts/sync-voice-agent.ts --dry-run --out dist-voice-registry.json   # no network; A5 counts tools here
npx tsx scripts/sync-voice-agent.ts --push                                     # PATCH the live agent
npx tsx scripts/sync-voice-agent.ts --probe                                    # ten turn text probe
```

The script reads `exportRegistry()`, the persona and the first message, and builds the vendor
payload. Two transformations are not optional:

- **Strip `additionalProperties`.** The vendor's schema validator rejects it (422).
- **Every schema node needs a `description`.** Objects, properties, and array items. Missing one
  fails with 400 "Must set one of: description ...". The script adds a generated description where
  the registry has none; the registry test should require one anyway.

## Token minting (server, every call)

`POST /api/voice/token`:

| Condition | Answer |
|---|---|
| no session | 401 |
| key or agent id missing in env | 503, "Voice agent is not configured" |
| more than N grants in the window for this user (database table, not memory) | 429 with a plain English sentence |
| vendor call failed | 502, never echoing the vendor error (it may contain the key or the URL) |
| ok | 200 with `conversation_token`, `conversation_id`, `dynamic_variables`, an expiry hint |

The browser starts the session with `startSession({ conversationToken, connectionType: 'webrtc',
dynamicVariables })`. The key never leaves the server.

Rate limit: start around 20 per user per 10 minutes. A dropped WebRTC connection forces a re-call,
and 5 per 10 minutes tripped on ordinary testing.

## Dynamic variables

Sent by the token route, substituted by the vendor as text into the prompt and the first message:
`name` (first name only), `email`, `role`, `today` (spoken form), `localTime`, `isAdmin`
("yes"/"no" as strings), `canDo` (comma separated tool titles for this role), plus live counts.

**The first message may only use variables EVERY deployed route sends.** The prompt tolerates a
missing variable (the declared default renders); the first message does not, and the call fails
before it starts with `agent_configuration_error 1008 "Missing required dynamic variables in first
message"`. Measured twice on real calls when a new greeting referenced a variable the live
revision did not send yet. The sync script guards the greeting against an allow list; keep the date
in the prompt, not in the greeting.

## Client SDK

`@elevenlabs/react`: `ConversationProvider`, `useConversation({ clientTools })`. Client tools are the
registry wrapped so each returns the `speak` string. The `isSpeaking` flag drives the orb scale
and the confirm store's `startCountdown`.

## Probe

`--probe` opens the same websocket real calls use, in text mode, and runs ten scripted turns
against a two field filter schema. Green is 9 of 10 or better; below that, switch the agent's LLM
and rerun. It is the only check of the live agent's behaviour that needs no microphone.

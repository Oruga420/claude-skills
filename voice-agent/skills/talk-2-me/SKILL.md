---
name: talk-2-me
description: Give Claude Code a voice through ElevenLabs. Two modes per session. Notify mode speaks a one-line first-person summary when a turn ends so you know whether to come back to the screen, after checking your webcam so an empty chair costs nothing. Conversation mode is an open line, hands free, where you talk, your words go to Claude Code as the next instruction after 0.8 s of silence, and the answer comes back spoken. Use when the user says "/talk-2-me", "talk to me", "voice on", "open line", "conversation mode", or wants it off ("voice off", "that's all", "stop listening").
---

# /talk-2-me: a voice for Claude Code

You should not have to stare at the terminal. This skill gives a Claude Code session a voice,
per session, with two modes:

| Mode | What it does | How it feels |
|---|---|---|
| **notify** (default) | When a turn ends, speaks ONE line in first person: what got done, or that Claude needs you. Looks through the webcam first and queues notices while you are away. | A doorbell with context |
| **conversation** | An open line. Claude speaks its reply, the mic opens, you talk, and after 0.8 s of silence your words go to Claude Code as the next instruction. Repeat until you say goodbye. | Talking to the machine, hands free |

Voice is **per session**: only the sessions where you asked for it speak. Watchers, loops and
other projects stay silent even while the engine is on.

## Requirements

Windows 10/11 (capture is ffmpeg `dshow`), Node 20+, ffmpeg + ffplay on PATH, the Claude Code
CLI on PATH, an ElevenLabs API key (`ELEVENLABS_API_KEY`, in the environment or
`~/.claude/talk2me/.env`; see `.env.example`), a webcam for notify mode (optional: set
`"camera": false` to skip the gate) and a microphone for conversation mode. Details and the
hooks to add are in "Setup, once per machine" below.

Engine: `~/.claude/skills/talk-2-me/scripts/talk2me.js` (installed by `scripts/install.mjs`).

## What Claude does when you invoke it

The `UserPromptSubmit` hook flips the switches by itself when it sees the phrases below in your
message, because it is the only piece of the system that knows which session the message came
from. Claude receives a hook note and confirms in one line. Nothing to run.

| You say (typed) | Effect |
|---|---|
| `/talk-2-me`, "talk to me", "voice on", "hablame", "prende la voz" | notify mode on for this session |
| "conversation mode", "open line", "let's talk", "modo conversacion", "linea abierta", "hablemos" | conversation mode on for this session |
| "voice off", "stop talking", "shut up", "apaga la voz", "callate" | voice off for this session |
| "that's all", "stop listening", "close the line", "notify mode", "modo avisos", "ya estuvo" | back to notify mode, voice stays on |

If the hook did not catch the wording, Claude runs one of:

```bash
node ~/.claude/skills/talk-2-me/scripts/talk2me.js on                       # notify
node ~/.claude/skills/talk-2-me/scripts/talk2me.js mode conversation        # open line
node ~/.claude/skills/talk-2-me/scripts/talk2me.js mode notify              # close the line
node ~/.claude/skills/talk-2-me/scripts/talk2me.js off                      # this session
node ~/.claude/skills/talk-2-me/scripts/talk2me.js off --all                # every session
```

When in doubt, turn it off: a voice that will not stop when asked is worse than no voice.

**In conversation mode, reply the way you would speak.** One to three short sentences, first
person, no code, paths or lists in the reply: everything you write will be spoken. Replies over
600 characters are condensed by Haiku before being spoken, but a short reply sounds better than
a condensed one.

## Opening work in other projects

A voice session cannot type into another terminal, and it should not do a project's work inside
itself either: the work belongs in a session rooted in that project, where the project's own
rules, memory and logbook apply. `scripts/open-project.js` is how it dispatches that work.

```bash
P=~/.claude/skills/talk-2-me/scripts/open-project.js
node $P resolve <name>              # which folder does that spoken name mean
node $P open <name> "<instruction>" # start a session there and give it the first instruction
node $P list                        # every live session, with its project
node $P logs <id> [lines]           # what that session has done
node $P tell <id> "<instruction>"   # continue it, keeping its memory
node $P stop <id> [--rm]            # stop it, and forget it
node $P alias <name> <path>         # teach it what a spoken name means
```

**When to dispatch and when to answer here.** Anything that writes in a project, or that takes
more than about a minute, goes to a session in that project. Questions, quick reads, and
anything about this conversation stay here. Resuming a project is `open <name> "<your resume
instruction or skill>"`; a brand new project is scaffolded first, then opened with whatever
bootstrap instruction that project uses.

**Where names are looked up.** `resolve` checks the alias table first, then the direct
children of the folders in `TALK2ME_PROJECT_ROOTS` (separated by `;` on Windows, `:`
elsewhere). Without it the defaults are `~/projects`, `~/code`, `~/src` and `~/Desktop`,
skipping any that do not exist. Teach odd names with `alias`.

**Say the folder out loud before opening it.** `resolve` prints the absolute path it chose and
also lists the other folders whose name contains the same word, because a short project name can
match several folders on a busy machine. Read the path back, then open. On a genuinely
ambiguous name it refuses and asks rather than guessing: opening work in the wrong project is
the failure this whole path exists to avoid.

**One session per project.** `open` refuses when that project already has a live session and
points at `tell` instead. Two sessions on one project means two writers on the same files.

**Report what is actually happening.** A session that has not moved is reported as not moving,
never as working. `logs` is the only truth about a dispatched session; the fact that it started
is not evidence that it is doing anything.

**Stop and remove what you started.** A dispatched session holds several hundred megabytes for
as long as it lives.

## Setup, once per machine

1. **Requirements.** Windows 10/11 as shipped (mic and camera capture use ffmpeg `dshow`;
   playback uses `ffplay`, with a Windows Media Player fallback), Node 20+, ffmpeg on PATH
   (`winget install Gyan.FFmpeg`), the Claude Code CLI on PATH (summaries run
   `claude -p --model haiku`), and an ElevenLabs API key from **your own** account.
2. **Install the skill.** From the repo root: `node scripts/install.mjs talk-2-me`.
3. **Key.** Create `~/.claude/talk2me/.env` with one line, `ELEVENLABS_API_KEY=<your key>`, and
   keep it out of every repo. The engine also accepts the same environment variable. The same key
   pays for text to speech and for transcription (ElevenLabs Scribe).
4. **Hooks.** Add both hooks to `~/.claude/settings.json`. Replace `<HOME>` with your home
   directory written with forward slashes instead of backslashes. The Stop hook must be
   **synchronous** (no `async: true`) and needs a long timeout: conversation mode answers Claude
   Code through this hook, and an async hook's answer is never read.

   ```json
   {
     "hooks": {
       "Stop": [
         {
           "matcher": "*",
           "hooks": [
             {
               "type": "command",
               "command": "node \"<HOME>/.claude/skills/talk-2-me/scripts/talk2me.js\" hook stop",
               "timeout": 180
             }
           ]
         }
       ],
       "UserPromptSubmit": [
         {
           "matcher": "*",
           "hooks": [
             {
               "type": "command",
               "command": "node \"<HOME>/.claude/skills/talk-2-me/scripts/talk2me.js\" hook prompt",
               "timeout": 10
             }
           ]
         }
       ]
     }
   }
   ```

   Notify mode stays fast anyway: the hook hands the work to a detached child and returns in
   about 150 ms. If you already have hooks for those events, append these entries to the
   existing arrays.

   **Already running another talk-2-me?** Keep it, and add this one as conversation only. Give
   this engine its own state directory (add `--dir <HOME>/.claude/talk2me-second` to both hook
   commands above, and put the key in that directory's `.env`), then set
   `"conversationOnly": true` in its `state.json`. It then stays completely inert outside a
   conversation: its Stop hook returns at once without speaking or queueing, and its prompt hook
   answers only to the conversation phrases, never to "voice on" or "voice off". The other
   engine keeps owning spoken notices and nothing is narrated twice. Both share one machine-wide
   speaking lock, so the two never talk over each other.
5. **Voice, name, language.** The default voice is Sarah, an ElevenLabs premade voice every
   account has. List yours with `voices`, then set the voice, who the line addresses, and the
   language of what is spoken:

   ```bash
   node ~/.claude/skills/talk-2-me/scripts/talk2me.js voices
   node ~/.claude/skills/talk-2-me/scripts/talk2me.js on --voice <id> --name Sam --lang en
   ```

   `--lang` accepts `en` or `es`. Settings persist in `~/.claude/talk2me/state.json`.
6. **Camera (notify mode).** The engine looks through your webcam before spending anything.
   With nothing set it tries every device `dshow` lists, in order (the first one that gives a
   frame wins). Set `camera` in `state.json` to your device name as `dshow` reports it (or
   `TALK2ME_CAMERA` for one run) to try that one first, or `"camera": false` to skip the
   presence check and speak every notice right away.
7. **Microphone (conversation mode).** `mics` lists capture devices; the first one is used
   unless you set `"mic": "<device name>"` in `state.json`. Which one actually hears you is not
   obvious from the name, so measure it:

   ```bash
   node ~/.claude/skills/talk-2-me/scripts/talk2me.js mics --test   # talk the whole time
   node ~/.claude/skills/talk-2-me/scripts/talk2me.js listen        # say a sentence, read it back
   ```

   `mics --test` records every input **at the same time** for a few seconds, then
   **transcribes each sample**. The ones that give back your words are ranked by how far your
   voice rose above each device's own noise, and that order is saved to `micRanking`. Levels
   alone are not the verdict: ranking inputs by loudness just ranks their hiss. The test has to
   be run by the person talking, and when nothing intelligible reached any input it says so
   instead of crowning a winner. `--secs N` changes the length, `--no-stt` skips transcription,
   and `--sequential` falls back to one device at a time if your machine refuses to open several
   captures at once.

   **Recording follows the whole order, not one device.** The best mics are the ones that get
   taken: a speakerphone goes into meetings, a shotgun is not always plugged in. Each time it
   listens, the engine walks `mic` (a name, or a list, if you pinned one), then `micRanking`,
   then whatever else exists, and uses the first input that opens. Built-in laptop arrays go
   last on purpose: they are far-field and heavily processed, and one measured 2.7 dB of voice
   above its own hiss while the transcriber turned that hiss into a whole sentence nobody said.
   Put part of a device's name in `micDeny` to bar it outright.

   `listen` prints what it heard and the level lines behind it: the room floor, the speech
   threshold, the level at onset, the peak. Speech must land clearly above the threshold and the
   cut must come 0.8 s after you stop. If it does not, adjust the knobs below.
8. **Test the voice without speaking, then for real:**

   ```bash
   TALK2ME_NOPLAY=1 node ~/.claude/skills/talk-2-me/scripts/talk2me.js test   # renders and verifies audio, no sound
   node ~/.claude/skills/talk-2-me/scripts/talk2me.js test                    # you should hear it
   ```

Start a new Claude Code session after editing `settings.json`.

## Conversation mode, turn by turn

1. You type "open line" (or say it, once the line is open). Claude confirms in one sentence.
2. Claude finishes a turn. The hook speaks the reply and waits for the audio to END before
   opening the mic, so the speaker never talks over you.
3. The mic opens. The first 0.8 s only read the room (laptop mic arrays ramp their gain up at
   start). Then speech is anything 8 dB above the room floor for at least 200 ms.
4. You stop talking. After 0.8 s of quiet the recording is cut and sent to ElevenLabs Scribe.
   Bursts shorter than 300 ms of speech (a click, a cough) are dropped, never transcribed.
5. The transcript comes back to Claude as its next instruction, marked as a voice message with
   a reminder to answer briefly. Claude works, replies, and step 2 repeats.
6. The line closes when you say "that's all" (or any phrase in the table above), when nobody
   speaks for 45 s, or after 200 turns. Typing still works at any moment; a typed message cuts
   whatever is playing.

The camera gate does not apply in conversation mode: someone talking to the machine is there.

### Knobs (`conversation` object in `state.json`)

| Key | Default | Meaning |
|---|---|---|
| `silenceMs` | 800 | Quiet after speech that ends the utterance |
| `speechAboveFloorDb` | 8 | Speech = louder than the tracked room floor by this many dB. The main knob. |
| `silenceDb` | -50 | Absolute lower bound of the speech threshold (RMS dBFS per 100 ms) |
| `agcSettleMs` | 800 | Time given to the mic's automatic gain before reading the floor |
| `minSpeechMs` | 300 | Shorter bursts are ignored |
| `listenTimeoutMs` | 45000 | Nobody spoke: the line goes idle for this turn |
| `maxUtteranceMs` | 60000 | Hard cap on one utterance |
| `maxSpokenChars` | 600 | Longer replies are condensed before being spoken |
| `maxTurns` | 200 | Runaway guard |

Also in `state.json`: `mic` (device name, or `file:<path>` to feed a wav at real-time pace for
tests), `sttModel` (default `scribe_v2`; `scribe_v1` was retired by ElevenLabs in July 2026).

**Cost of listening.** ElevenLabs lists Scribe v2 at $0.22 per hour of audio on its API price
page, but its plan page says speech to text draws 330 credits per minute from the same credit
pool as text to speech. The two pages disagree; check your usage page after the first
conversation. Only the seconds you actually speak are sent, never the idle wait.

## How it sounds

- Notify, something got done: *"Hey Sam, in the api project the reports endpoint is in and the tests pass."*
- Notify, Claude needs you: *"Hey Sam, the dashboard is done but I need you to answer two things before I continue."*
- Conversation: *"Sure, the reports page is open. What do you want to change first?"* Then you
  talk, and the next reply comes back the same way.

In notify mode, if the turn asks you questions or waits for your OK, that wins over everything
else and the line says so. Several notices piled up while you were away? You hear ONE message
that covers every project and says in which ones Claude is waiting for you.

## How it works

- The `Stop` hook reads the last message of the main agent. In notify mode it stores the raw
  text in a central queue (`~/.claude/talk2me/pending.json`), triggers a review in a detached
  child, and returns at once. In conversation mode it stays in the foreground: speak, listen,
  transcribe, and answer Claude Code with `{"decision": "block", "reason": "<what you said>"}`,
  which keeps the session going with your words as the next instruction. No output means the
  session stops normally, which is how the line goes quiet.
- The notify review grabs one webcam frame with ffmpeg, measures brightness locally (a black
  frame means lens cap or dark room, nothing is sent anywhere), and only then asks Haiku whether
  a person is visible. Camera busy, black or empty: the notice waits. Verdicts are cached 25 s.
- Levels for the mic are measured in the engine on raw 16 kHz PCM streamed by ffmpeg, in 100 ms
  windows, not with ffmpeg's `silencedetect`: ffmpeg buffers stderr when it is a pipe, so the
  filter's lines arrived only when the process ended.
- ElevenLabs renders speech with `eleven_multilingual_v2` and transcribes with Scribe. The mp3
  is cached under `~/.claude/talk2me/audio/` and played by `ffplay`, one at a time.
- The `UserPromptSubmit` hook cuts any audio from the session you just typed in, empties that
  session's queue, re-arms it, and handles every phrase in the table above. Heartbeats and
  autonomous loops are detected by pattern and never count as you typing.

## Design notes worth knowing

- **Why hooks and not an MCP server.** An MCP server only acts when the model calls one of its
  tools; nothing in MCP can push your words into an idle session. The Stop hook can: returning
  `decision: block` with a reason makes the session continue on that reason. No extra runtime,
  no second brain, your live session with its full context is the one talking.
- **The ElevenLabs Agents option, considered and not made the default.** ElevenLabs Agents give
  the most natural turn taking (interruptions, sub-second replies) and can run without a UI from
  Node over WebSocket. But the agent's brain is ElevenLabs' LLM unless you point it at a Custom
  LLM endpoint that must be reachable from ElevenLabs' servers (a tunnel), it is billed per
  minute of conversation, and it talks to a `claude -p` bridge, not to the session you have open.
  It is a valid separate mode for a kiosk or a phone line; it is not this one.
- **Laptop mic arrays lie for the first second.** Intel Smart Sound reads -63 dBFS at 200 ms and
  -37 dBFS at 1200 ms for the same silent room: automatic gain ramping. A fixed threshold either
  swallows quiet syllables or never sees silence. The floor is read after `agcSettleMs`, then
  tracked on quiet windows only (fast to fall, slow to rise, frozen while speech is on).
- **The same arrays cancel the machine's own speakers.** Echo cancellation removes most of
  what the laptop plays through its speakers, so a TTS clip played back is NOT a stand-in for a
  person when testing. Use `mic: "file:<wav>"` for repeatable tests and `listen` with your own
  voice for calibration.
- **One voice on the machine at a time, and the mic never opens under it.** Playback holds a
  lock file shared by every copy of the engine on the machine; another playback waits for it,
  and the conversation mic waits for silence before opening. In a live test the mic caught the
  spoken notice of a different session and Claude took that summary as the user's words. Run a
  single engine: two installs with hooks in the same session mean two voices and cross talk.
- **Quiet input is normalized.** The captured utterance is peak-normalized to -3 dBFS before it
  goes to Scribe, and the configured language is sent as a hint; a shotgun mic at a normal
  Windows level gave -43 dBFS peaks and Scribe misread the language on that.
- **Scribe invents tags on noise.** Silence alone came back as `[outro jingle]`. The engine only
  transcribes after the detector heard speech, asks Scribe not to tag audio events, and drops
  results that are nothing but bracketed tags.
- **Read stdin synchronously in hooks.** On Windows the `end` event of a piped stdin can arrive
  late; the event-based reader hit its 3 s fallback on every call. `fs.readFileSync(0)` returns
  the moment Claude Code closes the pipe.
- **One notice per intervention, per session** (notify). A session that stops ten times without
  you typing in between speaks once, except when it goes from "done" to "I need you".
- **Queue, never drop, never overlap** (notify). A claim on the source message hash, an
  inter-process mutex via atomic `mkdir`, and a single drainer that waits for each audio to end.
- **`eleven_multilingual_v2`, not `eleven_v3`.** v3 cuts the tail of the audio most of the time
  and no status code reveals it. The engine measures every mp3 and retries up to three times.
- **Fail open, off costs nothing.** Any failure lands in `~/.claude/talk2me/talk2me.log` and the
  session continues. With voice off the hook reads a small JSON and exits.

## Commands

```bash
J=~/.claude/skills/talk-2-me/scripts/talk2me.js
node $J on [--voice ID] [--model ID] [--name NAME] [--lang en|es] [--mode notify|conversation]
node $J off [--all]                 # voice off for this session, or for all
node $J mode conversation|notify    # switch mode for this session
node $J status                      # on/off, speaking sessions, conversation sessions, mic, credits
node $J listen                      # record one utterance from the mic and print the transcript
node $J mics [--test]                # list inputs, or measure which one hears you
node $J pending | presence | review | flush   # the notify queue and the camera gate
node $J say "text"                  # speak a line you already wrote
node $J test                        # end-to-end audio test
node $J voices [filter]             # voices in your ElevenLabs account
```

Every command accepts `--dir <state dir>` to run against a separate state directory, which is
how a second copy of the engine can be tried inside a live session without touching the
installed one.

## Testing without talking to anyone

- `TALK2ME_DRYRUN=1` runs the gates, the summarizer and the sanitizer and prints the line, with
  no ElevenLabs call and no sound.
- `TALK2ME_NOPLAY=1` generates the audio for real and verifies it, but does not queue or play it.
- `TALK2ME_VADLOG=1` logs the level of every 100 ms window while listening, for calibration.
- `mic: "file:<wav>"` feeds a recording into the detector at real-time pace.

## Files

| File | What it is |
|---|---|
| `~/.claude/talk2me/state.json` | Enabled flag, per-session `voice` and `mode`, `voice`, `model`, `name`, `lang`, `camera`, `mic`, `conversation` knobs, counters. Hand-editable. |
| `~/.claude/talk2me/pending.json` | Notify queue waiting for you to show up. Hand-editable, temporary by design. |
| `~/.claude/talk2me/history.md` | Append-only record: queued, spoken, heard (voice messages), why it waited. |
| `~/.claude/talk2me/queue.json` | Rendered audio waiting to play, drained one at a time. |
| `~/.claude/talk2me/talk2me.log` | Diagnostics, self-trimmed at 512 KB. |
| `~/.claude/talk2me/cam/` | Last webcam frame and last utterance wav. |
| `~/.claude/talk2me/.env` | `ELEVENLABS_API_KEY`. Local only, never committed. |

## Known limits

- Windows only as shipped. Capture is `dshow`; on macOS or Linux swap the capture and playback
  commands and set `"camera": false`.
- While the line is open the Stop hook is running and Claude Code shows no progress for a
  synchronous hook: the session looks frozen until you speak or the 45 s idle timeout passes.
  Typing cancels nothing mid-listen; it is picked up on the next turn.
- Claude Code documents an override of Stop hooks after 8 consecutive blocks "without
  progress". Whether a fresh spoken instruction counts as progress is not documented; if the
  line drops after 8 exchanges without typing, type anything to reset it.
- Claude Code also ships its own dictation (`/voice`, push to talk, input only, needs a claude.ai
  login). It types what you say; it does not speak back and it is not hands free. Conversation
  mode here does both, which is the whole point.
- Next step if the local detector misfires in your room: ElevenLabs Scribe v2 Realtime over
  WebSocket has server-side end-of-utterance detection (`commit_strategy=vad`, silence
  threshold down to 0.3 s) and returns a committed transcript about 150 ms after you stop. It
  would replace the local level detector, not the hook loop. Not built yet.
- The spoken reply is Claude's whole last message (condensed past 600 characters). Claude has to
  keep conversation replies short for this to sound right.
- Inline code comments in the engine are in Spanish, kept verbatim from where it was born. All
  user-facing strings, prompts and the CLI are in English.
- Voice IDs are per ElevenLabs account. Cloned voices from someone else's account will not work
  with your key; pick one of yours with `voices`.

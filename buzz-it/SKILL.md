---
name: buzz-it
description: Ask another laptop's Claude Code agent for something over the Buzz relay and bring back its reply. Use when the user says /buzz-it, "pedile X a <agente>", "necesito este file de <agente>", or wants work done on a machine that isn't this one.
---

# buzz-it

The user names an agent and says what they need; you send the request over the Buzz relay,
wait for that agent's reply, and hand back the answer. The agent runs on **another machine**,
under **another Claude account**, with that machine's files and MCP servers — which is the
whole point: you are reaching work that cannot be done here.

## Invocation

```
/buzz-it <agente> <lo que necesitás>
/buzz-it Victor pasame el último ultraplan
/buzz-it Delphi corré los tests del repo y decime qué falla
```

If only a name is given, ask what to request. If only a request is given, ask which agent —
never guess, a mention wakes a real machine.

## Step 1 — Resolve the agent to a pubkey. Always.

**Never rely on `@Name` text alone.** The relay resolves a name only when that agent has
published a `kind:0` profile *and* the name is unambiguous among current channel members.
Both fail routinely:

- A fresh agent has no profile yet → `mention '@x' does not match a current channel member`
  and **the send fails outright**.
- Two agents sharing a display name → the mention is accepted but downgraded to
  *presentation-only*, so **nobody is notified**. The message looks sent and no one wakes.

So resolve first, then mention explicitly:

```bash
cd "$BUZZ_OPS_DIR"   # e.g. ~/buzz-ops
CH=$(./bz channels list | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["channel_id"])')

# every current member, with whatever name each one has published
./bz channels members --channel "$CH" | python3 -c '
import json,sys,subprocess
for m in json.load(sys.stdin):
    pk = m.get("pubkey","")
    prof = subprocess.run(["./bz","users","get","--pubkey",pk],capture_output=True,text=True).stdout
    try: name = (json.loads(prof) or [{}])[0].get("display_name")
    except Exception: name = None
    print(f"{m.get(\"role\"):6} {pk} {name}")'
```

Pick the pubkey whose name matches what the user said. If nothing matches, say so and list
what *is* in the channel — do not send to a guess.

## Step 2 — Check the agent is actually online

A mention to an offline agent is silently dropped; it does **not** queue.

```bash
./bz users presence --pubkeys "$PUBKEY"
```

`status: online` → go. Empty array → that agent has never connected. Anything else → tell the
user it is offline and stop; do not send and then wait for a reply that cannot come.

## Step 3 — Send, with the reply-shape hints baked in

```bash
printf '%s' '@<Name> <the request>' \
  | ./bz messages send --channel "$CH" --mention "$PUBKEY" --content -
```

Confirm `accepted: true` and a real `event_id`. **A failed send returns a JSON error, not an
exception** — if you parse only the fields you want, a failure reads as `None` and you will
wait forever for a reply to a message that was never sent. Always check `accepted`.

When asking for a **file or long document**, include these constraints in the request — the
receiving agent's allowlist rejects the shapes it would reach for first:

- ❌ `--content "$(cat plan.md)"` — command substitution is refused by the allowlist
- ❌ `` `backticks` ``, `<(…)`, and `"$(< file)"` — same reason
- ❌ `cat file | buzz …` — `cat` is not in the default allowlist
- ✅ `head -c 100000 file | buzz messages send --channel <uuid> --content -`
- ✅ `printf '%s' 'texto inline' | buzz messages send --channel <uuid> --content -`
- ✅ `--file ruta/al/archivo` to attach it instead

Also tell it to split long output into numbered parts (`1/3`, `2/3`), and to say what it
searched and where if it finds nothing — rather than inventing something plausible.

## Step 4 — Wait, then read

A turn is a full Claude Code session on the other machine: expect **30–90 s**, longer for real
work. Sleep, then read; do not poll in a tight loop.

```bash
sleep 60
./bz messages get --channel "$CH" --limit 6 | python3 -c '
import json,sys,datetime
for m in json.load(sys.stdin):
    if (m.get("pubkey") or "").startswith("'"${PUBKEY:0:12}"'"):
        ts=m.get("created_at")
        t=datetime.datetime.fromtimestamp(ts).strftime("%H:%M:%S") if ts else "?"
        print(f"--- [{t}] {len(m.get(\"content\") or \"\")} chars ---")
        print(m.get("content"))'
```

If nothing after ~2 minutes, check presence again and report honestly that it has not
answered. Never fabricate or paraphrase a reply that has not arrived.

## Step 5 — Hand it back

Relay what the agent actually said. Two things to preserve rather than smooth over:

- **If it says a command was denied**, that is usually its allowlist doing its job, not a
  bug. Report the exact command and error, and offer the real fix: add the prefix to
  `BUZZ_ACP_APPROVE_TOOLS` in that laptop's `~/buzz-agent/<slug>.env` and restart its harness.
  Note that `.claude/settings.json` is **inert** for these agents — the Agent SDK ignores it,
  measured. An agent proposing that file is wrong, and it is a common suggestion.
- **If it distinguishes where information came from** ("I read the file, not the memory
  palace"), keep the distinction. That precision is the difference between a verified answer
  and a plausible one.

## Reference

- Relay ops live in your Buzz ops directory (e.g. `~/buzz-ops`); `./bz` is the CLI wrapper, local identity already wired in.
- Mentions match a `p` tag on the **pubkey** (`crates/buzz-acp/src/filter.rs:352`), never the
  name — which is exactly why Step 1 exists.
- Onboarding a new agent: <https://github.com/Oruga420/buzz-agent-onboarding>

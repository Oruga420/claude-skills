---
name: sm-post
description: Post to social media via Ayrshare API (Twitter/X, LinkedIn, Facebook, Instagram, TikTok, YouTube, Threads, Bluesky, Pinterest, Reddit, Telegram, Google Business). Use when the user says /sm-post, "posteá esto en X/LinkedIn/etc", "publicá en redes", or provides text/a file path to share on social media.
origin: user
---

# sm-post — Post to Social Media (Ayrshare)

Publishes a post to one or more social networks through the [Ayrshare](https://www.ayrshare.com/) API.

## When to Activate

Trigger this skill when the user:
- Invokes `/sm-post` (with or without arguments)
- Asks to "post", "publish", "share", "postear", "publicar" on any social network
- Says things like "posteá en LinkedIn:", "tweet this", "share this on X and Threads"
- Hands over a text file or a block of text to be published

## Input Modes

Accept ANY of these three input forms:

1. **Direct text** — the user typed the post inline (e.g. `/sm-post "Launching today! 🚀"`)
2. **File path** — the user passed a path to a `.txt` / `.md` / any text file. Read it with the Read tool and use its content as the post body.
3. **Context inference** — the user said "posteá esto" / "share that" referring to something earlier in the conversation (a draft, an article output, a result). Pick the most recent suitable text and confirm with the user before posting.

If unclear which content to post, ask the user ONCE with a short question listing the candidates.

## Platforms

Ayrshare platform IDs: `twitter`, `linkedin`, `facebook`, `instagram`, `tiktok`, `youtube`, `threads`, `bluesky`, `pinterest`, `reddit`, `telegram`, `gmb`, `snapchat`.

- If the user names platforms explicitly → use only those.
- If the user does NOT specify → default to **all connected platforms** (call without the `platforms` field, which tells Ayrshare to post everywhere the account has linked).
- Before posting to "all", show the user the post text + destination and ask for confirmation.

## Credentials

The API key lives in the env var `AYRSHARE_API_KEY`. If the user set it in a project `.env` file, it must be exported into the shell (e.g. `set -a; source .env; set +a`) before the script runs. If the var is missing, stop and tell the user to export it — do NOT try to read `.env` files from arbitrary paths.

## How to Post

Use the helper script at this skill's directory: `~/.claude/skills/sm-post/post.sh`.

```bash
# All connected platforms
~/.claude/skills/sm-post/post.sh --text "Hello world"

# Specific platforms (comma-separated)
~/.claude/skills/sm-post/post.sh --text "Hello world" --platforms twitter,linkedin

# From a file
~/.claude/skills/sm-post/post.sh --file ./draft.md --platforms linkedin

# With media URL(s)
~/.claude/skills/sm-post/post.sh --text "Check this out" --media https://example.com/img.png
```

The script:
1. Validates `AYRSHARE_API_KEY` is set.
2. Reads text from `--text` or `--file`.
3. Sends `POST https://api.ayrshare.com/api/post` with a JSON body.
4. Prints the JSON response so you can surface `postIds` or error messages to the user.

## Pre-post Checklist (DO THIS BEFORE CALLING THE SCRIPT)

- [ ] Text content is finalized and confirmed with the user.
- [ ] Platforms are decided (explicit list OR "all connected" with confirmation).
- [ ] If posting to Instagram/TikTok/YouTube/Pinterest → media URL is required; ask for it if missing.
- [ ] Character limits respected (Twitter/X: 280, Bluesky: 300, others: generally fine).
- [ ] `AYRSHARE_API_KEY` is exported in the shell.

## After Posting

- Parse the JSON response.
- If `status: "success"` → report each platform's `postUrl` (or `id`) back to the user.
- If any platform failed → surface the `errors[]` array verbatim, do not swallow.

## Examples

**User:** `/sm-post "Shipped the new landing page today"`
→ Confirm destinations ("post to all connected platforms?"), then run script.

**User:** `posteá el contenido de ./launch-copy.md en linkedin y twitter`
→ Read file, show preview, run with `--platforms linkedin,twitter`.

**User:** `tomá el borrador que acabás de generar y posteálo en X`
→ Use the draft from earlier in the conversation, confirm text, run with `--platforms twitter`.

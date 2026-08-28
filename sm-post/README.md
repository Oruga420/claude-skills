# sm-post — Social Media Publisher (Ayrshare)

One-shot skill to publish a post to **Twitter/X, LinkedIn, Facebook, Instagram, TikTok, YouTube, Threads, Bluesky, Pinterest, Reddit, Telegram, and Google Business Profile** through the [Ayrshare](https://www.ayrshare.com/) API.

Ayrshare handles the per-platform OAuth and API plumbing — this skill is a thin wrapper that turns a Claude Code conversation (or a text file) into a single HTTP call.

---

## What it does

- Activates on `/sm-post`, or natural phrases like "posteá esto en LinkedIn", "share this on X", "publicá en redes".
- Accepts **three input modes**:
  1. **Direct text** — `/sm-post "Shipping the v2 today 🚀"`
  2. **File path** — `/sm-post ./draft.md --platforms linkedin,twitter`
  3. **Context inference** — "posteá el borrador que acabás de generar" → uses the most recent suitable text from the conversation.
- Posts to the platforms the user names, or to **all connected accounts** by default (with confirmation).
- Returns the Ayrshare response including per-platform `postUrl` / error details.

---

## Install

```bash
# Symlink (stays in sync with this repo)
ln -s "$(pwd)/sm-post" ~/.claude/skills/sm-post

# Or copy
cp -r sm-post ~/.claude/skills/sm-post
chmod +x ~/.claude/skills/sm-post/post.sh
```

---

## Setup

1. **Get an Ayrshare API key** — sign up at [app.ayrshare.com](https://app.ayrshare.com/) and copy your key from the dashboard.
2. **Connect your social accounts** inside the Ayrshare dashboard (Twitter/X, LinkedIn, etc.).
3. **Export the key** before invoking the skill:

   ```bash
   # Option A: global, in ~/.bashrc or ~/.zshrc
   export AYRSHARE_API_KEY="xxxxx"

   # Option B: per-project .env
   # Add AYRSHARE_API_KEY=xxxxx to .env, then:
   set -a; source .env; set +a
   ```

4. **Requirements**: `curl` and `jq` must be installed. On Debian/Ubuntu:
   ```bash
   sudo apt install jq
   ```

---

## Usage

### From Claude Code

```
/sm-post "New blog post is live: https://example.com/post"
```

```
/sm-post ./announcement.md --platforms linkedin,twitter
```

```
posteá en X y Threads el último resumen que generaste
```

### Direct script invocation

```bash
# All connected platforms
~/.claude/skills/sm-post/post.sh --text "Hello world"

# Specific platforms
~/.claude/skills/sm-post/post.sh --text "Hello" --platforms twitter,linkedin

# From file
~/.claude/skills/sm-post/post.sh --file ./draft.md --platforms linkedin

# With media (required for IG / TikTok / YouTube / Pinterest)
~/.claude/skills/sm-post/post.sh --text "Look" --media https://example.com/img.png
```

### Supported platform IDs

`twitter`, `linkedin`, `facebook`, `instagram`, `tiktok`, `youtube`, `threads`, `bluesky`, `pinterest`, `reddit`, `telegram`, `gmb`, `snapchat`

---

## Behavior notes

- **Confirmation before posting** — Claude will show the final copy + destination list before calling the API. Unless you explicitly say "just post it", it waits for your OK.
- **Character limits** — the skill respects per-platform limits when obvious (X: 280, Bluesky: 300). If your text exceeds, Claude will offer to trim.
- **Media-required platforms** — Instagram, TikTok, YouTube, and Pinterest need a `mediaUrls` value. The skill will ask for one if missing.
- **Errors surface verbatim** — if a single platform fails, the Ayrshare `errors[]` array is shown without swallowing.

---

## Security

- `AYRSHARE_API_KEY` is never written to disk by this skill.
- The key is only read from the environment at call time.
- Do **not** commit your `.env` — add it to `.gitignore`.

---

## Files

```
sm-post/
├── SKILL.md   # skill frontmatter + instructions for Claude
├── post.sh    # bash helper that calls POST https://api.ayrshare.com/api/post
└── README.md  # this file
```

---

## License

MIT (same as the parent repo).

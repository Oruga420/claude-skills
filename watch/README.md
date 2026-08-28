# watch

Give Claude a video input. `/watch <url-or-path> [question]` downloads the video
with `yt-dlp`, extracts scene-aware frames with `ffmpeg`, pulls a timestamped
transcript (native captions first, Whisper API fallback), and hands both streams
to Claude so it can answer questions about what's in the video.

- Works on URLs (YouTube, Vimeo, X, TikTok, Twitch, most yt-dlp sites) and local files (`.mp4`, `.mov`, `.mkv`, `.webm`, ...).
- Detail dial: `transcript` (no frames), `efficient` (keyframes), `balanced` (scene-aware, default), `token-burner` (uncapped).
- `--start`/`--end` to focus on a section; `--timestamps` to force frames at moments the transcript flags.

## Setup

```bash
python scripts/setup.py            # installs ffmpeg/yt-dlp (brew on macOS; prints commands on Linux/Windows), scaffolds ~/.config/watch/.env
```

Add a Whisper key (Groq preferred, OpenAI fallback) to `~/.config/watch/.env` for videos without native captions. On Windows use `python`; on macOS/Linux use `python3`.

## Attribution

Vendored from the `claude-video` plugin by **bradautomates**
(https://github.com/bradautomates/claude-video), MIT licensed. See `LICENSE`.
Bundled scripts under `scripts/`: `watch.py` (entry), `download.py`, `frames.py`,
`transcribe.py`, `whisper.py`, `setup.py`, `config.py`.

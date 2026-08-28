---
name: st3gg
description: Steganography toolkit — encode text/files into images, decode hidden data, and analyze images for steganographic content using ST3GG CLI.
user_invocable: true
args: "<action> [options]"
---

# ST3GG — Steganography Skill

Run steganography operations using the ST3GG CLI installed at `~/Desktop/ST3GG`.

## Setup

All commands must run from the ST3GG directory with UTF-8 encoding:
```bash
cd ~/Desktop/ST3GG && PYTHONIOENCODING=utf-8 python cli.py <command> [options]
```

## Actions

Parse the user's `args` to determine the action. If no action is given, ask.

### 1. `encode` — Hide text or file in an image

**Required:** an input image path and text (or file path) to hide.

```bash
cd ~/Desktop/ST3GG && PYTHONIOENCODING=utf-8 python cli.py encode-cmd \
  -i "<input_image>" \
  -t "<text_to_hide>" \
  -o "<output_image>" \
  [options]
```

**Common options:**
- `-c <channels>` — Channel preset: R, G, B, A, RG, RGB (default), RGBA, etc.
- `-b <bits>` — Bits per channel 1-8 (default: 1)
- `-s <strategy>` — interleaved (default), sequential, spread, randomized
- `--seed <n>` — Seed for randomized strategy
- `-p <password>` — Encrypt with AES-256
- `--no-compress` — Disable zlib compression
- `-f <file>` — Encode a file instead of text (use instead of `-t`)

If user provides an image path (or you can see one in context), use it. If output path is not specified, auto-generate one with `_steg` suffix in the same directory.

### 2. `decode` — Extract hidden data from an image

```bash
cd ~/Desktop/ST3GG && PYTHONIOENCODING=utf-8 python cli.py decode-cmd \
  -i "<encoded_image>" \
  [options]
```

**Common options:**
- `-p <password>` — Decryption password
- `-o <output_file>` — Save extracted data to file
- `--no-auto` — Disable auto-detection (then specify -c, -b, -s manually)
- `--raw` — Output as hex dump

### 3. `analyze` — Check image for hidden content

```bash
cd ~/Desktop/ST3GG && PYTHONIOENCODING=utf-8 python cli.py analyze "<image_path>" --full
```

Returns channel analysis, LSB distribution, chi-square anomaly detection, and a verdict.

## Behavior

1. If the user provides an image file path, verify it exists before running.
2. If the user pastes or references an image in chat, save it to a temp location first if needed.
3. Always show the full CLI output to the user.
4. After encoding, show the output file path and capacity used.
5. After decoding, show the extracted text or confirm file extraction.
6. For the course context: explain what each technique does when relevant.

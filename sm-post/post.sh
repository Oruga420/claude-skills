#!/usr/bin/env bash
# post.sh — Publish a post via the Ayrshare API.
#
# Usage:
#   post.sh --text "Hello world"
#   post.sh --file ./draft.md [--platforms twitter,linkedin] [--media https://...,https://...]
#
# Requires env var: AYRSHARE_API_KEY

set -euo pipefail

API_URL="https://api.ayrshare.com/api/post"

TEXT=""
FILE=""
PLATFORMS=""
MEDIA=""

usage() {
  cat <<EOF
Usage: $0 [--text "content" | --file path] [--platforms a,b,c] [--media url1,url2]

  --text       Post body (inline string)
  --file       Read post body from a file
  --platforms  Comma-separated platform IDs: twitter,linkedin,facebook,instagram,
               tiktok,youtube,threads,bluesky,pinterest,reddit,telegram,gmb,snapchat
               (omit to post to all connected platforms)
  --media      Comma-separated media URLs (required for instagram/tiktok/youtube/pinterest)
  -h, --help   Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --text)      TEXT="$2"; shift 2 ;;
    --file)      FILE="$2"; shift 2 ;;
    --platforms) PLATFORMS="$2"; shift 2 ;;
    --media)     MEDIA="$2"; shift 2 ;;
    -h|--help)   usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ -z "${AYRSHARE_API_KEY:-}" ]]; then
  echo "ERROR: AYRSHARE_API_KEY is not set. Export it before running (e.g. 'set -a; source .env; set +a')." >&2
  exit 1
fi

if [[ -n "$FILE" ]]; then
  if [[ ! -r "$FILE" ]]; then
    echo "ERROR: cannot read file: $FILE" >&2
    exit 1
  fi
  TEXT="$(cat "$FILE")"
fi

if [[ -z "$TEXT" ]]; then
  echo "ERROR: no post content. Provide --text or --file." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required (sudo apt install jq)." >&2
  exit 1
fi

PAYLOAD="$(jq -n --arg post "$TEXT" '{post: $post}')"

if [[ -n "$PLATFORMS" ]]; then
  PAYLOAD="$(jq --arg p "$PLATFORMS" '. + {platforms: ($p | split(","))}' <<<"$PAYLOAD")"
fi

if [[ -n "$MEDIA" ]]; then
  PAYLOAD="$(jq --arg m "$MEDIA" '. + {mediaUrls: ($m | split(","))}' <<<"$PAYLOAD")"
fi

RESPONSE="$(curl -sS -X POST "$API_URL" \
  -H "Authorization: Bearer ${AYRSHARE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")"

echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

STATUS="$(echo "$RESPONSE" | jq -r '.status // empty' 2>/dev/null || true)"
if [[ "$STATUS" != "success" ]]; then
  exit 1
fi

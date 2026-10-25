#!/usr/bin/env bash
# Upload a local video to Video Piper, wait for it to process, and download the MP4.
# Usage: ./upload.sh path/to/video.mp4 [output.mp4]
# Needs: bash, curl, jq. Reads VIDEO_PIPER_API_KEY (and optionally VIDEO_PIPER_API_URL)
# from the environment or from a .env file next to this script.
set -euo pipefail

if [ -f "$(dirname "$0")/.env" ]; then
  set -a; . "$(dirname "$0")/.env"; set +a
fi

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 path/to/video.mp4 [output.mp4]" >&2
  exit 1
fi
if [ -z "${VIDEO_PIPER_API_KEY:-}" ]; then
  echo "VIDEO_PIPER_API_KEY is not set. Copy .env.example to .env and add your key." >&2
  exit 1
fi
command -v jq >/dev/null || { echo "jq is required: https://jqlang.github.io/jq/download/" >&2; exit 1; }

API="${VIDEO_PIPER_API_URL:-https://api.videopiper.dev/v1}"
API="${API%/}"
NAME="$(basename "$FILE")"
OUT="${2:-${NAME%.*}-processed.mp4}"
SIZE=$(wc -c < "$FILE" | tr -d ' ')

# api METHOD PATH [JSON_BODY] [Idempotency-Key]
# Prints the response body. Retries 429, 503 and network errors with exponential backoff.
# Exit code 1 = permanent error (message printed), 2 = still failing after the retries.
api() {
  local method=$1 path=$2 body=${3:-} key=${4:-} attempt response code
  local args=(-sS -X "$method" -H "Authorization: Bearer $VIDEO_PIPER_API_KEY" -H "Content-Type: application/json" -w $'\n%{http_code}')
  [ -n "$body" ] && args+=(-d "$body")
  [ -n "$key" ] && args+=(-H "Idempotency-Key: $key")
  for attempt in 1 2 3 4 5; do
    if response=$(curl "${args[@]}" "$API$path" 2>/dev/null); then
      code=${response##*$'\n'}
      response=${response%$'\n'*}
      case "$code" in
        2??) printf '%s' "$response"; return 0 ;;
        429|503) ;;  # try again below
        *)
          echo "API error $code: $(jq -r '"\(.error): \(.message) (request \(.requestId))"' <<<"$response" 2>/dev/null || echo "$response")" >&2
          [ "$code" = 401 ] && echo "Check VIDEO_PIPER_API_KEY." >&2
          return 1 ;;
      esac
    fi
    sleep $((2 ** attempt))
  done
  echo "The API is not answering after 5 attempts; try again in a minute." >&2
  return 2
}

# 1. Create the video. The idempotency key makes a retried request safe.
echo "Creating video ($SIZE bytes)..."
VIDEO=$(api POST /videos "$(jq -nc --arg n "$NAME" --argjson s "$SIZE" '{fileName:$n,sizeBytes:$s}')" "upload-$(date +%s)-$$")
VIDEO_ID=$(jq -r .videoId <<<"$VIDEO")
PART_SIZE=$(jq -r .partSize <<<"$VIDEO")
PART_COUNT=$(jq -r .partCount <<<"$VIDEO")
echo "Video $VIDEO_ID, $PART_COUNT part(s)."

# 2. Upload each part. Part n is the n-th PART_SIZE slice of the file. Part URLs last
#    15 minutes, so ask for each one right before using it.
CHUNK=$(mktemp)
trap 'rm -f "$CHUNK"' EXIT
for ((n = 1; n <= PART_COUNT; n++)); do
  URL=$(api POST "/videos/$VIDEO_ID/parts" "{\"partNumbers\":[$n]}" | jq -r '.parts[0].url')
  dd if="$FILE" of="$CHUNK" bs="$PART_SIZE" skip=$((n - 1)) count=1 2>/dev/null
  # No Authorization header on the storage URL.
  curl -sS --fail --retry 3 -T "$CHUNK" "$URL" >/dev/null
  echo "Uploaded part $n/$PART_COUNT"
done

# 3. Start processing.
api POST "/videos/$VIDEO_ID/complete" '{}' "complete-$VIDEO_ID" >/dev/null
echo "Processing..."

# 4. Poll until it is done. Keep waiting while it runs or the API hiccups.
while true; do
  rc=0
  STATUS_JSON=$(api GET "/videos/$VIDEO_ID") || rc=$?
  if [ "$rc" = 1 ]; then exit 1; fi
  STATUS=""
  [ "$rc" = 0 ] && STATUS=$(jq -r '.status // empty' <<<"$STATUS_JSON")
  case "$STATUS" in
    SUCCEEDED) break ;;
    SUBMITTED|RUNNING|PENDING_REDRIVE|"") sleep 10 ;;
    *) echo "Processing stopped with status $STATUS. Check that the file plays elsewhere, then upload again." >&2; exit 1 ;;
  esac
done

# 5. Download. The link is valid for 15 minutes; the status we just fetched is fresh.
DOWNLOAD_URL=$(jq -r '.downloadUrl // empty' <<<"$STATUS_JSON")
[ -n "$DOWNLOAD_URL" ] || { echo "The video succeeded but has no downloadUrl." >&2; exit 1; }
curl -sS --fail -o "$OUT" "$DOWNLOAD_URL"
echo "Saved $OUT"

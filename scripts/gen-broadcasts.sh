#!/usr/bin/env bash
# Extract demon-mode broadcast soundbites from their source YouTube videos at the
# marked timestamps → static mp3 clips in public/broadcasts/. Requires yt-dlp +
# ffmpeg. Re-run safe (overwrites). Keep the segment list in sync with
# DEMON_BROADCAST_MESSAGES in lib/quotes.ts (audioSrc = /broadcasts/<id>_<s>-<e>.mp3).
set -euo pipefail
OUT="public/broadcasts"
TMP="$(mktemp -d)"
mkdir -p "$OUT"
trap 'rm -rf "$TMP"' EXIT

dl() { # videoId -> full audio in $TMP/<id>.m4a
  local id="$1"
  [ -f "$TMP/$id.m4a" ] && return 0
  echo "↓ downloading $id"
  yt-dlp -q --no-warnings -x --audio-format m4a -o "$TMP/$id.%(ext)s" "https://www.youtube.com/watch?v=$id"
}

clip() { # videoId startSec endSec
  local id="$1" s="$2" e="$3" dur fadeout
  dur=$(awk "BEGIN{print $e-$s}")
  fadeout=$(awk "BEGIN{print $dur-0.08}")
  ffmpeg -y -loglevel error -ss "$s" -t "$dur" -i "$TMP/$id.m4a" \
    -af "afade=t=in:st=0:d=0.04,afade=t=out:st=${fadeout}:d=0.08" \
    -c:a libmp3lame -q:a 4 "$OUT/${id}_${s}-${e}.mp3"
  printf "  %-26s %s KB\n" "${id}_${s}-${e}.mp3" "$(( $(wc -c < "$OUT/${id}_${s}-${e}.mp3") / 1024 ))"
}

dl mGkrbzJZCoE
dl SWk_g7EWZjQ

clip mGkrbzJZCoE 0 16
clip mGkrbzJZCoE 40 65
clip SWk_g7EWZjQ 14 16
clip SWk_g7EWZjQ 36 50
clip SWk_g7EWZjQ 60 70
clip SWk_g7EWZjQ 91 100
clip SWk_g7EWZjQ 102 120

echo "✓ broadcasts → $OUT"

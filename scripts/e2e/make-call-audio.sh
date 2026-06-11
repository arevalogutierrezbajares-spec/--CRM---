#!/usr/bin/env bash
# Synthesizes a bilingual dual-channel test call for the capture E2E:
#   channel 0 (L) = founder (English, voice Samantha)
#   channel 1 (R) = participant (Spanish, voice Eddy es_MX)
# Output: $1 (default /tmp/agb-e2e-audio/call-stereo.wav), PCM16 16 kHz stereo.
# Mirrors a real captured call: alternating turns, explicit two-way
# commitments with dates (action-item fodder), ES/EN code-switching.
set -euo pipefail

OUT="${1:-/tmp/agb-e2e-audio/call-stereo.wav}"
DIR="$(mktemp -d /tmp/agb-call-gen.XXXXXX)"
trap 'rm -rf "$DIR"' EXIT

F_VOICE="Samantha"
P_VOICE="Eddy (Spanish (Mexico))"

# turn|channel|text  (turns are strictly alternating; offsets computed below)
TURNS=(
  "F|Hola Carlos, thanks for taking the call. I wanted to close two things today: the hotel contract and the payment schedule."
  "P|Perfecto Tomás. Sobre el contrato, ya lo revisó el abogado. Te mando la versión firmada el viernes sin falta."
  "F|Great. Then I will send you the payment schedule by Wednesday June seventeenth, with the fifty percent deposit terms."
  "P|De acuerdo. También necesito que me envíes las fotos de las habitaciones para el catálogo."
  "F|Sure, I will send the room photos tomorrow. One more thing — can you confirm the airport pickup rate for groups?"
  "P|Sí, la tarifa del traslado es ochenta dólares por grupo. Te la confirmo por escrito el lunes."
  "F|Perfect. So you send the signed contract Friday and the pickup rate Monday. I send the payment schedule Wednesday and the photos tomorrow. Hasta luego Carlos."
  "P|Listo, gracias Tomás. Hablamos pronto."
)

mkdir -p "$(dirname "$OUT")"

i=0
F_INPUTS=()
P_INPUTS=()
F_DELAYS=()
P_DELAYS=()
offset_ms=0
GAP_MS=700

for turn in "${TURNS[@]}"; do
  who="${turn%%|*}"
  text="${turn#*|}"
  seg="$DIR/seg-$i.wav"
  if [ "$who" = "F" ]; then
    say -v "$F_VOICE" --data-format=LEI16@16000 -o "$seg" "$text"
  else
    say -v "$P_VOICE" --data-format=LEI16@16000 -o "$seg" "$text"
  fi
  dur_ms=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$seg" \
    | awk '{printf "%d", $1 * 1000}')
  if [ "$who" = "F" ]; then
    F_INPUTS+=("$seg"); F_DELAYS+=("$offset_ms")
  else
    P_INPUTS+=("$seg"); P_DELAYS+=("$offset_ms")
  fi
  offset_ms=$((offset_ms + dur_ms + GAP_MS))
  i=$((i + 1))
done
total_ms=$offset_ms

build_track() { # $1=outfile, name refs F_/P_ arrays via $2 prefix
  local out="$1" prefix="$2"
  local -a inputs delays
  if [ "$prefix" = "F" ]; then inputs=("${F_INPUTS[@]}"); delays=("${F_DELAYS[@]}");
  else inputs=("${P_INPUTS[@]}"); delays=("${P_DELAYS[@]}"); fi
  local args=() filter="" n=${#inputs[@]}
  for idx in $(seq 0 $((n - 1))); do
    args+=(-i "${inputs[$idx]}")
    filter+="[$idx:a]adelay=${delays[$idx]}:all=1[d$idx];"
  done
  for idx in $(seq 0 $((n - 1))); do filter+="[d$idx]"; done
  filter+="amix=inputs=$n:normalize=0,apad=whole_dur=${total_ms}ms[a]"
  ffmpeg -y -v error "${args[@]}" -filter_complex "$filter" -map "[a]" \
    -ar 16000 -ac 1 -c:a pcm_s16le "$out"
}

build_track "$DIR/founder.wav" F
build_track "$DIR/participant.wav" P

# amerge: input 0 → left (ch0 = founder), input 1 → right (ch1 = participant)
ffmpeg -y -v error -i "$DIR/founder.wav" -i "$DIR/participant.wav" \
  -filter_complex "[0:a][1:a]amerge=inputs=2[a]" -map "[a]" \
  -ar 16000 -c:a pcm_s16le "$OUT"

echo "Wrote $OUT ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")s stereo 16k)"

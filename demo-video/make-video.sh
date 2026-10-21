#!/usr/bin/env bash
# Makes the StaleMate tour video in out/stalemate-tour.mp4. Run ./setup.sh once first.
# Pass --draft for a quick run with Kokoro's voice instead of Qwen's, written to out/draft-tour.mp4.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out

engine=qwen
audio=out/audio
video=out/stalemate-tour.mp4
if [[ "${1:-}" == "--draft" ]]; then
  engine=kokoro
  audio=out/draft-audio
  video=out/draft-tour.mp4
fi

echo "==> Narration ($engine)"
.venv/bin/python tts.py scenes.json --engine "$engine" --out "$audio" 2>/dev/null >/dev/null

echo "==> Building the API"
pnpm --dir .. --filter stalemate-api build >out/api-build.log 2>&1 || { cat out/api-build.log; exit 1; }

echo "==> Recording the screen"
node src/record.mjs "$audio" out/recording

echo "==> Title cards"
node src/cards.mjs out/cards

echo "==> Putting it together"
.venv/bin/python compose.py "$audio" out/recording out/cards "$video"

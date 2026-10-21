#!/usr/bin/env bash
# Installs what the demo video needs, inside this folder only: Playwright with its Chromium, and a Python env with
# Kokoro and Qwen3-TTS. The models take about 5 GB in ~/.cache/huggingface.
set -euo pipefail
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null || { echo "Missing $1. $2" >&2; exit 1; }; }
need pnpm "Install it with corepack: corepack enable"
need python3 "Install Python 3."
need ffmpeg "Install it: sudo apt install ffmpeg"

echo "==> Node packages"
pnpm install --ignore-workspace --frozen-lockfile
pnpm exec playwright install chromium

echo "==> Python env with Kokoro and Qwen3-TTS"
if ! command -v uv >/dev/null; then
  python3 -m pip install --user --quiet uv
  export PATH="$HOME/.local/bin:$PATH"
fi
uv venv --quiet --allow-existing --python 3.12 .venv
uv pip install --quiet --python .venv/bin/python -r requirements.txt

echo "==> Downloading the models"
.venv/bin/python -c "from huggingface_hub import snapshot_download as get; get('hexgrad/Kokoro-82M'); get('Qwen/Qwen3-TTS-12Hz-1.7B-Base')" >/dev/null

echo "Done."

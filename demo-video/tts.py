"""Speaks each scene of a JSON list [{"id": ..., "text": ..., "say"?: ...}] and writes <out>/<id>.wav.

"say", when given, is how the voice should read "text", e.g. "dot" for the dots in a URL.

Two engines share one voice:
- kokoro: Kokoro's af_heart. Small and fast, for test runs.
- qwen: Qwen3-TTS cloning af_heart from a reference clip Kokoro speaks. Sounds far more natural, for the final cut.

Writes the length of every clip in seconds to <out>/lengths.json, so the recording can hold each scene for as long as its narration.
A scene keeps its clip while its words and engine stay the same, as every take sounds a little different: pass --again
to speak them all anew.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline

KOKORO_VOICE = "af_heart"
KOKORO_RATE = 24_000
REFERENCE_TEXT = (
    "Thanks for joining me. Today I want to show you something small that makes our work a little easier. "
    "It only takes a minute, so let's start."
)

parser = argparse.ArgumentParser()
parser.add_argument("lines", type=Path)
parser.add_argument("--engine", choices=["qwen", "kokoro"], default="qwen")
parser.add_argument("--speed", type=float, default=1.0, help="Kokoro's speed; for qwen, the speed of the reference clip")
parser.add_argument("--out", type=Path, required=True)
parser.add_argument("--again", action="store_true", help="speak every scene anew, even those whose clip is current")
args = parser.parse_args()

scenes = json.loads(args.lines.read_text())
args.out.mkdir(parents=True, exist_ok=True)


def take_of(scene) -> dict:
    """What a scene's clip was spoken from, kept beside it to tell when the clip is stale."""
    return {"engine": args.engine, "speed": args.speed, "words": scene.get("say", scene["text"])}


def is_current(scene) -> bool:
    take = args.out / f"{scene['id']}.take.json"
    return not args.again and take.exists() and json.loads(take.read_text()) == take_of(scene)


stale = [scene for scene in scenes if not is_current(scene)]
kokoro = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M") if stale else None


def speak_kokoro(text: str) -> tuple[np.ndarray, int]:
    return np.concatenate([chunk for _, _, chunk in kokoro(text, voice=KOKORO_VOICE, speed=args.speed)]), KOKORO_RATE


def qwen_speaker():
    from qwen_tts import Qwen3TTSModel

    # Without an NVIDIA GPU it runs on the CPU, many times slower, in float32 (about 7 GB of RAM): most CPUs only
    # emulate bfloat16, which is slower still.
    gpu = torch.cuda.is_available()
    model = Qwen3TTSModel.from_pretrained(
        "Qwen/Qwen3-TTS-12Hz-1.7B-Base", device_map="cuda:0" if gpu else "cpu", dtype=torch.bfloat16 if gpu else torch.float32
    )
    reference, rate = speak_kokoro(REFERENCE_TEXT)
    prompt = model.create_voice_clone_prompt(ref_audio=(reference, rate), ref_text=REFERENCE_TEXT)

    def speak(text: str) -> tuple[np.ndarray, int]:
        torch.manual_seed(0)
        wavs, rate = model.generate_voice_clone(text=text, language="English", voice_clone_prompt=prompt)
        return wavs[0], rate

    return speak


speak = (qwen_speaker() if args.engine == "qwen" else speak_kokoro) if stale else None
for scene in stale:
    audio, rate = speak(take_of(scene)["words"])
    sf.write(args.out / f"{scene['id']}.wav", audio, rate)
    (args.out / f"{scene['id']}.take.json").write_text(json.dumps(take_of(scene)))
lengths = {scene["id"]: round(sf.info(args.out / f"{scene['id']}.wav").duration, 2) for scene in scenes}
(args.out / "lengths.json").write_text(json.dumps(lengths, indent=2))
print(json.dumps(lengths, indent=2))

"""Puts the video together: title card, the screen recording with each scene's narration where the scene starts, the
closing card with the outro, and subtitles burned in.

Usage: compose.py <audio dir> <recording dir> <cards dir> <out file>
"""

import argparse
import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

TITLE_S = 3.0
FADE_S = 0.6
# The outro starts this long after the closing card has faded in, and the card stays this long after it ends.
OUTRO_LEAD_S = 0.3
OUTRO_TAIL_S = 1.5
# A subtitle is one line of at most this many characters: libass boxes each line on its own, and two translucent boxes
# darken where they overlap.
SUBTITLE_CHARS = 60

parser = argparse.ArgumentParser()
parser.add_argument("audio", type=Path)
parser.add_argument("recording", type=Path)
parser.add_argument("cards", type=Path)
parser.add_argument("out", type=Path)
args = parser.parse_args()

scenes = json.loads((Path(__file__).parent / "scenes.json").read_text())
timeline = json.loads((args.recording / "timeline.json").read_text())
clips = {scene["id"]: sf.read(args.audio / f"{scene['id']}.wav") for scene in scenes}

# Where everything sits in the finished video, in seconds.
recorded_from = timeline["scenes"][0]["start"]
screen_s = timeline["end"] - recorded_from
screen_at = TITLE_S - FADE_S
closing_at = screen_at + screen_s - FADE_S
starts = {scene["id"]: screen_at + scene["start"] - recorded_from for scene in timeline["scenes"]}
starts["outro"] = closing_at + FADE_S + OUTRO_LEAD_S
outro_s = len(clips["outro"][0]) / clips["outro"][1]
closing_s = FADE_S + OUTRO_LEAD_S + outro_s + OUTRO_TAIL_S
total_s = closing_at + closing_s


def narration(path: Path) -> None:
    rate = clips["intro"][1]
    track = np.zeros(int(total_s * rate) + 1, dtype=np.float32)
    for scene_id, (audio, clip_rate) in clips.items():
        assert clip_rate == rate, "every clip comes from the same engine"
        at = int(starts[scene_id] * rate)
        track[at : at + len(audio)] += audio[: len(track) - at]
    sf.write(path, track, rate)


def chunks(text: str) -> list[str]:
    """Sentences, with long ones split at a comma or colon, else between words near the middle, to fit one line."""
    pieces = []
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        while len(sentence) > SUBTITLE_CHARS:
            breaks = [match.end() for match in re.finditer(r"[,:]\s", sentence) if match.end() <= SUBTITLE_CHARS]
            if breaks:
                cut = breaks[-1]
            else:
                spaces = [index for index, char in enumerate(sentence) if char == " " and index <= SUBTITLE_CHARS]
                cut = min(spaces, key=lambda index: abs(index - len(sentence) / 2)) + 1
            pieces.append(sentence[:cut].strip())
            sentence = sentence[cut:]
        pieces.append(sentence.strip())
    return pieces


def timestamp(seconds: float) -> str:
    centiseconds = round(seconds * 100)
    return f"{centiseconds // 360000}:{centiseconds // 6000 % 60:02}:{centiseconds // 100 % 60:02}.{centiseconds % 100:02}"


def subtitles(path: Path) -> None:
    """Each scene's text, piece by piece, each piece on screen for its share of the clip by length."""
    events = []
    for scene in scenes:
        audio, rate = clips[scene["id"]]
        length = len(audio) / rate
        pieces = chunks(scene["text"])
        at = starts[scene["id"]]
        for piece in pieces:
            shown = length * len(piece) / sum(map(len, pieces))
            events.append(f"Dialogue: 0,{timestamp(at)},{timestamp(at + shown - 0.05)},Caption,,0,0,0,,{piece}")
            at += shown
    path.write_text(
        "\n".join(
            [
                "[Script Info]",
                "ScriptType: v4.00+",
                "PlayResX: 1920",
                "PlayResY: 1080",
                "WrapStyle: 2",
                "",
                "[V4+ Styles]",
                "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
                "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
                "MarginR, MarginV, Encoding",
                # A white caption on a translucent dark box, readable over both themes.
                "Style: Caption,Ubuntu,46,&H00FFFFFF,&H00FFFFFF,&H5A101010,&H00000000,0,0,0,0,100,100,0,0,3,14,0,2,80,80,64,1",
                "",
                "[Events]",
                "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
                *events,
                "",
            ]
        )
    )


work = args.out.parent
narration(work / "narration.wav")
subtitles(work / "subtitles.ass")
video = (
    f"[0:v]fps=30,format=yuv420p,settb=AVTB[title];"
    f"[1:v]trim=start={recorded_from:.3f}:end={timeline['end']:.3f},setpts=PTS-STARTPTS,fps=30,format=yuv420p,settb=AVTB[screen];"
    f"[2:v]fps=30,format=yuv420p,settb=AVTB[closing];"
    f"[title][screen]xfade=transition=fade:duration={FADE_S}:offset={screen_at:.3f}[opening];"
    f"[opening][closing]xfade=transition=fade:duration={FADE_S}:offset={closing_at:.3f},subtitles={work / 'subtitles.ass'}[video];"
    # Even loudness, at the level of most online video.
    f"[3:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[audio]"
)
subprocess.run(
    [
        "ffmpeg", "-loglevel", "error", "-y",
        "-loop", "1", "-framerate", "30", "-t", str(TITLE_S), "-i", str(args.cards / "title.png"),
        "-i", str(args.recording / "screen.mp4"),
        "-loop", "1", "-framerate", "30", "-t", f"{closing_s:.3f}", "-i", str(args.cards / "closing.png"),
        "-i", str(work / "narration.wav"),
        "-filter_complex", video,
        "-map", "[video]", "-map", "[audio]",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", "-t", f"{total_s:.3f}",
        str(args.out),
    ],
    check=True,
)
print(f"{args.out}: {total_s:.1f} s")

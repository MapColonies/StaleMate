# StaleMate tour video

Makes a 1½-minute narrated tour of the dashboard: a scripted browser session over the API's fixture data, a cloned
af_heart voice, burned-in subtitles and title cards.

```sh
./setup.sh          # once: Playwright's Chromium, a Python env with Kokoro and Qwen3-TTS, and their models (~5 GB)
./make-video.sh     # out/stalemate-tour.mp4
./make-video.sh --draft   # quicker, with Kokoro's voice: out/draft-tour.mp4
```

It needs ffmpeg, and an NVIDIA GPU for Qwen3-TTS; the draft voice runs on a CPU.

- `scenes.json` holds the narration. `say`, when given, is how the voice should read `text`, which the subtitles show.
  `pause` is the silence after a scene, 0.7 s unless set. A scene keeps its voice clip until its words change;
  `tts.py --again` speaks them all anew.
- `src/record.mjs` drives the app through the scenes, holding each for as long as its clip, and moves the cursor when
  the narration reaches the words it points at.
- `src/screencast.mjs` captures what Chromium paints as high-quality frames: Playwright's own video is too lossy.
- `src/fake-data.mjs` swaps the fixture's real logins for invented ones, in the Snapshot and the Teams, and stages the
  Notifications that arrive on camera.
- The recording starts as a first visit, with nothing in localStorage, so it opens on the modal that asks for a Team.

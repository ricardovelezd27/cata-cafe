# Movimiento Sensorial: the guide voice

The guide voice of the warm-up player is rendered ahead of time to audio
files, on the developer's machine, and played by the app through its own
audio mixer. The phone's built-in text-to-speech is only the fallback.

## Why pre-rendered

- **It sounds natural and the same on every phone.** The built-in voice
  depends on what each phone has installed, and some have no Spanish voice.
- **The app can mix it.** A voice inside the app's audio graph can have the
  background lowered under it. The built-in voice plays outside that graph.
- **The voice is the clock.** Each line's real length is measured after
  rendering, and the pause before a movement is sized from it.

## Engine

Kokoro-82M (model: Apache 2.0) through `kokoro-onnx` (MIT), run locally.
**No text leaves the machine.** The only network use is the one-time download
of the two model files (about 340 MB) from the kokoro-onnx GitHub release into
`scripts/warmup-voice/.models/` (git-ignored).

The script is engine-neutral at its edges: it reads a job file and writes MP3
files plus `result.json`. Another engine can replace `render.py` without
touching the player.

## Requirements (Windows, macOS, Linux)

- `uv` (https://docs.astral.sh/uv/). It creates an isolated environment with
  Python 3.11 and the packages listed at the top of `render.py`. Nothing is
  installed globally.
- Nothing else. `espeak-ng` comes bundled with `espeakng-loader`, and MP3 is
  written by `soundfile` (libsndfile), so `ffmpeg` is not needed.

`kokoro-onnx` needs Python 3.10 to 3.13, hence `--python 3.11`.

## Run

```bash
uv run --python 3.11 scripts/warmup-voice/render.py scripts/warmup-voice/audition.json
```

Output goes to `scripts/warmup-voice/.out/<job file name>/` (git-ignored):
one MP3 per line and `result.json` with each file's measured length, size and
bitrate, and the loudness of each voice.

List the voices in the model file:

```bash
uv run --python 3.11 scripts/warmup-voice/render.py scripts/warmup-voice/audition.json --list-voices
```

## Job file

Either a flat list of jobs or a matrix (every line of a locale with every
variant of that locale). See `audition.json` and the docstring of `render.py`.

- `voice`: a Kokoro voice id. Spanish voices start with `e` (`ef_dora`,
  `em_alex`, `em_santa`); English with `a` (US) or `b` (British).
- `lang`: the espeak-ng language used to turn text into sounds. `es-419` is
  Latin American Spanish (no "th" sound for c and z), `es` is Spain.
- `speed`: 1.0 is the engine's natural pace; the guide uses a slower one.

## Loudness

Loudness is set once per voice (voice + lang + speed), never per line: one
gain from the loudness of all that voice's lines together, to -18 LUFS, with a
-1.5 dB peak ceiling. Normalising line by line would turn a one-word "Para."
up until it shouts.

## Format

MP3, mono, 24 kHz (Kokoro's native rate). MP3 is the one format both iPhone
Safari and Android Chrome decode reliably with `decodeAudioData`.

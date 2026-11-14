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
gain from the loudness of all that voice's lines together, to -19 LUFS, with a
-1.5 dB peak ceiling. Normalising line by line would turn a one-word "Para."
up until it shouts.

## Format

MP3, mono, 24 kHz (Kokoro's native rate). MP3 is the one format both iPhone
Safari and Android Chrome decode reliably with `decodeAudioData`.

## The real set (what the app plays)

The owner picked the voices by ear on 2026-11-14: Dora with the Latin American
pronunciation for Spanish (`ef_dora`, `es-419`) and Heart for English
(`af_heart`, `en-us`), both at speed 0.9. They are declared in
`lib/warmup/voice.ts` (`VOICE_SETS`).

**Changing a voice needs a new set `id`** (the folder under
`public/warmup/voice/`). The files are named after their text, so a line keeps
its file name under any voice, and phones keep the files for good: under the
old folder name they would go on playing the old voice. After changing the
id, delete the old folder.

Three commands, in this order, every time a spoken line changes:

```bash
npx tsx scripts/warmup-voice/lines.ts export --all
```

```bash
uv run --python 3.11 scripts/warmup-voice/render.py scripts/warmup-voice/.out/voice-job.json --mp3-level 0.8
```

```bash
npx tsx scripts/warmup-voice/lines.ts manifest
```

- `export` lists every line the voice can say (every exercise, both modes,
  both lengths, the seated variant) from `lib/warmup/exercises.ts`,
  `messages/*.json` (`warmup.*`) and `lib/warmup/script.ts`. Without `--all`
  it lists only the lines that have no file yet; use `--all` before shipping,
  because the loudness of a voice is set from all its lines together.
- `render.py` takes about 4 minutes for the 140 lines on a laptop.
- `manifest` copies the files to `public/warmup/voice/<set>/<key>.mp3` (the
  key is a hash of the line's text), deletes the files no line uses any more,
  and rewrites `lib/warmup/voiceManifest.ts` with each line's measured length.

Then run `npm test`. `tests/warmup-voice.test.ts` fails when a line has no
file, when a file is left over, when two lines overlap, when a line sits over
a bell or when one runs past the end of a run. If it fails on a fit, shorten
the line (never the pause constants) and run the three commands again.

To see what a change did to the timing:

```bash
npx tsx scripts/warmup-voice/report.ts arm-raise
```

It prints each run's length, the pause before each step and, for the named
exercise, every spoken line with the quiet left after it.

`--mp3-level 0.8` gives about 40 kbps mono: the whole set is about 3 MB.

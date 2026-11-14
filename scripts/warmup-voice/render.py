# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = [
#   "kokoro-onnx==0.6.1",
#   "soundfile>=0.13",
#   "pyloudnorm>=0.1.1",
#   "numpy>=2.0.2",
# ]
# ///
"""Render the Movimiento Sensorial guide voice with Kokoro, on this machine.

Nothing is sent anywhere: the model runs locally (Kokoro-82M, Apache 2.0,
through kokoro-onnx, MIT). The only network use is the one-time download of
the two model files from the kokoro-onnx GitHub release into `.models/`
(git-ignored, about 340 MB).

Run it with uv, so nothing is installed globally (see README.md here):

    uv run --python 3.11 scripts/warmup-voice/render.py scripts/warmup-voice/audition.json

The job file is JSON, either a flat list

    { "jobs": [ { "id", "text", "voice", "lang", "speed", "out" } ] }

or a matrix that the script expands (every line of a locale x every variant
of that locale):

    { "lines":    { "es": [ { "id", "text" } ] },
      "variants": [ { "id", "locale", "voice", "lang", "speed", "label" } ] }

Output: one MP3 per job under `--out` and a `result.json` next to them with
the measured length of every file (the timeline is built from those lengths:
"the voice is the clock").

Loudness is set ONCE PER VOICE (a group = voice + lang + speed), never per
line: one static gain from the integrated loudness of all the group's lines
together. Normalising line by line would turn a one-word "Para." up until it
shouts. Speech has a few peaks far above its average, so reaching the target
would clip them: a look-ahead limiter turns down only those instants (how
much, and how often, is reported per voice in `result.json`).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
MODELS_DIR = HERE / ".models"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1"
MODEL_FILES = {
    "kokoro-v1.0.onnx": 300_000_000,  # minimum plausible size, bytes
    "voices-v1.0.bin": 20_000_000,
}

# Speech sits around -19 LUFS so the app's mixer has headroom for the bells
# on top; the ceiling keeps MP3 overshoot away from 0 dBFS.
DEFAULT_TARGET_LUFS = -19.0
DEFAULT_PEAK_DB = -1.5
# Look-ahead of the peak limiter: the gain starts coming down this long
# before a peak, so the turn-down is a short dip, never a click.
LIMIT_LOOKAHEAD_MS = 5
# Short fades so a file never starts or ends on a click.
FADE_MS = 12
# Silence kept after the last word (the MP3 frame padding eats a little).
TAIL_MS = 60


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def ensure_models() -> tuple[Path, Path]:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for name, min_bytes in MODEL_FILES.items():
        dest = MODELS_DIR / name
        if dest.exists() and dest.stat().st_size >= min_bytes:
            continue
        url = f"{RELEASE}/{name}"
        log(f"downloading {name} from {url}")
        tmp = dest.with_suffix(dest.suffix + ".part")
        with urllib.request.urlopen(url) as res, open(tmp, "wb") as fh:  # noqa: S310 (fixed https URL)
            total = int(res.headers.get("Content-Length") or 0)
            done = 0
            last = time.monotonic()
            while True:
                chunk = res.read(1 << 20)
                if not chunk:
                    break
                fh.write(chunk)
                done += len(chunk)
                if time.monotonic() - last > 5:
                    last = time.monotonic()
                    pct = f"{100 * done / total:.0f}%" if total else f"{done >> 20} MB"
                    log(f"  {name}: {pct}")
        if tmp.stat().st_size < min_bytes:
            tmp.unlink(missing_ok=True)
            raise SystemExit(f"{name}: download too small, giving up")
        tmp.replace(dest)
    return MODELS_DIR / "kokoro-v1.0.onnx", MODELS_DIR / "voices-v1.0.bin"


def expand_jobs(spec: dict) -> list[dict]:
    if "jobs" in spec:
        return list(spec["jobs"])
    jobs: list[dict] = []
    for variant in spec["variants"]:
        for line in spec["lines"][variant["locale"]]:
            jobs.append(
                {
                    "id": f"{variant['id']}/{line['id']}",
                    "text": line["text"],
                    "voice": variant["voice"],
                    "lang": variant["lang"],
                    "speed": variant.get("speed", 1.0),
                    "out": f"{variant['id']}/{line['id']}.mp3",
                }
            )
    return jobs


def group_key(job: dict) -> str:
    return f"{job['voice']}|{job['lang']}|{job.get('speed', 1.0)}"


def fade(samples: np.ndarray, rate: int) -> np.ndarray:
    n = min(len(samples) // 2, int(rate * FADE_MS / 1000))
    if n <= 0:
        return samples
    out = samples.copy()
    ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)
    out[:n] *= ramp
    out[-n:] *= ramp[::-1]
    return out


def db(x: float) -> float:
    return 20.0 * float(np.log10(max(x, 1e-9)))


def limit(samples: np.ndarray, rate: int, ceiling: float) -> tuple[np.ndarray, float, float]:
    """Look-ahead peak limiter. Returns (audio, deepest cut in dB, share of
    samples that were turned down). No sample of the result exceeds `ceiling`.

    The wanted gain per sample is min(1, ceiling / |x|). Taking its minimum
    over a window centred on each sample makes the cut start before the peak;
    averaging that over a window of the same width smooths the edges. Every
    value in the average is at most the wanted gain of the sample itself, so
    the ceiling still holds.
    """
    mag = np.abs(samples)
    if not len(samples) or float(mag.max()) <= ceiling:
        return samples, 0.0, 0.0
    want = np.minimum(1.0, ceiling / np.maximum(mag, 1e-9)).astype(np.float32)
    half = max(1, int(rate * LIMIT_LOOKAHEAD_MS / 1000))
    win = 2 * half + 1
    padded = np.pad(want, half, mode="edge")
    low = np.lib.stride_tricks.sliding_window_view(padded, win).min(axis=1)
    smooth = np.convolve(np.pad(low, half, mode="edge"), np.full(win, 1.0 / win, dtype=np.float32), mode="valid")
    gain = np.minimum(smooth, want).astype(np.float32)
    return samples * gain, db(float(gain.min())), float(np.mean(gain < 0.999))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("jobfile", type=Path)
    ap.add_argument("--out", type=Path, default=None, help="output folder (default: .out/<jobfile name>)")
    ap.add_argument("--target-lufs", type=float, default=DEFAULT_TARGET_LUFS)
    ap.add_argument("--peak-db", type=float, default=DEFAULT_PEAK_DB)
    ap.add_argument(
        "--mp3-level",
        type=float,
        default=0.55,
        help="libsndfile MP3 compression level, 0 (largest) to 1 (smallest); the result prints the real bitrate",
    )
    ap.add_argument("--list-voices", action="store_true", help="print the voices in the model file and exit")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252
        except Exception:  # noqa: BLE001
            pass

    import pyloudnorm as pyln
    import soundfile as sf
    from kokoro_onnx import Kokoro

    model, voices = ensure_models()
    kokoro = Kokoro(str(model), str(voices))
    if args.list_voices:
        print(json.dumps(sorted(kokoro.get_voices())))
        return

    spec = json.loads(args.jobfile.read_text(encoding="utf-8"))
    jobs = expand_jobs(spec)
    out_dir = args.out or (HERE / ".out" / args.jobfile.stem)
    out_dir.mkdir(parents=True, exist_ok=True)

    known = set(kokoro.get_voices())
    missing = sorted({j["voice"] for j in jobs} - known)
    if missing:
        raise SystemExit(f"voices not in the model file: {missing}")

    # 1. Synthesize everything (raw, 24 kHz mono float32).
    rendered: list[tuple[dict, np.ndarray, int]] = []
    t0 = time.monotonic()
    for i, job in enumerate(jobs, 1):
        samples, rate = kokoro.create(job["text"], voice=job["voice"], speed=float(job.get("speed", 1.0)), lang=job["lang"])
        samples = np.asarray(samples, dtype=np.float32).reshape(-1)
        rendered.append((job, samples, int(rate)))
        log(f"[{i}/{len(jobs)}] {job['id']}  {len(samples) / rate:.2f}s")
    log(f"synthesis: {time.monotonic() - t0:.1f}s")

    # 2. One static gain per voice group.
    groups: dict[str, list[int]] = {}
    for idx, (job, _, _) in enumerate(rendered):
        groups.setdefault(group_key(job), []).append(idx)
    gains: dict[str, float] = {}
    group_info: dict[str, dict] = {}
    for key, idxs in groups.items():
        rate = rendered[idxs[0]][2]
        joined = np.concatenate([rendered[i][1] for i in idxs])
        meter = pyln.Meter(rate)
        # The meter needs at least 400 ms; pad a very short group with itself.
        probe = joined if len(joined) >= rate else np.tile(joined, int(np.ceil(rate / max(1, len(joined)))))
        lufs = float(meter.integrated_loudness(probe.astype(np.float64)))
        gain = 10 ** ((args.target_lufs - lufs) / 20.0) if np.isfinite(lufs) else 1.0
        gains[key] = gain
        group_info[key] = {"sourceLufs": round(lufs, 2), "gainDb": round(db(gain), 2), "meter": meter}

    # 3. Limit the peaks, write the files and measure them.
    ceiling = 10 ** (args.peak_db / 20.0)
    limited: dict[str, list[np.ndarray]] = {}
    deepest: dict[str, float] = {}
    touched: dict[str, list[float]] = {}
    results = []
    for job, samples, rate in rendered:
        key = group_key(job)
        audio, cut_db, share = limit(samples * gains[key], rate, ceiling)
        limited.setdefault(key, []).append(audio)
        deepest[key] = min(deepest.get(key, 0.0), cut_db)
        touched.setdefault(key, []).append(share * len(audio))
        audio = fade(audio, rate)
        audio = np.concatenate([audio, np.zeros(int(rate * TAIL_MS / 1000), dtype=np.float32)])
        dest = out_dir / job["out"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        sf.write(
            str(dest),
            audio,
            rate,
            format="MP3",
            subtype="MPEG_LAYER_III",
            compression_level=args.mp3_level,
            bitrate_mode="CONSTANT",
        )
        dur_ms = round(1000 * len(audio) / rate)
        size = dest.stat().st_size
        results.append(
            {
                "id": job["id"],
                "out": job["out"],
                "voice": job["voice"],
                "lang": job["lang"],
                "speed": float(job.get("speed", 1.0)),
                "text": job["text"],
                "durMs": dur_ms,
                "bytes": size,
                "kbps": round(size * 8 / max(1, dur_ms), 1),
            }
        )

    # What each voice measures AFTER the gain and the limiter.
    for key, parts in limited.items():
        joined = np.concatenate(parts)
        info = group_info[key]
        meter = info.pop("meter")
        rate = rendered[groups[key][0]][2]
        probe = joined if len(joined) >= rate else np.tile(joined, int(np.ceil(rate / max(1, len(joined)))))
        info["lufs"] = round(float(meter.integrated_loudness(probe.astype(np.float64))), 2)
        info["peakDb"] = round(db(float(np.max(np.abs(joined)))), 2)
        info["limiterDeepestCutDb"] = round(deepest[key], 2)
        info["limiterShareOfSamples"] = round(sum(touched[key]) / max(1, len(joined)), 4)

    summary = {
        "sampleRate": rendered[0][2] if rendered else None,
        "targetLufs": args.target_lufs,
        "peakDb": args.peak_db,
        "groups": group_info,
        "files": results,
    }
    (out_dir / "result.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(r["bytes"] for r in results)
    log(f"wrote {len(results)} files, {total / 1024:.0f} kB, to {out_dir}")
    print(json.dumps({"out": str(out_dir), "files": len(results), "bytes": total}))


if __name__ == "__main__":
    main()

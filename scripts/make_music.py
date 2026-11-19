#!/usr/bin/env python3
"""Synthesise the music beds from scratch.

No samples, no downloads, no licence to track: a bed is a chord progression of
detuned sine partials with a slow swell, a little stereo width and a cheap
feedback delay. The output is deliberately sparse and low-passed so it can sit
under a spoken voice for 40 seconds without fighting it.

    python3 scripts/make_music.py

Writes public/music/bed-warm.mp3 and public/music/bed-neon.mp3.
"""
import math
import random
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

RATE = 44100
ROOT = Path(__file__).resolve().parent.parent
MUSIC_DIR = ROOT / "public" / "music"

CHORD_S = 8.0  # one chord per 8s; four chords -> a 32s loop


def freq(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def midi(name: str) -> float:
    """'A2', 'C#3', 'Eb4' -> MIDI note number."""
    names = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    letter, rest = name[0].upper(), name[1:]
    semis = names[letter]
    while rest and rest[0] in "#b":
        semis += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    octave = int(rest)
    return 12 * (octave + 1) + semis


def smoothstep(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def pad_chord(notes, length_s: float, brightness: float) -> list:
    """One chord: detuned partials per note, slow swell, stereo spread."""
    n = int(length_s * RATE)
    left = [0.0] * n
    right = [0.0] * n
    attack, release = 1.6, 2.2
    for j, note in enumerate(notes):
        f = freq(midi(note))
        # Root notes get more weight so the progression still reads as bass.
        weight = 0.9 if j == 0 else 0.55
        voices = [
            (f, weight, 0.0),
            (f * 2, weight * brightness, 0.3),   # octave adds definition
            (f * 3, weight * brightness * 0.35, 0.7),
            (f / 2, weight * 0.45, 1.1),        # sub
        ]
        for vf, amp, phase in voices:
            for side, detune in ((-1, 0.11), (1, -0.11)):
                buf = left if side < 0 else right
                w = 2 * math.pi * (vf + detune)
                for i in range(n):
                    t = i / RATE
                    env = min(
                        smoothstep(t / attack),
                        smoothstep((length_s - t) / release),
                    )
                    if env <= 0:
                        continue
                    buf[i] += amp * env * math.sin(w * t + phase + side * 0.35)
    return left, right


def reverb(x: list, delay_s: float, gain: float) -> list:
    """Cheap feedback delay; enough to stop the pad sounding like a test tone."""
    d = int(delay_s * RATE)
    out = x[:]
    for i in range(d, len(out)):
        out[i] += out[i - d] * gain
    return out


def build_bed(progression, brightness: float, seed: int) -> tuple:
    """Layer the chords with a crossfade so the loop has no seam."""
    random.seed(seed)
    overlap = 1.4
    per = CHORD_S + overlap
    total = int(len(progression) * CHORD_S * RATE) + int(overlap * RATE)
    left = [0.0] * total
    right = [0.0] * total
    for k, notes in enumerate(progression):
        cl, cr = pad_chord(notes, per, brightness)
        start = int(k * CHORD_S * RATE)
        for i, (a, b) in enumerate(zip(cl, cr)):
            if start + i >= total:
                break
            fade = min(1.0, i / (overlap * RATE), (len(cl) - i) / (overlap * RATE))
            left[start + i] += a * fade
            right[start + i] += b * fade

    # A whisper of air keeps the pad from sounding synthetic.
    noise = 0.006 * brightness
    for i in range(total):
        left[i] += random.uniform(-noise, noise)
        right[i] += random.uniform(-noise, noise)

    left = reverb(left, 0.093, 0.22)
    right = reverb(right, 0.117, 0.22)

    # Fade the loop edges to silence so looping/repeating is click-free.
    edge = int(1.0 * RATE)
    for i in range(edge):
        g = i / edge
        left[i] *= g
        right[i] *= g
        left[total - 1 - i] *= g
        right[total - 1 - i] *= g

    peak = max(1e-9, max(max(map(abs, left)), max(map(abs, right))))
    norm = 0.6 / peak
    return [v * norm for v in left], [v * norm for v in right]


def write_wav(left, right, path: Path) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = bytearray()
        for a, b in zip(left, right):
            frames += struct.pack("<hh", int(max(-1, min(1, a)) * 32767),
                                  int(max(-1, min(1, b)) * 32767))
        w.writeframes(bytes(frames))


def encode(wav_path: Path, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav_path), "-codec:a", "libmp3lame",
         "-q:a", "4", "-ar", str(RATE), str(out_path)],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg failed for {out_path}: {r.stderr[-400:]}")
    print(f"  {out_path.relative_to(ROOT)}  {out_path.stat().st_size // 1024} KB")


def main() -> None:
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    beds = {
        # Am7 - Fmaj7 - Cmaj7 - G6: warm, sits under a food/lifestyle read.
        "bed-warm.mp3": (["A2", "C4", "E4", "G4"], ["F2", "A3", "C4", "E4"],
                         ["C3", "E4", "G4", "B4"], ["G2", "B3", "D4", "E4"]),
        # Cm - Ab - Eb - Bb: cooler, for the neon/tech look.
        "bed-neon.mp3": (["C3", "Eb4", "G4"], ["Ab2", "C4", "Eb4"],
                         ["Eb3", "G4", "Bb4"], ["Bb2", "D4", "F4"]),
    }
    for name, progression in beds.items():
        print(f"synth {name}")
        brightness = 0.75 if "neon" in name else 0.5
        seed = 11 if "neon" in name else 3
        left, right = build_bed(progression, brightness, seed)
        with tempfile.TemporaryDirectory() as td:
            wav = Path(td) / "bed.wav"
            write_wav(left, right, wav)
            encode(wav, MUSIC_DIR / name)


if __name__ == "__main__":
    main()

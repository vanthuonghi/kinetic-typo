#!/usr/bin/env python3
"""Prepare TTS audio + word-level timings for the Remotion render.

Uses the edge-tts Python API (not the CLI) because its stream carries
WordBoundary events: those give the exact moment each spoken word starts and
ends, which is what lets the on-screen text light up in sync with the voice.

Each scene is spoken as a whole sentence (natural prosody). If Edge returns no
audio, it retries with small punctuation variations, then splits in halves,
then goes word by word.
"""
import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "src" / "video-config.json"
PUBLIC = ROOT / "public"
MP3 = PUBLIC / "voiceover.mp3"

SUFFIXES = ["", ",", ".", " .", " ,"]
GAP = 110  # ms of air between scenes
SILENCE_DB = -35      # anything quieter than this counts as a pause
SILENCE_MIN_S = 0.18  # ...if it lasts at least this long
VOWELS = "aeiouyàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ"


def syllables(word: str) -> int:
    w = word.lower()
    n, prev = 0, False
    for ch in w:
        is_v = ch in VOWELS
        if is_v and not prev:
            n += 1
        prev = is_v
    return max(1, n)


def dur_ms(path: Path) -> int:
    out = subprocess.check_output(
        ["ffmpeg", "-i", str(path), "-f", "null", "-"],
        stderr=subprocess.STDOUT, text=True,
    )
    # Parse "Duration: HH:MM:SS.mmm" from ffmpeg output
    for line in out.splitlines():
        if "Duration:" in line:
            parts = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = parts.split(":")
            return int((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)
    return 0


def detect_speech_windows(path: Path, total_ms: int):
    """Return [(start_ms, end_ms)] windows that actually contain speech.

    ffmpeg's silencedetect tells us where the voice really pauses. Vietnamese
    edge-tts voices emit no WordBoundary events, so without this the word
    timings are spread over the whole clip and drift out of sync on anything
    longer than a few words: the text keeps moving while the speaker is silent.
    """
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(path),
         "-af", f"silencedetect=noise={SILENCE_DB}dB:d={SILENCE_MIN_S}",
         "-f", "null", "-"],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )

    starts, ends = [], []
    for line in (proc.stderr or "").splitlines():
        for key, bucket in (("silence_start:", starts), ("silence_end:", ends)):
            if key in line:
                try:
                    bucket.append(float(line.split(key)[1].split()[0]) * 1000)
                except (IndexError, ValueError):
                    pass

    silences = []
    for i, start in enumerate(starts):
        end = ends[i] if i < len(ends) and ends[i] > start else total_ms
        silences.append((start, end))
    if not silences:
        return [(0, total_ms)]

    windows, cursor = [], 0.0
    for start, end in silences:
        if start - cursor >= 1:
            windows.append((cursor, start))
        cursor = max(cursor, end)
    if total_ms - cursor >= 1:
        windows.append((cursor, total_ms))

    # Drop slivers (breaths, clicks) so a 30ms blip does not become a "window".
    cleaned = [(int(a), int(b)) for a, b in windows if (b - a) >= 60]
    return cleaned or [(0, total_ms)]


def normalize(path: Path) -> None:
    """Match every clip's loudness so scenes don't jump in volume."""
    tmp = path.with_suffix(".norm.mp3")
    r = subprocess.run(
        ["ffmpeg", "-y", "-i", str(path),
         "-af", "loudnorm=I=-15:TP=-1.5:LRA=11",
         "-c:a", "libmp3lame", "-q:a", "3", "-ar", "44100", str(tmp)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if r.returncode == 0 and tmp.exists() and tmp.stat().st_size > 0:
        tmp.replace(path)
    else:
        tmp.unlink(missing_ok=True)


async def _stream(text: str, voice: str):
    comm = edge_tts.Communicate(text, voice)
    audio = bytearray()
    marks = []
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            start = chunk["offset"] // 10000
            marks.append({
                "text": chunk["text"],
                "startMs": start,
                "endMs": start + chunk["duration"] // 10000,
            })
    return bytes(audio), marks


def speak(text: str, voice: str, out: Path):
    """Render one chunk of text -> (ok, word_marks)."""
    for suffix in SUFFIXES:
        try:
            audio, marks = asyncio.run(_stream(text + suffix, voice))
        except Exception:
            continue
        if len(audio) > 4000:
            out.write_bytes(audio)
            normalize(out)
            return True, marks
    return False, []


def concat(files, out: Path) -> bool:
    lst = out.with_suffix(".lst")
    lst.write_text(
        "".join(f"file '{Path(f).resolve()}'\n" for f in files), encoding="utf-8"
    )
    r = subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
         "-c:a", "libmp3lame", "-q:a", "3", "-ar", "44100", str(out)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    lst.unlink(missing_ok=True)
    return r.returncode == 0 and out.exists() and out.stat().st_size > 0


def scene_speech(text, voice, out: Path, tmp: Path, tag: str):
    """Whole sentence -> halves -> words. Returns (ok, word_marks)."""
    ok, marks = speak(text, voice, out)
    if ok:
        return True, marks

    words = text.split()
    mid = len(words) // 2
    if mid > 0:
        parts, all_marks, offset, ok_all = [], [], 0, True
        for j, h in enumerate([" ".join(words[:mid]), " ".join(words[mid:])]):
            p = tmp / f"{tag}_h{j}.mp3"
            good, m = speak(h, voice, p)
            if not good:
                ok_all = False
                break
            d = dur_ms(p)
            all_marks.extend({**x, "startMs": x["startMs"] + offset,
                              "endMs": x["endMs"] + offset} for x in m)
            offset += d + 60
            parts.append(p)
        if ok_all and parts and concat(parts, out):
            for p in parts:
                p.unlink(missing_ok=True)
            return True, all_marks
        for p in parts:
            p.unlink(missing_ok=True)

    parts, all_marks, offset = [], [], 0
    for j, w in enumerate(words):
        p = tmp / f"{tag}_w{j}.mp3"
        good, m = speak(w, voice, p)
        if not good:
            for q in parts:
                q.unlink(missing_ok=True)
            return False, []
        d = dur_ms(p)
        all_marks.extend({**x, "startMs": x["startMs"] + offset,
                          "endMs": x["endMs"] + offset} for x in m)
        offset += d + 40
        parts.append(p)
    ok = concat(parts, out)
    for p in parts:
        p.unlink(missing_ok=True)
    return ok, all_marks


def align_words(scene_text: str, marks, scene_dur: int, speech_windows=None):
    """Map TTS word marks onto the words we actually draw.

    If Edge returned WordBoundary events (English voices) we use them as-is.
    Otherwise (all Vietnamese voices) the words are distributed by syllable
    weight over **only the voiced parts** of the clip, then mapped back to real
    time, so every pause found by silencedetect stays silent instead of being
    filled with drifting text.
    """
    words = scene_text.split()
    if not words:
        return []
    if len(marks) == len(words):
        return [{"t": w, "s": int(m["startMs"]), "e": int(m["endMs"])}
                for w, m in zip(words, marks)]

    windows = [(int(a), int(b)) for a, b in (speech_windows or []) if b > a]
    if not windows:
        windows = [(min(90, scene_dur // 20), max(1, scene_dur))]

    weights = []
    for w in words:
        wt = float(syllables(w)) + min(0.5, max(0, len(w) - 6) * 0.06)
        if w.endswith((",", ":", ";", ".", "!", "?")):
            wt += 1.1  # the speaker pauses here
        weights.append(wt)

    total = float(sum(weights)) or 1.0
    speak_total = float(sum(b - a for a, b in windows)) or 1.0

    bounds, acc = [], 0.0
    for wt in weights:
        bounds.append((acc, acc + wt))
        acc += wt

    def speech_to_real(position: float) -> int:
        """Map a point on the concatenated-speech timeline back to real time."""
        remaining = max(0.0, position)
        for start, end in windows:
            span = end - start
            if remaining <= span:
                return int(start + remaining)
            remaining -= span
        return int(windows[-1][1])

    def window_end_at(position: int) -> int:
        """End of the voiced window that contains `position`."""
        for win_start, win_end in windows:
            if win_start <= position <= win_end:
                return win_end
        return windows[-1][1]

    out = []
    last = 0
    for w, (lo, hi) in zip(words, bounds):
        start = max(speech_to_real(speak_total * lo / total), last)
        end = speech_to_real(speak_total * hi / total)
        # A word must not stay highlighted through a pause: clamp it to the
        # window it starts in, otherwise the karaoke keeps "speaking" while
        # the voice is silent.
        holder = window_end_at(start)
        end = min(max(end, start + 40), holder)
        end = max(end, start)
        last = start
        out.append({"t": w, "s": start, "e": min(end, scene_dur)})
    return out


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    scenes = cfg["scenes"]
    voice = cfg.get("voice", "vi-VN-NamMinhNeural")

    tmp = PUBLIC / "_tts"
    tmp.mkdir(exist_ok=True)

    clips = []
    cursor = 0
    for i, s in enumerate(scenes):
        clip = tmp / f"scene_{i}.mp3"
        ok, marks = scene_speech(s["text"], voice, clip, tmp, f"s{i}")
        if not ok:
            raise RuntimeError(f"edge-tts produced no audio for scene {i}: {s['text']!r}")

        d = dur_ms(clip)
        speech = detect_speech_windows(clip, d)
        s["startMs"] = cursor
        s["endMs"] = cursor + d
        s["words"] = [{"t": w["t"], "s": cursor + w["s"], "e": cursor + w["e"]}
                      for w in align_words(s["text"], marks, d, speech)]
        cursor += d + GAP
        clips.append(clip)

    if not concat(clips, MP3):
        raise RuntimeError("could not build voiceover.mp3")

    cfg["totalMs"] = cursor - GAP + 300
    cfg["hasAudio"] = True
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

    wc = sum(len(s.get("words", [])) for s in scenes)
    print(f"Prepared {len(scenes)} scenes / {wc} timed words, totalMs={cfg['totalMs']}")

    for c in clips:
        c.unlink(missing_ok=True)
    for f in tmp.glob("*"):
        f.unlink(missing_ok=True)
    tmp.rmdir()


if __name__ == "__main__":
    main()

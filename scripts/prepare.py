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
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        text=True,
    ).strip()
    return int(float(out) * 1000)


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


def align_words(scene_text: str, marks, scene_dur: int):
    """Map TTS word marks onto the words we actually draw.

    Vietnamese voices don't emit WordBoundary events, so usually there are no
    marks to use. We then spread the scene duration across words by weight:
    every syllable counts one, and a word followed by punctuation also pays
    for the pause that follows it.
    """
    words = scene_text.split()
    if not words:
        return []
    if len(marks) == len(words):
        return [{"t": w, "s": int(m["startMs"]), "e": int(m["endMs"])}
                for w, m in zip(words, marks)]

    weights = []
    for w in words:
        wt = float(syllables(w)) + min(0.5, max(0, len(w) - 6) * 0.06)
        if w.endswith((",", ":", ";", ".", "!", "?")):
            wt += 1.1  # the speaker pauses here
        weights.append(wt)

    total = sum(weights)
    lead = min(90, scene_dur // 20)  # small onset before the first word
    span = max(1, scene_dur - lead)
    out, cur = [], lead
    for w, wt in zip(words, weights):
        d = int(span * wt / total)
        out.append({"t": w, "s": cur, "e": cur + d})
        cur += d
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
        s["startMs"] = cursor
        s["endMs"] = cursor + d
        s["words"] = [{"t": w["t"], "s": cursor + w["s"], "e": cursor + w["e"]}
                      for w in align_words(s["text"], marks, d)]
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

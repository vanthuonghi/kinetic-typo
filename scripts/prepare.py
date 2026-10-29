#!/usr/bin/env python3
"""Prepare TTS audio + timings for the Remotion render.

Generates one audio chunk per WORD (Edge TTS fails on some 2-word combos),
concatenates them with ffmpeg, and writes real per-scene timings into
video-config.json.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "src" / "video-config.json"
PUBLIC = ROOT / "public"
MP3 = PUBLIC / "voiceover.mp3"

def dur_ms(path):
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        text=True,
    ).strip()
    return int(float(out) * 1000)

def gen_word(w, wf, txt):
    for suffix in [",", ".", " ,", " .", ""]:
        txt.write_text(w + suffix, encoding="utf-8")
        r = subprocess.run(
            ["edge-tts", "--voice", "vi-VN-NamMinhNeural", "--file", str(txt),
             "--write-media", str(wf)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if r.returncode == 0 and wf.exists() and wf.stat().st_size > 0:
            return True
    return False

def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    scenes = cfg["scenes"]
    voice = cfg.get("voice", "vi-VN-NamMinhNeural")

    all_words = []
    scene_word_counts = []
    for s in scenes:
        words = s["text"].split()
        scene_word_counts.append(len(words))
        all_words.extend(words)

    word_files = []
    for i, w in enumerate(all_words):
        wf = PUBLIC / f"w_{i}.mp3"
        txt = PUBLIC / f"w_{i}.txt"
        # use voice from config
        ok = False
        for suffix in [",", ".", " ,", " .", ""]:
            txt.write_text(w + suffix, encoding="utf-8")
            r = subprocess.run(
                ["edge-tts", "--voice", voice, "--file", str(txt),
                 "--write-media", str(wf)],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            if r.returncode == 0 and wf.exists() and wf.stat().st_size > 0:
                ok = True
                break
        if not ok:
            raise RuntimeError(f"edge-tts failed for word: {w!r}")
        word_files.append(wf)

    listfile = PUBLIC / "words.txt"
    listfile.write_text("".join(f"file '{w.name}'\n" for w in word_files), encoding="utf-8")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
         "-i", str(listfile), "-c", "copy", str(MP3)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

    word_durs = [dur_ms(wf) for wf in word_files]

    GAP = 80
    cursor = 0
    idx = 0
    for s, cnt in zip(scenes, scene_word_counts):
        d = sum(word_durs[idx:idx + cnt])
        s["startMs"] = cursor
        s["endMs"] = cursor + d
        cursor += d + GAP
        idx += cnt
    cfg["totalMs"] = cursor - GAP + 250
    cfg["hasAudio"] = True
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Prepared {len(scenes)} scenes, {len(all_words)} words, totalMs={cfg['totalMs']}")

    for wf in word_files:
        wf.unlink(missing_ok=True)
    for i in range(len(all_words)):
        (PUBLIC / f"w_{i}.txt").unlink(missing_ok=True)
    listfile.unlink(missing_ok=True)

if __name__ == "__main__":
    main()

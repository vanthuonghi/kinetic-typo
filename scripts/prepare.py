#!/usr/bin/env python3
"""Prepare TTS audio + timings for the Remotion render.

Speech is generated scene by scene. Edge TTS intermittently returns no audio
for some Vietnamese word pairs, so each scene falls back: whole sentence ->
halves -> per word. Every clip is trimmed of leading/trailing silence so the
pace stays natural instead of word-by-word staccato.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "src" / "video-config.json"
PUBLIC = ROOT / "public"
MP3 = PUBLIC / "voiceover.mp3"

SUFFIXES = ["", ",", ".", " ."]


def sh(cmd, **kw):
    return subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw)


def dur_ms(path):
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        text=True,
    ).strip()
    return int(float(out) * 1000)


def trim_silence(src, dst):
    """Strip leading/trailing silence so scenes butt up against each other."""
    af = ("silenceremove=start_periods=1:start_silence=0.03:start_threshold=-42dB,"
          "areverse,"
          "silenceremove=start_periods=1:start_silence=0.03:start_threshold=-42dB,"
          "areverse")
    r = sh(["ffmpeg", "-y", "-i", str(src), "-af", af, "-c:a", "libmp3lame",
            "-q:a", "4", str(dst)])
    if r.returncode != 0 or not dst.exists() or dst.stat().st_size == 0:
        dst.write_bytes(src.read_bytes())


def speak(text, voice, out_path, tmp_dir, tag):
    """Render one piece of text, trying a few punctuation variants."""
    txt = tmp_dir / f"{tag}.txt"
    for i, suffix in enumerate(SUFFIXES):
        raw = tmp_dir / f"{tag}_{i}.mp3"
        txt.write_text(text + suffix, encoding="utf-8")
        r = sh(["edge-tts", "--voice", voice, "--file", str(txt),
                "--write-media", str(raw)])
        if r.returncode == 0 and raw.exists() and raw.stat().st_size > 0:
            trim_silence(raw, out_path)
            raw.unlink(missing_ok=True)
            txt.unlink(missing_ok=True)
            return True
        raw.unlink(missing_ok=True)
    txt.unlink(missing_ok=True)
    return False


def concat(files, out_path, tmp_dir, tag):
    listfile = tmp_dir / f"{tag}.lst"
    listfile.write_text("".join(f"file '{f.name}'\n" for f in files), encoding="utf-8")
    r = sh(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listfile),
            "-c:a", "libmp3lame", "-q:a", "4", str(out_path)])
    listfile.unlink(missing_ok=True)
    return r.returncode == 0 and out_path.exists() and out_path.stat().st_size > 0


def speak_scene(text, voice, out_path, tmp_dir, tag):
    """Whole sentence, else halves, else word by word."""
    if speak(text, voice, out_path, tmp_dir, f"{tag}_full"):
        return True

    words = text.split()
    mid = len(words) // 2
    if mid > 0:
        parts = []
        ok = True
        for j, h in enumerate([" ".join(words[:mid]), " ".join(words[mid:])]):
            p = tmp_dir / f"{tag}_h{j}.mp3"
            if not speak(h, voice, p, tmp_dir, f"{tag}_h{j}"):
                ok = False
                break
            parts.append(p)
        if ok and parts and concat(parts, out_path, tmp_dir, f"{tag}_hl"):
            for p in parts:
                p.unlink(missing_ok=True)
            return True
        for p in parts:
            p.unlink(missing_ok=True)

    parts = []
    for j, w in enumerate(words):
        p = tmp_dir / f"{tag}_w{j}.mp3"
        if not speak(w, voice, p, tmp_dir, f"{tag}_w{j}"):
            for q in parts:
                q.unlink(missing_ok=True)
            return False
        parts.append(p)
    ok = concat(parts, out_path, tmp_dir, f"{tag}_wd")
    for p in parts:
        p.unlink(missing_ok=True)
    return ok


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    scenes = cfg["scenes"]
    voice = cfg.get("voice", "vi-VN-NamMinhNeural")

    tmp_dir = PUBLIC / "_tts"
    tmp_dir.mkdir(exist_ok=True)

    clips = []
    for i, s in enumerate(scenes):
        clip = tmp_dir / f"scene_{i}.mp3"
        if not speak_scene(s["text"], voice, clip, tmp_dir, f"s{i}"):
            raise RuntimeError(f"edge-tts failed for scene {i}: {s['text']!r}")
        clips.append(clip)

    if not concat(clips, MP3, tmp_dir, "all"):
        raise RuntimeError("could not build voiceover.mp3")

    GAP = 110
    cursor = 0
    for s, c in zip(scenes, clips):
        d = dur_ms(c)
        s["startMs"] = cursor
        s["endMs"] = cursor + d
        cursor += d + GAP
    cfg["totalMs"] = cursor - GAP + 300
    cfg["hasAudio"] = True
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Prepared {len(scenes)} scenes, totalMs={cfg['totalMs']}")

    for c in clips:
        c.unlink(missing_ok=True)
    for f in tmp_dir.glob("*"):
        f.unlink(missing_ok=True)
    tmp_dir.rmdir()


if __name__ == "__main__":
    main()

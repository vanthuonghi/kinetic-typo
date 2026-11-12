#!/usr/bin/env python3
"""Local fallback renderer: edge-tts + ffmpeg kinetic typography when GitHub Actions unavailable."""
import asyncio
import json
import math
import os
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "src" / "video-config.json"
OUTPUT_DIR = Path(os.path.expanduser("~/.hermes/profiles/short-video/cache/kinetic-videos"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

FONT = str(ROOT / "public" / "fonts" / "BeVietnamPro-Black-viet.woff2")
# Map of effect names to ffmpeg drawtext styles
FONT_SIZE = 64
WIDTH, HEIGHT = 1080, 1920


def load_config() -> dict:
    return json.loads(CONFIG.read_text(encoding="utf-8"))


async def generate_tts(text: str, voice: str, out_path: Path) -> float:
    """Generate TTS audio and return duration in ms."""
    comm = edge_tts.Communicate(text, voice)
    audio = bytearray()
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
    out_path.write_bytes(bytes(audio))
    # Get duration
    r = subprocess.run(
        ["ffmpeg", "-i", str(out_path), "-f", "null", "-"],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    for line in r.stderr.splitlines():
        if "Duration:" in line:
            parts = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = parts.split(":")
            return (int(h) * 3600 + int(m) * 60 + float(s)) * 1000
    return 0


def create_ass_subtitle(scenes: list[dict], total_ms: int, highlight_color: str = "&H00FF006E") -> str:
    """Create an ASS subtitle file with kinetic typography styling."""
    fps = 30
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,Be Vietnam Pro,80,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,80,80,200,1",
        f"Style: Highlight,Be Vietnam Pro,80,&H{highlight_color[1:]},&H{highlight_color[1:]},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,80,80,200,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    for s in scenes:
        start_s = s["startMs"] / 1000
        end_s = s["endMs"] / 1000
        start_ts = f"{int(start_s//3600):01d}:{int(start_s%3600//60):02d}:{start_s%60:05.2f}"
        end_ts = f"{int(end_s//3600):01d}:{int(end_s%3600//60):02d}:{end_s%60:05.2f}"

        words = s["text"].split()
        highlight_words = set(w.lower().strip(".,!?;:") for w in (s.get("highlight", "") or "").split())

        ass_text = ""
        for w in words:
            clean = w.strip(".,!?;:")
            if clean.lower() in highlight_words:
                ass_text += f"{{\\rHighlight}}{w} "
            else:
                ass_text += f"{{\\rDefault}}{w} "

        lines.append(f"Dialogue: 0,{start_ts},{end_ts},Default,,0,0,0,,{ass_text.strip()}")

    return "\n".join(lines)


def build_video(scenes: list[dict], total_ms: int, voice: str, out_name: str):
    """Build the full video locally using edge-tts + ffmpeg."""
    tmp = Path(tempfile.mkdtemp())
    audio_paths = []

    print("Generating TTS audio for each scene...")
    for i, s in enumerate(scenes):
        ap = tmp / f"scene_{i}.mp3"
        dur = asyncio.run(generate_tts(s["text"], voice, ap))
        s["endMs"] = s["startMs"] + int(dur)
        audio_paths.append(ap)
        print(f"  Scene {i+1}: {s['text'][:40]}... ({dur/1000:.1f}s)")

    # Concat all audio
    concat_path = tmp / "voiceover.mp3"
    lst = tmp / "lst.txt"
    lst.write_text("\n".join(f"file '{p}'" for p in audio_paths))
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
         "-c:a", "libmp3lame", "-q:a", "3", str(concat_path)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

    # Create ASS subtitle
    ass_path = tmp / "subs.ass"
    ass_path.write_text(create_ass_subtitle(scenes, total_ms), encoding="utf-8")

    # Create background video with subtitles
    video_path = OUTPUT_DIR / f"{out_name}.mp4"

    # Build with ffmpeg: gradient background + ASS subtitles + audio
    filter_complex = (
        f"color=c=#000814:s={WIDTH}x{HEIGHT}:d={total_ms/1000:.2f}:r=30[v0];"
        f"[v0]ass={ass_path}[v]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", str(concat_path),
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-map", "0:a",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        str(video_path),
    ]

    print("Rendering video...")
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        print(f"FFmpeg error: {r.stderr}")
        return None

    # Cleanup
    import shutil
    shutil.rmtree(tmp, ignore_errors=True)

    size = video_path.stat().st_size
    print(f"✓ Video: {video_path} ({size/1024/1024:.1f} MB)")
    return str(video_path)


def main():
    cfg = load_config()
    scenes = cfg["scenes"]
    total_ms = cfg.get("totalMs", 25000)
    voice = cfg.get("voice", "vi-VN-NamMinhNeural")
    out_name = sys.argv[1] if len(sys.argv) > 1 else "kinetic-video"

    print(f"🎬 Local render: {len(scenes)} scenes, {total_ms/1000:.1f}s")
    video_path = build_video(scenes, total_ms, voice, out_name)
    if video_path:
        print(f"\n📁 Output: {video_path}")
        return video_path
    return None


if __name__ == "__main__":
    main()

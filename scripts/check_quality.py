#!/usr/bin/env python3
"""Quality gate that runs after prepare.py and before the render.

Catches the mistakes that actually ruin a short video: a scene that is too
long to read, text too small for a phone, low contrast against the theme,
or word timings that don't cover the audio. Hard errors exit 1; taste issues
only warn, so a borderline video still ships.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "src" / "video-config.json"
MP3 = ROOT / "public" / "voiceover.mp3"

EFFECTS = ["karaoke", "word-rise", "line-mask", "slam", "wave",
           "typewriter", "sweep", "spotlight", "pop"]

MAX_CHARS = 95
MIN_SCENE_S = 0.7
MAX_SCENE_S = 12.0
MIN_TOTAL_S = 6.0
MAX_TOTAL_S = 120.0
MIN_CONTRAST = 3.0


def lum(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) < 6:
        return 0.0
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a: str, b: str) -> float:
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main() -> int:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    theme = cfg["theme"]
    scenes = cfg["scenes"]
    errors, warnings = [], []

    if not MP3.exists() or MP3.stat().st_size < 5000:
        errors.append("voiceover.mp3 missing or empty")

    total = cfg.get("totalMs", 0) / 1000
    if total < MIN_TOTAL_S:
        errors.append(f"video too short: {total:.1f}s")
    if total > MAX_TOTAL_S:
        errors.append(f"video too long: {total:.1f}s")

    bg = theme["bg"][0] if theme.get("bg") else "#000000"
    ratio = contrast(theme["text"], bg)
    if ratio < 1.8:
        errors.append(f"text/background contrast {ratio:.1f}:1 is unreadable")
    elif ratio < MIN_CONTRAST:
        warnings.append(f"low text contrast {ratio:.1f}:1")

    # Background photos: a wrong path renders a black frame, and a huge blur
    # radius makes the render crawl for no visible gain.
    bg_cfg = cfg.get("background") or {}
    public = ROOT / "public"
    if bg_cfg.get("image"):
        image = public / bg_cfg["image"]
        if not image.exists():
            errors.append(f"background image not found: public/{bg_cfg['image']}")
    blur = bg_cfg.get("blur", 24)
    if isinstance(blur, (int, float)) and blur > 60:
        warnings.append(f"background blur {blur}px is expensive to render (24-30 is plenty)")

    # A missing music bed or SFX file only shows up as a silent video after a
    # 6-minute render, so catch it here.
    music = cfg.get("music") or {}
    track = (music.get("track") or "").strip()
    if track and not (public / track).exists():
        errors.append(f"music track not found: public/{track}")
    sfx = cfg.get("sfx") or {}
    for flag, name in (("whoosh", "sfx/whoosh.mp3"), ("click", "sfx/click.mp3")):
        if sfx.get(flag, True) and not (public / name).exists():
            errors.append(
                f"sound effect not found: public/{name} "
                f"(set sfx.{flag}=false or run python3 scripts/make_music.py)"
            )

    effect = cfg.get("effect", "word-rise")
    if effect != "auto" and effect not in EFFECTS:
        errors.append(f"unknown effect {effect!r} (use auto or one of: {', '.join(EFFECTS)})")

    for i, s in enumerate(scenes):
        dur = (s["endMs"] - s["startMs"]) / 1000
        n = len(s["text"])
        tag = f"scene {i + 1}"
        if s.get("image") and not (ROOT / "public" / s["image"]).exists():
            errors.append(f"{tag}: image not found: public/{s['image']}")
        if s.get("effect") and s["effect"] not in EFFECTS:
            errors.append(f"{tag}: unknown effect {s['effect']!r}")
        if s.get("alignSource") == "estimate":
            warnings.append(
                f"{tag}: word timings estimated from the script "
                "(pip install faster-whisper for measured sync)"
            )

        # The renderer matches highlight as a whole phrase, so a highlight that
        # is not literally in the sentence silently highlights nothing.
        hl = (s.get("highlight") or "").strip()
        if hl:
            clean = lambda t: [re.sub(r'[.,!?;:…"\'()]', "", w).lower() for w in t.split()]
            text_words, hl_words = clean(s["text"]), clean(hl)
            hit = any(
                text_words[i:i + len(hl_words)] == hl_words
                for i in range(max(0, len(text_words) - len(hl_words) + 1))
            )
            if not hit:
                warnings.append(f"{tag}: highlight {hl!r} is not in the sentence (nothing lights up)")
        if dur < MIN_SCENE_S:
            errors.append(f"{tag}: {dur:.2f}s is too quick to read")
        if dur > MAX_SCENE_S:
            warnings.append(f"{tag}: {dur:.1f}s lingers")
        if n > MAX_CHARS:
            errors.append(f"{tag}: {n} chars won't fit the frame")
        elif n > 70:
            warnings.append(f"{tag}: {n} chars is dense")
        words = s.get("words") or []
        if not words:
            errors.append(f"{tag}: no word timings (karaoke would freeze)")
        else:
            # words[] carry ABSOLUTE timestamps, so they must be compared with
            # the scene window. The old check compared them against the scene
            # duration, which made "word timings end early" almost never fire.
            scene_start, scene_end = s["startMs"], s["endMs"]
            first, last = words[0]["s"], words[-1]["e"]
            if first < scene_start - 50 or first > scene_end:
                errors.append(f"{tag}: first word starts outside the scene ({first}ms)")
            if last > scene_end + 50:
                warnings.append(f"{tag}: last word ends after the scene ({last}ms)")
            covered = max(0, min(last, scene_end) - scene_start)
            if covered < (scene_end - scene_start) * 0.5:
                warnings.append(f"{tag}: word timings cover only {covered}ms of the scene")
            if any(cur["s"] < prev["s"] for prev, cur in zip(words, words[1:])):
                errors.append(f"{tag}: word timings are not monotonic")
            gaps = [cur["s"] - prev["e"] for prev, cur in zip(words, words[1:])]
            if gaps and max(gaps) > 1200:
                warnings.append(f"{tag}: {max(gaps)}ms silent gap inside the sentence")

    measured = sum(1 for s in scenes if s.get("alignSource") == "whisper")
    align = f", timings {measured}/{len(scenes)} measured" if measured else ""
    music = f", music {cfg['music']['track']}" if (cfg.get("music") or {}).get("track") else ""
    print(f"Quality check: {len(scenes)} scenes, {total:.1f}s, contrast {ratio:.1f}:1{align}{music}")
    for w in warnings:
        print(f"  warn  {w}")
    for e in errors:
        print(f"  ERROR {e}")
    print("PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())

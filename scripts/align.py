#!/usr/bin/env python3
"""Measure word timings from the voice clip instead of guessing them.

edge-tts only emits WordBoundary events for English voices, so Vietnamese
timings used to be spread over the voiced windows by syllable weight. That is
close, but numbers ("12 tiếng"), names and fast clauses drift, and the error
accumulates towards the end of a sentence.

faster-whisper transcribes the clip with word timestamps; this module aligns
the recognised words to the real script with difflib and keeps the measured
start/end for every word that matches. Words whisper misheard are filled from
the syllable estimate and clamped between their measured neighbours.

faster-whisper is an optional dependency: without it (or with
KINETIC_ALIGN=0) the caller keeps the estimate, so the pipeline still runs.

    python3 scripts/align.py --selftest
"""
import difflib
import os
import re
import sys

STRIP = re.compile(r"[.,!?;:…\"'()\[\]—–-]")
MODEL = os.environ.get("ALIGN_MODEL", "base")


def _norm(word: str) -> str:
    return STRIP.sub("", word).lower()


def available() -> bool:
    try:
        import faster_whisper  # noqa: F401
    except Exception:
        return False
    return True


_model = None


def _model_for(size: str):
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        _model = WhisperModel(
            size,
            device=os.environ.get("ALIGN_DEVICE", "cpu"),
            compute_type="int8",
        )
    return _model


def heard_words(audio_path, size: str = MODEL, language: str = "vi"):
    """Word timestamps whisper actually hears in one scene clip.

    `vad_filter=False` matters: the clip is already trimmed to a single
    sentence, and VAD would drop the quiet tail of the last word.
    """
    model = _model_for(size)
    segments, _info = model.transcribe(
        str(audio_path),
        language=language,
        word_timestamps=True,
        vad_filter=False,
        beam_size=1,
        condition_on_previous_text=False,
    )
    out = []
    for segment in segments:
        for word in segment.words or []:
            text = (word.word or "").strip()
            if text:
                out.append(
                    {
                        "t": text,
                        "s": int(word.start * 1000),
                        "e": int(word.end * 1000),
                    }
                )
    return out


def match(expected, heard, fallback, total_ms):
    """Map recognised words onto the script. Returns (words, matched_count).

    `words` is None when too little of the transcript lines up with the script
    (whisper hallucinated, wrong language, or the clip does not match the
    text) — the caller then keeps the syllable estimate.
    """
    starts = [None] * len(expected)
    ends = [None] * len(expected)
    sm = difflib.SequenceMatcher(
        a=[_norm(w["t"]) for w in heard],
        b=[_norm(w) for w in expected],
        autojunk=False,
    )
    matched = 0
    for tag, i1, _i2, j1, j2 in sm.get_opcodes():
        if tag != "equal":
            continue
        for k in range(j2 - j1):
            starts[j1 + k] = heard[i1 + k]["s"]
            ends[j1 + k] = heard[i1 + k]["e"]
            matched += 1

    if matched < max(2, len(expected) // 2):
        return None, matched

    out = []
    for i, word in enumerate(expected):
        base = fallback[i] if i < len(fallback) else None
        s = starts[i] if starts[i] is not None else (base["s"] if base else 0)
        e = ends[i] if ends[i] is not None else (base["e"] if base else s + 120)
        out.append({"t": word, "s": s, "e": e})

    # A run of unmeasured words must stay inside the measured gap around it,
    # otherwise a misheard word pushes the highlight through a pause.
    i = 0
    while i < len(out):
        if starts[i] is not None:
            i += 1
            continue
        j = i
        while j < len(out) and starts[j] is None:
            j += 1
        lo = out[i - 1]["e"] + 20 if i > 0 else 0
        hi = out[j]["s"] - 20 if j < len(out) else total_ms
        hi = max(lo + 40, hi)
        for k in range(i, j):
            s = min(max(out[k]["s"], lo), hi)
            out[k]["s"] = s
            out[k]["e"] = min(max(out[k]["e"], s + 40), hi)
        i = j

    for i, word in enumerate(out):
        if i:
            word["s"] = max(word["s"], out[i - 1]["e"])
        word["e"] = max(word["e"], word["s"] + 40)
        word["s"] = min(word["s"], total_ms)
        word["e"] = min(word["e"], total_ms)

    return out, matched


def timings(text, audio_path, fallback, total_ms, size: str = MODEL):
    """Return (words, source); source is "whisper" or "estimate"."""
    expected = text.split()
    if not expected or not fallback:
        return fallback, "estimate"
    if os.environ.get("KINETIC_ALIGN", "1") == "0" or not available():
        return fallback, "estimate"
    try:
        heard = heard_words(audio_path, size)
    except Exception as exc:  # model download failure, unsupported platform...
        print(f"  align: whisper unavailable ({exc}); keeping estimate", file=sys.stderr)
        return fallback, "estimate"
    if not heard:
        return fallback, "estimate"
    words, _matched = match(expected, heard, fallback, total_ms)
    if words is None:
        return fallback, "estimate"
    return words, "whisper"


def _selftest() -> int:
    """Exercise the transcript -> script mapping without a whisper model."""
    expected = "Ngâm nước 12 tiếng cho nở trắng trong rồi mới nấu".split()
    # Whisper hears the numbers badly ("mười hai") and drops one word.
    heard = [
        {"t": "ngâm", "s": 120, "e": 420},
        {"t": "nước", "s": 430, "e": 700},
        {"t": "mười", "s": 760, "e": 900},
        {"t": "hai", "s": 900, "e": 1010},
        {"t": "tiếng", "s": 1030, "e": 1300},
        {"t": "cho", "s": 1340, "e": 1500},
        {"t": "nở", "s": 1520, "e": 1700},
        {"t": "trắng", "s": 1720, "e": 1980},
        {"t": "trong", "s": 2000, "e": 2260},
        {"t": "rồi", "s": 2320, "e": 2480},
        {"t": "mới", "s": 2500, "e": 2650},
        {"t": "nấu", "s": 2700, "e": 2950},
    ]
    fallback = [
        {"t": w, "s": 100 + i * 230, "e": 100 + i * 230 + 200}
        for i, w in enumerate(expected)
    ]
    words, matched_ok = match(expected, heard, fallback, 3100)
    assert words is not None, "matching should succeed"
    assert len(words) == len(expected), "one timing per script word"
    assert matched_ok >= 8, f"expected most words measured, got {matched_ok}"
    assert words[0]["s"] == 120, "measured word keeps its exact start"
    assert words[-1]["e"] <= 3100, "nothing past the clip"
    for prev, cur in zip(words, words[1:]):
        assert cur["s"] >= prev["s"], "timings must be monotonic"
        assert cur["e"] >= cur["s"], "end must follow start"
    # The unmeasured spots ("12" -> "mười"/"hai") stay inside the neighbours.
    twelve = words[2]
    assert 700 <= twelve["s"] <= twelve["e"] <= 1030, f"12 out of its gap: {twelve}"

    # Garbage transcript -> None, so the caller keeps the estimate.
    words, matched_bad = match(
        expected, [{"t": "xin", "s": 0, "e": 100}], fallback, 3100
    )
    assert words is None and matched_bad <= 1, "unrelated transcript must be rejected"

    print(f"align selftest OK ({matched_ok} words measured, {len(expected)} drawn)")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    print(f"faster-whisper available: {available()} (model {MODEL!r})")

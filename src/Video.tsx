import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Background } from "./Background";
import {
  BRAND,
  CFG,
  CHROME,
  EFFECTS_ORDER,
  effectForScene,
  EffectName,
  hasTimings,
  Scene,
  THEME,
  TransitionName,
} from "./config";
import { FONT_FAMILY } from "./fonts";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const ease = (f: number, from: number, to: number, a = 0, b = 1) =>
  interpolate(f, [from, to], [a, b], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/** `#00d4ff` + 0.34 -> `rgba(0, 212, 255, 0.34)`, so themes can dim text. */
const withAlpha = (hex: string, alpha: number): string => {
  const h = (hex || "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return hex;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** Font size tuned so Vietnamese lines stay readable on a phone screen. */
const fitFontSize = (text: string): number => {
  const n = text.trim().length;
  if (n <= 14) return 124;
  if (n <= 20) return 112;
  if (n <= 28) return 100;
  if (n <= 38) return 88;
  if (n <= 50) return 78;
  if (n <= 66) return 66;
  if (n <= 84) return 58;
  return 52;
};

const stripMarks = (w: string) => w.replace(/[.,!?;:…"'()]/g, "").toLowerCase();
const splitWords = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/**
 * Word indexes covered by every occurrence of the highlight phrase.
 *
 * Matching the phrase (not single words) matters: with highlight "giảm độ
 * sáng", the word "độ" inside "chế độ" used to light up as well. Requiring the
 * whole phrase in order removes that false positive.
 */
const highlightIndexes = (text: string, highlight?: string): Set<number> => {
  const words = splitWords(text).map(stripMarks);
  const phrase = splitWords(highlight || "").map(stripMarks).filter(Boolean);
  const out = new Set<number>();
  if (!phrase.length) return out;
  for (let i = 0; i + phrase.length <= words.length; i++) {
    let match = true;
    for (let j = 0; j < phrase.length; j++) {
      if (words[i + j] !== phrase[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      for (let j = 0; j < phrase.length; j++) out.add(i + j);
    }
  }
  return out;
};

/*
 * All sizes below are authored on a 1080x1920 reference frame and scaled by
 * `useStage()`. Changing `width`/`height` in video-config.json therefore keeps
 * the same optical text size and margins on 4:5 or 1:1 instead of inheriting
 * 9:16 padding.
 */
const BASE_WIDTH = 1080;
const PAD_X_RATIO = 84 / 1080;
const PAD_TOP_RATIO = 300 / 1920;
const PAD_BOTTOM_RATIO = 520 / 1920;

/** Horizontal room between the safe margins: 1080 - 2 x 84. */
const USABLE_WIDTH = BASE_WIDTH - 2 * Math.round(BASE_WIDTH * PAD_X_RATIO);
const MIN_FONT_SIZE = 46;
const LETTER_SPACING_EM = -0.02;

type Stage = {
  /** 1 on the 1080x1920 reference frame; smaller for narrower renders. */
  scale: number;
  padX: number;
  padTop: number;
  padBottom: number;
  usable: number;
};

const useStage = (): Stage => {
  const { width, height } = useVideoConfig();
  const padX = Math.round(width * PAD_X_RATIO);
  return {
    scale: width / BASE_WIDTH,
    padX,
    padTop: Math.round(height * PAD_TOP_RATIO),
    padBottom: Math.round(height * PAD_BOTTOM_RATIO),
    usable: width - padX * 2,
  };
};

let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

/**
 * Real glyph measurement instead of an average-character-width guess.
 * Vietnamese mixes narrow ("i", "l") and wide ("M", "Ư") glyphs, so the old
 * `length * 0.545` estimate either overflowed the frame or shrank the type for
 * no reason. Measured once per (text, size) and cached — cheap enough to call
 * during render.
 */
const measureWidth = (text: string, fontSize: number): number => {
  const key = `${fontSize}|${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;

  let width: number;
  if (typeof document === "undefined") {
    width = text.length * fontSize * 0.545;
  } else {
    if (!measureCtx) {
      measureCtx = document.createElement("canvas").getContext("2d");
    }
    if (measureCtx) {
      measureCtx.font = `900 ${fontSize}px ${FONT_FAMILY}`;
      width = measureCtx.measureText(text).width;
      width += LETTER_SPACING_EM * fontSize * Math.max(0, text.length - 1);
    } else {
      width = text.length * fontSize * 0.545;
    }
  }

  widthCache.set(key, width);
  return width;
};

const wrapToWidth = (
  words: string[],
  fontSize: number,
  usable: number = USABLE_WIDTH,
): string[][] => {
  const out: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    const candidate = cur.length ? `${cur.join(" ")} ${w}` : w;
    if (cur.length && measureWidth(candidate, fontSize) > usable) {
      out.push(cur);
      cur = [w];
    } else {
      cur.push(w);
    }
  }
  if (cur.length) out.push(cur);
  return out;
};

const splitPhrases = (text: string): string[][] => {
  const words = splitWords(text);
  const out: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    if (/[:;,!?]$/.test(w)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
};

/**
 * Lay out a scene: break at punctuation first (a colon is a real pause in
 * speech), then keep the type as large as possible while the sentence still
 * fits in at most three lines. A long sentence therefore gets a big two- or
 * three-line block instead of one small line — the old code shrank the type
 * until the whole line fit, which made long Vietnamese sentences tiny on a
 * phone.
 */
const MAX_LINES = 3;

const countLines = (blocks: string[][], fontSize: number, usable: number) =>
  blocks.reduce((n, block) => n + wrapToWidth(block, fontSize, usable).length, 0);

const layoutScene = (
  text: string,
  base: number,
  usable: number = USABLE_WIDTH,
): { lines: string[][]; fontSize: number } => {
  const phrases = splitPhrases(text);
  const blocks = phrases.length ? phrases : [splitWords(text)];

  // Step down 4px at a time until the wrapped sentence fits MAX_LINES. The
  // measurement cache makes each step a map lookup.
  let fontSize = MIN_FONT_SIZE;
  for (let candidate = Math.max(MIN_FONT_SIZE, base); candidate >= MIN_FONT_SIZE; candidate -= 4) {
    if (countLines(blocks, candidate, usable) <= MAX_LINES) {
      fontSize = candidate;
      break;
    }
  }

  const lines: string[][] = [];
  for (const block of blocks) {
    lines.push(...wrapToWidth(block, fontSize, usable));
  }
  return { lines, fontSize };
};

/**
 * layoutScene measured against the real stage width of this render. Memoised
 * because layoutScene re-walks every word and runs on every single frame.
 */
const useSceneLayout = (text: string, base: number) => {
  const stage = useStage();
  return useMemo(
    () => layoutScene(text, base, stage.usable),
    [text, base, stage.usable],
  );
};

/** Heavy weight, tight tracking, soft shadow: stays crisp on a phone. */
const textStyle = (fontSize: number, color: string): React.CSSProperties => ({
  fontSize,
  fontWeight: 900,
  lineHeight: 1.18,
  letterSpacing: "-0.02em",
  color,
  textAlign: "center",
  fontFamily: FONT_FAMILY,
  WebkitTextStroke: "1.5px rgba(0,0,0,0.4)",
  paintOrder: "stroke fill",
  textShadow: "0 4px 18px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.55)",
});

/* ------------------------------------------------------------------ */
/* Text shell                                                          */
/* ------------------------------------------------------------------ */

const TextShell: React.FC<{
  children: React.ReactNode;
  fontSize: number;
  opacity?: number;
  transform?: string;
  clipPath?: string;
}> = ({ children, fontSize, opacity = 1, transform, clipPath }) => {
  const stage = useStage();

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: stage.padX,
        paddingRight: stage.padX,
        paddingTop: stage.padTop,
        paddingBottom: stage.padBottom,
      }}
    >
      <div
        style={{
          maxWidth: stage.usable,
          ...textStyle(fontSize, THEME.text),
          opacity,
          transform,
          clipPath,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

/** Lines render as nowrap rows, so a phrase never breaks across two lines. */
const LineRows: React.FC<{
  lines: string[][];
  renderWord: (word: string, index: number) => React.ReactNode;
}> = ({ lines, renderWord }) => {
  let k = 0;
  return (
    <>
      {lines.map((line, li) => (
        <div key={li} style={{ whiteSpace: "nowrap" }}>
          {line.map((word, wi) => {
            const node = renderWord(word, k);
            k += 1;
            return <React.Fragment key={wi}>{node}</React.Fragment>;
          })}
        </div>
      ))}
    </>
  );
};

const wordSpan = (word: string, style: React.CSSProperties, extra?: React.ReactNode) => (
  <span
    style={{
      display: "inline-block",
      marginRight: "0.26em",
      position: "relative",
      isolation: "isolate",
      ...style,
    }}
  >
    {extra}
    {word}
  </span>
);

const Underline: React.FC<{ p: number }> = ({ p }) => (
  <span
    style={{
      position: "absolute",
      left: 0,
      right: "0.16em",
      bottom: "-0.06em",
      height: "0.08em",
      borderRadius: 99,
      background: THEME.accent,
      transform: `scaleX(${clamp(p, 0, 1)})`,
      transformOrigin: "left center",
      opacity: 0.95,
    }}
  />
);

/** Soft accent block behind a highlighted word (karaoke / spotlight). */
const Marker: React.FC<{ p: number; opacity?: number }> = ({ p, opacity = 1 }) => (
  <span
    style={{
      position: "absolute",
      left: "-0.08em",
      right: "0.12em",
      top: "0.08em",
      bottom: "0.1em",
      borderRadius: "0.16em",
      background: withAlpha(THEME.accent, 0.22),
      boxShadow: `0 0 26px ${withAlpha(THEME.accent, 0.35)}`,
      transform: `scaleX(${clamp(p, 0, 1)})`,
      transformOrigin: "left center",
      opacity,
      zIndex: -1,
    }}
  />
);

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

type EffectProps = { scene: Scene; fontSize: number };

const WordRise: React.FC<EffectProps> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hi = highlightIndexes(scene.text, scene.highlight);
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);

  return (
    <TextShell fontSize={fs}>
      <LineRows
        lines={lines}
        renderWord={(word, i) => {
          const enter = spring({
            frame,
            fps,
            delay: i * 3,
            config: { damping: 14, stiffness: 130, mass: 0.7 },
          });
          const y = Math.round(interpolate(enter, [0, 1], [38, 0]));
          const isHi = hi.has(i);
          return wordSpan(
            word,
            {
              opacity: enter,
              transform: `translateY(${y}px)`,
              color: isHi ? THEME.accent : undefined,
            },
            isHi ? <Underline p={ease(frame, 10 + i * 3, 24 + i * 3)} /> : null,
          );
        }}
      />
    </TextShell>
  );
};

const LineMask: React.FC<EffectProps> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const p = ease(frame, 0, 20);
  const y = Math.round(interpolate(p, [0, 1], [26, 0]));
  const reveal = interpolate(p, [0, 1], [100, 0]);
  const hi = highlightIndexes(scene.text, scene.highlight);
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);

  return (
    <TextShell
      fontSize={fs}
      clipPath={`inset(0% 0% ${reveal}% 0%)`}
      transform={`translateY(${y}px)`}
    >
      <LineRows
        lines={lines}
        renderWord={(word, i) =>
          wordSpan(word, {
            color: hi.has(i) ? THEME.accent : undefined,
          })
        }
      />
    </TextShell>
  );
};

const Slam: React.FC<EffectProps> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drop = spring({ frame, fps, config: { damping: 11, stiffness: 150, mass: 1.1 } });
  const y = Math.round(interpolate(drop, [0, 1], [-380, 0]));
  const sc = interpolate(drop, [0, 0.85, 1], [1.14, 1.14, 1]);
  const flash = interpolate(frame, [5, 9, 16], [0, 0.12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hi = highlightIndexes(scene.text, scene.highlight);
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);

  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity: flash }} />
      <TextShell fontSize={fs} transform={`translateY(${y}px) scale(${sc})`}>
        <LineRows
          lines={lines}
          renderWord={(word, i) =>
            wordSpan(word, {
              color: hi.has(i) ? THEME.accent : undefined,
            })
          }
        />
      </TextShell>
    </>
  );
};

const Wave: React.FC<EffectProps> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);

  return (
    <TextShell fontSize={fs}>
      {lines.map((line, li) => (
        <div key={li} style={{ whiteSpace: "nowrap" }}>
          {line.map((word, wi) => (
            <span key={wi} style={{ display: "inline-block", marginRight: "0.26em" }}>
              {Array.from(word).map((ch, ci) => {
                const i = li * 24 + wi * 8 + ci;
                const enter = spring({
                  frame,
                  fps,
                  delay: i * 2,
                  config: { damping: 13, stiffness: 150, mass: 0.6 },
                });
                const base = Math.round(interpolate(enter, [0, 1], [46, 0]));
                const wobble = enter >= 0.999 ? Math.sin((frame - i * 2) / 9) * 4 : 0;
                return (
                  <span
                    key={ci}
                    style={{
                      display: "inline-block",
                      opacity: enter,
                      transform: `translateY(${base + wobble}px)`,
                      color: THEME.text,
                    }}
                  >
                    {ch}
                  </span>
                );
              })}
            </span>
          ))}
        </div>
      ))}
    </TextShell>
  );
};

const Typewriter: React.FC<EffectProps> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const chars = Math.floor(ease(frame, 2, 2 + scene.text.length * 1.5, 0, scene.text.length));
  const caretOn = Math.floor(frame / 12) % 2 === 0;
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);

  let consumed = 0;
  return (
    <TextShell fontSize={fs}>
      {lines.map((line, li) => {
        const lineText = line.join(" ");
        const start = consumed;
        consumed += lineText.length + 1;
        const visible = clamp(chars - start, 0, lineText.length);
        const isLast = chars <= start + lineText.length;
        return (
          <div key={li} style={{ whiteSpace: "nowrap" }}>
            {lineText.slice(0, visible)}
            {isLast && (
              <span
                style={{
                  display: "inline-block",
                  width: Math.round(fs * 0.08),
                  height: Math.round(fs * 0.9),
                  background: THEME.accent,
                  marginLeft: 6,
                  verticalAlign: "-0.08em",
                  opacity: caretOn ? 1 : 0,
                }}
              />
            )}
          </div>
        );
      })}
    </TextShell>
  );
};

const Sweep: React.FC<EffectProps> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const hi = highlightIndexes(scene.text, scene.highlight);
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);
  const totalWords = lines.reduce((n, l) => n + l.length, 0);
  const cursor = Math.floor(ease(frame, 4, 4 + totalWords * 6, -1, totalWords - 0.01));

  return (
    <TextShell fontSize={fs}>
      <LineRows
        lines={lines}
        renderWord={(word, i) => {
          const active = i <= cursor;
          const isHi = hi.has(i);
          return wordSpan(
            word,
            {
              opacity: active ? 1 : 0.3,
              color: active && isHi ? THEME.accent : undefined,
              transform: active ? "translateY(0px)" : "translateY(4px)",
            },
            active && isHi ? <Underline p={ease(frame, i * 6, i * 6 + 10)} /> : null,
          );
        }}
      />
    </TextShell>
  );
};

/**
 * Karaoke: the whole line sits dim on screen and each word lights up at the
 * moment the voice reaches it (timings come from prepare.py). The highlighted
 * words get a soft accent marker at the same time, which reads much better on
 * a photo background than colour alone.
 */
const Karaoke: React.FC<EffectProps> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);
  const nowMs = (frame / fps) * 1000 + scene.startMs;
  const words = scene.words && scene.words.length ? scene.words : [];
  const hi = highlightIndexes(scene.text, scene.highlight);

  return (
    <TextShell fontSize={fs}>
      <LineRows
        lines={lines}
        renderWord={(word, i) => {
          const w = words[i];
          const p = w
            ? clamp((nowMs - w.s) / Math.max(90, w.e - w.s), 0, 1)
            : clamp((frame - i * 4) / 12, 0, 1);
          const active = p > 0 && p < 1;
          const isHi = hi.has(i);
          const lit = isHi && p > 0.55;
          return wordSpan(
            word,
            {
              color: lit ? THEME.accent : withAlpha(THEME.text, 0.32 + 0.68 * p),
              transform: `translateY(${active ? -3 : 0}px) scale(${1 + 0.055 * Math.sin(p * Math.PI)})`,
              textShadow: active
                ? `0 0 22px ${withAlpha(THEME.accent, 0.55)}, 0 4px 18px rgba(0,0,0,0.55)`
                : undefined,
            },
            isHi ? (
              <Marker
                p={ease(p, 0.05, 0.5)}
                opacity={clamp(p / 0.2, 0, 1) * (1 - clamp((p - 0.7) / 0.3, 0, 1))}
              />
            ) : null,
          );
        }}
      />
    </TextShell>
  );
};

/**
 * Spotlight: only the word being spoken is fully lit; the rest recedes. Uses
 * the same word timings as karaoke, so it stays locked to the voice.
 */
const Spotlight: React.FC<EffectProps> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);
  const words = scene.words && scene.words.length ? scene.words : [];
  const nowMs = (frame / fps) * 1000 + scene.startMs;
  const count = lines.reduce((n, l) => n + l.length, 0);
  const hi = highlightIndexes(scene.text, scene.highlight);

  let current = words.findIndex((w) => nowMs >= w.s && nowMs <= w.e);
  if (current < 0) {
    current = words.reduce((last, w, i) => (nowMs >= w.s ? i : last), -1);
  }
  if (!words.length) current = Math.min(count - 1, Math.floor((frame / 8) % Math.max(1, count)));

  return (
    <TextShell fontSize={fs}>
      <LineRows
        lines={lines}
        renderWord={(word, i) => {
          const distance = Math.abs(i - current);
          const focus = distance === 0 ? 1 : distance === 1 ? 0.42 : 0.22;
          const isHi = hi.has(i);
          return wordSpan(
            word,
            {
              opacity: focus,
              transform: `translateY(${distance === 0 ? -6 : 0}px) scale(${distance === 0 ? 1.06 : 1})`,
              color: isHi ? THEME.accent : THEME.text,
              textShadow:
                distance === 0
                  ? `0 0 26px ${withAlpha(THEME.accent, 0.5)}, 0 4px 18px rgba(0,0,0,0.55)`
                  : undefined,
            },
            isHi && distance === 0 ? <Marker p={ease(frame, 0, 6)} /> : null,
          );
        }}
      />
    </TextShell>
  );
};

/** Pop: every word springs in with an overshoot; the highlight lands last. */
const Pop: React.FC<EffectProps> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);
  const hi = highlightIndexes(scene.text, scene.highlight);

  return (
    <TextShell fontSize={fs}>
      <LineRows
        lines={lines}
        renderWord={(word, i) => {
          const enter = spring({
            frame,
            fps,
            delay: i * 2.5,
            config: { damping: 9, stiffness: 200, mass: 0.6 },
          });
          const scale = interpolate(enter, [0, 1], [0.45, 1]);
          const isHi = hi.has(i);
          return wordSpan(
            word,
            {
              opacity: clamp(enter * 1.4, 0, 1),
              transform: `scale(${scale})`,
              color: isHi ? THEME.accent : undefined,
            },
            isHi ? <Underline p={ease(frame, i * 2.5 + 6, i * 2.5 + 14)} /> : null,
          );
        }}
      />
    </TextShell>
  );
};

const EFFECTS: Record<EffectName, React.FC<EffectProps>> = {
  "word-rise": WordRise,
  "line-mask": LineMask,
  slam: Slam,
  wave: Wave,
  typewriter: Typewriter,
  sweep: Sweep,
  karaoke: Karaoke,
  spotlight: Spotlight,
  pop: Pop,
};

/* ------------------------------------------------------------------ */
/* Scene wrapper + transitions                                         */
/* ------------------------------------------------------------------ */

const TRANSITIONS: TransitionName[] = ["slide-up", "wipe", "fade", "punch"];

const transitionFor = (index: number, effect: EffectName): TransitionName => {
  const offset = Math.max(0, EFFECTS_ORDER.indexOf(effect));
  return TRANSITIONS[(index + offset) % TRANSITIONS.length];
};

const CtaScene: React.FC<EffectProps> = ({ scene, fontSize }) => {
  const stage = useStage();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { lines, fontSize: fs } = layoutScene(scene.text, fontSize * 0.62, stage.usable);

  // Sheen that crosses the button every 2.6s.
  const period = Math.max(1, Math.round(fps * 2.6));
  const sweep = (frame % period) / period;
  const sheenX = interpolate(sweep, [0, 1], [-160, 260]);
  const pulse = 0.5 + 0.5 * Math.sin(frame / 9);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: stage.padX,
        paddingRight: stage.padX,
        paddingTop: stage.padTop,
        paddingBottom: Math.round(stage.padBottom * (470 / 520)),
        gap: Math.round(48 * stage.scale),
      }}
    >
      <div style={{ maxWidth: stage.usable, ...textStyle(fs, THEME.text) }}>
        {lines.map((line, li) => (
          <div key={li} style={{ whiteSpace: "nowrap" }}>
            {line.join(" ")}
          </div>
        ))}
      </div>

      <div
        style={{
          position: "relative",
          transform: `scale(${1 + 0.012 * pulse})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: Math.round(-8 * stage.scale),
            borderRadius: 999,
            border: `2px solid ${withAlpha(THEME.accent, 0.35 + 0.25 * pulse)}`,
            opacity: 0.8,
          }}
        />
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            gap: Math.round(18 * stage.scale),
            padding: `${Math.round(26 * stage.scale)}px ${Math.round(50 * stage.scale)}px`,
            borderRadius: 999,
            background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.muted})`,
            boxShadow: `0 ${Math.round(18 * stage.scale)}px ${Math.round(64 * stage.scale)}px ${withAlpha(
              THEME.accent,
              0.45,
            )}`,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "40%",
              left: `${sheenX}%`,
              background:
                "linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 100%)",
            }}
          />
          <div style={{ fontSize: fs * 0.72, lineHeight: 1, color: "#0b0b0b" }}>▶</div>
          <div
            style={{
              position: "relative",
              fontSize: fs * 0.6,
              fontWeight: 900,
              letterSpacing: "0.01em",
              color: "#0b0b0b",
              fontFamily: FONT_FAMILY,
              whiteSpace: "nowrap",
            }}
          >
            Theo dõi {BRAND}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SceneLayer: React.FC<{ scene: Scene; index: number; total: number }> = ({
  scene,
  index,
  total,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stage = useStage();
  const lengthMs = Math.max(400, scene.endMs - scene.startMs);
  const lengthFrames = Math.max(1, Math.round((lengthMs / 1000) * fps));

  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 130, mass: 0.8 } });
  const outFrames = Math.min(8, Math.max(3, Math.round(lengthFrames * 0.12)));
  const exit = total > 1 && index < total - 1 ? ease(frame, lengthFrames - outFrames, lengthFrames) : 0;
  const effectName = effectForScene(scene);
  const kind: TransitionName =
    CFG.transition && CFG.transition !== "auto"
      ? CFG.transition
      : transitionFor(index, effectName);

  let opacity = 1;
  let transform = "none";
  let clipPath: string | undefined;

  if (kind === "fade") {
    opacity = enter;
  } else if (kind === "slide-up") {
    opacity = enter;
    transform = `translateY(${Math.round((1 - enter) * 110)}px)`;
  } else if (kind === "wipe") {
    clipPath = `inset(${Math.round((1 - enter) * 100)}% 0% 0% 0%)`;
  } else {
    opacity = enter;
    transform = `scale(${1 + 0.06 * (1 - enter)})`;
  }

  // camera drift keeps the frame alive without softening the glyphs
  const drift = interpolate(frame, [0, lengthFrames], [1, 1.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const Effect = EFFECTS[effectName] ?? WordRise;
  const isHook = scene.kind === "hook" || index === 0;
  const fontSize = fitFontSize(scene.text) * (isHook ? 1.06 : 1) * stage.scale;

  return (
    <AbsoluteFill style={{ opacity: opacity * (1 - exit), transform, clipPath }}>
      <AbsoluteFill style={{ transform: `scale(${drift})` }}>
        {scene.kind === "cta" ? (
          <CtaScene scene={scene} fontSize={fontSize} />
        ) : (
          <Effect scene={scene} fontSize={fontSize} />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Chrome: brand + counter + progress                                  */
/* ------------------------------------------------------------------ */

const Equalizer: React.FC<{ frame: number; scale: number }> = ({ frame, scale }) => (
  <div style={{ display: "flex", alignItems: "flex-end", gap: Math.round(3 * scale), height: Math.round(22 * scale) }}>
    {[0, 1, 2].map((i) => {
      const h = 0.35 + 0.65 * Math.abs(Math.sin(frame / 7 + i * 1.7));
      return (
        <div
          key={i}
          style={{
            width: Math.max(2, Math.round(4 * scale)),
            height: Math.round(22 * scale * h),
            borderRadius: 99,
            background: THEME.accent,
            opacity: 0.95,
          }}
        />
      );
    })}
  </div>
);

const Chrome: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const stage = useStage();
  const scenes = CFG.scenes;
  const timed = hasTimings(scenes);
  const ms = (frame / fps) * 1000;
  const totalMs = CFG.totalMs || (durationInFrames / fps) * 1000;
  const overall = clamp(ms / Math.max(1, totalMs), 0, 1);

  let index = 0;
  if (timed) {
    const found = scenes.findIndex((s) => ms >= s.startMs && ms < s.endMs);
    index = found >= 0 ? found : ms < scenes[0].startMs ? 0 : scenes.length - 1;
  }

  const top = Math.round(stage.padTop * 0.5);
  const barBottom = Math.round(stage.padBottom * (420 / 520));
  const chipStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: Math.round(12 * stage.scale),
    padding: `${Math.round(10 * stage.scale)}px ${Math.round(18 * stage.scale)}px`,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
  };

  return (
    <>
      {CHROME.brand && (
        <div style={{ position: "absolute", top, left: stage.padX, ...chipStyle }}>
          <Equalizer frame={frame} scale={stage.scale} />
          <div
            style={{
              fontSize: Math.round(28 * stage.scale),
              fontWeight: 700,
              letterSpacing: "0.02em",
              color: "rgba(255,255,255,0.9)",
              fontFamily: FONT_FAMILY,
            }}
          >
            {BRAND}
          </div>
        </div>
      )}

      {CHROME.counter && (
        <div
          style={{
            position: "absolute",
            top,
            right: stage.padX,
            ...chipStyle,
          }}
        >
          <div
            style={{
              fontSize: Math.round(24 * stage.scale),
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.78)",
              fontFamily: FONT_FAMILY,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {String(index + 1).padStart(2, "0")}
            <span style={{ opacity: 0.5 }}> / {String(scenes.length).padStart(2, "0")}</span>
          </div>
        </div>
      )}

      {CHROME.progress && (
        <div
          style={{
            position: "absolute",
            left: stage.padX,
            right: stage.padX,
            bottom: barBottom,
            display: "flex",
            gap: Math.round(6 * stage.scale),
            height: Math.max(3, Math.round(6 * stage.scale)),
          }}
        >
          {timed ? (
            scenes.map((s, i) => {
              const fill =
                i < index ? 1 : i > index ? 0 : clamp((ms - s.startMs) / Math.max(1, s.endMs - s.startMs), 0, 1);
              return (
                <div
                  key={i}
                  style={{
                    flex: Math.max(1, s.endMs - s.startMs),
                    borderRadius: 99,
                    background: "rgba(255,255,255,0.16)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${fill * 100}%`,
                      height: "100%",
                      borderRadius: 99,
                      background: `linear-gradient(90deg, ${THEME.accent}, ${THEME.muted})`,
                    }}
                  />
                </div>
              );
            })
          ) : (
            <div style={{ flex: 1, borderRadius: 99, background: "rgba(255,255,255,0.16)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${overall * 100}%`,
                  height: "100%",
                  borderRadius: 99,
                  background: `linear-gradient(90deg, ${THEME.accent}, ${THEME.muted})`,
                }}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Root composition                                                    */
/* ------------------------------------------------------------------ */

export const Video: React.FC = () => {
  const { fps } = useVideoConfig();
  const scenes = CFG.scenes;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {CFG.hasAudio !== false && <Audio src={staticFile("voiceover.mp3")} />}
      <Background scenes={scenes} />
      {scenes.map((scene, i) => {
        const from = Math.round((scene.startMs / 1000) * fps);
        const to = Math.round((scene.endMs / 1000) * fps);
        const durationInFrames = Math.max(1, to - from);
        return (
          <Sequence
            key={`${i}-${scene.startMs}`}
            from={from}
            durationInFrames={durationInFrames}
            name={`Scene ${i + 1}`}
          >
            <SceneLayer scene={scene} index={i} total={scenes.length} />
          </Sequence>
        );
      })}
      <Chrome />
    </AbsoluteFill>
  );
};

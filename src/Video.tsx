import React from "react";
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
import rawConfig from "./video-config.json";
import { FONT_FAMILY } from "./fonts";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Word = { t: string; s: number; e: number };

type Scene = {
  text: string;
  highlight?: string;
  startMs: number;
  endMs: number;
  kind?: "hook" | "body" | "cta";
  words?: Word[];
};

type Theme = { id: string; bg: string[]; text: string; accent: string; muted: string };
type EffectName =
  | "word-rise"
  | "line-mask"
  | "slam"
  | "wave"
  | "typewriter"
  | "sweep"
  | "karaoke";

type VideoConfig = {
  theme: Theme;
  effect: EffectName;
  brand: string;
  scenes: Scene[];
  totalMs: number;
  hasAudio?: boolean;
};

const CFG = rawConfig as unknown as VideoConfig;
const THEME = CFG.theme;
const BRAND = CFG.brand || "Văn Hỉ Official";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const ease = (f: number, from: number, to: number, a = 0, b = 1) =>
  interpolate(f, [from, to], [a, b], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
const highlightSet = (highlight?: string) =>
  new Set(splitWords(highlight || "").map(stripMarks).filter(Boolean));

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
 * speech), shrink the type a little if one phrase still overflows, and only
 * wrap inside a phrase as a last resort.
 */
const layoutScene = (
  text: string,
  base: number,
  usable: number = USABLE_WIDTH,
): { lines: string[][]; fontSize: number } => {
  const phrases = splitPhrases(text);
  const blocks = phrases.length ? phrases : [splitWords(text)];

  // Measure the widest phrase at the base size, then scale the type down
  // exactly as far as needed. Width scales linearly with font size, so one
  // measurement is enough.
  let longestText = "";
  for (const block of blocks) {
    const joined = block.join(" ");
    if (joined.length > longestText.length) longestText = joined;
  }

  const needed = measureWidth(longestText, base);
  const fontSize = Math.max(
    Math.min(MIN_FONT_SIZE, base),
    Math.min(base, Math.floor((base * usable) / Math.max(1, needed))),
  );

  const lines: string[][] = [];
  for (const block of blocks) {
    if (measureWidth(block.join(" "), fontSize) <= usable) {
      lines.push(block);
    } else {
      lines.push(...wrapToWidth(block, fontSize, usable));
    }
  }
  return { lines, fontSize };
};

/** layoutScene measured against the real stage width of this render. */
const useSceneLayout = (text: string, base: number) => {
  const stage = useStage();
  return layoutScene(text, base, stage.usable);
};

/** Heavy weight, tight tracking, thin dark edge: stays crisp on a phone. */
const textStyle = (fontSize: number, color: string): React.CSSProperties => ({
  fontSize,
  fontWeight: 900,
  lineHeight: 1.18,
  letterSpacing: "-0.02em",
  color,
  textAlign: "center",
  fontFamily: FONT_FAMILY,
  WebkitTextStroke: "1.5px rgba(0,0,0,0.45)",
  paintOrder: "stroke fill",
  textShadow: "0 2px 6px rgba(0,0,0,0.5)",
});

/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const stage = useStage();
  const t = frame / Math.max(1, durationInFrames);

  const orbA = interpolate(t, [0, 1], [0.9, 1.08]);
  const orbB = interpolate(t, [0, 1], [1.08, 0.92]);
  const drift = Math.sin(frame / (fps * 3)) * 18;

  const c0 = THEME.bg[0] ?? "#000000";
  const c1 = THEME.bg[1] ?? c0;
  const c2 = THEME.bg[2] ?? c1;

  return (
    <AbsoluteFill style={{ backgroundColor: c0, overflow: "hidden" }}>
      <AbsoluteFill
        style={{ background: `linear-gradient(160deg, ${c0} 0%, ${c1} 52%, ${c2} 100%)` }}
      />
      <div
        style={{
          position: "absolute",
          width: Math.round(760 * stage.scale),
          height: Math.round(760 * stage.scale),
          borderRadius: "50%",
          left: "50%",
          top: "18%",
          transform: `translate(-50%, 0) translateY(${drift}px) scale(${orbA})`,
          // No CSS blur filter here: it was re-rasterised every frame and was
          // the single most expensive thing in the render. A radial gradient
          // with a soft alpha falloff looks the same and costs nothing.
          background: `radial-gradient(circle, ${THEME.accent}44 0%, transparent 72%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: Math.round(620 * stage.scale),
          height: Math.round(620 * stage.scale),
          borderRadius: "50%",
          right: "-14%",
          bottom: "12%",
          transform: `scale(${orbB})`,
          background: `radial-gradient(circle, ${THEME.muted}2e 0%, transparent 74%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 90% at 50% 45%, transparent 45%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

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
      ...style,
    }}
  >
    {word}
    {extra}
  </span>
);

const Underline: React.FC<{ p: number }> = ({ p }) => (
  <span
    style={{
      position: "absolute",
      left: 0,
      right: 0,
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

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

const WordRise: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hi = highlightSet(scene.highlight);
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
          const isHi = hi.has(stripMarks(word));
          return wordSpan(
            word,
            {
              opacity: enter,
              transform: `translateY(${y}px)`,
              color: isHi ? THEME.accent : undefined,
            },
            isHi ? <Underline p={ease(frame, 10 + i * 3, 24 + i * 3)} /> : null
          );
        }}
      />
    </TextShell>
  );
};

const LineMask: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const p = ease(frame, 0, 20);
  const y = Math.round(interpolate(p, [0, 1], [26, 0]));
  const reveal = interpolate(p, [0, 1], [100, 0]);
  const hi = highlightSet(scene.highlight);
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);

  return (
    <TextShell
      fontSize={fs}
      clipPath={`inset(0% 0% ${reveal}% 0%)`}
      transform={`translateY(${y}px)`}
    >
      <LineRows
        lines={lines}
        renderWord={(word) =>
          wordSpan(word, { color: hi.has(stripMarks(word)) ? THEME.accent : undefined })
        }
      />
    </TextShell>
  );
};

const Slam: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drop = spring({ frame, fps, config: { damping: 11, stiffness: 150, mass: 1.1 } });
  const y = Math.round(interpolate(drop, [0, 1], [-380, 0]));
  const sc = interpolate(drop, [0, 0.85, 1], [1.14, 1.14, 1]);
  const flash = interpolate(frame, [5, 9, 16], [0, 0.14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const hi = highlightSet(scene.highlight);
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);

  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity: flash }} />
      <TextShell fontSize={fs} transform={`translateY(${y}px) scale(${sc})`}>
        <LineRows
          lines={lines}
          renderWord={(word) =>
            wordSpan(word, { color: hi.has(stripMarks(word)) ? THEME.accent : undefined })
          }
        />
      </TextShell>
    </>
  );
};

const Wave: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
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
                      color: THEME.accent,
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

const Typewriter: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
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

const Sweep: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const hi = highlightSet(scene.highlight);
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);
  const totalWords = lines.reduce((n, l) => n + l.length, 0);
  const cursor = Math.floor(ease(frame, 4, 4 + totalWords * 6, -1, totalWords - 0.01));

  return (
    <TextShell fontSize={fs}>
      <LineRows
        lines={lines}
        renderWord={(word, i) => {
          const active = i <= cursor;
          const isHi = hi.has(stripMarks(word));
          return wordSpan(
            word,
            {
              opacity: active ? 1 : 0.3,
              color: active && isHi ? THEME.accent : undefined,
              transform: active ? "translateY(0px)" : "translateY(4px)",
            },
            active && isHi ? <Underline p={ease(frame, i * 6, i * 6 + 10)} /> : null
          );
        }}
      />
    </TextShell>
  );
};

/**
 * Karaoke: the whole line sits dim on screen and each word lights up at the
 * moment the voice reaches it (timings come from prepare.py).
 */
const Karaoke: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { lines, fontSize: fs } = useSceneLayout(scene.text, fontSize);
  const nowMs = (frame / fps) * 1000 + scene.startMs;
  const words = scene.words && scene.words.length ? scene.words : [];

  return (
    <TextShell fontSize={fs}>
      <LineRows
        lines={lines}
        renderWord={(word, i) => {
          const w = words[i];
          const p = w ? clamp((nowMs - w.s) / Math.max(70, w.e - w.s), 0, 1) : 1;
          const active = p > 0 && p < 1;
          return wordSpan(word, {
            color: `rgba(255,255,255,${0.34 + 0.66 * p})`,
            transform: `translateY(${active ? -3 : 0}px) scale(${1 + 0.05 * Math.sin(p * Math.PI)})`,
            textShadow: active
              ? `0 0 18px ${THEME.accent}, 0 2px 6px rgba(0,0,0,0.5)`
              : "0 2px 6px rgba(0,0,0,0.5)",
          });
        }}
      />
    </TextShell>
  );
};

const EFFECTS: Record<EffectName, React.FC<{ scene: Scene; fontSize: number }>> = {
  "word-rise": WordRise,
  "line-mask": LineMask,
  slam: Slam,
  wave: Wave,
  typewriter: Typewriter,
  sweep: Sweep,
  karaoke: Karaoke,
};

/* ------------------------------------------------------------------ */
/* Scene wrapper + transitions                                         */
/* ------------------------------------------------------------------ */

type TransitionName = "fade" | "slide-up" | "wipe" | "punch";

const TRANSITIONS: TransitionName[] = ["slide-up", "wipe", "fade", "punch"];

const transitionFor = (index: number): TransitionName => {
  const keys = Object.keys(EFFECTS);
  const offset = Math.max(0, keys.indexOf(CFG.effect));
  return TRANSITIONS[(index + offset) % TRANSITIONS.length];
};

const CtaScene: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const stage = useStage();
  const { lines, fontSize: fs } = layoutScene(scene.text, fontSize * 0.62, stage.usable);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: stage.padX,
        paddingRight: stage.padX,
        paddingTop: stage.padTop,
        paddingBottom: Math.round(stage.padBottom * (470 / 520)),
        gap: Math.round(44 * stage.scale),
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
          display: "flex",
          alignItems: "center",
          gap: Math.round(18 * stage.scale),
          padding: `${Math.round(26 * stage.scale)}px ${Math.round(46 * stage.scale)}px`,
          borderRadius: 999,
          background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.muted})`,
          boxShadow: `0 18px 60px ${THEME.accent}55`,
        }}
      >
        <div style={{ fontSize: fs * 0.72, lineHeight: 1 }}>▶</div>
        <div
          style={{
            fontSize: fs * 0.62,
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
  const exit = total > 1 && index < total - 1 ? ease(frame, lengthFrames - 6, lengthFrames) : 0;
  const kind = transitionFor(index);

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

  const Effect = EFFECTS[CFG.effect] ?? WordRise;
  const isHook = scene.kind === "hook" || index === 0;
  const fontSize = fitFontSize(scene.text) * (isHook ? 1.06 : 1) * stage.scale;

  return (
    <AbsoluteFill
      style={{ opacity: opacity * (1 - exit), transform, clipPath }}
    >
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
/* Chrome: brand + progress                                            */
/* ------------------------------------------------------------------ */

const Chrome: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const stage = useStage();
  const p = clamp(frame / Math.max(1, durationInFrames - 1), 0, 1);

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: Math.round(stage.padTop * 0.5),
          left: stage.padX,
          display: "flex",
          alignItems: "center",
          gap: Math.round(14 * stage.scale),
          opacity: 0.92,
        }}
      >
        <div
          style={{
            width: Math.round(10 * stage.scale),
            height: Math.round(10 * stage.scale),
            borderRadius: 99,
            background: THEME.accent,
            boxShadow: `0 0 12px ${THEME.accent}`,
          }}
        />
        <div
          style={{
            fontSize: Math.round(30 * stage.scale),
            fontWeight: 700,
            letterSpacing: "0.02em",
            color: "rgba(255,255,255,0.82)",
            fontFamily: FONT_FAMILY,
          }}
        >
          {BRAND}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: stage.padX,
          right: stage.padX,
          bottom: Math.round(stage.padBottom * (420 / 520)),
          height: Math.max(2, Math.round(6 * stage.scale)),
          borderRadius: 99,
          background: "rgba(255,255,255,0.16)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${p * 100}%`,
            height: "100%",
            borderRadius: 99,
            background: `linear-gradient(90deg, ${THEME.accent}, ${THEME.muted})`,
          }}
        />
      </div>
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
      <Background />
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

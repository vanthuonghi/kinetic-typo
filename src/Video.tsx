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

const wrapWords = (words: string[], limit: number): string[][] => {
  const out: string[][] = [];
  let cur: string[] = [];
  let used = 0;
  for (const w of words) {
    const add = cur.length ? w.length + 1 : w.length;
    if (cur.length && used + add > limit) {
      out.push(cur);
      cur = [w];
      used = w.length;
    } else {
      cur.push(w);
      used += add;
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
const layoutScene = (text: string, base: number): { lines: string[][]; fontSize: number } => {
  const phrases = splitPhrases(text);
  if (!phrases.length) return { lines: [splitWords(text)], fontSize: base };

  const usable = 900;
  const charW = 0.545;
  const longest = Math.max(...phrases.map((p) => p.join(" ").length));
  const fit = Math.floor(usable / Math.max(1, longest * charW));
  const fontSize = Math.max(46, Math.min(base, fit));
  const limit = Math.floor(usable / (fontSize * charW));

  const lines: string[][] = [];
  for (const phrase of phrases) {
    const len = phrase.join(" ").length;
    if (len <= limit) {
      lines.push(phrase);
    } else {
      const parts = Math.ceil(len / limit);
      lines.push(...wrapWords(phrase, Math.ceil(len / parts) + 1));
    }
  }
  return { lines, fontSize };
};

/** Heavy weight, tight tracking, thin dark edge: stays crisp on a phone. */
const textStyle = (fontSize: number, color: string): React.CSSProperties => ({
  fontSize,
  fontWeight: 900,
  lineHeight: 1.18,
  letterSpacing: "-0.02em",
  color,
  textAlign: "center",
  fontFamily: "'Helvetica Neue', 'Segoe UI', Roboto, 'Noto Sans', Arial, sans-serif",
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
          width: 760,
          height: 760,
          borderRadius: "50%",
          left: "50%",
          top: "18%",
          transform: `translate(-50%, 0) translateY(${drift}px) scale(${orbA})`,
          background: `radial-gradient(circle, ${THEME.accent}44 0%, transparent 68%)`,
          filter: "blur(70px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 620,
          height: 620,
          borderRadius: "50%",
          right: "-14%",
          bottom: "12%",
          transform: `scale(${orbB})`,
          background: `radial-gradient(circle, ${THEME.muted}2e 0%, transparent 70%)`,
          filter: "blur(80px)",
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
}> = ({ children, fontSize, opacity = 1, transform, clipPath }) => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "center",
      paddingLeft: 84,
      paddingRight: 84,
      paddingTop: 300,
      paddingBottom: 520,
    }}
  >
    <div
      style={{
        maxWidth: 912,
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
  const { lines, fontSize: fs } = layoutScene(scene.text, fontSize);

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
  const { lines, fontSize: fs } = layoutScene(scene.text, fontSize);

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
  const { lines, fontSize: fs } = layoutScene(scene.text, fontSize);

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
  const { lines, fontSize: fs } = layoutScene(scene.text, fontSize);

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
  const { lines, fontSize: fs } = layoutScene(scene.text, fontSize);

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
  const { lines, fontSize: fs } = layoutScene(scene.text, fontSize);
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
  const { lines, fontSize: fs } = layoutScene(scene.text, fontSize);
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
  const { lines, fontSize: fs } = layoutScene(scene.text, fontSize * 0.62);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        paddingLeft: 84,
        paddingRight: 84,
        paddingTop: 300,
        paddingBottom: 470,
        gap: 44,
      }}
    >
      <div style={{ maxWidth: 912, ...textStyle(fs, THEME.text) }}>
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
          gap: 18,
          padding: "26px 46px",
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
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
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
  const fontSize = fitFontSize(scene.text) * (isHook ? 1.06 : 1);

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
  const p = clamp(frame / Math.max(1, durationInFrames - 1), 0, 1);

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 150,
          left: 84,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: 0.92,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 99,
            background: THEME.accent,
            boxShadow: `0 0 12px ${THEME.accent}`,
          }}
        />
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "0.02em",
            color: "rgba(255,255,255,0.82)",
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
          }}
        >
          {BRAND}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 84,
          right: 84,
          bottom: 420,
          height: 6,
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

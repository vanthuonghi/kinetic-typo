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

type Scene = {
  text: string;
  highlight?: string;
  startMs: number;
  endMs: number;
};

type Theme = {
  id: string;
  bg: string[];
  text: string;
  accent: string;
  muted: string;
};

type EffectName =
  | "word-rise"
  | "line-mask"
  | "slam"
  | "wave"
  | "typewriter"
  | "sweep";

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
  if (n <= 66) return 68;
  if (n <= 84) return 60;
  return 54;
};

const stripAccent = (w: string) => w.replace(/[.,!?;:…"'()]/g, "").toLowerCase();

const splitWords = (text: string) => text.trim().split(/\s+/).filter(Boolean);

const highlightSet = (highlight?: string): Set<string> =>
  new Set(splitWords(highlight || "").map(stripAccent).filter(Boolean));

/** Text stays razor sharp: heavy weight, tight tracking, thin dark edge, no big blur. */
const textStyle = (fontSize: number, color: string): React.CSSProperties => ({
  fontSize,
  fontWeight: 900,
  lineHeight: 1.16,
  letterSpacing: "-0.02em",
  color,
  textAlign: "center",
  fontFamily:
    "Inter, 'Helvetica Neue', 'Segoe UI', Roboto, 'Noto Sans', Arial, sans-serif",
  WebkitTextStroke: "1.5px rgba(0,0,0,0.45)",
  paintOrder: "stroke fill",
  textShadow: "0 2px 6px rgba(0,0,0,0.55)",
});

/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

const Background: React.FC<{ fps: number }> = ({ fps }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / Math.max(1, durationInFrames);

  const orbA = interpolate(t, [0, 1], [0.92, 1.06]);
  const orbB = interpolate(t, [0, 1], [1.06, 0.94]);
  const drift = Math.sin(frame / (fps * 3)) * 18;

  const [c0, c1, c2] = [
    THEME.bg[0] ?? "#000000",
    THEME.bg[1] ?? THEME.bg[0] ?? "#000000",
    THEME.bg[2] ?? THEME.bg[1] ?? "#000000",
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: c0, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(160deg, ${c0} 0%, ${c1} 52%, ${c2} 100%)`,
        }}
      />

      {/* soft light pools – background only, never over the text plane */}
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

      {/* vignette keeps the centre calm and readable */}
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
/* Text shell – shared typography for every effect                     */
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

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

const HighlightUnderline: React.FC<{ progress: number }> = ({ progress }) => (
  <span
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: -0.08,
      height: 0.09,
      borderRadius: 99,
      background: THEME.accent,
      transform: `scaleX(${clamp(progress, 0, 1)})`,
      transformOrigin: "left center",
      opacity: 0.95,
    }}
  />
);

const WordRise: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = splitWords(scene.text);
  const hi = highlightSet(scene.highlight);

  return (
    <TextShell fontSize={fontSize}>
      {words.map((word, i) => {
        const enter = spring({
          frame,
          fps,
          delay: i * 3,
          config: { damping: 14, stiffness: 130, mass: 0.7 },
        });
        const y = Math.round(interpolate(enter, [0, 1], [38, 0]));
        const isHi = hi.has(stripAccent(word));
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.26em",
              position: "relative",
              opacity: enter,
              transform: `translateY(${y}px)`,
              color: isHi ? THEME.accent : undefined,
            }}
          >
            {word}
            {isHi && <HighlightUnderline progress={ease(frame, 10 + i * 3, 24 + i * 3)} />}
          </span>
        );
      })}
    </TextShell>
  );
};

const LineMask: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const p = ease(frame, 0, 20);
  const y = Math.round(interpolate(p, [0, 1], [26, 0]));
  const reveal = interpolate(p, [0, 1], [100, 0]);

  const hi = highlightSet(scene.highlight);
  const words = splitWords(scene.text);

  return (
    <TextShell fontSize={fontSize} clipPath={`inset(0% 0% ${reveal}% 0%)`} transform={`translateY(${y}px)`}>
      {words.map((word, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            marginRight: "0.26em",
            color: hi.has(stripAccent(word)) ? THEME.accent : undefined,
          }}
        >
          {word}
        </span>
      ))}
    </TextShell>
  );
};

const Slam: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drop = spring({ frame, fps, config: { damping: 11, stiffness: 150, mass: 1.1 } });
  const y = Math.round(interpolate(drop, [0, 1], [-380, 0]));
  const sx = interpolate(drop, [0, 0.85, 1], [1.16, 1.16, 1]);
  const sy = interpolate(drop, [0, 0.85, 1], [0.86, 0.86, 1]);
  const flash = interpolate(frame, [5, 9, 16], [0, 0.16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const hi = highlightSet(scene.highlight);

  return (
    <>
      <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity: flash }} />
      <TextShell fontSize={fontSize} transform={`translateY(${y}px) scaleX(${sx}) scaleY(${sy})`}>
        {splitWords(scene.text).map((word, i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.24em",
              color: hi.has(stripAccent(word)) ? THEME.accent : undefined,
            }}
          >
            {word}
          </span>
        ))}
      </TextShell>
    </>
  );
};

const Wave: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = Array.from(scene.text);
  const size = Math.min(fontSize, Math.floor(1000 / Math.max(8, letters.length)) + 26);

  return (
    <TextShell fontSize={size}>
      <span style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center" }}>
        {letters.map((ch, i) => {
          const enter = spring({
            frame,
            fps,
            delay: i * 2,
            config: { damping: 13, stiffness: 150, mass: 0.6 },
          });
          const base = Math.round(interpolate(enter, [0, 1], [46, 0]));
          const wobble = enter >= 0.999 ? Math.sin((frame - i * 2) / 9) * 5 : 0;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                opacity: enter,
                transform: `translateY(${base + wobble}px)`,
                color: THEME.accent,
              }}
            >
              {ch === " " ? "\u00A0" : ch}
            </span>
          );
        })}
      </span>
    </TextShell>
  );
};

const Typewriter: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const chars = Math.floor(ease(frame, 2, 2 + scene.text.length * 1.6, 0, scene.text.length));
  const shown = scene.text.slice(0, chars);
  const caretOn = Math.floor(frame / 12) % 2 === 0;

  return (
    <TextShell fontSize={fontSize}>
      <span>{shown}</span>
      <span
        style={{
          display: "inline-block",
          width: Math.round(fontSize * 0.09),
          height: Math.round(fontSize * 0.92),
          background: THEME.accent,
          marginLeft: 6,
          verticalAlign: "-0.08em",
          opacity: caretOn ? 1 : 0,
        }}
      />
    </TextShell>
  );
};

const Sweep: React.FC<{ scene: Scene; fontSize: number }> = ({ scene, fontSize }) => {
  const frame = useCurrentFrame();
  const words = splitWords(scene.text);
  const cursor = Math.floor(ease(frame, 4, 4 + words.length * 6, -1, words.length - 0.01));
  const hi = highlightSet(scene.highlight);

  return (
    <TextShell fontSize={fontSize}>
      {words.map((word, i) => {
        const active = i <= cursor;
        const isHi = hi.has(stripAccent(word));
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.26em",
              position: "relative",
              opacity: active ? 1 : 0.32,
              color: active && isHi ? THEME.accent : undefined,
              transform: active ? "translateY(0px)" : "translateY(4px)",
            }}
          >
            {word}
            {active && isHi && (
              <HighlightUnderline progress={ease(frame, i * 6, i * 6 + 10)} />
            )}
          </span>
        );
      })}
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
};

/* ------------------------------------------------------------------ */
/* Scene wrapper                                                       */
/* ------------------------------------------------------------------ */

const SceneLayer: React.FC<{ scene: Scene; index: number; total: number }> = ({
  scene,
  index,
  total,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lengthMs = Math.max(400, scene.endMs - scene.startMs);
  const lengthFrames = Math.max(1, Math.round((lengthMs / 1000) * fps));

  const fadeIn = ease(frame, 0, 6);
  const fadeOut = total > 1 && index < total - 1 ? 1 - ease(frame, lengthFrames - 7, lengthFrames) : 1;
  const opacity = Math.min(fadeIn, fadeOut);

  // gentle camera drift keeps the frame alive without softening the glyphs
  const drift = interpolate(frame, [0, lengthFrames], [1, 1.025], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const Effect = EFFECTS[CFG.effect] ?? WordRise;
  const fontSize = fitFontSize(scene.text);

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ transform: `scale(${drift})` }}>
        <Effect scene={scene} fontSize={fontSize} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Chrome: progress bar + brand                                        */
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
          right: 84,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: 0.9,
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
            fontFamily: "Inter, Arial, sans-serif",
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

      <Background fps={fps} />

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

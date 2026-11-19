import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  BG,
  CFG,
  hasTimings,
  imageForScene,
  SCENES,
  Scene,
  THEME,
} from "./config";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Static turbulence tile: one 200x200 SVG that Chrome paints once and tiles.
 * Cheaper than a CSS filter and it never re-rasterises per frame.
 */
const GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
    '<filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>' +
    '<feColorMatrix type="saturate" values="0"/></filter>' +
    '<rect width="200" height="200" filter="url(#g)" opacity="0.55"/></svg>',
)}")`;

const ImageLayer: React.FC<{
  src: string;
  opacity: number;
  blur: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}> = ({ src, opacity, blur, scale, offsetX, offsetY }) => (
  <AbsoluteFill style={{ opacity }}>
    <Img
      src={staticFile(src)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        filter: `blur(${blur}px) saturate(1.1) brightness(0.92)`,
        transform: `scale(${scale}) translate(${offsetX}px, ${offsetY}px)`,
        willChange: "transform",
      }}
    />
  </AbsoluteFill>
);

/**
 * Background stack: theme gradient → blurred photo (with a cross-fade between
 * per-scene images) → colour glow → readability scrim → vignette → grain.
 */
export const Background: React.FC<{ scenes?: Scene[] }> = ({
  scenes = SCENES,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();
  const scale = width / 1080;
  const t = (frame / fps) * 1000;
  const timed = hasTimings(scenes);

  let index = 0;
  if (timed) {
    const found = scenes.findIndex((s) => t >= s.startMs && t < s.endMs);
    index = found >= 0 ? found : t < scenes[0].startMs ? 0 : scenes.length - 1;
  }

  const scene = scenes[index];
  const current = timed ? imageForScene(scene) : BG.image;
  const previous = timed && index > 0 ? imageForScene(scenes[index - 1]) : undefined;

  const totalMs = CFG.totalMs || (durationInFrames / fps) * 1000;
  const startMs = timed ? scene.startMs : 0;
  const durationMs = timed
    ? Math.max(1, scene.endMs - scene.startMs)
    : Math.max(1, totalMs);
  const elapsed = clamp(t - startMs, 0, durationMs);
  const progress = elapsed / durationMs;

  // Half a second of dissolve between two different photos.
  const cross = clamp(elapsed / 520, 0, 1);
  const fading = Boolean(previous && current && previous !== current);
  const currentOpacity = fading ? cross : index === 0 ? clamp(t / 340, 0, 1) : 1;

  // Ken Burns: slow push in, alternating sideways drift per scene so two
  // consecutive scenes never move in the same direction.
  const direction = index % 2 === 0 ? 1 : -1;
  const zoom = BG.kenBurns ? BG.zoom + 0.07 * progress : BG.zoom;
  const offsetX = BG.kenBurns ? direction * 18 * progress * scale : 0;
  const offsetY = BG.kenBurns ? -12 * progress * scale : 0;

  const c0 = THEME.bg[0] ?? "#000000";
  const c1 = THEME.bg[1] ?? c0;
  const c2 = THEME.bg[2] ?? c1;

  const drift = Math.sin(frame / (fps * 3)) * 18;
  const orbA = interpolate(progress, [0, 1], [1.02, 1.12]);
  const hasPhoto = Boolean(current || previous);

  return (
    <AbsoluteFill style={{ backgroundColor: c0, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(160deg, ${c0} 0%, ${c1} 52%, ${c2} 100%)`,
        }}
      />

      {previous && previous !== current && cross < 1 && (
        <ImageLayer
          src={previous}
          opacity={1 - cross}
          blur={BG.blur * scale}
          scale={zoom}
          offsetX={0}
          offsetY={0}
        />
      )}
      {current && (
        <ImageLayer
          src={current}
          opacity={currentOpacity}
          blur={BG.blur * scale}
          scale={zoom}
          offsetX={offsetX}
          offsetY={offsetY}
        />
      )}

      {hasPhoto && (
        <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${BG.darken})` }} />
      )}

      {/* Brand-coloured light so the photo still belongs to the theme. */}
      <div
        style={{
          position: "absolute",
          width: Math.round(820 * scale),
          height: Math.round(820 * scale),
          borderRadius: "50%",
          left: "50%",
          top: "10%",
          transform: `translate(-50%, 0) translateY(${drift}px) scale(${orbA})`,
          background: `radial-gradient(circle, ${THEME.accent}33 0%, transparent 72%)`,
          mixBlendMode: "screen",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: Math.round(660 * scale),
          height: Math.round(660 * scale),
          borderRadius: "50%",
          right: "-16%",
          bottom: "10%",
          background: `radial-gradient(circle, ${THEME.muted}22 0%, transparent 74%)`,
          mixBlendMode: "screen",
        }}
      />

      {hasPhoto && (
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.1) 24%, rgba(0,0,0,0.16) 62%, rgba(0,0,0,0.72) 100%)",
          }}
        />
      )}

      {/* Centre scrim: keeps 900-weight glyphs legible over a busy photo. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(76% 56% at 50% 47%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 72%)",
        }}
      />

      <AbsoluteFill
        style={{
          background: `radial-gradient(118% 88% at 50% 45%, transparent 38%, rgba(0,0,0,${BG.vignette}) 100%)`,
        }}
      />

      {BG.grain > 0 && (
        <AbsoluteFill
          style={{
            backgroundImage: GRAIN_URL,
            backgroundSize: `${Math.round(200 * scale)}px`,
            opacity: BG.grain,
            mixBlendMode: "overlay",
          }}
        />
      )}
    </AbsoluteFill>
  );
};

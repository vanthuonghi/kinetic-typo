import rawConfig from "./video-config.json";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Word = { t: string; s: number; e: number };

export type SceneKind = "hook" | "body" | "cta";

export type Scene = {
  text: string;
  highlight?: string;
  kind?: SceneKind;
  /** Optional background photo for this scene (path below `public/`). */
  image?: string;
  startMs: number;
  endMs: number;
  words?: Word[];
};

export type Theme = {
  id: string;
  bg: string[];
  text: string;
  accent: string;
  muted: string;
};

export type EffectName =
  | "karaoke"
  | "word-rise"
  | "line-mask"
  | "slam"
  | "wave"
  | "typewriter"
  | "sweep"
  | "spotlight"
  | "pop";

export type TransitionName = "fade" | "slide-up" | "wipe" | "punch";

/**
 * Photographic backdrop: a still image, blurred and slowly pushed in, sitting
 * behind the type. Everything is optional; with no `image` the animated
 * gradient background is used instead.
 */
export type BackgroundConfig = {
  /** Path below `public/`, e.g. "backgrounds/bg-bokeh.jpg". */
  image?: string;
  /** Blur radius in px on the 1080-wide reference frame. */
  blur?: number;
  /** Base zoom used to hide the soft blur edges. */
  zoom?: number;
  /** Slow push-in per scene. */
  kenBurns?: boolean;
  /** Flat black scrim over the photo (0-1). */
  darken?: number;
  /** Corner darkening (0-1). */
  vignette?: number;
  /** Film grain strength (0-1); 0 disables the layer. */
  grain?: number;
};

export type ChromeConfig = {
  brand?: boolean;
  counter?: boolean;
  progress?: boolean;
};

export type VideoConfig = {
  theme: Theme;
  effect: EffectName;
  brand: string;
  voice?: string;
  width?: number;
  height?: number;
  fps?: number;
  background?: BackgroundConfig;
  chrome?: ChromeConfig;
  /** "auto" alternates transitions per scene. */
  transition?: TransitionName | "auto";
  scenes: Scene[];
  totalMs: number;
  hasAudio?: boolean;
};

/* ------------------------------------------------------------------ */
/* Normalised config                                                   */
/* ------------------------------------------------------------------ */

const RAW = rawConfig as unknown as VideoConfig;

export const CFG = RAW;
export const THEME: Theme = RAW.theme;
export const BRAND = RAW.brand || "Văn Hỉ Official";
export const SCENES: Scene[] = RAW.scenes;

export const BG = {
  image: RAW.background?.image,
  blur: RAW.background?.blur ?? 24,
  zoom: RAW.background?.zoom ?? 1.14,
  kenBurns: RAW.background?.kenBurns ?? true,
  darken: RAW.background?.darken ?? 0.35,
  vignette: RAW.background?.vignette ?? 0.55,
  grain: RAW.background?.grain ?? 0.06,
};

export const CHROME: Required<ChromeConfig> = {
  brand: true,
  counter: true,
  progress: true,
  ...RAW.chrome,
};

/** Stable ordering so transition offsets never depend on object key order. */
export const EFFECTS_ORDER: EffectName[] = [
  "karaoke",
  "word-rise",
  "line-mask",
  "slam",
  "wave",
  "typewriter",
  "sweep",
  "spotlight",
  "pop",
];

/** Image for one scene, falling back to the global background photo. */
export const imageForScene = (scene?: Scene): string | undefined =>
  scene?.image || BG.image;

/** True when prepare.py has written real timings into the config. */
export const hasTimings = (scenes: Scene[]): boolean =>
  scenes.length > 0 &&
  scenes.every(
    (s) =>
      Number.isFinite(s.startMs) &&
      Number.isFinite(s.endMs) &&
      s.endMs > s.startMs,
  );

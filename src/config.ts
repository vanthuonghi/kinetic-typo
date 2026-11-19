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
  /** Overrides the video-wide effect for this scene only. */
  effect?: EffectName;
  /** Optional background photo for this scene (path below `public/`). */
  image?: string;
  startMs: number;
  endMs: number;
  words?: Word[];
  /** "whisper" when the timings were measured from the audio. */
  alignSource?: "whisper" | "estimate";
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

/** "auto" picks an effect per scene from its `kind`. */
export type EffectChoice = EffectName | "auto";

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

/**
 * Music bed mixed under the voice by `prepare.py` (via ffmpeg), ducked while
 * the narrator speaks. `track` is a path below `public/`.
 */
export type MusicConfig = {
  track?: string;
  /** Bed level relative to the voice, in dB. -20 is a safe starting point. */
  gainDb?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  /** Optional per-theme alternative, chosen by hand in the config. */
};

export type VideoConfig = {
  theme: Theme;
  effect: EffectChoice;
  brand: string;
  voice?: string;
  width?: number;
  height?: number;
  fps?: number;
  background?: BackgroundConfig;
  chrome?: ChromeConfig;
  music?: MusicConfig;
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
export const EFFECT: EffectChoice = RAW.effect || "word-rise";
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

export const MUSIC: MusicConfig = {
  gainDb: -20,
  fadeInMs: 900,
  fadeOutMs: 1800,
  ...RAW.music,
};

/**
 * Effect chosen from the scene's role when `effect` is "auto": the hook hits,
 * the body tracks the voice word by word, the call to action springs in.
 */
export const effectForKind = (kind?: SceneKind): EffectName =>
  kind === "hook" ? "slam" : kind === "cta" ? "pop" : "karaoke";

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

/** Resolve the effect for one scene: explicit override, then "auto", then global. */
export const effectForScene = (scene: Scene): EffectName =>
  scene.effect ?? (EFFECT === "auto" ? effectForKind(scene.kind) : EFFECT);

/** True when prepare.py has written real timings into the config. */
export const hasTimings = (scenes: Scene[]): boolean =>
  scenes.length > 0 &&
  scenes.every(
    (s) =>
      Number.isFinite(s.startMs) &&
      Number.isFinite(s.endMs) &&
      s.endMs > s.startMs,
  );

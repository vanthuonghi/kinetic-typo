import { continueRender, delayRender, staticFile } from "remotion";

/**
 * One explicit family for the whole project.
 *
 * Before this file existed the code asked for `Helvetica Neue, Segoe UI,
 * Roboto, Noto Sans` — none of which exist on the `ubuntu-latest` runner. The
 * Mac preview and the CI render therefore used different fonts, and the
 * character-width heuristic in Video.tsx drifted from reality. The font is
 * vendored in `public/fonts` so a render never depends on fonts.gstatic.com.
 */
export const FONT_FAMILY = "'Be Vietnam Pro', system-ui, sans-serif";

// Same ranges Google serves for these files, so Chrome picks the Vietnamese
// glyphs for "ế ộ ữ" and the Latin file for plain ASCII.
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const VIETNAMESE =
  "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB";

type FaceSpec = { file: string; weight: string; unicodeRange: string };

const FACES: FaceSpec[] = [
  { file: "BeVietnamPro-ExtraBold-latin.woff2", weight: "800", unicodeRange: LATIN },
  { file: "BeVietnamPro-ExtraBold-viet.woff2", weight: "800", unicodeRange: VIETNAMESE },
  { file: "BeVietnamPro-Black-latin.woff2", weight: "900", unicodeRange: LATIN },
  { file: "BeVietnamPro-Black-viet.woff2", weight: "900", unicodeRange: VIETNAMESE },
];

/**
 * Resolves once every face is registered. Remotion waits for the delayRender()
 * handle we hold here, so no frame is captured with a fallback font (which
 * would also poison the text measurements).
 */
export const fontsReady: Promise<void> = (() => {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  const handle = delayRender("Loading Be Vietnam Pro");

  return Promise.all(
    FACES.map(async ({ file, weight, unicodeRange }) => {
      const face = new FontFace(
        "Be Vietnam Pro",
        `url('${staticFile(`fonts/${file}`)}') format('woff2')`,
        { weight, unicodeRange },
      );
      const loaded = await face.load();
      document.fonts.add(loaded);
    }),
  )
    .then(() => undefined)
    .catch((err) => {
      console.warn("Be Vietnam Pro failed to load; falling back to system-ui", err);
    })
    .finally(() => {
      continueRender(handle);
    });
})();

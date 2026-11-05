import { Composition, registerRoot } from "remotion";
import { Video } from "./Video";
import rawConfig from "./video-config.json";

type Cfg = { totalMs?: number; fps?: number; width?: number; height?: number };
const CFG = rawConfig as unknown as Cfg;

const fps = CFG.fps ?? 30;
const totalMs = CFG.totalMs ?? 15000;

// Read the frame size from the config instead of hardcoding 9:16, so the same
// composition can render 9:16 / 4:5 / 1:1 / 16:9 without touching code.
const width = CFG.width ?? 1080;
const height = CFG.height ?? 1920;
const durationInFrames = Math.max(1, Math.ceil((totalMs / 1000) * fps) + 12);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Video"
        component={Video}
        durationInFrames={durationInFrames}
        fps={fps}
        width={width}
        height={height}
      />
    </>
  );
};

registerRoot(RemotionRoot);

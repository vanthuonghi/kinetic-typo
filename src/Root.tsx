import { Composition, registerRoot } from "remotion";
import { Video } from "./Video";
import rawConfig from "./video-config.json";

type Cfg = { totalMs?: number; fps?: number };
const CFG = rawConfig as unknown as Cfg;

const fps = CFG.fps ?? 30;
const totalMs = CFG.totalMs ?? 15000;
const durationInFrames = Math.max(1, Math.ceil((totalMs / 1000) * fps) + 12);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Video"
        component={Video}
        durationInFrames={durationInFrames}
        fps={fps}
        width={1080}
        height={1920}
      />
    </>
  );
};

registerRoot(RemotionRoot);

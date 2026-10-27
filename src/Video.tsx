import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

const VIDEO_CONFIG = { fps: 30, width: 1080, height: 1920, scenes: [
    {
        "text": "Phương pháp 80/20: 20% nỗ lực mang lại 80% kết quả",
        "highlight": "Phương",
        "duration": 3,
        "color": "#00d4ff"
    },
    {
        "text": "Tập trung vào việc quan trọng",
        "highlight": "việc",
        "duration": 3,
        "color": "#ffffff"
    },
    {
        "text": "Loại bỏ việc không cần thiết",
        "highlight": "thiết",
        "duration": 3,
        "color": "#00d4ff"
    },
    {
        "text": "Hiệu quả tăng gấp đôi",
        "highlight": "",
        "duration": 3,
        "color": "#ffffff"
    },
    {
        "text": "Đăng ký để học ngay",
        "highlight": "Đăng ký",
        "duration": 3,
        "color": "#ff006e"
    }
] };

const Word: React.FC<{ word: string; isHighlighted: boolean; index: number; baseFrame: number; fps: number }> = ({ word, isHighlighted, index, baseFrame, fps }) => {
  const delay = index * 3;
  const localFrame = Math.max(0, baseFrame - delay);
  const opacity = interpolate(localFrame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = spring({ frame: localFrame, fps, config: { damping: 14, stiffness: 120, mass: 0.5 } });
  const scale = interpolate(localFrame, [0, 20], [0.7, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <span
      style={{
        display: "inline-block",
        opacity,
        transform: `translateY(${(1 - y) * 40}px) scale(${scale})`,
        color: isHighlighted ? "#ff006e" : "inherit",
        fontWeight: isHighlighted ? 900 : 600,
        textShadow: isHighlighted ? "0 0 30px #ff006e80" : "none",
        marginRight: "0.25em",
      }}
    >
      {word}
    </span>
  );
};

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const gradientShift = interpolate(frame, [0, durationInFrames], [0, 360], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const orb1Y = spring({ frame, fps: 30, config: { damping: 10, stiffness: 30 } });
  const orb2Y = spring({ frame: frame + 100, fps: 30, config: { damping: 12, stiffness: 25 } });
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${gradientShift * 0.1}deg, #000814)`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, #ff006e33, transparent 70%)",
          top: "15%",
          left: "50%",
          transform: `translate(-50%, 0) translateY(${orb1Y * 60}px)`,
          filter: "blur(40px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, #00d4ff22, transparent 70%)",
          bottom: "25%",
          right: "10%",
          transform: `translateY(${orb2Y * 50}px)`,
          filter: "blur(50px)",
        }}
      />
    </AbsoluteFill>
  );
};

export const Video: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sceneDurationFrames = VIDEO_CONFIG.scenes[0].duration * fps;
  const currentIndex = Math.min(Math.floor(frame / sceneDurationFrames), VIDEO_CONFIG.scenes.length - 1);
  const currentScene = VIDEO_CONFIG.scenes[currentIndex];
  const localFrame = frame - currentIndex * sceneDurationFrames;
  const containerOpacity = interpolate(localFrame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const containerY = spring({ frame: localFrame, fps, config: { damping: 15, stiffness: 100 } });
  const exitProgress = currentIndex < VIDEO_CONFIG.scenes.length - 1
    ? interpolate(localFrame, [sceneDurationFrames - 15, sceneDurationFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const words = currentScene.text.split(" ");
  const highlightWords = currentScene.highlight ? currentScene.highlight.split(" ") : [];
  const progress = frame / durationInFrames;
  const progressWidth = interpolate(progress, [0, 1], ["0%", "100%"], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 60,
          opacity: 1 - exitProgress * 0.5,
          transform: `translateY(${(1 - containerY) * 30}px)`,
        }}
      >
        <div
          style={{
            fontSize: 70,
            fontWeight: 700,
            lineHeight: 1.3,
            textAlign: "center",
            maxWidth: 1000,
            fontFamily: "Inter, Arial, sans-serif",
            color: currentScene.color,
            textShadow: `0 0 40px ${currentScene.color}40, 0 4px 20px rgba(0,0,0,0.5)`,
          }}
        >
          {words.map((word, i) => (
            <Word key={i} word={word} isHighlighted={highlightWords.includes(word)} index={i} baseFrame={localFrame} fps={fps} />
          ))}
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 40,
          right: 40,
          height: 4,
          background: "rgba(255,255,255,0.1)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: progressWidth,
            height: "100%",
            background: "linear-gradient(90deg, #ff006e, #00d4ff)",
            borderRadius: 2,
            boxShadow: `0 0 10px #ff006e80`,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: 60,
          right: 60,
          fontSize: 24,
          color: "rgba(255,255,255,0.3)",
          fontFamily: "Inter, Arial, sans-serif",
          fontWeight: 600,
        }}
      >
        Văn Hỉ Official
      </div>
    </AbsoluteFill>
  );
};

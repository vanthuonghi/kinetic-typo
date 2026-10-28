import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

const VIDEO_CONFIG = { fps: 30, width: 1080, height: 1920, scenes: [
    {
        "text": "Thời gian là tài sản quý nhất",
        "highlight": "Thời",
        "duration": 3,
        "color": "#90e0ef"
    },
    {
        "text": "Mỗi ngày có 86400 giây",
        "highlight": "",
        "duration": 3,
        "color": "#ffffff"
    },
    {
        "text": "Bạn chi tiêu cho điều gì? Đầu tư vào sức khỏe, học tập, mối quan hệ",
        "highlight": "tiêu",
        "duration": 3,
        "color": "#90e0ef"
    },
    {
        "text": "Không bao giờ lấy lại được thời gian đã qua",
        "highlight": "gian",
        "duration": 3,
        "color": "#ffffff"
    },
    {
        "text": "Đăng ký để học ngay",
        "highlight": "Đăng ký",
        "duration": 3,
        "color": "#00b4d8"
    }
] };

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const SlideText = ({ text, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = spring({ frame, fps, from: 0, to: 1, durationInFrames: 25 });
  const slideX = spring({ frame, fps, from: 180, to: 0, durationInFrames: 30, config: { damping: 12, mass: 0.5 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `translateX(${slideX}px)`, opacity, textAlign: 'center' }}>
        <div style={{ color, fontSize: 76, fontWeight: 800, lineHeight: 1.2, fontFamily: 'Inter, Arial, sans-serif', textShadow: `0 0 40px ${color}40` }}>{text}</div>
      </div>
    </AbsoluteFill>
  );
};

const KineticSlam = ({ text, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drop = spring({ fps, frame, config: { damping: 12, stiffness: 80, mass: 1.5 } });
  const translateY = interpolate(drop, [0, 1], [-500, 0]);
  const scaleX = interpolate(drop, [0, 0.8, 1], [1, 1, 1.12], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scaleY = interpolate(drop, [0, 0.8, 1], [1, 1, 0.9], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const shock = interpolate(frame, [8, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ringScale = interpolate(shock, [0, 1], [0, 8]);
  const ringOpacity = interpolate(shock, [0, 0.3, 1], [0, 0.6, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flashOpacity = interpolate(frame, [6, 10, 18], [0, 0.25, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
      <AbsoluteFill style={{ backgroundColor: '#fff', opacity: flashOpacity }} />
      <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', border: `4px solid ${color}`, transform: `scale(${ringScale})`, opacity: ringOpacity }} />
      <div style={{ fontSize: 120, fontWeight: 900, fontFamily: 'Arial Black, Impact, sans-serif', color, textTransform: 'uppercase', letterSpacing: 10, transform: `translateY(${translateY}px) scaleX(${scaleX}) scaleY(${scaleY})`, textShadow: `0 4px 30px ${color}` }}>{text}</div>
    </AbsoluteFill>
  );
};

const KineticWave = ({ text, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = text.split('');
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d1117', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {letters.map((letter, i) => {
          const delay = i * 3;
          const entrance = spring({ fps, frame: Math.max(0, frame - delay), config: { damping: 10, stiffness: 100 } });
          const translateY = interpolate(entrance, [0, 1], [200, 0]);
          const opacity = interpolate(entrance, [0, 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const waveFrame = Math.max(0, frame - delay - 15);
          const waveY = Math.sin(waveFrame * 0.15) * 15 * Math.min(entrance, 1);
          const hue = (i * 30 + frame * 2) % 360;
          return (
            <span key={i} style={{ fontSize: 100, fontWeight: 800, fontFamily: "'Helvetica Neue', Arial, sans-serif", color: `hsl(${hue}, 80%, 65%)`, display: 'inline-block', transform: `translateY(${translateY + waveY}px)`, opacity, textShadow: `0 0 30px hsla(${hue}, 90%, 60%, 0.6)` }}>
              {letter === ' ' ? '\u00A0' : letter}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const TextGlitch = ({ text, color }) => {
  const frame = useCurrentFrame();
  const { random } = require('remotion');
  const entryProgress = clamp(frame / 20, 0, 1);
  const glitchActive = frame > 25 && random(`glitch-${frame}`) < 0.15;
  const offsetX = glitchActive ? (random(`gx-${frame}`) - 0.5) * 30 : 0;
  const offsetY = glitchActive ? (random(`gy-${frame}`) - 0.5) * 10 : 0;
  const skew = glitchActive ? (random(`gs-${frame}`) - 0.5) * 8 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, -50%) translate(${offsetX + 3}px, ${offsetY}px)`, fontSize: 120, fontWeight: 900, color: 'rgba(255,0,0,0.8)', mixBlendMode: 'screen', opacity: glitchActive ? 1 : 0 }}>{text}</div>
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, -50%) translate(${-offsetX - 3}px, ${-offsetY}px)`, fontSize: 120, fontWeight: 900, color: 'rgba(0,255,255,0.8)', mixBlendMode: 'screen', opacity: glitchActive ? 1 : 0 }}>{text}</div>
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) skewX(${skew}deg) scale(${entryProgress})`, fontSize: 120, fontWeight: 900, color }}>
        {text}
      </div>
      {glitchActive && (
        <AbsoluteFill style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)' }} />
      )}
    </AbsoluteFill>
  );
};

const TextTypewriter = ({ text, color }) => {
  const frame = useCurrentFrame();
  const charsToShow = clamp(Math.floor(frame / 3), 0, text.length);
  const displayText = text.slice(0, charsToShow);
  const cursorVisible = Math.floor(frame / 15) % 2 === 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 900, background: '#1e293b', borderRadius: 12, padding: 28, border: '1px solid #334155' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#27ca40' }} />
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 40, color }}>
          <span style={{ color: '#38bdf8' }}>$ </span>
          {displayText}
          <span style={{ display: 'inline-block', width: 18, height: 40, background: color || '#38bdf8', marginLeft: 4, opacity: cursorVisible ? 1 : 0 }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const TextHighlight = ({ text, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(' ');
  const framesPerWord = Math.floor(fps * 0.8);
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #0f172a, #1e293b)', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, maxWidth: 900, padding: 40 }}>
        {words.map((word, i) => {
          const wordStart = i * framesPerWord;
          const progress = clamp((frame - wordStart) / (framesPerWord * 0.6), 0, 1);
          return (
            <span key={i} style={{ position: 'relative', display: 'inline-block', fontSize: 56, fontWeight: 700, color: '#fff', padding: '4px 10px' }}>
              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, background: `linear-gradient(135deg, ${color}, #a855f7)`, borderRadius: 6, opacity: progress > 0 ? 0.9 : 0, zIndex: 0 }} />
              <span style={{ position: 'relative', zIndex: 1 }}>{word}</span>
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Background = ({ theme }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const gradientShift = interpolate(frame, [0, durationInFrames], [0, 360], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const orb1Y = spring({ frame, fps: 30, config: { damping: 10, stiffness: 30 } });
  const orb2Y = spring({ frame: frame + 100, fps: 30, config: { damping: 12, stiffness: 25 } });
  const themes = {
    'gradient-purple': { bg: 'linear-gradient(135deg, #1e1b4b, #4c1d95)', orb1: '#a855f733', orb2: '#7c3aed22' },
    'dark-minimal': { bg: '#0a0a0a', orb1: '#ffffff10', orb2: '#ffffff08' },
    'neon-blue': { bg: '#000000', orb1: '#00ffea20', orb2: '#0066ff18' },
    'warm-orange': { bg: 'linear-gradient(135deg, #7c2d12, #9a3412)', orb1: '#ff7b0025', orb2: '#ff450018' },
    'green-tech': { bg: 'linear-gradient(135deg, #022c22, #064e3b)', orb1: '#00ff8833', orb2: '#00ff8822' },
    'luxury-gold': { bg: 'linear-gradient(135deg, #3b1f0b, #5c2d0e)', orb1: '#ffd70033', orb2: '#ffd70022' },
    'ocean-blue': { bg: 'linear-gradient(135deg, #082f49, #075985)', orb1: '#38bdf830', orb2: '#0ea5e922' },
    'pink-modern': { bg: 'linear-gradient(135deg, #4c0519, #9d174d)', orb1: '#ec489933', orb2: '#db277722' },
  };
  const t = themes[theme] || themes['luxury-gold'];
  return (
    <AbsoluteFill style={{ background: t.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: `radial-gradient(circle, ${t.orb1}, transparent 70%)`, top: '15%', left: '50%', transform: `translate(-50%, 0) translateY(${orb1Y * 60}px)`, filter: 'blur(40px)' }} />
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${t.orb2}, transparent 70%)`, bottom: '25%', right: '10%', transform: `translateY(${orb2Y * 50}px)`, filter: 'blur(50px)' }} />
    </AbsoluteFill>
  );
};

export const Video = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sceneDurationFrames = VIDEO_CONFIG.scenes[0].duration * fps;
  const currentIndex = Math.min(Math.floor(frame / sceneDurationFrames), VIDEO_CONFIG.scenes.length - 1);
  const currentScene = VIDEO_CONFIG.scenes[currentIndex];
  const localFrame = frame - currentIndex * sceneDurationFrames;
  const containerOpacity = interpolate(localFrame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const containerY = spring({ frame: localFrame, fps, config: { damping: 15, stiffness: 100 } });
  const exitProgress = currentIndex < VIDEO_CONFIG.scenes.length - 1
    ? interpolate(localFrame, [sceneDurationFrames - 15, sceneDurationFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 0;
  const progress = frame / durationInFrames;
  const progressWidth = interpolate(progress, [0, 1], ['0%', '100%'], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const effects = [SlideText, KineticSlam, KineticWave, TextGlitch, TextTypewriter, TextHighlight];
  const EffectComponent = effects[currentIndex % effects.length];
  return (
    <AbsoluteFill>
      <Background theme='ocean-blue' />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: 60,
          opacity: 1 - exitProgress * 0.5,
          transform: `translateY(${(1 - containerY) * 30}px)`,
        }}
      >
        <EffectComponent text={currentScene.text} color={currentScene.color} />
      </AbsoluteFill>

      <div style={{
        position: 'absolute',
        bottom: 40,
        left: 40,
        right: 40,
        height: 4,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: progressWidth,
          height: '100%',
          background: 'linear-gradient(90deg, #ffeb3b, #ffd700)',
          borderRadius: 2,
          boxShadow: `0 0 10px #ffeb3b80`,
        }} />
      </div>

      <div style={{
        position: 'absolute',
        top: 60,
        right: 60,
        fontSize: 24,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: 'Inter, Arial, sans-serif',
        fontWeight: 600,
      }}>
        Văn Hỉ Official
      </div>
    </AbsoluteFill>
  );
};
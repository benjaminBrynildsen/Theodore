import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from 'remotion';

const WORDS = ['impulse', 'inspiration', 'intention', 'insight', 'idea'];

const FadeIn = ({ children, from, duration, y = 0 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [from, from + duration], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  const translateY = interpolate(frame, [from, from + duration], [y, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  return <div style={{ opacity, transform: `translateY(${translateY}px)` }}>{children}</div>;
};

const WordCycle = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Each word shows for ~18 frames, cycling through
  const wordDuration = 18;
  const totalFrames = WORDS.length * wordDuration;
  const cycleFrame = Math.min(frame, totalFrames - 1);
  const wordIndex = Math.min(Math.floor(cycleFrame / wordDuration), WORDS.length - 1);
  const wordFrame = cycleFrame % wordDuration;

  const isLast = wordIndex === WORDS.length - 1;

  // Fade in/out for each word (except last which stays)
  const opacity = isLast
    ? interpolate(wordFrame, [0, 8], [0, 1], { extrapolateRight: 'clamp' })
    : interpolate(wordFrame, [0, 6, 12, 18], [0, 1, 1, 0], { extrapolateRight: 'clamp' });

  const translateY = interpolate(wordFrame, [0, 8], [10, 0], { extrapolateRight: 'clamp' });

  return (
    <span
      style={{
        display: 'inline-block',
        opacity,
        transform: `translateY(${translateY}px)`,
        color: isLast ? '#c8a97e' : '#e8ddd0',
        fontStyle: 'italic',
        minWidth: '7ch',
        textAlign: 'center',
      }}
    >
      {WORDS[wordIndex]}
    </span>
  );
};

export const TheodorePromo = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Fade out near the end
  const fadeOut = interpolate(frame, [durationInFrames - 20, durationInFrames - 5], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Subtle vignette pulse
  const vignetteOpacity = interpolate(Math.sin(frame / 40), [-1, 1], [0.3, 0.5]);

  // Book icon spring
  const iconScale = spring({ frame, fps, config: { damping: 14, stiffness: 70 } });
  const iconOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // Line expand
  const lineWidth = interpolate(frame, [30, 65], [0, 220], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#f6f6f4',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Georgia, "Times New Roman", serif',
        opacity: fadeOut,
      }}
    >
      {/* Subtle vignette */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignetteOpacity}) 100%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Book icon */}
      <div
        style={{
          opacity: iconOpacity,
          transform: `scale(${iconScale})`,
          marginBottom: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 28, opacity: 0.4 }}>📖</span>
        <span
          style={{
            fontSize: 22,
            fontWeight: '600',
            letterSpacing: '-0.02em',
            color: '#111',
          }}
        >
          Theodore
        </span>
      </div>

      {/* Tag */}
      <FadeIn from={10} duration={20} y={8}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontWeight: '700',
            color: 'rgba(0,0,0,0.3)',
            marginBottom: 32,
            fontFamily: 'Helvetica Neue, Arial, sans-serif',
          }}
        >
          ✦ Story Engine
        </div>
      </FadeIn>

      {/* Hero headline */}
      <FadeIn from={20} duration={25} y={20}>
        <div
          style={{
            textAlign: 'center',
            lineHeight: 1.08,
            fontSize: 68,
            fontWeight: '500',
            color: '#111',
            letterSpacing: '-0.025em',
            marginBottom: 12,
          }}
        >
          All you need
        </div>
      </FadeIn>

      <FadeIn from={28} duration={25} y={15}>
        <div
          style={{
            textAlign: 'center',
            lineHeight: 1.08,
            fontSize: 68,
            fontWeight: '500',
            color: '#111',
            letterSpacing: '-0.025em',
            marginBottom: 16,
          }}
        >
          is an
        </div>
      </FadeIn>

      {/* Animated word */}
      <Sequence from={36}>
        <div
          style={{
            fontSize: 68,
            fontWeight: '500',
            letterSpacing: '-0.025em',
            marginBottom: 40,
            minHeight: '1.15em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WordCycle />
        </div>
      </Sequence>

      {/* Divider */}
      <div
        style={{
          width: lineWidth,
          height: 1,
          backgroundColor: 'rgba(0,0,0,0.15)',
          marginBottom: 32,
        }}
      />

      {/* Features */}
      <FadeIn from={70} duration={25} y={12}>
        <div
          style={{
            display: 'flex',
            gap: 48,
            fontFamily: 'Helvetica Neue, Arial, sans-serif',
          }}
        >
          {['AI-Powered Writing', 'Living Canon', 'Idea to Published'].map((f, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{f}</div>
            </div>
          ))}
        </div>
      </FadeIn>

      {/* CTA */}
      <FadeIn from={90} duration={25} y={10}>
        <div
          style={{
            marginTop: 44,
            padding: '14px 36px',
            backgroundColor: '#111',
            borderRadius: 6,
            fontFamily: 'Helvetica Neue, Arial, sans-serif',
            fontSize: 15,
            fontWeight: '500',
            color: '#fff',
            letterSpacing: '0.02em',
          }}
        >
          theodore.tools
        </div>
      </FadeIn>
    </AbsoluteFill>
  );
};

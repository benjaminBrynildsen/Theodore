import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const GermaniaPromo = ({ headline, subtext, accentColor, bgColor, tagline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Logo fade + scale in
  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const logoOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  // Headline slide up
  const headlineY = interpolate(frame, [15, 45], [60, 0], { extrapolateRight: 'clamp' });
  const headlineOpacity = interpolate(frame, [15, 45], [0, 1], { extrapolateRight: 'clamp' });

  // Subtext fade in
  const subtextOpacity = interpolate(frame, [40, 65], [0, 1], { extrapolateRight: 'clamp' });

  // Divider line expand
  const lineWidth = interpolate(frame, [50, 80], [0, 300], { extrapolateRight: 'clamp' });

  // Tagline fade in
  const taglineOpacity = interpolate(frame, [75, 100], [0, 1], { extrapolateRight: 'clamp' });

  // Subtle background pulse
  const bgPulse = interpolate(
    Math.sin(frame / 30),
    [-1, 1],
    [0.97, 1.0]
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Georgia, serif',
      }}
    >
      {/* Background texture overlay */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, rgba(139,69,19,0.15) 0%, transparent 70%)`,
          transform: `scale(${bgPulse})`,
        }}
      />

      {/* Logo / Brand mark */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          marginBottom: 40,
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            border: `4px solid ${accentColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(139,69,19,0.2)',
          }}
        >
          <span style={{ fontSize: 56 }}>☕</span>
        </div>
      </div>

      {/* Headline */}
      <div
        style={{
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
          textAlign: 'center',
          padding: '0 60px',
        }}
      >
        <h1
          style={{
            color: '#fff',
            fontSize: 72,
            fontWeight: 'bold',
            margin: 0,
            letterSpacing: '0.02em',
            textShadow: `0 2px 20px rgba(139,69,19,0.6)`,
            lineHeight: 1.1,
          }}
        >
          {headline}
        </h1>
      </div>

      {/* Divider */}
      <div
        style={{
          width: lineWidth,
          height: 2,
          backgroundColor: accentColor,
          margin: '28px auto',
          borderRadius: 2,
        }}
      />

      {/* Subtext */}
      <div style={{ opacity: subtextOpacity, textAlign: 'center' }}>
        <p
          style={{
            color: accentColor,
            fontSize: 30,
            margin: 0,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          {subtext}
        </p>
      </div>

      {/* Tagline */}
      <div style={{ opacity: taglineOpacity, marginTop: 40, textAlign: 'center' }}>
        <p
          style={{
            color: 'rgba(255,255,255,0.55)',
            fontSize: 22,
            margin: 0,
            fontStyle: 'italic',
            letterSpacing: '0.08em',
          }}
        >
          {tagline}
        </p>
      </div>
    </AbsoluteFill>
  );
};

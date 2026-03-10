import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
} from 'remotion';

// ─── Design tokens (pulled from real site) ───────────────────────────────────
const BG = '#f6f6f4';
const BLACK = '#111111';
const GRAY_MID = 'rgba(0,0,0,0.38)';
const GRAY_LIGHT = 'rgba(0,0,0,0.13)';
const SERIF = '"Georgia", "Times New Roman", serif';
const SANS = '"Helvetica Neue", "Arial", sans-serif';

// ─── Timing (frames @ 30fps) ─────────────────────────────────────────────────
const T = {
  NAV_IN: 0,
  BADGE_IN: 12,
  HEADLINE_IN: 22,
  WORD_CYCLE_START: 44,
  BODY_IN: 110,
  CTA_IN: 128,
  CARDS_IN: 148,
  TOTAL: 270,
};

const WORDS = ['impulse', 'inspiration', 'intention', 'insight', 'idea'];
const WORD_HOLD = 16; // frames per word

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ease = (frame, from, to, easing = Easing.out(Easing.cubic)) =>
  interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

const FadeUp = ({ children, startFrame, duration = 22, distance = 24 }) => {
  const frame = useCurrentFrame();
  const p = ease(frame, startFrame, startFrame + duration);
  return (
    <div style={{
      opacity: p,
      transform: `translateY(${(1 - p) * distance}px)`,
    }}>
      {children}
    </div>
  );
};

// ─── Word Cycle ───────────────────────────────────────────────────────────────
const WordCycle = () => {
  const frame = useCurrentFrame();

  const totalCycleFrames = WORDS.length * WORD_HOLD;
  const clampedFrame = Math.min(frame, totalCycleFrames - 1);
  const wordIndex = Math.min(Math.floor(clampedFrame / WORD_HOLD), WORDS.length - 1);
  const wordFrame = clampedFrame % WORD_HOLD;
  const isLast = wordIndex === WORDS.length - 1;

  const opacity = isLast
    ? ease(wordFrame, 0, 10)
    : interpolate(wordFrame, [0, 5, 10, 16], [0, 1, 1, 0], { extrapolateRight: 'clamp' });

  const y = interpolate(wordFrame, [0, 7], [14, 0], { extrapolateRight: 'clamp' });

  return (
    <span style={{
      display: 'inline-block',
      opacity,
      transform: `translateY(${y}px)`,
      color: isLast ? BLACK : BLACK,
      fontStyle: 'italic',
      fontWeight: 400,
    }}>
      {WORDS[wordIndex]}
    </span>
  );
};

// ─── Feature Card ─────────────────────────────────────────────────────────────
const FeatureCard = ({ icon, title, desc, delay }) => {
  const frame = useCurrentFrame();
  const p = ease(frame, T.CARDS_IN + delay, T.CARDS_IN + delay + 22);
  return (
    <div style={{
      opacity: p,
      transform: `translateY(${(1 - p) * 20}px)`,
      backgroundColor: 'white',
      borderRadius: 12,
      border: `1px solid ${GRAY_LIGHT}`,
      padding: '28px 24px',
      width: 260,
      boxSizing: 'border-box',
    }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: '#f0f0ee',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
        fontSize: 18,
      }}>
        {icon}
      </div>
      <div style={{
        fontFamily: SANS,
        fontSize: 14,
        fontWeight: 600,
        color: BLACK,
        marginBottom: 6,
        letterSpacing: '-0.01em',
      }}>
        {title}
      </div>
      <div style={{
        fontFamily: SANS,
        fontSize: 12,
        color: GRAY_MID,
        lineHeight: 1.55,
      }}>
        {desc}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const TheodorePromoV2 = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Global fade out
  const fadeOut = interpolate(frame, [durationInFrames - 18, durationInFrames - 4], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // Nav
  const navOpacity = ease(frame, T.NAV_IN, T.NAV_IN + 18);

  // Badge
  const badgeOpacity = ease(frame, T.BADGE_IN, T.BADGE_IN + 16);

  // CTA button
  const ctaP = ease(frame, T.CTA_IN, T.CTA_IN + 22);
  const ctaScale = interpolate(ctaP, [0, 1], [0.94, 1]);

  // Divider line
  const lineWidth = interpolate(frame, [T.HEADLINE_IN + 10, T.HEADLINE_IN + 50], [0, 480], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const features = [
    { icon: '✦', title: 'AI-Powered Writing', desc: 'Premium models craft prose that sounds like you, not a machine.' },
    { icon: '◈', title: 'Living Canon', desc: 'Characters, lore, and locations that stay consistent across every chapter.' },
    { icon: '▶', title: 'Idea to Published', desc: 'From first spark to Amazon KDP — one seamless pipeline.' },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: BG, opacity: fadeOut, overflow: 'hidden' }}>

      {/* ── Nav ── */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 72,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 52px',
        opacity: navOpacity,
        borderBottom: `1px solid ${GRAY_LIGHT}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📖</span>
          <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: BLACK, letterSpacing: '-0.02em' }}>
            Theodore
          </span>
        </div>
        <span style={{ fontFamily: SANS, fontSize: 13, color: GRAY_MID, fontWeight: 500 }}>
          Sign in
        </span>
      </div>

      {/* ── Main content ── */}
      <div style={{
        position: 'absolute',
        top: 72, left: 0, right: 0, bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 80px',
        gap: 0,
      }}>

        {/* Badge */}
        <div style={{
          opacity: badgeOpacity,
          fontFamily: SANS,
          fontSize: 11,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: GRAY_MID,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{ fontSize: 9 }}>✦</span>
          Story Engine
        </div>

        {/* Headline */}
        <FadeUp startFrame={T.HEADLINE_IN} duration={24} distance={28}>
          <div style={{
            fontFamily: SERIF,
            fontSize: 82,
            fontWeight: 500,
            color: BLACK,
            letterSpacing: '-0.03em',
            lineHeight: 1.0,
            textAlign: 'center',
            marginBottom: 4,
          }}>
            All you need is an
          </div>
        </FadeUp>

        {/* Animated word */}
        <div style={{
          fontFamily: SERIF,
          fontSize: 82,
          fontWeight: 500,
          color: BLACK,
          letterSpacing: '-0.03em',
          lineHeight: 1.08,
          textAlign: 'center',
          height: 96,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 28,
        }}>
          <Sequence from={T.WORD_CYCLE_START}>
            <WordCycle />
          </Sequence>
        </div>

        {/* Thin divider */}
        <div style={{
          width: lineWidth,
          height: 1,
          backgroundColor: GRAY_LIGHT,
          marginBottom: 28,
        }} />

        {/* Body copy */}
        <FadeUp startFrame={T.BODY_IN} duration={22} distance={16}>
          <div style={{
            fontFamily: SANS,
            fontSize: 17,
            color: GRAY_MID,
            textAlign: 'center',
            maxWidth: 540,
            lineHeight: 1.6,
            fontWeight: 400,
            marginBottom: 32,
          }}>
            Theodore turns your story ideas into fully realized novels — with AI that understands your characters, your world, and your voice.
          </div>
        </FadeUp>

        {/* CTA */}
        <div style={{
          opacity: ctaP,
          transform: `scale(${ctaScale})`,
          marginBottom: 14,
        }}>
          <div style={{
            backgroundColor: BLACK,
            color: 'white',
            fontFamily: SANS,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '0.01em',
            padding: '14px 32px',
            borderRadius: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}>
            Start Writing →
          </div>
        </div>

        {/* CTA microcopy */}
        <FadeUp startFrame={T.CTA_IN + 8} duration={20} distance={8}>
          <div style={{
            fontFamily: SANS,
            fontSize: 11,
            color: GRAY_MID,
            letterSpacing: '0.02em',
          }}>
            Free to start · No credit card required
          </div>
        </FadeUp>

        {/* Feature cards */}
        <div style={{
          display: 'flex',
          gap: 16,
          marginTop: 44,
        }}>
          {features.map((f, i) => (
            <FeatureCard key={i} {...f} delay={i * 12} />
          ))}
        </div>

      </div>
    </AbsoluteFill>
  );
};

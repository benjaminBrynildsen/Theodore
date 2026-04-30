import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';

// ─── Tokens ─────────────────────────────────────────────────────────────────
const BG = '#f6f6f4';
const INK = '#111111';
const MUTED = 'rgba(17,17,17,0.55)';
const HAIR = 'rgba(17,17,17,0.10)';
const SERIF = '"Georgia", "Times New Roman", serif';
const SANS = '"Helvetica Neue", "Inter", "Arial", sans-serif';

// ─── Acts (frames @ 30fps, total 540) ───────────────────────────────────────
const ACT = {
  INTRO_START: 0,        // logo
  INTRO_OUT: 78,
  HERO_IN: 78,           // headline
  HERO_OUT: 168,
  SHOW_IN: 165,          // tools-hub zooms
  SHOW_OUT: 470,
  OUTRO_IN: 465,         // CTA
  END: 540,
};

// ─── Easing helpers ─────────────────────────────────────────────────────────
const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

const lerp = (frame, from, to, easing = easeOut) =>
  interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

const fadeWindow = (frame, inStart, inEnd, outStart, outEnd) => {
  const a = lerp(frame, inStart, inEnd);
  const b = 1 - lerp(frame, outStart, outEnd);
  return Math.min(a, b);
};

// ─── Logo (T mark in rounded square) ────────────────────────────────────────
const TMark = ({ size = 96, dark = true }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.22,
      backgroundColor: dark ? INK : '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark
        ? '0 12px 30px -8px rgba(17,17,17,0.35)'
        : '0 6px 20px -6px rgba(17,17,17,0.18)',
    }}
  >
    <svg viewBox="0 0 64 64" width={size * 0.62} height={size * 0.62}>
      <path
        d="M14 18h36v8H36v25h-8V26H14z"
        fill={dark ? '#f9fafb' : INK}
      />
    </svg>
  </div>
);

// ─── Act 1: Brand intro ─────────────────────────────────────────────────────
const Intro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 110, mass: 0.9 },
    durationInFrames: 40,
  });

  const wordmarkP = lerp(frame, 22, 50);
  const taglineP = lerp(frame, 38, 64);

  // Exit: scale up slightly + fade
  const exitP = lerp(frame, ACT.INTRO_OUT - 14, ACT.INTRO_OUT);
  const groupOpacity = 1 - exitP;
  const groupScale = 1 + exitP * 0.06;
  const groupY = -exitP * 14;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: groupOpacity,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          transform: `translateY(${groupY}px) scale(${groupScale})`,
        }}
      >
        <div
          style={{
            transform: `scale(${0.2 + logoSpring * 0.8}) rotate(${(1 - logoSpring) * -8}deg)`,
            opacity: logoSpring,
            marginBottom: 28,
          }}
        >
          <TMark size={132} />
        </div>

        <div
          style={{
            opacity: wordmarkP,
            transform: `translateY(${(1 - wordmarkP) * 18}px)`,
            fontFamily: SERIF,
            fontSize: 86,
            fontWeight: 500,
            color: INK,
            letterSpacing: '-0.035em',
            lineHeight: 1,
          }}
        >
          Theodore
        </div>

        <div
          style={{
            opacity: taglineP,
            transform: `translateY(${(1 - taglineP) * 10}px)`,
            fontFamily: SANS,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: MUTED,
            marginTop: 18,
          }}
        >
          Story Engine
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Act 2: Hero headline ───────────────────────────────────────────────────
const Hero = () => {
  const frame = useCurrentFrame(); // local to <Sequence>
  const { fps } = useVideoConfig();

  const inP = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 90, mass: 0.8 },
    durationInFrames: 30,
  });

  const subP = lerp(frame, 18, 44);
  const lineP = interpolate(frame, [16, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeInOut,
  });

  const exit = lerp(frame, 70, 90);

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 1 - exit,
        transform: `translateY(${-exit * 18}px)`,
      }}
    >
      <div
        style={{
          fontFamily: SANS,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: MUTED,
          marginBottom: 26,
          opacity: inP,
        }}
      >
        ✦ Built for novelists
      </div>

      <div
        style={{
          fontFamily: SERIF,
          fontSize: 92,
          fontWeight: 500,
          color: INK,
          letterSpacing: '-0.035em',
          lineHeight: 1.02,
          textAlign: 'center',
          opacity: inP,
          transform: `translateY(${(1 - inP) * 22}px)`,
        }}
      >
        From idea
        <br />
        to bestseller.
      </div>

      <div
        style={{
          width: 320 * lineP,
          height: 1,
          backgroundColor: HAIR,
          marginTop: 36,
          marginBottom: 28,
        }}
      />

      <div
        style={{
          opacity: subP,
          transform: `translateY(${(1 - subP) * 12}px)`,
          fontFamily: SANS,
          fontSize: 19,
          color: MUTED,
          maxWidth: 620,
          textAlign: 'center',
          lineHeight: 1.55,
        }}
      >
        Sixteen AI tools. One quiet workspace.
      </div>
    </AbsoluteFill>
  );
};

// ─── Act 3: Tools-hub Ken Burns showcase ────────────────────────────────────
// Each "stop" defines a focal region inside the 1440x900 source image
// expressed in normalized coords (0..1). We map that region to fill the
// 1080x1080 viewport, then drift to the next stop with smooth easing.
const STOPS = [
  // Wide establishing — full hub
  { cx: 0.55, cy: 0.45, zoom: 1.05, label: 'Theodore' },
  // Toolbox icon + "Theodore Tools" title
  { cx: 0.59, cy: 0.22, zoom: 1.85, label: 'Sixteen tools. One workspace.' },
  // Planning row — Series Bible / Relationships / World Wiki / Name Generator
  { cx: 0.59, cy: 0.42, zoom: 2.05, label: 'Plan your world' },
  // Mid row — Timeline / Story Arc / Scene Beats
  { cx: 0.59, cy: 0.58, zoom: 2.05, label: 'Living canon, every detail' },
  // Writing/Editing row — Pacing / Chapter Recap / First Reader
  { cx: 0.59, cy: 0.75, zoom: 2.05, label: 'Find your rhythm' },
  // Pull all the way back
  { cx: 0.55, cy: 0.45, zoom: 1.0,  label: 'Idea → published novel' },
];

const STOP_FRAMES = 60; // frames per segment (1 stop -> next)
const HOLD_FRAMES = 12; // hold at each stop before easing to next

const Showcase = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Source image native size (1440 x 900). We render it at a base size that
  // covers the 1080x1080 viewport when zoom = 1.0.
  const VIEW = 1080;
  const IMG_W = 1440;
  const IMG_H = 900;
  const baseScale = VIEW / IMG_H; // cover by height (1.2)

  // Continuous interpolation between stops with hold.
  const totalFrames = (STOPS.length - 1) * STOP_FRAMES;
  const t = Math.min(frame, totalFrames);
  const segmentLen = STOP_FRAMES;
  const segIndex = Math.min(Math.floor(t / segmentLen), STOPS.length - 2);
  const segLocal = t - segIndex * segmentLen;
  // Hold for first HOLD_FRAMES, then ease through the rest
  const moveLen = segmentLen - HOLD_FRAMES;
  const moveLocal = Math.max(0, segLocal - HOLD_FRAMES);
  const p = interpolate(moveLocal, [0, moveLen], [0, 1], {
    extrapolateRight: 'clamp',
    easing: easeInOut,
  });

  const a = STOPS[segIndex];
  const b = STOPS[segIndex + 1];
  const cx = a.cx + (b.cx - a.cx) * p;
  const cy = a.cy + (b.cy - a.cy) * p;
  const zoom = a.zoom + (b.zoom - a.zoom) * p;

  // Subtle constant drift on top of the Ken Burns interpolation
  const driftX = Math.sin(frame / 60) * 6;
  const driftY = Math.cos(frame / 70) * 4;

  const scale = baseScale * zoom;
  const renderedW = IMG_W * scale;
  const renderedH = IMG_H * scale;

  // Translate so that (cx, cy) of the image lands at the viewport center.
  const tx = VIEW / 2 - cx * renderedW + driftX;
  const ty = VIEW / 2 - cy * renderedH + driftY;

  // Whole-act fade in/out
  const actOpacity = fadeWindow(frame, 0, 22, ACT.SHOW_OUT - ACT.SHOW_IN - 24, ACT.SHOW_OUT - ACT.SHOW_IN);

  // Caption: appears for current stop, fades on transition
  const captionLocal = segLocal;
  const captionOpacity = interpolate(
    captionLocal,
    [0, 12, segmentLen - 14, segmentLen - 2],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp' }
  );
  const captionY = interpolate(captionLocal, [0, 14], [16, 0], {
    extrapolateRight: 'clamp',
    easing: easeOut,
  });

  return (
    <AbsoluteFill style={{ opacity: actOpacity, backgroundColor: BG }}>
      {/* The image, positioned via translate + scale */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: VIEW,
          height: VIEW,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
            transformOrigin: '0 0',
            width: IMG_W,
            height: IMG_H,
            // Soft shadow to lift the screenshot off the page
            filter: 'drop-shadow(0 30px 60px rgba(17,17,17,0.18))',
          }}
        >
          <Img
            src={staticFile('screenshots/tools-hub.png')}
            style={{
              width: IMG_W,
              height: IMG_H,
              display: 'block',
              borderRadius: 0,
            }}
          />
        </div>

        {/* Vignette */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(120% 90% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.18) 100%)',
          }}
        />

        {/* Top-left brand chip */}
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            backgroundColor: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(8px)',
            border: `1px solid ${HAIR}`,
            padding: '8px 14px 8px 10px',
            borderRadius: 999,
          }}
        >
          <TMark size={22} />
          <span
            style={{
              fontFamily: SERIF,
              fontSize: 16,
              fontWeight: 600,
              color: INK,
              letterSpacing: '-0.02em',
            }}
          >
            Theodore
          </span>
        </div>

        {/* Caption strip */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 36,
            display: 'flex',
            justifyContent: 'center',
            opacity: captionOpacity,
            transform: `translateY(${captionY}px)`,
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(17,17,17,0.92)',
              color: 'white',
              padding: '14px 22px',
              borderRadius: 12,
              fontFamily: SANS,
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              boxShadow: '0 18px 40px -12px rgba(17,17,17,0.45)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: '#9ae6a4',
              }}
            />
            {b.label}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Act 4: Outro CTA ───────────────────────────────────────────────────────
const Outro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bgP = lerp(frame, 0, 22);

  const logoSpring = spring({
    frame: frame - 4,
    fps,
    config: { damping: 16, stiffness: 100 },
    durationInFrames: 32,
  });

  const titleP = lerp(frame, 18, 44);
  const ctaP = lerp(frame, 30, 56);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: `rgba(17,17,17,${bgP})`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ opacity: bgP, transform: `scale(${0.6 + logoSpring * 0.4})` }}>
        <TMark size={92} dark={false} />
      </div>

      <div
        style={{
          opacity: titleP,
          transform: `translateY(${(1 - titleP) * 16}px)`,
          fontFamily: SERIF,
          fontSize: 76,
          fontWeight: 500,
          color: 'white',
          letterSpacing: '-0.035em',
          marginTop: 30,
        }}
      >
        theodore.tools
      </div>

      <div
        style={{
          opacity: titleP,
          fontFamily: SANS,
          fontSize: 16,
          color: 'rgba(255,255,255,0.6)',
          letterSpacing: '0.04em',
          marginTop: 14,
        }}
      >
        From idea to bestseller.
      </div>

      <div
        style={{
          opacity: ctaP,
          transform: `translateY(${(1 - ctaP) * 14}px)`,
          marginTop: 38,
          backgroundColor: 'white',
          color: INK,
          fontFamily: SANS,
          fontSize: 16,
          fontWeight: 600,
          padding: '14px 30px',
          borderRadius: 999,
          letterSpacing: '0.01em',
        }}
      >
        Start writing — free →
      </div>
    </AbsoluteFill>
  );
};

// ─── Root ───────────────────────────────────────────────────────────────────
export const TheodorePromoV3 = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Global fade out at very end
  const masterFadeOut = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames - 1],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: BG, opacity: masterFadeOut, overflow: 'hidden' }}>
      {/* Persistent subtle paper texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(80% 60% at 50% 30%, rgba(0,0,0,0.03), rgba(0,0,0,0) 70%)',
          pointerEvents: 'none',
        }}
      />

      <Sequence from={ACT.INTRO_START} durationInFrames={ACT.INTRO_OUT - ACT.INTRO_START + 12}>
        <Intro />
      </Sequence>

      <Sequence from={ACT.HERO_IN} durationInFrames={ACT.HERO_OUT - ACT.HERO_IN}>
        <Hero />
      </Sequence>

      <Sequence from={ACT.SHOW_IN} durationInFrames={ACT.SHOW_OUT - ACT.SHOW_IN}>
        <Showcase />
      </Sequence>

      <Sequence from={ACT.OUTRO_IN} durationInFrames={ACT.END - ACT.OUTRO_IN}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};

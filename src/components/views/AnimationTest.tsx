import { useState } from 'react';
import { Headphones, Play, Loader2, Check, Sparkles, BookOpen, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

export function AnimationTest() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 sm:p-10 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-serif font-bold mb-2">Animation Lab</h1>
        <p className="text-white/40 text-sm mb-10">10 premium button + progress bar animations for Theodore</p>

        <div className="space-y-16">
          <Demo1_MorphingButton />
          <Demo2_GlassProgressBar />
          <Demo3_VercelShimmerButton />
          <Demo4_PulseBreathButton />
          <Demo5_StripeGradientProgress />
          <Demo6_AppleIndeterminate />
          <Demo7_SkeletonShimmer />
          <Demo11_BlobBar />
          <Demo12_LiquidBlob />
          <Demo8_SpringButton />
          <Demo9_GlowBorderButton />
          <Demo10_MorphingText />
        </div>

        <div className="mt-20 mb-10 text-center text-white/20 text-xs">Theodore Animation Lab</div>
      </div>
    </div>
  );
}

function SectionLabel({ num, title, desc }: { num: number; title: string; desc: string }) {
  return (
    <div className="mb-6">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1">#{num}</div>
      <h2 className="text-lg font-semibold text-white mb-1">{title}</h2>
      <p className="text-sm text-white/40">{desc}</p>
    </div>
  );
}

// ── 1. Morphing / Liquid Button ──
function Demo1_MorphingButton() {
  const [loading, setLoading] = useState(false);
  const toggle = () => { setLoading(true); setTimeout(() => setLoading(false), 3000); };
  return (
    <div>
      <SectionLabel num={1} title="Morphing Button" desc="Shrinks to circle on click, breathes while loading" />
      <div className="flex gap-4 items-center">
        <button
          onClick={toggle}
          className={cn(
            'relative font-medium text-sm text-white overflow-hidden transition-all duration-500',
            loading
              ? 'w-12 h-12 rounded-full bg-white/10 animate-[liquidBreathe_2s_ease-in-out_infinite] p-0'
              : 'px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 min-w-[160px]'
          )}
          style={{ transitionTimingFunction: 'cubic-bezier(0.65, 0, 0.35, 1)' }}
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          ) : (
            <span className="flex items-center gap-2 justify-center"><Headphones size={16} /> Listen</span>
          )}
        </button>
        <span className="text-xs text-white/30">Click to trigger</span>
      </div>
    </div>
  );
}

// ── 2. Glass Progress Bar ──
function Demo2_GlassProgressBar() {
  const [progress, setProgress] = useState(65);
  return (
    <div>
      <SectionLabel num={2} title="Glassmorphism Progress Bar" desc="Frosted glass with inner glow and light streak" />
      <div className="space-y-4">
        <div
          className="w-full h-3 rounded-full overflow-hidden relative"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 0 20px rgba(100,140,255,0.05), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div
            className="h-full rounded-full relative transition-all duration-700"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, rgba(99,130,255,0.5), rgba(150,100,255,0.7), rgba(99,130,255,0.5))',
              backgroundSize: '200% 100%',
              animation: 'glassShimmer 2s ease-in-out infinite',
              boxShadow: '0 0 16px rgba(120,100,255,0.3), 0 0 4px rgba(120,100,255,0.5)',
            }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                animation: 'glassStreak 2.5s ease-in-out infinite',
              }}
            />
          </div>
        </div>
        <input type="range" min={0} max={100} value={progress} onChange={e => setProgress(+e.target.value)}
          className="w-full accent-purple-500" />
      </div>
    </div>
  );
}

// ── 3. Vercel / Linear Shimmer Button ──
function Demo3_VercelShimmerButton() {
  return (
    <div>
      <SectionLabel num={3} title="Vercel Shimmer Button" desc="Subtle light sweep across the surface — premium feel" />
      <div className="flex gap-4">
        <button className="relative px-6 py-3 bg-white text-black rounded-xl text-sm font-semibold overflow-hidden group">
          <span className="relative z-10 flex items-center gap-2"><Zap size={15} /> Deploy</span>
          <div
            className="absolute top-0 left-0 w-[60%] h-full z-[1]"
            style={{
              background: 'linear-gradient(105deg, transparent 20%, rgba(0,0,0,0.04) 35%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.04) 65%, transparent 80%)',
              animation: 'vercelShimmer 3s ease-in-out infinite',
            }}
          />
        </button>
        <button className="relative px-6 py-3 bg-white/[0.06] text-white border border-white/10 rounded-xl text-sm font-medium overflow-hidden">
          <span className="relative z-10 flex items-center gap-2"><BookOpen size={15} /> Create Novel</span>
          <div
            className="absolute top-0 left-0 w-[60%] h-full z-[1]"
            style={{
              background: 'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.04) 35%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 65%, transparent 80%)',
              animation: 'vercelShimmer 3s ease-in-out infinite',
            }}
          />
        </button>
      </div>
    </div>
  );
}

// ── 4. Pulse / Breathe (Generating State) ──
function Demo4_PulseBreathButton() {
  const [gen, setGen] = useState(false);
  return (
    <div>
      <SectionLabel num={4} title="Pulse / Breathe" desc="AI generating state — soft glow radiates outward" />
      <button
        onClick={() => { setGen(true); setTimeout(() => setGen(false), 4000); }}
        className={cn(
          'relative px-7 py-3.5 rounded-xl text-sm font-semibold text-white transition-all',
          gen
            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 animate-[breathe_2s_ease-in-out_infinite]'
            : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg hover:shadow-purple-500/20'
        )}
      >
        {gen && (
          <>
            <span className="absolute inset-0 rounded-xl animate-[pulseRing_2s_ease-out_infinite]" style={{ boxShadow: '0 0 0 0 rgba(99,102,241,0.5)' }} />
            <span className="absolute inset-0 rounded-xl animate-[pulseRing_2s_ease-out_infinite_0.6s]" style={{ boxShadow: '0 0 0 0 rgba(139,92,246,0.4)' }} />
          </>
        )}
        <span className="relative flex items-center gap-2">
          {gen ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : <><Sparkles size={16} /> Generate Audio</>}
        </span>
      </button>
    </div>
  );
}

// ── 5. Stripe Gradient Progress Bar ──
function Demo5_StripeGradientProgress() {
  const [p, setP] = useState(70);
  return (
    <div>
      <SectionLabel num={5} title="Stripe Gradient Progress" desc="Flowing multi-color gradient with diagonal stripes" />
      <div className="space-y-4">
        <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full relative transition-all duration-500"
            style={{
              width: `${p}%`,
              background: 'linear-gradient(90deg, #635bff, #80b3ff, #a960ee, #f06595, #ffb347, #635bff)',
              backgroundSize: '300% 100%',
              animation: 'stripeFlow 3s linear infinite',
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(255,255,255,0.1) 6px, rgba(255,255,255,0.1) 12px)',
                backgroundSize: '17px 17px',
                animation: 'stripeMove 0.6s linear infinite',
              }}
            />
          </div>
        </div>
        <input type="range" min={0} max={100} value={p} onChange={e => setP(+e.target.value)} className="w-full accent-indigo-500" />
      </div>
    </div>
  );
}

// ── 6. Apple Indeterminate ──
function Demo6_AppleIndeterminate() {
  return (
    <div>
      <SectionLabel num={6} title="Apple Indeterminate" desc="Clean sliding highlight — macOS style" />
      <div className="space-y-6">
        {/* Light version */}
        <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden relative">
          <div
            className="absolute top-0 h-full w-[30%] rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, #3b82f6 20%, #3b82f6 80%, transparent)',
              animation: 'appleSlide 1.8s cubic-bezier(0.45,0,0.55,1) infinite',
            }}
          />
        </div>
        {/* Thicker version */}
        <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden relative">
          <div
            className="absolute top-0 h-full w-[25%] rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, #a855f7 15%, #a855f7 85%, transparent)',
              animation: 'appleSlide 2s cubic-bezier(0.45,0,0.55,1) infinite',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── 7. Skeleton Shimmer ──
function Demo7_SkeletonShimmer() {
  return (
    <div>
      <SectionLabel num={7} title="Skeleton Shimmer" desc="Notion-style loading placeholders with light sweep" />
      <div className="bg-white/[0.04] rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/[0.08] relative overflow-hidden">
            <div className="absolute inset-0" style={{ background: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.05) 37%, transparent 50%)', backgroundSize: '200% 100%', animation: 'notionShimmer 1.5s ease-in-out infinite' }} />
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-3 w-[40%] rounded bg-white/[0.08] relative overflow-hidden">
              <div className="absolute inset-0" style={{ background: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.05) 37%, transparent 50%)', backgroundSize: '200% 100%', animation: 'notionShimmer 1.5s ease-in-out infinite' }} />
            </div>
            <div className="h-2 w-[65%] rounded bg-white/[0.06] relative overflow-hidden">
              <div className="absolute inset-0" style={{ background: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.05) 37%, transparent 50%)', backgroundSize: '200% 100%', animation: 'notionShimmer 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        </div>
        <div className="h-2.5 w-[90%] rounded bg-white/[0.06] relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.05) 37%, transparent 50%)', backgroundSize: '200% 100%', animation: 'notionShimmer 1.5s ease-in-out infinite' }} />
        </div>
        <div className="h-2.5 w-[75%] rounded bg-white/[0.06] relative overflow-hidden">
          <div className="absolute inset-0" style={{ background: 'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.05) 37%, transparent 50%)', backgroundSize: '200% 100%', animation: 'notionShimmer 1.5s ease-in-out infinite' }} />
        </div>
      </div>
    </div>
  );
}

// ── 8. Spring Button ──
function Demo8_SpringButton() {
  const [loading, setLoading] = useState(false);
  return (
    <div>
      <SectionLabel num={8} title="Spring Button" desc="Physics-based press/release with bouncy dots" />
      <button
        onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 3000); }}
        className="px-7 py-3.5 bg-white text-black rounded-xl text-sm font-semibold transition-transform hover:scale-[1.04] active:scale-95"
        style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)', transitionDuration: '0.5s' }}
      >
        {loading ? (
          <span className="flex gap-1.5 justify-center items-center h-5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-black"
                style={{ animation: `springBounce 1.2s cubic-bezier(0.34,1.56,0.64,1) infinite ${i * 0.15}s` }}
              />
            ))}
          </span>
        ) : (
          <span className="flex items-center gap-2"><Play size={15} fill="currentColor" /> Play Chapter</span>
        )}
      </button>
    </div>
  );
}

// ── 9. Glowing Border Button ──
function Demo9_GlowBorderButton() {
  return (
    <div>
      <SectionLabel num={9} title="Rotating Glow Border" desc="Conic gradient orbiting the border — AI product signature" />
      <div className="flex gap-4">
        <div className="relative p-[2px] rounded-xl overflow-hidden" style={{ animation: 'rotateBorder 3s linear infinite' }}>
          <div
            className="absolute inset-0"
            style={{
              background: 'conic-gradient(from var(--angle, 0deg), transparent 40%, #6366f1 50%, #ec4899 55%, #6366f1 60%, transparent 70%)',
              animation: 'rotateBorder 3s linear infinite',
            }}
          />
          <button className="relative px-6 py-3 bg-[#0a0a0a] text-white rounded-[10px] text-sm font-semibold z-10">
            <span className="flex items-center gap-2"><Sparkles size={15} /> Generate</span>
          </button>
        </div>

        {/* Simpler version with gradient border */}
        <div className="relative p-[1.5px] rounded-xl overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, #6366f1, #ec4899, #f59e0b, #6366f1)',
              backgroundSize: '300% 100%',
              animation: 'stripeFlow 3s linear infinite',
            }}
          />
          <button className="relative px-6 py-3 bg-[#0a0a0a] text-white rounded-[10px] text-sm font-semibold z-10">
            <span className="flex items-center gap-2"><Headphones size={15} /> Listen</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 10. Morphing Text ──
function Demo10_MorphingText() {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const labels = { idle: 'Generate', loading: 'Writing...', done: 'Done!' };
  const icons = {
    idle: <Sparkles size={15} />,
    loading: <Loader2 size={15} className="animate-spin" />,
    done: <Check size={15} />,
  };
  const cycle = () => {
    setState('loading');
    setTimeout(() => setState('done'), 2000);
    setTimeout(() => setState('idle'), 3500);
  };
  return (
    <div>
      <SectionLabel num={10} title="Morphing Text" desc="Text slides + blurs on state change" />
      <button
        onClick={cycle}
        className="relative px-7 py-3.5 bg-white text-black rounded-xl text-sm font-semibold overflow-hidden min-w-[160px]"
      >
        <span
          key={state}
          className="flex items-center gap-2 justify-center animate-[textMorphIn_0.3s_ease-out_both]"
        >
          {icons[state]} {labels[state]}
        </span>
      </button>
    </div>
  );
}

// ── 11. Blob Progress Bar ──
function Demo11_BlobBar() {
  const [p, setP] = useState(60);
  return (
    <div>
      <SectionLabel num={11} title="Blob Progress Bar" desc="Liquid blob on the leading edge — morphic feel" />
      <div className="space-y-6">
        <div className="relative w-full h-3 rounded-full bg-white/[0.06] overflow-visible">
          <div className="h-full rounded-full" style={{ width: `${p}%`, background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)', backgroundSize: '200% 100%', animation: 'stripeFlow 2s linear infinite', transition: 'width 0.7s ease' }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full" style={{ left: `${p}%`, marginLeft: -10, background: 'radial-gradient(circle, #ec4899, #a855f7)', boxShadow: '0 0 20px rgba(168,85,247,0.6), 0 0 40px rgba(168,85,247,0.3)', animation: 'blobPulse 1.2s ease-in-out infinite', transition: 'left 0.7s ease' }} />
        </div>
        <div className="relative w-full h-8 rounded-full bg-white/[0.04] overflow-hidden border border-white/[0.06]">
          <div className="h-full rounded-full relative flex items-center justify-end pr-3" style={{ width: `${Math.max(p, 8)}%`, background: 'linear-gradient(90deg, rgba(99,102,241,0.3), rgba(168,85,247,0.5))', transition: 'width 0.7s ease' }}>
            <span className="text-[10px] font-bold text-white/70">{p}%</span>
          </div>
          <div className="absolute top-0 h-full w-12 rounded-full" style={{ left: `${p}%`, marginLeft: -24, background: 'radial-gradient(ellipse, rgba(168,85,247,0.4), transparent 70%)', filter: 'blur(8px)', animation: 'blobPulse 1.5s ease-in-out infinite', transition: 'left 0.7s ease' }} />
        </div>
        <input type="range" min={0} max={100} value={p} onChange={e => setP(+e.target.value)} className="w-full accent-purple-500" />
      </div>
    </div>
  );
}

// ── 12. Liquid Blob Button ──
function Demo12_LiquidBlob() {
  const [loading, setLoading] = useState(false);
  return (
    <div>
      <SectionLabel num={12} title="Liquid Blob Button" desc="Floating color blobs behind text — ultra morphic" />
      <div className="flex flex-wrap gap-4">
        <button onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 4000); }} className="relative px-8 py-4 rounded-2xl text-sm font-semibold text-white overflow-hidden" style={{ background: '#1a1a2e' }}>
          <div className="absolute inset-0 overflow-hidden rounded-2xl">
            <div className="absolute w-24 h-24 rounded-full opacity-70" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)', top: '-20%', left: '10%', animation: 'blobFloat1 4s ease-in-out infinite', filter: 'blur(20px)' }} />
            <div className="absolute w-20 h-20 rounded-full opacity-60" style={{ background: 'radial-gradient(circle, #ec4899, transparent 70%)', bottom: '-15%', right: '15%', animation: 'blobFloat2 5s ease-in-out infinite', filter: 'blur(18px)' }} />
            <div className="absolute w-16 h-16 rounded-full opacity-50" style={{ background: 'radial-gradient(circle, #a855f7, transparent 70%)', top: '30%', right: '30%', animation: 'blobFloat3 3.5s ease-in-out infinite', filter: 'blur(15px)' }} />
          </div>
          <span className="relative flex items-center gap-2 z-10">{loading ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : <><Headphones size={16} /> Listen to Chapter 1</>}</span>
        </button>
        <button className="relative px-6 py-3 rounded-xl text-sm font-semibold text-white overflow-hidden" style={{ background: '#0f0f1a' }}>
          <div className="absolute inset-0 overflow-hidden rounded-xl">
            <div className="absolute w-16 h-16 rounded-full opacity-60" style={{ background: 'radial-gradient(circle, #3b82f6, transparent 70%)', top: '-30%', left: '20%', animation: 'blobFloat1 3s ease-in-out infinite', filter: 'blur(12px)' }} />
            <div className="absolute w-14 h-14 rounded-full opacity-50" style={{ background: 'radial-gradient(circle, #8b5cf6, transparent 70%)', bottom: '-20%', right: '20%', animation: 'blobFloat2 4s ease-in-out infinite', filter: 'blur(12px)' }} />
          </div>
          <span className="relative z-10 flex items-center gap-2"><Play size={14} fill="currentColor" /> Play</span>
        </button>
      </div>
    </div>
  );
}

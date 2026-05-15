// Catalog/reference view for every conversion-triggering prompt in Theodore.
// Each entry is a small CSS-only reproduction of the live UI alongside the
// exact copy, trigger condition, and which journey events fire — so a single
// page answers "what does each modal say, when does it appear, and how do I
// find it in code." Keep the copy strings here in sync with the source files
// referenced in each card.
//
// Cards for under-performing prompts (Usage Receipt, Credit Nudges, Upgrade
// Modals) render a horizontal carousel: the live "Original" plus 2–3 variant
// drafts that lean harder on next-tier benefits. The Funnel tab tells us
// which prompt is worth re-writing; this is the workshop where the rewrites
// live before any of them ship.

import { BookOpen, Headphones, Sparkles, X, ArrowUp, Coins } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Variant {
  label: string;       // "Original" | "Variant A" | etc.
  caption?: string;    // short hypothesis: "5× framing", "loss-aversion", etc.
  mockup: React.ReactNode;
}

interface PromptCardProps {
  title: string;
  category: 'Toast' | 'Modal' | 'Inline' | 'CTA';
  location: string;
  trigger: string;
  events: string[];
  source: string;
  mockup?: React.ReactNode;
  variants?: Variant[];  // when provided, renders carousel instead of single mockup
}

function PromptCard({ title, category, location, trigger, events, source, mockup, variants }: PromptCardProps) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden flex flex-col">
      {/* Mockup or carousel of variants */}
      {variants && variants.length > 0 ? (
        <VariantCarousel variants={variants} />
      ) : (
        <div className="bg-gradient-to-br from-stone-100 to-stone-200 px-4 py-6 sm:px-6 sm:py-8 flex items-center justify-center min-h-[220px]">
          {mockup}
        </div>
      )}
      {/* Metadata */}
      <div className="px-5 py-4 border-t border-black/[0.06] flex-1 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight">{title}</h3>
          <span className={cn(
            'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
            category === 'Modal' && 'bg-rose-100 text-rose-700',
            category === 'Toast' && 'bg-indigo-100 text-indigo-700',
            category === 'Inline' && 'bg-amber-100 text-amber-700',
            category === 'CTA' && 'bg-emerald-100 text-emerald-700',
          )}>
            {category}
          </span>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-0.5">Where</div>
          <p className="text-xs text-text-secondary leading-relaxed">{location}</p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-0.5">Triggers when</div>
          <p className="text-xs text-text-secondary leading-relaxed">{trigger}</p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">Fires events</div>
          <div className="flex flex-wrap gap-1">
            {events.map((ev) => (
              <code key={ev} className="px-1.5 py-0.5 rounded bg-black/[0.04] text-[10px] text-text-secondary font-mono">{ev}</code>
            ))}
          </div>
        </div>
        <div className="mt-auto pt-1">
          <code className="text-[10px] text-text-tertiary font-mono">{source}</code>
        </div>
      </div>
    </div>
  );
}

function VariantCarousel({ variants }: { variants: Variant[] }) {
  return (
    <div className="bg-gradient-to-br from-stone-100 to-stone-200">
      <div
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 py-6 sm:px-6 sm:py-8 scrollbar-thin"
        style={{ scrollbarWidth: 'thin' }}
      >
        {variants.map((v, i) => (
          <div
            key={i}
            className="snap-start shrink-0 w-[300px] flex flex-col items-center gap-2"
          >
            <div className="flex items-center gap-2 self-start">
              <span className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
                i === 0
                  ? 'bg-stone-700 text-white'
                  : 'bg-indigo-600 text-white',
              )}>
                {v.label}
              </span>
              {v.caption && (
                <span className="text-[10px] text-text-tertiary italic">{v.caption}</span>
              )}
            </div>
            <div className="flex-1 w-full flex items-center justify-center min-h-[200px]">
              {v.mockup}
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 sm:px-6 pb-2 text-[10px] text-text-tertiary italic">
        Scroll horizontally to compare drafts → Original is leftmost.
      </div>
    </div>
  );
}

// ── Reusable mock UI snippets ─────────────────────────────────────────────

function MockUsageReceipt({
  percentUsed = 47,
  action = 'Chapter written',
  credits = 38,
  ctaCopy,
}: {
  percentUsed?: number;
  action?: string;
  credits?: number;
  ctaCopy?: string;
}) {
  const critical = percentUsed >= 90;
  const low = percentUsed >= 75;
  const halfway = percentUsed >= 50;
  const defaultCta = critical ? 'Almost out — see plans →' : 'Keep going · See plans →';
  return (
    <div
      className="w-full max-w-[340px] rounded-2xl border border-white/10 shadow-xl"
      style={{ background: 'rgba(20,20,28,0.92)', backdropFilter: 'blur(28px)' }}
    >
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-white/75">
            <Coins size={12} className="text-indigo-300" />
            <span><span className="text-white font-medium">{action}</span><span className="text-white/50"> · {credits} credits</span></span>
          </div>
          <span className="shrink-0 tabular-nums text-white/55">{percentUsed}% used</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
          <div
            className={cn('h-full rounded-full', critical ? 'bg-rose-400' : low ? 'bg-amber-300' : halfway ? 'bg-indigo-300' : 'bg-emerald-300')}
            style={{ width: `${percentUsed}%` }}
          />
        </div>
        {(halfway || ctaCopy) && (
          <div className={cn('mt-2 text-xs font-medium', critical ? 'text-rose-200' : 'text-indigo-200')}>
            {ctaCopy || defaultCta}
          </div>
        )}
      </div>
    </div>
  );
}

function MockCreditNudge({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="w-full max-w-[300px] rounded-2xl border border-white/10 shadow-xl relative"
      style={{ background: 'rgba(20,20,28,0.92)', backdropFilter: 'blur(28px)' }}
    >
      <button className="absolute top-2 right-2 p-1 rounded-md text-white/40">
        <X size={14} />
      </button>
      <div className="p-4 pr-9">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={14} className="text-indigo-300" />
          <div className="text-sm font-semibold text-white">{title}</div>
        </div>
        <p className="text-xs text-white/60 leading-relaxed">{body}</p>
        <div className="mt-3 flex items-center gap-2">
          <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-[#16162a]">See plans</button>
          <button className="px-3 py-1.5 rounded-lg text-xs text-white/60">Maybe later</button>
        </div>
      </div>
    </div>
  );
}

function MockGuestSignupModal({ variant }: { variant: 'novel' | 'audio' }) {
  const isAudio = variant === 'audio';
  const Icon = isAudio ? Headphones : BookOpen;
  const heading = isAudio ? 'Keep listening.' : "Don't lose your story.";
  const subtext = isAudio
    ? 'Sign up free to save your audiobook and keep listening. Plus 100 credits for more chapters.'
    : 'Create a free account to keep your novel — plus 100 credits for audiobooks and more.';
  return (
    <div className="w-full max-w-[280px] rounded-3xl border border-black/5 shadow-xl bg-white overflow-hidden relative">
      <button className="absolute top-3 right-3 p-1 text-text-tertiary">
        <X size={14} />
      </button>
      <div className="p-5 text-center">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3',
          isAudio ? 'bg-gradient-to-br from-violet-100 to-purple-100' : 'bg-gradient-to-br from-amber-100 to-orange-100',
        )}>
          <Icon size={18} className={isAudio ? 'text-violet-700' : 'text-amber-700'} />
        </div>
        <h2 className="text-base font-serif font-semibold mb-1">{heading}</h2>
        <p className="text-xs text-text-tertiary leading-relaxed">{subtext}</p>
        <div className="mt-4 space-y-2">
          <button className="w-full py-2 rounded-lg bg-white border border-black/15 text-xs">Continue with Google</button>
          <button className="w-full py-2 rounded-lg border border-black/10 text-xs text-text-secondary">Sign up with email</button>
        </div>
      </div>
    </div>
  );
}

function MockChatSignupModal() {
  return (
    <div className="w-full max-w-[280px] rounded-3xl border border-black/5 shadow-xl bg-white overflow-hidden p-5 text-center">
      <h2 className="text-base font-serif font-semibold mb-2">Save your progress</h2>
      <p className="text-xs text-text-tertiary mb-4">Create a free account so you don't lose this conversation. Takes 5 seconds.</p>
      <button className="w-full py-2 rounded-lg bg-white border border-black/15 text-xs mb-2">Continue with Google</button>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-px flex-1 bg-black/10" />
        <span className="text-[9px] text-text-tertiary uppercase">or</span>
        <div className="h-px flex-1 bg-black/10" />
      </div>
      <button className="w-full py-2 rounded-xl bg-text-primary text-white text-xs font-semibold">Sign Up with Email</button>
      <div className="mt-2 text-xs text-text-tertiary">Keep writing →</div>
    </div>
  );
}

function MockUpgradeModal({
  heading,
  body,
  ctaLabel,
  bullets,
  badge = '7 days free · cancel anytime',
}: {
  heading: string;
  body?: string;
  ctaLabel: string;
  bullets?: string[];
  badge?: string;
}) {
  return (
    <div
      className="w-full max-w-[300px] rounded-3xl shadow-2xl overflow-hidden relative"
      style={{ background: 'rgba(20,20,28,0.96)' }}
    >
      <button className="absolute top-3 right-3 p-1 text-white/40">
        <X size={14} />
      </button>
      <div className="p-5">
        <div className="inline-block px-2 py-0.5 rounded-full bg-white/10 text-[9px] font-semibold uppercase tracking-wide text-white/70 mb-3">
          {badge}
        </div>
        <h2 className="text-base font-serif font-semibold text-white mb-1.5">{heading}</h2>
        {body && <p className="text-xs text-white/60 leading-relaxed mb-3">{body}</p>}
        {bullets && (
          <ul className="space-y-1 mb-3">
            {bullets.map((b) => (
              <li key={b} className="text-xs text-white/70 flex items-start gap-1.5">
                <span className="text-emerald-400/80 mt-[1px]">✓</span><span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        <button className="w-full py-2.5 rounded-xl bg-white text-[#16162a] text-xs font-semibold">{ctaLabel}</button>
        <p className="text-center text-[10px] text-white/40 mt-2">Already have an account? Sign in</p>
      </div>
    </div>
  );
}

function MockSimpleCTA({ children, primary = false }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <button className={cn(
      'px-4 py-2.5 rounded-full text-xs font-semibold',
      primary ? 'bg-text-primary text-white' : 'bg-white border border-black/10 text-text-secondary',
    )}>{children}</button>
  );
}

function MockChatInput() {
  return (
    <div className="w-full max-w-[280px] rounded-2xl shadow-xl overflow-hidden" style={{ background: '#1c1c1e' }}>
      <div className="flex items-end gap-2 p-3">
        <div className="flex-1 text-xs text-white/30 italic">A heist on a moving train.<span className="caret-blink inline-block ml-[1px] w-[1px] h-[1em] bg-white/80 align-middle" /></div>
        <button className="w-7 h-7 rounded-lg bg-white text-black flex items-center justify-center">
          <ArrowUp size={14} />
        </button>
      </div>
    </div>
  );
}

function MockGuestBanner() {
  return (
    <div className="w-full max-w-[320px] rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 px-3 py-2 flex items-center justify-between">
      <p className="text-[11px] text-amber-900">Save your progress. <span className="text-amber-700">Sign up free.</span></p>
      <button className="px-2.5 py-1 rounded-md bg-text-primary text-white text-[10px] font-semibold">Sign Up</button>
    </div>
  );
}

// ── The catalog itself ────────────────────────────────────────────────────

export function PromptsCatalog() {
  return (
    <div className="px-4 sm:px-6 py-4 space-y-6">
      <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
        <h2 className="text-sm font-semibold mb-1">Catalog of every conversion prompt</h2>
        <p className="text-xs text-text-secondary leading-relaxed">
          Each card below is a mockup of the live UI plus its trigger condition and the journey events it fires.
          Cross-reference with the Funnel tab to see which ones are actually pulling weight.
        </p>
        <p className="text-xs text-text-secondary leading-relaxed mt-2">
          <strong>Under-performing prompts show a carousel of variant drafts.</strong> Original is leftmost; variants
          to the right lean harder on the next-tier benefit (Writer = 5× credits, full audio chapters, unlimited
          projects). Scroll horizontally within a card to compare drafts.
        </p>
      </div>

      {/* Writer-tier cheat sheet — informs the variant copy below */}
      <div className="rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/60 to-purple-50/60 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-indigo-600" />
          <h2 className="text-sm font-semibold">Free → Writer: what you actually unlock</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg bg-white/60 p-3 border border-white/40">
            <div className="text-text-tertiary">Credits</div>
            <div className="font-semibold text-text-primary">500 → <span className="text-indigo-700">2,500</span></div>
            <div className="text-[10px] text-text-tertiary mt-0.5">5× more</div>
          </div>
          <div className="rounded-lg bg-white/60 p-3 border border-white/40">
            <div className="text-text-tertiary">AI chapters</div>
            <div className="font-semibold text-text-primary">~3 → <span className="text-indigo-700">~83</span></div>
            <div className="text-[10px] text-text-tertiary mt-0.5">/month</div>
          </div>
          <div className="rounded-lg bg-white/60 p-3 border border-white/40">
            <div className="text-text-tertiary">Audio</div>
            <div className="font-semibold text-text-primary">60s preview → <span className="text-indigo-700">~30 full chapters</span></div>
            <div className="text-[10px] text-text-tertiary mt-0.5">narrated end-to-end</div>
          </div>
          <div className="rounded-lg bg-white/60 p-3 border border-white/40">
            <div className="text-text-tertiary">Projects</div>
            <div className="font-semibold text-text-primary">1 → <span className="text-indigo-700">Unlimited</span></div>
            <div className="text-[10px] text-text-tertiary mt-0.5">+ multi-voice (beta)</div>
          </div>
        </div>
        <p className="text-[11px] text-text-tertiary mt-3 italic">
          $10/mo · 7 days free · cancel anytime — these four numbers are the spine of every variant below.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hero & landing — top of funnel */}
        <PromptCard
          title="Imagine input (hero typewriter)"
          category="CTA"
          location="Landing page hero (`/` and `/go`)"
          trigger="Always visible. Cursor-blink typewriter cycles SHORT_PROMPTS until the user clicks/types — handing off the visible text as the input value."
          events={['focus_input', 'chat_auto_send']}
          source="src/components/views/LandingPage.tsx:118"
          mockup={<MockChatInput />}
        />

        <PromptCard
          title="Pricing card CTAs"
          category="CTA"
          location="Landing page pricing section (4 tier cards)"
          trigger="Click on any 'Start free' button across Dreamer / Writer / Author / Studio tiers."
          events={['pricing_cta_clicked']}
          source="src/components/views/LandingPage.tsx:480"
          mockup={<div className="space-y-2"><MockSimpleCTA primary>Start free</MockSimpleCTA><MockSimpleCTA>Start free</MockSimpleCTA></div>}
        />

        {/* Guest chat banner */}
        <PromptCard
          title="Guest chat banner — Sign Up"
          category="CTA"
          location="Top of guest chat view (orange banner)"
          trigger="Always visible while in guest mode inside the chat view."
          events={['signup_banner_clicked']}
          source="src/components/views/ChatCreation.tsx:1667"
          mockup={<MockGuestBanner />}
        />

        {/* ── Usage Receipt — carousel: original + 3 variants ─────────────── */}
        <PromptCard
          title="Usage Receipt (per-generation pill)"
          category="Toast"
          location="Top-center pill, 12s auto-dismiss"
          trigger="Fires after every successful generation that consumed credits (chapter / audio / image / outline). Free-tier authed users only. Currently most-shown but lowest converting — needs rethink."
          events={['usage_receipt_shown', 'usage_receipt_cta_clicked']}
          source="src/components/credits/UsageReceipt.tsx"
          variants={[
            {
              label: 'Original',
              caption: 'generic "keep going"',
              mockup: <MockUsageReceipt percentUsed={47} />,
            },
            {
              label: 'Variant A',
              caption: '5× framing',
              mockup: <MockUsageReceipt percentUsed={47} ctaCopy="5× more for $10/mo · Writer →" />,
            },
            {
              label: 'Variant B',
              caption: 'output framing',
              mockup: <MockUsageReceipt percentUsed={47} ctaCopy="That was ~1 of your 3 free chapters · Writer = ~83 →" />,
            },
            {
              label: 'Variant C',
              caption: 'audio framing',
              mockup: <MockUsageReceipt percentUsed={47} ctaCopy="Hear it as an audiobook · Writer →" />,
            },
          ]}
        />

        {/* ── Credit Nudge — 50% — carousel ─────────────────────────────── */}
        <PromptCard
          title="Credit Nudge — 50% remaining"
          category="Toast"
          location="Bottom-right toast, 12s auto-dismiss"
          trigger="Fires once when a free user's remaining-credit % first drops at or below 50%. Deduped per billing period via localStorage."
          events={['credit_nudge_shown', 'credit_nudge_clicked', 'credit_nudge_dismissed']}
          source="src/components/credits/CreditNudge.tsx:13"
          variants={[
            {
              label: 'Original',
              caption: '"unlimited chapters" — vague',
              mockup: <MockCreditNudge
                title="Halfway through"
                body="Half your monthly credits left. Like what you're making? Writer is $10/mo, unlimited chapters."
              />,
            },
            {
              label: 'Variant A',
              caption: '5× framing',
              mockup: <MockCreditNudge
                title="5× more for $10"
                body="Writer gets you 2,500 credits — ~83 chapters and full audiobook narration. 7 days free."
              />,
            },
            {
              label: 'Variant B',
              caption: 'output framing',
              mockup: <MockCreditNudge
                title="~250 free credits to go"
                body="Writer adds 2,500 more credits, unlimited projects, and ~30 full audio chapters. $10/mo."
              />,
            },
            {
              label: 'Variant C',
              caption: 'next-step framing',
              mockup: <MockCreditNudge
                title="Halfway through your 500"
                body="Writer = 2,500 credits + ~30 full audio chapters + unlimited projects. $10/mo, 7 days free."
              />,
            },
          ]}
        />

        {/* ── Credit Nudge — 25% — carousel ─────────────────────────────── */}
        <PromptCard
          title="Credit Nudge — 25% remaining"
          category="Toast"
          location="Bottom-right toast"
          trigger="Fires once when remaining-credit % first drops at or below 25%. Same dedup mechanism."
          events={['credit_nudge_shown', 'credit_nudge_clicked', 'credit_nudge_dismissed']}
          source="src/components/credits/CreditNudge.tsx:17"
          variants={[
            {
              label: 'Original',
              caption: '"no caps" — vague',
              mockup: <MockCreditNudge
                title="25% left"
                body="You're using Theodore a lot — let's keep it flowing. Writer plan = $10/mo, no caps."
              />,
            },
            {
              label: 'Variant A',
              caption: 'concrete credits-left',
              mockup: <MockCreditNudge
                title="~125 credits left"
                body="That's ~4 more chapters. Writer adds 2,500 credits, ~30 audio chapters, and unlimited projects — $10/mo."
              />,
            },
            {
              label: 'Variant B',
              caption: 'loss-aversion',
              mockup: <MockCreditNudge
                title="Running low"
                body="Don't stop a draft mid-arc. Writer = 5× the credits + full audiobooks + unlimited projects. 7 days free."
              />,
            },
            {
              label: 'Variant C',
              caption: 'audio hook',
              mockup: <MockCreditNudge
                title="75% in — and only 60s of audio"
                body="Writer unlocks full audiobook narration for every chapter. Plus 2,500 credits, $10/mo, 7 days free."
              />,
            },
          ]}
        />

        {/* ── Credit Nudge — 10% — carousel ─────────────────────────────── */}
        <PromptCard
          title="Credit Nudge — 10% remaining (last warning)"
          category="Toast"
          location="Bottom-right toast"
          trigger="Fires once when remaining-credit % first drops at or below 10%. Final warning before the wall."
          events={['credit_nudge_shown', 'credit_nudge_clicked', 'credit_nudge_dismissed']}
          source="src/components/credits/CreditNudge.tsx:21"
          variants={[
            {
              label: 'Original',
              caption: 'defensive "don\'t lose momentum"',
              mockup: <MockCreditNudge
                title="Almost out — 10% left"
                body="Don't lose momentum. Upgrade to keep generating chapters and audio."
              />,
            },
            {
              label: 'Variant A',
              caption: 'concrete "one chapter left"',
              mockup: <MockCreditNudge
                title="One chapter left"
                body="Writer adds 2,500 credits — ~83 more chapters, ~30 full audio chapters, unlimited projects. $10/mo, 7 days free."
              />,
            },
            {
              label: 'Variant B',
              caption: 'value-restated',
              mockup: <MockCreditNudge
                title="~50 credits left"
                body="Writer = 5× the credits, full audiobook chapters, unlimited projects. $10/mo, 7 days free."
              />,
            },
            {
              label: 'Variant C',
              caption: 'cliffhanger',
              mockup: <MockCreditNudge
                title="Your next chapter is on the other side"
                body="Writer unlocks 2,500 credits + ~30 full audio chapters + unlimited projects — for $10/mo."
              />,
            },
          ]}
        />

        {/* Guest Signup Modals — converters, no variants */}
        <PromptCard
          title="Guest Signup Modal — Novel variant"
          category="Modal"
          location="Center overlay with backdrop blur"
          trigger="Banner click on App.tsx:543 when a guest has an active project — they're trying to save/continue work and we need an account."
          events={['guest_signup_modal_shown', 'guest_signup_modal_signup', 'guest_signup_modal_dismissed']}
          source="src/components/credits/GuestSignupModal.tsx (variant='novel')"
          mockup={<MockGuestSignupModal variant="novel" />}
        />

        <PromptCard
          title="Guest Signup Modal — Audio variant"
          category="Modal"
          location="Center overlay with backdrop blur (violet accent)"
          trigger="Guest used their 1-per-day free audio sample. /api/tts/generate returns 429; client opens modal with the audio framing."
          events={['guest_signup_modal_shown variant=audio', 'guest_signup_modal_signup', 'guest_signup_modal_dismissed']}
          source="src/components/features/AudiobookPanel.tsx:851"
          mockup={<MockGuestSignupModal variant="audio" />}
        />

        {/* Chat signup modal — top performer (69%), no variants */}
        <PromptCard
          title="Chat Signup Modal (3-message threshold)"
          category="Modal"
          location="Center overlay inside the chat view"
          trigger="Guest user sends their 3rd message in Imagine chat. Threshold was lowered from 5 → 3 on 2026-05-12 because 5 was rarely reached. Currently 69% conversion rate — your top performer."
          events={['guest_chat_signup_modal_shown', 'guest_chat_signup_modal_signup', 'guest_chat_signup_modal_dismissed']}
          source="src/components/views/ChatCreation.tsx:1612"
          mockup={<MockChatSignupModal />}
        />

        {/* ── Upgrade Modal — generic — carousel ─────────────────────────── */}
        <PromptCard
          title="Upgrade Modal — out of credits (generic)"
          category="Modal"
          location="Center overlay, dark themed"
          trigger="Server returns 402 on any credit-gated endpoint (text gen, image, music, SFX) — the user has insufficient credits to continue."
          events={['upgrade_inline_shown', 'upgrade_signup_google', 'upgrade_signup_email', 'upgrade_checkout_redirect']}
          source="src/components/credits/UpgradeModal.tsx (reason='generic')"
          variants={[
            {
              label: 'Original',
              caption: '"more credits, more chapters" — abstract',
              mockup: <MockUpgradeModal
                heading="Unlock more of Theodore"
                body="More credits, more chapters, more audiobooks. Writer · $10/mo, 7 days free."
                ctaLabel="Start 7-day trial · Writer"
              />,
            },
            {
              label: 'Variant A',
              caption: '5× framing + bulleted',
              mockup: <MockUpgradeModal
                heading="5× more for $10"
                bullets={[
                  '2,500 credits/mo (was 500)',
                  '~30 full audio chapters',
                  'Unlimited projects',
                  'Multi-voice narration (beta)',
                ]}
                ctaLabel="Start 7-day trial · Writer"
              />,
            },
            {
              label: 'Variant B',
              caption: 'feature-list',
              mockup: <MockUpgradeModal
                heading="What Writer unlocks"
                bullets={[
                  '2,500 credits — ~83 chapters',
                  'Full audio chapters, not 60s previews',
                  'Unlimited projects',
                  'Early access: multi-voice cast',
                ]}
                ctaLabel="Start 7-day trial · $10/mo"
              />,
            },
            {
              label: 'Variant C',
              caption: 'next-chapter hook',
              mockup: <MockUpgradeModal
                heading="Your next chapter is one click away"
                body="Writer = 5× the credits, full audiobook chapters, unlimited projects. $10/mo, 7 days free."
                ctaLabel="Start 7-day trial · Writer"
              />,
            },
          ]}
        />

        {/* ── Upgrade Modal — audio cap — carousel ─────────────────────── */}
        <PromptCard
          title="Upgrade Modal — audio cap variant"
          category="Modal"
          location="Center overlay, dark themed"
          trigger="TTS returns 402 with needsUpgrade:true — they listened to their free audiobook chapter and want more. Specifically tuned 'Like what you heard?' framing."
          events={['audio_cap_inline_shown', 'audio_cap_signup_google', 'audio_cap_signup_email', 'audio_cap_checkout_redirect']}
          source="src/components/credits/UpgradeModal.tsx (reason='audio_cap')"
          variants={[
            {
              label: 'Original',
              caption: '"~29 more" — decent baseline',
              mockup: <MockUpgradeModal
                heading="Like what you heard?"
                body="Finish this chapter and ~29 more. Writer · $10/mo, 7 days free."
                ctaLabel="Start 7-day trial · Writer"
              />,
            },
            {
              label: 'Variant A',
              caption: 'specificity-focused',
              mockup: <MockUpgradeModal
                heading="Don't stop at 60 seconds"
                body="Writer unlocks ~30 full audiobook chapters per month — yours, narrated end-to-end."
                ctaLabel="Start 7-day trial · Writer $10/mo"
              />,
            },
            {
              label: 'Variant B',
              caption: 'value-stack',
              mockup: <MockUpgradeModal
                heading="60 seconds isn't a chapter"
                bullets={[
                  '~30 full audio chapters/mo',
                  '2,500 credits — ~83 chapters of prose',
                  'Unlimited projects',
                ]}
                ctaLabel="Start 7-day trial · Writer"
              />,
            },
            {
              label: 'Variant C',
              caption: 'completion framing',
              mockup: <MockUpgradeModal
                heading="Finish the chapter, then the book"
                body="Writer = ~30 full audio chapters, 5× the credits, unlimited projects. $10/mo, 7 days free."
                ctaLabel="Start 7-day trial · Writer"
              />,
            },
          ]}
        />

        {/* ── Upgrade Modal — multi-voice — carousel ────────────────────── */}
        <PromptCard
          title="Upgrade Modal — multi-voice variant"
          category="Modal"
          location="Center overlay, dark themed"
          trigger="Free user toggles the multi-voice option in the audio confirm modal. Frames as early-access Writer perk."
          events={['upgrade_inline_shown variant=multi_voice', 'upgrade_signup_*']}
          source="src/components/credits/UpgradeModal.tsx (reason='multi_voice')"
          variants={[
            {
              label: 'Original',
              caption: 'feature-led, paragraph form',
              mockup: <MockUpgradeModal
                heading="A voice for every character"
                body="Writer subscribers get early access to multi-voice narration — each character speaks with their own xAI voice, auto-cast by role and gender. Plus everything else in Writer · $10/mo, 7 days free."
                ctaLabel="Sign up & continue · Writer $10/mo"
                badge="Beta · Writer early access"
              />,
            },
            {
              label: 'Variant A',
              caption: 'casting metaphor',
              mockup: <MockUpgradeModal
                heading="Cast every character"
                bullets={[
                  'A distinct xAI voice for each character',
                  'Auto-cast by role and gender',
                  '~30 full audio chapters/mo',
                  '2,500 credits + unlimited projects',
                ]}
                ctaLabel="Start 7-day trial · Writer"
                badge="Beta · Writer early access"
              />,
            },
            {
              label: 'Variant B',
              caption: 'value-stack',
              mockup: <MockUpgradeModal
                heading="Your audiobook, fully cast"
                bullets={[
                  'Multi-voice narration (beta)',
                  '~30 full audio chapters/mo',
                  '2,500 credits/mo',
                  'Unlimited projects',
                ]}
                ctaLabel="Sign up & continue · $10/mo"
                badge="Beta · Writer early access"
              />,
            },
            {
              label: 'Variant C',
              caption: 'production framing',
              mockup: <MockUpgradeModal
                heading="From novel to full production"
                body="Writer unlocks multi-voice casting + ~30 full audio chapters + 2,500 credits + unlimited projects. $10/mo, 7 days free."
                ctaLabel="Start 7-day trial · Writer"
                badge="Beta · Writer early access"
              />,
            },
          ]}
        />
      </div>

      <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-4 text-xs text-text-tertiary">
        <strong className="text-text-secondary">Note:</strong> The mockups above are CSS-only reproductions —
        cross-reference the source files for the live components. Originals on the leftmost slide match the
        live copy; variants to the right are drafts not yet shipped. To promote a variant, copy its strings
        into the source file referenced at the bottom of the card.
      </div>
    </div>
  );
}

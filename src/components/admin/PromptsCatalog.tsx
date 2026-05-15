// Catalog/reference view for every conversion-triggering prompt in Theodore.
// Each entry is a small CSS-only reproduction of the live UI alongside the
// exact copy, trigger condition, and which journey events fire — so a single
// page answers "what does each modal say, when does it appear, and how do I
// find it in code." Keep the copy strings here in sync with the source files
// referenced in each card.

import { Bell, BookOpen, Headphones, Sparkles, X, ArrowUp, Coins } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PromptCardProps {
  title: string;
  category: 'Toast' | 'Modal' | 'Inline' | 'CTA';
  location: string;
  trigger: string;
  events: string[];
  source: string;
  mockup: React.ReactNode;
}

function PromptCard({ title, category, location, trigger, events, source, mockup }: PromptCardProps) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden flex flex-col">
      {/* Mockup */}
      <div className="bg-gradient-to-br from-stone-100 to-stone-200 px-4 py-6 sm:px-6 sm:py-8 flex items-center justify-center min-h-[220px]">
        {mockup}
      </div>
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

// ── Reusable mock UI snippets ─────────────────────────────────────────────

function MockUsageReceipt({ percentUsed = 47, action = 'Chapter written', credits = 38 }: { percentUsed?: number; action?: string; credits?: number }) {
  const critical = percentUsed >= 90;
  const low = percentUsed >= 75;
  const halfway = percentUsed >= 50;
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
        {halfway && (
          <div className={cn('mt-2 text-xs font-medium', critical ? 'text-rose-200' : 'text-indigo-200')}>
            {critical ? 'Almost out — see plans →' : 'Keep going · See plans →'}
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

function MockUpgradeModal({ heading, body, ctaLabel }: { heading: string; body: string; ctaLabel: string }) {
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
          7 days free · cancel anytime
        </div>
        <h2 className="text-base font-serif font-semibold text-white mb-1.5">{heading}</h2>
        <p className="text-xs text-white/60 leading-relaxed mb-4">{body}</p>
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

        {/* Usage Receipt */}
        <PromptCard
          title="Usage Receipt (per-generation pill)"
          category="Toast"
          location="Top-center pill, 12s auto-dismiss"
          trigger="Fires after every successful generation that consumed credits (chapter / audio / image / outline). Free-tier authed users only. Currently most-shown but lowest converting — needs rethink."
          events={['usage_receipt_shown', 'usage_receipt_cta_clicked']}
          source="src/components/credits/UsageReceipt.tsx"
          mockup={<MockUsageReceipt />}
        />

        {/* Credit Nudges */}
        <PromptCard
          title="Credit Nudge — 50% remaining"
          category="Toast"
          location="Bottom-right toast, 12s auto-dismiss"
          trigger="Fires once when a free user's remaining-credit % first drops at or below 50%. Deduped per billing period via localStorage."
          events={['credit_nudge_shown', 'credit_nudge_clicked', 'credit_nudge_dismissed']}
          source="src/components/credits/CreditNudge.tsx:13"
          mockup={<MockCreditNudge
            title="Halfway through"
            body="Half your monthly credits left. Like what you're making? Writer is $10/mo, unlimited chapters."
          />}
        />

        <PromptCard
          title="Credit Nudge — 25% remaining"
          category="Toast"
          location="Bottom-right toast"
          trigger="Fires once when remaining-credit % first drops at or below 25%. Same dedup mechanism."
          events={['credit_nudge_shown', 'credit_nudge_clicked', 'credit_nudge_dismissed']}
          source="src/components/credits/CreditNudge.tsx:17"
          mockup={<MockCreditNudge
            title="25% left"
            body="You're using Theodore a lot — let's keep it flowing. Writer plan = $10/mo, no caps."
          />}
        />

        <PromptCard
          title="Credit Nudge — 10% remaining (last warning)"
          category="Toast"
          location="Bottom-right toast"
          trigger="Fires once when remaining-credit % first drops at or below 10%. Final warning before the wall."
          events={['credit_nudge_shown', 'credit_nudge_clicked', 'credit_nudge_dismissed']}
          source="src/components/credits/CreditNudge.tsx:21"
          mockup={<MockCreditNudge
            title="Almost out — 10% left"
            body="Don't lose momentum. Upgrade to keep generating chapters and audio."
          />}
        />

        {/* Guest Signup Modals */}
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

        {/* Chat signup modal */}
        <PromptCard
          title="Chat Signup Modal (3-message threshold)"
          category="Modal"
          location="Center overlay inside the chat view"
          trigger="Guest user sends their 3rd message in Imagine chat. Threshold was lowered from 5 → 3 on 2026-05-12 because 5 was rarely reached. Currently 69% conversion rate — your top performer."
          events={['guest_chat_signup_modal_shown', 'guest_chat_signup_modal_signup', 'guest_chat_signup_modal_dismissed']}
          source="src/components/views/ChatCreation.tsx:1612"
          mockup={<MockChatSignupModal />}
        />

        {/* Upgrade Modals */}
        <PromptCard
          title="Upgrade Modal — out of credits (generic)"
          category="Modal"
          location="Center overlay, dark themed"
          trigger="Server returns 402 on any credit-gated endpoint (text gen, image, music, SFX) — the user has insufficient credits to continue."
          events={['upgrade_inline_shown', 'upgrade_signup_google', 'upgrade_signup_email', 'upgrade_checkout_redirect']}
          source="src/components/credits/UpgradeModal.tsx (reason='generic')"
          mockup={<MockUpgradeModal
            heading="Unlock more of Theodore"
            body="Keep writing, narrating, and listening. Writer · $10/mo, 7 days free."
            ctaLabel="Start 7-day trial · Writer"
          />}
        />

        <PromptCard
          title="Upgrade Modal — audio cap variant"
          category="Modal"
          location="Center overlay, dark themed"
          trigger="TTS returns 402 with needsUpgrade:true — they listened to their free audiobook chapter and want more. Specifically tuned 'Like what you heard?' framing."
          events={['audio_cap_inline_shown', 'audio_cap_signup_google', 'audio_cap_signup_email', 'audio_cap_checkout_redirect']}
          source="src/components/credits/UpgradeModal.tsx (reason='audio_cap')"
          mockup={<MockUpgradeModal
            heading="Like what you heard?"
            body="Finish this chapter and ~29 more. Writer · $10/mo, 7 days free."
            ctaLabel="Start 7-day trial · Writer"
          />}
        />

        <PromptCard
          title="Upgrade Modal — multi-voice variant"
          category="Modal"
          location="Center overlay, dark themed"
          trigger="Free user toggles the multi-voice option in the audio confirm modal. Frames as early-access Writer perk."
          events={['upgrade_inline_shown variant=multi_voice', 'upgrade_signup_*']}
          source="src/components/credits/UpgradeModal.tsx (reason='multi_voice')"
          mockup={<MockUpgradeModal
            heading="A voice for every character"
            body="Writer subscribers get early access to multi-voice narration — each character speaks with their own xAI voice, auto-cast by role and gender. Plus everything else in Writer · $10/mo, 7 days free."
            ctaLabel="Sign up & continue · Writer $10/mo"
          />}
        />
      </div>

      <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-4 text-xs text-text-tertiary">
        <strong className="text-text-secondary">Note:</strong> The mockups above are CSS-only reproductions —
        cross-reference the source files for the live components. If a copy string here disagrees with what
        renders in the app, the live component wins; update this catalog to match.
      </div>
    </div>
  );
}

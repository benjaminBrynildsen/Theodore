import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Bell, MousePointerClick, MapPin, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface EventCount {
  event: string;
  d7: number;
  d30: number;
  d90: number;
  all: number;
}

interface PromptsResponse {
  counts: EventCount[];
}

type Window = 'd7' | 'd30' | 'd90' | 'all';

// Group event names into prompt families. Each modal/toast has a _shown event
// and a follow-up signup/click/dismiss event so we can compute conversion
// rate. One-shot CTAs (pricing, sign-in) don't have a _shown — they're
// always-visible elements so we only track clicks.
interface PromptFamily {
  label: string;
  shownEvent?: string;
  clickEvents: string[];      // counted as "engaged" (signup, click, etc.)
  dismissEvents?: string[];
}

const MODAL_FAMILIES: PromptFamily[] = [
  {
    label: 'Usage Receipt (top pill, every gen)',
    shownEvent: 'usage_receipt_shown',
    clickEvents: ['usage_receipt_cta_clicked'],
  },
  {
    label: 'Credit Nudge (50/25/10% remaining)',
    shownEvent: 'credit_nudge_shown',
    clickEvents: ['credit_nudge_clicked'],
    dismissEvents: ['credit_nudge_dismissed'],
  },
  {
    label: 'Guest Signup Modal (banner/audio variants)',
    shownEvent: 'guest_signup_modal_shown',
    clickEvents: ['guest_signup_modal_signup'],
    dismissEvents: ['guest_signup_modal_dismissed'],
  },
  {
    label: 'Chat Signup Modal (3+ messages)',
    shownEvent: 'guest_chat_signup_modal_shown',
    clickEvents: ['guest_chat_signup_modal_signup'],
    dismissEvents: ['guest_chat_signup_modal_dismissed'],
  },
  {
    label: 'Upgrade Modal — out of credits',
    shownEvent: 'upgrade_inline_shown',
    clickEvents: ['upgrade_signup_google', 'upgrade_signup_email', 'upgrade_checkout_redirect'],
  },
  {
    label: 'Upgrade Modal — audio cap (7-day trial copy)',
    shownEvent: 'audio_cap_inline_shown',
    clickEvents: ['audio_cap_signup_google', 'audio_cap_signup_email', 'audio_cap_checkout_redirect'],
  },
];

const CTA_FAMILIES: PromptFamily[] = [
  { label: 'Pricing CTA (landing pricing tier)', clickEvents: ['pricing_cta_clicked'] },
  { label: 'Final CTA (landing bottom)', clickEvents: ['final_cta_submitted'] },
  { label: 'Sign-in button (landing nav)', clickEvents: ['signin_clicked'] },
  { label: 'Signup banner (guest chat top)', clickEvents: ['signup_banner_clicked'] },
  { label: 'Share — CTA on /library/b/* (Create your story)', clickEvents: ['share_cta_clicked'] },
  { label: 'Share — Publish + Copy from share dialog', clickEvents: ['share_published', 'share_link_copied'] },
  { label: 'Share — Recipient opened link', clickEvents: ['share_link_opened'] },
  { label: 'Share — Recipient played audio', clickEvents: ['share_book_listened'] },
  { label: 'Prompt redirect arrived (?prompt= URL)', clickEvents: ['prompt_redirect_arrived'] },
];

const SECTION_FAMILY = {
  label: 'Landing section reached (scroll depth)',
  event: 'section_reached',
};

function pct(num: number, den: number): string {
  if (den === 0) return '—';
  return `${((num / den) * 100).toFixed(1)}%`;
}

function rateColor(num: number, den: number): string {
  if (den === 0) return 'text-text-tertiary';
  const r = num / den;
  if (r >= 0.5) return 'text-emerald-700 font-semibold';
  if (r >= 0.2) return 'text-amber-700';
  if (r >= 0.05) return 'text-text-secondary';
  return 'text-rose-700';
}

export function PromptsTab() {
  const [data, setData] = useState<PromptsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState<Window>('d30');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/prompts-funnel', { credentials: 'include' });
      if (!r.ok) { setError(`Failed to load (${r.status})`); return; }
      setData(await r.json());
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // Build a quick lookup: event name → count for the current window
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const row of data.counts) m.set(row.event, row[window]);
    return m;
  }, [data, window]);

  const get = (ev: string) => counts.get(ev) ?? 0;

  if (loading && !data) return <div className="p-8 text-sm text-text-tertiary">Loading prompts funnel…</div>;
  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-rose-700">{error}</p>
        <button onClick={load} className="mt-3 text-sm text-text-secondary hover:text-text-primary underline">Retry</button>
      </div>
    );
  }
  if (!data) return null;

  // Sanity check: which events have zero data, suggesting they might not be
  // firing at all (broken instrumentation rather than just unpopular).
  const allEventsConsidered = [
    ...MODAL_FAMILIES.flatMap((f) => [f.shownEvent, ...f.clickEvents, ...(f.dismissEvents || [])]),
    ...CTA_FAMILIES.flatMap((f) => f.clickEvents),
    SECTION_FAMILY.event,
  ].filter(Boolean) as string[];
  const silentEvents = allEventsConsidered.filter((ev) => (counts.get(ev) ?? 0) === 0);

  return (
    <div className="px-4 sm:px-6 py-4 space-y-6">
      {/* Window selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(['d7', 'd30', 'd90', 'all'] as Window[]).map((w) => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                window === w
                  ? 'bg-text-primary text-white'
                  : 'bg-black/[0.04] text-text-secondary hover:bg-black/[0.08]'
              )}
            >
              {w === 'd7' ? 'Last 7d' : w === 'd30' ? 'Last 30d' : w === 'd90' ? 'Last 90d' : 'All-time (90d cap)'}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Modals + toasts — funnel: shown → engaged → (dismissed) */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary mb-3 flex items-center gap-2">
          <Bell size={14} /> Modals & toasts
        </h2>
        <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-text-tertiary">
              <tr>
                <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Prompt</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Shown</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Engaged</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Dismissed</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Rate</th>
              </tr>
            </thead>
            <tbody>
              {MODAL_FAMILIES.map((f) => {
                const shown = f.shownEvent ? get(f.shownEvent) : 0;
                const engaged = f.clickEvents.reduce((a, ev) => a + get(ev), 0);
                const dismissed = (f.dismissEvents || []).reduce((a, ev) => a + get(ev), 0);
                return (
                  <tr key={f.label} className="border-t border-black/5">
                    <td className="px-4 py-3">{f.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{shown}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums', engaged > 0 ? 'text-emerald-700 font-semibold' : 'text-text-tertiary')}>
                      {engaged || '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-tertiary">{dismissed || '—'}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums', rateColor(engaged, shown))}>
                      {pct(engaged, shown)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-text-tertiary mt-2 leading-relaxed">
          Rate = engaged / shown. Green ≥ 50%, amber ≥ 20%, red &lt; 5%. Low shown + high rate = "fire this more". High shown + low rate = "rewrite or remove".
        </p>
      </section>

      {/* One-shot CTAs — click counts only */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary mb-3 flex items-center gap-2">
          <MousePointerClick size={14} /> One-shot CTAs
        </h2>
        <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-text-tertiary">
              <tr>
                <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wider">CTA</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {CTA_FAMILIES
                .map((f) => ({ f, total: f.clickEvents.reduce((a, ev) => a + get(ev), 0) }))
                .sort((a, b) => b.total - a.total)
                .map(({ f, total }) => (
                  <tr key={f.label} className="border-t border-black/5">
                    <td className="px-4 py-3">{f.label}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums', total > 0 ? 'font-medium' : 'text-text-tertiary')}>
                      {total || '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Landing-section scroll depth (section_reached has a `section` data prop) */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary mb-3 flex items-center gap-2">
          <MapPin size={14} /> Landing section reach
        </h2>
        <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
          <p className="text-sm text-text-secondary">
            <span className="font-semibold tabular-nums text-text-primary">{get(SECTION_FAMILY.event)}</span>
            {' '}section_reached events fired in this window. Per-section breakdown needs the
            event-data drill-in (section_reached payload has the section name); not built yet
            but the data is there. Use the Journey tab and filter by event = section_reached to
            spot-check which sections people actually reach.
          </p>
        </div>
      </section>

      {/* Diagnostic: events with zero count — possibly broken instrumentation */}
      {silentEvents.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary mb-3 flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-600" /> Silent events ({silentEvents.length})
          </h2>
          <div className="rounded-2xl border border-amber-200/60 bg-amber-50/40 p-4">
            <p className="text-xs text-text-secondary mb-2">
              These events have zero hits in the selected window. Could mean:
              (a) nobody triggered the path, (b) instrumentation broke, or
              (c) the event was renamed in code but not in this map.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {silentEvents.map((ev) => (
                <code key={ev} className="px-2 py-0.5 rounded bg-white border border-amber-200/60 text-[11px] text-text-secondary">
                  {ev}
                </code>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Coins, X } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { useAuthStore } from '../../store/auth';
import { track as jTrack } from '../../lib/journey';

const ACTION_LABELS: Record<string, string> = {
  'generate-chapter-full': 'Chapter written',
  'generate-chapter': 'Chapter written',
  'generate-chapter-prose': 'Chapter written',
  'generate-audio': 'Audiobook generated',
  'generate-image': 'Cover image',
  'generate-music': 'Music track',
  'generate-sfx': 'Sound effect',
  'generate-chapter-outline': 'Scene outline',
  'extend-chapter': 'Chapter extended',
  'dialogue-clarity-pass': 'Dialogue polish',
  'dialogue-tagging': 'Dialogue tagged',
  'inline-edit': 'Edit applied',
  'plan-project': 'Project planned',
  'chat-message': 'Chat',
  'refine-entities': 'Characters refined',
  'extract-continuity': 'Continuity check',
  'scaffold-chapters': 'Chapters scaffolded',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const VISIBLE_MS = 12000;

export function UsageReceipt() {
  const { lastReceipt, plan, dismissReceipt, setShowUpgradeModal } = useCreditsStore();
  const user = useAuthStore((s) => s.user);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackedIdRef = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);

  const isFreeAuthed = !!user && plan.tier === 'free' && plan.creditsTotal > 0;

  useEffect(() => {
    if (!lastReceipt || !isFreeAuthed) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), VISIBLE_MS);

    if (trackedIdRef.current !== lastReceipt.id) {
      trackedIdRef.current = lastReceipt.id;
      jTrack('usage_receipt_shown', {
        action: lastReceipt.action,
        credits_used: lastReceipt.creditsUsed,
        pct_remaining: plan.creditsTotal > 0
          ? Math.round((plan.creditsRemaining / plan.creditsTotal) * 100)
          : null,
      });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [lastReceipt, isFreeAuthed, plan.creditsTotal, plan.creditsRemaining]);

  if (!lastReceipt || !isFreeAuthed || !visible) return null;

  const pctRemaining = plan.creditsTotal > 0
    ? (plan.creditsRemaining / plan.creditsTotal) * 100
    : 100;
  const pctUsed = 100 - pctRemaining;
  const critical = pctRemaining <= 10;
  const low = pctRemaining <= 25;
  const halfway = pctRemaining <= 50;

  const barColor = critical
    ? 'bg-rose-400'
    : low
    ? 'bg-amber-300'
    : halfway
    ? 'bg-indigo-300'
    : 'bg-emerald-300';

  const ctaCopy = critical
    ? 'Almost out — see plans →'
    : low
    ? 'Running low · See plans →'
    : halfway
    ? 'Keep going · See plans →'
    : null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[54] max-w-md w-[calc(100%-2rem)] animate-fade-in">
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        style={{
          background: 'rgba(20, 20, 28, 0.92)',
          backdropFilter: 'blur(28px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
        }}
      >
        <button
          onClick={() => {
            setVisible(false);
            dismissReceipt();
          }}
          className="absolute top-2 right-2 p-1 rounded-md text-white/40 hover:text-white/80 hover:bg-white/10 transition-all"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
        <div className="px-4 pt-3 pb-3 pr-9">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-white/75 min-w-0">
              <Coins size={12} className={critical ? 'text-rose-300' : 'text-indigo-300'} />
              <span className="truncate">
                <span className="text-white font-medium">{actionLabel(lastReceipt.action)}</span>
                <span className="text-white/50"> · {lastReceipt.creditsUsed} credit{lastReceipt.creditsUsed === 1 ? '' : 's'}</span>
              </span>
            </div>
            <span className={`shrink-0 tabular-nums ${critical ? 'text-rose-300 font-semibold' : low ? 'text-amber-200' : 'text-white/55'}`}>
              {Math.round(pctUsed)}% used
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColor}`}
              style={{ width: `${Math.max(2, Math.min(100, pctUsed))}%` }}
            />
          </div>
          {ctaCopy && (
            <button
              onClick={() => {
                jTrack('usage_receipt_cta_clicked', {
                  pct_remaining: Math.round(pctRemaining),
                });
                setShowUpgradeModal(true, 'generic');
                dismissReceipt();
              }}
              className={`mt-2 text-xs font-medium transition-colors ${
                critical ? 'text-rose-200 hover:text-white' : 'text-indigo-200 hover:text-white'
              }`}
            >
              {ctaCopy}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

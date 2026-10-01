import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useAuthStore } from '../store/auth';

/** Bump this (and the notes) to greet everyone once with a new release. */
export const APP_VERSION = 57;
const SEEN_KEY = 'theodore:welcome-version-seen';

const NOTES = [
  'Now writing with Claude Opus 5.5 — every chapter is written by Anthropic’s latest Opus model. Want even more? Pick Claude Fable 5.1 in Settings → AI & Generation.',
  'Characters stay themselves — Theodore now remembers where everyone is, what they know, and how they look from chapter to chapter.',
  'Objects stay put — artifacts keep track of who holds them and what condition they are in.',
  'Established details stick — facts from earlier chapters are carried forward so they don’t quietly change.',
  'Continuity check — chapters flag anything that contradicts what came before, with one-tap re-check.',
  'Smarter Auto-fill — character profiles are filled from your actual story, never generic placeholders.',
];

const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) || 0);
  } catch {
    return APP_VERSION; // storage blocked: don't nag
  }
}

/**
 * "Welcome to Version N" — shown once per browser when a new version ships,
 * on login or on opening the app. Waits for the iOS launch popup so the two
 * never stack.
 */
export function WhatsNewModal() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  // The iOS launch announcement takes precedence for users who haven't seen it.
  const iosPopupPending = !!user && !user.appStoreLaunchSeen && !isAndroid;

  useEffect(() => {
    if (open || iosPopupPending || readSeen() >= APP_VERSION) return;
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [open, iosPopupPending, user?.id]);

  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, String(APP_VERSION));
    } catch {
      // storage blocked — fine, it just closes
    }
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={close}
    >
      <div
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-bg shadow-2xl border border-black/10 p-6 sm:p-8 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="whats-new-title"
      >
        <button
          onClick={close}
          className="absolute top-3 right-3 p-2 rounded-full text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-3 text-text-tertiary">
          <Sparkles size={14} />
          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">What’s new</span>
        </div>
        <h2 id="whats-new-title" className="text-2xl sm:text-3xl font-serif font-bold text-text-primary leading-tight mb-2">
          Welcome to Version {APP_VERSION}
        </h2>
        <p className="text-sm text-text-secondary leading-relaxed mb-5">
          A smarter writer and a story that reads as one continuous book. Theodore now keeps track of your characters, objects, and details across every chapter.
        </p>

        <ul className="space-y-3 mb-6">
          {NOTES.map((note) => {
            const [title, body] = note.split(' — ');
            return (
              <li key={title} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-text-primary flex-shrink-0" />
                <span>
                  <span className="font-semibold text-text-primary">{title}</span>
                  {body && <span className="text-text-secondary"> — {body}</span>}
                </span>
              </li>
            );
          })}
        </ul>

        <button
          onClick={close}
          className="w-full py-3 rounded-xl bg-text-primary text-text-inverse text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Start writing
        </button>
      </div>
    </div>
  );
}

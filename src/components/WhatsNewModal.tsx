import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useAuthStore } from '../store/auth';

/** Bump this (and the notes) to greet everyone once with a new release. */
export const APP_VERSION = 58;
const SEEN_KEY = 'theodore:welcome-version-seen';

const NOTES = [
  'Audiobooks that breathe — narration now has real, measured pauses between paragraphs, speakers and scenes, with even loudness across voices. Regenerate a chapter’s audio, then tap its version badge (e.g. v4/4) to compare it with the earlier version. Each version now shows its speaking pace in words per minute.',
  'Scene breaks you can hear — a *** break gets a proper pause in the audio and a centered break on the page.',
  'Audio no longer skips — scenes play strictly in order, and the player waits for the next one instead of jumping ahead.',
  'Character & object map — plan who changes, how, and when, and where key objects travel through the book.',
  'Story clock and who-knows-what — Theodore tracks the passage of time and which characters know which secrets.',
  'Proper introductions — main characters are introduced the way published novels do it, the first time the reader meets them.',
  'Read synopsis — a one-page synopsis of your book, written to editor standards, with the ending behind a spoiler tap.',
  'Rename everywhere — change a character’s name once and it updates through every chapter; nicknames are listed under aliases.',
  'Rebuild chapter and canon Clean up — redo a chapter from a prompt, and sweep junk entries out of your canon in one step.',
  'Fresher names — a large name bank keeps new characters from all sounding the same.',
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
          Narration with real pauses, plus new tools for planning, naming and summarizing your book.
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

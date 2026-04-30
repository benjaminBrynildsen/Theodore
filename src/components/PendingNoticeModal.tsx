import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';

/**
 * PendingNoticeModal — one-shot in-app announcement triggered by an admin.
 * Reads `user.pendingNotice` from the auth store. If present, shows a centered
 * modal. Dismiss → POST /users/me/dismiss-notice + clear locally.
 */
export function PendingNoticeModal() {
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  // Track local dismissal so a slow /me refetch doesn't re-flash the modal.
  const [localDismissed, setLocalDismissed] = useState<string | null>(null);

  // Reset local dismissal when the user changes (logout/login).
  useEffect(() => {
    if (!user) setLocalDismissed(null);
  }, [user?.id]);

  if (!user || !user.pendingNotice) return null;
  const notice = user.pendingNotice;
  const noticeKey = `${user.id}:${notice.setAt ?? ''}`;
  if (localDismissed === noticeKey) return null;

  const close = async (followCta: boolean) => {
    if (busy) return;
    setBusy(true);
    setLocalDismissed(noticeKey);
    try { await api.dismissNotice(); } catch { /* will resurface on next /me; user can dismiss again */ }
    useAuthStore.setState((s) => (s.user ? { user: { ...s.user, pendingNotice: null } } : s));
    setBusy(false);
    if (followCta && notice.ctaPath) {
      // expo-router-style paths from the admin tool. On web we map common
      // paths to internal navigation; '/' just closes since web's home is
      // already implicit when the modal closes.
      window.location.hash = '';
      try { window.history.replaceState(null, '', notice.ctaPath); } catch {}
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 backdrop-blur-sm px-4"
      onClick={() => close(false)}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-bg shadow-2xl border border-black/10 p-6 sm:p-7 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => close(false)}
          className="absolute top-3 right-3 p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center mb-3">
            <Info size={22} className="text-text-primary" />
          </div>
          <h2 className="text-lg font-serif font-bold text-text-primary mb-2">
            {notice.title}
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed mb-5">
            {notice.body}
          </p>

          <div className="flex gap-2 w-full">
            {notice.ctaText && notice.ctaPath ? (
              <>
                <button
                  onClick={() => close(false)}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-lg border border-black/10 text-sm font-semibold text-text-primary hover:bg-black/5 transition-colors disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => close(true)}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-lg bg-text-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {notice.ctaText}
                </button>
              </>
            ) : (
              <button
                onClick={() => close(false)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-lg bg-text-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Got it
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

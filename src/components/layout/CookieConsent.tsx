import { useEffect, useState } from 'react';

const STORAGE_KEY = 'theodore.cookieConsent.v1';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // ignore (SSR / privacy mode)
    }
  }, []);

  const record = (choice: 'accepted' | 'rejected') => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ choice, at: new Date().toISOString() }),
      );
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-4 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-2xl border border-white/10 bg-neutral-900/95 p-4 text-sm text-neutral-100 shadow-2xl backdrop-blur-md sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex-1">
          <p className="font-medium">We use cookies 🍪</p>
          <p className="mt-1 text-xs text-neutral-300">
            Theodore uses essential cookies to keep you signed in, plus optional
            analytics to help us improve the product. Read our{' '}
            <a
              href="/privacy"
              className="underline decoration-dotted hover:text-white"
            >
              privacy policy
            </a>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => record('rejected')}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-neutral-200 transition hover:bg-white/10"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => record('accepted')}
            className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-neutral-900 transition hover:bg-neutral-200"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

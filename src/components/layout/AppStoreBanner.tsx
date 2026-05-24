import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { track as jTrack } from '../../lib/journey';

const APPSTORE_URL = 'https://apps.apple.com/app/id6762391179?ct=mobile-web-banner';
const DISMISS_KEY = 'theodore_appstore_banner_dismissed_at';
const SUPPRESS_DAYS = 14;
const BANNER_HEIGHT = 56;

function shouldShow(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';

  // iPhone only — iPad and Android skipped (no Android app, iPad is tablet-ish).
  const isIPhone = /iPhone/i.test(ua);
  if (!isIPhone) return false;

  // Standalone PWA mode means the user already added Theodore to home screen
  // and is effectively treating the web app as their app — don't pester.
  if ((navigator as any).standalone === true) return false;

  // Suppress if dismissed within SUPPRESS_DAYS.
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw) {
      const ts = Number(raw);
      if (Number.isFinite(ts)) {
        const ageDays = (Date.now() - ts) / 86400000;
        if (ageDays < SUPPRESS_DAYS) return false;
      }
    }
  } catch {}

  return true;
}

export function AppStoreBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldShow()) return;
    setVisible(true);
  }, []);

  // Push the rest of the page down so the fixed banner doesn't cover content.
  useEffect(() => {
    if (!visible) return;
    document.body.style.paddingTop = `${BANNER_HEIGHT}px`;
    return () => {
      document.body.style.paddingTop = '';
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    jTrack('appstore_banner_shown', { surface: 'mobile_web_top' });
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    jTrack('appstore_banner_dismissed', { surface: 'mobile_web_top' });
    setVisible(false);
  };

  const openAppStore = () => {
    jTrack('appstore_banner_clicked', { surface: 'mobile_web_top' });
  };

  return (
    <div
      className="fixed top-0 inset-x-0 z-[100] bg-text-primary text-white px-3 flex items-center gap-3 shadow-lg"
      style={{ height: BANNER_HEIGHT }}
    >
      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-lg font-serif flex-shrink-0">
        T
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold leading-tight truncate">Theodore NOW on the IOS App Store</div>
        <div className="text-[11px] text-white/70 leading-tight truncate">Voice Mode + Seamless Mobile Experience.</div>
      </div>
      <a
        href={APPSTORE_URL}
        onClick={openAppStore}
        className="px-3 py-1.5 rounded-full bg-white text-text-primary text-xs font-semibold flex-shrink-0"
      >
        App Store
      </a>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="w-7 h-7 rounded-full flex items-center justify-center text-white/70 hover:text-white flex-shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
}

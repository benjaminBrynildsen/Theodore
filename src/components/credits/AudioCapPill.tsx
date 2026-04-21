import { useEffect, useState } from 'react';
import { Headphones, X } from 'lucide-react';
import { useAuthStore } from '../../store/auth';
import { useCreditsStore } from '../../store/credits';
import { useStore } from '../../store';
import { track as jTrack } from '../../lib/journey';

const DISMISS_KEY_PREFIX = 'theodore_audio_cap_pill_dismissed_';
const AUDIO_CAP_SECONDS = 60;

function isCapped(userId: string | undefined | null) {
  if (!userId) return false;
  const listened = Number(localStorage.getItem(`theodore_audio_listened_${userId}`) || '0');
  return listened >= AUDIO_CAP_SECONDS;
}

export function AudioCapPill() {
  const user = useAuthStore((s) => s.user);
  const planTier = useCreditsStore((s) => s.plan.tier);
  const currentView = useStore((s) => s.currentView);
  const setShowUpgradeModal = useCreditsStore((s) => s.setShowUpgradeModal);
  const [visible, setVisible] = useState(false);

  // Only show on chapter/project views — not on home or settings.
  const onChapterView = currentView === 'chapter' || currentView === 'project';

  useEffect(() => {
    if (!user || planTier !== 'free' || !onChapterView) {
      setVisible(false);
      return;
    }
    const dismissKey = DISMISS_KEY_PREFIX + user.id;
    const dismissed = localStorage.getItem(dismissKey) === '1';
    const compute = () => {
      if (dismissed) return false;
      return isCapped(user.id);
    };
    setVisible(compute());

    const onCap = () => {
      if (localStorage.getItem(dismissKey) !== '1') setVisible(true);
    };
    window.addEventListener('theodore:audioCapHit', onCap);
    return () => window.removeEventListener('theodore:audioCapHit', onCap);
  }, [user, planTier, onChapterView]);

  if (!visible || !user) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY_PREFIX + user.id, '1');
    setVisible(false);
    jTrack('audio_cap_pill_dismissed');
  };

  const upgrade = () => {
    jTrack('audio_cap_pill_clicked');
    setShowUpgradeModal(true, 'audio_cap');
  };

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 z-[55] animate-slide-in-right">
      <div
        className="flex items-center gap-2.5 pl-3 pr-1 py-1.5 rounded-full shadow-lg border border-white/10 backdrop-blur-md"
        style={{ background: 'rgba(20, 20, 28, 0.9)' }}
      >
        <Headphones size={14} className="text-white/70 flex-shrink-0" />
        <button
          onClick={upgrade}
          className="text-xs text-white/90 hover:text-white font-medium whitespace-nowrap"
        >
          I want to listen to your book · <span className="text-emerald-300">Upgrade</span>
        </button>
        <button
          onClick={dismiss}
          className="p-1 rounded-full hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

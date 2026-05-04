import { useState } from 'react';
import { IosLaunchModal } from '../IosLaunchModal';
import { useAuthStore } from '../../store/auth';

/**
 * /iostest — sandbox for tweaking the iOS-launch announcement modal before
 * wiring it into the real post-login flow. Notify-me click is stubbed (logs
 * to console + resolves a promise). Real persistence + admin tracking land
 * in a follow-up once the design is locked.
 */
export function IosLaunchTest() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(true);
  const [forceOptedIn, setForceOptedIn] = useState(false);
  const [launchLabel, setLaunchLabel] = useState('Friday, May 8');
  const [emailOverride, setEmailOverride] = useState<string>('');
  const [lastClick, setLastClick] = useState<string>('');

  const handleNotify = async () => {
    setLastClick(new Date().toLocaleTimeString());
    // Simulate a network call so the spinner state is visible.
    await new Promise((r) => setTimeout(r, 600));
    console.log('[IosLaunchTest] Notify-me clicked', { user: user?.email });
  };

  const email = emailOverride || user?.email || null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 sm:p-10 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-serif font-bold mb-2">iOS Launch Modal — Test</h1>
        <p className="text-white/40 text-sm mb-8">
          Tweak the announcement that pops up after login when the iOS app goes live.
          Nothing here writes to the DB yet.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          <Control label="Modal state">
            <button
              onClick={() => setOpen(true)}
              className="w-full px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-semibold transition-colors"
            >
              Reopen modal
            </button>
          </Control>

          <Control label="View">
            <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
              <input
                type="checkbox"
                checked={forceOptedIn}
                onChange={(e) => setForceOptedIn(e.target.checked)}
                className="w-4 h-4"
              />
              Show post-opt-in confirmation state
            </label>
          </Control>

          <Control label="Launch label">
            <input
              value={launchLabel}
              onChange={(e) => setLaunchLabel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
              placeholder="this Friday"
            />
          </Control>

          <Control label="Email override (confirmation copy)">
            <input
              value={emailOverride}
              onChange={(e) => setEmailOverride(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
              placeholder={user?.email || 'your@email.com'}
            />
          </Control>
        </div>

        <div className="text-xs text-white/30 space-y-1 mb-10">
          <div>Authenticated: {user ? `yes (${user.email})` : 'no'}</div>
          <div>Last notify-me click: {lastClick || '—'}</div>
          <div>Screenshots load from <code className="text-white/50">/launch/theodore-0X-*.png</code></div>
        </div>

        <p className="text-white/30 text-xs">
          Once the design is locked, follow-ups: persist opt-in to DB, list opted-in users in admin,
          gate modal to show once per user after sign-in.
        </p>
      </div>

      <IosLaunchModal
        open={open}
        onClose={() => setOpen(false)}
        onNotifyMe={handleNotify}
        initialOptedIn={forceOptedIn}
        email={email}
        launchLabel={launchLabel}
      />
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

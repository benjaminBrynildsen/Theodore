import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { IosLaunchModal } from './IosLaunchModal';

/**
 * Decides whether to show the iOS launch announcement and wires the modal's
 * Notify-me / Dismiss actions to the server. Mount once at the root.
 *
 * Visibility lifecycle: once the modal is opened for a session it stays
 * mounted until the user closes it — even after we mark it seen on the
 * server — so the post-opt-in confirmation state remains visible.
 */
export function IosLaunchModalGate() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  // True once the user has resolved the modal in this browser session.
  // Prevents reopening if a stale /me refetch returns iosLaunchSeen=false.
  const [resolved, setResolved] = useState(false);

  // Reset on user change (logout/login).
  useEffect(() => {
    setOpen(false);
    setResolved(false);
  }, [user?.id]);

  // Open shortly after the user is known and hasn't seen it yet.
  useEffect(() => {
    if (!user || resolved || open) return;
    if (user.iosLaunchSeen) return;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [user, resolved, open]);

  if (!user) return null;
  if (resolved && !open) return null;
  if (user.iosLaunchSeen && !open) return null;

  const markServerSeen = () => {
    useAuthStore.setState((s) => (
      s.user
        ? { user: { ...s.user, iosLaunchSeen: true } }
        : s
    ));
  };

  const handleNotify = async () => {
    const optInAt = new Date().toISOString();
    try {
      await api.iosLaunchNotify();
    } catch (e) {
      console.warn('[ios-launch-notify] failed', e);
    }
    useAuthStore.setState((s) => (
      s.user
        ? { user: { ...s.user, iosLaunchSeen: true, iosLaunchOptInAt: optInAt } }
        : s
    ));
    // IosLaunchModal flips into its confirmation state when this resolves —
    // keep `open` true so the user can read it. Closing happens via X / Close.
  };

  const handleClose = () => {
    setOpen(false);
    setResolved(true);
    if (!user.iosLaunchOptInAt && !user.iosLaunchSeen) {
      markServerSeen();
      api.iosLaunchDismiss().catch((e) => console.warn('[ios-launch-dismiss] failed', e));
    }
  };

  return (
    <IosLaunchModal
      open={open}
      onClose={handleClose}
      onNotifyMe={handleNotify}
      email={user.email}
      launchLabel="Friday, May 8"
    />
  );
}

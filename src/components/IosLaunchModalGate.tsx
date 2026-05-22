import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { IosLaunchModal } from './IosLaunchModal';

const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/**
 * Shows the "Theodore is now on iOS" announcement once per user and wires
 * the App Store CTA to the seen-tracking endpoint. Hidden on Android, since
 * the app is iPhone-only and the popup would just frustrate them.
 */
export function IosLaunchModalGate() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  // True once the user has resolved the modal in this browser session.
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    setOpen(false);
    setResolved(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user || resolved || open) return;
    if (user.iosLaunchSeen) return;
    if (isAndroid) return;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [user, resolved, open]);

  if (!user || isAndroid) return null;
  if (resolved && !open) return null;
  if (user.iosLaunchSeen && !open) return null;

  const markServerSeen = () => {
    useAuthStore.setState((s) => (
      s.user
        ? { user: { ...s.user, iosLaunchSeen: true } }
        : s
    ));
  };

  const handleGetApp = async () => {
    markServerSeen();
    api.iosLaunchDismiss().catch((e) => console.warn('[ios-launch-dismiss] failed', e));
  };

  const handleClose = () => {
    setOpen(false);
    setResolved(true);
    if (!user.iosLaunchSeen) {
      markServerSeen();
      api.iosLaunchDismiss().catch((e) => console.warn('[ios-launch-dismiss] failed', e));
    }
  };

  return (
    <IosLaunchModal
      open={open}
      onClose={handleClose}
      onGetApp={handleGetApp}
    />
  );
}

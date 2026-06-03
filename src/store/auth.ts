import { create } from 'zustand';
import { api } from '../lib/api';
import { track as trackJourney } from '../lib/journey';
import { useStore } from './index';
import { useCanonStore } from './canon';

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  plan: string;
  creditsRemaining: number;
  creditsTotal: number;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: string | null;
  stripeCurrentPeriodEnd?: string | null;
  stripeCancelAtPeriodEnd?: boolean | null;
  stripePriceTier?: string | null;
  createdAt?: string;
  updatedAt?: string;
  emailVerifiedAt?: string | null;
  // One-shot admin notice surfaced via /api/auth/me. Cleared via dismissNotice.
  pendingNotice?: {
    title: string;
    body: string;
    ctaText?: string;
    ctaPath?: string;
    setAt?: string;
  } | null;
  // Legacy "Coming to iOS" teaser tracking.
  iosLaunchSeen?: boolean;
  iosLaunchOptInAt?: string | null;
  // Post-launch "Theodore is now on iPhone" announcement. Separate flag so
  // users who dismissed the teaser still see the launch popup once.
  appStoreLaunchSeen?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
}

function coerceAuthUser(payload: any): AuthUser | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload.user && typeof payload.user === 'object' ? payload.user : payload;
  if (typeof candidate.id !== 'string' || typeof candidate.email !== 'string') return null;
  return candidate as AuthUser;
}

function clearLocalProjectState() {
  useStore.setState({
    projects: [],
    chapters: [],
    activeProjectId: null,
    activeChapterId: null,
    currentView: 'home',
    canonEntries: [],
    currentUserId: null,
  });
  useCanonStore.setState({
    entries: [],
    activeEntryId: null,
    editingEntryId: null,
  });
  localStorage.removeItem('theodore-app-store');
  localStorage.removeItem('theodore-canon-store');
  localStorage.removeItem('theodore-chat-creation-draft-v1');
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,
  error: null,

  bootstrap: async () => {
    set({ loading: true, error: null });
    try {
      const result = await api.authMe();
      const user = coerceAuthUser(result);
      if (!user) throw new Error('Unexpected auth response shape');
      set({ user, initialized: true, loading: false });
    } catch {
      // DON'T clear local project state on bootstrap failure — a transient network
      // error or slow server would otherwise wipe the user's work. Cross-account
      // leakage on shared devices is handled by the explicit logout() flow.
      set({ user: null, initialized: true, loading: false });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const result = await api.authLogin({ email, password });
      const user = coerceAuthUser(result);
      if (!user) throw new Error('Invalid auth response. Verify Theodore API is running on port 3001.');
      set({ user, loading: false, initialized: true });
      // login is for existing accounts only — server returns 401 on
      // unknown email/password. Fire login_completed (not signup_completed).
      trackJourney('login_completed', { method: 'email', user_id: user.id });
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Login failed.' });
      throw e;
    }
  },

  register: async (email, password, name) => {
    set({ loading: true, error: null });
    try {
      const result = await api.authRegister({ email, password, name });
      const user = coerceAuthUser(result);
      if (!user) throw new Error('Invalid auth response. Verify Theodore API is running on port 3001.');
      set({ user, loading: false, initialized: true });
      // Fire signup_completed for new accounts so the journey funnel can
      // attribute conversions to the originating page (/go, /, etc.).
      // /api/auth/register always creates a new user, but we use the server
      // flag to stay consistent with Google/Apple flows.
      if ((result as any)?.isNewUser) {
        trackJourney('signup_completed', {
          method: 'email',
          user_id: user.id,
          referrer: document.referrer || null,
          entry_url: window.location.href,
        });
      }
      window.dispatchEvent(new Event('theodore:registered'));
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Registration failed.' });
      throw e;
    }
  },

  googleLogin: async (credential) => {
    set({ loading: true, error: null });
    try {
      const result = await api.authGoogle({ credential });
      const user = coerceAuthUser(result);
      if (!user) throw new Error('Google sign-in failed.');
      set({ user, loading: false, initialized: true });
      // Google flow: only fire signup_completed for NEW accounts (server
      // returns isNewUser=true). Returning users get login_completed.
      const attribution = {
        method: 'google',
        user_id: user.id,
        referrer: document.referrer || null,
        entry_url: window.location.href,
      };
      if ((result as any)?.isNewUser) {
        trackJourney('signup_completed', attribution);
      } else {
        trackJourney('login_completed', attribution);
      }
      window.dispatchEvent(new Event('theodore:registered'));
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Google sign-in failed.' });
      throw e;
    }
  },

  logout: async () => {
    set({ loading: true, error: null });
    try {
      await api.authLogout();
    } catch {
      // Continue local cleanup even if network call fails.
    } finally {
      clearLocalProjectState();
      set({ user: null, loading: false, initialized: true });
    }
  },
}));

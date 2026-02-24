import { create } from 'zustand';
import { api } from '../lib/api';
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
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
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
      clearLocalProjectState();
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
    } catch (e: any) {
      set({ loading: false, error: e?.message || 'Registration failed.' });
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

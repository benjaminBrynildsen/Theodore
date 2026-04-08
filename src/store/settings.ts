import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS } from '../types/settings';
import type { AppSettings, WritingStyleSettings, EditorSettings, AISettings, ExportSettings, NotificationSettings, BetaFeatureSettings } from '../types/settings';

export type SettingsSection = 'writing' | 'editor' | 'ai' | 'export' | 'notifications' | 'usage' | 'subscription' | 'beta';

interface SettingsState {
  settings: AppSettings;
  showSettingsView: boolean;
  settingsViewSection: SettingsSection;
  setShowSettingsView: (show: boolean) => void;
  setSettingsViewSection: (section: SettingsSection) => void;
  updateWritingStyle: (updates: Partial<WritingStyleSettings>) => void;
  updateEditor: (updates: Partial<EditorSettings>) => void;
  updateAI: (updates: Partial<AISettings>) => void;
  updateExport: (updates: Partial<ExportSettings>) => void;
  updateNotifications: (updates: Partial<NotificationSettings>) => void;
  updateBeta: (updates: Partial<BetaFeatureSettings>) => void;
  resetAll: () => void;
}

export const useSettingsStore = create<SettingsState>()(persist((set) => ({
  settings: DEFAULT_SETTINGS,
  showSettingsView: false,
  settingsViewSection: 'writing',
  setShowSettingsView: (show) => set({ showSettingsView: show }),
  setSettingsViewSection: (section) => set({ settingsViewSection: section }),
  updateWritingStyle: (updates) => set((s) => ({
    settings: { ...s.settings, writingStyle: { ...s.settings.writingStyle, ...updates } },
  })),
  updateEditor: (updates) => set((s) => ({
    settings: { ...s.settings, editor: { ...s.settings.editor, ...updates } },
  })),
  updateAI: (updates) => set((s) => ({
    settings: { ...s.settings, ai: { ...s.settings.ai, ...updates } },
  })),
  updateExport: (updates) => set((s) => ({
    settings: { ...s.settings, export: { ...s.settings.export, ...updates } },
  })),
  updateNotifications: (updates) => set((s) => ({
    settings: { ...s.settings, notifications: { ...s.settings.notifications, ...updates } },
  })),
  updateBeta: (updates) => set((s) => ({
    settings: { ...s.settings, beta: { ...(s.settings.beta || DEFAULT_SETTINGS.beta), ...updates } },
  })),
  resetAll: () => set({ settings: DEFAULT_SETTINGS }),
}), {
  name: 'theodore-settings',
  partialize: (s) => ({ settings: s.settings }),
  // Migrate persisted state to add `beta` block if missing (existing users
  // upgrading from older settings without the beta section).
  migrate: (persistedState: any) => {
    if (persistedState?.settings && !persistedState.settings.beta) {
      persistedState.settings.beta = DEFAULT_SETTINGS.beta;
    }
    return persistedState;
  },
}));

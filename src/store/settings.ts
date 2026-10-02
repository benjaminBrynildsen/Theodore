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
  // Without a version, zustand never calls migrate — v1 makes it run once.
  version: 2,
  migrate: (persistedState: any, version: number) => {
    // Add `beta` block if missing (older settings without the beta section).
    if (persistedState?.settings && !persistedState.settings.beta) {
      persistedState.settings.beta = DEFAULT_SETTINGS.beta;
    }
    // v1: Claude Opus 5.5 is the default writer. Move users still on the old
    // default (Sonnet / Auto) to Opus once; explicit GPT choices are kept.
    if (version < 1 && persistedState?.settings?.ai) {
      const current = persistedState.settings.ai.preferredModel;
      if (!current || current === 'claude-sonnet' || current === 'auto') {
        persistedState.settings.ai.preferredModel = 'claude-opus';
      }
    }
    // v2: scene breaks get a visible marker, as in published books. A blank
    // line can't be told apart from a paragraph break once it's on the page.
    if (version < 2 && persistedState?.settings?.writingStyle) {
      const ws = persistedState.settings.writingStyle;
      if (!ws.sceneBreakStyle || ws.sceneBreakStyle === 'blank') ws.sceneBreakStyle = '***';
    }
    return persistedState;
  },
}));

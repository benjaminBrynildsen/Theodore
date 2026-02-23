import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '../types/settings';
import type { AppSettings, WritingStyleSettings, EditorSettings, AISettings, ExportSettings, NotificationSettings } from '../types/settings';

export type SettingsSection = 'writing' | 'editor' | 'ai' | 'export' | 'notifications' | 'usage';

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
  resetAll: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
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
  resetAll: () => set({ settings: DEFAULT_SETTINGS }),
}));

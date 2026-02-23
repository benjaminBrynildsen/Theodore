import { create } from 'zustand';
import type { Project, Chapter } from '../types';
import { api } from '../lib/api';

const DEFAULT_USER_ID = 'user-ben';

// Debounce helper for saving
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
function debounceSave(key: string, fn: () => Promise<void>, ms = 500) {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(() => { fn().catch(console.error); }, ms);
}

interface AppState {
  // Data
  projects: Project[];
  chapters: Chapter[];
  activeProjectId: string | null;
  activeChapterId: string | null;
  loading: boolean;
  error: string | null;

  // Data actions
  loadProjects: () => Promise<void>;
  loadChapters: (projectId: string) => Promise<void>;
  addProject: (project: Project) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;
  getActiveProject: () => Project | undefined;

  addChapter: (chapter: Chapter) => Promise<void>;
  updateChapter: (id: string, updates: Partial<Chapter>) => void;
  deleteChapter: (id: string) => Promise<void>;
  setActiveChapter: (id: string | null) => void;
  getProjectChapters: (projectId: string) => Chapter[];

  // Canon (kept for compat — real canon is in canon store)
  canonEntries: any[];
  addCanonEntry: (entry: any) => void;
  updateCanonEntry: (id: string, updates: any) => void;
  getProjectCanon: (projectId: string) => any[];

  // UI State
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;

  // View
  currentView: 'home' | 'project' | 'chapter';
  setCurrentView: (view: 'home' | 'project' | 'chapter') => void;
  showReadingMode: boolean;
  setShowReadingMode: (show: boolean) => void;
  showAudiobook: boolean;
  setShowAudiobook: (show: boolean) => void;
  showToolsView: boolean;
  setShowToolsView: (show: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  projects: [],
  chapters: [],
  activeProjectId: null,
  activeChapterId: null,
  loading: true,
  error: null,
  canonEntries: [],

  // ========== Load from API ==========
  loadProjects: async () => {
    try {
      set({ loading: true, error: null });
      const projects = await api.listProjects(DEFAULT_USER_ID);
      // Map DB fields to frontend types
      const mapped = projects.map((p: any) => ({
        id: p.id,
        title: p.title,
        type: p.type,
        subtype: p.subtype,
        targetLength: p.targetLength || p.target_length,
        toneBaseline: p.toneBaseline || p.tone_baseline || '',
        assistanceLevel: p.assistanceLevel || p.assistance_level || 3,
        ageRange: p.ageRange || p.age_range,
        narrativeControls: p.narrativeControls || p.narrative_controls || {},
        status: p.status,
        createdAt: p.createdAt || p.created_at,
        updatedAt: p.updatedAt || p.updated_at,
      }));
      set({ projects: mapped, loading: false });
      // Auto-select first project
      if (mapped.length > 0 && !get().activeProjectId) {
        set({ activeProjectId: mapped[0].id });
      }
    } catch (e: any) {
      console.error('Failed to load projects:', e);
      set({ loading: false, error: e.message });
    }
  },

  loadChapters: async (projectId: string) => {
    try {
      const chapters = await api.listChapters(projectId);
      const mapped = chapters.map((c: any) => ({
        id: c.id,
        projectId: c.projectId || c.project_id,
        number: c.number,
        title: c.title,
        timelinePosition: c.timelinePosition || c.timeline_position,
        status: c.status,
        premise: c.premise || {},
        prose: c.prose || '',
        referencedCanonIds: c.referencedCanonIds || c.referenced_canon_ids || [],
        aiIntentMetadata: c.aiIntentMetadata || c.ai_intent_metadata,
        validationStatus: c.validationStatus || c.validation_status || { isValid: true, checks: [] },
        createdAt: c.createdAt || c.created_at,
        updatedAt: c.updatedAt || c.updated_at,
      }));
      const existingForProject = get().chapters.filter(ch => ch.projectId === projectId);
      // Do not wipe optimistic/local chapters when backend returns empty.
      if (mapped.length === 0 && existingForProject.length > 0) {
        return;
      }
      // Merge with existing chapters (replace those with same projectId)
      const otherChapters = get().chapters.filter(ch => ch.projectId !== projectId);
      set({ chapters: [...otherChapters, ...mapped] });
    } catch (e: any) {
      console.error('Failed to load chapters:', e);
    }
  },

  // ========== Projects ==========
  addProject: async (project) => {
    set((s) => ({ projects: [...s.projects, project] }));
    try {
      await api.createProject({
        ...project,
        userId: DEFAULT_USER_ID,
        narrativeControls: project.narrativeControls,
      });
    } catch (e) { console.error('Failed to save project:', e); }
  },

  updateProject: (id, updates) => {
    set((s) => ({
      projects: s.projects.map((p) => p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p),
    }));
    debounceSave(`project-${id}`, async () => {
      await api.updateProject(id, updates);
    });
  },

  deleteProject: async (id) => {
    set((s) => ({
      projects: s.projects.filter(p => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
    }));
    await api.deleteProject(id);
  },

  setActiveProject: (id) => {
    set({ activeProjectId: id });
    if (id) get().loadChapters(id);
  },

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },

  // ========== Chapters ==========
  addChapter: async (chapter) => {
    set((s) => ({ chapters: [...s.chapters, chapter] }));
    try {
      await api.createChapter(chapter);
    } catch (e) { console.error('Failed to save chapter:', e); }
  },

  updateChapter: (id, updates) => {
    set((s) => ({
      chapters: s.chapters.map((c) => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c),
    }));
    debounceSave(`chapter-${id}`, async () => {
      await api.updateChapter(id, updates);
    });
  },

  deleteChapter: async (id) => {
    set((s) => ({
      chapters: s.chapters.filter(c => c.id !== id),
      activeChapterId: s.activeChapterId === id ? null : s.activeChapterId,
    }));
    await api.deleteChapter(id);
  },

  setActiveChapter: (id) => set({ activeChapterId: id }),
  getProjectChapters: (projectId) => get().chapters.filter((c) => c.projectId === projectId).sort((a, b) => a.number - b.number),

  // Canon (compat — real canon in canon store)
  addCanonEntry: (entry) => set((s) => ({ canonEntries: [...s.canonEntries, entry] })),
  updateCanonEntry: (id, updates) => set((s) => ({
    canonEntries: s.canonEntries.map((e) => e.id === id ? { ...e, ...updates } : e),
  })),
  getProjectCanon: (projectId) => get().canonEntries.filter((e) => e.projectId === projectId),

  // UI State
  leftSidebarOpen: true,
  rightSidebarOpen: false,
  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),

  // View
  currentView: 'home',
  setCurrentView: (view) => set({ currentView: view }),
  showReadingMode: false,
  setShowReadingMode: (show) => set({ showReadingMode: show }),
  showAudiobook: false,
  setShowAudiobook: (show) => set({ showAudiobook: show }),
  showToolsView: false,
  setShowToolsView: (show) => set({ showToolsView: show }),
}));

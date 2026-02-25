import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Project, Chapter, Scene, EditChatMessage } from '../types';
import { api } from '../lib/api';
import { useCanonStore } from './canon';
import { scanMetadataOccurrences, type MetadataScanResult } from '../lib/metadata-scan';
import {
  isLikelyCharacterNoise,
  isLikelyEntityNoise,
  normalizeEntityKeyForType,
  sanitizeEntityName,
} from '../lib/entity-normalization';
const AUTO_METADATA_TAGS = ['auto-detected', 'chapter-scan'];
type AutoCanonType = 'character' | 'location' | 'system' | 'artifact';
type ChapterSnapshotType = 'ai-generated' | 'human-edit' | 'auto-save';

// Debounce helper for saving
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
function debounceSave(key: string, fn: () => Promise<void>, ms = 500) {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(() => { fn().catch(console.error); }, ms);
}

function normalizeEntityName(value: string): string {
  return sanitizeEntityName(value)
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeEntityNames(names: string[] | undefined, type: AutoCanonType): string[] {
  const uniqueNames: string[] = [];
  const seen = new Set<string>();

  for (const raw of names || []) {
    const normalized = normalizeEntityName(raw);
    if (!normalized) continue;
    if (type === 'character' ? isLikelyCharacterNoise(normalized) : isLikelyEntityNoise(normalized)) continue;
    const key = normalizeEntityKeyForType(type, normalized);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueNames.push(normalized);
  }
  return uniqueNames;
}

function createAutoCanonEntry(projectId: string, type: AutoCanonType, name: string) {
  const canonStore = useCanonStore.getState();
  if (type === 'character') return canonStore.createCharacter(projectId, name);
  if (type === 'location') return canonStore.createLocation(projectId, name);
  if (type === 'system') return canonStore.createSystem(projectId, name);
  return canonStore.createArtifact(projectId, name);
}

function persistScannedMetadataToCanon(
  projectId: string,
  chapterNumber: number,
  scan: MetadataScanResult,
): string[] {
  const canonStore = useCanonStore.getState();
  const autoCanonTypes = new Set<AutoCanonType>(['character', 'location', 'system', 'artifact']);
  const existingKeys = new Set(
    canonStore.getProjectEntries(projectId)
      .filter((entry): entry is typeof entry & { type: AutoCanonType } => autoCanonTypes.has(entry.type as AutoCanonType))
      .map((entry) => {
        const key = normalizeEntityKeyForType(entry.type, entry.name);
        return key ? `${entry.type}:${key}` : '';
      })
      .filter(Boolean),
  );
  const detectedAt = new Date().toISOString();

  const entitiesByType: Record<AutoCanonType, string[]> = {
    character: dedupeEntityNames(scan.newEntities?.characters, 'character'),
    location: dedupeEntityNames(scan.newEntities?.locations, 'location'),
    system: dedupeEntityNames(scan.newEntities?.systems, 'system'),
    artifact: dedupeEntityNames(scan.newEntities?.artifacts, 'artifact'),
  };

  const createdEntryIds: string[] = [];
  for (const type of Object.keys(entitiesByType) as AutoCanonType[]) {
    for (const name of entitiesByType[type]) {
      const normalized = normalizeEntityKeyForType(type, name);
      if (!normalized) continue;
      const key = `${type}:${normalized}`;
      if (existingKeys.has(key)) continue;

      const entry = createAutoCanonEntry(projectId, type, name);
      entry.description = entry.description || 'Auto-detected from chapter prose.';
      entry.tags = Array.from(new Set([...(entry.tags || []), ...AUTO_METADATA_TAGS, `chapter-${chapterNumber}`]));
      const detectionNote = `Auto-detected in Chapter ${chapterNumber} on ${detectedAt}.`;
      entry.notes = entry.notes ? `${entry.notes}\n${detectionNote}` : detectionNote;

      canonStore.addEntry(entry);
      existingKeys.add(key);
      createdEntryIds.push(entry.id);
    }
  }

  return createdEntryIds;
}

function createVersionSnapshot(prose: string, type: ChapterSnapshotType) {
  const words = prose.trim() ? prose.trim().split(/\s+/).length : 0;
  return {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    type,
    wordCount: words,
    preview: prose.slice(0, 220),
    prose,
  };
}

interface AppState {
  // Data
  projects: Project[];
  chapters: Chapter[];
  currentUserId: string | null;
  activeProjectId: string | null;
  activeChapterId: string | null;
  loading: boolean;
  error: string | null;

  // Data actions
  loadProjects: () => Promise<void>;
  setCurrentUserId: (id: string | null) => void;
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

  // Edit Mode
  editMode: boolean;
  activeSceneId: string | null;
  editChatMessages: EditChatMessage[];
  scenesGenerating: boolean;
  editChatLoading: boolean;
  setEditMode: (active: boolean) => void;
  setActiveScene: (sceneId: string | null) => void;
  updateScene: (chapterId: string, sceneId: string, updates: Partial<Scene>) => void;
  setChapterScenes: (chapterId: string, scenes: Scene[]) => void;
  addScene: (chapterId: string, scene: Scene) => void;
  removeScene: (chapterId: string, sceneId: string) => void;
  syncScenesToProse: (chapterId: string) => void;
  addEditChatMessage: (msg: EditChatMessage) => void;
  clearEditChat: () => void;
  setScenesGenerating: (generating: boolean) => void;
  setEditChatLoading: (loading: boolean) => void;

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

export const useStore = create<AppState>()(persist((set, get) => ({
  projects: [],
  chapters: [],
  currentUserId: null,
  activeProjectId: null,
  activeChapterId: null,
  loading: true,
  error: null,
  canonEntries: [],

  // ========== Load from API ==========
  loadProjects: async () => {
    try {
      const userId = get().currentUserId;
      if (!userId) {
        set({
          projects: [],
          chapters: [],
          activeProjectId: null,
          activeChapterId: null,
          loading: false,
          currentView: 'home',
        });
        return;
      }
      set({ loading: true, error: null });
      const projects = await api.listProjects(userId);
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
      const currentActiveProjectId = get().activeProjectId;
      const hasValidActiveProject = !!currentActiveProjectId && mapped.some((p) => p.id === currentActiveProjectId);

      if (mapped.length === 0) {
        set({
          projects: [],
          loading: false,
          activeProjectId: null,
          activeChapterId: null,
          currentView: 'home',
        });
        return;
      }

      if (!hasValidActiveProject) {
        const currentView = get().currentView;
        set({
          projects: mapped,
          loading: false,
          activeProjectId: mapped[0].id,
          activeChapterId: null,
          currentView: currentView === 'home' ? 'home' : 'project',
        });
        return;
      }

      set({ projects: mapped, loading: false });
    } catch (e: any) {
      console.error('Failed to load projects:', e);
      set({ loading: false, error: e.message });
    }
  },

  setCurrentUserId: (id) => set({ currentUserId: id }),

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
        scenes: c.scenes || c.scenes || [],
        editChatHistory: c.editChatHistory || c.edit_chat_history || [],
        createdAt: c.createdAt || c.created_at,
        updatedAt: c.updatedAt || c.updated_at,
      }));
      const existingForProject = get().chapters.filter(ch => ch.projectId === projectId);
      // Do not wipe optimistic/local chapters when backend returns empty.
      if (mapped.length === 0 && existingForProject.length > 0) {
        return;
      }
      const otherChapters = get().chapters.filter(ch => ch.projectId !== projectId);
      // If backend is lagging and returns fewer records than local, keep local superset.
      if (existingForProject.length > 0 && mapped.length < existingForProject.length) {
        const byId = new Map(existingForProject.map((ch) => [ch.id, ch] as const));
        for (const ch of mapped) {
          byId.set(ch.id, { ...byId.get(ch.id), ...ch } as Chapter);
        }
        set({ chapters: [...otherChapters, ...Array.from(byId.values())] });
        return;
      }
      // Replace project chapters when backend has an equal/greater set.
      set({ chapters: [...otherChapters, ...mapped] });
    } catch (e: any) {
      console.error('Failed to load chapters:', e);
    }
  },

  // ========== Projects ==========
  addProject: async (project) => {
    set((s) => ({ projects: [...s.projects, project] }));
    try {
      const userId = get().currentUserId;
      if (!userId) throw new Error('Not authenticated');
      await api.createProject({
        ...project,
        userId,
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
    const current = get().chapters.find((c) => c.id === id);
    let mergedUpdates: Partial<Chapter> = updates;
    if (current && typeof updates.prose === 'string') {
      const canonEntries = useCanonStore.getState().getProjectEntries(current.projectId);
      const scan = scanMetadataOccurrences(updates.prose, canonEntries);
      const existingAiMeta = (current.aiIntentMetadata || {}) as Record<string, any>;
      const incomingAiMeta = (updates.aiIntentMetadata || {}) as Record<string, any>;
      const incomingRefs = Array.isArray(updates.referencedCanonIds) ? updates.referencedCanonIds : [];
      const mentionRefs = (scan.existingMentions || []).map((mention) => mention.canonId);
      const mergedRefs = Array.from(new Set([...(current.referencedCanonIds || []), ...incomingRefs, ...mentionRefs]));
      const existingHistory = Array.isArray(existingAiMeta.versionHistory) ? existingAiMeta.versionHistory : [];
      const incomingHistory = Array.isArray(incomingAiMeta.versionHistory) ? incomingAiMeta.versionHistory : [];
      const versionHistory = [...existingHistory, ...incomingHistory];
      const proseChanged = updates.prose !== current.prose;

      if (proseChanged && updates.prose.trim()) {
        const diffChars = Math.abs((updates.prose || '').length - (current.prose || '').length);
        const historySource = String(incomingAiMeta.historySource || '');
        const snapshotType: ChapterSnapshotType =
          historySource === 'ai-generated' || updates.status === 'draft-generated'
            ? 'ai-generated'
            : historySource === 'human-edit' || updates.status === 'human-edited'
            ? 'human-edit'
            : 'auto-save';
        const shouldSnapshot = snapshotType === 'ai-generated' || diffChars >= 260;
        const lastSnapshot = versionHistory[versionHistory.length - 1];
        if (shouldSnapshot && (!lastSnapshot || lastSnapshot.prose !== updates.prose)) {
          versionHistory.push(createVersionSnapshot(updates.prose, snapshotType));
        }
      }

      mergedUpdates = {
        ...updates,
        referencedCanonIds: mergedRefs,
        aiIntentMetadata: {
          ...existingAiMeta,
          ...incomingAiMeta,
          versionHistory: versionHistory.slice(-30),
          metadataScan: scan,
        } as any,
      };
    }

    set((s) => ({
      chapters: s.chapters.map((c) => c.id === id ? { ...c, ...mergedUpdates, updatedAt: new Date().toISOString() } : c),
    }));
    debounceSave(`chapter-${id}`, async () => {
      let payload: Partial<Chapter> = mergedUpdates;
      if (typeof updates.prose === 'string' && current) {
        const updated = get().chapters.find((c) => c.id === id);
        const scan = (updated?.aiIntentMetadata as any)?.metadataScan;
        if (scan) {
          const createdCanonIds = persistScannedMetadataToCanon(current.projectId, current.number, scan);
          const existingRefs = Array.isArray(updated?.referencedCanonIds) ? updated!.referencedCanonIds : [];
          const mentionRefs = (scan.existingMentions || []).map((mention: any) => mention.canonId);
          const nextRefs = Array.from(new Set([...existingRefs, ...mentionRefs, ...createdCanonIds]));
          if (nextRefs.length !== existingRefs.length) {
            set((s) => ({
              chapters: s.chapters.map((c) => c.id === id ? { ...c, referencedCanonIds: nextRefs, updatedAt: new Date().toISOString() } : c),
            }));
            payload = { ...payload, referencedCanonIds: nextRefs };
          }

          console.info('[MetadataScan]', {
            chapterId: id,
            existingMentions: scan.existingMentions?.slice(0, 8),
            newCharacters: scan.newEntities?.characters,
            newLocations: scan.newEntities?.locations,
            newSystems: scan.newEntities?.systems,
            newArtifacts: scan.newEntities?.artifacts,
            createdCanonEntries: createdCanonIds.length,
          });
        }
      }
      await api.updateChapter(id, payload);
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

  // Edit Mode
  editMode: false,
  activeSceneId: null,
  editChatMessages: [],
  scenesGenerating: false,
  editChatLoading: false,

  setEditMode: (active) => {
    if (!active) {
      // Sync scenes to prose on exit
      const chapterId = get().activeChapterId;
      if (chapterId) {
        const chapter = get().chapters.find(c => c.id === chapterId);
        if (chapter?.scenes?.length) {
          const sorted = [...chapter.scenes].sort((a, b) => a.order - b.order);
          const combinedProse = sorted.map(s => s.prose).filter(Boolean).join('\n\n***\n\n');
          if (combinedProse.trim()) {
            get().updateChapter(chapterId, { prose: combinedProse });
          }
        }
      }
      set({ editMode: false, activeSceneId: null, editChatMessages: [] });
    } else {
      set({ editMode: true });
    }
  },

  setActiveScene: (sceneId) => set({ activeSceneId: sceneId }),

  updateScene: (chapterId, sceneId, updates) => {
    set((s) => ({
      chapters: s.chapters.map((c) => {
        if (c.id !== chapterId) return c;
        const scenes = (c.scenes || []).map((sc) =>
          sc.id === sceneId ? { ...sc, ...updates } : sc
        );
        return { ...c, scenes, updatedAt: new Date().toISOString() };
      }),
    }));
    // Debounced save of scenes to backend
    debounceSave(`scene-${chapterId}-${sceneId}`, async () => {
      const chapter = get().chapters.find(c => c.id === chapterId);
      if (chapter) {
        await api.updateChapter(chapterId, { scenes: chapter.scenes });
      }
    });
  },

  setChapterScenes: (chapterId, scenes) => {
    set((s) => ({
      chapters: s.chapters.map((c) =>
        c.id === chapterId ? { ...c, scenes, updatedAt: new Date().toISOString() } : c
      ),
    }));
    debounceSave(`scenes-${chapterId}`, async () => {
      await api.updateChapter(chapterId, { scenes });
    });
  },

  addScene: (chapterId, scene) => {
    set((s) => ({
      chapters: s.chapters.map((c) =>
        c.id === chapterId ? { ...c, scenes: [...(c.scenes || []), scene], updatedAt: new Date().toISOString() } : c
      ),
    }));
    debounceSave(`scenes-add-${chapterId}`, async () => {
      const chapter = get().chapters.find(c => c.id === chapterId);
      if (chapter) await api.updateChapter(chapterId, { scenes: chapter.scenes });
    });
  },

  removeScene: (chapterId, sceneId) => {
    set((s) => ({
      chapters: s.chapters.map((c) =>
        c.id === chapterId ? { ...c, scenes: (c.scenes || []).filter(sc => sc.id !== sceneId), updatedAt: new Date().toISOString() } : c
      ),
    }));
    debounceSave(`scenes-rm-${chapterId}`, async () => {
      const chapter = get().chapters.find(c => c.id === chapterId);
      if (chapter) await api.updateChapter(chapterId, { scenes: chapter.scenes });
    });
  },

  syncScenesToProse: (chapterId) => {
    const chapter = get().chapters.find(c => c.id === chapterId);
    if (!chapter?.scenes?.length) return;
    const sorted = [...chapter.scenes].sort((a, b) => a.order - b.order);
    const combinedProse = sorted.map(s => s.prose).filter(Boolean).join('\n\n***\n\n');
    get().updateChapter(chapterId, { prose: combinedProse });
  },

  addEditChatMessage: (msg) => set((s) => ({ editChatMessages: [...s.editChatMessages, msg] })),
  clearEditChat: () => set({ editChatMessages: [] }),
  setScenesGenerating: (generating) => set({ scenesGenerating: generating }),
  setEditChatLoading: (loading) => set({ editChatLoading: loading }),

  // View
  currentView: 'home',
  setCurrentView: (view) => set({ currentView: view }),
  showReadingMode: false,
  setShowReadingMode: (show) => set({ showReadingMode: show }),
  showAudiobook: false,
  setShowAudiobook: (show) => set({ showAudiobook: show }),
  showToolsView: false,
  setShowToolsView: (show) => set({ showToolsView: show }),
}), {
  name: 'theodore-app-store',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    projects: state.projects,
    chapters: state.chapters,
    currentUserId: state.currentUserId,
    activeProjectId: state.activeProjectId,
    activeChapterId: state.activeChapterId,
    currentView: state.currentView,
    canonEntries: state.canonEntries,
  }),
}));

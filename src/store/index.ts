import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Project, Chapter, Scene, EditChatMessage, ProseSelection } from '../types';
import { api } from '../lib/api';
import { normalizeSceneBreaks } from '../lib/clean-prose';
import { useSettingsStore } from './settings';
import { useCanonStore } from './canon';
import { scanMetadataOccurrences } from '../lib/metadata-scan';
import { analyzeSceneEmotion, hashProse, isMetadataStale } from '../lib/emotion-analyzer';
type ChapterSnapshotType = 'ai-generated' | 'human-edit' | 'auto-save';

// Debounce helper for saving
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
function debounceSave(key: string, fn: () => Promise<void>, ms = 500) {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(() => { fn().catch(console.error); }, ms);
}

// Wrap localStorage so a QuotaExceededError (iOS 5MB cap) doesn't crash the
// app. On overflow we drop the persisted store entirely — better to re-fetch
// from the server than to crash. Caller is zustand persist; it will re-write
// (smaller, partialized) state on the next mutation.
function safeLocalStorage(): Storage {
  return {
    getItem: (key) => {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    setItem: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch (err) {
        // Likely QuotaExceededError. Wipe both Theodore stores so the next
        // write has clean room, then retry once. If that still fails, swallow
        // — losing the cache is the lesser evil vs a crashed app.
        try {
          localStorage.removeItem('theodore-app-store');
          localStorage.removeItem('theodore-canon-store');
          localStorage.setItem(key, value);
        } catch (err2) {
          console.warn('[store] localStorage quota exceeded, persistence disabled this session', err2);
        }
      }
    },
    removeItem: (key) => {
      try { localStorage.removeItem(key); } catch {}
    },
    get length() { try { return localStorage.length; } catch { return 0; } },
    key: (i) => { try { return localStorage.key(i); } catch { return null; } },
    clear: () => { try { localStorage.clear(); } catch {} },
  };
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
  rescanChapterMetadata: (chapterId: string) => Promise<void>;

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
  inlineEditOpen: boolean;
  activeSceneId: string | null;
  editChatMessages: EditChatMessage[];
  scenesGenerating: boolean;
  editChatLoading: boolean;
  setEditMode: (active: boolean) => void;
  setInlineEditOpen: (open: boolean) => void;
  inlineSelection: ProseSelection | null;
  setInlineSelection: (selection: ProseSelection | null) => void;
  editHighlight: { start: number; end: number } | null;
  setEditHighlight: (highlight: { start: number; end: number } | null) => void;
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

  // Emotion Analysis
  emotionAnalyzing: boolean;
  analyzeChapterEmotions: (chapterId: string) => Promise<void>;

  // View
  currentView: 'home' | 'project' | 'chapter';
  setCurrentView: (view: 'home' | 'project' | 'chapter') => void;
  showReadingMode: boolean;
  setShowReadingMode: (show: boolean) => void;
  showAudiobook: boolean;
  setShowAudiobook: (show: boolean) => void;
  showToolsView: boolean;
  setShowToolsView: (show: boolean) => void;
  // Mobile drawer state
  mobilePanel: 'left' | 'studio' | null;
  setMobilePanel: (panel: 'left' | 'studio' | null) => void;
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
        childrensBookSettings: p.childrensBookSettings || p.childrens_book_settings,
        storyStructureId: p.storyStructureId || p.story_structure_id,
        narrativeControls: p.narrativeControls || p.narrative_controls || {},
        coverUrl: p.coverUrl || p.cover_url || undefined,
        threadPlan: p.threadPlan || p.thread_plan || null,
        arcPlan: p.arcPlan || p.arc_plan || null,
        status: p.status,
        chapterCount: typeof p.chapterCount === 'number' ? p.chapterCount : (typeof p.chapter_count === 'number' ? p.chapter_count : undefined),
        wordCount: typeof p.wordCount === 'number' ? p.wordCount : (typeof p.word_count === 'number' ? p.word_count : undefined),
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
        scenes: (c.scenes || []).filter((s: any) => s && s.id),
        editChatHistory: c.editChatHistory || c.edit_chat_history || [],
        imageUrl: c.imageUrl || c.image_url,
        illustrationNotes: c.illustrationNotes || c.illustration_notes,
        createdAt: c.createdAt || c.created_at,
        updatedAt: c.updatedAt || c.updated_at,
      }));
      // One-time cleanup: models sometimes write '---' / '***' lines as scene
      // breaks even when the style is blank lines, and the reader shows them
      // verbatim. Normalize to the author's style and save it back (with the
      // scenes, so the server doesn't clear them on a prose-only update).
      const breakStyle = useSettingsStore.getState().settings.writingStyle?.sceneBreakStyle || '***';
      for (const ch of mapped) {
        const prose = normalizeSceneBreaks(ch.prose, breakStyle);
        const scenes = ch.scenes.map((s: Scene) => (s.prose ? { ...s, prose: normalizeSceneBreaks(s.prose, breakStyle) } : s));
        const scenesChanged = scenes.some((s: Scene, i: number) => s.prose !== ch.scenes[i].prose);
        if (prose !== ch.prose || scenesChanged) {
          ch.prose = prose;
          ch.scenes = scenes;
          api.updateChapter(ch.id, { prose, scenes }).catch((e) => console.warn('[SceneBreaks] cleanup save failed:', e));
        }
      }
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

    // Mirror server: prose edits invalidate cached scenes so audio regen re-decomposes from new text.
    if (typeof updates.prose === 'string' && !('scenes' in updates)) {
      mergedUpdates = { ...mergedUpdates, scenes: [] };
    }

    set((s) => ({
      chapters: s.chapters.map((c) => c.id === id ? { ...c, ...mergedUpdates, updatedAt: new Date().toISOString() } : c),
    }));
    // If prose changed, save it immediately so post-edit pipeline can't cancel it
    if (typeof updates.prose === 'string') {
      api.updateChapter(id, { prose: updates.prose, status: mergedUpdates.status }).catch(console.error);
    }
    // Any prose change (extend, AI edit, manual edit, polish) re-extracts
    // continuity memory once the text settles — no-op if the story didn't move.
    if (current && typeof updates.prose === 'string' && updates.prose !== current.prose && updates.prose.trim()) {
      import('../lib/post-generation-pipeline')
        .then(({ scheduleContinuityRefresh }) => scheduleContinuityRefresh(id))
        .catch(() => {});
    }
    debounceSave(`chapter-${id}`, async () => {
      let payload: Partial<Chapter> = mergedUpdates;
      if (typeof updates.prose === 'string' && current) {
        const updated = get().chapters.find((c) => c.id === id);
        const scan = (updated?.aiIntentMetadata as any)?.metadataScan;
        if (scan) {
          // Link mentions of existing canon only. New canon comes from planning
          // and the continuity extractor, never from scanning prose for words.
          const existingRefs = Array.isArray(updated?.referencedCanonIds) ? updated!.referencedCanonIds : [];
          const mentionRefs = (scan.existingMentions || []).map((mention: any) => mention.canonId);
          const nextRefs = Array.from(new Set([...existingRefs, ...mentionRefs]));
          if (nextRefs.length !== existingRefs.length) {
            set((s) => ({
              chapters: s.chapters.map((c) => c.id === id ? { ...c, referencedCanonIds: nextRefs, updatedAt: new Date().toISOString() } : c),
            }));
            payload = { ...payload, referencedCanonIds: nextRefs };
          }

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

  setActiveChapter: (id) => set({ activeChapterId: id, ...(id ? { leftSidebarOpen: true, rightSidebarOpen: true } : {}) }),
  getProjectChapters: (projectId) => get().chapters.filter((c) => c.projectId === projectId).sort((a, b) => a.number - b.number),

  rescanChapterMetadata: async (chapterId) => {
    const chapter = get().chapters.find((c) => c.id === chapterId);
    if (!chapter?.prose) return;

    // Re-link this chapter to the canon it mentions. This no longer creates
    // entries: capitalized-word scanning turned "We'll" and "Three" into
    // characters. New canon comes from planning and the continuity extractor.
    const canonStore = useCanonStore.getState();
    const freshCanon = canonStore.getProjectEntries(chapter.projectId);
    const scan = scanMetadataOccurrences(chapter.prose, freshCanon);
    const createdIds: string[] = [];

    // 6. Collect all candidate ref IDs
    const mentionRefs = (scan.existingMentions || []).map((m: any) => m.canonId);
    const manualRefs = (chapter.referencedCanonIds || []).filter((id: string) => {
      const entry = freshCanon.find((e) => e.id === id);
      return entry && !entry.tags?.includes('auto-detected');
    });
    const allRefs = Array.from(new Set([...manualRefs, ...mentionRefs, ...createdIds]));

    // 7. Dedup: if "Jack" and "Jack Russo" are both referenced character entries,
    //    suppress the shorter name so only the full name shows
    const refEntries = allRefs
      .map((id) => ({ id, entry: canonStore.getEntry(id) || freshCanon.find((e) => e.id === id) }))
      .filter((r) => r.entry);
    const charRefs = refEntries.filter((r) => r.entry!.type === 'character');
    const suppressedIds = new Set<string>();
    for (const short of charRefs) {
      for (const long of charRefs) {
        if (short.id === long.id) continue;
        const shortName = short.entry!.name.toLowerCase();
        const longName = long.entry!.name.toLowerCase();
        if (longName.includes(shortName) && longName.length > shortName.length) {
          suppressedIds.add(short.id);
        }
      }
    }
    const nextRefs = allRefs.filter((id) => !suppressedIds.has(id));

    set((s) => ({
      chapters: s.chapters.map((c) =>
        c.id === chapterId
          ? { ...c, referencedCanonIds: nextRefs, aiIntentMetadata: { ...(c.aiIntentMetadata as any), metadataScan: scan } }
          : c
      ),
    }));
  },

  // Canon (compat — real canon in canon store)
  addCanonEntry: (entry) => set((s) => ({ canonEntries: [...s.canonEntries, entry] })),
  updateCanonEntry: (id, updates) => set((s) => ({
    canonEntries: s.canonEntries.map((e) => e.id === id ? { ...e, ...updates } : e),
  })),
  getProjectCanon: (projectId) => get().canonEntries.filter((e) => e.projectId === projectId),

  // UI State
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),

  // Edit Mode
  editMode: false,
  inlineEditOpen: false,
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
          const combinedProse = sorted.map(s => s.prose).filter(Boolean).join('\n\n');
          if (combinedProse.trim()) {
            get().updateChapter(chapterId, { prose: combinedProse });
          }
        }
      }
      set({ editMode: false, activeSceneId: null, editChatMessages: [] });
    } else {
      set({ editMode: true, inlineEditOpen: false });
    }
  },
  setInlineEditOpen: (open) => {
    set({ inlineEditOpen: open, ...(open ? { editMode: false } : {}), ...(!open ? { inlineSelection: null, editHighlight: null } : {}) });
  },
  inlineSelection: null,
  setInlineSelection: (selection) => set({ inlineSelection: selection }),
  editHighlight: null,
  setEditHighlight: (highlight) => set({ editHighlight: highlight }),

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

    // Queue emotional analysis if prose changed significantly
    if (typeof updates.prose === 'string') {
      debounceSave(`emotion-${sceneId}`, async () => {
        const chapter = get().chapters.find(c => c.id === chapterId);
        if (!chapter) return;
        const scene = (chapter.scenes || []).find(s => s.id === sceneId);
        if (!scene?.prose?.trim() || !isMetadataStale(scene)) return;

        const project = get().projects.find(p => p.id === chapter.projectId);
        const sortedScenes = (chapter.scenes || []).filter(s => s.prose?.trim()).sort((a, b) => a.order - b.order);
        const sceneIdx = sortedScenes.findIndex(s => s.id === sceneId);
        const prevScene = sceneIdx > 0 ? sortedScenes[sceneIdx - 1] : null;

        try {
          const metadata = await analyzeSceneEmotion({
            scene,
            chapterEmotionalBeat: chapter.premise?.emotionalBeat,
            previousSceneEndEmotion: prevScene?.emotionalMetadata?.arc?.end,
            narrativeControls: project?.narrativeControls,
            projectId: chapter.projectId,
            chapterId,
          });

          // Save metadata back to scene
          set((s) => ({
            chapters: s.chapters.map((c) => {
              if (c.id !== chapterId) return c;
              const scenes = (c.scenes || []).map((sc) =>
                sc.id === sceneId ? { ...sc, emotionalMetadata: metadata } : sc
              );
              return { ...c, scenes };
            }),
          }));

          // Persist to backend
          const updated = get().chapters.find(c => c.id === chapterId);
          if (updated) {
            await api.updateChapter(chapterId, { scenes: updated.scenes });
          }
        } catch (e) {
          console.error('[EmotionAnalysis] Auto-analysis failed for scene', sceneId, e);
        }
      }, 3000); // 3 second debounce for analysis (longer than save)
    }
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
    const combinedProse = sorted.map(s => s.prose).filter(Boolean).join('\n\n');
    get().updateChapter(chapterId, { prose: combinedProse });
  },

  addEditChatMessage: (msg) => set((s) => ({ editChatMessages: [...s.editChatMessages, msg] })),
  clearEditChat: () => set({ editChatMessages: [] }),
  setScenesGenerating: (generating) => set({ scenesGenerating: generating }),
  setEditChatLoading: (loading) => set({ editChatLoading: loading }),

  // Emotion Analysis
  emotionAnalyzing: false,
  analyzeChapterEmotions: async (chapterId: string) => {
    const chapter = get().chapters.find(c => c.id === chapterId);
    if (!chapter?.scenes?.length) return;

    const project = get().projects.find(p => p.id === chapter.projectId);
    const scenes = chapter.scenes.filter(s => s.prose?.trim()).sort((a, b) => a.order - b.order);
    if (scenes.length === 0) return;

    set({ emotionAnalyzing: true });

    try {
      const { analyzeChapterScenes } = await import('../lib/emotion-analyzer');
      const results = await analyzeChapterScenes(scenes, {
        chapterEmotionalBeat: chapter.premise?.emotionalBeat,
        narrativeControls: project?.narrativeControls,
        projectId: chapter.projectId,
        chapterId,
      });

      // Apply results to scenes
      set((s) => ({
        chapters: s.chapters.map((c) => {
          if (c.id !== chapterId) return c;
          const updatedScenes = (c.scenes || []).map((sc) => {
            const metadata = results.get(sc.id);
            return metadata ? { ...sc, emotionalMetadata: metadata } : sc;
          });
          return { ...c, scenes: updatedScenes };
        }),
      }));

      // Persist
      const updated = get().chapters.find(c => c.id === chapterId);
      if (updated) {
        await api.updateChapter(chapterId, { scenes: updated.scenes });
      }
    } catch (e) {
      console.error('[EmotionAnalysis] Chapter analysis failed:', e);
    } finally {
      set({ emotionAnalyzing: false });
    }
  },

  // View
  currentView: 'home',
  setCurrentView: (view) => set({ currentView: view }),
  showReadingMode: false,
  setShowReadingMode: (show) => set({ showReadingMode: show }),
  showAudiobook: false,
  setShowAudiobook: (show) => set({ showAudiobook: show }),
  showToolsView: false,
  setShowToolsView: (show) => set({ showToolsView: show }),
  mobilePanel: null,
  setMobilePanel: (panel) => set({ mobilePanel: panel }),
}), {
  name: 'theodore-app-store',
  storage: createJSONStorage(() => safeLocalStorage()),
  // Chapters + canonEntries are NOT persisted — they're heavy (prose, scenes,
  // SFX, voice tags, editChatHistory) and on iOS Safari (5MB cap) they push
  // the serialized state past the quota. The server is source of truth and
  // App.tsx auto-fetches both via loadChapters/loadEntries when the active
  // project changes, so a cold reload reflows in seconds.
  // Incident: 2026-04-28 — iPhone user hit "The quota has been exceeded"
  // after DB growth (multi-voice, scene SFX) bloated chapter payloads.
  partialize: (state) => ({
    projects: state.projects,
    currentUserId: state.currentUserId,
    activeProjectId: state.activeProjectId,
    activeChapterId: state.activeChapterId,
    currentView: state.currentView,
  }),
  onRehydrateStorage: () => (state) => {
    // Sanitize chapters on rehydration — filter out corrupted scenes
    if (state?.chapters) {
      let migrated = false;
      const fixedChapters = state.chapters.filter(c => c && c.id).map(c => {
        // Collect all prose text across the chapter for matching
        const allProse = [c.prose || '', ...(c.scenes || []).map((s: any) => s.prose || '')].join(' ').toLowerCase();

        return {
          ...c,
          scenes: (c.scenes || []).filter((s: any) => s && s.id).map((s: any) => {
            if (s.sfx) {
              const fixedSfx = s.sfx.map((sfx: any) => {
                if (sfx.position === 'background') {
                  // Check if this SFX prompt matches an inline {sfx:...} tag in the prose
                  // Only convert if the prompt literally appears as a tag — don't touch true ambient sounds
                  const promptLower = (sfx.prompt || '').toLowerCase().trim();
                  const isInProse = allProse.includes(`{sfx:${promptLower}}`) ||
                    (s.prose && s.prose.toLowerCase().includes(`{sfx:${promptLower}}`));

                  if (isInProse) {
                    migrated = true;
                    return { ...sfx, position: 'inline' };
                  }
                }
                return sfx;
              });
              return { ...s, sfx: fixedSfx };
            }
            return s;
          }),
        };
      });
      state.chapters = fixedChapters;
      // Force persist the migration
      if (migrated) {
        setTimeout(() => {
          useStore.setState({ chapters: fixedChapters });
          console.log('[Store] Migrated inline SFX tags from background → inline');
        }, 100);
      }
    }
  },
}));

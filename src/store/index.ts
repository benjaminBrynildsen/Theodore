import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Project, Chapter, Scene, EditChatMessage, ProseSelection } from '../types';
import { api } from '../lib/api';
import { useCanonStore } from './canon';
import { scanMetadataOccurrences, type MetadataScanResult } from '../lib/metadata-scan';
import { analyzeSceneEmotion, hashProse, isMetadataStale } from '../lib/emotion-analyzer';
import {
  isLikelyCharacterNoise,
  isLikelyEntityNoise,
  normalizeEntityKeyForType,
  sanitizeEntityName,
} from '../lib/entity-normalization';
const AUTO_METADATA_TAGS = ['auto-detected', 'chapter-scan'];
type AutoCanonType = 'character' | 'location' | 'system' | 'artifact' | 'media';
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

  // Remove short names that are a token-subset of a longer name (e.g. "Jack" absorbed by "Jack Monroe")
  const sorted = [...uniqueNames].sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
  const result: string[] = [];
  const absorbedKeys = new Set<string>();

  for (const name of sorted) {
    const key = normalizeEntityKeyForType(type, name);
    if (absorbedKeys.has(key)) continue;
    result.push(name);
    const tokens = key.split(/\s+/);
    if (tokens.length > 1) {
      for (let len = 1; len < tokens.length; len++) {
        for (let start = 0; start <= tokens.length - len; start++) {
          absorbedKeys.add(tokens.slice(start, start + len).join(' '));
        }
      }
    }
  }
  return result;
}

function createAutoCanonEntry(projectId: string, type: AutoCanonType, name: string) {
  const canonStore = useCanonStore.getState();
  if (type === 'character') return canonStore.createCharacter(projectId, name);
  if (type === 'location') return canonStore.createLocation(projectId, name);
  if (type === 'system') return canonStore.createSystem(projectId, name);
  if (type === 'media') return canonStore.createMedia(projectId, name);
  return canonStore.createArtifact(projectId, name);
}

function persistScannedMetadataToCanon(
  projectId: string,
  chapterNumber: number,
  scan: MetadataScanResult,
): string[] {
  const canonStore = useCanonStore.getState();
  const autoCanonTypes = new Set<AutoCanonType>(['character', 'location', 'system', 'artifact', 'media']);
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
    media: dedupeEntityNames(scan.newEntities?.media, 'media'),
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
  rescanChapterMetadata: (chapterId: string) => void;

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
        scenes: (c.scenes || []).filter((s: any) => s && s.id),
        editChatHistory: c.editChatHistory || c.edit_chat_history || [],
        imageUrl: c.imageUrl || c.image_url,
        illustrationNotes: c.illustrationNotes || c.illustration_notes,
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

  setActiveChapter: (id) => set({ activeChapterId: id, ...(id ? { leftSidebarOpen: true, rightSidebarOpen: true } : {}) }),
  getProjectChapters: (projectId) => get().chapters.filter((c) => c.projectId === projectId).sort((a, b) => a.number - b.number),

  rescanChapterMetadata: (chapterId) => {
    const chapter = get().chapters.find((c) => c.id === chapterId);
    if (!chapter?.prose) return;

    const canonStore = useCanonStore.getState();
    const prose = chapter.prose;

    // 1. Remove ALL auto-detected entries for this chapter,
    //    plus any auto-detected entry that is clearly noise (common word appearing lowercase in prose)
    const projectEntries = canonStore.getProjectEntries(chapter.projectId);
    const chapterTag = `chapter-${chapter.number}`;
    for (const entry of projectEntries) {
      if (!entry.tags?.includes('auto-detected')) continue;
      const isThisChapter = entry.tags?.includes(chapterTag);
      // Also nuke entries that are common words — check if name appears lowercased in prose
      const lower = entry.name.toLowerCase();
      const isSingleWord = !entry.name.includes(' ');
      const isCommonWord = isSingleWord && (
        lower.length < 4 ||
        prose.includes(` ${lower} `) || prose.includes(` ${lower},`) || prose.includes(` ${lower}.`) ||
        prose.includes(` ${lower};`) || prose.includes(` ${lower}!`) || prose.includes(` ${lower}?`) ||
        prose.includes(` ${lower}\n`) || prose.includes(` ${lower}'`) || prose.includes(` ${lower}—`)
      );
      if (isThisChapter || isCommonWord) {
        canonStore.deleteEntry(entry.id);
      }
    }

    // 2. Re-run the scan with the cleaned canon list
    const freshCanon = canonStore.getProjectEntries(chapter.projectId);
    const scan = scanMetadataOccurrences(chapter.prose, freshCanon);

    // 3. Persist new entries
    const createdIds = persistScannedMetadataToCanon(chapter.projectId, chapter.number, scan);

    // 4. Collect all candidate ref IDs
    const mentionRefs = (scan.existingMentions || []).map((m: any) => m.canonId);
    const manualRefs = (chapter.referencedCanonIds || []).filter((id: string) => {
      const entry = freshCanon.find((e) => e.id === id);
      return entry && !entry.tags?.includes('auto-detected');
    });
    const allRefs = Array.from(new Set([...manualRefs, ...mentionRefs, ...createdIds]));

    // 5. Dedup: if "Jack" and "Jack Russo" are both referenced character entries,
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
        // "jack" is a substring of "jack russo" → suppress "jack"
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
          const combinedProse = sorted.map(s => s.prose).filter(Boolean).join('\n\n***\n\n');
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
    const combinedProse = sorted.map(s => s.prose).filter(Boolean).join('\n\n***\n\n');
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

import { create } from 'zustand';
import type { Project, Chapter, CanonEntry } from '../types';

// Simple in-memory store for now — will connect to backend later

interface AppState {
  // Projects
  projects: Project[];
  activeProjectId: string | null;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  setActiveProject: (id: string | null) => void;
  getActiveProject: () => Project | undefined;
  
  // Chapters
  chapters: Chapter[];
  activeChapterId: string | null;
  addChapter: (chapter: Chapter) => void;
  updateChapter: (id: string, updates: Partial<Chapter>) => void;
  setActiveChapter: (id: string | null) => void;
  getProjectChapters: (projectId: string) => Chapter[];
  
  // Canon
  canonEntries: CanonEntry[];
  addCanonEntry: (entry: CanonEntry) => void;
  updateCanonEntry: (id: string, updates: Partial<CanonEntry>) => void;
  getProjectCanon: (projectId: string) => CanonEntry[];
  
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
}

export const useStore = create<AppState>((set, get) => ({
  // Projects — seeded with demo
  projects: [{
    id: 'demo-1',
    title: 'The Midnight Garden',
    type: 'book',
    subtype: 'novel',
    targetLength: 'long',
    toneBaseline: 'mysterious, lyrical',
    assistanceLevel: 3,
    narrativeControls: {
      toneMood: { lightDark: 65, hopefulGrim: 40, whimsicalSerious: 55 },
      pacing: 'balanced',
      dialogueWeight: 'balanced',
      focusMix: { character: 45, plot: 30, world: 25 },
      genreEmphasis: ['mystery', 'adventure'],
    },
    status: 'active',
    createdAt: '2026-02-20T10:00:00Z',
    updatedAt: '2026-02-21T15:30:00Z',
  }],
  activeProjectId: 'demo-1',
  addProject: (project) => set((s) => ({ projects: [...s.projects, project] })),
  updateProject: (id, updates) => set((s) => ({
    projects: s.projects.map((p) => p.id === id ? { ...p, ...updates } : p),
  })),
  setActiveProject: (id) => set({ activeProjectId: id }),
  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },
  
  // Chapters
  chapters: [
    {
      id: 'ch-1',
      projectId: 'demo-1',
      number: 1,
      title: 'The Door in the Wall',
      timelinePosition: 1,
      status: 'draft-generated' as const,
      premise: {
        purpose: 'Introduce Elara and the discovery of the hidden garden behind the crumbling estate wall.',
        changes: 'Elara discovers the key; garden is revealed as a living, breathing entity.',
        characters: ['Elara Voss', 'The Gardener'],
        emotionalBeat: 'Wonder and unease — beauty that feels too perfect',
        setupPayoff: [{ setup: 'The iron key found in grandmother\'s journal', payoff: 'Unlocks the garden gate in Ch. 3' }],
        constraints: ['Must establish Elara\'s skepticism before the reveal', 'Garden should feel inviting but subtly wrong'],
      },
      prose: `The wall had always been there, of course. Elara had passed it every morning on her way to the university — a crumbling stretch of limestone that separated the Ashworth estate from the rest of the world. Ivy had claimed most of it decades ago, thick and dark and possessive, and the locals had long since stopped wondering what lay beyond.\n\nBut today the ivy had pulled back.\n\nNot all of it — just enough to reveal a door. Narrow, arched at the top, set deep into the stone like a secret the wall had been keeping. The wood was old, nearly black, and the iron hinges were red with rust. But the handle — the handle gleamed as if someone had polished it that morning.\n\nElara stopped. Her coffee cooled in her hand. She told herself it was the light, some trick of the early autumn sun slanting through the oaks. Doors didn't just appear. That wasn't how the world worked, and Elara Voss was, above all things, a woman who understood how the world worked.\n\nShe was a postdoctoral researcher in botanical ecology. She had spent four years studying root networks in old-growth forests, mapping the invisible conversations between trees. She believed in data. In observable phenomena. In things she could put her hands on.\n\nAnd yet.\n\nHer hand was already reaching for the handle before she'd made the conscious decision to move. The metal was warm — not sun-warm, but the kind of warmth that suggested something alive on the other side. She pressed down and felt the mechanism give with a soft, oiled click that had no business coming from a door this old.\n\nThe garden opened before her like a held breath finally released.\n\nIt was impossible. That was her first thought, and she would stand by it later when she tried to describe what she'd seen. The Ashworth estate was perhaps two acres — she'd checked the county records once for a research project. But the space beyond the door stretched further than her eyes could follow, a vast and rolling landscape of green that seemed to generate its own light.\n\nPaths of pale stone wound between beds of flowers she didn't recognize — and Elara recognized most flowers. These were larger than they should have been, more vivid, their petals moving in patterns that had nothing to do with the breeze. Some of them turned toward her as she stepped through the doorway, tracking her movement with a slow, deliberate attention.\n\n"You're early," said a voice.\n\nElara spun. A figure stood beside a trellis of climbing roses — except the roses were black, and the figure was not quite what she'd expected. He was tall, thin, dressed in clothes that might have been fashionable a century ago. His hands were gloved in soft leather, and his face was kind in the way that old paintings are kind: composed, careful, revealing nothing.\n\n"I'm sorry?" Elara managed.\n\n"Early," he repeated, as if that clarified everything. He pulled a dead bloom from the trellis and it crumbled to dust between his fingers. "The garden wasn't expecting you until Thursday. But—" He tilted his head, studying her the way she'd been studied by the flowers. "Perhaps it knows something I don't. It usually does."\n\n"Who are you?" She hated how small her voice sounded.\n\n"The Gardener." He said it the way someone might say 'the sky' or 'the ground' — as a fact so obvious it barely warranted stating. "And you, Dr. Voss, are standing on a Whispering Fern. It would appreciate it if you moved."\n\nElara looked down. The fern beneath her boots was trembling — not from her weight, but with something that looked uncomfortably like irritation. She stepped sideways onto the stone path.\n\n"Thank you," the Gardener said. Then, after a pause: "It thanks you too."`,
      referencedCanonIds: ['canon-1', 'canon-2'],
      aiIntentMetadata: {
        model: 'Claude Opus 4',
        role: 'architect',
        prompt: 'Generate opening chapter establishing Elara\'s discovery of the garden',
        generatedAt: '2026-02-21T15:28:00Z',
      },
      validationStatus: { isValid: true, checks: [] },
      createdAt: '2026-02-20T10:05:00Z',
      updatedAt: '2026-02-21T15:28:00Z',
    },
    {
      id: 'ch-2',
      projectId: 'demo-1',
      number: 2,
      title: 'Root Systems',
      timelinePosition: 2,
      status: 'premise-only' as const,
      premise: {
        purpose: 'Elara returns to the university and tries to rationalize what she saw.',
        changes: 'She discovers her grandmother\'s journal mentions the garden.',
        characters: ['Elara Voss', 'Dr. Marcus Webb'],
        emotionalBeat: 'Denial cracking into obsessive curiosity',
        setupPayoff: [],
        constraints: [],
      },
      prose: '',
      referencedCanonIds: [],
      validationStatus: { isValid: true, checks: [] },
      createdAt: '2026-02-20T10:10:00Z',
      updatedAt: '2026-02-20T10:10:00Z',
    },
    {
      id: 'ch-3',
      projectId: 'demo-1',
      number: 3,
      title: 'The Iron Key',
      timelinePosition: 3,
      status: 'premise-only' as const,
      premise: {
        purpose: 'Elara finds the iron key in her grandmother\'s journal and returns to the garden.',
        changes: 'The key unlocks a deeper section of the garden.',
        characters: ['Elara Voss', 'The Gardener'],
        emotionalBeat: 'Crossing the threshold — commitment to the unknown',
        setupPayoff: [],
        constraints: [],
      },
      prose: '',
      referencedCanonIds: [],
      validationStatus: { isValid: true, checks: [] },
      createdAt: '2026-02-20T10:15:00Z',
      updatedAt: '2026-02-20T10:15:00Z',
    },
  ],
  activeChapterId: null,
  addChapter: (chapter) => set((s) => ({ chapters: [...s.chapters, chapter] })),
  updateChapter: (id, updates) => set((s) => ({
    chapters: s.chapters.map((c) => c.id === id ? { ...c, ...updates } : c),
  })),
  setActiveChapter: (id) => set({ activeChapterId: id }),
  getProjectChapters: (projectId) => get().chapters.filter((c) => c.projectId === projectId),
  
  // Canon
  canonEntries: [],
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
}));

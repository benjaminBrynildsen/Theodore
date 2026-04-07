import { Suspense, lazy, useMemo, useState } from 'react';
import {
  ChevronLeft, TrendingUp, BookOpen, BookCopy, FileSignature,
  LayoutGrid, Barcode, Rocket, Users,
  Activity, MessageSquareQuote, Waves, Globe, Image,
  Highlighter, ScrollText, UserPlus,
  BarChart3, Crosshair, GitCompare, MessageCircle, Calendar, BookMarked,
  Heart, BookText, FileText
} from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

type Tool =
  | 'arc' | 'reader' | 'comps' | 'query'
  | 'beats' | 'isbn' | 'launch'
  | 'relationships' | 'dialogue' | 'pacing' | 'tone' | 'preorder'
  | 'xray' | 'recap' | 'cover'
  | 'names' | 'readability' | 'plothole' | 'diff' | 'collab' | 'epub' | 'timeline'
  | 'bible' | 'manuscript' | 'emotion';

type ToolEntry = {
  id: Tool;
  label: string;
  icon: typeof TrendingUp;
  description: string;
  phase: string;
  comingSoon?: boolean;
};

const TOOLS: ToolEntry[] = [
  { id: 'relationships', label: 'Relationships', icon: Users, description: 'Character relationship map with connection types', phase: 'Planning', comingSoon: true },
  { id: 'names', label: 'Name Generator', icon: UserPlus, description: 'Genre-aware names with etymology and phonetics', phase: 'Planning', comingSoon: true },
  { id: 'timeline', label: 'Timeline', icon: Calendar, description: 'Chronological event map with conflict detection', phase: 'Planning', comingSoon: true },
  { id: 'arc', label: 'Story Arc', icon: TrendingUp, description: 'Visualize and reshape your narrative arc', phase: 'Writing', comingSoon: true },
  { id: 'beats', label: 'Scene Beats', icon: LayoutGrid, description: 'Drag beats between chapters to rebalance structure', phase: 'Writing', comingSoon: true },
  { id: 'pacing', label: 'Pacing Heartbeat', icon: Activity, description: 'Tempo waveform — see rhythm across chapters', phase: 'Writing', comingSoon: true },
  { id: 'recap', label: 'Chapter Recap', icon: ScrollText, description: '"Previously on..." summaries for continuity', phase: 'Writing', comingSoon: true },
  { id: 'reader', label: 'First Reader', icon: BookOpen, description: 'AI beta reader — engagement, clarity, pacing feedback', phase: 'Editing', comingSoon: true },
  { id: 'xray', label: 'Prose X-Ray', icon: Highlighter, description: 'Heatmap overlay — dialogue ratio, adverbs, pacing', phase: 'Editing' },
  { id: 'emotion', label: 'Emotion X-Ray', icon: Heart, description: 'Per-scene emotional arc and ambient music suggestions', phase: 'Editing' },
  { id: 'dialogue', label: 'Dialogue Analyzer', icon: MessageSquareQuote, description: 'Voice profiles and character similarity detection', phase: 'Editing', comingSoon: true },
  { id: 'tone', label: 'Tone Drift', icon: Waves, description: 'Detect unintentional tone shifts across chapters', phase: 'Editing', comingSoon: true },
  { id: 'readability', label: 'Readability', icon: BarChart3, description: 'Grade level, reading time, audience targeting', phase: 'Editing', comingSoon: true },
  { id: 'plothole', label: 'Plot Holes', icon: Crosshair, description: 'Detect contradictions and unresolved threads', phase: 'Editing', comingSoon: true },
  { id: 'diff', label: 'Draft Compare', icon: GitCompare, description: 'Diff view between manuscript versions', phase: 'Editing', comingSoon: true },
  { id: 'collab', label: 'Collab Notes', icon: MessageCircle, description: 'Editor and beta reader annotations with threads', phase: 'Editing', comingSoon: true },
  { id: 'bible', label: 'Story Bible Export', icon: BookText, description: 'Export your full canon as markdown, PDF, or DOCX', phase: 'Publishing' },
  { id: 'manuscript', label: 'Manuscript Formatter', icon: FileText, description: 'Format your draft for agents, KDP, or print', phase: 'Publishing' },
  { id: 'comps', label: 'Comp Titles', icon: BookCopy, description: 'Find comparable books for marketing and queries', phase: 'Publishing', comingSoon: true },
  { id: 'query', label: 'Query & Blurb', icon: FileSignature, description: 'Generate query letters, back covers, Amazon descriptions', phase: 'Publishing', comingSoon: true },
  { id: 'isbn', label: 'ISBN & Copyright', icon: Barcode, description: 'Step-by-step publishing paperwork', phase: 'Publishing' },
  { id: 'cover', label: 'Cover Designer', icon: Image, description: 'AI-generated covers at KDP-ready specs', phase: 'Publishing', comingSoon: true },
  { id: 'epub', label: 'ePub Preview', icon: BookMarked, description: 'Kindle/phone/tablet rendering preview', phase: 'Publishing', comingSoon: true },
  { id: 'preorder', label: 'Pre-Order Page', icon: Globe, description: 'Landing page with countdown and email capture', phase: 'Publishing', comingSoon: true },
  { id: 'launch', label: 'Launch Dashboard', icon: Rocket, description: 'Sales, reviews, and rankings post-publish', phase: 'Post-Launch', comingSoon: true },
];

// Only the live tools are lazy-imported. Stub tools render a "Coming soon"
// placeholder, so their feature components don't need to be in the bundle.
const ISBNAssistant = lazy(async () => {
  const mod = await import('../features/ISBNAssistant');
  return { default: mod.ISBNAssistant };
});
const ProseXRay = lazy(async () => {
  const mod = await import('../features/ProseXRay');
  return { default: mod.ProseXRay };
});
const EmotionalXRay = lazy(async () => {
  const mod = await import('../features/EmotionalXRay');
  return { default: mod.EmotionalXRay };
});
const StoryBibleExport = lazy(async () => {
  const mod = await import('../features/StoryBibleExport');
  return { default: mod.StoryBibleExport };
});
const ManuscriptFormatter = lazy(async () => {
  const mod = await import('../features/ManuscriptFormatter');
  return { default: mod.ManuscriptFormatter };
});

function ToolLoader() {
  return (
    <div className="px-4 py-12 text-center text-sm text-text-tertiary sm:px-8">
      Loading tool...
    </div>
  );
}

function ComingSoonPlaceholder({ label }: { label: string }) {
  return (
    <div className="px-4 py-16 text-center sm:px-8">
      <div className="text-4xl mb-3">🛠️</div>
      <h2 className="text-lg font-serif font-semibold mb-1">{label}</h2>
      <p className="text-xs text-text-tertiary max-w-sm mx-auto">
        This tool is coming soon. We're focused on shipping the core writing and audiobook flow first.
      </p>
    </div>
  );
}

/**
 * Wraps a chapter-bound tool (Prose X-Ray, Emotion X-Ray) with a chapter
 * picker. Defaults to the active chapter, falls back to the first chapter
 * in the active project. Lets the user pick any chapter from a dropdown.
 */
function ChapterBoundTool({
  label,
  render,
}: {
  label: string;
  render: (chapterId: string) => JSX.Element;
}) {
  const { getActiveProject, getProjectChapters, activeChapterId } = useStore();
  const project = getActiveProject();
  const projectChapters = useMemo(
    () => (project ? getProjectChapters(project.id).filter((c) => c.prose?.trim()) : []),
    [project, getProjectChapters],
  );
  const defaultId = activeChapterId && projectChapters.some((c) => c.id === activeChapterId)
    ? activeChapterId
    : projectChapters[0]?.id || '';
  const [selectedId, setSelectedId] = useState(defaultId);

  if (!project) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-tertiary sm:px-8">
        Open a project to use {label}.
      </div>
    );
  }
  if (projectChapters.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-tertiary sm:px-8">
        Write or generate a chapter first to use {label}.
      </div>
    );
  }

  const effectiveId = selectedId || defaultId;

  return (
    <div>
      <div className="px-5 pt-5 pb-2 flex items-center gap-3">
        <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Chapter</label>
        <select
          value={effectiveId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="text-sm rounded-lg border border-black/10 bg-white/60 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-black/10"
        >
          {projectChapters.map((c) => (
            <option key={c.id} value={c.id}>
              Ch. {c.number} {c.title ? `— ${c.title}` : ''}
            </option>
          ))}
        </select>
      </div>
      {render(effectiveId)}
    </div>
  );
}

export function ToolsView({ onClose }: { onClose: () => void }) {
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const activeToolEntry = activeTool ? TOOLS.find((t) => t.id === activeTool) : null;

  return (
    <div className="flex-1 flex overflow-hidden animate-fade-in">
      {/* Left nav — full width on mobile when no tool selected, hidden when tool active on mobile */}
      <div className={cn(
        'flex-shrink-0 border-r border-black/5 p-4 sm:p-6 overflow-y-auto',
        activeTool ? 'hidden sm:block w-64' : 'w-full sm:w-64'
      )}>
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-text-tertiary hover:text-text-primary text-sm transition-colors mb-6 sm:mb-8"
        >
          <ChevronLeft size={16} />
          <span>Back</span>
        </button>

        <h1 className="text-2xl font-serif font-semibold mb-1">Tools</h1>
        <p className="text-xs text-text-tertiary mb-6 sm:mb-8">Everything from first draft to bestseller</p>

        {/* Group by phase */}
        {['Planning', 'Writing', 'Editing', 'Publishing', 'Post-Launch'].map(phase => {
          const phaseTools = TOOLS.filter(t => t.phase === phase);
          if (phaseTools.length === 0) return null;
          return (
            <div key={phase} className="mb-4">
              <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 px-3">{phase}</div>
              <nav className="space-y-0.5">
                {phaseTools.map(({ id, label, icon: Icon, description, comingSoon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTool(id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200',
                      activeTool === id ? 'bg-black/[0.04]' : 'hover:bg-black/[0.02]'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon size={14} className={activeTool === id ? 'text-text-primary' : 'text-text-tertiary'} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className={cn('text-sm font-medium truncate', activeTool === id ? 'text-text-primary' : 'text-text-secondary')}>
                            {label}
                          </div>
                          {comingSoon && (
                            <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-black/[0.06] text-text-tertiary font-semibold flex-shrink-0">
                              Soon
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-text-tertiary">{description}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </nav>
            </div>
          );
        })}
      </div>

      {/* Right content */}
      <div className={cn('flex-1 overflow-y-auto', !activeTool && 'hidden sm:block')}>
        {/* Mobile back button when tool is active */}
        {activeTool && (
          <div className="sm:hidden p-3 border-b border-black/5">
            <button
              onClick={() => setActiveTool(null)}
              className="flex items-center gap-1 text-text-tertiary hover:text-text-primary text-sm"
            >
              <ChevronLeft size={16} />
              <span>Tools</span>
            </button>
          </div>
        )}
        <div className="max-w-2xl mx-auto">
          {!activeTool && (
            <div className="px-4 sm:px-8 py-8 sm:py-16 text-center">
              <div className="text-4xl mb-4">🧰</div>
              <h2 className="text-xl font-serif font-semibold mb-2">Theodore Tools</h2>
              <p className="text-sm text-text-tertiary max-w-md mx-auto mb-8">
                From story structure to audiobook — everything you need to go from idea to finished book.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                {TOOLS.map(({ id, label, icon: Icon, phase, comingSoon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTool(id)}
                    className="flex items-center gap-3 p-4 rounded-2xl glass-pill hover:bg-white/60 transition-all text-left"
                  >
                    <Icon size={18} className="text-text-tertiary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="text-sm font-medium truncate">{label}</div>
                        {comingSoon && (
                          <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-black/[0.06] text-text-tertiary font-semibold flex-shrink-0">
                            Soon
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-tertiary">{phase}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Suspense fallback={<ToolLoader />}>
            {activeToolEntry && activeToolEntry.comingSoon && (
              <ComingSoonPlaceholder label={activeToolEntry.label} />
            )}
            {activeTool === 'isbn' && <ISBNAssistant />}
            {activeTool === 'xray' && (
              <ChapterBoundTool label="Prose X-Ray" render={(id) => <ProseXRay chapterId={id} />} />
            )}
            {activeTool === 'emotion' && (
              <ChapterBoundTool label="Emotion X-Ray" render={(id) => <EmotionalXRay chapterId={id} />} />
            )}
            {activeTool === 'bible' && <StoryBibleExport />}
            {activeTool === 'manuscript' && <ManuscriptFormatter />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

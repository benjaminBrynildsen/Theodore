import { Suspense, lazy, useState } from 'react';
import {
  ChevronLeft, TrendingUp, BookOpen, BookCopy, FileSignature,
  LayoutGrid, Barcode, Library, Rocket, Users,
  Activity, MessageSquareQuote, Waves, Globe, Image,
  Highlighter, Timer, Search, ScrollText, Globe2, UserPlus,
  BarChart3, Crosshair, GitCompare, MessageCircle, Calendar, BookMarked
} from 'lucide-react';
import { cn } from '../../lib/utils';

type Tool =
  | 'arc' | 'reader' | 'comps' | 'query'
  | 'beats' | 'isbn' | 'series' | 'launch'
  | 'relationships' | 'dialogue' | 'pacing' | 'tone' | 'preorder'
  | 'xray' | 'recap' | 'cover' | 'research' | 'sprint'
  | 'wiki' | 'names' | 'readability' | 'plothole' | 'diff' | 'collab' | 'epub' | 'timeline';

const TOOLS: { id: Tool; label: string; icon: typeof TrendingUp; description: string; phase: string }[] = [
  { id: 'series', label: 'Series Bible', icon: Library, description: 'Multi-book continuity and open thread tracking', phase: 'Planning' },
  { id: 'relationships', label: 'Relationships', icon: Users, description: 'Character relationship map with connection types', phase: 'Planning' },
  { id: 'wiki', label: 'World Wiki', icon: Globe2, description: 'Interconnected lore, history, and magic system wiki', phase: 'Planning' },
  { id: 'names', label: 'Name Generator', icon: UserPlus, description: 'Genre-aware names with etymology and phonetics', phase: 'Planning' },
  { id: 'timeline', label: 'Timeline', icon: Calendar, description: 'Chronological event map with conflict detection', phase: 'Planning' },
  { id: 'arc', label: 'Story Arc', icon: TrendingUp, description: 'Visualize and reshape your narrative arc', phase: 'Writing' },
  { id: 'beats', label: 'Scene Beats', icon: LayoutGrid, description: 'Drag beats between chapters to rebalance structure', phase: 'Writing' },
  { id: 'pacing', label: 'Pacing Heartbeat', icon: Activity, description: 'Tempo waveform — see rhythm across chapters', phase: 'Writing' },
  { id: 'sprint', label: 'Writing Sprint', icon: Timer, description: 'Timed sessions with word count tracking', phase: 'Writing' },
  { id: 'recap', label: 'Chapter Recap', icon: ScrollText, description: '"Previously on..." summaries for continuity', phase: 'Writing' },
  { id: 'reader', label: 'First Reader', icon: BookOpen, description: 'AI beta reader — engagement, clarity, pacing feedback', phase: 'Editing' },
  { id: 'xray', label: 'Prose X-Ray', icon: Highlighter, description: 'Heatmap overlay — dialogue ratio, adverbs, pacing', phase: 'Editing' },
  { id: 'dialogue', label: 'Dialogue Analyzer', icon: MessageSquareQuote, description: 'Voice profiles and character similarity detection', phase: 'Editing' },
  { id: 'tone', label: 'Tone Drift', icon: Waves, description: 'Detect unintentional tone shifts across chapters', phase: 'Editing' },
  { id: 'research', label: 'Smart Research', icon: Search, description: 'Inline factual accuracy checking and verification', phase: 'Editing' },
  { id: 'readability', label: 'Readability', icon: BarChart3, description: 'Grade level, reading time, audience targeting', phase: 'Editing' },
  { id: 'plothole', label: 'Plot Holes', icon: Crosshair, description: 'Detect contradictions and unresolved threads', phase: 'Editing' },
  { id: 'diff', label: 'Draft Compare', icon: GitCompare, description: 'Diff view between manuscript versions', phase: 'Editing' },
  { id: 'collab', label: 'Collab Notes', icon: MessageCircle, description: 'Editor and beta reader annotations with threads', phase: 'Editing' },
  { id: 'comps', label: 'Comp Titles', icon: BookCopy, description: 'Find comparable books for marketing and queries', phase: 'Publishing' },
  { id: 'query', label: 'Query & Blurb', icon: FileSignature, description: 'Generate query letters, back covers, Amazon descriptions', phase: 'Publishing' },
  { id: 'isbn', label: 'ISBN & Copyright', icon: Barcode, description: 'Step-by-step publishing paperwork', phase: 'Publishing' },
  { id: 'cover', label: 'Cover Designer', icon: Image, description: 'AI-generated covers at KDP-ready specs', phase: 'Publishing' },
  { id: 'epub', label: 'ePub Preview', icon: BookMarked, description: 'Kindle/phone/tablet rendering preview', phase: 'Publishing' },
  { id: 'preorder', label: 'Pre-Order Page', icon: Globe, description: 'Landing page with countdown and email capture', phase: 'Publishing' },
  { id: 'launch', label: 'Launch Dashboard', icon: Rocket, description: 'Sales, reviews, and rankings post-publish', phase: 'Post-Launch' },
];

const StoryArcVisualizer = lazy(async () => {
  const mod = await import('../features/StoryArcVisualizer');
  return { default: mod.StoryArcVisualizer };
});
const FirstReaderAI = lazy(async () => {
  const mod = await import('../features/FirstReaderAI');
  return { default: mod.FirstReaderAI };
});
const CompTitleMatcher = lazy(async () => {
  const mod = await import('../features/CompTitleMatcher');
  return { default: mod.CompTitleMatcher };
});
const QueryLetterGenerator = lazy(async () => {
  const mod = await import('../features/QueryLetterGenerator');
  return { default: mod.QueryLetterGenerator };
});
const SceneBeatBoard = lazy(async () => {
  const mod = await import('../features/SceneBeatBoard');
  return { default: mod.SceneBeatBoard };
});
const ISBNAssistant = lazy(async () => {
  const mod = await import('../features/ISBNAssistant');
  return { default: mod.ISBNAssistant };
});
const SeriesBible = lazy(async () => {
  const mod = await import('../features/SeriesBible');
  return { default: mod.SeriesBible };
});
const LaunchDashboard = lazy(async () => {
  const mod = await import('../features/LaunchDashboard');
  return { default: mod.LaunchDashboard };
});
const CharacterRelationshipMap = lazy(async () => {
  const mod = await import('../features/CharacterRelationshipMap');
  return { default: mod.CharacterRelationshipMap };
});
const DialogueAnalyzer = lazy(async () => {
  const mod = await import('../features/DialogueAnalyzer');
  return { default: mod.DialogueAnalyzer };
});
const PacingHeartbeat = lazy(async () => {
  const mod = await import('../features/PacingHeartbeat');
  return { default: mod.PacingHeartbeat };
});
const ToneDriftDetector = lazy(async () => {
  const mod = await import('../features/ToneDriftDetector');
  return { default: mod.ToneDriftDetector };
});
const PreOrderPage = lazy(async () => {
  const mod = await import('../features/PreOrderPage');
  return { default: mod.PreOrderPage };
});
const ProseXRay = lazy(async () => {
  const mod = await import('../features/ProseXRay');
  return { default: mod.ProseXRay };
});
const ChapterRecapGenerator = lazy(async () => {
  const mod = await import('../features/ChapterRecapGenerator');
  return { default: mod.ChapterRecapGenerator };
});
const AICoverDesigner = lazy(async () => {
  const mod = await import('../features/AICoverDesigner');
  return { default: mod.AICoverDesigner };
});
const SmartResearch = lazy(async () => {
  const mod = await import('../features/SmartResearch');
  return { default: mod.SmartResearch };
});
const WritingSprintMode = lazy(async () => {
  const mod = await import('../features/WritingSprintMode');
  return { default: mod.WritingSprintMode };
});
const WorldbuildingWiki = lazy(async () => {
  const mod = await import('../features/WorldbuildingWiki');
  return { default: mod.WorldbuildingWiki };
});
const NameGenerator = lazy(async () => {
  const mod = await import('../features/NameGenerator');
  return { default: mod.NameGenerator };
});
const ReadabilityAnalyzer = lazy(async () => {
  const mod = await import('../features/ReadabilityAnalyzer');
  return { default: mod.ReadabilityAnalyzer };
});
const PlotHoleDetector = lazy(async () => {
  const mod = await import('../features/PlotHoleDetector');
  return { default: mod.PlotHoleDetector };
});
const ManuscriptComparison = lazy(async () => {
  const mod = await import('../features/ManuscriptComparison');
  return { default: mod.ManuscriptComparison };
});
const CollaborationNotes = lazy(async () => {
  const mod = await import('../features/CollaborationNotes');
  return { default: mod.CollaborationNotes };
});
const EpubPreview = lazy(async () => {
  const mod = await import('../features/EpubPreview');
  return { default: mod.EpubPreview };
});
const TimelineVisualizer = lazy(async () => {
  const mod = await import('../features/TimelineVisualizer');
  return { default: mod.TimelineVisualizer };
});

function ToolLoader() {
  return (
    <div className="px-4 py-12 text-center text-sm text-text-tertiary sm:px-8">
      Loading tool...
    </div>
  );
}

export function ToolsView({ onClose }: { onClose: () => void }) {
  const [activeTool, setActiveTool] = useState<Tool | null>(null);

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
                {phaseTools.map(({ id, label, icon: Icon, description }) => (
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
                      <div>
                        <div className={cn('text-sm font-medium', activeTool === id ? 'text-text-primary' : 'text-text-secondary')}>
                          {label}
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
                From story structure to sales tracking — everything you need to go from idea to published author.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                {TOOLS.map(({ id, label, icon: Icon, phase }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTool(id)}
                    className="flex items-center gap-3 p-4 rounded-2xl glass-pill hover:bg-white/60 transition-all text-left"
                  >
                    <Icon size={18} className="text-text-tertiary" />
                    <div>
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-[10px] text-text-tertiary">{phase}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Suspense fallback={<ToolLoader />}>
            {activeTool === 'arc' && <StoryArcVisualizer />}
            {activeTool === 'reader' && <FirstReaderAI />}
            {activeTool === 'comps' && <CompTitleMatcher />}
            {activeTool === 'query' && <QueryLetterGenerator />}
            {activeTool === 'beats' && <SceneBeatBoard />}
            {activeTool === 'isbn' && <ISBNAssistant />}
            {activeTool === 'series' && <SeriesBible />}
            {activeTool === 'launch' && <LaunchDashboard />}
            {activeTool === 'relationships' && <CharacterRelationshipMap />}
            {activeTool === 'dialogue' && <DialogueAnalyzer />}
            {activeTool === 'pacing' && <PacingHeartbeat />}
            {activeTool === 'tone' && <ToneDriftDetector />}
            {activeTool === 'preorder' && <PreOrderPage />}
            {activeTool === 'xray' && <ProseXRay chapterId="ch-1" />}
            {activeTool === 'recap' && <ChapterRecapGenerator />}
            {activeTool === 'cover' && <AICoverDesigner />}
            {activeTool === 'research' && <SmartResearch chapterId="ch-1" />}
            {activeTool === 'sprint' && <WritingSprintMode />}
            {activeTool === 'wiki' && <WorldbuildingWiki />}
            {activeTool === 'names' && <NameGenerator />}
            {activeTool === 'readability' && <ReadabilityAnalyzer />}
            {activeTool === 'plothole' && <PlotHoleDetector />}
            {activeTool === 'diff' && <ManuscriptComparison />}
            {activeTool === 'collab' && <CollaborationNotes />}
            {activeTool === 'epub' && <EpubPreview />}
            {activeTool === 'timeline' && <TimelineVisualizer />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

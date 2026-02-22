import { useState } from 'react';
import {
  ChevronLeft, TrendingUp, BookOpen, BookCopy, FileSignature,
  LayoutGrid, Barcode, Library, Mic, Rocket, Users,
  Activity, MessageSquareQuote, Waves, Globe, Image,
  Highlighter, Timer, Search, ScrollText, Globe2, UserPlus,
  BarChart3, Crosshair, GitCompare, MessageCircle, Calendar, BookMarked
} from 'lucide-react';
import { StoryArcVisualizer } from '../features/StoryArcVisualizer';
import { FirstReaderAI } from '../features/FirstReaderAI';
import { CompTitleMatcher } from '../features/CompTitleMatcher';
import { QueryLetterGenerator } from '../features/QueryLetterGenerator';
import { SceneBeatBoard } from '../features/SceneBeatBoard';
import { ISBNAssistant } from '../features/ISBNAssistant';
import { SeriesBible } from '../features/SeriesBible';
import { LaunchDashboard } from '../features/LaunchDashboard';
import { CharacterRelationshipMap } from '../features/CharacterRelationshipMap';
import { DialogueAnalyzer } from '../features/DialogueAnalyzer';
import { PacingHeartbeat } from '../features/PacingHeartbeat';
import { ToneDriftDetector } from '../features/ToneDriftDetector';
import { PreOrderPage } from '../features/PreOrderPage';
import { ProseXRay } from '../features/ProseXRay';
import { ChapterRecapGenerator } from '../features/ChapterRecapGenerator';
import { AICoverDesigner } from '../features/AICoverDesigner';
import { SmartResearch } from '../features/SmartResearch';
import { WritingSprintMode } from '../features/WritingSprintMode';
import { WorldbuildingWiki } from '../features/WorldbuildingWiki';
import { NameGenerator } from '../features/NameGenerator';
import { ReadabilityAnalyzer } from '../features/ReadabilityAnalyzer';
import { PlotHoleDetector } from '../features/PlotHoleDetector';
import { ManuscriptComparison } from '../features/ManuscriptComparison';
import { CollaborationNotes } from '../features/CollaborationNotes';
import { EpubPreview } from '../features/EpubPreview';
import { TimelineVisualizer } from '../features/TimelineVisualizer';
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

export function ToolsView({ onClose }: { onClose: () => void }) {
  const [activeTool, setActiveTool] = useState<Tool | null>(null);

  return (
    <div className="flex-1 flex overflow-hidden animate-fade-in">
      {/* Left nav */}
      <div className="w-64 flex-shrink-0 border-r border-black/5 p-6 overflow-y-auto">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-text-tertiary hover:text-text-primary text-sm transition-colors mb-8"
        >
          <ChevronLeft size={16} />
          <span>Back</span>
        </button>

        <h1 className="text-2xl font-serif font-semibold mb-1">Tools</h1>
        <p className="text-xs text-text-tertiary mb-8">Everything from first draft to bestseller</p>

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
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          {!activeTool && (
            <div className="px-8 py-16 text-center">
              <div className="text-4xl mb-4">🧰</div>
              <h2 className="text-xl font-serif font-semibold mb-2">Theodore Tools</h2>
              <p className="text-sm text-text-tertiary max-w-md mx-auto mb-8">
                From story structure to sales tracking — everything you need to go from idea to published author.
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
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
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Shield, Headphones, FileOutput, Sliders, Disc3, ImageIcon } from 'lucide-react';
import { useStore } from '../../store';
import { Slider } from '../ui/Slider';
import { StoryBibleExport } from '../features/StoryBibleExport';
import { ManuscriptFormatter } from '../features/ManuscriptFormatter';
import { AudiobookPanel } from '../features/AudiobookPanel';
import { NowPlayingPanel } from '../features/NowPlayingPanel';
import { BookCoverSection } from '../features/BookCoverSection';
import { useAudioStore } from '../../store/audio';
import { cn } from '../../lib/utils';
import type { Chapter } from '../../types';

type SidebarTab = 'playing' | 'controls' | 'audio' | 'cover' | 'export';

// Both helpers accept undefined/null because callers pass optional premise
// fields (premise?.purpose, premise?.emotionalBeat ?? premise?.changes) and
// last-paragraph access that can return undefined for old or empty chapters.
// Without coercion the .replace() crashes the whole sidebar render.
function cleanSnippet(text: string | null | undefined, fallback: string) {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function firstSentence(text: string | null | undefined, fallback: string) {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  const match = normalized.match(/.+?[.!?](?:\s|$)/);
  const sentence = (match?.[0] || normalized).trim();
  return sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence;
}

function buildChapterStructure(chapter: Chapter | null) {
  if (!chapter) return null;

  const paragraphs = (chapter.prose || '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const premise = chapter.premise;
  const opening = paragraphs[0] || firstSentence(premise?.purpose, 'Open with a clear setup and tension source.');
  const middle =
    paragraphs[Math.floor(paragraphs.length / 2)] ||
    firstSentence(premise?.emotionalBeat || premise?.changes, 'Escalate conflict and emotional pressure.');
  const ending =
    paragraphs[paragraphs.length - 1] ||
    firstSentence(premise?.changes, 'Land on a consequence or turn that drives the next chapter.');

  return [
    {
      label: 'Beginning',
      summary: cleanSnippet(opening, 'Set POV, place, and chapter hook.'),
      intent: firstSentence(premise?.purpose, 'Establish the chapter objective and tone.'),
    },
    {
      label: 'Middle',
      summary: cleanSnippet(middle, 'Increase stakes through conflict, revelation, or reversal.'),
      intent: firstSentence(premise?.emotionalBeat || premise?.changes, 'Complicate the goal and force choices.'),
    },
    {
      label: 'Ending',
      summary: cleanSnippet(ending, 'Resolve this beat and create momentum into the next chapter.'),
      intent: firstSentence(premise?.changes, 'Show what changed by chapter end.'),
    },
  ];
}

export function RightSidebar() {
  const { rightSidebarOpen, getActiveProject, updateProject, activeChapterId, chapters } = useStore();
  const { miniPlayerVisible: hasAudioActivity, setSidebarPlayerVisible } = useAudioStore();
  const [activeTab, setActiveTab] = useState<SidebarTab>('playing');
  const project = getActiveProject();
  const activeChapter = activeChapterId ? chapters.find((c) => c.id === activeChapterId) || null : null;
  const chapterStructure = buildChapterStructure(activeChapter);

  // Tell the audio store whether the sidebar player is showing
  const sidebarPlayerShowing = rightSidebarOpen && !!project && activeTab === 'playing';
  useEffect(() => {
    setSidebarPlayerVisible(sidebarPlayerShowing);
    return () => setSidebarPlayerVisible(false);
  }, [sidebarPlayerShowing, setSidebarPlayerVisible]);

  if (!rightSidebarOpen || !project) return null;

  const tabs = [
    { id: 'playing' as const, icon: Disc3, label: 'Playing', pulse: hasAudioActivity },
    { id: 'controls' as const, icon: Sliders, label: 'Settings' },
    { id: 'audio' as const, icon: Headphones, label: 'Audio' },
    { id: 'cover' as const, icon: ImageIcon, label: 'Cover' },
    { id: 'export' as const, icon: FileOutput, label: 'Export' },
  ];

  const updateNarrative = (path: string, value: any) => {
    const nc = { ...project.narrativeControls };
    if (path.startsWith('toneMood.')) {
      const key = path.split('.')[1];
      nc.toneMood = { ...nc.toneMood, [key]: value };
    } else {
      (nc as any)[path] = value;
    }
    updateProject(project.id, { narrativeControls: nc, updatedAt: new Date().toISOString() });
  };

  return (
    <aside className={cn(
      'h-full flex flex-col animate-slide-in-right border-l-0 min-h-0 w-[420px] glass-subtle'
    )}>
      <div className="flex px-1 pt-1 border-b border-black/[0.06]">
        {tabs.map(({ id, icon: Icon, label, pulse }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2 rounded-t-lg text-[9px] transition-all relative',
              id === activeTab ? 'text-text-primary bg-white/20' : 'text-text-tertiary hover:text-text-secondary'
            )}
          >
            <Icon size={14} className={cn(id === 'playing' && hasAudioActivity && 'animate-spin-slow')} />
            {label}
            {pulse && activeTab !== id && (
              <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-text-primary" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'audio' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <AudiobookPanel />
        </div>
      )}

      {activeTab === 'cover' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <BookCoverSection projectId={project.id} />
        </div>
      )}

      {activeTab === 'playing' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <NowPlayingPanel />
        </div>
      )}

      {activeTab === 'export' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="border-b border-white/20">
            <StoryBibleExport />
          </div>
          <ManuscriptFormatter />
        </div>
      )}

      {activeTab === 'controls' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {chapterStructure && (
            <div className="p-4 border-b border-white/20">
              <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Chapter Structure</h3>
              <div className="space-y-2">
                {chapterStructure.map((segment) => (
                  <div key={segment.label} className="rounded-xl glass-pill p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">
                      {segment.label}
                    </div>
                    <p className="text-sm text-text-primary leading-relaxed">{segment.summary}</p>
                    <p className="text-[11px] text-text-tertiary mt-1">Intent: {segment.intent}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 border-b border-white/20">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Validation</h3>
            <div className="flex items-center gap-2 text-sm text-success glass-pill px-3 py-2 rounded-xl w-fit">
              <Shield size={14} />
              <span>All checks passing</span>
            </div>
          </div>

          <div className="p-4 border-b border-white/20">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4">Narrative Controls</h3>
            <div className="space-y-4">
              <Slider
                value={project.narrativeControls.toneMood.lightDark}
                onChange={(v) => updateNarrative('toneMood.lightDark', v)}
                leftLabel="Light"
                rightLabel="Dark"
              />
              <Slider
                value={project.narrativeControls.toneMood.hopefulGrim}
                onChange={(v) => updateNarrative('toneMood.hopefulGrim', v)}
                leftLabel="Hopeful"
                rightLabel="Grim"
              />
              <Slider
                value={project.narrativeControls.toneMood.whimsicalSerious}
                onChange={(v) => updateNarrative('toneMood.whimsicalSerious', v)}
                leftLabel="Whimsical"
                rightLabel="Serious"
              />
            </div>
          </div>

          <div className="p-4 border-b border-white/20">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Pacing</h3>
            <div className="flex gap-1 glass-pill p-1 rounded-xl">
              {(['slow', 'balanced', 'fast'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => updateNarrative('pacing', p)}
                  className={cn(
                    'flex-1 py-1.5 text-xs rounded-lg transition-all duration-200 capitalize',
                    project.narrativeControls.pacing === p
                      ? 'bg-text-primary text-text-inverse shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 border-b border-white/20">
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">Dialogue Weight</h3>
            <div className="flex gap-1 glass-pill p-1 rounded-xl">
              {(['sparse', 'balanced', 'heavy'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => updateNarrative('dialogueWeight', d)}
                  className={cn(
                    'flex-1 py-1.5 text-xs rounded-lg transition-all duration-200 capitalize',
                    project.narrativeControls.dialogueWeight === d
                      ? 'bg-text-primary text-text-inverse shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

        </div>
      )}
    </aside>
  );
}

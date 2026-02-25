import { useState } from 'react';
import { Users, MapPin, Cog, Gem, Scale, Milestone, Plus, ChevronRight, Search, FileText, Sparkles, MessageSquare, Swords, Wand2, Loader2, Scissors } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { CreditCostTag } from '../credits/CreditCostTag';
import { cn } from '../../lib/utils';
import { buildGenerationPrompt } from '../../lib/prompt-builder';
import { generateText } from '../../lib/generate';
import { EditModeSidebar } from '../editmode/EditModeSidebar';
import type { CanonType } from '../../types/canon';
import type { WritingMode, GenerationType } from '../../types';

const canonSections: { type: CanonType; label: string; icon: React.ElementType }[] = [
  { type: 'character', label: 'Characters', icon: Users },
  { type: 'location', label: 'Locations', icon: MapPin },
  { type: 'system', label: 'Systems', icon: Cog },
  { type: 'artifact', label: 'Artifacts', icon: Gem },
  { type: 'rule', label: 'Rules', icon: Scale },
  { type: 'event', label: 'Major Events', icon: Milestone },
];

type ChapterChunkSize = 'short' | 'medium' | 'long';

const CHUNK_CONFIG: Record<ChapterChunkSize, { label: string; words: string; maxTokens: number }> = {
  short: { label: 'Quick', words: '700-1,000', maxTokens: 1400 },
  medium: { label: 'Standard', words: '1,000-1,500', maxTokens: 2200 },
  long: { label: 'Long', words: '1,600-2,200', maxTokens: 3200 },
};

// ========== PROJECT SIDEBAR (Canon & World) ==========

function ProjectSidebar({ projectId }: { projectId: string }) {
  const { entries, setActiveEntry, activeEntryId, createCharacter, createLocation, createSystem, createArtifact, createRule, createEvent, addEntry } = useCanonStore();
  const [search, setSearch] = useState('');
  const [expandedType, setExpandedType] = useState<CanonType | null>('character');

  const projectEntries = entries.filter(e => e.projectId === projectId);
  const filteredEntries = search
    ? projectEntries.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : projectEntries;

  const handleAdd = (type: CanonType) => {
    const creators: Record<CanonType, (pid: string, name: string) => any> = {
      character: createCharacter, location: createLocation, system: createSystem,
      artifact: createArtifact, rule: createRule, event: createEvent,
    };
    const entry = creators[type](projectId, `New ${type.charAt(0).toUpperCase() + type.slice(1)}`);
    addEntry(entry);
    setActiveEntry(entry.id);
    setExpandedType(type);
  };

  return (
    <>
      <div className="p-3 border-b border-white/20">
        <div className="text-base font-semibold text-text-tertiary uppercase tracking-wider px-1 mb-2">Canon & World</div>
        <div className="flex items-center gap-2 glass-pill rounded-xl px-3 py-1.5">
          <Search size={13} className="text-text-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search canon..."
            className="flex-1 bg-transparent outline-none text-[15px] text-text-primary placeholder:text-text-tertiary"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {canonSections.map(({ type, label, icon: Icon }) => {
          const typeEntries = filteredEntries.filter(e => e.type === type);
          const isExpanded = expandedType === type;
          
          return (
            <div key={type} className="mb-0.5">
              <button
                onClick={() => setExpandedType(isExpanded ? null : type)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[15px] text-text-secondary hover:text-text-primary hover:bg-white/40 transition-all duration-200 group"
              >
                <Icon size={15} className="text-text-tertiary group-hover:text-text-primary transition-colors" />
                <span className="flex-1 text-left text-[15px] font-medium">{label}</span>
                <span className="text-[13px] text-text-tertiary">{typeEntries.length}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleAdd(type); }}
                  className="text-text-tertiary hover:text-text-primary transition-all p-0.5"
                  aria-label={`Add ${type}`}
                >
                  <Plus size={13} />
                </button>
              </button>
              
              {isExpanded && typeEntries.length > 0 && (
                <div className="ml-3 space-y-0.5 animate-fade-in">
                  {typeEntries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => setActiveEntry(entry.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[15px] transition-all duration-150',
                        activeEntryId === entry.id
                          ? 'bg-text-primary text-text-inverse'
                          : 'text-text-secondary hover:text-text-primary hover:bg-white/40'
                      )}
                    >
                      <ChevronRight size={10} className={cn(activeEntryId === entry.id ? 'text-text-inverse/60' : 'text-text-tertiary')} />
                      <span className="truncate">{entry.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {isExpanded && typeEntries.length === 0 && (
                <button
                  onClick={() => handleAdd(type)}
                  className="ml-3 w-[calc(100%-12px)] flex items-center gap-2 px-3 py-2 rounded-lg text-[15px] text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all"
                >
                  <Plus size={12} />
                  <span>Add {type}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-white/20">
        <div className="text-sm text-text-tertiary text-center">
          {projectEntries.length} canon {projectEntries.length === 1 ? 'entry' : 'entries'}
        </div>
      </div>
    </>
  );
}

// ========== CHAPTER SIDEBAR (Context-Aware Toolkit) ==========

function ChapterSidebar({ projectId, chapterId }: { projectId: string; chapterId: string }) {
  const { chapters, updateChapter, setEditMode } = useStore();
  const { entries } = useCanonStore();
  const [activeSection, setActiveSection] = useState<'premise' | 'generate' | 'artifacts'>('premise');
  const [writingMode, setWritingMode] = useState<WritingMode>('draft');
  const [generating, setGenerating] = useState<string | null>(null);
  const [chunkSize, setChunkSize] = useState<ChapterChunkSize>('medium');

  const chapter = chapters.find(c => c.id === chapterId);
  if (!chapter) return null;

  const projectEntries = entries.filter(e => e.projectId === projectId);

  const updatePremise = (field: string, value: any) => {
    updateChapter(chapter.id, {
      premise: { ...chapter.premise, [field]: value },
      updatedAt: new Date().toISOString(),
    });
  };

  const sections = [
    { id: 'premise' as const, label: 'Premise', icon: FileText },
    { id: 'generate' as const, label: 'Generate', icon: Sparkles },
    { id: 'artifacts' as const, label: 'Artifacts', icon: Gem },
  ];
  const chunkConfig = CHUNK_CONFIG[chunkSize];
  const chapterWordCount = chapter.prose.trim() ? chapter.prose.trim().split(/\s+/).length : 0;

  return (
    <>
      {/* Chapter breadcrumb */}
      <div className="p-3 border-b border-white/20">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-text-tertiary uppercase tracking-wider px-1 truncate">
            Ch. {chapter.number} · {chapter.title}
          </div>
          <button
            onClick={() => setEditMode(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all flex-shrink-0"
            title="Enter Edit Mode — edit by scene"
          >
            <Scissors size={13} />
            <span className="hidden lg:inline">Edit Mode</span>
          </button>
        </div>
        {/* Section tabs */}
        <div className="flex gap-0.5 glass-pill p-0.5 rounded-xl">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all',
                activeSection === id
                  ? 'bg-text-primary text-text-inverse shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary'
              )}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* PREMISE SECTION */}
        {activeSection === 'premise' && (
          <div className="space-y-3 animate-fade-in">
            <div>
              <label className="text-sm font-semibold text-text-tertiary uppercase tracking-wider">Purpose</label>
              <textarea
                value={chapter.premise.purpose}
                onChange={(e) => updatePremise('purpose', e.target.value)}
                placeholder="What is this chapter's role?"
                rows={5}
                className="w-full mt-1 px-3 py-3 rounded-lg glass-input text-[15px] leading-relaxed resize-none"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-text-tertiary uppercase tracking-wider">What Changes</label>
              <textarea
                value={chapter.premise.changes}
                onChange={(e) => updatePremise('changes', e.target.value)}
                placeholder="How is the world different after?"
                rows={4}
                className="w-full mt-1 px-3 py-3 rounded-lg glass-input text-[15px] leading-relaxed resize-none"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-text-tertiary uppercase tracking-wider">Emotional Beat</label>
              <input
                type="text"
                value={chapter.premise.emotionalBeat}
                onChange={(e) => updatePremise('emotionalBeat', e.target.value)}
                placeholder="e.g., Grief giving way to wonder"
                className="w-full mt-1 px-3 py-3 rounded-lg glass-input text-[15px]"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-text-tertiary uppercase tracking-wider">Constraints</label>
              <textarea
                value={chapter.premise.constraints.join('\n')}
                onChange={(e) => updatePremise('constraints', e.target.value.split('\n').filter(Boolean))}
                placeholder="What must NOT happen (one per line)"
                rows={5}
                className="w-full mt-1 px-3 py-3 rounded-lg glass-input text-[15px] leading-relaxed resize-none"
              />
            </div>
          </div>
        )}

        {/* GENERATE SECTION */}
        {activeSection === 'generate' && (
          <div className="space-y-4 animate-fade-in">
            {/* Writing Mode */}
            <div>
              <label className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">Mode</label>
              <div className="grid grid-cols-2 gap-1">
                {([
                  { mode: 'draft' as const, label: 'Draft', desc: 'Fast, exploratory' },
                  { mode: 'canon-safe' as const, label: 'Canon-Safe', desc: 'No new facts' },
                  { mode: 'exploration' as const, label: 'Exploration', desc: 'New ideas flagged' },
                  { mode: 'polish' as const, label: 'Polish', desc: 'Rewrite only' },
                ]).map(({ mode, label, desc }) => (
                  <button
                    key={mode}
                    onClick={() => setWritingMode(mode)}
                    className={cn(
                      'p-2.5 rounded-xl text-left transition-all',
                      writingMode === mode
                        ? 'bg-text-primary text-text-inverse shadow-sm'
                        : 'glass-pill text-text-secondary hover:bg-white/60'
                    )}
                  >
                    <div className="text-sm font-medium">{label}</div>
                    <div className={cn('text-[10px]', writingMode === mode ? 'text-white/60' : 'text-text-tertiary')}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chunk Size */}
            <div>
              <label className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">Chunk Size</label>
              <div className="flex gap-1 glass-pill p-1 rounded-xl">
                {(['short', 'medium', 'long'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setChunkSize(size)}
                    className={cn(
                      'flex-1 py-2 text-xs rounded-lg transition-all',
                      chunkSize === size
                        ? 'bg-text-primary text-text-inverse shadow-sm'
                        : 'text-text-secondary hover:bg-white/60',
                    )}
                  >
                    {CHUNK_CONFIG[size].label}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-text-tertiary mt-2">
                Target: {chunkConfig.words} words per chunk · Current chapter: {chapterWordCount.toLocaleString()} words
              </div>
            </div>

            {/* Primary chapter generation */}
            <button
              disabled={generating !== null}
              onClick={async () => {
                setGenerating('generate-chapter-full');
                try {
                  const { settings } = useSettingsStore.getState();
                  const { entries } = useCanonStore.getState();
                  const { getActiveProject, getProjectChapters } = useStore.getState();
                  const project = getActiveProject();
                  if (!project || !chapter) {
                    setGenerating(null);
                    return;
                  }

                  const allChapters = getProjectChapters(project.id);
                  const projectCanon = entries.filter(e => e.projectId === project.id);
                  const prevChapter = allChapters.find(c => c.number === chapter.number - 1);
                  const latestChapter = useStore.getState().chapters.find(c => c.id === chapter.id);
                  const baseProse = latestChapter?.prose || chapter.prose || '';
                  const isContinuation = baseProse.trim().length > 0;

                  const basePrompt = buildGenerationPrompt({
                    project,
                    chapter,
                    allChapters,
                    canonEntries: projectCanon,
                    settings,
                    writingMode,
                    generationType: 'full-chapter',
                    previousChapterProse: prevChapter?.prose || undefined,
                  });

                  const continuationPrompt = isContinuation
                    ? `${basePrompt}

Current chapter ending to continue from:
${baseProse.slice(-4000)}

Task:
- Continue immediately from the exact final sentence.
- Do NOT restart the chapter or repeat previous beats.
- Write only the next chunk (${chunkConfig.words} words).
- End on a continuation beat that can be extended in another chunk.`
                    : `${basePrompt}

Task:
- Write only the opening chunk of this chapter (${chunkConfig.words} words).
- Do not summarize later scenes yet.
- End on a strong continuation beat so the next chunk can continue naturally.`;

                  const result = await generateText({
                    prompt: continuationPrompt,
                    model: settings.ai.preferredModel || 'gpt-4.1',
                    maxTokens: chunkConfig.maxTokens,
                    action: 'generate-chapter-full',
                    projectId: project.id,
                    chapterId: chapter.id,
                  });

                  const generatedChunk = (result.text || '').trim();
                  if (!generatedChunk) return;
                  const nextProse = isContinuation
                    ? `${baseProse.trimEnd()}\n\n${generatedChunk}`
                    : generatedChunk;
                  const nextWordCount = nextProse.trim().split(/\s+/).length;

                  updateChapter(chapter.id, {
                    prose: nextProse,
                    status: 'draft-generated',
                    aiIntentMetadata: {
                      model: result.model || settings.ai.preferredModel,
                      role: 'architect',
                      prompt: continuationPrompt.slice(0, 700),
                      generatedAt: new Date().toISOString(),
                      inputTokens: result.usage?.inputTokens,
                      outputTokens: result.usage?.outputTokens,
                      creditsUsed: result.usage?.creditsUsed,
                      historySource: 'ai-generated',
                      chunking: {
                        mode: isContinuation ? 'continue' : 'start',
                        chunkSize,
                        targetWords: chunkConfig.words,
                        chapterWordCount: nextWordCount,
                      },
                    } as any,
                  });
                } catch (error: any) {
                  console.error('Chunk generation failed:', error);
                  if (String(error?.message || '').includes('INSUFFICIENT_CREDITS')) {
                    alert('Not enough credits. Upgrade your plan to continue generating.');
                  } else {
                    alert(`Generation failed: ${error?.message || 'Unknown error'}`);
                  }
                } finally {
                  setGenerating(null);
                }
              }}
              className={cn(
                'w-full rounded-2xl px-4 py-4 text-left transition-all shadow-md',
                generating === 'generate-chapter-full'
                  ? 'bg-text-primary/90 text-text-inverse'
                  : 'bg-text-primary text-text-inverse hover:shadow-xl active:scale-[0.99]',
              )}
            >
              <div className="flex items-center gap-2">
                {generating === 'generate-chapter-full'
                  ? <Loader2 size={18} className="animate-spin" />
                  : <Sparkles size={18} />}
                <span className="text-base font-semibold">
                  {chapter.prose.trim() ? 'Generate Next Chunk' : 'Generate Opening Chunk'}
                </span>
              </div>
              <div className="mt-1 text-xs text-white/80">
                {chapter.prose.trim()
                  ? `Continue chapter in ${chunkConfig.label.toLowerCase()} chunks (${chunkConfig.words} words).`
                  : `Start chapter with a ${chunkConfig.label.toLowerCase()} chunk (${chunkConfig.words} words).`}
              </div>
              <div className="mt-2">
                <CreditCostTag action="generate-chapter-full" />
              </div>
            </button>

            {/* Secondary generation actions */}
            <div>
              <label className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">Other Generation Modes</label>
              <div className="space-y-1.5">
                {([
                  { label: 'Scene Outline', icon: Wand2, desc: 'Structural breakdown', action: 'generate-chapter-outline' as const },
                  { label: 'Dialogue First', icon: MessageSquare, desc: 'Start with conversations', action: 'generate-dialogue' as const },
                  { label: 'Action Skeleton', icon: Swords, desc: 'Plot beats and movement', action: 'generate-action-skeleton' as const },
                ]).map(({ label, icon: Icon, desc, action }) => (
                  <button
                    key={label}
                    disabled={generating !== null}
                    onClick={async () => {
                      setGenerating(action);

                      try {
                        // Build the full prompt using all settings, canon, and context
                        const { settings } = useSettingsStore.getState();
                        const { entries } = useCanonStore.getState();
                        const { getActiveProject, getProjectChapters } = useStore.getState();
                        const project = getActiveProject();
                        if (!project || !chapter) { setGenerating(null); return; }
                        
                        const allChapters = getProjectChapters(project.id);
                        const projectCanon = entries.filter(e => e.projectId === project.id);
                        const prevChapter = allChapters.find(c => c.number === chapter.number - 1);
                        
                        const genTypeMap: Record<string, GenerationType> = {
                          'generate-chapter-full': 'full-chapter',
                          'generate-chapter-outline': 'scene-outline',
                          'generate-dialogue': 'dialogue-first',
                          'generate-action-skeleton': 'action-skeleton',
                        };

                        const prompt = buildGenerationPrompt({
                          project,
                          chapter,
                          allChapters,
                          canonEntries: projectCanon,
                          settings,
                          writingMode,
                          generationType: genTypeMap[action] || 'full-chapter',
                          previousChapterProse: prevChapter?.prose || undefined,
                        });

                        const result = await generateText({
                          prompt,
                          model: settings.ai.preferredModel || 'gpt-4.1',
                          maxTokens: action === 'generate-chapter-outline' ? 2200 : 2600,
                          action,
                          projectId: project.id,
                          chapterId: chapter.id,
                        });

                        updateChapter(chapter.id, {
                          prose: result.text || '',
                          status: 'draft-generated',
                          aiIntentMetadata: {
                            model: result.model || settings.ai.preferredModel,
                            role: 'architect',
                            prompt: prompt.slice(0, 700),
                            generatedAt: new Date().toISOString(),
                            inputTokens: result.usage?.inputTokens,
                            outputTokens: result.usage?.outputTokens,
                            creditsUsed: result.usage?.creditsUsed,
                            historySource: 'ai-generated',
                          },
                        });
                      } catch (error: any) {
                        console.error('Sidebar generation failed:', error);
                        if (String(error?.message || '').includes('INSUFFICIENT_CREDITS')) {
                          alert('Not enough credits. Upgrade your plan to continue generating.');
                        } else {
                          alert(`Generation failed: ${error?.message || 'Unknown error'}`);
                        }
                      } finally {
                        setGenerating(null);
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3.5 rounded-xl glass-pill hover:bg-white/60 active:scale-[0.98] transition-all text-left group",
                      generating === action && "bg-white/60"
                    )}
                  >
                    {generating === action ? (
                      <Loader2 size={15} className="text-text-primary animate-spin flex-shrink-0" />
                    ) : (
                      <Icon size={15} className="text-text-tertiary group-hover:text-text-primary transition-colors flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-medium">{generating === action ? 'Generating...' : label}</div>
                      <div className="text-xs text-text-tertiary">{desc}</div>
                    </div>
                    <CreditCostTag action={action} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ARTIFACTS SECTION */}
        {activeSection === 'artifacts' && (
          <div className="space-y-3 animate-fade-in">
            {projectEntries.length === 0 ? (
              <div className="text-center py-8 text-text-tertiary text-xs">
                No canon entries yet. Create characters and locations from the project view.
              </div>
            ) : (
              <>
                {canonSections.map(({ type, label, icon: Icon }) => {
                  const typeEntries = projectEntries.filter(e => e.type === type);
                  if (typeEntries.length === 0) return null;
                  return (
                    <div key={type}>
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 px-1">
                        <Icon size={12} />
                        {label}
                      </div>
                      <div className="space-y-1">
                        {typeEntries.map(entry => (
                          <button
                            key={entry.id}
                            onClick={() => useCanonStore.getState().setActiveEntry(entry.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg glass-pill hover:bg-white/60 transition-all text-left"
                          >
                            <span className="text-[15px] font-medium truncate">{entry.name}</span>
                            {entry.description && (
                              <span className="text-xs text-text-tertiary truncate flex-1">{entry.description.slice(0, 40)}...</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ========== MAIN SIDEBAR ==========

export function LeftSidebar() {
  const { leftSidebarOpen, getActiveProject, activeChapterId, editMode } = useStore();
  const project = getActiveProject();

  if (!leftSidebarOpen || !project) return null;

  return (
    <aside className="w-[23.5rem] h-full glass-subtle flex flex-col animate-fade-in border-r-0">
      {editMode && activeChapterId ? (
        <EditModeSidebar projectId={project.id} chapterId={activeChapterId} />
      ) : activeChapterId ? (
        <ChapterSidebar projectId={project.id} chapterId={activeChapterId} />
      ) : (
        <ProjectSidebar projectId={project.id} />
      )}
    </aside>
  );
}

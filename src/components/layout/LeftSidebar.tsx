import { useState, useCallback } from 'react';
import { Users, MapPin, Cog, Gem, Scale, Milestone, Plus, ChevronRight, Search, FileText, Sparkles, BookOpen, Settings2, MessageSquare, Swords, Wand2, Clock, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { CreditCostTag } from '../credits/CreditCostTag';
import { cn } from '../../lib/utils';
import { buildGenerationPrompt } from '../../lib/prompt-builder';
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
        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-1 mb-2">Canon & World</div>
        <div className="flex items-center gap-2 glass-pill rounded-xl px-3 py-1.5">
          <Search size={13} className="text-text-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search canon..."
            className="flex-1 bg-transparent outline-none text-xs text-text-primary placeholder:text-text-tertiary"
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
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-text-secondary hover:text-text-primary hover:bg-white/40 transition-all duration-200 group"
              >
                <Icon size={15} className="text-text-tertiary group-hover:text-text-primary transition-colors" />
                <span className="flex-1 text-left text-xs font-medium">{label}</span>
                <span className="text-[10px] text-text-tertiary">{typeEntries.length}</span>
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
                        'w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all duration-150',
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
                  className="ml-3 w-[calc(100%-12px)] flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-tertiary hover:text-text-primary hover:bg-white/30 transition-all"
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
        <div className="text-[10px] text-text-tertiary text-center">
          {projectEntries.length} canon {projectEntries.length === 1 ? 'entry' : 'entries'}
        </div>
      </div>
    </>
  );
}

// ========== CHAPTER SIDEBAR (Context-Aware Toolkit) ==========

function ChapterSidebar({ projectId, chapterId }: { projectId: string; chapterId: string }) {
  const { chapters, updateChapter } = useStore();
  const { entries } = useCanonStore();
  const [activeSection, setActiveSection] = useState<'premise' | 'generate' | 'artifacts'>('premise');
  const [writingMode, setWritingMode] = useState<WritingMode>('draft');
  const [generating, setGenerating] = useState<string | null>(null);

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

  return (
    <>
      {/* Chapter breadcrumb */}
      <div className="p-3 border-b border-white/20">
        <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-1 mb-2">
          Ch. {chapter.number} · {chapter.title}
        </div>
        {/* Section tabs */}
        <div className="flex gap-0.5 glass-pill p-0.5 rounded-xl">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-all',
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
              <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Purpose</label>
              <textarea
                value={chapter.premise.purpose}
                onChange={(e) => updatePremise('purpose', e.target.value)}
                placeholder="What is this chapter's role?"
                rows={3}
                className="w-full mt-1 px-3 py-2 rounded-lg glass-input text-xs leading-relaxed resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">What Changes</label>
              <textarea
                value={chapter.premise.changes}
                onChange={(e) => updatePremise('changes', e.target.value)}
                placeholder="How is the world different after?"
                rows={2}
                className="w-full mt-1 px-3 py-2 rounded-lg glass-input text-xs leading-relaxed resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Emotional Beat</label>
              <input
                type="text"
                value={chapter.premise.emotionalBeat}
                onChange={(e) => updatePremise('emotionalBeat', e.target.value)}
                placeholder="e.g., Grief giving way to wonder"
                className="w-full mt-1 px-3 py-2 rounded-lg glass-input text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Constraints</label>
              <textarea
                value={chapter.premise.constraints.join('\n')}
                onChange={(e) => updatePremise('constraints', e.target.value.split('\n').filter(Boolean))}
                placeholder="What must NOT happen (one per line)"
                rows={3}
                className="w-full mt-1 px-3 py-2 rounded-lg glass-input text-xs leading-relaxed resize-none"
              />
            </div>
          </div>
        )}

        {/* GENERATE SECTION */}
        {activeSection === 'generate' && (
          <div className="space-y-4 animate-fade-in">
            {/* Writing Mode */}
            <div>
              <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">Mode</label>
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
                      'p-2 rounded-xl text-left transition-all',
                      writingMode === mode
                        ? 'bg-text-primary text-text-inverse shadow-sm'
                        : 'glass-pill text-text-secondary hover:bg-white/60'
                    )}
                  >
                    <div className="text-[11px] font-medium">{label}</div>
                    <div className={cn('text-[9px]', writingMode === mode ? 'text-white/60' : 'text-text-tertiary')}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Generation Type */}
            <div>
              <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2 block">Generate</label>
              <div className="space-y-1.5">
                {([
                  { label: 'Full Chapter', icon: FileText, desc: 'Complete prose from premise', action: 'generate-chapter-full' as const },
                  { label: 'Scene Outline', icon: Wand2, desc: 'Structural breakdown', action: 'generate-chapter-outline' as const },
                  { label: 'Dialogue First', icon: MessageSquare, desc: 'Start with conversations', action: 'generate-dialogue' as const },
                  { label: 'Action Skeleton', icon: Swords, desc: 'Plot beats and movement', action: 'generate-action-skeleton' as const },
                ]).map(({ label, icon: Icon, desc, action }) => (
                  <button
                    key={label}
                    disabled={generating !== null}
                    onClick={() => {
                      setGenerating(action);
                      
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

                      // Log the prompt (dev only — will be replaced with actual API call)
                      console.log('=== GENERATION PROMPT ===');
                      console.log(prompt);
                      console.log('=== END PROMPT ===');
                      console.log(`Model: ${settings.ai.preferredModel}, Temperature: ${settings.ai.temperature}`);

                      // Simulate generation delay — replace with real API call
                      setTimeout(() => {
                        updateChapter(chapter.id, {
                          prose: `[Generation pending — API integration required]\n\nPrompt built with:\n• Writing style: ${settings.writingStyle.emDashEnabled ? 'em dashes ON' : 'no em dashes'}, ${settings.writingStyle.oxfordComma ? 'Oxford comma' : 'no Oxford comma'}, ${settings.writingStyle.paragraphLength} paragraphs\n• Tone: light/dark ${project.narrativeControls.toneMood.lightDark}%, pacing: ${project.narrativeControls.pacing}\n• Mode: ${writingMode}\n• Canon: ${projectCanon.length} entries included\n• Model: ${settings.ai.preferredModel}, temp: ${settings.ai.temperature}\n• Type: ${label}`,
                          status: 'draft-generated',
                          aiIntentMetadata: {
                            model: settings.ai.preferredModel,
                            role: 'architect',
                            prompt: prompt.slice(0, 500) + '...', // Store truncated prompt for reference
                            generatedAt: new Date().toISOString(),
                          },
                          updatedAt: new Date().toISOString(),
                        });
                        setGenerating(null);
                      }, 2000);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl glass-pill hover:bg-white/60 active:scale-[0.98] transition-all text-left group",
                      generating === action && "bg-white/60"
                    )}
                  >
                    {generating === action ? (
                      <Loader2 size={15} className="text-text-primary animate-spin flex-shrink-0" />
                    ) : (
                      <Icon size={15} className="text-text-tertiary group-hover:text-text-primary transition-colors flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium">{generating === action ? 'Generating...' : label}</div>
                      <div className="text-[9px] text-text-tertiary">{desc}</div>
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
                        <Icon size={11} />
                        {label}
                      </div>
                      <div className="space-y-1">
                        {typeEntries.map(entry => (
                          <button
                            key={entry.id}
                            onClick={() => useCanonStore.getState().setActiveEntry(entry.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg glass-pill hover:bg-white/60 transition-all text-left"
                          >
                            <span className="text-xs font-medium truncate">{entry.name}</span>
                            {entry.description && (
                              <span className="text-[9px] text-text-tertiary truncate flex-1">{entry.description.slice(0, 40)}...</span>
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
  const { leftSidebarOpen, getActiveProject, activeChapterId } = useStore();
  const project = getActiveProject();
  
  if (!leftSidebarOpen || !project) return null;

  return (
    <aside className="w-72 h-full glass-subtle flex flex-col animate-fade-in border-r-0">
      {activeChapterId ? (
        <ChapterSidebar projectId={project.id} chapterId={activeChapterId} />
      ) : (
        <ProjectSidebar projectId={project.id} />
      )}
    </aside>
  );
}
